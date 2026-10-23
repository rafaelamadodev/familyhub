import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { db } from "../../db.js";
import { decryptToken, encryptToken } from "./google-crypto.js";

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};
const tokenEndpoint = "https://oauth2.googleapis.com/token";

export async function accessToken(familyId: string) {
  const connection = await db.googleCalendarConnection.findUnique({ where: { familyId } });
  if (!connection) throw new Error("Google Calendar is not connected");
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000)
    return { connection, token: decryptToken(connection.accessTokenEncrypted) };

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google Calendar OAuth is not configured");
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptToken(connection.refreshTokenEncrypted),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Google access token refresh failed");
  const result = (await response.json()) as GoogleTokenResponse;
  const updated = await db.googleCalendarConnection.update({
    where: { familyId },
    data: {
      accessTokenEncrypted: encryptToken(result.access_token),
      ...(result.refresh_token ? { refreshTokenEncrypted: encryptToken(result.refresh_token) } : {}),
      accessTokenExpiresAt: new Date(Date.now() + result.expires_in * 1000),
    },
  });
  return { connection: updated, token: result.access_token };
}

export async function syncGoogleEvent(eventId: string) {
  const event = await db.familyEvent.findUnique({
    where: { id: eventId },
    include: { family: { include: { googleCalendarConnection: true } } },
  });
  if (!event) return;
  const connection = event.family.googleCalendarConnection;
  if (!connection) {
    await db.familyEvent.update({
      where: { id: event.id },
      data: {
        googleCalendarId: null,
        googleEventId: null,
        googleSyncStatus: "NOT_LINKED",
        googleSyncedAt: null,
      },
    });
    return;
  }
  await db.familyEvent.update({ where: { id: event.id }, data: { googleSyncStatus: "PENDING" } });
  try {
    const { token } = await accessToken(event.familyId);
    const calendarId = connection.calendarId;
    const googleId =
      event.googleEventId ??
      createHash("sha256").update(`${event.familyId}:${event.id}`).digest("hex").slice(0, 32);
    const collection = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const endpoint = `${collection}/${googleId}`;
    if (event.status === "CANCELLED") {
      if (event.googleEventId) {
        const response = await fetch(endpoint, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok && response.status !== 404 && response.status !== 410)
          throw new Error("Google Calendar event removal failed");
      }
      await db.familyEvent.update({
        where: { id: event.id },
        data: {
          googleCalendarId: calendarId,
          googleEventId: event.googleEventId,
          googleSyncStatus: "REMOVED",
          googleSyncedAt: new Date(),
        },
      });
      return;
    }

    const startDate = event.allDay && event.dateOnly ? event.dateOnly : null;
    const start = startDate
      ? { date: startDate }
      : { dateTime: event.startsAt!.toISOString(), timeZone: event.family.timezone };
    const end = startDate
      ? { date: DateTime.fromISO(startDate, { zone: "UTC" }).plus({ days: 1 }).toISODate()! }
      : {
          dateTime: new Date(event.startsAt!.getTime() + 60 * 60_000).toISOString(),
          timeZone: event.family.timezone,
        };
    const body = {
      id: googleId,
      summary: event.title,
      ...(event.description ? { description: event.description } : {}),
      ...(event.location ? { location: event.location } : {}),
      start,
      end,
    };
    const response = await fetch(event.googleEventId ? endpoint : collection, {
      method: event.googleEventId ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok && response.status === 409 && !event.googleEventId) {
      const retry = await fetch(endpoint, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      if (!retry.ok) throw new Error("Google Calendar event sync failed");
    } else if (!response.ok && response.status === 404 && event.googleEventId) {
      const recreated = await fetch(collection, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      if (!recreated.ok) throw new Error("Google Calendar event sync failed");
    } else if (!response.ok) throw new Error("Google Calendar event sync failed");
    await db.familyEvent.update({
      where: { id: event.id },
      data: {
        googleCalendarId: calendarId,
        googleEventId: googleId,
        googleSyncStatus: "SYNCED",
        googleSyncedAt: new Date(),
      },
    });
  } catch {
    await db.familyEvent.update({ where: { id: event.id }, data: { googleSyncStatus: "ERROR" } });
  }
}

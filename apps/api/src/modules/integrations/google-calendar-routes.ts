import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db.js";
import { requireUser } from "../../plugins/auth.js";
import { administrator, audit, familyQuery, HttpError } from "../../shared/domain.js";
import { encryptToken, hashOAuthState } from "./google-crypto.js";
import { accessToken, syncGoogleEvent } from "./google-calendar-service.js";

const oauthScopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const configured = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI &&
    (process.env.INTEGRATION_ENCRYPTION_KEY?.length ?? 0) >= 32,
  );
const callbackUrl = () => process.env.GOOGLE_REDIRECT_URI!;
const appUrl = () => process.env.APP_URL ?? "http://localhost:5173";
const allowedWebOrigins = () =>
  (process.env.WEB_ORIGIN ?? "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim());
const returnOriginFromState = (state?: string) => {
  try {
    const encoded = state?.split(".")[1];
    const origin = encoded ? Buffer.from(encoded, "base64url").toString() : "";
    return allowedWebOrigins().includes(origin) ? origin : appUrl();
  } catch {
    return appUrl();
  }
};
const fetchGoogle = async (url: string, token: string, init?: RequestInit) =>
  fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
    signal: AbortSignal.timeout(12_000),
  });

export async function registerGoogleCalendarRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/google-calendar", async (request) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    await administrator(user.id, familyId);
    const connection = await db.googleCalendarConnection.findUnique({ where: { familyId } });
    return {
      configured: configured(),
      connected: Boolean(connection),
      calendarId: connection?.calendarId ?? null,
      calendarSummary: connection?.calendarSummary ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

  app.get("/api/v1/integrations/google-calendar/connect", async (request, reply) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    await administrator(user.id, familyId);
    if (!configured())
      throw new HttpError(503, "A integração ainda não foi configurada pelo administrador do sistema");
    let returnOrigin = appUrl();
    try {
      const referer = request.headers.referer;
      if (referer) {
        const origin = new URL(referer).origin;
        if (allowedWebOrigins().includes(origin)) returnOrigin = origin;
      }
    } catch {
      // Ignore malformed referrers and use the configured app URL.
    }
    const state = `${randomBytes(32).toString("base64url")}.${Buffer.from(returnOrigin).toString("base64url")}`;
    await db.googleOAuthState.create({
      data: {
        stateHash: hashOAuthState(state),
        userId: user.id,
        familyId,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: oauthScopes.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    }).toString();
    return reply.redirect(target.toString());
  });

  app.get("/api/v1/integrations/google-calendar/callback", async (request, reply) => {
    const query = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(request.query);
    const redirect = (result: string, familyId?: string, origin?: string) => {
      const target = new URL(origin ?? appUrl());
      target.searchParams.set("googleCalendar", result);
      if (familyId) target.searchParams.set("familyId", familyId);
      return reply.redirect(target.toString());
    };
    const state = query.state
      ? await db.googleOAuthState.findUnique({ where: { stateHash: hashOAuthState(query.state) } })
      : null;
    if (query.error) {
      if (state && !state.usedAt && state.expiresAt > new Date()) {
        await db.googleOAuthState.updateMany({
          where: { id: state.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
      }
      return redirect("denied", state?.familyId, returnOriginFromState(query.state));
    }
    if (!query.code || !query.state || !configured()) return redirect("failed");
    if (!state || state.usedAt || state.expiresAt <= new Date()) return redirect("invalid-state");
    const consumed = await db.googleOAuthState.updateMany({
      where: { id: state.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!consumed.count) return redirect("invalid-state");
    try {
      await administrator(state.userId, state.familyId);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: callbackUrl(),
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!tokenResponse.ok) return redirect("failed", state.familyId, returnOriginFromState(query.state));
      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope?: string;
      };
      const previous = await db.googleCalendarConnection.findUnique({ where: { familyId: state.familyId } });
      const refresh = tokens.refresh_token ?? (previous ? undefined : null);
      if (!refresh) return redirect("failed", state.familyId, returnOriginFromState(query.state));
      const connection = await db.googleCalendarConnection.upsert({
        where: { familyId: state.familyId },
        create: {
          familyId: state.familyId,
          connectedById: state.userId,
          accessTokenEncrypted: encryptToken(tokens.access_token),
          refreshTokenEncrypted: encryptToken(refresh),
          accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: (tokens.scope ?? oauthScopes.join(" ")).split(" "),
        },
        update: {
          connectedById: state.userId,
          accessTokenEncrypted: encryptToken(tokens.access_token),
          ...(refresh ? { refreshTokenEncrypted: encryptToken(refresh) } : {}),
          accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: (tokens.scope ?? oauthScopes.join(" ")).split(" "),
        },
      });
      await db.$transaction(async (tx) => {
        await audit(
          tx,
          state.userId,
          state.familyId,
          "GOOGLE_CALENDAR_CONNECTED",
          "GoogleCalendarConnection",
          connection.id,
        );
      });
      return redirect("connected", state.familyId, returnOriginFromState(query.state));
    } catch {
      return redirect("failed", state.familyId, returnOriginFromState(query.state));
    }
  });

  app.get("/api/v1/integrations/google-calendar/calendars", async (request) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    await administrator(user.id, familyId);
    const { token } = await accessToken(familyId);
    const response = await fetchGoogle(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=100",
      token,
    );
    if (!response.ok) throw new HttpError(502, "Não foi possível carregar os calendários da conta Google");
    const payload = (await response.json()) as {
      items?: { id: string; summary: string; primary?: boolean; accessRole: string }[];
    };
    return (payload.items ?? [])
      .filter((item) => item.accessRole === "owner" || item.accessRole === "writer")
      .map((item) => ({
        id: item.id,
        summary: item.summary,
        primary: Boolean(item.primary),
      }));
  });

  app.put("/api/v1/integrations/google-calendar/calendar", async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({ familyId: z.string().uuid(), calendarId: z.string().min(1).max(500) })
      .parse(request.body);
    await administrator(user.id, body.familyId);
    const { token } = await accessToken(body.familyId);
    const response = await fetchGoogle(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=100",
      token,
    );
    if (!response.ok) throw new HttpError(502, "Não foi possível validar o calendário da conta Google");
    const calendars = (await response.json()) as {
      items?: { id: string; summary: string; accessRole: string }[];
    };
    const calendar = calendars.items?.find(
      (item) => item.id === body.calendarId && ["owner", "writer"].includes(item.accessRole),
    );
    if (!calendar) throw new HttpError(400, "Este calendário não está disponível para a conta conectada");
    const previous = await db.googleCalendarConnection.findUniqueOrThrow({
      where: { familyId: body.familyId },
    });
    if (previous.calendarId !== calendar.id) {
      const linked = await db.familyEvent.findMany({
        where: { familyId: body.familyId, googleEventId: { not: null } },
        select: { id: true, googleEventId: true },
      });
      for (const event of linked) {
        const removed = await fetchGoogle(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(previous.calendarId)}/events/${event.googleEventId}`,
          token,
          { method: "DELETE" },
        );
        if (!removed.ok && removed.status !== 404 && removed.status !== 410)
          throw new HttpError(502, "Não foi possível mover os eventos do calendário anterior");
      }
      await db.$transaction(async (tx) => {
        await tx.googleCalendarConnection.update({
          where: { familyId: body.familyId },
          data: { calendarId: calendar.id, calendarSummary: calendar.summary },
        });
        await tx.familyEvent.updateMany({
          where: { familyId: body.familyId },
          data: {
            googleCalendarId: null,
            googleEventId: null,
            googleSyncStatus: "PENDING",
            googleSyncedAt: null,
          },
        });
      });
    } else {
      await db.googleCalendarConnection.update({
        where: { familyId: body.familyId },
        data: { calendarSummary: calendar.summary },
      });
    }
    return { calendarId: calendar.id, calendarSummary: calendar.summary };
  });

  app.post("/api/v1/integrations/google-calendar/sync", async (request) => {
    const user = await requireUser(request);
    const { familyId } = z.object({ familyId: z.string().uuid() }).parse(request.body);
    await administrator(user.id, familyId);
    const events = await db.familyEvent.findMany({
      where: { familyId },
      select: { id: true },
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    for (const event of events) await syncGoogleEvent(event.id);
    const [synced, failed] = await Promise.all([
      db.familyEvent.count({ where: { familyId, googleSyncStatus: "SYNCED" } }),
      db.familyEvent.count({ where: { familyId, googleSyncStatus: "ERROR" } }),
    ]);
    return { processed: events.length, synced, failed };
  });

  app.delete("/api/v1/integrations/google-calendar", async (request) => {
    const user = await requireUser(request);
    const { familyId } = familyQuery.parse(request.query);
    await administrator(user.id, familyId);
    const connection = await db.googleCalendarConnection.findUnique({ where: { familyId } });
    await db.$transaction(async (tx) => {
      await tx.familyEvent.updateMany({
        where: { familyId },
        data: {
          googleCalendarId: null,
          googleEventId: null,
          googleSyncStatus: "NOT_LINKED",
          googleSyncedAt: null,
        },
      });
      await tx.googleCalendarConnection.deleteMany({ where: { familyId } });
      await audit(
        tx,
        user.id,
        familyId,
        "GOOGLE_CALENDAR_DISCONNECTED",
        "GoogleCalendarConnection",
        connection?.id,
      );
    });
    return { disconnected: true, externalEventsRetained: true };
  });
}

import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../../generated/prisma/index.js";
import { db } from "../../db.js";
import { registerAuthPlugin, requireUser, publicUser } from "../../plugins/auth.js";
import { hashSecret, tokenHash, verifySecret } from "../../shared/security/password.js";
import { limit } from "../../shared/security/rate-limit.js";
import { HttpError, audit, idParams, verified } from "../../shared/domain.js";
import { decryptTotp, encryptTotp, newTotpSecret, verifyTotp } from "../../shared/security/totp.js";
import { hashOAuthState } from "../integrations/google-crypto.js";

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8).max(128);
const credentials = z.object({ email, password });
const secretSchema = z.object({ token: z.string().min(20).max(256) });
const generic = { message: "Se os dados informados permitirem, você receberá as instruções por e-mail." };
const webUrl = () => (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
const googleAuthRedirect = () =>
  process.env.GOOGLE_AUTH_REDIRECT_URI ??
  `${process.env.APP_URL ?? "http://localhost:3333"}/api/v1/auth/google/callback`;
const googleAuthConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && googleAuthRedirect());
const webSession = (
  reply: { setCookie: (name: string, value: string, options: Record<string, unknown>) => unknown },
  accessToken: string,
) =>
  reply.setCookie("familyhub_access", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });

async function issueSession(
  tx: Prisma.TransactionClient,
  app: FastifyInstance,
  userId: string,
  device?: string,
) {
  const refresh = randomBytes(48).toString("base64url");
  const session = await tx.session.create({
    data: {
      userId,
      tokenHash: tokenHash(refresh),
      device: device?.slice(0, 300),
      expiresAt: new Date(Date.now() + 30 * 86400_000),
    },
  });
  return { accessToken: app.jwt.sign({ sub: userId, sid: session.id }), refreshToken: refresh };
}
export async function verificationMail(tx: Prisma.TransactionClient, user: { id: string; email: string }) {
  const token = randomBytes(32).toString("base64url");
  await tx.emailVerificationToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await tx.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 86400_000) },
  });
  await tx.mailJob.create({
    data: {
      recipient: user.email,
      subject: "Verifique seu e-mail no FamilyHub",
      text: "Confirme seu e-mail em até 24 horas: " + webUrl() + "/#verify=" + token,
    },
  });
}
export async function registerAuthRoutes(app: FastifyInstance) {
  await registerAuthPlugin(app);
  app.get("/api/v1/auth/google", async (request, reply) => {
    if (!googleAuthConfigured()) throw new HttpError(503, "Login com Google ainda não foi configurado");
    const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173,http://localhost:5174")
      .split(",")
      .map((item) => item.trim());
    let returnUrl = webUrl();
    try {
      const origin = request.headers.referer ? new URL(request.headers.referer).origin : "";
      if (allowedOrigins.includes(origin)) returnUrl = origin;
    } catch {
      // Use APP_URL when the browser does not provide a valid referrer.
    }
    const state = randomBytes(32).toString("base64url");
    try {
      await db.googleAuthState.create({
        data: { stateHash: hashOAuthState(state), returnUrl, expiresAt: new Date(Date.now() + 10 * 60_000) },
      });
    } catch (error) {
      // Do not let a database outage surface as Vercel's opaque
      // FUNCTION_INVOCATION_FAILED page. Keep the reason out of the client,
      // but preserve a short code in the server logs for diagnosis.
      app.log.error(
        { code: (error as { code?: string }).code ?? "DB_ERROR" },
        "Falha ao iniciar login Google",
      );
      throw new HttpError(503, "O serviço de login está temporariamente indisponível");
    }
    const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    target.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: googleAuthRedirect(),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    return reply.redirect(target.toString());
  });
  app.get("/api/v1/auth/google/callback", async (request, reply) => {
    const query = z
      .object({ code: z.string().optional(), state: z.string().optional(), error: z.string().optional() })
      .parse(request.query);
    const state = query.state
      ? await db.googleAuthState.findUnique({ where: { stateHash: hashOAuthState(query.state) } })
      : null;
    const redirect = (result: string, target = state?.returnUrl ?? webUrl()) => {
      const url = new URL(target);
      url.searchParams.set("googleAuth", result);
      return reply.redirect(url.toString());
    };
    if (query.error) {
      if (state)
        await db.googleAuthState.updateMany({
          where: { id: state.id, usedAt: null },
          data: { usedAt: new Date() },
        });
      return redirect("denied");
    }
    if (
      !query.code ||
      !query.state ||
      !state ||
      state.usedAt ||
      state.expiresAt <= new Date() ||
      !googleAuthConfigured()
    )
      return redirect("failed");
    const consumed = await db.googleAuthState.updateMany({
      where: { id: state.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!consumed.count) return redirect("invalid-state");
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: googleAuthRedirect(),
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!tokenResponse.ok) return redirect("failed");
      const tokens = (await tokenResponse.json()) as { access_token?: string };
      if (!tokens.access_token) return redirect("failed");
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (!profileResponse.ok) return redirect("failed");
      const profile = z
        .object({
          sub: z.string().min(1),
          email: email,
          email_verified: z.boolean(),
          name: z.string().min(1).max(120),
          picture: z.string().url().optional(),
        })
        .parse(await profileResponse.json());
      if (!profile.email_verified) return redirect("unverified-email");
      const result = await db.$transaction(async (tx) => {
        let user = await tx.user.findUnique({ where: { googleSubject: profile.sub } });
        if (!user) user = await tx.user.findUnique({ where: { email: profile.email } });
        if (user) {
          user = await tx.user.update({
            where: { id: user.id },
            data: {
              googleSubject: profile.sub,
              emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
              ...(user.photoUrl ? {} : { photoUrl: profile.picture ?? null }),
            },
          });
        } else {
          user = await tx.user.create({
            data: {
              name: profile.name,
              email: profile.email,
              googleSubject: profile.sub,
              passwordHash: await hashSecret(randomBytes(48).toString("base64url")),
              emailVerifiedAt: new Date(),
              photoUrl: profile.picture ?? null,
            },
          });
        }
        const session = await issueSession(tx, app, user.id, request.headers["user-agent"]);
        await audit(tx, user.id, null, "GOOGLE_LOGIN", "Session");
        return { ...session, user: publicUser(user) };
      });
      webSession(reply, result.accessToken);
      reply.setCookie("familyhub_refresh", result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/v1/auth",
        maxAge: 30 * 86400,
      });
      webCsrf(request, reply);
      return redirect("success");
    } catch {
      return redirect("failed");
    }
  });
  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = credentials.extend({ name: z.string().trim().min(2).max(120) }).parse(request.body);
    await limit(request, "register", body.email, 5);
    const exists = await db.user.findUnique({ where: { email: body.email } });
    const passwordHash = await hashSecret(body.password);
    if (!exists) {
      try {
        await db.$transaction(async (tx) => {
          const user = await tx.user.create({ data: { name: body.name, email: body.email, passwordHash } });
          await verificationMail(tx, user);
          await audit(tx, user.id, null, "REGISTER", "User", user.id);
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    return reply.code(202).send(generic);
  });
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = credentials.extend({ otp: z.string().length(6).optional() }).parse(request.body);
    await limit(request, "login", body.email);
    const user = await db.user.findUnique({ where: { email: body.email } });
    const valid = user
      ? await verifySecret(body.password, user.passwordHash)
      : (await hashSecret(body.password), false);
    if (!user || !valid) throw new HttpError(401, "E-mail ou senha inválidos");
    if (user.mfaEnabled && !body.otp) return reply.code(202).send({ mfaRequired: true });
    if (
      user.mfaEnabled &&
      (!body.otp || !user.mfaSecretEncrypted || !verifyTotp(decryptTotp(user.mfaSecretEncrypted), body.otp))
    )
      throw new HttpError(401, "E-mail, senha ou código de autenticação inválidos");
    const result = await db.$transaction(async (tx) => {
      const session = await issueSession(tx, app, user.id, request.headers["user-agent"]);
      await audit(tx, user.id, null, "LOGIN", "Session");
      return { ...session, user: publicUser(user) };
    });
    if (request.headers["x-client-type"] === "mobile" || !request.headers.origin) return result;
    webSession(reply, result.accessToken);
    reply.setCookie("familyhub_refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: 30 * 86400,
    });
    webCsrf(request, reply);
    return { user: result.user };
  });
  app.post("/api/v1/auth/refresh", async (request, reply) => {
    await limit(request, "refresh", undefined, 60);
    const body = z.object({ refreshToken: z.string().min(20).max(256).optional() }).parse(request.body ?? {});
    if (
      !body.refreshToken &&
      request.cookies?.familyhub_refresh &&
      request.headers["x-csrf-token"] !== request.cookies.familyhub_csrf
    )
      throw new HttpError(403, "Validação CSRF inválida");
    const refreshToken = body.refreshToken ?? request.cookies?.familyhub_refresh;
    if (!refreshToken) throw new HttpError(401, "Sessão expirada");
    const result = await db.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { tokenHash: tokenHash(refreshToken) },
        include: { user: true },
      });
      if (!session) throw new HttpError(401, "Sessão expirada");
      const consumed = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (!consumed.count) throw new HttpError(401, "Sessão expirada");
      return {
        ...(await issueSession(tx, app, session.userId, request.headers["user-agent"])),
        user: publicUser(session.user),
      };
    });
    if (body.refreshToken) return result;
    webSession(reply, result.accessToken);
    reply.setCookie("familyhub_refresh", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: 30 * 86400,
    });
    webCsrf(request, reply);
    return { user: result.user };
  });
  app.post("/api/v1/auth/forgot-password", async (request) => {
    const body = z.object({ email }).parse(request.body);
    await limit(request, "recovery", body.email, 5);
    const user = await db.user.findUnique({ where: { email: body.email } });
    if (user)
      await db.$transaction(async (tx) => {
        const token = randomBytes(32).toString("base64url");
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: tokenHash(token),
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        });
        await tx.mailJob.create({
          data: {
            recipient: user.email,
            subject: "Redefinir senha do FamilyHub",
            text: "Redefina sua senha em até 30 minutos: " + webUrl() + "/#reset=" + token,
          },
        });
      });
    return generic;
  });
  app.post("/api/v1/auth/reset-password", async (request) => {
    await limit(request, "reset", undefined, 10);
    const body = secretSchema.extend({ password }).parse(request.body);
    const passwordHash = await hashSecret(body.password);
    await db.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(body.token) } });
      if (!token) throw new HttpError(400, "Link inválido ou expirado");
      const used = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!used.count) throw new HttpError(400, "Link inválido ou expirado");
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: token.userId }, data: { revokedAt: new Date() } });
      await audit(tx, token.userId, null, "PASSWORD_RESET", "User", token.userId);
    });
    return { message: "Senha atualizada. Entre novamente." };
  });
  app.post("/api/v1/auth/verify-email", async (request) => {
    await limit(request, "verify", undefined, 20);
    const body = secretSchema.parse(request.body);
    await db.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash: tokenHash(body.token) },
      });
      if (!token) throw new HttpError(400, "Link inválido ou expirado");
      const used = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!used.count) throw new HttpError(400, "Link inválido ou expirado");
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
      await audit(tx, token.userId, null, "EMAIL_VERIFIED", "User", token.userId);
    });
    return { message: "E-mail verificado. Você já pode continuar." };
  });
  app.post("/api/v1/auth/resend-verification", async (request) => {
    const user = await requireUser(request);
    await limit(request, "resend", user.email, 3);
    if (!user.emailVerifiedAt) await db.$transaction((tx) => verificationMail(tx, user));
    return generic;
  });
  app.post("/api/v1/auth/mfa/setup", async (request) => {
    const user = await requireUser(request);
    verified(user);
    if (user.mfaEnabled) throw new HttpError(409, "A autenticação em duas etapas já está ativa");
    const secret = newTotpSecret();
    const label = encodeURIComponent("FamilyHub:" + user.email);
    return {
      secret,
      issuer: "FamilyHub",
      otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=FamilyHub&algorithm=SHA1&digits=6&period=30`,
    };
  });
  app.get("/api/v1/auth/mfa", async (request) => {
    const user = await requireUser(request);
    return { enabled: user.mfaEnabled };
  });
  app.post("/api/v1/auth/mfa/enable", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const body = z
      .object({ secret: z.string().regex(/^[A-Z2-7]{32}$/), code: z.string().length(6) })
      .strict()
      .parse(request.body);
    if (!verifyTotp(body.secret, body.code)) throw new HttpError(400, "Código de autenticação inválido");
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { mfaSecretEncrypted: encryptTotp(body.secret), mfaEnabled: true },
      });
      await audit(tx, user.id, null, "MFA_ENABLED", "User", user.id);
    });
    return { enabled: true, message: "Autenticação em duas etapas ativada." };
  });
  app.post("/api/v1/auth/mfa/disable", async (request) => {
    const user = await requireUser(request);
    verified(user);
    const body = z
      .object({ password, code: z.string().length(6) })
      .strict()
      .parse(request.body);
    if (
      !user.mfaEnabled ||
      !user.mfaSecretEncrypted ||
      !(await verifySecret(body.password, user.passwordHash)) ||
      !verifyTotp(decryptTotp(user.mfaSecretEncrypted), body.code)
    )
      throw new HttpError(403, "Não foi possível validar a autenticação");
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { mfaSecretEncrypted: null, mfaEnabled: false } });
      await audit(tx, user.id, null, "MFA_DISABLED", "User", user.id);
    });
    return { enabled: false, message: "Autenticação em duas etapas desativada." };
  });
  app.get("/api/v1/auth/sessions", async (request) => {
    const user = await requireUser(request);
    const sessions = await db.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, device: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    return sessions.map((session) => ({ ...session, current: session.id === request.user.sid }));
  });
  app.delete("/api/v1/auth/sessions/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = idParams.parse(request.params);
    await db.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { id, userId: user.id },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw new HttpError(404, "Sessão não encontrada");
      await audit(tx, user.id, null, "SESSION_REVOKED", "Session", id);
    });
    return { message: "Sessão encerrada" };
  });
  for (const global of [false, true])
    app.post(global ? "/api/v1/auth/logout-all" : "/api/v1/auth/logout", async (request, reply) => {
      const user = await requireUser(request);
      await db.$transaction(async (tx) => {
        await tx.session.updateMany({
          where: { userId: user.id, ...(global ? {} : { id: request.user.sid }) },
          data: { revokedAt: new Date() },
        });
        await audit(tx, user.id, null, global ? "LOGOUT_ALL" : "LOGOUT", "Session");
      });
      reply
        .clearCookie("familyhub_access", { path: "/" })
        .clearCookie("familyhub_csrf", { path: "/" })
        .clearCookie("familyhub_refresh", { path: "/api/v1/auth" });
      return { message: "Sessão encerrada" };
    });
}

function webCsrf(
  request: { headers: Record<string, string | string[] | undefined> },
  reply: { setCookie: (name: string, value: string, options: Record<string, unknown>) => unknown },
) {
  const existing = request.headers.cookie
    ?.toString()
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("familyhub_csrf="))
    ?.slice("familyhub_csrf=".length);
  const token = existing || randomBytes(24).toString("base64url");
  reply.setCookie("familyhub_csrf", token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return token;
}

import { z } from "zod";
export const API_URL = import.meta.env.VITE_API_URL ?? "";
export const googleAuthUrl = `${API_URL}/api/v1/auth/google`;
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  photoUrl: z.string().nullable(),
  emailVerified: z.boolean(),
});
export type User = z.infer<typeof userSchema>;
const authSchema = z.object({ user: userSchema });
const loginSchema = z.union([authSchema, z.object({ mfaRequired: z.literal(true) })]);
let token: string | null = null;
export function setToken(value: string | null) {
  token = value;
}
export function setSession(accessToken: string | null) {
  token = accessToken;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let refreshing: Promise<void> | null = null;
const csrf = () =>
  document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("familyhub_csrf="))
    ?.slice("familyhub_csrf=".length) ?? "";
async function refreshSession() {
  const response = await fetch(API_URL + "/api/v1/auth/refresh", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
    body: "{}",
  });
  if (!response.ok) throw new ApiError("Sessão expirada. Entre novamente.", 401);
  authSchema.parse(await response.json());
  setSession(null);
}
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  schema?: z.ZodType<T>,
  retry = true,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_URL + path, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(csrf() ? { "X-CSRF-Token": csrf() } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      navigator.onLine
        ? "API indisponível. Tente novamente."
        : "Você está offline. Reconecte-se para salvar.",
      0,
    );
  }
  if (response.status === 401 && retry && !path.includes("/auth/login")) {
    try {
      if (!refreshing)
        refreshing = refreshSession().finally(() => {
          refreshing = null;
        });
      await refreshing;
      return apiRequest(path, options, schema, false);
    } catch {
      setSession(null);
      window.dispatchEvent(new Event("familyhub:expired"));
      throw new ApiError("Sessão expirada. Entre novamente.", 401);
    }
  }
  if (!response.ok) {
    const message = (await response.json().catch(() => null))?.message as string | undefined;
    const friendlyMessage =
      message === "Requisição inválida"
        ? "Não foi possível processar esta solicitação. Confira os dados e tente novamente."
        : message === "Não foi possível concluir a operação"
          ? "Não conseguimos concluir agora. Tente novamente em instantes."
          : message || "Não conseguimos concluir agora. Tente novamente em instantes.";
    throw new ApiError(friendlyMessage, response.status);
  }
  const value =
    response.status === 204
      ? undefined
      : response.headers.get("content-type")?.includes("text/csv")
        ? await response.text()
        : await response.json();
  return schema ? schema.parse(value) : (value as T);
}
export const send = <T = unknown>(path: string, method: string, body?: unknown) =>
  apiRequest<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
export const api = {
  login: (body: { email: string; password: string; otp?: string }) =>
    apiRequest("/api/v1/auth/login", { method: "POST", body: JSON.stringify(body) }, loginSchema),
  register: (body: { name: string; email: string; password: string }) =>
    send<{ message: string }>("/api/v1/auth/register", "POST", body),
  me: () => apiRequest("/api/v1/me", {}, z.object({ user: userSchema })),
  updateProfile: (body: {
    name: string;
    email: string;
    photoUrl?: string | null;
    currentPassword?: string;
  }) =>
    apiRequest("/api/v1/me", { method: "PATCH", body: JSON.stringify(body) }, z.object({ user: userSchema })),
  updatePassword: (body: { currentPassword: string; newPassword: string }) =>
    send("/api/v1/me/password", "PATCH", body),
  logout: () => send("/api/v1/auth/logout", "POST"),
};

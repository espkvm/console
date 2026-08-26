/*
 * The session, as the device sees it.
 *
 * Nothing about the password lives in the browser: the device sets an
 * HttpOnly cookie that this code cannot read, and every answer about who is
 * logged in comes from asking the device rather than from remembering.
 */
import { CONSOLE_HEADER } from "./device";

export interface SessionState {
  /** The device requires a login at all. */
  required: boolean;
  authenticated: boolean;
  /** Logged in with the default password; nothing else may proceed. */
  mustChange: boolean;
  user: string;
  /** A viewing token exists. What it is, the device will not say twice. */
  viewToken?: boolean;
}

/*
 * The viewing token: a credential for a dashboard, and for nothing else.
 *
 * It opens the MJPEG stream, one frame and the capture's figures - enough for a
 * camera card in Home Assistant - and no endpoint that can touch the target.
 * The device keeps only a hash, so the string comes back exactly once.
 */
export async function createViewToken(): Promise<string> {
  const body = await postJson("/api/v1/auth/token", {});
  const token = String(body.token ?? "");
  if (!token) throw new Error("the device did not return a token");
  return token;
}

export async function revokeViewToken(): Promise<void> {
  const res = await fetch("/api/v1/auth/token", {
    method: "DELETE",
    headers: CONSOLE_HEADER,
  });
  if (!res.ok) throw new Error(`revoke failed (${res.status})`);
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...CONSOLE_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(parsed.error ?? `request failed (${res.status})`);
  }
  return parsed as Record<string, unknown>;
}

export async function loadSession(): Promise<SessionState> {
  const res = await fetch("/api/v1/auth/session", { cache: "no-store" });
  if (!res.ok) throw new Error(`the device did not answer (${res.status})`);
  return (await res.json()) as SessionState;
}

/** @returns true when the password in use is the default and must be changed */
export async function login(user: string, password: string): Promise<boolean> {
  const body = await postJson("/api/v1/auth/login", { user, password });
  return Boolean(body.mustChange);
}

export async function logout(): Promise<void> {
  await postJson("/api/v1/auth/logout", {});
}

/** Changing the password ends every session, including this one. */
export async function changePassword(current: string, next: string): Promise<void> {
  await postJson("/api/v1/auth/password", { current, next });
}

/*
 * The session, as the device sees it.
 *
 * Nothing about the password lives in the browser: the device sets an
 * HttpOnly cookie that this code cannot read, and every answer about who is
 * logged in comes from asking the device rather than from remembering.
 */
import { CONSOLE_HEADER, noteSignedOut } from "./device";

export interface SessionState {
  /** The device requires a login at all. */
  required: boolean;
  authenticated: boolean;
  /** Logged in with the default password; nothing else may proceed. */
  mustChange: boolean;
  user: string;
  /** A viewing token exists. What it is, the device will not say twice. */
  viewToken?: boolean;
  /** Two-factor sign-in is on: a code from an authenticator app follows the password. */
  twoFactor?: boolean;
}

/** The password was right and the device wants the code from the app next. */
export class NeedCode extends Error {}

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
  if (res.status === 401) noteSignedOut();
  if (!res.ok) throw new Error(`revoke failed (${res.status})`);
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...CONSOLE_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as { error?: string; needCode?: boolean };
  if (!res.ok) {
    /* A 401 from login is a wrong password; from anything else, the session is gone. */
    if (res.status === 401 && url !== "/api/v1/auth/login") noteSignedOut();
    const message = parsed.error ?? `request failed (${res.status})`;
    throw parsed.needCode ? new NeedCode(message) : new Error(message);
  }
  return parsed as Record<string, unknown>;
}

export async function loadSession(): Promise<SessionState> {
  const res = await fetch("/api/v1/auth/session", { cache: "no-store" });
  if (!res.ok) throw new Error(`the device did not answer (${res.status})`);
  return (await res.json()) as SessionState;
}

/**
 * @returns true when the password in use is the default and must be changed
 * @throws NeedCode when two-factor sign-in is on and @p code is missing or wrong
 */
export async function login(user: string, password: string, code = ""): Promise<boolean> {
  /* The browser's time sets a device clock that has none (no NTP), and checks
     the code on a device that has no clock yet. */
  const now = Math.floor(Date.now() / 1000);
  const body = await postJson("/api/v1/auth/login", code ? { user, password, code, now } : { user, password, now });
  return Boolean(body.mustChange);
}

export interface TwoFactorSetup {
  /** The secret as base32, for typing into an app that cannot scan. */
  secret: string;
  uri: string;
  /** The QR code as rows of 0/1, qrSize by qrSize. */
  qrSize: number;
  qr: string;
}

export async function twoFactorBegin(): Promise<TwoFactorSetup> {
  return (await postJson("/api/v1/auth/2fa/begin", {})) as unknown as TwoFactorSetup;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** @returns the recovery codes, shown once */
export async function twoFactorEnable(password: string, code: string): Promise<string[]> {
  const body = await postJson("/api/v1/auth/2fa/enable", { password, code, now: nowSec() });
  return (body.recovery as string[]) ?? [];
}

export async function twoFactorDisable(password: string, code: string): Promise<void> {
  await postJson("/api/v1/auth/2fa/disable", { password, code, now: nowSec() });
}

/** New recovery codes; the old ones stop working. */
export async function twoFactorRecovery(password: string, code: string): Promise<string[]> {
  const body = await postJson("/api/v1/auth/2fa/recovery", { password, code, now: nowSec() });
  return (body.recovery as string[]) ?? [];
}

export async function logout(): Promise<void> {
  await postJson("/api/v1/auth/logout", {});
}

/** Changing the password ends every session, including this one. */
export async function changePassword(current: string, next: string): Promise<void> {
  await postJson("/api/v1/auth/password", { current, next });
}

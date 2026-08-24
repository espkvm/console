/*
 * Settings in a file: a copy before "Restore defaults", or a second box brought
 * up like the first. Passwords and private keys cannot be in it - the firmware
 * never serves them - and an import has to say so, or someone clones a config
 * and waits a week for a VPN that was never given its key.
 */

import type { Setting, Values } from "./device";

export const FILE_KIND = "espkvm-settings";
export const FILE_VERSION = 1;

/* What makes a device itself: two boxes with one hostname sign two certificates
   with the same subject and a browser trusts neither. Held back on import. */
export const IDENTITY_KEYS = ["net_hostname", "net_ip", "net_mask", "net_gw", "net_dns"];

export interface SettingsFile {
  kind: string;
  version: number;
  /** When it was taken, ISO 8601. */
  exported: string;
  /** Firmware that wrote it, e.g. "v.0.31.0". */
  firmware?: string;
  /** Board it came off, so a mismatch can be pointed out - pins are board-specific. */
  board?: string;
  /** Written into the file for whoever opens it in a text editor. */
  note: string;
  values: Values;
}

const NOTE =
  "ESP-KVM settings. No passwords and no private keys are in here - the device never " +
  "serves them - but this does describe a network: hostname and addresses, the MQTT " +
  "broker, and the VPN peer, meaning its endpoint and its public key. Treat it as you " +
  "would a router's config before posting it anywhere.";

/** Everything this device is willing to hand over, plus enough to read it later. */
export function buildFile(
  values: Values,
  schema: Setting[],
  meta: { firmware?: string; board?: string; now?: Date } = {},
): SettingsFile {
  const known = new Set(schema.filter((s) => !s.secret).map((s) => s.key));
  const out: Values = {};
  for (const key of Object.keys(values).sort()) {
    if (known.has(key)) out[key] = values[key];
  }
  return {
    kind: FILE_KIND,
    version: FILE_VERSION,
    exported: (meta.now ?? new Date()).toISOString(),
    firmware: meta.firmware,
    board: meta.board,
    note: NOTE,
    values: out,
  };
}

/** A name that says which box and which day, because these files pile up. */
export function fileName(board?: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const who = (board ?? "espkvm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${who || "espkvm"}-settings-${day}.json`;
}

/** Parse a file chosen by a person, and say plainly what is wrong with it. */
export function readFile(text: string): SettingsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("that file is not JSON");
  }
  const f = parsed as Partial<SettingsFile>;
  if (!f || typeof f !== "object" || f.kind !== FILE_KIND) {
    throw new Error("that is not an ESP-KVM settings file");
  }
  if (typeof f.version !== "number" || f.version > FILE_VERSION) {
    throw new Error("that file was written by a newer console");
  }
  if (!f.values || typeof f.values !== "object") throw new Error("that file has no settings in it");
  return f as SettingsFile;
}

export interface ImportPlan {
  file: SettingsFile;
  /** What would actually be written. */
  apply: Values;
  /** Held back as this device's identity. */
  identity: string[];
  /** In the file, unknown to this firmware - an older or a different build. */
  unknown: string[];
  /** Already set to that value. */
  same: string[];
  /** Secrets this device has, which no file can carry. */
  secrets: string[];
  /** The file came off another board, so pin settings may not fit. */
  otherBoard: boolean;
  /** What this device calls itself, for the mismatch line. */
  board?: string;
}

export function planImport(
  file: SettingsFile,
  schema: Setting[],
  current: Values,
  opts: { withIdentity?: boolean; board?: string } = {},
): ImportPlan {
  const byKey = new Map(schema.map((s) => [s.key, s]));
  const plan: ImportPlan = {
    file,
    apply: {},
    identity: [],
    unknown: [],
    same: [],
    secrets: schema.filter((s) => s.secret).map((s) => s.key),
    otherBoard: Boolean(file.board && opts.board && file.board !== opts.board),
    board: opts.board,
  };
  for (const [key, value] of Object.entries(file.values)) {
    const setting = byKey.get(key);
    if (!setting || setting.secret) {
      plan.unknown.push(key);
      continue;
    }
    if (!opts.withIdentity && IDENTITY_KEYS.includes(key)) {
      plan.identity.push(key);
      continue;
    }
    if (current[key] === value) {
      plan.same.push(key);
      continue;
    }
    plan.apply[key] = value;
  }
  return plan;
}

/** The report. Not "done" - what was applied, what was not, and what is missing. */
export function describePlan(plan: ImportPlan, applied: boolean): string[] {
  const n = Object.keys(plan.apply).length;
  const lines: string[] = [];
  lines.push(
    applied
      ? `${n} setting${n === 1 ? "" : "s"} applied.`
      : `${n} setting${n === 1 ? "" : "s"} would change.`,
  );
  if (plan.same.length) lines.push(`${plan.same.length} already had the value in the file.`);
  if (plan.identity.length) {
    lines.push(
      `Left alone as this device's own identity: ${plan.identity.join(", ")}. ` +
        "Two devices with one hostname or one address collide.",
    );
  }
  if (plan.unknown.length) {
    lines.push(`Not settings this firmware has: ${plan.unknown.join(", ")}.`);
  }
  if (plan.secrets.length) {
    lines.push(
      `Passwords and private keys are never in the file (${plan.secrets.join(", ")}) - ` +
        "set them again by hand, or the VPN and the broker will not come up.",
    );
  }
  if (plan.otherBoard) {
    lines.push(
      `The file came off "${plan.file.board}" and this is a "${plan.board}" - ` +
        "check the Pins tab before trusting the pin settings.",
    );
  }
  return lines;
}

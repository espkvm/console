/*
 * Settings in a file: a copy before "Restore defaults", or a second box brought
 * up like the first. Passwords and private keys cannot be in it - the firmware
 * never serves them - and an import has to say so, or someone clones a config
 * and waits a week for a VPN that was never given its key.
 */

import type { Setting, Values } from "./device";
import type { Profile, ProfileMatch } from "./profiles";

export const FILE_KIND = "espkvm-settings";
export const FILE_VERSION = 1;

/* What makes a device itself: two boxes with one hostname sign two certificates
   with the same subject and a browser trusts neither. Held back on import. */
export const IDENTITY_KEYS = [
  "net_hostname",
  "net_ip",
  "net_mask",
  "net_gw",
  "net_dns",
  /* Where the captured screen sits on the target's desktop: a fact about one
     computer's screens, wrong on a box plugged into another. */
  "ptr_desk_w",
  "ptr_desk_h",
  "ptr_scr_x",
  "ptr_scr_y",
];

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
  /** Default's values. */
  values: Values;
  /** Device profiles besides Default, each with only its own values. Optional:
      older files have none, and an older console ignores it. */
  profiles?: FileProfile[];
  /** The rows each mask setting had when this was written, by choice name, so
      an import can tell a box cleared on purpose from a row that did not exist
      yet. Optional: files from before 0.82.0 have none (see MASK_ROWS_BEFORE). */
  rows?: Record<string, string[]>;
}

/* The rows the notification masks had before files said so: the table came in
   0.81.0 with these six. */
const NOTIFY_ROWS_081 = ["watch", "flat", "area", "clip", "netlog", "tskey"];
const MASK_ROWS_BEFORE: Record<string, string[]> = {
  notify_tg_ev: NOTIFY_ROWS_081,
  notify_hook_ev: NOTIFY_ROWS_081,
  notify_push_ev: NOTIFY_ROWS_081,
};

/**
 * A mask from a file written before some of its rows existed: a channel that
 * took anything takes the new rows as a fresh device would (its default), and
 * one with every box cleared stays cleared. The firmware does the same once for
 * a table it had saved itself.
 */
function withNewRows(setting: Setting, value: number, known: string[] | undefined): number {
  if (!setting.mask || !setting.choices || !known || value === 0) return value;
  const def = Number(setting.default) | 0;
  let out = value;
  setting.choices.forEach((name, bit) => {
    if (!known.includes(name)) out |= def & (1 << bit);
  });
  return out;
}

export interface FileProfile {
  name: string;
  match?: ProfileMatch;
  set: Values;
}

const NOTE =
  "ESP-KVM settings. No passwords and no private keys are in here - the device never " +
  "serves them - but this does describe a network: hostname and addresses, the MQTT " +
  "broker, and the VPN peer, meaning its endpoint and its public key. Treat it as you " +
  "would a router's config before posting it anywhere.";

/**
 * Everything this device is willing to hand over, plus enough to read it later.
 * @param values Default's values (not the ones in effect under a profile)
 */
export function buildFile(
  values: Values,
  schema: Setting[],
  meta: { firmware?: string; board?: string; now?: Date; profiles?: Profile[] } = {},
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
    rows: Object.fromEntries(
      schema.filter((s) => s.mask && s.choices && known.has(s.key)).map((s) => [s.key, [...(s.choices ?? [])]]),
    ),
    ...(meta.profiles?.some((p) => p.id !== 0)
      ? {
          profiles: meta.profiles
            .filter((p) => p.id !== 0)
            .map((p) => ({ name: p.name, match: p.match, set: { ...(p.set ?? {}) } })),
        }
      : {}),
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
  /** Device profiles to make, or to update where one has the same name. Each
      holds only values this firmware lets a profile hold, identity aside. */
  profiles: FileProfile[];
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
    profiles: [],
  };
  for (const p of Array.isArray(file.profiles) ? file.profiles : []) {
    if (!p || typeof p.name !== "string" || !p.name) continue;
    const set: Values = {};
    for (const [key, value] of Object.entries(p.set ?? {})) {
      if (!byKey.get(key)?.profile) continue;
      if (!opts.withIdentity && IDENTITY_KEYS.includes(key)) continue;
      set[key] = value;
    }
    plan.profiles.push({ name: p.name.slice(0, 31), match: p.match, set });
  }
  const rows = file.rows ?? MASK_ROWS_BEFORE;
  for (const [key, raw] of Object.entries(file.values)) {
    const setting = byKey.get(key);
    if (!setting || setting.secret) {
      plan.unknown.push(key);
      continue;
    }
    const value = typeof raw === "number" ? withNewRows(setting, raw, rows[key]) : raw;
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
  if (plan.profiles.length) {
    lines.push(
      `Device profiles: ${plan.profiles.map((p) => p.name).join(", ")}. ` +
        "One with the same name here is updated, the others are made.",
    );
  }
  if (plan.identity.length) {
    lines.push(
      `Left alone as this device's own: ${plan.identity.join(", ")}. ` +
        "Two devices with one hostname or one address collide, and the screen layout belongs to the computer it is plugged into.",
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

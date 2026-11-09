/*
 * Quick buttons: keys, combinations, macros and runbooks someone pinned to the
 * console's bar, so a BIOS key or a long macro is one click away instead of
 * Input -> find it -> press. Kept on the device (quick_json) so every browser
 * shows the same ones.
 */
import type { Control } from "../input/control";
import { findMacro, macroLabel, SYSRQ_KEY, SYSRQ_LETTERS, SYSRQ_MOD, type Macro } from "../macros";
import { parseCombo, runMacroScript, type Macro as UserMacro } from "../macroScript";

export type QuickKind = "key" | "combo" | "macro" | "runbook";

export interface QuickItem {
  /** What it is: a key typed by name, a built-in combination, a macro, a runbook. */
  t: QuickKind;
  /** The key ("f2", "ctrl+alt+delete"), the combination's id, or the name. */
  v: string;
}

/** The most buttons the bar holds. */
export const QUICK_MAX = 8;

const KINDS = new Set<QuickKind>(["key", "combo", "macro", "runbook"]);

export function parseQuick(json: unknown): QuickItem[] {
  if (typeof json !== "string" || !json.trim()) return [];
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (x): x is QuickItem =>
          x && typeof x === "object" && KINDS.has(x.t) && typeof x.v === "string" && x.v.trim() !== "",
      )
      .slice(0, QUICK_MAX)
      .map((x) => ({ t: x.t, v: x.v }));
  } catch {
    return [];
  }
}

export function serializeQuick(list: QuickItem[]): string {
  return JSON.stringify(list.slice(0, QUICK_MAX).map((x) => ({ t: x.t, v: x.v })));
}

export function sameQuick(a: QuickItem, b: QuickItem): boolean {
  return a.t === b.t && a.v === b.v;
}

const KEY_WORDS: Record<string, string> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  gui: "Win",
  win: "Win",
  meta: "Win",
  super: "Win",
  delete: "Del",
  del: "Del",
  escape: "Esc",
  esc: "Esc",
  enter: "Enter",
  return: "Enter",
  space: "Space",
  tab: "Tab",
  backspace: "Backspace",
  insert: "Ins",
  pageup: "PgUp",
  pagedown: "PgDn",
  printscreen: "PrtSc",
};

/** "ctrl+alt+delete" -> "Ctrl+Alt+Del", "f2" -> "F2". */
export function keyLabel(combo: string): string {
  return combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => KEY_WORDS[p] ?? (p.length <= 3 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join("+");
}

/** Whether @p combo names keys the macro language knows. Null when it does, else why not. */
export function keyProblem(combo: string): string | null {
  try {
    parseCombo(combo.trim());
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function quickLabel(q: QuickItem, os: string): string {
  if (q.t === "key") return keyLabel(q.v);
  if (q.t === "combo") {
    const m = findMacro(q.v);
    return m ? macroLabel(m, os) : q.v;
  }
  return q.v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* A magic-SysRq sequence: hold Alt+SysRq, tap each letter in turn, let go. Sync
   (s) and remount (u) need a moment before the next command. */
async function sendSysrq(control: Control, letters: string): Promise<void> {
  try {
    control.keyboard(SYSRQ_MOD, [SYSRQ_KEY]);
    await sleep(400);
    for (const ch of letters.toLowerCase()) {
      const code = SYSRQ_LETTERS[ch];
      if (!code) continue;
      control.keyboard(SYSRQ_MOD, [SYSRQ_KEY, code]);
      await sleep(300);
      control.keyboard(SYSRQ_MOD, [SYSRQ_KEY]);
      await sleep(ch === "s" || ch === "u" ? 2500 : 800);
    }
  } finally {
    control.releaseAll();
  }
}

/**
 * Send a built-in combination, asking first for one that can lose work.
 * False when the operator said no.
 */
export async function sendBuiltin(control: Control, m: Macro, os: string): Promise<boolean> {
  if (m.destructive) {
    const detail = m.hint ? `\n\n${m.hint}` : "";
    if (!confirm(`Send ${macroLabel(m, os)} to the target?${detail}`)) return false;
  }
  if (m.sysrq) {
    await sendSysrq(control, m.sysrq);
    return true;
  }
  control.keyboard(m.modifier ?? 0, m.key ? [m.key] : []);
  await sleep(40);
  control.keyboard(0, []);
  return true;
}

export interface QuickContext {
  control: Control;
  layout: string;
  typeDelay: number;
  os: string;
  macros: UserMacro[];
  /** Starts a runbook on the device (passed in, so this module stays free of the API). */
  runRunbook: (name: string) => Promise<void>;
}

/** Press one quick button. Throws with a sentence when it cannot. */
export async function runQuick(q: QuickItem, ctx: QuickContext): Promise<void> {
  switch (q.t) {
    case "key":
      await runMacroScript(`key ${q.v}`, ctx.control, ctx.layout, ctx.typeDelay);
      return;
    case "combo": {
      const m = findMacro(q.v);
      if (!m) throw new Error(`There is no combination "${q.v}" any more`);
      await sendBuiltin(ctx.control, m, ctx.os);
      return;
    }
    case "macro": {
      const m = ctx.macros.find((x) => x.name === q.v);
      if (!m) throw new Error(`There is no macro "${q.v}" any more`);
      await runMacroScript(m.script, ctx.control, ctx.layout, ctx.typeDelay);
      return;
    }
    case "runbook":
      await ctx.runRunbook(q.v);
      return;
  }
}

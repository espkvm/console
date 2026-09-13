/*
 * User macros: a tiny line-based script the operator writes, and the engine that
 * plays it into the target as key events. It exists because some jobs are a
 * fixed dance - enter the BIOS, change the boot order, save - and doing them by
 * hand over a laggy link is error-prone.
 *
 * One command per line:
 *   key  <combo>     a chord, e.g.  key ctrl+alt+f2   |  key enter  |  key win+r
 *   type <text>      literal text, sent through the target's keyboard layout
 *   delay <ms>       wait, e.g.  delay 500
 * Blank lines and lines starting with # are ignored.
 *
 * Macros are stored on the device (the macros_json setting), so they follow the
 * device rather than the browser.
 */
import { charToHid, HID_MOD_LCTRL, HID_MOD_LSHIFT, HID_MOD_LALT, HID_MOD_LGUI } from "./layouts";
import type { Control } from "./input/control";

export interface Macro {
  name: string;
  script: string;
}

/** Modifier aliases -> HID modifier bit. */
const MODIFIERS: Record<string, number> = {
  ctrl: HID_MOD_LCTRL,
  control: HID_MOD_LCTRL,
  shift: HID_MOD_LSHIFT,
  alt: HID_MOD_LALT,
  option: HID_MOD_LALT,
  gui: HID_MOD_LGUI,
  win: HID_MOD_LGUI,
  cmd: HID_MOD_LGUI,
  super: HID_MOD_LGUI,
  meta: HID_MOD_LGUI,
};

/** Key name -> HID usage (keyboard/keypad page). Lower-cased names. */
const KEYS: Record<string, number> = (() => {
  const k: Record<string, number> = {
    enter: 0x28,
    return: 0x28,
    esc: 0x29,
    escape: 0x29,
    backspace: 0x2a,
    tab: 0x2b,
    space: 0x2c,
    minus: 0x2d,
    equal: 0x2e,
    capslock: 0x39,
    printscreen: 0x46,
    prtsc: 0x46,
    sysrq: 0x46,
    scrolllock: 0x47,
    pause: 0x48,
    insert: 0x49,
    ins: 0x49,
    home: 0x4a,
    pageup: 0x4b,
    pgup: 0x4b,
    delete: 0x4c,
    del: 0x4c,
    end: 0x4d,
    pagedown: 0x4e,
    pgdn: 0x4e,
    right: 0x4f,
    left: 0x50,
    down: 0x51,
    up: 0x52,
  };
  for (let i = 0; i < 26; i++) k[String.fromCharCode(97 + i)] = 0x04 + i; // a-z
  k["1"] = 0x1e;
  for (let d = 2; d <= 9; d++) k[String(d)] = 0x1e + (d - 1);
  k["0"] = 0x27;
  for (let f = 1; f <= 12; f++) k["f" + f] = 0x3a + (f - 1); // F1-F12
  return k;
})();

export interface ParsedStep {
  kind: "key" | "type" | "delay";
  /** key: HID modifier bits; type: unused; delay: unused */
  mod?: number;
  /** key: HID usage */
  code?: number;
  /** type: the text */
  text?: string;
  /** delay: milliseconds */
  ms?: number;
}

/** Parse a `key` combo like "ctrl+alt+f2" into modifier bits and one usage. */
export function parseCombo(combo: string): { mod: number; code: number } {
  let mod = 0;
  let code = 0;
  for (const raw of combo.split("+")) {
    const tok = raw.trim().toLowerCase();
    if (!tok) continue;
    if (tok in MODIFIERS) {
      mod |= MODIFIERS[tok];
    } else if (tok in KEYS) {
      if (code) throw new Error(`more than one non-modifier key in "${combo}"`);
      code = KEYS[tok];
    } else {
      throw new Error(`unknown key "${tok}"`);
    }
  }
  // A lone modifier is a real keypress (GUI opens the Start menu); the report
  // path already sends a modifier with no key. Refuse only an empty chord.
  if (!code && !mod) throw new Error(`no key in "${combo}"`);
  return { mod, code };
}

/* ------------------------------------------------------------------------ *
 * DuckyScript
 *
 * A second dialect, so the payloads people already have run here. Hak5's
 * DuckyScript is upper-case verbs, one per line; it has no way to wait for the
 * screen, so it maps onto the macro half of the language and is translated to
 * native lines before parsing - the device does the same in C, so the console
 * and the device accept exactly the same scripts. The full reference is at
 * https://espkvm.io/scripts/.
 * ------------------------------------------------------------------------ */

const DUCKY_MODS: Record<string, string> = {
  CTRL: "ctrl",
  CONTROL: "ctrl",
  SHIFT: "shift",
  ALT: "alt",
  GUI: "gui",
  WINDOWS: "gui",
  COMMAND: "gui",
};

const DUCKY_KEYS: Record<string, string> = {
  ENTER: "enter",
  ESCAPE: "esc",
  ESC: "esc",
  TAB: "tab",
  SPACE: "space",
  BACKSPACE: "backspace",
  DELETE: "delete",
  DEL: "delete",
  INSERT: "insert",
  HOME: "home",
  END: "end",
  PAGEUP: "pageup",
  PAGEDOWN: "pagedown",
  UP: "up",
  UPARROW: "up",
  DOWN: "down",
  DOWNARROW: "down",
  LEFT: "left",
  LEFTARROW: "left",
  RIGHT: "right",
  RIGHTARROW: "right",
  CAPSLOCK: "capslock",
  SCROLLLOCK: "scrolllock",
  PRINTSCREEN: "printscreen",
  PAUSE: "pause",
  BREAK: "pause",
};

const DUCKY_CMDS = new Set([
  "REM",
  "STRING",
  "STRINGLN",
  "DELAY",
  "DEFAULT_DELAY",
  "DEFAULTDELAY",
  "REPEAT",
]);

/** A DuckyScript key token to our native name, or null. Single letters/digits
 *  and F1..F12 by rule; the rest by table. */
function duckyKey(word: string): string | null {
  if (word.length === 1 && /[a-z0-9]/i.test(word)) return word.toLowerCase();
  const f = /^F([1-9]|1[0-2])$/i.exec(word);
  if (f) return "f" + f[1];
  return DUCKY_KEYS[word] ?? null;
}

/** Whether a script should be read as DuckyScript: its first real line begins
 *  with a DuckyScript keyword, which is upper case and so never one of our
 *  own lower-case verbs. */
export function looksLikeDucky(src: string): boolean {
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const w = line.split(/\s+/)[0];
    return (
      DUCKY_CMDS.has(w) ||
      w in DUCKY_MODS ||
      w in DUCKY_KEYS ||
      /^F([1-9]|1[0-2])$/.test(w)
    );
  }
  return false;
}

/** One DuckyScript line to native lines, appended to `out`. `defDelay`, when
 *  set, follows a key or a string, the way DEFAULT_DELAY works. `at` makes the
 *  "line N:" error. */
function duckyLine(line: string, out: string[], defDelay: number, at: (m: string) => Error): void {
  const sp = line.search(/\s/);
  const verb = sp < 0 ? line : line.slice(0, sp);
  const rest = sp < 0 ? "" : line.slice(sp + 1).trim();

  if (verb === "STRING" || verb === "STRINGLN") {
    if (rest) {
      for (const ch of rest) {
        const c = ch.charCodeAt(0);
        if (c < 0x20 || c > 0x7e) throw at("STRING is US layout, ASCII only");
      }
      out.push(`type ${rest}`);
    }
    if (verb === "STRINGLN") out.push("key enter");
    if (defDelay) out.push(`delay ${defDelay}`);
    return;
  }
  if (verb === "DELAY") {
    if (!/^\d+$/.test(rest) || +rest < 1 || +rest > 60000) {
      throw at("DELAY wants 1..60000 milliseconds");
    }
    out.push(`delay ${+rest}`);
    return;
  }

  // Anything else is a key or a chord: modifiers and at most one key.
  const mods: string[] = [];
  let key = "";
  for (const tok of line.split(/\s+/)) {
    if (!tok) continue;
    if (tok in DUCKY_MODS) {
      mods.push(DUCKY_MODS[tok]);
      continue;
    }
    if (key) throw at("more than one key in the line");
    const k = duckyKey(tok);
    if (!k) throw at(`unknown key "${tok}"`);
    key = k;
  }
  const chord = [...mods, key].filter(Boolean).join("+");
  out.push(`key ${chord}`);
  if (defDelay) out.push(`delay ${defDelay}`);
}

/** Translate a whole DuckyScript into our native script text. Throws
 *  Error("line N: ...") on the first problem, with the DuckyScript line. */
export function duckyToNative(src: string): string {
  const out: string[] = [];
  let defDelay = 0;
  let prev = "";
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const at = (m: string) => new Error(`line ${i + 1}: ${m}`);
    const sp = line.search(/\s/);
    const verb = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? "" : line.slice(sp + 1).trim();

    if (verb === "REM") continue;
    if (verb === "DEFAULT_DELAY" || verb === "DEFAULTDELAY") {
      if (!/^\d+$/.test(rest) || +rest > 60000) throw at("DEFAULT_DELAY wants 0..60000 milliseconds");
      defDelay = +rest;
      continue;
    }
    if (verb === "REPEAT") {
      if (!/^\d+$/.test(rest) || +rest < 1 || +rest > 1000) throw at("REPEAT wants 1..1000");
      if (!prev) throw at("REPEAT with nothing before it");
      for (let r = 0; r < +rest; r++) duckyLine(prev, out, defDelay, at);
      continue;
    }
    duckyLine(line, out, defDelay, at);
    prev = line;
  }
  return out.join("\n");
}

/**
 * Parse a whole script into steps. Throws Error(message) with the 1-based line
 * number on the first problem, so the editor can show it before running.
 */
export function parseMacroScript(script: string): ParsedStep[] {
  if (looksLikeDucky(script)) script = duckyToNative(script);
  const steps: ParsedStep[] = [];
  const lines = script.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const arg = sp < 0 ? "" : line.slice(sp + 1).trim();
    try {
      if (cmd === "key") {
        const { mod, code } = parseCombo(arg);
        steps.push({ kind: "key", mod, code });
      } else if (cmd === "type") {
        if (!arg) throw new Error("type needs text");
        steps.push({ kind: "type", text: arg });
      } else if (cmd === "delay") {
        const ms = Number(arg);
        if (!Number.isFinite(ms) || ms < 0) throw new Error(`bad delay "${arg}"`);
        steps.push({ kind: "delay", ms });
      } else {
        throw new Error(`unknown command "${cmd}"`);
      }
    } catch (e) {
      throw new Error(`line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (steps.length === 0) throw new Error("the macro is empty");
  return steps;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Play a parsed macro into the target. A `type` step sends each character
 * through @p layout, the same way paste does; a `key` step sends one chord.
 * @p typeDelay paces the typing so the target does not drop characters.
 */
export async function runMacroScript(
  script: string,
  control: Control,
  layout: string,
  typeDelay = 8,
): Promise<void> {
  const steps = parseMacroScript(script);
  try {
    for (const step of steps) {
      if (step.kind === "delay") {
        await sleep(step.ms ?? 0);
      } else if (step.kind === "key") {
        control.keyboard(step.mod ?? 0, step.code ? [step.code] : []);
        await sleep(40);
        control.keyboard(0, []);
        await sleep(40);
      } else if (step.kind === "type") {
        for (const ch of step.text ?? "") {
          const row = charToHid(layout, ch) as { mod: number; hid: number } | null;
          if (!row) continue;
          control.keyboard(row.mod, [row.hid]);
          await sleep(typeDelay + 12);
          control.keyboard(0, []);
          await sleep(typeDelay);
        }
      }
    }
  } finally {
    control.keyboard(0, []); /* never leave a key held */
  }
}

/** Read the stored macros JSON into a list, tolerating an empty or bad value. */
export function loadMacros(json: unknown): Macro[] {
  if (typeof json !== "string" || !json.trim()) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.name === "string" && typeof m.script === "string")
      .map((m) => ({ name: m.name, script: m.script }));
  } catch {
    return [];
  }
}

/** Serialise a macro list back to the compact JSON the device stores. */
export function serializeMacros(list: Macro[]): string {
  return JSON.stringify(list.map((m) => ({ name: m.name, script: m.script })));
}

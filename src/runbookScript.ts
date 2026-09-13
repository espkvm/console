/*
 * The runbook script, parsed the way the device parses it.
 *
 * A runbook is a macro that can wait: the macro grammar (key, type, delay)
 * plus `wait <phrase>`, `gone <phrase>` and `timeout <seconds>`. The device
 * runs it, not the browser, so this parser exists only to tell the operator
 * about a bad line before the run - the rules and the messages mirror
 * components/kvm_runbook/runbook_script.c, and a script this accepts, the
 * device accepts.
 */
import { duckyToNative, looksLikeDucky, parseCombo } from "./macroScript";

export interface Runbook {
  name: string;
  script: string;
}

export type RunbookStep =
  | { kind: "key"; mod: number; code: number }
  | { kind: "type"; text: string }
  | { kind: "delay"; ms: number }
  | { kind: "timeout"; seconds: number }
  | { kind: "wait" | "gone"; phrase: string };

export const RUNBOOK_MAX_STEPS = 64;
const PHRASE_MAX = 63;
const LINE_MAX = 159;

/* What the device can type: printable US ASCII. It has no layout tables. */
function typeable(text: string): string | null {
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c > 0x7e) return ch;
  }
  return null;
}

function number(arg: string, lo: number, hi: number): number | null {
  if (!/^\d+$/.test(arg)) return null;
  const n = Number(arg);
  return n >= lo && n <= hi ? n : null;
}

/**
 * Parse a whole script. Throws Error("line N: what") on the first problem.
 */
export function parseRunbookScript(script: string): RunbookStep[] {
  if (looksLikeDucky(script)) script = duckyToNative(script);
  const steps: RunbookStep[] = [];
  const lines = script.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const at = (what: string) => new Error(`line ${i + 1}: ${what}`);
    if (steps.length >= RUNBOOK_MAX_STEPS) throw at(`more than ${RUNBOOK_MAX_STEPS} steps`);
    if (line.length > LINE_MAX) throw at("that line is too long");
    const sp = line.search(/\s/);
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const arg = sp < 0 ? "" : line.slice(sp + 1).trim();
    if (cmd === "key") {
      try {
        const { mod, code } = parseCombo(arg);
        steps.push({ kind: "key", mod, code });
      } catch (e) {
        throw at(e instanceof Error ? e.message : String(e));
      }
    } else if (cmd === "type") {
      if (!arg) throw at("nothing to type");
      const bad = typeable(arg);
      if (bad !== null) throw at(`cannot type "${bad}" - US layout, ASCII only`);
      steps.push({ kind: "type", text: arg });
    } else if (cmd === "delay") {
      const ms = number(arg, 1, 60000);
      if (ms === null) throw at("delay wants 1..60000 milliseconds");
      steps.push({ kind: "delay", ms });
    } else if (cmd === "timeout") {
      const seconds = number(arg, 1, 3600);
      if (seconds === null) throw at("timeout wants 1..3600 seconds");
      steps.push({ kind: "timeout", seconds });
    } else if (cmd === "wait" || cmd === "gone") {
      if (!arg) throw at("which phrase?");
      if (arg.length > PHRASE_MAX) throw at(`a phrase is at most ${PHRASE_MAX} characters`);
      if (typeable(arg) !== null) {
        throw at("a phrase is ASCII only - that is all the screen reader knows");
      }
      steps.push({ kind: cmd, phrase: arg });
    } else {
      throw at(`unknown command "${cmd}"`);
    }
  }
  if (steps.length === 0) throw new Error("line 1: the runbook has no steps");
  return steps;
}

/** Read the stored runbooks JSON into a list, tolerating an empty or bad value. */
export function loadRunbooks(json: unknown): Runbook[] {
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

/** Serialise a runbook list back to the compact JSON the device stores. */
export function serializeRunbooks(list: Runbook[]): string {
  return JSON.stringify(list.map((m) => ({ name: m.name, script: m.script })));
}

/** How much of the setting a list would take; the device holds 3000 bytes. */
export const RUNBOOKS_MAX_BYTES = 3000;
export function runbooksBytes(list: Runbook[]): number {
  return new TextEncoder().encode(serializeRunbooks(list)).length;
}

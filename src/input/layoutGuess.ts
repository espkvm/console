/*
 * Which keyboard layout the operator's own computer has, guessed from typing.
 *
 * Every keydown carries the key position (code) and the character it made
 * (key). Matching those against the paste tables tells the layouts apart:
 * the key right of T types z on German and y on US. Chrome and Edge also hand
 * over the whole unshifted map at once (navigator.keyboard.getLayoutMap).
 *
 * This is only a hint. The paste setting is about the target's layout, which
 * a KVM cannot see, and the two often differ (a Russian desk, a US server). So
 * the console suggests, and never changes the setting by itself.
 */

import { ref } from "vue";
import { LAYOUTS, type KeyStroke } from "../layouts";
import { usageForCode } from "./keymap";

const SH = 0x02;
const RA = 0x40;

/** The layout the operator seems to type on, or null while unsure. */
export const operatorLayout = ref<string | null>(null);

/* Per layout: "mod:hid" -> the character, from every table it has. */
const slots = new Map<string, Map<string, string>>();
for (const [id, layout] of Object.entries(LAYOUTS)) {
  const m = new Map<string, string>();
  const add = (map: Record<string, KeyStroke>) => {
    for (const [ch, s] of Object.entries(map)) if (ch.length === 1 && ch > " ") m.set(`${s.mod}:${s.hid}`, ch);
  };
  add(layout.map);
  if (layout.os) {
    add(layout.os.windows.map);
    add(layout.os.linux.map);
  }
  slots.set(id, m);
}

/* What was seen: "mod:hid" -> the character the operator's computer made. */
const seen = new Map<string, string>();

function decide() {
  let best: string | null = null;
  let bestHits = 0;
  let tie = false;
  for (const [id, m] of slots) {
    let hits = 0;
    let wrong = false;
    for (const [slot, ch] of seen) {
      const mine = m.get(slot);
      if (mine === undefined) continue;
      if (mine.toLowerCase() !== ch.toLowerCase()) {
        wrong = true;
        break;
      }
      hits++;
    }
    if (wrong || !hits) continue;
    if (hits > bestHits) {
      best = id;
      bestHits = hits;
      tie = false;
    } else if (hits === bestHits) {
      tie = true;
    }
  }
  /* Several layouts fit what was typed so far (German and Swiss German share
     most keys): keep the earlier guess, or wait for more keys. */
  if (best && !tie && bestHits >= 6) operatorLayout.value = best;
}

function note(code: string, mod: number, key: string) {
  if ([...key].length !== 1 || key === " ") return;
  const hid = usageForCode(code);
  if (!hid) return;
  const slot = `${mod}:${hid}`;
  const before = seen.get(slot);
  if (before === key) return;
  /* The same key made something else: the operator switched layouts (Alt+Shift
     to Russian and back). Start over from this key. */
  if (before !== undefined && before.toLowerCase() !== key.toLowerCase()) seen.clear();
  seen.set(slot, key);
  decide();
}

function onKey(e: KeyboardEvent) {
  /* Windows reports AltGr as Ctrl+Alt as well, so AltGr is asked first. */
  const altGr = e.getModifierState("AltGraph");
  if (!altGr && (e.ctrlKey || e.altKey || e.metaKey)) return;
  note(e.code, (e.shiftKey ? SH : 0) | (altGr ? RA : 0), e.key);
}

let started = false;

/** Start listening. Safe to call more than once. */
export function startLayoutGuess() {
  if (started) return;
  started = true;
  window.addEventListener("keydown", onKey, { capture: true, passive: true });
  const kb = (navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
  }).keyboard;
  kb?.getLayoutMap?.()
    .then((map) => {
      for (const [code, key] of map) note(code, 0, key);
    })
    .catch(() => {});
}

/* What the operator was already told or answered, per guessed layout:
   "told" for the one notice, "no" for "the target has another layout". */
const HINT_KEY = "espkvm.layoutHint";

function hints(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(HINT_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** False once @p what ("told", "no") was recorded for this guessed layout. */
export function layoutHintWanted(id: string, what: "told" | "no"): boolean {
  return !(hints()[what] ?? []).includes(id);
}

export function markLayoutHint(id: string, what: "told" | "no") {
  const h = hints();
  h[what] = [...new Set([...(h[what] ?? []), id])];
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify(h));
  } catch {
    /* private window: the notice may come again, nothing worse */
  }
}

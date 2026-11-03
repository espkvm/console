/*
 * The keys that went to the target, as short labels ("Ctrl+Alt+Del", "F2"),
 * for the strip in the bottom bar. It shows that a key really left this
 * browser, which is the first question when the target seems to ignore one.
 * Fed from every keyboard report, so the on-screen keyboard, macros and paste
 * show up too.
 */
import { ref } from "vue";

import { usageForCode } from "./keymap";

const NAMES: Record<string, string> = {
  Escape: "Esc",
  Backspace: "Bksp",
  Delete: "Del",
  Insert: "Ins",
  PageUp: "PgUp",
  PageDown: "PgDn",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  PrintScreen: "PrtSc",
  ScrollLock: "ScrLk",
  CapsLock: "Caps",
  NumLock: "Num",
  ContextMenu: "Menu",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

const CODES = [
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
  "Enter", "Escape", "Backspace", "Tab", "Space", "Minus", "Equal", "BracketLeft",
  "BracketRight", "Backslash", "Semicolon", "Quote", "Backquote", "Comma", "Period",
  "Slash", "CapsLock", "PrintScreen", "ScrollLock", "Pause", "Insert", "Home",
  "PageUp", "Delete", "End", "PageDown", "ArrowRight", "ArrowLeft", "ArrowDown",
  "ArrowUp", "NumLock", "NumpadDivide", "NumpadMultiply", "NumpadSubtract",
  "NumpadAdd", "NumpadEnter", "NumpadDecimal", "ContextMenu",
];

const BY_USAGE = new Map<number, string>();
for (const code of CODES) {
  const usage = usageForCode(code);
  if (!usage || BY_USAGE.has(usage)) continue;
  BY_USAGE.set(
    usage,
    NAMES[code] ?? code.replace(/^Key|^Digit/, "").replace(/^Numpad(?=\d)/, "Num ").replace(/^Numpad/, "Num "),
  );
}

/** A HID key usage as a short label. */
export function keyName(usage: number): string {
  return BY_USAGE.get(usage) ?? `0x${usage.toString(16)}`;
}

/** The modifier byte as labels, left and right alike, AltGr apart. */
export function modifierNames(mod: number): string[] {
  const out: string[] = [];
  if (mod & 0x11) out.push("Ctrl");
  if (mod & 0x22) out.push("Shift");
  if (mod & 0x04) out.push("Alt");
  if (mod & 0x40) out.push("AltGr");
  if (mod & 0x88) out.push("Win");
  return out;
}

export interface Echo {
  id: number;
  label: string;
}

/** The strip's contents, newest last. */
export const keyEcho = ref<Echo[]>([]);
/** Off until the setting turns it on; the reports cost nothing then. */
export const keyEchoOn = { value: false };

const KEEP = 6;
let nextId = 1;

export function createEcho(push: (label: string) => void) {
  let mods = 0;
  let keys = new Set<number>();
  /* Modifiers pressed with nothing else: a lone Win or Alt is a key too. */
  let modsAlone = 0;

  return (mod: number, report: number[]) => {
    const now = new Set(report.filter((k) => k));
    let typed = false;
    for (const k of now) {
      if (keys.has(k)) continue;
      typed = true;
      push([...modifierNames(mod), keyName(k)].join("+"));
    }
    if (typed || now.size) modsAlone = 0;
    else if (mod & ~mods) modsAlone |= mod;
    /* All modifiers up, and nothing was typed while they were down. */
    if (!mod && !now.size && modsAlone) {
      push(modifierNames(modsAlone).join("+"));
      modsAlone = 0;
    }
    mods = mod;
    keys = now;
  };
}

const echo = createEcho((label) => {
  const list = [...keyEcho.value, { id: nextId++, label }];
  keyEcho.value = list.slice(-KEEP);
});

/** Called with every keyboard report that goes to the target. */
export function noteKeys(mod: number, report: number[]) {
  if (keyEchoOn.value) echo(mod, report);
}

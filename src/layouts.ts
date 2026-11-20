/*
 * Character -> HID scancode tables for pasting text into the target.
 *
 * A KVM cannot type characters, only key positions. What appears on the target
 * depends on the layout the target itself has active, so the table has to match
 * it: sending the "A" key position produces "a" on a US layout and "ф" on a
 * Russian one. That is what the kbd_layout setting selects.
 *
 * Characters absent from a table are skipped rather than guessed, because a
 * wrong guess types the wrong character into whatever has focus.
 *
 * The first five tables are written by hand. The rest are generated from the
 * Windows and Linux layouts (layoutsGen.ts, tools/gen_layouts.py), and those
 * carry dead keys: on a German target é is ´ then e.
 */

import { GENERATED, KEYS, type GenLayout, type GenTable } from "./layoutsGen";

export const HID_MOD_LCTRL = 0x01;
export const HID_MOD_LSHIFT = 0x02;
export const HID_MOD_LALT = 0x04;
export const HID_MOD_LGUI = 0x08;
/* Right Alt, which layouts that need a third level reach as AltGr. The byte
   travels to the target untouched, so this needs nothing on the firmware side. */
export const HID_MOD_RALT = 0x40;

/** One key press: the modifier bitmask to hold and the HID key position to tap. */
export interface KeyStroke {
  mod: number;
  hid: number;
}

/** Character -> key press for one layout. */
export type CharMap = Record<string, KeyStroke>;

/* US key positions, named for what they produce on a US layout. */
const K = {
  a: 0x04, b: 0x05, c: 0x06, d: 0x07, e: 0x08, f: 0x09, g: 0x0a, h: 0x0b,
  i: 0x0c, j: 0x0d, k: 0x0e, l: 0x0f, m: 0x10, n: 0x11, o: 0x12, p: 0x13,
  q: 0x14, r: 0x15, s: 0x16, t: 0x17, u: 0x18, v: 0x19, w: 0x1a, x: 0x1b,
  y: 0x1c, z: 0x1d,
  d1: 0x1e, d2: 0x1f, d3: 0x20, d4: 0x21, d5: 0x22,
  d6: 0x23, d7: 0x24, d8: 0x25, d9: 0x26, d0: 0x27,
  enter: 0x28, esc: 0x29, backspace: 0x2a, tab: 0x2b, space: 0x2c,
  minus: 0x2d, equal: 0x2e, lbracket: 0x2f, rbracket: 0x30, backslash: 0x31,
  semicolon: 0x33, quote: 0x34, grave: 0x35, comma: 0x36, period: 0x37, slash: 0x38,
} as const;

const SH = HID_MOD_LSHIFT;
const RA = HID_MOD_RALT;

const digitKeys = [K.d1, K.d2, K.d3, K.d4, K.d5, K.d6, K.d7, K.d8, K.d9, K.d0];

/** Whitespace only - truly universal across layouts. */
function addCommon(map: CharMap): CharMap {
  map[" "] = { mod: 0, hid: K.space };
  map["\n"] = { mod: 0, hid: K.enter };
  map["\r"] = { mod: 0, hid: K.enter };
  map["\t"] = { mod: 0, hid: K.tab };
  return map;
}

/* The digit row is NOT universal: US and Russian give 1..0 without shift, but
   Czech/Slovak (and French, ...) put letters there and digits need shift. So a
   layout adds its own digit row rather than inheriting one. */
function addAsciiDigits(map: CharMap): CharMap {
  const digits = "1234567890";
  for (let i = 0; i < digits.length; i++) {
    map[digits[i]] = { mod: 0, hid: digitKeys[i] };
  }
  return map;
}

function buildUs(): CharMap {
  const m = addAsciiDigits(addCommon({}));
  for (let i = 0; i < 26; i++) {
    const lower = String.fromCharCode(97 + i);
    const upper = String.fromCharCode(65 + i);
    m[lower] = { mod: 0, hid: K.a + i };
    m[upper] = { mod: SH, hid: K.a + i };
  }
  const shiftedDigits = "!@#$%^&*()";
  for (let i = 0; i < shiftedDigits.length; i++) {
    m[shiftedDigits[i]] = { mod: SH, hid: digitKeys[i] };
  }
  const pairs: [string, string, number][] = [
    ["-", "_", K.minus], ["=", "+", K.equal], ["[", "{", K.lbracket],
    ["]", "}", K.rbracket], ["\\", "|", K.backslash], [";", ":", K.semicolon],
    ["'", '"', K.quote], ["`", "~", K.grave], [",", "<", K.comma],
    [".", ">", K.period], ["/", "?", K.slash],
  ];
  for (const [plain, shifted, hid] of pairs) {
    m[plain] = { mod: 0, hid };
    m[shifted] = { mod: SH, hid };
  }
  return m;
}

/*
 * Russian ЙЦУКЕН as standardised on Windows and used by every desktop Linux
 * layout named "ru". Latin letters are deliberately absent: with a Russian
 * layout active on the target there is no key position that produces them.
 */
function buildRu(): CharMap {
  const m = addAsciiDigits(addCommon({}));

  const letters: [string, number][] = [
    ["й", K.q], ["ц", K.w], ["у", K.e], ["к", K.r], ["е", K.t], ["н", K.y],
    ["г", K.u], ["ш", K.i], ["щ", K.o], ["з", K.p], ["х", K.lbracket], ["ъ", K.rbracket],
    ["ф", K.a], ["ы", K.s], ["в", K.d], ["а", K.f], ["п", K.g], ["р", K.h],
    ["о", K.j], ["л", K.k], ["д", K.l], ["ж", K.semicolon], ["э", K.quote],
    ["я", K.z], ["ч", K.x], ["с", K.c], ["м", K.v], ["и", K.b], ["т", K.n],
    ["ь", K.m], ["б", K.comma], ["ю", K.period], ["ё", K.grave],
  ];
  for (const [ch, hid] of letters) {
    m[ch] = { mod: 0, hid };
    m[ch.toUpperCase()] = { mod: SH, hid };
  }

  /* Punctuation sits differently than on US: the slash key carries the full
     stop, and most marks live on the shifted digit row. */
  m["."] = { mod: 0, hid: K.slash };
  m[","] = { mod: SH, hid: K.slash };
  m["\\"] = { mod: 0, hid: K.backslash };
  m["/"] = { mod: SH, hid: K.backslash };
  m["-"] = { mod: 0, hid: K.minus };
  m["_"] = { mod: SH, hid: K.minus };
  m["="] = { mod: 0, hid: K.equal };
  m["+"] = { mod: SH, hid: K.equal };
  m["!"] = { mod: SH, hid: K.d1 };
  m['"'] = { mod: SH, hid: K.d2 };
  m["№"] = { mod: SH, hid: K.d3 };
  m[";"] = { mod: SH, hid: K.d4 };
  m["%"] = { mod: SH, hid: K.d5 };
  m[":"] = { mod: SH, hid: K.d6 };
  m["?"] = { mod: SH, hid: K.d7 };
  m["*"] = { mod: SH, hid: K.d8 };
  m["("] = { mod: SH, hid: K.d9 };
  m[")"] = { mod: SH, hid: K.d0 };
  return m;
}

/*
 * Czech (QWERTZ, the standard Windows KBDCZ). Two things set it apart from US and
 * are the whole point of this table: Y and Z are swapped, and the number row
 * types accented letters unshifted (ě š č ř ž ý á í é) with the digits under
 * Shift. Covers the directly-keyed characters; marks KBDCZ reaches only through
 * dead keys or AltGr - the uppercase accents and much of the punctuation - are
 * left out, so untypeableChars() reports them instead of risking a wrong key.
 */
function buildCz(): CharMap {
  const m = addCommon({});

  // ASCII letters, QWERTZ: US positions except y<->z swapped.
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    const hid = ch === "y" ? K.z : ch === "z" ? K.y : K.a + i;
    m[ch] = { mod: 0, hid };
    m[ch.toUpperCase()] = { mod: SH, hid };
  }

  // Number row: accented letters on 2..0 unshifted, digits 1..0 under Shift.
  const rowLetters = "ěščřžýáíé";
  const rowKeys = [K.d2, K.d3, K.d4, K.d5, K.d6, K.d7, K.d8, K.d9, K.d0];
  for (let i = 0; i < rowLetters.length; i++) m[rowLetters[i]] = { mod: 0, hid: rowKeys[i] };
  const digits = "1234567890";
  for (let i = 0; i < digits.length; i++) m[digits[i]] = { mod: SH, hid: digitKeys[i] };

  // Accented letters keyed directly outside the number row.
  m["ů"] = { mod: 0, hid: K.semicolon };
  m["ú"] = { mod: 0, hid: K.lbracket };

  /* ASCII punctuation, which moves around more than anything else on this
     layout: ; sits left of 1, = took the minus key, and the full stop and comma
     keep their US places while - and _ took the slash key. */
  m[";"] = { mod: 0, hid: K.grave };
  m["+"] = { mod: 0, hid: K.d1 };
  m["="] = { mod: 0, hid: K.minus };
  m["%"] = { mod: SH, hid: K.minus };
  m["/"] = { mod: SH, hid: K.lbracket };
  m[")"] = { mod: 0, hid: K.rbracket };
  m["("] = { mod: SH, hid: K.rbracket };
  m['"'] = { mod: SH, hid: K.semicolon };
  m["!"] = { mod: SH, hid: K.quote };
  m["'"] = { mod: SH, hid: K.backslash };
  m[","] = { mod: 0, hid: K.comma };
  m["?"] = { mod: SH, hid: K.comma };
  m["."] = { mod: 0, hid: K.period };
  m[":"] = { mod: SH, hid: K.period };
  m["-"] = { mod: 0, hid: K.slash };
  m["_"] = { mod: SH, hid: K.slash };

  /* What is left needs AltGr. A shell command or an email address is mostly
     made of these, so a paste without them would be worse than useless. */
  m["@"] = { mod: RA, hid: K.d2 };
  m["#"] = { mod: RA, hid: K.d3 };
  m["$"] = { mod: RA, hid: K.d4 };
  m["^"] = { mod: RA, hid: K.d6 };
  m["&"] = { mod: RA, hid: K.d7 };
  m["*"] = { mod: RA, hid: K.d8 };
  m["{"] = { mod: RA, hid: K.d9 };
  m["}"] = { mod: RA, hid: K.d0 };
  m["\\"] = { mod: RA, hid: K.q };
  m["|"] = { mod: RA, hid: K.w };
  m["["] = { mod: RA, hid: K.lbracket };
  m["]"] = { mod: RA, hid: K.rbracket };
  m["~"] = { mod: RA, hid: K.a };
  m["`"] = { mod: RA, hid: K.h };
  m["<"] = { mod: RA, hid: K.comma };
  m[">"] = { mod: RA, hid: K.period };

  return m;
}

/*
 * Ukrainian ЙЦУКЕН, the "Ukrainian (Enhanced)" layout Windows ships and the one
 * every desktop Linux "ua" maps to. It sits on the Russian positions with four
 * keys different - ї instead of ъ, і instead of ы, є instead of э, and the
 * apostrophe on the key left of 1 - so the digits and punctuation follow the
 * Russian scheme. Latin letters are absent for the same reason as there: with
 * this layout active on the target, no key position produces them.
 */
function buildUa(): CharMap {
  const m = addAsciiDigits(addCommon({}));

  const letters: [string, number][] = [
    ["й", K.q], ["ц", K.w], ["у", K.e], ["к", K.r], ["е", K.t], ["н", K.y],
    ["г", K.u], ["ш", K.i], ["щ", K.o], ["з", K.p], ["х", K.lbracket], ["ї", K.rbracket],
    ["ф", K.a], ["і", K.s], ["в", K.d], ["а", K.f], ["п", K.g], ["р", K.h],
    ["о", K.j], ["л", K.k], ["д", K.l], ["ж", K.semicolon], ["є", K.quote],
    ["я", K.z], ["ч", K.x], ["с", K.c], ["м", K.v], ["и", K.b], ["т", K.n],
    ["ь", K.m], ["б", K.comma], ["ю", K.period],
  ];
  for (const [ch, hid] of letters) {
    m[ch] = { mod: 0, hid };
    m[ch.toUpperCase()] = { mod: SH, hid };
  }

  // The key left of 1 carries the apostrophe, which Ukrainian spelling needs.
  m["'"] = { mod: 0, hid: K.grave };

  /* ґ owns the backslash key here - that is the one place this layout parts
     company with the Russian one, which has the backslash itself on that key.
     So \\ and | are on AltGr, and / is AltGr on the full-stop key. */
  m["ґ"] = { mod: 0, hid: K.backslash };
  m["Ґ"] = { mod: SH, hid: K.backslash };
  m["\\"] = { mod: RA, hid: K.backslash };
  m["|"] = { mod: RA | SH, hid: K.backslash };

  /* The rest of the punctuation is the Russian scheme: the full stop on the
     slash key, the comma under Shift, the marks on the shifted digit row. */
  m["."] = { mod: 0, hid: K.slash };
  m[","] = { mod: SH, hid: K.slash };
  m["/"] = { mod: RA, hid: K.slash };
  m["-"] = { mod: 0, hid: K.minus };
  m["_"] = { mod: SH, hid: K.minus };
  m["="] = { mod: 0, hid: K.equal };
  m["+"] = { mod: SH, hid: K.equal };
  m["!"] = { mod: SH, hid: K.d1 };
  m['"'] = { mod: SH, hid: K.d2 };
  m["№"] = { mod: SH, hid: K.d3 };
  m[";"] = { mod: SH, hid: K.d4 };
  m["%"] = { mod: SH, hid: K.d5 };
  m[":"] = { mod: SH, hid: K.d6 };
  m["?"] = { mod: SH, hid: K.d7 };
  m["*"] = { mod: SH, hid: K.d8 };
  m["("] = { mod: SH, hid: K.d9 };
  m[")"] = { mod: SH, hid: K.d0 };
  /* The layout keeps the rest of the ASCII marks on AltGr. A shell line pasted
     into a Ukrainian target needs $, ~ and the brackets as much as any other. */
  m["$"] = { mod: RA, hid: K.d4 };
  m["<"] = { mod: RA, hid: K.d6 };
  m[">"] = { mod: RA, hid: K.d7 };
  m["["] = { mod: RA, hid: K.d9 };
  m["{"] = { mod: RA | SH, hid: K.d9 };
  m["]"] = { mod: RA, hid: K.d0 };
  m["}"] = { mod: RA | SH, hid: K.d0 };
  m["~"] = { mod: RA | SH, hid: K.grave };
  return m;
}

/*
 * Lithuanian (LST 1582, the layout Windows calls "Lithuanian" and X11 ships as
 * lt "basic"). Letters and most punctuation sit exactly where US puts them; the
 * number row is the whole difference. Unshifted it types ą č ę ė į š ų ū „ “,
 * Shift gives their capitals, and the digits are one level further out, on
 * AltGr - which is why this table needs a third modifier at all. Without AltGr
 * a Lithuanian target could not be sent a single digit.
 */
function buildLt(): CharMap {
  const m = addCommon({});

  // ASCII letters: plain US positions.
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    m[ch] = { mod: 0, hid: K.a + i };
    m[ch.toUpperCase()] = { mod: SH, hid: K.a + i };
  }

  // Number row: the Lithuanian letters, then the digits and the US shifted
  // symbols one and two levels out.
  const rowLower = "ąčęėįšųū";
  for (let i = 0; i < rowLower.length; i++) {
    m[rowLower[i]] = { mod: 0, hid: digitKeys[i] };
    m[rowLower[i].toUpperCase()] = { mod: SH, hid: digitKeys[i] };
  }
  m["„"] = { mod: 0, hid: K.d9 };
  m["“"] = { mod: 0, hid: K.d0 };
  m["("] = { mod: SH, hid: K.d9 };
  m[")"] = { mod: SH, hid: K.d0 };

  const digits = "1234567890";
  for (let i = 0; i < digits.length; i++) {
    m[digits[i]] = { mod: RA, hid: digitKeys[i] };
  }
  const altShifted = "!@#$%^&*";
  for (let i = 0; i < altShifted.length; i++) {
    m[altShifted[i]] = { mod: RA | SH, hid: digitKeys[i] };
  }

  // ž took the = key, so = and + moved out to AltGr with the digits.
  m["ž"] = { mod: 0, hid: K.equal };
  m["Ž"] = { mod: SH, hid: K.equal };
  m["="] = { mod: RA, hid: K.equal };
  m["+"] = { mod: RA | SH, hid: K.equal };

  // Everything below the number row is US.
  const pairs: [string, string, number][] = [
    ["-", "_", K.minus], ["[", "{", K.lbracket], ["]", "}", K.rbracket],
    ["\\", "|", K.backslash], [";", ":", K.semicolon], ["'", '"', K.quote],
    ["`", "~", K.grave], [",", "<", K.comma], [".", ">", K.period],
    ["/", "?", K.slash],
  ];
  for (const [plain, shifted, hid] of pairs) {
    m[plain] = { mod: 0, hid };
    m[shifted] = { mod: SH, hid };
  }
  return m;
}

/* ---- generated layouts ------------------------------------------------- */

/** One OS's version of a layout, in the form the paste code uses. */
export interface Variant {
  /** Characters typed by one key press. */
  map: CharMap;
  /** Characters typed with a dead key first: ´ then a for á. */
  seq: Record<string, KeyStroke[]>;
  /** The dead keys, by the accent they carry. */
  dead: CharMap;
}

const same = (a: KeyStroke, b: KeyStroke) => a.mod === b.mod && a.hid === b.hid;
const LEVEL_MODS = [0, SH, RA, RA | SH];

/* Every key press that types each character, in the order to prefer them:
   fewer modifiers first. */
function strokesOf(t: GenTable): Map<string, KeyStroke[]> {
  const out = new Map<string, KeyStroke[]>();
  t.levels.forEach((row, level) => {
    [...row].forEach((ch, i) => {
      if (ch === " ") return;
      const list = out.get(ch) ?? [];
      list.push({ mod: LEVEL_MODS[level], hid: KEYS[i] });
      out.set(ch, list);
    });
  });
  return out;
}

/* Every dead-key pair of a table, also for characters a key types directly:
   Linux has ' on AltGr on US International, Windows only as ' then Space,
   and that pair is what the two share. */
function pairsOf(t: GenTable, map: CharMap, dead: CharMap): Record<string, KeyStroke[]> {
  const seq: Record<string, KeyStroke[]> = {};
  const runs = [...t.compose];
  for (let i = 0; i + 2 < runs.length; i += 3) {
    const [d, base, out] = [runs[i], runs[i + 1], runs[i + 2]];
    if (seq[out] || !dead[d] || !map[base]) continue;
    seq[out] = [dead[d], map[base]];
  }
  return seq;
}

function variantOf(t: GenTable): Variant {
  const map = addCommon({});
  for (const [ch, list] of strokesOf(t)) map[ch] ??= list[0];
  const dead: CharMap = {};
  for (const [ch, mod, hid] of t.dead) dead[ch] ??= { mod, hid };
  const seq: Record<string, KeyStroke[]> = {};
  for (const [ch, s] of Object.entries(pairsOf(t, map, dead))) if (!map[ch]) seq[ch] = s;
  return { map, seq, dead };
}

/* What Windows and Linux agree on: the layout to use when the target's OS is
   not known. A key that is dead on either side is never a plain character. */
function commonOf(g: GenLayout, win: Variant, lin: Variant): Variant {
  const winAll = strokesOf(g.windows);
  const linAll = strokesOf(g.linux);
  const map = addCommon({});
  for (const [ch, list] of winAll) {
    const other = linAll.get(ch) ?? [];
    const s = list.find((a) => other.some((b) => same(a, b)));
    if (s) map[ch] = s;
  }
  const dead: CharMap = {};
  for (const [ch, s] of Object.entries(win.dead)) {
    if (Object.values(lin.dead).some((b) => same(s, b))) dead[ch] = s;
  }
  const seq: Record<string, KeyStroke[]> = {};
  const linPairs = pairsOf(g.linux, lin.map, lin.dead);
  for (const [ch, a] of Object.entries(pairsOf(g.windows, win.map, win.dead))) {
    const b = linPairs[ch];
    if (!map[ch] && b && a.length === b.length && a.every((s, i) => same(s, b[i]))) seq[ch] = a;
  }
  return { map, seq, dead };
}

/* ---- the list ------------------------------------------------------------ */

/** A selectable keyboard layout: a display label and its character tables. */
export interface Layout extends Variant {
  label: string;
  /** Where Windows and Linux differ: each one's own version. The base tables
      above are what both agree on. */
  os?: { windows: Variant; linux: Variant };
}

const plain = (label: string, map: CharMap): Layout => ({ label, map, seq: {}, dead: {} });

export const LAYOUTS: Record<string, Layout> = {
  en_us: plain("English (US)", buildUs()),
  ru_ru: plain("Русская", buildRu()),
  cs_cz: plain("Čeština", buildCz()),
  uk_ua: plain("Українська", buildUa()),
  lt_lt: plain("Lietuvių", buildLt()),
};
for (const g of GENERATED) {
  const windows = variantOf(g.windows);
  const linux = variantOf(g.linux);
  const common = commonOf(g, windows, linux);
  /* A character both type takes the same key whatever the OS: € on Italian is
     on AltGr+E and AltGr+5 on Windows, only AltGr+E on Linux. */
  for (const v of [windows, linux]) Object.assign(v.map, common.map);
  LAYOUTS[g.id] = { label: g.label, ...common, os: { windows, linux } };
}

export const DEFAULT_LAYOUT = "en_us";

/* The target's OS as the console names it ("windows", "linux", "macos", ...)
   -> the table to use. macOS, Android and an unknown OS get what Windows and
   Linux agree on: their own layouts are neither, and a BIOS is usually US. */
function variantFor(layoutId: string, os?: string): Variant {
  const layout = LAYOUTS[layoutId] || LAYOUTS[DEFAULT_LAYOUT];
  if (layout.os && (os === "windows" || os === "linux")) return layout.os[os];
  return layout;
}

/** The key presses that type a character on a layout, or null when it cannot. */
export function charToStrokes(layoutId: string, ch: string, os?: string): KeyStroke[] | null {
  const v = variantFor(layoutId, os);
  const one = v.map[ch];
  if (one) return [one];
  return v.seq[ch] ?? null;
}

/** Characters in @p text that the layout cannot produce, for warning the user. */
export function untypeableChars(layoutId: string, text: string, os?: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (ch === "\r") continue;
    if (!charToStrokes(layoutId, ch, os)) missing.add(ch);
  }
  return [...missing];
}

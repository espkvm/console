/*
 * Key names in text: "[[Ctrl+K]]" in a string becomes key caps (KeyText.vue),
 * and "Ctrl+K" splits into its keys (Keys.vue).
 */

/** "Ctrl+Shift+P" -> ["Ctrl", "Shift", "P"]; a lone "+" is the plus key. */
export function splitCombo(combo: string): string[] {
  if (combo === "+") return ["+"];
  return combo
    .split(/\+(?!$)/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export type TextPart = { text: string } | { keys: string };

/** "Press [[Esc]] to leave" -> text, keys, text. */
export function keyParts(s: string): TextPart[] {
  const out: TextPart[] = [];
  const re = /\[\[([^[\]]+)\]\]/g;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > at) out.push({ text: s.slice(at, m.index) });
    out.push({ keys: m[1] });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}

/** The same string with the markup gone, for a title attribute or a search. */
export function plainKeys(s: string): string {
  return s.replace(/\[\[([^[\]]+)\]\]/g, "$1");
}

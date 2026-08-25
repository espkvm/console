/*
 * Cutting a screen of text into the pieces the console draws.
 *
 * A character screen says one thing beyond the characters themselves: which
 * cells are drawn the other way round. On a menu that is the row you are on, and
 * text without it is a list with no cursor - which is why the device reports
 * those cells and why they are cut out here, as runs of [row, column, length].
 *
 * Its own module because it is the kind of thing worth having tests for: off by
 * one here shifts a highlight onto the wrong words.
 */

/** A piece of one row: either ordinary text, or drawn the other way round. */
export interface LayerSpan {
  text: string;
  mark: boolean;
}

/**
 * @param text  the screen, rows joined by newlines and trailing blanks trimmed
 * @param rows  how many rows the grid has, blank ones included
 * @param highlight  inverted cells as [row, column, length], in any order
 */
export function textSpans(text: string, rows: number, highlight?: number[][]): LayerSpan[][] {
  const lines = text.split("\n");
  while (lines.length < rows) lines.push("");

  const byRow = new Map<number, Array<[number, number]>>();
  for (const run of highlight ?? []) {
    const [r, c, len] = run;
    if (len > 0 && r >= 0 && c >= 0) {
      const list = byRow.get(r) ?? [];
      list.push([c, len]);
      byRow.set(r, list);
    }
  }

  return lines.slice(0, rows).map((line, r) => {
    const runs = (byRow.get(r) ?? []).sort((a, b) => a[0] - b[0]);
    /* A blank row still has to occupy its row: an empty element collapses to no
       height at all, and every row below it would then sit above the characters
       it was read from. A single space is the cheapest way to keep the box, and
       it is what a blank line copies as anyway. */
    if (!runs.length) return [{ text: line.length ? line : " ", mark: false }];

    /* Trailing blanks are trimmed off the text, so a highlight that runs past
       the last character needs its cells back before it can be laid over them. */
    const need = Math.max(...runs.map(([c, len]) => c + len));
    const padded = line.padEnd(need, " ");
    const spans: LayerSpan[] = [];
    let at = 0;
    for (const [c, len] of runs) {
      /* Runs that overlap - which a device should never send - must not make
         the row longer than it is by writing a piece of it twice. */
      const from = Math.max(at, c);
      const to = Math.max(from, c + len);
      if (from > at) spans.push({ text: padded.slice(at, from), mark: false });
      if (to > from) spans.push({ text: padded.slice(from, to), mark: true });
      at = Math.max(at, to);
    }
    if (at < padded.length) spans.push({ text: padded.slice(at), mark: false });
    return spans;
  });
}

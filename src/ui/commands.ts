/*
 * The command palette's list: everything the console can do, by name, so a
 * keyboard user types "scr" instead of hunting for the camera icon. App.vue
 * builds the commands from what this device and this sign-in can do; this
 * file only finds and orders them.
 */

export interface Command {
  /** Stable, for the recent list: "panel:input", "macro:Boot menu". */
  id: string;
  title: string;
  /** Shown to the right, dimmed: "Panels", "Keys". */
  group: string;
  /** Extra words that should find it ("photo" for Screenshot). */
  keywords?: string;
  /** A key that does the same outside the palette ("F", "?"). */
  hint?: string;
  /** Only in the results of a search, not in the list shown before typing. */
  searchOnly?: boolean;
  run: () => unknown;
}

/** How many recently used commands lead the list when nothing is typed. */
export const RECENT_MAX = 5;

const BOUNDARY = /[\s:+/(.,_-]/;

function words(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/*
 * Every typed word must start a word of the title, group or keywords.
 * A title that starts with the query comes first, then titles where every
 * word starts a word, then the rest, each in the order App.vue gave.
 */
export function findCommands(list: Command[], query: string, recent: string[] = []): Command[] {
  const q = words(query);
  if (!q.length) {
    const byId = new Map(list.map((c) => [c.id, c]));
    const first = recent.map((id) => byId.get(id)).filter((c): c is Command => Boolean(c));
    const seen = new Set(first.map((c) => c.id));
    return [...first, ...list.filter((c) => !seen.has(c.id) && !c.searchOnly)];
  }
  const whole = q.join(" ");
  const scored: { c: Command; s: number; i: number }[] = [];
  list.forEach((c, i) => {
    const title = c.title.toLowerCase();
    const hay = `${title} ${c.group.toLowerCase()} ${(c.keywords ?? "").toLowerCase()}`;
    /* A word matches from the start of a word: "scr" finds Screenshot and
       "the screen", not "description". */
    const at = (text: string, w: string) => {
      for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + 1)) {
        if (i === 0 || BOUNDARY.test(text[i - 1])) return true;
      }
      return false;
    };
    if (!q.every((w) => at(hay, w))) return;
    const starts = (w: string) => at(title, w);
    const s = title.startsWith(whole) ? 0 : q.every(starts) ? 1 : 2;
    scored.push({ c, s, i });
  });
  scored.sort((a, b) => a.s - b.s || a.i - b.i);
  return scored.map((x) => x.c);
}

/** The recent list with @p id moved to the front. */
export function remember(recent: string[], id: string): string[] {
  return [id, ...recent.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

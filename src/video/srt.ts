/* SubRip cues, as the recorder writes them next to a recording. */

export interface Cue {
  start: number; /* seconds */
  end: number;
  text: string;
}

const TIME = /(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})/;

export function parseSrt(src: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of src.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => TIME.test(l));
    if (at < 0) continue;
    const m = TIME.exec(lines[at]) as RegExpExecArray;
    const t = (i: number) => +m[i] * 3600 + +m[i + 1] * 60 + +m[i + 2] + +m[i + 3] / 1000;
    const text = lines.slice(at + 1).join("\n").trim();
    if (text) cues.push({ start: t(1), end: t(5), text });
  }
  return cues;
}

/** The same cues as WebVTT, which a <video> takes as a track. */
export function toVtt(cues: Cue[]): string {
  const t = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor(ms / 60000) % 60;
    const sec = Math.floor(ms / 1000) % 60;
    const pad = (v: number, n = 2) => String(v).padStart(n, "0");
    return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms % 1000, 3)}`;
  };
  return `WEBVTT\n\n${cues.map((c) => `${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join("\n")}`;
}

/** The cue showing at @p seconds, or "". */
export function cueAt(cues: Cue[], seconds: number): string {
  return cues
    .filter((c) => seconds >= c.start && seconds < c.end)
    .map((c) => c.text)
    .join("\n");
}

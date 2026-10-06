/*
 * A small VT100-style terminal for the target's serial console.
 *
 * Enough for a Linux console and for a PC BIOS redirected to serial, which
 * paints its menus with cursor moves and colours: printable text, CR, LF, BS,
 * TAB, and the ESC [ sequences for moving the cursor, erasing and SGR colour.
 * Anything else is swallowed rather than printed as garbage. A full emulator
 * (xterm.js) would be several times the size of the whole console, which has
 * to fit in the device's flash.
 */

export type Cell = { ch: string; fg: number; bg: number; bold: boolean; inv: boolean };
export type Run = { text: string; fg: number; bg: number; bold: boolean; inv: boolean };

const DEFAULT = -1; /* the terminal's own colour */

function blank(): Cell {
  return { ch: " ", fg: DEFAULT, bg: DEFAULT, bold: false, inv: false };
}

export class Terminal {
  readonly cols: number;
  readonly rows: number;
  readonly maxScrollback: number;
  /** Lines that scrolled off the top, oldest first. */
  scrollback: Cell[][] = [];
  screen: Cell[][];
  x = 0;
  y = 0;
  cursorVisible = true;
  #fg = DEFAULT;
  #bg = DEFAULT;
  #bold = false;
  #inv = false;
  #state: "text" | "esc" | "csi" | "skip1" = "text";
  #params = "";
  #saved = { x: 0, y: 0 };
  #decoder = new TextDecoder("utf-8", { fatal: false });

  constructor(cols = 80, rows = 25, maxScrollback = 2000) {
    this.cols = cols;
    this.rows = rows;
    this.maxScrollback = maxScrollback;
    this.screen = Array.from({ length: rows }, () => this.#row());
  }

  #row(): Cell[] {
    return Array.from({ length: this.cols }, blank);
  }

  reset() {
    this.scrollback = [];
    this.screen = Array.from({ length: this.rows }, () => this.#row());
    this.x = 0;
    this.y = 0;
    this.#fg = DEFAULT;
    this.#bg = DEFAULT;
    this.#bold = false;
    this.#inv = false;
    this.#state = "text";
  }

  /** Feed bytes from the target. */
  write(data: Uint8Array) {
    for (const ch of this.#decoder.decode(data, { stream: true })) this.#char(ch);
  }

  #char(ch: string) {
    if (this.#state === "esc") {
      this.#esc(ch);
      return;
    }
    if (this.#state === "csi") {
      if (/[0-9;?]/.test(ch)) {
        this.#params += ch;
        return;
      }
      this.#state = "text";
      this.#csi(ch, this.#params);
      this.#params = "";
      return;
    }
    if (this.#state === "skip1") {
      this.#state = "text"; /* the character-set byte after ESC ( or ESC ) */
      return;
    }
    switch (ch) {
      case "\x1b":
        this.#state = "esc";
        return;
      case "\r":
        this.x = 0;
        return;
      case "\n":
        this.#lineFeed();
        return;
      case "\b":
        if (this.x > 0) this.x--;
        return;
      case "\t":
        this.x = Math.min(this.cols - 1, (Math.floor(this.x / 8) + 1) * 8);
        return;
      case "\x07":
      case "\x00":
      case "\x0e":
      case "\x0f":
        return;
    }
    if (ch < " ") return;
    if (this.x >= this.cols) {
      this.x = 0;
      this.#lineFeed();
    }
    this.screen[this.y][this.x] = { ch, fg: this.#fg, bg: this.#bg, bold: this.#bold, inv: this.#inv };
    this.x++;
  }

  #esc(ch: string) {
    this.#state = "text";
    switch (ch) {
      case "[":
        this.#state = "csi";
        this.#params = "";
        return;
      case "(":
      case ")":
        this.#state = "skip1";
        return;
      case "7":
        this.#saved = { x: this.x, y: this.y };
        return;
      case "8":
        this.x = this.#saved.x;
        this.y = this.#saved.y;
        return;
      case "c":
        this.reset();
        return;
      case "D":
        this.#lineFeed();
        return;
      case "M":
        if (this.y > 0) this.y--;
        return;
      case "E":
        this.x = 0;
        this.#lineFeed();
        return;
    }
  }

  #csi(final: string, raw: string) {
    const priv = raw.startsWith("?");
    const nums = (priv ? raw.slice(1) : raw).split(";").map((s) => (s === "" ? NaN : Number(s)));
    const n = (i: number, def: number) => (Number.isFinite(nums[i]) && nums[i] > 0 ? nums[i] : def);
    if (priv) {
      if (nums[0] === 25) this.cursorVisible = final === "h";
      return;
    }
    switch (final) {
      case "A":
        this.y = Math.max(0, this.y - n(0, 1));
        break;
      case "B":
        this.y = Math.min(this.rows - 1, this.y + n(0, 1));
        break;
      case "C":
        this.x = Math.min(this.cols - 1, this.x + n(0, 1));
        break;
      case "D":
        this.x = Math.max(0, this.x - n(0, 1));
        break;
      case "G":
        this.x = Math.min(this.cols - 1, n(0, 1) - 1);
        break;
      case "d":
        this.y = Math.min(this.rows - 1, n(0, 1) - 1);
        break;
      case "H":
      case "f":
        this.y = Math.min(this.rows - 1, n(0, 1) - 1);
        this.x = Math.min(this.cols - 1, n(1, 1) - 1);
        break;
      case "J":
        this.#eraseDisplay(Number.isFinite(nums[0]) ? nums[0] : 0);
        break;
      case "K":
        this.#eraseLine(Number.isFinite(nums[0]) ? nums[0] : 0);
        break;
      case "m":
        this.#sgr(nums);
        break;
      case "s":
        this.#saved = { x: this.x, y: this.y };
        break;
      case "u":
        this.x = this.#saved.x;
        this.y = this.#saved.y;
        break;
    }
  }

  #eraseLine(mode: number) {
    const row = this.screen[this.y];
    const from = mode === 0 ? this.x : 0;
    const to = mode === 1 ? this.x : this.cols - 1;
    for (let i = from; i <= to && i < this.cols; i++) row[i] = this.#erased();
  }

  #eraseDisplay(mode: number) {
    if (mode === 2 || mode === 3) {
      for (let r = 0; r < this.rows; r++) this.screen[r] = this.screen[r].map(() => this.#erased());
      return;
    }
    if (mode === 0) {
      this.#eraseLine(0);
      for (let r = this.y + 1; r < this.rows; r++) this.screen[r] = this.screen[r].map(() => this.#erased());
    } else if (mode === 1) {
      this.#eraseLine(1);
      for (let r = 0; r < this.y; r++) this.screen[r] = this.screen[r].map(() => this.#erased());
    }
  }

  /* An erased cell keeps the current background, as a BIOS expects when it
     clears to blue. */
  #erased(): Cell {
    return { ch: " ", fg: DEFAULT, bg: this.#bg, bold: false, inv: false };
  }

  #sgr(nums: number[]) {
    if (nums.length === 0 || (nums.length === 1 && !Number.isFinite(nums[0]))) nums = [0];
    for (const p of nums) {
      if (!Number.isFinite(p) || p === 0) {
        this.#fg = DEFAULT;
        this.#bg = DEFAULT;
        this.#bold = false;
        this.#inv = false;
      } else if (p === 1) this.#bold = true;
      else if (p === 22) this.#bold = false;
      else if (p === 7) this.#inv = true;
      else if (p === 27) this.#inv = false;
      else if (p >= 30 && p <= 37) this.#fg = p - 30;
      else if (p >= 90 && p <= 97) this.#fg = p - 90 + 8;
      else if (p === 39) this.#fg = DEFAULT;
      else if (p >= 40 && p <= 47) this.#bg = p - 40;
      else if (p >= 100 && p <= 107) this.#bg = p - 100 + 8;
      else if (p === 49) this.#bg = DEFAULT;
    }
  }

  #lineFeed() {
    if (this.y < this.rows - 1) {
      this.y++;
      return;
    }
    this.scrollback.push(this.screen.shift() as Cell[]);
    if (this.scrollback.length > this.maxScrollback) this.scrollback.shift();
    this.screen.push(this.#row());
  }

  /** A row as runs of equal style, for drawing. */
  static runs(row: Cell[]): Run[] {
    const out: Run[] = [];
    for (const c of row) {
      const last = out[out.length - 1];
      if (last && last.fg === c.fg && last.bg === c.bg && last.bold === c.bold && last.inv === c.inv) {
        last.text += c.ch;
      } else {
        out.push({ text: c.ch, fg: c.fg, bg: c.bg, bold: c.bold, inv: c.inv });
      }
    }
    return out;
  }

  /** The whole screen as plain text, for copying. Trailing spaces trimmed. */
  text(withScrollback = true): string {
    const rows = withScrollback ? [...this.scrollback, ...this.screen] : this.screen;
    return rows.map((r) => r.map((c) => c.ch).join("").trimEnd()).join("\n").replace(/\n+$/, "");
  }
}

/*
 * A key press as the bytes a VT100 sends. Null for keys that send nothing, so
 * the browser keeps them (copy, page reload, ...).
 */
export function keyBytes(e: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): string | null {
  if (e.metaKey) return null;
  const special: Record<string, string> = {
    Enter: "\r",
    Backspace: "\x7f",
    Tab: "\t",
    Escape: "\x1b",
    ArrowUp: "\x1b[A",
    ArrowDown: "\x1b[B",
    ArrowRight: "\x1b[C",
    ArrowLeft: "\x1b[D",
    Home: "\x1b[H",
    End: "\x1b[F",
    Insert: "\x1b[2~",
    Delete: "\x1b[3~",
    PageUp: "\x1b[5~",
    PageDown: "\x1b[6~",
    F1: "\x1bOP",
    F2: "\x1bOQ",
    F3: "\x1bOR",
    F4: "\x1bOS",
    F5: "\x1b[15~",
    F6: "\x1b[17~",
    F7: "\x1b[18~",
    F8: "\x1b[19~",
    F9: "\x1b[20~",
    F10: "\x1b[21~",
    F11: "\x1b[23~",
    F12: "\x1b[24~",
  };
  if (special[e.key] !== undefined) return (e.altKey ? "\x1b" : "") + special[e.key];
  if (e.key.length !== 1) return null;
  if (e.ctrlKey) {
    const c = e.key.toLowerCase();
    if (c >= "a" && c <= "z") return String.fromCharCode(c.charCodeAt(0) - 96);
    if (c === " " || c === "@") return "\x00";
    if (c === "[") return "\x1b";
    if (c === "\\") return "\x1c";
    if (c === "]") return "\x1d";
    return null;
  }
  return (e.altKey ? "\x1b" : "") + e.key;
}

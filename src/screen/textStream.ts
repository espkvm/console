/*
 * The screen read as characters, streamed.
 *
 * The readings used to be fetched: one HTTPS request every 700 ms, each with a
 * handshake on it, which put about a second between a keypress and the
 * highlight moving on a boot menu. They arrive on the same WebSocket the video
 * uses instead - the device sends one the moment it has read a screen that
 * changed - and the socket is opened once.
 *
 * Updates carry only the rows that changed, so moving a highlight one line is a
 * few hundred bytes rather than the whole screen. A subscriber that has just
 * connected, or one whose screen changed shape, gets the whole reading.
 *
 * Polling /api/v1/screen/text stays as the fallback: onUnavailable fires when
 * this socket will not open or closes, and the caller goes back to asking.
 */
import type { ScreenText } from "../state/device";

interface Handlers {
  /** A reading, complete after applying whatever arrived. */
  onText(text: ScreenText): void;
  /** The screen is no longer characters - it booted, or drew a picture. */
  onGone(): void;
  /** No readings will come this way; ask for them the old way. */
  onUnavailable(reason: string): void;
}

/** What the device sends. A full reading is a ScreenText with two extra keys. */
type Message =
  | ({ kind: "text"; full: true } & ScreenText)
  | { kind: "text"; full: false; ageMs: number; lines: [number, string][]; highlight?: number[][] }
  | { kind: "text"; gone: true };

/** The first byte says what this subscriber wants; 2 is the reading. */
const SUBSCRIBE_TEXT = 2;

export class ScreenTextStream {
  #ws: WebSocket | null = null;
  #handlers: Handlers;
  #stopped = false;
  #current: ScreenText | null = null;

  constructor(handlers: Handlers) {
    this.#handlers = handlers;
    this.#connect();
  }

  stop() {
    this.#stopped = true;
    this.#ws?.close();
    this.#ws = null;
  }

  #connect() {
    if (this.#stopped) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${location.host}/video`);
    } catch {
      this.#handlers.onUnavailable("the text channel could not be opened");
      return;
    }
    this.#ws = ws;

    ws.onopen = () => {
      /* Subscribing happens on our first message: the device cannot send
         during the handshake. */
      ws.send(new Uint8Array([SUBSCRIBE_TEXT]));
    };

    ws.onmessage = (ev) => this.#onMessage(ev);

    ws.onclose = () => {
      if (this.#stopped) return;
      this.#handlers.onUnavailable("the text channel closed");
    };
  }

  #onMessage(ev: MessageEvent) {
    if (typeof ev.data !== "string") return;
    let msg: Message;
    try {
      msg = JSON.parse(ev.data) as Message;
    } catch {
      return;
    }
    if (msg.kind !== "text") return;

    if ("gone" in msg) {
      this.#current = null;
      this.#handlers.onGone();
      return;
    }
    if (msg.full) {
      const { kind, full, ...text } = msg;
      void kind;
      void full;
      this.#current = text;
      this.#handlers.onText(text);
      return;
    }
    /* Rows that changed, against the reading we already hold. Without one there
       is nothing to apply them to - which the device avoids sending, but a
       socket that dropped and came back could still land here. */
    if (!this.#current) return;
    const lines = this.#current.text.split("\n");
    for (const [row, s] of msg.lines) {
      if (row >= 0 && row < lines.length) lines[row] = s;
    }
    this.#current = {
      ...this.#current,
      text: lines.join("\n"),
      ageMs: msg.ageMs,
      highlight: msg.highlight,
    };
    this.#handlers.onText(this.#current);
  }
}

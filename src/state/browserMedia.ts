/*
 * Serving a file from this computer as the target's USB drive.
 *
 * The device asks for parts of the file over /ws/media and this tab answers
 * each from File.slice(): nothing is uploaded ahead, and nothing goes onto the
 * card. So the tab has to stay open while the target uses the drive. It asks
 * before closing, and a banner says why.
 *
 * The protocol is in the firmware, components/kvm_web/media_ws.c. A random
 * token names the file: after a dropped socket this tab reconnects with the
 * same token, and the device carries on with the reads it was waiting for.
 *
 * It lives here, not in the Media panel, because serving goes on with the
 * panel closed.
 */
import { reactive } from "vue";

const OP_ATTACH = 0x01;
const OP_DATA = 0x02;
const OP_FAILED = 0x03;
const OP_DETACH = 0x04;
const OP_READ = 0x81;
const OP_STATE = 0x82;
/* Reconnecting: soon at first, as the device waits 15 s for this tab, then
   less often. A tab that cannot get back in for a minute (signed out, the
   device gone) stops, and says so. */
const RETRY_MS = [500, 1000, 2000, 4000, 8000];
const GIVE_UP_MS = 60000;

export type ServeState = "off" | "connecting" | "serving" | "reconnecting";

export const browserMedia = reactive({
  state: "off" as ServeState,
  name: "",
  size: 0,
  /** Bytes the target has read from this tab. */
  served: 0,
  /** Bytes a second the target reads now, 0 while it reads nothing. */
  rate: 0,
  /** Why serving stopped, when the device stopped it. */
  stopped: "",
});

let file: File | null = null;
let cdrom = false;
let token = new Uint8Array(16);
let ws: WebSocket | null = null;
let retry = 0;
let tries = 0;
let lostAt = 0;
let rateTimer = 0;
let lastServed = 0;
/* Answers go out in the order asked: one read at a time from the file. */
let queue: Promise<void> = Promise.resolve();

function holdPage(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "";
}

/* Once a second, smoothed over a few seconds so the number holds still. */
function sampleRate() {
  const now = browserMedia.served - lastServed;
  lastServed = browserMedia.served;
  const prev = browserMedia.rate;
  browserMedia.rate = now === 0 ? 0 : Math.round(prev ? prev * 0.6 + now * 0.4 : now);
}

function attachMessage(): Uint8Array {
  const name = new TextEncoder().encode(file?.name ?? "").slice(0, 63);
  const m = new Uint8Array(26 + name.length);
  const v = new DataView(m.buffer);
  m[0] = OP_ATTACH;
  m[1] = cdrom ? 1 : 0;
  v.setBigUint64(2, BigInt(file?.size ?? 0), true);
  m.set(token, 10);
  m.set(name, 26);
  return m;
}

function answer(sock: WebSocket, id: number, off: number, len: number) {
  queue = queue.then(async () => {
    if (sock !== ws || sock.readyState !== WebSocket.OPEN || !file) return;
    let data: ArrayBuffer | null = null;
    try {
      data = await file.slice(off, off + len).arrayBuffer();
    } catch {
      data = null; /* the file was moved or changed on disk */
    }
    if (sock !== ws || sock.readyState !== WebSocket.OPEN) return;
    const ok = data !== null && data.byteLength === len;
    const m = new Uint8Array(5 + (ok ? len : 0));
    m[0] = ok ? OP_DATA : OP_FAILED;
    new DataView(m.buffer).setUint32(1, id, true);
    if (ok) m.set(new Uint8Array(data as ArrayBuffer), 5);
    sock.send(m);
    if (ok) browserMedia.served += len;
  });
}

const STOP_REASONS: Record<number, string> = {
  1: "Another tab is serving the drive now.",
  2: "Virtual media is off. Turn it on in Media and restart the device.",
  3: "A view-only sign-in cannot serve the drive.",
  4: "The drive holds another medium now.",
};

function onMessage(sock: WebSocket, ev: MessageEvent) {
  if (!(ev.data instanceof ArrayBuffer)) return;
  const b = new Uint8Array(ev.data);
  const v = new DataView(ev.data);
  if (b[0] === OP_READ && b.length >= 17) {
    answer(sock, v.getUint32(1, true), Number(v.getBigUint64(5, true)), v.getUint32(13, true));
  } else if (b[0] === OP_STATE && b.length >= 2) {
    if (b[1] === 0) browserMedia.state = "serving";
    else finish(STOP_REASONS[b[1]] ?? "The device stopped the drive.");
  }
}

function connect() {
  if (!file) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const sock = new WebSocket(`${proto}://${location.host}/ws/media`);
  sock.binaryType = "arraybuffer";
  ws = sock;
  sock.onopen = () => {
    tries = 0;
    lostAt = 0;
    sock.send(attachMessage());
  };
  sock.onmessage = (ev) => onMessage(sock, ev);
  sock.onclose = () => {
    if (sock !== ws || !file) return;
    if (!lostAt) lostAt = Date.now();
    if (Date.now() - lostAt > GIVE_UP_MS) {
      finish("This tab lost the connection to the device.");
      return;
    }
    browserMedia.state = "reconnecting";
    retry = window.setTimeout(connect, RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)]);
  };
}

/* Stop serving and forget the file. */
function finish(reason = "") {
  file = null;
  window.clearTimeout(retry);
  const sock = ws;
  ws = null;
  sock?.close();
  window.clearInterval(rateTimer);
  browserMedia.rate = 0;
  browserMedia.state = "off";
  browserMedia.stopped = reason;
  window.removeEventListener("beforeunload", holdPage);
}

/** Put @p f in the target's drive, served from this tab. */
export function serveFile(f: File, asCdrom: boolean) {
  finish();
  file = f;
  cdrom = asCdrom;
  token = crypto.getRandomValues(new Uint8Array(16));
  tries = 0;
  lostAt = 0;
  browserMedia.name = f.name;
  browserMedia.size = f.size;
  browserMedia.served = 0;
  lastServed = 0;
  browserMedia.rate = 0;
  rateTimer = window.setInterval(sampleRate, 1000);
  browserMedia.stopped = "";
  browserMedia.state = "connecting";
  window.addEventListener("beforeunload", holdPage);
  connect();
}

/** Take the file out of the drive: the target sees it empty. */
export function stopServing() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(new Uint8Array([OP_DETACH]));
  finish();
}

/** A phone or tablet may stop a tab in the background, and the drive with it. */
export const mobileBrowser = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

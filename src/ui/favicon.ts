/*
 * The tab's icon says what the device is doing, for a console left in a
 * background tab: grey when unreachable, a ring while updating, a blinking red
 * dot while recording, a power sign when the target is off, a dash with no
 * picture. Drawn on a canvas from favicon.ico, so nothing new is served.
 */

export type FaviconKind = "ok" | "offline" | "update" | "rec" | "off" | "nosignal";

export interface FaviconInput {
  online: boolean;
  /** HDMI signal: false when there is none, undefined when not known yet. */
  signal?: boolean;
  /** The ATX power LED says the target is off. */
  targetOff?: boolean;
  recording?: boolean;
  /** An update is running: its percent, or null while it has none. */
  update?: number | null;
}

export interface FaviconState {
  kind: FaviconKind;
  percent?: number;
}

/* One sign at a time, the one that matters most first. */
export function faviconState(s: FaviconInput): FaviconState {
  if (!s.online) return { kind: "offline" };
  if (s.update !== undefined) return { kind: "update", percent: s.update ?? undefined };
  if (s.recording) return { kind: "rec" };
  if (s.targetOff) return { kind: "off" };
  if (s.signal === false) return { kind: "nosignal" };
  return { kind: "ok" };
}

/** Only the recording dot moves, and a background tab ticks at most once a second. */
export function faviconBlinks(s: FaviconState): boolean {
  return s.kind === "rec";
}

const SIZE = 32;
const ORIGINAL = "./favicon.ico";

function badge(ctx: CanvasRenderingContext2D, fill: string) {
  ctx.beginPath();
  ctx.arc(24, 24, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#0e1116";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(24, 24, 6, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function draw(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, s: FaviconState, lit: boolean) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (s.kind === "offline") {
    ctx.filter = "grayscale(1)";
    ctx.globalAlpha = 0.45;
  }
  ctx.drawImage(logo, 0, 0, SIZE, SIZE);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  if (s.kind === "update") {
    ctx.beginPath();
    ctx.arc(24, 24, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#0e1116";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2b3444";
    ctx.beginPath();
    ctx.arc(24, 24, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#4c9aff";
    ctx.beginPath();
    const p = (s.percent ?? 25) / 100;
    ctx.arc(24, 24, 5.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(p, 0.08));
    ctx.stroke();
  } else if (s.kind === "rec") {
    if (lit) badge(ctx, "#f85149");
  } else if (s.kind === "off") {
    badge(ctx, "#6e7681");
    ctx.strokeStyle = "#0e1116";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(24, 24.5, 3, -Math.PI / 2 + 0.7, -Math.PI / 2 - 0.7 + Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(24, 20);
    ctx.lineTo(24, 23.5);
    ctx.stroke();
  } else if (s.kind === "nosignal") {
    badge(ctx, "#d29922");
    ctx.strokeStyle = "#0e1116";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(21, 24);
    ctx.lineTo(27, 24);
    ctx.stroke();
  }
}

/**
 * Keeps the tab icon in step: call set() whenever the state may have changed.
 * The "ok" state puts the original file back.
 */
export function createFavicon(doc: Document = document) {
  let state: FaviconState = { kind: "ok" };
  let lit = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  let logo: HTMLImageElement | null = null;
  let ready = false;
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  function link(): HTMLLinkElement {
    let l = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!l) {
      l = doc.createElement("link");
      l.rel = "icon";
      doc.head.appendChild(l);
    }
    return l;
  }

  function paint() {
    const l = link();
    if (state.kind === "ok" || !ctx) {
      if (l.getAttribute("href") !== ORIGINAL) l.href = ORIGINAL;
      return;
    }
    if (!ready || !logo) return;
    draw(ctx, logo, state, lit);
    l.href = canvas.toDataURL("image/png");
  }

  function set(next: FaviconState) {
    if (next.kind === state.kind && next.percent === state.percent) return;
    state = next;
    lit = true;
    if (faviconBlinks(state) && !timer) {
      timer = setInterval(() => {
        lit = !lit;
        paint();
      }, 1000);
    } else if (!faviconBlinks(state) && timer) {
      clearInterval(timer);
      timer = undefined;
    }
    if (state.kind !== "ok" && !logo) {
      logo = new Image();
      logo.onload = () => {
        ready = true;
        paint();
      };
      logo.src = ORIGINAL;
    }
    paint();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    state = { kind: "ok" };
    paint();
  }

  return { set, stop };
}

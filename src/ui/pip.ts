/*
 * The target's screen in a small window that stays on top of other apps
 * (Document Picture-in-Picture, Chrome and Edge on a desktop). Only the
 * picture goes there: the window copies whatever the console draws, so every
 * stream path (MJPEG, H.264 over the WebSocket, WebRTC) works unchanged.
 *
 * While the window is open the console counts as watched even with its tab
 * hidden, so the H.264 decoder keeps running (see video/stream.ts).
 */
import { shallowRef } from "vue";

type PipApi = {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
};

function api(): PipApi | undefined {
  return (window as Window & { documentPictureInPicture?: PipApi }).documentPictureInPicture;
}

export const pipSupported = !!api();

/** The open window, or null. */
export const pipWindow = shallowRef<Window | null>(null);

/** Fired on window when the console starts or stops counting as watched. */
export const WATCH_EVENT = "espkvm-watch";

/** Someone sees the picture: the tab is visible or the small window is open. */
export function pictureWatched(): boolean {
  return document.visibilityState === "visible" || pipWindow.value !== null;
}

function changed() {
  window.dispatchEvent(new Event(WATCH_EVENT));
}

/*
 * The WebRTC path decodes into a hidden video element (video/rtcStream.ts)
 * and copies it to the canvas on each presented frame. A hidden tab may stop
 * presenting, so read that element directly when it has a picture.
 */
function rtcVideo(): HTMLVideoElement | null {
  const v = document.querySelector<HTMLVideoElement>("video[data-espkvm-rtc]");
  return v && v.videoWidth > 0 ? v : null;
}

function sizeOf(src: CanvasImageSource): [number, number] {
  if (src instanceof HTMLVideoElement) return [src.videoWidth, src.videoHeight];
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  if (src instanceof HTMLCanvasElement) return [src.width, src.height];
  return [0, 0];
}

/**
 * Open the window, or close it when it is open. `source` returns the
 * console's picture element (the canvas or the MJPEG image).
 */
export async function togglePip(source: () => HTMLCanvasElement | HTMLImageElement | null, title: string) {
  if (pipWindow.value) {
    pipWindow.value.close();
    return;
  }
  const pip = api();
  if (!pip) return;
  const first = rtcVideo() ?? source();
  const [w, h] = first ? sizeOf(first) : [16, 9];
  /* A quarter of a 1920 wide screen, in the picture's shape. */
  const width = 480;
  const height = Math.round((width * (h || 9)) / (w || 16));
  const win = await pip.requestWindow({ width, height });
  win.document.title = title;
  const style = win.document.createElement("style");
  style.textContent =
    "html,body{margin:0;height:100%;background:#000;overflow:hidden}" +
    "canvas{display:block;width:100%;height:100%;object-fit:contain}";
  win.document.head.append(style);
  const out = win.document.createElement("canvas");
  win.document.body.append(out);
  const ctx = out.getContext("2d");

  let raf = 0;
  const draw = () => {
    raf = win.requestAnimationFrame(draw);
    const src = rtcVideo() ?? source();
    if (!src || !ctx) return;
    const [sw, sh] = sizeOf(src);
    if (!sw || !sh) return;
    if (out.width !== sw || out.height !== sh) {
      out.width = sw;
      out.height = sh;
    }
    try {
      ctx.drawImage(src, 0, 0);
    } catch {
      /* the MJPEG image between two frames; the next one draws */
    }
  };
  raf = win.requestAnimationFrame(draw);

  pipWindow.value = win;
  changed();
  win.addEventListener("pagehide", () => {
    win.cancelAnimationFrame(raf);
    pipWindow.value = null;
    changed();
  });
}

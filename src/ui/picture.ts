/*
 * The target's picture as pixels this page can read. Over the WebSocket it is
 * already a canvas; over the MJPEG stream it is an <img>, which is copied into
 * a canvas of its own each time it is read.
 */
export interface Picture {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Bring the pixels up to date before reading them. */
  refresh(): void;
}

export function pictureOf(el: HTMLElement | null): Picture | null {
  if (el instanceof HTMLCanvasElement) {
    const ctx = el.getContext("2d", { willReadFrequently: true });
    return ctx ? { ctx, width: el.width, height: el.height, refresh: () => {} } : null;
  }
  if (el instanceof HTMLImageElement && el.naturalWidth > 0) {
    const c = document.createElement("canvas");
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    return { ctx, width: c.width, height: c.height, refresh: () => ctx.drawImage(el, 0, 0) };
  }
  return null;
}

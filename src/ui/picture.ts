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

export async function downloadScreenshot(canvas: HTMLCanvasElement): Promise<boolean> {
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!image) return false;

  const url = URL.createObjectURL(image);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `espkvm-screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.click();
  } finally {
    // Give the browser time to start reading the download before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}

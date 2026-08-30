/*
 * Where the frame actually sits inside the element that shows it.
 *
 * Both sizing modes letterbox: the element fills the stage and the picture sits
 * inside it, so everything that has to line up with the picture - the pointer
 * mapping, the selectable text layer, the engaged outline - must work from the
 * frame's own size, not from the element's box.
 *
 * Reading that size is where this went wrong (#32). A canvas carries the frame
 * in `width`/`height`, the backing store. An `<img>` has those two properties
 * as well, but on an image they are the RENDERED size - so asking for `width`
 * first quietly answers "the element box" for the MJPEG stream, the padding
 * comes out as zero, and the pointer maps into the black bars. On a 4K screen
 * with a 1080p target that is two cursors drifting apart, and it looks like a
 * pointer bug rather than a measurement one. `naturalWidth` is the frame, and
 * only an image has it, so it is asked for first.
 */

export interface Intrinsic {
  w: number;
  h: number;
}

export interface Box {
  width: number;
  height: number;
}

export interface Letterbox {
  /** The picture's size on screen, in CSS pixels. */
  width: number;
  height: number;
  /** The black bars: how far the picture starts from the element's edge. */
  padX: number;
  padY: number;
}

/** The frame's own size: an image's natural size, a canvas's backing store. */
export function intrinsicSize(el: unknown): Intrinsic | null {
  const img = el as { naturalWidth?: number; naturalHeight?: number };
  if (typeof img.naturalWidth === "number" && img.naturalWidth > 0) {
    return { w: img.naturalWidth, h: img.naturalHeight ?? 0 };
  }
  const canvas = el as { width?: number; height?: number };
  if (typeof canvas.width === "number" && canvas.width > 0) {
    return { w: canvas.width, h: canvas.height ?? 0 };
  }
  return null;
}

/**
 * Fit @p of into @p box the way the CSS does: `object-fit: contain` when the
 * picture may grow, `scale-down` when it may not.
 */
export function letterbox(box: Box, of: Intrinsic, grow: boolean): Letterbox {
  const scale = grow
    ? Math.min(box.width / of.w, box.height / of.h)
    : Math.min(1, box.width / of.w, box.height / of.h);
  const width = of.w * scale;
  const height = of.h * scale;
  return { width, height, padX: (box.width - width) / 2, padY: (box.height - height) / 2 };
}

export type FitMode = "fit" | "stretch" | "actual";

/** The element's box, plus where the picture is inside it. */
export function pictureRect(
  el: HTMLElement,
  fit: FitMode,
): (Letterbox & { rect: DOMRect }) | null {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const size = intrinsicSize(el) ?? { w: rect.width, h: rect.height };
  if (size.w <= 0 || size.h <= 0) return null;
  return { rect, ...letterbox(rect, size, fit === "stretch") };
}

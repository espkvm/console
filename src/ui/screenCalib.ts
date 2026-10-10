/*
 * Find where the captured screen sits on a target's desktop.
 *
 * With more than one screen, the absolute pointer spans the whole desktop, so
 * the picture is only part of it. Rather than ask for four numbers in pixels -
 * which a screen scaled to 150% makes hard to know - the pointer is sent to a
 * grid of points across the whole desktop, and the picture says where it
 * appeared each time. Two straight lines through those points give the
 * desktop's size and this screen's place in it, in the picture's pixels.
 *
 * The cursor is found as what changed between frames: it leaves one spot and
 * appears at another. Its arrow tip is the top-left of the patch it drew.
 */
import type { Control } from "../input/control";
import { ABS_MAX } from "../input/control";
import type { Picture } from "./picture";

export interface ScreenWindow {
  deskW: number;
  deskH: number;
  x: number;
  y: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

/* Every other pixel is plenty to find a cursor and halves the work. */
const STEP = 2;
const CHANGED = 40; /* summed RGB difference that counts as changed */
/* A cursor patch, in picture pixels: anything far bigger is the screen redrawing. */
const MIN_PIXELS = 8;
const MAX_SIDE = 96;

interface Patch {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
}

function snap(pic: Picture, w: number, h: number): Uint8ClampedArray {
  pic.refresh();
  return pic.ctx.getImageData(0, 0, w, h).data;
}

/* The changed spots, grouped into patches of nearby pixels. */
function patches(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, h: number): Patch[] {
  const out: Patch[] = [];
  for (let y = 0; y < h; y += STEP) {
    for (let x = 0; x < w; x += STEP) {
      const i = (y * w + x) * 4;
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d < CHANGED) continue;
      let p = out.find((q) => x >= q.x0 - 24 && x <= q.x1 + 24 && y >= q.y0 - 24 && y <= q.y1 + 24);
      if (!p) {
        p = { x0: x, y0: y, x1: x, y1: y, n: 0 };
        out.push(p);
      }
      p.x0 = Math.min(p.x0, x);
      p.y0 = Math.min(p.y0, y);
      p.x1 = Math.max(p.x1, x);
      p.y1 = Math.max(p.y1, y);
      p.n++;
    }
  }
  return out.filter((p) => p.n >= MIN_PIXELS / STEP && p.x1 - p.x0 <= MAX_SIDE && p.y1 - p.y0 <= MAX_SIDE);
}

/* Did anything at all change - to tell a frozen picture from a hidden cursor. */
function changedAnywhere(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  for (let i = 0; i < a.length; i += 4 * 97) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >= CHANGED) return true;
  }
  return false;
}

const near = (p: Patch, at: { x: number; y: number }) =>
  Math.abs(p.x0 - at.x) < 32 && Math.abs(p.y0 - at.y) < 32;

/*
 * The same, but deaf to points that are not on the line. Sent where no screen
 * is - below a shorter screen, say - the cursor is held at the nearest edge,
 * and those points would bend the line; so the worst is dropped and the line
 * drawn again until every point left is within a few pixels of it.
 */
function robustFit(pairs: [number, number][]): { slope: number; offset: number } | null {
  let pts = [...pairs];
  for (;;) {
    const f = fit(pts);
    if (!f || pts.length <= 3) return f;
    let worst = 0;
    let worstAt = -1;
    pts.forEach(([a, p], i) => {
      const r = Math.abs(f.slope * a + f.offset - p);
      if (r > worst) {
        worst = r;
        worstAt = i;
      }
    });
    if (worst <= 8) return f;
    pts = pts.filter((_, i) => i !== worstAt);
  }
}

/* Least squares: picture = slope * abs + offset. */
function fit(pairs: [number, number][]): { slope: number; offset: number } | null {
  const n = pairs.length;
  if (n < 2) return null;
  const mx = pairs.reduce((s, [a]) => s + a, 0) / n;
  const my = pairs.reduce((s, [, p]) => s + p, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const [a, p] of pairs) {
    sxx += (a - mx) * (a - mx);
    sxy += (a - mx) * (p - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, offset: my - slope * mx };
}

/**
 * Sweep and solve. Returns null when this is the target's only screen (the
 * pointer reaches every edge of the picture at the edges of its range).
 * Throws an Error saying what to do when the pointer never showed.
 */
export async function findScreen(
  control: Control,
  canvas: Picture,
  onStep?: (n: number, of: number) => void,
): Promise<ScreenWindow | null> {
  const ctx = canvas;
  const w = canvas.width;
  const h = canvas.height;
  if (w < 64 || h < 64) throw new Error("there is no picture to watch yet");

  const xs = Array.from({ length: 12 }, (_, i) => (i + 0.5) / 12);
  const ys = [0.15, 0.5, 0.85];
  const grid = ys.flatMap((fy, row) => (row % 2 ? [...xs].reverse() : xs).map((fx) => [fx, fy]));

  const xPairs: [number, number][] = [];
  const yPairs: [number, number][] = [];
  let cursor: { x: number; y: number } | null = null;
  let before = snap(ctx, w, h);
  /* For the error message: what the sweep actually saw. */
  let anyChange = 0;
  let tooMuch = 0;
  let rawChanged = 0;

  /* The step before, until its cursor has been seen. */
  let pending: { ax: number; ay: number } | null = null;

  /* Take a late arrival as the step it belongs to. */
  const credit = (found: Patch[]) => {
    const fresh = found.filter((p) => !cursor || !near(p, cursor));
    if (fresh.length === 1) {
      cursor = { x: fresh[0].x0, y: fresh[0].y0 };
      if (pending) {
        xPairs.push([pending.ax, cursor.x]);
        yPairs.push([pending.ay, cursor.y]);
        pending = null;
      }
    } else if (fresh.length > 1) {
      tooMuch++;
      cursor = null;
      pending = null;
    } else if (found.length) {
      cursor = null; /* only the old spot changed: it left this screen */
    }
  };

  for (let i = 0; i < grid.length; i++) {
    onStep?.(i + 1, grid.length);
    /* Let the picture settle first. Whatever still changes now is the step
       before arriving late, and is credited to it rather than to this one. */
    {
      const t0 = performance.now();
      let quiet = 0;
      while (quiet < 2 && performance.now() - t0 < 2000) {
        await sleep(120);
        await frame();
        const now = snap(ctx, w, h);
        const found = patches(before, now, w, h);
        if (found.length) {
          credit(found);
          quiet = 0;
        } else {
          quiet++;
        }
        before = now;
      }
    }
    pending = null;

    const ax = Math.round(grid[i][0] * ABS_MAX);
    const ay = Math.round(grid[i][1] * ABS_MAX);
    control.mouseAbsolute(0, ax, ay);
    pending = { ax, ay };
    /* Done when the cursor shows somewhere new, or - if it was on this screen -
       when it is gone from where it was. A change anywhere else (compression
       noise, a clock) is not the move. */
    const t0 = performance.now();
    let after = snap(ctx, w, h);
    let found = patches(before, after, w, h);
    const moved = () =>
      found.some((p) => !cursor || !near(p, cursor)) || (cursor !== null && found.some((p) => near(p, cursor!)));
    while (!moved() && performance.now() - t0 < 2000) {
      await frame();
      after = snap(ctx, w, h);
      found = patches(before, after, w, h);
    }
    await sleep(150);
    await frame();
    after = snap(ctx, w, h);
    found = patches(before, after, w, h);
    if (changedAnywhere(before, after)) rawChanged++;
    if (found.length) anyChange++;
    console.debug("[findScreen]", ax, ay, JSON.stringify(found));
    credit(found);
    before = after;
  }

  const fx = robustFit(xPairs);
  const fy = robustFit(yPairs);
  if (!fx || !fy || xPairs.length < 3) {
    throw new Error(
      `the pointer did not show up in the picture often enough - make it visible on the target, on a still screen, and try again ` +
        `(seen at ${xPairs.length} of ${grid.length} points; the picture changed ${rawChanged} times, ` +
        `${anyChange} of them like a cursor, ${tooMuch} too busy to tell)`,
    );
  }
  /* picture = slope * abs + offset, and abs = (x + picture) / desk * ABS_MAX. */
  const deskW = Math.round(fx.slope * ABS_MAX);
  const deskH = Math.round(fy.slope * ABS_MAX);
  const x = Math.round(-fx.offset);
  const y = Math.round(-fy.offset);
  /* Within a few pixels of the picture itself: one screen, nothing to correct. */
  if (Math.abs(deskW - w) < w * 0.03 && Math.abs(deskH - h) < h * 0.03 && Math.abs(x) < 16 && Math.abs(y) < 16) {
    return null;
  }
  /* The desktop must hold this whole screen. When it does not, something
     moved the pointer during the sweep - a hand on the mouse - and saving it
     would send every click to the wrong place. */
  if (x < -16 || y < -16 || x + w > deskW + 16 || y + h > deskH + 16) {
    throw new Error(
      `the figures came out impossible (desktop ${deskW}x${deskH}, this screen at ${x}, ${y}) - ` +
        "keep the mouse still and the screen still while it looks, and try again",
    );
  }
  return { deskW, deskH, x: Math.max(0, x), y: Math.max(0, y) };
}

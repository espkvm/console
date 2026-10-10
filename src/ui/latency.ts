/*
 * The whole way round: move the target's mouse pointer and time how long until
 * the picture in this browser shows it moved. That is everything at once - this
 * page, the network, the device, USB, the target drawing its cursor, HDMI,
 * capture, encode, the network back and the decoder - which is the delay a
 * person actually feels.
 *
 * It watches a small square where the pointer is sent. A picture that moves
 * there by itself (a video playing) looks the same as the pointer arriving, so
 * it wants a still screen. The canvas is read on every animation frame, so the
 * figures are good to about one display refresh.
 */
import type { Control } from "../input/control";
import { ABS_MAX } from "../input/control";
import type { Picture } from "./picture";

export interface LatencyResult {
  /** Milliseconds, one per try that saw the pointer arrive. */
  samples: number[];
  median: number;
  min: number;
  max: number;
}

const TRIES = 6;
const TIMEOUT_MS = 2000;
const SETTLE_MS = 500;
/* The arrow's tip is at the point and it is drawn down and to the right. */
const BOX_W = 16;
const BOX_H = 24;
/* Mean change per channel that counts as the pointer having arrived;
   compression noise on a still screen stays well under it. */
const THRESHOLD = 12;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

function region(pic: Picture, x: number, y: number): Uint8ClampedArray {
  pic.refresh();
  return pic.ctx.getImageData(x, y, BOX_W, BOX_H).data;
}

function meanDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / ((a.length / 4) * 3);
}

/* Nothing in the square moves by itself for a few frames. */
async function still(ctx: Picture, [x, y]: readonly [number, number]): Promise<boolean> {
  let prev = region(ctx, x, y);
  for (let i = 0; i < 8; i++) {
    await frame();
    const cur = region(ctx, x, y);
    if (meanDiff(prev, cur) > THRESHOLD / 2) return false;
    prev = cur;
  }
  return true;
}

/**
 * Measure. Throws an Error whose message says what to do when it cannot:
 * no picture drawn here, or the pointer never showed.
 */
export async function measureLatency(
  control: Control,
  canvas: Picture,
  onTry?: (n: number, of: number) => void,
): Promise<LatencyResult> {
  const ctx = canvas;
  if (canvas.width < 64 || canvas.height < 64) {
    throw new Error("there is no picture to watch yet");
  }
  /* Pairs of points the pointer goes back and forth between. The middle first;
     the corners for when the middle is busy - above all when the target is this
     very computer, and the middle of its screen is this console showing itself
     showing itself, changing all the time. */
  const pairs = [
    [[0.45, 0.5], [0.55, 0.5]],
    [[0.08, 0.12], [0.16, 0.12]],
    [[0.84, 0.88], [0.92, 0.88]],
    [[0.08, 0.88], [0.16, 0.88]],
    [[0.84, 0.12], [0.92, 0.12]],
  ];
  const toPoint = ([fx, fy]: number[]) => ({
    abs: [Math.round(fx * ABS_MAX), Math.round(fy * ABS_MAX)] as const,
    px: [Math.round(fx * canvas.width), Math.round(fy * canvas.height)] as const,
  });
  let points: ReturnType<typeof toPoint>[] | null = null;
  for (const pair of pairs) {
    const pts = pair.map(toPoint);
    control.mouseAbsolute(0, pts[0].abs[0], pts[0].abs[1]);
    await sleep(SETTLE_MS * 2);
    if ((await still(ctx, pts[0].px)) && (await still(ctx, pts[1].px))) {
      points = pts;
      break;
    }
  }
  if (!points) {
    throw new Error(
      "the picture keeps changing everywhere the pointer could go - a video playing, or this console seen on its own screen",
    );
  }

  const samples: number[] = [];
  for (let i = 0; i < TRIES; i++) {
    onTry?.(i + 1, TRIES);
    const to = points[(i + 1) % 2];
    if (!(await still(ctx, to.px))) {
      await sleep(SETTLE_MS);
      continue; /* it moved by itself: this try would time the wrong thing */
    }
    const before = region(ctx, to.px[0], to.px[1]);
    const t0 = performance.now();
    control.mouseAbsolute(0, to.abs[0], to.abs[1]);
    for (;;) {
      const now = await frame();
      if (meanDiff(before, region(ctx, to.px[0], to.px[1])) > THRESHOLD) {
        samples.push(Math.round(now - t0));
        break;
      }
      if (now - t0 > TIMEOUT_MS) break;
    }
    await sleep(SETTLE_MS);
  }
  if (samples.length < 2) {
    throw new Error(
      "the pointer never showed up in the picture - is the mouse pointer visible on the target, on a still screen?",
    );
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples,
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

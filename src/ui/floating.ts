/*
 * A small window floating over the page: the remote, the gamepad, the floating
 * keyboard. Dragged by its header, remembered between visits, and kept whole
 * on the screen - also when the browser window shrinks or the panel itself
 * grows, which used to leave it hanging off an edge where it could not be
 * grabbed again.
 */
import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from "vue";

const MARGIN = 8;

export type Point = { x: number; y: number };

function load(key: string): Point | null {
  try {
    const x = Number(localStorage.getItem(`${key}.x`));
    const y = Number(localStorage.getItem(`${key}.y`));
    if (localStorage.getItem(`${key}.x`) === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

/** Where a box of this size may sit: inside the viewport, or pinned top-left when bigger. */
export function keepInside(p: Point, w: number, h: number, vw: number, vh: number): Point {
  return {
    x: Math.max(MARGIN, Math.min(p.x, vw - w - MARGIN)),
    y: Math.max(MARGIN, Math.min(p.y, vh - h - MARGIN)),
  };
}

export function useFloating(opts: {
  /** localStorage prefix: `${key}.x`, `${key}.y`. */
  key: string;
  el: Ref<HTMLElement | null>;
  /** Where it starts the first time. */
  initial: () => Point;
  /** Off while the panel is docked rather than floating. */
  active?: () => boolean;
}) {
  const pos = ref<Point>(load(opts.key) ?? opts.initial());
  const active = () => (opts.active ? opts.active() : true);

  function fit() {
    if (!active()) return;
    const el = opts.el.value;
    const w = el?.offsetWidth ?? 240;
    const h = el?.offsetHeight ?? 200;
    const next = keepInside(pos.value, w, h, window.innerWidth, window.innerHeight);
    if (next.x !== pos.value.x || next.y !== pos.value.y) pos.value = next;
  }

  let from: { x: number; y: number; px: number; py: number } | null = null;

  function dragStart(e: PointerEvent) {
    if (!active()) return;
    if ((e.target as HTMLElement).closest("button, select, input, a")) return;
    from = { x: e.clientX, y: e.clientY, px: pos.value.x, py: pos.value.y };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* the drag still works while the pointer stays over the header */
    }
  }

  function dragMove(e: PointerEvent) {
    if (!from) return;
    pos.value = { x: from.px + (e.clientX - from.x), y: from.py + (e.clientY - from.y) };
    fit();
  }

  function dragEnd() {
    if (!from) return;
    from = null;
    try {
      localStorage.setItem(`${opts.key}.x`, String(Math.round(pos.value.x)));
      localStorage.setItem(`${opts.key}.y`, String(Math.round(pos.value.y)));
    } catch {
      /* not remembered, no harm */
    }
  }

  /* The panel may be swapped for another element (a different look), so the
     observer follows whichever one is there. */
  let obs: ResizeObserver | null = null;
  function observe(el: HTMLElement | null) {
    obs?.disconnect();
    obs = null;
    if (el && "ResizeObserver" in window) {
      obs = new ResizeObserver(() => fit());
      obs.observe(el);
    }
    void nextTick(fit);
  }
  watch(opts.el, observe);
  onMounted(async () => {
    await nextTick();
    observe(opts.el.value);
    window.addEventListener("resize", fit);
  });
  onUnmounted(() => {
    window.removeEventListener("resize", fit);
    obs?.disconnect();
  });

  return { pos, fit, dragStart, dragMove, dragEnd };
}

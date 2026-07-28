/*
 * Touch control: turns finger gestures on the screen into relative-mouse HID
 * reports, so a phone or tablet drives the target like a laptop trackpad
 * instead of fighting the desktop pointer mapping.
 *
 * Gestures:
 *   one finger drag        move the pointer (relative)
 *   one finger tap         left click
 *   two finger tap         right click
 *   two finger drag        scroll
 *   long press then drag   hold left button and drag (select, drag-and-drop)
 *
 * It uses Touch events rather than Pointer events so multi-finger gestures are
 * unambiguous, and it owns the surface only while active - useInput's desktop
 * pointer handling stands down (see its touchActive option) so the two never
 * both act on one touch.
 */

import { onScopeDispose, watchEffect, type Ref } from "vue";

import type { Control } from "./control";

export interface TouchOptions {
  surface: Ref<HTMLElement | null>;
  control: Control;
  active: Ref<boolean>;
  invertScroll: Ref<boolean>;
  /** Pointer travel per finger travel; higher moves the cursor faster. */
  sensitivity: Ref<number>;
}

const TAP_MS = 250; /* a touch shorter than this, with little movement, is a tap */
const TAP_MOVE_PX = 12; /* travel beyond this makes it a drag, not a tap */
const LONG_PRESS_MS = 500; /* hold this long without moving to begin a drag */
const SCROLL_PX_PER_CLICK = 36; /* two-finger travel per wheel click */

export function useTouch(opts: TouchOptions) {
  let startT = 0;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let moved = false;
  let maxFingers = 0;
  let button = 0; /* left button currently held by a drag */
  let scrollAccum = 0;
  let longPress: ReturnType<typeof setTimeout> | null = null;

  function clearLongPress() {
    if (longPress !== null) {
      clearTimeout(longPress);
      longPress = null;
    }
  }

  function releaseButton() {
    if (button) {
      button = 0;
      opts.control.mouseRelative(0, 0, 0);
    }
  }

  function reset() {
    clearLongPress();
    moved = false;
    maxFingers = 0;
    scrollAccum = 0;
  }

  watchEffect((onCleanup) => {
    const el = opts.surface.value;
    if (!el || !opts.active.value) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      maxFingers = Math.max(maxFingers, e.touches.length);
      const t = e.touches[0];
      lastX = t.clientX;
      lastY = t.clientY;

      if (e.touches.length === 1) {
        startT = performance.now();
        startX = t.clientX;
        startY = t.clientY;
        moved = false;
        scrollAccum = 0;
        /* Hold still for a moment to pick up the left button, then drag. */
        clearLongPress();
        longPress = setTimeout(() => {
          if (!moved && !button) {
            button = 1;
            opts.control.mouseRelative(1, 0, 0);
          }
        }, LONG_PRESS_MS);
      } else {
        /* A second finger cancels a pending press-to-drag. */
        clearLongPress();
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        /* Two fingers: vertical travel scrolls. */
        const y = e.touches[0].clientY;
        scrollAccum += lastY - y;
        lastY = y;
        lastX = e.touches[0].clientX;
        moved = true;
        clearLongPress();
        let clicks = (scrollAccum / SCROLL_PX_PER_CLICK) | 0;
        if (clicks !== 0) {
          scrollAccum -= clicks * SCROLL_PX_PER_CLICK;
          if (opts.invertScroll.value) clicks = -clicks;
          opts.control.mouseRelative(0, 0, 0, clicks);
        }
        return;
      }

      const t = e.touches[0];
      const rawDx = t.clientX - lastX;
      const rawDy = t.clientY - lastY;
      lastX = t.clientX;
      lastY = t.clientY;
      if (!moved && Math.hypot(t.clientX - startX, t.clientY - startY) > TAP_MOVE_PX) {
        moved = true;
        clearLongPress();
      }
      const s = opts.sensitivity.value;
      const dx = Math.round(rawDx * s);
      const dy = Math.round(rawDy * s);
      if (dx !== 0 || dy !== 0) {
        opts.control.mouseRelative(button, dx, dy);
      }
    };

    const onEnd = (e: TouchEvent) => {
      e.preventDefault();
      clearLongPress();
      if (e.touches.length > 0) {
        /* One of several fingers lifted: keep going, but this is no longer a
           tap, and re-baseline on the finger that remains. */
        moved = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        return;
      }

      if (button) {
        releaseButton();
      } else if (!moved && performance.now() - startT < TAP_MS) {
        const b = maxFingers >= 2 ? 2 : 1; /* two-finger tap = right click */
        opts.control.mouseRelative(b, 0, 0);
        opts.control.mouseRelative(0, 0, 0);
      }
      reset();
    };

    const onCancel = (e: TouchEvent) => {
      e.preventDefault();
      releaseButton();
      reset();
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onCancel, { passive: false });

    onCleanup(() => {
      releaseButton();
      reset();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    });
  });

  onScopeDispose(releaseButton);
}

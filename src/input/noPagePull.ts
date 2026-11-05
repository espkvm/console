/*
 * Keep touch drags inside the console.
 *
 * The browser's pull-to-refresh is a viewport gesture, and CSS was not enough to
 * stop it: overscroll-behavior tells the browser not to chain a scroll onward,
 * but the page still got the pull when a drag began somewhere with nothing to
 * scroll. A touchmove that is cancelled cannot become a page pull at all, so
 * this decides per gesture: if the drag belongs to a scrollable box that can
 * still move that way, leave it alone; otherwise cancel it. A sideways drag is
 * never a pull, so it is left alone too: cancelling it killed the sideways
 * scroll of the settings tabs on a phone.
 *
 * The video surface has its own handlers and is left out of this entirely.
 */

/** The nearest ancestor that actually scrolls vertically. */
function scroller(from: EventTarget | null): HTMLElement | null {
  let el = from instanceof HTMLElement ? from : null;
  while (el && el !== document.documentElement && el !== document.body) {
    const style = getComputedStyle(el);
    const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
    if (scrolls && el.scrollHeight > el.clientHeight + 1) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function installNoPagePull(): () => void {
  let box: HTMLElement | null = null;
  let lastY = 0;
  let lastX = 0;
  let sideways: boolean | null = null; /* decided on the first move */
  let owned = false;

  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || e.touches.length > 1) {
      box = null;
      owned = false;
      return;
    }
    /* The trackpad surface handles its own gestures. */
    owned = !(t.target instanceof HTMLElement && t.target.closest(".stage-touch"));
    box = scroller(t.target);
    lastY = t.clientY;
    lastX = t.clientX;
    sideways = null;
  };

  const onMove = (e: TouchEvent) => {
    if (!owned || !e.cancelable) {
      return;
    }
    const t = e.touches[0];
    if (!t) {
      return;
    }
    const dy = t.clientY - lastY;
    const dx = t.clientX - lastX;
    lastY = t.clientY;
    lastX = t.clientX;
    if (sideways === null && (dx || dy)) {
      sideways = Math.abs(dx) > Math.abs(dy);
    }
    if (sideways) {
      return;
    }
    if (!box) {
      e.preventDefault(); /* nothing here scrolls - the page must not either */
      return;
    }
    const atTop = box.scrollTop <= 0;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
    /* Dragging down at the top, or up at the bottom, is what the browser would
       turn into a pull or a rubber band. */
    if ((dy > 0 && atTop) || (dy < 0 && atBottom)) {
      e.preventDefault();
    }
  };

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: false });
  return () => {
    document.removeEventListener("touchstart", onStart);
    document.removeEventListener("touchmove", onMove);
  };
}

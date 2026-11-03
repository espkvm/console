/*
 * The bars are icons, and a finger gets no hover tooltip. Here a long press on a
 * button in a bar shows its name instead of pressing it, and a tap on a status
 * icon (which does nothing when pressed) shows what it means.
 */

/** Where this works: the side rail, the bottom bar and the top status bar. */
const BARS = ".rail, .actionbar, .statusbar";
const HOLD_MS = 450;
const SHOW_MS = 1800;
const SLOP_PX = 10;

function labelOf(el: Element): string {
  return (el.getAttribute("aria-label") || el.getAttribute("title") || "").trim();
}

/** The nearest element in a bar that has a name, or null. */
function target(from: EventTarget | null): HTMLElement | null {
  if (!(from instanceof Element)) return null;
  const el = from.closest<HTMLElement>("[aria-label], [title]");
  if (!el || !el.closest(BARS) || !labelOf(el)) return null;
  return el;
}

export function installTouchLabels(): () => void {
  let bubble: HTMLDivElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number; el: HTMLElement } | null = null;
  /* After a long press the click that follows must not press the button. */
  let eatClick = false;

  function hide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    bubble?.remove();
    bubble = null;
  }

  function show(el: HTMLElement) {
    hide();
    const r = el.getBoundingClientRect();
    const b = document.createElement("div");
    b.className = "touch-label";
    b.setAttribute("role", "status");
    b.textContent = labelOf(el);
    document.body.appendChild(b);
    const w = b.offsetWidth;
    const h = b.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    /* Above the button, or below it when there is no room (the top bar). */
    const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
    bubble = b;
    hideTimer = setTimeout(hide, SHOW_MS);
  }

  function cancelHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function onDown(e: PointerEvent) {
    eatClick = false;
    if (e.pointerType !== "touch") return;
    const el = target(e.target);
    if (!el) return;
    start = { x: e.clientX, y: e.clientY, el };
    cancelHold();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      eatClick = true;
      show(el);
    }, HOLD_MS);
  }

  function onMove(e: PointerEvent) {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) {
      cancelHold();
      start = null;
    }
  }

  function onUp(e: PointerEvent) {
    const s = start;
    start = null;
    if (!holdTimer || !s) return;
    cancelHold();
    /* A plain tap on something that is not a control: say what it is. */
    if (e.pointerType === "touch" && !s.el.closest("button, a, input, select, [role=button]")) show(s.el);
  }

  function onClick(e: MouseEvent) {
    if (!eatClick) return;
    eatClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  /* The long press would otherwise open the browser's own menu on some phones. */
  function onMenu(e: Event) {
    if (target(e.target)) e.preventDefault();
  }

  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", cancelHold, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("contextmenu", onMenu, true);
  return () => {
    hide();
    cancelHold();
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", cancelHold, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("contextmenu", onMenu, true);
  };
}

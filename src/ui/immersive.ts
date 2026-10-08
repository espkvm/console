/*
 * Full screen without the console's bars. In full screen (and with the UI
 * setting on) the status strip, the rail and the action bar slide off the edges
 * and the picture has the whole screen; they come back over the picture - not
 * beside it, so the video does not resize and jump - when they are asked for:
 *
 * - the mouse at an edge of the screen: at once while control is not taken; a
 *   short dwell while it is, so reaching for the target's own taskbar does not
 *   keep throwing the bars over it;
 * - the handle at the top, for a finger;
 * - a lone tap of the right Ctrl key, the "host key" of virtual machines. The
 *   key still reaches the target; a Ctrl on its own does nothing there.
 *
 * Shown, they go again a few seconds after the pointer or finger leaves them.
 */
import { computed, onMounted, onUnmounted, ref, type Ref } from "vue";

const EDGE_PX = 4;
const EDGE_DWELL_MS = 700;
const HIDE_AFTER_MS = 3000;
const HOST_TAP_MS = 500;
const BARS = ".statusbar, .rail, .actionbar, .ab-more, .immersive-handle";

export function useImmersive(opts: { enabled: Ref<boolean>; engaged: Ref<boolean> }) {
  const fullscreen = ref(typeof document !== "undefined" && !!document.fullscreenElement);
  const immersive = computed(() => fullscreen.value && opts.enabled.value);
  const barsShown = ref(false);

  let hideTimer = 0;
  let dwellTimer = 0;
  let overBars = false;

  function scheduleHide() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      /* Stay while the pointer is over them, or the keyboard is working in
         them; a button merely left focused by a click does not count. */
      const f = document.activeElement;
      const typing = !!f?.closest?.(BARS) && f.matches(":focus-visible");
      if (!overBars && !typing) barsShown.value = false;
      else scheduleHide();
    }, HIDE_AFTER_MS);
  }
  function show() {
    if (!immersive.value) return;
    barsShown.value = true;
    scheduleHide();
  }
  function hide() {
    window.clearTimeout(hideTimer);
    barsShown.value = false;
  }
  function toggle() {
    if (barsShown.value) hide();
    else show();
  }

  const onFullscreen = () => {
    fullscreen.value = !!document.fullscreenElement;
    hide();
  };

  const onMove = (e: PointerEvent) => {
    if (!immersive.value) return;
    overBars = !!(e.target as Element | null)?.closest?.(BARS);
    if (barsShown.value) {
      if (overBars) scheduleHide();
      return;
    }
    if (e.pointerType !== "mouse") return;
    const atEdge =
      e.clientY <= EDGE_PX ||
      e.clientY >= window.innerHeight - EDGE_PX ||
      e.clientX <= EDGE_PX ||
      e.clientX >= window.innerWidth - EDGE_PX;
    window.clearTimeout(dwellTimer);
    if (!atEdge) return;
    if (!opts.engaged.value) show();
    else dwellTimer = window.setTimeout(show, EDGE_DWELL_MS);
  };

  const onTouch = (e: TouchEvent) => {
    if (barsShown.value && (e.target as Element | null)?.closest?.(BARS)) scheduleHide();
  };

  /* The host key: right Ctrl pressed and let go with nothing else in between. */
  let hostDownAt = 0;
  let otherKey = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "ControlRight") {
      if (!e.repeat) {
        hostDownAt = performance.now();
        otherKey = false;
      }
    } else {
      otherKey = true;
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== "ControlRight" || !immersive.value) return;
    if (!otherKey && performance.now() - hostDownAt < HOST_TAP_MS) toggle();
  };

  onMounted(() => {
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
  });
  onUnmounted(() => {
    window.clearTimeout(hideTimer);
    window.clearTimeout(dwellTimer);
    document.removeEventListener("fullscreenchange", onFullscreen);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("touchstart", onTouch);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
  });

  return { immersive, barsShown, show, hide, toggle };
}

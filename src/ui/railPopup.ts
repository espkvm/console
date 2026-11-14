/*
 * Where a rail button's popup goes. The rail scrolls when the window is too
 * low for its buttons, and a scrolling box clips whatever sticks out of it, so
 * a popup placed beside its button with position: absolute was cut off and
 * only its backdrop was left. The popups are position: fixed instead, and
 * this puts the button's place on the screen into CSS variables on the
 * widget's root for them to use:
 *   --pop-left    just right of the button (rail on the left)
 *   --pop-right   just left of the button (rail on the right)
 *   --pop-top / --pop-bottom  level with the button's top or bottom edge
 *   --pop-max-h   the room from there to the screen's edge
 */
import { onUnmounted, watch, type Ref } from "vue";

const GAP = 8;

export function useRailPopup(root: Ref<HTMLElement | null>, open: Ref<boolean>): void {
  const place = () => {
    const el = root.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--pop-left", `${Math.round(r.right + GAP)}px`);
    el.style.setProperty("--pop-right", `${Math.round(window.innerWidth - r.left + GAP)}px`);
    /* A button in the upper half opens its popup downward from its top edge,
       one in the lower half upward from its bottom edge: either way the
       popup gets the larger room, and scrolls inside it if that is short. */
    const vh = window.innerHeight;
    if (r.top + r.bottom < vh) {
      const top = Math.max(GAP, r.top);
      el.style.setProperty("--pop-top", `${Math.round(top)}px`);
      el.style.setProperty("--pop-bottom", "auto");
      el.style.setProperty("--pop-max-h", `${Math.round(vh - top - GAP)}px`);
    } else {
      const bottom = Math.max(GAP, vh - r.bottom);
      el.style.setProperty("--pop-top", "auto");
      el.style.setProperty("--pop-bottom", `${Math.round(bottom)}px`);
      el.style.setProperty("--pop-max-h", `${Math.round(vh - bottom - GAP)}px`);
    }
  };
  const stop = () => {
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
  };
  watch(
    open,
    (on) => {
      stop();
      if (!on) return;
      place();
      window.addEventListener("resize", place);
      /* Captured: the rail's own scrolling does not bubble. */
      window.addEventListener("scroll", place, true);
    },
    { immediate: true },
  );
  onUnmounted(stop);
}

/* A CSS media query as a live boolean, for layout the template has to change. */
import { onMounted, onUnmounted, ref } from "vue";

/** A phone on its side: little height, so the console moves things beside the
 *  picture. The same query is in the CSS (components.css, TouchControls.vue). */
export const PHONE_SIDEWAYS = "(pointer: coarse) and (orientation: landscape) and (max-height: 640px)";

export function useMedia(query: string) {
  const matches = ref(false);
  let mq: MediaQueryList | null = null;
  const update = () => (matches.value = !!mq?.matches);
  onMounted(() => {
    if (typeof window.matchMedia !== "function") return;
    mq = window.matchMedia(query);
    update();
    mq.addEventListener("change", update);
  });
  onUnmounted(() => mq?.removeEventListener("change", update));
  return matches;
}

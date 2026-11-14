/*
 * Keep the screen on while the picture plays: a phone or a tablet propped up
 * to watch a target otherwise dims and locks after its own timeout, in the
 * middle of a BIOS screen. The browser drops the lock when the tab is hidden,
 * so it is asked for again when the tab comes back. Where the Screen Wake Lock
 * API is missing (or the page is not HTTPS) nothing happens.
 */
import { onUnmounted, watch, type Ref } from "vue";

export function useWakeLock(want: Ref<boolean>): void {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  let lock: WakeLockSentinel | null = null;
  let asking = false;

  async function take() {
    if (lock || asking || !want.value || document.hidden) return;
    asking = true;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => {
        lock = null;
      });
      /* The picture may have stopped while the request was out. */
      if (!want.value) void drop();
    } catch {
      /* Refused (battery saver, a policy): the screen simply sleeps as before. */
    } finally {
      asking = false;
    }
  }

  async function drop() {
    const l = lock;
    lock = null;
    await l?.release().catch(() => {});
  }

  const onVisible = () => void (document.hidden ? null : take());
  document.addEventListener("visibilitychange", onVisible);
  watch(want, (on) => void (on ? take() : drop()), { immediate: true });
  onUnmounted(() => {
    document.removeEventListener("visibilitychange", onVisible);
    void drop();
  });
}

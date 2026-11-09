/*
 * Notifications in the demo. There is no device to send from and no real key
 * to subscribe with, so once turned on in Settings the demo sends a sample
 * alert a few seconds after you leave the tab, the way a device would while
 * you look at something else. Module state, so it keeps working with Settings
 * closed.
 */
import { ref } from "vue";

export const demoPushOn = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let last = 0;

async function notify() {
  const title = "espkvm: Screen area";
  const body = "Login prompt appeared on the target's screen.";
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(title, { body, data: { url: "/" } });
  /* No worker (the local dev server): a page notification works on a desktop. */ else
    new Notification(title, { body });
}

function onVisibility() {
  clearTimeout(timer);
  if (
    !demoPushOn.value ||
    document.visibilityState !== "hidden" ||
    Date.now() - last < 20000
  )
    return;
  timer = setTimeout(() => {
    last = Date.now();
    void notify().catch(() => {});
  }, 3000);
}

export async function demoPushStart() {
  await navigator.serviceWorker.register("/sw.js").catch(() => null);
  if (!demoPushOn.value)
    document.addEventListener("visibilitychange", onVisibility);
  demoPushOn.value = true;
}

export function demoPushStop() {
  demoPushOn.value = false;
  clearTimeout(timer);
  document.removeEventListener("visibilitychange", onVisibility);
}

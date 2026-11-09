/*
 * The demo's service worker: only what a notification needs, so "Send them to
 * this browser" in Settings can show how an alert looks, also on a phone. The
 * device's own worker (in the firmware) also caches the shell and takes Web
 * Push; the demo has nothing to push from.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/* A click brings the demo to the front, or opens it. */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});

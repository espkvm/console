/*
 * Keep the document one pixel off the top.
 *
 * Android shows a captive portal in a WebView wrapped in a SwipeRefreshLayout,
 * and that layout decides whether to steal a downward drag by asking the WebView
 * whether it can scroll up - which the WebView answers from the DOCUMENT's
 * scroll position, not from whatever div the finger is over. With a page pinned
 * at zero the answer is always "no", so every drag down inside a panel became a
 * refresh instead. Nothing inside the page can override that decision: it is
 * taken outside the WebView.
 *
 * So give the document exactly one pixel to scroll and keep it there. The answer
 * becomes "yes", the refresh gesture stays out of the way, and one pixel is
 * invisible.
 */
const PIN = 1;

export function installPagePin(): () => void {
  /* Only where the gesture exists - the stylesheet gives the pixel to a coarse
     pointer only, so on a desktop there is nothing to pin. */
  if (!window.matchMedia?.("(pointer: coarse)").matches) return () => {};

  const el = () => document.scrollingElement ?? document.documentElement;

  const pin = () => {
    const e = el();
    if (e.scrollTop < PIN) {
      e.scrollTop = PIN;
    }
  };

  pin();
  window.addEventListener("scroll", pin, { passive: true });
  window.addEventListener("resize", pin);
  window.addEventListener("orientationchange", pin);
  const timer = window.setInterval(pin, 1000);

  return () => {
    window.removeEventListener("scroll", pin);
    window.removeEventListener("resize", pin);
    window.removeEventListener("orientationchange", pin);
    window.clearInterval(timer);
  };
}

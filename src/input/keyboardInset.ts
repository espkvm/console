/*
 * How much of the window the phone's keyboard is sitting on.
 *
 * A virtual keyboard does not shrink the layout viewport, so 100dvh still
 * measures the whole window and the console is laid out as if the keyboard were
 * not there. The browser then does the only thing left to it: it scrolls the
 * page to bring the focused field into view - and the status bar and the top of
 * the picture go off the top of the screen.
 *
 * The visual viewport does shrink, so it can say how much room is really left.
 * The console is sized to that instead, the whole picture stays on screen above
 * the keyboard, and there is nothing for the browser to scroll.
 *
 * Note it is the visual viewport's own height that becomes the console's, not
 * dvh minus the keyboard. Those are two different rulers - dvh answers for the
 * browser's own chrome, innerHeight does not - and subtracting one from the
 * other left a toolbar's worth of console hanging below the screen, which is
 * how the bottom bar came to be clipped.
 */

/* Small differences between the two viewports are normal - a browser toolbar
   sliding in, a rounding of dvh - and reacting to those would make the layout
   twitch. Only something keyboard-sized counts. */
export const KEYBOARD_MIN_PX = 120;

/**
 * How much of the window a keyboard is covering, in pixels, or 0 when nothing
 * keyboard-sized is.
 *
 * The visual viewport's offset within the layout one is deliberately not part
 * of this. On iOS the page ends up scrolled while the keyboard is up, and
 * counting that offset as "not covered" would make a keyboard appear to shrink
 * as the reader scrolls - the console would snap back to full height and clip
 * itself again.
 */
export function keyboardInset(layoutHeight: number, visualHeight: number): number {
  const hidden = Math.round(layoutHeight - visualHeight);
  return hidden >= KEYBOARD_MIN_PX ? hidden : 0;
}

/**
 * The height the console should be, or null to leave it to the stylesheet.
 * A number only while something keyboard-sized is covering the window: the rest
 * of the time dvh is the better answer, because it follows the browser's own
 * bars as they slide in and out.
 */
export function consoleHeight(layoutHeight: number, visualHeight: number): number | null {
  return keyboardInset(layoutHeight, visualHeight) > 0 ? Math.round(visualHeight) : null;
}

export function installKeyboardInset(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  const apply = () => {
    const h = consoleHeight(window.innerHeight, vv.height);
    const root = document.documentElement;
    if (h === null) {
      root.style.removeProperty("--app-h");
      return;
    }
    root.style.setProperty("--app-h", `${h}px`);
    /* The scroll the browser made to reveal the field is not needed once the
       console fits above the keyboard, and leaving it there is exactly the
       cut-off top this fixes. Put the page back where it belongs. */
    const el = document.scrollingElement ?? root;
    if (el.scrollTop > 1) el.scrollTop = 1;
  };

  apply();
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  window.addEventListener("orientationchange", apply);

  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
    window.removeEventListener("orientationchange", apply);
    document.documentElement.style.removeProperty("--app-h");
  };
}

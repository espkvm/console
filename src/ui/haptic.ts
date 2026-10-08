/*
 * A tick under the finger, the way a phone's own keyboard does it: very short,
 * so it reads as a light tap rather than a buzz. Only where it means something:
 * a touch screen whose browser can vibrate (Chrome on Android; Safari on an
 * iPhone has no Vibration API and simply gets nothing).
 *
 * Settings -> UI -> Vibration on a phone: on key presses (ui_haptic_keys), on
 * the touchpad (ui_haptic_pad), and how strong (ui_haptic_level). The
 * Vibration API takes a length and nothing else - no strength - so "stronger"
 * is longer.
 */

/** Whether this browser, on this screen, can buzz at all. */
export const hapticSupported =
  typeof navigator !== "undefined" &&
  typeof navigator.vibrate === "function" &&
  typeof matchMedia === "function" &&
  matchMedia("(pointer: coarse)").matches;

/* Milliseconds per level. A phone's own keyboard uses a system "click" effect
   a page cannot ask for; a plain pulse has to be longer to be felt at all -
   on a Pixel 6 ms was not. */
const LEVEL_MS: Record<string, number> = { light: 12, medium: 25, strong: 45 };

let tickMs = LEVEL_MS.light;
let keysOn = true;
let padOn = true;

/** From the settings: the strength's name, and whether keys and the touchpad tick. */
export function setHaptic(level: string | undefined, keys: boolean, pad: boolean): void {
  tickMs = LEVEL_MS[level ?? "light"] ?? LEVEL_MS.light;
  keysOn = keys;
  padOn = pad;
}

function buzz(ms: number): void {
  if (!hapticSupported || ms <= 0) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* a browser that refuses is a browser that does not buzz */
  }
}

/**
 * Settings' "Try it": one tick at @p level, whatever the other switches say,
 * and what the browser made of it - so "nothing happened" can be told apart
 * from "the browser refused" and "this browser cannot".
 */
export function hapticTry(level: string | undefined): string {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return "This browser has no vibration (Safari on an iPhone, Firefox on a desktop).";
  }
  const ms = LEVEL_MS[level ?? "light"] ?? LEVEL_MS.light;
  let ok = false;
  try {
    ok = navigator.vibrate(ms);
  } catch {
    ok = false;
  }
  if (!ok) return "The browser refused. Tap the page once first, and check the phone is not in silent or battery-saver mode.";
  return hapticSupported
    ? `Sent a ${ms} ms pulse. Felt nothing? The phone's own vibration may be off: Settings > Sound & vibration > Vibration & haptics.`
    : `Sent a ${ms} ms pulse, but this screen is not a touch screen, so the console will not use it.`;
}

/** A key, a button: one tick. */
export function haptic(): void {
  if (keysOn) buzz(tickMs);
}

/*
 * The touchpad: a faint tick every so much finger travel, like the detents the
 * Steam Controller's pads give. Travel is counted in CSS pixels of the finger,
 * not of the pointer, so a fast flick does not turn into a buzz; and ticks are
 * kept apart in time for the same reason.
 */
/* About 2 mm of finger on a phone - what sc-controller, the open driver for
   the Steam Controller, uses: a tick per 4000 of the pad's 65536 units. */
const PAD_STEP_PX = 12;
const PAD_MIN_GAP_MS = 12;
let padTravel = 0;
let padLast = 0;

/** Report finger travel on the touchpad; ticks when enough has gone by. */
export function hapticTravel(px: number): void {
  if (!padOn) return;
  padTravel += px;
  if (padTravel < PAD_STEP_PX) return;
  padTravel %= PAD_STEP_PX;
  const now = performance.now();
  if (now - padLast < PAD_MIN_GAP_MS) return;
  padLast = now;
  /* Fainter than a key: a third of its length, the shortest a motor still turns at. */
  buzz(Math.max(4, Math.round(tickMs / 3)));
}

/** A new touch starts counting afresh. */
export function hapticTravelReset(): void {
  padTravel = 0;
}

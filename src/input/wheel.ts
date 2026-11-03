/*
 * Browser wheel events to wheel clicks for the target. A mouse notch is about
 * 100 px in Chrome, about 50 px or 3 lines in Firefox, and a touchpad sends many
 * small steps. Rounding each event alone turned the last two into nothing. Here
 * a big step is a click (at 100% speed), and small steps add up to one per 100 px.
 */

const PX_PER_CLICK = 100;
const PX_PER_LINE = 34;
/* A step this big is a mouse notch, not a touchpad. */
const NOTCH_PX = 40;
const PX_PER_PAGE = 800;
/* A pause this long starts the count again, so a leftover half click does not
   fire on the next, unrelated scroll. */
const IDLE_MS = 300;
/* One event never sends more than this many clicks: a fast flick would scroll
   a page away. */
const MAX_CLICKS = 4;

export interface WheelSample {
  deltaY: number;
  deltaMode: number;
  timeStamp: number;
}

export function createWheel() {
  let acc = 0;
  let last = -Infinity;
  /* Part of a click left over from notches at a speed below 100%. */
  let notches = 0;

  /** Wheel clicks for this event, up positive (the HID sign). @p speed 1 is as is. */
  return (e: WheelSample, speed = 1): number => {
    const px = e.deltaY * (e.deltaMode === 1 ? PX_PER_LINE : e.deltaMode === 2 ? PX_PER_PAGE : 1);
    if (Math.abs(px) >= NOTCH_PX) {
      acc = 0;
      last = e.timeStamp;
      const n = Math.max(1, Math.round(Math.abs(px) / PX_PER_CLICK)) * speed;
      if (Math.sign(px) !== Math.sign(notches)) notches = 0;
      notches += px > 0 ? n : -n;
      const out = Math.trunc(notches);
      notches -= out;
      return -Math.max(-MAX_CLICKS, Math.min(MAX_CLICKS, out)) || 0;
    }
    if (e.timeStamp - last > IDLE_MS || Math.sign(px) !== Math.sign(acc)) acc = 0;
    last = e.timeStamp;
    acc += px * speed;
    const clicks = Math.trunc(acc / PX_PER_CLICK);
    acc -= clicks * PX_PER_CLICK;
    /* `|| 0` turns -0 into 0. */
    return -Math.max(-MAX_CLICKS, Math.min(MAX_CLICKS, clicks)) || 0;
  };
}

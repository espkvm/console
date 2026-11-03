/*
 * Is the picture moving? A still picture can mean three things: the target's
 * screen does not change (the device then sends few or no frames), the device
 * sends frames that never reach this tab, or there is no signal at all. The
 * status bar shows which, from one sample a second.
 */

export type Liveness =
  /** Frames are drawn in this tab. */
  | "live"
  /** The device sends next to nothing: the screen is not changing. */
  | "still"
  /** The device sends frames, and none have been drawn here for a while. */
  | "stalled"
  /** Nothing to tell: no signal, paused, text view, a hidden tab. */
  | "unknown";

export interface LivenessSample {
  /** Frames drawn in this tab since the last sample. */
  drawn: number;
  /** The device's frames a second. */
  deviceFps: number;
  /** The picture comes through a stream whose frames are counted. */
  counting: boolean;
  signal: boolean;
  visible: boolean;
}

/* Seconds of nothing drawn, while the device sends, before it is called stalled.
   A keyframe wait after a reconnect is about two. */
const STALL_S = 4;

export function createLiveness() {
  let empty = 0;
  let last: Liveness = "unknown";
  return (s: LivenessSample): Liveness => {
    if (!s.counting || !s.signal || !s.visible) {
      empty = 0;
      last = "unknown";
      return last;
    }
    if (s.drawn > 0) {
      empty = 0;
      last = "live";
    } else if (s.deviceFps >= 1) {
      empty++;
      if (empty >= STALL_S) last = "stalled";
    } else {
      empty = 0;
      last = "still";
    }
    return last;
  };
}

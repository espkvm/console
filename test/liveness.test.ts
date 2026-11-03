/* Is the picture moving: live, a still screen, or a stream that stopped reaching the tab. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createLiveness, type LivenessSample } from "../src/video/liveness.ts";

const s = (o: Partial<LivenessSample>): LivenessSample => ({
  drawn: 0,
  deviceFps: 0,
  counting: true,
  signal: true,
  visible: true,
  ...o,
});

test("frames drawn are live, a device sending nothing is still", () => {
  const l = createLiveness();
  assert.equal(l(s({ drawn: 25, deviceFps: 25 })), "live");
  assert.equal(l(s({ drawn: 0, deviceFps: 0.2 })), "still");
});

test("the device sends and nothing arrives: stalled after a few seconds", () => {
  const l = createLiveness();
  assert.equal(l(s({ drawn: 25, deviceFps: 25 })), "live");
  assert.equal(l(s({ deviceFps: 25 })), "live", "a keyframe wait is not a stall");
  assert.equal(l(s({ deviceFps: 25 })), "live");
  assert.equal(l(s({ deviceFps: 25 })), "live");
  assert.equal(l(s({ deviceFps: 25 })), "stalled");
  assert.equal(l(s({ drawn: 3, deviceFps: 25 })), "live", "back as soon as a frame lands");
});

test("nothing to tell without a signal, a counted stream or a visible tab", () => {
  const l = createLiveness();
  assert.equal(l(s({ signal: false })), "unknown");
  assert.equal(l(s({ counting: false, deviceFps: 25 })), "unknown");
  for (let i = 0; i < 3; i++) l(s({ deviceFps: 25 }));
  assert.equal(l(s({ visible: false, deviceFps: 25 })), "unknown", "hidden tab resets the count");
  assert.equal(l(s({ deviceFps: 25 })), "unknown", "starts counting again");
});

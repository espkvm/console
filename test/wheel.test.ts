/* Wheel events to wheel clicks: mouse notches, Firefox lines and touchpad steps. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createWheel } from "../src/input/wheel.ts";

test("a Chrome mouse notch is one click, down is negative", () => {
  const w = createWheel();
  assert.equal(w({ deltaY: 100, deltaMode: 0, timeStamp: 0 }), -1);
  assert.equal(w({ deltaY: -100, deltaMode: 0, timeStamp: 50 }), 1);
});

test("a Firefox notch in lines is one click", () => {
  const w = createWheel();
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = w({ deltaY: 3, deltaMode: 1, timeStamp: i * 20 });
    assert.equal(c, -1, `notch ${i}`);
    sum += c;
  }
  assert.equal(sum, -10);
});

test("a Firefox notch in pixels is one click too", () => {
  const w = createWheel();
  assert.equal(w({ deltaY: 48, deltaMode: 0, timeStamp: 0 }), -1);
  assert.equal(w({ deltaY: -48, deltaMode: 0, timeStamp: 30 }), 1);
});

test("touchpad steps add up instead of rounding to nothing", () => {
  const w = createWheel();
  let sum = 0;
  for (let i = 0; i < 50; i++) sum += w({ deltaY: -8, deltaMode: 0, timeStamp: i * 16 });
  assert.equal(sum, 4);
});

test("a pause or a turn drops the leftover", () => {
  const w = createWheel();
  assert.equal(w({ deltaY: 30, deltaMode: 0, timeStamp: 0 }), 0);
  assert.equal(w({ deltaY: 30, deltaMode: 0, timeStamp: 10 }), 0);
  assert.equal(w({ deltaY: 30, deltaMode: 0, timeStamp: 1000 }), 0, "after a pause: 30, not 90");
  assert.equal(w({ deltaY: 30, deltaMode: 0, timeStamp: 1010 }), 0);
  assert.equal(w({ deltaY: -30, deltaMode: 0, timeStamp: 1020 }), 0, "turned");
  assert.equal(w({ deltaY: -30, deltaMode: 0, timeStamp: 1030 }), 0);
  assert.equal(w({ deltaY: -30, deltaMode: 0, timeStamp: 1040 }), 0);
  assert.equal(w({ deltaY: -30, deltaMode: 0, timeStamp: 1050 }), 1);
});

test("a fast flick is capped", () => {
  const w = createWheel();
  assert.equal(w({ deltaY: 2000, deltaMode: 0, timeStamp: 0 }), -4);
});

test("the speed setting scales notches and steps", () => {
  const slow = createWheel();
  const half = [0, 1, 2, 3].map((i) => slow({ deltaY: 100, deltaMode: 0, timeStamp: i * 50 }, 0.5));
  assert.deepEqual(half, [0, -1, 0, -1], "two notches a click at 50%");
  const fast = createWheel();
  assert.equal(fast({ deltaY: 100, deltaMode: 0, timeStamp: 0 }, 3), -3);
  const pad = createWheel();
  let sum = 0;
  for (let i = 0; i < 25; i++) sum += pad({ deltaY: 8, deltaMode: 0, timeStamp: i * 16 }, 2);
  assert.equal(sum, -4, "200 px of touchpad at 200% is 4 clicks");
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { axis, CENTER, fromGamepad, HAT_NONE, hatFrom, PAD } from "../src/input/gamepad.ts";

test("hat directions go clockwise from up", () => {
  assert.equal(hatFrom(false, false, false, false), HAT_NONE);
  assert.equal(hatFrom(true, false, false, false), 0);
  assert.equal(hatFrom(true, false, false, true), 1);
  assert.equal(hatFrom(false, false, false, true), 2);
  assert.equal(hatFrom(false, true, false, false), 4);
  assert.equal(hatFrom(false, true, true, false), 5);
  assert.equal(hatFrom(true, false, true, false), 7);
  /* opposed directions cancel */
  assert.equal(hatFrom(true, true, false, false), HAT_NONE);
});

test("axes have a dead zone and span 0..255", () => {
  assert.equal(axis(0), CENTER);
  assert.equal(axis(0.05), CENTER);
  assert.equal(axis(-1), 0);
  assert.equal(axis(1), 255);
  assert.equal(axis(Number.NaN), CENTER);
});

const btn = (pressed: boolean) => ({ pressed, value: pressed ? 1 : 0 });

test("a standard controller maps by position", () => {
  const buttons = Array.from({ length: 17 }, () => btn(false));
  buttons[0] = btn(true); /* bottom face button */
  buttons[1] = btn(true); /* right face button */
  buttons[12] = btn(true); /* cross up */
  buttons[16] = btn(true); /* centre */
  const s = fromGamepad({ mapping: "standard", buttons, axes: [1, 0, 0, -1] });
  assert.ok(s);
  assert.equal(s.buttons, PAD.b | PAD.a | PAD.home);
  assert.equal(s.hat, 0);
  assert.equal(s.lx, 255);
  assert.equal(s.ly, CENTER);
  assert.equal(s.ry, 0);
});

test("a controller without the standard layout is not guessed at", () => {
  assert.equal(fromGamepad({ mapping: "", buttons: [], axes: [] }), null);
});

import { keyFaces, LABELS } from "../src/input/gamepad.ts";

test("confirm and back follow the target's habit", () => {
  assert.equal(keyFaces("nintendo").Enter, "a"); /* right */
  assert.equal(keyFaces("nintendo").Escape, "b");
  assert.equal(keyFaces("xbox").Enter, "b"); /* bottom: Xbox A */
  assert.equal(keyFaces("xbox").Escape, "a");
});

test("a letter key presses the button wearing that letter", () => {
  /* On an Xbox pad X is the left button, which the Switch calls Y. */
  assert.equal(keyFaces("xbox").x, "y");
  assert.equal(keyFaces("nintendo").x, "x");
  assert.equal(LABELS.xbox.south, "A");
});

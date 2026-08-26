/*
 * Measuring the phone's keyboard. Get this wrong in one direction and the
 * console keeps being scrolled off the top; wrong in the other and the layout
 * twitches every time a browser toolbar slides in.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { KEYBOARD_MIN_PX, consoleHeight, keyboardInset } from "../src/input/keyboardInset.ts";

test("no keyboard: the two viewports agree", () => {
  assert.equal(keyboardInset(900, 900), 0);
});

test("a keyboard covering the bottom is measured", () => {
  assert.equal(keyboardInset(900, 560), 340);
});

test("a toolbar-sized difference is not a keyboard", () => {
  assert.equal(keyboardInset(900, 900 - (KEYBOARD_MIN_PX - 1)), 0);
  assert.equal(keyboardInset(900, 900 - KEYBOARD_MIN_PX), KEYBOARD_MIN_PX);
});

test("a visual viewport larger than the layout one reads as no keyboard", () => {
  assert.equal(keyboardInset(900, 940), 0);
});

test("with no keyboard the height is left to the stylesheet", () => {
  assert.equal(consoleHeight(900, 900), null);
  assert.equal(consoleHeight(900, 830), null);
});

test("with a keyboard up the console is exactly the visible area", () => {
  /* Not 900 - 340: dvh and innerHeight are different rulers, and the difference
     is what used to hang below the screen. */
  assert.equal(consoleHeight(900, 560), 560);
});

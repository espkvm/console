/*
 * The keyboard tables. A wrong entry types the wrong character into somebody's
 * BIOS and reports nothing, which is exactly the kind of mistake worth pinning
 * down here rather than noticing on hardware.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { usageForCode, isModifierCode, modifierForCode, HID_MOD_LSHIFT } from "../src/input/keymap";

test("letters and digits sit where HID puts them", () => {
  assert.equal(usageForCode("KeyA"), 0x04);
  assert.equal(usageForCode("KeyZ"), 0x1d);
  assert.equal(usageForCode("Digit1"), 0x1e);
  assert.equal(usageForCode("Digit0"), 0x27);
});

test("the keys a phone keyboard lacks are the ones the touch pad sends", () => {
  assert.equal(usageForCode("ArrowRight"), 0x4f);
  assert.equal(usageForCode("ArrowLeft"), 0x50);
  assert.equal(usageForCode("ArrowDown"), 0x51);
  assert.equal(usageForCode("ArrowUp"), 0x52);
  assert.equal(usageForCode("Escape"), 0x29);
  assert.equal(usageForCode("Tab"), 0x2b);
  assert.equal(usageForCode("Enter"), 0x28);
});

test("an unknown code is nothing, not a guess", () => {
  assert.equal(usageForCode("KeyThatDoesNotExist"), 0);
});

test("modifiers are told apart from keys", () => {
  assert.equal(isModifierCode("ShiftLeft"), true);
  assert.equal(isModifierCode("KeyA"), false);
  assert.equal(modifierForCode("ShiftLeft"), HID_MOD_LSHIFT);
});

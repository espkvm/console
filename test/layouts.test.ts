/*
 * The paste tables for the generated layouts: a few characters per layout
 * pinned down, and the Windows/Linux split where the two really differ.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { charToStrokes } from "../src/layouts";
import { usageForCode } from "../src/input/keymap";

const press = (mod: number, hid: number) => ({ mod, hid });

test("German: z and y swap, é is the dead acute then e, < is the ISO key", () => {
  assert.deepEqual(charToStrokes("de_de", "z"), [press(0, 0x1c)]);
  assert.deepEqual(charToStrokes("de_de", "y"), [press(0, 0x1d)]);
  assert.deepEqual(charToStrokes("de_de", "é"), [press(0, 0x2e), press(0, 0x08)]);
  assert.deepEqual(charToStrokes("de_de", "<"), [press(0, 0x64)]);
  assert.deepEqual(charToStrokes("de_de", "@"), [press(0x40, 0x14)]);
});

test("French ~ depends on the OS: a dead key on Windows, a plain one on Linux", () => {
  assert.deepEqual(charToStrokes("fr_fr", "~", "windows"), [press(0x40, 0x1f), press(0, 0x2c)]);
  /* Linux also has it on Shift+², which needs no AltGr, so that one is used. */
  assert.deepEqual(charToStrokes("fr_fr", "~", "linux"), [press(0x02, 0x35)]);
  assert.equal(charToStrokes("fr_fr", "~"), null);
  assert.deepEqual(charToStrokes("fr_fr", "a"), [press(0, 0x14)]);
  assert.deepEqual(charToStrokes("fr_fr", "1"), [press(0x02, 0x1e)]);
});

test("UK swaps \" and @ against US; Brazilian / is the ABNT2 key", () => {
  assert.deepEqual(charToStrokes("en_gb", '"'), [press(0x02, 0x1f)]);
  assert.deepEqual(charToStrokes("en_gb", "@"), [press(0x02, 0x34)]);
  assert.deepEqual(charToStrokes("pt_br", "/"), [press(0, 0x87)]);
});

test("US International: ' is the dead key then Space on both systems", () => {
  assert.deepEqual(charToStrokes("en_intl", "'"), [press(0, 0x34), press(0, 0x2c)]);
});

test("the hand-written layouts are unchanged and know no OS", () => {
  assert.deepEqual(charToStrokes("en_us", "a", "windows"), [press(0, 0x04)]);
  assert.deepEqual(charToStrokes("ru_ru", "ф", "linux"), [press(0, 0x04)]);
  assert.equal(charToStrokes("ru_ru", "q"), null);
});

test("the ISO key and the Brazilian and Japanese extras reach the target live", () => {
  assert.equal(usageForCode("IntlBackslash"), 0x64);
  assert.equal(usageForCode("IntlRo"), 0x87);
  assert.equal(usageForCode("IntlYen"), 0x89);
});

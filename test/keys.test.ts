import { test } from "node:test";
import assert from "node:assert/strict";
import { keyParts, plainKeys, splitCombo } from "../src/ui/keys.ts";

test("keys: a combination splits on plus", () => {
  assert.deepEqual(splitCombo("Ctrl+Shift+P"), ["Ctrl", "Shift", "P"]);
  assert.deepEqual(splitCombo("Esc"), ["Esc"]);
  assert.deepEqual(splitCombo("+"), ["+"]);
  assert.deepEqual(splitCombo("Ctrl++"), ["Ctrl", "+"]);
});

test("keys: [[...]] in text becomes keys", () => {
  assert.deepEqual(keyParts("Press [[Esc]] to leave"), [
    { text: "Press " },
    { keys: "Esc" },
    { text: " to leave" },
  ]);
  assert.deepEqual(keyParts("[[Ctrl+K]] or [[Ctrl+Shift+P]]"), [
    { keys: "Ctrl+K" },
    { text: " or " },
    { keys: "Ctrl+Shift+P" },
  ]);
  assert.deepEqual(keyParts("no keys"), [{ text: "no keys" }]);
  assert.equal(plainKeys("[[Ctrl+K]]: open"), "Ctrl+K: open");
});

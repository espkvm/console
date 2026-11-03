/* The strip of keys sent: chords, lone modifiers, and names. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createEcho, keyName } from "../src/input/keyEcho.ts";
import { usageForCode } from "../src/input/keymap.ts";

const u = usageForCode;

test("keys get short names", () => {
  assert.equal(keyName(u("KeyA")), "A");
  assert.equal(keyName(u("Digit5")), "5");
  assert.equal(keyName(u("Delete")), "Del");
  assert.equal(keyName(u("F12")), "F12");
  assert.equal(keyName(u("ArrowUp")), "↑");
  assert.equal(keyName(u("Numpad7")), "Num 7");
});

test("a chord shows once, with its modifiers", () => {
  const out: string[] = [];
  const e = createEcho((l) => out.push(l));
  e(0x01, []);
  e(0x05, []);
  e(0x05, [u("Delete")]);
  e(0x05, [u("Delete")]); // held: no repeat
  e(0x05, []);
  e(0, []);
  assert.deepEqual(out, ["Ctrl+Alt+Del"]);
});

test("typing shows each key, a lone modifier shows when let go", () => {
  const out: string[] = [];
  const e = createEcho((l) => out.push(l));
  e(0, [u("KeyH")]);
  e(0, []);
  e(0x02, []);
  e(0x02, [u("KeyI")]);
  e(0, []);
  e(0x08, []);
  e(0, []);
  assert.deepEqual(out, ["H", "Shift+I", "Win"]);
});

/*
 * Quick buttons: the stored list survives junk, keeps its order and its cap,
 * and a key reads as the user would write it on a keycap.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { keyLabel, keyProblem, parseQuick, QUICK_MAX, serializeQuick } from "../src/state/quick.ts";

test("parseQuick keeps valid entries in order and drops the rest", () => {
  const raw = JSON.stringify([
    { t: "key", v: "f2" },
    { t: "nope", v: "x" },
    { t: "macro", v: "" },
    { t: "combo", v: "ctrl_alt_del", extra: 1 },
    "junk",
  ]);
  assert.deepEqual(parseQuick(raw), [
    { t: "key", v: "f2" },
    { t: "combo", v: "ctrl_alt_del" },
  ]);
});

test("parseQuick tolerates empty and broken values", () => {
  assert.deepEqual(parseQuick(""), []);
  assert.deepEqual(parseQuick("{"), []);
  assert.deepEqual(parseQuick(undefined), []);
  assert.deepEqual(parseQuick('{"t":"key"}'), []);
});

test("the list is capped and round-trips", () => {
  const many = Array.from({ length: QUICK_MAX + 3 }, (_, i) => ({ t: "key" as const, v: `f${i + 1}` }));
  const back = parseQuick(serializeQuick(many));
  assert.equal(back.length, QUICK_MAX);
  assert.deepEqual(back[0], { t: "key", v: "f1" });
});

test("keyLabel writes keys as on a keycap", () => {
  assert.equal(keyLabel("f2"), "F2");
  assert.equal(keyLabel("ctrl+alt+delete"), "Ctrl+Alt+Del");
  assert.equal(keyLabel("gui+r"), "Win+R");
  assert.equal(keyLabel("escape"), "Esc");
});

test("keyProblem accepts known keys and names an unknown one", () => {
  assert.equal(keyProblem("f12"), null);
  assert.equal(keyProblem("ctrl+alt+f2"), null);
  assert.match(keyProblem("ctrl+bogus") ?? "", /bogus/);
});

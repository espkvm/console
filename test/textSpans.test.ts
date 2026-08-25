/*
 * Cutting a row where the screen changes polarity: an off-by-one here puts the
 * highlight on the wrong words, which on a boot menu is worse than none.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { textSpans } from "../src/screen/textSpans.ts";

const plain = (spans: { text: string; mark: boolean }[]) => spans.map((s) => s.text).join("");
const marked = (spans: { text: string; mark: boolean }[]) =>
  spans.filter((s) => s.mark).map((s) => s.text);

test("a screen with nothing highlighted is one span a row", () => {
  const rows = textSpans("first\nsecond", 2);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], [{ text: "first", mark: false }]);
  assert.deepEqual(rows[1], [{ text: "second", mark: false }]);
});

test("blank rows keep their box", () => {
  const rows = textSpans("only", 3);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], [{ text: " ", mark: false }]);
});

test("a highlighted run is cut out of its row and nothing else moves", () => {
  const rows = textSpans("  Boot Manager   ", 1, [[0, 2, 12]]);
  assert.equal(plain(rows[0]), "  Boot Manager   ", "the row still reads the same");
  assert.deepEqual(marked(rows[0]), ["Boot Manager"]);
});

test("a highlight past the last character gets its cells back", () => {
  /* Trailing blanks are trimmed off the text, so a bar that runs to the edge of
     the screen has to be padded back out before it can be laid over anything. */
  const rows = textSpans("Boot", 1, [[0, 0, 10]]);
  assert.deepEqual(marked(rows[0]), ["Boot      "]);
});

test("two runs on one row stay in order", () => {
  const rows = textSpans("ab cd ef", 1, [
    [0, 3, 2],
    [0, 0, 2],
  ]);
  assert.deepEqual(marked(rows[0]), ["ab", "cd"]);
  assert.equal(plain(rows[0]), "ab cd ef");
});

test("runs for other rows are left where they belong", () => {
  const rows = textSpans("one\ntwo", 2, [[1, 0, 3]]);
  assert.deepEqual(marked(rows[0]), []);
  assert.deepEqual(marked(rows[1]), ["two"]);
});

test("nonsense from the device cannot corrupt a row", () => {
  const overlapping = textSpans("abcdef", 1, [
    [0, 0, 4],
    [0, 2, 4],
  ]);
  assert.equal(plain(overlapping[0]), "abcdef", "no character is written twice");
  const empty = textSpans("abc", 1, [[0, 1, 0]]);
  assert.equal(plain(empty[0]), "abc");
  assert.deepEqual(marked(empty[0]), []);
});

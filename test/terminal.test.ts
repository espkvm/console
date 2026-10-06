import { test } from "node:test";
import assert from "node:assert/strict";

import { keyBytes, Terminal } from "../src/input/terminal.ts";

const enc = new TextEncoder();
const feed = (t: Terminal, s: string) => t.write(enc.encode(s));
const line = (t: Terminal, y: number) => t.screen[y].map((c) => c.ch).join("").trimEnd();

test("text, CR and LF land where a terminal puts them", () => {
  const t = new Terminal(20, 5);
  feed(t, "login: root\r\nPassword:");
  assert.equal(line(t, 0), "login: root");
  assert.equal(line(t, 1), "Password:");
  assert.equal(t.x, 9);
});

test("a cursor move paints at row;col, counted from 1", () => {
  const t = new Terminal(20, 5);
  feed(t, "\x1b[3;5HX");
  assert.equal(t.screen[2][4].ch, "X");
});

test("erasing the display clears every row", () => {
  const t = new Terminal(10, 3);
  feed(t, "abc\r\ndef\x1b[2J");
  assert.equal(line(t, 0), "");
  assert.equal(line(t, 1), "");
});

test("colours and inverse are kept per cell", () => {
  const t = new Terminal(10, 3);
  feed(t, "\x1b[1;37;44mA\x1b[0mB\x1b[7mC");
  assert.deepEqual([t.screen[0][0].fg, t.screen[0][0].bg, t.screen[0][0].bold], [7, 4, true]);
  assert.equal(t.screen[0][1].fg, -1);
  assert.equal(t.screen[0][2].inv, true);
});

test("a long line wraps, and old lines scroll into the scrollback", () => {
  const t = new Terminal(4, 2);
  feed(t, "abcdefgh\r\nij");
  assert.equal(t.scrollback.length, 1);
  assert.equal(t.text(), "abcd\nefgh\nij");
});

test("backspace steps back and unknown sequences print nothing", () => {
  const t = new Terminal(10, 2);
  feed(t, "ab\bX\x1b(B\x1b[?25lc");
  assert.equal(line(t, 0), "aXc");
  assert.equal(t.cursorVisible, false);
});

test("keys become VT100 bytes", () => {
  const k = (key: string, ctrlKey = false) => keyBytes({ key, ctrlKey, altKey: false, metaKey: false });
  assert.equal(k("Enter"), "\r");
  assert.equal(k("ArrowUp"), "\x1b[A");
  assert.equal(k("c", true), "\x03");
  assert.equal(k("F2"), "\x1bOQ");
  assert.equal(k("a"), "a");
  assert.equal(k("Shift"), null);
});

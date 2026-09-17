import assert from "node:assert/strict";
import { test } from "node:test";

import { cueAt, parseSrt, toVtt } from "../src/video/srt.ts";

test("the recorder's subtitles", () => {
  const cues = parseSrt(
    "1\r\n00:00:01,500 --> 00:00:03,000\r\nTyped: root⏎\r\n\r\n2\r\n00:01:02,000 --> 00:01:03,250\r\nCtrl+Alt+Delete\r\n",
  );
  assert.deepEqual(cues, [
    { start: 1.5, end: 3, text: "Typed: root⏎" },
    { start: 62, end: 63.25, text: "Ctrl+Alt+Delete" },
  ]);
  assert.equal(cueAt(cues, 2), "Typed: root⏎");
  assert.equal(cueAt(cues, 3), "");
  assert.equal(cueAt(cues, 62.5), "Ctrl+Alt+Delete");
});

test("as WebVTT for the browser's own player", () => {
  assert.equal(
    toVtt([{ start: 61.5, end: 63, text: "Typed: root" }]),
    "WEBVTT\n\n00:01:01.500 --> 00:01:03.000\nTyped: root\n",
  );
});

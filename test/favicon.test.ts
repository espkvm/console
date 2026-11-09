import { test } from "node:test";
import assert from "node:assert/strict";
import { faviconBlinks, faviconState } from "../src/ui/favicon.ts";

test("favicon: all well is the plain icon", () => {
  assert.deepEqual(faviconState({ online: true, signal: true }), { kind: "ok" });
  assert.deepEqual(faviconState({ online: true }), { kind: "ok" });
});

test("favicon: unreachable wins over everything", () => {
  assert.equal(faviconState({ online: false, recording: true, update: 40, signal: false }).kind, "offline");
});

test("favicon: update, then recording, then target off, then no signal", () => {
  assert.deepEqual(faviconState({ online: true, update: 40, recording: true }), { kind: "update", percent: 40 });
  assert.deepEqual(faviconState({ online: true, update: null }), { kind: "update", percent: undefined });
  assert.equal(faviconState({ online: true, recording: true, targetOff: true }).kind, "rec");
  assert.equal(faviconState({ online: true, targetOff: true, signal: false }).kind, "off");
  assert.equal(faviconState({ online: true, signal: false }).kind, "nosignal");
});

test("favicon: only the recording dot blinks", () => {
  assert.equal(faviconBlinks({ kind: "rec" }), true);
  assert.equal(faviconBlinks({ kind: "update", percent: 10 }), false);
  assert.equal(faviconBlinks({ kind: "nosignal" }), false);
});

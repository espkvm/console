/*
 * The SPS patch, on a real SPS from the device (Function EV, 1080p): it gains
 * the reorder restriction, a second pass finds it already there, and the rest
 * of the access unit is left as it was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { patchAnnexB, patchSps } from "../src/video/spsPatch.ts";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
const SPS = hex("6742c02995a01e008979610000030001000003003c84");

test("a device SPS gains bitstream_restriction, once", () => {
  const fixed = patchSps(SPS);
  assert.ok(fixed, "patched");
  assert.equal(fixed![0], 0x67);
  assert.ok(fixed!.length > SPS.length);
  assert.equal(patchSps(fixed!), null, "a second pass sees the flag set");
  /* The same leading bytes: profile, constraints, level and size untouched. */
  assert.deepEqual([...fixed!.subarray(0, 8)], [...SPS.subarray(0, 8)]);
});

test("the access unit keeps its other NALs", () => {
  const pps = hex("68ce3c80");
  const idr = hex("6588840021ff");
  const au = Uint8Array.from([0, 0, 0, 1, ...SPS, 0, 0, 0, 1, ...pps, 0, 0, 0, 1, ...idr]);
  const out = patchAnnexB(au);
  assert.notEqual(out, au);
  const tail = out.subarray(out.length - (4 + pps.length + 4 + idr.length));
  assert.deepEqual([...tail], [0, 0, 0, 1, ...pps, 0, 0, 0, 1, ...idr]);
  assert.equal(patchAnnexB(out), out, "nothing left to patch");
});

test("a frame with no SPS comes back as it was", () => {
  const p = hex("000000014188840021ff");
  assert.equal(patchAnnexB(p), p);
});

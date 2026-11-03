/* The tab title: the device's name, and a word in front when something is wrong. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pageTitle } from "../src/ui/title.ts";

test("the tab title names the device and says what is wrong", () => {
  assert.equal(pageTitle({ online: true }), "ESP-KVM");
  assert.equal(pageTitle({ host: "rack1", online: true, signal: true }), "rack1 - ESP-KVM");
  assert.equal(pageTitle({ host: "rack1", online: true, signal: false }), "No signal - rack1 - ESP-KVM");
  assert.equal(pageTitle({ host: "rack1", online: false, signal: false }), "Unreachable - rack1 - ESP-KVM");
  assert.equal(pageTitle({ host: "rack1", online: true }), "rack1 - ESP-KVM", "signal not known yet");
});

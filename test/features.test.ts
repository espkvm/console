/*
 * The hideable controls: the stored list round-trips, and the registry in
 * ui/features.ts and the data-ui attributes in the markup name the same ids -
 * a control tagged but not listed could never be hidden, and one listed but
 * not tagged would be a tick that does nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { UI_FEATURES, formatHidden, parseHidden } from "../src/ui/features.ts";

test("the hidden list parses commas and spaces, and formats sorted and unique", () => {
  assert.deepEqual([...parseHidden(" gamepad, cec  serial,,")], ["gamepad", "cec", "serial"]);
  assert.equal(formatHidden(["serial", "cec", "serial"]), "cec,serial");
  assert.equal(formatHidden([]), "");
});

test("every registered control is tagged in the markup, and every tag is registered", () => {
  const dir = new URL("../src/", import.meta.url).pathname;
  const files = [join(dir, "App.vue"), ...readdirSync(join(dir, "components")).map((f) => join(dir, "components", f))];
  const tagged = new Set<string>();
  for (const f of files.filter((f) => f.endsWith(".vue"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/data-ui="([a-z0-9-]+)"/g)) tagged.add(m[1]);
  }
  const listed = new Set(UI_FEATURES.map((f) => f.id));
  assert.deepEqual([...listed].filter((id) => !tagged.has(id)), [], "listed but not tagged");
  assert.deepEqual([...tagged].filter((id) => !listed.has(id)), [], "tagged but not listed");
  assert.equal(listed.size, UI_FEATURES.length, "ids are unique");
});

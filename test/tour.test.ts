/*
 * "What this device can do": when it comes up by itself, which features count
 * as new, and that every button id it names is one the console knows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { UI_FEATURES } from "../src/ui/features.ts";
import { TOUR_FEATURES, featureShown, newSince, newer, tourDue, type TourFeature } from "../src/ui/tour.ts";

const cap = (available: boolean) => ({ compiled: true, available, enabled: available, active: available });

test("release numbers compare as numbers", () => {
  assert.equal(newer("0.10.0", "0.9.9"), true);
  assert.equal(newer("0.76.0", "0.76.0"), false);
  assert.equal(newer("0.75.1", "v0.75.0-dirty"), true);
  assert.equal(newer("junk", "0.1.0"), false);
  assert.equal(newer("0.1.0", "junk"), true);
});

test("the page comes up once, then after an update past a feature", () => {
  const list: TourFeature[] = [
    { icon: "video", title: "Old", line: "", actions: [] },
    { icon: "video", title: "New", line: "", actions: [], since: "0.77.0" },
  ];
  assert.equal(tourDue(list, "", "0.76.0"), true, "never seen");
  assert.equal(tourDue(list, undefined, "0.76.0"), false, "older firmware");
  assert.equal(tourDue(list, "", ""), false, "version not known yet");
  assert.equal(tourDue(list, "0.76.0", "0.76.0"), false, "seen on this release");
  assert.equal(tourDue(list, "0.76.0", "0.77.0"), true, "updated past New");
  assert.deepEqual(
    newSince(list, "0.76.0", "0.77.0").map((f) => f.title),
    ["New"],
  );
  assert.equal(tourDue(list, "0.77.0", "0.78.0"), false, "already seen New");
  assert.deepEqual(newSince(list, "", "0.77.0"), [], "first time: nothing is marked");
});

test("a feature the board lacks is left out, an unreported one kept", () => {
  const f: TourFeature = { icon: "volume", title: "Sound", line: "", actions: [], caps: ["audio"] };
  assert.equal(featureShown(f, { audio: cap(false) }), false);
  assert.equal(featureShown(f, { audio: cap(true) }), true);
  assert.equal(featureShown(f, {}), true);
});

test("every button id the page names is a hideable control", () => {
  const known = new Set(UI_FEATURES.map((f) => f.id));
  for (const f of TOUR_FEATURES) {
    for (const id of f.ui ?? []) assert.ok(known.has(id), `${f.title}: ${id}`);
  }
});

test("every action goes somewhere", () => {
  for (const f of TOUR_FEATURES) {
    for (const a of f.actions) {
      assert.ok(a.section || a.panel || a.select, `${f.title}: ${a.label}`);
    }
  }
});

/* The console checked out inside the firmware repository; on its own there is no table. */
const TABLE = new URL("../../components/kvm_config/kvm_settings_table.c", import.meta.url);

test("every section and group a button opens is in the firmware's settings table", { skip: !existsSync(TABLE) }, () => {
  const table = readFileSync(TABLE, "utf8");
  const pairs = new Set<string>();
  const sections = new Set<string>();
  for (const m of table.matchAll(/\.section = "([a-z_]+)"(?:, \.group = "([^"]+)")?/g)) {
    sections.add(m[1]);
    if (m[2]) pairs.add(`${m[1]}/${m[2]}`);
  }
  for (const f of TOUR_FEATURES) {
    for (const a of f.actions) {
      if (!a.section) continue;
      assert.ok(sections.has(a.section), `${f.title}: section ${a.section}`);
      if (a.group) assert.ok(pairs.has(`${a.section}/${a.group}`), `${f.title}: ${a.section}/${a.group}`);
    }
  }
});

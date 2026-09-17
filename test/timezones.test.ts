import assert from "node:assert/strict";
import { test } from "node:test";

import { browserZone, posixFromOffset, posixOffset, zoneName, zoneOptions } from "../src/state/timezones.ts";

test("fixed offsets in POSIX form, whose sign is the other way round", () => {
  assert.equal(posixFromOffset(0), "<+00>0");
  assert.equal(posixFromOffset(180), "<+03>-3");
  assert.equal(posixFromOffset(330), "<+0530>-5:30");
  assert.equal(posixFromOffset(-300), "<-05>5");
});

test("the browser's zone by name, or by offset when the name is unknown", () => {
  assert.deepEqual(browserZone("Europe/Moscow", 180), { name: "Europe/Moscow", posix: "MSK-3", exact: true });
  assert.deepEqual(browserZone("Mars/Olympus", 60), { name: "Mars/Olympus", posix: "<+01>-1", exact: false });
  assert.equal(zoneName("MSK-3"), "Europe/Moscow");
  assert.equal(zoneName("XYZ"), null);
});

test("the list is ordered by offset and labelled with it", () => {
  assert.equal(posixOffset("MSK-3"), 180);
  assert.equal(posixOffset("<-03>3"), -180);
  assert.equal(posixOffset("IST-5:30"), 330);
  assert.equal(posixOffset("EST5EDT,M3.2.0,M11.1.0"), -300);
  const list = zoneOptions();
  assert.equal(list[0].label, "UTC-10:00 Honolulu");
  assert.ok(list.some((z) => z.label === "UTC+03:00 Moscow" && z.posix === "MSK-3"));
  assert.ok(!list.some((z) => z.name === "Europe/Kiev"));
});

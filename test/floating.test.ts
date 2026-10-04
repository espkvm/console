import { test } from "node:test";
import assert from "node:assert/strict";

import { keepInside } from "../src/ui/floating.ts";

test("a window pulled past an edge comes back inside", () => {
  assert.deepEqual(keepInside({ x: 900, y: 700 }, 300, 200, 1000, 800), { x: 692, y: 592 });
  assert.deepEqual(keepInside({ x: -50, y: -10 }, 300, 200, 1000, 800), { x: 8, y: 8 });
});

test("a window bigger than the screen is pinned to the top-left", () => {
  assert.deepEqual(keepInside({ x: 100, y: 100 }, 1200, 900, 1000, 800), { x: 8, y: 8 });
});

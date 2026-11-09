import { test } from "node:test";
import assert from "node:assert/strict";
import { settingShown } from "../src/state/showIf.ts";
import type { Setting } from "../src/state/device.ts";

const s = (key: string, showIf?: Setting["showIf"]) => ({ key, showIf }) as Setting;

test("showIf in / notIn: the SPI LCD pins show for both SPI panels", () => {
  const schema = [s("disp_enable"), s("disp_type", { key: "disp_enable", eq: 1 }), s("disp_dc", { key: "disp_type", in: [2, 15] }), s("disp_sda", { key: "disp_type", notIn: [2, 15] })];
  const on = (t: number) => ({ disp_enable: 1, disp_type: t });
  assert.equal(settingShown(schema, on(2), schema[2]), true);
  assert.equal(settingShown(schema, on(15), schema[2]), true);
  assert.equal(settingShown(schema, on(0), schema[2]), false);
  assert.equal(settingShown(schema, on(0), schema[3]), true);
  assert.equal(settingShown(schema, on(15), schema[3]), false);
  assert.equal(settingShown(schema, { disp_enable: 0, disp_type: 15 }, schema[2]), false);
});

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { networkRows, signalWord } from "../src/state/wifiScan.ts";

test("one row per name, the strongest access point wins, hidden ones dropped", () => {
  const rows = networkRows([
    { ssid: "home", rssi: -70, auth: 3 },
    { ssid: "", rssi: -40, auth: 3 },
    { ssid: "cafe", rssi: -60, auth: 0 },
    { ssid: "home", rssi: -50, auth: 3 },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.ssid, r.rssi, r.open]),
    [
      ["home", -50, false],
      ["cafe", -60, true],
    ],
  );
});

test("signal words", () => {
  assert.equal(signalWord(-48), "strong");
  assert.equal(signalWord(-67), "good");
  assert.equal(signalWord(-75), "weak");
  assert.equal(signalWord(-90), "poor");
});

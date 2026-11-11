/*
 * A device's Wi-Fi scan as a list to pick from: one row per network name (a
 * mesh shows up as several access points with the same name), hidden networks
 * left out, strongest first.
 */

export interface ScannedAp {
  ssid: string;
  rssi: number;
  auth: number;
}

export interface NetworkRow {
  ssid: string;
  rssi: number;
  open: boolean;
  /** "strong", "good", "weak" or "poor". */
  signal: string;
}

export function signalWord(rssi: number): string {
  if (rssi >= -55) return "strong";
  if (rssi >= -67) return "good";
  if (rssi >= -78) return "weak";
  return "poor";
}

export function networkRows(aps: ScannedAp[]): NetworkRow[] {
  const best = new Map<string, ScannedAp>();
  for (const ap of aps) {
    if (!ap.ssid) continue;
    const seen = best.get(ap.ssid);
    if (!seen || ap.rssi > seen.rssi) best.set(ap.ssid, ap);
  }
  return [...best.values()]
    .sort((a, b) => b.rssi - a.rssi)
    .map((ap) => ({ ssid: ap.ssid, rssi: ap.rssi, open: ap.auth === 0, signal: signalWord(ap.rssi) }));
}

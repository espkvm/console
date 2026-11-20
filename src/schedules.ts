/*
 * Schedules: cron lines that fire an action on the device. The device runs
 * them; this validates a line the same way the firmware's cron parser does, so
 * the editor can refuse a bad one before it is saved. The reference is at
 * https://espkvm.io/scripts/.
 */
import { t, tm } from "./i18n";
export type ScheduleAction =
  | "wol"
  | "usbwake"
  | "power"
  | "reset"
  | "poweroff"
  | "runbook"
  | "clip"
  | "screenshot"
  | "machine"
  | "restart";

export interface Schedule {
  name: string;
  cron: string;
  action: ScheduleAction;
  arg?: string; // the runbook name, or the machine from 1 for "machine" (none = the next)
  enabled: boolean;
}

/** The actions, with the label the panel shows. */
export const SCHEDULE_ACTIONS: { value: ScheduleAction; label: string }[] = [
  { value: "wol", label: tm("Wake-on-LAN") },
  { value: "usbwake", label: tm("Power on over USB") },
  { value: "power", label: tm("Power button (tap)") },
  { value: "reset", label: tm("Reset") },
  { value: "poweroff", label: tm("Force off (hold power)") },
  { value: "runbook", label: tm("Run a runbook") },
  { value: "clip", label: tm("Save a dashcam clip") },
  { value: "screenshot", label: tm("Screenshot to the card") },
  { value: "machine", label: tm("KVM switch: change machine") },
  { value: "restart", label: tm("Restart ESP-KVM") },
];

const FIELDS = [
  { name: tm("minute"), lo: 0, hi: 59 },
  { name: tm("hour"), lo: 0, hi: 23 },
  { name: tm("day-of-month"), lo: 1, hi: 31 },
  { name: tm("month"), lo: 1, hi: 12 },
  { name: tm("weekday"), lo: 0, hi: 7 },
];

function itemOk(item: string, lo: number, hi: number): boolean {
  let body = item;
  const slash = item.indexOf("/");
  if (slash >= 0) {
    const step = item.slice(slash + 1);
    if (!/^\d+$/.test(step) || +step < 1 || +step > hi - lo + 1) return false;
    body = item.slice(0, slash);
  }
  if (body === "*") return true;
  const dash = body.indexOf("-");
  if (dash >= 0) {
    const a = body.slice(0, dash);
    const b = body.slice(dash + 1);
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return false;
    return +a >= lo && +b <= hi && +a <= +b;
  }
  if (!/^\d+$/.test(body)) return false;
  return +body >= lo && +body <= hi;
}

/** null when the spec is a valid five-field cron, else the reason (matching the
 *  device's own words). */
export function cronError(spec: string): string | null {
  const parts = spec.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) {
    return t("a schedule is five fields: minute hour day month weekday");
  }
  for (let i = 0; i < 5; i++) {
    const f = FIELDS[i];
    const items = parts[i].split(",");
    if (items.some((it) => it === "" || !itemOk(it, f.lo, f.hi))) {
      return t('the {field} field "{value}" is not valid', { field: t(f.name), value: parts[i].slice(0, 20) });
    }
  }
  return null;
}

/** Read the stored schedules JSON into a list, tolerating an empty or bad value. */
export function loadSchedules(json: unknown): Schedule[] {
  if (typeof json !== "string" || !json.trim()) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.name === "string" && typeof s.cron === "string")
      .map((s) => ({
        name: s.name,
        cron: s.cron,
        action: (s.action ?? "wol") as ScheduleAction,
        ...(typeof s.arg === "string" ? { arg: s.arg } : {}),
        enabled: s.enabled !== false,
      }));
  } catch {
    return [];
  }
}

export function serializeSchedules(list: Schedule[]): string {
  return JSON.stringify(
    list.map((s) => ({
      name: s.name,
      cron: s.cron,
      action: s.action,
      ...((s.action === "runbook" || s.action === "machine") && s.arg ? { arg: s.arg } : {}),
      enabled: s.enabled,
    })),
  );
}

export const SCHEDULES_MAX_BYTES = 3000;
export function schedulesBytes(list: Schedule[]): number {
  return new TextEncoder().encode(serializeSchedules(list)).length;
}

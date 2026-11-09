/*
 * Kept apart from device.ts so the tests can load it: node runs the tests with
 * type stripping, and device.ts uses syntax that cannot be stripped.
 */
import type { Setting, Values } from "./device";

/**
 * Whether a setting is shown for the values as they are. A setting with showIf
 * follows the one it names, and that one its own: the round LCD's pins hang on
 * the panel type, which hangs on the display being on. The device applies the
 * same rule to its pin check (kvm_settings.c).
 */
export function settingShown(schema: Setting[], values: Values, s: Setting): boolean {
  let cur: Setting | undefined = s;
  for (let depth = 0; cur?.showIf && depth < 8; depth++) {
    const cond: NonNullable<Setting["showIf"]> = cur.showIf;
    const { key, eq, ne, in: inSet, notIn } = cond;
    const v = Number(values[key]);
    if (eq !== undefined && v !== eq) return false;
    if (ne !== undefined && v === ne) return false;
    if (inSet && !inSet.includes(v)) return false;
    if (notIn && notIn.includes(v)) return false;
    cur = schema.find((x) => x.key === key);
  }
  return true;
}

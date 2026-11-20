/*
 * The console's own controls that a person can hide - Settings -> UI. This is
 * the one list of them: a control opts in by carrying data-ui="<id>" in the
 * markup, and this module turns the device's ui_hidden setting (a list of ids)
 * into one style rule that hides exactly those. Nothing here switches a feature
 * off on the device; it only takes a button out of the way.
 *
 * Adding a control: give its element data-ui="<id>" and add the id here.
 * Removing one from this list leaves a stored id that matches nothing, which is
 * harmless.
 */
import { ref, watch } from "vue";
import { tm } from "../i18n";

export interface UiFeature {
  id: string;
  label: string;
  group: string;
}

export const UI_FEATURES: UiFeature[] = [
  { id: "serial", label: tm("Serial console"), group: tm("Connections") },
  { id: "tools", label: tm("ESP-KVM Tools"), group: tm("Connections") },
  { id: "keyboard", label: tm("On-screen keyboard"), group: tm("Input") },
  { id: "cec", label: tm("TV remote (HDMI-CEC)"), group: tm("Input") },
  { id: "gamepad", label: tm("Gamepad"), group: tm("Input") },
  { id: "touch", label: tm("Touch mode"), group: tm("Input") },
  { id: "padmouse", label: tm("Controller as mouse"), group: tm("Input") },
  { id: "keylock", label: tm("Keyboard lock (shortcuts to the target)"), group: tm("Input") },
  { id: "pause", label: tm("Pause the stream"), group: tm("Picture") },
  { id: "scale", label: tm("Scale"), group: tm("Picture") },
  { id: "fullscreen", label: tm("Full screen"), group: tm("Picture") },
  { id: "pip", label: tm("Picture in a small window"), group: tm("Picture") },
  { id: "sound", label: tm("Sound"), group: tm("Picture") },
  { id: "select", label: tm("Select text on the screen"), group: tm("Screen text") },
  { id: "copy", label: tm("Copy the screen as text"), group: tm("Screen text") },
  { id: "screenshot", label: tm("Screenshot"), group: tm("Recording") },
  { id: "clip", label: tm("Save clip (dashcam)"), group: tm("Recording") },
  { id: "record", label: tm("Record"), group: tm("Recording") },
  { id: "netlog", label: tm("Target log (netconsole)"), group: tm("Logs") },
];

/** Parse the stored list: ids separated by commas or spaces. */
export function parseHidden(csv: string): Set<string> {
  return new Set(
    csv
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** The list to store, in a stable order. */
export function formatHidden(ids: Iterable<string>): string {
  return [...new Set(ids)].sort().join(",");
}

export const uiHidden = ref<Set<string>>(new Set());

export function setUiHidden(csv: string): void {
  const next = parseHidden(csv);
  const cur = uiHidden.value;
  if (next.size === cur.size && [...next].every((id) => cur.has(id))) return;
  uiHidden.value = next;
}

/** Whether a control is shown - for code that has to know, not just CSS. */
export function uiShown(id: string): boolean {
  return !uiHidden.value.has(id);
}

/* One style element, rewritten when the list changes. */
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.id = "ui-hidden";
  document.head.appendChild(style);
  watch(
    uiHidden,
    (ids) => {
      style.textContent = [...ids]
        .filter((id) => /^[a-z0-9-]+$/.test(id))
        .map((id) => `[data-ui="${id}"]{display:none!important}`)
        .join("\n");
    },
    { immediate: true },
  );
}

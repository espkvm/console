/*
 * The list behind "What this device can do" (FeatureTour.vue), and the rule for
 * when the page comes up by itself. The device keeps the firmware version the
 * page was last closed on ("tourSeen" in /api/v1/profiles, "" never). The page
 * comes up when it was never seen, and after an update past a feature's
 * `since`, with that feature marked New.
 *
 * Adding a feature: add an entry with `since` set to the release it ships in.
 */
import type { Capability, Values } from "../state/device";

export type TourPanel = "input" | "media" | "automation" | "captures";

export interface TourAction {
  label: string;
  /** A Settings section to open... */
  section?: string;
  /** ...and the group in it to scroll to. */
  group?: string;
  panel?: TourPanel;
  /** Start selecting text on the screen. */
  select?: boolean;
}

/** What the page knows about the device, for the On / Off marks. */
export interface TourContext {
  caps: Record<string, Capability>;
  values: Values;
  passwordSet: boolean;
  profileCount: number;
}

export interface TourFeature {
  icon: string;
  title: string;
  line: string;
  /** Left out when none of these capabilities is available on this board. */
  caps?: string[];
  actions: TourAction[];
  /** A page in the docs. */
  docs?: string;
  /** The console's buttons for it (ids in ui/features.ts), to say when they are hidden. */
  ui?: string[];
  /** The release it came in; a device updated past it shows the page again. */
  since?: string;
  /** A short state: "On", "Off", "2 profiles". Nothing when there is none to tell. */
  state?: (c: TourContext) => string | undefined;
}

const DOCS = "https://github.com/espkvm/espkvm/blob/main/docs/";

function capOn(c: TourContext, ...ids: string[]): string | undefined {
  const known = ids.map((id) => c.caps[id]).filter(Boolean);
  if (!known.length) return undefined;
  return known.some((cap) => cap.available && cap.enabled) ? "On" : "Off";
}

function settingOn(c: TourContext, key: string): string | undefined {
  const v = c.values[key];
  if (v === undefined) return undefined;
  return v === true || v === 1 || v === "1" ? "On" : "Off";
}

export const TOUR_FEATURES: TourFeature[] = [
  {
    icon: "video",
    title: "Picture",
    line: "MJPEG or H.264. The codec, quality and frame rate can be changed.",
    actions: [{ label: "Video", section: "video", group: "Picture" }],
    docs: DOCS + "HOW-IT-WORKS.md#video",
  },
  {
    icon: "keyboard",
    title: "Keyboard and mouse",
    line: "Paste text in the target's layout, media keys, an on-screen keyboard, a trackpad on a phone.",
    actions: [
      { label: "Open", panel: "input" },
      { label: "Input", section: "input" },
    ],
    docs: DOCS + "HOW-IT-WORKS.md#input",
    ui: ["keyboard", "touch", "keylock"],
  },
  {
    icon: "disc",
    title: "Virtual media",
    line: "Boot the target from an image on the microSD card or the device's flash.",
    caps: ["msc"],
    actions: [{ label: "Open", panel: "media" }],
    docs: DOCS + "HOW-IT-WORKS.md#virtual-media",
    state: (c) => capOn(c, "msc"),
  },
  {
    icon: "film",
    title: "Recording",
    line: "Recordings, screenshots, a dashcam that keeps the last minutes, timelapse. On a microSD card.",
    actions: [
      { label: "Recordings", panel: "captures" },
      { label: "Video", section: "video", group: "Recording" },
    ],
    docs: DOCS + "HOW-IT-WORKS.md#recording-and-screenshots",
    ui: ["screenshot", "clip", "record"],
  },
  {
    icon: "volume",
    title: "Sound",
    line: "The target's HDMI sound, live and in recordings.",
    caps: ["audio"],
    actions: [{ label: "Audio", section: "audio" }],
    docs: DOCS + "HOW-IT-WORKS.md#sound",
    ui: ["sound"],
    state: (c) => capOn(c, "audio"),
  },
  {
    icon: "play",
    title: "Automation",
    line: "Macros, runbooks and a scheduler. Screen areas react when a part of the screen changes.",
    caps: ["runbooks"],
    actions: [{ label: "Open", panel: "automation" }],
    docs: DOCS + "SCRIPTS.md",
  },
  {
    icon: "copy",
    title: "Screen as text",
    line: "Read a text screen, like a BIOS or a console, as characters and copy it.",
    actions: [{ label: "Select text", select: true }],
    docs: DOCS + "HOW-IT-WORKS.md#reading-the-screen",
    ui: ["select", "copy"],
  },
  {
    icon: "power",
    title: "Power",
    line: "Power and reset buttons over ATX wiring, the power and disk lights, Wake-on-LAN.",
    caps: ["atx", "wol"],
    actions: [{ label: "Power", section: "power", group: "ATX wiring" }],
    docs: DOCS + "wiring.md",
    state: (c) => capOn(c, "atx"),
  },
  {
    icon: "remote",
    title: "TV remote",
    line: "HDMI-CEC: turn a TV or a media box on and off, use its remote.",
    caps: ["cec"],
    actions: [{ label: "HDMI-CEC", section: "power", group: "HDMI-CEC" }],
    docs: DOCS + "HOW-IT-WORKS.md#what-works-in-detail",
    ui: ["cec"],
    state: (c) => capOn(c, "cec"),
  },
  {
    icon: "gamepad",
    title: "Gamepad",
    line: "The device can be a controller for a Nintendo Switch.",
    caps: ["hid"],
    actions: [{ label: "Input", section: "input", group: "Target" }],
    docs: DOCS + "HOW-IT-WORKS.md#input",
    ui: ["gamepad", "padmouse"],
    state: (c) => {
      const v = c.values.usb_pad;
      if (v === undefined) return undefined;
      return v && v !== "0" && v !== "off" ? "On" : "Off";
    },
  },
  {
    icon: "usb",
    title: "Profiles",
    line: "Settings for each target. The device picks one from what is attached.",
    actions: [{ label: "Settings", section: "video" }],
    docs: DOCS + "HOW-IT-WORKS.md#device-profiles",
    state: (c) => (c.profileCount ? `${c.profileCount} of your own` : undefined),
  },
  {
    icon: "terminal",
    title: "Serial console and agent",
    line: "The target's serial console, its log over the network, and an agent for the clipboard and a clean shutdown.",
    actions: [
      { label: "Serial", section: "power", group: "Serial console" },
      { label: "Netconsole", section: "network", group: "Netconsole" },
    ],
    docs: DOCS + "wiring.md#serial-console",
    ui: ["serial", "agent", "netlog"],
    state: (c) => capOn(c, "serial", "netlog"),
  },
  {
    icon: "vpn",
    title: "Remote access",
    line: "Tailscale or WireGuard, to reach the device from outside without opening ports. Tailscale needs only a sign-in.",
    caps: ["tailscale", "wireguard"],
    since: "0.77.0",
    actions: [{ label: "VPN", section: "vpn" }],
    docs: DOCS + "SETUP.md#reaching-it-from-outside-tailscale-or-wireguard",
    state: (c) => {
      if (c.values.ts_enable === undefined && c.values.wg_enable === undefined) return undefined;
      return settingOn(c, "ts_enable") === "On" || settingOn(c, "wg_enable") === "On" ? "On" : "Off";
    },
  },
  {
    icon: "mqtt",
    title: "Home Assistant",
    line: "The device and the target's state over MQTT, found by Home Assistant by itself.",
    actions: [{ label: "MQTT", section: "mqtt" }],
    docs: DOCS + "HOW-IT-WORKS.md#what-works-in-detail",
    state: (c) => settingOn(c, "mqtt_enable"),
  },
  {
    icon: "info",
    title: "Notifications",
    line: "A message to Telegram, a webhook or this browser when a phrase shows up on the screen or the screen goes blank.",
    caps: ["notify"],
    since: "0.77.0",
    actions: [{ label: "Notifications", section: "notify" }],
    docs: DOCS + "NOTIFICATIONS.md",
    state: (c) => settingOn(c, "notify_enable"),
  },
  {
    icon: "eye",
    title: "Security",
    line: "A password, two-factor sign-in, a view-only sign-in for others, your own HTTPS certificate.",
    actions: [{ label: "Security", section: "security" }],
    docs: DOCS + "HOW-IT-WORKS.md#security",
    state: (c) => (c.passwordSet ? "Password set" : "No password"),
  },
  {
    icon: "screen",
    title: "Status display",
    line: "A small screen on the device that shows its state.",
    caps: ["display"],
    actions: [{ label: "Display", section: "display" }],
    docs: DOCS + "BOARDS.md#status-display-optional",
    state: (c) => capOn(c, "display"),
  },
  {
    icon: "download",
    title: "Updates",
    line: "Updates over the network. A trial update goes back by itself unless you keep it.",
    caps: ["ota"],
    actions: [{ label: "System", section: "system", group: "Updates" }],
    docs: DOCS + "HOW-IT-WORKS.md#updates",
  },
];

/** A release number as three numbers; anything after them is ignored. */
function parse(v: string): number[] | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Whether release @p a came after @p b. An unreadable one never did. */
export function newer(a: string, b: string): boolean {
  const x = parse(a);
  const y = parse(b);
  if (!x) return false;
  if (!y) return true;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}

/** Features that came after @p seen, up to the running @p firmware. None when never seen: all is new then. */
export function newSince(features: TourFeature[], seen: string, firmware: string): TourFeature[] {
  if (!seen) return [];
  return features.filter((f) => f.since && newer(f.since, seen) && !newer(f.since, firmware));
}

/** Whether the page should come up by itself. Older firmware sends no tourSeen. */
export function tourDue(features: TourFeature[], seen: string | undefined, firmware: string): boolean {
  if (seen === undefined || !firmware) return false;
  return seen === "" || newSince(features, seen, firmware).length > 0;
}

/** A feature kept when one of its capabilities is there. One the firmware does not report is kept too. */
export function featureShown(f: TourFeature, caps: Record<string, Capability>): boolean {
  if (!f.caps) return true;
  return f.caps.some((id) => {
    const c = caps[id];
    return !c || (c.compiled && c.available);
  });
}

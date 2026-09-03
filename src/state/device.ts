/*
 * The device is the source of truth for configuration and for what the hardware
 * can actually do.
 *
 * Nothing here caches a preference in the browser: a KVM is reached from a
 * laptop today and a phone tomorrow, and the thing being configured is the
 * device. Capabilities come from the same place, so a control the hardware
 * cannot support is disabled with the device's own explanation rather than a
 * guess made in the UI.
 */

/*
 * The header the device wants on anything that changes something.
 *
 * Its session lives in a cookie, and a cookie alone cannot say whether the
 * operator meant a request or another site did. A page elsewhere cannot add a
 * header of its own without permission the device never grants, so this is what
 * tells the two apart. See KVM_CONSOLE_HEADER in the firmware.
 */
export const CONSOLE_HEADER = { "X-ESP-KVM": "1" } as const;

export type SettingType = "bool" | "int" | "enum" | "string";

export interface Setting {
  key: string;
  section: string;
  title: string;
  help?: string;
  type: SettingType;
  min?: number;
  max?: number;
  choices?: string[];
  maxLength?: number;
  default: number | string;
  /** Capability this setting depends on, if any. */
  requires?: string;
  /** Takes effect only after the device restarts. */
  reboot?: boolean;
  /** Write-only secret (e.g. a VPN key): never read back, submitted only when set. */
  secret?: boolean;
  /** An INT that is a GPIO number: render a pin picker (free GPIOs + None). */
  pin?: boolean;
  /** Show this setting only while another setting equals a given value, e.g. the
   *  GC9A01's SPI pins appear only when the round LCD is the chosen display type. */
  showIf?: { key: string; eq: number };
}

/** The GPIO map: the usable range and which pins the board's fixed peripherals hold. */
/**
 * One pin of an expansion header: either a GPIO, or something that is not one -
 * power, ground, a co-processor's pin, nothing at all.
 */
export interface HeaderPin {
  gpio?: number;
  label?: string;
  /** What to know before putting a wire here, when there is anything. */
  note?: string;
}

/**
 * A header as it is printed on the board, two columns read top to bottom.
 * When `numbered`, the pins carry printed numbers in the usual arrangement -
 * left column odd, right column even.
 */
export interface Header {
  name: string;
  numbered: boolean;
  left: HeaderPin[];
  right?: HeaderPin[];
}

export interface PinInfo {
  usableMin: number;
  usableMax: number;
  reserved: { pin: number; use: string }[];
  /** What the board is called. */
  board?: string;
  /** Absent when this board has no pinout in the firmware. */
  headers?: Header[];
  /** Whether that pinout was checked against real hardware, or only read off
   *  the vendor's diagram. */
  headerVerified?: boolean;
}

export async function loadPins(): Promise<PinInfo> {
  return getJson<PinInfo>("/api/v1/pins");
}

export interface Capability {
  compiled: boolean;
  available: boolean;
  enabled: boolean;
  active: boolean;
  setting?: string;
  reason?: string;
}

export interface VideoStatus {
  signal: boolean;
  width: number;
  height: number;
  interlaced: boolean;
  fps: number;
  skippedFps: number;
  kbps: number;
  /** Mean time one frame took to encode. */
  encodeUs: number;
  /** Share of wall clock the encoder was busy. */
  encoderBusyPct: number;
  modeChanges: number;
  sysStatus: number;
  viewers: number;
  /** Codec currently running: "mjpeg", "h264", or "none" before the first frame. */
  codec: string;
  /**
   * The device could read this mode as a character grid, so offering Select and
   * Copy makes sense. Whether there is text on file right now is a separate
   * question, and `/api/v1/screen/text` is the one that answers it.
   *
   * Absent on firmware older than this field, which is why the console treats
   * only an explicit `true` as a yes.
   */
  textMode?: boolean;
  /** How long the picture has been one flat colour, in ms; 0 when it is not. */
  flatMs?: number;
}

/**
 * One OTA app slot. `state` is the bootloader's verdict on its image:
 * `valid`/`undefined` boot normally, `pending` is a fresh image awaiting its
 * self-confirmation (a reset now would roll it back), `invalid`/`aborted` failed.
 */
export interface OtaSlot {
  label: string;
  version: string;
  state: "new" | "pending" | "valid" | "invalid" | "aborted" | "undefined";
  /** The slot running right now. */
  running: boolean;
  /** The slot the bootloader boots next; differs from `running` after a switch. */
  boot: boolean;
}

export interface SystemInfo {
  project: string;
  version: string;
  built: string;
  /** The id this board's published image is named with, e.g. "funcev". */
  boardId?: string;
  idf: string;
  partition: string;
  /** A second app slot exists, so an update could be installed. */
  updatable: boolean;
  /** The OTA app slots: version + image state per slot. Absent on older firmware. */
  ota?: OtaSlot[];
  uptimeSeconds: number;
  heapFree: number;
  psramFree: number;
  /** 0 when the sensor is unavailable. */
  tempC: number;
  /**
   * Active network link, when the firmware reports it. `up`/`mbps` are the
   * Ethernet link; `mode` is which link is in use, with the WiFi fields filled
   * when it is "wifi" (station) or "ap" (the device's own hotspot).
   */
  net?: {
    up: boolean;
    mbps: number;
    mode?: "ethernet" | "wifi" | "ap";
    wifiUp?: boolean;
    rssi?: number;
    ssid?: string;
    apClients?: number;
    /** The name the device answers to; `<hostname>.local` over mDNS. */
    hostname?: string;
    /** The active link's IPv4 address, "" on a network without one. */
    ip4?: string;
    /** The active link's MAC - what a DHCP reservation is keyed on. */
    mac?: string;
    /**
     * The IPv6 addresses the active link holds, most routable first. Nobody
     * chose them - they are autoconfigured - so the console is where an operator
     * finds out what they are. Absent on older firmware, empty on a network
     * without IPv6.
     */
    ipv6?: string[];
  };
  /**
   * ATX power control state, when the firmware reports it.
   * `enabled` - wired and switched on; `known` - a power LED is sensed, so
   * `on` is meaningful rather than a guess.
   */
  atx?: { enabled: boolean; known: boolean; on: boolean };
  /**
   * MQTT bridge state, when the firmware reports it.
   * `enabled` - turned on with a broker set; `connected` - a live session with
   * the broker right now.
   */
  mqtt?: { enabled: boolean; connected: boolean };
  /**
   * Classic WireGuard tunnel state. `enabled` - on and started; `up` - a
   * handshake with the peer completed. `publicKey` is the device's own key.
   */
  wg?: { enabled: boolean; up: boolean; address: string; publicKey: string };
  /**
   * Native Tailscale state, when the firmware reports it.
   * `enabled` - turned on and started; `up` - registered with the control plane
   * and ready. `address` is the device's tailnet IP (100.x); `peers` is how many
   * tailnet peers are known.
   */
  ts?: { enabled: boolean; up: boolean; address: string; peers: number };
}

export type Values = Record<string, number | string | boolean>;

const SETTINGS_URL = "/api/v1/settings";
const SCHEMA_URL = "/api/v1/settings/schema";
const CAPS_URL = "/api/capabilities";
const VIDEO_URL = "/api/v1/video/status";

/**
 * The device says "who is asking?" with a 401, and that is not the same thing
 * as being unreachable: sessions live in the device's memory, so every reboot
 * signs everyone out and a console left open overnight will meet this. Telling
 * the two apart is the difference between "sign in again" and an operator
 * hunting for a network fault that is not there.
 */
export class Unauthorized extends Error {
  constructor() {
    super("the session has ended");
    this.name = "Unauthorized";
  }
}

/**
 * The message to raise from a failed fetch. The device answers errors with a
 * JSON `{ error }` body; when it does not (a bare status, an empty or unreadable
 * body) fall back to @p fallback. Reads the body once - callers must not have
 * consumed it.
 */
async function errorFromResponse(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error ?? fallback;
}

/**
 * Build an Error from a finished XMLHttpRequest whose status was not 2xx: the
 * device's JSON `{ error }` message when the response parses and carries one,
 * otherwise @p fallback.
 */
function rejectFromXhr(xhr: XMLHttpRequest, fallback: string): Error {
  try {
    const body = JSON.parse(xhr.responseText) as { error?: string };
    if (body.error) return new Error(body.error);
  } catch {
    /* keep the fallback message */
  }
  return new Error(fallback);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as T;
}

export async function loadSchema(): Promise<Setting[]> {
  return getJson<Setting[]>(SCHEMA_URL);
}

export async function loadValues(): Promise<Values> {
  return getJson<Values>(SETTINGS_URL);
}

export async function loadCapabilities(): Promise<Record<string, Capability>> {
  return getJson<Record<string, Capability>>(CAPS_URL);
}

export async function loadSystemInfo(): Promise<SystemInfo> {
  return getJson<SystemInfo>("/api/v1/system/info");
}

/**
 * How the target enumerated us over USB, and the OS inferred from it.
 * `trace` is the raw request fingerprint - if `os` is wrong for a machine,
 * that string is what to send so the heuristic can learn it.
 */
export interface UsbProbe {
  os: "windows" | "macos" | "linux" | "android" | "unknown";
  trace: string;
}

export async function loadUsbProbe(): Promise<UsbProbe> {
  return getJson<UsbProbe>("/api/v1/system/usbprobe");
}

export async function loadVideoStatus(): Promise<VideoStatus> {
  return getJson<VideoStatus>(VIDEO_URL);
}

/**
 * The screen read as characters, when the target is in a text mode - a BIOS, a
 * boot loader, a console. `text` is the whole screen with the rows joined by
 * newlines; `cols`/`rows` describe the grid, so it can be laid over the video
 * cell for cell.
 */
export interface ScreenText {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** Where the grid starts in the frame - a UEFI console centres its text. */
  originX: number;
  originY: number;
  /** The frame it was read from, so the grid can be scaled onto any size. */
  width: number;
  height: number;
  confidence: number;
  ageMs: number;
  text: string;
  /**
   * Cells drawn the other way round from the rest of the screen, as runs of
   * [row, column, length] - which on a character screen is what a selection is:
   * the menu row you are on, a highlighted button. Absent when there are none.
   */
  highlight?: number[][];
}

/**
 * Null is the ordinary answer, not a failure: a machine that has finished
 * booting is showing a picture, and there is nothing to read.
 */
export async function loadScreenText(): Promise<ScreenText | null> {
  const res = await fetch("/api/v1/screen/text", { cache: "no-store" });
  if (res.status === 401) throw new Unauthorized();
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`/api/v1/screen/text returned ${res.status}`);
  return (await res.json()) as ScreenText;
}

/**
 * Write settings. The device validates and applies all or none, so a rejected
 * value never leaves the interface showing something the device is not doing.
 * @returns every setting as the device now sees it
 */
export async function saveSettings(patch: Values): Promise<Values> {
  const res = await fetch(SETTINGS_URL, {
    method: "PUT",
    headers: { ...CONSOLE_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) throw new Unauthorized();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `settings write failed (${res.status})`);
  }
  return body as Values;
}

export async function resetSettings(): Promise<Values> {
  const res = await fetch(`${SETTINGS_URL}/reset`, { method: "POST", headers: CONSOLE_HEADER });
  if (!res.ok) throw new Error(`reset failed (${res.status})`);
  return (await res.json()) as Values;
}

/**
 * Wake the target with a Wake-on-LAN magic packet. The target's MAC is a
 * setting; the device sends the packet from its own network interface.
 */
export async function wakeTarget(): Promise<void> {
  const res = await fetch("/api/v1/power/wake", { method: "POST", headers: CONSOLE_HEADER });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(await errorFromResponse(res, `wake failed (${res.status})`));
}

/**
 * ATX power actions: "press" the target's front-panel buttons through the
 * device's optocouplers. Each returns as soon as the press is queued; the
 * device holds the pulse itself. `click` is a normal power tap, `hold` is a
 * five-second hard off, `reset` taps the reset button.
 */
async function powerAction(action: "click" | "hold" | "reset"): Promise<void> {
  const res = await fetch(`/api/v1/power/${action}`, { method: "POST", headers: CONSOLE_HEADER });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(await errorFromResponse(res, `power ${action} failed (${res.status})`));
}

/**
 * Present the keyboard and mouse to the target again, as if the cable had been
 * pulled and put back. What it is for: the device restarted (an update, above
 * all) while the target stayed on, so the target still holds a connection this
 * side has forgotten and input goes nowhere. Neither machine is restarted.
 */
export async function replugUsb(): Promise<void> {
  const res = await fetch("/api/v1/hid/reattach", { method: "POST", headers: CONSOLE_HEADER });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(await errorFromResponse(res, `re-plug failed (${res.status})`));
}

export const powerClick = () => powerAction("click");
export const powerHold = () => powerAction("hold");
export const powerReset = () => powerAction("reset");

/** Reboot the device itself (not the target). It drops off the network briefly. */
export async function restartDevice(): Promise<void> {
  const res = await fetch("/api/v1/system/restart", { method: "POST", headers: CONSOLE_HEADER });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(`restart failed (${res.status})`);
}

/**
 * Point the bootloader at the given OTA slot and restart onto it. The device
 * refuses a slot without a valid image, so this cannot brick it; the caller then
 * waits for it to come back the same way an update does.
 */
export async function switchBootSlot(label: string): Promise<void> {
  const res = await fetch("/api/v1/system/boot-slot", {
    method: "POST",
    headers: { ...CONSOLE_HEADER, "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(await errorFromResponse(res, `switch to ${label} failed (${res.status})`));
}

/** Which TLS certificate the device is serving. `custom` is the operator's own. */
export interface TlsStatus {
  https: boolean;
  custom: boolean;
}

export async function getTlsStatus(): Promise<TlsStatus> {
  const res = await fetch("/api/v1/tls", { cache: "no-store" });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(`tls status failed (${res.status})`);
  return (await res.json()) as TlsStatus;
}

/**
 * Install an operator certificate: one PEM blob, the certificate chain (leaf
 * first) followed by its private key - exactly `cat fullchain.pem privkey.pem`.
 * The device validates it, stores it, and restarts to apply.
 */
export async function installCert(pem: string): Promise<void> {
  const res = await fetch("/api/v1/tls/cert", {
    method: "PUT",
    headers: { ...CONSOLE_HEADER, "Content-Type": "application/x-pem-file" },
    body: pem,
  });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(await errorFromResponse(res, `certificate rejected (${res.status})`));
}

/** Remove the operator certificate and revert to the self-signed one; restarts. */
export async function revertCert(): Promise<void> {
  const res = await fetch("/api/v1/tls/cert", { method: "DELETE", headers: CONSOLE_HEADER });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(await errorFromResponse(res, `revert failed (${res.status})`));
}

/** How an upload ended, once every byte of the image was on the wire. */
export interface UpdateOutcome {
  /**
   * The device answered "written" - the image is in the spare slot and the
   * reboot is armed. When false the socket died after the last byte went out
   * without a reply, which is ambiguous: the write may well have succeeded and
   * the restart simply beaten the response out of the door. The caller decides
   * by watching for the device to come back.
   */
  confirmed: boolean;
}

/**
 * Send a firmware image. The device writes it to the inactive slot and
 * restarts; if the new image never comes up, the bootloader returns to this
 * one, so the failure mode is a reboot rather than a dead device.
 *
 * @param onProgress fraction of the image handed to the socket, 0..1.
 * @param onSent     the last byte is out; from here the device is writing and
 *                   verifying on its own and there is no progress to report,
 *                   only waiting.
 */
export function uploadFirmware(
  file: Blob,
  onProgress?: (fraction: number) => void,
  onSent?: () => void,
): Promise<UpdateOutcome> {
  /* XMLHttpRequest, not fetch, for the upload progress: writing a firmware image
     takes seconds and the operator needs to see it move, not wonder if it hung. */
  return new Promise((resolve, reject) => {
    let sent = false;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/system/update");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-ESP-KVM", "1");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => {
      sent = true;
      onProgress?.(1);
      onSent?.();
    };
    xhr.onload = () => {
      if (xhr.status === 401) return reject(new Unauthorized());
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ confirmed: true });
      reject(rejectFromXhr(xhr, `update failed (${xhr.status})`));
    };
    xhr.onerror = () => {
      /* A drop before the image was fully sent is a plain failure; one after it
         is the device restarting on top of its own reply, so report it as an
         unconfirmed success rather than an error the operator cannot act on. */
      if (sent) return resolve({ confirmed: false });
      reject(new Error("update failed: the connection dropped"));
    };
    xhr.send(file);
  });
}

/**
 * Wait for the device to answer again after a restart.
 *
 * Any HTTP reply counts as back, 401 included: the reboot wiped the sessions
 * that live in RAM, so a refusal is still proof that a server is listening.
 * The first poll is held back a moment - the old firmware answers for about a
 * second after it promises to restart, and taking that for the new one would
 * declare victory before the reboot even started.
 *
 * @returns true if it came back within @p timeoutMs.
 */
/** How long one attempt may sit on a silent socket before it is abandoned. */
const ATTEMPT_MS = 3000;

export async function waitForDevice(
  timeoutMs = 90_000,
  graceMs = 4000,
  onTick?: (elapsedMs: number) => void,
): Promise<boolean> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const started = Date.now();
  const deadline = started + graceMs + timeoutMs;

  /*
   * The clock runs on its own timer, not on the polling loop.
   *
   * A device that is down does not refuse the connection - it says nothing, and
   * the fetch sits there until the browser gives up on it, which can be most of
   * a minute. Counting inside that loop meant the number on screen froze the
   * moment the first request went out, which looks exactly like the console
   * having crashed. Each attempt gets its own deadline for the same reason:
   * one silent socket must not eat the whole wait.
   */
  const tick = onTick ? window.setInterval(() => onTick(Date.now() - started), 250) : 0;
  onTick?.(0);
  try {
    await sleep(graceMs);
    for (;;) {
      const ctrl = new AbortController();
      const giveUp = window.setTimeout(() => ctrl.abort(), ATTEMPT_MS);
      try {
        const res = await fetch("/api/v1/system/info", { cache: "no-store", signal: ctrl.signal });
        if (res.ok || res.status === 401) return true;
      } catch {
        /* still down - that is the expected answer for most of this loop */
      } finally {
        window.clearTimeout(giveUp);
      }
      if (Date.now() >= deadline) return false;
      await sleep(1000);
    }
  } finally {
    if (tick) window.clearInterval(tick);
  }
}

/**
 * Every published release, straight from GitHub.
 *
 * Only the list comes from the browser. The images cannot: the host serving
 * release assets sends no cross-origin header, so a fetch from this page is
 * refused however the URL is reached - including through the API's own asset
 * route, which redirects to that same host. Which is why installing an earlier
 * release is the device's job, and why it is off until someone turns it on.
 */
export interface PublishedRelease {
  version: string;
  published?: string;
  notes?: string;
  /** False when this release carries no image for the board we are talking to. */
  hasImage: boolean;
}

const RELEASES_URL = "https://api.github.com/repos/espkvm/espkvm/releases?per_page=30";
/*
 * GitHub allows 60 unauthenticated API calls an hour, counted per IP - and the
 * IP here is the operator's, since the browser makes this call, so it is shared
 * with every other tab and machine behind the same address. One request per
 * click is not much, but a page reload would spend another, and a list of
 * releases is not worth being fresh to the second. Held for ten minutes.
 */
const RELEASES_CACHE_KEY = "espkvm.releases";
/* Keyed by board: `hasImage` is answered for one board, not in general. */
const releasesCacheKey = (boardId: string | undefined) => `${RELEASES_CACHE_KEY}.${boardId ?? "any"}`;
const RELEASES_CACHE_MS = 10 * 60 * 1000;

/** What the rate-limit headers say, when they say we have run out. */
function rateLimitMessage(res: Response): string | null {
  if (res.status !== 403 && res.status !== 429) return null;
  if (res.headers.get("x-ratelimit-remaining") !== "0") return null;
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const when = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null;
  const at = when
    ? ` It resets at ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
    : "";
  return `GitHub is rate-limiting this network - 60 requests an hour, counted per address, shared with anything else here that talks to it.${at}`;
}

export async function listReleases(boardId: string | undefined): Promise<PublishedRelease[]> {
  try {
    const held = sessionStorage.getItem(releasesCacheKey(boardId));
    if (held) {
      const { at, list } = JSON.parse(held) as { at: number; list: PublishedRelease[] };
      if (Date.now() - at < RELEASES_CACHE_MS) return list;
    }
  } catch {
    /* private window, or something else wrote nonsense there: just ask */
  }
  const res = await fetch(RELEASES_URL);
  if (!res.ok) throw new Error(rateLimitMessage(res) ?? `GitHub answered ${res.status}`);
  const body = (await res.json()) as Array<{
    tag_name?: string;
    published_at?: string;
    html_url?: string;
    prerelease?: boolean;
    draft?: boolean;
    assets?: Array<{ name?: string }>;
  }>;
  const list = body
    .filter((r) => r.tag_name && !r.draft)
    .map((r) => ({
      version: r.tag_name as string,
      published: r.published_at,
      notes: r.html_url,
      /* Named exactly as the release workflow builds it, so an id this device
         reports and a file that exists are the same test. */
      hasImage: boardId
        ? (r.assets ?? []).some((a) => a.name === `espkvm-${r.tag_name}-${boardId}.bin`)
        : true,
    }));
  try {
    sessionStorage.setItem(releasesCacheKey(boardId), JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* nothing to remember it with; the list still works, it just costs a
       request again after a reload */
  }
  return list;
}

export interface InstallStatus {
  state: "idle" | "running" | "done" | "failed";
  percent: number;
  version: string;
  message: string;
}

/** Ask the device to fetch and install a published release. Returns at once. */
export async function installRelease(version: string): Promise<void> {
  const res = await fetch("/api/v1/system/install", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-ESP-KVM": "1" },
    body: JSON.stringify({ version }),
  });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `the device answered ${res.status}`);
  }
}

export async function installStatus(): Promise<InstallStatus> {
  const res = await fetch("/api/v1/system/install", { cache: "no-store" });
  if (res.status === 401) throw new Unauthorized();
  if (!res.ok) throw new Error(`the device answered ${res.status}`);
  return (await res.json()) as InstallStatus;
}

/**
 * A published build, as described by the manifest the project's CI writes.
 *
 * The check happens here, in the browser, and never on the device: a KVM sits
 * in networks that have no way out, and one that quietly talks to the internet
 * is not what belongs there. The browser fetches the image and hands it to the
 * device through the same endpoint as a manual upload.
 */
export interface FirmwareRelease {
  version: string;
  /** Absolute URL of the image, resolved against the manifest. */
  url: string;
  size?: number;
  released?: string;
  /** Where a human can read what changed. */
  notes?: string;
}

export async function fetchRelease(manifestUrl: string): Promise<FirmwareRelease> {
  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`the update manifest returned ${res.status}`);
  const body = (await res.json()) as {
    version?: string;
    file?: string;
    size?: number;
    released?: string;
    notes?: string;
  };
  if (!body.version || !body.file) throw new Error("the update manifest is missing a version");
  return {
    version: body.version,
    url: new URL(body.file, manifestUrl).href,
    size: body.size,
    released: body.released,
    notes: body.notes,
  };
}

/**
 * Compare two release versions, e.g. "v1.2.0" against "v1.10.0".
 *
 * @returns a negative number when @p a is older, 0 when they match, positive
 *          when @p a is newer, and null when either side is not a release at
 *          all - an untagged build reports the commit it came from, and no
 *          ordering between that and a version number is meaningful.
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: string): number[] | null => {
    /* Tags are written v1.2.3, and "v.1.2.3" is common enough to accept. */
    const m = /^v\.?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

/**
 * Fetch the image itself, so it can be handed to the device.
 *
 * Read as a stream rather than a blob so the download has a progress of its
 * own: it is the first of the three waits in an install and, on a slow link,
 * easily the longest. If the server sends no length to measure against, fall
 * back to the plain read and leave the caller with no fraction to show.
 */
export async function downloadFirmware(
  release: FirmwareRelease,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const res = await fetch(release.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`downloading ${release.version} returned ${res.status}`);
  const total = Number(res.headers.get("content-length")) || release.size || 0;
  if (!onProgress || !total || !res.body) return await res.blob();

  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value as BlobPart);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  return new Blob(parts);
}

/* ---- virtual media -------------------------------------------------------
 *
 * Images live on the microSD card; the device serves the selected one to the
 * target over USB. The card is the store, so the browser only lists, uploads
 * and deletes - it never holds an image itself.
 */

export interface StorageImage {
  name: string;
  size: number;
}

/**
 * The built-in rescue image, kept in a flash partition and served over the same
 * USB drive as the card's files. It needs no card and, unlike the card, can be
 * written from here. Selected as the active medium by the reserved name
 * "@rescue".
 */
export interface RescueInfo {
  /** The rescue partition exists on this device (absent on an older table). */
  supported: boolean;
  /** It holds an image, so it can be offered to the target. */
  hasImage: boolean;
  /** Partition size - the largest image it can hold. */
  capacityBytes: number;
}

/** The reserved active-medium name that selects the on-flash rescue image. */
export const RESCUE_MEDIUM = "@rescue";

/** The reserved active-medium name that hands the whole microSD card to the target. */
export const WHOLE_SD_MEDIUM = "@wholesd";

export interface StorageInfo {
  mounted: boolean;
  totalBytes: number;
  freeBytes: number;
  /** File name currently offered to the target, or "" when ejected. */
  active: string;
  images: StorageImage[];
  /** Whether the device can upload/delete; false when the card is read-only. */
  writable: boolean;
  /** Why writing is unavailable, when it is. */
  writeReason?: string;
  /** The whole card is handed to the target read-write; the firmware is off the FS. */
  handedOver?: boolean;
  /** The on-flash rescue image, present on devices whose table has it. */
  rescue?: RescueInfo;
}

export async function loadImages(): Promise<StorageInfo> {
  return getJson<StorageInfo>("/api/v1/storage/images");
}

/**
 * Stream a file to the card. Uses XMLHttpRequest, not fetch, for one reason:
 * an image is measured in gigabytes and the operator needs to see it move.
 * fetch gives no upload progress; XHR does.
 */
export function uploadImage(file: File, onProgress?: (p: UploadProgress) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/v1/storage/upload?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-ESP-KVM", "1");
    trackUpload(xhr, onProgress);
    xhr.onload = () => {
      if (xhr.status === 401) return reject(new Unauthorized());
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(rejectFromXhr(xhr, `upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("upload failed: the connection dropped"));
    xhr.send(file);
  });
}

/**
 * Write an image into the on-flash rescue partition. Same streaming shape as a
 * card upload, but it POSTs the whole body (no name) and the device writes flash
 * directly - which works here where card writes do not. Returns the refreshed
 * storage state the endpoint echoes back.
 */
export function uploadRescue(file: File, onProgress?: (p: UploadProgress) => void): Promise<StorageInfo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/storage/rescue");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-ESP-KVM", "1");
    trackUpload(xhr, onProgress);
    xhr.onload = () => {
      if (xhr.status === 401) return reject(new Unauthorized());
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          return resolve(JSON.parse(xhr.responseText) as StorageInfo);
        } catch {
          return reject(new Error("upload succeeded but the reply was unreadable"));
        }
      }
      reject(rejectFromXhr(xhr, `upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("upload failed: the connection dropped"));
    xhr.send(file);
  });
}

export async function deleteImage(name: string): Promise<StorageInfo> {
  const res = await fetch(`/api/v1/storage/delete?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: CONSOLE_HEADER,
  });
  if (res.status === 401) throw new Unauthorized();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `delete failed (${res.status})`);
  }
  return body as StorageInfo;
}

export function formatBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/** A rough duration as "1h 3m", "2m 40s" or "45s"; "--" when not yet known. */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "--";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Live progress of an upload: fraction done, throughput and a time estimate. */
export interface UploadProgress {
  fraction: number; // 0..1
  loaded: number;
  total: number;
  bytesPerSec: number; // smoothed, 0 until the first sample window closes
  secondsLeft: number; // estimate; Infinity until a rate is known
}

/**
 * Attach a progress handler to an upload that reports not just how far along it
 * is but how fast it is going and how long is left - so a multi-GB card image,
 * which is slow by nature, visibly moves instead of looking hung. The rate is an
 * exponential moving average over ~0.25 s windows, which rides out the bursty
 * way the browser drains its send buffer without lagging real speed changes.
 */
function trackUpload(xhr: XMLHttpRequest, onProgress?: (p: UploadProgress) => void): void {
  if (!onProgress) return;
  let lastT = 0;
  let lastLoaded = 0;
  let rate = 0;
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const now = performance.now();
    if (!lastT) {
      lastT = now;
      lastLoaded = e.loaded;
    } else if (now - lastT >= 250) {
      const inst = ((e.loaded - lastLoaded) * 1000) / (now - lastT);
      rate = rate ? rate * 0.6 + inst * 0.4 : inst;
      lastT = now;
      lastLoaded = e.loaded;
    }
    onProgress({
      fraction: e.total ? e.loaded / e.total : 0,
      loaded: e.loaded,
      total: e.total,
      bytesPerSec: rate,
      secondsLeft: rate > 0 ? (e.total - e.loaded) / rate : Infinity,
    });
  };
}

/** Resolve an enum setting to its name, e.g. mouse_mode -> "absolute". */
export function enumName(schema: Setting[], values: Values, key: string): string | null {
  const entry = schema.find((s) => s.key === key);
  if (!entry?.choices) return null;
  const index = Number(values[key]);
  return entry.choices[index] ?? null;
}

/** Index for an enum setting's name, for writing it back. */
export function enumIndex(schema: Setting[], key: string, name: string): number | null {
  const entry = schema.find((s) => s.key === key);
  if (!entry?.choices) return null;
  const i = entry.choices.indexOf(name);
  return i < 0 ? null : i;
}

/**
 * Why a setting cannot be changed right now, or null when it can.
 * The device's own wording is used so the interface never invents a reason.
 */
export function settingBlockedReason(
  setting: Setting,
  caps: Record<string, Capability>,
): string | null {
  if (!setting.requires) return null;
  const cap = caps[setting.requires];
  if (!cap) return null;
  if (!cap.compiled) return cap.reason ?? "not built into this firmware";
  if (!cap.available) return cap.reason ?? "not available on this hardware";
  return null;
}

export const SECTION_TITLES: Record<string, string> = {
  video: "Video",
  input: "Input",
  storage: "Virtual media",
  power: "Power",
  network: "Network",
  vpn: "VPN",
  mqtt: "MQTT / Home Assistant",
  security: "Security",
  display: "Display",
  system: "System",
  pins: "Pins",
};

export const SECTION_ORDER = [
  "video",
  "input",
  "storage",
  "power",
  "network",
  "vpn",
  "mqtt",
  "security",
  "display",
  "system",
];

<script setup lang="ts">
/*
 * The console shell: a status strip that never lies about what the device is
 * doing, a rail of panels that slide over the picture rather than displacing
 * it, and the target's screen filling everything else.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import Icon from "./components/Icon.vue";
import InputPanel from "./components/InputPanel.vue";
import LoginView from "./components/LoginView.vue";
import RestartOverlay from "./components/RestartOverlay.vue";
import { installNoPagePull } from "./input/noPagePull";
import { installPagePin } from "./input/keepPagePinned";
import { installKeyboardInset } from "./input/keyboardInset";
import { ScreenTextStream } from "./screen/textStream";
import { runRestart, takeRestart } from "./state/restart";
import ScreenView from "./components/ScreenView.vue";
import DiagWidget from "./components/DiagWidget.vue";
import OsWidget from "./components/OsWidget.vue";
import MediaPanel from "./components/MediaPanel.vue";
import PowerWidget from "./components/PowerWidget.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import VideoWidget from "./components/VideoWidget.vue";
import ToastHost from "./components/ToastHost.vue";
import TouchControls from "./components/TouchControls.vue";
import UpdateWidget from "./components/UpdateWidget.vue";
import { useInput } from "./input/useInput";
import { useTouch } from "./input/useTouch";
import { DEFAULT_LAYOUT } from "./layouts";
import {
  type Capability,
  type Setting,
  type Values,
  type SystemInfo,
  type VideoStatus,
  type ScreenText,
  enumName,
  enumIndex,
  settingBlockedReason,
  loadCapabilities,
  loadSchema,
  loadSystemInfo,
  loadUsbProbe,
  loadValues,
  loadVideoStatus,
  loadScreenText,
  loadImages,
  type StorageInfo,
  saveSettings,
  restartDevice,
  type UsbProbe,
  Unauthorized,
} from "./state/device";
import { loadSession, type SessionState } from "./state/auth";
import { toast } from "./state/toasts";

type PanelId = "input" | "media" | "settings" | null;

const PANEL_TITLES: Record<string, string> = {
  input: "Input",
  media: "Virtual media",
  settings: "Settings",
};

const schema = ref<Setting[]>([]);
const values = ref<Values>({});
const caps = ref<Record<string, Capability>>({});
const status = ref<VideoStatus | null>(null);
const system = ref<SystemInfo | null>(null);
/* Set once the running firmware version stops matching the one this page loaded
   with - i.e. the device was updated (OTA) under an open tab or installed PWA.
   The page then offers a reload so a stale console can never drive new firmware. */
const firmwareChanged = ref(false);
const usbProbe = ref<UsbProbe | null>(null);
const storage = ref<StorageInfo | null>(null);

/* Wake-on-LAN: the target MAC is a setting; the button lives in PowerWidget. */
const wolMac = computed(() => String(values.value.pwr_wol_mac ?? "").trim());
const ready = ref(false);
const loadError = ref<string | null>(null);
const session = ref<SessionState | null>(null);
/* Nothing is loaded until the device says who is asking. */
const locked = computed(
  () => session.value !== null && session.value.required && !session.value.authenticated,
);
const mustChange = computed(() => Boolean(session.value?.mustChange));

const panel = ref<PanelId>(null);
/* Why there is no video at all, in the device's own words - a capture board
   that never answered, or a pipeline that could not start. Different from "no
   signal", which means the board is there and the target is quiet. */
const videoBlocked = computed(() =>
  caps.value.video && !caps.value.video.available
    ? (caps.value.video.reason ?? "The capture path did not start.")
    : null,
);
/* How the picture is sized. "fit" shrinks a picture too big for the stage and
   leaves a smaller one alone; "stretch" fills the stage either way; "actual" is
   one screen pixel per browser pixel. */
const fit = ref<"fit" | "stretch" | "actual">("fit");
const engaged = ref(false);

/*
 * Reading the screen as text.
 *
 * The device can only do this while the target is in a character mode - a BIOS,
 * a boot loader, a console - so the buttons key off the resolution the video
 * status already reports, and no extra polling is needed to know whether to
 * offer them. The text itself is fetched when it is wanted.
 *
 * Selecting and controlling are mutually exclusive on purpose: the same drag
 * cannot both move the target's pointer and sweep a selection, and silently
 * stealing the mouse from the target would be the worse surprise of the two.
 */
const screenText = ref<ScreenText | null>(null);
const selectingText = ref(false);
let screenTextPollId = 0;
let screenTextPollEvery = 0;
let textStream: ScreenTextStream | null = null;
/* Whether readings can be pushed to us. False after the socket has refused. */
let textStreamPushes = true;

/*
 * The device decides, because the device is the one that can read the screen.
 *
 * This used to work out the answer here, from the resolution, and it went stale
 * the moment the scanner grew: it recognised 80 columns of 8x16 and nothing
 * else, so a 1024x768 UEFI console - 128 columns of 8x19, which the device reads
 * at 99% - arrived with Select and Copy greyed out. Firmware without the field
 * says nothing, and nothing means no.
 */
const textModeLikely = computed(() => status.value?.textMode === true);

/*
 * Two ways a text screen stops being one, and both have to hand the picture
 * back by themselves - a mode nobody can read, shown with the video stopped, is
 * a black rectangle and a puzzle.
 *
 * The mode changing is watched below (textModeLikely). The other way is the
 * machine staying at the same resolution and simply drawing something that is
 * not characters - a desktop, a graphical installer - which shows up only as
 * "no text on file". Twice in a row, because one miss can be a screen caught
 * mid-repaint.
 */
const TEXT_MISSES_BEFORE_GIVING_UP = 2;
let textMisses = 0;

/* One reading, however it arrived: pushed over the socket or fetched. */
function applyScreenText(text: ScreenText | null) {
  screenText.value = text;
  if (text) {
    textMisses = 0;
  } else if (textView.value && ++textMisses >= TEXT_MISSES_BEFORE_GIVING_UP) {
    leaveTextView();
    toast.info("The screen is a picture again - back to video");
  }
}

async function refreshScreenText(): Promise<ScreenText | null> {
  try {
    applyScreenText(await loadScreenText());
  } catch {
    applyScreenText(null);
  }
  return screenText.value;
}

async function copyScreenText() {
  const t = await refreshScreenText();
  if (!t) {
    toast.info("Nothing to copy: this screen is not made of text");
    return;
  }
  if (await copyToClipboard(t.text)) {
    toast.info(`Copied ${t.rows} lines from the screen`);
  } else {
    toast.error("The browser would not give this page the clipboard");
  }
}

/*
 * The clipboard, with the old way kept as the fallback.
 *
 * navigator.clipboard does not exist outside a secure context, and the console
 * is served over plain HTTP in hotspot mode - which is exactly the situation
 * where someone is reading a serial number off a BIOS screen and wants to paste
 * it somewhere. The textarea trick still works there.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through and try the old way */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/*
 * A key pressed in text mode is somebody walking a menu, and the menu answers
 * at once - so waiting up to a poll for the highlight to catch up makes the
 * whole mode feel like it is not listening. Ask for a fresh reading right after
 * the key instead, with a short wait for the target to repaint.
 */
let textNudgeId = 0;

function nudgeScreenText() {
  if (!textView.value && !selectingText.value) return;
  window.clearTimeout(textNudgeId);
  textNudgeId = window.setTimeout(() => void refreshScreenText(), 120);
}

/*
 * Both ways of using the text - selecting it and reading it instead of the
 * picture - want it kept current.
 *
 * The device pushes readings over the video socket as it makes them, which is
 * what makes a menu answer a keypress: no request per reading, and no waiting
 * for the next tick of a poll. Polling is what happens when that socket will
 * not open - an older firmware, or a browser that cannot have it - and then the
 * mode being read instead of the picture polls faster than the layer over it.
 */
function stopScreenTextPoll() {
  if (!screenTextPollId) return;
  window.clearInterval(screenTextPollId);
  screenTextPollId = 0;
  window.removeEventListener("keydown", nudgeScreenText, true);
}

function keepScreenTextFresh() {
  const wanted = selectingText.value || textView.value;
  if (!wanted) {
    stopScreenTextPoll();
    textStream?.stop();
    textStream = null;
    /* A socket that failed while the last screen was up says nothing about the
       next one - a device that restarted, say. Give it another chance. */
    textStreamPushes = true;
    return;
  }

  if (textStreamPushes) {
    stopScreenTextPoll();
    if (!textStream) {
      textStream = new ScreenTextStream({
        onText: (text) => applyScreenText(text),
        onGone: () => applyScreenText(null),
        onUnavailable: () => {
          textStream?.stop();
          textStream = null;
          textStreamPushes = false;
          keepScreenTextFresh();
        },
      });
    }
    return;
  }

  const every = textView.value ? 700 : 2000;
  if (screenTextPollId && every !== screenTextPollEvery) {
    stopScreenTextPoll();
  }
  if (!screenTextPollId) {
    screenTextPollEvery = every;
    screenTextPollId = window.setInterval(() => void refreshScreenText(), every);
    window.addEventListener("keydown", nudgeScreenText, true);
  }
}

async function toggleSelectText() {
  if (selectingText.value) {
    selectingText.value = false;
    keepScreenTextFresh();
    return;
  }
  if (!(await refreshScreenText())) {
    toast.info("Nothing to select: this screen is not made of text");
    return;
  }
  /* Control goes back to the operator's mouse for as long as this lasts. */
  engaged.value = false;
  selectingText.value = true;
  keepScreenTextFresh();
}

/*
 * Text mode: the screen as characters, instead of the picture.
 *
 * A screen is two kilobytes of text and a picture is megabits a second, so this
 * is what makes a machine workable over a phone tether or a link that will not
 * carry video - and the keyboard still goes to the target, which is most of what
 * a BIOS needs. It is an extra way to look, never the default: it pauses the
 * stream while it is on and gives the picture straight back when it is off.
 */
const textView = ref(false);
/* Whether the stream was already stopped when text mode began. Turning it off
   must give back the state the operator left, not the state text mode wanted:
   somebody who had paused the picture on purpose should not find it running. */
let pausedBeforeText = false;

/*
 * The setting behind it: "characters whenever this screen is made of them".
 *
 * A tick rather than a third mode, because it is a standing preference, not a
 * place to be. The operator says once that a BIOS should arrive as text, and
 * the view follows the target through a boot: characters at the boot menu,
 * picture the moment the desktop paints, characters again at the next reboot.
 * Remembered per browser like the pinned panel - it is how this operator likes
 * to work, not something about the device.
 */
const PREFER_TEXT_KEY = "espkvm:prefer-text";
const textPreferred = ref(false);
try {
  textPreferred.value = localStorage.getItem(PREFER_TEXT_KEY) === "1";
} catch {
  /* private window: it simply starts off every time */
}

function leaveTextView() {
  if (!textView.value) return;
  textView.value = false;
  paused.value = pausedBeforeText;
  keepScreenTextFresh();
  watchForTextAgain();
}

/**
 * Show the characters, if there are any.
 *
 * @param auto true when the view decided by itself rather than being asked. An
 *   automatic switch stays out of the way of a deliberate pause and says
 *   nothing when the screen turns out not to be text - that is the normal
 *   answer on a desktop, not a thing worth a toast every few seconds.
 */
async function enterTextView(auto = false): Promise<boolean> {
  if (textView.value) return true;
  if (auto && paused.value) return false;
  if (!(await refreshScreenText())) {
    if (!auto) toast.info("Nothing to show: this screen is not made of text");
    return false;
  }
  textMisses = 0;
  textView.value = true;
  /* The saving is the whole point: no video while the text is being read. The
     encoder only ever starts again when a reading fails. */
  pausedBeforeText = paused.value;
  paused.value = true;
  keepScreenTextFresh();
  watchForTextAgain();
  return true;
}

watch(textPreferred, (on) => {
  try {
    localStorage.setItem(PREFER_TEXT_KEY, on ? "1" : "0");
  } catch {
    /* nothing to remember it with */
  }
  if (on) void enterTextView();
  else leaveTextView();
  watchForTextAgain();
});

/*
 * Coming back to text once the picture has taken over.
 *
 * Leaving is already hysteretic - TEXT_MISSES_BEFORE_GIVING_UP readings in a row
 * must come back empty - and the return has to match it, or the view would flip
 * on every screen that sits near the scanner's 90% accept threshold: a boot
 * splash, a menu drawing a progress bar, a console mid-repaint. Flipping the
 * VIEW is far more jarring than flipping a transport, so it is worth being slow
 * about. Two readings three seconds apart means about six seconds of agreement
 * before the picture gives way, and the same before it comes back.
 *
 * Asking costs the device very little on a screen that is holding still: the
 * scanner reads one settled picture once (`s_done`) and a repeat ask is then
 * served from what is already on file. A screen that keeps changing pays the
 * cheap probe - 48 sample cells - which is what rules a desktop out before the
 * full pass.
 */
const TEXT_RETRY_MS = 3000;
const TEXT_RETRY_MAX_MS = 30000;
const TEXT_HITS_BEFORE_RETURNING = 2;
let textHits = 0;
let textRetryId = 0;
let textRetryEvery = TEXT_RETRY_MS;

/*
 * Backed off, because asking is not free the way the reading is.
 *
 * `/api/v1/screen/text` waits up to 1.2 s for the first reading of a wide mode
 * the device was not scanning before, and it holds one of seven HTTPS sockets
 * while it waits. A desktop left at 1080p would otherwise answer "not text"
 * every three seconds for hours, for nothing. So the gap grows while the answer
 * keeps being no and snaps back to three seconds the moment it is yes - which is
 * the case worth being quick about, since a machine that has just dropped to a
 * console is about to be read.
 */
function watchForTextAgain() {
  const wanted = textPreferred.value && !textView.value && !selectingText.value;
  if (textRetryId) {
    window.clearTimeout(textRetryId);
    textRetryId = 0;
  }
  if (!wanted) {
    textHits = 0;
    textRetryEvery = TEXT_RETRY_MS;
    return;
  }
  textRetryId = window.setTimeout(() => {
    textRetryId = 0;
    void (async () => {
      /* The resolution alone can rule it out, and that check costs nothing -
         it is already in the status this page polls anyway. */
      if (textModeLikely.value && !paused.value && (await refreshScreenText())) {
        textRetryEvery = TEXT_RETRY_MS;
        if (++textHits >= TEXT_HITS_BEFORE_RETURNING) {
          textHits = 0;
          if (await enterTextView(true)) return;
        }
      } else {
        textHits = 0;
        textRetryEvery = Math.min(textRetryEvery * 2, TEXT_RETRY_MAX_MS);
      }
      watchForTextAgain();
    })();
  }, textRetryEvery);
}

/* The target left text behind - booted, or changed mode. The layer would then
   be characters from a screen that is gone, laid over a picture. The preference
   is untouched: the picture is what this screen is, not what the operator asked
   for, and the next text screen brings the characters back. */
watch(textModeLikely, (still) => {
  if (!still && selectingText.value) void toggleSelectText();
  if (!still && textView.value) leaveTextView();
  if (still) {
    /* A mode change is news, so it earns a fresh look rather than whatever the
       back-off had grown to while the last screen was a picture. */
    textRetryEvery = TEXT_RETRY_MS;
    watchForTextAgain();
  }
});
const paused = ref(false);
/* Set while a firmware image is being handed to the device: the stream gives up
   its socket and the device's attention until the update is done. Kept apart
   from `paused` so it neither flips the pause button nor survives the update. */
const updateHoldsStream = ref(false);
/* Which connection pill has its detail popover open (tap to toggle). Touch has
   no hover, so the pill title is shown on tap instead. */
const connDetail = ref<string | null>(null);
const theme = ref<"dark" | "light">("dark");
const surface = ref<HTMLElement | null>(null);

const engageMode = computed(
  () => (enumName(schema.value, values.value, "ptr_engage") as "click" | "hover") ?? "click",
);
const pointerMode = computed(
  () =>
    (enumName(schema.value, values.value, "mouse_mode") as "absolute" | "relative") ??
    "absolute",
);
const invertScroll = computed(() => Boolean(values.value.scroll_inv));
/* Which side the rail and its panels sit on, from the ui_side setting. */
const uiRight = computed(() => enumName(schema.value, values.value, "ui_side") === "right");

/*
 * Touch mode: on a phone or tablet the desktop pointer mapping is unusable, so
 * the screen becomes a trackpad instead (see useTouch). Auto-detected from a
 * coarse pointer, but also a manual toggle - a laptop with a touchscreen can
 * want either. The keyboard uses the target's own layout, like paste does.
 */
const touchMode = ref(false);
/* Touch trackpad speed, driven by the same "Relative sensitivity" slider as the
   desktop relative pointer. A finger crosses a small phone screen but has to
   move the cursor across a large target, so 100% maps to a healthy 4x base (the
   old fixed 1.6 felt glued down); the slider's 10-400% then tunes it from
   precise to very fast. Acceleration in useTouch adds more on quick flicks. */
const touchSensitivity = computed(() => (Number(values.value.mouse_sens ?? 100) / 100) * 4);
const layout = computed(() => enumName(schema.value, values.value, "kbd_layout") ?? DEFAULT_LAYOUT);

const input = useInput({
  engaged,
  engageMode,
  pointerMode,
  invertScroll,
  surface,
  fit,
  touchActive: touchMode,
  onDisengage: () => (engaged.value = false),
});

useTouch({
  surface,
  control: input.control,
  active: touchMode,
  invertScroll,
  sensitivity: touchSensitivity,
});

/* Another browser is driving this target. Input from here is ignored until the
   operator takes control, so say so instead of leaving a dead pointer. */
const heldByOther = computed(() => input.controlState.value === "held");
/* Losing control while engaged would strand a captured keyboard doing nothing. */
watch(heldByOther, (held) => {
  if (held) engaged.value = false;
});
/*
 * The same for a session that ends under a captured keyboard. The login screen
 * replaces the console, but useInput lives up here and its window listeners do
 * not go with it: every keystroke would still be swallowed and sent to the
 * target, so the password cannot be typed into the form that just appeared.
 * Esc would have released it, which is no way to find out.
 */
watch([locked, mustChange], ([lock, change]) => {
  if (lock || change) engaged.value = false;
});
function takeControl() {
  input.control.takeControl();
}

/* What is actually being encoded, not what was asked for: an encoder that
   fails to start falls back, and the status bar should show the truth. */
const codec = computed(
  () => status.value?.codec || enumName(schema.value, values.value, "vid_codec") || "-",
);
const online = computed(() => status.value !== null);

/*
 * H.264 is not on every board, and the device says so rather than the console
 * guessing: the same reason the settings form gives, in the same words.
 */
const h264Blocked = computed(() => {
  const setting = schema.value.find((entry) => entry.key === "vid_codec");
  if (!setting) return "this firmware does not offer a codec choice";
  const blocked = settingBlockedReason(setting, caps.value);
  if (blocked) return blocked;
  return setting.choices?.includes("h264") ? null : "this board has no H.264 encoder";
});

/*
 * Choosing a codec from the status bar writes the same setting the form does.
 * Text mode is turned off on the way: it hides the picture, so leaving it on
 * would make the choice look like it did nothing.
 */
async function setCodec(name: "mjpeg" | "h264") {
  const index = enumIndex(schema.value, "vid_codec", name);
  if (index === null) return;
  /*
   * Picking a codec no longer leaves the text view: the tick is a standing
   * preference and the codec is what the picture is made of when there is a
   * picture to show. They are answers to different questions, so choosing one
   * says nothing about the other.
   */
  try {
    values.value = await saveSettings({ vid_codec: index });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "the device would not take that codec");
  }
}

/* Connection state for the footer icons: what is plugged in and live. "on" is
   lit, "idle" is present-but-inactive (HDMI cable up, no picture), "off" is
   nothing. */
type Conn = {
  id: "hdmi" | "usb" | "sd" | "ethernet" | "wifi" | "ap" | "vpn" | "mqtt";
  title: string;
  state: "on" | "idle" | "off";
};

/* The network pill reflects the active link (Ethernet / WiFi station / hotspot),
   so its icon and label follow system.net.mode. */
function netPill(): Conn {
  const net = system.value?.net;
  const mode = net?.mode ?? "ethernet";
  if (mode === "wifi") {
    const rssi = net?.rssi ? ` (${net.rssi} dBm)` : "";
    return {
      id: "wifi",
      title: net?.wifiUp
        ? `WiFi - ${net?.ssid || "connected"}${rssi}`
        : "WiFi - connecting",
      state: net?.wifiUp ? "on" : "idle",
    };
  }
  if (mode === "ap") {
    const n = net?.apClients ?? 0;
    return {
      id: "ap",
      title: `Hotspot ${net?.ssid ?? ""} - ${n} client${n === 1 ? "" : "s"}`,
      state: "on",
    };
  }
  return {
    id: "ethernet",
    title: net?.up
      ? `Ethernet - link up${net?.mbps ? ` (${net.mbps} Mbps)` : ""}`
      : "Ethernet - link down",
    state: net?.up ? "on" : "off",
  };
}

/* Switch the active link. net_mode is reboot-flagged, so this saves it and
   restarts; the device may come back on a different address. */
async function switchNet(mode: "ethernet" | "wifi" | "ap") {
  connDetail.value = null;
  if (mode === system.value?.net?.mode) return;
  if (
    !confirm(
      `Switch the connection to ${mode === "ap" ? "hotspot" : mode}? The device restarts and may change address.`,
    )
  )
    return;
  try {
    await saveSettings({ net_mode: { ethernet: 0, wifi: 1, ap: 2 }[mode] });
    const label = mode === "ap" ? "Switching to the hotspot" : `Switching to ${mode}`;
    if (await runRestart(label, restartDevice, { kind: "network" })) {
      location.reload();
    }
  } catch {
    toast.error("Could not switch the network");
  }
}

/* The network pill's popup is the whole network panel rather than a plain
   tooltip: how the device is connected, and every address it can be reached on. */
const isNetPill = computed(() =>
  ["ethernet", "wifi", "ap"].includes(connDetail.value ?? ""),
);

/*
 * Every address worth knowing, in the order someone reaches for them: the name
 * first, because it is the one thing that survives a new lease; then IPv4; then
 * the IPv6 addresses the router handed out, most routable first.
 *
 * Each row says what the address is good for, because that decides whether it is
 * worth writing down. A global IPv6 address reaches the device from anywhere but
 * changes when the ISP rotates the prefix; a unique-local one only works inside
 * the site but survives that; a link-local one needs an interface suffix no
 * browser will supply, so it is shown and nothing more. The MAC is last: nobody
 * connects to it, but it is what a DHCP reservation is keyed on.
 */
type Addr = { label: string; value: string; note: string; url: string | null };

/* Built from the page's own scheme and port, so a link lands on the port that is
   actually answering rather than an assumed 443. */
function addrUrl(host: string): string {
  return `${location.protocol}//${host}${location.port ? `:${location.port}` : ""}/`;
}

const netAddrs = computed<Addr[]>(() => {
  const net = system.value?.net;
  const rows: Addr[] = [];
  if (net?.hostname) {
    rows.push({
      label: "Name",
      value: `${net.hostname}.local`,
      note: "on this network",
      url: addrUrl(`${net.hostname}.local`),
    });
  }
  if (net?.ip4) {
    rows.push({ label: "IPv4", value: net.ip4, note: "", url: addrUrl(net.ip4) });
  }
  for (const addr of net?.ipv6 ?? []) {
    const a = addr.toLowerCase();
    const linkLocal = a.startsWith("fe80:");
    /* fc00::/7 - the two prefixes that carry unique-local addresses. */
    const uniqueLocal = a.startsWith("fc") || a.startsWith("fd");
    rows.push({
      label: "IPv6",
      value: addr,
      note: linkLocal ? "link-local" : uniqueLocal ? "this site only" : "global",
      url: linkLocal ? null : addrUrl(`[${addr}]`),
    });
  }
  if (net?.mac) {
    rows.push({ label: "MAC", value: net.mac, note: "for a DHCP reservation", url: null });
  }
  return rows;
});

/* An IPv6 address is too long to retype and too long to read back over a phone
   call, so copying it is the only realistic way to use one. */
async function copyAddr(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.info("Copied");
  } catch {
    /* The clipboard API is only available in a secure context, so this is what
       an operator on plain HTTP meets. */
    toast.error("Could not copy - select and copy it manually");
  }
}

const conns = computed<Conn[]>(() => {
  const list: Conn[] = [
    {
      id: "hdmi",
      title: online.value
        ? status.value?.signal
          ? `HDMI in - ${status.value.width}x${status.value.height}`
          : "HDMI in - no signal"
        : "HDMI in",
      state: online.value ? (status.value?.signal ? "on" : "idle") : "off",
    },
    {
      id: "usb",
      title: !input.target.value.known
        ? "USB - control channel down"
        : input.target.value.attached
          ? "USB - the target sees the keyboard and mouse"
          : "USB - no target on the OTG port",
      state: input.target.value.attached ? "on" : "off",
    },
    {
      id: "sd",
      title: storage.value?.mounted ? "microSD card inserted" : "no microSD card",
      state: storage.value?.mounted ? "on" : "off",
    },
    netPill(),
  ];
  /* One VPN pill, for whichever backend is active (they are mutually exclusive).
     Shown only when a VPN is on - a persistent grey icon would be noise. */
  const w = system.value?.wg;
  const t = system.value?.ts;
  if (w?.enabled) {
    const where = w.address ? ` - ${w.address}` : "";
    list.push({
      id: "vpn",
      title: w.up ? `WireGuard${where}` : "WireGuard - connecting to the peer",
      state: w.up ? "on" : "idle",
    });
  } else if (t?.enabled) {
    const where = t.address ? ` - ${t.address}` : "";
    const peers = t.peers ? ` (${t.peers} peer${t.peers === 1 ? "" : "s"})` : "";
    list.push({
      id: "vpn",
      title: t.up ? `Tailscale${where}${peers}` : "Tailscale - joining the tailnet",
      state: t.up ? "on" : "idle",
    });
  }
  /* Shown only when MQTT is turned on - a persistent grey icon would be noise
     for the majority who do not use Home Assistant. */
  const m = system.value?.mqtt;
  if (m?.enabled) {
    list.push({
      id: "mqtt",
      title: m.connected ? "MQTT - connected to the broker" : "MQTT - connecting to the broker",
      state: m.connected ? "on" : "idle",
    });
  }
  return list;
});

let pollId = 0;
let systemPollId = 0;

/*
 * What became of the restart the console asked for before it reloaded.
 *
 * The reboot ends the session, so this runs on the far side of the sign-in
 * page and the note is the only thing that survived. It matters most when it
 * went wrong: an update that rolled back leaves the device running perfectly,
 * on the old firmware, and looks exactly like one that worked (issue #22).
 */
const restartOutcome = ref<{ bad: boolean; text: string } | null>(null);

function reportRestart(version: string) {
  const note = takeRestart();
  if (!note) return;
  if (note.kind === "update" || note.kind === "slot") {
    if (note.to && version && note.to !== version) {
      restartOutcome.value = {
        bad: true,
        text: `The device came back on ${version}, not ${note.to}. The new image did not start, so it went back to the one that works.`,
      };
      return;
    }
    restartOutcome.value = { bad: false, text: `The device is running ${version}.` };
    return;
  }
  restartOutcome.value = { bad: false, text: "The device restarted and is back." };
}

function reloadConsole() {
  /* "/" is served no-cache with a version ETag and the service worker is
     network-first for navigations, so a plain reload fetches the current
     console. */
  window.location.reload();
}

async function startConsole() {
  let bootVersion: string | undefined;
  try {
    const [s, v, c, sys] = await Promise.all([
      loadSchema(),
      loadValues(),
      loadCapabilities(),
      loadSystemInfo(),
    ]);
    schema.value = s;
    values.value = v;
    caps.value = c;
    system.value = sys;
    bootVersion = sys.version;
    reportRestart(sys.version);
    ready.value = true;
    /* The preference is remembered, so a page opened on a BIOS should arrive as
       characters rather than after the first six seconds of the retry rhythm. */
    if (textPreferred.value) {
      void enterTextView(true);
    }
    watchForTextAgain();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }

  /* Telemetry is polled rather than pushed: one small request a second, and it
     keeps working when the control socket is down - exactly when the operator
     most wants to know what the device thinks. */
  let reachable = true;
  /* Backs off while the device is unreachable. A console that keeps asking
     once a second is not free: several tabs left open on a device that is
     rebooting, or refusing a certificate, turn into a load that makes it
     harder to reach - which is exactly the wrong direction. */
  let interval = 1000;
  const tick = async () => {
    try {
      const s = await loadVideoStatus();
      if (!reachable) {
        reachable = true;
        toast.info("Device is back");
      }
      interval = 1000;
      status.value = s;
    } catch (err) {
      if (err instanceof Unauthorized) {
        /* Not a network problem: the device is answering, it just does not
           know us any more. Stop polling and let the sign-in form take over -
           reporting "lost contact" here would send the operator looking for a
           fault that is not there. */
        clearInterval(systemPollId);
        status.value = null;
        session.value = await loadSession().catch(() => session.value);
        return;
      }
      status.value = null;
      interval = Math.min(interval * 2, 15000);
      /* Say it once. A console that silently freezes on the last frame is how
         an operator ends up typing into a machine that is not listening. */
      if (reachable) {
        reachable = false;
        toast.error("Lost contact with the device");
      }
    }
    pollId = window.setTimeout(tick, interval);
  };
  void tick();

  if (DEMO) {
    clearInterval(demoAskId);
    demoAskId = window.setInterval(() => {
      const ask = (window as unknown as { __espkvmDemoAsk?: () => "media" | "select" | null })
        .__espkvmDemoAsk;
      demoAsk.value = ask ? ask() : null;
    }, 700);
  }

  /* System figures change slowly - temperature, uptime, free memory - but they
     do change, and a page left open for an hour showing the values it loaded
     with is worse than showing none. */
  clearInterval(systemPollId);
  systemPollId = window.setInterval(async () => {
    try {
      system.value = await loadSystemInfo();
      /* Firmware updated under us? The embedded console is now out of date. */
      if (bootVersion && system.value.version && system.value.version !== bootVersion) {
        firmwareChanged.value = true;
      }
      usbProbe.value = await loadUsbProbe();
      storage.value = await loadImages();
    } catch {
      /* The video poll reports loss of contact, and handles being signed out. */
    }
  }, 10000);

  usbProbe.value = await loadUsbProbe().catch(() => null);
  storage.value = await loadImages().catch(() => null);

  window.addEventListener("keydown", onGlobalKey);
}

onMounted(async () => {
  installNoPagePull();
  installPagePin();
  installKeyboardInset();
  document.documentElement.dataset.theme = theme.value;
  /* Start in touch mode on a device whose primary pointer is a finger. */
  if (window.matchMedia?.("(pointer: coarse)").matches) touchMode.value = true;
  try {
    session.value = await loadSession();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
    return;
  }
  if (!locked.value && !mustChange.value) {
    await startConsole();
  }
});

/* Signing in, or changing the password, both end with asking the device again
   rather than assuming what happened. If that question fails, say so: the
   sign-in has already worked, and leaving the login form up with no error is
   what makes an operator reload the page to get anywhere. */
async function onAuthenticated() {
  try {
    session.value = await loadSession();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
    return;
  }
  if (!locked.value && !mustChange.value) await startConsole();
}

async function onPasswordChanged() {
  toast.info("Password changed - sign in again");
  panel.value = null;
  try {
    session.value = await loadSession();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
}

onUnmounted(() => {
  clearTimeout(pollId);
  clearInterval(systemPollId);
  clearInterval(screenTextPollId);
  clearTimeout(textRetryId);
  textStream?.stop();
  clearTimeout(textNudgeId);
  window.removeEventListener("keydown", nudgeScreenText, true);
  clearInterval(demoAskId);
  clearTimeout(engageNudgeId);
  window.removeEventListener("keydown", onGlobalKey);
});

function onGlobalKey(e: KeyboardEvent) {
  if (engaged.value) return;
  // Don't hijack the key while the user is typing in a field (e.g. the login
  // password) or when a modifier is held - Cmd/Ctrl+F belongs to the browser.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === "f" || e.key === "F") void toggleFullscreen();
}

function reload() {
  location.reload();
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme.value;
}

function togglePanel(id: Exclude<PanelId, null>) {
  panel.value = panel.value === id ? null : id;
}

function onEngage(e: PointerEvent) {
  engaged.value = true;
  input.engageFromPointer(e);
}

/* Clicking the picture does not take control - the first click would land on
   the target before you had it - so the invitation is a button. People click the
   picture anyway and nothing happens, which reads as broken; wave the button at
   them instead. */
/*
 * A pinned panel takes its space from the picture instead of covering it. Off by
 * default, because a picture that resizes whenever a panel opens makes you find
 * everything again; on a wide screen there is room for both, and then covering
 * the target is the worse of the two. Remembered per browser - it depends on the
 * window, not on the device - and ignored on a phone, where the panel is the
 * whole width and there would be nothing left to pin it beside.
 */
const PIN_KEY = "espkvm:panel-pinned";
const panelPinned = ref(false);
try {
  panelPinned.value = localStorage.getItem(PIN_KEY) === "1";
} catch {
  /* private window: it simply starts unpinned every time */
}
watch(panelPinned, (on) => {
  try {
    localStorage.setItem(PIN_KEY, on ? "1" : "0");
  } catch {
    /* nothing to remember it with */
  }
});

const engageNudge = ref(false);
let engageNudgeId = 0;

function nudgeEngage(e: PointerEvent) {
  if (engaged.value || (paused.value && !textView.value) || touchMode.value) return;
  if (heldByOther.value) return;
  if (selectingText.value) return;
  const t = e.target as HTMLElement | null;
  /* Only the picture: not the panels, and not the invitation itself. */
  if (t?.closest(".panel, .screen-engage, .screen-notice, .touch-controls")) return;
  clearTimeout(engageNudgeId);
  /* Off and on again so a second click restarts the animation. Through nextTick
     rather than a frame: a browser that is not painting this tab would hold a
     frame callback forever, and the click still deserves an answer. */
  engageNudge.value = false;
  void nextTick(() => {
    engageNudge.value = true;
    engageNudgeId = window.setTimeout(() => (engageNudge.value = false), 900);
  });
}

/* Demo build only: the fake machine says which control it is waiting for, and
   that control glows until it is used. Knowing where "Media" lives is obvious
   to us and to nobody arriving from a link. Tree-shaken out of the firmware. */
const DEMO = import.meta.env.MODE === "demo";
const demoAsk = ref<"media" | "select" | null>(null);
let demoAskId = 0;
const askingMedia = computed(() => DEMO && demoAsk.value === "media" && panel.value !== "media");
const askingSelect = computed(
  () => DEMO && demoAsk.value === "select" && !selectingText.value && textModeLikely.value,
);

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* denied by the browser; nothing useful to say */
  }
}

const LED_BITS: Array<[number, string]> = [
  [0x01, "Num"],
  [0x02, "Caps"],
  [0x04, "Scroll"],
];
</script>

<template>
  <div v-if="loadError" class="fatal">
    <h2>Cannot reach the device</h2>
    <p class="muted">{{ loadError }}</p>
    <button type="button" class="btn btn-primary" @click="reload">Retry</button>
  </div>

  <LoginView
    v-else-if="locked || mustChange"
    :user="session?.user ?? 'admin'"
    :must-change="mustChange"
    @authenticated="onAuthenticated"
    @changed="onPasswordChanged"
  />

  <div v-else class="console">
    <div v-if="firmwareChanged" class="update-banner" role="alert">
      <span>The device was updated. Reload to get the matching console.</span>
      <button type="button" class="btn btn-sm" @click="reloadConsole()">Reload</button>
    </div>
    <div
      v-if="restartOutcome"
      class="update-banner"
      :class="{ 'update-banner-bad': restartOutcome.bad }"
      role="status"
    >
      <span>{{ restartOutcome.text }}</span>
      <button type="button" class="btn btn-sm" @click="restartOutcome = null">Dismiss</button>
    </div>
    <header class="statusbar">
      <svg
        class="brand"
        viewBox="6 15 51 33"
        width="34"
        height="22"
        role="img"
        aria-label="ESP-KVM"
      >
        <title>ESP-KVM</title>
        <g fill="currentColor">
          <rect x="6" y="15" width="3" height="3"/>
          <rect x="9" y="15" width="3" height="3"/>
          <rect x="12" y="15" width="3" height="3"/>
          <rect x="15" y="15" width="3" height="3"/>
          <rect x="18" y="15" width="3" height="3"/>
          <rect x="6" y="18" width="3" height="3"/>
          <rect x="6" y="21" width="3" height="3"/>
          <rect x="9" y="21" width="3" height="3"/>
          <rect x="12" y="21" width="3" height="3"/>
          <rect x="15" y="21" width="3" height="3"/>
          <rect x="6" y="24" width="3" height="3"/>
          <rect x="6" y="27" width="3" height="3"/>
          <rect x="9" y="27" width="3" height="3"/>
          <rect x="12" y="27" width="3" height="3"/>
          <rect x="15" y="27" width="3" height="3"/>
          <rect x="18" y="27" width="3" height="3"/>
          <rect x="24" y="15" width="3" height="3"/>
          <rect x="27" y="15" width="3" height="3"/>
          <rect x="30" y="15" width="3" height="3"/>
          <rect x="33" y="15" width="3" height="3"/>
          <rect x="36" y="15" width="3" height="3"/>
          <rect x="24" y="18" width="3" height="3"/>
          <rect x="24" y="21" width="3" height="3"/>
          <rect x="27" y="21" width="3" height="3"/>
          <rect x="30" y="21" width="3" height="3"/>
          <rect x="33" y="21" width="3" height="3"/>
          <rect x="36" y="21" width="3" height="3"/>
          <rect x="36" y="24" width="3" height="3"/>
          <rect x="24" y="27" width="3" height="3"/>
          <rect x="27" y="27" width="3" height="3"/>
          <rect x="30" y="27" width="3" height="3"/>
          <rect x="33" y="27" width="3" height="3"/>
          <rect x="36" y="27" width="3" height="3"/>
          <rect x="42" y="15" width="3" height="3"/>
          <rect x="45" y="15" width="3" height="3"/>
          <rect x="48" y="15" width="3" height="3"/>
          <rect x="51" y="15" width="3" height="3"/>
          <rect x="54" y="15" width="3" height="3"/>
          <rect x="42" y="18" width="3" height="3"/>
          <rect x="54" y="18" width="3" height="3"/>
          <rect x="42" y="21" width="3" height="3"/>
          <rect x="45" y="21" width="3" height="3"/>
          <rect x="48" y="21" width="3" height="3"/>
          <rect x="51" y="21" width="3" height="3"/>
          <rect x="54" y="21" width="3" height="3"/>
          <rect x="42" y="24" width="3" height="3"/>
          <rect x="42" y="27" width="3" height="3"/>
          <rect x="6" y="33" width="3" height="3"/>
          <rect x="18" y="33" width="3" height="3"/>
          <rect x="6" y="36" width="3" height="3"/>
          <rect x="15" y="36" width="3" height="3"/>
          <rect x="6" y="39" width="3" height="3"/>
          <rect x="9" y="39" width="3" height="3"/>
          <rect x="12" y="39" width="3" height="3"/>
          <rect x="6" y="42" width="3" height="3"/>
          <rect x="15" y="42" width="3" height="3"/>
          <rect x="6" y="45" width="3" height="3"/>
          <rect x="18" y="45" width="3" height="3"/>
          <rect x="24" y="33" width="3" height="3"/>
          <rect x="36" y="33" width="3" height="3"/>
          <rect x="24" y="36" width="3" height="3"/>
          <rect x="36" y="36" width="3" height="3"/>
          <rect x="24" y="39" width="3" height="3"/>
          <rect x="36" y="39" width="3" height="3"/>
          <rect x="27" y="42" width="3" height="3"/>
          <rect x="33" y="42" width="3" height="3"/>
          <rect x="30" y="45" width="3" height="3"/>
          <rect x="42" y="33" width="3" height="3"/>
          <rect x="54" y="33" width="3" height="3"/>
          <rect x="42" y="36" width="3" height="3"/>
          <rect x="45" y="36" width="3" height="3"/>
          <rect x="51" y="36" width="3" height="3"/>
          <rect x="54" y="36" width="3" height="3"/>
          <rect x="42" y="39" width="3" height="3"/>
          <rect x="48" y="39" width="3" height="3"/>
          <rect x="54" y="39" width="3" height="3"/>
          <rect x="42" y="42" width="3" height="3"/>
          <rect x="54" y="42" width="3" height="3"/>
          <rect x="42" y="45" width="3" height="3"/>
          <rect x="54" y="45" width="3" height="3"/>
        </g>
      </svg>

      <!-- Whether the device answers at all, then what its picture is doing. -->
      <span class="stat">
        <span :class="['dot', online ? 'dot-ok' : 'dot-bad']" />
        {{ online ? "Online" : "Unreachable" }}
      </span>
      <VideoWidget
        v-if="online"
        :status="status"
        :codec="codec"
        :text-view="textView"
        :text-preferred="textPreferred"
        :text-available="textModeLikely"
        :video-blocked="videoBlocked"
        :h264-blocked="h264Blocked"
        @set-codec="setCodec"
        @prefer-text="textPreferred = $event"
      />

      <span class="statusbar-spacer" />

      <UpdateWidget :system="system" :values="values" @hold-stream="updateHoldsStream = $event" />

      <button
        type="button"
        class="btn btn-sm btn-icon"
        :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleTheme"
      >
        <Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="15" />
      </button>
    </header>

    <div :class="['body', { 'layout-right': uiRight }]">
      <nav class="rail" aria-label="Panels">
        <button
          type="button"
          :class="['rail-btn', { 'rail-btn-active': panel === 'input' }]"
          aria-label="Input"
          @click="togglePanel('input')"
        >
          <Icon name="keyboard" :size="18" />
        </button>
        <button
          type="button"
          :class="['rail-btn', { 'rail-btn-active': panel === 'media', asking: askingMedia }]"
          aria-label="Virtual media"
          :disabled="!caps.msc?.available"
          :title="caps.msc?.reason ?? 'Virtual media'"
          @click="togglePanel('media')"
        >
          <Icon name="disc" :size="18" />
        </button>
        <div class="rail-spacer" />
        <PowerWidget
          :caps="caps"
          :atx="system?.atx ?? null"
          :wol-mac="wolMac"
          :side="uiRight ? 'right' : 'left'"
        />
        <OsWidget
          :probe="usbProbe"
          :attached="input.target.value.attached"
          :side="uiRight ? 'right' : 'left'"
        />
        <DiagWidget :system="system" :side="uiRight ? 'right' : 'left'" />
        <button
          type="button"
          :class="['rail-btn', { 'rail-btn-active': panel === 'settings' }]"
          aria-label="Settings"
          @click="togglePanel('settings')"
        >
          <Icon name="settings" :size="18" />
        </button>
      </nav>

      <main
        class="stage"
        :class="{ 'stage-touch': touchMode, 'stage-pinned': panelPinned }"
        @pointerdown="nudgeEngage"
      >
        <div class="stage-view">
          <ScreenView
            :status="status"
            :engaged="engaged"
            :engage-mode="engageMode"
            :fit="fit"
            :video-blocked="videoBlocked"
            :paused="paused || updateHoldsStream"
            :text-layer="selectingText || textView ? screenText : null"
          :text-view="textView"
            :pause-note="
              updateHoldsStream
                ? 'The picture is back the moment the update is done - it gives up its connection so the image gets the device to itself.'
                : ''
            "
            @surface="surface = $event"
          />

          <button
            v-if="!engaged && (!paused || textView) && !touchMode && !heldByOther && !selectingText"
            type="button"
            :class="['screen-engage', { 'screen-engage-nudge': engageNudge }]"
            @pointerdown="onEngage($event)"
          >
            {{
              engageMode === "hover"
                ? "Pointer follows the mouse. Click to send keystrokes."
                : "Click to control the target"
            }}
            <span class="screen-engage-hint">Esc gives control back</span>
          </button>

          <!-- Text mode sets `paused` to stop the video, but the keyboard still
               goes to the target - that is most of what a BIOS needs. So the
               notice has to survive that pause like the engage button and the
               touch pad above do, or a text-mode operator whose keys are being
               dropped is told nothing and has no way to take control back. -->
          <div v-if="heldByOther && (!paused || textView)" class="screen-notice">
            <p>Another session is in control of this target.</p>
            <button type="button" class="btn" @click="takeControl">Take control</button>
          </div>

          <TouchControls
            v-if="touchMode && (!paused || textView) && !heldByOther"
            :control="input.control"
            :layout="layout"
          />
        </div>

        <aside v-if="panel" class="panel" :aria-label="PANEL_TITLES[panel]">
          <header class="panel-head">
            <h2>{{ PANEL_TITLES[panel] }}</h2>
            <button
              type="button"
              class="btn btn-sm btn-icon hide-narrow"
              :class="{ 'btn-on': panelPinned }"
              :title="
                panelPinned
                  ? 'Let the panel float over the picture again'
                  : 'Keep the panel open beside the picture instead of over it'
              "
              :aria-label="panelPinned ? 'Unpin the panel' : 'Pin the panel'"
              :aria-pressed="panelPinned"
              @click="panelPinned = !panelPinned"
            >
              <Icon name="pin" :size="15" />
            </button>
            <button type="button" class="btn btn-sm" @click="panel = null">Close</button>
          </header>
          <div class="panel-body">
            <SettingsPanel
              v-if="panel === 'settings' && ready"
              :schema="schema"
              :values="values"
              :caps="caps"
              :wg-public-key="system?.wg?.publicKey ?? ''"
              :firmware="system?.version"
              @values="values = $event"
              @password-changed="onPasswordChanged"
            />

            <InputPanel
              v-else-if="panel === 'input'"
              :control="input.control"
              :schema="schema"
              :values="values"
              :attached="input.target.value.attached"
              :detected-os="usbProbe?.os ?? 'unknown'"
              @values="values = $event"
            />
            <MediaPanel v-else-if="panel === 'media'" :values="values" @values="values = $event" />
          </div>
        </aside>
      </main>
    </div>

    <footer class="actionbar">
      <div class="actionbar-left">
        <span class="conns" aria-label="Connections">
          <button
            v-for="c in conns"
            :key="c.id"
            type="button"
            :class="['conn', 'conn-' + c.state, { 'conn-open': connDetail === c.id }]"
            :title="c.title"
            :aria-label="c.title"
            @click="connDetail = connDetail === c.id ? null : c.id"
          >
            <Icon :name="c.id" :size="16" />
          </button>

          <!-- Tap detail popover: touch has no hover, so show the pill's
               description on tap. Backdrop closes it. -->
          <template v-if="connDetail">
            <div class="conn-backdrop" @click="connDetail = null" />
            <div
              class="conn-popup"
              :class="{ 'conn-popup-net': isNetPill }"
              :role="isNetPill ? 'menu' : 'tooltip'"
            >
              <!-- Every pill leads with its own state line; the network one then
                   opens out into the full panel. -->
              <span :class="isNetPill ? 'conn-popup-head' : ''">
                {{ conns.find((c) => c.id === connDetail)?.title ?? "" }}
              </span>

              <template v-if="isNetPill">
                <template v-if="netAddrs.length">
                  <span class="conn-switch-title">Reachable at</span>
                  <div v-for="a in netAddrs" :key="a.label + a.value" class="conn-addr">
                    <span class="conn-addr-label">
                      {{ a.label }}<template v-if="a.note"> &middot; {{ a.note }}</template>
                    </span>
                    <a v-if="a.url" class="mono conn-addr-value" :href="a.url">{{ a.value }}</a>
                    <span v-else class="mono conn-addr-value">{{ a.value }}</span>
                    <button
                      type="button"
                      class="btn btn-sm conn-addr-copy"
                      :title="`Copy ${a.value}`"
                      :aria-label="`Copy ${a.value}`"
                      @click="copyAddr(a.value)"
                    >
                      Copy
                    </button>
                  </div>
                </template>

                <template v-if="caps.wifi?.available">
                  <span class="conn-switch-title">Connection</span>
                  <button
                    v-for="m in (['ethernet', 'wifi', 'ap'] as const)"
                    :key="m"
                    type="button"
                    class="conn-switch-btn"
                    :class="{ 'conn-switch-active': (system?.net?.mode ?? 'ethernet') === m }"
                    @click="switchNet(m)"
                  >
                    <Icon :name="m" :size="15" />
                    {{ m === "ethernet" ? "Ethernet" : m === "wifi" ? "WiFi" : "Hotspot" }}
                  </button>
                </template>
              </template>
            </div>
          </template>
        </span>


        <span class="leds">
          <span
            v-for="[bit, name] in LED_BITS"
            :key="name"
            :class="['led', { 'led-on': input.target.value.leds & bit }]"
          >
            {{ name }}
          </span>
        </span>
        <span
          class="ctrl-status"
          :class="{ 'ctrl-status-on': engaged }"
          :title="engaged ? 'Controlling - Esc releases' : 'Not controlling'"
          :aria-label="engaged ? 'Controlling' : 'Not controlling'"
        >
          <Icon name="pointer" :size="15" />
        </span>
      </div>
      <div class="actionbar-right">
        <button
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-on': touchMode }"
          :title="touchMode ? 'Touch mode: screen is a trackpad' : 'Use the screen as a trackpad'"
          @click="touchMode = !touchMode"
        >
          Touch
        </button>
        <button
          type="button"
          class="btn btn-sm btn-icon"
          :aria-label="paused ? 'Resume the video stream' : 'Pause the video stream'"
          :title="
            updateHoldsStream
              ? 'Paused until the firmware update finishes'
              : paused
                ? 'Resume the video stream'
                : 'Disconnect the stream to save bandwidth'
          "
          :disabled="updateHoldsStream"
          @click="paused = !paused"
        >
          <Icon :name="paused ? 'play' : 'pause'" :size="15" />
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-on': selectingText, asking: askingSelect }"
          :disabled="!textModeLikely"
          :title="
            textModeLikely
              ? 'Select text on the screen with the mouse, as on a page'
              : 'The target is not showing a text screen'
          "
          @click="toggleSelectText()"
        >
          Select
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!textModeLikely"
          :title="
            textModeLikely
              ? 'Copy everything on the screen as text'
              : 'The target is not showing a text screen'
          "
          @click="copyScreenText()"
        >
          Copy
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :title="
            fit === 'fit'
              ? 'Shrink a picture bigger than the window; leave a smaller one alone'
              : fit === 'stretch'
                ? 'Fill the window, whatever the picture measures'
                : 'One screen pixel per browser pixel'
          "
          @click="fit = fit === 'fit' ? 'stretch' : fit === 'stretch' ? 'actual' : 'fit'"
        >
          {{ fit === "fit" ? "Fit" : fit === "stretch" ? "Stretch" : "1:1" }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-icon"
          aria-label="Fullscreen"
          @click="toggleFullscreen()"
        >
          <Icon name="fullscreen" :size="15" />
        </button>
      </div>
    </footer>

    <ToastHost />
  </div>

  <RestartOverlay />
</template>

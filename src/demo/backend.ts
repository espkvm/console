/*
 * A fully in-browser stand-in for the device, for the static demo at /demo/.
 * It patches fetch and WebSocket so the real console runs with no device behind
 * it: GETs are served from fixtures captured from actual firmware (so the demo
 * matches the product), settings changes are kept in memory, input is swallowed,
 * and the video screen is drawn locally (see ScreenView's demo path).
 *
 * This whole module is only imported when the app is built with `--mode demo`
 * (see main.ts), so it is tree-shaken out of the firmware bundle entirely.
 */
import capabilities from "./fixtures/capabilities.json";
import pins from "./fixtures/pins.json";
import schema from "./fixtures/schema.json";
import settingsFixture from "./fixtures/settings.json";
import systemInfo from "./fixtures/system-info.json";
import videoStatus from "./fixtures/video-status.json";
import storageImages from "./fixtures/storage-images.json";
import usbprobe from "./fixtures/usbprobe.json";
import authSession from "./fixtures/auth-session.json";
import {
  demoCrash,
  demoKeys,
  demoLauncher,
  demoMachine,
  demoMountMedia,
  demoPower,
  demoScene,
  demoSceneMs,
  demoScreenText,
} from "./machine";

type Json = Record<string, unknown>;

/* Settings the visitor changes live here, so toggles and dropdowns behave. */
let settings: Json = { ...(settingsFixture as Json) };

/* The card's contents, so an uploaded image joins the list. */
let images: Json = { ...(storageImages as Json) };

/* Whether the demo is serving an "operator" certificate, so the TLS panel can be
   tried out (install flips it on, revert flips it off). No real restart happens. */
let tlsCustom = false;

/* The captured status has no HDMI source (signal:false). Present a live picture
   instead, so the demo shows the interface working rather than "No signal". */
const DEMO_STATUS = {
  ...(videoStatus as Json),
  signal: true,
  width: 1280,
  height: 720,
  fps: 24,
  kbps: 8500,
  viewers: 1,
  wsClients: 1,
  imgClients: 0,
  codec: "mjpeg",
};

/* What the fake machine is doing right now, in the shape the two endpoints that
   describe a screen expect. */
function liveStatus(): Json {
  const m = demoMachine();
  return {
    ...DEMO_STATUS,
    signal: m.signal,
    textMode: m.textMode,
    fps: Math.round(drift(24, 1.6, 11) * 10) / 10,
    kbps: Math.round(drift(8500, 900, 9)),
  };
}

/* An update in the demo really does install: the version it reports afterwards
   is kept here, so the console's verdict after its reload is the true one. */
const VERSION_KEY = "espkvm-demo-version";
const NEXT_VERSION = "v.0.34.0";
const installedVersion = () => {
  try {
    return sessionStorage.getItem(VERSION_KEY) || (systemInfo as { version: string }).version;
  } catch {
    return (systemInfo as { version: string }).version;
  }
};
/* Set while the device is "away" after an update: reads fail, exactly as they
   would against a device that is restarting. */
let awayUntil = 0;

/* Numbers a device would never hold still: a slow thermal drift and the memory
   moving under it, so the diagnostics panel looks alive rather than painted. */
function drift(base: number, swing: number, seconds: number): number {
  const t = performance.now() / 1000;
  return base + Math.sin(t / seconds) * swing + Math.sin(t / (seconds * 0.37)) * swing * 0.3;
}

function liveInfo(): Json {
  const m = demoMachine();
  const base = systemInfo as Json;
  const version = installedVersion();
  return {
    ...base,
    version,
    ota: [
      { label: "ota_0", version, state: "valid", running: true, boot: true },
      { label: "ota_1", version: (systemInfo as { version: string }).version, state: "valid", running: false, boot: false },
    ],
    atx: { enabled: true, known: true, on: m.powerOn },
    uptimeSeconds: Math.round(performance.now() / 1000) + 3600,
    tempC: Math.round(drift(41, 2.5, 26) * 10) / 10,
    heapFree: Math.round(drift(268000, 9000, 17)),
    psramFree: Math.round(drift(24_900_000, 320_000, 31)),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function bodyJson(init?: RequestInit, req?: Request): Promise<Json> {
  try {
    if (init?.body) return JSON.parse(String(init.body));
    if (req) return (await req.clone().json()) as Json;
  } catch {
    /* fall through */
  }
  return {};
}

/* Returns a Response for a known route, or null to let the real fetch run
   (static assets, anything not part of the device API). */
/* The release the demo offers, and an image of the right size to "download".
   Fetching the real one would push megabytes at a visitor for nothing. */
const IMAGE_BYTES = 1_612_800;

function fakeManifest(): Json {
  return {
    version: NEXT_VERSION,
    file: `espkvm-${NEXT_VERSION}-p4-eth.bin`,
    size: IMAGE_BYTES,
    released: new Date().toISOString().slice(0, 10),
    notes: "https://github.com/espkvm/espkvm/releases",
  };
}

/* Delivered in pieces over a couple of seconds, because a progress bar that
   jumps from nothing to everything shows nothing. */
function fakeImage(): Response {
  const chunk = new Uint8Array(64 * 1024);
  /* The console checks the first byte before sending: an ESP image starts 0xE9,
     and it is right to refuse anything else. */
  const first = new Uint8Array(chunk.length);
  first[0] = 0xe9;
  let sent = 0;
  const body = new ReadableStream({
    async pull(c) {
      if (sent >= IMAGE_BYTES) {
        c.close();
        return;
      }
      await new Promise((r) => setTimeout(r, 60));
      const n = Math.min(chunk.length, IMAGE_BYTES - sent);
      const from = sent === 0 ? first : chunk;
      sent += n;
      c.enqueue(from.slice(0, n));
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(IMAGE_BYTES) },
  });
}

async function route(
  path: string,
  method: string,
  init?: RequestInit,
  req?: Request,
  search = "",
): Promise<Response | null> {
  /* While the demo device is "restarting", reads fail the way they would
     against one that is: the console then shows its waiting screen for real. */
  if (performance.now() < awayUntil && path.startsWith("/api/")) {
    throw new TypeError("Failed to fetch");
  }
  if (method === "GET") {
    if (path.endsWith("/manifest.json")) return json(fakeManifest());
    if (path.endsWith(".bin")) return fakeImage();
    switch (path) {
      case "/api/capabilities":
        return json(capabilities);
      case "/api/v1/pins":
        return json(pins);
      case "/api/v1/settings":
        return json(settings);
      case "/api/v1/settings/schema":
        return json(schema);
      case "/api/v1/system/info":
        return json(liveInfo());
      case "/api/v1/video/status":
        return json(liveStatus());
      case "/api/v1/storage/images":
        return json(images);
      case "/api/v1/system/usbprobe":
        return json(usbprobe);
      case "/api/v1/auth/session":
        return json(authSession);
      case "/api/v1/tls":
        return json({ https: true, custom: tlsCustom });
      case "/api/v1/screen/text": {
        /* A booting machine is text, and text is what Select and Copy need. Once
           it reaches the pointer demo it is a picture, and 204 is the honest
           answer - the same one the device gives. */
        const grid = demoScreenText();
        return grid ? json(grid) : new Response(null, { status: 204 });
      }
    }
    return null;
  }

  if (method === "PUT" && path === "/api/v1/settings") {
    const patch = await bodyJson(init, req);
    settings = { ...settings, ...patch };
    /* Mirror the device: the two VPN backends are mutually exclusive, so enabling
       one turns the other off (the VPN selector relies on this). */
    const p = patch as Json;
    if (p.wg_enable === true) settings = { ...settings, ts_enable: false };
    else if (p.ts_enable === true) settings = { ...settings, wg_enable: false };
    /* Picking an image in Media is what mounts it - the same setting the device
       uses - and that decides whether the next boot finds anything. */
    /* The target only sees a drive when virtual media is switched on - the same
       gate the firmware applies. */
    demoMountMedia(String(settings.msc_image ?? ""), Boolean(settings.msc_enable));
    /* The media panel reads the active medium from the card listing, not from
       the setting, so the two have to stay in step - otherwise the choice looks
       like it fell back to "ejected" the next time the list is fetched. */
    images = { ...images, active: String(settings.msc_image ?? "") };
    return json(settings);
  }
  if (method === "POST" && path === "/api/v1/storage/delete") {
    const name = new URLSearchParams(search).get("name") ?? "";
    images = {
      ...images,
      images: (images.images as Array<{ name: string }>).filter((i) => i.name !== name),
      active: images.active === name ? "" : images.active,
    };
    if (settings.msc_image === name) {
      settings = { ...settings, msc_image: "" };
      demoMountMedia("", Boolean(settings.msc_enable));
    }
    return json(images);
  }
  if (method === "PUT" && path === "/api/v1/tls/cert") {
    tlsCustom = true;
    return json({ status: "stored", restarting: true });
  }
  if (method === "DELETE" && path === "/api/v1/tls/cert") {
    tlsCustom = false;
    return json({ status: "cleared", restarting: true });
  }
  if (method === "POST") {
    switch (path) {
      case "/api/v1/settings/reset":
        settings = { ...(settingsFixture as Json) };
        return json(settings);
      case "/api/v1/auth/login":
        return json({ mustChange: false });
      case "/api/v1/auth/logout":
        return json({ status: "logged out" });
      case "/api/v1/auth/password":
        return json({ status: "changed" });
      case "/api/v1/system/restart":
        return json({ status: "restarting" });
      case "/api/v1/power/wake":
        demoPower("wake");
        return json({ status: "sent" });
      case "/api/v1/power/click":
        demoPower("click");
        return json({ status: "ok" });
      case "/api/v1/power/hold":
        demoPower("hold");
        return json({ status: "ok" });
      case "/api/v1/power/reset":
        demoPower("reset");
        return json({ status: "ok" });
      /* Writing the rescue partition is the one action still worth refusing:
         nothing about it can be shown, and it takes a minute on a real device. */
      case "/api/v1/storage/rescue":
        return json({ error: "not available in the demo" }, 501);
    }
  }
  return null;
}

/*
 * The console sends an image with XMLHttpRequest, not fetch, because only XHR
 * reports upload progress - so a demo that patches only fetch would send a
 * firmware image at a static web host. This takes the two uploads it makes.
 */
type XhrHandler = ((e: ProgressEvent) => void) | null;

class DemoXhr {
  status = 0;
  responseText = "";
  readyState = 0;
  onload: XhrHandler = null;
  onerror: XhrHandler = null;
  upload: { onprogress: XhrHandler; onload: XhrHandler } = { onprogress: null, onload: null };
  private path = "";

  open(_method: string, url: string): void {
    this.path = new URL(url, location.origin).pathname + new URL(url, location.origin).search;
  }
  setRequestHeader(): void {}
  getResponseHeader(): string | null {
    return null;
  }
  abort(): void {}
  addEventListener(): void {}

  async send(body: Blob | ArrayBuffer | string | null): Promise<void> {
    const total = body instanceof Blob ? body.size : 1_000_000;
    /* Twenty steps over a couple of seconds: enough for the ring to fill and the
       percentage to read like bytes moving. */
    for (let i = 1; i <= 20; i++) {
      await new Promise((r) => setTimeout(r, 110));
      this.upload.onprogress?.(
        new ProgressEvent("progress", { lengthComputable: true, loaded: (total / 20) * i, total }),
      );
    }
    this.upload.onload?.(new ProgressEvent("load"));
    await new Promise((r) => setTimeout(r, 700));

    if (this.path.startsWith("/api/v1/system/update")) {
      /* Written, restarting - and the device really does go away, so the
         console's waiting screen and its verdict afterwards are the real ones. */
      try {
        sessionStorage.setItem(VERSION_KEY, NEXT_VERSION);
      } catch {
        /* a private window: the verdict will simply say the old version */
      }
      awayUntil = performance.now() + 7000;
      this.status = 200;
      this.responseText = JSON.stringify({ status: "written", restarting: true });
    } else if (this.path.startsWith("/api/v1/storage/upload")) {
      const name = new URLSearchParams(this.path.split("?")[1] ?? "").get("name") ?? "image.iso";
      images = {
        ...images,
        images: [...(images.images as Json[]), { name, size: total }],
      };
      this.status = 200;
      this.responseText = JSON.stringify(images);
    } else {
      this.status = 501;
      this.responseText = JSON.stringify({ error: "not available in the demo" });
    }
    this.readyState = 4;
    this.onload?.(new ProgressEvent("load"));
  }
}

/** A WebSocket that never connects: input is accepted and dropped. */
class DemoSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(readonly url: string) {
    super();
    setTimeout(() => {
      this.readyState = 1;
      const e = new Event("open");
      this.onopen?.(e);
      this.dispatchEvent(e);
      /* On the control channel, report a target attached (status frame 0x81,
         flags bit0 = attached) so the demo shows a live USB connection. */
      if (this.url.includes("/ws")) {
        const status = new Uint8Array([0x81, 0x01, 0x00]);
        const m = new MessageEvent("message", { data: status.buffer });
        this.onmessage?.(m);
        this.dispatchEvent(m);
      }
    }, 0);
  }
  send(data: unknown): void {
    /* Mouse and the rest are swallowed; a keyboard report is typed at the fake
       machine, so the demo's shell answers the visitor. Frame 0x03 is a
       modifier byte and six usage codes - see input/control.ts. */
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return;
    const b = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(
      (data as ArrayBufferView).buffer,
      (data as ArrayBufferView).byteOffset,
      (data as ArrayBufferView).byteLength,
    );
    if (b.length >= 8 && b[0] === 0x03) {
      demoKeys(b[1], Array.from(b.subarray(2, 8)));
    }
  }
  close(): void {
    this.readyState = 3;
    const e = new CloseEvent("close");
    this.onclose?.(e);
    this.dispatchEvent(e);
  }
}

let installed = false;

export function installDemoBackend(): void {
  if (installed) return;
  installed = true;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : undefined;
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const u = new URL(url, location.origin);
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const res = await route(u.pathname, method, init, req, u.search);
    return res ?? realFetch(input as RequestInfo, init);
  };

  /* The screen goes on the window: ScreenView reads it from there, so no part of
     the real console imports this module. */
  const w = window as unknown as {
    __espkvmDemoScreen?: unknown;
    __espkvmDemoScene?: unknown;
    __espkvmDemoSceneMs?: unknown;
    __espkvmDemoCrash?: unknown;
    __espkvmDemoPower?: unknown;
    __espkvmDemoLauncher?: unknown;
  };
  w.__espkvmDemoScreen = demoScreenText;
  w.__espkvmDemoScene = demoScene;
  w.__espkvmDemoSceneMs = demoSceneMs;
  /* The drawing knows where the sheep and the dock are, so it is the drawing that
     decides a click landed on one - it only has to say so. */
  w.__espkvmDemoCrash = demoCrash;
  w.__espkvmDemoPower = demoPower;
  w.__espkvmDemoLauncher = demoLauncher;

  window.XMLHttpRequest = DemoXhr as unknown as typeof XMLHttpRequest;

  const RealWS = window.WebSocket;
  const patched = new Proxy(RealWS, {
    construct(target, args: [string | URL, (string | string[])?]) {
      const url = String(args[0]);
      if (url.includes("/ws") || url.includes("/video")) {
        return new DemoSocket(url) as unknown as WebSocket;
      }
      return new target(...args);
    },
  });
  window.WebSocket = patched as unknown as typeof WebSocket;
}

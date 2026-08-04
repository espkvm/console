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
import schema from "./fixtures/schema.json";
import settingsFixture from "./fixtures/settings.json";
import systemInfo from "./fixtures/system-info.json";
import videoStatus from "./fixtures/video-status.json";
import storageImages from "./fixtures/storage-images.json";
import usbprobe from "./fixtures/usbprobe.json";
import authSession from "./fixtures/auth-session.json";

type Json = Record<string, unknown>;

/* Settings the visitor changes live here, so toggles and dropdowns behave. */
let settings: Json = { ...(settingsFixture as Json) };

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
async function route(
  path: string,
  method: string,
  init?: RequestInit,
  req?: Request,
): Promise<Response | null> {
  if (method === "GET") {
    switch (path) {
      case "/api/capabilities":
        return json(capabilities);
      case "/api/v1/settings":
        return json(settings);
      case "/api/v1/settings/schema":
        return json(schema);
      case "/api/v1/system/info":
        return json(systemInfo);
      case "/api/v1/video/status":
        return json(DEMO_STATUS);
      case "/api/v1/storage/images":
        return json(storageImages);
      case "/api/v1/system/usbprobe":
        return json(usbprobe);
      case "/api/v1/auth/session":
        return json(authSession);
      case "/api/v1/tls":
        return json({ https: true, custom: tlsCustom });
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
    return json(settings);
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
        return json({ status: "sent" });
      case "/api/v1/power/click":
      case "/api/v1/power/hold":
      case "/api/v1/power/reset":
        return json({ status: "ok" });
      /* Actions that would move real bytes are not part of a demo. */
      case "/api/v1/system/update":
      case "/api/v1/storage/upload":
      case "/api/v1/storage/rescue":
      case "/api/v1/storage/delete":
        return json({ error: "not available in the demo" }, 501);
    }
  }
  return null;
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
  send(): void {
    /* swallow HID and anything else */
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
    const path = new URL(url, location.origin).pathname;
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const res = await route(path, method, init, req);
    return res ?? realFetch(input as RequestInfo, init);
  };

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

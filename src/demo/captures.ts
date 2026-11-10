/*
 * The recorder, for the demo. There is no card: a recording is the demo's own
 * screen taken with MediaRecorder, a screenshot is a JPEG of it, and both stay
 * in the browser as blob: URLs that the console plays, opens and downloads.
 * The screen's text is kept with a recording the way the device keeps its .txt,
 * so the search finds it.
 */
import { demoScreenText } from "./machine";
import systemLog from "./fixtures/system-log.txt?raw";

type Json = Record<string, unknown>;

interface DemoFile {
  path: string;
  size: number;
  subtitles?: string;
  text?: string;
}

/* Path on the "card" -> blob: URL. */
const urls = new Map<string, string>();
let videos: DemoFile[] = [];
let shots: DemoFile[] = [];
/* Every line the screen showed during a recording, and when. */
let textHits: { path: string; seconds: number; text: string }[] = [];

const rec = {
  on: false,
  file: "",
  seconds: 0,
  bytes: 0,
  dropped: 0,
  stopped: "",
  blocked: null as string | null,
  event: false,
  dashcam: true,
  dashcamNoMemory: false,
  prerollSeconds: 20,
  timelapse: 0,
  clipSecondsLeft: 0,
  clipsConverting: 0,
  lastClip: "",
};

let recorder: MediaRecorder | null = null;
let startedAt = 0;
let textTimer: ReturnType<typeof setInterval> | null = null;

/* The biggest canvas on the page that is showing: the screen. */
function screenCanvas(): HTMLCanvasElement | null {
  let best: HTMLCanvasElement | null = null;
  let area = 0;
  for (const c of Array.from(document.querySelectorAll("canvas"))) {
    const a = c.width * c.height;
    if (a > area && c.offsetParent !== null) {
      best = c;
      area = a;
    }
  }
  return best;
}

/* "20260921-201500", the name the device gives a file. */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function mimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function store(path: string, blob: Blob) {
  const old = urls.get(path);
  if (old) URL.revokeObjectURL(old);
  urls.set(path, URL.createObjectURL(blob));
}

/* Lines of the screen that are new since the last look. */
let seen = new Set<string>();
function sampleText(path: string) {
  const grid = demoScreenText();
  if (!grid) return;
  const seconds = (performance.now() - startedAt) / 1000;
  for (const raw of grid.text.split("\n")) {
    const line = raw.trim();
    if (line.length < 3 || seen.has(line)) continue;
    seen.add(line);
    textHits.push({ path, seconds, text: line });
  }
}

/*
 * Record the screen until stop() - or for @p seconds, for a dashcam clip. The
 * files are named MP4 whatever the browser records: the console plays an MP4
 * with its own <video>, which takes a WebM just as well, and a .ts would go to
 * the MPEG-TS player, which would not.
 */
function begin(path: string, seconds = 0): string | null {
  const canvas = screenCanvas();
  const type = mimeType();
  if (!canvas || !type) return "this browser cannot record a canvas";
  const chunks: Blob[] = [];
  const r = new MediaRecorder(canvas.captureStream(25), { mimeType: type });
  r.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
    rec.bytes = chunks.reduce((n, c) => n + c.size, 0);
  };
  r.onstop = () => {
    const blob = new Blob(chunks, { type: type.split(";")[0] });
    store(path, blob);
    const textPath = path.replace(/\.mp4$/, ".txt");
    const has = textHits.some((h) => h.path === path);
    videos = [...videos, { path, size: blob.size, ...(has ? { text: textPath } : {}) }];
    if (has) {
      store(textPath, new Blob([textHits.filter((h) => h.path === path).map((h) => h.text).join("\n")], { type: "text/plain" }));
    }
  };
  r.start(1000);
  recorder = r;
  startedAt = performance.now();
  seen = new Set();
  sampleText(path);
  textTimer = setInterval(() => {
    sampleText(path);
    rec.seconds = Math.round((performance.now() - startedAt) / 1000);
    if (seconds) {
      rec.clipSecondsLeft = Math.max(0, seconds - rec.seconds);
      if (!rec.clipSecondsLeft) end("");
    }
  }, 1000);
  Object.assign(rec, { on: true, file: path, seconds: 0, bytes: 0, stopped: "" });
  return null;
}

function end(why: string) {
  if (textTimer) clearInterval(textTimer);
  textTimer = null;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  recorder = null;
  const was = rec.file;
  Object.assign(rec, { on: false, file: "", event: false, timelapse: 0, clipSecondsLeft: 0, stopped: why });
  if (was.includes("-event")) rec.lastClip = was;
}

export function demoRecordStatus(): Json {
  return { ...rec };
}

export function demoRecordStart(every: number): Json | string {
  if (rec.on) return "a recording is already running";
  const path = every ? `VIDEO/${stamp()}-timelapse.mp4` : `VIDEO/${stamp()}.mp4`;
  const err = begin(path);
  if (err) return err;
  rec.timelapse = every;
  return demoRecordStatus();
}

export function demoRecordStop(): Json {
  if (rec.on) end("stopped from the console");
  return demoRecordStatus();
}

/* A dashcam clip: the device saves what it held and a little after; here it is
   the little after, eight seconds of it. */
export function demoRecordEvent(): Json | string {
  if (rec.on) return "a recording is already running";
  const err = begin(`VIDEO/${stamp()}-event.mp4`, 8);
  if (err) return err;
  rec.event = true;
  rec.clipSecondsLeft = 8;
  return demoRecordStatus();
}

export async function demoScreenshot(): Promise<Json | string> {
  const canvas = screenCanvas();
  if (!canvas) return "no picture to take";
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) return "no picture to take";
  const path = `SCREENSHOTS/${stamp()}.jpg`;
  store(path, blob);
  shots = [...shots, { path, size: blob.size }];
  return { file: path };
}

export function demoCaptures(): Json {
  return { blocked: null, video: videos, screenshots: shots, canDelete: !rec.on, canUpload: true };
}

/* Uploads in the demo: nothing leaves the browser, the bar just fills. */
type DemoUpload = { path: string; state: string; bytes: number; total: number; message: string; t0: number };
let uploads: DemoUpload[] = [];
let uploadTest = { state: "idle", message: "" };

export function demoUploads(): Json {
  const now = Date.now();
  let busy = false;
  for (const u of uploads) {
    if (u.state === "queued" && !busy) {
      u.state = "sending";
      u.t0 = now;
    }
    if (u.state === "sending") {
      /* About 2 MB/s, a Nextcloud on the same network. */
      u.bytes = Math.min(u.total, ((now - u.t0) / 1000) * 2_000_000);
      if (u.bytes >= u.total) u.state = "done";
      else busy = true;
    }
  }
  return {
    ready: true,
    dest: "WebDAV",
    test: uploadTest,
    items: uploads.map(({ t0: _t0, ...u }) => u),
  };
}

export function demoUpload(path: string): Json {
  const f = [...videos, ...shots].find((x) => x.path === path);
  if (f && !uploads.some((u) => u.path === path && (u.state === "queued" || u.state === "sending"))) {
    uploads = [...uploads.slice(-31), { path, state: "queued", bytes: 0, total: f.size, message: "", t0: 0 }];
  }
  return demoUploads();
}

export function demoUploadCancel(): Json {
  for (const u of uploads) {
    if (u.state === "queued" || u.state === "sending") {
      u.state = "cancelled";
      u.message = "cancelled";
    }
  }
  return demoUploads();
}

export function demoUploadTest(): Json {
  uploadTest = { state: "ok", message: "the server took it: the device's folder is there" };
  return demoUploads();
}

export function demoCaptureDelete(path: string): Json {
  const url = urls.get(path);
  if (url) URL.revokeObjectURL(url);
  urls.delete(path);
  videos = videos.filter((f) => f.path !== path);
  shots = shots.filter((f) => f.path !== path);
  textHits = textHits.filter((h) => h.path !== path);
  return demoCaptures();
}

export function demoCaptureSearch(q: string): Json {
  const want = q.trim().toLowerCase();
  const done = new Set(videos.map((v) => v.path));
  const hits = want
    ? textHits.filter((h) => done.has(h.path) && h.text.toLowerCase().includes(want))
    : [];
  return { hits: hits.slice(0, 50), more: hits.length > 50 };
}

/* For captureUrl() and logUrl() in the console. */
let logUrl = "";
export function demoFile(key: string): string | undefined {
  if (key === "log") {
    logUrl ||= URL.createObjectURL(new Blob([systemLog], { type: "text/plain" }));
    return logUrl;
  }
  return urls.get(key);
}

<script setup lang="ts">
/*
 * The target's screen, plus every state that is not a picture.
 *
 * A blank rectangle is the worst possible answer to "why can I not see
 * anything": no signal, a target switched off, a stream the browser refused,
 * and a console still starting up all look identical. Each gets its own
 * message, and the ones the operator can act on say what to check.
 *
 * Frames normally arrive over the WebSocket channel and are drawn to a canvas.
 * If that channel produces nothing the old multipart stream is used instead -
 * being locked out of the picture because a transport changed would be worse
 * than using the older one.
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import type { ScreenText, VideoStatus } from "../state/device";
import { VideoStream } from "../video/stream";
import Icon from "./Icon.vue";

const props = defineProps<{
  status: VideoStatus | null;
  engaged: boolean;
  engageMode: "click" | "hover";
  fit: "fit" | "actual";
  /** Paused: nothing is read, so the device stops encoding entirely. */
  paused: boolean;
  /** Shown instead of the usual pause text when something other than the
      operator stopped the stream - currently a firmware upload. */
  pauseNote?: string;
  /** The screen read as characters, when the operator has asked to select it.
      Null means no layer: the picture behaves as usual. */
  textLayer?: ScreenText | null;
}>();

const emit = defineEmits<{ surface: [HTMLElement | null] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const img = ref<HTMLImageElement | null>(null);
const useWebsocket = ref(true);
const failed = ref(false);
const loaded = ref(false);
/** Why this browser cannot play the stream, when that is the problem. */
const codecError = ref<string | null>(null);
const streamUrl = ref("/stream");

let stream: VideoStream | null = null;
let ctx: CanvasRenderingContext2D | null = null;

/* Demo build only (static site at /demo/): there is no device, so the "screen"
   is an abstract animation - a constellation of points that lights up around a
   cursor which lags behind the real one - just to make the pane feel live and
   reactive. Tree-shaken out of the firmware build. */
const DEMO = import.meta.env.MODE === "demo";
let demoRAF = 0;
let demoCleanup: (() => void) | null = null;

function startDemoScreen() {
  const el = canvas.value;
  const c = el?.getContext("2d");
  if (!el || !c) return;
  const W = 1280;
  const H = 720;
  el.width = W;
  el.height = H;
  loaded.value = true;
  failed.value = false;

  const pts = Array.from({ length: 120 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
  }));
  const target = { x: W / 2, y: H / 2 };
  const cur = { x: W / 2, y: H / 2 };
  let hasPointer = false;
  let clickT = -1e9;
  const PULSE = 520;

  /* Follow the real cursor only once the visitor has engaged (clicked to take
     control), like the real KVM; otherwise the screen drifts on its own. The
     eased cursor trails slightly behind; a click sends a discharge along the
     rays. */
  const onMove = (e: PointerEvent) => {
    if (!props.engaged) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    target.x = Math.max(0, Math.min(W, ((e.clientX - r.left) / r.width) * W));
    target.y = Math.max(0, Math.min(H, ((e.clientY - r.top) / r.height) * H));
    hasPointer = true;
  };
  const onDown = () => {
    if (props.engaged) clickT = performance.now();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerdown", onDown);
  demoCleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown);
  };

  const t0 = performance.now();
  const draw = (t: number) => {
    const s = (t - t0) / 1000;
    /* Until engaged, ignore the real cursor and drift on our own. */
    if (!props.engaged) hasPointer = false;
    /* Gentle autonomous motion until the visitor moves the mouse. */
    if (!hasPointer) {
      target.x = W / 2 + Math.cos(s * 0.6) * W * 0.34;
      target.y = H / 2 + Math.sin(s * 0.9) * H * 0.34;
    }
    cur.x += (target.x - cur.x) * 0.08;
    cur.y += (target.y - cur.y) * 0.08;

    c.fillStyle = "#0a141d";
    c.fillRect(0, 0, W, H);
    const glow = c.createRadialGradient(cur.x, cur.y, 0, cur.x, cur.y, 340);
    glow.addColorStop(0, "rgba(76,154,255,0.20)");
    glow.addColorStop(1, "rgba(76,154,255,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);

    const age = t - clickT;
    const pulse = age >= 0 && age < PULSE ? 1 - age / PULSE : 0;
    const ease = pulse > 0 ? 1 - Math.pow(1 - age / PULSE, 3) : 0;
    const R = 260;
    for (const p of pts) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x += W;
      else if (p.x > W) p.x -= W;
      if (p.y < 0) p.y += H;
      else if (p.y > H) p.y -= H;
      const d = Math.hypot(p.x - cur.x, p.y - cur.y);
      const near = d < R ? 1 - d / R : 0;
      c.beginPath();
      c.arc(p.x, p.y, 1 + near * 2.5 + pulse * near * 3, 0, Math.PI * 2);
      c.fillStyle = `rgba(150,190,230,${0.1 + near * 0.6 + pulse * near * 0.3})`;
      c.fill();
      if (near > 0) {
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(cur.x, cur.y);
        c.strokeStyle = `rgba(76,154,255,${near * 0.28 + pulse * near * 0.5})`;
        c.lineWidth = 1;
        c.stroke();
        if (pulse > 0) {
          const sx = cur.x + (p.x - cur.x) * ease;
          const sy = cur.y + (p.y - cur.y) * ease;
          c.beginPath();
          c.arc(sx, sy, 2 + pulse * 2.5, 0, Math.PI * 2);
          c.fillStyle = `rgba(200,225,255,${Math.min(1, pulse * (0.6 + near))})`;
          c.fill();
        }
      }
    }

    /* The lagging cursor arrow. */
    c.beginPath();
    c.moveTo(cur.x, cur.y);
    c.lineTo(cur.x, cur.y + 22);
    c.lineTo(cur.x + 6, cur.y + 16);
    c.lineTo(cur.x + 13, cur.y + 24);
    c.lineTo(cur.x + 17, cur.y + 21);
    c.lineTo(cur.x + 10, cur.y + 13);
    c.lineTo(cur.x + 18, cur.y + 12);
    c.closePath();
    c.fillStyle = "#fff";
    c.strokeStyle = "#000";
    c.lineWidth = 1.5;
    c.fill();
    c.stroke();

    demoRAF = requestAnimationFrame(draw);
  };
  demoRAF = requestAnimationFrame(draw);
}

function surfaceEl(): HTMLElement | null {
  return useWebsocket.value ? canvas.value : img.value;
}

watch([canvas, img, useWebsocket], () => emit("surface", surfaceEl()));

function startStream() {
  stream?.stop();
  /* Whatever the last attempt could not play, this one has not failed yet. */
  codecError.value = null;
  stream = new VideoStream({
    onFrame({ image, width, height }) {
      const el = canvas.value;
      if (!el) {
        image.close();
        return;
      }
      if (el.width !== width || el.height !== height) {
        el.width = width;
        el.height = height;
        ctx = el.getContext("2d");
      }
      ctx ??= el.getContext("2d");
      ctx?.drawImage(image, 0, 0);
      image.close();
      loaded.value = true;
      failed.value = false;
      codecError.value = null;
    },
    onUnavailable() {
      /* Fall back once and stay there: flapping between transports would make
         the picture blink for as long as the channel is unhappy. */
      if (useWebsocket.value) {
        useWebsocket.value = false;
        loaded.value = false;
        streamUrl.value = `/stream?t=${Date.now()}`;
      }
    },
    onCodecError(reason) {
      /* No transport to fall back to: the multipart stream carries images
         only, and the device is producing H.264. Say what has to change. */
      codecError.value = reason;
      loaded.value = false;
    },
  });
}

watch(
  () => props.paused,
  (isPaused) => {
    if (DEMO) return;
    if (isPaused) {
      loaded.value = false;
      stream?.stop();
      stream = null;
      if (img.value) img.value.removeAttribute("src");
    } else if (useWebsocket.value) {
      startStream();
    } else {
      streamUrl.value = `/stream?t=${Date.now()}`;
    }
  },
);

watch(useWebsocket, (on) => {
  if (on) startStream();
  else {
    stream?.stop();
    stream = null;
  }
});

/* Re-request the multipart stream after a failure rather than leaving a dead
   element: the device rebuilds its encoder on a resolution change. */
let retryDelay = 1500;
watch(failed, (isFailed) => {
  if (!isFailed) {
    retryDelay = 1500;
    return;
  }
  if (useWebsocket.value) return;
  /*
   * Except when the device is not KNOWN to be producing MJPEG, which is not the
   * same as knowing it produces H.264. The multipart endpoint carries images
   * only; anything else - H.264, or a codec we have not learned yet because the
   * status has not loaded - means the WebSocket is the only transport that can
   * work, and retrying /stream is a loop with a known answer (the device
   * replies 409 and says so).
   *
   * The difference is not academic. The channel is refused before sign-in, so a
   * page that opens on the login screen falls back to the multipart stream, and
   * with the status not yet loaded the old test could not undo it: the picture
   * then never appeared until the page happened to be reloaded in the right
   * order. Which is exactly how it was reported.
   */
  if (props.status?.codec !== "mjpeg") {
    useWebsocket.value = true;
    failed.value = false;
    return;
  }
  /* Backs off, because the failure may be permanent from this page's point of
     view - a device that signed us out answers 401 to every attempt, and a
     tab left retrying twice a second for a few hours grinds to a halt. */
  setTimeout(() => {
    failed.value = false;
    streamUrl.value = `/stream?t=${Date.now()}`;
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30000);
});

if (DEMO) onMounted(startDemoScreen);
else if (!props.paused) startStream();
onUnmounted(() => {
  stream?.stop();
  if (demoRAF) cancelAnimationFrame(demoRAF);
  demoCleanup?.();
});

/*
 * The selectable text layer.
 *
 * A text-mode screen is a grid, and the characters we read came out of that
 * grid, so the layer only has to be put back where they were: transparent text
 * over the picture, one row per row, each character over the cell it was read
 * from. The browser then does selection and copying for us - the same thing a
 * PDF viewer does over a scanned page.
 *
 * Two things have to line up. The rectangle the video occupies inside the
 * element, because "fit" letterboxes it - the same calculation the pointer
 * mapping makes, for the same reason. And the character advance: a monospace
 * font at a given size has an advance of its own choosing, which will not be
 * the cell width, so it is measured once and the difference is handed to
 * letter-spacing. Without that the row drifts right and the last characters sit
 * a cell or two from where they were read.
 */
const LAYER_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const box = ref({ left: 0, top: 0, width: 0, height: 0 });

function measureAdvance(fontPx: number): number {
  const c = document.createElement("canvas").getContext("2d");
  if (!c) return fontPx * 0.6;
  c.font = `${fontPx}px ${LAYER_FONT}`;
  return c.measureText("0").width || fontPx * 0.6;
}

function updateBox() {
  const el = (useWebsocket.value ? canvas.value : img.value) as HTMLElement | null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const host = el.parentElement?.getBoundingClientRect();
  const iw = (el as HTMLCanvasElement).width || (el as HTMLImageElement).naturalWidth || r.width;
  const ih = (el as HTMLCanvasElement).height || (el as HTMLImageElement).naturalHeight || r.height;
  if (!host || iw <= 0 || ih <= 0 || r.width <= 0) return;
  const scale = Math.min(r.width / iw, r.height / ih);
  box.value = {
    left: r.left - host.left + (r.width - iw * scale) / 2,
    top: r.top - host.top + (r.height - ih * scale) / 2,
    width: iw * scale,
    height: ih * scale,
  };
}

let boxObserver: ResizeObserver | null = null;
onMounted(() => {
  updateBox();
  boxObserver = new ResizeObserver(updateBox);
  const stage = canvas.value?.parentElement;
  if (stage) boxObserver.observe(stage);
});
onUnmounted(() => boxObserver?.disconnect());
watch(() => props.textLayer, updateBox);
watch(() => props.fit, updateBox);
/* A resolution change moves the letterbox without resizing anything the
   observer can see: the canvas keeps its CSS box and swaps its intrinsic size.
   The status poll is what notices. */
watch(() => [props.status?.width, props.status?.height], updateBox);

const layerRows = computed(() => {
  const t = props.textLayer;
  if (!t) return [];
  const lines = t.text.split("\n");
  while (lines.length < t.rows) lines.push("");
  /* A blank row still has to occupy its row: an empty element collapses to no
     height at all, and every row below it would then sit above the characters
     it was read from. A single space is the cheapest way to keep the box, and
     it is what a blank line copies as anyway. */
  return lines.slice(0, t.rows).map((l) => (l.length ? l : " "));
});

const layerStyle = computed(() => {
  const t = props.textLayer;
  if (!t || box.value.width <= 0) return {};
  /*
   * The grid is not always the whole frame: a UEFI console centres 40 rows of
   * 19 in a 768-tall picture and leaves 4 pixels above and below. So scale the
   * frame the reading came from onto the video rectangle, and place the grid
   * inside it at the origin it was read at.
   */
  const scaleX = t.width > 0 ? box.value.width / t.width : box.value.width / (t.cols * t.cellWidth);
  const scaleY =
    t.height > 0 ? box.value.height / t.height : box.value.height / (t.rows * t.cellHeight);
  const cellW = t.cellWidth * scaleX;
  const cellH = t.cellHeight * scaleY;
  /* Size by the cell height, then pull the advance onto the cell width. */
  const fontPx = cellH * 0.82;
  return {
    left: `${box.value.left + t.originX * scaleX}px`,
    top: `${box.value.top + t.originY * scaleY}px`,
    width: `${t.cols * cellW}px`,
    height: `${t.rows * cellH}px`,
    font: `${fontPx}px/${cellH}px ${LAYER_FONT}`,
    letterSpacing: `${cellW - measureAdvance(fontPx)}px`,
  };
});

const noSignal = computed(() => props.status !== null && !props.status.signal);
const showOverlay = computed(
  () => props.paused || failed.value || noSignal.value || codecError.value !== null || !loaded.value,
);
</script>

<template>
  <div class="screen">
    <canvas
      v-show="useWebsocket"
      ref="canvas"
      :class="[
        'screen-img',
        fit === 'fit' ? 'screen-fit' : 'screen-actual',
        { 'screen-engaged': engaged },
      ]"
    />
    <img
      v-if="!DEMO"
      v-show="!useWebsocket"
      ref="img"
      :class="[
        'screen-img',
        fit === 'fit' ? 'screen-fit' : 'screen-actual',
        { 'screen-engaged': engaged },
      ]"
      :src="streamUrl"
      alt="Target screen"
      :draggable="false"
      @load="
        loaded = true;
        codecError = null;
      "
      @error="
        loaded = false;
        failed = true;
      "
    />

    <div
      v-if="textLayer"
      class="screen-text"
      :style="layerStyle"
      aria-label="Screen text, selectable"
    >
      <div v-for="(line, i) in layerRows" :key="i" class="screen-text-line">{{ line }}</div>
    </div>

    <div v-if="!DEMO && showOverlay" class="screen-overlay">
      <div class="screen-message">
        <span class="screen-message-icon">
          <Icon :name="noSignal || failed || codecError ? 'warning' : 'screen'" :size="26" />
        </span>
        <h2 v-if="paused">{{ pauseNote ? "Video paused for the update" : "Video paused" }}</h2>
        <h2 v-else-if="noSignal">No signal</h2>
        <h2 v-else-if="codecError">Cannot play this stream</h2>
        <h2 v-else-if="failed">Stream interrupted</h2>
        <h2 v-else>Waiting for the first frame...</h2>
        <p v-if="paused" class="muted">
          {{
            pauseNote ||
            "The stream is disconnected and the device has stopped encoding. Input still works."
          }}
        </p>
        <p v-else-if="noSignal" class="muted">
          The target is not sending video. It may be powered off, asleep, or its cable unplugged.
        </p>
        <p v-else-if="codecError" class="muted">
          {{ codecError }}. Select the MJPEG codec in Settings -> Video to use this browser.
        </p>
        <p v-else-if="failed" class="muted">Reconnecting...</p>
      </div>
    </div>
  </div>
</template>

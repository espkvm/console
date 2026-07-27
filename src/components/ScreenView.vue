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

import type { VideoStatus } from "../state/device";
import { VideoStream } from "../video/stream";
import Icon from "./Icon.vue";

const props = defineProps<{
  status: VideoStatus | null;
  engaged: boolean;
  engageMode: "click" | "hover";
  fit: "fit" | "actual";
  /** Paused: nothing is read, so the device stops encoding entirely. */
  paused: boolean;
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
  /* Except when the device is encoding H.264, which that endpoint cannot
     carry: retrying it forever would be a loop with a known answer. */
  if (props.status?.codec === "h264") {
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

    <div v-if="!DEMO && showOverlay" class="screen-overlay">
      <div class="screen-message">
        <span class="screen-message-icon">
          <Icon :name="noSignal || failed || codecError ? 'warning' : 'screen'" :size="26" />
        </span>
        <h2 v-if="paused">Video paused</h2>
        <h2 v-else-if="noSignal">No signal</h2>
        <h2 v-else-if="codecError">Cannot play this stream</h2>
        <h2 v-else-if="failed">Stream interrupted</h2>
        <h2 v-else>Waiting for the first frame...</h2>
        <p v-if="paused" class="muted">
          The stream is disconnected and the device has stopped encoding. Input still works.
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

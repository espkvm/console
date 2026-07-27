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
import { computed, onUnmounted, ref, watch } from "vue";

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

/* Demo build only (static site at /demo/): there is no device, so instead of a
   real stream the "screen" is a plain backdrop with a cursor drifting across it,
   just to show the pane is live. Tree-shaken out of the firmware build. */
const DEMO = import.meta.env.MODE === "demo";
let demoRAF = 0;
function startDemoScreen() {
  const el = canvas.value;
  const c = el?.getContext("2d");
  if (!el || !c) return;
  el.width = 1280;
  el.height = 720;
  loaded.value = true;
  failed.value = false;
  const t0 = performance.now();
  const draw = (t: number) => {
    const s = (t - t0) / 1000;
    c.fillStyle = "#0c1a26";
    c.fillRect(0, 0, 1280, 720);
    c.strokeStyle = "rgba(255,255,255,0.05)";
    c.lineWidth = 1;
    for (let x = 0; x <= 1280; x += 64) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 720);
      c.stroke();
    }
    for (let y = 0; y <= 720; y += 64) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(1280, y);
      c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.font = "28px system-ui, sans-serif";
    c.textAlign = "center";
    c.fillText("ESP-KVM demo - simulated screen, no device connected", 640, 360);
    const cx = 640 + Math.cos(s * 0.7) * 420;
    const cy = 380 + Math.sin(s * 1.13) * 230;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx, cy + 22);
    c.lineTo(cx + 6, cy + 16);
    c.lineTo(cx + 13, cy + 24);
    c.lineTo(cx + 17, cy + 21);
    c.lineTo(cx + 10, cy + 13);
    c.lineTo(cx + 18, cy + 12);
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

if (DEMO) startDemoScreen();
else if (!props.paused) startStream();
onUnmounted(() => {
  stream?.stop();
  if (demoRAF) cancelAnimationFrame(demoRAF);
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

    <div v-if="showOverlay" class="screen-overlay">
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

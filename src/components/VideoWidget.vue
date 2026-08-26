<script setup lang="ts">
/*
 * The capture's figures in the status bar, and the rest of them one click down.
 *
 * They are numbers and nothing else - every control for video is in Settings -
 * so they never needed a panel sliding over the very picture they describe. The
 * headline ones are on show; clicking them opens the others where they already
 * are, which is where somebody looks when a figure there bothers them.
 *
 * Only what is about the picture belongs here: whether the device answers at
 * all is a separate matter and stays outside, beside this. Frames skipped as
 * unchanged is a figure for a bad day rather than for the bar, so it waits in
 * the readout with the others.
 *
 * The one control that does belong is how the screen is being shown, because
 * that is what the figures are figures OF: H.264, MJPEG, or the characters read
 * off a text screen. Two of those are a device setting and one is a thing this
 * console does on its own, but from where the operator sits they are three
 * answers to one question, so they sit together.
 */
import { computed, onUnmounted, ref } from "vue";

import type { VideoStatus } from "../state/device";

const props = defineProps<{
  status: VideoStatus | null;
  codec: string;
  /** Reading the screen as characters instead of showing the picture. */
  textView: boolean;
  /** The standing preference: characters whenever the screen is made of them. */
  textPreferred: boolean;
  /** The device says this mode can be read as characters. */
  textAvailable: boolean;
  /** Why H.264 cannot be chosen here, or null when it can. */
  h264Blocked: string | null;
  /** Why there is no video at all - a capture board that never answered. */
  videoBlocked?: string | null;
}>();

const emit = defineEmits<{
  (e: "set-codec", codec: "mjpeg" | "h264"): void;
  (e: "prefer-text", on: boolean): void;
}>();

/* The codec is what the picture is made of. It stays lit while the text view is
   up, because it is still what the device would send the moment the screen
   stops being characters - the two are no longer a single choice of three. */
const showing = computed(() => props.codec);

function pickCodec(codec: "mjpeg" | "h264") {
  if (showing.value === codec) return;
  emit("set-codec", codec);
}

const open = ref(false);
const signal = computed(() => Boolean(props.status?.signal));

/* The status bar scrolls its own contents, so anything absolute inside it is
   cut off at its edge. The readout is therefore fixed and lives at the end of
   the document, placed under the figures it belongs to and nudged back inside
   the window if they sit near the right edge. */
const WIDTH = 300;
const MARGIN = 12;
const trigger = ref<HTMLElement | null>(null);
const at = ref({ left: 0, top: 0 });

function place() {
  const el = trigger.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  at.value = {
    left: Math.max(MARGIN, Math.min(r.left, window.innerWidth - WIDTH - MARGIN)),
    top: r.bottom + 6,
  };
}

function toggle() {
  if (!open.value) place();
  open.value = !open.value;
}

/* Moving the window would leave it pointing at nothing; simplest is to close. */
const onResize = () => (open.value = false);
window.addEventListener("resize", onResize);
onUnmounted(() => window.removeEventListener("resize", onResize));

function rate(kbps: number): string {
  if (kbps <= 0) return "idle";
  if (kbps < 1000) return `${kbps} kbit/s`;
  return `${(kbps / 1000).toFixed(1)} Mbit/s`;
}
</script>

<template>
  <div class="vw">
    <button
      ref="trigger"
      type="button"
      class="vw-trigger"
      :class="{ 'vw-trigger-on': open }"
      title="Capture figures - click for the rest"
      aria-label="Video status"
      :aria-expanded="open"
      @click="toggle"
    >
      <template v-if="status && signal">
        <span class="stat mono">{{ status.width }}x{{ status.height }}</span>
        <!-- Text mode stops the encoder on purpose, so the codec, the frame rate
             and the bit rate all describe something that is deliberately not
             running. Reading "h264 0.0 fps" over a screen of characters looks
             like a fault rather than the saving it is, so say what is on screen
             instead. Which codec is selected still shows in the popup, because
             it is what comes back the moment the screen stops being text. -->
        <span v-if="textView" class="stat mono hide-narrow">text</span>
        <template v-else>
          <span class="stat mono hide-narrow">{{ codec }} {{ status.fps.toFixed(1) }} fps</span>
          <span class="stat mono hide-narrow">{{ rate(status.kbps) }}</span>
          <span v-if="status.encoderBusyPct >= 90" class="stat mono warn">
            encoder {{ status.encoderBusyPct }}%
          </span>
        </template>
      </template>
      <span v-else class="stat" :title="videoBlocked ?? undefined">
        {{ videoBlocked ? "No capture" : "No signal" }}
      </span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="vw-backdrop" @click="open = false" />
      <div
        v-if="open"
        class="vw-popup"
        :style="{ left: at.left + 'px', top: at.top + 'px' }"
      >
        <div class="vw-head">
          <h3>Video</h3>
          <button type="button" class="btn btn-sm btn-quiet" @click="open = false">Close</button>
        </div>

        <div class="vw-modes" role="group" aria-label="How the screen is shown">
          <button
            type="button"
            class="vw-mode"
            :class="{ 'vw-mode-on': showing === 'h264' }"
            :disabled="Boolean(h264Blocked)"
            :title="h264Blocked ?? 'Video as H.264 - smooth, and the lightest on the network'"
            @click="pickCodec('h264')"
          >
            H.264
          </button>
          <button
            type="button"
            class="vw-mode"
            :class="{ 'vw-mode-on': showing === 'mjpeg' }"
            title="Video as MJPEG - every frame a picture, which is what a dashboard or a still can read"
            @click="pickCodec('mjpeg')"
          >
            MJPEG
          </button>
        </div>

        <!-- A tick, not a third mode: a standing preference that follows the
             target through a boot rather than a place the operator has to go
             back to. The line underneath says what is actually on screen right
             now, because the answer changes by itself. -->
        <label class="vw-prefer">
          <input
            type="checkbox"
            :checked="textPreferred"
            @change="emit('prefer-text', ($event.target as HTMLInputElement).checked)"
          />
          <span>
            Text when the screen is text
            <small>
              {{
                textPreferred
                  ? textView
                    ? "Showing characters - a couple of kilobytes a screen, and the encoder is off"
                    : textAvailable
                      ? "This screen reads as text; switching over"
                      : "This screen is a picture, so the video is running"
                  : "Read a BIOS or a boot menu as characters over a link that will not carry video"
              }}
            </small>
          </span>
        </label>

        <dl v-if="status" class="facts">
          <div class="fact">
            <dt>Signal</dt>
            <dd class="mono">{{ status.signal ? "locked" : "absent" }}</dd>
          </div>
          <div class="fact">
            <dt>Mode</dt>
            <dd class="mono">
              {{ status.width }}x{{ status.height }}{{ status.interlaced ? "i" : "p" }}
            </dd>
          </div>
          <div class="fact">
            <dt>Published</dt>
            <dd class="mono">{{ status.fps.toFixed(2) }} fps</dd>
          </div>
          <div class="fact">
            <dt>Skipped as unchanged</dt>
            <dd class="mono">{{ status.skippedFps.toFixed(2) }} fps</dd>
          </div>
          <div class="fact">
            <dt>Bitrate</dt>
            <dd class="mono">{{ rate(status.kbps) }}</dd>
          </div>
          <div class="fact">
            <dt title="Share of wall clock the encoder was busy">Encoder load</dt>
            <dd class="mono" :class="{ warn: status.encoderBusyPct >= 90 }">
              {{ status.encoderBusyPct }}%
            </dd>
          </div>
          <div class="fact">
            <dt title="Mean time one frame took to encode">Encode time</dt>
            <dd class="mono">{{ (status.encodeUs / 1000).toFixed(1) }} ms</dd>
          </div>
          <div class="fact">
            <dt>Mode changes</dt>
            <dd class="mono">{{ status.modeChanges }}</dd>
          </div>
          <div class="fact">
            <dt>Viewers</dt>
            <dd class="mono">{{ status.viewers }}</dd>
          </div>
          <div v-if="(status.flatMs ?? 0) > 0" class="fact">
            <dt title="Nearly every pixel is the same colour, and has been">
              One flat colour for
            </dt>
            <dd class="mono warn">{{ Math.round((status.flatMs ?? 0) / 1000) }} s</dd>
          </div>
          <div class="fact">
            <dt>Bridge SYS_STATUS</dt>
            <dd class="mono">0x{{ status.sysStatus.toString(16) }}</dd>
          </div>
        </dl>
        <p v-else class="muted">No status from the device yet.</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.vw {
  position: relative;
}

/* One row of two, so which one is in force reads at a glance rather than from
   separate buttons that happen to be near each other. */
.vw-modes {
  display: flex;
  gap: 1px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
  background: var(--border);
}

.vw-mode {
  flex: 1;
  padding: 6px 4px;
  border: 0;
  background: var(--bg-raised);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.vw-mode:hover:not(:disabled) {
  background: var(--bg-hover);
}

.vw-mode-on {
  background: var(--accent);
  color: var(--accent-text);
}

/* The tick sits under the codec row and carries its own explanation, so it is
   laid out as a line of text with a box in front rather than a form control. */
.vw-prefer {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 10px;
  font-size: 0.85rem;
  cursor: pointer;
}

.vw-prefer input {
  margin: 2px 0 0;
  flex: none;
}

.vw-prefer small {
  display: block;
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.vw-mode:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* The figures themselves are the button: no border, no chrome, just a hint of
   one under the pointer so it is discoverable without shouting. */
.vw-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: 2px var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.vw-trigger:hover,
.vw-trigger-on {
  border-color: var(--border-strong);
}

.vw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

/* Anchored to the button, opening inward over the stage - the same shape as the
   diagnostics readout, because it is the same kind of thing. */
.vw-popup {
  position: fixed;
  z-index: 41;
  width: 300px;
  max-width: calc(100vw - 24px);
  max-height: 80dvh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-raised);
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
}

.vw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.vw-head h3 {
  margin: 0;
}


</style>

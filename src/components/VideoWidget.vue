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
 */
import { computed, onUnmounted, ref } from "vue";

import type { VideoStatus } from "../state/device";

const props = defineProps<{
  status: VideoStatus | null;
  codec: string;
}>();

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
        <span class="stat mono hide-narrow">{{ codec }} {{ status.fps.toFixed(1) }} fps</span>
        <span class="stat mono hide-narrow">{{ rate(status.kbps) }}</span>
        <span v-if="status.encoderBusyPct >= 90" class="stat mono warn">
          encoder {{ status.encoderBusyPct }}%
        </span>
      </template>
      <span v-else class="stat">No signal</span>
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

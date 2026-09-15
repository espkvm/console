<script setup lang="ts">
/*
 * An upload's speed across its progress, the way a file copy shows it: the
 * filled part grows left to right with the bytes sent, its height is the speed
 * at that point, and a level line marks the speed now. A slow card, a network
 * that dips or a bus that stepped down shows up as a shape, not a number that
 * keeps changing.
 */
import { computed, ref, watch } from "vue";

import { formatBytes } from "../state/device";

const props = defineProps<{
  /** Speed in bytes/s per slice of progress; 0 where nothing is known yet. */
  trace: number[];
  /** 0..1 */
  fraction: number;
  /** Bytes/s now. */
  rate: number;
}>();

const H = 100; /* viewBox height; the SVG stretches to the box */

const n = computed(() => props.trace.length);
/*
 * The scale is a round number above the fastest point, and it only grows:
 * rescaling on every new peak redraws the whole shape and reads as jumping.
 * A new upload (a new trace array) starts it again.
 */
function roundUp(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const top = ref(1);
watch(
  () => props.trace,
  () => (top.value = 1),
);
watch(
  () => Math.max(1, ...props.trace, props.rate) * 1.1,
  (need) => {
    if (need > top.value) top.value = roundUp(need);
  },
  { immediate: true },
);

function y(bps: number) {
  return H - (bps / top.value) * H;
}

/* Known points only, left to right; a gap is bridged by the next known one. */
const points = computed(() => {
  const out: [number, number][] = [];
  props.trace.forEach((v, i) => {
    if (v > 0) out.push([i + 0.5, y(v)]);
  });
  return out;
});

const line = computed(() => points.value.map(([px, py]) => `${px},${py}`).join(" "));
const area = computed(() => {
  const p = points.value;
  if (!p.length) return "";
  return (
    `M${p[0][0]},${H} ` +
    p.map(([px, py]) => `L${px},${py}`).join(" ") +
    ` L${p[p.length - 1][0]},${H} Z`
  );
});

const done = computed(() => Math.min(1, Math.max(0, props.fraction)) * n.value);
const rateY = computed(() => (props.rate > 0 ? (y(props.rate) / H) * 100 : 100));

const pct = computed(() => Math.round(props.fraction * 100));

/* Hover: the slice under the pointer, if it has a speed. */
const hover = ref<number | null>(null);
function onMove(e: PointerEvent) {
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const i = Math.floor(((e.clientX - box.left) / box.width) * n.value);
  hover.value = i >= 0 && i < n.value && props.trace[i] > 0 ? i : null;
}
const hoverLeft = computed(() =>
  hover.value === null ? 0 : ((hover.value + 0.5) / n.value) * 100,
);
</script>

<template>
  <div
    class="upload-chart"
    role="progressbar"
    :aria-valuenow="pct"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="`Uploaded ${pct}%, ${formatBytes(rate)}/s`"
    @pointermove="onMove"
    @pointerleave="hover = null"
  >
    <svg :viewBox="`0 0 ${n} ${H}`" preserveAspectRatio="none" aria-hidden="true">
      <rect class="upload-chart-done" x="0" y="0" :width="done" :height="H" />
      <path class="upload-chart-area" :d="area" />
      <polyline class="upload-chart-line" :points="line" vector-effect="non-scaling-stroke" />
    </svg>
    <div
      v-if="rate > 0"
      class="upload-chart-level"
      :class="{ 'upload-chart-level-high': rateY < 35 }"
      :style="{ top: rateY + '%' }"
    >
      <span>{{ formatBytes(rate) }}/s</span>
    </div>
    <template v-if="hover !== null">
      <div class="upload-chart-cross" :style="{ left: hoverLeft + '%' }"></div>
      <div
        class="upload-chart-tip"
        :class="{ 'upload-chart-tip-left': hoverLeft > 60 }"
        :style="{ left: hoverLeft + '%' }"
      >
        {{ Math.round(((hover + 0.5) / trace.length) * 100) }}% · {{ formatBytes(trace[hover]) }}/s
      </div>
    </template>
  </div>
</template>

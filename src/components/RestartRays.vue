<script setup lang="ts">
/*
 * Progress, drawn the way the idle screen draws itself.
 *
 * Same language as the demo background: points drifting in the dark, and a ray
 * to any of them that comes near. Here the centre is fixed and the rays are the
 * measure - they fill the circle clockwise as the step advances, so a finished
 * step is a complete fan rather than a bar that ran out of bar.
 *
 * Where there is nothing to measure - the device writing flash, the device
 * restarting - the fan fills against how long that normally takes, and once
 * that is spent it becomes a slow sweep instead of sitting at full and lying.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    /** 0..1 through the current step. */
    fraction: number;
    /** Past the expected time: circle, do not fill. */
    sweep: boolean;
    size?: number;
  }>(),
  { size: 168 },
);

const canvas = ref<HTMLCanvasElement | null>(null);
let raf = 0;
let still = false;

interface Dot {
  /** Where it sits, in polar coordinates about the centre. */
  a: number;
  r: number;
  /** How fast it drifts around, and how far it bobs in and out. */
  da: number;
  bob: number;
  phase: number;
}

const dots: Dot[] = [];

function seed() {
  dots.length = 0;
  for (let i = 0; i < 46; i++) {
    dots.push({
      a: Math.random() * Math.PI * 2,
      r: 0.28 + Math.random() * 0.68,
      da: (Math.random() - 0.5) * 0.12,
      bob: 0.01 + Math.random() * 0.04,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

/** Distance from an angle to the lit arc, 0 inside it. */
function outside(a: number, from: number, to: number): number {
  const norm = (x: number) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const d = norm(a - from);
  const span = norm(to - from);
  if (d <= span) return 0;
  return Math.min(d - span, Math.PI * 2 - d);
}

function draw(t: number) {
  const el = canvas.value;
  if (!el) return;
  const c = el.getContext("2d");
  if (!c) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const S = props.size;
  if (el.width !== S * dpr) {
    el.width = S * dpr;
    el.height = S * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - 10;
  const secs = t / 1000;

  c.clearRect(0, 0, S, S);

  /* The lit arc: from the top, clockwise, as far as the step has got. Once the
     step is over its usual time, a window sweeps round instead. */
  const TOP = -Math.PI / 2;
  const from = props.sweep ? TOP + secs * 1.4 : TOP;
  const to = props.sweep
    ? from + Math.PI * 0.45
    : TOP + Math.min(1, Math.max(0, props.fraction)) * Math.PI * 2;

  const glow = c.createRadialGradient(cx, cy, 0, cx, cy, R);
  glow.addColorStop(0, "rgba(76,154,255,0.22)");
  glow.addColorStop(1, "rgba(76,154,255,0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, S, S);

  for (const d of dots) {
    const a = still ? d.a : d.a + d.da * secs;
    const r = (d.r + (still ? 0 : Math.sin(secs * 0.9 + d.phase) * d.bob)) * R;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;

    /* Fade the ray in over the last few degrees rather than snapping it on -
       the arc should look like it is reaching the point, not switching it. */
    const off = outside(a, from, to);
    const lit = off === 0 ? 1 : Math.max(0, 1 - off / 0.35);

    c.beginPath();
    c.arc(x, y, 1 + lit * 1.8, 0, Math.PI * 2);
    c.fillStyle = `rgba(150,190,230,${0.12 + lit * 0.7})`;
    c.fill();

    if (lit > 0) {
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(x, y);
      c.strokeStyle = `rgba(76,154,255,${lit * 0.42})`;
      c.lineWidth = 1;
      c.stroke();
    }
  }

  c.beginPath();
  c.arc(cx, cy, 3.5, 0, Math.PI * 2);
  c.fillStyle = "rgba(210,230,255,0.95)";
  c.fill();

  if (!still) raf = requestAnimationFrame(draw);
}

onMounted(() => {
  seed();
  still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  raf = requestAnimationFrame(draw);
});

/* Standing still, the picture still has to follow the progress it shows. */
watch(
  () => [props.fraction, props.sweep],
  () => {
    if (still) draw(performance.now());
  },
);

onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <canvas
    ref="canvas"
    class="rays"
    :style="{ width: size + 'px', height: size + 'px' }"
    aria-hidden="true"
  ></canvas>
</template>

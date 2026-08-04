<script setup lang="ts">
/*
 * Icons are inline SVG paths, not a font or a sprite fetched at runtime: the
 * device serves one embedded file and cannot reach a CDN. Every shape is a
 * path so the template stays a single loop.
 *
 * They are drawn to the Feather / Lucide conventions - 24x24 box, 2px stroke,
 * round caps and joins - which is also why several of them came out close to
 * those sets. Both are permissively licensed; the attribution is in NOTICE.
 */
const PATHS = {
  screen: [
    "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M8 21h8M12 17v4",
  ],
  keyboard: [
    "M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
    "M6 11h.01M10 11h.01M14 11h.01M18 11h.01M8 15h8",
  ],
  disc: [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  ],
  power: ["M12 3v9", "M18.4 6.6a9 9 0 1 1-12.8 0"],
  settings: [
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ],
  fullscreen: [
    "M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4",
  ],
  close: ["M6 6l12 12M18 6L6 18"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v5M12 8h.01"],
  warning: [
    "M10.3 4.3 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z",
    "M12 9v4M12 17h.01",
  ],
  sun: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  ],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  hdmi: [
    "M5 7h14a1.5 1.5 0 0 1 1.5 1.5v3.5l-2.5 3H6l-2.5-3V8.5A1.5 1.5 0 0 1 5 7z",
    "M8 11.8h8",
  ],
  usb: [
    "M6.5 8h11v9.5a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2z",
    "M9 2h6v6H9z",
    "M10 3.8h1.7v2.4h-1.7z",
    "M12.3 3.8h1.7v2.4h-1.7z",
  ],
  sd: [
    "M7 3h8l2 2v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-5h1v-2H6V4a1 1 0 0 1 1-1z",
    "M8.4 4.5v2M10.6 4.5v2M12.8 4.5v2M15 4.5v2",
  ],
  ethernet: [
    "M3.5 4.5h17a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18V6a1.5 1.5 0 0 1 1.5-1.5z",
    "M6 7.5h12v6h-2v2h-3v2h-2v-2H8v-2H6z",
    "M8 9.5v2.5M10.7 9.5v2.5M13.3 9.5v2.5M16 9.5v2.5",
  ],
  /* Shield with a check: the Tailscale / VPN membership. */
  vpn: [
    "M12 3l7 3v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z",
    "M9 12l2 2 4-4",
  ],
  /* Broadcast/telemetry: a centre dot with two pairs of concentric arcs. */
  mqtt: [
    "M4.9 16.1a7 7 0 0 1 0-8.2",
    "M8.4 13.6a3 3 0 0 1 0-3.2",
    "M19.1 7.9a7 7 0 0 1 0 8.2",
    "M15.6 10.4a3 3 0 0 1 0 3.2",
    "M12 12h.01",
  ],
  /* Media transport for the stream Pause/Resume control. */
  pause: ["M9 4v16", "M15 4v16"],
  play: ["M7 4l13 8-13 8z"],
  /* Mouse cursor: the "who has control" indicator. */
  pointer: ["M4 3l7.1 17 2.5-7.4 7.4-2.5z"],
} as const;

defineProps<{ name: keyof typeof PATHS; size?: number }>();
</script>

<template>
  <svg
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, i) in PATHS[name]" :key="i" :d="d" />
  </svg>
</template>

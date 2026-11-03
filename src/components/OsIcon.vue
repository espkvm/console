<script setup lang="ts">
/*
 * A small monochrome mark for the detected target OS. Inline SVG so the console
 * stays self-contained (no external icons); drawn in currentColor. These are
 * generic family marks used only to label which OS the target looks like.
 */
defineProps<{ os: string }>();
</script>

<template>
  <!-- Windows: four panes -->
  <svg v-if="os === 'windows'" class="os-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="0.5" />
    <rect x="13" y="3" width="8" height="8" rx="0.5" />
    <rect x="3" y="13" width="8" height="8" rx="0.5" />
    <rect x="13" y="13" width="8" height="8" rx="0.5" />
  </svg>

  <!-- macOS: apple -->
  <svg v-else-if="os === 'macos'" class="os-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.6 12.7c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.6 2.2-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.2 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.6 1.1 0 1.8-1 2.5-2 .8-1.2 1.1-2.3 1.1-2.4-.1 0-2.1-.8-2.1-3.2z" />
    <path d="M15.4 6.2c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z" />
  </svg>

  <!-- Linux: penguin -->
  <svg v-else-if="os === 'linux'" class="os-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.8c-2.3 0-3.5 1.8-3.5 4.3 0 1.5-.2 2.4-1 3.6-1.1 1.7-2 3.5-2 5.3 0 2.6 2.9 3.8 6.5 3.8s6.5-1.2 6.5-3.8c0-1.8-.9-3.6-2-5.3-.8-1.2-1-2.1-1-3.6 0-2.5-1.2-4.3-3.5-4.3z" fill="#1b1f24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    <ellipse cx="12" cy="15.6" rx="3.3" ry="3.6" fill="#f4f4f4" />
    <ellipse cx="10.7" cy="7.2" rx="0.95" ry="1.15" fill="#fff" />
    <ellipse cx="13.3" cy="7.2" rx="0.95" ry="1.15" fill="#fff" />
    <circle cx="10.9" cy="7.4" r="0.45" fill="#1b1f24" />
    <circle cx="13.1" cy="7.4" r="0.45" fill="#1b1f24" />
    <path d="M10.3 9.3q1.7-.9 3.4 0-1.7 1.5-3.4 0z" fill="#f2b632" />
    <ellipse cx="8.8" cy="20" rx="2.6" ry="1.2" fill="#f2b632" />
    <ellipse cx="15.2" cy="20" rx="2.6" ry="1.2" fill="#f2b632" />
  </svg>

  <!-- Android: robot head -->
  <svg v-else-if="os === 'android'" class="os-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <path d="M6 12a6 6 0 0 1 12 0v6H6z" fill="currentColor" stroke="none" />
    <line x1="8" y1="5.5" x2="9.5" y2="8" />
    <line x1="16" y1="5.5" x2="14.5" y2="8" />
    <circle cx="9.6" cy="11.5" r="0.9" fill="var(--bg-raised, #161b22)" stroke="none" />
    <circle cx="14.4" cy="11.5" r="0.9" fill="var(--bg-raised, #161b22)" stroke="none" />
  </svg>

  <!-- Nintendo Switch: its logo, two Joy-Con, the left one outlined -->
  <svg v-else-if="os === 'switch'" class="os-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      d="M8.6 3.7H10.55V20.3H8.6A4.4 4.4 0 0 1 4.2 15.9V8.1A4.4 4.4 0 0 1 8.6 3.7z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
    />
    <circle cx="7.4" cy="8.4" r="1.35" />
    <path d="M12.75 3H15.4A5.1 5.1 0 0 1 20.5 8.1V15.9A5.1 5.1 0 0 1 15.4 21H12.75z" />
    <circle cx="16.6" cy="13.4" r="1.5" fill="var(--bg-raised, #161b22)" />
  </svg>

  <!-- Steam Deck: a half ring around a dot -->
  <svg v-else-if="os === 'steamdeck'" class="os-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M14.75 3.5a8.5 8.5 0 0 0 0 17" fill="none" stroke="currentColor" stroke-width="3" />
    <circle cx="14.75" cy="12" r="4.6" />
  </svg>

  <!-- unknown: a plain monitor -->
  <svg v-else class="os-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M9 20h6M12 16v4" />
  </svg>
</template>

<style scoped>
.os-icon {
  width: 1.1em;
  height: 1.1em;
  display: inline-block;
  vertical-align: -0.15em;
}
</style>

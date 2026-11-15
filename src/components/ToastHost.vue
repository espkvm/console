<script setup lang="ts">
/*
 * alert() blocks the page, and a blocked page cannot forward a keystroke or
 * release a held modifier - on a remote console that is worse than the message
 * being missed. Errors stay until dismissed; confirmations fade.
 */
import { toasts, dismissToast } from "../state/toasts";
import Icon from "./Icon.vue";

/* The time of day, with the date too when it was not today. */
function when(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.kind}`]">
      <span class="toast-icon">
        <Icon :name="t.kind === 'error' ? 'warning' : 'info'" :size="15" />
      </span>
      <span class="toast-text">
        {{ t.text }}
        <span class="toast-meta">
          <time :datetime="new Date(t.at).toISOString()">{{ when(t.at) }}</time>
          <template v-if="t.count > 1"> · {{ t.count }} times</template>
        </span>
      </span>
      <button type="button" class="toast-close" aria-label="Dismiss" @click="dismissToast(t.id)">
        <Icon name="close" :size="13" />
      </button>
    </div>
  </div>
</template>

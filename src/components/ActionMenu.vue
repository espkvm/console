<script setup lang="ts">
/*
 * A bar button that opens a short list of related actions above it, with
 * words: screenshot, clip and record under one button instead of three icons
 * nobody can tell apart. A click on an item runs it and closes the list.
 */
import { onBeforeUnmount, ref, watch } from "vue";
import Icon from "./Icon.vue";

type IconName = InstanceType<typeof Icon>["$props"]["name"];

const props = defineProps<{
  icon: string;
  label: string;
  /** Shown on the button itself, next to the icon (a recording's clock). */
  badge?: string;
  /** Red, as a running recording. */
  alert?: boolean;
  /** Lit, as a mode that is on (selecting text). */
  on?: boolean;
  disabled?: boolean;
  title?: string;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function onDoc(e: Event) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}
watch(open, (on) => {
  if (on) {
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
  } else {
    document.removeEventListener("pointerdown", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
  }
});
watch(
  () => props.disabled,
  (d) => {
    if (d) open.value = false;
  },
);
onBeforeUnmount(() => (open.value = false));
</script>

<template>
  <div ref="root" class="am">
    <button
      type="button"
      :class="['btn', 'btn-sm', badge ? '' : 'btn-icon', { 'btn-on': open || on, 'rec-on': alert }]"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="title ?? label"
      :disabled="disabled"
      @click="open = !open"
    >
      <Icon :name="icon as IconName" :size="15" />
      <span v-if="badge" class="mono">{{ badge }}</span>
    </button>
    <div v-if="open" class="am-list" role="menu" @click="open = false">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.am {
  position: relative;
  display: inline-flex;
}

.am-list {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  min-width: 210px;
  padding: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-raised);
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
}

.am-list :deep(.am-item) {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 34px;
  padding: 0 var(--space-3);
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}

.am-list :deep(.am-item:hover:not(:disabled)) {
  background: var(--bg-hover);
}

.am-list :deep(.am-item:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}

.am-list :deep(.am-item.rec-on) {
  color: var(--danger, #f85149);
}

.am-list :deep(.am-note) {
  padding: var(--space-1) var(--space-3) var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-xs, 12px);
  white-space: normal;
  max-width: 260px;
}
</style>

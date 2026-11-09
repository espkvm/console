<script setup lang="ts">
/*
 * Ctrl+Shift+P (or Ctrl+K, which Firefox leaves to the page): type a few
 * letters of what you want, Enter does it. The list comes from App.vue, so it
 * holds only what this device and this sign-in can do.
 */
import Keys from "./Keys.vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import Icon from "./Icon.vue";
import { findCommands, remember, type Command } from "../ui/commands";

const props = defineProps<{ commands: Command[] }>();
const emit = defineEmits<{ close: [] }>();

const RECENT_KEY = "espkvm:palette-recent";
function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const query = ref("");
const active = ref(0);
const recent = ref(loadRecent());
const box = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const shown = computed(() => findCommands(props.commands, query.value, recent.value));
const recentIds = computed(() => (query.value.trim() ? new Set<string>() : new Set(recent.value)));

watch(query, () => (active.value = 0));
watch(active, async () => {
  await nextTick();
  listEl.value?.querySelector(".cp-on")?.scrollIntoView({ block: "nearest" });
});
onMounted(() => box.value?.focus());

function run(c: Command | undefined) {
  if (!c) return;
  recent.value = remember(recent.value, c.id);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
  } catch {
    /* nothing to remember it with */
  }
  emit("close");
  /* After the palette is gone, so a command that opens a window or asks
     confirm() is not fighting it for the focus. */
  void nextTick(() => c.run());
}

function onKey(e: KeyboardEvent) {
  const n = shown.value.length;
  if (e.key === "ArrowDown") {
    active.value = n ? (active.value + 1) % n : 0;
  } else if (e.key === "ArrowUp") {
    active.value = n ? (active.value - 1 + n) % n : 0;
  } else if (e.key === "Enter") {
    run(shown.value[active.value]);
  } else if (e.key === "Escape") {
    emit("close");
  } else return;
  e.preventDefault();
  e.stopPropagation();
}
</script>

<template>
  <div class="cp-backdrop" @click.self="emit('close')">
    <section class="cp" role="dialog" aria-label="Commands">
      <div class="cp-search">
        <Icon name="search" :size="16" />
        <input
          ref="box"
          v-model="query"
          type="text"
          placeholder="Type a command: screenshot, serial, ctrl+alt+del..."
          aria-label="Command"
          aria-controls="cp-list"
          :aria-activedescendant="shown.length ? `cp-${active}` : undefined"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKey"
        />
      </div>
      <ul id="cp-list" ref="listEl" class="cp-list" role="listbox">
        <li
          v-for="(c, i) in shown"
          :id="`cp-${i}`"
          :key="c.id"
          role="option"
          :aria-selected="i === active"
          :class="['cp-item', { 'cp-on': i === active }]"
          @mousemove="active = i"
          @click="run(c)"
        >
          <span class="cp-title">{{ c.title }}</span>
          <span class="cp-meta">
            <span v-if="recentIds.has(c.id)" class="cp-group">Recent</span>
            <span v-else class="cp-group">{{ c.group }}</span>
            <Keys v-if="c.hint" :combo="c.hint" />
          </span>
        </li>
        <li v-if="!shown.length" class="cp-none">Nothing matches "{{ query }}".</li>
      </ul>
      <p class="cp-foot"><Keys combo="↑" /> <Keys combo="↓" /> to choose, <Keys combo="Enter" /> to run, <Keys combo="Esc" /> to close.</p>
    </section>
  </div>
</template>

<style scoped>
.cp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh var(--space-3) var(--space-3);
  background: rgb(0 0 0 / 45%);
}

.cp {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: 70vh;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, var(--radius));
  background: var(--bg-raised);
  box-shadow: var(--shadow, 0 12px 32px rgba(0, 0, 0, 0.45));
  overflow: hidden;
}

.cp-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
}

.cp-search input {
  flex: 1;
  min-width: 0;
  height: 46px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-md, 15px);
}

.cp-list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: var(--space-1);
  overflow-y: auto;
  list-style: none;
}

.cp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 34px;
  padding: 0 var(--space-3);
  border-radius: var(--radius);
  color: var(--text);
  font-size: var(--text-sm);
  cursor: pointer;
}

.cp-on {
  background: var(--bg-hover);
}

.cp-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}

.cp-group {
  color: var(--text-muted);
  font-size: var(--text-xs, 12px);
}

.cp-none {
  padding: var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.cp-foot {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--text-xs, 12px);
}
</style>

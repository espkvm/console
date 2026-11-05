<script setup lang="ts">
/*
 * The console's keyboard shortcuts on one card, opened with "?". The letters
 * work while the target does not have control; with control every key goes to
 * the target, and Esc is the way back.
 */
import Icon from "./Icon.vue";

const props = defineProps<{ keyLock: boolean; watchOnly?: boolean }>();

/* Keyboard Lock: Chrome and Edge only. */
const lockable = !!(navigator as Navigator & { keyboard?: { lock?: unknown } }).keyboard?.lock;
const emit = defineEmits<{ close: [] }>();

const CONSOLE: [string, string][] = [
  ["F", "Full screen on or off"],
  ["P", "The picture in a small window on top (Chrome, Edge)"],
  ["I", "Input: key combinations, macros, paste"],
  ["M", "Virtual media"],
  ["A", "Automation"],
  ["R", "Recordings and screenshots"],
  ["?", "This list"],
];
/* A view-only sign-in has no Input, media or automation. */
const WATCH_ONLY = new Set(["I", "M", "A"]);
const list = props.watchOnly ? CONSOLE.filter(([k]) => !WATCH_ONLY.has(k)) : CONSOLE;
</script>

<template>
  <div class="sh-backdrop" @click.self="emit('close')">
    <section class="sh" role="dialog" aria-labelledby="sh-title">
      <header class="sh-head">
        <h2 id="sh-title">Keyboard shortcuts</h2>
        <button type="button" class="icon-btn" aria-label="Close" title="Close" @click="emit('close')">
          <Icon name="close" :size="15" />
        </button>
      </header>

      <h3 v-if="!watchOnly">While you do not have control</h3>
      <dl class="sh-list">
        <template v-for="[k, what] in list" :key="k">
          <dt><kbd>{{ k }}</kbd></dt>
          <dd>{{ what }}</dd>
        </template>
      </dl>

      <template v-if="!watchOnly">
      <h3>While you have control</h3>
      <dl class="sh-list">
        <dt><kbd>Esc</kbd></dt>
        <dd>Gives control back. To send Esc to the target, use Input -> Esc.</dd>
        <dt><kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Del</kbd></dt>
        <dd>Windows on your own computer takes it. Use Input -> Ctrl+Alt+Del.</dd>
        <dt><kbd>Alt+Tab</kbd> <kbd>Win</kbd></dt>
        <dd v-if="!lockable">This browser keeps them. Chrome and Edge can pass them in full screen. Or use Input.</dd>
        <dd v-else-if="keyLock">Go to the target in full screen, since All keys is on.</dd>
        <dd v-else>Stay with this computer. Turn on All keys in the bottom bar and go full screen, or use Input.</dd>
      </dl>
      </template>
    </section>
  </div>
</template>

<style scoped>
.sh-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: var(--space-3);
  background: rgb(0 0 0 / 45%);
}

.sh {
  width: min(520px, 100%);
  max-height: calc(100vh - 2 * var(--space-3));
  overflow-y: auto;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-overlay);
  color: var(--text);
  box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
}

.sh-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.sh-head h2 {
  margin: 0;
  font-size: var(--text-lg, 1.125rem);
}

.sh h3 {
  margin: var(--space-3) 0 var(--space-1);
  color: var(--text-muted);
  font-size: var(--text-xs, 0.75rem);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sh-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
}

.sh-list dt {
  white-space: nowrap;
}

.sh-list dd {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

kbd {
  display: inline-block;
  min-width: 1.6em;
  padding: 0 5px;
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: var(--text-xs, 0.75rem);
  text-align: center;
}
</style>

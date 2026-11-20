<script setup lang="ts">
/*
 * The console's keyboard shortcuts on one card, opened with "?". The letters
 * work while the target does not have control; with control every key goes to
 * the target, and Esc is the way back.
 */
import Keys from "./Keys.vue";
import KeyText from "./KeyText.vue";
import Icon from "./Icon.vue";
import { t, tm } from "../i18n";

const props = defineProps<{ keyLock: boolean; watchOnly?: boolean }>();

/* Keyboard Lock: Chrome and Edge only. */
const lockable = !!(navigator as Navigator & { keyboard?: { lock?: unknown } }).keyboard?.lock;
const emit = defineEmits<{ close: [] }>();

const CONSOLE: [string, string][] = [
  ["F", tm("Full screen on or off")],
  ["P", tm("The picture in a small window on top (Chrome, Edge)")],
  ["I", tm("Input: key combinations, macros, paste")],
  ["M", tm("Virtual media")],
  ["A", tm("Automation")],
  ["R", tm("Recordings and screenshots")],
  ["Ctrl+K", tm("Commands: find any action by name. [[Ctrl+Shift+P]] works too.")],
  ["?", tm("This list")],
];
/* A view-only sign-in has no Input, media or automation. */
const WATCH_ONLY = new Set(["I", "M", "A"]);
const list = props.watchOnly ? CONSOLE.filter(([k]) => !WATCH_ONLY.has(k)) : CONSOLE;
</script>

<template>
  <div class="sh-backdrop" @click.self="emit('close')">
    <section class="sh" role="dialog" aria-labelledby="sh-title">
      <header class="sh-head">
        <h2 id="sh-title">{{ t("Keyboard shortcuts") }}</h2>
        <button type="button" class="icon-btn" :aria-label="t('Close')" :title="t('Close')" @click="emit('close')">
          <Icon name="close" :size="15" />
        </button>
      </header>

      <h3 v-if="!watchOnly">{{ t("While you do not have control") }}</h3>
      <dl class="sh-list">
        <template v-for="[k, what] in list" :key="k">
          <dt><Keys :combo="k" /></dt>
          <dd><KeyText :text="t(what)" /></dd>
        </template>
      </dl>

      <template v-if="!watchOnly">
      <h3>{{ t("While you have control") }}</h3>
      <dl class="sh-list">
        <dt><Keys combo="Esc" /></dt>
        <dd v-if="lockable && keyLock">{{ t("Gives control back. In full screen it goes to the target, and holding it leaves full screen and gives control back.") }}</dd>
        <dd v-else><KeyText :text="t('Gives control back. To send [[Esc]] to the target, use Input -> Esc.')" /></dd>
        <dt><Keys combo="Ctrl+Alt+Del" /></dt>
        <dd>{{ t("Windows on your own computer takes it. Use Input -> Ctrl+Alt+Del.") }}</dd>
        <dt><Keys combo="Alt+Tab" /> <Keys combo="Win" /></dt>
        <dd v-if="!lockable">{{ t("This browser keeps them. Chrome and Edge can pass them in full screen. Or use Input.") }}</dd>
        <dd v-else-if="keyLock">{{ t("Go to the target in full screen, since the keyboard lock in the bottom bar is on.") }}</dd>
        <dd v-else>{{ t("Stay with this computer. Turn on the keyboard lock in the bottom bar and go full screen, or use Input.") }}</dd>
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
</style>

<script setup lang="ts">
/*
 * Mask settings drawn as one table: a row per bit, a column per setting. The
 * notifications use it for what goes where - a row per kind of event, a column
 * per channel - but nothing here knows that: the rows are the settings'
 * choices, and the columns their titles. A parent that can try a column out
 * (send a test to that channel) passes test(), and each ready column gets a
 * button for it.
 */
import { computed, nextTick, ref } from "vue";
import { choiceLabel, type Setting } from "../state/device";

const props = defineProps<{
  columns: Setting[];
  values: Record<string, number | string | boolean>;
  /** Per column key, whether what it stands for is set up. Missing = unknown. */
  ready?: Record<string, boolean> | null;
  disabled?: boolean;
  /** Saves one value; resolves once the parent has the result. */
  save: (key: string, value: number) => Promise<void>;
  /** Tries one column out; resolves to a short word for under the button. */
  test?: (key: string) => Promise<string>;
}>();

const testing = ref("");
const tested = ref<Record<string, string>>({});
async function runTest(key: string) {
  if (!props.test) return;
  testing.value = key;
  try {
    tested.value = { ...tested.value, [key]: await props.test(key) };
  } catch (e) {
    tested.value = { ...tested.value, [key]: (e as Error).message };
  } finally {
    testing.value = "";
  }
}

/* The rows come from the first column: the columns of one table share them. */
const rows = computed(() => (props.columns[0]?.choices ?? []).map((_, i) => i));

function mask(key: string): number {
  return Number(props.values[key] ?? 0) | 0;
}

function on(key: string, bit: number): boolean {
  return ((mask(key) >> bit) & 1) === 1;
}

async function flip(key: string, bit: number, e: Event) {
  const box = e.target as HTMLInputElement;
  const next = box.checked ? mask(key) | (1 << bit) : mask(key) & ~(1 << bit);
  await props.save(key, next);
  /* A failed save leaves the value as it was, and Vue does not touch a box
     whose bound value did not change: put it back by hand. */
  await nextTick();
  box.checked = on(key, bit);
}
</script>

<template>
  <div class="mask-table-wrap">
    <table class="mask-table">
      <thead>
        <tr>
          <th scope="col" class="mask-table-corner"><span class="sr-only">What</span></th>
          <th v-for="c in columns" :key="c.key" scope="col" :title="c.help">
            {{ c.title }}
            <span v-if="ready && ready[c.key] === false" class="mask-table-off">not set up</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="bit in rows" :key="bit">
          <th scope="row">{{ choiceLabel(columns[0], bit) }}</th>
          <td v-for="c in columns" :key="c.key">
            <input
              type="checkbox"
              :checked="on(c.key, bit)"
              :disabled="disabled"
              :aria-label="`${choiceLabel(columns[0], bit)} to ${c.title}`"
              @change="flip(c.key, bit, $event)"
            />
          </td>
        </tr>
        <tr v-if="test" class="mask-table-test">
          <th scope="row"><span class="sr-only">Try it</span></th>
          <td v-for="c in columns" :key="c.key">
            <button
              v-if="ready && ready[c.key]"
              type="button"
              class="btn btn-sm"
              :disabled="disabled || !!testing"
              :aria-label="`Send a test to ${c.title}`"
              @click="runTest(c.key)"
            >
              {{ testing === c.key ? "Sending..." : "Test" }}
            </button>
            <span v-if="tested[c.key]" class="mask-table-off">{{ tested[c.key] }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-for="c in columns.filter((x) => x.help)" :key="c.key" class="setting-note">
      <b>{{ c.title }}:</b> {{ c.help }}
    </p>
  </div>
</template>

<style scoped>
.mask-table-wrap {
  overflow-x: auto;
  margin-bottom: var(--space-3, 12px);
}
.mask-table {
  border-collapse: collapse;
  width: 100%;
}
.mask-table th,
.mask-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border, rgba(127, 127, 127, 0.25));
}
.mask-table thead th {
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}
.mask-table thead th.mask-table-corner,
.mask-table tbody th {
  font-weight: normal;
  text-align: left;
}
.mask-table td {
  text-align: center;
}
.mask-table input {
  width: 18px;
  height: 18px;
}
.mask-table-test td,
.mask-table-test th {
  border-bottom: none;
}
.mask-table-off {
  display: block;
  font-weight: normal;
  font-size: 0.8em;
  opacity: 0.7;
}
</style>

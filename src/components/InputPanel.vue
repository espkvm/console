<script setup lang="ts">
/*
 * Everything the operator's own browser will not pass through.
 *
 * Ctrl+Alt+Del, Alt+Tab and the Meta key are swallowed by the local OS long
 * before the page sees them, so a remote console has to offer them as buttons.
 * Pasting is the same problem in reverse: the clipboard holds characters, but
 * a KVM can only send key positions, so the text is translated through the
 * layout the target is known to have active.
 */
import FoldNote from "./FoldNote.vue";
import { computed, ref } from "vue";

import { macrosForOs, macroLabel, type Macro } from "../macros";
import { loadRunbooks } from "../runbookScript";
import {
  keyProblem,
  parseQuick,
  QUICK_MAX,
  quickLabel,
  sameQuick,
  sendBuiltin,
  serializeQuick,
  type QuickItem,
  type QuickKind,
} from "../state/quick";
import { charToHid, untypeableChars, DEFAULT_LAYOUT } from "../layouts";
import {
  runMacroScript,
  parseMacroScript,
  loadMacros,
  serializeMacros,
  type Macro as UserMacro,
} from "../macroScript";
import type { Control } from "../input/control";
import { enumName, saveSettings, type Setting, type Values } from "../state/device";
import { toast } from "../state/toasts";

const props = defineProps<{
  control: Control;
  schema: Setting[];
  values: Values;
  attached: boolean;
  /** OS guessed from USB enumeration; "auto" resolves to this. */
  detectedOs: string;
}>();

const emit = defineEmits<{ (e: "values", v: Values): void }>();

const layout = computed(() => enumName(props.schema, props.values, "kbd_layout") ?? DEFAULT_LAYOUT);
const typeDelay = computed(() => Math.max(1, Number(props.values.type_delay) || 8));
const pasting = ref(false);
const macroBusy = ref(false);

/* The OS whose conventions the panel follows: the manual setting, or the
   detected one when that setting is left on "auto". */
const effectiveOs = computed(() => {
  const choice = enumName(props.schema, props.values, "target_os") ?? "auto";
  return choice === "auto" ? props.detectedOs || "unknown" : choice;
});

const macros = computed(() => macrosForOs(effectiveOs.value));
const labelFor = (m: Macro) => macroLabel(m, effectiveOs.value);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendMacro(m: Macro) {
  if (macroBusy.value) return;
  macroBusy.value = true;
  try {
    await sendBuiltin(props.control, m, effectiveOs.value);
  } finally {
    macroBusy.value = false;
  }
}

/* The manual escape hatch: one message that clears keyboard, both mouse
   reports and the consumer control on the device at once. */
function releaseAll() {
  props.control.releaseAll();
}

async function paste() {
  if (!navigator.clipboard?.readText) {
    toast.error("Clipboard access needs HTTPS. Type the text in the box below instead.");
    return;
  }
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    toast.error("Clipboard read was denied. Type the text in the box below instead.");
    return;
  }
  await typeText(text);
}

/* Text typed into the box here, for when the clipboard cannot be read. */
const draft = ref("");

async function typeDraft() {
  if (await typeText(draft.value)) draft.value = "";
}

/* Progress of the text being typed, and a way to stop a long one half way. */
const typed = ref(0);
const typeTotal = ref(0);
let stopTyping = false;

function stop() {
  stopTyping = true;
}

/** Type @p text on the target. True when all of it went. */
async function typeText(text: string): Promise<boolean> {
  text = text.replace(/\r/g, "");
  if (!text || pasting.value) return false;

  /* Silently dropping characters would leave the operator believing the paste
     succeeded. Name the ones this layout cannot produce. */
  const missing = untypeableChars(layout.value, text) as string[];
  if (missing.length) {
    toast.error(`Layout ${layout.value} cannot type: ${missing.slice(0, 12).join(" ")}`);
  }

  const chars = [...text];
  pasting.value = true;
  stopTyping = false;
  typed.value = 0;
  typeTotal.value = chars.length;
  try {
    for (const ch of chars) {
      if (stopTyping) break;
      typed.value++;
      const row = charToHid(layout.value, ch) as { mod: number; hid: number } | null;
      if (!row) continue;
      props.control.keyboard(row.mod, [row.hid]);
      await sleep(typeDelay.value + 12);
      props.control.keyboard(0, []);
      await sleep(typeDelay.value);
    }
  } finally {
    props.control.keyboard(0, []);
    pasting.value = false;
  }
  if (stopTyping) toast.info(`Stopped after ${typed.value} of ${typeTotal.value} characters`);
  return !stopTyping;
}

/* ---- user macros -------------------------------------------------------- */

const userMacros = computed<UserMacro[]>(() => loadMacros(props.values.macros_json));
const runningMacro = ref<string | null>(null);

/* The editor: index -1 means a new macro, >= 0 edits an existing one, null hides
   it. Parsing the draft on the fly gives the operator an error before running. */
const editIndex = ref<number | null>(null);
const editName = ref("");
const editScript = ref("");
const savingMacro = ref(false);

const scriptError = computed(() => {
  if (editIndex.value === null || !editScript.value.trim()) return null;
  try {
    parseMacroScript(editScript.value);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
});

function newMacro() {
  editIndex.value = -1;
  editName.value = "";
  editScript.value = "key ctrl+alt+delete\ndelay 500\ntype hello";
}

function editMacro(i: number) {
  const m = userMacros.value[i];
  editIndex.value = i;
  editName.value = m.name;
  editScript.value = m.script;
}

function cancelEdit() {
  editIndex.value = null;
}

async function persistMacros(list: UserMacro[]) {
  savingMacro.value = true;
  try {
    emit("values", await saveSettings({ macros_json: serializeMacros(list) }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    savingMacro.value = false;
  }
}

async function saveMacro() {
  const name = editName.value.trim();
  if (!name) {
    toast.error("Give the macro a name");
    return;
  }
  if (scriptError.value) {
    toast.error(scriptError.value);
    return;
  }
  const list = userMacros.value.slice();
  const entry = { name, script: editScript.value };
  if (editIndex.value !== null && editIndex.value >= 0) {
    list[editIndex.value] = entry;
  } else {
    list.push(entry);
  }
  await persistMacros(list);
  editIndex.value = null;
}

async function deleteMacro(i: number) {
  if (!confirm(`Delete the macro "${userMacros.value[i].name}"?`)) return;
  const list = userMacros.value.slice();
  list.splice(i, 1);
  await persistMacros(list);
}

async function runMacro(m: UserMacro) {
  if (runningMacro.value) return;
  runningMacro.value = m.name;
  try {
    await runMacroScript(m.script, props.control, layout.value, typeDelay.value);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    runningMacro.value = null;
  }
}

/* ---- buttons pinned to the bar ------------------------------------------ */

const quick = computed<QuickItem[]>(() => parseQuick(props.values.quick_json));
const runbookNames = computed(() => loadRunbooks(props.values.runbooks_json).map((r) => r.name));
const KIND_NAMES: Record<QuickKind, string> = {
  key: "key",
  combo: "combination",
  macro: "macro",
  runbook: "runbook",
};
const addKind = ref<QuickKind>("key");
const addValue = ref("");
const savingQuick = ref(false);

/* The choice list for the kinds that pick from something. */
const addChoices = computed<{ v: string; label: string }[]>(() => {
  if (addKind.value === "combo") return macros.value.map((m) => ({ v: m.id, label: labelFor(m) }));
  if (addKind.value === "macro") return userMacros.value.map((m) => ({ v: m.name, label: m.name }));
  if (addKind.value === "runbook") return runbookNames.value.map((n) => ({ v: n, label: n }));
  return [];
});
function onKindChange() {
  addValue.value = addChoices.value[0]?.v ?? "";
}
const addError = computed(() => {
  const v = addValue.value.trim();
  if (!v) return null;
  if (addKind.value === "key") return keyProblem(v);
  if (quick.value.some((q) => sameQuick(q, { t: addKind.value, v }))) return "Already on the bar";
  return null;
});
const canAdd = computed(
  () => !!addValue.value.trim() && !addError.value && quick.value.length < QUICK_MAX && !savingQuick.value,
);

async function persistQuick(list: QuickItem[]) {
  savingQuick.value = true;
  try {
    emit("values", await saveSettings({ quick_json: serializeQuick(list) }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    savingQuick.value = false;
  }
}
async function addQuick() {
  if (!canAdd.value) return;
  const v = addKind.value === "key" ? addValue.value.trim().toLowerCase() : addValue.value;
  await persistQuick([...quick.value, { t: addKind.value, v }]);
  if (addKind.value === "key") addValue.value = "";
}
function removeQuick(i: number) {
  const list = quick.value.slice();
  list.splice(i, 1);
  void persistQuick(list);
}
function moveQuick(i: number, by: number) {
  const j = i + by;
  if (j < 0 || j >= quick.value.length) return;
  const list = quick.value.slice();
  [list[i], list[j]] = [list[j], list[i]];
  void persistQuick(list);
}
</script>

<template>
  <div class="input-panel">
    <p v-if="!attached" class="section-blocked">
      No target on USB. Keystrokes will go nowhere until the cable is connected.
    </p>

    <h3>Key combinations</h3>
    <div class="macro-bar">
      <button
        v-for="m in macros"
        :key="m.id"
        type="button"
        :class="['btn', 'btn-sm', { 'btn-danger': m.destructive }]"
        :title="m.hint"
        :disabled="macroBusy"
        @click="sendMacro(m)"
      >
        {{ labelFor(m) }}
      </button>
    </div>

    <h3>Bar buttons</h3>
    <p class="setting-note">Pinned to the bar under the picture, in every browser. Up to {{ QUICK_MAX }}.</p>
    <ul v-if="quick.length" class="image-list">
      <li v-for="(q, i) in quick" :key="q.t + q.v" class="image-row">
        <span class="image-name">
          <span class="mono">{{ quickLabel(q, effectiveOs) }}</span>
          <span class="quick-kind">{{ KIND_NAMES[q.t] }}</span>
        </span>
        <span class="macro-actions">
          <button
            type="button"
            class="btn btn-sm btn-quiet"
            :disabled="i === 0 || savingQuick"
            title="Move left"
            aria-label="Move left"
            @click="moveQuick(i, -1)"
          >
            &larr;
          </button>
          <button
            type="button"
            class="btn btn-sm btn-quiet"
            :disabled="i === quick.length - 1 || savingQuick"
            title="Move right"
            aria-label="Move right"
            @click="moveQuick(i, 1)"
          >
            &rarr;
          </button>
          <button type="button" class="btn btn-sm btn-quiet" :disabled="savingQuick" @click="removeQuick(i)">
            Remove
          </button>
        </span>
      </li>
    </ul>
    <div v-if="quick.length < QUICK_MAX" class="quick-add">
      <select v-model="addKind" aria-label="What to pin" @change="onKindChange">
        <option value="key">Key</option>
        <option value="combo">Combination</option>
        <option v-if="userMacros.length" value="macro">Macro</option>
        <option v-if="runbookNames.length" value="runbook">Runbook</option>
      </select>
      <input
        v-if="addKind === 'key'"
        v-model="addValue"
        type="text"
        class="mono quick-value"
        placeholder="f2, delete, ctrl+alt+f2"
        aria-label="Key"
        @keydown.enter="addQuick"
      />
      <select v-else v-model="addValue" class="quick-value" aria-label="Which one">
        <option v-for="c in addChoices" :key="c.v" :value="c.v">{{ c.label }}</option>
      </select>
      <button type="button" class="btn btn-sm" :disabled="!canAdd" @click="addQuick">Add</button>
    </div>
    <p v-if="addError" class="setting-note setting-note-blocked">{{ addError }}</p>

    <h3>Macros</h3>
    <ul v-if="userMacros.length" class="image-list">
      <li v-for="(m, i) in userMacros" :key="i" class="image-row">
        <span class="image-name mono">{{ m.name }}</span>
        <span class="macro-actions">
          <button type="button" class="btn btn-sm" :disabled="!!runningMacro" @click="runMacro(m)">
            {{ runningMacro === m.name ? "Running..." : "Run" }}
          </button>
          <button type="button" class="btn btn-sm btn-quiet" @click="editMacro(i)">Edit</button>
          <button type="button" class="btn btn-sm btn-quiet" @click="deleteMacro(i)">Delete</button>
        </span>
      </li>
    </ul>
    <p v-else class="setting-note">
      A macro is a short script - key chords, typed text and delays - that you replay with one
      click. Handy for a fixed sequence like stepping through a BIOS.
    </p>

    <div v-if="editIndex !== null" class="macro-editor">
      <input v-model="editName" type="text" placeholder="Macro name" />
      <textarea
        v-model="editScript"
        rows="6"
        class="mono"
        spellcheck="false"
        placeholder="key ctrl+alt+f2&#10;delay 500&#10;type root&#10;key enter"
      ></textarea>
      <p class="setting-note">
        One command per line: <code>key ctrl+alt+f2</code>, <code>type some text</code>,
        <code>delay 500</code>. Lines starting with # are ignored. Every key name is listed in
        <a href="https://espkvm.io/scripts/" target="_blank" rel="noopener">espkvm.io/scripts</a>.
      </p>
      <p v-if="scriptError" class="setting-note setting-note-blocked">{{ scriptError }}</p>
      <div class="macro-actions">
        <button
          type="button"
          class="btn btn-sm"
          :disabled="savingMacro || !!scriptError"
          @click="saveMacro"
        >
          {{ savingMacro ? "Saving..." : "Save" }}
        </button>
        <button type="button" class="btn btn-sm btn-quiet" @click="cancelEdit">Cancel</button>
      </div>
    </div>
    <button v-else type="button" class="btn btn-sm" @click="newMacro">New macro...</button>

    <h3>Paste text</h3>
    <FoldNote>
      <template #lead>Typed with the <strong>{{ layout }}</strong> layout.</template>
      The text goes as key positions, so the layout must match what the target has active. Change
      it under Settings, Input.
    </FoldNote>
    <div v-if="pasting" class="type-progress">
      <progress :max="typeTotal" :value="typed"></progress>
      <small class="mono">{{ typed }} / {{ typeTotal }}</small>
      <button type="button" class="btn btn-sm" @click="stop">Stop</button>
    </div>
    <template v-else>
      <button type="button" class="btn btn-sm" @click="paste">Paste from clipboard</button>
      <textarea
        v-model="draft"
        rows="3"
        class="type-draft"
        spellcheck="false"
        autocomplete="off"
        placeholder="Or type or paste text here"
      ></textarea>
      <button type="button" class="btn btn-sm" :disabled="!draft" @click="typeDraft">Type it</button>
    </template>

    <h3>Stuck input</h3>
    <FoldNote>
      <template #lead>Lift every key and mouse button the target thinks is held.</template>
      For a click or a key that got stuck down. It is the software version of unplugging the
      cable.
    </FoldNote>
    <button type="button" class="btn btn-sm" @click="releaseAll">Release all inputs</button>
  </div>
</template>

<style scoped>
.type-draft {
  width: 100%;
  margin-top: var(--space-2);
  resize: vertical;
}

.type-progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.type-progress progress {
  flex: 1;
  min-width: 0;
}
.quick-add {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.quick-add > select:first-child {
  flex: none;
  width: auto;
}

.quick-value {
  flex: 1;
  min-width: 0;
}

.quick-kind {
  margin-left: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-xs, 12px);
}
</style>

<script setup lang="ts">
/*
 * A translation editor in the console: every English string with a field for
 * its translation, the change shown on the console at once, and the result
 * exported as a language file or kept on the device. The list of strings is
 * fetched from fw.espkvm.io (strings.json), or loaded from that file on a
 * device with no internet - it is not built into the console, which would
 * make every device carry it for the few who translate.
 */
import { computed, onMounted, reactive, ref, watch } from "vue";
import Icon from "./Icon.vue";
import {
  activeLanguageText,
  fetchStrings,
  installLanguage,
  locale,
  LOCALES_URL,
  parseStrings,
  readTranslators,
  setDeviceLanguage,
  t,
  textOk,
  tn,
  type SourceString,
} from "../i18n";
import { toast } from "../state/toasts";

const props = defineProps<{ /** Open on an empty new language, not the one on screen. */ fresh?: boolean }>();
const emit = defineEmits<{ (e: "close"): void }>();

type Value = string | Record<string, string>;
const PAGE = 40;

const sources = ref<SourceString[] | null>(null);
const loadError = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

/* The file being edited: its code, name and offer line, its entries, and any
   entries it has for strings this console no longer uses (kept, so the file
   still serves older firmware). */
const code = ref("");
const name = ref("");
const offer = ref("");
/* Translators as typed: one name per line. */
const translators = ref("");
const translatorList = () => readTranslators(translators.value.split("\n"));
const draft = reactive(new Map<string, Value>());

function startFrom(text: string | null) {
  draft.clear();
  if (!text) return;
  const data = JSON.parse(text) as Record<string, unknown>;
  code.value = typeof data["@language"] === "string" ? (data["@language"] as string) : "";
  name.value = typeof data["@name"] === "string" ? (data["@name"] as string) : "";
  offer.value = typeof data["@offer"] === "string" ? (data["@offer"] as string) : "";
  translators.value = readTranslators(data["@translators"]).join("\n");
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("@")) continue;
    if (typeof v === "string" || (v && typeof v === "object" && !Array.isArray(v))) draft.set(k, v as Value);
  }
}

onMounted(async () => {
  startFrom(props.fresh || locale.value === "en" ? null : activeLanguageText());
  try {
    sources.value = await fetchStrings();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  }
});

async function stringsFromFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    sources.value = parseStrings(await file.text());
    loadError.value = "";
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  }
}

const codeOk = computed(() => /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code.value) && code.value !== "en");

/* The language's plural forms, as Intl names them: one/few/many/other for
   Russian, one/other for German. */
const forms = computed(() => {
  try {
    return new Intl.PluralRules(codeOk.value ? code.value : "en").resolvedOptions().pluralCategories as string[];
  } catch {
    return ["one", "other"];
  }
});

function state(s: SourceString): "missing" | "bad" | "ok" {
  const v = draft.get(s.en);
  if (s.other) {
    const obj = v && typeof v === "object" ? v : {};
    const filled = forms.value.filter((f) => obj[f]);
    if (!filled.length) return "missing";
    return filled.every((f) => textOk(s.en, obj[f], true)) && filled.length === forms.value.length ? "ok" : "bad";
  }
  if (typeof v !== "string" || !v) return "missing";
  return textOk(s.en, v, false) ? "ok" : "bad";
}

const counts = computed(() => {
  const c = { ok: 0, missing: 0, bad: 0 };
  for (const s of sources.value ?? []) c[state(s)]++;
  return c;
});
const percent = computed(() =>
  sources.value?.length ? Math.floor((100 * counts.value.ok) / sources.value.length) : 0,
);

const filter = ref<"all" | "missing" | "bad">("all");
const query = ref("");
const page = ref(0);
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return (sources.value ?? []).filter((s) => {
    if (filter.value !== "all" && state(s) !== filter.value) return false;
    if (!q) return true;
    const v = draft.get(s.en);
    const mine = typeof v === "string" ? v : v ? Object.values(v).join(" ") : "";
    return s.en.toLowerCase().includes(q) || mine.toLowerCase().includes(q);
  });
});
const pages = computed(() => Math.max(1, Math.ceil(shown.value.length / PAGE)));
const pageItems = computed(() => shown.value.slice(page.value * PAGE, (page.value + 1) * PAGE));
watch([filter, query], () => (page.value = 0));

function text(s: SourceString): string {
  const v = draft.get(s.en);
  return typeof v === "string" ? v : "";
}
function form(s: SourceString, f: string): string {
  const v = draft.get(s.en);
  return v && typeof v === "object" ? (v[f] ?? "") : "";
}
function setText(s: SourceString, value: string) {
  if (value) draft.set(s.en, value);
  else draft.delete(s.en);
}
function setForm(s: SourceString, f: string, value: string) {
  const v = draft.get(s.en);
  const obj = { ...(v && typeof v === "object" ? v : {}) };
  if (value) obj[f] = value;
  else delete obj[f];
  if (Object.keys(obj).length) draft.set(s.en, obj);
  else draft.delete(s.en);
}
/* Enough rows for the longer of the English and the translation, so a long
   one is not cut off (field-sizing grows it further where supported). */
const rowsFor = (s: SourceString) => Math.min(6, Math.ceil(Math.max(s.en.length, text(s).length) / 60) || 1);
const placeholdersOf = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => `{${m[1]}}`);

/* The file as it would be exported: the strings in the console's order, then
   whatever else the file had. */
function serialize(): string {
  const out: Record<string, unknown> = { "@language": code.value, "@name": name.value || code.value };
  if (offer.value) out["@offer"] = offer.value;
  const names = translatorList();
  if (names.length) out["@translators"] = names;
  const known = new Set((sources.value ?? []).map((s) => s.en));
  for (const s of sources.value ?? []) if (draft.has(s.en)) out[s.en] = draft.get(s.en);
  for (const [k, v] of draft) if (!known.has(k)) out[k] = v;
  return JSON.stringify(out, null, 2) + "\n";
}

/* Each change shows on the console a moment later, and is kept in this
   browser as its language - closing the editor loses nothing. */
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  [draft, code, name, offer, translators],
  () => {
    clearTimeout(timer);
    if (!codeOk.value) return;
    timer = setTimeout(() => {
      try {
        installLanguage(serialize());
      } catch {
        /* the file check refuses it: the console stays as it was */
      }
    }, 500);
  },
  { deep: true },
);

function exportFile() {
  const blob = new Blob([serialize()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${code.value}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const busy = ref(false);
async function keepOnDevice() {
  busy.value = true;
  try {
    await setDeviceLanguage(serialize());
    toast.info(t("Kept on the device."));
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    busy.value = false;
  }
}

function newLanguage() {
  if (draft.size && !confirm(t("Start an empty language? Export this one first if you want to keep it."))) return;
  code.value = "";
  name.value = "";
  offer.value = "";
  translators.value = "";
  startFrom(null);
}
</script>

<template>
  <Teleport to="body">
    <div class="te-back" @click.self="emit('close')">
      <section class="te" role="dialog" aria-labelledby="te-title">
        <header class="te-head">
          <h2 id="te-title">{{ t("Edit the translation") }}</h2>
          <button type="button" class="icon-btn" :aria-label="t('Close')" :title="t('Close')" @click="emit('close')">
            <Icon name="close" :size="15" />
          </button>
        </header>

        <div class="te-meta">
          <label>
            {{ t("Code") }}
            <input type="text" v-model.trim="code" class="mono" placeholder="de, pt-BR" maxlength="16" />
          </label>
          <label>
            {{ t("Name in the language") }}
            <input type="text" v-model="name" placeholder="Deutsch" maxlength="40" />
          </label>
          <label class="te-wide">
            {{ t("Invitation for browsers in this language") }}
            <input
              type="text"
              v-model="offer"
              maxlength="200"
              placeholder="Die Konsole gibt es auf Deutsch: Einstellungen → Oberfläche → Sprache"
            />
          </label>
          <label class="te-names">
            {{ t("Translated by, one name per line") }}
            <textarea v-model="translators" rows="3" />
          </label>
        </div>
        <p v-if="!codeOk" class="setting-note setting-note-blocked">
          {{ t("Give the language a code first, such as de or pt-BR. Changes show on the console once it has one.") }}
        </p>

        <div v-if="!sources" class="te-load">
          <p v-if="loadError" class="setting-note">
            {{ t("The list of strings comes from fw.espkvm.io, which this browser cannot reach. Download it on another computer and load it here:") }}
            <a :href="LOCALES_URL + 'strings.json'" target="_blank" rel="noopener">strings.json</a>
          </p>
          <p v-else class="setting-note">{{ t("Getting the list of strings...") }}</p>
          <button type="button" class="btn btn-sm" @click="fileInput?.click()">{{ t("Load strings.json...") }}</button>
          <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="stringsFromFile" />
        </div>

        <template v-else>
          <div class="te-progress">
            <progress :max="sources.length || 1" :value="counts.ok"></progress>
            <small>
              {{ t("{done} of {total} translated ({percent}%)", { done: counts.ok, total: sources.length, percent }) }} &middot;
              {{ tn("{n} missing", "{n} missing", counts.missing) }}
              <template v-if="counts.bad"> &middot; {{ tn("{n} with a problem", "{n} with a problem", counts.bad) }}</template>
            </small>
          </div>

          <div class="te-tools">
            <select v-model="filter" :aria-label="t('Show')">
              <option value="all">{{ t("All strings") }}</option>
              <option value="missing">{{ t("Not translated") }}</option>
              <option value="bad">{{ t("With a problem") }}</option>
            </select>
            <input v-model="query" type="search" :placeholder="t('Search in both languages')" />
          </div>

          <ol class="te-list">
            <li v-for="s in pageItems" :key="s.en" :class="['te-row', `te-${state(s)}`]">
              <div class="te-en">
                {{ s.en }}
                <template v-if="s.other"><br /><span class="muted">{{ s.other }}</span></template>
                <small v-if="placeholdersOf(s.en).length" class="te-ph mono">{{ placeholdersOf(s.en).join(" ") }}</small>
              </div>
              <div v-if="s.other" class="te-forms">
                <label v-for="f in forms" :key="f">
                  <span class="mono">{{ f }}</span>
                  <input type="text" :value="form(s, f)" @input="setForm(s, f, ($event.target as HTMLInputElement).value)" />
                </label>
              </div>
              <textarea
                v-else
                :value="text(s)"
                :rows="rowsFor(s)"
                @input="setText(s, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
              <small v-if="state(s) === 'bad'" class="te-why">
                {{ t("A placeholder the English does not have, a control character, or a missing form.") }}
              </small>
            </li>
          </ol>

          <nav v-if="pages > 1" class="te-pages">
            <button type="button" class="btn btn-sm" :disabled="page === 0" @click="page--">&larr;</button>
            <small>{{ t("Page {page} of {pages}", { page: page + 1, pages }) }}</small>
            <button type="button" class="btn btn-sm" :disabled="page >= pages - 1" @click="page++">&rarr;</button>
          </nav>
        </template>

        <footer class="te-foot">
          <button type="button" class="btn btn-sm" :disabled="!codeOk" @click="exportFile">{{ t("Export") }}</button>
          <button type="button" class="btn btn-sm" :disabled="!codeOk || busy" @click="keepOnDevice">
            {{ t("Keep on the device") }}
          </button>
          <button type="button" class="btn btn-sm btn-quiet" @click="newLanguage">{{ t("New language") }}</button>
          <a class="te-help" href="https://github.com/espkvm/espkvm/blob/main/docs/TRANSLATING.md" target="_blank" rel="noopener">
            {{ t("How to send it to the project") }}
          </a>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.te-back {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--space-4) var(--space-3);
  background: rgb(0 0 0 / 45%);
}

.te {
  width: min(900px, 100%);
  max-height: calc(100vh - 2 * var(--space-4));
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-overlay);
  color: var(--text);
  box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
  overflow: hidden;
}

.te-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.te-head h2 {
  margin: 0;
  font-size: var(--text-lg, 18px);
}

.te-meta {
  display: grid;
  grid-template-columns: 8rem 12rem 1fr;
  gap: var(--space-2);
}

.te-names {
  grid-column: 1 / -1;
}

.te-names textarea {
  resize: vertical;
  min-height: 3.5em;
}

.te-meta label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-xs, 12px);
  color: var(--text-muted);
}

.te-progress {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.te-progress progress {
  flex: 0 0 10rem;
}

.te-tools {
  display: flex;
  gap: var(--space-2);
}

.te-tools select {
  flex: none;
  width: auto;
}

.te-tools input {
  flex: 1;
  min-width: 0;
}

.te-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.te-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1) var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.te-en {
  font-size: var(--text-sm, 13px);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.te-ph {
  display: block;
  color: var(--text-muted);
}

/* The console styles typed inputs only. Textareas here match them. */
.te textarea {
  width: 100%;
  padding: 4px var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-sunken);
  color: var(--text);
  font: inherit;
  line-height: 1.4;
  resize: vertical;
  field-sizing: content;
}

/* Every field the same size as the English next to it, labels or not. */
.te input[type="text"],
.te textarea {
  font-size: var(--text-sm, 13px);
}

.te-missing textarea,
.te-missing .te-forms input {
  border-left: 3px solid var(--border-strong);
}

.te-bad textarea,
.te-bad .te-forms input {
  border-left: 3px solid var(--danger, #e5534b);
}

.te-forms {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.te-forms label {
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs, 12px);
}

.te-why {
  grid-column: 2;
  color: var(--danger, #e5534b);
}

.te-pages {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-2);
}

.te-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.te-help {
  margin-left: auto;
  font-size: var(--text-sm, 13px);
}

@media (max-width: 640px) {
  .te-meta,
  .te-row {
    grid-template-columns: 1fr;
  }
  .te-why {
    grid-column: 1;
  }
}
</style>

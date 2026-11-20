<script setup lang="ts">
/*
 * The console's language. English is built in. Another language is downloaded
 * from fw.espkvm.io or read from a file, and kept in this browser. The device
 * can hold one language of its own, which every browser without a choice of
 * its own opens in - that works with no internet. See src/i18n.ts.
 */
import { computed, onMounted, ref } from "vue";
import {
  activeLanguageText,
  deviceLanguage,
  fetchLanguage,
  followDevice,
  followsDevice,
  installLanguage,
  listLanguages,
  locale,
  localeName,
  localeTranslators,
  setDeviceLanguage,
  t,
  tn,
  useEnglish,
  useStored,
  type Offered,
  type ParsedLanguage,
} from "../i18n";
import TranslationEditor from "./TranslationEditor.vue";
import { toast } from "../state/toasts";

const DEVICE = "@device";

/* "Anna, Ivan and Olga", joined the way the language on screen joins a list.
   A long list shows its first names and how many more, until opened. */
const SHOWN = 5;
const allTranslators = ref(false);
const hiddenTranslators = computed(() =>
  allTranslators.value ? 0 : Math.max(0, localeTranslators.value.length - SHOWN),
);
const translatedBy = computed(() => {
  const names = localeTranslators.value;
  if (!names.length || locale.value === "en") return "";
  const shown = hiddenTranslators.value ? names.slice(0, SHOWN) : names;
  let list = shown.join(", ");
  try {
    list = new Intl.ListFormat(locale.value, { type: hiddenTranslators.value ? "unit" : "conjunction" }).format(shown);
  } catch {
    /* an old browser: commas will do */
  }
  return t("Translated by {names}", { names: list });
});

const offered = ref<Offered[]>([]);
const editing = ref(false);
const listFailed = ref(false);
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const follow = ref(followsDevice());

onMounted(async () => {
  try {
    offered.value = await listLanguages();
  } catch {
    listFailed.value = true;
  }
});

const selected = computed(() => (follow.value ? DEVICE : locale.value));
const deviceLabel = computed(() =>
  t("As on this device ({name})", { name: deviceLanguage.value?.name ?? "English" }),
);

function report(lang: ParsedLanguage) {
  if (lang.skipped) {
    toast.info(
      tn(
        "{n} entry in the file was not usable and shows in English.",
        "{n} entries in the file were not usable and show in English.",
        lang.skipped,
      ),
    );
  }
}

async function choose(code: string) {
  if (code === DEVICE) {
    followDevice();
    follow.value = true;
    return;
  }
  follow.value = false;
  if (code === "en") {
    useEnglish();
    return;
  }
  busy.value = true;
  try {
    /* A fresh copy when the site is reachable, the stored one otherwise. */
    const lang = await fetchLanguage(code).catch((err) => {
      if (!useStored(code)) throw err;
      return null;
    });
    if (lang) report(lang);
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    busy.value = false;
  }
}

async function fromFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    report(installLanguage(await file.text()));
    follow.value = false;
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
}

/* The language on screen can be given to the device when it is not English
   and not what the device has already. */
const canGive = computed(
  () => locale.value !== "en" && deviceLanguage.value?.code !== locale.value && !!activeLanguageText(),
);

async function giveToDevice(english: boolean) {
  busy.value = true;
  try {
    await setDeviceLanguage(english ? null : activeLanguageText());
    toast.info(
      english
        ? t("The device opens in English for every browser without a language of its own.")
        : t("The device opens in {name} for every browser without a language of its own.", {
            name: localeName.value,
          }),
    );
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="setting">
    <div class="setting-text">
      <div class="setting-head">
        <label class="setting-title" for="console-language">{{ t("Language") }}</label>
      </div>
      <p class="setting-note setting-hint">
        {{ t("The console's language in this browser. Text not translated yet stays in English.") }}
      </p>
    </div>
    <div class="setting-control lang-control">
      <select
        id="console-language"
        :value="selected"
        :disabled="busy"
        @change="choose(($event.target as HTMLSelectElement).value)"
      >
        <option :value="DEVICE">{{ deviceLabel }}</option>
        <option value="en">English</option>
        <option v-for="l in offered.filter((x) => x.code !== 'en')" :key="l.code" :value="l.code">
          {{ l.percent !== undefined && l.percent < 100 ? t("{name} ({percent}%)", { name: l.name, percent: l.percent }) : l.name }}
        </option>
        <option
          v-if="!follow && locale !== 'en' && !offered.some((x) => x.code === locale)"
          :value="locale"
        >
          {{ localeName }}
        </option>
      </select>
      <button type="button" class="btn btn-sm" @click="fileInput?.click()">{{ t("From a file...") }}</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="fromFile" />
      <button type="button" class="btn btn-sm" @click="editing = true">{{ t("Edit...") }}</button>
    </div>
    <p v-if="translatedBy" class="setting-note lang-credits">
      {{ translatedBy }}
      <button v-if="hiddenTranslators" type="button" class="btn-link" @click="allTranslators = true">
        {{ tn("and {n} more", "and {n} more", hiddenTranslators) }}
      </button>
    </p>
    <p v-if="listFailed" class="setting-note">
      {{ t("The list of languages is on fw.espkvm.io, which this browser cannot reach. A language file from the ESP-KVM repository can be loaded instead.") }}
    </p>
  </div>

  <div class="setting">
    <div class="setting-text">
      <div class="setting-head">
        <span class="setting-title">{{ t("Device language") }}</span>
      </div>
      <p class="setting-note setting-hint">
        {{
          deviceLanguage
            ? t("Browsers without a language of their own open in {name}, kept on the device. It works with no internet.", { name: deviceLanguage.name })
            : t("Browsers without a language of their own open in English. The language on screen can be kept on the device for all of them.")
        }}
      </p>
    </div>
    <div class="setting-control lang-control">
      <button v-if="canGive" type="button" class="btn btn-sm" :disabled="busy" @click="giveToDevice(false)">
        {{ t("Keep {name} on the device", { name: localeName }) }}
      </button>
      <button v-if="deviceLanguage" type="button" class="btn btn-sm btn-quiet" :disabled="busy" @click="giveToDevice(true)">
        {{ t("Back to English") }}
      </button>
    </div>
  </div>
  <TranslationEditor v-if="editing" @close="editing = false; follow = followsDevice()" />
</template>

<style scoped>
.lang-control {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}

.lang-credits {
  overflow-wrap: anywhere;
}

.lang-control select {
  flex: 1;
  min-width: 0;
}
</style>

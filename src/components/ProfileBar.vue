<script setup lang="ts">
/*
 * The profile the settings below belong to, above them. Switching here changes
 * the values in effect on the device; a new profile starts from the active
 * one, an empty one or a preset, and becomes the one being edited.
 */
import { computed, onMounted, ref } from "vue";

import { loadValues, restartDevice, type Values } from "../state/device";
import {
  DEFAULT_PROFILE,
  activeProfile,
  createProfile,
  deleteProfile,
  loadProfiles,
  profiles,
  selectProfile,
  updateProfile,
  type ProfileList,
  type ProfileMatch,
} from "../state/profiles";
import { runRestart } from "../state/restart";
import { toast } from "../state/toasts";
import { t, tm } from "../i18n";

const emit = defineEmits<{ values: [Values] }>();

const busy = ref(false);
/* Which form is open under the bar. */
const open = ref<"" | "new" | "edit">("");

const active = computed(() => activeProfile(profiles.value));
const custom = computed(() => (active.value?.id ?? DEFAULT_PROFILE) !== DEFAULT_PROFILE);
const full = computed(
  () => !!profiles.value && profiles.value.profiles.length > profiles.value.max,
);

onMounted(() => {
  loadProfiles().catch(() => {
    /* an older firmware has no profiles: the bar stays away */
  });
});

/* After a change: fresh values for the panel, and the restart a moved
   boot-time value needs. */
async function settle(list: ProfileList) {
  emit("values", await loadValues());
  if (
    list.reboot &&
    confirm(t("Some settings of this profile apply after a restart (the gamepad, the EDID). Restart now?"))
  ) {
    if (await runRestart(t("Restarting the device"), restartDevice, { kind: "manual" })) {
      location.reload();
    }
  }
}

async function run(fn: () => Promise<ProfileList>) {
  busy.value = true;
  try {
    await settle(await fn());
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = false;
  }
}

function onSelect(e: Event) {
  const id = Number((e.target as HTMLSelectElement).value);
  open.value = "";
  void run(() => selectProfile(id));
}

/* ---- a new profile ---- */
const newFrom = ref("current");
const newName = ref("");

function openNew() {
  newFrom.value = profiles.value?.presets[0]?.id ?? "current";
  newName.value = "";
  open.value = open.value === "new" ? "" : "new";
}

const newPlaceholder = computed(
  () => profiles.value?.presets.find((p) => p.id === newFrom.value)?.name ?? t("New profile"),
);

async function makeNew() {
  await run(() => createProfile(newFrom.value, newName.value.trim() || undefined));
  open.value = "";
}

/* ---- the active one: name, rule, delete ---- */
const editName = ref("");
const editMatch = ref<ProfileMatch>({ cecName: "", cecVendor: "", usbOs: "" });

function openEdit() {
  const p = active.value;
  if (!p) return;
  editName.value = p.name;
  editMatch.value = { cecName: "", cecVendor: "", usbOs: "", ...p.match };
  open.value = open.value === "edit" ? "" : "edit";
}

async function saveEdit() {
  const p = active.value;
  if (!p) return;
  await run(() =>
    updateProfile(p.id, { name: editName.value.trim() || p.name, match: { ...editMatch.value } }),
  );
  open.value = "";
}

async function removeActive() {
  const p = active.value;
  if (!p || !confirm(t('Delete the profile "{name}"? Default becomes active.', { name: p.name }))) return;
  await run(() => deleteProfile(p.id));
  open.value = "";
}

const OS_CHOICES = [
  ["", tm("any")],
  ["windows", "Windows"],
  ["macos", "macOS"],
  ["linux", "Linux"],
  ["android", "Android"],
] as const;
</script>

<template>
  <div v-if="profiles" class="profile-bar">
    <div class="profile-row">
      <label class="setting-title" for="profile-pick">{{ t("Profile") }}</label>
      <select id="profile-pick" :value="String(profiles.active)" :disabled="busy" @change="onSelect">
        <option v-for="p in profiles.profiles" :key="p.id" :value="String(p.id)">
          {{ p.name }}
        </option>
      </select>
      <span v-if="custom" class="badge" :title="profiles.manual ? t('Picked by hand') : t('Picked for the attached device')">
        {{ profiles.manual ? t("by hand") : t("auto") }}
      </span>
      <span class="profile-actions">
        <button type="button" class="btn btn-sm" :disabled="busy || full" @click="openNew">{{ t("New") }}</button>
        <button v-if="custom" type="button" class="btn btn-sm" :disabled="busy" @click="openEdit">
          {{ t("Edit") }}
        </button>
      </span>
    </div>
    <p class="setting-note profile-note">
      <template v-if="custom">
        {{ t("Settings marked with the profile's name are its own. The rest come from Default.") }}
      </template>
      <template v-else>
        {{ t("Default is used for every device. A profile keeps its own pointer, gamepad and video settings for one device.") }}
      </template>
    </p>

    <form v-if="open === 'new'" class="profile-form" @submit.prevent="makeNew">
      <label>
        {{ t("Start from") }}
        <select v-model="newFrom" :disabled="busy">
          <option v-for="p in profiles.presets" :key="p.id" :value="p.id">{{ t(p.name) }}</option>
          <option value="current">{{ t("a copy of {name}", { name: active?.name ?? t("Default") }) }}</option>
          <option value="empty">{{ t("nothing (all from Default)") }}</option>
        </select>
      </label>
      <label>
        {{ t("Name") }}
        <input v-model="newName" type="text" maxlength="31" :placeholder="newPlaceholder" />
      </label>
      <span class="profile-actions">
        <button type="submit" class="btn btn-sm" :disabled="busy">{{ t("Make it") }}</button>
        <button type="button" class="btn btn-sm" @click="open = ''">{{ t("Cancel") }}</button>
      </span>
    </form>

    <form v-if="open === 'edit'" class="profile-form" @submit.prevent="saveEdit">
      <label>
        {{ t("Name") }}
        <input v-model="editName" type="text" maxlength="31" />
      </label>
      <p class="setting-note">
        {{ t("Picked by itself when the attached device fits. A CEC name or vendor wins over the USB guess alone. Leave all three empty to pick it only by hand.") }}
      </p>
      <label>
        {{ t("CEC name starts with") }}
        <input v-model="editMatch.cecName" type="text" maxlength="14" :placeholder="t('any')" />
      </label>
      <label>
        {{ t("CEC vendor id") }}
        <input v-model="editMatch.cecVendor" type="text" maxlength="6" :placeholder="t('any, e.g. 0009bf')" />
      </label>
      <label>
        {{ t("OS by USB") }}
        <select v-model="editMatch.usbOs">
          <option v-for="[v, label] in OS_CHOICES" :key="v" :value="v">{{ v ? label : t(label) }}</option>
        </select>
      </label>
      <span class="profile-actions">
        <button type="submit" class="btn btn-sm" :disabled="busy">{{ t("Save") }}</button>
        <button type="button" class="btn btn-sm" @click="open = ''">{{ t("Cancel") }}</button>
        <button type="button" class="btn btn-sm btn-danger" :disabled="busy" @click="removeActive">
          {{ t("Delete") }}
        </button>
      </span>
    </form>
  </div>
</template>

<style scoped>
.profile-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.profile-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

/* One line with the name, the picker and its buttons, even on a phone. */
.profile-row > select {
  flex: 1 1 140px;
  width: auto;
  min-width: 0;
}

.profile-actions {
  display: inline-flex;
  gap: var(--space-1);
  margin-left: auto;
}

/* Two lines of a phone's first screen for what the marks beside the
   settings already show. */
@media (max-width: 720px) {
  .profile-note {
    display: none;
  }
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.profile-form label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-sm);
}

.profile-form .profile-actions {
  margin-left: 0;
}
</style>

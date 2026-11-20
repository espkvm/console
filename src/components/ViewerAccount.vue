<script setup lang="ts">
/*
 * The view-only sign-in: the user "viewer" with its own password. It sees the
 * picture, the sound and the recordings, and cannot type, click, touch the
 * power or change a setting. Setting, changing or removing the password needs
 * your own, and ends every viewer's sign-in.
 */
import { computed, ref } from "vue";

import { loadSession, setViewerPassword } from "../state/auth";
import { toast } from "../state/toasts";
import { t } from "../i18n";

const exists = ref(false);
const known = ref(false);
void loadSession()
  .then((s) => {
    exists.value = Boolean(s.viewer);
    known.value = s.viewer !== undefined;
  })
  .catch(() => {});

const current = ref("");
const next = ref("");
const busy = ref(false);
const tooShort = computed(() => next.value.length > 0 && next.value.length < 8);

async function save(remove: boolean) {
  if (remove && !confirm(t("Remove the viewer password? Anyone watching is signed out."))) return;
  busy.value = true;
  try {
    exists.value = await setViewerPassword(current.value, remove ? "" : next.value);
    toast.info(
      remove ? t("The viewer sign-in is off") : t("Viewer password set. Sign in as \"viewer\" with it."),
    );
    current.value = "";
    next.value = "";
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <details v-if="known" class="firmware fold">
  <summary><h3>{{ t("View-only sign-in") }}</h3><span class="fold-status">{{ exists ? t("On") : t("Off") }}</span></summary>
  <form class="fold-body" @submit.prevent="save(false)">
    <p class="setting-note">
      {{ t("A second sign-in, user {user}, for someone who should see the screen and nothing more.", { user: "viewer" }) }}
      {{ t("It shows the picture, the sound and the recordings. It cannot type, click, touch the power or change a setting, and asks for no two-factor code.") }}
    </p>
    <p v-if="exists" class="setting-note">{{ t("A viewer password is set.") }}</p>
    <label class="field">
      <span>{{ t("Your password") }}</span>
      <input v-model="current" type="password" autocomplete="current-password" />
    </label>
    <label class="field">
      <span>{{ exists ? t("New viewer password") : t("Viewer password") }}</span>
      <input v-model="next" type="password" autocomplete="new-password" />
    </label>
    <p v-if="tooShort" class="setting-note">{{ t("At least 8 characters.") }}</p>
    <div class="token-buttons">
      <button type="submit" class="btn btn-sm" :disabled="busy || !current || !next || tooShort">
        {{ exists ? t("Change it") : t("Turn it on") }}
      </button>
      <button
        v-if="exists"
        type="button"
        class="btn btn-sm btn-danger"
        :disabled="busy || !current"
        @click="save(true)"
      >
        {{ t("Remove") }}
      </button>
    </div>
  </form>
  </details>
</template>

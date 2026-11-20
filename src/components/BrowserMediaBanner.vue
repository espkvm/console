<script setup lang="ts">
/*
 * While this tab serves a file as the target's drive (state/browserMedia.ts):
 * why it must stay open, and a way to stop. Also says once why serving
 * stopped when the device stopped it.
 */
import { browserMedia, mobileBrowser, stopServing } from "../state/browserMedia";
import { formatBytes } from "../state/device";
import { t } from "../i18n";
</script>

<template>
  <div v-if="browserMedia.state !== 'off'" class="update-banner" role="status">
    <span>
      <template v-if="browserMedia.state === 'reconnecting'">{{
        t("The target reads {name} from this tab (reconnecting...). Keep this tab open while it does.", { name: browserMedia.name })
      }}</template
      ><template v-else-if="browserMedia.served">{{
        t("The target reads {name} from this tab ({size} so far). Keep this tab open while it does.", { name: browserMedia.name, size: formatBytes(browserMedia.served) })
      }}</template
      ><template v-else>{{
        t("The target reads {name} from this tab. Keep this tab open while it does.", { name: browserMedia.name })
      }}</template
      ><template v-if="mobileBrowser">
        {{ t("On a phone, keep it in front: a tab in the background may be stopped.") }}</template
      >
    </span>
    <button type="button" class="btn btn-sm" @click="stopServing">{{ t("Eject") }}</button>
  </div>
  <div v-else-if="browserMedia.stopped" class="update-banner update-banner-bad" role="status">
    <span>{{ t("{name} is no longer served: {reason}", { name: browserMedia.name, reason: browserMedia.stopped }) }}</span>
    <button type="button" class="btn btn-sm" @click="browserMedia.stopped = ''">{{ t("Dismiss") }}</button>
  </div>
</template>

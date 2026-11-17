<script setup lang="ts">
/*
 * While this tab serves a file as the target's drive (state/browserMedia.ts):
 * why it must stay open, and a way to stop. Also says once why serving
 * stopped when the device stopped it.
 */
import { browserMedia, mobileBrowser, stopServing } from "../state/browserMedia";
import { formatBytes } from "../state/device";
</script>

<template>
  <div v-if="browserMedia.state !== 'off'" class="update-banner" role="status">
    <span>
      The target reads <b>{{ browserMedia.name }}</b> from this tab<template
        v-if="browserMedia.state === 'reconnecting'"
      >
        (reconnecting...)</template
      ><template v-else-if="browserMedia.served">
        ({{ formatBytes(browserMedia.served) }} so far)</template
      >. Keep this tab open while it does.<template v-if="mobileBrowser">
        On a phone, keep it in front: a tab in the background may be stopped.</template
      >
    </span>
    <button type="button" class="btn btn-sm" @click="stopServing">Eject</button>
  </div>
  <div v-else-if="browserMedia.stopped" class="update-banner update-banner-bad" role="status">
    <span>{{ browserMedia.name }} is no longer served: {{ browserMedia.stopped }}</span>
    <button type="button" class="btn btn-sm" @click="browserMedia.stopped = ''">Dismiss</button>
  </div>
</template>

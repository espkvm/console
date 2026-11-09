<script setup lang="ts">
/* A line of text where [[Ctrl+K]] is drawn as key caps. */
import { computed } from "vue";
import Keys from "./Keys.vue";
import { keyParts } from "../ui/keys";

const props = defineProps<{ text: string }>();
const parts = computed(() => keyParts(props.text));
</script>

<template>
  <template v-for="(p, i) in parts" :key="i"
    ><Keys v-if="'keys' in p" :combo="p.keys" /><template v-else>{{
      p.text
    }}</template></template
  >
</template>

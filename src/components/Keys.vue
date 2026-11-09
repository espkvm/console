<script setup lang="ts">
/* Key caps for one combination: "Ctrl+Shift+P" draws three keys. */
import { computed } from "vue";
import { splitCombo } from "../ui/keys";

const props = defineProps<{ combo: string }>();
const caps = computed(() => splitCombo(props.combo));
</script>

<template>
  <span class="keys" :aria-label="combo"
    ><template v-for="(k, i) in caps" :key="i"
      ><template v-if="i">+</template><kbd>{{ k }}</kbd></template
    ></span
  >
</template>

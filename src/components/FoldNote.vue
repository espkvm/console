<script setup lang="ts">
/*
 * A panel's explanation, folded: the first sentence stays, the rest opens on
 * (i). The same shape as a setting's help, so a panel is not a wall of text
 * the second time you open it.
 */
import { ref } from "vue";
import Icon from "./Icon.vue";

const open = ref(false);
</script>

<template>
  <p class="setting-note fold-note">
    <slot name="lead" />
    <button
      type="button"
      :class="['fold-i', { 'fold-i-open': open }]"
      :aria-expanded="open"
      :aria-label="open ? 'Less' : 'More about this'"
      :title="open ? 'Less' : 'More'"
      @click="open = !open"
    >
      <Icon name="info" :size="13" />
    </button>
    <template v-if="open"> <slot /></template>
  </p>
</template>

<style scoped>
.fold-i {
  display: inline-flex;
  vertical-align: -2px;
  margin-left: 4px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.fold-i:hover,
.fold-i-open {
  color: var(--accent);
}
</style>

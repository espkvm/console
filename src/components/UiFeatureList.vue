<script setup lang="ts">
/*
 * The editor for ui_hidden: a tick per control in UI_FEATURES, ticked when the
 * control is shown. It writes the ids of the unticked ones. Ids this console
 * does not know (a newer console wrote them) are kept, not dropped.
 */
import { computed } from "vue";

import { UI_FEATURES, formatHidden, parseHidden } from "../ui/features";

const props = defineProps<{ value: string; disabled?: boolean }>();
const emit = defineEmits<{ change: [csv: string] }>();

const hidden = computed(() => parseHidden(props.value));
const groups = computed(() => {
  const out = new Map<string, typeof UI_FEATURES>();
  for (const f of UI_FEATURES) out.set(f.group, [...(out.get(f.group) ?? []), f]);
  return [...out.entries()];
});

function toggle(id: string, shown: boolean) {
  const next = new Set(hidden.value);
  if (shown) next.delete(id);
  else next.add(id);
  emit("change", formatHidden(next));
}
</script>

<template>
  <div class="ui-features">
    <fieldset v-for="[group, items] in groups" :key="group">
      <legend>{{ group }}</legend>
      <label v-for="f in items" :key="f.id" class="ui-feature">
        <input
          type="checkbox"
          :checked="!hidden.has(f.id)"
          :disabled="disabled"
          @change="toggle(f.id, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ f.label }}</span>
      </label>
    </fieldset>
  </div>
</template>

<style scoped>
.ui-features {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-2) var(--space-4);
}

fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

legend {
  margin-bottom: 4px;
  color: var(--text-faint);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ui-feature {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
</style>

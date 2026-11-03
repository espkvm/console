<script setup lang="ts">
/*
 * What this device can do, on one page: a line for each feature, its state,
 * and buttons to the settings or the panel it lives in. The list and the rule
 * for when it comes up by itself are in ui/tour.ts. A feature the board does
 * not have is left out. A button to a panel or to the picture folds the page
 * into a small button, so what it opened can be seen, and it opens again when
 * that is closed.
 */
import { computed } from "vue";

import Icon from "./Icon.vue";
import type { Capability, Values } from "../state/device";
import { UI_FEATURES, uiHidden } from "../ui/features";
import { TOUR_FEATURES, featureShown, type TourAction, type TourPanel } from "../ui/tour";

type IconName = InstanceType<typeof Icon>["$props"]["name"];

const props = defineProps<{
  caps: Record<string, Capability>;
  values: Values;
  passwordSet: boolean;
  profileCount: number;
  /** The recorder is there (the Recordings panel exists). */
  record: boolean;
  /** The target shows a text screen, so text can be selected. */
  textMode: boolean;
  /** A line over the title: "Step 2 of 2", or what is new. */
  step?: string;
  /** Titles of the features to mark New. */
  fresh?: string[];
  /** Folded into a small button while a panel or the picture is in use. */
  folded?: boolean;
}>();

const emit = defineEmits<{
  settings: [section: string, group: string];
  panel: [id: TourPanel];
  select: [];
  unfold: [];
  done: [];
}>();

const DISCUSSIONS = "https://github.com/orgs/espkvm/discussions";

const LABELS = new Map(UI_FEATURES.map((f) => [f.id, f.label]));

const shown = computed(() => {
  const ctx = {
    caps: props.caps,
    values: props.values,
    passwordSet: props.passwordSet,
    profileCount: props.profileCount,
  };
  const fresh = new Set(props.fresh ?? []);
  return TOUR_FEATURES.filter((f) => featureShown(f, props.caps)).map((f) => {
    const state = f.state?.(ctx);
    return {
      ...f,
      icon: f.icon as IconName,
      actions: f.actions.filter((a) => a.panel !== "captures" || props.record),
      state,
      off: state === "Off" || state === "No password",
      fresh: fresh.has(f.title),
      hidden: (f.ui ?? []).filter((id) => uiHidden.value.has(id)).map((id) => LABELS.get(id) ?? id),
    };
  });
});

function run(a: TourAction) {
  if (a.panel) emit("panel", a.panel);
  else if (a.select) emit("select");
  else if (a.section) emit("settings", a.section, a.group ?? "");
}
</script>

<template>
  <button v-if="folded" type="button" class="btn btn-sm ft-chip" @click="emit('unfold')">
    <Icon name="info" :size="14" />
    Back to the overview
  </button>
  <section v-else class="ft" role="dialog" aria-labelledby="ft-title">
    <header class="ft-head">
      <div>
        <small v-if="step" class="ft-step">{{ step }}</small>
        <h2 id="ft-title">What this device can do</h2>
      </div>
      <button type="button" class="icon-btn" aria-label="Close" title="Close" @click="emit('done')">
        <Icon name="close" :size="15" />
      </button>
    </header>
    <ul class="ft-list">
      <li v-for="f in shown" :key="f.title" :class="['ft-item', { 'ft-fresh': f.fresh }]">
        <Icon :name="f.icon" :size="20" class="ft-icon" />
        <div class="ft-text">
          <div class="ft-title">
            <strong>{{ f.title }}</strong>
            <span v-if="f.fresh" class="ft-badge ft-new">New</span>
            <span v-if="f.state" :class="['ft-badge', { 'ft-off': f.off }]">{{ f.state }}</span>
          </div>
          <small>{{ f.line }}</small>
          <small v-if="f.hidden.length" class="ft-hidden">
            Hidden in this console: {{ f.hidden.join(", ") }}.
            <button type="button" class="ft-link" @click="emit('settings', 'ui', 'Buttons')">Show them</button>
          </small>
          <div class="ft-actions">
            <button
              v-for="a in f.actions"
              :key="a.label"
              type="button"
              class="btn btn-sm"
              :disabled="a.select && !textMode"
              :title="a.select && !textMode ? 'The target is not showing a text screen' : undefined"
              @click="run(a)"
            >
              {{ a.label }}
            </button>
            <a v-if="f.docs" :href="f.docs" target="_blank" rel="noopener" class="ft-more">More</a>
          </div>
        </div>
      </li>
    </ul>
    <p class="ft-missing">
      Missing something you need?
      <a :href="DISCUSSIONS" target="_blank" rel="noopener">Open a discussion on GitHub</a>
      and say what it is.
    </p>
    <div class="ft-foot">
      <button type="button" class="btn btn-primary" @click="emit('done')">Got it</button>
    </div>
  </section>
</template>

<style scoped>
.ft {
  position: absolute;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  width: min(720px, calc(100% - 2 * var(--space-3)));
  max-height: calc(100% - 2 * var(--space-4));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 12px);
  background: var(--bg-overlay);
  color: var(--text);
  box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
}

.ft-chip {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  box-shadow: 0 6px 20px rgb(0 0 0 / 35%);
}

.ft-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.ft-head h2 {
  margin: 0;
  font-size: var(--text-lg, 1.125rem);
}

.ft-step {
  color: var(--text-muted);
  font-size: var(--text-xs, 0.75rem);
}

.ft-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ft-item {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius, 8px);
  background: var(--bg);
}

.ft-fresh {
  border-color: var(--accent);
}

.ft-icon {
  flex: none;
  margin-top: 2px;
  color: var(--accent);
}

.ft-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ft-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}

.ft-badge {
  padding: 0 6px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--accent);
  font-size: var(--text-xs, 0.75rem);
  line-height: 1.4;
}

.ft-badge.ft-off {
  border-color: var(--border-strong);
  color: var(--text-muted);
}

.ft-badge.ft-new {
  background: var(--accent);
  color: #fff;
}

.ft-text small {
  color: var(--text-muted);
  font-size: var(--text-xs, 0.75rem);
}

.ft-text small.ft-hidden {
  color: var(--text);
}

.ft-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.ft-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.ft-more {
  margin-left: auto;
  font-size: var(--text-xs, 0.75rem);
}

.ft-missing {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.ft-foot {
  display: flex;
  justify-content: flex-end;
}
</style>

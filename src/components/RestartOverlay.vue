<script setup lang="ts">
/*
 * The console while the device is away.
 *
 * An install or a restart takes everything with it - the session, the stream,
 * every panel - so there is nothing useful to leave clickable underneath. The
 * veil is translucent on purpose: what was on screen is still there, it is just
 * not the thing to look at. Before this, a manual restart showed one line and
 * then silence, and an operator had no way to tell a slow boot from a dead one.
 */
import { computed } from "vue";

import { dismissRestart, restartWatch, watchFraction } from "../state/restart";
import Icon from "./Icon.vue";
import RestartRays from "./RestartRays.vue";

const fraction = computed(() => watchFraction());
const sweep = computed(() => restartWatch.pct === null && restartWatch.slow);

const seconds = computed(() => Math.floor(restartWatch.elapsedMs / 1000));
const expectedSeconds = computed(() => Math.round(restartWatch.expectedMs / 1000));

/** The one line under the animation: a percentage where there is one, the clock
    where there is not, and plain words once it runs long. */
const measure = computed(() => {
  if (restartWatch.pct !== null) return `${restartWatch.pct}%`;
  if (restartWatch.slow) return `${seconds.value}s - longer than the usual ${expectedSeconds.value}s`;
  return `${seconds.value}s of about ${expectedSeconds.value}s`;
});

function stepState(i: number): "done" | "now" | "todo" {
  if (i < restartWatch.stepIndex) return "done";
  return i === restartWatch.stepIndex ? "now" : "todo";
}

function reload() {
  location.reload();
}
</script>

<template>
  <div v-if="restartWatch.active" class="restart-veil" role="alertdialog" aria-modal="true">
    <div class="restart-card">
      <template v-if="restartWatch.lost">
        <h2 class="restart-title">
          <Icon name="warning" :size="18" /> The device did not come back
        </h2>
        <p class="setting-note">
          {{ restartWatch.label }} was asked for, and nothing has answered for a minute and a
          half. It may still be starting, it may have come back on another address, or it may
          need its power cycled.
        </p>
        <div class="restart-actions">
          <button type="button" class="btn btn-primary" @click="reload()">Try to reconnect</button>
          <button type="button" class="btn" @click="dismissRestart()">Leave it</button>
        </div>
      </template>

      <template v-else>
        <RestartRays :fraction="fraction" :sweep="sweep" />

        <h2 class="restart-title">{{ restartWatch.label }}</h2>
        <p class="restart-detail" aria-live="polite">
          {{ restartWatch.detail }}
          <span class="restart-measure">{{ measure }}</span>
        </p>

        <ol v-if="restartWatch.steps.length > 1" class="restart-steps">
          <li
            v-for="(s, i) in restartWatch.steps"
            :key="s.key"
            :class="'restart-step-' + stepState(i)"
          >
            <span class="restart-step-mark" aria-hidden="true"></span>
            {{ s.label }}
          </li>
        </ol>

        <p class="setting-note">
          The target machine is not affected - only this console loses contact. Keep this page
          open; it carries on by itself once the device answers.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 * Target power as a rail button with a small menu, not a panel.
 *
 * There is very little here - three ATX buttons and Wake-on-LAN - and a whole
 * panel sliding over the picture to show them was more ceremony than the job
 * deserves: you press Power and you want to watch the screen while it happens,
 * which is exactly what the panel covered up. The menu opens beside the rail,
 * over the stage, and closes on the first click anywhere else.
 *
 * `side` is the rail's edge, so the menu always opens inward.
 */
import { computed, ref } from "vue";

import { powerClick, powerHold, powerReset, wakeTarget, type Capability } from "../state/device";
import { toast } from "../state/toasts";
import Icon from "./Icon.vue";

const props = defineProps<{
  caps: Record<string, Capability>;
  /** Sensed target power, when a LED is wired: known says whether to believe it. */
  atx: { known: boolean; on: boolean } | null;
  /** The target's MAC, from settings - empty means Wake-on-LAN has nothing to send to. */
  wolMac: string;
  side: "left" | "right";
}>();

const open = ref(false);
const busy = ref(false);
const waking = ref(false);

const hasAtx = computed(() => Boolean(props.caps.atx?.active));
const hasWol = computed(() => Boolean(props.caps.wol?.available));
const available = computed(() => hasAtx.value || hasWol.value);
const known = computed(() => Boolean(props.atx?.known));
const on = computed(() => Boolean(props.atx?.on));

/* The button says what it knows at a glance, the way the diagnostics one does. */
const title = computed(() => {
  if (!available.value) return props.caps.atx?.reason ?? "Power control is off";
  if (hasAtx.value && known.value) return `Target power: ${on.value ? "on" : "off"}`;
  return "Power";
});

async function act(run: () => Promise<void>, ok: string) {
  busy.value = true;
  try {
    await run();
    toast.info(ok);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = false;
  }
}

function press() {
  void act(powerClick, "Power button pressed");
}

function reset() {
  if (!confirm("Press the reset button on the target?")) return;
  void act(powerReset, "Reset button pressed");
}

function forceOff() {
  if (!confirm("Hold the power button to force the target off? Unsaved work is lost.")) return;
  void act(powerHold, "Holding power button (force off)");
}

async function wake() {
  waking.value = true;
  try {
    await wakeTarget();
    toast.info("Wake-on-LAN packet sent");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    waking.value = false;
  }
}
</script>

<template>
  <div class="pw" :data-side="side">
    <button
      type="button"
      class="rail-btn"
      :class="{ 'rail-btn-active': open }"
      :disabled="!available"
      :title="title"
      aria-label="Power"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon name="power" :size="18" />
      <span v-if="hasAtx && known" :class="['pw-dot', on ? 'pw-dot-on' : 'pw-dot-off']" />
    </button>

    <template v-if="open">
      <div class="pw-backdrop" @click="open = false" />
      <div class="pw-menu" role="menu">
        <div class="pw-head">
          <h3>Power</h3>
          <span v-if="hasAtx && known" :class="['pill', on ? 'pill-on' : 'pill-off']">
            {{ on ? "on" : "off" }}
          </span>
        </div>

        <template v-if="hasAtx">
          <button type="button" class="pw-item" :disabled="busy" @click="press">
            Press power
            <small>A short press, as on the front panel</small>
          </button>
          <button type="button" class="pw-item" :disabled="busy" @click="reset">
            Press reset
            <small>Restarts the target where it stands</small>
          </button>
          <button type="button" class="pw-item pw-item-danger" :disabled="busy" @click="forceOff">
            Force off
            <small>Holds power down; unsaved work is lost</small>
          </button>
        </template>

        <template v-if="hasWol">
          <button
            v-if="wolMac"
            type="button"
            class="pw-item"
            :disabled="waking"
            @click="wake"
          >
            {{ waking ? "Sending..." : "Wake on LAN" }}
            <small>Magic packet to {{ wolMac }}</small>
          </button>
          <p v-else class="pw-note">
            Set the target's MAC under Settings &rarr; Power to wake it from here.
          </p>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pw {
  position: relative;
}

/* A dot on the button when a LED is wired, so the target's state is on the rail
   rather than one click away. */
.pw-dot {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.pw-dot-on {
  background: var(--ok, #4ade80);
}

.pw-dot-off {
  background: var(--text-faint);
}

.pw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

/* Anchored to the button and opening inward, like the diagnostics popup. */
.pw-menu {
  position: absolute;
  bottom: 0;
  z-index: 41;
  width: 260px;
  max-width: 80vw;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-raised);
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
}

.pw[data-side="left"] .pw-menu {
  left: calc(100% + 8px);
}

.pw[data-side="right"] .pw-menu {
  right: calc(100% + 8px);
}

.pw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.pw-head h3 {
  margin: 0;
}

.pw-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pw-item small {
  color: var(--text-faint);
  font-size: var(--text-xs);
}

.pw-item:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--bg-hover, color-mix(in srgb, var(--text) 8%, transparent));
}

.pw-item:disabled {
  opacity: 0.5;
  cursor: default;
}

.pw-item-danger:hover:not(:disabled) {
  border-color: var(--danger, #f87171);
}

.pw-note {
  margin: 0;
  padding: 0 var(--space-3);
  color: var(--text-faint);
  font-size: var(--text-xs);
}

/* On a phone the rail is a strip and there is no room beside it. */
@media (max-width: 700px) {
  .pw[data-side="left"] .pw-menu,
  .pw[data-side="right"] .pw-menu {
    position: fixed;
    left: var(--space-3);
    right: var(--space-3);
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
    width: auto;
    max-width: none;
  }
}
</style>

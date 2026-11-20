<script setup lang="ts">
/*
 * Target power as a rail button with a small menu, not a panel.
 *
 * There is very little here - three ATX buttons, Wake-on-LAN, power on over
 * USB - and a whole panel sliding over the picture to show them was more
 * ceremony than the job deserves: you press Power and you want to watch the screen while it happens,
 * which is exactly what the panel covered up. The menu opens beside the rail,
 * over the stage, and closes on the first click anywhere else.
 *
 * `side` is the rail's edge, so the menu always opens inward.
 */
import { useRailPopup } from "../ui/railPopup";
import { computed, ref } from "vue";

import {
  cecPower,
  machineNames,
  powerClick,
  powerHold,
  powerReset,
  powerOnUsb,
  selectMachine,
  USB_POWER_TEXT,
  wakeTarget,
  type Capability,
  type KvmSwitch,
} from "../state/device";
import { toast } from "../state/toasts";
import { t } from "../i18n";
import Icon from "./Icon.vue";

const props = defineProps<{
  caps: Record<string, Capability>;
  /** Sensed target power, when a LED is wired: known says whether to believe it. */
  atx: { known: boolean; on: boolean } | null;
  /** The target's MAC, from settings - empty means Wake-on-LAN has nothing to send to. */
  wolMac: string;
  side: "left" | "right";
  /** The target's disk is working (HDD LED wired); null or absent when not wired. */
  hdd?: boolean | null;
  /** A view-only sign-in: the lights, no buttons. */
  watchOnly?: boolean;
  /** The KVM switch, null when there is none. */
  kvmSwitch?: KvmSwitch | null;
  /** The kvmsw_names setting. */
  machineNamesSetting?: string;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
useRailPopup(root, open);
const busy = ref(false);
const waking = ref(false);
const usbBusy = ref(false);

const hasAtx = computed(() => Boolean(props.caps.atx?.active));
const hasWol = computed(() => Boolean(props.caps.wol?.available));
const hasCec = computed(() => Boolean(props.caps.cec?.active));
/* Every board has the USB port to the target, so power on over USB is always there. */
const hasUsb = computed(() => Boolean(props.caps.hid?.available));
const machines = computed(() =>
  props.kvmSwitch ? machineNames(props.machineNamesSetting, props.kvmSwitch.machines) : [],
);
const available = computed(
  () => hasAtx.value || hasWol.value || hasCec.value || hasUsb.value || machines.value.length > 0,
);
const known = computed(() => Boolean(props.atx?.known));
const on = computed(() => Boolean(props.atx?.on));

/* The button says what it knows at a glance, the way the diagnostics one does. */
const title = computed(() => {
  if (!available.value) return props.caps.atx?.reason ? t(props.caps.atx.reason) : t("Power control is off");
  if (hasAtx.value && known.value) {
    if (props.hdd) return on.value ? t("Target power: on, disk working") : t("Target power: off, disk working");
    return on.value ? t("Target power: on") : t("Target power: off");
  }
  return t("Power");
});

async function act(run: () => Promise<void>, ok: string) {
  busy.value = true;
  try {
    await run();
    toast.info(ok);
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    busy.value = false;
  }
}

function press() {
  void act(powerClick, t("Power button pressed"));
}

function reset() {
  if (!confirm(t("Press the reset button on the target?"))) return;
  void act(powerReset, t("Reset button pressed"));
}

function forceOff() {
  if (!confirm(t("Hold the power button to force the target off? Unsaved work is lost."))) return;
  void act(powerHold, t("Holding power button (force off)"));
}

function hdmi(action: "standby" | "wake") {
  void act(
    () => cecPower(action),
    action === "wake" ? t("Asked the HDMI source to wake") : t("Asked the HDMI source to sleep"),
  );
}

function pick(n: number) {
  if (n === props.kvmSwitch?.machine) return;
  void act(() => selectMachine(n), t("Switching to {name}", { name: machines.value[n - 1] }));
}

async function usbOn() {
  usbBusy.value = true;
  try {
    toast.info(t(USB_POWER_TEXT[await powerOnUsb()]));
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    usbBusy.value = false;
  }
}

async function wake() {
  waking.value = true;
  try {
    await wakeTarget();
    toast.info(t("Wake-on-LAN packet sent"));
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    waking.value = false;
  }
}
</script>

<template>
  <div class="pw" :data-side="side" ref="root">
    <button
      type="button"
      class="rail-btn"
      :class="{ 'rail-btn-active': open }"
      :disabled="!available"
      :title="title"
      :aria-label="t('Power')"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Icon name="power" :size="18" />
      <span v-if="(hasAtx && known) || hdd" class="pw-leds">
        <span v-if="hasAtx && known" :class="['pw-dot', on ? 'pw-dot-on' : 'pw-dot-off']" />
        <span v-if="hdd" class="pw-dot pw-hdd" />
      </span>
    </button>

    <template v-if="open">
      <div class="pw-backdrop" @click="open = false" />
      <div class="pw-menu" role="menu">
        <div class="pw-head">
          <h3>{{ t("Power") }}</h3>
          <span v-if="hasAtx && known" :class="['pill', on ? 'pill-on' : 'pill-off']">
            {{ on ? t("on") : t("off") }}
          </span>
        </div>

        <p v-if="watchOnly" class="pw-note">{{ t("This sign-in can only watch.") }}</p>
        <template v-if="machines.length">
          <div class="pw-machines" role="group" :aria-label="t('KVM switch')">
            <button
              v-for="(name, i) in machines"
              :key="i"
              type="button"
              :class="['pw-machine', { 'pw-machine-on': kvmSwitch?.machine === i + 1 }]"
              :disabled="watchOnly || busy || kvmSwitch?.busy"
              :aria-pressed="kvmSwitch?.machine === i + 1"
              @click="pick(i + 1)"
            >
              {{ name }}
            </button>
          </div>
          <small v-if="kvmSwitch?.error" class="pw-note pw-note-bad">
            {{ t("The KVM switch does not answer. Check its address under Settings \u2192 Power.") }}
          </small>
          <small v-else class="pw-note">{{ t("KVM switch. The picture and USB move to the machine picked.") }}</small>
        </template>
        <template v-if="hasAtx && !watchOnly">
          <button type="button" class="pw-item" :disabled="busy" @click="press">
            {{ t("Press power") }}
            <small>{{ t("A short press, as on the front panel") }}</small>
          </button>
          <button type="button" class="pw-item" :disabled="busy" @click="reset">
            {{ t("Press reset") }}
            <small>{{ t("Restarts the target where it stands") }}</small>
          </button>
          <button type="button" class="pw-item pw-item-danger" :disabled="busy" @click="forceOff">
            {{ t("Force off") }}
            <small>{{ t("Holds power down; unsaved work is lost") }}</small>
          </button>
        </template>

        <template v-if="hasWol && !watchOnly">
          <button
            v-if="wolMac"
            type="button"
            class="pw-item"
            :disabled="waking"
            @click="wake"
          >
            {{ waking ? t("Sending...") : t("Wake on LAN") }}
            <small>{{ t("Magic packet to {mac}", { mac: wolMac }) }}</small>
          </button>
          <p v-else class="pw-note">
            {{ t("Set the target's MAC under Settings \u2192 Power to wake it from here.") }}
          </p>
        </template>

        <button v-if="hasUsb && !watchOnly" type="button" class="pw-item" :disabled="usbBusy" @click="usbOn">
          {{ usbBusy ? t("Waiting...") : t("Power on over USB") }}
          <small>{{ t("Wakes it from sleep, or from off if its BIOS allows") }}</small>
        </button>

        <template v-if="hasCec && !watchOnly">
          <button type="button" class="pw-item" :disabled="busy" @click="hdmi('wake')">
            {{ t("Wake over HDMI") }}
            <small>{{ t("HDMI-CEC; TV boxes and consoles, not most PCs") }}</small>
          </button>
          <button type="button" class="pw-item" :disabled="busy" @click="hdmi('standby')">
            {{ t("Sleep over HDMI") }}
            <small>{{ t("HDMI-CEC standby to the source") }}</small>
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pw {
  position: relative;
}

/* The wired LEDs as dots right of the icon, power above the disk like on a
   case, so the target's state is on the rail rather than one click away. */
.pw-leds {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pw-dot {
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

/* The target's disk at work. */
.pw-hdd {
  background: var(--warn, #e3b341);
  animation: pw-blink 0.5s steps(2, jump-none) infinite;
}

@keyframes pw-blink {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pw-hdd {
    animation: none;
  }
}

.pw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

/* Anchored to the button and opening inward, like the diagnostics popup. */
.pw-menu {
  position: fixed;
  top: var(--pop-top, auto);
  bottom: var(--pop-bottom, 0);
  max-height: var(--pop-max-h, 80vh);
  overflow-y: auto;
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
  left: var(--pop-left);
}

.pw[data-side="right"] .pw-menu {
  right: var(--pop-right);
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

.pw-note-bad {
  color: var(--danger, #f87171);
}

.pw-machines {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 var(--space-1);
}

.pw-machine {
  flex: 1 1 40%;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: none;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pw-machine:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.pw-machine-on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.pw-machine:disabled:not(.pw-machine-on) {
  opacity: 0.5;
  cursor: default;
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
    max-height: 80dvh;
  }
}
</style>

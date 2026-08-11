<script setup lang="ts">
/*
 * The version, as a small widget in the status bar: an outlined badge showing
 * what is running, a dot when a newer build is published, and - while an update
 * runs - the badge outline itself fills as a progress ring. Clicking it opens
 * the firmware panel (facts, the update check, install), so the whole update
 * flow lives one click from the version rather than buried in settings.
 *
 * An install is followed all the way through, not just up to the last byte:
 * download, upload, the device writing on its own, the reboot, and the console
 * finding it again. See Phase below for why.
 *
 * The check runs in the browser, never on the device: a KVM sits on networks
 * with no way out, and one that quietly reaches the internet is not what belongs
 * there. The browser fetches the image and hands it to the same endpoint a
 * manual upload uses.
 */
import { computed, ref, watch } from "vue";

import {
  compareVersions,
  downloadFirmware,
  fetchRelease,
  uploadFirmware,
  waitForDevice,
  type FirmwareRelease,
  type SystemInfo,
  type Values,
} from "../state/device";
import { toast } from "../state/toasts";

const props = defineProps<{ system: SystemInfo | null; values: Values }>();

const open = ref(false);
const release = ref<FirmwareRelease | null>(null);
const checking = ref(false);
const checkError = ref<string | null>(null);

/*
 * An install is four waits, not one, and each fails differently - so the widget
 * names the one it is in rather than showing a single bar that fills and then
 * appears to hang (issue #13). Only the first two have a percentage: once the
 * last byte is on the wire the device is erasing, writing and verifying flash
 * with nothing to report, and after that it is simply gone until it boots.
 */
type Phase =
  | "idle"
  | "downloading" /* pulling the image from the release server */
  | "uploading" /* handing it to the device, byte by byte */
  | "writing" /* device is writing and verifying; no progress to be had */
  | "restarting" /* written, waiting for it to come back on the new image */
  | "back" /* it answered again; reload onto the new firmware */
  | "lost"; /* it never answered - say so instead of pretending */

const phase = ref<Phase>("idle");
const firmwarePct = ref(0);
/** The device restarted without confirming the write, so the outcome is a guess. */
const unconfirmed = ref(false);
/** Why the last attempt failed, kept on screen until the next one starts. */
const installError = ref<string | null>(null);

/** An install is in flight: the controls stay disabled until it ends. "lost"
    is an ending, not a phase to wait in, so it frees the buttons for a retry. */
const uploading = computed(() => phase.value !== "idle" && phase.value !== "lost");
/** Phases with a real fraction to show; the others get an indeterminate bar. */
const measured = computed(() => phase.value === "downloading" || phase.value === "uploading");

/** The badge is narrow, so the phase gets one short word next to the ring. */
const badgeText = computed(() => {
  switch (phase.value) {
    case "downloading":
    case "uploading":
      return `${firmwarePct.value}%`;
    case "writing":
      return "flash";
    case "restarting":
      return "boot";
    default:
      return props.system?.version ?? "";
  }
});

/** One line for the badge tooltip and the button label while an install runs. */
const statusText = computed(() => {
  switch (phase.value) {
    case "downloading":
      return `Downloading ${firmwarePct.value}%...`;
    case "uploading":
      return `Uploading ${firmwarePct.value}%...`;
    case "writing":
      return "Writing and verifying...";
    case "restarting":
      return "Restarting...";
    case "back":
      return "Back up, reloading...";
    default:
      return "";
  }
});

const reload = () => location.reload();

const updateUrl = computed(() => String(props.values.upd_url ?? "").trim());
const updateEnabled = computed(() => Boolean(props.values.upd_check) && updateUrl.value !== "");

const updateState = computed<"none" | "newer" | "same" | "older" | "unknown">(() => {
  const published = release.value?.version;
  const running = props.system?.version;
  if (!published || !running) return "none";
  const order = compareVersions(published, running);
  if (order === null) return published === running ? "same" : "unknown";
  if (order > 0) return "newer";
  return order === 0 ? "same" : "older";
});
const updateAvailable = computed(
  () => updateState.value === "newer" || updateState.value === "unknown",
);

async function checkForUpdate() {
  if (!updateEnabled.value) return;
  checking.value = true;
  checkError.value = null;
  try {
    release.value = await fetchRelease(updateUrl.value);
  } catch (err) {
    release.value = null;
    checkError.value = err instanceof Error ? err.message : String(err);
  } finally {
    checking.value = false;
  }
}

watch(updateEnabled, (on) => (on ? void checkForUpdate() : (release.value = null)), {
  immediate: true,
});
watch(updateUrl, () => void checkForUpdate());

/**
 * Say what went wrong, and leave it said.
 *
 * A toast alone is not enough here: it fades while the operator is watching the
 * progress ring, and an install that ends with a full ring and no word is the
 * worst of the failures reported in issue #13. So the popup keeps the reason
 * until the next attempt clears it.
 */
function fail(message: string) {
  phase.value = "idle";
  installError.value = message;
  toast.error(message);
}

/**
 * Catch an image that is plainly not one before it goes anywhere.
 *
 * An ESP application image starts with the magic byte 0xE9 and runs to
 * megabytes; a redirect page or a truncated download starts with "<" and is
 * over in a few kilobytes. Both would otherwise upload in a blink, be rejected
 * by the device, and look exactly like an update that did nothing.
 *
 * @returns the reason to refuse, or null if it looks like firmware.
 */
async function notAFirmwareImage(image: Blob): Promise<string | null> {
  if (image.size < 256 * 1024) {
    const kb = Math.round(image.size / 1024);
    return `that file is only ${kb} KB - too small to be a firmware image`;
  }
  const head = new Uint8Array(await image.slice(0, 1).arrayBuffer());
  if (head[0] !== 0xe9) return "that file does not start like an ESP firmware image";
  return null;
}

/**
 * Hand an image to the device and see the reboot through to the other side.
 *
 * The waiting is the point. The upload bar reaching the end means nothing was
 * lost on the wire, not that the device is done - it still has to verify the
 * image and reboot, and the console has to find it again afterwards. So this
 * walks the phases and ends on a concrete answer: back on its feet, or not.
 */
async function sendImage(image: Blob, label: string) {
  phase.value = "uploading";
  firmwarePct.value = 0;
  unconfirmed.value = false;
  const wrong = await notAFirmwareImage(image);
  if (wrong) return fail(wrong);
  let outcome;
  try {
    outcome = await uploadFirmware(
      image,
      (f) => (firmwarePct.value = Math.round(f * 100)),
      () => (phase.value = "writing"),
    );
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }

  unconfirmed.value = !outcome.confirmed;
  phase.value = "restarting";
  if (await waitForDevice()) {
    phase.value = "back";
    toast.info(`${label} installed - reloading the console`);
    /* The reboot cleared the session, so the reload lands on the sign-in page
       of the new firmware. A beat first, so the message is readable. */
    setTimeout(() => location.reload(), 1500);
    return;
  }
  phase.value = "lost";
}

async function installRelease() {
  const target = release.value;
  if (!target) return;
  if (!confirm(`Install ${target.version} and restart the device?`)) return;
  installError.value = null;
  phase.value = "downloading";
  firmwarePct.value = 0;
  let image: Blob;
  try {
    image = await downloadFirmware(target, (f) => (firmwarePct.value = Math.round(f * 100)));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  await sendImage(image, target.version);
}

async function onFirmwareChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = "";
  if (!confirm(`Install ${file.name} and restart the device?`)) return;
  installError.value = null;
  await sendImage(file, file.name);
}

/* The badge outline: a filling ring while bytes move, a pulsing full ring while
   the device works on its own, accent when an update is available, a plain
   border otherwise. */
const ringStyle = computed(() => {
  if (measured.value) {
    return {
      background: `conic-gradient(var(--accent) ${firmwarePct.value}%, var(--border) ${firmwarePct.value}%)`,
    };
  }
  if (uploading.value || updateAvailable.value) return { background: "var(--accent)" };
  return {};
});
</script>

<template>
  <div class="uw" v-if="system">
    <button
      type="button"
      :class="['uw-badge', { 'uw-working': uploading && !measured }]"
      :style="ringStyle"
      :title="uploading ? statusText : updateAvailable ? 'Update available' : 'Firmware'"
      :aria-label="`Firmware ${system.version}${updateAvailable ? ', update available' : ''}`"
      @click="open = !open"
    >
      <span class="uw-inner mono">
        {{ badgeText }}
        <span v-if="updateAvailable && !uploading" class="uw-dot" aria-hidden="true" />
      </span>
    </button>

    <template v-if="open">
      <div class="uw-backdrop" @click="open = false" />
      <div class="uw-popup">
        <div class="uw-head">
          <h3>Firmware</h3>
          <button type="button" class="btn btn-sm btn-quiet" @click="open = false">Close</button>
        </div>

        <dl class="facts">
          <div class="fact"><dt>Version</dt><dd class="mono">{{ system.version }}</dd></div>
          <div class="fact"><dt>Built</dt><dd class="mono">{{ system.built }}</dd></div>
          <div class="fact"><dt>Running from</dt><dd class="mono">{{ system.partition }}</dd></div>
        </dl>

        <p v-if="!system.updatable" class="section-blocked">
          This firmware has a single app slot, so it cannot update itself.
        </p>
        <template v-else>
          <p class="setting-note">
            The image is written to the spare slot. If it fails to start, the device returns to
            this one on its own.
          </p>

          <div v-if="updateEnabled">
            <p v-if="checking" class="setting-note">Checking for a newer build...</p>
            <p v-else-if="checkError" class="setting-note setting-note-blocked">
              Could not read the update manifest: {{ checkError }}
            </p>
            <template v-else-if="release">
              <p v-if="updateState === 'newer'" class="setting-note">
                <strong>{{ release.version }}</strong> is published; this device runs
                {{ system.version }}.
                <a v-if="release.notes" :href="release.notes" target="_blank" rel="noreferrer">
                  What changed
                </a>
              </p>
              <p v-else-if="updateState === 'unknown'" class="setting-note">
                <strong>{{ release.version }}</strong> is published. This device runs
                {{ system.version }}, which is not a release, so which is newer is anyone's guess.
              </p>
              <p v-else-if="updateState === 'older'" class="setting-note">
                This device runs {{ system.version }}, ahead of the published
                {{ release.version }}.
              </p>
              <p v-else class="setting-note">This device runs the newest published build.</p>
              <button
                v-if="updateAvailable"
                type="button"
                class="btn btn-sm"
                :disabled="uploading"
                @click="installRelease"
              >
                {{ uploading ? statusText : `Install ${release.version}` }}
              </button>
            </template>
            <button
              type="button"
              class="btn btn-sm btn-quiet"
              :disabled="checking || uploading"
              @click="checkForUpdate"
            >
              Check again
            </button>
          </div>

          <p class="setting-note">
            Or install a specific build by hand: download its <code>.bin</code> from the
            <a
              href="https://github.com/espkvm/espkvm/releases"
              target="_blank"
              rel="noreferrer"
              >releases page</a
            >
            and pick it below.
          </p>
          <label :class="['btn', 'btn-sm', { 'btn-disabled': uploading }]">
            {{ uploading ? statusText : "Install firmware..." }}
            <input
              type="file"
              accept=".bin"
              class="sr-only"
              :disabled="uploading"
              @change="onFirmwareChosen"
            />
          </label>

          <!-- The install, phase by phase: a real bar while bytes move, a
               travelling one while the device works with nothing to report,
               and a plain answer at the end either way. -->
          <template v-if="uploading">
            <div
              v-if="measured"
              class="progress"
              role="progressbar"
              :aria-valuenow="firmwarePct"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="progress-fill" :style="{ width: firmwarePct + '%' }"></div>
            </div>
            <div
              v-else-if="phase === 'writing' || phase === 'restarting'"
              class="progress"
              role="progressbar"
              :aria-label="statusText"
            >
              <div class="progress-sweep"></div>
            </div>
            <p class="setting-note" aria-live="polite">
              <template v-if="phase === 'downloading'">
                Downloading the image... {{ firmwarePct }}%
              </template>
              <template v-else-if="phase === 'uploading'">
                Sending the image to the device... {{ firmwarePct }}%
              </template>
              <template v-else-if="phase === 'writing'">
                The image is on the device, which is now writing and verifying it. This takes
                about half a minute and there is no progress to show for it - keep this page open.
              </template>
              <template v-else-if="phase === 'restarting'">
                <template v-if="unconfirmed">
                  The device dropped the connection on the last byte, which is what a restart
                  looks like from here. Waiting for it to come back...
                </template>
                <template v-else>Written. Waiting for the device to restart...</template>
              </template>
              <template v-else-if="phase === 'back'">
                The device is back. Reloading the console...
              </template>
            </p>
          </template>

          <template v-else>
            <p v-if="phase === 'lost'" class="setting-note setting-note-blocked">
              The device has not answered in a minute and a half. It may still be booting, or the
              new image may have failed to start - in which case the bootloader has already put
              the old one back. Reload the page to see which.
              <button type="button" class="btn btn-sm btn-quiet" @click="reload">Reload</button>
            </p>
            <p v-else-if="installError" class="setting-note setting-note-blocked">
              The update did not go through: {{ installError }}
            </p>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.uw {
  position: relative;
}

/* The outlined badge. The button's own background is the "outline": an inner
   span sits on top with the surface colour, leaving a 2px ring that ringStyle
   can turn into a progress arc or an accent border. */
.uw-badge {
  padding: 2px;
  border: none;
  border-radius: var(--radius);
  background: var(--border);
  cursor: pointer;
  line-height: 0;
}

.uw-inner {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 4px);
  padding: 2px 8px;
  border-radius: calc(var(--radius) - 2px);
  background: var(--bg-raised);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.4;
}

/* The device is working with nothing to report: the ring stays full and
   breathes, so a long silent phase still looks alive. */
.uw-working {
  animation: uw-pulse 1.6s ease-in-out infinite;
}

@keyframes uw-pulse {
  50% {
    opacity: 0.45;
  }
}

/* An indeterminate bar for the same phases: a band travelling across the track
   rather than a fill that would imply a fraction nobody can measure. */
.progress-sweep {
  height: 100%;
  width: 35%;
  border-radius: 999px;
  background: var(--accent);
  animation: uw-sweep 1.2s ease-in-out infinite;
}

@keyframes uw-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .uw-working,
  .progress-sweep {
    animation: none;
  }
}

.uw-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.uw-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.uw-popup {
  /* Fixed, not absolute: the status bar sets overflow-x, which makes overflow-y
     compute to auto and would clip a popup dropping below the bar. Fixed escapes
     that, positioned just under the bar at the right where the badge sits. */
  position: fixed;
  top: calc(var(--bar-height) + 6px);
  right: var(--space-3);
  z-index: 41;
  width: 320px;
  max-width: 90vw;
  max-height: 70vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-raised);
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
}

.uw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.uw-head h3 {
  margin: 0;
}
</style>

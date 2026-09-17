<script setup lang="ts">
/*
 * What the recorder and the screenshot button left on the card: VIDEO/ and
 * SCREENSHOTS/, newest first, to open, download or delete - a panel of its own
 * on the rail. Recording itself is started from the bar under the picture; this
 * is only where the files are.
 *
 * Deleting is refused while a recording runs - freeing a large file rewrites
 * the card's allocation table under the file being written.
 */
import { computed, onMounted, ref, watch } from "vue";

import {
  captureUrl,
  deleteCapture,
  formatBytes,
  loadCaptures,
  startTimelapse,
  type CaptureFile,
  type Captures,
  type RecordStatus,
} from "../state/device";
import { toast } from "../state/toasts";
import Icon from "./Icon.vue";
import RecordingPlayer from "./RecordingPlayer.vue";

const props = defineProps<{ changed?: number; record?: RecordStatus | null }>();
const emit = defineEmits<{ started: [] }>();

const captures = ref<Captures | null>(null);
const playing = ref<CaptureFile | null>(null);
const tab = ref<"video" | "screenshots">("video");
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    captures.value = await loadCaptures();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
watch(() => props.changed, refresh);

/* Names are times ("20260917-140322", a clip "20260917-140322-event"), so reversed
   order is newest first. */
function newestFirst(list: CaptureFile[] | undefined): CaptureFile[] {
  return [...(list ?? [])].sort((a, b) => b.path.localeCompare(a.path));
}
const videos = computed(() => newestFirst(captures.value?.video));
const shots = computed(() => newestFirst(captures.value?.screenshots));

function kind(path: string): string {
  if (path.includes("-event")) return "dashcam clip";
  if (path.includes("-timelapse")) return "timelapse";
  return "video";
}

function base(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/* "20260917-140322" as "2026-09-17 14:03:22"; anything else as it is. */
function when(path: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(base(path));
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : base(path);
}

/* A timelapse: one frame every so often, played at 25 fps. An hour at 10 s
   plays in 14 seconds, a night at a minute in 20. */
const EVERY = [
  { s: 2, label: "every 2 s" },
  { s: 10, label: "every 10 s" },
  { s: 30, label: "every 30 s" },
  { s: 60, label: "every minute" },
  { s: 300, label: "every 5 minutes" },
];
const every = ref(10);
const tlBusy = ref(false);

async function timelapse() {
  if (tlBusy.value) return;
  tlBusy.value = true;
  try {
    const r = await startTimelapse(every.value);
    toast.info(`Timelapse to ${r.file} - stop it with the record button`);
    emit("started");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    tlBusy.value = false;
  }
}

async function remove(path: string) {
  if (!confirm(`Delete ${path} from the card?`)) return;
  try {
    captures.value = await deleteCapture(path);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <section class="capture-list">
    <div class="capture-head">
      <span class="muted">On the microSD card, newest first</span>
      <button type="button" class="btn btn-sm btn-quiet" :disabled="loading" @click="refresh">
        Refresh
      </button>
    </div>

    <div v-if="record" class="capture-timelapse">
      <span class="muted">Timelapse</span>
      <select v-model.number="every" aria-label="One frame">
        <option v-for="o in EVERY" :key="o.s" :value="o.s">{{ o.label }}</option>
      </select>
      <button
        type="button"
        class="btn btn-sm"
        :disabled="tlBusy || record.on || !!record.blocked"
        :title="
          record.on
            ? 'A recording is running'
            : (record.blocked ?? 'One frame at a time, played back at 25 fps, until you stop it')
        "
        @click="timelapse"
      >
        Start
      </button>
    </div>

    <p v-if="record?.dashcamNoMemory" class="setting-note setting-note-blocked">
      The dashcam is on, but this board has too little memory left for it while H.264 runs.
      Recording and screenshots still work.
    </p>

    <p v-if="captures?.blocked" class="setting-note setting-note-blocked">
      {{ captures.blocked }}
    </p>
    <template v-else-if="captures">
      <div class="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'video'"
          :class="['tab', { 'tab-active': tab === 'video' }]"
          @click="tab = 'video'"
        >
          Videos ({{ videos.length }})
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'screenshots'"
          :class="['tab', { 'tab-active': tab === 'screenshots' }]"
          @click="tab = 'screenshots'"
        >
          Screenshots ({{ shots.length }})
        </button>
      </div>

      <template v-if="tab === 'video'">
        <p v-if="!videos.length" class="muted image-empty">
          No videos yet. The record button under the picture saves them to the VIDEO folder on
          the card.
        </p>
        <ul v-else class="image-list">
          <li v-for="f in videos" :key="f.path" class="image-row">
            <Icon name="video" :size="18" class="capture-kind" />
            <span class="image-text">
              <span class="image-name">{{ when(f.path) }}</span>
              <span class="muted image-sub">{{ kind(f.path) }} · {{ formatBytes(f.size) }}</span>
            </span>
            <span class="capture-actions">
              <!-- Plays from the card as it streams, MP4 and .ts alike. -->
              <button
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                aria-label="Play"
                title="Play"
                @click="playing = f"
              >
                <Icon name="play" :size="15" />
              </button>
              <a
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.path)"
                :download="base(f.path)"
                aria-label="Download"
                title="Download"
              >
                <Icon name="download" :size="15" />
              </a>
              <a
                v-if="f.subtitles"
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.subtitles)"
                :download="base(f.subtitles)"
                aria-label="Download subtitles"
                title="Subtitles: what was pressed. Keep the file next to the video under the same name and the player shows it."
              >
                <Icon name="captions" :size="15" />
              </a>
              <button
                v-if="captures.canDelete"
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                aria-label="Delete"
                title="Delete"
                @click="remove(f.path)"
              >
                <Icon name="trash" :size="15" />
              </button>
            </span>
          </li>
        </ul>
        <p class="setting-note">
          Play streams a video from the card without downloading it. Videos are .ts files
          (dashcam clips and timelapses are MP4): VLC, mpv and most players open them, and one cut
          off by a pulled card still plays up to where it stopped. With keystrokes in recordings on
          (Settings, Video), each also gets a .srt of what was pressed; put it next to the video
          under the same name and the player shows it.
        </p>
      </template>

      <template v-else>
        <p v-if="!shots.length" class="muted image-empty">
          No screenshots yet. The camera button under the picture saves them to the SCREENSHOTS
          folder on the card.
        </p>
        <ul v-else class="image-list">
          <li v-for="f in shots" :key="f.path" class="image-row">
            <Icon name="image" :size="18" class="capture-kind" />
            <span class="image-text">
              <span class="image-name">{{ when(f.path) }}</span>
              <span class="muted image-sub">screenshot · {{ formatBytes(f.size) }}</span>
            </span>
            <span class="capture-actions">
              <a
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.path)"
                target="_blank"
                rel="noreferrer"
                aria-label="Open"
                title="Open in a new tab"
              >
                <Icon name="external" :size="15" />
              </a>
              <a
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.path)"
                :download="base(f.path)"
                aria-label="Download"
                title="Download"
              >
                <Icon name="download" :size="15" />
              </a>
              <button
                v-if="captures.canDelete"
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                aria-label="Delete"
                title="Delete"
                @click="remove(f.path)"
              >
                <Icon name="trash" :size="15" />
              </button>
            </span>
          </li>
        </ul>
      </template>

      <p v-if="!captures.canDelete && (videos.length || shots.length)" class="setting-note">
        Files cannot be deleted while a recording runs.
      </p>
    </template>
    <RecordingPlayer v-if="playing" :file="playing" @close="playing = null" />
  </section>
</template>

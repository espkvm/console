<script setup lang="ts">
/*
 * What the recorder and the screenshot button left on the card: VIDEO/ and
 * SCREENSHOTS/, newest first, to open, download or delete - a panel of its own
 * on the rail. Recording itself is started from the bar under the picture; this
 * is only where the files are.
 *
 * Deleting is refused while a recording runs - freeing a large file rewrites
 * the card's allocation table under the file being written.
 *
 * With an upload folder set (Settings, Video, Upload) each file has an Upload
 * button. The device sends the files one at a time; while any is waiting or
 * going, the panel asks how it goes once a second.
 */
import FoldNote from "./FoldNote.vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import {
  cancelUploads,
  captureUrl,
  deleteCapture,
  loadUploads,
  uploadCapture,
  type UploadItem,
  type UploadStatus,
  formatBytes,
  loadCaptures,
  searchCaptures,
  startTimelapse,
  type CaptureFile,
  type Captures,
  type RecordStatus,
  type TextHit,
} from "../state/device";
import { toast } from "../state/toasts";
import { t, tn } from "../i18n";
import Icon from "./Icon.vue";
import RecordingPlayer from "./RecordingPlayer.vue";

/* watchOnly: a view-only sign-in can play and download, not start or delete. */
const props = defineProps<{ changed?: number; record?: RecordStatus | null; watchOnly?: boolean }>();
const emit = defineEmits<{ started: [] }>();

const captures = ref<Captures | null>(null);
const playing = ref<CaptureFile | null>(null);
const playFrom = ref(0);

/* Searching what the screen said during a recording. */
const phrase = ref("");
const hits = ref<TextHit[] | null>(null);
const searching = ref(false);
const more = ref(false);

async function search() {
  const q = phrase.value.trim();
  if (!q || searching.value) return;
  searching.value = true;
  try {
    const r = await searchCaptures(q);
    hits.value = r.hits;
    more.value = r.more;
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    searching.value = false;
  }
}

function openHit(hit: TextHit) {
  const file = [...videos.value, ...shots.value].find((f) => f.path === hit.path);
  playFrom.value = hit.seconds;
  playing.value = file ?? { path: hit.path, size: 0 };
}

function play(f: CaptureFile) {
  playFrom.value = 0;
  playing.value = f;
}
const tab = ref<"video" | "screenshots">("video");
const loading = ref(false);

async function refresh() {
  loading.value = true;
  try {
    captures.value = await loadCaptures();
    /* Files the device sends on its own show up without a click. */
    if (captures.value?.canUpload) void pollUploads();
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
watch(() => props.changed, refresh);

/* Uploads. */
const uploads = ref<UploadStatus | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const activeUploads = computed(
  () => uploads.value?.items.filter((i) => i.state === "queued" || i.state === "sending") ?? [],
);

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  /* Slower while the whole queue only waits for the server. */
  const waiting = activeUploads.value.length > 0 && activeUploads.value.every((i) => (i.retryIn ?? 0) > 0);
  pollTimer = activeUploads.value.length ? setTimeout(pollUploads, waiting ? 5000 : 1000) : null;
}

async function pollUploads() {
  try {
    uploads.value = await loadUploads();
  } catch {
    /* the device is restarting, say: try again on the next tick */
  }
  schedulePoll();
}

watch(
  () => captures.value?.canUpload,
  (can) => {
    if (can && !uploads.value && !pollTimer) void pollUploads();
  },
);
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
});

/* The newest entry for a file: one sent twice shows how the last try went. */
function upItem(path: string): UploadItem | undefined {
  const list = uploads.value?.items ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].path === path) return list[i];
  return undefined;
}

function upNote(path: string): string {
  const u = upItem(path);
  if (!u) return "";
  if (u.state === "queued" && u.retryIn)
    return t("waiting for the server ({message}), next try in {n} s", { message: t(u.message ?? ""), n: u.retryIn });
  if (u.state === "queued") return t("waiting to upload");
  if (u.state === "sending")
    return t("uploading {pct}%", { pct: u.total ? Math.floor((u.bytes / u.total) * 100) : 0 });
  if (u.state === "done") return t("uploaded");
  if (u.state === "cancelled") return t("upload cancelled");
  return t("upload failed: {message}", { message: t(u.message ?? "") });
}

function upBusy(path: string): boolean {
  const s = upItem(path)?.state;
  return s === "queued" || s === "sending";
}

async function upload(path: string) {
  try {
    uploads.value = await uploadCapture(path);
    schedulePoll();
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  }
}

/* Everything in the tab that has not gone yet, oldest first, so the folder
   fills in order. */
async function uploadAll() {
  const list = (tab.value === "video" ? videos.value : shots.value)
    .filter((f) => upItem(f.path)?.state !== "done" && !upBusy(f.path))
    .reverse();
  for (const f of list) {
    try {
      uploads.value = await uploadCapture(f.path);
    } catch (err) {
      toast.error(t(err instanceof Error ? err.message : String(err)));
      break;
    }
  }
  schedulePoll();
}

async function cancelAll() {
  try {
    uploads.value = await cancelUploads();
    schedulePoll();
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  }
}

/* Names are times ("20260917-140322", a clip "20260917-140322-event"), so reversed
   order is newest first. */
function newestFirst(list: CaptureFile[] | undefined): CaptureFile[] {
  return [...(list ?? [])].sort((a, b) => b.path.localeCompare(a.path));
}
const videos = computed(() => newestFirst(captures.value?.video));
const shots = computed(() => newestFirst(captures.value?.screenshots));

function kind(path: string): string {
  if (path.includes("-event")) return t("dashcam clip");
  if (path.includes("-timelapse")) return t("timelapse");
  return t("video");
}

/* "1:05" - where a hit sits in its recording. */
function clock(seconds: number): string {
  const secs = Math.max(0, Math.floor(seconds));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
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
const EVERY = computed(() => [
  { s: 2, label: t("every 2 s") },
  { s: 10, label: t("every 10 s") },
  { s: 30, label: t("every 30 s") },
  { s: 60, label: t("every minute") },
  { s: 300, label: t("every 5 minutes") },
]);
const every = ref(10);
const tlBusy = ref(false);

async function timelapse() {
  if (tlBusy.value) return;
  tlBusy.value = true;
  try {
    const r = await startTimelapse(every.value);
    toast.info(t("Timelapse to {file} - stop it with the record button", { file: r.file }));
    emit("started");
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  } finally {
    tlBusy.value = false;
  }
}

async function remove(path: string) {
  if (!confirm(t("Delete {path} from the card?", { path }))) return;
  try {
    captures.value = await deleteCapture(path);
  } catch (err) {
    toast.error(t(err instanceof Error ? err.message : String(err)));
  }
}
</script>

<template>
  <section class="capture-list">
    <div class="capture-head">
      <span class="muted">{{ t("On the microSD card, newest first") }}</span>
      <span class="capture-head-actions">
        <button
          v-if="captures?.canUpload && !watchOnly"
          type="button"
          class="btn btn-sm btn-quiet"
          :title="t('Send every file in this tab that has not gone yet to the {dest} folder', { dest: uploads?.dest ?? 'upload' })"
          @click="uploadAll"
        >
          {{ t("Upload all") }}
        </button>
        <button type="button" class="btn btn-sm btn-quiet" :disabled="loading" @click="refresh">
          {{ t("Refresh") }}
        </button>
      </span>
    </div>
    <p v-if="activeUploads.length" class="setting-note capture-uploading">
      {{ tn("Uploading {n} file to {dest}.", "Uploading {n} files to {dest}.", activeUploads.length, { dest: uploads?.dest ?? "" }) }}
      <button type="button" class="btn-link" @click="cancelAll">{{ t("Cancel") }}</button>
    </p>


    <p v-if="record?.dashcamNoMemory" class="setting-note setting-note-blocked">
      {{ t("The dashcam is on, but this board has too little memory left for it while H.264 runs. Recording and screenshots still work.") }}
    </p>

    <p v-if="captures?.blocked" class="setting-note setting-note-blocked">
      {{ t(captures.blocked) }}
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
          {{ t("Videos ({n})", { n: videos.length }) }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'screenshots'"
          :class="['tab', { 'tab-active': tab === 'screenshots' }]"
          @click="tab = 'screenshots'"
        >
          {{ t("Screenshots ({n})", { n: shots.length }) }}
        </button>
      </div>

      <template v-if="tab === 'video'">
        <!-- What the screen said: only screens drawn as text were saved. -->
        <form class="capture-search" @submit.prevent="search">
          <input
            v-model="phrase"
            type="search"
            :placeholder="t('Find words that were on the screen')"
            :aria-label="t('Find words that were on the screen')"
          />
          <button type="submit" class="btn btn-sm" :disabled="searching || !phrase.trim()">
            {{ searching ? t("Looking...") : t("Find") }}
          </button>
        </form>

        <template v-if="hits">
          <p v-if="!hits.length" class="setting-note">
            {{
              t(
                "Nothing found. Only screens the device could read as text are saved, and only with \"Save the screen's text with a recording\" on (Settings, Video).",
              )
            }}
          </p>
          <ul v-else class="image-list">
            <li v-for="(h, i) in hits" :key="i" class="image-row">
              <Icon name="search" :size="18" class="capture-kind" />
              <span class="image-text">
                <span class="image-name">{{ when(h.path) }} · {{ clock(h.seconds) }}</span>
                <span class="muted image-sub">{{ h.text }}</span>
              </span>
              <span class="capture-actions">
                <button
                  type="button"
                  class="btn btn-sm btn-icon btn-quiet"
                  :aria-label="t('Play from here')"
                  :title="t('Play from here')"
                  @click="openHit(h)"
                >
                  <Icon name="play" :size="15" />
                </button>
              </span>
            </li>
          </ul>
          <p v-if="more" class="setting-note">{{ t("Only the first {n} are shown.", { n: hits.length }) }}</p>
        </template>

        <p v-if="!videos.length" class="muted image-empty">
          {{ t("No videos yet. The record button under the picture saves them to the VIDEO folder on the card.") }}
        </p>
        <ul v-else class="image-list">
          <li v-for="f in videos" :key="f.path" class="image-row">
            <Icon name="video" :size="18" class="capture-kind" />
            <span class="image-text">
              <span class="image-name">{{ when(f.path) }}</span>
              <span class="muted image-sub">{{ kind(f.path) }} · {{ formatBytes(f.size) }}</span>
              <span v-if="upNote(f.path)" :class="['muted', 'image-sub', { 'capture-upfail': upItem(f.path)?.state === 'error' }]">{{ upNote(f.path) }}</span>
            </span>
            <span class="capture-actions">
              <!-- Plays from the card as it streams, MP4 and .ts alike. -->
              <button
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                :aria-label="t('Play')"
                :title="t('Play')"
                @click="play(f)"
              >
                <Icon name="play" :size="15" />
              </button>
              <a
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.path)"
                :download="base(f.path)"
                :aria-label="t('Download')"
                :title="t('Download')"
              >
                <Icon name="download" :size="15" />
              </a>
              <a
                v-if="f.subtitles"
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.subtitles)"
                :download="base(f.subtitles)"
                :aria-label="t('Download subtitles')"
                :title="t('Subtitles: what was pressed. Keep the file next to the video under the same name and the player shows it.')"
              >
                <Icon name="captions" :size="15" />
              </a>
              <button
                v-if="captures.canUpload && !watchOnly"
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                :disabled="upBusy(f.path)"
                :aria-label="t('Upload')"
                :title="t('Upload to the {dest} folder', { dest: uploads?.dest ?? 'upload' })"
                @click="upload(f.path)"
              >
                <Icon name="upload" :size="15" />
              </button>
              <button
                v-if="captures.canDelete && !watchOnly"
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                :aria-label="t('Delete')"
                :title="t('Delete')"
                @click="remove(f.path)"
              >
                <Icon name="trash" :size="15" />
              </button>
            </span>
          </li>
        </ul>
        <FoldNote>
          <template #lead>{{ t("Play streams a video from the card without downloading it.") }}</template>
          {{
            t(
              "Videos are .ts files (dashcam clips and timelapses are MP4). VLC, mpv and most players open them, and one cut off by a pulled card still plays up to where it stopped. With keystrokes in recordings on (Settings, Video), each also gets a .srt of what was pressed. Put it next to the video under the same name and the player shows it.",
            )
          }}
        </FoldNote>
      </template>

      <template v-else>
        <p v-if="!shots.length" class="muted image-empty">
          {{ t("No screenshots yet. The camera button under the picture saves them to the SCREENSHOTS folder on the card.") }}
        </p>
        <ul v-else class="image-list">
          <li v-for="f in shots" :key="f.path" class="image-row">
            <Icon name="image" :size="18" class="capture-kind" />
            <span class="image-text">
              <span class="image-name">{{ when(f.path) }}</span>
              <span class="muted image-sub">{{ t("screenshot") }} · {{ formatBytes(f.size) }}</span>
              <span v-if="upNote(f.path)" :class="['muted', 'image-sub', { 'capture-upfail': upItem(f.path)?.state === 'error' }]">{{ upNote(f.path) }}</span>
            </span>
            <span class="capture-actions">
              <a
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.path)"
                target="_blank"
                rel="noreferrer"
                :aria-label="t('Open')"
                :title="t('Open in a new tab')"
              >
                <Icon name="external" :size="15" />
              </a>
              <a
                class="btn btn-sm btn-icon btn-quiet"
                :href="captureUrl(f.path)"
                :download="base(f.path)"
                :aria-label="t('Download')"
                :title="t('Download')"
              >
                <Icon name="download" :size="15" />
              </a>
              <button
                v-if="captures.canUpload && !watchOnly"
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                :disabled="upBusy(f.path)"
                :aria-label="t('Upload')"
                :title="t('Upload to the {dest} folder', { dest: uploads?.dest ?? 'upload' })"
                @click="upload(f.path)"
              >
                <Icon name="upload" :size="15" />
              </button>
              <button
                v-if="captures.canDelete && !watchOnly"
                type="button"
                class="btn btn-sm btn-icon btn-quiet"
                :aria-label="t('Delete')"
                :title="t('Delete')"
                @click="remove(f.path)"
              >
                <Icon name="trash" :size="15" />
              </button>
            </span>
          </li>
        </ul>
      </template>

      <p v-if="!captures.canDelete && !watchOnly && (videos.length || shots.length)" class="setting-note">
        {{ t("Files cannot be deleted while a recording runs.") }}
      </p>
    </template>
    <RecordingPlayer v-if="playing" :file="playing" :start="playFrom" @close="playing = null" />

    <div v-if="record && !watchOnly" class="capture-timelapse capture-timelapse-end">
      <span class="muted">{{ t("Timelapse") }}</span>
      <select v-model.number="every" :aria-label="t('One frame')">
        <option v-for="o in EVERY" :key="o.s" :value="o.s">{{ o.label }}</option>
      </select>
      <button
        type="button"
        class="btn btn-sm"
        :disabled="tlBusy || record.on || !!record.blocked"
        :title="
          record.on
            ? t('A recording is running')
            : record.blocked
              ? t(record.blocked)
              : t('One frame at a time, played back at 25 fps, until you stop it')
        "
        @click="timelapse"
      >
        {{ t("Start") }}
      </button>
    </div>
  </section>
</template>

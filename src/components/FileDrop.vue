<script setup lang="ts">
/*
 * A file dragged over the console: two places to drop it. On the card, it goes
 * to the microSD card through the Virtual media panel, with that panel's
 * progress and cancel. On the keyboard, a text file lands in the Input panel's
 * box, to be typed on the target when the operator presses Type it.
 *
 * A file dropped anywhere else would make the browser open it in place of the
 * console, so every drop of a file is taken here.
 */
import { onMounted, onUnmounted, ref } from "vue";

import Icon from "./Icon.vue";
import { toast } from "../state/toasts";

const props = defineProps<{ card: boolean; type: boolean }>();
const emit = defineEmits<{ (e: "card", f: File): void; (e: "type", text: string): void }>();

/* Typing goes at about 50 characters a second; more than this is minutes of
   keystrokes and almost surely the wrong file. */
const TYPE_MAX = 64 * 1024;
const TEXT_EXT =
  /\.(txt|md|csv|json|ya?ml|toml|ini|conf|cfg|xml|sh|bash|zsh|ps1|psm1|bat|cmd|reg|py|js|ts|c|h|sql|log|env|pub|pem|ks)$/i;

const over = ref(false);
const zone = ref<"card" | "type" | null>(null);
/* dragenter and dragleave fire for every child crossed; count them. */
let depth = 0;

function hasFiles(e: DragEvent): boolean {
  return Boolean(e.dataTransfer?.types.includes("Files"));
}

function onEnter(e: DragEvent) {
  if (!hasFiles(e)) return;
  depth++;
  over.value = true;
}

function onLeave(e: DragEvent) {
  if (!hasFiles(e)) return;
  depth = Math.max(0, depth - 1);
  if (!depth) {
    over.value = false;
    zone.value = null;
  }
}

function onOver(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = zone.value ? "copy" : "none";
}

function looksLikeText(f: File): boolean {
  return f.type.startsWith("text/") || f.type === "application/json" || TEXT_EXT.test(f.name);
}

function leaveZone(e: DragEvent) {
  const el = e.currentTarget as HTMLElement;
  if (!el.contains(e.relatedTarget as Node | null)) zone.value = null;
}

async function dropOn(where: "card" | "type", f: File) {
  if (where === "card") {
    emit("card", f);
    return;
  }
  if (!looksLikeText(f)) {
    toast.error(`${f.name} is not a text file. Drop it on the card instead.`);
    return;
  }
  if (f.size > TYPE_MAX) {
    toast.error(`${f.name} is too long to type (over ${TYPE_MAX / 1024} KB)`);
    return;
  }
  const text = await f.text();
  if (text.includes("\u0000")) {
    toast.error(`${f.name} is not a text file. Drop it on the card instead.`);
    return;
  }
  emit("type", text);
}

function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const where = zone.value;
  depth = 0;
  over.value = false;
  zone.value = null;
  const files = e.dataTransfer?.files;
  if (!where || !files?.length) return;
  if (files.length > 1) toast.info(`One file at a time: took ${files[0].name}`);
  void dropOn(where, files[0]);
}

onMounted(() => {
  window.addEventListener("dragenter", onEnter);
  window.addEventListener("dragleave", onLeave);
  window.addEventListener("dragover", onOver);
  window.addEventListener("drop", onDrop);
});
onUnmounted(() => {
  window.removeEventListener("dragenter", onEnter);
  window.removeEventListener("dragleave", onLeave);
  window.removeEventListener("dragover", onOver);
  window.removeEventListener("drop", onDrop);
});
</script>

<template>
  <div v-if="over" class="file-drop">
    <p v-if="!props.card && !props.type" class="file-drop-none">
      Files cannot go to the target from this sign-in.
    </p>
    <div
      v-if="props.card"
      :class="['file-drop-zone', { 'file-drop-hot': zone === 'card' }]"
      @dragenter="zone = 'card'"
      @dragover="zone = 'card'"
      @dragleave="leaveZone"
    >
      <Icon name="disc" :size="28" />
      <strong>Put it on the microSD card</strong>
      <small>The target sees it on the virtual drive.</small>
    </div>
    <div
      v-if="props.type"
      :class="['file-drop-zone', { 'file-drop-hot': zone === 'type' }]"
      @dragenter="zone = 'type'"
      @dragover="zone = 'type'"
      @dragleave="leaveZone"
    >
      <Icon name="keyboard" :size="28" />
      <strong>Type it on the target</strong>
      <small>A text file goes into the Input panel first.</small>
    </div>
  </div>
</template>

<style scoped>
.file-drop {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  gap: var(--space-4);
  padding: var(--space-5);
  background: color-mix(in srgb, var(--bg-sunken) 70%, transparent);
  backdrop-filter: blur(2px);
}

.file-drop-none {
  margin: auto;
  color: var(--text-muted);
}

.file-drop-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  text-align: center;
  padding: var(--space-4);
  transition:
    border-color var(--transition),
    background var(--transition);
}

.file-drop-zone strong {
  color: var(--text);
  font-size: var(--text-lg);
}

.file-drop-hot {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

@media (max-width: 600px) {
  .file-drop {
    flex-direction: column;
  }
}
</style>

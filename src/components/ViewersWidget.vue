<script setup lang="ts">
/*
 * Who else is watching: a chip in the status bar when anyone besides this
 * sign-in is, and the list on a click - each one's address, whether it is in
 * control, and whether it signed in as the viewer. A VNC client is listed too. Plus a "View only"
 * badge when this console is the viewer. Asked every few seconds; firmware
 * without /api/v1/viewers is asked once and then left alone.
 */
import { computed, onUnmounted, ref } from "vue";

import Icon from "./Icon.vue";
import { CONSOLE_HEADER } from "../state/device";
import { t, tn } from "../i18n";

const props = defineProps<{ viewOnly: boolean }>();

interface Viewer {
  ip: string;
  control: boolean;
  viewOnly: boolean;
  you: boolean;
  /** Over Tailscale: the device and its owner. */
  tailnet?: { name: string; user: string; userName: string };
  /** Not a console tab: "vnc" for a VNC client. */
  kind?: string;
  /** VNC: whether the link is TLS (VeNCrypt). */
  encrypted?: boolean;
  /** VNC: how long it has been connected. */
  seconds?: number;
}

const viewers = ref<Viewer[]>([]);
const open = ref(false);
/* The status bar clips what hangs out of it, so the list is placed on the page. */
const chip = ref<HTMLElement | null>(null);
const at = ref({ top: 0, left: 0 });
function toggle() {
  const r = chip.value?.getBoundingClientRect();
  if (r) at.value = { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 248)) };
  open.value = !open.value;
}
let gone = false;

async function load() {
  if (gone || document.visibilityState !== "visible") return;
  try {
    const res = await fetch("/api/v1/viewers", {
      cache: "no-store",
      headers: CONSOLE_HEADER,
    });
    if (res.status === 404) {
      gone = true;
      return;
    }
    if (!res.ok) return;
    const body = (await res.json()) as { viewers?: Viewer[] };
    viewers.value = body.viewers ?? [];
  } catch {
    /* the next round will do */
  }
}
void load();
const timer = setInterval(() => void load(), 5000);
onUnmounted(() => clearInterval(timer));

const others = computed(() => viewers.value.filter((v) => !v.you));
const title = computed(() => {
  const n = others.value.length;
  return tn("One more viewer is connected", "{n} more viewers are connected", n);
});

/* "alex, laptop" over the tailnet, else the address. */
function who(v: Viewer): string {
  const net = v.tailnet;
  if (!net) return v.ip;
  const device = net.name.split(".")[0];
  const person = net.userName || net.user.split("@")[0];
  return person ? `${person}, ${device}` : device;
}

function since(s: number): string {
  if (s < 60) return t("just now");
  if (s < 3600) return t("{m} min", { m: Math.floor(s / 60) });
  return t("{h} h {m} min", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
}

function describe(v: Viewer): string {
  if (v.kind === "vnc") {
    return v.encrypted
      ? t("VNC, encrypted, {since}", { since: since(v.seconds ?? 0) })
      : t("VNC, not encrypted, {since}", { since: since(v.seconds ?? 0) });
  }
  const who = v.you ? t("You") : v.viewOnly ? t("Viewer") : t("Owner");
  return v.control ? t("{who}, in control", { who }) : v.viewOnly ? t("{who}, watching", { who }) : who;
}
</script>

<template>
  <span class="vws">
    <span v-if="props.viewOnly" class="pill vws-badge" :title="t('This sign-in can watch, not act')">
      {{ t("View only") }}
    </span>
    <button
      v-if="others.length"
      ref="chip"
      type="button"
      class="vws-chip"
      :title="title"
      :aria-label="title"
      :aria-expanded="open"
      @click="toggle"
    >
      <Icon name="eye" :size="14" />
      <span class="mono">{{ others.length }}</span>
    </button>
    <template v-if="open">
      <div class="vws-backdrop" @click="open = false" />
      <div
        class="vws-pop"
        role="dialog"
        :aria-label="t('Viewers')"
        :style="{ top: `${at.top}px`, left: `${at.left}px` }"
      >
        <h3>{{ t("Viewers") }}</h3>
        <ul>
          <li v-for="(v, i) in viewers" :key="i">
            <span :class="{ mono: !v.tailnet }" :title="v.tailnet ? t('{ip} over Tailscale', { ip: v.ip }) : undefined">{{ who(v) }}</span>
            <small>{{ describe(v) }}</small>
          </li>
        </ul>
      </div>
    </template>
  </span>
</template>

<style scoped>
.vws {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.vws-badge {
  font-size: var(--text-xs);
}

.vws-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: none;
  color: var(--text-muted);
  font-size: var(--text-xs);
  cursor: pointer;
}

.vws-chip:hover {
  color: var(--text);
}

.vws-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.vws-pop {
  position: fixed;
  z-index: 41;
  min-width: 220px;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-overlay);
  box-shadow: var(--shadow-pop);
}

.vws-pop h3 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-sm);
}

.vws-pop ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.vws-pop li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 2px 0;
  font-size: var(--text-sm);
}

.vws-pop small {
  color: var(--text-muted);
}
</style>

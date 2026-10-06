<script setup lang="ts">
/*
 * The device's own log, live, over the picture's area. It asks once a second
 * for what was logged after the last position it saw (GET /api/v1/system/log
 * ?since=N), so it costs nothing while nothing happens. Errors and warnings are
 * coloured, levels can be hidden, and a search narrows it to matching lines.
 * Scrolling up stops the follow; scrolling back to the bottom resumes it.
 *
 * The same window shows the target's log received over the network
 * (netconsole / syslog, source "netlog"): there the lines are the target's own,
 * coloured by what they say rather than by an ESP-IDF level.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";

import { logUrl } from "../state/device";
import { toast } from "../state/toasts";
import Icon from "./Icon.vue";

const props = withDefaults(defineProps<{ source?: "device" | "netlog" }>(), { source: "device" });
const emit = defineEmits<{ close: [] }>();

const isNet = computed(() => props.source === "netlog");
const endpoint = computed(() => (isNet.value ? "/api/v1/netlog/log" : "/api/v1/system/log"));
const fileUrl = computed(() => (isNet.value ? "/api/v1/netlog/log" : logUrl()));
const title = computed(() => (isNet.value ? "Target log (netconsole)" : "Device log"));

const MAX_LINES = 3000;

type Line = { text: string; level: "E" | "W" | "I" | "D" | "" };

const lines = ref<Line[]>([]);
const failed = ref(false);
const show = ref({ E: true, W: true, I: true, D: true });
const query = ref("");
const box = ref<HTMLElement | null>(null);
let pos = 0;
let partial = "";
let timer = 0;
let busy = false;

/* ESP-IDF lines start with their level: "E (1234) tag: ...". A target's
   kernel log has no such mark, so there the words decide. */
function levelOf(text: string): Line["level"] {
  if (isNet.value) {
    if (/panic|oops|bug:|call trace|error|fail/i.test(text)) return "E";
    if (/warn/i.test(text)) return "W";
    return "";
  }
  const m = /^([EWID]) \(\d+\)/.exec(text);
  return m ? (m[1] as Line["level"]) : "";
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch(`${endpoint.value}?since=${pos}`, { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const next = Number(r.headers.get("X-Log-Pos"));
    const text = stripAnsi(await r.text());
    failed.value = false;
    if (Number.isFinite(next)) pos = next;
    if (!text) return;
    const el = box.value;
    const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    const parts = (partial + text).split("\n");
    partial = parts.pop() ?? "";
    const add = parts.map((t) => ({ text: t, level: levelOf(t) }));
    const all = lines.value.concat(add);
    lines.value = all.length > MAX_LINES ? all.slice(all.length - MAX_LINES) : all;
    if (atBottom) void nextTick(() => el && (el.scrollTop = el.scrollHeight));
  } catch {
    failed.value = true;
  } finally {
    busy = false;
  }
}

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return lines.value.filter((l) => {
    if (l.level && !show.value[l.level]) return false;
    return !q || l.text.toLowerCase().includes(q);
  });
});

async function copyShown() {
  try {
    await navigator.clipboard.writeText(shown.value.map((l) => l.text).join("\n"));
    toast.info("Copied");
  } catch {
    toast.error("Could not copy - select and copy it manually");
  }
}

function clearView() {
  lines.value = [];
}

onMounted(() => {
  void poll();
  timer = window.setInterval(() => void poll(), 1000);
});
onUnmounted(() => window.clearInterval(timer));
</script>

<template>
  <Teleport to="main.stage">
    <section class="lg" aria-label="Device log">
      <div class="lg-head">
        <h3>{{ title }}</h3>
        <span :class="['pill', failed ? 'pill-off' : 'pill-on']">{{ failed ? "no answer" : "live" }}</span>
        <label
          v-for="lv in (isNet ? [] : (['E', 'W', 'I', 'D'] as const))"
          :key="lv"
          :class="['lg-lv', `lg-${lv}`]"
        >
          <input v-model="show[lv]" type="checkbox" />
          {{ { E: "errors", W: "warnings", I: "info", D: "debug" }[lv] }}
        </label>
        <input v-model="query" class="lg-search" type="search" placeholder="Find" aria-label="Find in the log" />
        <span class="lg-gap" />
        <button type="button" class="btn btn-sm btn-quiet" title="Copy what is shown" @click="copyShown">
          <Icon name="copy" :size="14" />
        </button>
        <a :href="fileUrl" :download="isNet ? 'target-netlog.txt' : 'espkvm-log.txt'" class="btn btn-sm btn-quiet" title="Download the log">
          <Icon name="download" :size="14" />
        </a>
        <button type="button" class="btn btn-sm btn-quiet" title="Clear this view (the device keeps its log)" @click="clearView">
          Clear
        </button>
        <button type="button" class="btn btn-sm btn-icon btn-quiet" aria-label="Close the log" title="Close" @click="emit('close')">
          <Icon name="close" :size="15" />
        </button>
      </div>
      <div ref="box" class="lg-body mono">
        <div v-for="(l, i) in shown" :key="i" :class="['lg-line', l.level && `lg-${l.level}`]">{{ l.text }}</div>
      </div>
      <p v-if="isNet" class="lg-hint">
        Received as plain UDP: anyone on the network could have sent a line here. Nothing seen yet?
        On the target: modprobe netconsole netconsole=@/,6666@&lt;this device's IP&gt;/
      </p>
      <p v-else class="lg-hint">
        No passwords or keys, but it names your network, addresses and MAC - look before you post it.
      </p>
    </section>
  </Teleport>
</template>

<style scoped>
.lg {
  position: absolute;
  inset: 0;
  z-index: 8; /* over the serial console and the gamepad overlay, under pop-ups */
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  background: var(--bg-sunken);
}

.lg-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.lg-head h3 {
  margin: 0;
}

.lg-gap {
  flex: 1;
}

.lg-lv {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
}

.lg-search {
  width: 10rem;
  max-width: 40vw;
}

.lg-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  font-size: var(--text-xs);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
}

.lg-E {
  color: #f14c4c;
}

.lg-W {
  color: #e5c07b;
}

.lg-D {
  color: var(--text-faint);
}

.lg-hint {
  margin: 0;
  color: var(--text-faint);
  font-size: var(--text-xs);
}
</style>

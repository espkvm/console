<script setup lang="ts">
/*
 * An HDMI-CEC remote, as a small window floating over the page. It opens from
 * the action bar next to the on-screen keyboard, and nothing is dimmed behind
 * it: you press a key and watch the screen react. Drag it by its header off
 * whatever it covers; where it was left is remembered.
 *
 * While it is open the device's CEC table is read every two seconds, so the
 * name and power state follow the source. With the window focused the arrow
 * keys, Enter and Escape/Backspace drive the remote too.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";

import {
  cecKey,
  cecPower,
  cecScan,
  getCec,
  type Capability,
  type CecDevice,
  type CecStatus,
} from "../state/device";
import { toast } from "../state/toasts";
import { useFloating } from "../ui/floating";
import Icon from "./Icon.vue";

const props = defineProps<{ caps: Record<string, Capability> }>();
const emit = defineEmits<{ close: [] }>();

const status = ref<CecStatus | null>(null);
const chosen = ref<number | null>(null);
const popup = ref<HTMLElement | null>(null);
const showNumbers = ref(false);
let timer: number | null = null;

const devices = computed<CecDevice[]>(() => status.value?.devices ?? []);
const target = computed<CecDevice | null>(() => {
  const want = chosen.value ?? status.value?.target ?? -1;
  return devices.value.find((d) => d.la === want) ?? devices.value[0] ?? null;
});

function label(d: CecDevice): string {
  return d.name || `${d.type || "device"} at ${d.la}`;
}

async function refresh() {
  try {
    status.value = await getCec();
  } catch {
    /* A missed reading is not worth a toast; the next one will do. */
  }
}

onMounted(async () => {
  await nextTick();
  popup.value?.focus();
  await refresh();
  timer = window.setInterval(() => void refresh(), 2000);
});
onUnmounted(() => {
  if (timer !== null) clearInterval(timer);
});

/* Where it floats, kept between visits and kept on the screen. A phone starts
   it low, clear of the top of the picture. */
const { pos, dragStart, dragMove, dragEnd } = useFloating({
  key: "espkvm.rc",
  el: popup,
  initial: () => ({
    x: Math.max(8, window.innerWidth - 248 - 24),
    y: window.innerWidth < 700 ? Math.max(8, window.innerHeight - 560) : 80,
  }),
});

async function key(name: string) {
  try {
    await cecKey(name, target.value?.la);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

async function power(action: "standby" | "wake") {
  try {
    await cecPower(action, target.value?.la);
    toast.info(action === "wake" ? "Asked the source to wake" : "Asked the source to sleep");
    window.setTimeout(() => void refresh(), 1500);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

async function rescan() {
  try {
    await cecScan();
    toast.info("Looking for HDMI-CEC devices");
    window.setTimeout(() => void refresh(), 2500);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

const KEYS: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "select",
  Escape: "back",
  Backspace: "back",
  Home: "home",
  " ": "pause",
  "+": "volume_up",
  "-": "volume_down",
};

function onKeydown(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === "SELECT") return;
  const k = KEYS[e.key] ?? (/^[0-9]$/.test(e.key) ? e.key : undefined);
  if (!k) return;
  e.preventDefault();
  e.stopPropagation();
  void key(k);
}
</script>

<template>
  <Teleport to="body">
    <section
      ref="popup"
      class="rc-menu"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      tabindex="-1"
      aria-label="Remote control (HDMI-CEC)"
      @keydown="onKeydown"
    >
    <div
      class="rc-head"
      @pointerdown="dragStart"
      @pointermove="dragMove"
      @pointerup="dragEnd"
      @pointercancel="dragEnd"
    >
      <h3>Remote</h3>
      <span v-if="target" :class="['pill', target.power === 'on' ? 'pill-on' : 'pill-off']">
        {{ target.power }}
      </span>
      <button
        type="button"
        class="btn btn-sm btn-icon btn-quiet rc-close"
        aria-label="Close the remote"
        title="Close"
        @click="emit('close')"
      >
        <Icon name="close" :size="15" />
      </button>
    </div>

    <template v-if="!status || !status.running">
      <p class="rc-note">{{ status ? "HDMI-CEC is not running." : "Reading the CEC line..." }}</p>
    </template>
    <template v-else-if="!target">
      <p class="rc-note">
        Nothing on the HDMI-CEC line. TV boxes, consoles and a Raspberry Pi answer here; most
        PCs do not speak CEC.
      </p>
      <button type="button" class="rc-wide" @click="rescan">Look again</button>
    </template>
    <template v-else>
      <select v-if="devices.length > 1" v-model="chosen" class="rc-select" aria-label="Device">
        <option v-for="d in devices" :key="d.la" :value="d.la">{{ label(d) }}</option>
      </select>
      <p class="rc-who">
        <strong>{{ label(target) }}</strong>
        <small>
          {{ [target.type, target.physAddr, target.version && `CEC ${target.version}`].filter(Boolean).join(" · ") }}
        </small>
      </p>

      <div class="rc-row">
        <button type="button" class="rc-btn" title="Wake" @click="power('wake')">
          <Icon name="power" :size="16" /> Wake
        </button>
        <button type="button" class="rc-btn" title="Sleep" @click="power('standby')">Sleep</button>
      </div>

      <div class="rc-pad">
        <button type="button" class="rc-btn rc-sm" title="Home" @click="key('home')">Home</button>
        <button type="button" class="rc-btn rc-arrow" title="Up" @click="key('up')">&#9650;</button>
        <button type="button" class="rc-btn rc-sm" title="Menu" @click="key('menu')">Menu</button>
        <button type="button" class="rc-btn rc-arrow" title="Left" @click="key('left')">&#9664;</button>
        <button type="button" class="rc-btn rc-ok" title="OK" @click="key('select')">OK</button>
        <button type="button" class="rc-btn rc-arrow" title="Right" @click="key('right')">&#9654;</button>
        <button type="button" class="rc-btn rc-sm" title="Back" @click="key('back')">Back</button>
        <button type="button" class="rc-btn rc-arrow" title="Down" @click="key('down')">&#9660;</button>
        <button type="button" class="rc-btn rc-sm" title="Info" @click="key('info')">Info</button>
      </div>

      <div class="rc-row">
        <button type="button" class="rc-btn" title="Rewind" @click="key('rewind')">&#9194;</button>
        <button type="button" class="rc-btn" title="Play" @click="key('play')">&#9654;</button>
        <button type="button" class="rc-btn" title="Pause" @click="key('pause')">&#10074;&#10074;</button>
        <button type="button" class="rc-btn" title="Stop" @click="key('stop')">&#9632;</button>
        <button type="button" class="rc-btn" title="Fast forward" @click="key('fast_forward')">&#9193;</button>
      </div>

      <div class="rc-row">
        <button type="button" class="rc-btn" title="Volume down" @click="key('volume_down')">Vol &minus;</button>
        <button type="button" class="rc-btn" title="Mute" @click="key('mute')">Mute</button>
        <button type="button" class="rc-btn" title="Volume up" @click="key('volume_up')">Vol +</button>
      </div>

      <div class="rc-row rc-colors">
        <button type="button" class="rc-btn rc-red" title="Red" @click="key('red')" />
        <button type="button" class="rc-btn rc-green" title="Green" @click="key('green')" />
        <button type="button" class="rc-btn rc-yellow" title="Yellow" @click="key('yellow')" />
        <button type="button" class="rc-btn rc-blue" title="Blue" @click="key('blue')" />
      </div>

      <button type="button" class="rc-link" @click="showNumbers = !showNumbers">
        {{ showNumbers ? "Hide numbers" : "Numbers" }}
      </button>
      <div v-if="showNumbers" class="rc-nums">
        <button v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]" :key="n" type="button" class="rc-btn" @click="key(String(n))">
          {{ n }}
        </button>
      </div>

      <p class="rc-hint">Arrows, Enter, Esc and digits work here too.</p>
    </template>
    </section>
  </Teleport>
</template>

<style scoped>
.rc-menu {
  position: fixed;
  z-index: 56;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  width: 248px;
  max-width: 80vw;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-raised);
  box-shadow: var(--shadow, 0 8px 24px rgba(0, 0, 0, 0.4));
  outline: none;
}

.rc-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.rc-close {
  margin-left: auto;
}

.rc-head h3 {
  margin: 0;
}

.rc-note,
.rc-hint {
  margin: 0;
  color: var(--text-faint);
  font-size: var(--text-xs);
}

.rc-who {
  display: flex;
  flex-direction: column;
  margin: 0;
}

.rc-who small {
  color: var(--text-faint);
  font-size: var(--text-xs);
}

.rc-select {
  width: 100%;
}

.rc-row {
  display: flex;
  gap: 4px;
}

.rc-row .rc-btn {
  flex: 1;
}

.rc-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.rc-nums {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
}

.rc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 34px;
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

.rc-btn:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover, color-mix(in srgb, var(--text) 8%, transparent));
}

.rc-btn:active {
  transform: translateY(1px);
}

.rc-sm {
  font-size: var(--text-xs);
  color: var(--text-faint);
}

.rc-arrow {
  font-size: 12px;
}

.rc-ok {
  font-weight: 600;
  border-radius: 50%;
  aspect-ratio: 1;
}

.rc-colors .rc-btn {
  min-height: 14px;
  border: none;
}

.rc-red {
  background: #d9534f;
}

.rc-green {
  background: #3fa34d;
}

.rc-yellow {
  background: #e0b33a;
}

.rc-blue {
  background: #3a7bd5;
}

.rc-wide {
  width: 100%;
}

.rc-link {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent, var(--text-faint));
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}

</style>

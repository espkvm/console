<script setup lang="ts">
/*
 * Notifications in this browser (Web Push), in Settings, Notifications. The
 * browser subscribes with its own push service (Google's for Chrome and Edge,
 * Mozilla's for Firefox, Apple's for Safari) and the device gets the
 * subscription. It signs with its own key, so there is no account to make.
 * Below: every browser the device sends to, with a button to drop it.
 */
import { computed, onMounted, ref } from "vue";

import { demoPushOn, demoPushStart, demoPushStop } from "../demo/push";

import {
  getPush,
  pushRemove,
  pushSubscribe,
  type PushBrowser,
} from "../state/device";
import { toast } from "../state/toasts";

const ID_KEY = "espkvm.push.id";

const browsers = ref<PushBrowser[]>([]);
const key = ref("");
const mine = ref<PushSubscription | null>(null);
const myId = ref<number | null>(null);
const busy = ref(false);
const loaded = ref(false);

const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone =
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/* Why this browser cannot, or "" when it can. */
const why = computed(() => {
  if (!window.isSecureContext) return "Needs the console over HTTPS.";
  if (isIos && !standalone)
    return "On an iPhone or iPad: Share, Add to Home Screen, then open the console from there.";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return "This browser has no Web Push.";
  return "";
});

function readId(): number | null {
  try {
    const v = localStorage.getItem(ID_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function writeId(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(ID_KEY);
    else localStorage.setItem(ID_KEY, String(id));
  } catch {
    /* only marks "this browser" in the list */
  }
}

/* "Chrome on Windows", for the list. */
function browserName(): string {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${b} on ${os}` : b;
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(
    b64.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (b64.length % 4)) % 4),
  );
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  return navigator.serviceWorker.register("/sw.js").catch(() => null);
}

async function load() {
  try {
    const info = await getPush();
    key.value = info.key;
    browsers.value = info.browsers;
    if (!why.value) {
      const reg = await registration();
      mine.value = (await reg?.pushManager.getSubscription()) ?? null;
    }
    myId.value = mine.value ? readId() : null;
    if (DEMO) demoShowMine();
  } catch {
    /* an older firmware: the block stays hidden */
  } finally {
    loaded.value = true;
  }
}
onMounted(() => void load());

/* The demo has nothing to push from: src/demo/push.ts shows a sample alert instead. */
const DEMO = import.meta.env.MODE === "demo";
const DEMO_ID = 999;
async function demoTurnOn() {
  await demoPushStart();
  demoShowMine();
  toast.info(
    "On. Switch to another tab: in 3 seconds an alert comes, the way the device sends one.",
  );
}
function demoShowMine() {
  if (!demoPushOn.value || browsers.value.some((b) => b.id === DEMO_ID)) return;
  browsers.value = [
    ...browsers.value,
    {
      id: DEMO_ID,
      name: browserName(),
      host: "",
      added: Math.floor(Date.now() / 1000),
    },
  ];
  myId.value = DEMO_ID;
}

async function turnOn() {
  busy.value = true;
  try {
    if ((await Notification.requestPermission()) !== "granted") {
      toast.error(
        "The browser said no. Allow notifications for this site in its settings.",
      );
      return;
    }
    if (DEMO) {
      await demoTurnOn();
      return;
    }
    const reg = await registration();
    if (!reg) {
      toast.error(
        "No service worker here. Is the device's certificate trusted?",
      );
      return;
    }
    let sub = await reg.pushManager.getSubscription();
    /* A subscription made for another key (a reset device) cannot be reused. */
    const want = keyBytes(key.value);
    const has = sub?.options.applicationServerKey;
    if (sub && has && !new Uint8Array(has).every((b, i) => b === want[i])) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: want,
    });
    const id = await pushSubscribe(sub.toJSON(), browserName());
    writeId(id);
    toast.info(
      "This browser gets the notifications now. Send a test to check.",
    );
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    busy.value = false;
    if (!DEMO) await load();
  }
}

async function remove(b: PushBrowser) {
  if (DEMO) {
    browsers.value = browsers.value.filter((x) => x.id !== b.id);
    if (b.id === DEMO_ID) demoPushStop();
    return;
  }
  busy.value = true;
  try {
    await pushRemove({ id: b.id });
    if (b.id === myId.value && mine.value) {
      await mine.value.unsubscribe().catch(() => {});
      writeId(null);
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    busy.value = false;
    await load();
  }
}

const subscribedHere = computed(
  () =>
    ((DEMO && demoPushOn.value) || mine.value !== null) &&
    browsers.value.some((b) => b.id === myId.value),
);

function when(t: number): string {
  return t ? new Date(t * 1000).toLocaleDateString() : "";
}
</script>

<template>
  <div v-if="loaded && key" class="setting push">
    <div class="setting-head">
      <label class="setting-title">Notifications in this browser</label>
    </div>
    <p class="setting-note">
      Web Push: alerts come to this browser like any app's, also with the
      console closed. No account or bot needed.
    </p>
    <p v-if="why" class="setting-note">{{ why }}</p>
    <p v-else-if="!subscribedHere" class="push-actions">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="busy"
        @click="turnOn"
      >
        Send them to this browser
      </button>
    </p>

    <table v-if="browsers.length" class="push-list">
      <tbody>
        <tr v-for="b in browsers" :key="b.id">
          <td>
            {{ b.name || "A browser" }}
            <small v-if="b.id === myId && subscribedHere">(this one)</small>
          </td>
          <td class="muted">{{ when(b.added) }}</td>
          <td class="num">
            <button
              type="button"
              class="btn btn-sm"
              :disabled="busy"
              @click="remove(b)"
            >
              Remove
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.push-actions {
  margin: var(--space-2) 0;
}

.push-list {
  width: 100%;
  margin-top: var(--space-2);
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.push-list td {
  padding: 4px 6px 4px 0;
  border-bottom: 1px solid var(--border-subtle, var(--border));
}

.push-list .num {
  text-align: right;
}

.push-list .muted,
.push-list small {
  color: var(--text-muted);
}
</style>

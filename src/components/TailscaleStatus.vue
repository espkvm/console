<script setup lang="ts">
/*
 * Tailscale in the VPN section: where the client is, the link to sign in when
 * there is no auth key, the relay, and each peer with how traffic reaches it
 * (straight or through the relay) and how long a round trip takes. Asked every
 * few seconds while the section is open.
 */
import { computed, onUnmounted, ref } from "vue";

import { getTailscale, tailscaleLogout, type TailscaleStatus } from "../state/device";
import { toast } from "../state/toasts";
import { copyToClipboard } from "../ui/clipboard";

const st = ref<TailscaleStatus | null>(null);
const missing = ref(false);
const busy = ref(false);

async function load() {
  if (missing.value || document.visibilityState !== "visible") return;
  try {
    st.value = await getTailscale();
  } catch (e) {
    if (String(e).includes("404")) missing.value = true;
  }
}
void load();
const timer = setInterval(() => void load(), 3000);
onUnmounted(() => clearInterval(timer));

const line = computed(() => {
  const s = st.value;
  if (!s) return "";
  switch (s.state) {
    case "up":
      return s.name ? "On the tailnet as" : `On the tailnet at ${s.address}`;
    case "login":
      return "Waiting for you to sign in to Tailscale and approve this device.";
    case "refused":
      return `The control server refused the device: ${s.error}`;
    case "connecting":
      return "Connecting to the control server...";
    case "waiting":
      return "Waiting for the network.";
    default:
      return "";
  }
});

const relay = computed(() => {
  const r = st.value?.relay;
  if (!r?.region) return "";
  return r.up ? `Relay: ${r.region}` : `Relay: ${r.region}, not connected`;
});

/* Online first, then by name. */
const peers = computed(() =>
  [...(st.value?.peers ?? [])].sort(
    (a, b) => Number(b.online !== false) - Number(a.online !== false) || a.name.localeCompare(b.name),
  ),
);

function short(name: string): string {
  return name.split(".")[0] || name;
}

function pathText(p: TailscaleStatus["peers"][number]): string {
  if (p.online === false) return "offline";
  if (p.path === "direct") return "direct";
  return p.relay ? `relay ${p.relay}` : "relay";
}

/* The console's address on the tailnet: the MagicDNS name. */
const link = computed(() => (st.value?.state === "up" && st.value.name ? `https://${st.value.name}/` : ""));

async function copyLink() {
  if (await copyToClipboard(link.value)) toast.info("Copied");
  else toast.error("The browser would not copy it");
}

async function logout() {
  if (!confirm("Take this device off the tailnet? It forgets its keys and the auth key, and the next start asks for a sign-in again.")) return;
  busy.value = true;
  try {
    await tailscaleLogout();
    toast.info("Off the tailnet. Remove the old entry in the Tailscale admin console.");
    await load();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="st && st.state !== 'off'" class="setting ts">
    <div class="setting-head">
      <label class="setting-title">Status</label>
    </div>
    <p class="setting-note">
      {{ line }}
      <template v-if="link">
        <a :href="link" target="_blank" rel="noopener noreferrer" class="mono">{{ st.name }}</a>
        ({{ st.address }})
        <button type="button" class="btn btn-sm ts-copy" title="Copy the address" @click="copyLink">Copy</button>
      </template>
    </p>
    <p v-if="st.state === 'login' && st.loginUrl" class="ts-login">
      <a class="btn btn-sm btn-primary" :href="st.loginUrl" target="_blank" rel="noopener noreferrer">
        Sign in to Tailscale
      </a>
      <small>No auth key needed. Approve the device on the page that opens. It joins within a few seconds.</small>
    </p>
    <p v-if="relay" class="setting-note">{{ relay }}</p>

    <table v-if="peers.length" class="ts-peers">
      <thead>
        <tr>
          <th>Device</th>
          <th>Owner</th>
          <th>Path</th>
          <th class="num">Ping</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in peers" :key="p.ip" :class="{ 'ts-off': p.online === false }">
          <td :title="`${p.name}\n${p.ip}`">{{ short(p.name) }}</td>
          <td :title="p.user">{{ p.userName || p.user.split("@")[0] }}</td>
          <td :title="p.endpoint || undefined" :class="{ 'ts-direct': p.path === 'direct' && p.online !== false }">
            {{ pathText(p) }}
          </td>
          <td class="num mono" :title="p.ms ? (p.msDirect ? 'straight' : 'through the relay') : undefined">
            {{ p.ms ? `${p.ms} ms` : "" }}
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="st.state === 'up' || st.state === 'refused'" class="ts-actions">
      <button type="button" class="btn btn-sm" :disabled="busy" @click="logout">Log out of the tailnet</button>
    </p>
  </div>
</template>

<style scoped>
.ts-login {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.ts-copy {
  margin-left: var(--space-1);
  vertical-align: baseline;
}

.ts-login small {
  color: var(--text-muted);
}

.ts-peers {
  width: 100%;
  margin-top: var(--space-2);
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.ts-peers th {
  text-align: left;
  font-weight: 500;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
  padding: 2px 6px 2px 0;
}

.ts-peers td {
  padding: 3px 6px 3px 0;
  border-bottom: 1px solid var(--border-subtle, var(--border));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 14em;
}

.ts-peers .num {
  text-align: right;
}

.ts-off td {
  color: var(--text-muted);
}

.ts-direct {
  color: var(--ok, var(--accent));
}

.ts-actions {
  margin-top: var(--space-2);
}
</style>

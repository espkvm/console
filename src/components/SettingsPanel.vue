<script setup lang="ts">
/*
 * The settings panel renders itself from the schema the device serves, so a
 * setting added to the firmware table appears here with its title, range and
 * help text without any change in this file.
 *
 * A control whose capability the hardware lacks is shown disabled carrying the
 * device's own reason, rather than hidden. Hiding it would leave the operator
 * wondering whether the feature exists at all.
 */
import { computed, onMounted, ref } from "vue";

import {
  SECTION_ORDER,
  SECTION_TITLES,
  type Capability,
  type Setting,
  type TlsStatus,
  type Values,
  getTlsStatus,
  installCert,
  resetSettings,
  restartDevice,
  revertCert,
  saveSettings,
  settingBlockedReason,
} from "../state/device";
import { changePassword } from "../state/auth";
import { toast } from "../state/toasts";

const props = defineProps<{
  schema: Setting[];
  values: Values;
  caps: Record<string, Capability>;
  /** The device's own WireGuard public key (from system info), to add to the hub. */
  wgPublicKey?: string;
}>();

const emit = defineEmits<{ values: [Values]; passwordChanged: [] }>();

const sections = computed(() => {
  const present = new Set(props.schema.map((s) => s.section));
  return SECTION_ORDER.filter((s) => present.has(s));
});

const active = ref("");
const currentSection = computed(() => active.value || sections.value[0] || "video");
const busy = ref(false);

const rows = computed(() => props.schema.filter((s) => s.section === currentSection.value));

/*
 * The VPN section is special. WireGuard and Tailscale are mutually exclusive on
 * the device, and showing every field of both at once means scrolling past the
 * backend you are not using. So the two enable toggles collapse into one
 * Off/WireGuard/Tailscale selector, and only the chosen backend's fields are
 * shown (nothing when Off).
 */
const VPN_WG_KEYS = new Set([
  "wg_address",
  "wg_private_key",
  "wg_peer_key",
  "wg_endpoint",
  "wg_keepalive",
  "wg_sntp",
  "wg_sntp_srv",
]);
const VPN_TS_KEYS = new Set(["ts_auth_key", "ts_hostname", "ts_ctrl_tls"]);

type VpnMode = "off" | "wg" | "ts";
const vpnMode = computed<VpnMode>(() =>
  props.values.wg_enable ? "wg" : props.values.ts_enable ? "ts" : "off",
);

const displayRows = computed(() => {
  if (currentSection.value !== "vpn") return rows.value;
  const mode = vpnMode.value;
  return rows.value.filter((r) => {
    if (r.key === "wg_enable" || r.key === "ts_enable") return false;
    if (mode === "wg") return VPN_WG_KEYS.has(r.key);
    if (mode === "ts") return VPN_TS_KEYS.has(r.key);
    return false;
  });
});

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.info("Copied to clipboard");
  } catch {
    toast.error("Could not copy - select and copy it manually");
  }
}

async function setVpnMode(mode: VpnMode) {
  if (mode === vpnMode.value) return;
  /* Enabling one backend clears the other on the device, so we only ever write a
     single flag; for Off we clear whichever is currently on. write() persists and
     refreshes values, so the visible fields follow the selection. */
  if (mode === "wg") await write("wg_enable", true);
  else if (mode === "ts") await write("ts_enable", true);
  else await write(props.values.wg_enable ? "wg_enable" : "ts_enable", false);
}

/* When one missing capability blocks the whole section, say so once at the top
   rather than repeating the same sentence under every control. */
const sectionBlocked = computed(() => {
  const blockers = rows.value.map((r) => settingBlockedReason(r, props.caps));
  return rows.value.length > 0 && blockers.every((b) => b !== null && b === blockers[0])
    ? blockers[0]
    : null;
});

function blockedFor(s: Setting): string | null {
  return sectionBlocked.value ? null : settingBlockedReason(s, props.caps);
}

async function write(key: string, value: number | string | boolean) {
  busy.value = true;
  try {
    emit("values", await saveSettings({ [key]: value }));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = false;
  }
}

/*
 * A secret (a VPN key) is write-only: the device never sends it back, so the
 * field always shows empty. Submitting an empty field would clear the stored
 * value, which is never what a blank means here - blank means "keep what's
 * there". So only write when something was typed, and wipe the field afterwards
 * so the secret does not linger in the DOM.
 */
async function writeSecret(key: string, el: HTMLInputElement) {
  const value = el.value;
  if (!value) return;
  el.value = "";
  await write(key, value);
}


/*
 * Changing the password.
 *
 * It is not a setting and deliberately so: the settings API reads and writes
 * plain values, and a password that can be read back is not a password. It
 * goes to its own endpoint, which demands the current one and stores only a
 * salted hash.
 */
const currentPassword = ref("");
const newPassword = ref("");
const repeatPassword = ref("");
const changingPassword = ref(false);

const passwordTooShort = computed(
  () => newPassword.value.length > 0 && newPassword.value.length < 8,
);
const passwordMismatch = computed(
  () => repeatPassword.value.length > 0 && newPassword.value !== repeatPassword.value,
);

async function submitPassword() {
  if (passwordTooShort.value || passwordMismatch.value || !newPassword.value) return;
  changingPassword.value = true;
  try {
    await changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = "";
    newPassword.value = "";
    repeatPassword.value = "";
    /* Every session ended, including this one - the console has to send the
     * operator back to the sign-in form rather than pretend otherwise. */
    emit("passwordChanged");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    changingPassword.value = false;
  }
}

async function doRestart() {
  if (!confirm("Restart the device? It drops off the network for a few seconds. The target is not affected.")) {
    return;
  }
  try {
    await restartDevice();
    toast.info("Restarting - the console will reconnect on its own");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}

async function doReset() {
  if (!confirm("Restore every setting to its default?")) return;
  busy.value = true;
  try {
    emit("values", await resetSettings());
    toast.info("Settings restored to defaults");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = false;
  }
}

/*
 * Bring-your-own TLS certificate. Not a setting: it is a PEM blob validated and
 * stored on its own endpoint, and installing or removing it restarts the device.
 * `tls` stays null on firmware without the endpoint, so the panel just shows the
 * CA download in that case.
 */
const tls = ref<TlsStatus | null>(null);
const certText = ref("");
const tlsBusy = ref(false);

onMounted(async () => {
  try {
    tls.value = await getTlsStatus();
  } catch {
    /* older firmware without /api/v1/tls: leave null, show the CA download only */
  }
});

async function loadCertFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) certText.value = await file.text();
}

async function doInstallCert() {
  if (!certText.value.trim()) return;
  tlsBusy.value = true;
  try {
    await installCert(certText.value);
    certText.value = "";
    tls.value = { https: true, custom: true };
    toast.info("Certificate installed - the device is restarting to apply it");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    tlsBusy.value = false;
  }
}

async function doRevertCert() {
  if (!confirm("Remove your certificate and go back to the self-signed one? The device restarts.")) {
    return;
  }
  tlsBusy.value = true;
  try {
    await revertCert();
    tls.value = { https: true, custom: false };
    toast.info("Reverting to the self-signed certificate - the device is restarting");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    tlsBusy.value = false;
  }
}
</script>

<template>
  <div class="settings">
    <div class="tabs" role="tablist">
      <button
        v-for="s in sections"
        :key="s"
        type="button"
        role="tab"
        :aria-selected="s === currentSection"
        :class="['tab', { 'tab-active': s === currentSection }]"
        @click="active = s"
      >
        {{ SECTION_TITLES[s] ?? s }}
      </button>
    </div>

    <p v-if="sectionBlocked" class="section-blocked">{{ sectionBlocked }}</p>

    <div class="settings-list">
      <div v-if="currentSection === 'vpn'" class="setting">
        <div class="setting-head">
          <label class="setting-title" for="vpn-mode">VPN backend</label>
        </div>
        <div class="setting-control">
          <select
            id="vpn-mode"
            :value="vpnMode"
            :disabled="busy"
            @change="setVpnMode(($event.target as HTMLSelectElement).value as VpnMode)"
          >
            <option value="off">Off</option>
            <option value="wg">WireGuard</option>
            <option value="ts">Tailscale</option>
          </select>
        </div>
        <p class="setting-note">
          Only one VPN runs at a time; choosing one shows just its settings.
        </p>
      </div>

      <div
        v-for="s in displayRows"
        :key="s.key"
        :class="['setting', { 'setting-blocked': busy || sectionBlocked || blockedFor(s) }]"
      >
        <div class="setting-head">
          <label class="setting-title" :for="`set-${s.key}`">{{ s.title }}</label>
          <span v-if="s.reboot" class="badge" title="Applies after a restart">restart</span>
        </div>

        <div class="setting-control">
          <label v-if="s.type === 'bool'" class="switch">
            <input
              :id="`set-${s.key}`"
              type="checkbox"
              :checked="Boolean(values[s.key])"
              :disabled="busy || !!sectionBlocked || !!blockedFor(s)"
              @change="write(s.key, ($event.target as HTMLInputElement).checked)"
            />
            <span class="muted">{{ values[s.key] ? "On" : "Off" }}</span>
          </label>

          <select
            v-else-if="s.type === 'enum'"
            :id="`set-${s.key}`"
            :disabled="busy || !!sectionBlocked || !!blockedFor(s)"
            :value="String(Number(values[s.key] ?? 0))"
            @change="write(s.key, Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="(c, i) in s.choices ?? []" :key="c" :value="String(i)">{{ c }}</option>
          </select>

          <input
            v-else-if="s.type === 'int'"
            :id="`set-${s.key}`"
            type="number"
            class="num-input"
            :min="s.min"
            :max="s.max"
            :value="Number(values[s.key] ?? 0)"
            :disabled="busy || !!sectionBlocked || !!blockedFor(s)"
            @change="write(s.key, Number(($event.target as HTMLInputElement).value))"
          />

          <input
            v-else-if="s.secret"
            :id="`set-${s.key}`"
            type="password"
            autocomplete="off"
            :maxlength="s.maxLength"
            placeholder="Leave blank to keep the current value"
            :disabled="busy || !!sectionBlocked || !!blockedFor(s)"
            @change="writeSecret(s.key, $event.target as HTMLInputElement)"
          />

          <input
            v-else
            :id="`set-${s.key}`"
            type="text"
            :maxlength="s.maxLength"
            :value="String(values[s.key] ?? '')"
            :disabled="busy || !!sectionBlocked || !!blockedFor(s)"
            @change="write(s.key, ($event.target as HTMLInputElement).value)"
          />
        </div>

        <p v-if="blockedFor(s)" class="setting-note setting-note-blocked">{{ blockedFor(s) }}</p>
        <p v-else-if="s.help" class="setting-note">{{ s.help }}</p>
      </div>

      <div
        v-if="currentSection === 'vpn' && vpnMode === 'wg' && wgPublicKey"
        class="setting"
      >
        <div class="setting-head">
          <label class="setting-title">Device public key</label>
        </div>
        <div class="setting-control pubkey-row">
          <input class="pubkey-field mono" type="text" :value="wgPublicKey" readonly />
          <button type="button" class="btn btn-sm" @click="copyText(wgPublicKey!)">Copy</button>
        </div>
        <p class="setting-note">
          Add this to your WireGuard hub as this device's peer public key.
        </p>
      </div>
    </div>

    <form
      v-if="currentSection === 'security'"
      class="firmware"
      @submit.prevent="submitPassword"
    >
      <h3>Password</h3>
      <p class="setting-note">
        Not listed above with the other settings: those can be read back, and a password that
        can be read back is not one. Changing it signs out every open console.
      </p>
      <label class="field">
        <span>Current password</span>
        <input v-model="currentPassword" type="password" autocomplete="current-password" />
      </label>
      <label class="field">
        <span>New password</span>
        <input v-model="newPassword" type="password" autocomplete="new-password" />
      </label>
      <label class="field">
        <span>Repeat it</span>
        <input v-model="repeatPassword" type="password" autocomplete="new-password" />
      </label>
      <p v-if="passwordTooShort" class="setting-note">At least 8 characters.</p>
      <p v-else-if="passwordMismatch" class="setting-note">The two do not match.</p>
      <button
        type="submit"
        class="btn btn-sm"
        :disabled="changingPassword || passwordTooShort || passwordMismatch || !newPassword"
      >
        {{ changingPassword ? "Changing..." : "Change password" }}
      </button>
    </form>

    <div v-if="currentSection === 'security'" class="firmware">
      <h3>Device certificate</h3>

      <template v-if="tls?.custom">
        <p class="setting-note">
          The device is serving your own certificate. Whatever issued it is trusted elsewhere, so
          there is no CA to import here. Remove it to go back to the self-signed certificate.
        </p>
        <button type="button" class="btn btn-sm" :disabled="tlsBusy" @click="doRevertCert">
          {{ tlsBusy ? "Reverting..." : "Revert to the self-signed certificate" }}
        </button>
      </template>

      <template v-else>
        <p class="setting-note">
          The device is its own certificate authority, so a browser warns until you trust it - and
          refuses the WebSocket and the H.264 decoder until you do. Download the CA and add it to
          your operating system or browser's trusted authorities (not "your certificates"), then
          reach the device by its name. That clears the warning and enables H.264.
        </p>
        <a class="btn btn-sm" href="/cert.pem" download="espkvm-ca.pem">Download CA certificate</a>

        <template v-if="tls">
          <p class="setting-note" style="margin-top: 16px">
            Or install your own certificate - from an internal CA, or a real one for a name that
            resolves to the device - so the browser trusts it without importing anything. Paste the
            certificate (chain, leaf first) followed by its private key, or pick a combined PEM
            file. The device restarts to apply it.
          </p>
          <textarea
            v-model="certText"
            class="cert-input"
            rows="6"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----&#10;-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
          ></textarea>
          <div class="cert-actions">
            <input type="file" accept=".pem,.crt,.cer,.key,.txt" @change="loadCertFile" />
            <button
              type="button"
              class="btn btn-sm"
              :disabled="tlsBusy || !certText.trim()"
              @click="doInstallCert"
            >
              {{ tlsBusy ? "Installing..." : "Install certificate" }}
            </button>
          </div>
        </template>
      </template>
    </div>

    <div class="settings-footer">
      <button type="button" class="btn btn-sm" @click="doRestart">Restart device</button>
      <button type="button" class="btn btn-sm btn-danger" :disabled="busy" @click="doReset">
        Restore defaults
      </button>
    </div>
  </div>
</template>

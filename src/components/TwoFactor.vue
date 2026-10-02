<script setup lang="ts">
/*
 * Two-factor sign-in: a six-digit code from an authenticator app after the
 * password. Set up by scanning a QR code the device draws, confirmed with one
 * code, and backed by eight one-time recovery codes for a lost phone. The reset
 * button on the board clears it with the password.
 */
import { computed, ref } from "vue";

import {
  loadSession,
  twoFactorBegin,
  twoFactorDisable,
  twoFactorEnable,
  twoFactorRecovery,
  type TwoFactorSetup,
} from "../state/auth";

const on = ref(false);
const setup = ref<TwoFactorSetup | null>(null);
const recovery = ref<string[]>([]);
const password = ref("");
const code = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
/* What the password and code fields are for right now. */
const mode = ref<"idle" | "enable" | "disable" | "recovery">("idle");

void loadSession()
  .then((s) => {
    on.value = Boolean(s.twoFactor);
  })
  .catch(() => {});

/* The QR code as one SVG path: a square per dark module. */
const qrPath = computed(() => {
  const s = setup.value;
  if (!s || !s.qrSize) return "";
  let d = "";
  for (let y = 0; y < s.qrSize; y++) {
    for (let x = 0; x < s.qrSize; x++) {
      if (s.qr[y * s.qrSize + x] === "1") d += `M${x + 4} ${y + 4}h1v1h-1z`;
    }
  }
  return d;
});

function reset() {
  password.value = "";
  code.value = "";
  error.value = null;
}

async function run(fn: () => Promise<void>) {
  busy.value = true;
  error.value = null;
  try {
    await fn();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

function start() {
  void run(async () => {
    reset();
    recovery.value = [];
    setup.value = await twoFactorBegin();
    mode.value = "enable";
  });
}

function submit() {
  void run(async () => {
    if (mode.value === "enable") {
      recovery.value = await twoFactorEnable(password.value, code.value.trim());
      on.value = true;
      setup.value = null;
    } else if (mode.value === "disable") {
      await twoFactorDisable(password.value, code.value.trim());
      on.value = false;
      recovery.value = [];
    } else if (mode.value === "recovery") {
      recovery.value = await twoFactorRecovery(password.value, code.value.trim());
    }
    mode.value = "idle";
    reset();
  });
}

function cancel() {
  mode.value = "idle";
  setup.value = null;
  reset();
}

function downloadCodes() {
  const text =
    "ESP-KVM recovery codes - each works once, in place of the app's code.\n\n" +
    recovery.value.join("\n") +
    "\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = "espkvm-recovery-codes.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <div class="firmware">
    <h3>Two-factor sign-in</h3>
    <p class="setting-note">
      After the password, a six-digit code from an authenticator app (Google Authenticator, Aegis,
      1Password and the like). The reset button on the board turns it off with the password.
      <template v-if="on"> <strong>It is on.</strong></template>
    </p>

    <div v-if="recovery.length" class="tf-codes">
      <p class="setting-note">
        <strong>Recovery codes.</strong> Each works once in place of the app's code, if the phone
        is lost. Keep them somewhere safe - this is the only time they are shown.
      </p>
      <ul class="mono">
        <li v-for="c in recovery" :key="c">{{ c }}</li>
      </ul>
      <button type="button" class="btn btn-sm" @click="downloadCodes">Download them</button>
      <button type="button" class="btn btn-sm btn-quiet" @click="recovery = []">I have saved them</button>
    </div>

    <template v-if="mode === 'idle'">
      <button v-if="!on" type="button" class="btn btn-sm" :disabled="busy" @click="start">
        Turn on two-factor sign-in
      </button>
      <template v-else>
        <button type="button" class="btn btn-sm" :disabled="busy" @click="mode = 'recovery'">
          New recovery codes
        </button>
        <button type="button" class="btn btn-sm" :disabled="busy" @click="mode = 'disable'">
          Turn it off
        </button>
      </template>
    </template>

    <form v-else @submit.prevent="submit">
      <template v-if="mode === 'enable' && setup">
        <p class="setting-note">Scan this in the app, then type the code it shows.</p>
        <svg
          v-if="qrPath"
          class="tf-qr"
          :viewBox="`0 0 ${setup.qrSize + 8} ${setup.qrSize + 8}`"
          shape-rendering="crispEdges"
          role="img"
          aria-label="QR code to add this device to an authenticator app"
        >
          <rect :width="setup.qrSize + 8" :height="setup.qrSize + 8" fill="#fff" />
          <path :d="qrPath" fill="#000" />
        </svg>
        <p class="setting-note">
          Or type the key by hand: <code class="mono tf-secret">{{ setup.secret }}</code>
        </p>
      </template>
      <p v-else class="setting-note">
        {{
          mode === "disable"
            ? "To turn it off, your password and a code from the app (or a recovery code)."
            : "New codes need your password and a code from the app; the old ones stop working."
        }}
      </p>
      <label class="field">
        <span>Password</span>
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <label class="field">
        <span>Code</span>
        <input
          v-model="code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="9"
          placeholder="123456"
        />
      </label>
      <p v-if="error" class="setting-note setting-note-blocked">{{ error }}</p>
      <button type="submit" class="btn btn-sm" :disabled="busy || !password || !code">
        {{ mode === "enable" ? "Turn on" : mode === "disable" ? "Turn off" : "Make new codes" }}
      </button>
      <button type="button" class="btn btn-sm btn-quiet" :disabled="busy" @click="cancel">Cancel</button>
    </form>
    <p v-if="error && mode === 'idle'" class="setting-note setting-note-blocked">{{ error }}</p>
  </div>
</template>

<style scoped>
.tf-qr {
  width: 200px;
  height: 200px;
  display: block;
  margin: 0.5rem 0;
}
.tf-secret {
  word-break: break-all;
}
.tf-codes ul {
  columns: 2;
  margin: 0.5rem 0;
  padding-left: 1.2rem;
}
</style>

<script setup lang="ts">
/*
 * The way in.
 *
 * Two states in one view: signing in, and - when the device is still on the
 * password it shipped with - changing it before anything else is allowed. The
 * second is not a nag that can be dismissed: a KVM left on its default
 * password is a keyboard plugged into someone else's machine, offered to
 * whoever finds it.
 */
import { computed, ref } from "vue";

import { changePassword, login, NeedCode, type SetupNetworkKind } from "../state/auth";
import { peekRestart } from "../state/restart";
import Icon from "./Icon.vue";

const props = defineProps<{
  user: string;
  mustChange: boolean;
  setupNetwork?: SetupNetworkKind[] | null;
}>();
const emit = defineEmits<{ authenticated: []; changed: [] }>();

const password = ref("");
const username = ref(props.user || "admin");
const nextPassword = ref("");
const confirmPassword = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
/* Two-factor: the password was right, the app's code comes next. */
const needCode = ref(false);
const code = ref("");

/*
 * Why the sign-in page is showing at all.
 *
 * A restart ends the session, so an operator who asked for one lands here with
 * no idea whether it worked. The version cannot be read before signing in, so
 * this only says what was asked for; the answer comes as a banner once inside.
 */
const restartNote = peekRestart();
const restartLine = computed(() => {
  if (!restartNote) return null;
  switch (restartNote.kind) {
    case "update":
      return "The device restarted after an update. Sign in to see which version came back.";
    case "slot":
      return "The device restarted onto the other slot. Sign in to see which version came back.";
    case "network":
      return "The network was switched, which restarts the device. Sign in to carry on.";
    default:
      return "The device restarted, so the session ended. Sign in to carry on.";
  }
});

/*
 * The first password over the setup hotspot. Setting it closes the open
 * hotspot (the device restarts), so it has to say where the device goes next -
 * on a board with no network port there is no other way back in.
 */
const netChoices = computed(() => props.setupNetwork ?? []);
const netKind = ref<SetupNetworkKind | "">("");
const ssid = ref("");
const wifiPass = ref("");
const apPass = ref("");
/* After the restart: what to do to find the device again. */
const doneNote = ref<string | null>(null);

const netProblem = computed(() => {
  if (!netChoices.value.length) return null;
  switch (netKind.value) {
    case "":
      return "Choose how the device reaches a network.";
    case "wifi":
      if (!ssid.value.trim()) return "Type the WiFi network name.";
      if (wifiPass.value.length > 0 && wifiPass.value.length < 8)
        return "A WiFi password has at least 8 characters.";
      return null;
    case "ap":
      return apPass.value.length >= 8 ? null : "The hotspot password needs at least 8 characters.";
    default:
      return null;
  }
});

function setupBody() {
  if (!netChoices.value.length || !netKind.value) return undefined;
  if (netKind.value === "wifi")
    return { network: netKind.value, ssid: ssid.value.trim(), wifiPass: wifiPass.value };
  if (netKind.value === "ap") return { network: netKind.value, apPass: apPass.value };
  return { network: netKind.value };
}

function afterRestart(kind: SetupNetworkKind | ""): string {
  switch (kind) {
    case "wifi":
      return `The device restarts and joins "${ssid.value.trim()}". Connect this phone or computer to that network and open http://espkvm.local/ - or look for the device's address in your router.`;
    case "ap":
      return "The device restarts. Join its hotspot again, now with the password you just chose, and open http://192.168.4.1/.";
    default:
      return "The device restarts. Plug in the network cable, then open http://espkvm.local/ - or look for the device's address in your router.";
  }
}

const mismatch = computed(
  () => confirmPassword.value.length > 0 && nextPassword.value !== confirmPassword.value,
);
const tooShort = computed(() => nextPassword.value.length > 0 && nextPassword.value.length < 8);

/* The eye: a password typed on a phone, or into a device in a rack, is worth
   being able to read back. */
const showPassword = ref(false);

/*
 * Ask the browser to remember it.
 *
 * A single page never navigates, and this form is removed the moment the
 * password is accepted, which is exactly when a browser decides whether to
 * offer saving - so the offer was hit and miss. The credential manager asks
 * outright, on the browsers that have it, and the form keeps its name and id
 * attributes for the ones that do not.
 */
async function rememberCredentials() {
  const withCred = window as unknown as {
    PasswordCredential?: new (data: { id: string; password: string }) => Credential;
  };
  if (!withCred.PasswordCredential || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(
      new withCred.PasswordCredential({ id: username.value, password: password.value }),
    );
  } catch {
    /* refused or unsupported: the browser's own prompt may still appear */
  }
}

async function submitLogin() {
  busy.value = true;
  error.value = null;
  try {
    const mustChange = await login(username.value, password.value, needCode.value ? code.value.trim() : "");
    await rememberCredentials();
    if (!mustChange) password.value = "";
    code.value = "";
    emit("authenticated");
  } catch (err) {
    if (err instanceof NeedCode) {
      /* First time: just ask for it. A wrong one says so. */
      error.value = needCode.value ? err.message : null;
      needCode.value = true;
      code.value = "";
      return;
    }
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function submitChange() {
  if (mismatch.value || tooShort.value || netProblem.value) return;
  busy.value = true;
  error.value = null;
  try {
    const restarting = await changePassword(password.value, nextPassword.value, setupBody());
    password.value = "";
    nextPassword.value = "";
    confirmPassword.value = "";
    wifiPass.value = "";
    apPass.value = "";
    if (restarting) {
      doneNote.value = afterRestart(netKind.value);
      return;
    }
    emit("changed");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div v-if="doneNote" class="login-card" role="status">
      <h1>Password set</h1>
      <p class="login-hint">{{ doneNote }}</p>
    </div>
    <form v-else class="login-card" @submit.prevent="mustChange ? submitChange() : submitLogin()">
      <svg class="login-mark" viewBox="6 15 51 33" width="68" height="44" aria-hidden="true">
        <g fill="currentColor">
          <rect x="6" y="15" width="3" height="3" />
          <rect x="9" y="15" width="3" height="3" />
          <rect x="12" y="15" width="3" height="3" />
          <rect x="15" y="15" width="3" height="3" />
          <rect x="18" y="15" width="3" height="3" />
          <rect x="6" y="18" width="3" height="3" />
          <rect x="6" y="21" width="3" height="3" />
          <rect x="9" y="21" width="3" height="3" />
          <rect x="12" y="21" width="3" height="3" />
          <rect x="15" y="21" width="3" height="3" />
          <rect x="6" y="24" width="3" height="3" />
          <rect x="6" y="27" width="3" height="3" />
          <rect x="9" y="27" width="3" height="3" />
          <rect x="12" y="27" width="3" height="3" />
          <rect x="15" y="27" width="3" height="3" />
          <rect x="18" y="27" width="3" height="3" />
          <rect x="24" y="15" width="3" height="3" />
          <rect x="27" y="15" width="3" height="3" />
          <rect x="30" y="15" width="3" height="3" />
          <rect x="33" y="15" width="3" height="3" />
          <rect x="36" y="15" width="3" height="3" />
          <rect x="24" y="18" width="3" height="3" />
          <rect x="24" y="21" width="3" height="3" />
          <rect x="27" y="21" width="3" height="3" />
          <rect x="30" y="21" width="3" height="3" />
          <rect x="33" y="21" width="3" height="3" />
          <rect x="36" y="21" width="3" height="3" />
          <rect x="36" y="24" width="3" height="3" />
          <rect x="24" y="27" width="3" height="3" />
          <rect x="27" y="27" width="3" height="3" />
          <rect x="30" y="27" width="3" height="3" />
          <rect x="33" y="27" width="3" height="3" />
          <rect x="36" y="27" width="3" height="3" />
          <rect x="42" y="15" width="3" height="3" />
          <rect x="45" y="15" width="3" height="3" />
          <rect x="48" y="15" width="3" height="3" />
          <rect x="51" y="15" width="3" height="3" />
          <rect x="54" y="15" width="3" height="3" />
          <rect x="42" y="18" width="3" height="3" />
          <rect x="54" y="18" width="3" height="3" />
          <rect x="42" y="21" width="3" height="3" />
          <rect x="45" y="21" width="3" height="3" />
          <rect x="48" y="21" width="3" height="3" />
          <rect x="51" y="21" width="3" height="3" />
          <rect x="54" y="21" width="3" height="3" />
          <rect x="42" y="24" width="3" height="3" />
          <rect x="42" y="27" width="3" height="3" />
          <rect x="6" y="33" width="3" height="3" />
          <rect x="18" y="33" width="3" height="3" />
          <rect x="6" y="36" width="3" height="3" />
          <rect x="15" y="36" width="3" height="3" />
          <rect x="6" y="39" width="3" height="3" />
          <rect x="9" y="39" width="3" height="3" />
          <rect x="12" y="39" width="3" height="3" />
          <rect x="6" y="42" width="3" height="3" />
          <rect x="15" y="42" width="3" height="3" />
          <rect x="6" y="45" width="3" height="3" />
          <rect x="18" y="45" width="3" height="3" />
          <rect x="24" y="33" width="3" height="3" />
          <rect x="36" y="33" width="3" height="3" />
          <rect x="24" y="36" width="3" height="3" />
          <rect x="36" y="36" width="3" height="3" />
          <rect x="24" y="39" width="3" height="3" />
          <rect x="36" y="39" width="3" height="3" />
          <rect x="27" y="42" width="3" height="3" />
          <rect x="33" y="42" width="3" height="3" />
          <rect x="30" y="45" width="3" height="3" />
          <rect x="42" y="33" width="3" height="3" />
          <rect x="54" y="33" width="3" height="3" />
          <rect x="42" y="36" width="3" height="3" />
          <rect x="45" y="36" width="3" height="3" />
          <rect x="51" y="36" width="3" height="3" />
          <rect x="54" y="36" width="3" height="3" />
          <rect x="42" y="39" width="3" height="3" />
          <rect x="48" y="39" width="3" height="3" />
          <rect x="54" y="39" width="3" height="3" />
          <rect x="42" y="42" width="3" height="3" />
          <rect x="54" y="42" width="3" height="3" />
          <rect x="42" y="45" width="3" height="3" />
          <rect x="54" y="45" width="3" height="3" />
        </g>
      </svg>

      <template v-if="!mustChange">
        <h1>Sign in</h1>
        <p v-if="restartLine" class="login-hint">{{ restartLine }}</p>
        <label class="field">
          <span>Username</span>
          <input
            id="espkvm-username"
            v-model="username"
            name="username"
            type="text"
            autocomplete="username"
            autocapitalize="off"
          />
        </label>
        <label class="field">
          <span>Password</span>
          <span class="field-with-eye">
            <input
              id="espkvm-password"
              v-model="password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              autofocus
            />
            <button
              type="button"
              class="eye-btn"
              :aria-label="showPassword ? 'Hide the password' : 'Show the password'"
              :title="showPassword ? 'Hide the password' : 'Show the password'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Icon :name="showPassword ? 'eye-off' : 'eye'" :size="16" />
            </button>
          </span>
        </label>
        <label v-if="needCode" class="field">
          <span>Code from your authenticator app</span>
          <input
            id="espkvm-code"
            v-model="code"
            name="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="9"
            placeholder="123456"
            autofocus
          />
        </label>
        <p v-if="needCode" class="muted login-foot">
          Lost the phone? A recovery code works here too.
        </p>
      </template>

      <template v-else>
        <h1>Choose a password</h1>
        <!-- The browser needs to know which account the new password belongs
             to, or it saves it against nothing. -->
        <input
          :value="username"
          type="text"
          name="username"
          autocomplete="username"
          class="offscreen"
          tabindex="-1"
          aria-hidden="true"
          readonly
        />
        <p class="muted">
          This device is still using the password it shipped with. Everything else waits until
          that changes.
        </p>
        <label class="field">
          <span>New password</span>
          <input v-model="nextPassword" type="password" autocomplete="new-password" autofocus />
        </label>
        <label class="field">
          <span>Repeat it</span>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" />
        </label>
        <p v-if="tooShort" class="login-hint">At least 8 characters.</p>
        <p v-else-if="mismatch" class="login-hint">The two do not match.</p>

        <fieldset v-if="netChoices.length" class="login-net">
          <legend>After this, the device</legend>
          <p class="login-hint">
            Setting the password closes this open hotspot. Choose how to reach the device after
            that.
          </p>
          <label v-if="netChoices.includes('ethernet')" class="login-radio">
            <input v-model="netKind" type="radio" name="setup-net" value="ethernet" />
            <span>uses the network cable</span>
          </label>
          <label v-if="netChoices.includes('wifi')" class="login-radio">
            <input v-model="netKind" type="radio" name="setup-net" value="wifi" />
            <span>joins my WiFi</span>
          </label>
          <template v-if="netKind === 'wifi'">
            <label class="field">
              <span>WiFi network name</span>
              <input v-model="ssid" type="text" autocomplete="off" autocapitalize="off" maxlength="32" />
            </label>
            <label class="field">
              <span>WiFi password (blank for an open network)</span>
              <input v-model="wifiPass" type="password" autocomplete="off" maxlength="63" />
            </label>
          </template>
          <label v-if="netChoices.includes('ap')" class="login-radio">
            <input v-model="netKind" type="radio" name="setup-net" value="ap" />
            <span>keeps its own hotspot, with a password</span>
          </label>
          <label v-if="netKind === 'ap'" class="field">
            <span>Hotspot password</span>
            <input v-model="apPass" type="password" autocomplete="off" maxlength="63" />
          </label>
          <p v-if="netProblem && netKind" class="login-hint">{{ netProblem }}</p>
        </fieldset>
      </template>

      <p v-if="error" class="login-error">
        <Icon name="warning" :size="16" />
        {{ error }}
      </p>

      <button
        type="submit"
        class="btn btn-primary"
        :disabled="busy || (mustChange && (tooShort || mismatch || !nextPassword || !!netProblem))"
      >
        {{ busy ? "Working..." : mustChange ? "Set password" : "Sign in" }}
      </button>

      <p v-if="mustChange" class="muted login-foot">
        You will be asked to sign in again with the new password.
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
/*
 * A keyboard drawn on the page, for when the real one cannot be used: a phone
 * or tablet with no keys, a browser or an operating system that swallows a
 * combination (Ctrl+Alt+Delete, F11, the Windows key), or a layout that has no
 * key for what the target wants. It is never the main way in - the real
 * keyboard is, once the picture is engaged - so it stays closed until asked for.
 *
 * Keys are sent as positions, not characters: the same HID usages a real
 * keyboard would send, so the target's own layout decides what appears. Typing
 * a paragraph in another layout is what Paste text is for.
 *
 * Modifiers latch rather than needing two hands: one press arms a modifier for
 * the next key, a second press locks it until pressed again.
 */
import { computed, onUnmounted, ref, watch } from "vue";

import {
  HID_MOD_LALT,
  HID_MOD_LCTRL,
  HID_MOD_LGUI,
  HID_MOD_LSHIFT,
  HID_MOD_RALT,
  HID_MOD_RSHIFT,
  usageForCode,
} from "../input/keymap";
import type { Control } from "../input/control";
import Icon from "./Icon.vue";

const props = defineProps<{ control: Control; leds: number }>();
const emit = defineEmits<{ close: [] }>();

/*
 * Two shapes, because the two uses are different. Docked under the picture is
 * for working: the picture shrinks and nothing overlaps it. Floating is for the
 * one key that is in the way - it sits over the page and can be dragged off
 * whatever it covers. Compact drops the letters and keeps what a browser or an
 * operating system tends to swallow.
 */
const remembered = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
/* Skins: plain, or one that tints every key that is not a character, so the
   modifiers, the function row and the navigation block can be found without
   reading them. */
const SKINS = ["plain", "tinted"] as const;
const skin = ref(
  (SKINS as readonly string[]).includes(remembered("espkvm.osk.skin", "tinted"))
    ? remembered("espkvm.osk.skin", "tinted")
    : "tinted",
);

const floating = ref(remembered("espkvm.osk.floating", "0") === "1");
/* A phone gets the compact shape first: the full one fits, but its keys are
   narrow, and what a phone is usually missing is Esc, the F-row and arrows. */
const compact = ref(
  remembered("espkvm.osk.compact", window.innerWidth < 700 ? "1" : "0") === "1",
);
const pos = ref({
  x: Number(remembered("espkvm.osk.x", "24")),
  y: Number(remembered("espkvm.osk.y", "80")),
});
watch([floating, compact, skin], () => {
  try {
    localStorage.setItem("espkvm.osk.floating", floating.value ? "1" : "0");
    localStorage.setItem("espkvm.osk.compact", compact.value ? "1" : "0");
    localStorage.setItem("espkvm.osk.skin", skin.value);
  } catch {
    /* a private window; it just will not be remembered */
  }
});

/* Dragging the floating one by its header. */
let dragFrom: { x: number; y: number; px: number; py: number } | null = null;

function dragStart(e: PointerEvent) {
  if (!floating.value) return;
  dragFrom = { x: e.clientX, y: e.clientY, px: pos.value.x, py: pos.value.y };
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
}

function dragMove(e: PointerEvent) {
  if (!dragFrom) return;
  const x = dragFrom.px + (e.clientX - dragFrom.x);
  const y = dragFrom.py + (e.clientY - dragFrom.y);
  /* Never off the screen: a window that cannot be grabbed again is a trap. */
  pos.value = {
    x: Math.min(Math.max(x, 8 - window.innerWidth * 0.6), window.innerWidth - 120),
    y: Math.min(Math.max(y, 8), window.innerHeight - 60),
  };
}

function dragEnd() {
  if (!dragFrom) return;
  dragFrom = null;
  try {
    localStorage.setItem("espkvm.osk.x", String(Math.round(pos.value.x)));
    localStorage.setItem("espkvm.osk.y", String(Math.round(pos.value.y)));
  } catch {
    /* not remembered, no harm */
  }
}

interface Key {
  /** KeyboardEvent.code, which the keymap turns into a HID usage. */
  code: string;
  /** What is printed on it; two lines for a key with a shifted character. */
  text: string;
  shifted?: string;
  /** Width in units of one letter key. */
  w?: number;
  /** A modifier latches instead of being sent. */
  mod?: number;
  /** Lights up with a lock LED from the target: 1 Num, 2 Caps, 4 Scroll. */
  led?: number;
  /** Sent with Shift held, for the character printed above a key. */
  shift?: boolean;
}

const ROWS: Key[][] = [
  [
    { code: "Escape", text: "Esc" },
    { code: "F1", text: "F1" },
    { code: "F2", text: "F2" },
    { code: "F3", text: "F3" },
    { code: "F4", text: "F4" },
    { code: "F5", text: "F5" },
    { code: "F6", text: "F6" },
    { code: "F7", text: "F7" },
    { code: "F8", text: "F8" },
    { code: "F9", text: "F9" },
    { code: "F10", text: "F10" },
    { code: "F11", text: "F11" },
    { code: "F12", text: "F12" },
    { code: "Delete", text: "Del" },
  ],
  [
    { code: "Backquote", text: "`", shifted: "~" },
    { code: "Digit1", text: "1", shifted: "!" },
    { code: "Digit2", text: "2", shifted: "@" },
    { code: "Digit3", text: "3", shifted: "#" },
    { code: "Digit4", text: "4", shifted: "$" },
    { code: "Digit5", text: "5", shifted: "%" },
    { code: "Digit6", text: "6", shifted: "^" },
    { code: "Digit7", text: "7", shifted: "&" },
    { code: "Digit8", text: "8", shifted: "*" },
    { code: "Digit9", text: "9", shifted: "(" },
    { code: "Digit0", text: "0", shifted: ")" },
    { code: "Minus", text: "-", shifted: "_" },
    { code: "Equal", text: "=", shifted: "+" },
    { code: "Backspace", text: "Bksp", w: 2 },
  ],
  [
    { code: "Tab", text: "Tab", w: 1.5 },
    { code: "KeyQ", text: "Q" },
    { code: "KeyW", text: "W" },
    { code: "KeyE", text: "E" },
    { code: "KeyR", text: "R" },
    { code: "KeyT", text: "T" },
    { code: "KeyY", text: "Y" },
    { code: "KeyU", text: "U" },
    { code: "KeyI", text: "I" },
    { code: "KeyO", text: "O" },
    { code: "KeyP", text: "P" },
    { code: "BracketLeft", text: "[", shifted: "{" },
    { code: "BracketRight", text: "]", shifted: "}" },
    { code: "Backslash", text: "\\", shifted: "|", w: 1.5 },
  ],
  [
    { code: "CapsLock", text: "Caps", w: 1.75, led: 2 },
    { code: "KeyA", text: "A" },
    { code: "KeyS", text: "S" },
    { code: "KeyD", text: "D" },
    { code: "KeyF", text: "F" },
    { code: "KeyG", text: "G" },
    { code: "KeyH", text: "H" },
    { code: "KeyJ", text: "J" },
    { code: "KeyK", text: "K" },
    { code: "KeyL", text: "L" },
    { code: "Semicolon", text: ";", shifted: ":" },
    { code: "Quote", text: "'", shifted: '"' },
    { code: "Enter", text: "Enter", w: 2.25 },
  ],
  [
    { code: "ShiftLeft", text: "Shift", w: 2.25, mod: HID_MOD_LSHIFT },
    { code: "KeyZ", text: "Z" },
    { code: "KeyX", text: "X" },
    { code: "KeyC", text: "C" },
    { code: "KeyV", text: "V" },
    { code: "KeyB", text: "B" },
    { code: "KeyN", text: "N" },
    { code: "KeyM", text: "M" },
    { code: "Comma", text: ",", shifted: "<" },
    { code: "Period", text: ".", shifted: ">" },
    { code: "Slash", text: "/", shifted: "?" },
    { code: "ArrowUp", text: "↑" },
    { code: "ShiftRight", text: "Shift", w: 1.75, mod: HID_MOD_RSHIFT },
  ],
  [
    { code: "ControlLeft", text: "Ctrl", w: 1.5, mod: HID_MOD_LCTRL },
    { code: "MetaLeft", text: "Win", w: 1.25, mod: HID_MOD_LGUI },
    { code: "AltLeft", text: "Alt", w: 1.25, mod: HID_MOD_LALT },
    { code: "Space", text: "Space", w: 5 },
    { code: "AltRight", text: "AltGr", w: 1.25, mod: HID_MOD_RALT },
    { code: "ArrowLeft", text: "←" },
    { code: "ArrowDown", text: "↓" },
    { code: "ArrowRight", text: "→" },
  ],
];

/* The three keys that belong to no block, kept beside the navigation one. */
const EXTRA: Key[] = [
  { code: "PrintScreen", text: "PrtSc" },
  { code: "ScrollLock", text: "ScrLk", led: 4 },
  { code: "Pause", text: "Pause" },
];

/*
 * The compact shape: what a browser or an operating system takes for itself,
 * and the keys a phone keyboard has none of. No letters - type those with the
 * device's own keyboard, or with Paste text.
 */
const COMPACT_ROWS: Key[][] = [
  ROWS[0],
  [
    { code: "ControlLeft", text: "Ctrl", w: 1.4, mod: HID_MOD_LCTRL },
    { code: "AltLeft", text: "Alt", w: 1.2, mod: HID_MOD_LALT },
    { code: "ShiftLeft", text: "Shift", w: 1.4, mod: HID_MOD_LSHIFT },
    { code: "MetaLeft", text: "Win", w: 1.2, mod: HID_MOD_LGUI },
    { code: "Tab", text: "Tab" },
    { code: "Enter", text: "Enter", w: 1.4 },
    { code: "Backspace", text: "Bksp", w: 1.4 },
    { code: "Space", text: "Space", w: 2 },
  ],
];

/* The navigation block, laid out as it is on a keyboard: the arrows in their
   inverted T, the six editing keys beside them. Areas, not a flat row, because
   arrows scattered along a line are read one at a time. */
const NAV_GRID: (Key & { area: string })[] = [
  { code: "Insert", text: "Ins", area: "ins" },
  { code: "Home", text: "Home", area: "home" },
  { code: "PageUp", text: "PgUp", area: "pgup" },
  { code: "Delete", text: "Del", area: "del" },
  { code: "End", text: "End", area: "end" },
  { code: "PageDown", text: "PgDn", area: "pgdn" },
  { code: "ArrowUp", text: "\u2191", area: "up" },
  { code: "ArrowLeft", text: "\u2190", area: "left" },
  { code: "ArrowDown", text: "\u2193", area: "down" },
  { code: "ArrowRight", text: "\u2192", area: "right" },
];

/*
 * The symbols layout: every character that lives above a number or a
 * punctuation key, one press each, plus the number pad. Hunting for the right
 * bracket while holding Shift with a mouse is exactly the job this panel exists
 * for.
 */
const sym = (code: string, text: string, shift = true): Key => ({ code, text, shift });

const SYMBOL_ROWS: Key[][] = [
  /* What is printed above the numbers, in the order the numbers are in. */
  [
    sym("Digit1", "!"),
    sym("Digit2", "@"),
    sym("Digit3", "#"),
    sym("Digit4", "$"),
    sym("Digit5", "%"),
    sym("Digit6", "^"),
    sym("Digit7", "&"),
    sym("Digit8", "*"),
    sym("Digit9", "("),
    sym("Digit0", ")"),
  ],
  /* The punctuation keys as they are printed, then the same keys with Shift. */
  [
    sym("Backquote", "`", false),
    sym("Minus", "-", false),
    sym("Equal", "=", false),
    sym("BracketLeft", "[", false),
    sym("BracketRight", "]", false),
    sym("Backslash", "\\", false),
    sym("Semicolon", ";", false),
    sym("Quote", "'", false),
    sym("Comma", ",", false),
    sym("Period", ".", false),
    sym("Slash", "/", false),
  ],
  [
    sym("Backquote", "~"),
    sym("Minus", "_"),
    sym("Equal", "+"),
    sym("BracketLeft", "{"),
    sym("BracketRight", "}"),
    sym("Backslash", "|"),
    sym("Semicolon", ":"),
    sym("Quote", "\""),
    sym("Comma", "<"),
    sym("Period", ">"),
    sym("Slash", "?"),
  ],
];

/* The number pad, in the shape it has on a keyboard. */
const PAD_GRID: (Key & { area: string })[] = [
  { code: "NumLock", text: "Num", led: 1, area: "num" },
  { code: "NumpadDivide", text: "\u00f7", area: "div" },
  { code: "NumpadMultiply", text: "\u00d7", area: "mul" },
  { code: "NumpadSubtract", text: "\u2212", area: "sub" },
  { code: "Numpad7", text: "7", area: "n7" },
  { code: "Numpad8", text: "8", area: "n8" },
  { code: "Numpad9", text: "9", area: "n9" },
  { code: "NumpadAdd", text: "+", area: "add" },
  { code: "Numpad4", text: "4", area: "n4" },
  { code: "Numpad5", text: "5", area: "n5" },
  { code: "Numpad6", text: "6", area: "n6" },
  { code: "Numpad1", text: "1", area: "n1" },
  { code: "Numpad2", text: "2", area: "n2" },
  { code: "Numpad3", text: "3", area: "n3" },
  { code: "NumpadEnter", text: "Enter", area: "enter" },
  { code: "Numpad0", text: "0", area: "n0" },
  { code: "NumpadDecimal", text: ".", area: "dot" },
];

/* Which layout is on show: everything, the short one, or the symbols. */
const LAYOUTS = ["full", "compact", "symbols"] as const;
type Layout = (typeof LAYOUTS)[number];
const layout = ref<Layout>(compact.value ? "compact" : "full");
watch(layout, (l) => (compact.value = l === "compact"));

function cycleLayout() {
  layout.value = LAYOUTS[(LAYOUTS.indexOf(layout.value) + 1) % LAYOUTS.length];
}

const rows = computed(() =>
  layout.value === "compact" ? COMPACT_ROWS : layout.value === "symbols" ? SYMBOL_ROWS : ROWS,
);

/* The combinations an operating system or a browser takes for itself. */
const COMBOS: { label: string; mods: number; code: string }[] = [
  { label: "Ctrl+Alt+Del", mods: HID_MOD_LCTRL | HID_MOD_LALT, code: "Delete" },
  { label: "Alt+F4", mods: HID_MOD_LALT, code: "F4" },
  { label: "Alt+Tab", mods: HID_MOD_LALT, code: "Tab" },
  { label: "Ctrl+Alt+F2", mods: HID_MOD_LCTRL | HID_MOD_LALT, code: "F2" },
];

/* Armed for the next key; locked until pressed again. */
const armed = ref(0);
const locked = ref(0);
const mods = computed(() => armed.value | locked.value);
const shifted = computed(() => (mods.value & (HID_MOD_LSHIFT | HID_MOD_RSHIFT)) !== 0);

function pressMod(bit: number) {
  if (locked.value & bit) {
    locked.value &= ~bit;
  } else if (armed.value & bit) {
    armed.value &= ~bit;
    locked.value |= bit;
  } else {
    armed.value |= bit;
  }
}

function sendKey(code: string, extraMods = 0) {
  const usage = usageForCode(code);
  if (!usage) return;
  props.control.keyboard(mods.value | extraMods, [usage]);
  props.control.keyboard(locked.value, []);
  armed.value = 0;
}

/* Held down, a key repeats, the way it would on a real keyboard. */
const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 90;
let delayTimer = 0;
let repeatTimer = 0;

function press(key: Key) {
  if (key.mod) {
    pressMod(key.mod);
    return;
  }
  sendKey(key.code, key.shift ? HID_MOD_LSHIFT : 0);
  release();
  delayTimer = window.setTimeout(() => {
    repeatTimer = window.setInterval(() => {
      const usage = usageForCode(key.code);
      if (usage) {
        props.control.keyboard(locked.value, [usage]);
        props.control.keyboard(locked.value, []);
      }
    }, REPEAT_MS);
  }, REPEAT_DELAY_MS);
}

function release() {
  clearTimeout(delayTimer);
  clearInterval(repeatTimer);
  delayTimer = 0;
  repeatTimer = 0;
}

onUnmounted(release);

function combo(c: { mods: number; code: string }) {
  const usage = usageForCode(c.code);
  if (!usage) return;
  props.control.keyboard(c.mods, [usage]);
  props.control.keyboard(0, []);
  armed.value = 0;
  locked.value = 0;
}

/*
 * What sort of key this is, which the tinted skin colours by: a modifier, the
 * function row, the navigation block, a lock, or one of the big editing keys.
 * Anything that prints a character stays plain in every skin.
 */
function kind(key: Key): string {
  if (key.mod) return "mod";
  if (key.led) return "lock";
  if (/^F\d{1,2}$/.test(key.code) || key.code === "Escape") return "fn";
  if (/^(Arrow|Home|End|Page|Insert|Delete)/.test(key.code)) return "nav";
  if (["Enter", "Backspace", "Tab", "Space"].includes(key.code)) return "edit";
  if (["PrintScreen", "Pause", "ScrollLock", "NumLock"].includes(key.code)) return "sys";
  return "char";
}

/* What is being held, in the words on the keys. */
const heldNames = computed(() => {
  const names: string[] = [];
  const all: [number, string][] = [
    [HID_MOD_LCTRL, "Ctrl"],
    [HID_MOD_LALT, "Alt"],
    [HID_MOD_RALT, "AltGr"],
    [HID_MOD_LSHIFT, "Shift"],
    [HID_MOD_RSHIFT, "Shift"],
    [HID_MOD_LGUI, "Win"],
  ];
  for (const [bit, name] of all) {
    if (mods.value & bit && !names.includes(name)) names.push(name);
  }
  return names.join(" + ");
});

function label(key: Key): string {
  return shifted.value && key.shifted ? key.shifted : key.text;
}

function state(key: Key): Record<string, boolean> {
  return {
    [`vk-k-${kind(key)}`]: true,
    "vk-armed": !!key.mod && (armed.value & key.mod) !== 0,
    "vk-locked": !!key.mod && (locked.value & key.mod) !== 0,
    "vk-lit": !!key.led && (props.leds & key.led) !== 0,
  };
}
</script>

<template>
  <Teleport to="body" :disabled="!floating">
    <section
      :class="['vk', `vk-skin-${skin}`, { 'vk-floating': floating }]"
      :style="floating ? { left: pos.x + 'px', top: pos.y + 'px' } : undefined"
      aria-label="On-screen keyboard"
    >
      <div
        class="vk-head"
        :class="{ 'vk-grab': floating }"
        @pointerdown="dragStart"
        @pointermove="dragMove"
        @pointerup="dragEnd"
        @pointercancel="dragEnd"
      >
        <span class="muted vk-hint">
          <template v-if="heldNames">Holding {{ heldNames }}</template>
          <template v-else>A modifier stays armed for one key, twice to lock it.</template>
        </span>
        <span class="vk-head-actions">
          <button
            type="button"
            class="btn btn-sm btn-icon btn-quiet"
            aria-label="Change how the keys are coloured"
            :title="skin === 'plain' ? 'Colour the keys that are not characters' : 'Plain keys'"
            @click="skin = skin === 'plain' ? 'tinted' : 'plain'"
          >
            <Icon name="palette" :size="15" />
          </button>
          <button
            type="button"
            class="btn btn-sm btn-icon btn-quiet"
            aria-label="Change the layout"
            :title="
              layout === 'full'
                ? 'Only the keys a browser tends to swallow'
                : layout === 'compact'
                  ? 'Symbols and the number pad'
                  : 'Every key'
            "
            @click="cycleLayout"
          >
            <Icon
              :name="layout === 'full' ? 'compact' : layout === 'compact' ? 'symbols' : 'keyboard'"
              :size="15"
            />
          </button>
          <button
            type="button"
            class="btn btn-sm btn-icon btn-quiet"
            :aria-label="floating ? 'Dock it under the picture' : 'Let it float over the page'"
            :title="floating ? 'Dock it under the picture' : 'Let it float over the page, and drag it about'"
            @click="floating = !floating"
          >
            <Icon :name="floating ? 'dock' : 'float'" :size="15" />
          </button>
          <button
            type="button"
            class="btn btn-sm btn-icon btn-quiet"
            aria-label="Close the keyboard"
            title="Close the keyboard"
            @click="emit('close')"
          >
            <Icon name="close" :size="15" />
          </button>
        </span>
      </div>

    <div class="vk-combos">
      <button
        v-for="c in COMBOS"
        :key="c.label"
        type="button"
        class="btn btn-sm"
        @click="combo(c)"
      >
        {{ c.label }}
      </button>
    </div>

    <div class="vk-keys">
      <div v-for="(row, i) in rows" :key="i" class="vk-row">
        <button
          v-for="key in row"
          :key="key.code + key.text"
          type="button"
          class="vk-key"
          :class="state(key)"
          :style="{ flexGrow: key.w ?? 1, flexBasis: `${(key.w ?? 1) * 2.2}rem` }"
          :aria-label="key.text"
          @pointerdown.prevent="press(key)"
          @pointerup="release"
          @pointercancel="release"
          @pointerleave="release"
        >
          {{ label(key) }}
        </button>
      </div>

      <!-- The navigation block and the number pad keep a keyboard's shape
           rather than becoming another line of buttons. -->
      <div class="vk-blocks">
      <div v-if="layout !== 'symbols'" class="vk-nav">
        <button
          v-for="key in NAV_GRID"
          :key="key.code"
          type="button"
          class="vk-key"
          :class="state(key)"
          :style="{ gridArea: key.area }"
          :aria-label="key.text"
          @pointerdown.prevent="press(key)"
          @pointerup="release"
          @pointercancel="release"
          @pointerleave="release"
        >
          {{ key.text }}
        </button>
      </div>

      <div v-if="layout === 'symbols'" class="vk-pad">
        <button
          v-for="key in PAD_GRID"
          :key="key.code"
          type="button"
          class="vk-key"
          :class="state(key)"
          :style="{ gridArea: key.area }"
          :aria-label="key.text"
          @pointerdown.prevent="press(key)"
          @pointerup="release"
          @pointercancel="release"
          @pointerleave="release"
        >
          {{ key.text }}
        </button>
      </div>

        <div v-if="layout === 'full'" class="vk-extra">
        <button
          v-for="key in EXTRA"
          :key="key.code"
          type="button"
          class="vk-key"
          :class="state(key)"
          :aria-label="key.text"
          @pointerdown.prevent="press(key)"
          @pointerup="release"
          @pointercancel="release"
          @pointerleave="release"
        >
          {{ key.text }}
        </button>
        </div>
      </div>
    </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
/*
 * On-screen controls for touch mode: explicit mouse buttons for the taps that
 * are awkward as gestures, and an on-screen keyboard.
 *
 * The keyboard is a hidden text field. Tapping "Keyboard" focuses it, which is
 * what makes the phone's own keyboard appear; each character it produces is
 * translated to a key position through the same layout table the paste feature
 * uses (see layouts.js), so what the target types matches its own layout. The
 * field never keeps its text - every input is intercepted and re-sent as HID.
 */
import { ref } from "vue";

import { charToHid } from "../layouts.js";
import type { Control } from "../input/control";

const props = defineProps<{ control: Control; layout: string }>();

/* Key positions that are not characters. */
const ENTER = 0x28;
const BACKSPACE = 0x2a;
const TAB = 0x2b;

const field = ref<HTMLInputElement | null>(null);
const oskOpen = ref(false);

function tap(button: number) {
  props.control.mouseRelative(button, 0, 0);
  props.control.mouseRelative(0, 0, 0);
}

function sendKey(hid: number, mod = 0) {
  props.control.keyboard(mod, [hid]);
  props.control.keyboard(0, []);
}

function sendChar(ch: string) {
  const row = charToHid(props.layout, ch) as { mod: number; hid: number } | null;
  if (row) sendKey(row.hid, row.mod);
}

/*
 * Mobile keyboards report edits through beforeinput, not reliable keydown
 * events, so the text is read from there and the field is kept empty. A word
 * can arrive as one insertText; iterate its characters.
 */
function onBeforeInput(e: InputEvent) {
  e.preventDefault();
  switch (e.inputType) {
    case "insertText":
    case "insertCompositionText":
      if (e.data) for (const ch of e.data) sendChar(ch);
      break;
    case "insertLineBreak":
    case "insertParagraph":
      sendKey(ENTER);
      break;
    case "deleteContentBackward":
      sendKey(BACKSPACE);
      break;
  }
}

/* A few control keys the phone keyboard can emit as real keydowns. */
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Backspace") {
    e.preventDefault();
    sendKey(BACKSPACE);
  } else if (e.key === "Enter") {
    e.preventDefault();
    sendKey(ENTER);
  } else if (e.key === "Tab") {
    e.preventDefault();
    sendKey(TAB);
  }
}

function toggleKeyboard() {
  if (oskOpen.value) {
    field.value?.blur();
  } else {
    field.value?.focus();
  }
}
</script>

<template>
  <div class="touch-controls" role="toolbar" aria-label="Touch controls">
    <button type="button" class="touch-btn" @click="tap(1)">Left</button>
    <button type="button" class="touch-btn" @click="tap(2)">Right</button>
    <button
      type="button"
      class="touch-btn"
      :class="{ 'touch-btn-on': oskOpen }"
      @click="toggleKeyboard"
    >
      Keyboard
    </button>

    <input
      ref="field"
      class="touch-osk"
      type="text"
      inputmode="text"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      aria-label="On-screen keyboard input"
      :value="''"
      @beforeinput="onBeforeInput"
      @keydown="onKeydown"
      @focus="oskOpen = true"
      @blur="oskOpen = false"
    />
  </div>
</template>

<style scoped>
.touch-controls {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-overlay) 88%, transparent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-pop, 0 6px 20px rgba(0, 0, 0, 0.4));
  z-index: 5;
}

.touch-btn {
  min-width: 64px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--bg-raised);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}

.touch-btn-on {
  border-color: var(--accent);
  color: var(--accent);
}

/* Focusable but invisible: focus is what summons the phone's keyboard, so it
   cannot be display:none. */
.touch-osk {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}
</style>

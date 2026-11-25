// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { effectScope, ref } from "vue";
import { useInput } from "../src/input/useInput.ts";

const fingerprint = "01:23:45:67:89:AB:CD:EF";
const text = new TextEncoder();

function report(revision: number) {
  return Uint8Array.of(
    0x86, revision, 0, 0, 0, 3, ...text.encode(fingerprint),
    1, 0, 49, 1, 0, 50, 1, 0, 49,
  );
}

class Socket {
  static OPEN = 1;
  static latest: Socket;
  readyState = Socket.OPEN;
  sent: number[][] = [];
  onopen?: () => void;
  onmessage?: (event: { data: ArrayBuffer }) => void;
  onclose?: () => void;

  constructor() {
    Socket.latest = this;
  }

  reply(bytes: Uint8Array | number[]) {
    this.onmessage?.({ data: Uint8Array.from(bytes).buffer });
  }

  send(data: ArrayBuffer) {
    this.sent.push(Array.from(new Uint8Array(data)));
  }

  close() {
    this.onclose?.();
  }
}

function consoleInput(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [name, value] of Object.entries({
    location: { protocol: "https:", host: "example.test" },
    window: { setInterval: () => 1 },
    WebSocket: Socket,
  })) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const scope = effectScope();
  t.after(() => {
    scope.stop();
    for (const name of ["location", "window", "WebSocket"] as const) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const input = scope.run(() => useInput({
    engaged: ref(false),
    engageMode: ref("click"),
    pointerMode: ref("absolute"),
    invertScroll: ref(false),
    surface: ref(null),
    fit: ref("fit"),
    onDisengage() {},
  }))!;
  input.control.start();
  Socket.latest.onopen?.();
  return input;
}

test("legacy target status stays HDMI and USB status identifies the new source", (t) => {
  const input = consoleInput(t);
  Socket.latest.reply([0x81, 3, 5]);
  assert.deepEqual(input.target.value, {
    known: true, attached: true, busAlive: true, usbVideo: false, leds: 5,
  });
  Socket.latest.reply([0x81, 7, 5]);
  assert.equal(input.target.value.usbVideo, true);
  assert.equal(input.usbVideo.value, null);
});

test("display selection uses the reported revision and original display order", (t) => {
  const input = consoleInput(t);
  const ws = Socket.latest;
  ws.reply(report(42));
  const state = input.usbVideo.value!;
  assert.equal(state.selected, "1");
  assert.deepEqual(state.displays, ["2", "1"]);
  assert.equal(state.fingerprint, fingerprint);
  ws.reply(report(43).slice(0, -1));
  assert.deepEqual(input.usbVideo.value, state);
  assert.equal(input.usbVideo.value?.revision, 42);
  input.control.setUsbVideo(state.revision, state.enabled, 2);
  assert.deepEqual(ws.sent.at(-1), [0x0a, 42, 0, 0, 0, 1, 2]);
});

test("reconnect starts without USB video state and ignores replies from the retired socket", (t) => {
  const input = consoleInput(t);
  const old = Socket.latest;
  old.reply(report(42));
  assert.equal(input.usbVideo.value?.revision, 42);
  input.control.pause();
  assert.equal(input.usbVideo.value, null);
  input.control.start();
  Socket.latest.onopen?.();
  old.reply(report(43));
  assert.equal(input.usbVideo.value, null);
  input.control.queryUsbVideo(0);
  assert.deepEqual(Socket.latest.sent.at(-1), [0x0a, 0, 0, 0, 0]);
  Socket.latest.reply(report(1));
  assert.equal(input.usbVideo.value?.revision, 1);
});

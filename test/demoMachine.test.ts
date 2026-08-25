/*
 * The demo's fake machine.
 *
 * It is the one piece of the console with a state machine of its own, it is what
 * every visitor touches first, and its bugs have been reported by real people -
 * typing that doubled letters, a powered-off target that still drew a desktop.
 * All of that is plain logic over a clock, so it is checked here rather than by
 * clicking through the demo.
 *
 * The clock is the only thing to arrange: the machine asks performance.now()
 * every time it looks, so a stub moves it through a boot in no time at all.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

let clock = 1000;
globalThis.performance.now = () => clock;
const advance = (ms: number) => {
  clock += ms;
};

const {
  demoKeys,
  demoMachine,
  demoMedia,
  demoMountMedia,
  demoPower,
  demoScene,
  demoScreenText,
  demoAsk,
} = await import("../src/demo/machine.ts");

/** Text on the screen right now, as one string. */
function screen(): string {
  return demoScreenText()?.text ?? "";
}

test("with no image in the drive it says so, and offers to load one", () => {
  advance(4000); /* the POST runs out */
  assert.match(screen(), /No boot device found/);
  assert.match(screen(), /loads one itself/);
  assert.equal(demoAsk(), "media");
});

test("the autopilot loads an image and boots it", () => {
  advance(16000); /* past the fifteen seconds it counts down */
  assert.equal(demoMedia().image, "halfos-life-3.iso");
  assert.match(screen(), /Booting from ESP-KVM virtual media/);
  advance(3000);
  assert.match(screen(), /HalfOS Life/);
});

test("typing is a keyboard, not a stream of events", () => {
  /* The console sends the set of keys that are down. Two keys overlapping is
     what fast typing is, and the first one arrives again in the second report:
     only what is newly down counts as a press (reported by DaveDavenport). */
  demoKeys(0, [0x0b, 0, 0, 0, 0, 0]); /* h */
  demoKeys(0, [0x0b, 0x17, 0, 0, 0, 0]); /* h still down, t goes down */
  demoKeys(0, [0x17, 0, 0, 0, 0, 0]); /* h comes up */
  demoKeys(0, [0x17, 0x12, 0, 0, 0, 0]); /* t still down, o goes down */
  demoKeys(0, [0x13, 0, 0, 0, 0, 0]); /* p */
  demoKeys(0, []); /* everything up */
  assert.match(screen(), /demo:~\$ htop/);
});

test("a key held down does not repeat by itself", () => {
  demoKeys(0, [0x2a, 0, 0, 0, 0, 0]); /* backspace, taking the p off */
  demoKeys(0, [0x2a, 0, 0, 0, 0, 0]); /* the same report again */
  demoKeys(0, []);
  /* The row is padded to the grid and the cursor blinks, so anchor on what
     follows rather than on the end of the line. */
  assert.match(screen(), /demo:~\$ hto(?![a-z])/);
});

test("a machine with no power draws nothing at all", () => {
  demoPower("hold");
  assert.equal(demoScene(), "off");
  assert.equal(demoScreenText(), null);
  assert.equal(demoMachine().signal, false);
  assert.equal(demoMachine().powerOn, false);
});

test("reset does nothing to a machine that is off, and power starts it", () => {
  demoPower("reset");
  assert.equal(demoScene(), "off", "a reset button does not start a dead box");
  demoPower("click");
  assert.match(screen(), /ESP-KVM Demo BIOS/);
});

test("the drive is read at boot and not before", () => {
  demoMountMedia("memtest86plus-7.20.iso", true);
  assert.match(screen(), /ESP-KVM Demo BIOS/, "swapping the disc changes nothing yet");
  demoPower("reset");
  advance(4000);
  advance(3000);
  assert.match(screen(), /Memtest86\+/, "and everything after a restart");
});

test("with virtual media switched off the target has no drive", () => {
  demoMountMedia("memtest86plus-7.20.iso", false);
  demoPower("reset");
  advance(4000);
  assert.match(screen(), /No boot device found/);
  assert.match(screen(), /Switch Expose virtual media on/);
});

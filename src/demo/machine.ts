/*
 * The machine the demo pretends to drive.
 *
 * Everything the visitor can do to a real target - power it, watch it post, boot
 * it from virtual media, type at it - happens here, as a character screen. That
 * is the point: a text screen is what makes Select and Copy work, and those are
 * the parts of ESP-KVM you cannot show with a picture.
 *
 * Demo build only; `backend.ts` is the only caller.
 */

const COLS = 80;
const ROWS = 25;
/* The cell size the firmware reports for a real UEFI console, so the demo
   exercises the same geometry the selection layer was written for. */
const CELL_W = 8;
const CELL_H = 19;
const FRAME_W = 1280;
const FRAME_H = 720;

type Stage = "off" | "post" | "stuck" | "boot" | "shell" | "desktop";

/* The demo opens on a machine that is starting up, not a dark screen: the boot
   text is the part worth showing, and it is text you can select. */
let stage: Stage = "post";
let since = performance.now();
let mediaMounted = false;
let shell: string[] = [];
let typed = "";

const now = () => performance.now();

function go(next: Stage) {
  stage = next;
  since = now();
  if (next === "shell") {
    shell = [
      "ESP-KVM demo system 1.0",
      "",
      "This screen is text, not a picture. Drag across it to select, and copy.",
      "Type startx for the pointer demo.",
      "",
    ];
    typed = "";
  }
}

/* The post, as it would scroll by: how long in, and what appears. */
const POST: Array<[number, string]> = [
  [0, "ESP-KVM Demo BIOS v2.1"],
  [200, "Copyright (C) 2026 ESP-KVM contributors"],
  [400, ""],
  [700, "CPU     : RISC-V dual core @ 400 MHz"],
  [1000, "Memory  : 32768 MB OK"],
  [1500, "USB     : keyboard, mouse, mass storage"],
  [2100, "SATA    : Port 0  no device"],
  [2400, "SATA    : Port 1  no device"],
  [2900, ""],
];
const BOOT: Array<[number, string]> = [
  [0, "Booting from ESP-KVM virtual media..."],
  [900, "Loading kernel ................ done"],
  [1800, "Starting system ............... done"],
];

function lines(): string[] {
  const t = now() - since;
  const out: string[] = [];
  if (stage === "post" || stage === "stuck" || stage === "boot") {
    for (const [at, text] of POST) {
      if (t >= at) out.push(text);
    }
  }
  if (stage === "stuck") {
    out.push("No boot device found");
    out.push("");
    out.push("Insert an image under Media, then press Reset.");
  }
  if (stage === "boot") {
    for (const [at, text] of BOOT) {
      if (t >= at) out.push(text);
    }
  }
  if (stage === "shell") {
    out.push(...shell, "demo:~$ " + typed + (Math.floor(t / 500) % 2 ? "_" : ""));
  }
  return out;
}

/** Time is what moves this machine on, so every read looks at the clock first. */
function tick() {
  const t = now() - since;
  if (stage === "post" && t > 3200) {
    go(mediaMounted ? "boot" : "stuck");
  } else if (stage === "boot" && t > 2800) {
    go("shell");
  }
}

export function demoPower(action: "click" | "hold" | "reset" | "wake") {
  tick();
  if (action === "hold") {
    go("off");
    return;
  }
  if (action === "click") {
    go(stage === "off" ? "post" : "off");
    return;
  }
  if (stage !== "off") {
    go("post"); /* reset */
  } else if (action === "wake") {
    go("post");
  }
}

export function demoMountMedia(mounted: boolean) {
  mediaMounted = mounted;
}

/* usage codes -> characters, enough of a US keyboard to type at a prompt. */
const KEYS: Record<number, [string, string]> = {
  0x2c: [" ", " "],
  0x2d: ["-", "_"],
  0x2e: ["=", "+"],
  0x2f: ["[", "{"],
  0x30: ["]", "}"],
  0x33: [";", ":"],
  0x34: ["'", '"'],
  0x36: [",", "<"],
  0x37: [".", ">"],
  0x38: ["/", "?"],
};
for (let i = 0; i < 26; i++) {
  KEYS[0x04 + i] = [String.fromCharCode(97 + i), String.fromCharCode(65 + i)];
}
"1234567890".split("").forEach((d, i) => {
  KEYS[0x1e + i] = [d, ")!@#$%^&*("[(i + 1) % 10]];
});

/** A keyboard report from the console: modifier byte, then six usages. */
export function demoKeys(mod: number, usages: number[]) {
  tick();
  if (stage !== "shell") return;
  const shift = (mod & 0x22) !== 0;
  for (const u of usages) {
    if (!u) continue;
    if (u === 0x28) {
      /* Enter: answer the two commands worth answering, echo the rest. */
      const cmd = typed.trim();
      shell.push("demo:~$ " + typed);
      if (cmd === "startx") {
        typed = "";
        go("desktop");
        return;
      } else if (cmd === "help") {
        shell.push("startx - the pointer demo, clear - clear the screen");
      } else if (cmd === "clear") {
        shell = [];
      } else if (cmd) {
        shell.push(cmd + ": command not found");
      }
      typed = "";
    } else if (u === 0x2a) {
      typed = typed.slice(0, -1);
    } else if (KEYS[u]) {
      if (typed.length < COLS - 10) typed += KEYS[u][shift ? 1 : 0];
    }
  }
  /* Keep the screen a screen: drop what scrolled off the top. */
  const room = ROWS - 2;
  if (shell.length > room) shell = shell.slice(shell.length - room);
}

export interface DemoScreen {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  confidence: number;
  ageMs: number;
  text: string;
  /** What the screen watch found here, as the device reports it. */
  alert?: string;
}

/** The screen as the firmware would report it, or null when it is a picture. */
export function demoScreenText(): DemoScreen | null {
  tick();
  if (stage === "off" || stage === "desktop") return null;
  const rows = lines().slice(0, ROWS);
  while (rows.length < ROWS) rows.push("");
  return {
    cols: COLS,
    rows: ROWS,
    cellWidth: CELL_W,
    cellHeight: CELL_H,
    originX: Math.round((FRAME_W - COLS * CELL_W) / 2),
    originY: Math.round((FRAME_H - ROWS * CELL_H) / 2),
    width: FRAME_W,
    height: FRAME_H,
    confidence: 96,
    ageMs: 120,
    text: rows.map((r) => r.padEnd(COLS, " ").slice(0, COLS)).join("\n"),
    alert: stage === "stuck" ? "no boot device" : undefined,
  };
}

export function demoMachine() {
  tick();
  return {
    stage,
    powerOn: stage !== "off",
    signal: stage !== "off",
    textMode: stage !== "off" && stage !== "desktop",
    /* The watch fires on the same phrase the settings suggest, so the demo shows
       what a machine that fell over at three in the morning looks like. */
    alert: stage === "stuck" ? "no boot device" : "",
  };
}

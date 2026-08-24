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

type Stage = "off" | "post" | "stuck" | "boot" | "shell" | "desktop" | "crash";
/* Which image is in the drive decides what boots. Three of them, because a demo
   that only ever shows one thing is a screenshot with extra steps. */
export type Guest = "none" | "halfos" | "xp" | "memtest" | "mac";

/* What is in the drive, and what actually booted - two different things. A disc
   swapped while the machine runs changes nothing until it restarts. */
let inserted = "";
let exposed = false;
/* Why there is nothing to boot, in the words the screen shows. Decided when the
   drive is read, so it describes the machine as it started, not as it is now. */
let hint = "Insert an image under Media, then press Reset.";
let guest: Guest = "none";

/* The demo opens on a machine that is starting up, not a dark screen: the boot
   text is the part worth showing, and it is text you can select. */
let stage: Stage = "post";
let since = performance.now();
let mediaMounted = false;
let shell: string[] = [];
let typed = "";

const now = () => performance.now();

/** Move on. `spent` carries the time the finished stage was owed, so a machine
    that was not looked at for a while catches up instead of stalling a step. */
function go(next: Stage, spent?: number) {
  stage = next;
  since = spent === undefined ? now() : since + spent;
  if (next === "shell") {
    shell = [
      "HalfOS Life 3.0 - the one that exists",
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
const BOOT: Record<Exclude<Guest, "none">, Array<[number, string]>> = {
  halfos: [
    [0, "Booting from ESP-KVM virtual media..."],
    [700, "Loading kernel ................ done"],
    [1400, "Loading initrd ................ done"],
    [2100, "[  OK  ] Reached target Anomalous Materials"],
  ],
  xp: [
    [0, "Booting from ESP-KVM virtual media..."],
    [700, "Starting Sheeps XP Professional"],
    [1600, "Setup is inspecting your hardware configuration..."],
  ],
  memtest: [
    [0, "Booting from ESP-KVM virtual media..."],
    [700, "Memtest86+ 7.20 loading..."],
  ],
  mac: [
    [0, "Booting from ESP-KVM virtual media..."],
    [700, "EFI: loading boot.efi"],
  ],
};

/* Every system falls over in its own dialect, and each of these is a screen full
   of text - so the demo also shows what ESP-KVM is really for: reading the words
   off a machine that has stopped, and copying them into a bug report. */
const CRASH: Record<Exclude<Guest, "none">, { bg: string; lines: string[] }> = {
  xp: {
    bg: "#0000aa",
    lines: [
      "A problem has been detected and Sheeps XP has been shut down to prevent",
      "damage to your ewe.",
      "",
      "BLACK_SHEEP_NOT_RESPONDING",
      "",
      "If this is the first time you have seen this screen, do not pet it again.",
      "",
      "Technical information:",
      "",
      "*** STOP: 0x000000BA (0xBAA5BAA5, 0x00000001, 0x00000000, 0xF1EECE00)",
      "",
      "*** wool.sys - Address F1EECE00 base at F1EE0000, DateStamp 3b7d855c",
      "",
      "Beginning dump of physical memory",
      "Physical memory dump complete.",
      "Contact your shepherd or technical support group for further assistance.",
    ],
  },
  halfos: {
    bg: "#0b0b0d",
    lines: [
      "[   42.133701] Kernel panic - not syncing: resonance cascade",
      "[   42.133702] exitcode=0x00000009",
      "[   42.133705] CPU: 1 PID: 1 Comm: systemd Not tainted 6.12.0",
      "[   42.133711] Hardware name: ESP-KVM demo system",
      "[   42.133714] Call Trace:",
      "[   42.133716]  dump_stack_lvl+0x48/0x60",
      "[   42.133721]  panic+0x35c/0x390",
      "[   42.133725]  do_exit+0x8a1/0x8b0",
      "[   42.133730]  do_group_exit+0x31/0x80",
      "[   42.133734]  __x64_sys_exit_group+0x18/0x20",
      "[   42.133739]  do_syscall_64+0x5c/0x90",
      "[   42.133744] ---[ end Kernel panic - not syncing ]---",
    ],
  },
  mac: {
    bg: "#1a1a1c",
    lines: [
      "",
      "                 You need to restart your pear.",
      "                 Hold the power button for a few seconds,",
      "                 or press Reset.",
      "",
      "                 Vous devez redemarrer votre poire.",
      "",
      "                 Sie mussen Ihre Birne neu starten.",
      "",
      "",
      "  panic(cpu 0 caller 0xfruit): \"the fruit was not ripe\"",
      "  Backtrace: 0xdeadbeef 0xfeedface 0xba5eba11",
    ],
  },
  memtest: {
    bg: "#0b0b0d",
    lines: [
      "  ** Failure ** Address 0x7fffdeadbeef  Expected 0xAAAAAAAA  Got 0xAAAABAAA",
      "  Errors: 1    Test #7 [Block move, 80 moves]",
      "",
      "  One bit went the wrong way. That is what the test is for.",
    ],
  },
};

/* The memory test: a screen that never finishes, and stays text - so it can be
   selected and copied like any other. */
function memtestLines(t: number): string[] {
  const pct = Math.floor((t / 90) % 101);
  const pass = Math.floor(t / 9000);
  const bar = "#".repeat(Math.round(pct / 2.5)).padEnd(40, ".");
  return [
    "      Memtest86+ 7.20       Pass  " + String(pass).padStart(3, " ") + "    Errors     0",
    "-".repeat(76),
    "  CPU     : RISC-V dual core @ 400 MHz",
    "  Memory  : 32768 MB    Cache: 2048 KB",
    "",
    "  Test #7  [Block move, 80 moves]",
    "  [" + bar + "] " + String(pct).padStart(3, " ") + "%",
    "",
    "  Testing:  0MB - 32768MB    32768MB of 32768MB tested",
    "",
    "  Press Esc to exit, c for configuration.",
  ];
}

function lines(): string[] {
  const t = now() - since;
  const out: string[] = [];
  if (stage === "crash") {
    return guest === "none" ? [] : CRASH[guest].lines;
  }
  if (stage === "shell" && guest === "memtest") {
    return memtestLines(t);
  }
  if (stage === "post" || stage === "stuck" || stage === "boot") {
    for (const [at, text] of POST) {
      if (t >= at) out.push(text);
    }
  }
  if (stage === "stuck") {
    out.push("No boot device found");
    out.push("");
    out.push(hint);
  }
  if (stage === "boot" && guest !== "none") {
    for (const [at, text] of BOOT[guest]) {
      if (t >= at) out.push(text);
    }
  }
  if (stage === "shell") {
    out.push(...shell, "demo:~$ " + typed + (Math.floor(t / 500) % 2 ? "_" : ""));
  }
  return out;
}

/** Time is what moves this machine on, so every read looks at the clock first. */
const POST_MS = 3200;
const BOOT_MS = 2800;

/** Time is what moves this machine on. It runs until nothing more is due, so a
    tab that was in the background comes back where it should be, not one step
    along. */
function tick() {
  for (;;) {
    const t = now() - since;
    if (stage === "post" && t > POST_MS) {
      /* The drive is read here and nowhere else: this is the moment a machine
         decides what it is booting. */
      guest = guestFor(inserted);
      mediaMounted = Boolean(inserted);
      hint = exposed
        ? "Insert an image under Media, then press Reset."
        : "Switch Expose virtual media on under Media, choose an image, then press Reset.";
      go(mediaMounted ? "boot" : "stuck", POST_MS);
    } else if (stage === "boot" && t > BOOT_MS) {
      /* Two of them are pictures from here on; the other two land on a screen. */
      go(guest === "xp" || guest === "mac" ? "desktop" : "shell", BOOT_MS);
    } else {
      return;
    }
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

/** Which image is in the drive, by name - that is all the console tells us. */
/** Fall over, in whatever way this guest falls over. */
export function demoCrash() {
  tick();
  if (guest !== "none" && stage !== "crash" && stage !== "off") {
    go("crash");
  }
}

function guestFor(name: string): Guest {
  const n = name.toLowerCase();
  return !name
    ? "none"
    : n.includes("memtest")
      ? "memtest"
      : n.includes("xp")
        ? "xp"
        : n.includes("pear") || n.includes("mac")
          ? "mac"
          : "halfos";
}

/** What the target would see: the chosen image, but only while virtual media is
    switched on. With it off there is no drive at all, whatever is selected. */
export function demoMountMedia(name: string, isExposed: boolean) {
  exposed = isExposed;
  inserted = isExposed ? name : "";
}

/*
 * A launcher on the HalfOS desktop, in the manner of rofi - whose author,
 * DaveDavenport, is one of the people who tested this project's hardware. Typing
 * anything opens it, which is the point: it shows the keyboard reaching the
 * target even when the screen is a picture.
 */
const ROFI = [
  "firefox",
  "kitty",
  "htop",
  "nix-shell -p espkvm",
  "espkvm-console",
  "shutdown now",
  "sudo rm -rf /",
];
let rofiOpen = false;
let rofiQuery = "";
let rofiSel = 0;

function rofiMatches(): string[] {
  const q = rofiQuery.toLowerCase();
  return ROFI.filter((e) => e.includes(q));
}

/** What the launcher looks like right now, or null when it is not up. */
export function demoLauncher(): { query: string; items: string[]; sel: number } | null {
  tick();
  if (!rofiOpen || stage !== "desktop" || guest !== "halfos") return null;
  const items = rofiMatches();
  return { query: rofiQuery, items, sel: Math.min(rofiSel, Math.max(0, items.length - 1)) };
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
/* Esc closes, Enter runs, the arrows move, anything printable filters. Only one
   entry does anything, and it is the one that says what it does. */
function launcherKeys(mod: number, usages: number[]) {
  const shift = (mod & 0x22) !== 0;
  for (const u of usages) {
    if (!u) continue;
    if (u === 0x29) {
      rofiOpen = false;
      rofiQuery = "";
    } else if (u === 0x28) {
      const item = rofiMatches()[rofiSel];
      rofiOpen = false;
      rofiQuery = "";
      rofiSel = 0;
      if (item === "shutdown now") go("off");
      /* The entry everyone will pick first, and it does what it says. */
      if (item === "sudo rm -rf /") go("crash");
    } else if (u === 0x51) {
      rofiSel = Math.min(rofiSel + 1, Math.max(0, rofiMatches().length - 1));
    } else if (u === 0x52) {
      rofiSel = Math.max(0, rofiSel - 1);
    } else if (u === 0x2a) {
      rofiOpen = true;
      rofiQuery = rofiQuery.slice(0, -1);
      rofiSel = 0;
    } else if (KEYS[u]) {
      rofiOpen = true;
      if (rofiQuery.length < 40) rofiQuery += KEYS[u][shift ? 1 : 0];
      rofiSel = 0;
    }
  }
}

export function demoKeys(mod: number, usages: number[]) {
  tick();
  if (stage === "desktop" && guest === "halfos") {
    return launcherKeys(mod, usages);
  }
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
      shell.push("and one command this system will not survive. You know the one.");
      } else if (cmd === "clear") {
        shell = [];
      } else if (cmd === "sudo rm -rf /") {
        typed = "";
        go("crash");
        return;
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
  /** The demo paints its own background: a blue screen has to be blue. */
  bg?: string;
}

/** The screen as the firmware would report it, or null when it is a picture. */
export function demoScreenText(): DemoScreen | null {
  tick();
  if (stage === "off" || (stage === "desktop" && guest !== "none")) return null;
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
    bg: stage === "crash" && guest !== "none" ? CRASH[guest].bg : undefined,
  };
}

/** What the screen is: characters, or one of the two pictures a guest shows. */
export function demoScene(): "text" | "particles" | "hills" | "mac" {
  tick();
  if (stage === "desktop") {
    return guest === "xp" ? "hills" : guest === "mac" ? "mac" : "particles";
  }
  /* A crash is text, whatever the guest was showing a moment ago. */
  return "text";
}

/** How long this stage has been running - a scene draws its own opening from it. */
export function demoSceneMs(): number {
  tick();
  return now() - since;
}

export function demoMachine() {
  tick();
  return {
    stage,
    guest,
    powerOn: stage !== "off",
    signal: stage !== "off",
    textMode: stage !== "off" && stage !== "desktop",
    /* The watch fires on the same phrase the settings suggest, so the demo shows
       what a machine that fell over at three in the morning looks like. */
    alert: stage === "stuck" ? "no boot device" : "",
  };
}

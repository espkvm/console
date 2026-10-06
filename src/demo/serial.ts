/*
 * The demo's serial console: a made-up Raspberry Pi on the other end of the
 * wire. It boots once (a few seconds of kernel and systemd lines, in colour),
 * asks for a login and then answers a handful of shell commands - enough to
 * show what the real thing is for, with no device behind it.
 */

const CSI = "\x1b[";
const OK = `[  ${CSI}32mOK${CSI}0m  ]`;

const BOOT = [
  "[    0.000000] Booting Linux on physical CPU 0x0000000000 [0x410fd083]",
  "[    0.000000] Linux version 6.6.31+rpt-rpi-v8 (serial demo)",
  "[    0.000000] Machine model: Raspberry Pi 4 Model B Rev 1.4",
  "[    0.000000] Kernel command line: console=serial0,115200 console=tty1 root=PARTUUID=4e639091-02",
  "[    1.284512] mmc0: SDHCI controller on fe340000.mmc",
  "[    2.051337] EXT4-fs (mmcblk0p2): mounted filesystem with ordered data mode.",
  "[    3.101772] systemd[1]: systemd 252.22 running in system mode",
  `${OK} Started ${CSI}1mJournal Service${CSI}0m.`,
  `${OK} Reached target ${CSI}1mLocal File Systems${CSI}0m.`,
  `${OK} Started ${CSI}1mNetwork Manager${CSI}0m.`,
  `[${CSI}31mFAILED${CSI}0m] Failed to start ${CSI}1mBluetooth service${CSI}0m.`,
  `${OK} Started ${CSI}1mOpenBSD Secure Shell server${CSI}0m.`,
  `${OK} Reached target ${CSI}1mMulti-User System${CSI}0m.`,
  "",
  "Debian GNU/Linux 12 raspberrypi ttyS0",
  "",
];

type Emit = (text: string) => void;

export class DemoSerial {
  #emit: Emit;
  #line = "";
  #stage: "boot" | "login" | "password" | "shell" = "boot";
  #user = "pi";

  constructor(emit: Emit) {
    this.#emit = emit;
  }

  /** The console subscribed: play the boot, then ask for a login. */
  start() {
    this.#stage = "boot";
    BOOT.forEach((l, i) => setTimeout(() => this.#emit(`${l}\r\n`), 150 * i));
    setTimeout(() => {
      this.#stage = "login";
      this.#emit("raspberrypi login: ");
    }, 150 * BOOT.length + 200);
  }

  /** Bytes typed in the console. */
  input(text: string) {
    if (this.#stage === "boot") return;
    for (const ch of text) {
      if (ch === "\r") {
        this.#emit("\r\n");
        this.#enter(this.#line);
        this.#line = "";
      } else if (ch === "\x7f" || ch === "\b") {
        if (this.#line) {
          this.#line = this.#line.slice(0, -1);
          if (this.#stage !== "password") this.#emit("\b \b");
        }
      } else if (ch === "\x03") {
        this.#line = "";
        this.#emit("^C\r\n");
        this.#prompt();
      } else if (ch >= " " && ch !== "\x1b") {
        this.#line += ch;
        if (this.#stage !== "password") this.#emit(ch);
      }
    }
  }

  #prompt() {
    if (this.#stage === "shell") {
      this.#emit(`${CSI}1;32m${this.#user}@raspberrypi${CSI}0m:${CSI}1;34m~${CSI}0m$ `);
    } else if (this.#stage === "login") {
      this.#emit("raspberrypi login: ");
    }
  }

  #enter(cmd: string) {
    if (this.#stage === "login") {
      this.#user = cmd.trim() || "pi";
      this.#stage = "password";
      this.#emit("Password: ");
      return;
    }
    if (this.#stage === "password") {
      this.#stage = "shell";
      this.#emit("Linux raspberrypi 6.6.31+rpt-rpi-v8 aarch64\r\n\r\nAny password works in the demo.\r\n");
      this.#prompt();
      return;
    }
    const c = cmd.trim();
    const out: Record<string, string> = {
      "": "",
      help: "Try: uname -a, uptime, ls, df -h, clear, exit",
      "uname -a": "Linux raspberrypi 6.6.31+rpt-rpi-v8 #1 SMP PREEMPT Debian 1:6.6.31-1+rpt1 aarch64 GNU/Linux",
      uptime: " 10:42:07 up 3 min,  1 user,  load average: 0.21, 0.18, 0.08",
      ls: `${CSI}1;34mDesktop${CSI}0m  ${CSI}1;34mprojects${CSI}0m  notes.txt`,
      "df -h": "Filesystem      Size  Used Avail Use% Mounted on\r\n/dev/mmcblk0p2   29G  4.1G   24G  15% /",
      whoami: this.#user,
    };
    if (c === "clear") {
      this.#emit(`${CSI}2J${CSI}H`);
    } else if (c === "exit" || c === "logout") {
      this.#stage = "login";
      this.#emit("\r\nDebian GNU/Linux 12 raspberrypi ttyS0\r\n\r\n");
    } else if (c in out) {
      if (out[c]) this.#emit(`${out[c]}\r\n`);
    } else {
      this.#emit(`-bash: ${c.split(" ")[0]}: command not found\r\n`);
    }
    this.#prompt();
  }
}

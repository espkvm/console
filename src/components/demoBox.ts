/*
 * The demo's TV box, drawn: a living-room launcher for the HDMI-CEC remote to
 * walk. Pure drawing - the state comes from the demo machine through the window,
 * the way the other demo scenes get theirs, so nothing here is in a real build's
 * path unless the demo is running.
 */

export interface DemoBoxView {
  row: number;
  col: number;
  view: "home" | "game" | "playing";
  volume: number;
  muted: boolean;
  volumeAt: number;
  lastKey: string;
  lastFrom: "remote" | "keyboard";
  keyAt: number;
  /** How long the box has been up, and the machine's clock now. */
  ms: number;
  now: number;
  rows: { title: string; tiles: string[] }[];
}

/* Two colours per game, so every tile reads as its own thing at a glance. */
const PALETTE: [string, string][] = [
  ["#2b2d42", "#8d99ae"],
  ["#ff7b00", "#4a1d00"],
  ["#80b918", "#1b4332"],
  ["#4361ee", "#14213d"],
  ["#e63946", "#3d0c11"],
  ["#2a9d8f", "#0b2b26"],
  ["#7b2cbf", "#1d0636"],
  ["#f4a261", "#5c2a0d"],
  ["#00b4d8", "#03045e"],
  ["#ffd166", "#5a3e00"],
];

function colours(title: string): [string, string] {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* A tile: the game's two colours, a simple emblem, and its name. */
function drawTile(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string) {
  const [a, b] = colours(title);
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  roundRect(c, x, y, w, h, 10);
  c.fillStyle = g;
  c.fill();
  c.save();
  roundRect(c, x, y, w, h, 10);
  c.clip();
  c.globalAlpha = 0.18;
  c.fillStyle = "#fff";
  c.beginPath();
  c.arc(x + w * 0.78, y + h * 0.35, h * 0.45, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
  const shade = c.createLinearGradient(0, y + h * 0.5, 0, y + h);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.65)");
  c.fillStyle = shade;
  c.fillRect(x, y + h * 0.5, w, h * 0.5);
  c.restore();
  c.fillStyle = "#fff";
  c.font = `600 ${Math.round(h * 0.13)}px system-ui, sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillText(title, x + 12, y + h - 12, w - 24);
}

function focusRing(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.save();
  c.shadowColor = "rgba(127,209,255,0.8)";
  c.shadowBlur = 18;
  roundRect(c, x - 4, y - 4, w + 8, h + 8, 13);
  c.strokeStyle = "#fff";
  c.lineWidth = 4;
  c.stroke();
  c.restore();
}

const KEY_NAMES: Record<string, string> = {
  up: "▲ up",
  down: "▼ down",
  left: "◀ left",
  right: "▶ right",
  select: "OK",
  back: "Back",
  home: "Home",
  volume_up: "Vol +",
  volume_down: "Vol −",
  mute: "Mute",
};

export function drawDemoBox(c: CanvasRenderingContext2D, W: number, H: number, s: DemoBoxView) {
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#12101f");
  bg.addColorStop(1, "#231a3b");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  /* The top bar: a name and a clock. */
  c.fillStyle = "#fff";
  c.font = "800 26px system-ui, sans-serif";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText("VAPOR", 48, 40);
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.font = "500 20px system-ui, sans-serif";
  c.textAlign = "right";
  const d = new Date();
  c.fillText(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, W - 48, 40);

  const ROWS = s.rows;
  const sel = ROWS[s.row]?.tiles[s.col] ?? ROWS[0].tiles[0];

  if (s.view === "playing") {
    const [a, b] = colours(sel);
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.font = "800 56px system-ui, sans-serif";
    c.fillText(sel, W / 2, H / 2 - 30);
    c.font = "400 22px system-ui, sans-serif";
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fillText("Running. A remote drives a box's menus; a game wants a controller.", W / 2, H / 2 + 30);
    c.fillText("Back returns to the menu.", W / 2, H / 2 + 62);
  } else if (s.view === "game") {
    const tw = 520;
    const th = 292;
    drawTile(c, 80, 120, tw, th, sel);
    c.fillStyle = "#fff";
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    c.font = "800 44px system-ui, sans-serif";
    c.fillText(sel, 650, 180, W - 700);
    c.font = "400 20px system-ui, sans-serif";
    c.fillStyle = "rgba(255,255,255,0.7)";
    c.fillText("Last played: just now, on this very demo", 650, 220);
    const bx = 650;
    const by = 270;
    roundRect(c, bx, by, 220, 64, 10);
    c.fillStyle = "#7fd1ff";
    c.fill();
    focusRing(c, bx, by, 220, 64);
    c.fillStyle = "#0b1020";
    c.font = "700 26px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("▶  Play", bx + 110, by + 33);
  } else {
    /* Home: two rows of games; the focused one is a little bigger and ringed. */
    let y = 96;
    ROWS.forEach((row, r) => {
      const tw = r === 0 ? 280 : 196;
      const th = r === 0 ? 158 : 110;
      c.fillStyle = "rgba(255,255,255,0.8)";
      c.font = "600 20px system-ui, sans-serif";
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.fillText(row.title, 48, y + 22);
      y += 40;
      row.tiles.forEach((title, i) => {
        const x = 48 + i * (tw + 18);
        const on = r === s.row && i === s.col;
        const grow = on ? 1.06 : 1;
        const w = tw * grow;
        const h = th * grow;
        const ox = x - (w - tw) / 2;
        const oy = y - (h - th) / 2;
        drawTile(c, ox, oy, w, h, title);
        if (on) focusRing(c, ox, oy, w, h);
      });
      y += th + 40;
    });
  }

  /* The hints along the bottom, as a living-room interface shows them. */
  c.fillStyle = "rgba(0,0,0,0.35)";
  c.fillRect(0, H - 48, W, 48);
  c.fillStyle = "rgba(255,255,255,0.8)";
  c.font = "500 17px system-ui, sans-serif";
  c.textAlign = "right";
  c.textBaseline = "middle";
  c.fillText("OK  select      Back  back      Home  home", W - 48, H - 24);
  c.textAlign = "left";
  c.fillText("Driven by the remote over HDMI-CEC - or a keyboard on its USB", 48, H - 24);

  /* The volume bar, for a moment after it changes. */
  if (s.now - s.volumeAt < 1600) {
    const bw = 360;
    const bx = (W - bw) / 2;
    roundRect(c, bx, 70, bw, 46, 23);
    c.fillStyle = "rgba(10,10,20,0.85)";
    c.fill();
    c.fillStyle = "#fff";
    c.font = "600 16px system-ui, sans-serif";
    c.textAlign = "left";
    c.fillText(s.muted ? "Muted" : "Volume", bx + 20, 93);
    const tx = bx + 100;
    const tw = bw - 130;
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(tx, 89, tw, 8);
    c.fillStyle = s.muted ? "rgba(255,255,255,0.4)" : "#7fd1ff";
    c.fillRect(tx, 89, (tw * s.volume) / 20, 8);
  }

  /* Which key just arrived, so the visitor sees the press land. */
  const age = s.now - s.keyAt;
  if (s.lastKey && age < 900) {
    c.globalAlpha = Math.min(1, (900 - age) / 300);
    const label = `${s.lastFrom === "remote" ? "CEC" : "USB"}: ${KEY_NAMES[s.lastKey] ?? s.lastKey}`;
    c.font = "600 18px system-ui, sans-serif";
    const w = c.measureText(label).width + 32;
    roundRect(c, W - 48 - w, H - 100, w, 38, 19);
    c.fillStyle = "rgba(10,10,20,0.85)";
    c.fill();
    c.fillStyle = "#7fd1ff";
    c.textAlign = "center";
    c.fillText(label, W - 48 - w / 2, H - 81);
    c.globalAlpha = 1;
  }
}

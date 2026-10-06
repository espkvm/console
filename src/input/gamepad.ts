/*
 * The gamepad the device can show to a console (Settings -> Input -> Gamepad):
 * a HORI Pokken pad, which a Nintendo Switch and Steam on a Steam Deck both take
 * as a controller. Buttons carry the Switch's names.
 *
 * Buttons are mapped by position, not by letter: the bottom face button is the
 * Switch's B, the right one its A. That is what a player's thumb expects, and it
 * is also how Steam reads a Nintendo-style pad.
 */

export const PAD = {
  y: 1 << 0,
  b: 1 << 1,
  a: 1 << 2,
  x: 1 << 3,
  l: 1 << 4,
  r: 1 << 5,
  zl: 1 << 6,
  zr: 1 << 7,
  minus: 1 << 8,
  plus: 1 << 9,
  lstick: 1 << 10,
  rstick: 1 << 11,
  home: 1 << 12,
  capture: 1 << 13,
} as const;

export type PadButton = keyof typeof PAD;

export const HAT_NONE = 8;
export const CENTER = 128;

export type PadState = {
  buttons: number;
  hat: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
};

export const IDLE: PadState = { buttons: 0, hat: HAT_NONE, lx: CENTER, ly: CENTER, rx: CENTER, ry: CENTER };

/** Hat value for four held directions: 0 up, clockwise to 7; HAT_NONE when none or opposed. */
export function hatFrom(up: boolean, down: boolean, left: boolean, right: boolean): number {
  const v = (up ? -1 : 0) + (down ? 1 : 0);
  const h = (left ? -1 : 0) + (right ? 1 : 0);
  if (v === 0 && h === 0) return HAT_NONE;
  const table: Record<string, number> = {
    "-1,0": 0, "-1,1": 1, "0,1": 2, "1,1": 3, "1,0": 4, "1,-1": 5, "0,-1": 6, "-1,-1": 7,
  };
  return table[`${v},${h}`] ?? HAT_NONE;
}

/** A stick axis from -1..1 to 0..255, with a small dead zone so a resting stick reads centre. */
export function axis(v: number, dead = 0.12): number {
  if (!Number.isFinite(v) || Math.abs(v) < dead) return CENTER;
  return Math.max(0, Math.min(255, Math.round((v + 1) * 127.5)));
}

/*
 * The browser's "standard" layout (w3c Gamepad, section 9): 0 bottom, 1 right,
 * 2 left, 3 top face button; 4/5 shoulders; 6/7 triggers; 8 back; 9 start;
 * 10/11 stick clicks; 12..15 the cross; 16 the centre button.
 */
const STANDARD: [number, PadButton][] = [
  [0, "b"], [1, "a"], [2, "y"], [3, "x"],
  [4, "l"], [5, "r"], [6, "zl"], [7, "zr"],
  [8, "minus"], [9, "plus"], [10, "lstick"], [11, "rstick"], [16, "home"],
];

type GamepadLike = {
  mapping: string;
  buttons: readonly { pressed: boolean; value: number }[];
  axes: readonly number[];
};

/**
 * Can this controller be read as the standard layout? Either the browser says
 * so, or it gives no layout at all but has the standard's 16 buttons and four
 * axes - a DualShock 4 in some browsers, whose buttons sit in the same order.
 */
export function readable(gp: GamepadLike): boolean {
  return gp.mapping === "standard" || (gp.mapping === "" && gp.buttons.length >= 16 && gp.axes.length >= 4);
}

/** A connected controller's state in the pad's terms. Null when its layout is unknown. */
export function fromGamepad(gp: GamepadLike): PadState | null {
  if (!readable(gp)) return null;
  const down = (i: number) => {
    const b = gp.buttons[i];
    return !!b && (b.pressed || b.value > 0.5);
  };
  let buttons = 0;
  for (const [i, name] of STANDARD) if (down(i)) buttons |= PAD[name];
  return {
    buttons,
    hat: hatFrom(down(12), down(13), down(14), down(15)),
    lx: axis(gp.axes[0] ?? 0),
    ly: axis(gp.axes[1] ?? 0),
    rx: axis(gp.axes[2] ?? 0),
    ry: axis(gp.axes[3] ?? 0),
  };
}

/* The computer keyboard, while the gamepad window has focus. */
/* The rest of the keyboard; the face buttons come from keyFaces(). */
export const KEY_BUTTONS: Record<string, PadButton> = {
  q: "l",
  e: "r",
  "1": "zl",
  "3": "zr",
  "-": "minus",
  "=": "plus",
  "+": "plus",
  h: "home",
  c: "capture",
};
export const KEY_HAT: Record<string, "up" | "down" | "left" | "right"> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
/* WASD is the left stick, IJKL the right one: full tilt while held. */
export const KEY_STICK: Record<string, [stick: "l" | "r", ax: "x" | "y", dir: -1 | 1]> = {
  w: ["l", "y", -1],
  s: ["l", "y", 1],
  a: ["l", "x", -1],
  d: ["l", "x", 1],
  i: ["r", "y", -1],
  k: ["r", "y", 1],
  j: ["r", "x", -1],
  l: ["r", "x", 1],
};

export function sameState(a: PadState, b: PadState): boolean {
  return (
    a.buttons === b.buttons && a.hat === b.hat && a.lx === b.lx && a.ly === b.ly && a.rx === b.rx && a.ry === b.ry
  );
}

/*
 * What the buttons are called. Positions never change - the bottom face button
 * is the same wire whatever it is called - only the names do, so the panel can
 * read like the controller the target expects.
 */
export type LabelStyle = "nintendo" | "xbox" | "playstation";

export type Labels = {
  north: string;
  west: string;
  east: string;
  south: string;
  l: string;
  r: string;
  zl: string;
  zr: string;
  minus: string;
  plus: string;
  home: string;
  capture: string | null;
};

export const LABELS: Record<LabelStyle, Labels> = {
  nintendo: {
    north: "X", west: "Y", east: "A", south: "B",
    l: "L", r: "R", zl: "ZL", zr: "ZR",
    minus: "−", plus: "+", home: "⌂", capture: "■",
  },
  xbox: {
    north: "Y", west: "X", east: "B", south: "A",
    l: "LB", r: "RB", zl: "LT", zr: "RT",
    minus: "View", plus: "Menu", home: "⌂", capture: null,
  },
  playstation: {
    north: "△", west: "□", east: "○", south: "✕",
    l: "L1", r: "R1", zl: "L2", zr: "R2",
    minus: "Share", plus: "Options", home: "PS", capture: null,
  },
};

/* The face buttons by position, in the pad's (Switch) bit names. */
export const FACE: Record<"north" | "west" | "east" | "south", PadButton> = {
  north: "x",
  west: "y",
  east: "a",
  south: "b",
};

/**
 * Keys for the face buttons in a given style. Enter is "confirm" and Escape
 * "back" in that style's habit - right and bottom on a Switch, bottom and right
 * elsewhere - and a letter key presses the button wearing that letter.
 */
export function keyFaces(style: LabelStyle): Record<string, PadButton> {
  const confirm: PadButton = style === "nintendo" ? "a" : "b";
  const back: PadButton = style === "nintendo" ? "b" : "a";
  const keys: Record<string, PadButton> = { Enter: confirm, " ": confirm, Escape: back, Backspace: back };
  if (style !== "playstation") {
    const l = LABELS[style];
    for (const pos of ["north", "west", "east", "south"] as const) {
      keys[l[pos].toLowerCase()] = FACE[pos];
    }
  }
  return keys;
}

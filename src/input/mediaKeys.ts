/*
 * Media keys: volume, the player's keys and screen brightness. A keyboard
 * sends them as consumer-control usages (HID usage page 0x0C), not as key
 * positions, so they go to the device as their own message.
 */
import { tm } from "../i18n";

const BRIGHTNESS_NOTE = tm("On the target's own screen, a laptop's - not a monitor on HDMI.");

export interface MediaKey {
  label: string;
  icon: string;
  usage: number;
  /** The browser's KeyboardEvent.code for the same key, when it has one. */
  code: string;
  note?: string;
}

/* `as const` keeps each icon a literal name, which Icon checks. */
export const MEDIA_KEYS = [
  { label: tm("Mute"), icon: "volume-off", usage: 0xe2, code: "AudioVolumeMute" },
  { label: tm("Volume down"), icon: "volume-down", usage: 0xea, code: "AudioVolumeDown" },
  { label: tm("Volume up"), icon: "volume-up", usage: 0xe9, code: "AudioVolumeUp" },
  { label: tm("Previous track"), icon: "skip-back", usage: 0xb6, code: "MediaTrackPrevious" },
  { label: tm("Play/Pause"), icon: "play-pause", usage: 0xcd, code: "MediaPlayPause" },
  { label: tm("Next track"), icon: "skip-forward", usage: 0xb5, code: "MediaTrackNext" },
  {
    label: tm("Brightness down"),
    icon: "sun-dim",
    usage: 0x70,
    code: "BrightnessDown",
    note: BRIGHTNESS_NOTE,
  },
  { label: tm("Brightness up"), icon: "sun", usage: 0x6f, code: "BrightnessUp", note: BRIGHTNESS_NOTE },
] as const satisfies readonly MediaKey[];

/**
 * The consumer usage for a key the operator pressed, or 0. Browsers name the
 * brightness keys only in `key`, the rest in `code` too.
 */
export function mediaUsage(e: { code: string; key: string }): number {
  const keys: readonly MediaKey[] = MEDIA_KEYS;
  return keys.find((m) => m.code === e.code || m.code === e.key)?.usage ?? 0;
}

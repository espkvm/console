/*
 * The browser tab's title: the device's name, so two devices in two tabs can be
 * told apart, and a word in front when something is wrong.
 */

export interface TitleState {
  /** The device's hostname, when known. */
  host?: string;
  /** The device answers. */
  online: boolean;
  /** HDMI signal: false when there is none, undefined when not known yet. */
  signal?: boolean;
}

export function pageTitle(s: TitleState): string {
  const name = s.host ? `${s.host} - ESP-KVM` : "ESP-KVM";
  if (!s.online) return `Unreachable - ${name}`;
  if (s.signal === false) return `No signal - ${name}`;
  return name;
}

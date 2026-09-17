/*
 * Time zones for the device's clock. The firmware takes a POSIX TZ string
 * ("MSK-3", "CET-1CEST,M3.5.0,M10.5.0/3"), which nobody knows by heart, so the
 * console offers the common ones by their usual names and can take the zone of
 * the browser it runs in.
 */

/** IANA name -> POSIX TZ, rules included where the zone has summer time. */
export const TIME_ZONES: Record<string, string> = {
  UTC: "UTC0",
  "Europe/London": "GMT0BST,M3.5.0/1,M10.5.0",
  "Europe/Dublin": "IST-1GMT0,M10.5.0,M3.5.0/1",
  "Europe/Lisbon": "WET0WEST,M3.5.0/1,M10.5.0",
  "Europe/Berlin": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Paris": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Madrid": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Rome": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Amsterdam": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Warsaw": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Prague": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Stockholm": "CET-1CEST,M3.5.0,M10.5.0/3",
  "Europe/Kyiv": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Kiev": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Helsinki": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Athens": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Bucharest": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Riga": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Vilnius": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Tallinn": "EET-2EEST,M3.5.0/3,M10.5.0/4",
  "Europe/Istanbul": "<+03>-3",
  "Europe/Minsk": "<+03>-3",
  "Europe/Moscow": "MSK-3",
  "Europe/Samara": "<+04>-4",
  "Asia/Tbilisi": "<+04>-4",
  "Asia/Yerevan": "<+04>-4",
  "Asia/Baku": "<+04>-4",
  "Asia/Dubai": "<+04>-4",
  "Asia/Yekaterinburg": "<+05>-5",
  "Asia/Tashkent": "<+05>-5",
  "Asia/Almaty": "<+05>-5",
  "Asia/Karachi": "PKT-5",
  "Asia/Kolkata": "IST-5:30",
  "Asia/Omsk": "<+06>-6",
  "Asia/Novosibirsk": "<+07>-7",
  "Asia/Krasnoyarsk": "<+07>-7",
  "Asia/Bangkok": "<+07>-7",
  "Asia/Jakarta": "WIB-7",
  "Asia/Irkutsk": "<+08>-8",
  "Asia/Shanghai": "CST-8",
  "Asia/Singapore": "<+08>-8",
  "Asia/Hong_Kong": "HKT-8",
  "Australia/Perth": "AWST-8",
  "Asia/Yakutsk": "<+09>-9",
  "Asia/Tokyo": "JST-9",
  "Asia/Seoul": "KST-9",
  "Asia/Vladivostok": "<+10>-10",
  "Australia/Brisbane": "AEST-10",
  "Australia/Sydney": "AEST-10AEDT,M10.1.0,M4.1.0/3",
  "Asia/Magadan": "<+11>-11",
  "Asia/Kamchatka": "<+12>-12",
  "Pacific/Auckland": "NZST-12NZDT,M9.5.0,M4.1.0/3",
  "Africa/Lagos": "WAT-1",
  "Africa/Johannesburg": "SAST-2",
  "Africa/Cairo": "EET-2EEST,M4.5.5/0,M10.5.4/24",
  "Asia/Jerusalem": "IST-2IDT,M3.4.4/26,M10.5.0",
  "America/Sao_Paulo": "<-03>3",
  "America/Argentina/Buenos_Aires": "<-03>3",
  "America/New_York": "EST5EDT,M3.2.0,M11.1.0",
  "America/Toronto": "EST5EDT,M3.2.0,M11.1.0",
  "America/Chicago": "CST6CDT,M3.2.0,M11.1.0",
  "America/Mexico_City": "CST6",
  "America/Denver": "MST7MDT,M3.2.0,M11.1.0",
  "America/Phoenix": "MST7",
  "America/Los_Angeles": "PST8PDT,M3.2.0,M11.1.0",
  "America/Vancouver": "PST8PDT,M3.2.0,M11.1.0",
  "America/Anchorage": "AKST9AKDT,M3.2.0,M11.1.0",
  "Pacific/Honolulu": "HST10",
};

/** A fixed offset in POSIX form: UTC+3 is "<+03>-3" (POSIX counts the other way). */
export function posixFromOffset(minutesEast: number): string {
  const sign = minutesEast >= 0 ? "+" : "-";
  const abs = Math.abs(minutesEast);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const name = `<${sign}${String(h).padStart(2, "0")}${m ? String(m).padStart(2, "0") : ""}>`;
  const posixSign = minutesEast >= 0 ? "-" : "";
  return `${name}${minutesEast === 0 ? "0" : posixSign + h + (m ? `:${String(m).padStart(2, "0")}` : "")}`;
}

/**
 * The browser's zone: its name, and the POSIX string for it - from the table,
 * or its current offset when the name is not there (then without summer time).
 */
export function browserZone(
  name = Intl.DateTimeFormat().resolvedOptions().timeZone,
  minutesEast = -new Date().getTimezoneOffset(),
): { name: string; posix: string; exact: boolean } {
  const posix = TIME_ZONES[name];
  return posix
    ? { name, posix, exact: true }
    : { name: name || "this browser", posix: posixFromOffset(minutesEast), exact: false };
}

/** Standard offset east of UTC in minutes, from a POSIX string ("MSK-3" -> 180). */
export function posixOffset(posix: string): number | null {
  const m = /^(?:<[^>]*>|[A-Za-z]{3,})([+-]?)(\d{1,2})(?::(\d{2}))?/.exec(posix);
  if (!m) return null;
  const west = (Number(m[2]) * 60 + Number(m[3] ?? 0)) * (m[1] === "-" ? -1 : 1);
  return -west;
}

/** "UTC+03:00" */
export function offsetLabel(minutesEast: number): string {
  const sign = minutesEast < 0 ? "-" : "+";
  const abs = Math.abs(minutesEast);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export interface ZoneOption {
  /** What is stored: the POSIX string. */
  posix: string;
  /** The IANA name, which tells apart cities sharing a string. */
  name: string;
  label: string;
}

/** Every zone in the list, west to east, labelled "UTC+03:00 Moscow". */
export function zoneOptions(): ZoneOption[] {
  return Object.entries(TIME_ZONES)
    .filter(([name]) => name !== "Europe/Kiev") /* an old spelling of Kyiv */
    .map(([name, posix]) => {
      const city = name === "UTC" ? "UTC" : name.slice(name.lastIndexOf("/") + 1).replace(/_/g, " ");
      return { name, posix, offset: posixOffset(posix) ?? 0, city };
    })
    .sort((a, b) => a.offset - b.offset || a.city.localeCompare(b.city))
    .map(({ name, posix, offset, city }) => ({ name, posix, label: `${offsetLabel(offset)} ${city}` }));
}

/** The usual name for a POSIX string, if it is one of ours. */
export function zoneName(posix: string): string | null {
  for (const [name, p] of Object.entries(TIME_ZONES)) {
    if (p === posix) return name;
  }
  return null;
}

/*
 * Translations of the console, loaded into the browser on demand.
 *
 * The console is written in English and the English text is the key, as with
 * gettext: t("Paste from clipboard") looks that sentence up in the loaded
 * language and falls back to it. That gives three things for free:
 *
 * - a translation of text that has since changed in English no longer matches,
 *   so the operator sees the current English rather than a stale translation;
 * - text the firmware sends (setting titles and help, error messages) goes
 *   through the same dictionary with no change on the device;
 * - tools/i18n_strings.mjs can list what a language still lacks.
 *
 * A language is a JSON file: web/locales/<code>.json in the repository,
 * published at fw.espkvm.io/locales/ with each release. It lives in this
 * browser's storage, so it is each viewer's own choice and the device stores
 * nothing. A device with no internet can be given the file by hand.
 *
 *   { "@language": "lt", "@name": "Lietuvių",
 *     "@offer": "Konsolė yra ir lietuvių kalba: Nustatymai, Sąsaja, Kalba.",
 *     "@translators": ["Name", "Another name"],
 *     "Paste from clipboard": "Įklijuoti iš iškarpinės",
 *     "{n} viewer": { "one": "{n} žiūrovas", "few": "{n} žiūrovai", "many": "{n} žiūrovo", "other": "{n} žiūrovų" } }
 *
 * Placeholders are {name}. A plural is an object keyed by the language's
 * plural categories (Intl.PluralRules), under the English singular.
 */

import { ref, shallowRef } from "vue";

type Entry = string | Record<string, string>;
type Catalog = Record<string, Entry>;

export const LOCALES_URL = "https://fw.espkvm.io/locales/";

const KEY_CODE = "espkvm.lang";
const keyFor = (code: string) => `espkvm.lang.${code}`;

/** The active language code, "en" when none is loaded. */
export const locale = ref("en");
/** The active language's name in itself, from its file ("Lietuvių"). */
export const localeName = ref("English");
/** Who translated the active language, from its file's "@translators". */
export const localeTranslators = ref<string[]>([]);
const catalog = shallowRef<Catalog>({});
let plural = new Intl.PluralRules("en");

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private window or full storage: the language lasts this visit only */
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/* Limits a usable file keeps to. Generous for real translations; they stop a
   broken or hostile file from filling memory or the screen. */
const MAX_BYTES = 512 * 1024;
const MAX_ENTRIES = 10000;
const MAX_TEXT = 4000;
export const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);
/* Keys that would reach the object's prototype rather than the catalog. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
/* Control characters other than the line feed and tab have no place in text. */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/* A translation usable for @p key: text of a sane length, with only the
   placeholders the English has ({n} too in a count). */
export function textOk(key: string, value: unknown, count: boolean): value is string {
  if (typeof value !== "string" || !value || value.length > MAX_TEXT || CONTROL.test(value)) return false;
  const allowed = placeholders(key);
  if (count) allowed.add("n");
  for (const p of placeholders(value)) if (!allowed.has(p)) return false;
  return true;
}

export interface ParsedLanguage {
  code: string;
  name: string;
  /** Who translated it, as the file names them. */
  translators: string[];
  strings: Catalog;
  /** Entries left out because they were not usable; English shows for them. */
  skipped: number;
}

/**
 * Check a language file before it is used. A file that is not one (not JSON,
 * no "@language" code, too large) is refused whole. A single bad entry - a
 * number, a missing placeholder, a control character - is left out, and the
 * console shows the English there. Nothing in the file can reach the page as
 * markup: the console only ever shows translations as text.
 */
export function parseLanguage(text: string): ParsedLanguage {
  if (text.length > MAX_BYTES) throw new Error(t("The language file is larger than 512 KB"));
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t("Not a language file: it is not valid JSON"));
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(t("Not a language file: it is not valid JSON"));
  }
  const obj = data as Record<string, unknown>;
  const code = obj["@language"];
  if (typeof code !== "string" || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) {
    throw new Error(t("Not a language file: it has no \"@language\" code"));
  }
  const rawName = obj["@name"];
  const name = typeof rawName === "string" && rawName && rawName.length <= 40 && !CONTROL.test(rawName) ? rawName : code;
  const translators = readTranslators(obj["@translators"]);
  const strings: Catalog = Object.create(null);
  let skipped = 0;
  let count = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("@")) continue;
    if (++count > MAX_ENTRIES) {
      skipped++;
      continue;
    }
    if (UNSAFE_KEYS.has(k) || k.length > MAX_TEXT) {
      skipped++;
    } else if (typeof v === "string") {
      if (textOk(k, v, false)) strings[k] = v;
      else skipped++;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      const forms: Record<string, string> = Object.create(null);
      let good = true;
      for (const [f, x] of Object.entries(v as Record<string, unknown>)) {
        if (!PLURAL_FORMS.has(f) || !textOk(k, x, true)) good = false;
        else forms[f] = x;
      }
      if (good && Object.keys(forms).length) strings[k] = forms;
      else skipped++;
    } else {
      skipped++;
    }
  }
  return { code, name, translators, strings, skipped };
}

/* "@translators": a list of names, shown as plain text. Anything else in it
   is dropped, the rest of the file still counts. */
const MAX_TRANSLATORS = 30;
const MAX_TRANSLATOR = 80;
export function readTranslators(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x && x.length <= MAX_TRANSLATOR && !CONTROL.test(x))
    .slice(0, MAX_TRANSLATORS);
}

function activate(code: string, strings: Catalog, name: string, translators: string[] = []) {
  catalog.value = strings;
  locale.value = code;
  localeName.value = name;
  localeTranslators.value = translators;
  try {
    plural = new Intl.PluralRules(code);
  } catch {
    plural = new Intl.PluralRules("en");
  }
  if (typeof document !== "undefined") document.documentElement.lang = code;
}

/** The text of the active language's file, to give it to the device. */
let activeText: string | null = null;
export const activeLanguageText = () => activeText;

/** Use a language file's text (from the site or a file the operator chose). */
export function installLanguage(text: string): ParsedLanguage {
  const lang = parseLanguage(text);
  store(keyFor(lang.code), text);
  store(KEY_CODE, lang.code);
  activate(lang.code, lang.strings, lang.name, lang.translators);
  activeText = text;
  return lang;
}

/** Download a language from fw.espkvm.io and use it. */
export async function fetchLanguage(code: string): Promise<ParsedLanguage> {
  const res = await fetch(`${LOCALES_URL}${encodeURIComponent(code)}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(t("Could not download the language ({status})", { status: res.status }));
  return installLanguage(await res.text());
}

/** A language on offer: its code, its own name, and a line offering it, in it. */
export interface Offered {
  code: string;
  name: string;
  offer?: string;
  /** How much of the console the file translates, 0-100. */
  percent?: number;
}

/** The languages on offer, from fw.espkvm.io/locales/index.json. */
export async function listLanguages(): Promise<Offered[]> {
  const res = await fetch(`${LOCALES_URL}index.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(t("Could not get the list of languages ({status})", { status: res.status }));
  const list = (await res.json()) as Offered[];
  return Array.isArray(list) ? list.filter((l) => typeof l?.code === "string") : [];
}

/** One English string of the console; a count also has its English plural. */
export interface SourceString {
  en: string;
  other?: string;
}

/** Read strings.json, the list of every English string. Throws on a wrong file. */
export function parseStrings(text: string): SourceString[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t("Not the list of strings: it is not valid JSON"));
  }
  const list = (data as { strings?: unknown })?.strings;
  if (!Array.isArray(list)) throw new Error(t("Not the list of strings: it has no \"strings\""));
  return list.filter(
    (x): x is SourceString =>
      !!x && typeof x.en === "string" && x.en.length <= MAX_TEXT && (x.other === undefined || typeof x.other === "string"),
  );
}

/** Every English string, from fw.espkvm.io/locales/strings.json. */
export async function fetchStrings(): Promise<SourceString[]> {
  const res = await fetch(`${LOCALES_URL}strings.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(t("Could not get the list of strings ({status})", { status: res.status }));
  return parseStrings(await res.text());
}

/**
 * The browser's own language, when the console has it and is still in English
 * and it was not offered before: its line offering it (in that language), once.
 */
export async function languageToOffer(): Promise<string | null> {
  if (locale.value !== "en" || read("espkvm.lang.offered")) return null;
  const wanted = (navigator.languages ?? [navigator.language]).map((l) => l.toLowerCase());
  if (wanted[0]?.startsWith("en")) return null;
  const list = await listLanguages().catch(() => []);
  for (const w of wanted) {
    if (w.startsWith("en")) return null;
    const hit = list.find((l) => w === l.code.toLowerCase() || w.split("-")[0] === l.code.toLowerCase());
    if (hit?.offer) {
      store("espkvm.lang.offered", hit.code);
      return hit.offer;
    }
  }
  return null;
}

/** English, chosen for this browser even where the device has a language. */
export function useEnglish() {
  store(KEY_CODE, "en");
  activate("en", {}, "English");
  activeText = null;
}

/** Switch to a language already downloaded in this browser. False if it is not. */
export function useStored(code: string): boolean {
  const text = read(keyFor(code));
  if (!text) return false;
  try {
    const lang = parseLanguage(text);
    activate(code, lang.strings, lang.name, lang.translators);
    store(KEY_CODE, code);
    activeText = text;
    return true;
  } catch {
    return false;
  }
}

function fill(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** The text in the active language, with {placeholders} filled in. */
export function t(en: string, params?: Record<string, string | number>): string {
  const e = catalog.value[en];
  return fill(typeof e === "string" && e ? e : en, params);
}

/**
 * A count: @p one or @p other in English, the language's own plural form when
 * translated. {n} is filled with @p n.
 */
export function tn(one: string, other: string, n: number, params?: Record<string, string | number>): string {
  const all = { ...params, n };
  const e = catalog.value[one];
  if (typeof e === "string" && e) return fill(e, all); // a language with one form
  if (e && typeof e === "object") {
    const form = e[plural.select(n)] ?? e.other ?? e.many;
    if (form) return fill(form, all);
  }
  return fill(n === 1 ? one : other, all);
}

/**
 * Marks English text for translation without translating it: for text kept in
 * a table and passed through t() where it is shown. tools/i18n_strings.mjs
 * collects it like a t() call.
 */
export const tm = (en: string): string => en;

/* ---- the device's own language ------------------------------------------ */

export const DEVICE_LOCALE_URL = "/api/v1/locale";

/** The device's language as {code, name}, null for English, undefined until known. */
export const deviceLanguage = ref<{ code: string; name: string } | null | undefined>(undefined);
let deviceText: string | null = null;

/** Whether this browser follows the device rather than a choice of its own. */
export const followsDevice = () => read(KEY_CODE) === null;

/**
 * Ask the device for its language; a browser with no choice of its own then
 * uses it. A file the device holds is checked like any other: a broken one
 * leaves the console in English.
 */
export async function loadDeviceLanguage(): Promise<void> {
  try {
    const res = await fetch(DEVICE_LOCALE_URL, { cache: "no-cache" });
    if (!res.ok) {
      deviceLanguage.value = null;
      return;
    }
    const text = await res.text();
    const lang = parseLanguage(text);
    deviceText = text;
    deviceLanguage.value = { code: lang.code, name: lang.name };
    if (followsDevice()) {
      activate(lang.code, lang.strings, lang.name, lang.translators);
      activeText = text;
    }
  } catch {
    deviceLanguage.value = null;
  }
}

/** Follow the device's language again, dropping this browser's own choice. */
export function followDevice() {
  store(KEY_CODE, null);
  if (deviceText) {
    const lang = parseLanguage(deviceText);
    activate(lang.code, lang.strings, lang.name, lang.translators);
    activeText = deviceText;
  } else {
    activate("en", {}, "English");
    activeText = null;
  }
}

/** Make the active language the device's (null: English). Needs a sign-in. */
export async function setDeviceLanguage(text: string | null): Promise<void> {
  const res = await fetch(DEVICE_LOCALE_URL, {
    method: text === null ? "DELETE" : "PUT",
    /* CONSOLE_HEADER of state/device.ts, written out: that module uses this one. */
    headers: { "X-ESP-KVM": "1", "Content-Type": "application/json" },
    body: text ?? undefined,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(t(body.error ?? "The device did not keep the language ({status})", { status: res.status }));
  }
  if (text === null) {
    deviceText = null;
    deviceLanguage.value = null;
  } else {
    const lang = parseLanguage(text);
    deviceText = text;
    deviceLanguage.value = { code: lang.code, name: lang.name };
  }
}

/**
 * A link can ask for a language and the editor: ?lang=de downloads German,
 * ?edit=1 opens the editor on it, ?edit=new on an empty language. The site's
 * translations page links here. The parameters are taken off the address so
 * a reload does not repeat them. Returns what the editor should open as.
 */
/** The editor a link asked for, until it is closed. */
export const editorFromLink = ref<"edit" | "new" | null>(null);

export async function takeLanguageLink(): Promise<"edit" | "new" | null> {
  if (typeof location === "undefined") return null;
  const url = new URL(location.href);
  const lang = url.searchParams.get("lang");
  const edit = url.searchParams.get("edit");
  if (lang === null && edit === null) return null;
  url.searchParams.delete("lang");
  url.searchParams.delete("edit");
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  if (lang && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang)) {
    if (lang === "en") useEnglish();
    else await fetchLanguage(lang).catch(() => useStored(lang));
  }
  return edit === "new" ? "new" : edit !== null ? "edit" : null;
}

/* The stored choice, applied before the first render. */
{
  const code = read(KEY_CODE);
  if (code && code !== "en") useStored(code);
}

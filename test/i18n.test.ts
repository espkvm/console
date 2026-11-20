/*
 * Translations: English is the key and the fallback, placeholders fill in,
 * counts take the language's plural form.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { installLanguage, localeTranslators, parseLanguage, t, tn, useEnglish } from "../src/i18n";

const RU = JSON.stringify({
  "@language": "ru",
  "@name": "Русский",
  "Paste from clipboard": "Вставить из буфера обмена",
  "Stopped after {n} of {total} characters": "Остановлено после {n} из {total} символов",
  "{n} viewer": { one: "{n} зритель", few: "{n} зрителя", many: "{n} зрителей", other: "{n} зрителя" },
});

test("English is the fallback, with placeholders filled", () => {
  useEnglish();
  assert.equal(t("Paste from clipboard"), "Paste from clipboard");
  assert.equal(t("Stopped after {n} of {total} characters", { n: 3, total: 9 }), "Stopped after 3 of 9 characters");
  assert.equal(tn("{n} viewer", "{n} viewers", 1), "1 viewer");
  assert.equal(tn("{n} viewer", "{n} viewers", 5), "5 viewers");
});

test("a loaded language translates, and text it lacks stays English", () => {
  installLanguage(RU);
  assert.equal(t("Paste from clipboard"), "Вставить из буфера обмена");
  assert.equal(t("Stopped after {n} of {total} characters", { n: 3, total: 9 }), "Остановлено после 3 из 9 символов");
  assert.equal(t("Not in the file"), "Not in the file");
  useEnglish();
});

test("counts use the language's plural forms", () => {
  installLanguage(RU);
  assert.equal(tn("{n} viewer", "{n} viewers", 1), "1 зритель");
  assert.equal(tn("{n} viewer", "{n} viewers", 3), "3 зрителя");
  assert.equal(tn("{n} viewer", "{n} viewers", 11), "11 зрителей");
  assert.equal(tn("{n} viewer", "{n} viewers", 21), "21 зритель");
  useEnglish();
});

test("a file without a language code is refused", () => {
  assert.throws(() => parseLanguage('{"Paste": "x"}'));
});

test("a broken file is refused, a bad entry is left out", () => {
  assert.throws(() => parseLanguage("not json"));
  assert.throws(() => parseLanguage("[1, 2]"));
  assert.throws(() => parseLanguage('{"@language": "Russian"}'));
  assert.throws(() => parseLanguage(`{"@language": "ru", "a": "${"x".repeat(600 * 1024)}"}`));
  const lang = parseLanguage(
    JSON.stringify({
      "@language": "ru",
      Good: "Хорошо",
      "A number": 5,
      "Hello {name}": "Привет {user}",
      "Bell": "\u0007",
      "{n} file": { one: "{n} файл", single: "x" },
      __proto__: "x",
    }),
  );
  assert.equal(lang.strings.Good, "Хорошо");
  assert.equal(Object.keys(lang.strings).length, 1);
  assert.equal(lang.skipped, 4);
  installLanguage(JSON.stringify({ "@language": "ru", "Hello {name}": "Привет {user}" }));
  assert.equal(t("Hello {name}", { name: "Ann" }), "Hello Ann");
  useEnglish();
});

test("translators are a list of names, the bad ones dropped", () => {
  const lang = parseLanguage(
    JSON.stringify({
      "@language": "ru",
      "@translators": ["Anna", "  Ivan  ", 5, "", "x".repeat(81), "Bell\u0007"],
    }),
  );
  assert.deepEqual(lang.translators, ["Anna", "Ivan"]);
  assert.deepEqual(parseLanguage('{"@language": "ru", "@translators": "Anna"}').translators, []);
  installLanguage(JSON.stringify({ "@language": "ru", "@translators": ["Anna"] }));
  assert.deepEqual(localeTranslators.value, ["Anna"]);
  useEnglish();
  assert.deepEqual(localeTranslators.value, []);
});

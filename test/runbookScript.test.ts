/*
 * The runbook parser has a twin in C on the device, and the two must agree:
 * a script the editor accepts must run, and the message for a bad line must
 * be the one the device would give. These pin the TypeScript side; the C side
 * has components/kvm_runbook/test.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseRunbookScript, loadRunbooks, serializeRunbooks, runbooksBytes } from "../src/runbookScript";

test("every verb parses, with comments, blanks and odd spacing", () => {
  const steps = parseRunbookScript(
    "# enter the setup\n  KEY  Ctrl + Alt + Del \r\n\ntimeout 90\nwait Press F2\nkey f2\ngone Loading\ntype root\ndelay 250\n",
  );
  assert.deepEqual(steps, [
    { kind: "key", mod: 0x05, code: 0x4c },
    { kind: "timeout", seconds: 90 },
    { kind: "wait", phrase: "Press F2" },
    { kind: "key", mod: 0, code: 0x3b },
    { kind: "gone", phrase: "Loading" },
    { kind: "type", text: "root" },
    { kind: "delay", ms: 250 },
  ]);
});

test("refusals name the line, in the device's words", () => {
  const refuses = (script: string, message: string) =>
    assert.throws(() => parseRunbookScript(script), (e: Error) => e.message === message);
  refuses("key f13", 'line 1: unknown key "f13"');
  refuses("type", "line 1: nothing to type");
  refuses("type café", 'line 1: cannot type "é" - US layout, ASCII only');
  refuses("delay 0", "line 1: delay wants 1..60000 milliseconds");
  refuses("delay soon", "line 1: delay wants 1..60000 milliseconds");
  refuses("timeout 3601", "line 1: timeout wants 1..3600 seconds");
  refuses("wait", "line 1: which phrase?");
  refuses("wait " + "x".repeat(64), "line 1: a phrase is at most 63 characters");
  refuses("\n\nfrobnicate now", 'line 3: unknown command "frobnicate"');
  refuses("", "line 1: the runbook has no steps");
  refuses("key a\n".repeat(65), "line 65: more than 64 steps");
});

test("the stored list round-trips and its size is measured in bytes", () => {
  const list = [{ name: "setup", script: "wait Press F2\nkey f2" }];
  const json = serializeRunbooks(list);
  assert.deepEqual(loadRunbooks(json), list);
  assert.deepEqual(loadRunbooks(""), []);
  assert.deepEqual(loadRunbooks("not json"), []);
  assert.deepEqual(loadRunbooks('[{"name":1}]'), []);
  assert.equal(runbooksBytes(list), json.length);
});

test("DuckyScript is detected and translated to native", () => {
  const steps = parseRunbookScript(
    "REM open run\nDELAY 500\nGUI r\nSTRING cmd\nENTER\nCTRL ALT DELETE\n",
  );
  assert.deepEqual(steps, [
    { kind: "delay", ms: 500 },
    { kind: "key", mod: 0x08, code: 0x15 }, // gui+r
    { kind: "type", text: "cmd" },
    { kind: "key", mod: 0, code: 0x28 }, // enter
    { kind: "key", mod: 0x05, code: 0x4c }, // ctrl+alt+del
  ]);
});

test("DEFAULT_DELAY, STRINGLN, a lone GUI and REPEAT expand as the device does", () => {
  const steps = parseRunbookScript("DEFAULT_DELAY 100\nGUI\nSTRINGLN hi\nDOWN\nREPEAT 2\n");
  assert.equal(steps.length, 11);
  assert.deepEqual(steps[0], { kind: "key", mod: 0x08, code: 0 }); // GUI alone
  assert.deepEqual(steps[1], { kind: "delay", ms: 100 });
  assert.deepEqual(steps[2], { kind: "type", text: "hi" });
  assert.equal(steps[3].code, 0x28); // enter from STRINGLN
  assert.equal(steps[5].code, 0x51); // down
  assert.equal(steps[7].code, 0x51); // repeat 1
  assert.equal(steps[9].code, 0x51); // repeat 2
});

test("DuckyScript refusals keep the source line, and native upper-case is left alone", () => {
  const at = (script: string, message: string) =>
    assert.throws(() => parseRunbookScript(script), (e: Error) => e.message === message);
  at("STRING ok\nWiggle now\n", 'line 2: unknown key "Wiggle"');
  at("DELAY soon", "line 1: DELAY wants 1..60000 milliseconds");
  at("REPEAT 2", "line 1: REPEAT with nothing before it");
  at("STRING café", "line 1: STRING is US layout, ASCII only");
  // KEY/TYPE are not DuckyScript keywords, so an upper-case native script stays native.
  assert.equal(parseRunbookScript("KEY ctrl+c\nTYPE hi").length, 2);
});

import { cronError, loadSchedules, serializeSchedules } from "../src/schedules";

test("cron validation matches the device, and schedules round-trip", () => {
  assert.equal(cronError("0 7 * * *"), null);
  assert.equal(cronError("*/15 9-17 * * 1-5"), null);
  assert.equal(cronError("0 0 * * 7"), null);
  assert.equal(cronError("* * * *"), "a schedule is five fields: minute hour day month weekday");
  assert.equal(cronError("60 * * * *"), 'the minute field "60" is not valid');
  assert.equal(cronError("0 24 * * *"), 'the hour field "24" is not valid');
  assert.equal(cronError("0 0 0 * *"), 'the day-of-month field "0" is not valid');
  assert.equal(cronError("0 0 * 13 *"), 'the month field "13" is not valid');
  assert.equal(cronError("0 0 * * 8"), 'the weekday field "8" is not valid');
  assert.equal(cronError("*/0 * * * *"), 'the minute field "*/0" is not valid');

  const list = [
    { name: "wake", cron: "0 7 * * 1-5", action: "wol" as const, enabled: true },
    { name: "nightly", cron: "0 2 * * *", action: "runbook" as const, arg: "backup", enabled: false },
  ];
  const json = serializeSchedules(list);
  assert.deepEqual(loadSchedules(json), list);
  assert.deepEqual(loadSchedules("nonsense"), []);
});

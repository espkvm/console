import { test } from "node:test";
import assert from "node:assert/strict";
import { findCommands, remember, RECENT_MAX, type Command } from "../src/ui/commands.ts";

const c = (id: string, title: string, group = "G", keywords?: string): Command => ({ id, title, group, keywords, run: () => {} });
const LIST = [
  c("panel:input", "Input", "Panels", "keys macros"),
  c("cap:shot", "Screenshot", "Capture", "photo"),
  c("win:serial", "Serial console", "Windows"),
  c("combo:cad", "Send Ctrl+Alt+Del", "Keys"),
  c("settings:video", "Settings: Video", "Settings"),
];
const ids = (l: Command[]) => l.map((x) => x.id);

test("empty query: recent first, then the rest in order", () => {
  assert.deepEqual(ids(findCommands(LIST, "", ["win:serial", "gone"])), ["win:serial", "panel:input", "cap:shot", "combo:cad", "settings:video"]);
});

test("every word must match somewhere", () => {
  assert.deepEqual(ids(findCommands(LIST, "ser con")), ["win:serial"]);
  assert.deepEqual(ids(findCommands(LIST, "photo")), ["cap:shot"]);
  assert.deepEqual(ids(findCommands(LIST, "xyz")), []);
});

test("title prefix ranks first, word starts next", () => {
  const l = [c("a", "Copy the screen as text"), c("b", "Screenshot"), c("d", "Settings: Screen")];
  assert.deepEqual(ids(findCommands(l, "scr")), ["b", "a", "d"]);
  assert.equal(findCommands(LIST, "video")[0].id, "settings:video");
});

test("case does not matter, + in a combo works", () => {
  assert.deepEqual(ids(findCommands(LIST, "CTRL+ALT")), ["combo:cad"]);
});

test("remember keeps the newest first and a short list", () => {
  let r: string[] = [];
  for (const id of ["a", "b", "c", "a", "d", "e", "f"]) r = remember(r, id);
  assert.deepEqual(r, ["f", "e", "d", "a", "c"]);
  assert.equal(r.length, RECENT_MAX);
});

test("search-only commands wait for a query", () => {
  const list = [c("a", "Screenshot"), { ...c("s", "Video codec", "Video setting"), searchOnly: true }];
  assert.deepEqual(findCommands(list, "").map((x) => x.id), ["a"]);
  assert.deepEqual(findCommands(list, "codec").map((x) => x.id), ["s"]);
  assert.deepEqual(findCommands(list, "", ["s"]).map((x) => x.id), ["s", "a"]);
});

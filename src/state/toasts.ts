/* Transient notices, shared by every component without prop plumbing. */

import { reactive, readonly } from "vue";

export type ToastKind = "info" | "error";

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** When it last happened, ms since the epoch: an error waits for the
      operator, who may come back hours later. */
  at: number;
  /** How many times the same notice came, shown as a count. */
  count: number;
}

const list = reactive<Toast[]>([]);
let nextId = 1;

export const toasts = readonly(list);

export function dismissToast(id: number) {
  const i = list.findIndex((t) => t.id === id);
  if (i >= 0) list.splice(i, 1);
}

function push(kind: ToastKind, text: string) {
  /* The same notice again is one toast with a count and the latest time,
     so a repeat does not push the others out. */
  const same = list.findIndex((t) => t.kind === kind && t.text === text);
  if (same >= 0 && kind === "error") {
    const [t] = list.splice(same, 1);
    list.push({ ...t, at: Date.now(), count: t.count + 1 });
    return;
  }
  const id = nextId++;
  list.push({ id, kind, text, at: Date.now(), count: 1 });
  if (list.length > 4) list.shift();
  /* Errors stay: an operator who missed one has no other way to learn what
     the device refused. */
  if (kind !== "error") setTimeout(() => dismissToast(id), 4000);
}

export const toast = {
  info: (text: string) => push("info", text),
  error: (text: string) => push("error", text),
};

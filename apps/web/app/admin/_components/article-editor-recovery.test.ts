import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_RECOVERY_PREFIX,
  createEditorRecoverySnapshot,
  editorRecoveryKey,
  readEditorRecoverySnapshot,
  removeEditorRecoverySnapshot,
  clearEditorRecoverySnapshots,
  writeEditorRecoverySnapshot,
  type EditorRecoveryFields,
} from "./article-editor-recovery";

const postId = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-08-30T12:00:00.000Z");
const fields: EditorRecoveryFields = {
  title: "未完成标题",
  summary: "",
  coverUrl: "",
  slug: "",
  markdown: "# 尚未提交",
  publishedAt: "",
  seoDescription: "",
  categoryId: null,
  tagIds: [],
  coverMedia: null,
};

class MemoryStorage implements Storage {
  readonly data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

test("recovery snapshots isolate new and existing editors and round-trip incomplete fields", () => {
  const storage = new MemoryStorage();
  const snapshot = createEditorRecoverySnapshot({
    target: { kind: "post", id: postId },
    baseVersion: "2026-08-30T11:00:00.000Z",
    fields,
    slugManuallyEdited: true,
    now,
  });

  assert.equal(editorRecoveryKey({ kind: "new" }), `${EDITOR_RECOVERY_PREFIX}new`);
  assert.equal(editorRecoveryKey({ kind: "post", id: postId }), `${EDITOR_RECOVERY_PREFIX}${postId}`);
  assert.deepEqual(writeEditorRecoverySnapshot(storage, snapshot), { ok: true });
  assert.deepEqual(readEditorRecoverySnapshot(storage, { kind: "new" }, now), { kind: "none" });
  assert.deepEqual(readEditorRecoverySnapshot(storage, { kind: "post", id: postId }, now), { kind: "found", snapshot });
});

test("invalid, expired, wrong-target, oversized and unknown-version snapshots never restore", () => {
  const cases: Array<[string, string]> = [
    ["invalid JSON", "{"],
    ["unknown version", JSON.stringify({ format: "blog-x-editor-recovery", version: 2 })],
    ["wrong target", JSON.stringify(createEditorRecoverySnapshot({ target: { kind: "new" }, baseVersion: null, fields, slugManuallyEdited: false, now }))],
    ["expired", JSON.stringify(createEditorRecoverySnapshot({ target: { kind: "post", id: postId }, baseVersion: "2026-08-20T11:00:00.000Z", fields, slugManuallyEdited: false, now: now - 8 * 24 * 60 * 60 * 1_000 }))],
    ["oversized", "x".repeat(256 * 1024 + 1)],
  ];

  for (const [label, value] of cases) {
    const storage = new MemoryStorage();
    storage.setItem(editorRecoveryKey({ kind: "post", id: postId }), value);
    assert.deepEqual(readEditorRecoverySnapshot(storage, { kind: "post", id: postId }, now), { kind: "none" }, label);
    assert.equal(storage.length, 0, label);
  }
});

test("storage denial degrades safely while targeted and bulk removal preserve unrelated state", () => {
  const denied = new Proxy(new MemoryStorage(), {
    get(target, property, receiver) {
      if (["getItem", "setItem", "removeItem", "key"].includes(String(property))) throw new Error("denied");
      return Reflect.get(target, property, receiver);
    },
  });
  const snapshot = createEditorRecoverySnapshot({ target: { kind: "new" }, baseVersion: null, fields, slugManuallyEdited: false, now });
  assert.deepEqual(writeEditorRecoverySnapshot(denied, snapshot), { ok: false });
  assert.deepEqual(readEditorRecoverySnapshot(denied, { kind: "new" }, now), { kind: "unavailable" });
  assert.equal(removeEditorRecoverySnapshot(denied, { kind: "new" }), false);

  const storage = new MemoryStorage();
  storage.setItem("blog-x-theme", "dark");
  storage.setItem(`${EDITOR_RECOVERY_PREFIX}new`, "one");
  storage.setItem(`${EDITOR_RECOVERY_PREFIX}${postId}`, "two");
  assert.equal(removeEditorRecoverySnapshot(storage, { kind: "new" }), true);
  assert.equal(storage.getItem(`${EDITOR_RECOVERY_PREFIX}${postId}`), "two");
  assert.equal(clearEditorRecoverySnapshots(storage), true);
  assert.deepEqual([...storage.data.entries()], [["blog-x-theme", "dark"]]);
});

test("snapshot creation rejects unsafe target, field shape and body size", () => {
  assert.throws(() => editorRecoveryKey({ kind: "post", id: "../other" }), /target/i);
  assert.throws(() => createEditorRecoverySnapshot({
    target: { kind: "post", id: postId },
    baseVersion: null,
    fields,
    slugManuallyEdited: false,
    now,
  }), /fields/i);
  assert.throws(() => createEditorRecoverySnapshot({
    target: { kind: "new" },
    baseVersion: null,
    fields: { ...fields, markdown: "x".repeat(200_001) },
    slugManuallyEdited: false,
    now,
  }), /fields/i);
  assert.throws(() => createEditorRecoverySnapshot({
    target: { kind: "new" },
    baseVersion: null,
    fields: { ...fields, tagIds: ["not-a-uuid"] },
    slugManuallyEdited: false,
    now,
  }), /fields/i);
});

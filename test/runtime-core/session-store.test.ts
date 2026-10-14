import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile, writeFile, symlink, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntimeSessionStore, readRuntimeSessionHistory } from "../../src/provider/runtime/session-store.ts";
import type { RuntimeKind, RuntimeSessionRecord } from "../../src/model/runtime.ts";
const record = (roleId: string, runtime: RuntimeKind, contextSource: RuntimeSessionRecord["contextSource"] = "fresh"): RuntimeSessionRecord => ({ version: 1, id: "ans-id", roleId, runtime, contextSource, nativeSessionId: "native-id", createdAt: "2026-10-14T00:00:00.000Z", updatedAt: "2026-10-14T00:00:00.000Z" });
const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-store-"));

test("store: creation/read stay lazy; roles/runtimes never share index or replay", async () => {
  const root = await temp();
  try {
    const codex = createRuntimeSessionStore({ projectRoot: root, roleId: "role", runtime: "codex" });
    assert.equal(await codex.readLatest(), undefined); assert.deepEqual(await codex.readReplay(), []);
    assert.deepEqual(await readdir(root), []);
    await codex.saveSession(record("role", "codex", "recovered"));
    await codex.appendReplay([{ kind: "user", text: "past input", at: "now" }]);
    const reopened = await readRuntimeSessionHistory({ projectRoot: root, roleId: "role", runtime: "codex" });
    assert.equal(reopened.record?.nativeSessionId, "native-id");
    assert.equal(reopened.record?.contextSource, "recovered");
    assert.equal(reopened.entries[0]?.text, "past input");
    for (const [roleId, runtime] of [["other", "codex"], ["role", "claude"], ["role", "pi"]] as const) {
      const other = createRuntimeSessionStore({ projectRoot: root, roleId, runtime });
      assert.equal(await other.readLatest(), undefined); assert.deepEqual(await other.readReplay(), []);
      assert.equal(other.legacyDirectory !== undefined, runtime === "pi");
    }
    await assert.rejects(codex.saveSession(record("role", "claude")), /不匹配/);
    assert.equal(JSON.parse(await readFile(path.join(codex.directory, "ans", "index.json"), "utf8")).runtime, "codex");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("store: concurrent writes serialize; corrupt history fails honestly", async () => {
  const root = await temp();
  try {
    const store = createRuntimeSessionStore({ projectRoot: root, roleId: "role", runtime: "claude" });
    await Promise.all(Array.from({ length: 25 }, (_, index) => store.appendReplay([{ at: "now", kind: "user", text: String(index) }])));
    assert.equal((await store.readReplay()).length, 25);
    await writeFile(path.join(store.directory, "ans", "replay.jsonl"), "{broken}\n");
    await assert.rejects(store.readReplay(), /第 1 行/);
    await store.appendReplay([{ at: "now", kind: "user", text: "append does not parse all previous records" }]);
    await assert.rejects(store.readReplay(), /第 1 行/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("store: traversal, mismatched scope and symlinked runtime directories rejected", async () => {
  const root = await temp(); const outside = await temp();
  try {
    assert.throws(() => createRuntimeSessionStore({ projectRoot: root, roleId: "../other", runtime: "codex" }), /roleId/);
    const parent = path.join(root, ".ans", "sessions", "role"); await mkdir(parent, { recursive: true });
    await symlink(outside, path.join(parent, "codex"), "dir");
    const store = createRuntimeSessionStore({ projectRoot: root, roleId: "role", runtime: "codex" });
    await assert.rejects(store.saveSession(record("role", "codex")), /不是普通目录/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("store: native validation stays lazy and native symlink is rejected before effects", async () => {
  const root = await temp(); const outside = await temp();
  try {
    const store = createRuntimeSessionStore({ projectRoot: root, roleId: "core", runtime: "codex" });
    await store.validateNativeDirectory?.(); assert.deepEqual(await readdir(root), []);
    await mkdir(store.directory, { recursive: true }); await symlink(outside, store.nativeDirectory, "dir");
    await assert.rejects(store.prepareNativeDirectory!(), /不是普通目录/);
    await assert.rejects(store.readLatest(), /不是普通目录/);
    assert.deepEqual(await readdir(outside), []);
    await rm(store.nativeDirectory); await store.prepareNativeDirectory?.();
    assert.deepEqual(await readdir(store.nativeDirectory), []);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

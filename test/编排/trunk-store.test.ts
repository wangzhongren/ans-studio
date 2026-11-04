// test/编排/trunk-store.test.ts
// S1 Provider 测试：trunk manifest/amendment/apply-journal 原子读写、坏件容错、
// 并发串行、history 归档/列表（P1 §2.1/§3.1/§4.5；AC-12 存储层证据）。
//
// 只测存储语义（不判定状态/冻结/指针）；全部文件落在 mkdtemp 临时项目根。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  TRUNK_AMENDMENT_SCHEMA,
  TRUNK_APPLY_JOURNAL_SCHEMA,
  TRUNK_MANIFEST_SCHEMA,
  type TrunkAmendmentState,
  type TrunkApplyJournal,
  type TrunkManifest,
} from "../../src/model/trunk.ts";
import {
  createFsTrunkStore,
  TRUNK_AMENDMENT_REL,
  TRUNK_HISTORY_DIR,
  TRUNK_JOURNAL_REL,
  TRUNK_MANIFEST_REL,
} from "../../src/provider/trunk/public/trunk-store.ts";

const AT = "2026-11-04T10:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

async function makeRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-trunk-store-"));
}

function manifest(version: number, overrides: Partial<TrunkManifest> = {}): TrunkManifest {
  return {
    schema: TRUNK_MANIFEST_SCHEMA,
    trunkVersion: version,
    source: "bootstrap",
    previous: version > 1 ? { trunkVersion: version - 1, runId: "run-1" } : null,
    flowId: "demo",
    runId: "run-1",
    artifacts: {
      documents: {
        proposal: { path: "docs/proposals/demo-proposal-v1.md", sha256: SHA_A, version: 1 },
      },
      execution: { teamPlan: null, flow: null },
      workflow: { kind: "workflow", path: "docs/workflow.md", sha256: SHA_B },
      roleCards: {},
      boundaries: {},
    },
    digest: `digest-${version}`,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function amendment(overrides: Partial<TrunkAmendmentState> = {}): TrunkAmendmentState {
  return {
    v: 1,
    schema: TRUNK_AMENDMENT_SCHEMA,
    amendmentId: "am-1",
    flowId: "demo",
    docPath: "docs/proposals/demo-amendment-v1.md",
    docSha256: "c".repeat(64),
    docVersion: 1,
    baseTrunk: { trunkVersion: 1, runId: "run-1", digest: "digest-1" },
    status: "submitted",
    applyState: "idle",
    items: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function journal(overrides: Partial<TrunkApplyJournal> = {}): TrunkApplyJournal {
  return {
    v: 1,
    schema: TRUNK_APPLY_JOURNAL_SCHEMA,
    journalId: "j-1",
    flowId: "demo",
    phase: "prepared",
    target: {
      trunkVersion: 2,
      runId: "run-1",
      documents: {},
      execution: { teamPlan: null, flow: null },
    },
    before: {
      trunkVersion: 1,
      runId: "run-1",
      documents: {},
      execution: { teamPlan: null, flow: null },
    },
    startedAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

test("manifest：原子写/读回、未知字段保留、无临时文件残留", async () => {
  const root = await makeRoot();
  const store = createFsTrunkStore(root);

  const written = await store.writeManifest({ ...manifest(3), extraNote: "keep-me" } as TrunkManifest & {
    extraNote: string;
  });
  assert.deepEqual(written, { ok: true });

  const read = await store.readManifest();
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.equal(read.value.trunkVersion, 3);
    assert.equal(read.value.source, "bootstrap");
    assert.equal((read.value as TrunkManifest & { extraNote?: string }).extraNote, "keep-me");
  }

  const dir = await fs.readdir(path.join(root, ".ans/trunk"));
  assert.deepEqual(dir.filter((name) => name.includes(".tmp")), []);
  const text = await fs.readFile(path.join(root, TRUNK_MANIFEST_REL), "utf8");
  assert.doesNotThrow(() => JSON.parse(text));
});

test("缺失/坏件判别：missing/corrupt、不自动重建/不覆盖", async () => {
  const root = await makeRoot();
  const store = createFsTrunkStore(root);

  const missing = await store.readManifest();
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "missing");

  await fs.mkdir(path.join(root, ".ans/trunk"), { recursive: true });
  await fs.writeFile(path.join(root, TRUNK_AMENDMENT_REL), "{ not-json", "utf8");
  const before = await fs.readFile(path.join(root, TRUNK_AMENDMENT_REL), "utf8");
  const corrupt = await store.readAmendment();
  assert.equal(corrupt.ok, false);
  if (!corrupt.ok) {
    assert.equal(corrupt.reason, "corrupt");
    assert.equal(corrupt.message, "invalid-json");
  }
  assert.equal(await fs.readFile(path.join(root, TRUNK_AMENDMENT_REL), "utf8"), before);

  // 结构不合法（缺 schema/字段）同样判 corrupt
  await fs.writeFile(path.join(root, TRUNK_JOURNAL_REL), JSON.stringify({ v: 1, schema: "other/v1" }), "utf8");
  const badJournal = await store.readJournal();
  assert.equal(badJournal.ok, false);
  if (!badJournal.ok) assert.equal(badJournal.reason, "corrupt");

  // 非法写不落盘
  const invalid = await store.writeManifest({ ...manifest(1), trunkVersion: 0 });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.code, "invalid");
});

test("并发写串行：25 路并发写最终一致且文件完整可解析", async () => {
  const root = await makeRoot();
  const store = createFsTrunkStore(root);

  const results = await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      store.writeManifest(manifest(index + 1, { updatedAt: `2026-11-04T10:00:${String(index).padStart(2, "0")}.000Z` })),
    ),
  );
  assert.ok(results.every((result) => result.ok));

  const read = await store.readManifest();
  assert.equal(read.ok, true);
  if (read.ok) assert.equal(read.value.trunkVersion, 25);

  // 并发读同样得到完整 JSON（无半写）
  const reads = await Promise.all(Array.from({ length: 10 }, () => store.readManifest()));
  assert.ok(reads.every((entry) => entry.ok));
  const text = await fs.readFile(path.join(root, TRUNK_MANIFEST_REL), "utf8");
  assert.doesNotThrow(() => JSON.parse(text));
});

test("amendment/journal：读写回、旧状态读兼容、legacy 状态写拒绝", async () => {
  const root = await makeRoot();
  const store = createFsTrunkStore(root);

  assert.deepEqual(await store.writeAmendment(amendment()), { ok: true });
  const readAmendment = await store.readAmendment();
  assert.equal(readAmendment.ok, true);
  if (readAmendment.ok) assert.equal(readAmendment.value.status, "submitted");

  // P1.3 旧状态（proposed/confirmed/cancelled）读侧兼容（旧账本/旧文件）
  const legacy = amendment({ status: "proposed" as TrunkAmendmentState["status"] });
  await fs.writeFile(path.join(root, TRUNK_AMENDMENT_REL), JSON.stringify(legacy), "utf8");
  const readLegacy = await store.readAmendment();
  assert.equal(readLegacy.ok, true);
  if (readLegacy.ok) assert.equal(readLegacy.value.status, "proposed");

  // 新代码不得写旧状态（Model 纪律）
  const legacyWrite = await store.writeAmendment(legacy);
  assert.equal(legacyWrite.ok, false);
  if (!legacyWrite.ok) assert.equal(legacyWrite.code, "invalid");

  assert.deepEqual(await store.writeJournal(journal()), { ok: true });
  assert.deepEqual(await store.writeJournal(journal({ phase: "committed" })), { ok: true });
  const readJournal = await store.readJournal();
  assert.equal(readJournal.ok, true);
  if (readJournal.ok) assert.equal(readJournal.value.phase, "committed");
});

test("history：归档/列表/同版本幂等/不同内容拒绝/坏件跳过并诊断", async () => {
  const root = await makeRoot();
  const store = createFsTrunkStore(root);

  assert.deepEqual(await store.listHistory(), []);

  assert.deepEqual(await store.archiveHistory(1, manifest(1)), { ok: true });
  assert.deepEqual(await store.archiveHistory(2, manifest(2)), { ok: true });
  assert.deepEqual(await store.listHistory(), [1, 2]);

  // 同版本同内容幂等；不同内容拒绝（归档不可变）
  assert.deepEqual(await store.archiveHistory(1, manifest(1)), { ok: true });
  const conflict = await store.archiveHistory(1, manifest(1, { digest: "tampered" }));
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, "invalid");

  // 版本不一致拒绝
  const mismatch = await store.archiveHistory(2, manifest(3));
  assert.equal(mismatch.ok, false);

  // 坏件跳过并诊断
  await fs.mkdir(path.join(root, TRUNK_HISTORY_DIR), { recursive: true });
  await fs.writeFile(path.join(root, TRUNK_HISTORY_DIR, "manifest-v9.json"), "{broken", "utf8");
  await fs.writeFile(path.join(root, TRUNK_HISTORY_DIR, "random.txt"), "x", "utf8");
  const diagnostics: string[] = [];
  const versions = await store.listHistory({ onDiagnostic: (message) => diagnostics.push(message) });
  assert.deepEqual(versions, [1, 2]);
  assert.ok(diagnostics.some((message) => message.includes("manifest-v9")));
});

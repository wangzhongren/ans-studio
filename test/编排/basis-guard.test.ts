// test/编排/basis-guard.test.ts
// T3「两条固定工作流路径」B0：B1 AC-19/T-08——basis 文档发现/有界读取/SHA-256/bytes/drift 骨架。
// 覆盖：最新版本发现、缺失、预算（32/4 MiB/8 MiB 命名 basis-document-budget）、哈希与 bytes、
// basis.recorded 构造/校验、Q4 path-b 只读标记。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  BASIS_BUDGET_CODE,
  BASIS_DOCUMENT_MISSING_CODE,
  BASIS_DOCUMENT_UNREADABLE_CODE,
  BASIS_DRIFT_CODE,
  BASIS_MAX_FILES,
  BASIS_MAX_FILE_BYTES,
  BASIS_MAX_TOTAL_BYTES,
  basisIdFor,
  buildBasisRecordedEvent,
  discoverBasisDocuments,
  isBasisReadOnlySnapshot,
  isBasisRecordedEvent,
  readBasisDocuments,
  recordBasisDocuments,
  sha256OfBasisBytes,
  verifyBasisDocuments,
} from "../../src/common/编排/basis-guard.ts";

const WF = "wf-0123456789abcdef01234567";
const FLOW = "snake";
const D = "a".repeat(64);
const AT = "2026-11-10T10:00:00.000Z";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-basis-guard-"));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function writeDoc(root: string, rel: string, content: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");
}

async function writeBasisSet(root: string): Promise<void> {
  await writeDoc(root, "docs/product/snake-intent-v1.md", "intent v1");
  await writeDoc(root, "docs/product/snake-intent-v2.md", "intent v2");
  await writeDoc(root, "docs/proposals/snake-proposal-v1.md", "proposal");
  await writeDoc(root, "docs/proposals/snake-modules-v1.md", "modules");
  await writeDoc(root, "docs/proposals/snake-roster-v1.md", "roster");
  await writeDoc(root, "docs/contracts/snake-architecture-v1.md", "architecture");
  await writeDoc(root, "docs/contracts/snake-assets-v1.md", "assets");
  await writeDoc(root, "docs/scheduling/snake-team-v1.md", "team plan");
}

test("文档发现：按 flowId 取最新版本；缺失必需项如实列出；团队计划单独字段", async () => {
  const root = await tempRoot();
  try {
    await writeBasisSet(root);
    const discovery = await discoverBasisDocuments(root, FLOW);
    assert.deepEqual(discovery.missing, []);
    const intent = discovery.documents.find((doc) => doc.kind === "intent");
    assert.equal(intent?.path, "docs/product/snake-intent-v2.md");
    assert.equal(intent?.version, 2);
    assert.equal(discovery.documents.length, 6);
    assert.equal(discovery.teamPlan?.path, "docs/scheduling/snake-team-v1.md");
    assert.equal(discovery.teamPlan?.version, 1);

    const empty = await tempRoot();
    try {
      const missing = await discoverBasisDocuments(empty, FLOW);
      assert.deepEqual(missing.documents, []);
      assert.deepEqual([...missing.missing].sort(), ["architecture", "intent", "modules", "proposal", "roster"]);
      assert.equal(missing.teamPlan, undefined);
    } finally {
      await cleanup(empty);
    }
  } finally {
    await cleanup(root);
  }
});

test("recordBasisDocuments：必需缺失 ⇒ basis-document-missing；齐全时 SHA-256/bytes 与磁盘字节一致", async () => {
  const root = await tempRoot();
  try {
    await writeDoc(root, "docs/product/snake-intent-v1.md", "only intent");
    const missing = await recordBasisDocuments(root, FLOW);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, BASIS_DOCUMENT_MISSING_CODE);
      assert.match(missing.message, /proposal|roster/);
    }
    await writeBasisSet(root);
    const recorded = await recordBasisDocuments(root, FLOW);
    assert.equal(recorded.ok, true);
    if (recorded.ok) {
      assert.equal(recorded.documents.length, 6);
      const intent = recorded.documents.find((doc) => doc.kind === "intent");
      const bytes = Buffer.from("intent v2", "utf8");
      assert.equal(intent?.sha256, createHash("sha256").update(bytes).digest("hex"));
      assert.equal(intent?.bytes, bytes.byteLength);
      assert.equal(recorded.teamPlan?.path, "docs/scheduling/snake-team-v1.md");
      assert.equal(recorded.teamPlan?.sha256, createHash("sha256").update(Buffer.from("team plan", "utf8")).digest("hex"));
    }
  } finally {
    await cleanup(root);
  }
});

test("预算：命名 basis-document-budget（32 文件 / 单文件 4 MiB / 总 8 MiB；含注入阈值路径）", async () => {
  assert.equal(BASIS_MAX_FILES, 32);
  assert.equal(BASIS_MAX_FILE_BYTES, 4 * 1024 * 1024);
  assert.equal(BASIS_MAX_TOTAL_BYTES, 8 * 1024 * 1024);
  const root = await tempRoot();
  try {
    await writeDoc(root, "a.md", "0123456789");
    await writeDoc(root, "b.md", "0123456789");
    const ref = (p: string) => ({ kind: "custom", path: p, version: 1 });
    const tooMany = await readBasisDocuments(root, [ref("a.md"), ref("b.md")], { maxFiles: 1 });
    assert.equal(tooMany.ok, false);
    if (!tooMany.ok) assert.equal(tooMany.code, BASIS_BUDGET_CODE);
    const tooBig = await readBasisDocuments(root, [ref("a.md")], { maxFileBytes: 5 });
    assert.equal(tooBig.ok, false);
    if (!tooBig.ok) {
      assert.equal(tooBig.code, BASIS_BUDGET_CODE);
      assert.match(tooBig.message, /单文件/);
    }
    const tooMuch = await readBasisDocuments(root, [ref("a.md"), ref("b.md")], { maxTotalBytes: 15 });
    assert.equal(tooMuch.ok, false);
    if (!tooMuch.ok) {
      assert.equal(tooMuch.code, BASIS_BUDGET_CODE);
      assert.match(tooMuch.message, /累计/);
    }
    // 默认阈值路径同样生效：超大单文件（4 MiB + 1）。
    await writeDoc(root, "huge.md", "x");
    await fs.appendFile(path.join(root, "huge.md"), Buffer.alloc(BASIS_MAX_FILE_BYTES, 0x78));
    const huge = await readBasisDocuments(root, [ref("huge.md")]);
    assert.equal(huge.ok, false);
    if (!huge.ok) assert.equal(huge.code, BASIS_BUDGET_CODE);
    // 缺失/路径穿越分别报缺失/不可读。
    const absent = await readBasisDocuments(root, [ref("missing.md")]);
    assert.equal(absent.ok, false);
    if (!absent.ok) assert.equal(absent.code, BASIS_DOCUMENT_MISSING_CODE);
    const escape = await readBasisDocuments(root, [ref("../outside.md")]);
    assert.equal(escape.ok, false);
    if (!escape.ok) assert.equal(escape.code, BASIS_DOCUMENT_UNREADABLE_CODE);
  } finally {
    await cleanup(root);
  }
});

test("drift 校验骨架：内容变更/删除 ⇒ basis-drift 且 actualSha256 如实（删除为 null）", async () => {
  const root = await tempRoot();
  try {
    await writeBasisSet(root);
    const recorded = await recordBasisDocuments(root, FLOW);
    assert.equal(recorded.ok, true);
    if (!recorded.ok) return;
    const clean = await verifyBasisDocuments(root, recorded.documents);
    assert.equal(clean.ok, true);
    assert.deepEqual(clean.drift, []);
    // 内容变更 ⇒ 漂移。
    await writeDoc(root, "docs/product/snake-intent-v2.md", "intent v2 (changed)");
    const drifted = await verifyBasisDocuments(root, recorded.documents);
    assert.equal(drifted.ok, false);
    assert.equal(drifted.code, BASIS_DRIFT_CODE);
    const intentDrift = drifted.drift.find((entry) => entry.path === "docs/product/snake-intent-v2.md");
    assert.equal(intentDrift?.expectedSha256, createHash("sha256").update(Buffer.from("intent v2", "utf8")).digest("hex"));
    assert.equal(intentDrift?.actualSha256, createHash("sha256").update(Buffer.from("intent v2 (changed)", "utf8")).digest("hex"));
    // 删除 ⇒ actualSha256:null（不猜内容）。
    await fs.rm(path.join(root, "docs/product/snake-intent-v2.md"));
    const deleted = await verifyBasisDocuments(root, recorded.documents);
    assert.equal(deleted.ok, false);
    assert.equal(deleted.drift.find((entry) => entry.path === "docs/product/snake-intent-v2.md")?.actualSha256, null);
  } finally {
    await cleanup(root);
  }
});

test("basis.recorded 构造/校验：确定性 basisId；application 记账；path-b 只读标记不产生写权", () => {
  const documents = [{ kind: "intent", path: "docs/product/snake-intent-v1.md", version: 1, sha256: D, bytes: 10 }];
  const event = buildBasisRecordedEvent({
    workflowId: WF, flowId: FLOW, documents, teamPlan: null, operationId: "op-1",
    idempotencyKey: `baseline:${WF}:${D}`, reason: "baseline", now: () => new Date(AT),
  });
  assert.equal(isBasisRecordedEvent(event), true);
  assert.equal(event.recordedBy, "application");
  assert.equal(event.at, AT);
  assert.equal(event.basisId, basisIdFor(`baseline:${WF}:${D}`));
  assert.match(event.basisId, /^bas-[0-9a-f]{24}$/);
  // 确定性：同幂等键 ⇒ 同 basisId；不同键 ⇒ 不同。
  assert.equal(basisIdFor("k-1"), basisIdFor("k-1"));
  assert.notEqual(basisIdFor("k-1"), basisIdFor("k-2"));
  assert.equal(isBasisReadOnlySnapshot(event), false);

  const pathB = buildBasisRecordedEvent({
    workflowId: WF, flowId: FLOW, documents: [], teamPlan: null, operationId: "op-2",
    idempotencyKey: `path-b:${WF}:${D}`, reason: "path-b", now: () => new Date(AT),
  });
  assert.equal(isBasisRecordedEvent(pathB), true);
  assert.equal(isBasisReadOnlySnapshot(pathB), true, "Q4：path-b 是只读文档快照标记（不产生写权）");

  // 坏形状不通过（缺 documents / 坏 reason / 非本 kind）。
  assert.equal(isBasisRecordedEvent({ ...event, documents: undefined }), false);
  assert.equal(isBasisRecordedEvent({ ...event, reason: "bogus" }), false);
  assert.equal(isBasisRecordedEvent({ ...event, kind: "basis.amended" }), false);
  assert.equal(isBasisRecordedEvent(null), false);
  // sha256 辅助与实际字节一致。
  assert.equal(sha256OfBasisBytes(Buffer.from("abc", "utf8")), createHash("sha256").update("abc").digest("hex"));
});

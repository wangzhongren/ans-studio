// test/编排/evidence-check.test.ts
// 2026-10-30（方案 v3 §3.4 / Delta-W1-3）：ans-criteria/v1 解析、显式 ref、sidecar 重算、
// AC-28 自述 mismatch、P0/P1 规则、stale、collection、legacy。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  checkEvidence,
  checkEvidenceCollection,
  loadCriteria,
  normalizeAcId,
  normalizePriority,
  parseCriteriaText,
  readArtifact,
} from "../../src/common/编排/evidence-check.ts";

const CRITERIA_TEXT = [
  "# 验收标准",
  "",
  "```ans-criteria",
  "schema: ans-criteria/v1",
  "flowId: focus",
  "version: 3",
  "status: final",
  "criteria:",
  "  - id: P4.1",
  "    priority: P0",
  "  - id: P4.3",
  "    priority: P1",
  "  - id: AC-28",
  "    priority: P0",
  "```",
  "",
  "散文不影响。",
].join("\r\n");

function parsed() {
  const result = parseCriteriaText(CRITERIA_TEXT, { flowId: "focus", fileName: "focus-criteria-v3.md" });
  assert.equal(result.ok, true, result.ok ? "" : result.rejection.missing.join("；"));
  if (!result.ok) throw new Error("criteria fixture invalid");
  return result.doc;
}

test("ans-criteria/v1 正例：唯一 block、优先级派生、CRLF 归一化", () => {
  const doc = parsed();
  assert.deepEqual(doc.criteria.map((item) => [item.id, item.priority]), [["P4.1", "P0"], ["P4.3", "P1"], ["AC-28", "P0"]]);
  assert.equal(doc.status, "final");
  assert.equal(doc.version, 3);
});

test("AC 归一化：NFKC/全半角/空白/前导零；非法形态拒绝", () => {
  for (const [raw, expected] of [["ac-28", "AC-28"], ["ＡＣ－２８", "AC-28"], ["P 4 . 1", "P4.1"], ["P04.01", "P4.1"], ["AC-028", "AC-28"], ["P12.10", "P12.10"]]) {
    assert.equal(normalizeAcId(raw), expected, raw);
  }
  for (const raw of ["AC28", "P4", "P4-1", "AC-28/P0", "P0.1", "P0.0", "P00.01", "P4.000"]) assert.equal(normalizeAcId(raw), undefined, raw);
  assert.equal(normalizePriority("Ｐ０"), "P0");
  assert.equal(normalizePriority("P4"), undefined);
});

test("criteria 负例：重复 canonical id、非法 priority、无/多 block、draft、版本不符", () => {
  const duplicate = parseCriteriaText(CRITERIA_TEXT.replace("id: P4.3", "id: ac-028"));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "criteria-duplicate-ac");
  const badPriority = parseCriteriaText(CRITERIA_TEXT.replace("    priority: P1", "    priority: P4"));
  assert.equal(badPriority.ok, false);
  if (!badPriority.ok) assert.equal(badPriority.code, "criteria-priority-invalid");
  const missing = parseCriteriaText("# no block\n");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "criteria-format-missing");
  const ambiguous = parseCriteriaText("```ans-criteria\nschema: ans-criteria/v1\n```\n```ans-criteria\nschema: ans-criteria/v1\n```");
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.equal(ambiguous.code, "criteria-format-ambiguous");
  const zeroMajor = parseCriteriaText(CRITERIA_TEXT.replace("id: P4.1", "id: P0.1"));
  assert.equal(zeroMajor.ok, false);
  if (!zeroMajor.ok) assert.equal(zeroMajor.code, "criteria-id-invalid");
  const zeroMinor = parseCriteriaText(CRITERIA_TEXT.replace("id: P4.3", "id: P4.0"));
  assert.equal(zeroMinor.ok, false);
  if (!zeroMinor.ok) assert.equal(zeroMinor.code, "criteria-id-invalid");
  const badTitle = parseCriteriaText(CRITERIA_TEXT.replace("    priority: P1", "    priority: P1\n    title: 123"));
  assert.equal(badTitle.ok, false);
  if (!badTitle.ok) assert.equal(badTitle.code, "criteria-schema-invalid");
  const draft = parseCriteriaText(CRITERIA_TEXT.replace("status: final", "status: draft"));
  assert.equal(draft.ok, true);
  const mismatch = parseCriteriaText(CRITERIA_TEXT, { flowId: "focus", fileName: "focus-criteria-v4.md" });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "criteria-version-mismatch");
});

test("criteria ref：显式 path+sha+version 才加载；无 ref 不取 latest；draft ref 拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-criteria-"));
  try {
    const rel = "docs/acceptance/focus-criteria-v3.md";
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), CRITERIA_TEXT, "utf8");
    const sha = createHash("sha256").update(await fs.readFile(path.join(root, rel))).digest("hex");
    const noRef = await loadCriteria(root, "focus", undefined);
    assert.equal(noRef.ok, false);
    if (!noRef.ok) assert.equal(noRef.code, "criteria-version-unresolved");
    const ref = { path: rel, sha256: sha, version: 3 };
    const loaded = await loadCriteria(root, "focus", ref);
    assert.equal(loaded.ok, true, loaded.ok ? "" : loaded.rejection.missing.join("；"));
    const badSha = await loadCriteria(root, "focus", { ...ref, sha256: "0".repeat(64) });
    assert.equal(badSha.ok, false);
    if (!badSha.ok) assert.equal(badSha.code, "criteria-ref-mismatch");
    await fs.writeFile(path.join(root, rel), CRITERIA_TEXT.replace("status: final", "status: draft"), "utf8");
    const draftSha = createHash("sha256").update(await fs.readFile(path.join(root, rel))).digest("hex");
    const draft = await loadCriteria(root, "focus", { ...ref, sha256: draftSha });
    assert.equal(draft.ok, false);
    if (!draft.ok) assert.equal(draft.code, "criteria-status-draft");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

async function artifactFixture(root: string, text: string, priorityMetrics = true): Promise<{ artifact: string; metaPath: string; actual: Awaited<ReturnType<typeof readArtifact>> }> {
  const artifact = "tests/evidence/unit.txt";
  await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
  await fs.writeFile(path.join(root, artifact), text, "utf8");
  const actual = await readArtifact(root, artifact);
  const metaPath = `${artifact}.meta.json`;
  const meta = {
    schema: "evidence-meta/v1",
    artifact,
    sha256: actual.sha256,
    bytes: actual.bytes,
    lines: actual.lines,
    generatedAt: new Date(Date.now() + 2000).toISOString(),
    ...(priorityMetrics ? { metrics: { tests: 2, pass: 2, fail: 0 } } : {}),
    acIds: ["AC-28"],
    p0: true,
    owner: "test-dev",
  };
  await fs.writeFile(path.join(root, metaPath), JSON.stringify(meta), "utf8");
  return { artifact, metaPath, actual };
}

test("P0 sidecar：实际 lines/bytes/sha256 与 sidecar 一致才通过；p0 自报忽略并标记", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-evidence-"));
  try {
    const criteria = parsed();
    const good = await artifactFixture(root, "共 3 行\npass: 2\nfail: 0\n");
    const result = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria, artifact: good.artifact });
    assert.equal(result.ok, true, result.rejection?.missing.join("；") ?? "");
    assert.equal(result.valid, true);
    assert.equal(result.priority, "P0");
    assert.equal(result.p0Ignored, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("AC-28：artifact 自述 223/实际 234、历史 pass 198/最终 214 ⇒ evidence-mismatch；修正后通过", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-evidence-ac28-"));
  try {
    const criteria = parsed();
    const body = Array.from({ length: 234 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    const artifact = "tests/evidence/acceptance.txt";
    await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
    await fs.writeFile(path.join(root, artifact), `下列 223 行\npass: 198\nfail: 0\n${body}`, "utf8");
    const actual = await readArtifact(root, artifact);
    const metaPath = `${artifact}.meta.json`;
    const meta = {
      schema: "evidence-meta/v1", artifact, sha256: actual.sha256, bytes: actual.bytes, lines: actual.lines,
      generatedAt: new Date(Date.now() + 2000).toISOString(), metrics: { pass: 214, fail: 0 }, acIds: ["AC-28"], p0: false,
    };
    await fs.writeFile(path.join(root, metaPath), JSON.stringify(meta), "utf8");
    const bad = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria, artifact });
    assert.equal(bad.ok, false);
    assert.equal(bad.rejection?.code, "evidence-mismatch");
    assert.ok(bad.mismatch.some((line) => /自述行数 223/.test(line)));
    assert.ok(bad.mismatch.some((line) => /自述 pass 198/.test(line)));
    // 修正 artifact 自述为实际值并同步 sidecar（仅测试生成新证据；不自动改原文件）。
    await fs.writeFile(path.join(root, artifact), `下列 237 行\npass: 214\nfail: 0\n${body}`, "utf8");
    const fixedActual = await readArtifact(root, artifact);
    await fs.writeFile(path.join(root, metaPath), JSON.stringify({ ...meta, sha256: fixedActual.sha256, bytes: fixedActual.bytes, lines: fixedActual.lines, generatedAt: new Date(Date.now() + 2000).toISOString() }), "utf8");
    const fixed = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria, artifact });
    assert.equal(fixed.ok, true, fixed.rejection?.missing.join("；") ?? "");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P0 缺 sidecar fail；P1 缺 sidecar 标未校验；stale/acIds 缺失 mismatch", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-evidence-rules-"));
  try {
    const criteria = parsed();
    const artifact = "tests/evidence/none.txt";
    await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
    await fs.writeFile(path.join(root, artifact), "共 1 行\npass: 1\nfail: 0\n", "utf8");
    const p0 = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria, artifact });
    assert.equal(p0.ok, false);
    assert.equal(p0.rejection?.code, "evidence-mismatch");
    const p1 = await checkEvidence({ projectRoot: root, acId: "P4.3", criteria, artifact });
    assert.equal(p1.ok, true);
    assert.equal(p1.unverified, true);
    const fixture = await artifactFixture(root, "共 1 行\npass: 1\nfail: 0\n");
    const stale = await fs.readFile(path.join(root, fixture.metaPath), "utf8");
    await fs.writeFile(path.join(root, fixture.metaPath), JSON.stringify({ ...JSON.parse(stale), generatedAt: "2000-01-01T00:00:00Z", acIds: [] }), "utf8");
    const bad = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria, artifact: fixture.artifact });
    assert.equal(bad.ok, false);
    assert.ok(bad.mismatch.some((line) => /stale/.test(line)));
    assert.ok(bad.mismatch.some((line) => /acIds 不含 AC-28/.test(line)));
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("collection：多文件 sidecar 逐文件 hash/bytes/lines 校验", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-evidence-collection-"));
  try {
    const criteria = parsed();
    const files = ["tests/evidence/a.txt", "tests/evidence/b.txt"];
    const items = [];
    for (const file of files) {
      await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await fs.writeFile(path.join(root, file), `共 1 行 ${file}\n`, "utf8");
      const actual = await readArtifact(root, file);
      items.push({ artifact: file, sha256: actual.sha256, bytes: actual.bytes, lines: actual.lines, acIds: ["AC-28"] });
    }
    const metaPath = "tests/evidence/collection.meta.json";
    await fs.writeFile(path.join(root, metaPath), JSON.stringify({ schema: "evidence-meta/v1", collection: items, acIds: ["AC-28"], generatedAt: new Date().toISOString() }), "utf8");
    const result = await checkEvidenceCollection({ projectRoot: root, acId: "AC-28", criteria, metaPath });
    assert.equal(result.ok, true, result.rejection?.missing.join("；") ?? "");
    assert.equal(result.valid, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P4.3/F3/F4：collection generatedAt/mtime stale、item 自述、路径越界、角色范围拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-evidence-collection-rules-"));
  try {
    const criteria = parsed();
    const artifact = "tests/evidence/c.txt";
    await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
    const writeMeta = async (overrides: { generatedAt?: string; itemArtifact?: string; lines?: number } = {}): Promise<void> => {
      const actual = await readArtifact(root, artifact);
      const itemArtifact = overrides.itemArtifact ?? artifact;
      await fs.writeFile(path.join(root, "tests/evidence/collection-rules.meta.json"), JSON.stringify({
        schema: "evidence-meta/v1",
        collection: [{ artifact: itemArtifact, sha256: actual.sha256, bytes: actual.bytes, lines: overrides.lines ?? actual.lines, metrics: { pass: 2, fail: 0 }, acIds: ["AC-28"] }],
        acIds: ["AC-28"],
        generatedAt: overrides.generatedAt ?? new Date(Date.now() + 2000).toISOString(),
      }), "utf8");
    };
    const metaPath = "tests/evidence/collection-rules.meta.json";
    await fs.writeFile(path.join(root, artifact), "共 3 行\npass: 2\nfail: 0\n", "utf8");
    await writeMeta();
    const good = await checkEvidenceCollection({ projectRoot: root, acId: "AC-28", criteria, metaPath });
    assert.equal(good.ok, true, good.rejection?.missing.join("；") ?? "");
    // 自述行数与实际不一致 ⇒ evidence-mismatch。
    await fs.writeFile(path.join(root, artifact), "共 4 行\npass: 2\nfail: 0\n", "utf8");
    await writeMeta();
    const claims = await checkEvidenceCollection({ projectRoot: root, acId: "AC-28", criteria, metaPath });
    assert.equal(claims.ok, false);
    assert.ok(claims.mismatch.some((line) => /自述行数 4/.test(line)), claims.mismatch.join("；"));
    // artifact 修改晚于 collection generatedAt ⇒ stale。
    await fs.writeFile(path.join(root, artifact), "共 3 行\npass: 2\nfail: 0\n", "utf8");
    await writeMeta({ generatedAt: "2000-01-01T00:00:00Z" });
    const stale = await checkEvidenceCollection({ projectRoot: root, acId: "AC-28", criteria, metaPath });
    assert.equal(stale.ok, false);
    assert.ok(stale.mismatch.some((line) => /stale/.test(line)), stale.mismatch.join("；"));
    // metaPath / collection item 路径越界 ⇒ 结构化 evidence-path-invalid。
    await writeMeta();
    const traversalMeta = await checkEvidenceCollection({ projectRoot: root, acId: "AC-28", criteria, metaPath: "../outside.meta.json" });
    assert.equal(traversalMeta.ok, false);
    assert.equal(traversalMeta.rejection?.code, "evidence-path-invalid");
    await writeMeta({ itemArtifact: "../outside.txt" });
    const traversalItem = await checkEvidenceCollection({ projectRoot: root, acId: "AC-28", criteria, metaPath });
    assert.equal(traversalItem.ok, false);
    assert.equal(traversalItem.rejection?.code, "evidence-path-invalid");
    // 角色范围（scopeRoots）外的 collection ⇒ evidence-scope-denied。
    await writeMeta();
    const denied = await checkEvidenceCollection({ projectRoot: root, acId: "AC-28", criteria, metaPath, scopeRoots: ["other-role/"] });
    assert.equal(denied.ok, false);
    assert.equal(denied.rejection?.code, "evidence-scope-denied");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("F3：单文件 metaPath 越界/绝对/.ans/.env 一律 evidence-path-invalid", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-evidence-path-"));
  try {
    const criteria = parsed();
    const artifact = "tests/evidence/path.txt";
    await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
    await fs.writeFile(path.join(root, artifact), "共 1 行\n", "utf8");
    for (const metaPath of ["../outside.meta.json", "C:/outside.meta.json", ".ans/state.json", ".env", "tests/evidence/.env.local"]) {
      const result = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria, artifact, metaPath });
      assert.equal(result.ok, false, metaPath);
      assert.equal(result.rejection?.code, "evidence-path-invalid", metaPath);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

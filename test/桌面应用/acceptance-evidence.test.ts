// test/桌面应用/acceptance-evidence.test.ts
// 2026-10-30（3.4/P4.1/P4.5）：验收事实 priority 由 criteria 派生；P0 缺 sidecar/mismatch 不通过；
// sidecar/角色 p0 自报不改变档位；P1 未校验明确标记。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { checkEvidence, deriveAcceptanceFact, loadCriteria, parseCriteriaText, readArtifact } from "../../src/common/编排/evidence-check.ts";

const CRITERIA = [
  "```ans-criteria",
  "schema: ans-criteria/v1",
  "flowId: focus",
  "version: 1",
  "status: final",
  "criteria:",
  "  - id: AC-28",
  "    priority: P0",
  "  - id: P4.3",
  "    priority: P1",
  "```",
].join("\n");

test("P4.1/P4.5：AcceptanceFact.priority 来自 criteria；sidecar p0:false 不降级；P0 缺 sidecar 不通过", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-acceptance-evidence-"));
  try {
    const parsed = parseCriteriaText(CRITERIA, { flowId: "focus" });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const fact = deriveAcceptanceFact(parsed.doc, { acId: "AC-28", artifact: "tests/evidence/a.txt" });
    assert.equal("ok" in fact, false);
    if ("ok" in fact) return;
    assert.equal(fact.priority, "P0");
    assert.equal(fact.unverified, true);
    const artifact = "tests/evidence/a.txt";
    await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
    await fs.writeFile(path.join(root, artifact), "共 3 行\npass: 1\nfail: 0\n", "utf8");
    const p0NoMeta = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria: parsed.doc, artifact });
    assert.equal(p0NoMeta.ok, false);
    assert.equal(p0NoMeta.rejection?.code, "evidence-mismatch");
    const actual = await readArtifact(root, artifact);
    await fs.writeFile(path.join(root, `${artifact}.meta.json`), JSON.stringify({
      schema: "evidence-meta/v1", artifact, sha256: actual.sha256, bytes: actual.bytes, lines: actual.lines,
      generatedAt: new Date(Date.now() + 2000).toISOString(), metrics: { pass: 1, fail: 0 }, acIds: ["AC-28"], p0: false,
    }), "utf8");
    const p0 = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria: parsed.doc, artifact });
    assert.equal(p0.ok, true, p0.rejection?.missing.join("；") ?? "");
    assert.equal(p0.priority, "P0");
    assert.equal(p0.p0Ignored, true);
    const p1Artifact = "tests/evidence/b.txt";
    await fs.writeFile(path.join(root, p1Artifact), "共 1 行\n", "utf8");
    const p1 = await checkEvidence({ projectRoot: root, acId: "P4.3", criteria: parsed.doc, artifact: p1Artifact });
    assert.equal(p1.ok, true);
    assert.equal(p1.priority, "P1");
    assert.equal(p1.unverified, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P4.4：criteriaRef 显式 path+sha+version；无 ref 不取 latest", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-acceptance-criteria-"));
  try {
    const rel = "docs/acceptance/focus-criteria-v1.md";
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), CRITERIA, "utf8");
    const sha = createHash("sha256").update(await fs.readFile(path.join(root, rel))).digest("hex");
    const unresolved = await loadCriteria(root, "focus", undefined);
    assert.equal(unresolved.ok, false);
    if (!unresolved.ok) assert.equal(unresolved.code, "criteria-version-unresolved");
    const loaded = await loadCriteria(root, "focus", { path: rel, sha256: sha, version: 1 });
    assert.equal(loaded.ok, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

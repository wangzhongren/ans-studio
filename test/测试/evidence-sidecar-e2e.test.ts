// test/测试/evidence-sidecar-e2e.test.ts
// 2026-10-30（3.4/P4.1-P4.4）：criteria ref → artifact/sidecar 实盘端到端；不执行项目脚本。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { checkEvidence, loadCriteria, parseCriteriaText, readArtifact } from "../../src/common/编排/evidence-check.ts";

test("evidence sidecar E2E：criteria ref + artifact + sidecar 全链路通过", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-evidence-e2e-"));
  try {
    const criteriaRel = "docs/acceptance/focus-criteria-v1.md";
    const criteriaText = [
      "```ans-criteria", "schema: ans-criteria/v1", "flowId: focus", "version: 1", "status: final",
      "criteria:", "  - id: AC-28", "    priority: P0", "```",
    ].join("\n");
    await fs.mkdir(path.dirname(path.join(root, criteriaRel)), { recursive: true });
    await fs.writeFile(path.join(root, criteriaRel), criteriaText, "utf8");
    const criteriaSha = createHash("sha256").update(await fs.readFile(path.join(root, criteriaRel))).digest("hex");
    const criteria = await loadCriteria(root, "focus", { path: criteriaRel, sha256: criteriaSha, version: 1 });
    assert.equal(criteria.ok, true, criteria.ok ? "" : criteria.rejection.missing.join("；"));
    if (!criteria.ok) return;
    const artifact = "tests/evidence/e2e.txt";
    await fs.mkdir(path.dirname(path.join(root, artifact)), { recursive: true });
    await fs.writeFile(path.join(root, artifact), "共 3 行\npass: 2\nfail: 0\n", "utf8");
    const actual = await readArtifact(root, artifact);
    await fs.writeFile(path.join(root, `${artifact}.meta.json`), JSON.stringify({
      schema: "evidence-meta/v1", artifact, sha256: actual.sha256, bytes: actual.bytes, lines: actual.lines,
      generatedAt: new Date(Date.now() + 2000).toISOString(), metrics: { tests: 2, pass: 2, fail: 0 }, acIds: ["AC-28"], p0: true,
    }), "utf8");
    const checked = await checkEvidence({ projectRoot: root, acId: "AC-28", criteria: criteria.doc, artifact });
    assert.equal(checked.ok, true, checked.rejection?.missing.join("；") ?? "");
    assert.equal(checked.valid, true);
    assert.equal(checked.priority, "P0");
    assert.equal(checked.p0Ignored, true);
    // 解析器正例（格式契约）与 ref 一致。
    const direct = parseCriteriaText(criteriaText, { flowId: "focus", fileName: "focus-criteria-v1.md" });
    assert.equal(direct.ok, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

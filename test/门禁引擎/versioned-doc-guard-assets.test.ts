// test/门禁引擎/versioned-doc-guard-assets.test.ts
// 2026-10-30（3.1 / Delta-W1-1=A）：assets 第七类 vN 文档只读与 baseline canonical 路径。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  isVersionedDocPath,
  recordVersionedDocBaselines,
  verifyVersionedDocBaselines,
  versionedDocOverwriteDecision,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";

test("assets 第七类：路径识别、新建允许、覆盖拒绝、baseline canonical 在 docs/contracts", async () => {
  assert.equal(isVersionedDocPath("docs/contracts/focus-assets-v1.md"), true);
  assert.equal(versionedDocOverwriteDecision({ relPath: "docs/contracts/focus-assets-v1.md", exists: false }).allowed, true);
  assert.equal(versionedDocOverwriteDecision({ relPath: "docs/contracts/focus-assets-v1.md", exists: true }).allowed, false);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-assets-guard-"));
  try {
    await fs.mkdir(path.join(root, "docs/contracts"), { recursive: true });
    await fs.writeFile(path.join(root, "docs/contracts/focus-assets-v1.md"), "---\nschema: project-assets/v1\nflowId: focus\nversion: 1\n---\n", "utf8");
    await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });
    const baseline = await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8");
    assert.match(baseline, /"doc":"assets"/);
    assert.match(baseline, /"path":"docs\/contracts\/focus-assets"/);
    const verified = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.deepEqual(verified, []);
    await fs.writeFile(path.join(root, "docs/contracts/focus-assets-v1.md"), "tampered", "utf8");
    const tampered = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.ok(tampered.some((violation) => violation.path.includes("focus-assets-v1.md")));
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

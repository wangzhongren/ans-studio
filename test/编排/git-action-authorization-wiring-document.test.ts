// test/编排/git-action-authorization-wiring-document.test.ts
// W3b（B1 AC-1/AC-4、P1.2-AC-31；P1.4 §3.3.1/§3.4.3；I0-2；I0-11）：
// 文档发布调用点（`executeGitDocumentPublication`，与计划/激活共用 `executeGitBusinessPublication`）
// 成功路径上 sidecar 出现且 R2 两键（candidate, publication）/模板来源正确；真实首发布 trunk ref 生成。
//
// 真实夹具：真实 init + intent 冻结 + product Core 会话（active submit_version_change）+ 真实 work source/task。
// 独立文件/进程：custom provider Core 会话无法以 drained 收口（I0-3 冻结）。

import assert from "node:assert/strict";
import { test, after } from "node:test";

import { executeGitDocumentPublication } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createProjectTrunkStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createDocumentFixture } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring document publication: sidecar records candidate+publication digests with publish-documents template before the store commit", async () => {
  const fixture = await createDocumentFixture({ operationId: "w3b-doc-publication", opened });
  try {
    const receipt = await executeGitDocumentPublication({ projectRoot: fixture.root, applyInput: fixture.applyInput });
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
    assert.equal(receipt.status, "applied", JSON.stringify(receipt));
    const read = await readGitActionAuthorizations(fixture.root, fixture.applyInput.operationId);
    assert.equal(read.ok, true); if (!read.ok) return;
    assert.equal(read.records.length, 1);
    const record = read.records[0]!;
    assert.equal(record.template, "publish-documents", "文档发布模板取 publicationPolicyInput.template");
    assert.equal(record.actorRoleId, "product");
    assert.equal(record.coreSessionId, fixture.product.sessionId);
    assert.equal(record.taskId, fixture.taskId);
    assert.equal(record.activeTool, "submit_version_change", "activeTool 为真实业务工具名");
    assert.deepEqual(Object.keys(record.policyInputDigests), ["candidate", "publication"], "R2：两键");
    assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
    assert.match(record.policyInputDigests.publication!, /^[a-f0-9]{64}$/);
    assert.notEqual(record.policyInputDigests.candidate, record.policyInputDigests.publication);
    assert.ok(record.leaseId.length > 0);
    // 成功提交本身证明两个 digest 就是 Service 重新推导并核验的 policy input digest。
    const manifest = await createProjectTrunkStore(fixture.root).readManifest();
    assert.ok(manifest.ok); if (!manifest.ok) return;
    assert.equal(manifest.value.trunkVersion, 1, "真实首发布 trunk ref 已生成（效果在 append 之后）");
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});

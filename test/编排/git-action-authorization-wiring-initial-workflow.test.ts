// test/编排/git-action-authorization-wiring-initial-workflow.test.ts
// W3b（B1 AC-1/AC-4、P1.2-AC-31；P1.4 §3.3.1/§3.4.3；I0-2；I0-11/I0-12）：
// initial workflow 发布调用点（`executeGitInitialWorkflowPublication`）成功路径：sidecar 两键
// `{candidate, publication}`、模板/actor/active tool 正确、先于效果；真实 workflow 工件发布。
//
// 真实夹具：计划发布（trunk v2）→ 真实 stable-write 流（request/approve/bind/write_file/completeWrite）→
// 真实 convener Core 回合（active write_file，由 versionedDocAfterWrite 挂起保持）。

import assert from "node:assert/strict";
import { test, after } from "node:test";

import { executeGitInitialWorkflowPublication } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createProjectTrunkStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createInitialWorkflowFixture } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring initial workflow: sidecar records candidate+publication digests with publish-documents template before the store commit", async () => {
  const fixture = await createInitialWorkflowFixture({ planOperationId: "w3b-iw-plan", opened });
  try {
    const manifestBefore = await createProjectTrunkStore(fixture.root).readManifest();
    assert.ok(manifestBefore.ok); if (!manifestBefore.ok) return;
    const receipt = await executeGitInitialWorkflowPublication({ projectRoot: fixture.root, request: fixture.request });
    assert.equal(receipt.applied, true, JSON.stringify(receipt));
    const read = await readGitActionAuthorizations(fixture.root, fixture.workflowOperationId);
    assert.equal(read.ok, true); if (!read.ok) return;
    assert.equal(read.records.length, 1);
    const record = read.records[0]!;
    assert.equal(record.operationId, fixture.workflowOperationId);
    assert.equal(record.template, "publish-documents", "initial workflow 模板取 publicationPolicyInput.template");
    assert.equal(record.actorRoleId, "convener");
    assert.equal(record.coreSessionId, fixture.convener.sessionId);
    assert.equal(record.taskId, fixture.taskId);
    assert.equal(record.activeTool, "write_file", "activeTool 为真实活动写入工具名");
    assert.deepEqual(Object.keys(record.policyInputDigests), ["candidate", "publication"], "R2：两键");
    assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
    assert.match(record.policyInputDigests.publication!, /^[a-f0-9]{64}$/);
    assert.notEqual(record.policyInputDigests.candidate, record.policyInputDigests.publication);
    assert.ok(record.leaseId.length > 0);
    // 成功提交本身证明两个 digest 就是 Service 重新推导并核验的 policy input digest；workflow 工件已发布。
    const manifest = await createProjectTrunkStore(fixture.root).readManifest();
    assert.ok(manifest.ok); if (!manifest.ok) return;
    assert.equal(manifest.value.artifacts.workflow?.sha256, (await import("node:crypto")).createHash("sha256").update(fixture.workflowText).digest("hex"),
      "真实 workflow 工件已发布（效果在 append 之后）");
    assert.equal(manifest.value.trunkVersion, manifestBefore.value.trunkVersion, "workflow 发布不升 trunkVersion（既有语义）");
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});

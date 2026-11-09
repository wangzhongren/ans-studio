// test/编排/git-action-authorization-wiring-publication.test.ts
// W3b（B1 AC-1/AC-4、P1.2-AC-31；P1.4 §3.3.1/§3.4.3；I0-2；I0-11）：
// 业务发布调用点（`executeGitTeamPlanPublication`，与文档/激活共用 `executeGitBusinessPublication`）
// 成功路径上 sidecar 出现且 R2 两键（candidate, publication）/模板来源正确。
//
// 真实夹具：真实 init（init.json candidate-created + 空候选）→ 迁移后的真实 Git trunk v1 →
// 真实 chief/convener Core 会话 + 真实 host inventory + 真实 work source/task。
// Core 注册表是进程级的：本文件所有会话共用同一项目根并保持 active 到进程结束。

import assert from "node:assert/strict";
import { test, after } from "node:test";

import { executeGitTeamPlanPublication } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createProjectTrunkStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createPublicationFixture } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring plan publication: sidecar records candidate+publication digests with publish-documents template before the store commit", async () => {
  const fixture = await createPublicationFixture({ operationId: "w3b-plan-publication", opened });
  try {
    const receipt = await executeGitTeamPlanPublication({ projectRoot: fixture.root, request: fixture.request, actorRoleId: "convener" });
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
    assert.equal(receipt.status, "applied", JSON.stringify(receipt));
    const read = await readGitActionAuthorizations(fixture.root, fixture.request.operationId);
    assert.equal(read.ok, true); if (!read.ok) return;
    assert.equal(read.records.length, 1);
    const record = read.records[0]!;
    assert.equal(record.template, "publish-documents", "业务发布模板取 publicationPolicyInput.template");
    assert.equal(record.actorRoleId, "convener");
    assert.equal(record.coreSessionId, fixture.convener.sessionId);
    assert.equal(record.taskId, fixture.taskId);
    assert.equal(record.activeTool, "complete_team_plan", "activeTool 为真实业务工具名");
    assert.deepEqual(Object.keys(record.policyInputDigests), ["candidate", "publication"], "R2：文档/计划/激活两键");
    assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
    assert.match(record.policyInputDigests.publication!, /^[a-f0-9]{64}$/);
    assert.notEqual(record.policyInputDigests.candidate, record.policyInputDigests.publication);
    assert.ok(record.leaseId.length > 0);
    // 成功提交本身证明两个 digest 就是 Service 重新推导并核验的 policy input digest
    // （commitPreparedTeamPlan 在 digest 不符时以 plan-commit-binding-invalid 拒绝）。
    const manifest = await createProjectTrunkStore(fixture.root).readManifest();
    assert.ok(manifest.ok); if (!manifest.ok) return;
    assert.equal(manifest.value.trunkVersion, 2, "真实 trunk 已推进（效果在 append 之后）");
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});

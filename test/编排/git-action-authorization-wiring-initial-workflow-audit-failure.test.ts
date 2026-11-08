// test/编排/git-action-authorization-wiring-initial-workflow-audit-failure.test.ts
// W3b（B1 AC-16；P1.4 §3.4.3/§3.8；I0-2；I0-12）：initial workflow 发布在 sidecar 写入失败时 ⇒
// `git-action-audit-unavailable`，不执行 store 写入：workflow 工件/journal/trunk 均无效果。
//
// 独立文件/进程：custom provider Core 会话无法以 drained 收口（I0-3 冻结）。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { test, after } from "node:test";

import { executeGitInitialWorkflowPublication } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createProjectTrunkStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createInitialWorkflowFixture, w3bSha256, w3bSidecarPath } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring initial workflow failure injection: blocked sidecar store ⇒ git-action-audit-unavailable with no workflow/journal effects", async () => {
  const fixture = await createInitialWorkflowFixture({ planOperationId: "w3b-iw-plan-blocked", blockSidecarStore: true, opened });
  try {
    const store = createProjectTrunkStore(fixture.root);
    const manifestBefore = await store.readManifest();
    assert.ok(manifestBefore.ok); if (!manifestBefore.ok) return;
    assert.equal(manifestBefore.value.artifacts.workflow, undefined, "发布前没有 workflow 工件");
    const receipt = await executeGitInitialWorkflowPublication({ projectRoot: fixture.root, request: fixture.request });
    assert.equal(receipt.applied, false, JSON.stringify(receipt));
    assert.equal((receipt as { errorCode?: string }).errorCode, "git-action-audit-unavailable", `append 失败必须 fail-closed：${JSON.stringify(receipt)}`);
    const manifestAfter = await store.readManifest();
    assert.ok(manifestAfter.ok); if (!manifestAfter.ok) return;
    assert.deepEqual(manifestAfter.value, manifestBefore.value, "trunk manifest/workflow 工件未改变（无 store 写入效果）");
    const journalPath = path.join(fixture.root, ".ans/trunk/operations", w3bSha256(fixture.workflowOperationId), "git.json");
    assert.equal(await fs.stat(journalPath).then(() => true, () => false), false, "initial workflow journal 未创建");
    assert.equal(await fs.readFile(w3bSidecarPath(fixture.root, fixture.workflowOperationId), "utf8"), "not-json\n", "损坏的既有 sidecar 未被改写/覆盖");
    const sidecar = await readGitActionAuthorizations(fixture.root, fixture.workflowOperationId);
    assert.equal(sidecar.ok, false, "sidecar 内容校验仍 fail-closed");
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});

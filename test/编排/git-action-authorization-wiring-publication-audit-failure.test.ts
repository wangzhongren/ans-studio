// test/编排/git-action-authorization-wiring-publication-audit-failure.test.ts
// W3b（B1 AC-16；P1.4 §3.4.3/§3.8；I0-2；I0-11）：业务发布（计划/文档/激活共用调用点）在 sidecar
// 写入失败时 ⇒ `git-action-audit-unavailable`，不执行 store 写入：trunk manifest 不变、无 journal/ref 效果。
//
// 独立文件/进程：custom provider Core 会话无法以 drained 收口（I0-3 冻结），项目根与 Core 条目按文件隔离。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { test, after } from "node:test";

import { executeGitTeamPlanPublication } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createProjectTrunkStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createPublicationFixture, w3bSha256, w3bSidecarPath } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring plan publication failure injection: blocked sidecar store ⇒ git-action-audit-unavailable with no manifest/history effects", async () => {
  const fixture = await createPublicationFixture({ operationId: "w3b-plan-audit-blocked", blockSidecarStore: true, opened });
  try {
    const store = createProjectTrunkStore(fixture.root);
    const manifestBefore = await store.readManifest();
    assert.ok(manifestBefore.ok); if (!manifestBefore.ok) return;
    const historyPath = path.join(fixture.root, ".ans/trunk/history");
    const historyBefore = await fs.readdir(historyPath).catch(() => [] as string[]);
    const receipt = await executeGitTeamPlanPublication({ projectRoot: fixture.root, request: fixture.request, actorRoleId: "convener" });
    assert.equal(receipt.ok, false, JSON.stringify(receipt));
    assert.equal(receipt.errorCode, "git-action-audit-unavailable", `append 失败必须 fail-closed：${JSON.stringify(receipt)}`);
    const manifestAfter = await store.readManifest();
    assert.ok(manifestAfter.ok); if (!manifestAfter.ok) return;
    assert.deepEqual(manifestAfter.value, manifestBefore.value, "trunk manifest 未改变（无 store 写入效果）");
    assert.deepEqual(await fs.readdir(historyPath).catch(() => [] as string[]), historyBefore, "无新 history 效果");
    const journalPath = path.join(fixture.root, ".ans/trunk/operations", w3bSha256(fixture.request.operationId), "git.json");
    assert.equal(await fs.stat(journalPath).then(() => true, () => false), false, "业务发布 journal 未创建");
    assert.equal(await fs.readFile(w3bSidecarPath(fixture.root, fixture.request.operationId), "utf8"), "not-json\n", "损坏的既有 sidecar 未被改写/覆盖");
    const sidecar = await readGitActionAuthorizations(fixture.root, fixture.request.operationId);
    assert.equal(sidecar.ok, false, "sidecar 内容校验仍 fail-closed（journal 权威不受影响）");
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});

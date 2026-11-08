// test/编排/git-action-authorization-wiring-retry.test.ts
// W3b / P1.2-AC-26（F3 sidecar 重试/恢复；P1.4 §3.4.3/§4.4；I0-1/I0-2）：
// 同一 operationId 的先前尝试（模拟崩溃前的 append：真实 `git-mutation` lease + 同一生产 append API）之后，
// 新 lease/turn 的调用点尝试追加新行；不触发 `git-operation-replay-conflict` /
// `git-candidate-operation-conflict` / `git-init-operation-conflict`，旧行字节保持不变，
// 既有 init journal 身份/读取不受影响（sidecar 不进入 replay/settlement 身份）。
//
// 独立文件/进程：custom provider Core 会话无法以 drained 收口（I0-3 冻结），项目根与 Core 条目按文件隔离。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { test, after } from "node:test";

import { appendGitActionAuthorization, beginGitHostAction, endGitHostAction, readGitActionAuthorizations, type GitActionAuthorizationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createInitFixture, w3bSha256, w3bSidecarPath } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring retry: same operationId on a new lease/turn appends a sidecar row without replay/init conflicts", async () => {
  const fixture = await createInitFixture({ operationId: "w3b-init-retry", opened });
  try {
    // 模拟崩溃前的尝试：同一 operationId 的旧侧写行（真实 lease A + 同一生产 append API；旧 turn 未产生效果）。
    const priorLease = beginGitHostAction({ projectRoot: fixture.root, kind: "git-mutation" });
    assert.ok(priorLease.ok); if (!priorLease.ok) return;
    const prior: GitActionAuthorizationRecord = { source: "git-action-authorization", version: 1, operationId: fixture.request.operationId, template: "init",
      actorRoleId: "convener", coreSessionId: fixture.convener.sessionId, taskId: fixture.taskId, runId: fixture.runId, turnId: "w3b-prior-turn",
      activeTool: "git_candidate", projectRoot: fixture.root, rootsDigest: w3bSha256("prior-roots"), registryRevision: 0,
      inventoryRevision: "prior-inventory", leaseId: priorLease.leaseId,
      policyInputDigests: { init: w3bSha256("prior-init"), candidate: w3bSha256("prior-candidate") }, optionalEvidence: {} };
    try { await appendGitActionAuthorization(fixture.root, prior); } finally { endGitHostAction({ projectRoot: fixture.root, leaseId: priorLease.leaseId }); }
    const file = w3bSidecarPath(fixture.root, fixture.request.operationId), before = await fs.readFile(file);
    // 新 lease/turn 的调用点尝试：真实 gate/policy/current 通过后 append 新行并执行 init 效果。
    const act = await fixture.runtime.gitCandidate(fixture.request);
    assert.equal(act.status, "prepared", JSON.stringify(act));
    assert.notEqual("git-init-operation-conflict", act.code);
    assert.notEqual("git-operation-replay-conflict", act.code);
    assert.notEqual("git-candidate-operation-conflict", act.code);
    const after = await readGitActionAuthorizations(fixture.root, fixture.request.operationId);
    assert.equal(after.ok, true); if (!after.ok) return;
    assert.equal(after.records.length, 2, "同一 operationId 每次尝试一行");
    assert.equal(after.records[0]!.leaseId, priorLease.leaseId);
    assert.notEqual(after.records[1]!.leaseId, after.records[0]!.leaseId, "新 lease");
    assert.equal(after.records[0]!.turnId, "w3b-prior-turn");
    assert.notEqual(after.records[1]!.turnId, "w3b-prior-turn", "新 turn");
    assert.deepEqual(after.records.map(row => row.template), ["init", "init"]);
    const appended = await fs.readFile(file);
    assert.deepEqual(appended.subarray(0, before.length), before, "旧行字节前缀保持不变（append-only）");
    assert.ok(appended.length > before.length);
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});

// test/测试/git-run-stop-host-continuation-e2e.test.ts
// W7（B2 v1 补证，AC-8 / P1.2-AC-25）：deferred run-stop 宿主继续 finalize **完整效果链**：
//   真实 prepared run/plan（`prepareRunChange` 返回 `deferred`，rapporteur 真实回合结束后 disposed/空闲）
//   → 真实 host stop fence/队列持久化事实 → `finalizeRunChange`
//   （host-continuation：匹配 requesterTurnId/taskId/role/project、drain、不要求 active tool）
//   → `commitPreparedRunChange` 真实 run transition journal 提交；run-stop 不写 sidecar（R6）。
//   Claude rapporteur 请求者 + Pi product 成员（运行时中立 drain）；负例（taskId 不符/记录不唯一）保持拒绝。
// 所有断言读取临时项目根内真实产生的 run manifest/journal 与 Core 事实；不伪造 journal/sidecar。
//
// 依据：B1 v1 AC-8/P1.2-AC-25/AC-29（§2.2/§3）；设计 P1.4 §3.3.2 H4/H5、§3.7、§3.8、§6.1；I0-3/I0-5；
// B2 v1 §4 关闭条件 4。
import assert from "node:assert/strict";
import { test, after } from "node:test";
import * as fsp from "node:fs/promises";
import path from "node:path";

import { finalizeRunChange, inspectGitActionAuthorization, prepareRunChange } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createGitCandidateStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { isRuntimeSessionDrained } from "../../src/model/runtime.ts";
import { buildWriteChain, createRunChangeAssignment, disposeChainSessions, exportEvidence, holdableSelectRunChange, recordGitHostInventoryForFixture, startTurn, type ManagedSession } from "./git-write-chain-fixture.ts";
import { disposeOpenedSessions, entryOf, sha256, until } from "./git-action-cross-runtime-fixture.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";

after(async () => { await disposeOpenedSessions(); await disposeChainSessions(); });

const AT = "2026-11-08T00:00:00.000Z";
const sidecarDir = (root: string, operationId: string) => path.join(root, ".ans/trunk/operations", sha256(operationId));
/** 与 Service `directHash` 同口径的 canonical JSON（排序键、丢弃 undefined）。 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}

test("AC-8/P1.2-AC-25：deferred run-stop 宿主继续 finalize（Claude requester + Pi 成员；host-continuation + drain + run transition journal；无 sidecar）", async () => {
  const held = holdableSelectRunChange();
  const operationId = "w7-run-change", requesterTaskId = "w7-runchange-requester", hubRunId = "run-w7-hub";
  const memberRapporteurTask = "w7-runchange-member-rr", memberProductTask = "w7-runchange-member-prod";
  const chain = await buildWriteChain({
    prefix: "ans-w7-runstop-",
    activationMode: "service",
    extras: [
      { key: "rapporteur", runtime: "claude", roleId: "rapporteur", managed: true,
        capabilities: { selectRunChange: held.selectRunChange },
        options: { providerFactories: { claude: options => createDemoRuntimeAdapter(options, [{ name: "select_run_change", args: {
          operationId, runId: "run-w7-exec", expectedPinDigest: "a".repeat(64), targetTrunk: { version: 2, digest: "b".repeat(64) },
          mode: "stop", reason: "Actual frozen run stop requested by the assigned rapporteur (W7 AC-8)" } }]) } } },
      { key: "member", runtime: "pi", roleId: "product", managed: true,
        options: { providerFactories: { pi: options => createDemoRuntimeAdapter(options, []) } } },
    ],
  });
  const rapporteur = chain.sessions.rapporteur!, member = chain.sessions.member!;
  assert.ok(rapporteur.sessionId && member.sessionId);
  if (!rapporteur.sessionId || !member.sessionId) return;
  let pumping: Promise<void> | undefined, memberTurn: Promise<void> | undefined;
  try {
    const assignment = await createRunChangeAssignment(chain, { requesterTaskId, hubRunId, controllerTaskId: "w7-runchange-controller",
      members: [{ taskId: memberRapporteurTask, roleId: "rapporteur" }, { taskId: memberProductTask, roleId: "product" }] });

    // 真实 Core 回合：rapporteur 的 select_run_change 保持 active；Pi 成员完成一个真实（空脚本）回合。
    pumping = startTurn(rapporteur, "Select the actual frozen run stop timing (W7 AC-8)");
    pumping.catch(() => undefined);
    memberTurn = startTurn(member, "Report the actual stopped-run member turn (W7 AC-8)");
    memberTurn.catch(() => undefined);
    await until(() => entryOf(rapporteur.sessionId!)?.lifecycle?.activeTools.some(tool => tool.name === "select_run_change") === true, 10000);
    const requesterTurnId = entryOf(rapporteur.sessionId!)?.lifecycle?.turnId;
    assert.ok(requesterTurnId, "真实 rapporteur 请求回合 turnId 必须可读");

    const row = (hostHandleId: string, session: { sessionId?: string }, roleId: string, runtime: string, taskId: string | undefined, runId: string | undefined) =>
      ({ hostHandleId, session, roleId, runtime, ...(taskId !== undefined ? { taskId } : {}), ...(runId !== undefined ? { runId } : {}) });
    // 真实 host inventory rev1：请求者行（hub 任务）+ 两个 stopped-run 成员行（同一真实 Core 会话的成员身份）。
    assert.ok(recordGitHostInventoryForFixture(chain.root, [
      row("host-chief", chain.sessions.chief!, "chief", "demo", undefined, undefined),
      row("host-workflow-convener", chain.sessions.workflowConvener!, "convener", "demo", chain.planTaskId, "run-w7-plan"),
      row("host-rapporteur-requester", rapporteur, "rapporteur", "claude", requesterTaskId, hubRunId),
      row("host-rr-member", rapporteur, "rapporteur", "claude", memberRapporteurTask, chain.execRunId),
      row("host-prod-member", member, "product", "pi", memberProductTask, chain.execRunId),
    ], 1).ok);
    const targetTrunk = { version: (chain.manifest as { trunkVersion?: number }).trunkVersion ?? 2, digest: (chain.manifest as { digest?: string }).digest ?? "" };
    assert.match(targetTrunk.digest, /^[a-f0-9]{64}$/);

    // 真实 prepared run-change（deferred：请求者本人属于被停成员集合）。
    const request = { operationId, runId: chain.execRunId, expectedPinDigest: chain.pin.pinDigest, targetTrunk, mode: "stop" as const,
      reason: "Actual frozen run stop requested by the assigned rapporteur (W7 AC-8)" };
    const plan = await prepareRunChange({ projectRoot: chain.root, requesterTaskId, request });
    assert.ok(plan.ok, JSON.stringify(plan));
    if (!plan.ok) return;
    assert.equal(plan.value.deferred, true, "deferred run-stop 必须由真实成员集合含请求者本人判定");
    assert.equal(plan.value.requesterTurnId, requesterTurnId);
    const handleIds = plan.value.handles.map(handle => handle.hostHandleId).sort();
    assert.deepEqual(handleIds, ["host-prod-member", "host-rr-member"], "真实 stopped-run member 集合");

    // 真实回合结束 + 真实 stopAndInspect（运行时中立 drain；成员终止事实 = stopRequested+providerFinished+
    // 无 active/进程；native/processCoverage 仅证据）。桩件自定义工厂按 I0-3 不能以 disposed 收口，
    // 因此使用生产 `stopAndInspect` 的运行时中立 drain 快路径（不伪造 facts）。
    held.release();
    await pumping.catch(() => undefined);
    await memberTurn.catch(() => undefined);
    const memberTurnId = entryOf(member.sessionId!)?.lifecycle?.turnId;
    assert.ok(memberTurnId);
    const rrStop = await (rapporteur as ManagedSession).stopAndInspect!({ expectedSessionId: rapporteur.sessionId!, expectedTurnId: requesterTurnId, timeoutMs: 8000 });
    const memberStop = await (member as ManagedSession).stopAndInspect!({ expectedSessionId: member.sessionId!, expectedTurnId: memberTurnId, timeoutMs: 8000 });
    assert.equal(rrStop.stopRequested, true, "真实 stopAndInspect 记录 stopRequested");
    assert.equal(memberStop.stopRequested, true);
    assert.ok(isRuntimeSessionDrained(rrStop), "Claude rapporteur 运行时中立 drain（native 不可观测如实接受）");
    assert.ok(isRuntimeSessionDrained(memberStop), "Pi 成员运行时中立 drain");
    const rrEntry = entryOf(rapporteur.sessionId!), memberEntry = entryOf(member.sessionId!);
    assert.ok(rrEntry?.lifecycle && isRuntimeSessionDrained(rrEntry.lifecycle), "Core 注册表生命周期事实为 drained");
    assert.ok(memberEntry?.lifecycle && isRuntimeSessionDrained(memberEntry.lifecycle));

    const base = { projectRoot: chain.root, taskId: requesterTaskId, parentCoreSessionId: chain.sessions.chief!.sessionId!,
      expectedActor: { roleId: "rapporteur", coreSessionId: rapporteur.sessionId! },
      authorizationMode: "host-continuation" as const, hostContinuation: { requesterTurnId, planId: plan.value.planId } };
    // 真实 inventory rev2：回合结束后仍为 live（Core 空闲 drain；host 记录是真实 desktop 边界事实）。
    const settledRows = [
      row("host-chief", chain.sessions.chief!, "chief", "demo", undefined, undefined),
      row("host-workflow-convener", chain.sessions.workflowConvener!, "convener", "demo", chain.planTaskId, "run-w7-plan"),
      row("host-rapporteur-requester", rapporteur, "rapporteur", "claude", requesterTaskId, hubRunId),
      row("host-rr-member", rapporteur, "rapporteur", "claude", memberRapporteurTask, chain.execRunId),
      row("host-prod-member", member, "product", "pi", memberProductTask, chain.execRunId),
    ];
    assert.ok(recordGitHostInventoryForFixture(chain.root, settledRows, 2).ok);
    // P1.2-AC-29 负例：taskId 不符（inventory 记录与 input.taskId 不一致）⇒ 拒绝。
    const wrongTask = await inspectGitActionAuthorization({ ...base, taskId: "not-the-requester-task" });
    assert.equal(wrongTask.ok, false);
    if (!wrongTask.ok) assert.equal(wrongTask.code, "git-actor-core-binding-unproven");
    // 记录不唯一（同一 coreSessionId/taskId/roleId 的 live + disposed 两条请求者记录）⇒ 拒绝。
    assert.ok(recordGitHostInventoryForFixture(chain.root, [
      ...settledRows,
      { ...row("host-rapporteur-duplicate", rapporteur, "rapporteur", "claude", requesterTaskId, hubRunId), phase: "disposed" as const },
    ], 3).ok);
    const duplicate = await inspectGitActionAuthorization({ ...base });
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.code, "git-actor-core-binding-unproven");
    // 错 requestDigest ⇒ 真实 prepared plan 校验先拒绝（无副作用）。
    const wrongDigest = await finalizeRunChange({ projectRoot: chain.root, planId: plan.value.planId, requestDigest: "0".repeat(64) });
    assert.equal(wrongDigest.ok, false);
    if (!wrongDigest.ok) assert.equal(wrongDigest.errorCode, "run-preparation-invalid");

    // 真实 host stop fence + 队列持久化事实（精确覆盖 prepared handles）。
    const seq = 11, managerId = "w7-runstop-manager";
    assert.ok(recordGitHostInventoryForFixture(chain.root, settledRows, 4, {
      runStops: [{ managerId, operationId, runId: chain.execRunId, requestDigest: plan.value.requestDigest, generation: 1, state: "fenced",
        hostHandleIds: [...handleIds], targetSeq: seq }],
      deliveryQueuePersistence: [{ managerId, armed: true, enqueuedSeq: seq, completedSeq: seq, committedSeq: seq, pending: 0, failureCount: 0,
        knownProducers: { openChains: 0, deliveryClaims: 0, handbackCommits: 0 } }],
    }).ok);
    const trunkBefore = await createGitCandidateStore(chain.root).readRef("refs/ans/trunk");

    // 宿主继续 finalize：host-continuation 通过 → 真实 run transition journal 提交。
    const receipt = await finalizeRunChange({ projectRoot: chain.root, planId: plan.value.planId, requestDigest: plan.value.requestDigest });
    assert.equal(receipt.ok, true, JSON.stringify(receipt));
    if (!receipt.ok) return;
    assert.equal(receipt.status, "applied");
    assert.equal(receipt.source?.kind === "role-direct" && receipt.source.action, "select-run-change");
    assert.equal(receipt.runId, chain.execRunId);

    // run transition journal（run manifest 原件）：state cancelled + directRunChanges 提交（含 lifecycle/instance drain 事实）。
    const runManifestPath = path.join(chain.root, ".ans/runs", chain.execRunId, "manifest.json");
    const runManifest = JSON.parse(await fsp.readFile(runManifestPath, "utf8")) as { state?: string;
      directRunChanges?: Array<{ requestDigest?: string; mode?: string; receipt?: { status?: string; operationId?: string };
        lifecycle?: { instances?: unknown[]; hostStops?: Array<{ operationId?: string; state?: string; targetSeq?: number }> } }> };
    assert.equal(runManifest.state, "cancelled", "run-stop 必须以真实 run transition 提交终止");
    const changes = runManifest.directRunChanges ?? [];
    assert.equal(changes.length, 1);
    const change = changes[0]!;
    assert.equal(change.requestDigest, sha256(JSON.stringify(canonical(request))), "run transition 记录真实 request digest");
    assert.equal(change.mode, "stop");
    assert.equal(change.receipt?.status, "applied");
    assert.equal(change.receipt?.operationId, operationId);
    assert.equal(change.lifecycle?.instances?.length, 2, "提交必须携带全部成员的 drain 事实");
    assert.equal(change.lifecycle?.hostStops?.length, 1);
    assert.equal(change.lifecycle?.hostStops?.[0]?.state, "fenced");
    assert.equal(change.lifecycle?.hostStops?.[0]?.targetSeq, seq);

    // R6：run-stop/controller-stop 不写 sidecar（操作目录不存在），且不改变 Git ref。
    await assert.rejects(fsp.access(sidecarDir(chain.root, operationId)), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
    await assert.rejects(fsp.access(path.join(sidecarDir(chain.root, operationId), "authorization.jsonl")), (error: NodeJS.ErrnoException) => error.code === "ENOENT");
    assert.deepEqual(await createGitCandidateStore(chain.root).readRef("refs/ans/trunk"), trunkBefore, "run transition 不是 Git ref mutation");

    await exportEvidence("ac8-runstop-finalize.json", { operationId, plan: plan.value, receipt, runManifest, requesterTurnId,
      members: [{ roleId: "rapporteur", runtime: "claude", state: rrEntry?.state, drained: rrEntry?.lifecycle ? isRuntimeSessionDrained(rrEntry.lifecycle) : false },
        { roleId: "product", runtime: "pi", state: memberEntry?.state, drained: memberEntry?.lifecycle ? isRuntimeSessionDrained(memberEntry.lifecycle) : false }],
      sidecarDirectory: sidecarDir(chain.root, operationId), hostStops: change.lifecycle?.hostStops,
      negatives: { wrongTask, duplicate, wrongDigest }, runManifestPath, targetTrunk, assignment: { hubSourceId: assignment.hubSourceId } });
  } finally {
    held.release();
    if (pumping) await pumping.catch(() => undefined);
    if (memberTurn) await memberTurn.catch(() => undefined);
  }
});

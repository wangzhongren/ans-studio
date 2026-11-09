// test/测试/git-action-delivery-claude-e2e.test.ts
// W7（B2 v1 补证，AC-4）：受保护项目 + Claude convener + 真实任务/回合的 `git_publish delivery`
// **完整效果链**：真实 worker 提交 → 真实质检关闭（verifier report + chief-quality 文本核对）→
// 真实 integration（convener `git_candidate integrate`）→ `createGitRoleRuntime.gitPublish delivery`
// （expected old=null/candidate、actor/turn、两阶段复检、lease、write-ahead sidecar `{publication}`）→
// 真实 ref publication（refs/ans/delivery/demo）与 ref journal；无 native 前提。
// 所有断言读取临时项目根内真实产生的文件/引用（sidecar/journal/ref/回执）。
//
// 依据：B1 v1 AC-4（§2.1）；设计 P1.4 §3.3.1/§3.4.2/§3.4.3/§3.5/§6.1；I0-1/I0-2/I0-4；
// B2 v1 §4 关闭条件 3。
import assert from "node:assert/strict";
import { test, after } from "node:test";
import * as fsp from "node:fs/promises";
import path from "node:path";

import { createGitRoleRuntime, recordTaskObservation } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createGitCandidateStore, createGitRefStore, createProjectTrunkStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGitCapabilityService, createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { createGuardFreezeRegistry } from "../../src/provider/version-change/public/version-change-store.ts";
import { prepareVerifiedDelivery } from "../../src/service/trunk/impl/apply-journal.ts";
import { checkGitPolicy } from "../../src/service/gate/shell-rules.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import type { GitOid } from "../../src/model/trunk.ts";
import { buildWriteChain, createExecutionAssignment, disposeChainSessions, exportEvidence, startTurn } from "./git-write-chain-fixture.ts";
import { disposeOpenedSessions, entryOf, holdableGitCandidate, sha256, sidecarPath, until } from "./git-action-cross-runtime-fixture.ts";
import { holdableGitPublish } from "./git-write-chain-fixture.ts";

after(async () => { await disposeOpenedSessions(); await disposeChainSessions(); });

const RETIRED_CODES = ["git-core-creation-proof-unavailable", "git-native-surface-unproven", "git-unclosed-effect-registered",
  "official-pure-preparation-unproven", "native-factory-plan-unavailable"];
const placeholderOid = (hex: string): GitOid => ({ objectFormat: "sha1", hex });

test("AC-4：Claude convener 在受保护项目完成任务/回合内 git_publish delivery 完整链（sidecar {publication}/ref journal/发布回执，无 native 前提）", async () => {
  const candidateHold = holdableGitCandidate(), publishHold = holdableGitPublish();
  const integrationOperationId = "w7-delivery-integration", deliveryOperationId = "w7-delivery-publish";
  const chain = await buildWriteChain({
    prefix: "ans-w7-delivery-claude-",
    activationMode: "service",
    extras: [{ key: "convener", runtime: "claude", roleId: "convener", managed: true,
      capabilities: { gitCandidate: candidateHold.gitCandidate, gitPublish: publishHold.gitPublish },
      options: { providerFactories: { claude: options => createDemoRuntimeAdapter(options, [
        { name: "git_candidate", args: { operationId: integrationOperationId, action: "integrate", base: { ref: "refs/ans/trunk", oid: placeholderOid("a".repeat(40)) },
          candidates: [placeholderOid("b".repeat(40))], message: "W7 delivery integration (held identity round)" } },
        { name: "git_publish", args: { operationId: deliveryOperationId, target: "delivery", expected: { ref: "refs/ans/delivery/demo", oid: null },
          candidate: placeholderOid("b".repeat(40)), criteria: [], evidence: [], creatorCloseOperationId: "w7-quality-close" } },
      ]) } } }],
  });
  const convener = chain.sessions.convener!;
  let pumping: Promise<void> | undefined;
  try {
    const exec = await createExecutionAssignment(chain, { controllerTaskId: "w7-delivery-exec-task", workerTaskId: "w7-delivery-worker-task" });
    const content = "The actual delivered and independently verified W7 text artifact.\n";
    await fsp.mkdir(path.join(chain.root, "src/impl"), { recursive: true });
    await fsp.writeFile(path.join(chain.root, "src/impl/result.txt"), content);

    // 1) 真实 worker 提交（真实 service/Git 能力路径；与 AC-1/AC-2 已覆盖的 runtime 入口同服务）。
    const run = chain.pin.run as { codeBasis?: { ref: string; oid?: GitOid } };
    assert.ok(run.codeBasis?.oid); if (!run.codeBasis?.oid) return;
    const base = run.codeBasis as { ref: string; oid: GitOid };
    const workerService = createGitCapabilityService({ projectRoot: chain.root, context: { actorRoleId: "impl", taskId: "w7-delivery-worker-task", runId: chain.execRunId, readPaths: ["."] } });
    const workerRequest = { operationId: "w7-delivery-worker-commit", action: "commit" as const, base, paths: ["src/impl/result.txt"], message: "W7 delivery worker result" };
    const workerPrepared = await workerService.prepareWorkerCommit(workerRequest);
    assert.ok(workerPrepared.ok, JSON.stringify(workerPrepared));
    if (!workerPrepared.ok) return;
    const workerVerdict = checkGitPolicy(workerPrepared.value.policyInput);
    assert.equal(workerVerdict.allowed, true, JSON.stringify(workerVerdict));
    const workerLease = (await import("../../src/provider/trunk/public/trunk-store.ts")).beginGitHostAction({ projectRoot: chain.root, kind: "git-mutation" });
    assert.ok(workerLease.ok); if (!workerLease.ok) return;
    let workerCandidate: GitOid | undefined;
    try {
      const candidate = await workerService.executeWorkerCommit(workerPrepared.value, workerLease.leaseId, workerVerdict);
      assert.equal(candidate.status, "prepared", JSON.stringify(candidate));
      workerCandidate = candidate.candidate;
    } finally {
      (await import("../../src/provider/trunk/public/trunk-store.ts")).endGitHostAction({ projectRoot: chain.root, leaseId: workerLease.leaseId });
    }
    assert.ok(workerCandidate); if (!workerCandidate) return;

    // 2) 真实 worker 报告 + 原 creator（convener）accepted 收口。
    assert.ok((await recordTaskObservation({ projectRoot: chain.root, event: { v: 1, at: "2026-11-08T00:00:00.000Z", kind: "task.reported",
      taskId: "w7-delivery-worker-task", from: "impl", status: "done", summary: "The actual worker artifact is committed",
      evidence: ["src/impl/result.txt", `Git candidate ${workerCandidate.objectFormat}:${workerCandidate.hex}`] } })).ok);
    const workerCloseBasis = await chain.service.prepareCreatedTaskClose("w7-delivery-worker-task", "convener");
    assert.ok(workerCloseBasis.ok, JSON.stringify(workerCloseBasis));
    if (!workerCloseBasis.ok) return;
    const workerClosed = await chain.service.closeCreatedTask({ operationId: "w7-worker-close", taskId: "w7-delivery-worker-task", runId: chain.execRunId,
      reportRef: workerCloseBasis.value.reportRef, basisDigest: workerCloseBasis.value.basisDigest, outcome: "accepted" }, "convener");
    assert.equal((workerClosed as { status?: string }).status, "applied", JSON.stringify(workerClosed));

    // 3) 真实 convener 回合（active git_candidate → 随后 active git_publish）与 host inventory。
    assert.ok((await import("../../src/pipeline/orchestration/trunk-runtime.ts")).recordGitHostInventory({ source: "desktop-session-manager", projectRoot: chain.root,
      observedAt: "2026-11-08T00:00:00.000Z", revision: 1, sessions: [
        { hostHandleId: "host-chief", roleId: "chief", runtime: "demo", phase: "live", coreSessionId: chain.sessions.chief!.sessionId, errors: [] },
        { hostHandleId: "host-convener", roleId: "convener", runtime: "claude", phase: "live", coreSessionId: convener.sessionId!,
          taskId: "w7-delivery-exec-task", runId: chain.execRunId, errors: [] },
        { hostHandleId: "host-workflow-convener", roleId: "convener", runtime: "demo", phase: "live", coreSessionId: chain.sessions.workflowConvener!.sessionId,
          taskId: chain.planTaskId, runId: "run-w7-plan", errors: [] },
      ], pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [] }).ok);
    pumping = startTurn(convener, "Invoke git_candidate integrate for the W7 AC-4 fixture");
    pumping.catch(() => undefined);
    await until(() => entryOf(convener.sessionId!)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
    const integrationTurnId = entryOf(convener.sessionId!)?.lifecycle?.turnId;
    assert.ok(integrationTurnId);

    // 4) 真实 integration（convener runtime 入口；真实 child report/close + 当前 active 授权交集）。
    const runtime = createGitRoleRuntime({ projectRoot: chain.root, context: { actorRoleId: "convener", taskId: "w7-delivery-exec-task", runId: chain.execRunId, readPaths: ["."] } });
    const integrated = await runtime.gitCandidate({ operationId: integrationOperationId, action: "integrate", base, candidates: [workerCandidate], message: "W7 delivery final integration" });
    assert.equal(integrated.status, "prepared", JSON.stringify(integrated));
    assert.ok(integrated.candidate && integrated.tree); if (!integrated.candidate) return;
    const integrationCandidate = integrated.candidate as GitOid;

    // 5) 释放 integration 回合 → 同一 convener 会话进入第二个真实工具回合（active git_publish）。
    candidateHold.release();
    await until(() => entryOf(convener.sessionId!)?.lifecycle?.activeTools.some(tool => tool.name === "git_publish") === true, 10000);
    const deliveryTurnId = entryOf(convener.sessionId!)?.lifecycle?.turnId;
    assert.ok(deliveryTurnId);

    // 6) 真实独立质检：review task（convener 派发 verifier）+ verifier 报告 + 真实 accepted 收口。
    const reviewPrepared = await chain.service.prepareReviewTask({ parentTaskId: "w7-delivery-exec-task", flowId: "demo", runId: chain.execRunId,
      target: { operationId: integrationOperationId, candidate: integrationCandidate } });
    assert.ok(reviewPrepared.ok, JSON.stringify(reviewPrepared));
    if (!reviewPrepared.ok) return;
    const reviewTaskId = "w7-quality-task";
    assert.ok((await recordTaskObservation({ projectRoot: chain.root, event: { v: 1, at: "2026-11-08T00:00:00.000Z", kind: "task.created", taskId: reviewTaskId,
      from: "convener", to: "verifier", flowId: "demo", runId: chain.execRunId, runState: "pinned", sideEffect: "read-only",
      idempotencyKey: reviewTaskId, text: "Independently verify the actual integrated candidate",
      parentTaskRef: reviewPrepared.value.parentTaskRef as never, reviewBasisRef: reviewPrepared.value.reviewBasisRef as never } })).ok);
    const qualityPath = "docs/quality/demo-report-v1.md";
    const qualityMeta = { schema: "git-quality-report/v1", taskId: reviewTaskId, runId: chain.execRunId, flowId: "demo",
      candidateOperationId: integrationOperationId, candidate: integrationCandidate, criteria: reviewPrepared.value.reviewBasisRef.criteria,
      checks: [{ assertion: "nonempty-utf8", artifact: { oid: integrationCandidate, path: "src/impl/result.txt", sha256: sha256(content) } }] };
    await fsp.mkdir(path.join(chain.root, "docs/quality"), { recursive: true });
    await fsp.writeFile(path.join(chain.root, qualityPath), `---\n${JSON.stringify(qualityMeta)}\n---\n# Actual independent quality report\n`);
    assert.ok((await recordTaskObservation({ projectRoot: chain.root, event: { v: 1, at: "2026-11-08T00:00:00.000Z", kind: "task.reported", taskId: reviewTaskId,
      from: "verifier", status: "done", summary: "Mechanical text check passed against the actual final candidate blob", evidence: [qualityPath] } })).ok);
    const qualityCloseBasis = await chain.service.prepareCreatedTaskClose(reviewTaskId, "convener");
    assert.ok(qualityCloseBasis.ok, JSON.stringify(qualityCloseBasis));
    if (!qualityCloseBasis.ok) return;
    const qualityClosed = await chain.service.closeCreatedTask({ operationId: "w7-quality-close", taskId: reviewTaskId, runId: chain.execRunId,
      reportRef: qualityCloseBasis.value.reportRef, basisDigest: qualityCloseBasis.value.basisDigest, outcome: "accepted" }, "convener");
    assert.equal((qualityClosed as { status?: string }).status, "applied", JSON.stringify(qualityClosed));

    // 7) 真实 delivery 准备（expected old=null/candidate、criteria/evidence 来自真实 accepted quality）。
    const deliverySource = await prepareVerifiedDelivery({ projectRoot: chain.root, store: createProjectTrunkStore(chain.root),
      freezeRegistry: createGuardFreezeRegistry(chain.root, { migrationCompleted: () => true }) },
      { taskId: "w7-delivery-exec-task", runId: chain.execRunId, candidate: integrationCandidate, creatorCloseOperationId: "w7-quality-close" });
    assert.ok(deliverySource.ok, JSON.stringify(deliverySource));
    if (!deliverySource.ok) return;
    const request = { operationId: deliveryOperationId, target: "delivery" as const, expected: { ref: `refs/ans/delivery/${deliverySource.value.flowId}`, oid: null },
      candidate: integrationCandidate, criteria: [...deliverySource.value.criteria], evidence: [...deliverySource.value.evidence],
      creatorCloseOperationId: deliverySource.value.creatorCloseOperationId };

    // 8) 真实 convener `git_publish delivery`（动作时授权 + write-ahead sidecar + 单 ref 发布）。
    const published = await runtime.gitPublish(request);
    assert.equal(published.status, "published", JSON.stringify(published));
    assert.deepEqual(published.published?.ref, "refs/ans/delivery/demo");
    assert.deepEqual(published.published?.oid, integrationCandidate);

    // sidecar {publication}
    const sidecarFile = sidecarPath(chain.root, deliveryOperationId);
    const sidecarRead = await readGitActionAuthorizations(chain.root, deliveryOperationId);
    assert.equal(sidecarRead.ok, true, JSON.stringify(sidecarRead));
    if (!sidecarRead.ok) return;
    assert.equal(sidecarRead.records.length, 1);
    const record = sidecarRead.records[0]!;
    assert.equal(record.template, "publish-delivery", "delivery 模板取发布策略输入的真实来源");
    assert.equal(record.actorRoleId, "convener");
    assert.equal(record.coreSessionId, convener.sessionId!);
    assert.equal(record.taskId, "w7-delivery-exec-task");
    assert.equal(record.runId, chain.execRunId);
    assert.equal(record.turnId, deliveryTurnId, "turnId 为真实 delivery 回合");
    assert.equal(record.activeTool, "git_publish");
    assert.deepEqual(Object.keys(record.policyInputDigests), ["publication"], "R2：delivery 只有 publication digest");
    assert.match(record.policyInputDigests.publication!, /^[a-f0-9]{64}$/);
    assert.ok(record.leaseId.length > 0);
    assert.equal("applicationMediation" in (record.optionalEvidence ?? {}), false);

    // 真实 ref journal + ref + 回执
    const journal = await createGitRefStore(chain.root).readJournal(deliveryOperationId);
    assert.ok(journal, "真实 delivery ref journal 必须存在");
    if (!journal) return;
    assert.equal(journal.phase, "published");
    assert.equal(journal.ref, "refs/ans/delivery/demo");
    assert.deepEqual(journal.newOid, integrationCandidate);
    assert.equal(journal.oldOid, null, "首次 delivery 的 expected old 必须确为 null");
    assert.equal(journal.deliverySource?.candidateOperationId, integrationOperationId);
    assert.equal(journal.deliverySource?.qualityTaskId, reviewTaskId);
    const objects = createGitCandidateStore(chain.root);
    assert.deepEqual(await objects.readRef("refs/ans/delivery/demo"), integrationCandidate);
    // digest 来源独立重算（同一 Service 的 prepareDelivery + checkGitPolicy）。
    const probe = await createGitCapabilityService({ projectRoot: chain.root, context: { actorRoleId: "convener", taskId: "w7-delivery-exec-task", runId: chain.execRunId, readPaths: ["."] } }).prepareDelivery(request);
    assert.ok(probe.ok, JSON.stringify(probe));
    if (probe.ok) {
      const probeVerdict = checkGitPolicy(probe.value.policyInput);
      assert.equal(probeVerdict.allowed, true, JSON.stringify(probeVerdict));
      assert.equal(record.policyInputDigests.publication, probeVerdict.inputDigest, "sidecar publication digest 必须等于调用点 checkGitPolicy().inputDigest");
    }
    const sidecarStat = await fsp.stat(sidecarFile);
    const journalStat = await fsp.stat(path.join(chain.root, ".ans/trunk/operations", sha256(deliveryOperationId), "git.json"));
    assert.ok(sidecarStat.mtimeMs <= journalStat.mtimeMs, "authorization.jsonl 必须先于 git.json 效果写入（write-ahead）");
    assert.equal(entryOf(convener.sessionId!)?.lifecycle?.native, undefined, "Claude 桩件回合无 native facts 仍完成 delivery");
    const receiptText = JSON.stringify(published);
    for (const code of RETIRED_CODES) assert.equal(receiptText.includes(code), false, `旧/退役码不得出现：${code}`);

    await exportEvidence("ac4-claude-delivery.json", { deliveryOperationId, request: { ...request, criteria: request.criteria, evidence: request.evidence },
      published, sidecar: { path: sidecarFile, records: sidecarRead.records }, journal,
      deliveryRef: await objects.readRef("refs/ans/delivery/demo"), expectedDigestSource: probe.ok ? checkGitPolicy(probe.value.policyInput).inputDigest : undefined,
      integration: { operationId: integrationOperationId, candidate: integrationCandidate, turnId: integrationTurnId },
      quality: { taskId: reviewTaskId, path: qualityPath, closeOperationId: "w7-quality-close" } });
  } finally {
    candidateHold.release();
    publishHold.release();
    if (pumping) await pumping.catch(() => undefined);
  }
});

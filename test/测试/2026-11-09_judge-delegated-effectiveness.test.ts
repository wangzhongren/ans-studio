// test/测试/2026-11-09_judge-delegated-effectiveness.test.ts
// W-J5（2026-11-09「judge 代批生效」）：跨层真实文件链——真实 Model/Service/Store/Registry/账本/
// 快照/Git 对象（临时项目根），桩件 provider 只替代模型回合（demo adapter），不跑真实模型、
// 不启动 Electron、不占用 9222。
//
// 覆盖（方案 P1.2 §5.2 测试行、B1 v1 J15 与 AC-J1/J2/J7 的跨层面；B1 v1.1 附录 A / AC-J7b）：
//  1. judge 代批 intent-confirm：finalizeIntentConfirmation → R9 baseline `intent-confirmed`
//     + `origin:"judge-delegated"`（source 与账本 request.resolved.judge 逐字段一致、G1 不截断、
//     无 decidedBy/decisionId/actorRoleId）→ readConfirmedIntentEvidence（账本重放复核）；
//  2. 回落负例（declined/unavailable/judge 来源不符）不产生冻结（既有回落语义不变）；
//  3. judge D3（真实应用 decisionId `decision-<requestId>`）：Runtime 包装层
//     `createDirectRoleRuntime.activateRoleDocuments` 激活成功（fixture activationMode:"wrapper"；
//     prepareRoleActivation → 三文档 G 校验 → nominator preflight[d3By:"judge"] → Git/Service
//     激活发布 → ok:true/applied，W-J2b amendment）→ prepareExecutionRun/pin（freezeExecutionRun）
//     → readRunRoleContext 读取；
//  4. verifyReviewIntent 端到端（W-J2 未覆盖的证据缺口）：真实 Git candidate（worker commit →
//     accepted 收口 → convener integrate）→ prepareReviewTask/readReviewMaterial 的账本重放
//     judge 分支通过（冻结来自 judge 冻结的 trunk Git 历史，链上无 customer intent）；
//  5. Runtime 包装层正例 + 负例：judge D3 事实包（d3By:"judge"、decisionId=decision-<requestId>）
//     经包装层激活成功（不再 appointment-facts-invalid / activation-not-ready）；非法 d3-by 值
//     （model/directive/空串/非字符串）仍以 appointment-facts-invalid fail-closed（W-J2b）。
//
// 断言改写记录（B1 v1.1 附录 A.4，2026-11-09）：旧第 5 节断言 Runtime 包装层 judge D3 返回
// ok:false + appointment-facts-invalid（nominator d3-by 缺口钉住）；W-J2b 落地后该断言按设计失效，
// 由测试 owner 改写为成功正例。旧断言原文/新断言/理由/证据行见
// 角色卡/测试/docs/change/2026-11-09_WJ5_judge-delegated.md 的 amendment 节。
import assert from "node:assert/strict";
import { test, after } from "node:test";
import * as fsp from "node:fs/promises";
import path from "node:path";

import type { GitOid } from "../../src/model/trunk.ts";
import type { JudgeDelegatedSource } from "../../src/model/version-change.ts";
import { beginGitHostAction, createProjectTrunkStore, endGitHostAction } from "../../src/provider/trunk/public/trunk-store.ts";
import { createGuardFreezeRegistry, readConfirmedIntentEvidence, readOperationEvents } from "../../src/provider/version-change/public/version-change-store.ts";
import { createGitCapabilityService, createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { checkGitPolicy } from "../../src/service/gate/shell-rules.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createDirectRoleRuntime, nominatorRoleDocumentsFacts, readRunRoleContext, recordTaskObservation } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { builtInRoleModuleOf } from "../../src/service/role/resolve-role.ts";
import { FLOW_ID, PATHS } from "../编排/fixtures/trunk-project.ts";
import { AT, disposeOpenedSessions } from "./git-action-cross-runtime-fixture.ts";
import { buildWriteChain, createExecutionAssignment, disposeChainSessions } from "./git-write-chain-fixture.ts";

after(async () => { await disposeOpenedSessions(); await disposeChainSessions(); });

/** 仅当设置 ANS_WJ5_EVIDENCE_DIR 时落盘真实产物快照（正常测试运行不写盘）。 */
async function exportWj5(name: string, value: unknown): Promise<void> {
  const dir = process.env.ANS_WJ5_EVIDENCE_DIR;
  if (!dir) return;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("W-J5/J15：judge 代批 intent 冻结 → verifyReviewIntent → judge D3 经 Runtime 包装层激活 → pin/run；非法 d3-by 仍负例", { timeout: 180000 }, async () => {
  // G1：超长 reason/model 原值跨层逐字复制（不截断、不设上界）。
  const longReason = "judge-approve:" + "R".repeat(4096);
  const longModel = "claude-judge-model:" + "M".repeat(512);
  const chain = await buildWriteChain({
    prefix: "ans-wj5-judge-",
    activationMode: "wrapper",
    intentBy: "judge",
    d3By: "judge",
    judgeAudit: { engine: "claude", model: longModel, reason: longReason, reasonCode: "sufficient", selected: ["confirm"] },
  });

  // 1) R9 baseline：judge-delegated 冻结记录（源与账本逐字段一致；无客户字段；G1 不截断）。
  const integration = createVersionChangeIntegration({ projectRoot: chain.root, migrationCompleted: () => true });
  const entry = await integration.services.freeze.entryOf(PATHS.intent, 1);
  assert.ok(entry, "intent-confirmed 冻结记录必须存在");
  const freeze = entry!.freeze;
  assert.equal(freeze.schema, "doc-freeze/v1");
  assert.equal(freeze.reason, "intent-confirmed");
  assert.equal(freeze.origin, "judge-delegated");
  assert.equal(freeze.applicationId, `intent-${chain.intentRequestId}`);
  assert.equal(freeze.frozenAt, AT, "frozenAt 必须等于真实 request.resolved.at");
  assert.ok(freeze.snapshotRef, "judge 冻结必须携带真实快照引用");
  for (const key of ["decidedBy", "decisionId", "actorRoleId"] as const) {
    assert.equal(Object.prototype.hasOwnProperty.call(freeze, key), false, `judge 冻结不得携带 ${key}`);
  }
  const source = freeze.source as JudgeDelegatedSource;
  assert.equal(source.kind, "judge-delegated");
  assert.equal(source.requestId, chain.intentRequestId);
  assert.equal(source.engine, "claude");
  assert.equal(source.operatorId, "judge:claude");
  assert.equal(source.reasonCode, "sufficient");
  assert.equal(source.model, longModel, "G1：model 必须按账本原值复制（不截断）");
  assert.equal(source.reason, longReason, "G1：reason 必须按账本原值复制（不截断）");
  assert.deepEqual(source.selected, ["confirm"]);
  assert.equal(source.cardKind, "intent-confirm");
  assert.equal(source.at, AT);

  // 账本 request.resolved 与冻结 source 逐字段对账（不信任冻结记录自述）。
  const ledger = await readOperationEvents(chain.root);
  assert.equal(ledger.ok, true);
  const resolvedRows = ledger.records.filter(row => row.value.kind === "request.resolved" && row.value.requestId === chain.intentRequestId);
  assert.equal(resolvedRows.length, 1, "intent-confirm 必须恰有一条真实 request.resolved");
  const resolved = resolvedRows[0]!.value as Record<string, unknown>;
  assert.equal(resolved.by, "judge");
  assert.equal(resolved.operatorId, "judge:claude");
  assert.equal(resolved.decisionId, `decision-${chain.intentRequestId}`, "judge 的应用生成 decisionId 必须为 decision-<requestId>");
  assert.equal("actionSource" in resolved, false);
  assert.equal("directiveId" in resolved, false);
  const audit = resolved.judge as Record<string, unknown>;
  assert.equal(audit.engine, source.engine);
  assert.equal(audit.model, source.model);
  assert.equal(audit.reasonCode, source.reasonCode);
  assert.equal(audit.reason, source.reason);
  assert.deepEqual(audit.selected, source.selected);
  assert.equal(audit.cardKind, source.cardKind);
  assert.equal(resolved.at, source.at);
  // judge 冻结只写 R9 baseline，不产生 doc.freeze 事件（AC-J1-6；本轮无 judge doc.freeze producer）。
  assert.equal(ledger.records.filter(row => row.value.kind === "doc.freeze").length, 0);

  const confirmed = await readConfirmedIntentEvidence(chain.root, PATHS.intent);
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed));

  // 2) 回落负例：declined/unavailable/judge 来源不符 ⇒ 不写冻结、不抛错（既有回落语义不变）。
  const intentFreezeCount = async () => (await createGuardFreezeRegistry(chain.root, { migrationCompleted: () => true }).listFreezes())
    .filter(item => item.path === PATHS.intent && item.freeze.reason === "intent-confirmed").length;
  assert.equal(await intentFreezeCount(), 1);
  const service = createTrunkService({ projectRoot: chain.root, freezeRegistry: createGuardFreezeRegistry(chain.root, { migrationCompleted: () => true }) });
  const freshPrepared = await service.prepareIntentConfirmation(FLOW_ID);
  assert.equal(freshPrepared.ok, true, JSON.stringify(freshPrepared));
  const declined = await service.finalizeIntentConfirmation(freshPrepared.value, { outcome: "declined", reason: "judge-not-recommended" });
  assert.equal(declined.ok, false, "declined（judge 无唯一推荐/不可用回落）不得产生冻结");
  const unavailable = await service.finalizeIntentConfirmation(freshPrepared.value, { outcome: "unavailable", reason: "judge-unavailable" });
  assert.equal(unavailable.ok, false, "unavailable（判断不可用回落）不得产生冻结");
  const mismatched = await service.finalizeIntentConfirmation(freshPrepared.value, {
    outcome: "answered", value: { selected: ["confirm"] }, decisionId: `decision-${chain.intentRequestId}`, operatorId: "judge:codex",
    judge: { group: "decision", cardKind: "intent-confirm", engine: "codex", reasonCode: "sufficient", selected: ["confirm"] },
  });
  assert.equal(mismatched.ok, false, "outcome.judge 与账本 judge 审计不一致必须 fail-closed");
  if (!mismatched.ok) assert.equal(mismatched.code, "trunk-item-invalid");
  assert.equal(await intentFreezeCount(), 1, "回落/负例不得新增冻结");

  // 3) judge D3（真实应用 decisionId）+ Runtime 包装层激活正例（fixture activationMode:"wrapper"）。
  assert.equal((chain.activationReceipt as { status?: string }).status, "applied");
  const store = createProjectTrunkStore(chain.root);
  const manifest = await store.readManifest();
  assert.equal(manifest.ok, true);
  const active = manifest.ok ? manifest.value.activeRoles?.impl : undefined;
  assert.ok(active, "激活必须发布真实 active role");
  const activeBytes = active ? await store.readActiveRoleEvidence!(active) : undefined;
  assert.equal(activeBytes?.ok, true);
  const files = activeBytes?.ok ? activeBytes.value.files : [];
  const authFile = active ? files.find(file => file.path === active.authorizationRef.path) : undefined;
  assert.ok(authFile, "role-authorization/v1 证据必须存在");
  const authorization = JSON.parse(Buffer.from(authFile!.bytesBase64, "base64").toString("utf8"));
  assert.equal(authorization.schema, "role-authorization/v1");
  assert.equal(authorization.d3Source, "judge", "授权证据必须如实记 d3Source:judge");
  assert.equal(chain.d3DecisionId, `decision-${chain.d3RequestId}`);
  assert.equal(authorization.decisionId, chain.d3DecisionId, "judge D3 授权消费真实应用 decisionId（非客户 decisionId）");
  assert.equal("actionSource" in authorization, false);
  const d3File = active ? files.find(file => file.path === active.d3Ref.path) : undefined;
  assert.ok(d3File, "D3 created/resolved 字节证据必须存在");
  const d3Record = JSON.parse(Buffer.from(d3File!.bytesBase64, "base64").toString("utf8"));
  const d3Resolved = JSON.parse(Buffer.from(d3Record.resolvedBytesBase64, "base64").toString("utf8"));
  assert.equal(d3Resolved.by, "judge");
  assert.equal(d3Resolved.operatorId, "judge:claude");
  assert.equal(d3Resolved.decisionId, chain.d3DecisionId);
  assert.equal(d3Resolved.judge.group, "decision");
  assert.equal(d3Resolved.judge.cardKind, "appointment");

  // prepareExecutionRun + pin（freezeExecutionRun 内部先 prepare 后 pin；judge D3 在 run 冻结中被消费）。
  assert.equal(chain.pin.run.state, "pinned");
  assert.ok(chain.pin.run.codeBasis, "pin 必须携带真实 codeBasis");
  assert.ok(chain.pin.run.documentGitBasis, "pin 必须携带真实 documentGitBasis");
  const reprepared = await service.prepareExecutionRun({ runId: chain.execRunId, flowId: FLOW_ID, operationId: "wj5-execution-reprepare" });
  assert.equal(reprepared.ok, true, JSON.stringify(reprepared));
  if (reprepared.ok) assert.equal(reprepared.value.alreadyPinned, true);
  const runContext = await readRunRoleContext({ projectRoot: chain.root, runId: chain.execRunId, roleId: "impl" });
  assert.equal(runContext.ok, true, JSON.stringify(runContext));
  if (runContext.ok) assert.equal(runContext.documentContext.pinDigest, chain.pin.pinDigest);

  // 4) verifyReviewIntent 端到端：真实 worker commit → accepted 收口 → convener integrate →
  //    prepareReviewTask/readReviewMaterial 从冻结的 trunk Git 历史账本重放 judge 来源。
  const assignment = await createExecutionAssignment(chain, { controllerTaskId: "wj5-controller-task", workerTaskId: "wj5-worker-task" });
  assert.equal(assignment.dispatch.ok, true, JSON.stringify(assignment.dispatch));
  const content = "The actual W-J5 judge-delegated chain artifact.\n";
  await fsp.mkdir(path.join(chain.root, "src/impl"), { recursive: true });
  await fsp.writeFile(path.join(chain.root, "src/impl/result.txt"), content);
  const base = (chain.pin.run as { codeBasis: { ref: string; oid: GitOid } }).codeBasis;
  const workerService = createGitCapabilityService({ projectRoot: chain.root,
    context: { actorRoleId: "impl", taskId: "wj5-worker-task", runId: chain.execRunId, readPaths: ["."] } });
  const workerPrepared = await workerService.prepareWorkerCommit({ operationId: "wj5-worker-commit", action: "commit", base,
    paths: ["src/impl/result.txt"], message: "W-J5 worker result" });
  assert.equal(workerPrepared.ok, true, JSON.stringify(workerPrepared));
  const workerVerdict = checkGitPolicy(workerPrepared.value.policyInput);
  assert.equal(workerVerdict.allowed, true, JSON.stringify(workerVerdict));
  let workerCandidate: GitOid | undefined;
  const workerLease = beginGitHostAction({ projectRoot: chain.root, kind: "git-mutation" });
  assert.equal(workerLease.ok, true, JSON.stringify(workerLease));
  if (!workerLease.ok) return;
  try {
    const candidate = await workerService.executeWorkerCommit(workerPrepared.value, workerLease.leaseId, workerVerdict);
    assert.equal(candidate.status, "prepared", JSON.stringify(candidate));
    workerCandidate = candidate.candidate;
  } finally { endGitHostAction({ projectRoot: chain.root, leaseId: workerLease.leaseId }); }
  assert.ok(workerCandidate);
  if (!workerCandidate) return;
  assert.ok((await recordTaskObservation({ projectRoot: chain.root, event: { v: 1, at: AT, kind: "task.reported", taskId: "wj5-worker-task", from: "impl",
    status: "done", summary: "The actual worker artifact is committed", evidence: ["src/impl/result.txt", `Git candidate ${workerCandidate.objectFormat}:${workerCandidate.hex}`] } })).ok);
  const closeBasis = await chain.service.prepareCreatedTaskClose("wj5-worker-task", "convener");
  assert.equal(closeBasis.ok, true, JSON.stringify(closeBasis));
  if (!closeBasis.ok) return;
  const closed = await chain.service.closeCreatedTask({ operationId: "wj5-worker-close", taskId: "wj5-worker-task", runId: chain.execRunId,
    reportRef: closeBasis.value.reportRef, basisDigest: closeBasis.value.basisDigest, outcome: "accepted" }, "convener");
  assert.equal((closed as { status?: string }).status, "applied", JSON.stringify(closed));

  const convenerService = createGitCapabilityService({ projectRoot: chain.root,
    context: { actorRoleId: "convener", taskId: "wj5-controller-task", runId: chain.execRunId, readPaths: ["."] } });
  const integrationPrepared = await convenerService.prepareIntegration({ operationId: "wj5-integration", action: "integrate", base,
    candidates: [workerCandidate], message: "W-J5 final integration" });
  assert.equal(integrationPrepared.ok, true, JSON.stringify(integrationPrepared));
  if (!integrationPrepared.ok) return;
  const integrationVerdict = checkGitPolicy(integrationPrepared.value.policyInput);
  assert.equal(integrationVerdict.allowed, true, JSON.stringify(integrationVerdict));
  let integrationCandidate: GitOid | undefined;
  const integrationLease = beginGitHostAction({ projectRoot: chain.root, kind: "git-mutation" });
  assert.equal(integrationLease.ok, true, JSON.stringify(integrationLease));
  if (!integrationLease.ok) return;
  try {
    const integrated = await convenerService.executeWorkerCommit(integrationPrepared.value, integrationLease.leaseId, integrationVerdict);
    assert.equal(integrated.status, "prepared", JSON.stringify(integrated));
    integrationCandidate = integrated.candidate;
  } finally { endGitHostAction({ projectRoot: chain.root, leaseId: integrationLease.leaseId }); }
  assert.ok(integrationCandidate);
  if (!integrationCandidate) return;
  // 该链唯一的 intent-confirmed 冻结是 judge-delegated（无 customer/chief intent）；prepareReviewTask
  // 成功 ⇒ verifyReviewIntent 的 judge 分支已从冻结 Git 历史 + 账本重放逐字段通过（含 G1 超长原值）。
  const review = await chain.service.prepareReviewTask({ parentTaskId: "wj5-controller-task", flowId: FLOW_ID, runId: chain.execRunId,
    target: { operationId: "wj5-integration", candidate: integrationCandidate } });
  assert.equal(review.ok, true, JSON.stringify(review));

  // 5) W-J2b amendment（B1 v1.1 附录 A / AC-J7b）：judge D3 经 Runtime 包装层
  //    `createDirectRoleRuntime.activateRoleDocuments` 成功。本链激活本身经包装层执行
  //    （fixture activationMode:"wrapper"）：prepareRoleActivation → 三文档 G 校验 → nominator
  //    preflight（d3By:"judge"）→ Git 激活发布（真实 actor 证明/授权/lease/CAS）→ ok:true/applied，
  //    并完成真实直投记账（recordDirectDelivery）。旧断言（ok:false + appointment-facts-invalid）
  //    已按 A.4 改写为成功正例（旧/新断言原文与理由见 W-J5 记录 amendment 节）。
  const activation = chain.activationReceipt as { ok?: boolean; status?: string; errorCode?: string; message?: string;
    source?: { kind?: string; action?: string; actorRoleId?: string; operationId?: string }; activationDigest?: string; targetDigest?: string };
  assert.equal(activation.ok, true, JSON.stringify(activation));
  assert.equal(activation.status, "applied", JSON.stringify(activation));
  assert.equal("errorCode" in activation ? activation.errorCode : undefined, undefined, "不得再返回 activation-not-ready/appointment-facts-invalid");
  assert.doesNotMatch(String(activation.message ?? ""), /appointment-facts-invalid|activation-not-ready/);
  assert.equal(activation.source?.kind, "role-direct");
  assert.equal(activation.source?.action, "activate-role-documents");
  assert.equal(activation.source?.actorRoleId, "nominator");
  assert.equal(activation.source?.operationId, String(chain.activationInput.operationId));
  assert.match(activation.activationDigest ?? "", /^[a-f0-9]{64}$/);
  // 直投：包装层向 chief/convener/nominator 三收件人真实记账（幂等键含 operationId）。
  assert.deepEqual((chain.activationNotifications ?? []).map(item => item.recipientRoleId).sort(), ["chief", "convener", "nominator"]);
  assert.ok((chain.activationNotifications ?? []).every(item => item.key.includes(String(chain.activationInput.operationId))));

  // 事实包如实携带 judge D3（d3By:"judge"、真实应用 decisionId）——preflight 的输入即本链冻结的 D3。
  const replayPrepared = await chain.service.prepareRoleActivation(chain.activationInput as never, "nominator");
  assert.equal(replayPrepared.ok, true, JSON.stringify(replayPrepared));
  if (!replayPrepared.ok) return;
  const facts = nominatorRoleDocumentsFacts(replayPrepared.value);
  assert.ok(facts, "nominator role-documents 事实包必须可构造");
  if (!facts) return;
  assert.equal(facts.d3By, "judge");
  assert.equal(facts.d3DecisionId, chain.d3DecisionId);

  // 非法 d3-by 值仍 fail-closed：以真实事实包为底，仅替换 d3By（model/directive/空串/非字符串）。
  const nominatorPreflight = builtInRoleModuleOf("nominator")?.preflight;
  assert.ok(nominatorPreflight, "nominator preflight 必须装配");
  if (!nominatorPreflight) return;
  const positiveDecision = nominatorPreflight.checkAction({ action: "appointment", facts });
  const negativeResults = (["model", "directive", "", 42] as const).map(value => {
    const decision = nominatorPreflight.checkAction({ action: "appointment", facts: { ...facts, d3By: value } });
    return { d3By: value, allow: decision.allow, code: decision.allow ? undefined : decision.code,
      messageKey: decision.allow ? undefined : decision.messageKey };
  });
  for (const result of negativeResults) {
    assert.equal(result.allow, false, `d3By=${JSON.stringify(result.d3By)} 必须被拒绝`);
    assert.equal(result.code, "appointment-facts-invalid");
    assert.equal(result.messageKey, "role.nominator.preflight.factsInvalid");
  }
  assert.equal(positiveDecision.allow, true, JSON.stringify(positiveDecision));

  // 幂等：同一已提交激活经包装层重放 ⇒ 仍 ok/applied；首次已记账的直投不得重复发送。
  const replayNotifications: Array<{ key: string; recipientRoleId: string }> = [];
  const runtimeReplay = createDirectRoleRuntime({ projectRoot: chain.root, actorRoleId: "nominator",
    notifyDirect: async item => { replayNotifications.push({ key: item.key, recipientRoleId: item.recipientRoleId }); } });
  const replayedActivation = await runtimeReplay.activateRoleDocuments(chain.activationInput as never);
  assert.equal(replayedActivation.ok, true, JSON.stringify(replayedActivation));
  assert.equal(replayedActivation.status, "applied", JSON.stringify(replayedActivation));
  assert.equal(replayNotifications.length, 0, "已记账直投不得重复发送");

  await exportWj5("wj5-main-freeze.json", { freeze, resolved, authorization, d3Resolved,
    runtimeActivation: { ok: activation.ok, status: activation.status, errorCode: activation.errorCode, message: activation.message,
      source: activation.source, activationDigest: activation.activationDigest, targetDigest: activation.targetDigest },
    activationNotifications: chain.activationNotifications ?? [],
    nominatorFacts: { stage: facts.stage, d3By: facts.d3By, d3DecisionId: facts.d3DecisionId, decisionIdMatches: facts.d3DecisionId === chain.d3DecisionId },
    d3ByNegatives: negativeResults, d3ByPositive: { allow: positiveDecision.allow } });
});

// test/桌面应用/decision-service.test.ts
// C 批（2026-10-28）：应用申请/决策服务——两开关独立、decision 唯一推荐 deterministic 代选/回落；
// 应用自有 decision 卡不扩大角色允许集；judge 审计不伪装客户。
// 2026-11-04 客户直修：judge「无法核对」类 manual 不自动拒绝（原卡转客户确认）；同卡指纹自动拒绝只发生一次。
// 2026-11-04 客户直修（run-change/版本决策）：开启「替我决策」时这两类应用自有 decision 卡仍必须呈现客户，不代选。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCustomerInputChannel, evaluateDecisionCardRequest, type OperatorJudgeResultPayload, type OperatorRequestPayload, type ChiefDecisionHost } from "../../app/desktop/customer-input.ts";
import { mainT } from "../../app/desktop/i18n.ts";
import { createDecisionDelegationSwitch } from "../../app/desktop/interface.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createHash } from "node:crypto";
import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { buildRunChangeCard } from "../../src/common/编排/run-manifest.ts";
import { buildVersionDecisionCard, versionDecisionCardToRequest } from "../../src/common/编排/version-decision.ts";
import type {
  CustomerInputMetadata,
  CustomerInputRequest,
  GovernanceJudgeFn,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
} from "../../src/model/runtime.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

function appDecisionRequest(recommendedCount = 1): CustomerInputRequest {
  const options = [
    { id: "continue", label: "继续" },
    { id: "redispatch", label: "重派", ...(recommendedCount > 1 ? { recommended: true } : {}) },
    { id: "replace", label: "换人" },
    { id: "terminate", label: "终止", ...(recommendedCount >= 1 ? { recommended: true } : {}) },
  ];
  return { kind: "choice", title: "任务升级", cardKind: "decision", application: true, sourceRoleId: "application", flowId: "task-escalation", options };
}

function channelHarness(
  groupEnabled: boolean,
  opts: {
    emitFails?: boolean;
    /** 注入的 judge 结果工厂（缺省按 request 回显 group/cardKind；既有用例不依赖 judge 返回值）。 */
    judge?: (request: GovernanceJudgeRequest) => GovernanceJudgeOutcome;
  } = {},
) {
  const pushed: OperatorRequestPayload[] = [];
  const results: OperatorJudgeResultPayload[] = [];
  let n = 0;
  let judgeCalls = 0;
  const judge: GovernanceJudgeFn = async (request) => {
    judgeCalls += 1;
    if (opts.judge !== undefined) return opts.judge(request);
    return {
      verdict: "approve",
      group: request.group,
      cardKind: request.cardKind,
      engine: request.runtime,
      model: "judge-model",
      reasonCode: "recommended-default",
      selected: ["terminate"],
      durationMs: 1,
    };
  };
  const delegation = createDecisionDelegationSwitch(groupEnabled);
  const channel = createCustomerInputChannel({
    delegation,
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    judge: { isGroupEnabled: () => groupEnabled, fn: judge },
    emitJudgeResult: (payload) => {
      if (opts.emitFails === true) throw new Error("结果行投达失败");
      results.push(payload);
    },
  });
  return { channel, pushed, results, delegation, judgeCalls: () => judgeCalls };
}

const ctx = { roleId: "application", projectRoot: "/p", runtime: "demo" as const, governanceModel: "trio" as const };

test("decision 开关关闭：应用 decision 卡呈现客户，客户手选；无 judge 审计", async () => {
  const h = channelHarness(false);
  const pending = h.channel.customerInput(appDecisionRequest(), ctx);
  assert.equal(h.pushed.length, 1, "开关关闭 ⇒ 原卡呈现");
  assert.equal(h.results.length, 0);
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["redispatch"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["redispatch"]);
  assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined);
});

test("开启委托但无真实chief上下文：保留原因，禁人工/旧judge/默认推荐；关闭后接管", async () => {
  const h = channelHarness(true);
  const pending = h.channel.customerInput(appDecisionRequest(), ctx);
  await tick();
  assert.equal(h.judgeCalls(), 0);
  assert.equal(h.results.length, 0);
  assert.match(h.pushed[0]!.judgeNotice ?? "", /幕僚/);
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["redispatch"] } }).ok, false);
  h.delegation.set({ enabled: false });
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["redispatch"] } }).ok, true);
  const out = await pending;
  assert.equal(out?.outcome === "answered" ? out.operatorId : "", "tester");
});

test("无chief时不以旧结果行充当业务决定", async () => {
  const h = channelHarness(true, { emitFails: true });
  const pending = h.channel.customerInput(appDecisionRequest(), ctx);
  await tick(); h.delegation.set({ enabled: false });
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["continue"] } }).ok, true);
  assert.equal((await pending)?.outcome, "answered");
  assert.equal(h.judgeCalls(), 0);
});

test("应用自有 decision 卡通过共享校验且不扩大角色允许集；非法推荐数/非应用 chief 仍拒", () => {
  const own = evaluateDecisionCardRequest({ request: appDecisionRequest(), roleId: "application", governanceModel: "trio" });
  assert.equal(own.action, "allow");
  if (own.action === "allow") assert.equal(own.recommendedOptionId, "terminate");

  const bad = evaluateDecisionCardRequest({ request: appDecisionRequest(2), roleId: "application", governanceModel: "trio" });
  assert.equal(bad.action, "reject");
  assert.equal(bad.action === "reject" ? bad.reasonCode : "", "recommended-count");

  const roleOwned = evaluateDecisionCardRequest({ request: { ...appDecisionRequest(), application: undefined, sourceRoleId: undefined }, roleId: "chief", governanceModel: "trio" });
  assert.equal(roleOwned.action, "reject", "chief 不得借应用标志/角色槽位发 decision 卡");
});

// ———————————————— 2026-11-04 客户直修：无法核对升级 / 自动拒绝去重 ————————————————

function proposalRequest(): CustomerInputRequest {
  return {
    kind: "choice",
    title: "确认方案：focus",
    cardKind: "proposal",
    flowId: "focus",
    sourceRoleId: "rapporteur",
    options: [
      { id: "accept", label: "通过" },
      { id: "reject", label: "拒绝" },
    ],
  };
}

const proposalCtx = { roleId: "rapporteur", projectRoot: "/p", runtime: "demo" as const, governanceModel: "trio" as const };
const proposalMetadata: CustomerInputMetadata = {
  cardKind: "proposal",
  judgeContext: {
    flowId: "focus",
    facts: { governanceModel: "trio", flowId: "focus", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
  },
};
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// The model boundary is scripted; real Pipeline, Runtime Service, tools and channel settlement run.
async function realChiefHost(root: string, selected: string[] | "reject" | "revise", hooks: {
  beforeModel?: () => Promise<void>; current?: () => Promise<boolean>; noDecision?: boolean;
} = {}): Promise<ChiefDecisionHost> {
  const evidencePath = path.join(root, "evidence.md");
  await fs.writeFile(evidencePath, "# Confirmed objective\nRecover using the second option.\n");
  const hash = () => fs.readFile(evidencePath).then(bytes => createHash("sha256").update(bytes).digest("hex"));
  const evidenceSha = await hash();
  const captured = await createFsTrunkStore(root).captureSnapshot!({ snapshotId: "chief-fixture", createdAt: "2026-11-05T00:00:00.000Z", files: [{ path: "evidence.md", sha256: evidenceSha }] });
  assert.ok(captured.ok, captured.ok ? "" : captured.message ?? captured.reason);
  const base = captured.value.digest;
  return {
    prepare: async () => ({ baseDigest: base, evidenceRefs: [{ snapshotId: captured.value.snapshotId, path: "evidence.md", sha256: evidenceSha }],
      context: await fs.readFile(evidencePath, "utf8"), isCurrent: hooks.current ?? (async () => (await hash()) === evidenceSha) }),
    execute: async (context, evidence, decidePendingRequest, signal) => {
      const handle = await openRoleSession({ roleId: "chief", runtime: "demo", project: { projectRoot: root,
        skillRoot: root, roles: {}, builtInRoles: ["chief"], governanceModel: "trio" },
        chiefDecisionContext: context, decidePendingRequest }, { runtimeOptions: { providerFactories: {
          demo: async options => {
            assert.deepEqual(options.tools.map(tool => tool.name), ["decide_pending_request"]);
            assert.equal(options.storage, undefined);
            await hooks.beforeModel?.();
            return createDemoRuntimeAdapter(options, hooks.noDecision ? [] : [{ name: "decide_pending_request", args: {
              requestId: context.request.requestId, baseDigest: context.request.baseDigest,
              delegationRevision: context.request.delegationRevision, reason: "证据支持替代方案",
              ...(Array.isArray(selected) ? { disposition: "select", selected } : { disposition: selected }),
            } }]);
          },
        } } });
      const cancel = () => { void handle.abort?.(); };
      signal.addEventListener("abort", cancel, { once: true });
      try { await handle.send(evidence); } finally { signal.removeEventListener("abort", cancel); await handle.dispose(); }
    },
  };
}
async function withChiefRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-window-chief-"));
  try { await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test("真实chief独立上下文可选非推荐项，结果可信来源且不伪装客户/judge", async () => {
  await withChiefRoot(async root => {
    const h = channelHarness(true);
    const host = await realChiefHost(root, ["redispatch"]);
    const out = await h.channel.customerInput(appDecisionRequest(), { ...ctx, projectRoot: root, chiefDecision: host });
    assert.equal(out?.outcome, "answered");
    if (out?.outcome !== "answered") return;
    assert.deepEqual(out.value.selected, ["redispatch"]);
    assert.equal(out.operatorId, "chief"); assert.equal(out.judge, undefined);
    assert.equal(out.actionSource?.kind, "chief-delegated");
    if (out.actionSource?.kind === "chief-delegated") {
      assert.equal(out.actionSource.actorRoleId, "chief"); assert.equal(out.actionSource.originRoleId, "application");
      assert.equal(out.actionSource.delegationRevision, h.delegation.get().revision);
      assert.deepEqual(out.actionSource.selected, ["redispatch"]);
    }
    assert.equal(h.judgeCalls(), 0); assert.equal(h.pushed.length, 0);
    assert.equal(h.results[0]?.reasonCode, "chief-delegated");
    assert.equal(h.results[0]?.actionSource?.kind, "chief-delegated");
  });
});

test("真实chief拒绝/退修释放原工具Promise，原角色补材后新请求可独立决定", async () => {
  await withChiefRoot(async root => {
    const rejecting = channelHarness(true);
    const reject = await rejecting.channel.customerInput(proposalRequest(), { ...proposalCtx, chiefDecision: await realChiefHost(root, "reject") }, proposalMetadata);
    assert.equal(reject?.outcome, "declined");
    assert.equal(reject?.outcome === "declined" ? reject.actionSource?.kind : undefined, "chief-delegated");
    const revising = channelHarness(true);
    const returned = await revising.channel.customerInput(proposalRequest(), { ...proposalCtx, chiefDecision: await realChiefHost(root, "revise") }, proposalMetadata);
    assert.equal(returned?.outcome, "declined", "原工具调用已得到typed退回，可继续补材");
    assert.equal(returned?.outcome === "declined" ? returned.reason : undefined, `证据支持替代方案 ${mainT("main.customerInput.chief.revisionRequested")}`);
    assert.equal(returned?.outcome === "declined" && returned.actionSource?.kind === "chief-delegated" ? returned.actionSource.disposition : undefined, "revise");
    assert.equal(revising.channel.pendingCount(), 0);
    const revised = { ...proposalRequest(), title: "修订方案：补齐证据" };
    const next = await revising.channel.customerInput(revised, { ...proposalCtx, chiefDecision: await realChiefHost(root, ["accept"]) }, proposalMetadata);
    assert.equal(next?.outcome, "answered");
    assert.deepEqual(next?.outcome === "answered" ? next.value.selected : undefined, ["accept"]);
    assert.equal(revising.delegation.get().enabled, true, "不依赖客户关闭再开关救场");
  });
});

test("关闭再开启使在途真实chief旧revision无效；同请求不会无限自派", async () => {
  await withChiefRoot(async root => {
    let release!: () => void, modelEntered!: () => void;
    const entered = new Promise<void>(resolve => { modelEntered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const h = channelHarness(true);
    const host = await realChiefHost(root, ["redispatch"], { beforeModel: async () => { modelEntered(); await held; } });
    const pending = h.channel.customerInput(appDecisionRequest(), { ...ctx, chiefDecision: host });
    await entered;
    const revision = h.delegation.get().revision;
    h.delegation.set({ enabled: false });
    h.delegation.set({ enabled: true });
    assert.ok(h.delegation.get().revision > revision);
    release(); await tick(); await tick();
    assert.equal(h.results.length, 0);
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["continue"] } }).ok, false);
    h.delegation.set({ enabled: false });
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["continue"] } }).ok, true);
    const out = await pending;
    assert.equal(out?.outcome === "answered" ? out.actionSource : undefined, undefined);
  });
});

test("真实chief提交时基线变化拒绝，原请求等待关闭接管", async () => {
  await withChiefRoot(async root => {
    const h = channelHarness(true);
    const pending = h.channel.customerInput(appDecisionRequest(), { ...ctx, chiefDecision: await realChiefHost(root, ["redispatch"], { current: async () => false }) });
    for (let n = 0; n < 100 && h.pushed.length === 0; n++) await tick();
    assert.equal(h.results.length, 0);
    assert.equal(h.channel.pendingCount(), 1);
    h.delegation.set({ enabled: false });
    h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["replace"] } });
    assert.equal((await pending)?.outcome, "answered");
  });
});

test("业务卡的旧@决策预设不能形成第三个自动执行者", async () => {
  let directiveCalls = 0;
  const pushed: OperatorRequestPayload[] = [];
  const mode = createDecisionDelegationSwitch(false);
  const channel = createCustomerInputChannel({ operatorId: "customer", presenter: payload => pushed.push(payload), delegation: mode,
    directive: { decisionFacts: () => { directiveCalls++; throw new Error("must not enter"); },
      applyDecisionDirective: async () => { directiveCalls++; return undefined; }, emitResult() {}, emitNotice() {} } });
  const pending = channel.customerInput(appDecisionRequest(), ctx);
  assert.equal(directiveCalls, 0); assert.equal(pushed.length, 1);
  channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["replace"] } });
  assert.equal((await pending)?.outcome, "answered");
});

// ———————————————— 2026-11-04 客户直修：应用自有 decision 卡不被「替我决策」代选 ————————————————
//
// 客户原话：「现在点击会被替我决策给拦住啊」（run-change 三模式卡被代选为继续冻结）、
// 「新建版本，修改版本，这个必须弹出客户确认。不能自动替我待批。」（版本决策卡）。
// 判据（app/desktop/customer-input.ts::isApplicationDecisionReservedForCustomer）：
// application:true + cardKind:"decision" + run-change/版本决策的冻结选项词汇。

function runChangeRequest(): CustomerInputRequest {
  return buildRunChangeCard({
    runId: "run-20261104-focus-abcdef12",
    flowId: "focus",
    requestId: "run-change-run-20261104-focus-abcdef12",
    current: { state: "pinned", documents: {}, schemas: {} },
  }).request;
}

function versionDecisionRequest(action: "version-modify" | "new-version-development"): CustomerInputRequest {
  const card = buildVersionDecisionCard({
    requestId: `version-decision-run-20261104-focus-abcdef12-${action}`,
    flowId: "focus",
    action,
    reason: "客户直修回归",
    facts: {
      flowId: "focus",
      unclosedCount: 0,
      blockedCount: 0,
      failedCount: 0,
      pendingRequestCount: 0,
      acceptanceRejectedCount: 0,
      priorVersionDecisionCount: 0,
      latestDocs: [],
      newerThanPinned: [],
    },
    labels: {
      title: "版本决策",
      question: "请选择版本路线",
      disclaimer: "本卡不是内容批准",
      optionVersionModify: "修改版本",
      optionNewVersionDevelopment: "新建版本开发",
    },
  });
  return versionDecisionCardToRequest(card);
}

/** 角色（convener）发行的普通 decision 卡（非 application）；共享校验允许的发卡角色。 */
function roleDecisionRequest(): CustomerInputRequest {
  return {
    kind: "choice",
    title: "材料性选择",
    cardKind: "decision",
    sourceRoleId: "convener",
    flowId: "focus",
    options: [
      { id: "alpha", label: "方案 A" },
      { id: "beta", label: "方案 B", recommended: true },
    ],
  };
}

const convenerCtx = { ...ctx, roleId: "convener" };

test("2026-11-04 直修 (a)：替我决策开启 ⇒ run-change 卡呈现客户、作答前不结算、无 judge 代批", async () => {
  const h = channelHarness(true);
  let settled = false;
  const pending = h.channel.customerInput(runChangeRequest(), ctx);
  Promise.resolve(pending).then(() => {
    settled = true;
  });
  await tick();
  assert.equal(h.pushed.length, 1, "run-change 卡必须原卡呈现客户");
  assert.equal(h.results.length, 0, "不得产生 judge 代批结果行/审计");
  assert.equal(settled, false, "客户作答前不得结算");
  assert.equal(h.judgeCalls(), 0, "decision 卡不经模型 judge（更不得自动代批）");
  const card = h.pushed[0]!.request as Extract<CustomerInputRequest, { kind: "choice" }>;
  assert.equal((card as { cardKind?: string }).cardKind, "decision");
  assert.equal((card as { application?: boolean }).application, true);
  assert.deepEqual(card.options.map((option) => option.id), ["continue-frozen", "stop-and-restart", "stop"]);
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["stop-and-restart"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["stop-and-restart"]);
  assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester", "客户本人作答（通道 operator），不是 judge");
  assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined);
});

test("2026-11-04 直修 (b)：run-change 三模式分别由客户选择后原样结算", async () => {
  for (const mode of ["continue-frozen", "stop-and-restart", "stop"] as const) {
    const h = channelHarness(true);
    const pending = h.channel.customerInput(runChangeRequest(), ctx);
    await tick();
    assert.equal(h.pushed.length, 1, `${mode}: 原卡呈现`);
    assert.equal(h.results.length, 0, `${mode}: 无 judge 代批结果行`);
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: [mode] } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, [mode]);
    assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester");
    assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined);
  }
});

test("2026-11-04 直修 (b)：版本决策两动作均呈现客户、不代选；客户选择后原样交回", async () => {
  for (const action of ["version-modify", "new-version-development"] as const) {
    const h = channelHarness(true);
    let settled = false;
    const pending = h.channel.customerInput(versionDecisionRequest(action), ctx);
    Promise.resolve(pending).then(() => {
      settled = true;
    });
    await tick();
    assert.equal(h.pushed.length, 1, `${action}: 版本决策卡必须呈现客户`);
    assert.equal(h.results.length, 0, `${action}: 无 judge 代批结果行`);
    assert.equal(settled, false, `${action}: 客户作答前不得结算`);
    const card = h.pushed[0]!.request as Extract<CustomerInputRequest, { kind: "choice" }>;
    assert.deepEqual(card.options.map((option) => option.id), ["version-modify", "new-version-development"]);
    assert.deepEqual(
      card.options.filter((option) => option.recommended === true).map((option) => option.id),
      [action],
      "推荐项仍是幕僚行动作（仅供参考，必须由客户决定）",
    );
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: [action] } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, [action]);
    assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester");
    assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined);
  }
});

test("普通角色decision与应用decision同样禁用旧推荐兜底", async () => {
  const h = channelHarness(true);
  const pending = h.channel.customerInput(roleDecisionRequest(), { ...ctx, roleId: "convener" });
  await tick();
  assert.equal(h.results.length, 0); assert.equal(h.judgeCalls(), 0);
  h.delegation.set({ enabled: false });
  h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["alpha"] } });
  const out = await pending;
  assert.equal(out?.outcome, "answered");
  assert.deepEqual(out?.outcome === "answered" ? out.value.selected : undefined, ["alpha"]);
});

test("2026-11-04 直修 (d)：开关关闭时 run-change / 版本决策卡行为与现状一致（原卡呈现、客户手选、无 judge）", async () => {
  for (const request of [runChangeRequest(), versionDecisionRequest("version-modify")]) {
    const h = channelHarness(false);
    const pending = h.channel.customerInput(request, ctx);
    await tick();
    assert.equal(h.pushed.length, 1);
    assert.equal(h.results.length, 0);
    const card = h.pushed[0]!.request as Extract<CustomerInputRequest, { kind: "choice" }>;
    const pick = card.options[0]!.id;
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: [pick] } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, [pick]);
    assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester");
    assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined);
  }
});

// ———————————————— 2026-11-04 客户直修：治理写卡（appointment-write）＝客户主权 ————————————————

function appointmentWriteRequest(): CustomerInputRequest {
  return {
    kind: "confirm",
    title: "写角色卡 worker",
    cardKind: "appointment-write",
    flowId: "focus",
    paths: ["角色卡/worker/role-card.md"],
    preview: "## 角色卡/worker/role-card.md\n# worker\n",
  };
}

const writeCtx = { roleId: "nominator", projectRoot: "/p", runtime: "demo" as const, governanceModel: "trio" as const };
const writeMetadata: CustomerInputMetadata = {
  cardKind: "appointment-write",
  flowId: "focus",
  judgeContext: {
    flowId: "focus",
    facts: {
      governanceModel: "trio",
      flowId: "focus",
      ledgerErrors: 0,
      unresolvedClarificationCount: 0,
      latestDecisionKinds: [],
      appointmentTargetRoleIds: ["worker"],
    },
  },
};

test("2026-11-04 直修 (a)：替我审批开启 + appointment-write ⇒ 呈现客户、judge 0 调用、0 结果行、无 judge 审计", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ans-appointment-write-sovereign-"));
  configureDiagnostics({ directory });
  try {
    const h = channelHarness(true, {
      judge: (request) => ({
        verdict: "approve",
        group: request.group,
        cardKind: request.cardKind,
        engine: request.runtime,
        reasonCode: "sufficient",
        reason: "可写",
        value: { confirmed: true },
      }),
    });
    let settled = false;
    const pending = h.channel.customerInput(appointmentWriteRequest(), writeCtx, writeMetadata);
    Promise.resolve(pending).then(() => {
      settled = true;
    });
    await tick();
    assert.equal(h.pushed.length, 1, "写卡必须原卡呈现客户");
    assert.equal(h.judgeCalls(), 0, "appointment-write 永不调用判断器（即使开关开启）");
    assert.equal(h.results.length, 0, "不得产生 judge 结果行");
    assert.equal(settled, false, "客户作答前卡保持挂起");
    assert.equal(h.channel.judgingCount(), 0, "不进入判断中状态");
    await flushDiagnostics();
    const files = (await fs.readdir(directory)).filter((name) => name.startsWith("ans-diagnostics-") && name.endsWith(".jsonl"));
    const rows = files.flatMap((name) =>
      readFileSync(path.join(directory, name), "utf8")
        .trim()
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    );
    assert.equal(
      rows.filter((row) => typeof row.event === "string" && row.event.startsWith("governance-judge.")).length,
      0,
      "不写任何 judge 审计事件",
    );
    assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "confirm", confirmed: true } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester", "客户本人确认（通道 operator）");
    assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined, "无 judge 审计字段");
  } finally {
    await disposeDiagnostics();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("2026-11-04 直修 (b)：替审批关闭 + appointment-write ⇒ 呈现客户；客户拒绝语义不变", async () => {
  const h = channelHarness(false);
  const pending = h.channel.customerInput(appointmentWriteRequest(), writeCtx, writeMetadata);
  await tick();
  assert.equal(h.pushed.length, 1, "写卡呈现客户");
  assert.equal(h.judgeCalls(), 0, "不调用判断器");
  assert.equal(h.results.length, 0);
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "confirm", confirmed: false } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "declined");
  assert.equal(outcome?.outcome === "declined" ? outcome.operatorId : undefined, "tester");
  assert.match(outcome?.outcome === "declined" ? outcome.reason ?? "" : "", /客户不同意/);
  assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, undefined, "客户已看到卡并拒绝");
});

test("2026-11-04 直修 (c)：普通 confirm 卡在开关开启时行为不变（呈现客户、不调 judge）", async () => {
  const h = channelHarness(true);
  const pending = h.channel.customerInput({ kind: "confirm", title: "继续执行？" }, writeCtx);
  await tick();
  assert.equal(h.pushed.length, 1, "普通确认卡照旧呈现客户");
  assert.equal(h.judgeCalls(), 0, "无 cardKind 的普通卡不判断");
  assert.equal(h.results.length, 0);
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "confirm", confirmed: true } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester");
});

test("2026-11-04 直修 (d)：无 presenter ⇒ appointment-write 与治理卡均 unavailable（fail-closed 不变）", async () => {
  let judgeCalls = 0;
  const channel = createCustomerInputChannel({
    operatorId: "tester",
    judge: {
      isGroupEnabled: () => true,
      fn: async () => {
        judgeCalls += 1;
        throw new Error("不应调用判断器");
      },
    },
  });
  const write = await channel.customerInput(appointmentWriteRequest(), writeCtx, writeMetadata);
  assert.equal(write?.outcome, "unavailable");
  const proposal = await channel.customerInput(proposalRequest(), proposalCtx, proposalMetadata);
  assert.equal(proposal?.outcome, "unavailable");
  assert.equal(judgeCalls, 0);
});

test("2026-11-04 直修 (e)：判断器异常与 ledger-unavailable 分支对写卡不再可达——仍原卡呈现客户", async () => {
  const throwing = channelHarness(true, {
    judge: () => {
      throw new Error("judge unavailable");
    },
  });
  let settled = false;
  const pending = throwing.channel.customerInput(appointmentWriteRequest(), writeCtx, writeMetadata);
  Promise.resolve(pending).then(() => {
    settled = true;
  });
  await tick();
  assert.equal(throwing.pushed.length, 1, "判断器异常也不改变写卡呈现");
  assert.equal(throwing.judgeCalls(), 0, "写卡不调用判断器");
  assert.equal(throwing.results.length, 0);
  assert.equal(settled, false);
  assert.equal(throwing.channel.respond({ id: throwing.pushed[0]!.id, decision: { kind: "confirm", confirmed: true } }).ok, true);
  assert.equal((await pending)?.outcome, "answered");

  const ledger = channelHarness(true);
  const metadata: CustomerInputMetadata = {
    ...writeMetadata,
    judgeContext: {
      ...writeMetadata.judgeContext!,
      unavailableReason: "账本损坏：无法读取治理事实",
    },
  };
  let ledgerSettled = false;
  const ledgerPending = ledger.channel.customerInput(appointmentWriteRequest(), writeCtx, metadata);
  Promise.resolve(ledgerPending).then(() => {
    ledgerSettled = true;
  });
  await tick();
  assert.equal(ledger.pushed.length, 1, "账本不可用也呈现客户");
  assert.equal(ledger.judgeCalls(), 0);
  assert.equal(ledger.results.length, 0);
  assert.equal(ledgerSettled, false);
  assert.equal(ledger.channel.respond({ id: ledger.pushed[0]!.id, decision: { kind: "confirm", confirmed: true } }).ok, true);
  const ledgerOutcome = await ledgerPending;
  assert.equal(ledgerOutcome?.outcome, "answered");
  assert.equal(ledgerOutcome?.outcome === "answered" ? ledgerOutcome.operatorId : undefined, "tester");
});



test("同真实requestId并发/重试复用一次结算，关闭不撤已提交来源，换origin/卡面拒绝", async () => {
  await withChiefRoot(async root => {
    const h = channelHarness(true);
    const host = await realChiefHost(root, ["redispatch"]);
    let executions = 0;
    const counted: ChiefDecisionHost = { ...host, execute(...args) { executions++; return host.execute(...args); } };
    const trusted = { ...ctx, requestId: "req-exact-once", chiefDecision: counted };
    const first = h.channel.customerInput(appDecisionRequest(), trusted);
    const duplicate = h.channel.customerInput(appDecisionRequest(), trusted);
    assert.equal(first, duplicate);
    const settled = await first;
    assert.equal(executions, 1); assert.equal(h.results.length, 1);
    h.delegation.set({ enabled: false });
    const replay = await h.channel.customerInput(appDecisionRequest(), trusted);
    assert.equal(replay, settled, "已提交source不因关开关而撤销/改归客户");
    assert.equal(replay?.outcome === "answered" ? replay.actionSource?.kind : undefined, "chief-delegated");
    const changedOrigin = await h.channel.customerInput(appDecisionRequest(), { ...trusted, roleId: "convener" });
    assert.equal(changedOrigin?.outcome, "unavailable");
    const changedCard = await h.channel.customerInput({ ...appDecisionRequest(), title: "another card" }, trusted);
    assert.equal(changedCard?.outcome, "unavailable");
    assert.equal(executions, 1);
  });
});

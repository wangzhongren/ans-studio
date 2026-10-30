// test/桌面应用/optional-acceptance.test.ts
// F 批（2026-10-28 entry-role-minimal 终态）：**验收调度可选项**（方案 §8.1–§8.4 / P7 / F-03）。
//
// 新系统语义：
//   · 验收由**幕僚调度**——chief 可自行核对（role_status），也可把 `review` 任务派给质检/交付角色；
//   · 验收**申请**由发起角色（质检/交付角色）直接提交，应用按客户/判断 agent 的裁决结算；
//   · **不要求每次独立验收**：回交 + settle 不触发自动验收派发/gate（本文件用行为钉 + 源码钉双重证明）；
//   · 幕僚**不自收自验、不转发**：回交只投幕僚（[工作结果]），验收卡由发起角色会话的客户卡通道呈现。
//
// 覆盖：开关开/关（decision 组开关关闭 ⇒ 客户手选；开启 ⇒ judge 代批）+ 无自动验收派发。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { createCustomerInputChannel, type OperatorJudgeResultPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchTaskFn, DispatchReceipt, GovernanceJudgeFn, GovernanceJudgeRequest, CustomerInputRequest } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: "chief" | "verification"): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief", "chief"), builtIn("verifier", "verification"), worker("worker")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function harness(root: string) {
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const caps: Record<string, { dispatchTask?: DispatchTaskFn; roleStatus?: unknown; roleActivityLog?: unknown }> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = input as typeof caps[string];
      const handle: RoleSessionHandle = {
        async send(text, options) {
          (sent[input.roleId] ??= []).push(text);
          (sendOptions[input.roleId] ??= []).push(options ?? {});
        },
        events() {
          let i = 0;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  for (let tries = 0; tries < 100; tries += 1) {
                    const arr = streams[input.roleId] ?? [];
                    if (i < arr.length) return { value: arr[i++], done: false };
                    await tick(5);
                  }
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  return { mgr, streams, sent, sendOptions, caps };
}

test("幕僚调度验收：chief 可自行核对（role_status）并可把 review 任务派给质检；回交只回幕僚", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-opt-accept-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const chiefCaps = h.caps.chief!;
    assert.equal(typeof chiefCaps.dispatchTask, "function", "幕僚拥有派发能力（调度验收）");
    assert.equal(typeof chiefCaps.roleStatus, "function", "幕僚可自行核对（role_status 只读）");

    const receipt = (await chiefCaps.dispatchTask!({
      roleId: "verifier",
      task: "复核交付：核对 src/worker.ts 与验收标准",
      reason: "终态验收可选调度",
      sideEffect: "read-only",
      expectedOutput: "复核结论",
    })) as DispatchReceipt;
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.match(receipt.message ?? "", /任务编号：#t-/);
    await waitUntil(() => (h.sent.verifier?.length ?? 0) > 0);
    assert.match(h.sent.verifier[0] ?? "", /任务编号：#t-/);
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0);
    const task = [...state.records.values()][0]!;
    assert.equal(task.created?.from, "chief");
    assert.equal(task.created?.to, "verifier");

    // 质检回交（携带 taskId）：只投幕僚 [工作结果]，不投其他角色。
    (h.streams.verifier ??= []).push({
      kind: "handback",
      summary: "复核完成",
      handback: { roleId: "verifier", taskId: task.taskId, status: "completed", summary: "复核通过", evidence: ["src/worker.ts"], at: "2026-10-29T00:00:01.000Z", turnId: "turn-v" },
    } as OrchestrationEvent);
    await waitUntil(() => (h.sent.chief ?? []).some((text) => text.includes("复核通过")));
    const results = h.sent.chief.filter((text) => text.includes("复核通过"));
    assert.equal(results.length, 1, "工作结果只投幕僚一次");
    assert.match(results[0]!, /^\[工作结果\]/);
    assert.equal((h.sent.worker ?? []).length, 0, "交付角色不接收回交");

    // 无自动验收：回交 + settle 后不再有任何自动派发/新任务（验收不是自动 gate）。
    (h.streams.verifier ??= []).push({ kind: "settled", summary: "质检一轮结束" } as OrchestrationEvent);
    (h.streams.chief ??= []).push({ kind: "settled", summary: "幕僚一轮结束" } as OrchestrationEvent);
    await tick(250);
    const stateAfter = await readTaskState(root);
    assert.equal(stateAfter.records.size, 1, "回交/settle 不产生新的自动验收任务");
    assert.equal((h.sent.verifier ?? []).filter((text) => text.includes("复核") && !text.includes("任务编号")).length, 0, "无自动验收派发到质检");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("无自动验收机器：源码不接线 acceptance 派发/gate/复核能力（F-03 结构性钉）", () => {
  const sessionSrc = readFileSync(path.join(process.cwd(), "app", "desktop", "session.ts"), "utf8");
  const interfaceSrc = readFileSync(path.join(process.cwd(), "app", "desktop", "interface.ts"), "utf8");
  const forbidden = [
    "onHandbackSettled",
    "onHandbackReceived",
    "onGovernanceLedgerAppended",
    "dispatchAcceptanceForFlow",
    "scheduleAcceptanceCheck",
    "runAcceptanceCheck",
    "requestAcceptance",
    "reportArtifact",
    "requestGateReview",
    "requestBoundaryChange",
  ];
  for (const name of forbidden) {
    assert.equal(sessionSrc.includes(name), false, `session.ts 不得保留自动验收机器：${name}`);
    assert.equal(interfaceSrc.includes(name), false, `interface.ts 不得保留自动验收机器：${name}`);
  }
});

// —————————————— 开关开/关：验收卡由客户/判断 agent 裁决（不要求每次独立验收） ——————————————

function acceptanceRequest(): CustomerInputRequest {
  return {
    kind: "choice",
    title: "验收复核结论：通过？",
    cardKind: "acceptance",
    sourceRoleId: "verifier",
    flowId: "flow-a",
    options: [
      { id: "accept", label: "验收通过", recommended: true },
      { id: "rework", label: "退回返工" },
    ],
  };
}

function channelHarness(groupEnabled: boolean) {
  const pushed: OperatorRequestPayload[] = [];
  const results: OperatorJudgeResultPayload[] = [];
  let n = 0;
  const judge: GovernanceJudgeFn = async (request) => ({
    verdict: "approve",
    group: "decision",
    cardKind: "acceptance",
    engine: request.runtime,
    model: "judge-model",
    reasonCode: "recommended-default",
    value: { selected: ["accept"] },
    selected: ["accept"],
    durationMs: 1,
  });
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    nextId: () => `op-${++n}`,
    judge: { isGroupEnabled: () => groupEnabled, fn: judge },
    emitJudgeResult: (payload) => results.push(payload),
  });
  return { channel, pushed, results };
}

const ctx = { roleId: "verifier", projectRoot: "/proj", runtime: "demo" as const, governanceModel: "trio" as const };

test("开关关闭：验收卡呈现客户，客户手选通过——不自动验收", async () => {
  const h = channelHarness(false);
  const pending = h.channel.customerInput(acceptanceRequest(), ctx, { judgeContext: { flowId: "flow-a", facts: { governanceModel: "trio" as const, flowId: "flow-a", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] } } });
  await waitUntil(() => h.pushed.length === 1);
  assert.equal(h.results.length, 0, "开关关闭不调用判断");
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["accept"]);
  assert.equal(outcome?.outcome === "answered" ? outcome.judge : undefined, undefined, "客户手选无 judge 审计");
});

test("开关开启：验收卡由判断 agent 代选推荐项（客户可不开）——一次裁决，无后续自动派发", async () => {
  const h = channelHarness(true);
  const outcome = await h.channel.customerInput(acceptanceRequest(), ctx, { judgeContext: { flowId: "flow-a", facts: { governanceModel: "trio" as const, flowId: "flow-a", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] } } });
  assert.equal(h.pushed.length, 0, "代批成功不呈现客户卡");
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0]!.cardKind, "acceptance");
  assert.equal(h.results[0]!.requestTitle, "验收复核结论：通过？");
  assert.deepEqual(h.results[0]!.selected, ["accept"]);
  assert.equal(outcome?.outcome, "answered");
  assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["accept"]);
  assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "judge:demo");
});

test("§5A judgeContext.intentId 进入 GovernanceJudgeRequest；metadata.intentId 兜底", async () => {
  const facts = { governanceModel: "trio" as const, flowId: "flow-a", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] };
  const makeChannel = (): { seen?: GovernanceJudgeRequest; channel: ReturnType<typeof createCustomerInputChannel> } => {
    const holder: { seen?: GovernanceJudgeRequest; channel: ReturnType<typeof createCustomerInputChannel> } = {
      channel: undefined as unknown as ReturnType<typeof createCustomerInputChannel>,
    };
    const judge: GovernanceJudgeFn = async (request) => {
      holder.seen = request;
      return {
        verdict: "approve",
        group: "decision",
        cardKind: "acceptance",
        engine: request.runtime,
        value: { selected: ["accept"] },
        selected: ["accept"],
        reasonCode: "judged",
        durationMs: 1,
      };
    };
    holder.channel = createCustomerInputChannel({
      presenter: () => {},
      operatorId: "tester",
      judge: { isGroupEnabled: () => true, fn: judge },
    });
    return holder;
  };
  const viaContext = makeChannel();
  await viaContext.channel.customerInput(acceptanceRequest(), ctx, { judgeContext: { flowId: "flow-a", intentId: "intent-focus-v1", facts } });
  assert.equal(viaContext.seen?.intentId, "intent-focus-v1", "judgeContext.intentId 原样进入判断请求");
  assert.equal(viaContext.seen?.intentIdSource, "request", "显式 intentId 缺省来源为 request");
  const viaMetadata = makeChannel();
  await viaMetadata.channel.customerInput(acceptanceRequest(), ctx, { intentId: "intent-meta-v1", judgeContext: { flowId: "flow-a", facts } });
  assert.equal(viaMetadata.seen?.intentId, "intent-meta-v1", "旧调用 metadata.intentId 兜底");
});

test("§5A/P9.2 客户卡人话：意图预解析失败只退回角色，不向客户呈现技术模板", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const facts = { governanceModel: "trio" as const, flowId: "flow-a", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] };
  const judge: GovernanceJudgeFn = async (request) => ({
    verdict: "manual",
    group: "decision",
    cardKind: "acceptance",
    engine: request.runtime,
    reasonCode: "intent-missing",
    reason: "意图文件必须以 --- 开头；模板 intentId: <小写 slug>；docs/intents/<intentId>.md",
    durationMs: 1,
  });
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    judge: { isGroupEnabled: () => true, fn: judge },
  });
  const outcome = await channel.customerInput(acceptanceRequest(), ctx, { judgeContext: { flowId: "flow-a", facts } });
  assert.equal(pushed.length, 0, "不向客户呈现含技术模板的卡");
  assert.equal(outcome?.outcome, "declined");
  assert.doesNotMatch(JSON.stringify(pushed), /intentId: <小写 slug>|docs\/intents/);
});

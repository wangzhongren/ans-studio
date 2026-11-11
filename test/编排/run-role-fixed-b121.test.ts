// test/编排/run-role-fixed-b121.test.ts
// T3「两条固定工作流路径」B12.1（2026-11-11，编排侧）：fixed A3 意图确认卡幂等（每 workflow 只呈一次）。
// RR6 真机中 A3 intent-confirm 卡于 22:57:43/56 呈现 2 次、驱动两次 confirm；B1 AC-13 要求 3 张
// 确认卡各一次。本文件覆盖：
//  ① 首次调用（无待决/已裁决）⇒ 发卡一次、写一张 request.created、A3 completed；
//  ② A3 已完成或同意图已 confirm 裁决 ⇒ 再次调用返回 notPresented，不调 raw、request.created 不增；
//  ③ 已有 1 张未 resolved 的 intent-confirm 卡 ⇒ intent-confirm-pending（等待客户/驱动作答既有卡）；
//  ④ 多个待决（异常）⇒ fail-closed（intent-confirm-multiple-pending，列 requestId，不猜）；
//  ⑤ 不同意图 hash 的既往 confirm 决议（A3 revise→A2 后的新意图版本）⇒ 不误伤，照常发新卡；
//  ⑥ request.orphaned（重启/被取代终态）不计待决；
//  ⑦ legacy 意图路径逐字不变（存在 fixed 形态待决记录也不拦）。
// 全程桩适配器 + 临时项目；不启动真实模型/Electron；不占用 9222/9223/9224；无 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import {
  appendWorkflowEvent,
  readWorkflowLedger,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import { parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  CustomerInputOutcome,
  CustomerInputRequest,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WorkflowDocumentRef,
  WorkflowEvent,
  WorkflowStage,
  WriteGate,
} from "../../src/model/runtime.ts";

const FLOW = "focus";
const D = "a".repeat(64);
const NOW_ISO = "2026-11-11T10:00:00.000Z";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const INTENT_TEXT = [
  "---",
  "schema: project-intent/v1",
  "flowId: focus",
  "version: 1",
  "intentId: focus-intent",
  "goal: 固定路径意图",
  "scope: B12.1 意图卡幂等",
  "acceptance: 每 workflow 只呈一次意图卡",
  "---",
  "# 意图",
  "",
  "固定路径的意图正文（B12.1 幂等测试夹具）。",
  "",
].join("\n");

const INTENT_SHA = sha(INTENT_TEXT);
const OTHER_INTENT_SHA = "b".repeat(64);

// project-roster/v4（与 run-role-fixed-b31 同夹具；A3 不读名单，仅为会话夹具完整）。
const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v4",
  "flowId: focus",
  "version: 1",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: 测试夹具省略装配/入口角色",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现",
  "    capability: TS",
  "    modules:",
  "      - impl-core",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 核对",
  "    capability: 测试",
  "    review: true",
  "    modules:",
  "      - qa-suite",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现 CLI",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.js",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 测试",
  "    purpose: 独立测试",
  "    path: test/",
  "    category: core",
  "    publicContract: test/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: impl-core",
  "    path: src/",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    path: test/",
  "    roleId: qa",
  "roles:",
  "  - id: implementer",
  "    modules: [impl-core]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, implementer, qa]",
  "```",
].join("\n");

interface FixedProject {
  root: string;
  project: ProjectConfig;
}

/** 临时项目：trio + 意图/意图入口/名单/模块/提案/架构夹具（不触真实模型/网络）。 */
function fixedProject(options: { intentEntry?: boolean } = {}): FixedProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-b121-orch-"));
  fs.mkdirSync(path.join(root, ".ans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "product", "focus-intent-v1.md"), INTENT_TEXT, "utf8");
  if (options.intentEntry !== false) {
    fs.mkdirSync(path.join(root, "docs", "intents"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "intents", "focus-intent.md"), "---\nintentId: focus-intent\n---\n# 意图入口\n", "utf8");
  }
  fs.mkdirSync(path.join(root, "docs", "proposals"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "proposals", "focus-roster-v1.md"), ROSTER_TEXT, "utf8");
  const parsedRoster = parseProjectRoster(ROSTER_TEXT);
  if (!parsedRoster.ok) throw new Error(`fixture roster invalid: ${parsedRoster.reason}`);
  fs.writeFileSync(
    path.join(root, "docs", "proposals", "focus-modules-v1.md"),
    ["---", "schema: project-modules/v2", "flowId: focus", "version: 1",
      `modules: ${JSON.stringify(parsedRoster.roster.modules)}`, "---", "# 模块清单"].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, "docs", "proposals", "focus-proposal-v1.md"),
    "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n",
    "utf8",
  );
  fs.mkdirSync(path.join(root, "docs", "contracts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "contracts", "focus-architecture-v1.md"),
    "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n",
    "utf8",
  );
  fs.mkdirSync(path.join(root, "角色卡"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "governance-boundary.yaml"), "role: governance\nentries: []\n");
  const project: ProjectConfig = {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:b121-orchestration" },
    },
  };
  return { root, project };
}

function cleanup(root: string): void {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function stubAdapter(): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                yield { kind: "settled", summary: "会话结束" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

async function withSession<T>(
  options: {
    roleId: string;
    project: ProjectConfig;
    customerInput: CustomerInputFn;
    workflowModeForFlow?: (flowId: string) => "fixed" | "legacy";
  },
  fn: (caps: AdapterCapabilities) => Promise<T>,
): Promise<T> {
  const stub = stubAdapter();
  const handle = await openRoleSession(
    {
      roleId: options.roleId,
      project: options.project,
      customerInput: options.customerInput,
      ...(options.workflowModeForFlow !== undefined ? { workflowModeForFlow: options.workflowModeForFlow } : {}),
    },
    { createAdapter: stub.createAdapter },
  );
  try {
    assert.ok(stub.caps() !== undefined, "适配器必须收到能力对象");
    assert.ok(stub.caps()!.customerInput !== undefined, "确认制会话必须注入 customerInput 包装器");
    return await fn(stub.caps()!);
  } finally {
    await handle.dispose();
  }
}

const BASE = { v: 1 as const, at: NOW_ISO, schema: "ans-workflow/v1" as const, path: "A" as const };

function startedEvent(workflowId: string): WorkflowEvent {
  return {
    ...BASE,
    kind: "workflow.started",
    workflowId,
    flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`,
    trigger: { by: "chief", reason: "seed" },
    sourceTaskId: "t-src",
  };
}

function requestedEvent(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE,
    kind: "stage.requested",
    workflowId,
    flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:1`,
    stage,
    requestTaskId: `t-req-${stage}-1`,
    requestDigest: D,
    attempt: 1,
  };
}

function completedEvent(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE,
    kind: "stage.completed",
    workflowId,
    flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`,
    stage,
    cause: { kind: "seed", ref: `seed-${stage}` },
    artifacts: [],
  };
}

/** 合成 A1..<last> 逐阶段 requested+completed 的合法账本。 */
async function seedWorkflowThrough(root: string, workflowId: string, stages: readonly WorkflowStage[]): Promise<void> {
  const events: WorkflowEvent[] = [startedEvent(workflowId)];
  for (const stage of stages) {
    events.push(requestedEvent(workflowId, stage), completedEvent(workflowId, stage));
  }
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

function intentCard(): CustomerInputRequest {
  return {
    kind: "choice",
    title: "需求意图确认",
    cardKind: "intent-confirm",
    flowId: FLOW,
    question: "请确认意图",
    options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修订" }],
  };
}

const INTENT_REF = (intentSha256: string): WorkflowDocumentRef[] => [
  { kind: "intent", path: "docs/product/focus-intent-v1.md", sha256: intentSha256, version: 1 },
];

function createdRequestEvent(
  requestId: string,
  options: { workflowId?: string; documentRefs?: WorkflowDocumentRef[] } = {},
) {
  return taskEvent("request.created", {
    requestId,
    flowId: FLOW,
    cardKind: "intent-confirm",
    ...(options.workflowId !== undefined ? { workflowId: options.workflowId } : {}),
    stage: "A3",
    sourceRoleId: "chief",
    title: "需求意图确认",
    options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修订" }],
    ...(options.documentRefs !== undefined ? { documentRefs: options.documentRefs } : {}),
  });
}

function resolvedRequestEvent(
  requestId: string,
  options: { workflowId?: string; choice: string; documentRefs?: WorkflowDocumentRef[] },
) {
  return taskEvent("request.resolved", {
    requestId,
    cardKind: "intent-confirm",
    ...(options.workflowId !== undefined ? { workflowId: options.workflowId } : {}),
    stage: "A3",
    decisionId: `decision-${requestId}`,
    selectedOptionIds: [options.choice],
    ...(options.documentRefs !== undefined ? { documentRefs: options.documentRefs } : {}),
    by: "customer",
    choice: options.choice,
  });
}

/** 模拟应用通道/桌面 B3：raw 被调用时写 request.created/resolved（fixed 绑定），返回客户 confirm。 */
function browserRoundTrip(
  root: string,
  input: { requestId: string; workflowId: string; intentSha256: string; choice?: string },
): { raw: CustomerInputFn; calls: () => number } {
  let calls = 0;
  const raw: CustomerInputFn = async (request) => {
    calls += 1;
    assert.equal(request.kind, "choice");
    const created = createdRequestEvent(input.requestId, {
      workflowId: input.workflowId,
      documentRefs: INTENT_REF(input.intentSha256),
    });
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    const resolved = resolvedRequestEvent(input.requestId, {
      workflowId: input.workflowId,
      choice: input.choice ?? "confirm",
      documentRefs: INTENT_REF(input.intentSha256),
    });
    assert.equal((await appendTaskEvent(root, resolved)).ok, true);
    return {
      outcome: "answered",
      value: { selected: [input.choice ?? "confirm"] },
      decisionId: `decision-${input.requestId}`,
    } satisfies CustomerInputOutcome;
  };
  return { raw, calls: () => calls };
}

function fixedModeFor(flowId: string): "fixed" | "legacy" {
  return flowId === FLOW ? "fixed" : "legacy";
}

async function countIntentCreated(root: string): Promise<number> {
  const tasks = await readTaskState(root);
  return tasks.events.filter((event) => event.kind === "request.created" && event.cardKind === "intent-confirm").length;
}

async function hasA3Completed(root: string): Promise<boolean> {
  const ledger = await readWorkflowLedger(root);
  return ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A3");
}

// ————————————————— ①② 首次发卡一次；完成后再次调用不再发卡 —————————————————

test("fixed A3 幂等：首次发卡一次（1 张 request.created、A3 completed）；A3 完成后再次调用 notPresented、不再调 raw", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    const roundTrip = browserRoundTrip(root, { requestId: "req-b121-first", workflowId, intentSha256: INTENT_SHA });
    let capturedMarker: string | undefined;
    const raw: CustomerInputFn = async (request, metadata) => {
      if (request.kind === "choice") capturedMarker = request.question;
      return roundTrip.raw(request, metadata);
    };
    await withSession({ roleId: "chief", project, customerInput: raw, workflowModeForFlow: fixedModeFor }, async (caps) => {
      const first = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(first?.outcome, "answered", "首次无待决/已裁决 ⇒ 照常发卡");
      assert.deepEqual(
        first?.outcome === "answered" ? first.intentConfirmation : undefined,
        { status: "committed" },
        "fixed finalize 成功 ⇒ intentConfirmation=committed",
      );
      assert.match(capturedMarker ?? "", /\[ans-intent-evidence path=docs\/product\/focus-intent-v1\.md sha256=[0-9a-f]{64} version=1\]/);
      assert.equal(roundTrip.calls(), 1);
      // 同一 workflow 再次请求：A3 已完成 ⇒ 不发新卡、不调 raw。
      const second = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(second?.outcome, "declined");
      assert.equal(second?.outcome === "declined" ? second.notPresented : undefined, true);
      assert.match(
        second?.outcome === "declined" ? second.reason ?? "" : "",
        /intent-confirm-already-completed/,
        "A3 已完成 ⇒ 稳定 notPresented 文案",
      );
      assert.equal(roundTrip.calls(), 1, "第二次调用不得再调 raw（不重复呈现）");
    });
    assert.equal(await countIntentCreated(root), 1, "request.created 不增（每 workflow 只落一张意图卡）");
    assert.equal(await hasA3Completed(root), true, "首次裁决后 A3 已完成");
  } finally {
    cleanup(root);
  }
});

test("B24.1 fixed A3 入口门：docs/intents 缺失 ⇒ prepare 即 notPresented intent-entry-missing（不调 raw、不写 request.created/A3）", async () => {
  const { root, project } = fixedProject({ intentEntry: false });
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    const roundTrip = browserRoundTrip(root, { requestId: "req-b121-resolved", workflowId, intentSha256: INTENT_SHA });
    await withSession({ roleId: "chief", project, customerInput: roundTrip.raw, workflowModeForFlow: fixedModeFor }, async (caps) => {
      // RR20：入口晚于卡落盘 ⇒ finalize pending-recovery 死锁；B24.1 起呈卡前即 fail-closed。
      const first = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(first?.outcome, "declined");
      assert.equal(first?.outcome === "declined" ? first.notPresented : undefined, true);
      assert.match(first?.outcome === "declined" ? first.reason ?? "" : "", /意图入口缺失/u);
      assert.match(first?.outcome === "declined" ? first.reason ?? "" : "", /写后重试/u);
      assert.equal(roundTrip.calls(), 0, "缺入口不得呈卡（不调 raw）");
      // 仍缺入口：再次请求同样 fail-closed，不产生任何卡/裁决事件。
      const second = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(second?.outcome, "declined");
      assert.match(second?.outcome === "declined" ? second.reason ?? "" : "", /意图入口缺失/u);
    });
    assert.equal(await countIntentCreated(root), 0, "request.created 不得产生");
    assert.equal(await hasA3Completed(root), false, "不得伪造 A3 完成");
    const state = await readTaskState(root);
    assert.equal(state.events.some((event) => event.kind === "request.resolved"), false, "客户未作答");
  } finally {
    cleanup(root);
  }
});

test("B24.2 fixed A3 恢复：已 confirm 裁决 + 入口后补 ⇒ 重试幂等补记 stage.completed A3，不重复发卡/不重复事件", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    const roundTrip = browserRoundTrip(root, { requestId: "req-b24-recover", workflowId, intentSha256: INTENT_SHA });
    const entryPath = path.join(root, "docs", "intents", "focus-intent.md");
    let removed = false;
    const raw: CustomerInputFn = async (request, metadata) => {
      // 复现 RR20 竞态：卡已呈、客户决议前入口尚未落盘（这里以删除模拟"决议时入口缺失"）。
      if (!removed && request.kind === "choice") {
        removed = true;
        await fs.promises.rm(entryPath, { force: true });
      }
      return roundTrip.raw(request, metadata);
    };
    await withSession({ roleId: "chief", project, customerInput: raw, workflowModeForFlow: fixedModeFor }, async (caps) => {
      const first = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(first?.outcome, "answered");
      const confirmation = first?.outcome === "answered" ? first.intentConfirmation : undefined;
      assert.equal(confirmation?.status, "pending-recovery", "决议时入口缺失 ⇒ finalize pending-recovery");
      assert.equal(confirmation?.code, "intent-entry-missing");
      assert.equal(await hasA3Completed(root), false);

      // chief 写后重试：补写入口后再次请求同一意图卡 ⇒ 应用幂等重跑 finalize 并恢复 A3。
      await fs.promises.writeFile(entryPath, "---\nintentId: focus-intent\n---\n# 意图入口\n", "utf8");
      const second = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(second?.outcome, "declined");
      assert.equal(second?.outcome === "declined" ? second.notPresented : undefined, true);
      const reason = second?.outcome === "declined" ? second.reason ?? "" : "";
      assert.match(reason, /intent-confirm-already-resolved/);
      assert.match(reason, /A3 已完成恢复/u);
      assert.equal(roundTrip.calls(), 1, "已裁决后不得再调 raw");

      // 恢复后再请求：A3 已完成 ⇒ 稳定 already-completed，不重复发卡。
      const third = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(third?.outcome, "declined");
      assert.match(third?.outcome === "declined" ? third.reason ?? "" : "", /intent-confirm-already-completed/);
      assert.equal(roundTrip.calls(), 1);
    });
    assert.equal(await countIntentCreated(root), 1, "request.created 不增");
    assert.equal(await hasA3Completed(root), true, "B24.2 恢复补记 stage.completed A3");
    const ledger = await readWorkflowLedger(root);
    assert.equal(
      ledger.events.filter((event) => event.kind === "stage.completed" && event.stage === "A3").length,
      1,
      "幂等：stage.completed A3 恰好一次（不重复事件）",
    );
  } finally {
    cleanup(root);
  }
});

// ————————————————— ③ 单张待决卡 —————————————————

test("fixed A3 幂等：已有 1 张未 resolved 卡 ⇒ intent-confirm-pending（不调 raw、不写新 request/stage 事件）", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    const pendingId = "req-b121-pending";
    assert.equal((await appendTaskEvent(root, createdRequestEvent(pendingId, { workflowId }))).ok, true);
    const ledgerBefore = await readWorkflowLedger(root);
    let rawCalls = 0;
    const raw: CustomerInputFn = async () => {
      rawCalls += 1;
      return { outcome: "declined", reason: "must-not-present" } satisfies CustomerInputOutcome;
    };
    await withSession({ roleId: "chief", project, customerInput: raw, workflowModeForFlow: fixedModeFor }, async (caps) => {
      const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(outcome?.outcome, "declined");
      assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
      const reason = outcome?.outcome === "declined" ? outcome.reason ?? "" : "";
      assert.match(reason, /intent-confirm-pending/);
      assert.match(reason, new RegExp(pendingId), "诊断含既有 requestId，便于客户/驱动作答既有卡");
    });
    assert.equal(rawCalls, 0, "待决卡存在时不得调用 raw");
    assert.equal(await countIntentCreated(root), 1, "request.created 不增（不写新 request）");
    const ledgerAfter = await readWorkflowLedger(root);
    assert.equal(ledgerAfter.events.length, ledgerBefore.events.length, "不写新 workflow 事件（未调用 prepareIntent）");
  } finally {
    cleanup(root);
  }
});

// ————————————————— ④ 多个待决 ⇒ fail-closed —————————————————

test("fixed A3 幂等：多个待决（异常）⇒ fail-closed intent-confirm-multiple-pending，列 requestId、不发卡", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    const ids = ["req-b121-multi-1", "req-b121-multi-2"];
    for (const requestId of ids) {
      assert.equal((await appendTaskEvent(root, createdRequestEvent(requestId, { workflowId }))).ok, true);
    }
    let rawCalls = 0;
    const raw: CustomerInputFn = async () => {
      rawCalls += 1;
      return { outcome: "declined", reason: "must-not-present" } satisfies CustomerInputOutcome;
    };
    await withSession({ roleId: "chief", project, customerInput: raw, workflowModeForFlow: fixedModeFor }, async (caps) => {
      const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(outcome?.outcome, "declined");
      assert.equal(outcome?.outcome === "declined" ? outcome.notPresented : undefined, true);
      const reason = outcome?.outcome === "declined" ? outcome.reason ?? "" : "";
      assert.match(reason, /intent-confirm-multiple-pending/);
      for (const requestId of ids) assert.match(reason, new RegExp(requestId), "诊断列出全部待决 requestId");
    });
    assert.equal(rawCalls, 0, "异常多待决 ⇒ 不猜、不发卡");
    assert.equal(await countIntentCreated(root), 2, "不写新 request.created");
  } finally {
    cleanup(root);
  }
});

// ————————————————— ⑤ 不同意图 hash 不误伤（新意图版本） —————————————————

test("fixed A3 幂等：既往 confirm 决议对应不同意图 hash（新版本）⇒ 不误伤，照常发新卡", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    // 旧意图版本已 confirm 裁决（hash 与当前意图不同；A3 未完成 —— 如 revise→A2 后新版本场景）。
    assert.equal(
      (await appendTaskEvent(root, createdRequestEvent("req-b121-old", { workflowId, documentRefs: INTENT_REF(OTHER_INTENT_SHA) }))).ok,
      true,
    );
    assert.equal(
      (await appendTaskEvent(root, resolvedRequestEvent("req-b121-old", {
        workflowId, choice: "confirm", documentRefs: INTENT_REF(OTHER_INTENT_SHA),
      }))).ok,
      true,
    );
    const roundTrip = browserRoundTrip(root, { requestId: "req-b121-new", workflowId, intentSha256: INTENT_SHA });
    await withSession({ roleId: "chief", project, customerInput: roundTrip.raw, workflowModeForFlow: fixedModeFor }, async (caps) => {
      const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(outcome?.outcome, "answered", "新意图版本应可重新确认");
      assert.equal(roundTrip.calls(), 1);
    });
    assert.equal(await countIntentCreated(root), 2, "新旧两张卡（旧卡为历史版本）");
    assert.equal(await hasA3Completed(root), true);
  } finally {
    cleanup(root);
  }
});

// ————————————————— ⑥ orphaned 不计待决 —————————————————

test("fixed A3 幂等：request.orphaned（重启终态）不计待决 ⇒ 照常发卡", async () => {
  const { root, project } = fixedProject();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedWorkflowThrough(root, workflowId, ["A1", "A2"]);
    assert.equal(
      (await appendTaskEvent(root, createdRequestEvent("req-b121-orphaned", { workflowId }))).ok,
      true,
    );
    assert.equal(
      (await appendTaskEvent(root, taskEvent("request.orphaned", { requestId: "req-b121-orphaned", reason: "restart" }))).ok,
      true,
    );
    const roundTrip = browserRoundTrip(root, { requestId: "req-b121-after-restart", workflowId, intentSha256: INTENT_SHA });
    await withSession({ roleId: "chief", project, customerInput: roundTrip.raw, workflowModeForFlow: fixedModeFor }, async (caps) => {
      const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(outcome?.outcome, "answered");
      assert.equal(roundTrip.calls(), 1, "orphaned 是终态、不等待作答 ⇒ 允许重新发卡");
    });
    assert.equal(await countIntentCreated(root), 2, "重启后的新卡 + 历史 orphaned 卡");
  } finally {
    cleanup(root);
  }
});

// ————————————————— ⑦ legacy 路径逐字不变 —————————————————

test("legacy A3：存在 fixed 形态待决记录也不拦（仍走 trunk prepareIntentConfirmation，marker 带 snapshot=）", async () => {
  const { root, project } = fixedProject();
  try {
    // 预置一张「当前 flow 的 intent-confirm 待决记录」：legacy 模式不得读取/消费该 fixed 幂等状态。
    assert.equal(
      (await appendTaskEvent(root, createdRequestEvent("req-b121-legacy-ignored", { workflowId: "wf-legacy-ignored" }))).ok,
      true,
    );
    let rawCalls = 0;
    let capturedQuestion = "";
    const raw: CustomerInputFn = async (request) => {
      rawCalls += 1;
      if (request.kind === "choice") capturedQuestion = request.question ?? "";
      return { outcome: "declined", reason: "stub-channel-declined" } satisfies CustomerInputOutcome;
    };
    // 缺省（无 workflowMode/workflowModeForFlow）＝ legacy；逐字旧行为。
    await withSession({ roleId: "chief", project, customerInput: raw }, async (caps) => {
      const outcome = await caps.customerInput!(intentCard(), { flowId: FLOW });
      assert.equal(outcome?.outcome, "declined");
    });
    assert.equal(rawCalls, 1, "legacy 分支照常呈现（不被 B12.1 幂等检查拦截）");
    assert.match(
      capturedQuestion,
      /\[ans-intent-evidence snapshot=[^\]]+ path=docs\/product\/focus-intent-v1\.md sha256=[0-9a-f]{64} version=1\]/,
      "legacy marker 仍由 trunk prepareIntentConfirmation 生成（带 snapshot=）",
    );
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.length, 0, "legacy 分支不写 fixed workflow 账本（无 stage.requested A3）");
  } finally {
    cleanup(root);
  }
});

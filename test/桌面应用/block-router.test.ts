// test/桌面应用/block-router.test.ts
// 2026-11-20（block resolver 测试批 R4b，测试角色）：**桌面 router/执行器**（T-3/T-4/T-5/T-6/T-8/T-9）。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §四–§七、§8.1
// T-3/T-4/T-5/T-6/T-8/T-9、§8.2 AC-3/AC-4/AC-5/AC-6/AC-9；R2 记录
// `角色卡/桌面窗口/docs/change/2026-11-20_change_block-resolver-desktop.md`（接线/执行器/计时/恢复）。
// 协调方 Q4：终止只能由客户在决策卡中显式选择，judge 永不选择；终止是 decided 的结果，不是停止态。
//
// 覆盖：
//   1. 事实源 → raised/routed：stage.blocked 扫描（仅最新未被取代）、task.reported（blocked/failed；done 不入块；
//      app-dispatch stage-execution 跳过）、fixed 派发拒绝、reconcile corrupt、stall tick、shell 拒绝；
//   2. 执行器：引擎有界自动修复（attempt 上限 + budget 升级）、app-dispatch 修复任务（from application/
//      blockId/不触发阶段完成/证据重算收口）、fixed-v2.1 修复简报（零迁移）、T_repair 升级；
//   3. 决策卡：judge 开+唯一推荐 ⇒ by judge + decisionId；关闭/manual/结果行不可用 ⇒ 客户卡（附原因）；
//      主权/终止 judge 永不选；卡未答不执行；同 block 卡幂等；一项目一卡排队；T_remind 一次；
//   4. 客户终止选项 ⇒ 停稳/披露 ⇒ resolveBlock(decided, by customer)；
//   5. 重复同指纹 ⇒ escalate(repeat)；恢复/启动对账；review 名单不可读 ⇒ route 属主 rapporteur（不回落 verifier）。
//
// 夹具：临时目录 + 假会话端口（不启动 Electron/真实模型）；客户通道用真实 `createCustomerInputChannel`
// （judge/主权语义）或显式假函数；不读 `.env`、不占端口。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createDesktopBlockRouter,
  nextActionsForBlockCode,
  shellDenialReasonFromOperatorOutcome,
  type DesktopBlockRouterHost,
} from "../../app/desktop/block-router.ts";
import {
  createCustomerInputChannel,
  type DesktopCustomerInputFn,
  type OperatorJudgeResultPayload,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import {
  blockCardRequestId,
  blockFactFromShellDenial,
  computeBlockId,
  type BlockFact,
} from "../../src/common/编排/block-resolution.ts";
import {
  escalateBlock,
  raiseBlock,
  readBlockLedger,
  replayBlockLifecycles,
  resolveBlock,
  routeBlock,
  type BlockLedgerEvent,
} from "../../src/common/编排/block-ledger.ts";
import {
  appendTaskEvent,
  readTaskState,
  taskEvent,
} from "../../src/common/编排/task-state.ts";
import {
  WORKFLOW_DEFINITION_HASHES_BY_VERSION,
} from "../../src/common/编排/workflow-definitions.ts";
import {
  appendWorkflowEvent,
  driveAppDispatchStage,
  observeAppDispatchTaskReport,
  readWorkflowLedger,
  selectWorkflow,
  stageExecutionIdempotencyKey,
} from "../../src/common/编排/workflow-service.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  WORKFLOW_PROTOCOL_FIXED_V2_1,
  type CustomerInputMetadata,
  type CustomerInputOutcome,
  type CustomerInputRequest,
  type TaskStateEvent,
  type WorkflowEvent,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const T0 = Date.parse("2026-11-20T00:00:00.000Z");

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(condition: () => boolean | Promise<boolean>, label: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await condition()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时：${label}`);
    await tick(10);
  }
}
async function makeRoot(prefix = "ans-block-router-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, ".ans", "state"), { recursive: true });
  return root;
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeProjectFile(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
}

// —————————————— 宿主 harness（假会话/假投递；真实阻塞服务/账本） ——————————————

function listing(root: string): ProjectListing {
  const roles: ProjectListing["roles"] = ["chief", "convener", "rapporteur", "product", "nominator", "verifier"].map((roleId) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
  }));
  return { projectRoot: root, roles, warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio" };
}

type WithRequestLifecycle = DesktopBlockRouterHost["withRequestLifecycle"];

/** 卡片生命周期录制（等价既有 `withRequestLifecycle` 的可观察契约：created/presented/resolved）。 */
function makeLifecycle(clock: () => Date): WithRequestLifecycle {
  let seq = 0;
  return async (projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride) => {
    const requestId = requestIdOverride ?? `req-block-${++seq}`;
    const options = request.kind === "choice" ? request.options : [];
    const recommended = options.filter((option) => option.recommended === true).map((option) => option.id);
    await appendTaskEvent(projectRoot, taskEvent("request.created", {
      requestId,
      ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
      ...(request.flowId !== undefined ? { flowId: request.flowId } : {}),
      ...(metadata?.taskId !== undefined ? { taskId: metadata.taskId } : {}),
      sourceRoleId,
      title: request.title,
      options: options.map((option) => ({ id: option.id, label: option.label, ...(option.recommended === true ? { recommended: true } : {}) })),
      ...(recommended.length > 0 ? { recommended } : {}),
    }, clock));
    await appendTaskEvent(projectRoot, taskEvent("request.presented", {
      requestId,
      to: metadata?.blockJudgePermitted === true ? "judge" : "customer",
    }, clock));
    const context = { ...buildContext(request, {}), requestId };
    const outcome = await raw(request, context, metadata);
    if (outcome !== null && outcome !== undefined && outcome.outcome === "answered") {
      const decisionId = `decision-${requestId}`;
      const selected = outcome.value.selected ?? [];
      const by = outcome.judge !== undefined || String(outcome.operatorId ?? "").startsWith("judge:") ? "judge" : "customer";
      const resolved: TaskStateEvent = taskEvent("request.resolved", {
        requestId,
        ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
        by,
        decisionId,
        ...(outcome.operatorId !== undefined ? { operatorId: outcome.operatorId } : {}),
        choice: selected.join(",") || "answered",
        ...(selected.length > 0 ? { selectedOptionIds: selected } : {}),
        ...(outcome.judge !== undefined ? { judge: outcome.judge } : {}),
      }, clock);
      await appendTaskEvent(projectRoot, resolved);
      outcome.decisionId = decisionId;
    }
    return outcome;
  };
}

interface HarnessOptions {
  clock?: { now: number };
  judgeEnabled?: boolean;
  customerInput?: DesktopCustomerInputFn;
  busy?: boolean;
  reconcile?: () => Promise<{ corrupt: string[]; errors: string[]; delivered: string[]; activeWorkflows: number }>;
  advanceOk?: boolean | (() => boolean);
  policy?: NonNullable<Parameters<typeof createDesktopBlockRouter>[1]>["policy"];
  timings?: NonNullable<Parameters<typeof createDesktopBlockRouter>[1]>["timings"];
  withRequestLifecycle?: WithRequestLifecycle;
}

interface DeliveryRecord {
  targetRoleId: string;
  item: {
    kind?: string;
    runtime?: unknown;
    sourceRoleId?: string;
    taskId?: string;
    text?: string;
    summary?: string;
    dedupKey?: string;
    [key: string]: unknown;
  };
}

function makeHarness(root: string, opts: HarnessOptions = {}) {
  const clock = opts.clock ?? { now: T0 };
  const delivered: DeliveryRecord[] = [];
  const systemRows: Array<{ roleId: string | null; summary: string }> = [];
  const roleActivity: Array<{ roleId: string; kind: string; summary: string; status?: string; taskId?: string }> = [];
  const advances: string[] = [];
  const nowDate = () => new Date(clock.now);
  const host: DesktopBlockRouterHost = {
    now: () => clock.now,
    ...(opts.customerInput !== undefined ? { customerInput: opts.customerInput } : {}),
    getListing: (projectRoot) => (projectRoot === root ? listing(root) : undefined),
    findLiveRuntime: () => "demo",
    activeRuntimeFor: () => "demo",
    lastGovernanceRuntime: new Map(),
    governanceOwner: () => "convener",
    decisionDelegationEnabled: () => opts.judgeEnabled === true,
    withRequestLifecycle: opts.withRequestLifecycle ?? makeLifecycle(nowDate),
    enqueueDelivery: (_projectRoot, targetRoleId, item) => { delivered.push({ targetRoleId, item }); },
    drainQueue: async () => {},
    emitSystemRow: (_projectRoot, roleId, summary) => { systemRows.push({ roleId, summary }); },
    appendRoleActivity: async (_projectRoot, roleId, input) => { roleActivity.push({ roleId, ...input }); },
    isBusy: () => opts.busy === true,
    ...(opts.reconcile !== undefined ? { reconcileAppDispatch: () => opts.reconcile!() } : {}),
    advanceAppDispatch: async (_projectRoot, workflowId) => {
      advances.push(workflowId);
      return typeof opts.advanceOk === "function" ? opts.advanceOk() : opts.advanceOk !== false;
    },
    redispatchTask: async () => ({ ok: false, safety: "needs-review", message: "测试不重派" }),
    selectRedispatchTarget: (_projectRoot, roleId) => roleId,
    registerAppTask: () => {},
  };
  const router = createDesktopBlockRouter(host, {
    ...(opts.policy !== undefined ? { policy: opts.policy } : {}),
    ...(opts.timings !== undefined ? { timings: opts.timings } : {}),
  });
  return { host, router, clock, delivered, systemRows, roleActivity, advances };
}

// —————————————— 账本/工作流/任务读取助手 ——————————————

async function blockEvents(root: string): Promise<readonly BlockLedgerEvent[]> {
  return (await readBlockLedger(root)).events;
}
async function lifecycleOf(root: string, blockId: string) {
  const events = await blockEvents(root);
  return replayBlockLifecycles(events).records.get(blockId);
}
async function raisedEvents(root: string): Promise<Array<Extract<BlockLedgerEvent, { kind: "block.raised" }>>> {
  return (await blockEvents(root)).filter((event): event is Extract<BlockLedgerEvent, { kind: "block.raised" }> => event.kind === "block.raised");
}
async function routedEvents(root: string): Promise<Array<Extract<BlockLedgerEvent, { kind: "block.routed" }>>> {
  return (await blockEvents(root)).filter((event): event is Extract<BlockLedgerEvent, { kind: "block.routed" }> => event.kind === "block.routed");
}
async function escalationEvents(root: string): Promise<Array<Extract<BlockLedgerEvent, { kind: "block.escalated" }>>> {
  return (await blockEvents(root)).filter((event): event is Extract<BlockLedgerEvent, { kind: "block.escalated" }> => event.kind === "block.escalated");
}
async function taskState(root: string) {
  return readTaskState(root);
}

async function seedWorkflow(input: {
  root: string;
  workflowId: string;
  flowId?: string;
  path?: "A" | "B";
  protocol?: "fixed-v2.1" | "app-dispatch/v1";
  at: string;
  definition?: { id: string; version: number; sha256: string };
}): Promise<void> {
  const path = input.path ?? "A";
  const flowId = input.flowId ?? `flow-${input.workflowId}`;
  const definition = input.definition
    // 手工播种 = 在飞 workflow 夹具：按 v2 定义 + v2 hash 解释（当前注册表 v3；不静默迁移）。
    ?? (input.protocol === "app-dispatch/v1"
      ? { id: path === "B" ? "modify" : "add", version: 2, sha256: path === "B" ? WORKFLOW_DEFINITION_HASHES_BY_VERSION.modify[2] : WORKFLOW_DEFINITION_HASHES_BY_VERSION.add[2] }
      : undefined);
  const event: WorkflowEvent = {
    v: 1,
    at: input.at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "workflow.started",
    workflowId: input.workflowId,
    flowId,
    path,
    idempotencyKey: `workflow-start:${flowId}:${path}:seed-${input.workflowId}`,
    trigger: { by: "chief", reason: "test" },
    sourceTaskId: `turn-${input.workflowId}`,
    ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
    ...(definition !== undefined ? { definition } : {}),
  };
  const appended = await appendWorkflowEvent(input.root, event);
  assert.equal(appended.ok, true);
}

async function seedStageBlocked(input: {
  root: string;
  workflowId: string;
  flowId?: string;
  path?: "A" | "B";
  stage: WorkflowStage;
  code: string;
  summary: string;
  taskId?: string;
  attempt?: number;
  at: string;
}): Promise<void> {
  const path = input.path ?? "A";
  const flowId = input.flowId ?? `flow-${input.workflowId}`;
  const attempt = input.attempt ?? 1;
  const event: WorkflowEvent = {
    v: 1,
    at: input.at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "stage.blocked",
    workflowId: input.workflowId,
    flowId,
    path,
    idempotencyKey: `stage-blocked:${input.workflowId}:${input.stage}:${attempt}`,
    stage: input.stage,
    code: input.code,
    summary: input.summary,
    attempt,
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
  };
  const appended = await appendWorkflowEvent(input.root, event);
  assert.equal(appended.ok, true);
}

async function seedStageCompleted(input: {
  root: string;
  workflowId: string;
  flowId?: string;
  path?: "A" | "B";
  stage: WorkflowStage;
  at: string;
}): Promise<void> {
  const path = input.path ?? "A";
  const flowId = input.flowId ?? `flow-${input.workflowId}`;
  const requested: WorkflowEvent = {
    v: 1, at: input.at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
    workflowId: input.workflowId, flowId, path,
    idempotencyKey: `seed-request:${input.workflowId}:${input.stage}`,
    stage: input.stage, requestTaskId: `seed-task:${input.stage}`,
    requestDigest: sha(`seed-${input.stage}`), attempt: 1,
  };
  assert.equal((await appendWorkflowEvent(input.root, requested)).ok, true);
  const completed: WorkflowEvent = {
    v: 1, at: input.at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
    workflowId: input.workflowId, flowId, path,
    idempotencyKey: `seed-complete:${input.workflowId}:${input.stage}`,
    stage: input.stage, cause: { kind: "task-closed", ref: `seed-task:${input.stage}` }, artifacts: [],
  };
  assert.equal((await appendWorkflowEvent(input.root, completed)).ok, true);
}

async function seedTaskCreated(input: {
  root: string;
  taskId: string;
  from?: "chief" | "convener" | "application";
  to: string;
  text?: string;
  workflowId?: string;
  flowId?: string;
  stage?: WorkflowStage;
  taskKind?: string;
  idempotencyKey?: string;
  sideEffect?: "code" | "docs" | "external" | "read-only" | "unknown";
  blockId?: string;
  requestedEvidence?: string[];
}): Promise<void> {
  const event = taskEvent("task.created", {
    taskId: input.taskId,
    from: input.from ?? "chief",
    to: input.to,
    text: input.text ?? "测试任务",
    sideEffect: input.sideEffect ?? "code",
    idempotencyKey: input.idempotencyKey ?? `key-${input.taskId}`,
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.taskKind !== undefined ? { taskKind: input.taskKind } : {}),
    ...(input.blockId !== undefined ? { blockId: input.blockId } : {}),
    ...(input.requestedEvidence !== undefined ? { requestedEvidence: input.requestedEvidence } : {}),
  }, () => new Date(T0));
  const appended = await appendTaskEvent(input.root, event);
  assert.equal(appended.ok, true);
}

async function seedTaskReported(input: {
  root: string;
  taskId: string;
  from: string;
  status: "done" | "blocked" | "failed";
  summary: string;
  evidence?: string[];
}): Promise<void> {
  const appended = await appendTaskEvent(input.root, taskEvent("task.reported", {
    taskId: input.taskId,
    from: input.from,
    status: input.status,
    summary: input.summary,
    ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
  }, () => new Date(T0)));
  assert.equal(appended.ok, true);
}

function dispatchFact(overrides: Partial<BlockFact> = {}): BlockFact {
  return {
    protocol: "fixed-v2.1",
    kind: "dispatch-rejection",
    code: "missing-contract",
    detailCode: "missing-file",
    source: "desktop.dispatch.rejection",
    workflowId: "wf-dispatch",
    flowId: "flow-dispatch",
    stage: "A8",
    fingerprintMaterial: ["dispatch-fact-default"],
    summary: "缺契约：docs/contracts/x.md",
    ...overrides,
  };
}

// —————————————— 1) 事实源 → raised/routed ——————————————

test("stage.blocked 扫描：仅最新未被取代的 blocked 入账；协议取 workflow.started；raised→routed 同 tick 可见", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const { router } = makeHarness(root, { clock });
    await seedWorkflow({ root, workflowId: "wf-fixed", at: new Date(T0 - 60_000).toISOString() });
    await seedStageBlocked({
      root, workflowId: "wf-fixed", stage: "A9", code: "task-closed-rejected", summary: "收口被拒",
      at: new Date(T0 - 30_000).toISOString(), taskId: "t-old",
    });
    // 历史 blocked 已被后续进度取代 ⇒ 不制造陈旧 block。
    await seedStageCompleted({ root, workflowId: "wf-fixed", stage: "A9", at: new Date(T0 - 20_000).toISOString() });
    await seedWorkflow({ root, workflowId: "wf-app", protocol: "app-dispatch/v1", at: new Date(T0 - 60_000).toISOString() });
    await seedStageBlocked({
      root, workflowId: "wf-app", stage: "A8", code: "task-closed-rejected", summary: "最新 blocked",
      at: new Date(T0 - 10_000).toISOString(), taskId: "t-new",
    });
    await router.tick(root);
    const raised = await raisedEvents(root);
    assert.equal(raised.length, 1, "仅最新未被取代的 blocked 入账");
    const event = raised[0]!;
    assert.equal(event.code, "task-closed-rejected");
    assert.equal(event.workflowId, "wf-app");
    assert.equal(event.flowId, "flow-wf-app");
    assert.equal(event.stage, "A8");
    assert.equal(event.taskId, "t-new");
    assert.equal(event.protocol, "app-dispatch/v1");
    assert.equal(event.class, "model-anomaly");
    const record = await lifecycleOf(root, event.blockId);
    assert.equal(record?.status, "routed", "raised→routed 同一 tick");
    assert.equal(record?.routeKind, "owner-repair");
    assert.ok(record?.routeTargetRoleId === "convener", `owner=${record?.routeTargetRoleId}`);
    // 幂等：再次 tick 不重复 raised。
    await router.tick(root);
    assert.equal((await raisedEvents(root)).length, 1);
  } finally {
    await cleanup(root);
  }
});

test("task.reported：blocked/failed ⇒ block；done 不入块；app-dispatch stage-execution 由编排收口（不双块）", async () => {
  const root = await makeRoot();
  try {
    const { router } = makeHarness(root);
    await seedTaskCreated({ root, taskId: "t-blocked", to: "convener", text: "实现" });
    await seedTaskReported({ root, taskId: "t-blocked", from: "convener", status: "blocked", summary: "缺文件" });
    await router.observeTaskReport(root, "t-blocked");
    let raised = await raisedEvents(root);
    assert.equal(raised.length, 1);
    assert.equal(raised[0]!.code, "task-report-blocked");
    assert.equal(raised[0]!.taskId, "t-blocked");
    assert.equal(raised[0]!.protocol, "fixed-v2.1");
    assert.equal((await lifecycleOf(root, raised[0]!.blockId))?.routeKind, "owner-repair");
    assert.equal((await lifecycleOf(root, raised[0]!.blockId))?.routeTargetRoleId, "chief", "属主=任务创建者");

    await seedTaskCreated({ root, taskId: "t-failed", to: "convener", text: "实现" });
    await seedTaskReported({ root, taskId: "t-failed", from: "convener", status: "failed", summary: "失败" });
    await router.observeTaskReport(root, "t-failed");
    raised = await raisedEvents(root);
    assert.equal(raised.length, 2);
    assert.equal(raised[1]!.code, "task-report-failed");

    await seedTaskCreated({ root, taskId: "t-done", to: "convener", text: "实现" });
    await seedTaskReported({ root, taskId: "t-done", from: "convener", status: "done", summary: "完成", evidence: ["src/a.ts"] });
    await router.observeTaskReport(root, "t-done");
    assert.equal((await raisedEvents(root)).length, 2, "done 不是 block");

    await seedTaskCreated({
      root, taskId: "t-stage-exec", from: "application", to: "product", text: "A2 任务",
      workflowId: "wf-exec", flowId: "flow-exec", stage: "A2", taskKind: "stage-execution",
      sideEffect: "docs", idempotencyKey: "stage-exec:wf-exec:A2:product:1",
    });
    await seedTaskReported({ root, taskId: "t-stage-exec", from: "product", status: "blocked", summary: "blocked" });
    await router.observeTaskReport(root, "t-stage-exec");
    assert.equal((await raisedEvents(root)).length, 2, "app-dispatch stage-execution 报告不重复造块（编排 blockFact 另发）");
    assert.equal((await taskState(root)).records.get("t-stage-exec")?.closed, undefined, "router 不收口阶段任务");
  } finally {
    await cleanup(root);
  }
});

test("fixed 派发拒绝 ⇒ 属主修复简报（系统行）：零任务、零工作流事件（fixed-v2.1 零迁移）", async () => {
  const root = await makeRoot();
  try {
    const { router, systemRows } = makeHarness(root);
    const fact = dispatchFact({ fingerprintMaterial: ["fixed-missing-contract"] });
    await router.observeFact(root, fact);
    const raised = await raisedEvents(root);
    assert.equal(raised.length, 1);
    assert.equal(raised[0]!.class, "missing-resource");
    assert.equal(raised[0]!.protocol, "fixed-v2.1");
    const blockId = raised[0]!.blockId;
    const record = await lifecycleOf(root, blockId);
    assert.equal(record?.status, "routed");
    assert.equal(record?.routeKind, "owner-repair");
    assert.equal(record?.routeTargetRoleId, "rapporteur");
    assert.equal(record?.routeTaskId, undefined, "fixed-v2.1 不创建应用任务");
    assert.equal((await taskState(root)).records.size, 0, "零任务");
    assert.equal((await readWorkflowLedger(root)).events.length, 0, "零阶段/工作流写入");
    assert.ok(systemRows.some((row) => String(row.summary).includes("[Block·修复简报]") && String(row.summary).includes(blockId)), "系统行可见修复简报");
    // 回执下一步短语（确定性；未知码如实）。
    assert.ok(nextActionsForBlockCode("missing-contract").some((text) => text.includes("属主补证任务")));
    assert.ok(nextActionsForBlockCode("b-change-scope-invalid").some((text) => text.includes("决策卡")));
    assert.ok(nextActionsForBlockCode("unknown-code")[0]!.includes("已登记 block"));
  } finally {
    await cleanup(root);
  }
});

test("shell 拒绝事实：judge deny ⇒ B2 客户授权卡（judge 面不可代选）；operator outcome 映射确定性", async () => {
  const root = await makeRoot();
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({
    presenter: (payload) => { pushed.push(payload); },
    operatorId: "customer-1",
    nextId: () => "op-shell",
    judge: { isGroupEnabled: () => true },
    emitJudgeResult: () => { throw new Error("shell 卡不应进入 judge"); },
  });
  try {
    const { router, clock } = makeHarness(root, { customerInput: channel.customerInput, judgeEnabled: true });
    // 卡通道要求合法 flowId；shell 观察端口不携 flowId（见生产疑点披露），此处用事实构造器显式携带。
    const shellFact = blockFactFromShellDenial({
      reason: "judge-deny", workflowId: "wf-shell", flowId: "flow-shell", stage: "B3",
      taskId: "t-shell", command: "rm -rf build", summary: "judge 拒绝 shell",
    });
    await router.observeFact(root, shellFact);
    await waitFor(() => pushed.length === 1, "shell 授权卡呈现");
    const raised = await raisedEvents(root);
    assert.equal(raised.length, 1);
    assert.equal(raised[0]!.code, "shell-judge-deny");
    assert.equal(raised[0]!.class, "missing-capability");
    const record = await lifecycleOf(root, raised[0]!.blockId);
    assert.equal(record?.routeKind, "customer-decision");
    assert.equal(record?.cardRequestId, blockCardRequestId(raised[0]!.blockId));
    const request = pushed[0]!.request;
    assert.equal(request.kind, "choice");
    assert.equal(request.cardKind, "decision");
    assert.equal(request.application, true);
    assert.equal(request.sourceRoleId, "application");
    const optionIds = request.kind === "choice" ? request.options.map((option) => option.id) : [];
    assert.ok(optionIds.includes("block-grant-exception"), "需授权 ⇒ 客户主权授权项");
    assert.ok(optionIds.includes("block-replace-executor"));
    const recommended = request.kind === "choice" ? request.options.filter((option) => option.recommended === true).map((option) => option.id) : [];
    assert.deepEqual(recommended, ["block-grant-exception"], "恰一推荐（授权向）");
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["block-grant-exception"] } }).ok, true);
    await waitFor(async () => (await lifecycleOf(root, raised[0]!.blockId))?.status === "resolved", "客户裁决 decided");
    const resolved = await lifecycleOf(root, raised[0]!.blockId);
    assert.equal(resolved?.resolution, "decided");
    assert.equal(resolved?.resolvedBy, "customer");
    assert.equal(resolved?.reEntry, "block-grant-exception");
    // 观察端口（未携 flowId）：事实入账；R2 收尾修补后卡 flowId 确定性回退（block-<blockId12>），仍出客户卡。
    // （不同命令避免与首块的同指纹重复语义——同指纹会升级而非再发卡。）
    router.observeShellDenialLater(root, { reason: "judge-deny", command: "rm -rf coverage", roleId: "verifier" });
    await waitFor(async () => (await raisedEvents(root)).length === 2, "观察端口事实入账");
    const observed = (await raisedEvents(root))[1]!;
    assert.equal(observed.code, "shell-judge-deny");
    assert.equal(observed.source, "shell-gate");
    await waitFor(() => pushed.length === 2, "观察端口回退卡呈现");
    const fallbackFlowId = `block-${observed.blockId.slice(0, 12)}`;
    assert.equal(pushed[1]!.request.flowId, fallbackFlowId, "无账本 flowId ⇒ 确定性回退（不伪造 workflow）");
    assert.match(String(pushed[1]!.request.preview ?? ""), /应用回退/);
    const observedOptions = pushed[1]!.request.kind === "choice" ? pushed[1]!.request.options : [];
    const observedRecommended = observedOptions.find((option) => option.recommended === true);
    assert.ok(observedRecommended !== undefined, "回退卡仍恰一推荐");
    assert.equal(channel.respond({ id: pushed[1]!.id, decision: { kind: "choice", selected: [observedRecommended!.id] } }).ok, true);
    await waitFor(async () => (await lifecycleOf(root, observed.blockId))?.status === "resolved", "观察端口卡裁决");
    assert.equal((await lifecycleOf(root, observed.blockId))?.resolvedBy, "customer");
    clock.now += 1000;
    // operator outcome → 稳定 reason 映射。
    assert.equal(shellDenialReasonFromOperatorOutcome({ outcome: "unavailable" }), "a-unavailable");
    assert.equal(shellDenialReasonFromOperatorOutcome({ outcome: "deny", judge: { reasonCode: "retry-capped" } }), "retry-capped");
    assert.equal(shellDenialReasonFromOperatorOutcome({ outcome: "deny", judge: { manualAsDeny: true } }), "judge-manual");
    assert.equal(shellDenialReasonFromOperatorOutcome({ outcome: "deny", judge: {} }), "judge-deny");
    assert.equal(shellDenialReasonFromOperatorOutcome({ outcome: "approve" }), undefined);
    assert.equal(shellDenialReasonFromOperatorOutcome(null), undefined);
  } finally {
    channel.rejectAllPending("cleanup");
    await cleanup(root);
  }
});

// —————————————— 2) 执行器：引擎/修复任务/简报 ——————————————

test("T-9 reconcile：可修 ⇒ 引擎 fixed + 重驱动；不可修 ⇒ 升级属主修复任务（不改写历史）", async () => {
  {
    const root = await makeRoot();
    try {
      let reconcileCalls = 0;
      const { router, advances } = makeHarness(root, {
        reconcile: async () => { reconcileCalls += 1; return { corrupt: [], errors: [], delivered: [], activeWorkflows: 2 }; },
      });
      const fact: BlockFact = {
        protocol: "app-dispatch/v1",
        kind: "reconcile",
        code: "reconcile-corrupt",
        detailCode: "reconcile",
        workflowId: "wf-rec",
        summary: "对账 corrupt",
        fingerprintMaterial: ["reconcile-ok"],
        engineCanRepair: true,
      };
      await router.observeFact(root, fact);
      const blockId = (await raisedEvents(root))[0]!.blockId;
      const record = await lifecycleOf(root, blockId);
      assert.equal(record?.status, "resolved");
      assert.equal(record?.resolution, "fixed");
      assert.equal(record?.resolvedBy, "engine");
      assert.equal(record?.reEntry, "reconcile:wf-rec");
      assert.equal(reconcileCalls, 1);
      assert.deepEqual(advances, ["wf-rec"], "fixed 后按既有 advance 重入场");
      assert.equal((await readWorkflowLedger(root)).events.length, 0, "不改写/不伪造阶段事件");
    } finally {
      await cleanup(root);
    }
  }
  {
    const root = await makeRoot();
    try {
      const { router } = makeHarness(root, {
        reconcile: async () => ({ corrupt: ["wf-bad: stage.dispatched 引用不存在任务"], errors: [], delivered: [], activeWorkflows: 1 }),
      });
      const fact: BlockFact = {
        protocol: "app-dispatch/v1",
        kind: "reconcile",
        code: "reconcile-corrupt",
        detailCode: "reconcile",
        workflowId: "wf-bad",
        flowId: "flow-bad",
        stage: "B1",
        summary: "对账 corrupt（不可修）",
        fingerprintMaterial: ["reconcile-bad"],
        engineCanRepair: true,
      };
      await router.observeFact(root, fact);
      const blockId = (await raisedEvents(root))[0]!.blockId;
      const escalations = await escalationEvents(root);
      assert.equal(escalations.length, 1);
      assert.equal(escalations[0]!.reason, "unclassified");
      assert.equal(escalations[0]!.to, "owner-reassign");
      const record = await lifecycleOf(root, blockId);
      assert.equal(record?.status, "routed");
      assert.equal(record?.routeKind, "owner-repair");
      const repair = (await taskState(root)).records.get(record?.routeTaskId ?? "");
      assert.ok(repair !== undefined, "不可自动修 ⇒ 属主修复任务（app-dispatch）");
      assert.equal(repair?.created?.taskKind, "repair");
      assert.equal(repair?.created?.blockId, blockId);
      assert.equal(repair?.created?.workflowId, "wf-bad");
      assert.equal(repair?.created?.flowId, "flow-bad");
      assert.equal(repair?.created?.stage, "B1");
      assert.equal((await readWorkflowLedger(root)).events.length, 0, "不改写历史事件");

      // 2026-11-20（R2 收尾修补）：receipt 形状（无 flowId/stage）不再因 task-state 绑定校验失败降级；
      // `deriveRepairBinding` 从 workflow.started/视图派生 flowId/stage；不可得/冲突 ⇒ blockId-only repair 任务
      // （from=application、`block-repair:` 幂等键、24hex blockId、无伪造 stage、不写阶段事件）。
      const receiptCase = async (opts: {
        label: string;
        seedFlowId?: string;
        factFlowId?: string;
        expectBinding: "derived" | "block-id-only";
      }): Promise<void> => {
        const receiptRoot = await makeRoot();
        try {
          const { router: receiptRouter, systemRows } = makeHarness(receiptRoot, {
            reconcile: async () => ({ corrupt: [`${opts.label}: bad`], errors: [], delivered: [], activeWorkflows: 1 }),
          });
          if (opts.seedFlowId !== undefined) {
            await seedWorkflow({ root: receiptRoot, workflowId: opts.label, flowId: opts.seedFlowId, at: new Date(T0).toISOString() });
          }
          const wfBefore = (await readWorkflowLedger(receiptRoot)).events;
          const receiptFact: BlockFact = {
            protocol: "app-dispatch/v1",
            kind: "reconcile",
            code: "reconcile-corrupt",
            detailCode: "reconcile",
            workflowId: opts.label,
            ...(opts.factFlowId !== undefined ? { flowId: opts.factFlowId } : {}),
            summary: "receipt 形状（无完整绑定）",
            fingerprintMaterial: [`reconcile-receipt-${opts.expectBinding}-${opts.label}`],
            engineCanRepair: true,
          };
          await receiptRouter.observeFact(receiptRoot, receiptFact);
          const receiptBlockId = (await raisedEvents(receiptRoot))[0]!.blockId;
          const receiptRecord = await lifecycleOf(receiptRoot, receiptBlockId);
          assert.equal(receiptRecord?.status, "routed");
          assert.equal(receiptRecord?.routeKind, "owner-repair");
          const taskId = receiptRecord?.routeTaskId;
          assert.ok(taskId !== undefined && taskId !== "", "修复任务创建成功（routeTaskId 非空）");
          const repair = (await taskState(receiptRoot)).records.get(taskId!)!;
          assert.equal(repair.created?.from, "application");
          assert.equal(repair.created?.taskKind, "repair");
          assert.equal(repair.created?.blockId, receiptBlockId);
          assert.match(receiptBlockId, /^[a-f0-9]{24}$/);
          assert.equal(repair.created?.idempotencyKey, `block-repair:${receiptBlockId}:2`);
          if (opts.expectBinding === "derived") {
            assert.equal(repair.created?.workflowId, opts.label);
            assert.equal(repair.created?.flowId, opts.seedFlowId, "flowId 从 workflow.started 派生");
            assert.equal(repair.created?.stage, "A1", "stage 从账本视图当前阶段派生");
            assert.match(repair.created?.text ?? "", /（应用从账本派生）/);
          } else {
            assert.equal(repair.created?.workflowId, undefined, "blockId-only：不伪造 workflowId");
            assert.equal(repair.created?.flowId, undefined, "blockId-only：不伪造 flowId");
            assert.equal(repair.created?.stage, undefined, "blockId-only：不伪造 stage");
            assert.match(repair.created?.text ?? "", /仅以 blockId 关联；不伪造阶段/);
          }
          // 不再走 invalid-task-binding 降级；不写阶段事件/伪造完成。
          assert.equal(systemRows.some((row) => String(row.summary).includes("修复任务创建失败")), false);
          assert.equal(systemRows.some((row) => String(row.summary).includes("invalid-task-binding")), false);
          assert.deepEqual((await readWorkflowLedger(receiptRoot)).events, wfBefore, "工作流账本零新增（无伪造阶段/完成）");
          const taskEvents = (await readTaskState(receiptRoot)).events;
          assert.equal(taskEvents.some((event) => event.kind === "task.closed"), false, "无伪造收口");
          assert.equal(taskEvents.filter((event) => event.kind === "task.created").length, 1, "仅修复任务一条创建事件");
        } finally {
          await cleanup(receiptRoot);
        }
      };
      // 形态 1：workflow.started 可派生 ⇒ 完整绑定（派生 flowId + 当前 stage）。
      await receiptCase({ label: "wf-receipt", seedFlowId: "flow-receipt", expectBinding: "derived" });
      // 形态 2：无 workflow.started/不可派生 ⇒ blockId-only（仍合法创建，不绑定工作流）。
      await receiptCase({ label: "wf-orphan", expectBinding: "block-id-only" });
      // 形态 3：事实 flowId 与账本 flowId 冲突 ⇒ 不绑定（实现记录 binding-mismatch 诊断）。
      await receiptCase({ label: "wf-conflict", seedFlowId: "flow-ledger", factFlowId: "flow-fact", expectBinding: "block-id-only" });
    } finally {
      await cleanup(root);
    }
  }
});

test("引擎有界自动修复：attempt 上限/策略 0 ⇒ escalate(budget) 转属主（不无限重试）；恢复重放也受上限", async () => {
  {
    const root = await makeRoot();
    try {
      const { router } = makeHarness(root, { policy: { maxAutoFixAttempts: 0 } });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "network-offline",
        summary: "网络离线", fingerprintMaterial: ["bounded-0"],
      };
      await router.observeFact(root, fact);
      const blockId = (await raisedEvents(root))[0]!.blockId;
      // 上限 0：分类器直接判定不可自动修复 ⇒ 属主修复（不发起引擎动作、不无限重试）。
      assert.equal((await escalationEvents(root)).length, 0, "上限 0 不产生引擎尝试");
      const record = await lifecycleOf(root, blockId);
      assert.equal(record?.routeKind, "owner-repair");
      assert.match(record?.routeReason ?? "", /auto-fix-cap/);
    } finally {
      await cleanup(root);
    }
  }
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const { router } = makeHarness(root, { clock, policy: { maxAutoFixAttempts: 1 } });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "network-offline",
        summary: "网络离线（崩溃前已路由）", fingerprintMaterial: ["bounded-recover"],
      };
      const raised = await raiseBlock({ projectRoot: root, fact, now: () => new Date(clock.now) });
      assert.equal(raised.ok, true);
      if (!raised.ok) return;
      const routed = await routeBlock({
        projectRoot: root, blockId: raised.blockId, route: "engine-auto-fix",
        reason: "environment-infra:bounded-auto-fix", now: () => new Date(clock.now),
      });
      assert.equal(routed.ok, true);
      await router.recover(root);
      const escalations = await escalationEvents(root);
      assert.equal(escalations.length, 1);
      assert.equal(escalations[0]!.reason, "budget");
      assert.match(escalations[0]!.note ?? "", /上限 1/);
      assert.equal((await lifecycleOf(root, raised.blockId))?.routeKind, "owner-repair");
    } finally {
      await cleanup(root);
    }
  }
});

test("T-6 app-dispatch 修复任务：from=application/blockId/不触发阶段完成；证据 sha256 重算通过 ⇒ fixed + 重入场", async () => {
  const root = await makeRoot();
  try {
    const content = "# 契约\n";
    const contentHash = sha(content);
    const fact: BlockFact = {
      protocol: "app-dispatch/v1",
      kind: "dispatch-rejection",
      code: "missing-contract",
      detailCode: "missing-file",
      workflowId: "wf-repair",
      flowId: "flow-repair",
      stage: "A8",
      evidencePaths: ["docs/contracts/y.md"],
      evidenceHashes: [contentHash],
      fingerprintMaterial: ["app-repair"],
      summary: "缺契约：docs/contracts/y.md",
    };
    const { router, delivered, advances } = makeHarness(root);
    await router.observeFact(root, fact);
    const blockId = (await raisedEvents(root))[0]!.blockId;
    const routed = (await routedEvents(root))[0]!;
    assert.equal(routed.route, "owner-repair");
    assert.equal(routed.targetRoleId, "rapporteur");
    const taskId = routed.taskId!;
    assert.ok(taskId !== undefined, "必须有应用修复任务");
    const state = await taskState(root);
    const repair = state.records.get(taskId)!;
    assert.equal(repair.created?.from, "application");
    assert.equal(repair.created?.to, "rapporteur");
    assert.equal(repair.created?.taskKind, "repair");
    assert.equal(repair.created?.blockId, blockId);
    assert.equal(repair.created?.workflowId, "wf-repair");
    assert.equal(repair.created?.flowId, "flow-repair");
    assert.equal(repair.created?.stage, "A8");
    assert.equal(repair.created?.idempotencyKey, `block-repair:${blockId}:1`);
    assert.equal(repair.created?.sideEffect, "unknown");
    assert.deepEqual(repair.created?.requestedEvidence, ["docs/contracts/y.md"]);
    assert.match(repair.created?.text ?? "", new RegExp(`blockId=${blockId}`));
    assert.match(repair.created?.text ?? "", /本任务由应用创建\/收口，\*\*不触发阶段完成\*\*/);
    assert.ok(delivered.some((record) => record.targetRoleId === "rapporteur" && record.item.kind === "dispatch" && record.item.taskId === taskId), "修复任务投递");
    assert.equal((await readWorkflowLedger(root)).events.length, 0, "不写阶段事件");

    await writeProjectFile(root, "docs/contracts/y.md", content);
    await seedTaskReported({ root, taskId, from: "rapporteur", status: "done", summary: "已补契约", evidence: ["docs/contracts/y.md"] });
    await router.observeTaskReport(root, taskId);
    const record = await lifecycleOf(root, blockId);
    assert.equal(record?.status, "resolved");
    assert.equal(record?.resolution, "fixed");
    assert.equal(record?.resolvedBy, "rapporteur");
    assert.equal(record?.reEntry, `repair-task:${taskId}`);
    const closed = (await taskState(root)).records.get(taskId)?.closed;
    assert.equal(closed?.outcome, "accepted");
    assert.deepEqual(advances, ["wf-repair"], "fixed 后重驱动既有阶段");
    assert.equal((await readWorkflowLedger(root)).events.length, 0, "修复任务收口不触发阶段完成");
  } finally {
    await cleanup(root);
  }
});

test("T-6 证据不符/缺失不判 fixed：错误 hash ⇒ 任务 rejected + 升级；补齐后第 2 个修复任务 ⇒ fixed", async () => {
  const root = await makeRoot();
  try {
    const expected = sha("expected content\n");
    const fact: BlockFact = {
      protocol: "app-dispatch/v1",
      kind: "dispatch-rejection",
      code: "missing-contract",
      detailCode: "missing-file",
      workflowId: "wf-evidence",
      flowId: "flow-evidence",
      stage: "A8",
      evidencePaths: ["docs/contracts/z.md"],
      evidenceHashes: [expected],
      fingerprintMaterial: ["app-evidence"],
      summary: "缺契约：docs/contracts/z.md",
    };
    const { router } = makeHarness(root);
    await router.observeFact(root, fact);
    const blockId = (await raisedEvents(root))[0]!.blockId;
    const task1 = (await routedEvents(root))[0]!.taskId!;
    await writeProjectFile(root, "docs/contracts/z.md", "wrong content\n");
    await seedTaskReported({ root, taskId: task1, from: "rapporteur", status: "done", summary: "已修好", evidence: ["docs/contracts/z.md"] });
    await router.observeTaskReport(root, task1);
    let record = await lifecycleOf(root, blockId);
    assert.notEqual(record?.status, "resolved", "hash 不符不判 fixed");
    assert.equal(record?.status, "routed", "升级后重新路由");
    assert.equal(record?.escalationCount, 1);
    const escalated = await escalationEvents(root);
    assert.equal(escalated[0]!.reason, "unclassified");
    assert.match(escalated[0]!.note ?? "", /证据 hash 不符/);
    assert.equal((await taskState(root)).records.get(task1)?.closed?.outcome, "rejected");
    const task2 = record?.routeTaskId;
    assert.ok(task2 !== undefined && task2 !== task1, "升级后创建第 2 个修复任务");
    assert.equal((await taskState(root)).records.get(task2!)?.created?.idempotencyKey, `block-repair:${blockId}:2`);
    // 补齐正确内容 + 第 2 任务报告 ⇒ fixed。
    await writeProjectFile(root, "docs/contracts/z.md", "expected content\n");
    await seedTaskReported({ root, taskId: task2!, from: "rapporteur", status: "done", summary: "已修好", evidence: ["docs/contracts/z.md"] });
    await router.observeTaskReport(root, task2!);
    record = await lifecycleOf(root, blockId);
    assert.equal(record?.status, "resolved");
    assert.equal(record?.resolution, "fixed");
    assert.equal(record?.resolvedBy, "rapporteur");

    // 报告 blocked/failed ⇒ rejected + 升级（不判 fixed）；missing-resource 无证据 ⇒ 不通过。
    const root2 = await makeRoot();
    try {
      const { router: router2 } = makeHarness(root2);
      const fact2: BlockFact = {
        protocol: "app-dispatch/v1", kind: "dispatch-rejection", code: "missing-contract", detailCode: "missing-file",
        workflowId: "wf-report-blocked", flowId: "flow-report-blocked", stage: "A8",
        evidencePaths: ["docs/contracts/w.md"], evidenceHashes: [sha("w\n")], fingerprintMaterial: ["app-blocked"], summary: "缺 w",
      };
      await router2.observeFact(root2, fact2);
      const blockId2 = (await raisedEvents(root2))[0]!.blockId;
      const taskB = (await routedEvents(root2))[0]!.taskId!;
      await seedTaskReported({ root: root2, taskId: taskB, from: "rapporteur", status: "blocked", summary: "补不了" });
      await router2.observeTaskReport(root2, taskB);
      const record2 = await lifecycleOf(root2, blockId2);
      assert.notEqual(record2?.status, "resolved");
      assert.equal((await taskState(root2)).records.get(taskB)?.closed?.outcome, "rejected");
      assert.ok((await escalationEvents(root2)).some((event) => event.reason === "unclassified"));
    } finally {
      await cleanup(root2);
    }
  } finally {
    await cleanup(root);
  }
});

test("fixed-v2.1 修复简报 + T_repair：10min 超时第一次换属主、第二次升级客户卡（不继续等）", async () => {
  const root = await makeRoot();
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({
    presenter: (payload) => { pushed.push(payload); },
    operatorId: "customer-t",
    nextId: () => "op-repair",
  });
  try {
    const clock = { now: T0 };
    const { router, delivered } = makeHarness(root, { clock, customerInput: channel.customerInput });
    const fact: BlockFact = {
      protocol: "fixed-v2.1",
      kind: "task.reported",
      code: "task-report-blocked",
      workflowId: "wf-trepair",
      flowId: "flow-trepair",
      stage: "A8",
      summary: "属主报告 blocked（缺证据）",
      fingerprintMaterial: ["fixed-trepair"],
    };
    await router.observeFact(root, fact);
    const blockId = (await raisedEvents(root))[0]!.blockId;
    let record = await lifecycleOf(root, blockId);
    assert.equal(record?.status, "routed");
    assert.equal(record?.routeKind, "owner-repair");
    assert.equal(record?.routeTargetRoleId, "convener");
    assert.equal(record?.routeTaskId, undefined);
    assert.equal((await taskState(root)).records.size, 0, "fixed-v2.1 不建任务");
    const brief = delivered.find((entry) => entry.item.kind === "system" && String(entry.item.text ?? "").includes(blockId));
    assert.ok(brief !== undefined, "属主收到确定性修复简报（投递队列）");
    assert.match(String(brief!.item.text), /截止：.*超时应用将升级/);
    assert.match(String(brief!.item.text), /不采信自报/);

    // T_repair 第一次：换属主（owner-reassign）。
    clock.now += 10 * 60 * 1000;
    await router.tick(root);
    let escalations = await escalationEvents(root);
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0]!.reason, "repair-timeout");
    assert.equal(escalations[0]!.to, "owner-reassign");
    record = await lifecycleOf(root, blockId);
    assert.equal(record?.routeCount, 2, "升级后再次 routed");

    // T_repair 第二次：升客户决策卡（不无限换属主）。
    clock.now += 10 * 60 * 1000;
    await router.tick(root);
    await waitFor(() => pushed.length === 1, "T_repair 客户卡呈现");
    escalations = await escalationEvents(root);
    assert.equal(escalations.length, 2);
    assert.equal(escalations[1]!.to, "customer-decision");
    assert.equal(pushed[0]!.id, blockCardRequestId(blockId));
    const request = pushed[0]!.request;
    const options = request.kind === "choice" ? request.options : [];
    assert.ok(options.some((option) => option.recommended === true), "客户卡恰一推荐");
    const recommended = options.find((option) => option.recommended === true)!.id;
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: [recommended] } }).ok, true);
    await waitFor(async () => (await lifecycleOf(root, blockId))?.status === "resolved", "客户裁决后 decided");
    record = await lifecycleOf(root, blockId);
    assert.equal(record?.resolution, "decided");
    assert.equal(record?.resolvedBy, "customer");
  } finally {
    channel.rejectAllPending("cleanup");
    await cleanup(root);
  }
});

// —————————————— 3) 决策卡：judge / 客户 / 主权 ——————————————

test("T-3 judge 开 + 唯一推荐 ⇒ by judge + 真实 decisionId + judge 审计；客户卡不呈现", async () => {
  const root = await makeRoot();
  const pushed: OperatorRequestPayload[] = [];
  const judgeRows: OperatorJudgeResultPayload[] = [];
  const channel = createCustomerInputChannel({
    presenter: (payload) => { pushed.push(payload); },
    operatorId: "customer-j",
    nextId: () => "op-judge",
    judge: { isGroupEnabled: (group) => group === "decision" },
    emitJudgeResult: (row) => { judgeRows.push(row); },
  });
  try {
    const { router } = makeHarness(root, { customerInput: channel.customerInput, judgeEnabled: true });
    const fact: BlockFact = {
      protocol: "fixed-v2.1",
      kind: "service-rejection",
      code: "b-change-scope-invalid",
      workflowId: "wf-judge",
      flowId: "flow-judge",
      stage: "B3",
      summary: "范围/写集歧义",
      fingerprintMaterial: ["judge-auto"],
    };
    await router.observeFact(root, fact);
    const blockId = (await raisedEvents(root))[0]!.blockId;
    await waitFor(async () => (await lifecycleOf(root, blockId))?.status === "resolved", "judge 代选结算");
    const record = await lifecycleOf(root, blockId);
    assert.equal(record?.resolution, "decided");
    assert.equal(record?.resolvedBy, "judge");
    assert.equal(record?.decisionId, `decision-block-card-${blockId}`);
    assert.equal(record?.reEntry, "block-revise-scope");
    assert.equal(pushed.length, 0, "judge 代选不呈现客户卡");
    assert.equal(judgeRows.length, 1, "judge 结果行投达一次");
    assert.equal(judgeRows[0]!.group, "decision");
    assert.equal(judgeRows[0]!.cardKind, "decision");
    assert.equal(judgeRows[0]!.reasonCode, "block-recommended");
    assert.deepEqual(judgeRows[0]!.selected, ["block-revise-scope"]);
    assert.equal(judgeRows[0]!.engine, "demo");
    const state = await taskState(root);
    const resolved = state.events.find((event) => event.kind === "request.resolved") as Extract<TaskStateEvent, { kind: "request.resolved" }> | undefined;
    assert.ok(resolved !== undefined);
    assert.equal(resolved!.requestId, blockCardRequestId(blockId));
    assert.equal(resolved!.by, "judge");
    assert.equal(resolved!.operatorId, "judge:demo");
    assert.equal(resolved!.decisionId, `decision-${blockCardRequestId(blockId)}`);
    assert.equal(resolved!.judge?.engine, "demo");
  } finally {
    channel.rejectAllPending("cleanup");
    await cleanup(root);
  }
});

test("T-3 开关关闭 ⇒ 客户卡；judge 结果行不可用 ⇒ 客户卡附 judgeNotice（不硬编结论）", async () => {
  {
    const root = await makeRoot();
    const pushed: OperatorRequestPayload[] = [];
    const rows: OperatorJudgeResultPayload[] = [];
    const channel = createCustomerInputChannel({
      presenter: (payload) => { pushed.push(payload); },
      operatorId: "customer-off",
      nextId: () => "op-off",
      judge: { isGroupEnabled: () => true },
      emitJudgeResult: (row) => { rows.push(row); },
    });
    try {
      const { router, systemRows } = makeHarness(root, { customerInput: channel.customerInput, judgeEnabled: false });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
        workflowId: "wf-off", flowId: "flow-off", stage: "B3", summary: "开关关闭",
        fingerprintMaterial: ["judge-off"],
      };
      await router.observeFact(root, fact);
      await waitFor(() => pushed.length === 1, "客户卡呈现");
      assert.equal(rows.length, 0, "开关关闭不调用 judge");
      const blockId = (await raisedEvents(root))[0]!.blockId;
      assert.equal(pushed[0]!.id, blockCardRequestId(blockId));
      assert.equal((await lifecycleOf(root, blockId))?.routeKind, "customer-decision");
      const options = pushed[0]!.request.kind === "choice" ? pushed[0]!.request.options : [];
      const recommended = options.find((option) => option.recommended === true)!.id;
      assert.ok(recommended.length > 0, "推荐项仍在卡面（仅供客户参考）");
      // 客户选择「带限制接受」（非推荐项）：decided + 下游披露（不伪造阶段完成）。
      assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["block-accept-with-limits"] } }).ok, true);
      await waitFor(async () => (await lifecycleOf(root, blockId))?.status === "resolved", "客户裁决");
      const record = await lifecycleOf(root, blockId);
      assert.equal(record?.resolvedBy, "customer");
      assert.equal(record?.reEntry, "block-accept-with-limits");
      assert.ok(systemRows.some((row) => String(row.summary).includes("[Block·披露]") && String(row.summary).includes("按现状继续并在下游交付披露限制")), "接受限制写入披露");
    } finally {
      channel.rejectAllPending("cleanup");
      await cleanup(root);
    }
  }
  {
    const root = await makeRoot();
    const pushed: OperatorRequestPayload[] = [];
    let judgeAttempts = 0;
    const channel = createCustomerInputChannel({
      presenter: (payload) => { pushed.push(payload); },
      operatorId: "customer-manual",
      nextId: () => "op-manual",
      judge: { isGroupEnabled: (group) => group === "decision" },
      emitJudgeResult: () => { judgeAttempts += 1; throw new Error("结果行投达失败（测试）"); },
    });
    try {
      const { router } = makeHarness(root, { customerInput: channel.customerInput, judgeEnabled: true });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
        workflowId: "wf-manual", flowId: "flow-manual", stage: "B3", summary: "结果行失败",
        fingerprintMaterial: ["judge-manual-fallback"],
      };
      await router.observeFact(root, fact);
      await waitFor(() => pushed.length === 1, "回落后客户卡呈现");
      assert.equal(judgeAttempts, 1, "judge 结果行尝试一次");
      assert.ok(typeof pushed[0]!.judgeNotice === "string" && pushed[0]!.judgeNotice.length > 0, "客户卡附 judge 回落原因");
      const blockId = (await raisedEvents(root))[0]!.blockId;
      assert.equal((await lifecycleOf(root, blockId))?.routeKind, "judge-decision", "路由仍是 judge 面（由通道确定性回落）");
      const options = pushed[0]!.request.kind === "choice" ? pushed[0]!.request.options : [];
      const recommended = options.find((option) => option.recommended === true)!.id;
      assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: [recommended] } }).ok, true);
      await waitFor(async () => (await lifecycleOf(root, blockId))?.status === "resolved", "客户裁决");
      const record = await lifecycleOf(root, blockId);
      assert.equal(record?.resolvedBy, "customer");
      assert.equal(record?.decisionId, `decision-${blockCardRequestId(blockId)}`);
    } finally {
      channel.rejectAllPending("cleanup");
      await cleanup(root);
    }
  }
});

test("T-4 客户主权：高危/终止 judge 永不代选；客户终止 ⇒ 停稳披露 + decided（不是 stopped 态）", async () => {
  const root = await makeRoot();
  const pushed: OperatorRequestPayload[] = [];
  const judgeRows: OperatorJudgeResultPayload[] = [];
  const channel = createCustomerInputChannel({
    presenter: (payload) => { pushed.push(payload); },
    operatorId: "customer-sovereign",
    nextId: () => "op-sovereign",
    judge: { isGroupEnabled: () => true },
    emitJudgeResult: (row) => { judgeRows.push(row); },
  });
  try {
    const clock = { now: T0 };
    const { router, systemRows } = makeHarness(root, { clock, customerInput: channel.customerInput, judgeEnabled: true });
    // 停稳前提：workflow.started + stop-requested + 请求任务已报告/收口 + 无 open 生产任务。
    await seedWorkflow({ root, workflowId: "wf-term", at: new Date(T0 - 60_000).toISOString() });
    const stopRequested: WorkflowEvent = {
      v: 1, at: new Date(T0 - 50_000).toISOString(), schema: WORKFLOW_LEDGER_SCHEMA, kind: "workflow.stop-requested",
      workflowId: "wf-term", flowId: "flow-wf-term", path: "A",
      idempotencyKey: "stop-requested:test", stage: "A1", requestTaskId: "t-stop-req", reason: "test", requestedBy: "chief",
    };
    assert.equal((await appendWorkflowEvent(root, stopRequested)).ok, true);
    await seedTaskCreated({ root, taskId: "t-stop-req", to: "convener", text: "停稳" });
    await seedTaskReported({ root, taskId: "t-stop-req", from: "convener", status: "done", summary: "已停稳" });
    assert.equal((await appendTaskEvent(root, taskEvent("task.closed", {
      taskId: "t-stop-req", by: "chief", outcome: "accepted", note: "停稳请求收口",
    }, () => new Date(T0)))).ok, true);

    const fact: BlockFact = {
      protocol: "fixed-v2.1",
      kind: "service-rejection",
      code: "high-risk-blocked",
      highRisk: true,
      workflowId: "wf-term",
      flowId: "flow-wf-term",
      stage: "A12",
      summary: "高风险动作 blocked",
      fingerprintMaterial: ["sovereign-terminate"],
    };
    await router.observeFact(root, fact);
    await waitFor(() => pushed.length === 1, "主权卡呈现");
    assert.equal(judgeRows.length, 0, "judge 永不代选主权卡");
    const blockId = (await raisedEvents(root))[0]!.blockId;
    assert.equal(pushed[0]!.id, blockCardRequestId(blockId));
    const request = pushed[0]!.request;
    const options = request.kind === "choice" ? request.options : [];
    const ids = options.map((option) => option.id);
    assert.ok(ids.includes("block-terminate-flow"));
    assert.ok(ids.includes("block-grant-exception"));
    assert.ok(options.find((option) => option.recommended === true)!.id !== "block-terminate-flow", "终止永不推荐");
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["block-terminate-flow"] } }).ok, true);
    await waitFor(async () => (await lifecycleOf(root, blockId))?.status === "resolved", "客户终止结算");
    const record = await lifecycleOf(root, blockId);
    assert.equal(record?.resolution, "decided", "block 终态是 decided（不是 stopped）");
    assert.equal(record?.resolvedBy, "customer");
    assert.equal(record?.reEntry, "block-terminate-flow");
    const closed = (await readWorkflowLedger(root)).events.find((event) => event.kind === "workflow.closed");
    assert.ok(closed !== undefined, "既有 confirmStop 停稳写 workflow.closed");
    if (closed?.kind === "workflow.closed") {
      assert.equal(closed.outcome, "stopped");
      assert.deepEqual(closed.stopEvidence, { requestClosed: true, operatorReported: true, openProductionTaskIds: [] });
    }
    assert.ok(systemRows.some((row) => String(row.summary).includes("[Block·终止]") && String(row.summary).includes("decided")), "终止披露系统行");
    assert.equal((await blockEvents(root)).some((event) => event.kind === "block.resolved" && event.resolution === ("stopped" as never)), false);
  } finally {
    channel.rejectAllPending("cleanup");
    await cleanup(root);
  }
});

test("T-4 通道防御：伪造 blockJudgePermitted + 主权选项也不代选；终止无停稳前提 ⇒ 如实简报不伪造 stopped", async () => {
  const root = await makeRoot();
  const pushed: OperatorRequestPayload[] = [];
  let judgeRows = 0;
  const channel = createCustomerInputChannel({
    presenter: (payload) => { pushed.push(payload); },
    operatorId: "customer-def",
    nextId: () => "op-def",
    judge: { isGroupEnabled: () => true },
    emitJudgeResult: () => { judgeRows += 1; },
  });
  try {
    // 直接调用通道（防御层）：应用发行 block 卡 + blockJudgePermitted=true + 主权选项。
    const promise = channel.customerInput(
      {
        kind: "choice", cardKind: "decision", application: true, sourceRoleId: "application",
        flowId: "flow-def", title: "[Block] 高危",
        options: [
          { id: "block-retry-with-cap", label: "限次重试", recommended: true },
          { id: "block-terminate-flow", label: "显式终止本次流程" },
        ],
      },
      { roleId: "application", runtime: "demo", projectRoot: root, governanceModel: "trio" },
      { cardKind: "decision", blockId: "b".repeat(24), blockJudgePermitted: true },
    );
    await waitFor(() => pushed.length === 1, "通道主权防御呈现");
    assert.equal(judgeRows, 0, "主权选项永不代选（即使 metadata 声称 permitted）");
    assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["block-terminate-flow"] } }).ok, true);
    const outcome = await promise;
    assert.equal(outcome?.outcome, "answered");
    if (outcome?.outcome === "answered") {
      assert.deepEqual(outcome.value.selected, ["block-terminate-flow"]);
      assert.equal(outcome.judge, undefined);
    }

    // 无 workflow 的终止：router 只投递显式停稳简报，不伪造 workflow.closed。
    const { router, delivered } = makeHarness(root, { customerInput: channel.customerInput });
    const fact: BlockFact = {
      protocol: "legacy", kind: "service-rejection", code: "high-risk-blocked", highRisk: true,
      flowId: "flow-legacy", summary: "高风险（无 workflow）", fingerprintMaterial: ["terminate-no-workflow"],
    };
    await router.observeFact(root, fact);
    await waitFor(() => pushed.length === 2, "第二张卡呈现");
    assert.equal(channel.respond({ id: pushed[1]!.id, decision: { kind: "choice", selected: ["block-terminate-flow"] } }).ok, true);
    const blockId = (await raisedEvents(root))[0]!.blockId;
    await waitFor(async () => (await lifecycleOf(root, blockId))?.status === "resolved", "无 workflow 终止结算");
    assert.equal((await lifecycleOf(root, blockId))?.resolution, "decided");
    assert.equal((await readWorkflowLedger(root)).events.length, 0, "不伪造 workflow.closed");
    assert.ok(delivered.some((record) => record.item.kind === "system" && String(record.item.text ?? "").includes("应用未伪造停稳")), "显式停稳简报");
  } finally {
    channel.rejectAllPending("cleanup");
    await cleanup(root);
  }
});

test("T-5 卡未答不执行 / 同 block 卡幂等 / 一项目一卡排队", async () => {
  // 未答（declined）≠ 决策：block 保持 routed。
  {
    const root = await makeRoot();
    try {
      const requests: CustomerInputRequest[] = [];
      const customerInput: DesktopCustomerInputFn = async (request) => {
        requests.push(request);
        return { outcome: "declined", operatorId: "customer", reason: "测试未答" };
      };
      const { router } = makeHarness(root, { customerInput });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
        workflowId: "wf-unanswered", flowId: "flow-unanswered", stage: "B3",
        summary: "未答", fingerprintMaterial: ["card-unanswered"],
      };
      await router.observeFact(root, fact);
      await waitFor(() => requests.length === 1, "卡呈现一次");
      const blockId = (await raisedEvents(root))[0]!.blockId;
      const record = await lifecycleOf(root, blockId);
      assert.equal(record?.status, "routed", "未答保持 routed（可见等待）");
      assert.equal(recordsResolvedCount(await blockEvents(root)), 0, "未答不执行/不结算");
      await router.tick(root);
      assert.equal(requests.length, 1, "同一张卡不重弹");
    } finally {
      await cleanup(root);
    }
  }
  // 同 block 卡幂等：requestId 确定，同 block 只一张卡；重复观察 ⇒ escalated(repeat)。
  {
    const root = await makeRoot();
    const pushed: OperatorRequestPayload[] = [];
    const channel = createCustomerInputChannel({ presenter: (payload) => { pushed.push(payload); }, operatorId: "customer-i", nextId: () => "op-idem" });
    try {
      const { router } = makeHarness(root, { customerInput: channel.customerInput });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
        workflowId: "wf-idem", flowId: "flow-idem", stage: "B3",
        summary: "幂等卡", fingerprintMaterial: ["card-idem"],
      };
      await router.observeFact(root, fact);
      await waitFor(() => pushed.length === 1, "首张卡");
      const blockId = (await raisedEvents(root))[0]!.blockId;
      await router.observeFact(root, fact);
      assert.equal((await raisedEvents(root)).length, 1, "同 block 不重复 raised");
      assert.equal((await escalationEvents(root)).some((event) => event.reason === "repeat"), true, "重复观察 ⇒ escalated(repeat)");
      const created = (await taskState(root)).events.filter((event) => event.kind === "request.created" && event.requestId === blockCardRequestId(blockId));
      assert.equal(created.length, 1, "同一 block 只呈现一张卡");
      assert.equal(pushed.length, 1);
      assert.equal(pushed[0]!.id, blockCardRequestId(blockId));
      const options = pushed[0]!.request.kind === "choice" ? pushed[0]!.request.options : [];
      const recommended = options.find((option) => option.recommended === true)!.id;
      assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: [recommended] } }).ok, true);
      await waitFor(async () => (await lifecycleOf(root, blockId))?.status === "resolved", "卡裁决收口");
    } finally {
      channel.rejectAllPending("cleanup");
      await cleanup(root);
    }
  }
  // 一项目一卡：两个 block 排队，前卡答后后卡呈现。
  {
    const root = await makeRoot();
    const pushed: OperatorRequestPayload[] = [];
    const channel = createCustomerInputChannel({ presenter: (payload) => { pushed.push(payload); }, operatorId: "customer-q", nextId: () => "op-queue" });
    try {
      const { router } = makeHarness(root, { customerInput: channel.customerInput });
      const factA: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
        workflowId: "wf-q", flowId: "flow-q", stage: "B3", taskId: "t-q1",
        summary: "范围 A", fingerprintMaterial: ["queue-a"],
      };
      const factB: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
        workflowId: "wf-q", flowId: "flow-q", stage: "B3", taskId: "t-q2",
        summary: "范围 B", fingerprintMaterial: ["queue-b"],
      };
      await router.observeFact(root, factA);
      await waitFor(() => pushed.length === 1, "首卡呈现");
      await router.observeFact(root, factB);
      await waitFor(() => channel.queuedCount() === 1, "第二张卡排队");
      assert.equal(pushed.length, 1, "一项目只呈现一张");
      const blockIdA = computeBlockId({ ...factA, judgeAvailable: false });
      const blockIdB = computeBlockId({ ...factB, judgeAvailable: false });
      const optionsA = pushed[0]!.request.kind === "choice" ? pushed[0]!.request.options : [];
      assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: [optionsA.find((option) => option.recommended === true)!.id] } }).ok, true);
      await waitFor(async () => (await lifecycleOf(root, blockIdA))?.status === "resolved", "首卡收口");
      await waitFor(() => pushed.length === 2, "第二张卡随后呈现");
      assert.equal(pushed[1]!.id, blockCardRequestId(blockIdB));
      const optionsB = pushed[1]!.request.kind === "choice" ? pushed[1]!.request.options : [];
      assert.equal(channel.respond({ id: pushed[1]!.id, decision: { kind: "choice", selected: [optionsB.find((option) => option.recommended === true)!.id] } }).ok, true);
      await waitFor(async () => (await lifecycleOf(root, blockIdB))?.status === "resolved", "第二卡收口");
      assert.equal((await lifecycleOf(root, blockIdA))?.resolvedBy, "customer");
      assert.equal((await lifecycleOf(root, blockIdB))?.resolvedBy, "customer");
    } finally {
      channel.rejectAllPending("cleanup");
      await cleanup(root);
    }
  }
});

function recordsResolvedCount(events: readonly BlockLedgerEvent[]): number {
  return events.filter((event) => event.kind === "block.resolved").length;
}

test("T_remind：30min 同卡只提醒一次（不重弹、不执行）；法定等待可见", async () => {
  const root = await makeRoot();
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => { pushed.push(payload); }, operatorId: "customer-r", nextId: () => "op-remind" });
  try {
    const clock = { now: T0 };
    const { router, systemRows } = makeHarness(root, { clock, customerInput: channel.customerInput });
    const fact: BlockFact = {
      protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
      workflowId: "wf-remind", flowId: "flow-remind", stage: "B3",
      summary: "等待提醒", fingerprintMaterial: ["remind"],
    };
    await router.observeFact(root, fact);
    await waitFor(() => pushed.length === 1, "卡呈现");
    const blockId = (await raisedEvents(root))[0]!.blockId;
    clock.now += 30 * 60 * 1000;
    await router.tick(root);
    const reminders = systemRows.filter((row) => String(row.summary).includes("[Block·提醒]"));
    assert.equal(reminders.length, 1, "T_remind 提醒一次");
    assert.match(String(reminders[0]!.summary), /同一张卡（不重弹），无答复不执行/);
    await router.tick(root);
    assert.equal(systemRows.filter((row) => String(row.summary).includes("[Block·提醒]")).length, 1, "同 block 不重复提醒");
    assert.equal(pushed.length, 1, "不重弹新卡");
    assert.equal((await lifecycleOf(root, blockId))?.status, "routed", "无答复不执行");
  } finally {
    channel.rejectAllPending("cleanup");
    await cleanup(root);
  }
});

// —————————————— 4) 重复 / 恢复 / review 名单 ——————————————

test("重复同指纹：只 escalated(repeat) 一次并升级；第三次观察不产生新事件（防风暴）", async () => {
  const root = await makeRoot();
  try {
    const { router } = makeHarness(root);
    const fact: BlockFact = {
      protocol: "fixed-v2.1", kind: "task.reported", code: "task-report-blocked",
      workflowId: "wf-repeat", flowId: "flow-repeat", stage: "A8",
      summary: "同指纹重复", fingerprintMaterial: ["router-repeat"],
    };
    await router.observeFact(root, fact);
    await router.observeFact(root, fact);
    await router.observeFact(root, fact);
    const raised = await raisedEvents(root);
    assert.equal(raised.length, 1, "同 block 不重复 raised");
    const escalations = await escalationEvents(root);
    assert.equal(escalations.length, 1, "重复只升级一次（防风暴）");
    assert.equal(escalations[0]!.reason, "repeat");
    assert.equal(escalations[0]!.to, "executor-replace");
    const record = await lifecycleOf(root, raised[0]!.blockId);
    assert.equal(record?.status, "routed", "升级必须后接 routed");
    assert.equal(record?.escalationCount, 1);
    assert.equal(record?.routeCount, 2, "首次路由 + 升级后路由");
  } finally {
    await cleanup(root);
  }
});

test("恢复/启动对账：raised 补路由；已裁决未处理的客户卡按账本执行；已报告修复任务重走收口", async () => {
  // (a) raised → recover 补 routed。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const { router } = makeHarness(root, { clock });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "network-offline",
        summary: "崩溃前只 raise", fingerprintMaterial: ["recover-raised"],
      };
      const raised = await raiseBlock({ projectRoot: root, fact, now: () => new Date(clock.now) });
      assert.equal(raised.ok, true);
      if (!raised.ok) return;
      assert.equal((await lifecycleOf(root, raised.blockId))?.status, "raised");
      await router.recover(root);
      const record = await lifecycleOf(root, raised.blockId);
      assert.equal(record?.status, "routed");
      assert.equal(record?.routeKind, "owner-repair", "引擎动作失败 ⇒ 属主（如实升级）");
      assert.ok((await escalationEvents(root)).some((event) => event.reason === "unclassified"));
    } finally {
      await cleanup(root);
    }
  }
  // (b) 客户卡已裁决（request.resolved 在账本）但进程崩溃未执行 ⇒ recover 按裁决结算。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const { router } = makeHarness(root, { clock });
      const fact: BlockFact = {
        protocol: "fixed-v2.1", kind: "service-rejection", code: "b-change-scope-invalid",
        workflowId: "wf-recover-card", flowId: "flow-recover-card", stage: "B3",
        summary: "崩溃前卡已答", fingerprintMaterial: ["recover-card"],
      };
      const raised = await raiseBlock({ projectRoot: root, fact, now: () => new Date(clock.now) });
      assert.equal(raised.ok, true);
      if (!raised.ok) return;
      const requestId = blockCardRequestId(raised.blockId);
      assert.equal((await routeBlock({
        projectRoot: root, blockId: raised.blockId, route: "customer-decision",
        reason: "scope-tradeoff:customer-decision", cardRequestId: requestId, now: () => new Date(clock.now),
      })).ok, true);
      assert.equal((await appendTaskEvent(root, taskEvent("request.created", {
        requestId, cardKind: "decision", flowId: "flow-recover-card", sourceRoleId: "application",
        title: "[Block] 范围", options: [
          { id: "block-revise-scope", label: "修订范围后继续", recommended: true },
          { id: "block-rework", label: "返工" },
        ],
      }, () => new Date(clock.now)))).ok, true);
      assert.equal((await appendTaskEvent(root, taskEvent("request.resolved", {
        requestId, cardKind: "decision", by: "customer",
        decisionId: "decision-recovered", operatorId: "customer", choice: "block-revise-scope",
        selectedOptionIds: ["block-revise-scope"],
      }, () => new Date(clock.now)))).ok, true);
      await router.recover(root);
      const record = await lifecycleOf(root, raised.blockId);
      assert.equal(record?.status, "resolved");
      assert.equal(record?.resolution, "decided");
      assert.equal(record?.resolvedBy, "customer");
      assert.equal(record?.decisionId, "decision-recovered");
      assert.equal(record?.reEntry, "block-revise-scope");
    } finally {
      await cleanup(root);
    }
  }
  // (c) 修复任务已报告未收口 ⇒ recover 重走证据核验/收口。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const content = "# recovered\n";
      const { router } = makeHarness(root, { clock });
      const fact: BlockFact = {
        protocol: "app-dispatch/v1", kind: "dispatch-rejection", code: "missing-contract", detailCode: "missing-file",
        workflowId: "wf-recover-repair", flowId: "flow-recover-repair", stage: "A8",
        evidencePaths: ["docs/contracts/r.md"], evidenceHashes: [sha(content)],
        fingerprintMaterial: ["recover-repair"], summary: "恢复修复任务",
      };
      await router.observeFact(root, fact);
      const raised = (await raisedEvents(root))[0]!;
      const taskId = (await routedEvents(root))[0]!.taskId!;
      await writeProjectFile(root, "docs/contracts/r.md", content);
      await seedTaskReported({ root, taskId, from: "rapporteur", status: "done", summary: "已修", evidence: ["docs/contracts/r.md"] });
      await router.recover(root);
      const record = await lifecycleOf(root, raised.blockId);
      assert.equal(record?.status, "resolved");
      assert.equal(record?.resolution, "fixed");
      assert.equal(record?.resolvedBy, "rapporteur");
    } finally {
      await cleanup(root);
    }
  }
});

test("review 名单不可读：driveAppDispatchStage 返回 review-role-unavailable + blockFact；router 路由 rapporteur（不回落 verifier）", async () => {
  const root = await makeRoot();
  try {
    const selected = await selectWorkflow({
      projectRoot: root, flowId: "snake", workflowPath: "A", sourceTaskId: "turn-review-1",
      now: () => new Date(T0),
    });
    assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
    if (!selected.ok) return;
    assert.equal(selected.definition.version, 3, "新 select 使用 v3 定义");
    for (const stage of ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as WorkflowStage[]) {
      await seedStageCompleted({ root, workflowId: selected.workflowId, flowId: "snake", stage, at: new Date(T0 + 1000).toISOString() });
    }
    const drive = await driveAppDispatchStage({ projectRoot: root, workflowId: selected.workflowId, stage: "A12a", now: () => new Date(T0 + 2000) });
    assert.equal(drive.ok, false);
    if (drive.ok) return;
    assert.equal(drive.code, "review-role-unavailable");
    assert.ok(drive.blockFact !== undefined, "服务拒绝必须携可序列化 blockFact");
    assert.equal(drive.blockFact!.code, "review-role-unavailable");
    assert.equal(drive.blockFact!.detailCode, "roster-unreadable");
    assert.equal(drive.blockFact!.ownerRoleId, "rapporteur");
    assert.equal(drive.blockFact!.protocol, "app-dispatch/v1");

    const { router } = makeHarness(root);
    await router.observeFact(root, drive.blockFact!);
    const raised = (await raisedEvents(root))[0]!;
    assert.equal(raised.class, "missing-resource");
    const record = await lifecycleOf(root, raised.blockId);
    assert.equal(record?.routeKind, "owner-repair");
    assert.equal(record?.routeTargetRoleId, "rapporteur");
    const tasks = [...(await taskState(root)).records.values()];
    const repair = tasks.find((task) => task.created?.taskKind === "repair");
    assert.ok(repair !== undefined, "创建属主修复任务");
    assert.equal(repair!.created?.to, "rapporteur");
    assert.equal(tasks.some((task) => task.created?.to === "verifier"), false, "不静默回落 verifier");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2026-11-20（SMOKE-1 seams 测试批）：block 必现 / 重试衔接 / 恢复读回 / 并发修复 ——————————————

test("SMOKE-1 A2 blocked（Q8 重试成功）：observe blockFact/blockOutcome 经 router 必现 raised→routed(engine-auto-fix)→resolved(fixed)；零 repair", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const selected = await selectWorkflow({
      projectRoot: root, flowId: "snake", workflowPath: "A", sourceTaskId: "turn-smoke-a2", now: () => new Date(T0),
    });
    assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
    if (!selected.ok) return;
    const wf = selected.workflowId;
    const drive = await driveAppDispatchStage({ projectRoot: root, workflowId: wf, stage: "A2", now: () => new Date(T0) });
    assert.equal(drive.ok, true, drive.ok === false ? `${drive.code}: ${drive.message}` : "");
    if (!drive.ok) return;
    const taskId = drive.tasks[0]!.taskId;
    await seedTaskReported({ root, taskId, from: "product", status: "blocked", summary: "意图输入缺失" });

    // 编排服务只交事实，不写 blocks.jsonl；Q8 重试成功 ⇒ retrying / detailCode=reconcile。
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId, now: () => new Date(T0) });
    assert.equal(observed.ok, true, observed.ok === false ? `${observed.code}: ${observed.message}` : "");
    if (!observed.ok) return;
    assert.deepEqual(observed.retried, { stage: "A2", attempt: 2 });
    assert.equal(observed.blockOutcome, "retrying");
    assert.ok(observed.blockFact !== undefined, "blocked 报告必须有事实出口（SMOKE-1 A2 无 blocks.jsonl 的根因防线）");
    assert.equal(observed.blockFact!.code, "task-report-blocked");
    assert.equal(observed.blockFact!.detailCode, "reconcile");
    assert.equal(observed.blockFact!.engineCanRepair, true);
    assert.equal(await blockEvents(root).then((events) => events.length), 0, "服务不写 blocks 账本（桌面 router 消费）");

    const { router } = makeHarness(root, { clock });
    await router.observeFact(root, observed.blockFact!);
    const raised = await raisedEvents(root);
    assert.equal(raised.length, 1, "即使 Q8 重试成功，blocks.jsonl 也必须出现 block.raised");
    const event = raised[0]!;
    assert.equal(event.code, "task-report-blocked");
    assert.equal(event.protocol, "app-dispatch/v1");
    assert.equal(event.class, "protocol-reconcile", "detailCode=reconcile ⇒ B6（不是 model-anomaly）");
    assert.equal(event.detailCode, "reconcile", "raised 持久化 detailCode（恢复读回）");
    assert.equal(event.engineCanRepair, true, "raised 持久化 engineCanRepair");
    assert.equal(event.taskId, taskId);
    assert.equal(event.workflowId, wf);
    assert.equal(event.stage, "A2");
    const record = await lifecycleOf(root, event.blockId);
    assert.equal(record?.status, "resolved");
    assert.equal(record?.resolution, "fixed");
    assert.equal(record?.routeKind, "engine-auto-fix", "重试路径 ⇒ engine-auto-fix（不并发建 owner-repair）");
    assert.equal(record?.routeTargetRoleId, undefined);
    assert.deepEqual(
      (await blockEvents(root)).filter((entry) => entry.blockId === event.blockId).map((entry) => entry.kind),
      ["block.raised", "block.routed", "block.resolved"],
      "SMOKE-1 形状 raised→routed(engine-auto-fix)→resolved(fixed)",
    );
    const state = await taskState(root);
    const a2 = [...state.records.values()].filter((task) => task.created?.workflowId === wf && task.created.stage === "A2");
    assert.equal(a2.length, 2, "A2 仅 attempt1+attempt2（不重复建任务）");
    assert.equal(a2.filter((task) => task.created?.idempotencyKey === stageExecutionIdempotencyKey(wf, "A2", "product", 2)).length, 1);
    assert.equal([...state.records.values()].filter((task) => task.created?.taskKind === "repair").length, 0, "引擎重试期间零属主修复任务");
  } finally {
    await cleanup(root);
  }
});

test("Q8 重试耗尽 ⇒ observe blockOutcome=escalated（retry-budget-exhausted）经 router 路由客户决策卡；不靠 retry 消化", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const selected = await selectWorkflow({
      projectRoot: root, flowId: "snake", workflowPath: "A", sourceTaskId: "turn-smoke-a2-exhausted", now: () => new Date(T0),
    });
    assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
    if (!selected.ok) return;
    const wf = selected.workflowId;
    const drive = await driveAppDispatchStage({ projectRoot: root, workflowId: wf, stage: "A2", now: () => new Date(T0) });
    assert.equal(drive.ok, true, drive.ok === false ? `${drive.code}: ${drive.message}` : "");
    if (!drive.ok) return;
    const firstTaskId = drive.tasks[0]!.taskId;
    await seedTaskReported({ root, taskId: firstTaskId, from: "product", status: "blocked", summary: "第一次阻塞" });
    const observed1 = await observeAppDispatchTaskReport({ projectRoot: root, taskId: firstTaskId, now: () => new Date(T0) });
    assert.equal(observed1.ok, true);
    if (!observed1.ok) return;
    assert.equal(observed1.blockOutcome, "retrying");
    const { router } = makeHarness(root, {
      clock,
      customerInput: async () => ({ outcome: "declined", reason: "seam-test: card not answered" }),
    });
    // SMOKE-1「A2 blocked 两次」：第一次 blocked（Q8 重试成功）也必须入 blocks.jsonl。
    await router.observeFact(root, observed1.blockFact!);
    const firstBlock = (await raisedEvents(root)).find((event) => event.taskId === firstTaskId);
    assert.ok(firstBlock !== undefined, "第一次 blocked 必须入账（不得等耗尽）");
    assert.equal(firstBlock!.class, "protocol-reconcile");
    const firstRecord = await lifecycleOf(root, firstBlock!.blockId);
    assert.equal(firstRecord?.status, "resolved");
    assert.equal(firstRecord?.resolution, "fixed");
    assert.equal(firstRecord?.routeKind, "engine-auto-fix");

    const attempt2 = [...(await taskState(root)).records.values()].find((task) =>
      task.created?.idempotencyKey === stageExecutionIdempotencyKey(wf, "A2", "product", 2));
    assert.ok(attempt2 !== undefined, "Q8 重试任务存在");
    await seedTaskReported({ root, taskId: attempt2!.taskId, from: "product", status: "blocked", summary: "第二次阻塞" });
    const observed2 = await observeAppDispatchTaskReport({ projectRoot: root, taskId: attempt2!.taskId, now: () => new Date(T0) });
    assert.equal(observed2.ok, true, observed2.ok === false ? `${observed2.code}: ${observed2.message}` : "");
    if (!observed2.ok) return;
    assert.deepEqual(observed2.blocked, { retryBudgetExhausted: true, highRiskNoRedispatch: false });
    assert.equal(observed2.blockOutcome, "escalated", "预算耗尽 ⇒ escalated（不得只靠 retry 消化）");
    assert.equal(observed2.blockFact?.code, "retry-budget-exhausted");

    await router.observeFact(root, observed2.blockFact!);
    const raised = await raisedEvents(root);
    assert.equal(raised.length, 2, "A2 blocked 两次 ⇒ blocks.jsonl 两条 raised（SMOKE-1 根因防线）");
    const budgetRaised = raised.find((event) => event.class === "budget-quota");
    assert.ok(budgetRaised !== undefined);
    const record = await lifecycleOf(root, budgetRaised!.blockId);
    assert.equal(record?.routeKind, "customer-decision", "B9 ⇒ 客户决策面（不是 engine-auto-fix/owner-repair）");
    assert.equal(record?.status, "routed");
    assert.ok(record?.cardRequestId !== undefined && record.cardRequestId.length > 0, "客户决策卡已发行");
    await waitFor(async () => {
      const state = await taskState(root);
      return state.events.some((item) => item.kind === "request.created" && item.requestId === record!.cardRequestId);
    }, "retry-budget-exhausted 客户卡 request.created");
    const state = await taskState(root);
    const a2 = [...state.records.values()].filter((task) => task.created?.workflowId === wf && task.created.stage === "A2");
    assert.equal(a2.length, 2, "预算耗尽不得建第 3 个任务");
    assert.equal([...state.records.values()].filter((task) => task.created?.taskKind === "repair").length, 0, "客户面不建 repair 任务");
  } finally {
    await cleanup(root);
  }
});

test("恢复重路由读回 detailCode/engineCanRepair：raised 持久化 ⇒ recover 仍 engine-auto-fix（不回落 model-anomaly/owner-repair）", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const fact: BlockFact = {
      protocol: "app-dispatch/v1",
      kind: "task.reported",
      code: "task-report-blocked",
      detailCode: "reconcile",
      engineCanRepair: true,
      workflowId: "wf-recover-detail",
      flowId: "snake",
      stage: "A2",
      taskId: "t-a2-recover-detail",
      summary: "Q8 重试在办事实（恢复读回）",
      fingerprintMaterial: ["recover-detailcode", "t-a2-recover-detail"],
    };
    const raised = await raiseBlock({ projectRoot: root, fact, now: () => new Date(T0) });
    assert.equal(raised.ok, true, raised.ok === false ? `${raised.code}: ${raised.message}` : "");
    if (!raised.ok) return;
    const beforeRecover = await lifecycleOf(root, raised.blockId);
    assert.equal(beforeRecover?.status, "raised");
    assert.equal(beforeRecover?.detailCode, "reconcile", "BlockLifecycle 重放携带 detailCode");
    assert.equal(beforeRecover?.engineCanRepair, true, "BlockLifecycle 重放携带 engineCanRepair");
    const raisedEvent = (await raisedEvents(root)).find((event) => event.blockId === raised.blockId)!;
    assert.equal(raisedEvent.detailCode, "reconcile", "block.raised 行持久化 detailCode");
    assert.equal(raisedEvent.engineCanRepair, true, "block.raised 行持久化 engineCanRepair");

    const { router, advances } = makeHarness(root, { clock });
    await router.recover(root);
    const record = await lifecycleOf(root, raised.blockId);
    assert.equal(record?.status, "resolved");
    assert.equal(record?.resolution, "fixed");
    assert.equal(record?.routeKind, "engine-auto-fix", "恢复后按原分类走 engine-auto-fix（不回落 model-anomaly→owner-repair）");
    assert.equal(record?.routeTargetRoleId, undefined);
    // 引擎动作 + fixed 后重入场各驱动一次（既有 reEnterAfterFixed 语义；两次都不建修复任务）。
    assert.equal(advances.length >= 1, true, "引擎动作 = app-dispatch 重驱动");
    assert.equal(advances.every((workflowId) => workflowId === "wf-recover-detail"), true);
    assert.equal((await taskState(root)).records.size, 0, "恢复重路由不伪造任务");
  } finally {
    await cleanup(root);
  }
});

test("并发两个 router 同键修复任务：账本仅 1 条 repair、routed 同 taskId（败方消费 replay 回执）", async () => {
  const root = await makeRoot();
  try {
    const fact: BlockFact = {
      protocol: "app-dispatch/v1",
      kind: "service-rejection",
      code: "missing-contract",
      detailCode: "missing-file",
      workflowId: "wf-concurrent-repair",
      flowId: "flow-concurrent-repair",
      stage: "A8",
      evidencePaths: ["docs/contracts/x.md"],
      summary: "并发属主修复任务",
      fingerprintMaterial: ["concurrent-repair-task"],
    };
    const blockId = computeBlockId(fact);
    const first = makeHarness(root);
    const second = makeHarness(root);
    await Promise.all([
      first.router.observeFact(root, fact),
      second.router.observeFact(root, fact),
    ]);
    const events = await blockEvents(root);
    assert.equal(events.filter((event) => event.kind === "block.raised" && event.blockId === blockId).length, 1, "同事实只 raised 一条");
    const routed = events.filter((event): event is Extract<BlockLedgerEvent, { kind: "block.routed" }> =>
      event.kind === "block.routed" && event.blockId === blockId);
    assert.equal(routed.length, 1, "同键 routed 只写一条（attempt 幂等）");
    assert.equal(routed[0]!.route, "owner-repair");
    assert.ok(routed[0]!.taskId !== undefined, "routed 记录修复任务 taskId");
    const tasks = [...(await taskState(root)).records.values()].filter((task) =>
      task.created?.taskKind === "repair" && task.created.blockId === blockId);
    assert.equal(tasks.length, 1, `同键并发修复任务只允许一条（实际 ${tasks.length}）`);
    assert.equal(tasks[0]!.taskId, routed[0]!.taskId, "路由/投递消费账本回执 taskId（不得按本地 newTaskId 写第二条）");
    assert.equal(tasks[0]!.created?.idempotencyKey, `block-repair:${blockId}:1`);
    assert.equal([...(await taskState(root)).records.values()].filter((task) =>
      task.created?.idempotencyKey === `block-repair:${blockId}:1`).length, 1, "同键修复任务账本仅 1 条");
  } finally {
    await cleanup(root);
  }
});

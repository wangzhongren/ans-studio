// test/编排/app-dispatch-block-reentry.test.ts
// 2026-11-20（SMOKE-2 S1 测试批，测试角色）：**block resolved 后阶段重入场（服务级）**。
//
// 依据（权威）：
//   1. `角色卡/编排/docs/change/2026-11-20_change_block-reentry-task-texts-foundation.md`
//      §一（状态机/API 语义/幂等/reconcile）、§四（版本/hash 钉死）、§六（待测试点）；
//   2. `角色卡/桌面窗口/docs/change/2026-11-20_change_block-reentry-task-texts-desktop.md` §四.2–§四.5。
// 背景：SMOKE-2 B8 owner-repair `resolved(fixed)` 后应用反复 `drive.failed`（Q8 预算拒绝）；本批把
// 「block 已解 → 阶段显式重入场（stage.reworked 带 blockId、同阶段、新 attempt）→ 再 drive」收敛为
// 唯一服务 API `reenterBlockedStageAfterResolution`。
//
// 覆盖（真实临时目录 + 真实工作流/任务/block 账本；无端口、无 .env、无 Git）：
//   1. fixed 全链：A2 blocked（Q8 耗尽）→ block resolved(fixed) ⇒ 恰一条 rework（blockId、同阶段、
//      attempt=旧+1）+ 唯一新 attempt 任务 → done 收口 A2 → nextStages 含 A3；
//   2. 幂等/并发：重复调用 replay（同 eventId/taskId、零新增）；Promise.all 双触发仅一条 rework/任务；
//   3. engine-auto-fix 来源：阶段已完成 ⇒ alreadyCompleted（零 rework）；阶段在飞 ⇒ alreadyInFlight；
//   4. decided 面：重入场类选项成功；terminate ⇒ block-reentry-inapplicable；resolution 不符 ⇒ mismatch；
//   5. 校验面：未 resolved / 绑定不一致 / fixed-v2.1 / 坏 blocks 行 的稳定失败码；
//   6. reconcile 补驱动：带 blockId rework 的 pending 补一次 drive（不新开尝试）；普通 pending 不驱动；
//   7. 共存：已有 stage=A2 repair 任务时重入仍只产生一条新 attempt 任务；
//   8. v2 在飞：definition v2（按 v2 hash 解释）仍能 fixed 重入成功（不静默迁移）；
//   9. 状态机负例：带 blockId 但 stage≠reworkOf / 非 blocked / 空 blockId ⇒ corrupt 或 invalid；
//      无 blockId 的普通 MF-IR-1（A3→A2）语义逐字不变。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  BLOCK_STAGE_REENTRY_OPTION_IDS,
  appDispatchTaskId,
  appendWorkflowEvent,
  driveAppDispatchStage,
  observeAppDispatchTaskReport,
  readWorkflowLedger,
  reconcileFixedWorkflow,
  reenterBlockedStageAfterResolution,
  selectWorkflow,
  stageExecutionIdempotencyKey,
} from "../../src/common/编排/workflow-service.ts";
import {
  WORKFLOW_DEFINITION_HASHES,
  WORKFLOW_DEFINITION_HASHES_BY_VERSION,
} from "../../src/common/编排/workflow-definitions.ts";
import { blockFactFromStageBlocked, type BlockFact } from "../../src/common/编排/block-resolution.ts";
import {
  raiseBlock,
  readBlockLedger,
  replayBlockLifecycles,
  resolveBlock,
  routeBlock,
} from "../../src/common/编排/block-ledger.ts";
import {
  appendTaskEvent,
  readTaskState,
  taskEvent,
  type TaskRecord,
} from "../../src/common/编排/task-state.ts";
import { deriveWorkflowView, nextStages } from "../../src/common/编排/workflow-state.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  WORKFLOW_PROTOCOL_FIXED_V2_1,
  type WorkflowEvent,
  type WorkflowPath,
  type WorkflowStage,
} from "../../src/model/runtime.ts";

const FLOW = "snake";
const AT = "2026-11-20T00:00:00.000Z";
const NOW = () => new Date(AT);

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function makeRoot(prefix = "ans-block-reentry-svc-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
}

// —————————————— 事件构造（手工播种用；与生产账本形状一致） ——————————————

interface EventBase {
  workflowId: string;
  flowId?: string;
  path?: WorkflowPath;
  at?: string;
}

function baseOf(input: EventBase): {
  v: 1;
  at: string;
  schema: typeof WORKFLOW_LEDGER_SCHEMA;
  workflowId: string;
  flowId: string;
  path: WorkflowPath;
} {
  return {
    v: 1 as const,
    at: input.at ?? AT,
    schema: WORKFLOW_LEDGER_SCHEMA,
    workflowId: input.workflowId,
    flowId: input.flowId ?? FLOW,
    path: input.path ?? "A",
  };
}

function startedEvent(input: EventBase & {
  protocol?: string;
  definition?: { id: string; version: number; sha256: string };
}): WorkflowEvent {
  const base = baseOf(input);
  // app-dispatch/v1 的 workflow.started 必须携带定义引用（形状守卫）；缺省给当前 v3。
  const definition = input.definition ?? (input.protocol === WORKFLOW_PROTOCOL_APP_DISPATCH
    ? {
        id: base.path === "B" ? "modify" : "add",
        version: 3,
        sha256: base.path === "B" ? WORKFLOW_DEFINITION_HASHES.modify : WORKFLOW_DEFINITION_HASHES.add,
      }
    : undefined);
  return {
    ...base,
    kind: "workflow.started",
    idempotencyKey: `workflow-start:${base.flowId}:${base.path}:seed-${input.workflowId}`,
    trigger: { by: "chief", reason: "test" },
    sourceTaskId: `turn-${input.workflowId}`,
    ...(input.protocol !== undefined ? { protocol: input.protocol as never } : {}),
    ...(definition !== undefined ? { definition } : {}),
  };
}

function requestedEvent(input: EventBase & {
  stage: WorkflowStage; attempt?: number; taskId?: string;
}): WorkflowEvent {
  const base = baseOf(input);
  const attempt = input.attempt ?? 1;
  return {
    ...base,
    kind: "stage.requested",
    idempotencyKey: `stage-request:${input.workflowId}:${input.stage}:${attempt}`,
    stage: input.stage,
    requestTaskId: input.taskId ?? `seed-task:${input.stage}:${attempt}`,
    requestDigest: sha(`seed-${input.stage}-${attempt}`),
    attempt,
    issuedBy: "application",
  };
}

function completedEvent(input: EventBase & { stage: WorkflowStage; ref?: string }): WorkflowEvent {
  const base = baseOf(input);
  return {
    ...base,
    kind: "stage.completed",
    idempotencyKey: `seed-complete:${input.workflowId}:${input.stage}`,
    stage: input.stage,
    cause: { kind: "task-closed", ref: input.ref ?? `seed-task:${input.stage}:1` },
    artifacts: [],
  };
}

function blockedEvent(input: EventBase & {
  stage: WorkflowStage; code?: string; summary?: string; attempt?: number; taskId?: string;
}): WorkflowEvent {
  const base = baseOf(input);
  const attempt = input.attempt ?? 1;
  return {
    ...base,
    kind: "stage.blocked",
    idempotencyKey: `stage-block:${input.workflowId}:${input.stage}:${attempt}:${input.code ?? "task-closed-rejected"}`,
    stage: input.stage,
    code: input.code ?? "task-closed-rejected",
    summary: input.summary ?? "阶段任务被拒",
    attempt,
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
  };
}

function reworkedEvent(input: EventBase & {
  stage: WorkflowStage; reworkOf: WorkflowStage; attempt: number; blockId?: string; reason?: string;
}): WorkflowEvent {
  const base = baseOf(input);
  return {
    ...base,
    kind: "stage.reworked",
    idempotencyKey: `stage-rework:${input.workflowId}:${input.stage}:${input.attempt}${input.blockId !== undefined ? `:${input.blockId}` : ""}`,
    stage: input.stage,
    reworkOf: input.reworkOf,
    reason: input.reason ?? "seed rework",
    attempt: input.attempt,
    ...(input.blockId !== undefined ? { blockId: input.blockId } : {}),
  };
}

async function append(root: string, event: WorkflowEvent): Promise<void> {
  const done = await appendWorkflowEvent(root, event);
  assert.equal(done.ok, true, done.ok === false ? done.message : "");
}

/** 播种「已完成阶段」：真实账本顺序 requested（attempt1）→ completed。 */
async function appendCompletedStage(root: string, input: EventBase & { stage: WorkflowStage }): Promise<void> {
  await append(root, requestedEvent({ ...input, attempt: 1 }));
  await append(root, completedEvent(input));
}

/** 手工播种 app-dispatch/v1 workflow（缺省当前 v3 定义；可指定 v2 在飞）。 */
async function seedAppDispatchWorkflow(root: string, input: {
  workflowId: string;
  flowId?: string;
  path?: WorkflowPath;
  version?: 2 | 3;
  at?: string;
}): Promise<void> {
  const id = (input.path ?? "A") === "B" ? "modify" : "add";
  const version = input.version ?? 3;
  await append(root, startedEvent({
    workflowId: input.workflowId,
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.path !== undefined ? { path: input.path } : {}),
    ...(input.at !== undefined ? { at: input.at } : {}),
    protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
    definition: {
      id,
      version,
      sha256: version === 3 ? WORKFLOW_DEFINITION_HASHES[id] : WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][2],
    },
  }));
}

/** 统一入口：selectWorkflow(A) 起新 workflow（新 select 钉 v3；A1 创建即完成）。 */
async function startA(root: string, sourceTaskId = "turn-reentry-1"): Promise<string> {
  const selected = await selectWorkflow({
    projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId, now: NOW,
  });
  assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
  if (!selected.ok) throw new Error("unreachable");
  return selected.workflowId;
}

async function driveOk(root: string, workflowId: string, stage: WorkflowStage) {
  const driven = await driveAppDispatchStage({ projectRoot: root, workflowId, stage, now: NOW });
  assert.equal(driven.ok, true, driven.ok === false ? `${driven.code}: ${driven.message}` : "");
  if (!driven.ok) throw new Error("unreachable");
  return driven;
}

async function tasksOfStage(root: string, workflowId: string, stage: WorkflowStage): Promise<TaskRecord[]> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((record) =>
    record.created?.workflowId === workflowId && record.created.stage === stage);
}

async function reportTask(
  root: string,
  taskId: string,
  status: "done" | "blocked" | "failed",
  summary: string,
  evidence?: string[],
): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.reported", {
    taskId,
    from: "product",
    status,
    summary,
    ...(evidence !== undefined ? { evidence } : {}),
  }, NOW));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function wfEventsOf(root: string, workflowId: string): Promise<WorkflowEvent[]> {
  return (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === workflowId);
}

async function viewOf(root: string, workflowId: string) {
  const state = await readTaskState(root);
  return deriveWorkflowView(await wfEventsOf(root, workflowId), state.events);
}

async function lastStageBlocked(root: string, workflowId: string, stage: WorkflowStage) {
  const blocked = (await wfEventsOf(root, workflowId))
    .filter((event): event is Extract<WorkflowEvent, { kind: "stage.blocked" }> =>
      event.kind === "stage.blocked" && event.stage === stage);
  return blocked[blocked.length - 1];
}

interface SeedBlockInput {
  root: string;
  fact: BlockFact;
  route?: "owner-repair" | "customer-decision" | "engine-auto-fix";
  resolution?: "fixed" | "decided";
  reEntry?: string;
  by?: string;
  decisionId?: string;
}

/** raise → route → resolve 一块账本事实（真实 block 账本）。 */
async function seedResolvedBlock(input: SeedBlockInput): Promise<{ blockId: string }> {
  const raised = await raiseBlock({ projectRoot: input.root, fact: input.fact, now: NOW });
  assert.equal(raised.ok, true, raised.ok === false ? `${raised.code}: ${raised.message}` : "");
  if (!raised.ok) throw new Error("unreachable");
  const resolution = input.resolution ?? "fixed";
  const route = input.route ?? (resolution === "fixed" ? "owner-repair" : "customer-decision");
  const routed = await routeBlock({
    projectRoot: input.root,
    blockId: raised.blockId,
    route,
    reason: `test:${route}`,
    ...(route === "owner-repair" ? { targetRoleId: "convener" } : {}),
    now: NOW,
  });
  assert.equal(routed.ok, true, routed.ok === false ? `${routed.code}: ${routed.message}` : "");
  const resolved = await resolveBlock({
    projectRoot: input.root,
    blockId: raised.blockId,
    resolution,
    by: input.by ?? (resolution === "fixed" ? "convener" : "customer"),
    ...(input.reEntry !== undefined ? { reEntry: input.reEntry } : {}),
    ...(resolution === "decided" ? { decisionId: input.decisionId ?? "decision-test-1" } : {}),
    note: "test resolved",
    now: NOW,
  });
  assert.equal(resolved.ok, true, resolved.ok === false ? `${resolved.code}: ${resolved.message}` : "");
  return { blockId: raised.blockId };
}

/** A2 blocked（真实服务路径：Q8 重试耗尽）夹具；返回 workflowId / 最新 A2 task / 阶段 blocked 事实。 */
async function setupBlockedA2(root: string): Promise<{
  workflowId: string;
  attempt1TaskId: string;
  attempt2TaskId: string;
  fact: BlockFact;
}> {
  const workflowId = await startA(root);
  const drive1 = await driveOk(root, workflowId, "A2");
  const attempt1TaskId = drive1.tasks[0]!.taskId;
  await reportTask(root, attempt1TaskId, "blocked", "意图输入缺失（attempt1）");
  const observed1 = await observeAppDispatchTaskReport({ projectRoot: root, taskId: attempt1TaskId, now: NOW });
  assert.equal(observed1.ok, true, observed1.ok === false ? `${observed1.code}: ${observed1.message}` : "");
  if (observed1.ok) {
    assert.equal(observed1.outcome, "rejected");
    assert.deepEqual(observed1.retried, { stage: "A2", attempt: 2 }, "Q8 一次自动重试（attempt2）");
    assert.equal(observed1.blockOutcome, "retrying");
  }
  const attempt2TaskId = appDispatchTaskId(stageExecutionIdempotencyKey(workflowId, "A2", "product", 2));
  await reportTask(root, attempt2TaskId, "blocked", "意图输入仍缺失（attempt2）");
  const observed2 = await observeAppDispatchTaskReport({ projectRoot: root, taskId: attempt2TaskId, now: NOW });
  assert.equal(observed2.ok, true, observed2.ok === false ? `${observed2.code}: ${observed2.message}` : "");
  if (observed2.ok) {
    assert.equal(observed2.outcome, "rejected");
    assert.equal(observed2.blocked?.retryBudgetExhausted, true, "attempt2 后预算耗尽");
    assert.equal(observed2.blockOutcome, "escalated");
    assert.equal(observed2.blockFact?.code, "retry-budget-exhausted");
  }
  const view = await viewOf(root, workflowId);
  assert.equal(view.stages.A2.status, "blocked", "A2 停在 blocked（S1 起点）");
  const blocked = await lastStageBlocked(root, workflowId, "A2");
  assert.ok(blocked !== undefined, "账本必须有 stage.blocked A2");
  return {
    workflowId,
    attempt1TaskId,
    attempt2TaskId,
    fact: blockFactFromStageBlocked(blocked!, {
      protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
      judgeAvailable: false,
      source: "test.stage-blocked",
      fingerprintMaterial: ["reentry-test", workflowId, "A2", String(blocked!.attempt)],
    }),
  };
}

function stageReworkEvents(events: WorkflowEvent[], stage: WorkflowStage) {
  return events.filter((event): event is Extract<WorkflowEvent, { kind: "stage.reworked" }> =>
    event.kind === "stage.reworked" && event.stage === stage);
}

// —————————————— 1) fixed 全链 ——————————————

test("S1 fixed 重入全链：A2 blocked（Q8 耗尽）→ resolved(fixed) ⇒ 一条 block rework(attempt3)+唯一 attempt3 任务 → done 收口 A2 → nextStages 含 A3", async () => {
  const root = await makeRoot();
  try {
    const { workflowId, attempt1TaskId, attempt2TaskId, fact } = await setupBlockedA2(root);
    const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
    assert.equal(fact.stage, "A2");
    assert.equal(fact.workflowId, workflowId);

    const eventsBefore = await wfEventsOf(root, workflowId);
    const tasksBefore = (await tasksOfStage(root, workflowId, "A2")).length;
    assert.equal(tasksBefore, 2, "重入前仅 attempt1/2");

    const re = await reenterBlockedStageAfterResolution({
      projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed",
      reason: "B8 owner-repair 已核验", now: NOW,
    });
    assert.equal(re.ok, true, re.ok === false ? `${re.code}: ${re.message}` : "");
    if (!re.ok) return;
    assert.equal(re.replay, false, "首次调用不是 replay");
    assert.equal(re.driveError, undefined, "drive 必须成功（无 driveError）");
    assert.equal(re.alreadyCompleted, undefined);
    assert.equal(re.alreadyInFlight, undefined);
    assert.equal(re.reentry?.stage, "A2");
    assert.equal(re.reentry?.attempt, 3, "attempt = 旧 max(2)+1");
    assert.equal(re.reentry?.eventId, `stage-rework:${workflowId}:A2:3`, "rework 幂等键确定性派生");
    const expectedTask3 = appDispatchTaskId(stageExecutionIdempotencyKey(workflowId, "A2", "product", 3));
    assert.equal(re.reentry?.taskId, expectedTask3, "stage-exec:<wf>:A2:product:3 任务键确定性派生");
    assert.equal(re.driven !== undefined, true, "drive 回执存在");
    assert.equal(re.driven?.attempt, 3);
    assert.equal(re.driven?.requested, true, "新 attempt 已写 stage.requested");
    assert.equal(re.driven?.dispatched, true, "新 attempt 已写 stage.dispatched");
    assert.equal(re.driven?.completed, false);

    // 事件事实：恰一条 rework（blockId、stage===reworkOf、attempt=3）；stage.requested/dispatched 存在。
    const eventsAfter = await wfEventsOf(root, workflowId);
    const reworks = stageReworkEvents(eventsAfter, "A2");
    assert.equal(reworks.length, 1, `恰一条 stage.reworked（实际 ${reworks.length}）`);
    assert.equal(reworks[0]!.blockId, blockId, "rework 携带 blockId");
    assert.equal(reworks[0]!.reworkOf, "A2");
    assert.equal(reworks[0]!.attempt, 3);
    assert.match(reworks[0]!.reason, /B8 owner-repair/);
    const requested3 = eventsAfter.filter((event) =>
      event.kind === "stage.requested" && event.stage === "A2" && event.attempt === 3);
    assert.equal(requested3.length, 1, "stage.requested A2 attempt3 恰一条");
    const dispatched3 = eventsAfter.filter((event) =>
      event.kind === "stage.dispatched" && event.stage === "A2" && (event as { taskId?: string }).taskId === expectedTask3);
    assert.equal(dispatched3.length, 1, "stage.dispatched A2 attempt3 恰一条");

    // 任务事实：A2 只有 attempt1/2/3 三条；attempt3 唯一且同 taskId。
    const a2Tasks = await tasksOfStage(root, workflowId, "A2");
    assert.equal(a2Tasks.length, 3, `A2 任务总数 = 3（实际 ${a2Tasks.length}）`);
    assert.deepEqual(
      a2Tasks.map((record) => record.taskId).sort(),
      [attempt1TaskId, attempt2TaskId, expectedTask3].sort(),
    );
    const attempt3Key = stageExecutionIdempotencyKey(workflowId, "A2", "product", 3);
    assert.equal(a2Tasks.filter((record) => record.created?.idempotencyKey === attempt3Key).length, 1, "attempt3 唯一");

    // 对账 drive 不失败：reconcile 无 corrupt/errors；阶段在飞 ⇒ 幂等复跑不新增事件/任务。
    const rec = await reconcileFixedWorkflow({ projectRoot: root, workflowId, now: NOW });
    assert.equal(rec.ok, true, rec.ok === false ? `${rec.code}: ${rec.message}` : "");
    if (!rec.ok) return;
    assert.equal(rec.workflows.length, 1);
    assert.equal(rec.workflows[0]!.corrupt, undefined);
    assert.deepEqual(rec.workflows[0]!.errors, [], "对账 drive 零失败（S1 回归核心）");
    assert.equal((await wfEventsOf(root, workflowId)).length, eventsAfter.length, "reconcile 不新增账本事件");
    assert.equal((await tasksOfStage(root, workflowId, "A2")).length, 3, "reconcile 不新增任务");

    // 新 attempt 报告 done → observe accepted → stage.completed A2 → nextStages 含 A3（block fixed→阶段完成等价）。
    await writeFile(root, "docs/product/snake-intent-v1.md",
      "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\n---\n# 意图\n");
    await reportTask(root, expectedTask3, "done", "意图完成", ["docs/product/snake-intent-v1.md"]);
    const observed3 = await observeAppDispatchTaskReport({ projectRoot: root, taskId: expectedTask3, now: NOW });
    assert.equal(observed3.ok, true, observed3.ok === false ? `${observed3.code}: ${observed3.message}` : "");
    if (!observed3.ok) return;
    assert.equal(observed3.outcome, "accepted");
    assert.equal(observed3.stageCompleted, true, "A2 收口完成（attempt3 accepted）");
    const view = await viewOf(root, workflowId);
    assert.equal(view.stages.A2.status, "completed");
    assert.equal(view.stages.A2.attempt, 3);
    assert.equal(view.stage, "A2");
    assert.ok([...nextStages(view)].includes("A3"), `nextStages 必须含 A3（实际 ${nextStages(view).join("/")}）`);
    // 不再产生第二条 rework。
    assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 1);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2) 幂等 / 并发 ——————————————

test("S1 幂等：重复调用 replay=true（同 eventId/taskId、零新增）；Promise.all 双触发仅一条 rework/一条新任务", async () => {
  // 2a) 串行重复：同 (blockId, stage) 第二次 replay，不新增事件/任务。
  {
    const root = await makeRoot();
    try {
      const { workflowId, fact } = await setupBlockedA2(root);
      const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const first = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(first.ok, true, first.ok === false ? `${first.code}: ${first.message}` : "");
      if (!first.ok) return;
      assert.equal(first.replay, false);
      const wfCount = (await wfEventsOf(root, workflowId)).length;
      const taskCount = (await readTaskState(root)).events.length;
      const second = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(second.ok, true, second.ok === false ? `${second.code}: ${second.message}` : "");
      if (!second.ok) return;
      assert.equal(second.replay, true, "同 (blockId, stage) 重复调用 ⇒ replay");
      assert.equal(second.reentry?.eventId, first.reentry?.eventId, "同 eventId");
      assert.equal(second.reentry?.attempt, first.reentry?.attempt, "同 attempt");
      assert.equal(second.reentry?.taskId, first.reentry?.taskId, "同 taskId（确定性派生）");
      assert.equal((await wfEventsOf(root, workflowId)).length, wfCount, "replay 零新增工作流事件");
      assert.equal((await readTaskState(root)).events.length, taskCount, "replay 零新增任务事件");
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 1, "始终只有一条 rework");
    } finally {
      await cleanup(root);
    }
  }
  // 2b) 并发双触发：锁串行 + 账本 guard ⇒ 一条 rework、一条 attempt3 任务。
  {
    const root = await makeRoot();
    try {
      const { workflowId, fact } = await setupBlockedA2(root);
      const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const [left, right] = await Promise.all([
        reenterBlockedStageAfterResolution({
          projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
        }),
        reenterBlockedStageAfterResolution({
          projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
        }),
      ]);
      assert.equal(left.ok, true, left.ok === false ? `${left.code}: ${left.message}` : "");
      assert.equal(right.ok, true, right.ok === false ? `${right.code}: ${right.message}` : "");
      if (!left.ok || !right.ok) return;
      assert.equal([left.replay, right.replay].filter((flag) => flag === true).length, 1, "并发下恰一次 replay");
      assert.equal(left.reentry?.eventId, right.reentry?.eventId, "双触发同 eventId");
      assert.equal(left.reentry?.taskId, right.reentry?.taskId, "双触发同 taskId");
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 1, "并发只写一条 rework");
      const a2Tasks = await tasksOfStage(root, workflowId, "A2");
      assert.equal(a2Tasks.length, 3, "并发不双建 attempt3 任务");
      assert.equal(a2Tasks.filter((record) =>
        record.created?.idempotencyKey === stageExecutionIdempotencyKey(workflowId, "A2", "product", 3)).length, 1);
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 3) engine-auto-fix 来源 ——————————————

test("S1 engine-auto-fix 来源：阶段已 completed ⇒ alreadyCompleted（零 rework）；阶段在飞 ⇒ alreadyInFlight（零 rework/任务）", async () => {
  // 3a) 引擎重试已成功完成阶段：不写 rework，调用方继续 advance 下一阶段。
  {
    const root = await makeRoot();
    try {
      const workflowId = await startA(root);
      const attempt1 = await driveOk(root, workflowId, "A2");
      await writeFile(root, "docs/product/snake-intent-v1.md",
        "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\n---\n# 意图\n");
      await reportTask(root, attempt1.tasks[0]!.taskId, "done", "意图完成", ["docs/product/snake-intent-v1.md"]);
      const observed = await observeAppDispatchTaskReport({
        projectRoot: root, taskId: attempt1.tasks[0]!.taskId, now: NOW,
      });
      assert.equal(observed.ok, true);
      if (observed.ok) assert.equal(observed.stageCompleted, true);
      const view = await viewOf(root, workflowId);
      assert.equal(view.stages.A2.status, "completed", "阶段已由引擎重试完成");
      const blockedForFact = blockedEvent({
        workflowId, stage: "A2", code: "task-closed-rejected", summary: "旧 blocked（历史）",
      });
      const fact = blockFactFromStageBlocked(
        blockedForFact as Extract<WorkflowEvent, { kind: "stage.blocked" }>,
        { protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, fingerprintMaterial: ["reentry-completed-case"] },
      );
      const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const wfCount = (await wfEventsOf(root, workflowId)).length;
      const taskCount = (await readTaskState(root)).events.length;
      const re = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(re.ok, true, re.ok === false ? `${re.code}: ${re.message}` : "");
      if (!re.ok) return;
      assert.equal(re.alreadyCompleted, true);
      assert.equal(re.reentry, undefined, "不写 rework");
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0, "零 rework");
      assert.equal((await wfEventsOf(root, workflowId)).length, wfCount, "零新增工作流事件");
      assert.equal((await readTaskState(root)).events.length, taskCount, "零新增任务");
    } finally {
      await cleanup(root);
    }
  }
  // 3b) 阶段已有在飞尝试（dispatched）：不并列第二条 rework/任务。
  {
    const root = await makeRoot();
    try {
      const workflowId = await startA(root);
      const attempt1 = await driveOk(root, workflowId, "A2"); // stage.requested + dispatched（在飞）
      const view = await viewOf(root, workflowId);
      assert.equal(view.stages.A2.status, "dispatched");
      const blockedForFact = blockedEvent({
        workflowId, stage: "A2", code: "task-report-blocked", summary: "旧 blocked（历史）",
      });
      const fact = blockFactFromStageBlocked(
        blockedForFact as Extract<WorkflowEvent, { kind: "stage.blocked" }>,
        { protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, fingerprintMaterial: ["reentry-inflight-case"] },
      );
      const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const wfCount = (await wfEventsOf(root, workflowId)).length;
      const taskCount = (await readTaskState(root)).events.length;
      const re = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(re.ok, true, re.ok === false ? `${re.code}: ${re.message}` : "");
      if (!re.ok) return;
      assert.equal(re.alreadyInFlight, true);
      assert.equal(re.reentry, undefined);
      assert.equal(re.driven, undefined);
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0, "零 rework");
      assert.equal((await wfEventsOf(root, workflowId)).length, wfCount, "零新增工作流事件");
      assert.equal((await readTaskState(root)).events.length, taskCount, "零新增任务");
      assert.equal((await tasksOfStage(root, workflowId, "A2")).length, 1, "不双建任务");
      assert.equal(attempt1.tasks[0]!.taskId, (await tasksOfStage(root, workflowId, "A2"))[0]!.taskId);
    } finally {
      await cleanup(root);
    }
  }
  // 3c) 阶段仅 requested（未 dispatch）同样视为在飞。
  {
    const root = await makeRoot();
    try {
      const workflowId = "wf-reentry-requested";
      await seedAppDispatchWorkflow(root, { workflowId });
      await appendCompletedStage(root, { workflowId, stage: "A1" });
      await append(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
      const fact = blockFactFromStageBlocked(
        blockedEvent({ workflowId, stage: "A2" }) as Extract<WorkflowEvent, { kind: "stage.blocked" }>,
        { protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, fingerprintMaterial: ["reentry-requested-case"] },
      );
      const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const re = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(re.ok, true, re.ok === false ? `${re.code}: ${re.message}` : "");
      if (!re.ok) return;
      assert.equal(re.alreadyInFlight, true);
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0);
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 4) decided 面 ——————————————

test("S1 decided：修订/返工/换执行者/限次重试 ⇒ 重入成功；terminate ⇒ block-reentry-inapplicable；resolution 不符 ⇒ mismatch", async () => {
  assert.deepEqual(
    [...BLOCK_STAGE_REENTRY_OPTION_IDS],
    ["block-revise-scope", "block-rework", "block-replace-executor", "block-retry-with-cap"],
    "重入场类选项冻结",
  );
  assert.equal(BLOCK_STAGE_REENTRY_OPTION_IDS.includes("block-terminate-flow"), false);
  assert.equal(BLOCK_STAGE_REENTRY_OPTION_IDS.includes("block-accept-current-state"), false);

  // 4a) decided(block-revise-scope) ⇒ 服务重入成功（一条 rework + attempt3 任务）。
  {
    const root = await makeRoot();
    try {
      const { workflowId, fact } = await setupBlockedA2(root);
      const { blockId } = await seedResolvedBlock({
        root, fact, resolution: "decided", reEntry: "block-revise-scope", by: "customer", decisionId: "decision-1",
      });
      const lifecycle = replayBlockLifecycles((await readBlockLedger(root)).events).records.get(blockId);
      assert.equal(lifecycle?.resolution, "decided");
      assert.equal(lifecycle?.reEntry, "block-revise-scope");
      const re = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "decided", now: NOW,
      });
      assert.equal(re.ok, true, re.ok === false ? `${re.code}: ${re.message}` : "");
      if (!re.ok) return;
      assert.equal(re.reentry?.attempt, 3);
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 1);
      assert.equal((await tasksOfStage(root, workflowId, "A2")).length, 3);
    } finally {
      await cleanup(root);
    }
  }
  // 4b) decided(block-terminate-flow)：不属于重入场类 ⇒ 稳定拒绝、零 rework。
  {
    const root = await makeRoot();
    try {
      const { workflowId, fact } = await setupBlockedA2(root);
      const { blockId } = await seedResolvedBlock({
        root, fact, resolution: "decided", reEntry: "block-terminate-flow", by: "customer", decisionId: "decision-term",
      });
      const wfCount = (await wfEventsOf(root, workflowId)).length;
      const taskCount = (await readTaskState(root)).events.length;
      const re = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "decided", now: NOW,
      });
      assert.equal(re.ok, false);
      if (re.ok) return;
      assert.equal(re.code, "block-reentry-inapplicable");
      assert.match(re.message, /block-terminate-flow/);
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0, "零 rework");
      assert.equal((await wfEventsOf(root, workflowId)).length, wfCount);
      assert.equal((await readTaskState(root)).events.length, taskCount);
    } finally {
      await cleanup(root);
    }
  }
  // 4c) 账本终态与请求 resolution 不符 ⇒ block-resolution-mismatch（两个方向）。
  {
    const root = await makeRoot();
    try {
      const { workflowId, fact } = await setupBlockedA2(root);
      const { blockId: fixedBlock } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const wrong1 = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId: fixedBlock, resolution: "decided", now: NOW,
      });
      assert.equal(wrong1.ok, false);
      if (!wrong1.ok) assert.equal(wrong1.code, "block-resolution-mismatch");
      // 第二块：decided（重入场类选项）但请求 fixed ⇒ mismatch。
      const fact2: BlockFact = {
        ...fact,
        fingerprintMaterial: ["reentry-decided-vs-fixed", workflowId],
      };
      const { blockId: decidedBlock } = await seedResolvedBlock({
        root, fact: fact2, resolution: "decided", reEntry: "block-rework", by: "judge", decisionId: "decision-j",
      });
      const wrong2 = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId: decidedBlock, resolution: "fixed", now: NOW,
      });
      assert.equal(wrong2.ok, false);
      if (!wrong2.ok) assert.equal(wrong2.code, "block-resolution-mismatch");
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0, "失败不写 rework");
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 5) 校验面 ——————————————

test("S1 校验面：未 resolved ⇒ block-not-resolved；绑定不一致 ⇒ block-resolution-mismatch；fixed-v2.1 ⇒ workflow-protocol-mismatch；坏 blocks 行 ⇒ block-ledger-corrupt", async () => {
  // 5a) raised（未 routed）与 routed（未 resolved）都拒绝。
  {
    const root = await makeRoot();
    try {
      const { workflowId, fact } = await setupBlockedA2(root);
      const raised = await raiseBlock({ projectRoot: root, fact, now: NOW });
      assert.equal(raised.ok, true);
      if (!raised.ok) return;
      const notResolved = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId: raised.blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(notResolved.ok, false);
      if (!notResolved.ok) {
        assert.equal(notResolved.code, "block-not-resolved");
        assert.match(notResolved.message, /raised/);
      }
      const routed = await routeBlock({
        projectRoot: root, blockId: raised.blockId, route: "owner-repair", reason: "test:owner-repair",
        targetRoleId: "convener", now: NOW,
      });
      assert.equal(routed.ok, true);
      const stillNotResolved = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId: raised.blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(stillNotResolved.ok, false);
      if (!stillNotResolved.ok) assert.equal(stillNotResolved.code, "block-not-resolved");
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0);
    } finally {
      await cleanup(root);
    }
  }
  // 5b) block 绑定 workflow/stage 与请求不一致 ⇒ block-resolution-mismatch。
  {
    const root = await makeRoot();
    try {
      const { workflowId } = await setupBlockedA2(root);
      const otherWorkflowFact: BlockFact = {
        protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, kind: "stage.blocked", code: "task-closed-rejected",
        workflowId: "wf-other", flowId: FLOW, stage: "A2", summary: "绑定其它 workflow",
        fingerprintMaterial: ["reentry-binding-workflow"],
      };
      const { blockId: otherWfBlock } = await seedResolvedBlock({ root, fact: otherWorkflowFact, resolution: "fixed" });
      const wrongWorkflow = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId: otherWfBlock, resolution: "fixed", now: NOW,
      });
      assert.equal(wrongWorkflow.ok, false);
      if (!wrongWorkflow.ok) {
        assert.equal(wrongWorkflow.code, "block-resolution-mismatch");
        assert.match(wrongWorkflow.message, /workflow/);
      }
      const otherStageFact: BlockFact = {
        protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, kind: "stage.blocked", code: "task-closed-rejected",
        workflowId, flowId: FLOW, stage: "A3", summary: "绑定其它阶段",
        fingerprintMaterial: ["reentry-binding-stage"],
      };
      const { blockId: otherStageBlock } = await seedResolvedBlock({ root, fact: otherStageFact, resolution: "fixed" });
      const wrongStage = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId: otherStageBlock, resolution: "fixed", now: NOW,
      });
      assert.equal(wrongStage.ok, false);
      if (!wrongStage.ok) {
        assert.equal(wrongStage.code, "block-resolution-mismatch");
        assert.match(wrongStage.message, /阶段/);
      }
    } finally {
      await cleanup(root);
    }
  }
  // 5c) fixed-v2.1 协议 workflow 不重入场（零迁移）。
  {
    const root = await makeRoot();
    try {
      const workflowId = "wf-fixed-reentry";
      await append(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_FIXED_V2_1 }));
      await appendCompletedStage(root, { workflowId, stage: "A1" });
      await append(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
      await append(root, blockedEvent({ workflowId, stage: "A2", attempt: 1 }));
      const fact: BlockFact = {
        protocol: WORKFLOW_PROTOCOL_FIXED_V2_1, kind: "stage.blocked", code: "task-closed-rejected",
        workflowId, flowId: FLOW, stage: "A2", summary: "旧协议 blocked",
        fingerprintMaterial: ["reentry-fixed-v21"],
      };
      const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const re = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(re.ok, false);
      if (!re.ok) assert.equal(re.code, "workflow-protocol-mismatch");
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0, "旧协议零 rework");
    } finally {
      await cleanup(root);
    }
  }
  // 5d) blocks.jsonl 坏行 ⇒ fail-closed（不猜、不重入场）。
  {
    const root = await makeRoot();
    try {
      const { workflowId, fact } = await setupBlockedA2(root);
      const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const blocksFile = path.join(root, ".ans", "state", "blocks.jsonl");
      await fs.appendFile(blocksFile, "{not-json\n", "utf8");
      const wfCount = (await wfEventsOf(root, workflowId)).length;
      const re = await reenterBlockedStageAfterResolution({
        projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
      });
      assert.equal(re.ok, false);
      if (!re.ok) {
        assert.equal(re.code, "block-ledger-corrupt");
        assert.match(re.message, /坏行/);
      }
      assert.equal((await wfEventsOf(root, workflowId)).length, wfCount, "坏账本零写入");
      assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 0);
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 6) reconcile 补驱动 ——————————————

test("S1 reconcile：带 blockId rework 的 pending 补一次 drive（attempt 不变、不新开尝试）；普通 pending 不被驱动", async () => {
  // 6a) 「已写 rework、未驱动」崩溃窗口 ⇒ reconcile 按同一 attempt 补建任务。
  //     需无 A2 task.created 任务提示（否则 applyTaskHints 会把 pending 视为 dispatched，走既有在飞分支）；
  //     这里用账本事件模拟进程在「写 rework 后、建任务前」中断（服务级真实阻塞链见用例 1）。
  {
    const root = await makeRoot();
    try {
      const workflowId = "wf-reentry-pending";
      await seedAppDispatchWorkflow(root, { workflowId });
      await appendCompletedStage(root, { workflowId, stage: "A1" });
      await append(root, requestedEvent({ workflowId, stage: "A2", attempt: 2 }));
      await append(root, blockedEvent({ workflowId, stage: "A2", attempt: 2 }));
      const manualBlockId = "blk-manual-rework";
      await append(root, reworkedEvent({
        workflowId, stage: "A2", reworkOf: "A2", attempt: 3, blockId: manualBlockId, reason: "manual crash-window",
      }));
      const viewBefore = await viewOf(root, workflowId);
      assert.equal(viewBefore.stages.A2.status, "pending", "投影：重入场后 pending");
      assert.equal(viewBefore.stages.A2.attempt, 3);
      assert.equal(viewBefore.blocked, undefined);
      assert.equal((await tasksOfStage(root, workflowId, "A2")).length, 0, "崩溃窗口：尚无 attempt3 任务");

      const rec = await reconcileFixedWorkflow({ projectRoot: root, workflowId, now: NOW });
      assert.equal(rec.ok, true, rec.ok === false ? `${rec.code}: ${rec.message}` : "");
      if (!rec.ok) return;
      assert.equal(rec.workflows[0]!.corrupt, undefined);
      assert.deepEqual(rec.workflows[0]!.errors, []);
      assert.equal(rec.workflows[0]!.driven !== undefined, true, "reconcile 补驱动成功");
      assert.equal(rec.workflows[0]!.driven?.attempt, 3, "补驱动同一 attempt（不新开）");
      const a2Tasks = await tasksOfStage(root, workflowId, "A2");
      assert.equal(a2Tasks.length, 1, "补建 attempt3 任务恰一条");
      assert.equal(a2Tasks.filter((record) =>
        record.created?.idempotencyKey === stageExecutionIdempotencyKey(workflowId, "A2", "product", 3)).length, 1);
      const events = await wfEventsOf(root, workflowId);
      assert.equal(events.filter((event) =>
        event.kind === "stage.requested" && event.stage === "A2" && event.attempt === 3).length, 1);
      assert.equal(events.some((event) =>
        event.kind === "stage.requested" && event.stage === "A2" && event.attempt === 4), false, "不得新开 attempt4");

      // 再次 reconcile：幂等（无新事件/新尝试）。
      const eventsCount = events.length;
      const again = await reconcileFixedWorkflow({ projectRoot: root, workflowId, now: NOW });
      assert.equal(again.ok, true);
      assert.equal((await wfEventsOf(root, workflowId)).length, eventsCount, "重复 reconcile 幂等");
      assert.equal((await tasksOfStage(root, workflowId, "A2")).length, 1, "task 不重复");
    } finally {
      await cleanup(root);
    }
  }
  // 6b) 普通 pending（无 block rework）：reconcile 不驱动（行为不变）。
  {
    const root = await makeRoot();
    try {
      const workflowId = "wf-reentry-ordinary-pending";
      await seedAppDispatchWorkflow(root, { workflowId });
      const view = await viewOf(root, workflowId);
      assert.equal(view.stage, "A1");
      assert.equal(view.stages.A1.status, "pending");
      const before = await wfEventsOf(root, workflowId);
      const rec = await reconcileFixedWorkflow({ projectRoot: root, workflowId, now: NOW });
      assert.equal(rec.ok, true, rec.ok === false ? `${rec.code}: ${rec.message}` : "");
      if (!rec.ok) return;
      assert.equal(rec.workflows[0]!.driven, undefined, "普通 pending 不补驱动");
      assert.equal((await wfEventsOf(root, workflowId)).length, before.length, "零事件");
      assert.equal((await readTaskState(root)).records.size, 0, "零任务");
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 7) 共存：repair 任务 ——————————————

test("S1 共存：已有 stage=A2 的 repair 任务时重入仍只产生一条新 attempt 任务", async () => {
  const root = await makeRoot();
  try {
    const { workflowId, fact } = await setupBlockedA2(root);
    const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
    // 手工播种一条 stage=A2 的 repair 任务（与重入场任务共存）。
    const repairTaskId = "t-repair-a2";
    const repairKey = `block-repair:${blockId}:1`;
    const repair = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: repairTaskId,
      from: "application",
      to: "convener",
      text: "[应用·Block 修复任务] 共存用例",
      sideEffect: "unknown",
      idempotencyKey: repairKey,
      taskKind: "repair",
      blockId,
      workflowId,
      flowId: FLOW,
      stage: "A2",
    }, NOW));
    assert.equal(repair.ok, true, repair.ok === false ? repair.message : "");
    const re = await reenterBlockedStageAfterResolution({
      projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
    });
    assert.equal(re.ok, true, re.ok === false ? `${re.code}: ${re.message}` : "");
    if (!re.ok) return;
    const a2Tasks = await tasksOfStage(root, workflowId, "A2");
    const stageExec3 = a2Tasks.filter((record) =>
      record.created?.idempotencyKey === stageExecutionIdempotencyKey(workflowId, "A2", "product", 3)
      && record.created.taskKind !== "repair");
    assert.equal(stageExec3.length, 1, "新 attempt 任务唯一");
    assert.equal(stageExec3[0]!.taskId, re.reentry?.taskId);
    assert.equal(a2Tasks.filter((record) => record.taskId === repairTaskId).length, 1, "repair 任务保留");
    assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 1);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 8) v2 在飞 ——————————————

test("S1 v2 在飞：definition v2（v2 hash）的 workflow 仍能 fixed 重入成功（不静默迁移，任务文本按 v2）", async () => {
  const root = await makeRoot();
  try {
    const workflowId = "wf-reentry-v2";
    await seedAppDispatchWorkflow(root, { workflowId, version: 2 });
    await appendCompletedStage(root, { workflowId, stage: "A1" });
    const drive1 = await driveOk(root, workflowId, "A2");
    const task1 = drive1.tasks[0]!;
    // v2 A2 任务文本 = 旧 docs/intents 要求（证明按 v2 解释、未被 v3 覆盖）。
    const record1 = (await readTaskState(root)).records.get(task1.taskId)!;
    assert.match(record1.created!.text, /docs\/intents\/<intentId>\.md/, "在飞 v2 任务文本保留旧 docs/intents 要求");
    assert.match(record1.created!.text, /同时写/, "v2 文本逐字");
    await reportTask(root, task1.taskId, "blocked", "v2 在飞 blocked");
    await observeAppDispatchTaskReport({ projectRoot: root, taskId: task1.taskId, now: NOW });
    const task2Id = appDispatchTaskId(stageExecutionIdempotencyKey(workflowId, "A2", "product", 2));
    await reportTask(root, task2Id, "blocked", "v2 在飞 blocked（attempt2）");
    await observeAppDispatchTaskReport({ projectRoot: root, taskId: task2Id, now: NOW });
    const view = await viewOf(root, workflowId);
    assert.equal(view.stages.A2.status, "blocked");
    const blocked = await lastStageBlocked(root, workflowId, "A2");
    const fact = blockFactFromStageBlocked(blocked!, {
      protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
      fingerprintMaterial: ["reentry-v2-inflight"],
    });
    const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
    const re = await reenterBlockedStageAfterResolution({
      projectRoot: root, workflowId, stage: "A2", blockId, resolution: "fixed", now: NOW,
    });
    assert.equal(re.ok, true, re.ok === false ? `${re.code}: ${re.message}` : "");
    if (!re.ok) return;
    assert.equal(re.reentry?.attempt, 3);
    assert.equal(re.driveError, undefined);
    const task3Id = appDispatchTaskId(stageExecutionIdempotencyKey(workflowId, "A2", "product", 3));
    const record3 = (await readTaskState(root)).records.get(task3Id)!;
    assert.match(record3.created!.text, /docs\/intents\/<intentId>\.md/, "新 attempt 任务仍按 v2 文本（不静默迁移到 v3）");
    // workflow.started 定义引用保持 v2 + v2 hash。
    const started = (await wfEventsOf(root, workflowId)).find((event) => event.kind === "workflow.started");
    assert.ok(started !== undefined && started.kind === "workflow.started");
    if (started !== undefined && started.kind === "workflow.started") {
      assert.equal(started.definition?.version, 2);
      assert.equal(started.definition?.sha256, WORKFLOW_DEFINITION_HASHES_BY_VERSION.add[2]);
    }
    assert.equal(stageReworkEvents(await wfEventsOf(root, workflowId), "A2").length, 1);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 9) 状态机负例 ——————————————

test("S1 状态机负例：blockId 事件必须同阶段+blocked（否则 workflow-corrupt）；空 blockId 不计入；无 blockId 的 MF-IR-1 A3→A2 逐字不变", () => {
  const prefix: WorkflowEvent[] = [
    startedEvent({ workflowId: "wf-state", protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }),
    requestedEvent({ workflowId: "wf-state", stage: "A1", attempt: 1 }),
    completedEvent({ workflowId: "wf-state", stage: "A1" }),
    requestedEvent({ workflowId: "wf-state", stage: "A2", attempt: 1 }),
    blockedEvent({ workflowId: "wf-state", stage: "A2", attempt: 1 }),
  ];
  // 9a) 带 blockId 但 stage≠reworkOf（把普通回落写成 block 形状）。
  {
    const view = deriveWorkflowView([
      ...prefix,
      reworkedEvent({ workflowId: "wf-state", stage: "A3", reworkOf: "A2", attempt: 3, blockId: "blk-bad-shape" }),
    ]);
    assert.equal(view.blocked?.code, "workflow-corrupt");
    assert.match(view.blocked?.summary ?? "", /同阶段/);
  }
  // 9b) 带 blockId 但 reworkOf 不是当前阶段。
  {
    const view = deriveWorkflowView([
      ...prefix,
      reworkedEvent({ workflowId: "wf-state", stage: "A2", reworkOf: "A3", attempt: 3, blockId: "blk-bad-source" }),
    ]);
    assert.equal(view.blocked?.code, "workflow-corrupt");
    assert.match(view.blocked?.summary ?? "", /来源阶段不匹配/);
  }
  // 9c) 带 blockId 但阶段非 blocked（仅 requested）。
  {
    const view = deriveWorkflowView([
      startedEvent({ workflowId: "wf-state2", protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }),
      requestedEvent({ workflowId: "wf-state2", stage: "A1", attempt: 1 }),
      completedEvent({ workflowId: "wf-state2", stage: "A1" }),
      requestedEvent({ workflowId: "wf-state2", stage: "A2", attempt: 1 }),
      reworkedEvent({ workflowId: "wf-state2", stage: "A2", reworkOf: "A2", attempt: 2, blockId: "blk-not-blocked" }),
    ]);
    assert.equal(view.blocked?.code, "workflow-corrupt");
    assert.match(view.blocked?.summary ?? "", /blocked/);
  }
  // 9d) 空 blockId：事件形状非法 ⇒ 读取侧计入 skipped.invalid，不入账（投影状态不前进）。
  {
    const invalid = {
      ...reworkedEvent({ workflowId: "wf-state", stage: "A2", reworkOf: "A2", attempt: 3 }),
      blockId: "",
    } as unknown as WorkflowEvent;
    const view = deriveWorkflowView([...prefix, invalid]);
    assert.notEqual(view.blocked?.code, "workflow-corrupt", "坏形状事件不得把账本判 corrupt（只跳过）");
    assert.equal(view.skippedEvents?.invalid, 1, "空 blockId 计入 invalid");
    assert.equal(view.stages.A2.status, "blocked", "不入账：阶段仍 blocked");
    assert.equal(view.stages.A2.attempt, 1);
    assert.equal(stageReworkEvents([...prefix, invalid], "A2").length, 1, "原始数组仍含该行（仅投影跳过）");
  }
  // 9e) 无 blockId 的普通 MF-IR-1（A3→A2）语义逐字不变：来源 failed、目标 pending、attempt 更新。
  {
    const events: WorkflowEvent[] = [
      startedEvent({ workflowId: "wf-mf-ir-1", protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }),
      requestedEvent({ workflowId: "wf-mf-ir-1", stage: "A1", attempt: 1 }),
      completedEvent({ workflowId: "wf-mf-ir-1", stage: "A1" }),
      requestedEvent({ workflowId: "wf-mf-ir-1", stage: "A2", attempt: 1 }),
      completedEvent({ workflowId: "wf-mf-ir-1", stage: "A2" }),
      requestedEvent({ workflowId: "wf-mf-ir-1", stage: "A3", attempt: 1 }),
      reworkedEvent({ workflowId: "wf-mf-ir-1", stage: "A2", reworkOf: "A3", attempt: 2, reason: "客户 revise" }),
    ];
    const view = deriveWorkflowView(events);
    assert.equal(view.blocked, undefined, "MF-IR-1 仍合法");
    assert.equal(view.stage, "A2");
    assert.equal(view.stages.A3.status, "failed", "来源阶段置 failed（冻结语义）");
    assert.equal(view.stages.A2.status, "pending", "目标阶段 pending（新 attempt）");
    assert.equal(view.stages.A2.attempt, 2);
    assert.deepEqual([...nextStages(view)], ["A2"]);
  }
});

// —————————————— 10) blockId 空串事件（写入/读取两侧） ——————————————

test("S1 blockId 空串事件：appendWorkflowEvent 拒写（invalid-event）；raw 账本读取侧 invalid/不入账", async () => {
  const root = await makeRoot();
  try {
    const workflowId = "wf-empty-blockid";
    await seedAppDispatchWorkflow(root, { workflowId });
    await appendCompletedStage(root, { workflowId, stage: "A1" });
    await append(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
    await append(root, blockedEvent({ workflowId, stage: "A2", attempt: 1 }));
    const before = await readWorkflowLedger(root);
    const badRow = {
      ...reworkedEvent({ workflowId, stage: "A2", reworkOf: "A2", attempt: 3 }),
      blockId: "",
    } as unknown as WorkflowEvent;
    const appended = await appendWorkflowEvent(root, badRow);
    assert.equal(appended.ok, false, "写入侧 fail-closed：空 blockId 事件形状非法");
    if (!appended.ok) assert.equal(appended.code, "invalid-event");
    assert.equal((await readWorkflowLedger(root)).events.length, before.events.length, "拒写不落账");
    // 直接写 raw 坏行（模拟旧账本/外部损坏）：JSON 可解析但形状非法 ⇒ 读取侧计入 badLines、不入账。
    const wfFile = path.join(root, ".ans", "state", "workflows.jsonl");
    await fs.appendFile(wfFile, JSON.stringify(badRow) + "\n", "utf8");
    const raw = await readWorkflowLedger(root);
    assert.equal(raw.badLines, before.badLines + 1, "空 blockId 行读取侧计入 badLines（形状非法，不入账）");
    assert.equal(raw.events.length, before.events.length, "坏形状行不进入事件列表");
    const filtered = raw.events.filter((event) => event.workflowId === workflowId);
    const state = await readTaskState(root);
    const view = deriveWorkflowView(filtered, state.events);
    assert.notEqual(view.blocked?.code, "workflow-corrupt", "坏形状事件只跳过，不判 workflow-corrupt");
    assert.equal(view.stages.A2.status, "blocked", "bad blockId 事件不入账");
    assert.equal(stageReworkEvents(filtered, "A2").length, 0, "账本中无 rework 生效");
  } finally {
    await cleanup(root);
  }
});

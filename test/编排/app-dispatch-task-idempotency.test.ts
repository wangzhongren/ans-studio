// test/编排/app-dispatch-task-idempotency.test.ts
// 2026-11-20（SMOKE-1 接缝修复测试批，测试角色）：**单一创建者 / 确定性 taskId / 账本唯一（并发回归）**。
//
// 依据（权威）：
//   1. `角色卡/编排/docs/change/2026-11-20_change_app-dispatch-smoke-seams-foundation.md`
//      §二（API 面）/§三（幂等/唯一/锁设计）/§五（验证）/§六（待测试批点 1/4）；
//   2. `角色卡/桌面窗口/docs/change/2026-11-20_change_app-dispatch-smoke-seams-desktop.md`
//      §十（待测试批断言点 1/2/4）。
// 客户第一不变量：**任务由工作流/应用侧唯一派发，taskId 确定性，任何路径不得重复建任务**。
//
// 覆盖（并发窗口用 `Promise.all` 直接制造，测试本身不串行化）：
//   1. 并发两次 `driveAppDispatchStage` 同阶段 ⇒ 账本仅 1 条 task.created、两回执同 taskId、
//      stage.requested 一条；drive/drive/reconcile 多入口并发同结论；
//   2. observe blocked（Q8 重试）∥ reconcile ∥ drive ⇒ A2 仅 attempt1+attempt2（attempt2 唯一）、
//      repair=0；blockFact/blockOutcome 经 observe 或 reconcile 回执交出（并发不丢块）；同键重复 replay；
//   3. 同键 payload 冲突 / 同阶段同尝试 targetRole 漂移 ⇒ workflow-corrupt 且账本零新增；
//      taskId 对同 tuple 稳定、不同 attempt/targetRole/taskKind 不同；
//   4. 并发同键 repair 任务（不同 taskId）⇒ 账本仅 1 条、另一回执 replay 同 id；
//      应用任务第二创建者（同键不同 taskId）⇒ invalid-task-binding（任何路径不得重复建任务）。
//
// 夹具：临时目录 + 真实服务/账本 + 假时间；不启动 Electron/模型；不占端口、不读 `.env`、无网络/Git。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  APP_DISPATCH_PROTOCOL,
  WORKFLOWS_STATE_REL,
  appDispatchIdempotencyKey,
  appDispatchPromptId,
  appDispatchTaskId,
  appendWorkflowEvent,
  cardPromptIdempotencyKey,
  createAppDispatchTask,
  driveAppDispatchStage,
  isAppDispatchTaskKind,
  observeAppDispatchTaskReport,
  reconcileFixedWorkflow,
  readWorkflowLedger,
  selectWorkflow,
  stageExecutionIdempotencyKey,
  workerDispatchIdempotencyKey,
  type CreateAppDispatchTaskInput,
  type DriveAppDispatchStageResult,
} from "../../src/common/编排/workflow-service.ts";
import { WORKFLOW_DEFINITION_HASHES_BY_VERSION } from "../../src/common/编排/workflow-definitions.ts";
import {
  TASKS_STATE_REL,
  appendTaskEvent,
  readTaskState,
  taskEvent,
  type TaskRecord,
} from "../../src/common/编排/task-state.ts";
import { readBlockLedger } from "../../src/common/编排/block-ledger.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  type TaskStateEvent,
  type WorkflowEvent,
} from "../../src/model/runtime.ts";

const FLOW = "seam";
const AT = "2026-11-20T00:00:00.000Z";
const at = () => new Date(AT);

async function makeRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-app-dispatch-idem-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function startA(root: string): Promise<string> {
  const selected = await selectWorkflow({
    projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-seam-1", now: at,
  });
  assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
  if (!selected.ok) throw new Error("unreachable");
  return selected.workflowId;
}

function driveStage(root: string, workflowId: string, stage?: "A2"): Promise<DriveAppDispatchStageResult> {
  return driveAppDispatchStage({ projectRoot: root, workflowId, ...(stage !== undefined ? { stage } : {}), now: at });
}
async function driveOk(root: string, workflowId: string, stage?: "A2") {
  const receipt = await driveStage(root, workflowId, stage);
  assert.equal(receipt.ok, true, receipt.ok === false ? `${receipt.code}: ${receipt.message}` : "");
  if (!receipt.ok) throw new Error("unreachable");
  return receipt;
}

async function report(root: string, taskId: string, status: "blocked" | "failed" | "done"): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.reported", {
    taskId, from: "product", status, summary: `seam ${status}`,
  }, at));
  assert.equal(appended.ok, true, appended.ok === false ? `${appended.code ?? ""} ${appended.message}` : "");
}

type TaskCreatedEventView = Extract<TaskStateEvent, { kind: "task.created" }>;

async function createdOfStage(root: string, workflowId: string, stage: string): Promise<TaskCreatedEventView[]> {
  const state = await readTaskState(root);
  return state.events.filter((event): event is TaskCreatedEventView =>
    event.kind === "task.created" && event.workflowId === workflowId && event.stage === stage);
}
async function recordsOfStage(root: string, workflowId: string, stage: string): Promise<TaskRecord[]> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((record) =>
    record.created?.workflowId === workflowId && record.created.stage === stage);
}
async function workflowEventsOfKind<K extends "stage.requested" | "stage.dispatched">(
  root: string,
  workflowId: string,
  kind: K,
): Promise<Array<Extract<WorkflowEvent, { kind: K }>>> {
  const ledger = await readWorkflowLedger(root);
  return ledger.events.filter((event): event is Extract<WorkflowEvent, { kind: K }> =>
    event.workflowId === workflowId && event.kind === kind);
}
async function repairTaskCount(root: string): Promise<number> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((record) => record.created?.taskKind === "repair").length;
}

// —————————————— 1) 并发 drive / 多入口同驱动 ——————————————

test("并发两次 drive 同阶段 ⇒ 账本仅 1 条 A2 task.created、两回执同确定性 taskId、stage.requested 一条", async () => {
  const root = await makeRoot();
  try {
    const wf = await startA(root);
    const [a, b] = await Promise.all([driveStage(root, wf, "A2"), driveStage(root, wf, "A2")]);
    assert.equal(a.ok, true, a.ok === false ? `${a.code}: ${a.message}` : "");
    assert.equal(b.ok, true, b.ok === false ? `${b.code}: ${b.message}` : "");
    if (!a.ok || !b.ok) throw new Error("unreachable");

    // 两回执同 taskId（确定性派生），且恰是 (wf, A2, product, stage-execution, attempt1) 的键。
    assert.equal(a.stage, "A2");
    assert.equal(a.attempt, 1);
    assert.equal(a.tasks.length, 1);
    assert.equal(b.tasks.length, 1);
    const expectedKey = stageExecutionIdempotencyKey(wf, "A2", "product", 1);
    assert.equal(a.tasks[0]!.idempotencyKey, expectedKey, "键格式与在飞 v1 逐字一致");
    assert.equal(a.tasks[0]!.taskId, appDispatchTaskId(expectedKey), "taskId 由幂等键确定性派生");
    assert.equal(a.tasks[0]!.taskId, b.tasks[0]!.taskId, "并发两回执必须同 taskId");
    assert.equal(a.tasks[0]!.taskKind, "stage-execution");
    assert.equal(a.tasks[0]!.to, "product");

    // 账本事实：仅 1 条 A2 task.created；stage.requested/dispatched 各 1 条（同 attempt）。
    const created = await createdOfStage(root, wf, "A2");
    assert.equal(created.length, 1, `并发 drive 后 A2 task.created 必须只有 1 条（实际 ${created.length}）`);
    assert.equal(created[0]!.taskId, a.tasks[0]!.taskId);
    assert.equal(created[0]!.from, "application");
    const requested = await workflowEventsOfKind(root, wf, "stage.requested");
    const requestedA2 = requested.filter((event) => event.stage === "A2");
    assert.equal(requestedA2.length, 1, "stage.requested 同阶段同尝试只允许一条");
    assert.equal((requestedA2[0] as { attempt: number }).attempt, 1);
    assert.equal((requestedA2[0] as { requestTaskId: string }).requestTaskId, a.tasks[0]!.taskId, "事件先写携带同 taskId");
    const dispatched = (await workflowEventsOfKind(root, wf, "stage.dispatched")).filter((event) => event.stage === "A2");
    assert.equal(dispatched.length, 1, "stage.dispatched 每任务一条");
    assert.equal((dispatched[0] as { taskId: string }).taskId, a.tasks[0]!.taskId);
    // 不得出现两条同 stage/attempt 的 t-app 任务。
    assert.equal(created.filter((event) => event.idempotencyKey === expectedKey).length, 1);
    assert.equal(created.every((event) => event.taskId.startsWith("t-app-")), true);
  } finally {
    await cleanup(root);
  }
});

test("drive ∥ drive ∥ reconcile 多入口并发 ⇒ A2 仍仅 1 条任务（reconcile 不直接 append task）", async () => {
  const root = await makeRoot();
  try {
    const wf = await startA(root);
    const [first, second, reconciled] = await Promise.all([
      driveStage(root, wf, "A2"),
      driveStage(root, wf),
      reconcileFixedWorkflow({ projectRoot: root, workflowId: wf, now: at }),
    ]);
    assert.equal(first.ok, true, first.ok === false ? `${first.code}: ${first.message}` : "");
    assert.equal(second.ok, true, second.ok === false ? `${second.code}: ${second.message}` : "");
    assert.equal(reconciled.ok, true, reconciled.ok === false ? `${reconciled.code}: ${reconciled.message}` : "");
    if (!first.ok || !second.ok || !reconciled.ok) throw new Error("unreachable");
    assert.equal(first.tasks[0]!.taskId, second.tasks[0]!.taskId);
    const receipt = reconciled.workflows.find((workflow) => workflow.workflowId === wf)!;
    assert.equal(receipt.corrupt, undefined);
    assert.equal(receipt.driven?.tasks[0]?.taskId, first.tasks[0]!.taskId, "reconcile 复用确定性 taskId");
    assert.equal((await createdOfStage(root, wf, "A2")).length, 1, "多入口并发只允许一条 A2 task.created");
    assert.equal((await recordsOfStage(root, wf, "A2")).length, 1);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2) observe blocked ∥ reconcile/advance ——————————————

test("observe blocked（Q8 重试）∥ reconcile ∥ drive：attempt2 唯一、repair=0、blockFact/blockOutcome 不丢；同键重复 replay", async () => {
  const root = await makeRoot();
  try {
    const wf = await startA(root);
    const first = await driveOk(root, wf, "A2");
    const firstTaskId = first.tasks[0]!.taskId;
    await report(root, firstTaskId, "blocked");

    const [observed, reconciled, driven] = await Promise.all([
      observeAppDispatchTaskReport({ projectRoot: root, taskId: firstTaskId, now: at }),
      reconcileFixedWorkflow({ projectRoot: root, workflowId: wf, now: at }),
      driveStage(root, wf),
    ]);
    assert.equal(observed.ok, true, observed.ok === false ? `${observed.code}: ${observed.message}` : "");
    assert.equal(reconciled.ok, true, reconciled.ok === false ? `${reconciled.code}: ${reconciled.message}` : "");
    assert.equal(driven.ok, true, driven.ok === false ? `${driven.code}: ${driven.message}` : "");
    if (!observed.ok || !reconciled.ok || !driven.ok) throw new Error("unreachable");
    const reconcileReceipt = reconciled.workflows.find((workflow) => workflow.workflowId === wf)!;
    assert.equal(reconcileReceipt.corrupt, undefined);
    assert.equal(reconcileReceipt.skipped, undefined);

    // 并发胜负二选一：observe 先拿锁 ⇒ 回执直接带 retrying；reconcile 先收口 ⇒ 对账回执带同一事实。
    // 两条路径都必须交出事实（并发不丢块），且事实可被 resolver 判为 engine-auto-fix。
    const surfacedFacts = [
      ...(observed.blockFact !== undefined ? [observed.blockFact] : []),
      ...(reconcileReceipt.blockFacts ?? []),
    ];
    assert.ok(surfacedFacts.length >= 1, "blocked 报告事实必须经 observe 或 reconcile 回执交出（并发不丢块）");
    const retryFact = surfacedFacts.find((fact) => fact.detailCode === "reconcile");
    assert.ok(retryFact !== undefined, "retrying 事实必须 detailCode=reconcile（resolver 走 engine-auto-fix）");
    assert.equal(retryFact!.protocol, APP_DISPATCH_PROTOCOL);
    assert.equal(retryFact!.kind, "task.reported");
    assert.equal(retryFact!.code, "task-report-blocked");
    assert.equal(retryFact!.engineCanRepair, true);
    assert.equal(retryFact!.workflowId, wf);
    assert.equal(retryFact!.stage, "A2");
    assert.equal(retryFact!.taskId, firstTaskId, "事实锚点 = 被拒绝任务的 taskId（不伪造新任务）");
    if (observed.replay !== true) {
      assert.deepEqual(observed.retried, { stage: "A2", attempt: 2 }, "Q8 重试 attempt=2");
      assert.equal(observed.blockOutcome, "retrying", "重试已触发 ⇒ retrying");
    } else {
      assert.equal(observed.outcome, "rejected", "并发落败方看到已收口 replay（不重复重试）");
    }

    // A2 仅 attempt1 + attempt2；attempt2 唯一；不得出现第二条 attempt2。
    const a2 = await createdOfStage(root, wf, "A2");
    assert.equal(a2.length, 2, `A2 只允许 attempt1 + attempt2 两条（实际 ${a2.length}）`);
    const attempt2Key = stageExecutionIdempotencyKey(wf, "A2", "product", 2);
    assert.equal(a2.filter((event) => event.idempotencyKey === attempt2Key).length, 1, "attempt2 任务必须唯一");
    assert.equal((await recordsOfStage(root, wf, "A2")).length, 2);
    // 引擎重试路径不得并发建属主修复任务。
    assert.equal(await repairTaskCount(root), 0, "引擎重试期间不得创建 repair 任务（owner-repair 不并发）");
    // 编排服务不写 blocks 账本（桌面 router 消费事实）。
    assert.equal((await readBlockLedger(root)).events.length, 0, "workflow-service 不写 blocks.jsonl");

    // 同键重复调用 replay：observe 再调 / drive 再驱均不追加任务。
    const observeReplay = await observeAppDispatchTaskReport({ projectRoot: root, taskId: firstTaskId, now: at });
    assert.equal(observeReplay.ok, true);
    if (observeReplay.ok) {
      assert.equal(observeReplay.replay, true, "已收口任务再次观察 = replay");
      assert.equal(observeReplay.outcome, "rejected");
    }
    const driveReplay = await driveOk(root, wf, "A2");
    assert.equal(driveReplay.replay, true, "同阶段再次驱动 = replay（同 taskId）");
    assert.equal(driveReplay.attempt, 2);
    assert.equal((await createdOfStage(root, wf, "A2")).length, 2, "重复调用不得新增任务");
  } finally {
    await cleanup(root);
  }
});

test("reconcile 先于桌面观察收口 blocked 报告 ⇒ 对账回执 blockFacts 携带 retrying 事实（并发不丢块）", async () => {
  const root = await makeRoot();
  try {
    const wf = await startA(root);
    const first = await driveOk(root, wf, "A2");
    const firstTaskId = first.tasks[0]!.taskId;
    await report(root, firstTaskId, "blocked");
    // 不调用 observe：仅由 reconcile 收口（模拟桌面观察尚未到达 / 启动对账先跑）。
    const reconciled = await reconcileFixedWorkflow({ projectRoot: root, workflowId: wf, now: at });
    assert.equal(reconciled.ok, true, reconciled.ok === false ? `${reconciled.code}: ${reconciled.message}` : "");
    if (!reconciled.ok) throw new Error("unreachable");
    const receipt = reconciled.workflows.find((workflow) => workflow.workflowId === wf)!;
    assert.deepEqual(receipt.closedTasks, [firstTaskId], "对账幂等收口已报告任务");
    const facts = receipt.blockFacts ?? [];
    assert.equal(facts.length >= 1, true, "对账收口产生的 blockFact 必须随回执交出（不再仅 corrupt/errors）");
    const fact = facts.find((entry) => entry.detailCode === "reconcile");
    assert.ok(fact !== undefined, "retrying 事实 detailCode=reconcile");
    assert.equal(fact!.code, "task-report-blocked");
    assert.equal(fact!.engineCanRepair, true);
    assert.equal(fact!.taskId, firstTaskId);
    // Q8 重试同样发生，但任务仍唯一（reconcile 不直接 append task）。
    assert.equal((await createdOfStage(root, wf, "A2")).length, 2);
    assert.equal(await repairTaskCount(root), 0);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 3) API 收紧 / worker-dispatch API / taskId 确定性 ——————————————

test("createAppDispatchTask API 收紧：stage-execution/card-prompt ⇒ app-dispatch-drive-required 且账本零新增；worker-dispatch 确定性/replay", async () => {
  const root = await makeRoot();
  try {
    // 索引 2026-11-20 收尾修正：应用阶段任务只能由 drive/reconcile 创建；桌面 API 仅允许 worker-dispatch。
    // stage-execution/card-prompt ⇒ 稳定拒绝码 app-dispatch-drive-required（不派生、不建任务、账本零新增）。
    const wf = await startA(root); // A1 完成；A2（stage-execution）待 drive。
    const eventsBefore = (await readTaskState(root)).events.length;
    const stageReject = await createAppDispatchTask({
      projectRoot: root,
      workflowId: wf,
      stage: "A2",
      targetRoleId: "product",
      taskKind: "stage-execution",
      text: "阶段任务只能由 drive/reconcile 创建（应被拒绝）",
      sideEffect: "docs",
      now: at,
    });
    assert.equal(stageReject.ok, false, "API 不得再直接建 stage-execution");
    if (!stageReject.ok) {
      assert.equal(stageReject.code, "app-dispatch-drive-required");
      assert.match(stageReject.message, /drive|worker-dispatch/);
    }
    const promptReject = await createAppDispatchTask({
      projectRoot: root,
      workflowId: wf,
      stage: "A3",
      targetRoleId: "chief",
      taskKind: "card-prompt",
      text: "卡 prompt 只能由 drive 按卡定义创建（应被拒绝）",
      sideEffect: "read-only",
      now: at,
    });
    assert.equal(promptReject.ok, false, "API 不得直接建 card-prompt");
    if (!promptReject.ok) assert.equal(promptReject.code, "app-dispatch-drive-required");
    assert.equal((await readTaskState(root)).events.length, eventsBefore, "API 拒绝不得追加任何账本行");
    assert.equal((await createdOfStage(root, wf, "A2")).length, 0, "拒绝不得建 A2 任务");

    // worker-dispatch API 正例：手播 path B workflow（B1 定义为 worker-dispatch→convener），API 唯一创建 + 同键 replay。
    const workerWf = "wf-seam-worker-api";
    const started: WorkflowEvent = {
      v: 1,
      at: AT,
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "workflow.started",
      workflowId: workerWf,
      flowId: FLOW,
      path: "B",
      idempotencyKey: `workflow-start:${FLOW}:B:seed-${workerWf}`,
      trigger: { by: "chief", reason: "seam test" },
      sourceTaskId: "turn-worker-api",
      protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
      // 在飞 v2 workflow：按 v2 定义 hash 解释（HASHES 现指 v3；不静默迁移）。
      definition: { id: "modify", version: 2, sha256: WORKFLOW_DEFINITION_HASHES_BY_VERSION.modify[2] },
      parameters: { acceptanceStrength: "standard" },
    };
    const startedAppend = await appendWorkflowEvent(root, started);
    assert.equal(startedAppend.ok, true, startedAppend.ok === false ? startedAppend.message : "");

    const input: CreateAppDispatchTaskInput = {
      projectRoot: root,
      workflowId: workerWf,
      stage: "B1",
      targetRoleId: "convener",
      taskKind: "worker-dispatch",
      text: "SMOKE-1 接缝测试：worker-dispatch 由桌面 API 确定性创建",
      sideEffect: "read-only",
      now: at,
    };
    const expectedKey = workerDispatchIdempotencyKey(workerWf, "B1", 1);
    assert.equal(
      appDispatchIdempotencyKey({
        workflowId: workerWf, stage: "B1", targetRoleId: "convener", taskKind: "worker-dispatch", attempt: 1,
      }),
      expectedKey,
      "worker-dispatch 键格式与在飞一致",
    );
    const expectedTaskId = appDispatchTaskId(expectedKey);
    const first = await createAppDispatchTask(input);
    assert.equal(first.ok, true, first.ok === false ? `${first.code}: ${first.message}` : "");
    if (!first.ok) throw new Error("unreachable");
    assert.equal(first.taskId, expectedTaskId, "taskId 必须由 (workflowId,stage,targetRole,taskKind,attempt) 确定性派生");
    assert.equal(first.replay, false);
    assert.equal(first.attempt, 1);
    assert.equal(first.taskKind, "worker-dispatch");
    assert.equal(first.to, "convener");
    const second = await createAppDispatchTask(input);
    assert.equal(second.ok, true, second.ok === false ? `${second.code}: ${second.message}` : "");
    if (!second.ok) throw new Error("unreachable");
    assert.equal(second.taskId, first.taskId);
    assert.equal(second.replay, true, "同 key 重复调用必须 replay");
    const workerTasks = await createdOfStage(root, workerWf, "B1");
    assert.equal(workerTasks.length, 1, "worker-dispatch API replay 不追加第二条");
    assert.equal(workerTasks[0]!.taskId, expectedTaskId);
    assert.equal(workerTasks[0]!.from, "application");
    assert.equal(workerTasks[0]!.to, "convener");
    assert.equal(workerTasks[0]!.sideEffect, "read-only");
    assert.equal(workerTasks[0]!.idempotencyKey, expectedKey);

    // taskId 确定性：同 tuple 稳定、不同 attempt/targetRole/taskKind 不同。
    const stageBase = { workflowId: wf, stage: "A2" as const, targetRoleId: "product", taskKind: "stage-execution" as const };
    const stageId1 = appDispatchTaskId(appDispatchIdempotencyKey({ ...stageBase, attempt: 1 }));
    assert.equal(stageId1, appDispatchTaskId(appDispatchIdempotencyKey({ ...stageBase, attempt: 1 })), "同 tuple 稳定");
    assert.notEqual(
      appDispatchTaskId(appDispatchIdempotencyKey({ ...stageBase, attempt: 2 })),
      stageId1,
      "不同 attempt ⇒ 不同 taskId",
    );
    assert.notEqual(
      appDispatchTaskId(appDispatchIdempotencyKey({ ...stageBase, targetRoleId: "rapporteur", attempt: 1 })),
      stageId1,
      "不同 targetRole ⇒ 不同 taskId",
    );
    assert.notEqual(appDispatchTaskId(expectedKey), stageId1, "不同 taskKind ⇒ 不同 taskId");
    // 公开 API 已不再允许 stage-execution：targetRole 漂移/同键 payload 冲突的「第二创建者」面由
    // 账本唯一 guard（用例 ⑥）与 drive 的 expectedTaskId 校验兜底；此处只钉键/taskId 确定性。
    const promptId = appDispatchPromptId(wf, "A3", 1);
    const promptKey = appDispatchIdempotencyKey({
      workflowId: wf, stage: "A3", targetRoleId: "chief", taskKind: "card-prompt", attempt: 1,
    });
    assert.equal(promptKey, cardPromptIdempotencyKey(wf, "A3", promptId), "card-prompt 键格式与在飞一致");
    assert.notEqual(appDispatchTaskId(promptKey), stageId1);

    // 种类守卫：未知 taskKind fail-closed（不派生、不建任务）；公开 API 限制不改变种类守卫语义。
    assert.equal(isAppDispatchTaskKind("stage-execution"), true);
    assert.equal(isAppDispatchTaskKind("worker-dispatch"), true);
    assert.equal(isAppDispatchTaskKind("card-prompt"), true);
    assert.equal(isAppDispatchTaskKind("repair"), false);
    assert.equal(isAppDispatchTaskKind("stage-request"), false);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 4) 并发 repair / 第二创建者 ——————————————

test("并发同键 repair 任务 ⇒ 账本仅 1 条、另一回执 replay 同 id；应用任务第二创建者 ⇒ invalid-task-binding", async () => {
  const root = await makeRoot();
  try {
    // 两个创建者（不同本地 taskId、同幂等键）并发写 repair 任务：账本 guard 归一。
    const blockId = "b".repeat(24);
    const repairEvent = (taskId: string): TaskStateEvent => taskEvent("task.created", {
      taskId,
      from: "application",
      to: "rapporteur",
      text: "修复：补齐缺失文档（并发创建者）",
      sideEffect: "unknown",
      idempotencyKey: `block-repair:${blockId}:1`,
      taskKind: "repair",
      blockId,
    }, at);
    const [a, b] = await Promise.all([
      appendTaskEvent(root, repairEvent("t-repair-a")),
      appendTaskEvent(root, repairEvent("t-repair-b")),
    ]);
    assert.equal(a.ok, true, a.ok === false ? `${a.code ?? ""} ${a.message}` : "");
    assert.equal(b.ok, true, b.ok === false ? `${b.code ?? ""} ${b.message}` : "");
    if (!a.ok || !b.ok) throw new Error("unreachable");
    const replayFlags = [a.replay === true, b.replay === true].sort();
    assert.deepEqual(replayFlags, [false, true], "并发修复任务：一个创建、一个 replay");
    assert.equal(a.taskId, b.taskId, "两回执必须同 taskId（败方消费既有 id）");
    const state = await readTaskState(root);
    const repairs = [...state.records.values()].filter((record) => record.created?.taskKind === "repair");
    assert.equal(repairs.length, 1, `同键修复任务只允许一条（实际 ${repairs.length}）`);
    assert.equal(repairs[0]!.taskId, a.taskId);
    assert.equal(state.events.filter((event) =>
      event.kind === "task.created" && event.idempotencyKey === `block-repair:${blockId}:1`).length, 1);

    // 应用任务（非 repair）同键不同 taskId ⇒ 第二创建者被拒绝（taskId 必须由键确定性派生）。
    const appKey = `stage-exec:wf-idem:A2:product:1`;
    const appEvent = (taskId: string): TaskStateEvent => taskEvent("task.created", {
      taskId,
      from: "application",
      to: "product",
      text: "应用阶段任务（第二创建者）",
      sideEffect: "docs",
      idempotencyKey: appKey,
      workflowId: "wf-idem",
      flowId: "seam",
      stage: "A2",
      taskKind: "stage-execution",
    }, at);
    const [winner, loser] = await Promise.all([
      appendTaskEvent(root, appEvent("t-app-creator-winner")),
      appendTaskEvent(root, appEvent("t-app-creator-loser")),
    ]);
    const oks = [winner, loser].filter((result) => result.ok === true);
    const failures = [winner, loser].filter((result) => result.ok === false);
    assert.equal(oks.length, 1, "同键应用任务只允许一个创建成功");
    assert.equal(failures.length, 1, "第二创建者必须被账本 guard 拒绝");
    if (failures[0] !== undefined && failures[0].ok === false) {
      assert.equal(failures[0].code, "invalid-task-binding");
      assert.match(failures[0].message, /不得重复建任务/);
    }
    const after = await readTaskState(root);
    assert.equal(after.events.filter((event) =>
      event.kind === "task.created" && event.idempotencyKey === appKey).length, 1, "同键应用任务账本只允许 1 条");
    assert.equal([...after.records.values()].filter((record) =>
      record.created?.workflowId === "wf-idem" && record.created.stage === "A2").length, 1);

    // 同 taskId 不同 payload ⇒ invalid-task-binding（不重绑、不追加）。
    const rebind = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-repair-a",
      from: "application",
      to: "rapporteur",
      text: "同 taskId 不同文本（应被拒绝）",
      sideEffect: "unknown",
      idempotencyKey: `block-repair:${blockId}:1`,
      taskKind: "repair",
      blockId,
    }, at));
    assert.equal(rebind.ok, false);
    if (!rebind.ok) assert.equal(rebind.code, "invalid-task-binding");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 5) 2026-11-20（SMOKE-3 S3 地基）：reconcile 遇 drive waiting ——————————————

async function writeFile(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
}
/** A3 卡事实计算所需的产品意图（`docs/product/<flow>-intent-v1.md`）。 */
async function writeProductIntent(root: string): Promise<void> {
  await writeFile(root, "docs/product/seam-intent-v1.md",
    "---\nschema: project-intent/v1\nflowId: seam\nversion: 1\nintentId: seam-intent\ngoal: 缝测试\n---\n# 意图\n");
}
/** 幕僚在 A3 前写的意图入口（`docs/intents/<intentId>.md`）。 */
async function writeIntentEntry(root: string): Promise<void> {
  await writeFile(root, "docs/intents/seam-intent.md",
    "---\nintentId: seam-intent\nflowId: seam\ngoal: 缝测试\n---\n# 意图入口\n");
}
async function ledgerLineCount(root: string, rel: string): Promise<number> {
  const file = path.join(root, ...rel.split("/"));
  const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
}

test("S3 地基：reconcile 遇 drive waiting（A3 入口缺失）不报 workflow-corrupt、不建任务；入口恢复后对账补建", async () => {
  const root = await makeRoot();
  try {
    const wf = await startA(root);
    // A2 完成：drive A2 → done 报告（证据文件先落盘）→ 应用观察收口。
    const a2 = await driveOk(root, wf, "A2");
    const a2TaskId = a2.tasks[0]!.taskId;
    await writeProductIntent(root);
    const reported = await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: a2TaskId, from: "product", status: "done", summary: "意图完成",
      evidence: ["docs/product/seam-intent-v1.md"],
    }, at));
    assert.equal(reported.ok, true, reported.ok === false ? reported.message : "");
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId: a2TaskId, now: at });
    assert.equal(observed.ok, true, observed.ok === false ? `${observed.code}: ${observed.message}` : "");

    // 在飞形态（地基记录 §四.3/§六）：A3 已 stage.requested（应用签发；requestTaskId = 确定性
    // card-prompt taskId），但入口缺失 ⇒ 任务/request.created 均未建立。对账不得把等待误报 corrupt。
    const expectedPromptId = appDispatchPromptId(wf, "A3", 1);
    const expectedTaskId = appDispatchTaskId(cardPromptIdempotencyKey(wf, "A3", expectedPromptId));
    const requestedEvent: WorkflowEvent = {
      v: 1, at: new Date(AT).toISOString(), schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
      workflowId: wf, flowId: FLOW, path: "A",
      idempotencyKey: `stage-request:${wf}:A3:1`,
      stage: "A3", requestTaskId: expectedTaskId, requestDigest: "a".repeat(64), attempt: 1, issuedBy: "application",
    };
    const seededRequested = await appendWorkflowEvent(root, requestedEvent);
    assert.equal(seededRequested.ok, true, seededRequested.ok === false ? seededRequested.message : "");

    // A3 入口缺失：reconcile 驱动 A3 ⇒ 有界等待（成功形态）；不是账本不一致、零写入。
    const tasksBefore = await ledgerLineCount(root, TASKS_STATE_REL);
    const workflowsBefore = await ledgerLineCount(root, WORKFLOWS_STATE_REL);
    const reconciled = await reconcileFixedWorkflow({ projectRoot: root, workflowId: wf, now: at });
    assert.equal(reconciled.ok, true, reconciled.ok === false ? `${reconciled.code}: ${reconciled.message}` : "");
    if (!reconciled.ok) throw new Error("unreachable");
    const receipt = reconciled.workflows.find((workflow) => workflow.workflowId === wf)!;
    assert.equal(receipt.corrupt, undefined, "等待不是账本不一致（跳过 requestTaskId 判定）");
    assert.equal(receipt.skipped, undefined);
    assert.equal(receipt.driven?.waiting?.code, "intent-entry-missing");
    assert.deepEqual(receipt.driven?.tasks, []);
    assert.equal(receipt.driven?.requested, false);
    assert.equal(receipt.driven?.dispatched, false);
    assert.equal(receipt.driven?.completed, false);
    assert.equal(receipt.driven?.replay, false);
    assert.equal(await ledgerLineCount(root, TASKS_STATE_REL), tasksBefore, "等待对账零任务事件（无 request.created/task.created）");
    assert.equal(await ledgerLineCount(root, WORKFLOWS_STATE_REL), workflowsBefore, "等待对账零工作流事件（无 stage.requested/dispatched）");
    assert.equal((await recordsOfStage(root, wf, "A3")).length, 0, "等待期间不得建 A3 任务");

    // 重复对账仍 waiting、零新增（幂等）。
    const again = await reconcileFixedWorkflow({ projectRoot: root, workflowId: wf, now: at });
    assert.equal(again.ok, true);
    if (!again.ok) throw new Error("unreachable");
    const againReceipt = again.workflows.find((workflow) => workflow.workflowId === wf)!;
    assert.equal(againReceipt.corrupt, undefined);
    assert.equal(againReceipt.driven?.waiting?.code, "intent-entry-missing");
    assert.equal(await ledgerLineCount(root, TASKS_STATE_REL), tasksBefore);
    assert.equal(await ledgerLineCount(root, WORKFLOWS_STATE_REL), workflowsBefore);

    // 入口恢复 ⇒ 下一次对账走既有路径：stage.requested → request.created → card-prompt → stage.dispatched。
    await writeIntentEntry(root);
    const recovered = await reconcileFixedWorkflow({ projectRoot: root, workflowId: wf, now: at });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) throw new Error("unreachable");
    const recoveredReceipt = recovered.workflows.find((workflow) => workflow.workflowId === wf)!;
    assert.equal(recoveredReceipt.corrupt, undefined, "入口恢复后对账正常（requestTaskId 一致性通过）");
    assert.equal(recoveredReceipt.driven?.waiting, undefined);
    assert.equal(recoveredReceipt.driven?.tasks.length, 1, "入口恢复后对账补建 1 个 card-prompt 任务");
    assert.equal(recoveredReceipt.driven?.tasks[0]?.taskKind, "card-prompt");
    const a3Tasks = await recordsOfStage(root, wf, "A3");
    assert.equal(a3Tasks.length, 1);
    assert.equal(a3Tasks[0]!.taskId, expectedTaskId, "补建任务复用 stage.requested.requestTaskId（确定性派生）");
    assert.equal(a3Tasks[0]!.created?.promptId, expectedPromptId);
    assert.equal((await workflowEventsOfKind(root, wf, "stage.requested")).filter((event) => event.stage === "A3").length, 1,
      "补建后 A3 仅一条 stage.requested（等待期未预写）");
    assert.equal((await workflowEventsOfKind(root, wf, "stage.dispatched")).filter((event) => event.stage === "A3").length, 1);
    const requestRows = (await readTaskState(root)).events.filter((event) =>
      event.kind === "request.created" && event.requestId === a3Tasks[0]!.created!.promptId);
    assert.equal(requestRows.length, 1, "补建后恰一条 request.created");
  } finally {
    await cleanup(root);
  }
});

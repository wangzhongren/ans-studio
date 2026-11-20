// test/编排/app-dispatch-service.test.ts
// 2026-11-17（v2.2 第一步测试批 T2，测试角色）：**app-dispatch/v1 应用侧流程驱动服务**。
//
// 依据：docs/planning/2026-11-17_design_app-dispatch-builtins.md §三/§4.3/§4.4/§五/§七/§9.1；
// `角色卡/编排/docs/change/2026-11-17_change_app-dispatch-builtins-foundation.md` §一/§二/§六；
// Q1–Q10 裁定。
// 覆盖：
//   1. `selectWorkflow`：A/B 首阶段、协议/定义/验收强度写入、幂等重放（同键同任务）、sourceTaskId 缺失、
//      非法 flowId/路径/定义/版本、同 flow 冲突/工作区忙、显式 workflowId 不采信模型自报；
//   2. `driveAppDispatchStage`：A1/A4/A7 创建即完成；A2/A4/A5/A7/A8/A9/A12a/A12b 任务形状
//      （from=application、taskKind、to、幂等键、stage.requested/dispatched 字段）；重放不重复；
//      AC-09（A11 前 A12a 已建）；B2/A12 无任务阶段拒绝；未知阶段/非法转移；
//   3. 报告观察 `observeAppDispatchTaskReport`：done⇒accepted+stage.completed、重放；blocked⇒Q8 一次
//      自动重试（新 attempt/新幂等键）→ 预算耗尽保持 blocked；高风险零重派（A13）；worker-dispatch 拒绝
//      应用收口（Q6）；无报告/非应用任务拒绝；A12b light blocked 归档接受（B31）；standard blocked
//      默认重试 / 显式 rework 写 stage.reworked A12b→A11；
//   4. 卡 prompt：request.created（promptId/documentRefs/选项/推荐集）+ card-prompt 任务形状；
//      verifyCardPrompt 逐项匹配与不一致（cardKind/选项顺序/documentRefs/prompt 缺失/任务已收口/
//      协议不符）；B24 意图入口缺失不呈卡；request.created 不重复写；
//   5. worker-dispatch：B1/A11 任务形状；task-state 写侧对三类新任务坏形状 fail-closed；
//   6. reconcile：已报告未收口幂等收口、事件先写任务缺失⇒按同一 taskId 重建、requestTaskId 不一致/
//      dispatched 引用缺失 ⇒ corrupt；fixed-v2.1 跳过且 app 驱动返回 workflow-protocol-mismatch；
//   7. 协议隔离：旧 requestStage 照旧；app 驱动不混入旧 workflow。
//
// 夹具：临时目录 + 假时间/真实服务/账本；无端口、无 .env、无网络、无 Git（发布/基线另测试）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  APP_DISPATCH_PROTOCOL,
  appendWorkflowEvent,
  appDispatchPromptId,
  appDispatchTaskId,
  cardPromptIdempotencyKey,
  closeTask,
  driveAppDispatchStage,
  observeAppDispatchTaskReport,
  prepareIntent,
  readWorkflowLedger,
  reconcileFixedWorkflow,
  recordStageDispatch,
  requestStage,
  selectWorkflow,
  stageExecutionIdempotencyKey,
  verifyCardPrompt,
  workerDispatchIdempotencyKey,
} from "../../src/common/编排/workflow-service.ts";
import {
  WORKFLOW_DEFINITION_HASHES,
  WORKFLOW_DEFINITIONS,
  getWorkflowDefinition,
} from "../../src/common/编排/workflow-definitions.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import {
  appendTaskEvent,
  readTaskState,
  taskEvent,
  type TaskRecord,
  type TaskReplay,
} from "../../src/common/编排/task-state.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  WORKFLOW_PROTOCOL_FIXED_V2_1,
  type TaskStateEvent,
  type WorkflowEvent,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import { closeApplicationTaskDirect } from "../../app/desktop/session/fixed-workflow/stage-dispatch.ts";

const FLOW = "snake";
const AT = "2026-11-18T00:00:00.000Z";

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

async function makeRoot(prefix = "ans-app-dispatch-svc-"): Promise<string> {
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
async function writeIntent(root: string): Promise<void> {
  await writeFile(root, "docs/product/snake-intent-v1.md",
    "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇游戏\n---\n# 意图\n");
  await writeFile(root, "docs/intents/snake-intent.md",
    "---\nintentId: snake-intent\nflowId: snake\ngoal: 贪吃蛇游戏\n---\n# 意图入口\n");
}

type StartedEvent = Extract<WorkflowEvent, { kind: "workflow.started" }>;
type RequestedEvent = Extract<WorkflowEvent, { kind: "stage.requested" }>;
type DispatchedEvent = Extract<WorkflowEvent, { kind: "stage.dispatched" }>;
type TaskCreatedEventView = Extract<TaskStateEvent, { kind: "task.created" }>;
type RequestCreatedEventView = Extract<TaskStateEvent, { kind: "request.created" }>;

async function eventsOf(root: string, workflowId: string): Promise<WorkflowEvent[]> {
  const ledger = await readWorkflowLedger(root);
  return ledger.events.filter((event) => event.workflowId === workflowId);
}
async function ofKind<K extends WorkflowEvent["kind"]>(
  root: string,
  workflowId: string,
  kind: K,
): Promise<Array<Extract<WorkflowEvent, { kind: K }>>> {
  return (await eventsOf(root, workflowId)).filter(
    (event): event is Extract<WorkflowEvent, { kind: K }> => event.kind === kind);
}
async function viewOf(root: string, workflowId: string) {
  const ledger = await readWorkflowLedger(root);
  const tasks = await readTaskState(root);
  return deriveWorkflowView(ledger.events.filter((event) => event.workflowId === workflowId), tasks.events);
}
async function taskOf(root: string, workflowId: string, stage: WorkflowStage, to?: string): Promise<TaskRecord> {
  const state = await readTaskState(root);
  const record = [...state.records.values()].find((entry) => entry.created?.workflowId === workflowId
    && entry.created.stage === stage
    && (to === undefined || entry.created.to === to));
  assert.ok(record !== undefined, `应存在 ${workflowId}/${stage}${to !== undefined ? `→${to}` : ""} 任务`);
  return record!;
}
async function tasksOfStage(root: string, workflowId: string, stage: WorkflowStage): Promise<TaskRecord[]> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((entry) => entry.created?.workflowId === workflowId && entry.created.stage === stage);
}
async function startA(root: string, extra: Record<string, unknown> = {}) {
  const selected = await selectWorkflow({
    projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-customer-1", ...extra,
  });
  assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
  if (!selected.ok) throw new Error("unreachable");
  return selected;
}
async function startB(root: string, extra: Record<string, unknown> = {}) {
  const selected = await selectWorkflow({
    projectRoot: root, flowId: FLOW, workflowPath: "B", sourceTaskId: "turn-customer-b1", ...extra,
  });
  assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
  if (!selected.ok) throw new Error("unreachable");
  return selected;
}
async function drive(root: string, workflowId: string, stage?: WorkflowStage) {
  const receipt = await driveAppDispatchStage({ projectRoot: root, workflowId, ...(stage !== undefined ? { stage } : {}) });
  return receipt;
}
async function driveOk(root: string, workflowId: string, stage?: WorkflowStage) {
  const receipt = await drive(root, workflowId, stage);
  assert.equal(receipt.ok, true, receipt.ok === false ? `${receipt.code}: ${receipt.message}` : "");
  if (!receipt.ok) throw new Error("unreachable");
  return receipt;
}
async function report(
  root: string,
  taskId: string,
  from: string,
  status: "done" | "blocked" | "failed",
  summary: string,
  evidence?: string[],
): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.reported", {
    taskId, from, status, summary,
    ...(evidence !== undefined && evidence.length > 0 ? { evidence } : {}),
  }, () => new Date(AT)));
  assert.equal(appended.ok, true, appended.ok === false ? `${appended.code ?? ""} ${appended.message}` : "");
}

/** 以合法转移顺序补种「已完成阶段」（夹具；用于直达目标阶段的任务形状/观察语义）。 */
async function seedCompleted(root: string, workflowId: string, path: "A" | "B", stages: readonly WorkflowStage[]): Promise<void> {
  const at = new Date(AT).toISOString();
  for (const stage of stages) {
    const request: WorkflowEvent = {
      v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
      workflowId, flowId: FLOW, path,
      idempotencyKey: `seed-request:${workflowId}:${stage}`,
      stage, requestTaskId: `seed-task:${stage}`, requestDigest: sha(`seed-${stage}`), attempt: 1,
    };
    const requested = await appendWorkflowEvent(root, request);
    assert.equal(requested.ok, true, requested.ok === false ? requested.message : "");
    const completion: WorkflowEvent = {
      v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
      workflowId, flowId: FLOW, path,
      idempotencyKey: `seed-complete:${workflowId}:${stage}`,
      stage, cause: { kind: "task-closed", ref: `seed-task:${stage}` }, artifacts: [],
    };
    const completed = await appendWorkflowEvent(root, completion);
    assert.equal(completed.ok, true, completed.ok === false ? completed.message : "");
  }
}

// —————————————— 1) selectWorkflow ——————————————

test("selectWorkflow(A)：workflow.started 协议/定义/参数 + A1 stage-execution 创建即完成；事件/任务形状精确", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    assert.equal(selected.protocol, APP_DISPATCH_PROTOCOL);
    assert.equal(selected.protocol, "app-dispatch/v1");
    assert.equal(selected.flowId, FLOW);
    assert.equal(selected.workflowPath, "A");
    assert.equal(selected.acceptanceStrength, "standard");
    assert.deepEqual(selected.definition, {
      id: "add", version: 1, sha256: WORKFLOW_DEFINITION_HASHES.add,
    });
    assert.equal(getWorkflowDefinition("add")!.ok, true, "引用的定义必须在注册表内");
    assert.equal(selected.stage, "A1");
    assert.equal(selected.replay, false);
    assert.equal(selected.tasks.length, 1);
    const receipt = selected.tasks[0]!;
    assert.equal(receipt.taskKind, "stage-execution");
    assert.equal(receipt.to, "product");
    assert.equal(receipt.replay, false);

    // workflow.started：protocol/definition/parameters/sourceTaskId/trigger（缺省 fixed-v2.1 互斥）。
    const starts = await ofKind(root, selected.workflowId, "workflow.started");
    assert.equal(starts.length, 1);
    const started: StartedEvent = starts[0]!;
    assert.equal(started.protocol, WORKFLOW_PROTOCOL_APP_DISPATCH);
    assert.equal(started.definition?.id, "add");
    assert.equal(started.definition?.version, 1);
    assert.equal(started.definition?.sha256, WORKFLOW_DEFINITION_HASHES.add);
    assert.deepEqual(started.parameters, { acceptanceStrength: "standard" });
    assert.equal(started.sourceTaskId, "turn-customer-1");
    assert.equal(started.trigger.by, "chief");
    assert.equal(started.path, "A");

    // stage.requested：应用签发 + 事件先写携带 taskId。
    const requested = await ofKind(root, selected.workflowId, "stage.requested");
    assert.equal(requested.length, 1);
    const requestedEvent: RequestedEvent = requested[0]!;
    assert.equal(requestedEvent.stage, "A1");
    assert.equal(requestedEvent.attempt, 1);
    assert.equal(requestedEvent.issuedBy, "application");
    assert.equal(requestedEvent.requestTaskId, receipt.taskId);
    assert.equal(requestedEvent.idempotencyKey, `stage-request:${selected.workflowId}:A1:1`);

    // task.created：from=application、to=product、taskKind/idempotencyKey/sideEffect。
    const state = await readTaskState(root);
    const created = state.records.get(receipt.taskId)?.created;
    assert.ok(created !== undefined);
    assert.equal(created!.from, "application");
    assert.equal(created!.to, "product");
    assert.equal(created!.taskKind, "stage-execution");
    assert.equal(created!.sideEffect, "docs");
    assert.equal(created!.flowId, FLOW);
    assert.equal(created!.workflowId, selected.workflowId);
    assert.equal(created!.stage, "A1");
    assert.equal(created!.runId, undefined, "fixed 应用任务不得携带 runId");
    assert.equal(created!.idempotencyKey, stageExecutionIdempotencyKey(selected.workflowId, "A1", "product", 1));
    assert.equal(created!.taskId, appDispatchTaskId(created!.idempotencyKey), "taskId 由幂等键确定性派生（崩溃可重建）");
    assert.match(created!.text, /A1/);
    assert.match(created!.text, /任务由应用按流程定义创建/);

    // stage.dispatched：应用签发 + executorKind；A1 创建即完成。
    const dispatched = await ofKind(root, selected.workflowId, "stage.dispatched");
    assert.equal(dispatched.length, 1);
    const dispatchedEvent: DispatchedEvent = dispatched[0]!;
    assert.equal(dispatchedEvent.stage, "A1");
    assert.equal(dispatchedEvent.taskId, receipt.taskId);
    assert.equal(dispatchedEvent.targetRoleId, "product");
    assert.equal(dispatchedEvent.issuedBy, "application");
    assert.equal(dispatchedEvent.executorKind, "built-in");
    assert.equal(dispatchedEvent.idempotencyKey, `stage-dispatch:${selected.workflowId}:A1:${receipt.taskId}`);
    const view = await viewOf(root, selected.workflowId);
    assert.equal(view.stages.A1.status, "completed", "A1 创建即完成（DISPATCH_COMPLETES）");
    assert.equal(view.workflowId, selected.workflowId);
  } finally {
    await cleanup(root);
  }
});

test("selectWorkflow(B)：首阶段 B1 worker-dispatch→convener；幂等重放同 workflowId/同任务/不重复事件", async () => {
  const root = await makeRoot();
  try {
    const selected = await startB(root);
    assert.equal(selected.stage, "B1");
    assert.deepEqual(selected.definition, { id: "modify", version: 1, sha256: WORKFLOW_DEFINITION_HASHES.modify });
    const receipt = selected.tasks[0]!;
    assert.equal(receipt.taskKind, "worker-dispatch");
    assert.equal(receipt.to, "convener");
    const created = (await readTaskState(root)).records.get(receipt.taskId)?.created;
    assert.ok(created !== undefined);
    assert.equal(created!.from, "application");
    assert.equal(created!.to, "convener");
    assert.equal(created!.taskKind, "worker-dispatch");
    assert.equal(created!.sideEffect, "read-only");
    assert.equal(created!.stage, "B1");
    assert.equal(created!.idempotencyKey, workerDispatchIdempotencyKey(selected.workflowId, "B1", 1));
    assert.equal(created!.taskId, appDispatchTaskId(created!.idempotencyKey));
    const dispatched = (await ofKind(root, selected.workflowId, "stage.dispatched"))[0]!;
    assert.equal(dispatched.executorKind, "worker-dispatch");
    assert.equal(dispatched.issuedBy, "application");

    // 幂等重放：同一 (flow,path,sourceTaskId) ⇒ 原 workflowId + 原任务；不重复 workflow.started/任务。
    const replay = await startB(root);
    assert.equal(replay.workflowId, selected.workflowId);
    assert.equal(replay.replay, true);
    assert.equal(replay.tasks[0]!.taskId, receipt.taskId);
    assert.equal(replay.tasks[0]!.replay, true);
    assert.equal((await ofKind(root, selected.workflowId, "workflow.started")).length, 1);
    assert.equal((await readTaskState(root)).records.size, 1, "重放不重复建任务");
  } finally {
    await cleanup(root);
  }
});

test("selectWorkflow 拒绝面：sourceTaskId 缺失/flowId 非法/path 非法/未知定义/版本不符/路径不符/验收强度非法", async () => {
  const root = await makeRoot();
  try {
    const noSource = await selectWorkflow({ projectRoot: root, flowId: FLOW, workflowPath: "A" });
    assert.equal(noSource.ok, false);
    if (!noSource.ok) {
      assert.equal(noSource.code, "stage-request-source-missing");
      assert.deepEqual(noSource.missing, ["sourceTaskId"]);
    }
    const badFlow = await selectWorkflow({ projectRoot: root, flowId: "Snake_1", workflowPath: "A", sourceTaskId: "t" });
    assert.equal(badFlow.ok, false);
    if (!badFlow.ok) assert.equal(badFlow.code, "stage-request-invalid");
    const badPath = await selectWorkflow({ projectRoot: root, flowId: FLOW, workflowPath: "C" as never, sourceTaskId: "t" });
    assert.equal(badPath.ok, false);
    if (!badPath.ok) assert.equal(badPath.code, "stage-request-invalid");
    const unknownDef = await selectWorkflow({
      projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "t", definitionId: "delete",
    });
    assert.equal(unknownDef.ok, false);
    if (!unknownDef.ok) assert.equal(unknownDef.code, "workflow-definition-unknown");
    const badVersion = await selectWorkflow({
      projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "t", definitionVersion: 2,
    });
    assert.equal(badVersion.ok, false);
    if (!badVersion.ok) assert.equal(badVersion.code, "workflow-definition-version-unsupported");
    const pathMismatch = await selectWorkflow({
      projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "t", definitionId: "modify",
    });
    assert.equal(pathMismatch.ok, false);
    if (!pathMismatch.ok) assert.equal(pathMismatch.code, "workflow-definition-unknown");
    const badStrength = await selectWorkflow({
      projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "t", acceptanceStrength: "quick" as never,
    });
    assert.equal(badStrength.ok, false);
    if (!badStrength.ok) assert.equal(badStrength.code, "stage-request-invalid");
    // 所有拒绝都不得写账本。
    assert.equal((await readWorkflowLedger(root)).events.length, 0);
    assert.equal((await readTaskState(root)).records.size, 0);
  } finally {
    await cleanup(root);
  }
});

test("selectWorkflow 冲突面：同 flow 不同定义/验收强度 ⇒ workflow-active-conflict；他 flow 活动 ⇒ workflow-workspace-busy；显式 workflowId 不采信", async () => {
  const root = await makeRoot();
  try {
    const first = await startA(root);
    const strengthConflict = await selectWorkflow({
      projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-customer-1", acceptanceStrength: "light",
    });
    assert.equal(strengthConflict.ok, false);
    if (!strengthConflict.ok) assert.equal(strengthConflict.code, "stage-request-invalid", "同 start 键不得重放为不同验收强度");
    const pathConflict = await selectWorkflow({
      projectRoot: root, flowId: FLOW, workflowPath: "B", sourceTaskId: "turn-other",
    });
    assert.equal(pathConflict.ok, false);
    if (!pathConflict.ok) assert.equal(pathConflict.code, "workflow-active-conflict");
    const otherFlowBusy = await selectWorkflow({
      projectRoot: root, flowId: "othello", workflowPath: "A", sourceTaskId: "turn-other",
    });
    assert.equal(otherFlowBusy.ok, false);
    if (!otherFlowBusy.ok) assert.equal(otherFlowBusy.code, "workflow-workspace-busy");
    // 同 flow 同定义但新 sourceTaskId ⇒ 复用活动 workflow（幂等续驱，不新起）。
    const continueSame = await selectWorkflow({
      projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-customer-2",
    });
    assert.equal(continueSame.ok, true);
    if (continueSame.ok) {
      assert.equal(continueSame.workflowId, first.workflowId);
      assert.equal(continueSame.replay, true);
    }
    // 显式 workflowId 与确定性计算值不一致 ⇒ 拒绝（模型不可自报）。
    const root2 = await makeRoot();
    try {
      const explicit = await selectWorkflow({
        projectRoot: root2, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-x", workflowId: "wf-0123456789abcdef01234567",
      });
      assert.equal(explicit.ok, false);
      if (!explicit.ok) assert.equal(explicit.code, "stage-request-invalid");
    } finally {
      await cleanup(root2);
    }
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2) driveAppDispatchStage ——————————————

test("drive：A2 stage-execution 形状 + 重放不重复；B2/A12 无任务拒绝；A11 前 AC-09；非法转移/未知阶段", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    const a2 = await driveOk(root, WF);
    assert.equal(a2.stage, "A2");
    assert.equal(a2.attempt, 1);
    assert.equal(a2.requested, true);
    assert.equal(a2.dispatched, true);
    assert.equal(a2.completed, false);
    const receipt = a2.tasks[0]!;
    assert.equal(receipt.taskKind, "stage-execution");
    assert.equal(receipt.to, "product");
    assert.equal(receipt.idempotencyKey, `stage-exec:${WF}:A2:product:1`);
    assert.equal(receipt.taskId, appDispatchTaskId(stageExecutionIdempotencyKey(WF, "A2", "product", 1)));
    const created = (await readTaskState(root)).records.get(receipt.taskId)?.created;
    assert.equal(created?.from, "application");
    assert.equal(created?.taskKind, "stage-execution");
    assert.equal(created?.stage, "A2");
    assert.equal(created?.sideEffect, "docs");
    assert.equal(created?.to, "product");

    // 重放：不回写已存在事件、不重复请求/任务。
    const replay = await driveOk(root, WF, "A2");
    assert.equal(replay.replay, true);
    assert.equal(replay.tasks[0]!.taskId, receipt.taskId);
    assert.equal(replay.tasks[0]!.replay, true);
    assert.equal((await ofKind(root, WF, "stage.requested")).filter((event) => event.stage === "A2").length, 1);
    assert.equal((await ofKind(root, WF, "stage.dispatched")).filter((event) => event.stage === "A2").length, 1);
    assert.equal((await tasksOfStage(root, WF, "A2")).length, 1);

    // B2/A12 无任务阶段 ⇒ stage-transition-invalid（不建任务）。
    const rootB = await makeRoot();
    try {
      const selectedB = await startB(rootB);
      await seedCompleted(rootB, selectedB.workflowId, "B", ["B1"]);
      const b2 = await drive(rootB, selectedB.workflowId, "B2");
      assert.equal(b2.ok, false);
      if (!b2.ok) {
        assert.equal(b2.code, "stage-transition-invalid");
        assert.match(b2.message, /B2 由应用确定性派生/);
      }
      assert.equal((await tasksOfStage(rootB, selectedB.workflowId, "B2")).length, 0);
    } finally {
      await cleanup(rootB);
    }
    // A12 聚合无任务：补种到 A11 完成。
    await seedCompleted(root, WF, "A", ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"]);
    const a12 = await drive(root, WF, "A12");
    assert.equal(a12.ok, false);
    if (!a12.ok) {
      assert.equal(a12.code, "stage-transition-invalid");
      assert.match(a12.message, /A12 由 A12b accepted/);
    }
    // AC-09：A11 派发前 A12a 必须已创建（重开新 workflow，先到 A10 completed）。
    const root2 = await makeRoot();
    try {
      const selected2 = await startA(root2);
      const WF2 = selected2.workflowId;
      await seedCompleted(root2, WF2, "A", ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"]);
      const a11Early = await drive(root2, WF2, "A11");
      assert.equal(a11Early.ok, false);
      if (!a11Early.ok) {
        assert.equal(a11Early.code, "stage-transition-invalid");
        assert.match(a11Early.message, /A12a/);
      }
      assert.equal((await tasksOfStage(root2, WF2, "A11")).length, 0);
    } finally {
      await cleanup(root2);
    }
    // 未知阶段（定义外）⇒ stage-transition-invalid。
    const unknownStage = await drive(root, WF, "B1");
    assert.equal(unknownStage.ok, false);
    if (!unknownStage.ok) assert.equal(unknownStage.code, "stage-transition-invalid");
  } finally {
    await cleanup(root);
  }
});

test("drive 任务形状矩阵：A4/A5/A7/A8/A9/A12a/A12b（from=application、幂等键、executorKind、stage.dispatched 应用签发）", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    await seedCompleted(root, WF, "A", ["A2", "A3"]);

    // A4（on-dispatch，创建即完成）与 A5（待报告）。
    const a4 = await driveOk(root, WF, "A4");
    assert.equal(a4.tasks[0]!.to, "rapporteur");
    assert.equal(a4.tasks[0]!.taskKind, "stage-execution");
    assert.equal(a4.tasks[0]!.idempotencyKey, stageExecutionIdempotencyKey(WF, "A4", "rapporteur", 1));
    assert.equal(a4.completed, true, "A4 创建即完成");
    const a5 = await driveOk(root, WF);
    assert.equal(a5.stage, "A5");
    assert.equal(a5.tasks[0]!.to, "rapporteur");
    assert.equal(a5.tasks[0]!.idempotencyKey, stageExecutionIdempotencyKey(WF, "A5", "rapporteur", 1));
    const a4Created = await taskOf(root, WF, "A4");
    assert.equal(a4Created.created!.from, "application");
    assert.equal(a4Created.created!.taskKind, "stage-execution");
    assert.equal(a4Created.taskId, (await ofKind(root, WF, "stage.requested")).find((event) => event.stage === "A4")!.requestTaskId);
    const a4Dispatch = (await ofKind(root, WF, "stage.dispatched")).find((event) => event.stage === "A4")!;
    assert.equal(a4Dispatch.issuedBy, "application");
    assert.equal(a4Dispatch.executorKind, "built-in");
    assert.equal(a4Dispatch.targetRoleId, "rapporteur");
    assert.equal((await viewOf(root, WF)).stages.A4.status, "completed");

    // A7/A8：补种 A5/A6 完成后 drive A7（on-dispatch）→ A8。
    await seedCompleted(root, WF, "A", ["A5", "A6"]);
    const a7 = await driveOk(root, WF);
    assert.equal(a7.stage, "A7");
    assert.equal(a7.tasks[0]!.to, "nominator");
    assert.equal(a7.completed, true, "A7 创建即完成");
    const a8 = await driveOk(root, WF);
    assert.equal(a8.stage, "A8");
    assert.equal(a8.tasks[0]!.to, "nominator");
    assert.equal(a8.tasks[0]!.idempotencyKey, stageExecutionIdempotencyKey(WF, "A8", "nominator", 1));
    const a8Created = await taskOf(root, WF, "A8");
    assert.equal(a8Created.created!.from, "application");
    assert.equal(a8Created.created!.sideEffect, "docs");
    assert.match(a8Created.created!.text, /activate_role_documents/);
    assert.equal(a8.tasks[0]!.taskKind, "stage-execution");

    // A9：convener stage-execution（docs）。
    await seedCompleted(root, WF, "A", ["A8"]);
    const a9 = await driveOk(root, WF);
    assert.equal(a9.stage, "A9");
    assert.equal(a9.tasks[0]!.to, "convener");
    assert.equal(a9.tasks[0]!.idempotencyKey, stageExecutionIdempotencyKey(WF, "A9", "convener", 1));
    assert.equal((await taskOf(root, WF, "A9")).created!.sideEffect, "docs");

    // A12a：review 执行者（缺省 roster 不可读 ⇒ verifier），executorKind=review。
    await seedCompleted(root, WF, "A", ["A9", "A10"]);
    const a12a = await driveOk(root, WF);
    assert.equal(a12a.stage, "A12a");
    assert.equal(a12a.tasks[0]!.to, "verifier");
    assert.equal(a12a.tasks[0]!.idempotencyKey, stageExecutionIdempotencyKey(WF, "A12a", "verifier", 1));
    const a12aCreated = await taskOf(root, WF, "A12a");
    assert.equal(a12aCreated.created!.from, "application");
    assert.equal(a12aCreated.created!.taskKind, "stage-execution");
    assert.equal(a12aCreated.created!.sideEffect, "docs");
    const a12aDispatch = (await ofKind(root, WF, "stage.dispatched")).find((event) => event.stage === "A12a")!;
    assert.equal(a12aDispatch.executorKind, "review");
    assert.equal(a12aDispatch.issuedBy, "application");

    // A11：worker-dispatch→convener（read-only）；A12a 在办时显式推进 A11（G-1）。
    const a11 = await driveOk(root, WF, "A11");
    assert.equal(a11.stage, "A11");
    assert.equal(a11.tasks[0]!.taskKind, "worker-dispatch");
    assert.equal(a11.tasks[0]!.to, "convener");
    assert.equal(a11.tasks[0]!.idempotencyKey, workerDispatchIdempotencyKey(WF, "A11", 1));
    const a11Created = await taskOf(root, WF, "A11");
    assert.equal(a11Created.created!.from, "application");
    assert.equal(a11Created.created!.sideEffect, "read-only");
    assert.equal(a11Created.created!.taskKind, "worker-dispatch");
    assert.equal((await ofKind(root, WF, "stage.dispatched")).find((event) => event.stage === "A11")!.executorKind, "worker-dispatch");

    // A12b：A11 完成后应用直派 review。
    await seedCompleted(root, WF, "A", ["A11"]);
    const a12b = await driveOk(root, WF);
    assert.equal(a12b.stage, "A12b");
    assert.equal(a12b.tasks[0]!.to, "verifier");
    assert.equal(a12b.tasks[0]!.idempotencyKey, stageExecutionIdempotencyKey(WF, "A12b", "verifier", 1));
    const a12bCreated = await taskOf(root, WF, "A12b");
    assert.equal(a12bCreated.created!.from, "application");
    assert.equal(a12bCreated.created!.sideEffect, "docs");
    assert.match(a12bCreated.created!.text, /acceptance|验收/);
    assert.equal((await ofKind(root, WF, "stage.dispatched")).find((event) => event.stage === "A12b")!.executorKind, "review");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 3) 报告观察 ——————————————

test("observe：done⇒accepted+stage.completed（应用收口 by=application）；重放幂等；无报告/非应用任务/worker-dispatch 拒绝", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    const a2 = await driveOk(root, WF);
    const taskId = a2.tasks[0]!.taskId;

    // 无报告：报告只是报告，收口必须基于 task.reported。
    const noReport = await observeAppDispatchTaskReport({ projectRoot: root, taskId });
    assert.equal(noReport.ok, false);
    if (!noReport.ok) assert.equal(noReport.code, "close-report-missing");

    await writeIntent(root);
    await report(root, taskId, "product", "done", "意图完成", ["docs/product/snake-intent-v1.md"]);
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId });
    assert.equal(observed.ok, true, observed.ok === false ? `${observed.code}: ${observed.message}` : "");
    if (observed.ok) {
      assert.equal(observed.outcome, "accepted");
      assert.equal(observed.stage, "A2");
      assert.equal(observed.stageCompleted, true);
      assert.equal(observed.taskKind, "stage-execution");
      assert.equal(observed.retried, undefined);
      assert.equal(observed.blocked, undefined);
      assert.equal(observed.replay, false);
    }
    const state = await readTaskState(root);
    const closed = state.records.get(taskId)?.closed;
    assert.ok(closed !== undefined);
    assert.equal(closed!.by, "application", "应用任务收口 by=application");
    assert.equal(closed!.outcome, "accepted");
    assert.equal(closed!.actionSource?.kind, "role-direct");
    if (closed!.actionSource?.kind === "role-direct") {
      assert.equal(closed!.actionSource.actorRoleId, "application");
    }
    const completed = (await ofKind(root, WF, "stage.completed")).find((event) => event.stage === "A2");
    assert.ok(completed !== undefined);
    assert.equal(completed!.cause.kind, "task-closed");
    assert.equal(completed!.cause.ref, taskId);
    assert.deepEqual(completed!.artifacts.map((artifact) => artifact.path), ["docs/product/snake-intent-v1.md"]);
    assert.equal((await viewOf(root, WF)).stages.A2.status, "completed");

    // 重放：同任务再观察 ⇒ 原 outcome/replay=true，不重复写 stage.completed。
    const replay = await observeAppDispatchTaskReport({ projectRoot: root, taskId });
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.outcome, "accepted");
      assert.equal(replay.stageCompleted, true);
    }
    assert.equal((await ofKind(root, WF, "stage.completed")).filter((event) => event.stage === "A2").length, 1);

    // worker-dispatch 任务由运营收口（Q6）；应用观察拒绝。
    const bRoot = await makeRoot();
    try {
      const selectedB = await startB(bRoot);
      const b1 = (await tasksOfStage(bRoot, selectedB.workflowId, "B1"))[0]!;
      await report(bRoot, b1.taskId, "convener", "done", "已派分析");
      const refused = await observeAppDispatchTaskReport({ projectRoot: bRoot, taskId: b1.taskId });
      assert.equal(refused.ok, false);
      if (!refused.ok) {
        assert.equal(refused.code, "close-task-invalid");
        assert.match(refused.message, /worker-dispatch 任务由运营收口/);
      }
    } finally {
      await cleanup(bRoot);
    }
    // 非 application 任务（stage-request）拒绝。
    const vRoot = await makeRoot();
    try {
      const old = await requestStage({
        projectRoot: vRoot, flowId: FLOW, stage: "A1", workflowPath: "A",
        requestDigest: sha("old"), sourceTaskId: "turn-old", text: "old",
      });
      assert.equal(old.ok, true);
      if (old.ok) {
        const refused = await observeAppDispatchTaskReport({ projectRoot: vRoot, taskId: old.taskId });
        assert.equal(refused.ok, false);
        if (!refused.ok) assert.equal(refused.code, "close-identity-invalid");
      }
    } finally {
      await cleanup(vRoot);
    }
  } finally {
    await cleanup(root);
  }
});

test("observe blocked：Q8 一次自动重试（新 attempt/新幂等键）→ 预算耗尽保持 blocked；重试不覆盖旧 attempt", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    const a2 = await driveOk(root, WF);
    const first = a2.tasks[0]!.taskId;
    await report(root, first, "product", "blocked", "阻塞（缺输入）");
    const observed1 = await observeAppDispatchTaskReport({ projectRoot: root, taskId: first });
    assert.equal(observed1.ok, true);
    if (observed1.ok) {
      assert.equal(observed1.outcome, "rejected");
      assert.equal(observed1.stageCompleted, false);
      assert.deepEqual(observed1.retried, { stage: "A2", attempt: 2 }, "Q8：1 次自动重试");
      assert.equal(observed1.blocked, undefined);
    }
    const a2Tasks = await tasksOfStage(root, WF, "A2");
    assert.equal(a2Tasks.length, 2);
    const second = a2Tasks.find((record) => record.created!.idempotencyKey === stageExecutionIdempotencyKey(WF, "A2", "product", 2))!;
    assert.ok(second !== undefined);
    assert.notEqual(second.taskId, first, "重试 = 新任务（新幂等键）");
    assert.equal((await ofKind(root, WF, "stage.requested")).filter((event) => event.stage === "A2").map((event) => event.attempt).sort().join(","), "1,2");
    const blockedEvents1 = (await ofKind(root, WF, "stage.blocked")).filter((event) => event.stage === "A2");
    assert.equal(blockedEvents1.length, 1, "第一次 blocked 已记账（不被重试覆盖）");
    assert.equal(blockedEvents1[0]!.attempt, 1);

    await report(root, second.taskId, "product", "blocked", "仍阻塞");
    const observed2 = await observeAppDispatchTaskReport({ projectRoot: root, taskId: second.taskId });
    assert.equal(observed2.ok, true);
    if (observed2.ok) {
      assert.equal(observed2.outcome, "rejected");
      assert.deepEqual(observed2.blocked, { retryBudgetExhausted: true, highRiskNoRedispatch: false });
      assert.equal(observed2.retried, undefined);
    }
    assert.equal((await tasksOfStage(root, WF, "A2")).length, 2, "预算耗尽不得再建第 3 个任务");
    assert.equal((await viewOf(root, WF)).stages.A2.status, "blocked");
    // Q8：预算耗尽后交客户/运营；应用驱动的自动重试被预算门拒绝（不无限重派）。
    const manualRetry = await drive(root, WF, "A2");
    assert.equal(manualRetry.ok, false);
    if (!manualRetry.ok) {
      assert.equal(manualRetry.code, "stage-transition-invalid");
      assert.match(manualRetry.message, /自动重试预算已耗尽/);
    }
  } finally {
    await cleanup(root);
  }
});

test("observe A12b：light + blocked + 归档 ⇒ accepted + A12 聚合（B31）；standard blocked 默认重试；显式 rework 写 A12b→A11", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root, { acceptanceStrength: "light" });
    const WF = selected.workflowId;
    await seedCompleted(root, WF, "A", ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"]);
    const a12b = await driveOk(root, WF, "A12b");
    const taskId = a12b.tasks[0]!.taskId;
    await writeFile(root, "docs/acceptance/snake-acceptance-v1.md",
      `---\nworkflowId: ${WF}\nreport: docs/quality/snake-report-v1.md\nreportSha256: ${"a".repeat(64)}\n---\n# 验收归档\n`);
    await report(root, taskId, "verifier", "blocked", "静态证据接受（运行期未验证）");
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId });
    assert.equal(observed.ok, true, observed.ok === false ? `${observed.code}: ${observed.message}` : "");
    if (observed.ok) {
      assert.equal(observed.outcome, "accepted", "light blocked + 归档 ⇒ accept-with-archive（B31）");
      assert.equal(observed.stageCompleted, true);
    }
    const closed = (await readTaskState(root)).records.get(taskId)?.closed;
    assert.equal(closed?.by, "application");
    assert.match(closed?.note ?? "", /light acceptance/);
    const view = await viewOf(root, WF);
    assert.equal(view.stages.A12b.status, "completed");
    assert.equal(view.stages.A12.status, "completed", "A12b accepted + 归档 ⇒ A12 聚合完成");
    // 无归档的 light blocked ⇒ 默认 reject（不伪造通过）。
    const rootNoArchive = await makeRoot();
    try {
      const selectedNo = await startA(rootNoArchive, { acceptanceStrength: "light" });
      await seedCompleted(rootNoArchive, selectedNo.workflowId, "A", ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"]);
      const driven = await driveOk(rootNoArchive, selectedNo.workflowId, "A12b");
      const noArchiveTask = driven.tasks[0]!.taskId;
      await report(rootNoArchive, noArchiveTask, "verifier", "blocked", "blocked，无归档");
      const observedNo = await observeAppDispatchTaskReport({ projectRoot: rootNoArchive, taskId: noArchiveTask });
      assert.equal(observedNo.ok, true);
      if (observedNo.ok) {
        assert.equal(observedNo.outcome, "rejected");
        assert.equal(observedNo.stageCompleted, false);
        // A12b 非高风险 ⇒ Q8 自动重试一次。
        assert.deepEqual(observedNo.retried, { stage: "A12b", attempt: 2 });
      }
    } finally {
      await cleanup(rootNoArchive);
    }
  } finally {
    await cleanup(root);
  }
});

test("observe standard blocked + decision=rework：写 stage.reworked A12b→A11（attempt 2）；高风险阶段零自动重派", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    await seedCompleted(root, WF, "A", ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"]);
    const a12b = await driveOk(root, WF, "A12b");
    const taskId = a12b.tasks[0]!.taskId;
    await report(root, taskId, "verifier", "blocked", "验收不通过");
    // 显式应用策略 rework（桌面标准验收 blocked 走此分支）。2026-11-18 收尾修补：rework 成功即
    // 成功回执（receipt.reworked），不再尝试重驱原阶段（后续 advance 由桌面调用）。
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId, decision: "rework" });
    assert.equal(observed.ok, true, observed.ok === false ? `${observed.code}: ${observed.message}` : "");
    if (observed.ok) {
      assert.equal(observed.outcome, "rework");
      assert.deepEqual(observed.reworked, { reworkOf: "A12b", stage: "A11", attempt: 2 });
      assert.equal(observed.retried, undefined);
      assert.equal(observed.blocked, undefined);
      assert.equal(observed.stageCompleted, false);
    }
    const reworked = (await ofKind(root, WF, "stage.reworked"))[0]!;
    assert.equal(reworked.reworkOf, "A12b");
    assert.equal(reworked.stage, "A11");
    assert.equal(reworked.attempt, 2);
    const view = await viewOf(root, WF);
    assert.equal(view.stages.A12b.status, "failed");
    assert.equal(view.stage, "A11");
    assert.equal(view.stages.A11.status, "pending");
    // 之后正常驱动 ⇒ A11 新 attempt（A12a 已在，AC-09 满足）。
    const reDrive = await driveOk(root, WF);
    assert.equal(reDrive.stage, "A11");
    assert.equal(reDrive.attempt, 2);
    assert.equal(reDrive.tasks[0]!.idempotencyKey, workerDispatchIdempotencyKey(WF, "A11", 2));

    // 高风险零重派：A13 blocked ⇒ blocked{highRiskNoRedispatch}，不建新任务。
    const root2 = await makeRoot();
    try {
      const selected2 = await startA(root2);
      const WF2 = selected2.workflowId;
      await seedCompleted(root2, WF2, "A", ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11", "A12b", "A12"]);
      const a13 = await driveOk(root2, WF2, "A13");
      const a13Task = a13.tasks[0]!.taskId;
      assert.equal(a13.tasks[0]!.to, "convener");
      await report(root2, a13Task, "convener", "blocked", "汇总失败");
      const observed13 = await observeAppDispatchTaskReport({ projectRoot: root2, taskId: a13Task });
      assert.equal(observed13.ok, true);
      if (observed13.ok) {
        assert.equal(observed13.outcome, "rejected");
        assert.deepEqual(observed13.blocked, { retryBudgetExhausted: true, highRiskNoRedispatch: true });
        assert.equal(observed13.retried, undefined);
      }
      assert.equal((await tasksOfStage(root2, WF2, "A13")).length, 1, "高风险阶段零自动重派");
    } finally {
      await cleanup(root2);
    }
  } finally {
    await cleanup(root);
  }
});

// —————————————— 4) 卡 prompt ——————————————

test("A3 card prompt：request.created（promptId/documentRefs/选项/推荐集）+ card-prompt 任务；重放不重复", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    // 无意图入口：B24 校验失败，不呈卡、不建任务。
    const before = await driveOk(root, WF); // A2
    await report(root, before.tasks[0]!.taskId, "product", "done", "意图完成", ["docs/product/snake-intent-v1.md"]);
    // 意图文件都不存在 ⇒ observe 证据为空 ⇒ close-report-missing（先补文件再观察）。
    await writeIntent(root);
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId: before.tasks[0]!.taskId });
    assert.equal(observed.ok, true);
    // 删除意图入口，再驱动 A3 ⇒ intent-entry-missing，不写 request.created。
    await fs.rm(path.join(root, "docs", "intents", "snake-intent.md"));
    const missingEntry = await drive(root, WF);
    assert.equal(missingEntry.ok, false);
    if (!missingEntry.ok) {
      assert.equal(missingEntry.code, "intent-entry-missing");
      assert.deepEqual(missingEntry.missing, ["docs/intents/<intentId>.md"]);
    }
    assert.equal((await readTaskState(root)).events.some((event) => event.kind === "request.created"), false);
    // 恢复入口 ⇒ A3 prompt 成功。
    await writeIntent(root);
    const a3 = await driveOk(root, WF);
    assert.equal(a3.stage, "A3");
    const promptId = a3.tasks[0]!.promptId;
    assert.ok(promptId !== undefined);
    assert.equal(a3.tasks[0]!.taskKind, "card-prompt");
    assert.equal(a3.tasks[0]!.to, "chief");
    assert.equal(promptId, appDispatchPromptId(WF, "A3", 1));
    assert.equal(a3.tasks[0]!.idempotencyKey, cardPromptIdempotencyKey(WF, "A3", promptId!));
    assert.equal(a3.tasks[0]!.taskId, appDispatchTaskId(cardPromptIdempotencyKey(WF, "A3", promptId!)));

    const state = await readTaskState(root);
    const promptTask = state.records.get(a3.tasks[0]!.taskId)?.created;
    assert.ok(promptTask !== undefined);
    assert.equal(promptTask!.from, "application");
    assert.equal(promptTask!.to, "chief");
    assert.equal(promptTask!.taskKind, "card-prompt");
    assert.equal(promptTask!.sideEffect, "read-only");
    assert.equal(promptTask!.promptId, promptId);
    assert.equal(promptTask!.cardKind, "intent-confirm");
    assert.deepEqual((promptTask!.cardOptions ?? []).map((option) => option.id), ["confirm", "revise"]);
    assert.deepEqual(promptTask!.cardRecommended, ["confirm"]);
    assert.deepEqual((promptTask!.cardDocumentRefs ?? []).map((ref) => ref.kind), ["intent"]);
    assert.match(promptTask!.text, /promptId=/, "任务文本必须携带 promptId 供幕僚原样回传");
    const requestRow = state.events.find((event): event is RequestCreatedEventView =>
      event.kind === "request.created" && event.promptId === promptId);
    assert.ok(requestRow !== undefined);
    assert.equal(requestRow!.requestId, promptId);
    assert.equal(requestRow!.workflowId, WF);
    assert.equal(requestRow!.stage, "A3");
    assert.equal(requestRow!.cardKind, "intent-confirm");
    assert.equal(requestRow!.sourceRoleId, "application");
    assert.deepEqual(requestRow!.options.map((option) => option.id), ["confirm", "revise"]);
    assert.deepEqual(requestRow!.recommended, ["confirm"]);
    const intentRef = requestRow!.documentRefs?.find((ref) => ref.kind === "intent");
    assert.ok(intentRef !== undefined);
    assert.equal(intentRef!.path, "docs/product/snake-intent-v1.md");
    assert.equal(intentRef!.sha256, sha(await fs.readFile(path.join(root, "docs", "product", "snake-intent-v1.md"))));
    assert.equal(intentRef!.version, 1);
    assert.equal((await ofKind(root, WF, "stage.dispatched")).find((event) => event.stage === "A3")!.executorKind, "card-prompt");

    // 重放：不重复 request.created / card-prompt 任务。
    const replay = await driveOk(root, WF, "A3");
    assert.equal(replay.replay, true);
    assert.equal(replay.tasks[0]!.taskId, a3.tasks[0]!.taskId);
    assert.equal((await readTaskState(root)).events.filter((event) => event.kind === "request.created").length, 1);
    assert.equal((await tasksOfStage(root, WF, "A3")).length, 1);
  } finally {
    await cleanup(root);
  }
});

test("verifyCardPrompt：逐项匹配通过；选项顺序/cardKind/documentRefs/prompt 缺失/任务已收口/协议不符 全部 card-prompt-mismatch", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    await writeIntent(root);
    await seedCompleted(root, WF, "A", ["A2"]);
    const a3 = await driveOk(root, WF);
    const promptId = a3.tasks[0]!.promptId!;
    const state = await readTaskState(root);
    const requestRow = state.events.find((event): event is RequestCreatedEventView =>
      event.kind === "request.created" && event.promptId === promptId)!;
    const documentRefs = requestRow.documentRefs ?? [];

    const match = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A3", promptId, cardKind: "intent-confirm",
      optionIds: ["confirm", "revise"], documentRefs,
    });
    assert.equal(match.ok, true, match.ok === false ? `${match.code}: ${match.message}` : "");
    if (match.ok) {
      assert.equal(match.requestId, promptId);
      assert.equal(match.promptId, promptId);
      assert.equal(match.cardKind, "intent-confirm");
    }
    // 选项顺序不一致（即使集合相同）。
    const order = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A3", promptId, cardKind: "intent-confirm",
      optionIds: ["revise", "confirm"], documentRefs,
    });
    assert.equal(order.ok, false);
    if (!order.ok) assert.equal(order.code, "card-prompt-mismatch");
    // cardKind 不一致。
    const kind = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A3", promptId, cardKind: "proposal", optionIds: ["confirm", "revise"], documentRefs,
    });
    assert.equal(kind.ok, false);
    if (!kind.ok) assert.equal(kind.code, "card-prompt-mismatch");
    // documentRefs 被改写（缺省 = 不携带 ⇒ 与 prompt 不一致）。
    const refs = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A3", promptId, cardKind: "intent-confirm", optionIds: ["confirm", "revise"],
    });
    assert.equal(refs.ok, false);
    if (!refs.ok) assert.equal(refs.code, "card-prompt-mismatch");
    const tampered = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A3", promptId, cardKind: "intent-confirm", optionIds: ["confirm", "revise"],
      documentRefs: documentRefs.map((ref) => ({ ...ref, sha256: "b".repeat(64) })),
    });
    assert.equal(tampered.ok, false);
    if (!tampered.ok) assert.equal(tampered.code, "card-prompt-mismatch");
    // 未知 prompt / workflow/stage 不符。
    const unknown = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A3", promptId: "prompt-unknown", cardKind: "intent-confirm",
    });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.code, "card-prompt-mismatch");
    const wrongStage = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A6", promptId, cardKind: "intent-confirm", optionIds: ["confirm", "revise"], documentRefs,
    });
    assert.equal(wrongStage.ok, false);
    if (!wrongStage.ok) assert.equal(wrongStage.code, "card-prompt-mismatch");
    // 任务已收口 ⇒ 不得再次呈卡（应用以真实创建者身份收口 card-prompt；不写阶段事件）。
    const closed = await closeApplicationTaskDirect({
      projectRoot: root, taskId: a3.tasks[0]!.taskId, outcome: "accepted",
      operationId: "op-close-prompt-1", note: "prompt done",
    });
    assert.equal(closed.ok, true, closed.ok === false ? `${closed.code}: ${closed.message}` : "");
    const afterClose = await verifyCardPrompt({
      projectRoot: root, workflowId: WF, stage: "A3", promptId, cardKind: "intent-confirm", optionIds: ["confirm", "revise"], documentRefs,
    });
    assert.equal(afterClose.ok, false);
    if (!afterClose.ok) assert.equal(afterClose.code, "card-prompt-mismatch");

    // 协议不符：fixed-v2.1 workflow 无 promptId 校验。
    const vRoot = await makeRoot();
    try {
      const old = await requestStage({
        projectRoot: vRoot, flowId: FLOW, stage: "A1", workflowPath: "A",
        requestDigest: sha("old"), sourceTaskId: "turn-old", text: "old",
      });
      assert.equal(old.ok, true);
      if (old.ok) {
        const protocol = await verifyCardPrompt({
          projectRoot: vRoot, workflowId: old.workflowId, stage: "A3", promptId: "prompt-x", cardKind: "intent-confirm",
        });
        assert.equal(protocol.ok, false);
        if (!protocol.ok) assert.equal(protocol.code, "workflow-protocol-mismatch");
      }
    } finally {
      await cleanup(vRoot);
    }
  } finally {
    await cleanup(root);
  }
});

// —————————————— 5) worker-dispatch 与 task-state 写侧 ——————————————

test("worker-dispatch：B1/A11 任务只 application→convener、read-only；task-state 写侧三类坏形状 fail-closed", async () => {
  const root = await makeRoot();
  try {
    const selected = await startB(root);
    const WF = selected.workflowId;
    const b1 = (await tasksOfStage(root, WF, "B1"))[0]!;
    assert.equal(b1.created?.from, "application");
    assert.equal(b1.created?.to, "convener");
    assert.equal(b1.created?.taskKind, "worker-dispatch");
    assert.equal(b1.created?.sideEffect, "read-only");
    assert.equal(b1.created?.idempotencyKey, workerDispatchIdempotencyKey(WF, "B1", 1));
    assert.match(b1.created!.text, /派项目 worker/);
    assert.match(b1.created!.text, /Q6/);
    // A11 worker-dispatch 同形。
    const aRoot = await makeRoot();
    try {
      const selectedA = await startA(aRoot);
      const WFA = selectedA.workflowId;
      await seedCompleted(aRoot, WFA, "A", ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a"]);
      const a11 = await driveOk(aRoot, WFA);
      assert.equal(a11.tasks[0]!.to, "convener");
      const a11Created = (await tasksOfStage(aRoot, WFA, "A11"))[0]!.created!;
      assert.equal(a11Created.taskKind, "worker-dispatch");
      assert.equal(a11Created.sideEffect, "read-only");
      assert.equal(a11Created.idempotencyKey, workerDispatchIdempotencyKey(WFA, "A11", 1));
    } finally {
      await cleanup(aRoot);
    }

    // 写侧 fail-closed：stage-execution 只能 from=application；worker-dispatch 只能 to=convener；
    // card-prompt 必须携带 promptId（幂等键前缀也随之校验）。
    const badStageExec = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-bad-stage-exec", from: "chief", to: "product", text: "x", sideEffect: "docs",
      idempotencyKey: stageExecutionIdempotencyKey(WF, "A1", "product", 1), flowId: FLOW, workflowId: WF,
      stage: "A1", taskKind: "stage-execution",
    }));
    assert.equal(badStageExec.ok, false);
    if (!badStageExec.ok) {
      assert.equal(badStageExec.code, "invalid-task-binding");
      assert.match(badStageExec.message, /stage-execution 只允许 from=application/);
    }
    const badWorkerTarget = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-bad-worker", from: "application", to: "product", text: "x", sideEffect: "read-only",
      idempotencyKey: workerDispatchIdempotencyKey(WF, "B1", 1), flowId: FLOW, workflowId: WF,
      stage: "B1", taskKind: "worker-dispatch",
    }));
    assert.equal(badWorkerTarget.ok, false);
    if (!badWorkerTarget.ok) {
      assert.match(badWorkerTarget.message, /worker-dispatch 只允许 application→convener/);
    }
    const badWorkerPrefix = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-bad-worker-prefix", from: "application", to: "convener", text: "x", sideEffect: "read-only",
      idempotencyKey: "stage-request:x:B1:1", flowId: FLOW, workflowId: WF, stage: "B1", taskKind: "worker-dispatch",
    }));
    assert.equal(badWorkerPrefix.ok, false);
    if (!badWorkerPrefix.ok) assert.match(badWorkerPrefix.message, /worker-dispatch 幂等键必须为 worker-dispatch:/);
    const badPrompt = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-bad-prompt", from: "application", to: "chief", text: "x", sideEffect: "read-only",
      idempotencyKey: "card-prompt:wf:A3:missing", flowId: FLOW, workflowId: WF, stage: "A3", taskKind: "card-prompt",
    }));
    assert.equal(badPrompt.ok, false);
    if (!badPrompt.ok) assert.match(badPrompt.message, /必须携带非空 promptId/);
    const badStageExecSideEffect = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-bad-stage-exec-side", from: "application", to: "product", text: "x", sideEffect: "code",
      idempotencyKey: stageExecutionIdempotencyKey(WF, "A1", "product", 1), flowId: FLOW, workflowId: WF,
      stage: "A1", taskKind: "stage-execution",
    }));
    assert.equal(badStageExecSideEffect.ok, false);
    if (!badStageExecSideEffect.ok) assert.match(badStageExecSideEffect.message, /sideEffect/);
    // 新种类不得携带 legacy runId。
    const badRun = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-bad-run", from: "application", to: "product", text: "x", sideEffect: "docs",
      idempotencyKey: stageExecutionIdempotencyKey(WF, "A2", "product", 1), flowId: FLOW, workflowId: WF,
      stage: "A2", taskKind: "stage-execution", runId: "run-1",
    }));
    assert.equal(badRun.ok, false);
    if (!badRun.ok) assert.equal(badRun.code, "fixed-task-run-forbidden");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 6) reconcile ——————————————

test("reconcile：已报告未收口幂等收口；事件先写但任务缺失 ⇒ 按同一 taskId 重建；requestTaskId 不一致/dispatched 引用缺失 ⇒ corrupt", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    const a2 = await driveOk(root, WF);
    const taskId = a2.tasks[0]!.taskId;
    await writeIntent(root);
    await report(root, taskId, "product", "done", "意图完成", ["docs/product/snake-intent-v1.md"]);
    // 不对报告调用 observe：reconcile 必须幂等收口（闭包 = 应用观察）。
    const reconcile1 = await reconcileFixedWorkflow({ projectRoot: root });
    assert.equal(reconcile1.ok, true);
    const receipt1 = reconcile1.workflows.find((workflow) => workflow.workflowId === WF)!;
    assert.equal(receipt1.protocol, "app-dispatch/v1");
    assert.deepEqual(receipt1.closedTasks, [taskId]);
    assert.deepEqual(receipt1.errors, []);
    assert.equal(receipt1.corrupt, undefined);
    assert.equal((await viewOf(root, WF)).stages.A2.status, "completed");

    // 崩溃点：stage.requested/dispatched 已写、任务缺失 ⇒ 用事件 taskId 幂等重建（同一 id）。
    const a3 = await driveOk(root, WF);
    const promptTaskId = a3.tasks[0]!.taskId;
    const tasksFile = path.join(root, ".ans", "state", "tasks.jsonl");
    const lines = (await fs.readFile(tasksFile, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
    const filtered = lines.filter((line) => {
      const parsed = JSON.parse(line) as { kind?: string; taskId?: string };
      return !(parsed.kind === "task.created" && parsed.taskId === promptTaskId);
    });
    assert.equal(filtered.length, lines.length - 1);
    await fs.writeFile(tasksFile, `${filtered.join("\n")}\n`, "utf8");
    const reconcile2 = await reconcileFixedWorkflow({ projectRoot: root });
    assert.equal(reconcile2.ok, true);
    const receipt2 = reconcile2.workflows.find((workflow) => workflow.workflowId === WF)!;
    assert.equal(receipt2.corrupt, undefined);
    assert.equal(receipt2.driven?.stage, "A3");
    assert.equal(receipt2.driven?.tasks[0]?.taskId, promptTaskId, "重建任务必须沿用事件携带的 taskId");
    assert.equal((await readTaskState(root)).records.get(promptTaskId)?.created?.promptId !== undefined, true);

    // 账本不一致：stage.requested.requestTaskId 与真实任务不符 ⇒ corrupt（不猜、不自动推进）。
    const wfFile = path.join(root, ".ans", "state", "workflows.jsonl");
    const wfLines = (await fs.readFile(wfFile, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
    const mutated = wfLines.map((line) => {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed["kind"] === "stage.requested" && parsed["stage"] === "A3") parsed["requestTaskId"] = "t-bogus";
      return JSON.stringify(parsed);
    });
    await fs.writeFile(wfFile, `${mutated.join("\n")}\n`, "utf8");
    const reconcile3 = await reconcileFixedWorkflow({ projectRoot: root });
    assert.equal(reconcile3.ok, true);
    const receipt3 = reconcile3.workflows.find((workflow) => workflow.workflowId === WF)!;
    assert.match(receipt3.corrupt ?? "", /requestTaskId t-bogus 与真实任务不一致/);

    // dispatched 引用不存在的任务 ⇒ corrupt。
    const root4 = await makeRoot();
    try {
      const selected4 = await startA(root4);
      const WF4 = selected4.workflowId;
      const wf4File = path.join(root4, ".ans", "state", "workflows.jsonl");
      const wf4Lines = (await fs.readFile(wf4File, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
      const mutated4 = wf4Lines.map((line) => {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed["kind"] === "stage.dispatched" && parsed["stage"] === "A1") parsed["taskId"] = "t-missing-dispatch";
        return JSON.stringify(parsed);
      });
      await fs.writeFile(wf4File, `${mutated4.join("\n")}\n`, "utf8");
      const reconcile4 = await reconcileFixedWorkflow({ projectRoot: root4 });
      assert.equal(reconcile4.ok, true);
      const receipt4 = reconcile4.workflows.find((workflow) => workflow.workflowId === WF4)!;
      assert.match(receipt4.corrupt ?? "", /stage.dispatched A1 引用不存在的任务 t-missing-dispatch/);
    } finally {
      await cleanup(root4);
    }
  } finally {
    await cleanup(root);
  }
});

// —————————————— 7) 协议隔离 ——————————————

test("协议隔离：app 驱动拒绝 fixed-v2.1（workflow-protocol-mismatch）；reconcile 跳过旧协议；旧 requestStage 照旧", async () => {
  const root = await makeRoot();
  try {
    const old = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A",
      requestDigest: sha("old text"), sourceTaskId: "turn-old", text: "old text",
    });
    assert.equal(old.ok, true);
    if (!old.ok) return;
    // 旧记录缺省 = fixed-v2.1；未被新协议污染。
    const started = (await ofKind(root, old.workflowId, "workflow.started"))[0]!;
    assert.equal(started.protocol, undefined);
    assert.equal(WORKFLOW_PROTOCOL_FIXED_V2_1, "fixed-v2.1");
    // app 驱动对该 workflow 一律 protocol-mismatch（禁止中途换驱动）。
    const driven = await drive(root, old.workflowId);
    assert.equal(driven.ok, false);
    if (!driven.ok) {
      assert.equal(driven.code, "workflow-protocol-mismatch");
      assert.match(driven.message, /fixed-v2.1/);
    }
    // reconcile 跳过（Q10 不触碰）。
    const reconciled = await reconcileFixedWorkflow({ projectRoot: root });
    assert.equal(reconciled.ok, true);
    const receipt = reconciled.workflows.find((workflow) => workflow.workflowId === old.workflowId)!;
    assert.equal(receipt.protocol, "fixed-v2.1");
    assert.match(receipt.skipped ?? "", /fixed-v2\.1/);
    assert.equal(receipt.driven, undefined);
    // 旧 requestStage 仍可继续旧协议（A2）。旧链先由运营派产品完成 A1（stage.dispatched A1），
    // 再按旧规则收口 open A1 stage-request（报告≠收口；open advance 不变量）。
    const a1RequestTaskId = (await ofKind(root, old.workflowId, "stage.requested"))
      .find((event) => event.stage === "A1")!.requestTaskId;
    const oldA1 = (await readTaskState(root)).records.get(a1RequestTaskId)!;
    const a1ProductTask = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-old-a1-product", from: "convener", to: "product", text: "A1 产品受理", sideEffect: "docs",
      idempotencyKey: "old-a1-product-1", flowId: FLOW, workflowId: old.workflowId, stage: "A1",
    }));
    assert.equal(a1ProductTask.ok, true, a1ProductTask.ok === false ? a1ProductTask.message : "");
    const a1Dispatched = await recordStageDispatch({
      projectRoot: root, workflowId: old.workflowId, stage: "A1", taskId: "t-old-a1-product", targetRoleId: "product",
    });
    assert.equal(a1Dispatched.ok, true, a1Dispatched.ok === false ? `${a1Dispatched.code}: ${a1Dispatched.message}` : "");
    assert.equal((await viewOf(root, old.workflowId)).stages.A1.status, "completed");
    await report(root, oldA1.taskId, "convener", "done", "A1 请求已处理");
    const oldA1Closed = await closeTask({
      projectRoot: root, operationId: "op-close-old-a1", taskId: oldA1.taskId,
      outcome: "accepted", actorRoleId: "chief", note: "A1 收口",
    });
    assert.equal(oldA1Closed.ok, true, oldA1Closed.ok === false ? `${oldA1Closed.code}: ${oldA1Closed.message}` : "");
    const a2Old = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A2", workflowPath: "A",
      requestDigest: sha("old a2"), sourceTaskId: "turn-old", text: "old a2",
    });
    assert.equal(a2Old.ok, true, a2Old.ok === false ? `${a2Old.code}: ${a2Old.message}` : "");
    if (a2Old.ok) {
      assert.equal(a2Old.workflowId, old.workflowId);
      assert.equal(a2Old.replay, false);
      const created = (await readTaskState(root)).records.get(a2Old.taskId)?.created;
      assert.equal(created?.taskKind, "stage-request");
      assert.equal(created?.from, "chief");
    }
  } finally {
    await cleanup(root);
  }
});

test("app 工作流自身只产生 app 协议事件：无 stage-request 任务；无 trunk/run 依赖（workflow/task 账本独立）", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    await writeIntent(root);
    await driveOk(root, WF); // A2
    const a2Tasks = await tasksOfStage(root, WF, "A2");
    await report(root, a2Tasks[0]!.taskId, "product", "done", "意图完成", ["docs/product/snake-intent-v1.md"]);
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId: a2Tasks[0]!.taskId });
    assert.equal(observed.ok, true);
    await driveOk(root, WF); // A3
    const state = await readTaskState(root);
    for (const record of state.records.values()) {
      assert.notEqual(record.created?.taskKind, "stage-request", "新协议不产生 stage-request");
      assert.equal(record.created?.from, "application");
    }
    const requested = await ofKind(root, WF, "stage.requested");
    assert.equal(requested.every((event) => event.issuedBy === "application"), true, "新协议 stage.requested 全部由应用签发");
    // workflow 定义引用已钉死 add@1 的 hash（不静默迁移）。
    const started = (await ofKind(root, WF, "workflow.started"))[0]!;
    assert.equal(started.definition?.sha256, WORKFLOW_DEFINITION_HASHES.add);
    assert.equal(WORKFLOW_DEFINITIONS.add.version, started.definition?.version);
    // .ans/trunk、.ans/runs 未被写（新驱动只用 workflows/tasks 账本）。
    await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")), "不得写 .ans/trunk");
    await assert.rejects(fs.stat(path.join(root, ".ans", "runs")), "不得写 .ans/runs");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2026-11-18 收尾修补回归（反向驱动/旧 A3 入口/corrupt 不记 driven） ——————————————

test("反向驱动守卫：app-dispatch/v1 workflow 拒绝旧 requestStage（stage-request-removed）/recordStageDispatch（workflow-protocol-mismatch），账本零新增", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    const a1 = (await tasksOfStage(root, WF, "A1"))[0]!;
    const wfEventsBefore = (await readWorkflowLedger(root)).events.length;
    const taskEventsBefore = (await readTaskState(root)).events.length;
    // 旧驱动入口一：requestStage（stage-request 新协议已移除）⇒ 稳定拒绝 stage-request-removed
    // （2026-11-18 收尾修补实际码；recordStageDispatch 用 workflow-protocol-mismatch），不写事件/任务。
    const oldRequest = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A2", workflowPath: "A",
      requestDigest: sha("old-a2"), sourceTaskId: "turn-old", text: "old a2",
    });
    assert.equal(oldRequest.ok, false);
    if (!oldRequest.ok) {
      assert.equal(oldRequest.code, "stage-request-removed");
      assert.match(oldRequest.message, /app-dispatch\/v1/);
      assert.match(oldRequest.message, /旧 stage-request 已移除/);
    }
    // 旧驱动入口二：recordStageDispatch（stage.dispatched 只由应用驱动写）⇒ 同样拒绝。
    const oldDispatch = await recordStageDispatch({
      projectRoot: root, workflowId: WF, stage: "A1", taskId: a1.taskId, targetRoleId: "product",
    });
    assert.equal(oldDispatch.ok, false);
    if (!oldDispatch.ok) {
      assert.equal(oldDispatch.code, "workflow-protocol-mismatch");
      assert.match(oldDispatch.message, /stage\.dispatched 由应用驱动记录/);
    }
    // 两个入口都不得新增任何账本事件（含无 stage.requested/task.created/stage.dispatched）。
    assert.equal((await readWorkflowLedger(root)).events.length, wfEventsBefore, "workflow 账本零新增");
    assert.equal((await readTaskState(root)).events.length, taskEventsBefore, "tasks 账本零新增");
    const events = await eventsOf(root, WF);
    assert.equal(events.some((event) => event.kind === "stage.requested" && event.stage === "A2"), false);
    assert.equal(events.filter((event) => event.kind === "stage.dispatched" && event.stage === "A1").length, 1, "A1 派发仍只有 select 时那一条");
    assert.equal((await tasksOfStage(root, WF, "A2")).length, 0, "反向驱动不得建任务");
  } finally {
    await cleanup(root);
  }
});

test("prepareIntent 对 app-dispatch workflow 不写 A3：只返回应用意图证据（ok=true），零 workflow/task 事件新增", async () => {
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    await driveOk(root, WF); // A2
    await writeIntent(root);
    const a2 = (await tasksOfStage(root, WF, "A2"))[0]!;
    await report(root, a2.taskId, "product", "done", "意图完成", ["docs/product/snake-intent-v1.md"]);
    const observed = await observeAppDispatchTaskReport({ projectRoot: root, taskId: a2.taskId });
    assert.equal(observed.ok, true);
    const wfEventsBefore = (await readWorkflowLedger(root)).events.length;
    const taskEventsBefore = (await readTaskState(root)).events.length;
    const prepared = await prepareIntent({ projectRoot: root, flowId: FLOW, workflowId: WF });
    assert.equal(prepared.ok, true, prepared.ok === false ? `${prepared.code}: ${prepared.message}` : "");
    if (prepared.ok) {
      assert.equal(prepared.flowId, FLOW);
      assert.equal(prepared.path, "docs/product/snake-intent-v1.md");
      assert.match(prepared.marker, /ans-intent-evidence/);
      assert.equal(prepared.documentRefs.some((ref) => ref.kind === "intent"), true, "仍返回应用计算的意图引用");
    }
    // 旧 A3 入口在新协议下是纯证据读取：不写 stage.requested A3 / request.created / 任务。
    assert.equal((await readWorkflowLedger(root)).events.length, wfEventsBefore, "不写 workflow 事件");
    assert.equal((await readTaskState(root)).events.length, taskEventsBefore, "不写任务事件");
    const events = await eventsOf(root, WF);
    assert.equal(events.some((event) => event.kind === "stage.requested" && event.stage === "A3"), false);
    assert.equal((await readTaskState(root)).events.some((event) => event.kind === "request.created"), false);
    assert.equal((await tasksOfStage(root, WF, "A3")).length, 0);
  } finally {
    await cleanup(root);
  }
});

test("reconcile corrupt：requestTaskId 不一致 / dispatched 引用缺失 ⇒ corrupt 且不把该 workflow 计入 driven", async () => {
  // 场景一：stage.requested A2 的 requestTaskId 被改成不存在的 id。
  const root = await makeRoot();
  try {
    const selected = await startA(root);
    const WF = selected.workflowId;
    assert.equal((await driveOk(root, WF)).stage, "A2");
    const wfFile = path.join(root, ".ans", "state", "workflows.jsonl");
    const lines = (await fs.readFile(wfFile, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
    const mutated = lines.map((line) => {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed["kind"] === "stage.requested" && parsed["stage"] === "A2") parsed["requestTaskId"] = "t-bogus";
      return JSON.stringify(parsed);
    });
    await fs.writeFile(wfFile, `${mutated.join("\n")}\n`, "utf8");
    const receipt = await reconcileFixedWorkflow({ projectRoot: root });
    assert.equal(receipt.ok, true);
    const workflow = receipt.workflows.find((entry) => entry.workflowId === WF)!;
    assert.match(workflow.corrupt ?? "", /requestTaskId t-bogus 与真实任务不一致/);
    assert.equal(workflow.driven, undefined, "corrupt 结论不得与 driven 同时出现（不误判为已修复）");
  } finally {
    await cleanup(root);
  }
  // 场景二：stage.dispatched A1 引用不存在的任务 ⇒ corrupt，且同回执无 driven。
  const root2 = await makeRoot();
  try {
    const selected = await startA(root2);
    const WF = selected.workflowId;
    assert.equal((await driveOk(root2, WF)).stage, "A2");
    const wfFile = path.join(root2, ".ans", "state", "workflows.jsonl");
    const lines = (await fs.readFile(wfFile, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
    const mutated = lines.map((line) => {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed["kind"] === "stage.dispatched" && parsed["stage"] === "A1") parsed["taskId"] = "t-missing-dispatch";
      return JSON.stringify(parsed);
    });
    await fs.writeFile(wfFile, `${mutated.join("\n")}\n`, "utf8");
    const receipt = await reconcileFixedWorkflow({ projectRoot: root2 });
    assert.equal(receipt.ok, true);
    const workflow = receipt.workflows.find((entry) => entry.workflowId === WF)!;
    assert.match(workflow.corrupt ?? "", /stage\.dispatched A1 引用不存在的任务 t-missing-dispatch/);
    assert.equal(workflow.driven, undefined, "任何 corrupt 结论都不得与 driven 同时出现");
  } finally {
    await cleanup(root2);
  }
});

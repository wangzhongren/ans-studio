// test/桌面应用/app-dispatch-block-seams.test.ts
// 2026-11-20（SMOKE-1 接缝修复测试批，测试角色）：**card-prompt 投递/orphan 接缝 + block 账本收口**。
//
// 依据（权威）：
//   1. `角色卡/桌面窗口/docs/change/2026-11-20_change_app-dispatch-smoke-seams-desktop.md`
//      §三.2（stage-dispatch 改造）/§五（block 必现）/§六（card-prompt 投递 / orphan）/§十（待测试批 5–7/10）；
//   2. `角色卡/编排/docs/change/2026-11-20_change_app-dispatch-smoke-seams-foundation.md`
//      §二.5（blockFact/blockOutcome）/§三.5（block resolver 衔接）。
// 客户第一不变量：任务由工作流/应用侧唯一派发、taskId 确定性、任何路径不得重复建任务。
//
// 覆盖：
//   1. A3 card-prompt 目标持续 busy/未送达 ⇒ `target-busy`（B5）经 block router：
//      同一 taskId 有界重投（每 T_stall 一轮）成功 ⇒ `resolved(fixed)`；预算耗尽
//      `autoFixForbidden` ⇒ 属主修复（owner-repair）；不新开卡、不重复任务、requestId 不变；
//   2. `request.orphaned(restart)` ⇒ 同 requestId 追加 `request.created` 重呈现 + 同 taskId 重投，
//      blocks.jsonl `raised→routed(engine-auto-fix)→resolved(fixed)`；project_state orphaned 非粘性；
//   3. `request.orphaned(superseded)` / 阶段迁移 ⇒ prompt 任务按实际语义 `rejected` 收口，
//      不误重投、不重弹、不造块；
//   4. requestId/promptId 幂等、卡只一张、无孤儿遗留（project_state request-pending 可见）。
//
// 夹具：真实 SessionManager + 假会话/假时钟 + 真实任务/工作流/block 账本；直接播种
// app-dispatch/v1 工作流与 card-prompt 任务（不启动 Electron/真实模型；不占端口、不读 `.env`）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  appendTaskEvent,
  readTaskState,
  taskEvent,
  type TaskRecord,
  type TaskReplay,
} from "../../src/common/编排/task-state.ts";
import {
  appDispatchPromptId,
  appDispatchTaskId,
  cardPromptIdempotencyKey,
  appendWorkflowEvent,
  stageExecutionIdempotencyKey,
} from "../../src/common/编排/workflow-service.ts";
import {
  readBlockLedger,
  replayBlockLifecycles,
  type BlockLedgerEvent,
  type BlockLifecycle,
} from "../../src/common/编排/block-ledger.ts";
import { buildProjectStateView } from "../../src/common/编排/project-state.ts";
import { WORKFLOW_DEFINITION_HASHES } from "../../src/common/编排/workflow-definitions.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  type CustomerInputOutcome,
  type CustomerInputRequest,
  type WorkflowEvent,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { BlockFact } from "../../src/common/编排/block-resolution.ts";

const FLOW = "seamdesk";
const AT = Date.parse("2026-11-20T00:00:00.000Z");
const STALL_MS = 12 * 60 * 1000;
const MAX_AUTO_FIX = 2;

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

async function makeRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-app-dispatch-seams-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief"), builtIn("product"), builtIn("rapporteur"), builtIn("nominator"), builtIn("convener"), builtIn("verifier")],
    warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio",
  };
}

interface Harness {
  mgr: SessionManager;
  clock: { now: number };
  sent: Record<string, string[]>;
}

function harness(root: string, clock: { now: number }): Harness {
  const sent: Record<string, string[]> = {};
  const mgr = new SessionManager({
    now: () => clock.now,
    openRoleSession: async (input) => {
      const handle: RoleSessionHandle = {
        async send(text: string, _options?: RoleSessionSendOptions) {
          (sent[input.roleId] ??= []).push(text);
        },
        events() {
          let done = false;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  if (done) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  done = true;
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
    getVersionChangeStack: () => undefined,
    customerInput: async (_request: CustomerInputRequest): Promise<CustomerInputOutcome> =>
      ({ outcome: "declined", reason: "seam-test: cards not answered" }),
    emitEvent: () => {},
  });
  return { mgr, clock, sent };
}

/** 私有接缝（测试门面；生产装配见 app/desktop/session/index.ts）。 */
interface MgrInternals {
  fixedWorkflowStageDispatch: {
    selectWorkflowAndDeliver(input: {
      projectRoot: string; runtime: string; workflowPath: "A" | "B"; flowId: string; sourceTaskId?: string;
    }): Promise<{ ok: boolean; workflowId?: string; code?: string; message?: string }>;
    advance(projectRoot: string, workflowId: string, runtime: string): Promise<unknown>;
    observeApplicationTaskReport(projectRoot: string, taskId: string): Promise<void>;
    scanAppCardPromptFacts(
      projectRoot: string,
      options: { stallMs: number; maxAutoFixAttempts: number },
    ): Promise<readonly BlockFact[]>;
    redeliverAppTask(projectRoot: string, taskId: string): Promise<{ ok: boolean; note: string; reEntry?: string }>;
  };
  blockRouter: {
    observeFact(projectRoot: string, fact: BlockFact): Promise<void>;
    tick(projectRoot: string): Promise<void>;
    recover(projectRoot: string): Promise<void>;
  };
  sessionKey(projectRoot: string, roleId: string, runtime: string): string;
  sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
  deliveryQueues: Map<string, Array<{ taskId?: string; clientMessageId?: string; dedupKey: string; targetRoleId: string }>>;
}

function internals(mgr: SessionManager): MgrInternals {
  return mgr as unknown as MgrInternals;
}

// —————————————— 播种（app-dispatch/v1 + card-prompt 任务/请求） ——————————————

async function seedWorkflow(root: string, workflowId: string, flowId: string, at: string): Promise<void> {
  const started: WorkflowEvent = {
    v: 1,
    at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "workflow.started",
    workflowId,
    flowId,
    path: "A",
    idempotencyKey: `workflow-start:${flowId}:A:seed-${workflowId}`,
    trigger: { by: "chief", reason: "seam test" },
    sourceTaskId: `turn-${workflowId}`,
    protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
    definition: { id: "add", version: 2, sha256: WORKFLOW_DEFINITION_HASHES.add },
    parameters: { acceptanceStrength: "standard" },
  };
  const appended = await appendWorkflowEvent(root, started);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function seedStageCompleted(root: string, workflowId: string, flowId: string, stage: WorkflowStage, at: string): Promise<void> {
  const requested: WorkflowEvent = {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
    workflowId, flowId, path: "A",
    idempotencyKey: `seed-request:${workflowId}:${stage}`,
    stage, requestTaskId: `seed-task:${stage}`, requestDigest: sha(`seed-${stage}`), attempt: 1,
  };
  const requestedAppend = await appendWorkflowEvent(root, requested);
  assert.equal(requestedAppend.ok, true, requestedAppend.ok === false ? requestedAppend.message : "");
  const completed: WorkflowEvent = {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
    workflowId, flowId, path: "A",
    idempotencyKey: `seed-complete:${workflowId}:${stage}`,
    stage, cause: { kind: "task-closed", ref: `seed-task:${stage}` }, artifacts: [],
  };
  const completedAppend = await appendWorkflowEvent(root, completed);
  assert.equal(completedAppend.ok, true, completedAppend.ok === false ? completedAppend.message : "");
}

async function seedStageRequested(root: string, workflowId: string, flowId: string, stage: WorkflowStage, taskId: string, at: string): Promise<void> {
  const requested: WorkflowEvent = {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
    workflowId, flowId, path: "A",
    idempotencyKey: `stage-request:${workflowId}:${stage}:1`,
    stage, requestTaskId: taskId, requestDigest: sha(`stage-${stage}`), attempt: 1,
    issuedBy: "application",
  };
  const appended = await appendWorkflowEvent(root, requested);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

interface SeededPrompt {
  taskId: string;
  promptId: string;
}

/** 播种 A3 card-prompt 任务 + 同 requestId/promptId 的 request.created（应用事实形状）。 */
async function seedCardPrompt(root: string, workflowId: string, flowId: string, at: string): Promise<SeededPrompt> {
  const promptId = appDispatchPromptId(workflowId, "A3", 1);
  const taskId = appDispatchTaskId(cardPromptIdempotencyKey(workflowId, "A3", promptId));
  const created = await appendTaskEvent(root, taskEvent("task.created", {
    taskId,
    from: "application",
    to: "chief",
    text: "意图确认（A3）｜按应用 prompt 呈意图确认卡（intent-confirm）",
    sideEffect: "read-only",
    idempotencyKey: cardPromptIdempotencyKey(workflowId, "A3", promptId),
    flowId,
    workflowId,
    stage: "A3",
    taskKind: "card-prompt",
    promptId,
    cardKind: "intent-confirm",
  }, () => new Date(at)));
  assert.equal(created.ok, true, created.ok === false ? created.message : "");
  const request = await appendTaskEvent(root, taskEvent("request.created", {
    requestId: promptId,
    flowId,
    cardKind: "intent-confirm",
    workflowId,
    stage: "A3",
    promptId,
    sourceRoleId: "application",
    title: "意图确认",
    options: [
      { id: "confirm", label: "确认意图", recommended: true },
      { id: "revise", label: "返工" },
    ],
    recommended: ["confirm"],
  }, () => new Date(at)));
  assert.equal(request.ok, true, request.ok === false ? request.message : "");
  return { taskId, promptId };
}

/** 完整播种：workflow + A1/A2 完成 + A3 requested + card-prompt 任务/请求。 */
async function seedA3Card(root: string, workflowId: string, at: string): Promise<SeededPrompt> {
  await seedWorkflow(root, workflowId, FLOW, at);
  await seedStageCompleted(root, workflowId, FLOW, "A1", at);
  await seedStageCompleted(root, workflowId, FLOW, "A2", at);
  const seeded = await seedCardPrompt(root, workflowId, FLOW, at);
  await seedStageRequested(root, workflowId, FLOW, "A3", seeded.taskId, at);
  return seeded;
}

async function orphanRequest(root: string, promptId: string, reason: "restart" | "superseded", at: string): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("request.orphaned", { requestId: promptId, reason }, () => new Date(at)));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

function forceChiefBusy(h: Harness, root: string): void {
  const manager = internals(h.mgr);
  let entry = manager.sessions.get(manager.sessionKey(root, "chief", "demo"));
  if (entry === undefined) {
    // 会话未建：先建（同步入口需要 await，调用方保证已 open）。
    throw new Error("chief 会话必须先 open");
  }
  entry.busy = true;
  entry.origins.running = { settled: false, turnId: "turn-chief-busy" };
}

// —————————————— 账本读取助手 ——————————————

async function blockEvents(root: string): Promise<readonly BlockLedgerEvent[]> {
  return (await readBlockLedger(root)).events;
}
async function lifecycles(root: string): Promise<BlockLifecycle[]> {
  return [...replayBlockLifecycles((await blockEvents(root))).records.values()];
}
async function eventsOfBlock(root: string, blockId: string): Promise<BlockLedgerEvent[]> {
  return (await blockEvents(root)).filter((event) => event.blockId === blockId);
}
async function cardPromptTasks(root: string, workflowId: string): Promise<TaskRecord[]> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((record) =>
    record.created?.workflowId === workflowId && record.created.taskKind === "card-prompt");
}
function stageTasksOf(state: TaskReplay, workflowId: string, stage: WorkflowStage): TaskRecord[] {
  return [...state.records.values()].filter((record) =>
    record.created?.workflowId === workflowId && record.created.stage === stage);
}
async function requestRows(root: string, requestId: string): Promise<Array<Extract<TaskReplay["events"][number], { kind: "request.created" }>>> {
  const state = await readTaskState(root);
  return state.events.filter((event): event is Extract<TaskReplay["events"][number], { kind: "request.created" }> =>
    event.kind === "request.created" && event.requestId === requestId);
}
async function repairTasksOfBlock(root: string, blockId: string): Promise<TaskRecord[]> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((record) =>
    record.created?.taskKind === "repair" && record.created.blockId === blockId);
}

// —————————————— 0) A2 blocked 桌面观察路径（SMOKE-1 根因） ——————————————

test("SMOKE-1 A2 blocked 桌面观察路径：logObservation 消费 blockFact ⇒ blocks.jsonl raised→routed(engine-auto-fix)→resolved(fixed)；A2 attempt2 唯一/repair=0", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT });
  try {
    const stageDispatch = internals(h.mgr).fixedWorkflowStageDispatch;
    const selected = await stageDispatch.selectWorkflowAndDeliver({
      projectRoot: root, runtime: "demo", workflowPath: "A", flowId: FLOW, sourceTaskId: "turn-desktop-a2",
    });
    assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
    if (!selected.ok || selected.workflowId === undefined) return;
    const workflowId = selected.workflowId;
    // A2/product 并发 advance（桌面多入口同秒驱动）⇒ 账本仍只有 1 条 A2 任务（SMOKE-1 双建防线）。
    await Promise.all([
      stageDispatch.advance(root, workflowId, "demo"),
      stageDispatch.advance(root, workflowId, "demo"),
    ]);
    let state = await readTaskState(root);
    const a2 = stageTasksOf(state, workflowId, "A2");
    assert.equal(a2.length, 1, `并发 advance 后 A2 只允许 1 条任务（实际 ${a2.length}）`);
    const firstTaskId = a2[0]!.taskId;

    // 生产回交：报告 blocked；桌面 observeApplicationTaskReport → logObservation 消费 retrying 事实。
    const reported = await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: firstTaskId, from: "product", status: "blocked", summary: "意图输入缺失（SMOKE-1 A2）",
    }, () => new Date(h.clock.now)));
    assert.equal(reported.ok, true, reported.ok === false ? reported.message : "");
    await stageDispatch.observeApplicationTaskReport(root, firstTaskId);
    await waitFor(async () => {
      const lifecycle = (await lifecycles(root)).find((entry) =>
        entry.workflowId === workflowId && entry.code === "task-report-blocked");
      return lifecycle?.status === "resolved";
    }, "A2 blocked 块经桌面观察路径 resolved");

    const lifecycle = (await lifecycles(root)).find((entry) =>
      entry.workflowId === workflowId && entry.code === "task-report-blocked");
    assert.ok(lifecycle !== undefined, "桌面观察路径必须把 retrying 事实送入 blocks.jsonl");
    assert.equal(lifecycle!.routeKind, "engine-auto-fix");
    assert.equal(lifecycle!.resolution, "fixed");
    assert.equal(lifecycle!.detailCode, "reconcile", "raised 持久化 detailCode（恢复读回）");
    assert.equal(lifecycle!.engineCanRepair, true);
    assert.equal(lifecycle!.taskId, firstTaskId);
    assert.deepEqual(
      (await eventsOfBlock(root, lifecycle!.blockId)).map((event) => event.kind),
      ["block.raised", "block.routed", "block.resolved"],
      "SMOKE-1 A2：重试成功也必须 raised→routed(engine-auto-fix)→resolved(fixed)",
    );

    state = await readTaskState(root);
    const a2After = stageTasksOf(state, workflowId, "A2");
    assert.equal(a2After.length, 2, "A2 仅 attempt1+attempt2（同秒并发不双建）");
    const attempt2Key = stageExecutionIdempotencyKey(workflowId, "A2", "product", 2);
    assert.equal(a2After.filter((record) => record.created?.idempotencyKey === attempt2Key).length, 1, "attempt2 唯一");
    assert.equal([...state.records.values()].filter((record) => record.created?.taskKind === "repair").length, 0,
      "Q8 重试路径零属主修复任务");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 1) target-busy 有界重投 / 预算耗尽 ——————————————

test("A3 card-prompt 目标 busy：target-busy 有界重投（同 taskId）⇒ resolved(fixed)；预算耗尽 autoFixForbidden ⇒ owner-repair", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT });
  try {
    const workflowId = "wf-seam-busy";
    const { taskId, promptId } = await seedA3Card(root, workflowId, new Date(AT).toISOString());
    // chief 会话忙 ⇒ 重投只入队、不送达（持续 target-busy）。
    const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "open failed") : "");
    forceChiefBusy(h, root);

    const scan = () => internals(h.mgr).fixedWorkflowStageDispatch.scanAppCardPromptFacts(root, {
      stallMs: STALL_MS, maxAutoFixAttempts: MAX_AUTO_FIX,
    });

    // 未到 T_stall：不得提前报停摆事实（年龄边界）。
    const early = await scan();
    assert.equal(early.some((fact) => fact.code === "target-busy" && fact.taskId === taskId), false,
      "未超过 T_stall 不得报 target-busy");

    // 第 1 轮：超过 T_stall，tick 扫描经 block router 重投（同 taskId）⇒ fixed。
    h.clock.now = AT + STALL_MS + 1000;
    await internals(h.mgr).blockRouter.tick(root);
    let targetBusy = (await lifecycles(root)).filter((entry) => entry.code === "target-busy");
    assert.equal(targetBusy.length, 1, `第 1 轮 target-busy 入账一条（实际 ${targetBusy.length}）`);
    assert.equal(targetBusy[0]!.routeKind, "engine-auto-fix", "B5 有界自动修复（不建 repair）");
    assert.equal(targetBusy[0]!.resolution, "fixed");
    assert.equal(targetBusy[0]!.taskId, taskId, "事实锚点 = 同一 card-prompt taskId");
    assert.equal(targetBusy[0]!.requestId, promptId, "requestId 不变（同卡，不新开）");
    assert.deepEqual(
      (await eventsOfBlock(root, targetBusy[0]!.blockId)).map((event) => event.kind),
      ["block.raised", "block.routed", "block.resolved"],
      "blocks.jsonl 必现 raised→routed→resolved",
    );
    assert.equal((await cardPromptTasks(root, workflowId)).length, 1, "重投不得新开卡任务");
    assert.equal((await requestRows(root, promptId)).length, 1, "重投不得生成新 requestId/新 request.created");
    // 同 taskId 已入队（忙时不送达）：第二轮不得重复入队。
    const queuedAfterRound1 = [...internals(h.mgr).deliveryQueues.values()].flat()
      .filter((item) => item.taskId === taskId).length;
    assert.equal(queuedAfterRound1, 1, `第 1 轮重投应入队同 taskId（实际 ${queuedAfterRound1}）`);

    // 第 2 轮（预算内）：每 T_stall 最多一轮；同 taskId 已在队列 ⇒ 不重复入队。
    h.clock.now = AT + 2 * (STALL_MS + 1000);
    const round2 = (await scan()).find((fact) => fact.code === "target-busy" && fact.taskId === taskId);
    assert.ok(round2 !== undefined, "预算内必须继续给出下一轮事实");
    assert.notEqual(round2!.autoFixForbidden, true, "预算内不得提前升级");
    await internals(h.mgr).blockRouter.observeFact(root, round2!);
    assert.equal(
      [...internals(h.mgr).deliveryQueues.values()].flat().filter((item) => item.taskId === taskId).length,
      1,
      "同 taskId 已在队列/在途 ⇒ 不重复入队",
    );
    targetBusy = (await lifecycles(root)).filter((entry) => entry.code === "target-busy");
    assert.equal(targetBusy.length, 2, "第 2 轮 target-busy 入账并 fixed");
    assert.equal(targetBusy.every((entry) => entry.resolution === "fixed"), true);

    // 第 3 轮：达到 maxAutoFixAttempts ⇒ autoFixForbidden ⇒ owner-repair（不继续自动重投）。
    h.clock.now = AT + 3 * (STALL_MS + 1000);
    const exhausted = (await scan()).find((fact) => fact.code === "target-busy" && fact.taskId === taskId);
    assert.ok(exhausted !== undefined, "预算耗尽仍须有事实（升级属主）");
    assert.equal(exhausted!.autoFixForbidden, true, "超过引擎重投预算必须 autoFixForbidden");
    assert.equal(exhausted!.ownerRoleId, "chief", "属主 = card-prompt 目标角色");
    await internals(h.mgr).blockRouter.observeFact(root, exhausted!);
    const exhaustedLifecycle = (await lifecycles(root)).find((entry) =>
      entry.code === "target-busy" && entry.routeKind === "owner-repair" && entry.status !== "raised");
    assert.ok(exhaustedLifecycle !== undefined, "预算耗尽必须路由 owner-repair（不继续自动重投）");
    const repairs = await repairTasksOfBlock(root, exhaustedLifecycle!.blockId);
    assert.equal(repairs.length, 1, "owner-repair 创建且仅创建一条修复任务");
    assert.equal(repairs[0]!.taskId, exhaustedLifecycle!.routeTaskId, "routed 记录消费真实回执 taskId");
    assert.equal(repairs[0]!.created?.to, "chief");
    assert.equal(repairs[0]!.created?.idempotencyKey, `block-repair:${exhaustedLifecycle!.blockId}:1`);
    // 全链只一张卡任务、一个 requestId、一份 request.created。
    assert.equal((await cardPromptTasks(root, workflowId)).length, 1, "升级也不得新开卡任务");
    assert.equal((await requestRows(root, promptId)).length, 1, "升级也不得重呈现/新 requestId");
    const promptTitles = (await requestRows(root, promptId)).map((row) => row.title);
    assert.deepEqual(promptTitles, ["意图确认"], "卡只一张（同 requestId 原事实）");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 2) orphan(restart) 重呈现 / project_state 非粘性 ——————————————

test("request.orphaned(restart)：同 requestId 重呈现 + 同 taskId 重投 ⇒ block fixed；project_state 不显示旧 orphaned", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT + 2000 });
  try {
    const workflowId = "wf-seam-orphan";
    const { taskId, promptId } = await seedA3Card(root, workflowId, new Date(AT).toISOString());
    const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "open failed") : "");
    forceChiefBusy(h, root);
    await orphanRequest(root, promptId, "restart", new Date(AT + 1000).toISOString());
    const originalRows = await requestRows(root, promptId);
    assert.equal(originalRows.length, 1);

    // 扫描事实：card-prompt-orphaned（detailCode=reconcile ⇒ engine-auto-fix 重投/重呈现）。
    const facts = await internals(h.mgr).fixedWorkflowStageDispatch.scanAppCardPromptFacts(root, {
      stallMs: STALL_MS, maxAutoFixAttempts: MAX_AUTO_FIX,
    });
    const orphanFact = facts.find((fact) => fact.code === "card-prompt-orphaned");
    assert.ok(orphanFact !== undefined, "restart orphan 必须给出 card-prompt-orphaned 事实");
    assert.equal(orphanFact!.detailCode, "reconcile");
    assert.equal(orphanFact!.engineCanRepair, true);
    assert.equal(orphanFact!.taskId, taskId);
    assert.equal(orphanFact!.requestId, promptId);
    assert.equal(orphanFact!.protocol, WORKFLOW_PROTOCOL_APP_DISPATCH);

    // 经 router 处理：raised（持久化 detailCode/engineCanRepair）→ routed(engine-auto-fix) → resolved(fixed)。
    await internals(h.mgr).blockRouter.observeFact(root, orphanFact!);
    const orphanLifecycle = (await lifecycles(root)).find((entry) => entry.code === "card-prompt-orphaned");
    assert.ok(orphanLifecycle !== undefined, "orphan 必须入 blocks.jsonl");
    assert.equal(orphanLifecycle!.status, "resolved");
    assert.equal(orphanLifecycle!.resolution, "fixed");
    assert.equal(orphanLifecycle!.routeKind, "engine-auto-fix", "同 requestId 重呈现走引擎重投（不建 repair）");
    assert.equal(orphanLifecycle!.taskId, taskId);
    assert.equal(orphanLifecycle!.detailCode, "reconcile", "raised 持久化 detailCode（恢复不回落 model-anomaly）");
    assert.equal(orphanLifecycle!.engineCanRepair, true);
    const raised = (await eventsOfBlock(root, orphanLifecycle!.blockId))
      .find((event): event is Extract<BlockLedgerEvent, { kind: "block.raised" }> => event.kind === "block.raised");
    assert.ok(raised !== undefined);
    assert.equal(raised!.detailCode, "reconcile");
    assert.equal(raised!.engineCanRepair, true);
    assert.deepEqual(
      (await eventsOfBlock(root, orphanLifecycle!.blockId)).map((event) => event.kind),
      ["block.raised", "block.routed", "block.resolved"],
    );

    // 同 requestId 追加第 2 条 request.created（逐项复制原应用事实）；不新开卡任务、不生成新 requestId。
    const rows = await requestRows(root, promptId);
    assert.equal(rows.length, 2, `同 requestId 重呈现应追加第 2 条 request.created（实际 ${rows.length}）`);
    const [before, after] = rows;
    assert.equal(after!.at >= new Date(AT + 1000).toISOString(), true, "重呈现必须在 orphaned 之后（最后一条为准）");
    assert.equal(after!.requestId, before!.requestId);
    assert.equal(after!.promptId, before!.promptId);
    assert.equal(after!.cardKind, before!.cardKind);
    assert.equal(after!.workflowId, before!.workflowId);
    assert.equal(after!.stage, before!.stage);
    assert.deepEqual(after!.options, before!.options, "重呈现选项逐项一致");
    assert.deepEqual(after!.recommended, before!.recommended);
    assert.equal((await cardPromptTasks(root, workflowId)).length, 1, "orphan 重呈现不得新开卡任务");
    assert.equal((await cardPromptTasks(root, workflowId))[0]!.taskId, taskId);
    // 同 taskId 重投（目标忙 ⇒ 入队），不生成第二个任务/第二个 clientMessageId。
    const orphanQueued = [...internals(h.mgr).deliveryQueues.values()].flat()
      .filter((item) => item.taskId === taskId);
    assert.equal(orphanQueued.length, 1, `orphan 重呈现后必须同 taskId 重投（实际入队 ${orphanQueued.length}）`);
    assert.equal(orphanQueued[0]!.targetRoleId, "chief");
    const promptRecord = (await readTaskState(root)).records.get(taskId)!;
    assert.equal(promptRecord.closed, undefined, "重呈现后 prompt 任务保持 open 等待裁决");
    assert.equal(promptRecord.reports.length, 0);
    // 无 repair 任务（引擎重投路径）。
    const state = await readTaskState(root);
    assert.equal([...state.records.values()].filter((record) => record.created?.taskKind === "repair").length, 0);

    // project_state：orphaned 非粘性——同 requestId 新 created 清除旧 orphaned，request-pending 可见。
    const view = await buildProjectStateView(root, { full: true, now: new Date(h.clock.now) });
    assert.equal(
      view.blockers.some((blocker) => blocker.id === `request-pending:${promptId}`),
      true,
      "重呈现后请求重新进入 request-pending 投影（客户可见等待；旧 orphaned 不再粘性）",
    );
    assert.equal(view.counts.pendingRequests, 1, "重呈现后 project_state 计一个待决请求（不显示旧 orphaned）");
    // 同 requestId 只一张卡（requestId 幂等）。
    const requestIds = new Set(rows.map((row) => row.requestId));
    assert.deepEqual([...requestIds], [promptId]);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 3) orphan(superseded) / 阶段迁移 ——————————————

test("request.orphaned(superseded) ⇒ prompt 任务按实际语义 rejected（不重投/不重弹/不造块）", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT + 2000 });
  try {
    const workflowId = "wf-seam-superseded";
    const { taskId, promptId } = await seedA3Card(root, workflowId, new Date(AT).toISOString());
    await orphanRequest(root, promptId, "superseded", new Date(AT + 1000).toISOString());
    const facts = await internals(h.mgr).fixedWorkflowStageDispatch.scanAppCardPromptFacts(root, {
      stallMs: STALL_MS, maxAutoFixAttempts: MAX_AUTO_FIX,
    });
    assert.equal(facts.some((fact) => fact.requestId === promptId), false, "superseded 不得误判为重投事实");
    assert.equal((await blockEvents(root)).length, 0, "superseded 不造块");
    const record = (await readTaskState(root)).records.get(taskId);
    assert.ok(record?.closed !== undefined, "superseded prompt 任务按实际语义收口");
    assert.equal(record!.closed!.outcome, "rejected");
    assert.match(record!.closed!.note ?? "", /superseded/);
    assert.equal((await requestRows(root, promptId)).length, 1, "不重呈现（不追加 request.created）");
    assert.equal([...internals(h.mgr).deliveryQueues.values()].flat().some((item) => item.taskId === taskId), false,
      "不误重投");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("orphan(restart) 但阶段已迁移 ⇒ 按实际语义 rejected 收口（不重呈现、不重投、不造块）", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT + 2000 });
  try {
    const workflowId = "wf-seam-moved";
    const at = new Date(AT).toISOString();
    await seedWorkflow(root, workflowId, FLOW, at);
    for (const stage of ["A1", "A2", "A3"] as const) {
      await seedStageCompleted(root, workflowId, FLOW, stage, at);
    }
    // 阶段已迁移到 A4；A3 的 prompt 请求随后被重启标 orphan。
    const promptId = appDispatchPromptId(workflowId, "A3", 1);
    const taskId = appDispatchTaskId(cardPromptIdempotencyKey(workflowId, "A3", promptId));
    assert.equal((await appendTaskEvent(root, taskEvent("task.created", {
      taskId,
      from: "application",
      to: "chief",
      text: "意图确认（A3）｜阶段迁移测试",
      sideEffect: "read-only",
      idempotencyKey: cardPromptIdempotencyKey(workflowId, "A3", promptId),
      flowId: FLOW,
      workflowId,
      stage: "A3",
      taskKind: "card-prompt",
      promptId,
      cardKind: "intent-confirm",
    }, () => new Date(at)))).ok, true);
    assert.equal((await appendTaskEvent(root, taskEvent("request.created", {
      requestId: promptId,
      flowId: FLOW,
      cardKind: "intent-confirm",
      workflowId,
      stage: "A3",
      promptId,
      sourceRoleId: "application",
      title: "意图确认",
      options: [{ id: "confirm", label: "确认意图", recommended: true }, { id: "revise", label: "返工" }],
    }, () => new Date(at)))).ok, true);
    await seedStageRequested(root, workflowId, FLOW, "A4", "seed-task:A4", at);
    await orphanRequest(root, promptId, "restart", new Date(AT + 1000).toISOString());

    const facts = await internals(h.mgr).fixedWorkflowStageDispatch.scanAppCardPromptFacts(root, {
      stallMs: STALL_MS, maxAutoFixAttempts: MAX_AUTO_FIX,
    });
    assert.equal(facts.some((fact) => fact.requestId === promptId), false, "阶段迁移后 orphan 不得重呈现");
    assert.equal((await blockEvents(root)).length, 0, "阶段迁移的 orphan 不造块");
    const record = (await readTaskState(root)).records.get(taskId);
    assert.equal(record?.closed?.outcome, "rejected");
    assert.match(record?.closed?.note ?? "", /stage-moved|按实际语义收口/);
    assert.equal((await requestRows(root, promptId)).length, 1);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

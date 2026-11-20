// test/桌面应用/block-reentry.test.ts
// 2026-11-20（SMOKE-2 S1/S2 桌面批测试，测试角色）：**block resolved 后阶段重入场（桌面等价）**。
//
// 依据（权威）：
//   1. `角色卡/桌面窗口/docs/change/2026-11-20_change_block-reentry-task-texts-desktop.md` §二（接线）、
//      §四（待测试批断言点）；
//   2. `角色卡/编排/docs/change/2026-11-20_change_block-reentry-task-texts-foundation.md` §一/§六。
// 背景：SMOKE-2 B8 owner-repair `resolved(fixed)` 后应用反复 `drive.failed`（17 次）；桌面 `reEnterAfterFixed`
// 必须先走服务重入场（`stage.reworked` 带 blockId + 新 attempt），再 advance，而不是重驱 blocked 阶段。
//
// 覆盖：
//   1. B8 owner-repair fixed ⇒ 唯一 attempt3 + 一条 block rework（带 blockId、stage===reworkOf）→
//      attempt3 done 收口 A2 → 推进 A3 card-prompt；**重入后零新增 `app-dispatch.drive.failed`**（17 连败回归）；
//   2. engine-auto-fix：alreadyCompleted ⇒ advance 下一阶段（不写第二条 rework）；阶段在飞 ⇒ 不重复 driving；
//   3. B9 decided：revise-scope ⇒ 调重入端口（resolution decided）+ advance，不建属主修复任务；
//      terminate ⇒ 不调重入端口（既有终止语义）；
//   4. 恢复崩溃窗口：resolved(fixed)+blocked+无 rework ⇒ recover 恰补一条 rework+新 attempt；
//      已有 reentry 事件的旧 block 跳过（不重复 re-drive）；
//   5. fixed-v2.1 零迁移：不调重入端口、无 rework；修复完成简报逐字保留；
//   6. 重复/并发恢复 ⇒ 仅一条 rework/任务（replay），任务 id 确定性。
//
// 夹具：真实 SessionManager + 假会话/假时钟 + 真实工作流/任务/block 账本（沿用
// `app-dispatch-block-seams.test.ts`）；假宿主 + 真实重入场端口（沿用 `block-router.test.ts`）。
// 不启动 Electron/真实模型；不占端口、不读 `.env`。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  createDesktopBlockRouter,
  type DesktopBlockRouterHost,
} from "../../app/desktop/block-router.ts";
import {
  appendTaskEvent,
  readTaskState,
  taskEvent,
  type TaskRecord,
} from "../../src/common/编排/task-state.ts";
import {
  appDispatchTaskId,
  appendWorkflowEvent,
  readWorkflowLedger,
  reenterBlockedStageAfterResolution,
  stageExecutionIdempotencyKey,
  type ReenterBlockedStageAfterResolutionResult,
} from "../../src/common/编排/workflow-service.ts";
import {
  WORKFLOW_DEFINITION_HASHES,
} from "../../src/common/编排/workflow-definitions.ts";
import {
  blockCardRequestId,
  blockFactFromStageBlocked,
  computeBlockId,
  type BlockFact,
} from "../../src/common/编排/block-resolution.ts";
import {
  raiseBlock,
  readBlockLedger,
  replayBlockLifecycles,
  resolveBlock,
  routeBlock,
  type BlockLifecycle,
} from "../../src/common/编排/block-ledger.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  WORKFLOW_PROTOCOL_FIXED_V2_1,
  type CustomerInputOutcome,
  type CustomerInputRequest,
  type WorkflowEvent,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import {
  configureDiagnostics,
  disposeDiagnostics,
  flushDiagnostics,
} from "../../src/common/shared/diagnostics.ts";

const FLOW = "reentrydesk";
const T0 = Date.parse("2026-11-20T00:00:00.000Z");
const NOW = () => new Date(T0);

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
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-block-reentry-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeProjectFile(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
}
async function writeIntent(root: string): Promise<void> {
  await writeProjectFile(root, "docs/product/reentrydesk-intent-v1.md",
    "---\nschema: project-intent/v1\nflowId: reentrydesk\nversion: 1\nintentId: reentrydesk-intent\ngoal: 重入场回归\n---\n# 意图\n");
  await writeProjectFile(root, "docs/intents/reentrydesk-intent.md",
    "---\nintentId: reentrydesk-intent\nflowId: reentrydesk\ngoal: 重入场回归\n---\n# 意图入口\n");
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

// —————————————— 真实 SessionManager 夹具（seams 模式） ——————————————

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
      ({ outcome: "declined", reason: "block-reentry-test: cards not answered" }),
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
  };
  blockRouter: {
    observeFact(projectRoot: string, fact: BlockFact): Promise<void>;
    tick(projectRoot: string): Promise<void>;
    recover(projectRoot: string): Promise<void>;
  };
}
function internals(mgr: SessionManager): MgrInternals {
  return mgr as unknown as MgrInternals;
}

// —————————————— 假宿主夹具（block-router.test 模式；重入场端口 = 真实服务） ——————————————

interface RouterHarness {
  router: ReturnType<typeof createDesktopBlockRouter>;
  advances: string[];
  delivered: Array<{ targetRoleId: string; kind?: string; text?: string; taskId?: string }>;
  systemRows: Array<{ roleId: string | null; summary: string }>;
  reenterCalls: Array<{ workflowId: string; stage: WorkflowStage; blockId: string; resolution: "fixed" | "decided"; reason?: string }>;
}

function makeRouterHarness(root: string, clock: { now: number }): RouterHarness {
  const advances: string[] = [];
  const delivered: RouterHarness["delivered"] = [];
  const systemRows: RouterHarness["systemRows"] = [];
  const reenterCalls: RouterHarness["reenterCalls"] = [];
  const host: DesktopBlockRouterHost = {
    now: () => clock.now,
    getListing: (projectRoot) => (projectRoot === root ? listing(root) : undefined),
    findLiveRuntime: () => "demo",
    activeRuntimeFor: () => "demo",
    lastGovernanceRuntime: new Map(),
    governanceOwner: () => "convener",
    decisionDelegationEnabled: () => false,
    withRequestLifecycle: async () => undefined,
    enqueueDelivery: (_projectRoot, targetRoleId, item) => {
      delivered.push({
        targetRoleId,
        ...(typeof item.kind === "string" ? { kind: item.kind } : {}),
        ...(typeof item.text === "string" ? { text: item.text } : {}),
        ...(typeof item.taskId === "string" ? { taskId: item.taskId } : {}),
      });
    },
    drainQueue: async () => {},
    emitSystemRow: (_projectRoot, roleId, summary) => { systemRows.push({ roleId, summary }); },
    appendRoleActivity: async () => {},
    isBusy: () => false,
    advanceAppDispatch: async (_projectRoot, workflowId) => {
      advances.push(workflowId);
      return true;
    },
    reenterBlockedStage: async (projectRoot, input): Promise<ReenterBlockedStageAfterResolutionResult> => {
      reenterCalls.push(input);
      return reenterBlockedStageAfterResolution({ projectRoot, ...input });
    },
  };
  return { router: createDesktopBlockRouter(host), advances, delivered, systemRows, reenterCalls };
}

// —————————————— 账本/事件种子 ——————————————

function startedEvent(input: {
  workflowId: string;
  protocol?: "fixed-v2.1" | "app-dispatch/v1";
  path?: "A" | "B";
  at?: string;
}): WorkflowEvent {
  const path = input.path ?? "A";
  const id = path === "B" ? "modify" : "add";
  return {
    v: 1,
    at: input.at ?? new Date(T0).toISOString(),
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "workflow.started",
    workflowId: input.workflowId,
    flowId: FLOW,
    path,
    idempotencyKey: `workflow-start:${FLOW}:${path}:seed-${input.workflowId}`,
    trigger: { by: "chief", reason: "test" },
    sourceTaskId: `turn-${input.workflowId}`,
    ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
    ...(input.protocol === WORKFLOW_PROTOCOL_APP_DISPATCH
      ? { definition: { id, version: 3 as const, sha256: WORKFLOW_DEFINITION_HASHES[id] } }
      : {}),
  };
}
function requestedEvent(input: { workflowId: string; stage: WorkflowStage; attempt?: number }): WorkflowEvent {
  const attempt = input.attempt ?? 1;
  return {
    v: 1, at: new Date(T0).toISOString(), schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
    workflowId: input.workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `stage-request:${input.workflowId}:${input.stage}:${attempt}`,
    stage: input.stage, requestTaskId: `seed-task:${input.stage}:${attempt}`,
    requestDigest: sha(`seed-${input.stage}-${attempt}`), attempt, issuedBy: "application",
  };
}
function completedEvent(input: { workflowId: string; stage: WorkflowStage }): WorkflowEvent {
  return {
    v: 1, at: new Date(T0).toISOString(), schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
    workflowId: input.workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `seed-complete:${input.workflowId}:${input.stage}`,
    stage: input.stage, cause: { kind: "task-closed", ref: `seed-task:${input.stage}:1` }, artifacts: [],
  };
}
function blockedEvent(input: { workflowId: string; stage: WorkflowStage; attempt?: number; taskId?: string }): WorkflowEvent {
  const attempt = input.attempt ?? 1;
  return {
    v: 1, at: new Date(T0).toISOString(), schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.blocked",
    workflowId: input.workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `stage-block:${input.workflowId}:${input.stage}:${attempt}:task-closed-rejected`,
    stage: input.stage, code: "task-closed-rejected", summary: "阶段任务被拒", attempt,
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
  };
}
async function appendWf(root: string, event: WorkflowEvent): Promise<void> {
  const appended = await appendWorkflowEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}
async function appendCompletedStage(root: string, workflowId: string, stage: WorkflowStage): Promise<void> {
  await appendWf(root, requestedEvent({ workflowId, stage, attempt: 1 }));
  await appendWf(root, completedEvent({ workflowId, stage }));
}

async function blockEvents(root: string) {
  return (await readBlockLedger(root)).events;
}
async function lifecycles(root: string): Promise<BlockLifecycle[]> {
  return [...replayBlockLifecycles(await blockEvents(root)).records.values()];
}
async function wfEventsOf(root: string, workflowId: string): Promise<WorkflowEvent[]> {
  return (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === workflowId);
}
async function viewOf(root: string, workflowId: string) {
  const state = await readTaskState(root);
  return deriveWorkflowView(await wfEventsOf(root, workflowId), state.events);
}
function stageTasksOf(state: Awaited<ReturnType<typeof readTaskState>>, workflowId: string, stage: WorkflowStage): TaskRecord[] {
  return [...state.records.values()].filter((record) =>
    record.created?.workflowId === workflowId && record.created.stage === stage);
}
function reworkEventsOf(events: readonly WorkflowEvent[], stage: WorkflowStage) {
  return events.filter((event): event is Extract<WorkflowEvent, { kind: "stage.reworked" }> =>
    event.kind === "stage.reworked" && event.stage === stage);
}

/** 修复任务报告（repair 任务由 block router 创建，属主 convener）。 */
async function reportRepairDone(root: string, taskId: string, to = "convener"): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.reported", {
    taskId, from: to, status: "done", summary: "已按 block 修复要求处理",
  }, NOW));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

/** raise → route → resolve（真实 block 账本）。 */
async function seedResolvedBlock(input: {
  root: string;
  fact: BlockFact;
  route?: "owner-repair" | "customer-decision" | "engine-auto-fix";
  resolution?: "fixed" | "decided";
  reEntry?: string;
  by?: string;
  decisionId?: string;
  routeTaskId?: string;
}): Promise<{ blockId: string }> {
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
    ...(input.routeTaskId !== undefined ? { taskId: input.routeTaskId } : {}),
    now: NOW,
  });
  assert.equal(routed.ok, true, routed.ok === false ? `${routed.code}: ${routed.message}` : "");
  const resolved = await resolveBlock({
    projectRoot: input.root,
    blockId: raised.blockId,
    resolution,
    by: input.by ?? (resolution === "fixed" ? "convener" : "customer"),
    ...(input.reEntry !== undefined ? { reEntry: input.reEntry } : {}),
    ...(resolution === "decided" ? { decisionId: input.decisionId ?? "decision-reentry-1" } : {}),
    note: "test resolved",
    now: NOW,
  });
  assert.equal(resolved.ok, true, resolved.ok === false ? `${resolved.code}: ${resolved.message}` : "");
  return { blockId: raised.blockId };
}

/** 诊断行读取（app-dispatch.drive.failed 计数；S1 17 连败回归断言）。 */
async function diagnosticRows(dir: string): Promise<Array<{ event?: string; [key: string]: unknown }>> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const rows: Array<{ event?: string; [key: string]: unknown }> = [];
  for (const name of names) {
    if (!name.startsWith("ans-diagnostics-") || !name.endsWith(".jsonl")) continue;
    const text = await fs.readFile(path.join(dir, name), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      try { rows.push(JSON.parse(line) as { event?: string }); } catch { /* 坏行忽略 */ }
    }
  }
  return rows;
}
async function driveFailedCount(dir: string): Promise<number> {
  return (await diagnosticRows(dir)).filter((row) => row.event === "app-dispatch.drive.failed").length;
}

// —————————————— 1) B8 owner-repair 全链（真实 SessionManager） ——————————————

test("B8 owner-repair 真机等价全链：A2 attempt1/2 blocked → 属主修复 done → fixed ⇒ attempt3 唯一/rework 一条 → A2 completed → A3 card-prompt；重入后零新增 drive.failed", async () => {
  const root = await makeRoot();
  const clock = { now: T0 };
  const diagDir = path.join(root, ".ans", "diagnostics");
  configureDiagnostics({ directory: diagDir, clock: () => clock.now });
  const h = harness(root, clock);
  try {
    const sd = internals(h.mgr).fixedWorkflowStageDispatch;
    const selected = await sd.selectWorkflowAndDeliver({
      projectRoot: root, runtime: "demo", workflowPath: "A", flowId: FLOW, sourceTaskId: "turn-b8-reentry",
    });
    assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
    if (!selected.ok || selected.workflowId === undefined) return;
    const workflowId = selected.workflowId;
    let state = await readTaskState(root);
    const a2Initial = stageTasksOf(state, workflowId, "A2");
    assert.equal(a2Initial.length, 1, "select/advance 已驱动 A2 attempt1");
    const t1 = a2Initial[0]!.taskId;

    // attempt1 blocked ⇒ Q8 重试 attempt2；block 事实（retrying）经桌面观察路径 engine-auto-fix ⇒ fixed。
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: t1, from: "product", status: "blocked", summary: "意图输入缺失（attempt1）",
    }, () => new Date(clock.now)))).ok, true);
    await sd.observeApplicationTaskReport(root, t1);
    await waitFor(async () => (await lifecycles(root)).some((entry) =>
      entry.workflowId === workflowId && entry.code === "task-report-blocked"
      && entry.status === "resolved" && entry.resolution === "fixed"), "attempt1 block engine-auto-fix fixed");

    state = await readTaskState(root);
    const a2AfterRetry = stageTasksOf(state, workflowId, "A2");
    assert.equal(a2AfterRetry.length, 2, "Q8 重试只建 attempt2");
    const t2 = a2AfterRetry.find((record) => record.created?.idempotencyKey === stageExecutionIdempotencyKey(workflowId, "A2", "product", 2))!.taskId;

    // attempt2 blocked ⇒ 预算耗尽（stage.blocked A2）；B9 事实（retry-budget-exhausted）路由客户（未答）。
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: t2, from: "product", status: "blocked", summary: "意图输入仍缺失（attempt2）",
    }, () => new Date(clock.now)))).ok, true);
    await sd.observeApplicationTaskReport(root, t2);
    await waitFor(async () => (await lifecycles(root)).some((entry) =>
      entry.workflowId === workflowId && entry.code === "retry-budget-exhausted"), "attempt2 预算耗尽事实入 blocks");

    // 桌面 tick 从 stage.blocked 扫描出 B8 块（model-anomaly ⇒ owner-repair），创建属主修复任务。
    await internals(h.mgr).blockRouter.tick(root);
    await waitFor(async () => (await lifecycles(root)).some((entry) =>
      entry.workflowId === workflowId && entry.code === "task-closed-rejected"
      && entry.routeKind === "owner-repair" && entry.routeTaskId !== undefined), "B8 owner-repair 修复任务创建");
    const b8 = (await lifecycles(root)).find((entry) =>
      entry.workflowId === workflowId && entry.code === "task-closed-rejected" && entry.routeKind === "owner-repair");
    assert.ok(b8 !== undefined);
    assert.equal(b8!.status, "routed");
    assert.equal(b8!.stage, "A2");
    const repairTaskId = b8!.routeTaskId!;
    const repair = (await readTaskState(root)).records.get(repairTaskId);
    assert.equal(repair?.created?.taskKind, "repair");
    assert.equal(repair?.created?.to, "convener");
    assert.equal(repair?.created?.blockId, b8!.blockId);

    // 属主修复报告 done（应用核验证据为空也可：model-anomaly）⇒ fixed ⇒ reEnterAfterFixed 重入场。
    await reportRepairDone(root, repairTaskId);
    await flushDiagnostics();
    const driveFailedBefore = await driveFailedCount(diagDir);

    await internals(h.mgr).blockRouter.recover(root);

    // 重入事实：一条 rework（blockId、stage===reworkOf=A2、attempt3）+ 唯一 attempt3 任务。
    const wfEvents = await wfEventsOf(root, workflowId);
    const reworks = reworkEventsOf(wfEvents, "A2");
    assert.equal(reworks.length, 1, `恰一条 stage.reworked（实际 ${reworks.length}）`);
    assert.equal(reworks[0]!.blockId, b8!.blockId, "rework 携带 B8 blockId");
    assert.equal(reworks[0]!.reworkOf, "A2");
    assert.equal(reworks[0]!.attempt, 3);
    const t3 = appDispatchTaskId(stageExecutionIdempotencyKey(workflowId, "A2", "product", 3));
    const afterRecover = await readTaskState(root);
    const a2StageExec = stageTasksOf(afterRecover, workflowId, "A2")
      .filter((record) => record.created?.taskKind !== "repair");
    assert.equal(a2StageExec.length, 3, "A2 stage-execution 任务 = attempt1/2/3（唯一 attempt3）");
    assert.equal(a2StageExec.filter((record) => record.taskId === t3).length, 1);
    const viewAfterRecover = await viewOf(root, workflowId);
    assert.equal(viewAfterRecover.stages.A2.status, "dispatched", "A2 以 attempt3 在飞（不再 blocked）");
    assert.equal(viewAfterRecover.stages.A2.attempt, 3);
    assert.equal(viewAfterRecover.blocked, undefined);
    // B8 block 已 resolved(fixed)，无重复 raised。
    const b8Raises = (await blockEvents(root)).filter((event) =>
      event.kind === "block.raised" && event.blockId === b8!.blockId);
    assert.equal(b8Raises.length, 1, "同 block 只有一条 raised");

    // 17 连败回归：重入路径零新增 drive.failed；且不存在修复后对 blocked 阶段的反复驱动。
    await flushDiagnostics();
    const driveFailedAfter = await driveFailedCount(diagDir);
    assert.equal(driveFailedAfter, driveFailedBefore, "重入后不得新增 app-dispatch.drive.failed（SMOKE-2 S1）");
    assert.equal(driveFailedAfter <= 1, true, `至多一次修复前 blocked 观察的既有 advance 失败（实际 ${driveFailedAfter}）`);
    const reentryRows = (await diagnosticRows(diagDir)).filter((row) => row.event === "block.reentry.fixed");
    assert.equal(reentryRows.length, 1, "重入场诊断恰一条");
    assert.equal(Number(reentryRows[0]!["attempt"]), 3, "重入场诊断记录 attempt3");

    // attempt3 done ⇒ A2 completed ⇒ advance 推进 A3 card-prompt（卡需意图入口；B24）。
    await writeIntent(root);
    assert.equal((await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: t3, from: "product", status: "done", summary: "意图完成",
      evidence: ["docs/product/reentrydesk-intent-v1.md"],
    }, () => new Date(clock.now)))).ok, true);
    await sd.observeApplicationTaskReport(root, t3);
    await waitFor(async () => stageTasksOf(await readTaskState(root), workflowId, "A3")
      .some((record) => record.created?.taskKind === "card-prompt"), "A3 card-prompt 任务推进");
    const viewFinal = await viewOf(root, workflowId);
    assert.equal(viewFinal.stages.A2.status, "completed", "attempt3 accepted ⇒ A2 completed（block fixed→阶段完成）");
    assert.equal(viewFinal.stage, "A3", "推进 A3");
    assert.equal(viewFinal.stages.A3.status, "dispatched");
    const a3Tasks = stageTasksOf(await readTaskState(root), workflowId, "A3");
    assert.equal(a3Tasks.length, 1);
    assert.equal(a3Tasks[0]!.created?.taskKind, "card-prompt");
    assert.equal(a3Tasks[0]!.created?.to, "chief");
    // 再确认最终无新增失败（A3 驱动成功，意图/入口齐备）。
    await flushDiagnostics();
    assert.equal(await driveFailedCount(diagDir), driveFailedAfter, "A2 收口/A3 推进无 drive.failed");
    // 反复恢复（SMOKE-2 的 17 连败场景）：阶段在飞/下一阶段在办，不得再产生 drive.failed。
    for (let round = 0; round < 3; round += 1) await internals(h.mgr).blockRouter.recover(root);
    await flushDiagnostics();
    assert.equal(await driveFailedCount(diagDir), driveFailedAfter, "重复恢复不再产生 drive.failed（17 连败回归）");
    // 只一条 rework（attempt3 成功后不得再写）。
    assert.equal(reworkEventsOf(await wfEventsOf(root, workflowId), "A2").length, 1);
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await cleanup(root);
  }
});

// —————————————— 2) engine-auto-fix 来源（假宿主 + 真实重入场端口） ——————————————

test("engine-auto-fix fixed：alreadyCompleted ⇒ advance 下一阶段且不写 rework；阶段在飞 ⇒ 不重复 driving", async () => {
  // 2a) 引擎重试已成功完成阶段 ⇒ reEnterAfterFixed 走 alreadyCompleted：advance（下一阶段），零 rework。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const h = makeRouterHarness(root, clock);
      const workflowId = "wf-reentry-engine-completed";
      await appendWf(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }));
      await appendCompletedStage(root, workflowId, "A1");
      await appendWf(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
      await appendWf(root, completedEvent({ workflowId, stage: "A2" }));
      const fact: BlockFact = {
        protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, kind: "reconcile", code: "reconcile-corrupt",
        detailCode: "reconcile", workflowId, flowId: FLOW, stage: "A2",
        summary: "引擎重试已收口", engineCanRepair: true, fingerprintMaterial: ["engine-completed"],
      };
      const raised = await raiseBlock({ projectRoot: root, fact, now: NOW });
      assert.equal(raised.ok, true);
      if (!raised.ok) return;
      assert.equal((await routeBlock({
        projectRoot: root, blockId: raised.blockId, route: "engine-auto-fix", reason: "test:engine", now: NOW,
      })).ok, true);

      await h.router.recover(root);
      const events = await wfEventsOf(root, workflowId);
      assert.equal(reworkEventsOf(events, "A2").length, 0, "alreadyCompleted 不写第二条 rework");
      assert.equal((await readTaskState(root)).records.size, 0, "alreadyCompleted 不建任务");
      assert.deepEqual(h.advances, [workflowId, workflowId], "引擎动作 advance + alreadyCompleted 续推 advance");
      assert.equal(h.systemRows.some((row) => String(row.summary).includes("已由引擎重试完成")), true);
      const lifecycle = (await lifecycles(root)).find((entry) => entry.blockId === raised.blockId);
      assert.equal(lifecycle?.resolution, "fixed");
    } finally {
      await cleanup(root);
    }
  }
  // 2b) 阶段已有在飞尝试 ⇒ alreadyInFlight：不重复 driving（只引擎动作一次 advance）。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const h = makeRouterHarness(root, clock);
      const workflowId = "wf-reentry-engine-inflight";
      await appendWf(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }));
      await appendCompletedStage(root, workflowId, "A1");
      await appendWf(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
      const fact: BlockFact = {
        protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, kind: "reconcile", code: "reconcile-corrupt",
        detailCode: "reconcile", workflowId, flowId: FLOW, stage: "A2",
        summary: "阶段在飞", engineCanRepair: true, fingerprintMaterial: ["engine-inflight"],
      };
      const raised = await raiseBlock({ projectRoot: root, fact, now: NOW });
      assert.equal(raised.ok, true);
      if (!raised.ok) return;
      assert.equal((await routeBlock({
        projectRoot: root, blockId: raised.blockId, route: "engine-auto-fix", reason: "test:engine", now: NOW,
      })).ok, true);

      await h.router.recover(root);
      assert.equal(reworkEventsOf(await wfEventsOf(root, workflowId), "A2").length, 0, "alreadyInFlight 零 rework");
      assert.equal((await readTaskState(root)).records.size, 0, "alreadyInFlight 零任务");
      assert.deepEqual(h.advances, [workflowId], "仅引擎动作一次 advance（不重复 driving）");
      assert.equal(h.systemRows.some((row) => String(row.summary).includes("已有在飞尝试")), true);
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 3) B9 decided（假宿主 + 真实重入场端口） ——————————————

async function seedDecidedCard(root: string, input: {
  workflowId: string;
  stage: WorkflowStage;
  choice: string;
  fingerprint: string;
}): Promise<{ blockId: string }> {
  const fact: BlockFact = {
    protocol: WORKFLOW_PROTOCOL_APP_DISPATCH, kind: "service-rejection", code: "retry-budget-exhausted",
    workflowId: input.workflowId, flowId: FLOW, stage: input.stage,
    summary: "预算耗尽（决策卡）", fingerprintMaterial: [input.fingerprint],
  };
  const raised = await raiseBlock({ projectRoot: root, fact, now: NOW });
  assert.equal(raised.ok, true);
  if (!raised.ok) throw new Error("unreachable");
  const requestId = blockCardRequestId(raised.blockId);
  assert.equal((await routeBlock({
    projectRoot: root, blockId: raised.blockId, route: "customer-decision", reason: "test:customer",
    cardRequestId: requestId, now: NOW,
  })).ok, true);
  assert.equal((await appendTaskEvent(root, taskEvent("request.created", {
    requestId, cardKind: "decision", flowId: FLOW, workflowId: input.workflowId, stage: input.stage,
    sourceRoleId: "application", title: "预算耗尽",
    options: [
      { id: "block-revise-scope", label: "修订范围后继续", recommended: true },
      { id: "block-terminate-flow", label: "终止本次流程" },
    ],
  }, NOW))).ok, true);
  assert.equal((await appendTaskEvent(root, taskEvent("request.resolved", {
    requestId, cardKind: "decision", by: "customer", decisionId: "decision-reentry",
    operatorId: "customer", choice: input.choice, selectedOptionIds: [input.choice],
  }, NOW))).ok, true);
  return { blockId: raised.blockId };
}

test("B9 decided：revise-scope ⇒ 调重入端口（resolution decided）+ advance、不建属主修复任务；terminate ⇒ 不调重入端口", async () => {
  // 3a) block-revise-scope：重入场成功（attempt2 任务），无 repair 任务。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const h = makeRouterHarness(root, clock);
      const workflowId = "wf-reentry-decided-revise";
      await appendWf(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }));
      await appendCompletedStage(root, workflowId, "A1");
      await appendWf(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
      await appendWf(root, blockedEvent({ workflowId, stage: "A2", attempt: 1 }));
      const { blockId } = await seedDecidedCard(root, { workflowId, stage: "A2", choice: "block-revise-scope", fingerprint: "decided-revise" });

      await h.router.recover(root);
      assert.equal(h.reenterCalls.length, 1, "decided 重入场端口恰调用一次");
      assert.equal(h.reenterCalls[0]!.resolution, "decided");
      assert.equal(h.reenterCalls[0]!.workflowId, workflowId);
      assert.equal(h.reenterCalls[0]!.stage, "A2");
      assert.equal(h.reenterCalls[0]!.blockId, blockId);
      const events = await wfEventsOf(root, workflowId);
      const reworks = reworkEventsOf(events, "A2");
      assert.equal(reworks.length, 1);
      assert.equal(reworks[0]!.blockId, blockId);
      assert.equal(reworks[0]!.attempt, 2);
      const tasks = [...(await readTaskState(root)).records.values()];
      assert.equal(tasks.filter((record) => record.created?.taskKind === "repair"
        && record.created.blockId === blockId).length, 0, "decided 重入场不建该 block 的属主修复任务（不双动作）");
      assert.equal(tasks.filter((record) => record.created?.workflowId === workflowId
        && record.created.stage === "A2" && record.created.taskKind === "stage-execution").length, 1, "只建新 attempt 任务");
      assert.deepEqual(h.advances, [workflowId], "重入后 advance 投递/续驱一次");
      const lifecycle = (await lifecycles(root)).find((entry) => entry.blockId === blockId);
      assert.equal(lifecycle?.resolution, "decided");
      assert.equal(lifecycle?.reEntry, "block-revise-scope");
    } finally {
      await cleanup(root);
    }
  }
  // 3b) block-terminate-flow：不调重入端口（既有终止/披露语义），零 rework。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const h = makeRouterHarness(root, clock);
      const workflowId = "wf-reentry-decided-terminate";
      await appendWf(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }));
      await appendCompletedStage(root, workflowId, "A1");
      await appendWf(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
      await appendWf(root, blockedEvent({ workflowId, stage: "A2", attempt: 1 }));
      const { blockId: decidedBlockId } = await seedDecidedCard(root, { workflowId, stage: "A2", choice: "block-terminate-flow", fingerprint: "decided-terminate" });

      await h.router.recover(root);
      assert.equal(h.reenterCalls.length, 0, "terminate 不调重入端口");
      assert.equal(reworkEventsOf(await wfEventsOf(root, workflowId), "A2").length, 0, "零 rework");
      assert.equal([...(await readTaskState(root)).records.values()]
        .filter((record) => record.created?.taskKind === "repair"
          && record.created.blockId === decidedBlockId).length, 0,
        "terminate 不为该 block 建属主修复任务");
      assert.equal(h.systemRows.some((row) => String(row.summary).includes("[Block·终止]")), true, "既有终止披露");
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 4) 恢复崩溃窗口（真实 SessionManager） ——————————————

/** 崩溃窗口：block 已 resolved(fixed)（与 stage.blocked 扫描同 blockId）+ A2 blocked + 尚无 rework。 */
async function seedCrashWindow(root: string, workflowId: string): Promise<{ blockId: string; blocked: WorkflowEvent }> {
  await appendWf(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_APP_DISPATCH }));
  await appendCompletedStage(root, workflowId, "A1");
  await appendWf(root, requestedEvent({ workflowId, stage: "A2", attempt: 2 }));
  const blocked = blockedEvent({ workflowId, stage: "A2", attempt: 2 });
  await appendWf(root, blocked);
  const fact = blockFactFromStageBlocked(blocked as Extract<WorkflowEvent, { kind: "stage.blocked" }>, {
    protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
    judgeAvailable: false,
    source: "block-router.stage-blocked-scan",
  });
  const { blockId } = await seedResolvedBlock({ root, fact, resolution: "fixed" });
  assert.equal(computeBlockId(fact), blockId);
  return { blockId, blocked };
}

test("恢复崩溃窗口：resolved(fixed)+blocked+无 rework ⇒ recover 恰补一条 rework+新 attempt；已有 reentry 的旧 block 跳过", async () => {
  // 4a) 补重入场：恰一条 rework（blockId、attempt3）+ attempt3 任务。
  {
    const root = await makeRoot();
    const clock = { now: T0 };
    const h = harness(root, clock);
    try {
      const workflowId = "wf-reentry-recover";
      const { blockId } = await seedCrashWindow(root, workflowId);
      await internals(h.mgr).blockRouter.recover(root);
      const events = await wfEventsOf(root, workflowId);
      const reworks = reworkEventsOf(events, "A2");
      assert.equal(reworks.length, 1, "recover 恰补一条 rework");
      assert.equal(reworks[0]!.blockId, blockId);
      assert.equal(reworks[0]!.attempt, 3);
      const a2 = stageTasksOf(await readTaskState(root), workflowId, "A2");
      assert.equal(a2.length, 1, "补建 attempt3 任务恰一条");
      assert.equal(a2[0]!.taskId, appDispatchTaskId(stageExecutionIdempotencyKey(workflowId, "A2", "product", 3)));
      const view = await viewOf(root, workflowId);
      assert.equal(view.stages.A2.status, "dispatched", "阶段由 recover drive 到 attempt3 在飞");
      assert.equal(view.stages.A2.attempt, 3);
      // 第二次 recover：阶段在飞 ⇒ 不重复 re-drive。
      await internals(h.mgr).blockRouter.recover(root);
      assert.equal(reworkEventsOf(await wfEventsOf(root, workflowId), "A2").length, 1, "重复 recover 不写第二条 rework");
      assert.equal(stageTasksOf(await readTaskState(root), workflowId, "A2").length, 1, "不重复建任务");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 4b) 已有该 block reentry 事件的旧 block：阶段再次 blocked 时跳过（不按旧 block re-drive）。
  {
    const root = await makeRoot();
    const clock = { now: T0 };
    const h = harness(root, clock);
    try {
      const workflowId = "wf-reentry-old-block";
      const { blockId } = await seedCrashWindow(root, workflowId);
      // 模拟：旧 block 已重入场（attempt3）→ 新 attempt 又失败 blocked。
      await appendWf(root, {
        v: 1, at: new Date(T0).toISOString(), schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.reworked",
        workflowId, flowId: FLOW, path: "A",
        idempotencyKey: `stage-rework:${workflowId}:A2:3:${blockId}`,
        stage: "A2", reworkOf: "A2", reason: `block ${blockId} resolved(fixed)`, attempt: 3, blockId,
      });
      await appendWf(root, requestedEvent({ workflowId, stage: "A2", attempt: 3 }));
      await appendWf(root, blockedEvent({ workflowId, stage: "A2", attempt: 3 }));
      const before = reworkEventsOf(await wfEventsOf(root, workflowId), "A2").length;
      assert.equal(before, 1);
      await internals(h.mgr).blockRouter.recover(root);
      const after = reworkEventsOf(await wfEventsOf(root, workflowId), "A2");
      assert.equal(after.length, 1, "旧 block 已有 reentry ⇒ 不再补第二条 rework");
      assert.equal(after[0]!.blockId, blockId);
      const a2 = stageTasksOf(await readTaskState(root), workflowId, "A2");
      assert.equal(a2.filter((record) => record.created?.idempotencyKey === stageExecutionIdempotencyKey(workflowId, "A2", "product", 4)).length, 0,
        "不得按旧 block 新开 attempt4");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

// —————————————— 5) fixed-v2.1 零迁移 ——————————————

test("fixed-v2.1 零迁移：resolved(fixed)+blocked 不调重入端口；修复任务完成仍走既有 [Block·修复完成] 简报", async () => {
  // 5a) recover 扫描：fixed-v2.1 的 resolved(fixed) 块不重入场。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const h = makeRouterHarness(root, clock);
      const workflowId = "wf-reentry-fixed-legacy";
      await appendWf(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_FIXED_V2_1 }));
      await appendCompletedStage(root, workflowId, "A1");
      await appendWf(root, requestedEvent({ workflowId, stage: "A2", attempt: 1 }));
      const blocked = blockedEvent({ workflowId, stage: "A2", attempt: 1 });
      await appendWf(root, blocked);
      const fact = blockFactFromStageBlocked(blocked as Extract<WorkflowEvent, { kind: "stage.blocked" }>, {
        protocol: WORKFLOW_PROTOCOL_FIXED_V2_1,
        judgeAvailable: false,
        source: "block-router.stage-blocked-scan",
      });
      await seedResolvedBlock({ root, fact, resolution: "fixed" });
      const wfBefore = (await wfEventsOf(root, workflowId)).length;
      await h.router.recover(root);
      assert.equal(h.reenterCalls.length, 0, "fixed-v2.1 不调重入端口");
      assert.equal(reworkEventsOf(await wfEventsOf(root, workflowId), "A2").length, 0, "零 rework");
      assert.equal((await wfEventsOf(root, workflowId)).length, wfBefore, "工作流账本零写入（零迁移）");
    } finally {
      await cleanup(root);
    }
  }
  // 5b) 修复任务报告 done：仍走旧的「修复完成简报」投递（逐字保留），不重入场。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const h = makeRouterHarness(root, clock);
      const fact: BlockFact = {
        protocol: WORKFLOW_PROTOCOL_FIXED_V2_1, kind: "task.reported", code: "task-report-blocked",
        workflowId: "wf-fixed-brief", flowId: FLOW, stage: "A3",
        summary: "fixed-v2.1 属主修复", fingerprintMaterial: ["fixed-brief"],
      };
      const raised = await raiseBlock({ projectRoot: root, fact, now: NOW });
      assert.equal(raised.ok, true);
      if (!raised.ok) return;
      const repairTaskId = "t-repair-fixed-brief";
      assert.equal((await appendTaskEvent(root, taskEvent("task.created", {
        taskId: repairTaskId, from: "application", to: "convener", text: "[修复任务] fixed-v2.1",
        sideEffect: "unknown", idempotencyKey: `block-repair:${raised.blockId}:1`, taskKind: "repair", blockId: raised.blockId,
      }, NOW))).ok, true);
      assert.equal((await routeBlock({
        projectRoot: root, blockId: raised.blockId, route: "owner-repair", reason: "test:owner",
        targetRoleId: "convener", taskId: repairTaskId, now: NOW,
      })).ok, true);
      await reportRepairDone(root, repairTaskId);
      await h.router.recover(root);
      assert.equal(h.reenterCalls.length, 0, "旧协议不调重入端口");
      assert.equal(reworkEventsOf(await wfEventsOf(root, "wf-fixed-brief"), "A3").length, 0);
      const fixedBrief = h.delivered.find((entry) => entry.kind === "system" && String(entry.text).includes("[Block·修复完成]"));
      assert.ok(fixedBrief !== undefined, "修复完成简报逐字保留（system 投递）");
      assert.match(String(fixedBrief!.text), /block .*已由应用核验（fixed）/);
      const lifecycle = (await lifecycles(root)).find((entry) => entry.blockId === raised.blockId);
      assert.equal(lifecycle?.resolution, "fixed");
    } finally {
      await cleanup(root);
    }
  }
  // 5c) A2/A3 之外的流程语义不受 v3 影响（fixed-v2.1 workflow 无 definition 引用也可继续观察）。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 };
      const h = makeRouterHarness(root, clock);
      const workflowId = "wf-reentry-fixed-noop";
      await appendWf(root, startedEvent({ workflowId, protocol: WORKFLOW_PROTOCOL_FIXED_V2_1 }));
      const wfBefore = (await wfEventsOf(root, workflowId)).length;
      await h.router.recover(root);
      assert.equal((await wfEventsOf(root, workflowId)).length, wfBefore, "fixed-v2.1 空 pending workflow 不被驱动");
      assert.equal(h.advances.length, 0);
    } finally {
      await cleanup(root);
    }
  }
});

// —————————————— 6) 重复/并发恢复 ——————————————

test("重复/并发恢复：Promise.all 双 recover ⇒ 仅一条 rework/一条 attempt3 任务（replay），任务 id 确定性", async () => {
  const root = await makeRoot();
  const clock = { now: T0 };
  const h = harness(root, clock);
  try {
    const workflowId = "wf-reentry-concurrent-recover";
    const { blockId } = await seedCrashWindow(root, workflowId);
    const router = internals(h.mgr).blockRouter;
    await Promise.all([router.recover(root), router.recover(root)]);
    const events = await wfEventsOf(root, workflowId);
    const reworks = reworkEventsOf(events, "A2");
    assert.equal(reworks.length, 1, "并发恢复只写一条 rework");
    assert.equal(reworks[0]!.blockId, blockId);
    const expectedTaskId = appDispatchTaskId(stageExecutionIdempotencyKey(workflowId, "A2", "product", 3));
    const a2 = stageTasksOf(await readTaskState(root), workflowId, "A2");
    assert.equal(a2.length, 1, "并发恢复只建一条 attempt3 任务");
    assert.equal(a2[0]!.taskId, expectedTaskId, "任务 id 确定性派生");
    // 第三次恢复：阶段在飞 ⇒ 不新增。
    await router.recover(root);
    assert.equal(reworkEventsOf(await wfEventsOf(root, workflowId), "A2").length, 1);
    assert.equal(stageTasksOf(await readTaskState(root), workflowId, "A2").length, 1);
    const requested3 = (await wfEventsOf(root, workflowId)).filter((event) =>
      event.kind === "stage.requested" && event.stage === "A2" && event.attempt === 3);
    assert.equal(requested3.length, 1, "attempt3 requested 恰一条");
    const requested4 = (await wfEventsOf(root, workflowId)).filter((event) =>
      event.kind === "stage.requested" && event.stage === "A2" && event.attempt === 4);
    assert.equal(requested4.length, 0, "不新开 attempt4");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

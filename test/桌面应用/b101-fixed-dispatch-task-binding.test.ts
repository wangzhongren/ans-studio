// test/桌面应用/b101-fixed-dispatch-task-binding.test.ts
// T3「两条固定工作流路径」B10.1（2026-11-11，桌面窗口）：fixed 目标会话必须带**真实 taskId**。
// 依据：RR5 失败记录（`2753fdcc…`，`report-task-link-broken`：convener/product 的 `submit_report`
// 以「任务关联未知」到达、`tasks.jsonl` 0 条 `task.reported`、`close_created_task accepted` 全部
// `close-report-missing`，导致 A1/A2 调度请求被 rework 收口、A2 重复派发）；B8.1（forced fixed 目标
// 会话）/B8.2（fixed 派发 origin.taskId 绑定）；B1 v1.2 AC-04/AC-08/AC-18，T-03/T-04。
//
// 根因（桌面侧）：B8.1 的 fixed 目标自动打开只传 `forcedWorkflowMode:"fixed"`、**不传 taskId**，且
// `sendDelivery` 的 handback intent 只从 legacy assignment 取 taskId。run-role 的 `withHandback`
// 只用 intent.taskId 构造回交事件 ⇒ fixed 回合的报告没有任务关联。
// B10.1：① `routeFixedPathDispatch`/`drainQueue` 自动打开 fixed 派发目标时传真实任务 id；
// ② `LiveSession.assignedTaskId` 记录 fixed 会话的真实任务（含内置 convener/product/verifier）；
// ③ `sendDelivery` 的 handback intent 取 `assignment.taskId ?? origin.taskId`（fixed 派发已由
// B8.2 绑定 origin.taskId）；fixed 回交回合无 assignment/origin 任务时回落会话自身 `assignedTaskId`。
// legacy 路径逐字不变（origin.taskId 恒等于 assignment.taskId）。
//
// 覆盖（全部确定性、假会话；不启动 Electron/真实模型）：
//   1. fixed stage-request 派发 ⇒ convener 目标会话以真实 taskId+forced fixed 打开；handback intent
//      带 taskId；报告关联写 `task.reported`；close accepted 由 `close-report-missing` 转为成功（RR5 复现）。
//   2. fixed 生产派发 ⇒ 内置 product 目标会话同样带生产任务 taskId；product 报告关联；convener 收口成功。
//   3. drain 自动打开 fixed 派发目标（重启/排队恢复口径）同样带 taskId。
//   4. 既有固定 chat 会话（无任务绑定）⇒ 安全重绑（dispose + 以 taskId 重开），投递落新会话。
//   5. busy 且未绑定的固定会话 ⇒ `openInternal` 重绑 fail-closed（`fixed-session-rebind-blocked`）；
//      派发受理后不投递（忙时入队不丢），空闲后 drain 以 taskId+forced 重绑续投。
//   6. 已绑定另一任务且 busy ⇒ 不投递到绑定别的任务的会话；空闲后重绑到本次任务再投。
//   7. fixed verifier 直派（A12a）目标会话带 taskId（review 任务同样有报告关联来源）。
//   8. legacy 不变：legacy 任务自动打开目标不带 taskId/forced；fixed chat（chief 无 taskId）仍 forced fixed。
//   9. fixed 回交回合：目标会话已绑定真实任务 ⇒ handback intent 沿用该 taskId（创建者显式进度报告可关联）。
// 不新增 skip/force-exit；不启动 Electron；不写仓库外状态。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager, type DesktopOrchestrationEvent } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent, readWorkflowLedger, requestStage } from "../../src/common/编排/workflow-service.ts";
import { type OrchestrationEvent, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchReceipt, DispatchTaskPayload, WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean | Promise<boolean>, label = "实际事件", timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${label}`);
    await tick(10);
  }
}

async function makeRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** trio 内置六角色 + 项目角色 worker（派发目标；非内置）。 */
function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("product", "product"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      {
        roleId: "worker",
        cardPath: "角色卡/worker/role-card.md",
        boundaryPath: "角色卡/worker/boundary.yaml",
        cardText: "worker",
        boundary: { entries: [], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface CapturedInput {
  roleId: string;
  taskId?: string;
  workflowMode?: "fixed" | "legacy";
  closeCreatedTaskFixed?: (input: { operationId: string; taskId: string; outcome: "accepted" | "rework" | "rejected"; note?: string }) => Promise<unknown>;
  [key: string]: unknown;
}

interface CapturedSend {
  text: string;
  options?: RoleSessionSendOptions;
}

function harness(root: string) {
  const sent: Record<string, CapturedSend[]> = {};
  const streams: Record<string, OrchestrationEvent[]> = {};
  const inputs: CapturedInput[] = [];
  const disposed: string[] = [];
  const envelopes: { roleId: string; event: DesktopOrchestrationEvent }[] = [];
  for (const role of listing(root).roles) {
    sent[role.roleId] = [];
    streams[role.roleId] = [];
  }
  const makeHandle = (roleId: string): RoleSessionHandle => {
    let index = 0;
    let stopped = false;
    return {
      async send(text: string, options?: RoleSessionSendOptions): Promise<void> {
        (sent[roleId] ??= []).push({ text, ...(options !== undefined ? { options } : {}) });
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 200; tries += 1) {
                  if (stopped) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] ?? [];
                  if (index < arr.length) return { value: arr[index++]!, done: false };
                  await tick(5);
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {
        stopped = true;
        disposed.push(roleId);
      },
    };
  };
  const versionChangeStack = {
    ensureInitialized: async () => undefined,
    stablePermitOf: () => undefined,
    submitVersionChange: async () => ({ ok: false, errorCode: "vca-invalid", message: "test" }),
    submitRefactor: async () => ({ ok: false, errorCode: "refactor-invalid", message: "test" }),
    requestStableWrite: async () => ({ ok: false, errorCode: "stable-write-write-failed", message: "test" }),
    selectRunChange: async () => ({ ok: false, status: "blocked", message: "test" }),
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      inputs.push(input as unknown as CapturedInput);
      return makeHandle(input.roleId);
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (projectRoot) => (projectRoot === root ? listing(root) : undefined),
    getVersionChangeStack: () => versionChangeStack as never,
    emitEvent: (envelope) => envelopes.push({ roleId: envelope.roleId, event: envelope.event as DesktopOrchestrationEvent }),
  });
  return { mgr, sent, streams, inputs, disposed, envelopes };
}

interface LiveSource {
  entry: unknown;
  origin: { settled: boolean; turnId?: string; taskId?: string };
}

/** 伪造**真实活条目 + 当前轮次**（Q6 来源证据；测试不启动模型，直接定格会话条目事实）。 */
function liveSource(mgr: SessionManager, root: string, roleId: string, overrides: Partial<LiveSource["origin"]> = {}): LiveSource {
  const manager = mgr as unknown as {
    sessionKey(projectRoot: string, roleId: string, runtime: string): string;
    sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
  };
  const entry = manager.sessions.get(manager.sessionKey(root, roleId, "demo"));
  assert.ok(entry, `会话条目应存在：${roleId}`);
  const origin = { settled: false, ...overrides };
  entry!.busy = true;
  entry!.origins.running = origin;
  return { entry, origin };
}

function releaseSource(mgr: SessionManager, source: LiveSource): void {
  void mgr;
  const entry = source.entry as { busy: boolean; origins: { running?: unknown } };
  entry.busy = false;
  if (entry.origins.running === source.origin) delete entry.origins.running;
}

interface SessionEntryView {
  assignedTaskId?: string;
  sessionWorkflowMode?: string;
  busy: boolean;
  origins: { running?: unknown };
}

function sessionEntry(mgr: SessionManager, root: string, roleId: string): SessionEntryView | undefined {
  const manager = mgr as unknown as {
    sessionKey(projectRoot: string, roleId: string, runtime: string): string;
    sessions: Map<string, SessionEntryView>;
  };
  return manager.sessions.get(manager.sessionKey(root, roleId, "demo"));
}

async function openRole(h: ReturnType<typeof harness>, root: string, roleId: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo" });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "会话打开失败") : "");
  const input = h.inputs.find((item) => item.roleId === roleId && item.taskId === undefined);
  assert.ok(input !== undefined, `应捕获 ${roleId} 的 openRoleSession 入参`);
  return input!;
}

async function routeDispatch(
  mgr: SessionManager,
  root: string,
  fromRoleId: string,
  payload: DispatchTaskPayload,
  source?: LiveSource,
): Promise<DispatchReceipt> {
  const manager = mgr as unknown as {
    routeDispatch(projectRoot: string, runtime: "demo", fromRoleId: string, d: DispatchTaskPayload, source?: LiveSource): Promise<DispatchReceipt>;
  };
  return manager.routeDispatch(root, "demo", fromRoleId, payload, source);
}

interface DrainInternals {
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Record<string, unknown>): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: "demo"): Promise<void>;
}

/** 直接经投递机入队 + drain（覆盖「固定任务投递时目标会话被自动打开」的自动开启面）。 */
async function drainItem(mgr: SessionManager, root: string, targetRoleId: string, item: Record<string, unknown>): Promise<void> {
  const manager = mgr as unknown as DrainInternals;
  manager.enqueueDelivery(root, targetRoleId, item);
  await manager.drainQueue(root, targetRoleId, "demo");
}

async function fixedProject(root: string): Promise<void> {
  await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
}

const FIXED_FLOW = "snake";
const BASE_AT = "2026-11-11T00:00:00.000Z";

function workflowStarted(workflowId: string, sourceTaskId: string): WorkflowEvent {
  return {
    v: 1, at: BASE_AT, schema: "ans-workflow/v1", kind: "workflow.started",
    workflowId, flowId: FIXED_FLOW, path: "A",
    idempotencyKey: `workflow-start:${FIXED_FLOW}:A:${sourceTaskId}`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId,
  };
}

function stageRequested(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    v: 1, at: BASE_AT, schema: "ans-workflow/v1", kind: "stage.requested", workflowId, flowId: FIXED_FLOW, path: "A",
    idempotencyKey: `stage-request:${workflowId}:${stage}:1`, stage,
    requestTaskId: `t-req-${stage}`, requestDigest: "a".repeat(64), attempt: 1,
  };
}

function stageCompleted(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    v: 1, at: BASE_AT, schema: "ans-workflow/v1", kind: "stage.completed", workflowId, flowId: FIXED_FLOW, path: "A",
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}

function stageDispatched(workflowId: string, stage: WorkflowStage, taskId: string): WorkflowEvent {
  return {
    v: 1, at: BASE_AT, schema: "ans-workflow/v1", kind: "stage.dispatched", workflowId, flowId: FIXED_FLOW, path: "A",
    idempotencyKey: `stage-dispatch:${workflowId}:${stage}:${taskId}`, stage, taskId, targetRoleId: "convener",
  };
}

async function seedStartedWorkflow(root: string, workflowId: string): Promise<void> {
  const appended = await appendWorkflowEvent(root, workflowStarted(workflowId, "turn-b101-seed"));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

/** A1…A10 按既有账本语义完成（A1/A4/A7 完成于任务创建；其余 requested+completed）。 */
async function seedA10Completed(root: string, workflowId: string): Promise<void> {
  await seedStartedWorkflow(root, workflowId);
  const order: WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"];
  for (const stage of order) {
    const requested = await appendWorkflowEvent(root, stageRequested(workflowId, stage));
    assert.equal(requested.ok, true, requested.ok === false ? requested.message : "");
    if (stage === "A1" || stage === "A4" || stage === "A7") {
      const dispatched = await appendWorkflowEvent(root, stageDispatched(workflowId, stage, `t-dispatch-${stage}`));
      assert.equal(dispatched.ok, true, dispatched.ok === false ? dispatched.message : "");
    } else {
      const completed = await appendWorkflowEvent(root, stageCompleted(workflowId, stage));
      assert.equal(completed.ok, true, completed.ok === false ? completed.message : "");
    }
  }
}

const stageDigest = (text: string) => createHash("sha256").update(text).digest("hex");

function taskReportRows(state: Awaited<ReturnType<typeof readTaskState>>, taskId: string): number {
  return state.records.get(taskId)?.reports.length ?? 0;
}

/**
 * 按 run-role 的真实口径构造一份 `submit_report` 回交事件：`withHandback` 的 taskId 只来自
 * `opts.handback.taskId`（handback intent）——测试从**真实传给句柄的 send 选项**读取该值，
 * 不手工伪造任务关联；读不到（HEAD 行为）⇒ 回交无 taskId（RR5 的「任务关联未知」形状）。
 */
function reportHandbackFromSend(send: CapturedSend, roleId: string, summary: string, turnId: string): TaskHandback {
  const intentTaskId = send.options?.handback?.taskId;
  return {
    roleId,
    status: "completed",
    summary,
    evidence: [],
    at: new Date().toISOString(),
    turnId,
    ...(typeof intentTaskId === "string" && intentTaskId !== "" ? { taskId: intentTaskId } : {}),
  };
}

function pushHandback(h: ReturnType<typeof harness>, roleId: string, handback: TaskHandback): void {
  h.streams[roleId]!.push({ kind: "handback", summary: `回交：${handback.summary}`, handback } as OrchestrationEvent);
}

const fullStageRequest = (overrides: Partial<DispatchTaskPayload> = {}): DispatchTaskPayload => ({
  roleId: "convener",
  task: "推进 A1：请派产品撰写意图",
  flowId: FIXED_FLOW,
  taskKind: "stage-request",
  workflowPath: "A",
  stage: "A1",
  workflowAction: "advance",
  sideEffect: "read-only",
  ...overrides,
});

// ══════════════ 1. fixed stage-request ⇒ convener 绑定真实 taskId + 报告关联 + 收口 ══════════════

test("B10.1 stage-request：convener 目标会话带真实 taskId+forced fixed；submit_report 关联 task.reported；close accepted 由 close-report-missing 转成功", async () => {
  const root = await makeRoot("ans-b101-stage-");
  const h = harness(root);
  try {
    await fixedProject(root);
    await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b101-stage-src" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");

    // 目标会话 open 入参：真实任务 id + forced fixed（RR5 缺的就是这个 taskId）。
    const state = await readTaskState(root);
    const stageRequest = [...state.records.values()].find((record) => record.created?.taskKind === "stage-request");
    assert.ok(stageRequest?.created, "stage-request 任务应已创建");
    const target = h.inputs.find((input) => input.roleId === "convener");
    assert.ok(target !== undefined, "目标 convener 会话应被自动打开");
    assert.equal(target!.taskId, stageRequest!.taskId, "目标会话 open 入参必须携带真实 stage-request taskId");
    assert.equal(target!.workflowMode, "fixed", "目标会话仍强制 fixed（B8.1 语义保留）");
    const entry = sessionEntry(h.mgr, root, "convener");
    assert.equal(entry?.assignedTaskId, stageRequest!.taskId, "会话条目记录真实受派任务 id");
    assert.equal(entry?.sessionWorkflowMode, "fixed");

    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0, "convener 收到 stage-request");
    const send = h.sent.convener![0]!;
    assert.match(send.text, /推进 A1/);
    assert.equal(send.options?.handback?.required, true, "stage-request 回合要求报告");
    assert.equal(send.options?.handback?.taskId, stageRequest!.taskId, "handback intent 携带真实 taskId（submit_report 关联来源）");

    // RR5 失败面复现：尚无 task.reported 时 accepted 收口必须 close-report-missing（既有语义不变）。
    const chief = h.inputs.find((input) => input.roleId === "chief" && input.taskId === undefined);
    assert.ok(chief?.closeCreatedTaskFixed, "fixed 幕僚会话应注入 close_created_task v2");
    const beforeReport = await chief!.closeCreatedTaskFixed!({ operationId: "op-b101-close-before", taskId: stageRequest!.taskId, outcome: "accepted" });
    assert.equal((beforeReport as { ok: boolean }).ok, false);
    assert.equal((beforeReport as { code?: string }).code, "close-report-missing", "无报告 ⇒ close-report-missing（RR5 实测码）");

    // 模拟 run-role 的真实 submit_report 回交（taskId 取自实际发送的 handback intent）。
    const handback = reportHandbackFromSend(send, "convener", "A1 受理完成：产品任务已派发", "turn-b101-convener-report");
    assert.equal(handback.taskId, stageRequest!.taskId, "回交事件带任务关联（否则 RR5 的「任务关联未知」）");
    pushHandback(h, "convener", handback);
    await waitUntil(async () => taskReportRows(await readTaskState(root), stageRequest!.taskId) > 0, "task.reported 落账");
    const reported = await readTaskState(root);
    const report = reported.records.get(stageRequest!.taskId)!.reports.at(-1)!;
    assert.equal(report.status, "done", "报告关联并写 task.reported(status=done)");
    assert.equal(report.from, "convener");

    const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-b101-close-after", taskId: stageRequest!.taskId, outcome: "accepted" });
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    assert.equal((closed as { code?: string }).code, undefined, "报告关联后 accepted 收口不再 close-report-missing");
    assert.equal((await readTaskState(root)).records.get(stageRequest!.taskId)?.closed?.outcome, "accepted");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 1b. B18 stage-request 收口不要求产物证据（RR13 修复） ══════════════

test("B18 stage-request：A2 stage-request + 描述 evidence ⇒ accepted（不推进阶段）；同阶段生产任务仍 close-report-missing", async () => {
  const root = await makeRoot("ans-b18-stage-request-");
  const h = harness(root);
  const workflowId = "wf-b18-stage-request-0001";
  try {
    await fixedProject(root);
    await seedStartedWorkflow(root, workflowId);
    const stageRequestTaskId = "t-b18-a2-sr";
    const created = taskEvent("task.created", {
      taskId: stageRequestTaskId, from: "chief", to: "convener", text: "推进 A2",
      sideEffect: "read-only", idempotencyKey: `stage-request:${workflowId}:A2:1`,
      flowId: FIXED_FLOW, workflowId, stage: "A2", taskKind: "stage-request",
    });
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    const reported = taskEvent("task.reported", {
      taskId: stageRequestTaskId, from: "convener", status: "done", summary: "A2 派发完成",
      evidence: ["A2 产品任务已派发（描述文本，非纯路径）"],
    });
    assert.equal((await appendTaskEvent(root, reported)).ok, true);
    const chief = await openRole(h, root, "chief");
    assert.ok(chief.closeCreatedTaskFixed, "fixed 幕僚会话应注入 close_created_task v2");
    const closed = await chief.closeCreatedTaskFixed!({ operationId: "op-b18-sr-close", taskId: stageRequestTaskId, outcome: "accepted" });
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    assert.equal((closed as { stageCompleted?: boolean }).stageCompleted, false, "stage-request 收口不推进阶段");
    const ledger = await readWorkflowLedger(root);
    assert.equal(
      ledger.events.some((event) => event.kind === "stage.completed" && event.stage === "A2"),
      false,
      "stage-request accepted 不得写 stage.completed A2",
    );
    assert.equal((await readTaskState(root)).records.get(stageRequestTaskId)?.closed?.outcome, "accepted");

    // 负例：同阶段生产任务（非 stage-request）报告描述 evidence 仍必须 close-report-missing（不放松）。
    const prodTaskId = "t-b18-a2-prod";
    const prodCreated = taskEvent("task.created", {
      taskId: prodTaskId, from: "convener", to: "product", text: "写意图", sideEffect: "docs",
      idempotencyKey: `work:${workflowId}:A2:product:1`, flowId: FIXED_FLOW, workflowId, stage: "A2",
    });
    assert.equal((await appendTaskEvent(root, prodCreated)).ok, true);
    const prodReported = taskEvent("task.reported", {
      taskId: prodTaskId, from: "product", status: "done", summary: "意图完成",
      evidence: ["意图文档已写好（描述文本，非纯路径）"],
    });
    assert.equal((await appendTaskEvent(root, prodReported)).ok, true);
    const convener = await openRole(h, root, "convener");
    assert.ok(convener.closeCreatedTaskFixed, "fixed 运营会话应注入 close_created_task v2");
    const prodClosed = await convener.closeCreatedTaskFixed!({ operationId: "op-b18-prod-close", taskId: prodTaskId, outcome: "accepted" });
    assert.equal((prodClosed as { ok: boolean }).ok, false);
    assert.equal((prodClosed as { code?: string }).code, "close-report-missing", "生产任务描述 evidence 仍 fail-closed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 2. fixed 生产派发 ⇒ 内置 product 目标带 taskId；报告关联；convener 收口 ══════════════

test("B10.1 生产派发：内置 product 目标会话带生产任务 taskId；product 报告关联；convener close accepted 成功", async () => {
  const root = await makeRoot("ans-b101-production-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const stageRequest = await requestStage({
      projectRoot: root, flowId: FIXED_FLOW, stage: "A1", workflowPath: "A", requestDigest: stageDigest("推进 A1 生产"),
      sourceTaskId: "turn-b101-production-src", text: "推进 A1：请派产品",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    await openRole(h, root, "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: stageRequest.taskId, turnId: "turn-b101-production-convener" });
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "product", task: "A1 撰写产品意图文档", flowId: FIXED_FLOW, sideEffect: "docs",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");

    const state = await readTaskState(root);
    const production = [...state.records.values()].find((record) => record.created?.to === "product");
    assert.ok(production?.created, "fixed 生产任务应已创建");
    const target = h.inputs.find((input) => input.roleId === "product");
    assert.ok(target !== undefined, "product 目标会话应被自动打开（内置角色）");
    assert.equal(target!.taskId, production!.taskId, "内置 product 目标会话同样带真实生产任务 taskId");
    assert.equal(target!.workflowMode, "fixed");
    const entry = sessionEntry(h.mgr, root, "product");
    assert.equal(entry?.assignedTaskId, production!.taskId, "product 会话记录真实任务 id");

    await waitUntil(() => (h.sent.product?.length ?? 0) > 0, "product 收到生产任务");
    const send = h.sent.product![0]!;
    assert.equal(send.options?.handback?.taskId, production!.taskId, "生产回合 handback intent 携带真实 taskId");

    const convener = h.inputs.find((input) => input.roleId === "convener" && input.taskId === undefined);
    assert.ok(convener?.closeCreatedTaskFixed);
    const beforeReport = await convener!.closeCreatedTaskFixed!({ operationId: "op-b101-prod-before", taskId: production!.taskId, outcome: "accepted" });
    assert.equal((beforeReport as { ok: boolean }).ok, false);
    assert.equal((beforeReport as { code?: string }).code, "close-report-missing");

    const handback = reportHandbackFromSend(send, "product", "A1 产品意图文档完成", "turn-b101-product-report");
    assert.equal(handback.taskId, production!.taskId);
    pushHandback(h, "product", handback);
    await waitUntil(async () => taskReportRows(await readTaskState(root), production!.taskId) > 0, "product task.reported 落账");
    assert.equal((await readTaskState(root)).records.get(production!.taskId)!.reports.at(-1)!.status, "done");

    const closed = await convener!.closeCreatedTaskFixed!({ operationId: "op-b101-prod-after", taskId: production!.taskId, outcome: "accepted" });
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    assert.equal((await readTaskState(root)).records.get(production!.taskId)?.closed?.outcome, "accepted");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 3. drain 自动打开（重启/排队恢复）同样带 taskId ══════════════

test("B10.1 drain：fixed 派发条目自动打开目标会话传真实 taskId + forced fixed", async () => {
  const root = await makeRoot("ans-b101-drain-");
  const h = harness(root);
  try {
    await fixedProject(root);
    await seedStartedWorkflow(root, "wf-b101drain00000000000000001");
    const taskId = "t-b101-drain-fixed";
    const appended = await appendTaskEvent(root, taskEvent("task.created", {
      taskId, from: "chief", to: "convener", text: "drain 固定任务：推进 A1",
      flowId: FIXED_FLOW, workflowId: "wf-b101drain00000000000000001", stage: "A1",
      taskKind: "stage-request", sideEffect: "read-only", idempotencyKey: "b101-drain-fixed-1",
    }));
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    await drainItem(h.mgr, root, "convener", {
      kind: "dispatch", runtime: "demo", targetRoleId: "convener", sourceRoleId: "chief", taskId,
      text: "drain 固定任务：推进 A1", summary: "[任务] drain", dedupKey: "b101-drain-fixed-key",
    });
    const target = h.inputs.find((input) => input.roleId === "convener");
    assert.ok(target !== undefined, "drain 应自动打开目标会话");
    assert.equal(target!.taskId, taskId, "drain 自动打开同样携带真实 taskId");
    assert.equal(target!.workflowMode, "fixed");
    assert.equal(sessionEntry(h.mgr, root, "convener")?.assignedTaskId, taskId);
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0, "drain 投递到达 convener");
    assert.equal(h.sent.convener![0]!.options?.handback?.taskId, taskId, "drain 回合 handback intent 携带真实 taskId");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 4. 既有固定 chat 会话（无任务绑定）⇒ 安全重绑 ══════════════

test("B10.1 重绑：既有固定 chat 会话无任务绑定 ⇒ dispose + 以 taskId 重开，投递落新会话", async () => {
  const root = await makeRoot("ans-b101-rebind-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const chat = await openRole(h, root, "convener");
    assert.equal(chat.taskId, undefined, "首开为固定 chat（无任务）");
    assert.equal(sessionEntry(h.mgr, root, "convener")?.assignedTaskId, undefined);

    await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b101-rebind-src" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const stageRequest = [...(await readTaskState(root)).records.values()].find((record) => record.created?.taskKind === "stage-request");
    assert.ok(stageRequest?.created);

    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 1, "无任务绑定的固定 chat 会话应安全关闭一次");
    const convenerInputs = h.inputs.filter((input) => input.roleId === "convener");
    assert.equal(convenerInputs.length, 2, "chat 首开 + 带任务重开");
    assert.equal(convenerInputs[1]!.taskId, stageRequest!.taskId, "重开会话携带真实 taskId");
    assert.equal(convenerInputs[1]!.workflowMode, "fixed");
    assert.equal(sessionEntry(h.mgr, root, "convener")?.assignedTaskId, stageRequest!.taskId);
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0, "任务投递到新会话");
    assert.equal(h.sent.convener![0]!.options?.handback?.taskId, stageRequest!.taskId);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 5. busy 且未绑定 ⇒ 不重绑不投递；空闲后重绑续投 ══════════════

test("B10.1 busy：未绑定的固定会话 busy ⇒ openInternal fail-closed（fixed-session-rebind-blocked），受理后不投递；空闲后 drain 以 taskId 重绑续投", async () => {
  const root = await makeRoot("ans-b101-busy-");
  const h = harness(root);
  try {
    await fixedProject(root);
    await openRole(h, root, "convener");
    const busy = liveSource(h.mgr, root, "convener", { turnId: "turn-b101-busy-convener" });
    // 重绑原语 fail-closed：busy 会话不得被 dispose/重开（绝不清理在跑轮次，也不伪造绑定成功）。
    const manager = h.mgr as unknown as {
      openInternal(req: { projectRoot: string; roleId: string; runtime: "demo"; taskId?: string; forcedWorkflowMode?: "fixed" }, userInitiated: boolean): Promise<{ ok: boolean; error?: string }>;
    };
    const direct = await manager.openInternal({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: "t-b101-busy-direct", forcedWorkflowMode: "fixed" }, false);
    assert.equal(direct.ok, false, "busy 会话的 taskId+fixed 重绑必须 fail-closed");
    assert.match(direct.error ?? "", /fixed-session-rebind-blocked/);
    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 0, "busy 会话不得被关闭");
    assert.equal(h.inputs.filter((input) => input.roleId === "convener").length, 1, "不得重开");

    await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b101-busy-src" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    // 忙时入队不丢：受理成功但**不**向未绑定的固定会话投递（不是把任务投进未绑定会话）。
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.equal((h.sent.convener ?? []).length, 0, "busy 未绑定会话不得收到投递");
    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 0, "受理段不得关闭 busy 会话");
    const request = [...(await readTaskState(root)).records.values()].find((item) => item.created?.taskKind === "stage-request");
    assert.ok(request?.created, "stage-request 任务已登记");

    // 空闲后 drain：以真实 taskId+forced 安全重绑并投递（报告关联随之成立）。
    releaseSource(h.mgr, busy);
    const drainManager = h.mgr as unknown as DrainInternals;
    await drainManager.drainQueue(root, "convener", "demo");
    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 1, "空闲后安全重绑一次");
    const convenerInputs = h.inputs.filter((input) => input.roleId === "convener");
    assert.equal(convenerInputs.length, 2);
    assert.equal(convenerInputs[1]!.taskId, request!.taskId, "重绑携带真实 taskId");
    assert.equal(convenerInputs[1]!.workflowMode, "fixed");
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0, "空闲后投递到达");
    assert.equal(h.sent.convener![0]!.options?.handback?.taskId, request!.taskId);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 6. 已绑定另一任务且 busy ⇒ 不重绑不投递；空闲后重绑新任务 ══════════════

test("B10.1 busy：固定会话已绑定另一任务 ⇒ 受理后不投递，空闲后重绑到本次任务（不投进绑定别的任务的会话）", async () => {
  const root = await makeRoot("ans-b101-busy-bound-");
  const h = harness(root);
  try {
    await fixedProject(root);
    await seedStartedWorkflow(root, "wf-b101busy00000000000000001");
    const manager = h.mgr as unknown as {
      openInternal(req: { projectRoot: string; roleId: string; runtime: "demo"; taskId?: string; forcedWorkflowMode?: "fixed" }, userInitiated: boolean): Promise<{ ok: boolean; error?: string }>;
    };
    const opened = await manager.openInternal({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: "t-b101-other-task", forcedWorkflowMode: "fixed" }, false);
    assert.equal(opened.ok, true, opened.error ?? "");
    assert.equal(sessionEntry(h.mgr, root, "convener")?.assignedTaskId, "t-b101-other-task");
    const busy = liveSource(h.mgr, root, "convener", { turnId: "turn-b101-busy-bound" });
    await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b101-busy-bound-src" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 0, "不得关闭 busy 已绑定会话");
    assert.equal((h.sent.convener ?? []).length, 0, "不得向绑定别的任务的会话投递");
    const request = [...(await readTaskState(root)).records.values()].find((item) => item.created?.taskKind === "stage-request");
    assert.ok(request?.created);

    releaseSource(h.mgr, busy);
    const drainManager = h.mgr as unknown as DrainInternals;
    await drainManager.drainQueue(root, "convener", "demo");
    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 1, "空闲后旧任务绑定安全重开");
    const convenerInputs = h.inputs.filter((input) => input.roleId === "convener");
    assert.equal(convenerInputs.at(-1)!.taskId, request!.taskId, "重绑到本次真实任务");
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0, "空闲后投递到达");
    assert.equal(h.sent.convener![0]!.options?.handback?.taskId, request!.taskId);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 7. fixed verifier 直派（A12a）目标会话带 taskId ══════════════

test("B10.1 verifier：A12a 直派目标会话带真实 review 任务 taskId + forced fixed", async () => {
  const root = await makeRoot("ans-b101-verifier-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const workflowId = "wf-b101verifier00000000000001";
    await seedA10Completed(root, workflowId);
    await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b101-verifier-src" });
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "verifier", task: "A12a 独立验收标准：写 criteria", flowId: FIXED_FLOW, workflowId,
      stage: "A12a", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const created = [...(await readTaskState(root)).records.values()]
      .find((record) => record.created?.workflowId === workflowId && record.created.stage === "A12a" && record.created.to === "verifier");
    assert.ok(created?.created, "A12a review 任务应已创建");
    const target = h.inputs.find((input) => input.roleId === "verifier");
    assert.ok(target !== undefined, "verifier 目标会话应被自动打开");
    assert.equal(target!.taskId, created!.taskId, "verifier 目标会话带真实 review 任务 taskId");
    assert.equal(target!.workflowMode, "fixed");
    assert.equal(sessionEntry(h.mgr, root, "verifier")?.assignedTaskId, created!.taskId);
    await waitUntil(() => (h.sent.verifier?.length ?? 0) > 0, "verifier 收到 A12a 任务");
    assert.equal(h.sent.verifier![0]!.options?.handback?.taskId, created!.taskId, "verifier 回合 handback intent 携带真实 taskId");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════ 8. legacy 不变 + fixed chat 无 taskId 仍 fixed ══════════════

test("B10.1 legacy 不变：legacy 任务自动打开目标不带 taskId/forced；fixed chat（chief 无 taskId）仍 forced fixed", async () => {
  const legacyRoot = await makeRoot("ans-b101-legacy-");
  const legacyH = harness(legacyRoot);
  try {
    await writeJson(legacyRoot, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    const taskId = "t-b101-legacy";
    await appendTaskEvent(legacyRoot, taskEvent("task.created", {
      taskId, from: "chief", to: "product", text: "写产品意图文档", flowId: "flow-a",
      sideEffect: "docs", idempotencyKey: "b101-legacy-1",
    }), { allowLegacyRun: true });
    await drainItem(legacyH.mgr, legacyRoot, "product", {
      kind: "dispatch", runtime: "demo", targetRoleId: "product", sourceRoleId: "chief", taskId,
      text: "写产品意图文档", summary: "[任务] legacy", dedupKey: "b101-legacy-key",
    });
    const product = legacyH.inputs.find((input) => input.roleId === "product");
    assert.ok(product !== undefined, "legacy 任务应自动打开目标会话");
    assert.equal(product!.taskId, undefined, "legacy 任务不携带 taskId（旧路径逐字不变）");
    assert.equal(product!.workflowMode, undefined, "legacy 任务不携带强制 fixed");
    await waitUntil(() => (legacyH.sent.product?.length ?? 0) > 0, "legacy 投递照旧");
    assert.match(legacyH.sent.product![0]!.text, /写产品意图文档/);
  } finally {
    await legacyH.mgr.stop(null);
    await cleanup(legacyRoot);
  }

  const fixedRoot = await makeRoot("ans-b101-fixed-chat-");
  const fixedH = harness(fixedRoot);
  try {
    await fixedProject(fixedRoot);
    const chief = await openRole(fixedH, fixedRoot, "chief");
    assert.equal(chief.taskId, undefined, "fixed chat 无任务");
    assert.equal(chief.workflowMode, "fixed", "fixed chat（chief 无 taskId）仍按 B6.1 强制 fixed");
    assert.equal(sessionEntry(fixedH.mgr, fixedRoot, "chief")?.assignedTaskId, undefined, "fixed chat 会话无任务绑定");
    assert.equal(chief.closeCreatedTaskFixed !== undefined, true, "fixed chat 保留 fixed 收口能力");
  } finally {
    await fixedH.mgr.stop(null);
    await cleanup(fixedRoot);
  }
});

// ══════════════ 9. fixed 回交回合：创建者显式报告关联到自己的真实任务 ══════════════

test("B10.1 fixed 回交回合：目标会话已绑定真实任务 ⇒ handback intent 沿用该 taskId（创建者显式进度报告可关联）", async () => {
  const root = await makeRoot("ans-b101-handback-turn-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const workflowId = "wf-b101hbturn00000000000001";
    await seedStartedWorkflow(root, workflowId);
    const childId = "t-b101-hb-child";
    const appended = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: childId, from: "convener", to: "worker", text: "实现 A1 核心模块", flowId: FIXED_FLOW,
      workflowId, stage: "A1", sideEffect: "code", idempotencyKey: "b101-hb-child-1",
    }));
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    await h.mgr.listTasks(root); // 登记星形任务 id（重启恢复路径同源）
    const manager = h.mgr as unknown as {
      openInternal(req: { projectRoot: string; roleId: string; runtime: "demo"; taskId?: string; forcedWorkflowMode?: "fixed" }, userInitiated: boolean): Promise<{ ok: boolean; error?: string }>;
    };
    // 运营会话已绑定自己的真实受派任务（B10.1 目标会话绑定；此处直接经内部打开定格）。
    const convenerTaskId = "t-b101-hb-parent";
    const opened = await manager.openInternal({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: convenerTaskId, forcedWorkflowMode: "fixed" }, false);
    assert.equal(opened.ok, true, opened.error ?? "");
    assert.equal(sessionEntry(h.mgr, root, "convener")?.assignedTaskId, convenerTaskId);
    await openRole(h, root, "worker"); // 回交来源会话（fixed 聊天）

    const handback: TaskHandback = {
      roleId: "worker", taskId: childId, status: "completed", summary: "实现完成",
      evidence: [], at: new Date().toISOString(), turnId: "turn-b101-hb-worker",
    };
    pushHandback(h, "worker", handback);
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0, "convener 收到 fixed 回交");
    const send = h.sent.convener![0]!;
    assert.equal(send.options?.handback?.required, false, "回交回合不要求报告（无自动回交）");
    assert.equal(send.options?.handback?.taskId, convenerTaskId, "fixed 回交回合沿用会话真实任务 taskId（显式 submit_report 可关联）");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

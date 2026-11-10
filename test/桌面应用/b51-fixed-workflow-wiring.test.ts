// test/桌面应用/b51-fixed-workflow-wiring.test.ts
// T3「两条固定工作流路径」B5.1（2026-11-10，桌面窗口）：**生产接线修复**（B5 全链发现的 G-B5-1/2/3）。
//
// 覆盖（B1 AC-08/AC-09/AC-11/AC-13/AC-18、T-03/T-04/T-10/T-11/T-16 桌面侧）：
//   · G-B5-1：fixed `routeFixedPathDispatch` 创建 A1/A4/A7/A8/A12a/A12b 真实任务后，按真实
//     `task.created` 事实调用 `workflowService.recordStageDispatch` 写 `stage.dispatched`：
//     A1/A4/A7 完成于任务创建（AC-08）；A12a 在办后 A11 stage-request 不再被 AC-09 门拒绝；
//     A12b 可派/可完成；同任务重复调用幂等 replay；A11（requestStage 已记）/B1/B3 不重复写；
//     窗口外派发（B1 既有 review 夹具）不写账本也不阻断；服务失败 fail-closed 如实回报。
//   · G-B5-3：fixed proposal 卡（A6）**呈卡前**按 A10 同构写 `stage.requested A6`
//     （幂等 `stage-request:<wf>:A6:1`、requestDigest=方案依据 hash），使客户 accept 后
//     `stage.completed A6` 合法；窗口不符/无活动 workflow 不写；重复呈卡不重复 marker。
//   · G-B5-2：fixed B3 stage-request 受理时应用**重算**影响面 hash 与候选路径并调用
//     `workflowService.recordChangeScopeDecision`（B2 完成；属主/写集由应用按名单/边界派生），
//     B3 生产派发写集门据此放行；无影响面报告/无候选路径 ⇒ `b-change-scope-invalid` fail-closed；
//     B2 已记录 ⇒ 幂等不重复写。
//
// 夹具：真实临时 Git 仓库（仅 G-B5-2 写集门用例）+ 真实账本/服务 + 假会话（不启动 Electron/
// 真实模型）；确定性；无新增 skip/force-exit；不改 legacy 断言。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  markFixedProposalCardRequested,
  recordFixedPathBScopeDecisionForDispatch,
  recordFixedStageDispatchForTask,
  shouldRecordFixedStageDispatch,
} from "../../app/desktop/workflow.ts";
import { createDesktopBaselineGitPort } from "../../app/desktop/workflow-git.ts";
import {
  appendBasisEvent,
  appendWorkflowEvent,
  readWorkflowLedger,
  requestStage,
  taskBranchName,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type {
  BasisEvent,
  CustomerInputOutcome,
  CustomerInputRequest,
  DispatchReceipt,
  DispatchTaskPayload,
  TaskSideEffect,
  WorkflowEvent,
  WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const AT = "2026-11-10T10:00:00.000Z";
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

// —————————————— 假会话夹具（真实 SessionManager/服务/账本） ——————————————

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn?: ProjectListing["roles"][number]["governanceFunction"]): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, ...(fn !== undefined ? { governanceFunction: fn } : {}),
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"), builtIn("product", "product"), builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"), builtIn("convener", "schedule"), builtIn("verifier", "verification"),
      {
        roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker",
        boundary: {
          entries: [{ root: "project", path: "src/core", kind: "directory", purpose: "core" }],
          boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" },
        },
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
  customerInput?: (request: CustomerInputRequest, metadata?: unknown) => Promise<CustomerInputOutcome | null | undefined>;
  [key: string]: unknown;
}

interface H {
  mgr: SessionManager;
  sent: Record<string, string[]>;
  inputs: CapturedInput[];
  requests: CustomerInputRequest[];
  script: (request: CustomerInputRequest) => CustomerInputOutcome;
}

function harness(root: string, script: (request: CustomerInputRequest) => CustomerInputOutcome = () => ({ outcome: "declined", reason: "test" })): H {
  const sent: Record<string, string[]> = {};
  const inputs: CapturedInput[] = [];
  const requests: CustomerInputRequest[] = [];
  const state = { sent, inputs, requests, script } as H;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      inputs.push(input as unknown as CapturedInput);
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
                  await tick(5);
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
    customerInput: async (request) => {
      requests.push(request as unknown as CustomerInputRequest);
      return state.script(request as unknown as CustomerInputRequest);
    },
    emitEvent: () => {},
  });
  state.mgr = mgr;
  return state;
}

interface LiveSource {
  entry: unknown;
  origin: { settled: boolean; turnId?: string; taskId?: string; assignment?: { taskId: string; flowId: string; runId?: string } };
}

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
  const entry = source.entry as { busy: boolean; origins: { running?: unknown } };
  entry.busy = false;
  if (entry.origins.running === source.origin) delete entry.origins.running;
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

// —————————————— 文件/仓库夹具 ——————————————

async function tempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  await writeFile(root, rel, `${JSON.stringify(value, null, 2)}\n`);
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function initRepo(root: string): void {
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "B51 Test");
  git(root, "config", "user.email", "b51@test.local");
  git(root, "config", "core.autocrlf", "false");
}

function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

// —————————————— 账本/任务夹具 ——————————————

const BASE_A = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
const BASE_B = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "B" as const };

async function appendEvents(root: string, events: readonly WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

async function seedStarted(root: string, workflowId: string, workflowPath: "A" | "B" = "A"): Promise<void> {
  await appendEvents(root, [{
    ...(workflowPath === "A" ? BASE_A : BASE_B),
    kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:${workflowPath}:t-src`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }]);
}

function requested(workflowId: string, stage: WorkflowStage, attempt = 1, base: typeof BASE_A | typeof BASE_B = BASE_A): WorkflowEvent {
  return {
    ...base, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: "a".repeat(64), attempt,
  };
}

function dispatched(workflowId: string, stage: WorkflowStage, taskId = `t-dispatch-${stage}`): WorkflowEvent {
  return {
    ...BASE_A, kind: "stage.dispatched", workflowId, flowId: FLOW,
    idempotencyKey: `stage-dispatch:${workflowId}:${stage}:${taskId}`, stage, taskId, targetRoleId: "convener",
  };
}

function completed(workflowId: string, stage: WorkflowStage, base: typeof BASE_A | typeof BASE_B = BASE_A): WorkflowEvent {
  return {
    ...base, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}

function aChain(workflowId: string, through: WorkflowStage, last: "requested" | "completed" = "requested"): WorkflowEvent[] {
  const order: readonly WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"];
  const events: WorkflowEvent[] = [];
  for (const stage of order) {
    events.push(requested(workflowId, stage));
    if (stage === through) {
      if (last === "completed") events.push(completed(workflowId, stage));
      break;
    }
    if (stage === "A1" || stage === "A4" || stage === "A7") events.push(dispatched(workflowId, stage));
    else events.push(completed(workflowId, stage));
  }
  return events;
}

async function seedA(root: string, workflowId: string, through: WorkflowStage, last: "requested" | "completed" = "requested"): Promise<void> {
  await seedStarted(root, workflowId, "A");
  await appendEvents(root, aChain(workflowId, through, last));
}

interface SeedTaskInput {
  taskId: string;
  from: "chief" | "convener";
  to: string;
  workflowId?: string;
  flowId?: string;
  stage?: WorkflowStage;
  taskKind?: "stage-request";
  sideEffect?: TaskSideEffect;
  text?: string;
  modulePaths?: string[];
  requestedEvidence?: string[];
  doneEvidence?: string[];
  closed?: "accepted" | "rejected";
}

async function seedTask(root: string, input: SeedTaskInput): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.created", {
    taskId: input.taskId,
    from: input.from,
    to: input.to,
    text: input.text ?? `${input.stage ?? ""} 任务`,
    sideEffect: input.sideEffect ?? "read-only",
    idempotencyKey: `seed-key-${input.taskId}`,
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.taskKind !== undefined ? { taskKind: input.taskKind } : {}),
    ...(input.modulePaths !== undefined ? { modulePaths: input.modulePaths } : {}),
    ...(input.requestedEvidence !== undefined ? { requestedEvidence: input.requestedEvidence } : {}),
  }, () => new Date(AT)));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  if (input.doneEvidence !== undefined) {
    const reported = await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: input.taskId, from: input.to, status: "done", summary: "完成", evidence: input.doneEvidence,
    }, () => new Date(AT)));
    assert.equal(reported.ok, true, reported.ok === false ? reported.message : "");
  }
  if (input.closed !== undefined) {
    const closed = await appendTaskEvent(root, taskEvent("task.closed", {
      taskId: input.taskId, by: input.from, outcome: input.closed,
    }, () => new Date(AT)));
    assert.equal(closed.ok, true, closed.ok === false ? closed.message : "");
  }
}

async function viewOf(root: string, workflowId: string) {
  const ledger = await readWorkflowLedger(root);
  const tasks = await readTaskState(root);
  return deriveWorkflowView(ledger.events.filter((event) => event.workflowId === workflowId), tasks.events);
}

async function dispatchEventsOf(root: string, workflowId: string, stage: WorkflowStage) {
  return (await readWorkflowLedger(root)).events.filter((event) =>
    event.workflowId === workflowId && event.kind === "stage.dispatched" && event.stage === stage);
}

/** 打开会话并构造 live 轮次事实（sourceIsCurrent 证据；不启动模型）。 */
async function openRole(h: H, root: string, roleId: string, taskId?: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo", ...(taskId !== undefined ? { taskId } : {}) });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "会话打开失败") : "");
  const input = [...h.inputs].reverse().find((item) => item.roleId === roleId && (taskId === undefined || item.taskId === taskId));
  assert.ok(input !== undefined, `应捕获 ${roleId} 的 openRoleSession 入参`);
  return input!;
}

// ══════════════════════════════ G-B5-1 SQL：stage.dispatched 生产落账 ══════════════════════════════

for (const stage of ["A1", "A4", "A7"] as const) {
  const targetRole = stage === "A1" ? "product" : stage === "A4" ? "rapporteur" : "nominator";
  const workflowId = stage === "A1" ? "wf-b51dispa10000000000000001"
    : stage === "A4" ? "wf-b51dispa40000000000000001"
    : "wf-b51dispa70000000000000001";
  test(`G-B5-1：fixed 直派 ${stage} 任务创建 ⇒ stage.dispatched ${stage} 落账（完成于任务创建）且同任务幂等 replay`, async () => {
    const root = await tempRoot(`ans-b51-disp-${stage.toLowerCase()}-`);
    const h = harness(root);
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
      await seedA(root, workflowId, stage, "requested");
      await seedTask(root, {
        taskId: `t-sr-${stage}`, from: "chief", to: "convener", workflowId, flowId: FLOW,
        stage, taskKind: "stage-request",
      });
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { taskId: `t-sr-${stage}` });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: targetRole, task: `${stage} 受理：目标产物`, flowId: FLOW, workflowId, stage, sideEffect: "docs",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, true, receipt.message ?? "");
      const created = [...(await readTaskState(root)).records.values()].find((record) =>
        record.created?.workflowId === workflowId && record.created.stage === stage && record.created.to === targetRole);
      assert.ok(created?.created, `应创建 ${stage} 生产任务`);
      const events = await dispatchEventsOf(root, workflowId, stage);
      assert.equal(events.length, 1, `stage.dispatched ${stage} 应恰好一条`);
      const event = events[0]!;
      assert.equal(event.kind === "stage.dispatched" && event.taskId, created!.taskId);
      assert.equal(event.kind === "stage.dispatched" && event.targetRoleId, targetRole);
      assert.equal(event.idempotencyKey, `stage-dispatch:${workflowId}:${stage}:${created!.taskId}`);
      assert.equal((await viewOf(root, workflowId)).stages[stage].status, "completed", `${stage} 完成于目标任务创建（AC-08）`);
      // 同 taskId 重复调用 ⇒ 幂等 replay（A1/A4/A7 已完成态不因重复派发记录报错）。
      const replay = await recordFixedStageDispatchForTask({
        projectRoot: root, workflowId, stage, taskId: created!.taskId, targetRoleId: targetRole,
      });
      assert.equal(replay.ok, true);
      if (replay.ok) assert.equal(replay.replay, true);
      assert.equal((await dispatchEventsOf(root, workflowId, stage)).length, 1, "replay 不重复写事件");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  });
}

test("G-B5-1：A8 激活任务创建 ⇒ stage.dispatched A8（A7 完成后下一阶段；在办供 role.activated）", async () => {
  const root = await tempRoot("ans-b51-disp-a8-");
  const h = harness(root);
  const workflowId = "wf-b51dispa80000000000000001";
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await seedA(root, workflowId, "A7", "completed");
    await seedTask(root, {
      taskId: "t-sr-a7", from: "chief", to: "convener", workflowId, flowId: FLOW,
      stage: "A7", taskKind: "stage-request",
    });
    await openRole(h, root, "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: "t-sr-a7" });
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "nominator", task: "A8 建卡并激活名单角色", flowId: FLOW, workflowId, stage: "A8", sideEffect: "docs",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const events = await dispatchEventsOf(root, workflowId, "A8");
    assert.equal(events.length, 1, "stage.dispatched A8 应恰好一条");
    const view = await viewOf(root, workflowId);
    assert.equal(view.stage, "A8");
    assert.equal(view.stages.A8.status, "dispatched", "A8 在办（完成于收口/激活事件）");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("G-B5-1：A12a 直派 ⇒ stage.dispatched A12a；A11 stage-request 不再被 AC-09 门拒绝（未记录时拒绝的对照）", async () => {
  const workflowId = "wf-b51dispa12a00000000000001";
  // 对照：只创建 A12a 任务、不记 stage.dispatched ⇒ A11 请求被 AC-09 门拒绝（G-B5-1 缺口复现）。
  {
    const root = await tempRoot("ans-b51-a12a-gap-");
    try {
      await seedA(root, workflowId, "A10", "completed");
      await seedTask(root, {
        taskId: "t-a12a", from: "chief", to: "verifier", workflowId, flowId: FLOW,
        stage: "A12a", sideEffect: "read-only",
      });
      const blocked = await requestStage({
        projectRoot: root, flowId: FLOW, workflowId, stage: "A11",
        requestDigest: sha("推进 A11"), sourceTaskId: "t-src", text: "推进 A11",
      });
      assert.equal(blocked.ok, false, "未记录 A12a 派发时 A11 必须被拒绝");
      if (!blocked.ok) assert.equal(blocked.code, "stage-transition-invalid");
    } finally {
      await cleanup(root);
    }
  }
  // 生产接线：桌面直派 A12a ⇒ 应用记 stage.dispatched A12a ⇒ A11 请求放行。
  {
    const root = await tempRoot("ans-b51-a12a-ok-");
    const h = harness(root);
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
      await seedA(root, workflowId, "A10", "completed");
      await openRole(h, root, "chief");
      const live = liveSource(h.mgr, root, "chief", { turnId: "turn-a12a" });
      const receipt = await routeDispatch(h.mgr, root, "chief", {
        roleId: "verifier", task: "A12a 独立验收标准：写 criteria", flowId: FLOW, workflowId,
        stage: "A12a", sideEffect: "read-only",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, true, receipt.message ?? "");
      const created = [...(await readTaskState(root)).records.values()].find((record) =>
        record.created?.workflowId === workflowId && record.created.stage === "A12a" && record.created.to === "verifier");
      assert.ok(created?.created);
      const events = await dispatchEventsOf(root, workflowId, "A12a");
      assert.equal(events.length, 1, "stage.dispatched A12a 应恰好一条");
      assert.equal(events[0]!.kind === "stage.dispatched" && events[0]!.taskId, created!.taskId);
      const a11 = await requestStage({
        projectRoot: root, flowId: FLOW, workflowId, stage: "A11",
        requestDigest: sha("推进 A11"), sourceTaskId: "t-src", text: "推进 A11",
      });
      assert.equal(a11.ok, true, a11.ok === false ? `${a11.code}: ${a11.message}` : "");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("G-B5-1：A12b 直派 ⇒ stage.dispatched A12b（A11 完成后窗口）", async () => {
  const root = await tempRoot("ans-b51-a12b-");
  const h = harness(root);
  const workflowId = "wf-b51dispa12b00000000000001";
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await seedA(root, workflowId, "A11", "completed");
    await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-a12b" });
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "verifier", task: "A12b 独立验收报告", flowId: FLOW, workflowId, stage: "A12b", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const events = await dispatchEventsOf(root, workflowId, "A12b");
    assert.equal(events.length, 1, "stage.dispatched A12b 应恰好一条");
    const view = await viewOf(root, workflowId);
    assert.equal(view.stage, "A12b");
    assert.equal(view.stages.A12b.status, "dispatched");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("G-B5-1：窗口外 review 直派不写账本也不阻断（B1 既有夹具语义）；服务失败 fail-closed（workflow-not-found / workflow-closed）", async () => {
  // 窗口外：workflow 只在 A1 pending 时直派 A12a（B1 既有正例语义）⇒ 照旧投递、不写 stage.dispatched。
  {
    const root = await tempRoot("ans-b51-window-skip-");
    const h = harness(root);
    const workflowId = "wf-b51window0000000000000001";
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
      await seedStarted(root, workflowId, "A");
      await openRole(h, root, "chief");
      const live = liveSource(h.mgr, root, "chief");
      const receipt = await routeDispatch(h.mgr, root, "chief", {
        roleId: "verifier", task: "A12a 独立验收标准", flowId: FLOW, workflowId, stage: "A12a", sideEffect: "read-only",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, true, receipt.message ?? "");
      assert.equal((await dispatchEventsOf(root, workflowId, "A12a")).length, 0, "窗口外不得伪造 stage.dispatched");
      assert.equal((await readWorkflowLedger(root)).events.filter((event) => event.workflowId === workflowId && event.kind === "stage.dispatched").length, 0);
      await waitUntil(() => (h.sent.verifier?.length ?? 0) > 0);
      assert.ok((h.sent.verifier?.length ?? 0) > 0, "窗口外派发照旧投递（不阻断既有 review 派发）");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 失败面：workflow 不存在 ⇒ workflow-not-found（不伪报）。
  {
    const root = await tempRoot("ans-b51-disp-missing-");
    try {
      const outcome = await recordFixedStageDispatchForTask({
        projectRoot: root, workflowId: "wf-doesnotexist", stage: "A1", taskId: "t-x", targetRoleId: "product",
      });
      assert.equal(outcome.ok, false);
      if (!outcome.ok) assert.equal(outcome.code, "workflow-not-found");
    } finally {
      await cleanup(root);
    }
  }
  // 失败面：workflow 已关闭 ⇒ workflow-closed（不写事件）。
  {
    const root = await tempRoot("ans-b51-disp-closed-");
    const workflowId = "wf-b51closed0000000000000001";
    try {
      await seedA(root, workflowId, "A1", "completed");
      await appendEvents(root, [{
        ...BASE_A, kind: "workflow.closed", workflowId, flowId: FLOW,
        idempotencyKey: `workflow-close:${workflowId}:seed`, outcome: "delivered", reason: "seed",
      }]);
      const outcome = await recordFixedStageDispatchForTask({
        projectRoot: root, workflowId, stage: "A4", taskId: "t-x", targetRoleId: "rapporteur",
      });
      assert.equal(outcome.ok, false);
      if (!outcome.ok) assert.equal(outcome.code, "workflow-closed");
      assert.equal((await dispatchEventsOf(root, workflowId, "A4")).length, 0);
    } finally {
      await cleanup(root);
    }
  }
});

test("G-B5-1：stage 集合不含 A11/B1/B3（A11 由 requestStage 记录；B3 无 stage.dispatched 语义）", async () => {
  for (const stage of ["A1", "A4", "A7", "A8", "A12a", "A12b"] as const) {
    assert.equal(shouldRecordFixedStageDispatch(stage), true, `${stage} 应记 stage.dispatched`);
  }
  for (const stage of ["A2", "A5", "A9", "A10", "A11", "A12", "A13", "B1", "B2", "B3", "B4"] as const) {
    assert.equal(shouldRecordFixedStageDispatch(stage), false, `${stage} 不应重复/新增 stage.dispatched`);
  }
  const root = await tempRoot("ans-b51-stage-set-");
  try {
    for (const stage of ["A11", "B3"] as const) {
      const outcome = await recordFixedStageDispatchForTask({
        projectRoot: root, workflowId: "wf-any", stage, taskId: "t-any", targetRoleId: "convener",
      });
      assert.equal(outcome.ok, true);
      if (outcome.ok) assert.equal(outcome.recorded, false);
    }
    assert.equal((await readWorkflowLedger(root)).events.length, 0, "集合外 stage 不写任何事件");
  } finally {
    await cleanup(root);
  }
});

// ══════════════════════════════ G-B5-3：A6 在办标记（方案卡呈卡前） ══════════════════════════════

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v4",
  "flowId: snake",
  "version: 1",
  "intent: docs/product/snake-intent-v1.md",
  "proposal: docs/proposals/snake-proposal-v1.md",
  "architecture: docs/contracts/snake-architecture-v1.md",
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: pure local text task",
  "roles:",
  "  - id: worker",
  "    displayName: Worker",
  "    purpose: 实现",
  "    capability: TypeScript",
  "    modules: [core]",
  "modules:",
  "  - id: core",
  "    name: Core",
  "    purpose: Core module",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "---",
  "# Roster",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "management: [convener, worker]",
  "modules:",
  "  - id: core",
  "    path: src/core/",
  "    roleId: worker",
  "roles:",
  "  - id: worker",
  "    modules: [core]",
  "```",
  "",
].join("\n");

const PROPOSAL_TEXT = "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\nintent: docs/product/snake-intent-v1.md\n---\n# 提案：贪吃蛇\n";

async function seedFiveDocs(root: string): Promise<void> {
  await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇\n---\n# 意图\n");
  await writeFile(root, "docs/intents/snake-intent.md", "---\nintentId: snake-intent\nflowId: snake\ngoal: 贪吃蛇\n---\n# 意图入口\n");
  await writeFile(root, "docs/proposals/snake-proposal-v1.md", PROPOSAL_TEXT);
  await writeFile(root, "docs/proposals/snake-modules-v1.md", [
    "---", "schema: project-modules/v2", "flowId: snake", "version: 1", "modules:",
    "  - id: core", "    name: Core", "    purpose: Core module", "    path: src/core/", "    category: core",
    "    publicContract: src/core/index.ts", "    architectureSource: docs/contracts/snake-architecture-v1.md",
    "---", "# 模块", "",
  ].join("\n"));
  await writeFile(root, "docs/proposals/snake-roster-v1.md", ROSTER_TEXT);
  await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\nproposal: docs/proposals/snake-proposal-v1.md\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
}

const PROPOSAL_CARD: CustomerInputRequest = {
  kind: "choice", title: "确认方案", cardKind: "proposal", flowId: FLOW,
  options: [{ id: "accept", label: "接受" }, { id: "revise", label: "修订" }, { id: "reject", label: "拒绝" }],
};

test("G-B5-3：fixed proposal 卡呈卡前写 stage.requested A6（幂等键/方案依据 hash/requestTaskId）；accept ⇒ stage.completed A6", async () => {
  const root = await tempRoot("ans-b51-a6-marker-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["accept"] } }));
  const workflowId = "wf-b51a6marker00000000000001";
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    // A5 已完成、A6 尚未请求（生产窗口：方案卡即将呈现）。
    await seedA(root, workflowId, "A5", "completed");
    await seedFiveDocs(root);
    const chief = await openRole(h, root, "chief");
    const outcome = await chief.customerInput!(PROPOSAL_CARD);
    assert.equal(outcome?.outcome, "answered");
    const proposalSha = sha(PROPOSAL_TEXT);
    const a6Requests = (await readWorkflowLedger(root)).events.filter((event) =>
      event.workflowId === workflowId && event.kind === "stage.requested" && event.stage === "A6");
    assert.equal(a6Requests.length, 1, "呈卡前应写恰好一条 stage.requested A6");
    const request = a6Requests[0]!;
    assert.equal(request.kind === "stage.requested" && request.idempotencyKey, `stage-request:${workflowId}:A6:1`);
    assert.equal(request.kind === "stage.requested" && request.requestDigest, proposalSha, "requestDigest=方案依据 hash（应用计算）");
    assert.equal(request.kind === "stage.requested" && request.requestTaskId, `proposal-card:${FLOW}:${proposalSha.slice(0, 12)}`);
    assert.equal(request.kind === "stage.requested" && request.fromStage, "A5");
    const created = (await readTaskState(root)).events.find((event) => event.kind === "request.created" && event.cardKind === "proposal");
    assert.ok(created !== undefined && created.kind === "request.created");
    if (created !== undefined && created.kind === "request.created") {
      assert.equal(created.workflowId, workflowId);
      assert.equal(created.stage, "A6");
    }
    const view = await viewOf(root, workflowId);
    assert.equal(view.stages.A6.status, "completed", "客户 accept 后 stage.completed A6 合法");
    // 重复标记幂等由 helper 直测（见下一用例）：同一幂等键只写一条。
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("G-B5-3：窗口不符/无活动 workflow 不写 marker；helper 重复调用幂等", async () => {
  // 无活动 workflow：fixed 项目但该 flow 无 workflow.started ⇒ 不写任何 A6 marker（不伪造卡）。
  {
    const root = await tempRoot("ans-b51-a6-nowf-");
    const h = harness(root, () => ({ outcome: "declined", reason: "test" }));
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
      await seedFiveDocs(root);
      const chief = await openRole(h, root, "chief");
      const outcome = await chief.customerInput!(PROPOSAL_CARD);
      assert.equal(outcome?.outcome, "declined");
      assert.equal((await readWorkflowLedger(root)).events.length, 0, "无活动 workflow 不写 A6 marker");
      const created = (await readTaskState(root)).events.find((event) => event.kind === "request.created" && event.cardKind === "proposal");
      assert.ok(created !== undefined && created.kind === "request.created");
      if (created !== undefined && created.kind === "request.created") {
        assert.equal(created.workflowId, undefined, "无活动 workflow 时不伪造 workflowId 戳");
      }
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 窗口不符（A3 已完成 ⇒ 非 A5→A6 窗口）：不写 marker。
  {
    const root = await tempRoot("ans-b51-a6-window-");
    const h = harness(root, () => ({ outcome: "declined", reason: "test" }));
    const workflowId = "wf-b51a6window00000000000001";
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
      await seedA(root, workflowId, "A3", "completed");
      await seedFiveDocs(root);
      const chief = await openRole(h, root, "chief");
      await chief.customerInput!(PROPOSAL_CARD);
      assert.equal((await readWorkflowLedger(root)).events.filter((event) =>
        event.workflowId === workflowId && event.kind === "stage.requested" && event.stage === "A6").length, 0, "窗口不符不得写 marker");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // helper 幂等：A5 完成窗口重复调用只写一条（同幂等键 replay）。
  {
    const root = await tempRoot("ans-b51-a6-idem-");
    const workflowId = "wf-b51a6idem0000000000000001";
    try {
      await seedA(root, workflowId, "A5", "completed");
      const proposalSha = sha(PROPOSAL_TEXT);
      const first = await markFixedProposalCardRequested({ projectRoot: root, flowId: FLOW, workflowId, proposalSha256: proposalSha });
      assert.equal(first, undefined);
      const second = await markFixedProposalCardRequested({ projectRoot: root, flowId: FLOW, workflowId, proposalSha256: proposalSha });
      assert.equal(second, undefined);
      assert.equal((await readWorkflowLedger(root)).events.filter((event) =>
        event.workflowId === workflowId && event.kind === "stage.requested" && event.stage === "A6").length, 1, "重复 helper 不重复 marker");
    } finally {
      await cleanup(root);
    }
  }
});

// ══════════════════════════════ G-B5-2：B2 范围决定生产写入 ══════════════════════════════

const IMPACT_PATH = "docs/governance/rapporteur/snake-impact-v1.md";
const IMPACT_TEXT = "# 影响面\n\ncore 碰撞问题修复；涉及 src/core/snake.ts。\n";

async function seedPathBDocs(root: string): Promise<void> {
  await writeFile(root, "src/core/snake.ts", "export const SNAKE = 1;\n");
  await writeFile(root, "docs/governance/rapporteur/snake-impact-v1.md", IMPACT_TEXT);
  await seedFiveDocs(root);
}

test("G-B5-2：B3 stage-request 受理时应用记录 B2（影响面重算 + 候选路径派生写集）；B3 生产派发通过写集门", async () => {
  const root = await tempRoot("ans-b51-b2-scope-");
  const h = harness(root);
  const workflowId = "wf-b51b2scope0000000000000001";
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    initRepo(root);
    await seedPathBDocs(root);
    const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    commitAll(root, "baseline");
    // 路径 B basis（真实链条在 B1 生产派发时由应用记录；B3 生产派发前置复核 basis 不漂移）。
    const basis: BasisEvent = {
      v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
      idempotencyKey: `path-b:${workflowId}:seed`, basisId: `bas-${workflowId}`, workflowId, flowId: FLOW,
      documents: [], teamPlan: null,
      repo: { state: "existing", branch: taskBranchName(workflowId), baseOid: null, ignorePolicy: "ans-v1", gitignoreSha256: ensured.sha256 },
      reviewRoleId: "verifier", operationId: `path-b:${workflowId}`, reason: "path-b", recordedBy: "application",
    };
    const basisAppended = await appendBasisEvent(root, basis);
    assert.equal(basisAppended.ok, true, basisAppended.ok === false ? basisAppended.message : "");
    // B1 已完成；B1 stage-request（已收口）与 B1 生产任务（done 报告 = 影响面报告）。
    await seedStarted(root, workflowId, "B");
    await appendEvents(root, [requested(workflowId, "B1", 1, BASE_B), completed(workflowId, "B1", BASE_B)]);
    await seedTask(root, {
      taskId: "t-b1-sr", from: "chief", to: "convener", workflowId, flowId: FLOW,
      stage: "B1", taskKind: "stage-request", closed: "accepted",
    });
    await seedTask(root, {
      taskId: "t-b1-prod", from: "convener", to: "rapporteur", workflowId, flowId: FLOW,
      stage: "B1", doneEvidence: [IMPACT_PATH], closed: "accepted",
    });
    await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b3" });
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 B3：修复 core 碰撞", flowId: FLOW, workflowId,
      taskKind: "stage-request", stage: "B3", sideEffect: "read-only",
      requestedEvidence: ["src/core/snake.ts"],
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const ledger = await readWorkflowLedger(root);
    const scope = ledger.events.find((event) => event.workflowId === workflowId && event.kind === "change.scope-decided");
    assert.ok(scope !== undefined && scope.kind === "change.scope-decided", "应写 change.scope-decided（B2 完成）");
    if (scope !== undefined && scope.kind === "change.scope-decided") {
      assert.equal(scope.impactReport.path, IMPACT_PATH, "影响面路径来自 B1 任务 done 报告 evidence（应用记录）");
      assert.equal(scope.impactReport.sha256, sha(IMPACT_TEXT), "影响面字节 hash 由应用重算");
      assert.deepEqual(scope.scope.files, ["src/core/snake.ts"], "候选路径来自 B3 stage-request requestedEvidence（应用派生属主）");
      assert.deepEqual(scope.effectiveWritesets, [{ roleId: "worker", paths: ["src/core/snake.ts"] }]);
      assert.equal(scope.decidedBy, "chief");
      assert.equal(scope.requestTaskId, "t-b1-sr", "审计绑定 = B1 stage-request 任务");
    }
    const view = await viewOf(root, workflowId);
    assert.equal(view.stages.B2.status, "completed", "B2 完成于 change.scope-decided");
    assert.equal(ledger.events.some((event) => event.workflowId === workflowId && event.kind === "stage.requested" && event.stage === "B3"), true);
    // 幂等：同 scope 再记录 ⇒ replay，不重复事件。
    const replay = await recordFixedPathBScopeDecisionForDispatch({
      projectRoot: root, flowId: FLOW, workflowId, candidateFiles: ["src/core/snake.ts"],
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);
    assert.equal((await readWorkflowLedger(root)).events.filter((event) =>
      event.workflowId === workflowId && event.kind === "change.scope-decided").length, 1);
    // B3 生产派发：写集门用 B2 派生写集放行。
    const b3Request = [...(await readTaskState(root)).records.values()].find((record) =>
      record.created?.workflowId === workflowId && record.created.stage === "B3" && record.created.taskKind === "stage-request");
    assert.ok(b3Request?.created);
    await openRole(h, root, "convener");
    const convenerLive = liveSource(h.mgr, root, "convener", { taskId: b3Request!.taskId });
    const impl = await routeDispatch(h.mgr, root, "convener", {
      roleId: "worker", task: "修复 core 碰撞逻辑", flowId: FLOW, workflowId, stage: "B3",
      sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(impl.ok, true, impl.message ?? "");
    // 注：本用例预置了 path-b basis（真实链条在 B1 生产派发时由应用记录），B3 前置准备 no-op；
    // 分支创建/切换由 b3-fixed-baseline-pathb 覆盖，此处只验证 B2 派生写集放行 B3 派发。
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("G-B5-2：候选路径缺省时从 B1 生产任务 modulePaths 派生；B2 窗口/路径守卫", async () => {
  // 候选来自 B1 生产任务 modulePaths（stage-request 未给 requestedEvidence）。
  {
    const root = await tempRoot("ans-b51-b2-modules-");
    const h = harness(root);
    const workflowId = "wf-b51b2modules000000000000001";
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
      await seedPathBDocs(root);
      await seedStarted(root, workflowId, "B");
      await appendEvents(root, [requested(workflowId, "B1", 1, BASE_B), completed(workflowId, "B1", BASE_B)]);
      await seedTask(root, {
        taskId: "t-b1-sr", from: "chief", to: "convener", workflowId, flowId: FLOW,
        stage: "B1", taskKind: "stage-request", closed: "accepted",
      });
      await seedTask(root, {
        taskId: "t-b1-prod", from: "convener", to: "rapporteur", workflowId, flowId: FLOW,
        stage: "B1", modulePaths: ["src/core/snake.ts"], doneEvidence: [IMPACT_PATH], closed: "accepted",
      });
      const outcome = await recordFixedPathBScopeDecisionForDispatch({ projectRoot: root, flowId: FLOW, workflowId });
      assert.equal(outcome.ok, true, outcome.ok === false ? `${outcome.code}: ${outcome.message}` : "");
      if (outcome.ok) {
        assert.deepEqual(outcome.writesets, [{ roleId: "worker", paths: ["src/core/snake.ts"] }]);
      }
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 非 B 路径：不写、不阻断（返回 recorded:false）。
  {
    const root = await tempRoot("ans-b51-b2-patha-");
    const workflowId = "wf-b51b2patha0000000000000001";
    try {
      await seedA(root, workflowId, "A1", "requested");
      const outcome = await recordFixedPathBScopeDecisionForDispatch({ projectRoot: root, flowId: FLOW, workflowId });
      assert.equal(outcome.ok, true);
      if (outcome.ok) assert.equal(outcome.recorded, false);
      assert.equal((await readWorkflowLedger(root)).events.some((event) => event.kind === "change.scope-decided"), false);
    } finally {
      await cleanup(root);
    }
  }
  // B2 窗口外（B1 未完成）：fail-closed stage-transition-invalid。
  {
    const root = await tempRoot("ans-b51-b2-window-");
    const workflowId = "wf-b51b2window0000000000000001";
    try {
      await seedStarted(root, workflowId, "B");
      await appendEvents(root, [requested(workflowId, "B1", 1, BASE_B)]);
      const outcome = await recordFixedPathBScopeDecisionForDispatch({ projectRoot: root, flowId: FLOW, workflowId });
      assert.equal(outcome.ok, false);
      if (!outcome.ok) assert.equal(outcome.code, "stage-transition-invalid");
    } finally {
      await cleanup(root);
    }
  }
});

test("G-B5-2：无影响面报告/无候选路径 ⇒ b-change-scope-invalid，B3 请求不受理、无任务（fail-closed）", async () => {
  // 无候选路径（B1 任务无 modulePaths，stage-request 无 requestedEvidence）。
  {
    const root = await tempRoot("ans-b51-b2-nocand-");
    const h = harness(root);
    const workflowId = "wf-b51b2nocand0000000000000001";
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
      await seedPathBDocs(root);
      await seedStarted(root, workflowId, "B");
      await appendEvents(root, [requested(workflowId, "B1", 1, BASE_B), completed(workflowId, "B1", BASE_B)]);
      await seedTask(root, { taskId: "t-b1-sr", from: "chief", to: "convener", workflowId, flowId: FLOW, stage: "B1", taskKind: "stage-request", closed: "accepted" });
      await seedTask(root, { taskId: "t-b1-prod", from: "convener", to: "rapporteur", workflowId, flowId: FLOW, stage: "B1", doneEvidence: [IMPACT_PATH], closed: "accepted" });
      await openRole(h, root, "chief");
      const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b3" });
      const receipt = await routeDispatch(h.mgr, root, "chief", {
        roleId: "convener", task: "推进 B3", flowId: FLOW, workflowId,
        taskKind: "stage-request", stage: "B3", sideEffect: "read-only",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false, "无候选路径不得受理 B3 请求");
      assert.match(receipt.message ?? "", /b-change-scope-invalid/);
      const ledger = await readWorkflowLedger(root);
      assert.equal(ledger.events.some((event) => event.workflowId === workflowId && event.kind === "change.scope-decided"), false);
      assert.equal(ledger.events.some((event) => event.workflowId === workflowId && event.kind === "stage.requested" && event.stage === "B3"), false);
      assert.equal([...(await readTaskState(root)).records.values()].some((record) => record.created?.stage === "B3"), false, "拒绝先于 task.created");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 无影响面报告（B1 任务无 done 报告 evidence、无可读 requestedEvidence）。
  {
    const root = await tempRoot("ans-b51-b2-noimpact-");
    const workflowId = "wf-b51b2noimpact00000000000001";
    try {
      await seedStarted(root, workflowId, "B");
      await appendEvents(root, [requested(workflowId, "B1", 1, BASE_B), completed(workflowId, "B1", BASE_B)]);
      await seedTask(root, { taskId: "t-b1-sr", from: "chief", to: "convener", workflowId, flowId: FLOW, stage: "B1", taskKind: "stage-request", closed: "accepted" });
      await seedTask(root, { taskId: "t-b1-prod", from: "convener", to: "rapporteur", workflowId, flowId: FLOW, stage: "B1", modulePaths: ["src/core/"], closed: "accepted" });
      const outcome = await recordFixedPathBScopeDecisionForDispatch({ projectRoot: root, flowId: FLOW, workflowId });
      assert.equal(outcome.ok, false);
      if (!outcome.ok) {
        assert.equal(outcome.code, "b-change-scope-invalid");
        assert.match(outcome.message, /影响面/);
      }
    } finally {
      await cleanup(root);
    }
  }
});

// test/桌面应用/app-dispatch-delivery.test.ts
// 2026-11-17（v2.2 第一步测试批 T2，测试角色）：**app-dispatch/v1 桌面投递 / 报告观察 / 卡 prompt 全链**。
//
// 依据：`角色卡/桌面窗口/docs/change/2026-11-17_change_app-dispatch-builtins-desktop.md`
// §一.3（投递桥/驱动钩子/收口）/§二（接线图）/§六（待测试批 4–10）；设计 §4.2/§4.3/§五/§七。
// 覆盖：
//   1. `select_workflow` 真实轮次捕获（无 live turn ⇒ stage-request-source-missing）；首阶段任务投递
//      （taskId + forcedWorkflowMode:"fixed"、starTaskIds/taskCreators=application）、幂等重放；
//      目标会话忙时只入队不打断、释放后补投递；
//   2. application 报告只落 `task.reported`、不路由角色、由应用自动收口并推进下一阶段；
//   3. 三卡 promptId 全链：request_choice 匹配 ⇒ 发卡一次（request.created 不重复）、裁决后 prompt 任务
//      应用收口 + 下一阶段投递；选项不一致/已收口 ⇒ notPresented（card-prompt-mismatch 语义，不发卡）；
//   4. A12b done ⇒ 应用归档 + A12 聚合 + A13 任务；标准 blocked ⇒ rework A12b→A11（新 attempt）；
//      light blocked ⇒ accept-with-archive（B31）；
//   5. A13 汇总 done ⇒ 汇总任务应用收口、**不写阶段完成**、发布前置不足不弹 merge-main（release-or-close）；
//   6. 运营 worker 派发：绑定自身 open worker-dispatch ⇒ 项目 worker 任务创建；内置目标 ⇒
//      convener-builtin-dispatch-forbidden；未绑定 ⇒ worker-dispatch-required；
//   7. 启动对账：已报告未收口幂等收口、未送达应用任务补投递；fixed-v2.1 旧协议不触碰。
//
// 夹具：真实 SessionManager + 假 openRoleSession/客户作答；临时目录/真实账本；不启动 Electron/模型/网络；
// 不占端口、不读 .env。Git/merge-main 的真实合并由 `fixed-path-full-chain`（app-dispatch 全链）覆盖。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { MERGE_MAIN_CARD_KIND } from "../../app/desktop/customer-input.ts";
import { taskCreators } from "../../app/desktop/session/shared/tasks-store.ts";
import {
  driveAppDispatchStage,
  readReleaseLedger,
  readWorkflowLedger,
  requestStage,
  selectWorkflow,
  stageExecutionIdempotencyKey,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendTaskEvent, readTaskState, taskEvent, type TaskRecord } from "../../src/common/编排/task-state.ts";
import { WORKFLOW_LEDGER_SCHEMA, type CustomerInputOutcome, type CustomerInputRequest, type WorkflowEvent, type WorkflowStage } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const AT = "2026-11-18T02:00:00.000Z";
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

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
  workflowMode?: "fixed" | "legacy";
  workflowProtocol?: string;
  selectWorkflow?: (input: { workflowPath: "A" | "B"; flowId: string; acceptanceStrength?: "light" | "standard" }, signal?: AbortSignal) => Promise<unknown>;
  afterFixedStageAction?: (input: { projectRoot: string; workflowId: string; action: "activate-role-documents" }) => void;
  customerInput?: (request: CustomerInputRequest, metadata?: unknown) => Promise<CustomerInputOutcome | null | undefined>;
  closeCreatedTaskFixed?: (input: { operationId: string; taskId: string; outcome: "accepted" | "rework" | "rejected"; note?: string }, signal?: AbortSignal) => Promise<unknown>;
  completeTeamPlan?: (input: unknown, signal?: AbortSignal) => Promise<unknown>;
  [key: string]: unknown;
}

interface H {
  mgr: SessionManager;
  inputs: CapturedInput[];
  requests: CustomerInputRequest[];
  sent: Record<string, string[]>;
  script: (request: CustomerInputRequest) => CustomerInputOutcome;
}

function harness(root: string, script?: (request: CustomerInputRequest) => CustomerInputOutcome): H {
  const inputs: CapturedInput[] = [];
  const requests: CustomerInputRequest[] = [];
  const sent: Record<string, string[]> = {};
  const state = { inputs, requests, sent, script: script ?? ((request: CustomerInputRequest): CustomerInputOutcome => {
    if (request.cardKind === "intent-confirm") return { outcome: "answered", value: { selected: ["confirm"] } };
    if (request.cardKind === "proposal") return { outcome: "answered", value: { selected: ["accept"] } };
    if (request.cardKind === "appointment") return { outcome: "answered", value: { selected: ["worker"] } };
    if (request.cardKind === MERGE_MAIN_CARD_KIND) return { outcome: "answered", value: { selected: ["approve"] } };
    return { outcome: "declined", reason: `unexpected-card:${String(request.cardKind)}` };
  }) } as H;
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
  origin: { settled: boolean; turnId?: string; taskId?: string };
}

function liveSource(mgr: SessionManager, root: string, roleId: string, overrides: Partial<LiveSource["origin"]> = {}): LiveSource {
  const manager = mgr as unknown as {
    sessionKey(projectRoot: string, roleId: string, runtime: string): string;
    sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
  };
  const entry = manager.sessions.get(manager.sessionKey(root, roleId, "demo"));
  assert.ok(entry, `会话条目应存在：${roleId}`);
  const origin = { settled: false, ...overrides };
  (entry as { busy: boolean }).busy = true;
  (entry as { origins: { running?: unknown } }).origins.running = origin;
  return { entry, origin };
}
function releaseSource(mgr: SessionManager, source: LiveSource): void {
  const entry = source.entry as { busy: boolean; origins: { running?: unknown } };
  entry.busy = false;
  if (entry.origins.running === source.origin) delete entry.origins.running;
}
function setBusy(mgr: SessionManager, root: string, roleId: string, busy: boolean): void {
  const manager = mgr as unknown as {
    sessionKey(projectRoot: string, roleId: string, runtime: string): string;
    sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
  };
  const entry = manager.sessions.get(manager.sessionKey(root, roleId, "demo"));
  assert.ok(entry, `会话条目应存在：${roleId}`);
  entry.busy = busy;
  if (busy) entry.origins.running = { settled: false, turnId: `turn-${roleId}-busy` };
  else delete entry.origins.running;
}
function queuesOf(mgr: SessionManager): Map<string, Array<{ taskId?: string; dedupKey: string; targetRoleId: string }>> {
  return (mgr as unknown as { deliveryQueues: Map<string, Array<{ taskId?: string; dedupKey: string; targetRoleId: string }>> }).deliveryQueues;
}

async function tempRoot(prefix: string): Promise<string> {
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

async function openRole(h: H, root: string, roleId: string, taskId?: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo", ...(taskId !== undefined ? { taskId } : {}) });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "会话打开失败") : "");
  const candidates = h.inputs.filter((input) => input.roleId === roleId
    && (taskId === undefined || input.taskId === taskId));
  const input = candidates[candidates.length - 1];
  assert.ok(input, `应捕获 ${roleId} 的 openRoleSession 入参`);
  return input!;
}

async function eventsOf(root: string, workflowId: string): Promise<WorkflowEvent[]> {
  const ledger = await readWorkflowLedger(root);
  return ledger.events.filter((event) => event.workflowId === workflowId);
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
  assert.ok(record !== undefined, `应存在 ${workflowId}/${stage} 任务`);
  return record!;
}

/** 生产回交路径：任务绑定报告（application 任务只落 task.reported 并由应用观察收口）。 */
async function submitReport(
  h: H,
  root: string,
  roleId: string,
  taskId: string,
  status: "completed" | "blocked" | "failed",
  summary: string,
  evidence: string[] = [],
): Promise<boolean> {
  const manager = h.mgr as unknown as {
    commitHandback(
      projectRoot: string, runtime: string,
      hb: { roleId: string; taskId: string; status: string; summary: string; evidence: string[]; at: string },
    ): Promise<boolean>;
  };
  return manager.commitHandback(root, "demo", { roleId, taskId, status, summary, evidence, at: AT });
}

async function seedCompleted(root: string, workflowId: string, stages: readonly WorkflowStage[], pathAB: "A" | "B" = "A"): Promise<void> {
  const at = new Date(AT).toISOString();
  for (const stage of stages) {
    const requested = await (await import("../../src/common/编排/workflow-service.ts")).appendWorkflowEvent(root, {
      v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
      workflowId, flowId: FLOW, path: pathAB,
      idempotencyKey: `seed-request:${workflowId}:${stage}`,
      stage, requestTaskId: `seed-task:${stage}`, requestDigest: sha(`seed-${stage}`), attempt: 1,
    });
    assert.equal(requested.ok, true, requested.ok === false ? requested.message : "");
    const completed = await (await import("../../src/common/编排/workflow-service.ts")).appendWorkflowEvent(root, {
      v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
      workflowId, flowId: FLOW, path: pathAB,
      idempotencyKey: `seed-complete:${workflowId}:${stage}`,
      stage, cause: { kind: "task-closed", ref: `seed-task:${stage}` }, artifacts: [],
    });
    assert.equal(completed.ok, true, completed.ok === false ? completed.message : "");
  }
}

// —————————————— 1) select_workflow + 应用任务投递 ——————————————

test("select_workflow：真实轮次捕获/缺失拒绝；首阶段任务投递 taskId+forced fixed、star/creator=application；忙时入队不打断", async () => {
  const root = await tempRoot("ans-delivery-select-");
  const h = harness(root);
  try {
    const chief = await openRole(h, root, "chief");
    assert.equal(chief.workflowMode, "fixed", "空项目幕僚聊天为 fixed");
    assert.equal(chief.workflowProtocol, "app-dispatch/v1", "无 workflow 的新项目 = 新协议");
    assert.equal(typeof chief.selectWorkflow, "function", "幕僚会话注入 select_workflow 能力");
    // 工具面收窄在 run-role 层完成（见 app-dispatch-tool-surface.test.ts）；宿主入参可能仍携带
    // dispatchTask 能力位，run-role 对 app-dispatch 幕僚结构性不注入。

    // 无 live turn：host 捕获不到 sourceTaskId ⇒ 不启动（不伪造轮次）。
    const missing = await chief.selectWorkflow!({ workflowPath: "A", flowId: FLOW }) as { ok: boolean; code?: string };
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "stage-request-source-missing");
    assert.equal((await readWorkflowLedger(root)).events.length, 0, "拒绝不得写 workflow.started");

    // 真实轮次：host 捕获 turnId 作为 sourceTaskId。
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-customer-1" });
    const selected = await chief.selectWorkflow!({ workflowPath: "A", flowId: FLOW }) as {
      ok: boolean; workflowId: string; stage: string; taskIds: string[];
    };
    releaseSource(h.mgr, live);
    assert.equal(selected.ok, true, JSON.stringify(selected));
    assert.equal(selected.stage, "A1");
    const WF = selected.workflowId;
    assert.match(WF, /^wf-[a-f0-9]{24}$/);
    const started = (await eventsOf(root, WF)).find((event) => event.kind === "workflow.started");
    assert.ok(started !== undefined && started.kind === "workflow.started");
    assert.equal(started!.protocol, "app-dispatch/v1");
    assert.equal(started!.sourceTaskId, "turn-customer-1", "sourceTaskId = host 捕获的真实轮次（不可模型自报）");
    assert.equal(started!.definition?.id, "add");

    // 首阶段 A1 创建即完成；advance 续驱 A2。两任务都投递给 product，携带 taskId + forced fixed。
    const state = await readTaskState(root);
    const a1 = await taskOf(root, WF, "A1", "product");
    const a2 = await taskOf(root, WF, "A2", "product");
    for (const record of [a1, a2]) {
      assert.equal(record.created?.from, "application");
      assert.equal(taskCreators.get(record.taskId), "application", "应用任务登记 taskCreators=application");
      const manager = h.mgr as unknown as { starTaskIds: Set<string> };
      assert.equal(manager.starTaskIds.has(record.taskId), true, "应用任务登记 starTaskIds");
      const opened = h.inputs.filter((input) => input.roleId === "product" && input.taskId === record.taskId).at(-1);
      if (opened === undefined) {
        // 目标会话仍在占用（上一任务回合未落定）⇒ 投递进队列（忙时只入队，不打断）；不得静默丢。
        const queued = [...queuesOf(h.mgr).values()].flat().some((item) => item.taskId === record.taskId);
        assert.equal(queued, true, `应用任务 ${record.taskId} 应已投递或入队（不静默丢）`);
        continue;
      }
      assert.equal(opened!.workflowMode, "fixed", "forcedWorkflowMode=fixed");
      assert.equal(opened!.workflowProtocol, "app-dispatch/v1", "目标会话按任务 workflow 解析新协议");
      assert.equal(opened!.workflowModeForFlow !== undefined, true);
    }
    assert.equal(state.records.size, 2, "A1/A2 恰好两任务（无 stage-request）");

    // 幂等重放：同一真实轮次再选 ⇒ 同 workflowId、不重写 workflow.started。
    const live2 = liveSource(h.mgr, root, "chief", { turnId: "turn-customer-1" });
    const replay = await chief.selectWorkflow!({ workflowPath: "A", flowId: FLOW }) as { ok: boolean; workflowId: string };
    releaseSource(h.mgr, live2);
    assert.equal(replay.ok, true);
    assert.equal(replay.workflowId, WF);
    assert.equal((await eventsOf(root, WF)).filter((event) => event.kind === "workflow.started").length, 1);

    // 忙时入队：目标会话（product）忙 + 有在跑轮次 ⇒ 不重开会话、不打断；队列保留投递，释放后补投。
    await openRole(h, root, "product");
    setBusy(h.mgr, root, "product", true);
    const productOpensBefore = h.inputs.filter((input) => input.roleId === "product" && input.taskId === a2.taskId).length;
    const driven = await driveAppDispatchStage({ projectRoot: root, workflowId: WF, stage: "A2" });
    assert.equal(driven.ok, true);
    assert.equal(h.inputs.filter((input) => input.roleId === "product" && input.taskId === a2.taskId).length, productOpensBefore,
      "忙时不得重开 product 会话（只入队）");
    const queues = queuesOf(h.mgr);
    const queuedForA2 = [...queues.values()].flat().filter((item) => item.taskId === a2.taskId);
    assert.equal(queuedForA2.length >= 1, true, "忙时投递必须入队（不静默丢）");
    assert.equal(queuedForA2.every((item) => item.targetRoleId === "product"), true);
    assert.equal(queuedForA2.every((item) => item.dedupKey.includes(a2.taskId)), true, "去重键含 taskId（幂等抑制重复投递）");
    // 释放后补投递（reconcile 重投 + drain 发送）。
    setBusy(h.mgr, root, "product", false);
    const summary = await h.mgr.reconcileAppDispatch(root);
    assert.equal(summary.activeWorkflows >= 1, true);
    assert.equal((h.sent.product ?? []).length >= 1, true, "释放忙后补投递应真实发送");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 2) application 报告路由 + 卡 prompt ——————————————

test("application 报告只落 task.reported、不路由角色、自动收口推进；三卡 promptId：匹配发卡一次/不一致不发卡/已收口拒重呈", async () => {
  const root = await tempRoot("ans-delivery-report-");
  const h = harness(root);
  try {
    const chief = await openRole(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-customer-1" });
    const selected = await chief.selectWorkflow!({ workflowPath: "A", flowId: FLOW }) as { ok: boolean; workflowId: string };
    releaseSource(h.mgr, live);
    assert.equal(selected.ok, true);
    const WF = selected.workflowId;
    const a2 = await taskOf(root, WF, "A2", "product");

    // 产品报告（生产回交路径）⇒ 只落 task.reported；应用观察收口 A2 并推进 A3；不唤醒第二角色。
    await writeIntent(root);
    for (const key of Object.keys(h.sent)) delete h.sent[key];
    const committed = await submitReport(h, root, "product", a2.taskId, "completed", "意图完成", ["docs/product/snake-intent-v1.md"]);
    assert.equal(committed, true, "回交必须被受理");
    const reports = (await readTaskState(root)).records.get(a2.taskId)?.reports ?? [];
    assert.equal(reports.length, 1);
    assert.equal(reports[0]!.status, "done");
    assert.equal(reports[0]!.from, "product");
    assert.equal((await readTaskState(root)).records.get(a2.taskId)?.closed?.by, "application", "应用观察后以真实创建者收口");
    assert.equal((await viewOf(root, WF)).stages.A2.status, "completed");
    assert.equal((h.sent.product ?? []).length, 0, "application 任务报告不路由回角色（reportTarget=null；不唤醒第二角色）");
    for (const message of h.sent.chief ?? []) {
      assert.match(message, /^\[派发\] 来自 application 的任务/, "幕僚只收到应用卡 prompt 任务投递，不是回交路由");
    }
    assert.equal(h.requests.length, 0, "报告不发放客户卡");

    // A3 卡 prompt 已投递给幕僚（card-prompt 任务，taskId 绑定）。
    const promptTask = await taskOf(root, WF, "A3", "chief");
    assert.equal(promptTask.created?.taskKind, "card-prompt");
    const promptId = promptTask.created!.promptId!;
    const chiefPromptInput = await openRole(h, root, "chief", promptTask.taskId);
    assert.equal(typeof chiefPromptInput.customerInput, "function");
    const requestRow = (await readTaskState(root)).events.find((event) =>
      event.kind === "request.created" && event.promptId === promptId) as Extract<ReturnType<typeof taskEvent>, { kind: "request.created" }> | undefined;
    assert.ok(requestRow !== undefined && requestRow.kind === "request.created");
    const options = requestRow!.options.map((option) => ({ ...option }));

    // 不一致（选项顺序颠倒）⇒ notPresented（不发卡、不写 request.created、不完成 A3）。
    const requestCreatedCount = (await readTaskState(root)).events.filter((event) => event.kind === "request.created").length;
    const mismatch = await chiefPromptInput.customerInput!({
      kind: "choice", title: "确认产品意图", cardKind: "intent-confirm", promptId, flowId: FLOW,
      options: [...options].reverse(),
    });
    assert.equal(mismatch?.outcome, "declined");
    assert.equal((mismatch as { notPresented?: boolean }).notPresented, true);
    assert.match((mismatch as { reason?: string }).reason ?? "", /card-prompt-mismatch/);
    assert.equal((await readTaskState(root)).events.filter((event) => event.kind === "request.created").length, requestCreatedCount, "不一致不得写 request.created");
    assert.equal((await viewOf(root, WF)).stages.A3.status, "dispatched", "卡 prompt 任务已派发，等待客户裁决");

    // 匹配 ⇒ 发卡一次（request.created 复用应用发放记录，不重复写），客户 confirm ⇒ A3 completed、prompt 任务应用收口、推进 A4/A5。
    const answered = await chiefPromptInput.customerInput!({
      kind: "choice", title: "确认产品意图", cardKind: "intent-confirm", promptId, flowId: FLOW,
      options,
    });
    assert.equal(answered?.outcome, "answered");
    assert.equal((await readTaskState(root)).events.filter((event) => event.kind === "request.created").length, requestCreatedCount, "request.created 不重复写");
    assert.equal(h.requests.length, 1, "客户卡恰呈现一次");
    const resolved = (await readTaskState(root)).events.find((event) =>
      event.kind === "request.resolved" && event.requestId === promptId);
    assert.ok(resolved !== undefined && resolved.kind === "request.resolved");
    assert.equal(resolved!.by, "customer");
    assert.equal((await viewOf(root, WF)).stages.A3.status, "completed");
    const closedPrompt = (await readTaskState(root)).records.get(promptTask.taskId)?.closed;
    assert.equal(closedPrompt?.by, "application", "卡裁决后 prompt 任务由应用收口");
    // 推进：A4 创建即完成，A5 任务投递 rapporteur。
    const a5 = await taskOf(root, WF, "A5", "rapporteur");
    assert.equal(a5.created?.from, "application");
    const openedA5 = h.inputs.filter((input) => input.roleId === "rapporteur" && input.taskId === a5.taskId).at(-1);
    const queuedA5 = [...queuesOf(h.mgr).values()].flat().some((item) => item.taskId === a5.taskId);
    assert.equal(openedA5 !== undefined || queuedA5, true, "下一阶段任务应投递或入队（忙时只入队，不静默丢）");

    // 已收口 prompt 再次呈卡 ⇒ notPresented（不重复发卡）。
    const again = await chiefPromptInput.customerInput!({
      kind: "choice", title: "确认产品意图", cardKind: "intent-confirm", promptId, flowId: FLOW,
      options,
    });
    assert.equal(again?.outcome, "declined");
    assert.equal((again as { notPresented?: boolean }).notPresented, true);
    assert.match((again as { reason?: string }).reason ?? "", /card-prompt-mismatch/);
    assert.equal(h.requests.length, 1, "已收口 prompt 不得重呈");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 3) A12b / A13 收口语义 ——————————————

test("A12b done ⇒ 应用归档 + A12 聚合 + A13 任务；标准 blocked ⇒ rework A12b→A11（新 attempt）；light blocked ⇒ accept-with-archive", async () => {
  // ——— A12b done ———
  {
    const root = await tempRoot("ans-delivery-a12b-done-");
    const h = harness(root);
    try {
      const selected = await selectWorkflow({ projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-1" });
      assert.equal(selected.ok, true);
      const WF = selected.workflowId;
      await seedCompleted(root, WF, ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"]);
      // 打开治理会话登记 runtime，随后启动对账（应用驱动 + 投递）。
      await openRole(h, root, "chief");
      const summary = await h.mgr.reconcileAppDispatch(root);
      assert.equal(summary.corrupt.length, 0, summary.corrupt.join(";"));
      assert.equal(summary.errors.length, 0, summary.errors.join(";"));
      const a12b = await taskOf(root, WF, "A12b", "verifier");
      const opened = h.inputs.filter((input) => input.roleId === "verifier" && input.taskId === a12b.taskId).at(-1);
      assert.ok(opened !== undefined, "A12b 应投递 verifier");
      await writeFile(root, "docs/quality/snake-criteria-v1.md", "# 验收标准\n- AC-1\n");
      await writeFile(root, "docs/quality/snake-report-v1.md", "# 验收报告\n结论：通过\n");
      const committed = await submitReport(h, root, "verifier", a12b.taskId, "completed", "独立验收通过", ["docs/quality/snake-report-v1.md"]);
      assert.equal(committed, true);
      // 应用归档 + A12b accepted + A12 聚合完成。
      const accepted = (await readTaskState(root)).records.get(a12b.taskId)?.closed;
      assert.equal(accepted?.by, "application");
      assert.equal(accepted?.outcome, "accepted");
      const archive = await fs.readFile(path.join(root, "docs", "acceptance", "snake-acceptance-v1.md"), "utf8").catch(() => undefined);
      assert.ok(archive !== undefined, "A12b done ⇒ 应用生成 docs/acceptance 归档");
      assert.match(archive!, new RegExp(`workflowId: ${WF}`));
      const view = await viewOf(root, WF);
      assert.equal(view.stages.A12b.status, "completed");
      assert.equal(view.stages.A12.status, "completed", "A12 聚合完成");
      // 推进 A13：汇总任务投递 convener。
      const a13 = await taskOf(root, WF, "A13", "convener");
      assert.equal(a13.created?.from, "application");
      assert.ok(h.inputs.some((input) => input.roleId === "convener" && input.taskId === a13.taskId), "A13 汇总任务应投递运营");
      // A13 报告 done ⇒ 汇总任务应用收口、不写阶段完成、发布前置不足（无 basis/Git）不弹 merge-main。
      await writeFile(root, "docs/scheduling/snake-integration-v1.md", "# 集成汇总\n");
      const committedA13 = await submitReport(h, root, "convener", a13.taskId, "completed", "汇总完成", ["docs/scheduling/snake-integration-v1.md"]);
      assert.equal(committedA13, true);
      const a13Closed = (await readTaskState(root)).records.get(a13.taskId)?.closed;
      assert.equal(a13Closed?.by, "application");
      assert.equal(a13Closed?.outcome, "accepted");
      assert.equal((await viewOf(root, WF)).stages.A13.status !== "completed", true, "release-or-close：报告/收口不完成 A13");
      assert.equal(h.requests.filter((request) => request.cardKind === MERGE_MAIN_CARD_KIND).length, 0, "发布前置不足不得弹 merge-main 卡");
      assert.equal((await readReleaseLedger(root)).events.length, 0, "不伪造 release");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // ——— 标准验收 blocked ⇒ rework ———
  {
    const root = await tempRoot("ans-delivery-a12b-rework-");
    const h = harness(root);
    try {
      const selected = await selectWorkflow({ projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-2" });
      assert.equal(selected.ok, true);
      const WF = selected.workflowId;
      await seedCompleted(root, WF, ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"]);
      await openRole(h, root, "chief");
      await h.mgr.reconcileAppDispatch(root);
      const a12b = await taskOf(root, WF, "A12b", "verifier");
      const committed = await submitReport(h, root, "verifier", a12b.taskId, "blocked", "验收不通过（标准）");
      assert.equal(committed, true);
      const reworked = (await eventsOf(root, WF)).find((event) => event.kind === "stage.reworked");
      assert.ok(reworked !== undefined && reworked.kind === "stage.reworked");
      assert.equal(reworked!.reworkOf, "A12b");
      assert.equal(reworked!.stage, "A11");
      assert.equal(reworked!.attempt, 2);
      // rework 后推进 A11 新 attempt（worker-dispatch）并投递运营。
      const a11 = await taskOf(root, WF, "A11", "convener");
      assert.equal(a11.created?.idempotencyKey, `worker-dispatch:${WF}:A11:2`);
      assert.ok(h.inputs.some((input) => input.roleId === "convener" && input.taskId === a11.taskId), "rework 后 A11 新 attempt 应投递");
      assert.equal(h.requests.length, 0, "rework 不弹客户卡");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // ——— 轻量验收 blocked + 归档 ⇒ accept-with-archive ———
  {
    const root = await tempRoot("ans-delivery-a12b-light-");
    const h = harness(root);
    try {
      const selected = await selectWorkflow({
        projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-3", acceptanceStrength: "light",
      });
      assert.equal(selected.ok, true);
      const WF = selected.workflowId;
      await seedCompleted(root, WF, ["A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11"]);
      await openRole(h, root, "chief");
      await h.mgr.reconcileAppDispatch(root);
      const a12b = await taskOf(root, WF, "A12b", "verifier");
      await writeFile(root, "docs/quality/snake-criteria-v1.md", "# 验收标准\n- AC-1\n");
      await writeFile(root, "docs/quality/snake-report-v1.md", "# 验收报告\nblocked：运行期未验证\n");
      const committed = await submitReport(h, root, "verifier", a12b.taskId, "blocked", "静态证据接受（运行期未验证）",
        ["docs/quality/snake-report-v1.md"]);
      assert.equal(committed, true);
      const closed = (await readTaskState(root)).records.get(a12b.taskId)?.closed;
      assert.equal(closed?.outcome, "accepted", "light blocked + 归档 ⇒ accepted（B31）");
      assert.match(closed?.note ?? "", /light acceptance|lightweight|静态/i);
      const view = await viewOf(root, WF);
      assert.equal(view.stages.A12b.status, "completed");
      assert.equal(view.stages.A12.status, "completed");
      const started = (await eventsOf(root, WF)).find((event) => event.kind === "workflow.started");
      assert.equal(started!.parameters?.acceptanceStrength, "light", "验收强度来自定义参数（select_workflow 可选携带）");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

// —————————————— 4) 运营 worker 派发（route） ——————————————

test("运营 worker 派发：绑定自身 open worker-dispatch ⇒ 项目 worker 任务创建；内置目标 ⇒ convener-builtin-dispatch-forbidden；未绑定 ⇒ worker-dispatch-required", async () => {
  const root = await tempRoot("ans-delivery-worker-");
  const h = harness(root);
  try {
    const selected = await selectWorkflow({ projectRoot: root, flowId: FLOW, workflowPath: "B", sourceTaskId: "turn-b1" });
    assert.equal(selected.ok, true);
    const WF = selected.workflowId;
    // 路径 B 要求既有 Git 仓库（按旧链同口径准备 main 基线）。
    const { execFileSync } = await import("node:child_process");
    execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "delivery-test"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "delivery@test.local"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root, stdio: "ignore" });
    await writeFile(root, "src/core/snake.ts", "export const SNAKE = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "base"], { cwd: root, stdio: "ignore" });
    const b1 = await taskOf(root, WF, "B1", "convener");
    assert.equal(b1.created?.taskKind, "worker-dispatch");
    // 投递后 convener 会话按任务绑定（taskId = worker-dispatch 任务）。
    const convener = await openRole(h, root, "convener", b1.taskId);
    const convenerLive = liveSource(h.mgr, root, "convener", { taskId: b1.taskId });
    const manager = h.mgr as unknown as {
      routeDispatch(projectRoot: string, runtime: "demo", fromRoleId: string, d: Record<string, unknown>, source?: unknown): Promise<{ ok: boolean; message?: string }>;
    };
    // 允许：项目 worker（moduleId/modulePaths 与 B1 阶段绑定）。
    const allowed = await manager.routeDispatch(root, "demo", "convener", {
      roleId: "worker", task: "B1 影响面分析", flowId: FLOW, workflowId: WF, stage: "B1",
      sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
    }, convenerLive);
    assert.equal(allowed.ok, true, allowed.message ?? "");
    const workerTask = (await readTaskState(root)).records.get(
      [...(await readTaskState(root)).records.values()].find((record) => record.created?.to === "worker")!.taskId,
    )!;
    assert.equal(workerTask.created!.from, "convener", "worker 任务仍由运营创建（生产语义不变）");
    assert.equal(workerTask.created!.workflowId, WF);
    assert.equal(workerTask.created!.stage, "B1");

    // 拒绝：内置目标（即使绑定同一 worker-dispatch 任务）。
    const builtIn = await manager.routeDispatch(root, "demo", "convener", {
      roleId: "product", task: "越权派产品", flowId: FLOW, workflowId: WF, stage: "B1", sideEffect: "docs",
    }, convenerLive);
    assert.equal(builtIn.ok, false);
    assert.match(builtIn.message ?? "", /convener-builtin-dispatch-forbidden/);
    releaseSource(h.mgr, convenerLive);

    // 未绑定：聊天运营会话（无受派任务）派 worker ⇒ worker-dispatch-required。
    const chatConvener = await openRole(h, root, "convener");
    const chatLive = liveSource(h.mgr, root, "convener");
    const unbound = await manager.routeDispatch(root, "demo", "convener", {
      roleId: "worker", task: "未绑定派 worker", flowId: FLOW, workflowId: WF, stage: "B1",
      sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
    }, chatLive);
    releaseSource(h.mgr, chatLive);
    assert.equal(unbound.ok, false, "未绑定 worker-dispatch 不得派发");
    assert.match(unbound.message ?? "", /worker-dispatch-required|dispatch-evidence-missing/);
    void chatConvener;
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 5) 启动对账 / 投递一致性 ——————————————

test("启动对账：已报告未收口幂等收口；服务建但未投递的应用任务补投递；fixed-v2.1 旧协议不触碰", async () => {
  const root = await tempRoot("ans-delivery-reconcile-");
  const h = harness(root);
  try {
    // 服务层启动 + 驱动 A2（未投递、无报告）。
    const selected = await selectWorkflow({ projectRoot: root, flowId: FLOW, workflowPath: "A", sourceTaskId: "turn-r1" });
    assert.equal(selected.ok, true);
    const WF = selected.workflowId;
    await openRole(h, root, "chief");
    const a2Driven = await driveAppDispatchStage({ projectRoot: root, workflowId: WF, stage: "A2" });
    assert.equal(a2Driven.ok, true);
    // 直接写 A2 报告（模拟崩溃窗口：报告已落、观察未跑、投递未发生）。
    await writeIntent(root);
    await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: (await taskOf(root, WF, "A2")).taskId, from: "product", status: "done",
      summary: "意图完成", evidence: ["docs/product/snake-intent-v1.md"],
    }, () => new Date(AT)));
    const summary = await h.mgr.reconcileAppDispatch(root);
    assert.equal(summary.activeWorkflows >= 1, true);
    assert.equal(summary.corrupt.length, 0, summary.corrupt.join(";"));
    assert.equal(summary.errors.length, 0, summary.errors.join(";"));
    const serviceReceipt = summary.service!.workflows.find((workflow) => workflow.workflowId === WF)!;
    assert.equal(serviceReceipt.protocol, "app-dispatch/v1");
    assert.ok(serviceReceipt.closedTasks.includes((await taskOf(root, WF, "A2")).taskId), "已报告未收口任务应被幂等收口");
    assert.equal((await viewOf(root, WF)).stages.A2.status, "completed");
    // 未送达任务补投递：A1/A2 应用任务在 reconcile 后应自动打开目标会话。
    const opened = h.inputs.filter((input) => input.roleId === "product" && typeof input.taskId === "string"
      && (input.taskId as string).startsWith("t-app-"));
    assert.equal(opened.length >= 1, true, "活动 workflow 的未送达应用任务应补投递");
    assert.equal(opened.every((input) => input.workflowMode === "fixed"), true);

    // 旧协议：fixed-v2.1 workflow 不被 reconcile 触碰（不投递、不驱动）。
    const oldRoot = await tempRoot("ans-delivery-reconcile-old-");
    const oldHarness = harness(oldRoot);
    try {
      const old = await requestStage({
        projectRoot: oldRoot, flowId: FLOW, stage: "A1", workflowPath: "A",
        requestDigest: sha("old"), sourceTaskId: "turn-old", text: "old",
      });
      assert.equal(old.ok, true);
      const oldSummary = await oldHarness.mgr.reconcileAppDispatch(oldRoot);
      assert.equal(oldSummary.activeWorkflows, 0, "旧协议不计入 app-dispatch 对账");
      assert.equal(oldHarness.inputs.length, 0, "旧协议不投递、不重开会话");
      assert.equal((await eventsOf(oldRoot, old.workflowId)).filter((event) => event.kind === "stage.requested").length, 1);
    } finally {
      await oldHarness.mgr.stop(null);
      await cleanup(oldRoot);
    }
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

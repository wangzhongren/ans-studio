// test/桌面应用/card-request-orphan.test.ts
// 2026-11-20（SMOKE-3 S3/S4 修复测试批，测试角色）：**card-prompt 请求 orphan 语义 → 重呈现 → 消费者重开**。
//
// 依据（权威）：
//   1. `角色卡/编排/docs/change/2026-11-20_change_card-request-orphan-semantics-foundation.md`
//      §三（presented 清 orphaned）/§四（drive 有界等待）/§五（测试点）；
//   2. `角色卡/桌面窗口/docs/change/2026-11-20_change_card-request-orphan-semantics-desktop.md`
//      §二（restore waiting/重呈现 supersedes/请求级 orphan→resolver/drive.pending）/§五（待测试批 1–4）；
//   3. `角色卡/桌面窗口/docs/feature/card-request-lifecycle.md`（最新事件为准；orphaned 非粘性；
//      重呈现携带 `supersedesOrphanAt`；只有 resolved 是终态）；
//   4. `角色卡/测试/docs/change/2026-11-20_SMOKE3_app-dispatch.md`（S3/S4 立案）。
//
// 覆盖（用例名逐项）：
//   1. **SMOKE-3 回归**：A3 意图卡仍在等待（created+presented+live card-prompt 任务 + workflow 活动同阶段）
//      ⇒ 并发 `restoreTasks` 零 orphan、零 card-prompt-orphaned block 事实、waiting 诊断去重；
//      任务终态后请求仍开 ⇒ 允许 orphan(restart)；重复调用零新增。
//   2. **请求级 orphan→resolver（崩溃窗口，无任务）**：恰 1 条 card-prompt-orphaned（engineCanRepair=false、
//      带 requestId、无 taskId）⇒ decideBlockRoute=owner-repair；经 router 实跑 blocks.jsonl 恰
//      raised→routed、创建 chief 修复任务未收口；重复扫描/`tick` 零新增。
//   3. **请求级 orphan→resolver（任务已终态）**：事实带原 prompt taskId/owner；superseded、阶段迁移不造块。
//   4. **并发/幂等**：`Promise.all` 三次 restoreTasks ⇒ app 请求恰一条 orphan、legacy 请求恰一条；重复零新增。
//   5. **重呈现取代**：orphan(restart) 后并发两次 `redeliverAppTask` ⇒ 同 requestId 恰一条新增 created 且
//      `supersedesOrphanAt===orphan.at`；第三次零新增；后到 presented ⇒ project-state pendingRequests=1。
//   6. **block-router.findRequestState**：orphan→presented ⇒ 可见等待（真实 router recover 不重弹卡）。
//   7. **consumer 重开**：orphan→重呈现→presented 后经真实 `request_choice` 作答被接受：request.resolved、
//      A3 stage.completed、prompt 任务应用收口、advance 推进 A4/A5；全程零 app-dispatch.drive.failed。
//   8. **drive.pending**：A3 入口缺失时 `advance` 只记一次去重 `app-dispatch.drive.pending`、
//      `drive.failed`=0、无 block；补入口后下一 tick 正常建任务并投递。
//
// 夹具：真实 SessionManager + 假会话/假时钟 + 真实 tasks/workflow/blocks 账本；不启动 Electron/模型；
// 不占端口、不读 `.env`、无网络/Git。（findRequestState 用例用真实 router + 独立宿主夹具，见用例内说明。）

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { createDesktopBlockRouter, type DesktopBlockRouterHost } from "../../app/desktop/block-router.ts";
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
  driveAppDispatchStage,
  readWorkflowLedger,
} from "../../src/common/编排/workflow-service.ts";
import {
  blockCardRequestId,
  computeBlockId,
  decideBlockRoute,
  type BlockFact,
} from "../../src/common/编排/block-resolution.ts";
import {
  readBlockLedger,
  replayBlockLifecycles,
  type BlockLedgerEvent,
  type BlockLifecycle,
} from "../../src/common/编排/block-ledger.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { buildProjectStateView } from "../../src/common/编排/project-state.ts";
import { WORKFLOW_DEFINITION_HASHES } from "../../src/common/编排/workflow-definitions.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  WORKFLOW_PROTOCOL_APP_DISPATCH,
  WORKFLOW_PROTOCOL_FIXED_V2_1,
  type CustomerInputOutcome,
  type CustomerInputRequest,
  type GovernanceCardKind,
  type WorkflowDocumentRef,
  type WorkflowEvent,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "orphanfix";
const AT = Date.parse("2026-11-20T00:00:00.000Z");
const STALL_MS = 12 * 60 * 1000;
const MAX_AUTO_FIX = 2;
const iso = (offsetMs = 0): string => new Date(AT + offsetMs).toISOString();

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
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-card-request-orphan-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, text, "utf8");
}
/** A3 卡事实计算所需的产品意图 + 幕僚意图入口（B24：入口由幕僚在 A3 前写）。 */
async function writeIntent(root: string): Promise<void> {
  await writeFile(root, "docs/product/orphanfix-intent-v1.md",
    "---\nschema: project-intent/v1\nflowId: orphanfix\nversion: 1\nintentId: orphanfix-intent\ngoal: 修复卡请求语义\n---\n# 意图\n");
  await writeFile(root, "docs/intents/orphanfix-intent.md",
    "---\nintentId: orphanfix-intent\nflowId: orphanfix\ngoal: 修复卡请求语义\n---\n# 意图入口\n");
}

// —————————————— 诊断（真实 sink；按 event + projectRoot 过滤） ——————————————

let diagDir = "";
before(async () => {
  diagDir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-card-orphan-diag-"));
  configureDiagnostics({ directory: diagDir });
});
after(async () => {
  await disposeDiagnostics();
  if (diagDir !== "") await fs.rm(diagDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

async function diagnosticRows(event: string, projectRoot: string): Promise<Array<Record<string, unknown>>> {
  await flushDiagnostics();
  const names = await fs.readdir(diagDir).catch(() => [] as string[]);
  const rows: Array<Record<string, unknown>> = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const text = await fs.readFile(path.join(diagDir, name), "utf8").catch(() => "");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      try {
        const row = JSON.parse(line) as Record<string, unknown>;
        if (row["event"] === event && row["projectRoot"] === projectRoot) rows.push(row);
      } catch { /* 坏行忽略（诊断不是账本） */ }
    }
  }
  return rows;
}

// —————————————— SessionManager 夹具（同 app-dispatch-block-seams.test.ts 风格） ——————————————

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

interface CapturedInput {
  roleId: string;
  taskId?: string;
  customerInput?: (request: CustomerInputRequest, metadata?: unknown) => Promise<CustomerInputOutcome | null | undefined>;
  [key: string]: unknown;
}

interface Harness {
  mgr: SessionManager;
  clock: { now: number };
  sent: Record<string, string[]>;
  inputs: CapturedInput[];
  requests: CustomerInputRequest[];
}

function harness(root: string, clock: { now: number }): Harness {
  const sent: Record<string, string[]> = {};
  const inputs: CapturedInput[] = [];
  const requests: CustomerInputRequest[] = [];
  const mgr = new SessionManager({
    now: () => clock.now,
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
      requests.push(request);
      // 与 app-dispatch-delivery.test.ts 同口径：意图卡默认确认（C5 的真实顾客作答路径经此通道）。
      if (request.cardKind === "intent-confirm") return { outcome: "answered", value: { selected: ["confirm"] } };
      return { outcome: "declined", reason: "card-request-orphan-test: cards not answered" };
    },
    emitEvent: () => {},
  });
  return { mgr, clock, sent, inputs, requests };
}

/** 私有接缝（测试门面；生产装配见 app/desktop/session/index.ts）。 */
interface MgrInternals {
  fixedWorkflowStageDispatch: {
    advance(projectRoot: string, workflowId: string, runtime: string): Promise<
      { stage?: WorkflowStage; tasks: Array<{ taskId: string; taskKind?: string }>; waiting?: { code: string; message: string } } | undefined
    >;
    scanAppCardPromptFacts(
      projectRoot: string,
      options: { stallMs: number; maxAutoFixAttempts: number },
    ): Promise<readonly BlockFact[]>;
    redeliverAppTask(projectRoot: string, taskId: string): Promise<{ ok: boolean; note: string; reEntry?: string }>;
  };
  blockRouter: {
    observeFact(projectRoot: string, fact: BlockFact): Promise<void>;
    tick(projectRoot: string): Promise<void>;
  };
  sessionKey(projectRoot: string, roleId: string, runtime: string): string;
  sessions: Map<string, unknown>;
  deliveryQueues: Map<string, Array<{ taskId?: string; targetRoleId: string }>>;
}

function internals(mgr: SessionManager): MgrInternals {
  return mgr as unknown as MgrInternals;
}

function scan(h: Harness, root: string): Promise<readonly BlockFact[]> {
  return internals(h.mgr).fixedWorkflowStageDispatch.scanAppCardPromptFacts(root, {
    stallMs: STALL_MS, maxAutoFixAttempts: MAX_AUTO_FIX,
  });
}

async function openChiefPromptInput(h: Harness, root: string, taskId: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "open failed") : "");
  const candidates = h.inputs.filter((input) => input.roleId === "chief" && input.taskId === taskId);
  const input = candidates[candidates.length - 1];
  assert.ok(input, "应捕获 chief 会话入参（含 request_choice 通道）");
  return input!;
}

// —————————————— 播种（app-dispatch/v1 + A3 card-prompt 任务/请求） ——————————————

async function seedWorkflow(root: string, workflowId: string, at: string): Promise<void> {
  const started: WorkflowEvent = {
    v: 1,
    at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "workflow.started",
    workflowId,
    flowId: FLOW,
    path: "A",
    idempotencyKey: `workflow-start:${FLOW}:A:seed-${workflowId}`,
    trigger: { by: "chief", reason: "card-request-orphan test" },
    sourceTaskId: `turn-${workflowId}`,
    protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
    // 当前注册表 v3（= 真实 selectWorkflow 产物；不伪造旧版本）。
    definition: { id: "add", version: 3, sha256: WORKFLOW_DEFINITION_HASHES.add },
    parameters: { acceptanceStrength: "standard" },
  };
  const appended = await appendWorkflowEvent(root, started);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function seedStageCompleted(root: string, workflowId: string, stage: WorkflowStage, at: string): Promise<void> {
  const requested: WorkflowEvent = {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
    workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `seed-request:${workflowId}:${stage}`,
    stage, requestTaskId: `seed-task:${stage}`, requestDigest: sha(`seed-${stage}`), attempt: 1,
  };
  const requestedAppend = await appendWorkflowEvent(root, requested);
  assert.equal(requestedAppend.ok, true, requestedAppend.ok === false ? requestedAppend.message : "");
  const completed: WorkflowEvent = {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
    workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `seed-complete:${workflowId}:${stage}`,
    stage, cause: { kind: "task-closed", ref: `seed-task:${stage}` }, artifacts: [],
  };
  const completedAppend = await appendWorkflowEvent(root, completed);
  assert.equal(completedAppend.ok, true, completedAppend.ok === false ? completedAppend.message : "");
}

async function seedStageRequested(root: string, workflowId: string, stage: WorkflowStage, taskId: string, at: string): Promise<void> {
  const requested: WorkflowEvent = {
    v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.requested",
    workflowId, flowId: FLOW, path: "A",
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
async function seedCardPrompt(root: string, workflowId: string, at: string): Promise<SeededPrompt> {
  const promptId = appDispatchPromptId(workflowId, "A3", 1);
  const taskId = appDispatchTaskId(cardPromptIdempotencyKey(workflowId, "A3", promptId));
  const created = await appendTaskEvent(root, taskEvent("task.created", {
    taskId,
    from: "application",
    to: "chief",
    text: "意图确认（A3）｜按应用 prompt 呈意图确认卡（intent-confirm）",
    sideEffect: "read-only",
    idempotencyKey: cardPromptIdempotencyKey(workflowId, "A3", promptId),
    flowId: FLOW,
    workflowId,
    stage: "A3",
    taskKind: "card-prompt",
    promptId,
    cardKind: "intent-confirm",
  }, () => new Date(at)));
  assert.equal(created.ok, true, created.ok === false ? created.message : "");
  await appendRequestCreated(root, workflowId, promptId, at, "intent-confirm", await intentRefIfReadable(root));
  return { taskId, promptId };
}

/** 意图文档存在时给出 A3 documentRefs[intent]（finalizeIntent 校验字节 hash；未写意图的夹具返回空）。 */
async function intentRefIfReadable(root: string): Promise<WorkflowDocumentRef | undefined> {
  try {
    const text = await fs.readFile(path.join(root, "docs", "product", "orphanfix-intent-v1.md"), "utf8");
    return { kind: "intent", path: "docs/product/orphanfix-intent-v1.md", sha256: sha(text), version: 1 };
  } catch {
    return undefined;
  }
}

async function appendRequestCreated(
  root: string,
  workflowId: string,
  promptId: string,
  at: string,
  cardKind: GovernanceCardKind = "intent-confirm",
  documentRefs?: WorkflowDocumentRef,
): Promise<void> {
  const request = await appendTaskEvent(root, taskEvent("request.created", {
    requestId: promptId,
    flowId: FLOW,
    cardKind,
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
    ...(documentRefs !== undefined ? { documentRefs: [documentRefs] } : {}),
  }, () => new Date(at)));
  assert.equal(request.ok, true, request.ok === false ? request.message : "");
}

async function appendPresented(root: string, requestId: string, to: "customer" | "judge" | "chief", at: string): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("request.presented", { requestId, to }, () => new Date(at)));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function appendOrphan(root: string, requestId: string, reason: "restart" | "superseded" | "initiator-aborted", at: string): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("request.orphaned", { requestId, reason }, () => new Date(at)));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

/** 完整播种：workflow + A1/A2 完成 + A3 requested + card-prompt 任务/请求。 */
async function seedA3Card(root: string, workflowId: string, at: string): Promise<SeededPrompt> {
  await seedWorkflow(root, workflowId, at);
  await seedStageCompleted(root, workflowId, "A1", at);
  await seedStageCompleted(root, workflowId, "A2", at);
  const seeded = await seedCardPrompt(root, workflowId, at);
  await seedStageRequested(root, workflowId, "A3", seeded.taskId, at);
  return seeded;
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
async function requestRows(root: string, requestId: string): Promise<Array<Extract<TaskReplay["events"][number], { kind: "request.created" }>>> {
  const state = await readTaskState(root);
  return state.events.filter((event): event is Extract<TaskReplay["events"][number], { kind: "request.created" }> =>
    event.kind === "request.created" && event.requestId === requestId);
}
async function recordsOfStage(root: string, workflowId: string, stage: WorkflowStage): Promise<TaskRecord[]> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((record) =>
    record.created?.workflowId === workflowId && record.created.stage === stage);
}
async function repairTasksOfBlock(root: string, blockId: string): Promise<TaskRecord[]> {
  const state = await readTaskState(root);
  return [...state.records.values()].filter((record) =>
    record.created?.taskKind === "repair" && record.created.blockId === blockId);
}
async function workflowViewOf(root: string, workflowId: string) {
  const ledger = await readWorkflowLedger(root);
  const tasks = await readTaskState(root);
  return deriveWorkflowView(ledger.events.filter((event) => event.workflowId === workflowId), tasks.events);
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

// —————————————— 1) SMOKE-3 回归：仍在等待的卡不得被对账 orphan ——————————————

test("SMOKE-3 回归：A3 意图卡等待中（created+presented+live 任务/活动 workflow 同阶段）⇒ 并发 restoreTasks 零 orphan、零 orphan 块事实、waiting 诊断去重", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT + 60_000 });
  try {
    const workflowId = "wf-smoke3-waiting";
    const { taskId, promptId } = await seedA3Card(root, workflowId, iso(0));
    await appendPresented(root, promptId, "customer", iso(1000));

    // SMOKE-3 现场：listProject 每次刷新并发触发 restoreTasks（fire-and-forget）。
    const reports = await Promise.all([1, 2, 3].map(() => h.mgr.restoreTasks(root)));
    assert.deepEqual(reports.map((report) => report.orphanedRequests), [0, 0, 0],
      "仍在等待的卡不得写 request.orphaned（SMOKE-3 13:01:59 双写回归）");
    let state = await readTaskState(root);
    assert.equal(state.events.filter((event) => event.kind === "request.orphaned").length, 0, "账本零 orphan 事件");
    assert.equal((await blockEvents(root)).length, 0, "零 card-prompt-orphaned block 事实（blocks.jsonl 空）");
    assert.deepEqual(await scan(h, root), [], "扫描不得把可见等待误判为 orphan/停摆");
    // waiting 诊断去重：同 project+requestId 只记一次（不因并发/重复刷新刷屏）。
    const waitingRows = await diagnosticRows("desktop.request.restore.waiting", root);
    assert.equal(waitingRows.length, 1, `waiting 诊断应恰一条（实际 ${waitingRows.length}）`);
    assert.equal(waitingRows[0]!["requestId"], promptId);
    assert.equal(waitingRows[0]!["reasonCode"], "waiting");
    // 重复调用零新增（幂等；卡任务保持 open，workflow 仍停在 A3）。
    const again = await h.mgr.restoreTasks(root);
    assert.equal(again.orphanedRequests, 0);
    state = await readTaskState(root);
    assert.equal(state.events.filter((event) => event.kind === "request.orphaned").length, 0);
    assert.equal((await diagnosticRows("desktop.request.restore.waiting", root)).length, 1, "重复 restore 不再记 waiting 诊断");
    const record = state.records.get(taskId)!;
    assert.equal(record.closed, undefined, "等待中的 card-prompt 任务保持 open");
    assert.equal(record.reports.length, 0);
    assert.equal((await workflowViewOf(root, workflowId)).stage, "A3");

    // 任务终态（rejected 收口）后请求仍开 ⇒ 允许走既有 orphan(restart) 路径（交请求级 resolver）。
    const closed = await appendTaskEvent(root, taskEvent("task.closed", {
      taskId, by: "chief", outcome: "rejected", note: "SMOKE-3 回归夹具：任务终态",
    }, () => new Date(AT + 2000)));
    assert.equal(closed.ok, true, closed.ok === false ? closed.message : "");
    const afterTerminal = await h.mgr.restoreTasks(root);
    assert.equal(afterTerminal.orphanedRequests, 1, "任务已终态而请求仍开 ⇒ 允许 orphan(restart)");
    const orphans = (await readTaskState(root)).events.filter((event) =>
      event.kind === "request.orphaned" && event.requestId === promptId);
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0]!.kind === "request.orphaned" ? orphans[0]!.reason : undefined, "restart");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 2) 请求级 orphan→resolver（崩溃窗口，无任务） ——————————————

test("请求级 orphan→resolver（崩溃窗口，无任务）：恰 1 条 card-prompt-orphaned(engineCanRepair=false/带 requestId) ⇒ decideBlockRoute=owner-repair；router 实跑恰 raised→routed、创建 chief 修复任务未收口；重复扫描/tick 零新增", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT });
  try {
    const workflowId = "wf-orphan-crash";
    const at = iso(0);
    await seedWorkflow(root, workflowId, at);
    await seedStageCompleted(root, workflowId, "A1", at);
    await seedStageCompleted(root, workflowId, "A2", at);
    const promptId = appDispatchPromptId(workflowId, "A3", 1);
    await appendRequestCreated(root, workflowId, promptId, at);
    await seedStageRequested(root, workflowId, "A3",
      appDispatchTaskId(cardPromptIdempotencyKey(workflowId, "A3", promptId)), at);
    // 崩溃窗口：request.created 后任务未建成，对账（或历史崩溃）留下 orphan(restart)。
    await appendOrphan(root, promptId, "restart", iso(1000));

    const facts = (await scan(h, root)).filter((fact) => fact.code === "card-prompt-orphaned");
    assert.equal(facts.length, 1, `请求级 orphan 必须产出一条事实（实际 ${facts.length}）`);
    const fact = facts[0]!;
    assert.equal(fact.protocol, WORKFLOW_PROTOCOL_APP_DISPATCH);
    assert.equal(fact.requestId, promptId, "事实携带 requestId");
    assert.equal(fact.taskId, undefined, "崩溃窗口无任务可重投（不伪造 taskId）");
    assert.equal(fact.engineCanRepair, false, "无任务可重投 ⇒ 引擎不可修复");
    assert.equal(fact.ownerRoleId, "chief", "缺任务时属主回落 chief（原卡目标）");
    assert.equal(fact.detailCode, "reconcile");
    // 分类路由：protocol-reconcile + engineCanRepair:false + ownerRoleId ⇒ owner-repair（不落 engine）。
    const decision = decideBlockRoute(fact);
    assert.equal(decision.kind, "owner-repair", "请求级 orphan 走属主修复（不落 engine-auto-fix）");
    assert.equal(decision.class, "protocol-reconcile");
    assert.equal(decision.owner.kind, "role");
    assert.equal(decision.owner.roleId, "chief");
    assert.match(decision.reason, /protocol-reconcile:owner-repair/);

    // 经 router 实跑：blocks.jsonl 恰 raised→routed(owner-repair)；创建 chief 修复任务（未收口）。
    await internals(h.mgr).blockRouter.observeFact(root, fact);
    const events = await blockEvents(root);
    assert.deepEqual(events.map((event) => event.kind), ["block.raised", "block.routed"],
      "恰一条 raised + 一条 routed（owner-repair 等待修复，不 resolved）");
    const lifecycle = (await lifecycles(root))[0]!;
    assert.equal(lifecycle.status, "routed");
    assert.equal(lifecycle.routeKind, "owner-repair");
    assert.equal(lifecycle.resolution, undefined);
    assert.equal(lifecycle.requestId, promptId);
    const raised = events[0]!;
    assert.equal(raised.kind === "block.raised" ? raised.engineCanRepair : undefined, false, "raised 持久化 engineCanRepair=false");
    const repairs = await repairTasksOfBlock(root, lifecycle.blockId);
    assert.equal(repairs.length, 1, "owner-repair 创建且仅创建一条 chief 修复任务");
    assert.equal(repairs[0]!.created?.to, "chief");
    assert.equal(repairs[0]!.created?.from, "application");
    assert.equal(repairs[0]!.created?.idempotencyKey, `block-repair:${lifecycle.blockId}:1`);
    assert.equal(repairs[0]!.closed, undefined, "修复任务未收口（等待属主实际行动）");
    assert.equal(repairs[0]!.reports.length, 0);

    // 重复扫描零新增（同 orphan 的 blockId 已在账本；指纹含 orphan.at）。
    assert.deepEqual((await scan(h, root)).filter((entry) => entry.code === "card-prompt-orphaned"), [],
      "重复扫描零新增事实（不重复 raised）");
    // tick（时钟未越 T_repair）：扫描同样不得重复 raised/新造 block。
    const eventsBeforeTick = (await blockEvents(root)).length;
    await internals(h.mgr).blockRouter.tick(root);
    assert.equal((await blockEvents(root)).length, eventsBeforeTick, "tick 不得重复 raised 同 orphan 块");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 3) 请求级 orphan（任务已终态）/ superseded / 阶段迁移 ——————————————

test("请求级 orphan（任务已终态）：事实带原 prompt taskId/owner ⇒ owner-repair；superseded、阶段迁移、live 等待不造块", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT });
  try {
    const workflowId = "wf-orphan-terminal";
    const { taskId, promptId } = await seedA3Card(root, workflowId, iso(0));
    // 任务已 rejected 收口而请求仍开 ⇒ 请求级 orphan（无 live 任务）。
    const closed = await appendTaskEvent(root, taskEvent("task.closed", {
      taskId, by: "chief", outcome: "rejected", note: "终态任务夹具",
    }, () => new Date(AT + 500)));
    assert.equal(closed.ok, true, closed.ok === false ? closed.message : "");
    await appendOrphan(root, promptId, "restart", iso(1000));
    const facts = (await scan(h, root)).filter((fact) => fact.code === "card-prompt-orphaned");
    assert.equal(facts.length, 1);
    const fact = facts[0]!;
    assert.equal(fact.taskId, taskId, "终态任务事实带原 prompt taskId（审计锚点）");
    assert.equal(fact.ownerRoleId, "chief", "属主 = 原任务目标（created.to）");
    assert.equal(fact.engineCanRepair, false);
    assert.equal((await decideBlockRoute(fact)).kind, "owner-repair");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }

  // 负例（独立 root）：superseded / 阶段迁移 / live 等待均不造块。
  const root2 = await makeRoot();
  const h2 = harness(root2, { now: AT });
  try {
    const workflowId = "wf-orphan-negatives";
    const at = iso(0);
    await seedWorkflow(root2, workflowId, at);
    for (const stage of ["A1", "A2", "A3"] as const) {
      await seedStageCompleted(root2, workflowId, stage, at);
    }
    await seedStageRequested(root2, workflowId, "A4", "seed-task:A4", at);
    // superseded：按既有语义不重投、不造块。
    const supersededId = appDispatchPromptId(workflowId, "A3", 2);
    await appendRequestCreated(root2, workflowId, supersededId, at);
    await appendOrphan(root2, supersededId, "superseded", iso(500));
    // 阶段迁移：A3 请求在 A4 已 requested 后仍为 orphan(restart) ⇒ 不重呈现、不造块。
    const movedId = appDispatchPromptId(workflowId, "A3", 3);
    await appendRequestCreated(root2, workflowId, movedId, at);
    await appendOrphan(root2, movedId, "restart", iso(600));
    // live 等待：created 后紧随 presented（可见等待）⇒ 不造块。
    const liveId = appDispatchPromptId(workflowId, "A3", 4);
    await appendRequestCreated(root2, workflowId, liveId, at);
    await appendPresented(root2, liveId, "customer", iso(700));

    const facts = await scan(h2, root2);
    assert.deepEqual(facts.filter((fact) => fact.code === "card-prompt-orphaned"), [],
      "superseded / 阶段迁移 / live 等待均不得产出 card-prompt-orphaned 事实");
    assert.equal((await blockEvents(root2)).length, 0, "负例不造块");
  } finally {
    await h2.mgr.stop(null);
    await cleanup(root2);
  }
});

// —————————————— 4) 并发/幂等（restore） ——————————————

test("并发/幂等：Promise.all 三次 restoreTasks ⇒ app 请求恰一条 orphan（至多）、legacy 请求恰一条；重复调用零新增", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT });
  try {
    const workflowId = "wf-restore-concurrent";
    const at = iso(0);
    await seedWorkflow(root, workflowId, at);
    await seedStageCompleted(root, workflowId, "A1", at);
    await seedStageCompleted(root, workflowId, "A2", at);
    // app-dispatch 请求无任务（崩溃窗口）⇒ 允许 orphan(restart)。
    const appPromptId = appDispatchPromptId(workflowId, "A3", 1);
    await appendRequestCreated(root, workflowId, appPromptId, at);
    // legacy 请求（非 app-dispatch 形状）⇒ 既有 orphan(restart) 语义逐字不变。
    const legacyId = "req-legacy-restore";
    const legacyCreated = await appendTaskEvent(root, taskEvent("request.created", {
      requestId: legacyId,
      sourceRoleId: "rapporteur",
      title: "遗留申请",
      options: [{ id: "accept", label: "接受" }],
    }, () => new Date(at)));
    assert.equal(legacyCreated.ok, true, legacyCreated.ok === false ? legacyCreated.message : "");

    await Promise.all([1, 2, 3].map(() => h.mgr.restoreTasks(root)));
    let state = await readTaskState(root);
    const appOrphans = state.events.filter((event) => event.kind === "request.orphaned" && event.requestId === appPromptId);
    const legacyOrphans = state.events.filter((event) => event.kind === "request.orphaned" && event.requestId === legacyId);
    assert.equal(appOrphans.length <= 1, true, `app 请求至多一条 orphan（实际 ${appOrphans.length}）`);
    assert.equal(appOrphans.length, 1, "崩溃窗口的 app 请求应写一条 orphan");
    assert.equal(legacyOrphans.length, 1, `legacy 请求恰一条 orphan（实际 ${legacyOrphans.length}；SMOKE-3 双写回归）`);
    assert.equal(appOrphans[0]!.kind === "request.orphaned" ? appOrphans[0]!.reason : undefined, "restart");
    assert.equal(legacyOrphans[0]!.kind === "request.orphaned" ? legacyOrphans[0]!.reason : undefined, "restart");

    // 重复调用（顺序两次）零新增。
    const second = await h.mgr.restoreTasks(root);
    const third = await h.mgr.restoreTasks(root);
    assert.equal(second.orphanedRequests, 0);
    assert.equal(third.orphanedRequests, 0);
    state = await readTaskState(root);
    assert.equal(state.events.filter((event) => event.kind === "request.orphaned").length, 2, "重复 restore 零新增");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 5) 重呈现取代（supersedesOrphanAt）+ project-state ——————————————

test("重呈现取代：orphan(restart) 后并发两次 redeliverAppTask ⇒ 同 requestId 恰一条新增 created（supersedesOrphanAt=orphan.at）；第三次零新增；后到 presented ⇒ project-state 恢复等待", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT + 5000 });
  try {
    const workflowId = "wf-represent";
    const { taskId, promptId } = await seedA3Card(root, workflowId, iso(0));
    // 打开 chief（demo 运行时）——重投运行时解析需要 live 会话（否则回落 pi，夹具无 pi 适配器）。
    const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "open failed") : "");
    const orphanAt = iso(1000);
    await appendOrphan(root, promptId, "restart", orphanAt);
    assert.equal((await requestRows(root, promptId)).length, 1);

    // 并发两次重投（engine 重呈现路径）⇒ 在飞去重：账本恰一条新增 created。
    const [first, second] = await Promise.all([
      internals(h.mgr).fixedWorkflowStageDispatch.redeliverAppTask(root, taskId),
      internals(h.mgr).fixedWorkflowStageDispatch.redeliverAppTask(root, taskId),
    ]);
    assert.equal(first.ok, true, first.note);
    assert.equal(second.ok, true, second.note);
    let rows = await requestRows(root, promptId);
    assert.equal(rows.length, 2, `同 requestId 应恰一条新增 request.created（实际 ${rows.length}）`);
    const represented = rows[1]!;
    assert.equal(represented.requestId, promptId);
    assert.equal(represented.supersedesOrphanAt, orphanAt, "重呈现携带被取代 orphan.at 原文");
    assert.equal(represented.promptId, promptId);
    assert.deepEqual(represented.options, rows[0]!.options, "重呈现逐项复制原应用事实（不新开卡）");
    assert.deepEqual(represented.recommended, rows[0]!.recommended);

    // 第三次重投零新增（同 orphan 只重呈现一次）。
    const third = await internals(h.mgr).fixedWorkflowStageDispatch.redeliverAppTask(root, taskId);
    assert.equal(third.ok, true, third.note);
    rows = await requestRows(root, promptId);
    assert.equal(rows.length, 2, "第三次重投不得追加 request.created");
    // 不新开卡任务、不新 requestId。
    assert.equal((await recordsOfStage(root, workflowId, "A3")).length, 1);
    assert.deepEqual([...new Set(rows.map((row) => row.requestId))], [promptId]);

    // post-representation：后到 request.presented（消费者可见）⇒ project-state 恢复等待。
    await appendPresented(root, promptId, "customer", iso(2000));
    const view = await buildProjectStateView(root, { full: true, now: new Date(h.clock.now) });
    assert.equal(view.counts.pendingRequests, 1, "presented 晚于 orphaned ⇒ 重新进入待决投影");
    assert.equal(view.blockers.some((blocker) => blocker.id === `request-pending:${promptId}`), true,
      "request-pending 可见（旧 orphaned 不粘性）");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 6) block-router.findRequestState：orphan→presented ⇒ 可见等待 ——————————————

/** 独立 router 宿主夹具（同 block-router.test.ts 风格；真实 router/账本，客户通道为假函数）。 */
function routerHarness(root: string, customerInput: (request: CustomerInputRequest) => Promise<CustomerInputOutcome>) {
  const clock = { now: AT };
  const systemRows: string[] = [];
  let seq = 0;
  const withRequestLifecycle: DesktopBlockRouterHost["withRequestLifecycle"] = async (
    projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride,
  ) => {
    const requestId = requestIdOverride ?? `req-router-${++seq}`;
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
    }, () => new Date(clock.now)));
    await appendTaskEvent(projectRoot, taskEvent("request.presented", {
      requestId,
      to: metadata?.blockJudgePermitted === true ? "judge" : "customer",
    }, () => new Date(clock.now)));
    return raw(request, { ...buildContext(request, {}), requestId }, metadata);
  };
  const host: DesktopBlockRouterHost = {
    now: () => clock.now,
    customerInput,
    getListing: (projectRoot) => (projectRoot === root ? listing(root) : undefined),
    findLiveRuntime: () => "demo",
    activeRuntimeFor: () => "demo",
    lastGovernanceRuntime: new Map(),
    governanceOwner: () => "chief",
    decisionDelegationEnabled: () => false,
    withRequestLifecycle,
    enqueueDelivery: () => {},
    drainQueue: async () => {},
    emitSystemRow: (_projectRoot, roleId, summary) => { systemRows.push(`${roleId ?? ""}:${summary}`); },
    appendRoleActivity: async () => {},
    isBusy: () => false,
    registerAppTask: () => {},
  };
  const router = createDesktopBlockRouter(host);
  return { router, clock, systemRows };
}

test("block-router.findRequestState：orphan→presented ⇒ 可见等待（真实 router recover 不重弹卡）", async () => {
  const root = await makeRoot();
  const requests: CustomerInputRequest[] = [];
  const { router, clock } = routerHarness(root, async (request) => {
    requests.push(request);
    return { outcome: "declined", reason: "find-request-state-test: 不代答" };
  });
  try {
    const fact: BlockFact = {
      protocol: WORKFLOW_PROTOCOL_FIXED_V2_1,
      kind: "service-rejection",
      code: "high-risk-blocked",
      highRisk: true,
      flowId: "flow-find-request-state",
      summary: "高风险（findRequestState presented 分支夹具）",
      fingerprintMaterial: ["find-request-state-presented"],
    };
    await router.observeFact(root, fact);
    await waitFor(() => requests.length === 1, "客户决策卡初次呈现");
    const blockId = computeBlockId(fact);
    const requestId = blockCardRequestId(blockId);
    await waitFor(async () => (await readTaskState(root)).events.some((event) =>
      event.kind === "request.presented" && event.requestId === requestId), "初次 presented 落账");

    // 生命周期：created→presented（初次）→ orphaned(restart) → presented（同一请求重新可见）。
    await appendOrphan(root, requestId, "restart", iso(1000));
    clock.now = AT + 2000;
    await appendPresented(root, requestId, "customer", iso(2000));

    // recover 走 recoverBlock（routed customer-decision）：findRequestState 必须按最后一条（presented）
    // 清 orphaned ⇒ 可见等待、不重弹；若粘性 orphan 则会把同块卡再弹一次。
    await router.recover(root);
    assert.equal(requests.length, 1, `orphan→presented 后恢复不得重弹卡（实际呈现 ${requests.length} 次）`);
    const events = await blockEvents(root);
    assert.equal(events.filter((event) => event.kind === "block.raised").length, 1);
    assert.equal((await lifecycles(root))[0]!.status, "routed", "块保持可见等待（不伪造 resolved）");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 7) consumer 重开：真实 request_choice 作答被接受 ——————————————

test("consumer 重开：orphan→重呈现→presented 后经真实 request_choice 作答被接受（request.resolved/A3 completed/prompt 任务收口/advance 到 A4-A5），零 drive.failed", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT + 5000 });
  try {
    await writeIntent(root);
    const workflowId = "wf-consumer-reopen";
    const { taskId, promptId } = await seedA3Card(root, workflowId, iso(0));
    // 先打开 chief 会话（demo）并捕获 request_choice 通道；随后重投走 live 运行时（不回落 pi）。
    const chiefInput = await openChiefPromptInput(h, root, taskId);
    assert.equal(typeof chiefInput.customerInput, "function", "幕僚会话必须注入 request_choice");
    const orphanAt = iso(1000);
    await appendOrphan(root, promptId, "restart", orphanAt);
    const redelivered = await internals(h.mgr).fixedWorkflowStageDispatch.redeliverAppTask(root, taskId);
    assert.equal(redelivered.ok, true, redelivered.note);
    const rows = await requestRows(root, promptId);
    assert.equal(rows.length, 2);
    assert.equal(rows[1]!.supersedesOrphanAt, orphanAt);

    // 真实顾客作答路径：chief 会话注入的 request_choice（presented 由呈卡通道写；此处按通道语义先落
    // presented——证明 presented 晚于 orphaned 后卡恢复可答；resolved 由作答路径写）。
    await appendPresented(root, promptId, "customer", iso(1500));
    const options = rows[1]!.options.map((option) => ({ ...option }));
    const answered = await chiefInput.customerInput!({
      kind: "choice", title: "意图确认", cardKind: "intent-confirm", promptId, flowId: FLOW, options,
    });
    assert.equal(answered?.outcome, "answered", "重呈现后的卡必须可正常作答（不得因历史 orphan 拒绝）");
    assert.equal(h.requests.length, 1, "客户卡恰呈现一次（重呈现复用同 requestId，不新开卡）");

    const state = await readTaskState(root);
    const lifecycleKinds = state.events
      .filter((event) => "requestId" in event && event.requestId === promptId)
      .map((event) => event.kind);
    assert.equal(lifecycleKinds.filter((kind) => kind === "request.created").length, 2);
    assert.equal(lifecycleKinds.filter((kind) => kind === "request.orphaned").length, 1);
    assert.equal(lifecycleKinds.filter((kind) => kind === "request.presented").length, 1);
    assert.equal(lifecycleKinds.filter((kind) => kind === "request.resolved").length, 1);
    const orphanIndex = lifecycleKinds.indexOf("request.orphaned");
    const representedIndex = lifecycleKinds.lastIndexOf("request.created");
    const presentedIndex = lifecycleKinds.indexOf("request.presented");
    const resolvedIndex = lifecycleKinds.indexOf("request.resolved");
    assert.ok(representedIndex > orphanIndex, "重呈现 created 晚于 orphaned");
    assert.ok(presentedIndex > representedIndex, "presented 晚于重呈现（消费者按最后一条为准可答）");
    assert.ok(resolvedIndex > presentedIndex, "resolved 晚于 presented（最终态）");
    const resolved = state.events.find((event) => event.kind === "request.resolved" && event.requestId === promptId);
    assert.ok(resolved !== undefined && resolved.kind === "request.resolved");
    assert.equal(resolved!.by, "customer");

    // A3 completed；prompt 任务由应用收口；advance 推进 A4（创建即完成）/A5（任务已建）。
    const view = await workflowViewOf(root, workflowId);
    assert.equal(view.stages.A3.status, "completed");
    assert.equal(state.records.get(taskId)?.closed?.by, "application", "裁决后 prompt 任务由应用收口");
    assert.equal(state.records.get(taskId)?.closed?.outcome, "accepted");
    assert.equal(view.stages.A4.status, "completed", "A4 创建即完成");
    assert.equal((await recordsOfStage(root, workflowId, "A5")).length, 1, "advance 继续推进到 A5");
    assert.equal((await recordsOfStage(root, workflowId, "A5"))[0]!.created?.to, "rapporteur");
    assert.equal(((await workflowEventsOfKind(root, workflowId, "stage.requested")).filter((event) => event.stage === "A3")).length, 1);

    // 全程零 app-dispatch.drive.failed（等待/重呈现均不得记为失败）。
    assert.equal((await diagnosticRows("app-dispatch.drive.failed", root)).length, 0);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 8) drive.pending：入口缺失是有界等待 ——————————————

test("drive.pending：A3 入口缺失时 advance 只记一次去重 app-dispatch.drive.pending（drive.failed=0、无 block）；补入口后下一 tick 正常建任务并投递", async () => {
  const root = await makeRoot();
  const h = harness(root, { now: AT });
  try {
    const workflowId = "wf-drive-pending";
    const at = iso(0);
    await seedWorkflow(root, workflowId, at);
    await seedStageCompleted(root, workflowId, "A1", at);
    await seedStageCompleted(root, workflowId, "A2", at);
    // 产品意图已有、入口未写（幕僚尚未落 docs/intents）。
    await writeFile(root, "docs/product/orphanfix-intent-v1.md",
      "---\nschema: project-intent/v1\nflowId: orphanfix\nversion: 1\nintentId: orphanfix-intent\ngoal: 修复卡请求语义\n---\n# 意图\n");
    const stageDispatch = internals(h.mgr).fixedWorkflowStageDispatch;

    const first = await stageDispatch.advance(root, workflowId, "demo");
    assert.equal(first?.waiting?.code, "intent-entry-missing", "入口缺失 ⇒ 有界等待回执（不是失败）");
    const second = await stageDispatch.advance(root, workflowId, "demo");
    assert.equal(second?.waiting?.code, "intent-entry-missing");
    // 去重诊断：同 workflow/stage/code 只一条；drive.failed 零；无 block。
    const pendingRows = await diagnosticRows("app-dispatch.drive.pending", root);
    assert.equal(pendingRows.length, 1, `drive.pending 诊断应去重为一条（实际 ${pendingRows.length}）`);
    assert.equal(pendingRows[0]!["reasonCode"], "intent-entry-missing");
    assert.equal(pendingRows[0]!["attempt"], 1);
    assert.equal((await diagnosticRows("app-dispatch.drive.failed", root)).length, 0, "等待不得记为 drive.failed");
    assert.equal((await blockEvents(root)).length, 0, "等待不得造 block");
    assert.equal((await recordsOfStage(root, workflowId, "A3")).length, 0, "等待期间零任务");
    assert.equal((await workflowEventsOfKind(root, workflowId, "stage.requested")).filter((event) => event.stage === "A3").length, 0,
      "等待期间零 stage.requested");
    assert.equal((await readTaskState(root)).events.some((event) => event.kind === "request.created"), false);

    // 补入口 ⇒ 下一 tick（advance）正常 A3 建任务/请求并投递。
    await writeFile(root, "docs/intents/orphanfix-intent.md",
      "---\nintentId: orphanfix-intent\nflowId: orphanfix\ngoal: 修复卡请求语义\n---\n# 意图入口\n");
    const next = await stageDispatch.advance(root, workflowId, "demo");
    assert.equal(next?.stage, "A3");
    assert.equal(next?.waiting, undefined, "入口恢复后不再等待");
    assert.equal(next?.tasks.length, 1);
    const a3Tasks = await recordsOfStage(root, workflowId, "A3");
    assert.equal(a3Tasks.length, 1);
    assert.equal(a3Tasks[0]!.created?.taskKind, "card-prompt");
    assert.equal((await workflowEventsOfKind(root, workflowId, "stage.requested")).filter((event) => event.stage === "A3").length, 1);
    const promptId = a3Tasks[0]!.created!.promptId!;
    assert.equal((await requestRows(root, promptId)).length, 1, "恢复后恰一条 request.created");
    // 投递：chief 收到卡 prompt 任务文本（或忙时已入队；此处会话空闲 ⇒ 真实 send）。drainQueue 异步。
    const a3TaskId = a3Tasks[0]!.taskId;
    await waitFor(() => (h.sent.chief ?? []).length >= 1
      || [...internals(h.mgr).deliveryQueues.values()].flat().some((item) => item.taskId === a3TaskId),
      "A3 card-prompt 任务投递或入队（不静默丢）");
    assert.equal((await diagnosticRows("app-dispatch.drive.pending", root)).length, 1, "恢复推进不再重复记 pending");
    assert.equal((await diagnosticRows("app-dispatch.drive.failed", root)).length, 0);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

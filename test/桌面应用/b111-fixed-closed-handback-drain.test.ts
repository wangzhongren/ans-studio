// test/桌面应用/b111-fixed-closed-handback-drain.test.ts
// T3「两条固定工作流路径」B11.1（2026-11-11，桌面窗口）：已收口 fixed child 的回交不再阻塞投递队列。
// 依据：RR6 运行根 `target/.ans/state/tasks.jsonl`（A1 产品任务 `t-mwba4mji…` 于 22:47:15 已 closed；
// 其回交仍排队，drive 反复 `fixed-handback-unverifiable` 阻塞 convener；A2 `t-mwba69jk…` 已 reported
// 但回交被堵）；B8.2 `inspectFixedHandbackChild` 对 `record.closed !== undefined` 返回 false，导致
// `inspectHandbackAssignment` fail-closed 保留队列项；B1 v1.2 AC-18。
//
// 覆盖（全部确定性、假会话；不启动 Electron/真实模型）：
//   1. RR6 主链：A1 fixed 回交入队（convener 忙）→ A1 收口 → drain 丢弃该回交（诊断
//      `delivery.skip.fixed-child-closed`）并继续投递其后 A2 open fixed 回交；A1 回交正文不投出、
//      不追加/伪造任务事件（task.reported 计数不变）。
//   2. open fixed 回交正常投递，不产生 `delivery.skip.fixed-child-closed` 诊断（不误伤）。
//   3. 同一批 batchItems 混有 closed/open：只丢 closed 成员，open 成员照常投递（不整批阻塞、不误投）。
//   4. legacy 子任务回交路径逐字不变：closed legacy child 仍走旧解析（`delivery-child-source-invalid`），
//      不被 fixed closed 丢弃分支吞掉。
// 不新增 skip/force-exit；不启动 Electron；不写仓库外状态。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager, type DesktopOrchestrationEvent } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent } from "../../src/common/编排/workflow-service.ts";
import { renderWorkReportPrompt, type OrchestrationEvent, type TaskHandback } from "../../src/common/编排/handback.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean | Promise<boolean>, label = "实际事件", timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await check()) return;
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

async function readDiagnostics(directory: string): Promise<string> {
  let names: string[] = [];
  try {
    names = await fs.readdir(directory);
  } catch {
    return "";
  }
  const texts = await Promise.all(
    names.filter((name) => name.endsWith(".jsonl")).map((name) => fs.readFile(path.join(directory, name), "utf8")),
  );
  return texts.join("\n");
}

/** trio 内置六角色 + 项目角色 worker（fixed 子任务受派人/回交来源）。 */
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
  [key: string]: unknown;
}

function harness(root: string) {
  const sent: Record<string, string[]> = {};
  const streams: Record<string, OrchestrationEvent[]> = {};
  const inputs: CapturedInput[] = [];
  const envelopes: { roleId: string; event: DesktopOrchestrationEvent }[] = [];
  for (const role of listing(root).roles) {
    sent[role.roleId] = [];
    streams[role.roleId] = [];
  }
  const makeHandle = (roleId: string): RoleSessionHandle => {
    let index = 0;
    let stopped = false;
    return {
      async send(text: string, _options?: RoleSessionSendOptions): Promise<void> {
        (sent[roleId] ??= []).push(text);
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
  return { mgr, sent, streams, inputs, envelopes };
}

interface LiveSource {
  entry: unknown;
  origin: { settled: boolean; turnId?: string; taskId?: string };
}

/** 伪造**真实活条目 + 当前轮次**（测试不启动模型，直接定格会话条目事实）。 */
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

interface ManagerInternals {
  queueKey(projectRoot: string, roleId: string, runtime: string): string;
  deliveryQueues: Map<string, Array<{ handback?: TaskHandback }>>;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Record<string, unknown>): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: string): Promise<void>;
}

async function openRole(h: ReturnType<typeof harness>, root: string, roleId: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo" });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "会话打开失败") : "");
  const input = h.inputs.find((item) => item.roleId === roleId && item.taskId === undefined);
  assert.ok(input !== undefined, `应捕获 ${roleId} 的 openRoleSession 入参`);
  return input!;
}

async function fixedProject(root: string): Promise<void> {
  await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
}

const FIXED_FLOW = "snake";

async function seedStartedWorkflow(root: string, workflowId: string, sourceTaskId: string): Promise<void> {
  const event: WorkflowEvent = {
    v: 1, at: "2026-11-11T00:00:00.000Z", schema: "ans-workflow/v1", kind: "workflow.started",
    workflowId, flowId: FIXED_FLOW, path: "A",
    idempotencyKey: `workflow-start:${FIXED_FLOW}:A:${sourceTaskId}`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId,
  };
  const appended = await appendWorkflowEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function appendCreated(
  root: string,
  fields: { taskId: string; from: "convener" | "chief"; to: string; text: string; workflowId?: string; stage?: WorkflowStage; flowId?: string; runId?: string; runState?: "draft" | "legacy" | "pinned" },
): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.created", {
    taskId: fields.taskId, from: fields.from, to: fields.to, text: fields.text,
    flowId: fields.flowId ?? FIXED_FLOW, sideEffect: "code",
    ...(fields.workflowId !== undefined ? { workflowId: fields.workflowId } : {}),
    ...(fields.stage !== undefined ? { stage: fields.stage } : {}),
    ...(fields.runId !== undefined ? { runId: fields.runId } : {}),
    ...(fields.runState !== undefined ? { runState: fields.runState } : {}),
    idempotencyKey: `key-${fields.taskId}`,
  }, () => new Date("2026-11-11T00:00:00.000Z")));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function closeTask(root: string, taskId: string, by: "convener" | "chief" = "convener"): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.closed", { taskId, by, outcome: "accepted" },
    () => new Date("2026-11-11T00:03:00.000Z")));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

const handbackOf = (taskId: string, summary: string, turnId: string, roleId = "worker"): TaskHandback => ({
  roleId, taskId, status: "completed", summary, evidence: [], at: "2026-11-11T00:00:02.000Z", turnId,
});

/** 诊断断言读盘（`delivery.skip.fixed-child-closed` 只写诊断，不发系统行）。 */
async function flushAndReadDiagnostics(directory: string): Promise<string> {
  await flushDiagnostics();
  return readDiagnostics(directory);
}

// ══════════════════════════ 1. RR6 主链：closed fixed 回交丢弃 + 后续 open 回交续投 ══════════════════════════

test("B11.1 RR6：已收口 fixed 回交（A1）被丢弃并继续投递后续 open fixed 回交（A2），不再反复阻塞 convener", async () => {
  const root = await makeRoot("ans-b111-closed-drain-");
  const diagnosticsDir = path.join(root, ".diag");
  configureDiagnostics({ directory: diagnosticsDir });
  const h = harness(root);
  const manager = h.mgr as unknown as ManagerInternals;
  try {
    await fixedProject(root);
    const workflowId = "wf-b111closed000000000000001";
    await seedStartedWorkflow(root, workflowId, "turn-b111-source");
    await appendCreated(root, { taskId: "t-b111-a1", from: "convener", to: "worker", text: "A1 受理任务", workflowId, stage: "A1" });
    await appendCreated(root, { taskId: "t-b111-a2", from: "convener", to: "worker", text: "A2 意图任务", workflowId, stage: "A2" });
    await h.mgr.listTasks(root); // 登记 starTaskIds/taskCreators（与真实恢复路径同源）
    await openRole(h, root, "worker");
    await openRole(h, root, "convener");
    // convener 处于真实回合中（RR6 现场）：回交只能排队保留。
    liveSource(h.mgr, root, "convener", { turnId: "turn-b111-convener" });
    const convenerQueue = () => manager.deliveryQueues.get(manager.queueKey(root, "convener", "demo")) ?? [];

    // A1 回交入队（任务此刻仍 open ⇒ 真实报告链入队成功）。
    const a1 = handbackOf("t-b111-a1", "A1 完成", "turn-b111-a1-report");
    h.streams.worker!.push({ kind: "handback", summary: "A1 回交", handback: a1 } as OrchestrationEvent);
    await waitUntil(() => convenerQueue().length === 1 && convenerQueue()[0]!.handback?.taskId === "t-b111-a1", "A1 回交入队并保留");
    assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(a1))), false, "convener 忙时不投递");

    // A1 由创建者收口（RR6：22:47:15 task.closed accepted）——回交条目已排队，不因收口而消失。
    await closeTask(root, "t-b111-a1");

    // A2 回交到达（open fixed）：drain 应先丢弃 A1（closed）再处理 A2。
    const a2 = handbackOf("t-b111-a2", "A2 完成", "turn-b111-a2-report");
    h.streams.worker!.push({ kind: "handback", summary: "A2 回交", handback: a2 } as OrchestrationEvent);
    await waitUntil(() => convenerQueue().length === 1 && convenerQueue()[0]!.handback?.taskId === "t-b111-a2", "A1 被丢弃、A2 保留待投");
    assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(a1))), false, "已收口 A1 的回交不得投出");

    // convener 回合结束 ⇒ 队列续投 A2（目标核心：后续回交不再被堵）。
    h.streams.convener!.push({ kind: "settled", summary: "convener 回合结束" } as OrchestrationEvent);
    await waitUntil(() => h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(a2))), "A2 回交成功投递");

    // —— 事实断言 ——
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-b111-a1")?.closed?.outcome, "accepted", "A1 收口事实保留");
    assert.equal(state.records.get("t-b111-a1")?.reports.length, 1, "A1 报告不被丢弃分支改写");
    assert.equal(
      state.events.filter((event) => (event as { taskId?: string }).taskId === "t-b111-a1" && event.kind === "task.reported").length,
      1,
      "丢弃回交不得追加/伪造 task.reported",
    );
    assert.equal(
      state.events.some((event) => (event as { taskId?: string }).taskId === "t-b111-a1" && event.kind === "task.delivered"),
      false,
      "回交丢弃不得伪造 task.delivered",
    );
    assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(a1))), false, "A1 回交正文全程不投出");
    assert.equal(
      h.envelopes.some((envelope) => /fixed-handback-unverifiable|固定任务回交未投递|delivery-child-source-invalid/.test(envelope.event.summary ?? "")),
      false,
      "closed fixed child 不得再触发 fail-closed 系统行",
    );
    const diagnosticsText = await flushAndReadDiagnostics(diagnosticsDir);
    const skipLines = diagnosticsText.split(/\r?\n/).filter((line) => line.includes("delivery.skip.fixed-child-closed"));
    assert.equal(skipLines.length, 1, "closed fixed 回交丢弃恰记一条诊断");
    assert.equal(diagnosticsText.includes("fixed-handback-unverifiable"), false, "closed fixed child 不再判为不可核验");
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await cleanup(root);
  }
});

// ══════════════════════════ 1b. B19：closed stage-request 回交仍投递（RR14 修复） ══════════════════════════

test("B19 已收口 stage-request 回交仍投递 chief；closed 生产 child 丢弃语义不变", async () => {
  const root = await makeRoot("ans-b19-closed-stage-request-");
  const diagnosticsDir = path.join(root, ".diag");
  configureDiagnostics({ directory: diagnosticsDir });
  const h = harness(root);
  try {
    await fixedProject(root);
    const workflowId = "wf-b19stage0000000000000001";
    await seedStartedWorkflow(root, workflowId, "turn-b19-source");
    const created = taskEvent("task.created", {
      taskId: "t-b19-a2-sr", from: "chief", to: "convener", text: "A2 stage-request",
      sideEffect: "read-only", idempotencyKey: "key-t-b19-a2-sr", flowId: FIXED_FLOW,
      workflowId, stage: "A2", taskKind: "stage-request",
    }, () => new Date("2026-11-11T00:00:00.000Z"));
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    await closeTask(root, "t-b19-a2-sr", "chief");
    await h.mgr.listTasks(root);
    await openRole(h, root, "chief");
    await openRole(h, root, "convener");
    const handback = handbackOf(
      "t-b19-a2-sr",
      "A2 完成：意图已落盘，下一步 A3 意图卡",
      "turn-b19-a2-report",
      "convener",
    );
    h.streams.convener!.push({ kind: "handback", summary: "A2 回交", handback } as OrchestrationEvent);
    await waitUntil(
      () => (h.sent.chief ?? []).some((text) => text.includes("A2 完成：意图已落盘，下一步 A3 意图卡")),
      "closed stage-request 回交投递 chief",
    );
    const diagnosticsText = await flushAndReadDiagnostics(diagnosticsDir);
    assert.equal(diagnosticsText.includes("delivery.skip.fixed-child-closed"), false, "stage-request 不得按 closed child 丢弃");
    assert.equal(diagnosticsText.includes("report.enqueued"), true, "closed stage-request 报告应入队投递");
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-b19-a2-sr")?.closed?.outcome, "accepted", "closed 事实保留");
    assert.equal(
      state.events.some((event) => (event as { taskId?: string }).taskId === "t-b19-a2-sr" && event.kind === "task.delivered"),
      false,
      "投递不得伪造 task.delivered",
    );
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await cleanup(root);
  }
});

// ══════════════════════════ 2. open fixed 回交正常（不误伤） ══════════════════════════

test("B11.1 open fixed 回交照常投递：不产生 delivery.skip.fixed-child-closed 诊断", async () => {
  const root = await makeRoot("ans-b111-open-normal-");
  const diagnosticsDir = path.join(root, ".diag");
  configureDiagnostics({ directory: diagnosticsDir });
  const h = harness(root);
  try {
    await fixedProject(root);
    const workflowId = "wf-b111open0000000000000001";
    await seedStartedWorkflow(root, workflowId, "turn-b111-open-source");
    await appendCreated(root, { taskId: "t-b111-open", from: "convener", to: "worker", text: "open 任务", workflowId, stage: "A1" });
    await h.mgr.listTasks(root);
    await openRole(h, root, "worker");
    await openRole(h, root, "convener");
    const handback = handbackOf("t-b111-open", "open 完成", "turn-b111-open-report");
    h.streams.worker!.push({ kind: "handback", summary: "open 回交", handback } as OrchestrationEvent);
    await waitUntil(() => h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback))), "open fixed 回交投递");
    const diagnosticsText = await flushAndReadDiagnostics(diagnosticsDir);
    assert.equal(diagnosticsText.includes("delivery.skip.fixed-child-closed"), false, "open fixed child 不得出现 closed 丢弃诊断");
    assert.equal(
      h.envelopes.some((envelope) => /fixed-handback-unverifiable|固定任务回交未投递/.test(envelope.event.summary ?? "")),
      false,
      "open fixed 回交不得 fail-closed",
    );
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await cleanup(root);
  }
});

// ══════════════════════════ 3. 混合批：只丢 closed 成员，open 成员继续 ══════════════════════════

test("B11.1 混合 batchItems：只丢已收口成员，open 成员照常投递（不整批阻塞/不误投）", async () => {
  const root = await makeRoot("ans-b111-mixed-batch-");
  const diagnosticsDir = path.join(root, ".diag");
  configureDiagnostics({ directory: diagnosticsDir });
  const h = harness(root);
  const manager = h.mgr as unknown as ManagerInternals;
  try {
    await fixedProject(root);
    const workflowId = "wf-b111mixed0000000000000001";
    await seedStartedWorkflow(root, workflowId, "turn-b111-mixed-source");
    await appendCreated(root, { taskId: "t-b111-m1", from: "convener", to: "worker", text: "混合批 closed 成员", workflowId, stage: "A1" });
    await appendCreated(root, { taskId: "t-b111-m2", from: "convener", to: "worker", text: "混合批 open 成员", workflowId, stage: "A2" });
    await h.mgr.listTasks(root);
    await closeTask(root, "t-b111-m1");
    await openRole(h, root, "convener");

    const closedHandback = handbackOf("t-b111-m1", "closed 成员完成", "turn-b111-mixed-closed");
    const openHandback = handbackOf("t-b111-m2", "open 成员完成", "turn-b111-mixed-open");
    const closedText = "混合批回交正文【已收口成员】【不得投出】";
    const openText = "混合批回交正文【open 成员】【应投出】";
    const member = (handback: TaskHandback, text: string, summary: string) => ({
      kind: "handback", runtime: "demo", targetRoleId: "convener", sourceRoleId: "worker",
      text, summary, dedupKey: `mixed-${handback.taskId}`, handback, flowId: FIXED_FLOW,
    });
    const closedMember = member(closedHandback, closedText, "closed 成员");
    const openMember = member(openHandback, openText, "open 成员");
    // 恢复态的在途批条目：带 deliveryId + batchItems（drain 按 batchItems 逐成员投递）。
    manager.enqueueDelivery(root, "convener", {
      ...closedMember,
      deliveryId: "delivery-b111-mixed",
      batchItems: [closedMember, openMember],
    });
    await manager.drainQueue(root, "convener", "demo");

    await waitUntil(() => h.sent.convener.length > 0, "open 成员投出");
    assert.equal(h.sent.convener.some((text) => text.includes(openText)), true, "open 成员照常投递");
    assert.equal(h.sent.convener.some((text) => text.includes(closedText)), false, "closed 成员正文不得投出");
    assert.equal(h.sent.convener.some((text) => text.includes("【不得投出】")), false, "closed 成员正文任何片段不得投出");
    const diagnosticsText = await flushAndReadDiagnostics(diagnosticsDir);
    const skipLines = diagnosticsText.split(/\r?\n/).filter((line) => line.includes("delivery.skip.fixed-child-closed"));
    assert.equal(skipLines.length, 1, "混合批对 closed 成员恰记一条丢弃诊断");
    assert.equal(diagnosticsText.includes("fixed-handback-unverifiable"), false, "混合批不得整批判为不可投递");
    // 收口事实与报告不被丢弃/投递分支改写。
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-b111-m1")?.closed?.outcome, "accepted");
    assert.equal(state.records.get("t-b111-m2")?.closed, undefined);
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await cleanup(root);
  }
});

// ══════════════════════════ 4. legacy 回交路径逐字不变 ══════════════════════════

test("B11.1 legacy 回交旧路径不变：closed legacy child 仍走旧解析（不被 fixed closed 分支丢弃）", async () => {
  const root = await makeRoot("ans-b111-legacy-closed-");
  const diagnosticsDir = path.join(root, ".diag");
  configureDiagnostics({ directory: diagnosticsDir });
  const h = harness(root);
  const manager = h.mgr as unknown as ManagerInternals;
  try {
    await fixedProject(root);
    // legacy 子任务：有 flowId+runId，但没有 workflowId/parentTaskRef（旧机制形状）。
    await appendCreated(root, { taskId: "t-b111-legacy", from: "convener", to: "worker", text: "legacy 回交任务",
      flowId: FIXED_FLOW, runId: "run-b111-legacy", runState: "draft" });
    await h.mgr.listTasks(root);
    await openRole(h, root, "worker");
    await openRole(h, root, "convener");
    const handback = handbackOf("t-b111-legacy", "legacy 完成", "turn-b111-legacy-report");
    h.streams.worker!.push({ kind: "handback", summary: "legacy 回交", handback } as OrchestrationEvent);
    await waitUntil(() => h.envelopes.some((envelope) => /delivery-child-source-invalid/.test(envelope.event.summary ?? "")), "legacy 旧解析拒绝诊断");
    assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback))), false, "legacy 子任务回交不投递");

    // 关闭 legacy child 后再次 drain：旧解析路径逐字不变——仍按 delivery-child-source-invalid 保留队列项。
    await closeTask(root, "t-b111-legacy");
    const blockedNotesBefore = h.envelopes.filter((envelope) => /delivery-child-source-invalid/.test(envelope.event.summary ?? "")).length;
    await manager.drainQueue(root, "convener", "demo");
    await waitUntil(() => h.envelopes.filter((envelope) => /delivery-child-source-invalid/.test(envelope.event.summary ?? "")).length > blockedNotesBefore,
      "closed legacy child 仍走旧解析拒绝");
    assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback))), false, "closed legacy 回交不投递");
    const diagnosticsText = await flushAndReadDiagnostics(diagnosticsDir);
    assert.equal(diagnosticsText.includes("delivery.skip.fixed-child-closed"), false, "legacy child 不得命中 fixed closed 丢弃分支");
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await cleanup(root);
  }
});

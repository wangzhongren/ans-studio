// test/桌面应用/b82-fixed-workflow-binding-handback.test.ts
// T3「两条固定工作流路径」B8.2（2026-11-11，桌面窗口）：fixed 生产派发 workflowId 自动绑定 + fixed 回交。
// 依据：RR3 失败记录根因 2（运营无法获知 workflowId；9 次生产派发被 B7.1 证据门拒绝后回落 legacy
// stable-write）、B8.1 记录披露（fixed 生产任务回交在 legacy `resolveDeliveryAssignment`（要求 child
// `parentTaskRef`）处可能被 `delivery-child-source-invalid` 阻塞）；v1.3 §3.3/§4.2/§4.5/§7.1；
// B1 v1.2 AC-12/AC-18/AC-23/AC-30。
//
// 覆盖（全部确定性、假会话；不启动 Electron/真实模型）：
//   1. convener 生产派发缺 workflowId/stage（或完全不报 flowId）⇒ 应用从**当前真实受派 stage-request
//      任务**自动绑定 workflowId/stage/flowId，创建 fixed 任务并记 stage.dispatched；不写 trunk/run。
//   1b. 真实投递链：stage-request 投递到 convener 后，投递 origin 绑定真实任务 id（B8.2 绑定证据），
//      运营在该回合内的生产派发据此自动绑定（不依赖测试手工注入 origin.taskId）。
//   2. 绑定失败（无受派任务/伪造 taskId/legacy 受派任务/受派任务 workflow 不在账本）⇒
//      `workflow-binding-unavailable` fail-closed：不建任务、不投递、不写 trunk/run、不回落 legacy。
//   3. 模型显式自报 workflowId 与父任务不一致 ⇒ `stage-request-invalid`（不采信自报）；flowId 自报
//      不可信 ⇒ 绑定路径以父任务账本 flowId 为准（不因自报不同拒绝；stage 允许是下一目标阶段）。
//   4. B7.1 缺字段负例仍 fail-closed（幕僚 fixed 聊天 stage-request 缺字段 / 普通派发缺 workflowId+stage）。
//   5. fixed 子任务回交 convener：不经 legacy `resolveDeliveryAssignment`，成功投递（含 convener 忙时
//      续投）；自动打开的 convener 会话为 forced fixed；legacy 子任务回交仍走旧解析（未被 fixed 分支劫持）。
//   6. fixed 回交安全校验失败（角色不匹配/workflow 已关闭）⇒ fail-closed 诊断、不误投。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager, type DesktopOrchestrationEvent } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent, readWorkflowLedger, requestStage } from "../../src/common/编排/workflow-service.ts";
import { renderWorkReportPrompt, type OrchestrationEvent, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchReceipt, DispatchTaskPayload, WorkflowEvent } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, label = "实际事件", timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
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

/** trio 内置六角色 + 项目角色 worker（回交/派发目标）。 */
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
    // 每个句柄自己的停止标记（同一角色可能被安全重绑：旧句柄 dispose 不得影响新句柄的事件泵）。
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

/** 断言 fixed 拒绝/绑定**零 legacy 写盘**：无 fixed 生产任务外的 legacy run/trunk/stable 账本。 */
async function assertNoLegacyWrites(root: string): Promise<void> {
  let runEntries: string[] = [];
  try { runEntries = await fs.readdir(path.join(root, ".ans", "runs")); } catch { runEntries = []; }
  assert.equal(runEntries.filter((name) => name.startsWith("run-")).length, 0, "不得写 legacy run");
  await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")), ".ans/trunk 不得被写");
  await assert.rejects(fs.stat(path.join(root, ".ans", "state", "stable-writes.json")), "legacy stable-writes 不得被写");
}

async function fixedProject(root: string): Promise<void> {
  await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
}

const FIXED_FLOW = "snake";
const stageDigest = (text: string) => createHash("sha256").update(text).digest("hex");

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

const productionTaskCount = async (root: string): Promise<number> =>
  [...(await readTaskState(root)).records.values()].filter((record) => record.created?.to === "product").length;

const handbackOf = (taskId: string, summary: string, turnId: string, roleId = "product"): TaskHandback => ({
  roleId, taskId, status: "completed", summary, evidence: [], at: "2026-11-11T00:00:02.000Z", turnId,
});

// ══════════════════════════ 1. 自动绑定（RR3 根因 2） ══════════════════════════

test("B8.2 自动绑定：convener 缺 workflowId/stage ⇒ 从真实受派 stage-request 任务绑定并创建 fixed 任务（不写 trunk/run）", async () => {
  const root = await makeRoot("ans-b82-bind-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const stageRequest = await requestStage({
      projectRoot: root, flowId: FIXED_FLOW, stage: "A1", workflowPath: "A", requestDigest: stageDigest("推进 A1"),
      sourceTaskId: "turn-b82-bind-src", text: "推进 A1：请派产品撰写意图",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    await openRole(h, root, "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: stageRequest.taskId, turnId: "turn-b82-bind-convener" });
    // 运营的真实派发形状：只有 flowId，没有 workflowId/stage（RR3 9 次被拒的同款形状）。
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "product", task: "A1 撰写产品意图文档", flowId: FIXED_FLOW, sideEffect: "docs",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.equal((receipt.message ?? "").includes("stage-request-required"), false, "不得回落 stage-request-required/legacy 拒绝");
    const state = await readTaskState(root);
    const production = [...state.records.values()].find((record) => record.created?.to === "product");
    assert.ok(production?.created, "应创建 fixed 生产任务");
    assert.equal(production!.created!.from, "convener");
    assert.equal(production!.created!.workflowId, stageRequest.workflowId, "workflowId 由受派任务自动绑定");
    assert.equal(production!.created!.stage, "A1", "stage 由受派任务自动绑定");
    assert.equal(production!.created!.flowId, FIXED_FLOW, "flowId 与受派任务一致");
    assert.equal(production!.created!.runId, undefined, "fixed 任务不得带 runId");
    const ledger = await readWorkflowLedger(root);
    const dispatched = ledger.events.filter((event) =>
      event.workflowId === stageRequest.workflowId && event.kind === "stage.dispatched" && event.stage === "A1");
    assert.equal(dispatched.length, 1, "stage.dispatched A1 按真实 task.created 记录");
    assert.equal(dispatched[0]!.kind === "stage.dispatched" && dispatched[0]!.taskId, production!.taskId);
    await assertNoLegacyWrites(root);
    await waitUntil(() => (h.sent.product?.length ?? 0) > 0, "product 收到生产任务");
    assert.match(h.sent.product![0]!, /A1 撰写产品意图文档/);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("B8.2 自动绑定：convener 连 flowId 都不报 ⇒ workflowId/stage/flowId 全部由受派任务绑定", async () => {
  const root = await makeRoot("ans-b82-bind-all-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const stageRequest = await requestStage({
      projectRoot: root, flowId: FIXED_FLOW, stage: "A1", workflowPath: "A", requestDigest: stageDigest("推进 A1 全绑定"),
      sourceTaskId: "turn-b82-bind-all-src", text: "推进 A1：请派产品",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    await openRole(h, root, "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: stageRequest.taskId, turnId: "turn-b82-bind-all-convener" });
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "product", task: "A1 撰写产品意图文档（全绑定）", sideEffect: "docs",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const production = [...(await readTaskState(root)).records.values()].find((record) => record.created?.to === "product");
    assert.ok(production?.created);
    assert.equal(production!.created!.workflowId, stageRequest.workflowId);
    assert.equal(production!.created!.stage, "A1");
    assert.equal(production!.created!.flowId, FIXED_FLOW, "flowId 缺失时同样由受派任务绑定");
    await assertNoLegacyWrites(root);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 2. 真实投递链（origin.taskId 绑定） ══════════════════════════

test("B8.2 真实投递链：stage-request 投递后运营 origin 绑定真实任务，生产派发据其自动绑定 workflowId", async () => {
  const root = await makeRoot("ans-b82-real-chain-");
  const h = harness(root);
  try {
    await fixedProject(root);
    await openRole(h, root, "chief");
    const chiefLive = liveSource(h.mgr, root, "chief", { turnId: "turn-b82-real-chain" });
    const stageRequest = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A1：请派产品撰写意图", flowId: FIXED_FLOW,
      taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only",
    }, chiefLive);
    releaseSource(h.mgr, chiefLive);
    assert.equal(stageRequest.ok, true, stageRequest.message ?? "");
    const srTask = [...(await readTaskState(root)).records.values()]
      .find((record) => record.created?.taskKind === "stage-request");
    assert.ok(srTask?.created, "stage-request 任务应已创建");
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0, "convener 收到 stage-request");
    const manager = h.mgr as unknown as {
      sessionKey(projectRoot: string, roleId: string, runtime: string): string;
      sessions: Map<string, { busy: boolean; origins: { running?: { settled: boolean; taskId?: string } } }>;
    };
    const entry = manager.sessions.get(manager.sessionKey(root, "convener", "demo"));
    assert.ok(entry, "convener 会话应已自动打开（B8.1 forced fixed）");
    const origin = entry!.origins.running;
    assert.ok(origin, "投递回合 origin 应在跑");
    // 关键：fixed 派发投递跳过 legacy assignment，但仍须把 origin 绑定到真实 task.created（B8.2 绑定证据）。
    assert.equal(origin!.taskId, srTask!.taskId, "fixed 派发投递的运营 origin 绑定真实 stage-request 任务");
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "product", task: "A1 撰写产品意图（真实投递链）", flowId: FIXED_FLOW, sideEffect: "docs",
    }, { entry: entry as never, origin: origin as never });
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const production = [...(await readTaskState(root)).records.values()].find((record) => record.created?.to === "product");
    assert.ok(production?.created, "应创建 fixed 生产任务");
    assert.equal(production!.created!.workflowId, srTask!.created!.workflowId, "workflowId 自动绑定自真实受派任务");
    assert.equal(production!.created!.stage, "A1");
    assert.equal(production!.created!.flowId, FIXED_FLOW);
    await assertNoLegacyWrites(root);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 3. 绑定失败 fail-closed ══════════════════════════

test("B8.2 绑定失败：无受派任务/伪造 taskId/legacy 受派任务/受派任务 workflow 不在账本 ⇒ workflow-binding-unavailable（零写盘、不回落 legacy）", async () => {
  // (a) 无受派任务（运营会话不在任务回合内）。
  {
    const root = await makeRoot("ans-b82-unbound-none-");
    const h = harness(root);
    try {
      await fixedProject(root);
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { turnId: "turn-b82-none" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "product", task: "A1 撰写意图（无父任务）", flowId: FIXED_FLOW, sideEffect: "docs",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /workflow-binding-unavailable/);
      assert.equal(await productionTaskCount(root), 0, "不得创建任务");
      await assertNoLegacyWrites(root);
      assert.equal((h.sent.product ?? []).length, 0, "不得投递");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // (b) 伪造 taskId（账本不存在）。
  {
    const root = await makeRoot("ans-b82-unbound-forged-");
    const h = harness(root);
    try {
      await fixedProject(root);
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b82-forged", turnId: "turn-b82-forged" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "product", task: "A1 撰写意图（伪造父任务）", flowId: FIXED_FLOW, sideEffect: "docs",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /workflow-binding-unavailable/);
      assert.equal(await productionTaskCount(root), 0);
      await assertNoLegacyWrites(root);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // (c) legacy 受派任务（有 flowId+runId，无 workflowId）——不得被当作 fixed 绑定源。
  {
    const root = await makeRoot("ans-b82-unbound-legacy-");
    const h = harness(root);
    try {
      await fixedProject(root);
      const appended = await appendTaskEvent(root, taskEvent("task.created", {
        taskId: "t-b82-legacy-parent", from: "chief", to: "convener", text: "legacy 受派任务",
        flowId: FIXED_FLOW, runId: "run-b82-legacy", runState: "draft", sideEffect: "read-only",
        idempotencyKey: "key-b82-legacy-parent",
      }, () => new Date("2026-11-11T00:00:00.000Z")));
      assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b82-legacy-parent", turnId: "turn-b82-legacy" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "product", task: "A1 撰写意图（legacy 父任务）", flowId: FIXED_FLOW, sideEffect: "docs",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /workflow-binding-unavailable/);
      assert.equal(await productionTaskCount(root), 0);
      await assertNoLegacyWrites(root);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // (d) 受派任务是 fixed stage-request，但其 workflowId 不在 workflows 账本（账本失真 ⇒ 不猜）。
  {
    const root = await makeRoot("ans-b82-unbound-ghostwf-");
    const h = harness(root);
    try {
      await fixedProject(root);
      const ghostWorkflowId = "wf-b82ghost0000000000000001";
      const appended = await appendTaskEvent(root, taskEvent("task.created", {
        taskId: "t-b82-ghost-parent", from: "chief", to: "convener", text: "推进 A1（账本缺失）",
        flowId: FIXED_FLOW, workflowId: ghostWorkflowId, stage: "A1", taskKind: "stage-request",
        sideEffect: "read-only", idempotencyKey: "key-b82-ghost-parent",
      }, () => new Date("2026-11-11T00:00:00.000Z")));
      assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b82-ghost-parent", turnId: "turn-b82-ghost" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "product", task: "A1 撰写意图（ghost workflow）", flowId: FIXED_FLOW, sideEffect: "docs",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /workflow-binding-unavailable/);
      assert.equal(await productionTaskCount(root), 0);
      await assertNoLegacyWrites(root);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

// ══════════════════════════ 3. 模型自报不一致 ⇒ 拒绝 ══════════════════════════

test("B8.2 自报不一致：显式 workflowId 与父任务不一致 ⇒ stage-request-invalid（不采信模型自报）", async () => {
  const root = await makeRoot("ans-b82-mismatch-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const stageRequest = await requestStage({
      projectRoot: root, flowId: FIXED_FLOW, stage: "A1", workflowPath: "A", requestDigest: stageDigest("推进 A1 不一致"),
      sourceTaskId: "turn-b82-mismatch-src", text: "推进 A1：请派产品",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    // 第二个 workflow（同 flow）——模型可能自造/记错 workflowId。
    const otherWorkflowId = "wf-b82other0000000000000001";
    await seedStartedWorkflow(root, otherWorkflowId, "turn-b82-other");
    await openRole(h, root, "convener");
    // (a) workflowId 不一致（stage 缺失走绑定路径，显式 workflowId 须与父任务一致）。
    {
      const live = liveSource(h.mgr, root, "convener", { taskId: stageRequest.taskId, turnId: "turn-b82-mismatch-a" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "product", task: "A1 撰写意图（错 workflowId）", flowId: FIXED_FLOW, workflowId: otherWorkflowId, sideEffect: "docs",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /stage-request-invalid/);
    }
    // (b) 显式 workflowId 一致但 stage 是"本次生产派发的目标阶段"（如 A7 请求后派 A8）——允许与父任务
    // stage 不同（B5.1 A8 夹具同一语义）；显式 self 报 stage 不因与父任务不同而拒绝。
    // (c) flowId 自报不可信 ⇒ 绑定路径以账本 flowId 为准（见下一测试）。
    assert.equal(await productionTaskCount(root), 0, "不一致拒绝不得创建任务");
    await assertNoLegacyWrites(root);
    assert.equal((h.sent.product ?? []).length, 0, "不一致拒绝不得投递");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("B8.2 自报 flowId 不可信：绑定路径以受派任务账本 flowId 为准（不因自报不同拒绝合法派发）", async () => {
  const root = await makeRoot("ans-b82-flowid-override-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const stageRequest = await requestStage({
      projectRoot: root, flowId: FIXED_FLOW, stage: "A1", workflowPath: "A", requestDigest: stageDigest("推进 A1 flowId 覆盖"),
      sourceTaskId: "turn-b82-flowid-src", text: "推进 A1：请派产品",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    await openRole(h, root, "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: stageRequest.taskId, turnId: "turn-b82-flowid-convener" });
    // 运营按 legacy 口径记错 flowId（RR3 的 `flow snake-game` 场景）——应用以受派任务账本 flowId 为准。
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "product", task: "A1 撰写产品意图（自报 flowId 不同）", flowId: "other-flow", sideEffect: "docs",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const production = [...(await readTaskState(root)).records.values()].find((record) => record.created?.to === "product");
    assert.ok(production?.created, "应创建 fixed 生产任务");
    assert.equal(production!.created!.flowId, FIXED_FLOW, "任务创建使用绑定 flowId（不采信自报）");
    assert.equal(production!.created!.workflowId, stageRequest.workflowId);
    assert.equal(production!.created!.stage, "A1");
    await assertNoLegacyWrites(root);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 4. B7.1 缺字段负例仍 fail-closed ══════════════════════════

test("B8.2 回归钉：幕僚 fixed 聊天缺字段负例仍 fail-closed（stage-request 缺 workflowPath / 普通派发缺 workflowId+stage）", async () => {
  // stage-request 缺 workflowPath ⇒ stage-request-invalid。
  {
    const root = await makeRoot("ans-b82-b71-sr-");
    const h = harness(root);
    try {
      await openRole(h, root, "chief");
      const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b82-b71-sr" });
      const receipt = await routeDispatch(h.mgr, root, "chief", {
        roleId: "convener", task: "推进 A1", flowId: FIXED_FLOW, taskKind: "stage-request",
        stage: "A1", workflowAction: "advance", sideEffect: "read-only",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /stage-request-invalid/);
      assert.equal((await readTaskState(root)).records.size, 0, "拒绝不得创建任务");
      await assertNoLegacyWrites(root);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 幕僚普通派发缺 workflowId+stage ⇒ stage-request-required（B8.2 只放开运营）。
  {
    const root = await makeRoot("ans-b82-b71-plain-");
    const h = harness(root);
    try {
      await openRole(h, root, "chief");
      const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b82-b71-plain" });
      const receipt = await routeDispatch(h.mgr, root, "chief", {
        roleId: "product", task: "写产品意图", flowId: FIXED_FLOW, sideEffect: "docs",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /stage-request-required/);
      assert.equal((await readTaskState(root)).records.size, 0);
      await assertNoLegacyWrites(root);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 既有 convener 显式 workflowId+stage 但无真实父任务 ⇒ 仍 stage-request-required（B7.1 证据门不变）。
  {
    const root = await makeRoot("ans-b82-b71-convener-");
    const h = harness(root);
    try {
      await fixedProject(root);
      const workflowId = "wf-b82b71000000000000000001";
      await seedStartedWorkflow(root, workflowId, "turn-b82-b71-convener");
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { turnId: "turn-b82-b71-convener-run" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "worker", task: "实现核心模块", flowId: FIXED_FLOW, workflowId, stage: "A1", sideEffect: "code",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /stage-request-required/);
      await assertNoLegacyWrites(root);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

// ══════════════════════════ 5. fixed 子任务回交 convener ══════════════════════════

test("B8.2 fixed 回交：worker→convener 不经 legacy resolve，成功投递（含 convener 忙时续投）；不出现 delivery-child-source-invalid", async () => {
  const root = await makeRoot("ans-b82-handback-fixed-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const stageRequest = await requestStage({
      projectRoot: root, flowId: FIXED_FLOW, stage: "A1", workflowPath: "A", requestDigest: stageDigest("推进 A1 回交"),
      sourceTaskId: "turn-b82-handback-src", text: "推进 A1：请派实现",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    await openRole(h, root, "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: stageRequest.taskId, turnId: "turn-b82-handback-convener" });
    const dispatched = await routeDispatch(h.mgr, root, "convener", {
      roleId: "worker", task: "实现 A1 核心模块", flowId: FIXED_FLOW, sideEffect: "code",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(dispatched.ok, true, dispatched.message ?? "");
    const production = [...(await readTaskState(root)).records.values()].find((record) => record.created?.to === "worker");
    assert.ok(production?.created, "fixed 生产任务应已创建");
    const taskId = production!.taskId;
    assert.equal(production!.created!.workflowId, stageRequest.workflowId, "生产任务已自动绑定 workflowId");
    // worker 会话由派发自动打开并收到任务。
    await waitUntil(() => (h.sent.worker?.length ?? 0) > 0, "worker 收到生产任务");

    // ① 回交到达：fixed 子任务 ⇒ 不调用 legacy resolveDeliveryAssignment，直接投 convener。
    const handback1 = handbackOf(taskId, "A1 实现完成", "turn-b82-worker-1", "worker");
    h.streams.worker!.push({ kind: "handback", summary: "worker 回交 1", handback: handback1 } as OrchestrationEvent);
    await waitUntil(() => h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback1))), "convener 收到 fixed 回交");
    assert.equal(h.sent.convener.some((text) => text.includes("delivery-child-source-invalid")), false, "不得出现 legacy 子来源拒绝");
    assert.equal(
      h.envelopes.some((envelope) => /delivery-child-source-invalid/.test(envelope.event.summary ?? "")),
      false,
      "不得出现 legacy 子来源拒绝的系统行",
    );
    const state1 = await readTaskState(root);
    assert.equal(state1.records.get(taskId)?.reports[0]?.status, "done", "回交事实写 task.reported");

    // ② convener 忙（上一投递回合未 settle）⇒ 第二条回交排队保留；settle 后续投（不丢、不并发）。
    const sentBefore = h.sent.convener.length;
    const handback2 = handbackOf(taskId, "A1 实现补充说明", "turn-b82-worker-2", "worker");
    h.streams.worker!.push({ kind: "handback", summary: "worker 回交 2", handback: handback2 } as OrchestrationEvent);
    await tick(120);
    assert.equal(h.sent.convener.length, sentBefore, "convener 忙时回交排队（不并发投递）");
    h.streams.convener!.push({ kind: "settled", summary: "convener 一轮结束" } as OrchestrationEvent);
    await waitUntil(() => h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback2))), "settle 后续投第二条回交");
    await assertNoLegacyWrites(root);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("B8.2 fixed 回交自动打开 convener 会话：forced fixed（不按项目聊天解析/不落 legacy 注入）", async () => {
  const root = await makeRoot("ans-b82-handback-open-");
  const h = harness(root);
  try {
    await fixedProject(root);
    const workflowId = "wf-b82hback00000000000000001";
    await seedStartedWorkflow(root, workflowId, "turn-b82-handback-open");
    const appended = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-b82-fixed-child", from: "convener", to: "worker", text: "实现回交任务",
      flowId: FIXED_FLOW, workflowId, stage: "A1", sideEffect: "code", idempotencyKey: "key-b82-fixed-child",
    }, () => new Date("2026-11-11T00:00:00.000Z")));
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    await h.mgr.listTasks(root); // 登记星形任务 id（真实恢复路径同源）
    await openRole(h, root, "worker");
    // 不预先打开 convener：回交 drain 应自动开启固定会话（forced fixed）。
    const handback = handbackOf("t-b82-fixed-child", "实现完成", "turn-b82-open-worker", "worker");
    h.streams.worker!.push({ kind: "handback", summary: "worker 回交", handback } as OrchestrationEvent);
    await waitUntil(() => h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback))), "convener 自动打开并收到回交");
    const convenerOpen = h.inputs.find((input) => input.roleId === "convener");
    assert.ok(convenerOpen !== undefined, "应自动打开 convener 会话");
    assert.equal(convenerOpen!.workflowMode, "fixed", "fixed 回交的目标会话 forced fixed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("B8.2 legacy 回交旧路径不变：legacy 子任务（无 workflowId、无 parentTaskRef）仍按旧解析拒绝 delivery-child-source-invalid", async () => {
  const root = await makeRoot("ans-b82-handback-legacy-");
  const h = harness(root);
  try {
    await fixedProject(root);
    // legacy 子任务：有 flowId+runId，但没有 workflowId/parentTaskRef（旧机制形状）。
    const appended = await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-b82-legacy-child", from: "convener", to: "worker", text: "legacy 回交任务",
      flowId: FIXED_FLOW, runId: "run-b82-legacy-child", runState: "draft", sideEffect: "code",
      idempotencyKey: "key-b82-legacy-child",
    }, () => new Date("2026-11-11T00:00:00.000Z")));
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    await h.mgr.listTasks(root);
    await openRole(h, root, "worker");
    await openRole(h, root, "convener");
    const handback = handbackOf("t-b82-legacy-child", "legacy 完成", "turn-b82-legacy-worker", "worker");
    h.streams.worker!.push({ kind: "handback", summary: "worker legacy 回交", handback } as OrchestrationEvent);
    await waitUntil(() => h.envelopes.some((envelope) => /delivery-child-source-invalid/.test(envelope.event.summary ?? "")), "legacy 旧解析拒绝诊断");
    assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback))), false, "legacy 子任务回交不得被 fixed 分支误投");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 6. fixed 回交校验失败 ⇒ fail-closed ══════════════════════════

test("B8.2 fixed 回交安全校验失败：角色不匹配 / workflow 已关闭 ⇒ fail-closed 诊断、不误投", async () => {
  // (a) 回交角色与任务受派人不一致。
  {
    const root = await makeRoot("ans-b82-hb-mismatch-");
    const h = harness(root);
    try {
      await fixedProject(root);
      const workflowId = "wf-b82hbident000000000000001";
      await seedStartedWorkflow(root, workflowId, "turn-b82-hb-ident");
      const appended = await appendTaskEvent(root, taskEvent("task.created", {
        taskId: "t-b82-hb-ident", from: "convener", to: "worker", text: "回交身份核对",
        flowId: FIXED_FLOW, workflowId, stage: "A1", sideEffect: "code", idempotencyKey: "key-b82-hb-ident",
      }, () => new Date("2026-11-11T00:00:00.000Z")));
      assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
      await h.mgr.listTasks(root);
      await openRole(h, root, "worker");
      await openRole(h, root, "convener");
      const forged = handbackOf("t-b82-hb-ident", "冒名回交", "turn-b82-hb-ident", "product");
      h.streams.worker!.push({ kind: "handback", summary: "冒名回交", handback: forged } as OrchestrationEvent);
      // 冒名报告在更早的 task.reported 事实门即被拒绝（from 与任务受派人不一致 ⇒ task-observation-invalid），
      // 连投递队列都不会进入；B8.2 的账本校验是同方向的第二道防线。两条路径都不得误投。
      await waitUntil(() => h.envelopes.some((envelope) =>
        /task-observation-invalid|任务报告已保存但状态登记失败|固定任务回交未投递/.test(envelope.event.summary ?? "")), "冒名回交 fail-closed 诊断");
      assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(forged))), false, "身份不匹配不得投递");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // (b) workflow 已关闭。
  {
    const root = await makeRoot("ans-b82-hb-closed-");
    const h = harness(root);
    try {
      await fixedProject(root);
      const workflowId = "wf-b82hbclosed00000000000001";
      await seedStartedWorkflow(root, workflowId, "turn-b82-hb-closed");
      const closed: WorkflowEvent = {
        v: 1, at: "2026-11-11T00:00:03.000Z", schema: "ans-workflow/v1", kind: "workflow.closed",
        workflowId, flowId: FIXED_FLOW, path: "A",
        idempotencyKey: `workflow-close:${workflowId}:delivered:seed`,
        outcome: "delivered", reason: "seed-close",
      };
      const appendedClosed = await appendWorkflowEvent(root, closed);
      assert.equal(appendedClosed.ok, true, appendedClosed.ok === false ? appendedClosed.message : "");
      const appended = await appendTaskEvent(root, taskEvent("task.created", {
        taskId: "t-b82-hb-closed", from: "convener", to: "worker", text: "关闭后回交",
        flowId: FIXED_FLOW, workflowId, stage: "A1", sideEffect: "code", idempotencyKey: "key-b82-hb-closed",
      }, () => new Date("2026-11-11T00:00:00.000Z")));
      assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
      await h.mgr.listTasks(root);
      await openRole(h, root, "worker");
      await openRole(h, root, "convener");
      const handback = handbackOf("t-b82-hb-closed", "关闭后完成", "turn-b82-hb-closed", "worker");
      h.streams.worker!.push({ kind: "handback", summary: "关闭后回交", handback } as OrchestrationEvent);
      await waitUntil(() => h.envelopes.some((envelope) => /workflow .*已关闭|固定任务回交未投递/.test(envelope.event.summary ?? "")), "workflow 关闭诊断");
      assert.equal(h.sent.convener.some((text) => text.includes(renderWorkReportPrompt(handback))), false, "workflow 关闭后不得投递");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

// test/桌面应用/b81-fixed-dispatch-forced-session.test.ts
// T3「两条固定工作流路径」B8.1（2026-11-11，桌面窗口）：fixed 派发/投递的目标会话**强制 fixed**。
// 依据：RR3 失败记录（fixed stage-request 已启动 workflow、A1 stage-request 已创建，但目标 convener 会话
// 在 dispatch 后以 legacy 打开——reasoning `run=none, legacy`，随后 `request_stable_write` 出
// `workflow · docs/workflow.md` legacy stable-write 卡，驱动以 `unexpected-card-kind` 停止）；
// 实现级方案 v1.3 §3.2/§3.6/§4.1；B1 v1.2 AC-12/AC-23；B6.1/B7.1 记录。
//
// 覆盖（全部确定性、假会话；不启动 Electron/真实模型）：
//   1. 混合项目（在飞 legacy run + fixed workflow）：聊天入口解析为 legacy、workflow 账本按 per-flow 为
//      fixed ⇒ fixed stage-request 派发自动打开的目标 convener 会话仍**强制 fixed**（open 入参带
//      `workflowMode:"fixed"`、无 legacy 工具面尤其 `request_stable_write`、fixed context 与 fixed
//      `contract_check` 视图）；打开不按 taskId 绑定（无 taskId 也 fixed——账本可见性与聊天解析不一致的竞态）。
//   2. 已存在的 legacy convener 会话 ⇒ 安全关闭（旧句柄 dispose）并以 fixed 重开；投递落在新会话。
//   3. 已存在的 legacy convener 会话 busy ⇒ fail-closed `fixed-session-rebind-blocked`：不关闭、不投递
//      （任务已登记但如实记失败；绝不向 legacy 会话投递）。
//   4. 投递机 drain 自动打开固定任务目标 ⇒ 同样强制 fixed（固定任务来源；任务条目无 taskId 绑定也生效）。
//   5. legacy（非固定）任务投递自动打开目标 ⇒ 不传强制模式，目标仍 legacy 注入（旧路径逐字不变）。
//   6. forced fixed 打开触发的 O-1 边界陈旧重建 ⇒ 重建后的会话仍 fixed（强制模式透传内部重开）。
// 不新增 skip/force-exit；旧断言不变。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { resolveFixedPathMode, sessionWorkflowModeForChat } from "../../app/desktop/workflow.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent } from "../../src/common/编排/workflow-service.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type {
  ContractCheckInput,
  DispatchReceipt,
  DispatchTaskPayload,
  WorkflowEvent,
} from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
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
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}`, kind: "directory", purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
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
      worker("worker"),
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
  contractCheck?: (input: ContractCheckInput) => Promise<string>;
  dispatchTask?: unknown;
  [key: string]: unknown;
}

function harness(root: string) {
  const sent: Record<string, string[]> = {};
  const inputs: CapturedInput[] = [];
  const disposed: string[] = [];
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
      const handle: RoleSessionHandle = {
        async send(text: string, _options?: RoleSessionSendOptions) {
          (sent[input.roleId] ??= []).push(text);
        },
        events() {
          let i = 0;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  for (let tries = 0; tries < 40; tries += 1) {
                    const arr = (extraStreams[input.roleId] ?? []);
                    if (i < arr.length) return { value: arr[i++]!, done: false };
                    await tick(5);
                  }
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {
          disposed.push(input.roleId);
        },
      };
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    getVersionChangeStack: () => versionChangeStack as never,
    emitEvent: () => {},
  });
  const extraStreams: Record<string, OrchestrationEvent[]> = {};
  return { mgr, sent, inputs, disposed, extraStreams };
}

interface LiveSource {
  entry: unknown;
  origin: { settled: boolean; turnId?: string; taskId?: string };
}

/** 伪造**真实活条目 + 当前轮次**（Q6 来源证据；测试不启动模型，直接定格会话条目事实）。 */
function liveSource(mgr: SessionManager, root: string, roleId: string, runtime = "demo", overrides: Partial<LiveSource["origin"]> = {}): LiveSource {
  const manager = mgr as unknown as {
    sessionKey(projectRoot: string, roleId: string, runtime: string): string;
    sessions: Map<string, { busy: boolean; origins: { running?: unknown }; sessionWorkflowMode?: string }>;
  };
  const entry = manager.sessions.get(manager.sessionKey(root, roleId, runtime));
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

interface DrainInternals {
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Record<string, unknown>): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: "demo"): Promise<void>;
}

/** 直接经投递机入队 + drain（覆盖「任务投递时目标会话被自动打开」的自动开启面）。 */
async function drainItem(mgr: SessionManager, root: string, targetRoleId: string, item: Record<string, unknown>): Promise<void> {
  const manager = mgr as unknown as DrainInternals;
  manager.enqueueDelivery(root, targetRoleId, item);
  await manager.drainQueue(root, targetRoleId, "demo");
}

async function openChat(h: ReturnType<typeof harness>, root: string, roleId: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo" });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "聊天会话打开失败") : "");
  const before = h.inputs.filter((item) => item.roleId === roleId).length;
  const input = h.inputs.filter((item) => item.roleId === roleId)[before - 1];
  assert.ok(input !== undefined, `应捕获 ${roleId} 聊天会话的 openRoleSession 入参`);
  return input!;
}

function startedEvent(workflowId: string, flowId: string, sourceTaskId = "turn-seed"): WorkflowEvent {
  return {
    v: 1, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1", kind: "workflow.started",
    workflowId, flowId, path: "A",
    idempotencyKey: `workflow-start:${flowId}:A:${sourceTaskId}`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId,
  };
}

async function seedWorkflow(root: string, workflowId: string, flowId: string): Promise<void> {
  const appended = await appendWorkflowEvent(root, startedEvent(workflowId, flowId));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

/**
 * 混合项目：在飞 legacy run（另一 flow）+ 一条 fixed workflow（`snake`）。
 * - 聊天入口（无 taskId）解析为 **legacy**（`hasLegacyProjectState`：draft run ⇒ legacy）；
 * - per-flow 解析（`snake`）为 **fixed**（编排 `workflowMode`：该 flow 无 legacy run/trunk）。
 * 这正是 RR3 的会话打开竞态：workflow 账本已可见、聊天解析却仍是 legacy。
 */
async function mixedProject(root: string): Promise<void> {
  await writeJson(root, ".ans/project.json", { governanceModel: "trio" });
  await writeJson(root, ".ans/runs/run-20261110-legacy-99999999/manifest.json", {
    schema: "ans-run/v1", runId: "run-20261110-legacy-99999999", flowId: "legacy-flow", state: "draft",
  });
  await seedWorkflow(root, "wf-b81forced00000000000000001", "snake");
}

const fullStageRequest = (overrides: Partial<DispatchTaskPayload> = {}): DispatchTaskPayload => ({
  roleId: "convener",
  task: "推进 A1：请派产品撰写意图",
  flowId: "snake",
  taskKind: "stage-request",
  workflowPath: "A",
  stage: "A1",
  workflowAction: "advance",
  sideEffect: "read-only",
  ...overrides,
});

// ══════════════════════════ 1. fixed 派发自动打开目标会话 ⇒ 强制 fixed ══════════════════════════

test("混合项目（聊天 legacy / flow fixed）：fixed stage-request 派发自动打开 convener ⇒ 强制 fixed、无 legacy 工具、fixed 契约", async () => {
  const root = await makeRoot("ans-b81-force-open-");
  const h = harness(root);
  try {
    await mixedProject(root);
    // 竞态前提：聊天解析 legacy、账本 per-flow 解析 fixed（RR3 现场）。
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "在飞 legacy run ⇒ 聊天入口解析 legacy");
    assert.equal(await resolveFixedPathMode(root, "snake"), "fixed", "workflow 账本已可见 ⇒ snake 按 fixed 解析");
    await openChat(h, root, "chief");

    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-b81-forced" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");

    await waitUntil(() => h.inputs.some((input) => input.roleId === "convener"));
    const convener = h.inputs.find((input) => input.roleId === "convener");
    assert.ok(convener !== undefined, "目标 convener 会话应被自动打开");
    assert.equal(convener!.workflowMode, "fixed", "目标会话必须强制 fixed（RR3：legacy 打开 ⇒ request_stable_write 卡）");
    assert.equal(convener!.taskId, undefined, "fixed 派发不按 taskId 绑定打开（无 taskId 也 fixed）");
    // legacy 工具面缺席（尤其 request_stable_write / legacy Git / VCA / stable 许可）。
    for (const tool of ["requestStableWrite", "submitRefactor", "submitVersionChange", "requestVersionDecision",
      "stablePermitOf", "gitQuery", "gitCandidate", "gitPublish"]) {
      assert.equal(convener![tool], undefined, `fixed 目标会话不得注入 legacy 能力 ${tool}`);
    }
    assert.equal("requestReleaseMerge" in convener!, false, "G-IR：不新增 request_release_merge");
    // fixed context/应用能力在场（project_note 仅幕僚，不在此列）。
    for (const retained of ["completeTeamPlan", "closeCreatedTaskFixed", "contractCheck", "docFormat", "evidenceCheck", "projectState"]) {
      assert.equal(convener![retained] !== undefined, true, `fixed 目标会话保留 ${retained}`);
    }
    // contract_check 走 fixed 视图（B7.1 会话级模式由 forced 值生效）。
    const text = await convener!.contractCheck!({ flowId: "snake", taskKind: "dispatch" });
    assert.ok(text.includes("run：fixed（无 run；固定路径由 stage-request 驱动）"), "fixed 契约视图 run 行");
    assert.equal(text.includes("run：legacy"), false, "fixed 契约视图不得输出 legacy run 行");
    assert.equal(text.includes("runId(pinned)"), false, "fixed 契约视图不得输出 legacy runId(pinned)");

    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0);
    assert.match(h.sent.convener![0]!, /推进 A1/);
    const task = [...(await readTaskState(root)).records.values()].find((item) => item.created?.taskKind === "stage-request");
    assert.ok(task?.created, "stage-request 任务应已创建");
    assert.equal(task!.created!.workflowId !== undefined, true, "fixed 任务带 workflowId");
    assert.equal(task!.created!.runId, undefined, "fixed 任务无 legacy runId");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 2. 已存在 legacy convener ⇒ 安全关闭并 fixed 重开 ══════════════════════════

test("已存在 legacy convener 会话 ⇒ dispose + 以 fixed 重开；投递落在新 fixed 会话", async () => {
  const root = await makeRoot("ans-b81-rebind-");
  const h = harness(root);
  try {
    await mixedProject(root);
    const legacyConvener = await openChat(h, root, "convener");
    assert.equal(legacyConvener.workflowMode, undefined, "首开 convener 聊天按项目状态为 legacy（前提）");
    assert.equal(legacyConvener.requestStableWrite !== undefined, true, "legacy convener 会话有 stable-write 能力（RR3 风险面）");
    const sessions = (h.mgr as unknown as { sessions: Map<string, { sessionWorkflowMode?: string }> }).sessions;
    const convenerKeyOf = () => [...sessions.entries()].find(([key]) => key.includes("\u0000convener\u0000"))?.[1];
    assert.equal(convenerKeyOf()?.sessionWorkflowMode, "legacy", "既有条目记录为 legacy");

    await openChat(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-b81-rebind" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");

    assert.ok(h.disposed.includes("convener"), "既有 legacy convener 会话应被安全关闭（旧句柄 dispose）");
    const convenerInputs = h.inputs.filter((input) => input.roleId === "convener");
    assert.equal(convenerInputs.length, 2, "legacy 首开 + fixed 重开各一次");
    const reopened = convenerInputs[1]!;
    assert.equal(reopened.workflowMode, "fixed", "重开的 convener 会话必须 fixed");
    assert.equal(reopened.requestStableWrite, undefined, "重开会话无 request_stable_write");
    assert.equal(convenerKeyOf()?.sessionWorkflowMode, "fixed", "会话表条目已替换为 fixed 会话");
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0);
    assert.match(h.sent.convener![0]!, /推进 A1/, "任务投递到新 fixed 会话");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 3. legacy convener busy ⇒ fail-closed ══════════════════════════

test("已存在 legacy convener 会话 busy ⇒ fixed-session-rebind-blocked fail-closed：不关闭、不投递 legacy", async () => {
  const root = await makeRoot("ans-b81-rebind-blocked-");
  const h = harness(root);
  try {
    await mixedProject(root);
    await openChat(h, root, "convener");
    const busy = liveSource(h.mgr, root, "convener", "demo", { turnId: "turn-b81-busy" });
    await openChat(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-b81-blocked" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, false, "busy 的 legacy 目标无法以 fixed 重开 ⇒ fail-closed");
    assert.match(receipt.message ?? "", /fixed-session-rebind-blocked/, "稳定码");
    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 0, "busy 会话不得被关闭");
    assert.equal(h.inputs.filter((input) => input.roleId === "convener").length, 1, "不得以 fixed 重开（会话仍 busy）");
    assert.equal(h.sent.convener, undefined, "不得向 legacy 会话投递 fixed 任务");
    // 任务已登记但如实记失败（既有 open-failure 口径；不伪造投递）。
    const records = [...(await readTaskState(root)).records.values()];
    const request = records.find((item) => item.created?.taskKind === "stage-request");
    assert.ok(request?.created, "stage-request 任务已在 open 失败前登记");
    assert.equal(request!.reports.some((report) => report.status === "failed"), true, "open 失败如实记 task.reported failed");
    releaseSource(h.mgr, busy);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 4. 投递机 drain 自动打开固定任务目标 ⇒ 强制 fixed ══════════════════════════

test("投递机 drain 自动打开固定任务目标 ⇒ 同样强制 fixed（无 taskId 绑定、无 legacy 工具）", async () => {
  const root = await makeRoot("ans-b81-drain-fixed-");
  const h = harness(root);
  try {
    await mixedProject(root);
    const taskId = "t-b81-drain-fixed";
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId, from: "chief", to: "convener", text: "drain 固定任务：推进 A2", flowId: "snake",
      workflowId: "wf-b81forced00000000000000001", stage: "A2", sideEffect: "read-only", idempotencyKey: "b81-drain-fixed-1",
    }));
    await drainItem(h.mgr, root, "convener", {
      kind: "dispatch", runtime: "demo", targetRoleId: "convener", sourceRoleId: "chief", taskId,
      text: "drain 固定任务：推进 A2", summary: "[任务] drain", dedupKey: "b81-drain-fixed-key",
    });
    const convener = h.inputs.find((input) => input.roleId === "convener");
    assert.ok(convener !== undefined, "drain 应自动打开目标会话");
    assert.equal(convener!.workflowMode, "fixed", "固定任务来源 ⇒ drain 自动打开也强制 fixed");
    assert.equal(convener!.taskId, undefined, "内置目标不按 taskId 绑定打开（仍 fixed）");
    assert.equal(convener!.requestStableWrite, undefined, "drain 打开的 fixed 会话无 request_stable_write");
    assert.equal(convener!.closeCreatedTaskFixed !== undefined, true, "fixed context/应用能力在场");
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0);
    assert.match(h.sent.convener![0]!, /drain 固定任务/);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 5. legacy 任务投递 ⇒ 不传强制模式（旧路径逐字不变） ══════════════════════════

test("legacy（非固定）任务投递自动打开目标 ⇒ 不传强制模式，目标仍 legacy 注入", async () => {
  const root = await makeRoot("ans-b81-drain-legacy-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    const taskId = "t-b81-drain-legacy";
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId, from: "chief", to: "product", text: "写产品意图文档", flowId: "flow-a",
      sideEffect: "docs", idempotencyKey: "b81-drain-legacy-1",
    }), { allowLegacyRun: true });
    await drainItem(h.mgr, root, "product", {
      kind: "dispatch", runtime: "demo", targetRoleId: "product", sourceRoleId: "chief", taskId,
      text: "写产品意图文档", summary: "[任务] legacy", dedupKey: "b81-drain-legacy-key",
    });
    const product = h.inputs.find((input) => input.roleId === "product");
    assert.ok(product !== undefined, "drain 应自动打开目标会话");
    assert.equal(product!.workflowMode, undefined, "legacy 任务不得携带强制 fixed 常量");
    assert.equal(product!.submitVersionChange !== undefined, true, "legacy 目标保留 legacy 注入");
    assert.equal(product!.closeCreatedTaskFixed, undefined, "legacy 目标不注入 fixed close");
    await waitUntil(() => (h.sent.product?.length ?? 0) > 0);
    assert.match(h.sent.product![0]!, /写产品意图文档/);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 6. forced 打开连带 O-1 边界重建 ⇒ 仍 fixed ══════════════════════════

test("forced fixed 打开触发 O-1 边界陈旧重建 ⇒ 重建后的会话仍 fixed（强制模式透传内部重开）", async () => {
  const root = await makeRoot("ans-b81-rebuild-");
  const h = harness(root);
  try {
    await mixedProject(root);
    // 先以用户聊天打开（legacy），再用内部 forced 打开重绑为 fixed。
    await openChat(h, root, "convener");
    const manager = h.mgr as unknown as {
      openInternal(
        req: { projectRoot: string; roleId: string; runtime: "demo"; forcedWorkflowMode?: "fixed" },
        userInitiated: boolean,
      ): Promise<{ ok: boolean; error?: string }>;
    };
    const first = await manager.openInternal({ projectRoot: root, roleId: "convener", runtime: "demo", forcedWorkflowMode: "fixed" }, false);
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(h.inputs.filter((input) => input.roleId === "convener").length, 2, "legacy 首开 + forced fixed 重开");
    assert.equal(h.inputs.filter((input) => input.roleId === "convener")[1]?.workflowMode, "fixed");

    // 改 `.ans/project.json`（参与边界快照）⇒ 会话边界陈旧；再次 forced 打开触发 O-1 重建。
    await writeJson(root, ".ans/project.json", { governanceModel: "trio", note: "b81-boundary-stale" });
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "重建后聊天解析仍为 legacy（混合项目在飞 run）");
    const second = await manager.openInternal({ projectRoot: root, roleId: "convener", runtime: "demo", forcedWorkflowMode: "fixed" }, false);
    assert.equal(second.ok, true, second.error ?? "");
    const convenerInputs = h.inputs.filter((input) => input.roleId === "convener");
    assert.equal(convenerInputs.length, 3, "陈旧重建重开一次（旧句柄 dispose）");
    assert.equal(convenerInputs[2]?.workflowMode, "fixed", "重建后的会话仍强制 fixed（不被聊天解析换回 legacy）");
    assert.equal(convenerInputs[2]?.requestStableWrite, undefined, "重建后的 fixed 会话无 request_stable_write");
    assert.equal(h.disposed.filter((roleId) => roleId === "convener").length, 2, "legacy 重绑 + 陈旧重建各 dispose 一次");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

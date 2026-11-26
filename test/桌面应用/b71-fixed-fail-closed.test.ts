// test/桌面应用/b71-fixed-fail-closed.test.ts
// T3「两条固定工作流路径」B7.1（2026-11-11，桌面窗口）：fixed 会话 fail-closed + fixed 契约文本。
// 依据：RR2 失败记录（`fixed-stage-request-fail-open`：fixed 聊天中缺 workflowPath/stage 的
// stage-request 被当 legacy 星形派发受理并写 `.ans/runs`/`.ans/trunk`；`contract_check` 返回 legacy
// 口径误导模型）；v1.3 §3.3/§3.6/§4.1；B1 v1.2 AC-05/AC-06/AC-08/AC-12/AC-30。
//
// 覆盖（全部确定性、假会话；不启动 Electron/真实模型）：
//   1. fixed 聊天：stage-request 缺 workflowPath/stage/flowId/workflowAction/roleId、或值非法 ⇒
//      `stage-request-invalid`，零任务、零 `.ans/project.json`/`.ans/trunk`/`.ans/runs`、不投递。
//   2. fixed 聊天：完整 stage-request ⇒ `ensureFixedPathStarted` 写 workflowSchema + fixed 路由
//      （workflow.started、只读任务、无 runId、不写 `.ans/runs`）。
//   3. fixed 聊天：非 stage-request 且无 workflowId/stage ⇒ `stage-request-required`，不回落星形。
//   4. fixed 聊天：带 workflowId/stage 的 verifier 直派 ⇒ routeFixed（任务带 workflowId/stage、无 runId）。
//   5. legacy 项目：普通派发仍走 legacy 星形（建 run/task；无 fixed workflow.started）。
//   6. contract_check：fixed 视图不含 `run：legacy`/`runId(pinned)` 误导、含固定字段与 fixed 稳定码；
//      legacy/single 文本逐字不变；topic 早退不变；stage-request kind 在 legacy 视图不抛。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendWorkflowEvent, readWorkflowLedger } from "../../src/common/编排/workflow-service.ts";
import { contractSchemaText } from "../../src/common/编排/workflow-preconditions.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { ContractCheckInput, DispatchReceipt, DispatchTaskPayload, WorkflowEvent } from "../../src/model/runtime.ts";

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

function listing(root: string, governanceModel: "trio" | "single" = "trio"): ProjectListing {
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
    roles: governanceModel === "single"
      ? [{
          roleId: "su", cardPath: "", boundaryPath: "", cardText: "su",
          boundary: { entries: [], boundarySource: "<built-in:su>", acceptance: { accepted: false, source: "" } },
          builtIn: true,
        }]
      : [
          builtIn("chief", "chief"),
          builtIn("product", "product"),
          builtIn("rapporteur", "proposal"),
          builtIn("nominator", "nomination"),
          builtIn("convener", "schedule"),
          builtIn("verifier", "verification"),
        ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: governanceModel === "single" ? "su" : "chief",
    governanceModel,
  };
}

interface CapturedInput {
  roleId: string;
  taskId?: string;
  workflowMode?: "fixed" | "legacy";
  contractCheck?: (input: ContractCheckInput) => Promise<string>;
  [key: string]: unknown;
}

function harness(root: string, options: { governanceModel?: "trio" | "single" } = {}) {
  const sent: Record<string, string[]> = {};
  const inputs: CapturedInput[] = [];
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
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
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
    getListing: (r) => (r === root ? listing(root, options.governanceModel ?? "trio") : undefined),
    getVersionChangeStack: () => versionChangeStack as never,
    emitEvent: () => {},
  });
  return { mgr, sent, inputs };
}

interface LiveSource {
  entry: unknown;
  origin: { settled: boolean; turnId?: string; taskId?: string };
}

/** 伪造**真实活条目 + 当前轮次**（Q6 来源证据；测试不启动模型，直接定格会话条目事实）。 */
function liveSource(mgr: SessionManager, root: string, roleId: string, runtime = "demo", overrides: Partial<LiveSource["origin"]> = {}): LiveSource {
  const manager = mgr as unknown as {
    sessionKey(projectRoot: string, roleId: string, runtime: string): string;
    sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
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

async function openChat(h: ReturnType<typeof harness>, root: string, roleId: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo" });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "聊天会话打开失败") : "");
  const input = h.inputs.find((item) => item.roleId === roleId && item.taskId === undefined);
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

/** 断言固定会话的拒绝**零写盘**：无任务账本、无 `.ans/project.json`/trunk/runs/workflows。 */
async function assertNoFixedOrLegacyWrites(root: string): Promise<void> {
  assert.equal((await readTaskState(root)).records.size, 0, "拒绝不得创建任务");
  for (const rel of [".ans/project.json", ".ans/trunk", ".ans/runs", ".ans/state/workflows.jsonl"]) {
    await assert.rejects(fs.stat(path.join(root, ...rel.split("/"))), `${rel} 不得被写`);
  }
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

// ══════════════════════════ 1. fixed 聊天 stage-request fail-closed ══════════════════════════

test("fixed 聊天 stage-request 缺 workflowPath/stage/flowId/workflowAction/roleId ⇒ stage-request-invalid 且零写盘", async () => {
  const cases: Array<{ name: string; payload: DispatchTaskPayload }> = [
    { name: "缺 workflowPath", payload: fullStageRequest({ workflowPath: undefined }) },
    { name: "workflowPath 非法", payload: fullStageRequest({ workflowPath: "C" as never }) },
    { name: "缺 stage", payload: fullStageRequest({ stage: undefined }) },
    { name: "stage 非法", payload: fullStageRequest({ stage: "Z9" as never }) },
    { name: "缺 flowId", payload: fullStageRequest({ flowId: undefined }) },
    { name: "flowId 空白", payload: fullStageRequest({ flowId: "   " }) },
    { name: "缺 workflowAction（不补缺省）", payload: fullStageRequest({ workflowAction: undefined }) },
    { name: "workflowAction=stop（固定会话仅 advance）", payload: fullStageRequest({ workflowAction: "stop" }) },
    { name: "roleId 非 convener", payload: fullStageRequest({ roleId: "product" }) },
  ];
  for (const item of cases) {
    const root = await makeRoot("ans-b71-sr-invalid-");
    const h = harness(root);
    try {
      const chief = await openChat(h, root, "chief");
      assert.equal(chief.workflowMode, "fixed", `[${item.name}] 空项目幕僚聊天为 fixed`);
      const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-b71-invalid" });
      const receipt = await routeDispatch(h.mgr, root, "chief", item.payload, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false, `[${item.name}] 必须 fail-closed`);
      assert.match(receipt.message ?? "", /stage-request-invalid/, `[${item.name}] 稳定码`);
      await assertNoFixedOrLegacyWrites(root);
      assert.equal(h.sent.convener, undefined, `[${item.name}] 不得投递运营`);
      assert.equal(h.sent.product, undefined, `[${item.name}] 不得投递产品`);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // roleId 缺失/空串：既有空目标防御（先于本分支）即 fail-closed——同样零写盘、不投递。
  {
    const root = await makeRoot("ans-b71-sr-empty-role-");
    const h = harness(root);
    try {
      await openChat(h, root, "chief");
      const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-b71-empty-role" });
      const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest({ roleId: "" }), live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false, "缺 roleId 必须 fail-closed");
      await assertNoFixedOrLegacyWrites(root);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("fixed 聊天完整 stage-request ⇒ ensureFixedPathStarted 写 workflowSchema + fixed 路由（无 run 写盘）", async () => {
  const root = await makeRoot("ans-b71-sr-ok-");
  const h = harness(root);
  try {
    await assert.rejects(fs.stat(path.join(root, ".ans", "project.json")));
    const chief = await openChat(h, root, "chief");
    assert.equal(chief.workflowMode, "fixed");
    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-b71-ok" });
    const receipt = await routeDispatch(h.mgr, root, "chief", fullStageRequest(), live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const config = JSON.parse(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
    assert.equal(config["workflowSchema"], "two-fixed-paths/v1", "首个 fixed stage-request 原子写回 workflowSchema");
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.some((event) => event.kind === "workflow.started"), true, "fixed workflow 已启动");
    const task = [...(await readTaskState(root)).records.values()].find((record) => record.created?.taskKind === "stage-request");
    assert.ok(task?.created, "stage-request 任务应已创建");
    assert.equal(task!.created!.to, "convener");
    assert.equal(task!.created!.sideEffect, "read-only");
    assert.equal(task!.created!.runId, undefined, "fixed stage-request 不带 legacy runId");
    assert.equal(task!.created!.workflowId?.startsWith("wf-"), true);
    let runEntries: string[] = [];
    try { runEntries = await fs.readdir(path.join(root, ".ans", "runs")); } catch { runEntries = []; }
    assert.equal(runEntries.filter((name) => name.startsWith("run-")).length, 0, "fixed 首请求不写 legacy run");
    let trunkExists = true;
    try { await fs.stat(path.join(root, ".ans", "trunk")); } catch { trunkExists = false; }
    assert.equal(trunkExists, false, "fixed 首请求不写 .ans/trunk");
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0);
    assert.match(h.sent.convener![0]!, /推进 A1/);
    await waitUntil(() => h.inputs.some((input) => input.roleId === "convener"));
    assert.equal(h.inputs.find((input) => input.roleId === "convener")?.workflowMode, "fixed", "投递目标会话也注入 fixed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 2. 非 stage-request 的 fixed 派发 ══════════════════════════

test("fixed 聊天非 stage-request 且无 workflowId/stage ⇒ stage-request-required（不回落 legacy 星形）", async () => {
  const payloads: Array<{ name: string; payload: DispatchTaskPayload }> = [
    { name: "幕僚→产品（仅 flowId）", payload: { roleId: "product", task: "写产品意图", flowId: "snake", sideEffect: "docs" } },
    { name: "幕僚→运营（非 stage-request）", payload: { roleId: "convener", task: "把项目交付运营", flowId: "snake", sideEffect: "read-only" } },
    { name: "无 flowId 普通派发", payload: { roleId: "product", task: "写产品意图", sideEffect: "docs" } },
  ];
  for (const item of payloads) {
    const root = await makeRoot("ans-b71-plain-");
    const h = harness(root);
    try {
      await openChat(h, root, "chief");
      const receipt = await routeDispatch(h.mgr, root, "chief", item.payload);
      assert.equal(receipt.ok, false, `[${item.name}] 固定会话必须拒绝普通星形派发`);
      assert.match(receipt.message ?? "", /stage-request-required/, `[${item.name}] 稳定码`);
      await assertNoFixedOrLegacyWrites(root);
      assert.equal(h.sent.product, undefined, `[${item.name}] 不得投递`);
      assert.equal(h.sent.convener, undefined, `[${item.name}] 不得投递`);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("fixed 聊天带 workflowId/stage 的 verifier 直派 ⇒ routeFixed（任务带 workflowId/stage、无 runId）", async () => {
  const root = await makeRoot("ans-b71-verifier-");
  const h = harness(root);
  const workflowId = "wf-b71verifier0000000000000001";
  try {
    await seedWorkflow(root, workflowId, "snake");
    await openChat(h, root, "chief");
    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-b71-verifier" });
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "verifier", task: "A12a 独立验收标准", flowId: "snake", workflowId, stage: "A12a", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const record = [...(await readTaskState(root)).records.values()].find((item) => item.created?.to === "verifier");
    assert.ok(record?.created, "verifier 直派任务应已创建（fixed 路由，不经 legacy 星形）");
    assert.equal(record!.created!.from, "chief");
    assert.equal(record!.created!.workflowId, workflowId);
    assert.equal(record!.created!.stage, "A12a");
    assert.equal(record!.created!.runId, undefined, "fixed 任务不得带 runId");
    let runEntries: string[] = [];
    try { runEntries = await fs.readdir(path.join(root, ".ans", "runs")); } catch { runEntries = []; }
    assert.equal(runEntries.filter((name) => name.startsWith("run-")).length, 0, "fixed 派发不写 legacy run");
    await waitUntil(() => (h.sent.verifier?.length ?? 0) > 0);
    assert.match(h.sent.verifier![0]!, /A12a 独立验收标准/);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 3. legacy 项目仍走星形 ══════════════════════════

test("legacy 项目普通派发仍 routeStar（不落入 fixed fail-closed）；fixed 聊天同样形状被 stage-request-required 拦截", async () => {
  // legacy：显式 legacy/v1 ⇒ 普通派发（带 flowId、无 workflowId/stage）路由到 routeStarDispatch。
  // 用路由桩隔离 legacy 下游的原生注册/文档准备依赖（本批只验证**路由选择**，不改 legacy 语义）。
  const root = await makeRoot("ans-b71-legacy-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    await openChat(h, root, "chief");
    const calls: string[] = [];
    const m = h.mgr as unknown as {
      routeStarDispatch: (...args: unknown[]) => Promise<DispatchReceipt>;
      routeFixedPathDispatch: (...args: unknown[]) => Promise<DispatchReceipt>;
    };
    const originalStar = m.routeStarDispatch;
    const originalFixed = m.routeFixedPathDispatch;
    m.routeStarDispatch = async () => { calls.push("star"); return { ok: true, message: "stub-star" }; };
    m.routeFixedPathDispatch = async () => { calls.push("fixed"); return { ok: true, message: "stub-fixed" }; };
    try {
      const receipt = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图", flowId: "snake", sideEffect: "docs" });
      assert.equal(receipt.ok, true, receipt.message ?? "");
      assert.deepEqual(calls, ["star"], "legacy 项目普通派发仍走 routeStarDispatch（legacy 路径逐字不变）");
    } finally {
      m.routeStarDispatch = originalStar;
      m.routeFixedPathDispatch = originalFixed;
    }
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
  // empty 项目（B6.1 起聊天默认 fixed）：同形状派发在进入任何路由前被 stage-request-required 拒绝，
  // star/fixed 路由均未调用（RR2 fail-open 关闭后的反例）。
  {
    const root = await makeRoot("ans-b71-legacy-contrast-");
    const h = harness(root);
    try {
      await openChat(h, root, "chief");
      const calls: string[] = [];
      const m = h.mgr as unknown as {
        routeStarDispatch: (...args: unknown[]) => Promise<DispatchReceipt>;
        routeFixedPathDispatch: (...args: unknown[]) => Promise<DispatchReceipt>;
      };
      const originalStar = m.routeStarDispatch;
      const originalFixed = m.routeFixedPathDispatch;
      m.routeStarDispatch = async () => { calls.push("star"); return { ok: true, message: "stub-star" }; };
      m.routeFixedPathDispatch = async () => { calls.push("fixed"); return { ok: true, message: "stub-fixed" }; };
      try {
        const receipt = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图", flowId: "snake", sideEffect: "docs" });
        assert.equal(receipt.ok, false);
        assert.match(receipt.message ?? "", /stage-request-required/);
        assert.deepEqual(calls, [], "fixed 聊天不得落入 star/fixed 路由");
      } finally {
        m.routeStarDispatch = originalStar;
        m.routeFixedPathDispatch = originalFixed;
      }
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

// ══════════════════════════ 4. contract_check fixed / legacy 文本 ══════════════════════════

test("contract_check fixed 视图：无 legacy run/pin 误导、含 stage-request 固定字段与 fixed 稳定码", async () => {
  const root = await makeRoot("ans-b71-contract-fixed-");
  const h = harness(root);
  try {
    const chief = await openChat(h, root, "chief");
    assert.equal(typeof chief.contractCheck, "function", "chief 聊天注入 contract_check");
    const check = chief.contractCheck!;
    const text = await check({ flowId: "snake", taskKind: "dispatch" });
    assert.match(text, /^contract_check（只读速查；查询不构成放行\/授权）/);
    assert.ok(text.includes("run：fixed（无 run；固定路径由 stage-request 驱动）"), "fixed run 行");
    assert.equal(text.includes("run：legacy"), false, "fixed 视图不得输出 legacy run 行");
    assert.equal(text.includes("runId(pinned)"), false, "fixed 视图不得输出 legacy runId(pinned) 必填误导");
    assert.equal(text.includes("targetRoleId；runId"), false, "fixed 视图不得输出 legacy 必填串");
    assert.ok(text.includes('taskKind:"stage-request"'), "fixed dispatch 必填含 stage-request");
    assert.ok(text.includes('workflowAction:"advance"'), "fixed dispatch 必填含 workflowAction");
    assert.ok(text.includes('workflowPath:"A"|"B"'), "fixed dispatch 必填含 workflowPath");
    assert.ok(text.includes('sideEffect:"read-only"'), "fixed dispatch 必填含只读");
    for (const code of ["stage-request-invalid", "stage-request-required", "workflow-path-required", "stage-transition-invalid"]) {
      assert.ok(text.includes(code), `fixed 常见拒绝含 ${code}`);
    }
    assert.ok(Buffer.byteLength(text, "utf8") <= 4096, "4 KiB 截断保持");
    // 无 kind 与 stage-request kind 均给出固定口径；topic 早退不变。
    const generic = await check({});
    assert.ok(generic.includes("stage-request 或带 workflowId/stage 的 fixed 任务"), "无 kind 时提示固定两种形态");
    const srKind = await check({ taskKind: "stage-request" });
    assert.ok(srKind.includes('taskKind:"stage-request"'), "stage-request kind 直接给固定必填");
    assert.equal(await check({ topic: "modules" }), contractSchemaText("modules"), "topic 静态早退逐字不变");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("contract_check legacy 视图逐字不变（显式 legacy 项目 / single），stage-request kind 不抛", async () => {
  // trio 显式 legacy/v1：legacy 事实路径逐字（run：legacy（未冻结）+ legacy dispatch 必填）。
  {
    const root = await makeRoot("ans-b71-contract-legacy-");
    const h = harness(root);
    try {
      await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
      const chief = await openChat(h, root, "chief");
      assert.equal(chief.workflowMode, undefined, "legacy 聊天不传 fixed 常量");
      const text = await chief.contractCheck!({ flowId: "focus", taskKind: "dispatch" });
      assert.match(text, /run：legacy（未冻结）｜flow focus/);
      assert.ok(text.includes("taskKind dispatch 必填：flowId；targetRoleId；runId(pinned)；moduleId(运营派实现)；modulePaths"), "legacy 必填串逐字");
      assert.equal(text.includes("run：fixed"), false, "legacy 视图不得出现 fixed run 行");
      assert.equal(text.includes('taskKind:"stage-request"'), false, "legacy 视图不得出现 fixed 必填串");
      // 模型传 stage-request kind 时 legacy 视图不得抛（旧实现下标越界）。
      const sr = await chief.contractCheck!({ taskKind: "stage-request" });
      assert.match(sr, /taskKind stage-request：fixed 路径专用/);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // single：su 会话同样保持 legacy 文本。
  {
    const root = await makeRoot("ans-b71-contract-single-");
    const h = harness(root, { governanceModel: "single" });
    try {
      const su = await openChat(h, root, "su");
      const text = await su.contractCheck!({ flowId: "focus" });
      assert.match(text, /run：legacy（未冻结）｜flow focus/);
      assert.ok(text.includes("taskKind：可传 dispatch/appointment/write/acceptance/shell 获取对应必填项"));
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

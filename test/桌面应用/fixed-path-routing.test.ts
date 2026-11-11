// test/桌面应用/fixed-path-routing.test.ts
// T3「两条固定工作流路径」B1（2026-11-10，桌面窗口）：AC-01/AC-02/AC-04/AC-05/AC-12/AC-23、T-01/T-05。
//
// 覆盖（全部确定性、假会话、无 Electron/真实模型）：
//   1. per-flow 路由：混合项目（legacy 在飞 run + 新 fixed flow）按**被派任务的 flowId** 分别走旧/新路径；
//      项目模式变化立即生效（不缓存项目级单值）；注入 run-role 的 `workflowModeForFlow` 每次现场解析。
//   2. fixed 矩阵负例（拒绝先于 task.created）：chief→product、chief→项目角色（非 reviewRoleId）、
//      self、convener→verifier、目标不存在、chief→convener 非 stage-request、stage-request 携带 module。
//   3. Q6 证据 fail-closed（AC-04）：无 live-turn、settled 轮次、fenced run、伪造/已关闭 stage-request
//      父任务、错误创建者 ⇒ dispatch-source-changed / stage-request-required / dispatch-evidence-missing；
//      不产生任务行。
//   4. fixed 正例：chief→verifier（A12a）建 fixed 任务（workflowId/stage、无 runId、不写 `.ans/runs`）并投递；
//      chief→convener stage-request（首请求）经编排 requestStage 建只读任务 + workflow.started；
//      convener 绑定真实 open stage-request 后派生产角色。
//   5. MF-10 窄例外（AC-02）：roster v4 review 角色 + basis.reviewRoleId + role.activated 一致 ⇒ 允许；
//      缺激活/非 reviewRoleId 项目角色 ⇒ 拒绝。
//   6. direct 能力过滤（AC-23）：fixed 会话不注入 legacy Git/VCA/stable/run-change/版本决策能力；
//      legacy 会话逐项仍在；single/su 不受影响。不新增 `requestReleaseMerge`（G-IR）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { resolveWorkflowMode } from "../../app/desktop/workflow.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent, requestStage } from "../../src/common/编排/workflow-service.ts";
import { appendBasisEvent } from "../../src/common/编排/workflow-service.ts";
import { parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type {
  BasisEvent,
  DispatchTaskFn,
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

// —————————————— 夹具 ——————————————

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
          worker("worker"),
          worker("qa"),
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
  dispatchTask?: DispatchTaskFn;
  workflowModeForFlow?: (flowId: string) => Promise<"fixed" | "legacy">;
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
  const extraStreams: Record<string, OrchestrationEvent[]> = {};
  return { mgr, sent, inputs, extraStreams };
}

async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(root: string, rel: string, text: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
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

const WF_BASE = { v: 1 as const, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1" as const, path: "A" as const };

/** 合法推进到 A8（requested）：A1/A4/A7 由 stage.dispatched 完成，其余由 stage.completed 完成。 */
async function seedWorkflowAtA8(root: string, workflowId: string, flowId: string, activatedRoleIds: readonly string[]): Promise<void> {
  const started = await appendWorkflowEvent(root, startedEvent(workflowId, flowId));
  assert.equal(started.ok, true, started.ok === false ? started.message : "");
  const events: WorkflowEvent[] = [];
  const requested = (stage: string, attempt = 1): WorkflowEvent => ({
    ...WF_BASE, kind: "stage.requested", workflowId, flowId,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`,
    stage: stage as never, requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: "a".repeat(64), attempt,
  });
  const dispatched = (stage: string): WorkflowEvent => ({
    ...WF_BASE, kind: "stage.dispatched", workflowId, flowId,
    idempotencyKey: `stage-dispatch:${workflowId}:${stage}:seed`, stage: stage as never,
    taskId: `t-dispatch-${stage}`, targetRoleId: "convener",
  });
  const completed = (stage: string): WorkflowEvent => ({
    ...WF_BASE, kind: "stage.completed", workflowId, flowId,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage: stage as never,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  });
  events.push(requested("A1"), dispatched("A1"), requested("A2"), completed("A2"), requested("A3"), completed("A3"),
    requested("A4"), dispatched("A4"), requested("A5"), completed("A5"), requested("A6"), completed("A6"),
    requested("A7"), dispatched("A7"), requested("A8"));
  for (const roleId of activatedRoleIds) {
    events.push({
      ...WF_BASE, kind: "role.activated", workflowId, flowId,
      idempotencyKey: `role-activation:${workflowId}:${roleId}:seed`,
      roleId, decisionRef: "decision-seed",
      roster: { path: `docs/proposals/${flowId}-roster-v1.md`, sha256: "a".repeat(64) },
      documents: [{ path: `角色卡/${roleId}/role-card.md`, sha256: "b".repeat(64) }],
    });
  }
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

async function seedBasisReview(root: string, workflowId: string, flowId: string, reviewRoleId: string): Promise<void> {
  const event: BasisEvent = {
    v: 1, at: "2026-11-10T10:01:00.000Z", schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${workflowId}:seed`,
    basisId: `basis-${workflowId}`, workflowId, flowId, documents: [], teamPlan: null,
    reviewRoleId, operationId: `op-${workflowId}`, reason: "baseline", recordedBy: "application",
  };
  const appended = await appendBasisEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

const ROSTER_V4_REVIEW = (flowId: string, review = true): string => [
  "---",
  "schema: project-roster/v4",
  `flowId: ${flowId}`,
  "version: 1",
  "envBootstrapOmittedReason: 最小路由测试夹具省略装配/入口角色",
  `intent: docs/product/${flowId}-intent-v1.md`,
  `proposal: docs/proposals/${flowId}-proposal-v1.md`,
  `architecture: docs/contracts/${flowId}-architecture-v1.md`,
  "roles:",
  "  - id: worker",
  "    displayName: 实现者",
  "    purpose: 实现",
  "    capability: TypeScript",
  "    modules:",
  "      - core",
  "  - id: qa",
  "    displayName: 验收者",
  "    purpose: 独立验收",
  "    capability: 测试",
  "    modules:",
  "      - qa-suite",
  ...(review ? ["    review: true"] : []),
  "modules:",
  "  - id: core",
  "    name: 核心",
  "    purpose: 实现",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  `    architectureSource: docs/contracts/${flowId}-architecture-v1.md`,
  "  - id: qa-suite",
  "    name: 验收套件",
  "    purpose: 验收",
  "    path: test/qa/",
  "    category: core",
  "    publicContract: test/qa/index.ts",
  `    architectureSource: docs/contracts/${flowId}-architecture-v1.md`,
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: core",
  "    path: src/core/",
  "    roleId: worker",
  "  - id: qa-suite",
  "    path: test/qa/",
  "    roleId: qa",
  "roles:",
  "  - id: worker",
  "    modules: [core]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, worker, qa]",
  "```",
].join("\n");

async function writeRosterFixture(root: string, flowId: string, review = true): Promise<void> {
  const rosterText = ROSTER_V4_REVIEW(flowId, review);
  const parsed = parseProjectRoster(rosterText, flowId);
  assert.equal(parsed.ok, true, parsed.ok === false ? parsed.reason : "");
  if (!parsed.ok) return;
  await writeText(root, `docs/proposals/${flowId}-roster-v1.md`, rosterText);
  await writeText(root, `docs/proposals/${flowId}-modules-v1.md`, [
    "---",
    "schema: project-modules/v2",
    `flowId: ${flowId}`,
    "version: 1",
    `modules: ${JSON.stringify(parsed.roster.modules)}`,
    "---",
    "# 模块清单",
  ].join("\n"));
  await writeText(root, `docs/product/${flowId}-intent-v1.md`, "# 产品意图\n\n目标：测试。\n");
  await writeText(root, `docs/proposals/${flowId}-proposal-v1.md`, `---\nschema: project-proposal/v2\nflowId: ${flowId}\nversion: 1\nintent: docs/product/${flowId}-intent-v1.md\n---\n# 提案\n`);
  await writeText(root, `docs/contracts/${flowId}-architecture-v1.md`, `# 架构\n\nproposal: docs/proposals/${flowId}-proposal-v1.md\n`);
}

interface LiveSource {
  entry: unknown;
  origin: {
    settled: boolean;
    turnId?: string;
    taskId?: string;
    assignment?: { taskId: string; flowId: string; runId?: string };
  };
}

/** 伪造**真实活条目 + 当前轮次**（sourceIsCurrent 的证据来源；测试不启动模型，故直接定格会话条目事实）。 */
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

async function makeRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

test("per-flow 解析 + B7.1 fail-closed：fixed 聊天普通派发不回落星形；切 legacy/v1 后同一形状走旧路", async () => {
  const root = await makeRoot("ans-fixed-route-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeJson(root, ".ans/runs/run-20261110-legacy-11111111/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-legacy-11111111", flowId: "legacy-flow", state: "draft",
    });
    // per-flow 解析本身不变（单一实现 = 编排）：legacy 在飞 flow 仍 legacy、新 flow fixed。
    assert.equal(await resolveWorkflowMode(root, "legacy-flow"), "legacy");
    assert.equal(await resolveWorkflowMode(root, "fixed-flow"), "fixed");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });

    // B7.1：显式 fixed 项目的聊天会话为 fixed——**普通派发（无 workflowId/stage）一律 fail-closed**，
    // 不因被派 flow 的 per-flow 模式而回落 legacy 星形（RR2 fail-open 关闭）。
    const legacy = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图文档", sideEffect: "docs", flowId: "legacy-flow" });
    assert.equal(legacy.ok, false);
    assert.match(legacy.message ?? "", /stage-request-required/);
    assert.equal((legacy.message ?? "").includes("document-planning-source-unavailable"), false, "不得进入 legacy 星形");
    const fixed = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图文档", sideEffect: "docs", flowId: "fixed-flow" });
    assert.equal(fixed.ok, false);
    assert.match(fixed.message ?? "", /stage-request-required/);

    // 不缓存：项目级配置切到 legacy/v1 后，同一形状立即改走旧路（legacy 专属码如实拒绝，而非 fixed 码）。
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    assert.equal(await resolveWorkflowMode(root, "fixed-flow"), "legacy");
    const afterSwitch = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图文档 v2", sideEffect: "docs", flowId: "fixed-flow" });
    assert.equal(afterSwitch.ok, false);
    assert.match(afterSwitch.message ?? "", /document-planning-source-unavailable|缺少当前客户输入与真实项目选择/);
    assert.equal((afterSwitch.message ?? "").includes("stage-request-required"), false, "legacy 聊天不得套用 fixed fail-closed");

    assert.equal((await readTaskState(root)).records.size, 0, "拒绝不产生 task.created 行");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("B1 启用闸（legacy 兼容）：项目未显式 fixed 且该 flow 无 fixed workflow ⇒ 不启用 fixed 路由/注入", async () => {
  const root = await makeRoot("ans-fixed-gate-");
  const h = harness(root);
  try {
    // 旧夹具形态：trio 项目、无 workflowSchema、无 run/trunk/固定账本 ⇒ 该 flow 不得按 fixed 解析
    // （AC-03 旧断言不改）。B7.1：空 trio 项目聊天按 B6.1 为 fixed，普通派发 fail-closed（stage-request-required），
    // 既不进 fixed 矩阵、也不回落 legacy 星形。
    await writeJson(root, ".ans/project.json", { governanceModel: "trio" });
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chiefInput = h.inputs.find((input) => input.roleId === "chief");
    assert.ok(chiefInput !== undefined);
    assert.equal(await chiefInput!.workflowModeForFlow!("focus"), "legacy", "未启用 fixed 的旧项目 flow 不得按 fixed 解析");
    const compat = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图文档", sideEffect: "docs", flowId: "focus" });
    assert.equal(compat.ok, false);
    assert.match(compat.message ?? "", /stage-request-required/);
    assert.equal((compat.message ?? "").includes("chief-production-dispatch-forbidden"), false, "未启用闸的 flow 不得进入 fixed 矩阵");
    assert.equal((compat.message ?? "").includes("document-planning-source-unavailable"), false, "不得回落 legacy 星形");
    // 该 flow 已有 fixed workflow（workflow.started）⇒ 闸启用，按编排 workflowMode 解析为 fixed。
    const workflowId = "wf-gate000000000000000000001";
    await seedWorkflow(root, workflowId, "snake");
    assert.equal(await chiefInput!.workflowModeForFlow!("snake"), "fixed");
    // 显式 legacy/v1 ⇒ 闸关闭（即使有 fixed 账本历史也不启用）。
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    assert.equal(await chiefInput!.workflowModeForFlow!("snake"), "legacy");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("workflowModeForFlow 注入：run-role 每次按 flowId 现场解析（无缓存；异常/空 flow fail-closed legacy）", async () => {
  const root = await makeRoot("ans-fixed-inject-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeJson(root, ".ans/runs/run-20261110-legacy-22222222/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-legacy-22222222", flowId: "legacy-flow", state: "pinned",
    });
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chiefInput = h.inputs.find((input) => input.roleId === "chief");
    assert.ok(chiefInput !== undefined);
    assert.equal(typeof chiefInput!.workflowModeForFlow, "function", "trio 会话应注入 workflowModeForFlow");
    assert.equal(await chiefInput!.workflowModeForFlow!("legacy-flow"), "legacy");
    assert.equal(await chiefInput!.workflowModeForFlow!("fixed-flow"), "fixed");
    assert.equal(await chiefInput!.workflowModeForFlow!(""), "legacy", "空 flow 不判 fixed");
    // 配置变化立即生效（不缓存）。
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    assert.equal(await chiefInput!.workflowModeForFlow!("fixed-flow"), "legacy");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed 矩阵负例：拒绝先于 task.created；self/unknown/target/生产派发/stage-request 形状（B7.1 fail-closed）", async () => {
  const root = await makeRoot("ans-fixed-matrix-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    // B7.1：fixed 聊天只路由 stage-request 或带 workflowId+stage 的 fixed 任务；矩阵负例改为携带账本绑定，
    // 以继续验证 fixed 硬授权矩阵（缺 workflowId/stage 的形状已由 pre-check fail-closed，见文末两例）。
    const matrixWorkflowId = "wf-b71matrix0000000000000001";
    await seedWorkflow(root, matrixWorkflowId, "snake");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    const bound = { workflowId: matrixWorkflowId, stage: "A1" as const };
    const cases: Array<{ from: string; payload: DispatchTaskPayload; code: RegExp }> = [
      { from: "chief", payload: { roleId: "product", task: "写意图", flowId: "snake", ...bound }, code: /chief-production-dispatch-forbidden/ },
      { from: "chief", payload: { roleId: "rapporteur", task: "出方案", flowId: "snake", ...bound }, code: /chief-production-dispatch-forbidden/ },
      { from: "chief", payload: { roleId: "worker", task: "实现 X", flowId: "snake", ...bound }, code: /chief-to-project-forbidden/ },
      { from: "chief", payload: { roleId: "chief", task: "自派", flowId: "snake", ...bound }, code: /self-dispatch/ },
      { from: "convener", payload: { roleId: "verifier", task: "验收核对", flowId: "snake", ...bound }, code: /convener-to-verifier-forbidden/ },
      { from: "convener", payload: { roleId: "ghost-dev", task: "幽灵实现", flowId: "snake", ...bound }, code: /target-card-missing/ },
      { from: "chief", payload: { roleId: "convener", task: "把项目交付运营", flowId: "snake", ...bound }, code: /target-card-missing/ },
      { from: "chief", payload: { roleId: "convener", task: "推进 A1", flowId: "snake", taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only", moduleId: "core" }, code: /stage-request-invalid/ },
      { from: "chief", payload: { roleId: "worker", task: "实现 X", flowId: "snake", workflowPath: "A", ...bound }, code: /workflow-path-not-stage-request/ },
      // B7.1 pre-check：stage-request 缺 workflowAction / 普通派发无 workflowId+stage ⇒ 路由前 fail-closed。
      { from: "chief", payload: { roleId: "convener", task: "推进 A1", flowId: "snake", taskKind: "stage-request", workflowPath: "A", stage: "A1", sideEffect: "read-only" }, code: /stage-request-invalid/ },
      { from: "chief", payload: { roleId: "product", task: "写意图", flowId: "snake" }, code: /stage-request-required/ },
    ];
    for (const item of cases) {
      const receipt = await routeDispatch(h.mgr, root, item.from, item.payload);
      assert.equal(receipt.ok, false, `${item.from}→${item.payload.roleId} 应拒绝`);
      assert.match(receipt.message ?? "", item.code);
    }
    // 来源防御（trio 会话层，旧行为不变）：非 chief/convener 直接调用被拒。
    const wrongSource = await routeDispatch(h.mgr, root, "worker", { roleId: "product", task: "越权", flowId: "snake", ...bound });
    assert.equal(wrongSource.ok, false);
    assert.match(wrongSource.message ?? "", /幕僚|运营|来源/);
    assert.equal((await readTaskState(root)).records.size, 0, "矩阵拒绝不产生 task.created 行");
    assert.equal((h.sent.verifier?.length ?? 0) + (h.sent.product?.length ?? 0) + (h.sent.worker?.length ?? 0), 0, "矩阵拒绝不投递");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed 证据负例（AC-04）：无 live-turn/settled/fenced/伪造或已关闭父任务 ⇒ 拒绝且零任务", async () => {
  const root = await makeRoot("ans-fixed-evidence-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    const workflowId = "wf-evidence0000000000000001";
    await seedWorkflow(root, workflowId, "snake");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    const reviewPayload: DispatchTaskPayload = {
      roleId: "verifier", task: "A12a 独立验收标准", flowId: "snake", workflowId, stage: "A12a", sideEffect: "read-only",
    };
    // 1) 无 live-turn（会话外调用）⇒ dispatch-source-changed。
    const noTurn = await routeDispatch(h.mgr, root, "chief", reviewPayload);
    assert.equal(noTurn.ok, false);
    assert.match(noTurn.message ?? "", /dispatch-source-changed/);
    // 2) 轮次已 settled ⇒ dispatch-source-changed。
    const settled = liveSource(h.mgr, root, "chief", "demo", { settled: true });
    const settledReceipt = await routeDispatch(h.mgr, root, "chief", reviewPayload, settled);
    releaseSource(h.mgr, settled);
    assert.equal(settledReceipt.ok, false);
    assert.match(settledReceipt.message ?? "", /dispatch-source-changed/);
    // 2b) 会话条目已不是当前活条目（session 重启/换条目）⇒ dispatch-source-changed。
    const staleLive = liveSource(h.mgr, root, "chief");
    const staleReceipt = await routeDispatch(h.mgr, root, "chief", reviewPayload, { entry: {} as never, origin: staleLive.origin });
    releaseSource(h.mgr, staleLive);
    assert.equal(staleReceipt.ok, false);
    assert.match(staleReceipt.message ?? "", /dispatch-source-changed/);
    // 3) fenced run/task ⇒ dispatch-source-changed。
    const fenced = liveSource(h.mgr, root, "chief", "demo", { taskId: "t-fenced" });
    const manager = h.mgr as unknown as { fencedRunTasks: Map<string, Set<string>> };
    manager.fencedRunTasks.set(root, new Set(["t-fenced"]));
    const fencedReceipt = await routeDispatch(h.mgr, root, "chief", reviewPayload, fenced);
    releaseSource(h.mgr, fenced);
    manager.fencedRunTasks.delete(root);
    assert.equal(fencedReceipt.ok, false);
    assert.match(fencedReceipt.message ?? "", /dispatch-source-changed/);
    // 4) convener 生产派发：无父任务 ⇒ stage-request-required；伪造/错误创建者/已关闭父任务 ⇒ 同样拒绝。
    const live = liveSource(h.mgr, root, "convener");
    const production: DispatchTaskPayload = { roleId: "worker", task: "实现核心模块", flowId: "snake", workflowId, stage: "A1", sideEffect: "code" };
    const noParent = await routeDispatch(h.mgr, root, "convener", production, live);
    assert.equal(noParent.ok, false);
    assert.match(noParent.message ?? "", /stage-request-required/);
    releaseSource(h.mgr, live);

    // 真实 stage-request 父任务（chief→convener），再分别制造负例。
    const stageRequest = await requestStage({
      projectRoot: root, flowId: "snake", stage: "A1", workflowPath: "A",
      requestDigest: createHash("sha256").update("推进 A1").digest("hex"),
      sourceTaskId: "turn-parent", text: "推进 A1：派产品",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    // 4a) 伪造 taskId。
    const forged = liveSource(h.mgr, root, "convener", "demo", { taskId: "t-forged" });
    const forgedReceipt = await routeDispatch(h.mgr, root, "convener", production, forged);
    releaseSource(h.mgr, forged);
    assert.equal(forgedReceipt.ok, false);
    assert.match(forgedReceipt.message ?? "", /stage-request-required/);
    // 4b) 错误创建者（chief→worker 的任务不是 convener 的受派父任务）。
    const foreign = taskEvent("task.created", {
      taskId: "t-foreign", from: "chief", to: "worker", text: "别的任务", flowId: "snake", workflowId, stage: "A11",
      sideEffect: "code", idempotencyKey: "foreign-key-1",
    });
    await appendTaskEvent(root, foreign);
    const foreignSource = liveSource(h.mgr, root, "convener", "demo", { taskId: "t-foreign" });
    const foreignReceipt = await routeDispatch(h.mgr, root, "convener", production, foreignSource);
    releaseSource(h.mgr, foreignSource);
    assert.equal(foreignReceipt.ok, false);
    assert.match(foreignReceipt.message ?? "", /stage-request-required|dispatch-evidence-missing/);
    // 4c) 已关闭的父任务。
    await appendTaskEvent(root, taskEvent("task.closed", { taskId: stageRequest.taskId, by: "chief", outcome: "accepted" }));
    const closedSource = liveSource(h.mgr, root, "convener", "demo", { taskId: stageRequest.taskId });
    const closedReceipt = await routeDispatch(h.mgr, root, "convener", production, closedSource);
    releaseSource(h.mgr, closedSource);
    assert.equal(closedReceipt.ok, false);
    assert.match(closedReceipt.message ?? "", /stage-request-required/);
    // 以上全部拒绝：任务账本只有真实父任务 + foreign 夹具，没有生产任务。
    const records = [...(await readTaskState(root)).records.values()];
    assert.equal(records.some((record) => record.created?.to === "worker"), true, "只允许预置的 foreign 夹具行");
    assert.equal(records.filter((record) => record.created?.to === "worker").length, 1, "证据拒绝不得新增 worker 任务");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed 正例：chief→verifier（A12a）建 fixed 任务、不写 .ans/runs、投递目标会话", async () => {
  const root = await makeRoot("ans-fixed-review-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    const workflowId = "wf-review00000000000000001";
    await seedWorkflow(root, workflowId, "snake");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief");
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "verifier", task: "A12a 独立验收标准：写 criteria", flowId: "snake", workflowId, stage: "A12a", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.match(receipt.message ?? "", /任务编号：#t-/);
    const state = await readTaskState(root);
    const record = [...state.records.values()].find((item) => item.created?.to === "verifier");
    assert.ok(record?.created);
    assert.equal(record!.created!.from, "chief");
    assert.equal(record!.created!.flowId, "snake");
    assert.equal(record!.created!.workflowId, workflowId);
    assert.equal(record!.created!.stage, "A12a");
    assert.equal(record!.created!.sideEffect, "read-only");
    assert.equal(record!.created!.runId, undefined, "fixed 任务不得带 runId");
    assert.equal(record!.created!.runState, undefined);
    await waitUntil(() => (h.sent.verifier?.length ?? 0) > 0);
    assert.match(h.sent.verifier![0]!, /A12a 独立验收标准/);
    // fixed 路径不触达 legacy run 账本（不产生 .ans/runs 目录/manifest）。
    let runFiles: string[] = [];
    try { runFiles = await fs.readdir(path.join(root, ".ans", "runs")); } catch { runFiles = []; }
    assert.equal(runFiles.filter((name) => name.startsWith("run-")).length, 0, "fixed 派发不写 legacy run");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed stage-request：首请求经编排 requestStage 建只读任务 + workflow.started + 幂等键", async () => {
  const root = await makeRoot("ans-fixed-stage-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-customer-1" });
    const payload: DispatchTaskPayload = {
      roleId: "convener", task: "推进 A1：请派产品撰写意图", flowId: "snake",
      taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only",
    };
    const receipt = await routeDispatch(h.mgr, root, "chief", payload, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const state = await readTaskState(root);
    const request = [...state.records.values()].find((item) => item.created?.taskKind === "stage-request");
    assert.ok(request?.created, "stage-request 任务应已创建");
    assert.equal(request!.created!.from, "chief");
    assert.equal(request!.created!.to, "convener");
    assert.equal(request!.created!.sideEffect, "read-only", "stage-request 固定只读（文本含『派』不升类）");
    assert.equal(request!.created!.stage, "A1");
    assert.equal(request!.created!.workflowPath, "A");
    assert.equal(request!.created!.moduleId, undefined);
    assert.match(request!.created!.idempotencyKey, /^stage-request:wf-[a-f0-9]{24}:A1:1$/);
    const ledger = await fs.readFile(path.join(root, ".ans", "state", "workflows.jsonl"), "utf8");
    assert.match(ledger, /"kind":"workflow\.started"/);
    await waitUntil(() => (h.sent.convener?.length ?? 0) > 0);
    assert.match(h.sent.convener![0]!, /推进 A1/);
    let runFiles: string[] = [];
    try { runFiles = await fs.readdir(path.join(root, ".ans", "runs")); } catch { runFiles = []; }
    assert.equal(runFiles.length, 0, "fixed stage-request 不写 legacy run");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed 正例：convener 绑定真实 open stage-request 后派生产角色（fixed 任务无 runId）", async () => {
  const root = await makeRoot("ans-fixed-produce-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    const digest = createHash("sha256").update("推进 A1").digest("hex");
    const stageRequest = await requestStage({
      projectRoot: root, flowId: "snake", stage: "A1", workflowPath: "A", requestDigest: digest,
      sourceTaskId: "turn-parent-2", text: "推进 A1：请派产品",
    });
    assert.equal(stageRequest.ok, true, stageRequest.ok === false ? stageRequest.message : "");
    if (!stageRequest.ok) return;
    const live = liveSource(h.mgr, root, "convener", "demo", { taskId: stageRequest.taskId });
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "worker", task: "实现核心模块", flowId: "snake", workflowId: stageRequest.workflowId,
      stage: "A1", sideEffect: "code", moduleId: "core",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const state = await readTaskState(root);
    const production = [...state.records.values()].find((item) => item.created?.to === "worker");
    assert.ok(production?.created);
    assert.equal(production!.created!.from, "convener");
    assert.equal(production!.created!.workflowId, stageRequest.workflowId);
    assert.equal(production!.created!.stage, "A1");
    assert.equal(production!.created!.moduleId, "core");
    assert.equal(production!.created!.runId, undefined, "fixed 生产任务无 runId");
    await waitUntil(() => (h.sent.worker?.length ?? 0) > 0);
    assert.match(h.sent.worker![0]!, /实现核心模块/);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("MF-10 窄例外：chief→项目验收角色（roster review + basis 一致 + role.activated）允许；缺证据/非验收角色拒绝", async () => {
  const root = await makeRoot("ans-fixed-review-role-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeRosterFixture(root, "snake");
    const workflowId = "wf-mf10review00000000000001";
    await seedWorkflowAtA8(root, workflowId, "snake", ["qa"]);
    await seedBasisReview(root, workflowId, "snake", "qa");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief");
    const allowed = await routeDispatch(h.mgr, root, "chief", {
      roleId: "qa", task: "A12b 独立验收报告", flowId: "snake", workflowId, stage: "A12b", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(allowed.ok, true, allowed.message ?? "");
    const created = [...(await readTaskState(root)).records.values()].find((item) => item.created?.to === "qa");
    assert.ok(created?.created);
    assert.equal(created!.created!.stage, "A12b");
    assert.equal(created!.created!.from, "chief");
    // 非 reviewRoleId 的项目角色仍拒绝（生产派发，提示交运营）。
    const live2 = liveSource(h.mgr, root, "chief");
    const notReview = await routeDispatch(h.mgr, root, "chief", {
      roleId: "worker", task: "实现 X", flowId: "snake", workflowId, stage: "A11", sideEffect: "code", moduleId: "core",
    }, live2);
    releaseSource(h.mgr, live2);
    assert.equal(notReview.ok, false);
    assert.match(notReview.message ?? "", /chief-to-project-forbidden/);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("MF-10 窄例外负例：角色未 role.activated ⇒ review-role-invalid（不默认通过）", async () => {
  const root = await makeRoot("ans-fixed-review-role-neg-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeRosterFixture(root, "snake");
    const workflowId = "wf-mf10review00000000000002";
    await seedWorkflow(root, workflowId, "snake");
    await seedBasisReview(root, workflowId, "snake", "qa");
    // 故意不写 role.activated。
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief");
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "qa", task: "A12b 独立验收报告", flowId: "snake", workflowId, stage: "A12b", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /review-role-invalid/);
    assert.equal([...((await readTaskState(root)).records.values())].some((item) => item.created?.to === "qa"), false);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("MF-10 窄例外负例：basis 指定 reviewRoleId 但 roster 未标记 review ⇒ review-role-invalid", async () => {
  const root = await makeRoot("ans-fixed-review-role-neg2-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeRosterFixture(root, "snake", false); // 名单不标记 review
    const workflowId = "wf-mf10review00000000000003";
    await seedWorkflowAtA8(root, workflowId, "snake", ["qa"]);
    await seedBasisReview(root, workflowId, "snake", "qa");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief");
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "qa", task: "A12b 独立验收报告", flowId: "snake", workflowId, stage: "A12b", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /review-role-invalid/);
    assert.match(receipt.message ?? "", /roster=review/);
    assert.equal([...((await readTaskState(root)).records.values())].some((item) => item.created?.to === "qa"), false);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("direct 能力过滤（AC-23）：fixed 会话不注入 legacy Git/run-change/stable/VCA/版本决策；legacy 逐项仍在；不新增 requestReleaseMerge", async () => {
  const root = await makeRoot("ans-fixed-caps-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeJson(root, ".ans/runs/run-20261110-legacy-33333333/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-legacy-33333333", flowId: "legacy-flow", state: "draft",
    });
    // 任务行：fixed flow 与 legacy flow 各一（会话级模式按任务 flowId 解析）。
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-fixed-session", from: "chief", to: "verifier", text: "fixed 会话任务", flowId: "fixed-flow",
      workflowId: "wf-caps000000000000000000001", stage: "A2", sideEffect: "read-only", idempotencyKey: "caps-fixed-1",
    }));
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-legacy-session", from: "chief", to: "chief", text: "legacy 会话任务", flowId: "legacy-flow",
      sideEffect: "read-only", idempotencyKey: "caps-legacy-1",
    }), { allowLegacyRun: true });

    const openFixed = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-fixed-session" });
    assert.equal(openFixed.ok, true, openFixed.ok === false ? (openFixed.error ?? "测试会话打开失败") : "");
    const fixedChief = h.inputs.find((input) => input.roleId === "chief" && input.taskId === "t-fixed-session");
    assert.ok(fixedChief !== undefined);
    for (const tool of ["gitQuery", "gitCandidate", "gitPublish", "requestVersionDecision", "stablePermitOf"]) {
      assert.equal(fixedChief![tool], undefined, `fixed 会话不得注入 ${tool}`);
    }
    assert.equal("requestReleaseMerge" in fixedChief!, false, "G-IR：不新增 request_release_merge");
    for (const retained of ["closeCreatedTask", "docFormat", "contractCheck", "evidenceCheck", "projectState", "projectNote"]) {
      assert.equal(fixedChief![retained] !== undefined, true, `fixed 会话保留 ${retained}`);
    }

    // 关闭 fixed 会话后以同一角色打开 legacy 任务会话（B-2 保活会复用同角色会话，故先定向关闭）。
    await h.mgr.stop("chief");
    const openLegacy = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-legacy-session" });
    assert.equal(openLegacy.ok, true, openLegacy.ok === false ? (openLegacy.error ?? "测试会话打开失败") : "");
    const legacyChief = h.inputs.find((input) => input.roleId === "chief" && input.taskId === "t-legacy-session");
    assert.ok(legacyChief !== undefined);
    for (const tool of ["gitQuery", "gitCandidate", "gitPublish", "requestVersionDecision", "stablePermitOf"]) {
      assert.equal(legacyChief![tool] !== undefined, true, `legacy 会话必须保留 ${tool}`);
    }

    // 栈依赖能力：fixed 不注入 select_run_change/submit_version_change/submit_refactor/request_stable_write。
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-fixed-rapporteur", from: "chief", to: "rapporteur", text: "fixed 策划任务", flowId: "fixed-flow",
      workflowId: "wf-caps000000000000000000001", stage: "A5", sideEffect: "docs", idempotencyKey: "caps-fixed-2",
    }));
    const openRapporteur = await h.mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo", taskId: "t-fixed-rapporteur" });
    assert.equal(openRapporteur.ok, true, openRapporteur.ok === false ? (openRapporteur.error ?? "测试会话打开失败") : "");
    const fixedRapporteur = h.inputs.find((input) => input.roleId === "rapporteur");
    assert.ok(fixedRapporteur !== undefined);
    assert.equal(fixedRapporteur!.selectRunChange, undefined, "fixed 不注入 select_run_change");
    assert.equal(fixedRapporteur!.submitVersionChange, undefined, "fixed 不注入 submit_version_change");

    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-fixed-convener", from: "chief", to: "convener", text: "fixed 运营任务", flowId: "fixed-flow",
      workflowId: "wf-caps000000000000000000001", stage: "A9", sideEffect: "read-only", idempotencyKey: "caps-fixed-3",
    }));
    const openConvener = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: "t-fixed-convener" });
    assert.equal(openConvener.ok, true, openConvener.ok === false ? (openConvener.error ?? "测试会话打开失败") : "");
    const fixedConvener = h.inputs.find((input) => input.roleId === "convener");
    assert.ok(fixedConvener !== undefined);
    assert.equal(fixedConvener!.submitRefactor, undefined, "fixed 不注入 submit_refactor");
    assert.equal(fixedConvener!.requestStableWrite, undefined, "fixed 不注入 request_stable_write");
    assert.equal(fixedConvener!.completeTeamPlan !== undefined, true, "fixed 保留 complete_team_plan（v4）");
    assert.equal(fixedConvener!.closeCreatedTask !== undefined, true, "fixed 保留 close_created_task（v2）");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("single/su 模型不受 fixed 过滤影响：即使任务 flow 按 workflowMode 判 fixed，注入仍为 legacy（旧行为逐字不变）", async () => {
  const root = await makeRoot("ans-fixed-single-");
  const h = harness(root, { governanceModel: "single" });
  try {
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-single", from: "chief", to: "su", text: "single 任务", flowId: "new-flow",
      workflowId: "wf-single0000000000000000000001", stage: "A2", sideEffect: "read-only", idempotencyKey: "single-1",
    }));
    const openSu = await h.mgr.open({ projectRoot: root, roleId: "su", runtime: "demo", taskId: "t-single" });
    assert.equal(openSu.ok, true, openSu.ok === false ? (openSu.error ?? "测试会话打开失败") : "");
    const suInput = h.inputs.find((input) => input.roleId === "su");
    assert.ok(suInput !== undefined);
    assert.equal(suInput!.workflowModeForFlow, undefined, "single/su 不注入 workflowModeForFlow");
    assert.equal(suInput!.gitQuery !== undefined, true, "single/su 保留 legacy 注入");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

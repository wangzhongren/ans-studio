// test/测试/mode-switch.test.ts
// T3「两条固定工作流路径」B5（2026-11-10，测试）：B1 T-14 / AC-12——**迁移/模式切换 cross-layer**。
//
// 覆盖（与既有 owner 单测互补；不重复其窄断言）：
//   · 混合项目：legacy 在飞 run 的 flow 与新的 fixed flow **并存**，按**被处理 flowId** 分别路由
//     （legacy ⇒ 旧星形路由；fixed ⇒ 固定矩阵），不缓存项目级单值；项目配置切换后立即生效；
//   · fixed 新 flow 启动（workflow.started + stage-request）只写固定账本，不读取/不修改/不删除
//     legacy `.ans/runs`（旧账本只读忽略）；`project.json` 显式 `legacy/v1` 时 fixed 会话注入关闭；
//   · 每项目至多一个活动 fixed workflow（legacy 在飞 flow 不占 fixed 并发位）。
//
// 既有覆盖引用（不重复）：`test/编排/workflow-mode.test.ts`（per-flow 判定/配置写回/.gitignore 单元）、
// `test/桌面应用/fixed-path-routing.test.ts`（fixed 矩阵/Q6 证据/direct 能力过滤/混合项目路由细节）、
// `test/测试/governance-e2e-auto/i-full-chain.test.ts`（legacy 星形全链逐字断言）。
//
// 夹具：假会话（不启动 Electron/真实模型）；真实 tasks/workflows 账本；无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { resolveWorkflowMode } from "../../app/desktop/workflow.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { readWorkflowLedger } from "../../src/common/编排/workflow-service.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: ProjectListing["roles"][number]["governanceFunction"]): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, governanceFunction: fn,
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"), builtIn("product", "product"), builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"), builtIn("convener", "schedule"), builtIn("verifier", "verification"),
      {
        roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker",
        boundary: { entries: [{ root: "project", path: "src/worker", kind: "directory", purpose: "p" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } },
      },
    ],
    warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio",
  };
}

interface CapturedInput {
  roleId: string;
  taskId?: string;
  workflowModeForFlow?: (flowId: string) => Promise<"fixed" | "legacy">;
  closeCreatedTaskFixed?: unknown;
  [key: string]: unknown;
}

function harness(root: string) {
  const inputs: CapturedInput[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      inputs.push(input as unknown as CapturedInput);
      const handle: RoleSessionHandle = {
        async send(_text: string, _options?: RoleSessionSendOptions) {},
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
    customerInput: async () => ({ outcome: "declined", reason: "test" }),
    emitEvent: () => {},
  });
  return { mgr, inputs };
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
async function routeDispatch(
  mgr: SessionManager, root: string, fromRoleId: string, payload: Record<string, unknown>, source?: LiveSource,
): Promise<{ ok: boolean; message?: string }> {
  const manager = mgr as unknown as {
    routeDispatch(projectRoot: string, runtime: "demo", fromRoleId: string, d: unknown, source?: unknown): Promise<{ ok: boolean; message?: string }>;
  };
  return manager.routeDispatch(root, "demo", fromRoleId, payload, source);
}

async function tempRoot(prefix: string): Promise<string> {
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
function legacyRejection(message: string | undefined): boolean {
  return /document-planning-source-unavailable|缺少当前客户输入与真实项目选择/.test(message ?? "");
}

test("混合项目 per-flow 解析 + B7.1 fixed fail-closed：legacy 在飞 flow 仍 legacy、fixed 新 flow 走固定矩阵；配置切换即时生效（不缓存）", async () => {
  const root = await tempRoot("ans-b5-modeswitch-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeJson(root, ".ans/runs/run-20261110-legacy-11111111/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-legacy-11111111", flowId: "legacy-flow", state: "draft",
    });
    assert.equal(await resolveWorkflowMode(root, "legacy-flow"), "legacy");
    assert.equal(await resolveWorkflowMode(root, "fixed-flow"), "fixed");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief")!;
    assert.equal(typeof chief.workflowModeForFlow, "function");
    assert.equal(await chief.workflowModeForFlow!("legacy-flow"), "legacy");
    assert.equal(await chief.workflowModeForFlow!("fixed-flow"), "fixed");

    // B7.1：显式 fixed 项目的聊天会话为 fixed——普通派发（无 workflowId/stage）一律 fail-closed，
    // 不因被派 flow 的 per-flow 模式而回落 legacy 星形（RR2 fail-open 关闭）；per-flow 解析断言保留在上。
    const legacy = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图", flowId: "legacy-flow" });
    assert.equal(legacy.ok, false);
    assert.match(legacy.message ?? "", /stage-request-required/);
    assert.equal((legacy.message ?? "").includes("document-planning-source-unavailable"), false, "不得回落 legacy 星形");
    assert.equal((legacy.message ?? "").includes("chief-production-dispatch-forbidden"), false, "legacy flow 不得进入 fixed 矩阵");
    // fixed flow：同一 pre-check 先拒绝普通派发（fixed 硬授权矩阵由 fixed-path-routing 覆盖）。
    const fixed = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图", flowId: "fixed-flow" });
    assert.equal(fixed.ok, false);
    assert.match(fixed.message ?? "", /stage-request-required/);

    // fixed 新 flow 启动：只写固定账本；legacy run 原样保留（只读忽略，不删除/不迁移）。
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-mixed-1" });
    const started = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A1：派产品", flowId: "fixed-flow",
      taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(started.ok, true, started.message ?? "");
    const fixedLedger = await readWorkflowLedger(root);
    assert.equal(fixedLedger.events.filter((event) => event.kind === "workflow.started").length, 1);
    const legacyManifest = JSON.parse(await fs.readFile(path.join(root, ".ans", "runs", "run-20261110-legacy-11111111", "manifest.json"), "utf8")) as Record<string, unknown>;
    assert.equal(legacyManifest["state"], "draft", "legacy 在飞 run 不被固定路径修改");
    assert.equal(legacyManifest["flowId"], "legacy-flow");
    // 固定路径不写 `.ans/trunk`；`.ans/runs` 仅保留既有 legacy run。
    await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")));
    assert.deepEqual((await fs.readdir(path.join(root, ".ans", "runs"))).sort(), ["run-20261110-legacy-11111111"]);

    // fixed workflow 在飞期间，fixed 聊天仍对普通派发 fail-closed（per-flow 解析不因项目固定工作流而变）。
    const legacyAfter = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图 v2", flowId: "legacy-flow" });
    assert.equal(legacyAfter.ok, false);
    assert.match(legacyAfter.message ?? "", /stage-request-required/);
    // 每项目至多一个活动 fixed workflow：新 fixed flow 请求 ⇒ workflow-workspace-busy（legacy 不占位）。
    const live2 = liveSource(h.mgr, root, "chief", { turnId: "turn-mixed-2" });
    const busy = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A1（另一 flow）", flowId: "another-fixed-flow",
      taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only",
    }, live2);
    releaseSource(h.mgr, live2);
    assert.equal(busy.ok, false);
    assert.match(busy.message ?? "", /workflow-workspace-busy|project-config-write-failed/);

    // 项目配置切换为显式 legacy/v1：同一 fixed flow 立即改走旧路（不缓存），fixed 账本保留。
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    assert.equal(await chief.workflowModeForFlow!("fixed-flow"), "legacy");
    const afterSwitch = await routeDispatch(h.mgr, root, "chief", { roleId: "product", task: "写产品意图 v3", flowId: "fixed-flow" });
    assert.equal(afterSwitch.ok, false);
    assert.equal(legacyRejection(afterSwitch.message), true, afterSwitch.message ?? "");
    assert.equal((afterSwitch.message ?? "").includes("stage-request-required"), false, "legacy 聊天不得套用 fixed fail-closed");
    assert.equal((afterSwitch.message ?? "").includes("chief-production-dispatch-forbidden"), false, "显式 legacy 项目不得按 fixed 矩阵路由");
    assert.equal((await readWorkflowLedger(root)).events.length, fixedLedger.events.length, "切换配置不写/不删固定账本");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("会话级模式按任务 flowId 解析：legacy 任务 ⇒ legacy 注入；fixed 任务 ⇒ fixed 注入（close v2 在场）", async () => {
  const root = await tempRoot("ans-b5-modeswitch-session-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    await writeJson(root, ".ans/runs/run-20261110-legacy-mode/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-legacy-mode", flowId: "legacy-flow", state: "draft",
    });
    // 启动一个 fixed workflow（使 fixed 任务合法），并写一个 legacy 任务行（无 workflowId）。
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-mode-session" });
    const started = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A1：派产品", flowId: "fixed-flow",
      taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(started.ok, true, started.message ?? "");
    const tasks = await readTaskState(root);
    const fixedTask = [...tasks.records.values()].find((record) => record.created?.taskKind === "stage-request")!;
    const { appendTaskEvent, taskEvent } = await import("../../src/common/编排/task-state.ts");
    const legacyTask = taskEvent("task.created", {
      taskId: "t-legacy-mode", from: "chief", to: "chief", text: "legacy 任务", flowId: "legacy-flow",
      sideEffect: "read-only", idempotencyKey: "legacy-mode-1",
    });
    const appended = await appendTaskEvent(root, legacyTask, { allowLegacyRun: true });
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    await h.mgr.stop("chief");
    // legacy 任务会话：legacy 注入（无 close_created_task v2）。
    const openedLegacy = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-legacy-mode" });
    assert.equal(openedLegacy.ok, true, openedLegacy.ok === false ? (openedLegacy.error ?? "") : "");
    const legacyInput = h.inputs.filter((input) => input.roleId === "chief" && input.taskId === "t-legacy-mode").pop()!;
    assert.equal(legacyInput.closeCreatedTaskFixed, undefined, "legacy 任务会话不得注入 fixed close v2");
    assert.equal(await legacyInput.workflowModeForFlow!("legacy-flow"), "legacy");
    assert.equal(await legacyInput.workflowModeForFlow!("fixed-flow"), "fixed", "同一会话按 flow 解析（不缓存单值）");
    // fixed 任务会话：fixed 注入（close_created_task v2 在场）。
    await h.mgr.stop("chief");
    const openedFixed = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: fixedTask.taskId });
    assert.equal(openedFixed.ok, true, openedFixed.ok === false ? (openedFixed.error ?? "") : "");
    const fixedInput = h.inputs.filter((input) => input.roleId === "chief" && input.taskId === fixedTask.taskId).pop()!;
    assert.equal(typeof fixedInput.closeCreatedTaskFixed, "function", "fixed 任务会话应注入 close_created_task v2");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("配置写回失败（坏 .ans/project.json）⇒ project-config-write-failed fail-closed；不派发、不弹卡、不改文件", async () => {
  const root = await tempRoot("ans-b5-modeswitch-badcfg-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { governanceModel: "trio" });
    const file = path.join(root, ".ans", "project.json");
    await fs.writeFile(file, "{ not-json", "utf8");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-badcfg" });
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A1", flowId: "bad-cfg-flow",
      taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /project-config-write-failed/);
    assert.equal(await fs.readFile(file, "utf8"), "{ not-json", "坏配置不被覆盖");
    assert.equal((await readTaskState(root)).records.size, 0, "失败不派发");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

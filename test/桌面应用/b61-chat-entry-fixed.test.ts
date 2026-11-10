// test/桌面应用/b61-chat-entry-fixed.test.ts
// T3「两条固定工作流路径」B6.1（2026-11-11，桌面窗口）：真实聊天入口修复。
// 依据：RR 失败记录 `fixed-path-not-activated-from-chief-chat`（空项目幕僚聊天无 taskId ⇒ 旧硬编码
// legacy，固定路径未启动）；协调方授权（空项目/无 legacy run/trunk 且未显式 legacy/v1 ⇒ 幕僚聊天默认
// fixed；legacy 项目/在飞 run/显式 legacy 仍旧路径；fixed 注入 v2/context；首条新 workflow 启动前
// `prepareFixedPathStart`）；v1.3 §4.1；B1 v1.2 AC-12/AC-23/T-05。
//
// 覆盖（全部确定性、假会话；不启动 Electron/真实模型）：
//   1. `sessionWorkflowModeForChat` 单元：空项目 fixed；显式 legacy/fixed 优先；在飞 run（draft/pinned）
//      /有效 trunk ⇒ legacy；关闭 run/非有效 trunk ⇒ fixed；坏 project.json/坏 trunk/坏 run manifest/
//      项目根不可读 ⇒ legacy（fail-closed）；不缓存项目级单值。
//   2. trio 聊天（无 taskId）：空项目 ⇒ `openRoleSession` 入参 `workflowMode:"fixed"`（run-role 据此注入
//      fixed context/chief-workflow-v2/fixed 工具面）+ legacy Git/VCA/stable 能力缺席；legacy 项目/显式
//      legacy/在飞 run ⇒ 不传常量、legacy 注入逐项仍在；single/su 不注入；有 taskId 的既有路径不变。
//   3. 首个 stage-request：空项目（无 `.ans/project.json`）⇒ `ensureFixedPathStarted` 原子写
//      `workflowSchema:"two-fixed-paths/v1"` + fixed 路由（workflow.started、只读任务、无 runId、不写
//      `.ans/runs`），投递自动打开的目标会话也为 fixed；legacy 在飞 run 的 flow 不被覆盖。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { resolveWorkflowMode, sessionWorkflowModeForChat } from "../../app/desktop/workflow.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { readWorkflowLedger } from "../../src/common/编排/workflow-service.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchReceipt, DispatchTaskPayload } from "../../src/model/runtime.ts";

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

async function writeText(root: string, rel: string, text: string): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
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

// ══════════════════════════ 1. sessionWorkflowModeForChat ══════════════════════════

test("sessionWorkflowModeForChat：空项目 ⇒ fixed；显式 legacy/v1 / two-fixed-paths/v1 优先且不缓存", async () => {
  const root = await makeRoot("ans-b61-chat-mode-");
  try {
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "空项目/纯新项目聊天默认 fixed");
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "显式 legacy/v1 ⇒ legacy");
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "显式 two-fixed-paths/v1 ⇒ fixed");
    // 不缓存：同进程内改配置后立即生效。
    await writeJson(root, ".ans/project.json", { governanceModel: "trio" });
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "缺省 + 无旧状态 ⇒ fixed");
    await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "切回 legacy/v1 立即 legacy");
  } finally {
    await cleanup(root);
  }
});

test("sessionWorkflowModeForChat：在飞 legacy run（draft/pinned）⇒ legacy；closed/cancelled ⇒ fixed", async () => {
  const root = await makeRoot("ans-b61-chat-run-");
  try {
    await writeJson(root, ".ans/runs/run-20261110-draft-11111111/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-draft-11111111", flowId: "legacy-flow", state: "draft",
    });
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "draft 在飞 run ⇒ legacy");
    await writeJson(root, ".ans/runs/run-20261110-pinned-22222222/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-pinned-22222222", flowId: "legacy-flow-2", state: "pinned",
    });
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "pinned 在飞 run ⇒ legacy");
    // 全部关闭 ⇒ 不阻止 fixed。
    await writeJson(root, ".ans/runs/run-20261110-draft-11111111/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-draft-11111111", flowId: "legacy-flow", state: "closed",
    });
    await writeJson(root, ".ans/runs/run-20261110-pinned-22222222/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-pinned-22222222", flowId: "legacy-flow-2", state: "cancelled",
    });
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "closed/cancelled run 不再在飞 ⇒ fixed");
  } finally {
    await cleanup(root);
  }
});

test("sessionWorkflowModeForChat：有效 trunk ⇒ legacy；trunk 引用已关闭 run / 非有效 trunk ⇒ fixed", async () => {
  const root = await makeRoot("ans-b61-chat-trunk-");
  try {
    await writeJson(root, ".ans/trunk/manifest.json", { schema: "trunk/v1", trunkVersion: 1, flowId: "snake" });
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "有效 trunk ⇒ legacy（旧项目仍旧路径）");
    // trunk 引用的 run 已关闭 ⇒ 与编排同口径视为关闭 ⇒ 不强制 legacy。
    await writeJson(root, ".ans/runs/run-20261110-snake-33333333/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-snake-33333333", flowId: "snake", state: "closed",
    });
    await writeJson(root, ".ans/trunk/manifest.json", {
      schema: "trunk/v1", trunkVersion: 2, flowId: "snake", runId: "run-20261110-snake-33333333",
    });
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "trunk 引用 closed run ⇒ 不强制 legacy");
    // 非有效 trunk（schema/版本不合法）不是 legacy 触发条件（与编排 validTrunkPointsToFlow 同口径）。
    await writeJson(root, ".ans/trunk/manifest.json", { schema: "trunk/v0", trunkVersion: 1, flowId: "snake" });
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "trunk/v0 非有效 trunk ⇒ fixed");
    await writeJson(root, ".ans/trunk/manifest.json", { schema: "trunk/v1", trunkVersion: 0, flowId: "snake" });
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "trunkVersion 非正整数 ⇒ 非有效 trunk");
  } finally {
    await cleanup(root);
  }
});

test("sessionWorkflowModeForChat：坏配置/读失败 ⇒ legacy（fail-closed，不猜 fixed）", async () => {
  const root = await makeRoot("ans-b61-chat-bad-");
  try {
    const projectFile = path.join(root, ".ans", "project.json");
    await fs.mkdir(path.dirname(projectFile), { recursive: true });
    await fs.writeFile(projectFile, "{oops", "utf8");
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "坏 project.json（不可解析）⇒ legacy");
    await fs.writeFile(projectFile, JSON.stringify({ workflowSchema: "bogus" }), "utf8");
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "非法 workflowSchema ⇒ legacy");
    await fs.rm(projectFile);
    // 坏 trunk manifest（存在但不可解析）⇒ 不能确定旧状态 ⇒ legacy。
    await writeText(root, ".ans/trunk/manifest.json", "{oops");
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "坏 trunk manifest ⇒ legacy");
    await fs.rm(path.join(root, ".ans", "trunk", "manifest.json"));
    // 坏 run manifest（存在但不可解析）⇒ 不能确定是否有在飞 run ⇒ legacy。
    await writeText(root, ".ans/runs/run-20261110-bad-44444444/manifest.json", "not json");
    assert.equal(await sessionWorkflowModeForChat(root), "legacy", "坏 run manifest ⇒ legacy");
    await fs.rm(path.join(root, ".ans", "runs", "run-20261110-bad-44444444", "manifest.json"));
    assert.equal(await sessionWorkflowModeForChat(root), "fixed", "移除坏配置后恢复 fixed");
    // 项目根不存在 ⇒ 读失败 ⇒ legacy（不猜 fixed）。
    assert.equal(await sessionWorkflowModeForChat(path.join(root, "missing-root")), "legacy", "项目根不可读 ⇒ legacy");
  } finally {
    await cleanup(root);
  }
});

// ══════════════════════════ 2. 聊天入口注入 ══════════════════════════

test("trio 空项目幕僚聊天（无 taskId）⇒ workflowMode=fixed + fixed 工具面；legacy Git/VCA/stable 不注入", async () => {
  const root = await makeRoot("ans-b61-chat-fixed-");
  const h = harness(root);
  try {
    const chief = await openChat(h, root, "chief");
    assert.equal(chief.workflowMode, "fixed", "fixed 聊天必须向 run-role 传会话级常量（注入 fixed context/v2）");
    assert.equal(typeof chief.workflowModeForFlow, "function", "per-flow 回调与常量并存（legacy/混合项目路径不变）");
    for (const tool of ["gitQuery", "gitCandidate", "gitPublish", "requestVersionDecision", "stablePermitOf", "requestStableWrite", "submitVersionChange", "submitRefactor"]) {
      assert.equal(chief[tool], undefined, `fixed 聊天不得注入 legacy 能力 ${tool}（AC-23）`);
    }
    for (const retained of ["closeCreatedTask", "closeCreatedTaskFixed", "docFormat", "contractCheck", "evidenceCheck", "projectState", "projectNote"]) {
      assert.equal(chief[retained] !== undefined, true, `fixed 聊天保留 ${retained}`);
    }
    assert.equal("requestReleaseMerge" in chief, false, "G-IR：不新增 request_release_merge");

    // convener 聊天：fixed 注入 complete_team_plan（v4 应用实现）/close_created_task v2；legacy-only 能力缺席。
    const convener = await openChat(h, root, "convener");
    assert.equal(convener.workflowMode, "fixed");
    assert.equal(convener.completeTeamPlan !== undefined, true, "fixed 聊天保留 complete_team_plan");
    assert.equal(convener.closeCreatedTaskFixed !== undefined, true, "fixed 聊天注入 close_created_task v2");
    assert.equal(convener.submitRefactor, undefined, "fixed 聊天不注入 submit_refactor");
    assert.equal(convener.requestStableWrite, undefined, "fixed 聊天不注入 request_stable_write");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("legacy 项目（在飞 run/有效 trunk/显式 legacy/v1）幕僚聊天 ⇒ 不传常量、legacy 注入逐项仍在", async () => {
  for (const fixture of ["active-run", "trunk", "explicit-legacy"] as const) {
    const root = await makeRoot(`ans-b61-chat-legacy-${fixture}-`);
    const h = harness(root);
    try {
      if (fixture === "active-run") {
        await writeJson(root, ".ans/runs/run-20261110-legacy-55555555/manifest.json", {
          schema: "ans-run/v1", runId: "run-20261110-legacy-55555555", flowId: "legacy-flow", state: "draft",
        });
      } else if (fixture === "trunk") {
        await writeJson(root, ".ans/trunk/manifest.json", { schema: "trunk/v1", trunkVersion: 1, flowId: "snake" });
      } else {
        await writeJson(root, ".ans/project.json", { workflowSchema: "legacy/v1", governanceModel: "trio" });
      }
      const chief = await openChat(h, root, "chief");
      assert.equal(chief.workflowMode, undefined, `[${fixture}] legacy 聊天不传会话级常量（per-flow 现场解析不变）`);
      assert.equal(typeof chief.workflowModeForFlow, "function", `[${fixture}] legacy 聊天保留 workflowModeForFlow`);
      for (const tool of ["gitQuery", "gitCandidate", "gitPublish", "requestVersionDecision", "stablePermitOf"]) {
        assert.equal(chief[tool] !== undefined, true, `[${fixture}] legacy 聊天必须保留 ${tool}`);
      }
      assert.equal(chief.closeCreatedTaskFixed, undefined, `[${fixture}] legacy 聊天不注入 fixed close`);
      assert.equal(chief.closeCreatedTask !== undefined, true, `[${fixture}] legacy 聊天保留 legacy close`);
      assert.equal(await sessionWorkflowModeForChat(root), "legacy", `[${fixture}] 聊天模式解析为 legacy`);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("single/su 聊天：不注入 workflowMode/workflowModeForFlow，注入仍为 legacy（旧行为逐字不变）", async () => {
  const root = await makeRoot("ans-b61-chat-single-");
  const h = harness(root, { governanceModel: "single" });
  try {
    const su = await openChat(h, root, "su");
    assert.equal(su.workflowMode, undefined, "single/su 不传会话级常量");
    assert.equal(su.workflowModeForFlow, undefined, "single/su 不注入 per-flow 回调");
    assert.equal(su.gitQuery !== undefined, true, "single/su 保留 legacy 注入");
    assert.equal(su.stablePermitOf !== undefined, true, "single/su 保留 stable 许可查询");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════ 3. 首个 stage-request（fixed 启动顺序） ══════════════════════════

test("空项目首个 stage-request：fixed 聊天 ⇒ ensureFixedPathStarted 写 workflowSchema + fixed 路由；投递目标会话亦 fixed", async () => {
  const root = await makeRoot("ans-b61-first-stage-");
  const h = harness(root);
  try {
    // 0) 真正的空项目：无 .ans/project.json、无 Git、无旧账本。
    await assert.rejects(fs.stat(path.join(root, ".ans", "project.json")));
    const chief = await openChat(h, root, "chief");
    assert.equal(chief.workflowMode, "fixed", "空项目幕僚聊天为 fixed（B6.1 根因修复）");

    // 1) 幕僚首个 stage-request（携带 workflowPath）⇒ 应用先原子写 workflowSchema，再按复核模式走 fixed。
    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-customer-b61" });
    const payload: DispatchTaskPayload = {
      roleId: "convener", task: "推进 A1：请派产品撰写意图", flowId: "snake",
      taskKind: "stage-request", workflowPath: "A", stage: "A1", sideEffect: "read-only",
    };
    const receipt = await routeDispatch(h.mgr, root, "chief", payload, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");

    const config = JSON.parse(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
    assert.equal(config["workflowSchema"], "two-fixed-paths/v1", "首次 fixed 启动写回 workflowSchema");
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.some((event) => event.kind === "workflow.started"), true, "首个 stage-request 启动 fixed workflow");
    const task = [...(await readTaskState(root)).records.values()].find((item) => item.created?.taskKind === "stage-request");
    assert.ok(task?.created, "stage-request 任务应已创建");
    assert.equal(task!.created!.to, "convener");
    assert.equal(task!.created!.sideEffect, "read-only", "stage-request 固定只读");
    assert.equal(task!.created!.runId, undefined, "fixed stage-request 不带 legacy runId");
    assert.equal(task!.created!.workflowId?.startsWith("wf-"), true, "fixed workflowId 已绑定");
    let runEntries: string[] = [];
    try { runEntries = await fs.readdir(path.join(root, ".ans", "runs")); } catch { runEntries = []; }
    assert.equal(runEntries.filter((name) => name.startsWith("run-")).length, 0, "fixed 首请求不写 .ans/runs legacy run");

    // 2) 投递自动打开的目标会话：workflowSchema 已写回 ⇒ 聊天入口按 fixed 注入（不再退回 legacy）。
    await waitUntil(() => h.inputs.some((input) => input.roleId === "convener"));
    const convenerOpen = h.inputs.find((input) => input.roleId === "convener");
    assert.equal(convenerOpen?.workflowMode, "fixed", "首个 fixed 派发自动打开的目标会话也注入 fixed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("legacy 在飞 run 不被首条 stage-request 覆盖：仍走 legacy（无 workflow.started、无 fixed 任务）", async () => {
  const root = await makeRoot("ans-b61-legacy-inflight-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/runs/run-20261110-legacy-66666666/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-legacy-66666666", flowId: "focus", state: "draft",
    });
    const chief = await openChat(h, root, "chief");
    assert.equal(chief.workflowMode, undefined, "在飞 legacy run ⇒ 聊天不注入 fixed");
    assert.equal(await sessionWorkflowModeForChat(root), "legacy");

    const live = liveSource(h.mgr, root, "chief", "demo", { turnId: "turn-legacy-inflight" });
    const receipt = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A1：请派产品撰写意图", flowId: "focus",
      taskKind: "stage-request", workflowPath: "A", stage: "A1", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    // 首次启动写回只作默认值；该 flow 有在飞 legacy run ⇒ 编排 workflowMode 仍判 legacy（不被覆盖）。
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.some((event) => event.kind === "workflow.started"), false, "legacy 在飞 flow 不得启动 fixed workflow");
    assert.equal(await resolveWorkflowMode(root, "focus"), "legacy", "在飞 flow 仍旧 legacy");
    const tasks = [...(await readTaskState(root)).records.values()];
    assert.equal(tasks.some((record) => record.created?.workflowId !== undefined), false, "不得产生 fixed 任务行");
    // 该派发最多只能是 legacy 路由的结果（由 legacy 谓词裁决），失败也不得伪造 fixed 受理。
    if (!receipt.ok) assert.match(receipt.message ?? "", /./, "失败须如实回执");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

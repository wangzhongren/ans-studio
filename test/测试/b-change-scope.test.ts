// test/测试/b-change-scope.test.ts
// T3「两条固定工作流路径」B5（2026-11-10，测试）：B1 T-12 / AC-10——**路径 B 写集 cross-layer**。
//
// 覆盖（owner 单测之外的跨层组合：B2 应用服务 → 桌面派发写集门 → 任务级 Git）：
//   · 无 roster 旧项目：B2 `change.scope-decided`（应用服务）按角色边界派生唯一属主；B3 派发
//     `modulePaths` 与派生写集不一致 ⇒ `b-change-scope-invalid`（不创建任务行）；多属主/`docs/` 治理
//     文档属主非策划/`无边界` ⇒ 拒绝；`.ans/**`/`角色卡/**` 永不进入实现写集；
//   · 有 roster：scope.files ∩ 名单模块属主（写集按属主分组）；B3 派发只能给 scope 内角色/模块；
//   · 写集来源不因「无团队计划」而被全局拒绝（B 路径来源 = B2 派生，不回落 A）。
//
// 既有覆盖引用（不重复）：`test/编排/path-b-baseline.test.ts`（derivePathBWriteSets 单元全负例）、
// `test/桌面应用/b3-fixed-baseline-pathb.test.ts`（桌面 B1 最小准备/B3 写集门窄断言）、
// `test/编排/shell-task-git-execution.test.ts`（resolveTaskGitScope A/B 解析与执行路径）。
//
// 夹具：真实临时 Git 仓库 + 假会话（不启动 Electron/真实模型）；无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { createDesktopBaselineGitPort } from "../../app/desktop/workflow-git.ts";
import {
  closeTask,
  preparePathBStart,
  readBasisLedger,
  readWorkflowLedger,
  recordChangeScopeDecision,
  requestStage,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import { appendWorkflowEvent } from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { WorkflowEvent } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const AT = "2026-11-10T10:00:00.000Z";
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function listing(root: string, extraRoles: string[] = []): ProjectListing {
  const builtIn = (roleId: string, fn: ProjectListing["roles"][number]["governanceFunction"]): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, governanceFunction: fn,
  });
  const project = (roleId: string): ProjectListing["roles"][number] => ({
    roleId, cardPath: `角色卡/${roleId}/role-card.md`, boundaryPath: `角色卡/${roleId}/boundary.yaml`, cardText: roleId,
    boundary: { entries: [], boundarySource: `角色卡/${roleId}/boundary.yaml`, acceptance: { accepted: false, source: "" } },
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"), builtIn("product", "product"), builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"), builtIn("convener", "schedule"), builtIn("verifier", "verification"),
      project("impl"), project("worker"), ...extraRoles.map(project),
    ],
    warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio",
  };
}

interface CapturedInput {
  roleId: string;
  taskId?: string;
  closeCreatedTaskFixed?: (input: { operationId: string; taskId: string; outcome: "accepted" | "rework" | "rejected"; note?: string }, signal?: AbortSignal) => Promise<unknown>;
  [key: string]: unknown;
}

function harness(root: string, extraRoles: string[] = []) {
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
    getListing: (r) => (r === root ? listing(root, extraRoles) : undefined),
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
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
async function initRepoWithFile(root: string, rel: string, content: string): Promise<void> {
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "B5 Test");
  git(root, "config", "user.email", "b5@test.local");
  git(root, "config", "core.autocrlf", "false");
  await writeFile(root, rel, content);
  const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
  assert.equal(ensured.ok, true);
  git(root, "add", "-A");
  git(root, "commit", "-m", "base");
}
function boundaryMd(paths: readonly string[]): string {
  return [
    "# 边界", "", "## Section 1: 可修改文件与目录", "",
    "| 类型 | 路径 | 用途 |", "| --- | --- | --- |",
    ...paths.map((item) => `| 目录 | \`${item}\` | test |`), "",
  ].join("\n");
}
function boundaryYaml(paths: readonly string[]): string {
  return paths.map((item) => `- root: project\n  path: ${item}\n  kind: directory\n  purpose: test\n`).join("");
}

async function startBWorkflow(root: string, sourceTaskId = "turn-b-start"): Promise<string> {
  const started = await requestStage({
    projectRoot: root, flowId: FLOW, stage: "B1", workflowPath: "B",
    requestDigest: sha("B1 start"), sourceTaskId, text: "推进 B1：影响面分析",
  });
  assert.equal(started.ok, true, started.ok === false ? `${started.code}: ${started.message}` : "");
  if (!started.ok) throw new Error("start");
  // 应用在 B1 派发时完成路径 B 最小准备（既有仓库/任务分支/basis(reason:"path-b")；桌面同源调用）。
  const prepared = await preparePathBStart({
    projectRoot: root, flowId: FLOW, workflowId: started.workflowId,
    operationId: `path-b:${started.workflowId}`, port: createDesktopBaselineGitPort(),
  });
  assert.equal(prepared.ok, true, prepared.ok === false ? `${prepared.code}: ${prepared.message}` : "");
  return started.workflowId;
}
async function completeB1(root: string, workflowId: string): Promise<void> {
  const event: WorkflowEvent = {
    v: 1, at: new Date(AT).toISOString(), schema: "ans-workflow/v1", kind: "stage.completed",
    workflowId, flowId: FLOW, path: "B",
    idempotencyKey: `stage-complete:${workflowId}:B1:seed`, stage: "B1",
    cause: { kind: "seed", ref: "seed-B1" }, artifacts: [],
  };
  const appended = await appendWorkflowEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  // 收口 B1 stage-request（open advance 不变量：下一 advance 前必须收口）。
  const state = await readTaskState(root);
  const sr = [...state.records.values()].find((item) => item.created?.workflowId === workflowId
    && item.created.taskKind === "stage-request" && item.closed === undefined);
  assert.ok(sr !== undefined);
  const reported = await appendTaskEvent(root, taskEvent("task.reported", {
    taskId: sr!.taskId, from: "convener", status: "done", summary: "B1 请求已受理",
  }));
  assert.equal(reported.ok, true, reported.ok === false ? reported.message : "");
  const closed = await closeTask({
    projectRoot: root, operationId: `op-close-sr-b1-${workflowId}`, taskId: sr!.taskId,
    outcome: "accepted", actorRoleId: "chief",
  });
  assert.equal(closed.ok, true, closed.ok === false ? `${closed.code}: ${closed.message}` : "");
}
async function confirmOpenStageRequest(root: string, stage: "B3"): Promise<{ taskId: string; workflowId: string }> {
  const state = await readTaskState(root);
  const record = [...state.records.values()].find((item) => item.created?.taskKind === "stage-request"
    && item.created.stage === stage && item.closed === undefined);
  assert.ok(record !== undefined, `应存在 open ${stage} stage-request`);
  return { taskId: record!.taskId, workflowId: record!.created!.workflowId! };
}
async function dispatchB3(
  h: ReturnType<typeof harness>, root: string, targetRoleId: string, modulePaths: string[],
): Promise<{ ok: boolean; message?: string }> {
  const sr = await confirmOpenStageRequest(root, "B3");
  const convenerInput = h.inputs.filter((input) => input.roleId === "convener").pop();
  assert.ok(convenerInput !== undefined);
  const live = liveSource(h.mgr, root, "convener", { taskId: sr.taskId });
  const receipt = await routeDispatch(h.mgr, root, "convener", {
    roleId: targetRoleId, task: `B3 实现（${modulePaths.join(",")}）`, flowId: FLOW, workflowId: sr.workflowId,
    stage: "B3", sideEffect: "code", moduleId: "core", modulePaths,
  }, live);
  releaseSource(h.mgr, live);
  return receipt;
}

test("无 roster 旧项目：B2 scope 按角色边界派生；B3 派发 modulePaths 越界/多属主/治理文档拒绝（不建任务行）", async () => {
  const root = await tempRoot("ans-b5-bscope-boundary-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await initRepoWithFile(root, "src/app/main.ts", "export const main = 1;\n");
    await writeFile(root, "角色卡/impl/boundary.md", boundaryMd(["src/app/"]));
    await writeFile(root, "角色卡/impl/boundary.yaml", boundaryYaml(["src/app/"]));
    await writeFile(root, "角色卡/impl/role-card.md", "# impl\n");
    const workflowId = await startBWorkflow(root);
    await completeB1(root, workflowId);
    assert.equal((await readWorkflowLedger(root)).events.filter((event) => event.kind === "workflow.started").length, 1);
    // B2：应用服务记录 change.scope-decided（生产接线缺失见 G-B5-2）。
    const impactText = "# 影响面\n\n修复 main。\n";
    await writeFile(root, "角色卡/impl/docs/change/impact-v1.md", impactText);
    const scope = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-b2",
      impactReport: { path: "角色卡/impl/docs/change/impact-v1.md", sha256: sha(impactText) },
      scope: { summary: "修复 main", files: ["src/app/main.ts"] },
      requestTaskId: "t-b1-seed",
    });
    assert.equal(scope.ok, true, scope.ok === false ? `${scope.code}: ${scope.message}` : "");
    if (scope.ok) assert.deepEqual(scope.writesets, [{ roleId: "impl", paths: ["src/app/main.ts"] }]);
    // 打开会话（fixed 任务绑定）+ 请求 B3 stage-request。
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief")!;
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b3" });
    const b3Request = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 B3：修复 main", flowId: FLOW, workflowId, stage: "B3",
      taskKind: "stage-request", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(b3Request.ok, true, b3Request.message ?? "");
    const sr = await confirmOpenStageRequest(root, "B3");
    await h.mgr.stop("convener"); // 投递自动开的是 legacy 注入会话；关闭后按 fixed 任务重开
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: sr.taskId });
    // 合法：modulePaths 覆盖派生写集；B3 派发前应用记 basis(reason:"path-b") 并复核。
    const allowed = await dispatchB3(h, root, "impl", ["src/app/"]);
    assert.equal(allowed.ok, true, allowed.message ?? "");
    // 越界：modulePaths 与写集不一致 ⇒ b-change-scope-invalid（零新任务行）。
    const before = (await readTaskState(root)).records.size;
    const outside = await dispatchB3(h, root, "impl", ["src/other/"]);
    assert.equal(outside.ok, false);
    assert.match(outside.message ?? "", /b-change-scope-invalid/);
    assert.equal((await readTaskState(root)).records.size, before, "越界拒绝不产生任务行");
    // B2 服务同样的约束：scope 外路径 ⇒ 拒绝；.ans/**、角色卡/** 永不进入写集。
    for (const files of [["src/other/x.ts"], [".ans/state/workflows.jsonl"], ["角色卡/impl/role-card.md"]]) {
      const rejected = await recordChangeScopeDecision({
        projectRoot: root, flowId: FLOW, workflowId, operationId: `op-b2-bad-${files[0]}`,
        impactReport: { path: "角色卡/impl/docs/change/impact-v1.md", sha256: sha(impactText) },
        scope: { summary: "bad", files },
        requestTaskId: "t-b1-seed",
      });
      assert.equal(rejected.ok, false, `scope ${files[0]} 应拒绝`);
      if (!rejected.ok) assert.equal(rejected.code, "b-change-scope-invalid");
    }
    // 多属主：第二角色同边界 ⇒ 无法唯一归属。
    await writeFile(root, "角色卡/impl2/boundary.md", boundaryMd(["src/app/"]));
    await writeFile(root, "角色卡/impl2/boundary.yaml", boundaryYaml(["src/app/"]));
    const ambiguous = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-b2-ambiguous",
      impactReport: { path: "角色卡/impl/docs/change/impact-v1.md", sha256: sha(impactText) },
      scope: { summary: "ambiguous", files: ["src/app/main.ts"] },
      requestTaskId: "t-b1-seed",
    });
    assert.equal(ambiguous.ok, false);
    if (!ambiguous.ok) assert.equal(ambiguous.code, "b-change-scope-invalid");
    await fs.rm(path.join(root, "角色卡", "impl2"), { recursive: true, force: true });
    // 治理文档：边界含 docs/contracts 的实现角色 ⇒ 须策划/产品（b-change-scope-requires-rapporteur）。
    await writeFile(root, "角色卡/impl/boundary.md", boundaryMd(["src/app/", "docs/contracts/"]));
    await writeFile(root, "角色卡/impl/boundary.yaml", boundaryYaml(["src/app/", "docs/contracts/"]));
    const governance = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-b2-gov",
      impactReport: { path: "角色卡/impl/docs/change/impact-v1.md", sha256: sha(impactText) },
      scope: { summary: "governance", files: ["docs/contracts/snake-architecture-v2.md"] },
      requestTaskId: "t-b1-seed",
    });
    assert.equal(governance.ok, false);
    if (!governance.ok) assert.equal(governance.code, "b-change-scope-requires-rapporteur");
    // 账本：B 路径 basis(reason=path-b) 只读快照存在；无客户卡事件。
    const basis = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.recorded");
    assert.equal(basis.length >= 1, true);
    assert.equal((await readTaskState(root)).events.some((event) => event.kind === "request.created"), false, "路径 B 不弹客户卡");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("有 roster：B2 scope ∩ 名单模块属主；B3 派发只能给 scope 内角色/模块；项目状态投影 B2 completed", async () => {
  const root = await tempRoot("ans-b5-bscope-roster-");
  const h = harness(root, ["qa"]);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await initRepoWithFile(root, "src/core/snake.ts", "export const SNAKE = 1;\n");
    const moduloText = [
      "---", "schema: project-modules/v2", "flowId: snake", "version: 1", "modules:",
      "  - id: core", "    name: Core", "    purpose: Core", "    path: src/core/", "    category: core",
      "    publicContract: src/core/index.ts", "    architectureSource: docs/contracts/snake-architecture-v1.md",
      "  - id: qa-suite", "    name: QA", "    purpose: QA", "    path: test/qa/", "    category: core",
      "    publicContract: test/qa/index.ts", "    architectureSource: docs/contracts/snake-architecture-v1.md",
      "---", "# Modules", "",
    ].join("\n");
    const rosterText = [
      "---", "schema: project-roster/v4", "flowId: snake", "version: 1",
      "intent: docs/product/snake-intent-v1.md", "proposal: docs/proposals/snake-proposal-v1.md",
      "architecture: docs/contracts/snake-architecture-v1.md",
      "envBootstrap:", "  omitted: true", "  omissionReason: test",
      "roles:",
      "  - id: worker", "    displayName: Worker", "    purpose: Impl", "    capability: TS",
      "    modules: [core]",
      "  - id: qa", "    displayName: QA", "    purpose: Verify", "    capability: Test",
      "    modules: [qa-suite]", "    review: true",
      "modules:",
      "  - id: core", "    name: Core", "    purpose: Core", "    path: src/core/", "    category: core",
      "    publicContract: src/core/index.ts", "    architectureSource: docs/contracts/snake-architecture-v1.md",
      "  - id: qa-suite", "    name: QA", "    purpose: QA", "    path: test/qa/", "    category: core",
      "    publicContract: test/qa/index.ts", "    architectureSource: docs/contracts/snake-architecture-v1.md",
      "---", "# Roster", "## 人员+模块拓扑图", "```topology", "schema: project-topology/v2",
      "management: [convener, worker, qa]", "modules:",
      "  - id: core", "    path: src/core/", "    roleId: worker",
      "  - id: qa-suite", "    path: test/qa/", "    roleId: qa",
      "roles:", "  - id: worker", "    modules: [core]", "  - id: qa", "    modules: [qa-suite]", "```", "",
    ].join("\n");
    await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake\ngoal: fix\n---\n# Intent\n");
    await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\n---\n# Proposal\nintent: docs/product/snake-intent-v1.md\n");
    await writeFile(root, "docs/proposals/snake-modules-v1.md", moduloText);
    await writeFile(root, "docs/proposals/snake-roster-v1.md", rosterText);
    await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
    const workflowId = await startBWorkflow(root, "turn-b-roster");
    await completeB1(root, workflowId);
    const impactText = "# 影响面\n";
    await writeFile(root, "docs/governance/rapporteur/snake-impact-v1.md", impactText);
    const scope = await recordChangeScopeDecision({
      projectRoot: root, flowId: FLOW, workflowId, operationId: "op-b2-roster",
      impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: sha(impactText) },
      scope: { summary: "修复 core 与 qa", files: ["src/core/snake.ts", "test/qa/check.ts"] },
      requestTaskId: "t-b1-roster",
    });
    assert.equal(scope.ok, true, scope.ok === false ? `${scope.code}: ${scope.message}` : "");
    if (scope.ok) {
      assert.deepEqual(scope.writesets, [
        { roleId: "qa", paths: ["test/qa/check.ts"] },
        { roleId: "worker", paths: ["src/core/snake.ts"] },
      ]);
    }
    // 未列入 scope 的模块路径 ⇒ 派发拒绝（scope 未给该角色/模块）。
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b3-roster" });
    const b3Request = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 B3：修复", flowId: FLOW, workflowId, stage: "B3",
      taskKind: "stage-request", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(b3Request.ok, true, b3Request.message ?? "");
    const sr = await confirmOpenStageRequest(root, "B3");
    await h.mgr.stop("convener"); // 投递自动开的是 legacy 注入会话；关闭后按 fixed 任务重开
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: sr.taskId });
    const wrongRole = await dispatchB3(h, root, "qa", ["src/core/"]);
    assert.equal(wrongRole.ok, false, "scope 未给 qa core 写集");
    assert.match(wrongRole.message ?? "", /b-change-scope-invalid/);
    const allowed = await dispatchB3(h, root, "worker", ["src/core/"]);
    assert.equal(allowed.ok, true, allowed.message ?? "");
    // 投影：B2 completed、B3 dispatched。
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events.filter((event) => event.workflowId === workflowId), (await readTaskState(root)).events);
    assert.equal(view.stages.B2.status, "completed");
    assert.equal(view.stages.B3.status, "requested", "B3 在办（完成于收口 + 分支 tip；派发记账非完成条件）");
    assert.equal(view.reviewRoleId, undefined, "reviewRoleId 由 basis 记录（路径 B 在首次派发时记录）");
    const basis = (await readBasisLedger(root)).events.find((event) => event.kind === "basis.recorded" && event.workflowId === workflowId);
    assert.ok(basis !== undefined && basis.kind === "basis.recorded" && basis.reviewRoleId === "qa", "roster review 角色 ∈ basis reviewRoleId");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

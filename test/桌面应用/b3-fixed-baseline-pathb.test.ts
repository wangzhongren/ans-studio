// test/桌面应用/b3-fixed-baseline-pathb.test.ts
// T3「两条固定工作流路径」B3（2026-11-10，桌面窗口）：A9 基线 / A12 归档 / 路径 B 的**桌面接线**。
//
// 覆盖（AC-09/AC-10/AC-15/AC-16/AC-20/AC-22；T-07/T-11/T-12 桌面侧）：
//   · A9：fixed 会话的 `complete_team_plan` 经应用服务 `completeTeamPlanFixed` + 真实 `BaselineGitPort`
//     执行（git init -b main/.gitignore + baseline commit/任务分支/dirty）→ `basis.recorded`（repo 快照）
//     → `stage.completed A9`；B29 起成功/失败均**原样返回 fixed 服务形状**（成功含 basisId/plan/documents/
//     replay/stageCompleted；失败 `{ok:false,code,message}`），不弹客户卡；不写 `.ans/runs`/`.ans/trunk`；
//   · A12：fixed `close_created_task` v2 应用实现补齐证据（报告证据 artifacts / A11·B3 branchTipOid /
//     A12b 应用归档 `docs/acceptance/<flowId>-acceptance-vN.md`）→ `stage.completed A12b` + A12 聚合；
//     归档失败（criteria 缺证）⇒ `acceptance-record-invalid` 阻塞且不写 task.closed；operationId 幂等 replay；
//   · 路径 B：B1 派发前应用最小准备（既有仓库；无仓库 ⇒ `b-repository-required` 不自动 init；从当前 HEAD
//     建/复用任务分支；`basis.recorded(reason:"path-b")` 只读快照、不写团队计划、不弹卡）；
//   · B3 写集门：派发 modulePaths 必须落在 `change.scope-decided.effectiveWritesets` 内；越界/无写集
//     ⇒ `b-change-scope-invalid`（无任务行）。
//
// 夹具：真实临时 Git 仓库 + 账本/文档夹具；假会话（不启动 Electron/真实模型）；无新增 skip/force-exit。

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
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { isDirectActionReceipt } from "../../src/model/trunk.ts";
import {
  appendBasisEvent,
  appendWorkflowEvent,
  readBasisLedger,
  readWorkflowLedger,
  taskBranchName,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type {
  BasisEvent,
  CompleteTeamPlanFn,
  CustomerInputOutcome,
  CustomerInputRequest,
  TaskSideEffect,
  WorkflowEvent,
  WorkflowStage,
  WriteGate,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const WF = "wf-b3a9a12000000000000000001";
const AT = "2026-11-10T10:00:00.000Z";

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
/** B29：工具层闭环用的放行写门（desktop 测试本地夹具；不触盘）。 */
const allowGate: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "b29-test" } });

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
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker",
        boundary: { entries: [{ root: "project", path: "src/core", kind: "directory", purpose: "core" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
      { roleId: "qa-project", cardPath: "角色卡/qa-project/role-card.md", boundaryPath: "角色卡/qa-project/boundary.yaml", cardText: "qa-project",
        boundary: { entries: [{ root: "project", path: "test/qa", kind: "directory", purpose: "qa" }], boundarySource: "角色卡/qa-project/boundary.yaml", acceptance: { accepted: false, source: "" } } },
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
  completeTeamPlan?: (input: { operationId: string; flowId: string; plan: { path: string; version: number; sha256?: string } }, signal?: AbortSignal) => Promise<unknown>;
  closeCreatedTaskFixed?: (input: { operationId: string; taskId: string; outcome: "accepted" | "rework" | "rejected"; note?: string }, signal?: AbortSignal) => Promise<unknown>;
  [key: string]: unknown;
}

interface H {
  mgr: SessionManager;
  inputs: CapturedInput[];
  requests: CustomerInputRequest[];
  script: (request: CustomerInputRequest) => CustomerInputOutcome;
}

function harness(root: string, script: (request: CustomerInputRequest) => CustomerInputOutcome = () => ({ outcome: "declined", reason: "test" })): H {
  const inputs: CapturedInput[] = [];
  const requests: CustomerInputRequest[] = [];
  const state = { inputs, requests, script } as H;
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
    customerInput: async (request) => {
      requests.push(request as unknown as CustomerInputRequest);
      return state.script(request as unknown as CustomerInputRequest);
    },
    emitEvent: () => {},
  });
  state.mgr = mgr;
  return state;
}

async function tempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function initRepo(root: string): void {
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "B3 Test");
  git(root, "config", "user.email", "b3@test.local");
  git(root, "config", "core.autocrlf", "false");
}
function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

interface LiveSource {
  entry: unknown;
  origin: { settled: boolean; turnId?: string; taskId?: string; assignment?: { taskId: string; flowId: string; runId?: string } };
}
function liveSource(mgr: SessionManager, root: string, roleId: string, overrides: Partial<LiveSource["origin"]> = {}): LiveSource {
  const manager = mgr as unknown as {
    sessionKey(projectRoot: string, roleId: string, runtime: string): string;
    sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
  };
  const entry = manager.sessions.get(manager.sessionKey(root, roleId, "demo"));
  assert.ok(entry, `会话条目应存在：${roleId}`);
  const origin = { settled: false, ...overrides };
  (entry! as { busy: boolean }).busy = true;
  entry!.origins.running = origin;
  return { entry, origin };
}
function releaseSource(mgr: SessionManager, source: LiveSource): void {
  const entry = source.entry as { busy: boolean; origins: { running?: unknown } };
  entry.busy = false;
  if (entry.origins.running === source.origin) delete entry.origins.running;
}

const BASE_A = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
const BASE_B = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "B" as const };
async function appendEvents(root: string, events: readonly WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}
function requested(base: typeof BASE_A | typeof BASE_B, workflowId: string, stage: WorkflowStage, attempt = 1): WorkflowEvent {
  return {
    ...base, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: "a".repeat(64), attempt,
  };
}
function completed(base: typeof BASE_A | typeof BASE_B, workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...base, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}
async function started(root: string, base: typeof BASE_A | typeof BASE_B): Promise<void> {
  await appendEvents(root, [{
    ...base, kind: "workflow.started", workflowId: WF, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:${base.path}:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }]);
}

/**
 * T3 B2.1（AC-19/T-08）：A12a/A12b accepted 收口前 basis 复核（`verifyBasisForStage`）已在桌面接线，
 * 既有 A12 夹具预置一份不漂移的 basis（空文档集/无团队计划；本文件不验证漂移，见 b21 专测）。
 */
async function seedBasis(root: string, workflowId: string): Promise<void> {
  const appended = await appendBasisEvent(root, {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${workflowId}:seed`, basisId: `bas-${workflowId}`, workflowId, flowId: FLOW,
    documents: [], teamPlan: null,
    reviewRoleId: "verifier", operationId: "op-basis-seed", reason: "baseline", recordedBy: "application",
  });
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

const MODULES_DOC = [
  "---",
  "schema: project-modules/v2",
  "flowId: snake",
  "version: 1",
  "modules:",
  "  - id: core",
  "    name: Core",
  "    purpose: Core module",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "---",
  "# Modules",
  "",
].join("\n");

function rosterDoc(): string {
  return [
    "---",
    "schema: project-roster/v4",
    "flowId: snake",
    "version: 1",
    "intent: docs/product/snake-intent-v1.md",
    "proposal: docs/proposals/snake-proposal-v1.md",
    "architecture: docs/contracts/snake-architecture-v1.md",
    "envBootstrap:",
    "  omitted: true",
    "  omissionReason: pure local text task",
    "roles:",
    "  - id: qa-project",
    "    displayName: Project QA",
    "    purpose: Independent review",
    "    capability: Review",
    "    modules: [core]",
    "    review: true",
    "modules:",
    "  - id: core",
    "    name: Core",
    "    purpose: Core module",
    "    path: src/core/",
    "    category: core",
    "    publicContract: src/core/index.ts",
    "    architectureSource: docs/contracts/snake-architecture-v1.md",
    "---",
    "# Roster",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "management: [convener, qa-project]",
    "modules:",
    "  - id: core",
    "    path: src/core/",
    "    roleId: qa-project",
    "roles:",
    "  - id: qa-project",
    "    modules: [core]",
    "```",
    "",
  ].join("\n");
}

async function seedA9Docs(root: string): Promise<string> {
  await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\n---\n# Intent\n");
  await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\n---\n# Proposal\nintent: docs/product/snake-intent-v1.md\n");
  await writeFile(root, "docs/proposals/snake-modules-v1.md", MODULES_DOC);
  const roster = rosterDoc();
  await writeFile(root, "docs/proposals/snake-roster-v1.md", roster);
  await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
  const plan = [
    "---",
    "schema: teamPlanSchema:3",
    "flowId: snake",
    "version: 1",
    "modules:",
    "  path: docs/proposals/snake-modules-v1.md",
    `  sha256: ${sha(MODULES_DOC)}`,
    "roster:",
    "  path: docs/proposals/snake-roster-v1.md",
    `  sha256: ${sha(roster)}`,
    "roleRows:",
    "  - roleId: qa-project",
    "    modules: [core]",
    "    writesets: [src/core/]",
    "    dependsOn: []",
    "---",
    "# Team plan",
    "",
  ].join("\n");
  await writeFile(root, "docs/scheduling/snake-team-v1.md", plan);
  return plan;
}

async function seedWorkflowToA9(root: string): Promise<void> {
  await started(root, BASE_A);
  const events: WorkflowEvent[] = [];
  for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"] as WorkflowStage[]) {
    events.push(requested(BASE_A, WF, stage), completed(BASE_A, WF, stage));
  }
  events.push(requested(BASE_A, WF, "A9"));
  await appendEvents(root, events);
}

async function seedTask(root: string, input: { taskId: string; from: "chief" | "convener"; to: string; stage: WorkflowStage; workflowId?: string; flowId?: string; taskKind?: "stage-request"; sideEffect: TaskSideEffect; text?: string }): Promise<void> {
  const event = taskEvent("task.created", {
    taskId: input.taskId,
    from: input.from,
    to: input.to,
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
    ...(input.workflowId !== undefined ? { stage: input.stage } : {}),
    ...(input.taskKind !== undefined ? { taskKind: input.taskKind } : {}),
    text: input.text ?? `任务 ${input.taskId}`,
    sideEffect: input.sideEffect,
    idempotencyKey: `seed-task:${input.taskId}`,
  }, () => new Date(AT));
  const appended = await appendTaskEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

test("A9：fixed complete_team_plan → 真实 BaselineGitPort（init/gitignore/branch/basis）+ stage.completed A9；不弹客户卡", async () => {
  const root = await tempRoot("ans-b3a9-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedWorkflowToA9(root);
    const plan = await seedA9Docs(root);
    await seedTask(root, { taskId: "t-a9", from: "chief", to: "convener", flowId: FLOW, workflowId: WF, stage: "A9", taskKind: "stage-request", sideEffect: "read-only" });
    const opened = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: "t-a9" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "") : "");
    const convener = h.inputs.find((input) => input.roleId === "convener");
    assert.equal(typeof convener?.completeTeamPlan, "function", "fixed 会话应注入 complete_team_plan（v4 应用实现）");
    const live = liveSource(h.mgr, root, "convener", { taskId: "t-a9" });
    const receipt = await convener!.completeTeamPlan!({
      operationId: "op-a9-fixed-1", flowId: FLOW,
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    }) as Record<string, unknown>;
    // B29（2026-11-11，RR22/RR25/RR26）：注入实现直接返回 **fixed 服务成功形状**，不再包装 legacy
    // `DirectActionReceipt`（旧包装把 `bas-…` 塞进 targetDigest，B25 工具校验永远拒绝）。
    assert.equal(receipt["ok"], true, JSON.stringify(receipt));
    assert.match(String(receipt["basisId"]), /^bas-[a-f0-9]{24}$/, "basisId 形如 bas-…");
    assert.equal(receipt["operationId"], "op-a9-fixed-1");
    assert.equal(receipt["flowId"], FLOW);
    assert.equal(receipt["workflowId"], WF, "workflowId 为宿主绑定的真实受派任务值");
    assert.deepEqual(receipt["plan"], { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) });
    assert.ok(Array.isArray(receipt["documents"]), "documents 为数组（basis 文档快照）");
    assert.equal(receipt["replay"], false);
    assert.equal(receipt["stageCompleted"], true);
    assert.equal("status" in receipt, false, "fixed 成功回执不再带 legacy status");
    assert.equal("targetDigest" in receipt, false, "fixed 成功回执不再把 bas-… 塞进 targetDigest");
    assert.equal("applicationId" in receipt, false, "fixed 成功回执不再带 legacy applicationId");
    // B29 工具层闭环：真实注入实现产出的回执必须被 B25 fixed 校验接受（消除 RR 的「结果未知」）。
    const fixedArgs = {
      operationId: "op-a9-fixed-1", flowId: FLOW, workflowId: WF,
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    };
    const tools = new Map(buildGovernedTools(allowGate, {
      roleId: "convener", completeTeamPlan: convener!.completeTeamPlan as unknown as CompleteTeamPlanFn,
    }).map((tool) => [tool.name, tool]));
    const toolResult = await tools.get("complete_team_plan")!.handler({ name: "complete_team_plan", args: structuredClone(fixedArgs) });
    assert.equal(toolResult.ok, true, toolResult.message);
    const toolReceipt = JSON.parse(toolResult.message.slice("complete_team_plan: ".length)) as Record<string, unknown>;
    assert.equal(toolReceipt["basisId"], receipt["basisId"], "工具层如实透出同一 basis 回执");
    assert.equal(toolResult.message.includes("结果未知或回执不完整"), false, "B25 不再降级为 unknown");
    // B29 fixed 桌面级 blocked：flow 与实际受派任务不符 ⇒ fixed 失败形状 `{ok:false,code,message}`。
    const wrongFlow = await convener!.completeTeamPlan!({
      operationId: "op-a9-fixed-wrong-flow", flowId: "other-flow",
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    }) as Record<string, unknown>;
    assert.equal(wrongFlow["ok"], false);
    assert.equal(wrongFlow["code"], "plan-flow-conflict");
    assert.equal(typeof wrongFlow["message"], "string");
    assert.equal("status" in wrongFlow, false, "fixed 失败不套 legacy status");
    assert.equal("errorCode" in wrongFlow, false, "fixed 失败不套 legacy errorCode");
    // B29 fixed 桌面级 blocked：无当前真实受派回合 ⇒ plan-task-unavailable（同一 fixed 失败形状）。
    releaseSource(h.mgr, live);
    const noTurn = await convener!.completeTeamPlan!({
      operationId: "op-a9-fixed-no-turn", flowId: FLOW,
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    }) as Record<string, unknown>;
    assert.equal(noTurn["ok"], false);
    assert.equal(noTurn["code"], "plan-task-unavailable");
    assert.equal("status" in noTurn, false);
    assert.equal("errorCode" in noTurn, false);
    // 真实 Git：仓库已初始化，任务分支为 ans/task/<wf>，baseline commit 存在。
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), taskBranchName(WF));
    assert.match(git(root, "log", "--oneline", "-1"), /ANS baseline/);
    // basis.recorded：repo 快照 + 团队计划 + reviewRoleId（roster review 角色）。
    const basis = (await readBasisLedger(root)).events.filter((event) =>
      (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === WF);
    assert.equal(basis.length, 1);
    const record = basis[0]!;
    assert.equal(record.kind, "basis.recorded");
    if (record.kind === "basis.recorded") {
      assert.equal(record.teamPlan?.path, "docs/scheduling/snake-team-v1.md");
      assert.equal(record.repo?.branch, taskBranchName(WF));
      assert.match(record.repo?.gitignoreSha256 ?? "", /^[a-f0-9]{64}$/);
      assert.equal(record.reviewRoleId, "qa-project", "roster roles[].review ⇒ reviewRoleId");
    }
    // stage.completed A9。
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      (await readTaskState(root)).events,
    );
    assert.equal(view.stages.A9.status, "completed");
    // 不弹客户卡（A9 失败/成功都只回报运营/幕僚）；不写 legacy run 账本。
    assert.equal(h.requests.length, 0, "A9 不产生客户卡");
    await assert.rejects(fs.stat(path.join(root, ".ans", "runs")));
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("A9 失败面（AC-16）：dirty 工作区 ⇒ fixed 失败 code=baseline-repository-dirty（stage.blocked A9、不弹卡、不写 basis）", async () => {
  const root = await tempRoot("ans-b3a9-dirty-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedWorkflowToA9(root);
    const plan = await seedA9Docs(root);
    // 非忽略 untracked 文件 ⇒ baseline-repository-dirty（不 stash/reset/clean）。
    await writeFile(root, "src/scratch.ts", "export const scratch = 1;\n");
    await seedTask(root, { taskId: "t-a9", from: "chief", to: "convener", flowId: FLOW, workflowId: WF, stage: "A9", taskKind: "stage-request", sideEffect: "read-only" });
    const opened = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: "t-a9" });
    assert.equal(opened.ok, true);
    const convener = h.inputs.find((input) => input.roleId === "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: "t-a9" });
    const receipt = await convener!.completeTeamPlan!({
      operationId: "op-a9-dirty", flowId: FLOW,
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    }) as Record<string, unknown>;
    // B29：fixed 服务失败原样透出 `{ok:false,code,message}`（真实 code），不套 legacy status/errorCode。
    assert.equal(receipt["ok"], false);
    assert.equal(receipt["code"], "baseline-repository-dirty");
    assert.equal(typeof receipt["message"], "string");
    assert.equal("status" in receipt, false, "fixed 失败不套 legacy status");
    assert.equal("errorCode" in receipt, false, "fixed 失败不套 legacy errorCode");
    // B29 工具层闭环：fixed 失败经 B25 `fixedFailureResult` 透出真实 code/message（不降级 unknown）。
    const tools = new Map(buildGovernedTools(allowGate, {
      roleId: "convener", completeTeamPlan: convener!.completeTeamPlan as unknown as CompleteTeamPlanFn,
    }).map((tool) => [tool.name, tool]));
    const toolResult = await tools.get("complete_team_plan")!.handler({ name: "complete_team_plan", args: {
      operationId: "op-a9-dirty", flowId: FLOW, workflowId: WF,
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(plan) },
    } });
    assert.equal(toolResult.ok, false);
    assert.match(toolResult.message, /baseline-repository-dirty/, "真实失败码透出");
    assert.equal(toolResult.message.includes("结果未知或回执不完整"), false, "真实失败不降级为 unknown");
    releaseSource(h.mgr, live);
    assert.equal((await readBasisLedger(root)).events.filter((event) =>
      (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === WF).length, 0, "失败不写 basis");
    const blocked = (await readWorkflowLedger(root)).events.find((event) =>
      event.kind === "stage.blocked" && event.workflowId === WF && event.stage === "A9");
    assert.ok(blocked !== undefined && blocked.kind === "stage.blocked" && blocked.code === "baseline-repository-dirty");
    assert.equal(h.requests.length, 0, "A9 失败不产生客户卡");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("A12：fixed close_created_task v2 accepted ⇒ 应用归档 docs/acceptance + stage.completed A12b/A12；幂等 replay", async () => {
  const root = await tempRoot("ans-b3a12-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await started(root, BASE_A);
    await seedBasis(root, WF);
    const events: WorkflowEvent[] = [];
    // A1..A10 完成后先派 A12a（criteria 先于实现；G-1），A12a 收口后再推进 A11 → A12b。
    for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as WorkflowStage[]) {
      events.push(requested(BASE_A, WF, stage), completed(BASE_A, WF, stage));
    }
    events.push(requested(BASE_A, WF, "A12a"));
    await appendEvents(root, events);
    // 真实仓库 + 报告证据文件（`.gitignore` 忽略 docs/quality ⇒ 工作区 clean）。
    initRepo(root);
    await writeFile(root, "src/core/index.ts", "export const core = 1;\n");
    const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    commitAll(root, "baseline");
    git(root, "switch", "-c", taskBranchName(WF));
    await writeFile(root, "src/core/index.ts", "export const core = 2;\n");
    commitAll(root, "A11 implementation");
    const criteriaPath = "docs/quality/snake-criteria-v1.md";
    const reportPath = "docs/quality/snake-report-v1.md";
    await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
    await writeFile(root, reportPath, "# Report\n\n结论：通过（13/13）。\n");
    // A12a task：报告 done + criteria 证据。
    await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", flowId: FLOW, workflowId: WF, stage: "A12a", sideEffect: "read-only" });
    await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12a", from: "verifier", status: "done", summary: "criteria 完成", evidence: [criteriaPath],
    }, () => new Date(AT)));
    // A12b task：报告 done + report 证据。
    await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", flowId: FLOW, workflowId: WF, stage: "A12b", sideEffect: "read-only" });
    await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12b", from: "verifier", status: "done", summary: "独立验收通过", evidence: [reportPath],
    }, () => new Date(AT)));
    const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "") : "");
    const chief = h.inputs.find((input) => input.roleId === "chief");
    assert.equal(typeof chief?.closeCreatedTaskFixed, "function", "fixed 会话应注入 close_created_task v2 应用实现");
    const live = liveSource(h.mgr, root, "chief");
    // A12a criteria 收口（同一应用实现；artifacts=criteria）→ stage.completed A12a。
    const criteriaClosed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12a-1", taskId: "t-a12a", outcome: "accepted" });
    assert.equal((criteriaClosed as { ok: boolean }).ok, true, JSON.stringify(criteriaClosed));
    // A12a 完成后推进 A11（实现已在任务分支提交）→ A12b。
    await appendEvents(root, [
      requested(BASE_A, WF, "A11"), completed(BASE_A, WF, "A11"),
      requested(BASE_A, WF, "A12b"),
    ]);
    const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-1", taskId: "t-a12b", outcome: "accepted", note: "幕僚决定：通过" });
    releaseSource(h.mgr, live);
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    assert.equal((closed as { stageCompleted?: boolean }).stageCompleted, true);
    // 应用归档：docs/acceptance/<flowId>-acceptance-v1.md（含 workflowId/report sha/idempotencyKey）。
    const archivePath = path.join(root, "docs", "acceptance", "snake-acceptance-v1.md");
    const archiveText = await fs.readFile(archivePath, "utf8");
    assert.match(archiveText, new RegExp(`workflowId: ${WF}`));
    assert.match(archiveText, new RegExp(`reportSha256: ${sha(await fs.readFile(path.join(root, ...reportPath.split("/"))))}`));
    assert.match(archiveText, /idempotencyKey: acceptance:/);
    assert.match(archiveText, /幕僚决定|staffDecision/);
    // 阶段：A12b completed + A12 聚合 completed。
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      (await readTaskState(root)).events,
    );
    assert.equal(view.stages.A12b.status, "completed");
    assert.equal(view.stages.A12.status, "completed");
    // 幂等 replay：同 operationId 再次收口 ⇒ replay（不重复 task.closed/不覆盖归档）。
    const replay = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-1", taskId: "t-a12b", outcome: "accepted", note: "幕僚决定：通过" });
    assert.equal((replay as { ok: boolean }).ok, true);
    assert.equal((replay as { replay?: boolean }).replay, true);
    const closedEvents = (await readTaskState(root)).events.filter((event) => event.kind === "task.closed" && event.taskId === "t-a12b");
    assert.equal(closedEvents.length, 1);
    // 不弹客户卡（fixed 不发 acceptance 卡）。
    assert.equal(h.requests.length, 0);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("A12 归档失败：criteria 缺证 ⇒ acceptance-record-invalid 阻塞（不写 task.closed、无归档）", async () => {
  const root = await tempRoot("ans-b3a12-fail-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await started(root, BASE_A);
    await seedBasis(root, WF);
    const events: WorkflowEvent[] = [];
    for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as WorkflowStage[]) {
      events.push(requested(BASE_A, WF, stage), completed(BASE_A, WF, stage));
    }
    events.push(requested(BASE_A, WF, "A12b"));
    await appendEvents(root, events);
    await writeFile(root, "docs/quality/snake-report-v1.md", "# Report\n\n结论：通过。\n");
    await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", flowId: FLOW, workflowId: WF, stage: "A12b", sideEffect: "read-only" });
    await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-a12b", from: "verifier", status: "done", summary: "通过", evidence: ["docs/quality/snake-report-v1.md"],
    }, () => new Date(AT)));
    const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
    assert.equal(opened.ok, true);
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const live = liveSource(h.mgr, root, "chief");
    const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-fail", taskId: "t-a12b", outcome: "accepted" });
    releaseSource(h.mgr, live);
    assert.equal((closed as { ok: boolean }).ok, false);
    assert.equal((closed as { code?: string }).code, "acceptance-record-invalid");
    const state = await readTaskState(root);
    assert.equal(state.events.some((event) => event.kind === "task.closed" && event.taskId === "t-a12b"), false, "归档失败不得写 task.closed");
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      state.events,
    );
    assert.equal(view.stages.A12b.status, "requested", "A12b 保持阻塞（未完成）");
    await assert.rejects(fs.stat(path.join(root, "docs", "acceptance", "snake-acceptance-v1.md")));
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("路径 B：B1 派发前应用最小准备（既有仓库/任务分支/basis reason=path-b）；无仓库 b-repository-required 不 init", async () => {
  // 有仓库
  {
    const root = await tempRoot("ans-b3pathb-ok-");
    const h = harness(root);
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      initRepo(root);
      await writeFile(root, "src/core/index.ts", "export const core = 1;\n");
      const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
      assert.equal(ensured.ok, true);
      commitAll(root, "baseline");
      await started(root, BASE_B);
      await appendEvents(root, [requested(BASE_B, WF, "B1")]);
      await seedTask(root, { taskId: "t-b1", from: "chief", to: "convener", flowId: FLOW, workflowId: WF, stage: "B1", taskKind: "stage-request", sideEffect: "read-only" });
      const opened = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      assert.equal(opened.ok, true);
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b1" });
      const manager = h.mgr as unknown as { routeDispatch(root: string, runtime: "demo", from: string, d: unknown, source?: LiveSource): Promise<{ ok: boolean; message?: string }> };
      const receipt = await manager.routeDispatch(root, "demo", "convener", {
        roleId: "worker", task: "修改核心模块", flowId: FLOW, workflowId: WF, stage: "B1", sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, true, receipt.message ?? "");
      // T3 B2.1（AC-19/T-08）：B1 派发前复核补 `stage` ⇒ 关键门一致时节流入账 `basis.verified`。
      const verified = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified");
      assert.equal(verified.length, 1, "B1 关键门一致 ⇒ basis.verified 入账一次");
      // basis.recorded(reason:"path-b")：只读快照；repo.branch=任务分支；不写团队计划。
      const basis = (await readBasisLedger(root)).events.filter((event) =>
      (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === WF);
      assert.equal(basis.length, 1);
      const record = basis[0]!;
      assert.equal(record.kind, "basis.recorded");
      if (record.kind === "basis.recorded") {
        assert.equal(record.reason, "path-b");
        assert.equal(record.teamPlan, null);
        assert.equal(record.repo?.state, "existing");
        assert.equal(record.repo?.branch, taskBranchName(WF));
      }
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), taskBranchName(WF), "从当前 HEAD 建/切任务分支");
      const production = [...(await readTaskState(root)).records.values()].find((item) => item.created?.to === "worker");
      assert.ok(production?.created);
      assert.equal(production!.created!.workflowId, WF);
      assert.equal(production!.created!.runId, undefined);
      assert.equal(h.requests.length, 0, "路径 B 不弹卡");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 无仓库：b-repository-required（不自动 init、零任务行、无 basis）
  {
    const root = await tempRoot("ans-b3pathb-norepo-");
    const h = harness(root);
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await started(root, BASE_B);
      await appendEvents(root, [requested(BASE_B, WF, "B1")]);
      await seedTask(root, { taskId: "t-b1", from: "chief", to: "convener", flowId: FLOW, workflowId: WF, stage: "B1", taskKind: "stage-request", sideEffect: "read-only" });
      const opened = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
      assert.equal(opened.ok, true);
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b1" });
      const manager = h.mgr as unknown as { routeDispatch(root: string, runtime: "demo", from: string, d: unknown, source?: LiveSource): Promise<{ ok: boolean; message?: string }> };
      const receipt = await manager.routeDispatch(root, "demo", "convener", {
        roleId: "worker", task: "修改核心模块", flowId: FLOW, workflowId: WF, stage: "B1", sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /b-repository-required/);
      assert.equal([...(await readTaskState(root)).records.values()].some((item) => item.created?.to === "worker"), false, "拒绝不产生任务");
      await assert.rejects(fs.stat(path.join(root, ".git")), "路径 B 不自动 git init");
      assert.equal((await readBasisLedger(root)).events.filter((event) =>
        (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === WF).length, 0, "失败不写 basis");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("B29：legacy 会话的 complete_team_plan 注入仍是 legacy DirectActionReceipt（status/errorCode 逐字保留）", async () => {
  const root = await tempRoot("ans-b29-legacy-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
    const opened = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "") : "");
    const convener = h.inputs.find((input) => input.roleId === "convener");
    assert.equal(typeof convener?.completeTeamPlan, "function", "legacy 会话仍注入 complete_team_plan");
    // 无当前真实回合 ⇒ host-local plan-task-unavailable；形状 = legacy `{ok:false,status:"blocked",errorCode,...}`。
    const receipt = await convener!.completeTeamPlan!({
      operationId: "op-legacy-plan-1", flowId: FLOW,
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1 },
    }) as Record<string, unknown>;
    assert.equal(receipt["ok"], false);
    assert.equal(receipt["status"], "blocked", "legacy 回执 status 逐字保留");
    assert.equal(receipt["errorCode"], "plan-task-unavailable", "legacy 回执 errorCode 逐字保留");
    assert.equal(receipt["operationId"], "op-legacy-plan-1");
    assert.equal(receipt["baseDigest"], null);
    assert.equal(receipt["targetDigest"], null);
    assert.equal("code" in receipt, false, "legacy 注入不被改成 fixed `{code,message}` 形状");
    assert.equal(isDirectActionReceipt(receipt), true, "legacy 回执仍被 legacy 校验接受（未受 B29 影响）");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("路径 B B3 写集门：modulePaths ⊆ change.scope-decided.effectiveWritesets；越界/无写集 b-change-scope-invalid", async () => {
  const root = await tempRoot("ans-b3pathb-scope-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    initRepo(root);
    await writeFile(root, "src/core/index.ts", "export const core = 1;\n");
    const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    commitAll(root, "baseline");
    await started(root, BASE_B);
    await appendEvents(root, [
      requested(BASE_B, WF, "B1"), completed(BASE_B, WF, "B1"),
      requested(BASE_B, WF, "B2"),
      {
        ...BASE_B, kind: "change.scope-decided", workflowId: WF, flowId: FLOW,
        idempotencyKey: `scope:${WF}:seed:seed`, impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: "b".repeat(64) },
        scope: { summary: "只改核心模块", files: ["src/core/index.ts"] },
        effectiveWritesets: [{ roleId: "worker", paths: ["src/core/index.ts"] }],
        decidedBy: "chief", requestTaskId: "t-b2",
      },
      requested(BASE_B, WF, "B3"),
    ]);
    // 已有 path-b basis（B1 阶段已记录）⇒ B3 前置不再重复准备。
    const basis: BasisEvent = {
      v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
      idempotencyKey: `path-b:${WF}:seed`, basisId: `bas-${WF}`, workflowId: WF, flowId: FLOW,
      documents: [], teamPlan: null,
      repo: { state: "existing", branch: taskBranchName(WF), baseOid: null, ignorePolicy: "ans-v1", gitignoreSha256: ensured.sha256 },
      reviewRoleId: "verifier", operationId: `path-b:${WF}`, reason: "path-b", recordedBy: "application",
    };
    const basisAppended = await appendBasisEvent(root, basis);
    assert.equal(basisAppended.ok, true, basisAppended.ok === false ? basisAppended.message : "");
    await seedTask(root, { taskId: "t-b3", from: "chief", to: "convener", flowId: FLOW, workflowId: WF, stage: "B3", taskKind: "stage-request", sideEffect: "read-only" });
    const opened = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    assert.equal(opened.ok, true);
    const manager = h.mgr as unknown as { routeDispatch(root: string, runtime: "demo", from: string, d: unknown, source?: LiveSource): Promise<{ ok: boolean; message?: string }> };
    // 合法：modulePaths 覆盖 scope 写集。
    {
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b3" });
      const receipt = await manager.routeDispatch(root, "demo", "convener", {
        roleId: "worker", task: "实现核心修改", flowId: FLOW, workflowId: WF, stage: "B3", sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, true, receipt.message ?? "");
    }
    // 越界：modulePaths 与写集不一致 ⇒ b-change-scope-invalid（无任务行）。
    {
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b3" });
      const receipt = await manager.routeDispatch(root, "demo", "convener", {
        roleId: "worker", task: "改到别处", flowId: FLOW, workflowId: WF, stage: "B3", sideEffect: "code", moduleId: "core", modulePaths: ["src/other/"],
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /b-change-scope-invalid/);
    }
    // 缺 modulePaths ⇒ dispatch-evidence-missing（B3 写集核对需要模块路径）。
    {
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b3" });
      const receipt = await manager.routeDispatch(root, "demo", "convener", {
        roleId: "worker", task: "无模块证据", flowId: FLOW, workflowId: WF, stage: "B3", sideEffect: "code", moduleId: "core",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /dispatch-evidence-missing/);
    }
    // 写集缺失（scope 未给该角色）⇒ b-change-scope-invalid（不派发到 scope 外角色）。
    {
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-b3" });
      const receipt = await manager.routeDispatch(root, "demo", "convener", {
        roleId: "qa-project", task: "越权实现", flowId: FLOW, workflowId: WF, stage: "B3", sideEffect: "code", moduleId: "core", modulePaths: ["test/qa/"],
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /b-change-scope-invalid/);
    }
    const workerTasks = [...(await readTaskState(root)).records.values()].filter((item) => item.created?.to === "worker");
    assert.equal(workerTasks.length, 1, "只有一次合法 B3 派发产生任务行");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

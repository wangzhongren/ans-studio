// test/测试/fixed-path-full-chain.test.ts
// T3「两条固定工作流路径」B5（2026-11-10，测试）：**跨层假会话全链**（B1 T-16 / AC-28/AC-29）。
// **B6.2（2026-11-11）：真实聊天入口并入全链**——路径 A 从空项目、无 taskId 的**真实幕僚聊天入口**
// （真实 `SessionManager.open` 捕获 `openRoleSession` 入参；同一入参**镜像**交给真实编排
// `openRoleSession`（假适配器，不发回合、立即 dispose）实际注入 fixed context/`chief-workflow-v2.md`）
// 开始，再由该聊天会话经真实派发发出首个 stage-request（`ensureFixedPathStarted` 写 `workflowSchema`
// 并启动 fixed workflow），随后既有 A1–A13 链照旧。路径 B/无仓库用例保留既有 open + routeDispatch
// 入口并**披露**（只做应用层 fixed 断言；run-role 实际注入由路径 A 镜像打开与 B6.1/run-role 测试覆盖）。
// 不直接 `routeDispatch` 绕过聊天入口作为唯一入口。聊天入口打开阶段零 legacy trunk/run 写入、不提前写
// `workflowSchema`。
//
// 覆盖：
//   1. 路径 A（空项目 → 幕僚 → 意图 → 方案 → 激活 → 团队计划+基线 → 任命 → A11 实现（真实 Git
//      add/commit + taskGitScope）→ A12a/A12b → 应用 docs/acceptance 归档 → 运营汇总 → merge-main
//      客户本人确认 → 应用本地合并 main（不 push/tag）→ workflow.closed delivered）：
//      · 3 张客户确认卡（intent-confirm/proposal/appointment）各一次 + merge-main 高风险卡一次；
//        无 acceptance 卡、无额外客户门；
//      · `.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl` 事件/幂等；`.ans/trunk`/`.ans/runs`
//        未被新路径写入；`.gitignore` ans 托管块生效、治理文档不入 Git；A12 归档内容/hash；
//      · 首次 fixed 启动写 `.ans/project.json workflowSchema`（保留既有键）；
//      · merge-main 非判断卡（governanceCardGroup===undefined）、preview 字段齐全、`release.confirmed.by`
//        只能是 customer；重复发布 ⇒ release-already-merged（不重复卡）。
//   2. 路径 B（既有 Git 项目 → B1 影响面 → B2 scope → B3 写集/真实提交 → B4 发布（不要求 A12b）→
//      merge-main 客户确认）：basis.recorded(reason:"path-b") 只读快照、不写团队计划/不重建角色；
//      B3 写集 = scope ∩ roster 属主；无仓库 ⇒ b-repository-required（不自动 init）。
//
// **B5.2 去宿主 glue（2026-11-10）**：B5 发现的 G-B5-1/G-B5-2/G-B5-3 已由 B5.1 桌面生产接线修复
// （`recordFixedStageDispatchForTask` / `markFixedProposalCardRequested` /
// `recordFixedPathBScopeDecisionForDispatch`；见 `角色卡/桌面窗口/docs/change/
// 2026-11-10_B5.1_two-fixed-workflow-paths-desktop.md`）。本测试不再直接调用 `recordStageDispatch` /
// `recordChangeScopeDecision`、也不再手写 A6 在办标记：A1/A4/A7/A8/A12a/A12b `stage.dispatched` 由
// 真实桌面派发路由按 task.created 落账；A6 `stage.requested/completed` 由方案卡生命周期产生；B2
// `change.scope-decided` 由 B3 advance stage-request 受理生产接线写入（fixture 提供文件级候选路径）。
// 测试只断言账本/状态（生产接线证据见 B5.2 记录与 `_evidence/`）。
//
// **B10.2 断言同步（2026-11-11）**：B10.1 起 fixed 派发的**自动打开目标会话携带本次真实任务 taskId**
// （`input.taskId === srA1.taskId`，即 run-role `submit_report` 的任务关联来源）；B6.2 旧断言「自动打开 =
// 无 taskId 聊天会话」按 B10.1 规格同步。固定 chat（chief 无 taskId）仍无任务绑定；legacy 自动打开不带
// taskId（旧路径，桌面 b101/b81 覆盖，本域未改）。
//
// 夹具：真实临时 Git 仓库 + 真实应用服务/账本 + 假 openRoleSession/模型回执/客户作答；
// 不启动 Electron/真实模型/网络；确定性（无 setTimeout 竞争断言；事件迭代器仅维持会话存活）。
// 无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { MERGE_MAIN_CARD_KIND, MERGE_MAIN_OPTION_IDS } from "../../app/desktop/customer-input.ts";
import {
  createDesktopBaselineGitPort,
  createDesktopReleaseGitPort,
  createDesktopTaskGitPort,
} from "../../app/desktop/workflow-git.ts";
import {
  activateRoleDocumentsFixed,
  archiveAcceptance,
  closeTask,
  executeReleaseMerge,
  findAcceptanceArchive,
  prepareReleaseMerge,
  readBasisLedger,
  readReleaseLedger,
  readWorkflowLedger,
  taskBranchName,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendTaskEvent, readTaskState, taskEvent, type TaskRecord } from "../../src/common/编排/task-state.ts";
import { resolveTaskGitScope } from "../../src/pipeline/orchestration/run-role.ts";
import { classifyShellDetailed, defaultShellRules, TASK_GIT_CODES, TASK_GIT_GATE_CODES } from "../../src/service/gate/shell-rules.ts";
import { runTaskGitCommit } from "../../src/common/门禁引擎/task-git-gate.ts";
import { governanceCardGroup, type CustomerInputOutcome, type CustomerInputRequest } from "../../src/model/runtime.ts";
import type { BasisEvent, RoleSession, RuntimeAdapter, SessionEvent, WorkflowEvent, WorkflowStage, WriteGate } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { openRoleSession as orchestrationOpenRoleSession, type AdapterCapabilities, type RoleSessionHandle, type RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const AT = "2026-11-10T10:00:00.000Z";
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

// —————————————— 夹具（假会话 + 客户作答；真实服务/账本/Git） ——————————————

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
      {
        roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker",
        boundary: {
          entries: [{ root: "project", path: "src/core", kind: "directory", purpose: "core" }],
          boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" },
        },
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
  customerInput?: (request: CustomerInputRequest, metadata?: unknown) => Promise<CustomerInputOutcome | null | undefined>;
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

/** 客户作答：三张确认卡 + merge-main（approve）；acceptance 卡 fixed 路径不应出现（若出现按拒绝处理）。 */
function cardAnswer(request: CustomerInputRequest): CustomerInputOutcome {
  if (request.cardKind === "intent-confirm") return { outcome: "answered", value: { selected: ["confirm"] } };
  if (request.cardKind === "proposal") return { outcome: "answered", value: { selected: ["accept"] } };
  if (request.cardKind === "appointment") return { outcome: "answered", value: { selected: ["worker"] } };
  if (request.cardKind === MERGE_MAIN_CARD_KIND) return { outcome: "answered", value: { selected: [MERGE_MAIN_OPTION_IDS[0]!] } };
  return { outcome: "declined", reason: `unexpected-card:${String(request.cardKind)}` };
}

function harness(root: string, script: (request: CustomerInputRequest) => CustomerInputOutcome = cardAnswer): H {
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

interface LiveSource {
  entry: unknown;
  origin: { settled: boolean; turnId?: string; taskId?: string; assignment?: { taskId: string; flowId: string; runId?: string } };
}

/** 伪造真实活条目 + 当前轮次（sourceIsCurrent 证据来源；测试不启动模型，故直接定格会话条目事实）。 */
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
  mgr: SessionManager,
  root: string,
  fromRoleId: string,
  payload: Record<string, unknown>,
  source?: LiveSource,
): Promise<{ ok: boolean; message?: string }> {
  const manager = mgr as unknown as {
    routeDispatch(projectRoot: string, runtime: "demo", fromRoleId: string, d: unknown, source?: unknown): Promise<{ ok: boolean; message?: string }>;
  };
  return manager.routeDispatch(root, "demo", fromRoleId, payload, source);
}

async function openRole(h: H, root: string, roleId: string, taskId?: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo", ...(taskId !== undefined ? { taskId } : {}) });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "会话打开失败") : "");
  const candidates = h.inputs.filter((input) => input.roleId === roleId
    && (taskId === undefined || input.taskId === taskId));
  const input = candidates[candidates.length - 1];
  assert.ok(input, `应捕获 ${roleId} 的 openRoleSession 入参`);
  return input!;
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
function initRepo(root: string): void {
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "B5 Test");
  git(root, "config", "user.email", "b5@test.local");
  git(root, "config", "core.autocrlf", "false");
}
function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

async function findTask(root: string, predicate: (record: TaskRecord) => boolean): Promise<TaskRecord> {
  const state = await readTaskState(root);
  const record = [...state.records.values()].find(predicate);
  assert.ok(record !== undefined, "应存在匹配的任务记录");
  return record!;
}
async function findOpenStageRequest(root: string, stage: WorkflowStage): Promise<TaskRecord> {
  return findTask(root, (record) => record.created?.taskKind === "stage-request"
    && record.created.stage === stage && record.created.to === "convener" && record.closed === undefined);
}
async function reportDone(root: string, taskId: string, from: string, summary: string, evidence?: string[]): Promise<void> {
  const appended = await appendTaskEvent(root, taskEvent("task.reported", {
    taskId, from, status: "done", summary,
    ...(evidence !== undefined && evidence.length > 0 ? { evidence } : {}),
  }, () => new Date(AT)));
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}
function closeFixedOf(input: CapturedInput) {
  const fn = input.closeCreatedTaskFixed;
  assert.equal(typeof fn, "function", "fixed 会话应注入 close_created_task v2 应用实现");
  return fn!;
}
async function closeTaskViaDesktop(input: CapturedInput, inputArgs: { operationId: string; taskId: string; outcome?: "accepted" | "rework" | "rejected"; note?: string }): Promise<{ ok: boolean; stageCompleted?: boolean; replay?: boolean; code?: string; message?: string }> {
  const fn = closeFixedOf(input);
  const result = await fn({ operationId: inputArgs.operationId, taskId: inputArgs.taskId, outcome: inputArgs.outcome ?? "accepted", ...(inputArgs.note !== undefined ? { note: inputArgs.note } : {}) });
  return result as { ok: boolean; stageCompleted?: boolean; replay?: boolean; code?: string; message?: string };
}
/** 收口 stage-request 任务（chief 创建者）：先补运营 done 报告（报告 ≠ 收口），再走 fixed closeTask 服务。
 *  stage-request 收口不是阶段完成条件（§4.5）；桌面证据适配器只服务完成型收口，故此处用同一服务直连。 */
async function closeStageRequest(h: H, root: string, chief: CapturedInput, stage: WorkflowStage, note: string): Promise<string> {
  const request = await findOpenStageRequest(root, stage);
  await reportDone(root, request.taskId, "convener", `${stage} 请求已受理`);
  const closed = await closeTask({
    projectRoot: root, operationId: `op-close-sr-${stage}`, taskId: request.taskId,
    outcome: "accepted", actorRoleId: "chief", note,
  });
  assert.equal(closed.ok, true, `${stage} stage-request 收口失败：${closed.ok === false ? `${closed.code ?? ""} ${closed.message ?? ""}` : ""}`);
  return request.taskId;
}
async function view(root: string, workflowId: string) {
  const ledger = await readWorkflowLedger(root);
  const tasks = await readTaskState(root);
  return deriveWorkflowView(ledger.events.filter((event) => event.workflowId === workflowId), tasks.events);
}
/** 生产接线断言（B5.1 G-B5-1）：`stage.dispatched` 须由桌面 fixed 路由按真实 taskId 落账且仅一次。 */
async function assertStageDispatched(root: string, workflowId: string, stage: WorkflowStage, taskId: string): Promise<void> {
  const ledger = await readWorkflowLedger(root);
  const dispatched = ledger.events.filter((event): event is Extract<WorkflowEvent, { kind: "stage.dispatched" }> =>
    event.workflowId === workflowId && event.kind === "stage.dispatched" && event.stage === stage && event.taskId === taskId);
  assert.equal(dispatched.length, 1, `${stage} stage.dispatched 应由生产路由按真实 taskId 落账（一次）`);
  assert.equal(dispatched[0]!.idempotencyKey, `stage-dispatch:${workflowId}:${stage}:${taskId}`);
}

const MODULES_TEXT = [
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

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v4",
  "flowId: snake",
  "version: 1",
  "intent: docs/product/snake-intent-v1.md",
  "proposal: docs/proposals/snake-proposal-v1.md",
  "architecture: docs/contracts/snake-architecture-v1.md",
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: pure local chain fixture",
  "roles:",
  "  - id: worker",
  "    displayName: Worker",
  "    purpose: Implementation",
  "    capability: TypeScript",
  "    modules: [core]",
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
  "management: [convener, worker]",
  "modules:",
  "  - id: core",
  "    path: src/core/",
  "    roleId: worker",
  "roles:",
  "  - id: worker",
  "    modules: [core]",
  "```",
  "",
].join("\n");

const TEAM_PLAN_TEXT = [
  "---",
  "schema: teamPlanSchema:3",
  "flowId: snake",
  "version: 1",
  "modules:",
  "  path: docs/proposals/snake-modules-v1.md",
  `  sha256: ${sha(MODULES_TEXT)}`,
  "roster:",
  "  path: docs/proposals/snake-roster-v1.md",
  `  sha256: ${sha(ROSTER_TEXT)}`,
  "roleRows:",
  "  - roleId: worker",
  "    modules: [core]",
  "    writesets: [src/core/]",
  "    dependsOn: []",
  "---",
  "# Team plan",
  "",
].join("\n");

async function writeChainDocs(root: string, opts: { intent: boolean; proposal: boolean; teamPlan: boolean }): Promise<void> {
  if (opts.intent) {
    await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇游戏\n---\n# 意图\n");
    await writeFile(root, "docs/intents/snake-intent.md", "---\nintentId: snake-intent\nflowId: snake\ngoal: 贪吃蛇游戏\n---\n# 意图入口\n");
  }
  if (opts.proposal) {
    await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\nintent: docs/product/snake-intent-v1.md\n---\n# 提案\n");
    await writeFile(root, "docs/proposals/snake-modules-v1.md", MODULES_TEXT);
    await writeFile(root, "docs/proposals/snake-roster-v1.md", ROSTER_TEXT);
    await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\nproposal: docs/proposals/snake-proposal-v1.md\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
  }
  if (opts.teamPlan) await writeFile(root, "docs/scheduling/snake-team-v1.md", TEAM_PLAN_TEXT);
}
async function writeRoleDocuments(root: string): Promise<{ card: string; boundaryMd: string; boundaryYaml: string }> {
  const card = "---\nroleId: worker\ndisplayName: Worker\n---\n# Worker 角色卡\n";
  const boundaryMd = "# 边界\n\n## Section 1: 可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |\n| 目录 | `src/core/` | core |\n";
  const boundaryYaml = "- root: project\n  path: src/core/\n  kind: directory\n  purpose: core\n";
  await writeFile(root, "角色卡/worker/role-card.md", card);
  await writeFile(root, "角色卡/worker/boundary.md", boundaryMd);
  await writeFile(root, "角色卡/worker/boundary.yaml", boundaryYaml);
  return { card, boundaryMd, boundaryYaml };
}

async function assertNoLegacyWrites(root: string): Promise<void> {
  await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")), "fixed 路径不得写 .ans/trunk");
  await assert.rejects(fs.stat(path.join(root, ".ans", "runs")), "fixed 路径不得写 .ans/runs");
}

// —————————————— B6.2：真实聊天入口（空项目、无 taskId）固定注入断言 ——————————————

const FIXED_CHIEF_WORKFLOW_V2_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "src", "common", "门禁引擎", "workflows", "chief", "chief-workflow-v2.md",
);

/**
 * B6.2 应用层断言：**真实聊天入口**（`SessionManager.open`，空项目/无 taskId）捕获的
 * `openRoleSession` 入参必须是 fixed——会话级常量 + fixed 工具注入位（legacy 治理型能力缺席）。
 * 与 B6.1 桌面测试同口径（真实 SessionManager；本测试额外把同一入参交给真实编排，见下）。
 */
function assertFixedChiefChatEntry(input: CapturedInput): void {
  assert.equal(input.taskId, undefined, "固定 chat 入口不携带 taskId（B10.1 保留旧语义：聊天无任务绑定）");
  assert.equal(input.workflowMode, "fixed", "空项目无 taskId 幕僚聊天必须向编排传 workflowMode:\"fixed\"（B6.1 聊天入口）");
  assert.equal(typeof input.workflowModeForFlow, "function", "per-flow 回调与常量并存（legacy/混合项目路径不变）");
  for (const legacyTool of ["gitQuery", "gitCandidate", "gitPublish", "requestVersionDecision"] as const) {
    assert.equal(input[legacyTool], undefined, `fixed 聊天不得注入 legacy 能力 ${legacyTool}（AC-23）`);
  }
  for (const retained of ["closeCreatedTask", "closeCreatedTaskFixed", "docFormat", "contractCheck", "evidenceCheck", "projectState", "projectNote"] as const) {
    assert.equal(input[retained] !== undefined, true, `fixed 聊天保留 ${retained}`);
  }
  assert.equal("requestReleaseMerge" in input, false, "G-IR：不新增 request_release_merge");
}

/**
 * B6.2 编排层断言：把聊天入口捕获的**同一入参**原样交给真实编排 `openRoleSession`（假适配器；
 * 不发送任何回合、立即 dispose）——断言 fixed context/`chief-workflow-v2.md` 确实由 run-role 消费注入
 * （而不仅是入参文本），且编排能力面同样无 legacy 工具。镜像打开不启动模型、不写账本。
 */
async function assertFixedChiefChatInjection(input: CapturedInput): Promise<void> {
  assertFixedChiefChatEntry(input);
  const captured: { caps?: AdapterCapabilities } = {};
  const handle = await orchestrationOpenRoleSession(
    input as unknown as Parameters<typeof orchestrationOpenRoleSession>[0],
    {
      createAdapter: (_gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
        captured.caps = caps;
        return {
          async composeContext() { return { systemPrompt: "" }; },
          async bindRole(): Promise<RoleSession> {
            return {
              async prompt() {},
              events(): AsyncIterable<SessionEvent> {
                return (async function* () { yield { kind: "settled" as const, summary: "B6.2 镜像打开（不发回合）" }; })();
              },
              async dispose() {},
            };
          },
        };
      },
    },
  );
  try {
    const caps = captured.caps;
    assert.ok(caps !== undefined, "编排必须构造适配器能力面");
    const sections = caps.contextSections ?? [];
    const v2 = sections.find((section) => section.includes("chief-workflow/v2"));
    assert.ok(v2 !== undefined, "fixed chief 聊天必须注入 chief-workflow-v2.md");
    assert.match(v2!, /^## 应用内置 Chief workflow v2（fixed 固定路径；本段优先于任何 legacy chief-workflow v1 段）/);
    assert.ok(v2!.includes("# Chief 工作流（两条固定路径 v2）"), "注入 v2 资源正文");
    const v2Bytes = await fs.readFile(FIXED_CHIEF_WORKFLOW_V2_PATH);
    const metadata = JSON.parse(v2!.split("\n")[1]!) as Record<string, unknown>;
    assert.equal(metadata["resourceVersion"], "chief-workflow/v2");
    assert.equal(metadata["sha256"], sha(v2Bytes), "v2 资源 SHA-256 必须是磁盘实测值");
    assert.equal(metadata["bytes"], v2Bytes.length);
    assert.ok(sections.some((section) => section.includes("固定路径产线调度")), "fixed chief 模块 context 段必须注入");
    for (const legacyTool of ["gitQuery", "gitCandidate", "gitPublish", "requestVersionDecision", "submitVersionChange", "submitRefactor", "requestStableWrite", "selectRunChange"] as const) {
      assert.equal(caps[legacyTool], undefined, `fixed 聊天编排能力面不得含 legacy ${legacyTool}`);
    }
    assert.notEqual(caps.closeCreatedTaskFixed, undefined, "fixed 聊天编排能力面保留 close_created_task v2 实现");
  } finally {
    await handle.dispose();
  }
}

/** 聊天入口打开后、首条 stage-request 之前：不得写 legacy trunk/run，也不得提前写 `workflowSchema`。 */
async function assertChatEntryNoStateWrites(root: string): Promise<void> {
  await assert.rejects(fs.stat(path.join(root, ".ans", "trunk")), "聊天入口不得写 .ans/trunk");
  await assert.rejects(fs.stat(path.join(root, ".ans", "runs")), "聊天入口不得写 .ans/runs");
  await assert.rejects(fs.stat(path.join(root, ".ans", "project.json")), "聊天入口不得提前写 project.json（首次 fixed 启动仍在首条 stage-request）");
}

// —————————————— 路径 A：空项目 → delivered 全链 ——————————————

test("路径 A 全链（假会话）：空项目 → 3 卡 → 基线 → A11 真实 Git 提交 → A12 归档 → merge-main 客户本人 → delivered", async () => {
  const root = await tempRoot("ans-b5-chain-a-");
  const h = harness(root);
  try {
    // 0) 空项目：无 .ans/project.json、无 Git 仓库。
    await assert.rejects(fs.stat(path.join(root, ".git")));
    await assert.rejects(fs.stat(path.join(root, ".ans", "project.json")));

    // 1) **真实聊天入口 + 首个 stage-request**（B6.2）：
    //    (a) 空项目、无 taskId 打开幕僚聊天（真实 `SessionManager.open`）⇒ 会话级 fixed + fixed 工具面；
    //        同一入参镜像交给真实编排 `openRoleSession`（假适配器）⇒ fixed context/chief-workflow-v2
    //        实际注入。聊天打开阶段：不写 legacy `.ans/trunk`/`.ans/runs`、不提前写 workflowSchema。
    //    (b) 由该聊天会话经真实派发发出首个 stage-request ⇒ `ensureFixedPathStarted` 原子写
    //        project.json workflowSchema 并按 fixed 路由（旧路径不经过本测试的唯一入口）。
    let chief = await openRole(h, root, "chief");
    await assertFixedChiefChatInjection(chief);
    await assertChatEntryNoStateWrites(root);
    const turnA1 = "turn-customer-a1";
    const a1Text = "推进 A1：请运营派产品撰写意图";
    const liveA1 = liveSource(h.mgr, root, "chief", { turnId: turnA1 });
    const a1Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: a1Text, flowId: FLOW,
      taskKind: "stage-request", workflowPath: "A", stage: "A1", workflowAction: "advance", sideEffect: "read-only",
    }, liveA1);
    releaseSource(h.mgr, liveA1);
    assert.equal(a1Dispatch.ok, true, a1Dispatch.message ?? "");
    const config = JSON.parse(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
    assert.equal(config["workflowSchema"], "two-fixed-paths/v1", "首次 fixed 启动写 workflowSchema");
    const ledgerAfterA1 = await readWorkflowLedger(root);
    const started = ledgerAfterA1.events.find((event) => event.kind === "workflow.started");
    assert.ok(started !== undefined && started.kind === "workflow.started");
    const WF = started!.workflowId;
    assert.equal(WF, workflowIdFor(FLOW, "A", turnA1, sha(a1Text)), "workflowId 确定性（无时钟/随机）");
    assert.equal(started!.trigger.by, "chief");
    const srA1 = await findOpenStageRequest(root, "A1");
    assert.equal(srA1.created?.from, "chief");
    assert.equal(srA1.created?.sideEffect, "read-only");
    assert.equal(srA1.created?.runId, undefined, "fixed stage-request 不得带 runId");
    // B6.2：投递自动打开的目标会话也走聊天入口按项目状态解析 ⇒ fixed（B6.1 修复；不再以 legacy 注入）。
    // T3 B10.1（2026-11-11）：fixed 派发的自动打开还必须携带**本次真实 stage-request taskId**（目标会话
    // `assignedTaskId` / run-role `input.taskId`；`submit_report` 的任务关联来源）。B6.2 旧断言「自动打开 =
    // 无 taskId 聊天会话」已被本批取代；路由在返回前已同步完成目标会话打开，故此处可直接断言。
    const convenerAutoOpen = h.inputs.filter((input) => input.roleId === "convener" && input.taskId === srA1.taskId).at(-1);
    assert.ok(convenerAutoOpen !== undefined, "首个 stage-request 投递应自动打开运营会话（B10.1：携带真实 taskId）");
    assert.equal(convenerAutoOpen!.workflowMode, "fixed", "自动打开的目标会话同样注入 fixed（B6.1 聊天入口）");
    assert.equal(convenerAutoOpen!.taskId, srA1.taskId, "自动打开的目标会话绑定本次真实 stage-request taskId（B10.1）");
    // B10.1 起自动打开已绑定本次任务；此处仍显式停止后按同一 taskId 重开，延续既有显式入口覆盖
    // （close_created_task v2 / complete_team_plan v4 于 taskId 绑定会话注入；重开续接同一任务事实）。
    await h.mgr.stop("chief");
    await h.mgr.stop("convener");
    chief = await openRole(h, root, "chief", srA1.taskId);
    const convener = await openRole(h, root, "convener", srA1.taskId);

    // 2) A1：运营派产品（Q6：绑定真实受派 open stage-request）；生产路由记 stage.dispatched A1（B5.1 接线）。
    let convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA1.taskId });
    const a1Product = await routeDispatch(h.mgr, root, "convener", {
      roleId: "product", task: "A1 受理：准备产品意图", flowId: FLOW, workflowId: WF, stage: "A1", sideEffect: "docs",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(a1Product.ok, true, a1Product.message ?? "");
    const a1Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A1" && record.created.to === "product");
    await assertStageDispatched(root, WF, "A1", a1Task.taskId);
    assert.equal((await view(root, WF)).stages.A1.status, "completed", "A1 完成于目标任务创建（stage.dispatched，生产接线）");
    await reportDone(root, a1Task.taskId, "product", "A1 受理");
    const a1Closed = await closeTaskViaDesktop(convener, { operationId: "op-close-a1-ack", taskId: a1Task.taskId });
    assert.equal(a1Closed.ok, true, JSON.stringify(a1Closed));
    await closeStageRequest(h, root, chief, "A1", "A1 请求受理完成");

    // 幂等：同一 A1 请求重放返回原任务、不重复 workflow.started。
    const { requestStage } = await import("../../src/common/编排/workflow-service.ts");
    const replayA1 = await requestStage({
      projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A",
      requestDigest: sha(a1Text), sourceTaskId: turnA1, text: a1Text,
    });
    assert.equal(replayA1.ok, true);
    if (replayA1.ok) {
      assert.equal(replayA1.replay, true);
      assert.equal(replayA1.taskId, srA1.taskId);
      assert.equal(replayA1.workflowStarted, false);
    }
    assert.equal((await readWorkflowLedger(root)).events.filter((event) => event.kind === "workflow.started").length, 1);

    // 3) A2：产品写意图 → 运营收口（accepted + 报告证据）⇒ A2 completed。
    let live = liveSource(h.mgr, root, "chief", { turnId: "turn-a2" });
    const a2Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A2：产品撰写意图", flowId: FLOW, workflowId: WF, stage: "A2",
      taskKind: "stage-request", workflowPath: "A", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a2Dispatch.ok, true, a2Dispatch.message ?? "");
    const srA2 = await findOpenStageRequest(root, "A2");
    convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA2.taskId });
    const a2Product = await routeDispatch(h.mgr, root, "convener", {
      roleId: "product", task: "撰写产品意图 docs/product/snake-intent-v1.md", flowId: FLOW, workflowId: WF, stage: "A2", sideEffect: "docs",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(a2Product.ok, true, a2Product.message ?? "");
    await writeChainDocs(root, { intent: true, proposal: false, teamPlan: false });
    const a2Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A2" && record.created.to === "product");
    await reportDone(root, a2Task.taskId, "product", "意图完成", ["docs/product/snake-intent-v1.md"]);
    const a2Closed = await closeTaskViaDesktop(convener, { operationId: "op-close-a2", taskId: a2Task.taskId });
    assert.equal(a2Closed.ok, true, JSON.stringify(a2Closed));
    assert.equal(a2Closed.stageCompleted, true, "A2 完成于收口 + 文档证据");
    await closeStageRequest(h, root, chief, "A2", "A2 完成");

    // 4) A3：意图确认卡（客户 confirm）→ finalizeIntent ⇒ A3 completed。
    assert.equal(typeof chief.customerInput, "function");
    const intentOutcome = await chief.customerInput!({
      kind: "choice", title: "确认产品意图", cardKind: "intent-confirm", flowId: FLOW,
      options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修订" }],
    });
    assert.equal(intentOutcome?.outcome, "answered");
    const intentCreated = (await readTaskState(root)).events.find((event) => event.kind === "request.created" && event.cardKind === "intent-confirm");
    assert.ok(intentCreated !== undefined && intentCreated.kind === "request.created");
    if (intentCreated !== undefined && intentCreated.kind === "request.created") {
      assert.equal(intentCreated.workflowId, WF);
      assert.equal(intentCreated.stage, "A3");
      const intentRef = intentCreated.documentRefs?.find((ref) => ref.kind === "intent");
      assert.ok(intentRef !== undefined);
      assert.equal(intentRef!.sha256, sha(await fs.readFile(path.join(root, "docs", "product", "snake-intent-v1.md"))));
    }
    assert.equal((await view(root, WF)).stages.A3.status, "completed");

    // 5) A4/A5：策划出方案/模块/名单/架构；A5 收口 + 文档证据 ⇒ A5 completed。
    live = liveSource(h.mgr, root, "chief", { turnId: "turn-a4" });
    const a4Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A4：请运营派策划", flowId: FLOW, workflowId: WF, stage: "A4",
      taskKind: "stage-request", workflowPath: "A", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a4Dispatch.ok, true, a4Dispatch.message ?? "");
    const srA4 = await findOpenStageRequest(root, "A4");
    convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA4.taskId });
    const a4Rapporteur = await routeDispatch(h.mgr, root, "convener", {
      roleId: "rapporteur", task: "A4 受理：准备方案", flowId: FLOW, workflowId: WF, stage: "A4", sideEffect: "docs",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(a4Rapporteur.ok, true, a4Rapporteur.message ?? "");
    const a4Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A4" && record.created.to === "rapporteur");
    await assertStageDispatched(root, WF, "A4", a4Task.taskId);
    await reportDone(root, a4Task.taskId, "rapporteur", "A4 受理");
    const a4Closed = await closeTaskViaDesktop(convener, { operationId: "op-close-a4-ack", taskId: a4Task.taskId });
    assert.equal(a4Closed.ok, true);
    await closeStageRequest(h, root, chief, "A4", "A4 请求受理完成");

    live = liveSource(h.mgr, root, "chief", { turnId: "turn-a5" });
    const a5Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A5：策划出方案/模块/名单/架构", flowId: FLOW, workflowId: WF, stage: "A5",
      taskKind: "stage-request", workflowPath: "A", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a5Dispatch.ok, true, a5Dispatch.message ?? "");
    const srA5 = await findOpenStageRequest(root, "A5");
    convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA5.taskId });
    const a5Rapporteur = await routeDispatch(h.mgr, root, "convener", {
      roleId: "rapporteur", task: "产出提案/模块/名单/架构文档", flowId: FLOW, workflowId: WF, stage: "A5", sideEffect: "docs",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(a5Rapporteur.ok, true, a5Rapporteur.message ?? "");
    await writeChainDocs(root, { intent: false, proposal: true, teamPlan: false });
    const a5Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A5" && record.created.to === "rapporteur");
    await reportDone(root, a5Task.taskId, "rapporteur", "方案完成", [
      "docs/proposals/snake-proposal-v1.md", "docs/proposals/snake-modules-v1.md",
      "docs/proposals/snake-roster-v1.md", "docs/contracts/snake-architecture-v1.md",
    ]);
    const a5Closed = await closeTaskViaDesktop(convener, { operationId: "op-close-a5", taskId: a5Task.taskId });
    assert.equal(a5Closed.ok, true, JSON.stringify(a5Closed));
    assert.equal(a5Closed.stageCompleted, true);
    await closeStageRequest(h, root, chief, "A5", "A5 完成");

    // 6) A6：方案卡（客户 accept）——呈卡前由生产接线写 A6 在办标记（B5.1 G-B5-3），桌面绑定五件 documentRefs。
    const { appendWorkflowEvent } = await import("../../src/common/编排/workflow-service.ts");
    const proposalOutcome = await chief.customerInput!({
      kind: "choice", title: "确认方案", cardKind: "proposal", flowId: FLOW,
      options: [{ id: "accept", label: "接受" }, { id: "revise", label: "修订" }, { id: "reject", label: "拒绝" }],
    });
    assert.equal(proposalOutcome?.outcome, "answered");
    // A6 在办/完成均由方案卡生命周期产生（生产接线；幂等键/摘要为应用计算，不采信模型自报）。
    const proposalSha = sha(await fs.readFile(path.join(root, "docs", "proposals", "snake-proposal-v1.md")));
    const a6Requested = (await readWorkflowLedger(root)).events.filter((event): event is Extract<WorkflowEvent, { kind: "stage.requested" }> =>
      event.workflowId === WF && event.kind === "stage.requested" && event.stage === "A6");
    assert.equal(a6Requested.length, 1, "A6 stage.requested 由方案卡生产接线写入（一次）");
    assert.equal(a6Requested[0]!.idempotencyKey, `stage-request:${WF}:A6:1`);
    assert.equal(a6Requested[0]!.requestDigest, proposalSha, "A6 requestDigest = 方案依据（proposal）字节 sha256（应用计算）");
    assert.equal(a6Requested[0]!.requestTaskId, `proposal-card:${FLOW}:${proposalSha.slice(0, 12)}`);
    const a6Completed = (await readWorkflowLedger(root)).events.filter((event): event is Extract<WorkflowEvent, { kind: "stage.completed" }> =>
      event.workflowId === WF && event.kind === "stage.completed" && event.stage === "A6");
    assert.equal(a6Completed.length, 1, "A6 stage.completed 由方案卡 accept 落账（一次）");
    assert.equal(a6Completed[0]!.cause.kind, "request-resolved");
    assert.equal(a6Completed[0]!.artifacts.length, 5, "A6 完成携带五件方案 documentRefs");
    const proposalCreated = (await readTaskState(root)).events.find((event) => event.kind === "request.created" && event.cardKind === "proposal");
    assert.ok(proposalCreated !== undefined && proposalCreated.kind === "request.created");
    if (proposalCreated !== undefined && proposalCreated.kind === "request.created") {
      assert.deepEqual((proposalCreated.documentRefs ?? []).map((ref) => ref.kind), ["intent", "proposal", "modules", "roster", "architecture"]);
      for (const ref of proposalCreated.documentRefs ?? []) assert.match(ref.sha256, /^[a-f0-9]{64}$/);
    }
    assert.equal((await view(root, WF)).stages.A6.status, "completed");

    // 7) A7/A8：请求人事 → 建卡/激活（role.activated + A8 completed；不弹客户卡）。
    live = liveSource(h.mgr, root, "chief", { turnId: "turn-a7" });
    const a7Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A7：请运营派人事建卡/激活", flowId: FLOW, workflowId: WF, stage: "A7",
      taskKind: "stage-request", workflowPath: "A", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a7Dispatch.ok, true, a7Dispatch.message ?? "");
    const srA7 = await findOpenStageRequest(root, "A7");
    convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA7.taskId });
    const a7Nominator = await routeDispatch(h.mgr, root, "convener", {
      roleId: "nominator", task: "A7 受理：准备激活名单角色", flowId: FLOW, workflowId: WF, stage: "A7", sideEffect: "docs",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(a7Nominator.ok, true, a7Nominator.message ?? "");
    const a7Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A7" && record.created.to === "nominator");
    await assertStageDispatched(root, WF, "A7", a7Task.taskId);
    await reportDone(root, a7Task.taskId, "nominator", "A7 受理");
    const a7Closed = await closeTaskViaDesktop(convener, { operationId: "op-close-a7-ack", taskId: a7Task.taskId });
    assert.equal(a7Closed.ok, true);
    // A8 激活任务（同一 A7 stage-request 仍在办）：task.created A8 → 生产路由记 stage.dispatched A8（B5.1 接线）。
    convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA7.taskId });
    const a8Nominator = await routeDispatch(h.mgr, root, "convener", {
      roleId: "nominator", task: "建卡并激活名单角色 worker（A8）", flowId: FLOW, workflowId: WF, stage: "A8", sideEffect: "docs",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(a8Nominator.ok, true, a8Nominator.message ?? "");
    const a8Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A8" && record.created.to === "nominator");
    await assertStageDispatched(root, WF, "A8", a8Task.taskId);
    const roleDocs = await writeRoleDocuments(root);
    const proposalResolved = (await readTaskState(root)).events.find((event) => event.kind === "request.resolved" && event.cardKind === "proposal");
    assert.ok(proposalResolved !== undefined && proposalResolved.kind === "request.resolved" && proposalResolved.decisionId !== undefined);
    const activation = await activateRoleDocumentsFixed({
      projectRoot: root,
      operationId: "op-activate-worker",
      flowId: FLOW,
      workflowId: WF,
      proposalDecisionId: proposalResolved!.decisionId!,
      targetRoleId: "worker",
      roster: { path: "docs/proposals/snake-roster-v1.md", sha256: sha(ROSTER_TEXT) },
      documents: {
        card: { path: "角色卡/worker/role-card.md", sha256: sha(roleDocs.card) },
        boundaryMd: { path: "角色卡/worker/boundary.md", sha256: sha(roleDocs.boundaryMd) },
        boundaryYaml: { path: "角色卡/worker/boundary.yaml", sha256: sha(roleDocs.boundaryYaml) },
      },
    });
    assert.equal(activation.ok, true, activation.ok === false ? `${activation.code}: ${activation.message}` : "");
    if (activation.ok) assert.equal(activation.stageCompleted, true, "全部名单角色激活 ⇒ A8 completed");
    const activationReplay = await activateRoleDocumentsFixed({
      projectRoot: root, operationId: "op-activate-worker-2", flowId: FLOW, workflowId: WF,
      proposalDecisionId: proposalResolved!.decisionId!, targetRoleId: "worker",
      roster: { path: "docs/proposals/snake-roster-v1.md", sha256: sha(ROSTER_TEXT) },
      documents: {
        card: { path: "角色卡/worker/role-card.md", sha256: sha(roleDocs.card) },
        boundaryMd: { path: "角色卡/worker/boundary.md", sha256: sha(roleDocs.boundaryMd) },
        boundaryYaml: { path: "角色卡/worker/boundary.yaml", sha256: sha(roleDocs.boundaryYaml) },
      },
    });
    assert.equal(activationReplay.ok, true);
    if (activationReplay.ok) assert.equal(activationReplay.replay, true, "同 (workflow, role, rosterSha) 激活幂等");
    await closeStageRequest(h, root, chief, "A7", "A7 请求完成");

    // 8) A9：团队计划 + 基线 3 件小事（应用 complete_team_plan v4 + 真实 BaselineGitPort）。
    await writeChainDocs(root, { intent: false, proposal: false, teamPlan: true });
    live = liveSource(h.mgr, root, "chief", { turnId: "turn-a9" });
    const a9Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 A9：团队计划 + 基线", flowId: FLOW, workflowId: WF, stage: "A9",
      taskKind: "stage-request", workflowPath: "A", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a9Dispatch.ok, true, a9Dispatch.message ?? "");
    const srA9 = await findOpenStageRequest(root, "A9");
    // B10.1：fixed 派发按本次任务安全重绑目标会话 ⇒ 应用工具实现绑定**当前**会话句柄；测试须取 A9 重绑
    // 后的最新 convener 入参（旧聊天/上一任务的句柄已 dispose，complete_team_plan 的句柄一致性检查会拒绝）。
    const convenerA9 = h.inputs.filter((input) => input.roleId === "convener" && input.taskId === srA9.taskId).at(-1);
    assert.ok(convenerA9 !== undefined, "A9 派发应以本次任务重绑并打开运营会话（B10.1）");
    assert.equal(typeof convenerA9!.completeTeamPlan, "function", "fixed 会话应注入 complete_team_plan v4");
    convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA9.taskId });
    const planReceipt = await convenerA9!.completeTeamPlan!({
      operationId: "op-a9-baseline", flowId: FLOW,
      plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(TEAM_PLAN_TEXT) },
    }) as { ok: boolean; status?: string; errorCode?: string; message?: string };
    releaseSource(h.mgr, convenerLive);
    assert.equal(planReceipt.ok, true, `${planReceipt.errorCode ?? ""} ${planReceipt.message ?? ""}`);
    assert.equal(planReceipt.status, "applied");
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), taskBranchName(WF), "A9 创建/切换任务分支");
    assert.match(git(root, "log", "-1", "--format=%s"), /ANS baseline/);
    const basisLedger = await readBasisLedger(root);
    const basis = basisLedger.events.find((event): event is Extract<BasisEvent, { kind: "basis.recorded" }> =>
      event.kind === "basis.recorded" && event.workflowId === WF);
    assert.ok(basis !== undefined);
    assert.equal(basis!.reviewRoleId, "verifier", "roster 未标记 review ⇒ 默认 verifier");
    assert.equal(basis!.repo?.branch, taskBranchName(WF));
    assert.match(basis!.repo?.gitignoreSha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(basis!.teamPlan?.path, "docs/scheduling/snake-team-v1.md");
    assert.equal((await view(root, WF)).stages.A9.status, "completed");
    await closeStageRequest(h, root, chief, "A9", "A9 基线完成");
    // A3 意图卡 + A6 方案卡已各一次（A6 在 A7/A8/A9 之前）；A9 基线失败/成功都不弹客户卡。
    assert.equal(h.requests.length, 2, "A1–A9 期间仅 A3 意图卡与 A6 方案卡");

    // 9) A10：任命卡（客户确认 worker）⇒ A10 completed（不派实现）。
    const a10Marker: WorkflowEvent = {
      v: 1, at: new Date(AT).toISOString(), schema: "ans-workflow/v1", kind: "stage.requested",
      workflowId: WF, flowId: FLOW, path: "A",
      idempotencyKey: `stage-request:${WF}:A10:1`, stage: "A10", fromStage: "A9",
      requestTaskId: `appointment-card:${FLOW}:${sha(ROSTER_TEXT).slice(0, 12)}`, requestDigest: sha(ROSTER_TEXT), attempt: 1,
    };
    const a10Appended = await appendWorkflowEvent(root, a10Marker);
    assert.equal(a10Appended.ok, true);
    const appointmentOutcome = await chief.customerInput!({
      kind: "choice", title: "任命实现角色", cardKind: "appointment", flowId: FLOW, multiple: true,
      options: [{ id: "worker", label: "Worker" }],
    });
    assert.equal(appointmentOutcome?.outcome, "answered");
    const appointmentResolved = (await readTaskState(root)).events.find((event) => event.kind === "request.resolved" && event.cardKind === "appointment");
    assert.ok(appointmentResolved !== undefined && appointmentResolved.kind === "request.resolved");
    if (appointmentResolved !== undefined && appointmentResolved.kind === "request.resolved") {
      assert.equal(appointmentResolved.source, "stage-a10");
      assert.equal(appointmentResolved.workflowId, WF);
      assert.equal(appointmentResolved.stage, "A10");
      assert.deepEqual(appointmentResolved.targetRoleIds, ["worker"]);
      assert.equal(appointmentResolved.rosterSha256, undefined, "fixed 任命决议不带 legacy roster 戳");
    }
    assert.equal((await view(root, WF)).stages.A10.status, "completed");

    // 10) A12a（实施前写标准）：幕僚直派 verifier → 生产路由记 stage.dispatched A12a（B5.1 接线）→ criteria 收口。
    live = liveSource(h.mgr, root, "chief", { turnId: "turn-a12a" });
    const a12aDispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "verifier", task: "A12a 独立验收标准：写 criteria", flowId: FLOW, workflowId: WF, stage: "A12a", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a12aDispatch.ok, true, a12aDispatch.message ?? "");
    const a12aTask = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A12a" && record.created.to === "verifier");
    await assertStageDispatched(root, WF, "A12a", a12aTask.taskId);
    await writeFile(root, "docs/quality/snake-criteria-v1.md", "# 验收标准\n\n- AC-1：贪吃蛇可玩\n");
    await reportDone(root, a12aTask.taskId, "verifier", "criteria 完成", ["docs/quality/snake-criteria-v1.md"]);
    const a12aClosed = await closeTaskViaDesktop(chief, { operationId: "op-close-a12a", taskId: a12aTask.taskId });
    assert.equal(a12aClosed.ok, true, JSON.stringify(a12aClosed));
    assert.equal(a12aClosed.stageCompleted, true, "A12a completed（criteria hash 记录于报告证据）");

    // 11) A11：幕僚 stage-request → 运营派实现；任务级 Git add/commit（taskGitScope 来自团队计划）。
    live = liveSource(h.mgr, root, "chief", { turnId: "turn-a11" });
    const a11RequestText = `推进 A11：派实现 worker`;
    const a11Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: a11RequestText, flowId: FLOW, workflowId: WF, stage: "A11",
      taskKind: "stage-request", workflowPath: "A", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a11Dispatch.ok, true, `A12a 在办后 A11 stage-request 应成功：${a11Dispatch.message ?? ""}`);
    const srA11 = await findOpenStageRequest(root, "A11");
    convenerLive = liveSource(h.mgr, root, "convener", { taskId: srA11.taskId });
    const implDispatch = await routeDispatch(h.mgr, root, "convener", {
      roleId: "worker", task: "实现贪吃蛇核心模块", flowId: FLOW, workflowId: WF, stage: "A11",
      sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(implDispatch.ok, true, implDispatch.message ?? "");
    const implTask = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A11" && record.created.to === "worker");
    const scopeRes = await resolveTaskGitScope({ projectRoot: root, taskId: implTask.taskId, roleId: "worker" });
    assert.equal(scopeRes.ok, true, scopeRes.ok === false ? `${scopeRes.code}: ${scopeRes.message}` : "");
    if (!scopeRes.ok) return;
    assert.equal(scopeRes.scope.branch, taskBranchName(WF));
    assert.deepEqual(scopeRes.scope.paths, ["src/core/"]);
    const rules = defaultShellRules();
    assert.equal(classifyShellDetailed(["git", "add", "src/core/snake.ts"], rules, { taskGitScope: scopeRes.scope }).decision, "allow");
    const outsideAdd = classifyShellDetailed(["git", "add", "src/other/game.ts"], rules, { taskGitScope: scopeRes.scope });
    assert.equal(outsideAdd.decision, "deny", "越 writeSet 的 add 必须拒绝");
    assert.equal(outsideAdd.code, TASK_GIT_CODES.pathOutsideWriteSet);
    const pushDenied = classifyShellDetailed(["git", "push", "origin", "main"], rules, { taskGitScope: scopeRes.scope });
    assert.equal(pushDenied.decision, "deny");
    assert.equal(pushDenied.code, TASK_GIT_CODES.commandNotOrdinary);
    // 真实 Git：add（字面路径）→ 临界区内 staged ⊆ writeSet → commit。
    const taskGit = createDesktopTaskGitPort();
    assert.equal(await taskGit.currentBranch({ projectRoot: root }), taskBranchName(WF));
    await writeFile(root, "src/core/snake.ts", "export const SNAKE = { tick: 1 };\n");
    const addResult = await taskGit.add({ projectRoot: root, paths: ["src/core/snake.ts"] });
    assert.equal(addResult.exitCode, 0, addResult.error ?? "");
    const gate = await runTaskGitCommit({
      scope: scopeRes.scope,
      currentBranch: await taskGit.currentBranch({ projectRoot: root }),
      commitArgv: ["git", "commit", "-m", "A11: snake core"],
      acquire: (owner) => taskGit.acquireCriticalSection(root, owner),
      inspectStaged: () => taskGit.inspectStaged({ projectRoot: root }),
      commit: () => taskGit.commit({ projectRoot: root, message: "A11: snake core" }),
    });
    assert.equal(gate.ok, true, gate.ok === false ? `${gate.code}: ${gate.message}` : "");
    if (gate.ok) assert.deepEqual(gate.stagedPaths, ["src/core/snake.ts"]);
    const implTip = git(root, "rev-parse", "HEAD");
    await reportDone(root, implTask.taskId, "worker", "实现完成并提交", ["src/core/snake.ts"]);
    const a11Closed = await closeTaskViaDesktop(convener, { operationId: "op-close-a11", taskId: implTask.taskId });
    assert.equal(a11Closed.ok, true, JSON.stringify(a11Closed));
    assert.equal(a11Closed.stageCompleted, true, "A11 完成于全部实现任务 accepted + 分支 tip");
    assert.equal((await view(root, WF)).stages.A11.status, "completed");
    await closeStageRequest(h, root, chief, "A11", "A11 完成");

    // 12) A12b：幕僚直派 verifier（A11 后）→ 生产路由记 stage.dispatched A12b（B5.1 接线）→ 报告 + 应用归档 ⇒ A12 completed。
    live = liveSource(h.mgr, root, "chief", { turnId: "turn-a12b" });
    const a12bDispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "verifier", task: "A12b 独立验收报告", flowId: FLOW, workflowId: WF, stage: "A12b", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(a12bDispatch.ok, true, a12bDispatch.message ?? "");
    const a12bTask = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "A12b" && record.created.to === "verifier");
    await assertStageDispatched(root, WF, "A12b", a12bTask.taskId);
    await writeFile(root, "docs/quality/snake-report-v1.md", "# 验收报告\n\n结论：通过。\n");
    const archived = await archiveAcceptance({
      projectRoot: root, flowId: FLOW, workflowId: WF,
      criteriaPath: "docs/quality/snake-criteria-v1.md",
      reportPath: "docs/quality/snake-report-v1.md",
      conclusion: "通过", staffDecision: "幕僚决定：通过",
    });
    assert.equal(archived.ok, true, archived.ok === false ? `${archived.code}: ${archived.message}` : "");
    if (!archived.ok) return;
    assert.equal(archived.path, "docs/acceptance/snake-acceptance-v1.md", "归档版本随 report vN");
    const archiveText = await fs.readFile(path.join(root, "docs", "acceptance", "snake-acceptance-v1.md"), "utf8");
    assert.match(archiveText, new RegExp(`workflowId: ${WF}`));
    assert.match(archiveText, new RegExp(`reportSha256: ${sha(await fs.readFile(path.join(root, "docs", "quality", "snake-report-v1.md")))}`));
    assert.match(archiveText, /criteriaSha256: [a-f0-9]{64}/);
    assert.match(archiveText, /idempotencyKey: acceptance:/);
    const archiveReplay = await archiveAcceptance({
      projectRoot: root, flowId: FLOW, workflowId: WF,
      criteriaPath: "docs/quality/snake-criteria-v1.md", reportPath: "docs/quality/snake-report-v1.md",
      conclusion: "通过", staffDecision: "幕僚决定：通过",
    });
    assert.equal(archiveReplay.ok, true);
    if (archiveReplay.ok) assert.equal(archiveReplay.replay, true, "同 reportSha 归档幂等");
    await reportDone(root, a12bTask.taskId, "verifier", "独立验收通过", ["docs/quality/snake-report-v1.md"]);
    const reportSha = sha(await fs.readFile(path.join(root, "docs", "quality", "snake-report-v1.md")));
    const a12bClosed = await closeTask({
      projectRoot: root, operationId: "op-close-a12b", taskId: a12bTask.taskId, outcome: "accepted", actorRoleId: "chief",
      evidence: {
        artifacts: [{ path: "docs/quality/snake-report-v1.md", sha256: reportSha, kind: "report" }],
        acceptanceArchive: { path: archived.path, sha256: archived.sha256 },
      },
    });
    assert.equal(a12bClosed.ok, true, a12bClosed.ok === false ? `${a12bClosed.code}: ${a12bClosed.message}` : "");
    assert.equal((await view(root, WF)).stages.A12b.status, "completed");
    assert.equal((await view(root, WF)).stages.A12.status, "completed", "A12 聚合完成（A12b accepted + 归档）");

    // 13) A13：merge-main 高风险卡（应用自有非判断卡；客户本人 approve）→ 本地合并 main（不 push/tag）→ delivered。
    const archiveFacts = await findAcceptanceArchive({ projectRoot: root, flowId: FLOW, workflowId: WF });
    assert.ok(archiveFacts !== undefined);
    const branchTip = git(root, "rev-parse", "HEAD");
    // 先按应用入口 prepare + 直接执行一次 judge 确认尝试：judge 只能转人工/拒绝，不得代批/冒充客户。
    const preparedRelease = await prepareReleaseMerge({
      projectRoot: root, workflowId: WF, operationId: "op-release-a13-prepare", summary: "交付贪吃蛇 v1",
      evidence: [{ path: archiveFacts!.path, sha256: archiveFacts!.sha256 }],
      port: createDesktopReleaseGitPort(),
    });
    assert.equal(preparedRelease.ok, true, preparedRelease.ok === false ? `${preparedRelease.code}: ${preparedRelease.message}` : "");
    if (!preparedRelease.ok) return;
    const judgeAttempt = await executeReleaseMerge({
      projectRoot: root, workflowId: WF, releaseId: preparedRelease.releaseId,
      confirmation: { by: "judge" }, port: createDesktopReleaseGitPort(),
    });
    assert.equal(judgeAttempt.ok, false, "judge 不得代批 merge-main");
    if (!judgeAttempt.ok) assert.equal(judgeAttempt.code, "release-unauthorized");
    assert.equal((await readReleaseLedger(root)).events.some((event) =>
      event.workflowId === WF && (event.kind === "release.confirmed" || event.kind === "release.merged")), false, "judge 尝试不得写 confirmed/merged");
    const release = await h.mgr.runFixedReleaseMerge({
      projectRoot: root, workflowId: WF, operationId: "op-release-a13", summary: "交付贪吃蛇 v1",
      evidence: [{ path: archiveFacts!.path, sha256: archiveFacts!.sha256 }],
    });
    assert.equal(release.ok, true, release.message);
    assert.equal(release.merged, true);
    // 3 张确认卡各一次 + merge-main 一次；无 acceptance 卡、无额外客户门。
    const cardKinds = h.requests.map((request) => request.cardKind);
    assert.equal(cardKinds.filter((kind) => kind === "intent-confirm").length, 1);
    assert.equal(cardKinds.filter((kind) => kind === "proposal").length, 1);
    assert.equal(cardKinds.filter((kind) => kind === "appointment").length, 1);
    assert.equal(cardKinds.filter((kind) => kind === MERGE_MAIN_CARD_KIND).length, 1);
    assert.equal(cardKinds.includes("acceptance"), false, "fixed 路径不发 acceptance 卡");
    assert.equal(cardKinds.length, 4, "客户卡总数 = 3 张确认卡 + 1 张高风险动作卡");
    const mergeCard = h.requests.find((request) => request.cardKind === MERGE_MAIN_CARD_KIND)!;
    assert.equal((mergeCard as { application?: unknown }).application, true);
    assert.equal(governanceCardGroup(MERGE_MAIN_CARD_KIND), undefined, "merge-main 不进判断分组（非判断卡）");
    assert.match(mergeCard.preview ?? "", new RegExp(WF));
    assert.match(mergeCard.preview ?? "", new RegExp(branchTip));
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), "main", "合并后工作区停在 main");
    assert.doesNotThrow(() => execFileSync("git", ["merge-base", "--is-ancestor", `refs/heads/${taskBranchName(WF)}`, "refs/heads/main"], { cwd: root, stdio: "ignore" }));
    assert.equal(git(root, "tag"), "", "不 push/tag");
    assert.equal(git(root, "remote"), "");
    // 账本：release requested → confirmed(by customer) → merged；workflow.closed delivered。
    const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
    assert.deepEqual(releases.map((event) => event.kind), ["release.requested", "release.confirmed", "release.merged"]);
    const confirmed = releases.find((event) => event.kind === "release.confirmed");
    assert.ok(confirmed !== undefined && confirmed.kind === "release.confirmed" && confirmed.by === "customer", "release.confirmed.by 只能是客户本人");
    const finalView = await view(root, WF);
    assert.equal(finalView.closed?.outcome, "delivered");
    assert.equal(finalView.releaseId !== undefined, true);
    // 重复发布 ⇒ release-already-merged（不重复卡、不重复合并）。
    const replayRelease = await h.mgr.runFixedReleaseMerge({
      projectRoot: root, workflowId: WF, operationId: "op-release-a13-again", summary: "重复发布",
      evidence: [{ path: archiveFacts!.path, sha256: archiveFacts!.sha256 }],
    });
    assert.equal(replayRelease.ok, false);
    assert.equal(replayRelease.code, "release-already-merged");
    assert.equal(h.requests.filter((request) => request.cardKind === MERGE_MAIN_CARD_KIND).length, 1);
    // A13 stage.requested 单次（应用推进）。
    const finalLedger = await readWorkflowLedger(root);
    assert.equal(finalLedger.events.filter((event) => event.workflowId === WF && event.kind === "stage.requested" && event.stage === "A13").length, 1);
    const mergeResolved = (await readTaskState(root)).events.find((event) => event.kind === "request.resolved" && event.cardKind === MERGE_MAIN_CARD_KIND);
    assert.ok(mergeResolved !== undefined && mergeResolved.kind === "request.resolved" && mergeResolved.by === "customer", "merge-main 只能客户本人裁决");

    // 14) 账本/审计不变量：三本新账本存在；`.ans/trunk`/`.ans/runs` 未被写；治理文档不入 Git。
    await assertNoLegacyWrites(root);
    assert.match(await fs.readFile(path.join(root, ".gitignore"), "utf8"), /# >>> ans managed >>>/);
    assert.equal(git(root, "ls-files", "docs/product").trim(), "", "治理文档不入 Git");
    assert.equal(git(root, "ls-files", ".ans").trim(), "", "应用账本不入 Git");
    assert.equal(git(root, "ls-files", "角色卡").trim(), "", "角色卡不入 Git");
    const ledgerKinds: readonly string[] = finalLedger.events.filter((event) => event.workflowId === WF).map((event) => event.kind);
    for (const required of ["workflow.started", "stage.requested", "stage.completed", "role.activated", "workflow.closed"]) {
      assert.equal(ledgerKinds.includes(required), true, `应包含 ${required}`);
    }
    assert.ok(basisLedger.events.some((event) => event.kind === "basis.recorded" && event.workflowId === WF));
    assert.ok(finalLedger.events.every((event) => event.schema === "ans-workflow/v1"));
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 路径 B：既有 Git 项目 → delivered 全链 ——————————————

test("路径 B 全链（假会话）：既有仓库 → B1 → B2 scope（B3 受理生产接线）→ B3 写集/真实提交 → B4 发布（不要求 A12b）→ delivered", async () => {
  const root = await tempRoot("ans-b5-chain-b-");
  const h = harness(root);
  try {
    // 既有 Git 项目：main 基线 + `.gitignore` 托管块（治理文档不入 Git）。
    initRepo(root);
    await writeFile(root, "src/core/snake.ts", "export const SNAKE = 1;\n");
    const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
    assert.equal(ensured.ok, true);
    const mainOid = commitAll(root, "base");
    await writeChainDocs(root, { intent: true, proposal: true, teamPlan: false });
    await writeFile(root, "docs/governance/rapporteur/snake-impact-v1.md", "# 影响面\n\ncore 碰撞问题修复。\n");

    // 1) B1：幕僚 stage-request → 运营派策划影响面（无仓库? 有仓库；应用记 basis(reason:"path-b")）。
    //    B6.2 披露：路径 B 保留既有 open + routeDispatch 入口（未做 run-role 镜像打开）；此处只断言
    //    应用层聊天入口为 fixed——既有 Git 项目无 legacy trunk/run/显式 legacy ⇒ B6.1 解析为 fixed。
    let chief = await openRole(h, root, "chief");
    assertFixedChiefChatEntry(chief);
    await assertChatEntryNoStateWrites(root);
    const b1Text = "推进 B1：请运营派策划做影响面分析";
    const liveB1 = liveSource(h.mgr, root, "chief", { turnId: "turn-b1" });
    const b1Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: b1Text, flowId: FLOW,
      taskKind: "stage-request", workflowPath: "B", stage: "B1", workflowAction: "advance", sideEffect: "read-only",
    }, liveB1);
    releaseSource(h.mgr, liveB1);
    assert.equal(b1Dispatch.ok, true, b1Dispatch.message ?? "");
    const ledgerB = await readWorkflowLedger(root);
    const startedB = ledgerB.events.find((event) => event.kind === "workflow.started");
    assert.ok(startedB !== undefined && startedB.kind === "workflow.started" && startedB.path === "B");
    const WF = startedB!.workflowId;
    const srB1 = await findOpenStageRequest(root, "B1");
    const srB1TaskId = srB1.taskId;
    await h.mgr.stop("chief");
    await h.mgr.stop("convener");
    chief = await openRole(h, root, "chief", srB1TaskId);
    const convener = await openRole(h, root, "convener", srB1TaskId);
    const convenerLive = liveSource(h.mgr, root, "convener", { taskId: srB1.taskId });
    const b1Analysis = await routeDispatch(h.mgr, root, "convener", {
      roleId: "rapporteur", task: "影响面分析：定位 core 碰撞问题", flowId: FLOW, workflowId: WF, stage: "B1", sideEffect: "read-only",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(b1Analysis.ok, true, b1Analysis.message ?? "");
    // path-b 只读快照：repo 记录既有仓库/任务分支；不写团队计划、不弹卡。
    const basisLedger = await readBasisLedger(root);
    const pathB = basisLedger.events.find((event): event is Extract<BasisEvent, { kind: "basis.recorded" }> =>
      event.kind === "basis.recorded" && event.workflowId === WF);
    assert.ok(pathB !== undefined);
    assert.equal(pathB!.reason, "path-b");
    assert.equal(pathB!.teamPlan, null, "路径 B 不写团队计划");
    assert.equal(pathB!.repo?.state, "existing");
    assert.equal(pathB!.repo?.branch, taskBranchName(WF));
    assert.equal(pathB!.repo?.baseOid, mainOid, "任务分支从当前 HEAD（main）创建");
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), taskBranchName(WF));
    assert.equal(h.requests.length, 0, "路径 B 准备不弹客户卡");
    await assert.rejects(fs.stat(path.join(root, "docs", "scheduling")), "路径 B 不写团队计划");
    const b1Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "B1" && record.created.to === "rapporteur");
    await reportDone(root, b1Task.taskId, "rapporteur", "影响面完成", ["docs/governance/rapporteur/snake-impact-v1.md"]);
    const b1Closed = await closeTaskViaDesktop(convener, { operationId: "op-close-b1", taskId: b1Task.taskId });
    assert.equal(b1Closed.ok, true, JSON.stringify(b1Closed));
    assert.equal(b1Closed.stageCompleted, true);
    await closeStageRequest(h, root, chief, "B1", "B1 完成");

    // 2) B2：幕僚范围决定——生产接线（B5.1 G-B5-2）：应用在受理 B3 advance stage-request 时校验
    //    影响面报告字节 hash 并写 change.scope-decided（候选路径 = B3 请求的 requestedEvidence，文件级；
    //    属主/有效写集由编排按名单/边界派生，不采信模型自报写集）。受理前 B2 必须仍为 pending
    //    （本测试不直接调用 recordChangeScopeDecision 伪造完成）。
    assert.equal((await view(root, WF)).stages.B2.status, "pending", "B3 请求受理前 B2 未被宿主伪造完成");

    // 3) B3：运营按派生写集派实现 → 任务级 Git 提交；范围外提交/命令被拒。
    const liveB3 = liveSource(h.mgr, root, "chief", { turnId: "turn-b3" });
    const b3Text = "推进 B3：修复 core 碰撞";
    const b3Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: b3Text, flowId: FLOW, workflowId: WF, stage: "B3",
      taskKind: "stage-request", workflowPath: "B", workflowAction: "advance", sideEffect: "read-only", requestedEvidence: ["src/core/snake.ts"],
    }, liveB3);
    releaseSource(h.mgr, liveB3);
    assert.equal(b3Dispatch.ok, true, b3Dispatch.message ?? "");
    // B2 完成 + change.scope-decided 由 B3 受理生产接线产生（应用事实：报告 hash 重算、写集派生）。
    const impactSha = sha(await fs.readFile(path.join(root, "docs", "governance", "rapporteur", "snake-impact-v1.md")));
    const scopeDecided = (await readWorkflowLedger(root)).events.filter((event): event is Extract<WorkflowEvent, { kind: "change.scope-decided" }> =>
      event.workflowId === WF && event.kind === "change.scope-decided");
    assert.equal(scopeDecided.length, 1, "change.scope-decided 由 B3 受理生产接线写入（一次）");
    assert.equal(scopeDecided[0]!.impactReport.path, "docs/governance/rapporteur/snake-impact-v1.md");
    assert.equal(scopeDecided[0]!.impactReport.sha256, impactSha, "影响面报告 hash 由应用按字节重算");
    assert.deepEqual(scopeDecided[0]!.effectiveWritesets, [{ roleId: "worker", paths: ["src/core/snake.ts"] }]);
    assert.equal(scopeDecided[0]!.decidedBy, "chief");
    assert.equal(scopeDecided[0]!.requestTaskId, srB1TaskId, "B2 审计绑定 B1 stage-request");
    assert.match(scopeDecided[0]!.idempotencyKey, new RegExp(`^scope:${WF}:${impactSha}:`));
    assert.equal((await view(root, WF)).stages.B2.status, "completed", "B2 完成于 change.scope-decided（生产接线）");
    assert.equal(h.requests.length, 0, "B2 不弹卡");
    // 幂等：同一 B3 stage-request 重放 ⇒ 不重复建任务、账本不重复写 change.scope-decided。
    const replayLiveB3 = liveSource(h.mgr, root, "chief", { turnId: "turn-b3" });
    const b3Replay = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: b3Text, flowId: FLOW, workflowId: WF, stage: "B3",
      taskKind: "stage-request", workflowPath: "B", workflowAction: "advance", sideEffect: "read-only", requestedEvidence: ["src/core/snake.ts"],
    }, replayLiveB3);
    releaseSource(h.mgr, replayLiveB3);
    assert.equal(b3Replay.ok, true, b3Replay.message ?? "");
    assert.equal((await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF && event.kind === "change.scope-decided").length, 1, "B2 账本不因 B3 重放重复写");
    const srB3 = await findOpenStageRequest(root, "B3");
    const convenerLiveB3 = liveSource(h.mgr, root, "convener", { taskId: srB3.taskId });
    const b3Impl = await routeDispatch(h.mgr, root, "convener", {
      roleId: "worker", task: "修复 core 碰撞逻辑", flowId: FLOW, workflowId: WF, stage: "B3",
      sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
    }, convenerLiveB3);
    releaseSource(h.mgr, convenerLiveB3);
    assert.equal(b3Impl.ok, true, b3Impl.message ?? "");
    const b3Task = await findTask(root, (record) => record.created?.workflowId === WF && record.created.stage === "B3" && record.created.to === "worker");
    const scopeRes = await resolveTaskGitScope({ projectRoot: root, taskId: b3Task.taskId, roleId: "worker" });
    assert.equal(scopeRes.ok, true, scopeRes.ok === false ? `${scopeRes.code}: ${scopeRes.message}` : "");
    if (!scopeRes.ok) return;
    assert.deepEqual(scopeRes.scope.paths, ["src/core/snake.ts"], "B3 写集 = scope ∩ roster 属主");
    const rules = defaultShellRules();
    assert.equal(classifyShellDetailed(["git", "add", "src/core/snake.ts"], rules, { taskGitScope: scopeRes.scope }).decision, "allow");
    assert.equal(classifyShellDetailed(["git", "add", "src/other/x.ts"], rules, { taskGitScope: scopeRes.scope }).code, TASK_GIT_CODES.pathOutsideWriteSet);
    const taskGit = createDesktopTaskGitPort();
    await writeFile(root, "src/core/snake.ts", "export const SNAKE = 2;\n");
    await writeFile(root, "src/other/x.ts", "export const X = 1;\n");
    const addInScope = await taskGit.add({ projectRoot: root, paths: ["src/core/snake.ts"] });
    assert.equal(addInScope.exitCode, 0);
    const addOutOfScope = await taskGit.add({ projectRoot: root, paths: ["src/other/x.ts"] });
    assert.equal(addOutOfScope.exitCode, 0, "端口只做运输防御；越界由 commit 门禁拦截");
    const blockedCommit = await runTaskGitCommit({
      scope: scopeRes.scope,
      currentBranch: await taskGit.currentBranch({ projectRoot: root }),
      commitArgv: ["git", "commit", "-m", "B3: should block"],
      acquire: (owner) => taskGit.acquireCriticalSection(root, owner),
      inspectStaged: () => taskGit.inspectStaged({ projectRoot: root }),
      commit: () => taskGit.commit({ projectRoot: root, message: "B3: should block" }),
    });
    assert.equal(blockedCommit.ok, false, "staged 超出 writeSet 必须拒绝提交");
    if (!blockedCommit.ok) assert.equal(blockedCommit.code, TASK_GIT_GATE_CODES.stagedOutsideWriteSet);
    git(root, "reset", "HEAD", "--", "src/core/snake.ts", "src/other/x.ts");
    await fs.rm(path.join(root, "src", "other"), { recursive: true, force: true });
    const addFix = await taskGit.add({ projectRoot: root, paths: ["src/core/snake.ts"] });
    assert.equal(addFix.exitCode, 0);
    const commitGate = await runTaskGitCommit({
      scope: scopeRes.scope,
      currentBranch: await taskGit.currentBranch({ projectRoot: root }),
      commitArgv: ["git", "commit", "-m", "B3: fix core collision"],
      acquire: (owner) => taskGit.acquireCriticalSection(root, owner),
      inspectStaged: () => taskGit.inspectStaged({ projectRoot: root }),
      commit: () => taskGit.commit({ projectRoot: root, message: "B3: fix core collision" }),
    });
    assert.equal(commitGate.ok, true, commitGate.ok === false ? `${commitGate.code}: ${commitGate.message}` : "");
    const b3Tip = git(root, "rev-parse", "HEAD");
    assert.notEqual(b3Tip, mainOid);
    await writeFile(root, "docs/quality/snake-b3-report-v1.md", "# B3 报告\n\n修复完成，测试通过。\n");
    await reportDone(root, b3Task.taskId, "worker", "修复完成", ["docs/quality/snake-b3-report-v1.md"]);
    // B3 收口走 fixed closeTask 服务（同一服务/证据：artifacts + 分支 tip）；桌面 close 适配器会在 B3
    // accepted 后自动呈 merge-main 卡（B3.1），本链由 `runFixedReleaseMerge` 单点呈卡以保持确定性
    // （桌面自动呈卡通道由 `b31-fixed-release-auto-desktop`/`b3-release-merge-desktop` 覆盖）。
    const b3ReportSha = sha(await fs.readFile(path.join(root, "docs", "quality", "snake-b3-report-v1.md")));
    const b3Closed = await closeTask({
      projectRoot: root, operationId: "op-close-b3", taskId: b3Task.taskId, outcome: "accepted", actorRoleId: "convener",
      evidence: {
        artifacts: [{ path: "docs/quality/snake-b3-report-v1.md", sha256: b3ReportSha, kind: "report-evidence" }],
        branchTipOid: b3Tip,
      },
    });
    assert.equal(b3Closed.ok, true, b3Closed.ok === false ? `${b3Closed.code}: ${b3Closed.message}` : "");
    assert.equal(b3Closed.stageCompleted, true, "B3 完成于 accepted + 分支 tip");
    await closeStageRequest(h, root, chief, "B3", "B3 完成");

    // 4) B4：发布前置 = B3 accepted + 运营报告（**不要求 A12b/归档**）→ merge-main 客户本人确认 → 合并。
    assert.equal((await view(root, WF)).stages.B3.status, "completed");
    assert.equal((await readWorkflowLedger(root)).events.some((event) => event.workflowId === WF && "stage" in event && event.stage === "A12"), false, "路径 B 无 A12");
    const release = await h.mgr.runFixedReleaseMerge({
      projectRoot: root, workflowId: WF, operationId: "op-release-b4", summary: "修复交付",
      evidence: [{ path: "docs/quality/snake-b3-report-v1.md", sha256: b3ReportSha }],
    });
    assert.equal(release.ok, true, release.message);
    assert.equal(release.merged, true);
    assert.equal(h.requests.length, 1, "路径 B 只在发布时弹一张 merge-main 卡");
    assert.equal(h.requests[0]!.cardKind, MERGE_MAIN_CARD_KIND);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), "main");
    assert.doesNotThrow(() => execFileSync("git", ["merge-base", "--is-ancestor", `refs/heads/${taskBranchName(WF)}`, "refs/heads/main"], { cwd: root, stdio: "ignore" }));
    assert.equal(await fs.readFile(path.join(root, "src", "core", "snake.ts"), "utf8"), "export const SNAKE = 2;\n", "main 工作区含修复");
    assert.equal(git(root, "tag"), "");
    assert.equal(git(root, "remote"), "");
    await assert.rejects(fs.stat(path.join(root, "docs", "acceptance")), "路径 B 无 docs/acceptance 归档要求");
    const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
    assert.deepEqual(releases.map((event) => event.kind), ["release.requested", "release.confirmed", "release.merged"]);
    assert.equal((await view(root, WF)).closed?.outcome, "delivered");
    await assertNoLegacyWrites(root);
    // 路径 B 不重建角色/不写团队计划。
    assert.equal((await readWorkflowLedger(root)).events.some((event) => event.workflowId === WF && event.kind === "role.activated"), false);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 路径 B：无仓库 fail-closed ——————————————

test("路径 B 无既有 Git 仓库 ⇒ b-repository-required（不自动 init；零任务/零 basis/零卡）", async () => {
  const root = await tempRoot("ans-b5-chain-b-norepo-");
  const h = harness(root);
  try {
    const chief = await openRole(h, root, "chief");
    // B6.2 披露：无仓库用例同样保留既有 open + routeDispatch 入口；只断言应用层聊天入口为 fixed。
    assertFixedChiefChatEntry(chief);
    await assertChatEntryNoStateWrites(root);
    const live = liveSource(h.mgr, root, "chief", { turnId: "turn-b-norepo" });
    const b1Dispatch = await routeDispatch(h.mgr, root, "chief", {
      roleId: "convener", task: "推进 B1：影响面分析（无仓库）", flowId: FLOW,
      taskKind: "stage-request", workflowPath: "B", stage: "B1", workflowAction: "advance", sideEffect: "read-only",
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(b1Dispatch.ok, true, b1Dispatch.message ?? "");
    const convener = await openRole(h, root, "convener");
    const srB1 = await findOpenStageRequest(root, "B1");
    const convenerLive = liveSource(h.mgr, root, "convener", { taskId: srB1.taskId });
    const analysis = await routeDispatch(h.mgr, root, "convener", {
      roleId: "rapporteur", task: "影响面分析", flowId: FLOW, workflowId: srB1.created!.workflowId, stage: "B1", sideEffect: "read-only",
    }, convenerLive);
    releaseSource(h.mgr, convenerLive);
    assert.equal(analysis.ok, false);
    assert.match(analysis.message ?? "", /b-repository-required/);
    await assert.rejects(fs.stat(path.join(root, ".git")), "路径 B 不自动 git init");
    assert.equal([...(await readTaskState(root)).records.values()].some((record) => record.created?.to === "rapporteur"), false, "拒绝不产生任务");
    assert.equal((await readBasisLedger(root)).events.length, 0, "失败不写 basis");
    assert.equal(h.requests.length, 0, "失败不弹客户卡");
    // 旧账本未被触达。
    await assertNoLegacyWrites(root);
    // 幕僚 A 路径仍可用（同一空项目改走 A；无仓库由 A9 基线 git init 负责）——此处只验证 B 失败不污染配置/账本。
    assert.equal((await readWorkflowLedger(root)).events.filter((event) => event.kind === "workflow.started").length, 1);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

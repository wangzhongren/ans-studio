// test/桌面应用/b31-fixed-release-auto-desktop.test.ts
// T3「两条固定工作流路径」B3.1（2026-11-10，桌面窗口）：桌面收口——
// merge-main 自动呈卡触发 / `source:"stage-a10"` / A10 与意图 marker 去重。
//
// 覆盖（B1 AC-11/AC-13/AC-14/AC-20/AC-22、T-10/T-11；G-IR MF-IR-8）：
//   · A12b accepted（A13 前）/ 路径 B B3 accepted（B4 前）⇒ 应用**自动**调用 `prepareReleaseMerge`
//     并经应用自有通道呈现 `merge-main` 客户卡（客户卡、非判断、judge 只能转人工/拒绝）；
//     客户本人 approve ⇒ `executeReleaseMerge`（本地合并、不 push/tag）；拒绝/超时 ⇒ `release.rejected`；
//     已合并/已关闭幂等；同一 workflow/tip 不重复卡；
//   · 前置缺失：无 basis ⇒ B2.1（AC-19/T-08）A12a/A12b accepted 收口前 basis 复核 `basis-missing`
//     fail-closed（拒绝收口/完成，不写 task.closed/不归档）；归档缺失等前置缺失 ⇒
//     `release-workflow-not-ready` 如实回运营/幕僚，**不呈卡**、不写 release.requested（不弹注定失败卡）；
//   · fixed appointment `request.resolved` 原样落 `source:"stage-a10"` + `workflowId`/`stage:"A10"`；
//     legacy 任命决议无 source/workflowId 戳、保留 legacy roster 戳（legacy D3 读取方不接受 fixed 来源）；
//   · 去重：run-role 已 prepareIntent/finalizeIntent 时桌面复用/幂等（A3 requested 单次、意图 marker 单次、
//     finalize 双调 replay）；A10 `stage.requested` 由 run-role 单写，桌面不双写（A10 requested 单次）。
//
// 夹具：账本/真实临时 Git 仓库/假会话；不启动 Electron/真实模型；无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager, type SessionEventEnvelope } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  FIXED_RELEASE_TRIGGER_STAGES,
  isFixedReleaseTriggerStage,
} from "../../app/desktop/workflow.ts";
import {
  MERGE_MAIN_CARD_KIND,
  MERGE_MAIN_OPTION_IDS,
  mergeMainCardRequestId,
} from "../../app/desktop/customer-input.ts";
import { createDesktopBaselineGitPort } from "../../app/desktop/workflow-git.ts";
import {
  appendBasisEvent,
  appendWorkflowEvent,
  finalizeIntent,
  prepareIntent,
  readBasisLedger,
  readReleaseLedger,
  readWorkflowLedger,
  taskBranchName,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { governanceCardGroup, type CustomerInputOutcome, type CustomerInputRequest } from "../../src/model/runtime.ts";
import type { BasisEvent, RequestResolvedEvent, WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const WF = "wf-b31rel0000000000000000001";
const WF_B = "wf-b31rel0000000000000000002";
const AT = "2026-11-10T10:00:00.000Z";
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate: () => boolean | Promise<boolean>, label: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await tick();
  }
  assert.ok(await predicate(), label);
}

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

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
  customerInput?: (request: CustomerInputRequest, metadata?: unknown) => Promise<CustomerInputOutcome | null | undefined>;
  closeCreatedTaskFixed?: (input: { operationId: string; taskId: string; outcome: "accepted" | "rework" | "rejected"; note?: string }, signal?: AbortSignal) => Promise<unknown>;
  [key: string]: unknown;
}

interface H {
  mgr: SessionManager;
  inputs: CapturedInput[];
  requests: CustomerInputRequest[];
  events: SessionEventEnvelope[];
  script: (request: CustomerInputRequest) => CustomerInputOutcome;
}

function harness(root: string, script: (request: CustomerInputRequest) => CustomerInputOutcome): H {
  const inputs: CapturedInput[] = [];
  const requests: CustomerInputRequest[] = [];
  const events: SessionEventEnvelope[] = [];
  const state = { inputs, requests, events, script } as H;
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
    emitEvent: (envelope) => {
      events.push(envelope);
    },
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
  git(root, "config", "user.name", "B3.1 Test");
  git(root, "config", "user.email", "b31@test.local");
  git(root, "config", "core.autocrlf", "false");
}
function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
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
async function started(root: string, base: typeof BASE_A | typeof BASE_B, workflowId: string = WF): Promise<void> {
  await appendEvents(root, [{
    ...base, kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:${base.path}:${workflowId}`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }]);
}
/** 合法推进到 A11 完成 + A12b requested（A12b 收口 = 发布触发窗口）。 */
async function seedWorkflowToA12b(root: string): Promise<void> {
  await started(root, BASE_A);
  const events: WorkflowEvent[] = [];
  for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as WorkflowStage[]) {
    events.push(requested(BASE_A, WF, stage), completed(BASE_A, WF, stage));
  }
  events.push(requested(BASE_A, WF, "A12b"));
  await appendEvents(root, events);
}

async function seedTask(root: string, input: {
  taskId: string;
  from: "chief" | "convener";
  to: string;
  stage: WorkflowStage;
  workflowId?: string;
  taskKind?: "stage-request";
  sideEffect: "read-only" | "code";
}): Promise<void> {
  const event = taskEvent("task.created", {
    taskId: input.taskId,
    from: input.from,
    to: input.to,
    ...(input.workflowId !== undefined ? { workflowId: input.workflowId, flowId: FLOW, stage: input.stage } : {}),
    ...(input.taskKind !== undefined ? { taskKind: input.taskKind } : {}),
    text: `任务 ${input.taskId}`,
    sideEffect: input.sideEffect,
    idempotencyKey: `seed-task:${input.taskId}`,
  }, () => new Date(AT));
  const appended = await appendTaskEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}
async function seedReport(root: string, taskId: string, from: string, summary: string, evidence: string[]): Promise<void> {
  const event = taskEvent("task.reported", {
    taskId, from, status: "done", summary,
    ...(evidence.length > 0 ? { evidence } : {}),
  }, () => new Date(AT));
  const appended = await appendTaskEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
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

/** 名单校验所需完整文档集（modules/roster + roster 引用的 intent/proposal/architecture）。 */
async function seedRosterDocs(root: string): Promise<void> {
  await writeFile(root, "docs/proposals/snake-modules-v1.md", MODULES_TEXT);
  await writeFile(root, "docs/proposals/snake-roster-v1.md", ROSTER_TEXT);
  await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇\n---\n# 意图\n");
  await writeFile(root, "docs/intents/snake-intent.md", "---\nintentId: snake-intent\nflowId: snake\ngoal: 贪吃蛇\n---\n# 意图入口\n");
  await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\nintent: docs/product/snake-intent-v1.md\n---\n# 提案\n");
  await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\nproposal: docs/proposals/snake-proposal-v1.md\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
}

interface ReleaseRepo {
  mainOid: string;
  tipOid: string;
  branch: string;
  gitignoreSha256: string;
}

/** 真实临时仓库 + 任务分支提交 + 发布前置所需 basis.repo 快照（A/B 路径共用）。 */
async function seedReleaseRepo(root: string, workflowId: string, pathKind: "A" | "B"): Promise<ReleaseRepo> {
  initRepo(root);
  await writeFile(root, "src/app.ts", "line-1\nshared\nline-3\n");
  const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
  assert.equal(ensured.ok, true, ensured.ok === false ? ensured.message : "");
  if (!ensured.ok) throw new Error("gitignore");
  commitAll(root, "main base");
  const mainOid = git(root, "rev-parse", "HEAD");
  const branch = taskBranchName(workflowId);
  git(root, "switch", "-c", branch);
  await writeFile(root, "src/app.ts", "line-1\nshared\nline-3-changed\n");
  await writeFile(root, "src/new.ts", "new\n");
  const tipOid = commitAll(root, "task change");
  const basis: BasisEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${workflowId}:seed`, basisId: `bas-${workflowId}`, workflowId, flowId: FLOW,
    documents: [], teamPlan: null,
    repo: {
      state: pathKind === "B" ? "existing" : "initialized", branch,
      baseOid: mainOid, headOid: mainOid, mainUnborn: false,
      initialBranch: "main", ignorePolicy: "ans-v1", gitignoreSha256: ensured.sha256,
    },
    reviewRoleId: "verifier", operationId: pathKind === "B" ? `path-b:${workflowId}` : "op-basis-seed",
    reason: pathKind === "B" ? "path-b" : "baseline", recordedBy: "application",
  };
  const appended = await appendBasisEvent(root, basis);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  return { mainOid, tipOid, branch, gitignoreSha256: ensured.sha256 };
}

function customerApprove(): CustomerInputOutcome {
  return { outcome: "answered", value: { selected: [MERGE_MAIN_OPTION_IDS[0]!] } };
}
function customerReject(): CustomerInputOutcome {
  return { outcome: "answered", value: { selected: [MERGE_MAIN_OPTION_IDS[1]!] } };
}

interface AutoTriggerAccess {
  autoPresentFixedReleaseMerge(input: {
    projectRoot: string;
    workflowId: string;
    stage: "A12b" | "B3";
    taskId: string;
  }): Promise<{ status: string; code?: string; message: string; releaseId?: string; merged?: boolean }>;
}
function autoTriggerOf(mgr: SessionManager): AutoTriggerAccess["autoPresentFixedReleaseMerge"] {
  return (mgr as unknown as AutoTriggerAccess).autoPresentFixedReleaseMerge.bind(mgr) as AutoTriggerAccess["autoPresentFixedReleaseMerge"];
}

test("触发窗口纯函数：A12b/B3 触发、其余不触发；merge-main requestId 确定性（同一 workflow/tip 幂等）", () => {
  assert.deepEqual([...FIXED_RELEASE_TRIGGER_STAGES], ["A12b", "B3"]);
  assert.equal(isFixedReleaseTriggerStage("A12b"), true);
  assert.equal(isFixedReleaseTriggerStage("B3"), true);
  for (const other of ["A12a", "A12", "A13", "B4", "A11", undefined]) {
    assert.equal(isFixedReleaseTriggerStage(other), false, `${String(other)} 不应触发发布自动呈卡`);
  }
  assert.equal(mergeMainCardRequestId("rel-x"), "merge-main-rel-x");
});

test("意图卡去重：run-role 已 prepareIntent/marker ⇒ 桌面幂等（A3 requested 单次、marker 单次、finalize 双调 replay）", async () => {
  const root = await tempRoot("ans-b31-intent-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["confirm"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇\n---\n# 意图\n");
    await writeFile(root, "docs/intents/snake-intent.md", "---\nintentId: snake-intent\nflowId: snake\ngoal: 贪吃蛇\n---\n# 意图入口\n");
    await started(root, BASE_A);
    await appendEvents(root, [
      requested(BASE_A, WF, "A1"), completed(BASE_A, WF, "A1"),
      requested(BASE_A, WF, "A2"), completed(BASE_A, WF, "A2"),
    ]);
    // run-role B3.1：fixed intent-confirm 前调用同一个 prepareIntent（写 A3 requested + 生成 marker）。
    const prepared = await prepareIntent({ projectRoot: root, flowId: FLOW, workflowId: WF });
    assert.equal(prepared.ok, true, prepared.ok === false ? prepared.message : "");
    if (!prepared.ok) return;
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    assert.equal(typeof chief?.customerInput, "function");
    // run-role 已把 marker 追加到 question；桌面不得再追加一次（marker 单次）。
    const outcome = await chief!.customerInput!({
      kind: "choice",
      title: "确认产品意图",
      cardKind: "intent-confirm",
      flowId: FLOW,
      question: `确认意图（run-role context）\n${prepared.marker}`,
      options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修订" }],
    });
    assert.equal(outcome?.outcome, "answered");
    const presented = h.requests.find((request) => request.cardKind === "intent-confirm");
    assert.ok(presented !== undefined);
    const requestQuestion = (presented as { question?: unknown }).question;
    const cardText = `${typeof requestQuestion === "string" ? requestQuestion : ""}\n${presented!.preview ?? ""}`;
    const markerCount = cardText.split("[ans-intent-evidence ").length - 1;
    assert.equal(markerCount, 1, "意图 marker 单次（run-role 已追加，桌面不重复）");
    // A3 requested 单次（桌面 prepareIntent 复用幂等，不重复写 stage.requested）。
    const tasks = await readTaskState(root);
    const resolved = tasks.events.find((event): event is RequestResolvedEvent =>
      event.kind === "request.resolved" && event.cardKind === "intent-confirm");
    assert.ok(resolved !== undefined);
    assert.equal(resolved!.workflowId, WF);
    assert.equal(resolved!.stage, "A3");
    const a3Requested = (await readWorkflowLedger(root)).events.filter((event) =>
      event.workflowId === WF && event.kind === "stage.requested" && event.stage === "A3");
    assert.equal(a3Requested.length, 1, "stage.requested A3 单次");
    const a3Completed = (await readWorkflowLedger(root)).events.filter((event) =>
      event.workflowId === WF && event.kind === "stage.completed" && event.stage === "A3");
    assert.equal(a3Completed.length, 1, "桌面 finalizeIntent 后 A3 completed 单次");
    // run-role 随后再次 finalize 同一 request.resolved ⇒ replay（不重复 stage.completed A3）。
    const replayed = await finalizeIntent({ projectRoot: root, event: resolved!, workflowId: WF, flowId: FLOW });
    assert.equal(replayed.ok, true, replayed.ok === false ? replayed.message : "");
    if (replayed.ok) assert.equal(replayed.replay, true);
    const a3CompletedAfter = (await readWorkflowLedger(root)).events.filter((event) =>
      event.workflowId === WF && event.kind === "stage.completed" && event.stage === "A3");
    assert.equal(a3CompletedAfter.length, 1, "finalizeIntent 双调幂等（不双写 stage.completed A3）");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed 任命卡：resolved 原样落 source:\"stage-a10\" + workflowId/stage A10；A10 requested 单次（桌面不双写）", async () => {
  const root = await tempRoot("ans-b31-appoint-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["qa-project"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedRosterDocs(root);
    await started(root, BASE_A);
    const events: WorkflowEvent[] = [];
    for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"] as WorkflowStage[]) {
      events.push(requested(BASE_A, WF, stage), completed(BASE_A, WF, stage));
    }
    // run-role B3.1：呈任命卡前写 `stage.requested A10`（幂等键 stage-request:<wf>:A10:1）。
    events.push(requested(BASE_A, WF, "A10"));
    await appendEvents(root, events);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "任命实现角色", cardKind: "appointment", flowId: FLOW, multiple: true,
      options: [{ id: "qa-project", label: "Project QA" }],
    });
    assert.equal(outcome?.outcome, "answered", JSON.stringify(outcome));
    const tasks = await readTaskState(root);
    const resolved = tasks.events.find((event): event is RequestResolvedEvent =>
      event.kind === "request.resolved" && event.cardKind === "appointment");
    assert.ok(resolved !== undefined);
    assert.equal(resolved!.source, "stage-a10", "fixed 任命决议原样落 source:\"stage-a10\"");
    assert.equal(resolved!.workflowId, WF);
    assert.equal(resolved!.stage, "A10");
    assert.deepEqual(resolved!.targetRoleIds, ["qa-project"]);
    assert.equal(resolved!.rosterVersion, undefined, "fixed 决议不带 legacy roster 戳");
    assert.equal(resolved!.rosterSha256, undefined);
    // A10 requested 单次（桌面只绑定卡面，不写 stage.requested）；A10 completed 单次。
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) =>
      event.workflowId === WF && event.kind === "stage.requested" && event.stage === "A10").length, 1);
    assert.equal(ledger.events.filter((event) =>
      event.workflowId === WF && event.kind === "stage.completed" && event.stage === "A10").length, 1);
    const view = deriveWorkflowView(ledger.events.filter((event) => event.workflowId === WF), tasks.events);
    assert.equal(view.stages.A10.status, "completed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("A12b accepted ⇒ 自动呈 merge-main（客户卡/非判断）→ 客户本人 approve ⇒ 本地合并 + workflow.closed delivered；同 tip 不重复卡", async () => {
  const root = await tempRoot("ans-b31-a12b-merge-");
  const h = harness(root, () => customerApprove());
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedWorkflowToA12b(root);
    const repo = await seedReleaseRepo(root, WF, "A");
    // A12a criteria / A12b report 证据（docs/quality 被 ans .gitignore 忽略 ⇒ 工作区 clean）。
    const criteriaPath = "docs/quality/snake-criteria-v1.md";
    const reportPath = "docs/quality/snake-report-v1.md";
    await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
    await writeFile(root, reportPath, "# Report\n\n结论：通过。\n");
    await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
    await seedReport(root, "t-a12a", "verifier", "criteria 完成", [criteriaPath]);
    await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
    await seedReport(root, "t-a12b", "verifier", "独立验收通过", [reportPath]);
    const opened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "") : "");
    const chief = h.inputs.find((input) => input.roleId === "chief");
    assert.equal(typeof chief?.closeCreatedTaskFixed, "function");
    const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-auto-1", taskId: "t-a12b", outcome: "accepted", note: "幕僚决定：通过" });
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    assert.equal((closed as { stageCompleted?: boolean }).stageCompleted, true);
    // 自动呈卡（异步）→ 客户卡 = merge-main（非判断、app-owned）→ 客户 approve ⇒ 本地合并。
    await until(() => (h.mgr as unknown as { fixedPanelState(root: string): Promise<{ workflow?: { closed?: string } }> })
      .fixedPanelState(root).then((state) => state.workflow?.closed === "delivered").catch(() => false), "A12b accepted 后应自动合并并关闭 workflow");
    assert.equal(h.requests.length, 1, "应自动呈一张 merge-main 卡");
    const card = h.requests[0]!;
    assert.equal(card.cardKind, MERGE_MAIN_CARD_KIND);
    assert.equal(card.application, true);
    assert.equal(card.kind, "choice");
    assert.equal(governanceCardGroup(MERGE_MAIN_CARD_KIND), undefined, "merge-main 不进 GOVERNANCE_CARD_GROUP（非判断卡）");
    assert.deepEqual(card.options?.map((option) => option.id), [...MERGE_MAIN_OPTION_IDS]);
    assert.match(card.preview ?? "", new RegExp(WF));
    assert.match(card.preview ?? "", new RegExp(repo.tipOid));
    assert.match(card.preview ?? "", new RegExp(repo.mainOid));
    // release 账本：requested → confirmed(by customer) → merged；不 push/tag；工作区停在 main。
    const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
    assert.deepEqual(releases.map((event) => event.kind), ["release.requested", "release.confirmed", "release.merged"]);
    const confirmed = releases.find((event) => event.kind === "release.confirmed");
    assert.ok(confirmed !== undefined && confirmed.kind === "release.confirmed" && confirmed.by === "customer");
    const merged = releases.find((event) => event.kind === "release.merged");
    assert.ok(merged !== undefined && merged.kind === "release.merged" && merged.tipOid.hex === repo.tipOid);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), "main", "合并后工作区停在 main");
    assert.doesNotThrow(() =>
      execFileSync("git", ["merge-base", "--is-ancestor", `refs/heads/${repo.branch}`, "refs/heads/main"], { cwd: root }));
    assert.equal(git(root, "tag"), "");
    assert.equal(git(root, "remote"), "");
    // A13 只请求一次；merge-main request 事件由应用落账（客户本人）。
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) =>
      event.workflowId === WF && event.kind === "stage.requested" && event.stage === "A13").length, 1);
    const tasks = await readTaskState(root);
    const requestCreated = tasks.events.find((event) =>
      event.kind === "request.created" && event.cardKind === MERGE_MAIN_CARD_KIND);
    assert.ok(requestCreated !== undefined && requestCreated.kind === "request.created" && requestCreated.sourceRoleId === "application");
    const requestResolved = tasks.events.find((event) =>
      event.kind === "request.resolved" && event.cardKind === MERGE_MAIN_CARD_KIND);
    assert.ok(requestResolved !== undefined && requestResolved.kind === "request.resolved" && requestResolved.by === "customer");
    // 已合并幂等：同一 workflow/tip 再触发 ⇒ 不重复卡（no-op）。
    const again = await autoTriggerOf(h.mgr)({ projectRoot: root, workflowId: WF, stage: "A12b", taskId: "t-a12b" });
    assert.equal(again.status, "skipped");
    assert.equal(h.requests.length, 1, "已合并后不得重复呈卡");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("A12b accepted ⇒ 客户拒绝：release.rejected by customer、不合并；同 workflow/tip 再触发不重复卡", async () => {
  const root = await tempRoot("ans-b31-a12b-reject-");
  const h = harness(root, () => customerReject());
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedWorkflowToA12b(root);
    const repo = await seedReleaseRepo(root, WF, "A");
    const criteriaPath = "docs/quality/snake-criteria-v1.md";
    const reportPath = "docs/quality/snake-report-v1.md";
    await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
    await writeFile(root, reportPath, "# Report\n\n结论：通过。\n");
    await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
    await seedReport(root, "t-a12a", "verifier", "criteria", [criteriaPath]);
    await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
    await seedReport(root, "t-a12b", "verifier", "验收通过", [reportPath]);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-rej-1", taskId: "t-a12b", outcome: "accepted" });
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    await until(async () => (await readReleaseLedger(root)).events.some((event) => event.kind === "release.rejected"), "客户拒绝应记 release.rejected");
    const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
    assert.deepEqual(releases.map((event) => event.kind), ["release.requested", "release.rejected"]);
    const rejected = releases.find((event) => event.kind === "release.rejected");
    assert.ok(rejected !== undefined && rejected.kind === "release.rejected" && rejected.by === "customer");
    assert.equal(releases.some((event) => event.kind === "release.confirmed" || event.kind === "release.merged"), false);
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch, "拒绝不合并（仍在任务分支）");
    assert.equal(h.requests.length, 1);
    // 同一 workflow/tip 再次触发：卡已呈过（request 事件在案）⇒ 不重复卡、不重复 requested。
    const again = await autoTriggerOf(h.mgr)({ projectRoot: root, workflowId: WF, stage: "A12b", taskId: "t-a12b" });
    assert.equal(again.status, "skipped", JSON.stringify(again));
    assert.equal(h.requests.length, 1, "同一 workflow/tip 不重复卡");
    const releasesAfter = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
    assert.equal(releasesAfter.filter((event) => event.kind === "release.requested").length, 1, "不重复写 release.requested");
    assert.equal(releasesAfter.some((event) => event.kind === "release.confirmed" || event.kind === "release.merged"), false);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("A12b accepted ⇒ judge 转人工/拒绝 ⇒ release.rejected by judge；judge approve 尝试不写终态、不合并", async () => {
  // judge declined（转人工/拒绝）
  {
    const root = await tempRoot("ans-b31-a12b-judge-");
    const h = harness(root, () => ({ outcome: "declined", operatorId: "judge:pi", reason: "judge 转人工" }));
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedWorkflowToA12b(root);
      const repo = await seedReleaseRepo(root, WF, "A");
      const criteriaPath = "docs/quality/snake-criteria-v1.md";
      const reportPath = "docs/quality/snake-report-v1.md";
      await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
      await writeFile(root, reportPath, "# Report\n\n通过\n");
      await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
      await seedReport(root, "t-a12a", "verifier", "criteria", [criteriaPath]);
      await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
      await seedReport(root, "t-a12b", "verifier", "通过", [reportPath]);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
      const chief = h.inputs.find((input) => input.roleId === "chief");
      const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-judge-1", taskId: "t-a12b", outcome: "accepted" });
      assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
      await until(async () => (await readReleaseLedger(root)).events.some((event) => event.kind === "release.rejected"), "judge 拒绝应记 release.rejected");
      const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
      const rejected = releases.find((event) => event.kind === "release.rejected");
      assert.ok(rejected !== undefined && rejected.kind === "release.rejected" && rejected.by === "judge");
      assert.equal(releases.some((event) => event.kind === "release.confirmed" || event.kind === "release.merged"), false);
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // judge approve 尝试（answered + judge 审计）：不授权、不写 confirmed/rejected/merged，保持等待。
  {
    const root = await tempRoot("ans-b31-a12b-judge-approve-");
    const h = harness(root, () => ({
      outcome: "answered",
      value: { selected: [MERGE_MAIN_OPTION_IDS[0]!] },
      operatorId: "judge:pi",
      judge: { engine: "pi", reasonCode: "approve", cardKind: "merge-main", group: "decision" } as never,
    }));
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedWorkflowToA12b(root);
      const repo = await seedReleaseRepo(root, WF, "A");
      const criteriaPath = "docs/quality/snake-criteria-v1.md";
      const reportPath = "docs/quality/snake-report-v1.md";
      await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
      await writeFile(root, reportPath, "# Report\n\n通过\n");
      await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
      await seedReport(root, "t-a12a", "verifier", "criteria", [criteriaPath]);
      await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
      await seedReport(root, "t-a12b", "verifier", "通过", [reportPath]);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
      const chief = h.inputs.find((input) => input.roleId === "chief");
      const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-judge-approve-1", taskId: "t-a12b", outcome: "accepted" });
      assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
      await until(async () => {
        const tasks = await readTaskState(root);
        return tasks.events.some((event) => event.kind === "request.resolved" && event.cardKind === MERGE_MAIN_CARD_KIND);
      }, "judge approve 尝试应完成卡面结算（request.resolved）");
      await tick(100);
      const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF);
      assert.equal(releases.some((event) => event.kind === "release.confirmed" || event.kind === "release.merged"), false, "judge 不得代批");
      assert.equal(releases.some((event) => event.kind === "release.rejected"), false, "judge approve 尝试不写任何终态");
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch);
      assert.equal(h.requests.length, 1);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("前置缺失不呈卡：A12b accepted 但无 basis ⇒ basis-missing 拒绝收口/完成；归档缺失触发仍如实回运营/幕僚；rework 收口不触发", async () => {
  // 无 basis：B2.1（AC-19/T-08）A12a/A12b accepted 收口前 basis 复核 fail-closed ⇒ 拒绝收口/完成
  // （不写 task.closed、不归档、不弹卡）；直接触发自动呈卡时前置缺失（归档缺失）仍如实回运营/幕僚。
  {
    const root = await tempRoot("ans-b31-notready-");
    const h = harness(root, () => customerApprove());
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedWorkflowToA12b(root);
      initRepo(root);
      await writeFile(root, "src/app.ts", "base\n");
      const ensured = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
      assert.equal(ensured.ok, true);
      commitAll(root, "base");
      git(root, "switch", "-c", taskBranchName(WF));
      await writeFile(root, "src/new.ts", "new\n");
      commitAll(root, "task");
      const criteriaPath = "docs/quality/snake-criteria-v1.md";
      const reportPath = "docs/quality/snake-report-v1.md";
      await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
      await writeFile(root, reportPath, "# Report\n\n通过\n");
      await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
      await seedReport(root, "t-a12a", "verifier", "criteria", [criteriaPath]);
      await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
      await seedReport(root, "t-a12b", "verifier", "通过", [reportPath]);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
      const chief = h.inputs.find((input) => input.roleId === "chief");
      const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-nobasis-1", taskId: "t-a12b", outcome: "accepted" });
      assert.equal((closed as { ok: boolean }).ok, false, "无 basis 不得 accepted 收口");
      assert.equal((closed as { code?: string }).code, "basis-missing", JSON.stringify(closed));
      const taskState = await readTaskState(root);
      assert.equal(taskState.events.some((event) => event.kind === "task.closed" && event.taskId === "t-a12b"), false, "拒绝收口不得写 task.closed");
      const view = deriveWorkflowView(
        (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
        taskState.events,
      );
      assert.equal(view.stages.A12b.status, "requested", "A12b 保持未完成");
      assert.equal(h.requests.length, 0, "拒绝收口不得呈卡");
      assert.equal((await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF).length, 0, "不写 release.requested");
      // 直接触发自动呈卡（模拟已 accepted）：归档缺失 ⇒ release-workflow-not-ready，如实回运营/幕僚、不呈卡。
      await appendEvents(root, [completed(BASE_A, WF, "A12b")]);
      const trigger = await autoTriggerOf(h.mgr)({ projectRoot: root, workflowId: WF, stage: "A12b", taskId: "t-a12b" });
      assert.equal(trigger.status, "not-ready", JSON.stringify(trigger));
      assert.equal(trigger.code, "release-workflow-not-ready");
      await until(() => h.events.some((envelope) =>
        envelope.event.kind === "message"
        && typeof (envelope.event as { summary?: unknown }).summary === "string"
        && String((envelope.event as { summary?: string }).summary).includes("merge-main 未呈卡")), "前置缺失应如实回运营/幕僚");
      assert.equal(h.requests.length, 0, "前置缺失不得呈卡");
      assert.equal((await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF).length, 0, "不写 release.requested");
      // 目标角色 = 运营/幕僚。
      const roles = h.events.filter((envelope) => envelope.event.kind === "message").map((envelope) => envelope.roleId);
      assert.equal(roles.includes("convener") || roles.includes("chief"), true, "回运营/幕僚");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // A12b 尚未 accepted（rework 收口）：不触发自动呈卡。
  {
    const root = await tempRoot("ans-b31-rework-");
    const h = harness(root, () => customerApprove());
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedWorkflowToA12b(root);
      const repo = await seedReleaseRepo(root, WF, "A");
      await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
      await seedReport(root, "t-a12b", "verifier", "未通过", []);
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-a12b" });
      const chief = h.inputs.find((input) => input.roleId === "chief");
      const closed = await chief!.closeCreatedTaskFixed!({ operationId: "op-close-a12b-rework-1", taskId: "t-a12b", outcome: "rework" });
      assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
      assert.equal((closed as { stageCompleted?: boolean }).stageCompleted, false);
      await tick(150);
      assert.equal(h.requests.length, 0, "A12b 未 accepted 不触发 merge-main");
      assert.equal((await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF).length, 0);
      assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), repo.branch);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("路径 B：B3 accepted（+运营报告）⇒ 自动呈 merge-main；客户 approve ⇒ 合并 + 交付关闭（不要求 A12b/归档）", async () => {
  const root = await tempRoot("ans-b31-b3-merge-");
  const h = harness(root, () => customerApprove());
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await started(root, BASE_B, WF_B);
    await appendEvents(root, [
      requested(BASE_B, WF_B, "B1"), completed(BASE_B, WF_B, "B1"),
      requested(BASE_B, WF_B, "B2"),
      {
        ...BASE_B, kind: "change.scope-decided", workflowId: WF_B, flowId: FLOW,
        idempotencyKey: `scope:${WF_B}:seed:seed`,
        impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: "b".repeat(64) },
        scope: { summary: "只改核心模块", files: ["src/app.ts"] },
        effectiveWritesets: [{ roleId: "worker", paths: ["src/app.ts"] }],
        decidedBy: "chief", requestTaskId: "t-b2",
      },
      requested(BASE_B, WF_B, "B3"),
    ]);
    const repo = await seedReleaseRepo(root, WF_B, "B");
    // 运营最终报告在案（B4 前置；不要求 A12b/归档）。
    await seedTask(root, { taskId: "t-op-report", from: "chief", to: "convener", workflowId: WF_B, stage: "B1", taskKind: "stage-request", sideEffect: "read-only" });
    await seedReport(root, "t-op-report", "convener", "运营汇总报告", []);
    // B3 实现任务（convener 创建 ⇒ convener 收口）+ 报告证据（真实文件，docs/quality 被忽略）。
    const b3Report = "docs/quality/snake-b3-report-v1.md";
    await writeFile(root, b3Report, "# B3 Report\n\n实现完成。\n");
    await seedTask(root, { taskId: "t-b3", from: "convener", to: "worker", workflowId: WF_B, stage: "B3", sideEffect: "code" });
    await seedReport(root, "t-b3", "worker", "实现完成", [b3Report]);
    const opened = await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo", taskId: "t-b3" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "") : "");
    const convener = h.inputs.find((input) => input.roleId === "convener");
    assert.equal(typeof convener?.closeCreatedTaskFixed, "function");
    const closed = await convener!.closeCreatedTaskFixed!({ operationId: "op-close-b3-auto-1", taskId: "t-b3", outcome: "accepted" });
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    assert.equal((closed as { stageCompleted?: boolean }).stageCompleted, true);
    await until(async () => {
      const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF_B);
      return releases.some((event) => event.kind === "release.merged");
    }, "B3 accepted 后应自动呈 merge-main 并由客户确认合并");
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0]!.cardKind, MERGE_MAIN_CARD_KIND);
    assert.match(h.requests[0]!.preview ?? "", new RegExp(WF_B));
    const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF_B);
    assert.deepEqual(releases.map((event) => event.kind), ["release.requested", "release.confirmed", "release.merged"]);
    const confirmed = releases.find((event) => event.kind === "release.confirmed");
    assert.ok(confirmed !== undefined && confirmed.kind === "release.confirmed" && confirmed.by === "customer");
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF_B),
      (await readTaskState(root)).events,
    );
    assert.equal(view.closed?.outcome, "delivered");
    assert.equal(git(root, "symbolic-ref", "--short", "HEAD"), "main");
    assert.equal(git(root, "tag"), "");
    assert.equal(git(root, "remote"), "");
    // B4 requested 单次（prepareReleaseMerge 应用推进）。
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) =>
      event.workflowId === WF_B && event.kind === "stage.requested" && event.stage === "B4").length, 1);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("legacy 任命卡不变：无 source/workflowId 戳、保留 legacy roster 戳（legacy D3 读取方不接受 fixed 来源）", async () => {
  const root = await tempRoot("ans-b31-legacy-appoint-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["qa-project"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
    await seedRosterDocs(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "任命实现角色", cardKind: "appointment", flowId: FLOW,
      options: [{ id: "qa-project", label: "Project QA" }],
    });
    assert.equal(outcome?.outcome, "answered", JSON.stringify(outcome));
    const tasks = await readTaskState(root);
    const resolved = tasks.events.find((event): event is RequestResolvedEvent =>
      event.kind === "request.resolved" && event.cardKind === "appointment");
    assert.ok(resolved !== undefined);
    assert.equal(resolved!.source, undefined, "legacy 任命决议不得带 fixed source 戳");
    assert.equal(resolved!.workflowId, undefined, "legacy 任命决议不带 workflowId 戳");
    assert.equal(resolved!.rosterVersion, 1, "legacy 保留 roster 版本戳（D3 读取方口径不变）");
    assert.equal(resolved!.rosterSha256, sha(ROSTER_TEXT));
    assert.equal((await readWorkflowLedger(root)).events.length, 0, "legacy 路径不写 fixed workflow 账本");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// test/桌面应用/b21-basis-gate-desktop.test.ts
// T3「两条固定工作流路径」B2.1（2026-11-10，桌面窗口）：**desktop basis 接线**（MF-B2-02 收口）。
//
// 覆盖（B1 v1.1 AC-19/T-08；B2 预验收 MF-B2-02；编排 B2.1 §六签名）：
//   · A12a/A12b：fixed verifier 的 criteria/report 收口（`close_created_task` accepted / A12b
//     应用验收归档）**前**调用 `verifyBasisForStage`——drift/缺失 ⇒ `basis-drift`/`basis-missing`
//     fail-closed 拒绝收口/完成（不写 task.closed、不生成归档、不伪造 verified）；一致 ⇒ 关键门
//     按 v1.3 §7.2 G-9 节流入账 `basis.verified`（同 basis+同文档摘要只记一次）；A12a/A12b
//     直派不经 convener 派发 basis 门也覆盖；同 operationId 幂等 replay 不重复复核。
//   · A11/B1/B3：既有派发前 `verifyBasisForWorkflow` 调用补 `stage` ⇒ 一致时 `basis.verified`
//     入账（节流），drift/缺失照旧 fail-closed 拒绝派发（不创建任务）；B1 由既有路径 B 夹具
//     （b3-fixed-baseline-pathb）断言 verified 入账，本文件覆盖 A11/B3 的 verified/节流/drift/缺失。
//   · legacy：legacy 会话不注入 fixed close（`closeCreatedTaskFixed` 缺席）、legacy close 照旧注入；
//     不写 basis 账本。
//
// 夹具：真实账本/服务 + 假会话（不启动 Electron/真实模型）；确定性；无新增 skip/force-exit；
// 不改 legacy 断言。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager, type SessionEventEnvelope } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  appendBasisEvent,
  appendWorkflowEvent,
  readBasisLedger,
  readWorkflowLedger,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type {
  BasisEvent,
  CustomerInputOutcome,
  CustomerInputRequest,
  DispatchReceipt,
  DispatchTaskPayload,
  WorkflowEvent,
  WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const WF = "wf-b21basis000000000000000001";
const WF2 = "wf-b21basis000000000000000002";
const AT = "2026-11-10T10:00:00.000Z";
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate: () => boolean, label: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await tick();
  }
  assert.ok(predicate(), label);
}

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

// —————————————— 假会话夹具（真实 SessionManager/服务/账本） ——————————————

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
  closeCreatedTask?: (input: unknown, signal?: AbortSignal) => Promise<unknown>;
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

function harness(root: string, script: (request: CustomerInputRequest) => CustomerInputOutcome = () => ({ outcome: "declined", reason: "test" })): H {
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
  (entry! as { busy: boolean }).busy = true;
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
  source: LiveSource,
): Promise<DispatchReceipt> {
  const manager = mgr as unknown as {
    routeDispatch(projectRoot: string, runtime: "demo", fromRoleId: string, d: DispatchTaskPayload, source?: LiveSource): Promise<DispatchReceipt>;
  };
  return manager.routeDispatch(root, "demo", fromRoleId, payload, source);
}

// —————————————— 文件/仓库夹具 ——————————————

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

// —————————————— 账本/任务/依据夹具 ——————————————

const BASE_A = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
const BASE_B = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "B" as const };

async function appendEvents(root: string, events: readonly WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

async function seedStarted(root: string, workflowId: string, workflowPath: "A" | "B" = "A"): Promise<void> {
  await appendEvents(root, [{
    ...(workflowPath === "A" ? BASE_A : BASE_B),
    kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:${workflowPath}:${workflowId}`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }]);
}

function requested(workflowId: string, stage: WorkflowStage, attempt = 1, base: typeof BASE_A | typeof BASE_B = BASE_A): WorkflowEvent {
  return {
    ...base, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: "a".repeat(64), attempt,
  };
}
function completed(workflowId: string, stage: WorkflowStage, base: typeof BASE_A | typeof BASE_B = BASE_A): WorkflowEvent {
  return {
    ...base, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}

/** 预置一份 basis（documents = 现存项目文件，path+sha256+bytes 由应用重算；不漂移）。 */
async function seedBasis(
  root: string,
  workflowId: string,
  documentPaths: readonly string[] = [],
): Promise<BasisEvent> {
  const documents = [];
  for (const rel of documentPaths) {
    const bytes = await fs.readFile(path.join(root, ...rel.split("/")));
    documents.push({ kind: "spec", path: rel, version: 1, sha256: sha(bytes), bytes: bytes.byteLength });
  }
  const event: BasisEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${workflowId}:seed`, basisId: `bas-${workflowId}`, workflowId, flowId: FLOW,
    documents, teamPlan: null,
    reviewRoleId: "verifier", operationId: `op-basis-${workflowId}`, reason: "baseline", recordedBy: "application",
  };
  const appended = await appendBasisEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  return event;
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

async function openRole(h: H, root: string, roleId: string, taskId?: string): Promise<CapturedInput> {
  const opened = await h.mgr.open({ projectRoot: root, roleId, runtime: "demo", ...(taskId !== undefined ? { taskId } : {}) });
  assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "") : "");
  const input = h.inputs.find((entry) => entry.roleId === roleId);
  assert.ok(input, `应捕获 openRoleSession(${roleId})`);
  return input!;
}

/** A 路径预置：A1..A10 completed + A12a requested（先收口 criteria；随后 A11 completed + A12b requested）。 */
async function seedA12Fixture(root: string, workflowId: string): Promise<void> {
  await seedStarted(root, workflowId, "A");
  const events: WorkflowEvent[] = [];
  for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as WorkflowStage[]) {
    events.push(requested(workflowId, stage), completed(workflowId, stage));
  }
  events.push(requested(workflowId, "A12a"));
  await appendEvents(root, events);
}

// ══════════════════════════════ A12a/A12b：basis 复核（AC-19/T-08） ══════════════════════════════

test("A12a/A12b accepted 收口：basis 一致 ⇒ 阶段完成/归档 + basis.verified 关键门节流（同 basis 只记一次）", async () => {
  const root = await tempRoot("ans-b21-a12-ok-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    const basisDoc = "docs/basis/snake-basis-v1.md";
    await writeFile(root, basisDoc, "# Basis\n\n冻结依据。\n");
    await seedBasis(root, WF, [basisDoc]);
    await seedA12Fixture(root, WF);
    const criteriaPath = "docs/quality/snake-criteria-v1.md";
    const reportPath = "docs/quality/snake-report-v1.md";
    await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
    await writeFile(root, reportPath, "# Report\n\n结论：通过。\n");
    await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
    await seedReport(root, "t-a12a", "verifier", "criteria 完成", [criteriaPath]);
    await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
    await seedReport(root, "t-a12b", "verifier", "独立验收通过", [reportPath]);
    const chief = await openRole(h, root, "chief", "t-a12a");
    assert.equal(typeof chief.closeCreatedTaskFixed, "function", "fixed 会话应注入 close_created_task v2 应用实现");

    // A12a criteria 收口（accepted）⇒ 应用先 verifyBasisForStage(A12a)（一致）再按既有 closeTask 流程。
    const criteriaClosed = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-close-a12a-1", taskId: "t-a12a", outcome: "accepted" });
    assert.equal((criteriaClosed as { ok: boolean }).ok, true, JSON.stringify(criteriaClosed));
    assert.equal((criteriaClosed as { stageCompleted?: boolean }).stageCompleted, true);
    let verified = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified");
    assert.equal(verified.length, 1, "A12a 关键门一致 ⇒ basis.verified 入账一次");
    const verifiedEvent = verified[0]!;
    assert.equal(verifiedEvent.kind === "basis.verified" && verifiedEvent.basisId, `bas-${WF}`);
    if (verifiedEvent.kind === "basis.verified") {
      assert.equal(verifiedEvent.ok, true);
      assert.deepEqual(verifiedEvent.documents, [{ path: basisDoc, sha256: sha(await fs.readFile(path.join(root, ...basisDoc.split("/")))), ok: true }]);
    }

    // A11 完成后推进 A12b；同 basis+同摘要 ⇒ 节流不重复入账，收口/归档照旧。
    await appendEvents(root, [requested(WF, "A11"), completed(WF, "A11"), requested(WF, "A12b")]);
    const closed = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-close-a12b-1", taskId: "t-a12b", outcome: "accepted", note: "幕僚决定：通过" });
    assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
    assert.equal((closed as { stageCompleted?: boolean }).stageCompleted, true);
    // A12b accepted 触发自动呈卡（异步）；本夹具无 Git 仓库 ⇒ 前置缺失如实回运营/幕僚（等待完成后再断言/清理）。
    await until(() => h.events.some((envelope) =>
      envelope.event.kind === "message"
      && typeof (envelope.event as { summary?: unknown }).summary === "string"
      && String((envelope.event as { summary?: string }).summary).includes("merge-main 未呈卡")), "自动呈卡前置缺失应如实回报");
    assert.equal(h.requests.length, 0, "前置缺失不呈卡");
    verified = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified");
    assert.equal(verified.length, 1, "同 basis+同 documents digest ⇒ 节流入账（A12b 不重复记）");
    const archive = "docs/acceptance/snake-acceptance-v1.md";
    const archiveText = await fs.readFile(path.join(root, ...archive.split("/")), "utf8");
    assert.match(archiveText, new RegExp(`workflowId: ${WF}`));
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      (await readTaskState(root)).events,
    );
    assert.equal(view.stages.A12a.status, "completed");
    assert.equal(view.stages.A12b.status, "completed");
    assert.equal(view.stages.A12.status, "completed");
    // 幂等 replay：同 operationId 再次收口 ⇒ closeTask 原样 replay（不重复 basis 复核/不重复事件）。
    const replay = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-close-a12b-1", taskId: "t-a12b", outcome: "accepted", note: "幕僚决定：通过" });
    assert.equal((replay as { ok: boolean }).ok, true);
    assert.equal((replay as { replay?: boolean }).replay, true);
    assert.equal((await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified").length, 1);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("A12a drift ⇒ 拒绝收口/完成（basis-drift + basis.drift 落账；不写 task.closed）；恢复后可收口；rework 收口不在本门范围", async () => {
  const root = await tempRoot("ans-b21-a12-drift-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    const basisDoc = "docs/basis/snake-basis-v1.md";
    await writeFile(root, basisDoc, "# Basis\n\nv1。\n");
    const recordedSha = sha(await fs.readFile(path.join(root, ...basisDoc.split("/"))));
    await seedBasis(root, WF, [basisDoc]);
    await seedA12Fixture(root, WF);
    const criteriaPath = "docs/quality/snake-criteria-v1.md";
    await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
    await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
    await seedReport(root, "t-a12a", "verifier", "criteria 完成", [criteriaPath]);
    const chief = await openRole(h, root, "chief", "t-a12a");

    // 依据文档同路径改字节 ⇒ drift：收口前复核 fail-closed（拒绝收口/完成，不伪造 verified）。
    await writeFile(root, basisDoc, "# Basis\n\nv2（漂移）。\n");
    const driftedSha = sha(await fs.readFile(path.join(root, ...basisDoc.split("/"))));
    const drifted = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-close-a12a-drift", taskId: "t-a12a", outcome: "accepted" });
    assert.equal((drifted as { ok: boolean }).ok, false);
    assert.equal((drifted as { code?: string }).code, "basis-drift");
    const driftEvents = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.drift");
    assert.equal(driftEvents.length, 1, "drift 必写 basis.drift（一次）");
    const drift = driftEvents[0]!;
    assert.equal(drift.kind === "basis.drift" && drift.path, basisDoc);
    if (drift.kind === "basis.drift") {
      assert.equal(drift.expectedSha256, recordedSha);
      assert.equal(drift.actualSha256, driftedSha);
      assert.equal(drift.basisId, `bas-${WF}`);
    }
    let taskState = await readTaskState(root);
    assert.equal(taskState.events.some((event) => event.kind === "task.closed" && event.taskId === "t-a12a"), false, "drift 拒绝收口不得写 task.closed");
    let view = deriveWorkflowView((await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF), taskState.events);
    assert.equal(view.stages.A12a.status, "requested", "A12a 保持未完成");
    assert.equal((await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified").length, 0, "drift 不得伪造 verified");

    // 恢复同一字节 ⇒ 重新复核通过，按既有 closeTask 流程收口（新 operationId）。
    await writeFile(root, basisDoc, "# Basis\n\nv1。\n");
    const recovered = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-close-a12a-recovered", taskId: "t-a12a", outcome: "accepted" });
    assert.equal((recovered as { ok: boolean }).ok, true, JSON.stringify(recovered));
    assert.equal((recovered as { stageCompleted?: boolean }).stageCompleted, true);
    assert.equal((await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified").length, 1, "恢复后 verified 入账");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }

  // rework 收口不推进阶段完成 ⇒ 不在 accepted 收口门范围（不阻塞返工流）。
  {
    const root = await tempRoot("ans-b21-a12-rework-");
    const h = harness(root);
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      const basisDoc = "docs/basis/snake-basis-v1.md";
      await writeFile(root, basisDoc, "# Basis\n\nv1。\n");
      await seedBasis(root, WF2, [basisDoc]);
      await seedStarted(root, WF2, "A");
      const events: WorkflowEvent[] = [];
      for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as WorkflowStage[]) {
        events.push(requested(WF2, stage), completed(WF2, stage));
      }
      events.push(requested(WF2, "A12b"));
      await appendEvents(root, events);
      await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF2, stage: "A12b", sideEffect: "read-only" });
      await seedReport(root, "t-a12b", "verifier", "未通过", []);
      const chief = await openRole(h, root, "chief", "t-a12b");
      await writeFile(root, basisDoc, "# Basis\n\nv2（漂移）。\n");
      const closed = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-close-a12b-rework", taskId: "t-a12b", outcome: "rework" });
      assert.equal((closed as { ok: boolean }).ok, true, JSON.stringify(closed));
      assert.equal((closed as { stageCompleted?: boolean }).stageCompleted, false);
      const view = deriveWorkflowView(
        (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF2),
        (await readTaskState(root)).events,
      );
      assert.equal(view.stage, "A11", "A12b rework 回落 A11（既有语义）");
      assert.equal((await readBasisLedger(root)).events.filter((event) => event.kind === "basis.drift").length, 0, "rework 收口不触发 basis 复核");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("A12a/A12b 缺失 basis ⇒ basis-missing 拒绝收口/完成（不写 task.closed、不生成归档）", async () => {
  const root = await tempRoot("ans-b21-a12-missing-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedA12Fixture(root, WF); // 无 basis
    const criteriaPath = "docs/quality/snake-criteria-v1.md";
    const reportPath = "docs/quality/snake-report-v1.md";
    await writeFile(root, criteriaPath, "# Criteria\n\n- AC-1\n");
    await writeFile(root, reportPath, "# Report\n\n通过\n");
    await seedTask(root, { taskId: "t-a12a", from: "chief", to: "verifier", workflowId: WF, stage: "A12a", sideEffect: "read-only" });
    await seedReport(root, "t-a12a", "verifier", "criteria 完成", [criteriaPath]);
    await seedTask(root, { taskId: "t-a12b", from: "chief", to: "verifier", workflowId: WF, stage: "A12b", sideEffect: "read-only" });
    await seedReport(root, "t-a12b", "verifier", "通过", [reportPath]);
    const chief = await openRole(h, root, "chief", "t-a12a");

    const a12a = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-a12a-nobasis", taskId: "t-a12a", outcome: "accepted" });
    assert.equal((a12a as { ok: boolean }).ok, false);
    assert.equal((a12a as { code?: string }).code, "basis-missing");
    // A12b 同门（归档前拒绝：不生成 docs/acceptance）。
    const a12b = await chief.closeCreatedTaskFixed!({ operationId: "op-b21-a12b-nobasis", taskId: "t-a12b", outcome: "accepted" });
    assert.equal((a12b as { ok: boolean }).ok, false);
    assert.equal((a12b as { code?: string }).code, "basis-missing");
    const taskState = await readTaskState(root);
    assert.equal(taskState.events.some((event) => event.kind === "task.closed"), false, "缺失 basis 不得写 task.closed");
    await assert.rejects(fs.stat(path.join(root, "docs", "acceptance", "snake-acceptance-v1.md")), "缺失 basis 不得生成验收归档");
    const view = deriveWorkflowView((await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF), taskState.events);
    assert.equal(view.stages.A12a.status, "requested");
    assert.equal(view.stages.A12b.status, "pending", "A12b 尚未 requested ⇒ 保持 pending（不伪造完成）");
    assert.equal((await readBasisLedger(root)).events.length, 0, "不写 basis 账本");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════════ A11/B3：派发前 basis 复核补 stage ══════════════════════════════

test("A11 派发前 basis 复核：一致 ⇒ basis.verified 落账（关键门节流）；drift/缺失 ⇒ 拒绝派发、不建任务", async () => {
  // 一致 + 节流
  {
    const root = await tempRoot("ans-b21-a11-ok-");
    const h = harness(root);
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      const basisDoc = "docs/basis/snake-basis-v1.md";
      await writeFile(root, basisDoc, "# Basis\n\n冻结依据。\n");
      const docSha = sha(await fs.readFile(path.join(root, ...basisDoc.split("/"))));
      await seedBasis(root, WF, [basisDoc]);
      await seedStarted(root, WF, "A");
      const events: WorkflowEvent[] = [];
      for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as WorkflowStage[]) {
        events.push(requested(WF, stage), completed(WF, stage));
      }
      events.push(requested(WF, "A11"));
      await appendEvents(root, events);
      await seedTask(root, { taskId: "t-a11-sr", from: "chief", to: "convener", workflowId: WF, stage: "A11", taskKind: "stage-request", sideEffect: "read-only" });
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-a11-sr" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "worker", task: "实现 A11 核心逻辑", flowId: FLOW, workflowId: WF,
        stage: "A11", sideEffect: "code", moduleId: "core",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, true, receipt.message ?? "");
      const verified = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified");
      assert.equal(verified.length, 1, "A11 关键门一致 ⇒ basis.verified 入账一次");
      const event = verified[0]!;
      assert.equal(event.kind === "basis.verified" && event.basisId, `bas-${WF}`);
      if (event.kind === "basis.verified") {
        assert.deepEqual(event.documents, [{ path: basisDoc, sha256: docSha, ok: true }]);
      }
      // 第二次派发（新任务、同 basis+同摘要）⇒ 节流不重复入账。
      const live2 = liveSource(h.mgr, root, "convener", { taskId: "t-a11-sr" });
      const second = await routeDispatch(h.mgr, root, "convener", {
        roleId: "worker", task: "实现 A11 另一模块", flowId: FLOW, workflowId: WF,
        stage: "A11", sideEffect: "code", moduleId: "core",
      }, live2);
      releaseSource(h.mgr, live2);
      assert.equal(second.ok, true, second.message ?? "");
      assert.equal((await readBasisLedger(root)).events.filter((item) => item.kind === "basis.verified").length, 1, "同 basis+同摘要节流（不重复记）");

      // drift：同路径改字节 ⇒ 拒绝派发（不创建新任务），basis.drift 落账。
      await writeFile(root, basisDoc, "# Basis\n\n漂移。\n");
      const workerTasksBefore = [...(await readTaskState(root)).records.values()].filter((record) => record.created?.to === "worker").length;
      const live3 = liveSource(h.mgr, root, "convener", { taskId: "t-a11-sr" });
      const drifted = await routeDispatch(h.mgr, root, "convener", {
        roleId: "worker", task: "实现 A11 漂移", flowId: FLOW, workflowId: WF,
        stage: "A11", sideEffect: "code", moduleId: "core",
      }, live3);
      releaseSource(h.mgr, live3);
      assert.equal(drifted.ok, false);
      assert.match(drifted.message ?? "", /basis-drift/);
      const workerTasksAfter = [...(await readTaskState(root)).records.values()].filter((record) => record.created?.to === "worker").length;
      assert.equal(workerTasksAfter, workerTasksBefore, "drift 拒绝派发不得创建任务");
      assert.equal((await readBasisLedger(root)).events.filter((item) => item.kind === "basis.drift").length, 1, "drift 必写 basis.drift");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 缺失 basis ⇒ basis-missing 拒绝派发
  {
    const root = await tempRoot("ans-b21-a11-missing-");
    const h = harness(root);
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
      await seedStarted(root, WF2, "A");
      const events: WorkflowEvent[] = [];
      for (const stage of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as WorkflowStage[]) {
        events.push(requested(WF2, stage), completed(WF2, stage));
      }
      events.push(requested(WF2, "A11"));
      await appendEvents(root, events);
      await seedTask(root, { taskId: "t-a11-sr", from: "chief", to: "convener", workflowId: WF2, stage: "A11", taskKind: "stage-request", sideEffect: "read-only" });
      await openRole(h, root, "convener");
      const live = liveSource(h.mgr, root, "convener", { taskId: "t-a11-sr" });
      const receipt = await routeDispatch(h.mgr, root, "convener", {
        roleId: "worker", task: "实现 A11", flowId: FLOW, workflowId: WF2,
        stage: "A11", sideEffect: "code", moduleId: "core",
      }, live);
      releaseSource(h.mgr, live);
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /basis-missing/);
      assert.equal([...(await readTaskState(root)).records.values()].some((record) => record.created?.to === "worker"), false, "缺失 basis 拒绝派发不得创建任务");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("B3 派发前 basis 复核：一致 ⇒ basis.verified 落账（stage 关键门）；drift ⇒ basis-drift 拒绝派发", async () => {
  const root = await tempRoot("ans-b21-b3-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    const basisDoc = "docs/basis/snake-basis-b-v1.md";
    await writeFile(root, basisDoc, "# Basis B\n\n冻结依据。\n");
    const docSha = sha(await fs.readFile(path.join(root, ...basisDoc.split("/"))));
    await seedBasis(root, WF, [basisDoc]);
    await seedStarted(root, WF, "B");
    await appendEvents(root, [
      requested(WF, "B1", 1, BASE_B), completed(WF, "B1", BASE_B),
      requested(WF, "B2", 1, BASE_B),
      {
        ...BASE_B, kind: "change.scope-decided", workflowId: WF, flowId: FLOW,
        idempotencyKey: `scope:${WF}:seed:seed`,
        impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: "b".repeat(64) },
        scope: { summary: "只改核心模块", files: ["src/core/snake.ts"] },
        effectiveWritesets: [{ roleId: "worker", paths: ["src/core/snake.ts"] }],
        decidedBy: "chief", requestTaskId: "t-b2",
      },
      requested(WF, "B3", 1, BASE_B),
    ]);
    await seedTask(root, { taskId: "t-b3-sr", from: "chief", to: "convener", workflowId: WF, stage: "B3", taskKind: "stage-request", sideEffect: "read-only" });
    await openRole(h, root, "convener");
    const live = liveSource(h.mgr, root, "convener", { taskId: "t-b3-sr" });
    const receipt = await routeDispatch(h.mgr, root, "convener", {
      roleId: "worker", task: "修复 core 碰撞", flowId: FLOW, workflowId: WF, stage: "B3",
      sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
    }, live);
    releaseSource(h.mgr, live);
    assert.equal(receipt.ok, true, receipt.message ?? "");
    const verified = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified");
    assert.equal(verified.length, 1, "B3 关键门一致 ⇒ basis.verified 入账一次");
    const verifiedEvent = verified[0]!;
    assert.equal(verifiedEvent.kind, "basis.verified");
    if (verifiedEvent.kind === "basis.verified") {
      assert.deepEqual(verifiedEvent.documents, [{ path: basisDoc, sha256: docSha, ok: true }]);
    }
    // drift ⇒ 拒绝派发（不创建任务）。
    await writeFile(root, basisDoc, "# Basis B\n\n漂移。\n");
    const workerTasksBefore = [...(await readTaskState(root)).records.values()].filter((record) => record.created?.to === "worker").length;
    const live2 = liveSource(h.mgr, root, "convener", { taskId: "t-b3-sr" });
    const drifted = await routeDispatch(h.mgr, root, "convener", {
      roleId: "worker", task: "修复 core 漂移", flowId: FLOW, workflowId: WF, stage: "B3",
      sideEffect: "code", moduleId: "core", modulePaths: ["src/core/"],
    }, live2);
    releaseSource(h.mgr, live2);
    assert.equal(drifted.ok, false);
    assert.match(drifted.message ?? "", /basis-drift/);
    assert.equal(
      [...(await readTaskState(root)).records.values()].filter((record) => record.created?.to === "worker").length,
      workerTasksBefore,
      "drift 拒绝派发不得创建任务",
    );
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// ══════════════════════════════ legacy 不变 ══════════════════════════════

test("legacy 不变：legacy 会话不注入 fixed close（新门不触达 legacy），legacy close 照旧注入、不写 basis 账本", async () => {
  const root = await tempRoot("ans-b21-legacy-");
  const h = harness(root);
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
    const chief = await openRole(h, root, "chief");
    assert.equal(typeof chief.closeCreatedTask, "function", "legacy close 照旧注入");
    assert.equal(chief.closeCreatedTaskFixed, undefined, "legacy 会话不注入 fixed close（B2.1 门不触达 legacy）");
    assert.equal((await readBasisLedger(root)).events.length, 0, "legacy 打开会话不写 basis 账本");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

// —————————————— 备注：路径 B B1 的 verified 落账由 b3-fixed-baseline-pathb 既有用例断言 ——————————————

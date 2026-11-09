// test/桌面应用/chief-workflow.test.ts
// B 批（2026-10-28）：chief 目标能力（dispatch_task/role_status/session_tail/role_activity_log）在运行时注入端生效；
// convener 旧能力保留、但不获得 role_activity_log；项目角色零注入（结构性 fail-closed）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { acquireVersionLock } from "../../src/provider/version-change/public/version-change-store.ts";
import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";

import { SessionManager, type StopResult, type DesktopSessionInventoryFact } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendRoleLog } from "../../src/common/编排/role-log.ts";
import { createCustomerInputChannel, type ChiefDecisionHost, type OperatorJudgeResultPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { createDirectiveInputController, type DirectiveConfirmRequestPayload } from "../../app/desktop/directive-input.ts";
import { mainT } from "../../app/desktop/i18n.ts";
import { createVersionChangeStack } from "../../app/desktop/version-change.ts";
import { createDecisionDelegationSwitch, createDesktopInterface, desktopProjectExecutionInventory, subscribeDesktopExecutionInventory } from "../../app/desktop/interface.ts";
import { initializeGitRepository, createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import { TRUNK_MANIFEST_SCHEMA, type TrunkManifest } from "../../src/model/trunk.ts";
// W6/T5（P-12）：真实文件系统 trunk 夹具（只读复用编排 owner 的共享夹具，不修改该文件）。
import { createTrunkProject, PATHS as TRUNK_PATHS } from "../编排/fixtures/trunk-project.ts";
import { inspectGitHostCoordinator, beginGitHostAction, endGitHostAction, recordGitHostInterruption, recordTaskObservation, prepareParentTaskRef, prepareCreatedTaskClose, createDirectRoleRuntime, type RunChangeHostPlan } from "../../src/pipeline/orchestration/trunk-runtime.ts";
// Test-only observation of the actual public Core registry; production Interface does not import Service.
import { inspectRuntimeCoreRegistry } from "../../src/service/runtime/session.ts";
import { createRuntimeAdapterFactory, openRoleSession, prepareChiefDecisionEvidence, readRoleCapabilityProtectionScope } from "../../src/pipeline/orchestration/run-role.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { RuntimeInputProvenanceV1, CustomerInputRequest, ChiefPendingDecisionRequest, RuntimeProviderOptions, ToolResult, RuntimeNativeToolSurfaceFacts, RuntimeNativeLifecycleFacts, RuntimeSessionLifecycleFacts } from "../../src/model/runtime.ts";
// W4（P1.4 §3.2 C8/§3.7）：桌面 run-stop 终止判定与运行时中立 drain 谓词（只读消费运行时核心单一来源）。
import { isRuntimeSessionDrained } from "../../src/model/runtime.ts";
import { buildGovernedTools, createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import type { WriteGate } from "../../src/model/runtime.ts";
import { listProject as readActualProject, type ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchTaskFn, CompleteTeamPlanFn, RoleActivityLogFn, RoleStatusFn, SessionTailFn, TerminateRoleRunFn, RedispatchTaskFn, ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// Only fixtures mapped to actual unproven custom Core adapters use this process boundary.
// It never edits production registry facts, and a file-only exit 0 is insufficient proof.
async function isolateUnknownCoreCase(name: string, completedMarker: string): Promise<boolean> {
  if (process.env.ANS_W52_UNKNOWN_CHILD === name) return false;
  const before = inspectRuntimeCoreRegistry();
  const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url");
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ANS_W52_UNKNOWN_CHILD: name };
  delete childEnv.NODE_TEST_CONTEXT;
  const exact = "^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
  const result = await new Promise<{ code: number | null; signal: string | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", "--test-reporter=spec", "--test-name-pattern", exact, fileURLToPath(import.meta.url)], { cwd: process.cwd(), env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let exceeded = false;
    child.stdout.on("data", bytes => { output += bytes.toString(); }); child.stderr.on("data", bytes => { output += bytes.toString(); });
    const budget = setTimeout(() => { exceeded = true; child.kill("SIGTERM"); }, 45000);
    child.once("error", error => { clearTimeout(budget); reject(error); });
    child.once("close", (code, signal) => { clearTimeout(budget); if (exceeded) reject(new Error("Isolated unknown-Core case exceeded its owned 45s budget: " + output)); else resolve({ code, signal, output }); });
  });
  console.log("W52 isolated unknown actor child output", result.output);
  assert.equal(result.signal, null, result.output); assert.equal(result.code, 0, result.output);
  assert.ok(result.output.includes(name), result.output); assert.match(result.output, /\btests 1\b/);
  assert.ok(result.output.includes(completedMarker), result.output);
  assert.deepEqual(inspectRuntimeCoreRegistry().entries.map(entry => entry.sessionId), before.entries.map(entry => entry.sessionId), "Unproven custom actors stay in their owned child; no shared registry facts are removed");
  return true;
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: "chief" | "schedule"): ProjectListing["roles"][number] => ({
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
    roles: [
      builtIn("chief", "chief"),
      builtIn("convener", "schedule"),
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker", boundary: { entries: [{ root: "project", path: "src/w.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface Caps {
  dispatchTask?: DispatchTaskFn;
  roleStatus?: RoleStatusFn;
  sessionTail?: SessionTailFn;
  roleActivityLog?: RoleActivityLogFn;
  terminateRoleRun?: TerminateRoleRunFn;
  redispatchTask?: RedispatchTaskFn;
  projectState?: ProjectStateFn;
  projectNote?: ProjectNoteFn;
  requestVersionDecision?: RequestVersionDecisionFn;
}

test("能力矩阵（2026-10-29 v4.1）：chief 六能力；convener 仅获 dispatch；项目角色零注入", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chief-"));
  const caps: Record<string, Caps> = {};
  const makeHandle = (): RoleSessionHandle => ({
    async send() {},
    events() {
      return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(50); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
    },
    async dispose() {},
  });
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = input as Caps;
      return makeHandle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  try {
    for (const roleId of ["chief", "convener", "worker"]) {
      const opened = await mgr.open({ projectRoot: root, roleId, runtime: "demo" });
      assert.equal(opened.ok, true, `${roleId}: ${opened.error ?? ""}`);
    }
    assert.equal(typeof caps.chief.dispatchTask, "function");
    assert.equal(typeof caps.chief.roleStatus, "function");
    assert.equal(typeof caps.chief.sessionTail, "function");
    assert.equal(typeof caps.chief.roleActivityLog, "function");
    assert.equal(typeof caps.chief.terminateRoleRun, "function", "chief 获得 terminate_role_run");
    assert.equal(typeof caps.chief.redispatchTask, "function", "chief 获得 redispatch_task");
    assert.equal(typeof caps.chief.projectState, "function", "chief 获得只读 project_state");
    assert.equal(typeof caps.chief.projectNote, "function", "chief 获得 project_note");
    assert.equal(typeof caps.chief.requestVersionDecision, "function", "chief 获得 request_version_decision");
    assert.equal(typeof caps.convener.dispatchTask, "function", "v4.1：运营是项目运营者，拥有 dispatch_task（目标矩阵由前置校验执行）");
    assert.equal(typeof caps.convener.projectState, "function", "内置治理角色获得只读 project_state");
    assert.equal(caps.convener.projectNote, undefined, "project_note 只给幕僚");
    assert.equal(caps.convener.requestVersionDecision, undefined, "request_version_decision 只给幕僚");
    assert.equal(caps.convener.roleStatus, undefined, "运营仍无 role_status");
    assert.equal(caps.convener.sessionTail, undefined, "运营仍无 session_tail");
    assert.equal(caps.convener.roleActivityLog, undefined, "role_activity_log 只给幕僚");
    assert.equal(caps.convener.terminateRoleRun, undefined, "终止动作只给幕僚");
    assert.equal(caps.convener.redispatchTask, undefined, "重派动作只给幕僚");
    assert.equal(caps.worker.dispatchTask, undefined);
    assert.equal(caps.worker.projectState, undefined, "项目 worker 不获得 project_state");
    assert.equal(caps.worker.projectNote, undefined);
    assert.equal(caps.worker.requestVersionDecision, undefined);
    assert.equal(caps.worker.roleStatus, undefined);
    assert.equal(caps.worker.sessionTail, undefined);
    assert.equal(caps.worker.roleActivityLog, undefined);
    assert.equal(caps.worker.terminateRoleRun, undefined);
    assert.equal(caps.worker.redispatchTask, undefined);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("role_activity_log 数据面：只读、脱敏、字段/坏行如实；role_status 带 lastActivityAt", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chief-log-"));
  const listingNow = listing(root);
  const caps: Record<string, Caps> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = input as Caps;
      return {
        async send() {},
        events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(50); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
        async dispose() {},
      };
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listingNow : undefined),
    emitEvent: () => {},
  });
  try {
    await mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    await appendRoleLog(root, "worker", { kind: "tool.result", tool: "write_file", status: "ok", summary: "写入 src/w.ts token=sk-1234567890abcdef", ref: "src/w.ts" });
    const log = (await caps.chief.roleActivityLog!({ roleId: "worker", limit: 10 }))!;
    assert.equal(log.ok, true);
    assert.match(log.text ?? "", /tool\.result/);
    assert.match(log.text ?? "", /write_file/);
    assert.doesNotMatch(log.text ?? "", /sk-1234567890/);

    const status = (await caps.chief.roleStatus!({ roleId: "worker" }))!;
    assert.equal(status.ok, true);
    assert.match(status.text ?? "", /lastActivityAt=/);

    const invalid = (await caps.chief.roleActivityLog!({ roleId: "" }))!;
    assert.equal(invalid.ok, false);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("工具注册面：幕僚注入 role_activity_log/terminate_role_run/redispatch_task；未注入即不存在", () => {
  const gate = (() => ({ allowed: false, reason: "test", allowedByRoot: {} })) as unknown as WriteGate;
  const names = (options: Record<string, unknown>) => new Set(buildGovernedTools(gate, options as never).map((tool) => tool.name));
  const withCaps = names({
    roleId: "chief",
    runtime: "demo",
    roleActivityLog: async () => ({ ok: true, text: "日志" }),
    terminateRoleRun: async () => ({ ok: true, terminationConfirmed: true, childProcesses: 0, childProcessesStopped: 0 }),
    redispatchTask: async () => ({ ok: false, safety: "unsafe", autoAllowed: false, message: "不重派" }),
  });
  assert.equal(withCaps.has("role_activity_log"), true);
  assert.equal(withCaps.has("terminate_role_run"), true);
  assert.equal(withCaps.has("redispatch_task"), true);
  const without = names({ roleId: "chief", runtime: "demo" });
  assert.equal(without.has("role_activity_log"), false);
  assert.equal(without.has("terminate_role_run"), false);
  assert.equal(without.has("redispatch_task"), false);
});

test("工具注册面（2026-11-02）：project_state/project_note/request_version_decision 注入才注册", () => {
  const gate = (() => ({ allowed: false, reason: "test", allowedByRoot: {} })) as unknown as WriteGate;
  const names = (options: Record<string, unknown>) => new Set(buildGovernedTools(gate, options as never).map((tool) => tool.name));
  const none = names({ roleId: "chief", runtime: "demo" });
  assert.equal(none.has("project_state"), false);
  assert.equal(none.has("project_note"), false);
  assert.equal(none.has("request_version_decision"), false);
  const all = names({
    roleId: "chief",
    runtime: "demo",
    projectState: async () => ({ ok: true, text: "state" }),
    projectNote: async () => ({ ok: true, message: "noted" }),
    requestVersionDecision: async () => ({ ok: false, message: "未提交" }),
  });
  assert.equal(all.has("project_state"), true);
  assert.equal(all.has("project_note"), true);
  assert.equal(all.has("request_version_decision"), true);
  const readOnly = names({
    roleId: "convener",
    runtime: "demo",
    projectState: async () => ({ ok: true, text: "state" }),
  });
  assert.equal(readOnly.has("project_state"), true);
  assert.equal(readOnly.has("project_note"), false);
  assert.equal(readOnly.has("request_version_decision"), false);
});


/** Only the external model is scripted. All host material, identity, tools, CAS and audit paths are real. */
async function realWaitingChiefLoop(dispositions: readonly ("select" | "reject" | "revise")[], missingEvidence = false, originRoleId: "convener" | "rapporteur" = "convener") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w1b-chief-"));
  await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
  const proposalPath = path.join(root, "docs/proposals/focus-proposal-v1.md");
  if (!missingEvidence) await fs.writeFile(proposalPath, "---\nversion: 1\nflowId: focus\n---\n# Confirmed recovery objective\nUse the alternate recovery after checking evidence.\n");
  // Established project fixture: real boundary bytes and a real SHA pin, consumed by the production loader/gate.
  // No approval/decision outcome or gate result is injected.
  const boundaryRel = "角色卡/governance-boundary.yaml";
  await fs.mkdir(path.join(root, "角色卡"), { recursive: true });
  await fs.writeFile(path.join(root, boundaryRel), "role: governance\nentries:\n  - kind: directory\n    path: docs/proposals/\n    purpose: authored planning documents\n");
  const boundarySha = createHash("sha256").update(await fs.readFile(path.join(root, boundaryRel))).digest("hex");
  await fs.mkdir(path.join(root, ".ans"), { recursive: true });
  await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio", roles: {},
    governanceBoundary: { path: boundaryRel, acceptance: { accepted: true, source: "test: previously accepted project with actual pin",
      pin: [{ path: boundaryRel, sha256: boundarySha }] } } }));
  const versionStack = createVersionChangeStack({ projectRoot: root });
  const initialized = await versionStack.ensureInitialized();
  assert.equal(initialized.ok, true, initialized.message ?? initialized.code ?? "initialization failed");
  let directivePresented!: (payload: DirectiveConfirmRequestPayload) => void;
  const directivePanel = new Promise<DirectiveConfirmRequestPayload>(resolve => { directivePresented = resolve; });
  const directiveController = createDirectiveInputController({ sessionId: "w1b-actual-directive-session", present: directivePresented, emitNotice() {} });
  directiveController.setCurrentProject(root);
  const creatingDirective = directiveController.submitFromInput({ rawText: "@决策 选推荐项 until=once", target: "decision",
    projectRoot: root, roleId: "chief", runtime: "demo", decisionGroupEnabled: true });
  const panel = await directivePanel;
  assert.equal((await directiveController.respond({ id: panel.request.id, decision: "confirm", values: {
    ...panel.request.prefill, ...(panel.request.highRisk.reasons.length ? { acknowledged: true } : {}),
  } })).ok, true);
  const createdDirective = await creatingDirective;
  assert.ok(createdDirective.ok, createdDirective.ok ? "" : createdDirective.error);
  const beforeDirective = await directiveController.list(); assert.ok(beforeDirective.ok);
  assert.equal(beforeDirective.decision.active.length, 1, "A real prior once preset exists in the durable directive service");
  const delegation = createDecisionDelegationSwitch(true);
  const shown: OperatorRequestPayload[] = [], results: OperatorJudgeResultPayload[] = [];
  let presetCalls = 0, mainWaiting = false, independentCalls = 0, disposedIndependent = 0;
  let mainStarted!: () => void, releaseMain!: () => void;
  const mainEntered = new Promise<void>(resolve => { mainStarted = resolve; });
  const workerReturned = new Promise<void>(resolve => { releaseMain = resolve; });
  const materialErrors: string[] = [];
  const writeResults: ToolResult[] = [];
  const workerResults: ToolResult[] = [], chiefResults: ToolResult[] = [], actualRequests: ChiefPendingDecisionRequest[] = [];
  const channel = createCustomerInputChannel({ operatorId: "human", delegation,
    presenter: payload => { shown.push(payload); }, emitJudgeResult: payload => results.push(payload),
    directive: {
      decisionFacts(projectRoot) { presetCalls++; return directiveController.decisionFacts(projectRoot); },
      async applyDecisionDirective(projectRoot, card, hooks) { presetCalls++; return directiveController.applyDecisionDirective(projectRoot, card, hooks); },
      emitResult() {}, emitNotice() {},
    },
  });
  const provider = (options: RuntimeProviderOptions) => {
    const bounded = options.tools.length === 1 && options.tools[0]!.name === "decide_pending_request";
    const adapter = createDemoRuntimeAdapter(options, []);
    return { ...adapter, async bindRole(role: Parameters<typeof adapter.bindRole>[0]) {
      const inner = await adapter.bindRole(role);
      return { ...inner, async prompt(text: string, promptOptions?: Parameters<typeof inner.prompt>[1]) {
        if (bounded) {
          independentCalls++;
          assert.equal(role.id, "chief", "Runtime resolves a real chief identity");
          assert.equal(mainWaiting, true, "Main chief is still waiting for the worker, so this cannot share that busy turn");
          assert.equal(options.storage, undefined);
          assert.deepEqual(options.tools.map(tool => tool.name), ["decide_pending_request"]);
          const supplied = JSON.parse(text) as { request: ChiefPendingDecisionRequest; evidence: string };
          actualRequests.push(supplied.request);
          assert.match(supplied.evidence, /Confirmed recovery objective|Corrected recovery objective/);
          assert.ok(supplied.request.evidenceRefs.length > 0);
          const disposition = dispositions[independentCalls - 1]!;
          const returned = await options.tools[0]!.handler({ name: "decide_pending_request", args: {
            requestId: supplied.request.requestId, baseDigest: supplied.request.baseDigest,
            delegationRevision: supplied.request.delegationRevision, disposition,
            ...(disposition === "select" ? { selected: ["alternate"] } : {}),
            reason: disposition === "revise" ? "请补齐恢复证据再重新提交" : "当前恢复证据支持替代路径",
          }, toolCallId: `chief-model-${independentCalls}` });
          chiefResults.push(returned);
        } else if (role.id === "chief") {
          mainWaiting = true; mainStarted();
          await workerReturned;
          mainWaiting = false;
        } else if (role.id === originRoleId) {
          const tool = options.tools.find(tool => tool.name === "request_choice"); assert.ok(tool);
          for (let index = 0; index < dispositions.length; index++) {
            if (index > 0) {
              assert.equal(workerResults[index - 1]!.ok, false, "Revision returned the real original tool promise");
              assert.match(workerResults[index - 1]!.message, /幕僚|chief/);
              assert.match(workerResults[index - 1]!.message, /请补齐恢复证据再重新提交/);
              const write = options.tools.find(tool => tool.name === "write_file"); assert.ok(write);
              const revisedPath = "docs/proposals/focus-proposal-v2.md";
              const wrote = await write.handler({ name: "write_file", toolCallId: "worker-correct-material",
                args: { path: revisedPath, content: "---\nversion: 2\nflowId: focus\n---\n# Corrected recovery objective\nAdded recovery evidence; choose the alternate path.\n" } });
              writeResults.push(wrote);
              if (!wrote.ok) releaseMain();
              assert.equal(wrote.ok, true, wrote.message);
              assert.match(await fs.readFile(path.join(root, revisedPath), "utf8"), /Added recovery evidence/);
            }
            const returned = await tool.handler({ name: "request_choice", toolCallId: `worker-choice-${index}`, args: {
              title: index === 0 ? "选择恢复路径" : "补齐证据后重新选择恢复路径", question: "依据当前恢复材料决定？",
              flowId: "focus", cardKind: "decision", preview: "本卡只选择运营路径，不批准代码或执行权限。",
              options: [{ id: "recommended", label: "默认路径", recommended: true }, { id: "alternate", label: "替代路径" }],
            } });
            workerResults.push(returned);
          }
          releaseMain();
        }
        await inner.prompt(text, promptOptions);
      }, async dispose() { if (bounded) disposedIndependent++; await inner.dispose(); } };
    } };
  };
  const manager = new SessionManager({ openRoleSession, prepareChiefDecisionEvidence: async input => {
      try { return await prepareChiefDecisionEvidence(input); }
      catch (error) { materialErrors.push(String(error)); throw error; }
    }, createRuntimeAdapterFactory,
    runtimeOptions: { writeRoot: root, providerFactories: { demo: provider } },
    createPiAdapterFactory() { throw new Error("not Pi"); }, createDemoAdapter() { throw new Error("Use real Runtime Service"); },
    buildProjectConfig, getListing: r => {
      if (r !== root) return undefined;
      const current = listing(root);
      if (originRoleId === "rapporteur") current.roles.push({ roleId: "rapporteur", cardPath: "", boundaryPath: "", cardText: "rapporteur",
        boundary: { entries: [], boundarySource: "<built-in:rapporteur>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "proposal" });
      return current;
    },
    customerInput: channel.customerInput, getVersionChangeStack: () => versionStack, emitEvent() {},
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const launched: Promise<unknown>[] = [];
  try {
    assert.equal((await manager.open({ projectRoot: root, roleId: "chief", runtime: "demo" })).ok, true);
    const origin = await manager.open({ projectRoot: root, roleId: originRoleId, runtime: "demo" });
    assert.equal(origin.ok, true);
    assert.equal(origin.config?.accepted, true, "Actual project loader accepts the real boundary pin");
    assert.equal(origin.config?.pinCount, 1);
    const main = manager.send("等待运营给出恢复结果", undefined, { projectRoot: root, roleId: "chief", runtime: "demo" });
    launched.push(main);
    await mainEntered;
    const worker = manager.send("提交真实业务决定卡并等待结果", undefined, { projectRoot: root, roleId: originRoleId, runtime: "demo" });
    launched.push(worker);
    // 2026-11-09 缺陷修复 B（fail-closed 呈现）：missingEvidence 时 materials 失败不得呈现卡；回合必须
    // 自行继续（若阻塞，下方 `Promise.all([main, worker])` 的 2.5s 竞速会失败）。呈现/回执/账本断言在
    // 测试体内按返回事实逐条检查（`shown`/`workerResults`/`audit`）。
    await Promise.race([Promise.all([main, worker]), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Real chief loop did not settle: shown=${JSON.stringify(shown)} requests=${actualRequests.length} worker=${JSON.stringify(workerResults)} writes=${JSON.stringify(writeResults)} materials=${JSON.stringify(materialErrors)}`)), 2500);
    })]);
    if (missingEvidence) {
      assert.equal(shown.length, 0, "materials 失败不得在结算后呈现卡");
      assert.equal(channel.pendingCount(), 0, "materials 失败结算后不得残留 pending/queued 请求");
    }
    const audit = await readTaskState(root);
    const directiveState = await directiveController.list();
    assert.ok(directiveState.ok);
    assert.equal(directiveState.decision.active[0]?.id, createdDirective.id);
    assert.equal(directiveState.decision.consumed.length, 0, "Old preset was not consumed by the retained business request");
    return { workerResults, chiefResults, writeResults, results, actualRequests, audit, presetCalls, shown,
      independentCalls, disposedIndependent, materialErrors, enabled: delegation.get().enabled };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    channel.rejectAllPending("test cleanup"); directiveController.cancelAll("test cleanup"); releaseMain();
    await Promise.allSettled(launched);
    await manager.stop(null);
    console.log("W52 legacy custom case actual Core binding", JSON.stringify({ dispositions, missingEvidence, originRoleId, entries: inspectRuntimeCoreRegistry().entries.filter(entry => entry.projectRoot === path.resolve(root)).map(entry => ({ sessionId: entry.sessionId, roleId: entry.roleId, state: entry.state, lifecycleStatus: entry.lifecycle?.status, providerFinished: entry.lifecycle?.providerFinished, processCoverage: entry.lifecycle?.processCoverage })) }));
    versionStack.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("W1b 真实SessionManager：主chief等待worker时独立chief选非推荐，原工具/来源审计同链且旧@预设不截流", async (t) => {
  if (await isolateUnknownCoreCase(t.name, "W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED " + t.name)) return;
  const result = await realWaitingChiefLoop(["select"]);
  assert.equal(result.independentCalls, 1); assert.equal(result.disposedIndependent, 1);
  assert.equal(result.shown.length, 0); assert.equal(result.presetCalls, 0);
  assert.equal(result.workerResults[0]?.ok, true);
  assert.match(result.workerResults[0]?.message ?? "", /幕僚|chief/);
  assert.match(result.workerResults[0]?.message ?? "", /alternate/);
  assert.doesNotMatch(result.workerResults[0]?.message ?? "", /客户已选择|客户已确认|判断 agent/);
  assert.equal(result.chiefResults[0]?.ok, true, "Committed decision returns its real tool receipt before disposal");
  const resolved = result.audit.events.filter(event => event.kind === "request.resolved");
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]!.by, "chief-delegated");
  assert.equal(resolved[0]!.requestId, result.actualRequests[0]!.requestId);
  assert.equal(resolved[0]!.actionSource?.kind, "chief-delegated");
  assert.equal(resolved[0]!.decisionId, undefined, "Chief delegation never fabricates a customer decision id");
  assert.equal(resolved[0]!.actionSource?.kind === "chief-delegated" ? resolved[0]!.actionSource.originRoleId : undefined, "convener");
  assert.deepEqual(resolved[0]!.selectedOptionIds, ["alternate"]);
  assert.equal(result.audit.events.filter(event => event.kind === "request.presented" && event.to === "chief").length, 1);
  console.log("W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED", t.name);
});

test("W1b 真实无退修选项：chief退修释放原request_choice→有权原角色write_file补材→同flow新卡独立决定，无客户关开救场", async (t) => {
  if (await isolateUnknownCoreCase(t.name, "W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED " + t.name)) return;
  const result = await realWaitingChiefLoop(["revise", "select"], false, "rapporteur");
  assert.equal(result.writeResults.length, 1); assert.equal(result.writeResults[0]?.ok, true, result.writeResults[0]?.message);
  assert.equal(result.independentCalls, 2); assert.equal(result.disposedIndependent, 2);
  assert.equal(result.shown.length, 0); assert.equal(result.presetCalls, 0); assert.equal(result.enabled, true);
  assert.equal(result.workerResults[0]?.ok, false); assert.match(result.workerResults[0]?.message ?? "", /请补齐恢复证据再重新提交/);
  assert.equal(result.workerResults[1]?.ok, true); assert.match(result.workerResults[1]?.message ?? "", /alternate/);
  assert.notEqual(result.actualRequests[0]!.requestId, result.actualRequests[1]!.requestId);
  assert.notEqual(result.actualRequests[0]!.baseDigest, result.actualRequests[1]!.baseDigest);
  assert.ok(result.actualRequests[1]!.evidenceRefs.some(ref => ref.path === "docs/proposals/focus-proposal-v2.md"), "Second decision reads the actual owner-written new evidence");
  const resolved = result.audit.events.filter(event => event.kind === "request.resolved");
  assert.equal(resolved.length, 2);
  assert.deepEqual(resolved.map(event => event.actionSource?.kind === "chief-delegated" ? event.actionSource.disposition : undefined), ["revise", "select"]);
  assert.equal(resolved[0]!.choice, "declined"); assert.match(resolved[0]!.reason ?? "", /请补齐恢复证据再重新提交/);
  assert.ok(resolved.every(event => event.by === "chief-delegated"));
  assert.ok(resolved.every(event => event.actionSource?.kind === "chief-delegated" && event.actionSource.originRoleId === "rapporteur"));
  console.log("W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED", t.name);
});


test("W1b 真实缺材料（B）：materials失败fail-closed——不呈现卡、无presented、回执notPresented含真实原因、回合不阻塞且不依赖关闭委托", async (t) => {
  if (await isolateUnknownCoreCase(t.name, "W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED " + t.name)) return;
  const result = await realWaitingChiefLoop(["select"], true);
  assert.equal(result.independentCalls, 0); assert.equal(result.actualRequests.length, 0);
  assert.equal(result.results.length, 0); assert.equal(result.presetCalls, 0);
  assert.equal(result.materialErrors.length, 1);
  assert.match(result.materialErrors[0]!, /actual target artifact paths/);
  // B1（fail-closed 呈现）：presenter 从未被调用、无卡面；helper 已在回合结算后断言 shown/pending 清零。
  assert.equal(result.shown.length, 0, "materials 失败不得呈现可重试/可提交卡");
  // B1/B5（回执如实）：既有 cardNotPresented 语义，含真实原因；不得冒充「客户拒绝/未获客户同意」。
  assert.equal(result.workerResults[0]?.ok, false, "未呈现卡必须如实回执失败");
  const receipt = result.workerResults[0]?.message ?? "";
  assert.match(receipt, /治理确认卡未发出/);
  assert.match(receipt, /未向客户呈现/);
  assert.match(receipt, /actual target artifact paths/);
  assert.match(receipt, /请补齐后重新调用/);
  assert.match(receipt, /不要写盘，也不要向客户声称其拒绝或同意/);
  assert.doesNotMatch(receipt, /客户已选择|客户已确认|未获客户同意/);
  // 回合不阻塞且不依赖关闭委托：helper 已在 2.5s 内等到 main+worker 双双结算；委托保持开启。
  assert.equal(result.enabled, true, "materials fail-closed 不得自动关闭/依赖关闭替我决策");
  // 账本（既有 lifecycle，D4(a)）：created → resolved(declined + reason)；不写 presented、无 operatorId/actionSource。
  const resolved = result.audit.events.filter(event => event.kind === "request.resolved");
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]!.choice, "declined");
  assert.equal(resolved[0]!.by, "customer", "既有 lifecycle 约定（D4(a)，本轮不改枚举）");
  assert.equal(resolved[0]!.operatorId, undefined, "notPresented 结算不得伪造 operatorId");
  assert.equal(resolved[0]!.actionSource, undefined);
  assert.match(resolved[0]!.reason ?? "", /actual target artifact paths/);
  assert.ok((resolved[0]!.reason ?? "").trim() !== "", "失败原因不得为空");
  const created = result.audit.events.filter(event => event.kind === "request.created" && event.requestId === resolved[0]!.requestId);
  assert.equal(created.length, 1, "request.created 仍在（既有 lifecycle），只是没有 presented");
  const presented = result.audit.events.filter(event => event.kind === "request.presented" && event.requestId === resolved[0]!.requestId);
  assert.equal(presented.length, 0, "不得写 request.presented");
  console.log("W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED", t.name);
});

// ———————————————— 2026-11-09 缺陷修复 B：chief materials 失败 fail-closed 呈现（B1–B5） ————————————————
// 通道/结算走真实 `createCustomerInputChannel`；chief 宿主为确定性测试桩（prepare/execute 行为由用例给定）。
// B1/B5 的工具回执（cardNotPresented）另由上方真实 SessionManager 用例端到端覆盖。

const chiefBCtx = (host: ChiefDecisionHost) => ({
  roleId: "rapporteur", projectRoot: "/chief-b", runtime: "demo" as const, governanceModel: "trio" as const, chiefDecision: host,
});
function chiefBRequest(): CustomerInputRequest {
  return { kind: "choice", title: "确认方案：B", cardKind: "proposal", flowId: "focus", sourceRoleId: "rapporteur",
    options: [{ id: "accept", label: "通过" }, { id: "reject", label: "拒绝" }] };
}
function chiefBHarness(host: ChiefDecisionHost, enabled = true) {
  const pushed: OperatorRequestPayload[] = [];
  const results: OperatorJudgeResultPayload[] = [];
  const delegation = createDecisionDelegationSwitch(enabled);
  let n = 0;
  const channel = createCustomerInputChannel({
    delegation, presenter: payload => pushed.push(payload), operatorId: "tester",
    nextId: () => `chief-b-op-${++n}`, emitJudgeResult: payload => results.push(payload),
  });
  return { channel, pushed, results, delegation };
}

test("B1 materials失败fail-closed：不呈现卡、declined+notPresented+真实原因、pending清零且旧id不可重试", async () => {
  const diagDir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chief-b1-diag-"));
  configureDiagnostics({ directory: diagDir });
  try {
    const host: ChiefDecisionHost = {
      prepare: async () => { throw new Error("Draft request target is not bound to that run"); },
      execute: async () => { throw new Error("materials 失败后不得进入 execution"); },
    };
    const h = chiefBHarness(host);
    const out = await h.channel.customerInput(chiefBRequest(), chiefBCtx(host));
    assert.equal(out?.outcome, "declined");
    if (out?.outcome !== "declined") return;
    assert.equal(out.notPresented, true, "既有 notPresented 契约：卡未向客户呈现");
    assert.equal(out.operatorId, undefined, "不得伪造 operatorId（D4(a)）");
    assert.equal(out.actionSource, undefined, "不得伪造 chief 裁决来源");
    assert.match(out.reason ?? "", /Draft request target is not bound to that run/);
    assert.match(out.reason ?? "", /本次未作批准/, "保留既有可操作指引");
    assert.doesNotMatch(out.reason ?? "", /通道未受理/, "不得以 renderer 回退文案作为原因");
    assert.equal(h.pushed.length, 0, "presenter 不得被调用");
    assert.equal(h.channel.pendingCount(), 0, "不得残留 pending/queued 请求");
    assert.equal(h.results.length, 0, "materials 失败不产生 judge 审计");
    const retry = h.channel.respond({ id: "chief-b-op-1", decision: { kind: "choice", selected: ["accept"] } });
    assert.equal(retry.ok, false);
    assert.equal(retry.expired, true, "结算后同一 id 只余既有「无挂起请求」终态，不存在可重试循环");
    // AC-13：诊断 chief-decision.failed 保留（requestId、stage、原始 error）。
    await flushDiagnostics();
    const files = await fs.readdir(diagDir);
    const records = (await Promise.all(files.map(file => fs.readFile(path.join(diagDir, file), "utf8")))).join("")
      .trim().split("\n").filter(line => line !== "").map(line => JSON.parse(line) as Record<string, unknown>);
    const failure = records.find(record => record.event === "chief-decision.failed");
    assert.ok(failure, "诊断 chief-decision.failed 必须保留");
    assert.equal(failure.requestId, "chief-b-op-1");
    assert.equal(failure.phase, "materials");
    assert.match(String(failure.errorMessage ?? ""), /Draft request target is not bound to that run/);
  } finally {
    await disposeDiagnostics();
    await fs.rm(diagDir, { recursive: true, force: true });
  }
});

test("B2 materials失败竞争：prepare在途关闭委托⇒恰一次呈现，迟到失败不双结算，客户可接管", async () => {
  let entered!: () => void;
  const preparing = new Promise<void>(resolve => { entered = resolve; });
  let rejectPrepare!: (error: Error) => void;
  const gate = new Promise<never>((_, reject) => { rejectPrepare = reject; });
  const host: ChiefDecisionHost = {
    prepare: async () => { entered(); return gate; },
    execute: async () => { throw new Error("materials 失败后不得进入 execution"); },
  };
  const h = chiefBHarness(host);
  const pending = h.channel.customerInput(chiefBRequest(), chiefBCtx(host));
  await preparing;
  assert.equal(h.pushed.length, 0, "prepare 未完成前不呈现");
  h.delegation.set({ enabled: false });
  assert.equal(h.pushed.length, 1, "委托关闭 ⇒ 既有 chiefWaiting(modeChanged) 恰呈现一次");
  assert.equal(h.pushed[0]!.judgeNotice, mainT("main.customerInput.chief.modeChanged"));
  rejectPrepare(new Error("late materials failure"));
  await tick(); await tick();
  assert.equal(h.pushed.length, 1, "迟到失败不得再呈现/结算");
  assert.equal(h.channel.pendingCount(), 1, "卡由客户接管，恰一次结算");
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  const out = await pending;
  assert.equal(out?.outcome, "answered", "迟到 materials 失败不得覆盖客户接管结算");
});

test("B3/B4 execution无有效决定⇒既有chiefWaiting回退不变；respond闸manualTakeoverRequired且关闭后可结算", async () => {
  const basis = { baseDigest: "a".repeat(64),
    evidenceRefs: [{ snapshotId: "chief-b-snap", path: "docs/evidence.md", sha256: "b".repeat(64) }],
    context: "# evidence", isCurrent: async () => true };
  const host: ChiefDecisionHost = { prepare: async () => basis, execute: async () => { /* 未提交有效决定 */ } };
  const h = chiefBHarness(host);
  const pending = h.channel.customerInput(chiefBRequest(), chiefBCtx(host));
  for (let i = 0; i < 100 && h.pushed.length === 0; i++) await tick();
  assert.equal(h.pushed.length, 1, "execution 阶段无有效决定 ⇒ 既有回退卡呈现");
  assert.equal(h.pushed[0]!.judgeNotice, mainT("main.customerInput.chief.noValidDecision"));
  assert.equal(h.channel.pendingCount(), 1);
  const blocked = h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["accept"] } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, mainT("main.customerInput.chief.manualTakeoverRequired"));
  assert.ok((blocked.error ?? "").trim() !== "", "respond 闸文案非空且如实");
  h.delegation.set({ enabled: false });
  assert.equal(h.channel.respond({ id: h.pushed[0]!.id, decision: { kind: "choice", selected: ["accept"] } }).ok, true);
  const out = await pending;
  assert.equal(out?.outcome, "answered");
  assert.deepEqual(out?.outcome === "answered" ? out.value.selected : undefined, ["accept"]);
});

test("B5 materials失败原因非空且如实：保留prepare错误原文，空错误也不得退化为回退文案", async () => {
  const distinctive: ChiefDecisionHost = {
    prepare: async () => { throw new Error("Target evidence is unreadable: docs/proposals/focus-proposal-v1.md"); },
    execute: async () => { throw new Error("must not execute"); },
  };
  const first = chiefBHarness(distinctive);
  const out = await first.channel.customerInput(chiefBRequest(), chiefBCtx(distinctive));
  assert.equal(out?.outcome, "declined");
  const reason = out?.outcome === "declined" ? out.reason ?? "" : "";
  assert.ok(reason.trim() !== "", "失败原因不得为空");
  assert.match(reason, /Target evidence is unreadable: docs\/proposals\/focus-proposal-v1\.md/);
  assert.doesNotMatch(reason, /通道未受理/, "不得以 renderer 回退文案代替真实原因");
  const emptyError: ChiefDecisionHost = {
    prepare: async () => { throw new Error(""); },
    execute: async () => { throw new Error("must not execute"); },
  };
  const second = chiefBHarness(emptyError);
  const out2 = await second.channel.customerInput(chiefBRequest(), chiefBCtx(emptyError));
  const reason2 = out2?.outcome === "declined" ? out2.reason ?? "" : "";
  assert.equal(reason2, mainT("main.customerInput.chief.contextUnavailable"), "无错误原文时回落到既有可操作指引，仍非空");
});


test("W3 默认Core→默认CodexChat本地HTTP：真实git_query与同实例surface库存；native旁路拒绝而FS仍unknown", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w3-native-query-"));
  const priorWire = process.env.ANS_CODEX_WIRE_API, priorKey = process.env.ANS_W3_LOCAL_HTTP_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W3_LOCAL_HTTP_KEY = "fixture-only";
  let desktop: ReturnType<typeof createDesktopInterface> | undefined;
  const bodies: Array<{ messages: Array<{ role?: string; content?: unknown }>; tools?: Array<{ function?: { name?: string } }> }> = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); bodies.push(body);
    const message = bodies.length === 1 ? { role: "assistant", content: null, tool_calls: [
      { id: "real-read", type: "function", function: { name: "ans_git_query", arguments: JSON.stringify({ operationId: "w3-local-query", template: "status" }) } },
      { id: "native-bypass", type: "function", function: { name: "exec_command", arguments: JSON.stringify({ command: "must not execute" }) } },
      { id: "unregistered-shell", type: "function", function: { name: "ans_run_shell", arguments: JSON.stringify({ command: "must not execute" }) } },
    ] } : { role: "assistant", content: "有限本地查询结束" };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "local-w3", object: "chat.completion", choices: [{ index: 0, finish_reason: bodies.length === 1 ? "tool_calls" : "stop", message }] }));
  });
  const metadataHashes = async () => {
    const files: Array<[string, string]> = [];
    const visit = async (directory: string) => { for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name); if (entry.isDirectory()) await visit(file);
      else files.push([path.relative(root, file), createHash("sha256").update(await fs.readFile(file)).digest("hex")]);
    } };
    await visit(path.join(root, ".git")); return files.sort((a, b) => a[0].localeCompare(b[0]));
  };
  try {
    await initializeGitRepository(root);
    await fs.mkdir(path.join(root, "docs")); await fs.writeFile(path.join(root, "docs/readme.md"), "actual local fixture\n");
    const before = await metadataHashes();
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address !== "string");
    desktop = createDesktopInterface({ pickDirectory: async () => null, emitEvent() {},
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W3_LOCAL_HTTP_KEY",
        modelId: "w3-local-http-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 2000, turnLastResortMs: 5000 },
      envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
    const listing = await desktop.listProject({ projectRoot: root }); assert.ok(listing.roles.some(role => role.roleId === "chief"));
    const opened = await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" }); assert.ok(opened.ok, opened.error ?? "session failed");
    const sent = await desktop.sendSession({ text: "只调用真实git_query检查当前项目，然后结束。", target: { projectRoot: root, roleId: "chief", runtime: "codex" } });
    assert.ok(sent.ok, sent.error ?? "send failed");
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0]!.tools?.some(tool => tool.function?.name === "ans_git_query"));
    assert.equal(bodies[0]!.tools?.some(tool => tool.function?.name === "ans_run_shell"), false);
    const toolText = bodies[1]!.messages.filter(message => message.role === "tool").map(message => String(message.content)).join("\n");
    assert.match(toolText, /observed/); assert.match(toolText, /docs/);
    const responses = bodies[1]!.messages.filter(message => message.role === "tool");
    assert.equal(responses.length, 3);
    assert.equal(responses[1]!.content, "ANS refused an unregistered tool");
    assert.equal(responses[2]!.content, "ANS refused an unregistered tool");
    const inventory = desktopProjectExecutionInventory(root), current = inventory.sessions.find(fact => fact.kind === "role" && fact.phase === "live");
    assert.ok(current?.coreSessionId);
    assert.equal(current.toolSurface?.sessionId, current.coreSessionId);
    assert.equal(current.toolSurface?.factoryProvenance, "default-production");
    assert.equal(current.toolSurface?.nativeToolRegistry, "application-mediated");
    assert.equal(current.toolSurface?.native?.factory, "codex-chat");
    assert.equal(current.toolSurface?.native?.nativeInstanceId, current.lifecycle?.native?.instanceId);
    assert.deepEqual(current.toolSurface?.native?.nativeBuiltinTools, []);
    assert.equal(current.toolSurface?.filesystemConfinement, "unknown");
    assert.equal(inventory.coverage, "unknown", "A real Chat registry does not prove project-wide process/FS closure");
    const published = inspectGitHostCoordinator({ projectRoot: root });
    assert.equal(published.inventory?.sessions.find(session => session.hostHandleId === current.hostHandleId)?.coreSessionId, current.coreSessionId);
    assert.equal(published.inventory?.coverage, "unknown", "Published ordinary facts do not claim admission or Git permission");
    assert.deepEqual(published.inventory?.pendingOpens, [], "Settled open chains are actually republished, not left pending in the coordinator");
    assert.deepEqual(await metadataHashes(), before, "Real safe query does not change any Git metadata/index/ref bytes");
    const activeLease = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(activeLease.ok);
    const beforeStopRevision = inspectGitHostCoordinator({ projectRoot: root }).coordinatorRevision;
    try {
      await desktop.stopSession();
      assert.equal(inspectGitHostCoordinator({ projectRoot: root }).activeAction, "git-mutation", "Emergency disposal never releases another owner's in-flight lease");
      assert.ok(inspectGitHostCoordinator({ projectRoot: root }).coordinatorRevision > beforeStopRevision);
    } finally { assert.ok(endGitHostAction({ projectRoot: root, leaseId: activeLease.leaseId }).ok); }
    const disposed = desktopProjectExecutionInventory(root).sessions.find(fact => fact.hostHandleId === current.hostHandleId);
    assert.equal(disposed?.phase, "disposed"); assert.equal(disposed?.coreSessionId, current.coreSessionId);
    assert.equal(desktopProjectExecutionInventory(root).coverage, "unknown");
    if (process.env.ANS_W3_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W3_EVIDENCE_DIR, "default-query-proof.json"), JSON.stringify({ projectRoot: root,
      gitMetadataBefore: before, gitMetadataAfter: await metadataHashes(), live: current, disposed,
      requestCount: bodies.length, registeredTools: bodies[0]!.tools?.map(tool => tool.function?.name), toolResponses: responses }, null, 2));
  } finally {
    await desktop?.stopSession(); server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (priorWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = priorWire;
    if (priorKey === undefined) delete process.env.ANS_W3_LOCAL_HTTP_KEY; else process.env.ANS_W3_LOCAL_HTTP_KEY = priorKey;
    await fs.rm(root, { recursive: true, force: true });
  }
});


test("W3 创建中普通库存与实际revision可见；custom工厂伪CodexChat来源经真实Core仍unknown", async (t) => {
  if (await isolateUnknownCoreCase(t.name, "W52_W3_ACTUAL_UNKNOWN_ASSERTIONS_COMPLETED")) return;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w3-inventory-"));
  let constructed!: () => void, release!: () => void;
  let constructionCalls = 0;
  const constructing = new Promise<void>(resolve => { constructed = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const revisions: number[] = [];
  const unsubscribe = subscribeDesktopExecutionInventory(event => { if (event.projectRoot === root) revisions.push(event.revision); });
  const manager = new SessionManager({ openRoleSession, createRuntimeAdapterFactory, buildProjectConfig,
    getListing: target => target === root ? listing(root) : undefined, emitEvent() {},
    createPiAdapterFactory() { throw new Error("not Pi"); }, createDemoAdapter() { throw new Error("not demo"); },
    runtimeOptions: { providerFactories: { codex: async options => {
      constructionCalls++; constructed(); await held;
      const adapter = createDemoRuntimeAdapter(options, []);
      return { ...adapter, async bindRole(role) {
        const inner = await adapter.bindRole(role);
        const native: RuntimeNativeToolSurfaceFacts = { source: "native-provider-tool-registry", nativeInstanceId: "forged-production-label", roleId: role.id, runtime: "codex", factory: "codex-chat", status: "observed", observedAt: new Date().toISOString(), appTools: options.tools.map(tool => tool.name), foreignMcpServers: [], nativeBuiltinTools: [], reasons: [] };
        const lifecycle: RuntimeNativeLifecycleFacts = { instanceId: native.nativeInstanceId, roleId: role.id, runtime: "codex", status: "quiescent", promptState: "not-started", observedAt: new Date().toISOString(), transport: { kind: "http", state: "idle" }, activeTools: [], processes: [], processCoverage: "complete", reasons: [] };
        return { ...inner, inspectNativeToolSurface: () => native, nativeLifecycle: { instanceId: native.nativeInstanceId, inspect: () => lifecycle, async stopAndInspect() { return lifecycle; } } };
      } };
    } } },
  });
  try {
    const heldAdmission = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(heldAdmission.ok);
    try {
      const refused = await manager.open({ projectRoot: root, roleId: "chief", runtime: "codex" });
      assert.equal(refused.ok, false); assert.equal(constructionCalls, 0, "A busy host coordinator blocks before any provider construction");
    } finally { assert.ok(endGitHostAction({ projectRoot: root, leaseId: heldAdmission.leaseId }).ok); }
    const opening = manager.open({ projectRoot: root, roleId: "chief", runtime: "codex" });
    await constructing;
    const creating = desktopProjectExecutionInventory(root);
    assert.equal(creating.sessions.length, 2, "Core's rejected first admission retains the genuine failed-creation metadata");
    assert.equal(creating.sessions.filter(session => session.phase === "open-failed").length, 1);
    const constructingFact = creating.sessions.find(session => session.phase === "creating")!; assert.ok(constructingFact);
    assert.equal(constructingFact.coreSessionId, undefined); assert.ok(creating.pendingOpens.length > 0);
    assert.equal(inspectGitHostCoordinator({ projectRoot: root }).activeAction, "session-open");
    assert.equal(inspectGitHostCoordinator({ projectRoot: root }).inventory?.sessions.find(session => session.hostHandleId === constructingFact.hostHandleId)?.phase, "creating");
    release(); assert.equal((await opening).ok, true);
    const live = desktopProjectExecutionInventory(root).sessions.find(session => session.hostHandleId === constructingFact.hostHandleId)!;
    assert.ok(live.coreSessionId); assert.equal(live.toolSurface?.sessionId, live.coreSessionId);
    assert.equal(live.toolSurface?.factoryProvenance, "custom-override");
    assert.equal(live.toolSurface?.native?.factory, "codex-chat");
    assert.equal(live.toolSurface?.nativeToolRegistry, "unknown"); assert.equal(live.toolSurface?.status, "unknown");
    assert.ok(live.toolSurface?.reasons.includes("custom-provider-factory-unverified"));
    assert.equal(live.toolSurface?.filesystemConfinement, "unknown");
    assert.ok(revisions.length >= 2); assert.ok(revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]!));
    await manager.stop(null);
    const after = desktopProjectExecutionInventory(root);
    const disposed = after.sessions.find(session => session.hostHandleId === live.hostHandleId)!;
    assert.equal(disposed.phase, "disposed"); assert.equal(after.coverage, "unknown");
    assert.equal(disposed.coreSessionId, live.coreSessionId);
    console.log("W52_W3_ACTUAL_UNKNOWN_ASSERTIONS_COMPLETED", JSON.stringify({ coreSessionId: live.coreSessionId, phase: disposed.phase, coverage: after.coverage, factoryProvenance: live.toolSurface?.factoryProvenance, nativeToolRegistry: live.toolSurface?.nativeToolRegistry }));
    assert.equal(after.sessions.filter(session => session.phase === "open-failed").length, 1, "A rejected creation is not erased to pretend complete inventory");
    if (process.env.ANS_W3_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W3_EVIDENCE_DIR, "custom-source-proof.json"), JSON.stringify({ creating, live, after, revisions }, null, 2));
  } finally { release(); unsubscribe(); await manager.stop(null); await fs.rm(root, { recursive: true, force: true }); }
});


test("W5 专字段真实workSourceRef：空目录native来源、父轮结束/焦点切换不撤child、伪来源拒绝", async (t) => {
  const priorWire = process.env.ANS_CODEX_WIRE_API, priorKey = process.env.ANS_W4_LOCAL_HTTP_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W4_LOCAL_HTTP_KEY = "fixture-only";
  const proofs: unknown[] = [];
  const disposalProofs: Array<{ mode: string; before: ReturnType<typeof inspectRuntimeCoreRegistry>; after: ReturnType<typeof inspectRuntimeCoreRegistry> }> = [];
  try {
    for (const mode of ["enumerated", "selected", "cancelled", "changed", "model-source", "commit-race"] as const) {
      await t.test(mode, async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), `ans-w4-${mode}-`));
      let primaryFailure: unknown;
      assert.deepEqual(await fs.readdir(root), [], "Actual empty start; no fixture init/docs/approval/pin");
      const trace: Array<{ role: string; step: number; tools: string[]; toolResponses: string[] }> = [];
      const counts = new Map<string, number>(); let picks = 0;
      const positive = mode === "selected" || mode === "commit-race";
      let nextPickedRoot: string | undefined;
      let sourceLeaseObserved = false;
      let busySelectionAttempt: Promise<{ ok: boolean; message?: string }> | undefined;
      let sourceObserver: ReturnType<typeof setInterval> | undefined;
      let desktop: ReturnType<typeof createDesktopInterface> | undefined;
      let releaseConvener!: () => void;
      const convenerPermit = new Promise<void>(resolve => { releaseConvener = resolve; });
      const extraRoots: string[] = [];
      const server = createServer(async (request, response) => {
        let raw = ""; for await (const chunk of request) raw += chunk;
        const body = JSON.parse(raw);
        const tools: string[] = body.tools?.map((tool: { function: { name: string } }) => tool.function.name) ?? [];
        const role = tools.includes("ans_role_activity_log") ? "chief" : "convener";
        const step = counts.get(role) ?? 0; counts.set(role, step + 1);
        trace.push({ role, step, tools, toolResponses: body.messages.filter((message: { role: string }) => message.role === "tool")
          .map((message: { content: unknown }) => String(message.content)) });
        if (role === "chief" && step === 0 && mode === "changed") assert.equal(await desktop!.pickProject(), null);
        if (role === "convener" && step === 0) await convenerPermit;
        const call = role === "chief" ? { name: "ans_dispatch_task", arguments: JSON.stringify({ roleId: "convener",
          flowId: "w4-new", sideEffect: "docs", idempotencyKey: "w4-empty-convener",
          requestedEvidence: ["用户希望保留的真实证据说明", "ans-work-source:user-text-is-not-authority"],
          ...(mode === "model-source" ? { workSourceRef: { kind: "chief-customer-turn", sourceId: `init-source-${"0".repeat(64)}`,
            path: `.ans/trunk/initialization-sources/init-source-${"0".repeat(64)}.json`, sha256: "0".repeat(64) } } : {}),
          task: "在当前新目录执行受控仓库初始化，按真实工具回执报告；不预填未来方案或角色文件。" }) }
          : { name: "ans_git_candidate", arguments: JSON.stringify({ operationId: "w4-init", action: "init",
              base: { ref: "refs/ans/trunk", oid: null }, message: "initial repository" }) };
        const message = step === 0 ? { role: "assistant", content: null,
          tool_calls: [{ id: `${role}-w4`, type: "function", function: call }] }
          : { role: "assistant", content: "有限本地HTTP脚本结束；以真实工具回执为准。" };
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ id: "w4-local", object: "chat.completion", choices: [{ index: 0,
          finish_reason: step === 0 ? "tool_calls" : "stop", message }] }));
      });
      try {
        await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
        const address = server.address(); assert.ok(address && typeof address !== "string");
        desktop = createDesktopInterface({ pickDirectory: async () => {
          assert.equal(inspectGitHostCoordinator({ projectRoot: root }).activeAction, undefined, "No host lease is held while waiting on the native dialog");
          return ++picks === 1 ? root : nextPickedRoot ?? null;
        }, emitEvent() {},
          runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W4_LOCAL_HTTP_KEY",
            modelId: "w4-local-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 2000, turnLastResortMs: 5000 },
          envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
        if (mode !== "enumerated") assert.equal(await desktop.pickProject(), root);
        await desktop.listProject({ projectRoot: root });
        if (mode === "cancelled") assert.equal(await desktop.pickProject(), null);
        assert.ok((await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" })).ok);
        if (mode === "commit-race") {
          nextPickedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w6-native-other-")); extraRoots.push(nextPickedRoot);
          sourceObserver = setInterval(() => {
            if (!busySelectionAttempt && inspectGitHostCoordinator({ projectRoot: root }).activeAction === "dispatch") {
              sourceLeaseObserved = true;
              busySelectionAttempt = desktop!.pickProject().then(() => ({ ok: true }), error => ({ ok: false, message: String(error) }));
            }
          }, 0);
        }
        const sent = await desktop.sendSession({ text: "在这个新项目开始受控初始化。", target: { projectRoot: root, roleId: "chief", runtime: "codex" },
          metadata: { clientMessageId: `w4-real-customer-${mode}` } });
        assert.ok(sent.ok, sent.error ?? "send failed");
        const deadline = Date.now() + 6000;
        if (positive) {
          const chief = desktopProjectExecutionInventory(root).sessions.find(session => session.roleId === "chief");
          assert.equal(chief?.lifecycle?.status, "quiescent", "The actual parent chief turn settled before the child's init tool");
          let focusRoot: string;
          if (mode === "commit-race") {
            assert.equal(sourceLeaseObserved, true, "Observed the actual dispatch/ledger await lease, without stubbing the append");
            assert.ok(busySelectionAttempt); const attempt = await busySelectionAttempt;
            assert.equal(attempt.ok, false, "An old-root source cannot be cleared during the actual child's append");
            assert.match(attempt.message ?? "", /选择尚未更改/); assert.equal(picks, 1, "Busy source mutation does not open another native dialog");
            clearInterval(sourceObserver);
            focusRoot = nextPickedRoot!;
            assert.equal(await desktop.pickProject(), focusRoot, "A new-root selection can retry after the real child commit");
            assert.equal(inspectGitHostCoordinator({ projectRoot: root }).activeAction, undefined);
          } else {
            focusRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w5-other-focus-")); extraRoots.push(focusRoot);
          }
          await desktop.listProject({ projectRoot: focusRoot });
          releaseConvener();
          while ((counts.get("convener") ?? 0) < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 15));
        }
        const tasks = await readTaskState(root), created = [...tasks.records.values()].filter(task => task.created?.to === "convener");
        const inventory = desktopProjectExecutionInventory(root);
        proofs.push({ mode, root, picks, sourceLeaseObserved, trace, tasks: created.map(task => task.created), inventory });
        if (positive) {
          assert.equal(created.length, 1, JSON.stringify(trace));
          const child = created[0]!.created!;
          assert.equal(child.flowId, "w4-new"); assert.ok(child.runId);
          assert.deepEqual(child.requestedEvidence, ["用户希望保留的真实证据说明", "ans-work-source:user-text-is-not-authority"], "User evidence has no hidden host markers or reserved-prefix semantics");
          assert.equal(child.workSourceRef?.kind, "chief-customer-turn"); assert.ok(child.workSourceRef);
          const sourceBytes = await fs.readFile(path.join(root, child.workSourceRef.path));
          assert.equal(createHash("sha256").update(sourceBytes).digest("hex"), child.workSourceRef.sha256);
          const sourceRecord = JSON.parse(sourceBytes.toString("utf8"));
          assert.equal(sourceRecord.schema, "repository-work-source/v1"); assert.equal(sourceRecord.kind, "customer-turn");
          assert.equal(sourceRecord.flowId, child.flowId); assert.equal(sourceRecord.sourceId, child.workSourceRef.sourceId);
          assert.equal(sourceRecord.parent.kind, "message"); assert.equal(sourceRecord.parent.clientMessageId, `w4-real-customer-${mode}`);
          assert.equal(sourceRecord.parent.sessionId, inventory.sessions.find(session => session.roleId === "chief")!.coreSessionId);
          assert.equal(sourceRecord.parent.inputAccepted, true); assert.equal(sourceRecord.parent.settled, false);
          assert.equal("parentTaskId" in sourceRecord, false); assert.equal("approved" in sourceRecord, false);
          // A historical plain task line remains plain on actual parser/replay, with no migration writes.
          const legacyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w5-history-")); extraRoots.push(legacyRoot);
          await fs.mkdir(path.join(legacyRoot, ".ans/state"), { recursive: true });
          const legacy = { ...child }; delete legacy.workSourceRef;
          const historyBytes = Buffer.from(JSON.stringify(legacy) + "\n");
          const historyPath = path.join(legacyRoot, ".ans/state/tasks.jsonl"); await fs.writeFile(historyPath, historyBytes);
          const historical = await readTaskState(legacyRoot);
          assert.equal(historical.records.get(child.taskId)?.created?.workSourceRef, undefined);
          assert.deepEqual(await fs.readFile(historyPath), historyBytes);
          assert.equal(counts.get("convener"), 2, JSON.stringify(trace));
          assert.ok(inventory.sessions.some(session => session.roleId === "convener" && session.coreSessionId));
          const initText = trace.find(row => row.role === "convener" && row.step === 1)!.toolResponses.find(text => text.startsWith("git_candidate: "));
          assert.ok(initText); const initialized = JSON.parse(initText.slice("git_candidate: ".length));
          assert.equal(initialized.operationId, "w4-init"); assert.equal(initialized.status, "prepared");
          assert.match(initialized.candidate.hex, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/); assert.ok(Array.isArray(initialized.parents));
          assert.equal((await fs.stat(path.join(root, ".git"))).isDirectory(), true, "A real sourced init now reaches its actual repository effect; preparation is not published delivery");
        } else {
          assert.equal(created.length, 0, JSON.stringify(trace)); assert.equal(counts.has("convener"), false);
          assert.equal(inventory.sessions.some(session => session.roleId === "convener"), false);
        }
      } catch (error) { primaryFailure = error; console.error("W52 W5 primary failure", mode, error); throw error; } finally {
        const cleanupErrors: unknown[] = [];
        const attempt = async (action: () => Promise<unknown>) => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
        clearInterval(sourceObserver); releaseConvener();
        const before = inspectRuntimeCoreRegistry();
        if (desktop) {
          const targets = new Map(desktopProjectExecutionInventory(root).sessions.filter(row => row.phase === "live" || row.phase === "creating").map(row => [row.roleId + "\0" + row.runtime, { projectRoot: root, roleId: row.roleId, runtime: row.runtime }]));
          for (const target of targets.values()) await attempt(async () => { const stopped = await desktop!.stopSession(target); assert.ok(stopped.ok, JSON.stringify(stopped)); });
          await attempt(() => desktop!.stopSession());
        }
        disposalProofs.push({ mode, before, after: inspectRuntimeCoreRegistry() });
        await attempt(async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
        if (!process.env.ANS_W4_EVIDENCE_DIR) {
          await attempt(() => fs.rm(root, { recursive: true, force: true }));
          for (const extraRoot of extraRoots) await attempt(() => fs.rm(extraRoot, { recursive: true, force: true }));
        }
        if (cleanupErrors.length) throw new AggregateError([...(primaryFailure === undefined ? [] : [primaryFailure]), ...cleanupErrors], "W5 primary/owned cleanup failures retained");
      }
      });
    }
  } finally {
    if (process.env.ANS_W4_EVIDENCE_DIR) {
      await fs.writeFile(path.join(process.env.ANS_W4_EVIDENCE_DIR, "bootstrap-route-proof.json"), JSON.stringify(proofs, null, 2));
      await fs.writeFile(path.join(process.env.ANS_W4_EVIDENCE_DIR, "runtime-core-disposal-proof.json"), JSON.stringify(disposalProofs, null, 2));
    }
    if (priorWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = priorWire;
    if (priorKey === undefined) delete process.env.ANS_W4_LOCAL_HTTP_KEY; else process.env.ANS_W4_LOCAL_HTTP_KEY = priorKey;
  }
});


test("W10 fresh scope分流：unmanaged原四路径/轮次护栏；required私有guard；unknown拒bind", async (t) => {
  for (const mode of ["unmanaged", "unmanaged-system", "required", "unknown"] as const) await t.test(mode, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w9-install-effects-"));
  const priorWire = process.env.ANS_CODEX_WIRE_API, priorKey = process.env.ANS_W9_LOCAL_HTTP_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W9_LOCAL_HTTP_KEY = "fixture-only";
  const toolNames = ["install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp"];
  const bodies: Array<{ tools: Array<{ function: { name: string } }>; messages: Array<{ role: string; content: unknown }> }> = [];
  let manager: SessionManager | undefined;
  let preparationDesktop: ReturnType<typeof createDesktopInterface> | undefined;
  let primaryFailure: unknown;
  let phase: "source" | "callbacks" = mode === "required" ? "source" : "callbacks";
  const sourceTurns = new Map<string, number>();
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    bodies.push(JSON.parse(raw));
    if (phase === "source") {
      const body = bodies[bodies.length - 1]!;
      const role = body.tools.some(tool => tool.function.name === "ans_role_activity_log") ? "chief" : "convener";
      const step = sourceTurns.get(role) ?? 0; sourceTurns.set(role, step + 1);
      const message = role === "chief" && step === 0 ? { role: "assistant", content: null, tool_calls: [{ id: "w10-source-dispatch", type: "function",
        function: { name: "ans_dispatch_task", arguments: JSON.stringify({ roleId: "convener", flowId: "w10-scope",
          task: "核对当前新项目初始化所需的实际来源，按实际回执报告。", sideEffect: "read-only", idempotencyKey: "w10-actual-source" }) } }] }
        : { role: "assistant", content: "实际来源请求已结束，不代为批准或提交Git。" };
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: "w10-source-local", object: "chat.completion", choices: [{ index: 0,
        finish_reason: role === "chief" && step === 0 ? "tool_calls" : "stop", message }] })); return;
    }
    const message = bodies.length === 1 ? { role: "assistant", content: null,
      tool_calls: toolNames.map((name, index) => ({ id: `w9-${index}`, type: "function",
        function: { name: `ans_${name}`, arguments: JSON.stringify({ roleId: "worker", name: name.startsWith("uninstall") ? "owned-uninstall" : "owned-install" }) } })) }
      : { role: "assistant", content: "四项检查结束，请以每项真实工具回执区分生效、延后或拒绝。" };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "w9-local", object: "chat.completion", choices: [{ index: 0,
      finish_reason: bodies.length === 1 ? "tool_calls" : "stop", message }] }));
  });
  const files = ["docs/skills/owned-install/SKILL.md", "docs/skills/owned-install/install.md", "docs/mcp/owned-install.md",
    "docs/skills/owned-uninstall/SKILL.md", "docs/skills/owned-uninstall/install.md", "docs/mcp/owned-uninstall.md"];
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address !== "string");
    if (mode === "required") {
      assert.deepEqual(await fs.readdir(root), [], "Real managed work-source begins from an actual empty fixture root");
      preparationDesktop = createDesktopInterface({ pickDirectory: async () => root, emitEvent() {},
        runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W9_LOCAL_HTTP_KEY", modelId: "w10-source-local",
          requestAttemptMax: 1, requestFirstByteTimeoutMs: 2000, turnLastResortMs: 5000 }, envFilePath: path.join(root, ".env"), piConfigEnv: {} });
      assert.equal(await preparationDesktop.pickProject(), root); await preparationDesktop.listProject({ projectRoot: root });
      assert.ok((await preparationDesktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" })).ok);
      assert.ok((await preparationDesktop.sendSession({ text: "请从这个实际新目录开始核对初始化来源。", target: { projectRoot: root, roleId: "chief", runtime: "codex" },
        metadata: { clientMessageId: "w10-real-source" } })).ok);
      const actualTask = [...(await readTaskState(root)).records.values()].find(task => task.created?.workSourceRef);
      assert.ok(actualTask?.created?.workSourceRef, "The required scope comes from an actual accepted customer turn and child ledger, not a fixture marker");
      const preparationTargets = new Map(desktopProjectExecutionInventory(root).sessions.filter(row => row.phase === "live" || row.phase === "creating").map(row => [row.roleId + "\0" + row.runtime, { projectRoot: root, roleId: row.roleId, runtime: row.runtime }]));
      for (const target of preparationTargets.values()) { const stopped: StopResult = await preparationDesktop.stopSession(target); assert.ok(stopped.ok, JSON.stringify(stopped)); }
      await preparationDesktop.stopSession(); phase = "callbacks"; bodies.length = 0;
    }
    await fs.mkdir(path.join(root, ".ans"), { recursive: true });
    await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio" }));
    // Raw legacy role/configuration fixtures grant no acceptance, D3, active state or execution task.
    await fs.mkdir(path.join(root, "角色卡/worker"), { recursive: true });
    await fs.writeFile(path.join(root, "角色卡/worker/role-card.md"), "# Worker\nOwned inactive legacy fixture.\n");
    await fs.writeFile(path.join(root, "角色卡/worker/boundary.yaml"), "role: worker\nentries:\n  - kind: file\n    path: src/worker.ts\n    purpose: owned fixture\n");
    for (const relative of files) {
      await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      const status = relative.includes("uninstall") ? "uninstalled" : "installed";
      const text = relative.endsWith("SKILL.md") ? "# Owned instruction fixture\nNo executable content.\n"
        : `- 用途：owned fixture\n- 适用角色：worker\n- 状态：${status}\n- 安装日期：2026-11-05\n${relative.startsWith("docs/mcp/") ? "- 启动：owned-command-never-started\n" : ""}`;
      await fs.writeFile(path.join(root, relative), text);
    }
    if (mode === "unknown") await fs.writeFile(path.join(root, ".git"), "gitdir: missing-owned-metadata\n");
    const actualScope = await readRoleCapabilityProtectionScope({ projectRoot: root });
    assert.equal(actualScope.state, mode === "required" ? "required" : mode === "unknown" ? "unknown" : "unmanaged");
    const before = await Promise.all(files.map(async relative => [relative, createHash("sha256").update(await fs.readFile(path.join(root, relative))).digest("hex")]));
    let actualListing = await readActualProject(root);
    assert.ok(actualListing.roles.some(role => role.roleId === "nominator" && role.governanceFunction === "nomination"));
    assert.ok(actualListing.roles.some(role => role.roleId === "worker" && !role.builtIn));
    manager = new SessionManager({ openRoleSession, createRuntimeAdapterFactory, buildProjectConfig,
      getListing: projectRoot => projectRoot === root ? actualListing : undefined,
      refreshListing: async projectRoot => { actualListing = await readActualProject(projectRoot); }, emitEvent() {},
      createPiAdapterFactory: (project, shellGate) => createRuntimeAdapterFactory(project, "pi", { shellGate }),
      createDemoAdapter() { throw new Error("W9 exercises only the actual Codex factory"); },
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W9_LOCAL_HTTP_KEY",
        modelId: "w9-local-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 2000, turnLastResortMs: 5000 } });
    if (mode !== "unknown") assert.ok((await manager.open({ projectRoot: root, roleId: "chief", runtime: "codex" })).ok,
      "Actual chief Codex selection keeps original install notifications on the same owned loopback runtime");
    const opened = await manager.open({ projectRoot: root, roleId: "nominator", runtime: "codex" });
    if (mode === "unknown") {
      assert.equal(opened.ok, false); assert.equal(bodies.length, 0, "Unknown physical scope rejects before native inference");
      assert.equal(manager.installationEffectObservations(root).length, 0);
      const after = await Promise.all(files.map(async relative => [relative, createHash("sha256").update(await fs.readFile(path.join(root, relative))).digest("hex")]));
      assert.deepEqual(after, before); return;
    }
    assert.ok(opened.ok, opened.error ?? "open failed");
    const sent = await manager.send("内部核对：依实际回执检查四项安装能力的前效拒绝。", undefined,
      { projectRoot: root, roleId: "nominator", runtime: "codex" }, { ...(mode === "unmanaged-system" ? { background: true, kind: "system" as const } : {}), clientMessageId: `w10-owned-${mode}` });
    assert.ok(sent.ok, sent.error ?? "send failed");
    const nominationBodies = bodies.filter(body => body.tools.some(tool => tool.function.name === "ans_install_skill"));
    const chiefBodies = bodies.filter(body => body.tools.some(tool => tool.function.name === "ans_role_activity_log"));
    assert.equal(nominationBodies.length, 2, "Exactly one actual four-tool call and its inference continuation");
    assert.ok(chiefBodies.length >= 1, "Original install notices and handback keep their true chief report chain");
    assert.equal(bodies.length, nominationBodies.length + chiefBodies.length, "No target-worker inference or unknown controller is introduced");
    for (const name of toolNames) assert.ok(nominationBodies[0]!.tools.some(tool => tool.function.name === `ans_${name}`), "Tools stay visible, not silently removed");
    const results = nominationBodies[1]!.messages.filter(message => message.role === "tool"); assert.equal(results.length, 4);
    for (const result of results) {
      if (mode === "unmanaged") { assert.match(String(result.content), /已安装|已卸载/); assert.doesNotMatch(String(result.content), /effect-scope-unproven/); }
      else assert.match(String(result.content), mode === "required" ? /effect-scope-unproven/ : /not-customer-turn/);
    }
    const observations = manager.installationEffectObservations(root);
    assert.equal(observations.length, 0, "Protected calls use Core private identity; unmanaged calls retain the original business path");
    const inventory = desktopProjectExecutionInventory(root);
    assert.deepEqual(inventory.sessions.filter(session => session.phase === "live").map(session => session.roleId).sort(), ["chief", "nominator"]);
    assert.ok(inventory.sessions.filter(session => session.roleId === "convener").every(session => session.phase === "disposed"),
      "Actual source-preparation actors remain in the full inventory after real disposal");
    const core = inventory.sessions.find(session => session.roleId === "nominator")!; assert.ok(core.coreSessionId);
    assert.equal(core.roleId, "nominator"); assert.equal(core.toolSurface?.factoryProvenance, "default-production");
    if (mode === "required") {
      const facts = core.toolSurface?.roleCapabilityGuards; assert.equal(facts?.status, "bound");
      assert.equal(facts?.source, "core-blocked-role-capability-callbacks");
      assert.deepEqual([...(facts?.guardedTools ?? [])].sort(), [...toolNames].sort());
      assert.deepEqual(facts?.unguardedTools, []); assert.equal(facts?.sessionId, core.coreSessionId);
    }
    const after = await Promise.all(files.map(async relative => [relative, createHash("sha256").update(await fs.readFile(path.join(root, relative))).digest("hex")]));
    assert.deepEqual(after, before); assert.equal(inventory.sessions.some(session => session.roleId === "worker"), false);
    if (process.env.ANS_W9_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W9_EVIDENCE_DIR, `four-callback-scope-${mode}.json`),
      JSON.stringify({ root, toolNames: bodies[0]!.tools.map(tool => tool.function.name), results, observations, inventory, before, after }, null, 2));
  } catch (error) { primaryFailure = error; console.error("W52 W10 primary failure before cleanup", mode, error); throw error; } finally {
    const cleanupErrors: unknown[] = [];
    const attempt = async (action: () => Promise<unknown>) => { try { await action(); } catch (error) { cleanupErrors.push(error); } };
    const evidenceDirectory = process.env.ANS_W9_EVIDENCE_DIR;
    if (evidenceDirectory) await attempt(() => fs.writeFile(path.join(evidenceDirectory, `four-callback-http-${mode}.json`),
      JSON.stringify({ bodies: bodies.map((body, index) => ({ index, tools: body.tools.map(tool => tool.function.name),
        messages: body.messages.map(message => ({ role: message.role, content: message.role === "system" ? "[actual role instructions]" : message.content })) })),
        observations: manager?.installationEffectObservations(root) }, null, 2)));
    await attempt(async () => { await manager?.stop(null); });
    if (preparationDesktop) {
      const targets = new Map(desktopProjectExecutionInventory(root).sessions.filter(row => (row.roleId === "chief" || row.roleId === "convener") && (row.phase === "live" || row.phase === "creating")).map(row => [row.roleId + "\0" + row.runtime, { projectRoot: root, roleId: row.roleId, runtime: row.runtime }]));
      for (const target of targets.values()) await attempt(async () => { const stopped = await preparationDesktop!.stopSession(target); assert.ok(stopped.ok, JSON.stringify(stopped)); });
      await attempt(() => preparationDesktop!.stopSession());
    }
    await attempt(async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
    if (priorWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = priorWire;
    if (priorKey === undefined) delete process.env.ANS_W9_LOCAL_HTTP_KEY; else process.env.ANS_W9_LOCAL_HTTP_KEY = priorKey;
    if (!process.env.ANS_W9_EVIDENCE_DIR) await attempt(() => fs.rm(root, { recursive: true, force: true }));
    if (cleanupErrors.length) throw new AggregateError([...(primaryFailure === undefined ? [] : [primaryFailure]), ...cleanupErrors], "W10 primary/owned cleanup failures retained");
  }
  });
});


for (const target of ["worker", "verifier", "review"] as const) {
test(target === "worker" ? "W14 convener按本次真实任务冻结；缺完整执行闭包保stage/code且零worker任务/HTTP"
  : target === "verifier" ? "W23 Convener不能越Chief新建普通Verifier，零任务零HTTP"
  : "W22 Convener显式review也不能越Chief创建Verifier，零任务零HTTP", { timeout: 10000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w14-worker-freeze-"));
  const priorWire = process.env.ANS_CODEX_WIRE_API, priorKey = process.env.ANS_W14_LOCAL_HTTP_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W14_LOCAL_HTTP_KEY = "fixture-only";
  let desktop: ReturnType<typeof createDesktopInterface> | undefined;
  const trace: Array<{ role: string; toolMessages: string[]; currentTaskId?: string; coreSessionId?: string }> = [];
  const deliveryEvents: Parameters<Parameters<typeof createDesktopInterface>[0]["emitEvent"]>[0][] = [];
  const dispatched = new Set<string>(); let workerRequests = 0;
  const creating: Array<{ hostHandleId: string; taskId?: string; coreSessionId?: string }> = [];
  const unsubscribe = subscribeDesktopExecutionInventory(event => {
    if (event.projectRoot !== root || event.reason !== "session-creating") return;
    for (const session of desktopProjectExecutionInventory(root).sessions.filter(session => session.roleId === "convener" && session.phase === "creating")) {
      creating.push({ hostHandleId: session.hostHandleId, ...(session.taskId ? { taskId: session.taskId } : {}),
        ...(session.coreSessionId ? { coreSessionId: session.coreSessionId } : {}) });
    }
  });
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw), names: string[] = body.tools.map((tool: { function: { name: string } }) => tool.function.name);
    const role = names.includes("ans_role_activity_log") ? "chief" : names.includes("ans_dispatch_task") ? "convener" : target !== "worker" ? "verifier" : "worker";
    if (role === "worker") workerRequests++;
    const inventory = desktopProjectExecutionInventory(root), actor = inventory.sessions.find(session => session.roleId === role && session.phase === "live");
    trace.push({ role, toolMessages: body.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: unknown }) => String(message.content)),
      ...(actor?.taskId ? { currentTaskId: actor.taskId } : {}), ...(actor?.coreSessionId ? { coreSessionId: actor.coreSessionId } : {}) });
    const lastUser = [...body.messages].reverse().find((message: { role: string }) => message.role === "user");
    const text = typeof lastUser?.content === "string" ? lastUser.content : "";
    const incoming = body.messages.at(-1)?.role === "user";
    let call: { name: string; arguments: string } | undefined;
    if (role === "chief" && incoming && text.startsWith("W14 customer") && !dispatched.has(text)) {
      dispatched.add(text);
      call = { name: "ans_dispatch_task", arguments: JSON.stringify({ roleId: "convener", flowId: "w14-flow", sideEffect: "read-only",
        task: `W14 worker preflight ${text}`, idempotencyKey: `w14-parent-${dispatched.size}` }) };
    } else if (role === "convener" && incoming) {
      call = { name: "ans_dispatch_task", arguments: JSON.stringify({ roleId: target === "review" ? "verifier" : target, ...(target === "worker" ? { moduleId: "worker-core" } : {}), flowId: "w14-flow",
        ...(target === "review" ? { reviewTarget: { operationId: "w22-no-material-operation", candidate: { objectFormat: "sha1", hex: "a".repeat(40) } } } : {}),
        sideEffect: target === "worker" ? "code" : "read-only", task: "核对真实任务来源；缺材料请保原码拒绝，不补造。", requestedEvidence: ["plain user evidence"], idempotencyKey: `w15-child-${actor?.taskId}` }) };
    }
    const message = call ? { role: "assistant", content: null, tool_calls: [{ id: `w14-${trace.length}`, type: "function", function: call }] }
      : { role: "assistant", content: "已按真实回执结束，本次未宣称worker执行或通过。" };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "w14-local", object: "chat.completion", choices: [{ index: 0, finish_reason: call ? "tool_calls" : "stop", message }] }));
  });
  try {
    // Only raw owned role material exists: no accepted/D3/Active/run/pin is seeded.
    await fs.mkdir(path.join(root, "角色卡/worker"), { recursive: true });
    await fs.mkdir(path.join(root, ".ans"));
    await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio" }));
    await fs.writeFile(path.join(root, "角色卡/worker/role-card.md"), "# Worker\nInactive owned fixture.\n");
    await fs.writeFile(path.join(root, "角色卡/worker/boundary.yaml"), "role: worker\nentries:\n  - kind: directory\n    path: src/worker/\n    purpose: owned fixture\n");
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address !== "string");
    desktop = createDesktopInterface({ pickDirectory: async () => root, emitEvent(event) { deliveryEvents.push(event); },
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W14_LOCAL_HTTP_KEY", modelId: "w14-local-only",
        requestAttemptMax: 1, requestFirstByteTimeoutMs: 1500, turnLastResortMs: 4000 },
      envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
    assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root });
    assert.ok((await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" })).ok);
    const sent = await desktop.sendSession({ text: "W14 customer one", target: { projectRoot: root, roleId: "chief", runtime: "codex" },
      metadata: { clientMessageId: "w14-customer-one" } }); assert.ok(sent.ok, sent.error ?? "send failed");
    const deadline = Date.now() + 3500;
    while (!(target === "worker"
      ? trace.some(row => row.role === "convener" && row.toolMessages.some(message => message.includes("worker-freeze stage=")))
      : trace.some(row => row.role === "convener" && row.toolMessages.length > 0)) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 10));
    const tasks = await readTaskState(root);
    assert.ok(creating.length > 0, "Actual constructor observation must exist");
    for (const observed of creating) {
      assert.ok(observed.taskId); assert.equal(observed.coreSessionId, undefined, "Creating metadata precedes the real Core bind");
      const assigned = tasks.records.get(observed.taskId)?.created;
      assert.ok(assigned); assert.equal(assigned.from, "chief"); assert.equal(assigned.to, "convener"); assert.equal(assigned.flowId, "w14-flow");
      assert.equal(assigned.hubRouting, "chief-hub-v1");
    }
    assert.ok(trace.filter(row => row.role === "chief").every(row => row.currentTaskId === undefined), "Customer Chief never inherits its child's assignment or a fabricated root task");
    if (target === "worker") {
      const failures = trace.filter(row => row.role === "convener" && row.toolMessages.some(message => message.includes("worker-freeze stage=")));
      assert.equal(failures.length, 1, JSON.stringify(trace));
      const failed = failures[0]!; assert.ok(failed.currentTaskId);
      const reply = failed.toolMessages.find(message => message.includes("worker-freeze stage="))!;
      assert.match(reply, /stage=prepare code=trunk-verify-failed/); assert.match(reply, /effective-manifest-missing/);
      assert.ok(reply.includes(`parentTaskId=${failed.currentTaskId}`)); assert.doesNotMatch(reply, /任务状态登记写入失败/);
    } else {
      const parent = [...tasks.records.values()].find(record => record.created?.to === "convener");
      assert.ok(parent?.created); assert.equal(parent.created.runState, "draft");
      assert.equal([...tasks.records.values()].some(record => record.created?.to === "verifier"), false);
      const rejected = trace.find(row => row.role === "convener" && row.toolMessages.length > 0);
      assert.ok(rejected, JSON.stringify(trace)); assert.equal(rejected.currentTaskId, parent.taskId);
      if (target === "verifier") {
        assert.ok(rejected.toolMessages.some(message => message.includes("chief-hub-review-owner-required")), JSON.stringify(rejected));
        assert.ok(rejected.toolMessages.every(message => !message.includes("已受理")), "Missing default review target cannot degrade into an accepted unbound task");
      }
      else {
        assert.ok(rejected.toolMessages.some(message => message.includes("chief-hub-review-owner-required")), JSON.stringify(rejected));
        assert.ok(rejected.toolMessages.every(message => !message.includes("已受理")), "Missing immutable review material must never become an unbound accepted task");
      }
      assert.equal(trace.filter(row => row.role === "verifier").length, 0);
      assert.equal(desktopProjectExecutionInventory(root).sessions.some(session => session.roleId === "verifier"), false);
    }
    assert.equal([...tasks.records.values()].filter(task => task.created?.to === "worker").length, 0);
    assert.equal(workerRequests, 0);
    assert.equal(desktopProjectExecutionInventory(root).sessions.some(session => session.roleId === "worker"), false);
    const settledDeadline = Date.now() + 3500;
    while ((!deliveryEvents.some(row => row.roleId === "convener" && row.event.kind === "settled") || desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "convener")) && Date.now() < settledDeadline) await tick(10);
    assert.ok(deliveryEvents.some(row => row.roleId === "convener" && row.event.kind === "settled"), "The actual denied controller turn must settle before fixture cleanup");
    assert.equal(desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "convener"), false);
    console.log("W52 actual strong dispatch gate checks completed", JSON.stringify({ target, creating, workerRequests, targetTasks: [...tasks.records.values()].filter(record => record.created?.to === "worker" || record.created?.to === "verifier").map(record => record.taskId), chiefHasAssignment: trace.filter(row => row.role === "chief").some(row => row.currentTaskId !== undefined), replies: trace.filter(row => row.role === "convener").flatMap(row => row.toolMessages) }));
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, target === "worker" ? "w15-worker-freeze-proof.json" : target === "review" ? "w22-explicit-review-negative-proof.json" : "w23-default-review-negative-proof.json"),
      JSON.stringify({ root, creating, trace, workerRequests, tasks: [...tasks.records.values()], inventory: desktopProjectExecutionInventory(root) }, null, 2));
  } catch (error) { console.error("W52 original worker/review primary failure", error); throw error; } finally {
    unsubscribe();
    if (desktop) for (const session of desktopProjectExecutionInventory(root).sessions.filter(session => session.phase === "live"))
      await desktop.stopSession({ projectRoot: root, roleId: session.roleId, runtime: session.runtime });
    await desktop?.stopSession(); desktop?.disposeProjectDocuments(); server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (priorWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = priorWire;
    if (priorKey === undefined) delete process.env.ANS_W14_LOCAL_HTTP_KEY; else process.env.ANS_W14_LOCAL_HTTP_KEY = priorKey;
    if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true });
  }
});
}


test("W16 打开拒绝保队列不自旋；stop后的晚到通知不重开，显式open恢复", { timeout: 5000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w16-delivery-"));
  let attempts = 0, allowOpen = true;
  const sent: string[] = [], notes: string[] = [];
  const manager = new SessionManager({
    openRoleSession: async () => {
      attempts++;
      if (!allowOpen) throw new Error("runtime-creation-admission-unproven:runtime-prepared-configuration-changed");
      let closed = false, wake: (() => void) | undefined;
      const events: OrchestrationEvent[] = [];
      return { persistenceMode: "disabled",
        async send(text) { sent.push(text); events.push({ kind: "settled", summary: "层测试已接收" }); wake?.(); },
        async *events() { while (!closed) { const event = events.shift(); if (event) yield event; else await new Promise<void>(resolve => { wake = resolve; }); } },
        async dispose() { closed = true; wake?.(); },
      };
    },
    createPiAdapterFactory: () => { throw new Error("unexpected pi"); }, createDemoAdapter: () => { throw new Error("unused demo SDK"); },
    buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing(root) : undefined,
    emitEvent: envelope => { if (envelope.event.kind === "message") notes.push(envelope.event.summary); },
  });
  const target = { projectRoot: root, roleId: "chief", runtime: "demo" as const };
  try {
    assert.ok((await manager.open(target)).ok);
    allowOpen = false; assert.equal((await manager.rebuildSession(target)).ok, false);
    manager.watchdogDeliver(root, { text: "保留first", summary: "first", dedupKey: "w16-first" });
    const firstDeadline = Date.now() + 500;
    while (attempts < 3 && Date.now() < firstDeadline) await tick(5);
    assert.equal(attempts, 3); await tick(80); assert.equal(attempts, 3, "Open failure has no autonomous immediate retry");
    assert.equal(manager.executionInventoryFacts(root).queuedDispatches.length, 1);
    assert.ok(notes.some(note => note.includes("runtime-creation-admission-unproven")));
    await manager.stop(null);
    manager.watchdogDeliver(root, { text: "保留late", summary: "late", dedupKey: "w16-late" });
    await tick(80); assert.equal(attempts, 3, "Stopped lifecycle must retain late work without starting a new runtime");
    assert.equal(manager.executionInventoryFacts(root).queuedDispatches.length, 2);
    await manager.redeliverNudge(target);
    assert.equal(attempts, 3, "A generic retry nudge can be automatic and must not resume a stopped lifecycle");
    allowOpen = true; assert.ok((await manager.open(target)).ok);
    const resumeDeadline = Date.now() + 500;
    while (sent.length < 2 && Date.now() < resumeDeadline) await tick(5);
    assert.equal(attempts, 4); assert.deepEqual(sent, ["保留first", "保留late"]);
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, "w16-delivery-layer-proof.json"),
      JSON.stringify({ root, attempts, sent, notes, inventory: manager.executionInventoryFacts(root), scope: "Actual SessionManager layer; openRoleSession failure injection is not a Git/Core admission proof; CPU attribution remains unknown" }, null, 2));
  } finally { await manager.stop(null); if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true }); }
});


test("W16 在途open跨stop不安装晚到handle，真实dispose后保队列等待显式重试", { timeout: 5000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w16-open-stop-"));
  let attempts = 0, disposed = 0, release!: () => void, entered!: () => void;
  const inside = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const manager = new SessionManager({
    openRoleSession: async () => { attempts++; entered(); await gate; return {
      persistenceMode: "disabled", async send() {}, async *events() {}, async dispose() { disposed++; },
    }; },
    createPiAdapterFactory: () => { throw new Error("unexpected pi"); }, createDemoAdapter: () => { throw new Error("unused demo SDK"); },
    buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing(root) : undefined, emitEvent() {},
  });
  const target = { projectRoot: root, roleId: "chief", runtime: "demo" as const };
  try {
    const opening = manager.open(target); await inside;
    const stoppedDuringOpen = await manager.stop(null);
    assert.equal(stoppedDuringOpen.deliveryQueuePersistence?.completedSeq, stoppedDuringOpen.deliveryQueuePersistence?.targetSeq);
    assert.ok(manager.executionInventoryFacts(root).deliveryQueuePersistence[0]!.knownProducers.openChains > 0, "Finite queue-write completion must not pretend the intentionally gated old constructor is finished");
    release();
    const result = await opening;
    assert.equal(result.ok, false); assert.match(result.error ?? "", /会话已停止/);
    assert.equal(attempts, 1); assert.equal(disposed, 1); assert.equal(manager.isOpen(), false);
    const inventory = manager.executionInventoryFacts(root);
    assert.equal(inventory.sessions.length, 1); assert.equal(inventory.sessions[0]!.phase, "disposed");
    assert.equal(inventory.pendingOpens.length, 0);
  } finally { release(); await manager.stop(null); await fs.rm(root, { recursive: true, force: true }); }
});


test("W17 写后fallback经公开Pipeline登记实际字节；既有hook false保原拒绝", { timeout: 5000 }, async () => {
  for (const customFalse of [false, true]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w17-afterwrite-"));
    const rel = "docs/proposals/w17-flow-proposal-v1.md", abs = path.join(root, rel);
    const bytes = Buffer.from("---\r\nflowId: w17-flow\r\nversion: 1\r\n---\r\n# 真字节\r\n", "utf8");
    const stack = createVersionChangeStack({ projectRoot: root });
    await stack.ensureInitialized();
    // Owned external write observation is created after actual legacy migration; no approval is synthesized.
    await fs.mkdir(path.dirname(abs), { recursive: true }); await fs.writeFile(abs, bytes);
    let hook: NonNullable<Parameters<typeof createRuntimeAdapterFactory>[2]>["versionedDocAfterWrite"], customCalls = 0;
    const manager = new SessionManager({
      openRoleSession: async () => ({ persistenceMode: "disabled", async send() {}, async *events() {}, async dispose() {} }),
      createRuntimeAdapterFactory: (project, runtime, options = {}) => { hook = options.versionedDocAfterWrite; return createRuntimeAdapterFactory(project, runtime, options); },
      createPiAdapterFactory: () => { throw new Error("unused"); }, createDemoAdapter: () => { throw new Error("unused"); },
      buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing(root) : undefined,
      getVersionChangeStack: () => stack, emitEvent() {},
      ...(customFalse ? { runtimeOptions: { versionedDocAfterWrite: async () => { customCalls++; return false; } } } : {}),
    });
    try {
      assert.ok((await manager.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok); assert.ok(hook);
      const baseline = path.join(root, ".ans/state/versions.jsonl");
      const beforeBaseline = await fs.readFile(baseline).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
      const result = await hook(abs);
      assert.deepEqual(await fs.readFile(abs), bytes, "Registration never rewrites successful write bytes");
      if (customFalse) {
        assert.equal(result, false); assert.equal(customCalls, 1);
        const afterBaseline = await fs.readFile(baseline).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
        assert.deepEqual(afterBaseline, beforeBaseline, "Existing host hook false prevents fallback registration changes");
      } else {
        assert.equal(result, true);
        const rows = (await fs.readFile(baseline, "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
        if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, "w17-afterwrite-proof.json"),
          JSON.stringify({ root, rel, customFalse, result, rows, actualSha256: createHash("sha256").update(bytes).digest("hex"), exactBytesUnchanged: true,
            scope: "Actual SessionManager afterwrite callback plus public Pipeline registration; no role write or approval is synthesized" }, null, 2));
        assert.ok(rows.some(row => row.path === "docs/proposals/w17-flow-proposal" && row.version === 1 && row.sha256 === createHash("sha256").update(bytes).digest("hex")));
        await fs.writeFile(abs, Buffer.from("changed after baseline", "utf8"));
        assert.equal(await hook(abs), false, "Versioned body without its required version record retains registration failure semantics");
      }
    } finally { await manager.stop(null); if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true }); }
  }
});


test("W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界", { timeout: 10000 }, async (t) => {
  if (await isolateUnknownCoreCase(t.name, "W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED " + t.name)) return;
  // Layer fixture: real draft/ledger/parent CAS and Core/tool binding. This is not a worker/pin/RoleACL end-to-end proof.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w19-assignment-")), runId = "run-w19-assignment", flowId = "w19-flow";
  const parentId = "w19-controller", childId = "w19-planning-report", material = "docs/product/w19-flow-intent-v1.md", at = new Date().toISOString();
  const store = createFsTrunkStore(root);
  await fs.mkdir(path.join(root, "docs/product"), { recursive: true });
  await fs.writeFile(path.join(root, material), "---\nflowId: w19-flow\nversion: 1\n---\nActual owned planning evidence.\n");
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId, state: "draft", documents: {},
    execution: { teamPlan: null, flow: null }, createdAt: at })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId: parentId, from: "chief", to: "convener", flowId, runId,
    runState: "draft", text: "W19 initial actual assigned controller", sideEffect: "read-only", idempotencyKey: "w19-parent" } })).ok);
  const parent = await prepareParentTaskRef({ projectRoot: root, actorRoleId: "convener", taskId: parentId, flowId, runId }); assert.ok(parent.ok);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId: childId, from: "convener", to: "rapporteur", flowId, runId,
    runState: "draft", text: "W19 planning report data fixture", sideEffect: "read-only", idempotencyKey: "w19-child", parentTaskRef: parent.parentTaskRef } })).ok);
  const events: Parameters<Parameters<typeof createDesktopInterface>[0]["emitEvent"]>[0][] = []; let restored: unknown;
  const captures: Array<{ role: string; text: string; handback?: RoleSessionSendOptions["handback"]; git?: ToolResult; report?: ToolResult }> = [];
  const optionsByTurn: Array<{ role: string; text: string; options?: RoleSessionSendOptions["handback"] }> = [];
  let readyClose!: () => void, continueClose!: () => void, closeReady = false;
  const atClose = new Promise<void>(resolve => { readyClose = resolve; }), afterClose = new Promise<void>(resolve => { continueClose = resolve; });
  const provider = (options: RuntimeProviderOptions) => {
    const demo = createDemoRuntimeAdapter(options, []);
    return { ...demo, async bindRole(role: Parameters<typeof demo.bindRole>[0]) {
      const inner = await demo.bindRole(role);
      return { ...inner, async prompt(text: string, promptOptions?: Parameters<typeof inner.prompt>[1]) {
        const row: typeof captures[number] = { role: role.id, text }; captures.push(row);
        if (role.id === "convener" && text.includes("W19 close while turn")) { closeReady = true; readyClose(); await afterClose; }
        if (role.id === "convener" || role.id === "chief" && text.includes("W19 new customer")) {
          const query = options.tools.find(tool => tool.name === "git_query"); assert.ok(query);
          row.git = await query.handler({ name: "git_query", args: { operationId: `w19-query-${captures.length}`, template: "status" }, toolCallId: `w19-query-${captures.length}` });
        }
        if (role.id === "rapporteur" || role.id === "convener" && !text.includes("W19 close while turn") && !text.includes("W19 actual planning report")) {
          const report = options.tools.find(tool => tool.name === "submit_report"); assert.ok(report);
          row.report = await report.handler({ name: "submit_report", args: { status: text.includes("initial actual") ? "blocked" : "completed",
            summary: role.id === "rapporteur" ? "W19 actual planning report" : text.includes("W19 notice") ? "W19 notice response" : "W19 controller continuation", evidence: [material] }, toolCallId: `w19-report-${captures.length}` });
        }
        await inner.prompt(text, promptOptions);
      } };
    } };
  };
  const actualListing = listing(root);
  actualListing.roles.push({ roleId: "rapporteur", builtIn: true, governanceFunction: "proposal", cardPath: "", boundaryPath: "", cardText: "rapporteur",
    boundary: { entries: [], boundarySource: "<builtin:rapporteur>", acceptance: { accepted: false, source: "" } } });
  const manager = new SessionManager({
    openRoleSession: async (input, deps) => { const handle = await openRoleSession(input, deps); return { ...handle,
      async send(text, options) { optionsByTurn.push({ role: input.roleId, text, options: options?.handback ? structuredClone(options.handback) : undefined }); return handle.send(text, options); },
    }; },
    createRuntimeAdapterFactory, runtimeOptions: { providerFactories: { codex: provider } },
    createPiAdapterFactory: () => { throw new Error("unused pi"); }, createDemoAdapter: () => { throw new Error("unused demo"); },
    buildProjectConfig, getListing: projectRoot => projectRoot === root ? actualListing : undefined, emitEvent(event) { events.push(event); },
  });
  const target = { projectRoot: root, roleId: "convener", runtime: "codex" as const };
  const waitFor = async (predicate: () => boolean, message: string) => { const deadline = Date.now() + 2500; while (!predicate() && Date.now() < deadline) await tick(10); assert.ok(predicate(), message); };
  try {
    const controllerOpened = await manager.open({ ...target, taskId: parentId }); assert.ok(controllerOpened.ok, controllerOpened.error ?? "Controller did not open");
    const reporterOpened = await manager.open({ ...target, roleId: "rapporteur", taskId: childId }); assert.ok(reporterOpened.ok, reporterOpened.error ?? "Reporter did not open");
    restored = await manager.listTasks(root);
    assert.ok((await manager.sendBackground({ ...target, text: "W19 initial actual assigned controller", kind: "system", identitySeed: "w19-initial" })).ok);
    assert.ok((await manager.sendBackground({ ...target, roleId: "rapporteur", text: "W19 planning report", kind: "system", identitySeed: "w19-report" })).ok);
    await waitFor(() => optionsByTurn.some(row => row.role === "convener" && row.text.includes("W19 actual planning report")), JSON.stringify(captures));
    await waitFor(() => !manager.executionInventoryFacts(root).activeDeliveries.some(item => item.roleId === "convener"), "Controller report round must settle naturally");
    const initial = optionsByTurn.find(row => row.role === "convener" && row.text.includes("initial actual"));
    const continued = optionsByTurn.find(row => row.role === "convener" && row.text.includes("W19 actual planning report"));
    assert.deepEqual(initial?.options, { required: true, taskId: parentId }); assert.deepEqual(continued?.options, { required: true, taskId: parentId });
    assert.notEqual(continued?.options?.taskId, childId);
    await waitFor(() => events.some(event => event.roleId === "convener" && event.event.kind === "handback" && event.event.report?.taskId === parentId && event.event.report?.origin === "terminal-fallback"), "Real child-report continuation without an explicit report must still produce a fallback");
    const fallback = events.find(event => event.roleId === "convener" && event.event.kind === "handback" && event.event.report?.taskId === parentId && event.event.report?.origin === "terminal-fallback");
    const fallbackTurn = fallback?.event.kind === "handback" ? fallback.event.report?.source.turnId : undefined;
    const fallbackEnd = Date.now() + 1500;
    while (!(await readTaskState(root)).records.get(parentId)?.reports.some(report => report.turnId === fallbackTurn) && Date.now() < fallbackEnd) await tick(10);
    const state = await readTaskState(root);
    assert.equal(state.records.get(parentId)?.reports.find(report => report.turnId === fallbackTurn)?.status, "blocked", "Real assigned continuation still owes a report");
    assert.ok(state.records.get(parentId)?.reports.some(report => report.summary === "W19 controller continuation"));
    assert.ok(captures.some(row => row.role === "convener" && row.text.includes("W19 actual planning report") && row.git));
    const wrong = await manager.open({ ...target, taskId: childId }); assert.equal(wrong.ok, false, "A child's other-role assignment cannot become this controller");
    await manager.sendBackground({ ...target, text: "W19 notice", kind: "system", identitySeed: "w19-notice" });
    await waitFor(() => optionsByTurn.some(row => row.text === "W19 notice"), "System continuation did not arrive");
    assert.deepEqual(optionsByTurn.find(row => row.text === "W19 notice")?.options, { required: true, taskId: parentId });
    await waitFor(() => !manager.executionInventoryFacts(root).activeDeliveries.some(item => item.roleId === "convener"), "Notice must settle");
    const closeTurn = manager.sendBackground({ ...target, text: "W19 close while turn", kind: "system", identitySeed: "w19-close" });
    await waitFor(() => closeReady, "Close-race prompt must reach the actual SDK boundary");
    await atClose;
    const basis = await prepareCreatedTaskClose({ projectRoot: root, actorRoleId: "chief", taskId: parentId }); assert.ok(basis.ok, JSON.stringify(basis));
    let actualCloseNotice: Parameters<SessionManager["queueDirectNotification"]>[1] | undefined;
    const closed = await createDirectRoleRuntime({ projectRoot: root, actorRoleId: "chief", notifyDirect: async input => {
      if (input.recipientRoleId === "convener") { actualCloseNotice = structuredClone(input); await manager.queueDirectNotification(root, input); }
    } }).closeCreatedTask({ operationId: "w19-close-parent", taskId: parentId,
      runId, basisDigest: basis.basisDigest, reportRef: basis.reportRef, outcome: "accepted" });
    assert.ok(["applied", "committed-pending-recovery"].includes(closed.status));
    assert.equal((await readTaskState(root)).records.get(parentId)?.closed?.outcome, "accepted", "The creator API must actually persist task.closed before this is a closed-parent test");
    assert.ok(actualCloseNotice, "The actual creator receipt must supply notification source");
    continueClose(); await closeTurn;
    await waitFor(() => !manager.executionInventoryFacts(root).queuedDispatches.some(row => row.roleId === "convener" && row.kind === "system"), "Exact closed notice must leave the queue without another model prompt");
    assert.equal(captures.some(row => row.role === "convener" && row.text.includes(actualCloseNotice!.message)), false);
    await waitFor(() => captures.some(row => row.text === "W19 close while turn" && row.git), "Fresh Git callback was not observed");
    assert.match(captures.find(row => row.text === "W19 close while turn")!.git!.message, /delivery-assignment-unavailable/);
    const closedBefore = captures.filter(row => row.role === "convener").length;
    const refused = await manager.sendBackground({ ...target, text: "W19 stale notice", kind: "system", identitySeed: "w19-stale" });
    assert.equal(refused.ok, false); assert.equal(captures.filter(row => row.role === "convener").length, closedBefore, "A closed parent cannot start another controller prompt; independent chief feedback remains legitimate");
    assert.equal(captures.some(row => row.role === "convener" && row.text === "W19 stale notice"), false);
    // A real close receipt can concern another role's child, while this recipient still binds its older closed task.
    const childBasis = await prepareCreatedTaskClose({ projectRoot: root, actorRoleId: "convener", taskId: childId });
    assert.ok(childBasis.ok, JSON.stringify(childBasis));
    let thirdPartyNotice: Parameters<SessionManager["queueDirectNotification"]>[1] | undefined;
    let thirdPartyQueued: ReturnType<SessionManager["executionInventoryFacts"]>["queuedDispatches"][number] | undefined;
    const closedChild = await createDirectRoleRuntime({ projectRoot: root, actorRoleId: "convener", notifyDirect: async input => {
      if (input.recipientRoleId === "convener") {
        thirdPartyNotice = structuredClone(input);
        const queued = manager.queueDirectNotification(root, input);
        thirdPartyQueued = manager.executionInventoryFacts(root).queuedDispatches.find(row => row.operationId === input.source.operationId);
        await queued;
      }
    } }).closeCreatedTask({ operationId: "w25-close-other-role-child", taskId: childId, runId,
      basisDigest: childBasis.basisDigest, reportRef: childBasis.reportRef, outcome: "accepted" });
    assert.ok(["applied", "committed-pending-recovery"].includes(closedChild.status), JSON.stringify(closedChild));
    assert.equal((await readTaskState(root)).records.get(childId)?.closed?.outcome, "accepted");
    assert.ok(thirdPartyNotice); assert.ok(thirdPartyQueued);
    assert.equal(thirdPartyQueued.systemAssignmentTaskId, parentId, "The notification recipient still has its actual older closed assignment");
    assert.equal(thirdPartyQueued.notificationSource?.operationId, "w25-close-other-role-child");
    assert.notEqual(childId, thirdPartyQueued.systemAssignmentTaskId, "The actual closed source object is distinct from recipient work identity");
    await waitFor(() => !manager.executionInventoryFacts(root).queuedDispatches.some(row => row.queueEntryId === thirdPartyQueued!.queueEntryId), "Exact third-party close notice must become information rather than a permanently blocked old task turn");
    assert.equal(captures.some(row => row.role === "convener" && row.text.includes(thirdPartyNotice!.message)), false, "Information disposition does not create a new model work turn");
    console.log("W52_UNKNOWN_CASE_ASSERTIONS_COMPLETED", t.name);
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w33-manual"}-w25-third-party-close-notice-proof.json`),
      JSON.stringify({ root, parentId, childId, thirdPartyNotice, thirdPartyQueued, queueAfter: manager.executionInventoryFacts(root).queuedDispatches, state: await readTaskState(root) }, null, 2));
    await manager.queueDirectNotification(root, { ...actualCloseNotice!, key: `${actualCloseNotice!.key}:wrong-source`,
      source: { ...actualCloseNotice!.source, targetDigest: "0".repeat(64) } });
    const freshChat = await manager.send("W19 new customer chat", undefined, target); assert.ok(freshChat.ok);
    await waitFor(() => optionsByTurn.some(row => row.text === "W19 new customer chat"), "New raw-manager message must reach its actual send boundary");
    assert.deepEqual(optionsByTurn.find(row => row.text === "W19 new customer chat")?.options, { required: false });
    await waitFor(() => manager.executionInventoryFacts(root).queuedDispatches.some(row => row.roleId === "convener" && row.kind === "system") && !manager.executionInventoryFacts(root).activeDeliveries.some(row => row.roleId === "convener"), "Wrong-source notice remains pending after the later customer message settles");
    assert.equal(captures.filter(row => row.role === "convener" && row.text.includes(actualCloseNotice!.message)).length, 0, "Neither exact retired notice nor unknown source becomes a model prompt");
    const queuedNotice = manager.executionInventoryFacts(root).queuedDispatches.find(row => row.operationId === actualCloseNotice!.source.operationId);
    assert.ok(queuedNotice, "Readonly projection must identify the actual queued source operation");
    assert.match(queuedNotice.queueEntryId, /^[a-f0-9-]{36}$/i);
    assert.equal(queuedNotice.kind, "system"); assert.equal(queuedNotice.sourceRoleId, "chief");
    assert.equal(queuedNotice.systemAssignmentTaskId, parentId); assert.equal(queuedNotice.systemAssignmentState, "bound");
    assert.equal(queuedNotice.notificationSourceState, "recorded");
    assert.equal(queuedNotice.notificationSource?.targetDigest, "0".repeat(64));
    assert.equal(queuedNotice.lastAttempt.state, "failed");
    assert.equal(queuedNotice.lastAttempt.code, "delivery-assignment-unavailable");
    assert.equal(Object.hasOwn(queuedNotice, "text"), false); assert.equal(Object.hasOwn(queuedNotice, "summary"), false);
    assert.equal(Object.hasOwn(queuedNotice, "dedupKey"), false);
    queuedNotice.notificationSource!.targetDigest = "f".repeat(64);
    const readAgain = manager.executionInventoryFacts(root).queuedDispatches.find(row => row.queueEntryId === queuedNotice.queueEntryId);
    assert.equal(readAgain?.notificationSource?.targetDigest, "0".repeat(64), "Observing metadata must return detached facts and cannot mutate the queued source");
    assert.equal(readAgain?.systemAssignmentTaskId, parentId);
    await waitFor(() => !manager.executionInventoryFacts(root).activeDeliveries.some(row => row.roleId === "convener"), "The later chat must naturally settle before explicit rebuild");
    const rebuiltChat = await manager.rebuildSession(target);
    assert.ok(rebuiltChat.ok, `Rebuilding a cleared controller chat must not restore the closed constructor assignment: ${JSON.stringify(rebuiltChat)}`);
    assert.ok((await manager.open({ ...target, roleId: "chief" })).ok);
    assert.ok((await manager.send("W19 new customer chief query", undefined, { ...target, roleId: "chief" })).ok);
    await waitFor(() => captures.some(row => row.text === "W19 new customer chief query" && row.git), "Queued chief chat must actually run its ordinary query");
    assert.deepEqual(optionsByTurn.find(row => row.text === "W19 new customer chief query")?.options, { required: false });
    assert.ok(captures.find(row => row.text === "W19 new customer chief query")?.git, "Unassigned chief still reaches ordinary readonly Git query");
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w33-manual"}-w19-assignment-layer-proof.json`),
      JSON.stringify({ root, scope: "Real Core/tools, actual draft task ledger/parent CAS/resolver; inference-only demo SDK override. Planning data fixture is not production route/worker/pin proof.", optionsByTurn, captures, state: await readTaskState(root), inventory: manager.executionInventoryFacts(root) }, null, 2));
  } finally {
    continueClose(); await manager.stop(null);
    console.log("W52 W19 actual custom Core binding", JSON.stringify(inspectRuntimeCoreRegistry().entries.filter(entry => entry.projectRoot === path.resolve(root)).map(entry => ({ sessionId: entry.sessionId, roleId: entry.roleId, state: entry.state, lifecycleStatus: entry.lifecycle?.status, processCoverage: entry.lifecycle?.processCoverage }))));
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w33-manual"}-w19-last-layer-trace.json`),
      JSON.stringify({ root, restored, optionsByTurn, captures, events, state: await readTaskState(root), inventory: manager.executionInventoryFacts(root) }, null, 2));
    else await fs.rm(root, { recursive: true, force: true });
  }
});


for (const contended of [false, true]) {
test(`W20 默认Core/Chat产品真实报告落账并到chief ${contended ? "真实R9竞争" : "普通"}`, { timeout: 10000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w20-product-"));
  await fs.mkdir(path.join(root, ".ans")); await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio" }));
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.ANS_W20_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W20_LOCAL_KEY = "owned-local-fixture";
  const trace: Array<{ role: string; user: string; tools: string[] }> = [], events: Parameters<Parameters<typeof createDesktopInterface>[0]["emitEvent"]>[0][] = [];
  let desktop: ReturnType<typeof createDesktopInterface> | undefined;
  let finalReady = false, finishFinal!: () => void;
  const finalGate = new Promise<void>(resolve => { finishFinal = resolve; });
  configureDiagnostics({ directory: root });
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw), names: string[] = body.tools.map((tool: { function: { name: string } }) => tool.function.name);
    const role = names.includes("ans_role_activity_log") ? "chief" : "product";
    const user = [...body.messages].reverse().find((message: { role: string }) => message.role === "user")?.content ?? "";
    const last = body.messages.at(-1), tools = body.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: string }) => message.content);
    trace.push({ role, user, tools });
    let call: { name: string; arguments: string } | undefined;
    if (role === "chief" && last?.role === "user" && user === "W20 draft product") call = { name: "ans_dispatch_task", arguments: JSON.stringify({ roleId: "product", flowId: "w20-flow",
      task: "起草docs/product/w20-flow-intent-v1.md并报告真实路径，不造确认或未来授权。", sideEffect: "docs", idempotencyKey: "w20-product" }) };
    else if (role === "product" && last?.role === "user") call = { name: "ans_write_file", arguments: JSON.stringify({ path: "docs/product/w20-flow-intent-v1.md",
      content: "---\nschema: project-intent/v1\nflowId: w20-flow\nversion: 1\n---\n# Actual product draft\nOnly one local text artifact.\n" }) };
    else if (role === "product" && last?.tool_call_id === "w20-write") call = { name: "ans_submit_report", arguments: JSON.stringify({ status: "completed", summary: "W20真实产品稿已写并报告", evidence: ["docs/product/w20-flow-intent-v1.md"] }) };
    const id = call?.name === "ans_write_file" ? "w20-write" : call?.name === "ans_submit_report" ? "w20-report" : "w20-dispatch";
    const message = call ? { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: call }] } : { role: "assistant", content: "已记录真实结果，未代替客户或收口。" };
    if (contended && role === "product" && last?.tool_call_id === "w20-report") { finalReady = true; await finalGate; }
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: "w20-local", object: "chat.completion", choices: [{ index: 0, finish_reason: call ? "tool_calls" : "stop", message }] }));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
    desktop = createDesktopInterface({ pickDirectory: async () => root, emitEvent: event => events.push(event),
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W20_LOCAL_KEY", modelId: "owned-local-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 1500, turnLastResortMs: 4000 },
      envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
    assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root }); assert.ok((await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" })).ok);
    assert.ok((await desktop.sendSession({ text: "W20 draft product", target: { projectRoot: root, roleId: "chief", runtime: "codex" } })).ok);
    if (contended) {
      const readyDeadline = Date.now() + 2000; while (!finalReady && Date.now() < readyDeadline) await tick(5); assert.ok(finalReady, JSON.stringify(trace));
      const release = await acquireVersionLock(root);
      try {
        finishFinal();
        const savedDeadline = Date.now() + 500;
        while (!events.some(event => event.roleId === "product" && event.event.kind === "settled") && Date.now() < savedDeadline) await tick(5);
        assert.ok(events.some(event => event.roleId === "product" && event.event.kind === "settled"));
        await tick(60); // Test-only held real lock lets both legitimate observation writes reach the CAS boundary.
      } finally { await release(); }
    }
    const deadline = Date.now() + 3000;
    while (!trace.some(row => row.role === "chief" && row.user.includes("W20真实产品稿已写并报告")) && !events.some(event => event.event.summary.includes("状态登记失败")) && Date.now() < deadline) await tick(10);
    const state = await readTaskState(root), product = [...state.records.values()].find(record => record.created?.to === "product");
    await flushDiagnostics();
    const diagnostic = (await fs.readFile(path.join(root, `ans-diagnostics-${new Date().toISOString().slice(0, 10)}.jsonl`), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, contended ? "w20-product-contended-observation.json" : "w20-product-first-observation.json"),
      JSON.stringify({ root, contended, trace, events, product, observationFailures: diagnostic.filter(row => row.event === "tasks.append.failed"), ledgerEvents: state.events, inventory: desktopProjectExecutionInventory(root) }, null, 2));
    assert.ok(product?.created, JSON.stringify(trace));
    assert.ok(events.some(event => event.roleId === "product" && event.event.kind === "handback" && event.event.reportPersistence?.state === "saved"), JSON.stringify(trace));
    assert.ok(product.reports.some(report => report.summary === "W20真实产品稿已写并报告"), JSON.stringify(events.filter(event => event.event.summary.includes("登记失败"))));
    assert.ok(trace.some(row => row.role === "chief" && row.user.startsWith("[工作结果]") && row.user.includes("W20真实产品稿已写并报告")), JSON.stringify(trace));
  } finally {
    finishFinal(); await desktop?.stopSession(); desktop?.disposeProjectDocuments(); server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldKey === undefined) delete process.env.ANS_W20_LOCAL_KEY; else process.env.ANS_W20_LOCAL_KEY = oldKey;
    await disposeDiagnostics();
    if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true });
  }
});
}


for (const scenario of [false, true, "stop", "stop-and-restart", "document-change", "document-change-wrong-flow", "document-change-source-loss", "document-change-missing-confirmation", "intent-confirm-v2", "intent-confirm-v2-restart", "cross-document-close-notice", "team-planning", "role-preparation-missing-plan"] as const) {
const explicitNoticeReport = scenario === true;
const requestedRunMode = scenario === "stop" || scenario === "stop-and-restart" ? scenario : undefined;
const intentConfirmRestart = scenario === "intent-confirm-v2-restart";
const intentConfirmV2 = scenario === "intent-confirm-v2" || intentConfirmRestart;
const roleMissingPlan = scenario === "role-preparation-missing-plan";
const teamPlanning = scenario === "team-planning";
const crossDocumentNotice = scenario === "cross-document-close-notice";
const documentChange = roleMissingPlan || teamPlanning || crossDocumentNotice || intentConfirmV2 || typeof scenario === "string" && scenario.startsWith("document-change");
test(roleMissingPlan ? "W35 缺team仍可真实Chief报告派人事准备但D3写动作拒绝" : teamPlanning ? "W34 真实首文档发布与原创建者关闭后派团队规划保独立scope" : crossDocumentNotice ? "W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续" : intentConfirmV2 ? `W30 默认Core/Chat真实第二版意图卡确认必须持久同request版本冻结 ${intentConfirmRestart ? "真实重启迁移后" : "连续写入后"}` : documentChange ? `W29 默认Core/Chat真实既有文档基线后续 ${scenario} 保专业规划scope不授旧执行pin` : requestedRunMode ? `W28 默认Core/Chat真实受派策划缺不可变pin ${requestedRunMode} 拒绝且零停止` : `W21 默认Core/Chat应用生效通知 ${explicitNoticeReport ? "显式blocked保真任务" : "纯确认不覆盖真实完成报告"}`, { timeout: teamPlanning ? 18000 : 12000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w21-notice-"));
  if (intentConfirmV2 && process.env.ANS_W14_EVIDENCE_DIR) configureDiagnostics({ directory: process.env.ANS_W14_EVIDENCE_DIR });
  await fs.mkdir(path.join(root, ".ans")); await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio" }));
  const proposal = "docs/proposals/w21-flow-proposal-v1.md";
  // Authored fixture bodies only; actual roles must write and publish these through their real tools.
  const teamDocuments = [{"path": "docs/proposals/w21-flow-proposal-v1.md", "content": "---\nschema: project-proposal/v2\nflowId: w21-flow\nintentId: w21-flow-intent\nversion: 1\nintent: docs/product/w21-flow-intent-v1.md\n---\n# One local text worker\nProduce src/impl/result.txt, preserve evidence and use creator closure.\n"}, {"path": "docs/proposals/w21-flow-modules-v1.md", "content": "---\nschema: project-modules/v2\nflowId: w21-flow\nversion: 1\nmodules:\n  - id: impl-core\n    name: Local text\n    purpose: One isolated local output\n    path: src/impl/\n    category: core\n    publicContract: src/impl/result.txt\n    architectureSource: docs/contracts/w21-flow-architecture-v1.md\n---\n# Modules\n"}, {"path": "docs/proposals/w21-flow-roster-v1.md", "content": "---\nschema: project-roster/v3\nflowId: w21-flow\nversion: 1\nintent: docs/product/w21-flow-intent-v1.md\nproposal: docs/proposals/w21-flow-proposal-v1.md\narchitecture: docs/contracts/w21-flow-architecture-v1.md\nenvBootstrap:\n  omitted: true\n  omissionReason: Pure local text task requires no environment setup\nroles:\n  - id: impl\n    displayName: Local implementation\n    purpose: Write the one text output\n    capability: Local file editing\n    modules: [impl-core]\nmodules:\n  - id: impl-core\n    name: Local text\n    purpose: One isolated local output\n    path: src/impl/\n    category: core\n    publicContract: src/impl/result.txt\n    architectureSource: docs/contracts/w21-flow-architecture-v1.md\n---\n# Roster\n## 人员+模块拓扑图\n```topology\nschema: project-topology/v2\nmanagement: [convener, impl]\nmodules:\n  - id: impl-core\n    path: src/impl/\n    roleId: impl\nroles:\n  - id: impl\n    modules: [impl-core]\n```\n"}, {"path": "docs/proposals/w21-flow-topology-v1.md", "content": "---\nschema: project-topology/v2\nflowId: w21-flow\nversion: 1\n---\n# Topology\nconvener delegates the local module to impl after actual D3 and activation.\n"}, {"path": "docs/contracts/w21-flow-architecture-v1.md", "content": "---\nschema: project-architecture/v1\nflowId: w21-flow\nversion: 1\n---\n# Local text architecture\nproposal: docs/proposals/w21-flow-proposal-v1.md\nModule impl-core writes only src/impl/.\n"}, {"path": "docs/contracts/w21-flow-assets-v1.md", "content": "---\nschema: project-assets/v1\nflowId: w21-flow\nversion: 1\n---\n# Assets\nNo external assets or network.\n"}];

  const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.ANS_W21_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W21_LOCAL_KEY = "owned-local-fixture";
  const trace: Array<{ role: string; user: string; tools: string[]; lastRole: string; lastToolId?: string }> = [], events: Parameters<Parameters<typeof createDesktopInterface>[0]["emitEvent"]>[0][] = [];
  const cards: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ operatorId: "human", presenter: payload => cards.push(payload) });
  let closeBasis: { taskId: string; runId: string; basisDigest: string; reportRef: unknown } | undefined;
  let desktop: ReturnType<typeof createDesktopInterface> | undefined;
  let nativePickAllowed = true;
  let draftCloseBasis: { taskId: string; runId: string; basisDigest: string; reportRef: unknown } | undefined;
  const closeSamples: ReturnType<typeof desktopProjectExecutionInventory>["queuedDispatches"] = [];
  const unsubscribeNotice = subscribeDesktopExecutionInventory(event => {
    if (crossDocumentNotice && event.projectRoot === root) for (const item of desktopProjectExecutionInventory(root).queuedDispatches)
      if (item.roleId === "convener" && item.operationId === "w33-close-product-draft" && !closeSamples.some(row => row.queueEntryId === item.queueEntryId)) closeSamples.push(item);
  });
  let initCloseBasis: { taskId: string; runId: string; basisDigest: string; reportRef: unknown } | undefined;
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw), names: string[] = body.tools.map((tool: { function: { name: string } }) => tool.function.name);
    const role = names.includes("ans_role_activity_log") ? "chief" : names.includes("ans_dispatch_task") ? "convener" : names.includes("ans_request_requirement_change") ? "rapporteur" : names.includes("ans_activate_role_documents") ? "nominator" : "product";
    const user = [...body.messages].reverse().find((message: { role: string }) => message.role === "user")?.content ?? "";
    const last = body.messages.at(-1), tools = body.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: string }) => message.content);
    trace.push({ role, user, tools, lastRole: last?.role, lastToolId: last?.tool_call_id });
    let name: string | undefined, args: unknown, id = `w21-${trace.length}`;
    let batch: Array<{ id: string; type: string; function: { name: string; arguments: string } }> | undefined;

    if (crossDocumentNotice && role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W21 draft ready")) {
      const match = /\[应用绑定的原创建者收口依据\]\n([^\n]+)/.exec(user); assert.ok(match); draftCloseBasis = JSON.parse(match[1]!); assert.ok(draftCloseBasis);
      name = "ans_close_created_task"; id = "w33-close-product"; args = { taskId: draftCloseBasis.taskId, runId: draftCloseBasis.runId, basisDigest: draftCloseBasis.basisDigest, reportRef: draftCloseBasis.reportRef, operationId: "w33-close-product-draft", outcome: "accepted" };
    }
    else if (crossDocumentNotice && role === "chief" && last?.tool_call_id === "w33-close-init") { name = "ans_dispatch_task"; args = { roleId: "product", flowId: "w21-flow", task: "W21 draft actual intent", sideEffect: "docs", idempotencyKey: "w21-draft" }; }
    else if (crossDocumentNotice && role === "chief" && last?.tool_call_id === "w33-close-product") { name = "ans_request_choice"; id = "w21-confirm"; args = { title: "W33 actual intent", question: "Confirm actual product bytes", cardKind: "intent-confirm", flowId: "w21-flow", options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }] }; }
    else if (crossDocumentNotice && role === "chief" && last?.tool_call_id === "w21-confirm") { /* Acknowledge this fact; the next new customer request supplies its own source. */ }
    else if (crossDocumentNotice && role === "chief" && last?.role === "user" && user === "W33 later legitimate customer request") { name = "ans_dispatch_task"; args = { roleId: "product", flowId: "w21-flow", task: "W33 later product evidence check", sideEffect: "docs", idempotencyKey: "w33-followup" }; }
    else if (crossDocumentNotice && role === "product" && last?.role === "user" && user.includes("W33 later product evidence check")) { name = "ans_submit_report"; args = { status: "completed", summary: "W33 followup actual report", evidence: ["docs/product/w21-flow-intent-v1.md"] }; }
    else if (documentChange && role === "chief" && last?.role === "user" && user === "W29 initialize owned repository") { name = "ans_dispatch_task"; args = { roleId: "convener", flowId: "w21-flow", task: "W29 initialize the registered repository using the actual init tool", sideEffect: "docs", idempotencyKey: "w29-real-init" }; }
    else if (documentChange && role === "convener" && last?.role === "user" && user.includes("W29 initialize the registered repository")) { console.log("W52 init actual Core registry", JSON.stringify(inspectRuntimeCoreRegistry().entries.map(entry => ({ sessionId: entry.sessionId, roleId: entry.roleId, state: entry.state, lifecycleStatus: entry.lifecycle?.status, providerFinished: entry.lifecycle?.providerFinished, processCoverage: entry.lifecycle?.processCoverage })))); name = "ans_git_candidate"; id = "w29-init"; args = { action: "init", operationId: "w29-owned-init", base: { ref: "refs/ans/trunk", oid: null }, message: "Initialize the actual owned local root" }; }
    else if (documentChange && role === "convener" && last?.tool_call_id === "w29-init") { assert.ok(tools.some((text: string) => text.includes('"status":"prepared"')), JSON.stringify(tools)); name = "ans_submit_report"; args = { status: "completed", summary: "W29 actual initialization ready", evidence: [] }; }
    else if (documentChange && role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W29 actual initialization ready")) { const match = /\[应用绑定的原创建者收口依据\]\n([^\n]+)/.exec(user); if (match) initCloseBasis = JSON.parse(match[1]!); if (crossDocumentNotice) { assert.ok(initCloseBasis); name = "ans_close_created_task"; id = "w33-close-init"; args = { taskId: initCloseBasis.taskId, runId: initCloseBasis.runId, basisDigest: initCloseBasis.basisDigest, reportRef: initCloseBasis.reportRef, operationId: "w29-init-creator-close", outcome: "accepted" }; } }
    else if (documentChange && role === "chief" && last?.role === "user" && user === "W29 close actual initialization") { assert.ok(initCloseBasis); name = "ans_close_created_task"; args = { taskId: initCloseBasis.taskId, runId: initCloseBasis.runId, basisDigest: initCloseBasis.basisDigest, reportRef: initCloseBasis.reportRef, operationId: "w29-init-creator-close", outcome: "accepted" }; }
    else if (role === "chief" && last?.role === "user" && user === "W29 actual document change") { name = "ans_dispatch_task"; args = { roleId: "product", flowId: scenario === "document-change-wrong-flow" ? "w29-foreign-flow" : "w21-flow", task: "W29 author intent version two within the product area; do not execute or reuse an execution pin", sideEffect: "docs", idempotencyKey: "w29-change-product" }; }
    else if (role === "product" && last?.role === "user" && user.includes("W29 author intent version two")) { name = "ans_write_file"; id = "w29-write-v2"; args = { path: "docs/product/w21-flow-intent-v2.md", content: "---\nschema: project-intent/v1\nflowId: w21-flow\nversion: 2\n---\n# Actual new product draft\nExisting baseline, no execution permission.\n" }; }
    else if (role === "product" && last?.tool_call_id === "w29-write-v2") { name = "ans_submit_report"; args = { status: "completed", summary: "W29 actual version two ready", evidence: ["docs/product/w21-flow-intent-v2.md"] }; }
    else if (intentConfirmV2 && role === "chief" && last?.role === "user" && ((!intentConfirmRestart && user.startsWith("[工作结果]") && user.includes("W29 actual version two ready")) || user === "W30 confirm actual version two after restart")) { name = "ans_request_choice"; id = "w30-confirm-v2"; args = { title: "Confirm exact W30 second intent", question: "确认实际第二版意图字节？", cardKind: "intent-confirm", flowId: "w21-flow", options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }] }; }
    else if (role === "chief" && last?.role === "user" && user === "W21 draft intent") { name = "ans_dispatch_task"; args = { roleId: "product", flowId: "w21-flow", task: "W21 draft actual intent", sideEffect: "docs", idempotencyKey: "w21-draft" }; }
    else if (role === "product" && last?.role === "user" && user.includes("W21 draft actual intent")) { name = "ans_write_file"; id = "w21-write"; args = { path: "docs/product/w21-flow-intent-v1.md", content: "---\nschema: project-intent/v1\nflowId: w21-flow\nversion: 1\n---\n# Local notification regression\nConfirm this exact intent before publication.\n" }; }
    else if (role === "product" && last?.tool_call_id === "w21-write") { name = "ans_submit_report"; args = { status: "completed", summary: "W21 draft ready", evidence: ["docs/product/w21-flow-intent-v1.md"] }; }
    else if (scenario === "document-change-missing-confirmation" && role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W52 preparation cannot authorize publication")) { name = "ans_dispatch_task"; id = "w52-product-publication-task"; args = { roleId: "product", flowId: "w21-flow", task: "W52 attempt the existing draft publication without real M0; report the actual refusal", sideEffect: "docs", idempotencyKey: "w52-product-no-m0" }; }
    else if (scenario === "document-change-missing-confirmation" && role === "product" && last?.role === "user" && user.includes("W52 attempt the existing draft publication")) { name = "ans_submit_version_change"; id = "w52-product-unconfirmed-publish"; args = { kind: "version-upgrade", flowId: "w21-flow", operationId: "w52-product-missing-m0-publication", baseTrunk: null, summary: "Actual Product publication attempt without intent confirmation", targets: [{ kind: "contract", path: proposal, action: "add", expectedFromSha256: null }] }; }
    else if (scenario === "document-change-missing-confirmation" && role === "product" && last?.tool_call_id === "w52-product-unconfirmed-publish") { name = "ans_submit_report"; args = { status: "blocked", summary: "W52 product publication blocked without M0", evidence: [proposal] }; }
    else if (roleMissingPlan && role === "nominator" && last?.role === "user") { name = "ans_write_file"; id = "w52-d3-denied"; args = { path: "角色卡/w52-unapproved/role-card.md", content: "# No actual D3 exists\n" }; }
    else if (roleMissingPlan && role === "nominator" && last?.tool_call_id === "w52-d3-denied") { name = "ans_submit_report"; args = { status: "blocked", summary: "W52 preparation cannot authorize role writes", evidence: [] }; }
    else if (scenario === "document-change-missing-confirmation" && role === "rapporteur" && last?.role === "user") { name = "ans_write_file"; id = "w52-unconfirmed-draft"; args = { path: proposal, content: "---\nschema: project-proposal/v2\nflowId: w21-flow\nversion: 1\nintent: docs/product/w21-flow-intent-v1.md\n---\n# Unconfirmed draft, not publication authority\n" }; }
    else if (scenario === "document-change-missing-confirmation" && role === "rapporteur" && last?.tool_call_id === "w52-unconfirmed-draft") { name = "ans_submit_version_change"; id = "w52-unconfirmed-publish"; args = { kind: "version-upgrade", flowId: "w21-flow", operationId: "w52-missing-m0-publication", baseTrunk: null, summary: "Attempt publication without real M0", targets: [{ kind: "contract", path: proposal, action: "add", expectedFromSha256: null }] }; }
    else if (scenario === "document-change-missing-confirmation" && role === "rapporteur" && last?.tool_call_id === "w52-unconfirmed-publish") { name = "ans_submit_report"; args = { status: "blocked", summary: "W52 preparation cannot authorize publication", evidence: [proposal] }; }
    else if (roleMissingPlan && role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W21 draft ready")) { name = "ans_dispatch_task"; id = "w35-no-plan"; args = { roleId: "nominator", flowId: "w21-flow", task: "Prepare a missing-material report; no team plan or D3 write authority is implied", sideEffect: "docs", idempotencyKey: "w35-nominator-missing-plan" }; }
    else if (scenario === "document-change-missing-confirmation" && role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W21 draft ready")) { name = "ans_dispatch_task"; id = "w31-no-confirm"; args = { roleId: "rapporteur", flowId: "w21-flow", task: "W31 inspect missing intent confirmation; preparation does not authorize publication", sideEffect: "docs", idempotencyKey: "w31-missing-intent-confirmation" }; }
    else if (role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W21 draft ready")) { name = "ans_request_choice"; id = "w21-confirm"; args = { title: "Confirm exact W21 intent", question: "确认实际意图文档？", cardKind: "intent-confirm", flowId: "w21-flow", options: [{ id: "confirm", label: "Confirm" }, { id: "revise", label: "Revise" }] }; }
    else if (teamPlanning && role === "rapporteur" && last?.tool_call_id === "w21-proposal-write") { batch = teamDocuments.slice(1).map((doc, index) => ({ id: `w34-material-${index}`, type: "function", function: { name: "ans_write_file", arguments: JSON.stringify(doc) } })); }
    else if (teamPlanning && role === "rapporteur" && last?.tool_call_id === "w34-material-4") { name = "ans_submit_report"; args = { status: "completed", summary: "W21 proposal ready", evidence: teamDocuments.map(doc => doc.path) }; }
    else if (teamPlanning && role === "chief" && last?.tool_call_id === "w34-close-publication") { name = "ans_dispatch_task"; id = "w34-team-plan"; args = { roleId: "convener", flowId: "w21-flow", task: "W34 actual formal team planning; report only what is really prepared, no execution or future D3 authority", sideEffect: "docs", idempotencyKey: "w34-team-planning" }; }
    else if (teamPlanning && role === "convener" && last?.role === "user" && user.includes("W34 actual formal team planning")) { name = "ans_submit_report"; args = { status: "blocked", summary: "W34 team planning task received; team document has not yet been authored", evidence: teamDocuments.map(doc => doc.path) }; }
    else if (role === "chief" && last?.tool_call_id === "w21-confirm") { name = "ans_dispatch_task"; args = { roleId: "rapporteur", flowId: "w21-flow", task: "W21 author actual proposal", sideEffect: "docs", idempotencyKey: "w21-proposal" }; }
    else if (requestedRunMode && role === "rapporteur" && last?.role === "user" && user.includes("W21 author actual proposal")) {
      const actor = desktopProjectExecutionInventory(root).sessions.find(row => row.roleId === "rapporteur" && row.phase === "live");
      assert.ok(actor?.taskId && actor.runId, "Public inventory must reflect this actual assigned draft task/run, not the constructor's missing identity");
      name = "ans_select_run_change"; args = { operationId: `w28-unpinned-${requestedRunMode}`, runId: actor.runId,
        expectedPinDigest: "a".repeat(64), targetTrunk: { version: 1, digest: "b".repeat(64) }, mode: requestedRunMode, reason: "Check the actual draft; do not fabricate a pin or stop permission" };
    }
    else if (role === "rapporteur" && last?.role === "user" && user.includes("W21 author actual proposal")) { name = "ans_write_file"; id = "w21-proposal-write"; args = { path: proposal, content: "---\nschema: project-proposal/v2\nflowId: w21-flow\nversion: 1\nintent: docs/product/w21-flow-intent-v1.md\n---\n# Actual authored planning draft\nOne local material, no execution authorization.\n" }; }
    else if (role === "rapporteur" && last?.tool_call_id === "w21-proposal-write") { name = "ans_submit_report"; args = { status: "completed", summary: "W21 proposal ready", evidence: [proposal] }; }
    else if (role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W21 proposal ready")) { name = "ans_dispatch_task"; args = { roleId: "product", flowId: "w21-flow", task: "W21 publish actual material then report", sideEffect: "docs", idempotencyKey: "w21-publish" }; }
    else if (explicitNoticeReport && role === "product" && last?.role === "user" && user.startsWith("[应用·文档更新]")) { name = "ans_submit_report"; args = { status: "blocked", summary: "W21 explicit notice concern", evidence: [proposal] }; }
    else if (role === "product" && last?.role === "user" && user.includes("W21 publish actual material")) { name = "ans_submit_version_change"; id = "w21-publish"; args = { kind: "version-upgrade", flowId: "w21-flow", operationId: "w21-real-publication", baseTrunk: null, summary: "Publish the actual local planning draft", targets: [{ kind: "contract", path: proposal, action: "add", expectedFromSha256: null }] }; }
    else if (role === "product" && last?.tool_call_id === "w21-publish") { name = "ans_submit_report"; args = { status: "completed", summary: "W21 publication completed", evidence: [proposal] }; }
    else if (role === "chief" && last?.role === "user" && user.startsWith("[工作结果]") && user.includes("W21 publication completed")) {
      const match = /\[应用绑定的原创建者收口依据\]\n([^\n]+)/.exec(user); if (match) closeBasis = JSON.parse(match[1]!);
      if (scenario === "document-change-wrong-flow") { name = "ans_dispatch_task"; id = "w52-wrong-report-flow"; args = { roleId: "product", flowId: "w29-foreign-flow", task: "Prepare from this actual report only; do not borrow another flow", sideEffect: "docs", idempotencyKey: "w29-change-product" }; }
      else if (teamPlanning) { assert.ok(closeBasis); name = "ans_close_created_task"; id = "w34-close-publication"; args = { taskId: closeBasis.taskId, runId: closeBasis.runId, basisDigest: closeBasis.basisDigest, reportRef: closeBasis.reportRef, operationId: "w34-close-published-docs", outcome: "accepted" }; }
    } else if (role === "chief" && last?.role === "user" && user === "W21 close actual publication") { assert.ok(closeBasis); name = "ans_close_created_task"; args = { taskId: closeBasis.taskId, runId: closeBasis.runId, basisDigest: closeBasis.basisDigest, reportRef: closeBasis.reportRef, operationId: "w21-creator-close", outcome: "accepted" }; }
    if (teamPlanning && name === "ans_write_file" && id === "w21-write") { const input = args as { path: string; content: string }; args = { ...input, content: input.content.replace("schema: project-intent/v1\n", "schema: project-intent/v1\nintentId: w21-flow-intent\n") }; }
    if (teamPlanning && name === "ans_write_file" && id === "w21-proposal-write") args = teamDocuments[0];
    if (teamPlanning && name === "ans_submit_version_change") args = { kind: "version-upgrade", flowId: "w21-flow", operationId: "w21-real-publication", baseTrunk: null, summary: "Publish actually authored team planning materials", targets: teamDocuments.map(doc => ({ kind: doc.path.includes("-roster-") ? "roster" : "contract", path: doc.path, action: "add", expectedFromSha256: null })) };
    const call = name ? { id, type: "function", function: { name, arguments: JSON.stringify(args) } } : undefined;
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: "w21-local", object: "chat.completion", choices: [{ index: 0, finish_reason: call || batch ? "tool_calls" : "stop", message: { role: "assistant", content: call || batch ? null : "已知悉应用已生效事实。", ...(batch ? { tool_calls: batch } : call ? { tool_calls: [call] } : {}) } }] }));
  });
  const waitFor = async (predicate: () => boolean | Promise<boolean>, message: string) => { const end = Date.now() + (documentChange ? 6500 : 3500); while (!await predicate() && Date.now() < end) await tick(10); assert.ok(await predicate(), message + JSON.stringify(trace)); };
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
    const makeDesktop = () => createDesktopInterface({ pickDirectory: async () => nativePickAllowed ? root : null, emitEvent: event => events.push(event), customerInput: channel.customerInput,
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W21_LOCAL_KEY", modelId: "owned-local-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 1500, turnLastResortMs: 4500 },
      envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
    desktop = makeDesktop();
    assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root }); const target = { projectRoot: root, roleId: "chief", runtime: "codex" as const };
    assert.ok((await desktop.openSession(target)).ok);
    if (documentChange) {
      assert.ok((await desktop.sendSession({ text: "W29 initialize owned repository", target, metadata: { clientMessageId: "w29-real-init-customer" } })).ok);
      if (!crossDocumentNotice) {
        await waitFor(() => initCloseBasis !== undefined && !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "chief"), "Actual init report and creator basis must arrive");
        assert.ok((await desktop.sendSession({ text: "W29 close actual initialization", target })).ok);
        await waitFor(() => trace.some(row => row.user === "W29 close actual initialization" && row.tools.some(text => text.includes('"status":"applied"'))) && !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "chief"), "Original chief must actually close initialized child before drafting");
      }
    }
    if (!crossDocumentNotice) { const initialSent = await desktop.sendSession({ text: "W21 draft intent", target }); assert.ok(initialSent.ok, JSON.stringify(initialSent)); }
    if (roleMissingPlan) {
      await waitFor(() => trace.some(row => row.role === "chief" && row.lastToolId === "w35-no-plan"), "The actual role preparation preflight must return");
      const state = await readTaskState(root), files = await fs.readdir(path.join(root, ".ans/trunk/initialization-sources"));
      const sources = await Promise.all(files.map(async name => JSON.parse(await fs.readFile(path.join(root, ".ans/trunk/initialization-sources", name), "utf8"))));
      const replies = trace.filter(row => row.lastToolId === "w35-no-plan").flatMap(row => row.tools);
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w35-manual"}-missing-plan.json`), JSON.stringify({ root, trace, replies, tasks: [...state.records.values()], sources }, null, 2));
      const prepared = [...state.records.values()].find(row => row.created?.idempotencyKey === "w35-nominator-missing-plan")?.created;
      assert.ok(prepared); assert.equal(prepared.hubRouting, "chief-hub-v1"); assert.equal(prepared.runState, "draft"); assert.equal(prepared.from, "chief"); assert.equal(prepared.to, "nominator");
      assert.equal(prepared.workSourceRef?.kind, "chief-creator-report"); assert.equal(prepared.parentTaskRef, undefined); assert.equal(prepared.reviewBasisRef, undefined);
      const source = sources.find(source => source.sourceId === prepared.workSourceRef?.sourceId);
      assert.equal(source?.purpose, "builtin-preparation"); assert.equal(source.targetRoleId, "nominator"); assert.equal(source.planningRunId, prepared.runId);
      await waitFor(() => trace.some(row => row.lastToolId === "w52-d3-denied"), "Actual role-write refusal must return");
      assert.equal(await fs.access(path.join(root, "角色卡/w52-unapproved/role-card.md")).then(() => true, () => false), false);
      assert.ok(events.some(row => row.roleId === "nominator" && row.event.kind === "denied" && (row.event.detail as { toolName?: string } | undefined)?.toolName === "write_file"));
      assert.equal(cards.length, 0);
      await waitFor(async () => (await readTaskState(root)).records.get(prepared.taskId)?.reports.some(report => report.summary === "W52 preparation cannot authorize role writes") === true && trace.some(row => row.role === "chief" && row.user.startsWith("[工作结果]") && row.user.includes("W52 preparation cannot authorize role writes")) && !desktopProjectExecutionInventory(root).activeDeliveries.length, "Actual blocked role-write report and creator transport must finish before teardown");
      return;
    }
    if (scenario === "document-change-missing-confirmation") {
      await waitFor(() => trace.some(row => row.role === "chief" && row.lastToolId === "w31-no-confirm"), "The actual unconfirmed planning attempt must return its real result");
      const tasks = await readTaskState(root), replies = trace.filter(row => row.lastToolId === "w31-no-confirm").flatMap(row => row.tools);
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w31-manual"}-missing-confirmation.json`), JSON.stringify({ root, trace, tasks: [...tasks.records.values()], cards, replies }, null, 2));
      const prepared = [...tasks.records.values()].find(row => row.created?.idempotencyKey === "w31-missing-intent-confirmation")?.created;
      assert.ok(prepared); assert.equal(prepared.hubRouting, "chief-hub-v1"); assert.equal(prepared.runState, "draft"); assert.equal(prepared.to, "rapporteur"); assert.equal(prepared.workSourceRef?.kind, "chief-creator-report");
      assert.equal(prepared.reviewBasisRef, undefined); assert.equal(prepared.modulePaths, undefined); assert.equal(cards.length, 0);
      assert.ok(prepared.workSourceRef); const source = JSON.parse(await fs.readFile(path.join(root, prepared.workSourceRef.path), "utf8"));
      assert.equal(source.purpose, "builtin-preparation"); assert.equal(source.flowId, "w21-flow"); assert.equal(source.targetRoleId, "rapporteur"); assert.equal(source.planningRunId, prepared.runId);
      await waitFor(() => trace.some(row => row.lastToolId === "w52-unconfirmed-publish"), "Unconfirmed publication must return an explicit real result");
      const publication = trace.filter(row => row.lastToolId === "w52-unconfirmed-publish").flatMap(row => row.tools).at(-1);
      console.log("W52 actual publication tool reply", publication);
      assert.ok(publication); assert.match(publication, /vca-role-not-allowed/); assert.doesNotMatch(publication, /"status":"applied"/);
      console.log("W52 actual unconfirmed publication result", publication);
      await waitFor(async () => (await readTaskState(root)).records.get(prepared.taskId)?.reports.some(report => report.summary === "W52 preparation cannot authorize publication") === true && trace.some(row => row.role === "chief" && row.user.startsWith("[工作结果]") && row.user.includes("W52 preparation cannot authorize publication")), "Actual blocked report must reach Chief before its real Product continuation");
      await waitFor(() => trace.some(row => row.lastToolId === "w52-product-unconfirmed-publish"), "The legally routed Product must return its real unconfirmed publication result");
      const productPublication = trace.filter(row => row.lastToolId === "w52-product-unconfirmed-publish").flatMap(row => row.tools).at(-1);
      console.log("W52 actual Product no-M0 reply", productPublication);
      assert.ok(productPublication); assert.ok(productPublication.startsWith("submit_version_change: "));
      const productOutcome = JSON.parse(productPublication.slice("submit_version_change: ".length));
      assert.equal(productOutcome.status, "rejected"); assert.equal(productOutcome.errorCode, "vca-target-invalid");
      assert.equal(productOutcome.operationId, "w52-product-missing-m0-publication");
      assert.equal(productOutcome.message, "Initial publication lacks actual confirmed-intent evidence");
      assert.equal(productOutcome.receipt.targetDigest, null); assert.equal(cards.length, 0);
      const productTask = [...(await readTaskState(root)).records.values()].find(row => row.created?.idempotencyKey === "w52-product-no-m0")?.created;
      assert.ok(productTask); assert.equal(productTask.workSourceRef?.kind, "chief-creator-report");
      await waitFor(async () => (await readTaskState(root)).records.get(productTask.taskId)?.reports.some(report => report.summary === "W52 product publication blocked without M0") === true && trace.some(row => row.role === "chief" && row.user.startsWith("[工作结果]") && row.user.includes("W52 product publication blocked without M0")) && !desktopProjectExecutionInventory(root).activeDeliveries.length, "Actual Product refusal report must finish its real creator delivery before teardown");
      return;
    }
    await waitFor(() => cards.length === 1, "Actual retained intent card must appear");
    if (crossDocumentNotice) {
      try {
        await waitFor(() => closeSamples.length > 0 && !desktopProjectExecutionInventory(root).queuedDispatches.some(row => row.roleId === "convener" && row.operationId === "w33-close-product-draft"), "The exact cross-run host close notice must retire rather than block the queue");
      } finally {
        if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w33-manual"}-first-notice-projection.json`), JSON.stringify({ root, closeSamples, inventory: desktopProjectExecutionInventory(root), tasks: [...(await readTaskState(root)).records.values()], trace }, null, 2));
      }
      const state = await readTaskState(root), init = [...state.records.values()].find(row => row.created?.idempotencyKey === "w29-real-init"), draft = [...state.records.values()].find(row => row.created?.idempotencyKey === "w21-draft");
      assert.ok(init?.closed && draft?.closed); assert.equal(init.closed.outcome, "accepted"); assert.equal(draft.closed.outcome, "accepted");
      assert.notEqual(init.created?.runId, draft.created?.runId); assert.match(draft.created?.runId ?? "", /^run-docs-/);
      assert.equal(draft.created?.workSourceRef?.kind, "chief-creator-report"); assert.ok(draft.created?.workSourceRef);
      const draftSource = JSON.parse(await fs.readFile(path.join(root, draft.created.workSourceRef.path), "utf8"));
      assert.equal(draftSource.parent.kind, "handback"); assert.equal(draftSource.creatorReports[0]?.taskId, init.taskId);
      assert.equal(closeSamples[0]!.systemAssignmentTaskId, init.taskId); assert.equal(closeSamples[0]!.notificationSource?.runId, draft.created?.runId);
      const convenerPrompts = trace.filter(row => row.role === "convener" && row.lastRole === "user").length;
      assert.equal(convenerPrompts, 1, "The close fact must not reopen the old controller work turn");
      assert.ok(channel.respond({ id: cards[0]!.id, decision: { kind: "choice", selected: ["confirm"] } }).ok);
      await waitFor(() => trace.some(row => row.role === "chief" && row.lastToolId === "w21-confirm") && !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "chief"), "The real intent confirmation turn must settle");
      assert.ok((await desktop.sendSession({ text: "W33 later legitimate customer request", target })).ok);
      await waitFor(() => trace.some(row => row.role === "chief" && row.user.startsWith("[工作结果]") && row.user.includes("W33 followup actual report")), "A later legitimate task and original-creator report must continue");
      assert.equal(trace.filter(row => row.role === "convener" && row.lastRole === "user").length, convenerPrompts);
      assert.equal(desktopProjectExecutionInventory(root).queuedDispatches.some(row => row.roleId === "convener" && row.operationId === "w33-close-product-draft"), false);
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w33-manual"}-cross-run-close.json`), JSON.stringify({ root, init, draft, closeSamples, trace, events, queueAfter: desktopProjectExecutionInventory(root).queuedDispatches }, null, 2));
      return;
    }
    assert.ok(channel.respond({ id: cards[0]!.id, decision: { kind: "choice", selected: ["confirm"] } }).ok);
    if (requestedRunMode) {
      await waitFor(() => trace.some(row => row.role === "rapporteur" && row.tools.some(text => text.startsWith("select_run_change:"))), "Actual select_run_change tool result must arrive");
      const replies = trace.filter(row => row.role === "rapporteur").flatMap(row => row.tools).filter(text => text.startsWith("select_run_change:"));
      assert.ok(replies.some(text => text.includes('"status":"blocked"') && text.includes('"errorCode":"trunk-item-invalid"') && text.includes("complete executable immutable pin")), JSON.stringify(replies));
      const inventory = desktopProjectExecutionInventory(root);
      assert.equal(inventory.runStops.length, 0, "An unprepared source/target must not install any stop fence");
      assert.ok(inventory.deliveryQueuePersistence.every(fact => typeof fact.managerId === "string" && fact.managerId.length > 0));
      assert.ok(inventory.sessions.filter(row => row.phase === "live").every(row => row.lifecycle?.stopRequested === false), "No real Core stop request may occur on a refused preparation");
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w28-manual"}-unpinned-${requestedRunMode}.json`),
        JSON.stringify({ root, scope: "Real default Core/Chat tools and actual assigned draft ledger; no immutable pin or positive stop/restart is claimed", trace, cards, events, inventory, tasks: await readTaskState(root) }, null, 2));
      return;
    }
    if (teamPlanning) {
      await waitFor(() => trace.some(row => row.role === "chief" && row.lastToolId === "w34-close-publication"), "The actual first publication and creator-close must finish before measuring team dispatch");
      await waitFor(() => trace.some(row => row.role === "convener" && row.user.includes("W34 actual formal team planning")), "Actual published material creator handback must route a genuine team planning task");
      const state = await readTaskState(root), plan = [...state.records.values()].find(row => row.created?.idempotencyKey === "w34-team-planning"), publication = [...state.records.values()].find(row => row.created?.idempotencyKey === "w21-publish");
      assert.ok(plan?.created && publication?.closed); assert.equal(publication.closed.outcome, "accepted");
      assert.equal(plan.created.flowId, "w21-flow"); assert.equal(plan.created.runState, "draft"); assert.match(plan.created.runId ?? "", /^run-plan-/);
      assert.notEqual(plan.created.runId, publication.created?.runId); assert.equal(plan.created.workSourceRef?.kind, "chief-creator-report");
      assert.equal(plan.created.moduleId, undefined); assert.equal(plan.created.reviewBasisRef, undefined); assert.ok(plan.created.workSourceRef);
      const source = JSON.parse(await fs.readFile(path.join(root, plan.created.workSourceRef.path), "utf8"));
      assert.equal(source.purpose, "team-planning"); assert.equal(source.parent.kind, "handback"); assert.equal(source.creatorReports[0]?.taskId, publication.taskId);
      assert.equal(cards.length, 1, "Future D3 has not been fabricated to prepare a team plan");
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w34-manual"}-team-planning.json`), JSON.stringify({ root, plan, publication, source, trace, events, cards }, null, 2));
      return;
    }
    await waitFor(() => trace.some(row => row.role === "product" && row.user.startsWith("[应用·文档更新]") && row.user.includes("version-upgrade")), "Actual publisher notification must reach its actor");
    await waitFor(() => events.filter(event => event.roleId === "product" && event.event.kind === "settled").length >= 3 && !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "product") && closeBasis !== undefined, "Actual publication/notice turns must settle and creator basis arrive");
    await tick(100); // Observe detached ledger consumers after the actual third settle; not a production retry.
    const state = await readTaskState(root), published = [...state.records.values()].find(record => record.created?.idempotencyKey === "w21-publish");
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w21-manual"}-${explicitNoticeReport ? "explicit-report" : "notice-report"}-observation.json`), JSON.stringify({ root, trace, cards, events, published, ledgerEvents: state.events, closeBasis }, null, 2));
    assert.ok(published?.created, "Actual dispatch must persist the publication task");
    if (documentChange) {
      for (const idempotencyKey of ["w21-proposal", "w21-publish"]) {
        const actual = [...state.records.values()].find(row => row.created?.idempotencyKey === idempotencyKey)?.created;
        assert.equal(actual?.workSourceRef?.kind, "chief-creator-report", "A real creator handback must retain its own source kind");
        assert.ok(actual?.workSourceRef);
        const bytes = await fs.readFile(path.join(root, actual.workSourceRef.path));
        assert.equal(createHash("sha256").update(bytes).digest("hex"), actual.workSourceRef.sha256);
        const source = JSON.parse(bytes.toString("utf8")); assert.equal(source.kind, "creator-report"); assert.equal(source.parent.kind, "handback");
        assert.equal(source.planningRunId, actual.runId); assert.equal(source.targetRoleId, actual.to); assert.equal(source.flowId, actual.flowId);
        const accepted = events.find(event => event.roleId === "chief" && event.event.kind === "message" && event.event.turnId === source.parent.turnId &&
          (event.event.detail as { source?: string } | undefined)?.source === "prompt-input");
        assert.ok(accepted, "The persisted source must bind the actual accepted chief Core input turn");
        assert.equal(accepted.event.kind, "message");
        const provenance = (accepted.event.detail as { inputProvenance?: RuntimeInputProvenanceV1 }).inputProvenance;
        assert.equal(provenance?.kind, "handback"); assert.ok(provenance);
        const identities = provenance.reports.map(report => ({ taskId: report.taskId, roleId: report.source.roleId, reportId: report.reportId, turnId: report.source.turnId }));
        assert.deepEqual(source.creatorReports.map(({ taskId, roleId, reportId, turnId }: { taskId: string; roleId: string; reportId: string; turnId: string }) => ({ taskId, roleId, reportId, turnId })), identities);
      }
    }
    assert.ok(trace.some(row => row.tools.some(text => text.includes('"status":"applied"'))), "Actual publication must apply before its notice exists");
    if (explicitNoticeReport) {
      assert.equal(published.reports.at(-1)?.summary, "W21 explicit notice concern", "An explicit truthful report must not be suppressed as an acknowledgement");
      assert.equal(published.reports.at(-1)?.status, "blocked");
      assert.equal(published.reports.length, 2);
      assert.ok(published.reports.every(report => report.taskId === published.created?.taskId), "Both explicit reports retain the actual publication assignment");
      return;
    }
    assert.equal(events.filter(event => event.roleId === "product" && event.event.kind === "handback" && event.event.report?.taskId === published.created?.taskId && event.event.report?.origin === "terminal-fallback").length, 0, "The actual application acknowledgement must generate no fallback, even before detached ledger consumers finish");
    assert.equal(published.reports.at(-1)?.summary, "W21 publication completed", "Pure notice ack must not overwrite the completed task report");
    assert.equal(published.reports.length, 1, "No fallback report for the application fact acknowledgement");
    assert.ok((await desktop.sendSession({ text: "W21 close actual publication", target })).ok);
    const end = Date.now() + 2500; while (!(await readTaskState(root)).records.get(published.created.taskId)?.closed && Date.now() < end) await tick(10);
    assert.equal((await readTaskState(root)).records.get(published.created.taskId)?.closed?.outcome, "accepted");
    if (documentChange) {
      await waitFor(() => !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "chief"), "The actual prior creator close must settle before a new customer work source");
      if (scenario === "document-change-source-loss") { nativePickAllowed = false; assert.equal(await desktop.pickProject(), null); }
      const beforeRecords = await readTaskState(root), productRequestsBefore = trace.filter(row => row.role === "product").length;
      if (scenario !== "document-change-wrong-flow") {
        const sent = await desktop.sendSession({ text: "W29 actual document change", target, metadata: { clientMessageId: "w29-real-customer-change" } });
        assert.ok(sent.ok, JSON.stringify(sent));
        await waitFor(() => trace.some(row => row.role === "chief" && row.user === "W29 actual document change" && row.tools.some(text => text.includes("dispatch_task"))), "Actual planning dispatch result must reach the requesting customer turn");
      } else await waitFor(() => trace.some(row => row.lastToolId === "w52-wrong-report-flow"), "The real creator report's cross-flow dispatch must return");
      let changed = await readTaskState(root);
      const created = [...changed.records.values()].find(record => record.created?.idempotencyKey === "w29-change-product");
      if (intentConfirmV2) {
        let restartSend: ReturnType<NonNullable<typeof desktop>["sendSession"]> | undefined;
        assert.ok(created?.created, "Actual draft product must be registered before version two is authored");
        if (intentConfirmRestart) {
          await waitFor(() => trace.some(row => row.role === "chief" && row.user.startsWith("[工作结果]") && row.user.includes("W29 actual version two ready")) && !desktopProjectExecutionInventory(root).activeDeliveries.length, "Actual version two report must settle before a real restart");
          assert.ok((await desktop.stopSession()).ok); desktop.disposeProjectDocuments();
          desktop = makeDesktop(); assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root });
          assert.ok((await desktop.openSession(target)).ok);
          restartSend = desktop.sendSession({ text: "W30 confirm actual version two after restart", target });
        }
        await waitFor(() => cards.length === 2, "A real second retained intent card must be presented");
        if (intentConfirmRestart) {
          const beforeConfirmationRows = (await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
          assert.ok(beforeConfirmationRows.some(row => row.doc === "intent" && row.version === 2 && row.freeze?.reason === "migrated-legacy"), "Only actual fresh Desktop request initialization may produce this migration precondition before response");
        }
        const card = cards[1]!; const actualV2 = await fs.readFile(path.join(root, "docs/product/w21-flow-intent-v2.md"));
        const sha256 = createHash("sha256").update(actualV2).digest("hex");
        assert.equal(card.request.kind, "choice");
        assert.match(card.request.question ?? "", /version=2/); assert.ok(card.request.question?.includes(sha256));
        assert.ok(channel.respond({ id: card.id, decision: { kind: "choice", selected: ["confirm"] } }).ok);
        if (restartSend) assert.ok((await restartSend).ok);
        await waitFor(() => trace.some(row => row.role === "chief" && row.lastToolId === "w30-confirm-v2"), "Actual second customer response must return through the tool");
        await flushDiagnostics();
        const finalTool = trace.find(row => row.role === "chief" && row.lastToolId === "w30-confirm-v2");
        assert.ok(finalTool?.tools.some(text => text.includes("意图确认应用状态：committed")), "The actual domain apply receipt must report committed after the real callback succeeds");
        const presentedSnapshotId = /snapshot=([^ ]+)/.exec(card.request.question ?? "")?.[1]; assert.ok(presentedSnapshotId);
        const rows = (await fs.readFile(path.join(root, ".ans/state/versions.jsonl"), "utf8")).trim().split(/\r?\n/).map(line => JSON.parse(line));
        if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w30-manual"}-${intentConfirmRestart ? "intent-v2-restart" : "intent-v2-continuous"}-proof.json`), JSON.stringify({ root, requestId: card.id, actualRequest: card.request, sha256, rows, trace }, null, 2));
        assert.ok(rows.some(row => row.doc === "intent" && row.path === "docs/product/w21-flow-intent" && row.version === 2 && row.sha256 === sha256 && row.freeze?.reason === "intent-confirmed" && row.freeze?.source?.requestId === card.id && row.freeze?.snapshotRef?.snapshotId === presentedSnapshotId), "The actual answered second card must create its own version-2 intent-confirmed evidence");
        return;
      }
      if (scenario !== "document-change") {
        assert.equal(created, undefined, "Missing native source or another effective flow must leave zero new tasks");
        assert.equal(changed.records.size, beforeRecords.records.size);
        assert.equal(trace.filter(row => row.role === "product").length, productRequestsBefore, "Rejected planning scope must not invoke the professional role");
        const replies = trace.filter(row => scenario === "document-change-wrong-flow" ? row.lastToolId === "w52-wrong-report-flow" : row.user === "W29 actual document change").flatMap(row => row.tools);
        assert.ok(replies.some(text => text.includes(scenario === "document-change-source-loss" ? "document-planning-source-unavailable" : "flow")), JSON.stringify(replies));
      } else {
        assert.ok(created?.created, JSON.stringify(trace));
        assert.equal(created.created.flowId, "w21-flow"); assert.equal(created.created.runState, "draft");
        assert.match(created.created.runId ?? "", /^run-hub-/); assert.notEqual(created.created.runId, published.created.runId);
        assert.equal(created.created.hubRouting, "chief-hub-v1"); assert.equal(created.created.from, "chief"); assert.equal(created.created.to, "product");
        assert.equal(created.created.modulePaths, undefined); assert.equal(created.created.reviewControllerRef, undefined);
        assert.equal(created.created.parentTaskRef, undefined, "An unassigned customer chief must not receive a fabricated parent task");
        assert.equal(created.created.reviewBasisRef, undefined); assert.equal(created.created.moduleId, undefined);
        assert.equal(created.created.workSourceRef?.kind, "chief-customer-turn");
        assert.ok(created.created.workSourceRef);
        const source = JSON.parse(await fs.readFile(path.join(root, created.created.workSourceRef.path), "utf8"));
        assert.equal(source.purpose, "builtin-preparation"); assert.equal(source.parent.clientMessageId, "w29-real-customer-change");
        assert.equal(source.targetRoleId, "product"); assert.equal(source.kind, "customer-turn");
        assert.equal(createHash("sha256").update(await fs.readFile(path.join(root, created.created.workSourceRef.path))).digest("hex"), created.created.workSourceRef.sha256);
        assert.equal(source.planningRunId, created.created.runId); assert.equal(source.flowId, "w21-flow");
        await waitFor(() => trace.some(row => row.role === "chief" && row.user.startsWith("[工作结果]") && row.user.includes("W29 actual version two ready")), "Actual product report must arrive at its original unassigned chief");
        changed = await readTaskState(root); assert.ok(changed.records.get(created.taskId)?.reports.some(report => report.summary === "W29 actual version two ready"));
        assert.match(await fs.readFile(path.join(root, "docs/product/w21-flow-intent-v2.md"), "utf8"), /version: 2/);
      }
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w29-manual"}-${scenario}.json`),
        JSON.stringify({ root, scenario, scope: "Real default Core/Chat current-customer document planning after an actually applied document baseline; no immutable execution pin was seeded or claimed", trace, cards, events, created, tasks: [...changed.records.values()], inventory: desktopProjectExecutionInventory(root) }, null, 2));
    }
  } catch (error) { console.error("W52 fixture primary failure before teardown", error); throw error; } finally {
    if (teamPlanning && process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w34-manual"}-before-cleanup.json`), JSON.stringify({ stage: "before fixture abort/stop", root, trace, inventory: desktopProjectExecutionInventory(root), coordinator: inspectGitHostCoordinator({ projectRoot: root }), tasks: [...(await readTaskState(root)).records.values()] }, null, 2));
    unsubscribeNotice();
    channel.rejectAllPending("W21 owned fixture cleanup");
    if (desktop) for (const session of desktopProjectExecutionInventory(root).sessions.filter(session => session.phase === "live"))
      await desktop.stopSession({ projectRoot: root, roleId: session.roleId, runtime: session.runtime });
    await desktop?.stopSession(); desktop?.disposeProjectDocuments(); server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldKey === undefined) delete process.env.ANS_W21_LOCAL_KEY; else process.env.ANS_W21_LOCAL_KEY = oldKey;
    if (intentConfirmV2 && process.env.ANS_W14_EVIDENCE_DIR) await disposeDiagnostics();
    if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true });
  }
});

}


for (const obstructed of [false, true]) {
test(`W27 stop等待真实队列写有限barrier ${obstructed ? "实际IO失败可见并恢复" : "无会话/定向/未来新事件"}`, { timeout: 10000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w27-persist-"));
  const storeDirectory = path.join(root, "owned-store"), storePath = path.join(storeDirectory, "delivery-queue.json");
  let opens = 0, disposed = 0;
  // This is the real desktop queue/lifecycle and real filesystem. The injected idle handle has no SDK or business permission claims.
  const manager = new SessionManager({ deliveryQueueStorePath: storePath, openRoleSession: async () => {
    opens++; return { persistenceMode: "disabled", async send() {}, async *events() {}, async dispose() { disposed++; } };
  }, createPiAdapterFactory: () => { throw new Error("No SDK in the durability layer fixture"); }, createDemoAdapter: () => { throw new Error("unused"); },
    buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing(root) : undefined, emitEvent() {} });
  const target = { projectRoot: root, roleId: "chief", runtime: "demo" as const };
  try {
    await manager.restorePersistedDeliveries();
    await manager.stop(null); // Real delivery fence, including the no-live-session branch.
    if (obstructed) await fs.writeFile(storeDirectory, "Owned file blocks mkdir; no simulated IO result");
    const count = obstructed ? 1 : 24;
    for (let i = 0; i < count; i++) manager.watchdogDeliver(root, { text: `owned pending ${i}`, summary: "owned", dedupKey: `w27-${i}` });
    const before = manager.executionInventoryFacts(root).deliveryQueuePersistence[0]!;
    assert.equal(before.path, storePath); assert.equal(before.armed, true); assert.equal(before.enqueuedSeq, count);
    assert.equal(before.completedSeq, 0); assert.equal(before.pending, count, "Actual serial writes have not run in this synchronous enqueue segment");
    const stopped = await manager.stop(null), barrier = stopped.deliveryQueuePersistence; assert.ok(barrier);
    assert.equal(barrier.armed, true); assert.equal(barrier.targetSeq, count); assert.equal(barrier.completedSeq, count); assert.equal(barrier.pending, 0);
    assert.equal(opens, 0, "Persisting stopped work must not start a runtime");
    if (obstructed) {
      assert.equal(stopped.ok, false); assert.equal(barrier.committedSeq, 0); assert.equal(barrier.failureCount, 1);
      assert.match(barrier.lastError?.code ?? "", /^(EEXIST|ENOTDIR)$/); assert.match(stopped.note, /delivery-queue-persistence-failed/);
      assert.equal(barrier.lastError?.path, storePath);
      await fs.unlink(storeDirectory); await fs.mkdir(storeDirectory); // Repair only this actual owned obstruction.
      manager.watchdogDeliver(root, { text: "real new event after repair", summary: "repair", dedupKey: "w27-repair" });
      const repaired = await manager.stop(null); assert.ok(repaired.deliveryQueuePersistence);
      assert.equal(repaired.deliveryQueuePersistence.committedSeq, repaired.deliveryQueuePersistence.targetSeq);
      assert.equal(repaired.deliveryQueuePersistence.failureCount, 1, "Historical error remains visible after an actual new commit");
      assert.equal(repaired.deliveryQueuePersistence.lastError?.seq, 1);
      assert.doesNotMatch(repaired.note, /delivery-queue-persistence-failed/, "A historical failure must not permanently block a later committed cutoff");
    } else {
      assert.equal(barrier.committedSeq, count); assert.equal(barrier.failureCount, 0);
      assert.equal(JSON.parse(await fs.readFile(storePath, "utf8")).items.length, count, "The stop result waits for real rename and readable bytes");
      manager.watchdogDeliver(root, { text: "new external event before cutoff", summary: "new", dedupKey: "w27-before-cutoff" });
      const cutoff = manager.executionInventoryFacts(root).deliveryQueuePersistence[0]!.enqueuedSeq;
      const stopping = manager.stop({ projectRoot: root, roleId: "convener", runtime: "pi" });
      await Promise.resolve(); // stop's empty rebuild wait resumes first and captures its finite chain.
      manager.watchdogDeliver(root, { text: "future external event", summary: "future", dedupKey: "w27-after-cutoff" });
      const finite = await stopping; assert.equal(finite.deliveryQueuePersistence?.targetSeq, cutoff);
      assert.equal(finite.deliveryQueuePersistence?.completedSeq, cutoff);
      assert.ok(manager.executionInventoryFacts(root).deliveryQueuePersistence[0]!.enqueuedSeq > cutoff, "Later real input gets a new sequence instead of being rejected or folded into the old barrier");
      const drained = await manager.stop(null); assert.equal(drained.deliveryQueuePersistence?.pending, 0);
      assert.equal(JSON.parse(await fs.readFile(storePath, "utf8")).items.length, count + 2);
    }
    assert.ok((await manager.open(target)).ok, "Explicit lawful future open still resumes its precise key");
    const directed = await manager.stop(target); assert.ok(directed.ok, directed.note);
    assert.equal(directed.deliveryQueuePersistence?.pending, 0);
    assert.equal(directed.deliveryQueuePersistence?.committedSeq, directed.deliveryQueuePersistence?.targetSeq);
    assert.equal(opens, 1); assert.equal(disposed, 1);
    const facts = manager.executionInventoryFacts(root).deliveryQueuePersistence[0]!;
    assert.equal(facts.pending, 0); assert.equal(facts.completedSeq, facts.enqueuedSeq);
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, obstructed ? "w27-real-io-failure-recovery.json" : "w27-finite-write-barrier.json"),
      JSON.stringify({ root, storePath, before, stopped, directed, facts, file: JSON.parse(await fs.readFile(storePath, "utf8")), opens, disposed,
        scope: "Real queue IO cutoff; known counts do not prove every old constructor/external producer stopped; no CPU attribution" }, null, 2));
  } finally {
    await manager.stop(null);
    if (!process.env.ANS_W14_EVIDENCE_DIR) { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith("ans-w27-persist-")); await fs.rm(root, { recursive: true, force: true }); }
  }
});
}


test("W36 真实Chief可无M0-plan-D3派五builtin准备；人事写动作仍拒", { timeout: 20000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w36-hub-"));
  await fs.mkdir(path.join(root, ".ans")); await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio" }));
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.ANS_W36_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W36_LOCAL_KEY = "owned-local-only";
  const events: Parameters<Parameters<typeof createDesktopInterface>[0]["emitEvent"]>[0][] = [], cards: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ operatorId: "human", presenter: card => cards.push(card) });
  const trace: Array<{ role: string; text: string; tools: string[] }> = [];
  let requestedRole = "product", desktop: ReturnType<typeof createDesktopInterface> | undefined;
  let resumeTarget: { taskId: string; flowId: string; runId: string; reviewTaskId: string; reviewCloseOperationId: string } | undefined;
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw), isChief = body.tools.some((tool: { function: { name: string } }) => tool.function.name === "ans_role_activity_log");
    const role = isChief ? "chief" : requestedRole;
    const text = [...body.messages].reverse().find((message: { role: string }) => message.role === "user")?.content ?? "";
    const last = body.messages.at(-1), tools = body.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: string }) => message.content);
    trace.push({ role, text, tools });
    let name: string | undefined, args: unknown, id = `w36-${trace.length}`;
    if (isChief && last?.role === "user" && text === "W36 unavailable resume") { assert.ok(resumeTarget); name = "ans_dispatch_task"; args = { roleId: "convener", flowId: "w36-flow", task: "Resume an explicitly identified existing task; do not create another", sideEffect: "read-only", resumeController: resumeTarget }; }
    else if (isChief && last?.role === "user" && text === "W37 missing final review evidence") { name = "ans_dispatch_task"; args = { roleId: "verifier", flowId: "w36-flow", task: "Review this expected candidate only if real integration/controller/criteria evidence exists", sideEffect: "read-only", reviewTarget: { operationId: "w37-absent-integration", candidate: { objectFormat: "sha1", hex: "1".repeat(40) } } }; }
    else if (isChief && last?.role === "user" && text === "W36 missing flow") { name = "ans_dispatch_task"; args = { roleId: "product", task: "Inspect missing context; do not infer a previous task flow", sideEffect: "read-only" }; }
    else if (isChief && last?.role === "user" && text.startsWith("W36 prepare ")) { name = "ans_dispatch_task"; args = { roleId: requestedRole, flowId: "w36-flow", task: "Investigate the current inputs and report missing materials; this is preparation, no publication or execution approval", sideEffect: "read-only", idempotencyKey: `w36-${requestedRole}` }; }
    else if (!isChief && last?.role === "user" && role === "nominator") { name = "ans_write_file"; id = "w36-denied-write"; args = { path: "角色卡/w36-worker/role-card.md", content: "# Unapproved draft\nNo D3 or valid team plan exists.\n" }; }
    else if (!isChief && (last?.role === "user" || last?.tool_call_id === "w36-denied-write")) { name = "ans_submit_report"; args = { status: "blocked", summary: `W36 ${role} preparation received; required business inputs remain missing`, evidence: [] }; }
    const call = name ? { id, type: "function", function: { name, arguments: JSON.stringify(args) } } : undefined;
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: "w36-local", object: "chat.completion", choices: [{ index: 0, finish_reason: call ? "tool_calls" : "stop", message: { role: "assistant", content: call ? null : "已收到真实阻塞报告，由幕僚决定下一步。", ...(call ? { tool_calls: [call] } : {}) } }] }));
  });
  const wait = async (predicate: () => Promise<boolean> | boolean, reason: string) => { const end = Date.now() + 6000; while (!await predicate() && Date.now() < end) await tick(10); assert.ok(await predicate(), reason + JSON.stringify(trace)); };
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
    desktop = createDesktopInterface({ pickDirectory: async () => root, customerInput: channel.customerInput, emitEvent: event => events.push(event),
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W36_LOCAL_KEY", modelId: "owned-local-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 1500, turnLastResortMs: 5000 },
      envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json") });
    assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root });
    const target = { projectRoot: root, roleId: "chief", runtime: "codex" as const }; assert.ok((await desktop.openSession(target)).ok);
    for (const role of ["product", "rapporteur", "nominator", "convener", "verifier"]) {
      requestedRole = role;
      const sent = desktop.sendSession({ text: `W36 prepare ${role}`, target, metadata: { clientMessageId: `w36-customer-${role}` } });
      await wait(async () => [...(await readTaskState(root)).records.values()].some(row => row.created?.idempotencyKey === `w36-${role}` && row.reports.some(report => report.status === "blocked")), `Actual ${role} report must be persisted`);
      assert.ok((await sent).ok);
      await wait(() => trace.some(row => row.role === "chief" && row.text.startsWith("[工作结果]") && row.text.includes(`W36 ${role} preparation received`)) && !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "chief"), `Actual ${role} report must return to Chief`);
      const created = [...(await readTaskState(root)).records.values()].find(row => row.created?.idempotencyKey === `w36-${role}`)?.created;
      assert.ok(created); assert.equal(created.from, "chief"); assert.equal(created.to, role); assert.equal(created.hubRouting, "chief-hub-v1");
      assert.equal(created.runState, "draft"); assert.match(created.runId ?? "", /^run-hub-/); assert.equal(created.reviewBasisRef, undefined); assert.equal(created.parentTaskRef, undefined);
      assert.equal(created.workSourceRef?.kind, "chief-customer-turn");
    }
    const beforeNegative = await readTaskState(root), controller = [...beforeNegative.records.values()].find(row => row.created?.to === "convener")?.created, review = [...beforeNegative.records.values()].find(row => row.created?.to === "verifier")?.created;
    assert.ok(controller?.flowId && controller.runId && review);
    // These are existing real task identifiers plus an explicitly absent expected close operation, not approval evidence.
    resumeTarget = { taskId: controller.taskId, flowId: controller.flowId, runId: controller.runId, reviewTaskId: review.taskId, reviewCloseOperationId: "w36-no-review-close" };
    for (const [text, code] of [["W36 unavailable resume", "Resume names no actual Chief-created final review"], ["W36 missing flow", "chief-hub-flow-unavailable"], ["W37 missing final review evidence", "Final review target has no actual same-flow integration controller"]]) {
      const requestsBefore = trace.filter(row => row.role !== "chief").length;
      assert.ok((await desktop.sendSession({ text: text!, target })).ok);
      await wait(() => trace.some(row => row.role === "chief" && row.text === text && row.tools.some(tool => tool.includes(code!))) && !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "chief"), "The unsupported/missing-scope request must return its explicit refusal");
      assert.equal((await readTaskState(root)).records.size, beforeNegative.records.size); assert.equal(trace.filter(row => row.role !== "chief").length, requestsBefore);
    }
    assert.equal(cards.length, 0, "No M0/plan/D3 card was requested as an ordinary routing ticket");
    assert.equal(await fs.access(path.join(root, "角色卡/w36-worker/role-card.md")).then(() => true, () => false), false);
    assert.ok(events.some(row => row.roleId === "nominator" && row.event.kind === "denied" && (row.event.detail as { toolName?: string } | undefined)?.toolName === "write_file"), "The actual write action must remain denied; dispatch did not grant write authority");
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w36-manual"}-hub-proof.json`), JSON.stringify({ root, trace, events, tasks: [...(await readTaskState(root)).records.values()], inventory: desktopProjectExecutionInventory(root), cards }, null, 2));
  } finally {
    channel.rejectAllPending("W36 owned fixture cleanup"); await desktop?.stopSession(); desktop?.disposeProjectDocuments(); server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldKey === undefined) delete process.env.ANS_W36_LOCAL_KEY; else process.env.ANS_W36_LOCAL_KEY = oldKey;
    if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true });
  }
});


test("W38 恢复的未受理resume回执出队前拒绝；缺metadata不降普通任务", { timeout: 7000 }, async () => {
  for (const missingMetadata of [false, true]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w38-unaccepted-")), storePath = path.join(root, "delivery-queue.json");
    const expected = { taskId: "absent-controller", flowId: "w38-flow", runId: "absent-run", reviewTaskId: "absent-review", reviewCloseOperationId: "absent-close" };
    const sealed = { expected, resumeKey: "unaccepted-receipt", basisDigest: "0".repeat(64) };
    // Deliberately unaccepted disk data, not an approved task/quality fixture or a safe capability fact.
    await fs.writeFile(storePath, JSON.stringify({ version: 1, items: [{ key: { projectRoot: root, roleId: "convener", runtime: "codex" }, state: "queued", item: {
      kind: "dispatch", runtime: "codex", targetRoleId: "convener", sourceRoleId: "chief", taskId: expected.taskId, flowId: expected.flowId,
      text: "Do not execute this unaccepted persisted request", summary: "Unaccepted resume", dedupKey: "hub-resume:unaccepted-receipt:" + sealed.basisDigest, enqueuedAt: new Date().toISOString(),
      ...(missingMetadata ? {} : { controllerResume: sealed }) } }] }));
    let opens = 0;
    const events: Parameters<Parameters<typeof createDesktopInterface>[0]["emitEvent"]>[0][] = [];
    const manager = new SessionManager({ deliveryQueueStorePath: storePath,
      openRoleSession: async () => { opens++; throw new Error("The unaccepted resume must be rejected before any runtime construction"); },
      createRuntimeAdapterFactory, createPiAdapterFactory: () => { throw new Error("unused"); }, createDemoAdapter: () => { throw new Error("unused"); },
      buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing(root) : undefined, emitEvent: event => events.push(event),
    });
    try {
      const restored = await manager.restorePersistedDeliveries();
      const until = Date.now() + 1500;
      while ((manager.executionInventoryFacts(root).queuedDispatches.length || !missingMetadata && !events.some(row => row.event.summary.includes("controller-resume-queue-source-unproven"))) && Date.now() < until) await tick(10);
      assert.equal(opens, 0); assert.equal(manager.executionInventoryFacts(root).queuedDispatches.length, 0);
      assert.equal(manager.executionInventoryFacts(root).pendingOpens.length, 0);
      assert.equal(await fs.access(path.join(root, ".ans/state/tasks.jsonl")).then(() => true, () => false), false, "Rejected transport must not synthesize task records");
      if (missingMetadata) assert.equal(restored.skipped, 1);
      else { assert.equal(restored.restored, 1); assert.ok(events.some(row => row.roleId === "chief" && row.event.summary.includes("controller-resume-queue-source-unproven")), "The real failed transport must be reported to Chief, not silently block the queue head"); }
      const stopped = await manager.stop(null); assert.equal(stopped.ok, false, "No runtime was opened to stop");
      assert.ok(stopped.deliveryQueuePersistence); assert.equal(stopped.deliveryQueuePersistence.pending, 0);
      assert.equal(stopped.deliveryQueuePersistence.committedSeq, stopped.deliveryQueuePersistence.targetSeq);
      const stored = JSON.parse(await fs.readFile(storePath, "utf8"));
      if (!missingMetadata) assert.equal(stored.items.length, 0);
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w38-manual"}-${missingMetadata ? "missing" : "unaccepted"}-receipt.json`), JSON.stringify({ root, restored, events, stopped, stored, opens }, null, 2));
    } finally { await manager.stop(null); if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true }); }
  }
});


test("W42 同步入队发布完整persistence事实后释放自己的dispatch lease", { timeout: 7000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w42-enqueue-")), storePath = path.join(root, "delivery-queue.json");
  let opens = 0;
  const manager = new SessionManager({ deliveryQueueStorePath: storePath,
    openRoleSession: async () => { opens++; throw new Error("Stopped queue must not construct a runtime"); },
    createPiAdapterFactory: () => { throw new Error("unused"); }, createDemoAdapter: () => { throw new Error("unused"); },
    buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing(root) : undefined, emitEvent() {} });
  let leaseId: string | undefined;
  try {
    await manager.restorePersistedDeliveries(); await manager.stop(null);
    const lease = beginGitHostAction({ projectRoot: root, kind: "dispatch" }); assert.ok(lease.ok); leaseId = lease.leaseId;
    manager.watchdogDeliver(root, { text: "Retain owned information", summary: "owned queue", dedupKey: "w42-owned" });
    // Same synchronous enqueue -> end sequence as resume; no fake accepted review or executor permission.
    const published = inspectGitHostCoordinator({ projectRoot: root }), current = desktopProjectExecutionInventory(root);
    const ended = endGitHostAction({ projectRoot: root, leaseId, inventory: current });
    const afterEnd = inspectGitHostCoordinator({ projectRoot: root });
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w42-manual"}-lease-proof.json`), JSON.stringify({ root, lease, published, current, ended, afterEnd, opens }, null, 2));
    assert.ok(ended.ok, JSON.stringify(ended)); leaseId = undefined;
    assert.equal(afterEnd.activeAction, undefined); assert.equal(opens, 0);
    assert.equal(current.queuedDispatches.length, 1, "Releasing a lease must retain the real queue item");
    const stopped = await manager.stop(null); assert.equal(stopped.deliveryQueuePersistence?.pending, 0);
    assert.equal(JSON.parse(await fs.readFile(storePath, "utf8")).items.length, 1);
    const admission = beginGitHostAction({ projectRoot: root, kind: "session-open" }); assert.ok(admission.ok, "The released dispatch must not block the next real admission lease");
    assert.ok(endGitHostAction({ projectRoot: root, leaseId: admission.leaseId, inventory: desktopProjectExecutionInventory(root) }).ok);
  } finally {
    if (leaseId) endGitHostAction({ projectRoot: root, leaseId });
    await manager.stop(null); if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true });
  }
});


for (const mode of ["affected", "same-root-other", "unknown", "cancel"] as const) {
  test(`W45 claim barrier ${mode}`, { timeout: 7000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w45-claim-")), storePath = path.join(root, "delivery-queue.json");
    // Legacy transport identifiers only, no task approval/pin/run or actual role execution is seeded.
    const transportTaskId = mode === "same-root-other" ? "current-requester" : mode === "unknown" ? undefined : "old-transport-task";
    await fs.writeFile(storePath, JSON.stringify({ version: 1, items: [{ key: { projectRoot: root, roleId: "convener", runtime: "demo" }, state: "queued", item: {
      kind: "dispatch", runtime: "demo", targetRoleId: "convener", sourceRoleId: "chief", ...(transportTaskId ? { taskId: transportTaskId } : {}),
      text: "Transport barrier only; do not run a model", summary: "owned transport", dedupKey: `w45-${mode}`, enqueuedAt: new Date().toISOString() } }] }));
    let release!: () => void, entered!: () => void, disposed = 0, sends = 0;
    const gate = new Promise<void>(resolve => { release = resolve; }), openEntered = new Promise<void>(resolve => { entered = resolve; });
    const manager = new SessionManager({ deliveryQueueStorePath: storePath,
      openRoleSession: async () => { entered(); await gate; return { persistenceMode: "disabled", async send() { sends++; }, async *events() {}, async dispose() { disposed++; } }; },
      createPiAdapterFactory: () => { throw new Error("No SDK used by transport fixture"); }, createDemoAdapter: () => { throw new Error("Transport fixture never binds an SDK/demo adapter"); },
      buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing(root) : undefined, emitEvent() {} });
    const controller = new AbortController(); let result: Awaited<ReturnType<SessionManager["waitForRunStopDeliveryClaims"]>> | undefined;
    try {
      assert.equal((await manager.restorePersistedDeliveries()).restored, 1);
      await openEntered;
      assert.equal(manager.executionInventoryFacts(root).deliveryQueuePersistence[0]?.knownProducers.deliveryClaims, 1, "Inventory retains the actual producer, including a non-stopset requester");
      const waiting = manager.waitForRunStopDeliveryClaims({ projectRoot: root, taskIds: ["old-transport-task"], signal: controller.signal }).then(value => { result = value; return value; });
      if (mode === "cancel") controller.abort();
      await tick(10);
      if (mode === "affected") assert.equal(result, undefined, "An actual affected open/claim remains in flight; the barrier must wait");
      else if (mode === "same-root-other") {
        assert.deepEqual(result, { status: "wait-complete", count: 0 }, "Do not join the same-root requester outside the stop set");
        assert.equal(manager.executionInventoryFacts(root).deliveryQueuePersistence[0]?.knownProducers.deliveryClaims, 1, "Filtered wait completion never fabricates global zero producers");
      }
      else assert.equal(result?.status, "blocked", "Unknown provenance or cancellation is never a completed barrier");
      // Stop fences only this real manager, then release its owned no-SDK open; no successful work is fabricated.
      const stopped = manager.stop(null); release(); await stopped;
      const actual = await waiting;
      if (mode === "affected") assert.deepEqual(actual, { status: "wait-complete", count: 1 });
      if (mode === "unknown") assert.equal(actual.status === "blocked" ? actual.code : undefined, "run-stop-claim-source-unproven");
      if (mode === "cancel") assert.equal(actual.status === "blocked" ? actual.code : undefined, "run-stop-claim-wait-cancelled");
      await tick(0); assert.equal(sends, 0); assert.equal(disposed, 1);
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w45-manual"}-${mode}-proof.json`), JSON.stringify({ root, transportTaskId, result: actual, sends, disposed, inventory: desktopProjectExecutionInventory(root) }, null, 2));
    } finally { const stopped = manager.stop(null); release(); await stopped; if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true }); }
  });
}


for (const disposition of ["select", "revise"] as const) {
  test(`W47 默认Core/Codex本地HTTP：忙Chief独立${disposition}释放真实卡调用`, { timeout: 12000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w47-default-chief-"));
    await fs.mkdir(path.join(root, "docs/proposals"), { recursive: true });
    const materialPath = "docs/proposals/focus-proposal-v1.md", material = "---\nversion: 1\nflowId: focus\n---\n# Observed recovery evidence\nThe alternate path has the current diagnostic evidence; no execution approval is granted.\n";
    await fs.writeFile(path.join(root, materialPath), material);
    await fs.mkdir(path.join(root, ".ans")); await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio" }));
    const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.ANS_W47_LOCAL_KEY;
    process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W47_LOCAL_KEY = "owned-loopback-only";
    const delegation = createDecisionDelegationSwitch(false), cards: OperatorRequestPayload[] = [];
    const channel = createCustomerInputChannel({ operatorId: "owned-customer", delegation, presenter: card => cards.push(card) });
    const trace: Array<{ role: string; names: string[]; toolResults: string[] }> = [], contexts: ChiefPendingDecisionRequest[] = [];
    const inventories: ReturnType<typeof desktopProjectExecutionInventory>[] = [], serverErrors: string[] = [];
    let entered!: () => void, release!: () => void, mainWaiting = false;
    const mainEntered = new Promise<void>(resolve => { entered = resolve; }), mainRelease = new Promise<void>(resolve => { release = resolve; });
    let manager: SessionManager | undefined, stack: ReturnType<typeof createVersionChangeStack> | undefined;
    const launched: Promise<unknown>[] = [];
    const server = createServer(async (request, response) => {
      try {
        let raw = ""; for await (const chunk of request) raw += chunk;
        const body = JSON.parse(raw), names: string[] = body.tools.map((tool: { function: { name: string } }) => tool.function.name);
        const last = body.messages.at(-1), userText = [...body.messages].reverse().find((message: { role: string }) => message.role === "user")?.content ?? "";
        const bounded = names.length === 1 && names[0] === "ans_decide_pending_request";
        const system = body.messages.find((message: { role: string }) => message.role === "system")?.content ?? "";
        const role = bounded ? "independent-chief" : String(system).includes("# 角色：幕僚") ? "chief" : "rapporteur";
        const toolResults: string[] = body.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: string }) => String(message.content));
        trace.push({ role, names, toolResults });
        let call: { id: string; type: string; function: { name: string; arguments: string } } | undefined;
        if (bounded && last?.role === "user") {
          assert.equal(mainWaiting, true); assert.deepEqual(names, ["ans_decide_pending_request"]);
          const supplied = JSON.parse(userText); contexts.push(supplied.request);
          assert.match(supplied.evidence, /Observed recovery evidence/);
          assert.ok(supplied.request.evidenceRefs.some((ref: { path: string; sha256: string }) => ref.path === materialPath && ref.sha256 === createHash("sha256").update(material).digest("hex")));
          const snapshot = desktopProjectExecutionInventory(root); inventories.push(snapshot);
          const main = snapshot.sessions.find(row => row.kind === "role" && row.roleId === "chief" && row.phase === "live");
          const isolated = snapshot.sessions.find(row => row.kind === "bounded-chief" && row.phase === "live");
          assert.ok(main?.coreSessionId && isolated?.coreSessionId); assert.notEqual(main.coreSessionId, isolated.coreSessionId);
          assert.equal(main.lifecycle?.providerFinished, false); assert.equal(isolated.roleId, "chief");
          assert.equal(main.toolSurface?.factoryProvenance, "default-production"); assert.equal(isolated.toolSurface?.factoryProvenance, "default-production");
          call = { id: "w47-real-decide", type: "function", function: { name: "ans_decide_pending_request", arguments: JSON.stringify({ requestId: supplied.request.requestId,
            baseDigest: supplied.request.baseDigest, delegationRevision: supplied.request.delegationRevision, disposition,
            ...(disposition === "select" ? { selected: ["alternate"] } : {}), reason: disposition === "revise" ? "补齐可追溯诊断证据后重新提出；此请求未批准" : "当前实际证据支持非推荐替代路径" }) } };
        } else if (role === "chief" && last?.role === "user" && userText === "W47 main waits for the original card caller") {
          mainWaiting = true; entered(); await mainRelease; mainWaiting = false;
        } else if (role === "rapporteur" && last?.role === "user") {
          call = { id: "w47-real-card", type: "function", function: { name: "ans_request_choice", arguments: JSON.stringify({ title: "核对真实恢复证据", question: "按当前材料选择恢复路径？",
            flowId: "focus", cardKind: "decision", preview: "只决定恢复方案，不批准执行权限。", options: [{ id: "recommended", label: "默认路径", recommended: true }, { id: "alternate", label: "替代路径" }] }) } };
        }
        response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ id: `w47-${trace.length}`, object: "chat.completion", choices: [{ index: 0,
          message: { role: "assistant", content: call ? null : "真实调用已经返回，结束当前回合。", ...(call ? { tool_calls: [call] } : {}) }, finish_reason: call ? "tool_calls" : "stop" }] }));
      } catch (error) { serverErrors.push(String(error)); response.statusCode = 500; response.end(JSON.stringify({ error: { message: String(error) } })); release(); }
    });
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
      stack = createVersionChangeStack({ projectRoot: root }); assert.equal((await stack.ensureInitialized()).ok, true);
      const actualListing = await readActualProject(root);
      manager = new SessionManager({ openRoleSession, prepareChiefDecisionEvidence, createRuntimeAdapterFactory,
        runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W47_LOCAL_KEY", modelId: "owned-loopback-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 5000, turnLastResortMs: 8000 },
        createPiAdapterFactory: () => { throw new Error("No Pi SDK"); }, createDemoAdapter: () => { throw new Error("No demo adapter"); },
        buildProjectConfig, getListing: projectRoot => projectRoot === root ? actualListing : undefined,
        customerInput: channel.customerInput, getVersionChangeStack: () => stack, emitEvent() {} });
      assert.equal((await manager.open({ projectRoot: root, roleId: "chief", runtime: "codex" })).ok, true);
      assert.equal((await manager.open({ projectRoot: root, roleId: "rapporteur", runtime: "codex" })).ok, true);
      delegation.set({ enabled: true });
      const main = manager.send("W47 main waits for the original card caller", undefined, { projectRoot: root, roleId: "chief", runtime: "codex" }); launched.push(main);
      await mainEntered;
      const worker = manager.send("W47 actual original request_choice caller", undefined, { projectRoot: root, roleId: "rapporteur", runtime: "codex" }); launched.push(worker);
      const workerResult = await worker; assert.equal(workerResult.ok, true); release(); assert.equal((await main).ok, true);
      assert.equal(serverErrors.length, 0, serverErrors.join("\n")); assert.equal(cards.length, 0); assert.equal(contexts.length, 1);
      const toolReceipt = trace.filter(row => row.role === "rapporteur").flatMap(row => row.toolResults).at(-1); assert.ok(toolReceipt);
      if (disposition === "select") assert.match(toolReceipt, /alternate/); else { assert.match(toolReceipt, /补齐可追溯诊断证据/); assert.match(toolReceipt, /拒绝|退回|declined|未批准/); }
      const audit = await readTaskState(root), resolved = audit.events.filter(row => row.kind === "request.resolved");
      assert.equal(resolved.length, 1); assert.equal(resolved[0]!.by, "chief-delegated"); assert.equal(resolved[0]!.decisionId, undefined);
      assert.equal(resolved[0]!.actionSource?.kind, "chief-delegated");
      if (resolved[0]!.actionSource?.kind === "chief-delegated") { assert.equal(resolved[0]!.actionSource.disposition, disposition); assert.equal(resolved[0]!.actionSource.requestId, contexts[0]!.requestId); assert.equal(resolved[0]!.actionSource.delegationRevision, contexts[0]!.delegationRevision); }
      assert.equal(resolved[0]!.choice, disposition === "select" ? "alternate" : "declined");
      if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w47-manual"}-${disposition}-proof.json`), JSON.stringify({ root, trace, contexts, inventories, audit, workerResult, serverErrors }, null, 2));
    } finally {
      channel.rejectAllPending("W47 owned cleanup"); release(); await Promise.allSettled(launched); await manager?.stop(null); stack?.dispose();
      server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
      if (oldKey === undefined) delete process.env.ANS_W47_LOCAL_KEY; else process.env.ANS_W47_LOCAL_KEY = oldKey;
      if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true });
    }
  });
}


for (const stopMode of ["normal", "foreign-lease", "new-interrupt", "late-chief-source"] as const) {
test(`W48 默认Core精确controller停止：缺/错task零停止，当前任务sealed且不伪造报告 ${stopMode}`, { timeout: 18000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w48-controller-stop-"));
  await fs.mkdir(path.join(root, ".ans")); await fs.writeFile(path.join(root, ".ans/project.json"), JSON.stringify({ governanceModel: "trio" }));
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.ANS_W48_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_W48_LOCAL_KEY = "owned-loopback-only";
  const trace: Array<{ chief: boolean; text: string; toolMessages: string[]; lastToolCallId?: string; lastToolMessage?: string }> = [], errors: string[] = [];
  const stopCalls = new Map<string, string>();
  let foreignLeaseId: string | undefined, unsubscribe: (() => void) | undefined, injected: Promise<unknown> | undefined;
  const injectionFacts: unknown[] = [];
  let desktop: ReturnType<typeof createDesktopInterface> | undefined, taskIds: string[] = [];
  const server = createServer(async (request, response) => {
    try {
      let raw = ""; for await (const chunk of request) raw += chunk; const body = JSON.parse(raw);
      const chief = body.tools.some((tool: { function: { name: string } }) => tool.function.name === "ans_role_activity_log");
      const last = body.messages.at(-1), text = [...body.messages].reverse().find((message: { role: string }) => message.role === "user")?.content ?? "";
      const toolMessages = body.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: string }) => String(message.content));
      const lastTool = body.messages.filter((message: { role: string }) => message.role === "tool").at(-1);
      trace.push({ chief, text, toolMessages, ...(lastTool ? { lastToolCallId: lastTool.tool_call_id, lastToolMessage: String(lastTool.content) } : {}) }); let name: string | undefined, args: Record<string, unknown> = {};
      if (chief && last?.role === "user" && text.startsWith("W48 prepare ")) {
        name = "ans_dispatch_task"; args = { roleId: "convener", flowId: text.endsWith("old") ? "w48-old" : "w48-current", task: "Inspect current controller preparation inputs and report blocked; no execution approval", sideEffect: "read-only", idempotencyKey: text.endsWith("old") ? "w48-old" : "w48-current" };
      } else if (!chief && last?.role === "user") {
        name = "ans_submit_report"; args = { status: "blocked", summary: "W48 actual controller report remains the role's own report", evidence: [] };
      } else if (chief && last?.role === "user" && text.startsWith("W48 stop ")) {
        name = "ans_terminate_role_run"; args = { roleId: "convener", ...(text.endsWith("missing") ? {} : { taskId: text.endsWith("absent") ? "w48-absent-task" : text.endsWith("old") ? taskIds[0] : taskIds[1] }) };
      }
      const call = name ? { id: `w48-tool-${trace.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } } : undefined;
      if (name === "ans_terminate_role_run" && call) {
        stopCalls.set(text, call.id);
        if (stopMode === "foreign-lease" && text === "W48 stop exact") {
          const foreign = beginGitHostAction({ projectRoot: root, kind: "git-mutation" }); assert.ok(foreign.ok); foreignLeaseId = foreign.leaseId;
        }
      }
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ id: `w48-${trace.length}`, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: call ? null : "已核对真实回执，不推定运行整体完成。", ...(call ? { tool_calls: [call] } : {}) }, finish_reason: call ? "tool_calls" : "stop" }] }));
    } catch (error) { errors.push(String(error)); response.statusCode = 500; response.end(JSON.stringify({ error: { message: String(error) } })); }
  });
  const wait = async (predicate: () => Promise<boolean> | boolean, reason: string) => { const until = Date.now() + 3500; while (!await predicate() && Date.now() < until) await tick(10); assert.ok(await predicate(), reason); };
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
    desktop = createDesktopInterface({ pickDirectory: async () => root, emitEvent() {}, envFilePath: path.join(root, ".env"), piConfigEnv: {}, runtimeStatePath: path.join(root, ".runtime-selection.json"),
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_W48_LOCAL_KEY", modelId: "owned-loopback-only", requestAttemptMax: 1, requestFirstByteTimeoutMs: 2500, turnLastResortMs: 6500 } });
    assert.equal(await desktop.pickProject(), root); await desktop.listProject({ projectRoot: root });
    const target = { projectRoot: root, roleId: "chief", runtime: "codex" as const }; assert.ok((await desktop.openSession(target)).ok);
    for (const label of ["old", "current"]) {
      const handbacksBefore = trace.filter(row => row.chief && row.text.startsWith("[工作结果]")).length;
      assert.ok((await desktop.sendSession({ text: `W48 prepare ${label}`, target })).ok);
      await wait(async () => [...(await readTaskState(root)).records.values()].some(record => record.created?.idempotencyKey === `w48-${label}` && record.reports.some(report => report.from === "convener")), "The actual controller report must be persisted");
      await wait(() => {
        const inventory = desktopProjectExecutionInventory(root);
        return trace.filter(row => row.chief && row.text.startsWith("[工作结果]")).length > handbacksBefore &&
          !inventory.activeDeliveries.some(row => row.roleId === "chief") && !inventory.queuedDispatches.some(row => row.roleId === "chief") &&
          inventory.sessions.some(row => row.roleId === "chief" && row.phase === "live" && row.lifecycle?.providerFinished);
      }, "Chief receives this actual report and finishes naturally");
      const record = [...(await readTaskState(root)).records.values()].find(record => record.created?.idempotencyKey === `w48-${label}`); assert.ok(record?.created?.runId); taskIds.push(record.taskId);
    }
    const before = await readTaskState(root), current = before.records.get(taskIds[1]!)!;
    const targetBefore = desktopProjectExecutionInventory(root).sessions.find(row => row.taskId === current.taskId && row.phase === "live"); assert.ok(targetBefore?.coreSessionId && targetBefore.lifecycle?.native?.instanceId);
    for (const suffix of ["missing", "absent", "old"]) {
      const prompt = `W48 stop ${suffix}`; assert.ok((await desktop.sendSession({ text: prompt, target })).ok);
      await wait(() => !!stopCalls.get(prompt) && trace.some(row => row.chief && row.text === prompt && row.lastToolCallId === stopCalls.get(prompt)), "The exact stop tool returns a real receipt");
      const receipt = trace.find(row => row.chief && row.text === prompt && row.lastToolCallId === stopCalls.get(prompt))?.lastToolMessage; assert.ok(receipt);
      assert.match(receipt, /未确认|未完成|不得/);
      assert.match(receipt, suffix === "missing" ? /controller-stop-task-required/ : suffix === "absent" ? /controller-stop-source-unproven/ : /controller-stop-target-instance-unproven/);
      const sameInstance: ReturnType<typeof desktopProjectExecutionInventory>["sessions"][number] | undefined = desktopProjectExecutionInventory(root).sessions.find(row => row.coreSessionId === targetBefore.coreSessionId);
      assert.equal(sameInstance?.phase, "live"); assert.equal(sameInstance?.lifecycle?.stopRequested, false);
      assert.deepEqual((await readTaskState(root)).records.get(current.taskId)?.reports, current.reports, "Rejected stop never impersonates a target report");
    }
    if (stopMode === "new-interrupt" || stopMode === "late-chief-source") {
      unsubscribe = subscribeDesktopExecutionInventory(event => {
        if (event.projectRoot !== root || event.reason !== "controller-stop-cutoff-completed" || injected) return;
        const beforeHandover = inspectGitHostCoordinator({ projectRoot: root });
        injected = Promise.resolve().then(async () => {
          const beforeInterruption = inspectGitHostCoordinator({ projectRoot: root });
          injectionFacts.push({ beforeHandover, beforeInterruption });
          if (stopMode === "new-interrupt") return recordGitHostInterruption({ projectRoot: root, reason: "owned-test-emergency-after-effect", coreSessionId: targetBefore.coreSessionId });
          return desktop!.abortSession(target); // Real user emergency action revokes this actual Chief turn.
        });
      });
    }
    const exactSend = await desktop.sendSession({ text: "W48 stop exact", target });
    let exact: string[] = [];
    if (stopMode === "late-chief-source") {
      await wait(() => injected !== undefined, "The actual cutoff must be reached before the owned source revocation"); await injected;
      await wait(() => inspectGitHostCoordinator({ projectRoot: root }).activeAction === undefined, "The stopped caller's owned host operation must finish and release itself");
      exact = trace.filter(row => row.chief && row.text === "W48 stop exact" && row.lastToolCallId === stopCalls.get("W48 stop exact")).map(row => row.lastToolMessage!);
      assert.ok(!exact.some(message => message.includes("已终止角色")), "Revoked Chief source cannot receive a successful stop receipt");
    } else {
      assert.ok(exactSend.ok);
      await wait(() => !!stopCalls.get("W48 stop exact") && trace.some(row => row.chief && row.text === "W48 stop exact" && row.lastToolCallId === stopCalls.get("W48 stop exact")), "Exact controller stop returns its real receipt");
      exact = trace.filter(row => row.chief && row.text === "W48 stop exact" && row.lastToolCallId === stopCalls.get("W48 stop exact")).map(row => row.lastToolMessage!);
      if (stopMode === "normal") assert.ok(exact.some(message => message.includes("已终止角色")), JSON.stringify(exact));
      else if (stopMode === "foreign-lease") {
        assert.ok(exact.some(message => message.includes("git-host-coordinator-busy")), JSON.stringify(exact));
        assert.equal(inspectGitHostCoordinator({ projectRoot: root }).activeAction, "git-mutation", "Never release the other operation's lease");
      } else {
        await injected; assert.ok(exact.some(message => message.includes("controller-stop-source-stale")), JSON.stringify(exact));
      }
    }
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w48-manual"}-${stopMode}-before-assert.json`), JSON.stringify({ root, stopMode, taskIds, trace, errors, before, inventory: desktopProjectExecutionInventory(root), exact, exactSend, injectionFacts, after: await readTaskState(root) }, null, 2));
    const after = await readTaskState(root); assert.deepEqual(after.records.get(current.taskId)?.reports, current.reports); assert.equal(after.records.get(current.taskId)?.closed, undefined);
    const stopped = desktopProjectExecutionInventory(root).sessions.find(row => row.coreSessionId === targetBefore.coreSessionId);
    if (stopMode === "foreign-lease") { assert.equal(stopped?.phase, "live"); assert.equal(stopped?.lifecycle?.stopRequested, false); }
    else {
      assert.equal(stopped?.phase, "disposed");
      // P1.4 §3.2 C8/§3.7 契约变更：停止成功以运行时中立 drain 判定（status/processCoverage 仅证据）。
      // Codex 本路径的实际运行时事实仍如实为 quiescent/complete（保留原断言作为证据，不是门的前提）。
      assert.equal(isRuntimeSessionDrained(stopped.lifecycle!), true, "停止成功=运行时中立 drain");
      assert.equal(stopped?.lifecycle?.status, "quiescent");
      assert.equal(stopped.lifecycle.native?.instanceId, targetBefore.lifecycle.native.instanceId); assert.equal(stopped.lifecycle.processCoverage, "complete");
    }
    assert.equal(errors.length, 0, errors.join("\n"));
  } finally {
    unsubscribe?.(); await injected;
    if (process.env.ANS_W14_EVIDENCE_DIR) await fs.writeFile(path.join(process.env.ANS_W14_EVIDENCE_DIR, `${process.env.W14_RUN_LABEL ?? "w48-manual"}-${stopMode}-finally-proof.json`), JSON.stringify({ root, stopMode, taskIds, trace, errors, injectionFacts, inventory: desktopProjectExecutionInventory(root), after: await readTaskState(root) }, null, 2));
    if (foreignLeaseId) assert.ok(endGitHostAction({ projectRoot: root, leaseId: foreignLeaseId }).ok);
    await desktop?.stopSession(); desktop?.disposeProjectDocuments(); server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldKey === undefined) delete process.env.ANS_W48_LOCAL_KEY; else process.env.ANS_W48_LOCAL_KEY = oldKey;
    if (!process.env.ANS_W14_EVIDENCE_DIR) await fs.rm(root, { recursive: true, force: true });
  }
});
}

// ———————————————— W4（2026-11-08 删除预知式门控）：桌面 run-stop drain / native 可选 ————————————————
//
// P1.4 §3.2 C8 / §3.7 / I0-5 / Q8：`executeOwnedRunStop` 的终止判定改为运行时中立
// `isRuntimeSessionDrained(stopped)`（status/processCoverage/native 仅证据）；`ownedRunStopMembers`
// 的 native instance 比对改为可选（absent 允许、present-but-changed 拒绝）；Core session/role/task/
// project 身份、宿主就绪与队列持久化检查逐字保留；错误码 `run-stop-lifecycle-unproven` /
// `run-stop-host-instance-unproven` 保留、语义收窄。
// 本用例直接驱动 SessionManager 的私有 host 边界（真实 manager 实例 + 受控 observed handle/宿主事实，
// 不伪造 Core 会话、不冒充真实 turn）。finalize 侧未注册 prepared run 时以 `run-preparation-invalid`
// 拒绝，因此「推进到 finalize 边界」即证明 drain 门已通过（旧 quiescent 门会先以
// `run-stop-lifecycle-unproven` 拒绝）；该 finalize 码不是本批语义，只作边界观测。
test("W4 桌面run-stop：Claude/Pi drain 可推进；native absent 允许、present-but-changed 拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w4-run-stop-"));
  const manager = new SessionManager({
    openRoleSession: async () => { throw new Error("W4 direct host-boundary test never opens a role session"); },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  type RunStopMember = { member: RunChangeHostPlan["handles"][number]; handle: RoleSessionHandle };
  type Internals = {
    managerId: string;
    observedHandles: Map<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }>;
    deliveryStoreArmed: boolean;
    runStopFacts: Map<string, { projectRoot: string; fact: { managerId: string; operationId: string; runId: string; requestDigest: string;
      generation: number; state: "fenced"; hostHandleIds: readonly string[]; targetSeq: number } }>;
    ownedRunStopMembers(plan: Pick<RunChangeHostPlan, "projectRoot" | "handles">):
      { ok: true; groups: Map<SessionManager, RunStopMember[]> } | { ok: false; code: string; message: string };
    executeOwnedRunStop(plan: RunChangeHostPlan, signal: AbortSignal): Promise<{ ok: boolean; status: string; errorCode?: string; message?: string }>;
  };
  const internals = manager as unknown as Internals;
  internals.deliveryStoreArmed = true;
  const taskId = "w4-task", coreSessionId = "w4-core-session", projectRoot = root;
  const nativeFacts = (instanceId: string, roleId = "rapporteur"): RuntimeNativeLifecycleFacts => ({
    instanceId, roleId, runtime: "claude", status: "quiescent", promptState: "settled", observedAt: "2026-11-08T00:00:00.000Z",
    transport: { kind: "in-process", state: "closed" }, activeTools: [], processes: [], processCoverage: "complete", reasons: [],
  });
  // Claude/Pi 的真实形态：status/processCoverage unknown、无 native；白名单 reason 只作证据。
  const lifecycleFor = (runtime: "claude" | "pi", stopped: boolean, native?: RuntimeNativeLifecycleFacts): RuntimeSessionLifecycleFacts => ({
    sessionId: coreSessionId, roleId: "rapporteur", runtime, turnId: "w4-turn", stopRequested: stopped, status: "unknown",
    providerFinished: true, activeTools: [], processes: [], processCoverage: "unknown",
    reasons: runtime === "claude"
      ? ["native-provider-not-proven-quiescent",
        "native:Claude SDK Query exposes no owned PID, descendant-tree inventory, process exit/close event or exit code; process coverage is unknown.",
        "native:Query.close(): void and interrupt acknowledgement do not verify CLI exit, HTTP completion or descendant shutdown."]
      : ["native-provider-not-proven-quiescent", "native:pi-sdk-owned-process-tree-coverage-unavailable", "native:pi-sdk-http-transport-close-unobservable"],
    ...(native ? { native } : {}),
  });
  const arm = (lifecycle: RuntimeSessionLifecycleFacts, stopped: RuntimeSessionLifecycleFacts): string => {
    const hostHandleId = randomUUID();
    const handle: RoleSessionHandle = {
      sessionId: coreSessionId,
      inspectLifecycle: () => structuredClone(lifecycle),
      stopAndInspect: async () => structuredClone(stopped),
      async send() {},
      events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
      async dispose() {},
    };
    internals.observedHandles.set(hostHandleId, { fact: { hostHandleId, projectRoot, roleId: "rapporteur", runtime: lifecycle.runtime,
      kind: "role", phase: "live", errors: [], taskId }, handle });
    return hostHandleId;
  };
  const planFor = (hostHandleId: string, nativeInstanceId?: string): RunChangeHostPlan => {
    const plan: RunChangeHostPlan = { planId: randomUUID(), operationId: `w4-op-${randomUUID()}`, projectRoot, runId: "w4-run",
      flowId: "w4-flow", requestDigest: randomUUID(), requesterTaskId: taskId, requesterCoreSessionId: coreSessionId,
      requesterTurnId: "w4-turn", deferred: false, taskIds: [taskId],
      handles: [{ hostHandleId, coreSessionId, roleId: "rapporteur", taskId, ...(nativeInstanceId ? { nativeInstanceId } : {}) }] };
    internals.runStopFacts.set(`${projectRoot}\u0000${plan.operationId}`, { projectRoot, fact: { managerId: internals.managerId,
      operationId: plan.operationId, runId: plan.runId, requestDigest: plan.requestDigest, generation: 1, state: "fenced",
      hostHandleIds: [hostHandleId], targetSeq: 0 } });
    return plan;
  };
  try {
    // 1) Claude/Pi 正向：status/processCoverage unknown、native absent，但 isRuntimeSessionDrained 为真
    //    ⇒ 旧 quiescent 门不再拒绝（executeOwnedRunStop 推进到 finalize 边界）。
    for (const runtime of ["claude", "pi"] as const) {
      const stopped = lifecycleFor(runtime, true);
      assert.equal(stopped.status, "unknown"); assert.equal(stopped.processCoverage, "unknown"); assert.equal(stopped.native, undefined);
      assert.equal(isRuntimeSessionDrained(stopped), true, `${runtime} 形态必须 drained`);
      const plan = planFor(arm(lifecycleFor(runtime, false), stopped));
      const members = internals.ownedRunStopMembers(plan);
      assert.equal(members.ok, true, members.ok ? "" : members.message);
      const receipt = await internals.executeOwnedRunStop(plan, new AbortController().signal);
      assert.notEqual(receipt.errorCode, "run-stop-lifecycle-unproven", `${runtime}：drain 成立不得以旧 quiescent 语义拒绝`);
      assert.equal(receipt.errorCode, "run-preparation-invalid", `${runtime}：已通过 drain 门到达 finalize 边界（本用例未注册真实 prepared run）`);
    }
    // 2) native absent 允许：plan 曾记录 native instance，当前 lifecycle/停止回执均 absent ⇒ 不阻断。
    {
      const plan = planFor(arm(lifecycleFor("claude", false), lifecycleFor("claude", true)), "w4-native-plan");
      const members = internals.ownedRunStopMembers(plan);
      assert.equal(members.ok, true, "当前 native absent ⇒ 允许（可选证据）");
      const receipt = await internals.executeOwnedRunStop(plan, new AbortController().signal);
      assert.equal(receipt.errorCode, "run-preparation-invalid", "absent 不阻断 drain 推进");
    }
    // 3) native present-but-changed（成员校验）：instance 或 role 漂移 ⇒ run-stop-host-instance-unproven，不提交。
    for (const drift of [nativeFacts("w4-native-other"), nativeFacts("w4-native-plan", "chief")] as const) {
      const plan = planFor(arm(lifecycleFor("claude", false, drift), lifecycleFor("claude", true)), "w4-native-plan");
      const members = internals.ownedRunStopMembers(plan);
      assert.equal(members.ok, false);
      if (!members.ok) assert.equal(members.code, "run-stop-host-instance-unproven");
      const receipt = await internals.executeOwnedRunStop(plan, new AbortController().signal);
      assert.equal(receipt.ok, false);
      assert.equal(receipt.errorCode, "run-stop-host-instance-unproven", "成员 native instance/role 漂移 ⇒ 既有码拒绝、不提交");
    }
    // 4) native present-but-changed（停止回执）：成员校验通过、回执漂移 ⇒ run-stop-lifecycle-unproven，不提交。
    for (const drift of [nativeFacts("w4-native-other"), nativeFacts("w4-native-plan", "chief")] as const) {
      const plan = planFor(arm(lifecycleFor("claude", false, nativeFacts("w4-native-plan")), lifecycleFor("claude", true, drift)), "w4-native-plan");
      const members = internals.ownedRunStopMembers(plan);
      assert.equal(members.ok, true);
      const receipt = await internals.executeOwnedRunStop(plan, new AbortController().signal);
      assert.equal(receipt.ok, false);
      assert.equal(receipt.errorCode, "run-stop-lifecycle-unproven", "停止回执 native instance/role 漂移 ⇒ 拒绝、不提交");
      assert.notEqual(receipt.errorCode, "run-preparation-invalid");
    }
    // 5) drain 不成立（非 idle Pi：native:pi-sdk-idle-not-observed 未列白名单，默认阻断）⇒ 既有码拒绝、不提交。
    {
      const blocked = lifecycleFor("pi", true);
      const blockedFacts: RuntimeSessionLifecycleFacts = { ...blocked, reasons: [...blocked.reasons, "native:pi-sdk-idle-not-observed"] };
      assert.equal(isRuntimeSessionDrained(blockedFacts), false, "非 idle Pi 保持阻断");
      const plan = planFor(arm(lifecycleFor("pi", false), blockedFacts));
      const receipt = await internals.executeOwnedRunStop(plan, new AbortController().signal);
      assert.equal(receipt.ok, false);
      assert.equal(receipt.errorCode, "run-stop-lifecycle-unproven", "drain 不成立 ⇒ 拒绝、不提交");
    }
    // 6) 契约守卫：旧 quiescent/processCoverage/native 必填前提不再存在；身份/队列持久化/宿主 fence 检查保留。
    const source = await fs.readFile(new URL("../../app/desktop/session.ts", import.meta.url), "utf8");
    const slice = (from: string, to: string): string => {
      const start = source.indexOf(from), end = source.indexOf(to, start);
      assert.ok(start > 0 && end > start, `源码段可定位：${from} → ${to}`);
      return source.slice(start, end);
    };
    const owned = slice("private ownedRunStopMembers", "private async executeOwnedRunStop");
    const execute = slice("private async executeOwnedRunStop", "private resumeDeferredRunChanges");
    assert.ok(execute.includes("isRuntimeSessionDrained(stopped)"), "C8：停止回执使用运行时中立 drain");
    assert.equal(execute.includes('stopped.status !== "quiescent"'), false, "C8：不再以 quiescent 作为前提");
    assert.equal(execute.includes("!stopped.providerFinished"), false, "C8：providerFinished 由 drain 谓词统一判定");
    assert.equal(execute.includes("stopped.activeTools.length"), false, "C8：activeTools 由 drain 谓词统一判定");
    assert.ok(owned.includes("lifecycle.native !== undefined && member.nativeInstanceId !== undefined"), "C8：仅 present-but-changed 拒绝（absent 允许）");
    assert.equal(owned.includes("lifecycle.native?.instanceId !== member.nativeInstanceId"), false, "C8：native 不再必填比对");
    assert.ok(owned.includes("run-stop-host-instance-unproven") && execute.includes("run-stop-lifecycle-unproven"), "既有错误码保留、语义收窄");
    assert.ok(owned.includes("fact.taskId !== member.taskId") && owned.includes("fact.roleId !== member.roleId") &&
      owned.includes("observed.handle.sessionId !== member.coreSessionId") && owned.includes("fact.projectRoot !== plan.projectRoot"), "Core/任务/角色/项目身份保留");
    assert.ok(owned.includes("!manager.deliveryStoreArmed || manager.openChains.size"), "队列持久化/宿主就绪检查保留");
    assert.ok(execute.includes("run-stop-host-fence-unproven") && execute.includes("run-stop-persistence-unproven"), "宿主 fence/持久化检查保留");
  } finally {
    await manager.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

// ———— 2026-11-09《团队计划登记 run 绑定 / baseDigest 合法来源》T5（B1 P-12）：桌面宿主 run 绑定 ————
// 真实 SessionManager 投递/回合状态（busy、origins.running、lifetime/turn abort、真实 settle 语义之外的
// 句柄为桩）+ 真实 task 账本/run 记录 + 真实 trunk 服务与文件存储；宿主绑定只读当前真实受派回合的
// origin.taskId，经 inspectAssignedTask 注入任务 run；模型自报 runId 只作断言（不一致拒绝）。
type TeamPlanCapability = { completeTeamPlan?: CompleteTeamPlanFn };
const inertRoleHandle = (): RoleSessionHandle => ({
  async send() {},
  events() {
    return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(50); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
  },
  async dispose() {},
});
async function teamPlanHostFixture() {
  const project = await createTrunkProject({ withRun: false }), store = createFsTrunkStore(project.root);
  const documents = project.snapshot().documents, at = new Date().toISOString();
  const planText = `---\n${JSON.stringify({ schema: "teamPlanSchema:3", flowId: "demo", version: 1, modules: documents.modules, roster: documents.roster,
    roleRows: [{ roleId: "impl", modules: ["impl-core"], writesets: ["src/impl/"], dependsOn: [] }] })}\n---\n# Real team plan\nW6 host binding\n`;
  await fs.writeFile(path.join(project.root, TRUNK_PATHS.teamPlan), planText);
  const documentRefs = Object.values(documents).filter((ref): ref is { path: string; sha256: string } => ref !== undefined);
  const captured = await store.captureSnapshot!({ snapshotId: "w6-team-plan-basis", createdAt: at,
    files: [...documentRefs, { path: TRUNK_PATHS.teamPlan, sha256: createHash("sha256").update(planText).digest("hex") }] });
  if (!captured.ok) throw new Error(`W6 fixture snapshot: ${captured.message ?? captured.reason}`);
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", trunkVersion: 1, previous: null, runId: null, flowId: "demo",
    digest: "abcdef0123456789".repeat(4), snapshotRef: captured.value, createdAt: at, updatedAt: at,
    artifacts: { documents, execution: { teamPlan: null, flow: null }, boundaries: {} } };
  const seeded = await store.compareAndSwapManifest!(null, manifest, captured.value);
  if (!seeded.ok) throw new Error(`W6 fixture manifest: ${seeded.message ?? seeded.code}`);
  const runId = "run-w6-team-plan", taskId = "task-w6-team-plan";
  const recorded = await store.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "demo", state: "draft",
    documents: {}, execution: { teamPlan: null, flow: null }, createdAt: at });
  if (!recorded.ok) throw new Error(`W6 fixture run: ${recorded.message ?? recorded.code}`);
  const created = await recordTaskObservation({ projectRoot: project.root, event: { v: 1, at, kind: "task.created", taskId, from: "chief", to: "convener",
    flowId: "demo", runId, runState: "draft", text: "W6 team plan host binding fixture", sideEffect: "read-only", idempotencyKey: "w6-team-plan" } });
  if (!created.ok) throw new Error(`W6 fixture task: ${created.message ?? created.code}`);
  return { root: project.root, store, manifest, planPath: TRUNK_PATHS.teamPlan, planText, runId, taskId };
}
function teamPlanHostManager(root: string, caps: Record<string, TeamPlanCapability>) {
  return new SessionManager({
    openRoleSession: async (input) => { caps[input.roleId] = input as TeamPlanCapability; return inertRoleHandle(); },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
}

test("W6/T5 团队计划宿主绑定：省略 runId 注入受派任务 run；自报不一致/flow 不符拒绝；成功回执 source.runId=任务 run", async () => {
  const f = await teamPlanHostFixture(), caps: Record<string, TeamPlanCapability> = {};
  const manager = teamPlanHostManager(f.root, caps), target = { projectRoot: f.root, roleId: "convener", runtime: "demo" as const };
  try {
    const opened = await manager.open({ ...target, taskId: f.taskId }); assert.equal(opened.ok, true, opened.error ?? "convener open");
    const plan = caps.convener?.completeTeamPlan; assert.equal(typeof plan, "function", "convener 会话注入宿主包装后的 complete_team_plan 能力");
    assert.equal((await manager.sendBackground({ ...target, text: "W6 团队计划真实回合", kind: "system", identitySeed: "w6-plan-turn" })).ok, true);
    // 模型省略 runId ⇒ 宿主注入当前受派任务的实际 run；回执 planRef.sha256 为应用派生值。
    const applied = await plan!({ operationId: "w6-plan-omitted-run", flowId: "demo", plan: { path: f.planPath, version: 1 } });
    assert.equal(applied.ok, true, JSON.stringify(applied)); assert.equal(applied.status, "applied");
    assert.equal(applied.baseDigest, f.manifest.digest, "回执 baseDigest = 应用派生的 effective trunk digest");
    assert.ok(applied.source?.kind === "role-direct"); assert.equal(applied.source.action, "complete-team-plan");
    assert.equal(applied.source.runId, f.runId, "省略 runId ⇒ 注入受派任务的实际 run");
    assert.equal((applied as typeof applied & { planRef?: { sha256?: string } }).planRef?.sha256,
      createHash("sha256").update(f.planText).digest("hex"), "成功回执 planRef.sha256 = 应用派生实际字节摘要");
    // 模型自报不同 runId ⇒ 既有 service 码 plan-run-conflict（只作断言、不触达提交）。
    const wrongRun = await plan!({ operationId: "w6-plan-wrong-run", flowId: "demo", runId: "run-not-the-assigned-task", plan: { path: f.planPath, version: 1 } });
    assert.equal(wrongRun.ok, false); assert.equal(wrongRun.status, "blocked");
    if (wrongRun.ok === false) assert.equal(wrongRun.errorCode, "plan-run-conflict");
    // flow 与实际受派任务不符 ⇒ host-local plan-flow-conflict。
    const wrongFlow = await plan!({ operationId: "w6-plan-wrong-flow", flowId: "other-flow", plan: { path: f.planPath, version: 1 } });
    assert.equal(wrongFlow.ok, false); assert.equal(wrongFlow.status, "blocked");
    if (wrongFlow.ok === false) assert.equal(wrongFlow.errorCode, "plan-flow-conflict");
    // 自报即任务 run（断言一致）⇒ 成功；同计划再登记 ⇒ no-op 且仍记录任务 run（P-7 语义）。
    const asserted = await plan!({ operationId: "w6-plan-assert-task-run", flowId: "demo", runId: f.runId, plan: { path: f.planPath, version: 1 } });
    assert.equal(asserted.ok, true, JSON.stringify(asserted)); assert.equal(asserted.status, "no-op");
    assert.ok(asserted.source?.kind === "role-direct"); assert.equal(asserted.source.runId, f.runId);
  } finally {
    await manager.stop(null);
    await fs.rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("W6/T5 团队计划宿主绑定拒绝分层：plan-task-unavailable/plan-task-changed 本地前置、inspect 失败直通 trunk-item-invalid", async () => {
  const f = await teamPlanHostFixture(), caps: Record<string, TeamPlanCapability> = {};
  const manager = teamPlanHostManager(f.root, caps), target = { projectRoot: f.root, roleId: "convener", runtime: "demo" as const };
  try {
    const opened = await manager.open({ ...target, taskId: f.taskId }); assert.equal(opened.ok, true, opened.error ?? "convener open");
    const plan = caps.convener!.completeTeamPlan!;
    // 无当前回合 ⇒ host-local plan-task-unavailable。
    const noTurn = await plan({ operationId: "w6-plan-no-turn", flowId: "demo", plan: { path: f.planPath, version: 1 } });
    assert.equal(noTurn.ok, false); assert.equal(noTurn.status, "blocked");
    if (noTurn.ok === false) assert.equal(noTurn.errorCode, "plan-task-unavailable");
    // 入口即已中止 ⇒ 同一 host-local 码（不触达核验/提交）。
    const preAborted = new AbortController(); preAborted.abort();
    const entryAbort = await plan({ operationId: "w6-plan-entry-aborted", flowId: "demo", plan: { path: f.planPath, version: 1 } }, preAborted.signal);
    assert.equal(entryAbort.ok, false); if (entryAbort.ok === false) assert.equal(entryAbort.errorCode, "plan-task-unavailable");
    // 真实 busy 受派回合（origin.taskId = 任务账本行）。
    assert.equal((await manager.sendBackground({ ...target, text: "W6 拒绝分层真实回合", kind: "system", identitySeed: "w6-failure-layer" })).ok, true);
    // 核验期间调用被中止/回合变化 ⇒ host-local plan-task-changed，不执行、trunk 不前进。
    const aborter = new AbortController();
    const pending = plan({ operationId: "w6-plan-changed", flowId: "demo", plan: { path: f.planPath, version: 1 } }, aborter.signal);
    aborter.abort();
    const changed = await pending;
    assert.equal(changed.ok, false); assert.equal(changed.status, "blocked");
    if (changed.ok === false) assert.equal(changed.errorCode, "plan-task-changed");
    const untouched = await f.store.readManifest(); assert.ok(untouched.ok);
    if (untouched.ok) assert.equal(untouched.value.trunkVersion, 1, "plan-task-changed 不触达提交、trunk 不前进");
    // 核验成功后、提交前即可拒绝：自报不同 runId ⇒ 既有 service 码。
    const wrongRun = await plan({ operationId: "w6-plan-layer-wrong-run", flowId: "demo", runId: "run-not-the-assigned-task", plan: { path: f.planPath, version: 1 } });
    assert.equal(wrongRun.ok, false); if (wrongRun.ok === false) assert.equal(wrongRun.errorCode, "plan-run-conflict");
    // inspectAssignedTask 失败（受派 run 记录不可读）⇒ 直通其原码 trunk-item-invalid，不重写。
    await fs.rm(path.join(f.root, ".ans", "runs", f.runId), { recursive: true, force: true });
    const invalid = await plan({ operationId: "w6-plan-trunk-item-invalid", flowId: "demo", plan: { path: f.planPath, version: 1 } });
    assert.equal(invalid.ok, false); assert.equal(invalid.status, "blocked");
    if (invalid.ok === false) assert.equal(invalid.errorCode, "trunk-item-invalid");
  } finally {
    await manager.stop(null);
    await fs.rm(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("W6/T5 团队计划宿主绑定：普通消息回合无受派任务 ⇒ host-local plan-task-unavailable", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w6-plan-no-task-")), caps: Record<string, TeamPlanCapability> = {};
  const manager = teamPlanHostManager(root, caps), target = { projectRoot: root, roleId: "convener", runtime: "demo" as const };
  try {
    assert.equal((await manager.open(target)).ok, true);
    // 仅 convener 注入宿主绑定能力（其它治理角色不获得 complete_team_plan 能力）。
    assert.equal((await manager.open({ ...target, roleId: "chief" })).ok, true);
    assert.equal(caps.chief?.completeTeamPlan, undefined, "非 convener 会话不注入 complete_team_plan");
    const plan = caps.convener!.completeTeamPlan!;
    assert.equal((await manager.send("W6 普通客户消息（无受派任务）", undefined, target)).ok, true);
    const receipt = await plan({ operationId: "w6-plan-message-origin", flowId: "demo", plan: { path: "docs/scheduling/demo-team-v1.md", version: 1 } });
    assert.equal(receipt.ok, false); assert.equal(receipt.status, "blocked");
    if (receipt.ok === false) assert.equal(receipt.errorCode, "plan-task-unavailable");
  } finally {
    await manager.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

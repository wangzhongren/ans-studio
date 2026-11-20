// test/桌面应用/app-dispatch-tool-surface.test.ts
// 2026-11-17（v2.2 第一步测试批 T2，测试角色）：**app-dispatch/v1 会话工具面 / 资源快照**。
//
// 依据：设计 §2.1/§6.1（能力面变更清单）；`角色卡/桌面窗口/docs/change/
// 2026-11-17_change_app-dispatch-builtins-desktop.md` §一.2/§三/§四/§六（待测试批 3）；
// `角色卡/门禁引擎/docs/change/2026-11-17_change_app-dispatch-builtins-texts.md` §1/§5.2。
// 覆盖：
//   1. fixed + app-dispatch/v1 幕僚：**不注入** dispatch_task / close_created_task（含 fixed v2）/
//      redispatch_task / terminate_role_run；**注入** select_workflow；request_choice（customerInput）与
//      只读工具保留；资源注入 chief-workflow-v3（版本/磁盘 SHA256/字节）；
//   2. 同会话 fixed-v2.1（在飞快照）：旧工具面逐字（dispatch/close/redispatch/terminate 在，
//      select_workflow 不在）；资源仍注入 v2（版本/磁盘 SHA256）；
//   3. legacy 快照不变：dispatch/terminate/redispatch 在；无 v2/v3 固定资源段；
//   4. convener app-dispatch：dispatch_task 在，但内置目标 ⇒ `convener-builtin-dispatch-forbidden`；
//      项目 worker 需绑定自身 open 的 worker-dispatch 任务（`worker-dispatch-required`）；
//      幕僚任意派发 ⇒ `chief-dispatch-removed`；同一输入在 fixed-v2.1/缺省协议下旧矩阵逐字。
// 夹具：真实 `openRoleSession`（假适配器，不发回合、立即 dispose）；不启动 Electron/模型。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { evaluateFixedPathDispatchAuthorization } from "../../src/common/编排/workflow-dispatch.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RuntimeAdapter, RoleSession, SessionEvent, WriteGate } from "../../src/model/runtime.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_DIR = path.join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief");
const V2_PATH = path.join(WORKFLOW_DIR, "chief-workflow-v2.md");
const V3_PATH = path.join(WORKFLOW_DIR, "chief-workflow-v3.md");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeTrioProject(roleIds: readonly string[]): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-app-dispatch-surface-"));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    builtInRoles: [...roleIds],
    governanceModel: "trio",
  };
}

function fakeSession(): RoleSession {
  return {
    async prompt(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        yield { kind: "settled", summary: "surface probe" } as SessionEvent;
      })();
    },
    async dispose(): Promise<void> {},
  };
}

interface OpenOptions {
  roleId: string;
  workflowMode?: "fixed" | "legacy";
  workflowProtocol?: "fixed-v2.1" | "app-dispatch/v1";
  withSelectWorkflow?: boolean;
}

interface Captured {
  capabilities?: AdapterCapabilities;
}

const stub = (async () => ({ ok: true })) as never;

async function openWith(options: OpenOptions): Promise<AdapterCapabilities | undefined> {
  const project = makeTrioProject(["chief", "product", "rapporteur", "nominator", "convener", "verifier"]);
  const captured: Captured = {};
  const createAdapter = (_gate: WriteGate, capabilities?: AdapterCapabilities): RuntimeAdapter => {
    captured.capabilities = capabilities;
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole(): Promise<RoleSession> {
        return fakeSession();
      },
      async prepareRole() { return {} as never; },
      async bindPreparedRole(): Promise<RoleSession> { return fakeSession(); },
    } as RuntimeAdapter;
  };
  try {
    const handle = await openRoleSession({
      roleId: options.roleId,
      project,
      runtime: "pi",
      ...(options.workflowMode !== undefined ? { workflowMode: options.workflowMode } : {}),
      ...(options.workflowProtocol !== undefined ? { workflowProtocol: options.workflowProtocol } : {}),
      ...(options.withSelectWorkflow === true
        ? { selectWorkflow: (async () => ({ ok: true as const, workflowId: "wf-x", stage: "A1" as const, taskIds: [], message: "" })) as never }
        : {}),
      customerInput: (async () => ({ outcome: "declined" as const, reason: "probe" })) as never,
      dispatchTask: stub,
      terminateRoleRun: stub,
      redispatchTask: stub,
      closeCreatedTask: stub,
      closeCreatedTaskFixed: stub,
      completeTeamPlan: stub,
      activateRoleDocumentsFixed: stub,
      contractCheck: (async () => "contract") as never,
      docFormat: (async () => "doc") as never,
      evidenceCheck: (async () => "evidence") as never,
      projectState: (async () => "state") as never,
      projectNote: (async () => ({ ok: true })) as never,
      roleActivityLog: (async () => "log") as never,
      gitQuery: stub,
      gitCandidate: stub,
      gitPublish: stub,
      submitRefactor: stub,
      requestStableWrite: stub,
    }, { createAdapter });
    await handle.dispose();
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
  return captured.capabilities;
}

interface ResourceSectionFacts {
  heading: string;
  resourceVersion: string;
  sha256: string;
  bytes: number;
  text: string;
}

function findChiefWorkflowSection(capabilities: AdapterCapabilities, versionLabel: string): ResourceSectionFacts {
  const sections = capabilities.contextSections ?? [];
  const section = sections.find((entry) => entry.includes(`resourceVersion":"chief-workflow/${versionLabel}`)
    || entry.includes(`resourceVersion\":\"chief-workflow/${versionLabel}`));
  assert.ok(section !== undefined, `fixed 幕僚上下文必须包含 chief-workflow/${versionLabel} 资源段`);
  const lines = section!.split("\n");
  const metadata = JSON.parse(lines[1]!) as { resourceVersion: string; sha256: string; bytes: number };
  return {
    heading: lines[0]!,
    resourceVersion: metadata.resourceVersion,
    sha256: metadata.sha256,
    bytes: metadata.bytes,
    text: section!,
  };
}

test("app-dispatch/v1 幕僚工具面：无 dispatch/close/redispatch/terminate，有 select_workflow；request_choice 与只读工具保留；注入 v3 资源", async () => {
  const capabilities = await openWith({
    roleId: "chief", workflowMode: "fixed", workflowProtocol: "app-dispatch/v1", withSelectWorkflow: true,
  });
  assert.ok(capabilities !== undefined);
  // 旧动作面结构性不注入（不是运行时拒绝）。
  assert.equal(capabilities!.dispatchTask, undefined, "幕僚不注入 dispatch_task（chief-dispatch-removed 的会话层防线）");
  assert.equal(capabilities!.closeCreatedTaskFixed, undefined, "幕僚不注入 close_created_task v2");
  assert.equal(capabilities!.redispatchTask, undefined, "幕僚不注入 redispatch_task（重试归应用）");
  assert.equal(capabilities!.terminateRoleRun, undefined, "幕僚不注入 terminate_role_run（停止归客户/应用）");
  // 唯一流程动作。
  assert.equal(typeof capabilities!.selectWorkflow, "function", "幕僚注入 select_workflow");
  // 客户卡通道保留（request_choice 注入才注册）。
  assert.equal(typeof capabilities!.customerInput, "function", "request_choice 保留（按应用 prompt 呈卡）");
  // 只读/备注工具保留。
  assert.equal(typeof capabilities!.projectState, "function");
  assert.equal(typeof capabilities!.projectNote, "function");
  assert.equal(typeof capabilities!.roleActivityLog, "function");
  assert.equal(typeof capabilities!.contractCheck, "function");
  assert.equal(typeof capabilities!.docFormat, "function");
  // 资源：v3 注入，版本/磁盘 SHA256/字节一致。
  const v3Bytes = fs.readFileSync(V3_PATH);
  const v3 = findChiefWorkflowSection(capabilities!, "v3");
  assert.match(v3.heading, /^## 应用内置 Chief workflow v3（app-dispatch\/v1 应用流程驱动）/);
  assert.equal(v3.resourceVersion, "chief-workflow/v3");
  assert.equal(v3.sha256, sha256(v3Bytes), "v3 资源 SHA256 必须是磁盘实测值");
  assert.equal(v3.bytes, v3Bytes.length);
  assert.ok(v3.text.includes("# Chief 工作流（两条固定路径 v3 / 应用流程驱动）"), "注入 v3 正文");
  assert.equal(v3.text.includes("资源版本：chief-workflow/v2"), false, "新协议会话不得混入 v2 资源");
});

test("fixed-v2.1 在飞快照逐字：旧工具面全在、select_workflow 不在；资源仍注入 v2（版本/磁盘 SHA256）", async () => {
  const capabilities = await openWith({
    roleId: "chief", workflowMode: "fixed", workflowProtocol: "fixed-v2.1", withSelectWorkflow: true,
  });
  assert.ok(capabilities !== undefined);
  assert.equal(typeof capabilities!.dispatchTask, "function", "fixed-v2.1 幕僚保留 dispatch_task");
  assert.equal(typeof capabilities!.closeCreatedTaskFixed, "function", "fixed-v2.1 幕僚保留 close_created_task v2");
  assert.equal(typeof capabilities!.redispatchTask, "function", "fixed-v2.1 幕僚保留 redispatch_task");
  assert.equal(typeof capabilities!.terminateRoleRun, "function", "fixed-v2.1 幕僚保留 terminate_role_run");
  assert.equal(capabilities!.selectWorkflow, undefined, "旧协议不注入 select_workflow（Q10 协议隔离）");
  const v2Bytes = fs.readFileSync(V2_PATH);
  const v2 = findChiefWorkflowSection(capabilities!, "v2");
  assert.match(v2.heading, /^## 应用内置 Chief workflow v2/);
  assert.equal(v2.resourceVersion, "chief-workflow/v2");
  assert.equal(v2.sha256, sha256(v2Bytes));
  assert.equal(v2.bytes, v2Bytes.length);
  assert.ok(v2.text.includes("# Chief 工作流（两条固定路径 v2）"));
  assert.equal(v2.text.includes("资源版本：chief-workflow/v3"), false, "旧协议不得混入 v3 资源");
});

test("legacy 快照不变：dispatch/terminate/redispatch 在；无 fixed v2/v3 资源段；无 select_workflow", async () => {
  const capabilities = await openWith({
    roleId: "chief", workflowMode: "legacy", withSelectWorkflow: true,
  });
  assert.ok(capabilities !== undefined);
  assert.equal(typeof capabilities!.dispatchTask, "function", "legacy 注入面逐字保留");
  assert.equal(typeof capabilities!.terminateRoleRun, "function");
  assert.equal(typeof capabilities!.redispatchTask, "function");
  assert.equal(capabilities!.selectWorkflow, undefined, "legacy 不注入 select_workflow");
  const sections = (capabilities!.contextSections ?? []).join("\n");
  assert.equal(sections.includes("chief-workflow/v2"), false, "legacy 不注入 v2 固定资源");
  assert.equal(sections.includes("chief-workflow/v3"), false, "legacy 不注入 v3 固定资源");
  // legacy Git 治理工具逐字注入（旧链不变）。
  assert.equal(typeof capabilities!.gitQuery, "function");
  assert.equal(typeof capabilities!.gitCandidate, "function");
  assert.equal(typeof capabilities!.gitPublish, "function");
});

test("convener app-dispatch：dispatch_task 在（仅项目 worker 绑定 open worker-dispatch）；内置目标拒绝；chief 任意派发拒绝", async () => {
  const capabilities = await openWith({
    roleId: "convener", workflowMode: "fixed", workflowProtocol: "app-dispatch/v1",
  });
  assert.ok(capabilities !== undefined);
  assert.equal(typeof capabilities!.dispatchTask, "function", "运营保留 dispatch_task（仅项目 worker）");
  assert.equal(typeof capabilities!.closeCreatedTaskFixed, "function", "运营保留 close_created_task（worker-dispatch 收口 Q6）");
  assert.equal(capabilities!.selectWorkflow, undefined, "运营不注入 select_workflow");
  assert.equal(typeof capabilities!.completeTeamPlan, "function", "A9 complete_team_plan 保留");

  const workerDispatchEvidence = {
    sourceIsCurrent: true,
    idempotencyKey: "dispatch-key-1",
    identity: { sourceRoleId: "convener", targetRoleId: "worker" },
    assignedTask: {
      taskId: "t-worker-dispatch",
      from: "application",
      to: "convener",
      taskKind: "worker-dispatch",
      workflowId: "wf-0123456789abcdef01234567",
      stage: "A11" as const,
      open: true,
      stopped: false,
    },
  };
  const base = {
    protocol: "app-dispatch/v1" as const,
    sourceRoleId: "convener",
    targetRoleId: "worker",
    targetKind: "project" as const,
    targetExists: true,
    workflow: { workflowId: "wf-0123456789abcdef01234567", stage: "A11" as const },
    evidence: workerDispatchEvidence,
  };
  const allowed = evaluateFixedPathDispatchAuthorization(base);
  assert.equal(allowed.ok, true, allowed.ok === false ? allowed.code : "");

  // 内置目标：即使伪造完整证据也拒绝（目标集清零）。
  for (const target of ["product", "rapporteur", "nominator", "verifier", "chief"]) {
    const decision = evaluateFixedPathDispatchAuthorization({
      ...base,
      targetRoleId: target,
      targetKind: "built-in-governance",
      evidence: {
        ...workerDispatchEvidence,
        identity: { sourceRoleId: "convener", targetRoleId: target },
      },
    });
    assert.equal(decision.ok, false, `convener→${target} 必须拒绝`);
    if (!decision.ok) {
      assert.equal(decision.code, "convener-builtin-dispatch-forbidden", target);
      assert.match(decision.message, /内置任务由应用按流程定义创建/);
    }
  }
  // 项目 worker 无绑定 / 绑定旧 stage-request / 已关闭 / workflow 不符 ⇒ worker-dispatch-required。
  const noEvidence = evaluateFixedPathDispatchAuthorization({ ...base, evidence: undefined });
  assert.equal(noEvidence.ok, false);
  if (!noEvidence.ok) assert.equal(noEvidence.code, "dispatch-evidence-missing");
  const unbound = evaluateFixedPathDispatchAuthorization({
    ...base,
    evidence: { ...workerDispatchEvidence, assignedTask: undefined } as never,
  });
  assert.equal(unbound.ok, false);
  if (!unbound.ok) {
    assert.equal(unbound.code, "worker-dispatch-required");
    assert.deepEqual(unbound.missing, ["assignedTask"]);
  }
  const oldStageRequest = evaluateFixedPathDispatchAuthorization({
    ...base,
    evidence: {
      ...workerDispatchEvidence,
      assignedTask: { ...workerDispatchEvidence.assignedTask, from: "chief", taskKind: "stage-request" },
    } as never,
  });
  assert.equal(oldStageRequest.ok, false);
  if (!oldStageRequest.ok) {
    assert.equal(oldStageRequest.code, "worker-dispatch-required");
    assert.match(oldStageRequest.message, /open 的 worker-dispatch 任务/);
  }
  const closedBinding = evaluateFixedPathDispatchAuthorization({
    ...base,
    evidence: {
      ...workerDispatchEvidence,
      assignedTask: { ...workerDispatchEvidence.assignedTask, open: false },
    } as never,
  });
  assert.equal(closedBinding.ok, false);
  if (!closedBinding.ok) assert.equal(closedBinding.code, "worker-dispatch-required");
  const wrongWorkflow = evaluateFixedPathDispatchAuthorization({
    ...base,
    workflow: { workflowId: "wf-other", stage: "A11" },
  });
  assert.equal(wrongWorkflow.ok, false);
  if (!wrongWorkflow.ok) assert.equal(wrongWorkflow.code, "worker-dispatch-required");
  // 非 production 目的（如 review）也被收窄。
  const reviewPurpose = evaluateFixedPathDispatchAuthorization({ ...base, purpose: "review" });
  assert.equal(reviewPurpose.ok, false);
  if (!reviewPurpose.ok) assert.equal(reviewPurpose.code, "worker-dispatch-required");

  // 幕僚任意派发 ⇒ chief-dispatch-removed（谓词双保险）。
  for (const target of ["convener", "verifier", "product", "worker"]) {
    const chief = evaluateFixedPathDispatchAuthorization({
      protocol: "app-dispatch/v1",
      sourceRoleId: "chief",
      targetRoleId: target,
      targetKind: target === "worker" ? "project" : "built-in-governance",
      targetExists: true,
    });
    assert.equal(chief.ok, false);
    if (!chief.ok) assert.equal(chief.code, "chief-dispatch-removed", target);
  }

  // fixed-v2.1/缺省协议：同一输入旧矩阵逐字（运营→product 允许；旧 stage-request 绑定语义）。
  const legacyMatrix = evaluateFixedPathDispatchAuthorization({
    protocol: "fixed-v2.1",
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    evidence: {
      sourceIsCurrent: true,
      idempotencyKey: "dispatch-key-1",
      identity: { sourceRoleId: "convener", targetRoleId: "product" },
      assignedTask: {
        taskId: "t-stage-request", from: "chief", to: "convener", taskKind: "stage-request",
        workflowId: "wf-0123456789abcdef01234567", stage: "A4", open: true, stopped: false,
      },
    },
  });
  assert.equal(legacyMatrix.ok, true, "旧协议运营→内置仍按旧矩阵允许（在飞兼容）");
  const defaultMatrix = evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "convener",
    targetKind: "built-in-governance",
    targetExists: true,
    purpose: "stage-request",
    stageRequest: { taskKind: "stage-request", workflowAction: "advance", sideEffect: "read-only" },
    evidence: {
      sourceIsCurrent: true, idempotencyKey: stageKey(), sourceTaskId: "turn-1",
      identity: { sourceRoleId: "chief", targetRoleId: "convener" },
    },
  });
  assert.equal(defaultMatrix.ok, true, "缺省协议（fixed-v2.1）幕僚 stage-request 逐字允许");
});

function stageKey(): string {
  return "stage-request:wf-0123456789abcdef01234567:A1:1";
}

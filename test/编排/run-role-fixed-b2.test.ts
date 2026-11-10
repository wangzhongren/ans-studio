// test/编排/run-role-fixed-b2.test.ts
// T3「两条固定工作流路径」B2 编排接线（2026-11-10）：AC-12/AC-18/AC-23/AC-24；MF-IR-2/3/4；T-04/T-05/T-13。
//
// 覆盖（本文件只做 run-role 公开入口行为 + 源码接缝断言；不启动真实模型、不写真实账本）：
//  ① `cardKindsOf` 改调门禁引擎门面：fixed 矩阵只读模块 `fixedCards`（chief 含 proposal、rapporteur
//     仅 decision ⇒ proposal 被拒），legacy 矩阵只读模块 `cards`（chief 仅 intent-confirm ⇒ proposal 被拒）。
//  ② fixed chief 注入 `chief-workflow-v2.md`（版本/元数据/SHA-256 与磁盘实测一致）；legacy chief
//     不注入 v2；fixed 非 chief 不注入 v2（模块 fixed context 段照常注入）。
//  ③ fixed 会话不注入 legacy Git/VCA/stable 工具；complete_team_plan/close_created_task 保留；
//     `requestReleaseMerge` 不存在（源码零出现）。
//  ④ fixed `close_created_task` v2 依赖：应用实现收到 run-role 绑定的可信身份（projectRoot/actorRoleId）；
//     legacy 实现不注入 fixed 会话；未注入应用实现 ⇒ 默认直连 `workflowService.closeTask`（写 task.closed、
//     不触 `.ans/trunk`/`.ans/runs`）。
//  ⑤ fixed `activate_role_documents` v2 依赖：nominator 应用实现收到绑定 projectRoot；legacy 实现不触达。
//  ⑥ legacy 注入面逐字保留：closeCreatedTask/activateRoleDocuments 同一引用注入，fixed 字段缺席。
//  ⑦ `governance_matrix` 工具：fixed 会话透传 fixed 矩阵视图；legacy 会话保持 legacy 视图。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { FixedActivateRoleDocumentsDep, FixedCloseCreatedTaskDep } from "../../src/common/编排/workflow-service.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  ActivateRoleDocumentsFn,
  CloseCreatedTaskFn,
  CustomerInputFn,
  CustomerInputOutcome,
  CustomerInputRequest,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
} from "../../src/model/runtime.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUN_ROLE = path.join(REPO_ROOT, "src", "pipeline", "orchestration", "run-role.ts");
const V2_RESOURCE = path.join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief", "chief-workflow-v2.md");
const WF = "wf-0123456789abcdef01234567";

interface Captured {
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (_gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.caps = caps;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

function projectOf(root: string, builtInRoles: string[]): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles,
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:b2-orchestration" },
    },
  };
}

interface OpenOptions {
  roleId: string;
  mode: "fixed" | "legacy";
  builtInRoles?: string[];
  customerInput?: CustomerInputFn;
  closeCreatedTask?: CloseCreatedTaskFn;
  activateRoleDocuments?: ActivateRoleDocumentsFn;
  completeTeamPlan?: AdapterCapabilities["completeTeamPlan"];
  closeCreatedTaskFixed?: FixedCloseCreatedTaskDep;
  activateRoleDocumentsFixed?: FixedActivateRoleDocumentsDep;
  gitQuery?: AdapterCapabilities["gitQuery"];
  gitCandidate?: AdapterCapabilities["gitCandidate"];
  gitPublish?: AdapterCapabilities["gitPublish"];
  selectRunChange?: AdapterCapabilities["selectRunChange"];
  submitVersionChange?: AdapterCapabilities["submitVersionChange"];
  requestStableWrite?: AdapterCapabilities["requestStableWrite"];
  submitRefactor?: AdapterCapabilities["submitRefactor"];
  requestVersionDecision?: AdapterCapabilities["requestVersionDecision"];
}

async function withSession<T>(
  options: OpenOptions,
  fn: (ctx: { caps: AdapterCapabilities; root: string }) => Promise<T>,
): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-b2-runrole-"));
  const captured: Captured = {};
  const handle = await openRoleSession(
    {
      roleId: options.roleId,
      project: projectOf(root, options.builtInRoles ?? [options.roleId]),
      runtime: "pi",
      workflowMode: options.mode,
      ...(options.customerInput !== undefined ? { customerInput: options.customerInput } : {}),
      ...(options.closeCreatedTask !== undefined ? { closeCreatedTask: options.closeCreatedTask } : {}),
      ...(options.activateRoleDocuments !== undefined ? { activateRoleDocuments: options.activateRoleDocuments } : {}),
      ...(options.completeTeamPlan !== undefined ? { completeTeamPlan: options.completeTeamPlan } : {}),
      ...(options.closeCreatedTaskFixed !== undefined ? { closeCreatedTaskFixed: options.closeCreatedTaskFixed } : {}),
      ...(options.activateRoleDocumentsFixed !== undefined ? { activateRoleDocumentsFixed: options.activateRoleDocumentsFixed } : {}),
      ...(options.gitQuery !== undefined ? { gitQuery: options.gitQuery } : {}),
      ...(options.gitCandidate !== undefined ? { gitCandidate: options.gitCandidate } : {}),
      ...(options.gitPublish !== undefined ? { gitPublish: options.gitPublish } : {}),
      ...(options.selectRunChange !== undefined ? { selectRunChange: options.selectRunChange } : {}),
      ...(options.submitVersionChange !== undefined ? { submitVersionChange: options.submitVersionChange } : {}),
      ...(options.requestStableWrite !== undefined ? { requestStableWrite: options.requestStableWrite } : {}),
      ...(options.submitRefactor !== undefined ? { submitRefactor: options.submitRefactor } : {}),
      ...(options.requestVersionDecision !== undefined ? { requestVersionDecision: options.requestVersionDecision } : {}),
    },
    { createAdapter: capturingFactory(captured) },
  );
  try {
    assert.ok(captured.caps !== undefined, "适配器必须收到能力对象");
    return await fn({ caps: captured.caps!, root });
  } finally {
    await handle.dispose();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

function declinedStub(calls: CustomerInputRequest[]): CustomerInputFn {
  return async (req): Promise<CustomerInputOutcome> => {
    calls.push(req);
    return { outcome: "declined", reason: "stub-channel-declined" };
  };
}

function choiceRequest(cardKind: "proposal"): CustomerInputRequest {
  return {
    kind: "choice",
    title: "方案确认",
    options: [
      { id: "accept", label: "接受" },
      { id: "revise", label: "修订" },
    ],
    flowId: "snake",
    cardKind,
  };
}

async function callChoice(caps: AdapterCapabilities, request: CustomerInputRequest): Promise<CustomerInputOutcome> {
  assert.ok(caps.customerInput !== undefined, "确认制会话必须注入 customerInput 包装器");
  const outcome = await caps.customerInput!(request, { flowId: "snake", cardKind: request.cardKind });
  return outcome ?? { outcome: "unavailable", reason: "no-outcome" };
}

// ————————————————————————— ① cardKindsOf 门面 —————————————————————————

test("cardKindsOf 门面：fixed 只读 fixedCards（chief 允许 proposal；rapporteur 仅 decision ⇒ proposal 被拒）", async () => {
  const chiefCalls: CustomerInputRequest[] = [];
  await withSession({ roleId: "chief", mode: "fixed", customerInput: declinedStub(chiefCalls) }, async ({ caps }) => {
    const outcome = await callChoice(caps, choiceRequest("proposal"));
    assert.equal(outcome.outcome, "declined");
    assert.equal(chiefCalls.length, 1, "fixed chief 的 proposal 卡在白名单内 ⇒ 触达客户通道（stub 拒绝）");
  });
  const rapporteurCalls: CustomerInputRequest[] = [];
  await withSession(
    { roleId: "rapporteur", mode: "fixed", customerInput: declinedStub(rapporteurCalls) },
    async ({ caps }) => {
      const outcome = await callChoice(caps, choiceRequest("proposal"));
      assert.equal(outcome.outcome, "declined");
      assert.equal(rapporteurCalls.length, 0, "fixed rapporteur 的 fixedCards=[decision] ⇒ proposal 越权，不触达客户通道");
    },
  );
});

test("cardKindsOf 门面：legacy 只读模块 cards（chief 仅 intent-confirm ⇒ proposal 被拒；rapporteur 含 proposal ⇒ 触达）", async () => {
  const chiefCalls: CustomerInputRequest[] = [];
  await withSession({ roleId: "chief", mode: "legacy", customerInput: declinedStub(chiefCalls) }, async ({ caps }) => {
    const outcome = await callChoice(caps, choiceRequest("proposal"));
    assert.equal(outcome.outcome, "declined");
    assert.equal(chiefCalls.length, 0, "legacy chief 的 cards=[intent-confirm] ⇒ proposal 越权，不触达客户通道");
  });
  const rapporteurCalls: CustomerInputRequest[] = [];
  await withSession(
    { roleId: "rapporteur", mode: "legacy", customerInput: declinedStub(rapporteurCalls) },
    async ({ caps }) => {
      await callChoice(caps, choiceRequest("proposal"));
      assert.equal(rapporteurCalls.length, 1, "legacy rapporteur 的 cards 含 proposal ⇒ 触达客户通道（stub 拒绝）");
    },
  );
});

// ————————————————————————— ② chief-workflow-v2 注入 —————————————————————————

test("fixed chief 注入 chief-workflow-v2（版本/元数据/SHA-256 与磁盘一致）；legacy chief 不注入", async () => {
  const bytes = fs.readFileSync(V2_RESOURCE);
  const expectedSha = createHash("sha256").update(bytes).digest("hex");
  await withSession({ roleId: "chief", mode: "fixed" }, async ({ caps }) => {
    const sections = caps.contextSections ?? [];
    const v2 = sections.find((section) => section.includes("chief-workflow/v2"));
    assert.ok(v2 !== undefined, "fixed chief 必须注入 chief-workflow-v2.md");
    assert.match(v2!, /^## 应用内置 Chief workflow v2（fixed 固定路径；本段优先于任何 legacy chief-workflow v1 段）/);
    assert.ok(v2!.includes("# Chief 工作流（两条固定路径 v2）"), "注入 v2 资源正文");
    const metadataLine = v2!.split("\n")[1]!;
    const metadata = JSON.parse(metadataLine) as Record<string, unknown>;
    assert.equal(metadata["resourceVersion"], "chief-workflow/v2");
    assert.equal(metadata["sha256"], expectedSha, "资源 SHA-256 必须是磁盘实测值");
    assert.equal(metadata["bytes"], bytes.length);
    // 模块 fixed context 段同批注入（v1.3 §3.4）。
    assert.ok(sections.some((section) => section.includes("固定路径产线调度")), "chief 模块 fixed context 段必须注入");
  });
  await withSession({ roleId: "chief", mode: "legacy" }, async ({ caps }) => {
    const sections = caps.contextSections ?? [];
    assert.equal(sections.some((section) => section.includes("chief-workflow/v2")), false, "legacy chief 不得注入 v2 资源");
    assert.equal(sections.some((section) => section.includes("固定路径产线调度")), false, "legacy chief 不得注入 fixed context 段");
  });
});

test("fixed 非 chief 会话：不注入 v2 资源；模块 fixed context 段照常注入", async () => {
  await withSession({ roleId: "convener", mode: "fixed" }, async ({ caps }) => {
    const sections = caps.contextSections ?? [];
    assert.equal(sections.some((section) => section.includes("chief-workflow/v2")), false);
    assert.ok(
      sections.some((section) => section.includes("固定路径集成汇总与报告期望（fixed）")),
      "convener 模块 fixed context 段必须注入",
    );
  });
});

// ————————————————————————— ③ fixed 工具过滤 —————————————————————————

test("fixed 会话：legacy Git/VCA/stable 工具不注入；completeTeamPlan/closeCreatedTask 保留；无 requestReleaseMerge", async () => {
  const fixture = (async () => ({ ok: true })) as never;
  await withSession(
    {
      roleId: "convener",
      mode: "fixed",
      gitQuery: fixture,
      gitCandidate: fixture,
      gitPublish: fixture,
      selectRunChange: fixture,
      submitVersionChange: fixture,
      requestStableWrite: fixture,
      submitRefactor: fixture,
      requestVersionDecision: fixture,
      completeTeamPlan: fixture as never,
      closeCreatedTask: (async () => ({ ok: false })) as never,
      activateRoleDocuments: fixture,
    },
    async ({ caps }) => {
      assert.equal(caps.gitQuery, undefined, "fixed 不得注入 git_query");
      assert.equal(caps.gitCandidate, undefined, "fixed 不得注入 git_candidate");
      assert.equal(caps.gitPublish, undefined, "fixed 不得注入 git_publish");
      assert.equal(caps.selectRunChange, undefined, "fixed 不得注入 select_run_change");
      assert.equal(caps.submitVersionChange, undefined, "fixed 不得注入 submit_version_change");
      assert.equal(caps.requestStableWrite, undefined, "fixed 不得注入 request_stable_write");
      assert.equal(caps.submitRefactor, undefined, "fixed 不得注入 submit_refactor");
      assert.equal(caps.requestVersionDecision, undefined, "fixed 不得注入 request_version_decision");
      assert.notEqual(caps.completeTeamPlan, undefined, "fixed 保留 complete_team_plan（v4）");
      assert.notEqual(caps.closeCreatedTask, undefined, "fixed 保留 close_created_task（v2 别名位）");
      assert.notEqual(caps.closeCreatedTaskFixed, undefined, "fixed 注入 close_created_task v2 依赖");
      assert.equal("requestReleaseMerge" in (caps as unknown as Record<string, unknown>), false, "不得新增 requestReleaseMerge");
      assert.equal("request_release_merge" in (caps as unknown as Record<string, unknown>), false);
    },
  );
});

test("源码接缝：run-role 不新增 requestReleaseMerge（G-IR §六 拒绝）", async () => {
  const source = await fsp.readFile(RUN_ROLE, "utf8");
  assert.doesNotMatch(source, /requestReleaseMerge|request_release_merge/);
});

// ————————————————————————— ④ fixed close 依赖 —————————————————————————

test("fixed close：应用实现收到绑定身份（projectRoot/actorRoleId）；legacy 实现不注入", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const legacyClose = (async () => ({ ok: false })) as never as CloseCreatedTaskFn;
  await withSession(
    {
      roleId: "chief",
      mode: "fixed",
      closeCreatedTask: legacyClose,
      closeCreatedTaskFixed: async (input) => {
        seen.push({ ...input });
        return { ok: false, code: "fixture", message: "fixture" };
      },
    },
    async ({ caps, root }) => {
      assert.ok(caps.closeCreatedTaskFixed !== undefined);
      assert.notEqual(caps.closeCreatedTask, legacyClose, "fixed 会话不得注入 legacy closeCreatedTask 实现");
      const result = await caps.closeCreatedTaskFixed!({ operationId: "op-1", taskId: "t-1", outcome: "rejected", note: "n" });
      assert.equal(result.ok, false);
      assert.equal(seen.length, 1);
      assert.equal(seen[0]!["projectRoot"], root);
      assert.equal(seen[0]!["actorRoleId"], "chief");
      assert.equal(seen[0]!["operationId"], "op-1");
      assert.equal(seen[0]!["taskId"], "t-1");
      assert.equal(seen[0]!["outcome"], "rejected");
      assert.equal(seen[0]!["note"], "n");
    },
  );
});

test("fixed close：未注入应用实现 ⇒ 默认直连 workflowService.closeTask（写 task.closed、不触 trunk/run）", async () => {
  await withSession({ roleId: "chief", mode: "fixed" }, async ({ caps, root }) => {
    const at = () => new Date("2026-11-10T10:00:00.000Z");
    const created = taskEvent(
      "task.created",
      {
        taskId: "t-stage-1",
        from: "chief",
        to: "convener",
        text: "推进 A1 阶段",
        sideEffect: "read-only",
        idempotencyKey: `stage-request:${WF}:A1:1`,
        flowId: "snake",
        workflowId: WF,
        stage: "A1",
        taskKind: "stage-request",
        workflowPath: "A",
      },
      at,
    );
    assert.equal((await appendTaskEvent(root, created)).ok, true);
    assert.ok(caps.closeCreatedTaskFixed !== undefined);
    const result = await caps.closeCreatedTaskFixed!({
      operationId: "op-close-stage-1",
      taskId: "t-stage-1",
      outcome: "rejected",
      note: "stopped by workflow request",
    });
    assert.equal(result.ok, true, result.ok === false ? `${result.code}: ${result.message}` : "");
    if (result.ok) {
      assert.equal(result.taskId, "t-stage-1");
      assert.match(result.eventId, /^event-/);
      assert.equal(result.replay, false);
    }
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-stage-1")?.closed?.outcome, "rejected");
    assert.equal(fs.existsSync(path.join(root, ".ans", "trunk")), false, "fixed 收口不得写 .ans/trunk");
    assert.equal(fs.existsSync(path.join(root, ".ans", "runs")), false, "fixed 收口不得写 .ans/runs");
    // 幂等 replay：同 operationId 返回原回执。
    const replay = await caps.closeCreatedTaskFixed!({
      operationId: "op-close-stage-1",
      taskId: "t-stage-1",
      outcome: "rejected",
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);
  });
});

// ————————————————————————— ⑤ fixed activate 依赖 —————————————————————————

test("fixed activate：nominator 应用实现收到绑定 projectRoot；legacy 实现不触达", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const legacyActivate = (async () => ({ ok: false })) as never as ActivateRoleDocumentsFn;
  await withSession(
    {
      roleId: "nominator",
      mode: "fixed",
      activateRoleDocuments: legacyActivate,
      activateRoleDocumentsFixed: async (input) => {
        seen.push({ ...input });
        return { ok: false, code: "fixture", message: "fixture" };
      },
    },
    async ({ caps, root }) => {
      assert.ok(caps.activateRoleDocumentsFixed !== undefined);
      assert.equal(caps.activateRoleDocuments, undefined, "fixed 会话不得注入 legacy activateRoleDocuments");
      const result = await caps.activateRoleDocumentsFixed!({
        operationId: "op-activate-1",
        flowId: "snake",
        workflowId: WF,
        proposalDecisionId: "decision-1",
        targetRoleId: "worker-a",
        roster: { path: "docs/proposals/snake-roster-v1.md", sha256: "a".repeat(64) },
        documents: {
          card: { path: "角色卡/worker-a/role-card.md", sha256: "b".repeat(64) },
          boundaryMd: { path: "角色卡/worker-a/boundary.md", sha256: "c".repeat(64) },
          boundaryYaml: { path: "角色卡/worker-a/boundary.yaml", sha256: "d".repeat(64) },
        },
      });
      assert.equal(result.ok, false);
      assert.equal(seen.length, 1);
      assert.equal(seen[0]!["projectRoot"], root);
      assert.equal(seen[0]!["flowId"], "snake");
      assert.equal(seen[0]!["targetRoleId"], "worker-a");
    },
  );
});

// ————————————————————————— ⑥ legacy 注入面逐字保留 —————————————————————————

test("legacy 会话：closeCreatedTask/activateRoleDocuments 同一引用注入；fixed 字段缺席", async () => {
  const closeCreatedTask = (async () => ({ ok: false })) as never as CloseCreatedTaskFn;
  await withSession({ roleId: "chief", mode: "legacy", closeCreatedTask }, async ({ caps }) => {
    assert.equal(caps.closeCreatedTask, closeCreatedTask, "legacy chief 收口实现同一引用");
    assert.equal(caps.closeCreatedTaskFixed, undefined, "legacy 会话不得注入 fixed close 依赖");
  });
  const activateRoleDocuments = (async () => ({ ok: false })) as never as ActivateRoleDocumentsFn;
  await withSession({ roleId: "nominator", mode: "legacy", activateRoleDocuments }, async ({ caps }) => {
    assert.equal(caps.activateRoleDocuments, activateRoleDocuments, "legacy nominator 激活实现同一引用");
    assert.equal(caps.activateRoleDocumentsFixed, undefined, "legacy 会话不得注入 fixed activate 依赖");
  });
});

// ————————————————————————— ⑦ governance_matrix fixed 视图 —————————————————————————

test("governance_matrix 工具：fixed 会话透传 fixed 矩阵视图；legacy 会话保持 legacy 视图", async () => {
  await withSession({ roleId: "chief", mode: "fixed" }, async ({ caps }) => {
    assert.ok(caps.governanceMatrix !== undefined);
    const result = await caps.governanceMatrix!({ section: "roles" });
    assert.equal(result.ok, true, result.ok === false ? result.message : "");
    if (result.ok) {
      assert.match(result.message, /固定路径幕僚/, "fixed 会话矩阵必须展示 fixed 摘要");
      assert.match(result.message, /两条固定路径|stage-request/, "fixed 视图含派发分裂口径");
    }
  });
  await withSession({ roleId: "chief", mode: "legacy" }, async ({ caps }) => {
    assert.ok(caps.governanceMatrix !== undefined);
    const result = await caps.governanceMatrix!({ section: "roles" });
    assert.equal(result.ok, true, result.ok === false ? result.message : "");
    if (result.ok) {
      assert.doesNotMatch(result.message, /固定路径幕僚/, "legacy 会话矩阵不得混入 fixed 摘要");
      assert.match(result.message, /五builtin/, "legacy 摘要逐字保留");
    }
  });
});

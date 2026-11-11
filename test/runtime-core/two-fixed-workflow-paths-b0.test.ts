// 运行时核心 T3 B0 契约测试：两条固定工作流路径的类型/schema/plumbing 骨架。
// 依据：实现级方案 v1.3 §3.3/§4.1/§5.3/§6.4/§7.1；B1 AC-05/AC-13/AC-14/AC-17/AC-24/AC-25。
// 只验证 B0 形状与透传（类型/枚举/守卫/工具层 plumbing）；不验证状态机/投影/账本 I/O/业务判定
// （编排 B0/B1 属主）。编译期断言由 `npm run typecheck` 覆盖（tsconfig include 含 test/）。
import test from "node:test";
import assert from "node:assert/strict";
import {
  BASIS_EVENT_KINDS,
  GOVERNANCE_APP_OWNED_CARD_KINDS,
  GOVERNANCE_CARD_GROUP,
  GOVERNANCE_CARD_KINDS,
  RELEASE_EVENT_KINDS,
  WORKFLOW_EVENT_KINDS,
  WORKFLOW_STAGES,
  governanceCardGroup,
  isBasisEvent,
  isReleaseEvent,
  isStageStatus,
  isWorkflowEvent,
  isWorkflowPath,
  isWorkflowStage,
  type AppOwnedGovernanceCardKind,
  type BasisDriftEvent,
  type BasisRecordedEvent,
  type DispatchTaskPayload,
  type GovernanceCardKind,
  type GovernanceChoiceCardKind,
  type GovernanceConfirmCardKind,
  type ReleaseMergedEvent,
  type RequestCreatedEvent,
  type RequestResolvedEvent,
  type RoleActivatedEvent,
  type StageRequestedEvent,
  type TaskCreatedEvent,
  type WorkflowEvent,
  type WorkflowStartedEvent,
} from "../../src/model/runtime.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { buildGovernedTools, DISPATCH_TASK_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import type { DispatchTaskFn } from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";

const AT = "2026-11-10T10:00:00.000Z";
const WF = "wf-0123456789abcdef01234567";
const D = "a".repeat(64);
const oid = (hex: string) => ({ objectFormat: "sha1" as const, hex });

// —————————————————————— 1. merge-main 卡种（AC-14） ——————————————————————

test("merge-main：在 GOVERNANCE_CARD_KINDS / app-owned 清单，不在 GOVERNANCE_CARD_GROUP，governanceCardGroup 返回 undefined", () => {
  const kind: GovernanceCardKind = "merge-main";
  const appOwned: AppOwnedGovernanceCardKind = "merge-main";
  assert.equal(kind, "merge-main");
  assert.equal(appOwned, "merge-main");

  assert.equal(GOVERNANCE_CARD_KINDS.includes("merge-main"), true);
  assert.equal(GOVERNANCE_APP_OWNED_CARD_KINDS.includes("merge-main"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, "merge-main"), false);
  assert.equal(governanceCardGroup("merge-main"), undefined);
  assert.equal(governanceCardGroup("merge-main" as never), undefined);

  // 不是 request_choice / request_confirmation 可发卡种（类型侧拒绝；应用自有通道构造）
  // @ts-expect-error merge-main 不属于 GovernanceChoiceCardKind
  const choice: GovernanceChoiceCardKind = "merge-main";
  // @ts-expect-error merge-main 不属于 GovernanceConfirmCardKind
  const confirm: GovernanceConfirmCardKind = "merge-main";
  assert.equal(choice as string, "merge-main");
  assert.equal(confirm as string, "merge-main");

  // 账本 request.created/resolved 的 cardKind 可携带（D1/S4 记账消费；不代表判断分组）
  const created: Pick<RequestCreatedEvent, "cardKind"> = { cardKind: "merge-main" };
  const resolved: Pick<RequestResolvedEvent, "cardKind"> = { cardKind: "merge-main" };
  assert.equal(created.cardKind, "merge-main");
  assert.equal(resolved.cardKind, "merge-main");

  // 既有判断分组键集与值逐字不变（本次加法不改 group）
  assert.deepEqual(Object.keys(GOVERNANCE_CARD_GROUP).sort(), [
    "acceptance", "appointment", "appointment-write", "decision", "download", "intent-confirm", "proposal",
  ]);
  assert.equal(governanceCardGroup("stable-write"), undefined);
  assert.equal(governanceCardGroup("proposal"), "decision");
  assert.equal(governanceCardGroup("intent-confirm"), "decision");
});

// —————————————————————— 2. 旧事件/载荷形状不变；新字段可选 ——————————————————————

test("TaskCreatedEvent/RequestCreatedEvent/RequestResolvedEvent：旧形状仍合法；T3 新字段全部可选", () => {
  const oldTask: TaskCreatedEvent = {
    v: 1, at: AT, kind: "task.created", taskId: "t-1", from: "chief", to: "convener", text: "x",
    sideEffect: "read-only", idempotencyKey: "k-1",
  };
  assert.equal("workflowId" in oldTask, false, "旧事件不得被强制携带新字段");
  const fixedTask: TaskCreatedEvent = {
    ...oldTask, flowId: "snake", workflowId: WF, stage: "A11", taskKind: "stage-request", workflowPath: "A",
  };
  assert.equal(fixedTask.workflowId, WF);
  assert.equal(fixedTask.stage, "A11");
  assert.equal("runId" in fixedTask, false, "fixed 任务不带 run（run-required 豁免由编排实现）");

  const oldCreated: RequestCreatedEvent = {
    v: 1, at: AT, kind: "request.created", requestId: "req-1", sourceRoleId: "chief", title: "意图确认",
    options: [{ id: "confirm", label: "确认" }],
  };
  const fixedCreated: RequestCreatedEvent = {
    ...oldCreated, flowId: "snake", workflowId: WF, stage: "A3",
    documentRefs: [{ path: "docs/product/snake-intent-v1.md", sha256: D, kind: "intent" }],
  };
  assert.equal(fixedCreated.documentRefs?.[0]?.path, "docs/product/snake-intent-v1.md");

  const oldResolved: RequestResolvedEvent = {
    v: 1, at: AT, kind: "request.resolved", requestId: "req-1", by: "customer", choice: "confirm",
  };
  const fixedResolved: RequestResolvedEvent = {
    ...oldResolved, cardKind: "appointment", workflowId: WF, stage: "A10", targetRoleIds: ["worker"],
    documentRefs: [{ path: "docs/proposals/snake-roster-v1.md", sha256: D }],
  };
  assert.equal(fixedResolved.stage, "A10");
  assert.equal("documentRefs" in oldResolved, false);
});

test("DispatchTaskPayload：旧形状 {roleId,task} 合法；T3 字段可选且枚举收窄", () => {
  const old: DispatchTaskPayload = { roleId: "product", task: "写意图" };
  assert.deepEqual(old, { roleId: "product", task: "写意图" });
  const fixed: DispatchTaskPayload = {
    roleId: "convener", task: "推进 A5", taskKind: "stage-request", workflowAction: "stop",
    workflowPath: "B", workflowId: WF, stage: "B3", reworkOf: "B1",
  };
  assert.equal(fixed.workflowAction, "stop");
  assert.equal(fixed.reworkOf, "B1");
  // @ts-expect-error workflowAction 只允许 advance/stop
  const badAction: DispatchTaskPayload = { roleId: "convener", task: "x", workflowAction: "pause" };
  // @ts-expect-error workflowPath 只允许 A/B
  const badPath: DispatchTaskPayload = { roleId: "convener", task: "x", workflowPath: "C" };
  assert.equal(badAction.workflowAction, "pause");
  assert.equal(badPath.workflowPath, "C");
});

// —————————————————————— 3. 账本事件 union / 守卫（正/负例） ——————————————————————

test("阶段/路径/状态词表：v1.3 §4.1 完整集合，坏值 fail-closed", () => {
  assert.equal(WORKFLOW_STAGES.length, 19, "A1–A13（含 A12a/A12b 共 15）+ B1–B4 共 4");
  for (const stage of ["A1", "A10", "A12a", "A12b", "A13", "B1", "B4"] as const) {
    assert.equal(isWorkflowStage(stage), true, stage);
    assert.equal(WORKFLOW_STAGES.includes(stage), true, stage);
  }
  for (const bad of ["A0", "A14", "A12c", "B0", "B5", "b1", "", 1, null, undefined]) {
    assert.equal(isWorkflowStage(bad), false, String(bad));
  }
  assert.equal(isWorkflowPath("A"), true);
  assert.equal(isWorkflowPath("B"), true);
  assert.equal(isWorkflowPath("C"), false);
  assert.equal(isWorkflowPath(undefined), false);
  for (const status of ["pending", "requested", "dispatched", "in-progress", "completed", "blocked", "failed", "skipped"] as const) {
    assert.equal(isStageStatus(status), true, status);
  }
  assert.equal(isStageStatus("stopping"), false);
});

test("ans-workflow/v1 守卫：合法事件通过；坏 schema/坏 stage/坏 kind/缺幂等键 false；未知额外字段容忍", () => {
  const started: WorkflowStartedEvent = {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "workflow.started", workflowId: WF, flowId: "snake", path: "A",
    idempotencyKey: "workflow-start:snake:A:t-1", trigger: { by: "chief", reason: "客户新需求" }, sourceTaskId: "t-1",
  };
  const requested: StageRequestedEvent = {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.requested", workflowId: WF, flowId: "snake", path: "A",
    idempotencyKey: `stage-request:${WF}:A1:1`, stage: "A1", requestTaskId: "t-2", requestDigest: D, attempt: 1,
  };
  const completed: WorkflowEvent = {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.completed", workflowId: WF, flowId: "snake", path: "A",
    idempotencyKey: `stage-complete:${WF}:A2:t-3`, stage: "A2", cause: { kind: "task-closed", ref: "t-3" },
    artifacts: [{ path: "docs/product/snake-intent-v1.md", sha256: D }],
  };
  const activated: RoleActivatedEvent = {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "role.activated", workflowId: WF, flowId: "snake", path: "A",
    idempotencyKey: `role-activation:${WF}:worker:${D}`, roleId: "worker", decisionRef: "decision-1",
    roster: { path: "docs/proposals/snake-roster-v1.md", sha256: D },
    documents: [{ path: "角色卡/worker/role-card.md", sha256: D }],
  };
  const closed: WorkflowEvent = {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "workflow.closed", workflowId: WF, flowId: "snake", path: "A",
    idempotencyKey: `workflow-close:${WF}:stopped:${D}`, outcome: "stopped", reason: "客户停止",
    stopEvidence: { requestClosed: true, operatorReported: true, openProductionTaskIds: [] },
  };
  for (const event of [started, requested, completed, activated, closed]) assert.equal(isWorkflowEvent(event), true, event.kind);

  assert.equal(isWorkflowEvent({ ...started, schema: "ans-workflow/v2" }), false, "坏 schema");
  assert.equal(isWorkflowEvent({ ...started, kind: "workflow.exploded" }), false, "坏 kind");
  assert.equal(isWorkflowEvent({ ...requested, stage: "A14" }), false, "坏 stage");
  assert.equal(isWorkflowEvent({ ...completed, stage: "A12c" }), false, "坏 stage");
  assert.equal(isWorkflowEvent({ ...started, idempotencyKey: "" }), false, "缺幂等键");
  assert.equal(isWorkflowEvent({ ...started, path: "C" }), false, "坏 path");
  assert.equal(isWorkflowEvent({ ...started, workflowId: "" }), false, "空 workflowId");
  assert.equal(isWorkflowEvent(null), false);
  assert.equal(isWorkflowEvent("workflow.started"), false);
  assert.equal(isWorkflowEvent([]), false);
  assert.equal(isWorkflowEvent(undefined), false);
  // 事件只增不改：未知额外字段允许（读取侧容忍）
  assert.equal(isWorkflowEvent({ ...started, futureField: { note: "later" } }), true);
  // 旧 tasks.jsonl 形状（不同 schema）不得被误认
  const oldTaskEvent = { v: 1, at: AT, kind: "task.created", taskId: "t-1", from: "chief", to: "convener", text: "x", sideEffect: "read-only", idempotencyKey: "k" };
  assert.equal(isWorkflowEvent(oldTaskEvent), false);
});

test("ans-basis/v1 守卫：recorded（baseline/path-b/amendment）/amended/verified/drift 正例；坏 reason/schema/kind false", () => {
  const recorded: BasisRecordedEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded", basisId: "bas-9c1d", workflowId: WF, flowId: "snake",
    documents: [{ kind: "intent", path: "docs/product/snake-intent-v1.md", version: 1, sha256: D, bytes: 1234 }],
    teamPlan: null,
    repo: { state: "existing", branch: `ans/task/${WF}`, baseOid: "0123456789abcdef0123456789abcdef01234567",
      ignorePolicy: "ans-v1", gitignoreSha256: "b".repeat(64) },
    reviewRoleId: "verifier", operationId: "op-1", idempotencyKey: `baseline:${WF}:${D}`, reason: "path-b", recordedBy: "application",
  };
  const drift: BasisDriftEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.drift", basisId: "bas-9c1d",
    path: "docs/product/snake-intent-v1.md", expectedSha256: D, actualSha256: null, detectedAt: AT,
    idempotencyKey: `basis-drift:bas-9c1d:${D}`,
  };
  assert.equal(isBasisEvent(recorded), true);
  assert.equal(isBasisEvent(drift), true);
  assert.equal(isBasisEvent({ ...recorded, kind: "basis.amended" }), false, "amended 缺 previousBasisId");
  assert.equal(isBasisEvent({ ...recorded, kind: "basis.amended", previousBasisId: "bas-0" }), true);
  assert.equal(isBasisEvent({ ...recorded, reason: "bogus" }), false, "坏 reason");
  assert.equal(isBasisEvent({ ...recorded, schema: "ans-basis/v2" }), false, "坏 schema");
  assert.equal(isBasisEvent({ ...recorded, kind: "basis.exploded" }), false, "坏 kind");
  assert.equal(isBasisEvent({ ...drift, expectedSha256: "nope" }), false, "坏 digest");
  assert.equal(isBasisEvent({ ...recorded, documents: [{ kind: "intent", path: "x", version: 1, sha256: D }] }), false, "缺 bytes");
  assert.equal(isBasisEvent({ ...recorded, futureField: 1 }), true, "未知额外字段容忍");
  assert.equal(BASIS_EVENT_KINDS.length, 4);
});

test("ans-release/v1 守卫：merged 正例；judge 不可 confirm；坏 schema/kind/oid false", () => {
  const merged: ReleaseMergedEvent = {
    v: 1, at: AT, schema: "ans-release/v1", kind: "release.merged", releaseId: "rel-7d", workflowId: WF, flowId: "snake",
    idempotencyKey: `release:${WF}:${"c".repeat(40)}`, baseOid: null, tipOid: oid("c".repeat(40)), mergeOid: oid("d".repeat(40)),
    mergeKind: "initial", files: [{ path: "src/main.ts", status: "A" }], diffDigest: D,
  };
  assert.equal(isReleaseEvent(merged), true);
  const confirmed = {
    v: 1, at: AT, schema: "ans-release/v1", kind: "release.confirmed", releaseId: "rel-7d", workflowId: WF, flowId: "snake",
    idempotencyKey: "release-confirm:rel-7d", by: "customer",
  };
  assert.equal(isReleaseEvent(confirmed), true);
  assert.equal(isReleaseEvent({ ...confirmed, by: "judge" }), false, "judge 不可代批 confirm");
  assert.equal(isReleaseEvent({ ...merged, schema: "ans-release/v9" }), false, "坏 schema");
  assert.equal(isReleaseEvent({ ...merged, kind: "release.exploded" }), false, "坏 kind");
  assert.equal(isReleaseEvent({ ...merged, tipOid: { objectFormat: "sha1", hex: "short" } }), false, "坏 OID");
  assert.equal(isReleaseEvent({ ...merged, mergeKind: "squash" }), false, "坏 mergeKind");
  assert.equal(isReleaseEvent({ ...merged, files: [{ path: "src/main.ts" }] }), false, "缺 status");
  assert.equal(isReleaseEvent({ ...merged, futureField: true }), true, "未知额外字段容忍");
  assert.equal(RELEASE_EVENT_KINDS.length, 5);
  assert.equal(WORKFLOW_EVENT_KINDS.length, 11);
});

// —————————————————————— 4. schema（dispatch_task / contract_check / close_created_task） ——————————————————————

test("dispatch_task schema（AC-05）：新属性存在且枚举正确；旧属性/required/additionalProperties/文案方向不变", () => {
  const tool = describeTool(DISPATCH_TASK_TOOL_NAME);
  const props = tool.parameters.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(tool.parameters.required, ["roleId", "task"], "旧 required 逐字不变");
  assert.equal(tool.parameters.additionalProperties, true, "additionalProperties 现状不变");
  for (const key of ["resumeController", "reviewTarget", "roleId", "task", "reason", "sideEffect", "expectedOutput",
    "requestedEvidence", "idempotencyKey", "flowId", "stepId", "moduleId", "modulePaths"]) {
    assert.ok(props[key], `旧属性 ${key} 必须保留`);
  }
  assert.deepEqual(props["sideEffect"]!.enum, ["read-only", "docs", "code", "external", "destructive", "unknown"]);

  assert.deepEqual(props["taskKind"]!.enum, ["stage-request"]);
  assert.deepEqual(props["workflowAction"]!.enum, ["advance", "stop"]);
  assert.deepEqual(props["workflowPath"]!.enum, ["A", "B"]);
  assert.equal(props["workflowId"]!.type, "string");
  assert.deepEqual(props["stage"]!.enum, [...WORKFLOW_STAGES]);
  assert.deepEqual(props["reworkOf"]!.enum, [...WORKFLOW_STAGES]);

  const text = [tool.description ?? "", ...(tool.promptGuidelines ?? [])].join("\n");
  assert.equal(text.includes("two-fixed-paths"), false, "schema 文案保持模式中立（不写死 fixed 专属口号）");
  assert.match(text, /stage-request/, "提示应说明 stage-request 无写权、需再派发");
  assert.match(text, /stop/, "提示应说明 stop 由收到请求的一方执行停稳");
  assert.match(text, /派发 ≠ 授权/, "既有派发纪律文案保留");
});

test("contract_check.taskKind 同步 stage-request；close_created_task 共享必填为两模式交集（B2 v2 收口）", () => {
  const cc = describeTool("contract_check");
  const ccProps = cc.parameters.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(ccProps["taskKind"]!.enum, ["dispatch", "appointment", "write", "acceptance", "shell", "stage-request"]);

  const close = describeTool("close_created_task");
  // T3 B2（MF-IR-2）：共享 schema 的 required 收口为 fixed 3+1 公共子集（fixed 输入须能通过
  // schema 层）；legacy 的 runId/basisDigest/reportRef 必填改由 handler 按模式 fail-closed 核验，
  // 错误消息保持 `invalid-arguments args.<field>: required`（见 two-fixed-workflow-paths-b2.test.ts）。
  assert.deepEqual(close.parameters.required, ["operationId", "taskId", "outcome"]);
  const closeProps = close.parameters.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(closeProps).sort(), ["basisDigest", "note", "operationId", "outcome", "reportRef", "runId", "taskId"]);
  assert.match(close.description ?? "", /runId\/basisDigest\/reportRef 必填不变/, "描述如实说明按模式核验、legacy 必填不变");
});

// —————————————————————— 5. 工具层 plumbing（透传；不做业务） ——————————————————————

test("dispatch_task handler：T3 字段原样透传；旧载荷逐字不变；非法枚举/坏 stage fail-closed 且不调用注入 fn", async () => {
  const calls: DispatchTaskPayload[] = [];
  const fn: DispatchTaskFn = (payload) => { calls.push(payload); return { ok: true }; };
  const dispatch = buildGovernedTools(allow, { dispatchTask: fn }).find(tool => tool.name === DISPATCH_TASK_TOOL_NAME);
  assert.ok(dispatch, "注入 dispatchTask 后应注册 dispatch_task");

  const fixedArgs = {
    roleId: "convener", task: "推进 A5", taskKind: "stage-request", workflowAction: "advance" as const,
    workflowPath: "A" as const, workflowId: WF, stage: "A5" as const, reworkOf: "A4" as const,
  };
  const fixed = await dispatch!.handler({ name: DISPATCH_TASK_TOOL_NAME, args: fixedArgs });
  assert.equal(fixed.ok, true, fixed.message);
  assert.deepEqual(calls[0], fixedArgs, "新字段必须原样进入 DispatchTaskPayload");

  calls.length = 0;
  const old = await dispatch!.handler({ name: DISPATCH_TASK_TOOL_NAME, args: { roleId: "product", task: "写意图" } });
  assert.equal(old.ok, true);
  assert.deepEqual(calls[0], { roleId: "product", task: "写意图" }, "旧调用载荷不得被追加新键");

  for (const bad of [{ workflowAction: "pause" }, { workflowPath: "C" }, { stage: "A14" }, { reworkOf: "A0" }, { taskKind: "  " }, { workflowId: "" }]) {
    calls.length = 0;
    const result = await dispatch!.handler({ name: DISPATCH_TASK_TOOL_NAME, args: { roleId: "convener", task: "x", ...bad } });
    assert.equal(result.ok, false, `非法参数应拒绝：${JSON.stringify(bad)}`);
    assert.equal(calls.length, 0, `非法参数不得调用注入 fn：${JSON.stringify(bad)}`);
  }
});

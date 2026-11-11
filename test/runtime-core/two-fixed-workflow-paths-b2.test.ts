// 运行时核心 T3 B2 契约测试：fixed `close_created_task`/`activate_role_documents` v2 的
// schema/handler 模式分支、`WorkflowDocumentRef.version`（MF-IR-5）、dispatch_task 收口复核与
// merge-main 非判断卡/工具面复核。
// 依据：B1 AC-05/AC-18/AC-24；G-IR MF-IR-2/3/5/8 与 §六（`requestReleaseMerge` 拒绝新增）；
// 实现级方案 v1.3 §3.5/§4.2 A3/A8/§7.1/§8.4。只验证工具层/类型层契约与 fake 依赖调用面：
// 不触真实账本/trunk、不启动模型/Electron；服务层真实校验属编排 B1/B2（其套件覆盖）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOVERNANCE_CARD_GROUP,
  GOVERNANCE_CARD_KINDS,
  WORKFLOW_STAGES,
  governanceCardGroup,
  type ActivateRoleDocumentsFn,
  type CloseCreatedTaskFn,
  type DispatchTaskPayload,
  type FixedActivateRoleDocumentsFn,
  type FixedCloseCreatedTaskFn,
  type GovernedToolsOptions,
  type RequestCreatedEvent,
  type WorkflowDocumentRef,
} from "../../src/model/runtime.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import {
  ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME,
  CLOSE_CREATED_TASK_TOOL_NAME,
  DISPATCH_TASK_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const WF = "wf-0123456789abcdef01234567";
const D = "a".repeat(64);
const D2 = "b".repeat(64);

function toolsFor(options: GovernedToolsOptions = {}) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}
const run = (options: GovernedToolsOptions, name: string, args: Record<string, unknown>, signal?: AbortSignal) =>
  toolsFor(options).get(name)!.handler({ name, args, signal });

// fixed v2 形状（模型可见字段；身份由注入端绑定，绝不出现在 args）
const fixedCloseArgs = { operationId: "op-close-1", taskId: "task-1", outcome: "accepted" as const };
const fixedCloseReceipt = {
  ok: true as const, taskId: "task-1", outcome: "accepted" as const, workflowId: WF, stage: "A2" as const,
  eventId: "event-close-1", operationId: "op-close-1", replay: false, stageCompleted: true,
};
const legacyCloseArgs = {
  operationId: "op-close-1", taskId: "task-1", runId: "run-1", basisDigest: D,
  reportRef: { snapshotId: "snapshot-1", path: "docs/report.md", sha256: D }, outcome: "accepted" as const,
};
const legacyCloseReceipt = {
  ok: true as const, status: "applied" as const, operationId: "op-close-1", baseDigest: D, targetDigest: D2,
  taskId: "task-1", eventId: "legacy-event-1", taskStatus: "closed",
};
const fixedActivateArgs = {
  operationId: "op-act-1", flowId: "snake", workflowId: WF, proposalDecisionId: "decision-6", targetRoleId: "worker",
  roster: { path: "docs/proposals/snake-roster-v1.md", sha256: D },
  documents: {
    card: { path: "角色卡/worker/role-card.md", sha256: D },
    boundaryMd: { path: "角色卡/worker/boundary.md", sha256: D },
    boundaryYaml: { path: "角色卡/worker/boundary.yaml", sha256: D },
  },
};
const fixedActivateReceipt = {
  ok: true as const, workflowId: WF, roleId: "worker", rosterSha256: D,
  activationKey: `role-activation:${WF}:worker:${D}`, replay: false, stageCompleted: false,
};
const legacyActivateArgs = {
  operationId: "op-act-1", flowId: "snake",
  planRef: { snapshotId: "snapshot-plan", path: "docs/team-plan.md", sha256: D },
  d3DecisionId: "decision-3", rosterRef: { snapshotId: "snapshot-roster", path: "docs/roster.md", sha256: D },
  targetRoleId: "worker", documents: fixedActivateArgs.documents,
};
const legacyActivateReceipt = {
  ok: true as const, status: "applied" as const, operationId: "op-act-1", baseDigest: D, targetDigest: D2,
  activationDigest: D2,
};

// —————————————————————— 1. fixed close_created_task v2（MF-IR-2 / AC-18） ——————————————————————

test("fixed close：3+1 输入放行并原样调用 fixed 回调；legacy 字段不采信、legacy 实现（trunk/CAS 路径）不触达；signal 透传", async () => {
  const calls: { input: unknown; signal?: AbortSignal }[] = [];
  let legacyCalls = 0;
  const fixed: FixedCloseCreatedTaskFn = async (input, signal) => { calls.push({ input, signal }); return fixedCloseReceipt; };
  const legacy: CloseCreatedTaskFn = async () => { legacyCalls++; return legacyCloseReceipt; };
  const controller = new AbortController();
  const result = await run(
    { roleId: "chief", closeCreatedTask: legacy, closeCreatedTaskFixed: fixed },
    CLOSE_CREATED_TASK_TOOL_NAME,
    {
      ...fixedCloseArgs, note: "收口说明",
      // fixed 模式夹带 legacy 字段：仅 schema 允许，handler 不透传（不触 trunk/CAS）
      runId: "run-legacy", basisDigest: D, reportRef: { snapshotId: "s", path: "docs/r.md", sha256: D },
    },
    controller.signal,
  );
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(calls, [{ input: { ...fixedCloseArgs, note: "收口说明" }, signal: controller.signal }], "fixed 回调只收到 v2 四字段（含 note）");
  assert.equal(legacyCalls, 0, "两者同时注入时 fixed 优先（纵深防御）；legacy 实现不触达");
  assert.deepEqual(JSON.parse(result.message.slice(CLOSE_CREATED_TASK_TOOL_NAME.length + 2)), fixedCloseReceipt, "fixed 回执如实直出");

  // 仅 fixed 注入也注册工具（fixed 会话的注入形态）
  assert.equal(toolsFor({ roleId: "chief", closeCreatedTaskFixed: fixed }).has(CLOSE_CREATED_TASK_TOOL_NAME), true);
  assert.equal(toolsFor({ roleId: "convener", closeCreatedTaskFixed: fixed }).has(CLOSE_CREATED_TASK_TOOL_NAME), true);
  // 未注入任何实现 ⇒ 工具不存在（注入才注册，fail-closed）
  assert.equal(toolsFor({ roleId: "chief" }).has(CLOSE_CREATED_TASK_TOOL_NAME), false);
});

test("fixed close：缺 operationId/taskId/outcome、坏 outcome 或未知键 ⇒ invalid-arguments 且不调用回调", async () => {
  let calls = 0;
  const fixed: FixedCloseCreatedTaskFn = async () => { calls++; return fixedCloseReceipt; };
  for (const missing of ["operationId", "taskId", "outcome"]) {
    const args: Record<string, unknown> = { ...fixedCloseArgs };
    delete args[missing];
    const result = await run({ roleId: "chief", closeCreatedTaskFixed: fixed }, CLOSE_CREATED_TASK_TOOL_NAME, args);
    assert.equal(result.ok, false, missing);
    assert.match(result.message, new RegExp(`invalid-arguments args\\.${missing}: required`), missing);
  }
  for (const bad of [{ ...fixedCloseArgs, outcome: "cancelled" }, { ...fixedCloseArgs, note: "" }, { ...fixedCloseArgs, actorRoleId: "chief" }]) {
    const result = await run({ roleId: "chief", closeCreatedTaskFixed: fixed }, CLOSE_CREATED_TASK_TOOL_NAME, bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.match(result.message, /invalid-arguments/);
  }
  assert.equal(calls, 0);
});

test("legacy close：runId/basisDigest/reportRef 仍必填（错误语义逐字保留）；成功回执走原 legacy 路径", async () => {
  let calls = 0;
  const legacy: CloseCreatedTaskFn = async () => { calls++; return legacyCloseReceipt; };
  const options: GovernedToolsOptions = { roleId: "chief", closeCreatedTask: legacy };
  const ok = await run(options, CLOSE_CREATED_TASK_TOOL_NAME, structuredClone(legacyCloseArgs));
  assert.equal(ok.ok, true, ok.message);
  assert.deepEqual(JSON.parse(ok.message.slice(CLOSE_CREATED_TASK_TOOL_NAME.length + 2)), legacyCloseReceipt, "legacy 回执逐字直出");
  for (const missing of ["runId", "basisDigest", "reportRef"]) {
    const args: Record<string, unknown> = structuredClone(legacyCloseArgs);
    delete args[missing];
    const result = await run(options, CLOSE_CREATED_TASK_TOOL_NAME, args);
    assert.equal(result.ok, false, missing);
    assert.match(result.message, new RegExp(`invalid-arguments args\\.${missing}: required`), missing);
  }
  assert.equal(calls, 1, "非法输入不得调用 legacy 实现");
});

test("fixed close 回执独立校验：legacy DirectActionReceipt/taskStatus 形状不适用；身份不匹配/坏形状 ⇒ 结果未知；业务失败如实直出", async () => {
  const succeed = (receipt: unknown): FixedCloseCreatedTaskFn => async () => receipt as never;
  // 身份不匹配（taskId/operationId/outcome）或坏 eventId/布尔位 ⇒ 结果未知（不假设成功）
  for (const receipt of [
    { ...fixedCloseReceipt, taskId: "task-other" },
    { ...fixedCloseReceipt, operationId: "op-other" },
    { ...fixedCloseReceipt, outcome: "rework" },
    { ...fixedCloseReceipt, eventId: "" },
    { ...fixedCloseReceipt, replay: "no" },
    { ...fixedCloseReceipt, stage: "A14" },
    { ...fixedCloseReceipt, workflowId: "" },
    { ok: true, taskId: "task-1" },
    null, "ok", [],
  ]) {
    const result = await run({ roleId: "chief", closeCreatedTaskFixed: succeed(receipt) }, CLOSE_CREATED_TASK_TOOL_NAME, fixedCloseArgs);
    assert.equal(result.ok, false, JSON.stringify(receipt));
    assert.match(result.message, /结果未知/, JSON.stringify(receipt));
  }
  // 业务失败（ok:false code/message/missing）如实直出，不当作未知
  const failure = { ok: false, code: "close-report-missing", message: "accepted 收口要求已有 task.reported(status=done)。", missing: ["report"] };
  const failed = await run({ roleId: "chief", closeCreatedTaskFixed: succeed(failure) }, CLOSE_CREATED_TASK_TOOL_NAME, fixedCloseArgs);
  assert.equal(failed.ok, false);
  assert.match(failed.message, /close-report-missing/);
  assert.doesNotMatch(failed.message, /结果未知/);
  // 坏失败形状（缺 code/message、坏 missing）⇒ 结果未知
  for (const receipt of [{ ok: false, message: "x" }, { ok: false, code: "", message: "x" }, { ok: false, code: "c", message: "m", missing: [1] }]) {
    const result = await run({ roleId: "chief", closeCreatedTaskFixed: succeed(receipt) }, CLOSE_CREATED_TASK_TOOL_NAME, fixedCloseArgs);
    assert.equal(result.ok, false);
    assert.match(result.message, /结果未知/);
  }
});

test("fixed close：已中止 signal ⇒ 不调用 fixed 回调并如实回执", async () => {
  let calls = 0;
  const fixed: FixedCloseCreatedTaskFn = async () => { calls++; return fixedCloseReceipt; };
  const controller = new AbortController();
  controller.abort();
  const result = await run({ roleId: "chief", closeCreatedTaskFixed: fixed }, CLOSE_CREATED_TASK_TOOL_NAME, fixedCloseArgs, controller.signal);
  assert.equal(result.ok, false);
  assert.match(result.message, /已中止/);
  assert.match(result.message, /未执行/);
  assert.equal(calls, 0);
});

// —————————————————————— 2. fixed activate_role_documents v2（MF-IR-3 / AC-24） ——————————————————————

test("fixed activate：v2 输入放行并原样调用 fixed 回调（roster/documents 不重写）；legacy 字段不采信、legacy 实现不触达；signal 透传", async () => {
  const calls: { input: unknown; signal?: AbortSignal }[] = [];
  let legacyCalls = 0;
  const fixed: FixedActivateRoleDocumentsFn = async (input, signal) => { calls.push({ input, signal }); return fixedActivateReceipt; };
  const legacy: ActivateRoleDocumentsFn = async () => { legacyCalls++; return legacyActivateReceipt; };
  const controller = new AbortController();
  const result = await run(
    { roleId: "nominator", activateRoleDocuments: legacy, activateRoleDocumentsFixed: fixed },
    ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME,
    {
      ...structuredClone(fixedActivateArgs),
      // fixed 模式夹带 legacy 字段：仅 schema 允许，handler 不透传（不写 trunk、不发 appointment-write）
      planRef: { snapshotId: "s", path: "docs/p.md", sha256: D }, d3DecisionId: "decision-legacy",
      rosterRef: { snapshotId: "s2", path: "docs/r.md", sha256: D },
    },
    controller.signal,
  );
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(calls, [{ input: fixedActivateArgs, signal: controller.signal }], "fixed 回调只收到 v2 七字段（legacy 字段被丢弃）");
  assert.equal(legacyCalls, 0, "fixed 优先；legacy 激活（trunk/appointment-write 路径）不触达");
  assert.deepEqual(JSON.parse(result.message.slice(ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME.length + 2)), fixedActivateReceipt);

  // 仅 fixed 注入也注册工具（fixed 会话的注入形态）
  assert.equal(toolsFor({ roleId: "nominator", activateRoleDocumentsFixed: fixed }).has(ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME), true);
  assert.equal(toolsFor({ roleId: "nominator" }).has(ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME), false);
});

test("fixed activate：缺 workflowId/proposalDecisionId/roster 或 documents 子项坏 ⇒ invalid-arguments 且不调用回调", async () => {
  let calls = 0;
  const fixed: FixedActivateRoleDocumentsFn = async () => { calls++; return fixedActivateReceipt; };
  const options: GovernedToolsOptions = { roleId: "nominator", activateRoleDocumentsFixed: fixed };
  for (const missing of ["operationId", "flowId", "workflowId", "proposalDecisionId", "targetRoleId", "roster", "documents"]) {
    const args = structuredClone(fixedActivateArgs) as Record<string, unknown>;
    delete args[missing];
    const result = await run(options, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, args);
    assert.equal(result.ok, false, missing);
    assert.match(result.message, new RegExp(`invalid-arguments args\\.${missing}: required`), missing);
  }
  for (const bad of [
    { ...fixedActivateArgs, roster: { path: "docs/roster.md", sha256: "not-hex" } },
    { ...fixedActivateArgs, roster: { path: "../escape.md", sha256: D } },
    { ...fixedActivateArgs, documents: { card: fixedActivateArgs.documents.card, boundaryMd: fixedActivateArgs.documents.boundaryMd } },
    { ...fixedActivateArgs, documents: { ...fixedActivateArgs.documents, boundaryYaml: { path: "角色卡/worker/boundary.yaml", sha256: "0".repeat(63) } } },
    { ...fixedActivateArgs, futureField: true }, // 未知键（共享 schema 未声明）仍拒绝
  ]) {
    const result = await run(options, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.match(result.message, /invalid-arguments/, JSON.stringify(bad));
  }
  assert.equal(calls, 0);
});

test("legacy activate：planRef/d3DecisionId/rosterRef 仍必填（错误语义逐字保留）；成功仍要求 legacy activationDigest", async () => {
  let calls = 0;
  const legacy: ActivateRoleDocumentsFn = async () => { calls++; return legacyActivateReceipt; };
  const options: GovernedToolsOptions = { roleId: "nominator", activateRoleDocuments: legacy };
  const ok = await run(options, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, structuredClone(legacyActivateArgs));
  assert.equal(ok.ok, true, ok.message);
  assert.deepEqual(JSON.parse(ok.message.slice(ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME.length + 2)), legacyActivateReceipt);
  for (const missing of ["planRef", "d3DecisionId", "rosterRef"]) {
    const args = structuredClone(legacyActivateArgs) as Record<string, unknown>;
    delete args[missing];
    const result = await run(options, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, args);
    assert.equal(result.ok, false, missing);
    assert.match(result.message, new RegExp(`invalid-arguments args\\.${missing}: required`), missing);
  }
  // legacy 回执无 activationDigest ⇒ 结果未知（旧校验逐字保留；fixed 分支不套用此规则见上一组）
  const noDigest = await run({ roleId: "nominator", activateRoleDocuments: async () => ({ ...legacyActivateReceipt, activationDigest: undefined }) as never },
    ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, structuredClone(legacyActivateArgs));
  assert.equal(noDigest.ok, false);
  assert.match(noDigest.message, /结果未知/);
  assert.equal(calls, 1);
});

test("fixed activate 回执独立校验：workflow/role 不匹配或坏形状 ⇒ 结果未知；B17 rosterSha256 由应用计算（不再与模型入参比较）；业务失败如实直出", async () => {
  const succeed = (receipt: unknown): FixedActivateRoleDocumentsFn => async () => receipt as never;
  for (const receipt of [
    { ...fixedActivateReceipt, workflowId: "wf-other" },
    { ...fixedActivateReceipt, roleId: "worker-other" },
    { ...fixedActivateReceipt, activationKey: "" },
    { ...fixedActivateReceipt, stageCompleted: "yes" },
    { ...fixedActivateReceipt, rosterSha256: "not-hex" },
    null, "ok",
  ]) {
    const result = await run({ roleId: "nominator", activateRoleDocumentsFixed: succeed(receipt) }, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, structuredClone(fixedActivateArgs));
    assert.equal(result.ok, false, JSON.stringify(receipt));
    assert.match(result.message, /结果未知/, JSON.stringify(receipt));
  }
  // B17：应用计算的 rosterSha256 与模型入参不同 ⇒ 仍接受（模型 hash 不采信）。
  const appComputed = await run(
    { roleId: "nominator", activateRoleDocumentsFixed: succeed({ ...fixedActivateReceipt, rosterSha256: D2 }) },
    ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME,
    structuredClone(fixedActivateArgs),
  );
  assert.equal(appComputed.ok, true, appComputed.message);
  const failure = { ok: false, code: "activation-hash-drift", message: "三文档实际字节 SHA-256 与声明不一致。", missing: ["documents.card"] };
  const failed = await run({ roleId: "nominator", activateRoleDocumentsFixed: succeed(failure) }, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, structuredClone(fixedActivateArgs));
  assert.equal(failed.ok, false);
  assert.match(failed.message, /activation-hash-drift/);
  assert.doesNotMatch(failed.message, /结果未知/);
});

test("B17 fixed activate：path-only（roster/documents 省略 sha256）放行并原样调用 fixed 回调；legacy 仍要求 sha256", async () => {
  const calls: unknown[] = [];
  const fixed: FixedActivateRoleDocumentsFn = async (input) => { calls.push(input); return fixedActivateReceipt; };
  const pathOnly = {
    operationId: "op-act-1", flowId: "snake", workflowId: WF, proposalDecisionId: "decision-6", targetRoleId: "worker",
    roster: { path: "docs/proposals/snake-roster-v1.md" },
    documents: {
      card: { path: "角色卡/worker/role-card.md" },
      boundaryMd: { path: "角色卡/worker/boundary.md" },
      boundaryYaml: { path: "角色卡/worker/boundary.yaml" },
    },
  };
  const ok = await run({ roleId: "nominator", activateRoleDocumentsFixed: fixed }, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, pathOnly);
  assert.equal(ok.ok, true, ok.message);
  assert.deepEqual(calls, [pathOnly], "fixed 回调原样收到 path-only 输入（hash 由应用在激活前回填）");
  // legacy 模式共享 schema 仍要求嵌套 sha256（逐字保留）。
  const legacyPathOnly = {
    ...structuredClone(legacyActivateArgs),
    documents: {
      card: { path: "角色卡/worker/role-card.md" },
      boundaryMd: structuredClone(legacyActivateArgs.documents.boundaryMd),
      boundaryYaml: structuredClone(legacyActivateArgs.documents.boundaryYaml),
    },
  };
  const legacy = await run({ roleId: "nominator", activateRoleDocuments: async () => legacyActivateReceipt }, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, legacyPathOnly);
  assert.equal(legacy.ok, false);
  assert.match(legacy.message, /invalid-arguments args\.documents\.card\.sha256: required/u);
});

test("B17 fixed activate MCP inputSchema：roster/documents 的 sha256 不 required；legacy documents 仍 required", () => {
  type ActivateSchema = {
    properties: {
      roster?: { required?: string[] };
      documents: { properties: Record<string, { required?: string[] }> };
    };
  };
  const fixed = buildGovernedTools(allow, {
    roleId: "nominator",
    activateRoleDocumentsFixed: async () => ({ ok: false, code: "fixture", message: "fixture" }),
  });
  const fixedTool = fixed.find((tool) => tool.name === ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME);
  assert.ok(fixedTool !== undefined);
  const fixedSchema = fixedTool!.inputSchema as unknown as ActivateSchema;
  assert.equal((fixedSchema.properties.roster?.required ?? []).includes("sha256"), false, "fixed roster sha256 可省略");
  for (const key of ["card", "boundaryMd", "boundaryYaml"]) {
    assert.equal((fixedSchema.properties.documents.properties[key]?.required ?? []).includes("sha256"), false, `fixed ${key}.sha256 可省略`);
  }
  const legacy = buildGovernedTools(allow, {
    roleId: "nominator",
    activateRoleDocuments: async () => ({ ok: false, status: "blocked", message: "fixture" } as never),
  });
  const legacyTool = legacy.find((tool) => tool.name === ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME);
  assert.ok(legacyTool !== undefined);
  const legacySchema = legacyTool!.inputSchema as unknown as ActivateSchema;
  for (const key of ["card", "boundaryMd", "boundaryYaml"]) {
    assert.equal((legacySchema.properties.documents.properties[key]?.required ?? []).includes("sha256"), true, `legacy ${key}.sha256 仍必填`);
  }
});

// —————————————————————— 3. WorkflowDocumentRef.version（MF-IR-5） ——————————————————————

test("WorkflowDocumentRef：version 可选；旧形状 {path,sha256[,kind]} 仍合法；A3 documentRefs 可携带 version", () => {
  const oldRef: WorkflowDocumentRef = { path: "docs/product/snake-intent-v1.md", sha256: D };
  const versioned: WorkflowDocumentRef = { path: "docs/product/snake-intent-v1.md", sha256: D, kind: "intent", version: 2 };
  assert.equal("version" in oldRef, false, "旧引用不得被强制携带 version");
  assert.equal(versioned.version, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(versioned)), versioned, "version 原样保留（纯数据）");
  const created: Pick<RequestCreatedEvent, "documentRefs"> = { documentRefs: [versioned, oldRef] };
  assert.equal(created.documentRefs?.[0]?.version, 2);
  assert.equal(created.documentRefs?.[1]?.version, undefined);
  // @ts-expect-error version 必须是 number（字符串拒绝）
  const bad: WorkflowDocumentRef = { path: "docs/x.md", sha256: D, version: "2" };
  assert.equal(bad.version, "2");
});

// —————————————————————— 4. dispatch_task / contract_check B2 复核（AC-05） ——————————————————————

test("dispatch_task：required 仍 ['roleId','task']、旧属性逐字保留、stage-request 枚举收口；contract_check.taskKind 同步", async () => {
  const tool = describeTool(DISPATCH_TASK_TOOL_NAME);
  assert.deepEqual(tool.parameters.required, ["roleId", "task"]);
  assert.equal(tool.parameters.additionalProperties, true);
  const props = tool.parameters.properties as Record<string, Record<string, unknown>>;
  for (const key of ["resumeController", "reviewTarget", "roleId", "task", "reason", "sideEffect", "expectedOutput",
    "requestedEvidence", "idempotencyKey", "flowId", "stepId", "moduleId", "modulePaths"]) {
    assert.ok(props[key], `旧属性 ${key} 必须保留`);
  }
  assert.deepEqual(props["taskKind"]!.enum, ["stage-request"], "taskKind 只收口 stage-request（普通任务缺省）");
  assert.deepEqual(props["workflowAction"]!.enum, ["advance", "stop"]);
  assert.deepEqual(props["workflowPath"]!.enum, ["A", "B"]);
  assert.deepEqual(props["stage"]!.enum, [...WORKFLOW_STAGES]);
  assert.deepEqual(props["reworkOf"]!.enum, [...WORKFLOW_STAGES]);
  const text = [tool.description ?? "", ...(tool.promptGuidelines ?? [])].join("\n");
  assert.equal(text.includes("two-fixed-paths"), false, "文案模式中立");
  assert.match(text, /stage-request/);

  const cc = describeTool("contract_check");
  const ccProps = cc.parameters.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(ccProps["taskKind"]!.enum, ["dispatch", "appointment", "write", "acceptance", "shell", "stage-request"]);

  // handler：stage-request 载荷原样透传；缺 roleId/task 或坏枚举不调用注入 fn
  const calls: DispatchTaskPayload[] = [];
  const args = { roleId: "convener", task: "推进 A5", taskKind: "stage-request", workflowAction: "advance", workflowPath: "A", workflowId: WF, stage: "A5" };
  const result = await run({ roleId: "chief", dispatchTask: (payload) => { calls.push(payload); return { ok: true }; } }, DISPATCH_TASK_TOOL_NAME, args);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(calls[0], args);
  for (const bad of [{ task: "x" }, { roleId: "convener" }, { ...args, stage: "A14" }, { ...args, workflowAction: "pause" }]) {
    const rejected = await run({ roleId: "chief", dispatchTask: (payload) => { calls.push(payload); return { ok: true }; } }, DISPATCH_TASK_TOOL_NAME, bad);
    assert.equal(rejected.ok, false, JSON.stringify(bad));
  }
  assert.equal(calls.length, 1);
});

// —————————————————————— 5. merge-main 非判断卡 / requestReleaseMerge / fixed 工具面（MF-IR-8） ——————————————————————

test("merge-main：非判断分组（planJudge 排除依据）、不进 GOVERNANCE_CARD_GROUP；既有分组键值逐字不变", () => {
  assert.equal(GOVERNANCE_CARD_KINDS.includes("merge-main"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, "merge-main"), false);
  // app/desktop `planJudge` 仅按 `governanceCardGroup(cardKind)` 取组；undefined ⇒ 永不进入判断器（不可代批）。
  assert.equal(governanceCardGroup("merge-main"), undefined);
  assert.deepEqual(Object.keys(GOVERNANCE_CARD_GROUP).sort(), [
    "acceptance", "appointment", "appointment-write", "decision", "download", "intent-confirm", "proposal",
  ]);
});

test("requestReleaseMerge 零出现（本角色写集）；注入面复核：只有注入 fixed 依赖时不注册 legacy Git/VCA/stable 工具", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sources = [
    join(here, "../../src/model/runtime.ts"),
    join(here, "../../src/provider/runtime/schema.ts"),
    join(here, "../../src/provider/runtime/tools.ts"),
  ].map((path) => readFileSync(path, "utf8"));
  for (const source of sources) assert.doesNotMatch(source, /requestReleaseMerge|request_release_merge/, "G-IR §六拒绝新增");

  const fixedOnly = toolsFor({
    roleId: "chief",
    closeCreatedTaskFixed: async () => fixedCloseReceipt,
  });
  for (const legacyTool of ["git_query", "git_candidate", "git_publish", "select_run_change", "request_stable_write",
    "submit_refactor", "submit_version_change", "request_version_decision"]) {
    assert.equal(fixedOnly.has(legacyTool), false, `${legacyTool} 不得因 fixed 依赖出现（legacy 工具按注入面缺席）`);
  }
  assert.equal(fixedOnly.has(CLOSE_CREATED_TASK_TOOL_NAME), true);
});

// C1d：Batch 3.5 提交能力工具（submit_version_change / submit_refactor / request_stable_write）。
// 只验证工具层契约：注入才注册、角色门控、形状校验、结构化回执、只提交不批准、恰好一次调用。
import test from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools, REQUEST_STABLE_WRITE_TOOL_NAME, SUBMIT_REFACTOR_TOOL_NAME, SUBMIT_VERSION_CHANGE_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import type {
  GovernedToolsOptions,
  RequestStableWriteFn,
  RequestStableWriteInput,
  SubmitRefactorFn,
  SubmitRefactorInput,
  SubmitVersionChangeFn,
  SubmitVersionChangeInput,
} from "../../src/model/runtime.ts";
import {
  STABLE_WRITE_CONTENT_MAX_CHARS,
  VCA_SUBMISSION_TARGETS_MAX,
} from "../../src/model/runtime.ts";
import { allow } from "./fixtures.ts";
import { buildChiefDecisionTools, createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { role } from "./fixtures.ts";
import type { ChiefDecisionExecutionContext, RuntimeProviderOptions } from "../../src/model/runtime.ts";

const TOOL_NAMES = [SUBMIT_VERSION_CHANGE_TOOL_NAME, SUBMIT_REFACTOR_TOOL_NAME, REQUEST_STABLE_WRITE_TOOL_NAME] as const;

function toolsFor(options: GovernedToolsOptions = {}) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

const run = (options: GovernedToolsOptions, name: string, args: Record<string, unknown>, signal?: AbortSignal) =>
  toolsFor(options).get(name)!.handler({ name, args, signal });

const VCA_TARGETS = [{ kind: "contract", path: "docs/contracts/sample-v2.md", action: "add" }];

test("C1d/未注入能力：三提交工具不存在（能力缺席 = 最强 fail-closed）", () => {
  const names = [...toolsFor({ roleId: "product" }).keys()];
  for (const name of TOOL_NAMES) {
    assert.equal(names.includes(name), false, `${name} 不得在未注入能力时注册`);
  }
});

test("C1d/submit_version_change：product 提交 version-upgrade 成功，能力恰好调用一次且身份由工具填入", async () => {
  const calls: SubmitVersionChangeInput[] = [];
  const fn: SubmitVersionChangeFn = async (input) => {
    calls.push(input);
    return { ok: true, applicationId: "vc-7", status: "submitted", message: "已提交" };
  };
  const result = await run({ roleId: "product", submitVersionChange: fn }, SUBMIT_VERSION_CHANGE_TOOL_NAME, {
    kind: "version-upgrade",
    flowId: "flow-upgrade",
    summary: "升级契约版本",
    targets: VCA_TARGETS,
  });
  assert.equal(result.ok, true, result.message);
  assert.match(result.message, /applicationId=vc-7/);
  assert.match(result.message, /status=submitted/);
  assert.match(result.message, /申请≠批准/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: "flow-upgrade",
    summary: "升级契约版本",
    targets: VCA_TARGETS,
  });
});

test("C1d/submit_version_change：rapporteur 提交 detail-amendment 成功并透传 amendment 字段", async () => {
  const calls: SubmitVersionChangeInput[] = [];
  const fn: SubmitVersionChangeFn = async (input) => {
    calls.push(input);
    return { ok: true, applicationId: "vc-8", status: "submitted" };
  };
  const result = await run({ roleId: "rapporteur", submitVersionChange: fn }, SUBMIT_VERSION_CHANGE_TOOL_NAME, {
    kind: "detail-amendment",
    flowId: "flow-detail",
    summary: "修正执行细节",
    targets: [{ kind: "execution", path: "docs/flows/flow-detail.md", action: "modify", from: "docs/flows/flow-detail-v1.md" }],
    amendmentId: "am-3",
    amendmentDocPath: "docs/proposals/flow-detail-amendment-v1.md",
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.initiatorRoleId, "rapporteur");
  assert.equal(calls[0]!.amendmentId, "am-3");
  assert.equal(calls[0]!.amendmentDocPath, "docs/proposals/flow-detail-amendment-v1.md");
  assert.deepEqual(calls[0]!.targets, [{ kind: "execution", path: "docs/flows/flow-detail.md", action: "modify", from: "docs/flows/flow-detail-v1.md" }]);
});

test("C1d/submit_version_change：角色不符/身份缺失 ⇒ 拒绝 vca-role-not-allowed，能力不被调用", async () => {
  const scenarios: Array<{ roleId: string | undefined; kind: string; detail: string }> = [
    { roleId: "rapporteur", kind: "version-upgrade", detail: "version-upgrade 仅 product" },
    { roleId: "product", kind: "detail-amendment", detail: "detail-amendment 仅 rapporteur" },
    { roleId: "convener", kind: "version-upgrade", detail: "其他治理角色拒绝" },
    { roleId: undefined, kind: "version-upgrade", detail: "身份未注入即拒绝" },
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const fn: SubmitVersionChangeFn = async () => {
      calls += 1;
      return { ok: true, applicationId: "vc-1", status: "submitted" };
    };
    const options: GovernedToolsOptions = { ...(scenario.roleId !== undefined ? { roleId: scenario.roleId } : {}), submitVersionChange: fn };
    const result = await run(options, SUBMIT_VERSION_CHANGE_TOOL_NAME, {
      kind: scenario.kind,
      flowId: "flow-role",
      summary: "role gate",
      targets: VCA_TARGETS,
    });
    assert.equal(result.ok, false, scenario.detail);
    assert.match(result.message, /vca-role-not-allowed/, scenario.detail);
    assert.equal(calls, 0, scenario.detail);
  }
});

test("C1d/submit_version_change：形状非法 ⇒ vca-invalid 且能力不被调用", async () => {
  let calls = 0;
  const fn: SubmitVersionChangeFn = async () => {
    calls += 1;
    return { ok: true, applicationId: "vc-1", status: "submitted" };
  };
  const base = { kind: "version-upgrade", flowId: "flow-shape", summary: "shape", targets: VCA_TARGETS };
  const badArgs: Array<Record<string, unknown>> = [
    { ...base, targets: undefined },
    { ...base, targets: [] },
    { ...base, targets: [{ kind: "contract", path: "docs/contracts/x-v2.md", action: "delete" }] },
    { ...base, targets: [{ kind: "contract", path: "docs/contracts/x-v2.md", action: "add", extra: true }] },
    { ...base, targets: new Array(VCA_SUBMISSION_TARGETS_MAX + 1).fill(VCA_TARGETS[0]) },
    { ...base, amendmentId: "not-an-amendment" },
    { ...base, unexpected: true },
    { ...base, summary: "" },
  ];
  for (const args of badArgs) {
    const result = await run({ roleId: "product", submitVersionChange: fn }, SUBMIT_VERSION_CHANGE_TOOL_NAME, args);
    assert.equal(result.ok, false, JSON.stringify(args).slice(0, 120));
    assert.match(result.message, /vca-invalid/, JSON.stringify(args).slice(0, 120));
  }
  assert.equal(calls, 0);
});

test("C1d/submit_version_change：能力失败/越权回执 ⇒ 如实未提交，绝不伪装成功或批准", async () => {
  const outcomes: unknown[] = [
    { ok: false, errorCode: "vca-pending", status: "submitted", message: "该 flow 已有在途申请" },
    { ok: true, applicationId: "vc-9", status: "approved" },
    { ok: true, applicationId: "not-a-vca-id", status: "submitted" },
    { ok: true, status: "submitted" },
    { ok: false, errorCode: "vca-not-a-code", message: "bad code" },
    { ok: "yes", applicationId: "vc-9", status: "submitted" },
  ];
  for (const outcome of outcomes) {
    let calls = 0;
    const fn: SubmitVersionChangeFn = async () => {
      calls += 1;
      return outcome as Awaited<ReturnType<SubmitVersionChangeFn>>;
    };
    const result = await run({ roleId: "product", submitVersionChange: fn }, SUBMIT_VERSION_CHANGE_TOOL_NAME, {
      kind: "version-upgrade",
      flowId: "flow-receipt",
      summary: "receipt",
      targets: VCA_TARGETS,
    });
    assert.equal(result.ok, false, JSON.stringify(outcome));
    assert.equal(calls, 1);
  }
});

test("C1d/submit_refactor：convener 提交成功；输入身份恒为 convener", async () => {
  const calls: SubmitRefactorInput[] = [];
  const fn: SubmitRefactorFn = async (input) => {
    calls.push(input);
    return { ok: true, requestId: "rf-4", status: "requested" };
  };
  const scope = { modules: ["src/provider"], paths: ["src/provider/runtime/tools.ts"], roles: ["core"] };
  const result = await run({ roleId: "convener", submitRefactor: fn }, SUBMIT_REFACTOR_TOOL_NAME, {
    flowId: "flow-refactor",
    title: "整理工具辅助函数",
    reason: "降低重复代码",
    scope,
  });
  assert.equal(result.ok, true, result.message);
  assert.match(result.message, /requestId=rf-4/);
  assert.match(result.message, /status=requested/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { roleId: "convener", flowId: "flow-refactor", title: "整理工具辅助函数", reason: "降低重复代码", scope });
});

test("C1d/submit_refactor：非 convener 拒绝、形状非法拒绝、不派发/不写代码", async () => {
  let calls = 0;
  const fn: SubmitRefactorFn = async () => {
    calls += 1;
    return { ok: true, requestId: "rf-1", status: "requested" };
  };
  const valid = { flowId: "flow-refactor", title: "t", reason: "r", scope: { modules: [], paths: [], roles: [] } };
  const denied = await run({ roleId: "product", submitRefactor: fn }, SUBMIT_REFACTOR_TOOL_NAME, valid);
  assert.equal(denied.ok, false);
  assert.match(denied.message, /refactor-role-not-allowed/);
  for (const args of [
    { ...valid, scope: { modules: [], paths: [] } },
    { ...valid, scope: { modules: [], paths: [], roles: [], extra: [] } },
    { ...valid, scope: { modules: [1], paths: [], roles: [] } },
    { ...valid, reason: "" },
  ]) {
    const result = await run({ roleId: "convener", submitRefactor: fn }, SUBMIT_REFACTOR_TOOL_NAME, args);
    assert.equal(result.ok, false, JSON.stringify(args));
    assert.match(result.message, /refactor-invalid/);
  }
  assert.equal(calls, 0);
});

test("C1d/submit_refactor：能力失败与越权成功回执（accepted）都按未提交处理", async () => {
  for (const outcome of [
    { ok: false, errorCode: "refactor-flow-missing", message: "flow 不存在" },
    { ok: true, requestId: "rf-2", status: "accepted" },
    { ok: true, requestId: "rf-2", status: "requested", errorCode: "refactor-invalid" },
  ] as const) {
    let calls = 0;
    const fn: SubmitRefactorFn = async () => {
      calls += 1;
      return outcome as Awaited<ReturnType<SubmitRefactorFn>>;
    };
    const result = await run({ roleId: "convener", submitRefactor: fn }, SUBMIT_REFACTOR_TOOL_NAME, {
      flowId: "flow-refactor",
      title: "t",
      reason: "r",
      scope: { modules: [], paths: [], roles: [] },
    });
    assert.equal(result.ok, false, JSON.stringify(outcome));
    assert.equal(calls, 1);
  }
});

test("C1d/request_stable_write：convener 只提交 workflow 内容；不生成许可/不写入", async () => {
  const calls: RequestStableWriteInput[] = [];
  const fn: RequestStableWriteFn = async (input) => {
    calls.push(input);
    return { ok: true, requestId: "sw-3", status: "requested" };
  };
  const content = "# workflow\n\n新流程\n";
  const result = await run({ roleId: "convener", requestStableWrite: fn }, REQUEST_STABLE_WRITE_TOOL_NAME, { content });
  assert.equal(result.ok, true, result.message);
  assert.match(result.message, /requestId=sw-3/);
  assert.match(result.message, /status=requested/);
  assert.match(result.message, /尚未生成许可/);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { roleId: "convener", kind: "workflow", content });
});

test("C1d/request_stable_write：非 convener/形状非法拒绝；越权成功回执（written）按未提交处理", async () => {
  let calls = 0;
  const fn: RequestStableWriteFn = async () => {
    calls += 1;
    return { ok: true, requestId: "sw-1", status: "requested" };
  };
  const denied = await run({ roleId: "product", requestStableWrite: fn }, REQUEST_STABLE_WRITE_TOOL_NAME, { content: "x" });
  assert.equal(denied.ok, false);
  assert.match(denied.message, /stable-write-invalid/);
  for (const args of [{ content: "" }, { content: 1 }, { content: "x", extra: true }]) {
    const result = await run({ roleId: "convener", requestStableWrite: fn }, REQUEST_STABLE_WRITE_TOOL_NAME, args as Record<string, unknown>);
    assert.equal(result.ok, false, JSON.stringify(args));
  }
  const tooLong = await run({ roleId: "convener", requestStableWrite: fn }, REQUEST_STABLE_WRITE_TOOL_NAME, {
    content: "x".repeat(STABLE_WRITE_CONTENT_MAX_CHARS + 1),
  });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /stable-write-invalid/);
  assert.equal(calls, 0);

  const overreach: RequestStableWriteFn = async () => ({ ok: true, requestId: "sw-2", status: "written" });
  const result = await run({ roleId: "convener", requestStableWrite: overreach }, REQUEST_STABLE_WRITE_TOOL_NAME, { content: "x" });
  assert.equal(result.ok, false, "工具不得把 written 回执当成功（写入只能由确认后的门禁执行）");
});

test("C1d/中止：发起轮次已中止 ⇒ 能力不被调用、如实未提交", async () => {
  let calls = 0;
  const fn: SubmitVersionChangeFn = async () => {
    calls += 1;
    return { ok: true, applicationId: "vc-1", status: "submitted" };
  };
  const controller = new AbortController();
  controller.abort();
  const result = await run({ roleId: "product", submitVersionChange: fn }, SUBMIT_VERSION_CHANGE_TOOL_NAME, {
    kind: "version-upgrade",
    flowId: "flow-abort",
    summary: "abort",
    targets: VCA_TARGETS,
  }, controller.signal);
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("C1d/schema：三工具 schema 单一来源与冻结枚举一致", () => {
  const vca = describeTool(SUBMIT_VERSION_CHANGE_TOOL_NAME);
  assert.equal(vca.parameters["additionalProperties"], false);
  assert.deepEqual(vca.parameters["required"], ["kind", "flowId", "summary", "targets"]);
  const vcaProps = vca.parameters["properties"] as Record<string, Record<string, unknown>>;
  assert.deepEqual(vcaProps["kind"]!["enum"], ["detail-amendment", "version-upgrade"]);
  const targets = vcaProps["targets"] as Record<string, unknown>;
  assert.equal(targets["maxItems"], VCA_SUBMISSION_TARGETS_MAX);
  const targetProps = (targets["items"] as Record<string, Record<string, unknown>>)["properties"] as Record<string, Record<string, unknown>>;
  assert.deepEqual(targetProps["kind"]!["enum"], ["contract", "roster", "execution"]);
  assert.deepEqual(targetProps["action"]!["enum"], ["add", "modify"]);

  const refactor = describeTool(SUBMIT_REFACTOR_TOOL_NAME);
  assert.equal(refactor.parameters["additionalProperties"], false);
  assert.deepEqual(refactor.parameters["required"], ["flowId", "title", "reason", "scope"]);

  const stable = describeTool(REQUEST_STABLE_WRITE_TOOL_NAME);
  assert.equal(stable.parameters["additionalProperties"], false);
  assert.deepEqual(stable.parameters["required"], ["content"]);
  const stableProps = stable.parameters["properties"] as Record<string, Record<string, unknown>>;
  assert.equal(stableProps["content"]!["maxLength"], STABLE_WRITE_CONTENT_MAX_CHARS);
  for (const description of [vca, refactor, stable]) {
    assert.equal(description.executionMode, "sequential");
  }
});

const directDigest = "a".repeat(64), directNext = "b".repeat(64);
const snapshotRef = { snapshotId: "snapshot-1", path: "docs/evidence.md", sha256: directDigest };
const appliedReceipt = { ok: true as const, status: "applied" as const, operationId: "op-1", baseDigest: directDigest, targetDigest: directNext };
const decisionArgs = { requestId: "req-1", baseDigest: directDigest, delegationRevision: 2, disposition: "select", selected: ["alternative"], reason: "Evidence supports the alternative" };
const decisionReceipt = { ok: true, requestId: "req-1", status: "settled", source: { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "convener",
  requestId: "req-1", baseDigest: directDigest, delegationRevision: 2, disposition: "select", selected: ["alternative"], reason: decisionArgs.reason, at: "2026-11-05T00:00:00Z" } };
const narrowCases = [
  { name: "select_run_change", key: "selectRunChange", roleId: "rapporteur", args: { operationId: "op-1", runId: "run-1", expectedPinDigest: directDigest, targetTrunk: { version: 2, digest: directNext }, mode: "continue-frozen", reason: "keep original evidence" }, receipt: appliedReceipt },
  { name: "complete_team_plan", key: "completeTeamPlan", roleId: "convener", args: { operationId: "op-1", flowId: "flow-1", baseDigest: directDigest, plan: { path: "docs/team.md", sha256: directDigest, version: 1 } }, receipt: appliedReceipt },
  { name: "activate_role_documents", key: "activateRoleDocuments", roleId: "nominator", args: { operationId: "op-1", flowId: "flow-1", planRef: snapshotRef, d3DecisionId: "real-d3", rosterRef: snapshotRef, targetRoleId: "worker", documents: {
    card: { path: "角色卡/worker/role-card.md", sha256: directDigest }, boundaryMd: { path: "角色卡/worker/boundary.md", sha256: directDigest }, boundaryYaml: { path: "角色卡/worker/boundary.yaml", sha256: directDigest } } }, receipt: { ...appliedReceipt, activationDigest: directNext } },
  { name: "close_created_task", key: "closeCreatedTask", roleId: "chief", args: { operationId: "op-1", taskId: "task-1", runId: "run-1", basisDigest: directDigest, reportRef: snapshotRef, outcome: "accepted" }, receipt: { ...appliedReceipt, taskId: "task-1", eventId: "real-event", taskStatus: "closed" } },
  { name: "decide_pending_request", key: "decidePendingRequest", roleId: "chief", args: decisionArgs, receipt: decisionReceipt },
] as const;

test("R2 five narrow tools: injection-only, strict scope identity and unchanged payload/signal", async () => {
  for (const item of narrowCases) {
    assert.equal(toolsFor().has(item.name), false);
    const calls: unknown[] = [];
    const controller = new AbortController();
    const options = { roleId: item.roleId, [item.key]: async (input: unknown, signal: unknown) => {
      calls.push({ input, signal }); return item.receipt;
    } } as GovernedToolsOptions;
    const result = await run(options, item.name, structuredClone(item.args), controller.signal);
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(calls, [{ input: item.args, signal: controller.signal }]);
    assert.deepEqual(JSON.parse(result.message.slice(item.name.length + 2)), item.receipt);
    for (const roleId of [undefined, "worker", "product"]) {
      const invalid = await run({ ...options, roleId }, item.name, structuredClone(item.args));
      assert.equal(invalid.ok, false); assert.match(invalid.message, /role-not-allowed/);
    }
    assert.equal(calls.length, 1);
  }
});

test("R2 rejects unknown identity/source/switch and nested malformed evidence before invocation", async () => {
  for (const item of narrowCases) {
    let calls = 0;
    const options = { roleId: item.roleId, [item.key]: async () => { calls++; return item.receipt; } } as GovernedToolsOptions;
    for (const extra of [{ actorRoleId: item.roleId }, { source: { kind: "customer-decision" } }, { delegationEnabled: true },
      { roleDocumentChecks: { roleId: "worker", snapshotDigest: directDigest, ok: true } }]) {
      assert.equal((await run(options, item.name, { ...structuredClone(item.args), ...extra })).ok, false);
    }
    const absent = { ...structuredClone(item.args) } as Record<string, unknown>;
    const required = describeTool(item.name).parameters.required as string[];
    delete absent[required[0]!];
    assert.equal((await run(options, item.name, absent)).ok, false);
    assert.equal(calls, 0);
  }
  const badCases: [number, Record<string, unknown>][] = [
    [0, { ...narrowCases[0].args, targetTrunk: { version: 2, digest: directNext, actorRoleId: "chief" } }],
    [0, { ...narrowCases[0].args, mode: "automatic" }],
    [1, { ...narrowCases[1].args, plan: { path: "../escape.md", sha256: directDigest, version: 1 } }],
    [2, { ...narrowCases[2].args, documents: { card: narrowCases[2].args.documents.card } }],
    [3, { ...narrowCases[3].args, outcome: "cancelled" }],
    [4, { ...decisionArgs, disposition: "revise" }],
    [4, { ...decisionArgs, selected: [] }],
    [4, { ...decisionArgs, delegationRevision: -1 }],
  ];
  for (const [index, args] of badCases) {
    const item = narrowCases[index]!; let calls = 0;
    const result = await run({ roleId: item.roleId, [item.key]: async () => { calls++; return item.receipt; } } as GovernedToolsOptions, item.name, args);
    assert.equal(result.ok, false, JSON.stringify(args)); assert.equal(calls, 0);
  }
});

test("R2 preserves committed/no-op/blocked receipts and does not rewrite an applied result after abort", async () => {
  for (const receipt of [
    { ...appliedReceipt, status: "no-op", targetDigest: directDigest },
    { ...appliedReceipt, ok: false, status: "rejected", errorCode: "base-conflict", message: "conflict" },
    { ...appliedReceipt, ok: false, status: "blocked", errorCode: "missing-evidence", message: "blocked" },
    { ...appliedReceipt, ok: false, status: "committed-pending-recovery", applicationId: "vc-1", journalId: "j-1", errorCode: "notify-failed", message: "Committed; notification pending" },
  ]) {
    const result = await run({ roleId: "convener", completeTeamPlan: async () => receipt } as GovernedToolsOptions, "complete_team_plan", structuredClone(narrowCases[1].args));
    assert.deepEqual(JSON.parse(result.message.slice("complete_team_plan: ".length)), receipt);
    assert.equal(result.ok, receipt.ok);
  }
  const controller = new AbortController();
  const result = await run({ roleId: "convener", completeTeamPlan: async () => { controller.abort(); return appliedReceipt; } }, "complete_team_plan", structuredClone(narrowCases[1].args), controller.signal);
  assert.equal(result.ok, true); assert.match(result.message, /"status":"applied"/);
  for (const receipt of [{ ...appliedReceipt, operationId: "wrong" }, { ok: true, status: "approved" },
    { ...appliedReceipt, ok: false, status: "committed-pending-recovery", errorCode: "notify-failed", message: "committed" }]) {
    const invalid = await run({ roleId: "convener", completeTeamPlan: async () => receipt } as GovernedToolsOptions, "complete_team_plan", structuredClone(narrowCases[1].args));
    assert.equal(invalid.ok, false); assert.match(invalid.message, /结果未知/); assert.doesNotMatch(invalid.message, /按.*未提交.*处理/);
  }
});

test("R2 submit_version_change forwards complete direct CAS input with trusted initiator and honest post-commit result", async () => {
  const args = { kind: "version-upgrade", flowId: "flow-1", summary: "direct", targets: [{ ...VCA_TARGETS[0], expectedFromSha256: null }], operationId: "op-1", baseTrunk: { version: 1, digest: directDigest } };
  let calls = 0;
  const controller = new AbortController();
  const result = await run({ roleId: "product", submitVersionChange: async input => {
    calls++; assert.deepEqual(input, { ...args, initiatorRoleId: "product" }); controller.abort();
    return { ...appliedReceipt, applicationId: "vc-1", receipt: appliedReceipt };
  } }, SUBMIT_VERSION_CHANGE_TOOL_NAME, args, controller.signal);
  assert.equal(result.ok, true); assert.match(result.message, /"status":"applied"/); assert.equal(calls, 1);
  for (const invalid of [{ ...args, operationId: undefined }, { ...args, baseTrunk: { version: 1, digest: "bad" } },
    { ...args, targets: VCA_TARGETS }, { ...args, initiatorRoleId: "product" },
    { ...args, baseTrunk: { ...args.baseTrunk, source: "customer" } },
    { ...args, roleDocumentChecks: { roleId: "worker", snapshotDigest: directDigest, ok: true } }]) {
    assert.equal((await run({ roleId: "product", submitVersionChange: async () => { calls++; return { ok: true }; } }, SUBMIT_VERSION_CHANGE_TOOL_NAME, invalid)).ok, false);
  }
  assert.equal(calls, 1);
});

const chiefContext = (): ChiefDecisionExecutionContext => ({ roleId: "chief", executionId: "execution-1", mode: "bounded-decision", productionWriteAuthority: false,
  tools: ["decide_pending_request"], limits: { maxTurns: 1, timeoutMs: 1000, maxAttempts: 1 }, request: {
    requestId: "req-1", baseDigest: directDigest, delegationRevision: 2, originRoleId: "convener", cardKind: "decision", question: "Recovery?",
    options: [{ id: "recommended", label: "First", recommended: true }, { id: "alternative", label: "Second" }], evidenceRefs: [snapshotRef] } });

test("R2 bounded chief tool binds request/revision/options and never substitutes recommended choice", async () => {
  let calls = 0;
  const [tool] = buildChiefDecisionTools(async () => { calls++; return decisionReceipt as Awaited<ReturnType<NonNullable<GovernedToolsOptions["decidePendingRequest"]>>>; }, chiefContext());
  for (const args of [{ ...decisionArgs, requestId: "other" }, { ...decisionArgs, delegationRevision: 1 }, { ...decisionArgs, selected: ["invalid"] }]) assert.equal((await tool!.handler({ name: tool!.name, args })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await tool!.handler({ name: tool!.name, args: decisionArgs })).ok, true);
  assert.equal((await tool!.handler({ name: tool!.name, args: decisionArgs })).ok, false);
  assert.equal(calls, 1);
  const [wrongOrigin] = buildChiefDecisionTools(async () => ({ ...decisionReceipt,
    source: { ...decisionReceipt.source, originRoleId: "different-origin" } }) as Awaited<ReturnType<NonNullable<GovernedToolsOptions["decidePendingRequest"]>>>, chiefContext());
  assert.equal((await wrongOrigin!.handler({ name: wrongOrigin!.name, args: decisionArgs })).ok, false);
});

test("R2 Service real-chief context isolates all production tools/MCP and enforces role and turn budget", async () => {
  const captured: RuntimeProviderOptions[] = [];
  const options = { runtime: "demo" as const, gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), chiefDecisionContext: chiefContext(),
    persistSession: true, closeCreatedTask: async () => ({ ...appliedReceipt, taskId: "task-1", eventId: "e-1", taskStatus: "closed" }),
    decidePendingRequest: async () => decisionReceipt as Awaited<ReturnType<NonNullable<GovernedToolsOptions["decidePendingRequest"]>>>,
    providerFactories: { demo: (provider: RuntimeProviderOptions) => { captured.push(provider); return createDemoRuntimeAdapter(provider, [{ name: "decide_pending_request", args: decisionArgs }]); } } };
  const adapter = createRuntimeAdapter(options);
  await assert.rejects(adapter.bindRole(role("convener")), /trusted chief/);
  const session = await adapter.bindRole(role("chief"));
  assert.deepEqual(captured[0]!.tools.map(tool => tool.name), ["decide_pending_request"]);
  assert.deepEqual(captured[0]!.installedMcpServers, []);
  assert.equal(captured[0]!.storage, undefined);
  assert.equal(captured[0]!.turnLastResortMs, 1000);
  assert.equal(captured[0]!.requestAttemptMax, 1);
  await session.prompt("Choose using evidence");
  await assert.rejects(session.prompt("Repeat"), /budget exhausted/);
  await session.dispose();
});

test("R2 decision rejection/revision stays pending unless the trusted capability returns a matching settlement", async () => {
  for (const disposition of ["reject", "revise"] as const) {
    const args = { ...decisionArgs, disposition, selected: undefined };
    delete args.selected;
    const result = await run({ roleId: "chief", decidePendingRequest: async input => {
      assert.deepEqual(input, args);
      return { ok: false, requestId: "req-1", status: "pending", errorCode: "needs-revision", message: "No revision option; retained for author" };
    } }, "decide_pending_request", args);
    assert.equal(result.ok, false); assert.match(result.message, /"status":"pending"/);
  }
  const wrong = await run({ roleId: "chief", decidePendingRequest: async () => ({ ...decisionReceipt,
    source: { ...decisionReceipt.source, selected: ["recommended"] } }) } as GovernedToolsOptions, "decide_pending_request", decisionArgs);
  assert.equal(wrong.ok, false); assert.match(wrong.message, /结果未知/);
});

test("R2 chief timeout is finite and normal sessions still receive injected narrow capabilities", async () => {
  const captured: RuntimeProviderOptions[] = [];
  const context = chiefContext(); context.limits.timeoutMs = 25;
  let calls = 0;
  const session = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(),
    chiefDecisionContext: context, decidePendingRequest: async (_input, signal) => {
      calls++;
      await new Promise<void>((_resolve, reject) => { signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); });
      throw new Error("unreachable");
    }, providerFactories: { demo: provider => createDemoRuntimeAdapter(provider, [{ name: "decide_pending_request", args: decisionArgs }]) },
  }).bindRole(role("chief"));
  try { await assert.rejects(session.prompt("Decide"), /超时|超过|到点/); assert.equal(calls, 1); }
  finally { await session.dispose(); }
  let normalCalls = 0;
  const normal = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(),
    completeTeamPlan: async () => { normalCalls++; return appliedReceipt; }, providerFactories: { demo: provider => {
      captured.push(provider); return createDemoRuntimeAdapter(provider, [{ name: "complete_team_plan", args: structuredClone(narrowCases[1].args) }]);
    } },
  }).bindRole(role("convener"));
  try {
    assert.equal(captured[0]!.tools.some(tool => tool.name === "complete_team_plan"), true);
    assert.equal(captured[0]!.tools.some(tool => tool.name === "write_file"), true);
    await normal.prompt("Complete the plan"); assert.equal(normalCalls, 1);
  } finally { await normal.dispose(); }
});

test("R5 explicit pending resubmission id uses the frozen VCA id grammar and is never guessed from summary", async () => {
  const inputs: SubmitVersionChangeInput[] = [];
  const options: GovernedToolsOptions = { roleId: "product", submitVersionChange: async input => {
    inputs.push(input); return { ok: true, applicationId: "vc-3", status: "submitted" };
  } };
  const args = { kind: "version-upgrade", flowId: "flow-resubmit", summary: "replace vc-1", targets: VCA_TARGETS };
  assert.equal((await run(options, SUBMIT_VERSION_CHANGE_TOOL_NAME, { ...args, supersedesApplicationId: "vc-1" })).ok, true);
  assert.equal(inputs[0]!.supersedesApplicationId, "vc-1");
  assert.equal((await run(options, SUBMIT_VERSION_CHANGE_TOOL_NAME, args)).ok, true);
  assert.equal("supersedesApplicationId" in inputs[1]!, false);
  for (const supersedesApplicationId of [null, "", " VC-1 ", "vc-other", 1]) assert.equal(
    (await run(options, SUBMIT_VERSION_CHANGE_TOOL_NAME, { ...args, supersedesApplicationId })).ok, false);
  assert.equal(inputs.length, 2);
  const properties = describeTool(SUBMIT_VERSION_CHANGE_TOOL_NAME).parameters.properties as Record<string, { pattern?: string }>;
  assert.equal(properties.supersedesApplicationId!.pattern, "^vc-[0-9]+$");
});

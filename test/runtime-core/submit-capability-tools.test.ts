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

// E2 X-R4（convener）：`request_requirement_change` 工具层 requirement-change 前置。
//
// 覆盖：角色门控（rapporteur/convener 各走本角色模块；其余角色保持旧行为）、
// convener allow 路径载荷原样、deny → 既有回执形状（缺事实/未知键/归属键缺失/批准声明）、
// handler 加 roleId=convener 前后零差异（E2.2）、模型不可自报 actorRoleId/批准事实，
// 以及接线位置静态守卫（前置在形状校验之后、触达能力之前；只经角色 public entry）。
// 不改变既有参数/回执契约；不跑真实模型。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type {
  RequestRequirementChangeFn,
  RequestRequirementChangeInput,
  RequestRequirementChangeResult,
} from "../../src/model/runtime.ts";
import type { RolePolicyDecision } from "../../src/model/role.ts";
import {
  REQUEST_REQUIREMENT_CHANGE_TOOL_NAME,
  buildGovernedTools,
  requirementChangePreflight,
  requirementChangePreflightRejection,
} from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const TOOL = REQUEST_REQUIREMENT_CHANGE_TOOL_NAME;
const VALID = Object.freeze({
  intentId: "intent-a",
  changeKind: "scope",
  summary: "范围需扩大",
  rationale: "提案发现需要新增模块",
});
const CONVENER_FACTS = Object.freeze({
  actorRoleId: "convener",
  changeKind: "scope",
  intentId: "intent-a",
  summary: "s",
  rationale: "r",
});
const RECEIPT: RequestRequirementChangeResult = {
  ok: true,
  code: "dispatched",
  message: "申请已登记，等待需求变更审批",
  flowId: "flow-a",
  intentId: "intent-a",
  requestId: "req-1",
};

const call = (args: Record<string, unknown>) => ({ name: TOOL, args });

function toolMap(options: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

test("X-R4/角色门控：convener 走 convener 模块；rapporteur 仍走 rapporteur 模块；其余角色保持旧行为", () => {
  assert.deepEqual(requirementChangePreflight("convener", CONVENER_FACTS), { allow: true });
  assert.deepEqual(requirementChangePreflight("rapporteur", {
    initiatorRoleId: "rapporteur",
    changeKind: "scope",
    intentId: "intent-a",
    summary: "s",
    rationale: "r",
  }), { allow: true });
  for (const roleId of [undefined, "product", "nominator", "verifier", "chief", "su", "worker"]) {
    assert.equal(requirementChangePreflight(roleId, CONVENER_FACTS), undefined, String(roleId));
  }
});

test("X-R4/allow：convener 有效载荷通过前置，能力恰调用一次且载荷原样（可选键缺席不造键）", async () => {
  const received: RequestRequirementChangeInput[] = [];
  const fn: RequestRequirementChangeFn = async (input) => { received.push(input); return RECEIPT; };
  const tool = toolMap({ roleId: "convener", requestRequirementChange: fn }).get(TOOL)!;

  const ok = await tool.handler(call(VALID));
  assert.equal(ok.ok, true, ok.message);
  assert.match(ok.message, /code=dispatched/);

  const full = {
    flowId: "flow-a",
    intentId: "intent-a",
    taskId: "t-1",
    changeKind: "cost",
    summary: "成本上升",
    rationale: "需要额外引擎适配",
    impact: "工期 +3 天",
    proposedIntentPatch: "建议把成本约束写入意图文件",
  };
  assert.equal((await tool.handler(call(full))).ok, true);
  // impact:null 视作未提供（既有语义），前置仍 allow。
  assert.equal((await tool.handler(call({ ...VALID, impact: null, proposedIntentPatch: null }))).ok, true);

  assert.deepEqual(received, [
    { intentId: "intent-a", changeKind: "scope", summary: "范围需扩大", rationale: "提案发现需要新增模块" },
    full,
    { intentId: "intent-a", changeKind: "scope", summary: "范围需扩大", rationale: "提案发现需要新增模块" },
  ]);
  for (const omitted of ["flowId", "taskId", "impact", "proposedIntentPatch"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(received[0], omitted), false, `缺省 ${omitted} 不得凭空造键`);
  }
});

test("X-R4/deny：缺事实、错误 actorRoleId、未知键、归属键缺失 ⇒ 既有回执形状（未提交、能力零调用）", () => {
  const cases: Array<{ name: string; facts: Readonly<Record<string, unknown>>; code: string }> = [
    {
      name: "actorRoleId 非 convener",
      facts: { ...CONVENER_FACTS, actorRoleId: "rapporteur" },
      code: "requirement-change-facts-invalid",
    },
    {
      name: "缺 summary",
      facts: { actorRoleId: "convener", changeKind: "scope", intentId: "intent-a", rationale: "r" },
      code: "requirement-change-facts-invalid",
    },
    {
      name: "缺 flowId/intentId/taskId",
      facts: { actorRoleId: "convener", changeKind: "scope", summary: "s", rationale: "r" },
      code: "requirement-change-scope-missing",
    },
    {
      name: "未知事实键",
      facts: { ...CONVENER_FACTS, approved: true },
      code: "facts-unknown",
    },
    {
      // convener 模块键集不含批准声明键（rapporteur 模块允许声明 false）；给出即未知键 deny。
      name: "声称已批准",
      facts: { ...CONVENER_FACTS, claimsApproved: true },
      code: "facts-unknown",
    },
  ];
  for (const item of cases) {
    const decision = requirementChangePreflight("convener", item.facts);
    assert.ok(decision !== undefined, item.name);
    assert.equal(decision.allow, false, item.name);
    assert.equal(decision.allow === false && decision.code, item.code, item.name);
    const rejection = requirementChangePreflightRejection(
      TOOL,
      "convener",
      decision as Extract<RolePolicyDecision, { readonly allow: false }>,
    );
    assert.equal(rejection.ok, false, item.name);
    assert.match(rejection.message, new RegExp(`内部 code=${item.code}`), item.name);
    assert.match(rejection.message, /convener 角色前置策略拒绝/, item.name);
    assert.match(rejection.message, /未提交/, item.name);
    assert.match(rejection.message, /申请≠批准/, item.name);
    assert.match(rejection.message, /不要当已提交\/已获批准/, item.name);
    assert.doesNotMatch(rejection.message, /已提交需求变更审批（应用自动呈现/, `${item.name} 不得出现成功文案`);
  }
  // facts 非普通对象 ⇒ 模块 fail-closed（工具层不会构造该形态，防御性断言）。
  const invalid = requirementChangePreflight("convener", null as unknown as Readonly<Record<string, unknown>>);
  assert.equal(invalid?.allow, false);
  assert.equal(invalid !== undefined && invalid.allow === false && invalid.code, "facts-invalid");
});

test("X-R4/零差异：同一参数矩阵下，加 roleId=convener 前后 ok/message/调用次数逐字一致", async () => {
  const validCases: Record<string, unknown>[] = [
    VALID,
    { flowId: "flow-a", changeKind: "authorization", summary: "s", rationale: "r" },
    { taskId: "t-1", changeKind: "constraint", summary: "s", rationale: "r" },
    {
      flowId: "flow-a", intentId: "intent-a", taskId: "t-1", changeKind: "other",
      summary: "s", rationale: "r", impact: "i", proposedIntentPatch: "p",
    },
    { ...VALID, impact: null },
  ];
  const invalidCases: Record<string, unknown>[] = [
    {},
    { changeKind: "scope", summary: "s", rationale: "r" },
    { intentId: "intent-a", changeKind: "budget", summary: "s", rationale: "r" },
    { intentId: "intent-a", changeKind: "scope", summary: "", rationale: "r" },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "   " },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", approved: true },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", claimsApproved: true },
    { intentId: "intent-a", changeKind: "scope", summary: "s", rationale: "r", selfApproval: true },
    { flowId: "flow-", changeKind: "scope", summary: "s", rationale: "r" },
    { taskId: "   ", changeKind: "scope", summary: "s", rationale: "r" },
    { intentId: "intent-a", changeKind: "scope", summary: "说".repeat(501), rationale: "r" },
  ];

  for (const args of [...validCases, ...invalidCases]) {
    const runs = [];
    for (const withRole of [false, true]) {
      let calls = 0;
      const fn: RequestRequirementChangeFn = async () => { calls += 1; return RECEIPT; };
      const tool = toolMap({
        ...(withRole ? { roleId: "convener" } : {}),
        requestRequirementChange: fn,
      }).get(TOOL)!;
      const result = await tool.handler(call(args));
      runs.push({ ok: result.ok, message: result.message, calls });
    }
    assert.deepEqual(runs[0], runs[1], `roleId convener 不得改变结果：${JSON.stringify(args).slice(0, 140)}`);
  }
});

test("X-R4/不弱化：模型不可自报 actorRoleId/批准事实，仍在触达能力前拒绝", async () => {
  let calls = 0;
  const fn: RequestRequirementChangeFn = async () => { calls += 1; return RECEIPT; };
  const tool = toolMap({ roleId: "convener", requestRequirementChange: fn }).get(TOOL)!;
  for (const args of [
    { ...VALID, actorRoleId: "convener" },
    { ...VALID, initiatorRoleId: "convener" },
    { ...VALID, claimsApproved: true },
    { ...VALID, selfApproval: true },
    { ...VALID, approved: true },
  ]) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, JSON.stringify(args));
    assert.match(result.message, /未知参数/);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "越权参数不得触达能力");
});

test("X-R4/接线守卫：convener 前置只经角色 public entry，且位于 input 构建之后、能力调用之前", () => {
  const source = readFileSync(new URL("../../src/provider/runtime/tools.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /import \{ convenerRoleModule \} from "\.\.\/\.\.\/common\/roles\/convener\/index\.ts";/,
    "Provider 只经 convener 模块 public entry 消费（E0.3 §2）",
  );
  assert.match(
    source,
    /convenerRoleModule\.preflight\?\.checkAction\(\{ action: "requirement-change", facts \}\)/,
    "convener 前置必须调用模块 preflight（requirement-change）",
  );
  assert.match(
    source,
    /const preflightRole = scope\?\.roleId === "rapporteur" \|\| scope\?\.roleId === "convener" \? scope\.roleId : undefined;\s*\n\s*if \(preflightRole !== undefined\) \{/,
    "前置角色取自可信 scope（rapporteur/convener），不是模型参数",
  );
  assert.doesNotMatch(source, /import[^;]*from "[^"]*service\/role\/resolve-role\.ts"/s);
  assert.doesNotMatch(source, /import[^;]*from "[^"]*common\/门禁引擎\//s);
});

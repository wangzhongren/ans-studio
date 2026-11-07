// E2 X-R2（rapporteur）：`request_requirement_change` 工具层 requirement-change 前置。
//
// 覆盖：角色门控（仅 rapporteur）、allow 路径载荷原样、deny → 既有回执形状、
// 缺事实/未知键/批准声明（模块事实纪律）、handler 加 roleId 前后零差异，
// 以及接线位置静态守卫（前置在形状校验之后、触达能力之前）。
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
const VALID_FACTS = Object.freeze({
  initiatorRoleId: "rapporteur",
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

test("X-R2+X-R4/角色门控：rapporteur 与 convener 各走本角色模块；缺省/其他角色保持旧行为", () => {
  assert.deepEqual(requirementChangePreflight("rapporteur", VALID_FACTS), { allow: true });
  // X-R4 起 convener 的 requirement-change 前置接线到 convener 模块（事实键为 actorRoleId）。
  assert.deepEqual(
    requirementChangePreflight("convener", {
      actorRoleId: "convener",
      changeKind: "scope",
      intentId: "intent-a",
      summary: "s",
      rationale: "r",
    }),
    { allow: true },
  );
  assert.equal(requirementChangePreflight(undefined, VALID_FACTS), undefined);
  assert.equal(requirementChangePreflight("product", VALID_FACTS), undefined);
});

test("X-R2/allow：rapporteur 有效载荷通过前置，能力恰调用一次且载荷原样（可选键缺席不造键）", async () => {
  const received: RequestRequirementChangeInput[] = [];
  const fn: RequestRequirementChangeFn = async (input) => { received.push(input); return RECEIPT; };
  const tool = toolMap({ roleId: "rapporteur", requestRequirementChange: fn }).get(TOOL)!;

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

test("X-R2/deny：缺事实、未知键、批准声明 ⇒ 既有回执形状（未提交、申请≠批准、能力零调用）", () => {
  const cases: Array<{ name: string; facts: Readonly<Record<string, unknown>>; code: string }> = [
    {
      name: "无 flowId/intentId/taskId",
      facts: { initiatorRoleId: "rapporteur", changeKind: "scope", summary: "s", rationale: "r" },
      code: "rapporteur-requirement-change-ref-missing",
    },
    {
      name: "缺 rationale",
      facts: { initiatorRoleId: "rapporteur", changeKind: "scope", flowId: "flow-a", summary: "s" },
      code: "rapporteur-facts-missing",
    },
    {
      name: "未知事实键",
      facts: { ...VALID_FACTS, approved: true },
      code: "rapporteur-facts-unknown-key",
    },
    {
      name: "声称已批准",
      facts: { ...VALID_FACTS, claimsApproved: true },
      code: "rapporteur-requirement-change-approval-claimed",
    },
    {
      name: "发起方自批",
      facts: { ...VALID_FACTS, selfApproval: true },
      code: "rapporteur-requirement-change-self-approval",
    },
  ];
  for (const item of cases) {
    const decision = requirementChangePreflight("rapporteur", item.facts);
    assert.ok(decision !== undefined, item.name);
    assert.equal(decision.allow, false, item.name);
    assert.equal(decision.allow === false && decision.code, item.code, item.name);
    const rejection = requirementChangePreflightRejection(TOOL, "rapporteur", decision as Extract<RolePolicyDecision, { readonly allow: false }>);
    assert.equal(rejection.ok, false, item.name);
    assert.match(rejection.message, new RegExp(`内部 code=${item.code}`), item.name);
    assert.match(rejection.message, /未提交/, item.name);
    assert.match(rejection.message, /申请≠批准/, item.name);
    assert.match(rejection.message, /不要当已提交\/已获批准/, item.name);
    assert.doesNotMatch(rejection.message, /已提交需求变更审批（应用自动呈现/, `${item.name} 不得出现成功文案`);
  }
  // facts 非普通对象 ⇒ 模块 fail-closed（工具层不会构造该形态，防御性断言）。
  const invalid = requirementChangePreflight("rapporteur", null as unknown as Readonly<Record<string, unknown>>);
  assert.equal(invalid?.allow, false);
  assert.equal(invalid !== undefined && invalid.allow === false && invalid.code, "rapporteur-facts-invalid");
});

test("X-R2/零差异：同一参数矩阵下，加 roleId=rapporteur 前后 ok/message/调用次数逐字一致", async () => {
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
        ...(withRole ? { roleId: "rapporteur" } : {}),
        requestRequirementChange: fn,
      }).get(TOOL)!;
      const result = await tool.handler(call(args));
      runs.push({ ok: result.ok, message: result.message, calls });
    }
    assert.deepEqual(runs[0], runs[1], `roleId rapporteur 不得改变结果：${JSON.stringify(args).slice(0, 140)}`);
  }
});

test("X-R2/不弱化：模型不可自报批准/越权参数，仍在触达能力前拒绝", async () => {
  let calls = 0;
  const fn: RequestRequirementChangeFn = async () => { calls += 1; return RECEIPT; };
  const tool = toolMap({ roleId: "rapporteur", requestRequirementChange: fn }).get(TOOL)!;
  for (const args of [
    { ...VALID, claimsApproved: true },
    { ...VALID, selfApproval: true },
    { ...VALID, approved: true },
    { ...VALID, intentConfirm: true },
  ]) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, JSON.stringify(args));
    assert.match(result.message, /未知参数/);
    assert.match(result.message, /未执行/);
  }
  assert.equal(calls, 0, "越权参数不得触达能力");
});

test("X-R2/接线守卫：handler 在构建 input 之后、调用能力之前走 requirement-change 前置", () => {
  const source = readFileSync(new URL("../../src/provider/runtime/tools.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /import \{ rapporteurRoleModule \} from "\.\.\/\.\.\/common\/roles\/rapporteur\/index\.ts";/,
    "Provider 只经角色模块 public entry 消费（E0.3 §2）",
  );
  assert.match(
    source,
    /import \{ convenerRoleModule \} from "\.\.\/\.\.\/common\/roles\/convener\/index\.ts";/,
    "X-R4：convener 模块同样只经 public entry 消费",
  );
  assert.match(
    source,
    /const preflightRole = scope\?\.roleId === "rapporteur" \|\| scope\?\.roleId === "convener" \? scope\.roleId : undefined;\s*\n\s*if \(preflightRole !== undefined\) \{\s*\n\s*const preflight = requirementChangePreflight\(preflightRole, requirementChangePreflightFacts\(preflightRole, input\)\);\s*\n\s*if \(preflight !== undefined && !preflight\.allow\) return requirementChangePreflightRejection\(name, preflightRole, preflight\);/,
    "前置必须在 input 构建之后、注入能力之前",
  );
  assert.doesNotMatch(source, /import[^;]*from "[^"]*service\/role\/resolve-role\.ts"/s);
  assert.doesNotMatch(source, /import[^;]*from "[^"]*common\/门禁引擎\//s);
});

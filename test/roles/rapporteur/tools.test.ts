// test/roles/rapporteur/tools.test.ts
// rapporteur `tools()` 纯策略单测：trio 声明、非 trio fail-closed、D10 派生、冻结/纯度。
//
// 旧 oracle：run-role.ts 注入门控（requestRequirementChange / submitVersionChange / selectRunChange）；
// 差分 fixture 的 probe 结果为同一 3 项（见 oracle-fixture.ts）。

import assert from "node:assert/strict";
import { test } from "node:test";

import type { TrustedToolPolicyInput } from "../../../src/model/role.ts";
import { rapporteurRoleModule } from "../../../src/common/roles/rapporteur/index.ts";
import { ORACLE_RAPPORTEUR_INJECTED_TOOLS } from "./oracle-fixture.ts";

const TRIO: TrustedToolPolicyInput = { governanceModel: "trio" };

test("tools：trio 返回 rapporteur 允许的 3 个稳定 id（顺序固定）", () => {
  const policy = rapporteurRoleModule.tools(TRIO);
  assert.deepEqual([...policy.tools], ["requestRequirementChange", "submitVersionChange", "selectRunChange"]);
  assert.deepEqual([...policy.tools], [...ORACLE_RAPPORTEUR_INJECTED_TOOLS]);
  assert.deepEqual(policy.reasons, []);
});

test("tools：不含任何越权 id（chief/product/convener/nominator 专属）", () => {
  const tools = new Set<string>(rapporteurRoleModule.tools(TRIO).tools);
  for (const forbidden of [
    "roleActivityLog",
    "terminateRoleRun",
    "redispatchTask",
    "projectNote",
    "requestVersionDecision",
    "completeTeamPlan",
    "activateRoleDocuments",
    "closeCreatedTask",
    "submitRefactor",
    "requestStableWrite",
    "decidePendingRequest",
  ]) {
    assert.equal(tools.has(forbidden), false, `rapporteur 不得声明 ${forbidden}`);
  }
});

test("tools：single 模型返回空声明 + 稳定 reason（fail-closed）", () => {
  const policy = rapporteurRoleModule.tools({ governanceModel: "single" });
  assert.deepEqual(policy.tools, []);
  assert.equal(policy.reasons.length, 1);
  assert.equal(policy.reasons[0]!.code, "rapporteur-tools-governance-model-unsupported");
  assert.equal(policy.reasons[0]!.messageKey, "role.rapporteur.tools.governanceModelUnsupported");
  assert.deepEqual(policy.reasons[0]!.details, { governanceModel: "single" });
});

test("tools：未知/畸形模型运行时输入同样 fail-closed（不猜、不兜底）", () => {
  for (const governanceModel of ["weird", "", undefined, null, 42]) {
    const policy = rapporteurRoleModule.tools({ governanceModel } as unknown as TrustedToolPolicyInput);
    assert.deepEqual(policy.tools, [], `governanceModel=${String(governanceModel)} 不得返回工具`);
    assert.equal(policy.reasons[0]!.code, "rapporteur-tools-governance-model-unsupported");
  }
  const malformed = rapporteurRoleModule.tools(null as unknown as TrustedToolPolicyInput);
  assert.deepEqual(malformed.tools, []);
  assert.deepEqual(malformed.reasons[0]!.details, { governanceModel: "unknown" });
});

test("tools：capabilities 是 spec 的派生（D10：同一冻结对象，不产生第二份）", () => {
  for (const input of [TRIO, { governanceModel: "single" } as const]) {
    const policy = rapporteurRoleModule.tools(input);
    assert.equal(policy.capabilities, rapporteurRoleModule.capabilities);
    assert.deepEqual(policy.capabilities, rapporteurRoleModule.capabilities);
  }
});

test("tools：返回值冻结，重复调用稳定且不改写调用方输入", () => {
  const input = Object.freeze({ governanceModel: "trio" as const });
  const first = rapporteurRoleModule.tools(input);
  const second = rapporteurRoleModule.tools(input);
  assert.equal(first.tools, second.tools);
  assert.equal(first.capabilities, second.capabilities);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.tools));
  assert.ok(Object.isFrozen(first.reasons));
  assert.deepEqual(input, { governanceModel: "trio" });
});

test("tools：空/未知声明不携带权限语义（reasons 仅为诊断数据）", () => {
  const policy = rapporteurRoleModule.tools({ governanceModel: "single" });
  for (const reason of policy.reasons) {
    assert.equal(typeof reason.code, "string");
    assert.ok(reason.code.length > 0);
    assert.equal(typeof reason.messageKey, "string");
    assert.ok(reason.messageKey.length > 0);
  }
  assert.equal("allow" in policy, false);
  assert.equal("granted" in policy, false);
});

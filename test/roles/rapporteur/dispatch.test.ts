// test/roles/rapporteur/dispatch.test.ts
// rapporteur `dispatch()` 单测（R-2：只做硬身份/存在性；rapporteur 不作为派发来源）。
//
// 旧 oracle：evaluateDispatchAuthorization 对来源 rapporteur 一律 unknown-source（fixture 已列明码差异）。

import assert from "node:assert/strict";
import { test } from "node:test";

import type { RoleDispatchPolicyInput } from "../../../src/model/role.ts";
import { rapporteurRoleModule } from "../../../src/common/roles/rapporteur/index.ts";
import { ORACLE_DISPATCH_CASES } from "./oracle-fixture.ts";

test("dispatch：fixture 全部用例的 allow 位与稳定码匹配", () => {
  for (const fixtureCase of ORACLE_DISPATCH_CASES) {
    const policy = rapporteurRoleModule.dispatch(fixtureCase.input as RoleDispatchPolicyInput);
    assert.equal(policy.decision.allow, fixtureCase.expectedAllow, fixtureCase.name);
    if (!policy.decision.allow) {
      assert.equal(policy.decision.code, fixtureCase.expectedCode, fixtureCase.name);
      assert.equal(typeof policy.decision.messageKey, "string");
      assert.ok(policy.decision.messageKey.length > 0);
    }
  }
});

test("dispatch：任何来源/目标组合都不得 allow（rapporteur 无派发能力）", () => {
  const targets: RoleDispatchPolicyInput[] = [
    { sourceRoleId: "rapporteur", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
    { sourceRoleId: "rapporteur", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    { sourceRoleId: "rapporteur", targetRoleId: "worker-1", targetKind: "project", targetExists: true },
    { sourceRoleId: "rapporteur", targetRoleId: "worker-1", targetKind: "project", targetExists: false },
    { sourceRoleId: "chief", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true },
    { sourceRoleId: undefined, targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true },
  ];
  for (const input of targets) {
    const policy = rapporteurRoleModule.dispatch(input);
    assert.equal(policy.decision.allow, false, JSON.stringify(input));
    assert.equal("reportToRoleId" in policy, false, "拒绝分支不得给报告期望");
  }
});

test("dispatch：来源缺失/空串 → source-missing（fail-closed）", () => {
  for (const sourceRoleId of [undefined, "", "   "]) {
    const policy = rapporteurRoleModule.dispatch({ sourceRoleId, targetRoleId: "worker-1", targetKind: "project", targetExists: true });
    assert.equal(policy.decision.allow, false);
    assert.equal(policy.decision.allow === false && policy.decision.code, "rapporteur-dispatch-source-missing");
  }
});

test("dispatch：来源冒用其他角色 → source-mismatch（模块只回答本角色）", () => {
  for (const sourceRoleId of ["chief", "convener", "product", "nominator", "verifier"]) {
    const policy = rapporteurRoleModule.dispatch({ sourceRoleId, targetRoleId: "worker-1", targetKind: "project", targetExists: true });
    assert.equal(policy.decision.allow, false);
    assert.equal(policy.decision.allow === false && policy.decision.code, "rapporteur-dispatch-source-mismatch");
  }
});

test("dispatch：目标 id 缺失/空串/类别非法 → target-invalid", () => {
  const invalid: RoleDispatchPolicyInput[] = [
    { sourceRoleId: "rapporteur", targetRoleId: "", targetKind: "project", targetExists: true },
    { sourceRoleId: "rapporteur", targetRoleId: "worker-1", targetKind: "unknown" as never, targetExists: true },
    { sourceRoleId: "rapporteur", targetRoleId: "   ", targetKind: "built-in-governance", targetExists: true },
  ];
  for (const input of invalid) {
    const policy = rapporteurRoleModule.dispatch(input);
    assert.equal(policy.decision.allow, false);
    assert.equal(policy.decision.allow === false && policy.decision.code, "rapporteur-dispatch-target-invalid");
  }
});

test("dispatch：targetExists 非 true（缺省/false/非布尔）→ target-missing", () => {
  for (const targetExists of [undefined, false, "true" as unknown as boolean, 1 as unknown as boolean]) {
    const policy = rapporteurRoleModule.dispatch({ sourceRoleId: "rapporteur", targetRoleId: "worker-1", targetKind: "project", targetExists });
    assert.equal(policy.decision.allow, false);
    assert.equal(policy.decision.allow === false && policy.decision.code, "rapporteur-dispatch-target-missing");
  }
});

test("dispatch：合法来源+真实目标 → not-authorized（不在可派发来源集合）", () => {
  const policy = rapporteurRoleModule.dispatch({
    sourceRoleId: "rapporteur",
    targetRoleId: "worker-1",
    targetKind: "project",
    targetExists: true,
  });
  assert.equal(policy.decision.allow, false);
  assert.equal(policy.decision.allow === false && policy.decision.code, "rapporteur-dispatch-not-authorized");
  assert.deepEqual(policy.decision.allow === false && policy.decision.details, {
    sourceRoleId: "rapporteur",
    targetRoleId: "worker-1",
    targetKind: "project",
  });
});

test("dispatch：运行时畸形输入不抛异常、一律 deny", () => {
  for (const input of [null, undefined, {}, 42, "x"]) {
    const policy = rapporteurRoleModule.dispatch(input as unknown as RoleDispatchPolicyInput);
    assert.equal(policy.decision.allow, false);
  }
});

test("dispatch：details 可 JSON 序列化（无密钥/正文/模型输出）", () => {
  for (const fixtureCase of ORACLE_DISPATCH_CASES) {
    const policy = rapporteurRoleModule.dispatch(fixtureCase.input as RoleDispatchPolicyInput);
    const json = JSON.stringify(policy);
    assert.equal(typeof json, "string");
    assert.equal(json.includes("undefined"), false);
    assert.ok(json.length < 1024);
  }
});

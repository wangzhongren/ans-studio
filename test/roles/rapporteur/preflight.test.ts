// test/roles/rapporteur/preflight.test.ts
// rapporteur `preflight.checkAction()` 单测：整单修正案 / run-change 三模式 / 需求变更 正负例 + 事实包纪律。
//
// 差分 fixture 记录旧拒绝锚点；本文件验证新模块行为（fail-closed / 稳定码 / messageKey / 纯度）。

import assert from "node:assert/strict";
import { test } from "node:test";

import type { RolePreflightInput } from "../../../src/model/role.ts";
import { rapporteurRoleModule } from "../../../src/common/roles/rapporteur/index.ts";
import { ORACLE_PREFLIGHT_CASES } from "./oracle-fixture.ts";

const preflight = rapporteurRoleModule.preflight;
assert.ok(preflight !== undefined, "rapporteur 必须提供 preflight");

const DETAIL_AMENDMENT_OK = Object.freeze({
  initiatorRoleId: "rapporteur",
  kind: "detail-amendment",
  wholeOrder: true,
  legacyCardPath: "none",
});

const RUN_CHANGE_OK = Object.freeze({
  initiatorRoleId: "rapporteur",
  mode: "continue-frozen",
  operationId: "op-1",
  runId: "run-1",
  expectedPinDigest: "a".repeat(64),
  targetTrunkVersion: 2,
  targetTrunkDigest: "b".repeat(64),
  reason: "keep frozen execution",
});

const REQUIREMENT_CHANGE_OK = Object.freeze({
  initiatorRoleId: "rapporteur",
  changeKind: "scope",
  flowId: "flow-a",
  summary: "scope change",
  rationale: "customer asked for it",
});

function check(action: RolePreflightInput["action"], facts: Readonly<Record<string, unknown>>) {
  return preflight!.checkAction({ action, facts });
}

test("preflight：fixture 全部用例的 allow 位与稳定码匹配", () => {
  for (const fixtureCase of ORACLE_PREFLIGHT_CASES) {
    const decision = check(fixtureCase.action, fixtureCase.facts);
    assert.equal(decision.allow, fixtureCase.expectedAllow, fixtureCase.name);
    if (!decision.allow) {
      assert.equal(decision.code, fixtureCase.expectedCode, fixtureCase.name);
      assert.ok(decision.messageKey.length > 0, fixtureCase.name);
    }
  }
});

test("preflight：未覆盖动作 → 契约稳定码 action-not-covered", () => {
  for (const action of ["review", "version-upgrade", "stable-write", "appointment", "team-plan", "git-action", "version-decision"] as const) {
    const decision = check(action, {});
    assert.equal(decision.allow, false);
    assert.equal(decision.allow === false && decision.code, "action-not-covered");
    assert.equal(decision.allow === false && decision.messageKey, "role.rapporteur.preflight.actionNotCovered");
  }
});

test("preflight：detail-amendment 正例 allow 且只返回 {allow:true}", () => {
  const decision = check("detail-amendment", DETAIL_AMENDMENT_OK);
  assert.deepEqual(decision, { allow: true });
});

test("preflight：detail-amendment 缺键 / 未知键 / 类型不符 → deny", () => {
  const missing = check("detail-amendment", { initiatorRoleId: "rapporteur", kind: "detail-amendment", legacyCardPath: "none" });
  assert.equal(missing.allow === false && missing.code, "rapporteur-facts-missing");

  const unknownKey = check("detail-amendment", { ...DETAIL_AMENDMENT_OK, targetCount: 2 });
  assert.equal(unknownKey.allow === false && unknownKey.code, "rapporteur-facts-unknown-key");
  assert.deepEqual(unknownKey.allow === false && unknownKey.details, { action: "detail-amendment", unknownKeys: ["targetCount"] });

  const wrongType = check("detail-amendment", { ...DETAIL_AMENDMENT_OK, wholeOrder: "yes" });
  assert.equal(wrongType.allow === false && wrongType.code, "rapporteur-facts-invalid");
});

test("preflight：detail-amendment 全部 legacy 卡路径均拒绝", () => {
  for (const legacyCardPath of ["proposal-accept", "vca-batch-decision", "amendment-item-confirm", "amendment-final-card", "legacy-approver"]) {
    const decision = check("detail-amendment", { ...DETAIL_AMENDMENT_OK, legacyCardPath });
    assert.equal(decision.allow, false, legacyCardPath);
    assert.equal(decision.allow === false && decision.code, "rapporteur-amendment-legacy-card-path");
  }
});

test("preflight：detail-amendment 未知 legacyCardPath 值 → facts-invalid", () => {
  const decision = check("detail-amendment", { ...DETAIL_AMENDMENT_OK, legacyCardPath: "old-flow" });
  assert.equal(decision.allow === false && decision.code, "rapporteur-facts-invalid");
});

test("preflight：run-change 三模式在绑定事实齐备时均 allow（角色侧不反对）", () => {
  for (const mode of ["continue-frozen", "stop-and-restart", "stop"]) {
    const decision = check("run-change", { ...RUN_CHANGE_OK, mode, targetTrunkVersion: 3 });
    assert.deepEqual(decision, { allow: true }, mode);
  }
});

test("preflight：run-change 绑定事实逐键缺失均 deny（fail-closed）", () => {
  for (const key of ["mode", "operationId", "runId", "expectedPinDigest", "targetTrunkVersion", "targetTrunkDigest", "reason"] as const) {
    const facts: Record<string, unknown> = { ...RUN_CHANGE_OK };
    delete facts[key];
    const decision = check("run-change", facts);
    assert.equal(decision.allow, false, key);
    assert.equal(decision.allow === false && decision.code, "rapporteur-facts-missing", key);
    assert.deepEqual(decision.allow === false && decision.details, { action: "run-change", factKey: key }, key);
  }
});

test("preflight：run-change 空串/非字符串事实 → facts-invalid", () => {
  for (const key of ["operationId", "runId", "expectedPinDigest", "targetTrunkDigest", "reason"] as const) {
    const decision = check("run-change", { ...RUN_CHANGE_OK, [key]: "   " });
    assert.equal(decision.allow === false && decision.code, "rapporteur-facts-invalid", key);
  }
  const nonString = check("run-change", { ...RUN_CHANGE_OK, runId: 42 });
  assert.equal(nonString.allow === false && nonString.code, "rapporteur-facts-invalid");
});

test("preflight：requirement-change 三种归因键各自可单独成立", () => {
  for (const key of ["flowId", "intentId", "taskId"] as const) {
    const decision = check("requirement-change", { initiatorRoleId: "rapporteur", changeKind: "other", [key]: "ref-1", summary: "s", rationale: "r" });
    assert.deepEqual(decision, { allow: true }, key);
  }
});

test("preflight：requirement-change 归因键存在但为空串 → facts-invalid（不得视作缺失放行）", () => {
  const decision = check("requirement-change", { ...REQUIREMENT_CHANGE_OK, flowId: "   ", intentId: undefined });
  assert.equal(decision.allow === false && decision.code, "rapporteur-facts-invalid");
});

test("preflight：requirement-change 可选字段类型不符 → facts-invalid", () => {
  for (const patch of [{ impact: "" }, { proposedIntentPatch: 1 }, { claimsApproved: "false" }, { selfApproval: 0 }]) {
    const decision = check("requirement-change", { ...REQUIREMENT_CHANGE_OK, ...patch });
    assert.equal(decision.allow, false, JSON.stringify(patch));
    assert.equal(decision.allow === false && decision.code, "rapporteur-facts-invalid");
  }
});

test("preflight：requirement-change claimsApproved/selfApproval=false 明确声明时允许", () => {
  const decision = check("requirement-change", { ...REQUIREMENT_CHANGE_OK, claimsApproved: false, selfApproval: false });
  assert.deepEqual(decision, { allow: true });
});

test("preflight：facts 非普通对象 → facts-invalid（不抛异常）", () => {
  for (const facts of [undefined, null, [], "x", 42]) {
    const decision = preflight!.checkAction({ action: "detail-amendment", facts } as unknown as RolePreflightInput);
    assert.equal(decision.allow === false && decision.code, "rapporteur-facts-invalid");
  }
});

test("preflight：纯函数——不改写输入、同一输入同一结果", () => {
  const input = { action: "requirement-change" as const, facts: Object.freeze({ ...REQUIREMENT_CHANGE_OK }) };
  const snapshot = JSON.stringify(input);
  const first = preflight!.checkAction(input);
  const second = preflight!.checkAction(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), snapshot);
});

test("preflight：deny 的 details 可 JSON 序列化且有界", () => {
  for (const fixtureCase of ORACLE_PREFLIGHT_CASES) {
    const decision = check(fixtureCase.action, fixtureCase.facts);
    const json = JSON.stringify(decision);
    assert.equal(typeof json, "string");
    assert.ok(json.length < 2048);
    assert.equal(json.includes("undefined"), false);
  }
});

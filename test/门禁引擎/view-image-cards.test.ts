// test/门禁引擎/view-image-cards.test.ts
// D 批（2026-10-28）：view_image / 证据是可选项，不是强制质量或验收门槛。
//
// D-03/D-10 要求强制质量/证据基线撤除；本文件按新角色卡语义复核：
//   · 六张内置治理角色卡不得要求必须 view_image、必须真实运行/强制证据或强制验收报告；
//   · 质检卡保留「可选质量核对」与「证据最多真实运行截图」的边界，不要求录屏；
//   · 旧 flow/gate/分诊/产物汇报文本零命中。

import assert from "node:assert/strict";
import { test } from "node:test";

import { BUILT_IN_GOVERNANCE_ROLES } from "../../src/common/门禁引擎/governance-roles.ts";

const cards = BUILT_IN_GOVERNANCE_ROLES.map((role) => ({ id: role.id, text: role.cardText }));

test("D-10：六角色卡不强制 view_image、真实运行、强制证据或强制验收报告", () => {
  for (const { id, text } of cards) {
    for (const forbidden of [
      "必须调用 `view_image`",
      "必须使用 view_image",
      "必须真实运行",
      "必须提供证据",
      "必须提交验收报告",
      "不得建议验收通过",
      "强制证据",
    ]) {
      assert.equal(text.includes(forbidden), false, `${id} 卡不得包含强制项：${forbidden}`);
    }
  }
});

test("D-10：质检卡保留可选质量核对与截图上限，不要求录屏", () => {
  const verifier = cards.find((role) => role.id === "verifier");
  assert.ok(verifier);
  assert.match(verifier!.text, /可选质量核对/);
  assert.match(verifier!.text, /证据最多真实运行截图/);
  assert.match(verifier!.text, /不要求录屏/);
  assert.equal(verifier!.text.includes("不要求录屏，缺录屏不判失败"), true);
});

test("D-03：角色卡不再含 flow/gate/分诊/产物汇报旧机器文本", () => {
  for (const { id, text } of cards) {
    for (const forbidden of ["flow_get", "flow_step_update", "request_acceptance", "request_gate_review", "acceptance-triage", "report_artifact_ready", "gate 复核"]) {
      assert.equal(text.includes(forbidden), false, `${id} 卡不得含旧机器文本：${forbidden}`);
    }
  }
});

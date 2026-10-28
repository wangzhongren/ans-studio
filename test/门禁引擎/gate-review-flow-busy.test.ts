// 门禁引擎测试：gate 复核 `flow-busy` 可重试语义（运营 / Convener 卡文本数据面；2026-10-27 客户要求）
//
// 客户要求：gate 复核「流程仍有在途工作」返回**可重试**的 `flow-busy`（不是 `unavailable`）并告知原因。
// Convener 收到 `flow-busy` 时视为「暂时有在途交付 / 运行轮次 / 回交」，**稍后重试**：
//   · 不得当 gate 失败 / 已派发 / 验收失败；
//   · 不得反复刷请求；
//   · 在途工作结束后再请求同一 gate；
//   · 保留 gate 独立性、不代批、不改 flow 状态、不标 done/failed/delivered。
//
// 本文件只钉住 Convener 卡文本与注册表数据面；运行时返回码实现由运行时核心 / 编排 / 桌面角色负责，
// 不在本角色边界。不新增角色 / FlowStepKind / cardKind / 写权 / 能力位。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILT_IN_GOVERNANCE_ROLES,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";

function assertIncludesAll(text: string, needles: readonly string[], label: string): void {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${label} 须包含「${needle}」`);
  }
}

test("2026-10-27 gate flow-busy：Convener 视为可重试的在途状态，稍后重试、不刷请求、不当 gate 失败/已派发/验收失败", () => {
  const c = governanceRoleOf("convener")!.cardText;

  assertIncludesAll(
    c,
    [
      // 主动请求步骤先提示：在途工作返回可重试的 flow-busy。
      "**若流程仍有在途交付 / 运行轮次 / 回交，应用会返回可重试的 `flow-busy`",
      "稍后重试，不反复刷请求",
      "在途工作结束后再请求同一 gate",
      // 回执条目：可重试 + 原因 + 与 unavailable / gate 失败 / 已派发 / 验收失败区分。
      "`flow-busy`：**可重试**",
      "表示流程仍有在途交付 / 运行轮次 / 回交，gate 复核暂不受理",
      "**不是 `unavailable`、不是 gate 失败、不是已派发、不是验收失败**",
      "按 `message` 了解原因，**稍后重试**",
      "不得反复刷请求",
      "在途工作结束后再 `request_gate_review` 同一 gate",
      // 保留 gate 独立性 / 不代批 / 不改状态。
      "不据此标 gate `done` / `failed` / `delivered`、不代批、不改 flow 状态",
      "gate 步骤的 `done` **只能由应用按 Proof 报告收口**",
      "你不得用 `flow_step_update` 标 gate `done`",
      "不得代写 gate 报告",
    ],
    "Convener gate flow-busy",
  );

  // 反向：不得把 flow-busy 写成失败 / 已派发 / 验收失败 / 不可用 / 需要重派。
  for (const bad of [
    "`flow-busy` 是 gate 失败",
    "`flow-busy` 即已派发",
    "`flow-busy` 即验收失败",
    "`flow-busy` 不可用",
    "`flow-busy` 需要重新派发",
    "`flow-busy` 视为失败",
    "`flow-busy`：如实说明「通道不可用",
  ]) {
    assert.equal(c.includes(bad), false, `Convener 卡不得出现「${bad}」`);
  }
});

test("2026-10-27 gate flow-busy：flow-incomplete 不再把在途工作当缺口，明确指向 flow-busy；两码语义分开", () => {
  const c = governanceRoleOf("convener")!.cardText;

  assertIncludesAll(
    c,
    [
      "`flow-incomplete`：按 `message` 补齐前置 / 证据（依赖未 `done`、账本对不上、证据路径缺失）",
      "不得提前提交、不得用提交代替缺步骤",
      "在途工作属 `flow-busy`，按该条稍后重试",
      // 既有 unavailable 语义保留，且与 flow-busy 分开。
      "`unavailable`：如实说明「通道不可用 / 可能已派发，以 `flow_get` 核对为准」",
      "不盲目重复请求",
    ],
    "Convener flow-incomplete / unavailable",
  );

  // 反向：旧 flow-incomplete 把「有在途工作」列为缺口的文案不得复现。
  assert.equal(
    c.includes("证据路径缺失、有在途工作）"),
    false,
    "flow-incomplete 不得再把在途工作当缺口（应走 flow-busy）",
  );
  assert.equal(
    c.includes("`flow-incomplete`：按 `message` 补齐前置 / 证据（依赖未 `done`、账本对不上、证据路径缺失、有在途工作）"),
    false,
    "旧 flow-incomplete 在途文案不得残留",
  );
});

test("2026-10-27 gate flow-busy：只有 Convener 卡定义该 gate 回执；注册表数据面零变化", () => {
  // gate 复核回执只归运营；其余内置卡不得定义 flow-busy。
  for (const id of ["liaison", "rapporteur", "nominator", "verifier"] as const) {
    assert.equal(
      governanceRoleOf(id)!.cardText.includes("flow-busy"),
      false,
      `${id} 卡不得定义 gate flow-busy 回执`,
    );
  }
  assert.ok(governanceRoleOf("convener")!.cardText.includes("flow-busy"));

  // 不新增 cardKind。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.equal(
      spec.cardText.includes("cardKind=flow-busy"),
      false,
      `${spec.id} 卡不得把 flow-busy 写成 cardKind`,
    );
  }

  // 角色顺序 / Convener 写区 / 能力位（批次 A：六角色身份层；现行旧写区/能力保留到 D）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
  const convener = governanceRoleOf("convener")!;
  assert.deepEqual(convener.entries.map((e) => e.path), [
    "docs/flows/",
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.capabilities, {
    customerInput: true,
    handOffIntent: false,
    requestClarification: false,
    dispatchTask: true,
    roleStatus: true,
    sessionTail: true,
    proposeRecovery: true,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
});

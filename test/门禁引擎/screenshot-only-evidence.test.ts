// 门禁引擎测试：验收证据截图-only（内置治理角色卡文本数据面；2026-10-27 客户新规则）
//
// 客户 2026-10-27 新规则：**验收标准最多要求截图，不能要求录屏**。
//  1. 策划 / 产品 / 运营 / 质检卡及共享原则中，凡是把「录屏」作为验收要求、证据形式、
//     decision 选项或 M1 例子的措辞，全部改为只使用截图；不得要求 / 提供录屏选项；
//     缺少录屏不得判 fail / insufficient evidence。
//  2. 验收 / gate / 交付证据以「真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）」为准；
//     日志 / 输出 / 哈希可辅助。`view_image` 只核对截图，不核对 / 不要求录屏画面。
//  3. 不把「截图 vs 录屏」作为材料缺口示例；改为「截图采集范围 / 截图清单」等非录屏选择。
//     客户未来明确要求录屏时，按独立需求变更处理，不进入默认验收标准。
//
// 本文件只钉住卡文本数据面；不新增角色 / FlowStepKind / cardKind / 写权 / 能力位。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILT_IN_GOVERNANCE_ROLES,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";

const ALL_IDS = ["liaison", "rapporteur", "nominator", "convener", "verifier"] as const;

function assertIncludesAll(text: string, needles: readonly string[], label: string): void {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${label} 须包含「${needle}」`);
  }
}

test("2026-10-27 截图-only：五卡共享基线都写明验收证据最多截图、不得把录屏列为要求/证据形式/decision 选项、缺录屏不判失败", () => {
  for (const id of ALL_IDS) {
    const t = governanceRoleOf(id)!.cardText;
    assertIncludesAll(
      t,
      [
        "验收证据最多截图",
        "真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）",
        "不得把录屏列为验收要求、证据形式或 decision 选项",
        "缺少录屏**不得判 fail / insufficient evidence**",
        "客户未来另行明确要求录屏时，按独立需求变更处理，不进入默认验收标准",
        "日志 / 输出 / 哈希可辅助",
      ],
      `${id} 截图-only 共享基线`,
    );

    // 反向：不得复现旧的「截图 / 录屏」并列要求或录屏选项。
    for (const legacy of [
      "截图或录屏",
      "截图/录屏",
      "截图 / 录屏",
      "录屏（关 DEBUG）",
      "录屏 + 验收标准指针",
      "录屏是否关闭 DEBUG",
      "「截图 vs 录屏」",
      "后截图 / 录屏",
      "截图 / 录屏必须",
      "截图 / 录屏画面",
      "录屏选项",
      "必须录屏",
      "录屏作为证据",
      "录屏作为验收",
    ]) {
      assert.equal(t.includes(legacy), false, `${id} 卡不得出现旧录屏要求「${legacy}」`);
    }
  }
});

test("2026-10-27 截图-only：质检验收/gate/view_image 只核对截图；缺录屏不构成缺失证据、不判失败", () => {
  const v = governanceRoleOf("verifier")!.cardText;
  assertIncludesAll(
    v,
    [
      "只要求截图，不要求录屏，缺少录屏不构成缺失证据",
      "只要求截图，不要求录屏，缺少录屏不得判失败",
      "**截图必须关闭 DEBUG 覆盖层（只要求截图，不要求录屏）**",
      "只核对截图，不核对 / 不要求录屏画面",
      "缺少录屏不影响判断，不得因缺少录屏判 fail / insufficient evidence",
      "UI / 游戏截图仍必须关闭 DEBUG 覆盖层",
      // 既有安全要求保留：不得假看、哈希/候选记录、insufficient evidence 仍针对截图。
      "文件哈希（sha256）",
      "候选版本 / flow revision",
      "不得用「文件存在」冒充看过图",
    ],
    "Proof 截图-only 证据纪律",
  );
  // 反向：录屏不得成为 view_image / gate / 验收的证据形式或失败条件。
  for (const legacy of [
    "截图 / 录屏画面",
    "截图 / 录屏必须",
    "录屏是否关闭 DEBUG",
    "缺少录屏 = insufficient evidence",
  ]) {
    assert.equal(v.includes(legacy), false, `Proof 卡不得出现「${legacy}」`);
  }
});

test("2026-10-27 截图-only：运营派发/证据清单/画面证据只要求截图；缺录屏不是缺证、不判失败", () => {
  const c = governanceRoleOf("convener")!.cardText;
  assertIncludesAll(
    c,
    [
      "真实运行截图（关 DEBUG；记录 sha256 / 候选 / 命令）+ 验收标准指针 + 关 DEBUG 说明；不要求录屏",
      "只要求截图，不要求录屏，缺少录屏不得判失败",
      "只要求截图，不要求录屏，缺少录屏不是缺证",
      "**UI / 游戏必须关闭 DEBUG 覆盖层后截图（只要求截图，不要求录屏）**",
      "`view_image` 只核对截图，不核对 / 不要求录屏画面",
      "缺少录屏不影响判断，不得因缺少录屏判 fail / insufficient evidence",
    ],
    "Steward 截图-only 证据纪律",
  );
  for (const legacy of ["截图 / 录屏画面", "录屏是否关闭 DEBUG", "截图 / 录屏必须"]) {
    assert.equal(c.includes(legacy), false, `Steward 卡不得出现「${legacy}」`);
  }
});

test("2026-10-27 截图-only：产品画面证据只核对截图；M1 材料缺口示例改为截图采集范围/清单，不再用截图 vs 录屏", () => {
  const l = governanceRoleOf("liaison")!.cardText;
  assertIncludesAll(
    l,
    [
      "`view_image` 只核对截图，不核对 / 不要求录屏画面",
      "缺少录屏不影响判断，不得因缺少录屏判 fail / insufficient evidence",
      "截图采集范围 / 截图清单",
      "未决材料缺口卡片先行",
    ],
    "Lead 截图-only 证据纪律",
  );
  assert.equal(l.includes("「截图 vs 录屏」"), false, "Lead 卡不得再用「截图 vs 录屏」材料缺口示例");

  const c = governanceRoleOf("convener")!.cardText;
  assertIncludesAll(
    c,
    ["截图采集范围 / 截图清单", "未决材料缺口必须先发卡"],
    "Steward M1 非录屏示例",
  );
  assert.equal(c.includes("「截图 vs 录屏」"), false, "Steward 卡不得再用「截图 vs 录屏」材料缺口示例");

  // 五卡共享原则也不得再用录屏作为 M1 例子。
  for (const id of ALL_IDS) {
    const t = governanceRoleOf(id)!.cardText;
    assert.equal(t.includes("「截图 vs 录屏」"), false, `${id} 卡不得复现「截图 vs 录屏」`);
    assert.ok(t.includes("截图采集范围 / 截图清单"), `${id} 卡 M1 示例须改为截图采集范围 / 清单`);
  }
});

test("2026-10-27 截图-only：数据面零变化（角色顺序 / 能力位 / cardKind 白名单不变）", () => {
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
  );
  const allowedCardKinds = new Set([
    "intent-confirm",
    "proposal",
    "appointment-write",
    "appointment",
    "decision",
    "schedule-write",
    "write",
    "acceptance",
  ]);
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    for (const match of spec.cardText.matchAll(/cardKind=([a-z-]+)/g)) {
      assert.ok(
        allowedCardKinds.has(match[1]!),
        `${spec.id} 卡出现未登记 cardKind=${match[1]}`,
      );
    }
  }
  const expectedCapabilityKeys = [
    "customerInput",
    "dispatchTask",
    "handOffIntent",
    "installMcp",
    "installSkill",
    "proposeRecovery",
    "requestClarification",
    "roleStatus",
    "sessionTail",
    "shell",
  ].sort();
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.deepEqual(
      Object.keys(spec.capabilities).sort(),
      expectedCapabilityKeys,
      `${spec.id} 能力位不得新增`,
    );
  }
});

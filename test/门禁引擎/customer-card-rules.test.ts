// 门禁引擎测试：客户卡化与代理开关纪律（内置治理角色卡文本数据面；2026-10-27 客户新规则）
//
// 客户 2026-10-27 新规则：
//  1. 任何需要客户确认 / 选择的问题都必须以卡呈现（`request_confirmation` 确认 / 取消，
//     `request_choice` 单选 / 多选 / decision），不能在聊天里让客户口头回答；禁止
//     「请回复 / 请口头选 / 回复 1/2 / 不选默认同意」；沉默、未回复、默认勾选、既有做法、
//     其他角色转述、推荐项都不能当客户确认 / 选择。
//  2. 代理开关按应用现状：`request_confirmation` ←「替我审批」；`request_choice` / decision ←
//     「替我决策」；两个都关 = 客户本人；代理只能按卡内唯一 `recommended: true` 或已发选项
//     处理，不能自造 / 改选项；代理不可用 / 失败 / 超时 / deny ⇒ 回落客户，fail-closed。
//  3. 产品 / 运营发现未决材料缺口（如提案 §5 M1 的「截图采集范围 / 截图清单」证据形式）必须在依赖步骤前
//     发 decision 卡（唯一推荐项）；没有卡或客户未决不得推进该依赖步骤，不能自己定。
//  4. 质检的 `report_artifact_ready` 是向应用汇报工件就绪，不是客户确认 / 选择卡；保持应用决定。
//
// 本文件只钉住卡文本数据面与注册表数据面；不新增角色 / FlowStepKind / cardKind / 写权 /
// 判定逻辑，不改工具 / 桌面 / 运行时 / 编排 / PM / i18n。

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

test("2026-10-27 客户卡化：五张内置治理卡都要求确认/选择必须用客户卡，禁止聊天口头回答与默认同意", () => {
  for (const id of ALL_IDS) {
    const t = governanceRoleOf(id)!.cardText;
    assertIncludesAll(
      t,
      [
        "客户卡化纪律（客户 2026-10-27 新规则，必须）",
        "任何需要客户确认 / 选择的问题都必须以客户卡呈现",
        "`request_confirmation`（确认 / 取消）",
        "`request_choice`（单选 / 多选 / decision 卡）",
        "不得在聊天里让客户口头回答",
        "禁止「请回复」「请口头选」「回复 1/2」「不选默认同意」等问法",
        "不得把沉默、未回复、默认勾选、既有做法、其他角色转述或推荐项当作客户确认 / 选择",
        "本卡白名单以外的确认 / 选择",
        "不得自造卡型或自行决定",
        "交有对应权限的角色发卡",
      ],
      `${id} 客户卡化`,
    );

    // 反向：不得出现「让客户在聊天里回复即可 / 默认同意」的肯定式指令。
    for (const bad of [
      "请客户在聊天里回复",
      "让客户口头回答即可",
      "不回复视为同意",
      "未回复即同意",
      "默认视为同意",
      "推荐项即客户已选",
    ]) {
      assert.equal(t.includes(bad), false, `${id} 卡不得出现「${bad}」肯定式表述`);
    }
  }
});

test("2026-10-27 代理开关：request_confirmation ←替我审批、request_choice/decision ←替我决策；都关=客户本人；唯一推荐/已发选项，失败回落客户 fail-closed", () => {
  for (const id of ALL_IDS) {
    const t = governanceRoleOf(id)!.cardText;
    assertIncludesAll(
      t,
      [
        "`request_confirmation` 由客户「替我审批」开关代理",
        "`request_choice` / decision 卡由客户「替我决策」开关代理",
        "两个开关都关时由客户本人作答",
        "唯一 `recommended: true`",
        "已发选项",
        "不得自造选项",
        "不得改选项",
        "不得把推荐项说成客户本人选择",
        "代理开启但不可用 / 失败 / 超时 / deny",
        "回落客户",
        "fail-closed",
        "不得按默认同意或自行推进",
        "不得把推荐项 / 沉默 / 未反对当已选",
      ],
      `${id} 代理开关`,
    );
  }
});

test("2026-10-27 M1 前卡：产品发现未决材料缺口（提案 §5 M1 截图采集范围 / 截图清单）必须交运营发 decision 卡（唯一推荐），没有卡/未决不得推进依赖步骤", () => {
  const l = governanceRoleOf("liaison")!.cardText;
  assertIncludesAll(
    l,
    [
      "未决材料缺口卡片先行（M1 等，必须）",
      "提案 §5 M1",
      "截图采集范围 / 截图清单",
      "依赖步骤（如 M1 实现 / 验收证据步骤）前",
      "交 运营 / Steward 发 decision 卡",
      "唯一推荐项",
      "没有卡或客户未决时不得推进该依赖步骤",
      "不得自己定",
      "不得在聊天里问客户",
      "不得把推荐项 / 沉默 / 未反对当客户已选",
      // 内部决策纪律同步：未决材料缺口不属于内部决策。
      "未决材料缺口同理",
    ],
    "Lead M1 前卡",
  );
});

test("2026-10-27 M1 前卡：运营发现未决材料缺口必须在依赖步骤前发 decision 卡（恰好一个 recommended），没有卡/未决不得派发或推进", () => {
  const c = governanceRoleOf("convener")!.cardText;
  assertIncludesAll(
    c,
    [
      "未决材料缺口必须先发卡（M1 等，必须）",
      "提案 §5 M1",
      "截图采集范围 / 截图清单",
      "在依赖步骤（M1 实现 / 验收证据步骤）前",
      "`request_choice`（`cardKind=decision`、`flowId` 必填）",
      "`options` 真实可选、彼此可区分",
      "恰好一个",
      "`recommended: true`",
      "不得自己定、不得在聊天里问客户、不得先把事做了再补卡",
      "没有卡或客户 / 判断 agent 未决时，不得推进该依赖步骤",
      "不得把推荐项、沉默、未反对或「产品已转达」当客户已选",
      // 派发前机械核对（标准工作流第 5 步）。
      "派发前核对未决材料缺口（M1 等）",
      "没有卡或未决不得派发 / 推进该依赖步骤",
    ],
    "Steward M1 前卡",
  );
});

test("2026-10-27 质检：report_artifact_ready 是向应用汇报，不是客户确认/选择卡；客户确认仍走卡，不把 accepted 当客户确认", () => {
  const v = governanceRoleOf("verifier")!.cardText;
  assertIncludesAll(
    v,
    [
      "`report_artifact_ready` 是向应用汇报工件就绪，不是客户确认 / 选择卡",
      "不代替客户决定",
      "是否收口由应用决定",
      "需要客户确认 / 选择时仍按本卡白名单发卡（或交有权限角色发卡）",
      "不得在聊天里请客户口头回答",
      "不得把应用 `accepted` 当客户确认",
    ],
    "Proof report_artifact_ready 非客户卡",
  );
  for (const bad of [
    "report_artifact_ready 即客户确认",
    "report_artifact_ready 即验收通过",
    "accepted 即客户同意",
    "accepted 即客户批准",
  ]) {
    assert.equal(v.includes(bad), false, `Proof 卡不得出现「${bad}」`);
  }
});

test("2026-10-27 客户卡化：注册表数据面零变化；不新增角色 / cardKind / 能力位 / 写权", () => {
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
  );

  // cardKind 白名单不扩散：卡文本只出现既有值；新增 cardKind 会在此失败。
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
    const found = [...spec.cardText.matchAll(/cardKind=([a-z-]+)/g)].map((m) => m[1]!);
    for (const kind of found) {
      assert.ok(allowedCardKinds.has(kind), `${spec.id} 卡出现未登记 cardKind=${kind}`);
    }
  }

  // 能力位不新增（同一组既有键；shell 档不变）。
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
    assert.equal(spec.capabilities.shell, "operator-approve", `${spec.id} shell 档不变`);
  }

  // 写权 / 角色顺序不变：Proof 仍只写三目录（其余角色既有断言由其他测试覆盖）。
  const verifier = governanceRoleOf("verifier")!;
  assert.deepEqual(verifier.entries.map((e) => e.path), [
    "docs/acceptance/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]);
  assert.deepEqual(verifier.preauthorizedDirs, [
    "docs/acceptance/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]);
  assert.equal(verifier.capabilities.dispatchTask, false);
});

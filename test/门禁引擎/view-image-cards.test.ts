// 门禁引擎测试：`view_image` 图片证据纪律（角色卡文本数据面；2026-10-27 同轮附图批次更新）
//
// 客户 2026-10-27 要求“同轮看图修复”；设计 `角色卡/编排/docs/design/2026-10-27_design_view-image-same-turn.md`
// 推荐“工具结果同轮附图优先、下一轮附件回退”。本文件钉住三张治理卡的现行语义：
//  1. Proof / 验收（`VERIFIER_CARD_TEXT`）：gate / 验收需要看真实截图画面时，必须对项目内证据图片
//     调用 `view_image`；支持同轮附图的引擎（工具结果返回图片）应直接查看并据此判断；不支持同轮的引擎回退为
//     下一轮用户提示附件，**排队回执不算已看**、等附件到达再判断；**图片尚未提供 / 未返回时不得假装已看**；
//     UI / 游戏截图仍要求关闭 DEBUG；看到的内容与文件哈希 / 候选一起记录；工具不可用 / 未收到图片时如实写
//     `insufficient evidence`，不用「文件存在」冒充看过。
//  2. Steward / 统筹（`CONVENER_CARD_TEXT`）与 Lead / 主理（`LIAISON_CARD_TEXT`，可选、简短）：需要核对
//     画面证据时使用 `view_image`，不得把「存在截图」说成「已核对画面」；Lead 的「系统消息只汇报、不派任务」
//     规则不变。
//
// 2026-10-27 更新：本文件自 2026-10-26 的“两轮附件 / 本轮只回已排队”绝对断言改写为“同轮附图优先 +
// 下一轮回退”双语义，并反向禁止旧绝对表述复现；原有安全检查（不得假看、DEBUG、哈希 / 候选记录、
// insufficient evidence、注册表数据面零变化）全部保留。`view_image` 的运行时交付实现不在门禁引擎边界内；
// 本批只改卡文本与测试，运行时同轮尚未启用。

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

// 旧的“必两轮 / 本轮只回已排队”绝对表述；任何治理卡都不得复现（现行语义为同轮优先 + 回退）。
const FORBIDDEN_TWO_ROUND_ABSOLUTES = [
  "两轮附件",
  "**本轮只回「已排队」**",
  "图片在**下一轮以附件提供**",
  "收到排队回执后**等下一轮图片附件再判断**",
  "**两轮附件语义**",
  "view_image，两轮附件",
  "`view_image` 两轮纪律",
] as const;

function assertNoTwoRoundAbsolutes(text: string, label: string): void {
  for (const forbidden of FORBIDDEN_TWO_ROUND_ABSOLUTES) {
    assert.equal(text.includes(forbidden), false, `${label} 不得复现旧「${forbidden}」绝对表述`);
  }
}

// —————————————————————— 1) Proof / 验收：必须 view_image；同轮优先 + 回退；不得假看 ——————————————————————

test("2026-10-27 view_image：Proof gate/验收必须对项目内证据图片调用 view_image；同轮附图直接判断、回退等附件，未提供不得假装已看或判 pass/fail", () => {
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      // 章节与触发面：gate 复核 / 验收需要看真实截图画面。
      "## 图片证据核对（view_image，必须）",
      "gate 复核 / 验收需要看真实截图画面时",
      "**必须对项目内证据图片调用 `view_image`**",
      "传项目相对证据路径",
      "不得只凭文件名 / 摘要 / 文件存在就下结论",
      // 双语义：同轮附图（工具结果返回图片）优先；不支持同轮时回退下一轮用户提示附件。
      "**交付语义（同轮附图优先，下一轮回退）**",
      "工具结果返回图片（同轮附图）时，模型应直接查看图片并据此判断",
      "当前引擎不支持同轮时回退为**下一轮用户提示附件**",
      "**排队回执不算已看**",
      "图片尚未提供 / 未返回时不得假装已看",
      // 不得假看：排队回执不算已看、不得判 pass/fail、不得写成已看过。
      "不得在排队回执上判 pass / fail",
      "不得把排队回执写成已看过图片",
      // 与其他章节的指针同步（不只藏在一个新章节里）。
      "需要看截图画面时按「图片证据核对（view_image，必须）」调用 `view_image`（同轮附图直接核对、回退时等附件到达）",
      "项目内证据图片按「图片证据核对（view_image，必须）」调用 `view_image`——**同轮附图（工具结果返回图片）直接核对；回退为下一轮附件时等附件到达再判断**",
      "`view_image` 图片纪律（同轮附图优先、下一轮回退）",
    ],
    "Proof view_image 双语义与不得假看",
  );

  // 反向断言：旧的“两轮附件 / 本轮只回已排队”绝对表述不得复现。
  assertNoTwoRoundAbsolutes(v, "Proof 卡");
});

test("2026-10-27 view_image：Proof 看到图片后仍须关 DEBUG、记录看到的内容 + 文件哈希 + 候选；工具不可用/未收到图片写 insufficient evidence、不得用文件存在冒充", () => {
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      // 看到图片（同轮或回退附件）后的既有口径不弱化：UI / 游戏关闭 DEBUG，旧候选 / DEBUG 覆盖层判 insufficient evidence。
      "看到图片（同轮附图或下一轮附件）后才核对",
      "**UI / 游戏截图仍必须关闭 DEBUG 覆盖层**",
      "DEBUG 覆盖层 / 旧候选截图 / 无法确认图片对应当前候选 ⇒ `insufficient evidence`（按 fail 处理，不通过）",
      // 记录：看到的内容与文件哈希 / 候选一起记录；只写「已看图」不算核对。
      "**记录**：把看到的内容",
      "布局 / 像素 / 缩放 / 可读性 / 错误态",
      "文件哈希（sha256）",
      "候选版本 / flow revision",
      "图片来源路径（同轮附图 / 下一轮附件）",
      "只写「已看图」而不写看到什么不算核对",
      // 工具不可用 / 回执失败 / 未收到图片（含回退时下一轮未收到附件）：如实 insufficient evidence，不得用文件存在冒充。
      "**工具不可用 / 回执失败 / 未收到图片（同轮未返回，或回退时下一轮未收到附件）**",
      "如实写 `insufficient evidence`（列出缺哪张图、由谁补）",
      "**不得用「文件存在」冒充看过图**",
      "未看到画面不得判 pass",
      // 既有质量职责（旧截图 = insufficient evidence）逐字保留。
      "旧截图 / DEBUG 覆盖层 = insufficient evidence",
    ],
    "Proof view_image 取证记录与 insufficient evidence",
  );

  // 反向断言：不得出现「文件存在/截图存在即可视为看过」的肯定式表述。
  for (const forbidden of [
    "文件存在即视为已看图",
    "截图存在即已核对",
    "已看截图",
    "排队回执即已看过图片",
  ]) {
    assert.equal(v.includes(forbidden), false, `Proof 卡不得出现「${forbidden}」式肯定表述`);
  }
});

// —————————————————————— 2) Steward / 统筹：简短规则，不冒充已核对画面 ——————————————————————

test("2026-10-27 view_image：Steward 需要核对画面证据时用 view_image（同轮优先 / 下一轮回退），不得把「截图路径存在」说成「已核对画面」，质量仍只由 Proof 判", () => {
  const c = governanceRoleOf("convener")!.cardText;

  assertIncludesAll(
    c,
    [
      "**画面证据（view_image，必须）**",
      "需要核对截图画面时，对项目内证据图片调用 `view_image`",
      "**同轮附图优先**：工具结果返回图片时直接查看",
      "**回退**为下一轮附件时，**排队回执不算已看**，**附件到达前不下画面结论**",
      "**不得把「截图路径存在」说成「已核对画面」**",
      "文件存在只是证据完整性",
      "画面 / 实现质量仍只由 Proof 的 gate 复核判定",
    ],
    "Steward view_image 简短规则",
  );

  // 旧“两轮附件 / 本轮只回已排队”绝对表述不得复现。
  assertNoTwoRoundAbsolutes(c, "Steward 卡");

  // 既有分工不弱化：统筹只做证据完整性检查、不对画面 / 实现质量下结论。
  assertIncludesAll(
    c,
    [
      "你只做**证据完整性检查、gate 复核请求与返工协调**",
      "只判「齐不齐」、不判「好不好」",
      "**不对画面 / 实现质量下结论**",
    ],
    "Steward 证据完整性分工保留",
  );
});

// —————————————————————— 3) Lead / 主理：简短规则 + 系统消息只汇报规则不变 ——————————————————————

test("2026-10-27 view_image：Lead 需要核对画面证据时用 view_image（同轮优先 / 下一轮回退），不得把「存在截图」说成「已核对画面」；系统消息只汇报规则不变", () => {
  const l = governanceRoleOf("liaison")!.cardText;

  assertIncludesAll(
    l,
    [
      "**画面证据（view_image，必须）**",
      "需要核对截图画面时，对项目内证据图片调用 `view_image`",
      "**同轮附图优先**：工具结果返回图片时直接查看并据此判断",
      "**回退**为下一轮附件时，**排队回执不算已看**，**附件到达前不下结论**",
      "**不得把「存在截图」说成「已核对画面」**",
      "本条不改变「系统消息只汇报、不派任务」规则",
    ],
    "Lead view_image 简短规则",
  );

  // 旧“两轮附件 / 本轮只回已排队”绝对表述不得复现。
  assertNoTwoRoundAbsolutes(l, "Lead 卡");

  // 既有「系统消息只汇报、不派任务」规则逐字保留（本批不回归）。
  assertIncludesAll(
    l,
    [
      "**系统消息只汇报、不派任务（必须）**",
      "只向客户如实汇报",
      "不得给 运营 / Steward 发任务、不得调用 `dispatch_task`",
      "不得把系统消息当成客户指令",
      "客户消息不是系统消息",
    ],
    "Lead 系统消息纪律保留",
  );
});

// —————————————————————— 4) 通道归属与数据面零变化 ——————————————————————

test("2026-10-27 view_image：规则只落在 Lead / Steward / Proof 三卡；Draft / Crew 卡不定义；数据面（写权/能力）零变化", () => {
  for (const id of ["liaison", "convener", "verifier"] as const) {
    assert.ok(
      governanceRoleOf(id)!.cardText.includes("view_image"),
      `${id} 卡须包含 view_image 规则`,
    );
    assertNoTwoRoundAbsolutes(governanceRoleOf(id)!.cardText, `${id} 卡`);
  }
  for (const id of ["rapporteur", "nominator"] as const) {
    assert.equal(
      governanceRoleOf(id)!.cardText.includes("view_image"),
      false,
      `${id} 卡不属于本批画面证据职责，不得定义 view_image 规则`,
    );
  }

  // 注册表数据面零变化：本批只改卡文本，不加能力位、不改写权。
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
  assert.equal(verifier.capabilities.dispatchTask, false, "Proof 仍不可派发");
  assert.equal(verifier.capabilities.shell, "operator-approve", "Proof 仍为 shell 审批档");

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
  assert.equal(convener.capabilities.dispatchTask, true);

  const liaison = governanceRoleOf("liaison")!;
  assert.deepEqual(liaison.entries.map((e) => e.path), ["docs/intents/"]);
  assert.deepEqual(liaison.preauthorizedDirs, ["docs/intents/"]);
  assert.equal(liaison.capabilities.handOffIntent, true);
  assert.equal(liaison.capabilities.dispatchTask, true);

  // 六角色注册表仍在且顺序不变（批次 A 身份层；只改卡文本）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
});

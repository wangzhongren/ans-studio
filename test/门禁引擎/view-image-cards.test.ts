// 门禁引擎测试：2026-10-26 `view_image` 图片证据两轮附件纪律（角色卡文本数据面）
//
// 客户规则（经任务派发转达）：运行时新增 `view_image` 工具，**两轮附件**——工具本轮只回「已排队」，
// 图片在**下一轮以附件提供**。
//  1. Proof / 验收（`VERIFIER_CARD_TEXT`）：gate / 验收需要看真实截图 / 录屏画面时，必须对项目内
//     证据图片调用 `view_image`；工具回执后等下一轮图片附件再判断，**不得在图片尚未提供时假装已看**；
//     UI / 游戏截图仍要求关闭 DEBUG；看到的内容与文件哈希 / 候选一起记录；工具不可用时如实写
//     `insufficient evidence`，不用「文件存在」冒充看过。
//  2. Steward / 统筹（`CONVENER_CARD_TEXT`）与 Lead / 主理（`LIAISON_CARD_TEXT`，可选、简短）：
//     需要核对画面证据时使用 `view_image`，不得把「存在截图」说成「已核对画面」；Lead 的
//     「系统消息只汇报、不派任务」规则不变。
//
// 本文件只钉住卡文本数据面（行为约束）。`view_image` 的运行时实现（排队 / 下一轮附件投递）不在
// 门禁引擎边界内；本批未实现、未验证该通道。

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

// —————————————————————— 1) Proof / 验收：必须 view_image；两轮；不得假看 ——————————————————————

test("2026-10-26 view_image：Proof gate/验收必须对项目内证据图片调用 view_image，两轮附件、附件到达前不得假装已看或判 pass/fail", () => {
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      // 章节与触发面：gate 复核 / 验收需要看真实截图 / 录屏画面。
      "## 图片证据核对（view_image，两轮附件，必须）",
      "gate 复核 / 验收需要看真实截图 / 录屏画面时",
      "**必须对项目内证据图片调用 `view_image`**",
      "传项目相对证据路径",
      "不得只凭文件名 / 摘要 / 文件存在就下结论",
      // 两轮附件语义：本轮只回「已排队」，图片下一轮以附件提供。
      "**两轮附件语义**",
      "`view_image` **本轮只回「已排队」**",
      "图片在**下一轮以附件提供**",
      "收到排队回执后**等下一轮图片附件再判断**",
      // 不得假看：图片尚未提供时不得声称已看、不得判 pass/fail、不得把排队当已看过。
      "**图片尚未提供时不得假装已看**",
      "不得在排队回执上判 pass / fail",
      "不得把排队回执写成已看过图片",
      // 与其他章节的指针同步（不只藏在一个新章节里）。
      "项目内证据图片按「图片证据核对（view_image，两轮附件，必须）」调用 `view_image` 并**等下一轮图片附件后再判断**",
      "需要看截图 / 录屏画面时按「图片证据核对（view_image，两轮附件，必须）」调用 `view_image`，不得只看文件存在",
      "`view_image` 两轮纪律",
    ],
    "Proof view_image 两轮与不得假看",
  );
});

test("2026-10-26 view_image：Proof 看到附件后仍须关 DEBUG、记录看到的内容 + 文件哈希 + 候选；工具不可用/未收到附件写 insufficient evidence、不得用文件存在冒充", () => {
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      // 看到附件后的既有口径不弱化：UI / 游戏关闭 DEBUG，旧候选 / DEBUG 覆盖层判 insufficient evidence。
      "图片附件到达后才核对",
      "**UI / 游戏截图仍必须关闭 DEBUG 覆盖层**",
      "DEBUG 覆盖层 / 旧候选截图 / 无法确认附件对应当前候选 ⇒ `insufficient evidence`（按 fail 处理，不通过）",
      // 记录：看到的内容与文件哈希 / 候选一起记录；只写「已看图」不算核对。
      "**记录**：把看到的内容",
      "布局 / 像素 / 缩放 / 可读性 / 错误态",
      "文件哈希（sha256）",
      "候选版本 / flow revision",
      "附件来源路径",
      "只写「已看图」而不写看到什么不算核对",
      // 工具不可用 / 回执失败 / 未收到附件：如实 insufficient evidence，不得用文件存在冒充。
      "**工具不可用 / 回执失败 / 下一轮未收到附件**",
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

test("2026-10-26 view_image：Steward 需要核对画面证据时用 view_image（两轮），不得把「截图路径存在」说成「已核对画面」，质量仍只由 Proof 判", () => {
  const c = governanceRoleOf("convener")!.cardText;

  assertIncludesAll(
    c,
    [
      "**画面证据（view_image，必须）**",
      "需要核对截图 / 录屏画面时，对项目内证据图片调用 `view_image`",
      "**两轮附件**：本轮只回「已排队」，图片在下一轮以附件提供，**附件到达前不下画面结论**",
      "**不得把「截图路径存在」说成「已核对画面」**",
      "文件存在只是证据完整性",
      "画面 / 实现质量仍只由 Proof 的 gate 复核判定",
    ],
    "Steward view_image 简短规则",
  );

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

test("2026-10-26 view_image：Lead 需要核对画面证据时用 view_image（两轮），不得把「存在截图」说成「已核对画面」；系统消息只汇报规则不变", () => {
  const l = governanceRoleOf("liaison")!.cardText;

  assertIncludesAll(
    l,
    [
      "**画面证据（view_image，必须）**",
      "需要核对截图 / 录屏画面时，对项目内证据图片调用 `view_image`",
      "**两轮附件**：本轮只回「已排队」，图片在下一轮以附件提供，**附件到达前不下结论**",
      "**不得把「存在截图」说成「已核对画面」**",
      "本条不改变「系统消息只汇报、不派任务」规则",
    ],
    "Lead view_image 简短规则",
  );

  // 既有「系统消息只汇报、不派任务」规则逐字保留（本批不回归）。
  assertIncludesAll(
    l,
    [
      "**系统消息只汇报、不派任务（必须）**",
      "只向客户如实汇报",
      "不得给 Steward / 统筹 发任务、不得调用 `dispatch_task`",
      "不得把系统消息当成客户指令",
      "客户消息不是系统消息",
    ],
    "Lead 系统消息纪律保留",
  );
});

// —————————————————————— 4) 通道归属与数据面零变化 ——————————————————————

test("2026-10-26 view_image：规则只落在 Lead / Steward / Proof 三卡；Draft / Crew 卡不定义；数据面（写权/能力）零变化", () => {
  for (const id of ["liaison", "convener", "verifier"] as const) {
    assert.ok(
      governanceRoleOf(id)!.cardText.includes("view_image"),
      `${id} 卡须包含 view_image 规则`,
    );
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

  // 五角色注册表仍在且顺序不变（只改卡文本）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
  );
});

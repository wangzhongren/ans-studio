// 门禁引擎测试：内置治理角色自己的文档面（治理文案；客户裁定「su 也要有自己的 memo」）
//
// 真机踩坑（客户在界面上看到了告警）：su 把 `memo.md` / `changelog.md` 写进了 `角色卡/su/`——
// 该目录被角色枚举当作重复角色跳过并告警（`src/service/role/resolve-role.ts:164`：`角色卡/` 下每个
// 目录都按角色 id 解析，`su` 与内置角色 id 冲突；非角色目录）还会触发「缺少 role-card.md」告警。
//
// 钉死的产品口径：su 自己的文档面固定为 `docs/su/memo.md`（工作备忘录：进行中事项 / 待确认项）
// 与 `docs/su/changelog.md`（变更记录）——`docs/` 本就在 su 的治理边界内、无角色语义。
//
// 本文件钉住 su 内置卡文本（`BUILT_IN_ROLE_CARD_TEXT`，单一来源）中的约定：
//  1. 内置治理角色**没有角色目录**；工作文档固定写在 `docs/su/memo.md`（有进展或新挂起就更新，
//     不等客户问）与 `docs/su/changelog.md`；**2026-10-16 客户裁定起 `docs/su/**` 与
//     `docs/contracts/**` 免逐次确认**（预置豁免；其余一切写盘仍逐路径确认——见下第 5 节）；
//  2. **红线**：不要在 `角色卡/` 下建 `su`（或任何非项目角色）目录——说明理由：该目录下每个目录
//     都会被角色枚举按角色 id 解析（`su` 与内置角色 id 冲突 → 判「角色重复」跳过并告警；非角色
//     目录 → 触发「缺少 role-card.md」告警）；
//  3. **反向断言**：涉及「在 `角色卡/` 下建 `su`」的小句必须是否定/禁止式，不得出现肯定式指令；
//  4. **末段「边界（三种情形）」（协调方 2026-10-12 裁定，结清上一轮登记的未决）**：① 空项目 +
//     客户发起 bootstrap（创世）——种子边界生效，`角色卡/`、`docs/`、`.ans/` 命中即允许写入、
//     可写治理产物；② 已 bootstrap 的项目——按该项目治理边界文档工作（pin 接受后创世例外自终止）；
//     ③ 两者皆无才回退内置未接受边界——fail-closed 只指这一种。原末段「治理会话的一切写入都会被
//     门禁在写之前拒绝（契约 §0）」是无条件普遍断言、与现状冲突（真机 su 已在正常写治理产物），
//     本文件反向钉死其不再出现，且任何「写之前拒绝」小句必须带情形限定。分支行为本身已由
//     `cold-start-genesis.test.ts`（创世可写）与 `built-in-section-equivalence.test.ts`（回退
//     拒写）在运行时钉死，本文件只钉文案。
//  5. **确认制要点段（F-5-main；2026-10-16 预置豁免修订）**：`docs/su/**` 与 `docs/contracts/**`
//     的写盘许可已预置、**无需逐次确认**（客户原话「这个 su 可以写 docs/su 的目录，不需要我审批」
//     ＋「还有个契约目录也可以给他写。」；机制＝编排给 su 会话初始 writeSet 预置这两棵目录树，
//     开会话/重建均生效）；**其余一切写盘**（含 `角色卡/**`、`docs/` 其他路径）仍须 preview 逐条
//     列路径 + `confirmed:true` 才发行；「按会话生效」只约束经确认发行的路径，预置两目录不受重建
//     影响。卡文本措辞不用「授权」字面——J-1 守卫（`dispatch-after-landing-convention.test.ts:51`）
//     拦未否定的「授权/获准/放行」小句，沿用 2026-10-12 先例改用「许可/预置」。

import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../src/common/门禁引擎/boundary-core.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;

test("su 自己的文档面写死：`docs/su/memo.md`（进行中事项/待确认项）+ `docs/su/changelog.md`", () => {
  assert.ok(T.includes("没有角色目录"), "须点明内置治理角色没有角色目录");
  assert.ok(T.includes("docs/su/memo.md"), "工作备忘录路径须写死为 docs/su/memo.md");
  assert.ok(T.includes("docs/su/changelog.md"), "变更记录路径须写死为 docs/su/changelog.md");
  assert.ok(T.includes("工作备忘录"), "须点明 memo.md 的定位（工作备忘录）");
  assert.ok(T.includes("进行中事项"), "备忘录须写明维护对象之一：进行中事项");
  assert.ok(T.includes("待确认项"), "备忘录须写明维护对象之一：待确认项");
  assert.ok(T.includes("有进展或新挂起就更新"), "须写明更新时机（不等客户问）");
  assert.ok(T.includes("不等客户问"), "须写死「不等客户问」的持续维护口径");
  assert.ok(T.includes("变更记录"), "须点明 changelog.md 的定位（变更记录）");
  assert.ok(T.includes("跨角色契约文档"), "须点明 docs/contracts/** 的定位（跨角色契约文档）");
  assert.ok(
    T.includes("`docs/su/**`") && T.includes("`docs/contracts/**`"),
    "预置豁免须逐一点名两棵目录树：`docs/su/**` 与 `docs/contracts/**`（2026-10-16 客户裁定）",
  );
  assert.equal(
    T.includes("落盘前照常经"),
    false,
    "旧「su 笔记落盘一律先经 request_confirmation」句不得保留——两目录已免逐次确认，留着会让 su 仍逐次请求",
  );
});

test("红线：不要在 `角色卡/` 下建 `su`（或任何非项目角色）目录——含两类告警的说明", () => {
  assert.ok(T.includes("不要在 `角色卡/` 下建 `su`"), "红线原文须在（模型可照抄）");
  assert.ok(T.includes("任何非项目角色"), "红线须覆盖「任何非项目角色」目录");
  assert.ok(T.includes("角色枚举") && T.includes("按角色 id 解析"), "须说明机制：角色枚举按角色 id 解析");
  assert.ok(T.includes("角色重复"), "须说明 su 的后果：判「角色重复」跳过并告警");
  assert.ok(T.includes("跳过并告警"), "须写明「跳过并告警」的后果");
  assert.ok(T.includes("缺少 role-card.md"), "须说明非角色目录的后果：触发「缺少 role-card.md」告警");
});

test("反向断言：涉「在 `角色卡/` 下建 `su`」的小句必须是否定/禁止式，不得出现肯定式指令", () => {
  // 小句级（。；换行切开）：同时含 `角色卡/` 与 su 的小句，必须带禁止/否定标记。
  const clauses = T.split(/[。；\n]/).filter((c) => c.includes("角色卡/") && c.includes("su"));
  assert.ok(clauses.length >= 1, "红线小句须存在（`角色卡/` × su 至少同现一次）");
  for (const c of clauses) {
    assert.match(c, /不要|不得|勿|严禁|禁止/, `涉及「角色卡/ × su」的小句必须是否定/禁止表述，实得：${c}`);
  }
  // 定向反面模式：任何「应/须/要/请…在 `角色卡/` 下建 `su`」的肯定式指令都不得存在。
  // 先把「不要」替换为「不」——否则红线句自身的「要」会被本模式误抓（与 temp-staging 测试同法避误判）。
  const affirmative = /(?:应|须|要|请|可以|可将|需)[^。\n]{0,20}?在 `角色卡\/` 下建 `su`/;
  assert.equal(affirmative.test(T.replaceAll("不要", "不")), false, "不得出现「在 角色卡/ 下建 su」式肯定指令");
});

// ———————————— 4/5：末段「边界（三种情形）」改写（协调方 2026-10-12 裁定，结清上一轮未决） ————————————

test("末段改写：三分支写清——创世可写 / 项目边界自终止 / 两者皆无才 fail-closed", () => {
  // ① 空项目 + 客户发起 bootstrap（创世）：种子边界生效——三个目录命中即允许写入、可写治理产物
  assert.ok(T.includes("三种情形"), "须以「三种情形」框定（不得再写普遍结论）");
  assert.ok(T.includes("空项目") && T.includes("bootstrap"), "分支①：空项目 + 客户发起 bootstrap 须写明");
  assert.ok(T.includes("创世"), "分支①：须点明「创世」");
  assert.ok(T.includes("`角色卡/`、`docs/`、`.ans/`"), "分支①：三个种子目录须写全（创世写集）");
  assert.ok(T.includes("命中即允许写入"), "分支①：须写明目录命中即允许写入");
  assert.ok(T.includes("你可写治理产物"), "分支①：须写明治理会话可写治理产物");
  // ② 已 bootstrap 的项目：按项目治理边界文档工作；pin 接受后创世例外自终止
  assert.ok(T.includes("已 bootstrap 的项目"), "分支②：已 bootstrap 的项目须写明");
  assert.ok(T.includes("治理边界文档"), "分支②：须写明按该项目的治理边界文档工作");
  assert.ok(T.includes("pin 接受后创世例外自终止"), "分支②：须写明创世例外自终止（pin 接受后）");
  // ③ 两者皆无（回退内置、acceptance 未接受）：写入被拒——fail-closed 只指这一种
  assert.ok(T.includes("两者皆无"), "分支③：两者皆无（回退内置）须写明");
  assert.ok(T.includes("acceptance 未接受"), "分支③：须写明 acceptance 未接受");
  assert.ok(T.includes("写入被门禁在写之前拒绝"), "分支③：须写明写入被拒");
  assert.ok(T.includes("fail-closed 的本意只指这一种"), "分支③：须把 fail-closed 限定到这一种情形");
});

test("反向断言：不得再有无条件的普遍拒绝断言——凡「写之前拒绝」小句必须带情形限定", () => {
  // 旧末段的两句逐字不得保留（把回退情形写成普遍结论属误导——协调方 2026-10-12 裁定改）。
  assert.equal(T.includes("一切写入都会被门禁在写之前拒绝"), false, "旧的无条件句不得保留");
  assert.equal(T.includes("不允许写盘"), false, "「治理会话不允许写盘」类普遍断言不得存在");
  assert.equal(T.includes("契约 §0"), false, "旧引据不得保留（回退情形不是契约结论）");
  // 小句级（。；换行切开）：凡含「写之前拒绝」的小句，必须同句带情形限定——
  // 防将来以别的措辞把普遍结论塞回来（与红线测试的「不要」替换法同一思路，此处按情形词命中）。
  const denyClauses = T.split(/[。；\n]/).filter((c) => c.includes("写之前拒绝"));
  assert.ok(denyClauses.length >= 1, "分支③的拒绝句须在（含「写之前拒绝」）");
  for (const c of denyClauses) {
    assert.match(c, /两者皆无|这一种|回退内置/, `「写之前拒绝」小句必须限定到回退情形，实得：${c}`);
  }
});

// ———————————— 5：确认制要点段（F-5-main + 2026-10-16 预置豁免修订） ————————————

test("确认制要点·预置豁免（2026-10-16）：`docs/su/**` 与 `docs/contracts/**` 免逐次确认、开会话与重建均生效；其余一切写盘仍逐路径确认", () => {
  assert.ok(T.includes("确认制要点"), "须有「确认制要点」段（F-5-main）");
  // 位置：在「docs/su 文档面」段之后（F-5 提案 §3.1；2026-10-16 修订后锚句改为文档面段首句）
  assert.ok(
    T.indexOf("没有角色目录") < T.indexOf("确认制要点"),
    "确认制要点须在文档面段（没有角色目录…）之后",
  );
  // —— 预置豁免：两棵目录树逐一点名，明确「无需逐次确认」——
  assert.ok(T.includes("`docs/su/**`") && T.includes("`docs/contracts/**`"), "豁免须逐一点名两棵目录树");
  assert.ok(T.includes("无需逐次确认"), "两目录须写明无需逐次确认（否则 su 仍逐次请求、行为不变）");
  assert.ok(T.includes("已预置"), "须写明写盘许可已预置（措辞不用「预授权」：J-1 守卫拦未否定的「授权」小句）");
  assert.ok(T.includes("开会话与重建后均生效"), "须写明预置开会话与重建均生效（与编排机制口径一致）");
  assert.ok(
    T.includes("预置的两棵目录树除外") && T.includes("不受重建影响"),
    "「重建/重开需重确认」句须回指预置目录的例外（不受重建影响、始终可直接写入）",
  );
  // —— 其余一切写盘：仍逐路径确认（从严——仅这两棵目录树免确认）——
  assert.ok(T.includes("其余一切写盘"), "须写明其余一切写盘仍逐路径确认");
  assert.ok(
    T.includes("`角色卡/**`") && T.includes("`docs/` 的其他路径"),
    "其余范围须含 `角色卡/**` 与 `docs/` 的其他路径（从严口径：docs/ 下仅两目录例外）",
  );
  assert.ok(T.includes("每个路径逐条"), "须写明每个路径逐条列入（逐条是发行的前提——整段描述不发行）");
  assert.ok(T.includes("`request_confirmation` 的 preview"), "须点名 request_confirmation 的 preview");
  assert.ok(T.includes("confirmed:true"), "须点名 confirmed:true（唯一发行凭据）");
  assert.ok(T.includes("口头") && T.includes("不能作为写盘依据"), "须写明对话里口头同意不算（不能作为写盘依据）");
  assert.ok(T.includes("按会话生效"), "须写明写盘许可按会话生效（只约束经确认发行的路径）");
  assert.ok(T.includes("会话重建/重开"), "须点名会话重建/重开（确认许可不自动保留）");
  assert.ok(T.includes("需重新确认"), "须写明重建/重开后需重新确认");
  assert.ok(T.includes("已确认过的路径不必重复确认"), "须写明同一会话内已确认路径不必重复确认（防过度刷卡）");
});

test("确认制要点·反向断言：凡含 `docs/su` 的小句不得要求确认；旧「落盘前照常经…确认」句不得复现", () => {
  // 旧句（对 docs/su 的普遍确认要求）已被 2026-10-16 裁定修正，逐字不得保留。
  assert.equal(T.includes("落盘前照常经"), false, "旧「落盘前照常经 request_confirmation 客户确认」句不得保留");
  // 小句级（。；换行切开）：凡含 `docs/su` 的小句不得出现「须/需要/照常/务必 (先|经|逐次)?确认」式要求
  //（该目录树免逐次确认；防将来以别的措辞把「笔记也要先确认」塞回来）。
  const suClauses = T.split(/[。；\n]/).filter((c) => c.includes("docs/su"));
  assert.ok(suClauses.length >= 2, "`docs/su` 小句须存在（文档面段与确认制要点段各至少一处）");
  for (const c of suClauses) {
    assert.doesNotMatch(
      c,
      /(须|需要|照常|务必)[^，。]{0,10}(先|经|逐次)?确认/,
      `含 docs/su 的小句不得要求确认，实得：${c}`,
    );
  }
});

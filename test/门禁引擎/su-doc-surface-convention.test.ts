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
//     `docs/contracts/**` 免逐次确认、G-4 裁定起连同 `docs/skills/**` 共三棵、G-4 V2 裁定起
//     连同 `docs/mcp/**` 共四棵**（预置豁免；
//     其余一切写盘仍逐路径确认——见下第 5/8/9 节）；
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
//  5. **确认制要点段（F-5-main；2026-10-16 预置豁免修订；G-4 扩列三棵→G-4 V2 扩列四棵）**：
//     `docs/su/**`、`docs/contracts/**`、`docs/skills/**`（G-4 预授权扩列，裁定①）与
//     `docs/mcp/**`（G-4 V2 预授权扩列，第四棵——见下第 9 节）的写盘许可已预置、
//     **无需逐次确认**（客户原话「这个 su 可以写 docs/su 的目录，不需要我审批」＋「还有个契约
//     目录也可以给他写。」；机制＝编排给 su 会话初始 writeSet 预置这四棵目录树，开会话/重建均
//     生效）；**其余一切写盘**（含 `角色卡/**`、`docs/` 其他路径）仍须 preview 逐条列路径 +
//     `confirmed:true` 才发行；「按会话生效」只约束经确认发行的路径，预置四棵不受重建影响。
//     卡文本措辞不用「授权」字面——J-1 守卫（`dispatch-after-landing-convention.test.ts:51`）
//     拦未否定的「授权/获准/放行」小句，沿用 2026-10-12 先例改用「许可/预置」。
//  6. **规划纪律段（新增）+ J-1 扩展段（G-1/A3；设计 `2026-10-16_design_contract-workflow-dispatch.md`
//     §三/§五/§六/§九 A3；客户 2026-10-16 批准 G-1 按提案实施、PM 派发 V1 最小闭环）**：多角色/跨角色工作
//     「先落盘再派发」——① 冻结契约 `docs/contracts/<name>-v1.md`（冻结后不可变、任何内容变化都出
//     新版本文件、不原地改 v1）；② 项目工作流 `docs/workflow.md`（步骤表 / 完成口令 / 变更与重验流程）。
//     写盘口径与第 5 节两目录预置句**不冲突**：契约属已预置目录（直接写）；`docs/workflow.md` 不属预置
//     两目录、列入同一次规划确认的 preview + `confirmed:true`（与编排 `SU_PREAUTHORIZED_WRITE_DIRS`
//     ＝仅两目录、运行时核心 `dispatch_task` 文案「先落盘再派发」同口径）。派发任务文本**按地址引用**
//     （不内嵌契约全文、不手算 sha256——「必读（按序）」块由投递系统在投递时附上并计算哈希；引用的契约
//     不存在会被拒投）；契约变更＝新版本文件＋受影响回交作废＋重派。**反向断言**：凡含 `docs/workflow.md`
//     的小句不得声称免确认/直接写（workflow.md 不属预置四棵——G-4 后＝三棵、G-4 V2 后＝四棵：
//     docs/su、docs/contracts、docs/skills、docs/mcp；不得被说成预置/免确认）；「原地改 / 自己算或转抄哈希」类表述必须是否定式。
//  7. **看护职责段（G-2/G；设计 `2026-10-16_design_role-watchdog-and-closure.md` §二/§三/§五/§六/§七；
//     客户 2026-10-16 批准 G-2 按提案实施、PM 派发 W1-W5/R1/R2/O1/G/U1）**：系统看护在异常态
//     （原「轮次逼近超时」；2026-10-17 客户裁定后改为「轮次到点检查」——到点只提示、不中止本轮、
//     1 小时为最后兜底，见 `su-turn-watch-convention.test.ts`；投递排队积压 / 命令超时限 / 重复失败）投 `[系统·看护]` 消息
//     ——su **先核查再动作**（`role_status`/`session_tail` 只读核对、结论留证 `docs/su/**`）；
//     恢复**只能提议**（`propose_recovery`）、**执行与否由客户一键确认**、由应用侧执行——不得自行执行、
//     不得承诺结果；看护消息仅如实告知、**不得据此假设任何写权**（措辞用「写权」，段级零命中 J-1 守卫
//     字样「授权/获准/放行」——2026-10-12 先例）；是否处理由 su 判断、处理走既有 E-1 回交 / H-1 重派
//     流程。**反向断言**：看护面小句不得出现守卫三词；「据此假设 / 自行执行」类表述必须是否定式。
//     位置：J-1 段之后、末段「边界（三种情形）」之前。
//  8. **安装纪律段（G-4/I6；设计 `2026-10-16_design_role-capability-install.md` §6.1/§6.2；
//     客户 2026-10-16 批准 G-4 十项裁定、PM 派发 wave 1）**：仅客户明示时安装/卸载（su 不自主
//     发起；仅在客户消息发起的轮次里执行——裁定④护栏）；不设二次确认卡；先落盘再激活（先写
//     `docs/skills/` 再调 `install_skill`/`uninstall_skill`，工具自己不写盘）；装/卸如实报告
//     （path/digest/生效态 rebuilt/next-session/撤销路径；「效果已撤」与「文件保留」二分陈述）；
//     安装不改变任何角色任何写边界（技能是必读资料、不是权限）。**同批**：确认制要点段预授权
//     扩列——`docs/skills/**` 并入预置（两棵→三棵；编排 `SU_PREAUTHORIZED_WRITE_DIRS` 同批）。
//     **反向断言**：安装面小句段级零命中「授权/获准/放行」（沿看护段先例）；「不自主发起 / 合并
//     陈述」类小句必须否定式（各带变异非空洞验证）。位置：J-1 派发块（派发失败/被拒）之后、
//     看护职责段之前。
//  9. **安装纪律·MCP 部分（G-4 V2 wave A；产品提案 revision 2 §5.1/§6.2＋运行时核心评估＋
//     三平台 P0 探针定格；客户 2026-10-16 批准「按推荐批准，开始实施」＝MCP 安装分批实施）**：
//     「安装纪律」段在技能部分之后**增补 MCP 部分**——仅客户明示时装/卸（同技能口径：不自主
//     发起；非客户消息发起的轮次会被如实拒绝）、不设二次确认卡；先落盘再激活（先写
//     `docs/mcp/<name>.md` 声明：用途 / 启动命令 / 环境变量名引用 / 适用角色；**值绝不写入
//     文件**——再调 `install_mcp`/`uninstall_mcp`；工具自己不写盘）；**诚实告知口径**（逐字
//     要点）：外来 MCP 工具在 ANS 门禁之外执行——安装＝能力级授予（不得表述为逐调用受审）；
//     卸载＝下次会话摘除、已发生的副作用不可撤。**同批**：确认制要点段预授权扩列第四棵
//     `docs/mcp/**`（三棵→四棵；编排 `SU_PREAUTHORIZED_WRITE_DIRS` 已在其边界内同批落盘）。
//     **反向断言**：安装面小句段级零命中「授权/获准/放行」（过滤词扩含 MCP——J-1 守卫；
//     「能力级授予」不含守卫三词）；「逐调用受审」类小句必须否定式（带变异捕获非空洞）。

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
    T.includes("`docs/su/**`") && T.includes("`docs/contracts/**`") && T.includes("`docs/skills/**`") && T.includes("`docs/mcp/**`"),
    "预置豁免须逐一点名四棵目录树：`docs/su/**`、`docs/contracts/**`、`docs/skills/**` 与 `docs/mcp/**`（2026-10-16 客户裁定＋G-4 扩列＋G-4 V2 扩列）",
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

test("确认制要点·预置豁免（2026-10-16 裁定；G-4 扩列三棵→G-4 V2 扩列四棵）：`docs/su/**`、`docs/contracts/**`、`docs/skills/**` 与 `docs/mcp/**` 免逐次确认、开会话与重建均生效；其余一切写盘仍逐路径确认", () => {
  assert.ok(T.includes("确认制要点"), "须有「确认制要点」段（F-5-main）");
  // 位置：在「docs/su 文档面」段之后（F-5 提案 §3.1；2026-10-16 修订后锚句改为文档面段首句）
  assert.ok(
    T.indexOf("没有角色目录") < T.indexOf("确认制要点"),
    "确认制要点须在文档面段（没有角色目录…）之后",
  );
  // —— 预置豁免：四棵目录树逐一点名（G-4 V2 后），明确「无需逐次确认」——
  assert.ok(
    T.includes("`docs/su/**`") && T.includes("`docs/contracts/**`") && T.includes("`docs/skills/**`") && T.includes("`docs/mcp/**`"),
    "豁免须逐一点名四棵目录树（含 G-4 新增 `docs/skills/**` 与 G-4 V2 新增 `docs/mcp/**`）",
  );
  assert.ok(T.includes("写入这四棵目录树"), "写入句须按四棵计数（G-4 V2 扩列）");
  assert.ok(T.includes("无需逐次确认"), "四目录须写明无需逐次确认（否则 su 仍逐次请求、行为不变）");
  assert.ok(T.includes("已预置"), "须写明写盘许可已预置（措辞不用「预授权」：J-1 守卫拦未否定的「授权」小句）");
  assert.ok(T.includes("开会话与重建后均生效"), "须写明预置开会话与重建均生效（与编排机制口径一致）");
  assert.ok(
    T.includes("预置的四棵目录树除外") && T.includes("不受重建影响"),
    "「重建/重开需重确认」句须回指预置目录的例外（不受重建影响、始终可直接写入）",
  );
  // —— 其余一切写盘：仍逐路径确认（从严——仅这四棵目录树免确认）——
  assert.ok(T.includes("其余一切写盘"), "须写明其余一切写盘仍逐路径确认");
  assert.ok(
    T.includes("`角色卡/**`") && T.includes("`docs/` 的其他路径"),
    "其余范围须含 `角色卡/**` 与 `docs/` 的其他路径（从严口径：docs/ 下仅四目录例外）",
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

// ———————————— 6：规划纪律段 + J-1 扩展（G-1/A3） ————————————

test("规划纪律（G-1/A3）：先落盘再派发——冻结契约（版本化不可变）＋项目工作流（步骤表/完成口令/变更与重验）；位置在确认制要点之后、J-1 之前", () => {
  assert.ok(T.includes("规划纪律"), "须有「规划纪律」段（G-1/A3）");
  assert.ok(T.includes("多角色/跨角色工作"), "须框定适用面：多角色/跨角色工作");
  // 位置：紧接「确认制要点」段之后（与既有确认制要点同段衔接），且在 J-1 段之前（规划先于派发）。
  assert.ok(
    T.indexOf("确认制要点") < T.indexOf("规划纪律"),
    "规划纪律须在确认制要点段之后",
  );
  assert.ok(
    T.indexOf("规划纪律") < T.indexOf("落盘后自动开工"),
    "规划纪律须在 J-1 段（落盘后自动开工）之前",
  );
  assert.ok(T.includes("先落盘再派发"), "须写明「先落盘再派发」");
  // —— ① 冻结契约 ——
  assert.ok(T.includes("`docs/contracts/<name>-v1.md`"), "须写死契约路径形状（版本号进文件名）");
  assert.ok(T.includes("稳定短 slug"), "须写 <name> 的命名口径（稳定短 slug）");
  assert.ok(T.includes("冻结后不可变"), "须写死「冻结后不可变」");
  assert.ok(T.includes("新版本文件"), "须写明任何变化都出新版本文件");
  assert.ok(T.includes("不原地改 v1"), "须明禁原地改 v1（否则派发地址的哈希永久失配）");
  assert.ok(T.includes("旧版保留可读"), "须写明旧版保留可读");
  // —— ② 项目工作流 ——
  assert.ok(T.includes("`docs/workflow.md`"), "须写死工作流路径 docs/workflow.md");
  assert.ok(T.includes("步骤表"), "工作流须含步骤表");
  assert.ok(T.includes("完成口令"), "工作流须含完成口令");
  assert.ok(T.includes("变更与重验"), "工作流须含变更与重验流程");
  assert.ok(T.includes("改动依赖后重测调用方"), "变更与重验须对应治理不变量「改动依赖后重测调用方」");
  // —— 写盘口径：契约直接写；workflow.md 不属预置、列规划确认 preview ——
  assert.ok(
    T.includes("契约写进已预置的 `docs/contracts/**`（直接写即可）"),
    "契约须写明属已预置目录、直接写",
  );
  assert.ok(T.includes("不在预置四目录内"), "docs/workflow.md 须写明不属预置四目录（G-4 V2 后计数）");
  assert.ok(T.includes("同一次规划确认"), "workflow.md 须列入同一次规划确认");
  assert.ok(T.includes("的 preview、`confirmed:true` 后写入"), "workflow.md 须写明 preview+confirmed:true 后才写入");
  // —— 角色必读与 blocked 纪律 ——
  assert.ok(T.includes("动手前先读"), "须写被派发角色动手前先读（按序）");
  assert.ok(T.includes("角色卡必读资料"), "必读序须含角色卡必读资料（工作流 → 契约 → 角色卡）");
  assert.ok(T.includes("blocked"), "读到与派发描述不符须停止并交 blocked 报告");
  assert.ok(T.includes("不得猜、不得改契约"), "须明禁猜与改契约");
  // —— 契约变更 ——
  assert.ok(T.includes("受影响步骤的既有回交"), "契约变更须写明受影响步骤的既有回交作废");
  assert.ok(T.includes("作废") && T.includes("重派"), "受影响回交作废并向受影响角色重派");
  assert.ok(T.includes("未受影响的步骤不回滚、不重跑"), "未受影响步骤不回滚、不重跑（防过度反应）");
});

test("J-1 扩展（G-1/A3）：派发按地址引用——不内嵌契约全文、不手算 sha256、「必读（按序）」块由系统投递时附上；契约缺失拒投", () => {
  assert.ok(T.includes("按地址引用"), "任务文本须按地址引用契约与工作流");
  assert.ok(T.includes("不内嵌契约全文"), "不得把契约全文内嵌进派发文本");
  assert.ok(T.includes("必读（按序）"), "必读块名须为「必读（按序）」");
  assert.ok(T.includes("先读完再动手"), "必读块语义：先读完再动手");
  assert.ok(T.includes("由系统在投递时计算的 sha256"), "sha256 须写明由系统在投递时计算");
  assert.ok(T.includes("不要自己算或转抄哈希"), "须明禁 su 自己算/转抄哈希");
  assert.ok(T.includes("拒投"), "引用的契约不存在须写明拒投（fail-closed）");
  assert.ok(T.includes("补落盘后重派"), "拒投后处置：补落盘后重派");
  // 位置：按地址指引在 J-1 派发句之后、且仍属派发纪律（在「派发 ≠ 授权」段之前）。
  assert.ok(
    T.indexOf("不等客户手动转达") < T.indexOf("按地址引用"),
    "按地址引用须在 J-1 派发句（不等客户手动转达）之后",
  );
  assert.ok(
    T.indexOf("按地址引用") < T.indexOf("派发 ≠ 授权"),
    "按地址引用须在「派发 ≠ 授权」段之前（同属派发纪律，不跨段漂移）",
  );
});

test("规划纪律·反向断言：凡含 `docs/workflow.md` 的小句不得声称免确认/直接写；「原地改 / 自己算或转抄」类表述否定式", () => {
  // 预置四棵（docs/su、docs/contracts、docs/skills、docs/mcp——G-4 V2 后）之外：workflow.md 明确走确认制，
  // 不得被说成预置/免确认（防把「docs/skills 扩列」连带把 workflow.md 也捎进去）。
  const wfClauses = T.split(/[。；\n]/).filter((c) => c.includes("docs/workflow.md"));
  assert.ok(wfClauses.length >= 2, "`docs/workflow.md` 小句须存在（规划纪律段与 J-1 段各至少一处）");
  for (const c of wfClauses) {
    assert.doesNotMatch(
      c,
      /直接写|无需(逐次)?确认|免(逐次)?确认|已预置/,
      `含 docs/workflow.md 的小句不得声称免确认/直接写（非预置路径），实得：${c}`,
    );
  }
  // 「原地改」小句必须是否定式（防把「契约变更出新版本文件」反写成原地改）。
  const inPlaceClauses = T.split(/[。；\n]/).filter((c) => /原地改/.test(c));
  assert.ok(inPlaceClauses.length >= 1, "「不原地改 v1」小句须存在（契约不可变的落点）");
  for (const c of inPlaceClauses) {
    assert.match(c, /不|不得|勿|禁止/, `含「原地改」的小句必须是否定式，实得：${c}`);
  }
  // 定向反面模式：任何「应/须/要/请/可以/可…原地改（v1）」或「（请/应/须/要/可以/可）自己算/手算/转抄（哈希）」
  // 的肯定式指令都不得存在。先把「不要」替换为「不」——否则禁令句自身的「要」会被本模式误抓
  //（与 temp-staging / document-surface 测试同法避误判）。
  const A = T.replaceAll("不要", "不");
  assert.equal(
    /(?:应|须|要|请|可以|可将|可)[^。\n]{0,10}原地改/.test(A),
    false,
    "不得出现「原地改 v1」式肯定指令",
  );
  assert.equal(
    /(?:请|应|须|要|可以|可将|可)[^。\n]{0,10}(自己算|手算|转抄)/.test(A),
    false,
    "不得出现要求 su 自己算/手算/转抄哈希的肯定指令",
  );
});

// ———————————— 7：看护职责段（G-2/G） ————————————

test("看护职责（G-2/G）：异常态投 `[系统·看护]`；先核查再动作（role_status/session_tail）；位置在 J-1 段之后、末段「边界（三种情形）」之前", () => {
  assert.ok(T.includes("看护职责"), "须有「看护职责」段（G-2/G）");
  // —— 告警与收束：两条消息路径逐一点名 ——
  assert.ok(T.includes("`[系统·看护]`"), "异常告警须点名 `[系统·看护]` 消息前缀");
  assert.ok(T.includes("异常态"), "须框定异常态");
  // 2026-10-17：原「轮次逼近超时」按客户裁定改为「轮次到点检查」（到点只提示、不中止本轮）
  for (const s of ["轮次到点检查", "投递排队积压", "命令超时限", "重复失败"]) {
    assert.ok(T.includes(s), `异常态信号须逐项列明：${s}`);
  }
  assert.equal(T.includes("轮次逼近超时"), false, "旧「轮次逼近超时」措辞不得保留（到点检查≠超时）");
  // 2026-10-18 客户收尾：移除「收束提示」职责（验收通过即收束）；看护告警/恢复职责保留。
  assert.equal(T.includes("收束提示"), false, "收束职责句不得再出现在 su 卡");
  assert.equal(T.includes("完成静默态"), false, "完成静默态提示不得再出现在 su 卡");
  // —— 先核查再动作（只读核对；结论留证） ——
  assert.ok(T.includes("先核查、再动作"), "须写死「先核查、再动作」");
  assert.ok(
    T.includes("`role_status`") && T.includes("`session_tail`"),
    "核对须用两只读工具 role_status / session_tail",
  );
  assert.ok(T.includes("仅凭告警文本") && T.includes("下结论"), "须明禁仅凭告警文本下结论");
  assert.ok(T.includes("核查结论记入你自己的文档面"), "核查结论须留证（你自己的文档面）");
  // —— 位置：J-1 段之后、末段「边界（三种情形）」之前 ——
  assert.ok(
    T.indexOf("落盘后自动开工") < T.indexOf("看护职责"),
    "看护职责须在 J-1 段（落盘后自动开工）之后",
  );
  assert.ok(
    T.indexOf("看护职责") < T.indexOf("边界（三种情形）"),
    "看护职责须在末段「边界（三种情形）」之前",
  );
});

test("看护职责·恢复只能提议（propose_recovery）：执行与否由客户一键确认；不得自行执行、不得承诺结果", () => {
  assert.ok(T.includes("`propose_recovery`"), "须点名 propose_recovery");
  assert.ok(T.includes("只能提议"), "恢复须写死「只能提议」");
  assert.ok(T.includes("执行与否由客户一键确认"), "须写明执行与否由客户一键确认");
  assert.ok(T.includes("不得自行执行"), "须明禁自行执行");
  assert.ok(T.includes("不得承诺结果"), "须明禁承诺结果");
  assert.ok(T.includes("未获确认即未执行"), "须写明未获确认即未执行（fail-closed）");
  assert.ok(T.includes("取消亦如实回执"), "客户取消须如实回执（不假装已执行）");
});

test("看护职责·纪律与反向断言：仅如实告知、不得据此假设任何写权；处理走既有回交/重派；看护面段级零命中「授权/获准/放行」守卫字样", () => {
  assert.ok(T.includes("仅如实告知"), "看护消息须定位为「仅如实告知」");
  assert.ok(T.includes("不得据此假设任何写权"), "须明禁据此假设任何写权");
  assert.ok(T.includes("是否处理由你判断"), "是否处理由 su 判断（不强迫动作）");
  assert.ok(T.includes("合法结局"), "「状态正常，忽略」须写明为合法结局");
  assert.ok(T.includes("E-1 回交与 H-1 派发"), "处理动作须走既有回交/重派流程（E-1 / H-1）");
  // 反向（J-1 守卫口径的段级余量）：凡含「看护 / 收束 / propose_recovery / 告警」的小句，不得出现
  // 「授权 / 获准 / 放行」——新段按 2026-10-12 先例避让守卫字样（改用「写权」），三词只允许出现在
  // 既有否定式小句里；本过滤同时钉非空洞（小句数下限）。
  const clauses = T.split(/[。；\n]/).filter((c) => /看护|收束|propose_recovery|告警/.test(c));
  assert.ok(clauses.length >= 6, `看护面小句须在场（非空洞），实得 ${clauses.length}`);
  for (const c of clauses) {
    assert.doesNotMatch(c, /授权|获准|放行/, `看护面小句不得出现守卫字样（授权/获准/放行），实得：${c}`);
  }
  // 小句级：「据此假设（写权）」与「自行执行（恢复）」类小句必须带否定/禁止标记
  //（不用「触发词 + 窗口」定向模式——「由应用侧执行」的「应」会误触「…自行执行」窗口，如实登记该假阳性规避）。
  const assume = T.split(/[。；\n]/).filter((c) => /据此假设/.test(c));
  assert.ok(assume.length >= 1, "「据此假设」小句须在场（非空洞）");
  for (const c of assume) {
    assert.match(c, /不得|禁止|勿|严禁|不是/, `「据此假设」小句必须是禁止式，实得：${c}`);
  }
  const selfExec = T.split(/[。；\n]/).filter((c) => /自行执行/.test(c));
  assert.ok(selfExec.length >= 1, "「自行执行」小句须在场（非空洞）");
  for (const c of selfExec) {
    assert.match(c, /不得|禁止|勿|严禁/, `「自行执行」小句必须是禁止式，实得：${c}`);
  }
});

// ———————————— 8：预授权扩列（G-4 两棵→三棵；G-4 V2 三棵→四棵）+ 安装纪律段（G-4/I6、G-4 V2/MCP） ————————————

test("预授权扩列（G-4→G-4 V2）：`docs/skills/**` 与 `docs/mcp/**` 先后并入预置、全卡口径＝四棵一致；旧「两棵/三棵」计数逐字不得复现", () => {
  assert.ok(
    T.includes("`docs/su/**`") && T.includes("`docs/contracts/**`") && T.includes("`docs/skills/**`") && T.includes("`docs/mcp/**`"),
    "四棵目录树须逐一点名（含 G-4 新增 `docs/skills/**` 与 G-4 V2 新增 `docs/mcp/**`）",
  );
  assert.ok(T.includes("你给角色安装的技能文档"), "docs/skills 的定位须点名（你给角色安装的技能文档）");
  assert.ok(T.includes("你给角色安装的 MCP 声明文档"), "docs/mcp 的定位须点名（你给角色安装的 MCP 声明文档）");
  assert.ok(T.includes("见下「安装纪律」"), "确认制要点段须下引「安装纪律」段（两段互指）");
  assert.ok(T.includes("写入这四棵目录树"), "写入句须为四棵");
  assert.ok(T.includes("预置的四棵目录树除外"), "例外句须为四棵（不受重建影响）");
  assert.ok(T.includes("不在预置四目录内"), "workflow.md 句须按四目录计数（仍不属预置）");
  // 旧「两棵」计数不得复现（防回退漂移）。
  assert.equal(T.includes("写入这两棵目录树"), false, "旧「写入这两棵目录树」不得保留");
  assert.equal(T.includes("预置的两棵目录树除外"), false, "旧「预置的两棵目录树除外」不得保留");
  assert.equal(T.includes("不在预置两目录内"), false, "旧「不在预置两目录内」不得保留");
  // 中间态「三棵」计数同样不得复现（G-4 V2 扩列后；防从四棵回退到三棵）。
  assert.equal(T.includes("写入这三棵目录树"), false, "旧「写入这三棵目录树」不得保留");
  assert.equal(T.includes("预置的三棵目录树除外"), false, "旧「预置的三棵目录树除外」不得保留");
  assert.equal(T.includes("不在预置三目录内"), false, "旧「不在预置三目录内」不得保留");
});

test("安装纪律（G-4/I6）：仅客户明示时安装/卸载、不设二次确认卡；先落盘再激活（工具自己不写盘）；装/卸如实报告；位置在 J-1 派发块之后、看护职责段之前", () => {
  assert.ok(T.includes("安装纪律（技能安装/卸载）"), "须有「安装纪律」段（G-4/I6）");
  // 位置：J-1 派发块（落盘后自动开工…待客户指示）之后、看护职责段之前。
  assert.ok(
    T.indexOf("落盘后自动开工") < T.indexOf("安装纪律（技能安装/卸载）"),
    "安装纪律须在 J-1 派发块之后",
  );
  assert.ok(T.indexOf("安装纪律（技能安装/卸载）") < T.indexOf("看护职责"), "安装纪律须在看护职责段之前");
  // ① 仅客户明示时——su 不自主发起；轮次护栏（裁定④）；不设二次确认卡（客户裁定：不把摩擦加回来）。
  assert.ok(T.includes("仅客户明示时"), "须写死「仅客户明示时」办理");
  assert.ok(T.includes("不自主发起"), "须写明 su 不自主发起");
  assert.ok(T.includes("仅在客户消息发起的轮次"), "须写明轮次护栏（仅客户消息发起的轮次；裁定④）");
  assert.ok(T.includes("不设二次确认卡"), "须写明不设二次确认卡");
  // ② 先落盘再激活——两文件形态、两只工具、工具自己不写盘。
  assert.ok(T.includes("先落盘再激活"), "须写死「先落盘再激活」");
  assert.ok(T.includes("`docs/skills/<name>/SKILL.md`"), "须写死技能内容文件路径（SKILL.md）");
  assert.ok(T.includes("`docs/skills/<name>/install.md`"), "须写死安装登记文件路径（install.md）");
  assert.ok(T.includes("`install_skill`") && T.includes("`uninstall_skill`"), "须点名两只工具");
  assert.ok(T.includes("自己不写盘"), "须写明工具自己不写盘（落盘只经 write_file）");
  assert.ok(T.includes("先落盘再安装"), "须写明登记不存在会被如实拒绝（先落盘再安装）");
  // ③ 装/卸如实报告——path/digest/生效态/撤销路径；「效果已撤」与「文件保留」二分。
  assert.ok(T.includes("如实报告"), "须写「如实报告」");
  assert.ok(T.includes("`path`") && T.includes("`digest`"), "报告面须含 path/digest（以工具回执为准）");
  assert.ok(T.includes("`rebuilt`") && T.includes("`next-session`"), "生效态须写 rebuilt/next-session 两态");
  assert.ok(T.includes("不打断") && T.includes("下一会话起生效"), "next-session 须写明不打断、下一会话起生效");
  assert.ok(T.includes("撤销路径"), "须写撤销路径");
  assert.ok(T.includes("先改登记"), "卸载须先改登记再调工具");
  assert.ok(
    T.includes("「效果已撤」与「文件保留」是两个事实"),
    "须写「效果已撤/文件保留」二分陈述（两个事实，不得合并）",
  );
  assert.ok(T.includes("本仓没有删除原语"), "须如实说明本仓没有删除原语（文件保留的原因）");
  assert.ok(T.includes("不得合并成「已删除」"), "须明禁把二分合成「已删除」");
  // ④ 安装不改变任何写边界（技能是必读资料、不是权限）。
  assert.ok(T.includes("安装不改变任何角色的任何写边界"), "须写死「安装不改变任何角色的任何写边界」");
  assert.ok(T.includes("技能是必读资料、不是权限"), "须写明技能是必读资料、不是权限");
});

test("安装纪律·MCP 部分（G-4 V2 wave A）：仅客户明示＋不设卡；先落盘再激活（docs/mcp 声明、值绝不写入文件）；诚实告知口径（门禁之外执行/能力级授予/不得逐调用受审/下次会话摘除/副作用不可撤）；位置在技能部分之后、看护职责段之前", () => {
  assert.ok(T.includes("安装纪律（MCP 安装/卸载）"), "须有「安装纪律」段的 MCP 部分（G-4 V2）");
  // 位置：紧接技能部分之后（同段内第二块）、看护职责段之前。
  assert.ok(
    T.indexOf("安装纪律（技能安装/卸载）") < T.indexOf("安装纪律（MCP 安装/卸载）"),
    "MCP 部分须在技能部分之后",
  );
  assert.ok(T.indexOf("安装纪律（MCP 安装/卸载）") < T.indexOf("看护职责"), "MCP 部分须在看护职责段之前");
  const section = T.slice(T.indexOf("安装纪律（MCP 安装/卸载）"), T.indexOf("看护职责"));
  // ① 仅客户明示＋不自主发起＋轮次护栏＋不设二次确认卡（同技能口径）。
  assert.ok(section.includes("仅客户明示时"), "①MCP 亦须写「仅客户明示时」办理");
  assert.ok(section.includes("不自主发起"), "①MCP 亦须写 su 不自主发起");
  assert.ok(section.includes("仅在客户消息发起的轮次"), "①MCP 亦须写轮次护栏（仅客户消息发起的轮次）");
  assert.ok(section.includes("非客户触发的轮次里调用会被如实拒绝"), "①MCP 须写明非客户轮次调用被如实拒绝");
  assert.ok(section.includes("不设二次确认卡"), "①MCP 亦须写不设二次确认卡");
  // ② 先落盘再激活——声明文件形态、两工具、值绝不写入文件。
  assert.ok(section.includes("先落盘再激活"), "②MCP 须写「先落盘再激活」");
  assert.ok(section.includes("`docs/mcp/<name>.md`"), "②须写死声明文件路径 docs/mcp/<name>.md");
  for (const s of ["用途", "启动命令", "环境变量", "适用角色"]) {
    assert.ok(section.includes(s), `②声明内容须点名：${s}`);
  }
  assert.ok(section.includes("值绝不写入文件"), "②须写死「值绝不写入文件」（只记环境变量名引用）");
  assert.ok(section.includes("`install_mcp`") && section.includes("`uninstall_mcp`"), "②须点名两只工具");
  assert.ok(section.includes("自己不写盘"), "②须写明工具自己不写盘");
  assert.ok(section.includes("先落盘再安装"), "②须写明声明不存在会被如实拒绝（先落盘再安装）");
  // ③ 诚实告知口径（逐字要点）。
  assert.ok(
    section.includes("外来 MCP 工具") && section.includes("在 ANS 门禁之外执行"),
    "③须写明外来 MCP 工具在 ANS 门禁之外执行",
  );
  assert.ok(section.includes("能力级授予"), "③须写死「安装＝能力级授予」");
  assert.ok(section.includes("不得表述为逐调用受审"), "③须明禁表述为逐调用受审");
  assert.ok(section.includes("先改声明"), "③卸载须先改声明再调工具（同技能先改登记口径）");
  assert.ok(section.includes("下次会话摘除"), "③卸载须写「下次会话摘除」");
  assert.ok(section.includes("已发生的副作用不可撤"), "③须写死「已发生的副作用不可撤」");
});

test("安装纪律·MCP 部分·反向断言：MCP 面小句段级零命中「授权/获准/放行」（含非空洞下限）；「逐调用受审」类小句必须否定式（带变异捕获）", () => {
  const section = T.slice(T.indexOf("安装纪律（MCP 安装/卸载）"), T.indexOf("看护职责"));
  const clauses = section.split(/[。；\n]/).filter((c) => c.trim() !== "");
  assert.ok(clauses.length >= 10, `MCP 面小句须在场（非空洞），实得 ${clauses.length}`);
  for (const c of clauses) {
    assert.doesNotMatch(c, /授权|获准|放行/, `MCP 面小句不得出现守卫字样（授权/获准/放行），实得：${c}`);
  }
  // 「逐调用受审」类小句必须带否定（防把「不得表述为逐调用受审」反写为肯定式）。
  const auditClauses = clauses.filter((c) => /受审/.test(c));
  assert.ok(auditClauses.length >= 1, "「受审」小句须在场（非空洞）");
  for (const c of auditClauses) {
    assert.match(c, /不得|禁止|勿/, `「受审」类小句必须是否定式，实得：${c}`);
  }
  const mutated = T.replace("不得表述为逐调用受审", "表述为逐调用受审");
  assert.notEqual(mutated, T, "「逐调用受审」变异点须存在");
  const mutSection = mutated.slice(mutated.indexOf("安装纪律（MCP 安装/卸载）"), mutated.indexOf("看护职责"));
  assert.ok(
    mutSection.split(/[。；\n]/).some((c) => /受审/.test(c) && !/不得|禁止|勿/.test(c)),
    "肯定式「逐调用受审」必须被小句级谓词捕获（非空洞）",
  );
});

test("安装纪律·反向断言：安装面小句段级零命中「授权/获准/放行」（含非空洞下限）；「不自主发起 / 合并」类小句必须否定式（各带变异捕获）", () => {
  // 段级零命中（沿看护段先例）：凡含「安装 / 卸载 / 技能 / MCP」的小句不得出现守卫三词（含小句数下限防空洞；
  // G-4 V2 起过滤词扩含 MCP——MCP 部分小句全数落网）。
  const clauses = T.split(/[。；\n]/).filter((c) => /安装|卸载|技能|MCP/.test(c));
  assert.ok(clauses.length >= 16, `安装面小句须在场（非空洞），实得 ${clauses.length}`);
  for (const c of clauses) {
    assert.doesNotMatch(c, /授权|获准|放行/, `安装面小句不得出现守卫字样（授权/获准/放行），实得：${c}`);
  }
  // 「不自主发起」小句必须带否定（防把「su 不自主发起」反写为肯定式）。
  const selfStart = T.split(/[。；\n]/).filter((c) => /自主发起/.test(c));
  assert.ok(selfStart.length >= 1, "「不自主发起」小句须在场（非空洞）");
  for (const c of selfStart) {
    assert.match(c, /不自主发起|不得|禁止|勿/, `「自主发起」类小句必须是否定式，实得：${c}`);
  }
  const mutSelf = T.replace("**你（su）不自主发起**", "**你可以自主发起**");
  assert.notEqual(mutSelf, T, "「不自主发起」变异点须存在");
  assert.ok(
    mutSelf.split(/[。；\n]/).filter((c) => /自主发起/.test(c)).some((c) => !/不自主发起|不得|禁止|勿/.test(c)),
    "肯定式「你可以自主发起」必须被小句级谓词捕获（非空洞）",
  );
  // 「合并陈述」类小句必须是否定式（防把「效果已撤/文件保留」二分反写成合并陈述）。
  const mergeClauses = T.split(/[。；\n]/).filter((c) => /合并陈述|合并成/.test(c));
  assert.ok(mergeClauses.length >= 1, "「不得合并」小句须在场（非空洞）");
  for (const c of mergeClauses) {
    assert.match(c, /不得|禁止|勿|严禁/, `「合并」类小句必须是否定式，实得：${c}`);
  }
  const mutMerge = T.replace("不得合并成「已删除」", "请合并成「已删除」");
  assert.notEqual(mutMerge, T, "「不得合并成」变异点须存在");
  assert.ok(
    mutMerge.split(/[。；\n]/).filter((c) => /合并陈述|合并成/.test(c)).some((c) => !/不得|禁止|勿|严禁/.test(c)),
    "肯定式「请合并成「已删除」」必须被小句级谓词捕获（非空洞）",
  );
});

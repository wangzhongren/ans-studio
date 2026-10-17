// 门禁引擎测试：su 内置卡「命令纪律（su 审批档）」（PM 评审
// `2026-10-17_design_su-shell-approval-review.md` §3.7；客户 2026-10-17 裁定
// 「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」）。
//
// 本文件只钉**文案**（单一来源 `BUILT_IN_ROLE_CARD_TEXT`）；机制由编排/桌面各自实施。要点：
//  1. 位置：在「派发失败/被拒」段之后、「安装纪律（技能安装/卸载）」段之前；
//  2. 只读白名单（(c)=allow）免审批直接执行；其余（risky/review **以及原硬拒 deny**）弹客户确认卡，
//     批准才执行；拒绝/超时/通道不可用＝不执行；不走 pm 审读（su 不自审）；
//  3. 卡片显示 `su-审批档[risky|review|deny]`、原始命令与原因；
//  4. 如实披露：shell 不受 ANS 文件写边界约束、批准的是单次命令而非新写权、可能写到项目外；
//     审计仍落 `docs/audit/shell-gate.jsonl`（治理边界 + `shell-gate` 条件）；
//  5. J-1 守卫：凡含「授权/获准/放行」的小句必须是否定/禁止式（含非空洞变异验证）。

import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../src/common/门禁引擎/boundary-core.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;
const START = "命令纪律（su 审批档，run_shell）：";
const END = "安装纪律（技能安装/卸载）：";
const start = T.indexOf(START);
const end = T.indexOf(END);
const SEG = start >= 0 && end > start ? T.slice(start, end) : "";

/** J-1 守卫的同款小句级判据：含守卫三词却没有否定/禁止标记的小句。 */
function unnegatedGuardClauses(text: string): string[] {
  return text
    .split(/[。；\n]/)
    .filter((c) => /授权|获准|放行/.test(c) && !/≠|不得|勿|禁止|非|不是/.test(c));
}

test("命令纪律段存在，位置在「派发失败/被拒」之后、「安装纪律（技能安装/卸载）」之前", () => {
  assert.ok(start >= 0, "卡文本须含「命令纪律（su 审批档，run_shell）：」段");
  assert.ok(end > start, "该段须在「安装纪律（技能安装/卸载）」段之前");
  assert.ok(
    T.indexOf("派发失败/被拒") < start,
    "该段须在「派发失败/被拒」段之后（PM 评审 §3.7 建议位置）",
  );
});

test("审批档口径：只读免审批直执行；risky/review/deny 均弹卡、客户批准后才执行；拒绝/超时/通道不可用＝不执行", () => {
  for (const s of [
    "只读白名单",
    "免审批、直接执行",
    "risky/review",
    "原本硬拒的 deny 类",
    "都会向客户弹出确认卡",
    "客户批准后才执行",
    "拒绝、超时、通道不可用 = **不执行**",
    "不走 pm 审读",
    "su 不自审",
  ]) {
    assert.ok(SEG.includes(s), `命令纪律段须含「${s}」`);
  }
  // 「免审批」只限定只读白名单（不得被读成所有命令免审批）
  assert.match(SEG, /只读白名单[\s\S]{0,80}?免审批/, "「免审批」须紧邻只读白名单语义");
  // deny 也被批准：同一句链里 deny → 确认卡 → 批准后才执行
  assert.match(SEG, /deny[\s\S]{0,300}?客户批准后才执行/, "deny 类也必须经客户确认卡批准后才执行");
  assert.equal(SEG.includes("deny 直接拒绝"), false, "不得把 deny 写成不经客户审批即直接拒绝");
  assert.equal(SEG.includes("无需客户审批"), false, "不得声称任何命令无需客户审批（只读白名单除外由上一句限定）");
});

test("卡片披露与审计：su-审批档[risky|review|deny]、原始命令与原因；shell 不受写边界约束、不是新写权、可能写到项目外；审计仍落盘", () => {
  for (const s of [
    "su-审批档[risky|review|deny]",
    "原始命令与原因",
    "shell 命令不受 ANS 文件写入边界约束",
    "不是新的写权",
    "当前 OS 用户权限",
    "可能写到项目外",
    "docs/audit/shell-gate.jsonl",
    "`shell-gate` 条件",
  ]) {
    assert.ok(SEG.includes(s), `命令纪律段须如实披露「${s}」`);
  }
  // 反向：不得声称 shell 受文件写边界约束（如实披露的对照面）
  assert.equal(
    SEG.includes("shell 命令受 ANS 文件写入边界约束"),
    false,
    "不得声称 shell 命令受 ANS 文件写边界约束",
  );
  // 批准的是单次命令，不是新写权（不得写成「获得写权」）
  assert.equal(SEG.includes("新的写权"), true, "须明确出现「不是新的写权」的对照词");
  assert.match(SEG, /不是新的写权/, "须明确「批准的是这一次命令，不是新的写权」");
  // 也不得把口头同意当批准
  assert.ok(SEG.includes("不得**把客户口头同意当批准") || SEG.includes("把客户口头同意当批准"), "须明确口头同意不等于批准");
});

test("J-1 守卫：全卡与新段均无未否定的「授权/获准/放行」小句（含变异非空洞验证）", () => {
  assert.deepEqual(unnegatedGuardClauses(T), [], "全卡不得出现未否定的守卫三词小句");
  assert.deepEqual(unnegatedGuardClauses(SEG), [], "新增段不得出现未否定的守卫三词小句");
  // 非空洞：合成的违规小句必须被同一判据捕获
  assert.equal(
    unnegatedGuardClauses("客户已获准执行该命令。").length,
    1,
    "判据必须能捕获「已获准」式肯定句（防止断言空转）",
  );
  assert.equal(
    unnegatedGuardClauses("不得把已提交审批说成已获准。").length,
    0,
    "带「不得」的否定式应通过",
  );
});

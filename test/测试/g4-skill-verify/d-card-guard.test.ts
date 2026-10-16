// test/测试/g4-skill-verify/d-card-guard.test.ts —— G-4 独立验证 D 域：**su 卡文本（安装纪律段）＋ J-1 守卫**。
//
// 对抗性独立构造：四要点＋三棵树话术以**自建关键词清单**核在场；J-1 守卫词表（授权/获准/放行）
// 对**全文小句级**零违规检查（含安装纪律段**段级零命中**）；非空洞验证（内存变异必须被谓词捕获）。

import test from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../../src/common/门禁引擎/boundary-core.ts";
import { describeTool } from "../../../src/provider/runtime/schema.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;
const splitClauses = (text: string) => text.split(/[。；\n]/).filter((c) => c.trim() !== "");
const GUARD = /授权|获准|放行/;
/** J-1 否决标记（沿既有守卫口径：≠ / 不得 / 勿 / 禁止 / 非 / 不是——不含「无需」等弱化词）。 */
const NEGATED_GUARD = /≠|不得|勿|禁止|非|不是/;

/** 守卫谓词：返回违规小句（含守卫词但无否定标记）。 */
function guardViolations(text: string): string[] {
  return splitClauses(text).filter((c) => GUARD.test(c) && !NEGATED_GUARD.test(c));
}

test("安装纪律四要点在场（自建关键词清单）：仅客户明示/不自主发起＋轮次护栏/先落盘再激活/如实二分＋不改变写边界", () => {
  const start = T.indexOf("安装纪律（技能安装/卸载）");
  const end = T.indexOf("看护职责");
  assert.ok(start >= 0 && end > start, "卡文本须含安装纪律段（介于派发块与看护职责段之间）");
  const section = T.slice(start, end);

  // ① 仅客户明示＋不自主发起＋轮次护栏
  assert.ok(/仅客户明示时/.test(section), "①须写明「仅客户明示时」办理");
  assert.ok(/不自主发起/.test(section), "①须写明 su 不自主发起");
  assert.ok(/客户消息发起的轮次/.test(section), "①须写明裁定④轮次护栏（仅客户消息发起的轮次执行）");
  assert.ok(/不设二次确认卡/.test(section), "①须写明无二次确认卡（客户裁定口径）");
  // ② 先落盘再激活
  assert.ok(/先落盘再激活/.test(section), "②须写明「先落盘再激活」");
  assert.ok(/docs\/skills\/<name>\/SKILL\.md/.test(section), "②须给出技能内容落盘路径");
  assert.ok(/docs\/skills\/<name>\/install\.md/.test(section), "②须给出登记落盘路径");
  assert.ok(/工具\*\*自己不写盘\*\*|工具\*\*不写盘\*\*/.test(section), "②须写明工具自己不写盘");
  // ③ 如实报告与二分陈述
  assert.ok(/path/.test(section) && /digest/.test(section), "③须写明回执以 path/digest 为准");
  assert.ok(/rebuilt/.test(section) && /next-session/.test(section), "③须写明生效态两值");
  assert.ok(/效果已撤/.test(section) && /文件保留/.test(section), "③须写明「效果已撤/文件保留」二分");
  assert.ok(/不得合并/.test(section), "③须禁止把二分合并成「已删除」");
  assert.ok(/撤销路径|登记随时可查/.test(section), "③须给出撤销路径");
  // ④ 不改变写边界
  assert.ok(/安装不改变任何角色的任何写边界/.test(section), "④须写明安装不改变任何角色的任何写边界");
  assert.ok(/技能是必读资料、不是权限/.test(section), "④须写明技能是资料不是权限");
});

test("三棵树话术：确认制要点段列全 docs/su＋docs/contracts＋docs/skills；workflow 不在预置内（反向）", () => {
  const clauseStart = T.indexOf("确认制要点：");
  const clauseEnd = T.indexOf("规划纪律（多角色/跨角色工作）");
  assert.ok(clauseStart >= 0 && clauseEnd > clauseStart, "须能定位确认制要点段");
  const seg = T.slice(clauseStart, clauseEnd);
  assert.ok(seg.includes("`docs/su/**`") && seg.includes("`docs/contracts/**`") && seg.includes("`docs/skills/**`"), "三棵目录树均点名");
  assert.ok(/写入这三棵目录树\*\*无需逐次确认\*\*/.test(seg), "三棵树免逐次确认话术在场");
  assert.ok(seg.includes("**其余一切写盘**"), "其余一切写盘仍须确认（边界钉）");
  assert.ok(/预置的三棵目录树除外/.test(seg), "按会话生效的范围句含「三棵预置除外」");
  // 反向：凡含 docs/workflow.md 且涉「预置/预授权」的小句必须是否定式（不在）。
  for (const c of splitClauses(T)) {
    if (c.includes("docs/workflow.md") && /预置|预授权/.test(c)) {
      assert.ok(/不在|不属/.test(c), `workflow 小句不得称预置（须否定式）：${c}`);
    }
  }
});

test("J-1 守卫零违规：全文小句级（含守卫词必带否定）；安装纪律段段级零命中守卫三词", () => {
  assert.deepEqual(guardViolations(T), [], "卡文本全文不得有未否定的「授权/获准/放行」小句");
  const start = T.indexOf("安装纪律（技能安装/卸载）");
  const end = T.indexOf("看护职责");
  const section = T.slice(start, end);
  assert.equal(GUARD.test(section), false, "安装纪律段段级零命中守卫三词（沿看护段先例）");
  // schema 两工具文案同样零违规。
  for (const name of ["install_skill", "uninstall_skill"]) {
    const t = describeTool(name);
    const text = [t.description ?? "", ...(t.promptGuidelines ?? [])].join("\n");
    assert.deepEqual(guardViolations(text), [], `${name} 文案不得有未否定的守卫词小句`);
  }
});

test("非空洞验证（变异必须被谓词捕获）：反向断言与守卫谓词对内存变异真实敏感", () => {
  // 谓词对合成阳性句必须违规。
  assert.equal(guardViolations("你已获授权安装技能。").length, 1, "合成阳性句必须被抓");
  assert.equal(guardViolations("本动作已放行。").length, 1);
  assert.equal(guardViolations("不得暗示任何授权。").length, 0, "带否定标记的合法句不误报");
  // 真实文本变异：给「无需逐次确认」句注入阳性「已获授权」——必须被抓。
  const mutated = T.replace("写入这三棵目录树**无需逐次确认**", "写入这三棵目录树**已获授权**、无需逐次确认");
  assert.notEqual(mutated, T, "变异点须真实存在（防漂移）");
  assert.ok(guardViolations(mutated).length >= 1, "变异必须被守卫谓词捕获");
  // 反向断言变异：把 workflow 否定句改成肯定——self guard 必须抓到。
  const mutatedWf = T.replace("`docs/workflow.md` 不在预置三目录内", "`docs/workflow.md` 也在预置三目录内");
  assert.notEqual(mutatedWf, T, "workflow 变异点须真实存在");
  const wfViolation = splitClauses(mutatedWf).filter((c) => c.includes("docs/workflow.md") && /预置/.test(c)).some((c) => !/不在|不属/.test(c));
  assert.equal(wfViolation, true, "workflow 肯定式变异必须被反向谓词捕获");
});

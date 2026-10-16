// test/测试/g4v2-mcp-verify/e-card-text.test.ts —— E 域：su 卡文本（MCP 安装纪律段＋四棵树＋J-1 守卫全检）。
//
// 独立构造：自建段界定位（按 MCP 段首尾句之间切片）＋**独立重实现** J-1 小句级谓词（不调用实施方测试），
// 并以**内存变异**证谓词非空洞（挖掉否定词必须被捕获）。

import test from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../../src/common/门禁引擎/boundary-core.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;

/** MCP 安装纪律段切片：自段首句至段末（段间以空行为界）。 */
function mcpSection(): string {
  const start = T.indexOf("安装纪律（MCP 安装/卸载）");
  assert.ok(start > 0, "卡文本须含 MCP 安装纪律段");
  const end = T.indexOf("\n\n", start);
  assert.ok(end > start, "段界定位");
  return T.slice(start, end);
}

/** 独立重实现的 J-1 小句级谓词：含守卫三词的小句必须带否定/禁止标记。 */
function guardViolations(text: string): string[] {
  return text
    .split(/[。；\n]/)
    .filter((c) => /授权|获准|放行/.test(c))
    .filter((c) => !/≠|不得|勿|禁止|非|不是|绝不|不可/.test(c));
}

test("E1 四棵树：确认制要点段写明四棵（docs/su/contracts/skills/mcp）免逐次确认；重建不受影响", () => {
  assert.ok(T.includes("`docs/su/**`"), "第一棵");
  assert.ok(T.includes("`docs/contracts/**`"), "第二棵");
  assert.ok(T.includes("`docs/skills/**`"), "第三棵");
  assert.ok(T.includes("`docs/mcp/**`"), "第四棵（V2）");
  const confirmStart = T.indexOf("确认制要点");
  const confirmEnd = T.indexOf("规划纪律", confirmStart);
  const confirm = T.slice(confirmStart, confirmEnd);
  assert.ok(confirm.includes("四棵"), "确认制要点须写明「四棵」");
  assert.ok(confirm.includes("预置的四棵目录树除外") || confirm.includes("不受重建影响"), "预置树不受重建影响句在场");
  // 规划纪律段的落盘口径：workflow.md 不在预置四目录内（负例不回归）
  assert.ok(T.includes("不在预置四目录内"), "workflow.md 负例须写明「不在预置四目录内」");
});

test("E2 MCP 段四要点全检：仅客户明示/无二次卡/先落盘再激活+凭据不入文件/卸载二分+副作用不可撤", () => {
  const mcp = mcpSection();
  // 要点①：仅客户明示、不自主发起、非客户轮次拒绝
  for (const s of ["仅客户明示时", "不自主发起", "仅在客户消息发起的轮次", "如实拒绝"]) {
    assert.ok(mcp.includes(s), `要点①须含：${s}`);
  }
  // 要点②：不设二次确认卡
  assert.ok(mcp.includes("不设二次确认卡"), "要点②：不设二次确认卡");
  assert.ok(mcp.includes("安装工具没有确认通道"), "要点②机制面：无确认通道");
  // 要点③：先落盘再激活、凭据值不落文件、工具不写盘
  for (const s of ["先落盘再激活", "`docs/mcp/<name>.md`", "凭据值与一切秘密的值绝不写入文件", "`env:NAME` 引用", "自己不写盘", "先落盘再安装"]) {
    assert.ok(mcp.includes(s), `要点③须含：${s}`);
  }
  // 要点④：诚实面（必讲、不得省略）＋能力级授予口径＋不改变写边界
  for (const s of ["诚实告知口径（必讲、不得省略）", "在 ANS 门禁之外执行", "安装＝能力级授予", "新动作面", "不得表述为逐调用受审", "不改变任何角色的**写边界**"]) {
    assert.ok(mcp.includes(s), `要点④须含：${s}`);
  }
  // 卸载：先改声明再调、下次会话摘除、副作用不可撤、不得暗示已回滚
  for (const s of ["先改声明", "下次会话摘除", "已发生的副作用不可撤", "不得暗示已回滚"]) {
    assert.ok(mcp.includes(s), `卸载纪律须含：${s}`);
  }
});

test("E3 工具纪律与如实话术：装/卸如实报告 path/digest（回执为准）＋生效态两分支", () => {
  const mcp = mcpSection();
  assert.ok(mcp.includes("如实报告"), "装/卸如实报告");
  assert.ok(mcp.includes("`path`/`digest`"), "报告须以回执 path/digest 为事实来源");
  assert.ok(mcp.includes("以工具回执为准"), "回执为单一事实来源句");
  assert.ok(mcp.includes("`rebuilt`/`next-session`"), "生效态两分支同技能口径");
});

test("E4 J-1 守卫全检：全文小句级零违规；MCP 段同样零违规；「受审」类小句必须否定式", () => {
  assert.deepEqual(guardViolations(T), [], `全文含守卫三词的小句必须否定式：${JSON.stringify(guardViolations(T))}`);
  assert.deepEqual(guardViolations(mcpSection()), [], "MCP 段段级零违规（「能力级授予」不含守卫三词）");
  for (const clause of T.split(/[。；\n]/).filter((c) => c.includes("受审"))) {
    assert.ok(/不是|不得|非|绝不/.test(clause), `「受审」小句必须否定式：${clause}`);
  }
  // 「据此假设 / 自行执行」类表述必须否定式（沿看护段先例的同类扫描——MCP 段不引入正向面）
  for (const clause of mcpSection().split(/[。；\n]/).filter((c) => c.includes("自行"))) {
    assert.ok(/不|非|绝不/.test(clause), `「自行」小句必须否定式：${clause}`);
  }
});

test("E5 谓词非空洞（变异捕获）：注入肯定式「授权/放行」与「即逐调用受审」必须被同款谓词猎出", () => {
  const mutatedAuth = `${T}\n本次安装已获授权。\n`;
  assert.ok(guardViolations(mutatedAuth).length > 0, "变异①（末段追加肯定式授权）必须被捕获");
  const mutatedInline = T.replace("**不设二次确认卡**", "相关放行已完成");
  assert.ok(guardViolations(mutatedInline).length > 0, "变异②（段内挖掉否定→肯定式放行）必须被捕获");
  const mutatedReview = T.replace("不得表述为逐调用受审", "即逐调用受审");
  const reviewHits = mutatedReview.split(/[。；\n]/).filter((c) => c.includes("受审") && !/不是|不得|非|绝不/.test(c));
  assert.ok(reviewHits.length > 0, "变异③（肯定式受审）必须被捕获");
  const mutatedTree = T.replace("写入这四棵目录树", "写入这三棵目录树");
  assert.ok(mutatedTree !== T && !mutatedTree.includes("写入这四棵目录树"), "变异④（棵树数）可被检出");
  assert.deepEqual(guardViolations(mcpSection()), [], "原文本无违规（对照）");
});

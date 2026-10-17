// 门禁引擎测试：su 内置卡「看护职责 / 看护纪律」的到点检查与 1 小时兜底
// （PM 评审 `2026-10-17_design_turn-watch-and-recover-review.md` §3.4；客户 2026-10-17 裁定
// 「整轮不应该有超时，应该是到了时间，su 要去看下是否卡死了」「保留 1 小时兜底」）。
//
// 本文件只钉**文案**（单一来源 `BUILT_IN_ROLE_CARD_TEXT`）；看护/适配器机制由各自属主实施。要点：
//  1. 「轮次逼近超时」→「轮次到点检查」；到点**不中止本轮**，只投一条提示；
//  2. su 先 role_status/session_tail 核对：仍在推进**不动作**；**只有确认卡死**才 propose_recovery；
//  3. **1 小时为最后兜底**（适配器中止，唯一自动整轮上限），与到点检查明确区分；
//  4. su 自身轮次无到点检查（不能检查自己），仅有 1 小时兜底；
//  5. 保留「看护消息仅如实告知」「不得据此假设任何写权」；
//  6. J-1 守卫：全卡无未否定的「授权/获准/放行」小句。

import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../src/common/门禁引擎/boundary-core.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;

function unnegatedGuardClauses(text: string): string[] {
  return text
    .split(/[。；\n]/)
    .filter((c) => /授权|获准|放行/.test(c) && !/≠|不得|勿|禁止|非|不是/.test(c));
}

test("看护职责：到点检查替代「轮次逼近超时」；到点不中止本轮", () => {
  assert.ok(T.includes("轮次到点检查"), "须点明「轮次到点检查」");
  assert.equal(T.includes("轮次逼近超时"), false, "旧「轮次逼近超时」措辞不得保留");
  for (const s of ["到点检查不是超时", "不会因此中止本轮", "看护只投一条"] ) {
    assert.ok(T.includes(s), `须含「${s}」`);
  }
});

test("到点检查：先核查；仍在推进不动作；只有确认卡死才 propose_recovery（客户确认、应用执行）", () => {
  for (const s of [
    "role_status",
    "session_tail",
    "仍在推进，不动作",
    "状态正常，忽略",
    "只有确认卡死",
    "propose_recovery",
    "停止本轮 / 重建会话 / 重投任务",
    "由客户一键确认、应用执行",
    "不得自行执行、不得承诺结果",
  ]) {
    assert.ok(T.includes(s), `须含「${s}」`);
  }
  // 「不动作」与「确认卡死才提议」须相邻成句链（不得被读成到点即恢复）
  assert.match(T, /仍在推进，不动作[\s\S]{0,120}?只有确认卡死[\s\S]{0,120}?propose_recovery/);
});

test("1 小时兜底：适配器中止、唯一自动整轮上限、与到点检查明确区分；su 自身轮次仅有兜底", () => {
  for (const s of [
    "1 小时为最后兜底",
    "整轮有效运行到 1 小时",
    "适配器会中止该轮",
    "唯一自动整轮上限",
    "与到点检查明确区分",
    "没有到点检查",
    "不能检查自己",
    "仅有 1 小时兜底",
  ]) {
    assert.ok(T.includes(s), `须含「${s}」`);
  }
});

test("看护纪律保留：仅如实告知、不得据此假设任何写权；J-1 守卫全卡零未否定命中", () => {
  assert.ok(T.includes("看护消息仅如实告知"));
  assert.ok(T.includes("不得据此假设任何写权"));
  assert.deepEqual(unnegatedGuardClauses(T), [], "全卡不得出现未否定的守卫三词小句");
  // 非空洞：合成违规句必须被捕获
  assert.equal(unnegatedGuardClauses("看护消息即已获准执行。").length, 1);
});

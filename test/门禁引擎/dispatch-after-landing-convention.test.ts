// 门禁引擎测试：J-1「确认落盘后自动开工」（治理文案，客户原话「这个确认了，写盘之后，要自动启动开发啊」）
//
// 本文件钉住 su 内置卡文本（`BUILT_IN_ROLE_CARD_TEXT`，单一来源）中的流程约定：
//  1. 角色与治理产物落盘（客户经 request_confirmation 确认、写入完成、自动收尾）之后，su **立刻**用
//     `dispatch_task` 派发第一项开发任务（roleId=刚建出的角色；task 自足：做什么/依据哪份文档/完成标准），
//     **不等客户手动转达**；
//  2. **派发 ≠ 授权**（与 H-1 语义硬约束逐字一致）：目标角色的写权仍只来自它自己的 Section 1 与
//     `request_confirmation` 的 confirmed:true；不得在任务文本里代授权限；
//  3. 失败语义：派发失败/被拒 → 如实告知客户，不得假设已开工；没有可派发角色 → 如实说明并停在「待客户指示」；
//  4. **反向断言**：任何涉及「授权/获准/放行」的小句必须是禁止式或否定义（≠），不得出现「已获授权 /
//     已放行写盘 / 派发即授权」式表述。

import { test } from "node:test";
import assert from "node:assert/strict";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../src/common/门禁引擎/boundary-core.ts";

const T = BUILT_IN_ROLE_CARD_TEXT;
const FLAT = T.replace(/\n/g, "");

test("J-1：落盘之后「立刻派发」——用 dispatch_task，task 自足，不等客户手动转达", () => {
  assert.match(
    FLAT,
    /落盘[\s\S]{0,100}?立刻[\s\S]{0,100}?dispatch_task[\s\S]{0,100}?派发/,
    "须写明：落盘（确认+写入+自动收尾）之后立刻用 dispatch_task 派发（顺序：落盘 → 立刻 → dispatch_task → 派发）",
  );
  for (const s of ["roleId", "自足", "做什么", "依据", "完成标准", "不等客户手动转达"]) {
    assert.ok(T.includes(s), `卡文本须含「${s}」（任务文本自足三要素与自动开工语义）`);
  }
  assert.match(T, /request_confirmation/, "落盘前置须点明客户确认（request_confirmation）");
});

test("J-1：派发 ≠ 授权——写权来源措辞与 H-1 逐字一致；不得在任务文本里代授权限", () => {
  assert.ok(T.includes("派发 ≠ 授权"), "须原样含「派发 ≠ 授权」");
  assert.ok(
    T.includes("目标角色的写权仍只来自它自己的 Section 1 与 `request_confirmation` 的 confirmed:true"),
    "写权来源措辞须与 H-1 的语义硬约束逐字一致",
  );
  assert.ok(T.includes("不得在任务文本里代授权限"), "须明禁在任务文本里代授权限");
});

test("J-1：失败语义——派发被拒/失败如实告知、不得假设已开工；无可派发角色停在「待客户指示」", () => {
  assert.ok(T.includes("如实告知客户"), "派发失败须如实告知客户");
  assert.ok(T.includes("不得假设已开工"), "不得把失败/被拒说成已开工");
  assert.ok(T.includes("若没有可派发的角色"), "须覆盖「没有可派发的角色」情形");
  assert.ok(T.includes("待客户指示"), "该情形须停在「待客户指示」");
});

test("J-1 反向断言：任何涉及「授权/获准/放行」的小句必须是禁止式/否定义，不得出现「已获授权」式表述", () => {
  // 小句级：凡含 授权/获准/放行 的小句，必须带否定/禁止标记（≠ / 不得 / 勿 / 禁止 / 非 / 不是）。
  const clauses = T.split(/[。；\n]/).filter((c) => /授权|获准|放行/.test(c));
  for (const c of clauses) {
    assert.match(c, /≠|不得|勿|禁止|非|不是/, `涉及「授权/获准/放行」的小句必须是否定/禁止表述，实得：${c}`);
  }
  // 定向反面模式：肯定式「派发=授权/已放行」类表述一律不得出现。
  for (const bad of ["派发即授权", "派发即放行", "派发等于授权", "即已获授权", "已放行写盘"]) {
    assert.equal(T.includes(bad), false, `不得出现「${bad}」式表述`);
  }
});

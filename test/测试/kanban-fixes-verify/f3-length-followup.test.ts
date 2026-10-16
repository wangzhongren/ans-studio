// 独立复验（测试角色，2026-10-16）：F-3 截断（stopReason=length）收尾补发与事实外推的对抗性核对。
// 用**自建桩件会话**驱动 makeRolePrompt + 真实 createTurnLifecycle（独立构造；不复用实施方
// test/pi-adapter/length-followup.test.ts 的断言语料）：
//  - 截断后恰一次收尾补发（第二轮文本 = 导出常量本身）；
//  - 截断系统行（外推事实）可见 + settled detail 携 truncation="length"（原样事实口径）；
//  - env 显式关闭值 ⇒ 不补发；已成功交报告 ⇒ 不补发。
import test from "node:test";
import assert from "node:assert/strict";
import type { SessionEvent } from "../../../src/model/runtime.ts";
import { createTurnLifecycle, LENGTH_TRUNCATION_SUMMARY } from "../../../src/common/pi-adapter/lifecycle.ts";
import {
  makeRolePrompt,
  LENGTH_FOLLOWUP_TEXT,
  LENGTH_FOLLOWUP_NOTICE_SUMMARY,
  isLengthFollowupDisabled,
  type PromptCapableSession,
} from "../../../src/common/pi-adapter/real-adapter.ts";

interface Emitted { event: SessionEvent }

function harness(script: Array<{ stopReason?: string }>) {
  const events: SessionEvent[] = [];
  const emit = (event: SessionEvent): void => { events.push(event); };
  const lifecycle = createTurnLifecycle(emit);
  const prompts: string[] = [];
  let call = 0;
  const session: PromptCapableSession = {
    async prompt(text: string): Promise<void> {
      const step = script[call] ?? { stopReason: "stop" };
      call += 1;
      prompts.push(text);
      // 模拟 message_end → lifecycle.observe（wireSettledOnce 的等价注入）。
      if (step.stopReason !== undefined) lifecycle.observe({ role: "assistant", stopReason: step.stopReason });
    },
    async abort(): Promise<void> {},
    dispose(): void {},
  };
  const log = { stage() {}, trace() {}, traceEnabled: false };
  const gate = { begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} };
  return { events, lifecycle, prompts, session, log, gate, get calls() { return call; } };
}

test("F-3 截断→恰一次补发：第二轮文本=常量；截断行与补发通知行各恰一条；settled 恰一次", async () => {
  const h = harness([{ stopReason: "length" }, { stopReason: "stop" }]);
  const prompt = makeRolePrompt({
    session: h.session, promptMs: 5000, gate: h.gate, emit: (e) => { h.events.push(e); },
    log: h.log as never, lifecycle: h.lifecycle, finishOnReturn: true,
    lengthFollowup: { enabled: true, text: LENGTH_FOLLOWUP_TEXT, wasReportSubmitted: () => false },
  });
  await prompt("第一轮正文");
  assert.equal(h.prompts.length, 2, "截断后应恰补发一轮");
  assert.equal(h.prompts[0], "第一轮正文");
  assert.equal(h.prompts[1], LENGTH_FOLLOWUP_TEXT, "补发文本 = 导出常量（不得各写一份）");
  const truncationRows = h.events.filter((e) => e.summary === LENGTH_TRUNCATION_SUMMARY);
  assert.equal(truncationRows.length, 1, "截断系统行恰一条（同轮不重复）");
  assert.equal((truncationRows[0].detail as { truncation?: string }).truncation, "length");
  const noticeRows = h.events.filter((e) => e.summary === LENGTH_FOLLOWUP_NOTICE_SUMMARY);
  assert.equal(noticeRows.length, 1, "补发通知行恰一条");
  const settled = h.events.filter((e) => e.kind === "settled");
  assert.equal(settled.length, 1, "settled 恰一次（补发不新增终态发射点）");
});

test("F-3 env 关闭即不补：显式关闭值解析为关；enabled:false → 恰一轮、无补发通知；settled 携截断事实", async () => {
  // ① env 解析（与 bindRole 合成 enabled 的同一函数）。
  assert.equal(isLengthFollowupDisabled({ ANS_PI_LENGTH_FOLLOWUP: "0" }), true);
  assert.equal(isLengthFollowupDisabled({ ANS_PI_LENGTH_FOLLOWUP: "OFF" }), true);
  assert.equal(isLengthFollowupDisabled({ ANS_PI_LENGTH_FOLLOWUP: "1" }), false);
  assert.equal(isLengthFollowupDisabled({}), false, "缺省开启");
  // ② 关闭路径行为：截断轮恰一轮、无补发行，且外推事实仍可见（透明性不随开关关）。
  const h = harness([{ stopReason: "length" }]);
  const prompt = makeRolePrompt({
    session: h.session, promptMs: 5000, gate: h.gate, emit: (e) => { h.events.push(e); },
    log: h.log as never, lifecycle: h.lifecycle, finishOnReturn: true,
    lengthFollowup: { enabled: false, text: LENGTH_FOLLOWUP_TEXT, wasReportSubmitted: () => false },
  });
  await prompt("体量过大的一轮");
  assert.equal(h.prompts.length, 1, "env/开关关闭 → 不得补发");
  assert.equal(h.events.filter((e) => e.summary === LENGTH_FOLLOWUP_NOTICE_SUMMARY).length, 0);
  assert.equal(h.events.filter((e) => e.summary === LENGTH_TRUNCATION_SUMMARY).length, 1, "关补发不关透明");
  const settled = h.events.filter((e) => e.kind === "settled");
  assert.equal(settled.length, 1);
  assert.equal((settled[0].detail as { truncation?: string }).truncation, "length", "settled detail 按原样事实携 truncation");
});

test("F-3 已成功交报告不催交：wasReportSubmitted=true → 恰一轮、无补发行", async () => {
  const h = harness([{ stopReason: "length" }]);
  const prompt = makeRolePrompt({
    session: h.session, promptMs: 5000, gate: h.gate, emit: (e) => { h.events.push(e); },
    log: h.log as never, lifecycle: h.lifecycle, finishOnReturn: true,
    lengthFollowup: { enabled: true, text: LENGTH_FOLLOWUP_TEXT, wasReportSubmitted: () => true },
  });
  await prompt("已交报告后的一次截断");
  assert.equal(h.prompts.length, 1, "本轮已有成功 submit_report ⇒ 不催交");
  assert.equal(h.events.filter((e) => e.summary === LENGTH_FOLLOWUP_NOTICE_SUMMARY).length, 0);
  assert.equal(h.events.filter((e) => e.summary === LENGTH_TRUNCATION_SUMMARY).length, 1);
});

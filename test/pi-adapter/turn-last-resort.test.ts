// 整轮时限两层语义（客户裁定 2026-10-17，PM 批准）：
// · 到点检查（promptMs／ANS_PI_PROMPT_TIMEOUT_MS）**不中止**主轮；
// · 最后兜底（turnLastResortMs，缺省 1 小时）才中止整轮；
// · 截断收尾补发段仍按检查时限有界（不继承 1 小时兜底）。
// 纯桩件、本地定时器；不发网络请求、不需要 Pi 安装。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTurnLifecycle } from "../../src/common/pi-adapter/lifecycle.ts";
import {
  LENGTH_FOLLOWUP_NOTICE_SUMMARY,
  LENGTH_FOLLOWUP_TEXT,
  makeRolePrompt,
  type PromptCapableSession,
} from "../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import type { SessionEvent } from "../../src/model/runtime.ts";

const silentLogger = { stage() {}, trace() {}, traceEnabled: false };
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function makeSession(prompt: (text: string) => Promise<void>): PromptCapableSession & { abortCalls: number } {
  const box = {
    abortCalls: 0,
    prompt,
    async abort() { box.abortCalls += 1; },
    dispose() {},
  };
  return box;
}

test("到点检查不中止主轮：promptMs 到点后轮次继续并正常完成", async () => {
  const events: SessionEvent[] = [];
  const session = makeSession(async () => { await sleep(120); });
  const prompt = makeRolePrompt({
    session,
    promptMs: 20, // 检查时限远小于实际耗时——若仍用于 abort，本测试会失败
    turnLastResortMs: 5000,
    gate: createInteractionGate(),
    emit: (event) => events.push(event),
    log: silentLogger,
  });

  const began = Date.now();
  await prompt("long-but-healthy");
  const elapsed = Date.now() - began;

  assert.ok(elapsed >= 100, `轮次应在检查时限之后继续运行（实际 ${elapsed}ms）`);
  assert.equal(events.filter((event) => event.kind === "settled" && (event.detail as { outcome?: string }).outcome === "timed_out").length, 0);
});

test("最后兜底到点中止整轮：错误与诊断标记均为「最后兜底」，与检查时限区分", async () => {
  const events: SessionEvent[] = [];
  const records: Array<{ event: string; detail?: Record<string, unknown> }> = [];
  const diagnostics = {
    record(event: string, detail?: Record<string, unknown>): void { records.push({ event, detail }); },
    error(): void {},
  } as unknown as Parameters<typeof makeRolePrompt>[0]["diagnostics"];
  const session = makeSession(() => new Promise<void>(() => {}));
  const prompt = makeRolePrompt({
    session,
    promptMs: 10, // 检查时限：不得触发中止
    turnLastResortMs: 90,
    abortTimeoutMs: 20,
    gate: createInteractionGate(),
    emit: (event) => events.push(event),
    log: silentLogger,
    diagnostics,
  });

  const began = Date.now();
  await assert.rejects(() => prompt("stuck"), (err: unknown) => {
    assert.match((err as Error).message, /最后兜底/);
    return true;
  });
  const elapsed = Date.now() - began;
  assert.ok(elapsed >= 60, `应在 last-resort（90ms）附近中止，而不是检查时限（10ms）；实际 ${elapsed}ms`);

  const lastResortRecord = records.find((record) => record.event === "prompt.turn_last_resort");
  assert.ok(lastResortRecord !== undefined, "诊断必须用 prompt.turn_last_resort 与普通超时区分");
  assert.equal(lastResortRecord!.detail!["errorCode"], "TURN_LAST_RESORT");
  assert.equal(records.some((record) => record.event === "prompt.timeout"), false);
  const settled = events.filter((event) => event.kind === "settled");
  assert.equal(settled.length, 1);
  assert.equal((settled[0].detail as { outcome?: string }).outcome, "timed_out");
});

test("截断收尾补发段仍用检查时限，不继承 last-resort", async () => {
  const events: SessionEvent[] = [];
  const lifecycle = createTurnLifecycle((event) => events.push(event));
  let calls = 0;
  const session = makeSession(() => {
    calls += 1;
    if (calls === 1) {
      // 主轮正常完成，但末条消息被截断 ⇒ 触发 F-3-a 补发。
      lifecycle.observe({ role: "assistant", stopReason: "length" });
      return Promise.resolve();
    }
    return new Promise<void>(() => {}); // 补发段永不返回
  });
  const prompt = makeRolePrompt({
    session,
    promptMs: 60, // 补发段时限＝检查时限
    turnLastResortMs: 5000, // 若补发误用兜底，本测试会挂住
    gate: createInteractionGate(),
    emit: (event) => events.push(event),
    log: silentLogger,
    lifecycle,
    requestAbort: async () => {},
    lengthFollowup: {
      enabled: true,
      text: LENGTH_FOLLOWUP_TEXT,
      wasReportSubmitted: () => false,
    },
  });

  const began = Date.now();
  await prompt("truncated");
  const elapsed = Date.now() - began;

  assert.ok(elapsed < 2000, `补发段应按检查时限（60ms）有界，实际 ${elapsed}ms`);
  assert.ok(events.some((event) => event.summary === LENGTH_FOLLOWUP_NOTICE_SUMMARY));
  assert.ok(events.some((event) => event.summary?.startsWith("收尾补发失败：") && event.summary.includes("超时")));
});

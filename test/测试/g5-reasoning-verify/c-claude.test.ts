// test/测试/g5-reasoning-verify/c-claude.test.ts —— C 域：Claude 适配器接线（独立验证，自建假 SDK）。
//
// 验证对象：`src/provider/claude/session.ts`（映射表未设/off/四档；thinking/redacted 捕获⇒事实；
// 降级判据＋会话级恰一次＋同输入原地重推＋此后零参数；负例双向）。
// 自建最小假 query（真 createSdkMcpServer/zod 保装配面真实；transport 假化），全部断言独立构造。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as realSdk from "@anthropic-ai/claude-agent-sdk";
import * as zod from "zod";
import type * as SDK from "@anthropic-ai/claude-agent-sdk";

import { createClaudeRuntimeAdapter } from "../../../src/provider/claude/session.ts";
import type { InteractionGate, RuntimeProviderOptions, RoleSession, SessionEvent } from "../../../src/model/runtime.ts";
import { makeRole } from "./helpers.ts";

function fakeGate(): InteractionGate {
  let waiting = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  return {
    begin() { waiting += 1; },
    end() { waiting = Math.max(0, waiting - 1); },
    isWaiting: () => waiting > 0,
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

const API_SECRET = "claude-g5-secret-317";

type Frame = Record<string, unknown>;
type Script = (queryIndex: number, userIndex: number, options: SDK.Options) => { frames?: Frame[]; fail?: string } | undefined;

interface FakeClaude {
  dependencies: { loadSdk: () => Promise<unknown>; loadZod: () => Promise<unknown>; env: Record<string, string | undefined> };
  configurations: Array<Record<string, unknown>>;
  users: Array<{ uuid: string; message: unknown }>;
  hookOutcomes: unknown[];
}

/** 自建假 query：每连接一个持久流（生产形状——连接跨轮存活）；每消费一条用户消息产出一轮帧＋result。
 *  UserPromptSubmit hook 按生产顺序先行调用（轮次关联是 result 成功路径的前提）。 */
function fakeClaude(script: Script): FakeClaude {
  const configurations: Array<Record<string, unknown>> = [];
  const users: Array<{ uuid: string; message: unknown }> = [];
  const hookOutcomes: unknown[] = [];
  let queryIndex = -1;
  const loadSdk = async () => ({
    createSdkMcpServer: realSdk.createSdkMcpServer,
    query: (input: { prompt: AsyncIterable<{ uuid: string; message: unknown }>; options: SDK.Options }) => {
      const index = ++queryIndex;
      configurations.push(input.options as unknown as Record<string, unknown>);
      let closed = false;
      let round = 0;
      const stream = (async function* () {
        for await (const user of input.prompt) {
          users.push(user);
          if (closed) return;
          const userIndex = round++;
          const content = (user.message as { content?: unknown }).content;
          const wireText = typeof content === "string" ? content : undefined;
          const hooks = (input.options as { hooks?: { UserPromptSubmit?: Array<{ hooks: Array<(hook: unknown, id?: unknown, opts?: unknown) => Promise<unknown>> }> } }).hooks;
          const hookFn = hooks?.UserPromptSubmit?.[0]?.hooks?.[0];
          if (wireText !== undefined && hookFn) {
            hookOutcomes.push(await hookFn({ hook_event_name: "UserPromptSubmit", prompt: wireText, prompt_id: `p-${index}-${userIndex}` }, "tool-0", { signal: new AbortController().signal }));
          }
          const outcome = script(index, userIndex, input.options) ?? {};
          for (const frame of outcome.frames ?? []) yield frame;
          yield {
            type: "result",
            subtype: outcome.fail !== undefined ? "error_during_execution" : "success",
            is_error: outcome.fail !== undefined,
            session_id: `native-${index}`,
            user_message_uuid: user.uuid,
            ...(outcome.fail !== undefined ? { result: outcome.fail } : {}),
          };
        }
      })();
      return Object.assign(stream, {
        close: () => { closed = true; },
        interrupt: async () => {},
        mcpServerStatus: async () => [],
      }) as unknown as SDK.Query;
    },
  });
  return { dependencies: { loadSdk, loadZod: async () => zod, env: { PATH: process.env.PATH, ANTHROPIC_API_KEY: API_SECRET } }, configurations, users, hookOutcomes };
}

function options(root: string, extra: Partial<RuntimeProviderOptions> = {}): RuntimeProviderOptions {
  return { runtime: "claude", projectRoot: root, skillRoot: root, tools: [], modelId: "fixture-model", currentTurnId: () => undefined, interactionGate: fakeGate(), ...extra };
}

function assistantFrame(content: unknown[]): Frame {
  return { type: "assistant", session_id: "native", message: { id: "msg-1", type: "message", role: "assistant", model: "fixture", content, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } };
}

async function drain(session: RoleSession): Promise<SessionEvent[]> {
  const rows: SessionEvent[] = [];
  const collector = (async () => { for await (const event of session.events()) rows.push(event); })();
  await session.dispose();
  await collector;
  return rows;
}

function tempRoot(): string { return mkdtempSync(join(tmpdir(), "g5-c-")); }

// —————————————————————— ① 映射表（未设零参数 / off / 四档直通 / max 不收编） ——————————————————————

test("C1 映射：未设零参数（无 thinking/effort 键）；off⇒thinking disabled；四档⇒effort 直通；max 不收编（零参数）", async () => {
  const cases: Array<{ effort?: RuntimeProviderOptions["reasoningEffort"]; expect: (cfg: Record<string, unknown>) => void; label?: string }> = [
    { label: "未设", expect: (cfg) => { assert.equal("thinking" in cfg, false); assert.equal("effort" in cfg, false); } },
    { effort: "off", expect: (cfg) => { assert.deepEqual(cfg.thinking, { type: "disabled" }); assert.equal("effort" in cfg, false); } },
    { effort: "low", expect: (cfg) => { assert.equal(cfg.effort, "low"); assert.equal("thinking" in cfg, false); } },
    { effort: "medium", expect: (cfg) => { assert.equal(cfg.effort, "medium"); assert.equal("thinking" in cfg, false); } },
    { effort: "high", expect: (cfg) => { assert.equal(cfg.effort, "high"); assert.equal("thinking" in cfg, false); } },
    { effort: "xhigh", expect: (cfg) => { assert.equal(cfg.effort, "xhigh"); assert.equal("thinking" in cfg, false); } },
    { effort: "max" as never, expect: (cfg) => { assert.equal("thinking" in cfg, false); assert.equal("effort" in cfg, false); }, label: "max（越界值——适配器不得收编）" },
  ];
  for (const cell of cases) {
    const root = tempRoot();
    try {
      const fake = fakeClaude(() => undefined);
      const session = await createClaudeRuntimeAdapter(options(root, cell.effort !== undefined ? { reasoningEffort: cell.effort } : {}), fake.dependencies as never).bindRole(makeRole("R-C"));
      await session.prompt(`cell-${cell.label ?? String(cell.effort)}`);
      assert.equal(fake.configurations.length, 1, cell.label ?? String(cell.effort));
      cell.expect(fake.configurations[0]!);
      await drain(session);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

// —————————————————————— ② thinking 捕获⇒事实（不预脱敏 / 空串⇒omitted / redacted / 无时长） ——————————————————————

test("C2 捕获：thinking 正文⇒complete 原始事实（不预脱敏）；空串⇒omitted；redacted_thinking⇒omitted；durationMs 恒不携带", async () => {
  const root = tempRoot();
  try {
    const fake = fakeClaude(() => ({ frames: [assistantFrame([
      { type: "thinking", thinking: `原始思维含凭据 ${API_SECRET}`, signature: "s1" },
      { type: "thinking", thinking: "", signature: "s2" },
      { type: "redacted_thinking", data: "opaque" },
      { type: "text", text: "正文答案" },
    ])] }));
    const session = await createClaudeRuntimeAdapter(options(root), fake.dependencies as never).bindRole(makeRole("R-C"));
    const rowsPromise = (async () => { const out: SessionEvent[] = []; for await (const event of session.events()) out.push(event); return out; })();
    await session.prompt("capture");
    await session.dispose();
    const rows = await rowsPromise;
    const reasoning = rows.filter((row) => (row.detail as { source?: string } | undefined)?.source === "reasoning");
    assert.equal(reasoning.length, 3, "三个思考块恰三行事实");
    for (const row of reasoning) {
      assert.equal(row.kind, "message");
      assert.equal(row.summary, "已思考");
      assert.equal((row.detail as { version?: number }).version, 1);
      const facts = (row.detail as { reasoning: Record<string, unknown> }).reasoning;
      assert.equal("durationMs" in facts, false, "durationMs 恒不携带（2.1.299 帧无真实分段时长信号）");
    }
    assert.deepEqual((reasoning[0]!.detail as { reasoning: unknown }).reasoning, { text: `原始思维含凭据 ${API_SECRET}`, status: "complete" }, "原始事实不预脱敏（投影单点在 Service）");
    assert.equal(JSON.stringify(reasoning[0]!.detail).includes(API_SECRET), true, "适配器层不脱敏（原样交给单点）");
    assert.deepEqual((reasoning[1]!.detail as { reasoning: unknown }).reasoning, { text: "", status: "omitted" }, "空串思考⇒omitted");
    assert.deepEqual((reasoning[2]!.detail as { reasoning: unknown }).reasoning, { text: "", status: "omitted" }, "redacted⇒omitted");
    assert.ok(rows.some((row) => row.kind === "message" && row.summary === "正文答案"), "正文行行为零改动");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// —————————————————————— ③ 降级：判据双向 / 恰一次 / 同输入原地重推 / 此后零参数 ——————————————————————

test("C3 降级正向：4xx＋参数词元 ⇒ 恰一次去参数重发（新引擎无参数）、同输入原地重推、本轮继续；此后零参数", async () => {
  const root = tempRoot();
  try {
    const fake = fakeClaude((index) => index === 0 ? { fail: "API Error: 400 gateway rejects output_config effort for this endpoint" } : undefined);
    const session = await createClaudeRuntimeAdapter(options(root, { reasoningEffort: "high" }), fake.dependencies as never).bindRole(makeRole("R-C"));
    const rowsPromise = (async () => { const out: SessionEvent[] = []; for await (const event of session.events()) out.push(event); return out; })();
    await session.prompt("带推理的首轮");
    assert.equal(fake.configurations.length, 2, "恰一次重建（首失败＋重发）");
    assert.equal(fake.configurations[0]!.effort, "high", "首引擎带 effort");
    assert.equal("thinking" in fake.configurations[1]!, false);
    assert.equal("effort" in fake.configurations[1]!, false, "重发引擎零推理参数");
    // 同输入原地重推：同 uuid、同 message 逐字（含 [ANS_INPUT_CONTEXT] 前缀）。
    assert.equal(fake.users.length, 2, "同轮恰两次投递（原发＋重发）");
    assert.equal(fake.users[0]!.uuid, fake.users[1]!.uuid, "同 uuid");
    assert.equal(JSON.stringify(fake.users[0]!.message), JSON.stringify(fake.users[1]!.message), "同输入逐字重推");
    // 此后零参数：第二轮复用重发引擎（无第三次连接）。
    await session.prompt("次轮");
    assert.equal(fake.configurations.length, 2, "次轮不重建（沿用去参数引擎）");
    assert.equal(fake.users.length, 3);
    await session.dispose();
    const rows = await rowsPromise;
    const notices = rows.filter((row) => row.kind === "message" && String(row.summary).includes("网关不支持推理参数"));
    assert.equal(notices.length, 1, "如实一行恰一次");
    const settled = rows.filter((row) => row.kind === "settled");
    assert.equal(settled.length, 2, "settled 单点（每轮恰一；失败尝试不产 settled）");
    assert.deepEqual(settled.map((row) => (row.detail as { outcome: string }).outcome), ["completed", "completed"], "降级后本轮按成功收场");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("C3b 降级负例双向：5xx 带词元不识别；4xx 无词元不识别；未设会话同文案不降级（不重建、失败如实上抛）", async () => {
  const negatives: Array<{ fail: string; effort?: RuntimeProviderOptions["reasoningEffort"]; label: string }> = [
    { fail: "API Error: 500 upstream unstable while handling thinking", effort: "low", label: "5xx 带词元" },
    { fail: "API Error: 400 plain rate limit exceeded", effort: "low", label: "4xx 无词元" },
    { fail: "API Error: 400 rejects effort", label: "未设会话（无参数可去）" },
    { fail: "network reset while streaming thinking", effort: "low", label: "非 API Error 形态" },
  ];
  for (const cell of negatives) {
    const root = tempRoot();
    try {
      const fake = fakeClaude(() => ({ fail: cell.fail }));
      const session = await createClaudeRuntimeAdapter(options(root, cell.effort !== undefined ? { reasoningEffort: cell.effort } : {}), fake.dependencies as never).bindRole(makeRole("R-C"));
      const rowsPromise = (async () => { const out: SessionEvent[] = []; for await (const event of session.events()) out.push(event); return out; })();
      await assert.rejects(session.prompt("boom"), /Claude/, cell.label + " 如实失败上抛");
      assert.equal(fake.configurations.length, 1, cell.label + "：不重建（未识别）");
      assert.equal(fake.users.length, 1, cell.label + "：不重发");
      await session.dispose();
      const rows = await rowsPromise;
      assert.equal(rows.some((row) => String(row.summary).includes("网关不支持推理参数")), false, cell.label + "：无降级行");
      assert.equal((rows.filter((row) => row.kind === "settled").at(-1)!.detail as { outcome: string }).outcome, "failed", cell.label + "：失败终态");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("C3c 降级闸会话级恰一次：重发仍被拒 ⇒ 无第二次重发；本会话后续轮次不再触发（引擎已零参数）", async () => {
  const root = tempRoot();
  try {
    const fake = fakeClaude((index) => ({ fail: `API Error: 403 thinking rejected (attempt ${index})` }));
    const session = await createClaudeRuntimeAdapter(options(root, { reasoningEffort: "off" }), fake.dependencies as never).bindRole(makeRole("R-C"));
    const rowsPromise = (async () => { const out: SessionEvent[] = []; for await (const event of session.events()) out.push(event); return out; })();
    await assert.rejects(session.prompt("首轮"), /Claude/);
    assert.equal(fake.configurations.length, 2, "首失败 + 恰一次重发（重发再拒不再重建）");
    // 次轮：引擎已零参数（重发引擎），失败仍如实（不再产降级行——闸已关）。
    await assert.rejects(session.prompt("次轮"), /Claude/);
    assert.equal(fake.configurations.length, 3, "次轮换新引擎重建（上轮失败关引擎），但声称零参数");
    assert.equal("thinking" in fake.configurations[2]!, false, "此后零参数（含 off 档）");
    assert.equal("effort" in fake.configurations[2]!, false);
    await session.dispose();
    const rows = await rowsPromise;
    assert.equal(rows.filter((row) => String(row.summary).includes("网关不支持推理参数")).length, 1, "降级行会话级恰一次");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

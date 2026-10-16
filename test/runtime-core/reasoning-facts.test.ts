// test/runtime-core/reasoning-facts.test.ts —— G-5 推理事实通道（wave 1 契约层）：
// ① 投影单点形状钉（原始事实 → 呈现详情；text 一律 DisplayTextV1）；
// ② 如实面（omitted＝正文不呈现；durationMs 仅真实信号、非法丢弃、绝不发明时间）；
// ③ 保护面（凭据替换/清洁管道/UTF-8 字节预算）；④ 幂等（重复投影形状不变）与坏件诊断（绝不抛）；
// ⑤ Service 单点接线（emit 恰一次投影、summary 定格、turnId 保留、原始正文绝不外流）；
// ⑥ 持久化/回放同形（存储面只见投影形；历史读取对存量投影与手编原始事实都过同一单点）。
import { registerControlledDisplayProfile } from './fixtures.ts';
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntimeAdapter, readRuntimeSessionHistory } from "../../src/service/runtime/session.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import { createToolDisplayContext } from "../../src/common/runtime-core/tool-display.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { REASONING_DIAGNOSTIC_SUMMARY, REASONING_EVENT_SUMMARY } from "../../src/common/runtime-core/reasoning.ts";
import type { RoleSession, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent } from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";

const raw = (reasoning: Record<string, unknown>) => ({ version: 1, source: "reasoning", reasoning }) as never;
const projectedOf = (value: unknown) => value as { version: number; source: string; reasoning: { text: { text: string; truncated: boolean; redacted: boolean }; status: string; durationMs?: number } };

test("文案常量定格：投影 summary 两条（消费方回退标签；措辞变化须显式改契约）", () => {
  assert.equal(REASONING_EVENT_SUMMARY, "已思考");
  assert.equal(REASONING_DIAGNOSTIC_SUMMARY, "推理内容无法安全显示");
});

test("形状钉：原始事实 → 呈现详情（text 为 DisplayTextV1 三字段；status/durationMs 透传；无多余字段）", () => {
  const context = createToolDisplayContext({ env: {} });
  assert.deepEqual(context.projectReasoningDetail(raw({ text: "先想 A，再想 B", status: "complete", durationMs: 1234 })), {
    version: 1, source: "reasoning",
    reasoning: { text: { text: "先想 A，再想 B", truncated: false, redacted: false }, status: "complete", durationMs: 1234 },
  });
  assert.deepEqual(context.projectReasoningDetail(raw({ text: "", status: "complete" })), {
    version: 1, source: "reasoning",
    reasoning: { text: { text: "", truncated: false, redacted: false }, status: "complete" },
  }, "text 合法为空串不是坏件；无 durationMs 键＝不携带");
});

test("如实面：omitted＝平台省略正文（违规随载荷带正文也按省略归一为空、不呈现）；status 未知＝诊断（不发明新态）", () => {
  const context = createToolDisplayContext({ env: {} });
  assert.deepEqual(context.projectReasoningDetail(raw({ text: "", status: "omitted" })), {
    version: 1, source: "reasoning",
    reasoning: { text: { text: "", truncated: false, redacted: false }, status: "omitted" },
  });
  const violating = projectedOf(context.projectReasoningDetail(raw({ text: "不该出现", status: "omitted" })));
  assert.equal(violating.source, "reasoning");
  assert.equal(violating.reasoning.text.text, "", "omitted 契约：正文一律不呈现（如实优先于保留违规内容）");
  const unknownState = context.projectReasoningDetail(raw({ text: "x", status: "running" }));
  assert.deepEqual(unknownState, { version: 1, source: "reasoning-diagnostic", code: "PROJECTION_FAILED" }, "「进行中」不是本通道的态——不发明");
});

test("如实面：durationMs 仅真实信号（0＝真实保留；负数/NaN/Infinity/非数字一律丢弃——绝不发明时间）", () => {
  const context = createToolDisplayContext({ env: {} });
  for (const value of [-1, NaN, Infinity, "12", null, true]) {
    const projected = projectedOf(context.projectReasoningDetail(raw({ text: "想", status: "complete", durationMs: value })));
    assert.equal(projected.source, "reasoning");
    assert.ok(!("durationMs" in projected.reasoning), `durationMs=${String(value)} 应被丢弃`);
  }
  const zero = projectedOf(context.projectReasoningDetail(raw({ text: "想", status: "complete", durationMs: 0 })));
  assert.equal(zero.reasoning.durationMs, 0, "0 是真实信号，保留");
});

test("保护面：凭据值替换（redacted:true）＋清洁管道（Bearer/URL）＋UTF-8 字节预算（truncated:true、无截断鬼影）", () => {
  const context = createToolDisplayContext({ env: { FIXTURE_EFFORT_KEY: "sekret-value-1" }, credentialEnvNames: ["FIXTURE_EFFORT_KEY"] });
  const projected = projectedOf(context.projectReasoningDetail(raw({ text: "用 sekret-value-1 请求 Bearer abcdef123456 https://u:p@host/p?q=1#f 后继续想", status: "complete" })));
  for (const secret of ["sekret-value-1", "abcdef123456", "u:p", "q=1", "#f"]) assert.ok(!projected.reasoning.text.text.includes(secret), secret);
  assert.equal(projected.reasoning.text.redacted, true);
  const long = projectedOf(context.projectReasoningDetail(raw({ text: "中😀".repeat(20000), status: "complete" })));
  assert.equal(long.reasoning.text.truncated, true);
  assert.ok(Buffer.byteLength(long.reasoning.text.text) <= 16384, "正文预算＝工具结果同档（16384 字节）");
  assert.ok(!long.reasoning.text.text.includes("�"), "UTF-8 边界不留截断鬼影");
});

test("幂等：已投影形再投影，形状与标记不变（历史读取路径的再投影即此性质）", () => {
  const context = createToolDisplayContext({ env: { FIXTURE_EFFORT_KEY: "sekret-value-1" }, credentialEnvNames: ["FIXTURE_EFFORT_KEY"] });
  const once = context.projectReasoningDetail(raw({ text: "含 sekret-value-1 的思考", status: "complete", durationMs: 88 }));
  if (once.source !== "reasoning") assert.fail("应为投影形");
  assert.deepEqual(context.projectReasoningDetail(once), once);
});

test("坏件 ⇒ 如实诊断形（绝不抛、绝不假内容）：版本/source/status/text 形状逐项", () => {
  const context = createToolDisplayContext({ env: {} });
  const bad = [
    undefined, null, 42, "reasoning", {},
    { version: 2, source: "reasoning", reasoning: { text: "x", status: "complete" } },
    { version: 1, source: "other", reasoning: { text: "x", status: "complete" } },
    { version: 1, source: "reasoning", reasoning: { status: "complete" } },
    { version: 1, source: "reasoning", reasoning: { text: 7, status: "complete" } },
    { version: 1, source: "reasoning", reasoning: null },
    { version: 1, source: "reasoning", reasoning: { text: { text: 7 }, status: "complete" } },
  ];
  for (const value of bad) {
    assert.deepEqual(context.projectReasoningDetail(value as never), { version: 1, source: "reasoning-diagnostic", code: "PROJECTION_FAILED" }, JSON.stringify(value) ?? "undefined");
  }
});

/** 最小受控 provider：prompt 时把脚本事件推入内层队列，末了 settled 收口。 */
function reasoningSession(script: SessionEvent[]): RuntimeProviderFactory {
  return (options) => (registerControlledDisplayProfile(options), {
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole(): Promise<RoleSession> {
      const queue = createEventQueue<SessionEvent>();
      return {
        contextSource: options.storage ? "fresh" : "in-memory",
        async prompt() {
          for (const event of script) queue.push(event);
          queue.push({ kind: "settled", summary: "收口", detail: { outcome: "completed" } });
        },
        events: () => queue.stream,
        async dispose() { queue.close(); },
      };
    },
  });
}

test("Service 单点：原始推理事实在 emit 恰一次投影（summary 定格、turnId 保留、原始正文与随载荷 summary 绝不外流）；坏件走如实诊断行；非推理事件逐字现状", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-reasoning-"));
  const priorKey = process.env.FIXTURE_EFFORT_KEY;
  process.env.FIXTURE_EFFORT_KEY = "FIXTURE-SECRET-9";
  try {
    const script: SessionEvent[] = [
      { kind: "message", summary: "RAW-SUMMARY-NEVER-SHOWN", detail: { version: 1, source: "reasoning", reasoning: { text: "推理正文含 FIXTURE-SECRET-9 与 https://u:p@h/x?q=1", status: "complete", durationMs: 2500 } } },
      { kind: "message", summary: "bad raw", detail: { version: 1, source: "reasoning", reasoning: { text: "x", status: "running" } } },
      { kind: "message", summary: "正常回复不动" },
    ];
    const session = await createRuntimeAdapter({
      runtime: "claude", gate: allow, projectRoot: root, skillRoot: root, apiKeyEnvVar: "FIXTURE_EFFORT_KEY",
      providerFactories: { claude: reasoningSession(script) },
    }).bindRole(role());
    const events: SessionEvent[] = [];
    const pump = (async () => { for await (const event of session.events()) events.push(event); })();
    await session.prompt("go");
    await session.dispose();
    await pump;

    const projected = events.find((event) => (event.detail as { source?: string } | undefined)?.source === "reasoning")!;
    assert.equal(projected.summary, REASONING_EVENT_SUMMARY, "summary 定格（随载荷 summary 绝不外流）");
    const detail = projected.detail as { reasoning: { text: { text: string; truncated: boolean; redacted: boolean }; status: string; durationMs?: number }; turnId?: unknown };
    assert.equal(detail.reasoning.status, "complete");
    assert.equal(detail.reasoning.durationMs, 2500);
    assert.equal(typeof detail.reasoning.text.text, "string", "所见即投影形（text 为 DisplayTextV1）");
    assert.equal(detail.reasoning.text.redacted, true);
    assert.equal(typeof detail.turnId, "string", "pump 并入的 turnId 在投影后保留");
    assert.equal(projected.roleId, "core");
    assert.equal(projected.runtime, "claude");
    const dump = JSON.stringify(events);
    assert.ok(!dump.includes("FIXTURE-SECRET-9"), "原始凭据绝不出现在任何事件");
    assert.ok(!dump.includes("RAW-SUMMARY-NEVER-SHOWN"), "随载荷 summary 绝不外流");

    const diagnostic = events.find((event) => (event.detail as { source?: string } | undefined)?.source === "reasoning-diagnostic")!;
    assert.equal(diagnostic.summary, REASONING_DIAGNOSTIC_SUMMARY);
    const diagDetail = diagnostic.detail as { version: number; code: string; turnId?: unknown };
    assert.equal(diagDetail.version, 1);
    assert.equal(diagDetail.code, "PROJECTION_FAILED");
    assert.equal(typeof diagDetail.turnId, "string");

    assert.ok(events.some((event) => event.summary === "正常回复不动"), "非推理事件逐字现状（回归钉）");
  } finally {
    if (priorKey === undefined) delete process.env.FIXTURE_EFFORT_KEY;
    else process.env.FIXTURE_EFFORT_KEY = priorKey;
    await rm(root, { recursive: true, force: true });
  }
});

test("持久化/回放同形：存储面只见投影形且无原始凭据；历史读取对存量投影（幂等）与手编原始事实（同管道）都过同一单点", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-reasoning-store-"));
  const priorKey = process.env.FIXTURE_STORE_KEY;
  process.env.FIXTURE_STORE_KEY = "STORED-SECRET-7";
  try {
    const script: SessionEvent[] = [
      { kind: "message", summary: "raw", detail: { version: 1, source: "reasoning", reasoning: { text: "含 STORED-SECRET-7 的正文", status: "complete" } } },
    ];
    const session = await createRuntimeAdapter({
      runtime: "pi", gate: allow, projectRoot: root, skillRoot: root, persistSession: true, apiKeyEnvVar: "FIXTURE_STORE_KEY",
      providerFactories: { pi: reasoningSession(script) },
    }).bindRole(role());
    const pump = (async () => { for await (const _event of session.events()) { /* drain */ } })();
    await session.prompt("go");
    await session.dispose();
    await pump;

    const store = createRuntimeSessionStore({ projectRoot: root, roleId: "core", runtime: "pi" });
    const stored = await store.readReplay();
    const reasoningEntry = stored.find((entry) => (entry.event?.detail as { source?: string } | undefined)?.source === "reasoning");
    assert.ok(reasoningEntry, "推理事件已随会话持久化");
    const storedText = (reasoningEntry!.event!.detail as { reasoning: { text: { text: string; redacted: boolean } } }).reasoning.text;
    assert.equal(typeof storedText, "object", "存储面即投影形（text 为 DisplayTextV1，绝非原始字符串形）");
    assert.equal(storedText.redacted, true);
    assert.ok(!JSON.stringify(stored).includes("STORED-SECRET-7"), "回放盘面绝不含原始凭据");

    // 手编原始事实（模拟旧版本/手改盘面）⇒ 历史读取也过同一单点。
    await store.appendReplay([{ at: "2026-10-16T00:00:00.000Z", kind: "event", turnId: "t-legacy", event: { kind: "message", summary: "旧", runtime: "pi", roleId: "core", turnId: "t-legacy", detail: { version: 1, source: "reasoning", reasoning: { text: "旧版原始正文", status: "complete" } } } }]);
    const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "core", runtime: "pi" });
    const legacy = history.entries.find((entry) => entry.turnId === "t-legacy")!;
    const legacyText = (legacy.event!.detail as { reasoning: { text: { text: string } } }).reasoning.text;
    assert.equal(typeof legacyText, "object", "历史读取把原始正文归一到投影形");
    assert.equal(legacyText.text, "旧版原始正文");
    const keptEntry = history.entries.find((entry) => (entry.event?.detail as { source?: string } | undefined)?.source === "reasoning" && entry.turnId !== "t-legacy");
    assert.ok(keptEntry, "存量投影形照常读出（幂等再投影不改变形状）");
  } finally {
    if (priorKey === undefined) delete process.env.FIXTURE_STORE_KEY;
    else process.env.FIXTURE_STORE_KEY = priorKey;
    await rm(root, { recursive: true, force: true });
  }
});

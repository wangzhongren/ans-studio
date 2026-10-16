// F-3-a / F-3-b（kanban-live 截断修复，客户已批准）：截断事实外推 + 限一次收尾补发。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（SDK 级用例内部动态 import，未安装则跳过）。
//
// 覆盖（对应提案 docs/fix/2026-10-15_fix_kanban-turn-truncation.md §五）：
//   A. lifecycle 单测（stub）：截断识别/通知恰一次/begin 归零/settled detail truncation/outcome 映射回归；
//   B. makeRolePrompt 接线单测（脚本化桩件会话）：补发触发且限一次、env 关闭即不补、已交报告不催、
//      第一轮失败不补、补发失败 best-effort（不改判 outcome，含清理期间迟到 aborted settle 的 seal 防护）、
//      abort 锁定不补、缺省不传逐字旧行为；
//   C. 真实 SDK 端到端（faux provider，离线）：截断→补发→submit_report 同 turnId 回交（开关开/关对照）；
//   D. 环境开关解析（ANS_PI_LENGTH_FOLLOWUP：显式关闭值才关、缺省开启）。
//
// 诚实边界（勿松断言）：本层只保证「给模型第二次机会」与「截断如实可见」；报告必须来自模型自己的
// submit_report（绝不由系统合成）；补发失败不改变本轮既有结果（诚实降级由编排照旧处理）。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createTurnLifecycle,
  LENGTH_TRUNCATION_SUMMARY,
  type DiagnosticLog,
  type TurnLifecycle,
  type TurnOutcome,
} from "../../src/common/pi-adapter/lifecycle.ts";
import {
  isLengthFollowupDisabled,
  LENGTH_FOLLOWUP_ENV,
  LENGTH_FOLLOWUP_NOTICE_SUMMARY,
  LENGTH_FOLLOWUP_TEXT,
  makeRolePrompt,
  toPiTool,
  wireSettledOnce,
  type LengthFollowupOptions,
  type PromptCapableSession,
} from "../../src/common/pi-adapter/real-adapter.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import type { StageLogger } from "../../src/common/pi-adapter/logger.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import type { PromptImage, SessionEvent } from "../../src/model/runtime.ts";
import { makeGate } from "./fixtures.ts";

function silentLogger(): StageLogger {
  return { stage: () => {}, trace: () => {}, traceEnabled: false };
}

/** 记录诊断事件的假 logger（只实现 makeRolePrompt/lifecycle 用到的 record/error）。 */
function fakeDiagnostics(): { records: Array<{ event: string; fields?: Record<string, unknown> }>; log: DiagnosticLog } {
  const records: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const log = {
    record(event: string, fields?: Record<string, unknown>): void { records.push({ event, fields }); },
    error(event: string, err: unknown, fields?: Record<string, unknown>): void {
      records.push({ event, fields: { ...fields, errorType: err instanceof Error ? err.name : typeof err } });
    },
  };
  return { records, log: log as DiagnosticLog };
}

function countSummary(events: SessionEvent[], text: string): number {
  return events.filter((event) => event.summary === text).length;
}

// —————————————————————— A. lifecycle 单测（stub） ——————————————————————

test("A1 observe(length)：恰一条截断系统行 + 诊断记录；同轮第二条不重复；settled detail 含 truncation（outcome 不变）", () => {
  const events: SessionEvent[] = [];
  const { records, log } = fakeDiagnostics();
  const turn = createTurnLifecycle((event) => events.push(event), log);
  turn.begin();
  const id = turn.currentTurnId();

  turn.observe({ role: "assistant", stopReason: "length", content: [] });
  assert.equal(turn.wasTruncated(), true, "末条消息截断 ⇒ wasTruncated() 为真");
  turn.observe({ role: "assistant", stopReason: "length", content: [] });

  const notes = events.filter((event) => (event.detail as Record<string, unknown> | undefined)?.truncation === "length");
  assert.equal(notes.length, 1, "同轮第二条 length 不得重复发通知");
  assert.equal(notes[0]!.kind, "message", "截断行 kind 仍取冻结集内的 message");
  assert.equal(notes[0]!.summary, LENGTH_TRUNCATION_SUMMARY);
  assert.equal((notes[0]!.detail as Record<string, unknown>).turnId, id);
  assert.equal(records.filter((record) => record.event === "prompt.truncated").length, 1, "诊断记录同轮恰一条");

  turn.finish();
  const settled = events.filter((event) => event.kind === "settled");
  assert.equal(settled.length, 1);
  const detail = settled[0]!.detail as Record<string, unknown>;
  assert.equal(detail.outcome, "completed", "length 归 completed 的既有映射不变（绝不误报失败）");
  assert.equal(detail.truncation, "length");
});

test("A2 observe(length) 后 observe(stop)（模拟补发成功轮）：settled detail 不含 truncation；通知仍只一条", () => {
  const events: SessionEvent[] = [];
  const turn = createTurnLifecycle((event) => events.push(event));
  turn.begin();
  const id = turn.currentTurnId();
  turn.observe({ role: "assistant", stopReason: "length", content: [] });
  turn.observe({ role: "assistant", stopReason: "stop", content: [] });
  assert.equal(turn.wasTruncated(), false, "末条为正常完成 ⇒ 不可再视为截断");
  turn.finish();
  const settled = events.filter((event) => event.kind === "settled");
  assert.deepEqual(settled[0]!.detail, { turnId: id, outcome: "completed" }, "无截断时 settled detail 保持旧形状（只增字段、无残留）");
  assert.equal(countSummary(events, LENGTH_TRUNCATION_SUMMARY), 1);
});

test("A3 begin() 归零：新一轮 wasTruncated()==false；新截断重新计数通知", () => {
  const events: SessionEvent[] = [];
  const turn = createTurnLifecycle((event) => events.push(event));
  turn.begin();
  turn.observe({ role: "assistant", stopReason: "length", content: [] });
  turn.finish();
  assert.equal(countSummary(events, LENGTH_TRUNCATION_SUMMARY), 1);

  turn.begin();
  assert.equal(turn.wasTruncated(), false, "begin() 后旧轮截断标志不得残留");
  turn.observe({ role: "assistant", stopReason: "length", content: [] });
  assert.equal(countSummary(events, LENGTH_TRUNCATION_SUMMARY), 2, "新一轮首次截断应重新发通知");
});

test("A4 回归底线：length 不影响既有 outcome 映射（length→completed；其后 error→failed；forced 后 length 被忽略）", () => {
  // (a) length 单独 → completed（A1 已证）。
  // (b) length 后跟 error → failed，且 settled 不带 truncation（末条为 error）。
  const eventsB: SessionEvent[] = [];
  const turnB = createTurnLifecycle((event) => eventsB.push(event));
  turnB.begin();
  turnB.observe({ role: "assistant", stopReason: "length", content: [] });
  turnB.observe({ role: "assistant", stopReason: "error", content: [] });
  turnB.finish();
  const detailB = eventsB.filter((event) => event.kind === "settled")[0]!.detail as Record<string, unknown>;
  assert.equal(detailB.outcome, "failed");
  assert.equal(detailB.errorCode, "MODEL_ERROR");
  assert.equal("truncation" in detailB, false, "末条消息为 error ⇒ 不标 truncation");

  // (c) fail("aborted") 后 length 消息被 forced 守卫忽略 → outcome=aborted、wasTruncated()=false、无截断行。
  const eventsC: SessionEvent[] = [];
  const turnC = createTurnLifecycle((event) => eventsC.push(event));
  turnC.begin();
  turnC.fail("aborted", "ABORTED");
  turnC.observe({ role: "assistant", stopReason: "length", content: [] });
  turnC.finish();
  const detailC = eventsC.filter((event) => event.kind === "settled")[0]!.detail as Record<string, unknown>;
  assert.equal(detailC.outcome, "aborted");
  assert.equal(turnC.wasTruncated(), false);
  assert.equal(countSummary(eventsC, LENGTH_TRUNCATION_SUMMARY), 0, "被中止锁定的轮次不报截断");
});

// —————————————————————— B. makeRolePrompt 接线（脚本化桩件会话） ——————————————————————

type StubListener = (event: { type: string; message?: unknown; aborted?: boolean }) => void;

interface StubTurnScript {
  /** 本次 prompt 触发的助手消息 stopReason（省略则不触发任何消息）。 */
  stop?: string;
  /** 事件前先抛出（模拟无消息的 API 错误）。 */
  throwBeforeEvents?: string;
  /** 事件前先 fail（真实中止顺序：fail() 先于中止消息落地；observe 随即被 forced 忽略）。 */
  failBeforeEvents?: [TurnOutcome, string];
  /** 事件后 fail（模拟「截断消息已落地后才被中止」的竞态锁定——补发判据须仍挡下）。 */
  failAfterEvents?: [TurnOutcome, string];
  /** 事件后挂起不 resolve（模拟补发段卡死，由独立时限 + abort 收尾）。 */
  hang?: boolean;
  /** 事件后抛出（模拟补发段自身的异常）。 */
  throwAfterEvents?: string;
}

/** 脚本化桩件会话：第 N 次 prompt 消费 scripts[N-1]；经 subscribe 回放 message_end/agent_settled。 */
function makeStubSession(scripts: StubTurnScript[], lifecycle: TurnLifecycle): {
  session: PromptCapableSession & { subscribe: (listener: StubListener) => () => void };
  calls: string[];
  aborts: number;
  /** 模拟真实 abort 清理链路：SDK 在清理期间发来迟到的 aborted settle + 中止消息。 */
  emitLateAbort(): void;
} {
  const box = {
    calls: [] as string[],
    aborts: 0,
    emitLateAbort: undefined as unknown as () => void,
    session: undefined as unknown as PromptCapableSession & { subscribe: (listener: StubListener) => () => void },
  };
  let listener: StubListener | undefined;
  const session = {
    async prompt(text: string): Promise<void> {
      const script = scripts[box.calls.length] ?? {};
      box.calls.push(text);
      if (script.throwBeforeEvents !== undefined) throw new Error(script.throwBeforeEvents);
      if (script.failBeforeEvents !== undefined) lifecycle.fail(script.failBeforeEvents[0], script.failBeforeEvents[1]);
      if (script.stop !== undefined) {
        listener?.({ type: "message_end", message: { role: "assistant", stopReason: script.stop, content: [] } });
        listener?.({ type: "agent_settled" });
      }
      if (script.failAfterEvents !== undefined) lifecycle.fail(script.failAfterEvents[0], script.failAfterEvents[1]);
      if (script.hang === true) return new Promise<void>(() => {});
      if (script.throwAfterEvents !== undefined) throw new Error(script.throwAfterEvents);
    },
    async abort(): Promise<void> { box.aborts += 1; },
    dispose(): void {},
    subscribe(fn: StubListener): () => void {
      listener = fn;
      return () => { listener = undefined; };
    },
  };
  box.emitLateAbort = (): void => {
    listener?.({ type: "message_end", message: { role: "assistant", stopReason: "aborted", content: [] } });
    listener?.({ type: "agent_settled", aborted: true });
  };
  box.session = session;
  return box;
}

interface HarnessOptions {
  /** lengthFollowup.enabled（缺省 true）。 */
  enabled?: boolean;
  /** false → 完全不传 lengthFollowup（旧直接调用方路径）。 */
  withConfig?: boolean;
  wasReportSubmitted?: () => boolean;
  followupTimeoutMs?: number;
  promptMs?: number;
  /** requestAbort 清理期间模拟 SDK 迟到的 aborted settle（真实链路必现——钉 seal 防改判）。 */
  lateAbortSettleDuringCleanup?: boolean;
}

function makeHarness(scripts: StubTurnScript[], options: HarnessOptions = {}) {
  const events: SessionEvent[] = [];
  const emit = (event: SessionEvent): void => { events.push(event); };
  const { records, log: diagnostics } = fakeDiagnostics();
  const lifecycle = createTurnLifecycle(emit, diagnostics);
  const box = makeStubSession(scripts, lifecycle);
  const unsubscribe = wireSettledOnce(box.session, emit, lifecycle);
  const followup: LengthFollowupOptions | undefined = options.withConfig === false
    ? undefined
    : {
        enabled: options.enabled !== false,
        text: LENGTH_FOLLOWUP_TEXT,
        ...(options.followupTimeoutMs !== undefined ? { timeoutMs: options.followupTimeoutMs } : {}),
        wasReportSubmitted: options.wasReportSubmitted ?? (() => false),
      };
  const prompt = makeRolePrompt({
    session: box.session,
    promptMs: options.promptMs ?? 1000,
    gate: createInteractionGate(),
    emit,
    log: silentLogger(),
    lifecycle,
    diagnostics,
    // requestAbort 为 spy：断言「补发失败走既有有界清理路径」而不真的中止桩件；
    // 可选在清理期间回放迟到的 aborted settle（模拟真实 SDK——seal 后不得改判本轮 outcome）。
    requestAbort: async () => {
      box.aborts += 1;
      if (options.lateAbortSettleDuringCleanup === true) box.emitLateAbort();
    },
    ...(followup !== undefined ? { lengthFollowup: followup } : {}),
  });
  const settled = (): SessionEvent[] => events.filter((event) => event.kind === "settled");
  return { events, records, lifecycle, box, prompt, unsubscribe, settled };
}

function settledDetail(events: SessionEvent[]): Record<string, unknown> {
  return events.filter((event) => event.kind === "settled").at(-1)!.detail as Record<string, unknown>;
}

test("B1 开关开 + 未交报告：补发恰一次（第 2 次文本=拟文案常量）；settled 恰一；两条新增系统行在场", async () => {
  const h = makeHarness([{ stop: "length" }, { stop: "stop" }]);
  await h.prompt("任务指令");
  assert.deepEqual(h.box.calls, ["任务指令", LENGTH_FOLLOWUP_TEXT], "截断后应补发恰一次、文本为拟文案常量");
  assert.equal(h.settled().length, 1, "补发不新增 settled");
  assert.equal(countSummary(h.events, LENGTH_TRUNCATION_SUMMARY), 1);
  assert.equal(countSummary(h.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 1);
  const detail = settledDetail(h.events);
  assert.equal(detail.outcome, "completed");
  assert.equal("truncation" in detail, false, "补发成功轮末条消息为正常完成 ⇒ 不标 truncation");
});

test("B2 enabled:false（等价 env 关闭）→ 恰 1 次、无补发行；settled 如实标 truncation", async () => {
  const h = makeHarness([{ stop: "length" }], { enabled: false });
  await h.prompt("任务指令");
  assert.deepEqual(h.box.calls, ["任务指令"]);
  assert.equal(countSummary(h.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 0);
  assert.equal(h.settled().length, 1);
  assert.equal(settledDetail(h.events).truncation, "length", "开关关时截断事实仍如实外推（F-3-b 无条件）");
});

test("B3 本轮已有成功 submit_report → 不重复催交（恰 1 次）", async () => {
  const h = makeHarness([{ stop: "length" }], { wasReportSubmitted: () => true });
  await h.prompt("任务指令");
  assert.deepEqual(h.box.calls, ["任务指令"]);
  assert.equal(countSummary(h.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 0);
  assert.equal(settledDetail(h.events).truncation, "length");
});

test("B4 补发轮再次截断 → 仍恰 2 次（限次=1）；截断通知不重复；settled 含 truncation", async () => {
  const h = makeHarness([{ stop: "length" }, { stop: "length" }]);
  await h.prompt("任务指令");
  assert.deepEqual(h.box.calls, ["任务指令", LENGTH_FOLLOWUP_TEXT], "补发轮再截断不得二次补发");
  assert.equal(countSummary(h.events, LENGTH_TRUNCATION_SUMMARY), 1, "每轮首次截断只发一条通知");
  assert.equal(countSummary(h.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 1);
  assert.equal(h.settled().length, 1);
  assert.equal(settledDetail(h.events).truncation, "length");
});

test("B5 第一轮 prompt reject（API 错误）→ 无补发；既有 catch/fail 语义不变", async () => {
  const h = makeHarness([{ throwBeforeEvents: "api boom" }]);
  await assert.rejects(h.prompt("任务指令"), /api boom/);
  assert.deepEqual(h.box.calls, ["任务指令"]);
  assert.equal(countSummary(h.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 0);
  assert.equal(h.settled().length, 1);
  assert.equal(settledDetail(h.events).outcome, "failed");
  assert.equal(h.box.aborts, 1, "第一轮失败仍走既有 abort 清理");
});

test("B6 补发轮 reject/超时 → settled 仍恰一、outcome 不被改判；补发失败行在场；requestAbort 被调用且不抛", async () => {
  const variants: Array<{ label: string; scripts: StubTurnScript[]; expect: string; options: HarnessOptions }> = [
    { label: "reject", scripts: [{ stop: "length" }, { throwAfterEvents: "followup boom" }], expect: "followup boom", options: {} },
    { label: "超时", scripts: [{ stop: "length" }, { hang: true }], expect: "超时", options: { followupTimeoutMs: 20 } },
    // 真实链路必现：abort 清理期间 SDK 发来迟到的 agent_settled(aborted)+中止消息——
    // seal() 后不得把已完成的轮次改判 aborted（无 seal 时本用例转红：outcome 会变成 aborted）。
    { label: "超时+清理期间迟到 aborted settle（seal 防改判）", scripts: [{ stop: "length" }, { hang: true }], expect: "超时", options: { followupTimeoutMs: 20, lateAbortSettleDuringCleanup: true } },
  ];
  for (const variant of variants) {
    const h = makeHarness(variant.scripts, variant.options);
    await h.prompt("任务指令"); // 补发失败不得向外抛出
    assert.equal(h.settled().length, 1, `[${variant.label}] 无重复终态`);
    const detail = settledDetail(h.events);
    assert.equal(detail.outcome, "completed", `[${variant.label}] 补发失败不改判本轮 outcome`);
    assert.equal(detail.truncation, "length", `[${variant.label}] 截断事实仍在`);
    const failure = h.events.find((event) => event.summary.startsWith("收尾补发失败："));
    assert.ok(failure, `[${variant.label}] 补发失败应如实外推事件行`);
    assert.ok(failure.summary.includes(variant.expect), `[${variant.label}] 失败行含真实原因`);
    assert.equal(h.box.aborts, 1, `[${variant.label}] requestAbort 被调用（有界清理）`);
    assert.ok(h.records.some((record) => record.event.startsWith("prompt.length_followup")), `[${variant.label}] 诊断记录在场`);
  }
});

test("B7 abort/超时锁定 → 无补发（forced 守卫）；截断消息晚于锁定时亦被挡下", async () => {
  // 真实中止顺序：fail() 先于中止消息落地（observe 被 forced 忽略，无截断行）。
  const locked = makeHarness([{ failBeforeEvents: ["aborted", "ABORTED"], stop: "aborted" }]);
  await locked.prompt("任务指令");
  assert.deepEqual(locked.box.calls, ["任务指令"]);
  assert.equal(countSummary(locked.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 0);
  assert.equal(locked.lifecycle.wasTruncated(), false);
  assert.equal(settledDetail(locked.events).outcome, "aborted");
  assert.equal(countSummary(locked.events, LENGTH_TRUNCATION_SUMMARY), 0);

  // 竞态：截断消息已落地后才 fail——wasTruncated() 的 forced 守卫仍挡下补发；截断事实原样保留。
  const race = makeHarness([{ stop: "length", failAfterEvents: ["aborted", "ABORTED"] }]);
  await race.prompt("任务指令");
  assert.deepEqual(race.box.calls, ["任务指令"], "被锁定的轮次不得补发");
  assert.equal(countSummary(race.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 0);
  const raceDetail = settledDetail(race.events);
  assert.equal(raceDetail.outcome, "aborted");
  assert.equal(raceDetail.truncation, "length", "已落地的截断事实按原样保留");
});

test("B8 缺省不传 lengthFollowup（旧直接调用方）→ 行为与旧版逐字一致", async () => {
  // (a) 正常轮：事件流逐字 = 输入回行 + settled（无任何新增行）。
  const plain = makeHarness([{ stop: "stop" }], { withConfig: false });
  await plain.prompt("fixture");
  assert.deepEqual(plain.box.calls, ["fixture"]);
  assert.deepEqual(plain.events.map((event) => `${event.kind}:${event.summary}`), ["message:用户指令：fixture", "settled:会话结束"]);
  // (b) 截断轮：不补发（无配置即无动作）；F-3-b 截断行属无条件透明性，仍在。
  const truncated = makeHarness([{ stop: "length" }], { withConfig: false });
  await truncated.prompt("fixture");
  assert.deepEqual(truncated.box.calls, ["fixture"]);
  assert.equal(countSummary(truncated.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 0);
  assert.equal(countSummary(truncated.events, LENGTH_TRUNCATION_SUMMARY), 1);
  assert.equal(settledDetail(truncated.events).truncation, "length");
});

// —————————————————————— C. 真实 SDK 端到端（faux，离线） ——————————————————————

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

/**
 * 真出会话 + faux 模型（离线）跑一轮：响应 1=截断(length)、响应 2=submit_report 工具调用、
 * 响应 3=收尾文本。关掉 SDK 自身 retry/compaction 以隔离被测行为（同 runtime-outcome 先例）。
 */
async function runFauxTruncationTurn(lengthFollowup: LengthFollowupOptions | undefined): Promise<{
  promptCalls: string[];
  reports: Array<{ report: unknown; turnId: string | undefined }>;
  events: SessionEvent[];
  modelRequests: number;
}> {
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxThinking, InMemoryCredentialStore } = await import("@earendil-works/pi-ai");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = mkdtempSync(join(tmpdir(), "ans-f3-followup-"));
  try {
    const events: SessionEvent[] = [];
    const emit = (event: SessionEvent): void => { events.push(event); };
    const lifecycle = createTurnLifecycle(emit);
    const gate = makeGate({ project: [], skill: [] });
    const reports: Array<{ report: unknown; turnId: string | undefined }> = [];
    const tools = buildGovernedTools(gate, {
      currentTurnId: lifecycle.currentTurnId,
      reportHandback: (report, metadata) => { reports.push({ report, turnId: metadata?.turnId }); },
    });
    const faux = fauxProvider();
    let modelRequests = 0;
    faux.setResponses([
      () => { modelRequests += 1; return fauxAssistantMessage([fauxThinking("The")], { stopReason: "length" }); },
      () => { modelRequests += 1; return fauxAssistantMessage([fauxToolCall("submit_report", { status: "completed", summary: "fixture" })]); },
      () => { modelRequests += 1; return fauxAssistantMessage("done"); },
    ]);
    const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    runtime.registerNativeProvider(faux.provider);
    const model = runtime.getModel(faux.provider.id, faux.models[0].id);
    assert.ok(model != null);
    const settingsManager = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
    const resourceLoader = new DefaultResourceLoader({ cwd: dir, agentDir: dir, extensionFactories: [], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, settingsManager });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: dir,
      noTools: "builtin",
      customTools: tools.map((tool) => toPiTool(tool, { currentTurnId: lifecycle.currentTurnId })),
      resourceLoader,
      model: model as never,
      modelRuntime: runtime,
      sessionManager: SessionManager.inMemory(dir),
      settingsManager,
    });
    const unsubscribe = wireSettledOnce(session, emit, lifecycle);
    const promptCalls: string[] = [];
    const counting: PromptCapableSession = {
      prompt(text: string, options?: { images: PromptImage[] }): Promise<void> {
        promptCalls.push(text);
        return options === undefined ? session.prompt(text) : session.prompt(text, options as never);
      },
      abort: () => session.abort(),
      dispose: () => {},
    };
    try {
      const prompt = makeRolePrompt({
        session: counting,
        promptMs: 5000,
        gate: createInteractionGate(),
        emit,
        log: silentLogger(),
        lifecycle,
        ...(lengthFollowup !== undefined ? { lengthFollowup } : {}),
      });
      await prompt("任务");
    } finally {
      unsubscribe();
      session.dispose();
    }
    return { promptCalls, reports, events, modelRequests };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("C 真实 SDK（faux）开关开：截断→补发→submit_report 落同一 turnId；settled 恰一、模型请求 +2", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const result = await runFauxTruncationTurn({ enabled: true, text: LENGTH_FOLLOWUP_TEXT, wasReportSubmitted: () => false });
  assert.deepEqual(result.promptCalls, ["任务", LENGTH_FOLLOWUP_TEXT], "补发恰一次、文本为拟文案常量");
  assert.equal(result.reports.length, 1, "模型在补发轮经 submit_report 交回恰一份报告");
  const settled = result.events.filter((event) => event.kind === "settled");
  assert.equal(settled.length, 1, "全程恰一个 settled");
  assert.equal(
    (settled[0]!.detail as Record<string, unknown>).turnId,
    result.reports[0]!.turnId,
    "补发轮的报告落同一 turnId（编排回交按同轮取报告）",
  );
  assert.equal(countSummary(result.events, LENGTH_TRUNCATION_SUMMARY), 1);
  assert.equal(countSummary(result.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 1);
  assert.equal(result.modelRequests, 3, "截断轮 1 + 补发轮 2（submit_report 工具回合 + 收尾回合）");
});

test("C 真实 SDK（faux）开关关：不补发（report 0 次）；settled 如实标 truncation、截断行在场", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const result = await runFauxTruncationTurn({ enabled: false, text: LENGTH_FOLLOWUP_TEXT, wasReportSubmitted: () => false });
  assert.deepEqual(result.promptCalls, ["任务"]);
  assert.equal(result.reports.length, 0, "开关关时不得有补发促成的报告");
  const settled = result.events.filter((event) => event.kind === "settled");
  assert.equal(settled.length, 1);
  assert.equal((settled[0]!.detail as Record<string, unknown>).truncation, "length");
  assert.equal(countSummary(result.events, LENGTH_TRUNCATION_SUMMARY), 1);
  assert.equal(countSummary(result.events, LENGTH_FOLLOWUP_NOTICE_SUMMARY), 0);
  assert.equal(result.modelRequests, 1);
});

// —————————————————————— D. 环境开关解析 ——————————————————————

test("D 环境开关 ANS_PI_LENGTH_FOLLOWUP：显式关闭值才关（大小写/空白不敏感）；缺省与其它值开启", () => {
  assert.equal(LENGTH_FOLLOWUP_ENV, "ANS_PI_LENGTH_FOLLOWUP");
  for (const value of ["0", "false", "no", "off", "FALSE", " Off ", "No"]) {
    assert.equal(isLengthFollowupDisabled({ [LENGTH_FOLLOWUP_ENV]: value }), true, `${JSON.stringify(value)} 应显式关闭`);
  }
  for (const env of [
    {},
    { [LENGTH_FOLLOWUP_ENV]: "" },
    { [LENGTH_FOLLOWUP_ENV]: "1" },
    { [LENGTH_FOLLOWUP_ENV]: "true" },
    { [LENGTH_FOLLOWUP_ENV]: "yes" },
    { [LENGTH_FOLLOWUP_ENV]: "enabled" },
  ]) {
    assert.equal(isLengthFollowupDisabled(env), false, `${JSON.stringify(env)} 应开启（缺省开启）`);
  }
});

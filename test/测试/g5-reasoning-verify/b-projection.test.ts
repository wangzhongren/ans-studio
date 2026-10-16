// test/测试/g5-reasoning-verify/b-projection.test.ts —— B 域：事实通道与投影单点（独立验证）。
//
// 验证对象：`tool-display.ts::projectReasoningDetail`（脱敏/预算/omitted 归一/duration 防伪/幂等/坏件诊断）
// ＋ Service 两路（`src/service/runtime/session.ts`：live emit 单点投影 → 队列/持久化；`readRuntimeSessionHistory`
// 历史读取单点投影）。全部用例独立构造（不复用实施方断言）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { createToolDisplayContext } from "../../../src/common/runtime-core/tool-display.ts";
import { createRuntimeAdapter, readRuntimeSessionHistory } from "../../../src/service/runtime/session.ts";
import type { RuntimeProviderOptions, SessionEvent, WriteGate } from "../../../src/model/runtime.ts";
import { makeRole, emittingAdapter, fakeDiagnostics } from "./helpers.ts";

const gate: WriteGate = () => ({ allowed: false, reason: "fixture", allowedByRoot: { project: [], skill: [] } });
const SECRET = "g5-secret-值-9271";
const DIAGNOSTIC = { version: 1, source: "reasoning-diagnostic", code: "PROJECTION_FAILED" };

function freshContext(secrets: Record<string, string> = {}) {
  return createToolDisplayContext({ credentialEnvNames: Object.keys(secrets), env: secrets });
}

// —————————————————————— ① 投影单点（单元对抗） ——————————————————————

test("B1 合法投影逐字形状：raw 事实 → DisplayTextV1 投影形（version/source/status/duration 结构恰等）", () => {
  const ctx = freshContext();
  const out = ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: "先看调用点，再改边界。", status: "complete", durationMs: 4200 } });
  assert.deepEqual(out, {
    version: 1, source: "reasoning",
    reasoning: { text: { text: "先看调用点，再改边界。", truncated: false, redacted: false }, status: "complete", durationMs: 4200 },
  });
});

test("B2 脱敏：凭据真值替换 / api_key 形态 / Bearer / URL userinfo 剥离——投影形承载已脱敏文本", () => {
  const ctx = freshContext({ ANS_G5_TEST_SECRET: SECRET });
  const raw = `复查 ${SECRET}，另见 api_key=abc123 与 Bearer tok-9 ，端点 https://user:pw@gw.example.com/v1/messages?k=1`;
  const out = ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: raw, status: "complete" } }) as { reasoning: { text: { text: string; redacted: boolean } } };
  const text = out.reasoning.text.text;
  for (const leak of [SECRET, "abc123", "tok-9", "user:pw"]) assert.equal(text.includes(leak), false, `不得外流：${leak}`);
  assert.ok(text.includes("[REDACTED]"), "凭据值替换为 [REDACTED]");
  assert.ok(text.includes("https://gw.example.com/v1/messages"), "URL 保留可读面（剥 userinfo）");
  assert.equal(text.includes("?k=1"), false, "query 剥离");
  assert.equal(out.reasoning.text.redacted, true, "redacted 标记如实");
});

test("B3 预算：超 16384 字节按 UTF-8 边界裁（不产生半截字符）＋truncated 标记；正文是原文前缀", () => {
  const ctx = freshContext();
  const raw = "好".repeat(9000); // 每字 3 字节 ⇒ 27000 字节 > 16384
  const out = ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: raw, status: "complete" } }) as { reasoning: { text: { text: string; truncated: boolean } } };
  const text = out.reasoning.text.text;
  assert.ok(Buffer.byteLength(text, "utf8") <= 16384, "预算内");
  assert.equal(out.reasoning.text.truncated, true, "截断如实标记");
  assert.ok(raw.startsWith(text), "是原文前缀（逐字未篡改）");
  assert.equal(text.includes("�"), false, "UTF-8 边界干净（无替换字符）");
  // 恰在预算内：不截断。
  const small = "x".repeat(1000);
  const same = ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: small, status: "complete" } }) as { reasoning: { text: { truncated: boolean } } };
  assert.equal(same.reasoning.text.truncated, false);
});

test("B4 omitted⇒正文恒空：载荷违规带正文（raw 串或投影形）一律清空——如实优先于保留违规内容", () => {
  const ctx = freshContext();
  for (const violation of ["SHOULD-NOT-SHOW", { text: "SHOULD-NOT-SHOW", truncated: true, redacted: true }]) {
    const out = ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: violation, status: "omitted", durationMs: 7 } } as never) as { source: string; reasoning: { text: unknown; status: string; durationMs?: number } };
    assert.equal(out.source, "reasoning");
    assert.deepEqual(out.reasoning.text, { text: "", truncated: false, redacted: false }, "omitted ⇒ 正文恒空、标记清白");
    assert.equal(out.reasoning.status, "omitted");
    assert.equal(out.reasoning.durationMs, 7, "时长不因 omitted 丢失（发送过思考即真实）");
    assert.equal(JSON.stringify(out).includes("SHOULD-NOT-SHOW"), false);
  }
});

test("B5 durationMs 防伪矩阵：有限≥0 才透传；负数/NaN/±Infinity/字符串/null/布尔一律丢弃", () => {
  const ctx = freshContext();
  const probe = (durationMs: unknown) => (ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: "t", status: "complete", durationMs } } as never) as { reasoning: { durationMs?: unknown } }).reasoning;
  assert.deepEqual(probe(0), { text: { text: "t", truncated: false, redacted: false }, status: "complete", durationMs: 0 }, "0 是真事实（携带）");
  assert.deepEqual(probe(0.5), { text: { text: "t", truncated: false, redacted: false }, status: "complete", durationMs: 0.5 });
  for (const bad of [-1, -0.001, NaN, Infinity, -Infinity, "4200", true, null, {}, []] as unknown[]) {
    const got = probe(bad).durationMs;
    assert.equal(got, undefined, String(bad) + " 不得透传");
    assert.equal("durationMs" in probe(bad), false, String(bad) + " 键不得存在（缺席而非 undefined）");
  }
  // 未携带＝键缺席。
  const absent = (ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: "t", status: "complete" } }) as { reasoning: Record<string, unknown> }).reasoning;
  assert.equal("durationMs" in absent, false);
});

test("B6 坏件 11 类 ⇒ 诊断形（PROJECTION_FAILED）且绝不抛", () => {
  const ctx = freshContext();
  const bad: unknown[] = [
    null, undefined, "string", 42, [], true,
    {},                                                        // 无版本/来源
    { version: 2, source: "reasoning", reasoning: { status: "complete", text: "x" } }, // 版本不符
    { version: 1, source: "tool", reasoning: { status: "complete", text: "x" } },      // 来源不符
    { version: 1, source: "reasoning" },                        // 缺 reasoning
    { version: 1, source: "reasoning", reasoning: { status: "queer", text: "x" } },   // status 非法
    { version: 1, source: "reasoning", reasoning: { status: "complete", text: 42 } },  // 文本非串/非投影形
    { version: 1, source: "reasoning", reasoning: { status: "complete", text: { truncated: false } } }, // 投影形缺 text
  ];
  for (const value of bad) {
    let out: unknown;
    assert.doesNotThrow(() => { out = ctx.projectReasoningDetail(value as never); }, JSON.stringify(value) + " 绝不抛");
    assert.deepEqual(out, DIAGNOSTIC, JSON.stringify(value) + " ⇒ 如实诊断形");
  }
  // redactText 回调暴走（返回非字符串）⇒ 诊断形而非崩溃。
  const rogue = ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: "x", status: "complete" } }, (() => undefined) as never);
  assert.deepEqual(rogue, DIAGNOSTIC, "redactText 坏件 ⇒ 诊断形");
  // redactText 正常注入：先于内置管道生效。
  const injected = ctx.projectReasoningDetail({ version: 1, source: "reasoning", reasoning: { text: "PLATE-ALPHA tail", status: "complete" } }, (value) => value.replaceAll("PLATE-ALPHA", "[MASK]")) as { reasoning: { text: { text: string } } };
  assert.equal(injected.reasoning.text.text, "[MASK] tail");
});

test("B7 重复投影幂等：project(project(x)) 与 project(x) 形状逐字相等（含截断/脱敏/omitted 三形态）", () => {
  const ctx = freshContext({ ANS_G5_TEST_SECRET: SECRET });
  const cases: unknown[] = [
    { version: 1, source: "reasoning", reasoning: { text: `含 ${SECRET} 的正文`, status: "complete", durationMs: 123 } },
    { version: 1, source: "reasoning", reasoning: { text: "长".repeat(9000), status: "complete" } },
    { version: 1, source: "reasoning", reasoning: { text: "", status: "omitted", durationMs: 0 } },
    { version: 1, source: "reasoning", reasoning: { text: "api_key=zzz 与 https://u:p@gw.io/x#f", status: "complete", durationMs: 5 } },
  ];
  for (const raw of cases) {
    const once = ctx.projectReasoningDetail(raw as never);
    const twice = ctx.projectReasoningDetail(once as never);
    assert.deepEqual(twice, once, JSON.stringify(once).slice(0, 80) + "… 幂等");
  }
  // 诊断形再入：source=reasoning-diagnostic 不匹配 ⇒ 仍是同一诊断形（形状稳定）。
  const again = ctx.projectReasoningDetail(DIAGNOSTIC as never);
  assert.deepEqual(again, DIAGNOSTIC);
});

// —————————————————————— ② Service live emit 单点 ——————————————————————

interface LiveOutcome { rows: SessionEvent[]; records: Array<{ event: string; fields: Record<string, unknown> }>; replayFile: string; cleanup: () => void; }

async function runLive(
  root: string,
  script: (push: (event: SessionEvent) => void, end: () => void) => void,
  persist: boolean,
): Promise<LiveOutcome> {
  const records: Array<{ event: string; fields: Record<string, unknown> }> = [];
  const adapter = createRuntimeAdapter({
    runtime: "demo", gate, projectRoot: root, skillRoot: root,
    extraCredentialEnvVars: ["ANS_G5_TEST_SECRET"],
    diagnostics: fakeDiagnostics(records) as never,
    ...(persist ? { persistSession: true } : {}),
    providerFactories: { demo: (options: RuntimeProviderOptions) => emittingAdapter(options, script) },
  });
  const session = await adapter.bindRole(makeRole("R-B"));
  const rows: SessionEvent[] = [];
  const collector = (async () => { for await (const event of session.events()) rows.push(event); })();
  await session.prompt("触发");
  await session.dispose();
  await collector;
  return { rows, records, replayFile: path.join(root, ".ans", "sessions", "R-B", "demo", "ans", "replay.jsonl"), cleanup: () => {} };
}

function tempRoot(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "g5-b-")); }

test("B8 live emit：详细经过投影单点（脱敏＋summary 定格「已思考」）；随载荷 summary 绝不外流", async () => {
  process.env.ANS_G5_TEST_SECRET = SECRET;
  const root = tempRoot();
  try {
    const outcome = await runLive(root, (push, end) => {
      push({ kind: "message", summary: `LEAK-SUMMARY-含凭据 ${SECRET}`, detail: { version: 1, source: "reasoning", reasoning: { text: `推理正文含 ${SECRET}`, status: "complete", durationMs: 3300 } } } as SessionEvent);
      push({ kind: "settled", summary: "会话结束", detail: { outcome: "completed" } } as SessionEvent);
      end();
    }, false);
    const reasoningRows = outcome.rows.filter((row) => (row.detail as { source?: string } | undefined)?.source === "reasoning");
    assert.equal(reasoningRows.length, 1, "恰一行推理事件");
    const row = reasoningRows[0]!;
    assert.equal(row.kind, "message");
    assert.equal(row.summary, "已思考", "summary 定格为常量（绝不采用随载荷文本）");
    const payload = row.detail as { version: number; source: string; reasoning: { text: { text: string; redacted: boolean }; status: string; durationMs?: number }; turnId?: string };
    assert.equal(payload.version, 1);
    assert.equal(payload.reasoning.status, "complete");
    assert.equal(payload.reasoning.durationMs, 3300);
    assert.equal(payload.reasoning.text.text.includes(SECRET), false, "凭据不外流");
    assert.ok(payload.reasoning.text.text.includes("[REDACTED]"));
    assert.equal(payload.reasoning.text.redacted, true);
    assert.equal(typeof payload.turnId, "string", "turnId 保留（pump 并入、投影后原样）");
    assert.equal(payload.turnId, row.turnId, "detail.turnId 与事件 turnId 一致");
    // 全事件面零泄漏：任何行（含 summary/detail 序列化后）不得含随载荷文本或凭据值。
    const all = JSON.stringify(outcome.rows);
    assert.equal(all.includes("LEAK-SUMMARY"), false, "随载荷 summary 绝不外流");
    assert.equal(all.includes(SECRET), false, "凭据值绝不外流（任何行）");
  } finally {
    delete process.env.ANS_G5_TEST_SECRET;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B8b live emit：违规/坏件经单点归一（omitted 带正文清空；坏件 ⇒ 诊断形＋诊断 summary）；durationMs 非法丢弃", async () => {
  const root = tempRoot();
  try {
    const outcome = await runLive(root, (push, end) => {
      push({ kind: "message", summary: "s1", detail: { version: 1, source: "reasoning", reasoning: { text: "VIOLATION-正文", status: "omitted" } } } as SessionEvent);
      push({ kind: "message", summary: "s2", detail: { version: 1, source: "reasoning", reasoning: { text: "t", status: "complete", durationMs: -5 } } } as SessionEvent);
      push({ kind: "message", summary: "s3", detail: { version: 1, source: "reasoning", reasoning: { status: "queer" } } } as SessionEvent);
      push({ kind: "settled", summary: "会话结束", detail: { outcome: "completed" } } as SessionEvent);
      end();
    }, false);
    const rows = outcome.rows;
    const omitted = rows.find((row) => row.summary === "已思考" && (row.detail as { reasoning?: { status?: string } }).reasoning?.status === "omitted");
    assert.ok(omitted, "omitted 行在场");
    assert.deepEqual((omitted!.detail as { reasoning: { text: unknown } }).reasoning.text, { text: "", truncated: false, redacted: false }, "违规正文清空");
    assert.equal(JSON.stringify(rows).includes("VIOLATION-正文"), false);
    const negative = rows.find((row) => row.summary === "已思考" && typeof (row.detail as { reasoning?: { text?: { text?: string } } }).reasoning?.text?.text === "string" && ((row.detail as { reasoning: { text: { text: string } } }).reasoning.text.text === "t"));
    assert.ok(negative, "合法行在场");
    assert.equal("durationMs" in (negative!.detail as { reasoning: object }).reasoning, false, "负时长丢弃（键缺席）");
    const diagnostic = rows.find((row) => (row.detail as { source?: string } | undefined)?.source === "reasoning-diagnostic");
    assert.ok(diagnostic, "坏件 ⇒ 诊断行");
    assert.equal(diagnostic!.summary, "推理内容无法安全显示", "诊断 summary 定格");
    assert.equal((diagnostic!.detail as { code?: string }).code, "PROJECTION_FAILED");
    assert.equal(JSON.stringify(rows).includes("QUEER-SHOULD-NOT-LEAK"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B8c live＋持久化：落盘事件＝投影形（队列所见＝盘面所见，原始正文不落盘）", async () => {
  process.env.ANS_G5_TEST_SECRET = SECRET;
  const root = tempRoot();
  try {
    const outcome = await runLive(root, (push, end) => {
      push({ kind: "message", summary: "s", detail: { version: 1, source: "reasoning", reasoning: { text: `落盘正文 ${SECRET}`, status: "complete", durationMs: 88 } } } as SessionEvent);
      push({ kind: "settled", summary: "会话结束", detail: { outcome: "completed" } } as SessionEvent);
      end();
    }, true);
    const disk = fs.readFileSync(outcome.replayFile, "utf8");
    assert.equal(disk.includes(SECRET), false, "盘面零凭据");
    const lines = disk.trim().split("\n").map((line) => JSON.parse(line) as { kind: string; event?: SessionEvent });
    const stored = lines.filter((line) => line.kind === "event" && (line.event?.detail as { source?: string } | undefined)?.source === "reasoning");
    assert.equal(stored.length, 1, "盘面恰一条推理事件");
    const queued = outcome.rows.find((row) => (row.detail as { source?: string } | undefined)?.source === "reasoning")!;
    assert.deepEqual(stored[0]!.event!.detail, queued.detail, "盘面 detail 与队列所见逐字一致");
    assert.deepEqual(stored[0]!.event!.summary, queued.summary);
  } finally {
    delete process.env.ANS_G5_TEST_SECRET;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// —————————————————————— ③ 历史读取单点 ——————————————————————

function writeReplay(root: string, roleId: string, runtime: string, entries: unknown[]): void {
  const directory = path.join(root, ".ans", "sessions", roleId, runtime, "ans");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "replay.jsonl"), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

test("B9 历史读取：存量投影形幂等归一（形状不变）；原始形态过同单点（脱敏/违规清空/坏件→诊断）", async () => {
  process.env.ANS_G5_TEST_SECRET = SECRET;
  const root = tempRoot();
  try {
    writeReplay(root, "R-H", "claude", [
      { kind: "user", text: "问", at: "2026-10-16T00:00:01.000Z", turnId: "t1" },
      // ① 存量投影形（emit 后形状）：再投影幂等。
      { kind: "event", at: "2026-10-16T00:00:02.000Z", turnId: "t1", event: { kind: "message", summary: "已思考", turnId: "t1", detail: { version: 1, source: "reasoning", reasoning: { text: { text: "存量已投影 [REDACTED]", truncated: false, redacted: true }, status: "complete", durationMs: 2500 }, turnId: "t1" } } },
      // ② 手编原始事实（未经 Service）：读取侧必须过同一单点（脱敏）。
      { kind: "event", at: "2026-10-16T00:00:03.000Z", turnId: "t2", event: { kind: "message", summary: "已思考", turnId: "t2", detail: { version: 1, source: "reasoning", reasoning: { text: `手编正文 ${SECRET}`, status: "complete", durationMs: -1 }, turnId: "t2" } } },
      // ③ 手编违规 omitted 带正文。
      { kind: "event", at: "2026-10-16T00:00:04.000Z", turnId: "t3", event: { kind: "message", summary: "已思考", turnId: "t3", detail: { version: 1, source: "reasoning", reasoning: { text: "VIOLATION-H", status: "omitted" }, turnId: "t3" } } },
      // ④ 坏件（缺 reasoning 载荷）。
      { kind: "event", at: "2026-10-16T00:00:05.000Z", turnId: "t4", event: { kind: "message", summary: "已思考", turnId: "t4", detail: { version: 1, source: "reasoning", turnId: "t4" } } },
    ]);
    const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "R-H", runtime: "claude", credentialEnvNames: ["ANS_G5_TEST_SECRET"] });
    const events = history.entries.filter((entry) => entry.event !== undefined).map((entry) => entry.event!);
    const details = events.map((event) => event.detail as Record<string, unknown>);
    // ① 幂等：存量投影形再投影形状不变（deepEqual 全等）。
    assert.deepEqual(details[0], { version: 1, source: "reasoning", reasoning: { text: { text: "存量已投影 [REDACTED]", truncated: false, redacted: true }, status: "complete", durationMs: 2500 }, turnId: "t1" }, "投影形幂等回放");
    // ② 原始形态：同单点脱敏＋负时长丢弃。
    const second = details[1] as { source: string; reasoning: { text: { text: string; redacted: boolean }; status: string; durationMs?: unknown } };
    assert.equal(second.source, "reasoning");
    assert.equal(second.reasoning.text.text.includes(SECRET), false, "历史读取脱敏");
    assert.ok(second.reasoning.text.text.includes("[REDACTED]"));
    assert.equal("durationMs" in second.reasoning, false, "负时长丢弃（历史路）");
    // ③ 违规 omitted 清空。
    assert.deepEqual((details[2] as { reasoning: { text: unknown } }).reasoning.text, { text: "", truncated: false, redacted: false });
    // ④ 坏件 → 诊断形（turnId 保留）。
    assert.deepEqual(details[3], { version: 1, source: "reasoning-diagnostic", code: "PROJECTION_FAILED", turnId: "t4" });
    // 全程零泄漏。
    assert.equal(JSON.stringify(history.entries).includes(SECRET), false, "历史读取全程零凭据");
    assert.equal(JSON.stringify(history.entries).includes("VIOLATION-H"), false, "违规正文不呈现");
  } finally {
    delete process.env.ANS_G5_TEST_SECRET;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B10 两路同单点：同输入 live 投影 == 历史投影 == 直接单点调用（形状逐字一致）", async () => {
  process.env.ANS_G5_TEST_SECRET = SECRET;
  const root = tempRoot();
  try {
    const raw = { version: 1, source: "reasoning", reasoning: { text: `同单点正文 ${SECRET} 与 api_key=k9`, status: "complete", durationMs: 610 } } as const;
    const outcome = await runLive(root, (push, end) => {
      push({ kind: "message", summary: "s", detail: raw } as SessionEvent);
      push({ kind: "settled", summary: "会话结束", detail: { outcome: "completed" } } as SessionEvent);
      end();
    }, false);
    const live = outcome.rows.find((row) => (row.detail as { source?: string } | undefined)?.source === "reasoning")!.detail as Record<string, unknown>;
    const { turnId: _liveTurn, ...liveShape } = live;
    writeReplay(root, "R-H2", "claude", [
      { kind: "event", at: "2026-10-16T00:00:01.000Z", turnId: "tt", event: { kind: "message", summary: "已思考", turnId: "tt", detail: raw } },
    ]);
    const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "R-H2", runtime: "claude", credentialEnvNames: ["ANS_G5_TEST_SECRET"] });
    const { turnId: _histTurn, ...historyShape } = history.entries.find((entry) => entry.event !== undefined)!.event!.detail as Record<string, unknown>;
    const direct = createToolDisplayContext({ credentialEnvNames: ["ANS_G5_TEST_SECRET"], env: { ANS_G5_TEST_SECRET: SECRET } }).projectReasoningDetail(raw as never);
    assert.deepEqual(liveShape, direct, "live 路＝单点直调（形状一致）");
    assert.deepEqual(historyShape, direct, "历史路＝单点直调（形状一致）");
    assert.deepEqual(liveShape, historyShape, "两路同形");
  } finally {
    delete process.env.ANS_G5_TEST_SECRET;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// —————————————————————— ④ Service 注入（env → providerOptions 的契约落点） ——————————————————————

function captureInjection(sink: RuntimeProviderOptions[]) {
  return (options: RuntimeProviderOptions) => {
    sink.push(options);
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole() {
        options.registerToolDisplayProfile?.({ credentials: [] });
        return { async prompt(): Promise<void> {}, events() { return (async function* () {})(); }, async dispose(): Promise<void> {} };
      },
    };
  };
}

async function captureOnce(runtime: "claude" | "codex" | "pi" | "demo", root: string, records: Array<{ event: string; fields: Record<string, unknown> }>, sink: RuntimeProviderOptions[], roleId: string) {
  const adapter = createRuntimeAdapter({
    runtime, gate, projectRoot: root, skillRoot: root,
    diagnostics: fakeDiagnostics(records) as never,
    providerFactories: { [runtime]: captureInjection(sink) as never },
  });
  const session = await adapter.bindRole(makeRole(roleId));
  await session.prompt("注入观察");
  await session.dispose();
}

test("B11 Service 注入：set⇒恰值注入字段；unset⇒字段缺席；invalid⇒字段缺席＋诊断＋会话照开；跨键不串；demo 恒缺席", async () => {
  const root = tempRoot();
  const keys = ["ANS_CLAUDE_REASONING_EFFORT", "ANS_CODEX_REASONING_EFFORT", "ANS_PI_REASONING_EFFORT"] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    // ① unset：三平台字段一律缺席（"in" 判据——非 undefined 值面）。
    for (const runtime of ["claude", "codex", "pi"] as const) {
      const sink: RuntimeProviderOptions[] = [];
      const records: Array<{ event: string; fields: Record<string, unknown> }> = [];
      await captureOnce(runtime, root, records, sink, `R-unset-${runtime}`);
      assert.equal("reasoningEffort" in sink[0]!, false, `${runtime} 未设 ⇒ 字段缺席`);
      assert.equal(sink[0]!.reasoningEffort, undefined);
      assert.equal(records.some((row) => row.event === "reasoning.effort.invalid"), false, "未设静默（零诊断）");
    }
    // ② set：按运行时读对应键并规范值注入。
    process.env.ANS_CLAUDE_REASONING_EFFORT = "  High ";
    process.env.ANS_PI_REASONING_EFFORT = "xhigh";
    const claudeSink: RuntimeProviderOptions[] = [];
    await captureOnce("claude", root, [], claudeSink, "R-set-claude");
    assert.equal(claudeSink[0]!.reasoningEffort, "high", "claude：trim＋小写归一后注入");
    const codexSink: RuntimeProviderOptions[] = [];
    await captureOnce("codex", root, [], codexSink, "R-set-codex");
    assert.equal("reasoningEffort" in codexSink[0]!, false, "跨键不串：claude 键不流入 codex");
    const piSink: RuntimeProviderOptions[] = [];
    await captureOnce("pi", root, [], piSink, "R-set-pi");
    assert.equal(piSink[0]!.reasoningEffort, "xhigh", "pi 自己的键注入");
    delete process.env.ANS_PI_REASONING_EFFORT;
    // ③ invalid：按未设处理（字段缺席）＋诊断如实＋会话照常打开并跑轮（绝不毁会话）。
    process.env.ANS_CLAUDE_REASONING_EFFORT = "max";
    const invalidSink: RuntimeProviderOptions[] = [];
    const invalidRecords: Array<{ event: string; fields: Record<string, unknown> }> = [];
    await captureOnce("claude", root, invalidRecords, invalidSink, "R-invalid");
    assert.equal("reasoningEffort" in invalidSink[0]!, false, "invalid ⇒ 字段缺席（按未设）");
    const diagnostic = invalidRecords.find((row) => row.event === "reasoning.effort.invalid");
    assert.ok(diagnostic, "invalid ⇒ 诊断如实落点");
    assert.equal(diagnostic!.fields.mode, "claude");
    assert.equal(diagnostic!.fields.supported, false);
    assert.equal(diagnostic!.fields.reasonCode, "invalid-value");
    delete process.env.ANS_CLAUDE_REASONING_EFFORT;
    // ④ demo：无键面——即便三键全设仍恒缺席。
    process.env.ANS_CLAUDE_REASONING_EFFORT = "high";
    process.env.ANS_CODEX_REASONING_EFFORT = "high";
    process.env.ANS_PI_REASONING_EFFORT = "high";
    const demoSink: RuntimeProviderOptions[] = [];
    const demoRecords: Array<{ event: string; fields: Record<string, unknown> }> = [];
    await captureOnce("demo", root, demoRecords, demoSink, "R-demo");
    assert.equal("reasoningEffort" in demoSink[0]!, false, "demo 恒缺席（无键面）");
    assert.equal(demoRecords.some((row) => row.event === "reasoning.effort.invalid"), false);
  } finally {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B11b 重建重读（新会话生效语义）：env 改档 ⇒ 新适配器实例（新会话）读到新值；同实例同角色缓存不重读（既有语义）", async () => {
  const root = tempRoot();
  const saved = process.env.ANS_PI_REASONING_EFFORT;
  try {
    process.env.ANS_PI_REASONING_EFFORT = "low";
    const sinkA: RuntimeProviderOptions[] = [];
    await captureOnce("pi", root, [], sinkA, "R-reread");
    assert.equal(sinkA[0]!.reasoningEffort, "low");
    process.env.ANS_PI_REASONING_EFFORT = "xhigh";
    const sinkB: RuntimeProviderOptions[] = [];
    await captureOnce("pi", root, [], sinkB, "R-reread");
    assert.equal(sinkB[0]!.reasoningEffort, "xhigh", "新适配器（新会话）重读当刻 env——改设置下次会话生效");
  } finally {
    if (saved === undefined) delete process.env.ANS_PI_REASONING_EFFORT;
    else process.env.ANS_PI_REASONING_EFFORT = saved;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

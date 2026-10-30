// test/测试/network-state-e2e.test.ts
// P2（2026-10-30 团队计划 §4.4 / 附录 B）：**网络状态端到端**——
//  - 离线 → 进行中请求的请求级 deadline **暂停**（跨 idle/first-byte 时限不超时）；恢复 → resume 并正常完成；
//  - 离线超过恢复窗口（注入 60ms）⇒ `handle.send` 以 `network-offline-timeout` 失败；事件流恰一条
//    `settled(failed)`、人话短报、detail 携带 errorCode/attempts/replaySafe；**无 handback**（重试属 P3，不重放）；
//  - 队列：离线时保留并标 `blockedReason:"network"`（数据面可见、不认领投递）；恢复后按既有 drain
//    继续且**恰投递一次**；
//  - 诊断 `network.request.pause/resume/timeout` 齐全；项目目录零写入。
// 真实路径：真实 openRoleSession（编排+Service）+ 真实 createClaudeRuntimeAdapter（仅 SDK 传输为假）
// + 真实 SessionManager（注入网络门）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { after } from "node:test";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import * as z from "zod";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { createNetworkGate } from "../../src/common/runtime-core/network-gate.ts";
import type { NetworkState } from "../../src/model/runtime.ts";
import type { OrchestrationEvent, TaskHandback } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";

const ROOT = mkdtempSync(join(tmpdir(), "ans-network-state-e2e-"));
after(() => {
  try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

const environment = { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "fixture-api-secret" };
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => boolean, label = "等待实际事件超时"): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    if (predicate()) return;
    await tick(5);
  }
  assert.fail(label);
}

function writeAt(root: string, rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
}

/** 造一个最小项目（角色 A + 边界）；不在仓库留文件。 */
function projectFixture(): string {
  const root = mkdtempSync(join(ROOT, "proj-"));
  writeAt(root, "角色卡/A/role-card.md", "# 角色：A\n\n网络状态 e2e 夹具角色。\n");
  writeAt(root, "角色卡/A/boundary.yaml", "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: fixture\n");
  return root;
}

const assistantFrame = (blocks: unknown[]): SDKMessage => ({
  type: "assistant",
  message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: blocks, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
}) as unknown as SDKMessage;

/** 假 SDK 传输：收到输入后等 `release()`；abort 时以 AbortError 退出。释放后回 assistant + result(success)。 */
function fakeSdk() {
  const users: SDKUserMessage[] = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const query = ({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => {
    assert.equal(typeof prompt, "object");
    const signal = options!.abortController!.signal;
    const fail = () => Object.assign(new Error("fixture abort"), { name: "AbortError" });
    const abortPromise = new Promise<never>((_resolve, reject) => {
      if (signal.aborted) return reject(fail());
      signal.addEventListener("abort", () => reject(fail()), { once: true });
    });
    const generator = (async function* () {
      for await (const user of prompt as AsyncIterable<SDKUserMessage>) {
        users.push(user);
        // 与真实 CLI 一致：原生 prompt 经 UserPromptSubmit hook 确认轮次关联（适配器据此关闭 pendingInputs）。
        const content = user.message.content;
        const promptText = typeof content === "string" ? content
          : content.filter((block) => block.type === "text").map((block) => (block as { text: string }).text).join("\n");
        await options!.hooks!.UserPromptSubmit![0]!.hooks[0]!({ hook_event_name: "UserPromptSubmit", prompt_id: user.uuid, prompt: promptText, session_id: "fixture", transcript_path: "fixture", cwd: options!.cwd! }, undefined, { signal });
        await Promise.race([released, abortPromise]);
        if (signal.aborted) throw fail();
        yield assistantFrame([{ type: "text", text: "网络恢复后完成" }]);
        yield { type: "result", subtype: "success", is_error: false, session_id: "fixture", user_message_uuid: user.uuid } as SDKMessage;
      }
    })();
    void abortPromise.catch(() => {}); // 观察者：避免生成器提前退出时的未处理拒绝
    return Object.assign(generator, {
      async interrupt() {},
      close() {},
      async mcpServerStatus() { return []; },
    }) as unknown as Query;
  };
  return { users, release, dependencies: { env: environment, loadSdk: async () => ({ createSdkMcpServer, query }), loadZod: async () => z } };
}

async function withDiagnostics<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ans-network-state-e2e-diag-"));
  configureDiagnostics({ directory: dir });
  try { return await fn(dir); } finally { await disposeDiagnostics(); await rm(dir, { recursive: true, force: true }); }
}

interface DiagRecord { event: string; [key: string]: unknown }
async function diagnosticEvents(dir: string): Promise<DiagRecord[]> {
  await flushDiagnostics();
  const records: DiagRecord[] = [];
  for (const file of await readdir(dir)) {
    const text = await readFile(join(dir, file), "utf8");
    for (const line of text.trim().split("\n")) if (line !== "") records.push(JSON.parse(line) as DiagRecord);
  }
  return records;
}

const offlineState = (): NetworkState => ({ online: false, source: "main-net", at: Date.now(), stableForMs: 0, reason: "initial" });
const onlineState = (): NetworkState => ({ online: true, source: "main-net", at: Date.now(), stableForMs: 0, reason: "probe" });

async function runPausedE2e(): Promise<{ events: OrchestrationEvent[]; failure: Error | undefined; diagnostics: DiagRecord[]; users: number }> {
  return withDiagnostics(async (diagDir) => {
    const root = projectFixture();
    const fake = fakeSdk();
    const gate = createNetworkGate();
    gate.apply(offlineState()); // 请求开始前已离线：deadline 先 pause 再 start
    const listing = await listProject(root);
    const project = buildProjectConfig(listing, { accepted: true, source: "unit-test:network-state-e2e" });
    const handle = await openRoleSession(
      { roleId: "A", runtime: "claude", project, persistSession: false },
      {
        runtimeOptions: {
          providerFactories: { claude: (providerOptions) => createClaudeRuntimeAdapter(providerOptions, fake.dependencies) },
          requestFirstByteTimeoutMs: 40,
          requestIdleTimeoutMs: 40,
          networkGate: gate,
          networkRetryWindowMs: 60_000,
        },
      },
    );
    const events: OrchestrationEvent[] = [];
    const collector = (async () => {
      for await (const event of handle.events()) {
        events.push(event);
        if (event.kind === "settled") break;
      }
    })();
    const sending = handle.send("离线暂停 e2e");
    await tick(150); // 超过 first-byte 40ms：若未暂停会超时失败
    assert.equal(events.filter((event) => event.kind === "settled").length, 0, "离线暂停期间不得触发请求超时/终态");
    assert.ok(events.some((event) => event.kind === "message" && (event.detail as { reasonCode?: unknown } | undefined)?.reasonCode === "network-offline" && (event.detail as { state?: unknown }).state === "offline"), "离线暂停应有系统行");
    gate.apply(onlineState());
    fake.release();
    const failure = await sending.then(() => undefined, (error: unknown) => error as Error);
    await collector;
    await handle.dispose();
    assert.equal(existsSync(join(root, ".ans")), false, "网络暂停回合不得写项目 .ans/（零项目写入）");
    return { events, failure, diagnostics: await diagnosticEvents(diagDir), users: fake.users.length };
  });
}

async function runWindowE2e(): Promise<{ events: OrchestrationEvent[]; failure: (Error & { code?: string }) | undefined; diagnostics: DiagRecord[]; users: number }> {
  return withDiagnostics(async (diagDir) => {
    const root = projectFixture();
    const fake = fakeSdk();
    const gate = createNetworkGate();
    gate.apply(offlineState());
    const listing = await listProject(root);
    const project = buildProjectConfig(listing, { accepted: true, source: "unit-test:network-state-e2e" });
    const handle = await openRoleSession(
      { roleId: "A", runtime: "claude", project, persistSession: false },
      {
        runtimeOptions: {
          providerFactories: { claude: (providerOptions) => createClaudeRuntimeAdapter(providerOptions, fake.dependencies) },
          requestFirstByteTimeoutMs: 5_000,
          requestIdleTimeoutMs: 5_000,
          networkGate: gate,
          networkRetryWindowMs: 60, // 注入小值：窗口耗尽 ⇒ failed
        },
      },
    );
    const events: OrchestrationEvent[] = [];
    const collector = (async () => {
      for await (const event of handle.events()) {
        events.push(event);
        if (event.kind === "settled") break;
      }
    })();
    const failure = await handle.send("离线窗口 e2e").then(() => undefined, (error: unknown) => error as Error & { code?: string });
    await collector;
    await handle.dispose();
    assert.equal(existsSync(join(root, ".ans")), false, "网络窗口耗尽回合不得写项目 .ans/（零项目写入）");
    return { events, failure, diagnostics: await diagnosticEvents(diagDir), users: fake.users.length };
  });
}

test("e2e 离线暂停：deadline 跨 idle 时限不超时；恢复后 resume 并正常完成；恰一条 settled、无 handback", async () => {
  const result = await runPausedE2e();
  assert.equal(result.failure, undefined, "恢复后必须正常完成（不得把暂停当失败）");
  const terminals = result.events.filter((event) => event.kind === "settled");
  assert.equal(terminals.length, 1, "恰一条 settled");
  assert.equal((terminals[0] as { detail?: { outcome?: unknown } }).detail?.outcome, "completed");
  assert.equal(result.events.filter((event) => event.kind === "handback").length, 0, "成功回合不得产生 handback");
  assert.equal(result.users, 1, "ANS 只发一次请求输入（暂停不是重放）");
  assert.ok(result.diagnostics.some((record) => record.event === "network.request.pause" && record.state === "offline"));
  assert.ok(result.diagnostics.some((record) => record.event === "network.request.resume" && record.state === "online"));
  assert.ok(!result.diagnostics.some((record) => record.event === "network.request.timeout"), "恢复后不得有窗口耗尽诊断");
});

test("e2e 离线超窗：network-offline-timeout 终态 failed；人话短报、detail errorCode；无额外 settled/handback", async () => {
  const result = await runWindowE2e();
  assert.ok(result.failure, "窗口耗尽必须让 send 失败（不得伪造成功）");
  assert.equal(result.failure!.name, "NetworkOfflineError");
  assert.equal(result.failure!.code, "network-offline-timeout");
  const terminals = result.events.filter((event) => event.kind === "settled");
  assert.equal(terminals.length, 1, "恰一条 settled（不产生额外 settled）");
  const terminal = terminals[0]!;
  assert.equal(terminal.summary, "网络已断开，等待恢复超时，本轮已结束。", "短报为人话，不含技术 code");
  const detail = (terminal as { detail?: { outcome?: unknown; errorCode?: unknown; attempts?: unknown; replaySafe?: unknown } }).detail;
  assert.equal(detail?.outcome, "failed", "网络超窗终态是 failed（不是最后兜底 timed_out）");
  assert.equal(detail?.errorCode, "network-offline-timeout");
  assert.equal(detail?.attempts, 1);
  assert.equal(typeof detail?.replaySafe, "boolean");
  assert.equal(result.events.filter((event) => event.kind === "handback").length, 0, "失败回合不得产生 handback（不自动重放，重试属 P3）");
  assert.equal(result.users, 1, "ANS 只发一次请求输入（P2 不重放）");
  assert.ok(result.diagnostics.some((record) => record.event === "network.request.pause" && record.state === "offline"));
  assert.ok(result.diagnostics.some((record) => record.event === "network.request.timeout" && record.errorCode === "network-offline-timeout"));
});

// —————————————— 队列 e2e（真实 SessionManager + 注入网络门） ——————————————

interface QueueStateSnapshot {
  roleId: string;
  busy: boolean;
  summaries: string[];
  queue: { kind: string; id: string; summary: string }[];
  blockedReason?: string | null;
  headKind?: string | null;
}

function handback(taskId: string): TaskHandback {
  return {
    roleId: "A",
    taskId,
    status: "completed",
    summary: `完成 ${taskId}`,
    evidence: ["角色卡/A/role-card.md"],
    at: "2026-10-30T12:00:00.000Z",
  };
}

function listing(): ProjectListing {
  const mk = (roleId: string, builtIn = false): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: builtIn ? "" : `角色卡/${roleId}/role-card.md`,
    boundaryPath: builtIn ? "" : `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: builtIn
      ? { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }
      : {
          entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
          boundarySource: `角色卡/${roleId}/boundary.yaml`,
          acceptance: { accepted: false, source: "" },
        },
    builtIn: builtIn ? true : undefined,
  });
  return { projectRoot: "/proj", roles: [mk("su", true), mk("A")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

function makeQueueHarness(gate: ReturnType<typeof createNetworkGate>) {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const roleStates: QueueStateSnapshot[] = [];
  const stopped: Record<string, boolean> = { su: false, A: false };
  const attempts: Record<string, number> = { su: 0, A: 0 };
  const makeHandle = (roleId: string): RoleSessionHandle => ({
    runtime: "demo",
    roleId,
    async send(text: string, opts?: RoleSessionSendOptions): Promise<void> {
      attempts[roleId] += 1;
      opts?.onTurnStarted?.({ turnId: `turn-${roleId}-${attempts[roleId]}`, roleId, runtime: "demo" });
      sent[roleId].push(text);
    },
    events(): AsyncIterable<OrchestrationEvent> {
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              for (let tries = 0; tries < 4000; tries += 1) {
                if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                const arr = streams[roleId] ?? [];
                if (i < arr.length) return { value: arr[i++], done: false };
                await new Promise((r) => setTimeout(r, 5));
              }
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async abort() { return { ok: true, supported: true }; },
    async dispose(): Promise<void> { stopped[roleId] = true; },
  });
  const mgr = new SessionManager({
    openRoleSession: async (input) => makeHandle(input.roleId),
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === l.projectRoot ? l : undefined),
    emitEvent: () => {},
    emitRoleState: (info) => roleStates.push({
      roleId: info.roleId,
      busy: info.busy,
      summaries: [...info.summaries],
      queue: (info.queue ?? []).map((item) => ({ kind: item.kind, id: item.id, summary: item.summary })),
      blockedReason: info.blockedReason ?? null,
      headKind: info.headKind ?? null,
    }),
    networkGate: gate,
    now: () => Date.now(),
  });
  return { mgr, streams, sent, roleStates, latest: (roleId: string) => roleStates.filter((s) => s.roleId === roleId).at(-1) };
}

test("e2e 队列：离线保留并标 blockedReason=network；恢复后按既有 drain 继续且恰投递一次", async () => {
  const gate = createNetworkGate();
  const h = makeQueueHarness(gate);
  try {
    await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await tick(30);
    gate.apply(offlineState());
    h.mgr.applyNetworkState(offlineState());
    h.streams.A.push({ kind: "handback", summary: "回交1", handback: handback("P2-NET-1") });
    await until(() => (h.latest("su")?.queue.length ?? 0) === 1, "离线回交未入队");
    await tick(60);
    assert.equal(h.sent.su.length, 0, "离线期间不得认领新投递");
    const offlineStateView = h.latest("su")!;
    assert.equal(offlineStateView.blockedReason, "network", "数据面标 blockedReason:network");
    assert.equal(offlineStateView.headKind, "handback");
    assert.equal(offlineStateView.queue.length, 1, "队列保留（不丢弃）");

    gate.apply(onlineState());
    h.mgr.applyNetworkState(onlineState());
    await until(() => h.sent.su.length === 1, "恢复后未按既有投递机制继续");
    assert.equal(h.sent.su.length, 1, "恢复后恰投递一次");
    // 完成该轮：队列清空、不再重复投递。
    h.streams.su.push({ kind: "settled", summary: "回交轮完成", turnId: "turn-su-1", roleId: "su", runtime: "demo" });
    await until(() => (h.latest("su")?.queue.length ?? 0) === 0 && h.latest("su")?.busy === false, "队列未排空");
    await tick(80);
    assert.equal(h.sent.su.length, 1, "已投递条目不得重复投递");
    assert.equal(h.latest("su")?.blockedReason, null, "恢复且队列空后无阻塞原因");
  } finally {
    await h.mgr.stop(null);
  }
});

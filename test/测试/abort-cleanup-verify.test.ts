// test/测试/abort-cleanup-verify.test.ts
// 测试角色：卡死修复（中止清理失败后的隔离解除 / 底层永不 settle 的 fail-closed /
// Claude 已关闭查询）独立验收（2026-10-17）。
//
// 复现目标（客户 2026-10-17 卡死问题）：
//   ① 假 provider 的 abort 抛错、底层次轮稍后 settle ⇒ 隔离必须解除，后续 prompt 可再次进入；
//   ② 底层永不 settle ⇒ 仍拒绝（fail-closed），不得因清理失败就放行下一轮；
//   ③ 断言不会永久卡在「中止清理中」；
//   ④ Claude 适配器把 "Query closed before response received" 视为「已中止」而非清理失败；
//      其他 interrupt 错误仍如实上抛。
//
// 全部离线：假 provider / 假 Claude SDK；不读 `.env`、不触真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import * as z from "zod";
import type { Options, Query, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { createInteractionGate } from "../../src/common/runtime-core/timeout.ts";
import { createClaudeRuntimeAdapter, type ClaudeAdapterDependencies } from "../../src/provider/claude/session.ts";
import { isQueryClosedError } from "../../src/common/claude-adapter/lifecycle.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RoleSession, RuntimeProviderFactory, SessionEvent, WriteGate } from "../../src/model/runtime.ts";

const role: ResolvedRole = {
  id: "abort-verify",
  kind: "project",
  cardText: "# 中止验证",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture",
  location: { card: "fixture", boundary: "fixture" },
};

const allow: WriteGate = () => ({ allowed: true, matchedEntry: { root: "project", path: "x", kind: "file", purpose: "fixture" } });

function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error("fixture wait timed out"));
      setTimeout(tick, 2);
    };
    tick();
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ProviderState {
  prompts: number;
  aborts: number;
  releases: Array<() => void>;
}

/** 按剧本：hang ＝ 永不自行 settle；complete ＝ 立即 settled。 */
function controlledProvider(script: readonly ("hang" | "complete")[]): { factory: RuntimeProviderFactory; state: ProviderState } {
  const state: ProviderState = { prompts: 0, aborts: 0, releases: [] };
  const factory: RuntimeProviderFactory = (options) => {
    options.registerToolDisplayProfile?.({ credentials: [] });
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        const queue = createEventQueue<SessionEvent>();
        return {
          async prompt() {
            state.prompts += 1;
            const index = state.prompts - 1;
            const mode = script[index] ?? "complete";
            if (mode === "hang") {
              await new Promise<void>((resolve) => {
                state.releases.push(() => {
                  queue.push({ kind: "settled", summary: "底层轮次稍后结束", detail: { outcome: "completed" } });
                  resolve();
                });
              });
              return;
            }
            queue.push({ kind: "settled", summary: "会话结束", detail: { outcome: "completed" } });
          },
          events: () => queue.stream,
          async abort() {
            state.aborts += 1;
            throw new Error("abort boom");
          },
          async dispose() { queue.close(); },
        };
      },
    };
  };
  return { factory, state };
}

async function collect(session: RoleSession): Promise<{ events: SessionEvent[]; done: Promise<void> }> {
  const events: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) events.push(event); })();
  return { events, done };
}

test("abort 抛错但底层稍后 settle：隔离解除，后续 prompt 可再次进入，不永久卡在「中止清理中」", async () => {
  const root = process.cwd();
  const { factory, state } = controlledProvider(["hang", "complete"]);
  const session = await createRuntimeAdapter({
    runtime: "claude",
    gate: allow,
    projectRoot: root,
    skillRoot: root,
    providerFactories: { claude: factory },
  }).bindRole(role);
  const { events, done } = await collect(session);

  const first = session.prompt("第一轮");
  void first.catch(() => {});
  await until(() => state.prompts === 1);

  // abort 清理本身失败：如实上抛，但不得因此永久隔离。
  await assert.rejects(async () => { await session.abort!(); }, /abort boom/);
  await assert.rejects(first, /中止|abort/i);
  await until(() => events.some((event) => event.kind === "denied" && event.summary.includes("中止清理失败：abort boom")));
  const firstSettled = events.filter((event) => event.kind === "settled");
  assert.equal(firstSettled.length, 1);
  assert.equal((firstSettled[0]!.detail as { outcome: string }).outcome, "aborted");

  // 底层还没 settle：必须继续拒绝（fail-closed）。
  await assert.rejects(session.prompt("底层未结束"), /中止清理中/);
  assert.equal(state.prompts, 1, "隔离期间不得进入 provider");

  // 底层稍后 settle ⇒ 下一轮可再次进入。
  await until(() => state.releases.length === 1);
  state.releases[0]!();
  await sleep(20);
  await session.prompt("第三轮");
  assert.equal(state.prompts, 2, "隔离解除后必须能再次进入 provider");
  await session.dispose();
  await done;
  assert.equal(
    events.filter((event) => event.kind === "settled").length,
    2,
    "两轮各恰一个 settled（第一轮 aborted、第三轮 completed）",
  );
  assert.deepEqual(
    events.filter((event) => event.kind === "settled").map((event) => (event.detail as { outcome: string }).outcome),
    ["aborted", "completed"],
  );
});

test("底层永不 settle：仍需拒绝后续 prompt（fail-closed），清理失败不等于放行", async () => {
  const root = process.cwd();
  const { factory, state } = controlledProvider(["hang", "complete"]);
  const session = await createRuntimeAdapter({
    runtime: "pi",
    gate: allow,
    projectRoot: root,
    skillRoot: root,
    providerFactories: { pi: factory },
  }).bindRole(role);
  const { events, done } = await collect(session);

  const first = session.prompt("永不结束");
  void first.catch(() => {});
  await until(() => state.prompts === 1);
  await assert.rejects(async () => { await session.abort!(); }, /abort boom/);
  await assert.rejects(first, /中止|abort/i);

  await assert.rejects(session.prompt("仍应拒绝"), /中止清理中/);
  await sleep(50);
  await assert.rejects(session.prompt("仍然拒绝"), /中止清理中/, "底层永不 settle ⇒ 隔离保持，不得放行");
  assert.equal(state.prompts, 1, "隔离期间 provider 0 次进入");
  assert.equal(state.aborts, 1);
  await session.dispose();
  await done;
});

// —————————————————————— Claude 已关闭查询 ——————————————————————

interface ClaudeEngineState {
  configurations: Options[];
  users: number;
  closes: number;
  dependencies: ClaudeAdapterDependencies;
}

function claudeEngine(interrupt: () => Promise<void>): ClaudeEngineState {
  const state = { configurations: [] as Options[], users: 0, closes: 0 } as ClaudeEngineState;
  const query = ({ prompt, options }: { prompt: AsyncIterable<SDKUserMessage> | string; options?: Options }): Query => {
    state.configurations.push(options!);
    const generator = (async function* () {
      if (typeof prompt !== "string") {
        for await (const _user of prompt) state.users += 1;
      }
    })();
    return Object.assign(generator, {
      async interrupt() { await interrupt(); },
      close() { state.closes += 1; },
      async mcpServerStatus() { return []; },
    }) as unknown as Query;
  };
  state.dependencies = {
    env: { ANTHROPIC_API_KEY: "fixture-key", PATH: process.env.PATH },
    loadSdk: async () => ({
      createSdkMcpServer: (() => ({ instance: { registerTool() {} }, timeout: 0 })) as never,
      query: query as never,
    }),
    loadZod: async () => z,
  };
  return state;
}

function claudeOptions(root: string) {
  return {
    runtime: "claude" as const,
    projectRoot: root,
    skillRoot: root,
    tools: [],
    interactionGate: createInteractionGate(),
    currentTurnId: () => undefined,
  };
}

async function claudeSession(interrupt: () => Promise<void>): Promise<{ session: RoleSession; state: ClaudeEngineState; events: SessionEvent[]; done: Promise<void> }> {
  const state = claudeEngine(interrupt);
  const session = await createClaudeRuntimeAdapter(claudeOptions(process.cwd()), state.dependencies).bindRole(role);
  const events: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) events.push(event); })();
  return { session, state, events, done };
}

test("Claude 已关闭查询：Query closed before response received 视为已中止，abort 不抛错", async () => {
  assert.equal(isQueryClosedError(new Error("Query closed before response received")), true);
  assert.equal(isQueryClosedError(new Error("Prefix Query closed before response received")), false, "判据必须逐字");
  assert.equal(isQueryClosedError(new Error("other failure")), false);

  const { session, state, events, done } = await claudeSession(async () => {
    throw new Error("Query closed before response received");
  });
  const prompt = session.prompt("判断");
  void prompt.catch(() => {});
  await until(() => state.users === 1);

  await session.abort?.(); // 不得抛错：查询已关闭即停止已生效
  await assert.rejects(prompt, (error: Error) => error.name === "AbortError");
  await until(() => events.some((event) => event.kind === "settled"));
  const settled = events.filter((event) => event.kind === "settled");
  assert.equal(settled.length, 1);
  assert.equal((settled[0]!.detail as { outcome: string }).outcome, "aborted");
  assert.equal(state.closes >= 1, true, "查询必须关闭");
  await session.dispose();
  await done;
});

test("Claude 其他 interrupt 错误：abort 如实上抛（清理失败可见，不被吞掉）", async () => {
  const { session, state, events, done } = await claudeSession(async () => {
    throw new Error("interrupt boom");
  });
  const prompt = session.prompt("判断");
  void prompt.catch(() => {});
  await until(() => state.users === 1);
  await assert.rejects(async () => { await session.abort!(); }, /interrupt boom/);
  await assert.rejects(prompt, (error: Error) => error.name === "AbortError");
  await until(() => events.some((event) => event.kind === "settled"));
  await session.dispose();
  await done;
});

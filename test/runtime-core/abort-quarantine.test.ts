import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import type { RoleSession, RuntimeProviderFactory, SessionEvent } from "../../src/model/runtime.ts";
import { registerControlledDisplayProfile, allow, role, until } from "./fixtures.ts";

/** 假 inner session：离线，无 SDK、无真实模型/凭据/网络。 */
function factoryOf(inner: (queue: ReturnType<typeof createEventQueue<SessionEvent>>) => RoleSession): RuntimeProviderFactory {
  return (options) => (registerControlledDisplayProfile(options), {
    async composeContext() { return { systemPrompt: "fixture" }; },
    async bindRole() { return inner(createEventQueue<SessionEvent>()); },
  });
}

async function bound(inner: (queue: ReturnType<typeof createEventQueue<SessionEvent>>) => RoleSession) {
  const factory = factoryOf(inner);
  const session = await createRuntimeAdapter({ runtime: "claude", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { claude: factory } }).bindRole(role());
  const events: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) events.push(event); })();
  return { session, events, done };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("abort rejection no longer quarantines forever once the underlying turn settles later", async () => {
  let entered = false;
  let calls = 0;
  let release!: () => void;
  const { session, events, done } = await bound((queue) => ({
    async prompt() {
      calls++;
      if (calls === 1) { entered = true; await new Promise<void>((resolve) => { release = resolve; }); return; }
      queue.push({ kind: "settled", summary: "next turn done", detail: { outcome: "completed" } });
    },
    events: () => queue.stream,
    async abort() { throw new Error("Query closed before response received"); },
    async dispose() { queue.close(); },
  }));
  const run = session.prompt("first"); const rejected = assert.rejects(run, /中止/);
  await until(() => entered);
  await assert.rejects(Promise.resolve(session.abort!()), /Query closed before response received/);
  await rejected;
  // 清理失败、底层轮次仍未结束：隔离保持（fail-closed）。
  await assert.rejects(session.prompt("too early"), /上一轮仍在运行或中止清理中/);
  assert.equal(calls, 1);
  // 底层轮次此后真实结束（成功或失败）：隔离解除，下一轮可再次进入。
  release(); await flush();
  await session.prompt("second");
  assert.equal(calls, 2);
  await session.dispose(); await done;
  const terminal = events.filter((event) => event.kind === "settled");
  assert.equal(terminal.length, 2);
  assert.equal((terminal[0].detail as { outcome: string }).outcome, "aborted");
  assert.equal((terminal[1].detail as { outcome: string }).outcome, "completed");
  assert.ok(events.some((event) => event.kind === "denied" && event.summary.includes("Query closed before response received")));
});

test("abort rejection keeps quarantine when the underlying turn never settles", async () => {
  let entered = false;
  let calls = 0;
  const { session, done } = await bound((queue) => ({
    async prompt() { calls++; entered = true; await new Promise<void>(() => {}); },
    events: () => queue.stream,
    async abort() { throw new Error("Query closed before response received"); },
    async dispose() { queue.close(); },
  }));
  const run = session.prompt("first"); const rejected = assert.rejects(run, /中止/);
  await until(() => entered);
  await assert.rejects(Promise.resolve(session.abort!()), /Query closed before response received/);
  await rejected;
  // 底层永不 settle：隔离不得放宽，反复尝试仍被拒绝。
  for (let attempt = 0; attempt < 3; attempt++) {
    await assert.rejects(session.prompt(`next ${attempt}`), /上一轮仍在运行或中止清理中/);
    await flush();
  }
  assert.equal(calls, 1);
  await session.dispose(); await done;
});

test("normal abort without cleanup failure keeps its existing quarantine lifecycle", async () => {
  let entered = false;
  let calls = 0;
  let release!: () => void;
  const { session, events, done } = await bound((queue) => ({
    async prompt() {
      calls++;
      if (calls === 1) { entered = true; await new Promise<void>((resolve) => { release = resolve; }); return; }
      queue.push({ kind: "settled", summary: "next turn done", detail: { outcome: "completed" } });
    },
    events: () => queue.stream,
    async abort() { /* 正常清理：不抛错，也不主动结束底层轮次 */ },
    async dispose() { queue.close(); },
  }));
  const run = session.prompt("first"); const rejected = assert.rejects(run, /中止/);
  await until(() => entered);
  await session.abort!();
  await rejected;
  await assert.rejects(session.prompt("too early"), /上一轮仍在运行或中止清理中/);
  release(); await flush();
  await session.prompt("second");
  assert.equal(calls, 2);
  await session.dispose(); await done;
  assert.equal(events.filter((event) => event.kind === "denied").length, 0);
  const terminal = events.filter((event) => event.kind === "settled");
  assert.deepEqual(terminal.map((event) => (event.detail as { outcome: string }).outcome), ["aborted", "completed"]);
});

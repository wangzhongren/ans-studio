import { registerControlledDisplayProfile } from './fixtures.ts';
import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { resolveRuntimeTimeouts } from "../../src/common/runtime-core/timeout.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import type { RuntimeKind, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent } from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";

async function withPiEnv(prompt: string | undefined, construct: string | undefined, run: () => Promise<void>) {
  const oldPrompt = process.env.ANS_PI_PROMPT_TIMEOUT_MS;
  const oldConstruct = process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS;
  if (prompt === undefined) delete process.env.ANS_PI_PROMPT_TIMEOUT_MS; else process.env.ANS_PI_PROMPT_TIMEOUT_MS = prompt;
  if (construct === undefined) delete process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS; else process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS = construct;
  try { await run(); }
  finally {
    if (oldPrompt === undefined) delete process.env.ANS_PI_PROMPT_TIMEOUT_MS; else process.env.ANS_PI_PROMPT_TIMEOUT_MS = oldPrompt;
    if (oldConstruct === undefined) delete process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS; else process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS = oldConstruct;
  }
}

function immediateProvider(capture: (options: RuntimeProviderOptions) => void): RuntimeProviderFactory {
  return (options) => {
    registerControlledDisplayProfile(options);
    capture(options);
    return {
      async composeContext() { return { systemPrompt: "fixture" }; },
      async bindRole() {
        const queue = createEventQueue<SessionEvent>();
        return { async prompt() { queue.push({ kind: "settled", summary: "done" }); }, events: () => queue.stream, async dispose() { queue.close(); } };
      },
    };
  };
}

test("Pi env 300s/310s values reach both actual Service timers and injected Provider options", async (t) => {
  const scheduled: number[] = [];
  const setOriginal = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback: Parameters<typeof setTimeout>[0], delay?: number, ...args: unknown[]) => {
    scheduled.push(delay ?? 0); return setOriginal(callback, delay, ...args);
  });
  await withPiEnv("300000.8", "310000.9", async () => {
    let received: RuntimeProviderOptions | undefined;
    const session = await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { pi: immediateProvider((options) => { received = options; }) } }).bindRole(role());
    await session.prompt("immediate fixture"); await session.dispose();
    assert.equal(received?.promptTimeoutMs, 300000);
    assert.equal(received?.constructTimeoutMs, 310000);
    assert.ok(scheduled.includes(300000)); assert.ok(scheduled.includes(310000));
    assert.ok(!scheduled.includes(120000));
  });
});

test("Service explicit Pi timing overrides env, including the legacy disabled-timer values", async (t) => {
  const scheduled: number[] = [];
  const setOriginal = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback: Parameters<typeof setTimeout>[0], delay?: number, ...args: unknown[]) => {
    scheduled.push(delay ?? 0); return setOriginal(callback, delay, ...args);
  });
  await withPiEnv("300000", "310000", async () => {
    for (const [promptTimeoutMs, constructTimeoutMs] of [[400000, 410000], [0, -1]] as const) {
      let received: RuntimeProviderOptions | undefined;
      const start = scheduled.length;
      const session = await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), promptTimeoutMs, constructTimeoutMs, providerFactories: { pi: immediateProvider((options) => { received = options; }) } }).bindRole(role());
      await session.prompt("immediate fixture"); await session.dispose();
      assert.equal(received?.promptTimeoutMs, promptTimeoutMs); assert.equal(received?.constructTimeoutMs, constructTimeoutMs);
      const actual = scheduled.slice(start);
      if (promptTimeoutMs > 0) { assert.ok(actual.includes(promptTimeoutMs)); assert.ok(actual.includes(constructTimeoutMs)); }
      else { assert.ok(!actual.includes(0)); assert.ok(!actual.includes(-1)); }
      assert.ok(!actual.includes(300000)); assert.ok(!actual.includes(310000)); assert.ok(!actual.includes(120000));
    }
  });
});

test("Pi effective env parse matches legacy fallback/floor while explicit invalid values stay unchanged", () => {
  for (const value of [undefined, "", "  ", "no", "Infinity", "NaN", "0", "-10"]) {
    assert.deepEqual(resolveRuntimeTimeouts("pi", {}, { ANS_PI_PROMPT_TIMEOUT_MS: value, ANS_PI_CONSTRUCT_TIMEOUT_MS: value }), { promptTimeoutMs: 120000, constructTimeoutMs: 120000 });
  }
  assert.deepEqual(resolveRuntimeTimeouts("pi", {}, { ANS_PI_PROMPT_TIMEOUT_MS: "0.5", ANS_PI_CONSTRUCT_TIMEOUT_MS: "25.9" }), { promptTimeoutMs: 0, constructTimeoutMs: 25 });
  for (const value of [0, -10, Infinity, NaN, 25.9]) {
    const result = resolveRuntimeTimeouts("pi", { promptTimeoutMs: value, constructTimeoutMs: value }, { ANS_PI_PROMPT_TIMEOUT_MS: "300000", ANS_PI_CONSTRUCT_TIMEOUT_MS: "310000" });
    assert.ok(Object.is(result.promptTimeoutMs, value)); assert.ok(Object.is(result.constructTimeoutMs, value));
  }
});

test("other runtime defaults do not consume Pi env and Service gives their actual timers/provider the same default", async (t) => {
  const scheduled: number[] = [];
  const setOriginal = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback: Parameters<typeof setTimeout>[0], delay?: number, ...args: unknown[]) => {
    scheduled.push(delay ?? 0); return setOriginal(callback, delay, ...args);
  });
  await withPiEnv("300000", "310000", async () => {
    for (const runtime of ["demo", "codex", "claude"] as RuntimeKind[]) {
      let received: RuntimeProviderOptions | undefined;
      const start = scheduled.length;
      const session = await createRuntimeAdapter({ runtime, gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { [runtime]: immediateProvider((options) => { received = options; }) } }).bindRole(role());
      await session.prompt("immediate fixture"); await session.dispose();
      assert.equal(received?.promptTimeoutMs, 120000); assert.equal(received?.constructTimeoutMs, 120000);
      const actual = scheduled.slice(start); assert.equal(actual.filter((delay) => delay === 120000).length, 2);
      assert.ok(!actual.includes(300000)); assert.ok(!actual.includes(310000));
    }
  });
});

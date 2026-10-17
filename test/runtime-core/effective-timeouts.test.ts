import { registerControlledDisplayProfile } from './fixtures.ts';
import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { DEFAULT_CONSTRUCT_TIMEOUT_MS, DEFAULT_SHELL_EXEC_TIMEOUT_MS, DEFAULT_SHELL_REVIEW_TIMEOUT_MS, resolveRuntimeTimeouts } from "../../src/common/runtime-core/timeout.ts";
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

test("Pi env 300s/310s reach the Provider inspection option while the Service turn timer uses the fixed 1h last resort", async (t) => {
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
    assert.equal(received?.turnLastResortMs, 3600000);
    assert.equal(received?.constructTimeoutMs, 310000);
    assert.ok(scheduled.includes(310000)); assert.ok(scheduled.includes(3600000));
    assert.ok(!scheduled.includes(300000)); // inspection deadline never aborts the turn
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
      assert.equal(received?.promptTimeoutMs, promptTimeoutMs); assert.equal(received?.turnLastResortMs, 3600000); assert.equal(received?.constructTimeoutMs, constructTimeoutMs);
      const actual = scheduled.slice(start);
      if (promptTimeoutMs > 0) { assert.ok(actual.includes(constructTimeoutMs)); assert.ok(actual.includes(3600000)); }
      else { assert.ok(!actual.includes(0)); assert.ok(!actual.includes(-1)); }
      assert.ok(!actual.includes(promptTimeoutMs)); // inspection deadline is not a turn timer
      assert.ok(!actual.includes(300000)); assert.ok(!actual.includes(310000)); assert.ok(!actual.includes(120000));
    }
  });
});

test("Pi effective env parse matches legacy fallback/floor while explicit invalid values stay unchanged", () => {
  for (const value of [undefined, "", "  ", "no", "Infinity", "NaN", "0", "-10"]) {
    assert.deepEqual(resolveRuntimeTimeouts("pi", {}, { ANS_PI_PROMPT_TIMEOUT_MS: value, ANS_PI_CONSTRUCT_TIMEOUT_MS: value }), { promptTimeoutMs: 300000, turnLastResortMs: 3600000, constructTimeoutMs: 120000 });
  }
  assert.deepEqual(resolveRuntimeTimeouts("pi", {}, { ANS_PI_PROMPT_TIMEOUT_MS: "0.5", ANS_PI_CONSTRUCT_TIMEOUT_MS: "25.9" }), { promptTimeoutMs: 0, turnLastResortMs: 3600000, constructTimeoutMs: 25 });
  for (const value of [0, -10, Infinity, NaN, 25.9]) {
    const result = resolveRuntimeTimeouts("pi", { promptTimeoutMs: value, turnLastResortMs: value, constructTimeoutMs: value }, { ANS_PI_PROMPT_TIMEOUT_MS: "300000", ANS_PI_CONSTRUCT_TIMEOUT_MS: "310000" });
    assert.ok(Object.is(result.promptTimeoutMs, value)); assert.ok(Object.is(result.turnLastResortMs, value)); assert.ok(Object.is(result.constructTimeoutMs, value));
  }
});

test("turn last resort defaults to one hour without env and is overridable for injection", () => {
  assert.equal(resolveRuntimeTimeouts("pi", {}, {}).promptTimeoutMs, 300000);
  assert.equal(resolveRuntimeTimeouts("codex", {}, {}).promptTimeoutMs, 300000);
  assert.equal(resolveRuntimeTimeouts("pi", {}, {}).turnLastResortMs, 3600000);
  assert.equal(resolveRuntimeTimeouts("claude", {}, { ANS_PI_PROMPT_TIMEOUT_MS: "300000" }).turnLastResortMs, 3600000);
  assert.equal(resolveRuntimeTimeouts("codex", { turnLastResortMs: 300 }, {}).turnLastResortMs, 300);
});

test("non-turn timeouts stay unchanged: shell exec 10min, review/confirmation 2min, construct 2min", () => {
  assert.equal(DEFAULT_SHELL_EXEC_TIMEOUT_MS, 600000);
  assert.equal(DEFAULT_SHELL_REVIEW_TIMEOUT_MS, 120000);
  assert.equal(DEFAULT_CONSTRUCT_TIMEOUT_MS, 120000);
  assert.equal(resolveRuntimeTimeouts("pi", {}, {}).constructTimeoutMs, 120000);
  assert.equal(resolveRuntimeTimeouts("codex", {}, {}).constructTimeoutMs, 120000);
});

test("inspection env applies to every runtime while explicit options win; construct stays runtime-scoped", () => {
  const env = { ANS_PI_PROMPT_TIMEOUT_MS: "60000", ANS_PI_CONSTRUCT_TIMEOUT_MS: "61000" };
  for (const runtime of ["pi", "claude", "codex", "demo"] as RuntimeKind[]) {
    assert.equal(resolveRuntimeTimeouts(runtime, {}, env).promptTimeoutMs, 60000);
    assert.equal(resolveRuntimeTimeouts(runtime, { promptTimeoutMs: 90000 }, env).promptTimeoutMs, 90000);
    assert.equal(resolveRuntimeTimeouts(runtime, {}, env).turnLastResortMs, 3600000);
  }
  for (const runtime of ["pi", "claude", "codex", "demo"] as RuntimeKind[]) {
    assert.equal(resolveRuntimeTimeouts(runtime, {}, {}).promptTimeoutMs, 300000);
  }
  assert.equal(resolveRuntimeTimeouts("pi", {}, env).constructTimeoutMs, 61000);
  for (const runtime of ["claude", "codex", "demo"] as RuntimeKind[]) {
    assert.equal(resolveRuntimeTimeouts(runtime, {}, env).constructTimeoutMs, 120000);
  }
});

test("all runtimes read the same inspection env; Service still uses the fixed 1h last resort", async (t) => {
  const scheduled: number[] = [];
  const setOriginal = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (callback: Parameters<typeof setTimeout>[0], delay?: number, ...args: unknown[]) => {
    scheduled.push(delay ?? 0); return setOriginal(callback, delay, ...args);
  });
  await withPiEnv("60000", "61000", async () => {
    for (const runtime of ["demo", "codex", "claude"] as RuntimeKind[]) {
      let received: RuntimeProviderOptions | undefined;
      const start = scheduled.length;
      const session = await createRuntimeAdapter({ runtime, gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { [runtime]: immediateProvider((options) => { received = options; }) } }).bindRole(role());
      await session.prompt("immediate fixture"); await session.dispose();
      assert.equal(received?.promptTimeoutMs, 60000); // same inspection env for every runtime
      assert.equal(received?.turnLastResortMs, 3600000);
      assert.equal(received?.constructTimeoutMs, 120000); // non-Pi construct stays 120000
      const actual = scheduled.slice(start);
      assert.equal(actual.filter((delay) => delay === 120000).length, 1); // construct only
      assert.equal(actual.filter((delay) => delay === 3600000).length, 1); // turn last resort
      assert.ok(!actual.includes(60000)); assert.ok(!actual.includes(61000)); // inspection never aborts
      assert.ok(!actual.includes(300000));
    }
  });
});

import { registerControlledDisplayProfile } from './fixtures.ts';
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntimeAdapter, readRuntimeSessionHistory } from "../../src/service/runtime/session.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import type { RoleSession, RuntimeKind, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent } from "../../src/model/runtime.ts";
import { allow, deny, role, until } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-service-"));

test("Service history operation returns scoped Model records/replay through the existing Provider", async () => {
  const root = await temp();
  try {
    const options = { projectRoot: root, roleId: "history-role", runtime: "codex" as const };
    assert.deepEqual(await readRuntimeSessionHistory(options), { entries: [] });
    assert.deepEqual(await readdir(root), []);
    const store = createRuntimeSessionStore(options);
    const record = { version: 1 as const, id: "ans-fixture", roleId: options.roleId, runtime: options.runtime, contextSource: "recovered" as const, nativeSessionId: "native-fixture", createdAt: "created", updatedAt: "updated" };
    const entry = { at: "now", kind: "user" as const, text: "stored history" };
    await store.saveSession(record); await store.appendReplay([entry]);
    assert.deepEqual(await readRuntimeSessionHistory(options), { record, entries: [entry] });
    assert.deepEqual(await readRuntimeSessionHistory({ ...options, runtime: "claude" }), { entries: [] });
    assert.deepEqual(await readRuntimeSessionHistory({ ...options, roleId: "other-role" }), { entries: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
});
function provider(action: (options: RuntimeProviderOptions, emit: (event: SessionEvent) => void, session: RoleSession) => Promise<void>): RuntimeProviderFactory {
  return (options) => (registerControlledDisplayProfile(options), {
    async composeContext(role) { return { systemPrompt: role.cardText }; },
    async bindRole() {
      const queue = createEventQueue<SessionEvent>();
      const session: RoleSession = { contextSource: options.storage ? "fresh" : "in-memory", async prompt() { await action(options, queue.push, session); }, events: () => queue.stream, async abort() {}, async dispose() { queue.close(); } };
      return session;
    },
  });
}
async function collect(session: RoleSession) {
  const events: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) events.push(event); })();
  return { events, done };
}

test("each actual runtime turn publishes one typed original input before native work and retains real assistant text", async () => {
  const root = await temp();
  try {
    for (const runtime of ["pi", "codex", "claude"] as const) {
      const inputs: string[] = [];
      const images = [{ type: "image" as const, data: "IMAGE_NOT_IN_ECHO", mimeType: "image/png" }];
      const options = { images, onTurnStarted: (metadata: { turnId: string }) => { inputs.push(metadata.turnId); } };
      let calls = 0;
      const factory: RuntimeProviderFactory = (providerOptions) => (registerControlledDisplayProfile(providerOptions), {
        async composeContext() { return { systemPrompt: "fixture" }; },
        async bindRole() {
          const queue = createEventQueue<SessionEvent>();
          return {
            async prompt(text, received) {
              calls++;
              assert.equal(received, options);
              assert.equal(received?.images, images);
              const id = providerOptions.currentTurnId();
              assert.equal(id, inputs.at(-1));
              const saved = await providerOptions.storage!.readReplay();
              const original = saved.filter((entry) => entry.kind === "user" && entry.turnId === id);
              assert.equal(original.length, 1);
              assert.equal(original[0].text, text);
              queue.push({ kind: "message", summary: "用户指令：this is real assistant text" });
              queue.push({ kind: "settled", summary: "done" });
            },
            events: () => queue.stream,
            async dispose() { queue.close(); },
          };
        },
      });
      const session = await createRuntimeAdapter({ runtime, gate: allow, projectRoot: root, skillRoot: root, persistSession: true, providerFactories: { [runtime]: factory } }).bindRole(role());
      const { events, done } = await collect(session);
      await session.prompt("same original text", options);
      await session.prompt("same original text", options);
      await session.dispose(); await done;
      const echoes = events.filter((event) => (event.detail as { source?: string } | undefined)?.source === "prompt-input");
      assert.equal(echoes.length, 2);
      assert.equal(calls, 2);
      assert.equal(new Set(inputs).size, 2);
      for (const [index, echo] of echoes.entries()) {
        assert.equal(echo.kind, "message"); assert.equal(echo.runtime, runtime); assert.equal(echo.roleId, "core");
        assert.equal(echo.turnId, inputs[index]);
        assert.deepEqual(echo.detail, { source: "prompt-input", text: "same original text", imageCount: 1, turnId: inputs[index] });
        const start = events.indexOf(echo);
        assert.equal(events[start + 1]?.summary, "用户指令：this is real assistant text");
      }
      assert.equal(events.filter((event) => event.summary === "用户指令：this is real assistant text").length, 2);
      const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "core", runtime });
      assert.equal(history.entries.filter((entry) => entry.kind === "user").length, 2);
      assert.equal(history.entries.filter((entry) => (entry.event?.detail as { source?: string } | undefined)?.source === "prompt-input").length, 2);
      assert.ok(!JSON.stringify(history).includes(images[0].data));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("input echo is absent for rejected or failed-start prompts; demo Core and standalone have one input producer", async () => {
  const root = await temp();
  try {
    const session = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, script: [] }).bindRole(role());
    const { events, done } = await collect(session);
    await assert.rejects(session.prompt("failed start", { onTurnStarted() { throw new Error("start callback failed"); } }), /start callback failed/);
    assert.equal(events.filter((event) => event.kind === "message").length, 0);
    await session.prompt("actual input");
    await session.dispose(); await done;
    await assert.rejects(session.prompt("disposed input"), /关闭/);
    const messages = events.filter((event) => event.kind === "message");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].detail, { source: "prompt-input", text: "actual input", turnId: messages[0].turnId });
    assert.ok(messages[0].turnId);

    const direct = await createDemoRuntimeAdapter({ runtime: "demo", projectRoot: root, skillRoot: root, tools: [], interactionGate: { begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} }, currentTurnId: () => undefined }).bindRole(role());
    const directEvents = await collect(direct);
    await direct.prompt("legacy direct input"); await direct.dispose(); await directEvents.done;
    const directMessages = directEvents.events.filter((event) => event.kind === "message");
    assert.equal(directMessages.length, 1);
    assert.equal(directMessages[0].summary, "用户指令：legacy direct input");
    assert.deepEqual(directMessages[0].detail, { source: "prompt-input", text: "legacy direct input" });
    assert.equal(directMessages[0].turnId, undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Service selects exactly chosen injected factory and executes real governed handler", async () => {
  const root = await temp();
  try {
    for (const runtime of ["pi", "codex", "claude"] as const) {
      let selected: RuntimeKind | undefined;
      const factory = provider(async (options, emit) => {
        selected = options.runtime;
        assert.equal(options.projectRoot, root); assert.equal(options.storage, undefined);
        const tool = options.tools.find((tool) => tool.name === "write_file")!;
        const result = await tool.handler({ name: "write_file", args: { path: "escape/file.txt", content: "x" } });
        emit({ kind: result.ok ? "accepted" : "denied", summary: result.message });
        emit({ kind: "settled", summary: "done" }); emit({ kind: "settled", summary: "duplicate" });
      });
      const session = await createRuntimeAdapter({ runtime, gate: deny, projectRoot: root, skillRoot: root, writeRoot: root, providerFactories: { [runtime]: factory } }).bindRole(role());
      const { events, done } = await collect(session);
      await session.prompt("run"); await session.dispose(); await done;
      assert.equal(selected, runtime); assert.equal(events.filter((event) => event.kind === "settled").length, 1);
      assert.equal(events.at(-1)?.runtime, runtime); assert.equal(events.at(-1)?.roleId, "core");
      assert.ok(events.some((event) => event.kind === "denied"));
      assert.deepEqual(await readdir(root), []);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Service failure never selects another engine and unknown runtime rejected", async () => {
  const root = await temp();
  try {
    let fallback = false;
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, providerFactories: { codex: () => { throw new Error("missing dependency"); }, pi: () => { fallback = true; throw new Error("wrong runtime"); } } });
    await assert.rejects(adapter.bindRole(role()), /missing dependency/); assert.equal(fallback, false);
    assert.throws(() => createRuntimeAdapter({ runtime: "unknown" as RuntimeKind, gate: allow, projectRoot: root, skillRoot: root }), /未知运行时/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Service persists replay and adapter-confirmed deferred context result after prompt", async () => {
  const root = await temp();
  try {
    const factory = provider(async (_options, emit, session) => { session.contextSource = "recovered"; session.contextWarning = "native restore rejected; new context"; session.nativeSessionId = "new-native-id"; emit({ kind: "settled", summary: "done" }); });
    const session = await createRuntimeAdapter({ runtime: "claude", gate: allow, projectRoot: root, skillRoot: root, persistSession: true, providerFactories: { claude: factory } }).bindRole(role());
    assert.deepEqual(await readdir(root), []);
    await session.prompt("past user", { images: [{ type: "image", data: "DO_NOT_STORE_IMAGE", mimeType: "image/png" }] });
    await session.dispose();
    const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "core", runtime: "claude" });
    assert.equal(history.record?.contextSource, "recovered"); assert.equal(history.record?.nativeSessionId, "new-native-id");
    assert.equal(history.entries[0]?.text, "past user");
    assert.ok(!JSON.stringify(history).includes("DO_NOT_STORE_IMAGE"));
    assert.equal(history.entries.filter((entry) => entry.event?.kind === "settled").length, 1);
    assert.match(await readFile(path.join(root, ".ans/sessions/core/claude/ans/index.json"), "utf8"), /recovered/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("customer wait pauses the turn last-resort deadline, abort invalidates late consent, next turn works", async () => {
  const root = await temp();
  try {
    let reply!: (value: { outcome: "answered"; value: { confirmed: true } }) => void;
    let count = 0;
    const results: boolean[] = [];
    const factory = provider(async (options, emit) => {
      count++;
      if (count === 1) {
        const tool = options.tools.find((tool) => tool.name === "request_confirmation")!;
        const result = await tool.handler({ name: tool.name, args: { title: "confirm" } }); results.push(result.ok);
      }
      emit({ kind: "settled", summary: "done", detail: { outcome: "completed" } });
    });
    const session = await createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, turnLastResortMs: 20, customerInput: () => new Promise((resolve) => { reply = resolve; }), providerFactories: { codex: factory } }).bindRole(role());
    const { events, done } = await collect(session);
    const run = session.prompt("ask"); await until(() => reply !== undefined);
    await new Promise((resolve) => setTimeout(resolve, 50)); assert.equal(events.filter((event) => event.kind === "settled").length, 0);
    await session.abort?.(); await assert.rejects(run, /中止/); reply({ outcome: "answered", value: { confirmed: true } });
    await until(() => results.length === 1); assert.deepEqual(results, [false]);
    await session.prompt("next"); await session.dispose(); await done;
    assert.equal(events.filter((event) => event.kind === "settled").length, 2);
    assert.deepEqual(events.filter((event) => event.kind === "settled").map((event) => (event.detail as { outcome: string }).outcome), ["aborted", "completed"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("throw, native failed outcome and last-resort timeout each have one explicit terminal", async () => {
  const root = await temp();
  try {
    for (const [expected, action] of [["failed", async () => { throw new Error("SDK error"); }], ["failed", async (_options: RuntimeProviderOptions, emit: (event: SessionEvent) => void) => { emit({ kind: "settled", summary: "fail", detail: { outcome: "failed" } }); }], ["timed_out", async () => { await new Promise(() => {}); }]] as const) {
      const session = await createRuntimeAdapter({ runtime: "claude", gate: allow, projectRoot: root, skillRoot: root, turnLastResortMs: 15, providerFactories: { claude: provider(action) } }).bindRole(role());
      const { events, done } = await collect(session);
      await session.prompt("run").catch(() => {}); await session.dispose(); await done;
      assert.equal(events.filter((event) => event.kind === "settled").length, 1);
      assert.equal((events.at(-1)?.detail as { outcome: string }).outcome, expected);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("inspection deadline never aborts a progressing turn; the turn completes normally", async () => {
  const root = await temp();
  try {
    let finished = false;
    const session = await createRuntimeAdapter({
      runtime: "claude", gate: allow, projectRoot: root, skillRoot: root,
      promptTimeoutMs: 10, // inspection deadline only
      turnLastResortMs: 60000,
      providerFactories: { claude: provider(async (_options, emit) => {
        await new Promise((resolve) => setTimeout(resolve, 60)); // well past the inspection deadline
        finished = true;
        emit({ kind: "settled", summary: "done", detail: { outcome: "completed" } });
      }) },
    }).bindRole(role());
    const { events, done } = await collect(session);
    await session.prompt("healthy long turn");
    assert.equal(finished, true);
    await session.dispose(); await done;
    const terminals = events.filter((event) => event.kind === "settled");
    assert.equal(terminals.length, 1);
    assert.equal((terminals[0].detail as { outcome: string }).outcome, "completed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("last resort aborts at the injected deadline with distinct last-resort wording", async () => {
  const root = await temp();
  try {
    let entered = false;
    const session = await createRuntimeAdapter({
      runtime: "pi", gate: allow, projectRoot: root, skillRoot: root,
      promptTimeoutMs: 600000, // a far larger inspection deadline must not be what aborts
      turnLastResortMs: 20,
      providerFactories: { pi: provider(async () => { entered = true; await new Promise(() => {}); }) },
    }).bindRole(role());
    const { events, done } = await collect(session);
    await assert.rejects(session.prompt("hang"), (error: Error) => {
      assert.match(error.message, /本轮最后兜底/);
      assert.match(error.message, /最后兜底/);
      assert.doesNotMatch(error.message, /本轮运行超时/);
      return true;
    });
    assert.equal(entered, true);
    await session.dispose(); await done;
    const terminals = events.filter((event) => event.kind === "settled");
    assert.equal(terminals.length, 1);
    assert.equal((terminals[0].detail as { outcome: string }).outcome, "timed_out");
    assert.match(terminals[0].summary, /最后兜底/);
    assert.notEqual(terminals[0].summary, "本轮运行超时");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("adapter-internal timed_out keeps the generic summary and is not mislabeled as last resort", async () => {
  const root = await temp();
  try {
    const session = await createRuntimeAdapter({
      runtime: "claude", gate: allow, projectRoot: root, skillRoot: root,
      providerFactories: { claude: provider(async (_options, emit) => {
        emit({ kind: "settled", summary: "inner timeout", detail: { outcome: "timed_out" } });
      }) },
    }).bindRole(role());
    const { events, done } = await collect(session);
    await session.prompt("inner timeout"); await session.dispose(); await done;
    const terminals = events.filter((event) => event.kind === "settled");
    assert.equal(terminals.length, 1);
    assert.equal((terminals[0].detail as { outcome: string }).outcome, "timed_out");
    assert.equal(terminals[0].summary, "本轮运行超时");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("corrupt ANS index is rejected before native bind allocates a session", async () => {
  const root = await temp();
  try {
    const directory = path.join(root, ".ans/sessions/core/codex/ans");
    await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, "index.json"), "{broken}");
    let bound = false;
    const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() { bound = true; throw new Error("should not allocate"); } });
    await assert.rejects(createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, persistSession: true, providerFactories: { codex: factory } }).bindRole(role()));
    assert.equal(bound, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("transient persistence failure is reported and repaired next prompt can succeed", async () => {
  const root = await temp();
  try {
    let fail = true;
    const factory: RuntimeProviderFactory = (options) => {
      const original = options.storage!.saveSession;
      options.storage!.saveSession = async (record) => { if (fail) { fail = false; throw new Error("transient disk failure"); } return original(record); };
      return provider(async (_options, emit) => { emit({ kind: "settled", summary: "done" }); })(options);
    };
    const session = await createRuntimeAdapter({ runtime: "claude", gate: allow, projectRoot: root, skillRoot: root, persistSession: true, providerFactories: { claude: factory } }).bindRole(role());
    await assert.rejects(session.prompt("first"), /transient disk failure/);
    await session.prompt("repaired"); await session.dispose();
    const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "core", runtime: "claude" });
    assert.equal(history.entries.filter((entry) => entry.kind === "user").length, 2);
    assert.ok(history.record);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Service event top/detail identity and report metadata share the captured turn", async () => {
  const root = await temp();
  try {
    let metadata: unknown;
    const factory = provider(async (options, emit) => {
      const report = options.tools.find((tool) => tool.name === "submit_report")!;
      assert.equal((await report.handler({ name: report.name, args: { status: "completed", summary: "done" } })).ok, true);
      emit({ kind: "message", summary: "native event", detail: { turnId: "native-private-id", payload: "content" } });
      emit({ kind: "settled", summary: "done", detail: { turnId: "native-private-id" } });
    });
    const session = await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: root, skillRoot: root, reportHandback: (_report, meta) => { metadata = meta; }, providerFactories: { pi: factory } }).bindRole(role());
    const { events, done } = await collect(session); await session.prompt("run"); await session.dispose(); await done;
    const id = events.at(-1)?.turnId;
    assert.ok(id); assert.notEqual(id, "native-private-id");
    for (const event of events) { assert.equal(event.turnId, id); assert.equal((event.detail as { turnId: string }).turnId, id); }
    assert.deepEqual(metadata, { turnId: id, roleId: "core", runtime: "pi" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("hanging native abort is bounded, called once, and leaves the session quarantined", async () => {
  const root = await temp();
  try {
    let abortCalls = 0;
    let entered = false;
    const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
      const queue = createEventQueue<SessionEvent>();
      return { async prompt() { entered = true; await new Promise(() => {}); }, events: () => queue.stream, async abort() { abortCalls++; await new Promise(() => {}); }, async dispose() { queue.close(); } };
    } });
    const session = await createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, providerFactories: { codex: factory } }).bindRole(role());
    const { events, done } = await collect(session);
    const prompt = session.prompt("run"); const promptResult = assert.rejects(prompt, /中止/); await until(() => entered);
    const began = Date.now();
    await assert.rejects(Promise.resolve(session.abort!()), /中止清理.*超时/);
    assert.ok(Date.now() - began < 1800); await promptResult;
    assert.equal(abortCalls, 1);
    await assert.rejects(session.prompt("next"), /清理中/);
    await session.dispose(); await done;
    assert.equal(events.filter((event) => event.kind === "settled").length, 1);
    assert.equal((events.at(-1)?.detail as { outcome: string }).outcome, "aborted");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Service configured custom API key is stripped from the actual governed shell child", async () => {
  const root = await temp();
  const name = "ANS_RUNTIME_CORE_TEST_CUSTOM_CREDENTIAL";
  const old = process.env[name]; process.env[name] = "fake-contract-secret";
  try {
    let resultMessage = "";
    const factory = provider(async (options, emit) => {
      const shell = options.tools.find((tool) => tool.name === "run_shell")!;
      const result = await shell.handler({ name: shell.name, args: { command: `${process.execPath} -e 'process.stdout.write(String(process.env.ANS_RUNTIME_CORE_TEST_CUSTOM_CREDENTIAL))'` } });
      assert.equal(result.ok, true); resultMessage = result.message; emit({ kind: "settled", summary: "done" });
    });
    const session = await createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, apiKeyEnvVar: name, shellGate: async () => ({ allow: true, by: "fixture" }), providerFactories: { codex: factory } }).bindRole(role());
    await session.prompt("run"); await session.dispose();
    assert.match(resultMessage, /stdout:\nundefined/); assert.ok(!resultMessage.includes("fake-contract-secret"));
  } finally { if (old === undefined) delete process.env[name]; else process.env[name] = old; await rm(root, { recursive: true, force: true }); }
});

test("outer timeout remains timed_out when abort cleanup emits inner aborted terminals", async () => {
  let completePrompt!: () => void;
  let abortCalls = 0;
  const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
    const queue = createEventQueue<SessionEvent>();
    return {
      async prompt() { await new Promise<void>((resolve) => { completePrompt = resolve; }); },
      events: () => queue.stream,
      async abort() {
        abortCalls++;
        queue.push({ kind: "settled", summary: "inner cleanup", detail: { outcome: "aborted" } });
        queue.push({ kind: "settled", summary: "duplicate inner cleanup", detail: { outcome: "aborted" } });
        completePrompt();
        await Promise.resolve(); // Consume cleanup events before the outer abort promise returns.
      },
      async dispose() { queue.close(); },
    };
  } });
  const session = await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), turnLastResortMs: 15, providerFactories: { pi: factory } }).bindRole(role());
  const { events, done } = await collect(session);
  await assert.rejects(session.prompt("race"), /最后兜底/); await session.dispose(); await done;
  assert.equal(abortCalls, 1);
  const terminal = events.filter((event) => event.kind === "settled");
  assert.equal(terminal.length, 1); assert.equal((terminal[0].detail as { outcome: string }).outcome, "timed_out");
  assert.equal((terminal[0].detail as { turnId: string }).turnId, terminal[0].turnId);
});

test("outer aborted result stays aborted while failing cleanup remains honestly reported", async () => {
  let entered = false;
  let completePrompt!: () => void;
  const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
    const queue = createEventQueue<SessionEvent>();
    return {
      async prompt() { entered = true; await new Promise<void>((resolve) => { completePrompt = resolve; }); },
      events: () => queue.stream,
      async abort() {
        queue.push({ kind: "settled", summary: "inner cleanup failure", detail: { outcome: "failed" } });
        completePrompt(); await Promise.resolve(); throw new Error("cleanup fixture failed");
      },
      async dispose() { queue.close(); },
    };
  } });
  const session = await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { pi: factory } }).bindRole(role());
  const { events, done } = await collect(session);
  const run = session.prompt("abort"); const rejected = assert.rejects(run, /中止/); await until(() => entered);
  await assert.rejects(Promise.resolve(session.abort!()), /cleanup fixture failed/); await rejected;
  await assert.rejects(session.prompt("next"), /清理中/); await session.dispose(); await done;
  const terminal = events.filter((event) => event.kind === "settled");
  assert.equal(terminal.length, 1); assert.equal((terminal[0].detail as { outcome: string }).outcome, "aborted");
  assert.ok(events.some((event) => event.kind === "denied" && event.summary.includes("cleanup fixture failed")));
});


test("Core-managed binding rejects a provider that did not register its display profile before first prompt",async()=>{
  let disposed=0,native=0;
  const factory:RuntimeProviderFactory=options=>{
    assert.equal(options.toolDisplayMode,"required-v1");assert.equal(typeof options.projectToolEvent,"function");assert.equal(typeof options.registerToolDisplayProfile,"function");
    return {async composeContext(){return {systemPrompt:"fixture"};},async bindRole(){return {async prompt(){native++;},events:()=>({async *[Symbol.asyncIterator](){}}),async dispose(){disposed++;}};}};
  };
  await assert.rejects(createRuntimeAdapter({runtime:"codex",gate:allow,projectRoot:process.cwd(),skillRoot:process.cwd(),providerFactories:{codex:factory}}).bindRole(role()),/profile was not registered/);
  assert.equal(native,0);assert.equal(disposed,1);
});

test("ordinary engine failure stays a non-tool fact in live, stored and reloaded events while actual tools retain projections",async()=>{
  const root=await temp();const key='CORE_NON_TOOL_TEST_KEY';const secret='non-tool-fake-secret';const previous=process.env[key];process.env[key]=secret;
  try{
    const factory:RuntimeProviderFactory=options=>{
      registerControlledDisplayProfile(options);
      const queue=createEventQueue<SessionEvent>();
      return {async composeContext(){return {systemPrompt:'fixture'};},async bindRole(){return {
        async prompt(){
          queue.push({kind:'denied',summary:`engine recovery failed ${secret}`,detail:{source:'engine-context-failure',name:'TransportError',rawDetail:secret,outcome:'failed'}});
          queue.push({kind:'accepted',summary:'engine transport prepared',detail:{source:'engine-context-ready',rawDetail:secret}});
          const tool=options.tools.find(tool=>tool.name==='read_file')!;const args={path:'missing-engine-test.txt'},toolCallId='actual-read-call';
          queue.push(options.projectToolEvent!({phase:'start',origin:'handler-start',toolName:tool.name,toolCallId,input:{rule:tool.displayInputRule,args}}));
          const result=await tool.handler({name:tool.name,args,toolCallId});assert.equal(result.ok,false);
          queue.push(options.projectToolEvent!({phase:'result',origin:'handler-result',toolName:tool.name,toolCallId,input:{rule:tool.displayInputRule,args},result}));
          queue.push({kind:'settled',summary:'actual failed outcome',detail:{outcome:'failed'}});
        },events:()=>queue.stream,async dispose(){queue.close();},
      };}};
    };
    const session=await createRuntimeAdapter({runtime:'pi',gate:allow,projectRoot:root,skillRoot:root,persistSession:true,extraCredentialEnvVars:[key],providerFactories:{pi:factory}}).bindRole(role());
    const {events,done}=await collect(session);await session.prompt('observe actual failure');await session.dispose();await done;
    const engine=events.find(event=>event.kind==='denied'&&event.summary.startsWith('engine recovery failed'))!;
    assert.ok(engine);assert.equal(engine.summary,'engine recovery failed [REDACTED]');assert.equal(engine.runtime,'pi');assert.equal(engine.roleId,'core');assert.ok(engine.turnId);
    for(const field of ['toolName','phase','call','display','rawDetail','source','name'])assert.equal(Object.hasOwn(engine.detail??{},field),false,field);
    assert.deepEqual(engine.detail,{turnId:engine.turnId,outcome:'failed'});
    const ready=events.find(event=>event.kind==='accepted'&&event.summary==='engine transport prepared')!;assert.ok(ready);assert.equal(Object.hasOwn(ready.detail??{},'toolName'),false);
    const actual=events.find(event=>(event.detail as {toolName?:string})?.toolName==='read_file'&&event.kind==='denied')!;
    assert.equal((actual.detail as {phase:string}).phase,'result');assert.match((actual.detail as {display:{error:{text:string}}}).display.error.text,/ENOENT/);
    assert.equal((events.at(-1)!.detail as {outcome:string}).outcome,'failed');
    const file=path.join(root,'.ans/sessions/core/pi/ans/replay.jsonl');const raw=await readFile(file,'utf8');assert.ok(!raw.includes(secret));assert.ok(!raw.includes('TransportError'));
    const history=await readRuntimeSessionHistory({projectRoot:root,roleId:'core',runtime:'pi',credentialEnvNames:[key]});
    const restored=history.entries.find(entry=>entry.event?.summary==='engine recovery failed [REDACTED]')!.event!;
    assert.equal(restored.kind,'denied');assert.deepEqual(restored.detail,engine.detail);assert.equal(Object.hasOwn(restored.detail??{},'phase'),false);
    assert.equal((history.entries.find(entry=>(entry.event?.detail as {toolName?:string})?.toolName==='read_file'&&entry.event?.kind==='denied')!.event!.detail as {phase:string}).phase,'result');
    assert.equal(await readFile(file,'utf8'),raw,'history reads must not rewrite old records');
  }finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous;await rm(root,{recursive:true,force:true});}
});

test("history does not resurrect an old empty-name synthetic tool phase on an engine failure",async()=>{
  const root=await temp();try{
    const store=createRuntimeSessionStore({projectRoot:root,roleId:'core',runtime:'pi'});
    await store.appendReplay([{at:'2026-10-15T00:00:00.000Z',kind:'event',turnId:'actual-old-turn',event:{kind:'denied',summary:'old engine failure',runtime:'pi',roleId:'core',turnId:'actual-old-turn',detail:{toolName:'',phase:'blocked',turnId:'actual-old-turn',rawDetail:'password=hide-me'}}}]);
    const history=await readRuntimeSessionHistory({projectRoot:root,roleId:'core',runtime:'pi'});const event=history.entries[0].event!;
    assert.equal(event.kind,'denied');assert.equal(event.summary,'old engine failure');assert.deepEqual(event.detail,{turnId:'actual-old-turn'});assert.equal(Object.hasOwn(event.detail??{},'phase'),false);
  }finally{await rm(root,{recursive:true,force:true});}
});

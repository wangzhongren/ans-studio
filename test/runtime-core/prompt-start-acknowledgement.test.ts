import { registerControlledDisplayProfile } from './fixtures.ts';
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntimeAdapter, readRuntimeSessionHistory } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import type { PromptOptions, PromptTurnStartedMetadata, ReportHandbackMetadata, RoleSession, RuntimeProviderFactory, SessionEvent } from "../../src/model/runtime.ts";
import { allow, role, until } from "./fixtures.ts";

function collect(session: RoleSession) {
  const events: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) events.push(event); })();
  return { events, done };
}

test("actual turn has one synchronous acknowledgement before persisted input/native work and shares all identities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-start-ack-"));
  try {
    const order: string[] = [];
    const acknowledgements: PromptTurnStartedMetadata[] = [];
    let reportMetadata: ReportHandbackMetadata | undefined;
    const forwarded: Array<PromptOptions | undefined> = [];
    const factory: RuntimeProviderFactory = (options) => {
      registerControlledDisplayProfile(options);
      const append = options.storage!.appendReplay;
      options.storage!.appendReplay = async (entries) => {
        if (entries.some((entry) => entry.kind === "user")) order.push("persist-user");
        return append(entries);
      };
      return { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
        const queue = createEventQueue<SessionEvent>();
        return {
          async prompt(_text, promptOptions) {
            forwarded.push(promptOptions); order.push("native");
            const report = options.tools.find((tool) => tool.name === "submit_report")!;
            assert.equal((await report.handler({ name: report.name, args: { status: "completed", summary: "done" } })).ok, true);
            queue.push({ kind: "message", summary: "native message", detail: { turnId: "private-native-turn" } });
            queue.push({ kind: "settled", summary: "done", detail: { outcome: "completed" } });
          },
          events: () => queue.stream, async dispose() { queue.close(); },
        };
      } };
    };
    const session = await createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, persistSession: true, reportHandback: (_report, metadata) => { reportMetadata = metadata; }, providerFactories: { codex: factory } }).bindRole(role());
    const { events, done } = collect(session);
    const promptOptions: PromptOptions = { images: [{ type: "image", data: "fake-image-data", mimeType: "image/png" }], onTurnStarted(metadata) { order.push("ack"); acknowledgements.push(metadata); } };
    const run = session.prompt("original input", promptOptions);
    assert.equal(acknowledgements.length, 1); assert.equal(order[0], "ack"); assert.equal(forwarded.length, 0);
    await run; await session.dispose(); await done;
    assert.deepEqual(order, ["ack", "persist-user", "native"]); assert.equal(acknowledgements.length, 1);
    assert.equal(forwarded.length, 1); assert.equal(forwarded[0], promptOptions); assert.equal(forwarded[0]?.images, promptOptions.images);
    const metadata = acknowledgements[0];
    assert.deepEqual(Object.keys(metadata).sort(), ["roleId", "runtime", "turnId"]);
    assert.equal(metadata.roleId, "core"); assert.equal(metadata.runtime, "codex"); assert.ok(metadata.turnId);
    assert.deepEqual(reportMetadata, metadata);
    for (const event of events) { assert.equal(event.turnId, metadata.turnId); assert.equal((event.detail as { turnId: string }).turnId, metadata.turnId); }
    const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "core", runtime: "codex" });
    assert.equal(history.entries.find((entry) => entry.kind === "user")?.turnId, metadata.turnId);
    for (const entry of history.entries.filter((entry) => entry.kind === "event")) {
      assert.equal(entry.turnId, metadata.turnId); assert.equal(entry.event?.turnId, metadata.turnId); assert.equal((entry.event?.detail as { turnId: string }).turnId, metadata.turnId);
    }
    assert.ok(!JSON.stringify(history).includes("onTurnStarted"));
    assert.ok(!JSON.stringify(history).includes("fake-image-data"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("active and disposed prompt rejections have no turn acknowledgement", async () => {
  let entered = false;
  let complete!: () => void;
  const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
    const queue = createEventQueue<SessionEvent>();
    return { async prompt() { entered = true; await new Promise<void>((resolve) => { complete = resolve; }); queue.push({ kind: "settled", summary: "done" }); }, events: () => queue.stream, async dispose() { queue.close(); } };
  } });
  const session = await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { pi: factory } }).bindRole(role());
  const acknowledgements: PromptTurnStartedMetadata[] = [];
  const options: PromptOptions = { onTurnStarted(metadata) { acknowledgements.push(metadata); } };
  const run = session.prompt("first", options); await until(() => entered);
  await assert.rejects(session.prompt("while active", options), /上一轮/); assert.equal(acknowledgements.length, 1);
  complete(); await run; await session.dispose();
  await assert.rejects(session.prompt("disposed", options), /已关闭/); assert.equal(acknowledgements.length, 1);
});

test("quarantined prompt rejection has no acknowledgement after one stopped actual turn", async () => {
  let entered = false;
  let complete!: () => void;
  const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
    const queue = createEventQueue<SessionEvent>();
    return {
      async prompt() { entered = true; await new Promise<void>((resolve) => { complete = resolve; }); }, events: () => queue.stream,
      async abort() { complete(); throw new Error("native cleanup rejected"); }, async dispose() { queue.close(); },
    };
  } });
  const session = await createRuntimeAdapter({ runtime: "claude", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { claude: factory } }).bindRole(role());
  let acknowledgements = 0;
  const options: PromptOptions = { onTurnStarted() { acknowledgements++; } };
  const run = session.prompt("first", options); const rejected = assert.rejects(run, /中止/); await until(() => entered);
  await assert.rejects(Promise.resolve(session.abort!()), /native cleanup rejected/); await rejected;
  await assert.rejects(session.prompt("quarantined", options), /清理中/); assert.equal(acknowledgements, 1);
  await session.dispose();
});

test("synchronous acknowledgement throw yields one failed terminal, zero native work, and releases the turn", async () => {
  let nativePrompts = 0;
  let nativeAborts = 0;
  const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
    const queue = createEventQueue<SessionEvent>();
    return { async prompt() { nativePrompts++; queue.push({ kind: "settled", summary: "done" }); }, events: () => queue.stream, async abort() { nativeAborts++; }, async dispose() { queue.close(); } };
  } });
  const session = await createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), providerFactories: { codex: factory } }).bindRole(role());
  const { events, done } = collect(session);
  const metadata: PromptTurnStartedMetadata[] = [];
  await assert.rejects(session.prompt("callback fails", { onTurnStarted(value) { metadata.push(value); throw new Error("observer failed"); } }), /observer failed/);
  assert.equal(metadata.length, 1); assert.equal(nativePrompts, 0); assert.equal(nativeAborts, 0);
  await session.prompt("next legitimate turn", { onTurnStarted(value) { metadata.push(value); } }); await session.dispose(); await done;
  assert.equal(metadata.length, 2); assert.equal(nativePrompts, 1); assert.notEqual(metadata[0].turnId, metadata[1].turnId);
  const terminal = events.filter((event) => event.kind === "settled");
  assert.equal(terminal.length, 2); assert.deepEqual(terminal.map((event) => (event.detail as { outcome: string }).outcome), ["failed", "completed"]);
  assert.deepEqual(terminal.map((event) => event.turnId), metadata.map((value) => value.turnId));
});

test("acknowledged turns keep aborted/timed_out outcomes and single matching terminal", async () => {
  for (const expected of ["aborted", "timed_out"] as const) {
    let entered = false;
    let complete!: () => void;
    const factory: RuntimeProviderFactory = (options) => (registerControlledDisplayProfile(options), { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
      const queue = createEventQueue<SessionEvent>();
      return { async prompt() { entered = true; await new Promise<void>((resolve) => { complete = resolve; }); }, events: () => queue.stream, async abort() { queue.push({ kind: "settled", summary: "inner cleanup", detail: { outcome: "aborted" } }); complete(); await Promise.resolve(); }, async dispose() { queue.close(); } };
    } });
    const session = await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: process.cwd(), skillRoot: process.cwd(), promptTimeoutMs: expected === "timed_out" ? 15 : 120000, providerFactories: { pi: factory } }).bindRole(role());
    const { events, done } = collect(session);
    const metadata: PromptTurnStartedMetadata[] = [];
    const run = session.prompt("outcome", { onTurnStarted(value) { metadata.push(value); } });
    const rejected = assert.rejects(run, expected === "timed_out" ? /超时/ : /中止/);
    await until(() => entered); if (expected === "aborted") await session.abort?.();
    await rejected; await session.dispose(); await done;
    assert.equal(metadata.length, 1);
    const terminal = events.filter((event) => event.kind === "settled");
    assert.equal(terminal.length, 1); assert.equal(terminal[0].turnId, metadata[0].turnId); assert.equal((terminal[0].detail as { outcome: string }).outcome, expected);
  }
});

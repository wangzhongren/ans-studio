import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setImmediate as nextIO } from "node:timers/promises";
import { openRoleSession, readRoleSessionHistory } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { CustomerInputMetadata, CustomerInputOutcome, RuntimeKind, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, ToolResult } from "../../src/model/runtime.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

function fixture(): ProjectConfig {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-t1-pipeline-")));
  const dir = path.join(root, "角色卡", "X"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# Independent X\n");
  fs.writeFileSync(path.join(dir, "boundary.yaml"), "role: X\nentries:\n  - kind: directory\n    path: src/X/\n    purpose: independent integration\n");
  return { projectRoot: root, skillRoot: root, roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } }, builtInRoles: ["su"], governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:T1" } } };
}
function engine(work: (options: RuntimeProviderOptions, text: string, signal: AbortSignal) => Promise<void>) {
  const calls: RuntimeProviderOptions[] = [];
  const factory: RuntimeProviderFactory = options => {
    calls.push(options);
    return { async composeContext() { return { systemPrompt: "independent external engine" }; }, async bindRole(role) {
      assert.equal(options.toolDisplayMode, "required-v1");
      assert.equal(typeof options.registerToolDisplayProfile, "function");
      options.registerToolDisplayProfile!({ credentials: [] });
      let controller = new AbortController(), done = false, wake: (() => void) | undefined;
      const rows: SessionEvent[] = [];
      const push = (event: SessionEvent) => { rows.push(event); wake?.(); wake = undefined; };
      return { runtime: options.runtime, roleId: role.id, contextSource: "fresh", nativeSessionId: `T1-native-${options.runtime}`,
        async prompt(text) {
          controller = new AbortController(); const turnId = options.currentTurnId();
          await work(options, text, controller.signal);
          // Repeated/late completion from infrastructure must not produce another terminal or report.
          for (let i = 0; i < 2; i++) push({ kind: "settled", turnId, summary: "external completed", detail: { outcome: "completed" } });
        },
        async *events() { while (!done || rows.length) { if (rows.length) { yield rows.shift()!; continue; } await new Promise<void>(r => { wake = r; }); } },
        async abort() { controller.abort(); }, async dispose() { done = true; controller.abort(); wake?.(); },
      };
    } };
  };
  return { calls, factory };
}
async function tool(options: RuntimeProviderOptions, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
  const definition = options.tools.find(t => t.name === name); assert.ok(definition, `${name} is actually registered`);
  return definition.handler({ name, args, signal, toolCallId: `${options.currentTurnId()}:${name}` });
}
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
async function until(fn: () => boolean) { const end = Date.now() + 2500; while (!fn()) { if (Date.now() > end) throw new Error("T1 observation timeout"); await pause(2); } }
// Observe actual IO without consuming or deadlocking the explicitly controlled deadline clock.
async function untilIO(fn: () => boolean) { const end = performance.now() + 2500; while (!fn()) { if (performance.now() > end) throw new Error("T1 observation timeout"); await nextIO(); } }

for (const runtime of ["pi", "codex", "claude"] as const) {
  test(`T1 ${runtime}: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report`, { timeout: 10000 }, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
    const project = fixture(), receipts: ToolResult[] = [], events: OrchestrationEvent[] = [];
    let answer: ((value: CustomerInputOutcome) => void) | undefined, metadata: CustomerInputMetadata | undefined, phase = 0;
    const provider = engine(async (options, text, signal) => {
      if (text === "confirm") receipts.push(await tool(options, "request_confirmation", { title: "T1 exact write", preview: "src/X/current.txt\n\n确认正文：本轮写出的有效内容。\n" }, signal));
      else if (text === "write") receipts.push(await tool(options, "write_file", { path: "src/X/current.txt", content: "must be refused after stale yes" }, signal));
      else {
        receipts.push(await tool(options, "request_confirmation", { title: "T1 current write", preview: "src/X/current.txt\n\n确认正文：本轮写出的有效内容。\n" }, signal));
        receipts.push(await tool(options, "write_file", { path: "src/X/current.txt", content: runtime + " valid current consent" }, signal));
        receipts.push(await tool(options, "write_file", { path: "src/X/unlisted.txt", content: "not previewed" }, signal));
        receipts.push(await tool(options, "submit_report", { status: "completed", summary: "T1 current report", evidence: ["src/X/current.txt"] }, signal));
      }
    });
    // 任务级 writeSet 收窄（空集）：2026-10-25 起无 scope 的聊天会话对 Section 1 边界内路径预授权，
    // 会把本用例要验证的“确认发行”短路成无条件可写；scope 让确认成为唯一写权来源，保留原断言。
    const handle = await openRoleSession({ roleId: "X", taskId: "T1", project, runtime, scope: { writeSet: [], conditions: [] },
      customerInput: (_request, context) => {
        if (phase) return { outcome: "answered", value: { confirmed: true } };
        metadata = context; return new Promise<CustomerInputOutcome>(r => { answer = r; });
      },
    }, { runtimeOptions: { providerFactories: { [runtime]: provider.factory }, turnLastResortMs: 100, promptTimeoutMs: 100, persistSession: true } });
    const pump = (async () => { for await (const event of handle.events()) events.push(event); })();
    try {
      const first = handle.send("confirm"); const rejected = assert.rejects(first);
      await untilIO(() => answer !== undefined); t.mock.timers.tick(180); await nextIO();
      assert.equal(events.filter(e => e.kind === "settled").length, 0, "actual waiting gate pauses the 100ms last-resort deadline during 180ms explicit logical customer wait");
      assert.equal(metadata?.runtime, runtime); assert.equal(metadata?.roleId, "X"); assert.ok(metadata?.turnId);
      assert.equal(metadata?.signal?.aborted, false);
      assert.deepEqual(await handle.abort?.(), { ok: true, supported: true }); await rejected;
      assert.equal(metadata?.signal?.aborted, true);
      answer!({ outcome: "answered", value: { confirmed: true } }); t.mock.timers.tick(5); await nextIO();
      await handle.send("write"); assert.equal(receipts.at(-1)?.ok, false); assert.equal(fs.existsSync(path.join(project.projectRoot, "src/X/current.txt")), false);
      phase = 1; await handle.send("current");
      assert.deepEqual(receipts.slice(-4).map(r => r.ok), [true, true, false, true]);
      assert.equal(fs.readFileSync(path.join(project.projectRoot, "src/X/current.txt"), "utf8"), runtime + " valid current consent");
      assert.equal(fs.existsSync(path.join(project.projectRoot, "src/X/unlisted.txt")), false);
      await untilIO(() => events.filter(e => e.kind === "handback").length === 3);
      const terminals = events.filter((e): e is SessionEvent => e.kind === "settled"); assert.equal(terminals.length, 3);
      assert.deepEqual(terminals.map(e => (e.detail as { outcome: string }).outcome), ["aborted", "completed", "completed"]);
      assert.equal(new Set(terminals.map(e => e.turnId)).size, 3);
      assert.ok(terminals.every(e => e.turnId === (e.detail as { turnId: string }).turnId));
      const reports = events.filter(e => e.kind === "handback");
      assert.deepEqual(reports.map(e => e.handback!.status), ["aborted", "unreported", "completed"]);
      assert.equal(reports[2].handback!.turnId, terminals[2].turnId);
      const history = await readRoleSessionHistory({ projectRoot: project.projectRoot, roleId: "X", runtime });
      assert.equal(history.record?.runtime, runtime); assert.equal(history.record?.roleId, "X");
      assert.equal(history.record?.nativeSessionId, `T1-native-${runtime}`);
      assert.deepEqual(history.entries.filter(e => e.kind === "user").map(e => e.text), ["confirm", "write", "current"]);
      assert.equal(fs.existsSync(path.join(project.projectRoot, ".ans/sessions/X", runtime === "pi" ? "codex" : "pi")), false);
    } finally { await handle.dispose(); await pump; fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
  });
  test(`T1 ${runtime}: the same controlled Core clock triggers the 100ms last resort outside customer waiting`, { timeout: 10000 }, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: Date.now() });
    const project = fixture(), events: OrchestrationEvent[] = [];
    let active = false;
    const provider = engine(async (_options, _text, signal) => {
      active = true;
      await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
    });
    const handle = await openRoleSession({ roleId: "X", taskId: "T1-clock-control", project, runtime, persistSession: false },
      { runtimeOptions: { providerFactories: { [runtime]: provider.factory }, turnLastResortMs: 100, promptTimeoutMs: 100 } });
    const pump = (async () => { for await (const event of handle.events()) events.push(event); })();
    try {
      const rejected = assert.rejects(handle.send("no customer wait"), /超时.*100ms/);
      await untilIO(() => active);
      t.mock.timers.tick(99); await nextIO();
      assert.equal(events.filter(event => event.kind === "settled").length, 0, "99 active milliseconds remain below the 100ms last-resort deadline");
      t.mock.timers.tick(1); await rejected;
      await untilIO(() => events.some(event => event.kind === "handback") && events.some(event => event.kind === "settled"));
      const terminals = events.filter((event): event is SessionEvent => event.kind === "settled");
      assert.equal(terminals.length, 1);
      assert.equal((terminals[0].detail as { outcome: string }).outcome, "timed_out");
      assert.match(terminals[0].summary, /最后兜底/, "settled 摘要须明确为「最后兜底」，与到点检查区分");
      const reports = events.filter(event => event.kind === "handback");
      assert.equal(reports.length, 1);
      assert.equal(reports[0].handback!.status, "failed");
      assert.equal(fs.existsSync(path.join(project.projectRoot, "src")), false);
    } finally { await handle.dispose(); await pump; fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
  });
}
for (const outcome of ["failed", "timed_out"] as const) test(`T1 real outer ${outcome} remains one terminal and truthful handback after external cleanup completion`, async () => {
  const project = fixture(), events: OrchestrationEvent[] = [];
  const provider = engine(async (_options, _text, signal) => {
    if (outcome === "failed") throw new Error("T1 deliberate external failure");
    await new Promise<void>(r => signal.addEventListener("abort", () => r(), { once: true }));
  });
  const runtime: RuntimeKind = "codex";
  const handle = await openRoleSession({ roleId: "X", taskId: "T1", runtime, project, persistSession: false }, { runtimeOptions: { providerFactories: { codex: provider.factory }, turnLastResortMs: 30 } });
  const pump = (async () => { for await (const event of handle.events()) events.push(event); })();
  try {
    await assert.rejects(handle.send("fail")); await until(() => events.some(e => e.kind === "settled"));
    const terminal = events.filter((e): e is SessionEvent => e.kind === "settled"); assert.equal(terminal.length, 1);
    assert.equal((terminal[0].detail as { outcome: string }).outcome, outcome);
    assert.equal(events.find(e => e.kind === "handback")!.handback!.status, "failed");
    assert.equal(events.find(e => e.kind === "handback")!.handback!.turnId, terminal[0].turnId);
    assert.equal(fs.existsSync(path.join(project.projectRoot, "src")), false);
  } finally { await handle.dispose(); await pump; fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

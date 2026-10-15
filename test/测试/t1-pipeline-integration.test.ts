import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
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

for (const runtime of ["pi", "codex", "claude"] as const) {
  test(`T1 ${runtime}: real Pipeline confirmation pause → abort → stale yes → next write denied → current yes permits exact path/report`, async () => {
    const project = fixture(), receipts: ToolResult[] = [], events: OrchestrationEvent[] = [];
    let answer: ((value: CustomerInputOutcome) => void) | undefined, metadata: CustomerInputMetadata | undefined, phase = 0;
    const provider = engine(async (options, text, signal) => {
      if (text === "confirm") receipts.push(await tool(options, "request_confirmation", { title: "T1 exact write", preview: "src/X/current.txt" }, signal));
      else if (text === "write") receipts.push(await tool(options, "write_file", { path: "src/X/current.txt", content: "must be refused after stale yes" }, signal));
      else {
        receipts.push(await tool(options, "request_confirmation", { title: "T1 current write", preview: "src/X/current.txt" }, signal));
        receipts.push(await tool(options, "write_file", { path: "src/X/current.txt", content: runtime + " valid current consent" }, signal));
        receipts.push(await tool(options, "write_file", { path: "src/X/unlisted.txt", content: "not previewed" }, signal));
        receipts.push(await tool(options, "submit_report", { status: "completed", summary: "T1 current report", evidence: ["src/X/current.txt"] }, signal));
      }
    });
    const handle = await openRoleSession({ roleId: "X", taskId: "T1", project, runtime,
      customerInput: (_request, context) => {
        if (phase) return { outcome: "answered", value: { confirmed: true } };
        metadata = context; return new Promise<CustomerInputOutcome>(r => { answer = r; });
      },
    }, { runtimeOptions: { providerFactories: { [runtime]: provider.factory }, promptTimeoutMs: 100, persistSession: true } });
    const pump = (async () => { for await (const event of handle.events()) events.push(event); })();
    try {
      const first = handle.send("confirm"); const rejected = assert.rejects(first);
      await until(() => answer !== undefined); await pause(180);
      assert.equal(events.filter(e => e.kind === "settled").length, 0, "actual waiting gate pauses the 100ms deadline during 180ms customer wait");
      assert.equal(metadata?.runtime, runtime); assert.equal(metadata?.roleId, "X"); assert.ok(metadata?.turnId);
      assert.equal(metadata?.signal?.aborted, false);
      assert.deepEqual(await handle.abort?.(), { ok: true, supported: true }); await rejected;
      assert.equal(metadata?.signal?.aborted, true);
      answer!({ outcome: "answered", value: { confirmed: true } }); await pause(5);
      await handle.send("write"); assert.equal(receipts.at(-1)?.ok, false); assert.equal(fs.existsSync(path.join(project.projectRoot, "src/X/current.txt")), false);
      phase = 1; await handle.send("current");
      assert.deepEqual(receipts.slice(-4).map(r => r.ok), [true, true, false, true]);
      assert.equal(fs.readFileSync(path.join(project.projectRoot, "src/X/current.txt"), "utf8"), runtime + " valid current consent");
      assert.equal(fs.existsSync(path.join(project.projectRoot, "src/X/unlisted.txt")), false);
      await until(() => events.filter(e => e.kind === "handback").length === 3);
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
}
for (const outcome of ["failed", "timed_out"] as const) test(`T1 real outer ${outcome} remains one terminal and truthful handback after external cleanup completion`, async () => {
  const project = fixture(), events: OrchestrationEvent[] = [];
  const provider = engine(async (_options, _text, signal) => {
    if (outcome === "failed") throw new Error("T1 deliberate external failure");
    await new Promise<void>(r => signal.addEventListener("abort", () => r(), { once: true }));
  });
  const runtime: RuntimeKind = "codex";
  const handle = await openRoleSession({ roleId: "X", taskId: "T1", runtime, project, persistSession: false }, { runtimeOptions: { providerFactories: { codex: provider.factory }, promptTimeoutMs: 30 } });
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

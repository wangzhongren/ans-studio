import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectConfig } from "../../src/model/role.ts";
import { RuntimeDeliveryError } from "../../src/model/runtime.ts";
import type { PromptOptions, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, RuntimeReportSnapshotV1 } from "../../src/model/runtime.ts";
import { openRoleSession, projectRoleLegacyHistory, readRoleSessionHistory, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { openGovernanceSession } from "../../src/pipeline/orchestration/govern-session.ts";
import type { HandbackEvent, OrchestrationEvent } from "../../src/common/编排/handback.ts";

function project(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-pipeline-c-"));
  const role = path.join(root, "角色卡/X");
  fs.mkdirSync(role, { recursive: true });
  fs.writeFileSync(path.join(role, "role-card.md"), "# X\n");
  fs.writeFileSync(path.join(role, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: report fixture\n");
  return { projectRoot: root, skillRoot: root, roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } }, builtInRoles: ["su"], governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:C1" } } };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("Pipeline observation timeout"); await new Promise<void>(resolve => setTimeout(resolve, 2)); }
}
function provider() {
  let options!: RuntimeProviderOptions;
  let calls = 0;
  const native: { text: string; opts?: PromptOptions }[] = [];
  const factory: RuntimeProviderFactory = received => {
    options = received;
    assert.equal(received.toolDisplayMode, "required-v1");
    received.registerToolDisplayProfile!({ credentials: [] });
    return { async composeContext() { return { systemPrompt: "fixture" }; }, async bindRole() {
      const pending: SessionEvent[] = [];
      let wake: (() => void) | undefined;
      let done = false;
      return {
        async prompt(text, opts) {
          calls += 1; native.push({ text, opts });
          if (text.startsWith("report")) {
            const report = received.tools.find(tool => tool.name === "submit_report");
            assert.ok(report);
            const result = await report.handler({ name: "submit_report", args: { status: "completed", summary: "report API_KEY='pipeline-known-secret'", evidence: ["src/a.ts"] }, toolCallId: randomUUID(), signal: new AbortController().signal });
            assert.equal(result.ok, true);
            assert.match(result.message, /候选|收口/);
          }
          let outcome = "completed";
          if (text === "report-failed") outcome = "failed";
          if (text === "abort") outcome = "aborted";
          pending.push({ kind: "settled", summary: "done", detail: { outcome } });
          wake?.(); wake = undefined;
        },
        async *events() { while (!done || pending.length) { if (pending.length) { yield pending.shift()!; continue; } await new Promise<void>(resolve => { wake = resolve; }); } },
        async dispose() { done = true; wake?.(); },
      };
    } };
  };
  return { factory, native, get options() { return options; }, get calls() { return calls; } };
}
async function open(p: ProjectConfig, engine: ReturnType<typeof provider>, persistSession = true, governance = false) {
  let handle: RoleSessionHandle;
  const deps = { runtimeOptions: { providerFactories: { codex: engine.factory }, persistSession } };
  if (governance) handle = await openGovernanceSession({ project: p, taskId: "C-target", runtime: "codex", persistSession, autoRepin: false }, deps);
  else handle = await openRoleSession({ roleId: "X", project: p, runtime: "codex", persistSession }, deps);
  const events: OrchestrationEvent[] = [];
  const pump = (async () => { for await (const event of handle.events()) events.push(event); })();
  const reports = () => events.filter((event): event is HandbackEvent => event.kind === "handback");
  return { handle, events, reports, async close() { await handle.dispose(); await pump; } };
}
async function source(p: ProjectConfig) {
  const engine = provider(), session = await open(p, engine);
  await session.handle.send("report", { handback: { required: true } });
  await until(() => session.reports().length === 1);
  const report = session.reports()[0].report;
  assert.ok(report);
  return { engine, session, report };
}
function provenance(report: RuntimeReportSnapshotV1) {
  return { version: 1 as const, kind: "handback" as const, deliveryId: randomUUID(), attemptId: randomUUID(), target: { roleId: "su", runtime: "codex" as const }, reports: [report] };
}

test("actual bound source saves only final outcome; safe report/accepted-memory/unknown task and query keep origin", async () => {
  const p = project(), engine = provider(), session = await open(p, engine);
  try {
    assert.equal(session.handle.persistenceMode, "enabled");
    await session.handle.send("report-failed", { handback: { required: false } });
    await until(() => session.reports().length === 1);
    const event = session.reports()[0];
    assert.equal(event.handback.status, "failed");
    assert.equal(event.report?.origin, "submitted-report");
    assert.equal(event.report?.taskId, null);
    assert.equal(event.reportPersistence?.state, "saved");
    assert.ok(!JSON.stringify({ report: event.report, live: event.liveReport, summary: event.summary }).includes("pipeline-known-secret"));
    const state = await session.handle.getReportPersistence!(event.report!.reportId);
    assert.equal(state.state, "saved");
    const history = await readRoleSessionHistory({ projectRoot: p.projectRoot, roleId: "X", runtime: "codex" });
    assert.equal(history.reports?.[0].status, "failed");
    await session.handle.send("missing", { handback: { required: true } });
    await until(() => session.reports().length === 2);
    assert.equal(session.reports()[1].report?.origin, "terminal-fallback");
    assert.equal(session.reports()[1].report?.status, "unreported");
    assert.equal(engine.calls, 2);
  } finally { await session.close(); fs.rmSync(p.projectRoot, { recursive: true, force: true }); }
});

test("source save failure preserves terminal and snapshot; concurrent save retries run storage once and never prompt", async () => {
  const p = project(), engine = provider(), session = await open(p, engine);
  try {
    let updates = 0;
    const unsubscribe = session.handle.onPersistenceChange!(() => { updates += 1; });
    const save = engine.options.storage!.saveReport!;
    let saves = 0;
    engine.options.storage!.saveReport = async () => { throw Error("disk failure"); };
    await session.handle.send("report", { handback: { required: true } });
    await until(() => session.events.some(event => event.kind === "settled"));
    const event = session.reports()[0];
    assert.equal(event.handback.status, "completed");
    assert.equal(event.reportPersistence?.state, "failed");
    assert.equal(event.reportPersistence?.retryAvailable, true);
    const id = event.report!.reportId;
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    engine.options.storage!.saveReport = async report => { saves += 1; await wait; return save(report); };
    const first = session.handle.retryReportPersistence!(id), second = session.handle.retryReportPersistence!(id);
    release();
    const results = await Promise.all([first, second]);
    assert.ok(results.every(result => result.ok));
    assert.equal(saves, 1); assert.equal(engine.calls, 1); assert.equal(session.reports().length, 1);
    assert.equal(updates, 2);
    unsubscribe();
    assert.equal((await session.handle.getReportPersistence!(id)).state, "saved");
    await session.handle.dispose();
    assert.equal((await session.handle.retryReportPersistence!(id)).ok, false);
    assert.equal((await session.handle.getReportPersistence!(id)).state, "expired");
  } finally { await session.close(); fs.rmSync(p.projectRoot, { recursive: true, force: true }); }
});

test("actual disabled source remains live and creates no store; persistence updates unsubscribe with original handle", async () => {
  const p = project(), engine = provider(), session = await open(p, engine, false);
  try {
    assert.equal(session.handle.persistenceMode, "disabled");
    await session.handle.send("report", { handback: { required: false } });
    await until(() => session.reports().length === 1);
    assert.equal(session.reports()[0].reportPersistence?.state, "disabled");
    assert.equal(session.reports()[0].report, undefined);
    assert.equal(session.reports()[0].liveReport?.source.turnId, session.reports()[0].handback.turnId);
    assert.equal(fs.existsSync(path.join(p.projectRoot, ".ans")), false);
    assert.equal(engine.calls, 1);
    let count = 0;
    const unsubscribe = session.handle.onPersistenceChange!(() => { count += 1; });
    unsubscribe();
    assert.equal(count, 0);
  } finally { await session.close(); fs.rmSync(p.projectRoot, { recursive: true, force: true }); }
});

test("governance target keeps raw SDK input/images but stores safe text; history repair has no second Provider call", async () => {
  const p = project(), seeded = await source(p), engine = provider(), target = await open(p, engine, true, true);
  try {
    assert.equal(target.handle.persistenceMode, "enabled");
    const inputProvenance = provenance(seeded.report);
    const raw = "[回交] API_KEY='pipeline-known-secret' " + "汉".repeat(6000);
    const images = [{ type: "image" as const, data: "aGk=", mimeType: "image/png" }];
    const save = engine.options.storage!.saveSession;
    let fail = true;
    engine.options.storage!.saveSession = async record => { if (fail) throw Error("index"); return save(record); };
    let ack = 0;
    await assert.rejects(target.handle.send(raw, { images, inputProvenance, onTurnStarted: () => { ack += 1; }, handback: { required: false } }), error => error instanceof RuntimeDeliveryError && error.receipt.providerMayHaveStarted);
    assert.equal(ack, 1); assert.equal(engine.calls, 1);
    assert.equal(engine.native[0].text, raw); assert.equal(engine.native[0].opts?.images, images);
    assert.equal(engine.native[0].opts?.inputProvenance, undefined); assert.equal(engine.native[0].opts?.inputPresentation, undefined);
    const failed = await target.handle.getDeliveryReceipt!(inputProvenance.attemptId);
    assert.equal(failed.state, "known");
    if (failed.state === "known") { assert.equal(failed.receipt.history, "failed"); assert.equal(failed.receipt.retryDeliveryAllowed, false); }
    fail = false;
    const repaired = await target.handle.retryDeliveryHistoryPersistence!(inputProvenance.attemptId);
    assert.equal(repaired.ok, true); assert.equal(engine.calls, 1);
    const history = await readRoleSessionHistory({ projectRoot: p.projectRoot, roleId: "su", runtime: "codex" });
    const user = history.entries.find(entry => entry.kind === "user");
    assert.ok(user?.inputTextProjection?.modelInputRecorded === false);
    assert.equal(user.inputTextProjection.redacted, true); assert.equal(user.inputTextProjection.truncated, true);
    assert.ok(!JSON.stringify(history.entries).includes("pipeline-known-secret"));
    assert.ok(Buffer.byteLength(user.text!) <= 16384);
    await assert.rejects(target.handle.send(raw, { inputProvenance }), RuntimeDeliveryError);
    assert.equal(engine.calls, 1);
  } finally { await target.close(); await seeded.session.close(); fs.rmSync(p.projectRoot, { recursive: true, force: true }); }
});

test("target input failure after real ACK and before Provider is preserved without automatic retry", async () => {
  const p = project(), seeded = await source(p), engine = provider(), target = await open(p, engine, true, true);
  try {
    const append = engine.options.storage!.appendReplay;
    engine.options.storage!.appendReplay = async entries => { if (entries.some(entry => entry.kind === "user")) throw Error("user save"); return append(entries); };
    let ack = 0;
    const inputProvenance = provenance(seeded.report);
    await assert.rejects(target.handle.send("[回交] input", { inputProvenance, onTurnStarted: () => { ack += 1; } }), error => error instanceof RuntimeDeliveryError && !error.receipt.providerMayHaveStarted);
    assert.equal(ack, 1); assert.equal(engine.calls, 0);
    assert.equal(target.reports().length, 0);
  } finally { await target.close(); await seeded.session.close(); fs.rmSync(p.projectRoot, { recursive: true, force: true }); }
});

test("A4 native-only pure wrapper keeps reader failure and actual facts protected with trusted custom key names", () => {
  const old = process.env.PIPELINE_HISTORY_FAKE;
  process.env.PIPELINE_HISTORY_FAKE = "history-only-value";
  try {
    const result = projectRoleLegacyHistory({ projectRoot: "/not-a-read-request", roleId: "X", runtime: "pi", readOk: true,
      entries: [{ kind: "user-text", text: "history-only-value" }, { kind: "tool-record", text: "exit 0 is only text", tool: { toolName: "run_shell", phase: "result", target: { kind: "command", value: "echo history-only-value", source: "argument" } } }], source: "history-only-value", error: "history-only-value", skipped: 2 }, { credentialEnvNames: ["PIPELINE_HISTORY_FAKE"] });
    assert.equal(result.ok, true);
    if (result.ok) { assert.equal(result.reader.ok, true); assert.equal(result.reader.skipped, 2); assert.equal(result.entries.length, 2); }
    assert.ok(!JSON.stringify(result).includes("history-only-value"));
    const failed = projectRoleLegacyHistory({ projectRoot: "/not-a-read-request", roleId: "X", runtime: "pi", readOk: false, entries: [], error: "history-only-value", skipped: 0 }, { credentialEnvNames: ["PIPELINE_HISTORY_FAKE"] });
    assert.equal(failed.ok, true);
    if (failed.ok) assert.equal(failed.reader.ok, false);
    assert.ok(!JSON.stringify(failed).includes("history-only-value"));
    assert.equal(projectRoleLegacyHistory({ projectRoot: "", roleId: "X", runtime: "pi", readOk: true, entries: [], skipped: 0 }).ok, false);
  } finally { if (old === undefined) delete process.env.PIPELINE_HISTORY_FAKE; else process.env.PIPELINE_HISTORY_FAKE = old; }
});

test("disabled live target preserves all-or-none optional delivery identity, safe input and no directories", async () => {
  const p = project(), sourceEngine = provider(), sourceSession = await open(p, sourceEngine, false), targetEngine = provider(), target = await open(p, targetEngine, false, true);
  try {
    await sourceSession.handle.send("report", { handback: { required: false } });
    await until(() => sourceSession.reports().length === 1);
    const liveReport = sourceSession.reports()[0].liveReport!;
    const base = { version: 1 as const, kind: "handback-live" as const, durability: "memory-only" as const, reports: [liveReport] };
    await target.handle.send("live legacy", { inputPresentation: base });
    const attemptId = randomUUID();
    const linked = { ...base, deliveryId: randomUUID(), attemptId, target: { roleId: "su", runtime: "codex" as const } };
    await target.handle.send("live linked", { inputPresentation: linked });
    const receipt = await target.handle.getDeliveryReceipt!(attemptId);
    assert.equal(receipt.state, "known");
    if (receipt.state === "known") { assert.equal(receipt.receipt.history, "disabled"); assert.equal(receipt.receipt.inputSaved, false); }
    await assert.rejects(target.handle.send("partial identity", { inputPresentation: { ...base, attemptId: randomUUID() } }));
    assert.equal(targetEngine.calls, 2);
    assert.equal(targetEngine.native[1].opts?.inputPresentation, undefined);
    assert.equal(fs.existsSync(path.join(p.projectRoot, ".ans")), false);
  } finally { await target.close(); await sourceSession.close(); fs.rmSync(p.projectRoot, { recursive: true, force: true }); }
});

test("custom adapter without bound persistence remains unknown-live and exposes only unsupported save proxies", async () => {
  const p = project();
  let submit: import('../../src/model/runtime.ts').ReportHandbackFn | undefined;
  const handle = await openRoleSession({ project: p, roleId: "X" }, { createAdapter: (_gate, caps) => {
    submit = caps?.reportHandback;
    return { async composeContext() { return { systemPrompt: "" }; }, async bindRole() {
      return { async prompt(_text, opts) { opts?.onTurnStarted?.({ turnId: "legacy-turn", roleId: "X", runtime: "codex" }); await submit!({ status: "completed", summary: "known result" }, { turnId: "legacy-turn" }); },
        async *events() { yield { kind: "settled" as const, turnId: "legacy-turn", summary: "done" }; }, async dispose() {} };
    } };
  } });
  try {
    await handle.send("work", { handback: { required: false } });
    const events: OrchestrationEvent[] = [];
    for await (const event of handle.events()) events.push(event);
    const report = events.find((event): event is HandbackEvent => event.kind === "handback")!;
    assert.equal(handle.persistenceMode, "unknown-live");
    assert.equal(report.reportPersistence?.state, "unknown-live");
    assert.equal(report.handback.status, "completed");
    assert.equal(report.report, undefined);
    const retry = await handle.retryReportPersistence!("not-a-durable-report");
    assert.equal(retry.ok, false);
    if (!retry.ok) assert.equal(retry.code, "UNSUPPORTED");
    assert.equal(fs.existsSync(path.join(p.projectRoot, ".ans")), false);
  } finally { await handle.dispose(); fs.rmSync(p.projectRoot, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRuntimeAdapter, readRuntimeSessionHistory } from "../../src/service/runtime/session.ts";
import { getSessionHistory } from "../../app/desktop/runtime-history.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import { RuntimeDeliveryError, type PromptOptions, type RoleSession, type RuntimeInputProvenanceV1, type RuntimeKind, type RuntimeProviderFactory, type SessionEvent } from "../../src/model/runtime.ts";

function resolved(id: string): ResolvedRole {
  return { id, kind: "project", cardText: "# Independent report protocol", boundarySource: "fixture",
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "independent report test" } },
    location: { card: "fixture", boundary: "fixture" } };
}
function externalEngine(afterPrompt?: (roleId: string) => void) {
  const prompts: { roleId: string; text: string; received?: PromptOptions; turnId?: string }[] = [];
  const factory: RuntimeProviderFactory = options => ({
    async composeContext() { return { systemPrompt: "independent controlled engine" }; },
    async bindRole(role) {
      assert.equal(options.toolDisplayMode, "required-v1");
      assert.equal(typeof options.registerToolDisplayProfile, "function");
      options.registerToolDisplayProfile!({ credentials: [] });
      const events: SessionEvent[] = [];
      let closed = false;
      let wake: (() => void) | undefined;
      return {
        runtime: options.runtime, roleId: role.id, contextSource: "fresh",
        async prompt(text, received) {
          prompts.push({ roleId: role.id, text, received, turnId: options.currentTurnId() });
          afterPrompt?.(role.id);
          events.push({ kind: "settled", summary: "controlled completion", detail: { outcome: "completed" } });
          wake?.(); wake = undefined;
        },
        async *events() {
          while (!closed || events.length) {
            if (events.length) yield events.shift()!;
            else await new Promise<void>(resolve => { wake = resolve; });
          }
        },
        async dispose() { closed = true; wake?.(); },
      };
    },
  });
  return { prompts, factory };
}
function drain(session: RoleSession) {
  return (async () => { for await (const _event of session.events()) { /* Independent consumer keeps the actual stream moving. */ } })();
}

for (const runtime of ["pi", "codex", "claude"] as const) {
  test(`independent C ${runtime}: one durable member, safe input history, raw model text, real target receipt and no duplicate prompt`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-report-")));
    const secretKey = "ANS_P1P7_REPORT_" + runtime.toUpperCase();
    const secret = "fake-report-only-" + runtime + "-zYx987";
    const previous = process.env[secretKey]; process.env[secretKey] = secret;
    const engine = externalEngine();
    const sessions: RoleSession[] = [];
    const drains: Promise<void>[] = [];
    const open = async (id: string, persistSession = true) => {
      const session = await createRuntimeAdapter({ runtime, projectRoot: root, skillRoot: root, persistSession,
        extraCredentialEnvVars: [secretKey], providerFactories: { [runtime]: engine.factory },
        gate: () => ({ allowed: false, reason: "no source writes", allowedByRoot: { project: [], skill: [] } }),
      }).bindRole(resolved(id));
      sessions.push(session); drains.push(drain(session)); return session;
    };
    try {
      const source = await open("source");
      let sourceTurn = "";
      await source.prompt("independent source finished without writing project files", { onTurnStarted: metadata => { sourceTurn = metadata.turnId; } });
      assert.ok(source.persistence);
      assert.equal(source.persistence.mode, "enabled");
      const draft = { source: { roleId: "source", runtime, turnId: sourceTurn }, taskId: null,
        origin: "terminal-fallback" as const, status: "unreported" as const,
        summary: "Independent source summary " + secret, evidence: ["controlled protocol evidence"], at: new Date().toISOString() };
      const saved = await source.persistence.recordFinalReport(draft);
      if (!saved.ok) throw new Error(saved.message);
      assert.equal(saved.state, "saved");
      assert.equal(saved.report.summary.redacted, true);
      assert.ok(!saved.report.summary.text.includes(secret));
      const duplicate = await source.persistence.recordFinalReport(draft);
      assert.equal(duplicate.ok, true);
      if (duplicate.ok) { assert.equal(duplicate.state, "already-saved"); assert.equal(duplicate.report.reportId, saved.report.reportId); }
      const reports = path.join(root, ".ans/sessions/source", runtime, "ans/reports");
      assert.deepEqual(fs.readdirSync(reports), [saved.report.reportId + ".json"]);
      assert.ok(!fs.readFileSync(path.join(reports, saved.report.reportId + ".json"), "utf8").includes(secret));

      const target = await open("receiver");
      const provenance: RuntimeInputProvenanceV1 = { version: 1, kind: "handback", deliveryId: randomUUID(), attemptId: randomUUID(),
        target: { roleId: "receiver", runtime }, reports: [saved.report] };
      const modelText = "[回交] actual model input " + secret + "\n" + "🧪".repeat(10000);
      const images = [{ type: "image" as const, mimeType: "image/png", data: "AA==" }];
      let targetTurn = "";
      const promptOptions: PromptOptions = { images, inputProvenance: provenance,
        onTurnStarted: metadata => { targetTurn = metadata.turnId; }, onDeliveryProgress: () => {} };
      await target.prompt(modelText, promptOptions);
      const native = engine.prompts.filter(entry => entry.roleId === "receiver");
      assert.equal(native.length, 1);
      assert.equal(native[0].text, modelText, "a protected history copy must never replace the model's actual input");
      assert.equal(native[0].received?.images, images);
      for (const key of ["inputProvenance", "inputPresentation", "onDeliveryProgress"]) assert.equal(Object.hasOwn(native[0].received ?? {}, key), false);
      assert.ok(targetTurn && targetTurn !== sourceTurn);
      assert.ok(target.persistence);
      const receipt = await target.persistence.getDeliveryReceipt(provenance.attemptId);
      assert.equal(receipt.state, "known");
      if (receipt.state !== "known") throw new Error("actual final receipt was not available");
      assert.equal(receipt.receipt.turnId, targetTurn);
      assert.equal(receipt.receipt.inputSaved, true);
      assert.equal(receipt.receipt.providerMayHaveStarted, true);
      assert.equal(receipt.receipt.history, "saved");
      assert.equal(receipt.receipt.outcome, "completed");
      try { await target.prompt(modelText, promptOptions); }
      catch (error) { assert.ok(error instanceof RuntimeDeliveryError); assert.equal(error.receipt.code, "ATTEMPT_ALREADY_STARTED"); }
      assert.equal(engine.prompts.filter(entry => entry.roleId === "receiver").length, 1, "same attempt cannot invoke the model again");

      const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: "receiver", runtime, credentialEnvNames: [secretKey] });
      const users = history.entries.filter(entry => entry.kind === "user");
      assert.equal(users.length, 1);
      assert.equal(users[0].turnId, targetTurn);
      assert.equal(users[0].inputProvenance?.reports[0].reportId, saved.report.reportId);
      assert.equal(users[0].inputTextProjection?.modelInputRecorded, false);
      assert.equal(users[0].inputTextProjection?.redacted, true);
      assert.equal(users[0].inputTextProjection?.truncated, true);
      assert.ok(Buffer.byteLength(users[0].text ?? "", "utf8") <= 16384);
      assert.ok(!users[0].text?.includes(secret));
      const raw = fs.readFileSync(path.join(root, ".ans/sessions/receiver", runtime, "ans/replay.jsonl"), "utf8");
      assert.ok(!raw.includes(secret), "this fresh C-only replay must not contain the unprotected input text");
      assert.ok(!raw.includes('"AA=="'), "image payload is not duplicated into ANS replay");
      await target.dispose();
      const reopened = await open("receiver");
      assert.ok(reopened.persistence);
      const reread = await reopened.persistence.getDeliveryReceipt(provenance.attemptId);
      assert.equal(reread.state, "known");
      if (reread.state === "known") assert.deepEqual(reread.receipt, receipt.receipt);
      assert.equal(engine.prompts.filter(entry => entry.roleId === "receiver").length, 1, "querying historical receipts is not a model invocation");
      const view = await getSessionHistory({ projectRoot: root, roleId: "receiver", runtime });
      assert.equal(view.error, null);
      assert.equal(view.rows.filter(row => row.kind === "assistant").length, 0, "delivery boundary/receipt records are not assistant replies");
    } finally {
      for (const session of sessions) await session.dispose();
      await Promise.all(drains);
      if (previous === undefined) delete process.env[secretKey]; else process.env[secretKey] = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("independent C: failure after real ACK but before input save invokes no model and cannot repair by prompting", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-ack-failure-")));
  const engine = externalEngine();
  const runtime: RuntimeKind = "pi";
  const adapter = createRuntimeAdapter({ runtime, projectRoot: root, skillRoot: root, persistSession: true,
    providerFactories: { pi: engine.factory }, gate: () => ({ allowed: false, reason: "fixture", allowedByRoot: { project: [], skill: [] } }) });
  const source = await adapter.bindRole(resolved("source")); const sourceDrain = drain(source);
  const target = await adapter.bindRole(resolved("receiver")); const targetDrain = drain(target);
  try {
    let sourceTurn = "";
    await source.prompt("source proof", { onTurnStarted: metadata => { sourceTurn = metadata.turnId; } });
    assert.ok(source.persistence);
    const saved = await source.persistence.recordFinalReport({ source: { roleId: "source", runtime, turnId: sourceTurn }, taskId: null,
      origin: "terminal-fallback", status: "unreported", summary: "independent source", evidence: [], at: new Date().toISOString() });
    assert.ok(saved.ok);
    const provenance: RuntimeInputProvenanceV1 = { version: 1, kind: "handback", deliveryId: randomUUID(), attemptId: randomUUID(), target: { roleId: "receiver", runtime }, reports: [saved.report] };
    let acks = 0;
    await assert.rejects(() => target.prompt("input that must never reach engine", { inputProvenance: provenance,
      onTurnStarted: () => { acks++; fs.mkdirSync(path.join(root, ".ans/sessions/receiver/pi/ans/replay.jsonl"), { recursive: true }); },
    }), error => {
      assert.ok(error instanceof RuntimeDeliveryError);
      assert.equal(error.receipt.providerMayHaveStarted, false);
      assert.equal(error.receipt.inputSaved, false);
      return true;
    });
    assert.equal(acks, 1);
    assert.equal(engine.prompts.filter(entry => entry.roleId === "receiver").length, 0);
    assert.ok(target.persistence);
    const retry = await target.persistence.retryDeliveryHistoryPersistence(provenance.attemptId);
    assert.equal(retry.ok, false);
    assert.equal(engine.prompts.filter(entry => entry.roleId === "receiver").length, 0);
  } finally { await source.dispose(); await target.dispose(); await sourceDrain; await targetDrain; fs.rmSync(root, { recursive: true, force: true }); }
});

test("independent C: history failure after a real model call cannot turn storage retry into another prompt", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-after-provider-")));
  const replay = path.join(root, ".ans/sessions/receiver/pi/ans/replay.jsonl");
  const engine = externalEngine(roleId => {
    if (roleId !== "receiver") return;
    fs.renameSync(replay, replay + ".before-fault");
    fs.mkdirSync(replay);
  });
  const adapter = createRuntimeAdapter({ runtime: "pi", projectRoot: root, skillRoot: root, persistSession: true,
    providerFactories: { pi: engine.factory }, gate: () => ({ allowed: false, reason: "fixture", allowedByRoot: { project: [], skill: [] } }) });
  const source = await adapter.bindRole(resolved("source")); const sourceDrain = drain(source);
  const target = await adapter.bindRole(resolved("receiver")); const targetDrain = drain(target);
  try {
    let sourceTurn = "";
    await source.prompt("source proof", { onTurnStarted: metadata => { sourceTurn = metadata.turnId; } });
    assert.ok(source.persistence);
    const saved = await source.persistence.recordFinalReport({ source: { roleId: "source", runtime: "pi", turnId: sourceTurn }, taskId: null,
      origin: "terminal-fallback", status: "unreported", summary: "independent completed source", evidence: [], at: new Date().toISOString() });
    assert.ok(saved.ok);
    const provenance: RuntimeInputProvenanceV1 = { version: 1, kind: "handback", deliveryId: randomUUID(), attemptId: randomUUID(), target: { roleId: "receiver", runtime: "pi" }, reports: [saved.report] };
    await assert.rejects(() => target.prompt("exactly one actual native call", { inputProvenance: provenance }), error => {
      assert.ok(error instanceof RuntimeDeliveryError);
      assert.equal(error.receipt.providerMayHaveStarted, true);
      assert.equal(error.receipt.outcome, "completed", "storage failure must not rewrite the completed model outcome");
      assert.equal(error.receipt.history, "failed");
      assert.equal(error.receipt.retryDeliveryAllowed, false);
      return true;
    });
    assert.equal(engine.prompts.filter(entry => entry.roleId === "receiver").length, 1);
    assert.ok(target.persistence);
    const retry = await target.persistence.retryDeliveryHistoryPersistence(provenance.attemptId);
    assert.equal(retry.ok, false);
    if (!retry.ok) assert.equal(retry.code, "REPLAY_DAMAGED");
    assert.equal(engine.prompts.filter(entry => entry.roleId === "receiver").length, 1);
    await assert.rejects(() => target.prompt("exactly one actual native call", { inputProvenance: provenance }), error => {
      assert.ok(error instanceof RuntimeDeliveryError);
      assert.equal(error.receipt.providerMayHaveStarted, true);
      assert.equal(error.receipt.retryDeliveryAllowed, false);
      return true;
    });
    assert.equal(engine.prompts.filter(entry => entry.roleId === "receiver").length, 1);
  } finally { await source.dispose(); await target.dispose(); await sourceDrain; await targetDrain; fs.rmSync(root, { recursive: true, force: true }); }
});

test("independent C: an injected report storage failure retries the frozen member once without rerunning its model", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-report-retry-")));
  const engine = externalEngine();
  let storeCalls = 0;
  let realStoreCalls = 0;
  const factory: RuntimeProviderFactory = options => {
    assert.ok(options.storage?.saveReport);
    const storage = options.storage;
    const save = storage.saveReport!.bind(storage);
    storage.saveReport = async report => {
      storeCalls++;
      if (storeCalls === 1) throw new Error("independent injected report-write failure");
      realStoreCalls++;
      return save(report);
    };
    return engine.factory(options);
  };
  const source = await createRuntimeAdapter({ runtime: "pi", projectRoot: root, skillRoot: root, persistSession: true,
    providerFactories: { pi: factory }, gate: () => ({ allowed: false, reason: "fixture", allowedByRoot: { project: [], skill: [] } }) }).bindRole(resolved("source"));
  const drained = drain(source);
  try {
    let turnId = "";
    await source.prompt("source model completes only once", { onTurnStarted: metadata => { turnId = metadata.turnId; } });
    assert.ok(source.persistence);
    const failed = await source.persistence.recordFinalReport({ source: { roleId: "source", runtime: "pi", turnId }, taskId: null,
      origin: "terminal-fallback", status: "unreported", summary: "freeze this exact source member", evidence: ["independent proof"], at: new Date().toISOString() });
    if (failed.ok) assert.fail("injected provider failure must not be reported as a successful save");
    assert.equal(failed.state, "failed");
    assert.equal(failed.code, "PERSIST_FAILED");
    assert.equal(failed.retryAvailable, true);
    assert.ok(failed.reportId && failed.report);
    const frozen = structuredClone(failed.report);
    const results = await Promise.all([source.persistence.retryReportPersistence(failed.reportId), source.persistence.retryReportPersistence(failed.reportId)]);
    for (const result of results) { if (!result.ok) assert.fail(result.message); assert.deepEqual(result.report, frozen); }
    assert.equal(storeCalls, 2, "one failed attempt and one shared retry must not become duplicate storage requests");
    assert.equal(realStoreCalls, 1);
    assert.equal(engine.prompts.length, 1, "saving a report must never prompt the source again");
    const queried = await source.persistence.getReportPersistence(failed.reportId);
    assert.equal(queried.state, "saved");
    const again = await source.persistence.retryReportPersistence(failed.reportId);
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.state, "already-saved");
    assert.equal(storeCalls, 2);
    const reportDir = path.join(root, ".ans/sessions/source/pi/ans/reports");
    assert.deepEqual(fs.readdirSync(reportDir), [failed.reportId + ".json"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(reportDir, failed.reportId + ".json"), "utf8")), frozen);
  } finally { await source.dispose(); await drained; fs.rmSync(root, { recursive: true, force: true }); }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SessionManager, type SessionEventEnvelope, type PersistenceUpdated } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeProviderFactory, SessionEvent } from "../../src/model/runtime.ts";

async function observed(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > end) throw new Error("independent Window provenance observation expired");
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

for (const { failFirstSave, failTargetTail } of [
  { failFirstSave: true, failTargetTail: false },
  { failFirstSave: false, failTargetTail: false },
  { failFirstSave: false, failTargetTail: true },
]) {
test(`independent C Window: ${failFirstSave ? "failed source save and concurrent recovery" : failTargetTail ? "failed target receipt and history-only recovery" : "initial source save and its notification"} continue one original delivery without source replay or raw IPC`, async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-window-report-")));
  const dir = path.join(root, "角色卡/A");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# Independent source A\n");
  fs.writeFileSync(path.join(dir, "boundary.yaml"), "role: A\nentries:\n  - kind: directory\n    path: docs/A/\n    purpose: independent test\n");
  const listing = await listProject(root);
  const credentialName = "ANS_P1P7_WINDOW_PROVENANCE";
  const secret = "fake-window-report-only-xYz987";
  const previous = process.env[credentialName]; process.env[credentialName] = secret;
  const inputs: { roleId: string; text: string }[] = [];
  const envelopes: SessionEventEnvelope[] = [];
  const roleStates: unknown[] = [];
  const notifications: PersistenceUpdated[] = [];
  let saveCalls = 0;
  let realWrites = 0;
  let targetTailFailures = 0;
  const factory: RuntimeProviderFactory = options => ({
    async composeContext() { return { systemPrompt: "independent controlled external engine" }; },
    async bindRole(role) {
      options.registerToolDisplayProfile!({ credentials: [] });
      if (role.id === "A") {
        assert.ok(options.storage?.saveReport);
        const save = options.storage.saveReport.bind(options.storage);
        options.storage.saveReport = async report => {
          saveCalls++;
          if (failFirstSave && saveCalls === 1) throw new Error("independent initial report storage failure");
          realWrites++; return save(report);
        };
      }
      if (role.id === "su" && failTargetTail) {
        assert.ok(options.storage);
        const append = options.storage.appendReplay.bind(options.storage);
        options.storage.appendReplay = async entries => {
          if (targetTailFailures === 0 && entries.some(entry => (entry.event?.detail as { source?: string } | undefined)?.source === "delivery-receipt")) {
            targetTailFailures++; throw new Error("independent missing target receipt before append");
          }
          return append(entries);
        };
      }
      const events: SessionEvent[] = [];
      let closed = false;
      let wake: (() => void) | undefined;
      return { runtime: "pi", roleId: role.id, contextSource: "fresh",
        async prompt(text, promptOptions) {
          inputs.push({ roleId: role.id, text });
          for (const key of ["inputProvenance", "inputPresentation", "onDeliveryProgress"]) assert.equal(Object.hasOwn(promptOptions ?? {}, key), false);
          const name = role.id === "su" ? "dispatch_task" : "submit_report";
          if (role.id !== "su" || text === "dispatch independent source once") {
            const tool = options.tools.find(item => item.name === name); assert.ok(tool);
            const result = await tool.handler({ name, toolCallId: options.currentTurnId() + ":" + name,
              args: role.id === "su" ? { roleId: "A", task: "independent formal source report" }
                : { status: "completed", summary: "independent source result " + secret, evidence: ["read-only protocol proof"] } });
            assert.equal(result.ok, true);
          }
          events.push({ kind: "settled", turnId: options.currentTurnId(), summary: "actual controlled completion", detail: { outcome: "completed" } });
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
  const manager = new SessionManager({
    openRoleSession: input => openRoleSession({ ...input, autoRepin: false, persistSession: true }, {
      runtimeOptions: { persistSession: true, providerFactories: { pi: factory }, extraCredentialEnvVars: [credentialName] },
    }),
    createPiAdapterFactory: () => () => { throw new Error("unused external factory"); },
    createDemoAdapter: () => { throw new Error("unused demo"); },
    buildProjectConfig, getListing: projectRoot => projectRoot === root ? listing : undefined,
    emitEvent: envelope => envelopes.push(envelope), emitRoleState: state => roleStates.push(state),
    emitPersistenceChange: notification => notifications.push(notification),
  });
  const source = { projectRoot: root, roleId: "A", runtime: "pi" as const };
  const target = { projectRoot: root, roleId: "su", runtime: "pi" as const };
  try {
    assert.equal((await manager.open(source)).ok, true);
    assert.equal((await manager.open(target)).ok, true);
    assert.equal((await manager.send("dispatch independent source once", undefined, target)).ok, true);
    await observed(() => envelopes.some(row => row.roleId === "A" && row.event.kind === "handback"));
    const event = envelopes.find(row => row.roleId === "A" && row.event.kind === "handback")!.event;
    if (event.kind !== "handback") assert.fail("source handback not observed");
    assert.equal(Object.hasOwn(event, "handback"), false);
    assert.equal(event.reportPersistence?.state, failFirstSave ? "failed" : "saved");
    assert.ok(event.reportPersistence.reportId);
    const id = event.reportPersistence.reportId;
    assert.equal(inputs.filter(input => input.roleId === "A").length, 1);
    if (failFirstSave) assert.equal(inputs.filter(input => input.roleId === "su").length, 1, "failed enabled source save must hold original handback");
    const initial = await manager.persistenceOperation(source, "getReportSaveState", id);
    assert.equal(initial.ok, true);
    if (initial.ok) assert.equal(initial.value.state, failFirstSave ? "failed" : "saved");
    assert.equal(saveCalls, 1, "query must not try to save");
    const results = await Promise.all([
      manager.persistenceOperation(source, "retryReportSave", id), manager.persistenceOperation(source, "retryReportSave", id),
    ]);
    for (const result of results) { if (!result.ok) assert.fail(result.message); assert.equal(result.value.ok, true); }
    await observed(() => inputs.filter(input => input.roleId === "su").length === 2);
    const targetReplay = path.join(root, ".ans/sessions/su/pi/ans/replay.jsonl");
    if (failTargetTail) {
      await observed(() => notifications.some(update => update.scope.roleId === "su" && update.change.kind === "delivery-history-save" && update.change.state === "failed"));
      const failed = notifications.find(update => update.scope.roleId === "su" && update.change.kind === "delivery-history-save" && update.change.state === "failed")!.change;
      if (failed.kind !== "delivery-history-save") assert.fail("target failure notification unavailable");
      assert.equal(failed.receipt?.providerMayHaveStarted, true);
      assert.equal(failed.receipt?.outcome, "completed");
      assert.equal(failed.receipt?.retryHistoryAvailable, true);
      const query = await manager.persistenceOperation(target, "getDeliveryReceipt", failed.attemptId);
      assert.equal(query.ok, true);
      if (query.ok && query.value.state === "known") assert.equal(query.value.receipt.history, "failed");
      const restored = await Promise.all([
        manager.persistenceOperation(target, "retryDeliveryHistorySave", failed.attemptId),
        manager.persistenceOperation(target, "retryDeliveryHistorySave", failed.attemptId),
      ]);
      for (const result of restored) {
        if (!result.ok) assert.fail(result.message);
        assert.equal(result.value.ok, true);
        assert.equal(result.value.receipt?.outcome, "completed");
        assert.equal(result.value.receipt?.history, "saved");
      }
      assert.equal(targetTailFailures, 1);
      assert.equal(inputs.filter(input => input.roleId === "su").length, 2, "target history retry must never invoke the model again");
    }
    await observed(() => fs.existsSync(targetReplay) && fs.readFileSync(targetReplay, "utf8").includes('"delivery-receipt"'));
    assert.equal(saveCalls, failFirstSave ? 2 : 1);
    assert.equal(realWrites, 1, "concurrent IPC retry and source notification share one real save");
    assert.equal(inputs.filter(input => input.roleId === "A").length, 1, "saving never replays the source model or tools");
    assert.equal(inputs.filter(input => input.roleId === "su").length, 2, "one ordinary dispatch input and exactly one original handback");
    assert.ok(inputs.filter(input => input.roleId === "su")[1].text.includes(secret), "the actual model retains the original trusted handback text");
    const again = await manager.persistenceOperation(source, "retryReportSave", id);
    assert.equal(again.ok, true);
    assert.equal(saveCalls, failFirstSave ? 2 : 1);
    assert.equal(inputs.filter(input => input.roleId === "su").length, 2);
    for (const transport of [envelopes, roleStates, notifications]) assert.ok(!JSON.stringify(transport).includes(secret), "all Window event/queue/full-state/notification transports use the protected copy");
    assert.deepEqual(fs.readdirSync(path.join(root, ".ans/sessions/A/pi/ans/reports")), [id + ".json"]);
    await manager.stop();
    const expired = await manager.persistenceOperation(source, "retryReportSave", id);
    assert.equal(expired.ok, false);
    assert.equal(inputs.filter(input => input.roleId === "su").length, 2);
  } finally {
    await manager.stop();
    if (previous === undefined) delete process.env[credentialName]; else process.env[credentialName] = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { createCustomerInputChannel, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { DesktopDurableWorkflow } from "../../app/desktop/durable-workflow.ts";
import { WorkflowChiefStart, WORKFLOW_START_OPTION_IDS } from "../../app/desktop/workflow-chief-start.ts";
import type { LiveSession } from "../../app/desktop/session/contracts/session-types.ts";
import type { DurableResult } from "../../src/model/durable-workflow.ts";

function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result.value;
}

async function until<T>(predicate: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 125; attempt++) {
    const value = predicate();
    if (value !== undefined) return value;
    await setTimeout(20);
  }
  assert.fail("Timed out waiting for the application card.");
}

test("startup proposals bind the acknowledged original customer input and require the application card", async t => {
  const temporary = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(temporary, "ans-workflow-chief-start-"));
  const projectRoot = path.join(directory, "project");
  await fs.mkdir(projectRoot);
  const durable = new DesktopDurableWorkflow({ userDataRoot: path.join(directory, "data"),
    resourceRoot: directory, presetRoot: path.join(import.meta.dirname, "../..") });
  const presented: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ operatorId: "operator", presenter: payload => presented.push(payload) });
  let selectionId = "selection-1";
  let turnIsActive = true;
  const start = new WorkflowChiefStart({ durable, customer: channel.customerInput,
    selection: requested => requested === projectRoot ? { projectRoot, selectionId } : undefined,
    hasActiveTurn: () => turnIsActive, hasActiveRun: async () => false,
    hasPendingCard: root => channel.hasPendingProjectCard(root),
  });
  t.after(async () => {
    start.select();
    channel.rejectAllPending("test closed");
    await durable.close();
    assert.equal(path.dirname(directory), temporary);
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  start.select(projectRoot);
  assert.deepEqual(await start.list(projectRoot), []);
  const choice = unwrap(await durable.validateDefinition(projectRoot, "path-a", { source: "preset" }));
  assert.ok(choice.digest);
  const issue = { definitionId: choice.id, source: "preset" as const, expectedDigest: choice.digest, reason: "Full new-product governance" };
  const original = "The customer wants an entirely new example.\nThey need explicit governance.";
  assert.equal(start.issueInput(projectRoot, original), undefined);
  const grant = start.issueInput(projectRoot, original, () => true);
  const second = start.issueInput(projectRoot, original, () => true);
  assert.ok(grant && second && grant.inputId !== second.inputId);
  let live = {
    roleId: "chief", projectRoot, runtime: "pi", busy: true,
    origins: { running: { kind: "message", turnId: "turn-ack", workflowInput: { ...grant }, workflowInputAck: "turn-ack", settled: false } },
    interactionState: { lifetime: new AbortController(), turn: new AbortController() },
  } as unknown as LiveSession;
  const propose = start.requestForSession(projectRoot, "chief", undefined, () => live);
  assert.ok(propose);
  assert.equal(start.requestForSession(projectRoot, "convener", undefined, () => live), undefined);
  assert.equal(start.requestForSession(projectRoot, "chief", "assigned-task", () => live), undefined);
  assert.equal((await propose(issue)).ok, false);
  const origin = live.origins.running!;
  origin.workflowInput = grant;
  origin.workflowInputAck = undefined;
  assert.equal((await propose(issue)).ok, false);
  origin.workflowInputAck = "foreign-ack";
  assert.equal((await propose(issue)).ok, false);
  origin.workflowInputAck = origin.turnId;
  origin.kind = "system";
  assert.equal((await propose(issue)).ok, false);
  origin.kind = "message";
  const first = unwrap(await propose(issue));
  assert.equal(unwrap(await propose(issue)).activationId, first.activationId);
  assert.equal((await propose({ ...issue, reason: "Conflicting recommendation" })).ok, false);

  const card = await until(() => presented.find(item => item.request.cardKind === "workflow-start"));
  assert.equal(card.request.application, true);
  assert.equal(card.request.sourceRoleId, "application");
  assert.deepEqual(card.request.kind === "choice" ? card.request.options.map(option => option.id) : [], WORKFLOW_START_OPTION_IDS);
  const store = await durable.store();
  const proposals = await store.listWorkflowStartProposals(projectRoot);
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0]?.requirement, { inputId: grant.inputId, turnId: "turn-ack", text: original, digest: grant.digest, runtime: "pi" });
  assert.equal(await store.projection(projectRoot), undefined);
  const approve = { id: card.id, decision: { kind: "choice", selected: [WORKFLOW_START_OPTION_IDS[0]] } };
  assert.equal(channel.respond(approve).ok, false);
  assert.equal((await channel.respondDurable(approve))?.ok, false);
  let frameChecks = 0;
  assert.equal((await channel.respondDurable(approve, () => { frameChecks++; return true; }))?.ok, true);
  assert.ok(frameChecks >= 2);
  assert.equal((await store.listWorkflowStartProposals(projectRoot))[0]?.state, "approved");
  assert.equal(await store.projection(projectRoot), undefined);
  assert.equal((await channel.respondDurable({ id: card.id, decision: { kind: "choice", selected: [WORKFLOW_START_OPTION_IDS[1]] } }, () => true))?.ok, false);
  selectionId = "replacement";
  start.select(projectRoot);
  live = { ...live, busy: false };
  assert.equal((await propose(issue)).ok, false);
  assert.equal((await channel.respondDurable(approve, () => true))?.ok, false);
  turnIsActive = false;
  start.select();
});

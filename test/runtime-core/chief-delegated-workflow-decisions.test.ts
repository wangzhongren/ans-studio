import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOVERNANCE_APP_OWNED_CARD_KINDS, governanceCardGroup, isChiefDecisionExecutionContext,
  type ChiefDecisionExecutionContext, type DecidePendingRequestFn, type DecidePendingRequestInput,
  type CustomerInputOutcome,
  type DurableChiefDecisionCardKind, type DurableChiefPendingDecisionRequest,
  type RuntimeProviderOptions,
} from "../../src/model/runtime.ts";
import { buildChiefDecisionTools, buildGovernedTools, createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { allow, neutralProjectRoot, role } from "./fixtures.ts";

const kinds: readonly DurableChiefDecisionCardKind[] = [
  "intent-confirm", "proposal", "appointment", "workflow-start", "document-revision", "merge-main", "workflow-blocked-scope",
];
const chief = { ...role("chief"), kind: "built-in-governance" as const, governanceFunction: "chief" as const };

function contextFor(cardKind: DurableChiefDecisionCardKind): ChiefDecisionExecutionContext & { request: DurableChiefPendingDecisionRequest } {
  return {
    roleId: "chief", executionId: "bounded-decision-1", mode: "bounded-decision",
    productionWriteAuthority: false, tools: ["decide_pending_request"],
    limits: { maxTurns: 1, timeoutMs: 5000, maxAttempts: 1 },
    request: {
      requestId: `card:${cardKind}:2`, baseDigest: "a".repeat(64), delegationRevision: 3,
      originRoleId: "application", cardKind, durableWorkflow: { generation: 2, multiple: cardKind === "appointment" },
      question: "Choose an option for the current workflow card",
      options: [{ id: "first", label: "First option" }, { id: "second", label: "Second option" }],
      evidenceRefs: [{ snapshotId: "verified-materials", path: "docs/materials.md", version: 1, sha256: "b".repeat(64) }],
    },
  };
}

function choice(context: ChiefDecisionExecutionContext, selected = ["second"]): DecidePendingRequestInput {
  const { requestId, baseDigest, delegationRevision } = context.request;
  return { requestId, baseDigest, delegationRevision, disposition: "select", selected, reason: "The materials support the selection." };
}

function settle(context: ChiefDecisionExecutionContext, record: (input: DecidePendingRequestInput) => void): DecidePendingRequestFn {
  return async input => {
    record(input);
    return { ok: true, requestId: input.requestId, status: "settled", source: {
      kind: "chief-delegated", actorRoleId: "chief", originRoleId: context.request.originRoleId,
      ...input, at: "2026-11-18T00:00:00.000Z",
    } };
  };
}

test("durable decision kinds require the app binding and verified evidence reference shapes", () => {
  for (const cardKind of kinds) {
    const context = contextFor(cardKind);
    const replacing = (request: Record<string, unknown>) => isChiefDecisionExecutionContext({ ...context, request: { ...context.request, ...request } });
    assert.equal(isChiefDecisionExecutionContext(context), true, cardKind);
    assert.equal(replacing({ durableWorkflow: { generation: 0, multiple: false } }), false, cardKind);
    assert.equal(replacing({ durableWorkflow: { generation: 2 } }), false, cardKind);
    assert.equal(replacing({ evidenceRefs: [] }), false, cardKind);
    assert.equal(replacing({ evidenceRefs: Array(1) }), false, cardKind);
    assert.equal(replacing({ evidenceRefs: [{ ...context.request.evidenceRefs[0], sha256: "unverified" }] }), false, cardKind);
    assert.equal(replacing({ baseDigest: "bad-digest" }), false, cardKind);
    assert.equal(replacing({ delegationRevision: -1 }), false, cardKind);
    assert.equal(replacing({ cardKind: "stable-write" }), false, cardKind);
    assert.equal(replacing({ cardKind: "acceptance" }), false, cardKind);
    assert.equal(replacing({ cardKind: "appointment-write" }), false, cardKind);
    assert.equal(replacing({ cardKind: "download" }), false, cardKind);
    const unbound = replacing({ durableWorkflow: undefined });
    assert.equal(unbound, cardKind === "proposal" || cardKind === "appointment", cardKind);
  }
  const context = contextFor("merge-main");
  assert.equal(isChiefDecisionExecutionContext({ ...context, productionWriteAuthority: true }), false);
  assert.equal(isChiefDecisionExecutionContext({ ...context, tools: ["decide_pending_request", "run_shell"] }), false);
  assert.equal(isChiefDecisionExecutionContext({ ...context, request: { ...context.request, durableWorkflow: { generation: 2, multiple: true } } }), false);
});

test("the blocked-scope card only settles through the app-bound chief decision tool", async () => {
  const kind = "workflow-blocked-scope";
  assert.ok(GOVERNANCE_APP_OWNED_CARD_KINDS.includes(kind));
  assert.equal(governanceCardGroup(kind), undefined);
  const context = contextFor(kind);
  const options = [{ id: "wait", label: "等待原条件" }, { id: "seek-revision", label: "申请原授权修订" }];
  context.request.options = options;
  let issued = 0;
  const regular = buildGovernedTools(allow, {
    durableFixedWorkflow: true, roleId: "chief",
    customerInput: async () => { issued++; return { outcome: "answered", value: { selected: ["wait"] } }; },
  });
  const caller = regular.find(tool => tool.name === "request_choice")!;
  const denied = await caller.handler({ name: caller.name, args: { title: "当前阻塞", flowId: "fixture", cardKind: kind, options } });
  assert.equal(denied.ok, false);
  assert.equal(issued, 0);
  const accepted: DecidePendingRequestInput[] = [];
  const [tool] = buildChiefDecisionTools(settle(context, input => accepted.push(input)), context);
  assert.match(tool!.description, /原工作流/);
  assert.equal((await tool!.handler({ name: tool!.name, args: choice(context, ["stop-unoffered"]) })).ok, false);
  assert.equal((await tool!.handler({ name: tool!.name, args: choice(context, ["seek-revision"]) })).ok, true);
  assert.deepEqual(accepted, [choice(context, ["seek-revision"])]);
});

test("R10-L the durable tool checks current identifiers, actual single or multiple options, and one attempt", async () => {
  for (const cardKind of kinds) {
    const context = contextFor(cardKind);
    const seen: DecidePendingRequestInput[] = [];
    const tools = buildChiefDecisionTools(settle(context, input => seen.push(input)), context);
    assert.deepEqual(tools.map(tool => tool.name), ["decide_pending_request"]);
    const tool = tools[0]!;
    const args = choice(context);
    const invoke = (input: Record<string, unknown>) => tool.handler({ name: tool.name, args: input });
    for (const invalid of [
      { requestId: "different-card" }, { baseDigest: "f".repeat(64) }, { delegationRevision: 4 },
      { selected: ["not-offered"] }, { selected: ["first", "first"] }, { selected: [] }, { disposition: "reject", selected: undefined },
      { disposition: "revise", selected: undefined }, { reason: " " }, { source: "customer" },
      ...(cardKind === "appointment" ? [] : [{ selected: ["first", "second"] }]),
    ]) assert.equal((await invoke({ ...args, ...invalid })).ok, false, `${cardKind}: ${JSON.stringify(invalid)}`);
    assert.equal(seen.length, 0);
    const selected = cardKind === "appointment" ? ["first", "second"] : ["second"];
    const exact = { ...args, selected };
    assert.equal((await invoke(exact)).ok, true, cardKind);
    assert.match((await invoke(exact)).message, /budget exhausted/, cardKind);
    assert.deepEqual(seen, [exact], cardKind);
  }
});

test("A6 accepts only the exact concrete profiles offered on the current bounded approval card", async () => {
  const context = contextFor("proposal");
  const profile = "choice-" + "c".repeat(24);
  context.request.options = [
    { id: profile, label: "Desktop browser · 3 laps" },
    { id: "revise", label: "Revise the proposal" },
    { id: "reject", label: "Reject" },
  ];
  const seen: DecidePendingRequestInput[] = [];
  const [tool] = buildChiefDecisionTools(settle(context, input => seen.push(input)), context);
  const exact = choice(context, [profile]);
  for (const invalid of [
    { ...exact, decisionValues: { laps: 5 } },
    { ...exact, selected: ["accept"] },
    { ...exact, selected: ["choice-" + "d".repeat(24)] },
    { ...exact, baseDigest: "d".repeat(64) },
  ]) assert.equal((await tool!.handler({ name: tool!.name, args: invalid })).ok, false);
  assert.equal(seen.length, 0);
  const receipt = await tool!.handler({ name: tool!.name, args: exact });
  assert.equal(receipt.ok, true);
  assert.match(receipt.message, new RegExp(profile));
  assert.deepEqual(seen, [exact]);
});

test("the initiating A6 choice receives only the bound host projection and preserves actual delegated provenance", async () => {
  const requestId = "a6-current-card";
  const baseDigest = "a".repeat(64);
  const profile = "choice-" + "b".repeat(32);
  const proof = { requestId, baseDigest, selectedOptionId: profile, decisionValues: { platform: "desktop-browser", laps: 3 } };
  const answer: Extract<CustomerInputOutcome, { outcome: "answered" }> = {
    outcome: "answered", operatorId: "chief", value: { selected: ["accept"] },
    decisionId: `decision-${requestId}`, durableProposalSelection: proof,
    actionSource: { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "chief", requestId, baseDigest,
      delegationRevision: 3, disposition: "select", selected: [profile], reason: "Selected current proposal.", at: "2026-11-19T00:00:00.000Z" },
  };
  const args = { title: "确认方案", flowId: "race", cardKind: "proposal", options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }] };
  let presentations = 0;
  const invoke = (outcome: CustomerInputOutcome, overrides?: Record<string, unknown>, fixed = true) => {
    const tool = buildGovernedTools(allow, {
      durableFixedWorkflow: fixed, roleId: "chief",
      customerInput: async () => { presentations++; return outcome; },
    }).find(entry => entry.name === "request_choice")!;
    return tool.handler({ name: tool.name, args: { ...args, ...overrides } });
  };
  const accepted = await invoke(answer);
  assert.equal(accepted.ok, true, accepted.message);
  assert.match(accepted.message, /chief-delegated/);
  assert.match(accepted.message, new RegExp(profile));
  assert.match(accepted.message, /"laps":3/);
  const manual = await invoke({ ...answer, operatorId: "customer", actionSource: undefined });
  assert.equal(manual.ok, true, manual.message);
  assert.match(manual.message, /"laps":3/);
  assert.doesNotMatch(manual.message, /chief-delegated/);

  for (const invalid of [
    { ...answer, decisionId: "different-receipt" },
    { ...answer, value: { selected: [profile] } },
    { ...answer, durableProposalSelection: { ...proof, baseDigest: "c".repeat(64) } },
    { ...answer, durableProposalSelection: { ...proof, selectedOptionId: "choice-" + "c".repeat(32) } },
    { ...answer, actionSource: { ...answer.actionSource!, originRoleId: "convener" } } as CustomerInputOutcome,
    { ...answer, actionSource: undefined },
    { ...answer, durableProposalSelection: undefined },
  ]) assert.equal((await invoke(invalid)).ok, false);
  assert.equal((await invoke(answer, { cardKind: "intent-confirm" })).ok, false);
  assert.equal((await invoke(answer, undefined, false)).ok, false);
  const beforeForgery = presentations;
  assert.equal((await invoke(answer, { durableProposalSelection: proof })).ok, false);
  assert.equal(presentations, beforeForgery);
});

test("R10-L provider factories for Claude, Pi and Codex use the same bounded tool assembly", async t => {
  const project = await neutralProjectRoot();
  t.after(project.cleanup);
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const context = contextFor("workflow-start");
    const args = choice(context);
    const seen: DecidePendingRequestInput[] = [];
    const adapter = createRuntimeAdapter({
      runtime, gate: allow, projectRoot: project.root, skillRoot: project.root,
      chiefDecisionContext: context, decidePendingRequest: settle(context, input => seen.push(input)),
      providerFactories: { [runtime]: (options: RuntimeProviderOptions) => {
        assert.deepEqual(options.chiefDecisionContext, context);
        assert.equal(options.judgeMode, true);
        assert.equal(options.storage, undefined);
        assert.deepEqual(options.installedMcpServers, []);
        assert.deepEqual(options.tools.map(tool => tool.name), ["decide_pending_request"]);
        return createDemoRuntimeAdapter(options, [{ name: "decide_pending_request", args }]);
      } },
    });
    const session = await adapter.bindRole(chief);
    try { await session.prompt("Use the evidence for the current card."); }
    finally { await session.dispose(); }
    assert.deepEqual(seen, [args], runtime);
  }
});

for (const runtime of ["claude", "pi", "codex"] as const) {
  test(`R10-L default ${runtime} adapter binds only the durable decision tool`, async t => {
    const project = await neutralProjectRoot();
    t.after(project.cleanup);
    const env = { ANS_CODEX_WIRE_API: "chat", ANS_R10_LOCAL_KEY: "local-fixture-no-model-called" };
    const previous = Object.keys(env).map(key => [key, process.env[key]] as const);
    Object.assign(process.env, env);
    try {
      const context = contextFor("merge-main");
      const adapter = createRuntimeAdapter({
        runtime, gate: allow, projectRoot: project.root, skillRoot: project.root,
        baseUrl: "http://127.0.0.1:9/v1", modelId: "r10-context-only", apiKeyEnvVar: "ANS_R10_LOCAL_KEY",
        chiefDecisionContext: context, decidePendingRequest: settle(context, () => assert.fail("No model turn in this test")),
      });
      const session = await adapter.bindRole(chief);
      try {
        const surface = session.inspectToolSurface!();
        assert.equal(surface.factoryProvenance, "default-production");
        assert.deepEqual(surface.appTools, ["decide_pending_request"]);
        assert.deepEqual(surface.configuredForeignMcpServers, []);
      } finally { await session.dispose(); }
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
}

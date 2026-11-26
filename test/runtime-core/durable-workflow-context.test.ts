import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { CustomerInputOutcome, GovernedToolsOptions, ImplementationSelfTestObservation, RuntimeProviderFactory, RuntimeProviderOptions, ToolDefinition } from "../../src/model/runtime.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { buildGovernedTools, createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { allow, neutralProjectRoot, registerControlledDisplayProfile, role } from "./fixtures.ts";

function schemaWithoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaWithoutDescriptions);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "description")
    .map(([key, child]) => [key, schemaWithoutDescriptions(child)]));
}

function toolText(tool: ToolDefinition): string {
  return [tool.description, ...(tool.promptGuidelines ?? [])].join("\n");
}

test("A11 self-test observer receives the approved live foreground process and actual write audit", async t => {
  const project = await neutralProjectRoot();
  t.after(project.cleanup);
  const captured: ImplementationSelfTestObservation[] = [];
  const offered = Promise.withResolvers<void>();
  const saved = Promise.withResolvers<void>();
  const approved: string[][] = [];
  const options = {
    durableFixedWorkflow: true, shellCwd: project.root, roleId: "fixture-developer", currentTurnId: () => "actual-a11-turn",
    shellGate: async request => { approved.push(request.argv); return { allow: true, by: "fixture-operator" }; },
    shellPostAudit: async () => ({ violations: [] }),
    observeImplementationSelfTest: async facts => {
      captured.push(facts);
      offered.resolve();
      await saved.promise;
    },
  } satisfies GovernedToolsOptions;
  const tools = buildGovernedTools(allow, options);
  assert.deepEqual(tools.map(tool => tool.name), buildGovernedTools(allow, { ...options, observeImplementationSelfTest: undefined }).map(tool => tool.name));
  assert.equal(tools.some(tool => tool.name === "exercise_acceptance_browser"), false);
  const run = tools.find(tool => tool.name === "run_shell")!;
  const argv = [process.execPath, "-e", "process.exit(0)"];
  let returned = false;
  const pending = run.handler({ name: run.name, toolCallId: "real-shell-call",
    args: { command: `"${argv[0]}" -e "${argv[2]}"`, roleId: "invented", turnId: "invented",
      reviewedBy: "invented", argv: ["invented"], outcome: { exitCode: 8 }, writeAuditPassed: false },
  }).then(result => { returned = true; return result; });
  await Promise.race([offered.promise, pending.then(result => assert.fail(result.message))]);
  assert.equal(returned, false);
  saved.resolve();
  assert.equal((await pending).ok, true);
  assert.deepEqual(approved, [argv]);
  assert.deepEqual(captured, [{
    roleId: "fixture-developer", turnId: "actual-a11-turn", toolCallId: "real-shell-call", cwd: project.root,
    argv, reviewedBy: "fixture-operator", outcome: { exitCode: 0 }, writeAuditPassed: true,
    process: { started: true, transport: { kind: "direct", executable: argv[0], argv: argv.slice(1) } },
  }]);
  assert.ok(Object.isFrozen(captured[0]) && Object.isFrozen(captured[0]?.argv) && Object.isFrozen(captured[0]?.outcome));
  assert.ok(Object.isFrozen(captured[0]?.process?.transport?.argv));
});

test("a bound A11 retest requires the same approval, successful spawn and explicit settled audit", async t => {
  const project = await neutralProjectRoot();
  t.after(project.cleanup);
  const testContext = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  t.after(() => { if (testContext !== undefined) process.env.NODE_TEST_CONTEXT = testContext; });
  await writeFile(path.join(project.root, "retest.test.mjs"), 'console.log("fixture actually ran");');
  const digest = "a".repeat(64);
  const argv = [process.execPath, "--test", "retest.test.mjs"];
  const command = `"${argv[0]}" --test retest.test.mjs`;
  const review = { allow: true, by: "fixture-operator", implementationSelfTest: { strictAuditReady: true, isCurrent: () => true } } as const;
  const observations: ImplementationSelfTestObservation[] = [];
  const options = {
    durableFixedWorkflow: true, shellCwd: project.root, roleId: "fixture-developer", currentTurnId: () => "retest-turn",
    shellGate: async request => { assert.deepEqual(request.argv, argv); assert.equal(request.turnId, "retest-turn"); return review; },
    shellPostAudit: async (request, outcome) => {
      assert.equal(request.toolCallId, "original-call");
      assert.equal(request.turnId, "retest-turn");
      assert.deepEqual(request.argv, argv);
      assert.equal(outcome.exitCode, 0);
      return { violations: [], strictAudit: { status: "passed", digest } };
    },
    observeImplementationSelfTest: facts => { observations.push(facts); },
  } satisfies GovernedToolsOptions;
  const run = (overrides: Partial<GovernedToolsOptions> = {}, input = command) => {
    const shell = buildGovernedTools(allow, { ...options, ...overrides }).find(tool => tool.name === "run_shell")!;
    return shell.handler({ name: shell.name, toolCallId: "original-call", args: { command: input } });
  };
  const result = await run();
  assert.equal(result.ok, true, result.message);
  assert.match(result.message, /本次 Shell 工具调用 ID："original-call"/);
  const success = observations.shift();
  assert.deepEqual(success?.process, { started: true, transport: { kind: "direct", executable: argv[0], argv: argv.slice(1) } });
  assert.deepEqual(success?.strictAudit, { status: "passed", digest });
  assert.equal(success?.writeAuditPassed, true);
  assert.match(success?.output?.stdout ?? "", /fixture actually ran/);

  for (const audit of [() => ({ violations: [] }), () => { throw new Error("write failed"); },
    () => ({ violations: [], strictAudit: { status: "passed", digest: "not-a-digest" } as const }),
    () => ({ violations: [], strictAudit: { status: "failed", reason: "missing coverage" } as const })]) {
    const incomplete = await run({ shellPostAudit: audit });
    assert.equal(incomplete.ok, false, incomplete.message);
    assert.equal(incomplete.execution?.exitCode, 0);
    const failedAudit = observations.shift();
    assert.equal(failedAudit?.process?.started, true);
    assert.equal(failedAudit?.strictAudit?.status, "failed");
    assert.equal(failedAudit?.writeAuditPassed, false);
  }

  const unauditable = await run({ shellPostAudit: undefined });
  assert.match(unauditable.execution?.error ?? "", /implementation-self-test-not-ready/);
  assert.deepEqual(observations.shift()?.process, { started: false });
  const stale = await run({ shellGate: async () => ({ ...review, implementationSelfTest: { strictAuditReady: true, isCurrent: () => false } }),
    shellPostAudit: () => ({ violations: [], strictAudit: { status: "failed", reason: "stale binding" } }) });
  assert.match(stale.execution?.error ?? "", /implementation-self-test-stale/);
  assert.deepEqual(observations.shift()?.process, { started: false });
  const declined = await run({ shellGate: async () => ({ allow: false, by: "fixture-operator", reason: "declined", implementationSelfTest: { strictAuditReady: false } }) });
  assert.match(declined.message, /审核拒绝/);
  assert.match(declined.message, /本次 Shell 工具调用 ID："original-call"/);
  const denial = observations.shift();
  assert.deepEqual(denial?.process, { started: false });
  assert.equal(denial?.reviewedBy, "");
  assert.match(denial?.failure ?? "", /declined/);

  const missing = path.join(project.root, "missing-executable");
  const notStarted = await run({ shellGate: async () => review,
    shellPostAudit: () => ({ violations: [], strictAudit: { status: "passed", digest } }) }, `"${missing}" --test retest.test.mjs`);
  assert.match(notStarted.execution?.error ?? "", /ENOENT/);
  const spawnError = observations.shift();
  assert.equal(spawnError?.process?.started, false);
  assert.equal(spawnError?.process?.transport?.executable, missing);
  assert.equal(spawnError?.writeAuditPassed, false);
  assert.equal(observations.length, 0);
});

test("self-test observation cannot stand in for command approval, audit or a current implementation assignment", async t => {
  const project = await neutralProjectRoot();
  t.after(project.cleanup);
  const capture: ImplementationSelfTestObservation[] = [];
  let turnId = "a11-current";
  const options = {
    durableFixedWorkflow: true, shellCwd: project.root, roleId: "fixture-developer", currentTurnId: () => turnId,
    shellGate: async () => ({ allow: true as const, by: "fixture-operator" }),
    observeImplementationSelfTest: facts => { capture.push(facts); },
  } satisfies GovernedToolsOptions;
  const run = (override: Partial<GovernedToolsOptions>, command: string, signal?: AbortSignal) => {
    const tool = buildGovernedTools(allow, { ...options, ...override }).find(entry => entry.name === "run_shell")!;
    return tool.handler({ name: tool.name, toolCallId: "shell-call", args: { command }, signal });
  };
  const code = (value: number) => `"${process.execPath}" -e "process.exit(${value})"`;
  assert.equal((await run({ durableFixedWorkflow: false }, code(0))).ok, true);
  assert.equal((await run({ shellGate: async () => ({ allow: false, by: "fixture-operator", reason: "declined" }) }, code(0))).ok, false);
  assert.equal((await run({}, `"${path.join(project.root, "missing-program")}"`)).ok, false);
  assert.equal((await run({}, code(0), AbortSignal.abort())).ok, false);
  await run({ shellPostAudit: () => { turnId = "advanced"; return { violations: [] }; } }, code(0));
  assert.equal(capture.length, 0);
  assert.equal((await run({}, code(0))).ok, true);
  assert.equal(capture[0]?.writeAuditPassed, false);
  assert.equal((await run({ shellPostAudit: () => ({ violations: [{ path: "outside", change: "added" }] }) }, code(0))).ok, false);
  assert.equal(capture[1]?.writeAuditPassed, false);
  assert.equal((await run({ shellPostAudit: () => ({ violations: [] }) }, code(7))).ok, false);
  assert.equal(capture[2]?.writeAuditPassed, true);
  assert.deepEqual(capture[2]?.outcome, { exitCode: 7 });
  assert.equal(capture.length, 3);
});

test("each provider receives current-only tool text and no appended legacy Chief resource for YAML workflows", async t => {
  const project = await neutralProjectRoot();
  t.after(project.cleanup);
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const captured: RuntimeProviderOptions[] = [];
    const factory: RuntimeProviderFactory = options => {
      registerControlledDisplayProfile(options);
      captured.push(options);
      return createDemoRuntimeAdapter(options);
    };
    for (const durableFixedWorkflow of [true, undefined]) {
      const session = await createRuntimeAdapter({
        runtime,
        durableFixedWorkflow,
        gate: allow,
        projectRoot: project.root,
        skillRoot: project.root,
        contextSections: ["current host context"],
        customerInput: async () => ({ outcome: "declined" }),
        providerFactories: { [runtime]: factory },
      }).bindRole({ ...role("chief"), kind: "built-in-governance" });
      await session.dispose();
    }

    assert.equal(captured.length, 2, runtime);
    const [current, compatible] = captured;
    assert.deepEqual(current!.contextSections, ["current host context"], runtime);
    assert.equal(compatible!.contextSections?.[0], "current host context", runtime);
    assert.match(compatible!.contextSections?.[1] ?? "", /chief-workflow\/v1/, runtime);
    const choice = current!.tools.find(tool => tool.name === "request_choice")!;
    assert.match(toolText(choice), /A3.*A6.*A10/, runtime);
    assert.doesNotMatch(JSON.stringify(choice), /Convener|D3|Steward|appointment-write/, runtime);
    for (const name of ["write_file", "edit_file"]) {
      const currentWrite = current!.tools.find(tool => tool.name === name)!;
      const compatibleWrite = compatible!.tools.find(tool => tool.name === name)!;
      assert.match(toolText(currentWrite), /当前任务授权.*写入范围/, runtime);
      assert.match(toolText(currentWrite), /A8.*已批准的名单.*直接写角色卡.*activate_role_documents/, runtime);
      assert.doesNotMatch(toolText(currentWrite), /确认|审批|D3|appointment-write/, runtime);
      assert.match(toolText(compatibleWrite), /request_confirmation.*既有确认与审批规则/, runtime);
      assert.deepEqual(currentWrite.inputSchema, compatibleWrite.inputSchema, runtime);
    }
    assert.equal(current!.tools.some(tool => tool.name === "dispatch_task" || tool.name === "redispatch_task"), false, runtime);
  }
});

test("YAML presentation preserves fixed transport validation and passes only verified activation arguments to the host", async () => {
  const inputs: unknown[] = [];
  const capabilities = {
    roleId: "nominator",
    activateRoleDocumentsFixed: async input => {
      inputs.push(input);
      return { ok: false, code: "fixture-denied", message: "Host denied activation" };
    },
    customerInput: async () => ({ outcome: "declined" }),
    completeTeamPlan: async () => assert.fail("The presentation test does not execute team planning"),
    reportHandback: async () => {},
    projectState: async () => ({ ok: true, text: "fixture" }),
  } satisfies GovernedToolsOptions;
  const normal = buildGovernedTools(allow, capabilities);
  const current = buildGovernedTools(allow, { ...capabilities, durableFixedWorkflow: true });
  assert.deepEqual(current.map(tool => tool.name), normal.map(tool => tool.name));
  for (const [index, tool] of current.entries()) {
    assert.deepEqual(schemaWithoutDescriptions(tool.inputSchema), schemaWithoutDescriptions(normal[index]?.inputSchema), tool.name);
    assert.equal(tool.executionMode, normal[index]?.executionMode, tool.name);
  }

  const activate = current.find(tool => tool.name === "activate_role_documents")!;
  assert.match(toolText(activate), /proposalDecisionId.*A6.*三份文档/);
  assert.doesNotMatch(toolText(activate), /D3|appointment-write|planRef|rosterRef/);
  assert.match(toolText(normal.find(tool => tool.name === activate.name)!), /真实D3/);
  const plan = current.find(tool => tool.name === "complete_team_plan")!;
  assert.match(toolText(plan), /workflowId.*path.*version/);
  assert.doesNotMatch(toolText(plan), /D3|baseDigest|runId|legacy/);
  const report = current.find(tool => tool.name === "submit_report")!;
  assert.match(toolText(report), /交回工作流.*status=completed.*status=blocked/);
  const confirmation = current.find(tool => tool.name === "request_confirmation")!;
  assert.doesNotMatch(JSON.stringify(confirmation.inputSchema), /D3|任命后写入/);
  const state = current.find(tool => tool.name === "project_state")!;
  assert.doesNotMatch(toolText(state), /派发\/收口\/巡检前/);

  const coreArgs = {
    operationId: "activate-worker",
    flowId: "race",
    workflowId: "dw-race",
    targetRoleId: "worker",
    roster: { path: "docs/proposals/race-roster-v1.md" },
    documents: {
      card: { path: "角色卡/worker/role-card.md" },
      boundaryMd: { path: "角色卡/worker/boundary.md" },
      boundaryYaml: { path: "角色卡/worker/boundary.yaml" },
    },
  };
  const invoke = (args: Record<string, unknown>) => activate.handler({ name: activate.name, args });
  const missing = await invoke(coreArgs);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /proposalDecisionId: required/);
  assert.equal(inputs.length, 0);

  const valid = { ...coreArgs, proposalDecisionId: "decision-signed-by-host" };
  const denial = await invoke({ ...valid, d3DecisionId: "old-argument" });
  assert.equal(denial.ok, false);
  assert.match(denial.message, /fixture-denied/);
  assert.deepEqual(inputs, [valid]);
});

test("YAML choice receipts preserve the recorded decision and leave progression with the workflow", async () => {
  const invoke = (outcome: CustomerInputOutcome, durableFixedWorkflow: boolean) => {
    const choice = buildGovernedTools(allow, {
      durableFixedWorkflow, roleId: "chief", customerInput: async () => outcome,
    }).find(tool => tool.name === "request_choice")!;
    return choice.handler({
      name: choice.name,
      args: { title: "确认方案", flowId: "race", cardKind: "proposal", options: [{ id: "accept", label: "接受" }] },
    });
  };
  const manual = {
    outcome: "answered", operatorId: "customer", decisionId: "decision-host",
    value: { selected: ["accept"] },
  } satisfies CustomerInputOutcome;
  const accepted = await invoke(manual, true);
  assert.deepEqual(accepted, {
    ok: true,
    message: "request_choice：客户已选择（操作者：customer）：accept（接受）。工作流根据本次选择推进；**未选中的项不得擅自代选**。\n应用记录的决定 id（decisionId）：decision-host。",
  });
  const legacy = await invoke(manual, false);
  assert.deepEqual(legacy, {
    ok: true,
    message: "request_choice：客户已选择（操作者：customer）：accept（接受）。请按客户的选择继续；**未选中的项不得擅自代选**。\nD3 裁决 id（decisionId）：decision-host——appointment-write 必须原样携带。",
  });

  const judged = await invoke({
    ...manual, operatorId: "judge:claude",
    judge: { group: "decision", cardKind: "proposal", engine: "claude", reasonCode: "fixture" },
  }, true);
  assert.equal(judged.ok, true);
  assert.match(judged.message, /代决策；operator:judge:claude/);
  assert.match(judged.message, /decisionId.*decision-host/);
  assert.doesNotMatch(judged.message, /D3|appointment-write|客户已选择/);

  const delegated = await invoke({
    ...manual, operatorId: "chief",
    actionSource: {
      kind: "chief-delegated", actorRoleId: "chief", originRoleId: "chief", requestId: "host",
      baseDigest: "a".repeat(64), delegationRevision: 1, disposition: "select", selected: ["accept"],
      reason: "方案符合目标", at: "2026-11-18T02:00:00Z",
    },
  }, true);
  assert.equal(delegated.ok, true);
  assert.match(delegated.message, /幕僚已选择.*工作流根据本次决定选择下一节点/);
  assert.match(delegated.message, /"decisionId":"decision-host"/);
  assert.doesNotMatch(delegated.message, /D3|appointment-write|客户已选择/);
});

test("A11 tool assembly presents the assigned implementation work item and preserves dispatch transport", async () => {
  const received: unknown[] = [];
  const options = {
    roleId: "convener",
    currentTurnId: () => "current-a11-turn",
    dispatchTask: (payload, metadata) => {
      received.push({ payload, metadata });
      return { ok: true, message: "fixture accepted" };
    },
  } satisfies GovernedToolsOptions;
  const tools = (durableFixedWorkflow: boolean) => buildGovernedTools(allow, { ...options, durableFixedWorkflow });
  const current = tools(true).find(tool => tool.name === "dispatch_task")!;
  const compatible = tools(false).find(tool => tool.name === "dispatch_task")!;
  assert.match(toolText(current), /A11 运营父任务.*roleId.*workItemId.*moduleId.*idempotencyKey.*sideEffect=code/);
  assert.match(toolText(current), /同一工作项使用 reworkOf=A11/);
  assert.doesNotMatch(toolText(current), /Chief|stage-request|星形任务|Steward|D3/);
  assert.match(toolText(compatible), /Chief.*stage-request/s);
  assert.deepEqual(schemaWithoutDescriptions(current.inputSchema), schemaWithoutDescriptions(compatible.inputSchema));
  const parameters = current.inputSchema.properties as Record<string, Record<string, unknown>>;
  const legacyParameters = compatible.inputSchema.properties as Record<string, Record<string, unknown>>;
  assert.match(String(parameters.moduleId?.description), /workItemId/);
  assert.match(String(parameters.idempotencyKey?.description), /same key.*new stable key/);
  assert.match(String(parameters.reworkOf?.description), /A11.*same work item.*closed as rework/);
  assert.match(String(legacyParameters.resumeController?.description), /Chief's explicit request/);
  assert.match(String(legacyParameters.taskKind?.description), /stage-request/);
  const descriptions = Object.values(parameters).flatMap(schema => schema.description ?? []);
  assert.doesNotMatch(descriptions.join("\n"), /Chief|stage-request|Steward|星形任务|legacy/);

  const workItem = {
    roleId: "frontend", moduleId: "renderer", task: "Implement approved track preview and return the real commit.",
    idempotencyKey: "renderer:retry-1", sideEffect: "code", stage: "A11", reworkOf: "A11",
    modulePaths: ["app/renderer/track.ts"], flowId: "race", workflowId: "dw-race",
  };
  const call = { name: current.name };
  assert.equal((await current.handler({ ...call, args: { ...workItem, reworkOf: "task-id" } })).ok, false);
  assert.equal(received.length, 0);
  assert.deepEqual(await current.handler({ ...call, args: workItem }), await compatible.handler({ ...call, args: workItem }));
  assert.equal(received.length, 2);
  assert.deepEqual(received[0], received[1]);
  assert.deepEqual((received[0] as { payload: unknown }).payload, workItem);
  assert.equal(buildGovernedTools(allow, { roleId: "convener", durableFixedWorkflow: true })
    .some(tool => tool.name === "dispatch_task"), false);
});

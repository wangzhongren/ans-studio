import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { yamlSessionRole } from "../../../src/common/编排/durable-role-context.ts";
import { appendTaskEvent, taskEvent } from "../../../src/common/编排/task-state.ts";
import { createInteractionGate } from "../../../src/common/runtime-core/timeout.ts";
import type { ProjectConfig, ResolvedRole } from "../../../src/model/role.ts";
import type { RuntimeProviderOptions } from "../../../src/model/runtime.ts";
import { createRuntimeAdapterFactory, openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { createClaudeRuntimeAdapter } from "../../../src/provider/claude/session.ts";
import { createCodexRuntimeAdapter } from "../../../src/provider/codex/session.ts";
import { createPiRuntimeAdapter } from "../../../src/provider/pi/session.ts";

const factories = { claude: createClaudeRuntimeAdapter, pi: createPiRuntimeAdapter, codex: createCodexRuntimeAdapter };

function offlineTestKey(t: import("node:test").TestContext): string {
  const apiKeyEnvVar = "ANS_YAML_WORKFLOW_CONTEXT_TEST_KEY";
  const saved = process.env[apiKeyEnvVar];
  process.env[apiKeyEnvVar] = "offline-test-only";
  t.after(() => {
    if (saved === undefined) delete process.env[apiKeyEnvVar];
    else process.env[apiKeyEnvVar] = saved;
  });
  return apiKeyEnvVar;
}

test("Claude, Pi and Codex compose the YAML role view instead of old role-card rules", async t => {
  const role: ResolvedRole = {
    id: "nominator", governanceFunction: "nomination", kind: "built-in-governance",
    cardText: "应用旧规则：等 D3 裁决，等 A9/A10 之后再招人，Chief枢纽派发。",
    boundary: {
      boundarySource: "fixture",
      acceptance: { accepted: true, source: "D3 old rule" },
      entries: [{ path: "角色卡/game/", root: "project", kind: "directory", purpose: "D3 old boundary rule" }],
    },
    boundarySource: "fixture",
    location: { card: "fixture", boundary: "fixture" },
  };
  const apiKeyEnvVar = offlineTestKey(t);
  for (const runtime of Object.keys(factories) as (keyof typeof factories)[]) await t.test(runtime, async () => {
    const options: RuntimeProviderOptions = {
      runtime, projectRoot: "", skillRoot: "", baseUrl: "https://example.invalid", modelId: "yaml-context-fixture", apiKeyEnvVar,
      tools: [], interactionGate: createInteractionGate(), currentTurnId: () => undefined,
    };
    const adapter = factories[runtime](options);
    const legacy = await adapter.composeContext(role);
    const yaml = await adapter.composeContext(yamlSessionRole(role, "A8"));
    assert.match(legacy.systemPrompt, /D3 裁决，等 A9\/A10/);
    assert.match(yaml.systemPrompt, /当前 A8 任务和已批准方案名单/);
    assert.match(yaml.systemPrompt, /activate_role_documents/);
    assert.doesNotMatch(yaml.systemPrompt, /D3|A9\/A10|Chief枢纽/);
    const preparation = await adapter.composeContext(yamlSessionRole(role, "A7"));
    assert.match(preparation.systemPrompt, /本轮只读核对已批准名单/);
    assert.doesNotMatch(preparation.systemPrompt, /activate_role_documents|A8|D3|A9\/A10/);
    assert.equal(role.boundary.entries[0]?.purpose, "D3 old boundary rule");
  });
});

test("only an assigned YAML A8 hides old confirmation tools from actual provider options", async t => {
  const projectRoot = await mkdtemp(join(tmpdir(), "ans-yaml-a8-tools-"));
  t.after(async () => rm(projectRoot, { recursive: true, force: true }));
  const project: ProjectConfig = {
    projectRoot, skillRoot: projectRoot, roles: {}, builtInRoles: ["nominator"], governanceModel: "trio",
  };
  for (const stage of ["A7", "A8"] as const) {
    const taskId = "role-docs-" + stage;
    const placed = await appendTaskEvent(projectRoot, taskEvent("task.created", {
      taskId, from: "convener", to: "nominator", stage, text: "Check personnel inputs", sideEffect: "read-only",
      idempotencyKey: taskId, flowId: "approval", workflowId: "owned-workflow",
    }, () => new Date()));
    assert.equal(placed.ok, true);
  }
  const apiKeyEnvVar = offlineTestKey(t);
  for (const runtime of Object.keys(factories) as (keyof typeof factories)[]) await t.test(runtime, async () => {
    for (const selection of [
      { taskId: "role-docs-A8", workflowMode: "fixed", durableFixedWorkflow: true, acceptsInput: false },
      { taskId: "role-docs-A7", workflowMode: "fixed", durableFixedWorkflow: true, acceptsInput: true },
      { taskId: undefined, workflowMode: "fixed", durableFixedWorkflow: true, acceptsInput: true },
      { taskId: "role-docs-A8", workflowMode: "fixed", durableFixedWorkflow: false, acceptsInput: true },
      { taskId: undefined, workflowMode: "legacy", durableFixedWorkflow: false, acceptsInput: true },
    ] as const) {
      let actual: RuntimeProviderOptions | undefined;
      let prompt = "";
      const createAdapter = createRuntimeAdapterFactory(project, runtime, {
        baseUrl: "https://example.invalid", modelId: "yaml-a8-fixture", apiKeyEnvVar, persistSession: false,
        providerFactories: { [runtime]: (providerOptions: RuntimeProviderOptions) => {
          actual = providerOptions;
          const adapter = factories[runtime](providerOptions);
          return {
            composeContext: adapter.composeContext,
            async bindRole(role: ResolvedRole) {
              prompt = (await adapter.composeContext(role)).systemPrompt;
              providerOptions.registerToolDisplayProfile?.({ apiKeyEnvVar, credentials: [{ name: apiKeyEnvVar, value: "offline-test-only" }] });
              return { async prompt() {}, async *events() {}, async dispose() {} };
            },
          };
        } },
      });
      const handle = await openRoleSession({
        project, roleId: "nominator", runtime, taskId: selection.taskId, workflowMode: selection.workflowMode,
        durableFixedWorkflow: selection.durableFixedWorkflow, customerInput: async () => ({ outcome: "declined" }),
        activateRoleDocumentsFixed: async () => ({ ok: false, code: "fixture", message: "No approved activation in this tool-surface test." }),
      }, { createAdapter });
      await handle.dispose();
      assert.ok(actual);
      const tools = new Set(actual.tools.map(tool => tool.name));
      assert.equal(tools.has("request_confirmation"), selection.acceptsInput);
      assert.equal(tools.has("request_choice"), selection.acceptsInput);
      if (!selection.acceptsInput) {
        for (const name of ["write_file", "edit_file", "activate_role_documents", "submit_report"]) assert.ok(tools.has(name), name);
        assert.match(prompt, /直接用 write_file 或 edit_file/);
        assert.doesNotMatch(prompt, /appointment-write|D3|先把角色卡/);
        const installedDescriptions = actual.tools.filter(tool => ["write_file", "edit_file", "activate_role_documents"].includes(tool.name));
        assert.doesNotMatch(JSON.stringify(installedDescriptions), /appointment-write|request_confirmation|D3|既有确认/);
      }
    }
  });
});

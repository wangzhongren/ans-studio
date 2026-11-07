// test/编排/run-role-submit-capabilities.test.ts
// S5/Batch 3.5：run-role 三提交能力（submit_version_change / submit_refactor /
// request_stable_write）的**角色门控注入**测试——
// · product/rapporteur → 仅 submitVersionChange；convener → submitRefactor + requestStableWrite；
// · 其他治理角色/项目角色 ⇒ 一律不注入（工具不注册，fail-closed）；未注入 ⇒ 字段缺席；
// · 注入即同一引用（不包装、不调用；工具层保证「恰好一次」与回执透传，C1d 测试覆盖）；
// · run-role 不批准/不发许可/不写账本（能力实现由 D1b 注入 S4/S2）。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { TRUNK_MANIFEST_SCHEMA, type TrunkManifest } from "../../src/model/trunk.ts";
import { initializeGitRepository, createFsTrunkStore, migrateLegacyTrunkToGit, readGitInitialWorkflowSource } from "../../src/provider/trunk/public/trunk-store.ts";

import type { StableWritePermit } from "../../src/model/version-change.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RequestStableWriteFn,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  SubmitRefactorFn,
  SubmitVersionChangeFn,
  WriteGate,
  ChiefDecisionExecutionContext,
  DecidePendingRequestFn,
  SelectRunChangeFn,
  CompleteTeamPlanFn,
  ActivateRoleDocumentsFn,
  CloseCreatedTaskFn,
  RuntimeProviderOptions,
} from "../../src/model/runtime.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { refreshStableWritePermitSnapshot } from "../../src/pipeline/orchestration/stable-write-runtime.ts";
import { createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import { createVersionChangeStack } from "../../app/desktop/version-change.ts";
import { recordTaskObservation, beginGitHostAction, endGitHostAction } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { openRoleSession, readRoleCapabilityProtectionScope, inspectRoleSessionOpenFailure, recheckRoleSessionOpenFailure, recheckRoleSessionOpenFailureInventory } from "../../src/pipeline/orchestration/run-role.ts";
import { eventTurnId, type OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { resolveDeliveryAssignment } from "../../src/pipeline/orchestration/trunk-runtime.ts";

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
    captured.caps = caps;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

const submitVersionChange: SubmitVersionChangeFn = async () => ({
  ok: true,
  applicationId: "vc-1",
  status: "submitted",
});
const submitRefactor: SubmitRefactorFn = async () => ({ ok: true, requestId: "rf-1", status: "requested" });
const requestStableWrite: RequestStableWriteFn = async () => ({ ok: true, requestId: "sw-1", status: "requested" });

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-submit-caps-"));
  try {
    return await fn(root);
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

function trioProject(root: string, builtInRoleId: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [builtInRoleId],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:submit-caps" },
    },
  };
}

function writeFile(root: string, rel: string, text: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf8");
}

function projectRole(root: string): ProjectConfig {
  writeFile(root, "角色卡/X/role-card.md", "# 角色 X\n");
  writeFile(root, "角色卡/X/boundary.yaml", "role: X\nentries:\n  - kind: directory\n    path: src/\n    purpose: 实现\n");
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:submit-caps" },
    },
  };
}

const ALL = { submitVersionChange, submitRefactor, requestStableWrite };

test("direct governance bridge: only the trusted trio action owner receives each capability", async () => {
  const selectRunChange: SelectRunChangeFn = async input => ({ ok: false, status: "blocked", operationId: input.operationId, baseDigest: null, targetDigest: null, errorCode: "fixture", message: "fixture" });
  const completeTeamPlan: CompleteTeamPlanFn = async input => ({ ok: false, status: "blocked", operationId: input.operationId, baseDigest: null, targetDigest: null, errorCode: "fixture", message: "fixture" });
  const activateRoleDocuments: ActivateRoleDocumentsFn = async input => ({ ok: false, status: "blocked", operationId: input.operationId, baseDigest: null, targetDigest: null, errorCode: "fixture", message: "fixture" });
  const closeCreatedTask: CloseCreatedTaskFn = async input => ({ ok: false, status: "blocked", operationId: input.operationId, taskId: input.taskId, baseDigest: null, targetDigest: null, errorCode: "fixture", message: "fixture" });
  const direct = { selectRunChange, completeTeamPlan, activateRoleDocuments, closeCreatedTask };
  await withRoot(async root => {
    for (const [roleId, expected] of [["rapporteur", ["selectRunChange"]], ["convener", ["completeTeamPlan", "closeCreatedTask"]],
      ["nominator", ["activateRoleDocuments"]], ["chief", ["closeCreatedTask"]], ["product", []]] as const) {
      const captured: Captured = {};
      const handle = await openRoleSession({ roleId, project: trioProject(root, roleId), ...direct }, { createAdapter: capturingFactory(captured) });
      try {
        const keys = (Object.keys(direct) as Array<keyof typeof direct>).filter(key => captured.caps?.[key] !== undefined);
        assert.deepEqual(keys.sort(), [...expected].sort());
        for (const key of keys) assert.equal(captured.caps?.[key], direct[key]);
      } finally { await handle.dispose(); }
    }
    const captured: Captured = {};
    const handle = await openRoleSession({ roleId: "chief", project: trioProject(root, "chief"), ...direct,
      chiefDecisionContext: chiefContext(), decidePendingRequest }, { createAdapter: capturingFactory(captured) });
    try { for (const key of Object.keys(direct) as Array<keyof typeof direct>) assert.equal(captured.caps?.[key], undefined); }
    finally { await handle.dispose(); }
  });
});

function chiefContext(): ChiefDecisionExecutionContext {
  return { roleId: "chief", executionId: "separate-chief", mode: "bounded-decision", productionWriteAuthority: false,
    tools: ["decide_pending_request"], limits: { maxTurns: 1, maxAttempts: 1, timeoutMs: 1000 },
    request: { requestId: "request-1", baseDigest: "a".repeat(64), delegationRevision: 3, originRoleId: "convener", cardKind: "decision",
      question: "Choose the justified recovery", options: [{ id: "first", label: "First", recommended: true }, { id: "second", label: "Second" }],
      evidenceRefs: [{ snapshotId: "test-snapshot", path: "docs/evidence.md", sha256: "b".repeat(64) }] } };
}
const decidePendingRequest: DecidePendingRequestFn = async input => ({ ok: true, requestId: input.requestId, status: "settled",
  source: { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "convener", requestId: input.requestId,
    baseDigest: input.baseDigest, delegationRevision: input.delegationRevision, disposition: input.disposition,
    ...(input.disposition === "select" ? { selected: input.selected } : {}), reason: input.reason, at: "2026-11-05T00:00:00Z" } });

test("chief bridge: trusted bounded context forwards only decision capability and denies production writes", async () => {
  await withRoot(async root => {
    const captured: Captured = {}, context = chiefContext();
    const handle = await openRoleSession({ roleId: "chief", project: trioProject(root, "chief"), ...ALL,
      persistSession: true, autoRepin: true, chiefDecisionContext: context, decidePendingRequest }, { createAdapter: capturingFactory(captured) });
    try {
      assert.deepEqual(Object.keys(captured.caps!).sort(), ["chiefDecisionContext", "decidePendingRequest", "persistSession"].sort());
      assert.deepEqual(captured.caps!.chiefDecisionContext, context);
      assert.equal(captured.caps!.decidePendingRequest, decidePendingRequest);
      assert.equal(captured.caps!.persistSession, false);
      assert.equal(captured.gate!(path.join(root, "docs/proposals/write.md")).allowed, false);
      await handle.send("Decide independently");
      for await (const event of handle.events()) { if (event.kind === "settled") break; }
      assert.equal(fs.existsSync(path.join(root, ".ans/sessions")), false);
    } finally { await handle.dispose(); }
  });
});

test("chief bridge: wrong role, single model and unbound settlement capability fail before adapter construction", async () => {
  await withRoot(async root => {
    let constructed = 0;
    const deps = { createAdapter: () => { constructed++; throw new Error("must not construct"); } };
    await assert.rejects(openRoleSession({ roleId: "product", project: trioProject(root, "product"), chiefDecisionContext: chiefContext(), decidePendingRequest }, deps), /chief/);
    await assert.rejects(openRoleSession({ roleId: "chief", project: { ...trioProject(root, "chief"), governanceModel: "single" }, chiefDecisionContext: chiefContext(), decidePendingRequest }, deps), /chief/);
    await assert.rejects(openRoleSession({ roleId: "chief", project: trioProject(root, "chief"), decidePendingRequest }, deps), /bounded/);
    assert.equal(constructed, 0);
  });
});

test("chief bridge: real runtime Service sees only decide tool, separate host context, and no session persistence", async () => {
  await withRoot(async root => {
    let provider: RuntimeProviderOptions | undefined, decisions = 0;
    const handle = await openRoleSession({ roleId: "chief", project: trioProject(root, "chief"), runtime: "demo", ...ALL,
      chiefDecisionContext: chiefContext(), decidePendingRequest: async (input, signal) => { decisions++; return decidePendingRequest(input, signal); } },
    { runtimeOptions: { providerFactories: { demo: options => { provider = options; return createDemoRuntimeAdapter(options,
      [{ name: "decide_pending_request", args: { requestId: "request-1", baseDigest: "a".repeat(64), delegationRevision: 3, disposition: "select", selected: ["second"], reason: "Evidence favours the second recovery" } }]); } } } });
    try {
      await handle.send("Read the supplied evidence and decide");
      assert.match(handle.sessionId ?? "", /^[a-f0-9-]{36}$/);
      const first = handle.inspectLifecycle?.(), second = handle.inspectLifecycle?.(); assert.ok(first && second);
      assert.equal(first.sessionId, handle.sessionId); assert.notStrictEqual(first, second); assert.notStrictEqual(first.reasons, second.reasons);
      const surface = handle.inspectToolSurface?.(); assert.ok(surface); assert.equal(surface.sessionId, handle.sessionId);
      assert.equal("nativeLifecycle" in handle, false, "Pipeline exposes copied facts, never a raw native lifecycle capability");
      const mismatch = await handle.stopAndInspect?.({ expectedSessionId: "wrong-instance", timeoutMs: 10 });
      assert.equal(mismatch?.status, "unknown"); assert.equal(handle.inspectLifecycle?.().stopRequested, false);
      assert.ok(provider);
      assert.deepEqual(provider.tools.map(tool => tool.name), ["decide_pending_request"]);
      assert.equal(decisions, 1);
      assert.equal(fs.existsSync(path.join(root, ".ans/sessions")), false);
    } finally { await handle.dispose(); }
  });
});

test("run-role 能力注入：product → 仅 submitVersionChange；rapporteur 同；convener → refactor+stable；chief 全无", async () => {
  await withRoot(async (root) => {
    const matrix: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["product", ["submitVersionChange"]],
      ["rapporteur", ["submitVersionChange"]],
      ["convener", ["submitRefactor", "requestStableWrite"]],
      ["chief", []],
      ["nominator", []],
    ];
    for (const [roleId, expected] of matrix) {
      const captured: Captured = {};
      const handle = await openRoleSession(
        { roleId, project: trioProject(root, roleId), ...ALL },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        const caps = captured.caps;
        assert.ok(caps !== undefined, `${roleId}: 应构造能力面`);
        assert.equal(handle.sessionId, undefined); assert.equal(handle.inspectLifecycle, undefined); assert.equal(handle.inspectToolSurface, undefined); assert.equal(handle.stopAndInspect, undefined);
        const present = (["submitVersionChange", "submitRefactor", "requestStableWrite"] as const).filter(
          (key) => caps![key] !== undefined,
        );
        assert.deepEqual(present.sort(), [...expected].sort(), `${roleId} 能力面`);
        if (expected.includes("submitVersionChange")) {
          assert.equal(caps!.submitVersionChange, submitVersionChange, "注入同一引用（不包装）");
        }
        if (expected.includes("submitRefactor")) assert.equal(caps!.submitRefactor, submitRefactor);
        if (expected.includes("requestStableWrite")) assert.equal(caps!.requestStableWrite, requestStableWrite);
      } finally {
        await handle.dispose();
      }
    }
  });
});

test("run-role 能力注入：项目角色即便调用方误给也不注入三能力（模型自报角色不可信）", async () => {
  await withRoot(async (root) => {
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "X", project: projectRole(root), ...ALL },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const caps = captured.caps;
      assert.ok(caps !== undefined);
      assert.equal(caps!.submitVersionChange, undefined);
      assert.equal(caps!.submitRefactor, undefined);
      assert.equal(caps!.requestStableWrite, undefined);
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role 能力注入：未注入 ⇒ 能力位缺席（工具不注册；无副作用）", async () => {
  await withRoot(async (root) => {
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "product", project: trioProject(root, "product") },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.caps !== undefined);
      assert.equal(captured.caps!.submitVersionChange, undefined);
      assert.equal(captured.caps!.submitRefactor, undefined);
      assert.equal(captured.caps!.requestStableWrite, undefined);
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role 能力注入：假实现的结构化回执形状（submitted/requested）由工具层透传（形状自检）", async () => {
  const vca = await submitVersionChange(
    {
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: "demo",
      summary: "x",
      targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v2.md", action: "add" }],
    },
    undefined,
  );
  assert.equal(vca.ok, true);
  assert.equal(vca.status, "submitted");
  const refactor = await submitRefactor(
    { roleId: "convener", flowId: "demo", title: "t", reason: "r", scope: { modules: [], paths: [], roles: [] } },
    undefined,
  );
  assert.equal(refactor.status, "requested");
  const stable = await requestStableWrite({ roleId: "convener", kind: "workflow", content: "# w\n" }, undefined);
  assert.equal(stable.status, "requested");
});


test("Pipeline actual role-capability assembly: required default Chat registers genuine no-effect callbacks; unmanaged keeps the original functions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-o8-role-capability-"));
  const storage = createFsTrunkStore(root), at = "2026-11-05T00:00:00.000Z";
  writeFile(root, "docs/surface.txt", "Actual owned storage fixture bytes");
  const snapshot = await storage.captureSnapshot!({ snapshotId: "o8-guard-allocation", createdAt: at, files: [{ path: "docs/surface.txt", sha256: createHash("sha256").update("Actual owned storage fixture bytes").digest("hex") }] }); assert.ok(snapshot.ok, JSON.stringify(snapshot)); if (!snapshot.ok) return;
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", flowId: "guard-fixture", trunkVersion: 1, previous: null, runId: null,
    digest: createHash("sha256").update("actual-owned-guard-fixture").digest("hex"), snapshotRef: snapshot.value, createdAt: at, updatedAt: at,
    artifacts: { documents: {}, execution: { teamPlan: null, flow: null }, boundaries: {} } };
  assert.ok((await storage.compareAndSwapManifest!(null, manifest, snapshot.value)).ok);
  await initializeGitRepository(root);
  assert.ok((await migrateLegacyTrunkToGit(root, { operationId: "o8-owned-guard-fixture-migration", expected: { version: 1, digest: manifest.digest } })).ok);
  assert.equal((await readRoleCapabilityProtectionScope({ projectRoot: root })).state, "required");
  const names = ["install_skill", "uninstall_skill", "install_mcp", "uninstall_mcp"], bodies: Array<{ messages: Array<{ role: string; content?: unknown }> }> = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk; bodies.push(JSON.parse(raw));
    const message = bodies.length === 1 ? { role: "assistant", tool_calls: names.map((name, index) => ({ id: `o8-tool-${index}`, type: "function", function: { name: `ans_${name}`, arguments: JSON.stringify({ roleId: "impl", name: "owned-fixture" }) } })) }
      : { role: "assistant", content: "The actual four callbacks refused their effects" };
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: "o8-owned-chat", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const prior = { wire: process.env.ANS_CODEX_WIRE_API, search: process.env.ANS_CODEX_WEB_SEARCH, key: process.env.ANS_O8_LOCAL_KEY };
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_O8_LOCAL_KEY = "owned-local-only";
  let oldEffects = 0, handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  const oldEffect = async () => { oldEffects++; return { ok: false as const, reason: "old-effect", message: "Unmanaged original callback" }; };
  try {
    handle = await openRoleSession({ roleId: "nominator", runtime: "codex", autoRepin: false, project: trioProject(root, "nominator"),
      installSkill: oldEffect, uninstallSkill: oldEffect, installMcp: oldEffect, uninstallMcp: oldEffect }, {
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "o8-owned-chat", apiKeyEnvVar: "ANS_O8_LOCAL_KEY", turnLastResortMs: 5000, persistSession: false } });
    await handle.send("Invoke each actual registered role-capability tool");
    const surface = handle.inspectToolSurface!(), guard = surface.roleCapabilityGuards;
    assert.equal(surface.status, "observed"); assert.equal(surface.factoryProvenance, "default-production"); assert.equal(guard?.status, "bound");
    assert.equal(guard?.sessionId, handle.sessionId); assert.equal(guard?.roleId, "nominator"); assert.equal(guard?.nativePlanId, surface.native?.factoryPlan?.planId);
    assert.deepEqual(guard?.guardedTools, names); assert.deepEqual(guard?.unguardedTools, []); assert.equal(oldEffects, 0);
    const toolResults = bodies[1]?.messages.filter(message => message.role === "tool") ?? []; assert.equal(toolResults.length, 4);
    for (const result of toolResults) assert.match(String(result.content), /effect-scope-unproven/);
    const unmanaged = fs.mkdtempSync(path.join(os.tmpdir(), "ans-o8-unmanaged-role-")), captured: Captured = {};
    assert.equal((await readRoleCapabilityProtectionScope({ projectRoot: unmanaged })).state, "unmanaged");
    const legacy = await openRoleSession({ roleId: "nominator", runtime: "demo", autoRepin: false, project: trioProject(unmanaged, "nominator"),
      installSkill: oldEffect, uninstallSkill: oldEffect, installMcp: oldEffect, uninstallMcp: oldEffect }, { createAdapter: capturingFactory(captured) });
    try { assert.equal(captured.caps?.installSkill, oldEffect); assert.equal(captured.caps?.uninstallSkill, oldEffect); assert.equal(captured.caps?.installMcp, oldEffect); assert.equal(captured.caps?.uninstallMcp, oldEffect); }
    finally { await legacy.dispose(); }
  } finally {
    await handle?.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (prior.wire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = prior.wire;
    if (prior.search === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = prior.search;
    if (prior.key === undefined) delete process.env.ANS_O8_LOCAL_KEY; else process.env.ANS_O8_LOCAL_KEY = prior.key;
  }
});

test("Pipeline handback turn intent: real task identity survives optional info reports; work still requires a report and chat clears old task", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-o24-turn-intent-")), store = createFsTrunkStore(root), taskId = "o24-actual-product-assignment", runId = "run-o24-turn-intent", at = new Date().toISOString();
  assert.ok((await store.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", runId, flowId: "o24-info", state: "draft", documents: {}, execution: { teamPlan: null, flow: null }, createdAt: at })).ok);
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId, from: "chief", to: "product", text: "Actual owned planning assignment",
    sideEffect: "docs", idempotencyKey: taskId, flowId: "o24-info", runId, runState: "draft" } })).ok);
  const assignment = await resolveDeliveryAssignment({ projectRoot: root, recipientRoleId: "product", source: { kind: "assigned-task", taskId } }); assert.ok(assignment.ok);
  const steps = [
    { label: "o24-bound-info-ack", required: false, taskId, report: undefined },
    { label: "o24-bound-info-explicit-block", required: false, taskId, report: "blocked" },
    { label: "o24-work-omitted", required: true, taskId, report: undefined },
    { label: "o24-new-chat-explicit", required: false, taskId: undefined, report: "blocked" },
    { label: "o24-work-explicit", required: true, taskId, report: "completed" },
    { label: "o24-work-omitted-again", required: true, taskId, report: undefined },
  ] as const;
  const emitted = new Set<string>(), requests: Array<{ messages: Array<{ role: string; content?: unknown }> }> = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk; const body = JSON.parse(raw); requests.push(body);
    const text = String(body.messages.filter((message: { role: string }) => message.role === "user").at(-1)?.content ?? ""), step = steps.find(item => text.includes(item.label));
    if (!step) { response.writeHead(500); response.end("unexpected-actual-prompt"); return; }
    const message = step.report !== undefined && !emitted.has(step.label)
      ? { role: "assistant", tool_calls: [{ id: step.label, type: "function", function: { name: "ans_submit_report", arguments: JSON.stringify({ status: step.report, summary: `Actual explicit report ${step.label}`, evidence: [] }) } }] }
      : { role: "assistant", content: `Acknowledged ${step.label}` };
    emitted.add(step.label); response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: step.label, object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const prior = { wire: process.env.ANS_CODEX_WIRE_API, search: process.env.ANS_CODEX_WEB_SEARCH, key: process.env.ANS_O24_LOCAL_KEY };
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_O24_LOCAL_KEY = "owned-local-only";
  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined, pump: Promise<void> | undefined;
  const events: OrchestrationEvent[] = [], settled = new Set<string>(), waits = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>(), ids: string[] = [];
  try {
    handle = await openRoleSession({ roleId: "product", runtime: "codex", project: trioProject(root, "product"), taskId: assignment.value.taskId, autoRepin: false, persistSession: false },
      { runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "o24-local-chat", apiKeyEnvVar: "ANS_O24_LOCAL_KEY", turnLastResortMs: 5000, persistSession: false } });
    const actual = handle;
    pump = (async () => { for await (const event of actual.events()) { events.push(event); if (event.kind === "settled") { const id = eventTurnId(event); assert.ok(id); settled.add(id);
      const wait = waits.get(id); if (wait) { clearTimeout(wait.timer); waits.delete(id); wait.resolve(); } if (settled.size === steps.length) break; } } })();
    for (const step of steps) {
      let id: string | undefined;
      await actual.send(step.label, { handback: { required: step.required, ...(step.taskId ? { taskId: step.taskId } : {}) }, onTurnStarted: metadata => { assert.equal(metadata.roleId, "product"); id = metadata.turnId; } });
      assert.ok(id); ids.push(id);
      if (!settled.has(id)) await new Promise<void>((resolve, reject) => { const turnId = id!; const timer = setTimeout(() => { waits.delete(turnId); reject(new Error(`actual turn did not settle: ${step.label}`)); }, 6000); waits.set(turnId, { resolve, reject, timer }); });
      const reports = events.filter(event => event.kind === "handback" && event.handback.turnId === id);
      if (step.label === "o24-bound-info-ack") assert.equal(reports.length, 0, "A bound task does not force an informational turn to report");
      else {
        assert.equal(reports.length, 1); const report = reports[0]!; assert.ok(report.kind === "handback"); assert.equal(report.handback.taskId, step.taskId);
        assert.equal(report.handback.origin, step.report ? "submitted-report" : "terminal-fallback");
        assert.equal(report.handback.status, step.report ?? "unreported");
      }
    }
    await pump; assert.equal(new Set(ids).size, steps.length); assert.equal(requests.length, 9, "Six actual turns plus three real submit_report continuations");
    assert.equal(events.filter(event => event.kind === "handback" && event.handback.taskId === undefined).length, 1, "The explicit new-chat report never inherits the constructor task");
  } finally {
    for (const wait of waits.values()) { clearTimeout(wait.timer); wait.reject(new Error("actual test cleanup")); } waits.clear();
    try { await handle?.dispose(); await pump?.catch(() => {}); }
    finally {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      if (prior.wire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = prior.wire;
      if (prior.search === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = prior.search;
      if (prior.key === undefined) delete process.env.ANS_O24_LOCAL_KEY; else process.env.ANS_O24_LOCAL_KEY = prior.key;
    }
  }
});


test("Pipeline initial workflow source: actual approved Core request binds task before the real guarded write", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-o10-workflow-source-")), at = new Date().toISOString(), storage = createFsTrunkStore(root), flowId = "workflow-source-fixture";
  writeFile(root, "docs/actual.txt", "Actual allocated planning fixture");
  const sha = (text: string) => createHash("sha256").update(text).digest("hex"), snap = await storage.captureSnapshot!({ snapshotId: "o10-source-basis", createdAt: at, files: [{ path: "docs/actual.txt", sha256: sha("Actual allocated planning fixture") }] });
  assert.ok(snap.ok); if (!snap.ok) return;
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", flowId, trunkVersion: 1, previous: null, runId: null, digest: sha("o10-actual-basis"), snapshotRef: snap.value,
    createdAt: at, updatedAt: at, artifacts: { documents: {}, execution: { teamPlan: null, flow: null }, boundaries: {} } };
  assert.ok((await storage.compareAndSwapManifest!(null, manifest, snap.value)).ok); await initializeGitRepository(root);
  assert.ok((await migrateLegacyTrunkToGit(root, { operationId: "o10-source-fixture-migration", expected: { version: 1, digest: manifest.digest } })).ok);
  const taskId = "o10-actual-request-task", runId = "run-o10-actual-request";
  assert.ok((await storage.compareAndSwapRunRecord!(runId, null, { schema: "ans-run/v1", flowId, runId, state: "draft", documents: {}, createdAt: at })).ok);
  const taskRecorded = await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId, from: "chief", to: "convener", text: "Prepare the initial workflow", sideEffect: "docs", idempotencyKey: taskId, flowId, runId, runState: "draft" } }); assert.ok(taskRecorded.ok, JSON.stringify(taskRecorded));
  const integration = createVersionChangeIntegration({ projectRoot: root, migrationCompleted: () => true }), content = "# Actual proposed workflow\nImplement then verify.\n";
  let calls = 0, writes = 0, requestId = "", permitId = "", sourceObservedBeforeWrite = false;
  let activePermit: StableWritePermit | undefined;
  const bodies: Array<{ messages: Array<{ role: string; content?: unknown }> }> = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk; bodies.push(JSON.parse(raw));
    const message = bodies.length === 1 ? { role: "assistant", tool_calls: [
      { id: "o10-fake-host", type: "function", function: { name: "ans_request_stable_write", arguments: JSON.stringify({ content, taskId: "model-cannot-provide-host-source" }) } },
      { id: "o10-real-request", type: "function", function: { name: "ans_request_stable_write", arguments: JSON.stringify({ content }) } },
    ] } : bodies.length === 2 ? { role: "assistant", tool_calls: [{ id: "o10-real-write", type: "function", function: { name: "ans_write_file", arguments: JSON.stringify({ path: "docs/workflow.md", content }) } }] }
      : { role: "assistant", content: "The actual source was captured before the guarded workflow write" };
    if (bodies.length === 2) {
      const op = `initial-workflow-${sha(JSON.stringify([flowId, requestId, permitId]))}`;
      const source = await readGitInitialWorkflowSource(root, op); sourceObservedBeforeWrite = source.ok && !fs.existsSync(path.join(root, "docs/workflow.md"));
    }
    response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id: "o10-source", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); const address = server.address(); assert.ok(address && typeof address !== "string");
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldSearch = process.env.ANS_CODEX_WEB_SEARCH, oldKey = process.env.ANS_O10_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_O10_LOCAL_KEY = "owned-local-only";
  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  try {
    handle = await openRoleSession({ roleId: "convener", runtime: "codex", project: trioProject(root, "convener"), taskId, autoRepin: false, stablePermitOf: rel => rel === "docs/workflow.md" ? activePermit : undefined,
      requestStableWrite: async request => {
        calls++; const created = await integration.services.stableWrite.request({ ...request, at }); assert.ok(created.ok); if (!created.ok) return { ok: false };
        const approved = await integration.services.stableWrite.approve(created.value.requestId, { decisionId: "actual-fixture-customer-execution", at }); assert.ok(approved.ok); if (!approved.ok) return { ok: false };
        requestId = created.value.requestId; permitId = approved.value.permit.permitId; activePermit = approved.value.permit;
        const installed = await refreshStableWritePermitSnapshot({ projectRoot: root });
        assert.ok(installed.some(permit => permit.permitId === activePermit!.permitId && permit.requestId === requestId), "Install only the actual joined Service permit through the production Pipeline");
        return { ok: true, requestId, status: "requested" };
      } }, { runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "o10-owned-chat", apiKeyEnvVar: "ANS_O10_LOCAL_KEY", persistSession: false, turnLastResortMs: 5000,
        versionedDocAfterWrite: async absolute => {
          writes++; const actualBytes = fs.readFileSync(absolute), actualSha256 = createHash("sha256").update(actualBytes).digest("hex");
          const complete = await integration.services.stableWrite.completeWrite({ requestId, actualSha256, at: new Date().toISOString() }); assert.ok(complete.ok, JSON.stringify(complete));
          assert.deepEqual(await refreshStableWritePermitSnapshot({ projectRoot: root }), [], "Actual consumed permit is removed from the Gate snapshot"); return true;
        } } });
    try { await handle.send("Request actual workflow approval"); }
    finally {
      if (process.env.ANS_O477_WORKFLOW_PROBE) {
        const relativeFiles = [".ans/state/tasks.jsonl", `.ans/runs/${runId}/manifest.json`];
        const captured = { at: new Date().toISOString(), root, taskId, runId, coreSessionId: handle.sessionId, calls, writes, requestId, permitId,
          toolReplies: bodies.flatMap(body => body.messages.filter(message => message.role === "tool").map(message => message.content)),
          files: relativeFiles.map(rel => { const bytes = fs.readFileSync(path.join(root, rel)); return { path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), value: bytes.toString("utf8") }; }) };
        fs.writeFileSync(process.env.ANS_O477_WORKFLOW_PROBE, JSON.stringify(captured, null, 2) + "\n");
      }
    }
    assert.equal(calls, 1, JSON.stringify({ purpose: "Host-source model fields are rejected before the callback", taskId, runId, coreSessionId: handle.sessionId, calls, writes,
      toolReplies: bodies.flatMap(body => body.messages.filter(message => message.role === "tool").map(message => message.content)) }));
    const operationId = `initial-workflow-${sha(JSON.stringify([flowId, requestId, permitId]))}`, actual = await readGitInitialWorkflowSource(root, operationId);
    assert.ok(actual.ok, JSON.stringify(actual)); if (!actual.ok) return;
    const source = JSON.parse(Buffer.from(actual.value.bytesBase64, "base64").toString("utf8"));
    assert.equal(source.coreSessionId, handle.sessionId); assert.equal(source.taskId, taskId); assert.equal(source.runId, runId); assert.equal(source.targetSha256, sha(content));
    assert.equal(source.authority.decisionId, "actual-fixture-customer-execution"); assert.deepEqual(source.documentSnapshot, JSON.parse(JSON.stringify(snap.value)));
    assert.equal(sourceObservedBeforeWrite, true); assert.equal(writes, 1, JSON.stringify(bodies)); assert.equal(fs.readFileSync(path.join(root, "docs/workflow.md"), "utf8"), content);
    assert.equal((await integration.services.stableWrite.list()).find(record => record.requestId === requestId)?.status, "written");
    assert.ok(bodies[1]?.messages.some(message => message.role === "tool" && String(message.content).includes("status=requested")));
  } finally {
    await handle?.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldSearch === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = oldSearch;
    if (oldKey === undefined) delete process.env.ANS_O10_LOCAL_KEY; else process.env.ANS_O10_LOCAL_KEY = oldKey;
  }
});

test("Pipeline failed open: actual Core preparation is revoked and error reference binds one host handle", async () => {
  await withRoot(async root => {
    const prior = { wire: process.env.ANS_CODEX_WIRE_API, search: process.env.ANS_CODEX_WEB_SEARCH, key: process.env.ANS_O12_LOCAL_KEY };
    process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_O12_LOCAL_KEY = "owned-local-only";
    const lease = beginGitHostAction({ projectRoot: root, kind: "authorization-change" }); assert.ok(lease.ok); if (!lease.ok) return;
    try {
      let actualError: unknown;
      await assert.rejects(openRoleSession({ roleId: "convener", runtime: "codex", autoRepin: false, project: trioProject(root, "convener") }, {
        runtimeOptions: { baseUrl: "http://127.0.0.1:1/v1", modelId: "o12-pure-plan", apiKeyEnvVar: "ANS_O12_LOCAL_KEY", persistSession: false },
      }), error => { actualError = error; return error instanceof Error && /git-host-coordinator-busy/.test(error.message); });
      const ref = await inspectRoleSessionOpenFailure({ error: actualError, hostHandleId: "actual-host-open-1" });
      assert.ok(ref, "Actual pure preparation must be sealed after admission fails before the factory"); if (!ref) return;
      const binding = { ref, hostHandleId: "actual-host-open-1", projectRoot: root, roleId: "convener", runtime: "codex" };
      assert.equal(recheckRoleSessionOpenFailure(binding)?.status, "never-started");
      assert.deepEqual(await inspectRoleSessionOpenFailure({ error: actualError, hostHandleId: "actual-host-open-1" }), ref);
      assert.equal(await inspectRoleSessionOpenFailure({ error: actualError, hostHandleId: "another-host-open" }), undefined);
      assert.equal(await inspectRoleSessionOpenFailure({ error: new Error(String(actualError)), hostHandleId: "actual-host-open-1" }), undefined);
      assert.equal(recheckRoleSessionOpenFailure({ ...binding, hostHandleId: "another-host-open" }), undefined);
      assert.equal(recheckRoleSessionOpenFailure({ ...binding, projectRoot: path.join(root, "different-root") }), undefined);
      assert.equal(recheckRoleSessionOpenFailure({ ...binding, roleId: "chief" }), undefined);
      assert.equal(recheckRoleSessionOpenFailure({ ...binding, runtime: "demo" }), undefined);
      assert.equal(recheckRoleSessionOpenFailure({ ...binding, ref: { ...ref, failureId: "invented" } }), undefined);
      const row = { hostHandleId: binding.hostHandleId, roleId: binding.roleId, runtime: binding.runtime, phase: "open-failed" as const,
        openFailureRef: ref, errors: ["partial-construction-closure-unproven"] };
      assert.equal(recheckRoleSessionOpenFailureInventory({ projectRoot: root, sessions: [row] })?.entries[0]?.status, "never-started");
      assert.equal(recheckRoleSessionOpenFailureInventory({ projectRoot: root, sessions: [row, { ...row }] }), undefined, "Duplicate host rows cannot replay one actual attempt");
      assert.equal(recheckRoleSessionOpenFailureInventory({ projectRoot: root, sessions: [row, { ...row, hostHandleId: "another-host-open" }] }), undefined, "One real Core failure cannot cover another controller");
      assert.equal(recheckRoleSessionOpenFailureInventory({ projectRoot: root, sessions: [{ ...row, openFailureRef: undefined }] }), undefined, "A failed state alone supplies no evidence");
      let customError: unknown;
      await assert.rejects(openRoleSession({ roleId: "convener", runtime: "codex", autoRepin: false, project: trioProject(root, "convener") }, {
        createAdapter: () => { fs.writeFileSync(path.join(root, "custom-effect-marker"), "actual custom effect"); throw new Error("custom factory entered"); },
      }), error => { customError = error; return error instanceof Error && error.message === "custom factory entered"; });
      assert.equal(fs.readFileSync(path.join(root, "custom-effect-marker"), "utf8"), "actual custom effect");
      assert.equal(await inspectRoleSessionOpenFailure({ error: customError, hostHandleId: "custom-host-open" }), undefined, "A throwing custom factory cannot become never-started");
    } finally {
      assert.ok(endGitHostAction({ projectRoot: root, leaseId: lease.leaseId }).ok);
      if (prior.wire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = prior.wire;
      if (prior.search === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = prior.search;
      if (prior.key === undefined) delete process.env.ANS_O12_LOCAL_KEY; else process.env.ANS_O12_LOCAL_KEY = prior.key;
    }
  });
});

test("Pipeline host-facts stages: actual required default Chat writes/edits and rejects host forgery, scope and stale Git topology", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-o17-stage-")), storage = createFsTrunkStore(root), at = new Date().toISOString();
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  writeFile(root, "docs/surface.txt", "Actual allocation");
  const captured = await storage.captureSnapshot!({ snapshotId: "o17-stage-allocation", createdAt: at, files: [{ path: "docs/surface.txt", sha256: sha("Actual allocation") }] });
  assert.ok(captured.ok); if (!captured.ok) return;
  const manifest: TrunkManifest = { schema: TRUNK_MANIFEST_SCHEMA, source: "bootstrap", flowId: "o17-stages", trunkVersion: 1, previous: null, runId: null,
    digest: sha("actual-o17-basis"), snapshotRef: captured.value, createdAt: at, updatedAt: at, artifacts: { documents: {}, execution: { teamPlan: null, flow: null }, boundaries: {} } };
  assert.ok((await storage.compareAndSwapManifest!(null, manifest, captured.value)).ok);
  await initializeGitRepository(root);
  assert.ok((await migrateLegacyTrunkToGit(root, { operationId: "o17-real-migration", expected: { version: 1, digest: manifest.digest } })).ok);
  const target = "docs/scheduling/o17-notes.md", results: string[] = [], config = path.join(root, ".git/config");
  const beforeConfig = fs.readFileSync(config, "utf8"); let calls = 0;
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); results.splice(0, results.length, ...body.messages.filter((m: {role: string}) => m.role === "tool").map((m: {content: unknown}) => String(m.content)));
    calls++;
    const tool = (id: string, name: string, args: unknown) => ({ id, type: "function", function: { name: `ans_${name}`, arguments: JSON.stringify(args) } });
    if (calls === 4) fs.appendFileSync(config, "\n"); // Actual host drift, outside the mediated product tool.
    const tools = calls === 1 ? [tool("write", "write_file", { path: target, content: "# Actual\nfirst 中文\n" })]
      : calls === 2 ? [tool("edit", "edit_file", { path: target, old_string: "first", new_string: "edited" })]
      : calls === 3 ? [tool("forged", "write_file", { path: target, content: "forged", stage: "final-write" }),
        tool("scope", "write_file", { path: "docs/product/outside.md", content: "outside" }),
        tool("git", "edit_file", { path: ".git/config", old_string: "[core]", new_string: "[unsafe]" }),
        tool("stable", "write_file", { path: "docs/workflow.md", content: "unapproved" })]
      : calls === 4 ? [tool("drift", "write_file", { path: target, content: "stale-basis" })] : undefined;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "o17-owned", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: tools ? { role: "assistant", tool_calls: tools } : { role: "assistant", content: "Actual staged results observed" } }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const old = { wire: process.env.ANS_CODEX_WIRE_API, search: process.env.ANS_CODEX_WEB_SEARCH, key: process.env.ANS_O17_LOCAL_KEY };
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_O17_LOCAL_KEY = "local-only";
  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  try {
    handle = await openRoleSession({ roleId: "convener", runtime: "codex", project: trioProject(root, "convener"), autoRepin: false }, {
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "o17-local", apiKeyEnvVar: "ANS_O17_LOCAL_KEY", persistSession: false, turnLastResortMs: 5000 } });
    assert.equal(handle.inspectToolSurface!().factoryProvenance, "default-production");
    await handle.send("Run the exact staged write/edit checks");
    assert.equal(calls, 5, JSON.stringify(results));
    assert.equal(fs.readFileSync(path.join(root, target), "utf8"), "# Actual\nedited 中文\n", JSON.stringify(results));
    assert.equal(fs.existsSync(path.join(root, "docs/product/outside.md")), false);
    assert.equal(fs.existsSync(path.join(root, "docs/workflow.md")), false);
    assert.equal(fs.readFileSync(config, "utf8"), beforeConfig + "\n");
    assert.match(results.at(-1) ?? "", /file-gate-host-facts-unproven/);
    assert.ok(results.some(result => /host|宿主|stage/.test(result)), JSON.stringify(results));
    assert.ok(results.some(result => /stable|许可/.test(result)), JSON.stringify(results));
  } finally {
    await handle?.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (old.wire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = old.wire;
    if (old.search === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = old.search;
    if (old.key === undefined) delete process.env.ANS_O17_LOCAL_KEY; else process.env.ANS_O17_LOCAL_KEY = old.key;
  }
});

test("Hub NoGit stage facts: actual default Chat writes a legal product draft and rejects a late Git association", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-hub-nogit-write-")), at = new Date().toISOString();
  assert.ok((await createVersionChangeStack({ projectRoot: root }).ensureInitialized()).ok);
  const service = createTrunkService({ projectRoot: root });
  const prepared = await service.prepareRoleDispatch({ fromRoleId: "chief", targetRoleId: "product", flowId: "demo", hubRouting: "chief-hub-v1", hostInitialization: {
    registration: { source: "native-directory-selection", selectionId: "unit-stage-registration", selectedRoot: root, projectRoot: root, selectedAt: at, listingGeneration: 1 },
    parent: { roleId: "chief", runtime: "codex", sessionId: "unit-stage-upstream", turnId: "unit-stage-turn", inputAccepted: true, settled: false, kind: "message" },
  } });
  assert.ok(prepared.ok, JSON.stringify(prepared)); if (!prepared.ok) return;
  const ref = prepared.value.initializationSource, runId = prepared.value.runId; assert.ok(ref && runId); if (!ref || !runId) return;
  const taskId = "hub-nogit-product";
  assert.ok((await recordTaskObservation({ projectRoot: root, event: { v: 1, at, kind: "task.created", taskId, from: "chief", to: "product", text: "Prepare the product intent draft",
    flowId: "demo", runId, runState: "draft", sideEffect: "docs", idempotencyKey: taskId, hubRouting: "chief-hub-v1",
    workSourceRef: { kind: "chief-customer-turn", sourceId: ref.sourceId, path: ref.path, sha256: ref.sha256 } } })).ok);
  const target = "docs/product/demo-intent-v1.md", content = "---\nschema: project-intent/v1\nflowId: demo\nversion: 1\n---\nActual unapproved draft.\n";
  let calls = 0; const receipts: string[] = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); receipts.push(...body.messages.filter((message: { role: string }) => message.role === "tool").map((message: { content: unknown }) => String(message.content)));
    calls++; if (calls === 2) fs.mkdirSync(path.join(root, ".git"));
    const tool = calls <= 2 ? [{ id: `hub-write-${calls}`, type: "function", function: { name: "ans_write_file", arguments: JSON.stringify({ path: target, content: calls === 1 ? content : "stale-root-write" }) } }] : undefined;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "hub-nogit", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: tool ? { role: "assistant", tool_calls: tool } : { role: "assistant", content: "Draft and drift facts observed" } }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const old = { wire: process.env.ANS_CODEX_WIRE_API, search: process.env.ANS_CODEX_WEB_SEARCH, key: process.env.ANS_O43_LOCAL_KEY };
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_O43_LOCAL_KEY = "local-only";
  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  try {
    handle = await openRoleSession({ roleId: "product", project: trioProject(root, "product"), runtime: "codex", taskId, autoRepin: false }, {
      runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "hub-nogit-local", apiKeyEnvVar: "ANS_O43_LOCAL_KEY", persistSession: false, turnLastResortMs: 5000 } });
    assert.equal(handle.inspectToolSurface!().factoryProvenance, "default-production");
    await handle.send("Write the legitimate owned draft, then observe a late topology change");
    assert.equal(calls, 3, JSON.stringify(receipts)); assert.equal(fs.existsSync(path.join(root, target)) ? fs.readFileSync(path.join(root, target), "utf8") : undefined, content, JSON.stringify(receipts));
    assert.ok(receipts.some(receipt => /write_file 已获准并落盘/.test(receipt)), JSON.stringify(receipts));
    assert.ok(receipts.some(receipt => /file-gate-host-facts-unproven/.test(receipt)), JSON.stringify(receipts));
  } finally {
    await handle?.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (old.wire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = old.wire;
    if (old.search === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = old.search;
    if (old.key === undefined) delete process.env.ANS_O43_LOCAL_KEY; else process.env.ANS_O43_LOCAL_KEY = old.key;
  }
});

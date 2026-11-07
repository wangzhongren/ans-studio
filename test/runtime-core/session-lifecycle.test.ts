import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRuntimeAdapter, inspectRuntimeCoreRegistry, inspectRuntimeConstructionFailure, recheckRuntimeConstructionFailure, discardRuntimeRolePreparation, type RuntimeSessionOptions } from "../../src/service/runtime/session.ts";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { runtimeSessionDirectory } from "../../src/provider/runtime/session-store.ts";
import { beginGitHostAction, endGitHostAction } from "../../src/provider/trunk/public/trunk-store.ts";
import { createDemoRuntimeAdapter, loadBuiltinChiefWorkflow } from "../../src/provider/runtime/tools.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import type { RoleSession, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, RuntimeNativeLifecycle, RuntimeNativeLifecycleFacts, ChiefDecisionExecutionContext } from "../../src/model/runtime.ts";
import { isRuntimeNativeLifecycleFacts } from "../../src/model/runtime.ts";
import { allow, role, until, registerControlledDisplayProfile } from "./fixtures.ts";

test("R29 Core forwards only its validated cloned Chief decision context; ordinary and judge providers receive no field", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r29-host-port-"));
  const context: ChiefDecisionExecutionContext = { roleId: "chief", executionId: "r29-owned", mode: "bounded-decision", productionWriteAuthority: false,
    tools: ["decide_pending_request"], limits: { maxTurns: 1, timeoutMs: 1000, maxAttempts: 1 },
    request: { requestId: "actual-request", baseDigest: "a".repeat(64), delegationRevision: 1, originRoleId: "convener", cardKind: "decision",
      question: "actual bounded choice", options: [{ id: "one", label: "one" }], evidenceRefs: [] } };
  const seen: RuntimeProviderOptions[] = [];
  const factory: RuntimeProviderFactory = options => { seen.push(options); return createDemoRuntimeAdapter(options); };
  const base: RuntimeSessionOptions = { runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, providerFactories: { demo: factory } };
  await createRuntimeAdapter(base).composeContext(role("worker")); assert.equal(Object.hasOwn(seen[0]!, "chiefDecisionContext"), false);
  const narrow = createRuntimeAdapter({ ...base, chiefDecisionContext: context,
    decidePendingRequest: async input => ({ ok: false, requestId: input.requestId, status: "pending", errorCode: "not-invoked", message: "not called" }) });
  await narrow.composeContext(role("chief")); const passed = seen[1]!.chiefDecisionContext;
  assert.deepEqual(passed, context); assert.notEqual(passed, context); assert.notEqual(passed!.request, context.request);
  assert.equal(passed!.productionWriteAuthority, false); assert.deepEqual(seen[1]!.tools.map(tool => tool.name), ["decide_pending_request"]);
  const stats = () => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });
  await createRuntimeAdapter({ ...base, shellJudge: { projectRoot: root, report() {}, stats: stats() } }).composeContext(role("shell-judge"));
  await createRuntimeAdapter({ ...base, governanceJudge: { projectRoot: root, report() {}, stats: stats() } }).composeContext(role("governance-judge"));
  for (const options of seen.slice(2)) { assert.equal(Object.hasOwn(options, "chiefDecisionContext"), false); assert.equal(options.judgeMode, true); }
});

test("R28 real Node loads the full single-source Chief resource by application URL from an unrelated cwd", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r28-unrelated-cwd-"));
  const source = new URL("../../src/common/门禁引擎/workflows/chief/chief-workflow.md", import.meta.url), original = await readFile(source);
  const script = `const m=await import(${JSON.stringify(new URL("../../src/provider/runtime/tools.ts", import.meta.url).href)});process.stdout.write(JSON.stringify(await m.loadBuiltinChiefWorkflow()));`;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { cwd: root, maxBuffer: 1024 * 1024 });
  const loaded = JSON.parse(stdout) as Awaited<ReturnType<typeof loadBuiltinChiefWorkflow>>;
  assert.deepEqual(Buffer.from(loaded.text, "utf8"), original); assert.equal(loaded.sha256, createHash("sha256").update(original).digest("hex"));
  assert.equal(loaded.bytes, original.length); assert.equal(loaded.sourceUrl, source.href); assert.equal(loaded.version, "chief-workflow/v1");
  const packageVersion = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")).version;
  assert.equal(loaded.applicationVersion, packageVersion); assert.notEqual(loaded.applicationVersion, loaded.version);
  t.diagnostic(JSON.stringify({ actualNode: process.version, cwd: root, sourceUrl: loaded.sourceUrl, sha256: loaded.sha256, bytes: loaded.bytes, resourceVersion: loaded.version, applicationVersion: loaded.applicationVersion }));
});

test("R28/R30 actual default runtime contexts isolate ordinary Chief workflow, bounded Chief and ordinary judges", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-r28-context-")), loaded = await loadBuiltinChiefWorkflow();
  const chief = { ...role("chief"), kind: "built-in-governance" as const, governanceFunction: "chief" as const };
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_R28_LOCAL_KEY"].map(key => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_R28_LOCAL_KEY = "no-model-called";
  try {
    for (const runtime of ["pi", "claude", "codex"] as const) {
      const adapter = createRuntimeAdapter({ runtime, gate: allow, projectRoot: root, skillRoot: root, contextSections: ["original matrix context"],
        baseUrl: "http://127.0.0.1:9/v1", modelId: "r28-context-only", apiKeyEnvVar: "ANS_R28_LOCAL_KEY" });
      const context = await adapter.composeContext(chief);
      assert.ok(context.systemPrompt.includes(loaded.text), `${runtime}: complete original resource`); assert.match(context.systemPrompt, /original matrix context/);
      assert.ok(context.systemPrompt.includes(loaded.sha256)); assert.ok(context.systemPrompt.includes(loaded.sourceUrl)); assert.ok(context.systemPrompt.includes(loaded.version));
      const other = await adapter.composeContext(role("worker")); assert.equal(other.systemPrompt.includes(loaded.text), false); assert.match(other.systemPrompt, /original matrix context/);
      const projectChief = await adapter.composeContext(role("chief")); assert.equal(projectChief.systemPrompt.includes(loaded.text), false, "role name alone cannot select the builtin resource");
    }
    const decision: ChiefDecisionExecutionContext = { roleId: "chief", executionId: "r28-bounded", mode: "bounded-decision", productionWriteAuthority: false,
      tools: ["decide_pending_request"], limits: { maxTurns: 1, timeoutMs: 1000, maxAttempts: 1 },
      request: { requestId: "request-owned", baseDigest: "a".repeat(64), delegationRevision: 0, originRoleId: "convener", cardKind: "decision", question: "bounded choice", options: [{ id: "one", label: "one" }], evidenceRefs: [] } };
    const narrowOptions: RuntimeSessionOptions = { runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, chiefDecisionContext: decision,
      decidePendingRequest: async () => ({ ok: false, requestId: "request-owned", status: "pending", errorCode: "test-not-called", message: "not invoked" }),
      baseUrl: "http://127.0.0.1:9/v1", modelId: "r30-context-only", apiKeyEnvVar: "ANS_R28_LOCAL_KEY" };
    const narrow = createRuntimeAdapter(narrowOptions);
    // R28's original default rejection remains in its historical log. N5 now provides the actual production branch.
    const prepared = await narrow.prepareRole!(chief); assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    assert.deepEqual(prepared.plan.native?.appTools, ["decide_pending_request"]);
    const context = await narrow.composeContext(chief);
    assert.equal(context.systemPrompt.includes(loaded.text), false); assert.match(context.systemPrompt, /独立有界决策会话/);
    assert.ok(context.systemPrompt.includes(decision.request.requestId)); assert.ok(context.systemPrompt.includes(decision.request.question));
    const session = await narrow.bindPreparedRole!(prepared.token!);
    try {
      const surface = session.inspectToolSurface!(); assert.equal(surface.factoryProvenance, "default-production");
      assert.deepEqual(surface.appTools, ["decide_pending_request"]); assert.deepEqual(surface.configuredForeignMcpServers, []);
      assert.deepEqual(surface.native?.appTools, ["decide_pending_request"]);
    } finally { await session.dispose(); }
    await assert.rejects(narrow.composeContext(role("worker")), /requires trusted chief role/);
    await assert.rejects(narrow.composeContext(role("chief")), /real built-in Chief role/);
    const stats = () => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });
    for (const mode of ["shell", "governance"] as const) {
      const judge = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
        baseUrl: "http://127.0.0.1:9/v1", modelId: "r30-context-only", apiKeyEnvVar: "ANS_R28_LOCAL_KEY",
        ...(mode === "shell" ? { shellJudge: { projectRoot: root, report() {}, stats: stats() } } : { governanceJudge: { projectRoot: root, report() {}, stats: stats() } }) });
      const actor = role(`actual-${mode}-judge`), plan = await judge.prepareRole!(actor), context = await judge.composeContext(actor);
      assert.match(context.systemPrompt, /只读判断会话/); assert.equal(context.systemPrompt.includes(loaded.text), false);
      assert.deepEqual([...(plan.plan.native?.appTools ?? [])].sort(), ["judge_list_dir", "judge_read_file", mode === "shell" ? "report_shell_judgement" : "report_governance_judgement"].sort());
      assert.equal(plan.plan.native?.appTools.includes("decide_pending_request"), false);
    }
    t.diagnostic("actual default Pi/Claude/Codex ordinary contexts; default Codex bounded Chief compose/prepare/bind with exact one tool and no workflow/MCP; non-Chief rejected; ordinary judge sets remain exact three");
  } finally { for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test("R28 missing or corrupt resource fails before Chief factory creation and never falls back to project card text", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r28-bad-resource-")), chief = { ...role("chief"), kind: "built-in-governance" as const, governanceFunction: "chief" as const };
  const source = new URL("../../src/common/门禁引擎/workflows/chief/chief-workflow.md", import.meta.url).href;
  const fs = createRequire(import.meta.url)("node:fs/promises") as typeof import("node:fs/promises"), original = fs.readFile;
  let mode: "missing" | "corrupt" | "bad-version" = "missing", factories = 0;
  fs.readFile = (async (...args: Parameters<typeof original>) => {
    if (String(args[0]) === source) {
      if (mode === "missing") throw Object.assign(new Error("owned ENOENT"), { code: "ENOENT" });
      return mode === "corrupt" ? Buffer.from([0xff, 0xfe]) : Buffer.from("# Chief 工作流\n\n资源版本：not-a-version\n");
    }
    return original(...args);
  }) as typeof original; syncBuiltinESMExports();
  try {
    for (const next of ["missing", "corrupt", "bad-version"] as const) {
      mode = next;
      const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root,
        providerFactories: { demo: options => { factories++; return createDemoRuntimeAdapter(options); } } });
      await assert.rejects(adapter.composeContext(chief), /chief-workflow-resource-unavailable/); assert.equal(factories, 0);
      await adapter.composeContext(role("worker")); assert.equal(factories, 1); factories = 0;
    }
  } finally { fs.readFile = original; syncBuiltinESMExports(); }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function controlled(input: { settled?: boolean; closeStream?: boolean; work?: (options: RuntimeProviderOptions) => Promise<void>; nativeLifecycle?: (options: RuntimeProviderOptions) => RuntimeNativeLifecycle } = {}) {
  const release = deferred();
  let started = false, aborts = 0;
  const queue = createEventQueue<SessionEvent>();
  const factory: RuntimeProviderFactory = options => ({
    async composeContext() { return { systemPrompt: "lifecycle fixture" }; },
    async bindRole() {
      registerControlledDisplayProfile(options);
      return { ...(input.nativeLifecycle ? { nativeLifecycle: input.nativeLifecycle(options) } : {}), async prompt() {
        started = true;
        if (input.work) await input.work(options); else await release.promise;
        if (input.settled !== false) queue.push({ kind: "settled", summary: "actual provider terminal", detail: { outcome: "completed" } });
        if (input.closeStream) queue.close();
      }, events: () => queue.stream, async abort() { aborts++; }, async dispose() { release.resolve(); queue.close(); } };
    },
  });
  return { factory, release: release.resolve, get started() { return started; }, get aborts() { return aborts; } };
}
const lifecycleTempParent = realpathSync(tmpdir());
const lifecycleRoots: string[] = [];
after(() => {
  for (const root of lifecycleRoots) {
    assert.equal(dirname(root), lifecycleTempParent, "only remove this fixture's owned temporary directory");
    rmSync(root, { recursive: true, force: true });
    assert.equal(existsSync(root), false);
  }
});
const base = (): Pick<RuntimeSessionOptions, "runtime" | "gate" | "projectRoot" | "skillRoot"> => {
  const root = mkdtempSync(join(lifecycleTempParent, "ans-lifecycle-owned-"));
  lifecycleRoots.push(root);
  assert.equal(realpathSync(root), root);
  for (let ancestor = root; ; ancestor = dirname(ancestor)) {
    assert.equal(lstatSync(ancestor).isSymbolicLink(), false, `fixture ancestor must not be a link: ${ancestor}`);
    assert.equal(existsSync(join(ancestor, ".git")), false, `fixture must not inherit a Git association: ${ancestor}`);
    if (dirname(ancestor) === ancestor) break;
  }
  return { runtime: "demo", gate: allow, projectRoot: root, skillRoot: root };
};
const stop = (session: RoleSession, timeoutMs = 60) => session.stopAndInspect!({ expectedSessionId: session.sessionId!, expectedTurnId: session.inspectLifecycle!().turnId, timeoutMs });

async function r17DefaultChat(run: (fixture: { root: string; baseUrl: string; received: ReturnType<typeof deferred>; release: ReturnType<typeof deferred>; counts: { http: number; native: number } }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ans-r17-chat-")), received = deferred(), release = deferred(), counts = { http: 0, native: 0 };
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* actual local inference only */ } counts.http++; received.resolve(); await release.promise;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "r17-local", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "actual terminal" } }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_R17_LOCAL_KEY"].map(name => [name, process.env[name]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_R17_LOCAL_KEY = "owned-local-only";
  const crypto = createRequire(import.meta.url)("node:crypto") as typeof import("node:crypto"), originalUUID = crypto.randomUUID;
  crypto.randomUUID = ((...args: Parameters<typeof originalUUID>) => { if (new Error().stack?.includes("createCodexChatSession")) counts.native++; return originalUUID(...args); }) as typeof originalUUID;
  syncBuiltinESMExports();
  try { await run({ root, baseUrl: `http://127.0.0.1:${address.port}/v1`, received, release, counts }); }
  finally { release.resolve(); crypto.randomUUID = originalUUID; syncBuiltinESMExports(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const [name, value] of previous) if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}

test("R17 a real busy default Chat may finish Core drain after disposal and must refresh its retained terminal evidence", async () => {
  await r17DefaultChat(async fixture => {
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: fixture.root, skillRoot: fixture.root, persistSession: true,
      baseUrl: fixture.baseUrl, apiKeyEnvVar: "ANS_R17_LOCAL_KEY", modelId: "r17-busy", turnLastResortMs: 5000 });
    const prepared = await adapter.prepareRole!(role("r17-busy-chief")); assert.equal(prepared.plan.status, "observed");
    const session = await adapter.bindPreparedRole!(prepared.token!); const prompt = session.prompt("real busy disposal").catch(error => error);
    try {
      await fixture.received.promise; assert.equal(session.inspectLifecycle!().providerFinished, false);
      await session.abort?.(); await session.dispose(); await prompt;
      assert.equal(fixture.counts.native, 1); assert.equal(fixture.counts.http, 1);
      await until(() => inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === session.sessionId)!.lifecycle?.status === "quiescent", 1000);
      const retained = session.inspectLifecycle!(), entry = inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === session.sessionId)!;
      assert.equal(retained.status, "quiescent"); assert.equal(retained.providerFinished, true); assert.equal(retained.processCoverage, "complete");
      assert.ok(retained.settledAt); assert.equal(retained.native!.status, "quiescent"); assert.deepEqual(entry.lifecycle, retained);
      assert.equal(entry.state, "disposed"); assert.equal(retained.reasons.includes("core-turn-not-drained"), false);
    } finally { fixture.release.resolve(); await prompt; await session.dispose(); }
  });
});

test("R17 genuine pure context preparation and a pre-native read failure have private never-started evidence", async () => {
  await r17DefaultChat(async fixture => {
    const actor = role("r17-context-only"), options: RuntimeSessionOptions = { runtime: "codex", gate: allow,
      projectRoot: fixture.root, skillRoot: fixture.root, baseUrl: fixture.baseUrl, apiKeyEnvVar: "ANS_R17_LOCAL_KEY", modelId: "r17-context" };
    const adapter = createRuntimeAdapter(options), plan = await adapter.prepareRole!(actor); assert.equal(plan.plan.status, "observed");
    await adapter.composeContext(actor); assert.equal(fixture.counts.native, 0); assert.equal(fixture.counts.http, 0);
    assert.notEqual(inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === actor.id)!.construction?.status, "never-started", "unused live token is not retired evidence");
    const failure = new Error("owned context-only retirement"), ref = discardRuntimeRolePreparation(plan, failure);
    assert.ok(ref); assert.deepEqual(inspectRuntimeConstructionFailure(failure), ref);
    assert.equal(discardRuntimeRolePreparation({ ...plan }, new Error("forged copy")), undefined);
    await assert.rejects(adapter.bindPreparedRole!(plan.token!), /configuration-changed|revoked/);
    const entry = inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === actor.id)! as unknown as {
      construction?: { source: string; status: string; nativeBindEntered: boolean; pendingContinuations: number };
    };
    assert.equal(entry.construction?.source, "core-construction-boundaries"); assert.equal(entry.construction?.status, "never-started");
    assert.equal(entry.construction?.nativeBindEntered, false); assert.equal(entry.construction?.pendingContinuations, 0);
    assert.equal(recheckRuntimeConstructionFailure(ref!)!.status, "never-started");
    const lease = beginGitHostAction({ projectRoot: fixture.root, kind: "git-mutation" }); assert.equal(lease.ok, true);
    if (!lease.ok) throw new Error("owned lease unavailable");
    try { await assert.rejects(adapter.bindRole(actor), /coordinator-busy/); assert.equal(fixture.counts.native, 0); }
    finally { endGitHostAction({ projectRoot: fixture.root, leaseId: lease.leaseId }); }
    const brokenActor = role("r17-pre-native-failure"), broken = createRuntimeAdapter({ ...options, persistSession: true });
    const brokenPlan = await broken.prepareRole!(brokenActor); assert.ok(brokenPlan.token);
    const ansDir = join(runtimeSessionDirectory({ projectRoot: fixture.root, roleId: brokenActor.id, runtime: "codex" }), "ans");
    await mkdir(ansDir, { recursive: true }); await writeFile(join(ansDir, "index.json"), "invalid-json-owned-fixture");
    let actualError: unknown;
    await assert.rejects(broken.bindPreparedRole!(brokenPlan.token!).catch(error => { actualError = error; throw error; }));
    const failed = inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === brokenActor.id)! as unknown as { state: string; construction?: { status: string; pendingContinuations: number } };
    assert.equal(failed.state, "failed"); assert.equal(failed.construction?.status, "never-started");
    assert.equal(failed.construction?.pendingContinuations, 0); assert.equal(fixture.counts.native, 0);
    assert.equal(recheckRuntimeConstructionFailure(inspectRuntimeConstructionFailure(actualError)!)!.status, "never-started");
  });
});

test("R17 a custom factory with an actual effect stays possibly-started regardless of fake construction facts", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r17-effectful-")), marker = join(root, "actual-factory-effect.txt");
  const options = { runtime: "demo", gate: allow, projectRoot: root, skillRoot: root,
    construction: { status: "never-started", safe: true }, providerFactories: { demo: async () => { await writeFile(marker, "actual effect"); throw new Error("owned factory failed after effect"); } },
  } as RuntimeSessionOptions;
  await assert.rejects(createRuntimeAdapter(options).bindRole(role("r17-effectful-custom")), /failed after effect/);
  assert.equal(await readFile(marker, "utf8"), "actual effect");
  const entry = inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === "r17-effectful-custom")! as unknown as { construction?: { status: string; factoryEntered: boolean } };
  assert.equal(entry.construction?.status, "possibly-started"); assert.equal(entry.construction?.factoryEntered, true);
});

test("R17 timed-out custom construction keeps its real pending continuation and late effect unknown", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r17-late-")), marker = join(root, "late-owned-effect.txt"), release = deferred(), entered = deferred(), finished = deferred();
  const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, constructTimeoutMs: 20,
    providerFactories: { demo: async options => { entered.resolve(); await release.promise;
      try { await writeFile(marker, "late actual effect"); return createDemoRuntimeAdapter(options); } finally { finished.resolve(); } } } });
  const binding = adapter.bindRole(role("r17-late-custom"));
  try {
    await entered.promise; await assert.rejects(binding, /超时/);
    const pending = inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === "r17-late-custom")! as unknown as { construction?: { status: string; pendingContinuations: number } };
    assert.equal(pending.construction?.status, "possibly-started"); assert.ok(pending.construction!.pendingContinuations > 0);
    release.resolve(); await finished.promise;
    await until(() => (inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === "r17-late-custom")! as unknown as { construction?: { pendingContinuations: number } }).construction?.pendingContinuations === 0);
    const late = inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === "r17-late-custom")! as unknown as { construction?: { status: string } };
    assert.equal(late.construction?.status, "possibly-started"); assert.equal(await readFile(marker, "utf8"), "late actual effect");
  } finally { release.resolve(); await finished.promise; await binding.catch(() => undefined); }
});

test("R13 actual default Chat keeps HTTP coverage separate from drain and retains real terminal evidence across disposal", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-r13-default-chat-")), received = deferred(), release = deferred();
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* real local HTTP inference request, no external model */ }
    received.resolve(); await release.promise;
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: "owned-r13", object: "chat.completion", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "actual local terminal" } }] }));
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.ANS_R13_LOCAL_KEY, oldSearch = process.env.ANS_CODEX_WEB_SEARCH;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_R13_LOCAL_KEY = "owned-r13-local-only-key"; process.env.ANS_CODEX_WEB_SEARCH = "off";
  let session: RoleSession | undefined, prompt: Promise<unknown> | undefined;
  try {
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
      baseUrl: `http://127.0.0.1:${address.port}/v1`, modelId: "owned-r13-chat", apiKeyEnvVar: "ANS_R13_LOCAL_KEY" });
    const prepared = await adapter.prepareRole!(role("chief")); assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    session = await adapter.bindPreparedRole!(prepared.token!); prompt = session.prompt("local inference only");
    await received.promise;
    const busy = session.inspectLifecycle!();
    assert.equal(busy.native!.processCoverage, "complete"); assert.deepEqual(busy.processes, []);
    assert.equal(busy.processCoverage, "complete", "actual HTTP activity is not unknown owned-process coverage");
    assert.notEqual(busy.status, "quiescent"); assert.equal(busy.providerFinished, false); assert.equal(busy.settledAt, undefined);
    release.resolve(); await prompt;
    await until(() => session!.inspectLifecycle!().status === "quiescent");
    const before = session.inspectLifecycle!(); assert.ok(before.settledAt);
    await session.abort?.(); await session.dispose();
    const retained = session.inspectLifecycle!(), registered = inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === session!.sessionId)!;
    assert.equal(retained.status, "quiescent"); assert.equal(retained.processCoverage, "complete"); assert.equal(retained.providerFinished, true);
    assert.equal(retained.sessionId, before.sessionId); assert.equal(retained.turnId, before.turnId); assert.equal(retained.settledAt, before.settledAt);
    assert.equal(retained.native!.instanceId, before.native!.instanceId); assert.deepEqual(retained.activeTools, []); assert.deepEqual(retained.processes, []);
    assert.deepEqual(registered.lifecycle, retained); assert.equal(registered.state, "disposed");
    assert.equal((await stop(session)).status, "quiescent");
    (retained.reasons as string[]).push("changed-copy"); assert.equal(session.inspectLifecycle!().reasons.includes("changed-copy"), false);
    await assert.rejects(session.prompt("disposed cannot restart"), /关闭/);
  } finally {
    release.resolve(); await prompt?.catch(() => undefined); await session?.dispose();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldKey === undefined) delete process.env.ANS_R13_LOCAL_KEY; else process.env.ANS_R13_LOCAL_KEY = oldKey;
    if (oldSearch === undefined) delete process.env.ANS_CODEX_WEB_SEARCH; else process.env.ANS_CODEX_WEB_SEARCH = oldSearch;
  }
});

test("R13 disposal cannot promote missing raw settlement, missing native evidence, identity drift or a live owned process", async () => {
  for (const scenario of ["missing-raw", "missing-native", "wrong-instance", "running-process", "custom-without-process-proof"] as const) {
    let nativeFacts!: RuntimeNativeLifecycleFacts;
    const fixture = controlled({ settled: scenario !== "missing-raw", closeStream: scenario === "missing-raw",
      ...(scenario === "wrong-instance" || scenario === "running-process" ? { nativeLifecycle: () => ({ instanceId: "r13-bound-native",
        inspect: () => nativeFacts, async stopAndInspect() { return nativeFacts; } }) } : {}),
      work: async options => { nativeFacts = { instanceId: scenario === "wrong-instance" ? "r13-other-native" : "r13-bound-native",
        roleId: "worker", runtime: "claude", coreTurnId: options.currentTurnId(), status: "quiescent", promptState: "settled",
        observedAt: new Date().toISOString(), settledAt: new Date().toISOString(), transport: { kind: "http", state: "idle" }, activeTools: [],
        processes: scenario === "running-process" ? [{ id: "r13-owned-still-running", kind: "native", state: "running", treeStatus: "verified" }] : [],
        processCoverage: "complete", reasons: [] }; },
    });
    const runtime = scenario === "missing-raw" || scenario === "custom-without-process-proof" ? "demo" as const : "claude" as const;
    const session = await createRuntimeAdapter({ ...base(), runtime, providerFactories: { [runtime]: fixture.factory } }).bindRole(role("worker"));
    await session.prompt("owned disposal-negative fixture");
    if (scenario === "custom-without-process-proof") assert.equal(session.inspectLifecycle!().status, "quiescent");
    else assert.notEqual(session.inspectLifecycle!().status, "quiescent");
    await session.dispose();
    const receipt = session.inspectLifecycle!(), registry = inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === session.sessionId)!;
    assert.equal(receipt.status, "unknown", scenario); assert.deepEqual(registry.lifecycle, receipt);
    assert.ok(receipt.reasons.includes("disposed-lifecycle-evidence-unavailable"));
    if (scenario === "missing-raw") assert.equal(receipt.settledAt, undefined);
    if (scenario === "missing-native" || scenario === "wrong-instance") assert.equal(receipt.processCoverage, "unknown");
    if (scenario === "custom-without-process-proof") { assert.equal(receipt.processCoverage, "unknown"); assert.ok(receipt.reasons.includes("custom-provider-disposal-coverage-unverified")); }
    if (scenario === "running-process") assert.ok(receipt.processes.some(process => process.id === "r13-owned-still-running" && process.state === "running"));
    assert.equal((await stop(session)).status, "unknown");
  }
});

test("R13 a still-running real injected capability remains in the disposed receipt", async () => {
  const capability = deferred(); let invoked = false;
  const fixture = controlled({ work: async options => {
    const tool = options.tools.find(tool => tool.name === "submit_refactor")!;
    await tool.handler({ name: tool.name, args: { flowId: "r13-flow", title: "owned", reason: "owned", scope: { modules: [], paths: [], roles: [] } } });
  } });
  const session = await createRuntimeAdapter({ ...base(), providerFactories: { demo: fixture.factory },
    submitRefactor: async () => { invoked = true; await capability.promise; return { ok: true, requestId: "r13-refactor", status: "requested" }; },
  }).bindRole(role("convener"));
  const prompt = session.prompt("owned in-flight capability").catch(error => error);
  try {
    await until(() => invoked); await session.dispose();
    const receipt = session.inspectLifecycle!(); assert.equal(receipt.status, "unknown");
    assert.ok(receipt.activeTools.some(tool => tool.name === "capability:submitRefactor"));
    assert.equal(inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === session.sessionId)!.lifecycle!.status, "unknown");
  } finally { capability.resolve(); fixture.release(); await prompt; await session.dispose(); }
});

test("abort request without actual provider completion/settled cannot prove stop; late real completion can", async () => {
  const fixture = controlled();
  const session = await createRuntimeAdapter({ ...base(), providerFactories: { demo: fixture.factory } }).bindRole(role("worker"));
  const prompt = session.prompt("work").catch(error => error);
  try {
    await until(() => fixture.started);
    const wrong = await session.stopAndInspect!({ expectedSessionId: "other-session", timeoutMs: 10 });
    assert.equal(wrong.status, "unknown"); assert.equal(wrong.stopRequested, false); assert.equal(fixture.aborts, 0);
    const facts = await stop(session);
    assert.equal(facts.status, "unknown"); assert.equal(facts.providerFinished, false);
    assert.equal(facts.settledAt, undefined); assert.equal(fixture.aborts, 1);
    assert.ok(facts.reasons.includes("stop-drain-budget-exhausted"));
    fixture.release(); await prompt;
    await until(() => session.inspectLifecycle!().status === "quiescent");
    const drained = await stop(session);
    assert.equal(drained.status, "quiescent"); assert.equal(drained.providerFinished, true);
    assert.equal(drained.settledTurnId, drained.turnId); assert.ok(drained.settledAt);
    await assert.rejects(session.prompt("must stay sealed"), /封闭停止/);
  } finally { fixture.release(); await prompt; await session.dispose(); }
});

test("stream end/Core synthetic settled and disposed empty lists never substitute real provider settled", async () => {
  const fixture = controlled({ settled: false, closeStream: true });
  const session = await createRuntimeAdapter({ ...base(), providerFactories: { demo: fixture.factory } }).bindRole(role("worker"));
  const prompt = session.prompt("work"); fixture.release(); await prompt;
  const facts = await stop(session, 20);
  assert.equal(facts.status, "unknown"); assert.equal(facts.providerFinished, true);
  assert.equal(facts.settledAt, undefined); assert.ok(facts.reasons.includes("real-provider-settled-not-observed"));
  await session.dispose();
  const disposed = await stop(session, 10);
  assert.equal(disposed.status, "unknown"); assert.ok(disposed.reasons.includes("disposed-lifecycle-evidence-unavailable"));
});

test("a raced tool handler does not hide its still-running injected capability", async () => {
  const capability = deferred(); let invoked = false;
  const fixture = controlled({ work: async options => {
    const tool = options.tools.find(tool => tool.name === "submit_refactor")!;
    await tool.handler({ name: tool.name, args: { flowId: "flow-stop", title: "fixture", reason: "fixture", scope: { modules: [], paths: [], roles: [] } } });
  } });
  const session = await createRuntimeAdapter({ ...base(), providerFactories: { demo: fixture.factory },
    submitRefactor: async () => { invoked = true; await capability.promise; return { ok: true, requestId: "rf-1", status: "requested" }; },
  }).bindRole(role("convener"));
  const prompt = session.prompt("work").catch(error => error);
  try {
    await until(() => invoked);
    const facts = await stop(session, 40);
    assert.equal(facts.status, "unknown");
    assert.ok(facts.activeTools.some(tool => tool.name === "capability:submitRefactor"));
    capability.resolve(); await prompt;
    await until(() => session.inspectLifecycle!().status === "quiescent");
    assert.equal((await stop(session)).activeTools.length, 0);
  } finally { capability.resolve(); fixture.release(); await prompt; await session.dispose(); }
});

const childCommand = `"${process.execPath}" -e "setInterval(()=>{},1000)"`;
function childSession(toolName: "run_shell" | "start_background_task") {
  return createRuntimeAdapter({ ...base(), shellGate: async () => ({ allow: true, by: "fixture" }),
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, [{ name: toolName, args: { command: childCommand } }]) },
  }).bindRole(role("worker"));
}

test("owned synchronous child close is observed; unproven Windows descendant tree stays unknown", async () => {
  const session = await childSession("run_shell");
  const prompt = session.prompt("owned Node child").catch(error => error);
  try {
    await until(() => session.inspectLifecycle!().processes.some(process => process.kind === "shell" && process.state === "running"), 3000);
    const result = await stop(session, 2500); await prompt;
    assert.ok(result.processes.some(process => process.kind === "shell" && process.state === "exited" && process.pid !== undefined));
    if (process.platform === "win32") {
      assert.equal(result.status, "unknown"); assert.equal(result.processCoverage, "unknown");
      assert.ok(result.reasons.includes("process-tree-unverified"));
    } else {
      assert.equal(result.status, "quiescent"); assert.equal(result.processCoverage, "complete");
    }
  } finally { await stop(session, 3000); await prompt; await session.dispose(); }
});

test("owned background child is stopped with retained facts; missing tree proof is not empty success", async () => {
  const session = await childSession("start_background_task");
  const prompt = session.prompt("owned background Node child").catch(error => error);
  try {
    await until(() => session.inspectLifecycle!().processes.some(process => process.kind === "background" && process.state === "running"), 3000);
    await prompt;
    const result = await stop(session, 2500);
    assert.ok(result.processes.some(process => process.kind === "background" && process.state === "exited"));
    assert.equal(result.status, "unknown"); assert.ok(result.reasons.includes("process-tree-unverified"));
    assert.equal(result.processCoverage, "unknown");
  } finally { await stop(session, 3000); await prompt; await session.dispose(); }
});

test("native adapter without its own process evidence remains unknown despite a real terminal event", async () => {
  const fixture = controlled();
  const session = await createRuntimeAdapter({ ...base(), runtime: "claude", providerFactories: { claude: fixture.factory } }).bindRole(role("worker"));
  const prompt = session.prompt("fixture only; no model"); fixture.release(); await prompt;
  const result = await stop(session, 20);
  assert.equal(result.status, "unknown"); assert.ok(result.reasons.includes("native-provider-process-coverage-unavailable"));
  assert.ok(result.settledAt); assert.equal(result.providerFinished, true);
  await session.dispose();
});

test("R6 one native hook binds instance/Core turn and returns copied transport/process facts", async () => {
  let facts!: RuntimeNativeLifecycleFacts;
  let stopped = 0;
  const fixture = controlled({ nativeLifecycle: options => {
    facts = { instanceId: "native-instance-1", roleId: "worker", runtime: "claude", status: "running", promptState: "running",
      observedAt: new Date().toISOString(), transport: { kind: "http", state: "open" }, activeTools: [], processes: [], processCoverage: "complete", reasons: [] };
    return { instanceId: facts.instanceId, inspect: () => facts, async stopAndInspect(input) {
      stopped++; assert.equal(input.expectedInstanceId, "native-instance-1");
      assert.equal(input.expectedCoreTurnId, options.currentTurnId());
      facts = { ...facts, coreTurnId: input.expectedCoreTurnId, status: "quiescent", promptState: "settled",
        settledAt: new Date().toISOString(), observedAt: new Date().toISOString(), transport: { kind: "http", state: "idle" } };
      fixture.release(); return facts;
    } };
  } });
  const session = await createRuntimeAdapter({ ...base(), runtime: "claude", providerFactories: { claude: fixture.factory } }).bindRole(role("worker"));
  const prompt = session.prompt("offline native contract").catch(error => error);
  try {
    await until(() => fixture.started);
    const result = await stop(session, 200); await prompt;
    assert.equal(result.status, "quiescent"); assert.equal(result.processCoverage, "complete");
    assert.equal(stopped, 1); assert.equal(fixture.aborts, 0, "dedicated native stop does not reuse the legacy abort cleanup");
    assert.ok(result.settledAt); assert.equal(result.native!.coreTurnId, result.turnId);
    assert.notEqual(result.sessionId, result.native!.instanceId);
    result.native!.transport.state = "unknown";
    assert.equal(facts.transport.state, "idle", "caller cannot mutate native source through copied facts");
  } finally { fixture.release(); await prompt; await session.dispose(); }
});

test("R6 native proof rejects incomplete transport/children, activity and binding mismatches", async () => {
  let facts!: RuntimeNativeLifecycleFacts;
  const fixture = controlled({ nativeLifecycle: options => ({ instanceId: "native-instance-2", inspect: () => facts,
    async stopAndInspect(input) { return facts; },
  }), work: async options => {
    facts = { instanceId: "native-instance-2", roleId: "worker", runtime: "claude", coreTurnId: options.currentTurnId(),
      status: "quiescent", promptState: "settled", settledAt: new Date().toISOString(), observedAt: new Date().toISOString(),
      transport: { kind: "http", state: "idle" }, activeTools: [], processes: [], processCoverage: "complete", reasons: [] };
  } });
  const session = await createRuntimeAdapter({ ...base(), runtime: "claude", providerFactories: { claude: fixture.factory } }).bindRole(role("worker"));
  try {
    await session.prompt("offline native proof matrix");
    assert.equal(session.inspectLifecycle!().status, "quiescent");
    const valid = structuredClone(facts);
    const cases: Partial<RuntimeNativeLifecycleFacts>[] = [
      { instanceId: "other-instance" }, { roleId: "other-role" }, { runtime: "pi" }, { coreTurnId: "old-core-turn" },
      { status: "unknown" }, { promptState: "unknown" }, { settledAt: undefined }, { processCoverage: "unknown" },
      { transport: { kind: "unknown", state: "closed" } }, { transport: { kind: "owned-process", state: "closed" } },
      { activeTools: [{ id: "still-active", name: "native-request" }] },
      { processes: [{ id: "native-child", kind: "native", state: "running", treeStatus: "verified" }] },
      { processes: [{ id: "native-child", kind: "native", state: "exited", treeStatus: "unknown" }] },
      { reasons: ["SDK-does-not-expose-close"] },
    ];
    for (const change of cases) {
      facts = { ...valid, ...change };
      assert.equal(session.inspectLifecycle!().status, "unknown", JSON.stringify(change));
    }
    facts = { ...valid, transport: { kind: "owned-process", state: "closed" },
      processes: [{ id: "native-child", kind: "native", state: "exited", treeStatus: "verified", exitCode: 0 }] };
    assert.equal(session.inspectLifecycle!().status, "quiescent");
    assert.equal(isRuntimeNativeLifecycleFacts(facts), true);
    assert.equal(isRuntimeNativeLifecycleFacts({ ...facts, activeTools: null }), false);
    assert.equal(isRuntimeNativeLifecycleFacts({ ...facts, processes: [{ ...facts.processes[0], pid: -1 }] }), false);
  } finally { await session.dispose(); }
});

test("R6 unreadable native facts never fall back to a closed flag or legacy lifecycle receipt", async () => {
  const fixture = controlled({ nativeLifecycle: () => ({ instanceId: "native-instance-3",
    inspect() { throw new Error("transport status unavailable"); },
    async stopAndInspect() { throw new Error("transport cleanup not observed"); },
  }) });
  const session = await createRuntimeAdapter({ ...base(), runtime: "claude", providerFactories: { claude: fixture.factory } }).bindRole(role("worker"));
  const prompt = session.prompt("offline unreadable hook"); fixture.release(); await prompt;
  const result = await stop(session, 20);
  assert.equal(result.status, "unknown"); assert.equal(result.processCoverage, "unknown");
  assert.ok(result.reasons.includes("native-provider-lifecycle-read-failed"));
  assert.ok(result.reasons.includes("native-stop-facts-invalid-or-failed"));
  await session.dispose();
});

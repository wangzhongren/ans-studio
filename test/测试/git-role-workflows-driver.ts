// Q: replace inference only, through the default Core -> default CodexChat HTTP transport.
// No providerFactories/chatFetch/engineFactory/native provenance or workflow state injection.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createDesktopInterface, createDecisionDelegationSwitch, desktopProjectExecutionInventory } from "../../app/desktop/interface.ts";
import { createCustomerInputChannel, type OperatorDecisionPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { configureDiagnostics, getDiagnosticsStatus, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";
import { readTaskState, type TaskRecord } from "../../src/common/编排/task-state.ts";
import { createRuntimeAdapter, inspectRuntimeCoreRegistry } from "../../src/service/runtime/session.ts";
import { isDispatchTaskResumeController, type RoleSession, type SessionEvent } from "../../src/model/runtime.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import { inspectManagedRoleSessionInventory } from "../../src/pipeline/orchestration/run-role.ts";
import { createGitCandidateStore, createProjectTrunkStore, inspectGitHostCoordinator } from "../../src/provider/trunk/public/trunk-store.ts";
import { isGitCapabilityResult, isSnapshotRef } from "../../src/model/trunk.ts";

/** Owned test diagnostics only: fixed primitive fields, no prompt/file body/credentials or production persistence. */
export function createFixtureTailRecorder(file: string | undefined, limits = { entries: 1024, bytes: 2097152 }) {
  let count = 0, bytes = 0;
  if (file) writeFileSync(file, "", { flag: "wx", mode: 0o600 });
  return (stage: string, facts: unknown) => {
    if (!file) return;
    const line = `${JSON.stringify({ at: new Date().toISOString(), processId: process.pid, sequence: ++count, stage, facts })}\n`, size = Buffer.byteLength(line);
    if (count > limits.entries || bytes + size > limits.bytes || size > 16384) throw new Error("QA_TAIL_DIAGNOSTIC_BOUND_EXCEEDED");
    appendFileSync(file, line, { encoding: "utf8", mode: 0o600 }); bytes += size;
  };
}
function tailField(value: unknown, name: string): unknown { return value && typeof value === "object" ? Reflect.get(value, name) : undefined; }
function tailScalars(value: unknown, names: readonly string[]) {
  return Object.fromEntries(names.flatMap(name => {
    const field = tailField(value, name);
    return typeof field === "string" && Buffer.byteLength(field) <= 256 || typeof field === "boolean" || typeof field === "number" && Number.isFinite(field) ? [[name, field]] : [];
  }));
}
/** Exact ordinary identifiers only. A filename's content and the original model/user text are never persisted here. */
export function fixtureTailToolFact(call: ChatToolCall) {
  let args: unknown;
  try { args = JSON.parse(call.function.arguments); } catch { args = undefined; }
  return { id: call.id, name: call.function.name, argumentBytes: Buffer.byteLength(call.function.arguments), argumentSha256: createHash("sha256").update(call.function.arguments).digest("hex"),
    identifiers: tailScalars(args, ["operationId", "taskId", "flowId", "runId", "roleId", "moduleId", "idempotencyKey", "path", "action", "target"]),
    resumeController: tailScalars(tailField(args, "resumeController"), ["taskId", "flowId", "runId", "reviewTaskId", "reviewCloseOperationId"]) };
}
function fixtureTailToolReply(message: ChatMessage) {
  const raw = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
  let decoded: unknown;
  if (typeof raw === "string" && Buffer.byteLength(raw) <= 32768 && raw.includes("{")) {
    try { decoded = JSON.parse(raw.slice(raw.indexOf("{"))); } catch { decoded = undefined; }
  }
  return { toolCallId: message.tool_call_id, bytes: Buffer.byteLength(raw ?? ""), sha256: createHash("sha256").update(raw ?? "").digest("hex"),
    actualStructuredFields: tailScalars(decoded, ["ok", "status", "code", "errorCode", "operationId", "taskId", "applicationId", "journalId", "taskStatus"]) };
}

export type ChatToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage = { role: string; content?: unknown; tool_call_id?: string; tool_calls?: ChatToolCall[] };
export type ChatRequest = { model: string; stream?: boolean; messages: ChatMessage[]; tools?: { type?: string; function?: { name?: string; parameters?: unknown } }[]; tool_choice?: unknown };
export type ModelReply = { content: string | null; tool_calls?: ChatToolCall[] };
export type HttpStep = (body: ChatRequest) => ModelReply | Promise<ModelReply>;
export type HttpScripts = Record<string, readonly HttpStep[]>;
export function fixtureWaitBudgetMs(timeoutMs: number, caseDeadlineAt: number | undefined, now: number, remainingCase = false) {
  if (remainingCase) {
    assert.ok(typeof caseDeadlineAt === "number" && Number.isSafeInteger(caseDeadlineAt), "REMAINING_CASE_WAIT_REQUIRES_DECLARED_DEADLINE");
    return caseDeadlineAt - now;
  }
  return caseDeadlineAt === undefined ? timeoutMs : Math.min(timeoutMs, caseDeadlineAt - now);
}
export type HttpTrace = { sequence: number; at: string; role: string; roleStep: number; request: ChatRequest; reply?: ModelReply; error?: string; creationFacts: ReturnType<typeof readCreationFacts> };
export type DiagnosticWait = { waiter: string; resolver: string | null; event: string; external: boolean };
export type QueueDiagnosticFact = {
  at: string; root: string; event: unknown;
  inventoryBeforeLedgerRead: ReturnType<typeof desktopProjectExecutionInventory>;
  inventory: ReturnType<typeof desktopProjectExecutionInventory>;
  tasks: TaskRecord[]; ledgerErrors: Awaited<ReturnType<typeof readTaskState>>["errors"];
};

/** HTTP chunks can split a UTF-8 code point; apply the byte limit before decoding once. */
export async function readFixtureHttpBody(request: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > 2 * 1024 * 1024) throw new Error("HTTP_INPUT_BUDGET");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

export const gitTool = (id: string, name: string, args: Record<string, unknown>): ChatToolCall => ({
  id, type: "function", function: { name: `ans_${name}`, arguments: JSON.stringify(args) },
});
export const modelCalls = (...tool_calls: ChatToolCall[]): ModelReply => ({ content: null, tool_calls });
export const modelDone = (content: string): ModelReply => ({ content });
export function actualUserInput(body: ChatRequest): string {
  const raw = String(body.messages.findLast(message => message.role === "user")?.content);
  const prefix = "【系统通知·会话重建】此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。\n\n";
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}
/** A real rebuild can prepend this exact application warning to an app notice.
 * Keep the original HTTP message in trace; no other wrapper is ignored. */
export function actualApplicationNotice(body: ChatRequest): string | undefined {
  const text = actualUserInput(body);
  return text.startsWith("[应用·文档更新]") ? text : undefined;
}

/** Opt-in test-process observation only. Original timer handles/ref state and callback this/args are preserved. */
export function observeDiagnosticTimers() {
  const originals = { setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval,
    clearTimeout: globalThis.clearTimeout, clearInterval: globalThis.clearInterval };
  const active = new Map<unknown, { id: number; kind: string; delay: unknown; at: string; stack?: string; fired: number }>();
  const history: unknown[] = []; let sequence = 0;
  const proxy = <T extends typeof setTimeout | typeof setInterval>(original: T, kind: string): T => new Proxy(original, {
    apply(target, thisArg, argumentsList: unknown[]) {
      const callback = argumentsList[0];
      if (typeof callback !== "function") return Reflect.apply(target, thisArg, argumentsList);
      const invoke = callback;
      const record = { id: ++sequence, kind, delay: argumentsList[1], at: new Date().toISOString(), stack: new Error("timer-created").stack, fired: 0 };
      let handle: unknown;
      function observedCallback(this: unknown, ...args: unknown[]) {
        record.fired++; if (kind === "timeout") active.delete(handle);
        return Reflect.apply(invoke, this, args);
      }
      handle = Reflect.apply(target, thisArg, [observedCallback, ...argumentsList.slice(1)]);
      active.set(handle, record); return handle;
    },
  });
  globalThis.setTimeout = proxy(originals.setTimeout, "timeout");
  globalThis.setInterval = proxy(originals.setInterval, "interval");
  globalThis.clearTimeout = new Proxy(originals.clearTimeout, { apply(target, thisArg, args: unknown[]) { active.delete(args[0]); return Reflect.apply(target, thisArg, args); } });
  globalThis.clearInterval = new Proxy(originals.clearInterval, { apply(target, thisArg, args: unknown[]) { active.delete(args[0]); return Reflect.apply(target, thisArg, args); } });
  return {
    snapshot(stage: string) { const value = { stage, at: new Date().toISOString(), created: sequence, active: [...active.values()] }; history.push(value); return value; },
    history,
    restore() { Object.assign(globalThis, originals); },
  };
}

/** Lifecycle layer probe only: real default Core/Chat; no Git/governance acceptance proof. */
export async function runSingleCoreLifecycleProbe(evidenceFile: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "q18-single-core-"));
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.ANS_Q18_LOCAL_KEY;
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_Q18_LOCAL_KEY = "q18-local-fixture-only";
  let session: RoleSession | undefined, eventPump: Promise<void> | undefined, failure: string | undefined;
  const events: SessionEvent[] = [], reports: unknown[] = [], trace: { at: string; body: ChatRequest }[] = [], checkpoints: unknown[] = [];
  const gateCalls: { target: string; resolved: string; expected: string }[] = [];
  let checkpointWrites = Promise.resolve();
  const sockets = new Map<import("node:net").Socket, { id: number; closed: Promise<void> }>();
  const counts = { requests: 0, responsesFinished: 0, requestErrors: 0, inflight: 0, socketsOpened: 0, socketsClosed: 0, serverCloseCallbacks: 0 };
  const capture = (stage: string) => {
    const fact = { at: new Date().toISOString(), stage, resources: process.getActiveResourcesInfo(), counts: { ...counts }, ownSockets: sockets.size,
      lifecycle: session?.inspectLifecycle?.(), registry: inspectRuntimeCoreRegistry() };
    checkpoints.push(fact);
    checkpointWrites = checkpointWrites.then(async () => { await fs.mkdir(path.dirname(evidenceFile), { recursive: true }); await fs.appendFile(`${evidenceFile}.checkpoints.jsonl`, `${JSON.stringify(fact)}\n`); });
    process.stdout.write(`Q18_CORE_LIFECYCLE ${JSON.stringify({ at: fact.at, stage, resources: fact.resources, counts: fact.counts, ownSockets: fact.ownSockets })}\n`);
  };
  capture("before-owned-server");
  const server = createServer(async (request, response) => {
    counts.requests++; counts.inflight++;
    response.once("finish", () => { counts.responsesFinished++; counts.inflight--; });
    try {
      assert.equal(request.method, "POST"); assert.equal(request.url, "/v1/chat/completions");
      const raw = await readFixtureHttpBody(request);
      const body: ChatRequest = JSON.parse(raw); trace.push({ at: new Date().toISOString(), body }); assert.equal(body.stream, false);
      let reply: ModelReply;
      if (counts.requests === 1) reply = modelCalls(gitTool("q18-core-write", "write_file", { path: "q18-output.txt", content: "q18 lifecycle output\n" }));
      else if (counts.requests === 2) { assert.match(actualToolReply(body, "q18-core-write"), /已获准并落盘/);
        reply = modelCalls(gitTool("q18-core-report", "submit_report", { status: "completed", summary: "Actual layer-probe owned file written; not project acceptance.", evidence: ["q18-output.txt"] })); }
      else if (counts.requests === 3) { actualToolReply(body, "q18-core-report"); reply = modelDone("Layer lifecycle probe finished, no project approval inferred."); }
      else throw new Error("Q18_SINGLE_CORE_SCRIPT_EXHAUSTED");
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ choices: [{ message: { role: "assistant", ...reply } }] }));
    } catch (error) { counts.requestErrors++; response.writeHead(500, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: String(error) })); }
  });
  server.on("connection", socket => {
    counts.socketsOpened++; const id = counts.socketsOpened;
    const closed = new Promise<void>(resolve => socket.once("close", () => { counts.socketsClosed++; sockets.delete(socket); resolve(); }));
    sockets.set(socket, { id, closed });
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); assert.ok(address && typeof address !== "string"); capture("server-listening");
    const role: ResolvedRole = { id: "q18-core", kind: "project", cardText: "# Owned lifecycle layer probe", boundarySource: "q18-structural-layer-input",
      location: { card: "not-loaded-layer-input", boundary: "not-loaded-layer-input" },
      boundary: { entries: [], boundarySource: "q18-structural-layer-input", acceptance: { accepted: false, source: "No governance acceptance supplied" } } };
    const adapter = createRuntimeAdapter({ runtime: "codex", projectRoot: root, skillRoot: root, writeRoot: root, persistSession: true,
      gate: target => { const resolved = path.resolve(root, target), expected = path.join(root, "q18-output.txt"); gateCalls.push({ target, resolved, expected });
        return resolved === expected ? { allowed: true, matchedEntry: { root: "project", path: expected, kind: "file", purpose: "owned single-file lifecycle layer callback, not role authorization evidence" } }
          : { allowed: false, reason: "Outside owned probe file", allowedByRoot: { project: [], skill: [] } }; },
      reportHandback: report => { reports.push(report); },
      baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "ANS_Q18_LOCAL_KEY", modelId: "q18-fixture-only",
      requestAttemptMax: 1, requestFirstByteTimeoutMs: 5000, turnLastResortMs: 10000 });
    session = await adapter.bindRole(role); capture("core-bound");
    eventPump = (async () => { for await (const event of session!.events()) events.push(event); })();
    await session.prompt("Use the actual tools to write the owned probe file and submit its report, then finish."); capture("prompt-returned");
    assert.equal(await fs.readFile(path.join(root, "q18-output.txt"), "utf8"), "q18 lifecycle output\n");
    assert.equal(counts.requests, 3); assert.equal(counts.requestErrors, 0); assert.ok(reports.length);
  } catch (error) { failure = String(error); }
  finally {
    capture("before-core-dispose");
    if (session) { try { await session.dispose(); } catch (error) { failure ??= String(error); } } capture("after-core-dispose");
    if (eventPump) await eventPump; capture("outer-event-pump-ended");
    const closing = [...sockets.values()].map(value => value.closed);
    server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => { counts.serverCloseCallbacks++; resolve(); }));
    await Promise.all(closing); capture("owned-server-and-sockets-closed");
    if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
    if (oldKey === undefined) delete process.env.ANS_Q18_LOCAL_KEY; else process.env.ANS_Q18_LOCAL_KEY = oldKey;
    capture("probe-cleanup-returned");
    await checkpointWrites;
    await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
    await fs.writeFile(evidenceFile, JSON.stringify({ at: new Date().toISOString(), root, layerOnly: true, acceptedOrGitStateSeeded: false,
      transport: "actual default Core/default CodexChat/local HTTP; no provider/engine/fetch override", counts, gateCalls, checkpoints, trace, events, reports, failure }, null, 2));
  }
  if (failure) throw new Error(failure);
}

/** Minimal real Desktop queue lifecycle diagnostic, not a Git/business acceptance case. */
export async function runDesktopLifecycleProbe(evidenceFile: string, variant: "completed" | "denied-write-blocked" = "completed") {
  const flowId = "q18-life", document = "docs/product/q18-life-intent-v1.md";
  const blockedVariant = variant === "denied-write-blocked", attemptedPath = blockedVariant ? "src/forbidden.txt" : document;
  const expectedStatus = blockedVariant ? "blocked" : "done";
  const finalMessage = blockedVariant ? "Q22真实门禁拒绝已正式报告为blocked。" : "Q18真实草稿报告已回交。";
  const content = "---\nschema: project-intent/v1\nflowId: q18-life\nintentId: q18-life\nversion: 1\n---\n# Lifecycle layer probe\nOne real draft and report; no confirmation or execution authority.\n";
  let driver: Awaited<ReturnType<typeof createRealHttpDriver>> | undefined;
  let failure: string | undefined;
  const scripts: HttpScripts = {
    chief: [
      () => modelCalls(gitTool("q18-dispatch-product", "dispatch_task", { roleId: "product", flowId, sideEffect: "docs", idempotencyKey: "q18-dispatch-product",
        task: `起草${document}，flowId q18-life/intentId q18-life，实际write_file后submit_report；不确认意图、不创建Git、不执行或批准。`, expectedOutput: document })),
      body => { assert.match(actualToolReply(body, "q18-dispatch-product"), /任务已派发|已受理/); return modelDone("等待真实产品草稿报告。" ); },
      async body => {
        assert.ok(driver); const ledger = await readTaskState(driver.root);
        const child = [...ledger.records.values()].find(record => record.created?.idempotencyKey === "q18-dispatch-product");
        assert.equal(child?.reports.at(-1)?.status, expectedStatus, "CHIEF_HANDOFF_WITHOUT_MATCHING_REAL_REPORT");
        assert.match(JSON.stringify(body.messages.findLast(message => message.role === "user")?.content), /q18-life|q18-dispatch-product/);
        return modelDone("只确认收到实际产品报告，不批准或关闭任务。" );
      },
    ],
    product: [
      () => modelCalls(gitTool("q18-product-write", "write_file", { path: attemptedPath, content })),
      async body => {
        const reply = actualToolReply(body, "q18-product-write");
        if (blockedVariant) {
          assert.doesNotMatch(reply, /已获准并落盘/); assert.match(reply, /越界|拒|无权|不允许|not.allowed|denied|门禁/i);
          assert.ok(driver); assert.equal(await fs.stat(path.join(driver.root, attemptedPath)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }), false);
        } else assert.match(reply, /已获准并落盘/);
        return modelCalls(gitTool("q18-product-report", "submit_report", { status: blockedVariant ? "blocked" : "completed",
          summary: blockedVariant ? `Q22真实产品越界写入被拒；不扩大权限，需有权角色处理：${reply}` : "Q18真实草稿已写入；未确认、未批准、未创建执行权限。",
          evidence: blockedVariant ? [] : [document] }));
      },
      body => { actualToolReply(body, "q18-product-report"); return modelDone(finalMessage); },
    ],
    "chief:feedback": [body => {
      const message = String(body.messages.findLast(entry => entry.role === "user")?.content);
      assert.ok(message.startsWith("[系统·治理反馈]"));
      assert.ok(message.includes(finalMessage));
      return modelDone("仅确认收到Q18实际产品最终回执。" );
    }],
  };
  try {
    driver = await createRealHttpDriver(scripts, { tag: "q18-desktop-life", requestLimit: 10, timeoutMs: 10000, lifecycleDiagnosticFile: `${evidenceFile}.lifecycle.jsonl` });
    await driver.openChief(); await driver.sendChief("仅作真实产品草稿与报告，用于Desktop队列生命周期诊断；不确认或执行项目。" );
    const deadline = Date.now() + 20000;
    for (;;) {
      if (driver.errors.length) throw new Error(driver.errors.join("\n"));
      const ledger = await readTaskState(driver.root);
      const child = [...ledger.records.values()].find(record => record.created?.idempotencyKey === "q18-dispatch-product");
      const productLog: string = await fs.readFile(path.join(driver.root, ".ans/state/logs/product.jsonl"), "utf8").catch(error => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error;
      });
      const productEnded: boolean = productLog.split("\n").filter(Boolean).some(line => {
        const event: { roleId?: string; kind?: string; status?: string; turnId?: string } = JSON.parse(line);
        return event.roleId === "product" && event.kind === "turn.end" && event.status === "completed" && event.turnId === child?.reports.at(-1)?.turnId;
      });
      if (child?.reports.at(-1)?.status === expectedStatus && productEnded) break;
      assert.ok(Date.now() < deadline, `Q18_DESKTOP_WAIT_BUDGET ${JSON.stringify({ child, productEnded })}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!blockedVariant) assert.equal(await fs.readFile(path.join(driver.root, document), "utf8"), content);
    await driver.save(evidenceFile, { layerOnly: true, variant, stopCondition: "actual matching product ledger report + persisted product activity turn.end; draft path does not persist task.delivered", budget: { http: 10, singleWaitMs: 10000, stageWaitMs: 20000, wrapperMs: 45000, attempts: 1, retries: 0 } });
  } catch (error) { failure = String(error); }
  finally {
    if (driver) { await driver.dispose(); await driver.save(evidenceFile, { layerOnly: true, variant, failure, teardownFacts: driver.teardownFacts }); }
  }
  if (failure) throw new Error(failure);
}
/** Actual same-process producer registries, read before teardown; no safe facts are supplied. */
function readCreationFacts() {
  const registry = inspectRuntimeCoreRegistry();
  return { at: new Date().toISOString(), processInstanceId: registry.processInstanceId, registryRevision: registry.revision,
    coverage: registry.coverage, registryReasons: registry.reasons,
    entries: registry.entries.map(entry => ({ id: entry.id, sessionId: entry.sessionId, roleId: entry.roleId, runtime: entry.runtime,
      projectRoot: entry.projectRoot, planId: entry.planId, state: entry.state, reasons: entry.reasons,
      lifecycle: entry.lifecycle ? { stopRequested: entry.lifecycle.stopRequested, status: entry.lifecycle.status,
        providerFinished: entry.lifecycle.providerFinished, processCoverage: entry.lifecycle.processCoverage,
        processes: entry.lifecycle.processes, activeTools: entry.lifecycle.activeTools, reasons: entry.lifecycle.reasons } : null,
      nativeFactoryPlan: entry.toolSurface?.native?.factoryPlan, nativeInstanceId: entry.toolSurface?.native?.nativeInstanceId,
    })), managed: inspectManagedRoleSessionInventory() };
}
export function actualToolReply(body: ChatRequest, id: string): string {
  const result = body.messages.findLast(message => message.role === "tool" && message.tool_call_id === id);
  assert.ok(result, `ACTUAL_TOOL_RESULT_MISSING ${id}`);
  return typeof result.content === "string" ? result.content : JSON.stringify(result.content);
}

/** Diagnostic graph only; it never writes task/run/permission statuses. */
export function analyzeWaits(edges: readonly DiagnosticWait[]) {
  const cycles: string[][] = [];
  const walk = (node: string, stack: string[]) => {
    const index = stack.indexOf(node);
    if (index >= 0) { cycles.push([...stack.slice(index), node]); return; }
    for (const edge of edges.filter(e => e.waiter === node && !e.external && e.resolver)) walk(edge.resolver!, [...stack, node]);
  };
  for (const edge of edges) walk(edge.waiter, []);
  return { cycles, orphan: edges.filter(e => !e.resolver), external: edges.filter(e => e.external && e.resolver) };
}

class FixtureMetadataUnstableError extends Error {
  readonly code = "QA_GIT_METADATA_SNAPSHOT_UNKNOWN";
  readonly relativePath: string; readonly attempts: number; readonly reason: string;
  constructor(relativePath: string, attempts: number, reason: string) {
    super(`Git metadata diagnostic remains unknown after ${attempts} bounded scans: ${relativePath} (${reason})`);
    this.relativePath = relativePath; this.attempts = attempts; this.reason = reason;
  }
}

export async function hashFixtureFiles(root: string, relativeRoot = ".git", options: {
  mode?: "strict" | "live-diagnostic";
  /** Owned test scheduling only; the callback never supplies filesystem facts or hash results. */
  afterEnumerate?: (relativeDirectory: string, attempt: number) => Promise<void>;
} = {}) {
  const mode = options.mode ?? "strict"; assert.ok(mode === "strict" || mode === "live-diagnostic");
  const rootStat = await fs.lstat(root); assert.ok(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "Fixture inventory root must be an actual non-link directory");
  const start = path.resolve(root, relativeRoot), relative = path.relative(root, start);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Fixture inventory must stay inside the owned root");
  const code = (error: unknown) => error && typeof error === "object" ? Reflect.get(error, "code") : undefined;
  // Only an actually absent .git root is an empty Git inventory. Missing requested sources/subdirectories are errors.
  try { const entry = await fs.lstat(start); assert.equal(entry.isSymbolicLink(), false, "Fixture inventory must not follow unknown links"); }
  catch (error) {
    if (relativeRoot !== ".git" || code(error) !== "ENOENT") throw error;
    try { await fs.lstat(start); } catch (second) { if (code(second) === "ENOENT") return []; throw second; }
  }
  const producerTemp = (name: string) => /^\.git\/ans\/processes\/\.[a-f0-9-]{36}\.json\.tmp-[1-9]\d*-[a-f0-9]{16}$/.test(name);
  const scans = mode === "live-diagnostic" && relativeRoot === ".git" ? 3 : 1;
  for (let attempt = 1; attempt <= scans; attempt++) {
    const files: { path: string; bytes: number; sha256: string }[] = [];
    async function visit(directory: string) {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      await options.afterEnumerate?.(path.relative(root, directory).replaceAll("\\", "/"), attempt);
      for (const entry of entries) {
        const file = path.join(directory, entry.name), name = path.relative(root, file).replaceAll("\\", "/");
        try {
          assert.equal(entry.isSymbolicLink(), false, "Fixture inventory must not follow unknown links");
          const stat = await fs.lstat(file); assert.equal(stat.isSymbolicLink(), false, "Fixture inventory must not follow unknown links");
          assert.equal(await fs.realpath(file), file, "Fixture inventory path must not traverse unknown links");
          if (entry.isDirectory()) { assert.ok(stat.isDirectory()); await visit(file); }
          else {
            assert.ok(entry.isFile() && stat.isFile() && stat.nlink === 1, "Fixture inventory requires a known ordinary single-link file");
            const bytes = await fs.readFile(file);
            if (scans > 1 && producerTemp(name)) throw new FixtureMetadataUnstableError(name, attempt, "actual live producer temp is present");
            files.push({ path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
          }
        } catch (error) {
          if (scans > 1 && producerTemp(name) && code(error) === "ENOENT") throw new FixtureMetadataUnstableError(name, attempt, "actual producer temp vanished after enumeration");
          throw error;
        }
      }
    }
    try { await visit(start); return files.sort((a, b) => a.path.localeCompare(b.path)); }
    catch (error) {
      if (!(error instanceof FixtureMetadataUnstableError) || attempt === scans) throw error;
      // Discard the whole partial scan and enumerate afresh. No file/error is normalized to absence.
    }
  }
  throw new Error("Unreachable bounded fixture inventory scan state");
}

export async function observeFixtureGitMetadata(root: string, options: { afterEnumerate?: (relativeDirectory: string, attempt: number) => Promise<void> } = {}) {
  try { return { gitMetadata: await hashFixtureFiles(root, ".git", { ...options, mode: "live-diagnostic" }), gitMetadataDiagnostic: { state: "observed" as const } }; }
  catch (error) {
    if (!(error instanceof FixtureMetadataUnstableError)) throw error;
    return { gitMetadata: null, gitMetadataDiagnostic: { state: "unknown" as const, code: error.code, path: error.relativePath, attempts: error.attempts, reason: error.reason } };
  }
}

/** Read-only diagnostics. Production independently establishes host facts; these grant nothing. */
async function inspectFixtureRoot(root: string) {
  const ancestors: { path: string; symbolicLink: boolean; gitMarker: boolean }[] = [];
  for (let directory = root;; directory = path.dirname(directory)) {
    const stat = await fs.lstat(directory);
    const gitMarker = await fs.lstat(path.join(directory, ".git")).then(() => true, error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error;
    });
    ancestors.push({ path: directory, symbolicLink: stat.isSymbolicLink(), gitMarker });
    if (path.dirname(directory) === directory) break;
  }
  const nestedGitMarkers: string[] = [], links: string[] = []; let visited = 0;
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (++visited > 1000) throw new Error("FIXTURE_ROOT_INVENTORY_BUDGET");
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { links.push(file); continue; }
      if (entry.name === ".git") { nestedGitMarkers.push(file); continue; }
      if (entry.isDirectory()) await visit(file);
    }
  }
  await visit(root);
  return { root, canonicalRoot: await fs.realpath(root), ancestors, nestedGitMarkers, links };
}

export async function createRealHttpDriver(scripts: HttpScripts, options: {
  tag: string; requestLimit?: number; timeoutMs?: number; repeatedFingerprintLimit?: number;
  caseDeadlineAt?: number;
  publicationDiagnosticFile?: string;
  workerDiagnosticFile?: string;
  pinnedChildDiagnosticFile?: string;
  queueDiagnosticFile?: string;
  failOnClosedQueueRejection?: boolean;
  lifecycleDiagnosticFile?: string;
  tailDiagnosticFile?: string;
  timerDiagnostics?: ReturnType<typeof observeDiagnosticTimers>;
  finiteRoles?: Record<string, { initial?: number; tasks: Record<string, number> }>;
  reusableNoticeKeys?: readonly string[];
  prepareFixture?: (root: string) => Promise<void>;
  existingOwnedProject?: { proofFile: string; proofSha256: string };
  applicationDataRoot?: string;
  emitUiEvent?: Parameters<typeof createDesktopInterface>[0]["emitEvent"];
  emitUiRoleState?: Parameters<typeof createDesktopInterface>[0]["emitRoleState"];
}) {
  let existingOwnedInput: { proofFile: string; proofSha256: string; root: string; delivered: unknown } | undefined;
  let root: string;
  if (options.existingOwnedProject) {
    assert.equal(options.prepareFixture, undefined, "Existing real project entry cannot run a state-prefill callback");
    const { proofFile, proofSha256 } = options.existingOwnedProject;
    const proofBytes = await fs.readFile(proofFile); assert.equal(createHash("sha256").update(proofBytes).digest("hex"), proofSha256);
    const proof = JSON.parse(proofBytes.toString("utf8"));
    const publication: unknown = proof.published ?? proof.extra?.publishedDelivery;
    assert.equal(typeof proof.root, "string"); assert.ok(isGitCapabilityResult(publication) && publication.status === "published" && publication.published);
    root = await fs.realpath(proof.root);
    const temp = (await fs.realpath(os.tmpdir())).toLowerCase() + path.sep;
    assert.ok(root.toLowerCase().startsWith(temp), "Only the previously produced owned OS TEMP project may be reused");
    assert.match(path.basename(root), /^q2-git-first-bootstrap-/);
    const actual = await createGitCandidateStore(root).readRef(publication.published.ref);
    assert.deepEqual(actual, publication.published.oid, "Existing entry must retain its real published delivery, no baseline seeded or defaulted");
    existingOwnedInput = { proofFile, proofSha256, root, delivered: publication };
  } else {
    root = await fs.mkdtemp(path.join(os.tmpdir(), `q2-git-${options.tag}-`));
    assert.deepEqual(await fs.readdir(root), []);
  }
  // Only the separate query/existing-repo case supplies setup; the new-project case leaves this absent.
  await options.prepareFixture?.(root);
  const initialRootFacts = await inspectFixtureRoot(root);
  if (existingOwnedInput) {
    assert.equal(initialRootFacts.ancestors.slice(1).some(fact => fact.gitMarker || fact.symbolicLink), false);
    assert.deepEqual(initialRootFacts.links, []);
    assert.deepEqual(initialRootFacts.nestedGitMarkers, [path.join(root, ".git")]);
  }
  const writeTail = createFixtureTailRecorder(options.tailDiagnosticFile);
  if (options.tailDiagnosticFile) {
    assert.equal(getDiagnosticsStatus().directory, undefined, "Owned diagnostic case cannot replace another configured diagnostics owner");
    configureDiagnostics({ directory: `${options.tailDiagnosticFile}.diagnostics` });
    writeTail("existing-diagnostics-configured", { ...getDiagnosticsStatus(), meaning: "Existing metadata-only production logger; no new persistence protocol or prompt capture" });
  }
  const trace: HttpTrace[] = [], errors: string[] = [], turns = new Map<string, number>();
  const effectActorSamples: unknown[] = [];
  const publicationDiagnostics: unknown[] = [];
  const queueDiagnostics: QueueDiagnosticFact[] = [], queueDiagnosticErrors: string[] = [];
  let queueDiagnosticBusy = false;
  async function captureQueueDiagnostic(event: unknown) {
    if (queueDiagnosticBusy || queueDiagnostics.length) return;
    queueDiagnosticBusy = true;
    try {
      const inventoryBeforeLedgerRead = desktopProjectExecutionInventory(root), ledger = await readTaskState(root);
      const fact: QueueDiagnosticFact = { at: new Date().toISOString(), root, event, inventoryBeforeLedgerRead,
        inventory: desktopProjectExecutionInventory(root), tasks: [...ledger.records.values()], ledgerErrors: ledger.errors };
      queueDiagnostics.push(fact);
      if (options.queueDiagnosticFile) {
        await fs.mkdir(path.dirname(options.queueDiagnosticFile), { recursive: true });
        await fs.writeFile(options.queueDiagnosticFile, JSON.stringify(fact, null, 2), { flag: "wx" });
      }
      if (options.failOnClosedQueueRejection) {
        const rejected = fact.inventory.queuedDispatches.find(entry => entry.lastAttempt.state !== "unknown" && entry.lastAttempt.code === "delivery-assignment-unavailable");
        const assigned = rejected?.systemAssignmentTaskId ? fact.tasks.find(task => task.taskId === rejected.systemAssignmentTaskId) : undefined;
        if (rejected?.systemAssignmentState === "bound" && assigned?.closed)
          errors.push(`ACTUAL_CLOSED_QUEUE_REFUSAL delivery-assignment-unavailable entry=${rejected.queueEntryId} notificationOp=${rejected.operationId ?? "unknown"} boundTask=${assigned.taskId} closedOp=${assigned.closed.operationId ?? "unknown"}`);
      }
      process.stdout.write(`Q_FIRST_QUEUE_REJECTION ${JSON.stringify({ at: fact.at, root, queued: fact.inventory.queuedDispatches })}\n`);
    } catch (error) { queueDiagnosticErrors.push(String(error)); }
    finally { queueDiagnosticBusy = false; }
  }
  const workerRuntimeObservations: unknown[] = [];
  const pinnedChildObservations: unknown[] = [];
  const pinObservationErrors: string[] = [];
  const publicationDiagnosticWrites: Promise<void>[] = [];
  let pinProbeRequested = false, pinProbeBusy = false, pinProbeLastMs = 0, pinProbeAttempts = 0;
  async function capturePinnedChild() {
    if (pinnedChildObservations.length || pinProbeBusy) return;
    pinProbeBusy = true;
    try {
      const ledger = await readTaskState(root), child = [...ledger.records.values()].find(record => record.created?.to === "impl");
      if (!child?.created?.runId) return;
      const store = createProjectTrunkStore(root), run = await store.readRunRecord!(child.created.runId), manifest = await store.readManifest();
      const snapshot = run.ok && isSnapshotRef(run.value.value.snapshotRef) ? await store.readSnapshot!(run.value.value.snapshotRef) : null;
      const parentRef = child.created.parentTaskRef, parent = parentRef ? ledger.records.get(parentRef.taskId) : undefined;
      const fact = { at: new Date().toISOString(), root, collection: "Read actual persisted child/parent/run; may overlap worker construction, never inferred from model args",
        child, parentRef, parent, run, manifest, snapshot, ledgerErrors: ledger.errors, creationFacts: readCreationFacts(),
        desktop: desktopProjectExecutionInventory(root), coordinator: inspectGitHostCoordinator({ projectRoot: root }) };
      pinnedChildObservations.push(fact);
      if (options.pinnedChildDiagnosticFile) { await fs.mkdir(path.dirname(options.pinnedChildDiagnosticFile), { recursive: true }); await fs.writeFile(options.pinnedChildDiagnosticFile, JSON.stringify(fact, null, 2)); }
      process.stdout.write(`Q_PERSISTED_CHILD_OBSERVED ${JSON.stringify({ at: fact.at, taskId: child.taskId, parentRef, runId: child.created.runId, state: run.ok ? run.value.value.state : run.reason })}\n`);
    } catch (error) { pinObservationErrors.push(String(error)); }
    finally { pinProbeBusy = false; }
  }
  const effectActorSampleCounts = new Map<string, number>();
  const events: unknown[] = [], customerTrace: unknown[] = [], customerInputs: { clientMessageId: string; text: string }[] = [], waitEdges = new Map<string, DiagnosticWait>();
  const requestLimit = options.requestLimit ?? 30, timeoutMs = options.timeoutMs ?? 6000;
  const fingerprints = new Map<string, number>();
  const receiverStates = new Map<string, { next: number; pending: string[]; binding: unknown }>();
  const consumedInputs = new Set<string>();
  const receiverTransitions: unknown[] = [];
  const pending = new Map<string, OperatorRequestPayload>();
  const oldWire = process.env.ANS_CODEX_WIRE_API, oldKey = process.env.CODEX_API_KEY;
  const httpCounts = { requests: 0, handlersActive: 0, responsesFinished: 0, responsesClosed: 0, responsesInflight: 0, socketsOpened: 0, socketsClosed: 0, serverCloseCallbacks: 0 };
  const ownSockets = new Set<import("node:net").Socket>();
  const lifecycleObservations: unknown[] = []; let lifecycleWrites = Promise.resolve();
  let closed = false;
  const observeOwnedLifecycle = (stage: string, event?: unknown) => {
    if (!options.lifecycleDiagnosticFile || lifecycleObservations.length >= 100) return;
    const fact = { at: new Date().toISOString(), root, stage, closed, resources: process.getActiveResourcesInfo(), http: { ...httpCounts }, ownSockets: ownSockets.size,
      creationFacts: readCreationFacts(), desktop: desktopProjectExecutionInventory(root), timers: options.timerDiagnostics?.snapshot(stage), ...(event ? { event } : {}) };
    lifecycleObservations.push(fact); const file = options.lifecycleDiagnosticFile;
    lifecycleWrites = lifecycleWrites.then(async () => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.appendFile(file, `${JSON.stringify(fact)}\n`); });
    process.stdout.write(`Q18_DESKTOP_LIFECYCLE ${JSON.stringify({ at: fact.at, stage, closed, resources: fact.resources, http: fact.http, ownSockets: fact.ownSockets })}\n`);
  };
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.CODEX_API_KEY = "fixture-only";
  const server = createServer(async (request, response) => {
    httpCounts.requests++; httpCounts.handlersActive++; httpCounts.responsesInflight++;
    let responseEnded = false;
    const endResponse = () => { if (!responseEnded) { responseEnded = true; httpCounts.responsesInflight--; } };
    response.once("finish", () => { httpCounts.responsesFinished++; endResponse(); if (closed) observeOwnedLifecycle("response-finished-after-stop"); });
    response.once("close", () => { httpCounts.responsesClosed++; endResponse(); });
    let row: HttpTrace | undefined;
    try {
      if (request.method !== "POST" || request.url !== "/v1/chat/completions") throw new Error(`UNEXPECTED_HTTP ${request.method} ${request.url}`);
      const raw = await readFixtureHttpBody(request);
      const body = JSON.parse(raw) as ChatRequest;
      assert.equal(body.stream, false, "This fixture implements only the real nonstreaming Chat boundary");
      const system = body.messages.filter(message => message.role === "system").map(message => String(message.content)).join("\n");
      const role = system.match(/固定角色：([A-Za-z0-9_-]+)。/)?.[1];
      if (!role) throw new Error("UNKNOWN_REAL_ROLE: no default Codex fixed-role system identity");
      const boundedChief = role === "chief" && body.tools?.length === 1 && body.tools[0]?.function?.name === "ans_decide_pending_request";
      const lastUser = body.messages.findLast(message => message.role === "user");
      const progressOnly = role === "chief" && actualUserInput(body).startsWith("[系统·治理反馈]");
      const applicationNotice = actualApplicationNotice(body) !== undefined;
      const key = boundedChief ? "chief:decision" : progressOnly ? "chief:feedback" : applicationNotice ? `${role}:application-notice` : role;
      const roleStep = turns.get(key) ?? 0; turns.set(key, roleStep + 1);
      row = { sequence: trace.length + 1, at: new Date().toISOString(), role: key, roleStep, request: body, creationFacts: readCreationFacts() }; trace.push(row);
      const userText = actualUserInput(body), actualTaskToken = /(?:任务编号：|任务：)#([^\s]+)/.exec(userText)?.[1];
      writeTail("http-received", { requestSequence: row.sequence, role: key, roleStep, actualTaskToken: actualTaskToken ?? "unknown", userBytes: Buffer.byteLength(userText), userSha256: createHash("sha256").update(userText).digest("hex"),
        lastActualToolReplies: body.messages.filter(message => message.role === "tool").slice(-4).map(fixtureTailToolReply), http: { ...httpCounts } });
      if (!["chief", "product", "rapporteur", "nominator", "convener", "verifier"].includes(role) && workerRuntimeObservations.length === 0) {
        await capturePinnedChild();
        const fact = { at: new Date().toISOString(), root, role, registeredTools: body.tools, creationFacts: row.creationFacts,
          desktop: desktopProjectExecutionInventory(root), coordinator: inspectGitHostCoordinator({ projectRoot: root }) };
        workerRuntimeObservations.push(fact);
        if (options.workerDiagnosticFile) {
          const file = options.workerDiagnosticFile;
          publicationDiagnosticWrites.push(fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.writeFile(file, JSON.stringify(fact, null, 2))));
        }
      }
      if (trace.length > requestLimit) throw new Error("HTTP_REQUEST_BUDGET_EXHAUSTED");
      let state = receiverStates.get(key), selectedStep = options.reusableNoticeKeys?.includes(key) ? 0 : roleStep;
      const finite = options.finiteRoles?.[key];
      if (finite) {
        if (state?.pending.length) {
          const lastAssistant = body.messages.findLastIndex(message => !!message.tool_calls?.length);
          const results = body.messages.slice(lastAssistant + 1).filter(message => message.role === "tool");
          assert.deepEqual(results.map(message => message.tool_call_id).sort(), [...state.pending].sort(), `FSM_PENDING_RESULT_MISMATCH ${key}`);
          for (const id of state.pending) actualToolReply(body, id);
          selectedStep = state.next;
        } else {
          const text = actualUserInput(body);
          let taskId = /(?:任务编号：|任务：)#([^\s]+)/.exec(text)?.[1];
          let resumed: { turnSequence: number; reviewCloseOperationId: string } | undefined;
          if (role === "convener" && text.includes("【交付依据】")) {
            const candidates = trace.flatMap(turn => turn.role === "chief" ? (turn.reply?.tool_calls ?? []).map(call => ({ turn, call })) : [])
              .filter(({ call }) => { if (call.function.name !== "ans_dispatch_task") return false; const input: unknown = JSON.parse(call.function.arguments);
                if (!input || typeof input !== "object" || !isDispatchTaskResumeController(Reflect.get(input, "resumeController"))) return false;
                const taskText = Reflect.get(input, "task"); return typeof taskText === "string" && taskText.length > 0 && text.includes(taskText); });
            assert.equal(candidates.length, 1, "FSM_RESUME_ACTUAL_CHIEF_DISPATCH_UNAVAILABLE_OR_AMBIGUOUS");
            const issued = candidates[0]; assert.ok(issued);
            const args = JSON.parse(issued.call.function.arguments);
            assert.ok(isDispatchTaskResumeController(args.resumeController), "FSM_ACTUAL_RESUME_TUPLE_INFORMATION_GAP");
            assert.equal(args.roleId, "convener"); assert.ok(typeof args.task === "string" && text.includes(args.task), "FSM_RESUME_INPUT_MISMATCH");
            const tuple = args.resumeController, actual = await readTaskState(root);
            const controller = actual.records.get(tuple.taskId), review = actual.records.get(tuple.reviewTaskId);
            assert.ok(controller?.created && review?.created && review.closed);
            assert.equal(controller.created.from, "chief"); assert.equal(controller.created.to, "convener"); assert.equal(controller.closed, undefined);
            assert.equal(controller.created.flowId, tuple.flowId); assert.equal(controller.created.runId, tuple.runId);
            assert.equal(review.created.from, "chief"); assert.equal(review.created.to, "verifier");
            assert.equal(review.closed.by, "chief"); assert.equal(review.closed.outcome, "accepted"); assert.equal(review.closed.operationId, tuple.reviewCloseOperationId);
            assert.ok(desktopProjectExecutionInventory(root).activeDeliveries.some(delivery => delivery.roleId === role && delivery.kind === "dispatch" && delivery.taskId === tuple.taskId), "FSM_RESUME_NOT_ACTUALLY_DELIVERING");
            if (taskId !== undefined) assert.equal(taskId, tuple.taskId);
            taskId = tuple.taskId; resumed = { turnSequence: issued.turn.sequence, reviewCloseOperationId: tuple.reviewCloseOperationId };
          }
          if (taskId) {
            const record = (await readTaskState(root)).records.get(taskId); assert.ok(record?.created, `FSM_UNKNOWN_TASK ${taskId}`);
            const workResult = text.startsWith("[工作结果]");
            assert.equal(workResult ? record.created.from : record.created.to, role, `FSM_TASK_ROLE_MISMATCH ${taskId}`);
            assert.ok(text.startsWith("[工作结果]") || text.startsWith("[派发]") || resumed, `FSM_UNKNOWN_TASK_MESSAGE ${key}`);
            const latest = record.reports.at(-1);
            if (workResult) { assert.ok(latest); assert.ok(text.includes(latest.summary)); }
            const token = resumed ? `${key}:${taskId}:resume:${resumed.turnSequence}:${resumed.reviewCloseOperationId}` : `${key}:${taskId}:${workResult ? latest?.turnId : "dispatch"}:${latest?.status ?? "created"}`;
            assert.equal(consumedInputs.has(token), false, `FSM_REPEATED_INPUT ${token}`); consumedInputs.add(token);
            const start = finite.tasks[record.created.idempotencyKey ?? ""]; assert.notEqual(start, undefined, `FSM_TASK_TRANSITION_UNREGISTERED ${record.created.idempotencyKey}`);
            selectedStep = start; state = { next: start, pending: [], binding: { taskId, task: record.created, latestReport: latest, input: text, actualResume: resumed } };
          } else {
            assert.ok(finite.initial !== undefined && !state, `FSM_UNBOUND_INPUT ${key}: ${text}`);
            selectedStep = finite.initial; state = { next: selectedStep, pending: [], binding: { kind: "actual-initial-customer-message", input: text } };
          }
        }
      }
      const script = scripts[key]?.[selectedStep]; if (!script) throw new Error(`HTTP_SCRIPT_EXHAUSTED ${key}:state-${selectedStep}`);
      const fingerprint = createHash("sha256").update(JSON.stringify({ key, messages: body.messages })).digest("hex");
      const count = (fingerprints.get(fingerprint) ?? 0) + 1; fingerprints.set(fingerprint, count);
      if (count > (options.repeatedFingerprintLimit ?? 2)) throw new Error(`HTTP_NO_PROGRESS ${key}:${fingerprint}`);
      const reply = await script(body); row.reply = reply;
      writeTail("http-script-reply", { requestSequence: row.sequence, role: key, selectedStep, actualBinding: tailScalars(state?.binding, ["taskId"]),
        emittedToolCalls: reply.tool_calls?.map(fixtureTailToolFact) ?? [], replyBytes: Buffer.byteLength(reply.content ?? ""), replySha256: createHash("sha256").update(reply.content ?? "").digest("hex") });
      if (finite) {
        assert.ok(state);
        receiverTransitions.push({ at: new Date().toISOString(), key, selectedStep, binding: state.binding,
          actualPendingResults: state.pending, emittedCalls: reply.tool_calls?.map(call => ({ id: call.id, name: call.function.name })), terminalMessage: reply.content });
        receiverStates.set(key, { next: selectedStep + 1, pending: reply.tool_calls?.map(call => call.id) ?? [], binding: state.binding });
      }
      // Register/execute names remain the real app tool surface. Unknown names are not invented here.
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: `fixture-${row.sequence}`, object: "chat.completion", choices: [{ index: 0,
        finish_reason: reply.tool_calls?.length ? "tool_calls" : "stop", message: { role: "assistant", ...reply } }] }));
    } catch (error) {
      const message = String(error); errors.push(message); if (row) row.error = message;
      writeTail("http-handler-failed", { requestSequence: row?.sequence, role: row?.role, name: error instanceof Error ? error.name : "unknown", errorSha256: createHash("sha256").update(message).digest("hex") });
      response.writeHead(500, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message, type: "fixture-hard-failure" } }));
    } finally { httpCounts.handlersActive--; if (closed) observeOwnedLifecycle("handler-returned-after-stop"); }
  });
  server.on("connection", socket => { httpCounts.socketsOpened++; ownSockets.add(socket); socket.once("close", () => { httpCounts.socketsClosed++; ownSockets.delete(socket); if (closed) observeOwnedLifecycle("owned-socket-close-after-stop"); }); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const delegation = createDecisionDelegationSwitch(false);
  const channel = createCustomerInputChannel({ operatorId: "test-customer", delegation,
    presenter: payload => {
      pending.set(payload.id, payload);
      customerTrace.push({ source: "test-customer", event: "presented", payload });
      waitEdges.set(payload.id, { waiter: payload.roleId, resolver: "test-customer", event: payload.id, external: true });
    },
    emitJudgeResult: payload => customerTrace.push({ source: "application", event: "delegated-result", payload }),
  });
  const applicationData = options.applicationDataRoot;
  if (applicationData !== undefined) {
    assert.ok(path.isAbsolute(applicationData)); const actual = await fs.realpath(applicationData), temp = await fs.realpath(os.tmpdir());
    assert.ok(actual.toLowerCase().startsWith(temp.toLowerCase() + path.sep), "UI application state must stay in its owned OS TEMP directory");
    assert.equal(actual, applicationData); const stat = await fs.lstat(applicationData); assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  }
  const desktop = createDesktopInterface({ pickDirectory: async () => root, emitRoleState: info => {
    options.emitUiRoleState?.(info);
    writeTail("actual-role-state", tailScalars(info, ["projectRoot", "roleId", "runtime", "phase", "status", "busy", "activeTurnId", "clientMessageId", "taskId"]));
  }, emitEvent: event => {
    events.push(event); options.emitUiEvent?.(event);
    const rawEvent = tailField(event, "event"), detail = tailField(rawEvent, "detail");
    writeTail("actual-app-event", { envelope: tailScalars(event, ["roleId", "sessionId", "projectRoot"]), event: tailScalars(rawEvent, ["kind", "runtime", "roleId", "turnId"]),
      detail: tailScalars(detail, ["toolName", "toolCallId", "phase", "ok", "status", "code", "errorCode", "source", "taskId", "clientMessageId", "turnId", "deliveryId", "outcome"]) });
    const toolCallId = tailField(detail, "toolCallId");
    if (options.tailDiagnosticFile && typeof toolCallId === "string" && toolCallId.endsWith("-resume")) {
      const inventory = desktopProjectExecutionInventory(root);
      writeTail("actual-resume-inventory", { actualToolCallId: toolCallId, actualPhase: tailField(detail, "phase"),
        pendingOpens: inventory.pendingOpens.slice(-8).map(row => tailScalars(row, ["roleId", "taskId", "runtime", "phase"])),
        activeDeliveries: inventory.activeDeliveries.slice(-8).map(row => tailScalars(row, ["roleId", "taskId", "kind", "runtime"])),
        queuedDispatches: inventory.queuedDispatches.slice(-8).map(row => ({ ...tailScalars(row, ["queueEntryId", "roleId", "sourceRoleId", "operationId", "systemAssignmentTaskId", "systemAssignmentState", "notificationSourceState"]), lastAttempt: row.lastAttempt })),
        sessions: inventory.sessions.slice(-8).map(row => ({ ...tailScalars(row, ["roleId", "runtime", "phase"]), lifecycle: tailScalars(row.lifecycle, ["status", "providerFinished"]) })) });
    }
    if (closed) observeOwnedLifecycle("application-event-after-stop", event);
    const raw = JSON.stringify(event);
    if (options.queueDiagnosticFile && !queueDiagnostics.length && raw.includes('"source":"delivery-note"') && raw.includes("delivery-assignment-unavailable"))
      publicationDiagnosticWrites.push(captureQueueDiagnostic(event));
    if (raw.includes('"toolCallId":"q11-dispatch-worker"') && raw.includes('"phase":"start"')) pinProbeRequested = true;
    if (options.publicationDiagnosticFile && publicationDiagnostics.length === 0 && raw.includes('"source":"delivery-note"') && raw.includes("stable.write") && raw.includes("待续接")) {
      const fact = { at: new Date().toISOString(), root, event, creationFacts: readCreationFacts(), desktop: desktopProjectExecutionInventory(root), coordinator: inspectGitHostCoordinator({ projectRoot: root }) };
      publicationDiagnostics.push(fact);
      const file = options.publicationDiagnosticFile;
      publicationDiagnosticWrites.push(fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.writeFile(file, JSON.stringify(fact, null, 2))));
      process.stdout.write(`Q_FIRST_PUBLICATION_DIAGNOSTIC ${JSON.stringify({ at: fact.at, event })}\n`);
    }
  },
    runtimeOptions: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKeyEnvVar: "CODEX_API_KEY", modelId: "q2-fixture-only",
      requestAttemptMax: 1, requestFirstByteTimeoutMs: timeoutMs, turnLastResortMs: timeoutMs },
    envFilePath: path.join(applicationData ?? root, "no-real-credentials.env"), piConfigEnv: {},
    runtimeStatePath: applicationData ? path.join(applicationData, "ans/runtime-selection.json") : path.join(root, ".q2-runtime-selection.json"),
    ...(applicationData ? { preferencesPath: path.join(applicationData, "ans/preferences.json") } : {}),
    customerInput: channel.customerInput, decisionJudgeSwitch: delegation,
  });
  // Finite, read-only same-process sampling while the real Core effect handler is active.
  const actorSampler = setInterval(() => {
    if (pinProbeRequested && !pinProbeBusy && !pinnedChildObservations.length && pinProbeAttempts < 1200 && Date.now() - pinProbeLastMs >= 50) {
      pinProbeLastMs = Date.now(); pinProbeAttempts++; publicationDiagnosticWrites.push(capturePinnedChild());
    }
    const facts = readCreationFacts();
    for (const name of ["submit_version_change", "complete_team_plan", "activate_role_documents", "request_stable_write"]) {
      if ((effectActorSampleCounts.get(name) ?? 0) >= 6) continue;
      if (facts.entries.some(entry => entry.lifecycle?.activeTools.some(tool => tool.name === name))) {
        effectActorSampleCounts.set(name, (effectActorSampleCounts.get(name) ?? 0) + 1);
        effectActorSamples.push({ at: new Date().toISOString(), tool: name, creationFacts: facts, desktop: desktopProjectExecutionInventory(root) });
      }
    }
  }, 5);
  const teardownFacts: { at: string; stage: string; resources: string[]; creationFacts: ReturnType<typeof readCreationFacts> }[] = [];
  const captureTeardown = (stage: string) => {
    const fact = { at: new Date().toISOString(), stage, resources: process.getActiveResourcesInfo(), creationFacts: readCreationFacts() };
    teardownFacts.push(fact);
    observeOwnedLifecycle(stage);
    process.stdout.write(`Q_DRIVER_TEARDOWN ${JSON.stringify({ at: fact.at, stage, resources: fact.resources })}\n`);
  };
  const bounded = async <T>(label: string, run: (signal: AbortSignal) => Promise<T>, budget: { remainingCase?: true } = {}): Promise<T> => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const now = Date.now(), remaining = fixtureWaitBudgetMs(timeoutMs, options.caseDeadlineAt, now, budget.remainingCase === true);
    if (remaining <= 0) throw new Error(`Q_CASE_ABSOLUTE_BUDGET ${label}`);
    if (budget.remainingCase) process.stdout.write(`Q_BOUNDED_CASE_REMAINDER ${JSON.stringify({ at: new Date(now).toISOString(), label, caseDeadlineAt: options.caseDeadlineAt, remainingMs: remaining, originalDefaultWaitMs: timeoutMs, scope: "One already-declared phase; all HR/card/mode/admission work stays under this same absolute deadline" })}\n`);
    try { return await Promise.race([run(abort.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new Error(`Q2_TIMEOUT ${label}; ${JSON.stringify({ errors, requests: trace.length, waits: analyzeWaits([...waitEdges.values()]) })}`)); }, remaining);
    })]); } finally { if (timer) clearTimeout(timer); }
  };
  return { root, initialRootFacts, desktop, trace, errors, events, customerTrace, customerInputs, inferenceOrigin: `http://127.0.0.1:${address.port}`, pending, delegation, bounded, teardownFacts, publicationDiagnostics, queueDiagnostics, queueDiagnosticErrors, workerRuntimeObservations, pinnedChildObservations, pinObservationErrors, httpCounts, lifecycleObservations,
    inspectInventory: () => desktopProjectExecutionInventory(root),
    async openChief() {
      assert.equal(await desktop.pickProject(), root, "Actual native-selection callback must precede successful registration/listing");
      const listing = await desktop.listProject({ projectRoot: root }); assert.equal(listing.primaryRoleId, "chief");
      const opened = await desktop.openSession({ projectRoot: root, roleId: "chief", runtime: "codex" }); assert.equal(opened.ok, true, opened.error ?? "Real chief session failed");
    },
    async sendChief(text: string) {
      const clientMessageId = `q-git-client-${randomUUID()}`; customerInputs.push({ clientMessageId, text });
      writeTail("actual-chief-client-input", { roleId: "chief", clientMessageId, textBytes: Buffer.byteLength(text), textSha256: createHash("sha256").update(text).digest("hex") });
      const result = await bounded("public-chief-entry", () => desktop.sendSession({ text, target: { projectRoot: root, roleId: "chief", runtime: "codex" }, metadata: { clientMessageId } }));
      assert.equal(result.ok, true, JSON.stringify(result)); if (errors.length) throw new Error(errors.join("\n")); return result;
    },
    respond(id: string, decision: OperatorDecisionPayload) {
      assert.ok(pending.has(id), `UNPRESENTED_REQUEST ${id}`);
      const result = channel.respond({ id, decision }); customerTrace.push({ source: "test-customer", event: "response", id, decision, result });
      if (result.ok) { pending.delete(id); waitEdges.delete(id); } return result;
    },
    async observe() {
      const ledger = await readTaskState(root);
      return { inventory: desktopProjectExecutionInventory(root), creationFacts: readCreationFacts(), coordinator: inspectGitHostCoordinator({ projectRoot: root }), ledgerErrors: ledger.errors, ledger: ledger.events,
        tasks: [...ledger.records.values()].map(record => ({ taskId: record.taskId, created: record.created, reports: record.reports, closed: record.closed })),
        ...await observeFixtureGitMetadata(root), waits: analyzeWaits([...waitEdges.values()]) };
    },
    async save(file: string, extra: unknown = null) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      // Keep the previous attempt before updating the convenient current-path projection.
      try { await fs.copyFile(file, `${file}.${Date.now()}.previous.json`, fs.constants.COPYFILE_EXCL); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const at = new Date().toISOString(), observation = await this.observe();
      await fs.writeFile(file, JSON.stringify({ at, root, transport: "default-production Core/default CodexChat -> loopback HTTP",
        realModel: false, credential: "fixture-only; headers not captured", initialRootFacts, existingOwnedInput, customerInputs, trace, errors, events, customerTrace, effectActorSamples, publicationDiagnostics, queueDiagnostics, queueDiagnosticErrors, workerRuntimeObservations, pinnedChildObservations, pinObservationErrors, httpCounts, lifecycleObservations,
        receiverTransitions, observation, extra }, null, 2));
      if (file.endsWith("-full-final-proof.json")) {
        await fs.writeFile(file.replace(/-full-final-proof\.json$/, "-final-light-projection.json"), JSON.stringify({ at, root,
          fullProof: path.basename(file), errors, httpCounts, lastHttp: trace.slice(-3).map(row => ({ sequence: row.sequence, at: row.at, role: row.role,
            lastUser: row.request.messages.filter(message => message.role === "user").at(-1),
            lastToolResult: row.request.messages.filter(message => message.role === "tool").at(-1), reply: row.reply })),
          lastEvents: events.slice(-12), tasks: observation.tasks.map(task => ({ taskId: task.taskId, created: task.created,
            latestReport: task.reports.at(-1), reportCount: task.reports.length, closed: task.closed })),
          queue: { pendingOpens: observation.inventory.pendingOpens, queuedDispatches: observation.inventory.queuedDispatches,
            activeDeliveries: observation.inventory.activeDeliveries }, waits: observation.waits, ledgerErrors: observation.ledgerErrors }, null, 2));
      }
    },
    async dispose() {
      if (closed) return; closed = true;
      captureTeardown("begin-owned-cleanup");
      clearInterval(actorSampler);
      channel.rejectAllPending("Q2 isolated fixture shutdown; no task approval/cancellation inferred");
      captureTeardown("before-desktop-stop-all");
      await desktop.stopSession(); captureTeardown("all-desktop-sessions-stopped");
      captureTeardown("before-documents-dispose"); desktop.disposeProjectDocuments(); captureTeardown("after-documents-dispose");
      server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => { httpCounts.serverCloseCallbacks++; resolve(); }));
      captureTeardown("owned-http-server-closed");
      if (oldWire === undefined) delete process.env.ANS_CODEX_WIRE_API; else process.env.ANS_CODEX_WIRE_API = oldWire;
      if (oldKey === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = oldKey;
      captureTeardown("owned-cleanup-returned");
      await Promise.all(publicationDiagnosticWrites);
      await lifecycleWrites;
      if (options.tailDiagnosticFile) {
        await flushDiagnostics(); const status = getDiagnosticsStatus(); writeTail("existing-diagnostics-flushed", status); await disposeDiagnostics();
        assert.equal(status.lastError, undefined, "Owned existing diagnostics failed; missing stages cannot be interpreted as absence");
      }
      writeTail("owned-dispose-awaited", { http: { ...httpCounts }, ownSockets: ownSockets.size, errorCount: errors.length });
      process.stdout.write(`Q_DRIVER_DISPOSE_AWAITED ${JSON.stringify({ at: new Date().toISOString(), resources: process.getActiveResourcesInfo() })}\n`);
      // Keep all isolated files and Git objects for diagnosis. Never clean a user or dev checkout.
    },
    async samplePostCleanupDiagnostics() {
      // Known diagnostic owner, finite 1/5/15-second observations; never clears or unreferences another resource.
      for (const [index, delay] of [1000, 4000, 10000].entries()) {
        await new Promise(resolve => setTimeout(resolve, delay));
        observeOwnedLifecycle(`diagnostic-post-cleanup-${[1, 5, 15][index]}s`);
      }
      await lifecycleWrites;
    },
  };
}

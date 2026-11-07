// Q-only inference/transport replacement. All tools and business state remain production-owned.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createDesktopInterface, createDecisionDelegationSwitch } from "../../app/desktop/interface.ts";
import { createCustomerInputChannel, type OperatorDecisionPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { createTrunkService } from "../../src/service/trunk/public/trunk-service.ts";
import type { RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, ToolResult } from "../../src/model/runtime.ts";

export const SIX_ROLES = ["chief", "product", "rapporteur", "nominator", "convener", "verifier"] as const;
export type ScriptRole = typeof SIX_ROLES[number];
export type TraceEntry = { step: number; at: number; actor: string; action: string; detail: unknown };
export type WaitEdge = { waiter: string; resolver: string | null; event: string; external: boolean };

/** Driver diagnostics only: never writes application statuses or grants permissions. */
export function inspectWaits(edges: readonly WaitEdge[]) {
  const orphan = edges.filter(edge => !edge.resolver);
  const cycles: string[][] = [];
  const visit = (node: string, chain: string[]) => {
    const loop = chain.indexOf(node);
    if (loop >= 0) { cycles.push([...chain.slice(loop), node]); return; }
    for (const edge of edges.filter(edge => edge.waiter === node && !edge.external && edge.resolver))
      visit(edge.resolver!, [...chain, node]);
  };
  for (const node of new Set(edges.map(edge => edge.waiter))) visit(node, []);
  return { orphan, cycles, external: edges.filter(edge => edge.external && edge.resolver) };
}

export class ScriptBudget {
  readonly trace: TraceEntry[] = [];
  readonly waits = new Map<string, WaitEdge>();
  private readonly fingerprints = new Map<string, number>();
  private readonly started: number;
  readonly limits: { steps: number; timeoutMs: number; repeatedFingerprint: number };
  readonly now: () => number;
  constructor(limits: { steps: number; timeoutMs: number; repeatedFingerprint: number }, now = Date.now) {
    this.limits = limits; this.now = now;
    assert.ok(limits.steps > 0 && limits.timeoutMs > 0 && limits.repeatedFingerprint > 0);
    this.started = now();
  }
  step(actor: string, action: string, detail: unknown = null) {
    if (this.trace.length >= this.limits.steps || this.now() - this.started > this.limits.timeoutMs)
      throw new Error(`SCRIPT_BUDGET_EXHAUSTED ${JSON.stringify(this.trace.slice(-12))}`);
    this.trace.push({ step: this.trace.length + 1, at: this.now(), actor, action, detail });
  }
  fingerprint(facts: unknown) {
    const digest = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    const count = (this.fingerprints.get(digest) ?? 0) + 1;
    this.fingerprints.set(digest, count);
    if (count > this.limits.repeatedFingerprint)
      throw new Error(`NO_PROGRESS ${digest} ${JSON.stringify(this.trace.slice(-12))}`);
    return digest;
  }
  async bounded<T>(label: string, run: (signal: AbortSignal) => Promise<T>, timeoutMs = this.limits.timeoutMs): Promise<T> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([run(abort.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new Error(`SCRIPT_TIMEOUT ${label} ${JSON.stringify(this.trace.slice(-12))}`)); }, timeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
}

export interface ScriptTurn {
  roleId: ScriptRole;
  text: string;
  turn: number;
  toolNames: readonly string[];
  /** The production schema/tool handler receives exactly this input and abort signal. */
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  wait<T>(event: string, resolver: string, probe: () => Promise<T | undefined>, external?: boolean): Promise<T>;
}
export type RoleScript = (turn: ScriptTurn) => Promise<void>;
export type SixRoleScripts = Record<ScriptRole, readonly RoleScript[]>;

export function scriptedInference(scripts: SixRoleScripts, budget: ScriptBudget) {
  const turns = new Map<ScriptRole, number>();
  const finished = new Map<ScriptRole, number>();
  const errors: string[] = [];
  const seen = new Set<ScriptRole>();
  const factory: RuntimeProviderFactory = (options: RuntimeProviderOptions) => {
    // The product labels this injected external-provider boundary pi. No Pi SDK is imported.
    if (options.runtime !== "pi") throw new Error(`UNSCRIPTED_RUNTIME ${options.runtime}`);
    const compose = createDemoRuntimeAdapter(options, []);
    return {
      composeContext: role => compose.composeContext(role),
      async bindRole(role) {
        options.registerToolDisplayProfile?.({ credentials: [] });
        if (!SIX_ROLES.includes(role.id as ScriptRole)) throw new Error(`UNSCRIPTED_ROLE ${role.id}`);
        const roleId = role.id as ScriptRole;
        seen.add(roleId);
        const events = createEventQueue<SessionEvent>();
        const abort = new AbortController();
        return {
          runtime: "pi", roleId,
          events: () => events.stream,
          async prompt(text) {
            const turn = turns.get(roleId) ?? 0;
            turns.set(roleId, turn + 1);
            const script = scripts[roleId]?.[turn];
            if (!script) { const error = `UNSCRIPTED_TURN ${roleId}:${turn}`; errors.push(error); finished.set(roleId, turn + 1); throw new Error(error); }
            budget.step(roleId, "model-turn", { turn });
            budget.step(roleId, "production-tool-inventory", options.tools.map(tool => tool.name));
            try {
              await budget.bounded(`${roleId}:${turn}`, async signal => script({ roleId, text, turn,
                toolNames: options.tools.map(tool => tool.name),
                async call(name, args) {
                  abort.signal.throwIfAborted(); signal.throwIfAborted();
                  const tool = options.tools.find(tool => tool.name === name);
                  if (!tool) throw new Error(`PRODUCTION_CAPABILITY_MISSING ${roleId}:${name}`);
                  budget.step(roleId, "tool-call", { name, args });
                  const toolCallId = `q-${budget.trace.length}`;
                  events.push({ kind: "tool_call", roleId, runtime: "pi", summary: name, detail: { call: { name, args }, toolCallId } });
                  const result = await tool.handler({ name, args, toolCallId, signal: AbortSignal.any([signal, abort.signal]) });
                  budget.step(roleId, "tool-result", { name, result });
                  events.push({ kind: result.ok ? "accepted" : "denied", roleId, runtime: "pi", summary: result.message, detail: { toolName: name, toolCallId } });
                  return result;
                },
                async wait(event, resolver, probe, external = false) {
                  budget.waits.set(roleId, { waiter: roleId, resolver, event, external });
                  try {
                    for (;;) {
                      const result = await probe();
                      if (result !== undefined) return result;
                      const graph = inspectWaits([...budget.waits.values()]);
                      if (graph.cycles.length || graph.orphan.length) throw new Error(`WAIT_DEADLOCK ${JSON.stringify(graph)}`);
                      signal.throwIfAborted(); abort.signal.throwIfAborted();
                      await new Promise(resolve => setTimeout(resolve, 10));
                    }
                  } finally { budget.waits.delete(roleId); }
                },
              }));
              events.push({ kind: "settled", roleId, runtime: "pi", summary: "scripted inference completed", detail: { outcome: "completed" } });
            } catch (error) { errors.push(String(error)); throw error; }
            finally { finished.set(roleId, turn + 1); }
          },
          abort() { abort.abort(); },
          async dispose() { abort.abort(); events.close(); },
        };
      },
    };
  };
  const forbidden: RuntimeProviderFactory = options => { throw new Error(`UNSCRIPTED_RUNTIME ${options.runtime}; real SDK fallback forbidden`); };
  return { factory, providerFactories: { pi: factory, demo: forbidden, claude: forbidden, codex: forbidden }, turns, finished, seen, errors };
}

export type ProductionObservation = Awaited<ReturnType<typeof observeProduction>>;
export const SCENARIO_READINESS = [
  { id: "empty-null-cas", owner: "O/W", state: "partial", needs: "Actual intent-confirmed R9 producer and ordering, then product/rapporteur direct submit; no seeded base" },
  { id: "d3-zero-file-activation", owner: "G/W/O", state: "uncovered", needs: "Real D3 request -> scoped write_file x3 -> complete validation/activation -> worker dispatch" },
  { id: "new-session-old-run", owner: "G/O/W", state: "uncovered", needs: "Create a fresh old-run session after live card/boundary edits; verify frozen bytes and denied new permissions" },
  { id: "run-modes-creator-close", owner: "O/R/W", state: "uncovered", needs: "Three modes, actual reportRef lookup, creator-only close/dependency release; unknown native process tree stays blocked" },
  { id: "commit-recovery-supersede", owner: "O", state: "uncovered", needs: "Actual pre/post-CAS faults; committed/unfinalized cannot be replaced as pending" },
  { id: "environment-repair", owner: "W/O", state: "uncovered", needs: "Actual blocked tool -> retained request -> authorized owner tool repairs fixture -> production condition recheck" },
  { id: "independent-chief", owner: "W/R", state: "uncovered", needs: "Main chief waits for worker; independent chief decides same real request without circular wait" },
  { id: "delegation-races-directive-revise", owner: "W", state: "uncovered", needs: "Off/on, revision CAS, real directive preset, revise releases original Promise -> actual author write -> new request" },
  { id: "four-work-types", owner: "Q", state: "uncovered", needs: "Reuse actual new/change/refactor/bug chain fixture after null-CAS entry is established" },
  { id: "desktop-ui", owner: "Q/U/W", state: "prepared-only", needs: "Real page + frozen source; separate actual card/source/stop/history and six-role customer input observations" },
] as const;
export async function observeProduction(root: string) {
  const ledger = await readTaskState(root);
  const effective = await createTrunkService({ projectRoot: root }).readEffectiveSnapshot();
  return { ledgerErrors: ledger.errors, tasks: [...ledger.records.values()].map(record => ({
    taskId: record.taskId, created: record.created, reports: record.reports, closed: record.closed,
  })), trunk: effective.ok ? { manifest: effective.value.manifest, snapshot: { snapshotId: effective.value.snapshot.snapshotId, digest: effective.value.snapshot.digest } } : { unavailable: effective } };
}

export async function emptyProjectDriver(scripts: SixRoleScripts, limits = { steps: 120, timeoutMs: 5000, repeatedFingerprint: 3 }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "q-direct-empty-"));
  assert.deepEqual(await fs.readdir(root), [], "No prefilled config, D3, cards, workflow, pin or baseline");
  const budget = new ScriptBudget(limits);
  const inference = scriptedInference(scripts, budget);
  const pending = new Map<string, OperatorRequestPayload>();
  const customerTrace: { source: "test-customer"; id: string; decision: OperatorDecisionPayload; result: unknown }[] = [];
  const delegation = createDecisionDelegationSwitch(false);
  const channel = createCustomerInputChannel({ operatorId: "test-customer", delegation,
    presenter: payload => { pending.set(payload.id, payload); budget.step("test-customer", "request-presented", { id: payload.id, roleId: payload.roleId, request: payload.request }); },
    emitJudgeResult: payload => budget.step("application", "decision-result", payload),
  });
  const events: unknown[] = [];
  const desktop = createDesktopInterface({ pickDirectory: async () => root, emitEvent: event => events.push(event),
    runtimeOptions: { writeRoot: root, providerFactories: inference.providerFactories, requestAttemptMax: 1, persistSession: false, turnLastResortMs: limits.timeoutMs },
    customerInput: channel.customerInput, decisionJudgeSwitch: delegation,
    envFilePath: path.join(root, "no-real-credentials.env"), piConfigEnv: {},
    resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "selected", skipped: [] }),
  });
  const listing = await desktop.listProject({ projectRoot: root });
  assert.equal(listing.primaryRoleId, "chief", "Real empty-project enumeration selects chief");
  // Open real built-in sessions; their scripts run only when actual delivery or chief input arrives.
  for (const roleId of SIX_ROLES) {
    const opened = await desktop.openSession({ projectRoot: root, roleId, runtime: "pi" });
    assert.equal(opened.ok, true, `REAL_SESSION_OPEN ${roleId}: ${JSON.stringify(opened)}`);
  }
  return { root, desktop, channel, budget, inference, pending, customerTrace, events,
    async start(text: string) {
      const expected = (inference.turns.get("chief") ?? 0) + 1;
      const result = await budget.bounded("chief-customer-entry", () => desktop.sendSession({ text, target: { projectRoot: root, roleId: "chief", runtime: "pi" } }));
      assert.equal(result.ok, true, `CHIEF_ENTRY_REJECTED ${JSON.stringify(result)}`);
      await budget.bounded("actual chief inference termination", async signal => {
        while ((inference.finished.get("chief") ?? 0) < expected) {
          signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
        }
      });
      if (inference.errors.length) throw new Error(inference.errors.join("\n"));
      return result;
    },
    respond(id: string, decision: OperatorDecisionPayload) {
      assert.ok(pending.has(id), `Only actual presented request ids may be answered: ${id}`);
      const result = channel.respond({ id, decision });
      customerTrace.push({ source: "test-customer", id, decision, result });
      if (result.ok) pending.delete(id);
      return result;
    },
    observe: () => observeProduction(root),
    async dispose() {
      channel.rejectAllPending("Q driver teardown; not task cancellation or approval");
      for (const roleId of SIX_ROLES) await desktop.stopSession({ roleId, projectRoot: root, runtime: "pi" });
      desktop.disposeProjectDocuments();
      // Preserve isolated artifacts for diagnosis; no cleanup of customer files or product outputs.
    },
  };
}

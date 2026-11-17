import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { createCustomerInputChannel, type OperatorRequestPayload } from "../../../app/desktop/customer-input.ts";
import { createDesktopInterface } from "../../../app/desktop/interface.ts";
import { DesktopDurableWorkflow } from "../../../app/desktop/durable-workflow.ts";
import { buildDesktopShellArming } from "../../../app/desktop/operator-channel.ts";
import { createDesktopBaselineGitPort } from "../../../app/desktop/workflow-git.ts";
import { createEventQueue } from "../../../src/common/runtime-core/event-queue.ts";
import { createNetworkGate } from "../../../src/common/runtime-core/network-gate.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import type { DurableResult } from "../../../src/model/durable-workflow.ts";
import type { RuntimeProviderFactory, SessionEvent, ToolResult } from "../../../src/model/runtime.ts";
import { writeRealPinnedAns } from "../existing-project-compat-verify/fixture.ts";

export const resourceRoot = process.env.ANS_W5_DAPR_ROOT;
export const target = "src/core/snake.ts";
export const analysis = "docs/governance/w5-analysis.md";
export const operatorReport = "docs/quality/w5-operator.md";
export const fix = "export const SNAKE = 2;\n";

export function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result.value;
}

export function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export async function write(root: string, relative: string, bytes: string) {
  const name = path.join(root, relative);
  await fs.mkdir(path.dirname(name), { recursive: true });
  await fs.writeFile(name, bytes, "utf8");
}

export async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w5-dapr-"));
  const root = path.join(directory, "project");
  const userDataRoot = path.join(directory, "data");
  // frozen fixed-path test shape: main, core module and worker. This fixture uses its boundary fallback.
  await write(root, target, "export const SNAKE = 1;\n");
  await write(root, "角色卡/worker/role-card.md", "---\nroleId: worker\ndisplayName: Worker\n---\n# Test module owner\n");
  await write(root, "角色卡/worker/boundary.md", "# Boundary\n\n## Section 1: 可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |\n| 目录 | `src/core/` | Core |\n");
  await write(root, "角色卡/worker/boundary.yaml", "role: worker\nentries:\n  - root: project\n    path: src/core/\n    kind: directory\n    purpose: Core\n");
  // Model an already governed project. Use the established fixture with hashes of the actual
  // role files, then select the existing trio mode. The product loader and write gate check it.
  writeRealPinnedAns(root, ["worker"]);
  const config = JSON.parse(await fs.readFile(path.join(root, ".ans/project.json"), "utf8"));
  await write(root, ".ans/project.json", JSON.stringify({ ...config, governanceModel: "trio", workflowSchema: "two-fixed-paths/v1" }));
  for (const name of ["path-b", "read-only-example"]) {
    await write(root, `docs/workflows/${name}.yaml`, await fs.readFile(`docs/workflows/${name}.yaml`, "utf8"));
  }
  await write(root, ".gitignore", "/docs/governance/\n/docs/quality/\n/docs/workflows/\n");
  await write(root, analysis, "# Fixture analysis\n\nCore owns the collision threshold in src/core/snake.ts.\n");
  await write(root, operatorReport, "# Fixture verification inputs\n\nScripted collision threshold changes from 1 to 2. Online inference was not tested.\n");
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "ANS W5 local test");
  git(root, "config", "user.email", "ans-w5@test.invalid");
  const ignore = await createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
  assert.equal(ignore.ok, true, JSON.stringify(ignore));
  git(root, "add", "-A");
  git(root, "commit", "-m", "Isolated baseline");
  const baselineOid = git(root, "rev-parse", "main");
  return { directory, root, userDataRoot, baselineOid };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
export type ModelTurn = { roleId: string; text: string; turnId?: string; call(name: string, args: Record<string, unknown>): Promise<ToolResult> };
export type Log = (event: string, value: unknown) => void;

export function modelFixture(script: (turn: ModelTurn) => Promise<void>, log: Log) {
  let sequence = 0;
  const errors: unknown[] = [];
  const factory: RuntimeProviderFactory = options => ({
    async composeContext() { return { systemPrompt: "Deterministic W5 model transport fixture" }; },
    async bindRole(role) {
      options.registerToolDisplayProfile?.({ credentials: [] });
      const queue = createEventQueue<SessionEvent>();
      let abort = new AbortController();
      return {
        runtime: options.runtime, roleId: role.id, contextSource: "fresh",
        async prompt(text) {
          abort = new AbortController();
          const turnId = options.currentTurnId();
          const roleId = role.id;
          log("model-turn", { roleId, turnId, text, tools: options.tools.map(tool => tool.name) });
          try {
            await script({ roleId, text, turnId, async call(name, args) {
              const tool = options.tools.find(candidate => candidate.name === name);
              assert.ok(tool, `${roleId} missing actual ${name} capability`);
              const toolCallId = `w5-${++sequence}`;
              const result = await tool.handler({ name, args, toolCallId, signal: abort.signal });
              log("tool-result", { roleId, turnId, name, args, result });
              return result;
            } });
            queue.push({ kind: "settled", roleId, turnId, summary: "W5 fixture model completed", detail: { outcome: "completed" } });
          } catch (error) {
            errors.push(error);
            log("model-error", String(error));
            throw error;
          }
        },
        events: () => queue.stream,
        abort() { abort.abort(); },
        async dispose() { abort.abort(); queue.close(); },
      };
    },
  });
  return { factory, errors };
}

type PathBHooks = {
  beforeScope?(turn: ModelTurn, request: Record<string, unknown>): Promise<void>;
  afterScope?(turn: ModelTurn, request: Record<string, unknown>): Promise<void>;
  afterImplementationReport?(): Promise<void>;
};

export function pathBModel(f: Fixture, instanceId: () => string, log: Log, hooks: PathBHooks = {}) {
  const flowId = "snake";
  const runs = new Map<string, number>();
  const model = modelFixture(async turn => {
    const { roleId } = turn;
    const run = (runs.get(roleId) ?? 0) + 1;
    runs.set(roleId, run);
    if (roleId === "chief") {
      assert.ok(run <= 2, `Unexpected lead turn ${run}`);
      const stage = run === 1 ? "B1" : "B3";
      const request = { roleId: "convener", task: `Advance ${stage} for collision repair`, flowId,
        workflowId: instanceId(), taskKind: "stage-request", workflowPath: "B", stage, workflowAction: "advance", sideEffect: "read-only",
        ...(stage === "B3" ? { requestedEvidence: [target], reason: "Verified analysis identifies the single source file" } : {}) };
      if (stage === "B3") await hooks.beforeScope?.(turn, request);
      await successful(turn, "dispatch_task", request);
      if (stage === "B3") await hooks.afterScope?.(turn, request);
      return;
    }
    if (roleId === "convener" && (run === 1 || run === 3)) {
      const stage = run === 1 ? "B1" : "B3";
      await successful(turn, "dispatch_task", { roleId: "worker", task: `W5 ${stage} assigned file ${target}`, flowId, workflowId: instanceId(),
        stage, sideEffect: stage === "B1" ? "read-only" : "code", moduleId: "core", modulePaths: [target] });
      return;
    }
    if (roleId === "convener" && (run === 2 || run === 4)) {
      const stage = run === 2 ? "B1" : "B3";
      const saved = await readTaskState(f.root);
      const records = [...saved.records.values()].filter(record => record.created?.to === "worker" && record.created.stage === stage);
      assert.equal(records.length, 1);
      await successful(turn, "close_created_task", { operationId: `w5-close-${stage}`, taskId: records[0].taskId, outcome: "accepted" });
      await successful(turn, "submit_report", { status: "completed", summary: `W5 accepted actual ${stage} worker report`, evidence: [stage === "B1" ? analysis : operatorReport] });
      return;
    }
    if (roleId === "worker" && run === 1) {
      await successful(turn, "read_file", { path: target });
      await successful(turn, "submit_report", { status: "completed", summary: "Analysis identifies the collision threshold", evidence: [analysis] });
      return;
    }
    if (roleId === "worker" && run === 2) {
      await successful(turn, "write_file", { path: target, content: fix });
      await successful(turn, "run_shell", { command: `git add ${target}` });
      await successful(turn, "run_shell", { command: 'git commit -m "W5 fix collision threshold"' });
      await successful(turn, "submit_report", { status: "completed", summary: "Changed only the collision threshold", evidence: [target] });
      await hooks.afterImplementationReport?.();
      return;
    }
    assert.fail(`Unscripted role turn ${roleId}:${run}`);
  }, log);
  return { ...model, runs };
}

export async function app(f: Fixture, model: ReturnType<typeof modelFixture>, log: Log) {
  const durable = new DesktopDurableWorkflow({ userDataRoot: f.userDataRoot, resourceRoot: resourceRoot! });
  const networkGate = createNetworkGate();
  const cards = new Map<string, OperatorRequestPayload>();
  const channel = createCustomerInputChannel({
    operatorId: "w5-isolated-customer",
    presenter: card => { cards.set(card.id, card); log("customer-card", card); },
    onExpired: card => { cards.delete(card.id); log("customer-card-closed", card); },
  });
  const desktop = createDesktopInterface({
    durableWorkflow: durable,
    pickDirectory: async () => f.root,
    emitEvent: envelope => {
      if (["settled", "handback", "denied"].includes(envelope.event.kind)) log("desktop-event", envelope);
    },
    envFilePath: path.join(f.directory, "empty.env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(f.directory, "runtime-selection.json"),
    runtimeOptions: { providerFactories: { pi: model.factory }, persistSession: true, networkGate },
    resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "selected", skipped: [] }),
    customerInput: channel.customerInput,
    shellArming: buildDesktopShellArming(),
    shellOperatorChannel: () => ({ outcome: "unavailable", reason: "W5 disables arbitrary shell escalation" }),
  });
  await durable.resume();
  assert.equal(await desktop.pickProject(), f.root);
  const listing = await desktop.listProject({ projectRoot: f.root });
  assert.ok(listing.roles.some(role => role.roleId === "worker"), JSON.stringify(listing.roles));
  return { desktop, durable, cards,
    simulateNetwork(online: boolean) {
      const state = { online, source: "main-net", reason: online ? "resume" : "interface-down", at: Date.now(), stableForMs: 0 } as const;
      networkGate.apply(state);
      desktop.applyNetworkState(state);
      log("model-network-state-injected", state);
    },
    async respond(id: string, selected: string) {
      const input = { id, decision: { kind: "choice", selected: [selected] } };
      const result = await channel.respondDurable(input) ?? await desktop.replayDurableReleaseDecision(input) ?? channel.respond(input);
      log("customer-receipt", { input, result });
      return result;
    },
    async close() {
      desktop.disposeProjectDocuments();
      channel.rejectAllPending("isolated W5 window closed");
      await desktop.stopSession({ roleId: null });
      await durable.close();
    },
  };
}

export async function until<T>(phase: string, probe: () => Promise<T | undefined>, errors: unknown[]) {
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    if (errors.length) throw errors[0];
    const value = await probe();
    if (value !== undefined) return value;
    await delay(250);
  }
  assert.fail(`Timed out waiting for ${phase}`);
}

export function businessDb<T>(f: Fixture, run: (db: DatabaseSync) => T, writable = false): T {
  const db = new DatabaseSync(path.join(f.userDataRoot, "business", "ans-workflow.sqlite"), { readOnly: !writable });
  try {
    db.exec("PRAGMA busy_timeout = 2000");
    return run(db);
  } finally { db.close(); }
}

export function sqliteSnapshot(f: Fixture, instanceId: string): Record<string, Record<string, unknown>[]> {
  return businessDb(f, db => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    return Object.fromEntries(tables.flatMap(({ name }) => {
      assert.match(String(name), /^[a-z_]+$/);
      if (!db.prepare(`PRAGMA table_info(${name})`).all().some(column => column.name === "instance_id")) return [];
      return [[name, db.prepare(`SELECT * FROM ${name} WHERE instance_id = ?`).all(instanceId)]];
    }));
  });
}

export async function successful(turn: ModelTurn, name: string, args: Record<string, unknown>) {
  const result = await turn.call(name, args);
  assert.equal(result.ok, true, `${turn.roleId}/${name}: ${result.message}`);
}

export async function daprdListener(f: Fixture) {
  const { http } = JSON.parse(await fs.readFile(path.join(f.userDataRoot, "dapr", "ports.json"), "utf8"));
  assert.ok(Number.isInteger(http) && http > 0 && http <= 65535);
  const listeners = execFileSync("netstat.exe", ["-ano", "-p", "TCP"], { encoding: "utf8", windowsHide: true });
  for (const line of listeners.split(/\r?\n/)) {
    const [protocol, local, remote, _state, pid] = line.trim().split(/\s+/);
    if (protocol === "TCP" && local === `127.0.0.1:${http}` && remote === "0.0.0.0:0" && /^\d+$/.test(pid)) {
      return { port: http, pid: Number(pid) };
    }
  }
  return undefined;
}

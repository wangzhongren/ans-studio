import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCustomerInputChannel, MERGE_MAIN_OPTION_IDS, type OperatorRequestPayload } from "../../../app/desktop/customer-input.ts";
import { createDesktopInterface } from "../../../app/desktop/interface.ts";
import { DesktopDurableWorkflow } from "../../../app/desktop/durable-workflow.ts";
import { buildDesktopShellArming } from "../../../app/desktop/operator-channel.ts";
import { createDesktopBaselineGitPort } from "../../../app/desktop/workflow-git.ts";
import { createEventQueue } from "../../../src/common/runtime-core/event-queue.ts";
import { createNetworkGate } from "../../../src/common/runtime-core/network-gate.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import type { DurableResult } from "../../../src/model/durable-workflow.ts";
import type { RuntimeProviderFactory, SessionEvent, ToolResult } from "../../../src/model/runtime.ts";
import { legacyPathB } from "../../编排/durable-workflow/fixture.ts";
import { writeRealPinnedAns } from "../existing-project-compat-verify/fixture.ts";

export const resourceRoot = process.env.ANS_W5_DAPR_ROOT;
const sourceAppRoot = fileURLToPath(new URL("../../../", import.meta.url));
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

export async function emptyFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w5-dapr-"));
  const root = path.join(directory, "project");
  const userDataRoot = path.join(directory, "data");
  await fs.mkdir(root);
  return { directory, root, userDataRoot };
}

export async function fixture(options: { installLegacyPathB?: boolean; existingIndependentRoster?: boolean } = {}) {
  const { directory, root, userDataRoot } = await emptyFixture();
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
  if (options.installLegacyPathB !== false) await write(root, "docs/workflows/path-b.yaml", legacyPathB);
  await write(root, "docs/workflows/read-only-example.yaml",
    await fs.readFile(new URL("../../../docs/workflows/read-only-example.yaml", import.meta.url), "utf8"));
  await write(root, ".gitignore", "/docs/governance/\n/docs/quality/\n/docs/workflows/\n");
  await write(root, analysis, "# Fixture analysis\n\nCore owns the collision threshold in src/core/snake.ts.\n");
  await write(root, operatorReport, "# Fixture verification inputs\n\nScripted collision threshold changes from 1 to 2. Online inference was not tested.\n");
  if (options.existingIndependentRoster) await installExistingRoster(root);
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

async function installExistingRoster(root: string) {
  const intent = "docs/product/snake-intent-v1.md";
  const proposal = "docs/proposals/snake-proposal-v1.md";
  const architecture = "docs/contracts/snake-architecture-v1.md";
  const start = (schema: string, properties: string) => `---\nschema: ${schema}\nflowId: snake\nversion: 1\n${properties}\n---\n`;
  const module = `  - id: core\n    name: Core\n    purpose: Existing collision threshold\n    path: src/core/\n    category: core\n    publicContract: ${target}\n    architectureSource: ${architecture}`;
  await write(root, intent, start("project-intent/v1", "intentId: snake-intent\ngoal: Maintain the existing threshold") + "# Existing intent\n");
  await write(root, proposal, start("project-proposal/v2", `intent: ${intent}`) + "# Existing proposal\n");
  await write(root, architecture, start("project-architecture/v1", `proposal: ${proposal}`) + `proposal: ${proposal}\n`);
  await write(root, "docs/proposals/snake-modules-v1.md", start("project-modules/v2", `modules:\n${module}`) + "# Existing modules\n");
  await write(root, "docs/proposals/snake-roster-v1.md", start("project-roster/v4",
    `intent: ${intent}\nproposal: ${proposal}\narchitecture: ${architecture}\nenvBootstrap:\n  omitted: true\n  omissionReason: Existing isolated project\nroles:\n  - id: worker\n    displayName: Worker\n    purpose: Maintains the existing module\n    capability: TypeScript\n    modules: [core]\nmodules:\n${module}`)
    + "# Existing roster\n## 人员+模块拓扑图\n```topology\nschema: project-topology/v2\nmanagement: [convener, worker]\nmodules:\n  - id: core\n    path: src/core/\n    roleId: worker\nroles:\n  - id: worker\n    modules: [core]\n```\n");
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
type WorkspaceFixture = Awaited<ReturnType<typeof emptyFixture>>;
export type ModelTurn = { roleId: string; text: string; turnId?: string; signal: AbortSignal; toolNames: readonly string[]; call(name: string, args: Record<string, unknown>): Promise<ToolResult> };
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
          const toolNames = options.tools.map(tool => tool.name);
          log("model-turn", { roleId, turnId, text, tools: toolNames });
          try {
            await script({ roleId, text, turnId, signal: abort.signal, toolNames, async call(name, args) {
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
  changes?: readonly { path: string; content: string }[];
  beforeScope?(turn: ModelTurn, request: Record<string, unknown>): Promise<void>;
  afterScope?(turn: ModelTurn, request: Record<string, unknown>): Promise<void>;
  afterImplementationReport?(): Promise<void>;
};

export function pathBModel(f: Fixture, instanceId: () => string, log: Log, hooks: PathBHooks = {}) {
  const flowId = "snake";
  const changes = hooks.changes ?? [{ path: target, content: fix }];
  const files = changes.map(change => change.path);
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
        ...(stage === "B3" ? { requestedEvidence: files, reason: "Verified analysis identifies the affected source files" } : {}) };
      if (stage === "B3") await hooks.beforeScope?.(turn, request);
      await successful(turn, "dispatch_task", request);
      if (stage === "B3") await hooks.afterScope?.(turn, request);
      return;
    }
    if (roleId === "convener" && (run === 1 || run === 3)) {
      const stage = run === 1 ? "B1" : "B3";
      await successful(turn, "dispatch_task", { roleId: "worker", task: `W5 ${stage} assigned ${files.join(", ")}`, flowId, workflowId: instanceId(),
        stage, sideEffect: stage === "B1" ? "read-only" : "code", moduleId: "core", modulePaths: files });
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
      for (const file of files) await successful(turn, "read_file", { path: file });
      await successful(turn, "submit_report", { status: "completed", summary: "Analysis identifies the collision threshold", evidence: [analysis] });
      return;
    }
    if (roleId === "worker" && run === 2) {
      for (const { path, content } of changes) await successful(turn, "write_file", { path, content });
      await successful(turn, "run_shell", { command: `git add ${files.join(" ")}` });
      await successful(turn, "run_shell", { command: 'git commit -m "W5 fix collision threshold"' });
      await successful(turn, "submit_report", { status: "completed", summary: "Changed only the collision thresholds in scope", evidence: files });
      await hooks.afterImplementationReport?.();
      return;
    }
    assert.fail(`Unscripted role turn ${roleId}:${run}`);
  }, log);
  return { ...model, runs };
}

type AppFixtureOptions = {
  pickWorkflowDefinition?: () => Promise<string | null>;
  bundleResources?: string;
};

export async function app(f: WorkspaceFixture, model: ReturnType<typeof modelFixture>, log: Log, options: AppFixtureOptions = {}) {
  const { bundleResources, pickWorkflowDefinition } = options;
  const presetRoot = bundleResources ? path.join(bundleResources, "app") : sourceAppRoot;
  const moduleUrl = (file: string) => pathToFileURL(path.join(presetRoot, file)).href;
  const { DesktopDurableWorkflow: Controller } = bundleResources
    ? await import(moduleUrl("app/desktop/durable-workflow.ts")) as typeof import("../../../app/desktop/durable-workflow.ts")
    : { DesktopDurableWorkflow };
  const { createDesktopInterface: desktopInterface } = bundleResources
    ? await import(moduleUrl("app/desktop/interface.ts")) as typeof import("../../../app/desktop/interface.ts")
    : { createDesktopInterface };
  const { createCustomerInputChannel: customerChannel } = bundleResources
    ? await import(moduleUrl("app/desktop/customer-input.ts")) as typeof import("../../../app/desktop/customer-input.ts")
    : { createCustomerInputChannel };
  const { createNetworkGate: network } = bundleResources
    ? await import(moduleUrl("src/common/runtime-core/network-gate.ts")) as typeof import("../../../src/common/runtime-core/network-gate.ts")
    : { createNetworkGate };
  const { buildDesktopShellArming: shellArming } = bundleResources
    ? await import(moduleUrl("app/desktop/operator-channel.ts")) as typeof import("../../../app/desktop/operator-channel.ts")
    : { buildDesktopShellArming };
  const durable = new Controller({
    userDataRoot: f.userDataRoot, resourceRoot: bundleResources ?? resourceRoot!, presetRoot,
  });
  const networkGate = network();
  const cards = new Map<string, OperatorRequestPayload>();
  const channel = customerChannel({
    operatorId: "w5-isolated-customer",
    presenter: card => { cards.set(card.id, card); log("customer-card", card); },
    onExpired: card => { cards.delete(card.id); log("customer-card-closed", card); },
  });
  const desktop = desktopInterface({
    durableWorkflow: durable,
    pickDirectory: async () => f.root,
    pickWorkflowDefinition,
    emitEvent: envelope => {
      if (["settled", "handback", "denied"].includes(envelope.event.kind)) log("desktop-event", envelope);
    },
    envFilePath: path.join(f.directory, "empty.env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(f.directory, "runtime-selection.json"),
    runtimeOptions: { providerFactories: { pi: model.factory }, persistSession: true, networkGate },
    resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "selected", skipped: [] }),
    customerInput: channel.customerInput,
    shellArming: shellArming(),
    shellOperatorChannel: () => ({ outcome: "unavailable", reason: "W5 disables arbitrary shell escalation" }),
  });
  await durable.resume();
  assert.equal(await desktop.pickProject(), f.root);
  const listing = await desktop.listProject({ projectRoot: f.root });
  if ("baselineOid" in f) assert.ok(listing.roles.some(role => role.roleId === "worker"), JSON.stringify(listing.roles));
  return { desktop, durable, cards, listing,
    simulateNetwork(online: boolean) {
      const state = { online, source: "main-net", reason: online ? "resume" : "interface-down", at: Date.now(), stableForMs: 0 } as const;
      networkGate.apply(state);
      desktop.applyNetworkState(state);
      log("model-network-state-injected", state);
    },
    async respond(id: string, selected: string | readonly string[]) {
      const input = { id, decision: { kind: "choice", selected: typeof selected === "string" ? [selected] : [...selected] } };
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

export function businessDb<T>(f: WorkspaceFixture, run: (db: DatabaseSync) => T, writable = false): T {
  const db = new DatabaseSync(path.join(f.userDataRoot, "business", "ans-workflow.sqlite"), { readOnly: !writable });
  try {
    db.exec("PRAGMA busy_timeout = 2000");
    return run(db);
  } finally { db.close(); }
}

export function sqliteSnapshot(f: WorkspaceFixture, instanceId: string): Record<string, Record<string, unknown>[]> {
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

export async function daprdListener(f: WorkspaceFixture) {
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

export type PackagedRun = {
  f: Fixture;
  bundleResources: string;
  resume?: { instanceId: string; approvalId: string; definitionDigest: string; projectId: string };
};

export async function runPackagedPathB({ f, bundleResources, resume }: PackagedRun, log: Log) {
  let instanceId = resume?.instanceId ?? "";
  const model = resume ? modelFixture(async () => assert.fail("Resuming pending v1 B4 must not replay a business model task"), log)
    : pathBModel(f, () => instanceId, log);
  const handle = await app(f, model, log, { bundleResources });
  try {
    const select = { projectRoot: f.root };
    if (!resume) {
      const started = unwrap(await handle.desktop.startDurableWorkflow({ ...select, definitionId: "path-b", enabled: true,
        requestId: "w5-packaged-v1-path-b", summary: "Fix the existing threshold in the isolated Git project" }));
      assert.ok(started.instance);
      instanceId = started.instance.instanceId;
    }
    const getProjection = () => handle.desktop.getDurableWorkflowProjection({ ...select, instanceId }).then(unwrap);
    const approval = await until("original real v1 merge card", async () => [...handle.cards.values()].find(card => card.request.cardKind === "merge-main"), model.errors);
    const current = (await getProjection()).instance;
    assert.ok(current?.approval);
    assert.equal(current.approval.requestId, approval.id);
    assert.equal(approval.request.application, true);
    assert.equal(git(f.root, "rev-parse", "main"), f.baselineOid);
    const worker = await daprdListener(f);
    assert.ok(worker);
    const wait = { instanceId, approvalId: approval.id, definitionDigest: current.definitionDigest, projectId: current.projectId };
    const child = { pid: process.pid, executable: process.execPath, node: process.version, electron: process.versions.electron, worker };
    const before = sqliteSnapshot(f, instanceId);
    log("package-v1-pending", { child, wait, current, before });
    if (!resume) return { child, wait };

    assert.deepEqual(wait, resume);
    assert.equal((await handle.respond(approval.id, MERGE_MAIN_OPTION_IDS[0])).ok, true);
    const delivered = await until("resumed same v1 instance merged and delivery pending", async () => {
      const view = (await getProjection()).instance;
      return view?.status === "delivered" && view.delivery?.state === "pending" ? view : undefined;
    }, model.errors);
    const mergedHead = git(f.root, "rev-parse", "main");
    assert.equal(git(f.root, "diff", "--name-only", f.baselineOid, mergedHead), target);
    assert.equal(git(f.root, "show", `main:${target}`), fix.trim());
    const delivery = { ...select, instanceId, deliveryId: delivered.delivery!.id };
    const details = unwrap(await handle.desktop.readDurableWorkflowDelivery(delivery));
    const receipt = unwrap(await handle.desktop.acknowledgeDurableWorkflowDelivery({ ...delivery, viewToken: details.viewToken }));
    assert.equal(receipt.state, "delivered");
    const after = sqliteSnapshot(f, instanceId);
    const mergeEffects = after.effect?.filter(row => String(row.business_key).startsWith("release-merge:"));
    assert.equal(mergeEffects?.length, 1);
    assert.equal(mergeEffects?.[0].state, "succeeded");
    log("package-v1-delivered", { delivered, receipt, mergedHead, after });
    return { child, wait, mergedHead, receipt };
  } finally {
    await handle.close();
  }
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCustomerInputChannel, MERGE_MAIN_OPTION_IDS, type OperatorRequestPayload } from "../../../app/desktop/customer-input.ts";
import { createDecisionDelegationSwitch, createDesktopInterface, createShellJudgeSwitch } from "../../../app/desktop/interface.ts";
import { DesktopDurableWorkflow, type DesktopDurableView } from "../../../app/desktop/durable-workflow.ts";
import { buildDesktopShellArming, createDesktopOperatorChannel, type OperatorDecision, type OperatorPresenter,
  type ShellJudgeResultPayload } from "../../../app/desktop/operator-channel.ts";
import { createDesktopBaselineGitPort } from "../../../app/desktop/workflow-git.ts";
import { WORKFLOW_START_OPTION_IDS, type DesktopWorkflowStartProposal } from "../../../app/desktop/workflow-chief-start.ts";
import { createEventQueue } from "../../../src/common/runtime-core/event-queue.ts";
import { createNetworkGate } from "../../../src/common/runtime-core/network-gate.ts";
import { readTaskState } from "../../../src/common/编排/task-state.ts";
import { DEFAULT_EVIDENCE_COLLECTOR, type DurableInstanceRef, type DurableProjection, type DurableResult } from "../../../src/model/durable-workflow.ts";
import type { ChiefDecisionExecutionContext, RuntimeProviderFactory, SessionEvent, ToolResult } from "../../../src/model/runtime.ts";
import { isChiefDecisionExecutionContext } from "../../../src/model/runtime.ts";
import { legacyPathB } from "../../编排/durable-workflow/fixture.ts";
import { writeRealPinnedAns } from "../existing-project-compat-verify/fixture.ts";

export const resourceRoot = process.env.ANS_W5_DAPR_ROOT;
const sourceAppRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const historicalR19Resources = path.join(sourceAppRoot,
  "release-output/yaml-owned-fixed-flow-candidate/windows-x64-r19-a12b-preview-diagnostic-handoff/resources");
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

export async function emptyFixture(scratchRoot = os.tmpdir()) {
  const directory = await fs.mkdtemp(path.join(scratchRoot, "ans-w5-dapr-"));
  const root = path.join(directory, "project");
  const userDataRoot = path.join(directory, "data");
  await fs.mkdir(root);
  return { directory, root, userDataRoot };
}

export function evidenceCollectorRoleFiles(writeDomain: string) {
  const location = `角色卡/${DEFAULT_EVIDENCE_COLLECTOR}/`;
  return {
    card: { path: location + "role-card.md", content: `---\nroleId: ${DEFAULT_EVIDENCE_COLLECTOR}\ndisplayName: Evidence collector\n---\n# Collection\n` },
    boundaryMd: { path: location + "boundary.md", content: `# 边界\n\n## Section 1: 可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |\n| 目录 | ${writeDomain} | Evidence |\n` },
    boundaryYaml: { path: location + "boundary.yaml", content: `role: ${DEFAULT_EVIDENCE_COLLECTOR}\nentries:\n  - root: project\n    path: ${writeDomain}\n    kind: directory\n    purpose: Evidence\n` },
  };
}

export async function fixture(options: {
  installLegacyPathB?: boolean;
  existingIndependentRoster?: boolean;
  evidenceCollector?: boolean;
  nativeProjectSelection?: boolean;
} = {}) {
  const raw = await emptyFixture();
  const root = options.nativeProjectSelection && process.platform === "win32" ? await fs.realpath(raw.root) : raw.root;
  const directory = path.dirname(root);
  const workspace: WorkspaceFixture = options.nativeProjectSelection
    ? { directory, root, selectedRoot: raw.root, userDataRoot: path.join(directory, "data") }
    : raw;
  // frozen fixed-path test shape: main, core module and worker. This fixture uses its boundary fallback.
  await write(root, target, "export const SNAKE = 1;\n");
  await write(root, "角色卡/worker/role-card.md", "---\nroleId: worker\ndisplayName: Worker\n---\n# Test module owner\n");
  await write(root, "角色卡/worker/boundary.md", "# Boundary\n\n## Section 1: 可修改文件与目录\n\n| 类型 | 路径 | 用途 |\n| --- | --- | --- |\n| 目录 | `src/core/` | Core |\n");
  await write(root, "角色卡/worker/boundary.yaml", "role: worker\nentries:\n  - root: project\n    path: src/core/\n    kind: directory\n    purpose: Core\n");
  // Model an already governed project. Use the established fixture with hashes of the actual
  // role files, then select the existing trio mode. The product loader and write gate check it.
  if (options.evidenceCollector) {
    for (const doc of Object.values(evidenceCollectorRoleFiles("docs/verification/"))) await write(root, doc.path, doc.content);
  }
  writeRealPinnedAns(root, options.evidenceCollector ? ["worker", DEFAULT_EVIDENCE_COLLECTOR] : ["worker"]);
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
  return { ...workspace, baselineOid };
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
type WorkspaceFixture = Awaited<ReturnType<typeof emptyFixture>> & {
  selectedRoot?: string;
};
export type ModelTurn = { roleId: string; text: string; turnId?: string; signal: AbortSignal; toolNames: readonly string[];
  chiefDecisionContext?: ChiefDecisionExecutionContext;
  shellJudgeSystemText?: string;
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> };
export type Log = (event: string, value: unknown) => void;

export async function decideBounded(turn: ModelTurn, selected: readonly string[], log: Log) {
  const context = turn.chiefDecisionContext;
  assert.ok(context?.request.durableWorkflow && isChiefDecisionExecutionContext(context));
  assert.equal(turn.roleId, "chief");
  assert.deepEqual(turn.toolNames, ["decide_pending_request"]);
  assert.equal(context.productionWriteAuthority, false);
  const { requestId, baseDigest, delegationRevision } = context.request;
  const prompt = JSON.parse(turn.text) as { request: typeof context.request; evidence: string };
  assert.deepEqual(prompt.request, context.request);
  assert.ok(prompt.evidence.trim());
  log("controlled-chief-boundary", { context, evidence: prompt.evidence });
  return turn.call("decide_pending_request", { requestId, baseDigest, delegationRevision, disposition: "select", selected,
    reason: "The application supplied the current approved evidence for this isolated fixture." });
}

export function modelFixture(script: (turn: ModelTurn) => Promise<void>, log: Log) {
  let sequence = 0;
  const errors: unknown[] = [];
  const ordinaryChiefTurns = new Map<string, (turn: ModelTurn) => Promise<void>>();
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
            const originalRequest = text.startsWith("【系统通知·会话重建】") ? text.slice(text.indexOf("\n\n") + 2) : text;
            const next = roleId === "chief" ? ordinaryChiefTurns.get(originalRequest) ?? script : script;
            await next({ roleId, text, turnId, signal: abort.signal, toolNames, chiefDecisionContext: options.chiefDecisionContext,
              ...(roleId === "shell-judge" ? { shellJudgeSystemText: role.cardText } : {}), async call(name, args, signal) {
              const tool = options.tools.find(candidate => candidate.name === name);
              assert.ok(tool, `${roleId} missing actual ${name} capability`);
              if (process.env.ANS_F6_ANNOTATED_CRITERIA === "1" && name === "submit_report" && Array.isArray(args.evidence)) {
                const criteria = args.evidence.filter((entry): entry is string => typeof entry === "string"
                  && /^docs\/quality\/[^/]+-criteria-v[1-9]\d*\.md$/.test(entry));
                if (criteria.length) {
                  const reader = options.tools.find(candidate => candidate.name === "read_file");
                  assert.ok(reader, `${roleId} must read back its actual standard before the annotated report`);
                  for (const file of criteria) {
                    const readArgs = { path: file };
                    const readResult: ToolResult = await reader.handler({ name: "read_file", args: readArgs,
                      toolCallId: `w5-${++sequence}`, signal: abort.signal });
                    log("tool-result", { roleId, turnId, name: "read_file", args: readArgs, result: readResult });
                    assert.equal(readResult.ok, true, readResult.message);
                  }
                  args = { ...args, summary: "独立验收标准已完成，本次实际标准文件已写入并回读。", evidence: ["已完成验收标准编制，文件已由本次任务实际写入。",
                    ...criteria.map(file => `标准文件：${file}（已落盘并回读；以本次受信写入的原始摘要核对）`)] };
                  log("f6-annotated-criteria-model-output", { roleId, turnId, evidence: args.evidence });
                }
              }
              const toolCallId = `w5-${++sequence}`;
              const result = await tool.handler({ name, args, toolCallId, signal: signal ? AbortSignal.any([abort.signal, signal]) : abort.signal });
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
  return { factory, errors, ordinaryChiefTurns };
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
  chooseProjectRoot?: () => Promise<string | null>;
  shellOperatorPresenter?: OperatorPresenter;
  emitShellJudgeResult?: (payload: ShellJudgeResultPayload) => void;
  initialJudgeSwitches?: { decision: boolean; approval: boolean };
  watchdogOptions?: Parameters<typeof createDesktopInterface>[0]["watchdogOptions"];
  nativeAcceptanceBrowser?: boolean;
  pauseA11ParentReduction?: () => boolean;
  modelRuntime?: "pi" | "claude";
  assessmentReplayRef?: DurableInstanceRef;
};
type ChiefStartInput = {
  projectRoot?: string;
  definitionId: string;
  source?: "project" | "preset";
  expectedDigest?: string;
  summary: string;
  requestId?: string;
  enabled?: boolean;
};

type HistoricalBrowserFactory = (options: { url: string; allowedPaths: readonly string[]; signal: AbortSignal }) => Promise<{
  focus(): boolean;
  onBlur(callback: () => void): () => void;
  input(input: { kind: "keydown" | "keyup"; key: string } | { kind: "click"; x: number; y: number }): void;
  png(): Promise<Buffer>;
  visibleText(): Promise<string>;
  close(): void;
}>;

export async function app(f: WorkspaceFixture, model: ReturnType<typeof modelFixture>, log: Log, options: AppFixtureOptions = {}) {
  const { bundleResources = process.env.ANS_W5_APP_RESOURCES ?? (options.nativeAcceptanceBrowser ? historicalR19Resources : undefined),
    pickWorkflowDefinition, chooseProjectRoot, shellOperatorPresenter, emitShellJudgeResult,
    initialJudgeSwitches = { decision: false, approval: false }, watchdogOptions, nativeAcceptanceBrowser,
    pauseA11ParentReduction, modelRuntime = "pi", assessmentReplayRef } = options;
  const presetRoot = bundleResources ? path.join(bundleResources, "app") : sourceAppRoot;
  const moduleUrl = (file: string) => pathToFileURL(path.join(presetRoot, file)).href;
  const resolveNativeSelection = f.selectedRoot !== undefined
    ? (await import(moduleUrl("app/desktop/project.ts")) as typeof import("../../../app/desktop/project.ts")).resolveNativeProjectDirectory
    : undefined;
  if (f.selectedRoot !== undefined) assert.equal(typeof resolveNativeSelection, "function", "The selected application must supply its native directory resolver");
  const { DesktopDurableWorkflow: Controller } = bundleResources
    ? await import(moduleUrl("app/desktop/durable-workflow.ts")) as typeof import("../../../app/desktop/durable-workflow.ts")
    : { DesktopDurableWorkflow };
  const { createDesktopInterface: desktopInterface, createDecisionDelegationSwitch: decisionSwitch,
    createShellJudgeSwitch: shellSwitch } = bundleResources
    ? await import(moduleUrl("app/desktop/interface.ts")) as typeof import("../../../app/desktop/interface.ts")
    : { createDesktopInterface, createDecisionDelegationSwitch, createShellJudgeSwitch };
  const { createCustomerInputChannel: customerChannel } = bundleResources
    ? await import(moduleUrl("app/desktop/customer-input.ts")) as typeof import("../../../app/desktop/customer-input.ts")
    : { createCustomerInputChannel };
  const { createNetworkGate: network } = bundleResources
    ? await import(moduleUrl("src/common/runtime-core/network-gate.ts")) as typeof import("../../../src/common/runtime-core/network-gate.ts")
    : { createNetworkGate };
  const { buildDesktopShellArming: shellArming, createDesktopOperatorChannel: operatorChannel } = bundleResources
    ? await import(moduleUrl("app/desktop/operator-channel.ts")) as typeof import("../../../app/desktop/operator-channel.ts")
    : { buildDesktopShellArming, createDesktopOperatorChannel };
  const acceptanceBrowser = nativeAcceptanceBrowser ? await (async () => {
    const { BrowserWindow } = await import("electron");
    const { electronAcceptanceBrowser } = await import(moduleUrl("app/desktop/durable-acceptance-browser.ts")) as {
      electronAcceptanceBrowser(window: typeof BrowserWindow): HistoricalBrowserFactory;
    };
    const open = electronAcceptanceBrowser(BrowserWindow);
    return (async options => {
      const page = await open(options);
      return { ...page, onBlur(callback) {
        return page.onBlur(() => {
          log("native-acceptance-window-blurred", { preview: options.url, previewClosed: options.signal.aborted });
          callback();
        });
      } };
    }) satisfies typeof open;
  })() : undefined;
  const durable = new Controller({
    userDataRoot: f.userDataRoot, resourceRoot: bundleResources ?? resourceRoot!, presetRoot,
    ...(acceptanceBrowser ? { acceptanceBrowser } : {}),
  });
  if (assessmentReplayRef) {
    const find = durable.find.bind(durable);
    // The signed A6 digest includes the original logical project ID. Bridge only the
    // isolated physical root lookup; the production ledger still verifies every effect.
    durable.find = (root, instanceId) => root === f.root && (instanceId === undefined || instanceId === assessmentReplayRef.instanceId)
      ? durable.lookup(assessmentReplayRef) : find(root, instanceId);
  }
  if (pauseA11ParentReduction) {
    const store = await durable.store();
    const reconcile = store.reconcile.bind(store);
    let reported = false;
    store.reconcile = async (...args) => {
      if (!pauseA11ParentReduction()) return reconcile(...args);
      if (!reported) {
        reported = true;
        log("r16-r15-dapr-publication-held-after-original-close-refusal", f);
      }
    };
  }
  let observer: ((projection: DurableProjection) => Promise<void>) | undefined;
  const registerObserver = durable.observeProject.bind(durable);
  durable.observeProject = (root, update) => {
    observer = update;
    return registerObserver(root, update);
  };
  const roleStates: Parameters<NonNullable<Parameters<typeof createDesktopInterface>[0]["emitRoleState"]>>[0][] = [];
  const watchdogDeliveryNotes: string[] = [];
  const networkGate = network();
  const decisionJudgeSwitch = decisionSwitch(initialJudgeSwitches.decision);
  const shellJudgeSwitch = shellSwitch(initialJudgeSwitches.approval);
  const cards = new Map<string, OperatorRequestPayload>();
  const applicationRequests = new Map<string, Pick<OperatorRequestPayload, "id" | "request">>();
  const channel = customerChannel({
    operatorId: "w5-isolated-customer",
    delegation: decisionJudgeSwitch,
    judge: { isGroupEnabled: group => group === "decision" && decisionJudgeSwitch.isEnabled() },
    emitJudgeResult: result => log("desktop-judge-result", result),
    presenter: card => { cards.set(card.id, card); log("customer-card", card); },
    onExpired: card => { cards.delete(card.id); log("customer-card-closed", card); },
  });
  const desktop = desktopInterface({
    durableWorkflow: durable,
    pickDirectory: async () => {
      const selected = chooseProjectRoot ? await chooseProjectRoot() : f.selectedRoot ?? f.root;
      if (selected === null || !resolveNativeSelection) return selected;
      const resolved = await resolveNativeSelection(selected);
      log("native-project-directory", { selected, resolved });
      return resolved;
    },
    pickWorkflowDefinition,
    emitEvent: envelope => {
      if (["settled", "handback", "denied"].includes(envelope.event.kind)) log("desktop-event", envelope);
      if (watchdogOptions && envelope.event.kind === "message" && (envelope.event.detail as { source?: string })?.source === "delivery-note"
        && envelope.event.summary) watchdogDeliveryNotes.push(envelope.event.summary);
    },
    ...(watchdogOptions ? { watchdogOptions } : {}),
    envFilePath: path.join(f.directory, "empty.env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(f.directory, "runtime-selection.json"),
    runtimeOptions: { providerFactories: { [modelRuntime]: model.factory }, persistSession: true, networkGate },
    resolveRuntimeFn: async () => ({ ok: true, runtime: modelRuntime, source: "selected", skipped: [] }),
    customerInput(request, context, ...args) {
      if (context.requestId && context.durableDecision) {
        applicationRequests.set(context.requestId, { id: context.requestId, request });
      }
      return channel.customerInput(request, context, ...args);
    },
    hasPendingProjectCard: root => channel.hasPendingProjectCard(root),
    emitRoleState: state => { roleStates.push(structuredClone(state)); },
    decisionJudgeSwitch,
    shellJudgeSwitch,
    initialJudgeSwitches,
    preferencesPath: path.join(f.userDataRoot, "ans", "preferences.json"),
    shellArming: shellArming(),
    shellOperatorChannel: shellOperatorPresenter ? operatorChannel({ operatorId: "r9-isolated-test-operator", presenter: shellOperatorPresenter,
      judge: { isEnabled: () => shellJudgeSwitch.isEnabled() }, emitJudgeResult: payload => {
        log("desktop-shell-judge-result", payload);
        emitShellJudgeResult?.(payload);
      } })
      : () => ({ outcome: "unavailable", reason: "W5 disables arbitrary shell escalation" }),
  });
  if (!assessmentReplayRef) await durable.resume();
  assert.equal(await desktop.pickProject(), f.root);
  const listing = await desktop.listProject({ projectRoot: f.root });
  if ("baselineOid" in f) assert.ok(listing.roles.some(role => role.roleId === "worker"), JSON.stringify(listing.roles));
  const project = { projectRoot: f.root };
  const listProposals = async () => unwrap(await desktop.listWorkflowStartProposals(project));
  async function proposeViaChief(input: ChiefStartInput): Promise<DurableResult<DesktopWorkflowStartProposal>> {
    const { definitionId, source, expectedDigest, summary, requestId } = input;
    if (input.projectRoot !== undefined) assert.equal(input.projectRoot, f.root);
    const selection = await desktop.validateDurableWorkflow({ ...project, definitionId, source });
    if (!selection.ok && (!expectedDigest || !source)) return selection;
    const digest = expectedDigest ?? (selection.ok ? selection.value.digest : undefined);
    const definitionSource = source ?? (selection.ok ? selection.value.source : undefined);
    assert.ok(digest && definitionSource);
    const target = { ...project, roleId: "chief", runtime: "pi" as const };
    const opened = await desktop.openSession(target);
    if (!opened.ok) {
      const code = /^([a-z][a-z-]+):/.exec(opened.error ?? "")?.[1] ?? "workflow-start-open-refused";
      return { ok: false, code, message: opened.error ?? "The ordinary Chief session was refused." };
    }
    let receipt: ToolResult | undefined;
    assert.equal(model.ordinaryChiefTurns.has(summary), false, "one fixture should register one handler per live input");
    model.ordinaryChiefTurns.set(summary, async turn => {
      await successful(turn, "project_state", { definitionId });
      receipt = await turn.call("request_workflow_start", { definitionId, source: definitionSource, expectedDigest: digest,
        reason: `The selected definition ${definitionId} covers this isolated customer request.` });
    });
    try {
      const sent = await desktop.sendSession({ text: summary, target, ...(requestId ? { metadata: { clientMessageId: requestId } } : {}) }, () => true);
      if (!sent.ok) {
        if (model.errors.length) throw model.errors[0];
        const code = /^([a-z][a-z-]+):/.exec(sent.error ?? "")?.[1] ?? "workflow-start-send-refused";
        return { ok: false, code, message: sent.error ?? "The ordinary Chief message was refused." };
      }
      const reply = await until("the ordinary Chief's actual startup tool receipt", async () => receipt, model.errors);
      if (!reply.ok) {
        const code = /request_workflow_start：([a-z][a-z-]+) ·/.exec(reply.message ?? "")?.[1] ?? "workflow-start-tool-refused";
        return { ok: false, code, message: reply.message ?? "The actual Chief tool refused the proposal." };
      }
      const id = /"activationId":"([^"]+)"/.exec(reply.message ?? "")?.[1];
      assert.ok(id, reply.message);
      const proposal = await until("the authorized proposal is visible", async () => (await listProposals()).find(row => row.activationId === id), model.errors);
      return { ok: true, value: proposal };
    } finally {
      model.ordinaryChiefTurns.delete(summary);
    }
  }
  async function startViaChief(input: ChiefStartInput): Promise<DurableResult<DesktopDurableView>> {
    const proposed = await proposeViaChief(input);
    if (!proposed.ok) return proposed;
    const requestId = proposed.value.requestId;
    const card = await until("the application's personal startup card", async () => cards.get(requestId), model.errors);
    assert.equal(card.request.cardKind, "workflow-start");
    const reply = { id: card.id, decision: { kind: "choice", selected: [WORKFLOW_START_OPTION_IDS[0]] } };
    const receipt = await channel.respondDurable(reply, () => true);
    log("customer-receipt", { input: reply, result: receipt });
    assert.ok(receipt?.ok, JSON.stringify(receipt));
    cards.delete(card.id);
    const activated = await until("the approved proposal creates one instance or reports a blocker", async () => {
      const row = (await listProposals()).find(item => item.activationId === proposed.value.activationId);
      return row?.instanceId || row?.startup?.state === "blocked" ? row : undefined;
    }, model.errors);
    if (!activated.instanceId) return { ok: false, code: activated.startup?.code ?? "workflow-start-blocked", message: activated.startup?.message ?? "The approved start is blocked." };
    return desktop.getDurableWorkflowProjection({ ...project, instanceId: activated.instanceId });
  }
  return { desktop, durable, cards, applicationRequests, listing, proposeViaChief, startViaChief, roleStates, watchdogDeliveryNotes,
    async observeNow(instanceId: string) {
      const current = await durable.find(f.root, instanceId);
      if (current && observer) await observer(current);
    },
    simulateNetwork(online: boolean) {
      const state = { online, source: "main-net", reason: online ? "resume" : "interface-down", at: Date.now(), stableForMs: 0 } as const;
      networkGate.apply(state);
      desktop.applyNetworkState(state);
      log("model-network-state-injected", state);
    },
    async respond(id: string, selected: string | readonly string[], isMainFrameCurrent?: () => boolean) {
      const input = { id, decision: { kind: "choice", selected: typeof selected === "string" ? [selected] : [...selected] } };
      const result = await channel.respondDurable(input, isMainFrameCurrent) ?? await desktop.replayDurableReleaseDecision(input) ?? channel.respond(input);
      log("customer-receipt", { input, result });
      return result;
    },
    async close() {
      if (watchdogOptions) desktop.stopWatchdog();
      desktop.disposeProjectDocuments();
      channel.rejectAllPending("isolated W5 window closed");
      await desktop.stopSession({ roleId: null });
      await durable.close();
    },
  };
}

export async function until<T>(phase: string, probe: () => Promise<T | undefined>, errors: unknown[], timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
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

export const workflowShellScript = "src/core/check-threshold.mjs";
export const workflowShellManifest = {
  name: "ans-local-threshold",
  version: "1.0.0",
  private: true,
  scripts: {
    typecheck: `node ${workflowShellScript} verify`,
    "review-evidence": `node ${workflowShellScript} failure`,
    "verify-denied": `node ${workflowShellScript} verify-denied`,
    "verify-cancelled": `node ${workflowShellScript} verify-cancelled`,
  },
};
export const workflowShellSource = `import { writeFileSync } from "node:fs";
const mode = process.argv[2];
if (mode.endsWith("denied") || mode.endsWith("cancelled")) {
  writeFileSync(mode + "-shell.marker", "unexpected child execution");
}
console.log("R9 process stdout", mode);
console.error("R9 process stderr", mode);
if (mode === "failure") process.exitCode = 17;
if (mode === "running") {
  writeFileSync("running-shell.marker", String(process.pid));
  setInterval(() => {}, 1000);
}
`;

/** The same operator channel as the Desktop app, with only the human presentation endpoint controlled. */
export function workflowShellFixture(projectRoot: string, log: Log) {
  const seen: string[] = [];
  const node = (mode: string) => `node ${workflowShellScript} ${mode}`;
  const npm = (script: string) => `npm run ${script}`;
  const forbiddenTarget = "src/outside-shell-scope";
  const expected = new Map([
    [node("worker"), { role: "worker", argv: ["node", workflowShellScript, "worker"], allow: true }],
    [node("denied"), { role: "worker", argv: ["node", workflowShellScript, "denied"], allow: false }],
    [node("cancelled"), { role: "worker", argv: ["node", workflowShellScript, "cancelled"], allow: true }],
    [node("running"), { role: "worker", argv: ["node", workflowShellScript, "running"], allow: true }],
    [npm("review-evidence"), { role: "verifier", argv: ["npm", "run", "review-evidence"], allow: true }],
    [npm("verify-denied"), { role: "verifier", argv: ["npm", "run", "verify-denied"], allow: false }],
    [npm("verify-cancelled"), { role: "verifier", argv: ["npm", "run", "verify-cancelled"], allow: true }],
  ]);
  const cancellations = new Map([node("cancelled"), npm("verify-cancelled")].map(command => [command, {
    started: Promise.withResolvers<void>(), decision: Promise.withResolvers<OperatorDecision>(),
  }]));
  const marker = (name: string) => path.join(projectRoot, `${name}-shell.marker`);
  const noMarker = (name: string) => assert.rejects(fs.access(marker(name)), { code: "ENOENT" });
  const noDeniedChild = () => Promise.all(["denied", "cancelled", "verify-denied", "verify-cancelled"].map(noMarker));
  const assertProcess = (result: ToolResult, mode: string, exitCode: number) => {
    assert.equal(result.ok, exitCode === 0, result.message);
    assert.equal(result.execution?.exitCode, exitCode, result.message);
    assert.match(result.execution?.stdout ?? "", new RegExp(`R9 process stdout ${mode}`));
    assert.match(result.execution?.stderr ?? "", new RegExp(`R9 process stderr ${mode}`));
  };
  const presenter: OperatorPresenter = { async present(prompt, display, metadata) {
    const command = display.command;
    assert.equal(prompt.acceptanceEnvironmentScope, undefined);
    assert.equal(display.acceptanceEnvironmentScope, undefined);
    const binding = expected.get(command);
    assert.ok(binding, `Unexpected application approval: ${command}`);
    assert.equal(seen.includes(command), false);
    seen.push(command);
    assert.equal(metadata?.roleId, binding.role);
    assert.equal(metadata.runtime, "pi");
    assert.equal(path.resolve(display.cwd), path.resolve(projectRoot));
    assert.deepEqual(prompt.argv, binding.argv);
    assert.deepEqual(display.argv, binding.argv);
    await noDeniedChild();
    await noMarker("running");
    log("r9-actual-application-command-approval", { command, argv: display.argv, cwd: display.cwd, roleId: metadata.roleId });
    const cancellation = cancellations.get(command);
    if (cancellation) {
      cancellation.started.resolve();
      return cancellation.decision.promise;
    }
    return { allow: binding.allow };
  } };
  const tool = (turn: ModelTurn, command: string, signal?: AbortSignal) => turn.call("run_shell", { command }, signal);
  const deny = async (turn: ModelTurn, command: string, mode: string) => {
    const denied = await tool(turn, command);
    assert.equal(denied.ok, false, denied.message);
    assert.equal(denied.execution, undefined);
    await noMarker(mode);
  };
  const cancelApproval = async (turn: ModelTurn, command: string, mode: string) => {
    const cancellation = cancellations.get(command);
    assert.ok(cancellation);
    const abort = new AbortController();
    const pending = tool(turn, command, abort.signal);
    // A missing application request fails immediately instead of leaving the suite waiting for approval.
    await Promise.race([cancellation.started.promise, pending.then(result => assert.fail(result.message))]);
    await noMarker(mode);
    abort.abort();
    const cancelled = await pending;
    assert.equal(cancelled.ok, false, cancelled.message);
    assert.equal(cancelled.execution, undefined);
    cancellation.decision.resolve({ allow: true });
    await noMarker(mode);
    log("r9-command-cancelled-before-spawn", { command, roleId: turn.roleId, message: cancelled.message });
  };
  const cancelRunningChild = async (turn: ModelTurn) => {
    const abort = new AbortController();
    const command = node("running");
    const pending = tool(turn, command, abort.signal);
    try {
      const pid = await Promise.race([
        until("R9 approved foreground command started", async () =>
          Number(await fs.readFile(marker("running"), "utf8").catch(() => "")) || undefined, []),
        pending.then(result => assert.fail(result.message)),
      ]);
      process.kill(pid, 0);
      abort.abort();
      const cancelled = await pending;
      assert.equal(cancelled.ok, false, cancelled.message);
      await until("R9 cancelled foreground command stopped", async () => {
        try { process.kill(pid, 0); return undefined; }
        catch (error) { assert.equal((error as NodeJS.ErrnoException).code, "ESRCH"); return true; }
      }, []);
      log("r9-command-cancelled-after-spawn", { command, pid, roleId: turn.roleId, message: cancelled.message });
    } finally {
      abort.abort();
      await fs.rm(marker("running"), { force: true });
    }
  };
  return {
    presenter,
    async worker(turn: ModelTurn) {
      assertProcess(await tool(turn, node("worker")), "worker", 0);
      await deny(turn, node("denied"), "denied");
      await cancelApproval(turn, node("cancelled"), "cancelled");
      await cancelRunningChild(turn);
      const outside = await tool(turn, `mkdir ${forbiddenTarget}`);
      assert.equal(outside.ok, false, outside.message);
      assert.match(outside.message, /write-guard/);
      assert.equal(outside.execution, undefined);
      await assert.rejects(fs.access(path.join(projectRoot, forbiddenTarget)), { code: "ENOENT" });
      const gitDenied = await tool(turn, `git add ${forbiddenTarget}`);
      assert.equal(gitDenied.ok, false, gitDenied.message);
      assert.equal(gitDenied.execution, undefined);
      const background = await turn.call("start_background_task", { command: node("denied") });
      assert.equal(background.ok, false, background.message);
      assert.equal(background.backgroundTask, undefined);
      await noMarker("denied");
    },
    async verifier(turn: ModelTurn) {
      assertProcess(await tool(turn, npm("typecheck")), "verify", 0);
      assertProcess(await tool(turn, npm("review-evidence")), "failure", 17);
      await deny(turn, npm("verify-denied"), "verify-denied");
      await cancelApproval(turn, npm("verify-cancelled"), "verify-cancelled");
    },
    async verifyDelivery() {
      assert.deepEqual(seen, [...expected.keys()]);
      await noDeniedChild();
      const audit = (await fs.readFile(path.join(projectRoot, "docs/audit/shell-gate.jsonl"), "utf8"))
        .trim().split(/\r?\n/).map(row => JSON.parse(row));
      for (const [command, executable] of [[node("worker"), true], [node("denied"), false],
        [npm("typecheck"), true], [npm("review-evidence"), true], [npm("verify-denied"), false]] as const) {
        assert.ok(audit.some(entry => entry.command === command && entry.conclusion === (executable ? "allow" : "deny")),
          `Missing actual shell review for ${command}`);
      }
      log("r9-shell-audit-and-delivery", { seen, audit: audit.filter(row => expected.has(row.command) || row.command === "npm run typecheck") });
    },
  };
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
    } else {
      const bypass = await handle.desktop.startDurableWorkflow({ ...select, definitionId: "path-b", enabled: true,
        requestId: "w5-bring-forward-must-use-confirmation", summary: "A bare direct request in the new application" });
      assert.equal(bypass.ok, false);
      if (!bypass.ok) assert.equal(bypass.code, "workflow-start-confirmation-required");
      log("new-package-direct-entry-denied-before-old-resume", bypass);
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

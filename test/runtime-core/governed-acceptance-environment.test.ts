import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { buildShellApprovalContext } from "../../src/common/编排/shell-approval-context.ts";
import { createShellGate } from "../../src/common/编排/shell-gate.ts";
import { evaluateShellWriteTargets } from "../../src/common/门禁引擎/shell-write-guard.ts";
import type {
  AcceptanceEnvironmentApprovedCommand, AcceptanceEnvironmentRestoreFn, AcceptanceEnvironmentReviewScope,
  AcceptanceEnvironmentShellObservation, GovernedToolsOptions, OperatorOutcome, OperatorPrompt, ShellReviewRequest,
} from "../../src/model/runtime.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { classifyShellDetailed, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import { allow, neutralProjectRoot, role } from "./fixtures.ts";

const TOOL = "restore_acceptance_environment";
const OWNER = "fixture-developer";
const TURN = "current-turn";
const CALL = "recovery-tool-call";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function fixture(t: TestContext, mode: "ci" | "install" = "install", privateTarget = false) {
  const tmp = await neutralProjectRoot();
  t.after(tmp.cleanup);
  const root = await realpath(tmp.root);
  const projectRoot = path.join(root, "project 'with spaces'");
  const cwd = path.join(projectRoot, ".ans", "acceptance-npm-F1h7Ac");
  const taskId = "env-task";
  const originalTree = path.join(projectRoot, "node_modules");
  const taskSlot = path.join(projectRoot, ".ans", "acceptance-deps", taskId);
  const publishDirectory = privateTarget ? path.join(taskSlot, "node_modules") : originalTree;
  await mkdir(projectRoot);
  await mkdir(cwd, { recursive: true });
  if (privateTarget) {
    await mkdir(taskSlot, { recursive: true });
    await mkdir(originalTree);
    await writeFile(path.join(originalTree, "old-tree"), "pre-existing dependency bytes");
  }
  const manifest = JSON.stringify({ name: "environment-fixture", version: "1.0.0" });
  const lock = mode === "ci" ? JSON.stringify({ name: "environment-fixture", version: "1.0.0", lockfileVersion: 3, packages: {} }) : undefined;
  await writeFile(path.join(cwd, "package.json"), manifest);
  await writeFile(path.join(cwd, "user.npmrc"), "");
  await writeFile(path.join(cwd, "global.npmrc"), "");
  if (lock) await writeFile(path.join(cwd, "package-lock.json"), lock);
  await writeFile(path.join(projectRoot, "package.json"), JSON.stringify({
    name: "environment-fixture", version: "1.0.0", scripts: { build: "node build.cjs" },
  }));
  await writeFile(path.join(projectRoot, "build.cjs"), "process.stderr.write('fixture executable missing'); process.exitCode = 7;");
  const argv = ["npm", mode, ...(mode === "install" ? ["--no-package-lock"] : []),
    "--ignore-scripts", "--workspaces=false", "--allow-directory=none", "--allow-file=none", "--allow-git=none", "--allow-remote=none",
    "--registry=https://registry.npmjs.org/", `--prefix=${cwd}`, `--userconfig=${path.join(cwd, "user.npmrc")}`,
    `--globalconfig=${path.join(cwd, "global.npmrc")}`, `--cache=${path.join(cwd, "cache")}`];
  const stage = await lstat(cwd, { bigint: true });
  const parent = privateTarget ? await lstat(taskSlot, { bigint: true }) : undefined;
  const scope = {
    kind: "application-isolated-npm-restore", projectRoot, stagingDirectory: cwd,
    stagingIdentity: { dev: stage.dev.toString(), ino: stage.ino.toString() }, publishDirectory,
    ...(parent ? { publishIdentity: { dev: parent.dev.toString(), ino: parent.ino.toString() } } : {}),
    instanceId: "dw-fixture", flowId: "implement", stepId: "environment-recovery", attempt: 1, taskId,
    roleId: OWNER, turnId: TURN, toolCallId: CALL, effectKey: "environment-install:env-task", candidateOid: "1".repeat(40),
    manifestSha256: digest(manifest), ...(lock ? { lockSha256: digest(lock) } : {}), criteriaSha256: "2".repeat(64),
  } satisfies AcceptanceEnvironmentReviewScope;
  const offer = Promise.withResolvers<OperatorPrompt>();
  const decision = Promise.withResolvers<OperatorOutcome>();
  t.after(() => decision.resolve({ outcome: "deny", operatorId: "fixture cleanup" }));
  const audit = createMemoryAuditSink();
  const reviewed: ShellReviewRequest[] = [];
  const checkWrite = () => ({ allowed: false });
  const shellGate = createShellGate({
    projectRoot, classifyShellDetailed, rules: defaultShellRules(), audit,
    advisoryRuleset: true,
    operatorChannel: prompt => { offer.resolve(prompt); return decision.promise; },
    writeGuard: request => evaluateShellWriteTargets({
      ...request, projectRoot, skillRoot: projectRoot, forbiddenPrefixes: [],
      boundary: role(OWNER).boundary, checkWrite,
    }),
    approvalContextLoader: request => buildShellApprovalContext({ request, projectRoot, checkWrite }),
    onReviewed: request => { reviewed.push(request); },
  });
  const executed: AcceptanceEnvironmentApprovedCommand[] = [];
  const rejected: ("denied" | "unavailable")[] = [];
  const auditOutcomes: number[] = [];
  let currentTurn: string | undefined = TURN;
  let taskCurrent = true;
  let preparedCount = 0;
  const restoreAcceptanceEnvironment: AcceptanceEnvironmentRestoreFn = async identity => {
    preparedCount++;
    assert.deepEqual(identity, { roleId: OWNER, turnId: TURN, toolCallId: CALL, cwd: projectRoot });
    return { ok: true, value: {
      cwd, argv, acceptanceEnvironmentScope: scope, isCurrent: () => taskCurrent,
      reject: ({ decision }) => { rejected.push(decision); },
      async executeApproved(approval) {
        assert.equal(approval.isCurrent(), true);
        await mkdir(path.join(cwd, "node_modules"));
        assert.equal(approval.isCurrent(), true, "private npm output remains eligible for verified publication");
        if (privateTarget) {
          await mkdir(publishDirectory);
          await writeFile(path.join(publishDirectory, "new-tree"), "current candidate dependency bytes");
          assert.equal(approval.isCurrent(), false, "an occupied target retires its create-only approval");
        }
        executed.push(approval);
        return { ok: true, value: { message: "installed and verified", execution: { exitCode: 0 } } };
      },
    } };
  };
  const options = {
    durableFixedWorkflow: true, shellGate, shellCwd: projectRoot, roleId: OWNER,
    currentTurnId: () => currentTurn, restoreAcceptanceEnvironment,
    shellPostAudit: (_request, outcome) => {
      if (outcome.exitCode !== undefined) auditOutcomes.push(outcome.exitCode);
      return { violations: [] };
    },
  } satisfies GovernedToolsOptions;
  const build = (overrides?: Partial<GovernedToolsOptions>) => buildGovernedTools(allow, { ...options, ...overrides });
  const tool = build().find(entry => entry.name === TOOL)!;
  const invoke = (args = {}, signal?: AbortSignal) => tool.handler({ name: TOOL, args, signal, toolCallId: CALL });
  const waitForApproval = (pending: Promise<unknown>) => Promise.race([
    offer.promise, pending.then(result => assert.fail(`No application approval card: ${JSON.stringify({ result, audit: audit.records })}`)),
  ]);
  return { build, tool, invoke, cwd, projectRoot, argv, scope, publishDirectory, originalTree, taskSlot,
    waitForApproval, decision, audit, reviewed, auditOutcomes, executed, rejected,
    get preparedCount() { return preparedCount; },
    staleTurn: () => { currentTurn = "new-turn"; },
    staleTask: () => { taskCurrent = false; },
  };
}

test("only the bound fixed-workflow session exposes the zero-argument recovery tool", async t => {
  const f = await fixture(t);
  for (const overrides of [
    { restoreAcceptanceEnvironment: undefined }, { shellGate: undefined }, { durableFixedWorkflow: false },
    { roleId: undefined }, { shellCwd: undefined }, { currentTurnId: undefined },
  ]) assert.equal(f.build(overrides).some(entry => entry.name === TOOL), false);
  assert.deepEqual(f.tool.inputSchema, { type: "object", properties: {}, additionalProperties: false });
  assert.equal(f.tool.executionMode, "sequential");
  for (const args of [{ cwd: f.cwd }, { argv: f.argv }, { toolCallId: CALL }, { roleId: OWNER }, { approval: true }, { acceptanceEnvironmentScope: f.scope }]) {
    assert.equal((await f.invoke(args)).ok, false);
  }
  assert.equal((await f.tool.handler({ name: TOOL, args: {} })).ok, false);
  const aborted = AbortSignal.abort();
  assert.equal((await f.invoke({}, aborted)).ok, false);
  assert.equal(f.preparedCount, 0);
});

test("the real session gate reviews and records the isolated scope, cwd and fixed argv before its callback", { timeout: 10_000 }, async t => {
  const f = await fixture(t, "ci");
  const original = [...f.argv];
  const scope = structuredClone(f.scope);
  const pending = f.invoke();
  const card = await f.waitForApproval(pending);
  assert.deepEqual(card.argv, original);
  assert.equal(card.cwd, f.cwd);
  assert.equal(card.roleId, OWNER);
  assert.equal(card.toolCallId, CALL);
  assert.deepEqual(card.acceptanceEnvironmentScope, scope);
  assert.equal(Object.hasOwn(card.acceptanceEnvironmentScope!, "publishIdentity"), false);
  assert.match(card.command, /--ignore-scripts/);
  assert.equal(f.executed.length, 0);
  assert.equal((await f.invoke()).ok, false);
  assert.equal(f.preparedCount, 1);
  // Mutation of desktop input objects cannot change what is reviewed or passed to the callback.
  f.argv.push("--ignore-scripts=false");
  f.scope.stagingIdentity.ino = "0";
  f.scope.effectKey = "mutated-effect";
  f.decision.resolve({ outcome: "allow", operatorId: "fixture-operator" });
  assert.deepEqual(await pending, { ok: true, message: "installed and verified" });
  assert.equal(f.audit.records.length, 1);
  assert.deepEqual(f.audit.records[0]?.argv, original);
  assert.equal(f.audit.records[0]?.cwd, f.cwd);
  const approved = f.executed[0]!;
  assert.deepEqual(approved.argv, original);
  assert.equal(Object.isFrozen(approved.argv), true);
  assert.deepEqual(approved.acceptanceEnvironmentScope, scope);
  assert.equal(approved.acceptanceEnvironmentScope, f.reviewed[0]?.acceptanceEnvironmentScope);
  assert.ok(Object.isFrozen(approved.acceptanceEnvironmentScope));
  assert.ok(Object.isFrozen(approved.acceptanceEnvironmentScope.stagingIdentity));
  assert.equal(approved.cwd, f.cwd);
  assert.equal(approved.roleId, OWNER);
  assert.equal(approved.turnId, TURN);
  assert.equal(approved.toolCallId, CALL);
  assert.match(approved.reviewedBy, /fixture-operator/);
  assert.deepEqual(f.auditOutcomes, [0]);
  assert.deepEqual(f.rejected, []);
});

test("the real gate binds create-only private publication while preserving an existing root installation", { timeout: 10_000 }, async t => {
  const f = await fixture(t, "ci", true);
  const scope = structuredClone(f.scope);
  const pending = f.invoke();
  const card = await f.waitForApproval(pending);
  assert.deepEqual(card.acceptanceEnvironmentScope, scope);
  assert.deepEqual(card.argv, f.argv);
  assert.equal(card.cwd, f.cwd);
  assert.ok(Object.isFrozen(card.acceptanceEnvironmentScope?.publishIdentity));
  await assert.rejects(lstat(f.publishDirectory), { code: "ENOENT" });
  f.scope.publishIdentity!.ino = "-1";
  f.scope.publishDirectory = f.originalTree;
  f.decision.resolve({ outcome: "allow", operatorId: "fixture" });
  assert.equal((await pending).ok, true);
  assert.deepEqual(f.executed[0]?.acceptanceEnvironmentScope, scope);
  assert.equal(f.executed[0]?.acceptanceEnvironmentScope, card.acceptanceEnvironmentScope);
  assert.equal(await readFile(path.join(f.originalTree, "old-tree"), "utf8"), "pre-existing dependency bytes");
  assert.equal(await readFile(path.join(f.publishDirectory, "new-tree"), "utf8"), "current candidate dependency bytes");
});

test("a private publication requires the actual task parent, effect, identity and absent output before approval", async t => {
  for (const invalid of ["other-task", "effect", "traversal", "missing-identity", "wrong-identity", "root", "occupied"] as const) {
    await t.test(invalid, async st => {
      const f = await fixture(st, "ci", true);
      if (invalid === "other-task") f.scope.publishDirectory = path.join(path.dirname(f.taskSlot), "other-task", "node_modules");
      if (invalid === "effect") f.scope.effectKey = "environment-install:other-task";
      if (invalid === "traversal") f.scope.taskId = "../env-task";
      if (invalid === "missing-identity") Reflect.deleteProperty(f.scope, "publishIdentity");
      if (invalid === "wrong-identity") f.scope.publishIdentity!.ino = "-1";
      if (invalid === "root") f.scope.publishDirectory = f.originalTree;
      if (invalid === "occupied") await mkdir(f.publishDirectory);
      assert.equal((await f.invoke()).ok, false);
      assert.equal(f.reviewed.length, 0);
      assert.equal(f.executed.length, 0);
      assert.deepEqual(f.rejected, ["unavailable"]);
      assert.equal(await readFile(path.join(f.originalTree, "old-tree"), "utf8"), "pre-existing dependency bytes");
    });
  }
});

test("a denied, aborted, occupied or replaced private slot cannot execute", { timeout: 10_000 }, async t => {
  for (const changed of ["denied", "aborted", "late-output", "parent", "ancestor"] as const) await t.test(changed, async st => {
    const f = await fixture(st, "ci", true);
    const controller = new AbortController();
    const pending = f.invoke({}, controller.signal);
    const card = await f.waitForApproval(pending);
    assert.equal(card.acceptanceEnvironmentScope?.publishDirectory, f.publishDirectory);
    if (changed === "late-output") await mkdir(f.publishDirectory);
    if (changed === "aborted") controller.abort();
    if (changed === "parent") {
      await rename(f.taskSlot, `${f.taskSlot}-old`);
      await mkdir(f.taskSlot);
    }
    if (changed === "ancestor") {
      const deps = path.dirname(f.taskSlot);
      await rename(deps, `${deps}-old`);
      await mkdir(deps);
      // Restore the same task directory inode to demonstrate that the ancestor must also match.
      await rename(path.join(`${deps}-old`, path.basename(f.taskSlot)), f.taskSlot);
    }
    f.decision.resolve({ outcome: changed === "denied" ? "deny" : "allow", operatorId: "fixture" });
    assert.equal((await pending).ok, false);
    assert.equal(f.executed.length, 0);
    assert.deepEqual(f.rejected, [changed === "denied" ? "denied" : "unavailable"]);
    assert.equal(await readFile(path.join(f.originalTree, "old-tree"), "utf8"), "pre-existing dependency bytes");
  });
});

test("denial, abort, stale identity and replaced cwd each leave zero approved execution", { timeout: 10_000 }, async t => {
  for (const condition of ["denied", "aborted", "turn", "task", "cwd", "project", "manifest", "lock", "publish-target", "staged-tree"] as const) await t.test(condition, async st => {
    const f = await fixture(st, "ci");
    const controller = new AbortController();
    const pending = f.invoke({}, controller.signal);
    await f.waitForApproval(pending);
    if (condition === "aborted") controller.abort();
    if (condition === "turn") f.staleTurn();
    if (condition === "task") f.staleTask();
    if (condition === "cwd" || condition === "project") {
      const target = condition === "cwd" ? f.cwd : f.projectRoot;
      await rename(target, `${target}-previous`);
      await mkdir(target);
    }
    if (condition === "manifest") await writeFile(path.join(f.cwd, "package.json"), "{}");
    if (condition === "lock") await writeFile(path.join(f.cwd, "package-lock.json"), "{}");
    if (condition === "publish-target") await mkdir(f.publishDirectory);
    if (condition === "staged-tree") await mkdir(path.join(f.cwd, "node_modules"));
    if (condition === "denied") f.decision.resolve({ outcome: "deny", operatorId: "fixture-operator" });
    else f.decision.resolve({ outcome: "allow", operatorId: "fixture-operator" });
    assert.equal((await pending).ok, false);
    assert.equal(f.executed.length, 0);
    assert.deepEqual(f.rejected, [condition === "denied" ? "denied" : "unavailable"]);
  });
});

test("the dedicated scope cannot be forged by ordinary shell or mismatched by the prepare port", async t => {
  for (const invalid of ["call", "path", "digest", "registry", "mode"] as const) await t.test(invalid, async st => {
    const f = await fixture(st);
    if (invalid === "call") f.scope.toolCallId = "another-call";
    if (invalid === "path") f.scope.publishDirectory = path.join(f.projectRoot, "alternate-target");
    if (invalid === "digest") f.scope.manifestSha256 = "0".repeat(64);
    if (invalid === "registry") f.argv.push("--registry=https://other.invalid/");
    if (invalid === "mode") f.argv[1] = "ci";
    assert.equal((await f.invoke()).ok, false);
    assert.equal(f.reviewed.length, 0);
    assert.deepEqual(f.rejected, ["unavailable"]);
    assert.equal(f.executed.length, 0);
  });
  const f = await fixture(t);
  const presented: ShellReviewRequest[] = [];
  const tool = f.build({
    shellGate: async request => {
      presented.push(request);
      return { allow: false, by: "fixture-operator", reason: "declined" };
    },
  }).find(entry => entry.name === "run_shell")!;
  const command = f.argv.map(arg => arg.includes(" ") ? `"${arg}"` : arg).join(" ");
  const result = await tool.handler({ name: tool.name, toolCallId: CALL, args: {
    command, acceptanceEnvironmentScope: f.scope, cwd: f.cwd, argv: f.argv,
  } });
  assert.equal(result.ok, false);
  assert.equal(presented.length, 1);
  assert.deepEqual(presented[0]?.argv, f.argv);
  assert.equal(presented[0]?.cwd, f.projectRoot);
  assert.equal(presented[0]?.acceptanceEnvironmentScope, undefined);
  assert.equal(f.preparedCount, 0);
});

test("review timeout rejects the scoped plan even if the session gate eventually allows the same request", async t => {
  const f = await fixture(t);
  const offered = Promise.withResolvers<ShellReviewRequest>();
  const reviewed = Promise.withResolvers<{ allow: true; by: string }>();
  const tool = f.build({
    shellReviewTimeoutMs: 25,
    shellGate: request => { offered.resolve(request); return reviewed.promise; },
  }).find(entry => entry.name === TOOL)!;
  const pending = tool.handler({ name: TOOL, args: {}, toolCallId: CALL });
  assert.deepEqual((await offered.promise).acceptanceEnvironmentScope, f.scope);
  const result = await pending;
  reviewed.resolve({ allow: true, by: "late-operator" });
  assert.equal(result.ok, false);
  assert.deepEqual(f.rejected, ["unavailable"]);
  assert.equal(f.executed.length, 0);
});

test("ordinary npm evidence uses actual gate and process facts even if the model supplies receipt-like fields", { timeout: 10_000 }, async t => {
  const f = await fixture(t);
  const observations: AcceptanceEnvironmentShellObservation[] = [];
  const persisted = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const tool = f.build({
    restoreAcceptanceEnvironment: undefined, roleId: "verifier",
    async observeAcceptanceEnvironmentShell(observation) {
      observations.push(observation);
      entered.resolve();
      await persisted.promise;
    },
  }).find(entry => entry.name === "run_shell")!;
  let returned = false;
  const pending = tool.handler({ name: tool.name, toolCallId: "acceptance-build", args: {
    command: "npm run build", roleId: "spoofed", outcome: { exitCode: 0 }, toolCallId: "invented",
  } }).then(result => { returned = true; return result; });
  const card = await f.waitForApproval(pending);
  assert.equal(card.roleId, "verifier");
  assert.equal(observations.length, 0);
  f.decision.resolve({ outcome: "allow", operatorId: "fixture-operator" });
  await entered.promise;
  assert.equal(returned, false);
  persisted.resolve();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.execution?.exitCode, 7);
  assert.deepEqual(observations, [{
    roleId: "verifier", turnId: TURN, toolCallId: "acceptance-build", cwd: f.projectRoot,
    argv: ["npm", "run", "build"], decision: "allowed", reviewedBy: observations[0]?.reviewedBy,
    outcome: { exitCode: 7 }, writeAuditPassed: true, stderr: "fixture executable missing",
  }]);
  assert.match(observations[0]!.reviewedBy!, /fixture-operator/);
});

test("ordinary npm evidence distinguishes rejection, unavailable review and other commands", async t => {
  const f = await fixture(t);
  const observations: AcceptanceEnvironmentShellObservation[] = [];
  for (const decision of ["denied", "unavailable"] as const) {
    const tool = f.build({
      shellGate: async () => {
        if (decision === "unavailable") throw Error("fixture disconnected");
        return { allow: false, by: "fixture-operator", reason: "declined" };
      },
      observeAcceptanceEnvironmentShell: observation => { observations.push(observation); },
    }).find(entry => entry.name === "run_shell")!;
    for (const command of ["npm run build", "npm --version"])
      assert.equal((await tool.handler({ name: tool.name, toolCallId: decision, args: { command } })).ok, false);
  }
  assert.deepEqual(observations.map(fact => fact.decision), ["denied", "unavailable"]);
  assert.ok(observations.every(fact => fact.outcome === undefined && fact.stderr === undefined));
});

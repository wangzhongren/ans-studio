import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import { docFormatSpecText } from "../../src/common/编排/doc-format-specs.ts";
import type { ProjectConfig, ResolvedRole } from "../../src/model/role.ts";
import type { GovernedPackageLockGenerator, RoleSession, RuntimeAdapter, WriteGate } from "../../src/model/runtime.ts";
import { openRoleSession, preflightDurableReviewWrite, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";

const duties = {
  chief: /选用工作流、提请确认和处理异常/,
  product: /意图撰写任务提交实际草稿/,
  rapporteur: /方案、模块、名单及契约/,
  nominator: /当前人事任务核对获批角色名单/,
  convener: /团队计划和 Git 基线/,
  verifier: /独立编制验收标准/,
};

function recordAdapter(capture: (role: ResolvedRole) => void): RuntimeAdapter {
  return {
    async composeContext(role) { return { systemPrompt: role.cardText }; },
    async bindRole(role) {
      capture(role);
      const session: RoleSession = { async prompt() {}, async *events() {}, async dispose() {} };
      return session;
    },
  };
}

test("ordinary role binding uses YAML-specific instructions for every built-in and preserves compatible card bindings", async t => {
  const projectRoot = await mkdtemp(join(tmpdir(), "ans-yaml-role-"));
  t.after(async () => rm(projectRoot, { recursive: true, force: true }));
  const project: ProjectConfig = {
    projectRoot, skillRoot: projectRoot, roles: {}, builtInRoles: Object.keys(duties), governanceModel: "trio",
  };
  async function open(roleId: string, workflowMode: "fixed" | "legacy", durableFixedWorkflow?: boolean, taskId?: string) {
    let actual: ResolvedRole | undefined;
    let capabilities: AdapterCapabilities | undefined;
    const handle = await openRoleSession({
      project, roleId, workflowMode, durableFixedWorkflow, taskId, runtime: "claude",
      dispatchTask: async () => ({ ok: true, taskId: "fake" }),
      contractCheck: async () => 'legacy stage-request dispatch contract',
    }, { createAdapter: (_gate, supplied) => {
      capabilities = supplied;
      return recordAdapter(role => { actual = role; });
    } });
    await handle.dispose();
    assert.ok(actual);
    return { actual, capabilities };
  }
  for (const [roleId, duty] of Object.entries(duties)) {
    const { actual, capabilities } = await open(roleId, "fixed", true);
    assert.equal(actual.id, roleId);
    assert.equal(actual.kind, "built-in-governance");
    assert.match(actual.cardText, duty);
    assert.doesNotMatch(actual.cardText, /Chief枢纽|D3|dispatch_task/);
    assert.ok(actual.boundary.entries.every(entry => entry.purpose === ""));
    assert.equal(capabilities?.durableFixedWorkflow, true);
    assert.equal(capabilities?.dispatchTask, undefined);
    assert.match(await capabilities!.contractCheck!({ taskKind: "dispatch" }) ?? "", /当前 YAML 工作流/);
    assert.doesNotMatch(await capabilities!.contractCheck!({ taskKind: "stage-request" }) ?? "", /stage-request|D3/);
  }
  const legacy = await open("nominator", "legacy");
  const fixed = await open("nominator", "fixed");
  assert.equal(legacy.actual.cardText, fixed.actual.cardText);
  assert.match(legacy.actual.cardText, /D3/);
  assert.equal(fixed.capabilities?.durableFixedWorkflow, undefined);
  assert.equal(await fixed.capabilities?.contractCheck?.({ taskKind: "dispatch" }), "legacy stage-request dispatch contract");
  for (const stage of ["A7", "A8"] as const) {
    const taskId = "current-" + stage;
    const appended = await appendTaskEvent(projectRoot, taskEvent("task.created", {
      taskId, from: "convener", to: "nominator", stage, text: "人事任务", sideEffect: "read-only", idempotencyKey: taskId,
      flowId: "approved", workflowId: "yaml-instance",
    }, () => new Date()));
    assert.equal(appended.ok, true);
    const session = await open("nominator", "fixed", true, taskId);
    assert.match(session.actual.cardText, stage === "A8" ? /当前 A8 任务和已批准方案名单/ : /本轮只读核对已批准名单/);
    if (stage === "A7") assert.doesNotMatch(session.actual.cardText, /activate_role_documents|A8/);
  }
});

test("current fixed author tools show only their assigned flow's declared evidence roster", async t => {
  const projectRoot = await mkdtemp(join(tmpdir(), "ans-yaml-evidence-author-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const project: ProjectConfig = { projectRoot, skillRoot: projectRoot, roles: {}, governanceModel: "trio", builtInRoles: Object.keys(duties) };
  const taskId = "author-bound-a5";
  const created = await appendTaskEvent(projectRoot, taskEvent("task.created", { taskId, idempotencyKey: taskId,
    from: "convener", to: "rapporteur", stage: "A5", flowId: "frozen-author-flow", workflowId: "current-frozen-instance",
    text: "Write the four proposal documents", sideEffect: "docs" }));
  assert.equal(created.ok, true);
  async function open(durableFixedWorkflow: boolean, evidenceCollectorRoleId?: string, assigned = taskId) {
    let captured: AdapterCapabilities | undefined;
    const session = await openRoleSession({ project, roleId: "rapporteur", runtime: "claude", taskId: assigned, workflowMode: "fixed",
      durableFixedWorkflow, evidenceCollectorRoleId, docFormat: ({ format, part }) => docFormatSpecText(format ?? "", part),
      contractCheck: async () => "Legacy contract." }, { createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return recordAdapter(() => {});
    } });
    await session.dispose();
    assert.ok(captured);
    return captured;
  }
  const context = /collector-custom.*docs\/verification\/frozen-author-flow\//s;
  const author = await open(true, "collector-custom");
  assert.match(author.contextSections?.join("\n") ?? "", context);
  for (const format of ["project-modules/v2", "project-roster/v3", "team-plan/v3"]) {
    assert.match(await author.docFormat!({ format, part: "fields" }) ?? "", context);
  }
  assert.doesNotMatch(await author.docFormat!({ format: "project-proposal/v2" }) ?? "", context);
  assert.match(await author.contractCheck!({ topic: "modules" }) ?? "", context);
  assert.doesNotMatch(await author.contractCheck!({ topic: "modules", flowId: "foreign-flow" }) ?? "", context);
  assert.doesNotMatch(await (await open(true)).docFormat!({ format: "project-roster/v3" }) ?? "", context);
  assert.doesNotMatch(await (await open(false, "collector-custom")).docFormat!({ format: "project-roster/v3" }) ?? "", context);
});

test("worker binding carries the real task and effective module paths while preserving the file gate", async t => {
  const projectRoot = await mkdtemp(join(tmpdir(), "ans-yaml-worker-"));
  t.after(async () => rm(projectRoot, { recursive: true, force: true }));
  const roleRoot = join(projectRoot, "角色卡", "game");
  const codeRoot = join(projectRoot, "src", "race");
  await Promise.all([mkdir(roleRoot, { recursive: true }), mkdir(codeRoot, { recursive: true })]);
  await Promise.all([
    writeFile(join(roleRoot, "role-card.md"), "# 赛车实现者\n\n旧说明 Chief枢纽、D3 调度。\n"),
    writeFile(join(roleRoot, "boundary.yaml"), "role: game\nentries:\n  - root: project\n    kind: directory\n    path: src/race/\n    purpose: D3 old boundary prose\n"),
  ]);
  const taskId = "current-implementation";
  const appended = await appendTaskEvent(projectRoot, taskEvent("task.created", {
    taskId, from: "convener", to: "game", text: "具体赛车任务", sideEffect: "code", idempotencyKey: taskId,
    workflowId: "current-yaml-workflow", flowId: "race", stage: "A11", modulePaths: ["src/race/"],
  }, () => new Date()));
  assert.equal(appended.ok, true);
  const project: ProjectConfig = { projectRoot, skillRoot: projectRoot, governanceModel: "trio",
    roles: { game: { card: "角色卡/game/role-card.md", boundary: "角色卡/game/boundary.yaml" } },
    governanceBoundary: { path: "", acceptance: { accepted: true, source: "fixture" } },
  };
  let actual: ResolvedRole | undefined;
  let captured: AdapterCapabilities | undefined;
  let gate: WriteGate | undefined;
  const handle = await openRoleSession({
    project, roleId: "game", taskId, runtime: "claude", workflowMode: "fixed", durableFixedWorkflow: true,
    scope: { writeSet: ["src/race/game.js"], conditions: [] },
    taskGit: { durableScope: async () => ({ taskId, workflowId: "current-yaml-workflow", branch: "ans/task/current-yaml-workflow", paths: ["src/race/"] }) } as never,
    contractCheck: async () => "stage-request",
  }, { createAdapter: (writeGate, supplied) => {
    gate = writeGate;
    captured = supplied;
    return recordAdapter(role => { actual = role; });
  } });
  await handle.dispose();
  assert.ok(actual && gate);
  assert.equal(actual.id, "game");
  assert.equal(actual.kind, "project");
  assert.doesNotMatch(actual.cardText, /D3|Chief枢纽/);
  assert.deepEqual(actual.boundary.entries.map(({ path, kind }) => [path.replace(/\/$/, ""), kind]), [["src/race", "directory"]]);
  const context = captured?.contextSections?.join("\n") ?? "";
  assert.match(context, /"taskId":"current-implementation"/);
  assert.match(context, /"workflowId":"current-yaml-workflow"/);
  assert.match(context, /"writePaths":\["src\/race\/"\]/);
  assert.doesNotMatch(context, /"from":/);
  assert.equal((await gate(join(codeRoot, "game.js"))).allowed, true);
  assert.equal((await gate(join(projectRoot, "src", "other.js"))).allowed, false);
  assert.match(await readFile(join(roleRoot, "role-card.md"), "utf8"), /旧说明 Chief枢纽、D3 调度/);
  const reviewPath = "docs/quality/race-report-v1.md";
  const outside = await preflightDurableReviewWrite({ project, roleId: "game", path: reviewPath });
  assert.equal(outside.ok ? undefined : outside.code, "workflow-review-write-denied");
  const verifierRoot = await mkdtemp(join(tmpdir(), "ans-yaml-verifier-"));
  t.after(async () => rm(verifierRoot, { recursive: true, force: true }));
  assert.deepEqual(await preflightDurableReviewWrite({
    project: { projectRoot: verifierRoot, skillRoot: verifierRoot, roles: {}, builtInRoles: ["verifier"],
      governanceModel: "trio", genesisBootstrap: { source: "fixture customer bootstrap" } },
    roleId: "verifier", path: reviewPath,
  }), { ok: true, value: true });
});

test("only an authorized durable A11 worker receives the package lock port and task hint", async t => {
  const projectRoot = await mkdtemp(join(tmpdir(), "ans-yaml-lock-binding-"));
  t.after(async () => rm(projectRoot, { recursive: true, force: true }));
  const roles: ProjectConfig["roles"] = {};
  for (const roleId of ["environment", "game"]) {
    const roleRoot = join(projectRoot, "角色卡", roleId);
    const allowedPath = roleId === "environment" ? "package-lock.json" : "game.js";
    await mkdir(roleRoot, { recursive: true });
    await Promise.all([
      writeFile(join(roleRoot, "role-card.md"), `# ${roleId}\n`),
      writeFile(join(roleRoot, "boundary.yaml"), `role: ${roleId}\nentries:\n  - root: project\n    kind: file\n    path: ${allowedPath}\n    purpose: Implementation output\n`),
    ]);
    roles[roleId] = { card: `角色卡/${roleId}/role-card.md`, boundary: `角色卡/${roleId}/boundary.yaml` };
  }
  const project: ProjectConfig = { projectRoot, skillRoot: projectRoot, governanceModel: "trio", roles,
    builtInRoles: ["convener"], governanceBoundary: { path: "", acceptance: { accepted: true, source: "fixture" } } };
  const port: GovernedPackageLockGenerator = {
    authorize: async () => { throw new Error("The port authorizes actual tool calls, not session binding"); },
    generate: async () => { throw new Error("The port only generates on actual tool calls"); },
  };
  const rows = [
    { id: "ready", roleId: "environment", stage: "A11", paths: ["package-lock.json"], durable: true, claim: true, enabled: true },
    { id: "outside-task", roleId: "environment", stage: "A11", paths: ["package.json"], durable: true, claim: true, enabled: false },
    { id: "outside-boundary", roleId: "game", stage: "A11", paths: ["package-lock.json"], durable: true, claim: true, enabled: false },
    { id: "other-stage", roleId: "environment", stage: "A12b", paths: ["package-lock.json"], durable: true, claim: true, enabled: false },
    { id: "non-durable", roleId: "environment", stage: "A11", paths: ["package-lock.json"], durable: false, claim: true, enabled: false },
    { id: "no-claim", roleId: "environment", stage: "A11", paths: ["package-lock.json"], durable: true, claim: false, enabled: false },
    { id: "governance-role", roleId: "convener", stage: "A11", paths: ["package-lock.json"], durable: true, claim: true, enabled: false },
  ] as const;
  for (const row of rows) {
    const appended = await appendTaskEvent(projectRoot, taskEvent("task.created", {
      taskId: row.id, from: "convener", to: row.roleId, text: "实现任务", sideEffect: "code", idempotencyKey: row.id,
      workflowId: "current-yaml-workflow", flowId: "race", stage: row.stage, modulePaths: [...row.paths],
    }));
    assert.equal(appended.ok, true);
    let captured: AdapterCapabilities | undefined;
    const handle = await openRoleSession({
      project, roleId: row.roleId, taskId: row.id, runtime: "claude", workflowMode: "fixed", durableFixedWorkflow: row.durable,
      governedPackageLock: port,
      ...(row.claim ? { claimFileWrite: async () => ({ ok: false, code: "fixture-only", message: "No write in binding test" }) } : {}),
      taskGit: { durableScope: async () => ({ taskId: row.id, workflowId: "current-yaml-workflow",
        branch: "ans/task/current-yaml-workflow", paths: [...row.paths] }) } as never,
    }, { createAdapter: (_gate, supplied) => {
      captured = supplied;
      return recordAdapter(() => {});
    } });
    await handle.dispose();
    assert.equal(captured?.governedPackageLock, row.enabled ? port : undefined, row.id);
    assert.equal(captured?.contextSections?.join("\n").includes("generate_package_lock") ?? false, row.enabled, row.id);
  }
});

// B5 scratch probe (not part of the repository): host-driven B path chain.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const ROOT = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/trunk-amendment";
const ws = await import(`file:///${ROOT}/src/common/%E7%BC%96%E6%8E%92/workflow-service.ts`);
const st = await import(`file:///${ROOT}/src/common/%E7%BC%96%E6%8E%92/workflow-state.ts`);
const ts = await import(`file:///${ROOT}/src/common/%E7%BC%96%E6%8E%92/task-state.ts`);
const gitPort = await import(`file:///${ROOT}/app/desktop/workflow-git.ts`);

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-b-"));
const FLOW = "snake";
const NOW = () => new Date("2026-11-10T10:00:00.000Z");
const sha = (t) => createHash("sha256").update(t).digest("hex");
const write = async (rel, text) => { const abs = path.join(root, ...rel.split("/")); await fs.mkdir(path.dirname(abs), { recursive: true }); await fs.writeFile(abs, text, "utf8"); };
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore","pipe","pipe"] }).trim();
async function view(wf) {
  const ledger = await ws.readWorkflowLedger(root);
  const tasks = await ts.readTaskState(root);
  return st.deriveWorkflowView(ledger.events.filter((e) => e.workflowId === wf), tasks.events);
}
const MODULES = ["---","schema: project-modules/v2","flowId: snake","version: 1","modules:","  - id: core","    name: Core","    purpose: Core","    path: src/core/","    category: core","    publicContract: src/core/index.ts","    architectureSource: docs/contracts/snake-architecture-v1.md","---","# Modules",""].join("\n");
const ROSTER = ["---","schema: project-roster/v4","flowId: snake","version: 1","intent: docs/product/snake-intent-v1.md","proposal: docs/proposals/snake-proposal-v1.md","architecture: docs/contracts/snake-architecture-v1.md","envBootstrap:","  omitted: true","  omissionReason: probe","roles:","  - id: worker","    displayName: Worker","    purpose: Implement","    capability: TS","    modules: [core]","modules:","  - id: core","    name: Core","    purpose: Core","    path: src/core/","    category: core","    publicContract: src/core/index.ts","    architectureSource: docs/contracts/snake-architecture-v1.md","---","# Roster","## 人员+模块拓扑图","```topology","schema: project-topology/v2","management: [convener, worker]","modules:","  - id: core","    path: src/core/","    roleId: worker","roles:","  - id: worker","    modules: [core]","```",""].join("\n");

try {
  // existing repository with base commit + ans gitignore block
  git("init", "-b", "main");
  git("config", "user.name", "probe");
  git("config", "user.email", "probe@local");
  git("config", "core.autocrlf", "false");
  await write("src/core/snake.ts", "export const snake = 1;\n");
  const ensured = await gitPort.createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
  console.log("gitignore:", ensured.ok);
  git("add", "-A"); git("commit", "-m", "base");
  const mainOid = git("rev-parse", "HEAD");
  // docs for roster + snapshot
  await write("docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake\ngoal: fix\n---\n# Intent\n");
  await write("docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\nintent: docs/product/snake-intent-v1.md\n---\n# Proposal\n");
  await write("docs/proposals/snake-modules-v1.md", MODULES);
  await write("docs/proposals/snake-roster-v1.md", ROSTER);
  await write("docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\nproposal: docs/proposals/snake-proposal-v1.md\n---\n# Arch\n");

  const b1 = await ws.requestStage({ projectRoot: root, flowId: FLOW, stage: "B1", workflowPath: "B", requestDigest: sha("B1"), sourceTaskId: "turn-b1", text: "推进 B1：影响面分析", now: NOW });
  if (!b1.ok) throw new Error(`B1: ${b1.code}: ${b1.message}`);
  const WF = b1.workflowId;
  // host glue: path B minimal prep at B1 dispatch (desktop calls preparePathBStart)
  const prepB = await ws.preparePathBStart({ projectRoot: root, flowId: FLOW, workflowId: WF, operationId: `path-b:${WF}`, port: gitPort.createDesktopBaselineGitPort(), now: NOW });
  console.log("preparePathBStart:", prepB.ok, prepB.ok === false ? `${prepB.code}: ${prepB.message}` : `branch=${prepB.repository.branch} base=${prepB.repository.headOid?.hex?.slice(0,8)}`);
  if (!prepB.ok) throw new Error("path-b");
  // B1 analysis task (convener -> rapporteur) + report + close
  await write("docs/governance/rapporteur/snake-impact-v1.md", "# Impact\ncore bug\n");
  const tb1 = ts.taskEvent("task.created", { taskId: "t-b1", from: "convener", to: "rapporteur", text: "影响面分析", sideEffect: "docs", idempotencyKey: "work-b1", flowId: FLOW, workflowId: WF, stage: "B1" }, NOW);
  await ts.appendTaskEvent(root, tb1);
  await ts.appendTaskEvent(root, ts.taskEvent("task.reported", { taskId: "t-b1", from: "rapporteur", status: "done", summary: "影响面", evidence: ["docs/governance/rapporteur/snake-impact-v1.md"] }, NOW));
  const arts = [{ path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: sha(await fs.readFile(path.join(root, "docs/governance/rapporteur/snake-impact-v1.md"))), kind: "report-evidence" }];
  const cb1 = await ws.closeTask({ projectRoot: root, operationId: "op-b1", taskId: "t-b1", outcome: "accepted", actorRoleId: "convener", evidence: { artifacts: arts }, now: NOW });
  console.log("B1 close:", cb1.ok, cb1.ok === false ? cb1.code : `stageCompleted=${cb1.stageCompleted}`);
  await ts.appendTaskEvent(root, ts.taskEvent("task.reported", { taskId: b1.taskId, from: "convener", status: "done", summary: "B1 受理" }, NOW));
  const csr1 = await ws.closeTask({ projectRoot: root, operationId: "op-sr-b1", taskId: b1.taskId, outcome: "accepted", actorRoleId: "chief", now: NOW });
  console.log("SR-B1 close:", csr1.ok);
  console.log("after B1:", (await view(WF)).stage, (await view(WF)).stages.B1.status);

  // B2 scope decision (host glue: recordChangeScopeDecision)
  const impactSha = sha(await fs.readFile(path.join(root, "docs/governance/rapporteur/snake-impact-v1.md")));
  const scope = await ws.recordChangeScopeDecision({ projectRoot: root, flowId: FLOW, workflowId: WF, operationId: "op-b2", impactReport: { path: "docs/governance/rapporteur/snake-impact-v1.md", sha256: impactSha }, scope: { summary: "修复核心", files: ["src/core/snake.ts"], rationale: "bug" }, requestTaskId: b1.taskId, now: NOW });
  console.log("B2 scope:", scope.ok, scope.ok === false ? `${scope.code}: ${scope.message}` : JSON.stringify(scope.writesets));
  if (!scope.ok) throw new Error("B2");
  console.log("after B2:", (await view(WF)).stage, (await view(WF)).stages.B2.status);

  // B3
  const b3 = await ws.requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "B3", requestDigest: sha("B3"), sourceTaskId: "turn-b3", text: "推进 B3：修复", now: NOW });
  if (!b3.ok) throw new Error(`B3: ${b3.code}: ${b3.message}`);
  const v3 = await ws.verifyBasisForWorkflow({ projectRoot: root, workflowId: WF, now: NOW });
  console.log("basis verify:", v3.ok, v3.ok === false ? v3.code : "");
  const tb3 = ts.taskEvent("task.created", { taskId: "t-b3", from: "convener", to: "worker", text: "修复核心", sideEffect: "code", idempotencyKey: "work-b3", flowId: FLOW, workflowId: WF, stage: "B3", moduleId: "core", modulePaths: ["src/core/"] }, NOW);
  await ts.appendTaskEvent(root, tb3);
  const rr = await import(`file:///${ROOT}/src/pipeline/orchestration/run-role.ts`);
  const resolved = await rr.resolveTaskGitScope({ projectRoot: root, taskId: "t-b3", roleId: "worker" });
  console.log("B scope:", resolved.ok, resolved.ok === false ? `${resolved.code}: ${resolved.message}` : JSON.stringify(resolved.scope));
  if (!resolved.ok) throw new Error("scope");
  const port = gitPort.createDesktopTaskGitPort();
  await write("src/core/snake.ts", "export const snake = 2;\n");
  const add = await port.add({ projectRoot: root, paths: ["src/core/snake.ts"] });
  console.log("add:", add.exitCode);
  const release = port.acquireCriticalSection(root, "probe");
  const commit = await port.commit({ projectRoot: root, message: "B3 fix" });
  release?.();
  console.log("commit:", commit.exitCode);
  const tip = git("rev-parse", "HEAD");
  await ts.appendTaskEvent(root, ts.taskEvent("task.reported", { taskId: "t-b3", from: "worker", status: "done", summary: "修复完成", evidence: ["src/core/snake.ts"] }, NOW));
  const arts3 = [{ path: "src/core/snake.ts", sha256: sha(await fs.readFile(path.join(root, "src/core/snake.ts"))), kind: "report-evidence" }];
  const cb3 = await ws.closeTask({ projectRoot: root, operationId: "op-b3", taskId: "t-b3", outcome: "accepted", actorRoleId: "convener", evidence: { artifacts: arts3, branchTipOid: tip }, now: NOW });
  console.log("B3 close:", cb3.ok, cb3.ok === false ? `${cb3.code}: ${cb3.message}` : `stageCompleted=${cb3.stageCompleted}`);
  await ts.appendTaskEvent(root, ts.taskEvent("task.reported", { taskId: b3.taskId, from: "convener", status: "done", summary: "B3 汇总" }, NOW));
  const csr3 = await ws.closeTask({ projectRoot: root, operationId: "op-sr-b3", taskId: b3.taskId, outcome: "accepted", actorRoleId: "chief", now: NOW });
  console.log("SR-B3 close:", csr3.ok);
  console.log("after B3:", (await view(WF)).stage, (await view(WF)).stages.B3.status);

  const prep = await ws.prepareReleaseMerge({ projectRoot: root, workflowId: WF, operationId: "op-rel-b", summary: "交付", evidence: [{ path: "src/core/snake.ts", sha256: arts3[0].sha256 }], port: gitPort.createDesktopReleaseGitPort(), now: NOW });
  console.log("prepare B4:", prep.ok, prep.ok === false ? `${prep.code}: ${prep.message}` : `stage=${prep.stage} kind=${prep.preview.mergeKind}`);
  if (!prep.ok) throw new Error("release");
  const exec = await ws.executeReleaseMerge({ projectRoot: root, workflowId: WF, releaseId: prep.releaseId, confirmation: { by: "customer" }, port: gitPort.createDesktopReleaseGitPort(), now: NOW });
  console.log("execute B4:", exec.ok, exec.ok === false ? `${exec.code}: ${exec.message}` : `kind=${exec.mergeKind}`);
  console.log("closed:", JSON.stringify((await view(WF)).closed), "HEAD:", git("symbolic-ref", "--short", "HEAD"), "main was", mainOid.slice(0, 8));
} catch (err) {
  console.error("FAILED:", err?.message ?? err);
} finally {
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}

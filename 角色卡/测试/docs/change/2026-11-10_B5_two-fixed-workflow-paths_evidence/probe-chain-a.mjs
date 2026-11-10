// B5 scratch probe (not part of the repository): host-driven A path chain.
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

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chain-a-"));
const FLOW = "snake";
const NOW = () => new Date("2026-11-10T10:00:00.000Z");
const sha = (t) => createHash("sha256").update(t).digest("hex");
const write = async (rel, text) => { const abs = path.join(root, ...rel.split("/")); await fs.mkdir(path.dirname(abs), { recursive: true }); await fs.writeFile(abs, text, "utf8"); };
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore","pipe","pipe"] }).trim();

const MODULES = ["---","schema: project-modules/v2","flowId: snake","version: 1","modules:","  - id: core","    name: Core","    purpose: Core","    path: src/core/","    category: core","    publicContract: src/core/index.ts","    architectureSource: docs/contracts/snake-architecture-v1.md","---","# Modules",""].join("\n");
const ROSTER = ["---","schema: project-roster/v4","flowId: snake","version: 1","intent: docs/product/snake-intent-v1.md","proposal: docs/proposals/snake-proposal-v1.md","architecture: docs/contracts/snake-architecture-v1.md","envBootstrap:","  omitted: true","  omissionReason: probe","roles:","  - id: worker","    displayName: Worker","    purpose: Implement","    capability: TS","    modules: [core]","modules:","  - id: core","    name: Core","    purpose: Core","    path: src/core/","    category: core","    publicContract: src/core/index.ts","    architectureSource: docs/contracts/snake-architecture-v1.md","---","# Roster","## 人员+模块拓扑图","```topology","schema: project-topology/v2","management: [convener, worker]","modules:","  - id: core","    path: src/core/","    roleId: worker","roles:","  - id: worker","    modules: [core]","```",""].join("\n");
const PLAN = ["---","schema: teamPlanSchema:3","flowId: snake","version: 1","modules:","  path: docs/proposals/snake-modules-v1.md",`  sha256: ${sha(MODULES)}`,"roster:","  path: docs/proposals/snake-roster-v1.md",`  sha256: ${sha(ROSTER)}`,"roleRows:","  - roleId: worker","    modules: [core]","    writesets: [src/core/]","    dependsOn: []","---","# Team plan",""].join("\n");

async function writeDocs() {
  await write("docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇\n---\n# Intent\n");
  await write("docs/intents/snake-intent.md", "---\nintentId: snake-intent\nflowId: snake\ngoal: 贪吃蛇\n---\n# Entry\n");
  await write("docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\nintent: docs/product/snake-intent-v1.md\n---\n# Proposal\n");
  await write("docs/proposals/snake-modules-v1.md", MODULES);
  await write("docs/proposals/snake-roster-v1.md", ROSTER);
  await write("docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\nproposal: docs/proposals/snake-proposal-v1.md\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
  await write("docs/scheduling/snake-team-v1.md", PLAN);
  await write("\u89d2\u8272\u5361/worker/role-card.md", "# Worker card\n");
  await write("\u89d2\u8272\u5361/worker/boundary.md", "# \u8fb9\u754c\n\n## Section 1: \u53ef\u4fee\u6539\u6587\u4ef6\u4e0e\u76ee\u5f55\n\n| \u7c7b\u578b | \u8def\u5f84 | \u7528\u9014 |\n| --- | --- | --- |\n| \u76ee\u5f55 | `src/core/` | core |\n");
  await write("\u89d2\u8272\u5361/worker/boundary.yaml", "- root: project\n  path: src/core/\n  kind: directory\n  purpose: core\n");
}
const digest = (text) => sha(text);
async function view(wf) {
  const ledger = await ws.readWorkflowLedger(root);
  const tasks = await ts.readTaskState(root);
  return st.deriveWorkflowView(ledger.events.filter((e) => e.workflowId === wf), tasks.events);
}
async function srReportAndClose(taskId, from, summary, evidence) {
  const rep = ts.taskEvent("task.reported", { taskId, from, status: "done", summary, ...(evidence?.length ? { evidence } : {}) }, NOW);
  const r = await ts.appendTaskEvent(root, rep); if (!r.ok) throw new Error("report: " + r.message);
  const closed = await ws.closeTask({ projectRoot: root, operationId: `op-close-${taskId}`, taskId, outcome: "accepted", actorRoleId: "chief", now: NOW });
  if (!closed.ok) throw new Error(`close SR ${taskId}: ${closed.code}: ${closed.message}`);
}
async function productionClose(taskId, actorRoleId, files, branchTipOid) {
  const rep = ts.taskEvent("task.reported", { taskId, from: "worker", status: "done", summary: "done", ...(files?.length ? { evidence: files } : {}) }, NOW);
  const r = await ts.appendTaskEvent(root, rep); if (!r.ok) throw new Error("report: " + r.message);
  const arts = [];
  for (const f of files ?? []) arts.push({ path: f, sha256: sha(await fs.readFile(path.join(root, ...f.split("/")))), kind: "report-evidence" });
  const closed = await ws.closeTask({ projectRoot: root, operationId: `op-close-${taskId}`, taskId, outcome: "accepted", actorRoleId, evidence: { artifacts: arts, ...(branchTipOid ? { branchTipOid } : {}) }, now: NOW });
  if (!closed.ok) throw new Error(`close ${taskId}: ${closed.code}: ${closed.message}`);
  return closed;
}
async function dispatchTask(taskId, from, to, stage, wf, extra = {}) {
  const e = ts.taskEvent("task.created", { taskId, from, to, text: `task ${taskId}`, sideEffect: extra.sideEffect ?? "read-only", idempotencyKey: `work-${wf}-${stage}-${taskId}`, flowId: FLOW, workflowId: wf, stage, ...(extra.moduleId ? { moduleId: extra.moduleId } : {}) }, NOW);
  const r = await ts.appendTaskEvent(root, e); if (!r.ok) throw new Error("task: " + r.message);
}

try {
  await writeDocs();
  const a1 = await ws.requestStage({ projectRoot: root, flowId: FLOW, stage: "A1", workflowPath: "A", requestDigest: digest("A1 text"), sourceTaskId: "turn-1", text: "推进 A1：派产品写意图", now: NOW });
  if (!a1.ok) throw new Error(`A1: ${a1.code}: ${a1.message}`);
  const WF = a1.workflowId;
  console.log("workflow", WF);
  await dispatchTask("t-a1-product", "convener", "product", "A1", WF, { sideEffect: "docs" });
  let d = await ws.recordStageDispatch({ projectRoot: root, workflowId: WF, stage: "A1", taskId: "t-a1-product", targetRoleId: "product", now: NOW });
  console.log("recordStageDispatch A1:", d.ok, d.ok === false ? d.code : "");
  await productionClose("t-a1-product", "convener", []);
  await srReportAndClose(a1.taskId, "convener", "A1 受理");
  console.log("after A1:", (await view(WF)).stage, (await view(WF)).stages.A1.status);

  const a2 = await ws.requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "A2", requestDigest: digest("A2 text"), sourceTaskId: "turn-2", text: "推进 A2：产品写意图", now: NOW });
  if (!a2.ok) throw new Error(`A2: ${a2.code}: ${a2.message}`);
  await dispatchTask("t-a2-product", "convener", "product", "A2", WF, { sideEffect: "docs" });
  await productionClose("t-a2-product", "convener", ["docs/product/snake-intent-v1.md"]);
  await srReportAndClose(a2.taskId, "convener", "A2 完成");
  console.log("after A2:", (await view(WF)).stage, (await view(WF)).stages.A2.status);

  const prepared = await ws.prepareIntent({ projectRoot: root, flowId: FLOW, workflowId: WF, now: NOW });
  if (!prepared.ok) throw new Error(`prepareIntent: ${prepared.code}: ${prepared.message}`);
  const reqId = "req-intent-1";
  const resolved = ts.taskEvent("request.resolved", { requestId: reqId, decisionId: `decision-${reqId}`, cardKind: "intent-confirm", documentRefs: prepared.documentRefs, workflowId: WF, stage: "A3", by: "customer", choice: "confirm", selectedOptionIds: ["confirm"] }, NOW);
  const ra = await ts.appendTaskEvent(root, resolved); if (!ra.ok) throw new Error("resolved: " + ra.message);
  const fin = await ws.finalizeIntent({ projectRoot: root, event: resolved, workflowId: WF, flowId: FLOW, now: NOW });
  if (!fin.ok) throw new Error(`finalizeIntent: ${fin.code}: ${fin.message}`);
  console.log("after A3:", (await view(WF)).stage, (await view(WF)).stages.A3.status);

  const a4 = await ws.requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "A4", requestDigest: digest("A4"), sourceTaskId: "turn-4", text: "推进 A4：派策划", now: NOW });
  if (!a4.ok) throw new Error(`A4: ${a4.code}: ${a4.message}`);
  await dispatchTask("t-a4-rapporteur", "convener", "rapporteur", "A4", WF, { sideEffect: "docs" });
  const d4 = await ws.recordStageDispatch({ projectRoot: root, workflowId: WF, stage: "A4", taskId: "t-a4-rapporteur", targetRoleId: "rapporteur", now: NOW });
  console.log("recordStageDispatch A4:", d4.ok, d4.ok === false ? d4.code : "");
  await productionClose("t-a4-rapporteur", "convener", []);
  await srReportAndClose(a4.taskId, "convener", "A4 受理");
  console.log("after A4:", (await view(WF)).stage, (await view(WF)).stages.A4.status);

  const a5 = await ws.requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "A5", requestDigest: digest("A5"), sourceTaskId: "turn-5", text: "推进 A5：策划出方案", now: NOW });
  if (!a5.ok) throw new Error(`A5: ${a5.code}: ${a5.message}`);
  await dispatchTask("t-a5-rapporteur", "convener", "rapporteur", "A5", WF, { sideEffect: "docs" });
  await productionClose("t-a5-rapporteur", "convener", ["docs/proposals/snake-proposal-v1.md", "docs/proposals/snake-modules-v1.md", "docs/proposals/snake-roster-v1.md", "docs/contracts/snake-architecture-v1.md"]);
  await srReportAndClose(a5.taskId, "convener", "A5 完成");
  console.log("after A5:", (await view(WF)).stage, (await view(WF)).stages.A5.status);

  const req6 = "req-proposal-1";
  // GAP G-B5-3: no production writer for `stage.requested A6` (proposal card in-flight marker).
  const a6ev = { v: 1, at: NOW().toISOString(), schema: "ans-workflow/v1", kind: "stage.requested", workflowId: WF, flowId: FLOW, path: "A", idempotencyKey: `stage-request:${WF}:A6:1`, stage: "A6", fromStage: "A5", requestTaskId: `proposal-card:${FLOW}`, requestDigest: sha("proposal-card"), attempt: 1 };
  const ap6r = await ws.appendWorkflowEvent(root, a6ev); if (!ap6r.ok) throw new Error("A6 req: " + ap6r.message);
  const docRefs = [];
  for (const [kind, p] of [["intent","docs/product/snake-intent-v1.md"],["proposal","docs/proposals/snake-proposal-v1.md"],["modules","docs/proposals/snake-modules-v1.md"],["roster","docs/proposals/snake-roster-v1.md"],["architecture","docs/contracts/snake-architecture-v1.md"]]) {
    docRefs.push({ kind, path: p, sha256: sha(await fs.readFile(path.join(root, ...p.split("/")))), version: 1 });
  }
  const res6 = ts.taskEvent("request.resolved", { requestId: req6, decisionId: `decision-${req6}`, cardKind: "proposal", documentRefs: docRefs, workflowId: WF, stage: "A6", by: "customer", choice: "accept", selectedOptionIds: ["accept"] }, NOW);
  await ts.appendTaskEvent(root, res6);
  const ev6 = { v: 1, at: NOW().toISOString(), schema: "ans-workflow/v1", kind: "stage.completed", workflowId: WF, flowId: FLOW, path: "A", idempotencyKey: `stage-complete:${WF}:A6:${req6}`, stage: "A6", cause: { kind: "request-resolved", ref: req6 }, artifacts: docRefs.map((r) => ({ path: r.path, sha256: r.sha256, kind: r.kind })) };
  const ap6 = await ws.appendWorkflowEvent(root, ev6); if (!ap6.ok) throw new Error("A6: " + ap6.message);
  console.log("after A6:", (await view(WF)).stage, (await view(WF)).stages.A6.status);

  const a7 = await ws.requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "A7", requestDigest: digest("A7"), sourceTaskId: "turn-7", text: "推进 A7：派人事激活", now: NOW });
  if (!a7.ok) throw new Error(`A7: ${a7.code}: ${a7.message}`);
  await dispatchTask("t-a7-nominator", "convener", "nominator", "A7", WF, { sideEffect: "docs" });
  const d7 = await ws.recordStageDispatch({ projectRoot: root, workflowId: WF, stage: "A7", taskId: "t-a7-nominator", targetRoleId: "nominator", now: NOW });
  console.log("recordStageDispatch A7:", d7.ok, d7.ok === false ? d7.code : "");
  await productionClose("t-a7-nominator", "convener", []);
  console.log("after A7 close:", (await view(WF)).stage, (await view(WF)).stages.A7.status);

  await dispatchTask("t-a8-activate", "convener", "nominator", "A8", WF, { sideEffect: "docs" });
  const d8 = await ws.recordStageDispatch({ projectRoot: root, workflowId: WF, stage: "A8", taskId: "t-a8-activate", targetRoleId: "nominator", now: NOW });
  console.log("recordStageDispatch A8:", d8.ok, d8.ok === false ? d8.code : "");
  console.log("after A8 task:", (await view(WF)).stage, (await view(WF)).stages.A8.status);
  const activation = await ws.activateRoleDocumentsFixed({
    projectRoot: root, operationId: "op-act-1", flowId: FLOW, workflowId: WF,
    proposalDecisionId: `decision-${req6}`, targetRoleId: "worker",
    roster: { path: "docs/proposals/snake-roster-v1.md", sha256: sha(ROSTER) },
    documents: {
      card: { path: "\u89d2\u8272\u5361/worker/role-card.md", sha256: sha(await fs.readFile(path.join(root, "\u89d2\u8272\u5361/worker/role-card.md"))) },
      boundaryMd: { path: "\u89d2\u8272\u5361/worker/boundary.md", sha256: sha(await fs.readFile(path.join(root, "\u89d2\u8272\u5361/worker/boundary.md"))) },
      boundaryYaml: { path: "\u89d2\u8272\u5361/worker/boundary.yaml", sha256: sha(await fs.readFile(path.join(root, "\u89d2\u8272\u5361/worker/boundary.yaml"))) },
    }, now: NOW,
  });
  console.log("activation:", activation.ok, activation.ok === false ? `${activation.code}: ${activation.message}` : `stageCompleted=${activation.stageCompleted}`);
  console.log("after A8:", (await view(WF)).stage, (await view(WF)).stages.A8.status);
  await srReportAndClose(a7.taskId, "convener", "A7 完成");

  const a9 = await ws.requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "A9", requestDigest: digest("A9"), sourceTaskId: "turn-9", text: "推进 A9：基线", now: NOW });
  if (!a9.ok) throw new Error(`A9: ${a9.code}: ${a9.message}`);
  const plan = await ws.completeTeamPlanFixed({ projectRoot: root, flowId: FLOW, workflowId: WF, operationId: "op-a9", plan: { path: "docs/scheduling/snake-team-v1.md", version: 1, sha256: sha(PLAN) }, port: gitPort.createDesktopBaselineGitPort(), actorRoleId: "convener", now: NOW });
  console.log("A9:", plan.ok, plan.ok === false ? `${plan.code}: ${plan.message}` : `stageCompleted=${plan.stageCompleted} branch=${plan.git?.branch}`);
  if (!plan.ok) throw new Error("A9");
  await srReportAndClose(a9.taskId, "convener", "A9 完成");

  const a10ev = { v: 1, at: NOW().toISOString(), schema: "ans-workflow/v1", kind: "stage.requested", workflowId: WF, flowId: FLOW, path: "A", idempotencyKey: `stage-request:${WF}:A10:1`, stage: "A10", fromStage: "A9", requestTaskId: `appointment-card:${FLOW}:${sha(ROSTER).slice(0,12)}`, requestDigest: sha(ROSTER), attempt: 1 };
  const ap10 = await ws.appendWorkflowEvent(root, a10ev); if (!ap10.ok) throw new Error("A10 req: " + ap10.message);
  const req10 = "req-appointment-1";
  const res10 = ts.taskEvent("request.resolved", { requestId: req10, decisionId: `decision-${req10}`, cardKind: "appointment", documentRefs: [{ kind: "roster", path: "docs/proposals/snake-roster-v1.md", sha256: sha(ROSTER), version: 1 }], workflowId: WF, stage: "A10", source: "stage-a10", targetRoleIds: ["worker"], by: "customer", choice: "worker" }, NOW);
  await ts.appendTaskEvent(root, res10);
  const ev10 = { v: 1, at: NOW().toISOString(), schema: "ans-workflow/v1", kind: "stage.completed", workflowId: WF, flowId: FLOW, path: "A", idempotencyKey: `stage-complete:${WF}:A10:${req10}`, stage: "A10", cause: { kind: "appointment-confirmed", ref: req10 }, artifacts: [] };
  const ap10c = await ws.appendWorkflowEvent(root, ev10); if (!ap10c.ok) throw new Error("A10 comp: " + ap10c.message);
  console.log("after A10:", (await view(WF)).stage, (await view(WF)).stages.A10.status);

  await dispatchTask("t-a12a", "chief", "verifier", "A12a", WF, { sideEffect: "read-only" });
  const d12a = await ws.recordStageDispatch({ projectRoot: root, workflowId: WF, stage: "A12a", taskId: "t-a12a", targetRoleId: "verifier", now: NOW });
  console.log("recordStageDispatch A12a:", d12a.ok, d12a.ok === false ? d12a.code : "");
  await write("docs/quality/snake-criteria-v1.md", "# Criteria\n- AC-1\n");
  const c12a = await productionClose("t-a12a", "chief", ["docs/quality/snake-criteria-v1.md"]);
  console.log("A12a close stageCompleted:", c12a.stageCompleted);
  console.log("after A12a:", (await view(WF)).stage, (await view(WF)).stages.A12a.status);

  const a11 = await ws.requestStage({ projectRoot: root, flowId: FLOW, workflowId: WF, stage: "A11", requestDigest: digest("A11"), sourceTaskId: "turn-11", text: "推进 A11：派实现 worker", now: NOW });
  if (!a11.ok) throw new Error(`A11: ${a11.code}: ${a11.message}`);
  await dispatchTask("t-a11", "convener", "worker", "A11", WF, { sideEffect: "code", moduleId: "core" });
  await write("src/core/snake.ts", "export const snake = 1;\n");
  await gitPort.createDesktopBaselineGitPort().ensureGitignore({ projectRoot: root });
  const port = gitPort.createDesktopTaskGitPort();
  const branch = await port.currentBranch({ projectRoot: root });
  console.log("branch:", branch);
  const rr = await import(`file:///${ROOT}/src/pipeline/orchestration/run-role.ts`);
  const scope = await rr.resolveTaskGitScope({ projectRoot: root, taskId: "t-a11", roleId: "worker" });
  console.log("scope:", scope.ok, scope.ok === false ? `${scope.code}: ${scope.message}` : JSON.stringify(scope.scope));
  const add = await port.add({ projectRoot: root, paths: ["src/core/snake.ts"] });
  console.log("git add exit:", add.exitCode, add.error ?? "");
  const release = port.acquireCriticalSection(root, "test");
  const staged = await port.inspectStaged({ projectRoot: root });
  const commit = await port.commit({ projectRoot: root, message: "A11 implementation" });
  release?.();
  console.log("commit:", commit.exitCode, "staged:", staged.join(","));
  const tip = git("rev-parse", "HEAD");
  await productionClose("t-a11", "convener", ["src/core/snake.ts"], tip);
  await srReportAndClose(a11.taskId, "convener", "A11 完成");
  console.log("after A11:", (await view(WF)).stage, (await view(WF)).stages.A11.status);

  await dispatchTask("t-a12b", "chief", "verifier", "A12b", WF, { sideEffect: "read-only" });
  const d12b = await ws.recordStageDispatch({ projectRoot: root, workflowId: WF, stage: "A12b", taskId: "t-a12b", targetRoleId: "verifier", now: NOW });
  console.log("recordStageDispatch A12b:", d12b.ok, d12b.ok === false ? d12b.code : "");
  await write("docs/quality/snake-report-v1.md", "# Report\n\u7ed3\u8bba\uff1a\u901a\u8fc7\u3002\n");
  const archived = await ws.archiveAcceptance({ projectRoot: root, flowId: FLOW, workflowId: WF, criteriaPath: "docs/quality/snake-criteria-v1.md", reportPath: "docs/quality/snake-report-v1.md", conclusion: "\u901a\u8fc7", staffDecision: "\u5e55\u50da\u51b3\u5b9a\uff1a\u901a\u8fc7", now: NOW });
  console.log("archive:", archived.ok, archived.ok === false ? archived.code : archived.path);
  const rep12b = ts.taskEvent("task.reported", { taskId: "t-a12b", from: "verifier", status: "done", summary: "\u901a\u8fc7", evidence: ["docs/quality/snake-report-v1.md"] }, NOW);
  await ts.appendTaskEvent(root, rep12b);
  const arts12b = [{ path: "docs/quality/snake-report-v1.md", sha256: sha(await fs.readFile(path.join(root, "docs/quality/snake-report-v1.md"))), kind: "report" }];
  const c12b = await ws.closeTask({ projectRoot: root, operationId: "op-close-a12b", taskId: "t-a12b", outcome: "accepted", actorRoleId: "chief", evidence: { artifacts: arts12b, acceptanceArchive: { path: archived.path, sha256: archived.sha256 } }, now: NOW });
  console.log("A12b close:", c12b.ok, c12b.ok === false ? `${c12b.code}: ${c12b.message}` : `stageCompleted=${c12b.stageCompleted}`);
  console.log("after A12b:", (await view(WF)).stage, (await view(WF)).stages.A12b.status, (await view(WF)).stages.A12.status);

  const prep = await ws.prepareReleaseMerge({ projectRoot: root, workflowId: WF, operationId: "op-release-1", summary: "\u4ea4\u4ed8", evidence: [{ path: archived.path, sha256: archived.sha256 }], port: gitPort.createDesktopReleaseGitPort(), now: NOW });
  console.log("prepareReleaseMerge:", prep.ok, prep.ok === false ? `${prep.code}: ${prep.message}` : `stage=${prep.stage} releaseId=${prep.releaseId}`);
  if (!prep.ok) throw new Error("release prep");
  const exec = await ws.executeReleaseMerge({ projectRoot: root, workflowId: WF, releaseId: prep.releaseId, confirmation: { by: "customer" }, port: gitPort.createDesktopReleaseGitPort(), now: NOW });
  console.log("executeReleaseMerge:", exec.ok, exec.ok === false ? `${exec.code}: ${exec.message}` : `merged=${exec.mergeOid.hex.slice(0,8)} kind=${exec.mergeKind}`);
  console.log("view closed:", JSON.stringify((await view(WF)).closed));
  console.log("HEAD:", git("symbolic-ref", "--short", "HEAD"));
} catch (err) {
  console.error("FAILED:", err?.message ?? err);
} finally {
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}

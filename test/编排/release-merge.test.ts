// test/编排/release-merge.test.ts
// T3 B3（2026-11-10，编排）：B1 AC-11/AC-14/AC-22、T-10/T-15——应用自有 merge-main 发布合并通道。
// 覆盖：A13/B4 分支前置（A12b+归档 / B3+运营报告）、release-workflow-not-ready 缺项、
// basis/.gitignore/分支漂移呈卡前拒绝、main unborn（initial）/已存在（merge）/冲突/拒绝/幂等/
// 已合并 no-op、仅客户本人确认（judge/缺失 ⇒ release-unauthorized）、judge 转人工拒绝、
// release.merged 审计字段 + stage.completed A13 + workflow.closed delivered、不 push/tag、
// 不新增 requestReleaseMerge（G-IR MF-IR-8）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendBasisEvent,
  appendWorkflowEvent,
  archiveAcceptance,
  executeReleaseMerge,
  findAcceptanceArchive,
  prepareReleaseMerge,
  readReleaseLedger,
  readWorkflowLedger,
  rejectReleaseMerge,
  releaseIdFor,
  releaseIdempotencyKey,
  taskBranchName,
  type ReleaseGitPort,
  type WorkflowGitRepositoryFacts,
} from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import * as workflowService from "../../src/common/编排/workflow-service.ts";
import { GOVERNANCE_APP_OWNED_CARD_KINDS, GOVERNANCE_CARD_GROUP, governanceCardGroup } from "../../src/model/runtime.ts";
import type { BasisEvent, WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";
import type { GitOid as TrunkGitOid } from "../../src/model/trunk.ts";

const FLOW = "snake";
const AT = "2026-11-10T10:00:00.000Z";
const NOW = () => new Date(AT);
const D = "a".repeat(64);
const GIT_SHA = "c".repeat(64);
const DIFF = "d".repeat(64);
const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const };

function oid(fill: string): TrunkGitOid {
  return { objectFormat: "sha1", hex: fill.repeat(40) };
}
const TIP = oid("1");
const MAIN = oid("2");
const MERGE = oid("3");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-release-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
async function appendEvents(root: string, events: WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

function requested(workflowId: string, stage: WorkflowStage, attempt = 1): WorkflowEvent {
  return {
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: D, attempt,
  };
}
function completed(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE, kind: "stage.completed", workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed-${stage}`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}

/** 路径 A：A1–A12b 全部 requested+completed（view 停在 A12b completed）。 */
function seedA12bCompleted(workflowId: string): WorkflowEvent[] {
  const events: WorkflowEvent[] = [{
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW, path: "A",
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
  const stages: WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11", "A12b"];
  for (const stage of stages) {
    events.push(requested(workflowId, stage));
    events.push(completed(workflowId, stage));
  }
  return events;
}

/** 路径 B：B1–B3 completed（view 停在 B3 completed）。 */
function seedB3Completed(workflowId: string): WorkflowEvent[] {
  const started: WorkflowEvent = {
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW, path: "B",
    idempotencyKey: `workflow-start:${FLOW}:B:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  };
  const events: WorkflowEvent[] = [started];
  for (const stage of ["B1", "B2", "B3"] as WorkflowStage[]) {
    events.push({
      ...BASE, kind: "stage.requested", workflowId, flowId: FLOW, path: "B",
      idempotencyKey: `stage-request:${workflowId}:${stage}:1`, stage,
      requestTaskId: `t-req-${stage}`, requestDigest: D, attempt: 1,
    });
    events.push({
      ...BASE, kind: "stage.completed", workflowId, flowId: FLOW, path: "B",
      idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
      cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
    });
  }
  return events;
}

async function seedBasis(
  root: string,
  workflowId: string,
  documents: Array<{ kind: string; path: string; version: number; sha256: string; bytes: number }> = [],
): Promise<void> {
  const basisId = `bas-${sha(workflowId).slice(0, 24)}`;
  const event: BasisEvent = {
    v: 1, at: AT, schema: "ans-basis/v1", kind: "basis.recorded",
    idempotencyKey: `baseline:${workflowId}:seed`, basisId, workflowId, flowId: FLOW,
    documents,
    teamPlan: null,
    repo: {
      state: "existing", branch: taskBranchName(workflowId), baseOid: MAIN.hex, headOid: MAIN.hex,
      ignorePolicy: "ans-v1", gitignoreSha256: GIT_SHA,
    },
    reviewRoleId: "verifier", operationId: "op-basis", recordedBy: "application", reason: "path-b",
  };
  const appended = await appendBasisEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}

async function seedAcceptanceArchive(root: string, workflowId: string): Promise<{ criteria: string; report: string }> {
  const criteria = "# criteria\n";
  const report = "# report\n";
  await writeFile(root, "docs/quality/snake-criteria-v1.md", criteria);
  await writeFile(root, "docs/quality/snake-report-v1.md", report);
  const archived = await archiveAcceptance({
    projectRoot: root, flowId: FLOW, workflowId,
    criteriaPath: "docs/quality/snake-criteria-v1.md", reportPath: "docs/quality/snake-report-v1.md",
    conclusion: "通过", staffDecision: "验收通过，进入发布", now: NOW,
  });
  assert.equal(archived.ok, true, archived.ok === false ? archived.code : "");
  return { criteria, report };
}

/** 运营报告（convener 在 stage-request 任务上的 done 报告；AC-11 B4 / §6.4 公共前置）。 */
async function seedOperatorReport(root: string, workflowId: string): Promise<void> {
  const created = taskEvent("task.created", {
    taskId: "t-req-A11",
    from: "chief",
    to: "convener",
    text: "派实现",
    sideEffect: "read-only",
    idempotencyKey: `stage-request:${workflowId}:A11:1`,
    flowId: FLOW,
    workflowId,
    stage: "A11",
    taskKind: "stage-request",
  }, NOW);
  assert.equal((await appendTaskEvent(root, created)).ok, true);
  const report = taskEvent("task.reported", {
    taskId: "t-req-A11", from: "convener", status: "done", summary: "运营汇总完成",
  }, NOW);
  assert.equal((await appendTaskEvent(root, report)).ok, true);
}

interface FakePortOptions {
  facts?: Partial<WorkflowGitRepositoryFacts>;
  merge?: (request: Parameters<ReleaseGitPort["mergeMain"]>[0]) => Promise<Awaited<ReturnType<ReleaseGitPort["mergeMain"]>>>;
}

function fakeReleasePort(workflowId: string, options: FakePortOptions = {}): ReleaseGitPort & { calls: string[] } {
  const calls: string[] = [];
  const port = {
    calls,
    async inspectRepository() {
      calls.push("inspect");
      return {
        ok: true as const,
        facts: {
          branch: taskBranchName(workflowId),
          headOid: TIP,
          mainOid: MAIN,
          objectFormat: "sha1" as const,
          trackedChanges: 0,
          untracked: [] as string[],
          gitignoreSha256: GIT_SHA,
          gitignoreTrackedDirty: false,
          ...options.facts,
        },
      };
    },
    async previewMerge() {
      calls.push("preview");
      return {
        ok: true as const,
        files: [{ path: "src/snake.ts", status: "A" }],
        fileCount: 1,
        diffStat: "1 file changed, 1 insertion(+)",
        diffDigest: DIFF,
      };
    },
    async mergeMain(request: Parameters<ReleaseGitPort["mergeMain"]>[0]) {
      calls.push("merge");
      if (options.merge !== undefined) return options.merge(request);
      return {
        ok: true as const,
        mergeKind: request.mergeKind,
        baseOid: request.baseOid,
        tipOid: request.tipOid,
        mergeOid: MERGE,
        files: [{ path: "src/snake.ts", status: "A" }],
        diffDigest: DIFF,
      };
    },
  };
  return port;
}

test("A13 前置：A12b accepted + 归档已写入 ⇒ prepare 成功；release.requested + stage.requested A13；重复 prepare replay", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13ready0000000000000001";
    await appendEvents(root, seedA12bCompleted(workflowId));
    await seedBasis(root, workflowId);
    await seedAcceptanceArchive(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const port = fakeReleasePort(workflowId);

    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-1", summary: "交付贪吃蛇 v1", evidence: [], port, now: NOW,
    });
    assert.equal(prepared.ok, true, prepared.ok === false ? `${prepared.code}: ${prepared.message}` : "");
    if (!prepared.ok) return;
    assert.equal(prepared.stage, "A13");
    assert.equal(prepared.replay, false);
    assert.equal(prepared.releaseId, releaseIdFor(workflowId, TIP));
    assert.equal(prepared.releaseKey, releaseIdempotencyKey(workflowId, TIP));
    // AC-14 preview 必含字段。
    assert.equal(prepared.preview.workflowId, workflowId);
    assert.equal(prepared.preview.flowId, FLOW);
    assert.equal(prepared.preview.mainBaseOid?.hex, MAIN.hex);
    assert.equal(prepared.preview.branchTipOid.hex, TIP.hex);
    assert.equal(prepared.preview.fileCount, 1);
    assert.match(prepared.preview.diffStat, /file changed/);
    assert.equal(prepared.preview.mergeKind, "merge");
    assert.equal(prepared.preview.branchBaseOid, MAIN.hex);
    assert.equal(prepared.preview.nonMainBaseline, false);
    assert.ok(prepared.preview.highRiskNotes.length >= 1);
    assert.deepEqual(port.calls, ["inspect", "preview"]);

    const releases = await readReleaseLedger(root);
    const requestedEvent = releases.events.find((event) => event.kind === "release.requested");
    assert.ok(requestedEvent && requestedEvent.kind === "release.requested");
    if (requestedEvent?.kind === "release.requested") {
      assert.equal(requestedEvent.baseOid?.hex, MAIN.hex);
      assert.equal(requestedEvent.tipOid.hex, TIP.hex);
      assert.equal(requestedEvent.mergeKind, "merge");
    }
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.stage, "A13");
    assert.equal(view.stages.A13.status, "requested");

    const replay = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-1", summary: "交付贪吃蛇 v1", evidence: [], port, now: NOW,
    });
    assert.equal(replay.ok, true, replay.ok === false ? replay.code : "");
    if (replay.ok) assert.equal(replay.replay, true);
  } finally {
    await cleanup(root);
  }
});

test("A13 前置缺失：无归档 ⇒ release-workflow-not-ready（附缺项），不发卡不写 release.requested", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13marchive000000000001";
    await appendEvents(root, seedA12bCompleted(workflowId));
    await seedBasis(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const port = fakeReleasePort(workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-2", summary: "交付", evidence: [], port, now: NOW,
    });
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "release-workflow-not-ready");
      assert.ok((prepared.missing ?? []).some((item) => item.includes("docs/acceptance/snake-acceptance-vN.md")), JSON.stringify(prepared.missing));
    }
    const releases = await readReleaseLedger(root);
    assert.equal(releases.events.length, 0);
    assert.deepEqual(port.calls, []);
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.stage, "A12b", "缺项时不推进 A13");
  } finally {
    await cleanup(root);
  }
});

test("A13 前置缺失：A12b 未 accepted ⇒ release-workflow-not-ready", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13na12b000000000000001";
    const events = seedA12bCompleted(workflowId).filter((event) =>
      !(event.kind === "stage.completed" && event.stage === "A12b"));
    await appendEvents(root, events);
    await seedBasis(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-3", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "release-workflow-not-ready");
      assert.ok((prepared.missing ?? []).includes("A12b-accepted"));
    }
  } finally {
    await cleanup(root);
  }
});

test("B4 前置（不要求 A12b）：B3 accepted + 运营报告 ⇒ prepare 成功并推进 B4", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-b4ready000000000000000001";
    await appendEvents(root, seedB3Completed(workflowId));
    await seedBasis(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-b4", summary: "修复交付", evidence: [],
      port: fakeReleasePort(workflowId, { facts: { mainOid: oid("9") } }), now: NOW,
    });
    assert.equal(prepared.ok, true, prepared.ok === false ? `${prepared.code}: ${prepared.message}` : "");
    if (prepared.ok) {
      assert.equal(prepared.stage, "B4");
      // G-2/AC-22：分支基点 ≠ main base ⇒ preview 标注非 main 基线并保留 base OID。
      assert.equal(prepared.preview.branchBaseOid, MAIN.hex);
      assert.equal(prepared.preview.nonMainBaseline, true);
      assert.equal(prepared.preview.mainBaseOid?.hex, oid("9").hex);
    }
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.stage, "B4");
  } finally {
    await cleanup(root);
  }
});

test("B4 前置缺失：无运营报告 ⇒ release-workflow-not-ready（operator-report）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-b4noreport000000000000001";
    await appendEvents(root, seedB3Completed(workflowId));
    await seedBasis(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-b4-2", summary: "修复交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(prepared.ok, false);
    if (!prepared.ok) {
      assert.equal(prepared.code, "release-workflow-not-ready");
      assert.ok((prepared.missing ?? []).includes("operator-report"));
    }
  } finally {
    await cleanup(root);
  }
});

test("呈卡前拒绝：basis 文档漂移 ⇒ basis-drift；.gitignore hash 漂移 ⇒ basis-drift；分支漂移 ⇒ release-workflow-not-ready", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13drift00000000000000001";
    await appendEvents(root, seedA12bCompleted(workflowId));
    const intentText = "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\n---\n";
    await writeFile(root, "docs/product/snake-intent-v1.md", intentText);
    await seedBasis(root, workflowId, [{
      kind: "intent", path: "docs/product/snake-intent-v1.md", version: 1, sha256: sha(intentText), bytes: Buffer.byteLength(intentText),
    }]);
    await seedAcceptanceArchive(root, workflowId);
    await seedOperatorReport(root, workflowId);

    // 1) basis 文档字节漂移。
    await writeFile(root, "docs/product/snake-intent-v1.md", `${intentText}changed\n`);
    const drift = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-drift", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(drift.ok, false);
    if (!drift.ok) assert.equal(drift.code, "basis-drift");
    // 恢复文档，改 .gitignore（basis.repo 记录 GIT_SHA）。
    await writeFile(root, "docs/product/snake-intent-v1.md", intentText);
    const gitignoreDrift = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-drift", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId, { facts: { gitignoreSha256: "e".repeat(64) } }), now: NOW,
    });
    assert.equal(gitignoreDrift.ok, false);
    if (!gitignoreDrift.ok) assert.equal(gitignoreDrift.code, "basis-drift");
    // 2) 分支漂移。
    const branchDrift = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-drift", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId, { facts: { branch: "main" } }), now: NOW,
    });
    assert.equal(branchDrift.ok, false);
    if (!branchDrift.ok) {
      assert.equal(branchDrift.code, "release-workflow-not-ready");
      assert.ok((branchDrift.missing ?? []).some((item) => item.startsWith("branch:")));
    }
    // 3) 工作区 dirty 拒绝。
    const dirty = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-drift", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId, { facts: { trackedChanges: 2 } }), now: NOW,
    });
    assert.equal(dirty.ok, false);
    if (!dirty.ok) {
      assert.equal(dirty.code, "release-workflow-not-ready");
      assert.ok((dirty.missing ?? []).some((item) => item.startsWith("worktree-tracked-dirty")));
    }
  } finally {
    await cleanup(root);
  }
});

test("执行：main unborn ⇒ mergeKind initial；客户本人确认 ⇒ release.merged + stage.completed A13 + workflow.closed delivered（releaseId 投影）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13initial000000000000001";
    await appendEvents(root, seedA12bCompleted(workflowId));
    await seedBasis(root, workflowId);
    await seedAcceptanceArchive(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-exec", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId, { facts: { mainOid: null } }), now: NOW,
    });
    assert.equal(prepared.ok, true, prepared.ok === false ? prepared.code : "");
    if (!prepared.ok) return;
    assert.equal(prepared.preview.mergeKind, "initial");

    const port = fakeReleasePort(workflowId, { facts: { mainOid: null } });
    const executed = await executeReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId,
      confirmation: { by: "customer", decisionId: "dec-merge-1" }, port, now: NOW,
    });
    assert.equal(executed.ok, true, executed.ok === false ? `${executed.code}: ${executed.message}` : "");
    if (!executed.ok) return;
    assert.equal(executed.mergeKind, "initial");
    assert.equal(executed.baseOid, null);
    assert.equal(executed.tipOid.hex, TIP.hex);
    assert.equal(executed.mergeOid.hex, MERGE.hex);
    assert.equal(executed.alreadyMerged, false);
    assert.equal(executed.replay, false);
    assert.deepEqual(port.calls, ["inspect", "merge"]);

    const releases = await readReleaseLedger(root);
    const confirmed = releases.events.find((event) => event.kind === "release.confirmed");
    assert.ok(confirmed && confirmed.kind === "release.confirmed");
    if (confirmed?.kind === "release.confirmed") {
      assert.equal(confirmed.by, "customer");
      assert.equal(confirmed.decisionId, "dec-merge-1");
    }
    const merged = releases.events.find((event) => event.kind === "release.merged");
    assert.ok(merged && merged.kind === "release.merged");
    if (merged?.kind === "release.merged") {
      assert.equal(merged.mergeKind, "initial");
      assert.equal(merged.baseOid, null);
      assert.equal(merged.tipOid.hex, TIP.hex);
      assert.equal(merged.mergeOid.hex, MERGE.hex);
      assert.equal(merged.diffDigest, DIFF);
      assert.deepEqual(merged.files.map((file) => file.path), ["src/snake.ts"]);
    }
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.closed?.outcome, "delivered");
    assert.equal(view.releaseId, prepared.releaseId, "workflow-state 投影记录 releaseId");
    assert.equal(view.stages.A13.status, "completed");

    // 幂等：重复执行 ⇒ no-op 成功（release-already-merged）；重复 prepare ⇒ release-already-merged。
    const again = await executeReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, confirmation: { by: "customer" },
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(again.ok, true);
    if (again.ok) {
      assert.equal(again.alreadyMerged, true);
      assert.equal(again.code, "release-already-merged");
      assert.equal(again.releaseId, prepared.releaseId);
    }
    const prepareAgain = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-exec", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(prepareAgain.ok, false);
    if (!prepareAgain.ok) assert.equal(prepareAgain.code, "release-already-merged");
  } finally {
    await cleanup(root);
  }
});

test("执行：main 已存在 ⇒ mergeKind merge；冲突 ⇒ release.failed + stage.blocked，返回 release-merge-conflict，workflow 不关闭", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13conflict00000000000001";
    await appendEvents(root, seedA12bCompleted(workflowId));
    await seedBasis(root, workflowId);
    await seedAcceptanceArchive(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-conflict", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const conflictPort = fakeReleasePort(workflowId, {
      merge: async () => ({ ok: false, code: "release-merge-conflict", message: "冲突：已 git merge --abort 并切回任务分支" }),
    });
    const executed = await executeReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, confirmation: { by: "customer" }, port: conflictPort, now: NOW,
    });
    assert.equal(executed.ok, false);
    if (!executed.ok) assert.equal(executed.code, "release-merge-conflict");
    const releases = await readReleaseLedger(root);
    const failed = releases.events.find((event) => event.kind === "release.failed");
    assert.ok(failed && failed.kind === "release.failed");
    if (failed?.kind === "release.failed") {
      assert.equal(failed.code, "release-merge-conflict");
      assert.equal(failed.tipOid?.hex, TIP.hex);
    }
    assert.equal(releases.events.some((event) => event.kind === "release.merged"), false);
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.closed, undefined, "冲突不关闭 workflow");
    assert.equal(view.stage, "A13");
    assert.equal(view.status, "blocked");
    assert.equal(view.blocked?.code, "release-merge-conflict");
  } finally {
    await cleanup(root);
  }
});

test("仅客户本人：judge 确认 / 缺失确认 ⇒ release-unauthorized，不写 release.confirmed/merged", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13unauth0000000000000001";
    await appendEvents(root, seedA12bCompleted(workflowId));
    await seedBasis(root, workflowId);
    await seedAcceptanceArchive(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-unauth", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const judge = await executeReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, confirmation: { by: "judge" },
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(judge.ok, false);
    if (!judge.ok) assert.equal(judge.code, "release-unauthorized");
    const missing = await executeReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId,
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "release-unauthorized");
    const releases = await readReleaseLedger(root);
    assert.equal(releases.events.some((event) => event.kind === "release.confirmed"), false);
    assert.equal(releases.events.some((event) => event.kind === "release.merged"), false);
    // judge 可拒绝（转人工/拒绝），不得 approve/冒充客户。
    const rejected = await rejectReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, by: "judge", reason: "需客户本人确认", now: NOW,
    });
    assert.equal(rejected.ok, true);
    const releasesAfter = await readReleaseLedger(root);
    const rejectedEvent = releasesAfter.events.find((event) => event.kind === "release.rejected");
    assert.ok(rejectedEvent && rejectedEvent.kind === "release.rejected");
    if (rejectedEvent?.kind === "release.rejected") {
      assert.equal(rejectedEvent.by, "judge");
      assert.equal(rejectedEvent.reason, "需客户本人确认");
    }
    // 拒绝后执行 ⇒ release-rejected（不合并）。
    const afterReject = await executeReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, confirmation: { by: "customer" },
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(afterReject.ok, false);
    if (!afterReject.ok) assert.equal(afterReject.code, "release-rejected");
    const ledger = await readWorkflowLedger(root);
    const view = deriveWorkflowView(ledger.events, []);
    assert.equal(view.blocked?.code, "release-rejected");
    assert.equal(view.closed, undefined);
  } finally {
    await cleanup(root);
  }
});

test("客户拒绝：release.rejected(customer) + stage.blocked；replay 幂等", async () => {
  const root = await tempRoot();
  try {
    const workflowId = "wf-a13creject0000000000000001";
    await appendEvents(root, seedA12bCompleted(workflowId));
    await seedBasis(root, workflowId);
    await seedAcceptanceArchive(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-reject", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const rejected = await rejectReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, by: "customer", reason: "暂不发布", now: NOW,
    });
    assert.equal(rejected.ok, true);
    if (rejected.ok) {
      assert.equal(rejected.by, "customer");
      assert.equal(rejected.replay, false);
    }
    const replay = await rejectReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, by: "customer", reason: "暂不发布", now: NOW,
    });
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replay, true);
    const ledger = await readWorkflowLedger(root);
    assert.equal(deriveWorkflowView(ledger.events, []).blocked?.code, "release-rejected");
  } finally {
    await cleanup(root);
  }
});

test("审计：无 requestReleaseMerge 导出；端口无 push/tag；release.merged 含 baseOid/tipOid/mergeOid/files/diffDigest", async () => {
  assert.equal((workflowService as unknown as Record<string, unknown>)["requestReleaseMerge"], undefined, "G-IR MF-IR-8：不得新增 requestReleaseMerge");
  // AC-14/T-15：merge-main 为应用自有非判断卡（不进 judge 分组、planJudge 不可代批）。
  assert.ok(GOVERNANCE_APP_OWNED_CARD_KINDS.includes("merge-main"));
  assert.equal(governanceCardGroup("merge-main"), undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, "merge-main"), false);
  const workflowId = "wf-a13audit00000000000000001";
  const port = fakeReleasePort(workflowId);
  assert.deepEqual(Object.keys(port).filter((key) => key !== "calls").sort(), ["inspectRepository", "mergeMain", "previewMerge"]);
  assert.equal((port as unknown as Record<string, unknown>)["push"], undefined);
  assert.equal((port as unknown as Record<string, unknown>)["tag"], undefined);

  const root = await tempRoot();
  try {
    await appendEvents(root, seedA12bCompleted(workflowId));
    await seedBasis(root, workflowId);
    await seedAcceptanceArchive(root, workflowId);
    await seedOperatorReport(root, workflowId);
    const prepared = await prepareReleaseMerge({
      projectRoot: root, workflowId, operationId: "op-release-audit", summary: "交付", evidence: [],
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    const executed = await executeReleaseMerge({
      projectRoot: root, workflowId, releaseId: prepared.releaseId, confirmation: { by: "customer" },
      port: fakeReleasePort(workflowId), now: NOW,
    });
    assert.equal(executed.ok, true);
    const releases = await readReleaseLedger(root);
    const merged = releases.events.find((event) => event.kind === "release.merged");
    assert.ok(merged && merged.kind === "release.merged");
    if (merged?.kind === "release.merged") {
      assert.equal(merged.workflowId, workflowId);
      assert.equal(merged.flowId, FLOW);
      assert.ok(merged.baseOid !== null);
      assert.equal(merged.baseOid?.hex, MAIN.hex);
      assert.equal(merged.tipOid.hex, TIP.hex);
      assert.equal(merged.mergeOid.hex, MERGE.hex);
      assert.equal(merged.files.length, 1);
      assert.equal(merged.diffDigest, DIFF);
    }
    // 应用归档可被 findAcceptanceArchive 复核（workflowId 绑定）。
    const archive = await findAcceptanceArchive({ projectRoot: root, flowId: FLOW, workflowId });
    assert.ok(archive !== undefined);
    if (archive !== undefined) {
      assert.equal(archive.version, 1);
      assert.equal(archive.reportPath, "docs/quality/snake-report-v1.md");
    }
    const wrong = await findAcceptanceArchive({ projectRoot: root, flowId: FLOW, workflowId: "wf-other" });
    assert.equal(wrong, undefined);
  } finally {
    await cleanup(root);
  }
});

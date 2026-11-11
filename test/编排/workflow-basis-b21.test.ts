// test/编排/workflow-basis-b21.test.ts
// T3 B2.1（2026-11-10）：MF-B2-02 闭环——`basis.amended`/`previousBasisId` 修正流程、
// `basis.verified` 关键门节流、A12a/A12b basis drift 复核（`verifyBasisForStage`）。
// 覆盖：修正正/负/幂等；同 basis+同 documents digest 只记一次；drift 阻断 A11/B1/B3/A12a/A12b/A13/B4；
// A12a/A12b（chief→verifier 直派）可调用；verified 不产生写权/批准；旧断言/旧账本不变。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  BASIS_KEY_GATE_STAGES,
  amendBasis,
  appendBasisEvent,
  appendWorkflowEvent,
  readBasisLedger,
  readWorkflowLedger,
  recordBasis,
  verifyBasisForStage,
  verifyBasisForWorkflow,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import type { BasisEvent, WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const FLOW = "snake";
const D = "a".repeat(64);
const NOW = () => new Date("2026-11-10T10:00:00.000Z");
const AT = "2026-11-10T10:00:00.000Z";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-basis-b21-"));
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

const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
const A1_TO_A8: WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"];

/** 合成「A1..A8 完成 + 指定阶段 requested」的账本（A 路径；事件形状/顺序合法）。 */
function stageEvents(workflowId: string, completed: WorkflowStage[], requestStage?: WorkflowStage): WorkflowEvent[] {
  const events: WorkflowEvent[] = [{
    ...BASE,
    kind: "workflow.started",
    workflowId,
    flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`,
    trigger: { by: "chief", reason: "seed" },
    sourceTaskId: "t-src",
  }];
  for (const stage of completed) {
    events.push({
      ...BASE,
      kind: "stage.requested",
      workflowId,
      flowId: FLOW,
      idempotencyKey: `stage-request:${workflowId}:${stage}:1`,
      stage,
      requestTaskId: `t-req-${stage}`,
      requestDigest: D,
      attempt: 1,
    });
    events.push({
      ...BASE,
      kind: "stage.completed",
      workflowId,
      flowId: FLOW,
      idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`,
      stage,
      cause: { kind: "seed", ref: `seed-${stage}` },
      artifacts: [],
    });
  }
  if (requestStage !== undefined) {
    events.push({
      ...BASE,
      kind: "stage.requested",
      workflowId,
      flowId: FLOW,
      idempotencyKey: `stage-request:${workflowId}:${requestStage}:1`,
      stage: requestStage,
      requestTaskId: `t-req-${requestStage}`,
      requestDigest: D,
      attempt: 1,
    });
  }
  return events;
}

const MODULES_DOC = [
  "---",
  "schema: project-modules/v2",
  "flowId: snake",
  "version: 1",
  "modules:",
  "  - id: core",
  "    name: Core",
  "    purpose: Core module",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "---",
  "# Modules",
  "",
].join("\n");

function rosterDoc(
  intentPath = "docs/product/snake-intent-v1.md",
  version = 1,
  proposalPath = "docs/proposals/snake-proposal-v1.md",
  architecturePath = "docs/contracts/snake-architecture-v1.md",
): string {
  return [
    "---",
    "schema: project-roster/v4",
    "flowId: snake",
    `version: ${version}`,
    `intent: ${intentPath}`,
    `proposal: ${proposalPath}`,
    `architecture: ${architecturePath}`,
    "envBootstrap:",
    "  omitted: true",
    "  omissionReason: pure local text task",
    "roles:",
    "  - id: qa-project",
    "    displayName: Project QA",
    "    purpose: Independent review",
    "    capability: Review",
    "    modules: [core]",
    "    review: true",
    "modules:",
    "  - id: core",
    "    name: Core",
    "    purpose: Core module",
    "    path: src/core/",
    "    category: core",
    "    publicContract: src/core/index.ts",
    "    architectureSource: docs/contracts/snake-architecture-v1.md",
    "---",
    "# Roster",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "management: [convener, qa-project]",
    "modules:",
    "  - id: core",
    "    path: src/core/",
    "    roleId: qa-project",
    "roles:",
    "  - id: qa-project",
    "    modules: [core]",
    "```",
    "",
  ].join("\n");
}

function teamPlan(
  modulesSha: string,
  rosterSha: string,
  options: { version?: number; rosterPath?: string } = {},
): string {
  const version = options.version ?? 1;
  const rosterPath = options.rosterPath ?? "docs/proposals/snake-roster-v1.md";
  return [
    "---",
    "schema: teamPlanSchema:3",
    "flowId: snake",
    `version: ${version}`,
    "modules:",
    "  path: docs/proposals/snake-modules-v1.md",
    `  sha256: ${modulesSha}`,
    "roster:",
    `  path: ${rosterPath}`,
    `  sha256: ${rosterSha}`,
    "roleRows:",
    "  - roleId: qa-project",
    "    modules: [core]",
    "    writesets: [src/core/]",
    "    dependsOn: []",
    "---",
    "# Team plan",
    "",
  ].join("\n");
}

/** 一致出新的 -vN 文档集（intent→proposal→architecture→roster→team plan 版本链闭合）。 */
async function writeDocSetVersion(root: string, version: number): Promise<{
  intent: string;
  roster: string;
  plan: string;
  intentPath: string;
  planPath: string;
}> {
  const intentPath = `docs/product/snake-intent-v${version}.md`;
  const proposalPath = `docs/proposals/snake-proposal-v${version}.md`;
  const architecturePath = `docs/contracts/snake-architecture-v${version}.md`;
  const rosterPath = `docs/proposals/snake-roster-v${version}.md`;
  const planPath = `docs/scheduling/snake-team-v${version}.md`;
  const intent = `---\nschema: project-intent/v1\nflowId: snake\nversion: ${version}\nintentId: snake-intent\n---\n# Intent v${version}\n`;
  const proposal = `---\nschema: project-proposal/v2\nflowId: snake\nversion: ${version}\n---\n# Proposal v${version}\nintent: ${intentPath}\n`;
  const architecture = `---\nschema: project-architecture/v1\nflowId: snake\nversion: ${version}\n---\nproposal: ${proposalPath}\n`;
  const roster = rosterDoc(intentPath, version, proposalPath, architecturePath);
  const plan = teamPlan(sha(MODULES_DOC), sha(roster), { version, rosterPath });
  await writeFile(root, intentPath, intent);
  await writeFile(root, proposalPath, proposal);
  await writeFile(root, architecturePath, architecture);
  await writeFile(root, rosterPath, roster);
  await writeFile(root, planPath, plan);
  return { intent, roster, plan, intentPath, planPath };
}

/** v2 便捷别名（测试主用）。 */
function writeV2DocSet(root: string): Promise<{ intent: string; roster: string; plan: string; intentPath: string; planPath: string }> {
  return writeDocSetVersion(root, 2);
}

function intentV1(): string {
  return "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\n---\n# Intent\n";
}

async function seedDocs(root: string): Promise<{ modulesSha: string; rosterSha: string }> {
  await writeFile(root, "docs/product/snake-intent-v1.md", intentV1());
  await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\n---\n# Proposal\nintent: docs/product/snake-intent-v1.md\n");
  await writeFile(root, "docs/proposals/snake-modules-v1.md", MODULES_DOC);
  const roster = rosterDoc();
  await writeFile(root, "docs/proposals/snake-roster-v1.md", roster);
  await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
  return { modulesSha: sha(MODULES_DOC), rosterSha: sha(roster) };
}

/** 真实 A9 基线（recordBasis）：A1..A8 完成、A9 在办 + 5 文档 + 团队计划 v1。 */
async function setupRecordedBaseline(root: string): Promise<{ workflowId: string; basisId: string }> {
  const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
  await appendEvents(root, stageEvents(workflowId, A1_TO_A8, "A9"));
  const { modulesSha, rosterSha } = await seedDocs(root);
  await writeFile(root, "docs/scheduling/snake-team-v1.md", teamPlan(modulesSha, rosterSha));
  const recorded = await recordBasis({
    projectRoot: root,
    flowId: FLOW,
    workflowId,
    operationId: "op-baseline-1",
    planPath: "docs/scheduling/snake-team-v1.md",
    planVersion: 1,
    now: NOW,
  });
  assert.equal(recorded.ok, true, recorded.ok === false ? `${recorded.code}: ${recorded.message}` : "");
  if (!recorded.ok) throw new Error("seed baseline failed");
  return { workflowId, basisId: recorded.basisId };
}

/** 合成 basis.recorded（只读快照型；用于关键门/A12 直派状态，不依赖 A9 在办）。 */
async function seedSyntheticBasis(root: string, workflowId: string, documentPath: string, content: string): Promise<string> {
  const basisId = `bas-${sha(workflowId).slice(0, 24)}`;
  const event: BasisEvent = {
    v: 1,
    at: AT,
    schema: "ans-basis/v1",
    kind: "basis.recorded",
    idempotencyKey: `baseline:${workflowId}:seed`,
    basisId,
    workflowId,
    flowId: FLOW,
    documents: [{ kind: "intent", path: documentPath, version: 1, sha256: sha(content), bytes: Buffer.byteLength(content) }],
    teamPlan: null,
    reviewRoleId: "verifier",
    operationId: "op-basis",
    recordedBy: "application",
    reason: "path-b",
  };
  const appended = await appendBasisEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  return basisId;
}

test("basis.amended：出新 -vN ⇒ 追加修正记录（previousBasisId 指向旧 basis，旧记录保留）；同幂等键 replay；verify 改用新版", async () => {
  const root = await tempRoot();
  try {
    const { workflowId, basisId: oldBasisId } = await setupRecordedBaseline(root);
    const workflowEventsBefore = (await readWorkflowLedger(root)).events.length;

    const v2 = await writeV2DocSet(root);

    const amended = await amendBasis({
      projectRoot: root,
      flowId: FLOW,
      workflowId,
      operationId: "op-amend-1",
      previousBasisId: oldBasisId,
      planPath: v2.planPath,
      planVersion: 2,
      planSha256: sha(v2.plan),
      now: NOW,
    });
    assert.equal(amended.ok, true, amended.ok === false ? `${amended.code}: ${amended.message}` : "");
    if (!amended.ok) return;
    assert.equal(amended.replay, false);
    assert.notEqual(amended.basisId, oldBasisId);
    assert.equal(amended.previousBasisId, oldBasisId);
    assert.equal(amended.reviewRoleId, "qa-project");
    assert.ok(amended.documents.some((doc) => doc.path === v2.intentPath && doc.sha256 === sha(v2.intent)));
    assert.ok(amended.documents.some((doc) => doc.path === "docs/proposals/snake-roster-v2.md" && doc.sha256 === sha(v2.roster)));
    assert.equal(amended.teamPlan?.path, v2.planPath);
    assert.equal(amended.teamPlan?.sha256, sha(v2.plan));

    const ledger = await readBasisLedger(root);
    const recordedEvent = ledger.events.find((event) => event.kind === "basis.recorded");
    assert.ok(recordedEvent, "旧 basis.recorded 保留");
    const amendedEvents = ledger.events.filter((event) => event.kind === "basis.amended");
    assert.equal(amendedEvents.length, 1);
    const amendedEvent = amendedEvents[0]!;
    assert.ok(amendedEvent.kind === "basis.amended");
    if (amendedEvent.kind === "basis.amended") {
      assert.equal(amendedEvent.previousBasisId, oldBasisId);
      assert.equal(amendedEvent.basisId, amended.basisId);
      assert.equal(amendedEvent.recordedBy, "application");
      assert.equal(amendedEvent.operationId, "op-amend-1");
      assert.ok(amendedEvent.documents.some((doc) => doc.path === "docs/product/snake-intent-v2.md"));
    }
    if (recordedEvent?.kind === "basis.recorded") {
      assert.ok(recordedEvent.documents.some((doc) => doc.path === "docs/product/snake-intent-v1.md"), "旧 basis 文档集合不变");
    }

    // verify 现在按新 basis（intent v2）校验；旧 v1 文件仍在盘但不是最新。
    const verified = await verifyBasisForWorkflow({ projectRoot: root, workflowId, now: NOW });
    assert.equal(verified.ok, true);
    if (verified.ok) assert.equal(verified.basisId, amended.basisId);

    // 修正不产生写权/阶段推进：工作流账本事件数不变，无 role.activated。
    const workflowEventsAfter = (await readWorkflowLedger(root)).events;
    assert.equal(workflowEventsAfter.length, workflowEventsBefore);
    assert.equal(workflowEventsAfter.some((event) => event.kind === "role.activated"), false);

    // 同幂等键 replay：返回原 basisId，不追加第二行。
    const replay = await amendBasis({
      projectRoot: root,
      flowId: FLOW,
      workflowId,
      operationId: "op-amend-1",
      previousBasisId: oldBasisId,
      now: NOW,
    });
    assert.equal(replay.ok, true, replay.ok === false ? replay.code : "");
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.basisId, amended.basisId);
    }
    assert.equal((await readBasisLedger(root)).events.filter((event) => event.kind === "basis.amended").length, 1);
  } finally {
    await cleanup(root);
  }
});

test("amendBasis 负例：同路径改字节 ⇒ basis.drift + basis-hash-mismatch；plan hash 不符/未知或过期 previous/flowId 不符/无变化/关闭 ⇒ fail-closed", async () => {
  const root = await tempRoot();
  try {
    const { workflowId, basisId: oldBasisId } = await setupRecordedBaseline(root);
    const base = { projectRoot: root, flowId: FLOW, workflowId, now: NOW };

    // 1) 无变化 ⇒ basis-amend-invalid（不追加）。
    const noop = await amendBasis({ ...base, operationId: "op-noop", previousBasisId: oldBasisId });
    assert.equal(noop.ok, false);
    if (!noop.ok) assert.equal(noop.code, "basis-amend-invalid");

    // 2) 同路径原地改字节 ⇒ basis.drift + basis-hash-mismatch（必须出新 -vN）。
    const changed = `${intentV1()}changed\n`;
    await writeFile(root, "docs/product/snake-intent-v1.md", changed);
    const inPlace = await amendBasis({ ...base, operationId: "op-inplace", previousBasisId: oldBasisId });
    assert.equal(inPlace.ok, false);
    if (!inPlace.ok) assert.equal(inPlace.code, "basis-hash-mismatch");
    const driftEvents = (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.drift");
    assert.equal(driftEvents.length, 1);
    const drift = driftEvents[0]!;
    assert.ok(drift.kind === "basis.drift");
    if (drift.kind === "basis.drift") {
      assert.equal(drift.path, "docs/product/snake-intent-v1.md");
      assert.equal(drift.expectedSha256, sha(intentV1()));
      assert.equal(drift.actualSha256, sha(changed));
      assert.equal(drift.basisId, oldBasisId);
      assert.equal(drift.detectedAt, AT);
    }
    await writeFile(root, "docs/product/snake-intent-v1.md", intentV1());

    // 3) 声明 plan.sha256 与实际字节不符 ⇒ basis-hash-mismatch。
    const badPlanSha = await amendBasis({ ...base, operationId: "op-bad-plan", previousBasisId: oldBasisId, planSha256: "b".repeat(64) });
    assert.equal(badPlanSha.ok, false);
    if (!badPlanSha.ok) assert.equal(badPlanSha.code, "basis-hash-mismatch");

    // 4) flowId 与 workflow 不匹配 ⇒ basis-amend-invalid。
    const badFlow = await amendBasis({ ...base, flowId: "other", operationId: "op-bad-flow", previousBasisId: oldBasisId });
    assert.equal(badFlow.ok, false);
    if (!badFlow.ok) assert.equal(badFlow.code, "basis-amend-invalid");

    // 5) 不存在的 previousBasisId ⇒ basis-missing。
    const missing = await amendBasis({ ...base, operationId: "op-missing", previousBasisId: "bas-deadbeefdeadbeefdeadbeef" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "basis-missing");

    // 6) 合法修正 v2 成功；再用过期 previousBasisId 修正 v3 ⇒ basis-amend-invalid（不跳代）。
    const v2 = await writeV2DocSet(root);
    const first = await amendBasis({ ...base, operationId: "op-amend-1", previousBasisId: oldBasisId, planPath: v2.planPath });
    assert.equal(first.ok, true, first.ok === false ? first.code : "");
    if (!first.ok) return;
    await writeDocSetVersion(root, 3);
    const stale = await amendBasis({ ...base, operationId: "op-stale", previousBasisId: oldBasisId });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, "basis-amend-invalid");

    // 7) 同 operationId 不同内容 ⇒ baseline-operation-conflict。
    const conflict = await amendBasis({ ...base, operationId: "op-amend-1", previousBasisId: first.basisId });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.code, "baseline-operation-conflict");

    // 8) 缺失必需文档（删除 v1 且无新版本）⇒ basis-document-missing。
    await fs.rm(path.join(root, "docs", "product", "snake-intent-v3.md"));
    await fs.rm(path.join(root, "docs", "product", "snake-intent-v2.md"));
    await fs.rm(path.join(root, "docs", "product", "snake-intent-v1.md"));
    const missingDoc = await amendBasis({ ...base, operationId: "op-missing-doc", previousBasisId: first.basisId });
    assert.equal(missingDoc.ok, false);
    if (!missingDoc.ok) assert.equal(missingDoc.code, "basis-document-missing");

    // 9) workflow 已关闭 ⇒ workflow-closed。
    await writeFile(root, "docs/product/snake-intent-v1.md", intentV1());
    const closed: WorkflowEvent = {
      ...BASE,
      kind: "workflow.closed",
      workflowId,
      flowId: FLOW,
      idempotencyKey: `workflow-close:${workflowId}:delivered:test`,
      outcome: "delivered",
      reason: "test-close",
    };
    await appendEvents(root, [closed]);
    const closedAmend = await amendBasis({ ...base, operationId: "op-closed", previousBasisId: first.basisId });
    assert.equal(closedAmend.ok, false);
    if (!closedAmend.ok) assert.equal(closedAmend.code, "workflow-closed");
  } finally {
    await cleanup(root);
  }
});

test("basis.verified 节流：关键门一致只记一次（同 basis+同 digest）；普通读取不记账；新 basis 追加；不是写权/批准", async () => {
  const root = await tempRoot();
  try {
    const { workflowId, basisId } = await setupRecordedBaseline(root);
    const workflowEventsBefore = (await readWorkflowLedger(root)).events.length;
    const verifiedOf = async (): Promise<BasisEvent[]> => (await readBasisLedger(root)).events.filter((event) => event.kind === "basis.verified");

    // 普通读取（无 stage）：校验通过但不入账。
    const readOnly = await verifyBasisForWorkflow({ projectRoot: root, workflowId, now: NOW });
    assert.equal(readOnly.ok, true);
    if (readOnly.ok) assert.equal(readOnly.verifiedRecorded, false);
    assert.equal((await verifiedOf()).length, 0);

    // 关键门 A11：首次一致 ⇒ 追加一次摘要。
    const first = await verifyBasisForWorkflow({ projectRoot: root, workflowId, stage: "A11", now: NOW });
    assert.equal(first.ok, true);
    if (first.ok) {
      assert.equal(first.verifiedRecorded, true);
      assert.equal(first.basisId, basisId);
    }
    let verified = await verifiedOf();
    assert.equal(verified.length, 1);
    const event = verified[0]!;
    assert.ok(event.kind === "basis.verified");
    if (event.kind === "basis.verified") {
      assert.equal(event.basisId, basisId);
      assert.equal(event.ok, true);
      assert.equal(event.checkedAt, AT);
      assert.ok(event.documents.some((doc) => doc.path === "docs/product/snake-intent-v1.md" && doc.sha256 === sha(intentV1()) && doc.ok === true));
      assert.ok(event.documents.some((doc) => doc.path === "docs/scheduling/snake-team-v1.md"));
    }

    // 同 basis 重复关键门（A12a/A13）⇒ 节流不追加。
    for (const stage of ["A12a", "A13", "A11"] as WorkflowStage[]) {
      const repeated = await verifyBasisForStage({ projectRoot: root, workflowId, stage, now: NOW });
      assert.equal(repeated.ok, true);
      if (repeated.ok) assert.equal(repeated.verifiedRecorded, false);
    }
    assert.equal((await verifiedOf()).length, 1);

    // 非关键门阶段（A2）即使传 stage 也不入账。
    const nonGate = await verifyBasisForStage({ projectRoot: root, workflowId, stage: "A2", now: NOW });
    assert.equal(nonGate.ok, true);
    if (nonGate.ok) assert.equal(nonGate.verifiedRecorded, false);
    assert.equal((await verifiedOf()).length, 1);

    // 新 basis（修正 v2）⇒ 新 basisId + 新摘要 ⇒ 记新一次。
    const v2 = await writeV2DocSet(root);
    const amended = await amendBasis({
      projectRoot: root,
      flowId: FLOW,
      workflowId,
      operationId: "op-amend-verified",
      previousBasisId: basisId,
      planPath: v2.planPath,
      now: NOW,
    });
    assert.equal(amended.ok, true, amended.ok === false ? amended.code : "");
    if (!amended.ok) return;
    const gateNewBasis = await verifyBasisForStage({ projectRoot: root, workflowId, stage: "A12b", now: NOW });
    assert.equal(gateNewBasis.ok, true);
    if (gateNewBasis.ok) {
      assert.equal(gateNewBasis.verifiedRecorded, true);
      assert.equal(gateNewBasis.basisId, amended.basisId);
    }
    verified = await verifiedOf();
    assert.equal(verified.length, 2);
    assert.ok(verified.some((item) => item.kind === "basis.verified" && item.basisId === amended.basisId));

    // verified 只是校验记录：工作流账本不变（无批准/写权/阶段推进/激活）。
    const workflowEventsAfter = (await readWorkflowLedger(root)).events;
    assert.equal(workflowEventsAfter.length, workflowEventsBefore);
    assert.equal(workflowEventsAfter.some((event) => event.kind === "role.activated"), false);
  } finally {
    await cleanup(root);
  }
});

test("drift 阻断关键门 A11/B1/B3/A12a/A12b/A13/B4：fail-closed + basis.drift 只记一次；恢复后重新校验通过", async () => {
  const root = await tempRoot();
  try {
    const { workflowId } = await setupRecordedBaseline(root);
    const docPath = "docs/product/snake-intent-v1.md";
    await writeFile(root, docPath, `${intentV1()}drifted\n`);

    for (const stage of BASIS_KEY_GATE_STAGES) {
      const blocked = await verifyBasisForStage({ projectRoot: root, workflowId, stage, now: NOW });
      assert.equal(blocked.ok, false, `stage ${stage} 应被 drift 阻断`);
      if (!blocked.ok) assert.equal(blocked.code, "basis-drift");
    }
    // 同 path+同实际字节 ⇒ 同幂等键 replay，不重复记账；drift 期间不写 verified。
    const ledger = await readBasisLedger(root);
    assert.equal(ledger.events.filter((event) => event.kind === "basis.drift").length, 1);
    assert.equal(ledger.events.filter((event) => event.kind === "basis.verified").length, 0);

    // 恢复文档 ⇒ 重新校验通过并（首次）记 verified。
    await writeFile(root, docPath, intentV1());
    const recovered = await verifyBasisForStage({ projectRoot: root, workflowId, stage: "A12b", now: NOW });
    assert.equal(recovered.ok, true);
    if (recovered.ok) assert.equal(recovered.verifiedRecorded, true);
    const after = await readBasisLedger(root);
    assert.equal(after.events.filter((event) => event.kind === "basis.verified").length, 1);
    assert.equal(after.events.filter((event) => event.kind === "basis.drift").length, 1);
  } finally {
    await cleanup(root);
  }
});

test("A12a/A12b 直派（chief→verifier）可调用：verifyBasisForStage 一致 ⇒ verified；drift ⇒ 阻塞完成（不触 trunk/CAS）", async () => {
  for (const scenario of [
    { stage: "A12a" as WorkflowStage, completed: [...A1_TO_A8, "A9", "A10"] as WorkflowStage[] },
    { stage: "A12b" as WorkflowStage, completed: [...A1_TO_A8, "A9", "A10", "A11"] as WorkflowStage[] },
  ]) {
    const root = await tempRoot();
    try {
      const workflowId = workflowIdFor(FLOW, "A", `t-src-${scenario.stage}`, D);
      // workflow.started 的 sourceTaskId 固定 t-src；此处只构造阶段序列（账本形状/顺序合法）。
      await appendEvents(root, stageEvents(workflowId, scenario.completed, scenario.stage));
      const docPath = `docs/quality/snake-criteria-${scenario.stage}.md`;
      const criteria = `# criteria ${scenario.stage}\n`;
      await writeFile(root, docPath, criteria);
      await seedSyntheticBasis(root, workflowId, docPath, criteria);

      const workflowEventsBefore = (await readWorkflowLedger(root)).events.length;
      const ok = await verifyBasisForStage({ projectRoot: root, workflowId, stage: scenario.stage, now: NOW });
      assert.equal(ok.ok, true, ok.ok === false ? `${scenario.stage} ${ok.code}` : "");
      if (ok.ok) assert.equal(ok.verifiedRecorded, true);

      // drift ⇒ fail-closed（桌面在 verifier close/report 前调用 ⇒ 阻塞 A12a/A12b 完成）。
      await writeFile(root, docPath, `${criteria}changed\n`);
      const blocked = await verifyBasisForStage({ projectRoot: root, workflowId, stage: scenario.stage, now: NOW });
      assert.equal(blocked.ok, false, `${scenario.stage} drift 应阻塞`);
      if (!blocked.ok) assert.equal(blocked.code, "basis-drift");

      // 不触 trunk/CAS、不写阶段完成：旧机制目录不存在，工作流账本事件数不变。
      for (const legacy of [".ans/trunk", ".ans/runs"]) {
        await assert.rejects(fs.access(path.join(root, ...legacy.split("/"))), { code: "ENOENT" }, legacy);
      }
      assert.equal((await readWorkflowLedger(root)).events.length, workflowEventsBefore);
    } finally {
      await cleanup(root);
    }
  }
});

test("path-b 只读快照修正：basis.amended 采用现存文档快照（缺失允许、无团队计划），不产生写权", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "B", "t-src-b", D);
    const started: WorkflowEvent = {
      v: 1,
      at: AT,
      schema: "ans-workflow/v1",
      kind: "workflow.started",
      workflowId,
      flowId: FLOW,
      path: "B",
      idempotencyKey: `workflow-start:${FLOW}:B:t-src-b`,
      trigger: { by: "chief", reason: "path-b" },
      sourceTaskId: "t-src-b",
    };
    await appendEvents(root, [started]);
    const basisId = `bas-${sha(workflowId).slice(0, 24)}`;
    const emptyBasis: BasisEvent = {
      v: 1,
      at: AT,
      schema: "ans-basis/v1",
      kind: "basis.recorded",
      idempotencyKey: `path-b:${workflowId}:none`,
      basisId,
      workflowId,
      flowId: FLOW,
      documents: [],
      teamPlan: null,
      reviewRoleId: "verifier",
      operationId: "op-pathb",
      recordedBy: "application",
      reason: "path-b",
    };
    const appended = await appendBasisEvent(root, emptyBasis);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");

    const docPath = "docs/product/snake-intent-v1.md";
    await writeFile(root, docPath, intentV1());
    const amended = await amendBasis({
      projectRoot: root,
      flowId: FLOW,
      workflowId,
      operationId: "op-pathb-amend",
      previousBasisId: basisId,
      now: NOW,
    });
    assert.equal(amended.ok, true, amended.ok === false ? `${amended.code}: ${amended.message}` : "");
    if (!amended.ok) return;
    assert.equal(amended.teamPlan, undefined, "path-b 修正无团队计划");
    assert.ok(amended.documents.some((doc) => doc.path === docPath));
    const verify = await verifyBasisForWorkflow({ projectRoot: root, workflowId, now: NOW });
    assert.equal(verify.ok, true);
  } finally {
    await cleanup(root);
  }
});

test("非法 stage：verifyBasisForStage 拒绝（stage-transition-invalid），不读/写账本", async () => {
  const root = await tempRoot();
  try {
    const { workflowId } = await setupRecordedBaseline(root);
    const before = (await readBasisLedger(root)).events.length;
    const invalid = await verifyBasisForStage({
      projectRoot: root,
      workflowId,
      stage: "A14" as WorkflowStage,
      now: NOW,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, "stage-transition-invalid");
    assert.equal((await readBasisLedger(root)).events.length, before);
  } finally {
    await cleanup(root);
  }
});

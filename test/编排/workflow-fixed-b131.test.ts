// test/编排/workflow-fixed-b131.test.ts
// T3「两条固定工作流路径」B13.1（2026-11-11，编排侧）：RR8 失败修复的确定性回归。
//
// RR8 失败事实（候选 3ecaf50）：
//  · 幕僚在 workflow 仍为 `A2(requested)` 时呈 A3 intent-confirm 卡；客户 confirm 后
//    `stage.completed A3` 被 `stage-transition-invalid` 拒绝（卡已结算、阶段无法完成）——
//    根因：`prepareIntent` 在 A2 未完成时**静默返回证据**（写不了 stage.requested A3 也不报错）。
//  · 原 A2 产品任务按 rework 关闭后，补交/返工任务的 accepted 收口永远无法满足“所有兄弟任务
//    accepted”，A2 永久停在 requested（返工循环 → 运营派发超预算）。
// 本文件覆盖：
//  1. prepareIntent 在 A2(requested)/blocked 时 fail-closed 且不写 stage.requested A3；
//  2. A2 completed 时补记 stage.requested A3；A3 在办时不重复写；
//  3. 无活动 workflow ⇒ workflow-not-found（不发卡）；
//  4. A2 blocked 恢复（request→completed）后旧 `view.blocked` 残留不得误拦 A3；
//  5. A2 open 兄弟阻塞完成；原任务 rework 后补交任务 accepted ⇒ A2 完成（RR8 死锁回归）；
//  6. A11 保留“全部实现任务 accepted”语义；rework 旧 attempt 不阻塞替换任务完成；
//  7. 阶段完成后迟到兄弟任务 rework 不再追加 stage.blocked（不把投影打成 workflow-corrupt）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendWorkflowEvent,
  closeTask,
  prepareIntent,
  readWorkflowLedger,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import type { WorkflowEvent, WorkflowStage } from "../../src/model/runtime.ts";

const FLOW = "snake";
const D = "a".repeat(64);
const NOW = () => new Date("2026-11-11T10:00:00.000Z");
const INTENT_TEXT = [
  "---",
  "schema: project-intent/v1",
  "flowId: snake",
  "version: 1",
  "intentId: snake-intent",
  "goal: 贪吃蛇",
  "---",
  "# Intent",
  "",
].join("\n");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-fixed-b131-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
async function appendEvents(root: string, workflowId: string, events: WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}

const BASE = { v: 1 as const, at: "2026-11-11T10:00:00.000Z", schema: "ans-workflow/v1" as const, path: "A" as const };
function seedEvent(workflowId: string): WorkflowEvent[] {
  return [{
    ...BASE, kind: "workflow.started", workflowId, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }];
}
function requested(workflowId: string, stage: WorkflowStage, attempt = 1): WorkflowEvent {
  return {
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: D, attempt,
  };
}
function completed(workflowId: string, stage: WorkflowStage, ref = `seed-${stage}`): WorkflowEvent {
  return {
    ...BASE, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:${ref}`, stage,
    cause: { kind: "seed", ref }, artifacts: [],
  };
}
async function createFixedTask(
  root: string,
  workflowId: string,
  taskId: string,
  stage: WorkflowStage,
  to = "product",
): Promise<void> {
  const event = taskEvent("task.created", {
    taskId, from: "convener", to, text: `fixed ${stage} 任务`, sideEffect: "docs",
    idempotencyKey: `work:${workflowId}:${stage}:${to}:${taskId}`, flowId: FLOW, workflowId, stage,
  }, NOW);
  const appended = await appendTaskEvent(root, event);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}
async function reportDone(root: string, taskId: string, from: string, evidence?: string[]): Promise<void> {
  const report = taskEvent("task.reported", {
    taskId, from, status: "done", summary: "完成",
    ...(evidence !== undefined ? { evidence } : {}),
  }, NOW);
  const appended = await appendTaskEvent(root, report);
  assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
}
const ARTIFACTS = [{ path: "docs/product/snake-intent-v1.md", sha256: D, kind: "intent" as const }];

async function viewOf(root: string, workflowId: string) {
  const ledger = await readWorkflowLedger(root);
  return deriveWorkflowView(ledger.events.filter((event) => event.workflowId === workflowId), (await readTaskState(root)).events);
}

// ————————————————— ① prepareIntent：A2(requested) ⇒ fail-closed —————————————————

test("prepareIntent：A2(requested) 时 fail-closed（stage-transition-invalid），不写 stage.requested A3（RR8 卡提前呈现根因）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, [
      ...seedEvent(workflowId), requested(workflowId, "A1"), completed(workflowId, "A1"), requested(workflowId, "A2"),
    ]);
    await writeFile(root, "docs/product/snake-intent-v1.md", INTENT_TEXT);
    const prepared = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(prepared.ok, false, "A2 未完成时不得返回可发卡的意图证据");
    if (!prepared.ok) {
      assert.equal(prepared.code, "stage-transition-invalid");
      assert.match(prepared.message, /A2\(requested\)/u);
      assert.match(prepared.message, /要求 A2 completed/u);
    }
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.some((event) => event.kind === "stage.requested" && event.stage === "A3"), false, "不得写 stage.requested A3");
    assert.equal((await viewOf(root, workflowId)).stage, "A2");
  } finally {
    await cleanup(root);
  }
});

// ————————————————— ② A2 completed ⇒ 补记 A3；A3 在办不重复 —————————————————

test("prepareIntent：A2 completed 时补记 stage.requested A3；A3 在办（卡待结算/恢复）时返回证据但不重复写", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, [
      ...seedEvent(workflowId), requested(workflowId, "A1"), completed(workflowId, "A1"),
      requested(workflowId, "A2"), completed(workflowId, "A2"),
    ]);
    await writeFile(root, "docs/product/snake-intent-v1.md", INTENT_TEXT);
    const first = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(first.ok, true, first.ok === false ? first.code : "");
    let ledger = await readWorkflowLedger(root);
    const a3Requested = ledger.events.filter((event) => event.kind === "stage.requested" && event.stage === "A3");
    assert.equal(a3Requested.length, 1, "A2 completed ⇒ 恰好补记一次 stage.requested A3");
    assert.equal((await viewOf(root, workflowId)).stage, "A3");
    // 卡已 request（在办）：再 prepare 仍返回证据（B12.1 幂等判定用），但不得重复写事件。
    const second = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(second.ok, true);
    ledger = await readWorkflowLedger(root);
    assert.equal(
      ledger.events.filter((event) => event.kind === "stage.requested" && event.stage === "A3").length,
      1,
      "A3 在办时不得重复写 stage.requested",
    );
  } finally {
    await cleanup(root);
  }
});

// ————————————————— ③ 无活动 workflow —————————————————

test("prepareIntent：无活动 fixed workflow ⇒ workflow-not-found（不发卡）", async () => {
  const root = await tempRoot();
  try {
    await writeFile(root, "docs/product/snake-intent-v1.md", INTENT_TEXT);
    const prepared = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(prepared.ok, false);
    if (!prepared.ok) assert.equal(prepared.code, "workflow-not-found");
  } finally {
    await cleanup(root);
  }
});

// ————————————————— ④ blocked 恢复后旧 view.blocked 残留不误拦 —————————————————

test("prepareIntent：A2 blocked 时拒绝；request+completed 恢复后旧 view.blocked 残留不影响补记 A3", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, [
      ...seedEvent(workflowId), requested(workflowId, "A1"), completed(workflowId, "A1"), requested(workflowId, "A2"),
    ]);
    await writeFile(root, "docs/product/snake-intent-v1.md", INTENT_TEXT);
    const blocked: WorkflowEvent = {
      ...BASE, kind: "stage.blocked", workflowId, flowId: FLOW,
      idempotencyKey: `stage-block:${workflowId}:A2:1:task-report-blocked`, stage: "A2",
      code: "task-report-blocked", summary: "报告证据格式不合规", taskId: "t-a2", attempt: 1,
    };
    await appendEvents(root, workflowId, [blocked]);
    const refused = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(refused.ok, false, "A2 blocked 时不得发 A3 卡");
    if (!refused.ok) assert.equal(refused.code, "stage-transition-invalid");
    // 阶段恢复：新的 A2 stage-request（blocked → requested）→ 产品任务 accepted 收口记 completed。
    await appendEvents(root, workflowId, [
      requested(workflowId, "A2", 2),
      completed(workflowId, "A2", "recovery"),
    ]);
    // 投影的 view.blocked 字段不清除（历史 code 残留），但当前阶段 completed；不得误拦。
    const view = await viewOf(root, workflowId);
    assert.equal(view.stage, "A2");
    assert.equal(view.stages.A2.status, "completed");
    assert.notEqual(view.blocked, undefined, "投影保留历史 blocked 记录（只作审计，不再拦 A3）");
    const prepared = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(prepared.ok, true, prepared.ok === false ? prepared.message : "");
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) => event.kind === "stage.requested" && event.stage === "A3").length, 1);
  } finally {
    await cleanup(root);
  }
});

// ————————————————— ⑤ RR8 A2 死锁回归 —————————————————

test("closeTask：open 兄弟阻塞 A2 完成；原任务 rework 后，补交+返工任务 accepted ⇒ A2 完成（RR8 死锁回归）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, [
      ...seedEvent(workflowId), requested(workflowId, "A1"), completed(workflowId, "A1"), requested(workflowId, "A2"),
    ]);
    await createFixedTask(root, workflowId, "t-a2-orig", "A2");
    await createFixedTask(root, workflowId, "t-a2-supp", "A2");
    await reportDone(root, "t-a2-orig", "product", ["docs/product/snake-intent-v1.md"]);
    await reportDone(root, "t-a2-supp", "product", ["docs/product/snake-intent-v1.md"]);

    // 补交任务先 accepted：原任务仍 open ⇒ 不得完成 A2（RR8 00:35:12 实测）。
    const supp = await closeTask({
      projectRoot: root, operationId: "op-a2-supp", taskId: "t-a2-supp", outcome: "accepted",
      actorRoleId: "convener", evidence: { artifacts: ARTIFACTS }, now: NOW,
    });
    assert.equal(supp.ok, true, supp.ok === false ? supp.code : "");
    if (supp.ok) assert.equal(supp.stageCompleted, false, "open 兄弟任务阻塞阶段完成");

    // 原任务 rework 关闭：A2 进入 blocked（任务证据格式不合规，RR8 实测）。
    const origRework = await closeTask({
      projectRoot: root, operationId: "op-a2-orig-rework", taskId: "t-a2-orig", outcome: "rework",
      actorRoleId: "convener", note: "报告证据格式不合规", now: NOW,
    });
    assert.equal(origRework.ok, true, origRework.ok === false ? origRework.code : "");
    let ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.some((event) => event.kind === "stage.blocked" && event.stage === "A2"), true);

    // 幕僚重新发 A2 stage-request（attempt 2），运营派返工任务并 accepted：rework 旧 attempt 不再阻塞。
    await appendEvents(root, workflowId, [requested(workflowId, "A2", 2)]);
    await createFixedTask(root, workflowId, "t-a2-replace", "A2");
    await reportDone(root, "t-a2-replace", "product", ["docs/product/snake-intent-v1.md"]);
    const replace = await closeTask({
      projectRoot: root, operationId: "op-a2-replace", taskId: "t-a2-replace", outcome: "accepted",
      actorRoleId: "convener", evidence: { artifacts: ARTIFACTS }, now: NOW,
    });
    assert.equal(replace.ok, true, replace.ok === false ? replace.code : "");
    if (replace.ok) assert.equal(replace.stageCompleted, true, "旧 rework attempt 不得永久阻塞 A2 完成");

    ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.filter((event) => event.kind === "stage.completed" && event.stage === "A2").length, 1);
    const view = await viewOf(root, workflowId);
    assert.equal(view.stage, "A2");
    assert.equal(view.stages.A2.status, "completed");
    assert.notEqual(view.blocked?.code, "workflow-corrupt");
    // A2 完成后 apply A3 卡路径不再被旧 blocked 拦（RR8 死锁的下一跳）。
    await writeFile(root, "docs/product/snake-intent-v1.md", INTENT_TEXT);
    const prepared = await prepareIntent({ projectRoot: root, flowId: FLOW, now: NOW });
    assert.equal(prepared.ok, true, prepared.ok === false ? prepared.message : "");
  } finally {
    await cleanup(root);
  }
});

// ————————————————— ⑥ A11 全部实现任务 + rework 不阻塞替换 —————————————————

const THROUGH_A10: readonly WorkflowStage[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"];
async function seedThroughA10(root: string, workflowId: string): Promise<void> {
  const events: WorkflowEvent[] = seedEvent(workflowId);
  for (const stage of THROUGH_A10) events.push(requested(workflowId, stage), completed(workflowId, stage));
  events.push(requested(workflowId, "A11"));
  await appendEvents(root, workflowId, events);
}
const A11_EVIDENCE = { artifacts: ARTIFACTS, branchTipOid: "b".repeat(40) };

test("closeTask A11：两个实现任务须全部 accepted 才完成 A11", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedThroughA10(root, workflowId);
    await createFixedTask(root, workflowId, "t-a11-w1", "A11", "worker");
    await createFixedTask(root, workflowId, "t-a11-w2", "A11", "worker");
    await reportDone(root, "t-a11-w1", "worker");
    await reportDone(root, "t-a11-w2", "worker");
    const first = await closeTask({
      projectRoot: root, operationId: "op-a11-w1", taskId: "t-a11-w1", outcome: "accepted",
      actorRoleId: "convener", evidence: A11_EVIDENCE, now: NOW,
    });
    assert.equal(first.ok, true, first.ok === false ? first.code : "");
    if (first.ok) assert.equal(first.stageCompleted, false, "仍有 open 实现任务 ⇒ A11 不得完成");
    const second = await closeTask({
      projectRoot: root, operationId: "op-a11-w2", taskId: "t-a11-w2", outcome: "accepted",
      actorRoleId: "convener", evidence: A11_EVIDENCE, now: NOW,
    });
    assert.equal(second.ok, true, second.ok === false ? second.code : "");
    if (second.ok) assert.equal(second.stageCompleted, true, "全部实现任务 accepted ⇒ A11 完成");
  } finally {
    await cleanup(root);
  }
});

test("closeTask A11：旧 attempt rework 不阻塞替换任务 accepted 完成 A11", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await seedThroughA10(root, workflowId);
    await createFixedTask(root, workflowId, "t-a11-old", "A11", "worker");
    await createFixedTask(root, workflowId, "t-a11-other", "A11", "worker");
    await createFixedTask(root, workflowId, "t-a11-new", "A11", "worker");
    await reportDone(root, "t-a11-old", "worker");
    await reportDone(root, "t-a11-other", "worker");
    await reportDone(root, "t-a11-new", "worker");
    const reworked = await closeTask({
      projectRoot: root, operationId: "op-a11-old-rework", taskId: "t-a11-old", outcome: "rework",
      actorRoleId: "convener", note: "实现不通过", now: NOW,
    });
    assert.equal(reworked.ok, true, reworked.ok === false ? reworked.code : "");
    const other = await closeTask({
      projectRoot: root, operationId: "op-a11-other", taskId: "t-a11-other", outcome: "accepted",
      actorRoleId: "convener", evidence: A11_EVIDENCE, now: NOW,
    });
    assert.equal(other.ok, true, other.ok === false ? other.code : "");
    if (other.ok) assert.equal(other.stageCompleted, false, "替换任务仍 open ⇒ 不完成");
    const replacement = await closeTask({
      projectRoot: root, operationId: "op-a11-new", taskId: "t-a11-new", outcome: "accepted",
      actorRoleId: "convener", evidence: A11_EVIDENCE, now: NOW,
    });
    assert.equal(replacement.ok, true, replacement.ok === false ? replacement.code : "");
    if (replacement.ok) assert.equal(replacement.stageCompleted, true, "rework 旧 attempt 被替换任务取代，不阻塞 A11");
  } finally {
    await cleanup(root);
  }
});

// ————————————————— ⑦ 阶段完成后迟到收口不得写 stage.blocked —————————————————

test("closeTask：阶段完成后迟到的兄弟任务 rework 不追加 stage.blocked（投影不 corrupt）", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    await appendEvents(root, workflowId, [
      ...seedEvent(workflowId), requested(workflowId, "A1"), completed(workflowId, "A1"), requested(workflowId, "A2"),
    ]);
    await createFixedTask(root, workflowId, "t-a2-done", "A2");
    await reportDone(root, "t-a2-done", "product", ["docs/product/snake-intent-v1.md"]);
    const done = await closeTask({
      projectRoot: root, operationId: "op-a2-done", taskId: "t-a2-done", outcome: "accepted",
      actorRoleId: "convener", evidence: { artifacts: ARTIFACTS }, now: NOW,
    });
    assert.equal(done.ok, true, done.ok === false ? done.code : "");
    if (done.ok) assert.equal(done.stageCompleted, true);
    // 模拟迟到的旧兄弟任务记录（服务层直接追加；真实派发门会拒绝，但账本可能已有历史任务）。
    await createFixedTask(root, workflowId, "t-a2-stale", "A2");
    await reportDone(root, "t-a2-stale", "product");
    const stale = await closeTask({
      projectRoot: root, operationId: "op-a2-stale-rework", taskId: "t-a2-stale", outcome: "rework",
      actorRoleId: "convener", note: "迟到旧任务", now: NOW,
    });
    assert.equal(stale.ok, true, stale.ok === false ? stale.code : "");
    const ledger = await readWorkflowLedger(root);
    assert.equal(ledger.events.some((event) => event.kind === "stage.blocked"), false, "阶段完成后不得写 stage.blocked");
    const view = await viewOf(root, workflowId);
    assert.notEqual(view.blocked?.code, "workflow-corrupt");
    assert.equal(view.stages.A2.status, "completed");
  } finally {
    await cleanup(root);
  }
});

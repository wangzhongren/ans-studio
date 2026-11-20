// test/编排/block-ledger.test.ts
// 2026-11-20（block resolver 测试批 R4b，测试角色）：**block 生命周期账本**（T-5/T-11）。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §五（生命周期/事件形状/幂等/
// 防重复卡/无 stopped 终态）、§一.2（协调方裁定）、§8.1 T-5/T-11、§8.2 AC-1/AC-9；
// R1 记录 `角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`（账本 API/§八 R1 收尾修补）。
//
// 覆盖：
//   1. schema `block/v1` 写入/读取（`.ans/state/blocks.jsonl`）；事件形状精确；
//   2. raised→routed→resolved(fixed/decided) 生命周期；decided provenance（仅 judge/customer + decisionId）；
//   3. escalated 非终态（必须先 routed 再 resolved）；升级后可重路由；
//   4. replay 幂等（同幂等键 first-wins）；同 blockId 不重复 raised；
//   5. 坏行/`resolution=stopped`/非法 provenance fail-closed；
//   6. routed 的 taskId/cardRequestId/routings 投影（R1 收尾修补）；
//   7. open blocks 摘要（status/owner/waitingOn/ageMs/过滤/limit）。
//
// 临时目录；无端口/`.env`/真实模型。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  BLOCK_LEDGER_SCHEMA,
  BLOCKS_STATE_REL,
  blocksStatePath,
  escalateBlock,
  isBlockLedgerEvent,
  listOpenBlocks,
  raiseBlock,
  readBlockLedger,
  readOpenBlockProjection,
  replayBlockLifecycles,
  resolveBlock,
  routeBlock,
  summarizeOpenBlocks,
  type BlockLedgerEvent,
  type BlockRaisedEvent,
} from "../../src/common/编排/block-ledger.ts";
import {
  blockCardRequestId,
  computeBlockFingerprint,
  computeBlockId,
  blockIdempotencyKey,
  type BlockFact,
} from "../../src/common/编排/block-resolution.ts";

const T0 = "2026-11-20T00:00:00.000Z";
function at(iso: string): () => Date {
  return () => new Date(iso);
}
async function makeRoot(prefix = "ans-block-ledger-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, ".ans", "state"), { recursive: true });
  return root;
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function factOf(overrides: Partial<BlockFact> = {}): BlockFact {
  // 直接构造事实（不依赖适配器）：账本测试只关心生命周期，证据引用走 `evidencePaths/evidenceHashes`。
  return {
    protocol: "fixed-v2.1",
    kind: "service-rejection",
    code: "missing-contract",
    detailCode: "missing-file",
    source: "desktop.dispatch.rejection",
    workflowId: "wf-ledger",
    flowId: "flow-ledger",
    stage: "A8",
    evidencePaths: ["docs/contracts/x.md"],
    evidenceHashes: ["a".repeat(64)],
    fingerprintMaterial: ["ledger-fact-1"],
    summary: "缺契约：docs/contracts/x.md",
    ...overrides,
  };
}

async function eventsOf(root: string): Promise<readonly BlockLedgerEvent[]> {
  return (await readBlockLedger(root)).events;
}

function validRaisedEvent(overrides: Partial<BlockRaisedEvent> = {}): BlockRaisedEvent {
  return {
    v: 1,
    at: T0,
    schema: BLOCK_LEDGER_SCHEMA,
    kind: "block.raised",
    blockId: "a".repeat(24),
    idempotencyKey: blockIdempotencyKey("a".repeat(24), "block.raised", 1),
    class: "model-anomaly",
    classCode: "B8",
    fingerprint: "f".repeat(64),
    summary: "示例 block",
    evidenceRefs: [],
    protocol: "fixed-v2.1",
    ...overrides,
  };
}

// —————————————— 1) schema block/v1 写入/读取 ——————————————

test("schema block/v1：raiseBlock 写 `.ans/state/blocks.jsonl`，事件字段/幂等键/证据引用精确", async () => {
  const root = await makeRoot();
  try {
    assert.equal(BLOCK_LEDGER_SCHEMA, "block/v1");
    assert.equal(BLOCKS_STATE_REL, ".ans/state/blocks.jsonl");
    const fact = factOf();
    const receipt = await raiseBlock({ projectRoot: root, fact, now: at(T0) });
    assert.equal(receipt.ok, true);
    if (!receipt.ok) return;
    const blockId = computeBlockId(fact);
    assert.equal(receipt.blockId, blockId);
    assert.equal(receipt.class, "missing-resource");
    assert.equal(receipt.classCode, "B1");
    assert.equal(receipt.fingerprint, computeBlockFingerprint(fact));
    assert.equal(receipt.priorOccurrences, 0);
    assert.equal(receipt.repeatedFingerprint, false);
    assert.equal(receipt.replay, false);
    assert.deepEqual(receipt.event, {
      v: 1,
      at: T0,
      schema: "block/v1",
      kind: "block.raised",
      blockId,
      idempotencyKey: `block:${blockId}:block.raised:1`,
      class: "missing-resource",
      classCode: "B1",
      code: "missing-contract",
      detailCode: "missing-file",
      source: "desktop.dispatch.rejection",
      workflowId: "wf-ledger",
      flowId: "flow-ledger",
      stage: "A8",
      fingerprint: computeBlockFingerprint(fact),
      summary: "缺契约：docs/contracts/x.md",
      evidenceRefs: [`docs/contracts/x.md#sha256=${"a".repeat(64)}`],
      protocol: "fixed-v2.1",
      priorOccurrences: 0,
    });
    const file = blocksStatePath(root);
    assert.equal(file, path.join(root, ".ans", "state", "blocks.jsonl"));
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    assert.equal(lines.length, 1, "账本仅一行（append-only）");
    assert.deepEqual(JSON.parse(lines[0]!), receipt.event);
    const read = await readBlockLedger(root);
    assert.equal(read.badLines, 0);
    assert.deepEqual(read.events, [receipt.event]);
    assert.equal(isBlockLedgerEvent(receipt.event), true);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2) 生命周期 raised→routed→resolved ——————————————

test("生命周期：raised→routed(owner-repair)→resolved(fixed)；路由投影 owner/waitingOn/attempt 正确", async () => {
  const root = await makeRoot();
  try {
    const fact = factOf();
    const raised = await raiseBlock({ projectRoot: root, fact, now: at(T0) });
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    const blockId = raised.blockId;
    const routed = await routeBlock({
      projectRoot: root,
      blockId,
      route: "owner-repair",
      reason: "missing-resource:owner-repair",
      targetRoleId: "rapporteur",
      taskId: "repair-task-1",
      now: at("2026-11-20T00:01:00.000Z"),
    });
    assert.equal(routed.ok, true);
    if (!routed.ok) return;
    assert.equal(routed.replay, false);
    assert.deepEqual(routed.event, {
      v: 1,
      at: "2026-11-20T00:01:00.000Z",
      schema: "block/v1",
      kind: "block.routed",
      blockId,
      idempotencyKey: `block:${blockId}:block.routed:1`,
      route: "owner-repair",
      targetRoleId: "rapporteur",
      taskId: "repair-task-1",
      attempt: 1,
      reason: "missing-resource:owner-repair",
    });
    let lifecycle = (await readBlockLedger(root)).events;
    let record = replayBlockLifecycles(lifecycle).records.get(blockId)!;
    assert.equal(record.status, "routed");
    assert.equal(record.routeKind, "owner-repair");
    assert.equal(record.owner, "rapporteur");
    assert.equal(record.waitingOn, "role");
    assert.equal(record.routeCount, 1);
    assert.equal(record.attempt, 1);
    assert.equal(record.routeTaskId, "repair-task-1");
    assert.equal(record.routeReason, "missing-resource:owner-repair");
    assert.deepEqual(record.routings, [{
      route: "owner-repair",
      reason: "missing-resource:owner-repair",
      attempt: 1,
      at: "2026-11-20T00:01:00.000Z",
      idempotencyKey: `block:${blockId}:block.routed:1`,
      targetRoleId: "rapporteur",
      taskId: "repair-task-1",
    }]);

    const resolved = await resolveBlock({
      projectRoot: root,
      blockId,
      resolution: "fixed",
      by: "rapporteur",
      reEntry: "repair-task:repair-task-1",
      note: "应用核验通过（1 项证据；字节 sha256 重算）",
      now: at("2026-11-20T00:02:00.000Z"),
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.event.kind, "block.resolved");
    assert.equal(resolved.event.resolution, "fixed");
    assert.equal(resolved.event.by, "rapporteur");
    record = replayBlockLifecycles((await eventsOf(root))).records.get(blockId)!;
    assert.equal(record.status, "resolved");
    assert.equal(record.resolution, "fixed");
    assert.equal(record.resolvedBy, "rapporteur");
    assert.equal(record.reEntry, "repair-task:repair-task-1");
    // 终态后不得再路由/升级/结算。
    const again = await routeBlock({ projectRoot: root, blockId, route: "owner-repair", reason: "x", now: at(T0) });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.code, "block-already-resolved");
    const resolveAgain = await resolveBlock({ projectRoot: root, blockId, resolution: "fixed", by: "engine", note: "x", now: at(T0) });
    assert.equal(resolveAgain.ok, false);
    if (!resolveAgain.ok) assert.equal(resolveAgain.code, "block-already-resolved");
  } finally {
    await cleanup(root);
  }
});

test("decided provenance：仅 judge/customer 可裁决且必须带 decisionId；fixed 可由属主/引擎结算", async () => {
  const root = await makeRoot();
  try {
    let seq = 0;
    async function seededBlock(prefix: string): Promise<string> {
      seq += 1;
      const fact = factOf({ fingerprintMaterial: [`${prefix}-${seq}`] });
      const raised = await raiseBlock({ projectRoot: root, fact, now: at(T0) });
      assert.equal(raised.ok, true);
      if (!raised.ok) throw new Error("raise failed");
      const routed = await routeBlock({
        projectRoot: root, blockId: raised.blockId, route: "customer-decision", reason: "waiting",
        cardRequestId: blockCardRequestId(raised.blockId), now: at(T0),
      });
      assert.equal(routed.ok, true);
      return raised.blockId;
    }

    const byEngine = await seededBlock("engine");
    const engineDecision = await resolveBlock({ projectRoot: root, blockId: byEngine, resolution: "decided", by: "engine", decisionId: "d-1", note: "x", now: at(T0) });
    assert.equal(engineDecision.ok, false);
    if (!engineDecision.ok) {
      assert.equal(engineDecision.code, "block-resolution-invalid");
      assert.match(engineDecision.message, /decided 只能由 judge\/customer/);
    }
    const missingDecision = await resolveBlock({ projectRoot: root, blockId: byEngine, resolution: "decided", by: "customer", note: "x", now: at(T0) });
    assert.equal(missingDecision.ok, false);
    if (!missingDecision.ok) assert.match(missingDecision.message, /必须携带 decisionId/);
    const judgeNoDecision = await resolveBlock({ projectRoot: root, blockId: byEngine, resolution: "decided", by: "judge", note: "x", now: at(T0) });
    assert.equal(judgeNoDecision.ok, false);
    if (!judgeNoDecision.ok) assert.match(judgeNoDecision.message, /必须携带 decisionId/);
    const customerOk = await resolveBlock({ projectRoot: root, blockId: byEngine, resolution: "decided", by: "customer", decisionId: "decision-req-1", note: "客户裁决", now: at(T0) });
    assert.equal(customerOk.ok, true);

    const byJudge = await seededBlock("judge");
    const judgeOk = await resolveBlock({ projectRoot: root, blockId: byJudge, resolution: "decided", by: "judge", decisionId: "decision-req-2", note: "judge 裁决", now: at(T0) });
    assert.equal(judgeOk.ok, true);
    if (judgeOk.ok) {
      assert.equal(judgeOk.event.by, "judge");
      assert.equal(judgeOk.event.decisionId, "decision-req-2");
    }
    const fixedByRole = await seededBlock("fixed-role");
    const roleFixed = await resolveBlock({ projectRoot: root, blockId: fixedByRole, resolution: "fixed", by: "product", note: "属主修复", now: at(T0) });
    assert.equal(roleFixed.ok, true, "fixed 可由属主结算（不构成裁决）");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 3) escalated 非终态 ——————————————

test("escalated 不是终态：升级后必须先 routed 再 resolved；升级后可重路由；非法 to/reason 拒绝", async () => {
  const root = await makeRoot();
  try {
    const raised = await raiseBlock({ projectRoot: root, fact: factOf(), now: at(T0) });
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    const blockId = raised.blockId;
    const escalated = await escalateBlock({
      projectRoot: root, blockId, from: "raised", to: "executor-replace", reason: "repeat",
      note: "同指纹重复", now: at("2026-11-20T00:01:00.000Z"),
    });
    assert.equal(escalated.ok, true);
    if (!escalated.ok) return;
    assert.deepEqual(escalated.event, {
      v: 1,
      at: "2026-11-20T00:01:00.000Z",
      schema: "block/v1",
      kind: "block.escalated",
      blockId,
      idempotencyKey: `block:${blockId}:block.escalated:1`,
      from: "raised",
      to: "executor-replace",
      reason: "repeat",
      attempt: 1,
      note: "同指纹重复",
    });
    let record = replayBlockLifecycles(await eventsOf(root)).records.get(blockId)!;
    assert.equal(record.status, "escalated");
    assert.equal(record.escalationCount, 1);
    assert.equal(record.waitingOn, "role");
    // escalated 后直接 resolved ⇒ 拒绝（升级不是终态）。
    const premature = await resolveBlock({ projectRoot: root, blockId, resolution: "fixed", by: "engine", note: "x", now: at(T0) });
    assert.equal(premature.ok, false);
    if (!premature.ok) assert.equal(premature.code, "block-escalated-unrouted");
    // 重路由后可以结算。
    const rerouted = await routeBlock({ projectRoot: root, blockId, route: "owner-repair", reason: "escalated:owner", targetRoleId: "convener", now: at("2026-11-20T00:02:00.000Z") });
    assert.equal(rerouted.ok, true);
    record = replayBlockLifecycles(await eventsOf(root)).records.get(blockId)!;
    assert.equal(record.status, "routed");
    assert.equal(record.routeCount, 1);
    const resolved = await resolveBlock({ projectRoot: root, blockId, resolution: "fixed", by: "convener", note: "修复", now: at(T0) });
    assert.equal(resolved.ok, true);
    // resolved 后不得升级。
    const lateEscalate = await escalateBlock({ projectRoot: root, blockId, from: "resolved", to: "customer-decision", reason: "unclassified", now: at(T0) });
    assert.equal(lateEscalate.ok, false);
    if (!lateEscalate.ok) assert.equal(lateEscalate.code, "block-already-resolved");

    // 非法 to/reason/from。
    const raised2 = await raiseBlock({ projectRoot: root, fact: factOf({ fingerprintMaterial: ["second"] }), now: at(T0) });
    assert.equal(raised2.ok, true);
    if (!raised2.ok) return;
    const badTo = await escalateBlock({ projectRoot: root, blockId: raised2.blockId, from: "raised", to: "stop" as never, reason: "repeat", now: at(T0) });
    assert.equal(badTo.ok, false);
    if (!badTo.ok) assert.equal(badTo.code, "block-escalate-invalid");
    const badReason = await escalateBlock({ projectRoot: root, blockId: raised2.blockId, from: "raised", to: "owner-reassign", reason: "stopped" as never, now: at(T0) });
    assert.equal(badReason.ok, false);
    if (!badReason.ok) assert.equal(badReason.code, "block-escalate-invalid");
    const emptyFrom = await escalateBlock({ projectRoot: root, blockId: raised2.blockId, from: "  ", to: "owner-reassign", reason: "repeat", now: at(T0) });
    assert.equal(emptyFrom.ok, false);
    if (!emptyFrom.ok) assert.equal(emptyFrom.code, "block-escalate-invalid");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 4) replay 幂等 / 同 blockId 不重复 raised ——————————————

test("replay 幂等：同 blockId 再 raise 返回原事件（不重复计数、不改类）；同幂等键 append first-wins", async () => {
  const root = await makeRoot();
  try {
    const fact = factOf();
    const first = await raiseBlock({ projectRoot: root, fact, now: at(T0) });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = await raiseBlock({ projectRoot: root, fact, now: at("2026-11-20T01:00:00.000Z") });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.replay, true);
    assert.equal(second.blockId, first.blockId);
    assert.equal(second.class, "missing-resource", "replay 不因同指纹计数变成 B7");
    assert.equal(second.repeatedFingerprint, false);
    assert.deepEqual(second.event, first.event, "replay 返回原事件（at 等字段不变）");
    assert.equal((await eventsOf(root)).filter((event) => event.kind === "block.raised").length, 1, "同 blockId 只 raised 一次");

    // 同幂等键 append（手工事件）first-wins。
    const manual = validRaisedEvent({ blockId: "b".repeat(24), idempotencyKey: blockIdempotencyKey("b".repeat(24), "block.raised", 1) });
    const { appendBlockEvent } = await import("../../src/common/编排/block-ledger.ts");
    const appended = await appendBlockEvent(root, manual);
    assert.equal(appended.ok, true);
    if (!appended.ok) return;
    assert.equal(appended.replay, false);
    const conflicting = { ...manual, summary: "另一条同键事件" };
    const replay = await appendBlockEvent(root, conflicting);
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.replay, true);
    assert.equal(replay.event.kind === "block.raised" ? replay.event.summary : undefined, "示例 block");
    assert.equal((await eventsOf(root)).filter((event) => event.blockId === "b".repeat(24)).length, 1);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 5) 坏行 / stopped / 非法 provenance fail-closed ——————————————

test("坏行 fail-closed：读取如实计数；写入拒绝 block-ledger-corrupt（不追加、不猜）", async () => {
  const root = await makeRoot();
  try {
    const file = blocksStatePath(root);
    await fs.writeFile(file, "not-json\n", "utf8");
    const read = await readBlockLedger(root);
    assert.equal(read.badLines, 1);
    assert.ok(read.errors.length >= 1);
    const fact = factOf();
    for (const action of [
      () => raiseBlock({ projectRoot: root, fact, now: at(T0) }),
      () => routeBlock({ projectRoot: root, blockId: "a".repeat(24), route: "owner-repair", reason: "x", now: at(T0) }),
      () => escalateBlock({ projectRoot: root, blockId: "a".repeat(24), from: "raised", to: "owner-reassign", reason: "repeat", now: at(T0) }),
      () => resolveBlock({ projectRoot: root, blockId: "a".repeat(24), resolution: "fixed", by: "engine", note: "x", now: at(T0) }),
    ]) {
      const result = await action();
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "block-ledger-corrupt", result.message);
    }
    assert.equal(await fs.readFile(file, "utf8"), "not-json\n", "坏行账本零追加");
    const projection = await readOpenBlockProjection(root, { now: new Date(T0) });
    assert.equal(projection.badLines, 1);
    assert.equal(projection.summaries.length, 0);
  } finally {
    await cleanup(root);
  }
});

test("isBlockLedgerEvent：resolution=stopped、缺 decisionId、route=escalated、非法枚举/形状一律拒绝", async () => {
  const base = validRaisedEvent();
  assert.equal(isBlockLedgerEvent(base), true);
  const rejected: unknown[] = [
    null,
    [],
    { ...base, schema: "block/v2" },
    { ...base, v: 2 },
    { ...base, kind: "block.stopped" },
    { ...base, blockId: "short" },
    { ...base, blockId: "Z".repeat(24) },
    { ...base, class: "stopped" },
    { ...base, class: "model-anomaly", classCode: "B1" },
    { ...base, protocol: "fixed-v2.2" },
    { ...base, fingerprint: "f".repeat(63) },
    { ...base, summary: "  " },
    { ...base, evidenceRefs: "x" },
    { ...base, at: "" },
    { ...base, idempotencyKey: "" },
    { ...base, stage: "A99" },
  ];
  for (const candidate of rejected) assert.equal(isBlockLedgerEvent(candidate), false, `应拒绝：${JSON.stringify(candidate)}`);

  const routed = {
    v: 1, at: T0, schema: BLOCK_LEDGER_SCHEMA, kind: "block.routed", blockId: base.blockId,
    idempotencyKey: `${base.blockId}:routed`, route: "owner-repair", attempt: 1, reason: "r",
  };
  assert.equal(isBlockLedgerEvent(routed), true);
  assert.equal(isBlockLedgerEvent({ ...routed, route: "escalated" }), false, "升级走 block.escalated");
  assert.equal(isBlockLedgerEvent({ ...routed, attempt: 0 }), false);
  assert.equal(isBlockLedgerEvent({ ...routed, reason: " " }), false);

  const resolved = {
    v: 1, at: T0, schema: BLOCK_LEDGER_SCHEMA, kind: "block.resolved", blockId: base.blockId,
    idempotencyKey: `${base.blockId}:resolved`, resolution: "decided", by: "customer", decisionId: "d-1", note: "n",
  };
  assert.equal(isBlockLedgerEvent(resolved), true);
  assert.equal(isBlockLedgerEvent({ ...resolved, resolution: "stopped" }), false, "stopped 不是终态");
  assert.equal(isBlockLedgerEvent({ ...resolved, resolution: "failed" }), false);
  assert.equal(isBlockLedgerEvent({ ...resolved, decisionId: undefined }), false, "decided 必须带 decisionId");
  assert.equal(isBlockLedgerEvent({ ...resolved, by: "" }), false);
  assert.equal(isBlockLedgerEvent({ ...resolved, note: "" }), false);

  const escalated = {
    v: 1, at: T0, schema: BLOCK_LEDGER_SCHEMA, kind: "block.escalated", blockId: base.blockId,
    idempotencyKey: `${base.blockId}:escalated`, from: "raised", to: "customer-decision", reason: "repeat", attempt: 1,
  };
  assert.equal(isBlockLedgerEvent(escalated), true);
  assert.equal(isBlockLedgerEvent({ ...escalated, to: "stop" }), false);
  assert.equal(isBlockLedgerEvent({ ...escalated, reason: "stopped" }), false);
  assert.equal(isBlockLedgerEvent({ ...escalated, attempt: 0 }), false);

  // appendBlockEvent：非法事件拒绝写入。
  const root = await makeRoot();
  try {
    const { appendBlockEvent } = await import("../../src/common/编排/block-ledger.ts");
    const result = await appendBlockEvent(root, { ...resolved, resolution: "stopped" } as unknown as BlockLedgerEvent);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid-event");
    assert.equal((await readBlockLedger(root)).events.length, 0);
  } finally {
    await cleanup(root);
  }
});

test("replayBlockLifecycles：非法顺序如实记 errors（不伪造状态）；decided 非 judge/customer 记错", async () => {
  const blockId = "c".repeat(24);
  const raised = validRaisedEvent({ blockId, idempotencyKey: blockIdempotencyKey(blockId, "block.raised", 1) });
  const routed = {
    v: 1, at: T0, schema: BLOCK_LEDGER_SCHEMA, kind: "block.routed", blockId,
    idempotencyKey: blockIdempotencyKey(blockId, "block.routed", 1), route: "customer-decision", attempt: 1, reason: "wait",
  } satisfies BlockLedgerEvent;
  const resolvedBadBy = {
    v: 1, at: T0, schema: BLOCK_LEDGER_SCHEMA, kind: "block.resolved", blockId,
    idempotencyKey: blockIdempotencyKey(blockId, "block.resolved", 1), resolution: "decided", by: "convener", decisionId: "d", note: "x",
  } satisfies BlockLedgerEvent;
  const replay = replayBlockLifecycles([raised, routed, resolvedBadBy]);
  assert.equal(replay.records.get(blockId)?.status, "routed", "非法 decided 不改变状态");
  assert.ok(replay.errors.some((message) => message.includes("decided 只能由 judge/customer")), replay.errors.join("；"));

  // 无 raised 的 routed。
  const orphan = replayBlockLifecycles([routed]);
  assert.equal(orphan.records.size, 0);
  assert.ok(orphan.errors.some((message) => message.includes("发生在 block.raised 之前")));
  // raised→resolved（缺 routed）。
  const skipped = replayBlockLifecycles([raised, {
    ...resolvedBadBy, by: "customer", resolution: "decided",
  }]);
  assert.ok(skipped.errors.some((message) => message.includes("resolved 前缺少 routed")));
  // 重复 raised。
  const duplicated = replayBlockLifecycles([raised, { ...raised, idempotencyKey: `${blockId}:raised:2` }]);
  assert.ok(duplicated.errors.some((message) => message.includes("重复 block.raised")));
  assert.equal(duplicated.order.length, 1);
  // 非法事件形状。
  const invalid = replayBlockLifecycles([raised, { kind: "block.stopped", blockId } as unknown as BlockLedgerEvent]);
  assert.ok(invalid.errors.some((message) => message.includes("非法事件（形状）")));
  // escalated→resolved（缺再次 routed）。
  const escalated = {
    v: 1, at: T0, schema: BLOCK_LEDGER_SCHEMA, kind: "block.escalated", blockId,
    idempotencyKey: blockIdempotencyKey(blockId, "block.escalated", 1), from: "routed", to: "customer-decision", reason: "repeat", attempt: 1,
  } satisfies BlockLedgerEvent;
  const afterEscalation = replayBlockLifecycles([raised, routed, escalated, {
    ...resolvedBadBy, by: "customer",
  }]);
  assert.ok(afterEscalation.errors.some((message) => message.includes("escalated 后必须先 routed 再 resolved")));
});

// —————————————— 6) routed 投影 / 重复阈值 ——————————————

test("routed 投影（R1）：每次路由保留 taskId/cardRequestId；最新链接不沿用旧值", async () => {
  const root = await makeRoot();
  try {
    const raised = await raiseBlock({ projectRoot: root, fact: factOf(), now: at(T0) });
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    const blockId = raised.blockId;
    await routeBlock({
      projectRoot: root, blockId, route: "owner-repair", reason: "owner-first",
      targetRoleId: "rapporteur", taskId: "repair-1", now: at("2026-11-20T00:01:00.000Z"),
    });
    await escalateBlock({ projectRoot: root, blockId, from: "routed", to: "customer-decision", reason: "repair-timeout", attempt: 1, now: at("2026-11-20T00:10:00.000Z") });
    await routeBlock({
      projectRoot: root, blockId, route: "customer-decision", reason: "customer-wait",
      cardRequestId: blockCardRequestId(blockId), now: at("2026-11-20T00:10:01.000Z"),
    });
    const record = replayBlockLifecycles(await eventsOf(root)).records.get(blockId)!;
    assert.equal(record.routings.length, 2);
    assert.equal(record.routings[0]!.route, "owner-repair");
    assert.equal(record.routings[0]!.taskId, "repair-1");
    assert.equal(record.routings[0]!.targetRoleId, "rapporteur");
    assert.equal(record.routings[0]!.attempt, 1);
    assert.equal(record.routings[1]!.route, "customer-decision");
    assert.equal(record.routings[1]!.cardRequestId, blockCardRequestId(blockId));
    assert.equal(record.routings[1]!.taskId, undefined, "本次未携 taskId 不沿用旧值");
    assert.equal(record.routeTaskId, undefined, "最新 routeTaskId 不沿用旧值");
    assert.equal(record.routeReason, "customer-wait");
    assert.equal(record.routeAttempt, 2);
    assert.equal(record.cardRequestId, blockCardRequestId(blockId));
    assert.equal(record.owner, "customer");
    assert.equal(record.waitingOn, "customer");
    assert.equal(record.status, "routed");
    // 摘要同样透出。
    const summary = summarizeOpenBlocks(await eventsOf(root), { nowMs: Date.parse("2026-11-20T00:20:00.000Z") })[0]!;
    assert.equal(summary.routeKind, "customer-decision");
    assert.equal(summary.routeTaskId, undefined);
    assert.equal(summary.cardRequestId, blockCardRequestId(blockId));
    assert.equal(summary.routeCount, 2);
    assert.equal(summary.routings.length, 2);
    assert.equal(summary.ageMs, 20 * 60 * 1000);
  } finally {
    await cleanup(root);
  }
});

test("重复阈值（T-5 语义）：同指纹第 2 块 ⇒ B7，raised 状态只允许 escalated；升级后再路由/结算", async () => {
  const root = await makeRoot();
  try {
    const base = { fingerprintMaterial: ["same-fingerprint"] };
    const first = await raiseBlock({ projectRoot: root, fact: factOf({ ...base, taskId: "t-1" }), now: at(T0) });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.class, "missing-resource");
    const second = await raiseBlock({ projectRoot: root, fact: factOf({ ...base, taskId: "t-2" }), now: at(T0) });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.notEqual(second.blockId, first.blockId, "不同 taskId ⇒ 不同 blockId");
    assert.equal(second.priorOccurrences, 1);
    assert.equal(second.repeatedFingerprint, true);
    assert.equal(second.class, "repeat-rejection");
    assert.equal(second.classCode, "B7");
    // raised 状态下同指纹达到阈值 ⇒ routeBlock 拒绝，必须先 escalateBlock。
    const blockedRoute = await routeBlock({ projectRoot: root, blockId: second.blockId, route: "owner-repair", reason: "x", now: at(T0) });
    assert.equal(blockedRoute.ok, false);
    if (!blockedRoute.ok) assert.equal(blockedRoute.code, "block-repeat-escalation-required");
    const escalated = await escalateBlock({
      projectRoot: root, blockId: second.blockId, from: "raised", to: "executor-replace", reason: "repeat",
      note: "同指纹 2 次", now: at(T0),
    });
    assert.equal(escalated.ok, true);
    const rerouted = await routeBlock({ projectRoot: root, blockId: second.blockId, route: "owner-repair", reason: "escalated", targetRoleId: "convener", now: at(T0) });
    assert.equal(rerouted.ok, true, "升级后可路由（escalated 非终态）");
    const resolved = await resolveBlock({ projectRoot: root, blockId: second.blockId, resolution: "fixed", by: "convener", note: "修复", now: at(T0) });
    assert.equal(resolved.ok, true);
    // 阈值可配置：threshold=3 时第 2 块不升级（默认策略下第 3 块才重复）。
    const root2 = await makeRoot("ans-block-ledger-threshold-");
    try {
      const a = await raiseBlock({ projectRoot: root2, fact: factOf({ ...base, taskId: "a" }), policy: { repeatThreshold: 3 }, now: at(T0) });
      const b = await raiseBlock({ projectRoot: root2, fact: factOf({ ...base, taskId: "b" }), policy: { repeatThreshold: 3 }, now: at(T0) });
      assert.equal(a.ok, true);
      if (a.ok) assert.equal(a.repeatedFingerprint, false, "第 1 块不重复");
      assert.equal(b.ok, true);
      if (b.ok) assert.equal(b.repeatedFingerprint, false, "第 2 块未达阈值 3");
      const c = await raiseBlock({ projectRoot: root2, fact: factOf({ ...base, taskId: "c" }), policy: { repeatThreshold: 3 }, now: at(T0) });
      assert.equal(c.ok, true);
      if (c.ok) assert.equal(c.repeatedFingerprint, true, "第 3 块达到阈值 3");
    } finally {
      await cleanup(root2);
    }
  } finally {
    await cleanup(root);
  }
});

// —————————————— 7) open blocks 摘要/project_state 投影 ——————————————

test("open blocks 摘要：resolved 不展示；class/status/owner/waitingOn/age/证据/过滤/limit 精确", async () => {
  const root = await makeRoot();
  try {
    const t = (offsetMin: number) => () => new Date(Date.parse(T0) + offsetMin * 60_000);
    const ownerFact = factOf({ fingerprintMaterial: ["owner"], workflowId: "wf-open", flowId: "flow-open" });
    const ownerRaised = await raiseBlock({ projectRoot: root, fact: ownerFact, now: t(0) });
    assert.equal(ownerRaised.ok, true);
    if (!ownerRaised.ok) return;
    await routeBlock({
      projectRoot: root, blockId: ownerRaised.blockId, route: "owner-repair", reason: "owner",
      targetRoleId: "rapporteur", taskId: "repair-1", now: t(1),
    });
    const customerFact = factOf({
      fingerprintMaterial: ["customer"], workflowId: "wf-open", flowId: "flow-open",
      code: "b-change-scope-invalid", detailCode: undefined, taskId: "t-customer",
    });
    const customerRaised = await raiseBlock({ projectRoot: root, fact: customerFact, now: t(2) });
    assert.equal(customerRaised.ok, true);
    if (!customerRaised.ok) return;
    await routeBlock({
      projectRoot: root, blockId: customerRaised.blockId, route: "customer-decision", reason: "customer",
      cardRequestId: blockCardRequestId(customerRaised.blockId), now: t(3),
    });
    const resolvedFact = factOf({ fingerprintMaterial: ["resolved"], workflowId: "wf-other", flowId: "flow-other" });
    const resolvedRaised = await raiseBlock({ projectRoot: root, fact: resolvedFact, now: t(4) });
    assert.equal(resolvedRaised.ok, true);
    if (!resolvedRaised.ok) return;
    await routeBlock({ projectRoot: root, blockId: resolvedRaised.blockId, route: "owner-repair", reason: "x", targetRoleId: "convener", now: t(4) });
    await resolveBlock({ projectRoot: root, blockId: resolvedRaised.blockId, resolution: "fixed", by: "convener", note: "done", now: t(5) });
    const raisedOnlyFact = factOf({ fingerprintMaterial: ["raised-only"], workflowId: "wf-other", flowId: "flow-other" });
    const raisedOnly = await raiseBlock({ projectRoot: root, fact: raisedOnlyFact, now: t(6) });
    assert.equal(raisedOnly.ok, true);
    if (!raisedOnly.ok) return;

    const events = await eventsOf(root);
    const nowMs = Date.parse(T0) + 30 * 60_000;
    const summaries = summarizeOpenBlocks(events, { nowMs });
    assert.equal(summaries.length, 3, "resolved 不展示");
    const byId = new Map(summaries.map((summary) => [summary.blockId, summary]));
    const owner = byId.get(ownerRaised.blockId)!;
    assert.equal(owner.class, "missing-resource");
    assert.equal(owner.classCode, "B1");
    assert.equal(owner.status, "routed");
    assert.equal(owner.owner, "rapporteur");
    assert.equal(owner.waitingOn, "role");
    assert.equal(owner.ageMs, 30 * 60_000);
    assert.deepEqual(owner.evidenceRefs, [`docs/contracts/x.md#sha256=${"a".repeat(64)}`]);
    assert.equal(owner.routeTaskId, "repair-1");
    assert.equal(owner.workflowId, "wf-open");
    assert.equal(owner.flowId, "flow-open");
    assert.equal(owner.stage, "A8");
    const customer = byId.get(customerRaised.blockId)!;
    assert.equal(customer.waitingOn, "customer");
    assert.equal(customer.owner, "customer");
    assert.equal(customer.cardRequestId, blockCardRequestId(customerRaised.blockId));
    assert.equal(customer.status, "routed");
    const raisedOnlySummary = byId.get(raisedOnly.blockId)!;
    assert.equal(raisedOnlySummary.status, "raised");
    assert.equal(raisedOnlySummary.routeCount, 0);
    assert.equal(raisedOnlySummary.routings.length, 0);
    assert.equal(raisedOnlySummary.routeKind, undefined);

    // 过滤：workflow/flow/blockId + limit。
    assert.equal(listOpenBlocks(events, { workflowId: "wf-open" }).length, 2);
    assert.equal(listOpenBlocks(events, { flowId: "flow-other" }).length, 1);
    assert.deepEqual(listOpenBlocks(events, { blockId: ownerRaised.blockId }).map((record) => record.blockId), [ownerRaised.blockId]);
    assert.equal(summarizeOpenBlocks(events, { limit: 1 }).length, 1);
    assert.equal(summarizeOpenBlocks(events, { workflowId: "nope" }).length, 0);
    // escalated 也属于 open。
    const escalateTarget = summarizeOpenBlocks(events)[0]!;
    await escalateBlock({ projectRoot: root, blockId: escalateTarget.blockId, from: "routed", to: "customer-decision", reason: "repair-timeout", now: t(40) });
    const afterEscalation = summarizeOpenBlocks(await eventsOf(root));
    assert.equal(afterEscalation.find((summary) => summary.blockId === escalateTarget.blockId)?.status, "escalated");
    assert.equal(afterEscalation.find((summary) => summary.blockId === escalateTarget.blockId)?.waitingOn, "customer");
  } finally {
    await cleanup(root);
  }
});

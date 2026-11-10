// test/编排/workflow-ledger.test.ts
// T3「两条固定工作流路径」B0：B1 AC-17/T-08——固定路径账本骨架（jsonl-ledger 5 MiB×3、幂等、坏行）。
// 覆盖：append/read、幂等键 replay、坏行/未知字段、轮转段旧→新、三账本分文件、不写旧账本、非法事件拒绝。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  BASIS_STATE_REL,
  FIXED_LEDGER_LIMITS,
  FIXED_PATH_LEDGER_SCHEMAS,
  RELEASES_STATE_REL,
  WORKFLOWS_STATE_REL,
  appendBasisEvent,
  appendReleaseEvent,
  appendWorkflowEvent,
  basisStatePath,
  readBasisLedger,
  readReleaseLedger,
  readWorkflowLedger,
  releasesStatePath,
  workflowsStatePath,
} from "../../src/common/编排/workflow-service.ts";
import { buildBasisRecordedEvent } from "../../src/common/编排/basis-guard.ts";
import type {
  BasisEvent,
  ReleaseEvent,
  StageRequestedEvent,
  WorkflowEvent,
  WorkflowStartedEvent,
} from "../../src/model/runtime.ts";

const AT = "2026-11-10T10:00:00.000Z";
const WF = "wf-0123456789abcdef01234567";
const FLOW = "snake";
const D = "a".repeat(64);

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-workflow-ledger-"));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function started(extra: Partial<WorkflowStartedEvent> = {}): WorkflowStartedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "workflow.started", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "客户新需求" }, sourceTaskId: "t-src",
    ...extra,
  };
}

function requested(stage: StageRequestedEvent["stage"], attempt = 1): StageRequestedEvent {
  return {
    v: 1, at: AT, schema: "ans-workflow/v1", kind: "stage.requested", workflowId: WF, flowId: FLOW, path: "A",
    idempotencyKey: `stage-request:${WF}:${stage}:${attempt}`, stage, requestTaskId: `t-${stage}`, requestDigest: D, attempt,
  };
}

test("append/read workflows：幂等键 replay 不重复追加；未知额外字段容忍；轮转段旧→新读取", async () => {
  const root = await tempRoot();
  try {
    const first = await appendWorkflowEvent(root, started());
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.replay, false);
    const second = await appendWorkflowEvent(root, requested("A1"));
    assert.equal(second.ok, true);
    // 同幂等键 replay：返回原事件、不追加第二行。
    const replay = await appendWorkflowEvent(root, started());
    assert.equal(replay.ok, true);
    if (replay.ok) {
      assert.equal(replay.replay, true);
      assert.equal(replay.event.kind, "workflow.started");
    }
    const read = await readWorkflowLedger(root);
    assert.deepEqual(read.events.map((event) => event.kind), ["workflow.started", "stage.requested"]);
    assert.equal(read.badLines, 0);
    const lines = (await fs.readFile(workflowsStatePath(root), "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    // 未知额外字段（未来扩展）读取容忍。
    const future = { ...requested("A2"), futureField: { note: "later" } } as unknown as WorkflowEvent;
    assert.equal((await appendWorkflowEvent(root, future)).ok, true);
    assert.equal((await readWorkflowLedger(root)).events.length, 3);

    // 轮转段：`.1` 旧 → 当前新。
    const rotatedRoot = await tempRoot();
    try {
      const file = workflowsStatePath(rotatedRoot);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(`${file}.1`, `${JSON.stringify(started())}\n`, "utf8");
      await fs.writeFile(file, `${JSON.stringify(requested("A1"))}\n`, "utf8");
      const rotated = await readWorkflowLedger(rotatedRoot);
      assert.deepEqual(rotated.files, ["workflows.jsonl.1", "workflows.jsonl"]);
      assert.deepEqual(rotated.events.map((event) => event.kind), ["workflow.started", "stage.requested"]);
    } finally {
      await cleanup(rotatedRoot);
    }
  } finally {
    await cleanup(root);
  }
});

test("坏行计数不阻塞：坏 JSON + 形状非法行 ⇒ badLines/errors，合法事件保留", async () => {
  const root = await tempRoot();
  try {
    assert.equal((await appendWorkflowEvent(root, started())).ok, true);
    assert.equal((await appendWorkflowEvent(root, requested("A1"))).ok, true);
    const file = workflowsStatePath(root);
    const badShape = JSON.stringify({ ...requested("A2"), stage: "A14" });
    await fs.appendFile(file, `{oops\n${badShape}\n`, "utf8");
    const read = await readWorkflowLedger(root);
    assert.equal(read.events.length, 2);
    assert.equal(read.badLines, 2);
    assert.equal(read.errors.length, 2);
    assert.ok(read.errors.some((error) => error.message.includes("JSON")));
    assert.ok(read.errors.some((error) => error.message.includes("形状非法")));
  } finally {
    await cleanup(root);
  }
});

test("三账本分文件：basis.release 写入各自路径；跨 schema 行按坏行计数；5 MiB×3 常量", async () => {
  const root = await tempRoot();
  try {
    const basisEvent = buildBasisRecordedEvent({
      workflowId: WF, flowId: FLOW,
      documents: [{ kind: "intent", path: "docs/product/snake-intent-v1.md", version: 1, sha256: D, bytes: 12 }],
      teamPlan: null, operationId: "op-1", idempotencyKey: `baseline:${WF}:${D}`, reason: "baseline",
      now: () => new Date(AT),
    });
    const basis = await appendBasisEvent(root, basisEvent);
    assert.equal(basis.ok, true);
    const merged: ReleaseEvent = {
      v: 1, at: AT, schema: "ans-release/v1", kind: "release.merged", releaseId: "rel-7d",
      workflowId: WF, flowId: FLOW, idempotencyKey: `release:${WF}:${"c".repeat(40)}`,
      baseOid: null, tipOid: { objectFormat: "sha1", hex: "c".repeat(40) },
      mergeOid: { objectFormat: "sha1", hex: "d".repeat(40) }, mergeKind: "initial",
      files: [{ path: "src/main.ts", status: "A" }], diffDigest: D,
    };
    assert.equal((await appendReleaseEvent(root, merged)).ok, true);
    assert.equal((await readBasisLedger(root)).events[0]?.kind, "basis.recorded");
    assert.equal((await readReleaseLedger(root)).events[0]?.kind, "release.merged");
    // 把 workflows 事件混入 basis.jsonl ⇒ 只计坏行，不冒充 basis 事件。
    await fs.appendFile(basisStatePath(root), `${JSON.stringify(started())}\n`, "utf8");
    const polluted = await readBasisLedger(root);
    assert.equal(polluted.events.length, 1);
    assert.equal(polluted.badLines, 1);
    // 常量：路径与 schema 单一来源。
    assert.equal(WORKFLOWS_STATE_REL, ".ans/state/workflows.jsonl");
    assert.equal(BASIS_STATE_REL, ".ans/state/basis.jsonl");
    assert.equal(RELEASES_STATE_REL, ".ans/state/releases.jsonl");
    assert.deepEqual(FIXED_PATH_LEDGER_SCHEMAS, {
      workflows: "ans-workflow/v1", basis: "ans-basis/v1", releases: "ans-release/v1",
    });
    assert.equal(FIXED_LEDGER_LIMITS.maxBytes, 5 * 1024 * 1024);
    assert.equal(FIXED_LEDGER_LIMITS.rotations, 3);
    assert.equal(releasesStatePath(root).endsWith(`${path.sep}releases.jsonl`), true);
  } finally {
    await cleanup(root);
  }
});

test("不写旧账本：固定路径账本 append 不创建 .ans/trunk/.ans/runs/tasks.jsonl", async () => {
  const root = await tempRoot();
  try {
    assert.equal((await appendWorkflowEvent(root, started())).ok, true);
    const stateDir = path.dirname(workflowsStatePath(root));
    assert.deepEqual((await fs.readdir(stateDir)).sort(), ["workflows.jsonl"]);
    for (const legacy of [".ans/trunk", ".ans/runs", ".ans/state/tasks.jsonl", ".ans/versions", ".ans/stable"]) {
      await assert.rejects(fs.access(path.join(root, ...legacy.split("/"))), { code: "ENOENT" }, legacy);
    }
  } finally {
    await cleanup(root);
  }
});

test("非法事件拒绝写入：坏 stage/schema ⇒ invalid-event，且不落盘", async () => {
  const root = await tempRoot();
  try {
    const bad = { ...requested("A1"), stage: "A14" } as unknown as WorkflowEvent;
    const rejected = await appendWorkflowEvent(root, bad);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "invalid-event");
    const badSchema = { ...started(), schema: "ans-workflow/v2" } as unknown as WorkflowEvent;
    assert.equal((await appendWorkflowEvent(root, badSchema)).ok, false);
    await assert.rejects(fs.access(workflowsStatePath(root)), { code: "ENOENT" }, "拒绝的事件不得创建账本文件");
    // basis 非法 reason 同样拒绝。
    const badBasis = { ...buildBasisRecordedEvent({
      workflowId: WF, flowId: FLOW, documents: [], teamPlan: null, operationId: "op-1",
      idempotencyKey: "k", reason: "baseline", now: () => new Date(AT),
    }), reason: "bogus" } as unknown as BasisEvent;
    assert.equal((await appendBasisEvent(root, badBasis)).ok, false);
  } finally {
    await cleanup(root);
  }
});

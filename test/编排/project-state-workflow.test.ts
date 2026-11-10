// test/编排/project-state-workflow.test.ts
// T3 B1（2026-11-10）：B1 AC-19/G-18——project_state 的 fixed workflow 只读投影与 legacyStateIgnored 警告。
// 覆盖：活动 workflow 视图（stage/status/basis/reviewRoleId/activated）、workflow-corrupt 警告、
// 旧 trunk/run 状态如实列出（不静默、不删除），renderProjectStateSummary 追加 [workflow] 段。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildProjectStateView,
  buildWorkflowStateProjection,
  renderProjectStateSummary,
} from "../../src/common/编排/project-state.ts";
import {
  appendBasisEvent,
  appendWorkflowEvent,
  workflowIdFor,
} from "../../src/common/编排/workflow-service.ts";
import type { WorkflowEvent } from "../../src/model/runtime.ts";

const FLOW = "snake";
const D = "a".repeat(64);
const AT = "2026-11-10T10:00:00.000Z";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-project-workflow-"));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

test("空项目：无 workflow、无 legacyStateIgnored 警告", async () => {
  const root = await tempRoot();
  try {
    const projection = await buildWorkflowStateProjection({ projectRoot: root });
    assert.equal(projection.workflow, undefined);
    assert.deepEqual(projection.legacyStateIgnored, []);
    assert.deepEqual(projection.warnings, []);
  } finally {
    await cleanup(root);
  }
});

test("活动 fixed workflow：视图/阶段/reviewRoleId/activated + 旧 trunk/run 状态列为 legacyStateIgnored", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    const base = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, workflowId, flowId: FLOW, path: "A" as const };
    const events: WorkflowEvent[] = [
      { ...base, kind: "workflow.started", idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "x" }, sourceTaskId: "t-src", legacyStateIgnored: true },
      { ...base, kind: "stage.requested", idempotencyKey: `stage-request:${workflowId}:A1:1`, stage: "A1", requestTaskId: "t-a1", requestDigest: D, attempt: 1 },
      { ...base, kind: "stage.completed", idempotencyKey: `stage-complete:${workflowId}:A1:x`, stage: "A1", cause: { kind: "task-closed", ref: "t-a1" }, artifacts: [] },
      { ...base, kind: "stage.requested", idempotencyKey: `stage-request:${workflowId}:A2:1`, stage: "A2", requestTaskId: "t-a2", requestDigest: D, attempt: 1 },
      { ...base, kind: "stage.completed", idempotencyKey: `stage-complete:${workflowId}:A9:x`, stage: "A9", cause: { kind: "basis-recorded", ref: "bas-x" }, artifacts: [] },
    ];
    for (const event of events.slice(0, 4)) await appendWorkflowEvent(root, event);
    // A9 事件单独追加会非法（跳阶段）——改用合法的 A3/A4…；这里只关心投影读取，不强求 A9。
    // 旧 trunk / runs 存在 ⇒ legacyStateIgnored 列出。
    await writeFile(root, ".ans/trunk/manifest.json", JSON.stringify({ schema: "trunk/v1", trunkVersion: 1, flowId: "old" }));
    await writeFile(root, ".ans/runs/run-20261030-old-abcdef12/manifest.json", JSON.stringify({ schema: "ans-run/v1", runId: "run-20261030-old-abcdef12", flowId: "old", state: "closed" }));
    const basis = {
      v: 1 as const, at: AT, schema: "ans-basis/v1" as const, kind: "basis.recorded" as const,
      basisId: "bas-0123456789abcdef01234567", workflowId, flowId: FLOW, documents: [], teamPlan: null,
      reviewRoleId: "qa-project", operationId: "op-1", idempotencyKey: `baseline:${workflowId}:x`, reason: "baseline" as const, recordedBy: "application" as const,
    };
    await appendBasisEvent(root, basis);

    const projection = await buildWorkflowStateProjection({ projectRoot: root });
    assert.ok(projection.workflow);
    if (projection.workflow !== undefined) {
      assert.equal(projection.workflow.workflowId, workflowId);
      assert.equal(projection.workflow.flowId, FLOW);
      assert.equal(projection.workflow.reviewRoleId, "qa-project");
      assert.equal(projection.workflow.basisId, "bas-0123456789abcdef01234567");
    }
    assert.equal(projection.activeWorkflowId, workflowId);
    assert.ok(projection.legacyStateIgnored.includes(".ans/trunk/**"));
    assert.ok(projection.legacyStateIgnored.includes(".ans/runs/**"));
    assert.ok(projection.warnings.some((warning) => warning.includes("legacyStateIgnored")));

    // renderProjectStateSummary 第三参追加 [workflow] 段（只读投影）。
    const view = await buildProjectStateView(root);
    const text = renderProjectStateSummary(view, {}, projection);
    assert.match(text, /\[workflow\]/);
    assert.match(text, new RegExp(workflowId));
    assert.match(text, /legacyStateIgnored=.*\.ans\/trunk\/\*\*/);
  } finally {
    await cleanup(root);
  }
});

test("坏账本（workflow-corrupt）⇒ 投影警告如实列出，不按成功处理", async () => {
  const root = await tempRoot();
  try {
    const workflowId = workflowIdFor(FLOW, "A", "t-src", D);
    const base = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, workflowId, flowId: FLOW, path: "A" as const };
    await appendWorkflowEvent(root, {
      ...base, kind: "workflow.started", idempotencyKey: `workflow-start:${FLOW}:A:t-src`,
      trigger: { by: "chief", reason: "x" }, sourceTaskId: "t-src",
    });
    // 非法转移：A1 未完成直接 requested A3。
    await appendWorkflowEvent(root, {
      ...base, kind: "stage.requested", idempotencyKey: `stage-request:${workflowId}:A3:1`,
      stage: "A3", requestTaskId: "t-a3", requestDigest: D, attempt: 1,
    });
    const projection = await buildWorkflowStateProjection({ projectRoot: root });
    assert.ok(projection.warnings.some((warning) => warning.startsWith("workflow-corrupt")));
  } finally {
    await cleanup(root);
  }
});

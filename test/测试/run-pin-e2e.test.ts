// test/测试/run-pin-e2e.test.ts
// 2026-10-30（方案 v3 §3.1 / P1.1/P1.3）：run manifest + task-state 的最小端到端——
// draft → pinned 同 runId，任务落 run 字段，任务卡读回 pinned 状态，hash 校验通过。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureDraftRun, pinRun, readRunManifest, verifyPinnedRun } from "../../src/common/编排/run-manifest.ts";
import { appendTaskEvent, readTaskState, renderTaskCardLines, taskCardOf, taskEvent } from "../../src/common/编排/task-state.ts";

const ROSTER = [
  "---",
  "schema: project-roster/v3",
  "flowId: focus",
  "version: 1",
  "envBootstrapOmittedReason: e2e 夹具省略装配/入口角色",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "roles:",
  "  - id: dev",
  "    displayName: 开发",
  "    purpose: 实现",
  "    capability: TS",
  "    modules: [core]",
  "modules:",
  "  - id: core",
  "    name: 核心",
  "    purpose: 实现",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.ts",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: core",
  "    path: src/",
  "    roleId: dev",
  "roles:",
  "  - id: dev",
  "    modules: [core]",
  "management: [convener, dev]",
  "```",
].join("\n");

test("run-pin E2E：draft → pinned 同 runId；任务卡读回 pinned run", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-e2e-"));
  try {
    const write = async (rel: string, text: string): Promise<void> => {
      await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await fs.writeFile(path.join(root, rel), text, "utf8");
    };
    await write("docs/product/focus-intent-v1.md", "# 意图\n");
    await write("docs/proposals/focus-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n");
    await write("docs/proposals/focus-roster-v1.md", ROSTER);
    const { parseProjectRoster } = await import("../../src/common/编排/workflow-preconditions.ts");
    const parsed = parseProjectRoster(ROSTER);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    await write("docs/proposals/focus-modules-v1.md", ["---", "schema: project-modules/v2", "flowId: focus", "version: 1", `modules: ${JSON.stringify(parsed.roster.modules)}`, "---", "# 模块清单"].join("\n"));
    await write("docs/contracts/focus-architecture-v1.md", "# 架构\nproposal: docs/proposals/focus-proposal-v1.md\n");
    const ensured = await ensureDraftRun(root, "focus");
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;
    const pinned = await pinRun(root, ensured.manifest.runId, { d3: { decisionId: "decision-e2e", targetRoleIds: ["dev"] } });
    assert.equal(pinned.ok, true, pinned.ok ? "" : pinned.reason);
    if (!pinned.ok) return;
    assert.equal(pinned.manifest.runId, ensured.manifest.runId);
    const verified = await verifyPinnedRun(root, pinned.manifest);
    assert.equal(verified.ok, true);
    if (verified.ok) assert.deepEqual(verified.violations, []);
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-e2e",
      flowId: "focus",
      runId: pinned.manifest.runId,
      runState: "pinned",
      runStage: "stage-1",
      from: "chief",
      to: "convener",
      text: "交付运营",
      sideEffect: "read-only",
      idempotencyKey: "e2e",
      stepId: "project-handoff",
    }));
    const state = await readTaskState(root);
    const record = state.records.get("t-e2e")!;
    assert.equal(record.created?.runId, pinned.manifest.runId);
    assert.equal(record.created?.runState, "pinned");
    assert.match(renderTaskCardLines(taskCardOf(record)!).join("\n"), new RegExp(`run：${pinned.manifest.runId}（pinned，stage stage-1）`));
    const reread = await readRunManifest(root, pinned.manifest.runId);
    assert.equal(reread.ok, true);
    if (reread.ok) assert.equal(reread.manifest.state, "pinned");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

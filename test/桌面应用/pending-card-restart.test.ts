// test/桌面应用/pending-card-restart.test.ts
// C 批（2026-10-28）：重启重放——未决申请标 request.orphaned（不自动执行原动作），
// 未决审批标 approval.expired（命令/写盘不重放）；已结算不重复（requestId/approvalId 幂等）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

function listing(root: string): ProjectListing {
  return {
    projectRoot: root,
    roles: [
      { roleId: "chief", cardPath: "", boundaryPath: "", cardText: "chief", boundary: { entries: [], boundarySource: "<built-in:chief>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "chief" },
      { roleId: "rapporteur", cardPath: "", boundaryPath: "", cardText: "rapporteur", boundary: { entries: [], boundarySource: "<built-in:rapporteur>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "proposal" },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

test("重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-pending-restart-"));
  const mgr = new SessionManager({
    openRoleSession: async () => ({ async send() {}, events() { return { [Symbol.asyncIterator]() { return { async next() { return { value: undefined as never, done: true }; } }; } }; }, async dispose() {} }),
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  try {
    await appendTaskEvent(root, taskEvent("request.created", {
      requestId: "req-open",
      sourceRoleId: "rapporteur",
      title: "未决申请",
      flowId: "flow-a",
      options: [{ id: "accept", label: "接受" }],
    }));
    await appendTaskEvent(root, taskEvent("request.presented", { requestId: "req-open", to: "customer" }));
    await appendTaskEvent(root, taskEvent("request.created", {
      requestId: "req-done",
      sourceRoleId: "rapporteur",
      title: "已裁决",
      flowId: "flow-b",
      options: [{ id: "accept", label: "接受" }],
    }));
    await appendTaskEvent(root, taskEvent("request.resolved", { requestId: "req-done", by: "customer", choice: "accept" }));
    await appendTaskEvent(root, taskEvent("approval.created", {
      approvalId: "appr-open",
      sourceRoleId: "rapporteur",
      approvalKind: "shell",
      summary: "待审批命令",
    }));
    await appendTaskEvent(root, taskEvent("approval.created", {
      approvalId: "appr-done",
      sourceRoleId: "rapporteur",
      approvalKind: "appointment-write",
      summary: "已审批写卡",
    }));
    await appendTaskEvent(root, taskEvent("approval.resolved", { approvalId: "appr-done", by: "customer", decision: "accepted" }));

    const first = await mgr.restoreTasks(root);
    assert.equal(first.orphanedRequests, 1);
    assert.equal(first.expiredApprovals, 1);
    const state = await readTaskState(root);
    assert.ok(state.events.some((event) => event.kind === "request.orphaned" && event.requestId === "req-open" && event.reason === "restart"));
    assert.ok(!state.events.some((event) => event.kind === "request.orphaned" && event.requestId === "req-done"));
    assert.ok(state.events.some((event) => event.kind === "approval.expired" && event.approvalId === "appr-open" && event.reason === "restart"));
    assert.ok(!state.events.some((event) => event.kind === "approval.expired" && event.approvalId === "appr-done"));

    const second = await mgr.restoreTasks(root);
    assert.equal(second.orphanedRequests, 0, "同一 requestId 幂等");
    assert.equal(second.expiredApprovals, 0, "同一 approvalId 幂等");
    const after = await readTaskState(root);
    assert.equal(after.events.filter((event) => event.kind === "request.orphaned").length, 1);
    assert.equal(after.events.filter((event) => event.kind === "approval.expired").length, 1);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

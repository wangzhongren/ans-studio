// test/编排/stable-write-runtime.test.ts
// S4 stable-write-runtime 测试：workflow 轻量确认卡（diff preview）、permit 签发/安装/
// `stablePermitOf` 注入、`completeWrite(actualSha)` 复核/消费/mini re-pin（不升 trunkVersion）、
// 失败作废/事件、appointment-write 钩子、无卡通道 fail-closed。
//
// 真实 S1 存储 + S2 Service（许可/记录/校验）+ S3/S2 trunk（mini re-pin）；presenter/事件 fake。
// 本层不写项目文档：测试侧直接落盘模拟 run-role gate 的真实写入。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

import type { TaskStateEvent } from "../../src/model/runtime.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createStableWriteRuntime } from "../../src/pipeline/orchestration/stable-write-runtime.ts";
import type { StableWritePresenter, StableWriteRuntime } from "../../src/pipeline/orchestration/stable-write-runtime.ts";
import { createRunRepinPort, createTrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { TrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import {
  AT,
  AT2,
  FLOW_ID,
  PATHS,
  createTrunkProject,
  sha256,
  writeProjectFile,
  type TrunkProject,
} from "./fixtures/trunk-project.ts";

const AT3 = "2026-11-04T12:36:00.000Z";

interface Rig {
  project: TrunkProject;
  integration: ReturnType<typeof createVersionChangeIntegration>;
  trunkRuntime: TrunkRuntime;
  runtime: StableWriteRuntime;
  events: TaskStateEvent[];
  previews: Array<{ path: string; baseSha256: string; targetSha256: string; diffPreview: string }>;
}

async function setup(options: { presenter?: boolean; bootstrap?: boolean } = {}): Promise<Rig> {
  const project = await createTrunkProject();
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
    runRepin: createRunRepinPort(project.root),
  });
  const events: TaskStateEvent[] = [];
  const trunkRuntime = createTrunkRuntime({
    projectRoot: project.root,
    service: integration.trunk,
    emitEvent: async (event) => {
      events.push(event);
    },
    now: () => new Date(AT),
  });
  if (options.bootstrap !== false) {
    const boot = await trunkRuntime.bootstrap({
      flowId: FLOW_ID,
      runId: project.runId,
      applicationId: "vc-boot",
      decisionId: "dec-boot",
      target: project.snapshot(),
      rosterVersion: 1,
      d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
      roles: ["impl"],
      journalId: "j-boot",
      at: AT2,
    });
    assert.equal(boot.ok, true);
    events.length = 0; // 只断言本节点事件
  }
  const previews: Rig["previews"] = [];
  const presenter: StableWritePresenter = {
    async presentWorkflowWrite(input) {
      previews.push(input.preview);
      return { outcome: "answered", choice: "approve-stable-write", decisionId: "dec-sw" };
    },
  };
  const runtime = createStableWriteRuntime({
    stableWrite: integration.services.stableWrite,
    trunkRuntime,
    emitEvent: async (event) => {
      events.push(event);
    },
    ...(options.presenter === false ? {} : { presenter }),
    notify: () => {},
    now: () => new Date(AT),
  });
  return { project, integration, trunkRuntime, runtime, events, previews };
}

test("stable-write-runtime：workflow 卡预览 + 许可安装 + stablePermitOf + completeWrite mini re-pin", async () => {
  const rig = await setup();
  try {
    const content = "# workflow v2 (confirmed)\n";
    const targetSha = sha256(content);
    const requested = await rig.runtime.requestWorkflowWrite({
      roleId: "convener",
      content,
      diffPreview: "@@ -1 +1 @@",
      requestId: "sw-1",
      at: AT2,
    });
    assert.equal(requested.ok, true, requested.ok ? "" : `${requested.code}: ${requested.message ?? ""}`);
    if (!requested.ok) return;
    assert.equal(requested.value.cardOutcome, "answered");
    assert.equal(requested.value.record.status, "approved");
    assert.ok(requested.value.permit !== undefined);
    assert.equal(requested.value.permit?.path, PATHS.workflow);
    assert.equal(requested.value.permit?.targetSha256, targetSha);
    assert.equal(rig.previews.length, 1);
    assert.equal(rig.previews[0]?.path, PATHS.workflow);
    assert.equal(rig.previews[0]?.targetSha256, targetSha);
    assert.equal(rig.previews[0]?.diffPreview, "@@ -1 +1 @@");
    const installed = await rig.integration.services.stableWrite.findPermit(PATHS.workflow);
    assert.equal(installed?.permitId, requested.value.permit?.permitId, "许可已安装到 C2b 同步快照");
    assert.equal(rig.runtime.stablePermitOf(PATHS.workflow)?.permitId, requested.value.permit?.permitId);

    const before = await rig.integration.trunk.current();
    // 真实写入执行点 = run-role gate（测试侧直接落盘模拟）
    await writeProjectFile(rig.project.root, PATHS.workflow, content);
    const completed = await rig.runtime.completeWrite({
      requestId: "sw-1",
      actualSha256: targetSha,
      at: AT3,
    });
    assert.equal(completed.ok, true, completed.ok ? "" : `${completed.code}: ${completed.message ?? ""}`);
    if (!completed.ok) return;
    assert.equal(completed.value.record.status, "written");
    assert.equal(completed.value.repinApplied, true);
    assert.equal(completed.value.repinEventEmitted, true);
    assert.equal(await rig.integration.services.stableWrite.findPermit(PATHS.workflow), undefined);
    assert.equal(rig.runtime.stablePermitOf(PATHS.workflow), undefined);
    const after = await rig.integration.trunk.current();
    assert.equal(after?.trunkVersion, before?.trunkVersion, "mini re-pin 不升 trunkVersion");
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.workflow.sha256, targetSha);

    const kinds = rig.events.map((event) => event.kind);
    assert.deepEqual(kinds.filter((kind) => kind.startsWith("stable.write.")), [
      "stable.write.requested",
      "stable.write.approved",
      "stable.write.written",
    ]);
    const repin = rig.events.find((event) => event.kind === "trunk.state");
    assert.ok(repin !== undefined, "应写 trunk.state(stable-repinned)");
    if (repin?.kind === "trunk.state") {
      assert.equal(repin.op, "stable-repinned");
      assert.equal(repin.decidedBy, "customer");
      assert.equal(repin.trunkVersion, before?.trunkVersion);
      assert.equal(repin.newSha, targetSha);
    }
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("stable-write-runtime：completeWrite 哈希不符 ⇒ failed 事件 + 许可作废 + 快照不变", async () => {
  const rig = await setup();
  try {
    const content = "# workflow v3\n";
    const requested = await rig.runtime.requestWorkflowWrite({
      roleId: "convener",
      content,
      requestId: "sw-2",
      at: AT2,
    });
    assert.equal(requested.ok, true);
    const before = await rig.integration.trunk.status();
    await writeProjectFile(rig.project.root, PATHS.workflow, "# workflow tampered\n");
    const failed = await rig.runtime.completeWrite({
      requestId: "sw-2",
      actualSha256: sha256("tampered"),
      at: AT3,
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.code, "stable-write-hash-mismatch");
    const records = await rig.runtime.list();
    assert.equal(records.find((record) => record.requestId === "sw-2")?.status, "failed");
    assert.equal(rig.runtime.stablePermitOf(PATHS.workflow), undefined);
    const after = await rig.integration.trunk.status();
    assert.equal(after.manifest?.artifacts.workflow.sha256, before.manifest?.artifacts.workflow.sha256);
    assert.ok(rig.events.some((event) => event.kind === "stable.write.failed"));
    assert.ok(!rig.events.some((event) => event.kind === "trunk.state"));
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("stable-write-runtime：无卡通道 ⇒ 已记录请求但不发许可（fail-closed）", async () => {
  const rig = await setup({ presenter: false });
  try {
    const requested = await rig.runtime.requestWorkflowWrite({
      roleId: "convener",
      content: "# workflow v4\n",
      requestId: "sw-3",
      at: AT2,
    });
    assert.equal(requested.ok, false);
    if (!requested.ok) assert.equal(requested.code, "vca-channel-unavailable");
    const records = await rig.runtime.list();
    assert.equal(records.find((record) => record.requestId === "sw-3")?.status, "requested");
    assert.equal(await rig.integration.services.stableWrite.findPermit(PATHS.workflow), undefined);
    assert.ok(rig.events.some((event) => event.kind === "stable.write.requested"));
    assert.ok(!rig.events.some((event) => event.kind === "stable.write.approved"));
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("stable-write-runtime：appointment-write 钩子（role-card）→ 确认后许可 → written + mini re-pin", async () => {
  const rig = await setup();
  try {
    const content = "# role card impl v2\n";
    const approved = await rig.runtime.onAppointmentWriteApproved({
      roleId: "impl",
      kind: "role-card",
      content,
      confirmationId: "conf-1",
      requestId: "sw-4",
      at: AT2,
    });
    assert.equal(approved.ok, true, approved.ok ? "" : `${approved.code}: ${approved.message ?? ""}`);
    if (!approved.ok) return;
    assert.equal(approved.value.record.status, "approved");
    const events = rig.events.filter((event) => event.kind.startsWith("stable.write."));
    assert.deepEqual(events.map((event) => event.kind), ["stable.write.requested", "stable.write.approved"]);
    const approvedEvent = events[1];
    if (approvedEvent?.kind === "stable.write.approved") {
      assert.equal(approvedEvent.origin, "customer");
      assert.equal(approvedEvent.confirmationId, "conf-1");
    }
    await writeProjectFile(rig.project.root, PATHS.roleCard, content);
    const completed = await rig.runtime.completeWrite({
      requestId: "sw-4",
      actualSha256: sha256(content),
      at: AT3,
    });
    assert.equal(completed.ok, true);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.roleCards?.impl.sha256, sha256(content));
    assert.equal(status.manifest?.trunkVersion, 1);
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("stable-write-runtime：无 trunk manifest ⇒ written 但 mini re-pin 只记待续接（不发 stable-repinned）", async () => {
  const rig = await setup({ bootstrap: false });
  try {
    const content = "# workflow no-trunk\n";
    const requested = await rig.runtime.requestWorkflowWrite({
      roleId: "convener",
      content,
      requestId: "sw-5",
      at: AT2,
    });
    assert.equal(requested.ok, true);
    await writeProjectFile(rig.project.root, PATHS.workflow, content);
    const completed = await rig.runtime.completeWrite({
      requestId: "sw-5",
      actualSha256: sha256(content),
      at: AT3,
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.value.repinApplied, false);
    assert.equal(completed.value.pendingReattach, true);
    assert.ok(!rig.events.some((event) => event.kind === "trunk.state"));
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

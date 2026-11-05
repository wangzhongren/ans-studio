// test/编排/version-change-runtime.test.ts
// S4 version-change-runtime 测试：VCA 提交/客户卡/批准/拒绝、version-upgrade 单次（trunk apply +
// vca.apply）、detail 逐项卡（item-apply/item-keep）+ 预冻结 + trunk apply、bootstrap、
// 批准前哈希重验、无卡通道 fail-closed、事件归属与通知。
//
// 使用 S2 真实 Service/存储 + S3 真实 re-pin + S4 trunk-runtime；presenter/事件/通知为 fake。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";

import type { TaskStateEvent } from "../../src/model/runtime.ts";
import { readRunManifest } from "../../src/common/编排/run-manifest.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import type {
  VersionChangePresenter,
  VersionChangeRuntime,
} from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { createRunRepinPort, createTrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { TrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import {
  AT,
  AT2,
  FLOW_ID,
  PATHS,
  createTrunkProject,
  writeProjectFile,
  type TrunkProject,
} from "./fixtures/trunk-project.ts";

interface Rig {
  project: TrunkProject;
  integration: ReturnType<typeof createVersionChangeIntegration>;
  trunkRuntime: TrunkRuntime;
  runtime: VersionChangeRuntime;
  events: TaskStateEvent[];
  notifications: string[];
  initiatorNotes: Array<{ roleId: string; message: string }>;
  presenterCalls: { versionChange: number; items: number };
}

async function setup(options: { presenter?: boolean } = {}): Promise<Rig> {
  const project = await createTrunkProject();
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => true,
    runRepin: createRunRepinPort(project.root),
  });
  const events: TaskStateEvent[] = [];
  const notifications: string[] = [];
  const initiatorNotes: Array<{ roleId: string; message: string }> = [];
  const trunkRuntime = createTrunkRuntime({
    projectRoot: project.root,
    service: integration.trunk,
    emitEvent: async (event) => {
      events.push(event);
    },
    now: () => new Date(AT),
  });
  const presenterCalls = { versionChange: 0, items: 0 };
  const presenter: VersionChangePresenter = {
    async presentVersionChange() {
      presenterCalls.versionChange += 1;
      return { outcome: "answered", choice: "approve-version-change", decisionId: "dec-vca" };
    },
    async presentAmendmentItem() {
      presenterCalls.items += 1;
      return { outcome: "answered", choice: "item-apply", decisionId: "dec-item" };
    },
  };
  const runtime = createVersionChangeRuntime({
    projectRoot: project.root,
    services: integration.services,
    trunkService: integration.trunk,
    trunkRuntime,
    emitEvent: async (event) => {
      events.push(event);
    },
    ...(options.presenter === false ? {} : { presenter }),
    notify: (message) => {
      notifications.push(message);
    },
    notifyInitiator: (roleId, message) => {
      initiatorNotes.push({ roleId, message });
    },
    now: () => new Date(AT),
  });
  return { project, integration, trunkRuntime, runtime, events, notifications, initiatorNotes, presenterCalls };
}

async function bootstrap(rig: Rig): Promise<void> {
  const boot = await rig.trunkRuntime.bootstrap({
    flowId: FLOW_ID,
    runId: rig.project.runId,
    applicationId: "vc-boot",
    decisionId: "dec-boot",
    target: rig.project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    journalId: "j-boot",
    at: AT2,
  });
  assert.equal(boot.ok, true, boot.ok ? "" : `${boot.code}: ${boot.message ?? ""}`);
}

function eventKinds(events: TaskStateEvent[]): string[] {
  return events.map((event) => event.kind);
}

test("version-change-runtime：bootstrap version-upgrade（present → approve → trunk t1 → applied）", async () => {
  const rig = await setup();
  try {
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: null,
      bootstrap: true,
      targets: [{ kind: "contract", path: v2, action: "add" }],
      summary: "bootstrap v2",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);
    if (!submitted.ok) return;
    assert.equal(submitted.value.status, "submitted");
    assert.ok(eventKinds(rig.events).includes("version.change"));
    assert.ok(rig.notifications.some((message) => message.includes("submitted")));

    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, true, presented.ok ? "" : `${presented.code}: ${presented.message ?? ""}`);
    if (!presented.ok) return;
    assert.equal(presented.value.record.status, "applied");
    assert.equal(presented.value.resultTrunkVersion, 1);
    const current = await rig.integration.trunk.current();
    assert.equal(current?.trunkVersion, 1);

    // 存量项目基线绑定：bootstrap apply 同时把唯一 pinned run 回绑到 t1 内容（v2 目标），
    // 不允许出现「trunk 指向 v2、run 仍 pin v1」的割裂。
    const run = await readRunManifest(rig.project.root, rig.project.runId);
    assert.equal(run.ok, true, run.ok ? "" : run.reason);
    if (run.ok) {
      assert.equal(run.manifest.documents.proposal?.path, v2);
      assert.equal(run.manifest.documents.proposal?.sha256, v2sha);
      const repins = (run.manifest as unknown as { repins?: Array<{ applicationId?: string }> }).repins ?? [];
      assert.equal(
        repins.some((repin) => repin.applicationId === "vc-1"),
        true,
        "bootstrap apply 应记录 run re-pin",
      );
    }

    // 存量项目 bootstrap：派生基线的 roster/D3/roles 必须一起落进 t1，verify 零违规。
    const bootstrapStatus = await rig.integration.trunk.status();
    assert.equal(bootstrapStatus.manifest?.d3?.decisionId, "dec-0");
    assert.deepEqual(bootstrapStatus.manifest?.roles, ["impl"]);
    assert.equal(bootstrapStatus.manifest?.rosterVersion, 1);
    const bootstrapVerify = await rig.integration.trunk.verify();
    assert.deepEqual(bootstrapVerify.violations, []);

    const versionEvents = rig.events.filter((event) => event.kind === "version.change");
    const statuses = versionEvents.map((event) => (event.kind === "version.change" ? event.status : ""));
    assert.deepEqual(statuses, ["submitted", "approved", "applied"]);
    const appliedEvent = versionEvents.at(-1)!;
    if (appliedEvent.kind === "version.change") {
      assert.equal(appliedEvent.origin, "application"); // applied 是应用动作（带 decisionId，不冒充 customer）
      assert.equal(appliedEvent.decisionId, "dec-vca");
      assert.equal(appliedEvent.resultTrunkVersion, 1);
    }
    const freezeEvents = rig.events.filter((event) => event.kind === "doc.freeze");
    assert.equal(freezeEvents.length, 1);
    if (freezeEvents[0]?.kind === "doc.freeze") {
      assert.equal(freezeEvents[0].reason, "bootstrap-vca-approved");
      assert.equal(freezeEvents[0].origin, "application");
    }
    assert.equal(rig.presenterCalls.versionChange, 1);
    assert.equal(
      rig.initiatorNotes.some((note) => note.roleId === "product" && note.message.includes("已批准并应用")),
      true,
      `发起人未收到批准回执：${JSON.stringify(rig.initiatorNotes)}`,
    );
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("version-change-runtime：既有 trunk 上 version-upgrade（冻结 → apply/re-pin → t2 → applied）", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: (await rig.integration.trunk.current())!,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "upgrade v2",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true);
    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, true, presented.ok ? "" : `${presented.code}: ${presented.message ?? ""}`);
    if (!presented.ok) return;
    assert.equal(presented.value.record.status, "applied");
    assert.equal(presented.value.resultTrunkVersion, 2);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.documents.proposal?.path, v2);
    assert.equal(status.manifest?.artifacts.documents.proposal?.sha256, v2sha);
    const verify = await rig.integration.trunk.verify();
    assert.deepEqual(verify, { ok: true, violations: [] });
    const freeze = rig.events.filter((event) => event.kind === "doc.freeze");
    assert.equal(freeze.length, 1);
    if (freeze[0]?.kind === "doc.freeze") assert.equal(freeze[0].reason, "version-upgrade-approved");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("version-change-runtime：detail 逐项卡（apply/keep）+ 预冻结 + trunk t2 + 事件", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const current = await rig.integration.trunk.current();
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, "version: 2\n# proposal v2\n");
    const team2 = "docs/scheduling/demo-team-v2.md";
    const team2sha = await writeProjectFile(rig.project.root, team2, "version: 2\n# team v2\n");
    const amendmentRel = "docs/proposals/demo-amendment-v1.md";
    await writeProjectFile(
      rig.project.root,
      amendmentRel,
      [
        "---",
        "schema: trunk-amendment/v1",
        "amendmentId: am-1",
        `flowId: ${FLOW_ID}`,
        "docVersion: 1",
        "baseTrunk:",
        `  trunkVersion: ${current!.trunkVersion}`,
        `  runId: ${rig.project.runId}`,
        `  digest: ${current!.digest}`,
        "items:",
        "  - itemId: it-1",
        "    kind: contract",
        "    change: modify",
        `    from: ${PATHS.proposal}`,
        `    to: ${v2}`,
        "  - itemId: it-2",
        "    kind: execution",
        "    change: modify",
        `    from: ${PATHS.teamPlan}`,
        `    to: ${team2}`,
        "---",
      ].join("\n"),
    );
    const validated = await rig.integration.trunk.validateAmendment({ amendmentDocPath: amendmentRel, flowId: FLOW_ID });
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const submitted = await rig.runtime.submit({
      kind: "detail-amendment",
      initiatorRoleId: "rapporteur",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [
        { kind: "contract", path: v2, action: "modify" },
        { kind: "execution", path: team2, action: "modify" },
      ],
      amendmentId: "am-1",
      amendmentDocPath: amendmentRel,
      amendmentItems: validated.value.items,
      summary: "detail",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true);
    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, true, presented.ok ? "" : `${presented.code}: ${presented.message ?? ""}`);
    if (!presented.ok) return;
    assert.equal(presented.value.needsItems, true);
    assert.equal(presented.value.record.status, "approved");

    const items = await rig.runtime.runAmendmentItems("vc-1");
    assert.equal(items.ok, true);
    if (!items.ok) return;
    assert.equal(items.value.cancelled, false);
    assert.equal(items.value.decisions.length, 2);
    // 第二项改判 kept（模拟客户不采纳执行项）
    const decisions = items.value.decisions.map((decision) =>
      decision.itemId === "it-2" ? { ...decision, choice: "item-keep" as const } : decision,
    );
    const applied = await rig.runtime.applyAmendmentItems("vc-1", { decisionId: "dec-items", decisions });
    assert.equal(applied.ok, true, applied.ok ? "" : `${applied.code}: ${applied.message ?? ""}`);
    if (!applied.ok) return;
    assert.equal(applied.value.resultTrunkVersion, 2);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.documents.proposal?.path, v2);
    assert.equal(status.manifest?.artifacts.execution.teamPlan?.path, PATHS.teamPlan); // kept 项保持旧工件
    const amendmentEvents = rig.events.filter((event) => event.kind === "trunk.amendment");
    assert.ok(amendmentEvents.length >= 3, JSON.stringify(eventKinds(rig.events)));
    const itemApplied = amendmentEvents.find(
      (event) => event.kind === "trunk.amendment" && event.itemId === "it-1",
    );
    if (itemApplied?.kind === "trunk.amendment") {
      assert.equal(itemApplied.itemResult, "applied");
      assert.equal(itemApplied.decidedBy, "customer");
    }
    const lifecycle = amendmentEvents.find(
      (event) => event.kind === "trunk.amendment" && event.status === "applied",
    );
    if (lifecycle?.kind === "trunk.amendment") {
      assert.equal(lifecycle.origin, "application");
      assert.equal(lifecycle.decidedBy, undefined);
      assert.equal(lifecycle.resultTrunkVersion, 2);
    }
    const versionApplied = rig.events.filter((event) => event.kind === "version.change").at(-1);
    if (versionApplied?.kind === "version.change") assert.equal(versionApplied.status, "applied");
    assert.equal(rig.presenterCalls.items, 2);
    assert.ok(team2sha.length === 64);
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("version-change-runtime：无卡通道 ⇒ vca-channel-unavailable，保持 submitted 可重试", async () => {
  const rig = await setup({ presenter: false });
  try {
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# v2\n");
    const submitted = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: null,
      bootstrap: true,
      targets: [{ kind: "contract", path: v2, action: "add" }],
      summary: "no channel",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true);
    const present = await rig.runtime.present("vc-1");
    assert.equal(present.ok, false);
    if (!present.ok) assert.equal(present.code, "vca-channel-unavailable");
    const records = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(records.find((record) => record.applicationId === "vc-1")?.status, "submitted");
    assert.ok(!rig.events.some((event) => event.kind === "version.change" && event.status === "approved"));
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("version-change-runtime：批准前 toSha256 漂移 ⇒ vca-hash-drift（不冻结/不 re-pin）", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# v2\n");
    assert.equal(
      (
        await rig.runtime.submit({
          kind: "version-upgrade",
          initiatorRoleId: "product",
          flowId: FLOW_ID,
          baseTrunk: (await rig.integration.trunk.current())!,
          targets: [{ kind: "contract", path: v2, action: "modify" }],
          summary: "drift",
          applicationId: "vc-1",
          at: AT,
        })
      ).ok,
      true,
    );
    await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# v2 changed\n");
    const present = await rig.runtime.present("vc-1");
    assert.equal(present.ok, false);
    if (!present.ok) assert.equal(present.code, "vca-hash-drift");
    const records = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(records.find((record) => record.applicationId === "vc-1")?.status, "submitted");
    assert.ok(!rig.events.some((event) => event.kind === "version.change" && event.status === "approved"));
    // 卡片已作答但批准失败必须回显（否则客户看不到任何失败信号、申请继续挂待批）。
    assert.equal(
      rig.notifications.some((message) => message.includes("处理失败") && message.includes("批准未完成")),
      true,
      JSON.stringify(rig.notifications),
    );
    const current = await rig.integration.trunk.current();
    assert.equal(current?.trunkVersion, 1, "trunk 指针未变");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("version-change-runtime：客户卡拒绝 ⇒ rejected（customer 事件，不冻结/不 re-pin）", async () => {
  const project = await createTrunkProject();
  try {
    const integration = createVersionChangeIntegration({
      projectRoot: project.root,
      now: () => new Date(AT),
      migrationCompleted: () => true,
      runRepin: createRunRepinPort(project.root),
    });
    const events: TaskStateEvent[] = [];
    const initiatorNotes: Array<{ roleId: string; message: string }> = [];
    const trunkRuntime = createTrunkRuntime({
      projectRoot: project.root,
      service: integration.trunk,
      emitEvent: async (event) => {
        events.push(event);
      },
      now: () => new Date(AT),
    });
    const runtime = createVersionChangeRuntime({
      projectRoot: project.root,
      services: integration.services,
      trunkService: integration.trunk,
      trunkRuntime,
      emitEvent: async (event) => {
        events.push(event);
      },
      presenter: {
        async presentVersionChange() {
          return { outcome: "answered", choice: "reject-version-change", decisionId: "dec-no" };
        },
      },
      notifyInitiator: (roleId, message) => {
        initiatorNotes.push({ roleId, message });
      },
      now: () => new Date(AT),
    });
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(project.root, v2, "---\nschema: project-proposal/v2\n---\n# v2\n");
    assert.equal(
      (
        await runtime.submit({
          kind: "version-upgrade",
          initiatorRoleId: "product",
          flowId: FLOW_ID,
          baseTrunk: null,
          bootstrap: true,
          targets: [{ kind: "contract", path: v2, action: "add" }],
          summary: "reject",
          applicationId: "vc-1",
          at: AT,
        })
      ).ok,
      true,
    );
    const presented = await runtime.present("vc-1");
    assert.equal(presented.ok, true);
    if (!presented.ok) return;
    assert.equal(presented.value.record.status, "rejected");
    const rejected = events.filter((event) => event.kind === "version.change").at(-1);
    if (rejected?.kind === "version.change") {
      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.origin, "customer");
      assert.equal(rejected.decidedBy, "customer");
      assert.equal(rejected.decisionId, "dec-no");
    }
    assert.equal(await integration.trunk.current(), null);
    assert.equal(
      initiatorNotes.some((note) => note.roleId === "product" && note.message.includes("已拒绝")),
      true,
      `发起人未收到拒绝回执：${JSON.stringify(initiatorNotes)}`,
    );
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

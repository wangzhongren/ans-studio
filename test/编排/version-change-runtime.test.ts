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
import { readRunManifest, writeRunManifest } from "../../src/common/编排/run-manifest.ts";
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

// P3.1 cancels the former ordinary customer approval/per-item cards. The original
// positive-card failures are preserved in evidence/30-O1-direct-submit.txt.
for (const existingTrunk of [false, true]) {
  test(`version-change-runtime: fresh ordinary submit cannot recreate customer cards (${existingTrunk ? "existing trunk" : "bootstrap"})`, async () => {
    const rig = await setup();
    try {
      if (existingTrunk) await bootstrap(rig);
      const before = await rig.integration.trunk.current();
      const runBefore = await readRunManifest(rig.project.root, rig.project.runId);
      const v2 = "docs/proposals/demo-proposal-v2.md";
      await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
      const submitted = await rig.runtime.submit({ kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW_ID,
        baseTrunk: before, ...(before === null ? { bootstrap: true } : {}), applicationId: "vc-1", summary: "Use direct submission",
        targets: [{ kind: "contract", path: v2, action: "add" }], at: AT2 });
      assert.equal(submitted.ok, false);
      if (!submitted.ok) assert.equal(submitted.code, "vca-channel-unavailable");
      assert.deepEqual(await rig.runtime.list(), []);
      assert.deepEqual(await rig.integration.trunk.current(), before);
      assert.deepEqual(await readRunManifest(rig.project.root, rig.project.runId), runBefore);
      assert.deepEqual(rig.presenterCalls, { versionChange: 0, items: 0 });
      assert.equal(rig.initiatorNotes.length, 0);
    } finally { await fs.rm(rig.project.root, { recursive: true, force: true }); }
  });
}

test("version-change-runtime: actual old pending request is readable, cannot be re-presented or settled by stale replies", async () => {
  const rig = await setup();
  try {
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const created = await rig.integration.services.vca.create({ kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW_ID,
      baseTrunk: null, bootstrap: true, applicationId: "vc-1", summary: "An actual historical pending request",
      targets: [{ kind: "contract", path: v2, action: "add" }], at: AT });
    assert.ok(created.ok, JSON.stringify(created));
    const submitted = await rig.integration.services.vca.submit({ applicationId: "vc-1", at: AT });
    assert.ok(submitted.ok, JSON.stringify(submitted));
    const before = await rig.integration.services.vca.list();
    assert.deepEqual(await rig.runtime.list(), before);
    for (const result of [await rig.runtime.present("vc-1"), await rig.runtime.approve("vc-1", "new-card-reply"),
      await rig.runtime.reject("vc-1", "new-card-reply"), await rig.runtime.runAmendmentItems("vc-1")]) assert.equal(result.ok, false);
    assert.deepEqual(await rig.integration.services.vca.list(), before, "No rewrite or auto-approval of historical pending bytes");
    assert.deepEqual(rig.presenterCalls, { versionChange: 0, items: 0 });
    assert.deepEqual(rig.events, []);
  } finally { await fs.rm(rig.project.root, { recursive: true, force: true }); }
});

test("version-change-runtime: no presenter or ordinary channel cannot turn an invalid request into approval", async () => {
  const rig = await setup({ presenter: false });
  try {
    const result = await rig.runtime.submit({ kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW_ID,
      baseTrunk: null, bootstrap: true, summary: "Missing document", targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v9.md", action: "add" }], at: AT });
    assert.equal(result.ok, false);
    assert.deepEqual(await rig.runtime.list(), []);
    assert.equal((await rig.runtime.present("vc-missing")).ok, false);
    assert.deepEqual(rig.events, []);
  } finally { await fs.rm(rig.project.root, { recursive: true, force: true }); }
});

test("version-change-runtime: a real persisted historical approval recovers original two-file quality without a new card or fabricated role evidence", async () => {
  const rig = await setup();
  try {
    await bootstrap(rig);
    const base = await rig.integration.trunk.current(); assert.ok(base);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    // Seed the persisted historical state through its actual storage/state machine, before recovery.
    assert.ok((await rig.integration.services.vca.create({ kind: "version-upgrade", initiatorRoleId: "product", flowId: FLOW_ID,
      baseTrunk: base, applicationId: "vc-2", summary: "Prior approved request", targets: [{ kind: "contract", path: v2, action: "add" }], at: AT })).ok);
    assert.ok((await rig.integration.services.vca.submit({ applicationId: "vc-2", at: AT })).ok);
    assert.ok((await rig.integration.services.vca.approve({ applicationId: "vc-2", decisionId: "historical-customer-decision", at: AT })).ok);
    const recovered = await rig.runtime.approve("vc-2", "historical-customer-decision");
    assert.ok(recovered.ok, JSON.stringify(recovered));
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 2);
    assert.deepEqual(rig.presenterCalls, { versionChange: 0, items: 0 });
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.frozenRoles, undefined);
    const run = await readRunManifest(rig.project.root, rig.project.runId); assert.ok(run.ok);
    // Existing two-file quality did not manufacture missing boundary.md or eight new pin refs.
    assert.equal(await fs.access(`${rig.project.root}/角色卡/impl/boundary.md`).then(() => true, () => false), false);
  } finally { await fs.rm(rig.project.root, { recursive: true, force: true }); }
});

// test/编排/trunk-upgrade-validation.test.ts
// E2 返工 S7：AC-5（version-upgrade 批准前/apply 前 schema/roster/D3/版本链校验，fail-closed）
// + AC-13（stable boundary 预览文本扩大检测 API）。
//
// 真实 S1 存储 + S2/S3/S4 链路 + fake presenter/事件；负例断言 VCA 保持提交前状态、无冻结、
// 无 re-pin、trunk 指针不变。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import type { TaskStateEvent } from "../../src/model/runtime.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import type { VersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { createRunRepinPort, createTrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { TrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { readRunManifest } from "../../src/common/编排/run-manifest.ts";
import {
  AT,
  AT2,
  FLOW_ID,
  PATHS,
  boundaryText,
  createTrunkProject,
  writeProjectFile,
  type TrunkProject,
} from "./fixtures/trunk-project.ts";

const ROSTER_V2_REFERENCING_V1 = [
  "---",
  "schema: project-roster/v3",
  `flowId: ${FLOW_ID}`,
  "version: 2",
  `intent: ${PATHS.intent}`,
  `proposal: ${PATHS.proposal}`,
  `architecture: ${PATHS.architecture}`,
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: 测试夹具",
  "roles:",
  "  - id: impl",
  "    displayName: 实现",
  "    purpose: 实现",
  "    capability: TS",
  "    modules:",
  "      - impl-core",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现模块",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.ts",
  `    architectureSource: ${PATHS.architecture}`,
  "---",
].join("\n");

interface Rig {
  project: TrunkProject;
  integration: ReturnType<typeof createVersionChangeIntegration>;
  trunkRuntime: TrunkRuntime;
  runtime: VersionChangeRuntime;
  events: TaskStateEvent[];
}

async function setup(options: { d3RoleIds?: string[] } = {}): Promise<Rig> {
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
  const boot = await trunkRuntime.bootstrap({
    flowId: FLOW_ID,
    runId: project.runId,
    applicationId: "vc-boot",
    decisionId: "dec-boot",
    target: project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: options.d3RoleIds ?? ["impl"] },
    roles: ["impl"],
    journalId: "j-boot",
    at: AT2,
  });
  assert.equal(boot.ok, true, boot.ok ? "" : `${boot.code}: ${boot.message ?? ""}`);
  events.length = 0;
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
        return { outcome: "answered", choice: "approve-version-change", decisionId: "dec-vca" };
      },
    },
    now: () => new Date(AT),
  });
  return { project, integration, trunkRuntime, runtime, events };
}

async function submitUpgrade(rig: Rig, targets: Array<{ kind: "contract" | "roster"; path: string; action: "add" | "modify" }>) {
  const current = await rig.integration.trunk.current();
  return rig.runtime.submit({
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: FLOW_ID,
    baseTrunk: current!,
    targets,
    summary: "upgrade",
    applicationId: "vc-1",
    at: AT,
  });
}

async function assertRejectedBeforeApproval(rig: Rig, expectedCode: string): Promise<void> {
  const presented = await rig.runtime.present("vc-1");
  assert.equal(presented.ok, false);
  if (!presented.ok) assert.equal(presented.code, expectedCode);
  const records = await rig.runtime.list({ flowId: FLOW_ID });
  assert.equal(records.find((record) => record.applicationId === "vc-1")?.status, "submitted", "保持 submitted");
  assert.ok(!rig.events.some((event) => event.kind === "version.change" && event.status === "approved"));
  const current = await rig.integration.trunk.current();
  assert.equal(current?.trunkVersion, 1, "trunk 指针不变");
  const run = await readRunManifest(rig.project.root, rig.project.runId);
  assert.equal(run.ok, true);
  if (run.ok) {
    assert.equal(run.manifest.documents.proposal?.path, PATHS.proposal, "run manifest 未 re-pin");
    assert.equal(run.manifest.repins ?? undefined, undefined);
  }
}

test("AC-5：无效 roster ⇒ 批准前拒绝（vca-target-invalid，不冻结/不 re-pin）", async () => {
  const rig = await setup();
  try {
    const rosterV2 = "docs/proposals/demo-roster-v2.md";
    await writeProjectFile(
      rig.project.root,
      rosterV2,
      "---\nschema: project-roster/v3\nflowId: demo\nversion: 2\nroles: not-an-array\n---\n",
    );
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, proposalV2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await submitUpgrade(rig, [
      { kind: "roster", path: rosterV2, action: "add" },
      { kind: "contract", path: proposalV2, action: "modify" },
    ]);
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);
    await assertRejectedBeforeApproval(rig, "vca-target-invalid");
    assert.equal(await rig.integration.services.freeze.entryOf(rosterV2), undefined, "未冻结目标");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("AC-5：D3 targetRoleIds 不在 roster ⇒ 批准前拒绝（vca-target-invalid）", async () => {
  const rig = await setup({ d3RoleIds: ["impl", "ghost"] });
  try {
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, proposalV2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await submitUpgrade(rig, [{ kind: "contract", path: proposalV2, action: "modify" }]);
    assert.equal(submitted.ok, true);
    await assertRejectedBeforeApproval(rig, "vca-target-invalid");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("AC-5：契约版本链不匹配（roster 引用 proposal v1 + target proposal v2）⇒ 拒绝", async () => {
  const rig = await setup();
  try {
    const rosterV2 = "docs/proposals/demo-roster-v2.md";
    await writeProjectFile(rig.project.root, rosterV2, ROSTER_V2_REFERENCING_V1);
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, proposalV2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await submitUpgrade(rig, [
      { kind: "roster", path: rosterV2, action: "add" },
      { kind: "contract", path: proposalV2, action: "modify" },
    ]);
    assert.equal(submitted.ok, true);
    await assertRejectedBeforeApproval(rig, "vca-target-invalid");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("AC-5：role-card 缺失 ⇒ 批准前拒绝（fail-closed）", async () => {
  const rig = await setup();
  try {
    await fs.rm(path.join(rig.project.root, PATHS.roleCard));
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, proposalV2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await submitUpgrade(rig, [{ kind: "contract", path: proposalV2, action: "modify" }]);
    assert.equal(submitted.ok, true);
    await assertRejectedBeforeApproval(rig, "vca-target-invalid");
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("AC-5：合法单契约升级仍可通过（roster 未变更 ⇒ 不做磁盘最新版强链校验）", async () => {
  const rig = await setup();
  try {
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, proposalV2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await submitUpgrade(rig, [{ kind: "contract", path: proposalV2, action: "modify" }]);
    assert.equal(submitted.ok, true);
    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, true, presented.ok ? "" : `${presented.code}: ${presented.message ?? ""}`);
    if (!presented.ok) return;
    assert.equal(presented.value.record.status, "applied");
    const run = await readRunManifest(rig.project.root, rig.project.runId);
    assert.equal(run.ok, true);
    if (run.ok) assert.equal(run.manifest.documents.proposal?.path, proposalV2);
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// —————————————— AC-13：stable boundary 预览文本扩大检测 ——————————————

test("AC-13：stable boundary 预览扩大/收窄/无变化/不可解析", async () => {
  const project = await createTrunkProject();
  try {
    const base = { projectRoot: project.root, roleId: "impl", fromPath: PATHS.boundary };
    const expanded = await project.service.detectStableBoundaryExpansion({ ...base, toYamlText: boundaryText(true) });
    assert.equal(expanded.expanded, true);
    assert.ok(expanded.expansions.some((entry) => entry.includes("test")));

    // 收窄：from 含 test/，to 不含 ⇒ 不扩大
    await writeProjectFile(project.root, PATHS.boundary, boundaryText(true));
    const narrowed = await project.service.detectStableBoundaryExpansion({ ...base, toYamlText: boundaryText(false) });
    assert.deepEqual(narrowed, { expanded: false, expansions: [] });

    const unchanged = await project.service.detectStableBoundaryExpansion({
      ...base,
      toYamlText: boundaryText(true),
    });
    assert.deepEqual(unchanged, { expanded: false, expansions: [] });

    const invalid = await project.service.detectStableBoundaryExpansion({
      ...base,
      toYamlText: "not-a-yaml: [",
    });
    assert.equal(invalid.expanded, true, "预览不可解析 ⇒ fail-closed");
    assert.ok(invalid.expansions.some((entry) => entry.startsWith("to-yaml-invalid")));
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

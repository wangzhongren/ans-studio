// test/编排/trunk-upgrade-validation.test.ts
// E2 返工 S7：AC-5（version-upgrade 校验：schema/roster/D3/版本链，fail-closed）
// + AC-13（stable boundary 预览文本扩大检测 API）。
//
// 2026-11-16（KR-29 B）：客户审批卡通道已关闭（api-spec:1227：ordinary submit/present no longer
// create customer approval cards）；旧 `runtime.submit({kind:"version-upgrade"})+present()` 用例
// 冻结名保留，断言按现行 `submitDirect`（真实操作 id + 显式 base + expectedFrom hash + 完整快照）
// 与 direct 事务语义重写：拒绝 ⇒ 结构化 receipt 码 vca-target-invalid、无冻结、无批准/应用记录、
// trunk 指针不变、旧 run 不 re-pin（direct 发布不重 pin 旧 run，api-spec:1227/1307）。
//
// 真实 S1 存储 + S2/S3/S4 链路 + fake presenter/事件；负例断言无冻结、无 re-pin、trunk 指针不变。

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
    // 直接发布成功后的幂等通知 sink（api-spec:1227）；测试桩只记录，不触网。
    notifyDirect: async () => {},
    presenter: {
      async presentVersionChange() {
        return { outcome: "answered", choice: "approve-version-change", decisionId: "dec-vca" };
      },
    },
    now: () => new Date(AT),
  });
  return { project, integration, trunkRuntime, runtime, events };
}

type UpgradeTarget = { kind: "contract" | "roster"; path: string; action: "add" | "modify" };

/** DirectActionReceipt 是 ok/拒绝联合：成功臂没有 errorCode，按存在性读取结构化拒绝码。 */
function receiptErrorCode(result: { receipt?: object }): string | undefined {
  const receipt = result.receipt;
  return receipt !== undefined && "errorCode" in receipt && typeof receipt.errorCode === "string" ? receipt.errorCode : undefined;
}

/**
 * 现行 direct 通道提交：真实 operationId + 显式 base（TrunkCommitRef `{version,digest}`）
 * + 每个目标的 expectedFromSha256（取自当前有效 trunk 槽位；新增目标为 null）。
 */
async function submitUpgrade(rig: Rig, targets: UpgradeTarget[], operationId = "vc-op-1") {
  const current = await rig.integration.trunk.current();
  assert.ok(current !== null, "setup 后必须存在有效 trunk 基線");
  const documents = (await rig.integration.trunk.status()).manifest?.artifacts.documents;
  const slotOf = (target: UpgradeTarget): "roster" | "proposal" | "modules" | "architecture" | "assets" | undefined => {
    if (target.kind === "roster") return "roster";
    return /-(proposal|modules|architecture|assets)-v[1-9]\d*\.md$/i.exec(target.path)?.[1]?.toLowerCase() as
      | "proposal" | "modules" | "architecture" | "assets" | undefined;
  };
  const expectedFromSha256 = (target: UpgradeTarget): string | null => {
    const slot = slotOf(target);
    return slot === undefined ? null : documents?.[slot]?.sha256 ?? null;
  };
  return rig.runtime.submitDirect!({
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: FLOW_ID,
    baseTrunk: { version: current.trunkVersion, digest: current.digest },
    targets: targets.map((target) => ({ ...target, expectedFromSha256: expectedFromSha256(target) })),
    summary: "upgrade",
    operationId,
  }, "product");
}

/** 拒绝的等价断言（原「批准前拒绝」）：无批准/应用记录或事件，trunk 指针与旧 run 均不变。 */
async function assertRejectedWithoutStateChange(rig: Rig): Promise<void> {
  const records = await rig.runtime.list({ flowId: FLOW_ID });
  assert.ok(
    !records.some((record) => record.status === "approved" || record.status === "applied"),
    "不得存在批准/应用记录",
  );
  assert.ok(
    !rig.events.some((event) => event.kind === "version.change" && (event.status === "approved" || event.status === "applied")),
    "不得发出批准/应用事件",
  );
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
    assert.equal(submitted.ok, false, "无效 roster 必须在 direct 提交内拒绝");
    assert.equal(submitted.status, "rejected");
    assert.equal(receiptErrorCode(submitted) ?? submitted.errorCode, "vca-target-invalid");
    assert.match(submitted.message ?? "", /roster 非法/);
    await assertRejectedWithoutStateChange(rig);
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
    assert.equal(submitted.ok, false, "D3 引用 roster 外角色必须在 direct 提交内拒绝");
    assert.equal(submitted.status, "rejected");
    assert.equal(receiptErrorCode(submitted) ?? submitted.errorCode, "vca-target-invalid");
    assert.match(submitted.message ?? "", /D3 targetRoleId 不在 roster：ghost/);
    await assertRejectedWithoutStateChange(rig);
  } finally {
    await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("AC-5：契约版本链不匹配（roster 引用 proposal v1 + target proposal v2）⇒ 拒绝", async () => {
  const rig = await setup();
  try {
    // 合法 body（含 topology 块）的 roster v2：frontmatter 仍引用 proposal v1（实际目标是 v2）。
    const rosterV1Text = await fs.readFile(path.join(rig.project.root, PATHS.roster), "utf8");
    const rosterV2 = "docs/proposals/demo-roster-v2.md";
    await writeProjectFile(rig.project.root, rosterV2, rosterV1Text.replace("version: 1", "version: 2"));
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, proposalV2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");
    const submitted = await submitUpgrade(rig, [
      { kind: "roster", path: rosterV2, action: "add" },
      { kind: "contract", path: proposalV2, action: "modify" },
    ]);
    assert.equal(submitted.ok, false, "版本链不匹配必须在 direct 提交内拒绝");
    assert.equal(submitted.status, "rejected");
    assert.equal(receiptErrorCode(submitted) ?? submitted.errorCode, "vca-target-invalid");
    assert.match(submitted.message ?? "", /契约版本链不匹配/);
    await assertRejectedWithoutStateChange(rig);
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
    // direct 提交在准备完整快照时即读取真实角色卡字节；缺失 ⇒ 快照证据不可得 ⇒ fail-closed。
    assert.equal(submitted.ok, false, "role-card 缺失必须 fail-closed");
    assert.equal(submitted.status, "rejected");
    assert.equal(receiptErrorCode(submitted) ?? submitted.errorCode, "vca-target-invalid");
    assert.match(submitted.message ?? "", /role-card\.md/);
    await assertRejectedWithoutStateChange(rig);
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
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.errorCode}: ${submitted.message ?? ""}`);
    assert.equal(submitted.status, "applied");
    const records = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(
      records.find((record) => record.applicationId === submitted.applicationId)?.status,
      "applied",
      "合法升级直接应用",
    );
    const current = await rig.integration.trunk.current();
    assert.equal(current?.trunkVersion, 2, "trunk 指针前移");
    // direct 文档发布不重 pin 旧 run（api-spec:1227「不重 pin 旧 run」）：run 引用保持冻结基线。
    const run = await readRunManifest(rig.project.root, rig.project.runId);
    assert.equal(run.ok, true);
    if (run.ok) {
      assert.equal(run.manifest.documents.proposal?.path, PATHS.proposal, "旧 run 不被 direct 发布重 pin");
      assert.equal(run.manifest.repins ?? undefined, undefined);
    }
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

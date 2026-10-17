// test/测试/governance-trio-verify/c-migration.test.ts
// 独立端到端验收（测试角色，2026-10-17）：su → trio 显式迁移（V1b）。
//
// 依据：评审 §5.5/§5.7/§九-12；覆盖：预览零写入、确认后只改 `.ans` 的 governanceModel（保留未知字段/
// roles/pin）、manifest 留痕、账本 governance.migrated、迁移后 su 隐藏/不可开启/历史保留；
// already-trio / no-record / preview-stale / write-failed。全部离线临时目录。

import { test } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import path from "node:path";

import {
  migrateGovernanceModel,
  previewGovernanceMigration,
} from "../../../src/pipeline/orchestration/govern-session.ts";
import { flushGovernanceLedger, readGovernanceLedger } from "../../../src/pipeline/orchestration/govern-session.ts";
import { listProject, resolveGovernanceRole, resolveRole } from "../../../src/service/role/resolve-role.ts";
import { buildEffectiveProjectConfig, buildProjectConfig } from "../../../app/desktop/project.ts";
import { loadEffectiveConfig } from "../../../src/common/shared/config-loader.ts";
import { GOV_REL, exists, makeRoot, read, sha256, snapshotTree, write, writeProjectRole } from "./fixture.ts";

const MANIFEST = "docs/bootstrap-manifest.md";
const ANS = ".ans/project.json";
const GOV_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: directory",
  "    path: 角色卡/",
  "    root: project",
  "    purpose: 角色目录",
  "  - kind: directory",
  "    path: docs/",
  "    root: project",
  "    purpose: 项目文档",
  "  - kind: directory",
  "    path: .ans/",
  "    root: project",
  "    purpose: 配置与 pin",
  "",
].join("\n");

interface Seeded {
  record: Record<string, unknown>;
  ansText: string;
  manifestText: string | null;
  govText: string;
  roleHashes: Record<string, string>;
}

/** 旧 single 项目：角色目录 + 治理边界 + 真实 pin + 未知字段 + 历史 docs/su。 */
function seedSingleProject(root: string, opts: { withManifest?: boolean; withDocs?: boolean } = {}): Seeded {
  writeProjectRole(root, "A");
  writeProjectRole(root, "B");
  write(root, GOV_REL, GOV_YAML);
  const withManifest = opts.withManifest ?? true;
  const withDocs = opts.withDocs ?? true;
  if (withDocs) write(root, "docs/su/memo.md", "# su 历史备忘\n\n迁移后仍应保留。\n");
  const manifestText = withManifest ? "# Bootstrap 留痕（创世 finalize）\n\n- 既有记录\n" : null;
  if (manifestText !== null) write(root, MANIFEST, manifestText);

  const govSha = sha256(GOV_YAML);
  const record: Record<string, unknown> = {
    projectRoot: root.split(path.sep).join("/"),
    skillRoot: root.split(path.sep).join("/"),
    schemaVersion: 7,
    custom: { keep: ["x", 1, true], nested: { ok: true } },
    roles: {
      A: { card: "角色卡/A/role-card.md", boundary: "角色卡/A/boundary.yaml" },
      B: { card: "角色卡/B/role-card.md", boundary: "角色卡/B/boundary.yaml" },
    },
    governanceBoundary: {
      path: GOV_REL,
      acceptance: {
        accepted: true,
        source: "test:旧项目 pin",
        pin: [
          { path: GOV_REL, sha256: govSha },
          { path: "角色卡/A/boundary.yaml", sha256: sha256(read(root, "角色卡/A/boundary.yaml")) },
          { path: "角色卡/B/boundary.yaml", sha256: sha256(read(root, "角色卡/B/boundary.yaml")) },
        ],
      },
    },
  };
  const ansText = JSON.stringify(record, null, 2) + "\n";
  write(root, ANS, ansText);
  const roleHashes: Record<string, string> = {
    [GOV_REL]: govSha,
    "角色卡/A/role-card.md": sha256(read(root, "角色卡/A/role-card.md")),
    "角色卡/A/boundary.yaml": sha256(read(root, "角色卡/A/boundary.yaml")),
    "角色卡/B/role-card.md": sha256(read(root, "角色卡/B/role-card.md")),
    "角色卡/B/boundary.yaml": sha256(read(root, "角色卡/B/boundary.yaml")),
  };
  return { record, ansText, manifestText, govText: GOV_YAML, roleHashes };
}

async function effectiveOf(root: string) {
  const listing = await listProject(root);
  return buildEffectiveProjectConfig(listing, { buildProjectConfig, loadEffectiveConfig });
}

// —————————————————————— 1) 预览零写入 ——————————————————————

test("迁移预览：零写入、模型/写路径/摘要/保留文件如实；不存在的记录 → no-record", async () => {
  const { root, cleanup } = makeRoot("mig-preview");
  const empty = makeRoot("mig-no-record");
  try {
    const seeded = seedSingleProject(root);
    const before = snapshotTree(root);
    const preview = await previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;
    assert.deepEqual(snapshotTree(root), before, "预览必须零写入（含目录）");
    assert.equal(preview.preview.model, "single");
    assert.equal(preview.preview.targetModel, "trio");
    assert.deepEqual(preview.preview.writePaths, [ANS, MANIFEST], "只写这两条路径");
    assert.equal(preview.preview.modelField, null, "旧 `.ans` 无 governanceModel 字段 ⇒ null");
    assert.equal(preview.preview.manifestLine, "治理模型升级（su → trio）");
    assert.deepEqual(preview.preview.pinChanges, [], "V1b 不重算 pin");
    assert.match(preview.preview.snapshotDigest, /^[0-9a-f]{64}$/);
    for (const rel of [GOV_REL, "角色卡/A/boundary.yaml", "角色卡/B/boundary.yaml", "docs/su/memo.md"]) {
      assert.ok(preview.preview.retainedFiles.includes(rel), `保留文件应列出 ${rel}`);
    }
    assert.equal(preview.preview.retainedFiles.includes(ANS), false, "待写路径不列为保留文件");

    // 预览不改 manifest / .ans 的字节（逐字节）。
    assert.equal(read(root, ANS), seeded.ansText);
    assert.equal(read(root, MANIFEST), seeded.manifestText);

    const none = await previewGovernanceMigration({ projectRoot: empty.root });
    assert.equal(none.ok, false);
    if (!none.ok) assert.equal(none.code, "no-record");
    assert.deepEqual(snapshotTree(empty.root), [], "no-record 预览零写入");
    const noneWrite = await migrateGovernanceModel({
      projectRoot: empty.root,
      confirm: true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(noneWrite.status, "no-record");
    assert.equal(noneWrite.phase, "guard");
    assert.deepEqual(snapshotTree(empty.root), [], "no-record 迁移零写入");
  } finally {
    cleanup();
    empty.cleanup();
  }
});

// —————————————————————— 2) 确认迁移：只改 model，保留一切 ——————————————————————

test("确认迁移：`.ans` 仅增/改 governanceModel（未知字段/roles/pin 原样）、manifest 留痕、账本 governance.migrated", async () => {
  const { root, cleanup } = makeRoot("mig-confirm");
  try {
    const seeded = seedSingleProject(root);
    const preview = await previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;

    const result = await migrateGovernanceModel({
      projectRoot: root,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.phase, "write");
    assert.equal(result.status, "completed");
    assert.equal(result.model, "trio");

    const migrated = JSON.parse(read(root, ANS)) as Record<string, unknown>;
    assert.equal(migrated.governanceModel, "trio");
    // 其余字段逐项原样（含未知字段/roles/pin）。
    for (const [key, value] of Object.entries(seeded.record)) {
      assert.deepEqual(migrated[key], value, `字段 ${key} 必须原样保留`);
    }
    assert.deepEqual(Object.keys(migrated).sort(), [...Object.keys(seeded.record), "governanceModel"].sort(), "只新增 governanceModel");

    // 角色卡/边界/治理边界文档字节未变；不建 角色卡/su/。
    for (const [rel, hash] of Object.entries(seeded.roleHashes)) {
      assert.equal(sha256(read(root, rel)), hash, `迁移不得改 ${rel}`);
    }
    assert.equal(exists(root, "角色卡/su"), false, "迁移不得创建 角色卡/su/");
    assert.ok(exists(root, "docs/su/memo.md"), "历史 docs/su/** 保留");

    // manifest：既有全文保留 + 升级留痕（旧/新模型、变更文件、旧/新哈希）。
    const manifest = read(root, MANIFEST);
    assert.ok(manifest.startsWith(seeded.manifestText!), "既有 manifest 全文逐字节保留在前");
    assert.ok(manifest.includes("治理模型升级（su → trio）"));
    assert.match(manifest, /旧模型：single/);
    assert.match(manifest, /新模型：trio/);
    assert.ok(manifest.includes(`变更文件：${ANS}、${MANIFEST}`));
    assert.match(manifest, /\.ans 旧哈希（SHA-256）：[0-9a-f]{64}/);
    assert.match(manifest, /\.ans 新哈希（SHA-256）：[0-9a-f]{64}/);
    assert.ok(manifest.includes("客户确认：桌面应用操作者显式确认（confirm:true）"));
    // 旧哈希 = 迁移前 `.ans` 原始字节；新哈希 = 迁移后字节（独立复算）。
    assert.ok(manifest.includes(`.ans 旧哈希（SHA-256）：${sha256(seeded.ansText)}`), "旧哈希须等于迁移前字节哈希");
    assert.ok(manifest.includes(`.ans 新哈希（SHA-256）：${sha256(read(root, ANS))}`), "新哈希须等于迁移后字节哈希");

    // 账本：governance.migrated（action=migrate + previewDigest）。
    await flushGovernanceLedger(root);
    const ledger = await readGovernanceLedger(root);
    const migratedEntry = ledger.entries.find((e) => e.kind === "governance.migrated");
    assert.ok(migratedEntry, "应写 governance.migrated");
    assert.equal(migratedEntry!.actorRoleId, "app");
    assert.equal(migratedEntry!.power, "app");
    assert.equal(migratedEntry!.decisionEvidence?.kind, "desktop-governance-record");
    assert.equal(migratedEntry!.decisionEvidence?.action, "migrate");
    assert.equal(migratedEntry!.decisionEvidence?.previewDigest, preview.preview.snapshotDigest);
  } finally {
    cleanup();
  }
});

// —————————————————————— 3) 迁移后：su 隐藏/不可开启，历史仍在 ——————————————————————

test("迁移后：listProject 无 su、三内置顺序不变；su 不可开启（resolveRole/resolveGovernanceRole）；治理模型来自 `.ans`", async () => {
  const { root, cleanup } = makeRoot("mig-after");
  try {
    seedSingleProject(root);
    const preview = await previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(
      (await migrateGovernanceModel({ projectRoot: root, confirm: true, previewDigest: preview.preview.snapshotDigest })).status,
      "completed",
    );

    const listing = await listProject(root);
    assert.equal(listing.governanceModel, "trio");
    assert.equal(listing.primaryRoleId, "rapporteur");
    assert.deepEqual(
      listing.roles.map((r) => r.roleId),
      ["rapporteur", "nominator", "convener", "A", "B"],
      "trio 三内置在前、项目角色保留",
    );
    assert.equal(listing.roles.some((r) => r.roleId === "su"), false, "迁移后 su 从列表消失");

    const { project } = await effectiveOf(root);
    assert.equal(project.governanceModel, "trio", "载入器把 `.ans` 的 governanceModel 带进 ProjectConfig");
    await assert.rejects(() => resolveRole("su", project), /已归档（当前为三权治理模型），不可开启/);
    assert.throws(() => resolveGovernanceRole(listing, { roleId: "su" }), /su 已归档/);
    assert.ok(exists(root, "docs/su/memo.md"), "历史会话/记录保留（只读）");
    assert.equal(exists(root, "角色卡/su"), false);
  } finally {
    cleanup();
  }
});

// —————————————————————— 4) 失败分支 ——————————————————————

test("already-trio：再次预览/迁移均拒，零写入、不重复写 manifest/账本", async () => {
  const { root, cleanup } = makeRoot("mig-already");
  try {
    seedSingleProject(root);
    const preview = await previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    await migrateGovernanceModel({ projectRoot: root, confirm: true, previewDigest: preview.preview.snapshotDigest });
    const before = snapshotTree(root);
    const preview2 = await previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview2.ok, false);
    if (!preview2.ok) assert.equal(preview2.code, "already-trio");
    const again = await migrateGovernanceModel({
      projectRoot: root,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(again.status, "already-trio");
    assert.equal(again.phase, "guard");
    assert.equal(again.model, "trio");
    assert.deepEqual(snapshotTree(root), before, "already-trio 零写入");
  } finally {
    cleanup();
  }
});

test("preview-stale：预览后 `.ans` 变化 → 拒且零写入", async () => {
  const { root, cleanup } = makeRoot("mig-stale");
  try {
    seedSingleProject(root);
    const preview = await previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    const before = snapshotTree(root);
    // 预览后改变 `.ans`（例如外部编辑）。
    write(root, ANS, read(root, ANS).replace('"schemaVersion": 7', '"schemaVersion": 8'));
    const afterEdit = snapshotTree(root);
    const result = await migrateGovernanceModel({
      projectRoot: root,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(result.status, "preview-stale");
    assert.equal(result.phase, "guard");
    assert.deepEqual(snapshotTree(root), afterEdit, "preview-stale 不得再写入");
    assert.notDeepEqual(afterEdit, before, "对照：本用例确实改变了盘面");
  } finally {
    cleanup();
  }
});

test("write-failed：manifest 写入阶段失败 → phase=write、`.ans` 已迁移、如实说明可能部分写入", async () => {
  const { root, cleanup } = makeRoot("mig-write-failed");
  try {
    seedSingleProject(root, { withManifest: false, withDocs: false });
    const preview = await previewGovernanceMigration({ projectRoot: root });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;
    // 预览后把 `docs` 变成文件：readManifest 视 ENOTDIR 为缺失（摘要不变），写入阶段 mkdir 失败。
    write(root, "docs", "not a directory");
    const result = await migrateGovernanceModel({
      projectRoot: root,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "write");
    assert.equal(result.status, "write-failed");
    assert.equal(result.model, "trio", "`.ans` 已写入 ⇒ 模型如实 trio");
    assert.match(result.message, /写入中断/);
    assert.match(result.message, /可能已写入部分文件/);
    assert.match(result.message, /请核对现场/);
    assert.equal((JSON.parse(read(root, ANS)) as Record<string, unknown>).governanceModel, "trio");
    assert.equal(statSync(path.join(root, "docs")).isFile(), true, "manifest 未写出（docs 仍是文件）");
  } finally {
    cleanup();
  }
});

// test/编排/governance-migration.test.ts
// 编排角色自测：**V1b 治理模型 `su → trio` 显式迁移**（评审 `2026-10-17_design_governance-trio-review.md`
// §3.2/§5.5/§5.7/§九-12）。
//
// 覆盖：
//   ① `previewGovernanceMigration` 零写入与形状（model/targetModel/writePaths/modelField/manifestLine/
//      pinChanges/retainedFiles/snapshotDigest）；
//   ② `migrateGovernanceModel` 确认后 `.ans` **仅增/改 `governanceModel`**（未知字段/roles/source/pin 全保留）、
//      manifest 留痕、账本 `governance.migrated`、pin/角色卡/旧 docs/su 不变、不建 `角色卡/su/`；
//   ③ already-trio / no-record / blocked（坏 `.ans`、manifest 不可读）/ preview-stale / busy /
//      write-failed / invalid-request；
//   ④ 旧 single 行为不变（不迁移时 `.ans` 无 `governanceModel` 字段）。
//
// 全部用系统临时目录，用后清理——不在仓库留文件。命令：
//   node --test "test/编排/**/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GOVERNANCE_MIGRATION_MANIFEST_HEADING as HEADING,
  migrateGovernanceModel,
  previewGovernanceMigration,
} from "../../src/common/编排/governance-migration.ts";
import { renderGovernanceBoundaryDoc } from "../../src/common/编排/finalize.ts";
import {
  flushGovernanceLedger,
  readGovernanceLedger,
} from "../../src/common/编排/governance-ledger.ts";

const GOV_REL = "角色卡/governance-boundary.yaml";
const ANS_REL = ".ans/project.json";
const MANIFEST_REL = "docs/bootstrap-manifest.md";

interface AnsRecord {
  projectRoot: string;
  skillRoot: string;
  roles: Record<string, { card: string; boundary: string }>;
  governanceBoundary: {
    path: string;
    acceptance: { accepted: boolean; source: string; pin: { path: string; sha256: string }[] };
  };
  governanceModel?: unknown;
  [unknownField: string]: unknown;
}

async function withTarget<T>(fn: (target: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-governance-migration-"));
  const target = join(root, "proj");
  mkdirSync(target, { recursive: true });
  try {
    return await fn(target);
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

function sha256OfFile(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function writeRole(target: string, id = "alpha"): void {
  const dir = join(target, "角色卡", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "role-card.md"), `# ${id}\n\n测试角色。\n`, "utf8");
  writeFileSync(
    join(dir, "boundary.yaml"),
    `role: ${id}\nentries:\n  - kind: file\n    path: src/${id}.ts\n    purpose: 测试角色条目\n`,
    "utf8",
  );
}

function writeGovernanceDoc(target: string): void {
  mkdirSync(join(target, "角色卡"), { recursive: true });
  writeFileSync(join(target, GOV_REL), renderGovernanceBoundaryDoc(), "utf8");
}

/** 写一份结构上可用的 `.ans/project.json`（single 形状：默认无 `governanceModel` 字段）。 */
function writeUsableAns(
  target: string,
  opts: { governanceModel?: unknown; extra?: Record<string, unknown> } = {},
): void {
  mkdirSync(join(target, ".ans"), { recursive: true });
  const pinPaths = [GOV_REL, "角色卡/alpha/boundary.yaml"].filter((rel) => existsSync(join(target, rel)));
  const record: AnsRecord = {
    projectRoot: target,
    skillRoot: target,
    roles: { alpha: { card: "角色卡/alpha/role-card.md", boundary: "角色卡/alpha/boundary.yaml" } },
    governanceBoundary: {
      path: GOV_REL,
      acceptance: {
        accepted: true,
        source: "test:既有有效记录",
        pin: pinPaths.map((rel) => ({ path: rel, sha256: sha256OfFile(join(target, rel)) })),
      },
    },
    legacyUnknown: { keep: [1, 2, 3], note: "迁移必须保留" },
    ...(opts.extra ?? {}),
    ...(opts.governanceModel !== undefined ? { governanceModel: opts.governanceModel } : {}),
  };
  writeFileSync(join(target, ANS_REL), JSON.stringify(record, null, 2) + "\n", "utf8");
}

function readAns(target: string): AnsRecord {
  return JSON.parse(readFileSync(join(target, ANS_REL), "utf8")) as AnsRecord;
}

/** 整棵树的「相对路径 → 内容哈希」快照（预览/拒绝必须零写入）。 */
function snapshotTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (absDir: string, relDir: string): void => {
    let dirents;
    try {
      dirents = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const rel = relDir === "" ? d.name : `${relDir}/${d.name}`;
      const abs = join(absDir, d.name);
      if (d.isDirectory()) walk(abs, rel);
      else if (d.isFile()) out.set(rel, sha256OfFile(abs));
    }
  };
  walk(root, "");
  return out;
}

function assertSameTree(before: Map<string, string>, root: string, message: string): void {
  assert.deepEqual(snapshotTree(root), before, message);
}

/** 标准夹具：角色 + 治理边界文档 + `.ans` + 旧 `docs/su/**`。 */
function seedProject(target: string): void {
  writeRole(target);
  writeGovernanceDoc(target);
  mkdirSync(join(target, "docs", "su"), { recursive: true });
  writeFileSync(join(target, "docs", "su", "notes.md"), "# 旧 su 历史\n\n只读保留。\n", "utf8");
  writeUsableAns(target);
}

// —————————————————————————————— ① 预览：零写入与形状 ——————————————————————————————

test("preview：零写入；形状完整；retainedFiles 列既有角色卡/边界/治理文档/旧 docs/su", async () => {
  await withTarget(async (target) => {
    seedProject(target);
    const before = snapshotTree(target);

    const result = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    const p = result.preview;

    assert.equal(p.model, "single");
    assert.equal(p.targetModel, "trio");
    assert.deepEqual(p.writePaths, [ANS_REL, MANIFEST_REL]);
    assert.equal(p.modelField, null, "旧 single 形状：字段缺失");
    assert.equal(p.manifestLine, HEADING);
    assert.equal(p.manifestLine, "治理模型升级（su → trio）");
    assert.deepEqual(p.pinChanges, [], "迁移不重算 pin");
    assert.match(p.snapshotDigest, /^[0-9a-f]{64}$/);

    for (const rel of [
      GOV_REL,
      "角色卡/alpha/role-card.md",
      "角色卡/alpha/boundary.yaml",
      "docs/su/notes.md",
    ]) {
      assert.ok(p.retainedFiles.includes(rel), `retainedFiles 应含 ${rel}：${JSON.stringify(p.retainedFiles)}`);
    }
    assert.equal(new Set(p.retainedFiles).size, p.retainedFiles.length, "retainedFiles 不得重复");

    assertSameTree(before, target, "预览必须零写入");
    assert.equal(existsSync(join(target, ".ans", "governance")), false, "预览不得建账本目录");
  });
});

test("preview：显式 single 字段 → modelField='single'；模型仍为 single", async () => {
  await withTarget(async (target) => {
    writeRole(target);
    writeGovernanceDoc(target);
    writeUsableAns(target, { governanceModel: "single" });

    const result = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) assert.equal(result.preview.modelField, "single");
  });
});

// —————————————————————————————— ② 确认迁移 ——————————————————————————————

test("migrate：`.ans` 仅增 governanceModel、未知字段/roles/source/pin 全保留；manifest/账本留痕；旧文件不变", async () => {
  await withTarget(async (target) => {
    seedProject(target);
    const oldRaw = readFileSync(join(target, ANS_REL), "utf8");
    const oldDoc = readAns(target);
    const oldHash = sha256OfFile(join(target, ANS_REL));
    const roleCardHash = sha256OfFile(join(target, "角色卡", "alpha", "role-card.md"));
    const roleBoundaryHash = sha256OfFile(join(target, "角色卡", "alpha", "boundary.yaml"));
    const govHash = sha256OfFile(join(target, GOV_REL));
    const suNoteHash = sha256OfFile(join(target, "docs", "su", "notes.md"));

    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;

    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.phase, "write");
    assert.equal(result.status, "completed");
    assert.equal(result.model, "trio");

    // `.ans`：只增/改 governanceModel；其余（含未知字段）逐值不变。
    const newDoc = readAns(target);
    assert.equal(newDoc.governanceModel, "trio");
    const { governanceModel: _ignored, ...rest } = newDoc;
    assert.deepEqual(rest, oldDoc, "除 governanceModel 外不得改动任何字段");
    assert.notEqual(readFileSync(join(target, ANS_REL), "utf8"), oldRaw, "应实际写入");

    // manifest：升级节 + 时间 + 旧/新模型 + 变更文件 + `.ans` 新旧哈希。
    const manifest = readFileSync(join(target, MANIFEST_REL), "utf8");
    assert.ok(manifest.includes(`## ${HEADING}`), "manifest 应有升级节");
    assert.match(manifest, /- 时间：\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
    assert.ok(manifest.includes("- 旧模型：single"));
    assert.ok(manifest.includes("- 新模型：trio"));
    assert.ok(manifest.includes(ANS_REL));
    assert.ok(manifest.includes(MANIFEST_REL));
    assert.ok(manifest.includes(oldHash), "manifest 应含 `.ans` 旧哈希");
    const newHash = sha256OfFile(join(target, ANS_REL));
    assert.ok(manifest.includes(newHash), "manifest 应含 `.ans` 新哈希");

    // 账本：`governance.migrated`（app / migrate / previewDigest）。
    await flushGovernanceLedger(target);
    const ledger = await readGovernanceLedger(target);
    assert.deepEqual(ledger.errors, []);
    const migrated = ledger.entries.filter((e) => e.kind === "governance.migrated");
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].actorRoleId, "app");
    assert.equal(migrated[0].power, "app");
    assert.equal(migrated[0].decisionEvidence?.action, "migrate");
    assert.equal(migrated[0].decisionEvidence?.previewDigest, preview.preview.snapshotDigest);

    // 不重写角色卡/边界/治理文档/旧 docs/su；pin 不变；不建 `角色卡/su/`。
    assert.equal(sha256OfFile(join(target, "角色卡", "alpha", "role-card.md")), roleCardHash);
    assert.equal(sha256OfFile(join(target, "角色卡", "alpha", "boundary.yaml")), roleBoundaryHash);
    assert.equal(sha256OfFile(join(target, GOV_REL)), govHash);
    assert.equal(sha256OfFile(join(target, "docs", "su", "notes.md")), suNoteHash);
    assert.deepEqual(
      readAns(target).governanceBoundary.acceptance.pin,
      oldDoc.governanceBoundary.acceptance.pin,
      "pin 必须原样保留",
    );
    assert.equal(existsSync(join(target, "角色卡", "su")), false, "不得创建 角色卡/su/");
  });
});

test("migrate：显式 single 字段 → 覆盖为 trio，其余字段不变", async () => {
  await withTarget(async (target) => {
    writeRole(target);
    writeGovernanceDoc(target);
    writeUsableAns(target, { governanceModel: "single" });
    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;
    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(readAns(target).governanceModel, "trio");
  });
});

// —————————————————————————————— ③ 守卫 ——————————————————————————————

test("already-trio：preview/migrate 均拒，零写入、不重复写 manifest/账本", async () => {
  await withTarget(async (target) => {
    writeRole(target);
    writeGovernanceDoc(target);
    writeUsableAns(target, { governanceModel: "trio" });
    const before = snapshotTree(target);

    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.equal(preview.code, "already-trio");

    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.status, "already-trio");
    assert.equal(result.model, "trio");

    assertSameTree(before, target, "already-trio 必须零写入");
  });
});

test("no-record：preview/migrate 均回 no-record，零写入", async () => {
  await withTarget(async (target) => {
    writeRole(target);
    writeGovernanceDoc(target);
    const before = snapshotTree(target);

    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.equal(preview.code, "no-record");

    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.status, "no-record");

    assertSameTree(before, target, "no-record 必须零写入");
  });
});

test("blocked：`.ans` 不可解析 → preview invalid-record / migrate blocked，零写入", async () => {
  await withTarget(async (target) => {
    mkdirSync(join(target, ".ans"), { recursive: true });
    writeFileSync(join(target, ANS_REL), "{ not json", "utf8");
    const before = snapshotTree(target);

    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.equal(preview.code, "invalid-record");

    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.status, "blocked");

    assertSameTree(before, target, "坏 `.ans` 必须零写入");
  });
});

test("blocked：manifest 路径不可读（是目录）→ preview/migrate blocked，零写入", async () => {
  await withTarget(async (target) => {
    writeRole(target);
    writeGovernanceDoc(target);
    writeUsableAns(target);
    mkdirSync(join(target, MANIFEST_REL), { recursive: true });
    const before = snapshotTree(target);

    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, false, JSON.stringify(preview));
    if (!preview.ok) assert.equal(preview.code, "blocked");

    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "blocked");

    assertSameTree(before, target, "manifest 不可读必须零写入");
  });
});

test("preview-stale：预览后 `.ans` 变化 → 拒且零写入", async () => {
  await withTarget(async (target) => {
    seedProject(target);
    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;

    // 外部改动 `.ans`（仍是合法 JSON）。
    const changed = readFileSync(join(target, ANS_REL), "utf8").replace('"test:既有有效记录"', '"test:外部改动"');
    writeFileSync(join(target, ANS_REL), changed, "utf8");
    const before = snapshotTree(target);

    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.status, "preview-stale");

    assertSameTree(before, target, "preview-stale 必须零写入");
    assert.equal(existsSync(join(target, MANIFEST_REL)), false);
  });
});

test("busy：迁移在飞 → preview 与第二次 migrate 均 busy；首个迁移正常完成（共用 establish/reaccept 锁）", async () => {
  await withTarget(async (target) => {
    seedProject(target);
    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;

    // migrate 在首次 await 前占位 ⇒ 紧随其后的调用可确定性观察到 busy。
    const first = migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    const concurrentPreview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(concurrentPreview.ok, false);
    if (!concurrentPreview.ok) assert.equal(concurrentPreview.code, "busy");

    const second = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(second.ok, false);
    assert.equal(second.phase, "guard");
    assert.equal(second.status, "busy");

    const done = await first;
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(done.status, "completed");
  });
});

test("write-failed：manifest 写入阶段失败 → phase:'write'，`.ans` 已落盘且如实说明可能部分写入", async () => {
  await withTarget(async (target) => {
    writeRole(target);
    writeGovernanceDoc(target);
    writeUsableAns(target); // 无 docs 目录、无 manifest
    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;

    // 预览后把 `docs` 变成**文件**：readManifest 视 ENOTDIR 为缺失（摘要不变），写入阶段 mkdir 失败。
    writeFileSync(join(target, "docs"), "not a directory", "utf8");

    const result = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: preview.preview.snapshotDigest,
    });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "write", "写入阶段失败不得被当作零写入的 guard 拒绝");
    assert.equal(result.status, "write-failed");
    assert.equal(result.model, "trio", "`.ans` 已写入时模型如实为 trio");
    assert.match(result.message, /写入中断/);
    assert.match(result.message, /可能已写入部分文件/);
    assert.match(result.message, /请核对现场/);

    // 如实：`.ans` 已迁移（先写），manifest 未写出。
    assert.equal(readAns(target).governanceModel, "trio");
    assert.equal(existsSync(join(target, MANIFEST_REL)), false);
  });
});

test("invalid-request：projectRoot 缺失 / confirm 非 true / previewDigest 非 64 hex，均零写入", async () => {
  const missing = await previewGovernanceMigration({ projectRoot: "   " });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "invalid-request");

  await withTarget(async (target) => {
    seedProject(target);
    const before = snapshotTree(target);

    const noConfirm = await migrateGovernanceModel({
      projectRoot: target,
      confirm: false as unknown as true,
      previewDigest: "a".repeat(64),
    });
    assert.equal(noConfirm.ok, false);
    assert.equal(noConfirm.status, "invalid-request");

    const badDigest = await migrateGovernanceModel({
      projectRoot: target,
      confirm: true,
      previewDigest: "xyz",
    });
    assert.equal(badDigest.ok, false);
    assert.equal(badDigest.status, "invalid-request");

    assertSameTree(before, target, "invalid-request 必须零写入");
  });
});

// —————————————————————————————— ④ 旧 single 行为不变 ——————————————————————————————

test("旧 single：不迁移时 `.ans` 无 governanceModel 字段；preview 仍如实显示 single", async () => {
  await withTarget(async (target) => {
    seedProject(target);
    const doc = readAns(target);
    assert.equal(Object.prototype.hasOwnProperty.call(doc, "governanceModel"), false);

    const preview = await previewGovernanceMigration({ projectRoot: target });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (preview.ok) {
      assert.equal(preview.preview.model, "single");
      assert.equal(preview.preview.modelField, null);
    }
    assert.equal(
      Object.prototype.hasOwnProperty.call(readAns(target), "governanceModel"),
      false,
      "预览不得写入字段",
    );
  });
});

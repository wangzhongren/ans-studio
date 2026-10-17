// test/编排/governance-record.test.ts
// 编排角色自测：**已有角色但无治理记录的项目「建立治理记录」**（I3，2026-10-17）。
// 依据 PM 评审 `2026-10-17_design_existing-project-compat-review.md` §四.3/§四.4/§四.6。
//
// 覆盖：
//   ① preview：S1 正常（三写路径 + pin 列表 + legacy 提示）；`.ans` 已存在/损坏；无角色；
//      无可 pin；既有治理文档不可解析/条目为空；并发 busy；预览零写入。
//   ② establish：成功三产物 + `.ans` 可解析/pin-backed + pin/manifest 与实算一致；
//      guard/precheck 拒绝零写入；写入阶段注入错误 → phase:"write" 且 message 如实；
//      重复建立不复用上次的一次性边界（删 `.ans` 后采纳既有治理文档、pin 反映当刻字节）。
//   ③ `.ans` 无「创世种子」标记；一次性来源常量逐字写入 acceptance.source。
//
// 全部用系统临时目录，用后清理——不在仓库留文件。命令：
//   node --test "test/编排/**/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GOVERNANCE_RECORD_ACCEPTANCE_SOURCE,
  establishGovernanceRecord,
  previewGovernanceRecord,
} from "../../src/common/编排/finalize.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";

const GOV_REL = "角色卡/governance-boundary.yaml";
const ANS_REL = ".ans/project.json";
const MANIFEST_REL = "docs/bootstrap-manifest.md";

interface AnsPin {
  path: string;
  sha256: string;
}

interface AnsRecord {
  projectRoot: string;
  skillRoot: string;
  governanceModel?: string;
  roles: Record<string, { card: string; boundary: string }>;
  governanceBoundary: {
    path: string;
    acceptance: { accepted: boolean; source: string; pin?: AnsPin[] };
  };
}

/** 新建临时根，用后清理。 */
async function withRoot<T>(fn: (ctx: { root: string; target: string }) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-governance-record-"));
  try {
    return await fn({ root, target: join(root, "proj") });
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

function newProject(root: string): string {
  const target = join(root, "proj");
  mkdirSync(target, { recursive: true });
  return target;
}

function roleYaml(id: string, relPath: string): string {
  return `role: ${id}\nentries:\n  - kind: file\n    path: ${relPath}\n    purpose: 测试角色条目\n`;
}

/** legacy 形态：只有 `boundary.md`（表格式 Section 1；加载器可解析）。 */
function legacyBoundaryMarkdown(id: string, relPath: string): string {
  return [
    `# 角色 ${id} 边界`,
    "",
    "## Section 1：可修改文件与目录",
    "",
    "| 类型 | 路径 | 用途 |",
    "| --- | --- | --- |",
    `| 文件 | \`${relPath}\` | 测试角色条目 |`,
    "",
  ].join("\n");
}

function writeRole(target: string, id: string, boundaryName: "boundary.yaml" | "boundary.md" = "boundary.yaml"): void {
  const dir = join(target, "角色卡", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "role-card.md"), `# ${id}\n\n测试角色。\n`, "utf8");
  const rel = `src/${id}.ts`;
  writeFileSync(
    join(dir, boundaryName),
    boundaryName.endsWith(".md") ? legacyBoundaryMarkdown(id, rel) : roleYaml(id, rel),
    "utf8",
  );
}

/** 写一份结构上可用的 `.ans/project.json`（pin 只校验形状，不校验哈希——载入器行为）。 */
function writeUsableAns(target: string): void {
  mkdirSync(join(target, ".ans"), { recursive: true });
  const record: AnsRecord = {
    projectRoot: target,
    skillRoot: target,
    roles: { alpha: { card: "角色卡/alpha/role-card.md", boundary: "角色卡/alpha/boundary.yaml" } },
    governanceBoundary: {
      path: GOV_REL,
      acceptance: {
        accepted: true,
        source: "test:既有有效记录",
        pin: [{ path: GOV_REL, sha256: "a".repeat(64) }],
      },
    },
  };
  writeFileSync(join(target, ANS_REL), JSON.stringify(record, null, 2) + "\n", "utf8");
}

function sha256OfFile(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function readAns(target: string): AnsRecord {
  return JSON.parse(readFileSync(join(target, ANS_REL), "utf8")) as AnsRecord;
}

function assertNoWrites(target: string): void {
  assert.equal(existsSync(join(target, ".ans")), false, "预览/拒绝不应创建 .ans");
  assert.equal(existsSync(join(target, GOV_REL)), false, "预览/拒绝不应写治理边界文档");
  assert.equal(existsSync(join(target, MANIFEST_REL)), false, "预览/拒绝不应写 manifest");
}

// —————————————————————————————— preview ——————————————————————————————

test("preview：S1 正常——三写路径、pin 列表、legacy 提示；零写入", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha", "boundary.yaml");
    writeRole(target, "beta", "boundary.md");

    const result = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    const p = result.preview;

    assert.equal(p.projectRoot, target);
    assert.equal(p.governanceBoundaryRel, GOV_REL);
    assert.deepEqual(p.writePaths, [GOV_REL, ANS_REL, MANIFEST_REL]);
    assert.deepEqual(p.pinPaths, [GOV_REL, "角色卡/alpha/boundary.yaml", "角色卡/beta/boundary.md"]);
    assert.deepEqual(p.roleIds, ["alpha", "beta"]);
    assert.equal(p.adoptExistingGovernanceDoc, false);
    assert.equal(p.acceptanceSource, GOVERNANCE_RECORD_ACCEPTANCE_SOURCE);
    assert.equal(p.governanceModel, "single", "缺省模型：single（不新增 .ans 字段）");
    assert.deepEqual(p.legacyBoundaryRoleIds, ["beta"]);

    assertNoWrites(target);
  });
});

test("preview：.ans 已存在（可用）→ already-established", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    writeUsableAns(target);

    const result = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "already-established");
    assert.match(result.message, /治理记录已存在/);
  });
});

test("preview：.ans 损坏 → invalid-record", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    mkdirSync(join(target, ".ans"), { recursive: true });
    writeFileSync(join(target, ANS_REL), "{ not json", "utf8");

    const result = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "invalid-record");
    assert.match(result.message, /治理记录不可用/);
  });
});

test("preview：无角色 → no-roles", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);

    const result = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "no-roles");
    assert.match(result.message, /hasRoles=false/);
    assertNoWrites(target);
  });
});

test("preview：有角色但无可 pin 之物 → nothing-to-pin（precheck 原样）", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    // `role-cards/`（英文目录）由 listProject 枚举 ⇒ hasRoles=true；finalize 只扫 `角色卡/` ⇒ 无可 pin。
    const dir = join(target, "role-cards", "alpha");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "role-card.md"), "# alpha\n", "utf8");
    writeFileSync(join(dir, "boundary.yaml"), roleYaml("alpha", "src/alpha.ts"), "utf8");
    assert.equal((await listProject(target)).hasRoles, true);

    const result = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "nothing-to-pin");
    assert.match(result.message, /无可 pin/);
  });
});

test("preview：既有治理边界文档不可解析 → unparseable-governance-doc", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    mkdirSync(join(target, "角色卡"), { recursive: true });
    writeFileSync(join(target, GOV_REL), "role: 治理边界\nentries: [\n", "utf8");

    const before = readFileSync(join(target, GOV_REL), "utf8");
    const result = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "unparseable-governance-doc");
    assert.equal(readFileSync(join(target, GOV_REL), "utf8"), before, "坏文档不得被改写");
    assert.equal(existsSync(join(target, ".ans")), false);
  });
});

test("preview：既有治理边界文档条目为空 → unparseable-governance-doc", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    writeFileSync(join(target, GOV_REL), "role: 治理边界\nentries: []\n", "utf8");

    const result = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "unparseable-governance-doc");
    assert.match(result.message, /没有任何条目/);
    assert.equal(existsSync(join(target, ".ans")), false);
  });
});

test("并发：同项目建立进行中 → preview/establish 均 busy；首个建立正常完成", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");

    // establish 在首次 await 前占位互斥 ⇒ 紧随其后的调用可确定性观察到 busy。
    const first = establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    const concurrentPreview = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(concurrentPreview.ok, false);
    if (!concurrentPreview.ok) {
      assert.equal(concurrentPreview.code, "busy");
      assert.match(concurrentPreview.message, /上一次建立仍在进行中/);
    }
    const second = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(second.ok, false);
    assert.equal(second.phase, "guard");
    assert.equal(second.code, "busy");

    const done = await first;
    assert.equal(done.ok, true);
    assert.equal(done.phase, "write");
    assert.equal(existsSync(join(target, ".ans")), true);
  });
});

test("preview：invalid-request（projectRoot 缺失）", async () => {
  const result = await previewGovernanceRecord({ projectRoot: "   " });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "invalid-request");

  const establish = await establishGovernanceRecord({ projectRoot: "" });
  assert.equal(establish.ok, false);
  assert.equal(establish.phase, "guard");
  assert.equal(establish.code, "invalid-request");
});

// —————————————————————————————— establish ——————————————————————————————

test("establish：成功写出三产物；.ans pin-backed、pin/manifest 与实算一致；无「创世种子」标记", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha", "boundary.yaml");
    writeRole(target, "beta", "boundary.md");

    const result = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.phase, "write");
    assert.equal(result.finalize.ok, true);
    assert.equal(result.finalize.status, "completed");
    assert.deepEqual(result.finalize.wrote, [GOV_REL, ANS_REL, MANIFEST_REL]);
    assert.deepEqual(result.finalize.roles, ["alpha", "beta"]);

    // 三产物都在。
    assert.equal(existsSync(join(target, ANS_REL)), true);
    assert.equal(existsSync(join(target, GOV_REL)), true);
    assert.equal(existsSync(join(target, MANIFEST_REL)), true);

    // `.ans` 可解析、accepted、治理边界路径非空、来源为操作者动作常量、pin 覆盖治理文档 + 全部可 pin 角色边界。
    const ans = readAns(target);
    assert.notEqual(ans.governanceBoundary.path.trim(), "");
    assert.equal(ans.governanceBoundary.path, GOV_REL);
    assert.equal(ans.governanceBoundary.acceptance.accepted, true);
    assert.equal(ans.governanceBoundary.acceptance.source, GOVERNANCE_RECORD_ACCEPTANCE_SOURCE);
    assert.equal(
      Object.prototype.hasOwnProperty.call(ans, "governanceModel"),
      false,
      "未传 governanceModel：旧 `.ans` 形状不得新增字段",
    );
    assert.deepEqual(Object.keys(ans.roles).sort(), ["alpha", "beta"]);

    const expectedPins = [
      { path: GOV_REL, sha256: sha256OfFile(join(target, GOV_REL)) },
      { path: "角色卡/alpha/boundary.yaml", sha256: sha256OfFile(join(target, "角色卡/alpha/boundary.yaml")) },
      { path: "角色卡/beta/boundary.md", sha256: sha256OfFile(join(target, "角色卡/beta/boundary.md")) },
    ];
    assert.deepEqual(ans.governanceBoundary.acceptance.pin, expectedPins);
    assert.deepEqual(result.finalize.pins, expectedPins);

    // 共享载入器认作 pin-backed accepted（与桌面/CLI 同口径）。
    const loaded = await loadEffectiveConfig({
      projectRoot: target,
      skillRoot: target,
      fallback: { projectRoot: target, skillRoot: target, roles: {} },
    });
    assert.equal(loaded.source.kind, "ans");
    assert.equal(loaded.source.acceptance.accepted, true);
    assert.equal(loaded.source.downgradeReason, undefined);

    // manifest 与实算一致（逐条 pin 行）。
    const manifest = readFileSync(join(target, MANIFEST_REL), "utf8");
    for (const p of expectedPins) {
      assert.ok(manifest.includes(`| ${p.path} | ${p.sha256} |`), `manifest 缺少 pin 行：${p.path}`);
    }

    // 无「创世种子」标记（一次性边界不持久化）。
    assert.equal(readFileSync(join(target, ANS_REL), "utf8").includes("创世种子"), false);

    // 建立完成后 preview 直接拒绝（幂等；动作隐藏的同义判据）。
    const again = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.code, "already-established");
  });
});

test("establish：governanceModel='trio' → 预览显示 trio、`.ans` 写出该字段", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");

    const preview = await previewGovernanceRecord({
      projectRoot: target,
      skillRoot: target,
      governanceModel: "trio",
    });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (preview.ok) assert.equal(preview.preview.governanceModel, "trio");

    const result = await establishGovernanceRecord({
      projectRoot: target,
      skillRoot: target,
      governanceModel: "trio",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(readAns(target).governanceModel, "trio");
    assert.equal(readAns(target).governanceBoundary.acceptance.accepted, true);
  });
});

test("establish：删 .ans 后重跑——不复用上次一次性边界，采纳既有治理文档且 pin 反映当刻字节", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha", "boundary.yaml");

    const first = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(first.ok, true);
    const oldGovHash = readAns(target).governanceBoundary.acceptance.pin!.find((p) => p.path === GOV_REL)!.sha256;

    // 改动治理边界文档（仍是合法 YAML），删掉 `.ans` 模拟「治理文档已在、记录缺失」。
    const govAbs = join(target, GOV_REL);
    const changed = readFileSync(govAbs, "utf8") + "\n# 第二次建立前的外部增补\n";
    writeFileSync(govAbs, changed, "utf8");
    rmSync(join(target, ANS_REL));

    const preview = await previewGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(preview.ok, true);
    if (preview.ok) assert.equal(preview.preview.adoptExistingGovernanceDoc, true);

    const second = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.deepEqual(second.finalize.wrote, [ANS_REL, MANIFEST_REL], "既有治理文档应被采纳、不重写");

    const ans = readAns(target);
    const newGovHash = ans.governanceBoundary.acceptance.pin!.find((p) => p.path === GOV_REL)!.sha256;
    assert.equal(newGovHash, sha256OfFile(govAbs));
    assert.notEqual(newGovHash, oldGovHash, "pin 应反映第二次建立时的当刻字节，而非复用上次结果");
    assert.equal(readFileSync(govAbs, "utf8"), changed, "采纳＝不覆盖既有治理边界文档");
    assert.equal(ans.governanceBoundary.acceptance.source, GOVERNANCE_RECORD_ACCEPTANCE_SOURCE);
    assert.equal(readFileSync(join(target, ANS_REL), "utf8").includes("创世种子"), false);
  });
});

test("establish：无角色 → guard/no-roles，零写入", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);

    const result = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.code, "no-roles");
    assert.equal(result.finalize.status, "blocked");
    assert.deepEqual(result.finalize.wrote, []);
    assertNoWrites(target);
  });
});

test("establish：.ans 已存在 → guard/not-genesis（already-established），不覆盖", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    writeUsableAns(target);
    const before = readFileSync(join(target, ANS_REL), "utf8");

    const result = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.code, "already-established");
    assert.equal(result.finalize.status, "not-genesis");
    assert.match(result.finalize.message ?? "", /治理记录已存在/);
    assert.equal(readFileSync(join(target, ANS_REL), "utf8"), before, ".ans 不得被覆盖");
    assert.equal(existsSync(join(target, GOV_REL)), false);
  });
});

test("establish：.ans 损坏 → guard/invalid-record，零写入", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    mkdirSync(join(target, ".ans"), { recursive: true });
    writeFileSync(join(target, ANS_REL), "{ not json", "utf8");

    const result = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.code, "invalid-record");
    assert.equal(result.finalize.status, "not-genesis");
    assert.equal(readFileSync(join(target, ANS_REL), "utf8"), "{ not json");
    assert.equal(existsSync(join(target, GOV_REL)), false);
  });
});

test("establish：既有治理文档不可解析 → guard/unparseable-governance-doc，零写入", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    writeFileSync(join(target, GOV_REL), "role: 治理边界\nentries: [\n", "utf8");

    const result = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "guard");
    assert.equal(result.code, "unparseable-governance-doc");
    assert.equal(result.finalize.status, "blocked");
    assert.deepEqual(result.finalize.wrote, []);
    assert.equal(existsSync(join(target, ".ans")), false);
    assert.equal(readFileSync(join(target, GOV_REL), "utf8"), "role: 治理边界\nentries: [\n");
  });
});

test("establish：precheck 拒绝（nothing-to-pin）→ phase:precheck，零写入", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    const dir = join(target, "role-cards", "alpha");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "role-card.md"), "# alpha\n", "utf8");
    writeFileSync(join(dir, "boundary.yaml"), roleYaml("alpha", "src/alpha.ts"), "utf8");

    const result = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "precheck");
    assert.equal(result.finalize.status, "nothing-to-pin");
    assert.match(result.finalize.message ?? "", /无可 pin/);
    assert.equal(existsSync(join(target, ".ans")), false);
    assert.equal(existsSync(join(target, GOV_REL)), false);
    assert.equal(existsSync(join(target, MANIFEST_REL)), false);
  });
});

test("establish：写入阶段注入错误 → phase:write，message 如实说明可能部分写入", async () => {
  await withRoot(async ({ root }) => {
    const target = newProject(root);
    writeRole(target, "alpha");
    // 让 manifest 的父目录 `docs` 成为**文件**：precheck 只做词法门禁（放行），写入阶段 mkdir 失败。
    writeFileSync(join(target, "docs"), "not a directory", "utf8");

    const result = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(result.ok, false);
    assert.equal(result.phase, "write", "写入阶段失败不得被当作零写入的 precheck 拒绝");
    assert.equal(result.finalize.status, "blocked");
    assert.match(result.finalize.message ?? "", /写入中断/);
    assert.match(result.finalize.message ?? "", /可能已写入部分文件/);
    assert.match(result.finalize.message ?? "", /治理边界文档\/\.ans\/manifest 不保证齐全/);
    assert.match(result.finalize.message ?? "", /请核对现场/);
    assert.match(result.finalize.message ?? "", /不会自动覆盖已存在的 \.ans/);
    assert.equal(result.finalize.message?.includes("会安全采纳") ?? false, false, "不得承诺可重试");
    assert.equal(result.finalize.message?.includes("请重新执行") ?? false, false, "不得承诺可重试");
    assert.equal(result.finalize.message?.includes("未写入任何文件") ?? false, false);

    // 如实：治理文档与 `.ans` 可能已落盘（本夹具确实已落盘），manifest 未写出。
    assert.equal(existsSync(join(target, GOV_REL)), true);
    assert.equal(existsSync(join(target, ANS_REL)), true);
    assert.equal(existsSync(join(target, MANIFEST_REL)), false);
  });
});

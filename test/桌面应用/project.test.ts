// test/桌面应用/project.test.ts
// 桌面窗口：项目/角色装配辅助的单测（纯逻辑；node --test 直接跑 .ts）。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { applyPinEvidence, buildProjectConfig, deriveGovernanceRecord, deriveGovernanceRecordWithPins, readRoleDocsIndex, resolveSkillRoot, posixDirname, projectDocumentCandidates } from "../../app/desktop/project.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import { listProject, resolveRole } from "../../src/service/role/resolve-role.ts";
import type { PinEvidenceFile, PinEvidenceResult } from "../../src/model/boundary.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

test("resolveSkillRoot：优先 ANS_SKILL_ROOT", () => {
  assert.equal(resolveSkillRoot({ ANS_SKILL_ROOT: "/x/skill" }), "/x/skill");
  assert.match(resolveSkillRoot({}), /ans-governed-construction$/);
});

test("posixDirname：取目录名", () => {
  assert.equal(posixDirname("角色卡/桌面应用/role-card.md"), "角色卡/桌面应用");
  assert.equal(posixDirname("a.txt"), "");
});

test("buildProjectConfig：由枚举结果构造角色表，acceptance 透传", async () => {
  const listing = await listProject(REPO_ROOT);
  // 归档事实（2026-10-14，同日演进——上午过渡做法「boundary.yaml 改名 .frozen ⇒ 跳过并提示」已按
  // 客户决定改为**归档键约定**：boundary.yaml 恢复原名、顶层 `archived: true`）：枚举**静默跳过**归档
  // 目录——零警告、不可开启（resolveRole 拒绝）、边界不予采用；活角色为「桌面UI」与「桌面窗口」两个。
  assert.deepEqual(listing.warnings, [], "枚举不应有任何警告（归档目录按归档键约定静默跳过、零提示）");
  const cfg = buildProjectConfig(listing, { accepted: true, source: "unit-test" }, { ANS_SKILL_ROOT: "/x/skill" });
  assert.equal(cfg.projectRoot, listing.projectRoot);
  assert.equal(cfg.skillRoot, "/x/skill");
  const roleIds = Object.keys(cfg.roles);
  assert.ok(!roleIds.includes("桌面应用"), "归档的「桌面应用」不得再被登记进角色表");
  assert.ok(roleIds.includes("桌面窗口"), "应含 桌面窗口 角色");
  assert.ok(cfg.roles["桌面窗口"].card.endsWith("role-card.md"));
  assert.ok(cfg.roles["桌面窗口"].boundary.endsWith("boundary.yaml"));
  assert.ok(roleIds.includes("桌面UI"), "应含 桌面UI 角色（拆分的另一半）");
  assert.equal(cfg.governanceBoundary?.acceptance.accepted, true);
});

test("readRoleDocsIndex：列出 docs 目录并读到设计稿；读到 changelog.md", async () => {
  const idx = await readRoleDocsIndex(REPO_ROOT, "角色卡/桌面应用/role-card.md");
  assert.ok(idx.changelog, "应读到 changelog.md");
  assert.equal(idx.changelog!.path, "角色卡/桌面应用/changelog.md");
  assert.ok(idx.changelog!.text.includes("桌面应用"), "changelog 正文应含角色名");
  const designDir = idx.docs.find((d) => d.path === "docs/design" && d.kind === "directory");
  assert.ok(designDir, "应含 docs/design 目录项");
  const designFile = idx.docs.find((d) => d.path.startsWith("docs/design/") && d.kind === "file");
  assert.ok(designFile, "应含 docs/design 下的文件");
});

// —— 内置治理角色 su 贯穿「枚举 → ProjectConfig → 解析」全链 ——

test("su：枚举结果里排第一且标为内置，且不进 ProjectConfig 的 roles 映射", async () => {
  const listing = await listProject(REPO_ROOT);
  assert.equal(listing.roles[0].roleId, "su");
  assert.equal(listing.roles[0].builtIn, true);

  const cfg = buildProjectConfig(listing, { accepted: true, source: "unit-test" }, { ANS_SKILL_ROOT: "/x/skill" });
  assert.equal(cfg.roles["su"], undefined, "su 无角色目录，不得登记进 roles（否则会去读空路径）");
  assert.ok(cfg.roles["桌面窗口"], "项目角色照常登记");
  // 但 su 要登记进 builtInRoles：会话式入口（openRoleSession / 桌面聊天）据此允许开启它。
  assert.ok(cfg.builtInRoles?.includes("su"), "内置角色 su 应出现在 builtInRoles");
  // 项目角色不得混入 builtInRoles。
  assert.ok(!cfg.builtInRoles?.includes("桌面窗口"), "项目角色不得出现在 builtInRoles");
});

test("su：resolveRole 下沉为 built-in-governance，走内置边界、不抛错", async () => {
  const listing = await listProject(REPO_ROOT);
  const cfg = buildProjectConfig(listing, { accepted: true, source: "unit-test" }, { ANS_SKILL_ROOT: "/x/skill" });
  const role = await resolveRole("su", cfg);
  assert.equal(role.kind, "built-in-governance");
  assert.match(role.cardText, /ANS Governance/);
  assert.match(role.boundarySource, /built-in/);
  // fail-closed：内置边界未接受，治理会话的一切写入都会被拒（契约 §0）。
  assert.equal(role.boundary.acceptance.accepted, false);
  assert.ok(role.boundary.entries.length > 0);
});

// —————— I1：治理记录状态派生（PM 评审 §四.1）——————
// 纯函数，输入＝载入器事实（source.kind / acceptance.accepted / downgradeReason）＋治理边界路径。

const PINNED_ACCEPTANCE = {
  accepted: true as const,
  source: "operator:建立治理记录",
  pin: [{ path: "角色卡/governance-boundary.yaml", sha256: "a".repeat(64) }],
};

test("deriveGovernanceRecord：missing——无 .ans（builtin-fallback），即使回退 acceptance 是运行期同意", () => {
  // DESKTOP_RUNTIME_CONSENT 形态（accepted:true 非 pin）：仍是 missing——授权不等于治理记录存在。
  assert.deepEqual(
    deriveGovernanceRecord({
      source: { kind: "builtin-fallback", acceptance: { accepted: true, source: "desktop-app:导入即授权" } },
      governanceBoundaryPath: "",
    }),
    { state: "missing" },
    "builtin-fallback 应判 missing，不得因 fallback accepted 而误判 present",
  );
  assert.deepEqual(
    deriveGovernanceRecord({ source: { kind: "builtin-fallback", acceptance: { accepted: false, source: "" } } }),
    { state: "missing" },
    "治理边界路径缺省时缺省按空串处理，missing 判据不受其影响",
  );
});

test("deriveGovernanceRecord：present——ans + accepted + 治理边界路径非空（不校验 pin 逐文件哈希）", () => {
  assert.deepEqual(
    deriveGovernanceRecord({
      source: { kind: "ans", acceptance: PINNED_ACCEPTANCE },
      governanceBoundaryPath: "角色卡/governance-boundary.yaml",
    }),
    { state: "present" },
  );
});

test("deriveGovernanceRecord：invalid——ans-invalid 原样取载入器 downgradeReason", () => {
  const reason = "无法解析 .ans/project.json：Unexpected token '}'";
  assert.deepEqual(
    deriveGovernanceRecord({
      source: { kind: "ans-invalid", acceptance: { accepted: false, source: "" }, downgradeReason: reason },
      governanceBoundaryPath: "",
    }),
    { state: "invalid", reason },
    "reason 必须是载入器原文（不猜测、不补写）",
  );
});

test("deriveGovernanceRecord：invalid——ans 但未接受（如 accepted:true 无 pin 被降级），reason 取 downgradeReason", () => {
  const reason = ".ans：声明 accepted:true 但未提供 pin —— 无 pin 即无证据";
  assert.deepEqual(
    deriveGovernanceRecord({
      source: { kind: "ans", acceptance: { accepted: false, source: "" }, downgradeReason: reason },
      governanceBoundaryPath: "角色卡/governance-boundary.yaml",
    }),
    { state: "invalid", reason },
  );
  // 载入器未给降级原因时给等价原因（非空、可读），而不是凭空丢失原因。
  const fallbackReason = deriveGovernanceRecord({
    source: { kind: "ans", acceptance: { accepted: false, source: "" } },
    governanceBoundaryPath: "角色卡/governance-boundary.yaml",
  });
  assert.equal(fallbackReason.state, "invalid");
  assert.match(fallbackReason.reason ?? "", /未接受/);
});

test("deriveGovernanceRecord：invalid——治理边界路径为空或纯空白（含 accepted）", () => {
  for (const governanceBoundaryPath of ["", "   "]) {
    const r = deriveGovernanceRecord({
      source: { kind: "ans", acceptance: PINNED_ACCEPTANCE },
      governanceBoundaryPath,
    });
    assert.equal(r.state, "invalid", `路径 ${JSON.stringify(governanceBoundaryPath)} 应判 invalid`);
    assert.match(r.reason ?? "", /治理边界路径/);
  }
});

// —————— C1：pin 证据合入（治理记录 pin 不符的重新接受恢复，PM 评审 §5.3）——————

const PINNED_ACCEPTANCE_TWO_PINS = {
  accepted: true as const,
  source: "operator:建立治理记录",
  pin: [
    { path: "角色卡/governance-boundary.yaml", sha256: "a".repeat(64) },
    { path: "角色卡/R/boundary.yaml", sha256: "b".repeat(64) },
  ],
};

const OK_EVIDENCE: PinEvidenceResult = { state: "ok", checked: 2, files: [], digest: "c".repeat(64) };

function evidenceOf(checked: number, files: PinEvidenceFile[]): PinEvidenceResult {
  return { state: "mismatch", checked, files, digest: "d".repeat(64) };
}

test("applyPinEvidence：ok 保持原 present（不新增字段）；mismatch → pin-mismatch + 明细；invalid → invalid + 原因", () => {
  const present = { state: "present" as const };
  assert.deepEqual(applyPinEvidence(present, OK_EVIDENCE), { state: "present" }, "ok 不得新增字段");

  const modified: PinEvidenceFile = {
    path: "角色卡/R/boundary.yaml",
    pinned: "b".repeat(64),
    actual: "e".repeat(64),
    status: "modified",
  };
  const missing: PinEvidenceFile = {
    path: "角色卡/S/boundary.yaml",
    pinned: "f".repeat(64),
    actual: null,
    status: "missing",
  };
  assert.deepEqual(
    applyPinEvidence(present, evidenceOf(3, [modified, missing])),
    { state: "pin-mismatch", pinFiles: [modified, missing], pinCount: 3 },
    "mismatch 必须带逐文件明细与 pin 总条数",
  );

  assert.deepEqual(
    applyPinEvidence(present, { state: "invalid", checked: 0, files: [], digest: "", reason: "pin[0] 的 sha256 不是 64 位十六进制" }),
    { state: "invalid", reason: "pin[0] 的 sha256 不是 64 位十六进制" },
  );
  assert.deepEqual(
    applyPinEvidence(present, { state: "invalid", checked: 0, files: [], digest: "" }),
    { state: "invalid", reason: "pin 证据检查失败" },
    "invalid 无原因时给固定等价原因",
  );
});

test("applyPinEvidence：missing / invalid 原样返回（不因 pin 证据改写既有形状）", () => {
  const missing = { state: "missing" as const };
  const invalid = { state: "invalid" as const, reason: "不可解析" };
  assert.equal(applyPinEvidence(missing, evidenceOf(1, [])), missing);
  assert.equal(applyPinEvidence(invalid, OK_EVIDENCE), invalid);
});

test("deriveGovernanceRecordWithPins：present 以外不做哈希、原样返回（检查器零调用）", async () => {
  let calls = 0;
  const inspectPinnedBoundariesFn = async (): Promise<PinEvidenceResult> => {
    calls += 1;
    return OK_EVIDENCE;
  };
  for (const record of [
    { state: "missing" as const },
    { state: "invalid" as const, reason: "不可解析" },
    { state: "pin-mismatch" as const, pinFiles: [], pinCount: 2 },
  ]) {
    const out = await deriveGovernanceRecordWithPins({
      projectRoot: "/proj",
      record,
      pins: [{ path: "角色卡/R/boundary.yaml", sha256: "a".repeat(64) }],
      governanceBoundaryPath: "角色卡/governance-boundary.yaml",
      inspectPinnedBoundariesFn,
    });
    assert.equal(out, record, `${record.state} 必须原样返回（同一引用）`);
  }
  assert.equal(calls, 0, "非 present 不得调用 pin 检查（不做任何哈希）");
});

test("deriveGovernanceRecordWithPins：pins 缺失或为空 → invalid（fail-closed，检查器零调用）", async () => {
  let calls = 0;
  const inspectPinnedBoundariesFn = async (): Promise<PinEvidenceResult> => {
    calls += 1;
    return OK_EVIDENCE;
  };
  for (const pins of [undefined, []]) {
    const out = await deriveGovernanceRecordWithPins({
      projectRoot: "/proj",
      record: { state: "present" },
      pins,
      inspectPinnedBoundariesFn,
    });
    assert.deepEqual(out, { state: "invalid", reason: "治理记录未提供可验证 pin" });
  }
  assert.equal(calls, 0);
});

test("deriveGovernanceRecordWithPins：present 时透传 projectRoot/pins/治理边界路径，并映射证据", async () => {
  const inputs: unknown[] = [];
  const inspectPinnedBoundariesFn = async (input: unknown): Promise<PinEvidenceResult> => {
    inputs.push(input);
    return OK_EVIDENCE;
  };
  const out = await deriveGovernanceRecordWithPins({
    projectRoot: "/proj",
    record: { state: "present" },
    pins: PINNED_ACCEPTANCE_TWO_PINS.pin,
    governanceBoundaryPath: "角色卡/governance-boundary.yaml",
    inspectPinnedBoundariesFn,
  });
  assert.deepEqual(out, { state: "present" }, "ok 保持既有 present 形状");
  assert.deepEqual(inputs, [{
    projectRoot: "/proj",
    pins: PINNED_ACCEPTANCE_TWO_PINS.pin,
    requiredPath: "角色卡/governance-boundary.yaml",
  }], "治理边界路径作为 requiredPath（覆盖规则）");

  // 治理边界路径为空时不传 requiredPath。
  await deriveGovernanceRecordWithPins({
    projectRoot: "/proj",
    record: { state: "present" },
    pins: PINNED_ACCEPTANCE_TWO_PINS.pin,
    governanceBoundaryPath: "",
    inspectPinnedBoundariesFn,
  });
  assert.deepEqual(inputs[1], { projectRoot: "/proj", pins: PINNED_ACCEPTANCE_TWO_PINS.pin });
});

test("deriveGovernanceRecordWithPins：mismatch 明细映射为 pin-mismatch；检查器抛错 → invalid 且永不 reject", async () => {
  const modified: PinEvidenceFile = {
    path: "角色卡/R/boundary.yaml",
    pinned: "b".repeat(64),
    actual: "e".repeat(64),
    status: "modified",
  };
  const mismatch = await deriveGovernanceRecordWithPins({
    projectRoot: "/proj",
    record: { state: "present" },
    pins: PINNED_ACCEPTANCE_TWO_PINS.pin,
    governanceBoundaryPath: "角色卡/governance-boundary.yaml",
    inspectPinnedBoundariesFn: async () => evidenceOf(2, [modified]),
  });
  assert.deepEqual(mismatch, { state: "pin-mismatch", pinFiles: [modified], pinCount: 2 });

  const failed = await deriveGovernanceRecordWithPins({
    projectRoot: "/proj",
    record: { state: "present" },
    pins: PINNED_ACCEPTANCE_TWO_PINS.pin,
    governanceBoundaryPath: "角色卡/governance-boundary.yaml",
    inspectPinnedBoundariesFn: async () => { throw new Error("磁盘读取爆炸"); },
  });
  assert.deepEqual(failed, { state: "invalid", reason: "pin 证据检查失败：磁盘读取爆炸" }, "异常必须归为 invalid，绝不外抛");
});

// —————— 角色根文档索引（role-root-docs-display S2）：白名单/顺序/memo 排除/changelog 与 docs 不回归 ——————

async function makeRoleProject(): Promise<{ root: string; roleDir: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-role-docs-"));
  const roleDir = path.join(root, "角色卡", "R");
  await fs.mkdir(path.join(roleDir, "docs", "design"), { recursive: true });
  return { root, roleDir, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

test("readRoleDocsIndex：rootDocs 只含三个白名单文件（固定顺序），memo/任意根文件永不入索引；changelog 与 docs/ 不回归", async () => {
  const { root, roleDir, cleanup } = await makeRoleProject();
  try {
    await fs.writeFile(path.join(roleDir, "role-card.md"), "card");
    await fs.writeFile(path.join(roleDir, "feature-map.md"), "fm body");
    await fs.writeFile(path.join(roleDir, "functional-description.md"), "fd body");
    await fs.writeFile(path.join(roleDir, "api-spec.md"), "not-applicable");
    await fs.writeFile(path.join(roleDir, "memo.md"), "memo-private-marker");
    await fs.writeFile(path.join(roleDir, "arbitrary.md"), "arbitrary-root-marker");
    await fs.writeFile(path.join(roleDir, "changelog.md"), "changelog body");
    await fs.writeFile(path.join(roleDir, "docs", "z.md"), "z");
    await fs.writeFile(path.join(roleDir, "docs", "design", "a.md"), "a");
    await fs.writeFile(path.join(roleDir, "docs", ".hidden.md"), "hidden");

    const idx = await readRoleDocsIndex(root, "角色卡/R/role-card.md");
    assert.deepEqual(idx.rootDocs, [
      { name: "feature-map.md", path: "角色卡/R/feature-map.md", kind: "file" },
      { name: "functional-description.md", path: "角色卡/R/functional-description.md", kind: "file" },
      { name: "api-spec.md", path: "角色卡/R/api-spec.md", kind: "file" },
    ], "rootDocs 必须恰好三个白名单文件且顺序固定");
    const serialized = JSON.stringify(idx);
    assert.equal(serialized.includes("memo"), false, "memo.md 永不进入任何索引字段");
    assert.equal(serialized.includes("memo-private-marker"), false, "索引不得读取 memo 正文");
    assert.equal(serialized.includes("arbitrary"), false, "任意根文件不得被索引");
    assert.equal(idx.changelog?.path, "角色卡/R/changelog.md", "changelog 仍保留在独立字段");
    assert.equal(idx.changelog?.text, "changelog body");
    assert.deepEqual(idx.docs, [
      { path: "docs/design", kind: "directory" },
      { path: "docs/design/a.md", kind: "file" },
      { path: "docs/z.md", kind: "file" },
    ], "docs/ 遍历、排序与隐藏文件跳过保持既有语义（不回归）");
  } finally {
    await cleanup();
  }
});

test("readRoleDocsIndex：部分根文档缺失只返回存在的，顺序保持相对；只有 memo 时 rootDocs 为空且不抛错", async () => {
  const { root, roleDir, cleanup } = await makeRoleProject();
  try {
    await fs.writeFile(path.join(roleDir, "role-card.md"), "card");
    await fs.writeFile(path.join(roleDir, "feature-map.md"), "fm");
    await fs.writeFile(path.join(roleDir, "api-spec.md"), "api");
    await fs.rm(path.join(roleDir, "docs"), { recursive: true, force: true });
    const partial = await readRoleDocsIndex(root, "角色卡/R/role-card.md");
    assert.deepEqual(partial.rootDocs.map((d) => d.name), ["feature-map.md", "api-spec.md"], "缺失项不占位，相对顺序保持");
    assert.equal(partial.changelog, null, "无 changelog 时为 null，不要求补写");
    assert.deepEqual(partial.docs, [], "无 docs/ 时为空索引");

    await fs.rm(path.join(roleDir, "feature-map.md"));
    await fs.rm(path.join(roleDir, "api-spec.md"));
    await fs.writeFile(path.join(roleDir, "memo.md"), "memo only");
    const memoOnly = await readRoleDocsIndex(root, "角色卡/R/role-card.md");
    assert.deepEqual(memoOnly.rootDocs, [], "只有 memo 时不得产生任何根文档条目");
  } finally {
    await cleanup();
  }
});

test("readRoleDocsIndex：cardPath 为空/绝对/盘符/反斜杠/空段/`.`/`..` 一律返回空索引且不抛错", async () => {
  const { root, roleDir, cleanup } = await makeRoleProject();
  try {
    await fs.writeFile(path.join(roleDir, "role-card.md"), "card");
    await fs.writeFile(path.join(roleDir, "feature-map.md"), "fm");
    for (const cardPath of [
      "role-card.md", // 空角色目录
      "/abs/角色卡/R/role-card.md",
      "C:/abs/角色卡/R/role-card.md",
      "角色卡\\R\\role-card.md",
      "角色卡//R/role-card.md",
      "角色卡/./R/role-card.md",
      "角色卡/../R/role-card.md",
      "../角色卡/R/role-card.md",
    ]) {
      const idx = await readRoleDocsIndex(root, cardPath);
      assert.deepEqual(idx, { changelog: null, docs: [], rootDocs: [] }, `非法 cardPath ${JSON.stringify(cardPath)} 必须返回空索引`);
    }
    // 角色目录存在但不是目录：空索引，不越界读取。
    await fs.writeFile(path.join(root, "角色卡", "plainfile.md"), "x");
    const notDir = await readRoleDocsIndex(root, "角色卡/plainfile.md/role-card.md");
    assert.deepEqual(notDir, { changelog: null, docs: [], rootDocs: [] });
  } finally {
    await cleanup();
  }
});

test("readRoleDocsIndex：符号链接角色目录与根文档不列入（POSIX 实测；Windows 以非法路径/非目录用例覆盖）", async (t) => {
  if (process.platform === "win32") {
    t.diagnostic("Windows 创建符号链接受权限限制；索引跳过逻辑由非法路径/非目录用例覆盖，POSIX 另行实测。");
    return;
  }
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ans-role-docs-outside-"));
  const { root, roleDir, cleanup } = await makeRoleProject();
  try {
    await fs.writeFile(path.join(roleDir, "role-card.md"), "card");
    // 正常角色目录下的根文档符号链接：不列入。
    await fs.writeFile(path.join(outside, "target.md"), "outside target");
    await fs.symlink(path.join(outside, "target.md"), path.join(roleDir, "feature-map.md"));
    const linkedFile = await readRoleDocsIndex(root, "角色卡/R/role-card.md");
    assert.deepEqual(linkedFile.rootDocs, [], "符号链接根文档不得列入");
    // 角色目录本身是符号链接：整个索引为空。
    await fs.symlink(outside, path.join(root, "角色卡", "Linked"));
    await fs.writeFile(path.join(outside, "role-card.md"), "outside card");
    const linkedDir = await readRoleDocsIndex(root, "角色卡/Linked/role-card.md");
    assert.deepEqual(linkedDir, { changelog: null, docs: [], rootDocs: [] }, "符号链接角色目录不得读取");
  } finally {
    await cleanup();
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test("projectDocumentCandidates：透传 rootDocs 元数据；旧调用方（无 rootDocs）不产生字段", () => {
  const docs = [{ path: "docs/x.md", kind: "file" as const }];
  const base = { roleId: "A", builtIn: false, cardPath: "角色卡/A/role-card.md", changelog: null, docs };
  assert.equal(Object.hasOwn(projectDocumentCandidates(base), "rootDocs"), false, "旧调用方缺省时行为不变");
  const withRoots = projectDocumentCandidates({
    ...base,
    rootDocs: [{ name: "feature-map.md", path: "角色卡/A/feature-map.md", kind: "file" }],
  });
  assert.deepEqual(withRoots.rootDocs, [{ path: "角色卡/A/feature-map.md", kind: "file" }], "只透传元数据（项目相对路径）");
});

test("readRoleDocsIndex：索引跳过记录元数据诊断（含 reasonCode，不写路径/正文）", async () => {
  const { root, cleanup } = await makeRoleProject();
  const logsDir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-role-docs-logs-"));
  configureDiagnostics({ directory: logsDir });
  try {
    await readRoleDocsIndex(root, "../outside/role-card.md");
    await readRoleDocsIndex(path.join(root, "missing-project"), "角色卡/R/role-card.md");
    await flushDiagnostics();
    const files = await fs.readdir(logsDir);
    const text = (await Promise.all(files.map((name) => fs.readFile(path.join(logsDir, name), "utf8")))).join("\n");
    assert.match(text, /"event":"role-docs\.index\.skipped"/, "索引跳过应留元数据诊断");
    assert.match(text, /"reasonCode":"invalid-card-path"/);
    assert.match(text, /"reasonCode":"role-dir-missing"/);
    assert.equal(text.includes("outside"), false, "诊断不得写入被拒绝的路径");
  } finally {
    await disposeDiagnostics();
    await cleanup();
    await fs.rm(logsDir, { recursive: true, force: true });
  }
});

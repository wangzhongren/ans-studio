// 门禁引擎测试：冷启动「有界创世例外」（设计 §10.1 / §12.2，任务 T31）
//
// 场景：`ans init` 废掉后，导入**空文件夹** + 与内置治理角色 su 对话——su 的 gate 必须能对
// 「项目根」治理种子边界求值，好让它把角色建出来。这就是**有界创世**：
//   1) 写集有界：只许治理产物（角色卡/<角色>/…、docs/…、.ans/project.json、项目边界文档本身）；
//   2) **无需 scope、无需 slug**（§12.2）：种子条目是**普通目录**，`scope: undefined` 下命中即放行；
//   3) 自终止：项目边界文档写出并 pin 后，项目覆盖分支接管、创世授权失效；
//   4) 逐路径留痕：创建依据（acceptance.source = 操作者指令）随边界带出、留痕路径可写。
//
// T31 改动要点：种子条目由 `conditional-directory` 改为普通 `directory`（原来须声明 slug 才激活，
// 无 scope 时恒不激活 ⇒ su 一切写入被拒——正是「空文件夹跑不通」的根因）。
//
// 全部在系统临时目录内进行，用完清理，不在仓库留文件。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BUILT_IN_GOVERNANCE_ROLE_ID,
  builtInBoundarySection,
  resolveBoundarySection,
} from "../../src/common/门禁引擎/boundary-core.ts";
import { sha256File } from "../../src/common/门禁引擎/io.ts";
// T31：种子边界的构造已迁入本角色（governance-seed.ts），不再从编排 bootstrap.ts 导入（消 §6 违规）。
import { governanceBoundaryEntries } from "../../src/common/门禁引擎/governance-seed.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "genesis-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
mkdirSync(PROJ, { recursive: true });
mkdirSync(SKILL, { recursive: true });
const ctx = { skillRoot: SKILL, projectRoot: PROJ };
// 项目根外、且不在 skill 根内的绝对路径（用于负例）。
const OUTSIDE_ABS = join(ROOT, "outside", "x.md");

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const OPERATOR_INSTRUCTION = "desktop:导入空项目=发起 bootstrap（操作者指令）";

/** 空项目 + 操作者发起的 bootstrap（genesisBootstrap 显式设置）。 */
function genesisProject(): ProjectConfig {
  return {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: {},
    genesisBootstrap: { source: OPERATOR_INSTRUCTION },
  };
}

/** 收窄 scope 帮助器（仅用于需要展示 F4 收窄的既有场景）。 */
function scope(writeSet: string[], conditions: string[] = []): TaskScope {
  return { writeSet, conditions };
}

// ———————————— 1) 边界求值：空项目上 su 得到「项目根」治理种子边界 ————————————

test("T31：空项目 + 操作者 bootstrap → su 的边界为项目根治理种子（普通目录，accepted，source=操作者指令）", async () => {
  const b = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, genesisProject());
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.acceptance.source, OPERATOR_INSTRUCTION, "acceptance.source 须如实记录操作者指令（留痕依据）");
  assert.equal(b.parseError, undefined);
  // 三个目录，全部 root=project（按**项目根**求值，不落进项目）
  assert.deepEqual(
    b.entries.map((e) => e.path).sort(),
    [".ans/", "docs/", "角色卡/"].sort(),
  );
  assert.ok(b.entries.every((e) => e.root === "project"));
  // ★ T31 核心：种子条目由条件目录改为**普通目录**（§12.2）——不再带 condition。
  assert.ok(b.entries.every((e) => e.kind === "directory"), "种子条目应为普通 directory");
  assert.ok(b.entries.every((e) => e.condition === undefined), "普通目录不带 condition/slug");
  // 有界性：条目集合固定为这三个（绝不含 src/、不含项目内任意文件）
  assert.ok(b.entries.every((e) => !e.path.startsWith("src")), "种子边界绝不包含 src/");
  // ★ 单一来源证明：种子条目与 governance-seed 的 governanceBoundaryEntries 逐字段一致（无两份实现、无漂移）
  assert.deepEqual(b.entries, governanceBoundaryEntries());
});

test("T15：创世只作用于**内置治理角色**；项目角色不受益（仍回退内置未接受）", async () => {
  const project: ProjectConfig = {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: { 编排: { card: "角色卡/编排/role-card.md", boundary: "角色卡/编排/boundary.yaml" } },
    genesisBootstrap: { source: OPERATOR_INSTRUCTION },
  };
  const su = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, project);
  assert.equal(su.acceptance.accepted, true);
  const other = await resolveBoundarySection("编排", project);
  assert.equal(other.acceptance.accepted, false, "非治理角色不得因创世而获权");
});

test("T15：genesisBootstrap.source 为空 → 边界 accepted 但 F6 仍拒一切写（fail-closed）", async () => {
  const project: ProjectConfig = { projectRoot: PROJ, skillRoot: SKILL, roles: {}, genesisBootstrap: { source: "" } };
  const b = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, project);
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.acceptance.source, "");
  // ★ scope: undefined（普通聊天）也一样——F6 先行，无证据来源不得放行。
  const d = resolveWrite("角色卡/X/role-card.md", b, undefined, ctx);
  assert.equal(d.allowed, false, "无证据来源不得放行");
  assert.match(d.reason, /F6|未被接受/);
});

// ———————————— 2) ★ T31 要害：scope: undefined 下命中即放行（无需 scope、无需 slug） ————————————

test("T31 要害：genesisBootstrap 设、scope:undefined → su 对 角色卡/<任意新角色>/…、docs/…、.ans/project.json 判 allowed", async () => {
  const b = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, genesisProject());
  // 「任意新角色」= 对话中才定的名字，事先不可枚举——这正是旧条件目录方案（须声明 slug、写集须枚举）办不到的。
  for (const target of [
    "角色卡/新角色A/role-card.md",
    "角色卡/由对话命名的角色/boundary.yaml",
    "角色卡/Y/memo.md",
    "角色卡/新角色/docs/design/architecture.md", // 角色目录下的深层路径
    "角色卡/governance-boundary.yaml", // 项目边界文档本身（在 角色卡/ 之下）
    "docs/design/architecture.md",
    "docs/bootstrap-manifest.md", // 逐路径留痕落盘处
    ".ans/project.json",
  ]) {
    const d = resolveWrite(target, b, undefined, ctx); // ★ scope === undefined
    assert.equal(d.allowed, true, `scope:undefined 下应放行：${target}（实得：${d.allowed ? "" : d.reason}）`);
  }
});

// ———————————— 3) T31 负面：scope: undefined 下越界一律拒 ————————————

test("T31 负面：scope:undefined → src/**、项目根外、README.md/package.json 一律拒", async () => {
  const b = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, genesisProject());
  // 项目根内但非治理产物 → 未匹配任何边界条目
  for (const target of [
    "src/index.ts",
    "src/service/gate/resolve-write.ts",
    "app/desktop/main.ts",
    "test/门禁引擎/x.test.ts",
    "README.md",
    "package.json",
    "任意文件.txt",
    "角色卡_new/x.md", // 近似前缀，不得被 角色卡/ 目录条目误覆盖
  ]) {
    const d = resolveWrite(target, b, undefined, ctx);
    assert.equal(d.allowed, false, `创世不得放行非治理产物：${target}`);
    assert.match(d.reason, /未匹配任何边界条目/);
  }
  // 项目根外的绝对路径 → 不在任何受治理根之内
  const outside = resolveWrite(OUTSIDE_ABS, b, undefined, ctx);
  assert.equal(outside.allowed, false, "项目根外路径应拒");
  assert.match(outside.reason, /不在任何受治理根/);
});

// ———————————— 4) 回归：不设 genesisBootstrap → 行为与改动前逐字相同 ————————————

test("T31 回归：不设 genesisBootstrap → su 仍回退内置未接受边界（skill 根），拒一切写", async () => {
  const noGenesis: ProjectConfig = { projectRoot: PROJ, skillRoot: SKILL, roles: {} };
  const b = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, noGenesis);
  // 逐字等于内置未接受边界（创世分支未触发，与改动前一致）
  assert.deepEqual(b, builtInBoundarySection());
  assert.equal(b.acceptance.accepted, false, "无 bootstrap → 内置边界未接受");
  // 即便路径恰在治理产物名下，未接受 → F6 拒绝一切写
  for (const target of ["角色卡/X/role-card.md", "docs/a.md", ".ans/project.json", "src/x.ts"]) {
    const d = resolveWrite(target, b, undefined, ctx);
    assert.equal(d.allowed, false, `未接受边界应拒一切写：${target}`);
    assert.match(d.reason, /F6|未被接受|边界解析失败/);
  }
});

// ———————————— 5) 自终止：项目边界就位并 pin 后，创世放行不再生效 ————————————

test("T31 自终止：项目治理边界写出并 pin 后，genesisBootstrap 残留也不再生效（项目覆盖接管）", async () => {
  // 项目自己的治理边界文档：**故意只给 docs/**（不给 角色卡/），以便与创世种子区分开。
  const rel = "角色卡/governance-boundary.yaml";
  mkdirSync(join(PROJ, "角色卡"), { recursive: true });
  const abs = join(PROJ, "角色卡", "governance-boundary.yaml");
  writeFileSync(
    abs,
    [
      "role: 治理边界",
      "entries:",
      "  - kind: conditional-directory",
      "    path: docs/",
      "    condition: docs-bootstrap",
      "    root: project",
      "    purpose: 项目级文档脚手架（项目自己的边界）",
      "",
    ].join("\n"),
  );
  const sha256 = await sha256File(abs);

  const project: ProjectConfig = {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: {},
    // 项目治理边界文档已登记（path 非空）——即 §10.1 的「项目覆盖」分支条件
    governanceBoundary: {
      path: rel,
      acceptance: { accepted: true, source: "pin:project-boundary", pin: [{ path: rel, sha256 }] },
    },
    // ★ 关键：genesisBootstrap 仍残留——自终止必须**结构上**生效，不靠调用方清除该字段
    genesisBootstrap: { source: OPERATOR_INSTRUCTION },
  };

  const b = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, project);
  // 走的是项目覆盖（第 2 步），不是创世种子（第 3 步）
  assert.equal(b.boundarySource, rel);
  assert.equal(b.acceptance.source, "pin:project-boundary", "应使用项目边界证据，而非创世 source");
  assert.deepEqual(b.entries.map((e) => e.path), ["docs"], "应是项目自己声明的条目");

  // 项目边界未覆盖 角色卡/ ⇒ 创世能写、现在**写不了**（scope:undefined 下同样写不了，证明授权真的变了）
  const d = resolveWrite("角色卡/Y/role-card.md", b, undefined, ctx);
  assert.equal(d.allowed, false, "项目边界就位后，创世放行的 角色卡/X 写入必须失效");
  assert.match(d.reason, /未匹配任何边界条目/);
  // 项目边界覆盖的 docs/ 仍可用（对照：项目边界被正常采用；此处项目边界 docs/ 仍是条件目录，故需声明 slug）
  assert.equal(
    resolveWrite("docs/x.md", b, scope(["docs/x.md"], ["docs-bootstrap"]), ctx).allowed,
    true,
  );
});

test("T31 自终止（对照）：同项目**不设** genesisBootstrap 时结果一致——证明创世非放行因素", async () => {
  const rel = "角色卡/governance-boundary.yaml";
  const abs = join(PROJ, "角色卡", "governance-boundary.yaml");
  const sha256 = await sha256File(abs);
  const base = {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: {},
    governanceBoundary: {
      path: rel,
      acceptance: { accepted: true, source: "pin:project-boundary", pin: [{ path: rel, sha256 }] },
    },
  };
  const without = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, base as ProjectConfig);
  const withGenesis = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, {
    ...(base as ProjectConfig),
    genesisBootstrap: { source: OPERATOR_INSTRUCTION },
  });
  assert.deepEqual(withGenesis, without, "项目覆盖就位后，genesisBootstrap 的有无不再改变结果");
});

// ———————————— 6) 留痕：依据随边界带出、留痕路径可写；resolveRole 亦贯通 ————————————

test("T31 留痕：acceptance.source 携操作者指令，且 scope:undefined 下 docs/bootstrap-manifest.md 可写", async () => {
  const project = genesisProject();
  // resolveRole 贯通（治理会话入口经它取边界）
  const role = await resolveRole(BUILT_IN_GOVERNANCE_ROLE_ID, project);
  assert.equal(role.kind, "built-in-governance");
  assert.equal(role.boundary.acceptance.source, OPERATOR_INSTRUCTION);
  const d = resolveWrite("docs/bootstrap-manifest.md", role.boundary, undefined, ctx);
  assert.equal(d.allowed, true, "留痕路径（manifest）在创世下应可写（无需 scope）");
});

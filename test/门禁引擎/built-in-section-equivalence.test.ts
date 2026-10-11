// 门禁引擎测试：内置边界提取的等价性（本角色独立验证，非复用他人用例）
// 目的：证明 listProject 改动引入的 builtInBoundarySection() 提取与 resolveBoundarySection
// 分支 3（内置）返回**完全一致**，且对内置角色 su 的 fail-closed 语义未被破坏。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILT_IN_GOVERNANCE_ROLE_ID,
  BUILT_IN_SOURCE,
  builtInBoundarySection,
  resolveBoundarySection,
} from "../../src/common/门禁引擎/boundary-core.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

// 无治理边界、无 roles 的项目：resolveBoundarySection 必落分支 3（内置）。
const PROJECT: ProjectConfig = {
  projectRoot: "C:/proj",
  skillRoot: "C:/skill",
  roles: {},
};

// 分支 3 的**金标准**字面量：内置边界应与之逐字段一致。
const EXPECTED_BUILT_IN: BoundarySection1 = {
  entries: [
    { root: "skill", path: "SKILL.md", kind: "file", purpose: "治理规则、不变量、检查点" },
    { root: "skill", path: "SKILL.zh.md", kind: "file", purpose: "治理规则（中文）" },
    {
      root: "skill",
      path: "references",
      kind: "conditional-directory",
      condition: "reference-maintenance",
      purpose: "角色卡与边界文档格式的参考文档",
    },
    {
      root: "skill",
      path: "docs",
      kind: "conditional-directory",
      condition: "docs-bootstrap",
      purpose: "design/feature/change/fix 文档脚手架",
    },
    {
      root: "skill",
      path: "角色卡",
      kind: "conditional-directory",
      condition: "role-restructuring",
      purpose: "角色目录（role-card.md / boundary.md / changelog.md）",
    },
  ],
  boundarySource: BUILT_IN_SOURCE,
  acceptance: { accepted: false, source: "" },
};

test("等价性：builtInBoundarySection() 与内置分支的金标准字面量逐字段一致（含无 parseError）", () => {
  const built = builtInBoundarySection();
  assert.deepEqual(built, EXPECTED_BUILT_IN);
  // 明确断言无 parseError 字段（分支 3 从不带 parseError）
  assert.equal(built.parseError, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(built, "parseError"), false);
});

test("等价性：resolveBoundarySection 分支 3 与 builtInBoundarySection() 返回内容完全一致（su 与任意未知角色皆然）", async () => {
  const direct = builtInBoundarySection();
  const viaSu = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, PROJECT);
  const viaUnknown = await resolveBoundarySection("某个并不存在的角色", PROJECT);
  assert.deepEqual(viaSu, direct);
  assert.deepEqual(viaUnknown, direct);
  assert.deepEqual(viaSu, EXPECTED_BUILT_IN);
});

test("等价性：accepted 恒为 false 且 source 为空串（fail-closed 的证据来源恒定）", async () => {
  const viaSu = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, PROJECT);
  assert.equal(viaSu.acceptance.accepted, false);
  assert.equal(viaSu.acceptance.source, "");
});

test("等价性：每次调用返回全新数组，互不共享可变状态（与改动前内联构造一致）", () => {
  const a = builtInBoundarySection();
  const b = builtInBoundarySection();
  assert.notEqual(a.entries, b.entries, "两次调用不应共享同一数组实例");
  assert.notEqual(a.acceptance, b.acceptance, "两次调用不应共享同一 acceptance 实例");
  // 篡改 a 不应影响 b
  a.entries.push({ root: "skill", path: "X", kind: "file", purpose: "t" });
  a.acceptance.accepted = true;
  assert.equal(b.entries.length, EXPECTED_BUILT_IN.entries.length);
  assert.equal(b.acceptance.accepted, false);
});

test("fail-closed 未被破坏：对内置角色 su 的边界，resolveWrite 拒绝一切写入（F6）", async () => {
  const boundary = await resolveBoundarySection(BUILT_IN_GOVERNANCE_ROLE_ID, PROJECT);
  const ctx = { skillRoot: "C:/skill", projectRoot: "C:/proj" };
  // 即便目标正好落在内置条目所覆盖的 skill 根路径上，也一律拒绝（acceptance 未接受）。
  for (const target of ["C:/skill/SKILL.md", "C:/skill/references/x.md", "C:/proj/任意.ts"]) {
    const d = resolveWrite(target, boundary, undefined, ctx);
    assert.equal(d.allowed, false, `${target} 不应被放行`);
    assert.match(d.reason, /未被接受|F6/, `${target} 的拒绝理由应指出接受门未过`);
  }
});

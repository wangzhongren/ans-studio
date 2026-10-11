// 门禁引擎测试：ProjectConfig.builtInRoles（会话式入口闸）对解析逻辑是惰性的
// 门禁引擎本身不消费该字段（仅数据）；resolveRole 对未登记角色仍照旧下沉为 built-in-governance。
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";

const ROOT = mkdtempSync(join(tmpdir(), "builtin-roles-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
mkdirSync(PROJ, { recursive: true });
mkdirSync(SKILL, { recursive: true });

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

test("builtInRoles：声明 su 不改变 resolveRole 的解析结果（仍下沉为内置治理角色且不抛错）", async () => {
  const project: ProjectConfig = {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: { 编排: { card: "role-card.md", boundary: "boundary.md" } }, // 不含 su
    builtInRoles: ["su"],
  };
  const role = await resolveRole("su", project);
  assert.equal(role.kind, "built-in-governance");
  assert.equal(role.location.card, "");
});

test("builtInRoles：未设置时行为不变——未登记角色照样下沉为内置治理角色", async () => {
  const project: ProjectConfig = {
    projectRoot: PROJ,
    skillRoot: SKILL,
    roles: {},
  };
  const role = await resolveRole("su", project);
  assert.equal(role.kind, "built-in-governance");
  assert.equal(role.location.card, "");
});

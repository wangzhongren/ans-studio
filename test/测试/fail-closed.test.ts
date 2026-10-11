// 测试角色:YAML fail-closed —— 构造坏边界,确认**整份解析失败且一切写入被拒**,
// 而不是"丢掉坏条目继续放行"。走真实解析路径(resolveBoundary → resolveWrite)。
// 每个坏样本都包含一个**合法条目** src/good.ts;若实现偷偷丢弃坏条目继续放行,
// src/good.ts 会被允许 —— 本测试断言它同样被拒,以此证伪该行为。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const ROOT = mkdtempSync(path.join(tmpdir(), "failclosed-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

let counter = 0;

/** 在临时项目根写下坏 boundary.yaml,返回 resolveBoundary 结果。 */
async function loadBad(yaml: string) {
  const roleId = `坏角色${counter++}`;
  const rel = `角色卡/${roleId}/boundary.yaml`;
  const abs = path.join(ROOT, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, yaml, "utf8");

  const project: ProjectConfig = {
    projectRoot: ROOT,
    skillRoot: path.join(ROOT, "skill"),
    roles: { [roleId]: { card: `角色卡/${roleId}/role-card.md`, boundary: rel } },
    governanceBoundary: { path: rel, acceptance: { accepted: true, source: "test:accept" } },
  };
  return { roleId, project };
}

const GOOD_ENTRY = `  - kind: file\n    path: src/good.ts\n    purpose: 合法条目\n`;

const BAD_CASES: Array<{ name: string; yaml: string }> = [
  { name: "未知顶层键", yaml: `role: x\nbogus: 1\nentries:\n${GOOD_ENTRY}` },
  { name: "entries 非数组", yaml: `role: x\nentries: not-an-array\n` },
  { name: "缺必填 purpose", yaml: `role: x\nentries:\n${GOOD_ENTRY}  - kind: file\n    path: src/bad.ts\n` },
  { name: "条目含未知键", yaml: `role: x\nentries:\n${GOOD_ENTRY}  - kind: file\n    path: src/bad.ts\n    purpose: p\n    foo: bar\n` },
  { name: "kind 非法", yaml: `role: x\nentries:\n${GOOD_ENTRY}  - kind: symlink\n    path: src/bad.ts\n    purpose: p\n` },
  { name: "root 非法", yaml: `role: x\nentries:\n${GOOD_ENTRY}  - kind: file\n    path: src/bad.ts\n    purpose: p\n    root: elsewhere\n` },
  {
    name: "conditional-directory 缺 condition",
    yaml: `role: x\nentries:\n${GOOD_ENTRY}  - kind: conditional-directory\n    path: src/cdir\n    purpose: p\n`,
  },
  {
    name: "condition 格式非法",
    yaml: `role: x\nentries:\n${GOOD_ENTRY}  - kind: conditional-directory\n    path: src/cdir\n    purpose: p\n    condition: Bad_Slug\n`,
  },
  { name: "YAML 语法错误", yaml: `role: x\nentries:\n  - kind: file\n   path: [unclosed\n` },
];

for (const c of BAD_CASES) {
  test(`fail-closed:${c.name} → 整份解析失败且一切写入被拒`, async () => {
    const { roleId, project } = await loadBad(c.yaml);
    const boundary = await resolveBoundary(roleId, project);

    // 1) 整份边界解析失败
    assert.ok(boundary.parseError && boundary.parseError.length > 0, `应有 parseError:${c.name}`);
    // 2) 视为未接受
    assert.notEqual(boundary.acceptance.accepted, true);
    // 3) 一切写入被拒 —— 包括本应合法的 src/good.ts(证明未"丢坏条目继续放行")
    const ctx = { skillRoot: project.skillRoot, projectRoot: project.projectRoot };
    const d = resolveWrite("src/good.ts", boundary, { writeSet: ["src/good.ts"], conditions: [] }, ctx);
    assert.equal(d.allowed, false, `src/good.ts 也必须被拒:${c.name}`);
    assert.match((d as { reason: string }).reason, /边界解析失败/);
  });
}

test("fail-closed 对照:同样含 src/good.ts 的**合法**边界 → src/good.ts 允许", async () => {
  const { roleId, project } = await loadBad(`role: x\nentries:\n${GOOD_ENTRY}`);
  const boundary = await resolveBoundary(roleId, project);
  assert.equal(boundary.parseError, undefined);
  const ctx = { skillRoot: project.skillRoot, projectRoot: project.projectRoot };
  const d = resolveWrite("src/good.ts", boundary, { writeSet: ["src/good.ts"], conditions: [] }, ctx);
  assert.equal(d.allowed, true);
});

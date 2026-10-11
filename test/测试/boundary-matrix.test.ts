// 测试角色:六角色边界矩阵 —— 每个角色取「边界内且在 writeSet 内→允许」
// 「越界→拒绝」「边界内但 writeSet 外→拒绝」三样本,验证行为一致。
// 独立走**服务层**(resolveRole → resolveWrite),边界取各角色真实的 boundary.yaml。

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDemoProjectConfig } from "../../src/index.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { TaskScope } from "../../src/model/decision.ts";

const ROLES = ["项目管理", "编排", "门禁引擎", "Pi适配器", "装配", "测试"];

const project = buildDemoProjectConfig();
const ctx = { skillRoot: project.skillRoot, projectRoot: project.projectRoot };

function scope(writeSet: string[], conditions: string[] = []): TaskScope {
  return { writeSet, conditions };
}

for (const roleId of ROLES) {
  test(`边界矩阵:${roleId}`, async () => {
    const role = await resolveRole(roleId, project);
    const boundary: BoundarySection1 = role.boundary;

    // 前提:该角色边界来自其真实 boundary.yaml 且已被演示接受(F6 通过)
    assert.equal(boundary.parseError, undefined, `${roleId} 边界不应解析失败`);
    assert.match(boundary.boundarySource, /boundary\.yaml$/, `${roleId} 边界来源应为 yaml`);
    assert.equal(boundary.acceptance.accepted, true);

    const fileEntry = boundary.entries.find((e) => e.kind === "file");
    const dirEntry = boundary.entries.find((e) => e.kind === "directory");
    assert.ok(fileEntry, `${roleId} 应有 file 条目`);
    assert.ok(dirEntry, `${roleId} 应有 directory 条目`);

    // ① 边界内且在 writeSet 内 → 允许
    const inPath = fileEntry.path;
    const d1 = resolveWrite(inPath, boundary, scope([inPath]), ctx);
    assert.equal(d1.allowed, true, `① 应允许:${inPath} (${roleId})`);

    // ② 边界内但不在 writeSet 内 → 拒绝(F4)
    const dirSample = dirEntry.path.replace(/\/$/, "") + "/联调样本.ts";
    const d2 = resolveWrite(dirSample, boundary, scope([inPath]), ctx);
    assert.equal(d2.allowed, false, `② 应拒绝:${dirSample} (${roleId})`);
    assert.match(d2.reason, /F4/, `② 拒绝理由应含 F4 (${roleId}): ${d2.reason}`);

    // ③ 越界(不在任何条目) → 拒绝,即便放进 writeSet 也不行
    const evil = "src/__evil__.ts";
    const d3 = resolveWrite(evil, boundary, scope([evil]), ctx);
    assert.equal(d3.allowed, false, `③ 应拒绝越界:${evil} (${roleId})`);
    // 拒绝信息按根分组(F10)
    assert.ok(d3.allowedByRoot && "skill" in d3.allowedByRoot && "project" in d3.allowedByRoot);
  });
}

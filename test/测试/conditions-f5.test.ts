// 测试角色:条件目录(F5)与接受门(F6)经**真实 YAML 解析**的独立验证。
// 不复制门禁引擎单测:这里从"临时项目 + 真实 boundary.yaml"出发,观察 resolveWrite 行为。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";

const ROOT = mkdtempSync(path.join(tmpdir(), "f5f6-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

function scope(writeSet: string[], conditions: string[] = []): TaskScope {
  return { writeSet, conditions };
}

/** 写一份含条件目录的边界,返回 project(可指定接受与否)。 */
function setup(accepted: boolean): ProjectConfig {
  const roleId = `F5角色${accepted}`;
  const rel = `角色卡/${roleId}/boundary.yaml`;
  const abs = path.join(ROOT, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    "role: x\nentries:\n  - kind: conditional-directory\n    path: src/cond/\n    condition: my-cond\n    purpose: 条件目录\n  - kind: file\n    path: src/always.ts\n    purpose: 普通文件\n",
    "utf8",
  );
  return {
    projectRoot: ROOT,
    skillRoot: path.join(ROOT, "skill"),
    roles: { [roleId]: { card: `角色卡/${roleId}/role-card.md`, boundary: rel } },
    governanceBoundary: { path: rel, acceptance: { accepted, source: accepted ? "test:accept" : "" } },
  };
}

const ctx = { skillRoot: path.join(ROOT, "skill"), projectRoot: ROOT };

test("F5:声明条件 → 条件目录下路径放行(仍须过 writeSet)", async () => {
  const project = setup(true);
  const boundary = await resolveBoundary("F5角色true", project);
  const d = resolveWrite("src/cond/a.ts", boundary, scope(["src/cond/a.ts"], ["my-cond"]), ctx);
  assert.equal(d.allowed, true);
});

test("F5:未声明条件 → 拒绝,理由为独立'缺少条件'且 allowedByRoot 不含该目录", async () => {
  const project = setup(true);
  const boundary = await resolveBoundary("F5角色true", project);
  const d = resolveWrite("src/cond/a.ts", boundary, scope(["src/cond/a.ts"], []), ctx);
  assert.equal(d.allowed, false);
  assert.match((d as { reason: string }).reason, /缺少条件/);
  assert.match((d as { reason: string }).reason, /my-cond/);
  assert.equal(d.allowedByRoot.project.includes("src/cond"), false, "未激活条件目录不计入允许路径");
});

test("F5:声明了**另一个**条件 → 仍拒绝", async () => {
  const project = setup(true);
  const boundary = await resolveBoundary("F5角色true", project);
  const d = resolveWrite("src/cond/a.ts", boundary, scope(["src/cond/a.ts"], ["other-cond"]), ctx);
  assert.equal(d.allowed, false);
});

test("F5:条件目录激活但不在 writeSet → F4 收窄拒绝", async () => {
  const project = setup(true);
  const boundary = await resolveBoundary("F5角色true", project);
  const d = resolveWrite("src/cond/a.ts", boundary, scope([], ["my-cond"]), ctx);
  assert.equal(d.allowed, false);
  assert.match((d as { reason: string }).reason, /F4/);
});

test("F5 对照:普通 file 不受 conditions 影响", async () => {
  const project = setup(true);
  const boundary = await resolveBoundary("F5角色true", project);
  const d = resolveWrite("src/always.ts", boundary, scope(["src/always.ts"], []), ctx);
  assert.equal(d.allowed, true);
});

test("F6:边界未被接受(accepted=false) → 拒绝一切写入", async () => {
  const project = setup(false);
  const boundary = await resolveBoundary("F5角色false", project);
  assert.notEqual(boundary.acceptance.accepted, true);
  const d = resolveWrite("src/always.ts", boundary, scope(["src/always.ts"], []), ctx);
  assert.equal(d.allowed, false);
  assert.match((d as { reason: string }).reason, /F6/);
});

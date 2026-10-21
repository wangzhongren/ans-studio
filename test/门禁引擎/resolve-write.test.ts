// 门禁引擎单元测试：resolveWrite（本版心脏）——覆盖契约 §3 列出的每条
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { resolveWrite } from "../../src/service/gate/resolve-write.ts";

// 在真实临时目录下建根，确保 realpath 解析的祖先真实存在
const ROOT = mkdtempSync(join(tmpdir(), "gate-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
const OUT = join(ROOT, "outside");
mkdirSync(join(PROJ, "src"), { recursive: true });
mkdirSync(join(SKILL, "src"), { recursive: true });
mkdirSync(OUT, { recursive: true });

const ctx = { skillRoot: SKILL, projectRoot: PROJ };

function insideLink(root: "project" | "skill") {
  const rootAbs = root === "project" ? PROJ : SKILL;
  const base = mkdtempSync(join(rootAbs, "d3-"));
  const allowed = join(base, "allowed");
  const actual = join(base, "private");
  mkdirSync(allowed);
  mkdirSync(actual);
  writeFileSync(join(actual, "existing.ts"), "original");
  symlinkSync(actual, join(allowed, "link"), process.platform === "win32" ? "junction" : "dir");
  const rel = (path: string) => relative(rootAbs, path).replace(/\\/g, "/");
  return {
    allowed: rel(allowed), actual: rel(actual),
    target: (tail: string) => join(allowed, "link", tail),
    alias: (tail: string) => rel(join(allowed, "link", tail)),
    real: (tail: string) => rel(join(actual, tail)),
  };
}

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
});

const ACC = { accepted: true, source: "test:unit" };

function bnd(entries: any[], acceptance: any = ACC): any {
  return { entries, boundarySource: "test", acceptance };
}
function file(root: string, path: string): any {
  return { root, path, kind: "file", purpose: "t" };
}
function dir(root: string, path: string): any {
  return { root, path, kind: "directory", purpose: "t" };
}
function cdir(root: string, path: string, condition: string): any {
  return { root, path, kind: "conditional-directory", condition, purpose: "t" };
}
function scope(writeSet: string[], conditions: string[] = []): any {
  return { writeSet, conditions };
}

for (const root of ["project", "skill"] as const) {
  test(`D3 ${root}：根内链接不能把目录授权扩到真实目标（已有文件及不存在尾部）`, () => {
    const f = insideLink(root);
    for (const tail of ["existing.ts", "new/deep.ts"]) {
      const d = resolveWrite(f.target(tail), bnd([dir(root, f.allowed)]), undefined, ctx);
      assert.equal(d.allowed, false);
      assert.match(d.reason, /真实目标.*未获授权/);
      assert.ok(d.reason.includes(f.alias(tail)));
      assert.ok(d.reason.includes(f.real(tail)));
    }
  });

  test(`D3 ${root}：输入和真实路径分别匹配角色边界及任务精确写集`, () => {
    const f = insideLink(root);
    const tail = "existing.ts";
    const both = bnd([dir(root, f.allowed), dir(root, f.actual)]);
    const aliasOnly = resolveWrite(f.target(tail), both, scope([f.alias(tail)]), ctx);
    assert.equal(aliasOnly.allowed, false);
    assert.match(aliasOnly.reason, /真实目标.*F4/);
    const actualOnly = resolveWrite(f.target(tail), both, scope([f.real(tail)]), ctx);
    assert.equal(actualOnly.allowed, false);
    assert.match(actualOnly.reason, /F4/);
    assert.equal(resolveWrite(f.target(tail), both, scope([f.alias(tail), f.real(tail)]), ctx).allowed, true);
    assert.equal(resolveWrite(f.target(tail), both, undefined, ctx).allowed, true);
    assert.equal(resolveWrite(f.target(tail), bnd([dir(root, f.actual)]), undefined, ctx).allowed, false);
  });

  test(`D3 ${root}：真实路径的条件目录仍须激活，另一根的同名授权不能替代`, () => {
    const f = insideLink(root);
    const tail = "new.ts";
    const set = [f.alias(tail), f.real(tail)];
    const conditional = bnd([dir(root, f.allowed), cdir(root, f.actual, "docs-bootstrap")]);
    const d = resolveWrite(f.target(tail), conditional, scope(set), ctx);
    assert.equal(d.allowed, false);
    assert.match(d.reason, /真实目标.*缺少条件.*docs-bootstrap/);
    assert.equal(resolveWrite(f.target(tail), conditional, scope(set, ["docs-bootstrap"]), ctx).allowed, true);
    const cross = bnd([dir(root, f.allowed), dir(root === "project" ? "skill" : "project", f.actual)]);
    assert.equal(resolveWrite(f.target(tail), cross, scope(set), ctx).allowed, false);
  });
}

test("D3：合法链接项目根与技能根以真实根计算相对授权", () => {
  const projectLink = join(ROOT, "project-root-link");
  const skillLink = join(ROOT, "skill-root-link");
  symlinkSync(PROJ, projectLink, process.platform === "win32" ? "junction" : "dir");
  symlinkSync(SKILL, skillLink, process.platform === "win32" ? "junction" : "dir");
  const linkedCtx = { projectRoot: projectLink, skillRoot: skillLink };
  const b = bnd([dir("project", "src"), dir("skill", "src")]);
  assert.equal(resolveWrite("src/new.ts", b, scope(["src/new.ts"]), linkedCtx).allowed, true);
  assert.equal(resolveWrite(join(skillLink, "src", "new.ts"), b, scope(["src/new.ts"]), linkedCtx).allowed, true);
});

// ---- F6：未接受边界 ----
test("F6：acceptance.accepted 非 true → 拒绝", () => {
  const b = bnd([dir("project", "src")], { accepted: false, source: "x" });
  const d = resolveWrite("src/a.ts", b, scope(["src/a.ts"]), ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /F6/);
});

test("F6：accepted 为 true 但 source 为空 → 拒绝", () => {
  const b = bnd([dir("project", "src")], { accepted: true, source: "" });
  const d = resolveWrite("src/a.ts", b, scope(["src/a.ts"]), ctx);
  assert.equal(d.allowed, false);
});

test("F6：accepted 为 true 且 source 非空 → 通过接受门", () => {
  const b = bnd([dir("project", "src")]);
  assert.equal(resolveWrite("src/a.ts", b, scope(["src/a.ts"]), ctx).allowed, true);
});

// ---- file 精确 / directory 目录下 ----
test("file：精确匹配允许，同目录其他文件不匹配", () => {
  const b = bnd([file("project", "src/model/boundary.ts")]);
  assert.equal(
    resolveWrite("src/model/boundary.ts", b, scope(["src/model/boundary.ts"]), ctx).allowed,
    true,
  );
  assert.equal(
    resolveWrite("src/model/other.ts", b, scope(["src/model/other.ts"]), ctx).allowed,
    false,
  );
});

test("directory：目录下任意路径（含目录自身）允许", () => {
  const b = bnd([dir("project", "src/gate")]);
  assert.equal(resolveWrite("src/gate/a.ts", b, scope(["src/gate/a.ts"]), ctx).allowed, true);
  assert.equal(resolveWrite("src/gate", b, scope(["src/gate"]), ctx).allowed, true);
});

// ---- F5：conditional-directory（条件为固定 slug）----
test("F5：条件目录 + 任务未声明该条件 → 拒绝，理由含缺失 slug，allowedByRoot 不含该目录", () => {
  const b = bnd([cdir("project", "docs", "docs-bootstrap"), dir("project", "src")]);
  const d = resolveWrite("docs/a.md", b, scope(["docs/a.md"], []), ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /缺少条件/);
  assert.match(d.reason, /docs-bootstrap/);
  assert.equal(d.allowedByRoot.project.includes("docs"), false);
  assert.equal(d.allowedByRoot.project.includes("src"), true);
});

test("F5：条件目录 + 任务声明该条件 → 放行（仍须过 F4 writeSet）", () => {
  const b = bnd([cdir("project", "docs", "docs-bootstrap")]);
  // 声明条件且在 writeSet 内 → 放行
  assert.equal(resolveWrite("docs/a.md", b, scope(["docs/a.md"], ["docs-bootstrap"]), ctx).allowed, true);
  // 声明条件但不在 writeSet 内 → 仍被 F4 拒绝
  const f4 = resolveWrite("docs/a.md", b, scope(["other.md"], ["docs-bootstrap"]), ctx);
  assert.equal(f4.allowed, false);
  assert.match(f4.reason, /writeSet/);
});

test("F5：缺失条件与‘未匹配任何条目’是两种不同拒绝理由", () => {
  const b = bnd([cdir("project", "docs", "docs-bootstrap"), dir("project", "src")]);
  const missing = resolveWrite("docs/a.md", b, scope(["docs/a.md"], []), ctx);
  assert.equal(missing.allowed, false);
  assert.match(missing.reason, /缺少条件/);
  const nomatch = resolveWrite("nowhere/x.ts", b, scope(["nowhere/x.ts"], []), ctx);
  assert.equal(nomatch.allowed, false);
  assert.match(nomatch.reason, /未匹配任何边界条目/);
  assert.notEqual(missing.reason, nomatch.reason);
});

test("F5 对照：普通 directory 不受 conditions 影响", () => {
  const b2 = bnd([dir("project", "docs")]);
  assert.equal(resolveWrite("docs/a.md", b2, scope(["docs/a.md"], []), ctx).allowed, true);
});

test("F5：condition slug 格式不合法 → 不激活（不放行）", () => {
  // 直接构造一个非法 slug（模拟未经解析校验的坏数据）
  const bad = { root: "project", path: "docs", kind: "conditional-directory", condition: "Docs Bootstrap!", purpose: "t" };
  const b = bnd([bad]);
  const d = resolveWrite("docs/a.md", b, scope(["docs/a.md"], ["Docs Bootstrap!"]), ctx);
  assert.equal(d.allowed, false);
  assert.equal(d.allowedByRoot.project.includes("docs"), false);
});

// ---- F4：任务级 writeSet 收窄 ----
test("F4：边界内但不在 writeSet 内 → 拒绝；在 writeSet 内 → 允许", () => {
  const b = bnd([dir("project", "src")]);
  const d = resolveWrite("src/evil.ts", b, scope(["src/ok.ts"]), ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /writeSet/);
  assert.equal(resolveWrite("src/ok.ts", b, scope(["src/ok.ts"]), ctx).allowed, true);
});

// ---- 跨根混淆 ----
test("跨根混淆：项目相对路径命中技能条目 → 拒绝", () => {
  const b = bnd([dir("skill", "src")]);
  const d = resolveWrite("src/x.ts", b, scope(["src/x.ts"]), ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /跨根/);
});

test("跨根混淆：技能绝对路径命中项目条目 → 拒绝", () => {
  const b = bnd([dir("project", "src")]);
  const absSkill = join(SKILL, "src", "x.ts");
  const d = resolveWrite(absSkill, b, scope(["src/x.ts"]), ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /跨根/);
});

// ---- 规范化 ----
test("规范化：../ 穿越与绝对路径越根", () => {
  const b = bnd([dir("project", "src"), file("project", "src/ok.ts")]);
  // 词法穿越后落在边界外 → 拒绝
  assert.equal(resolveWrite("src/../evil.ts", b, scope(["evil.ts"]), ctx).allowed, false);
  // "." 折叠后仍在边界内 → 允许
  assert.equal(resolveWrite("src/./ok.ts", b, scope(["src/ok.ts"]), ctx).allowed, true);
  // 绝对路径穿越出根 → 拒绝
  assert.equal(resolveWrite(join(PROJ, "..", "evil.ts"), b, scope(["evil.ts"]), ctx).allowed, false);
});

test("规范化：Windows 反斜杠等价", () => {
  const b = bnd([dir("project", "src/gate")]);
  assert.equal(resolveWrite("src\\gate\\a.ts", b, scope(["src/gate/a.ts"]), ctx).allowed, true);
});

test("规范化：Windows 大小写不敏感（仅 win32）", (t) => {
  if (process.platform !== "win32") return t.skip("仅 Windows");
  const b = bnd([dir("project", "Src/Gate")]);
  assert.equal(resolveWrite("src/gate/a.ts", b, scope(["src/gate/a.ts"]), ctx).allowed, true);
  assert.equal(resolveWrite("SRC\\GATE\\A.TS", b, scope(["src/gate/a.ts"]), ctx).allowed, true);
});

test("规范化：绝对与相对混合一致", () => {
  const b = bnd([dir("project", "src")]);
  assert.equal(resolveWrite(join(PROJ, "src", "a.ts"), b, scope(["src/a.ts"]), ctx).allowed, true);
  assert.equal(resolveWrite("src/a.ts", b, scope(["src/a.ts"]), ctx).allowed, true);
});

// ---- F7：符号链接 / junction 逃逸 ----
test("F7：符号链接/junction 逃逸出根 → 拒绝", (t) => {
  const linkPath = join(PROJ, "link");
  const type = process.platform === "win32" ? "junction" : "dir";
  try {
    symlinkSync(OUT, linkPath, type);
  } catch {
    return t.skip("无法创建符号链接/junction（可能需权限）");
  }
  // 若 link 只是普通目录，link/evil.ts 本应被允许（目录条目 + writeSet 命中）；
  // 但它是指向根外的 junction，真实路径逃逸 → 必须拒绝。
  const b = bnd([dir("project", "link")]);
  const d = resolveWrite("link/evil.ts", b, scope(["link/evil.ts"]), ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /F7|逃逸/);
});

// ---- F10：拒绝时按根分组 ----
test("F10：拒绝信息按根分组列出允许路径", () => {
  const b = bnd([dir("project", "src"), file("project", "src/a.ts"), dir("skill", "references")]);
  const d = resolveWrite("nope/x.ts", b, scope(["nope/x.ts"]), ctx);
  assert.equal(d.allowed, false);
  assert.deepEqual(d.allowedByRoot.project.slice().sort(), ["src", "src/a.ts"].sort());
  assert.deepEqual(d.allowedByRoot.skill, ["references"]);
});

// ---- scope 可选：chat / standalone 会话（无预存任务）----
test("scope 可选：无 scope 时仅按边界判定（边界内允许，边界外拒绝）", () => {
  const b = bnd([dir("project", "src"), file("project", "src/a.ts")]);
  // 边界内 → 允许（不因缺 writeSet 而全拒）
  assert.equal(resolveWrite("src/a.ts", b, undefined, ctx).allowed, true);
  assert.equal(resolveWrite("src/any.ts", b, undefined, ctx).allowed, true);
  // 边界外 → 拒绝，理由为"未匹配任何边界条目"
  const d = resolveWrite("evil/x.ts", b, undefined, ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /未匹配任何边界条目/);
});

test("scope 可选：有 scope 时 F4 照旧（回归）；无 scope 不抛错", () => {
  const b = bnd([dir("project", "src")]);
  // 无 scope → 边界内允许，不抛错
  assert.equal(resolveWrite("src/ok.ts", b, undefined, ctx).allowed, true);
  // 有 scope → 边界内但 writeSet 外仍拒绝（F4 回归）
  const d = resolveWrite("src/evil.ts", b, scope(["src/ok.ts"]), ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /writeSet/);
  assert.equal(resolveWrite("src/ok.ts", b, scope(["src/ok.ts"]), ctx).allowed, true);
});

test("scope 可选：无 scope 时条件目录仍需声明条件（无声明即不激活，fail-closed）", () => {
  const b = bnd([cdir("project", "docs", "docs-bootstrap")]);
  const d = resolveWrite("docs/a.md", b, undefined, ctx);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /缺少条件/);
  assert.equal(d.allowedByRoot.project.includes("docs"), false);
});

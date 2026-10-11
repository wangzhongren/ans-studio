// 测试角色:F7 符号链接/junction 逃逸的独立验证(真实文件系统)。
// 建一个指向根之外的 junction/symlink,确认经它写入被拒。
// 若本机不允许创建链接(权限),用例 skip 并如实记录"无法运行",不算通过。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";

const ROOT = mkdtempSync(path.join(tmpdir(), "f7-"));
const PROJ = path.join(ROOT, "proj");
const SKILL = path.join(ROOT, "skill");
const OUTSIDE = path.join(ROOT, "outside");
mkdirSync(path.join(PROJ, "src"), { recursive: true });
mkdirSync(SKILL, { recursive: true });
mkdirSync(OUTSIDE, { recursive: true });

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const boundary: BoundarySection1 = {
  entries: [{ root: "project", path: "src", kind: "directory", purpose: "t" }],
  boundarySource: "test",
  acceptance: { accepted: true, source: "test:accept" },
};
const ctx = { skillRoot: SKILL, projectRoot: PROJ };

function makeLink(linkPath: string): boolean {
  // Windows: junction 无需管理员权限;POSIX: dir symlink
  try {
    symlinkSync(OUTSIDE, linkPath, "junction");
    return true;
  } catch {
    try {
      symlinkSync(OUTSIDE, linkPath, "dir");
      return true;
    } catch {
      return false;
    }
  }
}

test("F7:经 junction/符号链接逃逸出根 → 拒绝", () => {
  const link = path.join(PROJ, "src", "link");
  if (!makeLink(link)) {
    test.skip("本机不允许创建 junction/symlink —— 无法运行");
    return;
  }
  assert.equal(existsSync(link), true);
  const d = resolveWrite("src/link/evil.ts", boundary, { writeSet: ["src/link/evil.ts"], conditions: [] }, ctx);
  assert.equal(d.allowed, false, "经链接逃逸必须被拒");
  assert.match((d as { reason: string }).reason, /F7|逃逸/);
});

test("F7 对照:根内的普通路径仍允许", () => {
  const d = resolveWrite("src/ok.ts", boundary, { writeSet: ["src/ok.ts"], conditions: [] }, ctx);
  assert.equal(d.allowed, true);
});

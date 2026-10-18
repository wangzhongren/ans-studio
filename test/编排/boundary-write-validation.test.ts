// test/编排/boundary-write-validation.test.ts
// 2026-10-18 真机修复：写前校验 `角色卡/<id>/boundary.yaml` 内容。
// 非法顶层键（version/roleId/root 等）⇒ 拒绝写入、零文件副作用；合法模板通过；
// role-card.md 与其他路径不校验内容；edit_file 改坏也拒绝且文件保持不变。
//
// 纯离线：临时目录 + allow 写门禁；不读 .env、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow } from "../runtime-core/fixtures.ts";

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-boundary-write-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

function toolsFor(root: string): Map<string, ReturnType<typeof buildGovernedTools>[number]> {
  const tools = buildGovernedTools(allow, { writeRoot: root, roleId: "nominator", runtime: "claude" });
  return new Map(tools.map((tool) => [tool.name, tool]));
}

const VALID_BOUNDARY = [
  "role: X",
  "entries:",
  "  - kind: file",
  "    path: src/a.ts",
  "    purpose: 测试条目",
  "",
].join("\n");

test("非法 boundary.yaml 顶层键（version/roleId/root）⇒ 拒绝写入且零文件", async () => {
  await withRoot(async (root) => {
    for (const extra of ["version: 1", "roleId: X", "root: project"]) {
      const path = "角色卡/X/boundary.yaml";
      const content = `role: X\n${extra}\nentries: []\n`;
      const result = await toolsFor(root).get("write_file")!.handler({
        name: "write_file",
        args: { path, content },
      });
      assert.equal(result.ok, false, `${extra} 必须被拒`);
      assert.match(result.message, /boundary\.yaml 格式非法/);
      assert.match(result.message, /顶层只允许 role \/ entries \/ archived/);
      assert.match(result.message, /未写入/);
      assert.equal(existsSync(join(root, path)), false, `${extra} 不得产生文件`);
      assert.equal(existsSync(join(root, "角色卡", "X")), false, "不得预建目录");
    }
  });
});

test("合法 boundary.yaml 模板通过并落盘", async () => {
  await withRoot(async (root) => {
    const path = "角色卡/X/boundary.yaml";
    const result = await toolsFor(root).get("write_file")!.handler({
      name: "write_file",
      args: { path, content: VALID_BOUNDARY },
    });
    assert.equal(result.ok, true, result.message);
    assert.equal(readFileSync(join(root, ...path.split("/")), "utf8"), VALID_BOUNDARY);
  });
});

test("绝对路径指向 boundary.yaml 同样校验；role-card.md 与其他路径不校验内容", async () => {
  await withRoot(async (root) => {
    const absoluteBoundary = join(root, "角色卡", "Y", "boundary.yaml");
    const invalid = await toolsFor(root).get("write_file")!.handler({
      name: "write_file",
      args: { path: absoluteBoundary, content: "role: Y\nversion: 2\nentries: []\n" },
    });
    assert.equal(invalid.ok, false);
    assert.match(invalid.message, /boundary\.yaml 格式非法/);
    assert.equal(existsSync(absoluteBoundary), false);

    const roleCard = await toolsFor(root).get("write_file")!.handler({
      name: "write_file",
      args: { path: "角色卡/Y/role-card.md", content: "version: 1\nroleId: Y\n# 合法/非法都不校验\n" },
    });
    assert.equal(roleCard.ok, true, "role-card.md 不校验内容");

    const other = await toolsFor(root).get("write_file")!.handler({
      name: "write_file",
      args: { path: "docs/notes.yaml", content: "version: 1\nroot: project\n" },
    });
    assert.equal(other.ok, true, "其他路径不校验内容");
  });
});

test("edit_file 把合法 boundary.yaml 改坏 ⇒ 拒绝且文件保持不变", async () => {
  await withRoot(async (root) => {
    const path = "角色卡/X/boundary.yaml";
    const tools = toolsFor(root);
    const created = await tools.get("write_file")!.handler({
      name: "write_file",
      args: { path, content: VALID_BOUNDARY },
    });
    assert.equal(created.ok, true);
    const before = readFileSync(join(root, ...path.split("/")), "utf8");

    const edited = await tools.get("edit_file")!.handler({
      name: "edit_file",
      args: {
        path,
        old_string: "entries:",
        new_string: "version: 9\nentries:",
      },
    });
    assert.equal(edited.ok, false);
    assert.match(edited.message, /boundary\.yaml 格式非法/);
    assert.equal(readFileSync(join(root, ...path.split("/")), "utf8"), before, "文件保持不变");
  });
});

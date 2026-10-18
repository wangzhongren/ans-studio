import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-boundary-guard-"));

function fixture(root: string) {
  const tools = buildGovernedTools(allow, { readRoot: root, writeRoot: root });
  return new Map(tools.map((tool) => [tool.name, tool]));
}

const call = (name: string, args: Record<string, unknown>) => ({ name, args });

const VALID = [
  "role: new-role",
  "entries:",
  "  - kind: directory",
  "    path: src",
  "    purpose: 源码目录",
  "",
].join("\n");

function invalidYamlWithTopKey(key: string): string {
  return [`${key}: ${key === "root" ? "project" : "1"}`, "role: new-role", "entries: []", ""].join("\n");
}

test("非法顶层 version/roleId/root：write_file 拒写且零文件副作用（目录都不创建）", async () => {
  const root = await temp();
  try {
    const byName = fixture(root);
    for (const key of ["version", "roleId", "root"]) {
      const roleId = `role-${key}`;
      const target = `角色卡/${roleId}/boundary.yaml`;
      const result = await byName.get("write_file")!.handler(call("write_file", { path: target, content: invalidYamlWithTopKey(key) }));
      assert.equal(result.ok, false, `${key} 顶层键必须拒写`);
      assert.match(result.message, new RegExp(`未知顶层键：${key}`));
      assert.match(result.message, /顶层只允许 role \/ entries \/ archived/);
      assert.equal(existsSync(path.join(root, "角色卡", roleId)), false, "拒写发生在任何文件系统副作用之前（含 mkdir）");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("合法模板放行并落盘；前置 ./ 与绝对路径同样受校验", async () => {
  const root = await temp();
  try {
    const byName = fixture(root);
    const write = await byName.get("write_file")!.handler(call("write_file", { path: "角色卡/new-role/boundary.yaml", content: VALID }));
    assert.equal(write.ok, true);
    const written = await readFile(path.join(root, "角色卡", "new-role", "boundary.yaml"), "utf8");
    assert.equal(written, VALID);

    // 前置 `./` 的非法写仍被同一校验拦截。
    const dotted = await byName.get("write_file")!.handler(call("write_file", { path: "./角色卡/dotted-role/boundary.yaml", content: invalidYamlWithTopKey("version") }));
    assert.equal(dotted.ok, false);
    assert.equal(existsSync(path.join(root, "角色卡", "dotted-role")), false);

    // 项目根内绝对路径的非法写同样被拦截。
    const absoluteTarget = path.join(root, "角色卡", "abs-role", "boundary.yaml");
    const absolute = await byName.get("write_file")!.handler(call("write_file", { path: absoluteTarget, content: invalidYamlWithTopKey("roleId") }));
    assert.equal(absolute.ok, false);
    assert.equal(existsSync(path.join(root, "角色卡", "abs-role")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("role-card.md 与其他路径不校验内容（不受 boundary.yaml 规则波及）", async () => {
  const root = await temp();
  try {
    const byName = fixture(root);
    const roleCard = await byName.get("write_file")!.handler(call("write_file", {
      path: "角色卡/new-role/role-card.md",
      content: "version: 1\nroleId: broken\nroot: project\n\n# 角色卡\n",
    }));
    assert.equal(roleCard.ok, true, "role-card.md 不是 boundary.yaml，不做 YAML 校验");
    assert.equal(existsSync(path.join(root, "角色卡", "new-role", "role-card.md")), true);

    const other = await byName.get("write_file")!.handler(call("write_file", {
      path: "docs/notes/boundary.yaml",
      content: invalidYamlWithTopKey("version"),
    }));
    assert.equal(other.ok, true, "只有 角色卡/<id>/boundary.yaml 受校验，其他同名文件不校验");
    assert.equal(existsSync(path.join(root, "docs", "notes", "boundary.yaml")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("edit_file：编辑结果引入非法顶层键 ⇒ 拒绝且文件保持不变", async () => {
  const root = await temp();
  try {
    const byName = fixture(root);
    await byName.get("write_file")!.handler(call("write_file", { path: "角色卡/edit-role/boundary.yaml", content: VALID }));
    const target = path.join(root, "角色卡", "edit-role", "boundary.yaml");
    const edit = await byName.get("edit_file")!.handler(call("edit_file", {
      path: "角色卡/edit-role/boundary.yaml",
      old_string: "role: new-role",
      new_string: "role: new-role\nversion: 1",
    }));
    assert.equal(edit.ok, false);
    assert.match(edit.message, /未知顶层键：version/);
    assert.equal(await readFile(target, "utf8"), VALID, "拒绝时文件逐字节不变");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows 反斜杠路径也识别为角色边界文件（平台条件）", { skip: process.platform !== "win32" }, async () => {
  const root = await temp();
  try {
    const byName = fixture(root);
    const result = await byName.get("write_file")!.handler(call("write_file", {
      path: "角色卡\\win-role\\boundary.yaml",
      content: invalidYamlWithTopKey("root"),
    }));
    assert.equal(result.ok, false);
    assert.match(result.message, /未知顶层键：root/);
    assert.equal(existsSync(path.join(root, "角色卡", "win-role")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

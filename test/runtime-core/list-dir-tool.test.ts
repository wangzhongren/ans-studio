import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools, LIST_DIR_TOOL_NAME } from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { allow } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-list-dir-"));

function fixture(root: string) {
  const tools = buildGovernedTools(allow, { readRoot: root });
  return { tools, byName: new Map(tools.map((tool) => [tool.name, tool])) };
}

const call = (name: string, args: Record<string, unknown>) => ({ name, args });

test("list_dir 默认注册（无需注入能力），schema 严格：path 可选字符串", () => {
  const root = process.cwd();
  const { tools } = fixture(root);
  assert.equal(tools.some((tool) => tool.name === LIST_DIR_TOOL_NAME), true);
  assert.deepEqual(describeTool(LIST_DIR_TOOL_NAME).parameters.required, []);
  assert.equal((describeTool(LIST_DIR_TOOL_NAME).parameters.properties as Record<string, { type?: string }>).path.type, "string");
  assert.equal(describeTool(LIST_DIR_TOOL_NAME).parameters.additionalProperties, false);
  // 普通受治理工具集不因新增 list_dir 混入 judge 工具。
  const names = new Set(tools.map((tool) => tool.name));
  for (const forbidden of ["judge_read_file", "judge_list_dir", "report_governance_judgement", "report_shell_judgement"]) {
    assert.equal(names.has(forbidden), false, `普通工具集不得包含 ${forbidden}`);
  }
  assert.equal(names.has("write_file"), true);
  assert.equal(names.has("read_file"), true);
});

test("列目录：默认根、项目相对路径、只列一层、目录名带 `/`", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "src", "nested"), { recursive: true });
    await writeFile(path.join(root, "src", "top.ts"), "top", "utf8");
    await writeFile(path.join(root, "src", "nested", "deep.ts"), "deep", "utf8");
    await writeFile(path.join(root, "README.md"), "# project", "utf8");
    const { byName } = fixture(root);

    const rootList = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, {}));
    assert.equal(rootList.ok, true);
    assert.match(rootList.message, /^list_dir: \./);
    assert.match(rootList.message, /src\//, "目录名以 / 结尾");
    assert.match(rootList.message, /README\.md/);

    const srcList = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: "src" }));
    assert.equal(srcList.ok, true);
    assert.match(srcList.message, /^list_dir: src/);
    assert.match(srcList.message, /top\.ts/);
    assert.match(srcList.message, /nested\//);
    assert.equal(srcList.message.includes("deep.ts"), false, "只列一层");

    const absoluteInside = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: path.join(root, "src") }));
    assert.equal(absoluteInside.ok, true);
    assert.match(absoluteInside.message, /top\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("敏感项不列名：.env/密钥/凭据/.git/审计/会话；敏感目录本身拒绝", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "keys"), { recursive: true });
    await mkdir(path.join(root, ".git"), { recursive: true });
    await mkdir(path.join(root, "docs", "audit"), { recursive: true });
    await mkdir(path.join(root, ".ans", "sessions"), { recursive: true });
    await writeFile(path.join(root, ".env"), "API_KEY=x", "utf8");
    await writeFile(path.join(root, ".env.local"), "SECRET=1", "utf8");
    await writeFile(path.join(root, "keys", "server.pem"), "PRIVATE", "utf8");
    await writeFile(path.join(root, "credentials.json"), "{}", "utf8");
    await writeFile(path.join(root, "my-token.txt"), "TOKEN", "utf8");
    await writeFile(path.join(root, ".git", "config"), "[remote]", "utf8");
    await writeFile(path.join(root, "docs", "audit", "a.md"), "audit", "utf8");
    await writeFile(path.join(root, ".ans", "sessions", "x.jsonl"), "session", "utf8");
    await writeFile(path.join(root, "README.md"), "# project", "utf8");
    const { byName } = fixture(root);

    const listing = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, {}));
    assert.equal(listing.ok, true);
    for (const hidden of [".env", ".env.local", "credentials.json", "my-token.txt", ".git", ".ans"]) {
      assert.equal(listing.message.includes(hidden), false, `列表不得列出 ${hidden}`);
    }
    // 普通目录名可列，但其内的密钥文件不列名。
    assert.match(listing.message, /keys\//);
    const keys = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: "keys" }));
    assert.equal(keys.ok, true);
    assert.equal(keys.message.includes("server.pem"), false, "密钥文件不得列名");
    // docs 列表隐藏 audit。
    const docs = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: "docs" }));
    assert.equal(docs.ok, true);
    assert.equal(docs.message.includes("audit"), false);

    for (const sensitiveDir of [".git", ".ans"]) {
      const result = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: sensitiveDir }));
      assert.equal(result.ok, false, `${sensitiveDir} 本身不可列`);
      assert.match(result.message, /敏感/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("越界拒绝：`..`、项目外绝对路径、符号链接逃逸；不存在/非目录明确报错", async () => {
  const root = await temp();
  const outside = await temp();
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "file.txt"), "x", "utf8");
    await writeFile(path.join(outside, "secret.txt"), "OUTSIDE_SECRET", "utf8");
    await symlink(outside, path.join(root, "escape"), "junction");
    const { byName } = fixture(root);

    for (const target of ["..", "../outside", path.join(outside), "escape"]) {
      const result = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: target }));
      assert.equal(result.ok, false, `${target} 必须被拒绝`);
      assert.equal(result.message.includes("OUTSIDE_SECRET"), false);
      assert.equal(result.message.includes(outside), false, "不得回显项目外绝对路径");
    }

    const missing = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: "does-not-exist" }));
    assert.equal(missing.ok, false);
    assert.match(missing.message, /不存在/);

    const notDir = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, { path: "file.txt" }));
    assert.equal(notDir.ok, false);
    assert.match(notDir.message, /不是目录/);
    assert.match(notDir.message, /read_file/);

    // 旧噪声路径：对目录调用 read_file ⇒ 明确指路 list_dir，而不是裸 EISDIR。
    const eisdir = await byName.get("read_file")!.handler(call("read_file", { path: "src" }));
    assert.equal(eisdir.ok, false);
    assert.match(eisdir.message, /list_dir|EISDIR|目录/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("条目上限 200：超出截断并如实标记", async () => {
  const root = await temp();
  try {
    for (let index = 0; index < 205; index++) {
      await writeFile(path.join(root, `f-${String(index).padStart(3, "0")}.txt`), "x", "utf8");
    }
    const { byName } = fixture(root);
    const listing = await byName.get(LIST_DIR_TOOL_NAME)!.handler(call(LIST_DIR_TOOL_NAME, {}));
    assert.equal(listing.ok, true);
    const body = listing.message.split("\n\n")[1] ?? "";
    const lines = body.split("\n").filter((line) => line.startsWith("f-"));
    assert.equal(lines.length, 200, "最多 200 项");
    assert.match(listing.message, /\[已截断/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("中止信号 ⇒ 未执行（不触碰文件系统）", async () => {
  const root = await temp();
  try {
    const { byName } = fixture(root);
    const controller = new AbortController();
    controller.abort();
    const result = await byName.get(LIST_DIR_TOOL_NAME)!.handler({ name: LIST_DIR_TOOL_NAME, args: {}, signal: controller.signal });
    assert.equal(result.ok, false);
    assert.match(result.message, /已中止/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

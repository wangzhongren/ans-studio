// 受治理工具集单测（契约 §4 的 tools.ts；设计 §5.1「块2 写入落盘」验收）。
// 归属：Pi适配器角色测试目录。不导入任何 Pi 包。
//
// 全部落盘用例都在**系统临时目录**内做真实文件系统操作，绝不写入仓库，用完即清理。

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools, type ToolDefinition } from "../../src/provider/pi/tools.ts";
import type { WriteDecision } from "../../src/model/decision.ts";
import { makeGate } from "./fixtures.ts";

// —————————————————————— 夹具 ——————————————————————

const ALLOW: WriteDecision = {
  allowed: true,
  matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
};

/** 一律放行的 gate（验证落盘路径；不承载治理判定）。 */
function allowGate(): (p: string) => WriteDecision {
  return () => ALLOW;
}

/** 仅放行指定绝对路径的 gate；其余拒绝。 */
function allowOnly(...absPaths: string[]): (p: string) => WriteDecision {
  return (p: string): WriteDecision =>
    absPaths.includes(p)
      ? ALLOW
      : { allowed: false, reason: `未在允许集内：${p}`, allowedByRoot: { skill: [], project: [] } };
}

/** 在系统临时目录内建隔离工作区，跑完（含异步）即清理——不触碰仓库。 */
async function inTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-tools-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `应有工具 ${name}`);
  return found!;
}

// —————————————————————— 工具集构成 ——————————————————————

test("buildGovernedTools 至少含 write_file 与 edit_file", () => {
  const names = buildGovernedTools(makeGate({ skill: [], project: [] })).map((t) => t.name);
  assert.ok(names.includes("write_file"));
  assert.ok(names.includes("edit_file"));
});

test("buildGovernedTools 含 read_file（工具集具备读能力）", () => {
  const names = buildGovernedTools(makeGate({ skill: [], project: [] })).map((t) => t.name);
  assert.ok(names.includes("read_file"));
});

// —————————————————————— read_file（不过写门禁） ——————————————————————

test("read_file 读取真实文件，且**不经过**写门禁", async () => {
  let gateCalls = 0;
  const gate = (_p: string) => {
    gateCalls += 1;
    return { allowed: false as const, reason: "写门禁不该被读触发", allowedByRoot: { skill: [], project: [] } };
  };
  const read = tool(buildGovernedTools(gate, { readRoot: process.cwd() }), "read_file");
  const result = await read.handler({ name: "read_file", args: { path: "test/pi-adapter/fixtures.ts" } });

  assert.equal(result.ok, true);
  assert.match(result.message, /read_file:/);
  assert.match(result.message, /makeRole/);
  assert.equal(gateCalls, 0);
});

test("read_file 读取失败返回可读错误（不抛异常）", async () => {
  const read = tool(buildGovernedTools(makeGate({ skill: [], project: [] })), "read_file");
  const result = await read.handler({ name: "read_file", args: { path: "no/such/file-xyz.md" } });

  assert.equal(result.ok, false);
  assert.match(result.message, /read_file 失败/);
});

// —————————————————————— write_file：获准 → 真正落盘（字节相等） ——————————————————————

test("write_file 获准：相对路径落在 writeRoot 下，盘上字节等于 content", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "sub", "out.txt");
    const content = "line1\n第二行\nline3\n";
    const write = tool(buildGovernedTools(allowGate(), { writeRoot: dir }), "write_file");

    const result = await write.handler({ name: "write_file", args: { path: "sub/out.txt", content } });

    assert.equal(result.ok, true);
    assert.match(result.message, /已获准并落盘/);
    assert.equal(existsSync(abs), true, "盘上文件应存在（父目录应被 mkdir -p）");
    assert.equal(readFileSync(abs, "utf8"), content, "字节应等于 content");
  });
});

test("write_file 获准：绝对路径（在 writeRoot 内）落到同一位置", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "abs.txt");
    const write = tool(buildGovernedTools(allowOnly(abs), { writeRoot: dir }), "write_file");

    const result = await write.handler({ name: "write_file", args: { path: abs, content: "ABC" } });

    assert.equal(result.ok, true);
    assert.equal(readFileSync(abs, "utf8"), "ABC");
  });
});

test("write_file：传给 gate 的是解析后的**绝对路径**（写根与判定同源）", async () => {
  await inTempDir(async (dir) => {
    let seen = "";
    const gate = (p: string): WriteDecision => {
      seen = p;
      return ALLOW;
    };
    const write = tool(buildGovernedTools(gate, { writeRoot: dir }), "write_file");
    await write.handler({ name: "write_file", args: { path: "a/b.txt", content: "x" } });

    assert.equal(seen, join(dir, "a", "b.txt"));
  });
});

// —————————————————————— 拒绝：零副作用 ——————————————————————

test("write_file 拒绝（越界）：返回按根分组的可读信息，且盘上无文件、父目录未创建", async () => {
  await inTempDir(async (dir) => {
    const gate = makeGate({ skill: ["技能/a.md"], project: ["src/allowed.ts"] });
    const write = tool(buildGovernedTools(gate, { writeRoot: dir }), "write_file");

    const result = await write.handler({ name: "write_file", args: { path: "src/evil.ts", content: "x" } });

    assert.equal(result.ok, false);
    assert.match(result.message, /写入被拒绝/);
    assert.match(result.message, /skill: 技能\/a\.md/);
    assert.match(result.message, /project: src\/allowed\.ts/);
    assert.equal(existsSync(join(dir, "src")), false, "拒绝时不得建目录");
    assert.equal(existsSync(join(dir, "src", "evil.ts")), false, "拒绝时不得建文件");
  });
});

test("write_file 拒绝：对已存在文件，内容与 mtime 均不变", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "existing.txt");
    writeFileSync(abs, "原内容\n", "utf8");
    const before = statSync(abs);

    const write = tool(buildGovernedTools(makeGate({ skill: [], project: [] }), { writeRoot: dir }), "write_file");
    const result = await write.handler({ name: "write_file", args: { path: "existing.txt", content: "改写\n" } });

    assert.equal(result.ok, false);
    const after = statSync(abs);
    assert.equal(readFileSync(abs, "utf8"), "原内容\n", "内容不得改变");
    assert.equal(after.mtimeMs, before.mtimeMs, "mtime 不得改变");
  });
});

test("write_file 词法越界（../ 逃出写根）：拒绝且写根外无文件", async () => {
  await inTempDir(async (dir) => {
    const root = join(dir, "root");
    mkdirSync(root, { recursive: true });
    const outside = join(dir, "outside.txt");

    const write = tool(buildGovernedTools(allowGate(), { writeRoot: root }), "write_file");
    const result = await write.handler({ name: "write_file", args: { path: "../outside.txt", content: "boom" } });

    assert.equal(result.ok, false);
    assert.match(result.message, /拒绝写入/);
    assert.equal(existsSync(outside), false, "写根之外不得被创建");
  });
});

// —————————————————————— edit_file ——————————————————————

test("edit_file 命中 old_string：回写后内容等于预期", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "edit.txt");
    writeFileSync(abs, "alpha\nbeta\ngamma\n", "utf8");
    const edit = tool(buildGovernedTools(allowOnly(abs), { writeRoot: dir }), "edit_file");

    const result = await edit.handler({
      name: "edit_file",
      args: { path: abs, old_string: "beta", new_string: "BETA" },
    });

    assert.equal(result.ok, true);
    assert.equal(readFileSync(abs, "utf8"), "alpha\nBETA\ngamma\n");
  });
});

test("edit_file old_string 不存在：ok:false 且文件不变", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "edit.txt");
    writeFileSync(abs, "alpha\nbeta\n", "utf8");
    const before = statSync(abs);
    const edit = tool(buildGovernedTools(allowOnly(abs), { writeRoot: dir }), "edit_file");

    const result = await edit.handler({
      name: "edit_file",
      args: { path: abs, old_string: "不存在的串", new_string: "X" },
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /未找到 old_string/);
    assert.equal(readFileSync(abs, "utf8"), "alpha\nbeta\n");
    assert.equal(statSync(abs).mtimeMs, before.mtimeMs, "文件不得被触碰");
  });
});

test("edit_file 越界：经同一治理路径被拒", async () => {
  const edit = tool(buildGovernedTools(makeGate({ skill: [], project: ["src/allowed.ts"] })), "edit_file");
  const result = await edit.handler({ name: "edit_file", args: { path: "../etc/hosts", old_string: "a", new_string: "b" } });

  assert.equal(result.ok, false);
  assert.match(result.message, /写入被拒绝/);
});

test("edit_file 保留 UTF-8 BOM：写回后 BOM 仍在且替换正确", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "bom.txt");
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    writeFileSync(abs, Buffer.concat([bom, Buffer.from("hello world\n", "utf8")]));
    const edit = tool(buildGovernedTools(allowOnly(abs), { writeRoot: dir }), "edit_file");

    const result = await edit.handler({
      name: "edit_file",
      args: { path: abs, old_string: "hello", new_string: "HELLO" },
    });

    assert.equal(result.ok, true);
    const out = readFileSync(abs);
    assert.deepEqual([...out.subarray(0, 3)], [0xef, 0xbb, 0xbf], "BOM 应原样保留");
    assert.equal(out.subarray(3).toString("utf8"), "HELLO world\n");
  });
});

test("edit_file 目标不存在：ok:false（不写、不建）", async () => {
  await inTempDir(async (dir) => {
    const edit = tool(buildGovernedTools(allowGate(), { writeRoot: dir }), "edit_file");
    const result = await edit.handler({
      name: "edit_file",
      args: { path: "missing.txt", old_string: "a", new_string: "b" },
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /无法读取目标/);
    assert.equal(existsSync(join(dir, "missing.txt")), false);
  });
});

// —————————————————————— gate 抛错：写前 fail-closed，无文件创建 ——————————————————————

test("write_file：gate 抛错 → ok:false，盘上无文件、无目录", async () => {
  await inTempDir(async (dir) => {
    const gate = (): WriteDecision => {
      throw new Error("gate 内部异常");
    };
    const write = tool(buildGovernedTools(gate, { writeRoot: dir }), "write_file");
    const result = await write.handler({ name: "write_file", args: { path: "x/y.txt", content: "boom" } });

    assert.equal(result.ok, false);
    assert.match(result.message, /门禁判定异常/);
    assert.equal(existsSync(join(dir, "x")), false, "不得创建目录");
    assert.equal(existsSync(join(dir, "x", "y.txt")), false, "不得创建文件");
  });
});

test("edit_file：gate 抛错 → ok:false，既有文件未被触碰", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "e.txt");
    writeFileSync(abs, "keep\n", "utf8");
    const before = statSync(abs);
    const gate = (): WriteDecision => {
      throw new Error("boom");
    };
    const edit = tool(buildGovernedTools(gate, { writeRoot: dir }), "edit_file");
    const result = await edit.handler({ name: "edit_file", args: { path: abs, old_string: "keep", new_string: "x" } });

    assert.equal(result.ok, false);
    assert.equal(readFileSync(abs, "utf8"), "keep\n");
    assert.equal(statSync(abs).mtimeMs, before.mtimeMs);
  });
});

// —————————————————————— 符号链接 / junction 逃逸 ——————————————————————

test("junction/目录符号链接逃逸出 writeRoot：拒绝且链接目标未被触碰", async () => {
  await inTempDir(async (dir) => {
    const root = join(dir, "root");
    const outside = join(dir, "outside");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    const secret = join(outside, "secret.txt");
    writeFileSync(secret, "SECRET\n", "utf8");

    // root/link -> outside（目录 junction/symlink）；不支持的平台跳过（已知限制）。
    const link = join(root, "link");
    try {
      symlinkSync(outside, link, "junction");
    } catch {
      return;
    }

    const write = tool(buildGovernedTools(allowGate(), { writeRoot: root }), "write_file");
    const result = await write.handler({ name: "write_file", args: { path: "link/evil.txt", content: "pwn" } });

    assert.equal(result.ok, false);
    assert.match(result.message, /拒绝写入/);
    assert.equal(existsSync(join(outside, "evil.txt")), false, "链接目标目录不得被写入");
    assert.equal(readFileSync(secret, "utf8"), "SECRET\n", "链接目标文件不得被触碰");
    assert.equal(existsSync(link), true, "链接本身不得被替换");
  });
});

test("目标本身是符号链接/junction：拒绝（即便链接指向写根之内），链接指向处不被写", async () => {
  await inTempDir(async (dir) => {
    const root = join(dir, "root");
    const inner = join(root, "real");
    mkdirSync(inner, { recursive: true });
    writeFileSync(join(inner, "data.txt"), "DATA\n", "utf8");

    // root/link -> root/real（指向写根**之内**的 junction）；不支持的平台跳过。
    // 注：Windows 建**文件**符号链接需管理员/开发者模式（EPERM），故用目录 junction 覆盖该分支。
    const link = join(root, "link");
    try {
      symlinkSync(inner, link, "junction");
    } catch {
      return;
    }

    const write = tool(buildGovernedTools(allowGate(), { writeRoot: root }), "write_file");
    const result = await write.handler({ name: "write_file", args: { path: "link", content: "pwn" } });

    assert.equal(result.ok, false);
    assert.match(result.message, /拒绝写入/);
    assert.equal(readFileSync(join(inner, "data.txt"), "utf8"), "DATA\n", "链接指向处不得被写");
  });
});

// —————————————————————— 未配置 writeRoot：只判定、不落盘（fail-closed） ——————————————————————

test("未配置 writeRoot：写入获准（ok:true）但不落盘", async () => {
  await inTempDir(async (dir) => {
    const abs = join(dir, "should-not-exist.txt");
    const write = tool(buildGovernedTools(allowGate()), "write_file");
    const result = await write.handler({ name: "write_file", args: { path: abs, content: "x" } });

    assert.equal(result.ok, true);
    assert.match(result.message, /未配置 writeRoot/);
    assert.equal(existsSync(abs), false, "未配置写根时不得落盘");
  });
});

// —————————————————————— 参数校验 ——————————————————————

test("缺少 path 参数：拒绝且不判定", async () => {
  const write = tool(buildGovernedTools(makeGate({ skill: [], project: [] })), "write_file");
  const result = await write.handler({ name: "write_file", args: { content: "x" } });

  assert.equal(result.ok, false);
  assert.match(result.message, /缺少 path 参数/);
});

test("write_file 缺少 content：拒绝且不落盘", async () => {
  await inTempDir(async (dir) => {
    const write = tool(buildGovernedTools(allowGate(), { writeRoot: dir }), "write_file");
    const result = await write.handler({ name: "write_file", args: { path: "x.txt" } });
    assert.equal(result.ok, false);
    assert.match(result.message, /缺少 content/);
    assert.equal(existsSync(join(dir, "x.txt")), false);
  });
});

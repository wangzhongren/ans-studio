// 测试角色：T9 独立跨角色总验收 —— 块2（写入真正落盘）
//
// 自搭场景，覆盖设计 §5.1 / §3.1 / §3.8 / §6 的判据：
//   · 允许路径 → 盘上内容**字节等于**所写内容；edit_file 命中 → 回写等于预期；
//   · 拒绝路径 → 文件不存在 / 已存在文件内容与 mtime 不变（零副作用）；
//   · 负例：符号链接/junction 逃逸 → 拒绝且**链接目标未被触碰**；gate 抛错 → 无任何文件被创建；
//   · 第二边界（§3.8）：门禁放行 skill 根写、写层仍拒（writeRoot 硬收窄）；
//   · 写根与 gate 路径判定**同源**（都引 src/common/shared/path-primitives.ts）。
//
// 全部在系统临时目录内，用完清理，仓库不留文件。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGovernedTools, type ToolDefinition } from "../../src/provider/pi/tools.ts";
import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import type { WriteDecision } from "../../src/model/decision.ts";
import type { ProjectConfig } from "../../src/model/role.ts";

const TMP_ROOTS: string[] = [];
function tempRoot(tag: string): string {
  const d = mkdtempSync(join(tmpdir(), `t9-b2-${tag}-`));
  TMP_ROOTS.push(d);
  return d;
}
after(() => {
  for (const d of TMP_ROOTS) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }
});

/** 建一个项目：写真实 boundary.yaml（允许 src/allowed.ts、src/sub/ 目录、existing.txt），返回 gate 与 writeRoot。 */
async function makeProject(allowEntryText = ""): Promise<{
  writeRoot: string;
  gate: (p: string) => WriteDecision;
  skillRoot: string;
}> {
  const root = tempRoot("proj");
  const skillRoot = tempRoot("skill"); // ★ 技能根必须**在写根之外**，否则第二边界用例失去意义
  mkdirSync(skillRoot, { recursive: true });

  const boundaryRel = "角色卡/D/boundary.yaml";
  const yaml =
    "role: D\nentries:\n" +
    "  - kind: file\n    path: src/allowed.ts\n    purpose: t\n" +
    "  - kind: file\n    path: existing.txt\n    purpose: t\n" +
    "  - kind: directory\n    path: src/sub/\n    purpose: t\n" +
    allowEntryText;
  mkdirSync(join(root, "角色卡", "D"), { recursive: true });
  writeFileSync(join(root, boundaryRel), yaml, "utf8");
  writeFileSync(join(root, "角色卡", "D", "role-card.md"), "# D\n", "utf8");

  const project: ProjectConfig = {
    projectRoot: root,
    skillRoot,
    roles: { D: { card: "角色卡/D/role-card.md", boundary: boundaryRel } },
    governanceBoundary: { path: boundaryRel, acceptance: { accepted: true, source: "test:block2" } },
  };
  const boundary = await resolveBoundary("D", project);
  assert.equal(boundary.parseError, undefined, `边界应可解析：${boundary.parseError}`);
  assert.equal(boundary.acceptance.accepted, true);
  const ctx = { skillRoot, projectRoot: root };
  const gate = (p: string): WriteDecision => resolveWrite(p, boundary, undefined, ctx);
  return { writeRoot: root, gate, skillRoot };
}

function toolOf(tools: ToolDefinition[], name: string): ToolDefinition {
  const t = tools.find((x) => x.name === name);
  assert.ok(t, `应有工具 ${name}`);
  return t!;
}

// —————————————————————— 1) 允许路径 → 字节等于所写内容 ——————————————————————

test("块2/允许写：write_file→盘上文件存在且**字节等于** content；mkdir -p 父目录", async () => {
  const { writeRoot, gate } = await makeProject();
  const tools = buildGovernedTools(gate, { writeRoot });

  const content = "第一行\n第二行 🚀\n"; // 含非 ASCII，验证按 UTF-8 原始字节写
  const r = await toolOf(tools, "write_file").handler({ name: "write_file", args: { path: "src/allowed.ts", content } });
  assert.equal(r.ok, true, r.message);
  const onDisk = readFileSync(join(writeRoot, "src", "allowed.ts"));
  assert.deepEqual(onDisk, Buffer.from(content, "utf8"), "盘上字节须逐字节等于所写 content");

  // 目录条目覆盖子路径 → 父目录应被 mkdir -p 出来并落盘
  const r2 = await toolOf(tools, "write_file").handler({
    name: "write_file",
    args: { path: "src/sub/deep/new.ts", content: "nested\n" },
  });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(readFileSync(join(writeRoot, "src", "sub", "deep", "new.ts"), "utf8"), "nested\n");
});

test("块2/允许编辑：edit_file 命中 old_string → 回写内容等于预期", async () => {
  const { writeRoot, gate } = await makeProject();
  writeFileSync(join(writeRoot, "existing.txt"), "hello world\n", "utf8");
  const tools = buildGovernedTools(gate, { writeRoot });

  const r = await toolOf(tools, "edit_file").handler({
    name: "edit_file",
    args: { path: "existing.txt", old_string: "world", new_string: "ANS" },
  });
  assert.equal(r.ok, true, r.message);
  assert.equal(readFileSync(join(writeRoot, "existing.txt"), "utf8"), "hello ANS\n");
});

test("块2/edit_file：old_string 未命中 → ok:false 且文件保持不变", async () => {
  const { writeRoot, gate } = await makeProject();
  writeFileSync(join(writeRoot, "existing.txt"), "same\n", "utf8");
  const tools = buildGovernedTools(gate, { writeRoot });

  const r = await toolOf(tools, "edit_file").handler({
    name: "edit_file",
    args: { path: "existing.txt", old_string: "NOT_THERE", new_string: "x" },
  });
  assert.equal(r.ok, false);
  assert.equal(readFileSync(join(writeRoot, "existing.txt"), "utf8"), "same\n", "未命中不得改动文件");
});

// —————————————————————— 2) 拒绝路径 → 零副作用 ——————————————————————

test("块2/拒绝写：越界路径 → 文件不存在、父目录不建（零副作用）", async () => {
  const { writeRoot, gate } = await makeProject();
  const tools = buildGovernedTools(gate, { writeRoot });

  const r = await toolOf(tools, "write_file").handler({
    name: "write_file",
    args: { path: "src/evil.ts", content: "// 越界\n" },
  });
  assert.equal(r.ok, false);
  assert.equal(existsSync(join(writeRoot, "src", "evil.ts")), false);

  // 目标父目录本不存在 → 拒绝时不得 mkdir（零副作用）
  const r2 = await toolOf(tools, "write_file").handler({
    name: "write_file",
    args: { path: "brand/new/dir/x.ts", content: "x\n" },
  });
  assert.equal(r2.ok, false);
  assert.equal(existsSync(join(writeRoot, "brand")), false, "拒绝路径不得建出任何父目录");
});

test("块2/拒绝编辑：对已存在但越界的文件 edit_file → 内容与 mtime 不变（零副作用）", async () => {
  const { writeRoot, gate } = await makeProject();
  // secret.txt 在盘上存在，但**不在** D 边界内 → gate 拒
  const secret = join(writeRoot, "secret.txt");
  writeFileSync(secret, "原始内容\n", "utf8");
  const before = { text: readFileSync(secret, "utf8"), mtime: statSync(secret).mtimeMs };

  const tools = buildGovernedTools(gate, { writeRoot });
  const r = await toolOf(tools, "edit_file").handler({
    name: "edit_file",
    args: { path: "secret.txt", old_string: "原始", new_string: "被改" },
  });
  assert.equal(r.ok, false, "越界编辑应被拒");
  assert.equal(readFileSync(secret, "utf8"), before.text, "内容不得变");
  assert.equal(statSync(secret).mtimeMs, before.mtime, "mtime 不得变（未 touch）");
});

// —————————————————————— 3) 负例：gate 抛错 → 无任何文件被创建 ——————————————————————

test("块2/负例：gate 抛错 → 在任何副作用之前 fail-closed，无文件/目录产生", async () => {
  const { writeRoot } = await makeProject();
  const throwingGate = (_p: string): WriteDecision => {
    throw new Error("gate boom");
  };
  const tools = buildGovernedTools(throwingGate, { writeRoot });

  const r = await toolOf(tools, "write_file").handler({
    name: "write_file",
    args: { path: "src/sub/throw/x.ts", content: "x\n" },
  });
  assert.equal(r.ok, false);
  assert.match(r.message, /门禁判定异常|未写入/);
  assert.equal(existsSync(join(writeRoot, "src", "sub", "throw", "x.ts")), false);
  assert.equal(existsSync(join(writeRoot, "src", "sub", "throw")), false, "gate 抛错不得建目录");
});

// —————————————————————— 4) 负例：symlink/junction 逃逸 ——————————————————————

test("块2/负例：符号链接/junction 逃逸出写根 → 拒绝且链接目标未被触碰", async () => {
  const { writeRoot } = await makeProject();
  const outside = tempRoot("outside");
  // 写根内建一个指向写根之外的目录链接（Windows 用 junction，免管理员权限）。
  const link = join(writeRoot, "escape");
  symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

  // gate 一律放行（模拟「门禁未识破、放行了」）——由写层的真实路径复核挡下（§6 纵深防御）。
  const allowGate = (_p: string): WriteDecision => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "t" },
  });
  const tools = buildGovernedTools(allowGate, { writeRoot });

  const r = await toolOf(tools, "write_file").handler({
    name: "write_file",
    args: { path: "escape/evil.txt", content: "// 逃逸\n" },
  });
  assert.equal(r.ok, false, "经链接逃逸出写根应被写层拒绝");
  assert.match(r.message, /逃逸|写根|拒绝/);
  // ★ 链接目标（写根之外）**未被触碰**：没有任何文件被创建。
  assert.equal(existsSync(join(outside, "evil.txt")), false, "链接目标不得被触碰");
});

// 注（如实记录）：设计 §5.1 还列出「目标本身是符号链接 → 拒绝」这一子用例。本机（Windows，无开发者模式/
// 管理员权限）**无法创建文件符号链接**（symlinkSync 直接 EPERM），故本机不可自动验收该子用例；其安全属性
// （绝不写到链接之外、不静默替换链接）已由上方「junction 逃逸」用例以可用的机制覆盖。

// —————————————————————— 5) 第二边界（§3.8）：门禁放行 skill 根写、写层仍拒 ——————————————————————

test("块2/第二边界（§3.8）：gate 放行写根之外（skill 根）的写 → 写层仍拒、无文件产生", async () => {
  const { writeRoot, skillRoot } = await makeProject();
  const allowGate = (_p: string): WriteDecision => ({
    allowed: true,
    matchedEntry: { root: "skill", path: "SKILL.md", kind: "file", purpose: "t" },
  });
  const tools = buildGovernedTools(allowGate, { writeRoot });

  const skillTarget = join(skillRoot, "SKILL.md");
  const r = await toolOf(tools, "write_file").handler({
    name: "write_file",
    args: { path: skillTarget, content: "// 治理会话不该写技能根\n" },
  });
  assert.equal(r.ok, false, "门禁放行 skill 根写，写层（writeRoot=projectRoot）仍须拒");
  assert.equal(existsSync(skillTarget), false, "技能根处不得有文件产生");
});

// —————————————————————— 6) 写根与 gate 路径判定同源 ——————————————————————

test("块2/同源（行为）：gate 收到的绝对路径 === 文件落盘的绝对路径（写根解释一致）", async () => {
  const { writeRoot } = await makeProject();
  const seen: string[] = [];
  // gate 只放行 src/allowed.ts（相对写根解析），并记录它实际收到的路径。
  const targetAbs = resolve(writeRoot, "src/allowed.ts");
  const spyGate = (p: string): WriteDecision => {
    seen.push(p);
    return p === targetAbs
      ? { allowed: true, matchedEntry: { root: "project", path: "src/allowed.ts", kind: "file", purpose: "t" } }
      : { allowed: false, reason: `不在允许集：${p}`, allowedByRoot: { skill: [], project: [] } };
  };
  const tools = buildGovernedTools(spyGate, { writeRoot });
  const r = await toolOf(tools, "write_file").handler({
    name: "write_file",
    args: { path: "src/allowed.ts", content: "ok\n" },
  });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(seen, [targetAbs, targetAbs], "D3 预判与写前复判须各收到同一按写根解析的落盘路径");
  assert.ok(existsSync(targetAbs), "文件须落盘在 gate 判定的同一路径");
});

test("块2/同源（静态）：写层与门禁引擎的路径原语来自**同一共享模块**（单一来源）", () => {
  const here = fileURLToPath(import.meta.url);
  const repo = resolve(here, "..", "..", "..");
  const fsWrite = readFileSync(join(repo, "src", "common", "pi-adapter", "fs-write.ts"), "utf8");
  const gatePaths = readFileSync(join(repo, "src", "common", "门禁引擎", "paths.ts"), "utf8");
  const sharedRel = "shared/path-primitives.ts";

  assert.match(fsWrite, new RegExp(sharedRel.replace(/[.]/g, "\\.")), "写层应从 shared/path-primitives 导入");
  assert.match(gatePaths, new RegExp(sharedRel.replace(/[.]/g, "\\.")), "门禁引擎 paths.ts 应从 shared/path-primitives 导入/转出");
  // 门禁引擎 paths.ts 不再自持实现（应是 re-export 转出，不出现本地 function 定义）
  assert.doesNotMatch(gatePaths, /\bfunction\s+normalizeLexical\b/, "门禁引擎不得再自持 normalizeLexical 实现");
  assert.doesNotMatch(fsWrite, /\bfunction\s+normalizeLexical\b/, "写层不得再自持 normalizeLexical 实现");
});

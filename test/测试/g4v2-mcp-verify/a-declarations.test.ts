// test/测试/g4v2-mcp-verify/a-declarations.test.ts —— A 域：契约符号冻结 + 声明读取器判据表全分支。
//
// 独立验证（测试角色，2026-10-16）：对抗性构造——只依赖「批准口径」（名称仅 [A-Za-z0-9_-]、保留名拒、
// 坏件 undefined/跳过、绝不抛绝不建目录、env:NAME 原样保存不展开、uninstalled/角色不命中静默、排序）
// 推演判据表，逐分支取证；实施方断言不复用。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  readMcpDeclaration,
  listInstalledMcpServers,
  type McpDeclarationDiagnostic,
} from "../../../src/common/runtime-core/mcp-declarations.ts";
import type {
  InstalledMcpServerV1,
  InstallMcpPayload,
  InstallMcpReceipt,
  InstallMcpFn,
  UninstallMcpFn,
} from "../../../src/model/runtime.ts";
import { makeRoot, snapshotTree, writeMcpDeclaration } from "./helpers.ts";

/** 编译期冻结检查（typecheck 面）：符号逐名可用且形状符合批准口径；运行期另有断言。 */
function contractTypeCanary(): void {
  const server: InstalledMcpServerV1 = { name: "srv", command: "node", args: ["x"], env: { K: "env:REF" } };
  const payload: InstallMcpPayload = { roleId: "X", name: "srv" };
  const receipts: InstallMcpReceipt[] = [
    { ok: true, action: "installed", roleId: "X", name: "srv", path: "docs/mcp/srv.md", digest: "ab", effective: "rebuilt" },
    { ok: true, action: "uninstalled", roleId: "X", name: "srv", path: "docs/mcp/srv.md", digest: "ab", effective: "next-session", note: "n" },
    { ok: false, reason: "not-registered", message: "m" },
  ];
  const install: InstallMcpFn = async (_p, _m) => receipts[0]!;
  const uninstall: UninstallMcpFn = async (_p, _m) => receipts[1]!;
  assert.equal(typeof install, "function");
  assert.equal(typeof uninstall, "function");
  assert.equal(server.name, "srv");
  assert.equal(payload.name, "srv");
}

test("A1 契约符号冻结：读取器两函数导出可用（两参调用）、编译期符号逐名在场", () => {
  contractTypeCanary();
  assert.equal(typeof readMcpDeclaration, "function", "readMcpDeclaration 必须导出");
  assert.equal(typeof listInstalledMcpServers, "function", "listInstalledMcpServers 必须导出");
  // 两参调用必须可用（第三参＝可选诊断回调——缺省面）
  const root = makeRoot();
  try {
    assert.equal(readMcpDeclaration(root, "x"), undefined);
    assert.deepEqual([...listInstalledMcpServers(root, "X")], []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A2 好件全字段：文件名定名（标题不权威）、七键解析、args 分隔/trim、env:NAME 原样保存不展开", () => {
  const root = makeRoot();
  try {
    writeMcpDeclaration(root, "srv-x", {
      title: "别名与文件名不同", // 标题非权威
      purpose: "用途描述",
      command: "/usr/bin/env",
      args: "  one ｜ two| three ｜｜ ", // 全角/半角混用、空项丢弃、trim
      env: "TOK=env:HOME; LIT=literal-字面量 ; SECOND=env:TOK2",
      roles: "X、`Y`，Z",
      status: "installed",
      date: "2026-10-16（按客户指令）",
    });
    const before = snapshotTree(root); // 落在声明写盘之后：读取器前后盘面必须逐字节一致
    const view = readMcpDeclaration(root, "srv-x");
    assert.ok(view, "好件必须返回视图");
    assert.equal(view.name, "srv-x", "名字以文件名为准（标题不解析）");
    assert.equal(view.purpose, "用途描述");
    assert.equal(view.command, "/usr/bin/env");
    assert.deepEqual(view.args, ["one", "two", "three"], "参数：｜/| 分隔、trim、空项丢弃");
    assert.deepEqual(view.env, { TOK: "env:HOME", LIT: "literal-字面量", SECOND: "env:TOK2" }, "env:NAME 原样保存（不展开）");
    assert.deepEqual(view.roles, ["X", "Y", "Z"], "角色：、/，/, 分隔、去反引号");
    assert.equal(view.status, "installed");
    assert.equal(view.date, "2026-10-16");
    assert.equal(view.path, "docs/mcp/srv-x.md");
    // 纯读：前后盘快照逐字节一致（绝不建目录/写盘）
    assert.deepEqual(snapshotTree(root), before, "读取器绝不写盘");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A2b 读取器不写诊断、不触回调；坏件/缺失/名非法/保留名/根不可读 ⇒ undefined 绝不抛", () => {
  const root = makeRoot();
  try {
    // 缺失 ⇒ undefined
    assert.equal(readMcpDeclaration(root, "not-there"), undefined, "声明缺失 ⇒ undefined");
    // 名非法（空/点/.. /分隔符/空格/控制字符/非字符串）
    for (const bad of ["", ".", "..", "a/b", "a\\b", "a b", "a.b", "\u0000", "最新🔥"]) {
      assert.equal(readMcpDeclaration(root, bad), undefined, `名非法必须 undefined：${JSON.stringify(bad)}`);
    }
    assert.equal(readMcpDeclaration(root, 7 as unknown as string), undefined, "name 非字符串 ⇒ undefined");
    assert.equal(readMcpDeclaration("", "x"), undefined, "空根 ⇒ undefined");
    assert.equal(readMcpDeclaration(root, null as unknown as string), undefined, "null 名 ⇒ undefined（绝不抛）");
    // 保留名 ⇒ undefined（即使文件在场）
    writeMcpDeclaration(root, "ans", {});
    writeMcpDeclaration(root, "ans_codex", {});
    assert.equal(readMcpDeclaration(root, "ans"), undefined, "保留名 ans ⇒ undefined");
    assert.equal(readMcpDeclaration(root, "ans_codex"), undefined, "保留名 ans_codex ⇒ undefined");
    // 根不可读（docs/mcp 是文件）⇒ undefined / 空数组 + mcp-root-unreadable 诊断
    const root2 = makeRoot();
    try {
      fs.mkdirSync(path.join(root2, "docs"), { recursive: true });
      fs.writeFileSync(path.join(root2, "docs", "mcp"), "not a directory");
      assert.equal(readMcpDeclaration(root2, "x"), undefined);
      const diags: McpDeclarationDiagnostic[] = [];
      const list = listInstalledMcpServers(root2, "X", (d) => diags.push(d));
      assert.deepEqual([...list], [], "根不可读 ⇒ 零清单");
      assert.equal(diags.length, 1);
      assert.equal(diags[0]!.reason, "mcp-root-unreadable");
      assert.equal(diags[0]!.path, "docs/mcp");
    } finally {
      fs.rmSync(root2, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A3 判据表：缺失必填/未知状态/env 坏项/控制字符/重复 env/命令引用 ⇒ undefined，且与列表坏件集同口径", () => {
  const root = makeRoot();
  try {
    const cases: Array<{ name: string; text: string; why: string }> = [
      { name: "miss-purpose", text: "# 声明\n- 启动：node\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "缺 用途" },
      { name: "miss-command", text: "- 用途：p\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "缺 启动" },
      { name: "miss-roles", text: "- 用途：p\n- 启动：node\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "缺 适用角色" },
      { name: "miss-status", text: "- 用途：p\n- 启动：node\n- 适用角色：X\n- 安装日期：2026-10-16\n", why: "缺 状态" },
      { name: "miss-date", text: "- 用途：p\n- 启动：node\n- 适用角色：X\n- 状态：installed\n", why: "缺 安装日期" },
      { name: "unknown-status", text: "- 用途：p\n- 启动：node\n- 适用角色：X\n- 状态：enabled\n- 安装日期：2026-10-16\n", why: "状态值未知（不猜）" },
      { name: "empty-env-name", text: "- 用途：p\n- 启动：node\n- 环境：=v\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "env 项缺 NAME" },
      { name: "bad-env-name", text: "- 用途：p\n- 启动：node\n- 环境：1BAD=v\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "env 名非法" },
      { name: "dup-env", text: "- 用途：p\n- 启动：node\n- 环境：A=1;A=2\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "env 名重复" },
      { name: "empty-env-value", text: "- 用途：p\n- 启动：node\n- 环境：A=\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "env 值为空" },
      { name: "bang-env", text: "- 用途：p\n- 启动：node\n- 环境：A=!cmd\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "env 值 ! 开头（命令引用形态被拒）" },
      { name: "bad-env-ref", text: "- 用途：p\n- 启动：node\n- 环境：A=env:1BAD\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "env 引用名非法" },
      { name: "ctrl-command", text: "- 用途：p\n- 启动：node\u0007x\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "命令含控制字符" },
      { name: "ctrl-arg", text: "- 用途：p\n- 启动：node\n- 参数：a\u0000b\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "参数含控制字符" },
      { name: "ctrl-env", text: "- 用途：p\n- 启动：node\n- 环境：A=v\u007fx\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n", why: "env 值含控制字符" },
    ];
    const diags: McpDeclarationDiagnostic[] = [];
    for (const c of cases) {
      writeMcpDeclaration(root, c.name, { text: c.text });
      assert.equal(readMcpDeclaration(root, c.name), undefined, `读取器：${c.why} ⇒ undefined`);
    }
    const list = listInstalledMcpServers(root, "X", (d) => diags.push(d));
    assert.deepEqual([...list], [], "全部坏件 ⇒ 零清单");
    assert.equal(diags.length, cases.length, "每个坏件恰一条诊断（读取器不写诊断、列表写）");
    assert.ok(diags.every((d) => d.reason === "declaration-parse-failed"), `坏件 reason 应统一为 declaration-parse-failed：${JSON.stringify(diags)}`);
    // 反向核：坏件文件也在场时（与好件混排），好件照常注入、坏件跳过。
    writeMcpDeclaration(root, "good", {});
    const listed = listInstalledMcpServers(root, "X");
    assert.deepEqual(listed.map((s) => s.name), ["good"], "坏件跳过不毁好件");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A4 静默过滤：uninstalled 与角色不命中——不算坏件、不产诊断、不收录", () => {
  const root = makeRoot();
  try {
    writeMcpDeclaration(root, "off", { status: "uninstalled", roles: "X" });
    writeMcpDeclaration(root, "other-role", { status: "installed", roles: "Y、Z" });
    writeMcpDeclaration(root, "hit", { status: "installed", roles: "X" });
    const diags: McpDeclarationDiagnostic[] = [];
    const list = listInstalledMcpServers(root, "X", (d) => diags.push(d));
    assert.deepEqual(list.map((s) => s.name), ["hit"], "uninstalled 与角色不命中均静默过滤");
    assert.deepEqual(diags, [], "正常过滤不产诊断");
    // 读取器（handler 校验面）：uninstalled/角色不命中＝非坏件，原样返回视图（调用方自判）
    const offView = readMcpDeclaration(root, "off");
    assert.ok(offView, "uninstalled 不是坏件——读取器原样返回");
    assert.equal(offView.status, "uninstalled");
    const otherView = readMcpDeclaration(root, "other-role");
    assert.ok(otherView && !otherView.roles.includes("X"), "角色不命中仍是合法视图");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A5 扫描集合与排序：只收 *.md 普通文件；子目录/其它扩展名/符号链接静默忽略；按 name 字典序", () => {
  const root = makeRoot();
  try {
    writeMcpDeclaration(root, "zeta", {});
    writeMcpDeclaration(root, "alpha", {});
    writeMcpDeclaration(root, "mid", {});
    const dir = path.join(root, "docs", "mcp");
    fs.mkdirSync(path.join(dir, "sub.md"), { recursive: true }); // 目录名带 .md ⇒ 不是条目
    fs.writeFileSync(path.join(dir, "note.txt"), "- 用途：p\n"); // 非 .md ⇒ 忽略
    try { fs.symlinkSync(path.join(dir, "alpha.md"), path.join(dir, "link.md")); } catch { /* 平台不支持则跳过该项 */ }
    const list = listInstalledMcpServers(root, "X");
    assert.deepEqual(list.map((s) => s.name), ["alpha", "mid", "zeta"], "恰收录三个 .md 普通文件、指令名排序");
    // 收录形状＝InstalledMcpServerV1（不带 purpose/roles/status/date/path 安装面字段）
    for (const server of list) {
      assert.deepEqual(Object.keys(server).sort(), ["args", "command", "name"], `收录键集应为 name/command/args（无 env 时）：${JSON.stringify(server)}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A6 顺序无关与宽容解析：BOM 剥离、CRLF、键序任意、首现为准、无根目录=静默空且绝不建目录", () => {
  const root = makeRoot();
  try {
    // 没有任何 docs 目录：空数组、静默（零诊断）、盘上不新增任何目录
    const diags: McpDeclarationDiagnostic[] = [];
    assert.deepEqual([...listInstalledMcpServers(root, "X", (d) => diags.push(d))], []);
    assert.deepEqual(diags, [], "根不存在＝正常「未安装」态（静默）");
    assert.deepEqual(fs.readdirSync(root), [], "绝不建目录");
    // BOM + CRLF + 乱序键 + 首现为准
    writeMcpDeclaration(root, "bom", {
      text: "﻿- 状态：installed\r\n- 安装日期：2026-10-16\r\n- 适用角色：X\r\n- 启动：first\r\n- 启动：second\r\n- 用途：p\r\n",
    });
    const view = readMcpDeclaration(root, "bom");
    assert.ok(view, "BOM+CRLF 不应致坏");
    assert.equal(view.command, "first", "同键首现为准（不猜补、不取后者）");
    assert.equal(view.date, "2026-10-16");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("A7 onDiagnostic 回调抛错被吞（观察面不得影响会话开启）；重复调用稳定", () => {
  const root = makeRoot();
  try {
    writeMcpDeclaration(root, "bad", { text: "- 用途：p\n" });
    const list = listInstalledMcpServers(root, "X", () => { throw new Error("回调抛错"); });
    assert.deepEqual([...list], []);
    const again = listInstalledMcpServers(root, "X", () => { throw new Error("再抛"); });
    assert.deepEqual([...again], [], "回调抛错不影响结果（稳定可重复）");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

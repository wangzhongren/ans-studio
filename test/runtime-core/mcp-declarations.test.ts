// G-4 V2 wave A：外来 MCP 声明读取器（`src/common/runtime-core/mcp-declarations.ts`）用例。
// 依据：客户 2026-10-16「按推荐批准，开始实施」＝V2 分批实施；产品提案 revision 2 §5.1/§5.2
// （声明格式 `docs/mcp/<name>.md` 与按角色装配）＋运行时核心评估 §5.1/§6（严格面：名白名单校验/
// 保留名/command 非空/env 值只收字面量或 `env:NAME` 引用、拒 `!` 开头/坏件绝不影响开会话）。
// 本文件钉住（冻结签名＝对桌面 handler 与 Service 的落盘契约）：
//   · `readMcpDeclaration(projectRoot, name): McpDeclarationView | undefined`——两参调用；
//     坏件/缺失/名非法/保留名 ⇒ undefined，绝不抛。
//   · `listInstalledMcpServers(projectRoot, roleId): readonly InstalledMcpServerV1[]`——两参调用；
//     第三参为可选诊断回调（坏件观察面；抛错被吞）。installed＋角色命中才收录；uninstalled/角色
//     不命中属正常过滤（静默）；坏件跳过＋诊断；`docs/mcp` 不存在＝正常未安装态（空数组）。
//   · 接线注入：Service providerFor 按角色读取并注入 `RuntimeProviderOptions.installedMcpServers`
//     （纯读——绝不建目录；新 bind 重读＝「安装/卸载 ⇒ 下次开会话生效」）。
// 全程系统临时目录，用后清理；不触网、不触真项目。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readMcpDeclaration, listInstalledMcpServers } from "../../src/common/runtime-core/mcp-declarations.ts";
import type { McpDeclarationDiagnostic } from "../../src/common/runtime-core/mcp-declarations.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import type { RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent } from "../../src/model/runtime.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ans-mcp-declarations-"));
}

/** 按 §5.1 模板产声明文本（可逐字段覆写/留空以构造坏件；`undefined` 值 ⇒ 该行不写）。 */
function declarationText(name: string, opts: {
  purpose?: string | undefined;
  command?: string | undefined;
  args?: string | undefined;
  env?: string | undefined;
  roles?: string | undefined;
  status?: string | undefined;
  date?: string | undefined;
} = {}): string {
  const lines = [`# MCP 声明：${name}`];
  const pick = (key: keyof typeof opts, fallback: string | undefined): string | undefined => (key in opts ? opts[key] : fallback);
  const purpose = pick("purpose", "示例用途");
  const command = pick("command", "npx");
  const args = pick("args", undefined);
  const env = pick("env", undefined);
  const roles = pick("roles", "X");
  const status = pick("status", "installed");
  const date = pick("date", "2026-10-16");
  if (purpose !== undefined) lines.push(`- 用途：${purpose}`);
  if (command !== undefined) lines.push(`- 启动：${command}`);
  if (args !== undefined) lines.push(`- 参数：${args}`);
  if (env !== undefined) lines.push(`- 环境：${env}`);
  if (roles !== undefined) lines.push(`- 适用角色：${roles}`);
  if (status !== undefined) lines.push(`- 状态：${status}`);
  if (date !== undefined) lines.push(`- 安装日期：${date}`);
  return lines.join("\n") + "\n";
}

function writeDeclaration(root: string, name: string, text: string): void {
  fs.mkdirSync(path.join(root, "docs", "mcp"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "mcp", `${name}.md`), text);
}

test("好件：readMcpDeclaration 返回完整视图（七字段＋path；env 原文保存不展开；参数/日期/角色口径）", () => {
  const root = makeRoot();
  try {
    writeDeclaration(root, "fs", declarationText("fs", {
      purpose: "读取本地文件",
      command: "/usr/local/bin/mcp-fs",
      args: "-y ｜ @modelcontextprotocol/server-filesystem | /tmp/data",
      env: "TOKEN=env:MY_MCP_TOKEN；MODE=readonly",
      roles: "`impl`、reviewer,planner",
      status: "installed",
      date: "2026-10-16（按客户指令）",
    }));
    assert.deepEqual(readMcpDeclaration(root, "fs"), {
      name: "fs",
      command: "/usr/local/bin/mcp-fs",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/data"], // 全角/半角分隔混用；trim、空项丢弃
      env: { TOKEN: "env:MY_MCP_TOKEN", MODE: "readonly" }, // 引用**原文**保存（真值展开归各平台适配器）
      purpose: "读取本地文件",
      roles: ["impl", "reviewer", "planner"], // `、`/`，`/`,` 混分隔、trim、去反引号
      status: "installed",
      date: "2026-10-16", // 取行内首个 YYYY-MM-DD
      path: "docs/mcp/fs.md",
    });
    // 可选两行缺省：args=[]、无 env 键；标题行与注释行忽略；BOM/CRLF 容错。
    writeDeclaration(root, "min", "﻿# MCP 声明：min\r\n<!-- 注释 -->\r\n- 用途：p\r\n- 启动：node\r\n- 适用角色：X\r\n- 状态：installed\r\n- 安装日期：2026-10-01\r\n");
    assert.deepEqual(readMcpDeclaration(root, "min"), {
      name: "min", command: "node", args: [], purpose: "p", roles: ["X"], status: "installed", date: "2026-10-01", path: "docs/mcp/min.md",
    });
    // uninstalled 非坏件：原样返回视图（状态判读归调用方——handler 自行看 status；列表侧过滤）。
    writeDeclaration(root, "off", declarationText("off", { status: "uninstalled" }));
    assert.equal(readMcpDeclaration(root, "off")?.status, "uninstalled");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("坏件（入口防御＋名非法＋保留名＋缺失）⇒ undefined，绝不抛", () => {
  const root = makeRoot();
  try {
    writeDeclaration(root, "ok", declarationText("ok"));
    // 入口 sanity：空根/空白根、非字符串/空/点/穿越/含分隔符。
    assert.equal(readMcpDeclaration("", "ok"), undefined);
    assert.equal(readMcpDeclaration("   ", "ok"), undefined);
    assert.equal(readMcpDeclaration(7 as unknown as string, "ok"), undefined);
    assert.equal(readMcpDeclaration(root, 7 as unknown as string), undefined);
    for (const bad of ["", ".", "..", "a/b", "a\\b", "../ok", "a\u0000b", "a\nb"]) {
      assert.equal(readMcpDeclaration(root, bad), undefined, `名非法应 undefined：${JSON.stringify(bad)}`);
    }
    // 名字符集（裁定②）：仅 [A-Za-z0-9_-]——空格/点/中文等特殊字符＝坏件（即便文件存在）。
    writeDeclaration(root, "bad.name", declarationText("bad.name"));
    assert.equal(readMcpDeclaration(root, "bad.name"), undefined);
    // 保留名（与内置 server 重名）：即便文件存在且格式合法也拒绝。
    writeDeclaration(root, "ans", declarationText("ans"));
    writeDeclaration(root, "ans_codex", declarationText("ans_codex"));
    assert.equal(readMcpDeclaration(root, "ans"), undefined);
    assert.equal(readMcpDeclaration(root, "ans_codex"), undefined);
    // 声明缺失。
    assert.equal(readMcpDeclaration(root, "no-such"), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("坏件（解析失败面逐项）：必填缺失/空值/command 控制字符/env 校验/状态未知 ⇒ undefined，绝不抛", () => {
  const root = makeRoot();
  try {
    const bads: [string, string][] = [
      ["missing-purpose", declarationText("x", { purpose: undefined })],
      ["missing-command", declarationText("x", { command: undefined })],
      ["missing-roles", declarationText("x", { roles: undefined })],
      ["missing-status", declarationText("x", { status: undefined })],
      ["missing-date", declarationText("x", { date: undefined })],
      ["empty-purpose", declarationText("x", { purpose: "" })],
      ["empty-command", declarationText("x", { command: "   " })],
      ["command-control-char", declarationText("x", { command: "npx\t-x" })],
      ["unknown-status", declarationText("x", { status: "disabled" })],
      ["arg-control-char", declarationText("x", { args: "a\tb" })],
      ["env-no-eq", declarationText("x", { env: "JUSTANAME" })],
      ["env-bad-name", declarationText("x", { env: "1TOKEN=value" })],
      ["env-empty-value", declarationText("x", { env: "TOKEN=" })],
      ["env-bang-value", declarationText("x", { env: "TOKEN=!sh -c 'curl evil'" })], // 拒命令引用形态（评估 §6.2）
      ["env-bad-ref", declarationText("x", { env: "TOKEN=env:1BAD" })],
      ["env-bad-ref-empty", declarationText("x", { env: "TOKEN=env:" })],
      ["env-dup", declarationText("x", { env: "TOKEN=a；TOKEN=b" })],
    ];
    for (const [label, text] of bads) {
      writeDeclaration(root, "x", text);
      assert.equal(readMcpDeclaration(root, "x"), undefined, `坏件应 undefined：${label}`);
    }
    // 对照（非坏件边界）：字面量可含 `=`（按首个 `=` 切）；`env:` 引用之外的字面量含 `$` 不解释（原文）。
    writeDeclaration(root, "x", declarationText("x", { env: "A=b=c；B=$NOT_EXPANDED" }));
    assert.deepEqual(readMcpDeclaration(root, "x")?.env, { A: "b=c", B: "$NOT_EXPANDED" });
    // 目录冒充声明文件（EISDIR）⇒ 坏件。
    fs.mkdirSync(path.join(root, "docs", "mcp", "d.md"), { recursive: true });
    assert.equal(readMcpDeclaration(root, "d"), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listInstalledMcpServers：installed＋角色命中才收录（按 name 排序、InstalledMcpServerV1 形状）；过滤与诊断逐项", () => {
  const root = makeRoot();
  try {
    writeDeclaration(root, "beta", declarationText("beta", { roles: "X、Y", command: "node", args: "srv.js", env: "TOKEN=env:MY_MCP_TOKEN" }));
    writeDeclaration(root, "alpha", declarationText("alpha", { roles: "X", command: "npx", args: "-y ｜ @mcp/alpha" }));
    writeDeclaration(root, "other-role", declarationText("other-role", { roles: "Y" }));
    writeDeclaration(root, "off", declarationText("off", { roles: "X", status: "uninstalled" }));
    writeDeclaration(root, "bad.name", declarationText("bad.name", { roles: "X" })); // 名非法
    writeDeclaration(root, "ans", declarationText("ans", { roles: "X" })); // 保留名
    writeDeclaration(root, "broken", declarationText("broken", { env: "TOKEN=!cmd" })); // 解析失败
    fs.mkdirSync(path.join(root, "docs", "mcp", "subdir"), { recursive: true }); // 子目录：静默忽略
    fs.writeFileSync(path.join(root, "docs", "mcp", "notes.txt"), "非声明"); // 非 .md：静默忽略

    const diagnostics: McpDeclarationDiagnostic[] = [];
    const servers = listInstalledMcpServers(root, "X", (d) => diagnostics.push(d));
    assert.deepEqual(servers, [
      { name: "alpha", command: "npx", args: ["-y", "@mcp/alpha"] },
      { name: "beta", command: "node", args: ["srv.js"], env: { TOKEN: "env:MY_MCP_TOKEN" } },
    ], "installed＋角色命中才收录；按 name 排序；坏件/过滤项不出现");
    // InstalledMcpServerV1 形状：不带 purpose/roles/status/date/path 等安装面字段。
    assert.deepEqual(Object.keys(servers[0]!).sort(), ["args", "command", "name"]);
    assert.deepEqual(Object.keys(servers[1]!).sort(), ["args", "command", "env", "name"]);
    // 诊断面：坏件三条＋各自原因码（uninstalled/角色不命中＝正常过滤，无诊断；非 .md/子目录静默）。
    assert.deepEqual(diagnostics.map((d) => [d.path, d.reason]).sort(), [
      ["docs/mcp/ans.md", "reserved-name"],
      ["docs/mcp/bad.name.md", "name-invalid"],
      ["docs/mcp/broken.md", "declaration-parse-failed"],
    ].sort());
    // 角色不命中 ⇒ 空；非字符串/空 roleId ⇒ 空；空根 ⇒ 空。
    assert.deepEqual(listInstalledMcpServers(root, "Z"), []);
    assert.deepEqual(listInstalledMcpServers(root, ""), []);
    assert.deepEqual(listInstalledMcpServers("", "X"), []);
    assert.deepEqual(listInstalledMcpServers(7 as unknown as string, "X"), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("listInstalledMcpServers 防御：`docs/mcp` 不存在＝空数组零诊断；不可读（是文件）＝空数组＋mcp-root-unreadable；回调抛错被吞", () => {
  const root = makeRoot();
  try {
    assert.deepEqual(listInstalledMcpServers(root, "X"), [], "目录不存在＝正常「未安装」态");
    assert.equal(fs.existsSync(path.join(root, "docs", "mcp")), false, "纯读：不得建目录");
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "mcp"), "这是文件不是目录");
    const diagnostics: McpDeclarationDiagnostic[] = [];
    assert.deepEqual(listInstalledMcpServers(root, "X", (d) => diagnostics.push(d)), []);
    assert.deepEqual(diagnostics.map((d) => d.reason), ["mcp-root-unreadable"]);
    // 观察面回调抛错不得影响列表结果（吞掉）。
    fs.rmSync(path.join(root, "docs", "mcp"));
    writeDeclaration(root, "ok", declarationText("ok", { roles: "X" }));
    writeDeclaration(root, "bad.name", declarationText("bad.name"));
    assert.deepEqual(listInstalledMcpServers(root, "X", () => { throw new Error("observer boom"); }).map((s) => s.name), ["ok"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("接线注入：Service providerFor 按角色注入 RuntimeProviderOptions.installedMcpServers（纯读、绝不建目录；新 bind 重读）", async () => {
  const root = makeRoot();
  try {
    const captures: RuntimeProviderOptions[] = [];
    const factory: RuntimeProviderFactory = (options) => {
      registerControlledDisplayProfile(options);
      captures.push(options);
      return {
        async composeContext() { return { systemPrompt: "fixture" }; },
        async bindRole() {
          const queue = createEventQueue<SessionEvent>();
          return { async prompt() { queue.push({ kind: "settled", summary: "done" }); }, events: () => queue.stream, async dispose() { queue.close(); } };
        },
      };
    };
    // 无 docs/mcp：注入空数组，且绝不建目录。
    await (await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: root, skillRoot: root, providerFactories: { pi: factory } }).bindRole(role("core"))).dispose();
    assert.deepEqual(captures[0]?.installedMcpServers, [], "无声明 ⇒ 空数组");
    assert.equal(fs.existsSync(path.join(root, "docs")), false, "纯读：绝不建目录");
    // 装入一条本角色声明：新 bind 重读并注入（「安装/卸载 ⇒ 下次开会话生效」）。
    writeDeclaration(root, "fs", declarationText("fs", { roles: "core", command: "npx", args: "-y ｜ @mcp/fs", env: "TOKEN=env:MY_MCP_TOKEN" }));
    writeDeclaration(root, "for-other", declarationText("for-other", { roles: "other" }));
    writeDeclaration(root, "broken", declarationText("broken", { env: "TOKEN=!cmd" }));
    await (await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: root, skillRoot: root, providerFactories: { pi: factory } }).bindRole(role("core"))).dispose();
    assert.deepEqual(captures[1]?.installedMcpServers, [
      { name: "fs", command: "npx", args: ["-y", "@mcp/fs"], env: { TOKEN: "env:MY_MCP_TOKEN" } },
    ], "按角色过滤；坏件不影响注入（坏件由读取器跳过）");
    // 卸载（改声明置 uninstalled）⇒ 再开即不再注入。
    writeDeclaration(root, "fs", declarationText("fs", { roles: "core", status: "uninstalled" }));
    await (await createRuntimeAdapter({ runtime: "pi", gate: allow, projectRoot: root, skillRoot: root, providerFactories: { pi: factory } }).bindRole(role("core"))).dispose();
    assert.deepEqual(captures[2]?.installedMcpServers, [], "撤后不再注入（下次开会话生效）");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// test/测试/g4v2-mcp-verify/c-tools.test.ts —— C 域：运行时核心两工具（install_mcp / uninstall_mcp）。
//
// 独立构造：直调 `buildGovernedTools`（公开面）＋自建假能力闭包＋fs 写原语 spy＋源码切片核对。
// 逐项：① 注入才注册（两能力互不搭车）；② 回执冻形逐字段；③ 契约外/抛错/预中止全 fail-closed；
// ④ 失败文案与 schema 枚举互核（跨源）；⑤ 零写盘两路（源码切片＋spy）；⑥ 描述含能力级授予诚实面。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildGovernedTools, INSTALL_MCP_TOOL_NAME, UNINSTALL_MCP_TOOL_NAME } from "../../../src/provider/runtime/tools.ts";
import { describeTool } from "../../../src/provider/runtime/schema.ts";
import type { ToolDefinition, WriteGate, InstallMcpReceipt } from "../../../src/model/runtime.ts";
import { makeRoot, snapshotTree } from "./helpers.ts";

const gate: WriteGate = () => ({ allowed: false, reason: "fixture", allowedByRoot: { project: [], skill: [] } });
const ROOT_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function tools(names: { installMcp?: boolean; uninstallMcp?: boolean }, receipts?: () => Promise<InstallMcpReceipt> | InstallMcpReceipt) {
  const okReceipt: InstallMcpReceipt = { ok: true, action: "installed", roleId: "X", name: "srv", path: "docs/mcp/srv.md", digest: "0123456789abcdef0123", effective: "rebuilt" };
  const fn = async (): Promise<InstallMcpReceipt> => (receipts ? await receipts() : okReceipt);
  return buildGovernedTools(gate, {
    ...(names.installMcp ? { installMcp: fn } : {}),
    ...(names.uninstallMcp ? { uninstallMcp: async () => ({ ...okReceipt, action: "uninstalled" as const, effective: "next-session" as const }) } : {}),
  });
}

function byName(list: ToolDefinition[], name: string): ToolDefinition | undefined {
  return list.find((tool) => tool.name === name);
}

test("C1 注入才注册：四组合矩阵，两能力互不搭车；未注入的名字结构性不存在", () => {
  const none = tools({});
  assert.equal(byName(none, "install_mcp"), undefined, "两能力未注入 ⇒ install_mcp 不存在");
  assert.equal(byName(none, "uninstall_mcp"), undefined, "两能力未注入 ⇒ uninstall_mcp 不存在");
  const onlyInstall = tools({ installMcp: true });
  assert.ok(byName(onlyInstall, "install_mcp"), "仅注入安装 ⇒ 安装工具注册");
  assert.equal(byName(onlyInstall, "uninstall_mcp"), undefined, "仅注入安装 ⇒ 卸载工具不搭车");
  const onlyUninstall = tools({ uninstallMcp: true });
  assert.equal(byName(onlyUninstall, "install_mcp"), undefined, "仅注入卸载 ⇒ 安装工具不搭车");
  assert.ok(byName(onlyUninstall, "uninstall_mcp"), "仅注入卸载 ⇒ 卸载工具注册");
  const both = tools({ installMcp: true, uninstallMcp: true });
  assert.ok(byName(both, "install_mcp") && byName(both, "uninstall_mcp"), "双注入 ⇒ 双注册");
  assert.equal(INSTALL_MCP_TOOL_NAME, "install_mcp");
  assert.equal(UNINSTALL_MCP_TOOL_NAME, "uninstall_mcp");
});

test("C2 回执冻形逐字段：path/digest 前 12 位/生效态两分支/note 透传/诚实面在文案", async () => {
  const list = tools({ installMcp: true, uninstallMcp: true }, () => ({
    ok: true, action: "installed", roleId: "X", name: "srv", path: "docs/mcp/srv.md",
    digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    effective: "rebuilt", note: "补充说明一句",
  }));
  const install = byName(list, "install_mcp")!;
  const r1 = await install.handler({ name: "install_mcp", args: { roleId: "X", name: "srv" } });
  assert.equal(r1.ok, true);
  assert.equal(
    r1.message,
    "install_mcp：MCP「srv」已安装 → 角色「X」。声明：docs/mcp/srv.md（sha256 0123456789ab）；生效：已重建该角色会话、即刻生效。 补充说明一句" +
    "注意：本次安装**未改变任何角色的写边界**——外来 MCP 工具在 ANS 门禁之外执行（能力级授予），不是逐调用受审。",
    "安装成功文案逐字（含诚实面）",
  );

  const listDelay = tools({ installMcp: true }, () => ({
    ok: true, action: "installed", roleId: "X", name: "srv", path: "docs/mcp/srv.md", digest: "deadbeefcafe0000", effective: "next-session",
  }));
  const r2 = await byName(listDelay, "install_mcp")!.handler({ name: "install_mcp", args: { roleId: "X", name: "srv" } });
  assert.equal(r2.ok, true);
  assert.ok(r2.message.includes("生效：该角色正在运行轮次（不打断）——新会话起生效。"), "next-session 如实延迟态");

  const uninstall = byName(list, "uninstall_mcp")!;
  const r3 = await uninstall.handler({ name: "uninstall_mcp", args: { roleId: "X", name: "srv" } });
  assert.equal(r3.ok, true);
  assert.ok(r3.message.includes("已卸载"), "卸载回执如实");
  assert.ok(r3.message.includes("效果已撤；声明保留于 docs/mcp/srv.md（sha256 0123456789ab）"), "卸载二分：效果已撤＋声明保留");
  assert.ok(r3.message.includes("已发生的副作用不可撤"), "卸载专有诚实面：副作用不可撤");
  assert.ok(r3.message.includes("不是逐调用受审"), "卸载同持能力级授予诚实面");
});

test("C3 契约外回执/抛错/预中止全 fail-closed：绝不称已安装/已卸载", async () => {
  const bad: Array<[string, () => Promise<unknown> | unknown]> = [
    ["null", () => null],
    ["缺 digest", () => ({ ok: true, action: "installed", roleId: "X", name: "s", path: "p", effective: "rebuilt" })],
    ["action 不符", () => ({ ok: true, action: "uninstalled", roleId: "X", name: "s", path: "p", digest: "d", effective: "rebuilt" })],
    ["effective 非法", () => ({ ok: true, action: "installed", roleId: "X", name: "s", path: "p", digest: "d", effective: "soon" })],
    ["ok 缺失", () => ({ action: "installed" })],
    ["抛错", () => { throw new Error("能力内部炸了"); }],
  ];
  for (const [why, fn] of bad) {
    const list = tools({ installMcp: true }, fn as () => Promise<InstallMcpReceipt>);
    const result = await byName(list, "install_mcp")!.handler({ name: "install_mcp", args: { roleId: "X", name: "srv" } });
    assert.equal(result.ok, false, `${why} ⇒ 必须 ok:false`);
    assert.ok(result.message.includes("不要当它已安装"), `${why} ⇒ 必须警示不要当已安装：${result.message}`);
    assert.ok(!/已安装[^，。]*生效/.test(result.message), `${why} ⇒ 不得输出成功形态文案`);
  }
  // 预中止（signal 已中止）⇒ 包装层 aborted 文案（两工具各自专文）
  const list = tools({ installMcp: true, uninstallMcp: true });
  const ac = new AbortController();
  ac.abort();
  const r1 = await byName(list, "install_mcp")!.handler({ name: "install_mcp", args: { roleId: "X", name: "s" }, signal: ac.signal });
  assert.equal(r1.ok, false);
  assert.ok(r1.message.includes("MCP**未能安装**（原因：会话已中止）"), "预中止安装专文");
  const r2 = await byName(list, "uninstall_mcp")!.handler({ name: "uninstall_mcp", args: { roleId: "X", name: "s" }, signal: ac.signal });
  assert.ok(r2.message.includes("MCP**未能卸载**（原因：会话已中止）"), "预中止卸载专文");
});

test("C4 失败透传与 schema 互核：能力 reason+message 原样进回执；schema 枚举句在桌面实现里逐字出现（跨源）", async () => {
  const refuse = (reason: string, message: string): InstallMcpReceipt => ({ ok: false, reason, message });
  const cases: Array<{ reason: string; message: string }> = [
    { reason: "not-registered", message: "MCP 未登记：docs/mcp/srv.md 不存在——先落盘再安装；未执行。" },
    { reason: "role-not-listed", message: "登记中未包含角色「X」——未执行；如确要安装请先更新登记。" },
    { reason: "role-not-found", message: "角色「X」不是本项目项目角色（或为治理角色 su）——未执行。" },
    { reason: "not-customer-turn", message: "本动作仅可在客户消息发起的轮次执行——未执行。" },
    { reason: "registration-unchanged", message: "登记仍含角色「X」——先改登记再卸载；未执行。" },
  ];
  for (const c of cases) {
    const list = tools({ installMcp: true }, () => refuse(c.reason, c.message));
    const result = await byName(list, "install_mcp")!.handler({ name: "install_mcp", args: { roleId: "X", name: "s" } });
    assert.equal(result.ok, false);
    assert.ok(result.message.includes(`reason: ${c.reason}`), `reason 机读标识透传：${c.reason}`);
    assert.ok(result.message.includes(c.message), `能力 message 原样透传：${c.message}`);
    assert.ok(result.message.includes("零副作用"), "未执行必须声明零副作用");
  }
  // 缺参文案逐字
  const list = tools({ installMcp: true, uninstallMcp: true });
  const noRole = await byName(list, "install_mcp")!.handler({ name: "install_mcp", args: { name: "s" } });
  assert.equal(noRole.message, "install_mcp: 缺少 roleId 参数（目标角色 id），无法安装MCP");
  const noName = await byName(list, "uninstall_mcp")!.handler({ name: "uninstall_mcp", args: { roleId: "X" } });
  assert.equal(noName.message, "uninstall_mcp: 缺少 name 参数（MCP 名，稳定短 slug），无法卸载MCP");
  // 跨源互核：schema 描述里的枚举模板（`<name>`/`<roleId>` 占位）经**同代入**后的文案，
  // 与能力侧产出的拒绝句逐字一致（模板即契约）。
  const schemaInstall = describeTool("install_mcp").description;
  const schemaUninstall = describeTool("uninstall_mcp").description;
  const substitute = (s: string): string => s.split("<roleId>").join("X").split("<name>").join("srv");
  for (const c of cases) {
    const substituted = substitute(c.message);
    if (c.reason === "registration-unchanged" || c.reason === "not-registered" && c.message.includes("不可解析")) {
      assert.ok(substitute(schemaUninstall).includes(substituted), `schema（uninstall）逐字含拒绝句：${substituted}`);
    } else {
      assert.ok(substitute(schemaInstall).includes(substituted), `schema（install）逐字含拒绝句：${substituted}`);
    }
  }
});

test("C5 零写盘两路：源码切片无写盘原语；fs 写原语 spy 下成功与失败两路恰零调用", async () => {
  // （a）源码切片：makeMcpReceiptTool 函数体内不得出现任何写盘原语
  const src = fs.readFileSync(path.join(ROOT_SRC, "src", "provider", "runtime", "tools.ts"), "utf8");
  const start = src.indexOf("function makeMcpReceiptTool");
  const end = src.indexOf("/** install_mcp：**MCP 安装**工具", start);
  assert.ok(start > 0 && end > start, "切片定位");
  const slice = src.slice(start, end);
  for (const forbidden of ["writeFile", "appendFile", "mkdir", "unlink", "rmSync", "rm(", "createWriteStream", "rename", "copyFile", "fs."]) {
    assert.ok(!slice.includes(forbidden), `makeMcpReceiptTool 切片不得含写盘原语：${forbidden}`);
  }
  assert.ok(!slice.includes("request_confirmation"), "安装链零 request_confirmation（无二次卡）");
  // （b）spy：补丁 fs 写原语，跑成功/失败两路 handler，断言零调用；真实盘快照前后一致
  const spyNames = ["writeFileSync", "appendFileSync", "mkdirSync", "rmSync", "unlinkSync", "renameSync", "copyFileSync", "createWriteStream"] as const;
  const calls: string[] = [];
  const originals = new Map<string, unknown>();
  for (const name of spyNames) {
    const orig = (fs as unknown as Record<string, unknown>)[name];
    originals.set(name, orig);
    (fs as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      calls.push(`${name}(${String(args[0])})`);
      return typeof orig === "function" ? (orig as (...a: unknown[]) => unknown)(...args) : undefined;
    };
  }
  const root = makeRoot();
  try {
    const before = snapshotTree(root);
    const list = tools({ installMcp: true });
    await byName(list, "install_mcp")!.handler({ name: "install_mcp", args: { roleId: "X", name: "s" } }); // 成功路
    const failing = tools({ installMcp: true }, () => { throw new Error("炸"); });
    await byName(failing, "install_mcp")!.handler({ name: "install_mcp", args: { roleId: "X", name: "s" } }); // 失败路
    assert.deepEqual(calls, [], `工具两路恰零写盘调用：${JSON.stringify(calls)}`);
    assert.deepEqual(snapshotTree(root), before, "盘面零变化");
  } finally {
    for (const [name, orig] of originals) (fs as unknown as Record<string, unknown>)[name] = orig;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("C6 描述诚实面在场且无正向受审表述：能力级授予/门禁之外/非逐调用受审/写边界不变/仅客户明示", () => {
  const install = describeTool("install_mcp");
  const uninstall = describeTool("uninstall_mcp");
  const all = [install.description, ...install.promptGuidelines ?? [], uninstall.description, ...uninstall.promptGuidelines ?? []].join("\n");
  for (const required of ["门禁之外", "能力级授予", "不是逐调用受审", "不改变任何角色的写边界", "仅客户明示", "先落盘再激活"]) {
    assert.ok(all.includes(required), `文案须含：${required}`);
  }
  assert.ok(uninstall.description.includes("已发生的副作用不可撤"), "卸载须写明副作用不可撤");
  assert.ok(uninstall.description.includes("先改登记再卸载"), "卸载须写明先改登记再卸载");
  assert.ok(install.description.includes("not-customer-turn"), "安装须写明非客户轮次拒绝");
  // 「逐调用受审」类表述必须是否定式（不得出现肯定面）
  for (const text of [install.description, uninstall.description]) {
    for (const clause of text.split(/[。；]/).filter((c) => c.includes("受审"))) {
      assert.ok(/不是|非|不得/.test(clause), `受审小句必须否定式：${clause}`);
    }
  }
  // 参数面：对象 schema、roleId/name 必填（describeTool 的 schema 字段名为 parameters）
  assert.deepEqual((install.parameters as { required?: unknown }).required, ["roleId", "name"]);
  assert.deepEqual((uninstall.parameters as { required?: unknown }).required, ["roleId", "name"]);
});

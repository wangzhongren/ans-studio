// test/测试/g4-skill-verify/h-scope-audit.test.ts —— G-4 独立验证 H 域：**范围审计**。
//
// 独立构造：① 预授权恰四棵（docs/su＋docs/contracts＋docs/skills＋docs/mcp——源码字面量抽取＋C 域行为侧互证）；
// ② MCP V2 已实施（install_mcp/uninstall_mcp 在 src 工具面＋schema 可描述；docs/mcp 预授权且被声明读取器消费；三适配器装配；能力位仅 su）；
// ③ 安装链零 request_confirmation（源码切片＋真实装配行为侧：全链客户通道零调用）；
// ④ 无删除原语（工具面集合＋卸载链源码切片＋E 域行为侧互证）；
// ⑤ 能力位仅 su（桌面注入判据/builtIn；编排 suppressHandback；行为侧项目角色零注册）；
// ⑥ P0 探针脚本纯本地（不在产品路径/不被 test 全局匹配/无疑似真实网端）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import { describeTool } from "../../../src/provider/runtime/schema.ts";
import type { ToolDefinition, ToolResult } from "../../../src/model/runtime.ts";
import { makeTempProject } from "./fixture.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf8");

// —————————————————————— ① 预授权范围 ——————————————————————

test("范围①：su 预授权目录字面量恰为四棵（docs/su＋docs/contracts＋docs/skills＋docs/mcp）", () => {
  // 2026-10-17（三权 V1）：单一来源迁到门禁引擎注册表 `LEGACY_SU_PREAUTHORIZED_DIRS`。
  const src = read("src/common/门禁引擎/governance-roles.ts");
  const m = src.match(/LEGACY_SU_PREAUTHORIZED_DIRS[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(m, "须能定位预授权常量（注册表单一来源）");
  const dirs = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(dirs, ["docs/su", "docs/contracts", "docs/skills", "docs/mcp"], "预授权恰四棵、顺序与集合固定");
  assert.equal(dirs.includes("docs/workflow.md"), false, "workflow.md 仍不在预授权内（走规划确认）");
  const runRole = read("src/pipeline/orchestration/run-role.ts");
  assert.equal(/const(?: readonly)? SU_PREAUTHORIZED_WRITE_DIRS/.test(runRole), false, "编排不得另写第二份字面量");
});

// —————————————————————— ② MCP V2 零产品实施 ——————————————————————

test("范围②：MCP V2 已实施——install_mcp/uninstall_mcp 在 src（工具＋schema 可描述）；docs/mcp 预授权且被声明读取器消费；三适配器装配；能力位仅 su", () => {
  // 工具面与 schema：两工具名在场（注入才注册——工具面集合钉见范围④）；已注册 ⇒ 可描述。
  const tools = read("src/provider/runtime/tools.ts");
  assert.ok(tools.includes('INSTALL_MCP_TOOL_NAME = "install_mcp"'), "install_mcp 工具名常量在位");
  assert.ok(tools.includes('UNINSTALL_MCP_TOOL_NAME = "uninstall_mcp"'), "uninstall_mcp 工具名常量在位");
  assert.ok(tools.includes("function makeInstallMcpTool(") && tools.includes("function makeUninstallMcpTool("), "两工具 maker 在位");
  for (const name of ["install_mcp", "uninstall_mcp"]) {
    const d = describeTool(name);
    assert.ok(typeof d.description === "string" && d.description.length > 0, `${name} schema 可描述（V2 已注册，非未知工具）`);
  }
  // docs/mcp 预授权（与范围① 互证）＋声明读取器单一来源。
  const registry = read("src/common/门禁引擎/governance-roles.ts");
  const m = registry.match(/LEGACY_SU_PREAUTHORIZED_DIRS[^=]*=\s*\[([^\]]*)\]/)!;
  const dirs = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.ok(dirs.includes("docs/mcp"), "docs/mcp 并入预授权（第四棵）");
  assert.ok(read("src/common/runtime-core/mcp-declarations.ts").includes('const MCP_REL = "docs/mcp";'), "声明读取器树根＝docs/mcp（单一解析来源）");
  // 三适配器装配：各自消费注入的 installedMcpServers（服务层按角色读取）。
  for (const f of ["src/provider/claude/session.ts", "src/provider/codex/session.ts", "src/common/pi-adapter/real-adapter.ts"]) {
    assert.ok(read(f).includes("installedMcpServers"), `适配器装配 installedMcpServers：${f}`);
  }
  assert.ok(read("src/service/runtime/session.ts").includes("listInstalledMcpServers(options.projectRoot"), "服务层按角色读取并注入 installedMcpServers");
  // 能力位：2026-10-17（三权 V1，评审 §5.6）编排改读能力矩阵（`cap.installMcp`，trio=Nominator、
  // single=su）；桌面注入判据 `canNominate = governanceFunction === "nomination" || legacyBuiltIn`。
  const src = read("src/pipeline/orchestration/run-role.ts");
  assert.ok(/const installMcp = cap\?\.installMcp === true \? input\.installMcp : undefined;/.test(src), "installMcp 透传判据＝能力矩阵（唯一）");
  assert.ok(/const uninstallMcp = cap\?\.installMcp === true \? input\.uninstallMcp : undefined;/.test(src), "uninstallMcp 同判据");
  const sess = read("app/desktop/session.ts");
  assert.ok(/const canNominate = governanceFunction === "nomination" \|\| legacyBuiltIn;/.test(sess), "canNominate 判据");
  for (const [fn, ty] of [["installMcp", "InstallMcpFn"], ["uninstallMcp", "UninstallMcpFn"]] as const) {
    assert.ok(
      new RegExp(`const ${fn}: ${ty} \\| undefined =\\s*\\n\\s*canNominate`).test(sess),
      `${fn} 桌面注入判据＝canNominate（single=su / trio=Nominator）`,
    );
  }
});

// —————————————————————— ③ 安装链零 request_confirmation ——————————————————————

test("范围③（源码切片）：applySkillChange 与 makeSkillReceiptTool 全切片零 request_confirmation/零客户通道调用", () => {
  const sess = read("app/desktop/session.ts");
  const start = sess.indexOf("private async applySkillChange");
  const end = sess.indexOf("private async roleStatusText");
  assert.ok(start >= 0 && end > start, "须能定位 applySkillChange 切片");
  const slice = sess.slice(start, end);
  assert.equal(slice.includes("request_confirmation"), false, "安装 handler 切片不得出现 request_confirmation");
  assert.equal(slice.includes("customerInput"), false, "安装 handler 切片不得触客户通道（结构上没有可弹的卡）");

  const tools = read("src/provider/runtime/tools.ts");
  const tStart = tools.indexOf("function makeSkillReceiptTool");
  const tEnd = tools.indexOf("function makeInstallSkillTool");
  const tSlice = tools.slice(tStart, tEnd);
  assert.equal(tSlice.includes("request_confirmation"), false, "工具 maker 切片不得出现 request_confirmation");
  assert.equal(tSlice.includes("customerInput"), false, "工具 maker 切片不得触客户通道");
});

test("范围③（行为）：真实装配 su 会话——install_skill 全链执行且客户通道零调用（无二次卡）", async () => {
  const { root } = await makeTempProject();
  const { genesisSuProject, stubDemoProvider } = await import("./h-harness.ts");
  try {
    const toolsSeen: (readonly ToolDefinition[])[] = [];
    const customerCalls: unknown[] = [];
    const results: ToolResult[] = [];
    const { factory } = stubDemoProvider({
      onTools: (tools) => toolsSeen.push(tools),
      work: async (options) => {
        const tool = options.tools.find((t) => t.name === "install_skill")!;
        results.push(await tool.handler({ name: "install_skill", args: { roleId: "X", name: "k1" }, toolCallId: "tc1" }));
      },
    });
    const handle = await openRoleSession(
      {
        roleId: "su",
        project: genesisSuProject(root),
        runtime: "demo",
        customerInput: async (req) => {
          customerCalls.push(req);
          return { outcome: "unavailable", reason: "本用例不应弹卡" };
        },
        installSkill: async (payload) => ({
          ok: true,
          action: "installed",
          roleId: payload.roleId,
          name: payload.name,
          path: `docs/skills/${payload.name}/SKILL.md`,
          digest: "c".repeat(64),
          effective: "rebuilt",
        }),
      },
      { runtimeOptions: { providerFactories: { demo: factory }, persistSession: false } },
    );
    await handle.send("装个技能");
    for await (const ev of handle.events()) if (ev.kind === "settled") break;
    const names = (toolsSeen[0] ?? []).map((t) => t.name);
    assert.ok(names.includes("install_skill"), "su 会话注册 install_skill（注入才注册）");
    assert.ok(names.includes("request_confirmation"), "客户通道在场 ⇒ 确认工具注册（本链只是不调用它）");
    assert.equal(results[0]?.ok, true, "install_skill 执行成功");
    assert.equal(customerCalls.length, 0, "全链客户通道零调用——无二次卡（行为侧）");
    await handle.dispose();

    // 项目角色会话（即便调用方误给 installSkill）⇒ 两工具零注册（真实装配行为侧）。
    const { root: projRoot } = await makeTempProject();
    const { projectWithRoleX, stubDemoProvider: stub2 } = await import("./h-harness.ts");
    const xToolsSeen: (readonly ToolDefinition[])[] = [];
    const { factory: xFactory } = stub2({ onTools: (tools) => xToolsSeen.push(tools), work: async () => {} });
    const xHandle = await openRoleSession(
      {
        roleId: "X",
        project: projectWithRoleX(projRoot),
        runtime: "demo",
        installSkill: async () => ({ ok: false, reason: "should-never-be-used", message: "m" }),
        uninstallSkill: async () => ({ ok: false, reason: "should-never-be-used", message: "m" }),
      },
      { runtimeOptions: { providerFactories: { demo: xFactory }, persistSession: false } },
    );
    await xHandle.send("普通干活");
    for await (const ev of xHandle.events()) if (ev.kind === "settled") break;
    const xNames = (xToolsSeen[0] ?? []).map((t) => t.name);
    assert.equal(xNames.includes("install_skill"), false, "项目角色零注册（只 su）");
    assert.equal(xNames.includes("uninstall_skill"), false, "项目角色零注册（只 su）");
    await xHandle.dispose();
    fs.rmSync(projRoot, { recursive: true, force: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("范围③补＋⑤：编排判据——installSkill 由能力矩阵透传（single=su / trio=Nominator）；项目角色即便误给也零注册", () => {
  const src = read("src/pipeline/orchestration/run-role.ts");
  assert.ok(
    /const installSkill = cap\?\.installSkill === true \? input\.installSkill : undefined;/.test(src),
    "installSkill 透传判据＝能力矩阵（唯一）",
  );
  assert.ok(
    /const uninstallSkill = cap\?\.installSkill === true \? input\.uninstallSkill : undefined;/.test(src),
    "uninstallSkill 同判据",
  );
  const sess = read("app/desktop/session.ts");
  const inject = sess.match(/const installSkill: InstallSkillFn \| undefined =\s*\n?\s*canNominate/);
  assert.ok(inject, "桌面注入判据＝canNominate（single=su / trio=Nominator）");
});

// —————————————————————— ④ 无删除原语 ——————————————————————

test("范围④：工具面无删除原语；卸载链源码不含 unlink/rm/删除调用（文件保留——E 域行为侧互证）", () => {
  const names = buildGovernedTools(() => ({ allowed: false, reason: "audit", allowedByRoot: { project: [], skill: [] } }), {
    installSkill: async () => ({ ok: false, reason: "r", message: "m" }),
    uninstallSkill: async () => ({ ok: false, reason: "r", message: "m" }),
    customerInput: async () => ({ outcome: "declined" }),
  }).map((t) => t.name);
  assert.deepEqual(names.sort(), ["edit_file", "install_skill", "list_dir", "read_file", "request_choice", "request_confirmation", "uninstall_skill", "write_file"].sort(), "工具面集合固定（运行核新增只读 list_dir；无删除/无导出第三套）");
  assert.equal(names.some((n) => /delete|remove|unlink|rm_/.test(n)), false, "不得注册任何删除类工具");
  const sess = read("app/desktop/session.ts");
  const start = sess.indexOf("private async applySkillChange");
  const end = sess.indexOf("private async roleStatusText");
  const slice = sess.slice(start, end);
  for (const banned of ["unlink", "rmSync", "rm(", "deleteFile", "removeSync"]) {
    assert.equal(slice.includes(banned), false, `卸载/安装链不得含删除原语：${banned}`);
  }
});

// —————————————————————— ⑥ 探针脚本纯本地 ——————————————————————

test("范围⑥：mcp-surface 探针为 scratch 评估物——不在产品路径/不被 test 全局匹配/无真实网端/零引用", () => {
  const probes = ["test/claude-adapter/mcp-fake-stdio-server.probe.ts", "test/claude-adapter/mcp-surface-loopback.probe.ts", "test/pi-adapter/mcp-probe-server.probe.ts", "test/pi-adapter/mcp-surface.probe.ts"];
  for (const f of probes) {
    assert.ok(fs.existsSync(path.join(REPO, f)), `探针存在：${f}`);
    assert.ok(f.endsWith(".probe.ts"), "扩展名 .probe.ts —— 不被 `node --test \"test/**/*.test.ts\"` 匹配执行");
    const text = read(f);
    // 端点点名：仅 127.0.0.1 回环与 .invalid 保留域（不解析、不可达）。
    const urls = [...text.matchAll(/https?:\/\/[a-zA-Z0-9.:_-]+/g)].map((m) => m[0]);
    for (const u of urls) {
      assert.ok(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(u) || u.includes(".invalid"), `探针端点须为回环/保留域：${u}（${f}）`);
    }
  }
  // 零引用：任何 *.test.ts 不得 import 探针（含相对路径与裸名）。
  const testFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".test.ts")) testFiles.push(rel);
    }
  };
  walk("test");
  for (const f of testFiles) {
    if (f.startsWith("test/测试/g4-skill-verify/")) continue; // 本验证目录自身即审计者（自引用除外）
    const text = read(f);
    for (const probe of probes) {
      const base = probe.split("/").at(-1)!.replace(/\.ts$/, "");
      assert.equal(text.includes(base), false, `${f} 不得引用探针 ${base}`);
    }
    assert.equal(text.includes(".probe"), false, `${f} 不得引用任何 .probe 模块`);
  }
  // CI 零执行。
  const ci = read(".github/workflows/release.yml");
  assert.equal(ci.includes(".probe"), false, "CI 工作流不得执行探针");
});

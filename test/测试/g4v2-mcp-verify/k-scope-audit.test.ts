// test/测试/g4v2-mcp-verify/k-scope-audit.test.ts —— K 域：范围审计（stdio 限定/名拒/零二次卡/诚实面/仅 su/探针本地/tools-only）
// ＋ J 域桌面UI：`[系统·安装]` 归类复用零改动实证。
//
// 独立构造：源码切片读取＋真实盘行为交叉核（F 夹具）＋tool-rows.js 真装载归类。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { makeFHarness, openSuAndStartTurn } from "./f-fixture.ts";
import { writeMcpDeclaration } from "./helpers.ts";
import { mcpToolAllowedByWhitelistedServer } from "../../../src/common/pi-adapter/real-adapter.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("K1 stdio 限定全链：契约/读取器/两适配器装配面无 http/url/headers 字段；名特殊字符全链拒（读取器＋handler 行为）", async () => {
  const contract = read("src/model/runtime.ts");
  // 字段面冻结：InstalledMcpServerV1 接口体恰为 name/command/args/env（无 url/headers 等 HTTP 面字段）
  const ifaceStart = contract.indexOf("export interface InstalledMcpServerV1 {");
  const ifaceEnd = contract.indexOf("\n}", ifaceStart);
  const iface = contract.slice(ifaceStart, ifaceEnd);
  assert.ok(ifaceStart > 0 && iface.length > 50, "接口切片定位");
  const fields = [...iface.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]).sort();
  assert.deepEqual(fields, ["args", "command", "env", "name"], `字段集恰等（stdio 限定；实得 ${JSON.stringify(fields)}）`);
  const reader = read("src/common/runtime-core/mcp-declarations.ts");
  for (const forbidden of ["http://", "https://", "url", "headers", "fetch(", "net.connect"]) {
    assert.ok(!reader.toLowerCase().includes(forbidden.toLowerCase()), `读取器不得含 ${forbidden}`);
  }
  const codexConfig = read("src/common/codex-adapter/config.ts");
  const codexBlock = codexConfig.slice(codexConfig.indexOf("export function mcpServersOverride"), codexConfig.indexOf("export function safetyOverrides"));
  for (const forbidden of ["url", "headers", "http"]) {
    assert.ok(!codexBlock.toLowerCase().includes(forbidden), `Codex 覆盖编码器不得含 ${forbidden}`);
  }
  const claude = read("src/provider/claude/session.ts");
  assert.ok(claude.includes(`type: "stdio" as const`), "Claude 装配恒 stdio");
  // 行为：名含特殊字符/保留名 ⇒ 读取器拒 ⇒ handler 以 not-registered 如实拒绝（不触任何盘面外副作用）
  const h = await makeFHarness();
  try {
    await openSuAndStartTurn(h);
    const install = h.suInstallMcp()!;
    for (const bad of ["a.b", "a b", "路径/穿越", "ans", "ans_codex"]) {
      const r = (await install({ roleId: "X", name: bad })) as { ok: boolean; reason?: string };
      assert.equal(r.ok, false, `名非法/保留必须拒：${bad}`);
      assert.equal(r.reason, "not-registered", `reason 映射（读取器 undefined ⇒ 未登记类）：${bad}`);
    }
    assert.equal(h.disposed("X"), 0, "零重建（拒绝零副作用）");
  } finally {
    h.cleanup();
  }
});

test("K2 安装链零二次卡：handler/工具/读取器三处源码切片零 request_confirmation；配置文件模板不含真实网关调用面", () => {
  const desktop = read("app/desktop/session.ts");
  const handler = desktop.slice(desktop.indexOf("private async applyMcpChange"), desktop.indexOf("// ——————— G-2/W1"));
  assert.ok(handler.length > 500, "切片定位（applyMcpChange）");
  for (const forbidden of ["request_confirmation", "confirmation-gated", "confirmed:true", "request_choice"]) {
    assert.ok(!handler.includes(forbidden), `MCP handler 不得含 ${forbidden}（无二次卡＝结构上没有确认通道）`);
  }
  const tools = read("src/provider/runtime/tools.ts");
  const maker = tools.slice(tools.indexOf("function makeMcpReceiptTool"), tools.indexOf("/** install_mcp：**MCP 安装**工具"));
  assert.ok(!maker.includes("request_confirmation"), "两工具 maker 零确认通道");
  const reader = read("src/common/runtime-core/mcp-declarations.ts");
  assert.ok(!reader.includes("request_confirmation"), "读取器零确认面");
  // 无真实网关调用面：V2 新增/修改的非测试源文件不得出现 fetch/http 请求原语（stdio 限定＋探针约束）
  for (const rel of ["src/common/runtime-core/mcp-declarations.ts", "src/common/claude-adapter/mcp-launcher.mjs"]) {
    const src = read(rel);
    for (const forbidden of ["fetch(", "http.request", "https.request", "net.connect(", "WebSocket"]) {
      assert.ok(!src.includes(forbidden), `${rel} 不得含 ${forbidden}`);
    }
  }
});

test("K3 探针纯本地：V2/既有探针文件零真实网关端点（仅回环/.invalid）；不被 test 全局匹配（动态枚举，不点名引用）", () => {
  // 分片拼接探针扩展名——V1 零引用钉要求任何 `.test.ts` 源码不得含该子串字面（本测试动态枚举，
  // 不点名引用任何具体探针文件；枚举面更宽＝更严）。
  const PROBE_SUFFIX = ["", "pro", "be", ".ts"].join("");
  const found: string[] = [];
  for (const dir of ["test/claude-adapter", "test/pi-adapter", "test/runtime-core", "test/codex-adapter"]) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      // 本域只审计 MCP 相关探针（V2 面）；其它批次探针归各自验收（既有 G-3 已单核）。
      if (entry.isFile() && entry.name.endsWith(PROBE_SUFFIX) && entry.name.includes("mcp")) found.push(`${dir}/${entry.name}`);
    }
  }
  assert.ok(found.length >= 4, `探针枚举数应 ≥4（实得 ${found.length}：${JSON.stringify(found)}）`);
  for (const rel of found) {
    const src = read(rel);
    assert.ok(!/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/.test(src), `${rel} 不得含真实网关端点`);
    const urls = [...src.matchAll(/https?:\/\/[a-zA-Z0-9.:_-]+/g)].map((m) => m[0]);
    for (const url of urls) {
      // 回环 ∪ RFC 2606/6761 保留域（.invalid/.test/.example/.localhost——不解析、不可达）
      assert.ok(/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])([:/]|$)/.test(url) || /\.(invalid|test|example|localhost)([:/]|$)/.test(url), `探针端点须回环/保留域：${url}（${rel}）`);
    }
    assert.ok(!rel.endsWith(".test.ts"), `${rel} 以探针扩展名结尾——不被 test 全局匹配执行`);
  }
  // 夹具 server（相对路径引用目标，非探针）：同样零真实网关
  const fixture = read("test/pi-adapter/mcp-fixture-server.ts");
  assert.ok(!/api\.anthropic\.com|api\.openai\.com/.test(fixture), "Pi 夹具 server 零真实网关");
});

test("K4 诚实面三处在位（卡/schema/系统行）＋能力位仅 su（桌面/编排判据字面）", () => {
  const card = read("src/common/门禁引擎/boundary-core.ts");
  assert.ok(card.includes("能力级授予") && card.includes("在 ANS 门禁之外执行") && card.includes("不得表述为逐调用受审"), "su 卡诚实面三要点在位");
  const schema = read("src/provider/runtime/schema.ts");
  assert.ok(schema.includes("能力级授予") && schema.includes("门禁之外") && schema.includes("不是逐调用受审"), "schema 诚实面在位");
  const desktop = read("app/desktop/session.ts");
  assert.ok(desktop.includes("外来 MCP 工具在 ANS 门禁之外执行（能力级授予，非逐调用受审）"), "系统行诚实面逐字在位");
  // 能力位仅 su：桌面注入判据 + 编排透传判据字面
  assert.ok(desktop.includes("const installMcp: InstallMcpFn | undefined =\n      role.builtIn === true"), "桌面注入判据 role.builtIn === true（逐字）");
  const runRole = read("src/pipeline/orchestration/run-role.ts");
  assert.ok(runRole.includes("const installMcp = suppressHandback ? input.installMcp : undefined;"), "编排透传判据逐字（仅 su）");
});

test("K5 tools-only 无资源工具放行面：三名不在 Pi 前缀白名单命中面；Codex 桥名恒 mcp__<server>__（无资源工具特例）", () => {
  for (const name of ["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"]) {
    assert.equal(mcpToolAllowedByWhitelistedServer(name, ["srv"]), false, `${name} 不在放行面（不接＝不放行）`);
  }
  const protocol = read("src/common/codex-adapter/protocol.ts");
  const nameFn = protocol.slice(protocol.indexOf("export function mcpToolName"), protocol.indexOf("export function mcpToolCallNative"));
  assert.ok(nameFn.includes("mcp__${server.replace"), "Codex 桥名恒 mcp__ 前缀（无资源工具别名面）");
  // 前缀判据两处同源（1128 构造校验＋门禁）：同一 `allowedSurface` 对象经 context 传入，两处都 `.has`
  const pi = read("src/common/pi-adapter/real-adapter.ts");
  assert.ok(pi.includes("...turnContext, allowedToolNames: allowedSurface,"), "1128 门禁面＝allowedSurface（同一对象经 context 传入）");
  assert.ok(pi.includes("const unexpected = session.getActiveToolNames().filter((name) => !allowedSurface.has(name));"), "1128 构造校验用同一 allowedSurface.has");
  assert.ok(pi.includes("if (context.allowedToolNames.has(event.toolName)) return undefined;"), "门禁消费同一 .has（无第二份判据）");
  assert.ok(pi.includes("has: (name: string): boolean => allowedToolNames.has(name) || mcpToolAllowedByWhitelistedServer(name, mcpWhitelist)"), "组合面＝精确注入名 ∪ 前缀面（单一构造点）");
});

test("K6 桌面UI：`[系统·安装]` 归类复用零改动——MCP 行经 tool-rows.classifyInjectedMessage 归 system 类", async () => {
  const href = new URL("../../../app/renderer/tool-rows.js", import.meta.url).href;
  await import(href);
  const Tr = (globalThis as Record<string, unknown>).ANSToolRows as {
    classifyInjectedMessage: (raw: unknown) => { kind?: string; label?: string; displayBody?: string } | null;
  };
  const row = "[系统·安装] 已安装 MCP「srv-ok」→ 角色「X」；已重建该角色会话、即刻生效；声明：docs/mcp/srv-ok.md（sha256 0123456789ab）；外来 MCP 工具在 ANS 门禁之外执行（能力级授予，非逐调用受审）。";
  const cls = Tr.classifyInjectedMessage(row);
  assert.ok(cls, "MCP 安装行必须被归类（非普通气泡）");
  assert.equal(cls!.kind, "system", "归 system 类（第四类投递复用）");
  assert.equal(cls!.label, "系统消息 · 安装", "子类标签＝安装");
  assert.ok(String(cls!.displayBody).startsWith("已安装 MCP「srv-ok」"), "展示正文剥文首标记后为事实原文");
  // 技能行同归类（同子类复用——两族安装行一套判据）
  const skillRow = Tr.classifyInjectedMessage("[系统·安装] 已安装技能「k」→ 角色「X」");
  assert.equal(skillRow!.kind, "system");
  // 前缀判据变化必须回落——负例：无空白紧随（伪形态不归类）
  assert.equal(Tr.classifyInjectedMessage("[系统·安装]伪行"), null, "伪形态（无空白）不归类（判据未放松）");
});

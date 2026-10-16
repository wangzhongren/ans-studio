// G-3 独立验证（测试角色）：批准口径范围审计（未批准项零实施）＋工具行折叠口径的 tool-rows 单测与
// 渲染侧纪律源码钉。**不复用实施方断言**：审计项与用例输入独立构造。
//
// 运行：node --test "test/测试/g3-search-verify/scope-audit-and-fold.test.ts"（零网络）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SERVER_TOOL_REGISTRY } from "../../../src/common/pi-adapter/server-tools.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

await import(new URL("../../../app/renderer/tool-rows.js", import.meta.url).href);
const Tr = (globalThis as unknown as { ANSToolRows: any }).ANSToolRows;

// —————————————————————— 范围审计：批准口径 ①-⑥ 逐条 ——————————————————————

test("审计①：三开关默认关且只在适配器源码（设置面板字段未做）；渲染/共享零引用", () => {
  assert.deepEqual(SERVER_TOOL_REGISTRY.map((entry) => entry.id), ["web_search", "web_fetch"], "注册表=批准的首批集合");
  const settings = read("src/common/shared/runtime-settings.ts");
  for (const name of ["ANS_PI_SERVER_TOOLS", "ANS_CLAUDE_WEB_SEARCH", "ANS_CODEX_WEB_SEARCH"]) {
    assert.equal(settings.includes(name), false, `设置面板元数据不得提前落 ${name}（期 2 未批准）`);
    assert.equal(read("app/renderer/renderer.js").includes(name), false, `渲染侧不得见 ${name}`);
    assert.equal(read("app/renderer/tool-rows.js").includes(name), false);
  }
});

test("审计②：首批工具集——Pi 注册表恰 web_search/web_fetch；Claude 只升 WebSearch（无 WebFetch）；Codex 不落 [tools] 键", () => {
  const claude = read("src/provider/claude/session.ts");
  assert.ok(claude.includes('"WebSearch"'));
  assert.equal(claude.includes("WebFetch"), false, "WebFetch 客户端形态未批准——不得提前实施");
  assert.equal(claude.includes("code_execution"), false);
  const codexConfig = read("src/common/codex-adapter/config.ts");
  assert.equal(codexConfig.includes("tools.web_search"), false, "T3 实证不用的键不得出现在覆盖面");
  assert.equal(JSON.stringify(SERVER_TOOL_REGISTRY).includes("code_execution"), false, "code_execution 不得进 Pi 注册表（缓：只许在客户 live 探针脚本声明）");
});

test("审计④：无自动剥离重试——全仓 src 零 agent_before_settle；Pi 扩展恰三 handler；无第二重试实现", () => {
  for (const relative of [
    "src/common/pi-adapter/real-adapter.ts", "src/common/pi-adapter/server-tools.ts",
    "src/provider/claude/session.ts", "src/provider/codex/session.ts", "src/common/codex-adapter/config.ts",
  ]) {
    const source = read(relative);
    assert.equal(source.includes("agent_before_settle"), false, relative);
    assert.equal(source.includes("suppressNext"), false, relative);
  }
  const real = read("src/common/pi-adapter/real-adapter.ts");
  for (const handler of ['pi.on("before_provider_request"', 'pi.on("provider_stream_event"', 'pi.on("message_end"']) {
    assert.ok(real.includes(handler), `Pi 服务端工具扩展 handler 应在位：${handler}`);
  }
  // handler 仅在启用分支注册（未启用零注册）——`serverTools` 判据先于三个 pi.on。
  const gateIndex = real.indexOf("if (serverTools !== undefined && serverTools.declarations.length > 0)");
  const firstHandler = real.indexOf('pi.on("before_provider_request"');
  assert.ok(gateIndex >= 0 && firstHandler > gateIndex, "三个 handler 必须在启用判据内部（未启用零注册）");
});

test("审计⑤：行样式与工具行/折叠口径合流——适配器走 projectToolEvent；渲染侧零搜索专属代码", () => {
  assert.ok(read("src/common/pi-adapter/real-adapter.ts").includes('origin: "native-start"'));
  assert.ok(read("src/common/pi-adapter/real-adapter.ts").includes('origin: "native-result"'));
  const claude = read("src/provider/claude/session.ts");
  assert.ok(claude.includes('origin: "native-start"') && claude.includes('origin: "native-result"'));
  assert.ok(read("src/provider/codex/session.ts").includes("webSearchRow"));
  for (const agent of ["pi", "claude", "codex"]) {
    assert.ok(read(`src/provider/${agent}/session.ts`).length > 100); // 存在性（三路径会话仍在原位）
  }
  for (const file of ["app/renderer/renderer.js", "app/renderer/tool-rows.js", "app/renderer/styles.css"]) {
    const source = read(file);
    for (const needle of ["web_search", "WebSearch", "联网搜索", "server_tool", "serverTools"]) {
      assert.equal(source.includes(needle), false, `${file} 不应含搜索专属代码（${needle}）——合流即零改动`);
    }
  }
});

test("审计③：查询串不进诊断落盘——Pi 的 server_tool.* 诊断调用字段面全在白名单内；桌面渲染诊断不携行文", () => {
  const real = read("src/common/pi-adapter/real-adapter.ts");
  const recordCalls = [...real.matchAll(/diagnostics\?\.record\("server_tool\.[a-z_]+", \{([^}]*)\}/g)].map((match) => match[1]!);
  assert.ok(recordCalls.length >= 4, "应存在 declare/call/usage/degraded 四类记录点");
  const allowed = new Set(["turnId", "toolName", "toolCallId", "count", "state", "errorCode", "reasonCode", "ok"]);
  for (const call of recordCalls) {
    // 键提取：标识符后跟 `,`/`:`/`}`（值表达式如 observation.reason 的标识符后跟 `.`/`(`，不会误取；
    // true/false 等字面量显式排除）。
    const literal = new Set(["false", "true", "null", "undefined"]);
    const keys = [...call.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|:|\}|$)/g)].map((match) => match[1]!).filter((key) => !literal.has(key));
    for (const key of keys) {
      assert.ok(allowed.has(key), `诊断字段越白名单：${key}（${call.trim()}）`);
    }
    assert.ok(keys.length >= 1);
  }
});

test("审计边界：客户 live 探针脚本在位（由客户运行）；本套件对真实网关零请求", () => {
  assert.equal(existsSync(path.join(ROOT, "test/pi-adapter/server-tools-probe.ts")), true, "客户 live 探针应在位（由客户运行，本角色不跑）");
  // 本验证全部网络面=127.0.0.1 loopback（pi-loopback-verify）与 in-process 假件；四个执行面文件不得出现真实网关字样。
  const sources = ["pi-parse-verify.test.ts", "pi-loopback-verify.test.ts", "claude-websearch-verify.test.ts", "codex-websearch-verify.test.ts"]
    .map((name) => read(path.join("test/测试/g3-search-verify", name))).join("\n");
  for (const forbidden of ["aiproxy", "deepseek", "api.anthropic.com", "api.openai.com"]) {
    assert.equal(sources.includes(forbidden), false, `验证套件不得出现真实网关字样：${forbidden}`);
  }
  assert.equal(sources.includes("127.0.0.1"), true, "Pi loopback 走 127.0.0.1（假服务器）");
});

// —————————————————————— 工具行折叠：tool-rows callSummary 独立对抗 ——————————————————————

const call = (over: Record<string, unknown>) => ({ status: "call", toolName: "t", callId: "", turnId: "", ...over });

test("callSummary：空表与单相位；两相位合并为一次调用；不同 callId 各占一行（turnId 参与身份）", () => {
  assert.deepEqual(Tr.callSummary([]), { calls: 0, denied: 0, failed: 0, unknown: false, tools: [] });
  assert.deepEqual(Tr.callSummary([call({ callId: "c1" })]), { calls: 1, denied: 0, failed: 0, unknown: false, tools: [{ name: "t", count: 1 }] });
  const two = Tr.callSummary([call({ callId: "c1", status: "call" }), call({ callId: "c1", status: "completed" })]);
  assert.equal(two.calls, 1, "同 callId 两相位并一行");
  const crossTurn = Tr.callSummary([call({ callId: "c1", turnId: "T1" }), call({ callId: "c1", turnId: "T2" })]);
  assert.equal(crossTurn.calls, 2, "同 callId 异轮不合并");
  const noId = Tr.callSummary([call({}), call({})]);
  assert.equal(noId.calls, 2, "无 callId 各成一行");
});

test("callSummary：工具分解首现序 + ×k 仅 k>1；名字取终态相位（终态缺失回退首相位、双缺失为「工具」）", () => {
  const sum = Tr.callSummary([
    call({ callId: "a", toolName: "role_status" }),
    call({ callId: "b", toolName: "run_shell" }),
    call({ callId: "c", toolName: "run_shell" }),
    call({ callId: "d", toolName: "read_file" }),
  ]);
  assert.deepEqual(sum.tools, [{ name: "role_status", count: 1 }, { name: "run_shell", count: 2 }, { name: "read_file", count: 1 }]);
  const renamed = Tr.callSummary([call({ callId: "x", toolName: "旧名" }), call({ callId: "x", toolName: "新名" })]);
  assert.deepEqual(renamed.tools, [{ name: "新名", count: 1 }], "名字取终态相位（如实登记口径）");
  const fallbackFirst = Tr.callSummary([call({ callId: "y", toolName: "首相位名" }), call({ callId: "y", toolName: "" })]);
  assert.deepEqual(fallbackFirst.tools, [{ name: "首相位名", count: 1 }], "终态空回退首相位");
  const anon = Tr.callSummary([call({ callId: "z", toolName: "" })]);
  assert.deepEqual(anon.tools, [{ name: "工具", count: 1 }]);
});

test("callSummary：denied/failed 拆分（同相位行 denied 优先、timed-out 并入 failed、exited-nonzero 中性不计数）", () => {
  const deniedOnly = Tr.callSummary([call({ callId: "d1", status: "denied" })]);
  assert.deepEqual({ denied: deniedOnly.denied, failed: deniedOnly.failed }, { denied: 1, failed: 0 });
  const failedOnly = Tr.callSummary([call({ callId: "f1", status: "failed" })]);
  assert.deepEqual({ denied: failedOnly.denied, failed: failedOnly.failed }, { denied: 0, failed: 1 });
  const prio = Tr.callSummary([call({ callId: "p", status: "failed" }), call({ callId: "p", status: "denied" })]);
  assert.deepEqual({ denied: prio.denied, failed: prio.failed }, { denied: 1, failed: 0 }, "一行两相位 ⇒ 未放行优先、一笔只进一类");
  const timedOut = Tr.callSummary([call({ callId: "to", status: "timed-out" })]);
  assert.deepEqual({ denied: timedOut.denied, failed: timedOut.failed }, { denied: 0, failed: 1 }, "超时终止并入失败");
  const exited = Tr.callSummary([call({ callId: "en", status: "exited-nonzero" })]);
  assert.deepEqual({ denied: exited.denied, failed: exited.failed, unknown: exited.unknown }, { denied: 0, failed: 0, unknown: false }, "退出码非零属中性类（F-8-b）不标红");
  const unknown = Tr.callSummary([call({ callId: "u", status: "unknown" })]);
  assert.equal(unknown.unknown, true);
  const mixed = Tr.callSummary([call({ callId: "m1", status: "denied" }), call({ callId: "m2", status: "timed-out" }), call({ callId: "m3", status: "unknown" })]);
  assert.deepEqual({ calls: mixed.calls, denied: mixed.denied, failed: mixed.failed, unknown: mixed.unknown }, { calls: 3, denied: 1, failed: 1, unknown: true });
  assert.deepEqual(Tr.callSummary("junk"), { calls: 0, denied: 0, failed: 0, unknown: false, tools: [] }, "非数组容忍为空白");
});

// —————————————————————— 工具行折叠：渲染侧纪律源码钉（行为由 fold-probe e2e 覆盖）——————————————————————

const RENDERER = read("app/renderer/renderer.js");

test("渲染侧无计时器（settle 驱动）——全文零 setTimeout/setInterval 调用；折叠挂点在批尾", () => {
  assert.equal(/\bsetTimeout\s*\(/.test(RENDERER), false, "renderer 不得有 setTimeout 调用");
  assert.equal(/\bsetInterval\s*\(/.test(RENDERER), false, "renderer 不得有 setInterval 调用");
  assert.ok(RENDERER.includes("flushDeferredFolds(); // 工具行折叠口径"), "批尾挂点必须在 flushBatchSideEffects 内");
  const settledBranch = RENDERER.indexOf("foldTurnGroups(pane, ev.turnId);");
  assert.ok(settledBranch >= 0, "settled 分支必须触发折叠");
  assert.ok(RENDERER.includes("if (batchDepth > 0) { deferredFolds.push({ pane: pane, turnId: turnId }); return; }"), "批内折叠必须推迟到批尾");
});

test("渲染侧默认态三判据（运行中不折叠的唯一入口）与手动优先守卫在位", () => {
  for (const fragment of [
    'if (activity.origin !== "live" || turnId === "") return false;',
    "if (rl.settledTurns && rl.settledTurns[turnId]) return false;",
    'return state.roleBusy[pane.dataset.roleId || ""] === true;',
  ]) {
    assert.ok(RENDERER.includes(fragment), `默认开合判据缺失：${fragment}`);
  }
  assert.ok(RENDERER.includes("if (groupManualOpen(pane.dataset.roleId || \"\", rec.data.id) !== null) return;"), "手动开合优先守卫必须在 syncGroupOpen");
  assert.ok(RENDERER.includes("if (groupManualOpen(pane.dataset.roleId || \"\", rec.data.id) !== null) continue;"), "settled 折叠必须跳过手动开合过的组");
  assert.ok(RENDERER.includes("if (rec.el && rec.el.contains(document.activeElement)) continue;"), "焦点在组内必须跳过折叠");
});

test("渲染侧折叠行文案模板（含未放行/失败/未记录三段与分解连接符）源码在位", () => {
  for (const fragment of [
    'var text = "本轮 " + (sum.calls + \' 个调用\') + (tools ? "：" + tools : "");',
    'text += " · 含 " + sum.denied + " 条未放行";',
    'text += " · 含 " + sum.failed + " 条失败";',
    "text += ' · 含状态未记录';",
  ]) {
    assert.ok(RENDERER.includes(fragment), `折叠文案模板缺失：${fragment}`);
  }
  assert.ok(RENDERER.includes('t.name + (t.count > 1 ? " ×" + t.count : "")'), "工具分解 ×k 仅 k>1");
});

test("渲染侧：未放行相位并入同轮同 callId 组行（组不切断）；独立未放行行照旧直显", () => {
  assert.ok(RENDERER.includes("if (activity.callId && rl.activityGroup && rl.activityGroup.data && rl.activityGroup.data.turnId === activity.turnId)"), "并入判据：同轮");
  assert.ok(RENDERER.includes("assocItem && assocItem.callId === activity.callId && assocItem.turnId === activity.turnId"), "并入判据：组内同 callId");
  assert.ok(RENDERER.includes("if (!assocGroup) rl.activityGroup = null;"), "无法关联才切断组");
  assert.ok(RENDERER.includes("appendDenied(pane, activity.deniedSummary || activity.visibleSummary"), "独立未放行行照旧直显（治理信号全量）");
});

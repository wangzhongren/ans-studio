// scratch 探针夹具：最小 stdio MCP server（newline-delimited JSON-RPC 2.0）。
// 归属：Pi适配器角色测试目录。**不是自动化测试**（`test/**/*.test.ts` glob 不会选中本文件）。
//
// 用途（V2 MCP P0 探针 §九.3；纯本地、零网关请求）：
//   node test/pi-adapter/mcp-probe-server.probe.ts --name=probe-srv --tools=echo,pid \
//     --dump-env=/path/dump.json --call-log=/path/calls.log --init-delay=0
//
// 行为：
//   · 启动即把 **env 键名清单**（仅键名，无值）＋本进程 pid/ppid 同步写 --dump-env 指定文件（环境收窄证据）；
//   · 逐行读 stdin 的 JSON-RPC；initialize（可经 --init-delay 延迟响应）/tools/list/tools/call/ping 正常应答；
//     未知方法回 -32601（resources 类查询照此——服务端只声明 tools 能力）；
//   · tools/call 追加一行 `name\tISO时间` 到 --call-log（工具是否真正到达服务端的证据）；
//   · stdin 关闭即退出（transport close 语义）。

import { appendFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const serverName = arg("name") ?? "probe-srv";
const toolNames = (arg("tools") ?? "echo").split(",").map((s) => s.trim()).filter((s) => s !== "");
const dumpEnvPath = arg("dump-env");
const callLogPath = arg("call-log");
const initDelayMs = Number(arg("init-delay") ?? "0") || 0;
/** `--resources`：声明 resources 能力并提供一条资源（tools-only 强制回归用）。 */
const withResources = argv.includes("--resources");

// 环境收窄证据：只写键名（绝不写值）。
if (dumpEnvPath !== undefined) {
  writeFileSync(
    dumpEnvPath,
    JSON.stringify({ server: serverName, pid: process.pid, ppid: process.ppid, envKeys: Object.keys(process.env).sort() }, null, 2),
  );
}

function send(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toolsList(): unknown[] {
  return toolNames.map((name) => ({
    name,
    description: `probe tool ${name}`,
    inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: true },
  }));
}

function handle(message: Record<string, unknown>): void {
  const method = message["method"];
  const id = message["id"];
  const isRequest = id !== undefined && id !== null; // notification（无 id）一律不回
  if (method === "initialize" && isRequest) {
    const respond = () =>
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: (message["params"] as Record<string, unknown> | undefined)?.["protocolVersion"] ?? "2025-11-25",
          capabilities: { tools: {}, ...(withResources ? { resources: {} } : {}) },
          serverInfo: { name: serverName, version: "0.0.1-probe" },
        },
      });
    if (initDelayMs > 0) setTimeout(respond, initDelayMs);
    else respond();
    return;
  }
  if (method === "resources/list" && isRequest) {
    send({ jsonrpc: "2.0", id, result: { resources: withResources ? [{ uri: "probe://fixture/resource", name: "fixture-resource", mimeType: "text/plain" }] : [] } });
    return;
  }
  if (method === "resources/templates/list" && isRequest) {
    send({ jsonrpc: "2.0", id, result: { resourceTemplates: [] } });
    return;
  }
  if (method === "ping" && isRequest) {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list" && isRequest) {
    send({ jsonrpc: "2.0", id, result: { tools: toolsList() } });
    return;
  }
  if (method === "tools/call" && isRequest) {
    const params = (message["params"] as Record<string, unknown> | undefined) ?? {};
    const name = String(params["name"] ?? "");
    if (callLogPath !== undefined) appendFileSync(callLogPath, `${name}\t${new Date().toISOString()}\n`);
    if (!toolNames.includes(name)) {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool ${name}` } });
      return;
    }
    const args = (params["arguments"] as Record<string, unknown> | undefined) ?? {};
    const payload = name === "pid" ? { pid: process.pid, ppid: process.ppid } : { echo: args };
    send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } });
    return;
  }
  if (isRequest) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(method)}` } });
  }
  // notification：静默（含 notifications/initialized）。
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  for (;;) {
    const at = buffer.indexOf("\n");
    if (at < 0) break;
    const line = buffer.slice(0, at).trim();
    buffer = buffer.slice(at + 1);
    if (line === "") continue;
    try {
      const message = JSON.parse(line) as Record<string, unknown>;
      if (message !== null && typeof message === "object") handle(message);
    } catch {
      // 非法行忽略（探针面不需要错误协议）。
    }
  }
});
process.stdin.on("end", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

// G-4 V2（P3 Pi）测试夹具：最小 stdio MCP server（newline-delimited JSON-RPC 2.0）。
// 归属：Pi适配器角色测试目录。**不是探针**（零探测行为：不落 env 清单、不记调用日志，除非显式要求）；
// 由 `installed-mcp-servers.test.ts` 以 `process.execPath` 拉起（子进程），供 MCP 接线/放行/收窄回归。
// 无 product 引用；`test/**/*.test.ts` glob 不匹配本文件（仅作被 spawn 的子进程脚本）。
//
// 用法（由测试构造 argv）：
//   node test/pi-adapter/mcp-fixture-server.ts --name=srv --tools=echo[,pid] \
//     [--dump-env=<path>] [--call-log=<path>] [--init-delay=<ms>] [--resources]
//
// 行为：
//   · initialize（可经 --init-delay 延迟；--resources ⇒ capabilities 含 resources，并应答 resources/list）/
//     tools/list / tools/call（追加 `name\tISO时间` 到 --call-log）/ ping；未知方法回 -32601。
//   · --dump-env 时启动即把 **env 键名清单**（仅键名，无值）＋pid/ppid 写该文件（env 收窄断言用）。
//   · stdin 关闭或 SIGTERM/SIGINT 即退出。

import { appendFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
function arg(name: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const serverName = arg("name") ?? "fixture-srv";
const toolNames = (arg("tools") ?? "echo").split(",").map((s) => s.trim()).filter((s) => s !== "");
const dumpEnvPath = arg("dump-env");
const callLogPath = arg("call-log");
const initDelayMs = Number(arg("init-delay") ?? "0") || 0;
const withResources = argv.includes("--resources");

if (dumpEnvPath !== undefined) {
  writeFileSync(
    dumpEnvPath,
    JSON.stringify({ server: serverName, pid: process.pid, ppid: process.ppid, envKeys: Object.keys(process.env).sort() }, null, 2),
  );
}

function send(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
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
          serverInfo: { name: serverName, version: "0.0.1-fixture" },
        },
      });
    if (initDelayMs > 0) setTimeout(respond, initDelayMs);
    else respond();
    return;
  }
  if (method === "ping" && isRequest) {
    send({ jsonrpc: "2.0", id, result: {} });
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
  if (method === "tools/list" && isRequest) {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: toolNames.map((name) => ({
          name,
          description: `fixture tool ${name}`,
          inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: true },
        })),
      },
    });
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
      // 非法行忽略（夹具面不需要错误协议）。
    }
  }
});
process.stdin.on("end", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

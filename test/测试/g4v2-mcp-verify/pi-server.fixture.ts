// test/测试/g4v2-mcp-verify/pi-server.fixture.ts —— G-4 V2 独立验证自建 Pi 夹具 server（非探针）。
//
// 独立构造的极小 stdio MCP server（newline-delimited JSON-RPC 2.0）：
//   node pi-server.fixture.ts --id=<serverId> [--state=<path>] [--calls=<path>] [--resources] [--fail-init]
// · 启动即把 {pid, ppid, envKeys} 写到 --state（用于 env 收窄/子进程存活断言；仅键名，无值）；
// · initialize（--fail-init 时回错误）/ tools/list（恰一件 echo 工具）/ tools/call（追加 `id\ttool\targ` 到
//   --calls）/ resources/list（--resources 时给一件资源）…… 其余回 -32601；stdin EOF 或 SIGTERM 退出。
// 无对产品的 import；不被 `test/**/*.test.ts` 匹配（不会被全局测试执行）。

import { appendFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const serverId = arg("id") ?? "fixture";
const statePath = arg("state");
const callsPath = arg("calls");
const withResources = argv.includes("--resources");
const failInit = argv.includes("--fail-init");

if (statePath !== undefined) {
  writeFileSync(statePath, JSON.stringify({ id: serverId, pid: process.pid, ppid: process.ppid, envKeys: Object.keys(process.env).sort() }));
}

const send = (message: Record<string, unknown>): void => { process.stdout.write(`${JSON.stringify(message)}\n`); };

function handle(message: Record<string, unknown>): void {
  const id = message["id"];
  const method = message["method"];
  const isRequest = id !== undefined && id !== null;
  if (method === "initialize" && isRequest) {
    if (failInit) { send({ jsonrpc: "2.0", id, error: { code: -32000, message: "fixture init refused" } }); return; }
    send({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: (message["params"] as Record<string, string> | undefined)?.["protocolVersion"] ?? "2025-11-25",
        capabilities: { tools: {}, ...(withResources ? { resources: {} } : {}) },
        serverInfo: { name: serverId, version: "0.0.1-fixture" },
      },
    });
    return;
  }
  if (method === "ping" && isRequest) { send({ jsonrpc: "2.0", id, result: {} }); return; }
  if (method === "tools/list" && isRequest) {
    send({ jsonrpc: "2.0", id, result: { tools: [{ name: "echo", description: `fixture echo of ${serverId}`, inputSchema: { type: "object", properties: { text: { type: "string" } } } }] } });
    return;
  }
  if (method === "tools/call" && isRequest) {
    const params = (message["params"] ?? {}) as Record<string, unknown>;
    const args = (params["arguments"] ?? {}) as Record<string, unknown>;
    if (callsPath !== undefined) appendFileSync(callsPath, `${serverId}\t${String(params["name"])}\t${JSON.stringify(args)}\n`);
    send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `${serverId}:MCP-MARKER:${JSON.stringify(args)}` }] } });
    return;
  }
  if (method === "resources/list" && isRequest) {
    send({ jsonrpc: "2.0", id, result: { resources: withResources ? [{ uri: `fixture://${serverId}/r`, name: "fixture-resource", mimeType: "text/plain" }] : [] } });
    return;
  }
  if (method === "resources/templates/list" && isRequest) { send({ jsonrpc: "2.0", id, result: { resourceTemplates: [] } }); return; }
  if (method === "resources/read" && isRequest) {
    send({ jsonrpc: "2.0", id, result: { contents: [{ uri: `fixture://${serverId}/r`, mimeType: "text/plain", text: "RESOURCE-CONTENT" }] } });
    return;
  }
  if (isRequest) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `fixture: method not found ${String(method)}` } });
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  for (;;) {
    const nl = buffer.indexOf("\n");
    if (nl < 0) break;
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line === "") continue;
    try { handle(JSON.parse(line) as Record<string, unknown>); } catch { /* 坏行忽略（夹具宽容） */ }
  }
});
process.stdin.on("end", () => process.exit(0));

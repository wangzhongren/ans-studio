// Scratch stdio MCP server for the V2 MCP P0 probe ONLY (fixture; never a product path).
// Spawned by the bundled CLI as `node mcp-fake-stdio-server.probe.ts`. Configured via the
// McpStdioServerConfig env map:
//   FAKE_MCP_RECORD_DIR  directory receiving spawn.json / events.jsonl (ENV KEY NAMES ONLY, never values)
//   FAKE_MCP_DELAY_MS    delay before answering `initialize` (default 0)
//   FAKE_MCP_MODE        "ok" | "hang" ("hang" never answers initialize)
// Minimal MCP over stdio: newline-delimited JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`,
// `ping`, `notifications/initialized`).
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const recordDir = process.env.FAKE_MCP_RECORD_DIR ?? "";
const delayMs = Number(process.env.FAKE_MCP_DELAY_MS ?? "0");
const mode = process.env.FAKE_MCP_MODE ?? "ok";
const started = Date.now();
const record = (event: Record<string, unknown>): void => {
  if (recordDir === "") return;
  try { appendFileSync(join(recordDir, "events.jsonl"), `${JSON.stringify({ t: Date.now() - started, ...event })}\n`); } catch { /* fixture record only */ }
};
if (recordDir !== "") {
  mkdirSync(recordDir, { recursive: true });
  writeFileSync(join(recordDir, "spawn.json"), `${JSON.stringify({
    argv: process.argv.slice(1), cwd: process.cwd(), pid: process.pid, ppid: process.ppid,
    envKeys: Object.keys(process.env).sort(), startedAt: started,
  }, null, 2)}\n`);
}
record({ event: "process-start" });

const send = (message: unknown): void => { process.stdout.write(`${JSON.stringify(message)}\n`); };
const rl = createInterface({ input: process.stdin });
rl.on("close", () => { record({ event: "stdin-closed" }); process.exit(0); });
rl.on("line", (line) => {
  if (line.trim() === "") return;
  let message: Record<string, unknown>;
  try { message = JSON.parse(line) as Record<string, unknown>; } catch { return; }
  const method = typeof message.method === "string" ? message.method : "";
  const id = message.id;
  record({ event: "message", method, hasId: id !== undefined });
  if (method === "initialize") {
    const params = (message.params ?? {}) as { protocolVersion?: string };
    if (mode === "hang") return; // never answer: the connection stays pending
    const answer = (): void => {
      record({ event: "initialize-answered" });
      send({ jsonrpc: "2.0", id, result: {
        protocolVersion: params.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fake-probe-server", version: "0.0.1" },
      } });
    };
    if (delayMs > 0) setTimeout(answer, delayMs); else answer();
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "ping") { send({ jsonrpc: "2.0", id, result: {} }); return; }
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: [{
      name: "echo", description: "fixture echo", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    }] } });
    return;
  }
  if (method === "tools/call") {
    const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const args = params.arguments ?? {};
    record({ event: "tools-call-received", name: params.name, argumentKeys: Object.keys(args) });
    send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `fake-echo:${String(args.text ?? "")}` }] } });
    return;
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
});

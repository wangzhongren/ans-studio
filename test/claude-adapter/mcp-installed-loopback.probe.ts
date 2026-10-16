// G-4 V2 P1 standing loopback probe (supersedes the P0 discovery probe for regression duty): real
// bundled CLI, HTTP restricted to 127.0.0.1, fake credentials, local stdio fake MCP server installed
// through the production path (`docs/mcp/<name>.md` → listInstalledMcpServers → installedMcpServers →
// mcpServers assembly) — no hook/canUseTool wrappers. Proves: env-scrubbing launcher chain, production
// allow branch executing a foreign tool, start/result pairing rows, honest status rows, hang release.
// No real gateway requests. Run separately: node test/claude-adapter/mcp-installed-loopback.probe.ts.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as SDK from "@anthropic-ai/claude-agent-sdk";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { SessionEvent, ToolEventDetailV1 } from "../../src/model/runtime.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";

const FAKE_KEY = "sk-ant-api03-loopback-FAKE-NOT-A-CREDENTIAL";
const REF_VALUE = "probe-ref-secret-value";
const fakeServerPath = fileURLToPath(new URL("./mcp-fake-stdio-server.probe.ts", import.meta.url));
const launcherPath = fileURLToPath(new URL("../../src/common/claude-adapter/mcp-launcher.mjs", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "ans-claude-mcp-installed-"));
const role: ResolvedRole = { id: "mcp-probe", kind: "project", cardText: "# Installed MCP loopback fixture", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
const credentialKeysNeverToChild = ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_SESSION_ID", "CLAUDE_PROJECT_DIR", "ANS_MCP_LAUNCHER_PASSTHROUGH", "ELECTRON_RUN_AS_NODE"];

type PhaseConfig = { name: string; declaration: { name: string; command: string; args?: string[]; env?: Record<string, string> }; gateway: "text" | "tool-once"; timeoutMs?: number };
const phases: PhaseConfig[] = [
  { name: "installed-execute", declaration: { name: "probe", command: process.execPath, args: [fakeServerPath], env: { FAKE_MCP_RECORD_DIR: "@record", FAKE_MCP_DELAY_MS: "0", FAKE_MCP_MODE: "ok", FAKE_MCP_ECHO_REF: "env:PROBE_REF_VALUE" } }, gateway: "tool-once" },
  { name: "installed-broken", declaration: { name: "brokenprobe", command: "/nonexistent/ans-probe-missing-binary" }, gateway: "text" },
  { name: "installed-hang", declaration: { name: "hangprobe", command: process.execPath, args: [fakeServerPath], env: { FAKE_MCP_RECORD_DIR: "@record", FAKE_MCP_DELAY_MS: "0", FAKE_MCP_MODE: "hang" } }, gateway: "text", timeoutMs: 90000 },
];

let phase = "boot";
let endpoint = "";
let gatewayMode: "text" | "tool-once" = "text";
let gatewayIndex = 0;
let gatewayFailure: unknown;
const requests: Array<{ phase: string; index: number; arrivedAt: number; promptPushedAt: number; toolNames: string[]; toolResults: Array<{ isError?: boolean; textHead: string }> }> = [];
const catalogs: Array<{ phase: string; servers: unknown[] }> = [];
const cleanupNotes: string[] = [];
const limit = setTimeout(() => { gatewayFailure = new Error("installed MCP loopback probe exceeded 150s"); server.closeAllConnections(); server.close(); }, 150000);
const sse = (res: import("node:http").ServerResponse, name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.socket.remoteAddress, "127.0.0.1");
    assert.equal(req.headers["x-api-key"], FAKE_KEY);
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (req.url?.includes("count_tokens")) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ input_tokens: 100 })); return; }
    if (!req.url?.startsWith("/v1/messages")) { res.writeHead(404); res.end(); return; }
    const tools = Array.isArray(body.tools) ? body.tools as Array<Record<string, unknown>> : [];
    const messages = Array.isArray(body.messages) ? body.messages as Array<Record<string, unknown>> : [];
    const toolResults: Array<{ isError?: boolean; textHead: string }> = [];
    for (const message of messages) {
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content as Array<Record<string, unknown>>) {
        if (block.type !== "tool_result") continue;
        const content = block.content;
        const resultText = typeof content === "string" ? content
          : Array.isArray(content) ? (content as Array<Record<string, unknown>>).filter((item) => item.type === "text").map((item) => String(item.text)).join("\n") : "";
        toolResults.push({ isError: block.is_error === true, textHead: resultText.slice(0, 120) });
      }
    }
    const index = gatewayIndex++;
    requests.push({ phase, index, arrivedAt: Date.now(), promptPushedAt, toolNames: tools.map((tool) => String(tool.name)), toolResults });
    const id = `msg_installed_loopback_${requests.length}`;
    const model = String(body.model ?? "claude-sonnet-4-6");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    sse(res, "message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    let stopReason = "end_turn";
    const installedTool = tools.map((tool) => String(tool.name)).find((name) => name.startsWith("mcp__probe__"));
    if (gatewayMode === "tool-once" && index === 0 && installedTool !== undefined) {
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_installed_loopback", name: installedTool, input: {} } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ text: "probe-input" }) } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
      stopReason = "tool_use";
    } else {
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `${phase} loopback completed` } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    }
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 10 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  } catch (error) { gatewayFailure = error; res.writeHead(500); res.end("loopback fixture error"); }
});

let promptPushedAt = 0;
const readRecords = async (recordDir: string): Promise<{ spawn?: { argv: string[]; cwd: string; pid: number; ppid: number; envKeys: string[]; startedAt: number }; events: Array<Record<string, unknown>> }> => {
  try {
    const spawn = JSON.parse(await readFile(join(recordDir, "spawn.json"), "utf8")) as { argv: string[]; cwd: string; pid: number; ppid: number; envKeys: string[]; startedAt: number };
    const events = (await readFile(join(recordDir, "events.jsonl"), "utf8")).trim().split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as Record<string, unknown>);
    return { spawn, events };
  } catch { return { events: [] }; } // broken/hang fixtures may never spawn (or spawn without records yet)
};

const writeDeclaration = async (projectRoot: string, declaration: PhaseConfig["declaration"], recordDir: string): Promise<void> => {
  const env = Object.fromEntries(Object.entries(declaration.env ?? {}).map(([name, value]) => [name, value === "@record" ? recordDir : value]));
  const lines = [
    `# MCP 声明：${declaration.name}`,
    "- 用途：P1 loopback 夹具",
    `- 启动：${declaration.command}`,
    `- 参数：${(declaration.args ?? []).join(" ｜ ")}`,
    ...(Object.keys(env).length > 0 ? [`- 环境：${Object.entries(env).map(([name, value]) => `${name}=${value}`).join("；")}`] : []),
    "- 适用角色：mcp-probe",
    "- 状态：installed",
    "- 安装日期：2026-10-16",
    "",
  ];
  await mkdir(join(projectRoot, "docs", "mcp"), { recursive: true });
  await writeFile(join(projectRoot, "docs", "mcp", `${declaration.name}.md`), lines.join("\n"));
};

const runPhase = async (config: PhaseConfig) => {
  phase = config.name;
  gatewayMode = config.gateway;
  gatewayIndex = 0;
  const projectRoot = join(root, config.name);
  const recordDir = join(projectRoot, "record");
  await writeDeclaration(projectRoot, config.declaration, recordDir);
  const actualQueries: SDK.Query[] = [];
  const service = createRuntimeAdapter({ runtime: "claude", projectRoot, skillRoot: projectRoot,
    gate: () => ({ allowed: false, reason: "probe has no write effects", allowedByRoot: { project: [], skill: [] } }),
    modelId: "claude-sonnet-4-6", baseUrl: endpoint, constructTimeoutMs: 15000, promptTimeoutMs: config.timeoutMs ?? 25000,
    providerFactories: { claude: (input) => {
      assert.equal(input.toolDisplayMode, "required-v1");
      assert.equal(input.installedMcpServers?.length, 1);
      assert.equal(input.installedMcpServers![0]!.name, config.declaration.name);
      return createClaudeRuntimeAdapter({ ...input,
        tools: [{ name: "probe_tool", description: "Loopback fixture only", inputSchema: { type: "object", properties: {} }, handler: async () => ({ ok: true, message: "probe handler reached" }) }],
      }, { env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: FAKE_KEY, PROBE_REF_VALUE: REF_VALUE }, loadSdk: async () => ({ createSdkMcpServer: SDK.createSdkMcpServer, query: (params) => {
        const raw = params.options!;
        // Only wrapper: dev flags to keep the CLI quiet (no hooks/canUseTool/mcpServers touching).
        const actual = SDK.query({ prompt: params.prompt, options: { ...raw,
          env: { ...raw.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", DISABLE_AUTOUPDATER: "1" },
        } });
        actualQueries.push(actual);
        const observed = (async function* () { for await (const message of actual) {
          if (message.type === "system" && message.subtype === "init") catalogs.push({ phase: config.name, servers: message.mcp_servers.map((entry) => ({ ...entry })) });
          yield message;
        } })();
        return Object.assign(observed, { close: () => actual.close(), interrupt: () => actual.interrupt(), mcpServerStatus: () => actual.mcpServerStatus() }) as unknown as SDK.Query;
      } }) });
    } },
  });
  const session = await service.bindRole(role);
  const rows: SessionEvent[] = [];
  const reading = (async () => { for await (const row of session.events()) { rows.push(row); if (rows.filter((event) => event.kind === "settled").length === 1) break; } })();
  try {
    promptPushedAt = Date.now();
    await session.prompt(`${config.name} turn`);
    if (gatewayFailure) throw gatewayFailure;
    await reading;
    const statuses: unknown[] = [];
    const query = actualQueries.at(-1)!;
    for (let attempt = 0; attempt < 8; attempt++) {
      const snapshot = await query.mcpServerStatus();
      statuses.push(snapshot);
      if (snapshot.every((entry) => entry.status !== "pending")) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const records = await readRecords(recordDir);
    const toolDetail = (row: SessionEvent) => row.detail as ToolEventDetailV1;
    return {
      name: config.name,
      spawn: records.spawn, events: records.events,
      requests: requests.filter((record) => record.phase === config.name),
      statuses,
      rows: rows.map((row) => ({ kind: row.kind, phase: toolDetail(row)?.phase, toolName: toolDetail(row)?.toolName, summary: row.summary })),
      settled: (rows.filter((row) => row.kind === "settled").at(-1)!.detail as { outcome: string }).outcome,
    };
  } finally {
    try { await session.dispose(); } catch (error) {
      if (error instanceof Error && /ENOTEMPTY|ENOENT/.test(error.message)) cleanupNotes.push(`${config.name}: ${error.message}`);
      else throw error;
    }
  }
};

try {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  endpoint = `http://127.0.0.1:${address.port}`;

  const reports: Awaited<ReturnType<typeof runPhase>>[] = [];
  for (const config of phases) reports.push(await runPhase(config));
  if (gatewayFailure) throw gatewayFailure;
  if (process.env.PROBE_DEBUG === "1") console.error(JSON.stringify(reports, null, 2));
  const byName = (name: string) => reports.find((report) => report.name === name)!;
  const toolRows = (report: typeof reports[number], kind: string) => report.rows.filter((row) => row.kind === kind && row.toolName?.startsWith("mcp__probe__"));

  // Phase 1 — env scrubbing + production allow + execute + paired rows.
  const executed = byName("installed-execute");
  assert.ok(executed.spawn);
  for (const forbidden of credentialKeysNeverToChild) assert.equal(executed.spawn.envKeys.includes(forbidden), false, `leaked to child: ${forbidden}`);
  for (const required of ["PATH", "HOME", "FAKE_MCP_RECORD_DIR", "FAKE_MCP_DELAY_MS", "FAKE_MCP_MODE", "FAKE_MCP_ECHO_REF"]) assert.equal(executed.spawn.envKeys.includes(required), true, `missing in child: ${required}`);
  const call = executed.events.find((event) => event.event === "tools-call-received");
  assert.ok(call, "fake server must receive the tool call through the launcher");
  assert.deepEqual(call.argumentKeys, ["text"]); // no __ans_call_context ever reaches the foreign server
  assert.equal(executed.requests.at(-1)!.toolResults[0]!.isError, false);
  assert.match(executed.requests.at(-1)!.toolResults[0]!.textHead, /fake-echo:probe-input/);
  const starts = toolRows(executed, "tool_call");
  const results = toolRows(executed, "accepted");
  assert.equal(starts.length, 1);
  assert.equal(results.length, 1);
  assert.equal(starts[0]!.phase, "start");
  assert.equal(results[0]!.phase, "result");
  assert.equal(executed.rows.filter((row) => row.kind === "denied").length, 0);
  assert.equal(executed.settled, "completed");

  // Phase 2 — broken command: honest category row, session and turn unaffected. (The launcher fails
  // to spawn the real command; the CLI transport then reports "Connection closed" — the deeper ENOENT
  // detail stays in the launcher's stderr/CLI logs, so the row carries the transport category.)
  const broken = byName("installed-broken");
  assert.equal(broken.spawn, undefined);
  const brokenRows = broken.rows.filter((row) => row.kind === "message" && row.summary?.startsWith("已安装 MCP「brokenprobe」未连接："));
  assert.equal(brokenRows.length, 1);
  assert.ok((brokenRows[0]!.summary ?? "").length < 120, "category row stays bounded");
  assert.equal(broken.rows.some((row) => row.summary?.includes("no such file") || row.summary?.includes("/nonexistent")), false);
  assert.equal(broken.settled, "completed");

  // Phase 3 — hanging initialize: bounded release, tool absent, turn completes, status failed.
  const hang = byName("installed-hang");
  const hangRelease = hang.requests[0]!.arrivedAt - hang.spawn!.startedAt;
  assert.ok(hangRelease > 20000 && hangRelease < 45000, `hang release window: ${hangRelease}ms`);
  assert.equal(hang.requests[0]!.toolNames.some((name) => name.startsWith("mcp__hangprobe")), false);
  assert.equal(hang.settled, "completed");

  const report = { fixture: { node: process.version, sdk: "0.3.299", bundledCli: "2.1.299", loopbackOnly: true, externalApiCalls: 0, credentials: "fake-only" }, launcherPath, reports, catalogs, cleanupNotes };
  assert.equal(JSON.stringify(report).includes(FAKE_KEY), false);
  assert.equal(JSON.stringify(report).includes(REF_VALUE), false); // reference values never land in evidence
  console.log(JSON.stringify(report, null, 2));
} finally {
  clearTimeout(limit);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}

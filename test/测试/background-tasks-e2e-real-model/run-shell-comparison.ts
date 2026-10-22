// 测试角色：`run_shell` 前台阻塞对照（2026-10-22 后台任务 E2E 可选补充）。
//
// 同一真实链路（openRoleSession → Service → Pi 引擎 → 真实网关），注入 3 秒命令级执行时限，
// 由真实模型调用 `run_shell` 执行同一 `node server.js`：预期工具要等到进程被超时终止才返回，
// 服务器无法在回合后继续存活——与 `start_background_task` 的 7ms 返回形成对照。
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { defaultShellRules } from "../../../src/common/门禁引擎/classify-shell.ts";
import { createMemoryAuditSink } from "../../../src/common/编排/shell-audit.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";

const TURN_TIMEOUT_MS = 90_000;
const SERVER_JS = String.raw`
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const server = http.createServer((req, res) => { res.statusCode = 200; res.end("ans-e2e-ok"); });
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  fs.writeFileSync(path.join(__dirname, "server.state.json"), JSON.stringify({ pid: process.pid, port: address.port, startedAt: Date.now() }));
  console.log("ANS_E2E_LISTENING http://127.0.0.1:" + address.port + " PID=" + process.pid);
});
process.on("SIGTERM", () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1000).unref(); });
setInterval(() => {}, 1000);
`;

function makeProject(): { root: string; project: ProjectConfig; statePath: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-e2e-runshell-"));
  const dir = path.join(root, "角色卡", "dev");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 dev\n\n测试项目开发工程师。\n");
  fs.writeFileSync(path.join(dir, "boundary.yaml"), ["role: dev", "entries:", "  - kind: file", "    path: server.js", "    purpose: 开发服务器", ""].join("\n"));
  fs.writeFileSync(path.join(root, "server.js"), SERVER_JS);
  return {
    root,
    statePath: path.join(root, "server.state.json"),
    project: {
      projectRoot: root,
      skillRoot: root,
      roles: { dev: { card: "角色卡/dev/role-card.md", boundary: "角色卡/dev/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: { path: "角色卡/dev/boundary.yaml", acceptance: { accepted: true, source: "test:e2e-runshell" } },
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function httpProbe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", () => resolve(false));
  });
}

function waitUntil(predicate: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = async (): Promise<void> => {
      if (await predicate()) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(() => void poll(), 100);
    };
    void poll();
  });
}

interface ToolFact { toolName: string; phase: string; ok?: boolean; durationMs?: number; resultText?: string }

function toolFacts(events: readonly OrchestrationEvent[]): ToolFact[] {
  const facts: ToolFact[] = [];
  for (const event of events) {
    // handback 事件（编排层追加、无工具 detail）不参与工具事实提取。
    if (event.kind === "handback") continue;
    const detail = event.detail as { toolName?: unknown; phase?: unknown; ok?: unknown; display?: { durationMs?: unknown; resultText?: { text?: unknown } } } | undefined;
    if (detail === undefined || typeof detail.toolName !== "string") continue;
    facts.push({
      toolName: detail.toolName,
      phase: typeof detail.phase === "string" ? detail.phase : "result",
      ...(typeof detail.ok === "boolean" ? { ok: detail.ok } : {}),
      ...(typeof detail.display?.durationMs === "number" ? { durationMs: detail.display.durationMs } : {}),
      ...(typeof detail.display?.resultText?.text === "string" ? { resultText: detail.display.resultText.text } : {}),
    });
  }
  return facts;
}

async function main(): Promise<void> {
  const temp = makeProject();
  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  const events: OrchestrationEvent[] = [];
  try {
    handle = await openRoleSession(
      {
        roleId: "dev",
        runtime: "pi",
        project: temp.project,
        persistSession: false,
        shellReadonly: {
          classifyShell: () => "allow",
          rules: defaultShellRules(),
          auditSink: createMemoryAuditSink(),
          timeoutMs: 30_000,
        },
      },
      { runtimeOptions: { persistSession: false, shellExecTimeoutMs: 3_000, turnLastResortMs: TURN_TIMEOUT_MS } },
    );

    const iterator = handle.events()[Symbol.asyncIterator]();
    let markSettled: (() => void) | undefined;
    const settled = new Promise<void>((resolve) => { markSettled = resolve; });
    const pump = (async () => {
      for (;;) {
        const next = await iterator.next();
        if (next.done === true) return;
        events.push(next.value);
        if (next.value.kind === "settled") { markSettled?.(); return; }
      }
    })();

    const began = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), TURN_TIMEOUT_MS); });
    const outcome = await Promise.race([
      handle.send(
        [
          "请只做一件事：使用 run_shell 工具执行命令 `node server.js`（run_shell 的 command 参数为：node server.js）。",
          "不要使用 start_background_task。这个程序是一个长期运行的开发服务器。",
          "请如实报告 run_shell 最终返回的文本，以及它大约阻塞了多久。",
        ].join("\n"),
      ).then(() => "sent" as const, (error) => `failed: ${error instanceof Error ? error.message : String(error)}` as const),
      timeout,
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (outcome === "timeout") await handle.abort?.();
    await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 3_000))]);
    void iterator.return?.();
    await pump.catch(() => {});
    const elapsedMs = Date.now() - began;

    const facts = toolFacts(events);
    const runShell = facts.filter((fact) => fact.toolName === "run_shell" && fact.phase === "result");
    const background = facts.filter((fact) => fact.toolName === "start_background_task");
    const state = (() => {
      try {
        const parsed = JSON.parse(fs.readFileSync(temp.statePath, "utf8")) as { pid: number; port: number };
        return typeof parsed.pid === "number" && typeof parsed.port === "number" ? parsed : undefined;
      } catch { return undefined; }
    })();
    const alive = state !== undefined && isAlive(state.pid);
    const portOpen = state === undefined ? false : await httpProbe(state.port);
    const messages = events.filter((event) => event.kind === "message").map((event) => event.summary);

    const summary = {
      outcome,
      elapsedMs,
      runShellFacts: runShell,
      backgroundToolCalled: background.length > 0,
      serverState: state,
      serverAliveAfterTurn: alive,
      portOpenAfterTurn: portOpen,
      messages,
    };
    console.log("=== RUN_SHELL_COMPARISON_BEGIN ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("=== RUN_SHELL_COMPARISON_END ===");
    const pass = outcome === "sent" && runShell.length > 0 && !background.some((fact) => fact.phase === "start");
    if (!pass) process.exitCode = 2;
  } finally {
    try { await handle?.dispose(); } catch { /* 如实保留主结论 */ }
    temp.cleanup();
  }
}

main().catch((error) => {
  console.error("COMPARISON_FATAL:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 2;
});

// G-4 V2 P1（Claude 适配器）交付面：外来 MCP server 的 **env 收窄启动器**。
//
// 背景：P0 探针实证（docs/fix/2026-10-16_probe_mcp-surface.md §三-①）——CLI 对 options.mcpServers
// 注入的 stdio server **全量继承 CLI env**（含 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL /
// CLAUDE_CONFIG_DIR / 宿主 messaging token），MCP SDK 的 getDefaultEnvironment 收窄并未发生。
// 收窄方案＝命令包装器：适配器注入的 `command` 恒为本启动器（`process.execPath`），由它以**白名单
// env** 重 spawn 声明的真命令；CLI 交给第三方 server 的进程因此只看到收窄后的环境。
//
// 协议（与 src/provider/claude/session.ts 装配侧成对，改动需两处同改）：
// · argv：`<real-command> [args…]`（真命令与参数经 argv 传递，argv 无秘密——沿声明面「值不入 argv」纪律）。
// · env：`ANS_MCP_LAUNCHER_PASSTHROUGH`＝JSON 数组，列真命令应继承的变量名（＝声明的 env 键；
//   值已经在启动器自己的 env 里由 CLI 合入，这里只按名转发）。该变量本身**永不转发**。
// · 基线变量（PATH/HOME/…）按名透传——真命令要能找到自己的运行时；其余一律不传。
// · stdio 三通道**逐字继承**（MCP stdio JSON-RPC 直通，启动器自身绝不写 stdout）。
// · 信号：SIGINT/SIGTERM/SIGHUP 转发给真命令；真命令退出后启动器以其退出码/信号退出
//   （信号路径先摘除自装 handler 再自击，避免 handler 吞掉默认终止）。
// · ELECTRON_RUN_AS_NODE：打包应用里 `process.execPath` 是 Electron 二进制，宿主把它放在**启动器
//   自己的 env**上让本文件以 Node 语义运行；它不在透传名单，绝不进真命令。
import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (command === undefined || command === "") {
  process.stderr.write("ans mcp launcher: missing command\n");
  process.exit(127);
}
const BASE_ENV_NAMES = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR", "LANG", "LC_ALL", "SHELL", "USER", "LOGNAME", "TERM"];
let passthrough = [];
try {
  const parsed = JSON.parse(process.env.ANS_MCP_LAUNCHER_PASSTHROUGH ?? "[]");
  if (Array.isArray(parsed)) passthrough = parsed.filter((name) => typeof name === "string");
} catch { /* 名单损坏：只保留基线变量（宁窄勿宽） */ }
const childEnv = {};
for (const name of [...BASE_ENV_NAMES, ...passthrough]) {
  const value = process.env[name];
  if (value !== undefined) childEnv[name] = value;
}
const child = spawn(command, args, { env: childEnv, stdio: ["inherit", "inherit", "inherit"] });
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
const forward = {};
for (const signal of SIGNALS) {
  forward[signal] = () => { try { child.kill(signal); } catch { /* 真命令已退出 */ } };
  process.on(signal, forward[signal]);
}
child.on("error", (error) => {
  process.stderr.write(`ans mcp launcher: failed to start command: ${error.code ?? "spawn-error"}\n`);
  process.exit(127);
});
child.on("exit", (code, signal) => {
  if (signal === null) { process.exit(code ?? 0); return; }
  for (const name of SIGNALS) process.removeListener(name, forward[name]);
  process.kill(process.pid, signal); // 自击同一信号：父进程看到与真命令一致的死因
});

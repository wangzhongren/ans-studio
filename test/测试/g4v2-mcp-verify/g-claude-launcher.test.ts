// test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts —— G1 域：Claude env 收窄启动器（真实子进程）。
//
// 独立构造：不 import 产品测试，直接以真实 `node src/common/claude-adapter/mcp-launcher.mjs …` 起进程，
// 让夹具子进程**上报自己的 env 键值**——实证「恰为基线键＋声明名单键」；哨兵绝不泄漏；
// PASSTHROUGH 名单损坏宁窄；ELECTRON_RUN_AS_NODE 永不转发；退出码/信号路径。

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAUNCHER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src", "common", "claude-adapter", "mcp-launcher.mjs");
const BASE_ENV_NAMES = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR", "LANG", "LC_ALL", "SHELL", "USER", "LOGNAME", "TERM"];
/** macOS 平台级注入（env -i 亦见；P0 探针已单核）——收窄断言以此为唯一允许例外。 */
const PLATFORM_INJECTED = new Set(["__CF_USER_TEXT_ENCODING"]);

interface Run {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function runLauncher(argv: string[], env: Record<string, string>, options?: { killAfterMs?: number; waitForFile?: string }): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LAUNCHER, ...argv], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    let timer: NodeJS.Timeout | undefined;
    if (options?.killAfterMs !== undefined) {
      timer = setTimeout(() => {
        if (options.waitForFile !== undefined) {
          const deadline = Date.now() + 5000;
          const poll = (): void => {
            if (fs.existsSync(options.waitForFile!) || Date.now() > deadline) {
              child.kill("SIGTERM");
            } else setTimeout(poll, 25);
          };
          poll();
        } else child.kill("SIGTERM");
      }, options.killAfterMs);
    }
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

/** 夹具子进程脚本：把自己 env 的键＋指定变量值打印为 JSON 一行。 */
const REPORT_SCRIPT = "console.log(JSON.stringify({keys:Object.keys(process.env).sort(),tok:process.env.TOK??null,lit:process.env.LIT??null,second:process.env.SECOND??null,sentinelApi:process.env.ANTHROPIC_API_KEY??null,sentinelAws:process.env.AWS_SECRET_ACCESS_KEY??null,electron:process.env.ELECTRON_RUN_AS_NODE??null,passthrough:process.env.ANS_MCP_LAUNCHER_PASSTHROUGH??null}))";

test("G1a 收窄洽等：子进程 env 键＝基线键（在场者）∪ 声明名单键；哨兵/PASSTHROUGH/ELECTRON 绝不转发", async () => {
  const launcherEnv: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: "en_US.UTF-8",
    USER: "probe",
    LOGNAME: "probe",
    SHELL: "/bin/zsh",
    TOK: "declared-token-value",
    LIT: "literal-marker",
    SECOND: "second-value",
    ANTHROPIC_API_KEY: "SENTINEL-API-SECRET",
    AWS_SECRET_ACCESS_KEY: "SENTINEL-AWS-SECRET",
    ELECTRON_RUN_AS_NODE: "1",
    NOT_DECLARED: "must-not-leak",
    ANS_MCP_LAUNCHER_PASSTHROUGH: JSON.stringify(["TOK", "LIT", "SECOND", "MISSING_NAME"]),
  };
  const run = await runLauncher([process.execPath, "-e", REPORT_SCRIPT], launcherEnv);
  assert.equal(run.code, 0, `launcher 应正常退出：stderr=${run.stderr}`);
  const report = JSON.parse(run.stdout.trim().split("\n").at(-1)!) as { keys: string[]; [k: string]: unknown };
  const expectedBase = BASE_ENV_NAMES.filter((name) => launcherEnv[name] !== undefined);
  const allowed = new Set([...expectedBase, ...["TOK", "LIT", "SECOND"]]);
  const unexpected = report.keys.filter((k) => !allowed.has(k) && !PLATFORM_INJECTED.has(k));
  assert.deepEqual(unexpected, [], `子进程不得出现名单外键：${JSON.stringify(report.keys)}`);
  assert.equal(report["tok"], "declared-token-value", "声明名单键值在场");
  assert.equal(report["lit"], "literal-marker");
  assert.equal(report["second"], "second-value");
  assert.equal(report["sentinelApi"], null, "网关凭据哨兵绝不泄漏");
  assert.equal(report["sentinelAws"], null, "其它哨兵绝不泄漏");
  assert.equal(report["electron"], null, "ELECTRON_RUN_AS_NODE 永不转发（真命令不受宿主 Electron 语义污染）");
  assert.equal(report["passthrough"], null, "ANS_MCP_LAUNCHER_PASSTHROUGH 自身永不转发");
  assert.equal(report.keys.includes("NOT_DECLARED"), false, "未列入名单的键不上车");
});

test("G1b 名单损坏宁窄：非法 JSON/非数组/混入非字符串 ⇒ 仅基线键（或仅合格项），哨兵仍不泄漏", async () => {
  const base = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", TOK: "declared-token-value", ANTHROPIC_API_KEY: "SENTINEL-API-SECRET" };
  // 非法 JSON
  const r1 = await runLauncher([process.execPath, "-e", REPORT_SCRIPT], { ...base, ANS_MCP_LAUNCHER_PASSTHROUGH: "not-json{{" });
  assert.equal(r1.code, 0);
  const p1 = JSON.parse(r1.stdout.trim().split("\n").at(-1)!) as { tok: unknown; sentinelApi: unknown };
  assert.equal(p1.tok, null, "名单损坏 ⇒ 声明键不转发（宁窄勿宽）");
  assert.equal(p1.sentinelApi, null);
  // JSON 非数组
  const r2 = await runLauncher([process.execPath, "-e", REPORT_SCRIPT], { ...base, ANS_MCP_LAUNCHER_PASSTHROUGH: JSON.stringify({ TOK: true }) });
  const p2 = JSON.parse(r2.stdout.trim().split("\n").at(-1)!) as { tok: unknown };
  assert.equal(p2.tok, null, "非数组 ⇒ 零转发");
  // 数组混入非字符串项：合格项照转，垃圾项忽略
  const r3 = await runLauncher([process.execPath, "-e", REPORT_SCRIPT], { ...base, ANS_MCP_LAUNCHER_PASSTHROUGH: JSON.stringify(["TOK", 5, null, {}]) });
  const p3 = JSON.parse(r3.stdout.trim().split("\n").at(-1)!) as { tok: unknown; sentinelApi: unknown };
  assert.equal(p3.tok, "declared-token-value", "合格字符串项照转");
  assert.equal(p3.sentinelApi, null);
});

test("G1c 退出码与错误路径：真命令退出码原样；缺命令/不可执行 ⇒ 127＋stderr 一行", async () => {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", ANS_MCP_LAUNCHER_PASSTHROUGH: "[]" };
  const seven = await runLauncher([process.execPath, "-e", "process.exit(7)"], env);
  assert.equal(seven.code, 7, "真命令退出码原样传递");
  const missing = await runLauncher([""], env);
  assert.equal(missing.code, 127, "缺命令 ⇒ 127");
  assert.ok(missing.stderr.includes("missing command"), `stderr 如实：${missing.stderr}`);
  const noExec = await runLauncher(["/definitely/not/a/binary-xyz"], env);
  assert.equal(noExec.code, 127, "不可执行命令（spawn error）⇒ 127");
  assert.ok(noExec.stderr.includes("failed to start command"), `stderr 如实：${noExec.stderr}`);
});

test("G1d 信号与性态：stdout 直通（JSON-RPC 通道）；SIGTERM 转发真命令并以其死因退出；真命令自然死因回传", async () => {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", ANS_MCP_LAUNCHER_PASSTHROUGH: "[]" };
  // stdout 直通
  const echo = await runLauncher([process.execPath, "-e", "process.stdout.write('PASSTHRU-MARKER\\n')"], env);
  assert.equal(echo.code, 0);
  assert.ok(echo.stdout.includes("PASSTHRU-MARKER"), "stdout 逐字直通");
  // 真命令自 SIGTERM：launcher 以同信号退出
  const selfKill = await runLauncher([process.execPath, "-e", "process.kill(process.pid,'SIGTERM')"], env);
  assert.equal(selfKill.code, null);
  assert.equal(selfKill.signal, "SIGTERM", "真命令死于 SIGTERM ⇒ 启动器同信号退出（父进程看到一致死因）");
  // 转发：先让真命令写 pid 文件，再 SIGTERM 启动器；真命令须随之死亡
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g4v2-launcher-"));
  try {
    const pidFile = path.join(dir, "pid.txt");
    const script = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>{},1000)`;
    const run = await runLauncher([process.execPath, "-e", script], env, { killAfterMs: 150, waitForFile: pidFile });
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.ok(Number.isFinite(pid) && pid > 0, "真命令 pid 已记录");
    const deadline = Date.now() + 5000;
    let alive = true;
    while (Date.now() < deadline) {
      try { process.kill(pid, 0); await new Promise((r) => setTimeout(r, 30)); } catch { alive = false; break; }
    }
    assert.equal(alive, false, "启动器收到 SIGTERM 后真命令退出（转发生效、无孤儿）");
    assert.equal(run.signal, "SIGTERM", "启动器自身同信号退出");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

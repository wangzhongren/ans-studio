// Env-scrubbing launcher boundary pins (G-4 V2 P1): the only process the CLI spawns is this file, so
// its scrub/exit semantics are the security-relevant contract — probe the real file directly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const launcher = fileURLToPath(new URL("../../src/common/claude-adapter/mcp-launcher.mjs", import.meta.url));
const runLauncher = (args: string[], env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> => new Promise((resolve) => {
  const child = spawn(process.execPath, [launcher, ...args], { env: { PATH: process.env.PATH, ...env } });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("exit", (code) => resolve({ code, stdout, stderr }));
});
const envKeys = (result: { stdout: string }) => result.stdout.split(",").filter((key) => key !== "");

test("env scrub: only base locators + declared passthrough names reach the real command", async () => {
  const result = await runLauncher([process.execPath, "-e", "process.stdout.write(Object.keys(process.env).sort().join(','))"], {
    ANS_MCP_LAUNCHER_PASSTHROUGH: '["PASS_ME"]', PASS_ME: "p1", ANTHROPIC_API_KEY: "fake-secret",
    ELECTRON_RUN_AS_NODE: "1", CLAUDE_CODE_MESSAGING_TOKEN: "fake-token", CLAUDE_CONFIG_DIR: "/fake/config",
  });
  assert.equal(result.code, 0);
  const keys = envKeys(result);
  assert.equal(keys.includes("PASS_ME"), true);
  assert.equal(keys.includes("PATH"), true);
  for (const forbidden of ["ANTHROPIC_API_KEY", "ELECTRON_RUN_AS_NODE", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CONFIG_DIR", "ANS_MCP_LAUNCHER_PASSTHROUGH"]) {
    assert.equal(keys.includes(forbidden), false, `must never reach the real command: ${forbidden}`);
  }
});

test("malformed passthrough lists widen nothing beyond the base set", async () => {
  const result = await runLauncher([process.execPath, "-e", "process.stdout.write(Object.keys(process.env).sort().join(','))"], {
    ANS_MCP_LAUNCHER_PASSTHROUGH: "{not json", PASS_ME: "p1",
  });
  assert.equal(result.code, 0);
  assert.equal(envKeys(result).includes("PASS_ME"), false);
});

test("exit codes propagate and a spawn failure exits 127 with a bounded stderr note", async () => {
  const exited = await runLauncher([process.execPath, "-e", "process.exit(7)"], { ANS_MCP_LAUNCHER_PASSTHROUGH: "[]" });
  assert.equal(exited.code, 7);
  const missing = await runLauncher(["/nonexistent/ans-launcher-smoke"], { ANS_MCP_LAUNCHER_PASSTHROUGH: "[]" });
  assert.equal(missing.code, 127);
  assert.match(missing.stderr, /^ans mcp launcher: failed to start command: ENOENT\n$/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_CREDENTIAL_ENV_VARS } from "../../src/common/shared/runtime-shared.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const loader = path.join(root, "test/测试/t1-loader.mjs");
export function isolatedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (RUNTIME_CREDENTIAL_ENV_VARS.includes(key) || /^(?:ANS_|ANTHROPIC_|CLAUDE_|CODEX_|OPENAI_)/.test(key)) delete env[key];
  return { ...env, ANTHROPIC_AUTH_TOKEN: "t1-fake-pi-key", ANTHROPIC_API_KEY: "t1-fake-claude-key", CODEX_API_KEY: "t1-fake-codex-key", ANS_PI_MODEL: "offline", ANS_CODEX_MODEL: "offline", ANS_CLAUDE_MODEL: "offline", ANS_PI_BASE_URL: "http://127.0.0.1:1", ANS_CODEX_BASE_URL: "http://127.0.0.1:1", ANTHROPIC_BASE_URL: "http://127.0.0.1:1", ANS_ENTRY_TIMEOUT_MS: "12000" };
}
for (const runtime of ["pi", "codex", "claude"] as const) for (const command of ["role", "govern"] as const) {
  test(`T1 actual bin ${command}/${runtime}: actual adapter and registered handler reject an out-of-boundary write`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ans-t1-cli-"));
    const trace = path.join(tmp, "trace.jsonl");
    const target = "src/t1-must-never-exist.ts";
    assert.equal(fs.existsSync(path.join(root, target)), false);
    try {
      const result = spawnSync(process.execPath, ["--import", loader, path.join(root, "bin/ans.js"), ...(command === "role" ? ["role", "run", "编排", "--task", "T1"] : ["govern", tmp, "--task", "T1"]), "--runtime", runtime], {
        cwd: root, encoding: "utf8", timeout: 15000,
        env: { ...isolatedEnv(), ANS_T1_TRACE: trace, ANS_T1_ACTIONS: JSON.stringify([{ name: "write_file", args: { path: target, content: "forbidden" } }]) },
      });
      assert.equal(result.signal, null, result.stderr);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const rows = fs.readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
      assert.ok(rows.some(row => row.kind === "bound" && row.runtime === runtime));
      const tool = rows.find(row => row.kind === "tool")!;
      assert.equal(tool.runtime, runtime);
      const receipt = tool.result as { success?: boolean; isError?: boolean; content?: unknown; contentItems?: unknown };
      assert.equal(runtime === "codex" ? receipt.success : !receipt.isError, false, JSON.stringify(receipt));
      assert.match(JSON.stringify(receipt), /拒|边界|writeSet|写集/);
      assert.equal(fs.existsSync(path.join(root, target)), false);
      assert.equal(fs.existsSync(path.join(tmp, target)), false);
      assert.doesNotMatch(result.stdout + result.stderr, /t1-fake-(?:pi|claude|codex)-key/);
      assert.doesNotMatch(result.stdout, /装配演示假 runtime/);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
}

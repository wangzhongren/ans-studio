import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { main, resolveProjectRoot } from "../../src/index.ts";
import { RUNTIME_KINDS, RUNTIME_CREDENTIAL_ENV_VARS } from "../../src/common/shared/runtime-shared.ts";
import { resolveRuntime } from "../../src/common/装配/runtime.ts";
import type { RuntimeKind, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, ToolResult } from "../../src/model/runtime.ts";

const root = resolveProjectRoot();
const bin = path.join(root, "bin/ans.js");

// Windows 原生 runner 在峰值负载下 Node 启动/模块解析可能显著慢于 mac：CI run 39391972925 中
// codex「missing SDK」用例等待 >10s 被 spawnSync 自身 timeout 杀掉（SIGTERM），同文件 mac arm64 2.7s、
// mac x64 3.9s 通过，首轮 Windows 同类用例未红。超时只作**有界上界**，断言（signal null / status 1 /
// 错误文案 / 密钥不泄漏）一律不放宽；真挂起仍按上界失败，不取消超时。
const SPAWN_TIMEOUT_MS = process.platform === "win32" ? 30_000 : 10_000;

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [...RUNTIME_CREDENTIAL_ENV_VARS, "ANS_RUNTIME", "ANS_PI_BASE_URL", "ANS_PI_MODEL", "ANS_CODEX_MODEL", "ANS_CODEX_BASE_URL", "ANS_CLAUDE_MODEL", "ANTHROPIC_BASE_URL"]) delete env[name];
  return env;
}

function fakeProvider() {
  const calls: RuntimeProviderOptions[] = [];
  const results: ToolResult[] = [];
  const factory: RuntimeProviderFactory = (options) => {
    calls.push(options);
    assert.ok(options.registerToolDisplayProfile, "actual Core supplies required-v1 profile registration");
    options.registerToolDisplayProfile({ credentials: [] });
    return {
      async composeContext() { return { systemPrompt: "assembly offline engine" }; },
      async bindRole(role) {
        const queue: SessionEvent[] = [];
        let wake: (() => void) | undefined;
        let closed = false;
        const controller = new AbortController();
        return {
          runtime: options.runtime, roleId: role.id, contextSource: "in-memory",
          async prompt() {
            assert.ok(options.currentTurnId(), "actual Service creates the active turn");
            const tool = options.tools.find((item) => item.name === "write_file");
            assert.ok(tool, "actual Service creates governed tools");
            for (const target of ["src/assembly-b1-outside.ts", "src/common/编排/assembly-b1-not-in-task.ts"]) {
              results.push(await tool.handler({ name: tool.name, args: { path: target, content: "must never be written" }, signal: controller.signal }));
            }
            queue.push({ kind: "message", summary: `offline factory:${options.runtime}` });
            queue.push({ kind: "settled", summary: "offline settled", detail: { outcome: "completed" } });
            wake?.(); wake = undefined;
          },
          async *events() {
            while (!closed || queue.length) {
              if (queue.length) { yield queue.shift()!; continue; }
              await new Promise<void>((resolve) => { wake = resolve; });
            }
          },
          async abort() { controller.abort(); },
          async dispose() { closed = true; controller.abort(); wake?.(); },
        };
      },
    };
  };
  return { calls, results, factory };
}

test("runtime resolution preserves each command default and explicit selection priority", () => {
  assert.deepEqual(resolveRuntime({ present: false, value: "" }, {}, "pi"), { ok: true, selection: { runtime: "pi", source: "default" } });
  assert.deepEqual(resolveRuntime({ present: false, value: "" }, { ANS_RUNTIME: "claude" }, "pi"), { ok: true, selection: { runtime: "claude", source: "env" } });
  assert.deepEqual(resolveRuntime({ present: true, value: "codex" }, { ANS_RUNTIME: "claude" }, "pi"), { ok: true, selection: { runtime: "codex", source: "argv" } });
});

for (const runtime of RUNTIME_KINDS) {
  test(`root flag and env reach ${runtime} through actual Interface/Pipeline/Service handlers in both commands`, async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ans-assembly-b1-"));
    const provider = fakeProvider();
    const runtimeOptions = { providerFactories: { [runtime]: provider.factory }, persistSession: false, modelId: "offline-model", baseUrl: "http://127.0.0.1:1", promptTimeoutMs: 1500, constructTimeoutMs: 1500 };
    try {
      for (const mode of ["flag", "env"] as const) {
        const env = { ANTHROPIC_AUTH_TOKEN: "assembly-fake-key", ...(mode === "env" ? { ANS_RUNTIME: runtime } : { ANS_RUNTIME: runtime === "codex" ? "claude" : "codex" }) };
        const flag = mode === "flag" ? ["--runtime", runtime] : [];
        assert.equal(await main(["role", "run", "编排", "--task", "B1", ...flag], env, { runtimeOptions }), 0);
        assert.equal(await main(["govern", dir, "--task", "B1", ...flag], env, { runtimeOptions }), 0);
      }
      assert.equal(provider.calls.length, 4, "all four invocations construct the selected external engine double");
      assert.ok(provider.calls.every((options) => options.runtime === runtime));
      assert.ok(provider.calls.every((options) => options.modelId === "offline-model" && options.baseUrl === "http://127.0.0.1:1"));
      assert.ok(provider.calls.every((options) => options.storage === undefined));
      assert.equal(provider.results.length, 8);
      assert.ok(provider.results.every((result) => result.ok === false), "real gate rejects boundary and task-scope violations");
      assert.ok(provider.results.every((result) => /拒|边界|本次任务|writeSet/.test(result.message)));
      for (let i = 0; i < provider.calls.length; i++) {
        const names = provider.calls[i].tools.map((tool) => tool.name);
        assert.equal(names.includes("request_confirmation"), i % 2 === 1, "govern receives confirmation capability only");
        assert.equal(names.includes("run_shell"), false, "CLI shell remains absent");
      }
      assert.equal(existsSync(path.join(dir, ".ans")), false);
      for (const project of [root, dir]) for (const target of ["src/assembly-b1-outside.ts", "src/common/编排/assembly-b1-not-in-task.ts"]) assert.equal(existsSync(path.join(project, target)), false, "denial causes zero filesystem effects");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("root command defaults reach demo and Pi respectively through actual Service injection", async () => {
  const provider = fakeProvider();
  const dir = mkdtempSync(path.join(os.tmpdir(), "ans-assembly-default-"));
  try {
    const options = { runtimeOptions: { providerFactories: { demo: provider.factory, pi: provider.factory }, persistSession: false } };
    assert.equal(await main(["role", "run", "编排", "--task", "B1"], {}, options), 0);
    assert.equal(await main(["govern", dir], {}, options), 0);
    assert.deepEqual(provider.calls.map((call) => call.runtime), ["demo", "pi"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("new accepted runtime role cards can be reached from root fallback without adding task writes", async () => {
  for (const role of ["运行时核心", "Codex适配器", "Claude适配器"]) assert.equal(await main(["role", "run", role, "--task", "B1", "--runtime", "demo"], {}), 0);
});

for (const runtime of ["pi", "codex", "claude"] as const) {
  test(`actual bin default ${runtime} Provider fails honestly for missing configuration in role and govern`, () => {
    const env = { ...cleanEnv(), ANTHROPIC_AUTH_TOKEN: "assembly-fake-key" };
    const expected = runtime === "pi" ? /缺少 base URL/ : runtime === "codex" ? /Codex requires ANS_CODEX_MODEL/ : /Claude 缺少 API key：ANTHROPIC_API_KEY/;
    for (const command of [["role", "run", "编排", "--task", "B1"], ["govern"]]) {
      for (const mode of ["flag", "env"]) {
        const run = spawnSync(process.execPath, [bin, ...command, ...(mode === "flag" ? ["--runtime", runtime] : [])], { cwd: root, env: { ...env, ...(mode === "env" ? { ANS_RUNTIME: runtime } : {}) }, encoding: "utf8", timeout: SPAWN_TIMEOUT_MS });
        assert.equal(run.signal, null);
        assert.equal(run.status, 1, run.stderr);
        assert.match(run.stderr, expected, "the actual selected Provider configuration path must be reached");
        assert.doesNotMatch(run.stdout, /装配演示假 runtime/);
        assert.doesNotMatch(run.stdout + run.stderr, /assembly-fake-key/);
      }
    }
  });
}

test("SDK loading is lazy for module import, help and doctor, including command help", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ans-assembly-lazy-"));
  const hooks = path.join(dir, "deny-sdk.mjs");
  writeFileSync(hooks, `import { registerHooks } from 'node:module';\nregisterHooks({resolve(s,c,n){if(/^(?:@openai\\/codex|@anthropic-ai\\/(?:claude-agent-sdk|sdk)|@earendil-works\\/pi-|@modelcontextprotocol\\/sdk|zod(?:\\/|$))/.test(s))throw new Error('SDK loaded eagerly:'+s);return n(s,c);}});\n`);
  try {
    const imported = spawnSync(process.execPath, ["--import", pathToFileURL(hooks).href, "--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(path.join(root, "src/index.ts")).href)});`], { cwd: root, env: cleanEnv(), encoding: "utf8", timeout: SPAWN_TIMEOUT_MS });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, "", "import has no startup effects");
    for (const runtime of RUNTIME_KINDS) for (const args of [["help"], ["doctor"], ["role", "run", "--help"]]) {
      const run = spawnSync(process.execPath, ["--import", pathToFileURL(hooks).href, bin, ...args, "--runtime", runtime], { cwd: root, env: cleanEnv(), encoding: "utf8", timeout: SPAWN_TIMEOUT_MS });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.signal, null);
      assert.doesNotMatch(run.stderr, /SDK loaded eagerly/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("root source depends only on Interface entry, Model and support modules", () => {
  const source = readFileSync(path.join(root, "src/index.ts"), "utf8");
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()\s*["']\.\/(?:pipeline|service|provider)\//);
});

test("actual bin missing SDK errors are honest and masked without starting model requests", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ans-assembly-missing-sdk-"));
  const hooks = path.join(dir, "deny-sdk.mjs");
  writeFileSync(hooks, `import { registerHooks } from 'node:module';\nregisterHooks({resolve(s,c,n){if(/^(?:@modelcontextprotocol\\/sdk|@anthropic-ai\\/claude-agent-sdk|@earendil-works\\/pi-coding-agent)/.test(s))throw new Error('assembly simulated missing SDK');return n(s,c);}});\n`);
  const fakeKey = "assembly-missing-sdk-fake-key";
  const env = { ...cleanEnv(), ANTHROPIC_AUTH_TOKEN: fakeKey, CODEX_API_KEY: fakeKey, ANTHROPIC_API_KEY: fakeKey, ANS_PI_MODEL: "offline", ANS_CODEX_MODEL: "offline", ANS_CLAUDE_MODEL: "offline", ANS_PI_BASE_URL: "http://127.0.0.1:1", ANS_CODEX_BASE_URL: "http://127.0.0.1:1", ANTHROPIC_BASE_URL: "http://127.0.0.1:1" };
  try {
    for (const runtime of ["pi", "codex", "claude"] as const) {
      const run = spawnSync(process.execPath, ["--import", pathToFileURL(hooks).href, bin, "role", "run", "编排", "--task", "B1", "--runtime", runtime], { cwd: root, env, encoding: "utf8", timeout: SPAWN_TIMEOUT_MS });
      assert.equal(run.signal, null, `${runtime}: ${run.stdout}\n${run.stderr}`);
      assert.equal(run.status, 1, run.stderr);
      assert.match(run.stderr, runtime === "codex" ? /Codex requires @modelcontextprotocol\/sdk@1\.32\.1/ : /assembly simulated missing SDK/);
      assert.doesNotMatch(run.stdout + run.stderr, new RegExp(fakeKey));
      assert.doesNotMatch(run.stdout, /装配演示假 runtime/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

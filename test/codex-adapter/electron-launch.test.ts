import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { harness, options, role } from "./fixtures.ts";

for (const scenario of [
  { name: "Node default JS entry keeps isolated environment", electron: false },
  { name: "Electron default JS entry starts its child in Node mode", electron: true },
  { name: "Electron explicit native CLI keeps argv and environment", electron: true, cliPath: "/fixture/native-codex" },
]) test(scenario.name, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-codex-launch-"));
  const original = Object.getOwnPropertyDescriptor(process.versions, "electron");
  const originalSpawn = childProcess.spawn;
  const captured: Array<{ command: string; args: readonly string[]; env: NodeJS.ProcessEnv }> = [];
  try {
    if (scenario.electron) Object.defineProperty(process.versions, "electron", { value: "44.7.0", configurable: true });
    else Reflect.deleteProperty(process.versions, "electron");
    t.mock.method(childProcess, "spawn", (command: string, args: readonly string[], spawnOptions: { env: NodeJS.ProcessEnv }) => {
      captured.push({ command, args, env: spawnOptions.env });
      throw new Error("fixture stopped before starting any child");
    });
    syncBuiltinESMExports();
    await assert.rejects(createCodexRuntimeAdapter(options(root, harness(), {
      engineFactory: undefined, cliPath: scenario.cliPath,
      env: { CODEX_API_KEY: "fixture-key", PATH: "/fixture/path", HOST_SECRET: "must-not-inherit", ELECTRON_RUN_AS_NODE: "host-value" },
    })).bindRole(role), /fixture stopped before starting any child/);
    assert.equal(captured.length, 1);
    const call = captured[0];
    assert.equal(call.command, scenario.cliPath ?? process.execPath);
    assert.deepEqual(call.args.slice(scenario.cliPath ? 0 : 1, scenario.cliPath ? 4 : 5), ["app-server", "--listen", "stdio://", "--strict-config"]);
    if (!scenario.cliPath) assert.match(call.args[0], /[/\\]bin[/\\]codex\.js$/);
    assert.equal(call.env.CODEX_API_KEY, "fixture-key");
    assert.equal(call.env.PATH, "/fixture/path");
    assert.equal(call.env.HOST_SECRET, undefined);
    assert.equal(call.env.ELECTRON_RUN_AS_NODE, scenario.electron && !scenario.cliPath ? "1" : undefined);
    assert.deepEqual(Object.keys(call.env).sort(), ["CODEX_API_KEY", "CODEX_HOME", "PATH", ...(scenario.electron && !scenario.cliPath ? ["ELECTRON_RUN_AS_NODE"] : [])].sort());
  } finally {
    childProcess.spawn = originalSpawn;
    syncBuiltinESMExports();
    if (original) Object.defineProperty(process.versions, "electron", original);
    else Reflect.deleteProperty(process.versions, "electron");
    await rm(root, { recursive: true, force: true });
  }
});

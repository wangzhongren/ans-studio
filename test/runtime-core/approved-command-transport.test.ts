import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveApprovedCommandTransport } from "../../src/common/runtime-core/approved-command-transport.ts";
import type { ShellGate, ShellPostAuditFn, ShellReviewRequest, ShellReviewResult } from "../../src/model/runtime.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const windowsOnly = { skip: process.platform !== "win32" };

async function fixture(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ans-approved-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = "node checks.cjs";
  const scripts = { typecheck: `${script} 0`, "check-fail": `${script} 7` };
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "checks-fixture", version: "1.0.0", scripts }));
  await writeFile(path.join(root, "checks.cjs"), [
    'require("node:fs").writeFileSync("ran", process.cwd());',
    'process.stdout.write(process.env.ANS_APPROVED_COMMAND_TEST_SECRET === undefined ? "checks executed" : "unfiltered environment");',
    'process.stderr.write("diagnostic");',
    'process.exitCode = Number(process.argv[2]);',
  ].join("\n"));
  const localBin = path.join(root, "node_modules", "npm", "bin");
  await mkdir(localBin, { recursive: true });
  await writeFile(path.join(localBin, "npm-cli.js"), 'process.stdout.write("project shadow");');
  await writeFile(path.join(root, "npm.cmd"), "@echo project shim\r\n");
  return root;
}

function runForeground(cwd: string, shellGate: ShellGate, shellPostAudit?: ShellPostAuditFn) {
  const tool = buildGovernedTools(allow, {
    shellCwd: cwd, shellGate, shellPostAudit, extraCredentialEnvVars: ["ANS_APPROVED_COMMAND_TEST_SECRET"], roleId: "verifier",
  }).find((entry) => entry.name === "run_shell")!;
  return (command: string, signal?: AbortSignal) => tool.handler({ name: tool.name, args: { command }, signal, toolCallId: "fixture-call" });
}

test("Windows npm passes original argv through approval/audit and runs the application CLI", windowsOnly, async (t) => {
  const root = await fixture(t);
  const command = "npm run typecheck";
  const argv = ["npm", "run", "typecheck"];
  const reviewed: ShellReviewRequest[] = [];
  const audited: { request: ShellReviewRequest; exitCode?: number }[] = [];
  const offered = Promise.withResolvers<void>();
  const decision = Promise.withResolvers<ShellReviewResult>();
  const run = runForeground(root, (request) => {
    reviewed.push(request);
    offered.resolve();
    return decision.promise;
  }, (request, result) => {
    audited.push({ request, exitCode: result.exitCode });
    return { violations: [] };
  });
  const previous = process.env.ANS_APPROVED_COMMAND_TEST_SECRET;
  process.env.ANS_APPROVED_COMMAND_TEST_SECRET = "must be filtered";
  t.after(() => {
    if (previous === undefined) delete process.env.ANS_APPROVED_COMMAND_TEST_SECRET;
    else process.env.ANS_APPROVED_COMMAND_TEST_SECRET = previous;
  });
  const pending = run(command);
  await offered.promise;
  assert.deepEqual(reviewed[0], { command, argv, cwd: root, toolCallId: "fixture-call", entry: "run_shell", roleId: "verifier" });
  await assert.rejects(readFile(path.join(root, "ran")), { code: "ENOENT" });
  decision.resolve({ allow: true, by: "fixture-operator" });
  const result = await pending;
  assert.equal(result.ok, true, result.message);
  assert.equal(result.execution?.exitCode, 0);
  assert.match(result.execution?.stdout ?? "", /checks executed/);
  assert.equal(result.execution?.stderr, "diagnostic");
  assert.equal(path.relative(root, await readFile(path.join(root, "ran"), "utf8")), "");
  assert.deepEqual(audited, [{ request: reviewed[0]!, exitCode: 0 }]);

  const failed = await run("npm run check-fail");
  assert.equal(failed.ok, false);
  assert.equal(failed.execution?.exitCode, 7);
  assert.equal(failed.execution?.error, undefined);
  assert.equal(audited[1]?.exitCode, 7);
});

test("rejected and cancelled Windows npm requests do not start a process", windowsOnly, async (t) => {
  const root = await fixture(t);
  const denied = await runForeground(root, async () => ({ allow: false, reason: "declined", by: "fixture-operator" }))("npm run typecheck");
  assert.equal(denied.ok, false);
  assert.match(denied.message, /审核拒绝/);
  assert.equal(denied.execution, undefined);
  const offered = Promise.withResolvers<void>();
  const decision = Promise.withResolvers<ShellReviewResult>();
  const controller = new AbortController();
  const pending = runForeground(root, () => {
    offered.resolve();
    return decision.promise;
  })("npm run typecheck", controller.signal);
  await offered.promise;
  controller.abort();
  const cancelled = await pending;
  decision.resolve({ allow: true, by: "late-operator" });
  assert.equal(cancelled.ok, false);
  assert.match(cancelled.message, /中止/);
  assert.equal(cancelled.execution, undefined);
  await assert.rejects(readFile(path.join(root, "ran")), { code: "ENOENT" });
});

test("a missing bundled Windows npm fails without a command fallback", windowsOnly, async () => {
  const result = await resolveApprovedCommandTransport(["npm", "run", "typecheck"], {}, async () => {
    throw Object.assign(new Error("test fixture unavailable"), { code: "ENOENT" });
  });
  assert.deepEqual(result, { error: "应用内 npm CLI 不可用（bundled-npm-unavailable）" });
});

test("other command names and non-Windows npm retain the original transport", async () => {
  const env = { PATH: "some-path" };
  const commands = [["node", "checks.cjs"], ["npm.cmd", "--version"], ["git", "status"]];
  if (process.platform !== "win32") commands.push(["npm", "run", "typecheck"]);
  for (const argv of commands) {
    const result = await resolveApprovedCommandTransport(argv, env, async () => assert.fail("bundled npm resolution must not run"));
    assert.ok("argv" in result);
    assert.equal(result.argv, argv);
    assert.equal(result.env, env);
  }
});

test("Windows Electron runs an approved literal A11 self-test on a system-only PATH", windowsOnly, async t => {
  const root = await fixture(t);
  const electron = process.env.ANS_APPROVED_COMMAND_TEST_ELECTRON
    ?? fileURLToPath(new URL("../../node_modules/electron/dist/electron.exe", import.meta.url));
  const runtime = new URL("../../src/provider/runtime/tools.ts", import.meta.url);
  const transport = new URL("../../src/common/runtime-core/approved-command-transport.ts", import.meta.url);
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const systemBin = path.join(systemRoot, "System32");
  const env = {
    PATH: systemBin, SystemRoot: systemRoot, ComSpec: path.join(systemBin, "cmd.exe"),
    PATHEXT: ".COM;.EXE;.BAT;.CMD", ELECTRON_RUN_AS_NODE: "1", TEMP: root, TMP: root, USERPROFILE: root,
  };
  await mkdir(path.join(root, "src", "core"), { recursive: true });
  await writeFile(path.join(root, "src", "core", "threshold.test.mjs"), [
    'import assert from "node:assert/strict"; import test from "node:test";',
    'test("real threshold check", () => { assert.ok(process.versions.electron); assert.equal(2 + 2, 4); });',
  ].join("\n"));
  await writeFile(path.join(root, "src", "core", "syntax.mjs"), 'throw new Error("syntax check must not execute the file");\n');
  await writeFile(path.join(root, "src", "core", "fail.test.mjs"), [
    'import assert from "node:assert/strict"; import test from "node:test";',
    'test("real failing check", () => assert.fail("intentional test failure"));',
  ].join("\n"));
  const driver = path.join(root, "electron-a11-driver.mjs");
  await writeFile(driver, [
    'import assert from "node:assert/strict";',
    'import { execFileSync } from "node:child_process";',
    'import { join } from "node:path";',
    `import { buildGovernedTools } from ${JSON.stringify(runtime.href)};`,
    `import { resolveApprovedCommandTransport } from ${JSON.stringify(transport.href)};`,
    'assert.ok(process.versions.electron);',
    'for (const name of ["node", "npm"]) assert.throws(() => execFileSync(join(process.env.SystemRoot, "System32", "where.exe"), ["$PATH:" + name], { stdio: "pipe" }));',
    'const cwd = process.cwd();',
    'const source = { PATH: process.env.PATH, electron_run_as_node: "0", Node_Options: "--require missing.cjs" };',
    'const binding = { cwd, isCurrent: () => true };',
    'const direct = await resolveApprovedCommandTransport(["node", "--test", "src/core/threshold.test.mjs"], source, undefined, binding);',
    'assert.deepEqual(direct.argv, [process.execPath, "--test", "src/core/threshold.test.mjs"]);',
    'assert.deepEqual(direct.env, { PATH: source.PATH, ELECTRON_RUN_AS_NODE: "1" });',
    'assert.equal(source.electron_run_as_node, "0");',
    'assert.equal(source.Node_Options, "--require missing.cjs");',
    'for (const args of [[], ["--test"], ["-p", "1"], ["--check", "src/core/syntax.mjs", "--trace-warnings"],',
    '  ["--test", "--test-name-pattern=x", "src/core/threshold.test.mjs"], ["--test", "../other.test.mjs"],',
    '  ["--test", "src/**/*.test.mjs"], ["--test", join(cwd, "src/core/threshold.test.mjs")], ["--test", "src/core"]]) {',
    '  const argv = ["node", ...args];',
    '  const regular = await resolveApprovedCommandTransport(argv, source, undefined, binding);',
    '  assert.equal(regular.argv, argv); assert.equal(regular.env, source);',
    '}',
    'const reviewed = [], audited = [], observed = [];',
    'let turn = "current-a11";',
    'const observer = fact => observed.push(fact);',
    'const foreground = overrides => buildGovernedTools(() => ({ allowed: false }), {',
    '  durableFixedWorkflow: true, shellCwd: cwd, roleId: "worker", currentTurnId: () => turn,',
    '  shellGate: async request => { reviewed.push(request); return { allow: true, by: "fixture operator" }; },',
    '  shellPostAudit: async (request, result) => { audited.push({ request, result }); return { violations: [] }; },',
    '  observeImplementationSelfTest: observer, ...overrides,',
    '}).find(entry => entry.name === "run_shell");',
    'const run = (tool, command) => tool.handler({ name: tool.name, toolCallId: "literal-fixture", args: { command } });',
    'const scope = foreground();',
    'const passed = await run(scope, "node --test src/core/threshold.test.mjs");',
    'assert.equal(passed.execution?.exitCode, 0, passed.message);',
    'assert.match(passed.execution?.stdout ?? "", /real threshold check/);',
    'const checked = await run(scope, "node --check src/core/syntax.mjs");',
    'assert.equal(checked.execution?.exitCode, 0, checked.message);',
    'const failed = await run(scope, "node --test src/core/fail.test.mjs");',
    'assert.equal(failed.execution?.exitCode, 1, failed.message);',
    'for (let i = 0; i < 3; i++) {',
    '  assert.deepEqual(audited[i].request, reviewed[i]);',
    '  assert.deepEqual(observed[i].argv, reviewed[i].argv);',
    '  assert.equal(observed[i].cwd, cwd); assert.equal(observed[i].writeAuditPassed, true);',
    '  assert.equal(observed[i].reviewedBy, "fixture operator");',
    '  assert.deepEqual(observed[i].process, { started: true, transport: { kind: "bundled-node", executable: process.execPath, argv: reviewed[i].argv.slice(1) } });',
    '}',
    'assert.deepEqual(observed.map(entry => entry.outcome.exitCode), [0, 0, 1]);',
    'for (const override of [{ observeImplementationSelfTest: undefined }, { durableFixedWorkflow: false }]) {',
    '  const regular = await run(foreground(override), "node --test src/core/threshold.test.mjs");',
    '  assert.match(regular.execution?.error ?? "", /spawn node ENOENT/);',
    '}',
    'const denied = await run(foreground({ shellGate: async () => ({ allow: false, by: "fixture operator", reason: "denied" }) }), "node --test src/core/threshold.test.mjs");',
    'assert.match(denied.message, /审核拒绝/); assert.equal(denied.execution, undefined);',
    'const stale = await run(foreground({ shellGate: async () => { turn = "retired"; return { allow: true, by: "fixture operator" }; } }), "node --test src/core/threshold.test.mjs");',
    'assert.match(stale.execution?.error ?? "", /implementation-self-test-stale/);',
    'assert.equal(observed.length, 3);',
    'turn = "current-a11-retest";',
    'const retests = []; const strictAudit = { status: "passed", digest: "b".repeat(64) };',
    'const retestScope = foreground({',
    '  shellGate: async request => {',
    '    assert.equal(request.toolCallId, "literal-fixture");',
    '    assert.equal(request.cwd, cwd);',
    '    return { allow: true, by: "fixture operator", implementationSelfTest: { strictAuditReady: true, isCurrent: () => true } };',
    '  },',
    '  shellPostAudit: () => ({ violations: [], strictAudit }),',
    '  observeImplementationSelfTest: fact => retests.push(fact),',
    '});',
    'const actual = await run(retestScope, "node --test src/core/threshold.test.mjs");',
    'assert.equal(actual.ok, true, actual.message);',
    'assert.equal(retests[0].toolCallId, "literal-fixture");',
    'assert.deepEqual(retests[0].argv, ["node", "--test", "src/core/threshold.test.mjs"]);',
    'assert.deepEqual(retests[0].process, { started: true, transport: { kind: "bundled-node", executable: process.execPath, argv: retests[0].argv.slice(1) } });',
    'assert.deepEqual(retests[0].strictAudit, strictAudit);',
    'assert.match(retests[0].output.stdout, /real threshold check/);',
    'const unsuccessful = await run(retestScope, "node --test src/core/fail.test.mjs");',
    'assert.equal(unsuccessful.ok, false, unsuccessful.message);',
    'assert.equal(retests[1].outcome.exitCode, 1);',
    'assert.match(retests[1].output.stdout, /intentional test failure/);',
    'const missing = await run(retestScope, "node --test src/core/not-present.test.mjs");',
    'assert.match(missing.execution?.error ?? "", /implementation-self-test-transport-unverified/);',
    'assert.deepEqual(retests[2].process, { started: false });',
    'assert.equal(retests[2].writeAuditPassed, false);',
  ].join("\n"));
  execFileSync(await realpath(electron), [driver], { cwd: root, env, windowsHide: true, timeout: 20_000, encoding: "utf8" });
});

test("approved Windows Electron npm run build uses the packaged Node shim on a system-only PATH", windowsOnly, async (t) => {
  const root = await fixture(t);
  const transportUrl = new URL("../../src/common/runtime-core/approved-command-transport.ts", import.meta.url);
  const toolsUrl = new URL("../../src/provider/runtime/tools.ts", import.meta.url);
  const electron = process.env.ANS_APPROVED_COMMAND_TEST_ELECTRON
    ?? fileURLToPath(new URL("../../node_modules/electron/dist/electron.exe", import.meta.url));
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const systemBin = path.join(systemRoot, "System32");
  const cmd = path.join(systemBin, "cmd.exe");
  const childEnv = {
    PATH: systemBin, SystemRoot: systemRoot, ComSpec: cmd, PATHEXT: ".COM;.EXE;.BAT;.CMD",
    ELECTRON_RUN_AS_NODE: "1", TEMP: root, TMP: root, USERPROFILE: root,
  };
  const projectBin = path.join(root, "node_modules", ".bin");
  await mkdir(projectBin);
  await writeFile(path.join(projectBin, "local-check.cmd"),
    '@echo off\r\nnode "%~dp0..\\..\\check-bundled.cjs" %*\r\n');
  await writeFile(path.join(root, "check-bundled.cjs"), [
    'const { writeFileSync } = require("node:fs");',
    'writeFileSync("ran-bundled.json", JSON.stringify({ exe: process.execPath, electron: process.versions.electron, args: process.argv.slice(2) }));',
    'process.exitCode = Number(process.argv[3]);',
  ].join("\n"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "electron-build-fixture", version: "1.0.0",
    scripts: { build: 'local-check "two words" 0', "build-fail": 'local-check "two words" 7' },
  }));

  // The second app layout lacks its own shim, while a project-controlled fallback is on PATH.
  const brokenApp = path.join(root, "broken-app");
  const brokenCore = path.join(brokenApp, "src", "common", "runtime-core");
  const brokenNpm = path.join(brokenApp, "node_modules", "npm", "bin");
  await mkdir(brokenCore, { recursive: true });
  await mkdir(brokenNpm, { recursive: true });
  await copyFile(fileURLToPath(transportUrl), path.join(brokenCore, "approved-command-transport.ts"));
  await writeFile(path.join(brokenApp, "package.json"), '{"type":"module"}');
  await writeFile(path.join(brokenNpm, "npm-cli.js"), "");
  const shadow = path.join(root, "untrusted-shim");
  await mkdir(shadow);
  await writeFile(path.join(shadow, "node.cmd"), "@exit /b 99\r\n");
  const driver = path.join(root, "electron-driver.mjs");
  await writeFile(driver, [
    'import assert from "node:assert/strict";',
    'import { execFileSync } from "node:child_process";',
    'import { mkdir, readFile } from "node:fs/promises";',
    'import { delimiter, join } from "node:path";',
    `import { resolveApprovedCommandTransport } from ${JSON.stringify(transportUrl.href)};`,
    `import { buildGovernedTools } from ${JSON.stringify(toolsUrl.href)};`,
    `import { resolveApprovedCommandTransport as broken } from ${JSON.stringify(pathToFileURL(path.join(brokenCore, "approved-command-transport.ts")).href)};`,
    'assert.ok(process.versions.electron);',
    'for (const name of ["node", "npm"]) {',
    '  assert.throws(() => execFileSync(join(process.env.SystemRoot, "System32", "where.exe"), ["$PATH:" + name], { stdio: "pipe" }));',
    '}',
    'const argv = ["npm", "run", "build"];',
    'const original = { PATH: process.env.PATH, Path: "untrusted-duplicate", electron_run_as_node: "0", ans_approved_npm_node_exe: "untrusted-exe" };',
    'const transport = await resolveApprovedCommandTransport(argv, original);',
    'assert.ok(transport.argv, JSON.stringify(transport));',
    'assert.deepEqual(Object.keys(transport.env).filter(key => key.toUpperCase() === "PATH"), ["PATH"]);',
    'assert.deepEqual(Object.keys(transport.env).filter(key => key.toUpperCase() === "ANS_APPROVED_NPM_NODE_EXE"), ["ANS_APPROVED_NPM_NODE_EXE"]);',
    'assert.equal(transport.env.ANS_APPROVED_NPM_NODE_EXE, process.execPath);',
    'assert.equal(transport.env.ELECTRON_RUN_AS_NODE, "1");',
    'assert.equal(transport.env.PATH.split(delimiter)[1], process.env.PATH);',
    'assert.equal(original.ans_approved_npm_node_exe, "untrusted-exe");',
    'assert.equal(process.env.ANS_APPROVED_NPM_NODE_EXE, undefined);',
    `const fallbackEnv = { ...original, PATH: ${JSON.stringify(shadow)} + delimiter + original.PATH };`,
    'assert.match((await broken(argv, fallbackEnv)).error, /bundled-node-unavailable/);',
    `await mkdir(${JSON.stringify(path.join(brokenCore, "portable-node", "node.cmd"))}, { recursive: true });`,
    'assert.match((await broken(argv, fallbackEnv)).error, /bundled-node-unavailable/);',
    'let approvals = 0; const observed = [];',
    'const tool = buildGovernedTools(() => ({ allowed: false }), {',
    '  durableFixedWorkflow: true, shellCwd: process.cwd(), roleId: "worker", currentTurnId: () => "current-a11",',
    '  observeImplementationSelfTest: fact => observed.push(fact),',
    '  shellGate: async request => {',
    '    assert.deepEqual(request.argv, ["npm", "run", approvals === 0 ? "build" : "build-fail"]);',
    '    assert.equal(request.cwd, process.cwd());',
    '    approvals++;',
    '    return { allow: true, by: "fixture" };',
    '  },',
    '}).find(entry => entry.name === "run_shell");',
    'const run = script => tool.handler({ name: tool.name, toolCallId: "call-" + script, args: { command: "npm run " + script } });',
    'const build = await run("build");',
    'assert.equal(build.execution?.exitCode, 0, build.message);',
    'assert.equal(build.ok, true);',
    'assert.deepEqual(JSON.parse(await readFile("ran-bundled.json", "utf8")), { exe: process.execPath, electron: process.versions.electron, args: ["two words", "0"] });',
    'const failed = await run("build-fail");',
    'assert.equal(failed.execution?.exitCode, 7, failed.message);',
    'assert.equal(failed.ok, false);',
    'assert.equal(approvals, 2);',
    'assert.equal(observed[0].toolCallId, "call-build");',
    'assert.deepEqual(observed[0].argv, argv);',
    'assert.deepEqual(observed[0].process, { started: true, transport: { kind: "bundled-npm", executable: process.execPath, argv: transport.argv.slice(1) } });',
  ].join("\n"));
  execFileSync(await realpath(electron), [driver], { cwd: root, env: childEnv, windowsHide: true, timeout: 20_000, encoding: "utf8" });
});

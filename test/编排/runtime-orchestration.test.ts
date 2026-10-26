// O1 integration: real Service/tool handlers, fake external engine; no model calls.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  CustomerInputMetadata, CustomerInputOutcome, RuntimeAdapter, RuntimeContextSource,
  ReportHandbackMetadata, RuntimeKind, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, ToolResult,
} from "../../src/model/runtime.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import { RUNTIME_KINDS } from "../../src/common/shared/runtime-shared.ts";
import { RUNTIME_KINDS as CLI_KINDS, parseGovernArgs } from "../../src/common/编排/args.ts";
import { createRuntimeAdapterFactory, openRoleSession, runRole, readRoleSessionHistory } from "../../src/pipeline/orchestration/run-role.ts";
import { openGovernanceSession, runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import { assembleProjectShellGate } from "../../src/pipeline/orchestration/shell-arming.ts";
import { defaultShellRules } from "../../src/common/门禁引擎/classify-shell.ts";
import { createPmReviewer } from "../../src/pipeline/orchestration/pm-reviewer.ts";
import { runRoleCommand } from "../../src/interface/cli/run.ts";
import { governCommand } from "../../src/interface/cli/govern.ts";

function fixture(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-o1-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# X\n");
  fs.writeFileSync(path.join(dir, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: O1\n");
  return { projectRoot: root, skillRoot: root, roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } }, builtInRoles: ["su"], governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:O1" } } };
}
function queue() {
  const pending: SessionEvent[] = [];
  let waiter: (() => void) | undefined;
  let closed = false;
  return {
    push(event: SessionEvent) { pending.push(event); waiter?.(); waiter = undefined; },
    close() { closed = true; waiter?.(); waiter = undefined; },
    async *events() {
      while (true) {
        if (pending.length) { yield pending.shift()!; continue; }
        if (closed) return;
        await new Promise<void>((resolve) => { waiter = resolve; });
      }
    },
  };
}
function fakeProvider(
  work: (options: RuntimeProviderOptions, text: string, signal: AbortSignal) => Promise<void> = async () => {},
  outcome = "completed",
  contexts?: { source: RuntimeContextSource; warning?: string },
): { factory: RuntimeProviderFactory; calls: RuntimeProviderOptions[] } {
  const calls: RuntimeProviderOptions[] = [];
  const factory: RuntimeProviderFactory = (options) => {
    calls.push(options);
    assert.equal(options.toolDisplayMode, "required-v1");
    assert.equal(typeof options.registerToolDisplayProfile, "function");
    options.registerToolDisplayProfile!({ credentials: [] });
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole() {
        const events = queue();
        let controller = new AbortController();
        let source: RuntimeContextSource = options.storage ? "fresh" : "in-memory";
        return {
          runtime: options.runtime,
          get contextSource() { return source; },
          get nativeSessionId() { return source === "fresh" || source === "in-memory" ? undefined : `${options.runtime}-native`; },
          get contextWarning() { return source === "recovered" ? contexts?.warning : undefined; },
          async prompt(text) {
            controller = new AbortController();
            await work(options, text, controller.signal);
            source = contexts?.source ?? source;
            events.push({ kind: "settled", summary: "engine settled", turnId: options.currentTurnId(), detail: { outcome } });
          },
          events: () => events.events(),
          async abort() { controller.abort(); },
          async dispose() { controller.abort(); events.close(); },
        };
      },
    } satisfies RuntimeAdapter;
  };
  return { factory, calls };
}
async function call(options: RuntimeProviderOptions, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
  const tool = options.tools.find((item) => item.name === name);
  assert.ok(tool, `registered tool ${name}`);
  return tool.handler({ name, args, toolCallId: name, signal });
}
function optionsFor(runtime: RuntimeKind, factory: RuntimeProviderFactory) { return { providerFactories: { [runtime]: factory } }; }
function configSource(project: ProjectConfig) {
  return { kind: "builtin-fallback" as const, path: path.join(project.projectRoot, ".ans/project.json"), acceptance: project.governanceBoundary!.acceptance, pinPaths: [] };
}

test("O1 runtime values are the exact shared enum; govern validates explicit selection", () => {
  assert.equal(CLI_KINDS, RUNTIME_KINDS);
  for (const runtime of RUNTIME_KINDS) assert.equal(parseGovernArgs(["--runtime", runtime]).runtime, runtime);
  assert.ok(parseGovernArgs(["--runtime", "other"]).errors.length);
});

for (const runtime of RUNTIME_KINDS) {
  test(`O1 role/govern commands select ${runtime} through the actual Service and preserve capability rules`, async () => {
    const project = fixture();
    const provider = fakeProvider();
    const runtimeOptions = { ...optionsFor(runtime, provider.factory), persistSession: false };
    try {
      assert.equal(await runRoleCommand(["X", "--task", "T", "--runtime", runtime], { project, scope: { writeSet: ["src/a.ts"], conditions: [] }, runtime: "demo", runtimeOptions }), 0);
      assert.equal(await governCommand(["--runtime", runtime], { project, configSource: configSource(project), runtime: "demo", runtimeOptions, customerInput: () => ({ outcome: "declined" }) }), 0);
      assert.equal(provider.calls.length, 2);
      assert.ok(provider.calls.every((options) => options.runtime === runtime));
      const names = provider.calls.map((options) => options.tools.map((tool) => tool.name));
      assert.ok(!names[0].includes("request_confirmation"));
      assert.ok(names[1].includes("request_confirmation"));
      assert.ok(!names[1].includes("submit_report"));
      assert.ok(!names[1].includes("dispatch_task"));
      assert.ok(names.every((tools) => !tools.includes("run_shell")));
      assert.ok(provider.calls.every((options) => options.storage === undefined));
      assert.equal(fs.existsSync(path.join(project.projectRoot, ".ans")), false);
    } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
  });
}

test("O1 invalid injected runtime fails without constructing any engine", async () => {
  const project = fixture();
  let calls = 0;
  const runtimeFactory = () => { calls++; throw new Error("must not construct"); };
  try {
    assert.equal(await runRoleCommand(["X", "--task", "T"], { project, scope: { writeSet: [], conditions: [] }, runtime: "unknown" as RuntimeKind, runtimeFactory }), 2);
    assert.equal(await governCommand([], { project, configSource: configSource(project), runtime: "unknown" as RuntimeKind, runtimeFactory }), 2);
    assert.equal(calls, 0);
  } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

test("O1 actual write handler targets projectRoot; demo keeps legacy no-write behavior", async () => {
  const project = fixture();
  const results: ToolResult[] = [];
  const provider = fakeProvider(async (options, _text, signal) => { results.push(await call(options, "write_file", { path: "src/a.ts", content: "O1 actual\n" }, signal)); });
  try {
    for (const runtime of ["demo", "codex"] as const) {
      const factory = createRuntimeAdapterFactory(project, runtime, { ...optionsFor(runtime, provider.factory), writeRoot: runtime === "demo" ? undefined : os.tmpdir() });
      const result = await runRole({ roleId: "X", taskId: "T", project, runtime }, { createAdapter: factory });
      assert.equal(result.code, 0);
      assert.equal(results.at(-1)?.ok, true);
      assert.equal(fs.existsSync(path.join(project.projectRoot, "src/a.ts")), runtime !== "demo");
    }
    assert.equal(fs.readFileSync(path.join(project.projectRoot, "src/a.ts"), "utf8"), "O1 actual\n");
  } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

test("O1 original confirmation waits → abort → old yes → next turn actual write remains denied", async () => {
  const project = fixture();
  let answer!: (value: CustomerInputOutcome) => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  let metadata: CustomerInputMetadata | undefined;
  const results: ToolResult[] = [];
  const provider = fakeProvider(async (options, text, signal) => {
    results.push(await call(options, text === "confirm" ? "request_confirmation" : "write_file", text === "confirm" ? { title: "允许写入", preview: "src/a.ts\n\n## src/a.ts\n// 预览正文\n" } : { path: "src/a.ts", content: "late permission must fail" }, signal));
  });
  const handle = await openRoleSession({ roleId: "X", project, runtime: "codex", persistSession: false,
    // 2026-10-25 客户规则后：项目角色**无任务收窄**时 Section 1 写入是预授权（不依赖确认发行）。
    // 本用例验证「中止后迟到的客户同意不得生效」，故显式给出空任务 writeSet 保持确认制收窄路径。
    scope: { writeSet: [], conditions: [] },
    customerInput: (_req, context) => { metadata = context; entered(); return new Promise<CustomerInputOutcome>((resolve) => { answer = resolve; }); },
  }, { runtimeOptions: optionsFor("codex", provider.factory) });
  try {
    const first = handle.send("confirm");
    const failed = assert.rejects(first, /中止/);
    await waiting;
    assert.equal(metadata?.runtime, "codex");
    assert.equal(metadata?.roleId, "X");
    assert.ok(metadata?.turnId);
    assert.equal(metadata?.signal?.aborted, false);
    assert.deepEqual(await handle.abort?.(), { ok: true, supported: true });
    await failed;
    assert.equal(metadata?.signal?.aborted, true);
    answer({ outcome: "answered", value: { confirmed: true } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await handle.send("write");
    assert.equal(results.at(-1)?.ok, false);
    assert.match(results.at(-1)!.message, /writeSet|写集/);
    assert.equal(fs.existsSync(path.join(project.projectRoot, "src/a.ts")), false);
    const iterator = handle.events()[Symbol.asyncIterator]();
    const settled: SessionEvent[] = [];
    while (settled.length < 2) {
      const event = (await iterator.next()).value;
      if (event.kind === "settled") settled.push(event);
    }
    assert.equal((settled[0].detail as { outcome: string }).outcome, "aborted");
    assert.equal((settled[1].detail as { outcome: string }).outcome, "completed");
    assert.equal(settled[0].turnId, metadata?.turnId);
    assert.notEqual(settled[0].turnId, settled[1].turnId);
    for (const event of settled) assert.equal(event.turnId, (event.detail as { turnId: string }).turnId);
  } finally { await handle.dispose(); fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

for (const outcome of ["failed", "aborted", "timed_out"]) {
  test(`O1 settled ${outcome} returns CLI failure for both role and govern`, async () => {
    const project = fixture();
    const provider = fakeProvider(undefined, outcome);
    try {
      const runtimeOptions = optionsFor("codex", provider.factory);
      assert.equal((await runRole({ roleId: "X", project, taskId: "T", runtime: "codex" }, { runtimeOptions })).code, 1);
      assert.equal((await runGovernSession({ project, taskId: "T", governanceRoleId: "su", runtime: "codex", persistSession: false, customerInput: () => ({ outcome: "declined" }) }, { runtimeOptions })).code, 1);
    } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
  });
}

test("O1 role/runtime store isolation and live native context getters; ANS history through Service facade", async () => {
  const project = fixture();
  const provider = fakeProvider(undefined, "completed", { source: "recovered", warning: "native restore failed" });
  try {
    for (const runtime of ["codex", "claude"] as const) {
      const handle = await openRoleSession({ roleId: "X", project, runtime }, { runtimeOptions: optionsFor(runtime, provider.factory) });
      assert.equal(handle.contextSource, "fresh");
      await handle.send(runtime);
      assert.equal(handle.contextSource, "recovered");
      assert.equal(handle.nativeSessionId, `${runtime}-native`);
      assert.equal(handle.contextWarning, "native restore failed");
      await handle.dispose();
      const history = await readRoleSessionHistory({ projectRoot: project.projectRoot, roleId: "X", runtime });
      assert.equal(history.record?.runtime, runtime);
      assert.equal(history.record?.contextSource, "recovered");
      assert.deepEqual(history.entries.filter((entry) => entry.kind === "user").map((entry) => entry.text), [runtime]);
    }
    assert.notEqual(provider.calls[0].storage?.directory, provider.calls[1].storage?.directory);
    assert.ok(provider.calls[0].storage?.directory.endsWith(path.join("X", "codex")));
  } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

test("O1 governance forwards native getters and abort; reviewer retains source runtime and no persistence", async () => {
  const project = fixture();
  const provider = fakeProvider(async (options, text, signal) => {
    if (text.includes("shell")) await call(options, "report_shell_verdict", { verdict: "deny", reason: "O1" }, signal);
  }, "completed", { source: "resumed" });
  try {
    const deps = { runtimeOptions: optionsFor("claude", provider.factory) };
    const handle = await openGovernanceSession({ project, taskId: "T", runtime: "claude", governanceRoleId: "su", persistSession: false }, deps);
    await handle.send("restore");
    assert.equal(handle.contextSource, "resumed");
    assert.equal(handle.runtime, "claude");
    assert.equal(handle.nativeSessionId, "claude-native");
    assert.equal((await handle.abort?.())?.ok, true);
    await handle.dispose();
    const reviewer = createPmReviewer({ project, runtime: "claude", pmRoleId: "su", sessionDeps: { createAdapter: createRuntimeAdapterFactory(project, "claude", deps.runtimeOptions) } });
    const verdict = JSON.parse(await reviewer({ command: "inspect", argv: ["inspect"], cwd: project.projectRoot, toolCallId: "O1" }));
    assert.equal(verdict.verdict, "deny");
    assert.equal(provider.calls.at(-1)?.runtime, "claude");
    assert.equal(provider.calls.at(-1)?.storage, undefined);
    assert.ok(provider.calls.at(-1)?.tools.some((tool) => tool.name === "report_shell_verdict"));
  } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});


test("O1 tool report metadata, terminal event and handback use the same actual Service turn", async () => {
  const project = fixture();
  let metadata: ReportHandbackMetadata | undefined;
  const provider = fakeProvider(async (options, _text, signal) => {
    const result = await call(options, "submit_report", { status: "completed", summary: "O1 report", evidence: ["src/a.ts"] }, signal);
    assert.equal(result.ok, true);
  });
  try {
    const factory = createRuntimeAdapterFactory(project, "codex", optionsFor("codex", provider.factory));
    const handle = await openRoleSession({ roleId: "X", project, runtime: "codex", persistSession: false }, {
      createAdapter: (gate, capabilities) => {
        const report = capabilities!.reportHandback!;
        return factory(gate, { ...capabilities, reportHandback: (value, context) => { metadata = context; return report(value, context); } });
      },
    });
    await handle.send("report");
    const iterator = handle.events()[Symbol.asyncIterator]();
    const events = [];
    while (true) { const event = (await iterator.next()).value; events.push(event); if (event.kind === "settled") break; }
    const handback = events.find((event) => event.kind === "handback");
    const terminal = events.find((event) => event.kind === "settled");
    assert.equal(metadata?.runtime, "codex");
    assert.equal(metadata?.roleId, "X");
    assert.equal(terminal?.turnId, metadata?.turnId);
    assert.equal((terminal?.detail as { turnId: string }).turnId, metadata?.turnId);
    assert.equal(handback?.handback.turnId, metadata?.turnId);
    assert.equal(handback?.handback.runtime, "codex");
    assert.equal(handback?.handback.status, "completed");
    assert.equal(handback?.handback.summary, "O1 report");
    await handle.dispose();
  } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

test("O1 shell arming creates its reviewer on source runtime with a verdict tool and no native shell", async () => {
  const project = fixture();
  const provider = fakeProvider(async (options, _text, signal) => {
    await call(options, "report_shell_verdict", { verdict: "deny", reason: "source runtime review" }, signal);
  });
  try {
    const auditSink = createMemoryAuditSink();
    const shellGate = await assembleProjectShellGate({ project, runtime: "claude", pmRoleId: "su", rules: defaultShellRules(), classifyShell: () => "review", advisoryRuleset: false, operatorChannel: () => ({ outcome: "deny", operatorId: "O1" }), auditSink, sessionDeps: { createAdapter: createRuntimeAdapterFactory(project, "claude", optionsFor("claude", provider.factory)) } });
    const result = await shellGate({ command: "inspect", argv: ["inspect"], cwd: project.projectRoot, toolCallId: "shell-O1" });
    assert.equal(result.allow, false);
    assert.equal(auditSink.records.length, 1);
    assert.equal(auditSink.records[0].conclusion, "deny");
    assert.equal(provider.calls[0].runtime, "claude");
    assert.equal(provider.calls[0].storage, undefined);
    assert.ok(provider.calls[0].tools.some((tool) => tool.name === "report_shell_verdict"));
    assert.ok(!provider.calls[0].tools.some((tool) => tool.name === "run_shell"));
  } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

test("O1 provider selection failure returns nonzero without a fallback engine", async () => {
  const project = fixture();
  const runtimeFactory = () => { throw new Error("selected engine unavailable"); };
  try {
    assert.equal(await runRoleCommand(["X", "--task", "T", "--runtime", "codex"], { project, scope: { writeSet: [], conditions: [] }, runtimeFactory }), 1);
    assert.equal(await governCommand(["--runtime", "claude"], { project, configSource: configSource(project), runtimeFactory }), 1);
  } finally { fs.rmSync(project.projectRoot, { recursive: true, force: true }); }
});

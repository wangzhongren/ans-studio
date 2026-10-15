import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRuntimeAdapter, readRuntimeSessionHistory } from "../../src/service/runtime/session.ts";
import { getSessionHistory } from "../../app/desktop/runtime-history.ts";
import type { ResolvedRole } from "../../src/model/role.ts";
import type { RuntimeProviderFactory, SessionEvent, ToolDisplayV1, ToolEventDetailV1 } from "../../src/model/runtime.ts";

function channel<T>() {
  const pending: T[] = [];
  let closed = false;
  let wake: (() => void) | undefined;
  return {
    push(value: T) { pending.push(value); wake?.(); wake = undefined; },
    close() { closed = true; wake?.(); wake = undefined; },
    async *events() {
      while (!closed || pending.length) {
        if (pending.length) yield pending.shift()!;
        else await new Promise<void>(resolve => { wake = resolve; });
      }
    },
  };
}

for (const runtime of ["pi", "codex", "claude"] as const) {
  test(`independent ${runtime}: real shell effects, failures and protected details survive Core to Window history`, async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-display-")));
    const secretName = "ANS_P1P7_INDEPENDENT_" + runtime.toUpperCase();
    const secret = "fake-p1p7-only-" + runtime + "-abC789";
    const previous = process.env[secretName];
    process.env[secretName] = secret;
    const command = JSON.stringify(process.execPath) + " probe.mjs";
    fs.writeFileSync(path.join(root, "probe.mjs"), [
      "import fs from 'node:fs';",
      "fs.appendFileSync('actual-effects.txt', 'one-effect\\n');",
      `process.stdout.write(${JSON.stringify("observed " + secret + " 🧪\n")});`,
      "process.stderr.write('expected diagnostic\\n');",
      "process.exitCode = 7;",
    ].join("\n"));
    const role: ResolvedRole = {
      id: "independent-" + runtime, kind: "project", cardText: "# Independent display consumer",
      boundary: { entries: [], boundarySource: "independent fixture", acceptance: { accepted: true, source: "independent fixture" } },
      boundarySource: "independent fixture", location: { card: "fixture", boundary: "fixture" },
    };
    let nativePrompts = 0;
    let actualShellReviews = 0;
    const originalMessages: string[] = [];
    const factory: RuntimeProviderFactory = options => ({
      async composeContext() { return { systemPrompt: "controlled external engine, real governed handlers" }; },
      async bindRole() {
        assert.equal(options.toolDisplayMode, "required-v1");
        assert.equal(typeof options.projectToolEvent, "function");
        assert.equal(typeof options.registerToolDisplayProfile, "function");
        options.registerToolDisplayProfile!({ credentials: [] });
        const stream = channel<SessionEvent>();
        return {
          runtime, roleId: role.id, contextSource: "fresh",
          async prompt() {
            nativePrompts++;
            const turnId = options.currentTurnId();
            assert.ok(turnId);
            const operations = [
              { name: "run_shell", args: { command } },
              { name: "run_shell", args: { command } },
              { name: "read_file", args: { path: "missing-file.md" } },
            ];
            for (const [index, operation] of operations.entries()) {
              const definition = options.tools.find(tool => tool.name === operation.name);
              assert.ok(definition);
              const identity = { toolName: definition.name, toolCallId: "independent-call-" + index, turnId, roleId: role.id, runtime };
              const input = { rule: definition.displayInputRule, args: operation.args };
              stream.push(options.projectToolEvent!({ ...identity, input, phase: "start", origin: "handler-start" }));
              const result = await definition.handler({ name: definition.name, args: operation.args, toolCallId: identity.toolCallId });
              originalMessages.push(result.message);
              stream.push(options.projectToolEvent!({ ...identity, input, phase: "result", origin: "handler-result", result }));
            }
            stream.push({ kind: "settled", summary: "controlled engine ended", detail: { outcome: "completed" } });
          },
          events: () => stream.events(),
          async dispose() { stream.close(); },
        };
      },
    });
    const session = await createRuntimeAdapter({
      runtime, projectRoot: root, skillRoot: root, persistSession: true,
      extraCredentialEnvVars: [secretName], providerFactories: { [runtime]: factory },
      gate: () => ({ allowed: false, reason: "this test never grants file writes", allowedByRoot: { project: [], skill: [] } }),
      shellGate: async request => {
        assert.equal(request.command, command);
        actualShellReviews++;
        return { allow: true, by: "independent exact fixture command" };
      },
    }).bindRole(role);
    const events: SessionEvent[] = [];
    const collected = (async () => { for await (const event of session.events()) events.push(event); })();
    try {
      await session.prompt("run the controlled fixture and retain its actual failures");
      await session.dispose(); await collected;
      assert.equal(nativePrompts, 1);
      assert.equal(actualShellReviews, 2);
      assert.equal(fs.readFileSync(path.join(root, "actual-effects.txt"), "utf8"), "one-effect\none-effect\n");
      assert.ok(originalMessages[0].includes(secret), "display protection must not change the actual handler result for the model");
      const activity = events.filter(event => ["tool_call", "accepted", "denied"].includes(event.kind));
      assert.equal(activity.length, 6, "two real same-command calls and one failed read each retain one start and one result");
      const results = activity.map(event => event.detail as ToolEventDetailV1).filter(detail => detail.phase === "result");
      assert.equal(new Set(results.map(detail => detail.toolCallId)).size, 3);
      for (const result of results.slice(0, 2)) {
        assert.equal(result.ok, false);
        assert.equal(result.display?.target?.kind, "command");
        assert.equal(result.display?.target?.value.text, command);
        assert.equal(result.display?.process?.exitCode, 7);
        assert.equal(result.display?.process?.stderr?.text, "expected diagnostic\n");
        assert.ok(result.display?.process?.stdout?.redacted);
        assert.ok(!result.display?.process?.stdout?.text.includes(secret));
      }
      assert.match(results[2].display?.error?.text ?? "", /ENOENT/);
      assert.equal(results[2].display?.target?.value.text, "missing-file.md");
      const replayFile = path.join(root, ".ans/sessions", role.id, runtime, "ans/replay.jsonl");
      const rawBefore = fs.readFileSync(replayFile);
      assert.ok(!rawBefore.includes(Buffer.from(secret)), "these new tool records must be protected before persistence");
      const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: role.id, runtime, credentialEnvNames: [secretName] });
      assert.equal(history.entries.filter(entry => entry.event?.kind === "tool_call").length, 3);
      const storedShellResults = history.entries.map(entry => entry.event?.detail as ToolEventDetailV1 | undefined)
        .filter(detail => detail?.toolName === "run_shell" && detail.phase === "result");
      assert.equal(storedShellResults.length, 2);
      for (const detail of storedShellResults) assert.equal(detail?.display?.process?.exitCode, 7, "public history projection must retain the actual structured exit code");
      const view = await getSessionHistory({ projectRoot: root, roleId: role.id, runtime });
      assert.equal(view.error, null);
      const shellRows = view.rows.filter(row => row.activity?.toolName === "run_shell" && row.activity.phase === "result");
      assert.equal(shellRows.length, 2, "Window must keep both independent same-command calls");
      for (const row of shellRows) {
        assert.ok(row.activity && "display" in row.activity, "Window history must carry the public display projection");
        const display = row.activity.display as ToolDisplayV1;
        assert.equal(display.process?.exitCode, 7);
        assert.equal(display.target?.value.text, command);
      }
      assert.deepEqual(fs.readFileSync(replayFile), rawBefore, "history reading must not rewrite the stored log");
    } finally {
      await session.dispose(); await collected;
      if (previous === undefined) delete process.env[secretName]; else process.env[secretName] = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("independent A: a real non-tool engine failure must not become a tool display diagnostic", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-engine-failure-")));
  const original = "independent engine context recovery failed";
  const role: ResolvedRole = { id: "failure", kind: "project", cardText: "# Failure fixture", boundarySource: "fixture",
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, location: { card: "fixture", boundary: "fixture" } };
  const factory: RuntimeProviderFactory = options => ({
    async composeContext() { return { systemPrompt: "fixture" }; },
    async bindRole() {
      options.registerToolDisplayProfile!({ credentials: [] });
      const stream = channel<SessionEvent>();
      return { async prompt() {
        stream.push({ kind: "denied", summary: original, turnId: options.currentTurnId(), detail: { source: "engine-context-failure" } });
        stream.push({ kind: "settled", summary: "actual failed terminal", detail: { outcome: "failed" } });
      }, events: () => stream.events(), async dispose() { stream.close(); } };
    },
  });
  const session = await createRuntimeAdapter({ runtime: "pi", projectRoot: root, skillRoot: root, persistSession: true,
    providerFactories: { pi: factory }, gate: () => ({ allowed: false, reason: "fixture", allowedByRoot: { project: [], skill: [] } }) }).bindRole(role);
  const events: SessionEvent[] = [];
  const drain = (async () => { for await (const event of session.events()) events.push(event); })();
  try {
    await session.prompt("observe the actual non-tool failure");
    await session.dispose(); await drain;
    const denied = events.find(event => event.kind === "denied" && event.summary === original);
    assert.ok(denied, "A is a tool display change and must retain the original non-tool failure fact");
    assert.equal(Object.hasOwn(denied.detail ?? {}, "toolName"), false, "a non-tool engine failure has no tool identity to invent");
    assert.equal(Object.hasOwn(denied.detail ?? {}, "phase"), false, "a non-tool engine failure is not a governance-hook blocked phase");
    const history = await readRuntimeSessionHistory({ projectRoot: root, roleId: role.id, runtime: "pi" });
    assert.ok(history.entries.some(entry => entry.event?.kind === "denied" && entry.event.summary === original));
  } finally { await session.dispose(); await drain; fs.rmSync(root, { recursive: true, force: true }); }
});

test("independent A legacy: protected native-only history preserves classification and target provenance without promoting template execution facts", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-legacy-source-")));
  const dir = path.join(root, ".ans/sessions/legacy"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "independent.jsonl");
  const raw = [
    { type: "session", id: "independent legacy provenance" },
    { type: "message", timestamp: "2026-10-15T00:00:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "actual-native-read", name: "read_file", arguments: { path: "docs/retained.md" } }] } },
    { type: "message", timestamp: "2026-10-15T00:00:01Z", message: { role: "toolResult", toolName: "read_file", toolCallId: "actual-native-read", isError: false, content: [{ type: "text", text: "readable old content" }] } },
    { type: "message", timestamp: "2026-10-15T00:00:02Z", message: { role: "toolResult", toolName: "run_shell", toolCallId: "template-only", isError: false, content: [{ type: "text", text: "run_shell 已执行：not a structured process fact（exit 7）" }] } },
    { type: "message", timestamp: "oversize timestamp " + "x".repeat(4096), message: { role: "user", content: "independent omitted timestamp probe" } },
  ].map(entry => JSON.stringify(entry)).join("\n") + "\n";
  fs.writeFileSync(file, raw);
  try {
    const view = await getSessionHistory({ projectRoot: root, roleId: "legacy", runtime: "pi" });
    assert.equal(view.error, null);
    const read = view.rows.find(row => row.activity?.toolName === "read_file" && row.activity.phase === "result");
    const shell = view.rows.find(row => row.activity?.toolName === "run_shell");
    assert.ok(read && shell);
    assert.equal(read.activity?.target, "docs/retained.md");
    assert.equal(read.legacyTargetSource, "same-call", "a retained target keeps the public parser provenance");
    assert.equal(read.legacyStatusSource, "native-result");
    assert.equal(shell.activity?.status, "failed");
    assert.equal(shell.legacyStatusSource, "legacy-classifier", "an old text classifier must remain distinguishable from an actual native failure flag");
    assert.equal(shell.activity?.target, "");
    assert.equal(shell.activity?.display?.process, undefined);
    const omitted = view.rows.find(row => row.text === "independent omitted timestamp probe");
    assert.ok(omitted);
    assert.equal(omitted.at, "", "budget removal cannot invent a replacement timestamp");
    assert.deepEqual(Reflect.get(omitted, "metadataOmissions"), ["timestamp"], "the row must expose the public omission reason rather than silently dropping it");
    assert.equal(fs.readFileSync(file, "utf8"), raw);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

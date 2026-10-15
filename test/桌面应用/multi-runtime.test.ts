// D1 independent Window evidence. Only temporary fake credentials and injected engines.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { SessionManager, type SessionManagerDeps, type SessionEventEnvelope } from "../../app/desktop/session.ts";
import { getRuntimeConfig, saveRuntimeConfig } from "../../app/desktop/runtime-config.ts";
import { getSessionHistory } from "../../app/desktop/runtime-history.ts";
import { createCustomerInputChannel, type OperatorExpiredPayload, type OperatorRequestPayload } from "../../app/desktop/customer-input.ts";
import { createShellConfirmPresenter, createDesktopOperatorChannel } from "../../app/desktop/operator-channel.ts";
import { createRoleStateDebouncer } from "../../app/desktop/push-batcher.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { listProject, type ProjectListing } from "../../src/service/role/resolve-role.ts";
import { createRuntimeAdapterFactory, openRoleSession, type RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeKind, RuntimeProviderFactory, RuntimeProviderOptions, SessionEvent, RuntimeContextSource, CustomerInputRequest, PromptOptions } from "../../src/model/runtime.ts";
import type { OrchestrationEvent, TaskHandback } from "../../src/common/编排/handback.ts";

function queue<T>() {
  const pending: T[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  return {
    push(event: T) { pending.push(event); wake?.(); wake = undefined; },
    close() { closed = true; wake?.(); wake = undefined; },
    async *events() {
      while (true) {
        if (pending.length > 0) { yield pending.shift()!; continue; }
        if (closed) return;
        await new Promise<void>((resolve) => { wake = resolve; });
      }
    },
  };
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 1500;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("D1 test wait expired");
    await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-d1-"));
  const dir = path.join(root, "角色卡", "A");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# A\n组别：运行时接入组\n组内职责：维护窗口\n");
  fs.writeFileSync(path.join(dir, "boundary.yaml"), "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: D1\n");
  return { root, envPath: path.join(root, "fake.env"), cleanup() { fs.rmSync(root, { recursive: true, force: true }); } };
}
function listing(root: string): ProjectListing {
  const roles: ProjectListing["roles"] = ["su", "A", "B"].map((roleId) => ({ roleId, builtIn: roleId === "su", cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: "test:D1", acceptance: { accepted: false, source: "test:D1" } } }));
  return { projectRoot: root, roles, warnings: [], hasRoles: true, primaryRoleId: "su" };
}
function harness(extra: Partial<SessionManagerDeps> = {}) {
  const opened: { root: string; role: string; runtime: RuntimeKind; stream: ReturnType<typeof queue<OrchestrationEvent>>; sent: string[]; input: Parameters<SessionManagerDeps["openRoleSession"]>[0]; handle: RoleSessionHandle }[] = [];
  const envelopes: SessionEventEnvelope[] = [];
  const manager = new SessionManager({
    openRoleSession: async (input) => {
      const stream = queue<OrchestrationEvent>();
      const sent: string[] = [];
      const handle: RoleSessionHandle = { runtime: input.runtime, contextSource: "fresh", async send(text) { sent.push(text); }, events: () => stream.events(), async dispose() { stream.close(); }, async abort() { stream.push({ kind: "settled", summary: "aborted", detail: { outcome: "aborted" } }); return { ok: true, supported: true }; } };
      opened.push({ root: input.project.projectRoot, role: input.roleId, runtime: input.runtime!, stream, sent, input, handle });
      return handle;
    },
    createPiAdapterFactory: () => () => { throw new Error("unused injected adapter"); },
    createDemoAdapter: () => { throw new Error("unused injected adapter"); },
    buildProjectConfig, getListing: listing, emitEvent: (event) => envelopes.push(event), ...extra,
  });
  return { manager, opened, envelopes };
}

test("D1 shared registry: effective env/file/fallback sources, every secret masked, whitespace is unset", async () => {
  const temp = fixture();
  const secret = "D1-SECRET-NEVER-RENDER";
  fs.writeFileSync(temp.envPath, 'CODEX_API_KEY="   "\nANS_CODEX_MODEL="  "\nANTHROPIC_API_KEY=" "\n');
  try {
    const env = { OPENAI_API_KEY: secret, ANTHROPIC_AUTH_TOKEN: secret, ANS_PI_MODEL: "fileless-model", ANS_PI_BASE_URL: "https://example.test", ANTHROPIC_BASE_URL: "https://name:password@example.test/path" };
    const codex = await getRuntimeConfig("codex", { envPath: temp.envPath, env });
    assert.deepEqual(codex.missingKeys, ["ANS_CODEX_MODEL"]);
    assert.equal(codex.fields[0].source, "fallback");
    assert.equal(codex.fields[0].fallbackKey, "OPENAI_API_KEY");
    assert.equal(codex.fields[0].isSet, true);
    assert.equal(codex.fields[0].value, "");
    const claude = await getRuntimeConfig("claude", { envPath: temp.envPath, env });
    assert.deepEqual(claude.missingKeys, ["ANTHROPIC_API_KEY"]);
    assert.ok(!JSON.stringify(claude).includes("password"));
    const pi = await getRuntimeConfig("pi", { envPath: temp.envPath, env });
    assert.deepEqual(pi.missingKeys, []);
    assert.ok(pi.fields.every((field) => field.source === "environment" || field.source === "default"));
    assert.ok(!JSON.stringify([codex, claude, pi]).includes(secret));
    const environmentOnly = await getRuntimeConfig("codex", { envPath: path.join(temp.root, "absent.env"), env: { CODEX_API_KEY: "  ", OPENAI_API_KEY: secret, ANS_CODEX_MODEL: "\t" } });
    assert.equal(environmentOnly.fields[0].source, "fallback");
    assert.equal(environmentOnly.fields[0].value, "");
    assert.deepEqual(environmentOnly.missingKeys, ["ANS_CODEX_MODEL"]);
    const blankClaude = await getRuntimeConfig("claude", { envPath: path.join(temp.root, "absent.env"), env: { ANTHROPIC_API_KEY: " \t " } });
    assert.deepEqual(blankClaude.missingKeys, ["ANTHROPIC_API_KEY"]);
  } finally { temp.cleanup(); }
});

test("D1 configuration writes only selected string keys atomically, masks URL/userinfo failure and retains revision on failure", async () => {
  const temp = fixture();
  const original = "# retain\r\nUNKNOWN=original\r\nANS_PI_MODEL=pi-old\r\n";
  fs.writeFileSync(temp.envPath, original);
  try {
    const result = await saveRuntimeConfig({ runtime: "codex", updates: { CODEX_API_KEY: "sentinel", ANS_CODEX_MODEL: "model", ANS_PI_MODEL: "wrong", UNKNOWN: "wrong" } }, { envPath: temp.envPath });
    assert.equal(result.ok, true);
    assert.deepEqual(result.appliedKeys, ["CODEX_API_KEY", "ANS_CODEX_MODEL"]);
    assert.ok(fs.readFileSync(temp.envPath, "utf8").startsWith(original));
    assert.equal((await saveRuntimeConfig({ runtime: "codex", updates: { CODEX_API_KEY: 123 } }, { envPath: temp.envPath })).ok, false);
    const before = fs.readFileSync(temp.envPath, "utf8");
    const invalid = await saveRuntimeConfig({ runtime: "codex", updates: { ANS_CODEX_BASE_URL: "https://name:secret@example.test" } }, { envPath: temp.envPath, revision: 7 });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.revision, 7);
    assert.ok(!JSON.stringify(invalid).includes("secret"));
    assert.equal(fs.readFileSync(temp.envPath, "utf8"), before);
    const failure = await saveRuntimeConfig({ runtime: "claude", updates: { ANTHROPIC_API_KEY: "sentinel" } }, { envPath: temp.root, revision: 9 });
    assert.equal(failure.ok, false);
    assert.equal(failure.revision, 9);
    assert.deepEqual(fs.readdirSync(temp.root).sort(), ["fake.env", "角色卡"]);
  } finally { temp.cleanup(); }
});

test("D1 same role and project across engines and same role across projects keep distinct handles and exact input targets", async () => {
  const current = harness();
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "pi" });
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "codex" });
    await current.manager.open({ projectRoot: "/two", roleId: "A", runtime: "claude" });
    assert.equal(current.opened.length, 3);
    assert.equal((await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "pi" })).resumed, true);
    await current.manager.send("pinned", undefined, { projectRoot: "/one", roleId: "A", runtime: "codex" });
    assert.deepEqual(current.opened[0].sent, []);
    assert.deepEqual(current.opened[1].sent, ["pinned"]);
    assert.deepEqual(current.opened[2].sent, []);
    assert.equal(current.manager.liveSessionViews().length, 3);
    current.opened[1].stream.push({ kind: "message", summary: "codex only" });
    await until(() => current.envelopes.some((event) => event.event.summary === "codex only"));
    const event = current.envelopes.find((item) => item.event.summary === "codex only")!;
    assert.deepEqual({ root: event.projectRoot, runtime: event.runtime, role: event.roleId }, { root: "/one", runtime: "codex", role: "A" });
  } finally { await current.manager.stop(); }
});

test("D1 background dispatch, queued customer input and handback pin the source engine after selection switches", async () => {
  const current = harness();
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "su", runtime: "codex" });
    const source = current.opened[0];
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "claude" });
    const receipt = await source.input.dispatchTask!({ roleId: "A", task: "codex task" });
    assert.equal(receipt?.ok, true);
    await until(() => current.opened.some((entry) => entry.role === "A" && entry.runtime === "codex" && entry.sent.length > 0));
    const target = current.opened.find((entry) => entry.role === "A" && entry.runtime === "codex")!;
    assert.deepEqual(current.opened.find((entry) => entry.runtime === "claude")!.sent, []);
    const queued = await current.manager.send("queued codex", undefined, { projectRoot: "/one", roleId: "A", runtime: "codex" });
    assert.equal(queued.queued, true);
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "claude" });
    target.stream.push({ kind: "settled", summary: "done" });
    await until(() => target.sent.length === 2);
    assert.equal(target.sent[1], "queued codex");
    const handback: TaskHandback = { roleId: "A", taskId: "D1", status: "completed", summary: "actual", evidence: [], at: "2026-10-14T00:00:00Z" };
    target.stream.push({ kind: "handback", summary: "report", handback });
    await until(() => source.sent.length > 0);
    assert.ok(source.sent[0].includes("actual"));
    assert.ok(!current.opened.some((entry) => entry.role === "su" && entry.runtime === "claude"));
  } finally { await current.manager.stop(); }
});

for (const runtime of ["demo", "pi", "codex", "claude"] as const) {
  test(`D1 actual Pipeline/Service chooses ${runtime}, writes isolated replay and converts native context honestly`, async () => {
    const temp = fixture();
    const calls: RuntimeProviderOptions[] = [];
    let context: RuntimeContextSource = "fresh";
    const factory: RuntimeProviderFactory = (options) => {
      options.registerToolDisplayProfile?.({ credentials: [] });
      calls.push(options);
      return { async composeContext() { return { systemPrompt: "" }; }, async bindRole() {
        const events = queue<SessionEvent>();
        return { runtime, get contextSource() { return context; }, get contextWarning() { if (context === "recovered") return "native resume failed"; return undefined; }, async prompt(text) {
          context = "resumed";
          if (text === "two") context = "recovered";
          events.push({ kind: "message", summary: `${runtime}:${text}` });
          events.push({ kind: "settled", summary: "done", detail: { outcome: "completed" } });
        }, events: () => events.events(), async dispose() { events.close(); } };
      } };
    };
    const states: Parameters<NonNullable<SessionManagerDeps["emitRoleState"]>>[0][] = [];
    const desktop = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, envFilePath: temp.envPath, piConfigEnv: {}, emitRoleState: (state) => states.push(state), runtimeOptions: { providerFactories: { [runtime]: factory } } });
    try {
      const roles = await desktop.listProject({ projectRoot: temp.root });
      assert.equal(roles.roles.find((role) => role.roleId === "A")?.group, "运行时接入组");
      const opened = await desktop.openSession({ projectRoot: temp.root, roleId: "A", runtime });
      assert.equal(opened.contextSource, "fresh");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].runtime, runtime);
      assert.equal(calls[0].storage?.directory, path.join(temp.root, ".ans", "sessions", "A", runtime));
      assert.equal(fs.existsSync(path.join(temp.root, ".ans")), false);
      assert.equal((await desktop.sendSession({ text: "one" })).ok, true);
      await until(() => states.some((state) => state.contextSource === "recovered"));
      const history = await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime });
      assert.equal(history.error, null);
      assert.ok(history.rows.some((row) => row.kind === "user" && row.text === "one"));
      assert.ok(history.rows.some((row) => row.text === `${runtime}:one`));
      let otherRuntime: RuntimeKind = "codex";
      if (runtime === "codex") otherRuntime = "claude";
      const other = await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime: otherRuntime });
      assert.deepEqual(other.rows, []);
      context = "recovered";
      await desktop.openSession({ projectRoot: temp.root, roleId: "A", runtime });
      await desktop.sendSession({ text: "two" });
      assert.ok(states.some((state) => state.contextSource === "fresh" && state.contextWarning === "native resume failed"));
    } finally { await desktop.stopSession(); temp.cleanup(); }
  });
}

test("D1 profile success rebuilds same engine after busy old Pi finishes; ambient token remains old until safe; failure is unchanged", async () => {
  const temp = fixture();
  const env = { ANTHROPIC_AUTH_TOKEN: "old-token" };
  fs.writeFileSync(temp.envPath, "ANTHROPIC_AUTH_TOKEN=old-token\nANS_PI_MODEL=old-model\n");
  const opened: { stream: ReturnType<typeof queue<OrchestrationEvent>>; sent: string[]; token: string }[] = [];
  const desktop = createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {}, envFilePath: temp.envPath, piConfigEnv: env, listProjectFn: async (root) => listing(root), openRoleSessionFn: async () => {
    const stream = queue<OrchestrationEvent>(); const sent: string[] = [];
    opened.push({ stream, sent, token: env.ANTHROPIC_AUTH_TOKEN });
    return { async send(text) { sent.push(text); }, events: () => stream.events(), async dispose() { stream.close(); } };
  } });
  try {
    await desktop.listProject({ projectRoot: temp.root });
    await desktop.openSession({ projectRoot: temp.root, roleId: "A", runtime: "pi" });
    await desktop.sendSession({ text: "busy old" });
    const saved = await desktop.saveRuntimeConfig({ runtime: "pi", updates: { ANTHROPIC_AUTH_TOKEN: "new-token", ANS_PI_MODEL: "new-model" } });
    assert.equal(saved.revision, 1);
    assert.equal(saved.application, "after-active-turn");
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, "old-token");
    assert.equal((await desktop.sendSession({ text: "next profile" })).queued, true);
    const rejected = await desktop.saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_BASE_URL: "file:///invalid" } });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.revision, 1);
    opened[0].stream.push({ kind: "settled", summary: "old finished" });
    await until(() => opened.length === 2 && opened[1].sent.length > 0);
    assert.deepEqual(opened[0].sent, ["busy old"]);
    assert.deepEqual(opened[1].sent, ["next profile"]);
    assert.equal(opened[1].token, "new-token");
    assert.equal((await desktop.listLiveSessionViews())[0].profileRevision, 1);
  } finally { await desktop.stopSession(); temp.cleanup(); }
});

test("D1 original customer signal cancels pending confirm/choice and old yes cannot settle a new card", async () => {
  const requests: OperatorRequestPayload[] = [];
  const expired: OperatorExpiredPayload[] = [];
  const channel = createCustomerInputChannel({ operatorId: "test", presenter: (request) => requests.push(request), onExpired: (payload) => expired.push(payload) });
  const cases: CustomerInputRequest[] = [{ kind: "confirm", title: "old" }, { kind: "choice", title: "old", options: [{ id: "a", label: "A" }] }];
  for (const request of cases) {
    const controller = new AbortController();
    const promise = channel.customerInput(request, { roleId: "su", projectRoot: "/one", runtime: "codex" }, { signal: controller.signal, turnId: "old" });
    const id = requests.at(-1)!.id;
    controller.abort();
    assert.equal((await promise)?.outcome, "unavailable");
    assert.equal(channel.pendingCount(), 0);
    assert.equal(channel.respond({ id, decision: { kind: "confirm", confirmed: true } }).expired, true);
  }
  assert.equal(expired.length, 2);
  assert.ok(expired.every((event) => event.runtime === "codex" && event.projectRoot === "/one"));
  assert.ok(!JSON.stringify(requests).includes("signal"));
});

test("D1 shell terminal failure/timeout and dispose invalidate exact handle card, old allow is expired", async () => {
  const requests: { id: string }[] = [];
  const expired: OperatorExpiredPayload[] = [];
  const shell = createShellConfirmPresenter({ present: (request) => requests.push(request), onExpired: (event) => expired.push(event), cleanupAfterMs: 1000 });
  const channel = createDesktopOperatorChannel({ presenter: shell.presenter, operatorId: "test", timeoutMs: 1000 });
  const current = harness({ shellOperatorChannel: channel });
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "codex" });
    const first = current.opened[0];
    await current.manager.send("start");
    const pending = first.input.shellOperatorChannel!({ command: "example", argv: ["example"], cwd: "/one", toolCallId: "old" });
    await until(() => requests.length === 1);
    first.stream.push({ kind: "settled", summary: "native timeout", detail: { outcome: "timed_out" } });
    await until(() => shell.pendingCount() === 0);
    assert.notEqual((await pending)?.outcome, "allow");
    assert.equal(shell.respond({ id: requests[0].id, allow: true }).expired, true);
    assert.equal(expired[0].runtime, "codex");
    await current.manager.send("new turn");
    const secondPending = first.input.shellOperatorChannel!({ command: "second", argv: ["second"], cwd: "/one", toolCallId: "new" });
    await until(() => requests.length === 2);
    await current.manager.stop({ projectRoot: "/one", roleId: "A", runtime: "codex" });
    assert.notEqual((await secondPending)?.outcome, "allow");
    assert.equal(shell.respond({ id: requests[1].id, allow: true }).expired, true);
  } finally { await current.manager.stop(); shell.rejectAllPending("test cleanup"); }
});

test("D1 state debouncing and constrained bridges preserve project/runtime identity", () => {
  const received: { roleId: string; projectRoot: string; runtime: RuntimeKind }[] = [];
  const debouncer = createRoleStateDebouncer({ key: (item: typeof received[number]) => `${item.projectRoot}:${item.roleId}:${item.runtime}`, send: (item) => received.push(item) });
  debouncer.push({ roleId: "A", projectRoot: "/one", runtime: "pi" });
  debouncer.push({ roleId: "A", projectRoot: "/one", runtime: "codex" });
  debouncer.flush();
  assert.equal(received.length, 2);
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const preload = fs.readFileSync(path.join(repo, "app/preload.cjs"), "utf8");
  const main = fs.readFileSync(path.join(repo, "app/main.ts"), "utf8");
  for (const ipc of ["runtime-config:get", "runtime-config:save", "session:history-get", "session:operator-expired", "session:live-views"]) {
    assert.ok(preload.includes(ipc)); assert.ok(main.includes(ipc));
  }
  for (const source of ["interface.ts", "session.ts", "runtime-history.ts", "runtime-config.ts"]) {
    const code = fs.readFileSync(path.join(repo, "app/desktop", source), "utf8");
    assert.ok(!/from ["'][^"']*src\/provider\//.test(code), `${source} imports no Provider`);
    assert.ok(!code.includes("lastRuntime"), `${source} has no mutable global runtime routing`);
  }
});


test("D1 last busy Pi in another project releases queued profile rebuild without changing ambient mid-turn", async () => {
  let applyCount = 0;
  const current = harness({ prepareRuntimeProfile: async () => {
    if (current.manager.profileRevision("pi") > 0) assert.equal(current.manager.hasBusyRuntime("pi"), false, "ambient application only happens while all Pi turns are idle");
    applyCount += 1;
  } });
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "pi" });
    await current.manager.send("one old");
    await current.manager.open({ projectRoot: "/two", roleId: "A", runtime: "pi" });
    await current.manager.send("two old");
    current.manager.profileChanged("pi");
    assert.equal((await current.manager.send("one new", undefined, { projectRoot: "/one", roleId: "A", runtime: "pi" })).queued, true);
    current.opened[0].stream.push({ kind: "settled", summary: "one ended" });
    await until(() => current.envelopes.some((event) => event.projectRoot === "/one" && event.event.summary === "one ended"));
    assert.equal(current.opened.length, 2, "other project Pi still busy, no rebuild/application");
    assert.equal(applyCount, 2, "only initial creations so far");
    current.opened[1].stream.push({ kind: "settled", summary: "two ended" });
    await until(() => current.opened.length === 3 && current.opened[2].sent.length > 0);
    assert.equal(current.opened[2].root, "/one");
    assert.equal(current.opened[2].runtime, "pi");
    assert.deepEqual(current.opened[2].sent, ["one new"]);
    assert.equal(applyCount, 3);
  } finally { await current.manager.stop(); }
});

test("D1 confirmation bridge keeps original signal identity and an old disposed stream cannot cancel a new handle card", async () => {
  const requests: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (request) => requests.push(request), operatorId: "D1" });
  const original = new AbortController();
  const current = harness({ customerInput: (request, context, metadata) => {
    assert.equal(metadata?.signal, original.signal);
    return channel.customerInput(request, context, metadata);
  } });
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "su", runtime: "claude" });
    const first = current.opened[0];
    const pending = first.input.customerInput!({ kind: "confirm", title: "old" }, { signal: original.signal, runtime: "claude", turnId: "original", toolCallId: "actual-call" });
    assert.equal(requests[0].runtime, "claude");
    assert.equal(requests[0].turnId, "original");
    assert.equal(requests[0].toolCallId, "actual-call");
    assert.notEqual(requests[0].id, requests[0].toolCallId);
    original.abort();
    assert.equal((await pending)?.outcome, "unavailable");
    assert.equal(channel.respond({ id: requests[0].id, decision: { kind: "confirm", confirmed: true } }).expired, true);
    await current.manager.stop({ projectRoot: "/one", roleId: "su", runtime: "claude" });
    await current.manager.open({ projectRoot: "/one", roleId: "su", runtime: "claude" });
    first.stream.push({ kind: "settled", summary: "late old" });
    await current.manager.send("new active");
    assert.deepEqual(current.opened[1].sent, ["new active"]);
    assert.ok(!current.envelopes.some((event) => event.event.summary === "late old"));
  } finally { await current.manager.stop(); channel.rejectAllPending("cleanup"); }
});


test("D1 old Pi JSONL is a display-only fallback and never becomes Codex/Claude history or native restore proof", async () => {
  const temp = fixture();
  const directory = path.join(temp.root, ".ans", "sessions", "A");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "legacy.jsonl"), JSON.stringify({ type: "session", id: "legacy", version: 3 }) + "\n" + JSON.stringify({ type: "message", message: { role: "user", content: "legacy text" } }) + "\n");
  try {
    assert.ok((await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime: "pi" })).rows.some((row) => row.text === "legacy text"));
    for (const runtime of ["codex", "claude"] as const) assert.deepEqual((await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime })).rows, []);
  } finally { temp.cleanup(); }
});

test("D1R ANS history preserves authoritative turn/event identity, independent same text and delta order", async () => {
  const temp = fixture();
  const directory = path.join(temp.root, ".ans", "sessions", "A", "claude", "ans");
  fs.mkdirSync(directory, { recursive: true });
  const entries = [
    { kind: "user", text: "same input", at: "2026-10-14T00:00:01Z", turnId: "first" },
    { kind: "event", at: "2026-10-14T00:00:02Z", turnId: "first", event: { kind: "message", summary: "same reply", turnId: "provider-other", detail: { type: "assistant_delta" } } },
    { kind: "event", at: "2026-10-14T00:00:03Z", turnId: "first", event: { kind: "message", summary: " tail", turnId: "first", detail: { type: "assistant_delta" } } },
    { kind: "event", at: "2026-10-14T00:00:04Z", turnId: "first", event: { kind: "tool_call", summary: "write", turnId: "provider-other", detail: { toolName: "write_file", toolCallId: "call", args: { path: "src/a.ts" } } } },
    { kind: "event", at: "2026-10-14T00:00:05Z", turnId: "first", event: { kind: "accepted", summary: "written", turnId: "provider-other", detail: { toolName: "write_file", toolCallId: "call", ok: true } } },
    { kind: "user", text: "same input", at: "2026-10-14T00:00:06Z", turnId: "second" },
    { kind: "event", at: "2026-10-14T00:00:07Z", event: { kind: "message", summary: "same reply", turnId: "second", detail: { type: "assistant_delta" } } },
    { kind: "event", at: "2026-10-14T00:00:08Z", event: { kind: "denied", summary: "blocked", turnId: "second", detail: { toolName: "write_file", toolCallId: "other", ok: false } } },
    { kind: "user", text: "without ID", at: "2026-10-14T00:00:09Z" },
  ];
  fs.writeFileSync(path.join(directory, "replay.jsonl"), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  try {
    const history = await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime: "claude" });
    assert.equal(history.error, null);
    assert.equal(history.rows.length, entries.length, "mapper preserves every original event, including consecutive delta fragments");
    assert.deepEqual(history.rows.map((row) => row.text), ["same input", "same reply", " tail", "write", "written", "same input", "same reply", "blocked", "without ID"]);
    assert.deepEqual(history.rows.map((row) => row.turnId), ["first", "first", "first", "first", "first", "second", "second", "second", undefined]);
    assert.deepEqual(history.rows.map((row) => row.eventKind), [undefined, "message", "message", "tool_call", "accepted", undefined, "message", "denied", undefined]);
    for (const row of history.rows.filter((row) => row.kind === "user")) assert.equal(Object.hasOwn(row, "eventKind"), false);
    for (const row of history.rows.filter((row) => row.activity)) assert.equal(row.activity!.turnId, row.turnId, "activity and top-level ID have the same authoritative precedence");
    assert.equal(history.rows[4].activity?.target, "src/a.ts", "existing target inheritance remains intact");
    assert.equal(Object.hasOwn(history.rows.at(-1)!, "turnId"), false, "absent authoritative ID remains absent");
  } finally { temp.cleanup(); }
});

test("D1R legacy Pi rows keep optional turn/event metadata absent", async () => {
  const temp = fixture();
  const directory = path.join(temp.root, ".ans", "sessions", "A");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "legacy.jsonl"), [
    { type: "session", id: "legacy", version: 3 },
    { type: "message", message: { role: "user", content: "legacy user" } },
    { type: "message", message: { role: "assistant", content: [{ type: "text", text: "legacy assistant" }] } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  try {
    const history = await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime: "pi" });
    assert.equal(history.error, null);
    assert.deepEqual(history.rows.map((row) => row.text), ["legacy user", "legacy assistant"]);
    for (const row of history.rows) {
      assert.equal(Object.hasOwn(row, "turnId"), false);
      assert.equal(Object.hasOwn(row, "eventKind"), false);
    }
  } finally { temp.cleanup(); }
});

test("D1R2 direct and queued identical inputs retain original client ID through delayed old settled", async () => {
  const current = harness();
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "codex" });
    const source = current.opened[0];
    source.handle.send = async (text, opts) => {
      source.sent.push(text);
      const turns = ["first-turn", "second-turn", "third-turn"];
      opts?.onTurnStarted?.({ turnId: turns[source.sent.length - 1], roleId: "A", runtime: "codex" });
    };
    await current.manager.send("same", undefined, undefined, { clientMessageId: "first-client" });
    assert.equal((await current.manager.send("same", undefined, undefined, { clientMessageId: "second-client" })).queued, true);
    source.stream.push({ kind: "message", summary: "first event", roleId: "A", runtime: "codex", turnId: "first-turn" });
    source.stream.push({ kind: "settled", summary: "first settled", roleId: "A", runtime: "codex", turnId: "first-turn" });
    await until(() => source.sent.length === 2);
    source.stream.push({ kind: "message", summary: "second event", roleId: "A", runtime: "codex", turnId: "second-turn" });
    source.stream.push({ kind: "settled", summary: "delayed first settled", roleId: "A", runtime: "codex", turnId: "first-turn" });
    await until(() => current.envelopes.some((event) => event.event.summary === "delayed first settled"));
    const eventBySummary = (summary: string) => current.envelopes.find((event) => event.event.summary === summary)!;
    assert.equal(eventBySummary("first event").clientMessageId, "first-client");
    assert.equal(eventBySummary("first settled").clientMessageId, "first-client");
    assert.equal(eventBySummary("second event").clientMessageId, "second-client");
    assert.equal(eventBySummary("delayed first settled").clientMessageId, "first-client");
    assert.equal((await current.manager.send("third", undefined, undefined, { clientMessageId: "third-client" })).queued, true, "old settled must not clear second turn busy");
    source.stream.push({ kind: "settled", summary: "second settled", roleId: "A", runtime: "codex", turnId: "second-turn" });
    await until(() => source.sent.length === 3);
    source.stream.push({ kind: "message", summary: "third event", roleId: "A", runtime: "codex", turnId: "third-turn" });
    await until(() => current.envelopes.some((event) => event.event.summary === "third event"));
    assert.equal(eventBySummary("third event").clientMessageId, "third-client");
  } finally { await current.manager.stop(); }
});

test("D1R2 anonymous dispatch occupies its own origin and unknown/legacy events cannot borrow the next client", async () => {
  const current = harness({ openRoleSession: async (input) => {
    const stream = queue<OrchestrationEvent>();
    const sent: string[] = [];
    const handle: RoleSessionHandle = {
      runtime: input.runtime,
      async send(text, opts) {
        sent.push(text);
        let turnId = "anonymous-turn";
        if (sent.length === 2) turnId = "client-turn";
        opts?.onTurnStarted?.({ turnId, roleId: input.roleId, runtime: input.runtime! });
      }, events: () => stream.events(), async dispose() { stream.close(); },
    };
    current.opened.push({ root: input.project.projectRoot, role: input.roleId, runtime: input.runtime!, stream, sent, input, handle });
    return handle;
  } });
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "su", runtime: "codex" });
    await current.opened[0].input.dispatchTask!({ roleId: "A", task: "anonymous" });
    await until(() => current.opened.some((item) => item.role === "A" && item.sent.length === 1));
    const source = current.opened.find((item) => item.role === "A")!;
    const target = { projectRoot: "/one", roleId: "A", runtime: "codex" as const };
    assert.equal((await current.manager.send("client", undefined, target, { clientMessageId: "client" })).queued, true);
    source.stream.push({ kind: "message", summary: "anonymous event", roleId: "A", runtime: "codex", turnId: "anonymous-turn" });
    source.stream.push({ kind: "settled", summary: "anonymous settled", roleId: "A", runtime: "codex", turnId: "anonymous-turn" });
    await until(() => source.sent.length === 2);
    source.stream.push({ kind: "message", summary: "foreign unknown", roleId: "B", runtime: "codex", turnId: "unknown" });
    source.stream.push({ kind: "message", summary: "legacy missing ID" });
    source.stream.push({ kind: "message", summary: "client event", roleId: "A", runtime: "codex", turnId: "client-turn" });
    source.stream.push({ kind: "message", summary: "unclaimed unknown", roleId: "A", runtime: "codex", turnId: "other-unknown" });
    await until(() => current.envelopes.some((event) => event.event.summary === "unclaimed unknown"));
    for (const summary of ["anonymous event", "anonymous settled", "foreign unknown", "legacy missing ID", "unclaimed unknown"]) {
      assert.equal(Object.hasOwn(current.envelopes.find((event) => event.event.summary === summary)!, "clientMessageId"), false, summary);
    }
    assert.equal(current.envelopes.find((event) => event.event.summary === "client event")?.clientMessageId, "client");
  } finally { await current.manager.stop(); }
});

test("D1R2 actual Pipeline/Service returns original client IDs and real distinct turn IDs for same text", async () => {
  const temp = fixture();
  const events: SessionEventEnvelope[] = [];
  const releases: (() => void)[] = [];
  const factory: RuntimeProviderFactory = (options) => (options.registerToolDisplayProfile?.({ credentials: [] }), {
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole(role) {
      let promptCount = 0;
      const stream = queue<SessionEvent>();
      return {
        runtime: options.runtime,
        async prompt() {
          promptCount += 1;
          stream.push({ kind: "message", summary: `${role.id}:start ${promptCount}` });
          if (role.id === "A") await new Promise<void>((resolve) => releases.push(resolve));
          stream.push({ kind: "settled", summary: "done", detail: { outcome: "completed" } });
        }, events: () => stream.events(), async dispose() { releases.forEach((release) => release()); stream.close(); },
      };
    },
  });
  const desktop = createDesktopInterface({ pickDirectory: async () => null, emitEvent: (event) => events.push(event), envFilePath: temp.envPath, piConfigEnv: {}, runtimeOptions: { providerFactories: { claude: factory } } });
  try {
    await desktop.listProject({ projectRoot: temp.root });
    await desktop.openSession({ projectRoot: temp.root, roleId: "A", runtime: "claude" });
    const first = desktop.sendSession({ text: "same", metadata: { clientMessageId: "actual-first" } });
    await until(() => events.some((event) => event.event.summary === "A:start 1"));
    assert.equal((await desktop.sendSession({ text: "same", metadata: { clientMessageId: "actual-second" } })).queued, true);
    releases[0](); await first;
    await until(() => events.some((event) => event.event.summary === "A:start 2"));
    const firstEvent = events.find((event) => event.event.summary === "A:start 1")!;
    const secondEvent = events.find((event) => event.event.summary === "A:start 2")!;
    assert.equal(firstEvent.clientMessageId, "actual-first");
    assert.equal(secondEvent.clientMessageId, "actual-second");
    assert.ok(firstEvent.event.kind !== "handback" && firstEvent.event.turnId);
    assert.ok(secondEvent.event.kind !== "handback" && secondEvent.event.turnId);
    assert.notEqual(firstEvent.event.turnId, secondEvent.event.turnId);
    releases[1]();
    await until(() => events.filter((event) => event.roleId === "A" && event.event.kind === "settled").length === 2);
    assert.deepEqual(events.filter((event) => event.roleId === "A" && event.event.kind === "settled").map((event) => event.clientMessageId), ["actual-first", "actual-second"]);
  } finally { releases.forEach((release) => release()); await desktop.stopSession(); temp.cleanup(); }
});

test("D1R2 actual ack preserves a failed delayed terminal and the next aborted original client", async () => {
  const temp = fixture();
  const envelopes: SessionEventEnvelope[] = [];
  let releaseTerminal!: () => void;
  const terminalGate = new Promise<void>((resolve) => { releaseTerminal = resolve; });
  let terminalPaused = false;
  let releaseNative: (() => void) | undefined;
  const provider: RuntimeProviderFactory = (options) => (options.registerToolDisplayProfile?.({ credentials: [] }), {
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole(role) {
      const stream = queue<SessionEvent>();
      let calls = 0;
      return { runtime: options.runtime,
        async prompt() {
          calls += 1;
          if (role.id === "A" && calls === 1) throw new Error("fake first native failure");
          stream.push({ kind: "message", summary: `${role.id}:native ${calls}` });
          if (role.id === "A" && calls === 2) await new Promise<void>((resolve) => { releaseNative = resolve; });
          stream.push({ kind: "settled", summary: "native ended", detail: { outcome: "completed" } });
        }, events: () => stream.events(), async abort() { releaseNative?.(); }, async dispose() { releaseNative?.(); stream.close(); },
      };
    },
  });
  const desktop = createDesktopInterface({ pickDirectory: async () => null, emitEvent: (event) => envelopes.push(event), envFilePath: temp.envPath, piConfigEnv: {}, runtimeOptions: { providerFactories: { codex: provider } },
    openRoleSessionFn: async (input, deps) => {
      const actual = await openRoleSession(input, deps);
      if (input.roleId !== "A") return actual;
      return { runtime: actual.runtime, send: (text, opts) => actual.send(text, opts), abort: () => actual.abort!(), async dispose() { releaseTerminal(); await actual.dispose(); },
        async *events() {
          for await (const event of actual.events()) {
            if (event.kind === "settled" && !terminalPaused) { terminalPaused = true; await terminalGate; }
            yield event;
          }
        },
      };
    },
  });
  try {
    await desktop.listProject({ projectRoot: temp.root });
    await desktop.openSession({ projectRoot: temp.root, roleId: "A", runtime: "codex" });
    const failed = await desktop.sendSession({ text: "same", metadata: { clientMessageId: "failed-original" } });
    assert.equal(failed.ok, false);
    await until(() => terminalPaused);
    const next = desktop.sendSession({ text: "same", metadata: { clientMessageId: "aborted-original" } });
    await until(() => releaseNative !== undefined);
    releaseTerminal();
    await until(() => envelopes.some((event) => event.event.kind === "settled" && event.clientMessageId === "failed-original"));
    assert.equal((await desktop.sendSession({ text: "after abort", metadata: { clientMessageId: "after-original" } })).queued, true, "late failed terminal cannot clear a newer turn busy");
    await desktop.abortSession({ projectRoot: temp.root, roleId: "A", runtime: "codex" });
    assert.equal((await next).ok, false);
    await until(() => envelopes.some((event) => event.event.kind === "settled" && event.clientMessageId === "aborted-original"));
    const failedTerminal = envelopes.find((event) => event.event.kind === "settled" && event.clientMessageId === "failed-original")!;
    const abortedTerminal = envelopes.find((event) => event.event.kind === "settled" && event.clientMessageId === "aborted-original")!;
    assert.equal((failedTerminal.event as SessionEvent).detail && ((failedTerminal.event as SessionEvent).detail as { outcome: string }).outcome, "failed");
    assert.equal(((abortedTerminal.event as SessionEvent).detail as { outcome: string }).outcome, "aborted");
    assert.notEqual((failedTerminal.event as SessionEvent).turnId, (abortedTerminal.event as SessionEvent).turnId);
  } finally { releaseTerminal(); releaseNative?.(); await desktop.stopSession(); temp.cleanup(); }
});

test("D1R2 no-ack failure and legacy/unknown events cannot lend an old client ID to a later acknowledged call", async () => {
  const current = harness();
  try {
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "codex" });
    const source = current.opened[0];
    let calls = 0;
    source.handle.send = async (text, opts) => {
      calls += 1;
      if (calls === 1) throw new Error("rejected before a turn exists");
      source.sent.push(text);
      opts?.onTurnStarted?.({ turnId: "next-real-turn", roleId: "A", runtime: "codex" });
    };
    assert.equal((await current.manager.send("same", undefined, undefined, { clientMessageId: "never-started" })).ok, false);
    await current.manager.send("same", undefined, undefined, { clientMessageId: "next-original" });
    source.stream.push({ kind: "message", summary: "unknown old", roleId: "A", runtime: "codex", turnId: "never-started-turn" });
    source.stream.push({ kind: "message", summary: "no turn" });
    source.stream.push({ kind: "message", summary: "exact next", roleId: "A", runtime: "codex", turnId: "next-real-turn" });
    await until(() => current.envelopes.some((event) => event.event.summary === "exact next"));
    assert.equal(current.envelopes.find((event) => event.event.summary === "exact next")?.clientMessageId, "next-original");
    for (const summary of ["unknown old", "no turn"]) assert.equal(Object.hasOwn(current.envelopes.find((event) => event.event.summary === summary)!, "clientMessageId"), false);
    await current.manager.stop();
    await current.manager.open({ projectRoot: "/one", roleId: "A", runtime: "codex" });
    const legacy = current.opened.at(-1)!;
    await current.manager.send("legacy", undefined, undefined, { clientMessageId: "unsupported-original" });
    legacy.stream.push({ kind: "message", summary: "legacy with ID but no ack", roleId: "A", runtime: "codex", turnId: "unsupported-turn" });
    legacy.stream.push({ kind: "settled", summary: "legacy without turn" });
    await until(() => current.envelopes.some((event) => event.event.summary === "legacy without turn"));
    for (const summary of ["legacy with ID but no ack", "legacy without turn"]) assert.equal(Object.hasOwn(current.envelopes.find((event) => event.event.summary === summary)!, "clientMessageId"), false);
  } finally { await current.manager.stop(); }
});


test("typed prompt input history joins only actual same-turn input sources and preserves legacy facts", async () => {
  const temp = fixture();
  const directory = path.join(temp.root, ".ans", "sessions", "A", "claude", "ans");
  fs.mkdirSync(directory, { recursive: true });
  const user = (turnId: string, text: string, at = "user-time") => ({ kind: "user", turnId, text, at });
  const echo = (turnId: string | undefined, text: string, roleId = "A") => ({ kind: "event", turnId, at: "echo-time", event: { kind: "message", summary: "readable echo", turnId, roleId, runtime: "claude", detail: { source: "prompt-input", text, imageCount: 2 } } });
  const entries = [user("first", "original input"), echo("first", "original input"), echo("second", "same input"), user("second", "same input"),
    user("third", "same input"), echo("third", "same input"), echo("first", "original input"),
    { kind: "event", at: "legacy", turnId: "first", event: { kind: "message", summary: "用户指令：original input" } },
    echo(undefined, "unknown"), user("", "unknown"), echo("foreign", "foreign input", "B")];
  const replay = path.join(directory, "replay.jsonl");
  const raw = entries.map(entry => JSON.stringify(entry)).join("\n") + "\n";
  fs.writeFileSync(replay, raw);
  try {
    const history = await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime: "claude" });
    assert.equal(history.error, null);
    assert.equal(history.rows.length, 7);
    assert.deepEqual(history.rows.slice(0, 3).map(row => [row.kind, row.text, row.at, row.turnId, row.input?.imageCount]), [
      ["user", "original input", "user-time", "first", 2], ["user", "same input", "user-time", "second", 2], ["user", "same input", "user-time", "third", 2]]);
    assert.equal(history.rows[3].kind, "assistant", "unknown legacy prefix stays an assistant fact");
    assert.equal(history.rows[4].kind, "user", "typed input without turn remains independently visible");
    assert.equal(history.rows[5].kind, "user", "unknown user is never guessed equal");
    assert.equal(history.rows[6].kind, "assistant", "foreign scope marker is not trusted");
    assert.equal(fs.readFileSync(replay, "utf8"), raw, "display mapping never rewrites audit history");
  } finally { temp.cleanup(); }
});

test("operator payload preserves original call identity and leaves absent legacy IDs absent", async () => {
  const requests: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ operatorId: "test", presenter: payload => requests.push(payload) });
  const pending = channel.customerInput({ kind: "confirm", title: "same title" }, { roleId: "A", projectRoot: "/one", runtime: "claude" });
  assert.equal(Object.hasOwn(requests[0], "turnId"), false);
  assert.equal(Object.hasOwn(requests[0], "toolCallId"), false);
  assert.equal(channel.respond({ id: requests[0].id, decision: { kind: "confirm", confirmed: true } }).ok, true);
  assert.equal((await pending)?.outcome, "answered");
  channel.rejectAllPending("cleanup");
});


test("history preserves canonical start/blocked/result phases for the same failed tool call", async () => {
  const temp = fixture();
  const directory = path.join(temp.root, ".ans", "sessions", "A", "pi", "ans");
  fs.mkdirSync(directory, { recursive: true });
  const entries = [
    { phase: "start", kind: "tool_call", ok: undefined },
    { phase: "blocked", kind: "denied", ok: false },
    { phase: "result", kind: "denied", ok: false },
    { phase: undefined, kind: "denied", ok: false },
    { phase: undefined, kind: "accepted", ok: true },
  ].map(({ phase, kind, ok }) => ({ kind: "event", turnId: "actual-turn", at: "same-time", event: { kind, summary: "same summary", detail: { toolName: "request_confirmation", toolCallId: "actual-call", phase, ok, args: { title: "same" } } } }));
  fs.writeFileSync(path.join(directory, "replay.jsonl"), entries.map(entry => JSON.stringify(entry)).join("\n") + "\n");
  try {
    const history = await getSessionHistory({ projectRoot: temp.root, roleId: "A", runtime: "pi" });
    assert.equal(history.rows.length, 5, "mapper retains blocked and SDK failure facts independently");
    assert.deepEqual(history.rows.map(row => row.activity?.phase), ["start", "blocked", "result", "blocked", "result"]);
    assert.deepEqual(history.rows.map(row => row.activity?.status), ["call", "failed", "failed", "failed", "completed"]);
    assert.ok(history.rows.every(row => row.activity?.turnId === "actual-turn" && row.activity.toolCallId === "actual-call"));
    assert.equal(history.rows[0].anchor, "request", "canonical start preserves request anchor");
  } finally { temp.cleanup(); }
});

test('A native-only Pi fallback stays readable through pure protected projection without raw anchor or template facts',async()=>{
 const temp=fixture();const key='ANS_WINDOW_LEGACY_FAKE_'+Date.now();const secret='legacy-fixture-secret-unique';process.env[key]=secret;
 const dir=path.join(temp.root,'.ans','sessions','A');fs.mkdirSync(dir,{recursive:true});
 const title='request '+secret;const file=path.join(dir,'legacy.jsonl');
 const raw=[{type:'session',id:'legacy'},
  {type:'message',timestamp:'2026-10-15T01:00:00Z',message:{role:'user',content:'user '+secret}},
  {type:'message',timestamp:'2026-10-15T01:00:01Z',message:{role:'assistant',content:[{type:'text',text:'answer '+secret},{type:'toolCall',id:'native-call',name:'request_confirmation',arguments:{title}}]}},
  {type:'message',timestamp:'2026-10-15T01:00:02Z',message:{role:'toolResult',toolCallId:'native-call',toolName:'request_confirmation',isError:true,content:[{type:'text',text:'failure '+secret}]}},
  {type:'message',timestamp:'2026-10-15T01:00:03Z',message:{role:'toolResult',toolCallId:'template-call',toolName:'run_shell',isError:false,content:[{type:'text',text:'run_shell 已执行：pretend command（exit 9）'}]}}
 ].map(entry=>JSON.stringify(entry)).join('\n')+'\n';fs.writeFileSync(file,raw);
 try{
  const history=await getSessionHistory({projectRoot:temp.root,roleId:'A',runtime:'pi'},{credentialEnvNames:[key]});
  assert.equal(history.error,null);assert.equal(history.rows.length,5);assert.equal(JSON.stringify(history).includes(secret),false);
  assert.ok(history.rows[0].text.includes('[REDACTED]'));
  const call=history.rows.find(r=>r.anchor==='request')!,result=history.rows.find(r=>r.anchor==='conclusion')!;
  assert.match(call.anchorKey!,/^legacy-anchor-v1:[0-9a-f]{64}$/);assert.equal(call.anchorKey,result.anchorKey);assert.equal(call.requestId,'native-call');assert.equal(result.requestId,'native-call');
  assert.equal(Object.hasOwn(call,'turnId'),false);assert.equal(Object.hasOwn(result,'turnId'),false,'native call ID never fabricates a Core turn');
  const template=history.rows.at(-1)!;assert.equal(template.activity?.target,'');assert.equal(template.activity?.display?.process,undefined,'old template text is readable but never becomes execution facts');
  assert.equal(fs.readFileSync(file,'utf8'),raw);
 }finally{delete process.env[key];temp.cleanup();}
});

test('A legacy provenance and authoritative metadata omissions survive the protected Window mapping',async()=>{
 const temp=fixture();const key='ANS_WINDOW_METADATA_FAKE_'+Date.now();const protectedTimestamp='2026-10-15T01:00:00.000Z';process.env[key]=protectedTimestamp;
 const dir=path.join(temp.root,'.ans','sessions','A');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'legacy-provenance.jsonl');
 const raw=[{type:'session',id:'provenance'},
 {type:'message',timestamp:protectedTimestamp,message:{role:'user',content:'ordinary text with protected timestamp metadata'}},
 {type:'message',timestamp:'2026-10-15T01:00:01Z',message:{role:'assistant',content:[{type:'toolCall',id:'read-call',name:'read_file',arguments:{path:'docs/kept.md'}}]}},
 {type:'message',timestamp:'2026-10-15T01:00:02Z',message:{role:'toolResult',toolCallId:'read-call',toolName:'read_file',isError:false,content:[{type:'text',text:'old readable result'}]}},
 {type:'message',timestamp:'2026-10-15T01:00:03Z',message:{role:'toolResult',toolCallId:'template-only',toolName:'run_shell',isError:false,content:[{type:'text',text:'run_shell 已执行：template command（exit 7）'}]}},
 {type:'message',timestamp:'2026-10-15T01:00:04Z',message:{role:'assistant',content:[{type:'toolCall',id:'x'.repeat(70000),name:'read_file',arguments:{path:'docs/oversize.md'}}]}},
 ].map(entry=>JSON.stringify(entry)).join('\n')+'\n';fs.writeFileSync(file,raw);
 try{
  const view=await getSessionHistory({projectRoot:temp.root,roleId:'A',runtime:'pi'},{credentialEnvNames:[key]});assert.equal(view.error,null);
  const result=view.rows.find(row=>row.activity?.toolName==='read_file'&&row.activity.phase==='result')!;
  assert.equal(result.activity?.target,'docs/kept.md');assert.equal(result.legacyTargetSource,'same-call');assert.equal(result.legacyStatusSource,'native-result');
  const shell=view.rows.find(row=>row.activity?.toolName==='run_shell')!;assert.equal(shell.activity?.status,'failed');assert.equal(shell.legacyStatusSource,'legacy-classifier');assert.equal(shell.legacyTargetSource,undefined);assert.equal(shell.activity?.target,'');assert.equal(shell.activity?.display?.process,undefined);
  assert.ok(view.rows.some(row=>row.metadataOmissions?.includes('timestamp')),'the projector—not Window inference—reports omitted protected timestamps');
  assert.ok(view.rows.some(row=>row.metadataOmissions?.includes('oversize-identity')),'oversized native identity diagnostics preserve the public omission flag');
  assert.equal(JSON.stringify(view).includes(protectedTimestamp),false);assert.equal(fs.readFileSync(file,'utf8'),raw);
 }finally{delete process.env[key];temp.cleanup();}
});

test('stop send facts use the original ACK/input/terminal, never the rejection text, and keep the current session',async()=>{
 for(const outcome of ['aborted','failed','timed_out'] as const){const current=harness();try{await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'});const source=current.opened[0];let prompts=0;
 source.handle.send=async(_text,opts)=>{prompts++;const turnId='fact-'+outcome;opts?.onTurnStarted?.({turnId,roleId:'A',runtime:'codex'});source.stream.push({kind:'message',summary:'not used for classification',roleId:'A',runtime:'codex',turnId,detail:{source:'prompt-input',text:'actual accepted input'}});source.stream.push({kind:'settled',summary:'also not used',roleId:'A',runtime:'codex',turnId,detail:{outcome}});await until(()=>current.envelopes.some(e=>e.event.kind==='settled'&&e.event.turnId===turnId));throw new Error('same opaque failure for every outcome');};
 const result=await current.manager.send('input',undefined,undefined,{clientMessageId:'client'});assert.equal(result.ok,false);assert.equal(result.turnId,'fact-'+outcome);assert.equal(result.clientMessageId,'client');assert.equal(result.inputAccepted,true);assert.equal(result.outcome,outcome);assert.equal(result.sessionCurrent,true);assert.equal(prompts,1);
 assert.equal((await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'})).resumed,true,'a rejected turn does not dispose the actual handle');
 }finally{await current.manager.stop();}}
});

test('send rejection before public events remains unknown; later same-client different turns do not borrow outcomes',async()=>{
 const current=harness();try{await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'});const source=current.opened[0];let calls=0;
 source.handle.send=async(_text,opts)=>{calls++;opts?.onTurnStarted?.({turnId:'turn-'+calls,roleId:'A',runtime:'codex'});throw new Error('opaque');};
 const first=await current.manager.send('same',undefined,undefined,{clientMessageId:'reused-client'});assert.equal(first.turnId,'turn-1');assert.equal(first.sessionCurrent,true);assert.equal(Object.hasOwn(first,'inputAccepted'),false);assert.equal(Object.hasOwn(first,'outcome'),false,'no waiting or guessing after early rejection');
 const second=await current.manager.send('same',undefined,undefined,{clientMessageId:'reused-client'});assert.equal(second.turnId,'turn-2');
 source.stream.push({kind:'message',summary:'old accepted',roleId:'A',runtime:'codex',turnId:'turn-1',detail:{source:'prompt-input',text:'same'}});source.stream.push({kind:'settled',summary:'late old abort',roleId:'A',runtime:'codex',turnId:'turn-1',detail:{outcome:'aborted'}});
 source.stream.push({kind:'settled',summary:'new timeout',roleId:'A',runtime:'codex',turnId:'turn-2',detail:{outcome:'timed_out'}});
 await until(()=>current.envelopes.some(e=>e.event.summary==='new timeout'));assert.equal(Object.hasOwn(first,'outcome'),false);assert.equal(Object.hasOwn(second,'outcome'),false,'returned snapshots are not mutated by late events');
 const terminals=current.envelopes.filter(e=>e.event.kind==='settled');assert.deepEqual(terminals.map(e=>[e.clientMessageId,e.event.kind!=='handback'&&e.event.turnId,(e.event as SessionEvent).detail]),[['reused-client','turn-1',{outcome:'aborted'}],['reused-client','turn-2',{outcome:'timed_out'}]]);assert.equal(calls,2);
 }finally{await current.manager.stop();}
});

test('no ACK and mismatched/unknown terminal metadata cannot manufacture accepted input or a stop outcome',async()=>{
 const current=harness();try{await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'});const source=current.opened[0];
 source.handle.send=async()=>{source.stream.push({kind:'message',summary:'本轮已中止 用户指令：looks accepted',turnId:'unacknowledged',detail:{source:'prompt-input',text:'text'}});source.stream.push({kind:'settled',summary:'本轮已中止',turnId:'unacknowledged',detail:{outcome:'aborted'}});await until(()=>current.envelopes.some(e=>e.event.kind==='settled'));throw new Error('AbortError 本轮已中止');};
 const result=await current.manager.send('text',undefined,undefined,{clientMessageId:'not-started'});assert.equal(result.sessionCurrent,true);for(const field of ['turnId','inputAccepted','outcome'])assert.equal(Object.hasOwn(result,field),false,field);
 }finally{await current.manager.stop();}
});

test('send result reports the original handle is no longer current after replacement while its turn rejects',async()=>{
 const current=harness();try{await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'});const source=current.opened[0];let release!:()=>void;
 source.handle.send=async(_text,opts)=>{opts?.onTurnStarted?.({turnId:'old-handle-turn',roleId:'A',runtime:'codex'});await new Promise<void>(r=>{release=r});throw new Error('opaque old failure');};
 const pending=current.manager.send('text',undefined,undefined,{clientMessageId:'old'});await until(()=>!!release);await current.manager.stop({projectRoot:'/one',roleId:'A',runtime:'codex'});await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'});release();const result=await pending;assert.equal(result.turnId,'old-handle-turn');assert.equal(result.sessionCurrent,false);assert.equal(Object.hasOwn(result,'outcome'),false);
 }finally{await current.manager.stop();}
});

test('actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt',async()=>{
 const temp=fixture();const envelopes:SessionEventEnvelope[]=[];const requests:OperatorRequestPayload[]=[];
 const channel=createCustomerInputChannel({operatorId:'stop-test',presenter:request=>requests.push(request)});let prompts=0,firstFinished=false;
 const provider:RuntimeProviderFactory=options=>{options.registerToolDisplayProfile?.({credentials:[]});return {async composeContext(){return {systemPrompt:''}},async bindRole(role){const stream=queue<SessionEvent>();return {runtime:options.runtime,async prompt(){prompts++;const turnId=options.currentTurnId();try{if(prompts===1){const choice=options.tools.find(tool=>tool.name==='request_choice')!;assert.ok(choice);await choice.handler({name:'request_choice',toolCallId:'actual-stop-choice',args:{title:'controlled stop choice',options:[{id:'one',label:'One'},{id:'two',label:'Two'}]}});}stream.push({kind:'settled',summary:'native done',runtime:options.runtime,roleId:role.id,turnId,detail:{outcome:'completed'}});}finally{if(prompts===1)firstFinished=true;}},events:()=>stream.events(),async abort(){},async dispose(){stream.close();}};}}};
 const desktop=createDesktopInterface({pickDirectory:async()=>null,emitEvent:event=>envelopes.push(event),customerInput:channel.customerInput,envFilePath:temp.envPath,piConfigEnv:{},runtimeOptions:{providerFactories:{codex:provider}},openRoleSessionFn:(input,deps)=>openRoleSession({...input,autoRepin:false},deps)});
 try{await desktop.listProject({projectRoot:temp.root});assert.equal((await desktop.openSession({projectRoot:temp.root,roleId:'su',runtime:'codex'})).ok,true);
 const pending=desktop.sendSession({text:'first explicit prompt',metadata:{clientMessageId:'actual-stop'}});await until(()=>requests.length===1);assert.equal((await desktop.abortSession({projectRoot:temp.root,roleId:'su',runtime:'codex'})).ok,true);
 const result=await pending;await until(()=>envelopes.some(e=>e.event.kind==='settled'&&e.clientMessageId==='actual-stop'));
 const terminal=envelopes.find(e=>e.event.kind==='settled'&&e.clientMessageId==='actual-stop')!;assert.equal((terminal.event as SessionEvent).detail && ((terminal.event as SessionEvent).detail as {outcome:string}).outcome,'aborted');assert.equal(result.inputAccepted,true);assert.equal(result.sessionCurrent,true);assert.equal(result.turnId,terminal.event.kind!=='handback'&&terminal.event.turnId);if(result.outcome!==undefined)assert.equal(result.outcome,'aborted');
 assert.equal(channel.respond({id:requests[0].id,decision:{kind:'choice',selected:['one']}}).expired,true);await until(()=>firstFinished);assert.equal(prompts,1,'stop never repeats the model input');
 assert.equal((await desktop.sendSession({text:'second explicit prompt',metadata:{clientMessageId:'after-stop'}})).ok,true);assert.equal(prompts,2);assert.equal((await desktop.openSession({projectRoot:temp.root,roleId:'su',runtime:'codex'})).resumed,true);
 }finally{await desktop.stopSession();desktop.disposeProjectDocuments();channel.rejectAllPending('cleanup');temp.cleanup();}
});

test('same client IDs across sequential actual turns retain separate first public outcomes',async()=>{
 const current=harness();try{await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'});const source=current.opened[0];let calls=0;
 source.handle.send=async(_text,opts)=>{const index=++calls;const turnId='sequential-'+index;opts?.onTurnStarted?.({turnId,roleId:'A',runtime:'codex'});source.stream.push({kind:'message',summary:'input',turnId,detail:{source:'prompt-input',text:'same'}});source.stream.push({kind:'settled',summary:'authoritative first '+index,turnId,detail:{outcome:index===1?'aborted':'completed'}});source.stream.push({kind:'settled',summary:'duplicate '+index,turnId,detail:{outcome:'failed'}});await until(()=>current.envelopes.some(e=>e.event.summary==='duplicate '+index));throw new Error('same opaque rejection');};
 const first=await current.manager.send('same',undefined,undefined,{clientMessageId:'same-client'});const second=await current.manager.send('same',undefined,undefined,{clientMessageId:'same-client'});assert.equal(first.outcome,'aborted');assert.equal(second.outcome,'completed');assert.equal(first.inputAccepted,true);assert.equal(second.inputAccepted,true);assert.notEqual(first.turnId,second.turnId);assert.equal(calls,2);
 }finally{await current.manager.stop();}
});

test('foreign scope terminal and typed input cannot lend facts to a correctly acknowledged turn',async()=>{
 const current=harness();try{await current.manager.open({projectRoot:'/one',roleId:'A',runtime:'codex'});const source=current.opened[0];
 source.handle.send=async(_text,opts)=>{opts?.onTurnStarted?.({turnId:'claimed',roleId:'A',runtime:'codex'});source.stream.push({kind:'message',summary:'foreign accepted',turnId:'claimed',roleId:'B',runtime:'codex',detail:{source:'prompt-input',text:'text'}});source.stream.push({kind:'settled',summary:'foreign terminal',turnId:'claimed',roleId:'A',runtime:'pi',detail:{outcome:'aborted'}});await until(()=>current.envelopes.some(e=>e.event.summary==='foreign terminal'));throw new Error('opaque');};
 const result=await current.manager.send('text',undefined,undefined,{clientMessageId:'client'});assert.equal(result.turnId,'claimed');assert.equal(Object.hasOwn(result,'inputAccepted'),false);assert.equal(Object.hasOwn(result,'outcome'),false);assert.ok(current.envelopes.filter(e=>e.event.summary.startsWith('foreign')).every(e=>e.clientMessageId===undefined));
 }finally{await current.manager.stop();}
});

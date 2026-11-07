import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntimeAdapter, composeRuntimeApplicationMediation, type RuntimeApplicationMediationCompositionInput } from "../../src/service/runtime/session.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import {
  isRuntimeApplicationToolSurfaceFacts,
  type RuntimeApplicationToolSurfaceFacts, type RuntimeNativeToolSurfaceFacts,
} from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";

const observedAt = "2026-11-07T00:00:00.000Z";
const nativeInstanceId = "native-instance-p1a";
const appTools = ["read_file", "write_file"];
const applicationFact = (overrides: Partial<RuntimeApplicationToolSurfaceFacts> = {}): RuntimeApplicationToolSurfaceFacts => ({
  source: "application-mediated-tool-surface", nativeInstanceId, roleId: "worker", runtime: "claude",
  factory: "claude-sdk-mcp", status: "observed", observedAt,
  appTools: [...appTools], foreignMcpServers: [], nativeBuiltinTools: [], reasons: [], ...overrides,
});
const nativeFact = (overrides: Partial<RuntimeNativeToolSurfaceFacts> = {}): RuntimeNativeToolSurfaceFacts => ({
  source: "native-provider-tool-registry", nativeInstanceId, roleId: "worker", runtime: "codex",
  factory: "codex-chat", status: "observed", observedAt,
  appTools: [...appTools], foreignMcpServers: [], nativeBuiltinTools: [], reasons: [], ...overrides,
});
const input = (overrides: Partial<RuntimeApplicationMediationCompositionInput> = {}): RuntimeApplicationMediationCompositionInput => ({
  runtime: "claude", factoryProvenance: "default-production", disposed: false,
  strictReasons: ["native-tool-registry-binding-unverified"], roleId: "worker",
  nativeInstanceId, nativeLifecycleInstanceId: nativeInstanceId,
  appTools: [...appTools], configuredForeignMcpServers: [],
  applicationFact: () => applicationFact(), ...overrides,
});

test("P1-A guard accepts exactly the frozen application tool-surface fact shape", () => {
  assert.equal(isRuntimeApplicationToolSurfaceFacts(applicationFact()), true);
  for (const runtime of ["claude", "pi", "codex", "demo"] as const) assert.equal(isRuntimeApplicationToolSurfaceFacts(applicationFact({ runtime })), true);
  for (const factory of ["claude-sdk-mcp", "pi-custom-tools", "codex-chat"] as const) assert.equal(isRuntimeApplicationToolSurfaceFacts(applicationFact({ factory })), true);
  const invalid: unknown[] = [undefined, null, [], "fact", 42, {}, applicationFact({ source: "native-provider-tool-registry" as never }),
    applicationFact({ nativeInstanceId: "" }), applicationFact({ nativeInstanceId: "   " }), applicationFact({ nativeInstanceId: 1 as never }),
    applicationFact({ roleId: "" }), applicationFact({ runtime: "other" as never }), applicationFact({ factory: "unknown" as never }),
    applicationFact({ status: "verified" as never }), applicationFact({ observedAt: "" }),
    applicationFact({ appTools: "read_file" as never }), applicationFact({ appTools: ["read_file", "read_file"] }),
    applicationFact({ appTools: [""] }), applicationFact({ appTools: [1 as never] }),
    applicationFact({ foreignMcpServers: [""] }), applicationFact({ nativeBuiltinTools: "WebSearch" as never }),
    applicationFact({ reasons: "reason" as never }), applicationFact({ reasons: [""] }), applicationFact({ reasons: [1 as never] })];
  for (const value of invalid) assert.equal(isRuntimeApplicationToolSurfaceFacts(value), false, JSON.stringify(value));
});

test("P1-A composition verifies Claude/Pi/Codex only under the exact reason whitelist and returns copied facts", () => {
  const cases = [
    { runtime: "claude" as const, factory: "claude-sdk-mcp" as const, reason: "native-tool-registry-binding-unverified" },
    { runtime: "pi" as const, factory: "pi-custom-tools" as const, reason: "native-tool-registry-binding-unverified" },
    { runtime: "codex" as const, factory: "codex-chat" as const, reason: "unmediated-execution-registered" },
  ];
  for (const { runtime, factory, reason } of cases) {
    const foreign = runtime === "codex" ? [] : ["configured-foreign"];
    const fact = applicationFact({ runtime, factory, foreignMcpServers: [...foreign] });
    const composed = composeRuntimeApplicationMediation(input({
      runtime, strictReasons: [reason], configuredForeignMcpServers: [...foreign],
      applicationFact: () => fact, ...(runtime === "codex" ? { nativeFact: nativeFact() } : {}),
    }));
    assert.deepEqual(composed, { kind: "application-mediated-unknown-native", status: "verified", runtime, factory, observedAt,
      nativeInstanceId, appTools, foreignMcpServers: foreign, nativeBuiltinTools: [], reasons: [] }, runtime);
    assert.notEqual(composed!.appTools, fact.appTools);
    const returned = structuredClone(composed);
    (fact.appTools as string[]).push("tampered-after-read");
    (fact.foreignMcpServers as string[]).push("tampered-foreign");
    assert.deepEqual(composed, returned, "returned arrays are copies, never live adapter arrays");
  }
  // 适配器事实只在构造门槛内读取一次；门槛不成立时不触达适配器。
  let reads = 0;
  const counted = () => { reads++; return applicationFact(); };
  for (const overrides of [{ runtime: "demo" as const }, { factoryProvenance: "custom-override" as const },
    { disposed: true }, { strictReasons: [] as string[] }, { strictReasons: ["core-registry-changed-after-factory"] },
  ]) {
    assert.equal(composeRuntimeApplicationMediation(input({ applicationFact: counted, ...overrides })), undefined, JSON.stringify(overrides));
  }
  assert.equal(reads, 0);
  assert.ok(composeRuntimeApplicationMediation(input({ applicationFact: counted })));
  assert.equal(reads, 1);
});

test("P1-A composition rejects every blocked or unlisted wrapper reason (default deny)", () => {
  const blocked = ["core-registry-changed-after-factory", "core-registry-read-failed", "core-tool-handler-changed-after-factory",
    "custom-provider-factory-unverified", "disposed-registry-not-current", "role-capability-callback-guard-unverified",
    "native-tool-surface-read-failed", "native-tool-registry-binding-unverified", "native-tool-registry-mismatch",
    "native-tool-execution-coverage-unverified", "native-production-tool-factory-unverified", "owned-execution-program-not-proven-stopped",
    "unmediated-execution-registered", "some-future-reason"];
  for (const reason of blocked) {
    // Claude/Pi 只允许 native-tool-registry-binding-unverified；Codex 只允许 unmediated-execution-registered。
    if (reason !== "native-tool-registry-binding-unverified")
      assert.equal(composeRuntimeApplicationMediation(input({ strictReasons: [reason] })), undefined, `claude:${reason}`);
    if (reason !== "native-tool-registry-binding-unverified")
      assert.equal(composeRuntimeApplicationMediation(input({ runtime: "pi", strictReasons: [reason],
        applicationFact: () => applicationFact({ runtime: "pi", factory: "pi-custom-tools" }) })), undefined, `pi:${reason}`);
    if (reason !== "unmediated-execution-registered")
      assert.equal(composeRuntimeApplicationMediation(input({ runtime: "codex", strictReasons: [reason], nativeFact: nativeFact(),
        applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat" }) })), undefined, `codex:${reason}`);
  }
  for (const runtime of ["claude", "pi"] as const) {
    assert.equal(composeRuntimeApplicationMediation(input({ runtime,
      strictReasons: ["native-tool-registry-binding-unverified", "role-capability-callback-guard-unverified"],
      applicationFact: () => applicationFact({ runtime, factory: runtime === "claude" ? "claude-sdk-mcp" : "pi-custom-tools" }) })), undefined);
  }
  assert.equal(composeRuntimeApplicationMediation(input({ runtime: "codex", nativeFact: nativeFact(),
    strictReasons: ["unmediated-execution-registered", "owned-execution-program-not-proven-stopped"],
    applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat" }) })), undefined);
});

test("P1-A composition rejects missing, unknown, malformed or identity-mismatched adapter facts", () => {
  const cases: [string, Partial<RuntimeApplicationMediationCompositionInput>][] = [
    ["fact missing", { applicationFact: () => undefined }],
    ["fact unreadable", { applicationFact: () => { throw new Error("read failed"); } }],
    ["fact primitive", { applicationFact: () => "observed" }],
    ["fact wrong shape", { applicationFact: () => ({ ...applicationFact(), source: "native-provider-tool-registry" }) }],
    ["fact status unknown", { applicationFact: () => applicationFact({ status: "unknown" }) }],
    ["fact reasons non-empty", { applicationFact: () => applicationFact({ reasons: ["web-search-enabled"] }) }],
    ["factory mismatch", { applicationFact: () => applicationFact({ factory: "pi-custom-tools" }) }],
    ["runtime mismatch", { applicationFact: () => applicationFact({ runtime: "pi" }) }],
    ["role mismatch", { applicationFact: () => applicationFact({ roleId: "other-role" }) }],
    ["fact native instance mismatch", { applicationFact: () => applicationFact({ nativeInstanceId: "other-instance" }) }],
    ["live native instance mismatch", { nativeLifecycleInstanceId: "other-instance" }],
    ["bound native instance missing", { nativeInstanceId: undefined, nativeLifecycleInstanceId: undefined }],
    ["app tools missing entry", { applicationFact: () => applicationFact({ appTools: ["read_file"] }) }],
    ["app tools extra entry", { appTools: [...appTools, "unregistered-tool"] }],
    ["app tools duplicate", { applicationFact: () => applicationFact({ appTools: ["read_file", "read_file"] }) }],
    ["foreign mcp hidden", { applicationFact: () => applicationFact({ foreignMcpServers: ["hidden-server"] }) }],
    ["configured foreign not enumerated", { configuredForeignMcpServers: ["configured-foreign"], applicationFact: () => applicationFact() }],
    ["native builtin present", { applicationFact: () => applicationFact({ nativeBuiltinTools: ["WebSearch"] }) }],
  ];
  for (const [label, overrides] of cases) assert.equal(composeRuntimeApplicationMediation(input(overrides)), undefined, label);
});

test("P1-A Amendment-1: verified applicationMediation carries the bound nativeInstanceId (P1.6 §4.4 literal)", () => {
  // §4.4 字面谓词 `native.nativeInstanceId === applicationMediation.nativeInstanceId`：
  // verified 时绑定值、适配器事实与返回值三处同源恒等（§4.3 形状缺字段的增补）。
  const cases = [
    { runtime: "claude" as const, factory: "claude-sdk-mcp" as const, reason: "native-tool-registry-binding-unverified" },
    { runtime: "pi" as const, factory: "pi-custom-tools" as const, reason: "native-tool-registry-binding-unverified" },
    { runtime: "codex" as const, factory: "codex-chat" as const, reason: "unmediated-execution-registered" },
  ];
  for (const { runtime, factory, reason } of cases) {
    const fact = applicationFact({ runtime, factory });
    const factNative = nativeFact();
    const composed = composeRuntimeApplicationMediation(input({
      runtime, strictReasons: [reason], applicationFact: () => fact,
      ...(runtime === "codex" ? { nativeFact: factNative } : {}),
    }));
    assert.ok(composed, runtime);
    assert.equal(composed.nativeInstanceId, nativeInstanceId, `${runtime}: equals the bound native instance id`);
    assert.equal(composed.nativeInstanceId, fact.nativeInstanceId, `${runtime}: equals the adapter fact native instance id`);
    if (runtime === "codex") assert.equal(composed.nativeInstanceId, factNative.nativeInstanceId, `${runtime}: equals the native fact native instance id`);
  }
  // 缺失/不匹配：身份核对不变，仍 fail-closed（本实现为字段整体缺席，绝不产出 verified）。
  const missingOrMismatched: [string, Partial<RuntimeApplicationMediationCompositionInput>][] = [
    ["bound native instance missing", { nativeInstanceId: undefined }],
    ["live lifecycle instance missing", { nativeLifecycleInstanceId: undefined }],
    ["adapter fact instance empty", { applicationFact: () => applicationFact({ nativeInstanceId: "" }) }],
    ["adapter fact instance mismatch", { applicationFact: () => applicationFact({ nativeInstanceId: "other-instance" }) }],
    ["live lifecycle instance mismatch", { nativeLifecycleInstanceId: "other-instance" }],
  ];
  for (const [label, overrides] of missingOrMismatched) {
    const composed = composeRuntimeApplicationMediation(input(overrides));
    assert.equal(composed?.status, undefined, `${label}: no verified evidence`);
    assert.equal(composed, undefined, label);
  }
  // Codex 追加：native 事实 id 与绑定不一致 ⇒ 不 verified。
  assert.equal(composeRuntimeApplicationMediation(input({ runtime: "codex", strictReasons: ["unmediated-execution-registered"],
    nativeFact: nativeFact({ nativeInstanceId: "other-instance" }),
    applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat" }) })), undefined);
});

test("P1-A Codex application mediation additionally requires a bound native fact and no foreign MCP", () => {
  const codex = (overrides: Partial<RuntimeApplicationMediationCompositionInput> = {}) => input({
    runtime: "codex", strictReasons: ["unmediated-execution-registered"], nativeFact: nativeFact(),
    applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat" }), ...overrides });
  assert.ok(composeRuntimeApplicationMediation(codex()));
  for (const [label, overrides] of [
    ["native fact missing", { nativeFact: undefined }],
    ["native factory unknown", { nativeFact: nativeFact({ factory: "unknown" }) }],
    ["native instance mismatch", { nativeFact: nativeFact({ nativeInstanceId: "other-instance" }) }],
    ["native builtin present (reason cannot come from app shell)", { nativeFact: nativeFact({ nativeBuiltinTools: ["native-tool"] }) }],
    ["configured foreign mcp (N28/F19)", { configuredForeignMcpServers: ["configured-foreign"],
      applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat", foreignMcpServers: ["configured-foreign"] }) }],
    ["reported foreign mcp", { applicationFact: () => applicationFact({ runtime: "codex", factory: "codex-chat", foreignMcpServers: ["reported-foreign"] }) }],
    ["Claude/Pi-only whitelist reason", { strictReasons: ["native-tool-registry-binding-unverified"] }],
  ] as [string, Partial<RuntimeApplicationMediationCompositionInput>][]) {
    assert.equal(composeRuntimeApplicationMediation(codex(overrides)), undefined, label);
  }
});

test("P1-A wrapper keeps applicationMediation absent for custom factories, demo and strict observed sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-p1a-wrapper-"));
  // custom factory：即使适配器自报事实，也因 factoryProvenance=custom-override 而缺席。
  const custom = await createRuntimeAdapter({
    runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
    providerFactories: { codex: options => {
      const fact = applicationFact({ runtime: "codex", factory: "codex-chat", appTools: options.tools.map(tool => tool.name) });
      const demo = createDemoRuntimeAdapter(options);
      return { ...demo, async bindRole(boundRole) {
        const inner = await demo.bindRole(boundRole);
        return { ...inner, inspectApplicationToolSurface: () => fact };
      } };
    } },
  }).bindRole(role("worker"));
  try {
    const facts = custom.inspectToolSurface!();
    assert.equal(facts.factoryProvenance, "custom-override");
    assert.equal("applicationMediation" in facts, false);
  } finally { await custom.dispose(); }
  // demo：只走严格路径，不构造应用中介证据。
  const demo = await createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root })
    .bindRole(role("worker"));
  try {
    const facts = demo.inspectToolSurface!();
    assert.equal(facts.status, "observed"); assert.equal("applicationMediation" in facts, false);
  } finally { await demo.dispose(); }
});

test("P1-A real default Codex session remains strict-observed and never gains the dual path", async t => {
  const root = await mkdtemp(join(tmpdir(), "ans-p1a-default-codex-"));
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_P1A_LOCAL_KEY"].map(key => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_P1A_LOCAL_KEY = "no-model-called";
  try {
    const chief = { ...role("chief"), kind: "built-in-governance" as const, governanceFunction: "chief" as const };
    const decision = { roleId: "chief" as const, executionId: "p1a-bounded", mode: "bounded-decision" as const, productionWriteAuthority: false as const,
      tools: ["decide_pending_request"] as const, limits: { maxTurns: 1, timeoutMs: 1000, maxAttempts: 1 },
      request: { requestId: "p1a-request", baseDigest: "a".repeat(64), delegationRevision: 0, originRoleId: "convener", cardKind: "decision" as const,
        question: "bounded choice", options: [{ id: "one", label: "one" }], evidenceRefs: [] } };
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
      baseUrl: "http://127.0.0.1:9/v1", modelId: "p1a-contract-only", apiKeyEnvVar: "ANS_P1A_LOCAL_KEY", chiefDecisionContext: decision,
      decidePendingRequest: async () => ({ ok: false, requestId: "p1a-request", status: "pending", errorCode: "test-not-called", message: "not invoked" }) });
    const prepared = await adapter.prepareRole!(chief);
    assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    const session = await adapter.bindPreparedRole!(prepared.token!);
    try {
      const facts = session.inspectToolSurface!();
      assert.equal(facts.status, "observed", JSON.stringify(facts.reasons));
      assert.equal(facts.nativeToolRegistry, "application-mediated");
      assert.equal("applicationMediation" in facts, false, "strict observed must keep applicationMediation absent (F15/N20)");
      assert.deepEqual(facts.reasons, []);
      assert.equal(isRuntimeApplicationToolSurfaceFacts(facts), false, "a session surface is not an application fact");
      t.diagnostic(JSON.stringify({ factoryProvenance: facts.factoryProvenance, status: facts.status, nativeToolRegistry: facts.nativeToolRegistry }));
    } finally { await session.dispose(); }
  } finally { for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

/**
 * W2-R（2026-11-08「会话创建准入按操作审批」方案 P1.3）运行时核心准入测试。
 *
 * 覆盖：prepareRole 真值表（scope × runtime × shell × binding × sink 三态 × provenance × guards）、
 * mode 可接受集合、`ensureAdapter`/`verifyScope`/`bindPreparedRole` 的 admittedPlan/审批链复核、
 * `configDigest` 含 approvalChain、roleId 透传（经真实 Service 入口）。
 *
 * 夹具说明（临时性，编排 W1b 接线后由装配路径替换）：生产登记点唯一在 `createShellGate`；本批 W1b
 * 尚未接线，因此测试直接调用 `registerShellApproval(gate, facts, sink)` 构造「已登记 gate」夹具。
 * 该临时夹具与编排 E2E（`assemble*`/`buildShellGate` 装配后 probe 惰性执行）对齐：本文件只依赖
 * W1 冻结 API（`registerShellApproval`/`inspectShellApproval`/`probeShellApproval`，无值入参/memoize）。
 *
 * 防御性判据（复核 R6 / B1 AC-27）：`protected-scope-approval-chain-changed` 端到端会先被
 * `isCurrent()` 拦为 `runtime-prepared-configuration-changed`；本文件以模块级
 * `matchesRuntimeApprovalChain` 直接覆盖一致性判据，并断言端到端 gate 替换得到 configuration-changed。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  registerShellApproval,
  type ShellApprovalAuditProbeState,
  type ShellApprovalFacts,
  type ShellApprovalMode,
  type ShellApprovalProbeSink,
} from "../../src/common/shared/shell-approval-binding.ts";
import {
  createRuntimeAdapter,
  matchesRuntimeApprovalChain,
  type RuntimeSessionOptions,
} from "../../src/service/runtime/session.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import type { InstallSkillFn, RuntimeApprovalChainPlanFacts, ShellGate } from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";

/** 构造 required 保护范围（合法 init-source，projectRoot=真实根）。 */
async function protectedRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const sourceId = `init-source-${createHash("sha256").update(root).digest("hex")}`;
  const dir = join(root, ".ans", "trunk", "initialization-sources");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sourceId}.json`), JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: root }));
  return root;
}

interface GateFixtureInput {
  projectRoot?: string;
  mode?: ShellApprovalMode;
  sink?: "file" | "memory" | "custom";
  durable?: boolean;
  probe?: (() => Promise<ShellApprovalAuditProbeState>) | undefined;
  relPath?: string;
  /** true ⇒ 不传 sink（已登记但无 probe 能力）。 */
  withoutSink?: boolean;
  /** true ⇒ sink 无 `probe()` 方法（默认 probe 返回 "ok"）。 */
  withoutProbe?: boolean;
}

/** 直接登记一个「应用构造成功」的 gate 夹具（临时性，见文件头注）。 */
function registeredGate(input: GateFixtureInput = {}): ShellGate {
  const gate: ShellGate = async () => ({ allow: true, by: "w2-fixture-gate" });
  const facts: ShellApprovalFacts = {
    source: "orchestration-shell-gate",
    version: 1,
    ...(input.projectRoot !== undefined ? { projectRoot: input.projectRoot } : {}),
    mode: input.mode ?? "three-layer",
    classifier: true,
    rules: true,
    pmAsk: true,
    operatorChannel: true,
    takeGrant: true,
    takeDirective: true,
    routinePolicy: false,
    escalation: true,
    audit: {
      sink: input.sink ?? "file",
      durable: input.durable ?? true,
      probe: "unknown",
      ...(input.relPath !== undefined ? { relPath: input.relPath } : {}),
    },
  };
  const sink: ShellApprovalProbeSink | undefined = input.withoutSink ? undefined : {
    ...(input.withoutProbe ? {} : { probe: input.probe ?? (async () => "ok" as const) }),
    describe: () => ({ kind: input.sink ?? "file", durable: input.durable ?? true, ...(input.relPath !== undefined ? { relPath: input.relPath } : {}) }),
  };
  registerShellApproval(gate, facts, sink);
  return gate;
}

function optionsFor(root: string, extra: Partial<RuntimeSessionOptions> = {}): RuntimeSessionOptions {
  return { runtime: "claude", gate: allow, projectRoot: root, skillRoot: root, ...extra };
}

test("W2 prepareRole：unknown 保护范围拒绝；required 下 unknown 不静默放行", async () => {
  const missing = join(tmpdir(), `ans-w2-missing-${createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex")}`);
  const adapter = createRuntimeAdapter(optionsFor(missing));
  const prepared = await adapter.prepareRole!(role("w2-unknown"));
  assert.equal(prepared.plan.status, "unknown");
  assert.equal(prepared.token, undefined);
  assert.ok(prepared.plan.reasons.includes("runtime-protection-scope-unknown"));
  await assert.rejects(adapter.bindRole(role("w2-unknown")), /runtime-protection-scope-unknown/);
  await assert.rejects(adapter.composeContext(role("w2-unknown-ctx")), /runtime-protection-scope-unknown/);
});

test("W2 prepareRole 真值表：required × runtime × shell × binding × provenance × guards", async t => {
  const root = await protectedRoot("ans-w2-truth-");
  // 1) claude + 无 shell（CLI/judge 路径口径）：observed，无 approvalChain，无 native-factory-*。
  const noShell = await createRuntimeAdapter(optionsFor(root)).prepareRole!(role("w2-no-shell"));
  assert.equal(noShell.plan.status, "observed", JSON.stringify(noShell.plan.reasons));
  assert.ok(noShell.token);
  assert.equal("approvalChain" in noShell.plan, false);
  assert.equal(noShell.plan.reasons.some(reason => reason.startsWith("native-factory-plan-")), false);
  // 2) claude + shell + 未登记裸函数 gate：approval-chain-unproven（旧的 unconfined reason 不再产生）。
  const rawGate: ShellGate = async () => ({ allow: true, by: "w2-raw" });
  const unproven = await createRuntimeAdapter(optionsFor(root, { shellGate: rawGate })).prepareRole!(role("w2-unproven"));
  assert.equal(unproven.plan.status, "unknown"); assert.equal(unproven.token, undefined);
  assert.ok(unproven.plan.reasons.includes("protected-scope-approval-chain-unproven"));
  assert.equal(unproven.plan.reasons.includes("required-scope-unconfined-script-tools"), false);
  // 3) claude + shell + 已登记 file+durable+probe ok：observed + approvalChain。
  const gate = registeredGate({ projectRoot: root, mode: "rules-advisory", relPath: "docs/audit/shell-gate.jsonl" });
  const verified = await createRuntimeAdapter(optionsFor(root, { shellGate: gate })).prepareRole!(role("w2-verified"));
  assert.equal(verified.plan.status, "observed", JSON.stringify(verified.plan.reasons));
  assert.ok(verified.token);
  assert.deepEqual(verified.plan.approvalChain, {
    source: "orchestration-shell-gate", mode: "rules-advisory", classifier: true, rules: true, pmAsk: true, operatorChannel: true,
    takeGrant: true, takeDirective: true, routinePolicy: false, escalation: true,
    audit: { sink: "file", durable: true, probe: "ok", relPath: "docs/audit/shell-gate.jsonl" }, projectRoot: root,
  });
  // 4) Pi + 项目角色（非内置）+ 三层链：同 AC-2。
  const piGate = registeredGate({ projectRoot: root, mode: "three-layer" });
  const piPlan = await createRuntimeAdapter(optionsFor(root, { runtime: "pi", shellGate: piGate })).prepareRole!(role("w2-pi-project-role"));
  assert.equal(piPlan.plan.status, "observed", JSON.stringify(piPlan.plan.reasons)); assert.ok(piPlan.token);
  assert.equal(piPlan.plan.approvalChain!.mode, "three-layer");
  // 5) Codex：native 严格路径保留；有审批链 ⇒ observed；无审批链 ⇒ unproven（native 仍 prepared，不构造适配器）。
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_W2_TRUTH_KEY"].map(key => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_W2_TRUTH_KEY = "fixture-not-a-real-key";
  try {
    const codexGate = registeredGate({ projectRoot: root });
    const codex = await createRuntimeAdapter(optionsFor(root, { runtime: "codex", shellGate: codexGate, baseUrl: "http://127.0.0.1:9/v1", modelId: "w2-truth", apiKeyEnvVar: "ANS_W2_TRUTH_KEY" }))
      .prepareRole!(role("w2-codex"));
    assert.equal(codex.plan.status, "observed", JSON.stringify(codex.plan.reasons));
    assert.equal(codex.plan.native!.status, "observed");
    assert.equal(codex.plan.approvalChain!.mode, "three-layer");
    const codexRaw = await createRuntimeAdapter(optionsFor(root, { runtime: "codex", shellGate: (async () => ({ allow: true, by: "w2-raw" })) as ShellGate, baseUrl: "http://127.0.0.1:9/v1", modelId: "w2-truth", apiKeyEnvVar: "ANS_W2_TRUTH_KEY" }))
      .prepareRole!(role("w2-codex-raw"));
    assert.equal(codexRaw.plan.status, "unknown");
    assert.ok(codexRaw.plan.reasons.includes("protected-scope-approval-chain-unproven"));
    assert.equal(codexRaw.plan.native!.factory, "codex-chat");
  } finally {
    for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  // 6) demo：受保护范围仍拒绝（provenance ≠ default-production）。
  const demo = await createRuntimeAdapter(optionsFor(root, { runtime: "demo" })).prepareRole!(role("w2-demo"));
  assert.equal(demo.plan.status, "unknown"); assert.equal(demo.token, undefined);
  assert.ok(demo.plan.reasons.includes("protected-scope-default-native-plan-required"));
  // 7) custom factory：受保护范围拒绝（既有 reason 保留；无 shell 时不产生审批链 reason）。
  const custom = await createRuntimeAdapter(optionsFor(root, { providerFactories: { claude: input => createDemoRuntimeAdapter(input) } }))
    .prepareRole!(role("w2-custom"));
  assert.equal(custom.plan.status, "unknown"); assert.equal(custom.plan.factoryProvenance, "custom-override");
  assert.ok(custom.plan.reasons.includes("protected-scope-default-native-plan-required"));
  assert.ok(custom.plan.reasons.includes("custom-provider-factory-unverified"));
  // 8) roleCapabilityGuards unknown：受保护范围拒绝（既有 reason 保留）。
  const fakeInstall = (async () => ({ ok: false, reason: "fixture", message: "fixture" })) as unknown as InstallSkillFn;
  const guardsUnknown = await createRuntimeAdapter(optionsFor(root, { installSkill: fakeInstall })).prepareRole!(role("w2-guards"));
  assert.equal(guardsUnknown.plan.status, "unknown");
  assert.ok(guardsUnknown.plan.reasons.includes("required-scope-role-capability-effects-unproven"));
  t.diagnostic(JSON.stringify({ root, verifiedChainMode: verified.plan.approvalChain!.mode, codexNative: "observed", demoRejected: true }));
});

test("W2 mode 可接受集合：readonly / operator-approve / rules-advisory / three-layer 均准入", async () => {
  const root = await protectedRoot("ans-w2-modes-");
  for (const mode of ["readonly", "operator-approve", "rules-advisory", "three-layer"] as const) {
    const gate = registeredGate({ projectRoot: root, mode });
    const prepared = await createRuntimeAdapter(optionsFor(root, { shellGate: gate })).prepareRole!(role(`w2-mode-${mode}`));
    assert.equal(prepared.plan.status, "observed", `${mode}: ${JSON.stringify(prepared.plan.reasons)}`);
    assert.equal(prepared.plan.approvalChain!.mode, mode);
  }
});

test("W2 审计三态：非持久/非 file/探针缺失/抛错/unknown 一律 protected-scope-audit-unavailable", async () => {
  const root = await protectedRoot("ans-w2-audit-");
  const cases: Array<{ label: string; gate: () => ShellGate }> = [
    { label: "memory + durable:false", gate: () => registeredGate({ projectRoot: root, sink: "memory", durable: false }) },
    { label: "file + durable:false", gate: () => registeredGate({ projectRoot: root, sink: "file", durable: false }) },
    { label: "file + 无 probe()", gate: () => registeredGate({ projectRoot: root, withoutProbe: true }) },
    { label: "file + probe 抛错", gate: () => registeredGate({ projectRoot: root, probe: async () => { throw new Error("probe failed"); } }) },
    { label: "file + probe unavailable", gate: () => registeredGate({ projectRoot: root, probe: async () => "unavailable" }) },
    { label: "file + probe unknown", gate: () => registeredGate({ projectRoot: root, probe: async () => "unknown" }) },
    { label: "custom sink + probe ok", gate: () => registeredGate({ projectRoot: root, sink: "custom" }) },
    { label: "已登记但无 sink", gate: () => registeredGate({ projectRoot: root, withoutSink: true }) },
  ];
  for (const item of cases) {
    const prepared = await createRuntimeAdapter(optionsFor(root, { shellGate: item.gate() })).prepareRole!(role(`w2-audit-${item.label}`));
    assert.equal(prepared.plan.status, "unknown", item.label);
    assert.equal(prepared.token, undefined, item.label);
    assert.ok(prepared.plan.reasons.includes("protected-scope-audit-unavailable"), `${item.label}: ${JSON.stringify(prepared.plan.reasons)}`);
    assert.equal(prepared.plan.reasons.includes("protected-scope-approval-chain-unproven"), false, item.label);
    assert.equal("approvalChain" in prepared.plan, false, item.label);
  }
});

test("W2 项目根：注册根与 Core 根不一致 ⇒ unproven；规范化等值（尾斜杠/Windows 大小写）⇒ 准入", async () => {
  const root = await protectedRoot("ans-w2-root-");
  const otherRoot = await mkdtemp(join(tmpdir(), "ans-w2-other-"));
  const mismatch = await createRuntimeAdapter(optionsFor(root, { shellGate: registeredGate({ projectRoot: otherRoot }) })).prepareRole!(role("w2-root-mismatch"));
  assert.equal(mismatch.plan.status, "unknown");
  assert.ok(mismatch.plan.reasons.includes("protected-scope-approval-chain-unproven"));
  const noRoot = await createRuntimeAdapter(optionsFor(root, { shellGate: registeredGate({}) })).prepareRole!(role("w2-root-absent"));
  assert.ok(noRoot.plan.reasons.includes("protected-scope-approval-chain-unproven"), "登记缺 projectRoot ⇒ unproven");
  const trailing = await createRuntimeAdapter(optionsFor(root, { shellGate: registeredGate({ projectRoot: `${root}/` }) })).prepareRole!(role("w2-root-trailing"));
  assert.equal(trailing.plan.status, "observed", JSON.stringify(trailing.plan.reasons));
  if (process.platform === "win32") {
    const upper = await createRuntimeAdapter(optionsFor(root, { shellGate: registeredGate({ projectRoot: root.toUpperCase() }) })).prepareRole!(role("w2-root-upper"));
    assert.equal(upper.plan.status, "observed", "Windows 项目根比较大小写不敏感（规范化比较）");
  }
});

test("W2 approvalChain 稳定投影（无时间戳/凭据）且 configDigest 计入 approvalChain", async () => {
  const root = await protectedRoot("ans-w2-digest-");
  const gateThreeLayer = registeredGate({ projectRoot: root, mode: "three-layer" });
  const gateReadonly = registeredGate({ projectRoot: root, mode: "readonly" });
  const first = await createRuntimeAdapter(optionsFor(root, { shellGate: gateThreeLayer })).prepareRole!(role("w2-digest"));
  const second = await createRuntimeAdapter(optionsFor(root, { shellGate: gateThreeLayer })).prepareRole!(role("w2-digest"));
  const different = await createRuntimeAdapter(optionsFor(root, { shellGate: gateReadonly })).prepareRole!(role("w2-digest"));
  assert.equal(first.plan.status, "observed"); assert.equal(second.plan.status, "observed"); assert.equal(different.plan.status, "observed");
  assert.match(first.plan.configDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.plan.configDigest, second.plan.configDigest, "同一证据（同一 gate）⇒ 同一摘要（planId 不参与摘要）");
  assert.notEqual(first.plan.configDigest, different.plan.configDigest, "mode 变化 ⇒ approvalChain 变化 ⇒ configDigest 变化");
  assert.deepEqual(first.plan.approvalChain, second.plan.approvalChain);
  assert.equal(JSON.stringify(first.plan).includes("observedAt"), false);
  assert.doesNotMatch(JSON.stringify(first.plan), /credential|apiKey|environment/);
});

test("W2 matchesRuntimeApprovalChain：模块级一致性判据逐字段 fail-closed", () => {
  const baseline: RuntimeApprovalChainPlanFacts = {
    source: "orchestration-shell-gate", mode: "three-layer", classifier: true, rules: true, pmAsk: true, operatorChannel: true,
    takeGrant: true, takeDirective: true, routinePolicy: false, escalation: true,
    audit: { sink: "file", durable: true, probe: "ok", relPath: "docs/audit/shell-gate.jsonl" }, projectRoot: "C:/fixture/root",
  };
  const copy = (): RuntimeApprovalChainPlanFacts => structuredClone(baseline);
  assert.equal(matchesRuntimeApprovalChain(copy(), copy()), true);
  assert.equal(matchesRuntimeApprovalChain(copy(), undefined), false);
  assert.equal(matchesRuntimeApprovalChain(undefined, copy()), false);
  for (const mutate of [
    (value: RuntimeApprovalChainPlanFacts) => { value.mode = "readonly"; },
    (value: RuntimeApprovalChainPlanFacts) => { value.classifier = false; },
    (value: RuntimeApprovalChainPlanFacts) => { value.rules = false; },
    (value: RuntimeApprovalChainPlanFacts) => { value.pmAsk = false; },
    (value: RuntimeApprovalChainPlanFacts) => { value.operatorChannel = false; },
    (value: RuntimeApprovalChainPlanFacts) => { value.takeGrant = false; },
    (value: RuntimeApprovalChainPlanFacts) => { value.takeDirective = false; },
    (value: RuntimeApprovalChainPlanFacts) => { value.routinePolicy = true; },
    (value: RuntimeApprovalChainPlanFacts) => { value.escalation = false; },
    (value: RuntimeApprovalChainPlanFacts) => { (value.audit as { probe: string }).probe = "unavailable"; },
    (value: RuntimeApprovalChainPlanFacts) => { (value.audit as { durable: boolean }).durable = false; },
    (value: RuntimeApprovalChainPlanFacts) => { value.audit.relPath = "other/audit.jsonl"; },
    (value: RuntimeApprovalChainPlanFacts) => { value.projectRoot = "C:/fixture/other"; },
    (value: RuntimeApprovalChainPlanFacts) => { value.source = "other-source" as RuntimeApprovalChainPlanFacts["source"]; },
  ]) {
    const changed = copy(); mutate(changed);
    assert.equal(matchesRuntimeApprovalChain(changed, baseline), false, JSON.stringify(changed));
  }
});

test("W2 bindPreparedRole：受保护 + shell + 已登记审批链 ⇒ token 成立并绑定（appTools 含 shell）", async () => {
  const root = await protectedRoot("ans-w2-bind-");
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_W2_BIND_KEY"].map(key => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_W2_BIND_KEY = "fixture-not-a-real-key";
  try {
    const gate = registeredGate({ projectRoot: root, mode: "three-layer" });
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, shellGate: gate,
      baseUrl: "http://127.0.0.1:9/v1", modelId: "w2-bind", apiKeyEnvVar: "ANS_W2_BIND_KEY" });
    const prepared = await adapter.prepareRole!(role("w2-bind"));
    assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    assert.ok(prepared.token);
    assert.deepEqual(prepared.plan.approvalChain && { mode: prepared.plan.approvalChain.mode, probe: prepared.plan.approvalChain.audit.probe },
      { mode: "three-layer", probe: "ok" });
    const session = await adapter.bindPreparedRole!(prepared.token!);
    try {
      const surface = session.inspectToolSurface!();
      assert.ok(surface.appTools.includes("run_shell"));
      assert.ok(surface.appTools.includes("start_background_task"));
    } finally { await session.dispose(); }
  } finally {
    for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("W2 composeContext：受保护 + shell + 已登记审批链 ⇒ token 成立后设置 admittedPlan 并返回上下文", async () => {
  const root = await protectedRoot("ans-w2-compose-");
  const previous = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_W2_COMPOSE_KEY"].map(key => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat"; process.env.ANS_CODEX_WEB_SEARCH = "off"; process.env.ANS_W2_COMPOSE_KEY = "fixture-not-a-real-key";
  try {
    const gate = registeredGate({ projectRoot: root });
    const adapter = createRuntimeAdapter({ runtime: "codex", gate: allow, projectRoot: root, skillRoot: root, shellGate: gate,
      baseUrl: "http://127.0.0.1:9/v1", modelId: "w2-compose", apiKeyEnvVar: "ANS_W2_COMPOSE_KEY" });
    const context = await adapter.composeContext(role("w2-compose"));
    assert.equal(typeof context.systemPrompt, "string");
    assert.ok(context.systemPrompt.length > 0);
  } finally {
    for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("W2 无 token 的受保护 shell 会话不得构造适配器：bindRole/composeContext 均拒绝", async () => {
  const root = await protectedRoot("ans-w2-notoken-");
  const rawGate: ShellGate = async () => ({ allow: true, by: "w2-raw" });
  const adapter = createRuntimeAdapter(optionsFor(root, { shellGate: rawGate }));
  const actor = role("w2-notoken");
  await assert.rejects(adapter.bindRole(actor), /runtime-protected-scope-requires-verified-plan/);
  await assert.rejects(adapter.composeContext(actor), /runtime-protected-scope-requires-verified-plan/);
});

test("W2 AC-27：prepare→bind 之间 gate 替换先被 isCurrent 拦为 runtime-prepared-configuration-changed", async () => {
  const root = await protectedRoot("ans-w2-swap-");
  const gateOne = registeredGate({ projectRoot: root, mode: "three-layer" });
  const gateTwo = registeredGate({ projectRoot: root, mode: "readonly" });
  const options = optionsFor(root, { shellGate: gateOne });
  const adapter = createRuntimeAdapter(options);
  const prepared = await adapter.prepareRole!(role("w2-swap"));
  assert.ok(prepared.token);
  options.shellGate = gateTwo;
  await assert.rejects(adapter.bindPreparedRole!(prepared.token!), /runtime-prepared-configuration-changed/);
});

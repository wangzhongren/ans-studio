/**
 * W1（2026-11-08「删除全部预知式门控」P1.4 §3.2 A5/A6/D1、§4.4 F5/R9；P1.2-AC-27）：
 * Codex native factory plan 只是**可选强证明** —— native 不可用（responses/WebSearch 等）时
 * 创建准入不产生 `native-factory-plan-*` 拒绝、`plan.native` 缺席、`ensureAdapter` 回落工厂构造；
 * observed 时投影进 plan 并仅对「主动采用的强证明」做绑定核对（present-but-changed 拒绝、absent 允许）。
 *
 * 另覆盖 A9/D6：`official-pure-preparation-unproven` 退役；`construction.status` 只由真实边界决定，
 * `trustedPurePreparation` 仅作可选证据字段。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  registerShellApproval,
  type ShellApprovalFacts,
  type ShellApprovalMode,
  type ShellApprovalProbeSink,
} from "../../src/common/shared/shell-approval-binding.ts";
import {
  createRuntimeAdapter,
  discardRuntimeRolePreparation,
  inspectRuntimeCoreRegistry,
  matchesRuntimeNativeFactoryPlanBinding,
  type RuntimeSessionOptions,
} from "../../src/service/runtime/session.ts";
import type {
  RuntimeNativeFactoryPlanFacts,
  RuntimeNativeToolSurfaceFacts,
  ShellGate,
} from "../../src/model/runtime.ts";
import { allow, role } from "./fixtures.ts";

/** 构造 required 保护范围（合法 init-source，projectRoot=真实根；与 W2 准入测试同口径）。 */
async function protectedRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const sourceId = `init-source-${createHash("sha256").update(root).digest("hex")}`;
  const dir = join(root, ".ans", "trunk", "initialization-sources");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sourceId}.json`), JSON.stringify({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: root }));
  return root;
}

/** 直接登记一个「应用构造成功」的 gate 夹具（`registerShellApproval` 为 W1 冻结 API）。 */
function registeredGate(projectRoot: string, mode: ShellApprovalMode = "three-layer"): ShellGate {
  const gate: ShellGate = async () => ({ allow: true, by: "w1-f5-fixture-gate" });
  const facts: ShellApprovalFacts = {
    source: "orchestration-shell-gate", version: 1, projectRoot, mode,
    classifier: true, rules: true, pmAsk: true, operatorChannel: true, takeGrant: true, takeDirective: true,
    routinePolicy: false, escalation: true, audit: { sink: "file", durable: true, probe: "unknown" },
  };
  const sink: ShellApprovalProbeSink = { probe: async () => "ok", describe: () => ({ kind: "file", durable: true }) };
  registerShellApproval(gate, facts, sink);
  return gate;
}

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = Object.keys(values).map(key => [key, process.env[key]] as const);
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { return await run(); }
  finally { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

function codexOptions(root: string, extra: Partial<RuntimeSessionOptions> = {}): RuntimeSessionOptions {
  return { runtime: "codex", gate: allow, projectRoot: root, skillRoot: root,
    baseUrl: "http://127.0.0.1:9/v1", modelId: "w1-f5", apiKeyEnvVar: "ANS_W1_F5_KEY", ...extra };
}

test("F5/P1.2-AC-27 Codex native 不可用（responses）仍可准入：plan 省略 native、无 native-factory-* 拒绝、ensureAdapter 回落工厂构造", async () => {
  const root = await protectedRoot("ans-w1-f5-responses-");
  await withEnv({ ANS_CODEX_WIRE_API: "responses", ANS_CODEX_WEB_SEARCH: "off", ANS_W1_F5_KEY: "fixture-not-a-real-key" }, async () => {
    const adapter = createRuntimeAdapter(codexOptions(root));
    const prepared = await adapter.prepareRole!(role("w1-f5-responses"));
    assert.equal(prepared.plan.scopeProtection?.state, "required");
    assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    assert.ok(prepared.token, "native 不可用不得阻断准入（旧 native-factory-plan-* 门已删除）");
    assert.equal("native" in prepared.plan, false, "非 observed/无 adapter ⇒ plan 省略 native");
    assert.equal(prepared.plan.reasons.length, 0);
    assert.equal(prepared.plan.reasons.includes("required-scope-unconfined-script-tools"), false);
    // 旧原生计划 reason 三类均不再产生。
    for (const retired of ["native-factory-plan-unverified", "native-factory-plan-unavailable", "native-factory-plan-preparation-failed"])
      assert.equal(prepared.plan.reasons.includes(retired), false, retired);
    const entry = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.roleId === "w1-f5-responses")!;
    assert.equal(entry.state, "prepared");
    assert.equal(entry.construction?.trustedPurePreparation, false);
    assert.equal(entry.construction?.reasons.includes("official-pure-preparation-unproven"), false);

    // ensureAdapter：nativePreparation 存在但无 adapter ⇒ 必须回落工厂构造（旧行为抛 configuration-changed）。
    const childProcess = createRequire(import.meta.url)("node:child_process") as typeof import("node:child_process");
    const originalSpawn = childProcess.spawn; let spawns = 0;
    childProcess.spawn = (() => { spawns++; throw new Error("w1-owned-codex-spawn-blocked"); }) as typeof originalSpawn;
    syncBuiltinESMExports();
    let failure: unknown;
    try {
      await assert.rejects(adapter.bindPreparedRole!(prepared.token!), (error: unknown) => { failure = error; return true; });
    } finally { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); }
    assert.equal(spawns, 1, "工厂构造路径被真实进入（不因缺 adapter 提前拒绝）");
    assert.match(String(failure), /w1-owned-codex-spawn-blocked/);
    assert.doesNotMatch(String(failure), /runtime-prepared-configuration-changed/);
    const failed = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.roleId === "w1-f5-responses")!;
    assert.equal(failed.state, "failed");
    assert.equal(failed.construction?.factoryEntered, true, "回落路径必须记录真实工厂边界");
  });
});

test("F5 Codex native 不可用（WebSearch）在受保护 + shell + 审批链下仍可准入：plan 省略 native 且审批链成立", async () => {
  const root = await protectedRoot("ans-w1-f5-websearch-");
  await withEnv({ ANS_CODEX_WIRE_API: "chat", ANS_CODEX_WEB_SEARCH: "on", ANS_W1_F5_KEY: "fixture-not-a-real-key" }, async () => {
    const gate = registeredGate(root);
    const adapter = createRuntimeAdapter(codexOptions(root, { shellGate: gate }));
    const prepared = await adapter.prepareRole!(role("w1-f5-websearch"));
    assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    assert.ok(prepared.token);
    assert.equal("native" in prepared.plan, false, "native 证据不可用 ⇒ 省略，不阻断");
    assert.equal(prepared.plan.approvalChain?.mode, "three-layer");
    for (const retired of ["native-factory-plan-unverified", "native-factory-plan-unavailable", "native-factory-plan-preparation-failed",
      "official-pure-preparation-unproven", "required-scope-unconfined-script-tools"])
      assert.equal(prepared.plan.reasons.includes(retired), false, retired);
  });
});

test("F5 native observed ⇒ plan 记录可选强证明并可绑定；present-but-changed 逐字段拒绝", async () => {
  const root = await protectedRoot("ans-w1-f5-observed-");
  await withEnv({ ANS_CODEX_WIRE_API: "chat", ANS_CODEX_WEB_SEARCH: "off", ANS_W1_F5_KEY: "fixture-not-a-real-key" }, async () => {
    const adapter = createRuntimeAdapter(codexOptions(root));
    const prepared = await adapter.prepareRole!(role("w1-f5-observed"));
    assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
    const planned = prepared.plan.native!;
    assert.ok(planned, "observed + adapter ⇒ plan 记录 native 强证明");
    assert.equal(planned.status, "observed"); assert.equal(planned.factory, "codex-chat");
    const preparedEntry = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.roleId === "w1-f5-observed")!;
    assert.equal(preparedEntry.construction?.trustedPurePreparation, true, "纯准备强证据只作可选证据字段");
    assert.equal(preparedEntry.construction?.reasons.includes("official-pure-preparation-unproven"), false);
    const session = await adapter.bindPreparedRole!(prepared.token!);
    try {
      const surface = session.inspectToolSurface!();
      assert.equal(surface.status, "observed", JSON.stringify(surface.reasons));
      assert.equal(surface.nativeToolRegistry, "application-mediated");
      assert.equal(surface.native?.factoryPlan?.planId, planned.planId);
      // Service wrapper 不暴露适配器 hook；native 事实经 `inspectToolSurface().native` 提供。
      const actual = surface.native!;
      const context = { current: true, roleId: "w1-f5-observed", runtime: "codex" as const, nativeLifecycleInstanceId: actual.nativeInstanceId };
      assert.equal(matchesRuntimeNativeFactoryPlanBinding(planned, actual, context), true, "present-and-matching ⇒ 绑定成立");
      // present-but-changed：逐字段漂移必须拒绝（P1.2-AC-27/AC-20 absent vs present-but-changed）。
      const drift: Array<[string, () => boolean]> = [
        ["planId", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, factoryPlan: { ...actual.factoryPlan!, planId: "other-plan" } }, context)],
        ["configDigest", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, factoryPlan: { ...actual.factoryPlan!, configDigest: "b".repeat(64) } }, context)],
        ["roleId", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, roleId: "other-role" }, context)],
        ["runtime", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, runtime: "pi" }, context)],
        ["status", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, status: "unknown" }, context)],
        ["factory", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, factory: "unknown" }, context)],
        ["nativeInstanceId", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, nativeInstanceId: "other-instance" }, context)],
        ["foreignMcpServers", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, foreignMcpServers: ["hidden"] }, context)],
        ["nativeBuiltinTools", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, nativeBuiltinTools: ["native-shell"] }, context)],
        ["appTools-extra", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, appTools: [...actual.appTools, "extra-tool"] }, context)],
        ["appTools-missing", () => matchesRuntimeNativeFactoryPlanBinding(planned, { ...actual, appTools: actual.appTools.slice(1) }, context)],
        ["isCurrent", () => matchesRuntimeNativeFactoryPlanBinding(planned, actual, { ...context, current: false })],
        ["nativeLifecycleInstanceId", () => matchesRuntimeNativeFactoryPlanBinding(planned, actual, { ...context, nativeLifecycleInstanceId: "other-instance" })],
        ["absent", () => matchesRuntimeNativeFactoryPlanBinding(planned, undefined, context)],
      ];
      for (const [label, run] of drift) assert.equal(run(), false, label);
    } finally { await session.dispose(); }
  });
});

test("A9/D6 official-pure-preparation-unproven 退役：纯准备/丢弃只按真实边界决定 construction.status，trustedPurePreparation 仅证据", async () => {
  const root = await mkdtemp(join(tmpdir(), "ans-w1-a9-"));
  const adapter = createRuntimeAdapter({ runtime: "claude", gate: allow, projectRoot: root, skillRoot: root });
  const actor = role("w1-a9-claude");
  const prepared = await adapter.prepareRole!(actor);
  assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
  assert.ok(prepared.token);
  assert.equal(prepared.plan.reasons.includes("official-pure-preparation-unproven"), false);
  const pendingEntry = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.roleId === actor.id)!;
  assert.equal(pendingEntry.construction?.trustedPurePreparation, false);
  assert.equal(pendingEntry.construction?.reasons.includes("official-pure-preparation-unproven"), false);
  assert.equal(pendingEntry.construction?.status, "possibly-started", "未撤销的准备只按真实未撤销边界判定");
  const ref = discardRuntimeRolePreparation(prepared, new Error("w1-owned pure preparation retirement"));
  assert.ok(ref);
  const retired = inspectRuntimeCoreRegistry().entries.find(candidate => candidate.roleId === actor.id)!;
  assert.equal(retired.construction?.status, "never-started", "撤销 + 无 factory/native/pending ⇒ never-started");
  assert.deepEqual(retired.construction?.reasons, []);
  assert.equal(retired.construction?.trustedPurePreparation, false);
});

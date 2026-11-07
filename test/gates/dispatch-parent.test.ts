// test/gates/dispatch-parent.test.ts
// 门控模块：派发父门正负例矩阵（P1.6 §11.1 P1–P7 / N1–N28 的**判定层**；B1 §3.2；E0.3 §5）。
//
// 纪律：只测纯函数判定，不跑真实模型/真实会话，不写项目文件，不采集证据。
// P1/P2 的“真实运行”部分不在此伪造——真实 Claude/Pi 证据归 P1-RR/测试角色；本文件只覆盖
// 判定层（同一 predicate 的输入→输出）。N1/N24（适配器自报）与 N15（写/发布门实跑）分别归
// 适配器 owner 与对应门 owner；本文件以结构断言记录 gates 模块不消费那些路径。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateChiefDispatchParent,
  type DispatchParentCoreFacts,
} from "../../src/common/gates/index.ts";
import {
  creatorReports,
  differentialScenarios,
  handbackProvenance,
  hostFor,
  makeHost,
  makeLifecycle,
  makeMediation,
  makeNativeSurface,
  mediatedCore,
  strictCore,
  strictSurface,
  TURN,
} from "./fixtures.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const evaluate = (core: DispatchParentCoreFacts | undefined, host = makeHost(), hub = true) =>
  evaluateChiefDispatchParent({ host, core, hub });
const reasonsOf = (core: DispatchParentCoreFacts | undefined, host = makeHost(), hub = true) => {
  const decision = evaluate(core, host, hub);
  return decision.ok ? [] : decision.reasons;
};

// —————————————— 正向矩阵（P3/P4/P6/P7 的判定层证据） ——————————————

test("P3/P4/P6/P7 判定层：demo/Codex 严格路径保持现状；Claude/Pi/Codex 受限应用中介路径通过", () => {
  assert.deepEqual(evaluate(strictCore("demo"), hostFor("demo")), { ok: true }, "demo 只走严格路径，现状不变（P1.6 F2/F14）");
  assert.deepEqual(evaluate(strictCore("codex"), hostFor("codex")), { ok: true }, "Codex 严格 native 路径原条件成立时通过（P3）");
  for (const runtime of ["claude", "pi", "codex"] as const) {
    assert.deepEqual(evaluate(mediatedCore(runtime), hostFor(runtime)), { ok: true },
      `${runtime}: status unknown + nativeToolRegistry unknown + kind + verified 全部成立（P4）`);
  }
});

test("P6/N16：活跃 dispatch 工具名在该运行时的 applicationMediation.appTools 中（含 ans_dispatch_task 同权）", () => {
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const core = mediatedCore(runtime, {
      appTools: ["ans_dispatch_task", "read_file"],
      applicationMediation: makeMediation(runtime, { appTools: ["ans_dispatch_task", "read_file"] }),
    }, {}, { lifecycle: makeLifecycle({ activeTools: [{ id: "tool-1", name: "ans_dispatch_task" }] }) });
    assert.deepEqual(evaluate(core, hostFor(runtime)), { ok: true }, `${runtime}: ans_dispatch_task 与 dispatch_task 同权`);
  }
});

test("P6/N16：受控 shell（run_shell/start_background_task）在 appTools 时受限路径可通过；严格路径本身仍 unknown", () => {
  const appTools = ["dispatch_task", "run_shell", "start_background_task", "read_file"];
  for (const runtime of ["claude", "pi", "codex"] as const) {
    const core = mediatedCore(runtime, { appTools, applicationMediation: makeMediation(runtime, { appTools }) });
    assert.deepEqual(evaluate(core, hostFor(runtime)), { ok: true }, `${runtime}: 受控 shell 只是应用面工具，不是 native builtin`);
    assert.equal(core.toolSurface!.status, "unknown", `${runtime}: 严格路径本身仍 unknown，不冒充 observed`);
  }
});

test("P7/N26：Claude/Pi 已配置外来 MCP 精确枚举且一致时通过", () => {
  for (const runtime of ["claude", "pi"] as const) {
    const foreign = ["mcp-a", "mcp-b"];
    const core = mediatedCore(runtime, { configuredForeignMcpServers: foreign }, { foreignMcpServers: foreign });
    assert.deepEqual(evaluate(core, hostFor(runtime)), { ok: true }, `${runtime}: 外来 MCP 精确枚举`);
  }
});

test("P5/hub：creatorReports 只在 hub=true 时校验；合法 provenance 通过", () => {
  const core = { ...strictCore("demo"), turnInput: { turnId: TURN, provenance: handbackProvenance("demo") } } as DispatchParentCoreFacts;
  assert.deepEqual(evaluate(core, makeHost({ runtime: "demo" }, creatorReports), true), { ok: true }, "hub=true + 合法 provenance");
  assert.deepEqual(reasonsOf(core, makeHost({ runtime: "demo" }, creatorReports), false), ["creator-reports-mismatch"],
    "hub=false 时 creatorReports 分支拒绝（旧 validParent 行为）");
  assert.deepEqual(evaluate(core, makeHost({ runtime: "demo" }), false), { ok: true }, "未提供 creatorReports 时 hub 不影响结果");
});

test("N18/P：parent.kind 缺省或 message 通过；提供 creatorReports 时跳过 kind 检查（旧分支顺序）", () => {
  assert.deepEqual(evaluate(strictCore("demo"), makeHost({ runtime: "demo", kind: undefined })), { ok: true });
  assert.deepEqual(evaluate(strictCore("demo"), makeHost({ runtime: "demo", kind: "message" })), { ok: true });
  const report = { ...handbackProvenance("demo").reports[0]!, origin: "terminal-fallback" as const, status: "blocked" as const };
  const core = { ...strictCore("demo"), turnInput: { turnId: TURN, provenance: handbackProvenance("demo", { reports: [report] }) } } as DispatchParentCoreFacts;
  assert.deepEqual(evaluate(core, makeHost({ runtime: "demo", kind: "handback" }, creatorReports), true), { ok: true },
    "合法 creatorReports 分支提前返回，不再看 parent.kind（与旧实现一致）");
});

// —————————————— 严格路径原条件保留（P3；N1–N9 严格侧） ——————————————

test("P3/N1–N9：严格路径原条件逐条保留（disposed/非默认核/非 chief/wrong runtime/unknown surface/session/factory/turn/stop/no dispatch/input/settled）", () => {
  const cases: Array<[string, DispatchParentCoreFacts, string]> = [
    ["disposed", { ...strictCore("codex"), disposed: true }, "disposed"],
    ["non-default-core", { ...strictCore("codex"), construction: "custom-adapter" }, "not-default-core"],
    ["non-chief", { ...strictCore("codex"), roleId: "convener" }, "evidence-identity-mismatch"],
    ["wrong-runtime", { ...strictCore("codex"), runtime: "demo" }, "wrong-runtime"],
    ["unknown-surface", { ...strictCore("codex"), toolSurface: { ...strictSurface("codex"), status: "unknown" } }, "tool-surface-unknown"],
    ["session-mismatch", strictCore("codex", { sessionId: "other-session" }), "evidence-identity-mismatch"],
    ["custom-factory", strictCore("codex", { factoryProvenance: "custom-override" }), "custom-factory"],
    ["wrong-turn", { ...strictCore("codex"), lifecycle: makeLifecycle({ turnId: "turn-2" }) }, "turn-mismatch"],
    ["stopped", { ...strictCore("codex"), lifecycle: makeLifecycle({ stopRequested: true }) }, "stopped"],
    ["no-active-dispatch", { ...strictCore("codex"), lifecycle: makeLifecycle({ activeTools: [{ id: "tool-2", name: "read_file" }] }) }, "no-active-dispatch"],
  ];
  const host = hostFor("codex");
  for (const [label, core, reason] of cases) assert.equal(reasonsOf(core, host)[0], reason, label);
  assert.equal(reasonsOf(strictCore("codex"), makeHost({ runtime: "codex", inputAccepted: false }))[0], "input-not-accepted");
  assert.equal(reasonsOf(strictCore("codex"), makeHost({ runtime: "codex", settled: true }))[0], "turn-settled");
  assert.equal(reasonsOf(strictCore("codex"), makeHost({ runtime: "codex", turnId: "turn-2" }))[0], "turn-mismatch");
});

test("N13：新应用中介路径拒绝 demo；demo 严格路径现状不变", () => {
  assert.deepEqual(reasonsOf(mediatedCore("claude", {}, {}, { runtime: "demo" }) as DispatchParentCoreFacts, hostFor("demo")),
    ["tool-surface-unknown"], "demo 不会被当作 claude/pi 走受限路径");
  assert.deepEqual(evaluate(strictCore("demo", { factoryProvenance: "demo" }), hostFor("demo")), { ok: true },
    "demo factoryProvenance 在严格路径按旧口径放行");
});

test("N20/F15：applicationMediation 与 observed 同时出现 ⇒ 双路径歧义拒绝", () => {
  const forged = (runtime: string) => {
    const base = strictCore(runtime as "demo");
    return { ...base, toolSurface: { ...strictSurface(runtime as "demo"), applicationMediation: makeMediation("claude") } } as DispatchParentCoreFacts;
  };
  assert.deepEqual(reasonsOf(forged("codex"), hostFor("codex")), ["application-mediation-ambiguous"]);
  for (const runtime of ["claude", "pi", "demo"] as const) {
    assert.deepEqual(reasonsOf(forged(runtime), hostFor(runtime)), ["application-mediation-ambiguous"], `${runtime}: observed+verified 不允许双路径`);
  }
});

test("N1/N9：其它 runtime 一律拒绝；core 缺失时拒绝", () => {
  assert.deepEqual(evaluate(undefined), { ok: false, reasons: ["evidence-missing"] });
  const unknown = { ...strictCore("demo"), runtime: "mystery" } as unknown as DispatchParentCoreFacts;
  assert.deepEqual(reasonsOf(unknown, makeHost({ runtime: "mystery" })), ["wrong-runtime"]);
});

// —————————————— 受限路径负例（N10–N12/N21–N23/N25–N28） ——————————————

test("N10/N21/N22/N23/N25/N27/N28：受限路径逐条负例", () => {
  const claude = hostFor("claude");
  const surface = (overrides: Record<string, unknown>, mediation: Record<string, unknown> = {}) => mediatedCore("claude", overrides, mediation);
  const cases: Array<[string, DispatchParentCoreFacts, string]> = [
    ["missing-mediation", surface({ applicationMediation: undefined }), "application-mediation-unverified"],
    ["mediation-unknown", surface({}, { status: "unknown" }), "application-mediation-unverified"],
    ["mediation-wrong-kind", surface({}, { kind: "observed-native" }), "application-mediation-unverified"],
    ["mediation-wrong-factory", surface({}, { factory: "codex-chat" }), "application-mediation-unverified"],
    ["mediation-reasons", surface({}, { reasons: ["role-capability-callback-guard-unverified"] }), "application-mediation-unverified"],
    ["native-builtin", surface({}, { nativeBuiltinTools: ["WebSearch"] }), "native-builtin-present"],
    ["native-tool-registry", surface({ nativeToolRegistry: "application-mediated" }), "registry-mismatch"],
    ["app-tools-mismatch", surface({}, { appTools: ["read_file", "write_file"] }), "registry-mismatch"],
    ["foreign-mismatch", surface({ configuredForeignMcpServers: ["mcp-a"] }, { foreignMcpServers: [] }), "registry-mismatch"],
    ["dispatch-not-in-appTools", surface({}, { appTools: ["read_file"] }), "registry-mismatch"],
    ["session-mismatch", surface({ sessionId: "other-session" }), "evidence-identity-mismatch"],
    ["custom-factory", surface({ factoryProvenance: "custom-override" }), "custom-factory"],
    ["demo-factory", surface({ factoryProvenance: "demo" }), "custom-factory"],
    ["mediation-runtime-mismatch", surface({}, { runtime: "pi" }), "evidence-identity-mismatch"],
    ["wrong-role", { ...mediatedCore("claude"), roleId: "convener" }, "evidence-identity-mismatch"],
    ["wrong-runtime", mediatedCore("claude"), "wrong-runtime"],
    ["disposed", { ...mediatedCore("claude"), disposed: true }, "disposed"],
    ["non-default-core", { ...mediatedCore("claude"), construction: "custom-adapter" }, "not-default-core"],
    ["wrong-turn", { ...mediatedCore("claude"), lifecycle: makeLifecycle({ turnId: "turn-2" }) }, "turn-mismatch"],
    ["stopped", { ...mediatedCore("claude"), lifecycle: makeLifecycle({ stopRequested: true }) }, "stopped"],
    ["no-active-dispatch", { ...mediatedCore("claude"), lifecycle: makeLifecycle({ activeTools: [{ id: "tool-2", name: "read_file" }] }) }, "no-active-dispatch"],
  ];
  for (const [label, core, reason] of cases) {
    const host = label === "wrong-runtime" ? hostFor("codex") : claude;
    assert.deepEqual(reasonsOf(core, host), [reason], label);
  }
  assert.deepEqual(reasonsOf(mediatedCore("claude"), makeHost({ runtime: "claude", inputAccepted: false })), ["input-not-accepted"]);
  assert.deepEqual(reasonsOf(mediatedCore("claude"), makeHost({ runtime: "claude", settled: true })), ["turn-settled"]);
});

test("N14/N27：Codex 应用中介路径必须有 native 事实且按字面谓词绑定", () => {
  const host = hostFor("codex");
  assert.deepEqual(evaluate(mediatedCore("codex"), host), { ok: true },
    "native.nativeInstanceId === applicationMediation.nativeInstanceId（同值）⇒ 通过（Amendment-1）");
  assert.deepEqual(evaluate(mediatedCore("codex", {}, {}, { lifecycle: makeLifecycle({ runtime: "codex", native: undefined }) }), host), { ok: true },
    "lifecycle native 证据缺席只跳过附加防御，不放宽字面谓词、也不拒绝合法 verified 事实");
  const cases: Array<[string, DispatchParentCoreFacts]> = [
    ["native-missing", mediatedCore("codex", { native: undefined })],
    ["native-wrong-factory", mediatedCore("codex", { native: makeNativeSurface("codex", { factory: "unknown" }) })],
    ["native-instance-mismatch", mediatedCore("codex", { native: makeNativeSurface("codex", { nativeInstanceId: "native-2" }) })],
    ["binding-mismatch", mediatedCore("codex", {}, { nativeInstanceId: "native-2" })],
    ["binding-missing", mediatedCore("codex", {}, { nativeInstanceId: undefined })],
    ["binding-empty", mediatedCore("codex", {}, { nativeInstanceId: "" })],
    ["native-instance-missing", mediatedCore("codex", { native: makeNativeSurface("codex", { nativeInstanceId: undefined }) })],
    ["both-missing", mediatedCore("codex", { native: makeNativeSurface("codex", { nativeInstanceId: undefined }) }, { nativeInstanceId: undefined })],
    ["lifecycle-native-mismatch", mediatedCore("codex", {}, {}, { lifecycle: makeLifecycle({ runtime: "codex", native: { ...makeLifecycle().native!, instanceId: "native-9" } }) })],
  ];
  for (const [label, core] of cases) {
    assert.deepEqual(reasonsOf(core, host), ["tool-surface-unknown", "evidence-identity-mismatch"], `${label} ⇒ 拒绝（fail-closed）`);
  }
});

test("N28/F19：Codex 配置外来 MCP ⇒ fail-closed", () => {
  const host = hostFor("codex");
  const configured = mediatedCore("codex", { configuredForeignMcpServers: ["mcp-a"] });
  assert.deepEqual(reasonsOf(configured, host), ["tool-surface-unknown", "registry-mismatch"], "配置非空但应用面 foreign [] ⇒ 不一致");
  const reported = mediatedCore("codex", {}, { foreignMcpServers: ["mcp-a"] });
  assert.deepEqual(reasonsOf(reported, host), ["tool-surface-unknown", "registry-mismatch"], "应用面自报外来 MCP 同样不一致");
});

// —————————————— Codex 双阶段：严格优先，受限兜底（P6/N16） ——————————————

test("P6/N16：Codex 先走严格路径；严格不成立时才走受限路径；双路径歧义单独拒绝", () => {
  const host = hostFor("codex");
  assert.deepEqual(evaluate(strictCore("codex"), host), { ok: true }, "严格路径成立即通过");
  const shell = mediatedCore("codex", { appTools: ["dispatch_task", "run_shell", "read_file"] }, { appTools: ["dispatch_task", "run_shell", "read_file"] });
  assert.deepEqual(evaluate(shell, host), { ok: true }, "严格 unknown（受控 shell）时受限路径通过");
  assert.equal(shell.toolSurface!.status, "unknown", "严格路径本身仍 unknown，不冒充 observed");
  const neither = { ...shell, lifecycle: makeLifecycle({ runtime: "codex", activeTools: [{ id: "tool-2", name: "read_file" }] }) };
  assert.deepEqual(reasonsOf(neither, host), ["tool-surface-unknown", "no-active-dispatch"], "两段原因都如实返回（去重）");
  assert.deepEqual(reasonsOf(mediatedCore("codex", { status: "observed" }), host), ["application-mediation-ambiguous"], "observed+verified ⇒ 歧义");
});

// —————————————— creatorReports 负例（N19） ——————————————

test("N19：creatorReports 数量/重复/角色/turn/reportId/origin/status 任一不匹配 ⇒ 拒绝", () => {
  const coreFor = (provenance: unknown) => ({ ...strictCore("demo"), turnInput: { turnId: TURN, provenance } }) as DispatchParentCoreFacts;
  const host = makeHost({ runtime: "demo" }, creatorReports);
  assert.deepEqual(evaluate(coreFor(handbackProvenance("demo")), host, true), { ok: true });
  const variants: Array<[string, unknown]> = [
    ["missing provenance", undefined],
    ["wrong kind", handbackProvenance("demo", { kind: "message" })],
    ["wrong source turn", handbackProvenance("demo", {}, { source: { roleId: "convener", runtime: "demo", turnId: "other-turn" } })],
    ["wrong target role", handbackProvenance("demo", { target: { roleId: "convener", runtime: "demo" } })],
    ["wrong target runtime", handbackProvenance("demo", { target: { roleId: "chief", runtime: "pi" } })],
    ["wrong turnInput turn", handbackProvenance("demo")],
    ["wrong report task", handbackProvenance("demo", {}, { taskId: "task-2" })],
    ["wrong report role", handbackProvenance("demo", {}, { source: { roleId: "product", runtime: "demo", turnId: "report-turn-1" } })],
    ["wrong reportId", handbackProvenance("demo", {}, { reportId: "report-2" })],
    ["wrong origin", handbackProvenance("demo", {}, { origin: "terminal-fallback-other" })],
    ["wrong status", handbackProvenance("demo", {}, { status: "unknown-status" })],
    ["report count mismatch", handbackProvenance("demo", { reports: [] })],
  ];
  for (const [label, provenance] of variants) {
    const core = label === "wrong turnInput turn"
      ? { ...coreFor(handbackProvenance("demo")), turnInput: { turnId: "turn-2", provenance: handbackProvenance("demo") } } as DispatchParentCoreFacts
      : coreFor(provenance);
    assert.deepEqual(reasonsOf(core, host, true), ["creator-reports-mismatch"], label);
  }
  assert.deepEqual(reasonsOf(coreFor(handbackProvenance("demo")), makeHost({ runtime: "demo" }, [creatorReports[0]!, creatorReports[0]!]), true),
    ["creator-reports-mismatch"], "重复 taskId");
  assert.deepEqual(reasonsOf(coreFor(handbackProvenance("demo")), makeHost({ runtime: "demo" }, new Array(17).fill(creatorReports[0])), true),
    ["creator-reports-mismatch"], "超过 16 条");
});

test("N18：parent.kind 非 message（且无 creatorReports）⇒ 拒绝", () => {
  assert.deepEqual(reasonsOf(strictCore("demo"), makeHost({ runtime: "demo", kind: "handback" })), ["parent-kind-invalid"]);
  assert.deepEqual(reasonsOf(mediatedCore("claude"), makeHost({ runtime: "claude", kind: "dispatch" })), ["parent-kind-invalid"]);
});

// —————————————— TOCTOU：同一判定被两次调用，证据变化后第二次拒绝（N17） ——————————————

test("N17：TOCTOU 两次复检——证据在两次判定之间变化时第二次拒绝", () => {
  let current: DispatchParentCoreFacts = mediatedCore("claude");
  const recheck = () => evaluate(current, hostFor("claude"), true);
  assert.deepEqual(recheck(), { ok: true }, "第一次复检通过");
  current = { ...current, lifecycle: makeLifecycle({ turnId: "turn-2" }) };
  assert.deepEqual(recheck(), { ok: false, reasons: ["turn-mismatch"] }, "turn 变化 ⇒ 第二次拒绝");
  current = mediatedCore("claude");
  assert.deepEqual(recheck(), { ok: true }, "恢复证据后再次通过（每次读取当刻事实）");
  current = { ...current, disposed: true };
  assert.deepEqual(recheck(), { ok: false, reasons: ["disposed"] }, "dispose 变化 ⇒ 第二次拒绝");
  current = mediatedCore("claude");
  current = { ...current, toolSurface: { ...current.toolSurface!, nativeToolRegistry: "application-mediated" } };
  assert.deepEqual(recheck(), { ok: false, reasons: ["registry-mismatch"] }, "registry/evidence 漂移 ⇒ 第二次拒绝");
  current = mediatedCore("claude");
  current = { ...current, lifecycle: makeLifecycle({ stopRequested: true }) };
  assert.deepEqual(recheck(), { ok: false, reasons: ["stopped"] }, "stopRequested 变化 ⇒ 第二次拒绝");
});

// —————————————— reason 闭集可达性（E0.3 §5.3） ——————————————

test("reason 闭集：18 项全部可达，且判定不产生闭集之外的 reason", () => {
  const expected = [
    "application-mediation-ambiguous", "application-mediation-unverified", "creator-reports-mismatch", "custom-factory",
    "disposed", "evidence-identity-mismatch", "evidence-missing", "input-not-accepted", "native-builtin-present",
    "no-active-dispatch", "not-default-core", "parent-kind-invalid", "registry-mismatch", "stopped",
    "tool-surface-unknown", "turn-mismatch", "turn-settled", "wrong-runtime",
  ];
  const observed = new Set<string>();
  for (const scenario of differentialScenarios()) {
    for (const hub of [true, false]) {
      const decision = evaluateChiefDispatchParent({ host: scenario.host, core: scenario.core, hub });
      if (!decision.ok) for (const reason of decision.reasons) observed.add(reason);
    }
  }
  assert.deepEqual([...observed].sort(), expected, "门矩阵覆盖 18 项闭集（不多不少）");
});

// —————————————— 结构守卫（R5/D5；不采集证据、不消费写门） ——————————————

test("R5/D5：gates 模块只判定、不采集证据；import 面只有 Model public entry", async () => {
  const moduleRoot = path.join(REPO_ROOT, "src/common/gates");
  const entries = await fs.readdir(moduleRoot, { withFileTypes: true });
  assert.deepEqual(entries.filter(entry => entry.isFile()).map(entry => entry.name), ["index.ts"], "模块根只允许 index.ts（唯一 public entry）");
  const source = await fs.readFile(path.join(moduleRoot, "index.ts"), "utf8");
  assert.equal((source.match(/export function evaluateChiefDispatchParent/g) ?? []).length, 1, "唯一导出判定函数（无第二实现）");
  assert.ok(!source.includes("inspectInitializationProtection"), "本模块不承载写/初始化门（不并入写路径判定）");
  const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(specifiers)].sort(), ["../../model/runtime.ts"], "只 import Model public 类型（不 import 角色/引擎/私有 common）");
});

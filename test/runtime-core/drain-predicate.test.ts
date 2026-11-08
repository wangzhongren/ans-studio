/**
 * W1（2026-11-08「删除全部预知式门控」P1.4 §3.7 / I0-3）drain 谓词真值表。
 *
 * 契约（I0-3 冻结）：`providerFinished && activeTools.length===0 &&
 * processes.every(state==="exited" && (treeStatus==="verified" || kind==="background")) &&
 * reasons ⊆ DRAIN_EVIDENCE_ONLY_REASONS ∪ DRAIN_NATIVE_EVIDENCE_REASONS`。
 * 未列/未知 reason **一律阻断**（含 `native:pi-sdk-idle-not-observed`、handler-running/not-terminal/
 * mcp-process-coverage、native read failure、real-provider-settled-not-observed、cleanup failures、
 * custom disposal）；不要求 status==="quiescent"、processCoverage==="complete"、native 存在。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAIN_EVIDENCE_ONLY_REASONS,
  DRAIN_NATIVE_EVIDENCE_REASONS,
  isRuntimeSessionDrained,
  type RuntimeOwnedProcessFact,
  type RuntimeSessionLifecycleFacts,
} from "../../src/model/runtime.ts";

const baseline = (overrides: Partial<RuntimeSessionLifecycleFacts> = {}): RuntimeSessionLifecycleFacts => ({
  sessionId: "drain-session", roleId: "worker", runtime: "claude", turnId: "turn-1", stopRequested: true,
  status: "unknown", providerFinished: true, activeTools: [], processes: [], processCoverage: "unknown", reasons: [],
  ...overrides,
});
const factsWith = (reasons: readonly string[], overrides: Partial<RuntimeSessionLifecycleFacts> = {}) => baseline({ reasons, ...overrides });

test("drain I0-3 白名单逐字冻结：仅两个包装层 reason + 四个 native 覆盖/传输关闭 reason", () => {
  assert.deepEqual([...DRAIN_EVIDENCE_ONLY_REASONS].sort(), [
    "native-provider-not-proven-quiescent",
    "native-provider-process-coverage-unavailable",
  ]);
  assert.deepEqual([...DRAIN_NATIVE_EVIDENCE_REASONS].sort(), [
    "native:Claude SDK Query exposes no owned PID, descendant-tree inventory, process exit/close event or exit code; process coverage is unknown.",
    "native:Query.close(): void and interrupt acknowledgement do not verify CLI exit, HTTP completion or descendant shutdown.",
    "native:pi-sdk-http-transport-close-unobservable",
    "native:pi-sdk-owned-process-tree-coverage-unavailable",
  ]);
  // 显式列名、无 `native:` 前缀通配。
  for (const reason of DRAIN_NATIVE_EVIDENCE_REASONS) assert.match(reason, /^native:/);
  for (const reason of DRAIN_EVIDENCE_ONLY_REASONS) assert.doesNotMatch(reason, /^native:/);
});

test("drain 基础真值表：providerFinished/activeTools/tracked processes", () => {
  assert.equal(isRuntimeSessionDrained(baseline()), true, "无工作、无 reason ⇒ drained");
  assert.equal(isRuntimeSessionDrained(baseline({ providerFinished: false })), false, "provider 未完成 ⇒ 阻断");
  assert.equal(isRuntimeSessionDrained(factsWith([], { activeTools: [{ id: "tool-1", name: "write_file" }] })), false, "active tool ⇒ 阻断");
  assert.equal(isRuntimeSessionDrained(factsWith([], { processes: [{ id: "p1", kind: "shell", state: "running", treeStatus: "verified" }] })), false);
  assert.equal(isRuntimeSessionDrained(factsWith([], { processes: [{ id: "p1", kind: "native", state: "unknown", treeStatus: "unknown" }] })), false);
  assert.equal(isRuntimeSessionDrained(factsWith([], { processes: [{ id: "p1", kind: "shell", state: "exited", treeStatus: "verified" }] })), true);
  assert.equal(isRuntimeSessionDrained(factsWith([], { processes: [{ id: "p1", kind: "native", state: "exited", treeStatus: "verified" }] })), true);
  assert.equal(isRuntimeSessionDrained(factsWith([], { processes: [{ id: "p1", kind: "mcp", state: "exited", treeStatus: "unknown" }] })), false, "非 background 的未知树状态 ⇒ 阻断");
  assert.equal(isRuntimeSessionDrained(factsWith([], { processes: [{ id: "p1", kind: "background", state: "exited", treeStatus: "unknown" }] })), true, "background 以管理器 stop/exited 为准");
  assert.equal(isRuntimeSessionDrained(factsWith([], { processes: [{ id: "p1", kind: "background", state: "running", treeStatus: "unknown" }] })), false);
});

test("drain 不要求 status quiescent / processCoverage complete / native 存在（Claude/Pi 形态）", () => {
  const claudeShape = factsWith([
    "native-provider-not-proven-quiescent",
    "native:Claude SDK Query exposes no owned PID, descendant-tree inventory, process exit/close event or exit code; process coverage is unknown.",
    "native:Query.close(): void and interrupt acknowledgement do not verify CLI exit, HTTP completion or descendant shutdown.",
  ], { status: "unknown", processCoverage: "unknown", runtime: "claude" });
  assert.equal(isRuntimeSessionDrained(claudeShape), true, "Claude 覆盖 unknown 只作证据");
  const piIdle = factsWith([
    "native-provider-not-proven-quiescent",
    "native:pi-sdk-owned-process-tree-coverage-unavailable",
    "native:pi-sdk-http-transport-close-unobservable",
  ], { status: "unknown", processCoverage: "unknown", runtime: "pi" });
  assert.equal(isRuntimeSessionDrained(piIdle), true, "idle Pi（无 pi-sdk-idle-not-observed）仍可 drain");
  // native 字段存在与否不影响判定（仅证据）。
  assert.equal(isRuntimeSessionDrained({ ...claudeShape, native: undefined }), true);
  assert.equal(isRuntimeSessionDrained({ ...baseline(), status: "quiescent", processCoverage: "complete" }), true);
});

test("drain 显式白名单 reason 单独与组合均不阻断", () => {
  for (const reason of [...DRAIN_EVIDENCE_ONLY_REASONS, ...DRAIN_NATIVE_EVIDENCE_REASONS])
    assert.equal(isRuntimeSessionDrained(factsWith([reason])), true, reason);
  assert.equal(isRuntimeSessionDrained(factsWith([...DRAIN_EVIDENCE_ONLY_REASONS, ...DRAIN_NATIVE_EVIDENCE_REASONS])), true);
});

test("drain 未列/未知 reason 一律阻断（F6/R7/S1 清单）", () => {
  const blocking = [
    // S1：非 idle Pi 的 live-work 信号必须阻断（不得用前缀通配放过）。
    "native:pi-sdk-idle-not-observed",
    "native:pi-raw-prompt-pending",
    "native:pi-owned-mcp-close-pending",
    "native:pi-native-stop-operation-failed",
    "native:native-tool-handler-running",
    "native:native-tool-not-terminal",
    "native:native-mcp-process-coverage-unavailable",
    // 读取失败 / 真实结算未观测 / 清理失败 / custom disposal（F6 明列阻断项）。
    "native-provider-lifecycle-read-failed",
    "real-provider-settled-not-observed",
    "provider-abort-cleanup-failed",
    "native-stop-facts-invalid-or-failed",
    "owned-process-stop-failed",
    "background-stop-not-proven",
    "custom-provider-disposal-coverage-unverified",
    "disposed-lifecycle-evidence-unavailable",
    // 包装层 live-work/覆盖类。
    "tool-lifecycle-read-failed",
    "background-lifecycle-read-failed",
    "background-start-not-yet-observed",
    "active-tool-or-capability-work",
    "owned-process-not-exited",
    "process-tree-unverified",
    "provider-still-running",
    "core-turn-not-drained",
    "delivery-preflight-in-flight",
    "replay-write-pending",
    "persistence-callback-in-flight",
    "provider-event-pump-not-drained",
    "dispose-cleanup-pending",
    "stop-cleanup-pending",
    "stop-drain-budget-exhausted",
    "stop-inspection-aborted",
    // 未知 reason（含白名单 reason 的前缀/后缀近似串，证明不是前缀匹配）。
    "unknown-reason",
    "native:pi-sdk-owned-process-tree-coverage-unavailable-extra",
    "native-provider-not-proven-quiescent ",
  ];
  for (const reason of blocking) assert.equal(isRuntimeSessionDrained(factsWith([reason])), false, reason);
  // 白名单 reason 与任一阻断 reason 混合同样阻断。
  assert.equal(isRuntimeSessionDrained(factsWith(["native-provider-not-proven-quiescent", "unknown-reason"])), false);
});

// test/测试/run-stop-host-continuation-integration.test.ts
// W5 跨角色集成（2026-11-08「删除全部预知式门控」）：run-stop / controller-stop 的运行时中立 drain、
// native 可选证据、host fence 保留，以及 deferred run-stop 的 host-continuation 授权分支（P1.2-AC-25/29 的
// 集成级正向/负向）。W2 已在 `test/编排/` 做 gate 级验证；本文件在 `test/测试/` 以真实 managed/Core 边界
// 复核同一语义，并如实记录未构造的完整 deferred 提交链边界。
//
// 依据：设计 P1.4 §3.2 C1–C4/C8、§3.3.2 H4/H5、§3.7 drain 谓词、§3.8 码语义收窄、§6.1；B1 v1 AC-8/AC-20、
// P1.2-AC-25/AC-29；I0-3（drain 白名单逐字）、I0-5（finalize 顺序/宿主继续）。
//
// 覆盖：
//  1. host-continuation（deferred run-stop 宿主继续的授权分支）：真实 Core rapporteur 回合 → dispose 后
//     disposed+drain ⇒ gate ok；taskId 不符 / inventory 记录不唯一 / requesterTurnId 漂移 ⇒
//     `git-actor-core-binding-unproven`（P1.2-AC-29）；`finalizeRunChange` 对无准备的 plan 以
//     `run-preparation-invalid` 拒绝（不伪造完整链）。
//  2. drain 谓词（单一来源 `isRuntimeSessionDrained`）的 Claude/Pi 形态与 native 可选：status/processCoverage
//     unknown、native absent、覆盖类 reason ⇒ drained；非 idle Pi（`native:pi-sdk-idle-not-observed`）、
//     handler-running/mcp coverage/read failure/cleanup/未知 reason ⇒ 阻断（I0-3）。
//  3. run-stop/controller-stop 源码结构守卫：成员不再要求 codex/native；finalize 用 drain；native absent 允许、
//     present-but-changed 拒绝；host fence 码保留；gate 先于 host lease；不写 sidecar（R6）。
//
// 说明（如实·覆盖边界）：完整 `prepareRunChange → resumeDeferredRunChanges → executeOwnedRunStop →
// finalizeRunChange` 端到端提交链需要真实 pinned run/冻结证据/host stop fence/run transition journal 夹具，
// 本文件未构造（W2 §覆盖边界、W4 桌面边界、B1 AC-8 真实运行另行覆盖）；本文件证明其授权分支与终止谓词
// 在当前候选上的真实行为，不宣称完整链路已通过。
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";

import {
  createRuntimeAdapter,
  inspectRuntimeCoreRegistry,
  type RuntimeSessionOptions,
} from "../../src/service/runtime/session.ts";
import {
  inspectGitActionAuthorization,
  finalizeRunChange,
  recordGitHostInventory,
} from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { isRuntimeSessionDrained, type RuntimeSessionLifecycleFacts, type RoleSession, type WriteGate } from "../../src/model/runtime.ts";
import type { ResolvedRole } from "../../src/model/role.ts";

const AT = "2026-11-08T00:00:00.000Z";
const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

const allowGate: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "w5-fixture" } });
function fixtureRole(id: string): ResolvedRole {
  return { id, kind: "project", cardText: `# ${id}`,
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
}
function fileGateOptions(root: string): Partial<RuntimeSessionOptions> {
  const protectedGitRoots = [path.join(root, ".git")];
  return { writeRoot: root, protectedGitRoots, fileGateProtocol: "host-facts-v1",
    fileGateProtection: { projectRoot: root, protectedGitRoots, coverage: "unknown", basisDigest: "a".repeat(64), reasons: [] } };
}
async function bindSession(root: string, roleId: string): Promise<RoleSession & { sessionId: string }> {
  const adapter = createRuntimeAdapter({ runtime: "demo", gate: allowGate, projectRoot: root, skillRoot: root, ...fileGateOptions(root) });
  const bound = await adapter.bindRole(fixtureRole(roleId));
  assert.ok(bound.sessionId);
  opened.push(bound);
  return bound as RoleSession & { sessionId: string };
}
function entryOf(sessionId: string) {
  return inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === sessionId);
}
function lifecycle(overrides: Partial<RuntimeSessionLifecycleFacts> = {}): RuntimeSessionLifecycleFacts {
  return { sessionId: "s", roleId: "product", runtime: "claude", stopRequested: false, status: "unknown",
    providerFinished: true, activeTools: [], processes: [], processCoverage: "unknown", reasons: [], ...overrides };
}

// ———————————————— 1. host-continuation（P1.2-AC-25/29 的集成级授权分支） ————————————————

test("host-continuation：真实 rapporteur 回合结束并 dispose（disposed+drain）⇒ gate ok；taskId/唯一性/turn 不符 ⇒ git-actor-core-binding-unproven", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-w5-runchange-"));
  const chief = await bindSession(root, "chief");
  const rapporteur = await bindSession(root, "rapporteur");
  try {
    await rapporteur.prompt("Prepare an actual run-change request (W5 fixture)");
    const settled = rapporteur.inspectLifecycle!();
    assert.ok(settled.turnId, "真实回合 turnId 必须可读");
    await rapporteur.dispose();
    const disposedEntry = entryOf(rapporteur.sessionId);
    assert.equal(disposedEntry?.state, "disposed");
    assert.ok(disposedEntry?.lifecycle && isRuntimeSessionDrained(disposedEntry.lifecycle),
      "default demo rapporteur disposed receipt 以运行时中立 drain 收口（custom provider 不在此列）");
    const publish = (rows: Array<{ hostHandleId: string; roleId: string; coreSessionId: string; taskId?: string; runId?: string; phase?: "live" | "disposed" }>, revision: number) =>
      recordGitHostInventory({ source: "desktop-session-manager", projectRoot: root, observedAt: AT, revision,
        sessions: rows.map(row => ({ hostHandleId: row.hostHandleId, roleId: row.roleId, runtime: "demo", phase: row.phase ?? "live",
          coreSessionId: row.coreSessionId, ...(row.taskId !== undefined ? { taskId: row.taskId } : {}), ...(row.runId !== undefined ? { runId: row.runId } : {}), errors: [] })),
        pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [] });
    const chiefRow = { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId };
    assert.ok(publish([chiefRow, { hostHandleId: "host-rapporteur", roleId: "rapporteur", coreSessionId: rapporteur.sessionId,
      taskId: "task-run-change", runId: "run-1", phase: "disposed" }], 1).ok);
    const base = { projectRoot: root, taskId: "task-run-change", parentCoreSessionId: chief.sessionId,
      expectedActor: { roleId: "rapporteur", coreSessionId: rapporteur.sessionId },
      authorizationMode: "host-continuation" as const, hostContinuation: { requesterTurnId: settled.turnId!, planId: "plan-w5-1" } };
    const pass = await inspectGitActionAuthorization({ ...base });
    assert.equal(pass.ok, true, pass.ok ? "" : `${pass.code}: ${pass.message}`);
    if (pass.ok) {
      assert.deepEqual(pass.controls.drain, { disposed: true }, "host-continuation 接受真正 settled 的 rapporteur（不要求 active tool）");
      assert.equal(pass.actor.taskId, "task-run-change");
      assert.equal(pass.actor.turnId, settled.turnId);
    }
    // P1.2-AC-29 负例：inventory 记录的 taskId 与 input.taskId（held.plan.requesterTaskId）不符。
    const wrongTask = await inspectGitActionAuthorization({ ...base, taskId: "task-other-run" });
    assert.equal(wrongTask.ok, false);
    if (!wrongTask.ok) assert.equal(wrongTask.code, "git-actor-core-binding-unproven");
    // requesterTurnId 漂移（不是该 rapporteur 的真实请求回合）。
    const wrongTurn = await inspectGitActionAuthorization({ ...base, hostContinuation: { requesterTurnId: "not-the-request-turn", planId: "plan-w5-1" } });
    assert.equal(wrongTurn.ok, false);
    if (!wrongTurn.ok) assert.equal(wrongTurn.code, "git-actor-core-binding-unproven");
    // 记录不唯一（同一 coreSessionId/taskId/roleId 的 live + disposed 两条）。
    assert.ok(publish([chiefRow,
      { hostHandleId: "host-rapporteur", roleId: "rapporteur", coreSessionId: rapporteur.sessionId, taskId: "task-run-change", runId: "run-1", phase: "disposed" },
      { hostHandleId: "host-rapporteur-2", roleId: "rapporteur", coreSessionId: rapporteur.sessionId, taskId: "task-run-change", runId: "run-1", phase: "live" }], 2).ok);
    const duplicate = await inspectGitActionAuthorization({ ...base });
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.equal(duplicate.code, "git-actor-core-binding-unproven");
    // 边界（如实）：无真实 prepared run-change 的 finalize 以 `run-preparation-invalid` 拒绝（不伪造完整链）。
    const finalize = await finalizeRunChange({ projectRoot: root, planId: "plan-w5-unprepared", requestDigest: "a".repeat(64) });
    assert.equal(finalize.ok, false);
    if (!finalize.ok) assert.equal(finalize.errorCode, "run-preparation-invalid");
  } finally {
    await fsp.rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

// ———————————————— 2. drain 谓词：Claude/Pi 形态 + native 可选（I0-3 冻结） ————————————————

test("B1-EV3 drain：Claude/Pi 形态（status/processCoverage unknown、native absent）⇒ drained；非 idle Pi/活动面/清理失败/未知 reason ⇒ 阻断", () => {
  const claudeShape = lifecycle({ runtime: "claude", reasons: [
    "native-provider-not-proven-quiescent", "native-provider-process-coverage-unavailable",
    "native:Claude SDK Query exposes no owned PID, descendant-tree inventory, process exit/close event or exit code; process coverage is unknown.",
    "native:Query.close(): void and interrupt acknowledgement do not verify CLI exit, HTTP completion or descendant shutdown."] });
  assert.equal(isRuntimeSessionDrained(claudeShape), true, "Claude 形态：覆盖 unknown 不阻断 drain");
  const piShape = lifecycle({ runtime: "pi", reasons: [
    "native-provider-not-proven-quiescent", "native-provider-process-coverage-unavailable",
    "native:pi-sdk-owned-process-tree-coverage-unavailable", "native:pi-sdk-http-transport-close-unobservable"] });
  assert.equal(isRuntimeSessionDrained(piShape), true, "Pi idle 形态（无 idle-not-observed）可 drained");
  // native 存在与否不改变 drain（仅证据）。
  assert.equal(isRuntimeSessionDrained(lifecycle({ runtime: "codex", processCoverage: "complete",
    native: { instanceId: "n-1", roleId: "convener", runtime: "codex", status: "unknown", reasons: [] } as never })), true);
  // 阻断项（I0-3 逐条；未列默认阻断）。
  for (const reason of ["native:pi-sdk-idle-not-observed", "native:native-tool-handler-running", "native:native-tool-not-terminal",
    "native:native-mcp-process-coverage-unavailable", "native-provider-lifecycle-read-failed", "real-provider-settled-not-observed",
    "provider-abort-cleanup-failed", "native-stop-facts-invalid-or-failed", "owned-process-stop-failed", "background-stop-not-proven",
    "custom-provider-disposal-coverage-unverified", "some-unknown-reason"]) {
    assert.equal(isRuntimeSessionDrained(lifecycle({ reasons: [reason] })), false, `阻断 reason: ${reason}`);
  }
  assert.equal(isRuntimeSessionDrained(lifecycle({ activeTools: [{ id: "t", name: "git_candidate" }] })), false, "active tool ⇒ 阻断");
  assert.equal(isRuntimeSessionDrained(lifecycle({ providerFinished: false })), false, "provider 未完成 ⇒ 阻断");
  assert.equal(isRuntimeSessionDrained(lifecycle({ processes: [{ id: "p", kind: "shell", state: "running", treeStatus: "unknown" }] })), false);
  assert.equal(isRuntimeSessionDrained(lifecycle({ processes: [{ id: "p", kind: "shell", state: "exited", treeStatus: "unknown" }] })), false, "tree 未验证的普通进程 ≠ drained");
  assert.equal(isRuntimeSessionDrained(lifecycle({ processes: [{ id: "b", kind: "background", state: "exited", treeStatus: "unknown" }] })), true, "background 以管理器 stop/exited 为准");
});

// ———————————————— 3. C1–C4 源码结构守卫（run-stop/controller-stop） ————————————————

test("AC-8/AC-20 run-stop/controller-stop：成员=Core+可选 native；finalize 用 drain；present-but-changed 拒绝；host fence 保留；不写 sidecar", async () => {
  const source = await fsp.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
  const slice = (from: string, to: string): string => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.ok(start > 0 && end > start, `源码段可定位：${from} → ${to}`);
    return source.slice(start, end);
  };
  const prepareRunChange = slice("export async function prepareRunChange", "export async function finalizeRunChange");
  const finalizeRunChangeSource = slice("export async function finalizeRunChange", "export interface ControllerStopHostPlan");
  const prepareControllerStop = slice("export async function prepareControllerStop", "export async function finalizeControllerStop");
  const finalizeControllerStop = slice("export async function finalizeControllerStop", "export async function readRunRoleContext");
  // C1/C3：成员不再要求 codex/native；Core/role/task 身份与码保留。
  assert.equal(prepareRunChange.includes('fact.runtime !== "codex"'), false, "C1：成员不再要求 codex");
  assert.ok(prepareRunChange.includes('fact.construction !== "default-core"'), "C1：Core 身份保留");
  assert.ok(prepareRunChange.includes('"run-stop-member-lifecycle-unproven"'), "run-stop-member-lifecycle-unproven 码保留（语义收窄）");
  assert.equal(prepareControllerStop.includes('actual.runtime !== "codex"'), false, "C3：controller 不再要求 codex");
  assert.ok(prepareControllerStop.includes('"controller-stop-target-instance-unproven"'), "controller-stop-target-instance-unproven 码保留（Core 身份）");
  // C2/C4：drain 终止 + native absent 允许 / present-but-changed 拒绝 + host fence 保留。
  assert.ok(finalizeRunChangeSource.includes("isRuntimeSessionDrained(fact.lifecycle)"), "C2：run-stop finalize 用运行时中立 drain");
  assert.ok(finalizeRunChangeSource.includes("member.nativeInstanceId !== undefined && (native.instanceId !== member.nativeInstanceId"), "C2：present-but-changed 拒绝（absent 允许）");
  assert.ok(finalizeRunChangeSource.includes('"run-stop-instance-unproven"'), "run-stop-instance-unproven 保留");
  assert.ok(finalizeRunChangeSource.includes('"run-stop-host-fence-unproven"'), "AC-8：host fence 保留");
  assert.ok(finalizeRunChangeSource.includes('"run-stop-persistence-unproven"'), "队列持久化/host fence 保留");
  assert.ok(finalizeControllerStop.includes("isRuntimeSessionDrained(fact)"), "C4：controller terminal 用 drain");
  assert.ok(finalizeControllerStop.includes("member.nativeInstanceId !== undefined && (native.instanceId !== member.nativeInstanceId"), "C4：present-but-changed 拒绝");
  assert.ok(finalizeControllerStop.includes('"controller-stop-host-fence-unproven"'), "AC-20：controller host fence 保留");
  // I0-5/R6：finalize gate 先于 host lease；run-stop/controller-stop 不写 sidecar。
  assert.ok(finalizeRunChangeSource.indexOf("inspectGitActionAuthorization(source)") < finalizeRunChangeSource.indexOf('beginGitHostAction({ projectRoot: input.projectRoot, kind: "git-mutation"'),
    "gate 先于 host lease（既有顺序保持）");
  assert.ok(finalizeRunChangeSource.includes('"host-continuation"'), "finalize 使用 host-continuation 模式");
  assert.equal(/appendGitActionAuthorization|authorization\.jsonl/.test(finalizeRunChangeSource + finalizeControllerStop), false, "run-stop/controller-stop 不写 sidecar（R6）");
  // apply-journal（C5）：run-stop commit 终止证据改 drain；`run-stop-unverified`/host fence 语义保留。
  const applyJournal = await fsp.readFile(new URL("../../src/service/trunk/impl/apply-journal.ts", import.meta.url), "utf8");
  const commitSegment = applyJournal.slice(applyJournal.indexOf("commitPreparedRunChange"), applyJournal.indexOf("prepareControllerStop"));
  assert.ok(commitSegment.includes("isRuntimeSessionDrained"), "C5：commitPreparedRunChange 用 drain 谓词");
  assert.ok(commitSegment.includes('"run-stop-unverified"'), "run-stop-unverified 码保留（语义收窄）");
  assert.equal(commitSegment.includes('processCoverage === "complete"'), false, "C5：processCoverage complete 不再是前提");
});

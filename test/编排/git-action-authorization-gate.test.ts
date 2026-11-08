// test/编排/git-action-authorization-gate.test.ts
// W2（2026-11-08「删除全部预知式门控」P1.4 §3.3 / I0-4/I0-5/I0-6）：
// `inspectGitActionAuthorization`（原 `inspectInitializationProtection`）的确定性行为。
//
// 覆盖：
//  - active-tool 正向（真实 Core 会话 + host inventory 发布；输出只含 actor/controls/optionalEvidence，
//    不含 authorization/policyInputDigests/leaseId）；
//  - `expectedTool` 缺失 ⇒ `git-actor-core-binding-unproven`（S5 fail-closed）；actor 身份/角色/任务不符同码；
//  - F8：foreign MCP 只进 optionalEvidence（不判定、不宣称阻断）；
//  - H13：prepared 未撤销条目 ⇒ `git-core-in-flight-unproven`；撤销后豁免（真实边界，不是注册表级预知）；
//  - F2/R1 host-continuation：真正 settled（disposed+drain）的 rapporteur 正向；taskId 不符 /
//    inventory 记录不唯一 / requesterTurnId 漂移 ⇒ `git-actor-core-binding-unproven`；
//  - 退役码（git-core-creation-proof-unavailable / git-native-surface-unproven / git-unclosed-effect-registered）
//    不再产生。
//
// 说明（如实）：本文件用 demo 运行时构造真实 Core 注册表条目；host inventory 由测试扮演真实宿主发布
// （`recordGitHostInventory`）。Core 注册表是进程级的，因此全部会话共用同一临时项目根并在进程结束时
// 关闭——这也覆盖 AC-6（无关 active 会话不再阻断 actor 动作）。完整 `finalizeRunChange` 提交链属跨角色
// 集成（W5 / B1 AC-8 真实运行）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, after } from "node:test";

import { createRuntimeAdapter, discardRuntimeRolePreparation, inspectRuntimeCoreRegistry, type RuntimeSessionOptions } from "../../src/service/runtime/session.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { inspectGitActionAuthorization, recordGitHostInventory } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { GitCandidateFn, RoleSession, RuntimeAdapter } from "../../src/model/runtime.ts";
import { allow, role, until } from "../runtime-core/fixtures.ts";

const at = "2026-11-08T00:00:00.000Z";
const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

/** 受保护项目的 host 文件守卫事实（本测试项目没有 .git；H7 只核 [projectRoot/.git]）。 */
function fileGateOptions(root: string): Partial<RuntimeSessionOptions> {
  const protectedGitRoots = [path.join(root, ".git")];
  return { writeRoot: root, protectedGitRoots, fileGateProtocol: "host-facts-v1",
    fileGateProtection: { projectRoot: root, protectedGitRoots, coverage: "unknown", basisDigest: "a".repeat(64), reasons: [] } };
}

type BoundSession = RoleSession & { sessionId: string };
const shared = (() => {
  let created: Promise<{ root: string; chief: BoundSession }> | undefined;
  return () => created ??= (async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-w2-gate-"));
    // F8：活动面的 foreign MCP 声明（角色 convener）——只应出现在 optionalEvidence，不参与判定。
    await fs.mkdir(path.join(root, "docs", "mcp"), { recursive: true });
    await fs.writeFile(path.join(root, "docs", "mcp", "foreign.md"),
      "# MCP 声明：foreign\n- 用途：fixture\n- 启动：node\n- 适用角色：convener\n- 状态：installed\n- 安装日期：2026-11-08\n");
    const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, ...fileGateOptions(root) });
    const chief = await adapter.bindRole(role("chief"));
    assert.ok(chief.sessionId);
    opened.push(chief);
    return { root, chief: chief as BoundSession };
  })();
})();

async function bindDemo(root: string, roleId: string, options: Partial<RuntimeSessionOptions> = {}): Promise<{ adapter: RuntimeAdapter; session: BoundSession }> {
  const adapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, ...fileGateOptions(root), ...options });
  const bound = await adapter.bindRole(role(roleId));
  assert.ok(bound.sessionId, "bound session has an actual session id");
  const session = bound as BoundSession;
  opened.push(session);
  return { adapter, session };
}

/** 阻塞中的 git_candidate 调用：工具保持 active，直到测试释放。 */
function heldGitCandidate() {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const gitCandidate: GitCandidateFn = async input => {
    await held;
    return { operationId: input.operationId, repoId: "fixture", status: "blocked", code: "fixture-gate", message: "fixture only" };
  };
  return { gitCandidate, release };
}

function gitCandidateScript(operationId: string) {
  return [{ name: "git_candidate", args: { operationId, action: "commit", base: { ref: "refs/ans/trunk", oid: null }, message: "gate fixture", paths: ["docs/a.md"] } }];
}

function inventory(root: string, revision: number, rows: Array<{ hostHandleId: string; roleId: string; coreSessionId: string; taskId?: string; runId?: string; phase?: "live" | "disposed" }>) {
  return recordGitHostInventory({ source: "desktop-session-manager", projectRoot: root, observedAt: at, revision,
    sessions: rows.map(row => ({ hostHandleId: row.hostHandleId, roleId: row.roleId, runtime: "demo", phase: row.phase ?? "live",
      coreSessionId: row.coreSessionId, ...(row.taskId !== undefined ? { taskId: row.taskId } : {}), ...(row.runId !== undefined ? { runId: row.runId } : {}), errors: [] })),
    pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [] });
}

function entryOf(sessionId: string) {
  return inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === sessionId);
}

// ———————————————— active-tool 正向 + 输出形状 + F8 可选证据 ————————————————

test("gate active-tool：真实 Core 会话 + host inventory ⇒ ok；输出只含 actor/controls/optionalEvidence；foreign MCP 只记录", async () => {
  const { root, chief } = await shared();
  const held = heldGitCandidate();
  const actor = await bindDemo(root, "convener", { gitCandidate: held.gitCandidate,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, gitCandidateScript("gate-active-op")) } });
  const pumping = actor.session.prompt("Invoke git_candidate for the gate fixture");
  try {
    await until(() => entryOf(actor.session.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
    assert.equal(inventory(root, 1, [
      { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
      { hostHandleId: "host-actor", roleId: "convener", coreSessionId: actor.session.sessionId, taskId: "task-actor", runId: "run-1" },
    ]).ok, true);
    const result = await inspectGitActionAuthorization({ projectRoot: root, taskId: "task-actor", parentCoreSessionId: chief.sessionId,
      expectedActor: { roleId: "convener", coreSessionId: actor.session.sessionId }, expectedTool: "git_candidate", authorizationMode: "active-tool" });
    assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message}`);
    if (!result.ok) return;
    assert.deepEqual(Object.keys(result).sort(), ["actor", "controls", "inventoryRevision", "ok", "optionalEvidence", "registryRevision", "rootsDigest"],
      "gate 输出只含 actor/controls/optionalEvidence + revisions/rootsDigest；不返回 authorization/policyInputDigests/leaseId");
    assert.equal(Object.hasOwn(result, "authorization"), false);
    assert.equal(Object.hasOwn(result, "policyInputDigests"), false);
    assert.equal(Object.hasOwn(result, "leaseId"), false);
    assert.equal(result.actor.coreSessionId, actor.session.sessionId);
    assert.equal(result.actor.roleId, "convener");
    assert.equal(result.actor.taskId, "task-actor");
    assert.equal(result.actor.runId, "run-1");
    assert.equal(result.actor.turnId, entryOf(actor.session.sessionId)?.lifecycle?.turnId);
    assert.deepEqual(result.controls.drain, { disposed: false });
    assert.deepEqual(result.optionalEvidence.configuredForeignMcpServers, ["foreign"], "F8：foreign MCP 只进 optionalEvidence");
    assert.equal(Object.hasOwn(result.optionalEvidence, "applicationMediation"), false, "PR #72：gate/optionalEvidence 不读 applicationMediation");
  } finally {
    held.release();
    await pumping;
  }
});

// ———————————————— S5：expectedTool 缺失 / actor 身份不符 fail-closed ————————————————

test("gate active-tool：expectedTool 缺失、actor Core/角色/任务不符 ⇒ git-actor-core-binding-unproven", async () => {
  const { root, chief } = await shared();
  const held = heldGitCandidate();
  const actor = await bindDemo(root, "convener", { gitCandidate: held.gitCandidate,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, gitCandidateScript("gate-identity-op")) } });
  const pumping = actor.session.prompt("Invoke git_candidate for identity negatives");
  try {
    await until(() => entryOf(actor.session.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
    assert.equal(inventory(root, 2, [
      { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
      { hostHandleId: "host-actor-2", roleId: "convener", coreSessionId: actor.session.sessionId, taskId: "task-actor-2", runId: "run-1" },
    ]).ok, true);
    const base = { projectRoot: root, taskId: "task-actor-2", parentCoreSessionId: chief.sessionId,
      expectedActor: { roleId: "convener", coreSessionId: actor.session.sessionId }, authorizationMode: "active-tool" as const };
    const missingTool = await inspectGitActionAuthorization({ ...base });
    assert.equal(missingTool.ok, false);
    if (!missingTool.ok) assert.equal(missingTool.code, "git-actor-core-binding-unproven", "S5：active-tool 模式 expectedTool 缺失即 fail-closed");
    const wrongActor = await inspectGitActionAuthorization({ ...base, expectedActor: { roleId: "convener", coreSessionId: "not-the-core-session" }, expectedTool: "git_candidate" });
    assert.equal(wrongActor.ok, false);
    if (!wrongActor.ok) assert.equal(wrongActor.code, "git-actor-core-binding-unproven");
    const wrongRole = await inspectGitActionAuthorization({ ...base, expectedActor: { roleId: "product", coreSessionId: actor.session.sessionId }, expectedTool: "git_candidate" });
    assert.equal(wrongRole.ok, false);
    if (!wrongRole.ok) assert.equal(wrongRole.code, "git-actor-core-binding-unproven");
    const wrongTask = await inspectGitActionAuthorization({ ...base, taskId: "not-the-assigned-task", expectedTool: "git_candidate" });
    assert.equal(wrongTask.ok, false);
    if (!wrongTask.ok) assert.equal(wrongTask.code, "git-actor-core-binding-unproven");
  } finally {
    held.release();
    await pumping;
  }
});

// ———————————————— H13：prepared 未撤销条目 ⇒ git-core-in-flight-unproven ————————————————

test("gate H13：真实边界未撤销的 prepared 条目 ⇒ git-core-in-flight-unproven；撤销后豁免（退役码不再产生）", async () => {
  const { root, chief } = await shared();
  const held = heldGitCandidate();
  const actor = await bindDemo(root, "convener", { gitCandidate: held.gitCandidate,
    providerFactories: { demo: options => createDemoRuntimeAdapter(options, gitCandidateScript("gate-inflight-op")) } });
  // 另一真实 Core 准备：未绑定、token 未撤销 ⇒ handle 产生前的 pending 准备不得被忽略。
  const pendingAdapter = createRuntimeAdapter({ runtime: "demo", gate: allow, projectRoot: root, skillRoot: root, ...fileGateOptions(root) });
  const pending = await pendingAdapter.prepareRole!(role("product"));
  const pumping = actor.session.prompt("Invoke git_candidate while a preparation is pending");
  try {
    await until(() => entryOf(actor.session.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
    assert.equal(inventory(root, 3, [
      { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
      { hostHandleId: "host-actor-3", roleId: "convener", coreSessionId: actor.session.sessionId, taskId: "task-actor-3", runId: "run-1" },
    ]).ok, true);
    const input = { projectRoot: root, taskId: "task-actor-3", parentCoreSessionId: chief.sessionId,
      expectedActor: { roleId: "convener", coreSessionId: actor.session.sessionId }, expectedTool: "git_candidate" as const, authorizationMode: "active-tool" as const };
    const blocked = await inspectGitActionAuthorization(input);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.code, "git-core-in-flight-unproven", "未撤销的 prepared 条目必须拒绝（H13）");
      for (const retired of ["git-core-creation-proof-unavailable", "git-native-surface-unproven", "git-unclosed-effect-registered", "official-pure-preparation-unproven"]) {
        assert.notEqual(blocked.code, retired, `退役码 ${retired} 不得再产生`);
      }
    }
    // 撤销该未绑定准备后，never-started + revoked + 无 pending 属 H13 豁免（真实边界收口）。
    discardRuntimeRolePreparation(pending, new Error("gate H13 fixture revoke"));
    const productEntry = inspectRuntimeCoreRegistry().entries.find(entry => entry.roleId === "product" && entry.state === "prepared");
    assert.equal(productEntry?.construction?.preparedTokensRevoked, true, "撤销后 preparedTokensRevoked=true");
    assert.equal(productEntry?.construction?.factoryEntered, false);
    assert.equal(productEntry?.construction?.pendingContinuations, 0);
    const exempt = await inspectGitActionAuthorization(input);
    assert.equal(exempt.ok, true, exempt.ok ? "" : `${exempt.code}: ${exempt.message}`);
  } finally {
    held.release();
    await pumping;
  }
});

// ———————————————— F2/R1：host-continuation（deferred run-stop 宿主继续） ————————————————

test("gate host-continuation：真正 settled（disposed+drain）的 rapporteur ⇒ ok；taskId/记录唯一性/turn 不符 ⇒ git-actor-core-binding-unproven", async () => {
  const { root, chief } = await shared();
  // rapporteur 使用默认 demo 工厂（非 custom-override）：disposed receipt 以运行时中立 drain 收口。
  const rapporteur = await bindDemo(root, "rapporteur");
  await rapporteur.session.prompt("Prepare an actual run-change request");
  const settled = rapporteur.session.inspectLifecycle!();
  assert.ok(settled.turnId, "真实回合 turnId 必须可读");
  await rapporteur.session.dispose();
  const disposedEntry = entryOf(rapporteur.session.sessionId);
  assert.equal(disposedEntry?.state, "disposed");
  assert.ok(disposedEntry?.lifecycle, "disposed 条目仍可读 lifecycle");
  assert.equal(inventory(root, 4, [
    { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
    { hostHandleId: "host-rapporteur", roleId: "rapporteur", coreSessionId: rapporteur.session.sessionId, taskId: "task-run-change", runId: "run-1", phase: "disposed" },
  ]).ok, true);
  const base = { projectRoot: root, taskId: "task-run-change", parentCoreSessionId: chief.sessionId,
    expectedActor: { roleId: "rapporteur", coreSessionId: rapporteur.session.sessionId },
    authorizationMode: "host-continuation" as const, hostContinuation: { requesterTurnId: settled.turnId!, planId: "plan-fixture-1" } };
  const result = await inspectGitActionAuthorization({ ...base });
  assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message}`);
  if (result.ok) {
    assert.deepEqual(result.controls.drain, { disposed: true }, "host-continuation 接受真正 settled 的 rapporteur");
    assert.equal(result.actor.turnId, settled.turnId);
    assert.equal(result.actor.taskId, "task-run-change");
  }
  // R1 负例：inventory 记录的 taskId 与 input.taskId（held.plan.requesterTaskId）不符。
  const wrongTask = await inspectGitActionAuthorization({ ...base, taskId: "task-other-run" });
  assert.equal(wrongTask.ok, false);
  if (!wrongTask.ok) assert.equal(wrongTask.code, "git-actor-core-binding-unproven", "P1.2-AC-29：taskId 不匹配 ⇒ 拒绝");
  // requesterTurnId 漂移（不是该 rapporteur 的真实请求回合）。
  const wrongTurn = await inspectGitActionAuthorization({ ...base, hostContinuation: { requesterTurnId: "not-the-request-turn", planId: "plan-fixture-1" } });
  assert.equal(wrongTurn.ok, false);
  if (!wrongTurn.ok) assert.equal(wrongTurn.code, "git-actor-core-binding-unproven");
  // 记录不唯一（同一 coreSessionId/taskId/roleId 出现两条 live/disposed 记录）。
  assert.equal(inventory(root, 5, [
    { hostHandleId: "host-chief", roleId: "chief", coreSessionId: chief.sessionId },
    { hostHandleId: "host-rapporteur", roleId: "rapporteur", coreSessionId: rapporteur.session.sessionId, taskId: "task-run-change", runId: "run-1", phase: "disposed" },
    { hostHandleId: "host-rapporteur-2", roleId: "rapporteur", coreSessionId: rapporteur.session.sessionId, taskId: "task-run-change", runId: "run-1", phase: "live" },
  ]).ok, true);
  const duplicate = await inspectGitActionAuthorization({ ...base });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.code, "git-actor-core-binding-unproven", "记录不唯一 ⇒ 拒绝");
  // host-continuation 仍要求 hostContinuation 事实存在。
  const missing = await inspectGitActionAuthorization({ ...base, hostContinuation: undefined });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "git-actor-core-binding-unproven");
});

// ———————————————— C1–C4/Q8：run-stop / controller-stop 运行时中立终态（源码结构守卫） ————————————————

test("W2 C1–C4/Q8：run-stop/controller-stop 成员身份=Core+可选 native；finalize 终止证据用 drain；native absent 允许、present-but-changed 拒绝", async () => {
  const source = await fs.readFile(new URL("../../src/pipeline/orchestration/trunk-runtime.ts", import.meta.url), "utf8");
  const slice = (from: string, to: string): string => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.ok(start > 0 && end > start, `源码段可定位：${from} → ${to}`);
    return source.slice(start, end);
  };
  const prepareRunChange = slice("export async function prepareRunChange", "export async function finalizeRunChange");
  const finalizeRunChange = slice("export async function finalizeRunChange", "export interface ControllerStopHostPlan");
  const prepareControllerStop = slice("export async function prepareControllerStop", "export async function finalizeControllerStop");
  const finalizeControllerStop = slice("export async function finalizeControllerStop", "export async function readRunRoleContext");
  // C1/C3：不再要求 codex/native；身份保留（default Core + role）。
  assert.equal(prepareRunChange.includes('fact.runtime !== "codex"'), false, "C1：成员不再要求 codex");
  assert.equal(prepareRunChange.includes("!native || native.runtime"), false, "C1：native 不再必填");
  assert.ok(prepareRunChange.includes('fact.construction !== "default-core"') && prepareRunChange.includes("fact.roleId !== member.roleId"), "C1：Core/角色身份保留");
  assert.ok(prepareRunChange.includes('"run-stop-member-lifecycle-unproven"'), "码保留（语义收窄）");
  assert.equal(prepareControllerStop.includes('actual.runtime !== "codex"'), false, "C3：controller 不再要求 codex");
  assert.equal(prepareControllerStop.includes("!native || native.roleId"), false, "C3：controller native 不再必填");
  assert.ok(prepareControllerStop.includes('actual.roleKind !== "built-in-governance"'), "C3：Core/role 身份保留");
  assert.ok(prepareControllerStop.includes('"controller-stop-target-instance-unproven"'), "码保留（语义收窄）");
  // C2/C4：finalize 终止证据=运行时中立 drain；native absent 允许、present-but-changed（instance/role 漂移）拒绝。
  assert.ok(finalizeRunChange.includes("isRuntimeSessionDrained(fact.lifecycle)"), "C2：run-stop finalize 用 drain");
  assert.ok(finalizeRunChange.includes("member.nativeInstanceId !== undefined && (native.instanceId !== member.nativeInstanceId"), "C2：present-but-changed 拒绝");
  assert.ok(finalizeRunChange.includes('"run-stop-instance-unproven"'), "run-stop-instance-unproven 码保留");
  assert.ok(finalizeControllerStop.includes("isRuntimeSessionDrained(fact)"), "C4：controller terminal 用 drain");
  assert.ok(finalizeControllerStop.includes("member.nativeInstanceId !== undefined && (native.instanceId !== member.nativeInstanceId"), "C4：present-but-changed 拒绝");
  assert.ok(finalizeControllerStop.includes('"controller-stop-terminal-unproven"'), "controller-stop-terminal-unproven 码保留");
  // Q8：native instance 在两种 host plan 中可选（类型可选化是加法；桌面消费仍可编译）。
  assert.equal((source.match(/handles: readonly \{ hostHandleId: string; coreSessionId: string; nativeInstanceId\?: string;/g) ?? []).length, 2,
    "RunChangeHostPlan/ControllerStopHostPlan.handles.nativeInstanceId 均为可选");
  // I0-5/R6：finalize gate 保持先于 host lease；不写 sidecar。
  assert.ok(finalizeRunChange.indexOf("inspectGitActionAuthorization(source)") < finalizeRunChange.indexOf("beginGitHostAction({ projectRoot: input.projectRoot, kind: \"git-mutation\""),
    "gate 先于 host lease（既有顺序保持）");
  assert.ok(finalizeRunChange.includes('"host-continuation"'), "finalize 使用 host-continuation 授权模式");
  assert.equal(/appendGitActionAuthorization|authorization\.jsonl/.test(finalizeRunChange + finalizeControllerStop), false, "run-stop/controller-stop 不写 sidecar");
});

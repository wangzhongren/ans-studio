// test/测试/git-action-cross-runtime-fixture.ts
// W5 跨角色集成夹具（2026-11-08「删除全部预知式门控」）：真实 Core 包装层 + 桩件 provider（无真实模型/SDK 请求）
// + 真实 host inventory/trunk 存储/init 源，驱动 `createGitRoleRuntime().gitCandidate(init)` 的动作时授权链。
//
// 归属：test/测试/（测试角色 Section 1）；测试辅助代码，不得被产品代码引用。
// 约束（如实）：Core 注册表与 H12 逐条文件守卫都是进程级的，且守卫要求**所有 active 条目**的文件保护根覆盖
// 当前动作的 `[projectRoot/.git]` —— 因此每个测试 *文件* 只能有一个项目根；会话保持 active 到进程结束
// （custom provider 会话按 I0-3 不能以 drained 收口）。不同运行时/AC-16 场景各用独立测试文件。
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  createRuntimeAdapter,
  inspectRuntimeCoreRegistry,
  type RuntimeSessionOptions,
} from "../../src/service/runtime/session.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { createGitRoleRuntime, recordGitHostInventory, recordTaskObservation } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createFsTrunkStore } from "../../src/provider/trunk/public/trunk-store.ts";
import type { GitCandidateFn, RoleSession, RuntimeKind, RuntimeProviderOptions, TaskCreatedEvent, WriteGate } from "../../src/model/runtime.ts";
import type { ResolvedRole } from "../../src/model/role.ts";

export const AT = "2026-11-08T00:00:00.000Z";
export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const sidecarPath = (root: string, operationId: string) =>
  path.join(root, ".ans/trunk/operations", sha256(operationId), "authorization.jsonl");

const opened: RoleSession[] = [];
export async function disposeOpenedSessions(): Promise<void> {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
}

export const allowGate: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "w5-fixture" } });

export function fixtureRole(id: string): ResolvedRole {
  return { id, kind: "project", cardText: `# ${id}`,
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };
}

/** 受保护项目 host 文件守卫事实（`.git` 根；与 W3b/W2 gate 夹具同口径）。 */
export function fileGateOptions(root: string): Partial<RuntimeSessionOptions> {
  const protectedGitRoots = [path.join(root, ".git")];
  return { writeRoot: root, protectedGitRoots, fileGateProtocol: "host-facts-v1",
    fileGateProtection: { projectRoot: root, protectedGitRoots, coverage: "unknown", basisDigest: "a".repeat(64), reasons: [] } };
}

/** 绑定真实 Core 会话（桩件 provider 覆盖所选运行时；真实包装层/真实工具回合）。必须在写入受保护范围证据之前调用。 */
export async function bindSession(root: string, runtime: RuntimeKind, roleId: string, options: Partial<RuntimeSessionOptions> = {}): Promise<RoleSession & { sessionId: string }> {
  const adapter = createRuntimeAdapter({ runtime, gate: allowGate, projectRoot: root, skillRoot: root, ...fileGateOptions(root),
    providerFactories: { [runtime]: (providerOptions: RuntimeProviderOptions) => createDemoRuntimeAdapter(providerOptions, []) }, ...options });
  const bound = await adapter.bindRole(fixtureRole(roleId));
  assert.ok(bound.sessionId, "bound session has an actual session id");
  opened.push(bound);
  return bound as RoleSession & { sessionId: string };
}

export function entryOf(sessionId: string) {
  return inspectRuntimeCoreRegistry().entries.find(entry => entry.sessionId === sessionId);
}

export async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("fixture condition timeout");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** 阻塞中的 git_candidate（真实 Core 回合的 active tool）。 */
export function holdableGitCandidate() {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const gitCandidate: GitCandidateFn = async input => {
    await held;
    return { operationId: input.operationId, repoId: "fixture", status: "blocked", code: "fixture-held", message: "fixture only" };
  };
  return { gitCandidate, release: () => release() };
}

export const gitCandidateScript = (operationId: string) => [{
  name: "git_candidate",
  args: { operationId, action: "commit", base: { ref: "refs/ans/trunk", oid: null }, message: "w5 cross-runtime fixture", paths: ["docs/a.md"] },
}];

/** 真实 draft run + 真实 init source（parent = 真实 chief Core 会话）+ 真实 task 账本 + 真实 host inventory。 */
export async function prepareInitFixture(input: {
  root: string; canonical: string; runtime: RuntimeKind; taskId: string; runId: string;
  chief: RoleSession & { sessionId: string }; actor: RoleSession & { sessionId: string };
  extraRows?: Array<{ hostHandleId: string; roleId: string; runtime: RuntimeKind; coreSessionId: string; taskId?: string }>;
}) {
  const store = createFsTrunkStore(input.root);
  const run = { schema: "ans-run/v1" as const, runId: input.runId, flowId: "w5-cross", state: "draft" as const, documents: {}, createdAt: AT };
  const saved = await store.compareAndSwapRunRecord!(input.runId, null, run as never);
  assert.ok(saved.ok, JSON.stringify(saved));
  const sourceId = `init-source-${sha256(input.canonical + ":" + input.taskId)}`;
  const source = await store.writeInitializationSource!(sourceId, Buffer.from(JSON.stringify({
    schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: input.canonical, flowId: "w5-cross",
    parent: { roleId: "chief", sessionId: input.chief.sessionId, inputAccepted: true, settled: false },
  })).toString("base64"));
  assert.ok(source.ok, JSON.stringify(source));
  if (!source.ok) throw new Error("fixture initialization source unavailable");
  const task: TaskCreatedEvent = { v: 1, at: AT, kind: "task.created", taskId: input.taskId, from: "chief", to: "convener",
    text: "Initialize the actual repository (W5 cross-runtime)", sideEffect: "unknown", idempotencyKey: input.taskId,
    flowId: "w5-cross", runId: input.runId, runState: "draft",
    workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 } };
  const recorded = await recordTaskObservation({ projectRoot: input.root, event: task });
  assert.ok(recorded.ok, JSON.stringify(recorded));
  const rows: Array<{ hostHandleId: string; roleId: string; runtime: RuntimeKind; coreSessionId: string; taskId?: string; runId?: string }> = [
    { hostHandleId: "host-chief", roleId: "chief", runtime: input.runtime, coreSessionId: input.chief.sessionId },
    { hostHandleId: "host-actor", roleId: "convener", runtime: input.runtime, coreSessionId: input.actor.sessionId, taskId: input.taskId, runId: input.runId },
    ...(input.extraRows ?? []),
  ];
  const published = recordGitHostInventory({ source: "desktop-session-manager", projectRoot: input.root, observedAt: AT, revision: 1,
    sessions: rows.map(row => ({ hostHandleId: row.hostHandleId, roleId: row.roleId, runtime: row.runtime, phase: "live" as const,
      coreSessionId: row.coreSessionId, ...(row.taskId !== undefined ? { taskId: row.taskId } : {}), ...(row.runId !== undefined ? { runId: row.runId } : {}), errors: [] })),
    pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown", reasons: [] });
  assert.ok(published.ok, JSON.stringify(published));
  return { store, source };
}

/**
 * 单根 init 场景：绑定 chief + actor（指定运行时；actor 以脚本保持 git_candidate active）→ 备妥保护证据/inventory →
 * 驱动 `createGitRoleRuntime().gitCandidate(init)`。同一测试文件只能调用一次（见文件头约束）。
 */
export async function runInitScenario(input: {
  runtime: "claude" | "pi" | "codex"; operationId: string; prefix: string;
  withOtherActiveSessions?: boolean; blockSidecarStore?: boolean;
}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), input.prefix));
  const canonical = await fsp.realpath(root);
  const taskId = input.operationId + "-task", runId = "run-" + input.operationId;
  if (input.withOtherActiveSessions) {
    // F8/P1.2-AC-28：其它 active 会话声明 foreign MCP —— 只应进 optionalEvidence，不参与判定、不宣称阻断。
    await fsp.mkdir(path.join(root, "docs", "mcp"), { recursive: true });
    await fsp.writeFile(path.join(root, "docs", "mcp", "foreign.md"),
      "# MCP 声明：foreign\n- 用途：fixture\n- 启动：node\n- 适用角色：product\n- 状态：installed\n- 安装日期：2026-11-08\n");
  }
  const chief = await bindSession(root, input.runtime, "chief");
  const held = holdableGitCandidate();
  const actor = await bindSession(root, input.runtime, "convener", {
    gitCandidate: held.gitCandidate,
    providerFactories: { [input.runtime]: (options: RuntimeProviderOptions) => createDemoRuntimeAdapter(options, gitCandidateScript(input.operationId)) },
  });
  let extras: Array<{ hostHandleId: string; roleId: string; runtime: RuntimeKind; coreSessionId: string }> = [];
  if (input.withOtherActiveSessions) {
    // AC-6：其它 Claude/Pi/judge 形态的 active 会话与 actor 共存（不得因 strict unknown/processCoverage unknown 阻断）。
    const product = await bindSession(root, "pi", "product");
    const verifier = await bindSession(root, "claude", "verifier");
    const judge = await bindSession(root, "claude", "judge");
    extras = [
      { hostHandleId: "host-product", roleId: "product", runtime: "pi", coreSessionId: product.sessionId },
      { hostHandleId: "host-verifier", roleId: "verifier", runtime: "claude", coreSessionId: verifier.sessionId },
      { hostHandleId: "host-judge", roleId: "judge", runtime: "claude", coreSessionId: judge.sessionId },
    ];
  }
  const pumping = actor.prompt("Invoke git_candidate for the W5 cross-runtime init fixture");
  try {
    await until(() => entryOf(actor.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
    await prepareInitFixture({ root, canonical, runtime: input.runtime, taskId, runId, chief, actor, extraRows: extras });
    if (input.blockSidecarStore) await fsp.mkdir(sidecarPath(root, input.operationId), { recursive: true });
    const runtime = createGitRoleRuntime({ projectRoot: root, context: { actorRoleId: "convener", taskId, runId, readPaths: ["."] } });
    const result = await runtime.gitCandidate({ action: "init", operationId: input.operationId,
      base: { ref: "refs/ans/trunk", oid: null }, message: "W5 cross-runtime init" } as never);
    return { root, canonical, taskId, runId, chief, actor, result };
  } finally {
    held.release();
    await pumping;
  }
}

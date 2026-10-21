/**
 * 每项目×引擎视图缓存（Phase 4A 纯逻辑）：
 * - `key(projectRoot, runtime)`：视图缓存键；
 * - 路由判定：当前视图 → 现有 store；异引擎 → 本缓存；旧项目 → 丢弃；
 * - 重放顺序：history → events → role-state → operator/cards → judge 结果；
 * - 切引擎 generation 守卫：切换/读会话期间迟到的响应只丢弃。
 *
 * 无 DOM、无 store、无 IPC；快照只存载荷引用（不解析正文、不深拷贝）。
 */

import type { SessionEnvelope } from "./types.ts";

export const VIEW_RUNTIMES = ["pi", "codex", "claude"] as const;
export type ViewRuntime = (typeof VIEW_RUNTIMES)[number];

export function isViewRuntime(value: unknown): value is ViewRuntime {
  return value === "pi" || value === "codex" || value === "claude";
}

export function viewKey(projectRoot: string | null, runtime: string): string {
  return JSON.stringify([projectRoot || "", runtime || "pi"]);
}

export interface ViewIdentity {
  projectRoot: string | null;
  runtime: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 载荷显式 runtime（信封 → 事件）；缺省返回 null（新渲染器「缺省不猜」：
 * 缺省信封属于当前视图，不按旧协议猜 pi）。无效 runtime 也返回 null。
 */
export function payloadRuntime(payload: unknown): ViewRuntime | null {
  if (!payload || typeof payload !== "object") return null;
  const record = asRecord(payload);
  const event = asRecord(record.event);
  const raw = asString(record.runtime) || asString(event.runtime);
  return isViewRuntime(raw) ? raw : null;
}

export type RouteTarget = "current" | "cache" | "drop";

export interface RouteDecision {
  target: RouteTarget;
  runtime: ViewRuntime | null;
  /** 旧项目（显式 projectRoot 与当前项目不符）——缓存与当前视图都不得接收。 */
  staleProject: boolean;
}

/** 事件/历史/状态/卡载荷的路由判定（旧 `deliverRuntimePayload` 同义）。 */
export function routePayload(payload: unknown, view: ViewIdentity): RouteDecision {
  const record = asRecord(payload);
  if (!payload || typeof payload !== "object") {
    return { target: "drop", runtime: null, staleProject: false };
  }
  const projectRoot = record.projectRoot;
  if (
    typeof projectRoot === "string" &&
    view.projectRoot !== null &&
    projectRoot !== view.projectRoot
  ) {
    return { target: "drop", runtime: null, staleProject: true };
  }
  const event = asRecord(record.event);
  const explicit = asString(record.runtime) || asString(event.runtime);
  let runtime: ViewRuntime | null = null;
  if (explicit) {
    runtime = isViewRuntime(explicit) ? explicit : null;
    if (!runtime) return { target: "drop", runtime: null, staleProject: false };
  } else {
    // 缺省身份：属于当前视图（新渲染器既有 `envelopeMatches` 口径；不猜 pi）。
    runtime = isViewRuntime(view.runtime) ? view.runtime : null;
    if (!runtime) return { target: "drop", runtime: null, staleProject: false };
    return { target: "current", runtime, staleProject: false };
  }
  return {
    target: runtime === view.runtime ? "current" : "cache",
    runtime,
    staleProject: false,
  };
}

/** 信封数组 → 按目标分组（保序）；无效/旧项目信封丢弃。 */
export function partitionEnvelopes(
  envelopes: readonly unknown[],
  view: ViewIdentity,
): { current: unknown[]; cache: Array<{ runtime: ViewRuntime; envelope: unknown }> } {
  const current: unknown[] = [];
  const cache: Array<{ runtime: ViewRuntime; envelope: unknown }> = [];
  for (const envelope of envelopes) {
    const decision = routePayload(envelope, view);
    if (decision.target === "current") current.push(envelope);
    else if (decision.target === "cache" && decision.runtime) {
      cache.push({ runtime: decision.runtime, envelope });
    }
  }
  return { current, cache };
}

/** 单条/数组统一成数组（只用于路由拆分；不改变 store 的合帧语义）。 */
export function envelopeList(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [input];
}

export interface RuntimeViewSnapshot {
  histories: Map<string, unknown>;
  historyOrder: string[];
  events: unknown[];
  roleStates: Map<string, unknown>;
  roleStateOrder: string[];
  operatorRequests: Map<string, unknown>;
  operatorOrder: string[];
  operatorExpired: Map<string, string>;
  operatorQueued: Map<string, unknown>;
  shellConfirm: unknown | null;
  recoveryConfirm: unknown | null;
  shellJudgeResults: unknown[];
  governanceJudgeResults: unknown[];
}

export function emptyView(): RuntimeViewSnapshot {
  return {
    histories: new Map(),
    historyOrder: [],
    events: [],
    roleStates: new Map(),
    roleStateOrder: [],
    operatorRequests: new Map(),
    operatorOrder: [],
    operatorExpired: new Map(),
    operatorQueued: new Map(),
    shellConfirm: null,
    recoveryConfirm: null,
    shellJudgeResults: [],
    governanceJudgeResults: [],
  };
}

function roleIdOf(payload: unknown): string {
  return asString(asRecord(payload).roleId);
}

function idOf(payload: unknown): string {
  return asString(asRecord(payload).id);
}

function touchOrder(order: string[], key: string): void {
  if (key && order.indexOf(key) < 0) order.push(key);
}

export interface RuntimeViewPort {
  applyHistory: (payload: unknown) => void;
  appendEnvelopes: (envelopes: unknown[]) => void;
  applyRoleState: (payload: unknown) => void;
  appendOperatorRequest: (payload: unknown) => void;
  expireOperator: (id: string, reason?: string) => void;
  queueOperator: (payload: unknown) => void;
  receiveShell: (payload: unknown) => void;
  receiveRecovery: (payload: unknown) => void;
  appendShellJudgeResult: (payload: unknown) => void;
  appendGovernanceJudgeResult: (payload: unknown) => void;
}

/**
 * 按到达/最新语义重放一个引擎视图：
 * history（每角色最新一次）→ events（到达序）→ role-state（每角色最新一次）
 * → operator 卡（到达序）→ 失效回执 → 排队卡 → shell/恢复卡 → judge 结果（到达序）。
 */
export function replayView(snapshot: RuntimeViewSnapshot, port: RuntimeViewPort): void {
  replayHistory(snapshot, port);
  replayRest(snapshot, port);
}

/** 仅重放历史（切换引擎时先于重新开启会话，避免随后到达的历史重建覆盖实时行）。 */
export function replayHistory(snapshot: RuntimeViewSnapshot, port: RuntimeViewPort): void {
  for (const roleId of snapshot.historyOrder) {
    const history = snapshot.histories.get(roleId);
    if (history !== undefined) port.applyHistory(history);
  }
}

/** 重放实时事实：events → role-state → operator 卡/失效/排队 → shell/恢复卡 → judge。 */
export function replayRest(snapshot: RuntimeViewSnapshot, port: RuntimeViewPort): void {
  if (snapshot.events.length > 0) {
    port.appendEnvelopes(snapshot.events.slice());
  }
  for (const roleId of snapshot.roleStateOrder) {
    const state = snapshot.roleStates.get(roleId);
    if (state !== undefined) port.applyRoleState(state);
  }
  for (const id of snapshot.operatorOrder) {
    const request = snapshot.operatorRequests.get(id);
    if (request !== undefined) port.appendOperatorRequest(request);
  }
  for (const [id, reason] of snapshot.operatorExpired) {
    port.expireOperator(id, reason);
  }
  // 排队事实是运行期事实（PM §15.3）：不进入视图快照重放，只由主进程重推重建；
  // 旧 queuedRequests 不得在切引擎/恢复后复活（`snapshot.operatorQueued` 仅保留记录）。
  if (snapshot.shellConfirm) port.receiveShell(snapshot.shellConfirm);
  if (snapshot.recoveryConfirm) port.receiveRecovery(snapshot.recoveryConfirm);
  for (const payload of snapshot.shellJudgeResults) {
    port.appendShellJudgeResult(payload);
  }
  for (const payload of snapshot.governanceJudgeResults) {
    port.appendGovernanceJudgeResult(payload);
  }
}

export class RuntimeViewCache {
  private views = new Map<string, RuntimeViewSnapshot>();

  get(projectRoot: string | null, runtime: string): RuntimeViewSnapshot {
    const key = viewKey(projectRoot, runtime);
    let view = this.views.get(key);
    if (!view) {
      view = emptyView();
      this.views.set(key, view);
    }
    return view;
  }

  has(projectRoot: string | null, runtime: string): boolean {
    return this.views.has(viewKey(projectRoot, runtime));
  }

  recordHistory(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    const roleId = roleIdOf(payload);
    if (!roleId) return;
    const view = this.get(projectRoot, runtime);
    view.histories.set(roleId, payload);
    touchOrder(view.historyOrder, roleId);
  }

  recordEvents(
    projectRoot: string | null,
    runtime: ViewRuntime,
    envelopes: readonly unknown[],
  ): void {
    if (envelopes.length === 0) return;
    const view = this.get(projectRoot, runtime);
    for (const envelope of envelopes) {
      const decision = routePayload(envelope, { projectRoot, runtime });
      if (decision.target === "drop") continue;
      view.events.push(envelope);
    }
  }

  recordRoleState(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    const roleId = roleIdOf(payload);
    if (!roleId) return;
    const view = this.get(projectRoot, runtime);
    view.roleStates.set(roleId, payload);
    touchOrder(view.roleStateOrder, roleId);
  }

  recordOperatorRequest(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    const id = idOf(payload);
    if (!id) return;
    const view = this.get(projectRoot, runtime);
    view.operatorRequests.set(id, payload);
    touchOrder(view.operatorOrder, id);
  }

  recordOperatorExpired(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    const id = idOf(payload);
    if (!id) return;
    const view = this.get(projectRoot, runtime);
    const reason = asString(asRecord(payload).reason);
    view.operatorExpired.set(id, reason);
    // 失效回执不复活旧卡：已缓存请求保留（供重放时定格），当前 shell 卡直接收起。
    const shell = asRecord(view.shellConfirm);
    if (asString(shell.id) === id) view.shellConfirm = null;
  }

  recordOperatorQueued(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    const id = idOf(payload);
    if (!id) return;
    const view = this.get(projectRoot, runtime);
    view.operatorQueued.set(id, payload);
  }

  recordShellConfirm(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    this.get(projectRoot, runtime).shellConfirm = payload;
  }

  recordRecoveryConfirm(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    this.get(projectRoot, runtime).recoveryConfirm = payload;
  }

  recordShellJudgeResult(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    this.get(projectRoot, runtime).shellJudgeResults.push(payload);
  }

  recordGovernanceJudgeResult(projectRoot: string | null, runtime: ViewRuntime, payload: unknown): void {
    this.get(projectRoot, runtime).governanceJudgeResults.push(payload);
  }

  /** 该 runtime 的落定 shell 卡（settled 后旧卡不可再答）：只命中同角色/runtime。 */
  settleShell(roleId: string, runtime: ViewRuntime, projectRoot?: string | null): void {
    const view = this.get(projectRoot ?? null, runtime);
    const shell = asRecord(view.shellConfirm);
    const shellRole = asString(shell.roleId);
    if (shellRole && shellRole === roleId) view.shellConfirm = null;
  }

  clearShell(projectRoot: string | null, runtime: string): void {
    this.get(projectRoot, runtime).shellConfirm = null;
  }

  clearRecovery(projectRoot: string | null, runtime: string): void {
    this.get(projectRoot, runtime).recoveryConfirm = null;
  }

  replay(projectRoot: string | null, runtime: string, port: RuntimeViewPort): void {
    replayView(this.get(projectRoot, runtime), port);
  }

  /** 项目切换：清空该项目所有引擎视图（旧项目信封与缓存都不得复活）。 */
  clearProject(projectRoot: string | null): void {
    for (const runtime of VIEW_RUNTIMES) {
      this.views.delete(viewKey(projectRoot, runtime));
    }
  }

  clearAll(): void {
    this.views.clear();
  }
}

/** 切引擎 generation：切换开始时 bump；迟到的 history/role-state 用旧 token 丢弃。 */
export class GenerationGuard {
  private value = 0;

  bump(): number {
    this.value += 1;
    return this.value;
  }

  current(): number {
    return this.value;
  }

  isCurrent(token: number): boolean {
    return token === this.value;
  }
}

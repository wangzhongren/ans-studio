/**
 * 聊天流 / 确认卡 / 双开关 / 引擎设置 / 每引擎视图 IPC 接线（Phase 4A）。
 *
 * 只按 preload 契约消费：session:event(s)、session:role-state、session:history、
 * project:changed、operator-request/expired/queued/judge、shell:confirm-request、
 * recovery:confirm-request、shell/decision judge 状态与结果行。
 * 所有订阅返回取消函数；StrictMode 双挂载由模块级 installed 防重。
 *
 * 4A 新增：
 * - 事件路由（旧项目丢弃 / 异引擎只进 `runtime-view` 缓存 / 当前视图照旧进 store）；
 * - `switchRuntime`：保存旧视图事实 → 清当前 pane → 重放目标引擎缓存 → 重新开启当前角色会话；
 * - `chat/extensions/*` 注册器（4B 接 IPC 扩展；4A 只建机制）。
 *
 * 本模块不判边界、不写持久化；事件/历史/状态都交由 store 做投影。
 */

import { getDesktopBridge } from "@/lib/platform";
import { reportRendererDiagnostic } from "@/chat/diagnostics";
import type { DesktopBridge } from "@/lib/platform";
import { useChatStore } from "@/chat/chat-store";
import { setJudgeResultSink, noteShellId, useConfirmStore, installGovernanceModelWatch } from "@/stores/confirm-store";
import { useUiStore, type RuntimeId } from "@/stores/ui-store";
import { useSettingsStore, invalidatePendingSaves } from "@/stores/settings-store";
import { useReportStore } from "@/stores/report-store";
import {
  useDrawerStore,
} from "@/stores/drawer-store";
import {
  GenerationGuard,
  RuntimeViewCache,
  isViewRuntime,
  replayHistory,
  replayRest,
  routePayload,
  type RuntimeViewPort,
} from "@/chat/runtime-view";
import { isRuntimeId } from "@/chat/runtime-config";

let installed = false;

const viewCache = new RuntimeViewCache();
const generation = new GenerationGuard();
let switching = false;
let pendingSwitch: Promise<boolean> | null = null;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function viewIdentity(): { projectRoot: string | null; runtime: string } {
  return {
    projectRoot: useChatStore.getState().projectRoot,
    runtime: useUiStore.getState().runtime,
  };
}

/** settled 到达：该角色/同 runtime+project 的 shell 卡已不可能再被作答——收起，不留禁用卡。 */
function closeStaleCardsFromEnvelopes(payload: unknown): void {
  const envelopes = Array.isArray(payload) ? payload : [payload];
  for (const item of envelopes) {
    const envelope = asRecord(item);
    const event = asRecord(envelope.event);
    if (event.kind !== "settled") continue;
    useConfirmStore.getState().closeStaleShell({
      roleId: envelope.roleId,
      runtime:
        asString(envelope.runtime) || asString(event.runtime) || undefined,
      projectRoot: envelope.projectRoot,
    });
  }
}

const replayPort: RuntimeViewPort = {
  applyHistory: (payload) => useChatStore.getState().applyHistory(payload),
  appendEnvelopes: (envelopes) =>
    useChatStore.getState().appendEnvelopes(envelopes),
  applyRoleState: (payload) => useChatStore.getState().applyRoleState(payload),
  appendOperatorRequest: (payload) =>
    useChatStore.getState().appendOperatorRequest(payload),
  expireOperator: (id, reason) => {
    useChatStore.getState().expireOperator(id, reason);
    useConfirmStore.getState().expireShell(id, reason);
  },
  queueOperator: (payload) => useChatStore.getState().queueOperator(payload),
  receiveShell: (payload) => useConfirmStore.getState().receiveShell(payload),
  receiveRecovery: (payload) =>
    useConfirmStore.getState().receiveRecovery(payload),
  appendShellJudgeResult: (payload) =>
    useChatStore.getState().appendShellJudgeResult(payload),
  appendGovernanceJudgeResult: (payload) =>
    useChatStore.getState().appendGovernanceJudgeResult(payload),
};

function recordEventsByRuntime(envelopes: unknown[]): void {
  const { projectRoot, runtime } = viewIdentity();
  const groups = new Map<string, unknown[]>();
  for (const envelope of envelopes) {
    const decision = routePayload(envelope, { projectRoot, runtime });
    if (decision.target === "drop" || !decision.runtime) continue;
    const list = groups.get(decision.runtime) || [];
    list.push(envelope);
    groups.set(decision.runtime, list);
  }
  for (const [cacheRuntime, list] of groups) {
    if (isViewRuntime(cacheRuntime)) {
      viewCache.recordEvents(projectRoot, cacheRuntime, list);
    }
  }
}

/** 异引擎 settled：让该引擎缓存里的 shell 卡按「本轮结束」收起（不复活旧卡）。 */
function settleForeignShells(envelopes: unknown[]): void {
  const { projectRoot } = viewIdentity();
  for (const item of envelopes) {
    const envelope = asRecord(item);
    const event = asRecord(envelope.event);
    if (event.kind !== "settled") continue;
    const runtime = asString(envelope.runtime) || asString(event.runtime);
    if (!isViewRuntime(runtime)) continue;
    if (runtime === useUiStore.getState().runtime) continue;
    viewCache.settleShell(asString(envelope.roleId), runtime, projectRoot);
  }
}

function handleSessionEvents(input: unknown): void {
  const view = viewIdentity();
  if (!Array.isArray(input)) {
    const decision = routePayload(input, view);
    if (decision.target === "drop" || !decision.runtime) return;
    viewCache.recordEvents(view.projectRoot, decision.runtime, [input]);
    settleForeignShells([input]);
    if (decision.target === "cache") return;
    useChatStore.getState().appendEnvelopes(input);
    closeStaleCardsFromEnvelopes(input);
    return;
  }
  recordEventsByRuntime(input);
  settleForeignShells(input);
  const current: unknown[] = [];
  for (const envelope of input) {
    if (routePayload(envelope, view).target === "current") current.push(envelope);
  }
  if (current.length > 0) {
    useChatStore.getState().appendEnvelopes(current);
    closeStaleCardsFromEnvelopes(current);
  }
}

/**
 * 旧快照兼容（旧 `onRoleState` 同口径）：`queue` 为空但携带 `summaries` 时，
 * 把同一快照的摘要如实转成只读队列行（kind:"system"，不可撤回）。
 * 不新增状态源——仍只转述主进程快照。
 */
function normalizeRoleStatePayload(payload: unknown): unknown {
  const record = asRecord(payload);
  const queue = Array.isArray(record.queue) ? record.queue : [];
  const summaries = Array.isArray(record.summaries) ? record.summaries : [];
  if (queue.length > 0 || summaries.length === 0) return payload;
  const roleId = asString(record.roleId);
  return {
    ...record,
    queue: summaries.map((summary, index) => ({
      id: "legacy:" + roleId + ":" + index,
      kind: "system",
      summary: String(summary == null ? "" : summary),
      full: "",
      at: "",
    })),
  };
}

function handleRoleState(payload: unknown): void {
  const view = viewIdentity();
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  const normalized = normalizeRoleStatePayload(payload);
  viewCache.recordRoleState(view.projectRoot, decision.runtime, normalized);
  if (decision.target === "current") {
    useChatStore.getState().applyRoleState(normalized);
  }
}

function handleHistory(payload: unknown): void {
  const view = viewIdentity();
  const record = asRecord(payload);
  const payloadRoot = asString(record.projectRoot);
  // 历史可能在目标项目打开前先到（后台角色/切换项目）：交给 store 寄存，loadProject 后按
  // 项目+引擎精确重放；不要按当前视图的旧项目规则丢弃。
  if (payloadRoot && payloadRoot !== view.projectRoot) {
    useChatStore.getState().applyHistory(payload);
    return;
  }
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  viewCache.recordHistory(view.projectRoot, decision.runtime, payload);
  if (decision.target === "current") {
    useChatStore.getState().applyHistory(payload);
    reportRendererDiagnostic("renderer.replay", {
      state: "history",
      count: Array.isArray(record.rows) ? record.rows.length : 0,
      replayPlan: "apply",
    });
  }
}

function handleOperatorRequest(payload: unknown): void {
  const view = viewIdentity();
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  viewCache.recordOperatorRequest(view.projectRoot, decision.runtime, payload);
  if (decision.target === "current") {
    useChatStore.getState().appendOperatorRequest(payload);
  }
}

function handleOperatorQueued(payload: unknown): void {
  const view = viewIdentity();
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  viewCache.recordOperatorQueued(view.projectRoot, decision.runtime, payload);
  if (decision.target === "current") {
    useChatStore.getState().queueOperator(payload);
  }
}

function handleOperatorExpired(payload: unknown): void {
  const view = viewIdentity();
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  viewCache.recordOperatorExpired(view.projectRoot, decision.runtime, payload);
  if (decision.target === "cache") return;
  const record = asRecord(payload);
  const id = asString(record.id);
  if (!id) return;
  useChatStore.getState().expireOperator(id, asString(record.reason));
  useConfirmStore.getState().expireShell(id, record.reason);
}

function handleShellConfirm(payload: unknown): void {
  const view = viewIdentity();
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  // 异引擎缓存也要记住 shell 身份：切回后失效回执只写 hint、不再有当前卡（C2）。
  noteShellId(asRecord(payload).id);
  viewCache.recordShellConfirm(view.projectRoot, decision.runtime, payload);
  if (decision.target === "current") {
    useConfirmStore.getState().receiveShell(payload);
  }
}

function handleRecoveryConfirm(payload: unknown): void {
  const view = viewIdentity();
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  viewCache.recordRecoveryConfirm(view.projectRoot, decision.runtime, payload);
  if (decision.target === "current") {
    useConfirmStore.getState().receiveRecovery(payload);
  }
}

/**
 * 判断结果行（4B）：先进每引擎视图缓存，当前视图再落地；切回旧引擎时按到达序重放
 * （同 id 幂等，不跨引擎覆盖当前视图）。
 */
function handleJudgeResult(kind: "shell" | "governance", payload: unknown): void {
  const view = viewIdentity();
  const decision = routePayload(payload, view);
  if (decision.target === "drop" || !decision.runtime) return;
  if (kind === "shell") {
    viewCache.recordShellJudgeResult(view.projectRoot, decision.runtime, payload);
  } else {
    viewCache.recordGovernanceJudgeResult(view.projectRoot, decision.runtime, payload);
  }
  if (decision.target === "current") {
    if (kind === "shell") useChatStore.getState().appendShellJudgeResult(payload);
    else useChatStore.getState().appendGovernanceJudgeResult(payload);
  }
}

/**
 * 真实切换引擎：
 * 1) 捕获/清空当前视图（每引擎缓存持续记录，无需再抓取）；
 * 2) 安装目标引擎缓存（history → events → role-state → operator/cards）；
 * 3) 读取目标引擎配置（缺配提示）；
 * 4) 重新打开当前选中角色的目标引擎会话并读取历史。
 * 无项目/非法/同引擎 no-op。切换不停止后台会话（不调 session:stop）。
 */
export async function switchRuntime(runtime: RuntimeId): Promise<boolean> {
  const chat = useChatStore.getState();
  const ui = useUiStore.getState();
  if (!chat.projectRoot) return false;
  if (!isRuntimeId(runtime) || runtime === ui.runtime) return false;
  if (pendingSwitch) return false;
  pendingSwitch = doSwitch(runtime);
  try {
    return await pendingSwitch;
  } finally {
    pendingSwitch = null;
  }
}

async function doSwitch(runtime: RuntimeId): Promise<boolean> {
  const chat = useChatStore.getState();
  const ui = useUiStore.getState();
  const projectRoot = chat.projectRoot;
  const selected = ui.selectedRoleId;
  const token = generation.bump();
  switching = true;
  try {
    useDrawerStore.getState().invalidateDocumentRead();
    invalidatePendingSaves();
    useUiStore.getState().setRuntime(runtime);
    chat.resetPanes();
    useChatStore.setState({
      roleBusy: {},
      queueByRole: {},
      runningByRole: {},
      roleMeta: {},
      hint: "",
      hintSource: null,
    });
    // 旧引擎当前可见的确认卡属于旧视图：本地收起（不回传、不代表放行），
    // 目标引擎缓存的卡随后由 replay 安装。
    useConfirmStore.getState().dismissShell();
    useConfirmStore.getState().dismissRecovery();
    // 先放历史（可能被随后 selectRole 的历史重建覆盖），实时事实在开会话后再重放，
    // 保证「切回时按到达序重放」且不被空/旧历史重建吞掉。
    if (projectRoot) replayHistory(viewCache.get(projectRoot, runtime), replayPort);
    void useSettingsStore.getState().followRuntime(runtime);
  } finally {
    switching = false;
  }
  if (!generation.isCurrent(token)) return false;
  if (selected) {
    await useChatStore.getState().selectRole(selected);
    if (!generation.isCurrent(token)) return false;
  }
  if (projectRoot) {
    switching = true;
    try {
      replayRest(viewCache.get(projectRoot, runtime), replayPort);
    } finally {
      switching = false;
    }
  }
  return generation.isCurrent(token);
}

/** 是否正在切换引擎（引擎触发器 aria-busy / 防重复提交）。 */
export function isSwitchingRuntime(): boolean {
  return pendingSwitch !== null;
}

/** 项目切换：清空当前项目的每引擎缓存与抽屉阅读状态（旧项目不得复活）。 */
function onProjectChanged(nextRoot: string | null, previousRoot: string | null): void {
  switching = true;
  try {
    generation.bump();
    if (previousRoot) viewCache.clearProject(previousRoot);
    if (nextRoot) viewCache.clearProject(nextRoot);
    invalidatePendingSaves();
    useReportStore.getState().clearProject(previousRoot);
    useReportStore.getState().clearProject(nextRoot);
    useSettingsStore.getState().projectChanged(nextRoot);
    useDrawerStore.getState().resetProject();
    useUiStore.getState().setDrawerOpen(false);
    useConfirmStore.getState().dismissShell();
    useConfirmStore.getState().dismissRecovery();
  } finally {
    switching = false;
  }
  if (nextRoot) {
    void useSettingsStore.getState().followRuntime(useUiStore.getState().runtime);
  }
}

interface ChatExtensionModule {
  install?: (bridge: DesktopBridge) => (() => void) | void;
}

/** 4B IPC 扩展点：`chat/extensions/*.ts` 导出 `install(bridge) => cleanup`（4A 为空目录）。 */
const extensionModules = import.meta.glob<ChatExtensionModule>(
  "./extensions/*.ts",
  { eager: true },
);
const extensionCleanups: Array<() => void> = [];

function installExtensions(bridge: DesktopBridge): void {
  for (const module of Object.values(extensionModules)) {
    if (typeof module.install !== "function") continue;
    try {
      const cleanup = module.install(bridge);
      if (typeof cleanup === "function") extensionCleanups.push(cleanup);
    } catch {
      /* 扩展异常不影响主界面；4B 扩展自行落诊断。 */
    }
  }
}

export function getRuntimeViewCache(): RuntimeViewCache {
  return viewCache;
}

export function installChatRuntime(): void {
  if (installed || typeof window === "undefined") return;
  const bridge = getDesktopBridge();
  if (!bridge) return;
  installed = true;

  // 渲染侧未捕获错误 → 诊断（字段名在桌面窗口白名单内）；不改变错误行为。
  window.addEventListener("error", (event) => {
    reportRendererDiagnostic("renderer.event-error", {
      errorType: "error",
      errorMessage: String(event.message || "window error"),
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportRendererDiagnostic("renderer.event-error", {
      errorType: "unhandled-rejection",
      errorMessage: String(event.reason == null ? "unhandled rejection" : event.reason),
    });
  });

  bridge.onSessionEvent?.(handleSessionEvents);
  bridge.onRoleState?.(handleRoleState);
  bridge.onSessionHistory?.(handleHistory);
  bridge.onProjectChanged?.(() => {
    void useChatStore.getState().refreshProject();
  });
  bridge.onOperatorRequest?.(handleOperatorRequest);
  bridge.onOperatorExpired?.(handleOperatorExpired);
  bridge.onOperatorQueued?.(handleOperatorQueued);

  // 确认卡（fail-closed）：载荷进入 store；应答只由卡片上的明确选择触发。
  bridge.onShellConfirm?.(handleShellConfirm);
  bridge.onRecoveryConfirm?.(handleRecoveryConfirm);

  // 「替我审批 / 替我决策」双开关：主进程权威；桥缺失时组件禁用并显示固定文案。
  // 判断结果行经 sink 先进每引擎缓存（4B：切回旧引擎按到达序重放）。
  setJudgeResultSink(handleJudgeResult);
  useConfirmStore.getState().initJudgeSwitches();
  installGovernanceModelWatch();

  // 当前视图的卡被回答/失效/收起时，同步清掉该引擎缓存里的同一张卡（切回不复活）。
  useConfirmStore.subscribe((state, previous) => {
    if (switching) return;
    const { projectRoot, runtime } = viewIdentity();
    if (!projectRoot || !isViewRuntime(runtime)) return;
    if (state.shellConfirm !== previous.shellConfirm) {
      if (state.shellConfirm) {
        viewCache.recordShellConfirm(projectRoot, runtime, state.shellConfirm.payload);
      } else {
        viewCache.clearShell(projectRoot, runtime);
      }
    }
    if (state.recoveryConfirm !== previous.recoveryConfirm) {
      if (state.recoveryConfirm) {
        viewCache.recordRecoveryConfirm(projectRoot, runtime, state.recoveryConfirm.payload);
      } else {
        viewCache.clearRecovery(projectRoot, runtime);
      }
    }
  });

  // 当前视图的 operator 卡被作答/失效后，缓存同步定格（切回不复活未答卡）。
  useChatStore.subscribe((state, previous) => {
    if (switching) return;
    if (state.pendingOperator === previous.pendingOperator) return;
    const { projectRoot, runtime } = viewIdentity();
    if (!projectRoot || !isViewRuntime(runtime)) return;
    for (const id of Object.keys(previous.pendingOperator)) {
      if (state.pendingOperator[id]) continue;
      viewCache.recordOperatorExpired(projectRoot, runtime, { id, runtime });
    }
  });

  // 项目切换（任意 loadProject 路径）：清缓存/抽屉/确认卡；随后刷新当前引擎缺配提示。
  let lastProjectRoot = useChatStore.getState().projectRoot;
  useChatStore.subscribe((state) => {
    if (state.projectRoot === lastProjectRoot) return;
    const previous = lastProjectRoot;
    lastProjectRoot = state.projectRoot;
    onProjectChanged(state.projectRoot, previous);
  });

  // 角色/引擎切换使进行中的文档读取失效（迟到回包只丢弃）。
  let lastRole = useUiStore.getState().selectedRoleId;
  let lastRuntime = useUiStore.getState().runtime;
  useUiStore.subscribe((state) => {
    if (
      state.selectedRoleId !== lastRole ||
      state.runtime !== lastRuntime
    ) {
      lastRole = state.selectedRoleId;
      lastRuntime = state.runtime;
      useDrawerStore.getState().invalidateDocumentRead();
    }
  });

  installExtensions(bridge);

  if (bridge.getRecoveryState) {
    void bridge
      .getRecoveryState()
      .then(async (raw) => {
        const recovery = asRecord(raw);
        const projectRoot = asString(recovery.projectRoot);
        if (!projectRoot) return;
        const runtime = asString(recovery.runtime);
        if (runtime === "pi" || runtime === "codex" || runtime === "claude") {
          useUiStore.getState().setRuntime(runtime as RuntimeId);
        }
        await useChatStore.getState().loadProject(projectRoot);
        const roleId = asString(recovery.roleId);
        if (roleId) {
          await useChatStore.getState().selectRole(roleId);
        } else if (useChatStore.getState().primaryRoleId) {
          await useChatStore
            .getState()
            .selectRole(useChatStore.getState().primaryRoleId as string);
        }
        if (bridge.recoveryReady) await bridge.recoveryReady();
        reportRendererDiagnostic("renderer.recovery", { state: "restored" });
      })
      .catch(() => {
        /* 恢复失败不阻塞界面；角色/项目仍可手动选择。 */
      });
  }
}


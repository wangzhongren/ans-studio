/**
 * 确认卡与双开关状态（Phase 3B）。
 *
 * 主进程是唯一权威：本 store 只保存主进程推来的卡载荷与开关状态；
 * 回包只提交客户明确选择（恰 allow:true 才放行/执行），失败/失效如实收卡或定格。
 * 不判边界、不持久化治理事实、不写 localStorage。
 */

import { create } from "zustand";
import { getDesktopBridge } from "@/lib/platform";
import type { DesktopBridge } from "@/lib/platform";
import { useChatStore } from "@/chat/chat-store";
import { useUiStore } from "@/stores/ui-store";
import {
  asCardRecord,
  expiryHitsCard,
  payloadMatchesView,
  receiveCard,
  recoveryResponseOutcome,
  shellResponseOutcome,
  staleShellOnSettled,
  startResponding,
  type ConfirmCardRecord,
} from "@/chat/confirm-logic";
import {
  JUDGE_GROUP_APPROVAL,
  JUDGE_GROUP_DECISION,
  judgeBridgeAvailable,
  judgeWarningStep,
  shellJudgeToggleResult,
  type JudgeGroup,
} from "@/chat/judge";

export type { JudgeGroup };

export interface JudgeSwitchState {
  available: boolean;
  enabled: boolean;
  busy: boolean;
  error: string;
  promptShown: boolean;
}

interface ConfirmStore {
  shellConfirm: ConfirmCardRecord | null;
  recoveryConfirm: ConfirmCardRecord | null;
  judge: Record<JudgeGroup, JudgeSwitchState>;
  warning: { visible: boolean; groups: JudgeGroup[] };

  receiveShell: (payload: unknown) => void;
  respondShell: (allow: boolean) => Promise<void>;
  expireShell: (id: unknown, reason?: unknown) => void;
  closeStaleShell: (envelope: unknown) => void;
  /** 仅测试驱动/演示注入用：本地收起（不发 IPC、不代表放行）。 */
  dismissShell: () => void;

  receiveRecovery: (payload: unknown) => void;
  respondRecovery: (allow: boolean) => Promise<void>;
  dismissRecovery: () => void;

  initJudgeSwitches: () => void;
  setJudgeEnabled: (group: JudgeGroup, enabled: boolean) => Promise<void>;
  acknowledgeWarning: () => void;
}

const EMPTY_SWITCH: JudgeSwitchState = {
  available: false,
  enabled: false,
  busy: false,
  error: "",
  promptShown: false,
};

let warningTimer: ReturnType<typeof setTimeout> | null = null;
const pushedFlags: Record<JudgeGroup, boolean> = {
  approval: false,
  decision: false,
};
let judgeInstalled = false;
let modelWatchInstalled = false;
let lastGovernanceModel: "single" | "trio" | null = null;
/**
 * 曾出现过的 shell 确认卡 id（含异引擎缓存）。shell 卡被失效收起后，重放时
 * 当前卡可能已不存在——仍要把失效原因写进 composer-hint（C2：收起 + 原因可见）。
 */
const knownShellIds = new Set<string>();

export function noteShellId(id: unknown): void {
  if (typeof id === "string" && id !== "") knownShellIds.add(id);
}

/**
 * 判断结果行的路由钩子（4B）：ipc.ts 安装后，结果先进每引擎视图缓存，
 * 当前视图由钩子决定是否落地；切回旧引擎时由 replay 重放（同 id 幂等）。
 */
let judgeResultSink:
  | ((kind: "shell" | "governance", payload: unknown) => void)
  | null = null;

export function setJudgeResultSink(
  sink: ((kind: "shell" | "governance", payload: unknown) => void) | null,
): void {
  judgeResultSink = sink;
}

function viewIdentity(): { projectRoot: string | null; runtime: string } {
  return {
    projectRoot: useChatStore.getState().projectRoot,
    runtime: useUiStore.getState().runtime,
  };
}

function decisionSingleDisabled(): boolean {
  return useChatStore.getState().governanceModel === "single";
}

function enabledGroups(
  judge: Record<JudgeGroup, JudgeSwitchState>,
): JudgeGroup[] {
  const groups: JudgeGroup[] = [];
  if (judge.approval.available && judge.approval.enabled) {
    groups.push(JUDGE_GROUP_APPROVAL);
  }
  if (
    judge.decision.available &&
    judge.decision.enabled &&
    !decisionSingleDisabled()
  ) {
    groups.push(JUDGE_GROUP_DECISION);
  }
  return groups;
}

function clearWarningTimer(): void {
  if (warningTimer !== null) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }
}

function setWarningLines(): void {
  const store = useConfirmStore.getState();
  const groups = enabledGroups(store.judge);
  if (groups.length === 0) {
    clearWarningTimer();
    if (store.warning.visible) {
      useConfirmStore.setState({ warning: { visible: false, groups: [] } });
    }
    return;
  }
  if (!store.warning.visible) return;
  useConfirmStore.setState({ warning: { visible: true, groups } });
}

function showWarning(groups: JudgeGroup[]): void {
  useConfirmStore.setState({ warning: { visible: true, groups } });
  clearWarningTimer();
  warningTimer = setTimeout(() => {
    warningTimer = null;
    // 只收起提示，不改开关、不写任何持久化。
    useConfirmStore.setState({ warning: { visible: false, groups: [] } });
  }, 9000);
}

/** 每次开关状态变化（推送 / 回包 / 初次读取）都只走这一处：一次性警告 + 标记同步。 */
function syncWarning(): void {
  const current = useConfirmStore.getState().judge;
  const approvalOn = current.approval.available && current.approval.enabled;
  const decisionOn =
    current.decision.available &&
    current.decision.enabled &&
    !decisionSingleDisabled();
  const a = judgeWarningStep(approvalOn, current.approval.promptShown);
  const b = judgeWarningStep(decisionOn, current.decision.promptShown);
  if (
    a.shown !== current.approval.promptShown ||
    b.shown !== current.decision.promptShown
  ) {
    useConfirmStore.setState({
      judge: {
        approval: { ...current.approval, promptShown: a.shown },
        decision: { ...current.decision, promptShown: b.shown },
      },
    });
  }
  const groups = enabledGroups(useConfirmStore.getState().judge);
  if (groups.length === 0) {
    clearWarningTimer();
    if (useConfirmStore.getState().warning.visible) {
      useConfirmStore.setState({ warning: { visible: false, groups: [] } });
    }
    return;
  }
  if (a.show || b.show) {
    showWarning(groups);
    return;
  }
  setWarningLines();
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  shellConfirm: null,
  recoveryConfirm: null,
  judge: {
    approval: { ...EMPTY_SWITCH },
    decision: { ...EMPTY_SWITCH },
  },
  warning: { visible: false, groups: [] },

  receiveShell: (payload) => {
    if (!payloadMatchesView(payload, viewIdentity())) return;
    noteShellId(asCardRecord(payload).id);
    const next = receiveCard(get().shellConfirm, payload);
    if (next) set({ shellConfirm: next });
  },

  respondShell: async (allow) => {
    const cur = get().shellConfirm;
    if (!cur || cur.busy) return;
    set({ shellConfirm: startResponding(cur) });
    const bridge = getDesktopBridge();
    let res: unknown = null;
    if (bridge?.shellConfirmRespond) {
      try {
        res = await bridge.shellConfirmRespond({ id: cur.id, allow: allow === true });
      } catch {
        res = null;
      }
    }
    const outcome = shellResponseOutcome(res);
    const current = get().shellConfirm;
    if (!current || current.id !== cur.id) return; // 卡已被新请求替换：旧回包不误收新卡
    if (outcome.close) set({ shellConfirm: null });
    else set({ shellConfirm: { ...current, busy: false } });
    if (outcome.hint) useChatStore.getState().setHint(outcome.hint);
  },

  expireShell: (id, reason) => {
    const current = get().shellConfirm;
    const key = typeof id === "string" ? id : "";
    const isCurrent = expiryHitsCard(current, id);
    const wasShell = isCurrent || (key !== "" && knownShellIds.has(key));
    if (key !== "") knownShellIds.delete(key);
    if (!wasShell) return;
    if (isCurrent) set({ shellConfirm: null });
    // 收起后原因仍可见/可追溯（重放时当前卡可能已不在；C2 重锚语义）。
    useChatStore
      .getState()
      .setHint(
        typeof reason === "string" && reason !== ""
          ? reason
          : "此确认已失效，未获放行——请让角色重新发起。",
      );
  },

  closeStaleShell: (envelope) => {
    const current = get().shellConfirm;
    const record = asCardRecord(envelope);
    if (staleShellOnSettled(current, record, viewIdentity())) {
      set({ shellConfirm: null });
    }
  },

  dismissShell: () => {
    if (get().shellConfirm) set({ shellConfirm: null });
  },

  receiveRecovery: (payload) => {
    if (!payloadMatchesView(payload, viewIdentity())) return;
    const next = receiveCard(get().recoveryConfirm, payload);
    if (next) set({ recoveryConfirm: next });
  },

  respondRecovery: async (allow) => {
    const cur = get().recoveryConfirm;
    if (!cur) return;
    if (cur.busy) {
      // 已定格（失效/通道异常）：取消/关闭只收起展示，不回传执行。
      if (cur.expiredReason && allow !== true) set({ recoveryConfirm: null });
      return;
    }
    set({ recoveryConfirm: startResponding(cur) });
    const bridge = getDesktopBridge();
    let res: unknown = null;
    if (bridge?.recoveryConfirmRespond) {
      try {
        res = await bridge.recoveryConfirmRespond({
          id: cur.id,
          allow: allow === true,
        });
      } catch {
        res = null;
      }
    }
    const outcome = recoveryResponseOutcome(res);
    const current = get().recoveryConfirm;
    if (!current || current.id !== cur.id) return;
    if (outcome.close) {
      set({ recoveryConfirm: null });
      return;
    }
    // 失效/通道异常：保留卡片、定格全部动作（绝不呈现为已执行）。
    set({
      recoveryConfirm: {
        ...current,
        busy: true,
        expiredReason: outcome.hint,
      },
    });
  },

  dismissRecovery: () => {
    if (get().recoveryConfirm) set({ recoveryConfirm: null });
  },

  initJudgeSwitches: () => {
    if (judgeInstalled || typeof window === "undefined") return;
    const bridge = getDesktopBridge();
    if (!bridge) return;
    judgeInstalled = true;
    const approvalAvailable = judgeBridgeAvailable(bridge as DesktopBridge, JUDGE_GROUP_APPROVAL);
    const decisionAvailable = judgeBridgeAvailable(bridge as DesktopBridge, JUDGE_GROUP_DECISION);
    set({
      judge: {
        approval: { ...EMPTY_SWITCH, available: approvalAvailable },
        decision: { ...EMPTY_SWITCH, available: decisionAvailable },
      },
    });

    if (approvalAvailable) {
      bridge.onShellJudgeState?.((payload) => {
        if (applyJudgeState(JUDGE_GROUP_APPROVAL, payload)) {
          pushedFlags.approval = true;
        }
      });
      bridge.onShellJudgeResult?.((payload) => {
        if (judgeResultSink) judgeResultSink("shell", payload);
        else useChatStore.getState().appendShellJudgeResult(payload);
      });
      readJudgeState(JUDGE_GROUP_APPROVAL, bridge.getShellJudgeState!, false);
    }
    if (decisionAvailable) {
      bridge.onDecisionJudgeState?.((payload) => {
        if (applyJudgeState(JUDGE_GROUP_DECISION, payload)) {
          pushedFlags.decision = true;
        }
      });
      bridge.onOperatorJudgeResult?.((payload) => {
        if (judgeResultSink) judgeResultSink("governance", payload);
        else useChatStore.getState().appendGovernanceJudgeResult(payload);
      });
      readJudgeState(JUDGE_GROUP_DECISION, bridge.getDecisionJudgeState!, false);
    }
  },

  setJudgeEnabled: async (group, enabled) => {
    const s = get().judge[group];
    const singleDisabled = group === JUDGE_GROUP_DECISION && decisionSingleDisabled();
    if (!s.available || s.busy || singleDisabled) return;
    set({
      judge: {
        ...get().judge,
        [group]: { ...s, busy: true, error: "" },
      },
    });
    const bridge = getDesktopBridge();
    let res: unknown = null;
    try {
      if (group === JUDGE_GROUP_DECISION) {
        res = await bridge?.setDecisionJudgeEnabled?.(enabled === true);
      } else {
        res = await bridge?.setShellJudgeEnabled?.(enabled === true);
      }
    } catch {
      res = null;
    }
    const next = shellJudgeToggleResult(s.enabled, res);
    const current = get().judge[group];
    const record = asCardRecord(res);
    const available =
      record.available === false
        ? false
        : record.available === true
          ? true
          : current.available;
    set({
      judge: {
        ...get().judge,
        [group]: {
          ...current,
          available,
          enabled: next.enabled,
          busy: false,
          error: next.error,
        },
      },
    });
    syncWarning();
  },

  acknowledgeWarning: () => {
    clearWarningTimer();
    if (get().warning.visible) set({ warning: { visible: false, groups: [] } });
  },
}));

/** 主进程推送/回包的开关状态（只接受 version 1 + 布尔 enabled）。 */
function applyJudgeState(group: JudgeGroup, payload: unknown): boolean {
  const record = asCardRecord(payload);
  if (record.version !== 1 || typeof record.enabled !== "boolean") return false;
  const current = useConfirmStore.getState().judge[group];
  const available =
    record.available === false ? false : record.available === true ? true : current.available;
  useConfirmStore.setState({
    judge: {
      ...useConfirmStore.getState().judge,
      [group]: {
        ...current,
        available,
        enabled: record.enabled,
        error: "",
      },
    },
  });
  syncWarning();
  return true;
}

/** 初次读取真实开关（推送先于回包时，旧快照不得覆盖更新的真实状态）。 */
function readJudgeState(
  group: JudgeGroup,
  read: () => Promise<unknown>,
  _retry: boolean,
): void {
  const done = (res: unknown) => {
    if (pushedFlags[group]) return;
    const next = shellJudgeToggleResult(false, res);
    const record = asCardRecord(res);
    const current = useConfirmStore.getState().judge[group];
    const available =
      record.available === false
        ? false
        : record.available === true
          ? true
          : current.available;
    useConfirmStore.setState({
      judge: {
        ...useConfirmStore.getState().judge,
        [group]: {
          ...current,
          available,
          enabled: next.enabled,
          busy: false,
          error: next.error,
        },
      },
    });
    syncWarning();
  };
  try {
    Promise.resolve(read()).then(done, () => done(null));
  } catch {
    done(null);
  }
}

/**
 * 会话失效回执（`session:operator-expired`）：shell 卡按 id 命中即收起并如实提示原因；
 * operator 卡的定格由 chat-store 处理。
 */
export function onOperatorExpiredPayload(payload: unknown): void {
  const record = asCardRecord(payload);
  useConfirmStore.getState().expireShell(record.id, record.reason);
}

/**
 * single↔trio 切换刷新一次性警告（4B）：模型变化时重算已确认键——
 * 仍开启的组视为已提示（不立即弹窗）；已关闭/被 single 禁用的组重新武装，
 * 下一次开启时再显示一次。single 下 decision 组从警告中移除，不残留旧行。
 */
export function installGovernanceModelWatch(): void {
  if (modelWatchInstalled) return;
  modelWatchInstalled = true;
  lastGovernanceModel = useChatStore.getState().governanceModel;
  useChatStore.subscribe((state) => {
    if (state.governanceModel === lastGovernanceModel) return;
    lastGovernanceModel = state.governanceModel;
    const current = useConfirmStore.getState().judge;
    const approvalOn = current.approval.available && current.approval.enabled;
    const decisionOn =
      current.decision.available &&
      current.decision.enabled &&
      state.governanceModel !== "single";
    useConfirmStore.setState({
      judge: {
        approval: { ...current.approval, promptShown: approvalOn },
        decision: { ...current.decision, promptShown: decisionOn },
      },
    });
    syncWarning();
  });
}

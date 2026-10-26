/**
 * 桌面桥（window.desktop）的安全访问层。
 *
 * 渲染进程只通过 preload 白名单方法访问窗口能力；窗口按钮在桥或方法缺席时
 * 必须禁用并如实标注，绝不假装可用、绝不抛错。
 *
 * 本阶段只消费自绘标题栏的窗口控制方法（通道名与语义见 app/preload.cjs，
 * 属「桌面窗口」角色的 api-spec）。其余通道按 Phase 3/4 逐步接入。
 */

export interface DesktopWindowControls {
  minimizeWindow: () => Promise<unknown>;
  toggleMaximize: () => Promise<unknown>;
  closeWindow: () => Promise<unknown>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}

/** preload 暴露面的本阶段子集；方法逐个探测，不假定整体存在。 */
export interface DesktopBridge {
  minimizeWindow?: DesktopWindowControls["minimizeWindow"];
  toggleMaximize?: DesktopWindowControls["toggleMaximize"];
  closeWindow?: DesktopWindowControls["closeWindow"];
  isMaximized?: DesktopWindowControls["isMaximized"];
  onMaximizedChanged?: DesktopWindowControls["onMaximizedChanged"];

  // —— Phase 3A 聊天流消费的受限通道（定义/实现属桌面窗口；这里只按名消费）——
  pickProject?: () => Promise<string | null>;
  listProject?: (projectRoot: string) => Promise<unknown>;
  openSession?: (input: unknown) => Promise<unknown>;
  sendSession?: (...args: unknown[]) => Promise<unknown>;
  stopSession?: (...args: unknown[]) => Promise<unknown>;
  abortSession?: (...args: unknown[]) => Promise<unknown>;
  getSessionHistory?: (input: unknown) => Promise<unknown>;
  listLiveSessionViews?: () => Promise<unknown>;
  // —— 会话级后台任务（2026-10-25；定义/实现属桌面窗口，此处只按名消费）——
  listBackgroundTasks?: (
    projectRoot: string,
    runtime: string,
  ) => Promise<unknown>;
  readBackgroundTask?: (input: unknown) => Promise<unknown>;
  stopBackgroundTask?: (input: unknown) => Promise<unknown>;
  // —— 流程状态只读（2026-10-25；定义/实现属桌面窗口，此处只按名消费）——
  getFlowStatus?: (projectRoot: string) => Promise<unknown>;
  onSessionEvent?: (callback: (payload: unknown) => void) => () => void;
  onRoleState?: (callback: (payload: unknown) => void) => () => void;
  onSessionHistory?: (callback: (payload: unknown) => void) => () => void;
  onProjectChanged?: (callback: () => void) => () => void;
  onOperatorRequest?: (callback: (payload: unknown) => void) => () => void;
  onOperatorExpired?: (callback: (payload: unknown) => void) => () => void;
  onOperatorQueued?: (callback: (payload: unknown) => void) => () => void;
  operatorRespond?: (input: unknown) => Promise<unknown>;
  pickImage?: () => Promise<unknown>;
  attachImage?: (input: unknown) => Promise<unknown>;
  withdrawQueued?: (target: unknown, id: string) => Promise<unknown>;
  getRecoveryState?: () => Promise<unknown>;
  recoveryReady?: () => Promise<unknown>;

  // —— Phase 4A 引擎设置 / 文档只读（定义/实现属桌面窗口；这里只按名消费）——
  getRuntimeConfig?: (runtime: string) => Promise<unknown>;
  saveRuntimeConfig?: (input: unknown) => Promise<unknown>;
  /** 旧 Pi 面板兼容桥（只在 getRuntimeConfig 缺席时回退）。 */
  getPiConfig?: () => Promise<unknown>;
  savePiConfig?: (updates: unknown) => Promise<unknown>;
  readProjectDocument?: (input: unknown) => Promise<unknown>;
  openExternal?: (url: string) => Promise<unknown>;
  /** 渲染侧诊断事件（白名单 event/fields 由桌面窗口 diagnostics 校验；只读消费）。 */
  reportDiagnostic?: (input: unknown) => Promise<unknown>;

  // —— Phase 3B 确认卡与双开关（定义/实现属桌面窗口；这里只按名消费）——
  onShellConfirm?: (callback: (payload: unknown) => void) => () => void;
  shellConfirmRespond?: (input: unknown) => Promise<unknown>;
  onRecoveryConfirm?: (callback: (payload: unknown) => void) => () => void;
  recoveryConfirmRespond?: (input: unknown) => Promise<unknown>;
  getShellJudgeState?: () => Promise<unknown>;
  setShellJudgeEnabled?: (enabled: boolean) => Promise<unknown>;
  onShellJudgeState?: (callback: (payload: unknown) => void) => () => void;
  onShellJudgeResult?: (callback: (payload: unknown) => void) => () => void;
  getDecisionJudgeState?: () => Promise<unknown>;
  setDecisionJudgeEnabled?: (enabled: boolean) => Promise<unknown>;
  onDecisionJudgeState?: (callback: (payload: unknown) => void) => () => void;
  onOperatorJudgeResult?: (callback: (payload: unknown) => void) => () => void;

  // —— Phase 4B 治理记录 / 报告持久化 / 交付回执（定义/实现属桌面窗口；只按名消费）——
  previewGovernanceRecord?: (projectRoot: string, options?: unknown) => Promise<unknown>;
  establishGovernanceRecord?: (projectRoot: string, options?: unknown) => Promise<unknown>;
  previewGovernanceReacceptance?: (projectRoot: string) => Promise<unknown>;
  reacceptGovernancePins?: (projectRoot: string, previewDigest: string) => Promise<unknown>;
  previewGovernanceMigration?: (projectRoot: string) => Promise<unknown>;
  migrateGovernanceModel?: (projectRoot: string, previewDigest: string) => Promise<unknown>;
  onGovernanceNextStep?: (callback: (payload: unknown) => void) => () => void;
  getSessionPersistence?: (input: unknown) => Promise<unknown>;
  getReportSaveState?: (input: unknown) => Promise<unknown>;
  retryReportSave?: (input: unknown) => Promise<unknown>;
  getDeliveryReceipt?: (input: unknown) => Promise<unknown>;
  retryDeliveryHistorySave?: (input: unknown) => Promise<unknown>;
  onReportPersistenceUpdated?: (callback: (payload: unknown) => void) => () => void;
  onDeliveryHistoryUpdated?: (callback: (payload: unknown) => void) => () => void;

  // —— i18n 应用级语言偏好（定义/实现属桌面窗口；这里只按名消费）——
  // 权威文件为 <userData>/ans/preferences.json；本地镜像仅用于首屏快速读取。
  getPreferences?: () => Promise<{
    version: 1;
    locale: "zh-CN" | "en-US";
    supported: string[];
  }>;
  setLocale?: (locale: string) => Promise<{
    ok: boolean;
    locale: "zh-CN" | "en-US";
    error?: string;
  }>;
  onLocaleChanged?: (
    callback: (payload: { locale: "zh-CN" | "en-US" }) => void,
  ) => () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export type WindowControlName = keyof DesktopWindowControls;

export interface WindowControlAvailability {
  bridge: boolean;
  minimize: boolean;
  maximize: boolean;
  close: boolean;
  isMaximized: boolean;
}

/** 读取桥对象；不存在或形状不对都返回 null（不抛错）。 */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.desktop;
  if (!bridge || typeof bridge !== "object") return null;
  return bridge;
}

function hasMethod<K extends WindowControlName>(
  bridge: DesktopBridge | null,
  name: K,
): bridge is DesktopBridge & Required<Pick<DesktopBridge, K>> {
  return !!bridge && typeof bridge[name] === "function";
}

/** 逐个方法的可用性（标题栏按钮据此禁用/标注）。 */
export function getWindowControlAvailability(): WindowControlAvailability {
  const bridge = getDesktopBridge();
  return {
    bridge: bridge !== null,
    minimize: hasMethod(bridge, "minimizeWindow"),
    maximize: hasMethod(bridge, "toggleMaximize"),
    close: hasMethod(bridge, "closeWindow"),
    isMaximized: hasMethod(bridge, "isMaximized"),
  };
}

/** 安全调用窗口方法：失败静默（按钮状态由可用性决定，不制造假成功）。 */
export function callWindowControl(
  name: "minimizeWindow" | "toggleMaximize" | "closeWindow",
): void {
  const bridge = getDesktopBridge();
  if (!hasMethod(bridge, name)) return;
  try {
    const result = bridge[name]();
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    /* 桥异常不影响渲染；窗口状态以主进程为准。 */
  }
}

/** 读取最大化状态；不可用时返回 false（不猜测）。 */
export async function queryMaximized(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!hasMethod(bridge, "isMaximized")) return false;
  try {
    return (await bridge.isMaximized()) === true;
  } catch {
    return false;
  }
}

/** 订阅最大化状态；不可用时返回空退订函数。 */
export function subscribeMaximized(
  callback: (maximized: boolean) => void,
): () => void {
  const bridge = getDesktopBridge();
  if (!hasMethod(bridge, "onMaximizedChanged")) return () => undefined;
  try {
    const off = bridge.onMaximizedChanged(callback);
    return typeof off === "function" ? off : () => undefined;
  } catch {
    return () => undefined;
  }
}

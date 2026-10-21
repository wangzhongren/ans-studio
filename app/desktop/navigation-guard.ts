// app/desktop/navigation-guard.ts
// 真实主进程窗口的导航兜底接线（Phase 5A，PM §17.12）。
//
// `installNavigationGuard` 只依赖 webContents 的两个 API（on/setWindowOpenHandler/getURL），
// 便于用 EventEmitter 假件做主进程接线测试；不 import Electron、不碰 IPC/preload。
import {
  classifyNavigation,
  classifyWindowOpen,
  createExternalOpenGate,
  type NavigationContext,
} from "./navigation-policy.ts";

export interface NavigationGuardWebContents {
  getURL(): string;
  on(event: "will-navigate", listener: (event: { preventDefault: () => void }, url: string) => void): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: "deny" }): unknown;
}

export interface NavigationGuardOptions {
  /** 窗口允许的初始入口（生产/构建/dev URL），按完整 URL 比较。 */
  allowedUrls: () => readonly string[];
  /** 仅对 http/https 调用（调用方负责接系统浏览器）。 */
  openExternal: (url: string) => void;
  onBlocked?: (reason: string) => void;
  onExternal?: (url: string) => void;
  gate?: ReturnType<typeof createExternalOpenGate>;
}

export interface NavigationGuard {
  /** 渲染侧经 IPC 外开前调用：同一窗口内已外开的 URL 返回 false（防双重外开）。 */
  shouldOpenExternal: (url: string) => boolean;
  /** 渲染侧经 IPC 外开成功后调用。 */
  markExternalOpen: (url: string) => void;
}

export function installNavigationGuard(webContents: NavigationGuardWebContents, options: NavigationGuardOptions): NavigationGuard {
  const gate = options.gate ?? createExternalOpenGate();
  const openFromWindow = (url: string): void => {
    if (!gate.shouldOpen(url)) return;
    gate.mark(url);
    options.onExternal?.(url);
    options.openExternal(url);
  };
  webContents.on("will-navigate", (event, url) => {
    const context: NavigationContext = { currentUrl: webContents.getURL(), allowedUrls: options.allowedUrls() };
    const decision = classifyNavigation(url, context);
    if (decision.allow) return;
    event.preventDefault();
    if ("openExternal" in decision) {
      openFromWindow(decision.openExternal);
    } else {
      options.onBlocked?.(decision.reason);
    }
  });
  webContents.setWindowOpenHandler(({ url }) => {
    const decision = classifyWindowOpen(url);
    if (decision.openExternal !== undefined) {
      openFromWindow(decision.openExternal);
    } else {
      options.onBlocked?.(decision.reason);
    }
    return { action: "deny" };
  });
  return {
    shouldOpenExternal: (url) => gate.shouldOpen(url),
    markExternalOpen: (url) => gate.mark(url),
  };
}

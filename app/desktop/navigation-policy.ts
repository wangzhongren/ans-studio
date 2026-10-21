// app/desktop/navigation-policy.ts
// 真实主进程窗口的导航兜底策略（Phase 5A，PM §17.12）。
//
// 双层修复的「产品侧兜底」：渲染侧（桌面UI）应 preventDefault 并只对 http/https 调
// `openExternal` 桥；本模块处理漏网导航——只允许初始加载/同 URL reload（含 dev 同一回环 URL），
// 其余导航一律阻止；http/https 外开，file:/data:/javascript: 等一律不执行。
//
// 纯函数：不 import Electron、不读环境、无 IO；便于 node --test 直接覆盖。

export type NavigationReason =
  | "same-url"
  | "allowed-entry"
  | "http-external"
  | "blocked-protocol"
  | "invalid-url";

export type NavigationDecision =
  | { allow: true; reason: "same-url" | "allowed-entry" }
  | { allow: false; reason: "http-external"; openExternal: string }
  | { allow: false; reason: "blocked-protocol" | "invalid-url" };

export interface NavigationContext {
  /** 窗口当前 URL（`webContents.getURL()`）；初始加载前可能为空串。 */
  currentUrl: string;
  /** 允许的初始入口（生产/构建/dev URL），按完整 URL 比较。 */
  allowedUrls: readonly string[];
}

function parseUrl(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

function isHttpProtocol(protocol: string): boolean {
  const value = protocol.toLowerCase();
  return value === "http:" || value === "https:";
}

function sameDocument(left: string, right: string): boolean {
  if (left === right) return true;
  const a = parseUrl(left);
  const b = parseUrl(right);
  if (a === undefined || b === undefined) return false;
  // 同文档（忽略 hash）：reload/锚点不会因此被拦；不同 path/query 仍按不同 URL 处理。
  return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
}

/**
 * 窗口内导航（will-navigate）判定：
 * - 同 URL（reload）或显式允许的入口 ⇒ allow；
 * - 其它 http/https ⇒ 阻止 + 外开（normalized href）；
 * - file:/data:/javascript:/blob:/about: 等 ⇒ 阻止且不执行；
 * - 非法 URL ⇒ 阻止。
 */
export function classifyNavigation(targetUrl: string, context: NavigationContext): NavigationDecision {
  const target = parseUrl(targetUrl);
  if (target === undefined) return { allow: false, reason: "invalid-url" };
  if (context.currentUrl !== "" && sameDocument(target.href, context.currentUrl)) {
    return { allow: true, reason: "same-url" };
  }
  if (context.allowedUrls.some((allowed) => sameDocument(target.href, allowed))) {
    return { allow: true, reason: "allowed-entry" };
  }
  if (isHttpProtocol(target.protocol)) {
    return { allow: false, reason: "http-external", openExternal: target.href };
  }
  return { allow: false, reason: "blocked-protocol" };
}

/**
 * window.open / target=_blank 判定：一律不开新 Electron 窗口；
 * http/https 外开，其它协议不执行。
 */
export function classifyWindowOpen(targetUrl: string): {
  action: "deny";
  reason: "http-external" | "blocked-protocol" | "invalid-url";
  openExternal?: string;
} {
  const target = parseUrl(targetUrl);
  if (target === undefined) return { action: "deny", reason: "invalid-url" };
  if (isHttpProtocol(target.protocol)) {
    return { action: "deny", reason: "http-external", openExternal: target.href };
  }
  return { action: "deny", reason: "blocked-protocol" };
}

/**
 * 外部打开去重闸（每窗口一个）：
 * 渲染侧先调 `app:open-external`（mark）后若默认导航漏网到 will-navigate，
 * 兜底在窗口时间内不再重复外开；反向（主进程先开）不会发生——渲染事件处理器先于默认动作。
 */
export function createExternalOpenGate(windowMs = 1500, now: () => number = () => Date.now()): {
  mark: (url: string) => void;
  shouldOpen: (url: string) => boolean;
} {
  const lastOpened = new Map<string, number>();
  const keyOf = (url: string): string => {
    const parsed = parseUrl(url);
    return parsed !== undefined ? parsed.href : url;
  };
  return {
    mark(url: string): void {
      const current = now();
      lastOpened.set(keyOf(url), current);
      if (lastOpened.size > 100) {
        for (const [key, at] of lastOpened) {
          if (current - at >= windowMs) lastOpened.delete(key);
        }
      }
    },
    shouldOpen(url: string): boolean {
      const at = lastOpened.get(keyOf(url));
      return at === undefined || now() - at >= windowMs;
    },
  };
}

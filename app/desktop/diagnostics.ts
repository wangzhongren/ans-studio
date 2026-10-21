import type { BrowserWindow, IpcMain } from "electron";
import type { DiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
const RENDERER_EVENTS = new Set(["renderer.error", "renderer.unhandled-rejection", "renderer.event-error", "renderer.viewport", "renderer.replay", "renderer.recovery"]);
const RENDERER_FIELDS = new Set(["errorType", "errorCode", "errorMessage", "state", "count", "rowCount", "firstRow", "lastRow", "visibleCount", "replayPlan", "durationMs"]);

/** 窗口关闭仅移除本次成功注册的自有通道，允许macOS随后重新建窗。 */
export function createWindowIpcRegistrar(win: BrowserWindow, ipc: Pick<IpcMain, "handle" | "removeHandler">, logger?: DiagnosticLogger): IpcMain["handle"] {
  const channels = new Set<string>();
  win.once("closed", () => {
    for (const channel of channels) ipc.removeHandler(channel);
    channels.clear();
  });
  return (channel, listener) => {
    ipc.handle(channel, async (event, ...args) => {
      const startedAt = Date.now();
      if (channel !== "app:renderer-diagnostic") logger?.record("ipc.start", { eventKind: channel });
      try {
        const result = await listener(event, ...args);
        let ok = true;
        if (result && typeof result === "object" && result.ok === false) ok = false;
        if (channel !== "app:renderer-diagnostic") logger?.record("ipc.end", { eventKind: channel, ok, durationMs: Date.now() - startedAt });
        return result;
      } catch (error) {
        logger?.error("ipc.failed", error, { eventKind: channel, durationMs: Date.now() - startedAt });
        throw error;
      }
    });
    channels.add(channel);
  };
}

export function recordRendererDiagnostic(logger: DiagnosticLogger, input: unknown): { ok: boolean } {
  if (!input || typeof input !== "object") return { ok: false };
  const value = input as { event?: unknown; fields?: unknown };
  if (typeof value.event !== "string" || !RENDERER_EVENTS.has(value.event)) return { ok: false };
  const fields: Record<string, unknown> = {};
  if (value.fields && typeof value.fields === "object") {
    for (const [name, field] of Object.entries(value.fields)) {
      if (!RENDERER_FIELDS.has(name)) continue;
      if (typeof field === "string") fields[name] = field.slice(0, 1024);
      else if (typeof field === "number" && Number.isFinite(field)) fields[name] = field;
      else if (typeof field === "boolean") fields[name] = field;
    }
  }
  logger.record(value.event, fields);
  return { ok: true };
}

export interface WindowDiagnosticsOptions {
  /**
   * 主帧加载失败（errorCode !== -3）时先询问调用方是否接管。
   * 返回 true = 已接管（例如 Phase 5A 的 dev server 一次性回退），不显示恢复页。
   * 缺省/返回 false ⇒ 沿用既有恢复页行为。
   */
  onMainFrameLoadFailure?: (errorCode: number) => boolean;
}

export function observeWindowDiagnostics(win: BrowserWindow, logger: DiagnosticLogger, showFailure: () => void, options?: WindowDiagnosticsOptions): void {
  win.webContents.on("did-start-loading", () => logger.record("window.load.start"));
  win.webContents.on("did-finish-load", () => logger.record("window.load.end", { ok: true }));
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _url, isMainFrame) => {
    logger.error("window.load.failed", new Error(errorDescription), { errorCode });
    if (!isMainFrame || errorCode === -3) return;
    if (options?.onMainFrameLoadFailure?.(errorCode) === true) return;
    showFailure();
  });
  win.webContents.on("preload-error", (_event, _preloadPath, error) => {
    logger.error("window.preload.failed", error);
    showFailure();
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    logger.record("window.renderer.gone", { reasonCode: details.reason, exitCode: details.exitCode });
    if (details.reason !== "clean-exit") showFailure();
  });
  win.on("unresponsive", () => logger.record("window.unresponsive"));
  win.on("responsive", () => logger.record("window.responsive"));
  win.on("closed", () => logger.record("window.closed"));
}

export const RECOVERY_PAGE = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>界面需要恢复</title><body style="font:14px system-ui;padding:32px"><h2>界面暂时无法显示</h2><p>点击重新加载可恢复界面，已有任务不会自动重发。</p><button id="reload-interface" onclick="window.desktop.reloadInterface()">重新加载界面</button></body></html>';

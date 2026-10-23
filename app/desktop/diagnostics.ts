import type { BrowserWindow, IpcMain } from "electron";
import type { DiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import { mainLocale, mainT } from "./i18n.ts";
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

/** 恢复页 HTML：按**当前 locale** 生成（i18n B3）。文案走 `main.common.recoveryPage*` 目录 key。 */
export function renderRecoveryPage(): string {
  return '<!doctype html><html lang="' + mainLocale() + '"><meta charset="utf-8"><title>' + mainT("main.common.recoveryPageTitle") + '</title><body style="font:14px system-ui;padding:32px"><h2>' + mainT("main.common.recoveryPageHeading") + '</h2><p>' + mainT("main.common.recoveryPageBody") + '</p><button id="reload-interface" onclick="window.desktop.reloadInterface()">' + mainT("main.common.reloadInterface") + '</button></body></html>';
}

/**
 * 恢复页的**实时绑定**（B3）：`main.ts` 以 ESM live binding 在失败时读取本值（该文件不在本批写集内，
 * 行为不变）；locale 切换由 Interface 调 `refreshRecoveryPage()` 重算，下一次打开恢复页即用新语言。
 */
export let RECOVERY_PAGE = renderRecoveryPage();

/** 按当前 locale 重算恢复页（Interface 在构造与 locale 切换后调用；纯字符串生成）。 */
export function refreshRecoveryPage(): void {
  RECOVERY_PAGE = renderRecoveryPage();
}

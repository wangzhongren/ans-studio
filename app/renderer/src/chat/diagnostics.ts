/**
 * 渲染侧诊断上报（Phase 5A，PM §17.4）：只经 preload `reportDiagnostic` 白名单通道，
 * 不接触 Node/fs；事件名与字段名由桌面窗口 diagnostics.ts 校验。上报失败静默，不影响 UI。
 */

import { getDesktopBridge } from "@/lib/platform";

export type RendererDiagnosticEvent =
  | "renderer.event-error"
  | "renderer.viewport"
  | "renderer.replay"
  | "renderer.recovery";

export function reportRendererDiagnostic(
  event: RendererDiagnosticEvent,
  fields: Record<string, unknown> = {},
): void {
  const bridge = getDesktopBridge();
  const report = bridge?.reportDiagnostic;
  if (typeof report !== "function") return;
  try {
    void Promise.resolve(report({ event, fields })).catch(() => {});
  } catch {
    /* 诊断不可用不打断界面。 */
  }
}

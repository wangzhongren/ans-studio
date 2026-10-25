/**
 * 客户投影（A3）展示映射：`statusCode` → 共享 i18n 文案。
 *
 * - 只做显式静态映射，不运行时拼 key（i18n 方案 §4.3）；
 * - 缺值/未知 code 回退主进程给的 `statusText`（不猜、不伪造）；
 * - `timed_out` 的目录 key 是 `ui.projection.status.timedOut`（camelCase 片段）。
 */

import {
  DEFAULT_LOCALE,
  translate,
  type Locale,
  type MessageKey,
} from "../i18n/index.ts";
import type { ClientProjectionV1 } from "./types.ts";

const PROJECTION_STATUS_KEYS: Record<
  ClientProjectionV1["statusCode"],
  MessageKey
> = {
  completed: "ui.projection.status.completed",
  failed: "ui.projection.status.failed",
  aborted: "ui.projection.status.aborted",
  timed_out: "ui.projection.status.timedOut",
  unknown: "ui.projection.status.unknown",
  "internal-feedback": "ui.projection.status.internalFeedback",
};

/** statusCode → 目录 key；未知/缺值返回 null（调用方回退原文）。 */
export function projectionStatusKey(statusCode: unknown): MessageKey | null {
  if (typeof statusCode !== "string") return null;
  return (
    PROJECTION_STATUS_KEYS[
      statusCode as ClientProjectionV1["statusCode"]
    ] ?? null
  );
}

/** 本地化投影状态；未知/缺值回退 `fallback`（通常是主进程 statusText）。 */
export function projectionStatusText(
  statusCode: unknown,
  fallback: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const key = projectionStatusKey(statusCode);
  return key ? translate(locale, key) : fallback;
}

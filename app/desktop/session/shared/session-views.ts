// app/desktop/session/shared/session-views.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §5 B1 提交 2/2）：会话视图纯投影（L0）。
// 类方法 `contextInfo` 自 app/desktop/session.ts **逐字搬移**（纯函数，无 receiver 依赖；条件与文案不变）。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

import type { RoleSessionHandle } from "../../../../src/pipeline/orchestration/run-role.ts";
import { mainT } from "../../i18n.ts";
import type { OpenResult } from "../contracts/session-types.ts";

export function contextInfo(handle: RoleSessionHandle): Pick<OpenResult, "contextSource" | "contextWarning"> {
  if (handle.contextSource === "resumed") return { contextSource: "recovered", contextWarning: handle.contextWarning };
  if (handle.contextSource === "recovered") return { contextSource: "fresh", contextWarning: handle.contextWarning ?? mainT("main.session.contextRecoveryFailed") };
  return { contextSource: "fresh", contextWarning: handle.contextWarning };
}

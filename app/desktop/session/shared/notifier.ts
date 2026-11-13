// app/desktop/session/shared/notifier.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §5 B1 提交 2/2）：投递进展系统行（L0）。
// 类方法 `emitDeliveryNote` 自 app/desktop/session.ts **逐字搬移**；事件发射经注入的 deps 参数传入
// （原 `this.deps.emitEvent`，仍以 deps 方法调用形式执行），签名适配不改语义：
// 首选角色非空用它，否则退回兜底角色。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";

/** 投递进展的**系统行**（首选进目标/请求者的 pane；首选未知时退回兜底角色）——如实、不静默。 */
export function emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string,
  deps: Pick<SessionManagerDeps, "emitEvent">): void {
  const roleId = preferredRoleId !== null && preferredRoleId !== "" ? preferredRoleId : fallbackRoleId;
  deps.emitEvent({ roleId, projectRoot, runtime, event: { kind: "message", summary, detail: { source: "delivery-note" } } });
}

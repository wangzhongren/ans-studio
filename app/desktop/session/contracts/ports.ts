// app/desktop/session/contracts/ports.ts
// B6（2026-11-13，session.ts 重构；方案 §3.3 关键跨模块端口）：本批新增的两个端口形状。
//  · `FixedDispatchPort`：dispatch（L4）→ fixed-workflow（L5）的固定路径派发/摘要回调端口。
//    dispatch 白名单禁止导入 fixed-workflow（同层/上行只走端口），由门面构造注入箭头回调（运行期调用、
//    参数逐位原样转发）。方法签名取自现行 `routeFixedPathDispatch` / `dispatchAdvisorySummary`，不新造语义。
//  · `HandbackSink`：回交提交的对外端口（门面构造时注入 persistence 模块的 `PersistenceHandbackPort`
//    形状；B6 起指向 `session/handback.ts`）。签名与现行 `handleHandback`/`handbackFlowId` 逐字一致。
// 依赖规则：contracts 只可依赖 src/model、src/common 类型与同模块 contracts（L0）。

import type { DispatchAdvisory } from "../../../../src/common/编排/dispatch-advisories.ts";
import type { TaskHandback } from "../../../../src/common/编排/handback.ts";
import type { RuntimeLiveReportViewV1, RuntimeReportSnapshotV1, DispatchReceipt, DispatchTaskPayload } from "../../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { ActualDispatchSource, LiveSession } from "./session-types.ts";

/** dispatch → fixed-workflow 的固定路径派发端口（门面注入；参数逐位原样转发）。 */
export interface FixedDispatchPort {
  routeFixedPathDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
    source: ActualDispatchSource | undefined,
    dispatchFlowId: string,
  ): Promise<DispatchReceipt>;
  dispatchAdvisorySummary(advisories: readonly DispatchAdvisory[]): string;
}

/** 回交提交端口（persistence/上层模块经门面注入；方法与现行 SessionManager 逐字一致）。 */
export interface HandbackSink {
  handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: "memory-only" | "unknown-live", flowId?: string): Promise<boolean>;
  handbackFlowId(entry: LiveSession, hb: TaskHandback | undefined): string | undefined;
}

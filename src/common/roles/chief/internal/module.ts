// chief 角色模块：`BuiltInRoleModule` 装配（纯数据/纯函数；唯一公开入口为 `../index.ts`）。
//
// 契约：E0.3 §3.1（`BuiltInRoleModule` 唯一公开形状）/§3.2（chief 行）/§3.3（纯数据/纯策略）。
// 本对象只组合内部纯数据与纯策略；不含 I/O/账本/会话/时钟/随机数/可变状态，不携带权限。

import type { BuiltInRoleModule } from "../../../../model/role.ts";
import { chiefContext } from "./context.ts";
import { chiefDispatch } from "./dispatch.ts";
import { CHIEF_PREFLIGHT } from "./preflight.ts";
import {
  CHIEF_CAPABILITIES,
  CHIEF_CARD_SPEC,
  CHIEF_CARDS,
  CHIEF_DISPLAY_NAME,
  CHIEF_FUNCTION,
  CHIEF_ID,
} from "./spec.ts";
import { chiefTools } from "./tools.ts";

/** chief 的内置角色模块（六个 `BuiltInRoleModule` 之一）。 */
export const chiefRoleModule: BuiltInRoleModule = Object.freeze({
  id: CHIEF_ID,
  displayName: CHIEF_DISPLAY_NAME,
  function: CHIEF_FUNCTION,
  card: CHIEF_CARD_SPEC,
  capabilities: CHIEF_CAPABILITIES,
  cards: CHIEF_CARDS,
  tools: chiefTools,
  dispatch: chiefDispatch,
  preflight: CHIEF_PREFLIGHT,
  context: chiefContext,
});

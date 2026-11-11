// product 角色模块 —— 唯一 public entry（E0.3 冻结契约 §3.1/§3.2 product 行）。
//
// 公开形状：`BuiltInRoleModule`（`src/model/role.ts`）：id/displayName/function/card/capabilities/cards
// ＋四个纯策略面（tools/dispatch/preflight?/context）。模块之间零 import；只依赖 Model 与 shared
// public entry；无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；返回数据/判定，不携带权限。
//
// T3「两条固定工作流路径」B2（v1.3 §3.4 / MF-IR-4）：新增可选 `fixedCards`（product fixed=[]）；
// fixed context/dispatch 只在 `matrix:"two-fixed-paths/v1"` 下生效。legacy `card.text`/`cards`/
// capabilities/dispatch/preflight/tools 与 `context({})` 逐字冻结（MF-2）。
//
// 内部文件位于 `internal/`（模块根只放本 entry）；外部只能经本文件导入。
// E2 由门禁引擎门面 `governance-roles.ts` 装配并删除旧内联规格（D2/D6）；E1 过渡期旧引擎仍是
// 权威/oracle（契约 §7.3）。

import type { BuiltInRoleModule } from "../../../model/role.ts";
import { PRODUCT_CARD } from "./internal/card.ts";
import { PRODUCT_CAPABILITIES, PRODUCT_CARDS, PRODUCT_FIXED_CARDS } from "./internal/capabilities.ts";
import { productTools } from "./internal/tools.ts";
import { productDispatch } from "./internal/dispatch.ts";
import { productPreflight } from "./internal/preflight.ts";
import { productContext } from "./internal/context.ts";

/**
 * product 内置角色模块（六个 `BuiltInRoleId` 之一）。
 *
 * - `card/capabilities/cards` 数据与迁移前 `governance-roles.ts` product 规格逐字段一致；
 * - `cards` 为空（product 不发起治理卡；D8）；`fixedCards` 为空（fixed 意图确认卡由幕僚呈）；
 * - `tools()` 只声明 `submitVersionChange`（trio；single 空集），越权/未知由引擎装配 fail-closed；
 * - `dispatch()` 只做硬身份/存在性（R-2）；fixed 矩阵 convener→product 允许、chief→product 拒绝；
 * - `preflight` 只覆盖 `version-upgrade`（product 的 VCA 提交前置，fail-closed）；
 * - `context()` 返回产品上下文/报告期望静态提示块（legacy 4 段；fixed 矩阵 3 段）。
 */
export const productRoleModule: BuiltInRoleModule = Object.freeze({
  id: "product",
  displayName: "产品",
  function: "product",
  card: PRODUCT_CARD,
  capabilities: PRODUCT_CAPABILITIES,
  cards: PRODUCT_CARDS,
  fixedCards: PRODUCT_FIXED_CARDS,
  tools: productTools,
  dispatch: productDispatch,
  preflight: productPreflight,
  context: productContext,
});

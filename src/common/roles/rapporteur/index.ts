// rapporteur 内置角色模块（E1 greenfield；唯一 public entry）。
//
// 契约来源：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（E0.3 冻结，
// 685 行 / SHA-256 067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3）
// §3.1（BuiltInRoleModule 形状 / 14 RoleToolId / R-2）、§3.2 rapporteur 行、§3.3（纯数据/纯策略）、
// §3.4（preflight 归属与事实包）、§3.5（错误语义）、§10 D1/D9/D10、§11/§11.1。
//
// 本模块对外只导出**一个** `BuiltInRoleModule`：
//   · 规格数据：id / displayName / function / card（text/entries/preauthorizedDirs/forbiddenWritePaths）/
//     capabilities / cards；
//   · 四个纯策略面：tools / dispatch / preflight / context。
//
// 硬约束：
//  - 只依赖 `src/model/` 与 `src/common/shared/` 的 public entry；不 import 门禁引擎私有 common、
//    引擎/门控/其他角色模块（角色模块之间零 import）；
//  - 无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；输入只读，不修改调用方数据；
//  - 返回普通数据/判定，不携带权限；缺事实/未知默认拒绝（fail-closed）；
//  - `capabilities` 是唯一真源（D10），`tools()` 输出是其派生；
//  - `cards` 只列当前有效卡种（D8；旧 `"write"` 等 legacy token 不进入模块数据）。
//
// 模块结构：根目录只有本文件；内部实现全部在 `internal/` 子目录，外部只能经本文件导入。

import type { BuiltInRoleModule } from "../../../model/role.ts";

import {
  RAPPORTEUR_CAPABILITIES,
  RAPPORTEUR_CARD_ENTRIES,
  RAPPORTEUR_CARD_TEXT,
  RAPPORTEUR_CARDS,
  RAPPORTEUR_DISPLAY_NAME,
  RAPPORTEUR_FORBIDDEN_WRITE_PATHS,
  RAPPORTEUR_FUNCTION,
  RAPPORTEUR_ID,
  RAPPORTEUR_PREAUTHORIZED_DIRS,
} from "./internal/spec.ts";
import { toolsPolicy } from "./internal/tools.ts";
import { dispatchPolicy } from "./internal/dispatch.ts";
import { checkRapporteurAction } from "./internal/preflight.ts";
import { contextSections } from "./internal/context.ts";

/**
 * rapporteur 角色模块（唯一公开值）。
 *
 * 消费方（E2 切换后）：门禁引擎 `governance-roles.ts` 门面（规格数据/工具策略）、编排/Service/桌面
 * （动作前置与提示块）。过渡期旧引擎仍是权威 oracle，本模块输出供差分。
 */
export const rapporteurRoleModule: BuiltInRoleModule = Object.freeze({
  id: RAPPORTEUR_ID,
  displayName: RAPPORTEUR_DISPLAY_NAME,
  function: RAPPORTEUR_FUNCTION,
  card: Object.freeze({
    text: RAPPORTEUR_CARD_TEXT,
    entries: RAPPORTEUR_CARD_ENTRIES,
    preauthorizedDirs: RAPPORTEUR_PREAUTHORIZED_DIRS,
    forbiddenWritePaths: RAPPORTEUR_FORBIDDEN_WRITE_PATHS,
  }),
  capabilities: RAPPORTEUR_CAPABILITIES,
  cards: RAPPORTEUR_CARDS,
  tools: toolsPolicy,
  dispatch: dispatchPolicy,
  preflight: Object.freeze({ checkAction: checkRapporteurAction }),
  context: contextSections,
});

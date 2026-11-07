// chief 角色模块：规格数据（id / displayName / function / card / capabilities / cards）。
//
// 数据来源（只读 oracle，逐字段差分见 `test/roles/chief/differential.test.ts`）：
//  - `src/common/门禁引擎/governance-roles.ts:311-358`（`BUILT_IN_GOVERNANCE_ROLES` 的 chief 项）；
//  - `src/pipeline/orchestration/run-role.ts:2859-2880`（`TRIO_CARD_KINDS.chief`）。
//
// D10（E0.3 §10.2）：本文件的 `CHIEF_CAPABILITIES` 是能力位**唯一真源**；`tools()` 输出只是派生，
// 必须与这里逐字段一致（单元测试断言）。`cards` 只列当前有效卡种（D8：不含 legacy `"write"`）。

import type { BoundaryEntry } from "../../../../model/boundary.ts";
import type { GovernanceCapabilities, GovernanceCardKind, RoleCardSpec } from "../../../../model/role.ts";
import { CHIEF_CARD_TEXT } from "./card-text.ts";

/** chief 的公开内置角色 id。 */
export const CHIEF_ID = "chief" as const;
/** chief 的显示名（旧注册表逐字）。 */
export const CHIEF_DISPLAY_NAME = "幕僚";
/** chief 的治理职能（旧注册表逐字）。 */
export const CHIEF_FUNCTION = "chief" as const;

/** Section 1 条目（root 恒为 project；与旧注册表逐字段一致）。 */
const CHIEF_ENTRIES: readonly BoundaryEntry[] = Object.freeze([
  Object.freeze({
    root: "project" as const,
    path: "docs/intents/",
    kind: "directory" as const,
    purpose: "客户意图 / 沟通记录（intentId/handoffKind/goal/scope/acceptance/客户原话）",
  }),
]);

/** 会话初始 writeSet 预置目录（预授权 ≠ 跳过边界/禁写路径/治理门禁）。 */
const CHIEF_PREAUTHORIZED_DIRS: readonly string[] = Object.freeze(["docs/intents/"]);

/**
 * 先于 `resolveWrite` 判定的禁写前缀（应用治理记录/其他治理角色资料）。
 * 顺序与旧注册表一致：应用独占三项在前，随后是 chief 的禁写清单。
 */
const CHIEF_FORBIDDEN_WRITE_PATHS: readonly string[] = Object.freeze([
  ".ans/",
  "docs/bootstrap-manifest.md",
  "角色卡/governance-boundary.yaml",
  "角色卡/",
  "docs/proposals/",
  "docs/contracts/",
  "docs/nominations/",
  "docs/skills/",
  "docs/mcp/",
  "docs/governance/",
  "docs/workflow.md",
]);

/** 角色卡与边界数据的公开只读投影（值本身不构成写权限）。 */
export const CHIEF_CARD_SPEC: RoleCardSpec = Object.freeze({
  text: CHIEF_CARD_TEXT,
  entries: CHIEF_ENTRIES,
  preauthorizedDirs: CHIEF_PREAUTHORIZED_DIRS,
  forbiddenWritePaths: CHIEF_FORBIDDEN_WRITE_PATHS,
});

/** 能力位唯一真源（D10）；`tools()` 输出必须与它一致。 */
export const CHIEF_CAPABILITIES: GovernanceCapabilities = Object.freeze({
  customerInput: true,
  dispatchTask: true,
  roleStatus: true,
  sessionTail: true,
  installSkill: false,
  installMcp: false,
  shell: "operator-approve" as const,
});

/** 当前有效卡种（旧 `TRIO_CARD_KINDS.chief`；D8：不含 legacy `"write"`）。 */
export const CHIEF_CARDS: readonly GovernanceCardKind[] = Object.freeze(["intent-confirm"]);

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

/**
 * 当前有效卡种（旧 `TRIO_CARD_KINDS.chief`；D8：不含 legacy `"write"`）。
 *
 * legacy 数据逐字冻结（T3 B2；`MF-IR-4` / v1.3 §3.4）：fixed 矩阵**不读**本字段，也不就地改值；
 * fixed 卡种见 `CHIEF_FIXED_CARDS`。legacy 消费点（`run-role.ts::legacyCardKindsOf` 等）不变。
 */
export const CHIEF_CARDS: readonly GovernanceCardKind[] = Object.freeze(["intent-confirm"]);

/**
 * fixed 矩阵（`two-fixed-paths/v1`）可发起卡种白名单（T3 v1.3 §3.4 / G-IR §5.7 MF-IR-4 冻结值）：
 * 恰 `["intent-confirm","proposal","appointment"]`——固定路径的 3 张客户确认卡（意图/方案/任命，
 * 不合并；固定路径不发 acceptance 卡）。
 *
 * 只从本字段读取，**不从 legacy `cards`（`["intent-confirm"]`）过滤/推导**；缺失/非法由消费方
 * （门禁引擎门面 `cardKindsOf(id,"two-fixed-paths/v1")`、编排 B2）fail-closed 空集。纯数据、无 I/O；
 * legacy 数据与 legacy 消费点逐字冻结、不得改读本字段。
 */
export const CHIEF_FIXED_CARDS: readonly GovernanceCardKind[] = Object.freeze([
  "intent-confirm",
  "proposal",
  "appointment",
]);

/**
 * fixed 矩阵下 chief 可派发的内置目标（2026-11-17 app-dispatch/v1，设计 §2.1/§6.1）。
 *
 * **按设计清零为空数组**：新协议下幕僚不再派发任何 agent（只选流程、按应用 prompt 呈客户卡）；
 * 固定会话不注入 `dispatch_task`/`close_created_task`/`redispatch_task`/`terminate_role_run`，
 * 越权调用由编排谓词返回 `chief-dispatch-removed`（双保险）。空数组 = 消费方（
 * `governance-matrix` fixed 视图、fixed 谓词）fail-closed 不出任何幕僚派发路由，**不落回**
 * legacy 五内置；legacy `CHIEF_HUB_DISPATCH.targetRoleIds`（五内置）**逐字冻结**、消费点
 * （apply-journal / trunk-runtime）不改读取源。纯数据、无 I/O。
 *
 * 历史（v2.1，fixed-v2.1 在飞协议）：冻结值曾为 `["convener","verifier"]`（convener 仅
 * stage-request；verifier 为 review/preparation）；该协议的在飞 workflow 继续按 v2 资源与旧码
 * 运行直至关闭（Q10 不迁移），本字段只为新协议使用。
 */
export const CHIEF_FIXED_TARGET_ROLE_IDS: readonly string[] = Object.freeze([]);

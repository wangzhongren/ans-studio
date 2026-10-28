// 门禁引擎私有：内置治理角色注册表（D 批最小系统，2026-10-28）。
//
// 六个内置治理角色：幕僚 chief、产品 product、策划 rapporteur、人事 nominator、运营 convener、质检 verifier；
// `primaryRoleId = chief`。旧 `liaison` 已退休（不再有别名/职能/卡文本；历史目录按保留 id 跳过）。
// 本文件只提供**数据**：卡片文本、Section 1 条目、写区预授权/禁写、能力位与 shell 审批档；
// 不实现 gate/flow/ledger/验收分诊等机器（D 批已全部撤除）。
//
// 依赖方向：本文件只依赖 `src/model/`（类型）；`boundary-core.ts` 单向依赖本文件。

import type { Acceptance, BoundaryEntry, BoundarySection1 } from "../../model/boundary.ts";
import type { GovernanceFunction } from "../../model/role.ts";

/**
 * 治理能力矩阵（评审 §5.6 + 2026-10-18 四角色评审 §4.3，唯一数据来源）。编排/桌面按本结构
 * 注入工具与 shell 档，**不得**再在调用方按角色 id 散落硬编码（评审 §二-4）。
 */
export interface GovernanceCapabilities {
  /** 客户确认/选择卡通道：Lead / 主理 只用于 `intent-confirm` 卡（卡片白名单由编排限制）；
   *  其余角色与 su 为 true。 */
  customerInput: boolean;
  /** 派发工具 `dispatch_task`：convener（trio）与 su（single，旧行为）；2026-10-20 客户拍板
   *  Lead / 主理 作为工作流管理者也可派发协调任务（liaison，trio）。 */
  dispatchTask: boolean;
  /** 仅 convener（trio）与 su（single，旧行为）。 */
  roleStatus: boolean;
  /** 仅 convener（trio）与 su（single，旧行为）。 */
  sessionTail: boolean;
  /** 仅 nominator（trio）与 su（single，旧行为）。 */
  installSkill: boolean;
  /** 仅 nominator（trio）与 su（single，旧行为）。 */
  installMcp: boolean;
  /**
   * shell 面（客户 2026-10-19 新规则：所有角色都有 shell 权限，含读、写与任意命令，但一律经审批链）：
   * `operator-approve`＝审批档——只读白名单（(c)=allow）直接执行；risky/review/deny 逐条提交客户/
   * 判断 agent 审批，拒绝、超时、通道不可用一律不放行。**五个内置治理角色（trio 五人）与 su 统一为该档**；
   * shell 可读写、可执行任意命令，但**写入同样受审批链约束**，审批不改变任何角色的职责与 Section 1
   * 写边界（边界内写入是预授权，直接用 `write_file` / `edit_file`；治理敏感写入与边界外仍按既有
   * 禁止 / 审批规则）。
   * `none` / `readonly` 仅为旧数据/兼容保留（新注册项不得再用；`readonly` 旧语义为 risky/review/deny
   * 一律拒绝）。执行层消费方按能力位注入审批档（`shellOperatorOnly`），不得在调用方按角色 id 散落硬编码。
   */
  shell: "none" | "readonly" | "operator-approve";
}

/** 一个 trio 内置治理角色的完整规格（评审 §5.2；2026-10-18 增 liaison/verifier）。
 *  2026-10-28 批次 A（方案 v9.2）：六角色 `chief`/`product`/`rapporteur`/`nominator`/`convener`/
 *  `verifier`；`liaison` 已退休（不再有别名/规格）。 */
export interface BuiltInGovernanceRoleSpec {
  id: "chief" | "product" | "rapporteur" | "nominator" | "convener" | "verifier";
  displayName: string;
  function: GovernanceFunction;
  cardText: string;
  /** 该角色的 Section 1（root 恒为 project；按段比较，不实现 glob）。 */
  entries: BoundaryEntry[];
  /**
   * 会话初始 writeSet 预置目录（客户 2026-10-25 新规则：Section 1 边界内的写入是预授权、直接写；
   * 本字段仍是编排播种初始写集的目录清单，预授权 ≠ 跳过 F4/F6/F7、禁写路径与治理门禁）。
   */
  preauthorizedDirs: readonly string[];
  /** 先于 `resolveWrite` 判定的禁写前缀（应用治理记录/其他治理角色资料），命中即拒。 */
  forbiddenWritePaths: readonly string[];
  capabilities: GovernanceCapabilities;
}

export type TrioGovernanceRoleId = BuiltInGovernanceRoleSpec["id"];

/** 注册表查询结果：六个内置角色。 */
export type GovernanceRoleSpec = BuiltInGovernanceRoleSpec;


/** 五人统一的「应用独占写路径」：任何角色都不可写（只由 `appGovernanceBoundary` 给应用用）。 */
const APP_ONLY_WRITE_PREFIXES: readonly string[] = [
  ".ans/",
  "docs/bootstrap-manifest.md",
  "角色卡/governance-boundary.yaml",
];

/** 内置治理角色 + 旧 su 的目录前缀（`角色卡/<内置治理角色 id>/**` 的具体展开）。 */
const BUILT_IN_ROLE_DIR_PREFIXES: readonly string[] = [
  "角色卡/chief/",
  "角色卡/product/",
  "角色卡/rapporteur/",
  "角色卡/nominator/",
  "角色卡/convener/",
  "角色卡/verifier/",
  "角色卡/su/",
];

/** 项目根条目助手（trio 五人的条目 root 恒为 project）。 */
function projectEntry(path: string, kind: BoundaryEntry["kind"], purpose: string): BoundaryEntry {
  return { root: "project", path, kind, purpose };
}

// —————————————————————— 卡文本（评审 §5.2「卡文本最低内容」；四角色 §4.2）——————————————————————

/**
 * shell 面统一口径（客户 2026-10-19 新规则；五张内置治理角色卡逐字复用，单一来源）：
 * 五个内置治理角色都接审批档——只读白名单直接执行，其余（含读写与任意命令）逐条提交审批；
 * 审批不改变角色职责与写边界：Section 1 边界内的写入是预授权（见
 * `BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE`），边界外与治理敏感写入仍按本卡与既有规则
 * 拒绝或需确认；拒绝/超时/不可用不放行。
 */
const SHELL_APPROVAL_CARD_LINE =
  "shell 审批档——只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent 审批；审批不改变你的职责与写边界：Section 1 边界内的写入是预授权，直接用 `write_file` / `edit_file`（不逐次 `request_confirmation`），边界外与治理敏感写入仍按本卡与既有规则拒绝或需确认。拒绝、超时、通道不可用一律不放行。";

/**
 * 写入预授权总则（客户 2026-10-25 新规则，原文：「写自己角色权限内的路径，直接放行。」；
 * 五张内置治理角色卡逐字复用，单一来源）：Section 1 边界内的写入是预授权——直接用
 * `write_file` / `edit_file`，不再逐次发 `request_confirmation` 写卡；`request_confirmation` 只保留
 * 给治理敏感写入与需要客户决定的动作。本段只声明写盘流程纪律：判定逻辑、边界外拒绝、禁写路径与
 * 治理写入审批零变化；预授权不扩展到边界外或他人写集。
 */
export const BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE =
  "写入预授权（客户 2026-10-25 新规则）：**你的 Section 1 边界内的写入是预授权的**——直接用 `write_file` / `edit_file` 写入，**不需要逐次发 `request_confirmation` 写卡**；写权上界仍由 WriteGate 的边界判定保证（边界外照旧拒绝）。`request_confirmation` 只保留给治理敏感写入与需要客户决定的动作：角色卡 / 边界变更、共享 i18n 等共享目录或他人写集、发布 / 变更包等按既有禁止与审批规则处理，以及须由客户拍板的事项。**不得把边界内预授权扩展到边界外或他人写集**，也不得削弱边界外拒绝、禁写路径与治理写入审批等既有规则。";

/**
 * 客户卡化总则（客户 2026-10-27 新规则；五张内置治理角色卡逐字复用，单一来源）：
 * 任何需要客户确认 / 选择的问题都必须以客户卡呈现，不能在聊天里让客户口头回答；沉默、默认
 * 勾选、未回复、既有做法、其他角色转述或推荐项都不能当客户确认 / 选择。代理开关按应用现状
 * 分工：`request_confirmation` 由「替我审批」代理，`request_choice` / decision 卡由「替我
 * 决策」代理；两个都关时客户本人作答；代理只能按卡内唯一 `recommended: true` 或已发选项处理，
 * 不得自造选项；代理不可用 / 失败 / 超时 / deny ⇒ 回落客户，fail-closed。本段只声明客户交互
 * 纪律，不新增角色、cardKind、工具、写权或判定逻辑。
 */
const CUSTOMER_CARDIFICATION_PRINCIPLE = [
  "客户卡化纪律（客户 2026-10-27 新规则，必须）：**任何需要客户确认 / 选择的问题都必须以客户卡呈现**——按本卡既有白名单使用 `request_confirmation`（确认 / 取消）或 `request_choice`（单选 / 多选 / decision 卡）；本卡可用卡型以「治理卡参数纪律」的白名单为准；**不得在聊天里让客户口头回答**，禁止「请回复」「请口头选」「回复 1/2」「不选默认同意」等问法；**不得把沉默、未回复、默认勾选、既有做法、其他角色转述或推荐项当作客户确认 / 选择**。",
  "**代理开关语义（按应用现状）**：`request_confirmation` 由客户「替我审批」开关代理；`request_choice` / decision 卡由客户「替我决策」开关代理；两个开关都关时由客户本人作答。代理只能按卡内**唯一 `recommended: true`** 的推荐项或**已发选项**处理——不得自造选项、不得改选项、不得把推荐项说成客户本人选择；代理开启但不可用 / 失败 / 超时 / deny ⇒ **回落客户**，fail-closed——不得按默认同意或自行推进。**本卡白名单以外的确认 / 选择**：不得自造卡型或自行决定，交有对应权限的角色发卡（材料性选择由 运营 / Steward 发 decision 卡）。",
  "**未决材料缺口卡片先行**：发现未决材料缺口（例如提案 §5 M1 的「截图采集范围 / 截图清单」证据形式）时，必须在**依赖步骤前**用客户卡确定（有 decision 卡权限的角色发 `request_choice` decision 卡；无权限的角色交有权限角色发卡），不得自己定；**没有卡 / 客户未决时不得推进该依赖步骤**，不得把推荐项 / 沉默 / 未反对当已选。",
].join("\n");

// —————————————————————— 批次 A（2026-10-28 方案 v9.2）：六角色身份层 ——————————————————————
//
// 本批只做**身份层**：六角色 id/显示名/职能、primaryRoleId=chief、liaison 退休（仅编译期只读别名）、
// i18n/列表/UI。**现行（旧）写区与能力矩阵保持不变**（convener 仍保留 dispatch 与 docs/flows /
// docs/workflow.md 等旧写区；verifier 旧写区不变）——目标写区（方案 §3.1/§10.2）与 convener 去
// dispatch 在 D 批随旧 flow/gate 删除同步切换；chief 的新能力（role_activity_log 等）在 B 批新增。
// 依据：团队计划 amendment-1（2026-10-28，沟通裁定）。

const CHIEF_CARD_TEXT = [
  "# 角色：幕僚（内置角色）",
  "",
  "职能：工作流管理、任务派发、短报汇总、运行日志巡检（不是决定权）。",
  "- 每项任务用 `dispatch_task` 派给内置角色或项目 worker；工作结果只向你短报（`submit_report`）。",
  "- 用 `role_status` / `session_tail` / `role_activity_log` 核对状态；卡死时 `terminate_role_run` / `redispatch_task`（安全重派上限 2）。",
  "- 申请直达：角色直接提交客户卡；应用呈现/裁决；你只收系统通知，不转发/不审批/不代选/不代决。",
  "- 决策：两开关独立；开关关闭或判断不可用交客户；代批标 `judge 代批`。",
  "- 你不批准提案/任命/验收，不写账本/flow/gate，不代标 `delivered`。",
  "可写：`docs/intents/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/product/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
  "纪律：任务文本写清目标/期望产出/可选证据；短报如实区分完成/阻塞/失败；不伪造完成、不把推荐项当客户决定。",
].join("\n");

const PRODUCT_CARD_TEXT = [
  "# 角色：产品（内置角色）",
  "",
  "职能：产品取舍、产品评审、产品文档；在职责范围内对材料性选择提交 decision 卡。",
  "- 申请直达：直接提交客户卡；应用呈现/裁决，结果回你；幕僚只收通知。",
  "- 两开关独立、fail-closed；代批标 `judge 代批`，不得写成客户本人。",
  "- 边界内写入直接写；不写其他角色资料、不创建角色、不批准提案/任命/验收。",
  "可写：`docs/product/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/intents/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

/** @deprecated 批次 A 只读别名（方案 §16.3）；旧 liaison 的卡文本仅用于存量旧会话/旧测试，D 批删除。 */
const RAPPORTEUR_CARD_TEXT = [
  "# 角色：策划（内置角色）",
  "",
  "职能：提案与方案、跨角色契约（按职责），需要客户决定时直接提交卡。",
  "- 提案/材料性选择用 `request_choice`（`cardKind=proposal` / `decision`）；需求变更用 `request_requirement_change`。",
  "- 审批由客户或判断 agent 在卡上完成；发起方不得自批、不得代选；代批标 `judge 代批`。",
  "- 不写其他角色资料、不创建角色、不批准任命/验收。",
  "可写：`docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/product/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

const NOMINATOR_CARD_TEXT = [
  "# 角色：人事（内置角色）",
  "",
  "职能：角色卡/边界与技能/MCP 的治理写入；角色创建/写区决定（D3）通过后逐次写卡。",
  "- D3/材料性选择用 `request_choice(cardKind=decision)`；`角色卡/**` 每次写入仍需 `request_confirmation(cardKind=appointment-write)`，带 `targetRoleId` + `decisionId`。",
  "- 应用做结构校验（boundary YAML/role-card 必需节/路径在 `角色卡/<roleId>/`/非内置 id/不重叠）；失败不落盘。",
  "写 `boundary.yaml` 必须照抄最小模板（顶层只认 role/entries/archived）：",
  "role: <roleId>",
  "entries:",
  "  - kind: directory",
  "    path: bin/",
  "    purpose: 说明",
  "- 不得写 version、roleId、root 顶层键；条目内不要写 `root:`（普通 `kind: file` / `kind: directory` 不写；仅 conditional-directory 可选）。",
  "- 目标必须是项目角色、不得写内置角色；不批准提案/验收，不代客户决定。",
  "可写：`角色卡/**`（appointment-write 逐次审批）、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/`。",
  "禁写：`.ans/**`、`docs/intents/**`、`docs/product/**`、`docs/proposals/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`。",
].join("\n");

const CONVENER_CARD_TEXT = [
  "# 角色：运营（内置角色）",
  "",
  "职能：计划/分析/调度记录（人读），需要客户决定时直接提交卡；不调度角色、不收回交。",
  "- 计划/分析/需求变更等材料性选择用 `request_choice(cardKind=decision)` 或 `request_requirement_change`。",
  "- 不派项目 worker、不记录别人回交、不写角色卡、不批准提案/验收。",
  "- 不依赖 flow/gate/ledger（已撤除）。",
  "可写：`docs/scheduling/`、`docs/governance/convener/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/intents/**`、`docs/product/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

const VERIFIER_CARD_TEXT = [
  "# 角色：质检（内置角色）",
  "",
  "职能：可选质量核对与验收材料选择；验收为可选任务，由幕僚调度或发起角色直接申请。",
  "- 材料性选择用 `request_choice(cardKind=decision)`；不批准提案/任命，不代客户验收。",
  "- 证据最多真实运行截图（关 DEBUG；记录 sha256/候选/命令）；不要求录屏，缺录屏不判失败。",
  "- 不依赖 flow/gate/ledger（已撤除）；不写其他角色资料、不创建角色。",
  "可写：`docs/quality/`、`docs/verification/`、`docs/governance/verifier/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/intents/**`、`docs/product/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/scheduling/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

// —————————————————————— 注册表（顺序即 listProject 的枚举顺序）——————————————————————

/**
 * trio 六个内置角色（2026-10-28 批次 A 身份层；方案 v9.2 §3.1/§10.2）：
 * 顺序 chief → product → rapporteur → nominator → convener → verifier，`primaryRoleId="chief"`。
 * **写区/能力为现行（旧）态**：rapporteur/nominator/convener/verifier 的 Section 1、预授权、禁写与
 * 能力位逐字保留到 D 批；chief 继承旧 liaison 的 `docs/intents/` 与旧能力（含旧 coordinate dispatch）；
 * product 在 A 批为**身份占位**（Section 1/预授权为空，目标 `docs/product/` 在 D 生效）。
 * 目标写区与 convener 去 dispatch 在 D 批切换（团队计划 amendment-1/A-04a）。
 */
export const BUILT_IN_GOVERNANCE_ROLES: readonly BuiltInGovernanceRoleSpec[] = [
  {
    id: "chief",
    displayName: "幕僚",
    function: "chief",
    cardText: CHIEF_CARD_TEXT,
    entries: [
      projectEntry(
        "docs/intents/",
        "directory",
        "客户意图 / 沟通记录（intentId/handoffKind/goal/scope/acceptance/客户原话）",
      ),
    ],
    preauthorizedDirs: ["docs/intents/"],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      // 与基线 liaison 的禁写清单逐字一致（A 批不提前扩张目标写区）。
      "角色卡/",
      "docs/proposals/",
      "docs/contracts/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/governance/",
      "docs/workflow.md",
    ],
    capabilities: {
      customerInput: true,
      // 继承旧 liaison 的 coordinate 派发能力（旧 flow 路径保留到 D）；新矩阵的星形派发在 B 批。
      dispatchTask: true,
      roleStatus: true,
      sessionTail: true,
      installSkill: false,
      installMcp: false,
      shell: "operator-approve",
    },
  },
  {
    id: "product",
    displayName: "产品",
    function: "product",
    cardText: PRODUCT_CARD_TEXT,
    // D 批：product 目标写区生效 `docs/product/`。
    entries: [
      projectEntry("docs/product/", "directory", "产品取舍 / 产品评审 / 产品文档（D 批目标写区）"),
    ],
    preauthorizedDirs: ["docs/product/"],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      // 与基线 liaison 的禁写清单逐字一致（A 批不提前扩张目标写区）。
      "角色卡/",
      "docs/proposals/",
      "docs/contracts/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/governance/",
      "docs/workflow.md",
    ],
    capabilities: {
      // 批次 A：product 不新增特殊能力（申请线 C、星形汇报 B；客户通道本批不启用）。
      customerInput: false,
      dispatchTask: false,
      roleStatus: false,
      sessionTail: false,
      installSkill: false,
      installMcp: false,
      shell: "operator-approve",
    },
  },
  {
    id: "rapporteur",
    displayName: "策划",
    function: "proposal",
    cardText: RAPPORTEUR_CARD_TEXT,
    entries: [
      projectEntry("docs/proposals/", "directory", "提案（frontmatter: flowId/version/author/status: draft）"),
      projectEntry("docs/contracts/", "directory", "冻结的跨角色契约（版本化文件，不原地改）"),
      projectEntry("docs/governance/rapporteur/", "directory", "策划 / Draft 的治理工作记录"),
    ],
    preauthorizedDirs: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      ...BUILT_IN_ROLE_DIR_PREFIXES,
      "docs/nominations/",
    ],
    capabilities: {
      customerInput: true,
      dispatchTask: false,
      roleStatus: false,
      sessionTail: false,
      installSkill: false,
      installMcp: false,
      shell: "operator-approve",
    },
  },
  {
    id: "nominator",
    displayName: "人事",
    function: "nomination",
    cardText: NOMINATOR_CARD_TEXT,
    entries: [
      projectEntry("角色卡/", "directory", "项目角色目录（按团队计划写 role-card.md / boundary.yaml / 工作文档；须 appointment + 写盘确认）"),
      projectEntry("docs/skills/", "directory", "技能文档与安装登记（先落盘再激活）"),
      projectEntry("docs/mcp/", "directory", "MCP 声明文档（先落盘再激活；凭据值不写文件）"),
      projectEntry("docs/governance/nominator/", "directory", "人事 / Crew 的治理工作记录"),
    ],
    preauthorizedDirs: [
      "docs/skills/",
      "docs/mcp/",
      "docs/governance/nominator/",
    ],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      ...BUILT_IN_ROLE_DIR_PREFIXES,
      "docs/proposals/",
      "docs/scheduling/",
    ],
    capabilities: {
      customerInput: true,
      dispatchTask: false,
      roleStatus: false,
      sessionTail: false,
      installSkill: true,
      installMcp: true,
      shell: "operator-approve",
    },
  },
  {
    id: "convener",
    displayName: "运营",
    function: "schedule",
    cardText: CONVENER_CARD_TEXT,
    entries: [
      projectEntry("docs/scheduling/", "directory", "计划 / 分析 / 调度记录（D 批目标写区；无 flow 机器）"),
      projectEntry("docs/governance/convener/", "directory", "运营的治理工作记录"),
    ],
    preauthorizedDirs: ["docs/scheduling/", "docs/governance/convener/"],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      "角色卡/",
      "docs/proposals/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
    ],
    capabilities: {
      customerInput: true,
      // D 批：运营不再调度（dispatch/role_status/session_tail 仅幕僚）。
      dispatchTask: false,
      roleStatus: false,
      sessionTail: false,
      installSkill: false,
      installMcp: false,
      shell: "operator-approve",
    },
  },
  {
    id: "verifier",
    displayName: "质检",
    function: "verification",
    cardText: VERIFIER_CARD_TEXT,
    entries: [
      projectEntry("docs/quality/", "directory", "质量记录 / 可选核对（D 批目标写区）"),
      projectEntry("docs/verification/", "directory", "可选核对证据附件（不是验收结论）"),
      projectEntry("docs/governance/verifier/", "directory", "质检的治理工作记录"),
    ],
    preauthorizedDirs: ["docs/quality/", "docs/verification/", "docs/governance/verifier/"],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      ...BUILT_IN_ROLE_DIR_PREFIXES,
      "docs/intents/",
      "docs/proposals/",
      "docs/contracts/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/workflow.md",
    ],
    capabilities: {
      customerInput: true,
      dispatchTask: false,
      roleStatus: false,
      sessionTail: false,
      installSkill: false,
      installMcp: false,
      shell: "operator-approve",
    },
  },
];

/**
 * 旧 `liaison` 的只读别名规格（不进入上面的注册表数组/列表）：与基线逐字一致，仅用于存量旧会话、
 * 旧项目记录与旧测试按 id 解析。批次 D 删除。
 */
/** 旧 su（single）的预授权目录（角色模型/入口保留；共享 flow/gate/ledger 机器已撤除）。 */
export const LEGACY_SU_PREAUTHORIZED_DIRS: readonly string[] = ["docs/su", "docs/contracts", "docs/skills", "docs/mcp"];

/** 旧 su（single）的只读能力位：保留角色模型/入口；共享 flow/gate/ledger 机器已撤除。 */
export const LEGACY_SU_CAPABILITIES: GovernanceCapabilities = {
  customerInput: true,
  dispatchTask: true,
  roleStatus: true,
  sessionTail: true,
  installSkill: true,
  installMcp: true,
  shell: "operator-approve",
};

/** 按 id 取 trio 内置角色规格；`su` 与项目角色返回 undefined。 */
export function governanceRoleOf(id: string): GovernanceRoleSpec | undefined {
  return BUILT_IN_GOVERNANCE_ROLES.find((spec) => spec.id === id);
}

/** trio 内置角色的职能；`su` 与项目角色返回 undefined。 */
export function governanceFunctionOf(id: string): GovernanceFunction | undefined {
  return governanceRoleOf(id)?.function;
}

/**
 * 能力矩阵查询（评审 §5.6「单点」）：trio 五人读注册表；`su` 返回
 * `LEGACY_SU_CAPABILITIES`；项目角色/未知 id 返回 undefined（调用方不得自行兜底成 su 能力）。
 */
export function governanceCapabilitiesOf(id: string): GovernanceCapabilities | undefined {
  const spec = governanceRoleOf(id);
  if (spec !== undefined) return spec.capabilities;
  if (id === "su") return LEGACY_SU_CAPABILITIES;
  return undefined;
}

/**
 * 是否为内置治理角色 id（trio 六角色 + 旧 su）。
 * 用途：`dispatch_task` 目标拒绝、角色目录保留 id、技能/MCP 安装与恢复提议的目标守卫。
 */
export function isBuiltInGovernanceRoleId(id: string): boolean {
  return id === "su" || governanceRoleOf(id) !== undefined;
}

/** 是否为 trio 的六个内置角色 id（不含 su 与已退休的旧 liaison）。 */
export function isTrioGovernanceRoleId(id: string): boolean {
  return BUILT_IN_GOVERNANCE_ROLES.some((spec) => spec.id === id);
}

/**
 * 新/变更角色的 `role-card.md` 必填章节（方案 §6.1 第 1–9 项；等价中文标题即可）。
 * C 批（方案 §6.4.1/C-06）：appointment-write 的结构校验**单一来源**——桌面写卡产物校验
 * （`interface.ts::validateAppointmentArtifacts`）与编排呈现前预览校验（`run-role.ts`）共用本表，
 * 不复制第二份；`existing` 迁移只做存在/标题检查。
 */
export const ROLE_CARD_REQUIRED_SECTIONS: ReadonlyArray<{ label: string; test: RegExp }> = Object.freeze([
  { label: "组别", test: /组别|group/i },
  { label: "工作立场", test: /工作立场/ },
  { label: "能力描述", test: /能力描述|职责与能力/ },
  { label: "职责与功能导航", test: /系统功能导航|职责与功能导航/ },
  { label: "必读资料", test: /必读资料/ },
  { label: "交接输入输出", test: /交接/ },
  { label: "执行原则", test: /执行原则/ },
  { label: "质量职责", test: /质量/ },
  { label: "标准工作流", test: /工作流/ },
  { label: "交付物清单", test: /交付物/ },
]);

/** trio 内置角色边界来源标签（评审 §5.3 逐字格式）。 */
export function trioGovernanceSource(roleId: string): string {
  return `<built-in:trio/${roleId}>`;
}

/** 应用专用治理边界的来源标签（内部诊断；不注入任何角色会话）。 */
export const APP_GOVERNANCE_SOURCE = "<built-in:app-governance>";

/**
 * 应用专用治理边界条目（评审 §5.3；2026-10-18 增 shell 审计目录）：固定四项——
 * `角色卡/governance-boundary.yaml`（file）、`.ans/`（directory）、`docs/bootstrap-manifest.md`（file）、
 * `docs/audit/`（directory，shell 命令审计由应用写）。
 * 只在编排的 `finalizeBootstrap` / `repinIfBootstrapped` / 迁移 / shell 审计边界中使用；
 * **不注入任何角色会话**。五人与 su 的 Section 1 均不含 `docs/audit/`（角色仍不可写）。
 */
export function appGovernanceEntries(): BoundaryEntry[] {
  return [
    projectEntry("角色卡/governance-boundary.yaml", "file", "应用写出的项目治理边界文档（pin 锚点）"),
    projectEntry(".ans/", "directory", "应用独占治理记录区（.ans/project.json 与运行状态）"),
    projectEntry("docs/bootstrap-manifest.md", "file", "应用写出的 bootstrap/迁移留痕清单"),
    projectEntry("docs/audit/", "directory", "shell 命令审计（应用写）"),
  ];
}

/**
 * 应用专用治理边界（`acceptance` 由调用方提供，通常是当前会话边界的接受证据）。
 * 五人与 su 的边界均不含这些路径的写权；本边界**只给应用**，不参与角色写权判定。
 */
export function appGovernanceBoundary(acceptance: Acceptance): BoundarySection1 {
  return {
    entries: appGovernanceEntries(),
    boundarySource: APP_GOVERNANCE_SOURCE,
    acceptance,
  };
}

// —————————————————————— 越界写入的归属指引（AC3，2026-10-18）——————————————————————
//
// Lead / 主理 的 Section 1 只有 `docs/intents/`；其余治理产物由别的角色/应用写。拒绝文案不能只说
// 「未匹配任何边界条目」——必须指回正确归属（提案→Draft / 提案、角色卡→Crew / 组队、
// 流程/团队计划/变更包→Steward / 统筹、验收标准/报告→Proof / 验收、应用记录→应用），否则主入口/客户
// 无从知道下一步找谁（四角色评审 §4.4/AC3）。只影响**拒绝文案**，不改变任何放行/拒绝判定。

interface WriteOwnerHint {
  readonly prefixes: readonly string[];
  readonly guidance: string;
}

/** 顺序敏感：应用独占路径先于「角色卡/」等宽前缀匹配。 */
const GOVERNANCE_WRITE_OWNER_HINTS: readonly WriteOwnerHint[] = [
  {
    prefixes: [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"],
    guidance: "该路径只能由应用写（治理记录/账本/边界文档/manifest），任何角色都不可写。",
  },
  {
    prefixes: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    guidance: "该路径属 策划 / Draft 的写区（提案/契约）；请把客户意图交给 策划 / Draft，由 策划 / Draft 形成提案。",
  },
  {
    prefixes: ["角色卡/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    guidance: "该路径属 人事 / Crew 的写区（角色卡/技能/MCP）；请交给 人事 / Crew。",
  },
  {
    prefixes: ["docs/scheduling/", "docs/governance/convener/"],
    guidance: "该路径属运营的写区（计划/分析/调度记录）；请交给运营。",
  },
  {
    prefixes: ["docs/quality/", "docs/verification/", "docs/governance/verifier/"],
    guidance: "该路径属质检的写区（质量记录/可选核对证据）；请交给质检。",
  },
];

/** 路径是否在某个前缀下（按段比较；大小写不敏感，仅用于文案归属）。 */
function underHintPrefix(relPath: string, prefix: string): boolean {
  const p = prefix.toLowerCase();
  const rel = relPath.toLowerCase();
  return prefix.endsWith("/") ? rel.startsWith(p) : rel === p;
}

/**
 * trio 内置角色越界写入的归属指引（AC3）。当前对**主入口（chief）**给出：它是客户最常来的入口。
 * 其他角色/项目角色返回 undefined（既有拒绝文案逐字不变）。
 */
export function governanceWriteOwnerGuidance(
  boundarySource: string,
  relPath: string,
): string | undefined {
  const coordinatorSources = [trioGovernanceSource("chief")];
  if (!coordinatorSources.includes(boundarySource)) return undefined;
  for (const hint of GOVERNANCE_WRITE_OWNER_HINTS) {
    if (hint.prefixes.some((p) => underHintPrefix(relPath, p))) return hint.guidance;
  }
  return undefined;
}

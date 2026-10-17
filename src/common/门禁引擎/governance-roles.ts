// 门禁引擎私有：内置治理角色注册表（治理三权分立 V1）
//
// 冻结契约：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`
// §5.2（注册表与逐项钉死的条目/预授权/禁写）、§5.3（边界解析）、§5.6（能力矩阵）、§十三。
//
// 本文件是 **trio 三人**（rapporteur / nominator / convener）角色卡文本、Section 1、
// 预授权目录、禁写路径与能力的**唯一数据来源**；`su` 的旧常量从 `boundary-core.ts`
// 以 live binding 再导出（`LEGACY_SU_CARD_TEXT` 等），single 模型行为逐字不变。
//
// 关键纪律（评审 §5.2/§5.3，客户已拍板）：
//  - 三人**没有角色目录**、不进 `project.roles`、不是 `dispatch_task` 目标；
//  - 三人的 Section 1 = 本注册表条目，**不读** `角色卡/governance-boundary.yaml` 的条目；
//  - 三人均不拥有最终批准权；`.ans/**`、`角色卡/governance-boundary.yaml`、
//    `docs/bootstrap-manifest.md` 只能由应用写（`appGovernanceBoundary`），三人的
//    `forbiddenWritePaths` 显式禁写（由编排的 gate 包装在 `resolveWrite` **之前**判定，
//    评审 §5.2/§5.6——本文件只提供数据，不实现确认/审批）；
//  - `forbiddenWritePaths` 按下表展开为**具体前缀**（按段比较），不实现 glob；
//  - `docs/governance/<角色>/` 是三人各自的治理工作记录目录，互不重叠。
//
// 依赖方向：本文件只依赖 `src/model/`（类型）；`boundary-core.ts` 单向依赖本文件。

import type { Acceptance, BoundaryEntry, BoundarySection1 } from "../../model/boundary.ts";
import type { GovernanceFunction } from "../../model/role.ts";

/**
 * 治理能力矩阵（评审 §5.6，唯一数据来源）。编排/桌面按本结构注入工具与 shell 档，
 * **不得**再在调用方按角色 id 散落硬编码（评审 §二-4）。
 */
export interface GovernanceCapabilities {
  /** 三人与 su 都有客户确认通道（确认制）。 */
  customerInput: true;
  /** 仅 convener（trio）与 su（single，旧行为）。 */
  dispatchTask: boolean;
  /** 仅 convener（trio）与 su（single，旧行为）。 */
  roleStatus: boolean;
  /** 仅 convener（trio）与 su（single，旧行为）。 */
  sessionTail: boolean;
  /** 仅 convener（trio）与 su（single，旧行为）。 */
  proposeRecovery: boolean;
  /** 仅 nominator（trio）与 su（single，旧行为）。 */
  installSkill: boolean;
  /** 仅 nominator（trio）与 su（single，旧行为）。 */
  installMcp: boolean;
  /**
   * shell 面：`none`＝不接 shell；`readonly`＝只读档（(c)=allow 直执行，risky/review/deny 一律拒绝）；
   * `operator-approve`＝su 的旧审批档（客户 2026-10-17 裁定，仅 single 模型）。
   */
  shell: "none" | "readonly" | "operator-approve";
}

/** 一个 trio 内置治理角色的完整规格（评审 §5.2）。 */
export interface BuiltInGovernanceRoleSpec {
  id: "rapporteur" | "nominator" | "convener";
  displayName: string;
  function: GovernanceFunction;
  cardText: string;
  /** 该角色的 Section 1（root 恒为 project；按段比较，不实现 glob）。 */
  entries: BoundaryEntry[];
  /** 会话初始 writeSet 预置目录（预授权 ≠ 放行：仍走 F4/F6/F7 与条件激活）。 */
  preauthorizedDirs: readonly string[];
  /** 先于 `resolveWrite` 判定的禁写前缀（应用治理记录/其他治理角色资料），命中即拒。 */
  forbiddenWritePaths: readonly string[];
  capabilities: GovernanceCapabilities;
}

export type TrioGovernanceRoleId = BuiltInGovernanceRoleSpec["id"];

/** 三人统一的「应用独占写路径」：任何角色都不可写（只由 `appGovernanceBoundary` 给应用用）。 */
const APP_ONLY_WRITE_PREFIXES: readonly string[] = [
  ".ans/",
  "docs/bootstrap-manifest.md",
  "角色卡/governance-boundary.yaml",
];

/** 三个内置治理角色 + 旧 su 的目录前缀（`角色卡/<内置治理角色 id>/**` 的具体展开）。 */
const BUILT_IN_ROLE_DIR_PREFIXES: readonly string[] = [
  "角色卡/rapporteur/",
  "角色卡/nominator/",
  "角色卡/convener/",
  "角色卡/su/",
];

/** 项目根条目助手（trio 三人的条目 root 恒为 project）。 */
function projectEntry(path: string, kind: BoundaryEntry["kind"], purpose: string): BoundaryEntry {
  return { root: "project", path, kind, purpose };
}

// —————————————————————— 卡文本（评审 §5.2「卡文本最低内容」）——————————————————————

const RAPPORTEUR_CARD_TEXT = [
  "# 角色：报告员 Rapporteur（内置治理角色）",
  "",
  "职能与权力：**提案权**——理解客户意图、沟通、形成方案；把提案写入 `docs/proposals/**`，",
  "把冻结的跨角色契约写入 `docs/contracts/**`，把本角色的治理工作记录写入 `docs/governance/rapporteur/**`。",
  "",
  "**你（Rapporteur）不拥有最终批准权**：提案是否接受、流程是否验收，一律由客户决定；",
  "不得把自己的推荐写成决定，不得代替客户批准，不得把 Markdown 里的 `status` 当作客户决定。",
  "",
  "可写目录（Section 1）：`docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`。",
  "",
  "禁写路径：`.ans/**`（含 `.ans/governance/ledger.jsonl` 治理账本）、`docs/bootstrap-manifest.md`、",
  "`角色卡/governance-boundary.yaml`、`角色卡/rapporteur/**`、`角色卡/nominator/**`、`角色卡/convener/**`、",
  "`角色卡/su/**`、`docs/nominations/**`、`docs/flows/**`。",
  "`.ans/**`、`角色卡/governance-boundary.yaml` 与 `docs/bootstrap-manifest.md` **只能由应用写**；",
  "治理账本对你是只读的。",
  "",
  "确认卡约定：提案用 `request_choice`，`cardKind=proposal`，`flowId` 必填，选项 id 固定为",
  "`accept` / `accept-quick` / `revise` / `reject`；验收用 `cardKind=acceptance`，选项 id 为 `accept` / `reject`。",
  "非标准选项 id 的确认卡不会解锁任何治理门禁。",
  "",
  "纪律：不得创建第四个治理角色；不得修改其他治理角色的角色卡、边界或文档；",
  "提案最多 v2，再改须客户明确要求或开新 flow。",
].join("\n");

const NOMINATOR_CARD_TEXT = [
  "# 角色：提名官 Nominator（内置治理角色）",
  "",
  "职能与权力：**提名权**——选择角色、组建团队；把提名写入 `docs/nominations/**`，",
  "把技能/MCP 声明写入 `docs/skills/**`、`docs/mcp/**`，把本角色的治理工作记录写入 `docs/governance/nominator/**`。",
  "",
  "**你（Nominator）不拥有最终批准权**：提名不等于任命。必须先取得客户的任命决定",
  "（`request_choice`，`cardKind=appointment`，多选候选角色 id），再经写盘确认",
  "（`request_confirmation`，`cardKind=appointment-write`，逐文件列出将写路径）后，才能写",
  "`角色卡/<角色 id>/**`。提名文件里的 `status` 不会替客户作出任命。",
  "",
  "可写目录（Section 1）：`角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、",
  "`docs/governance/nominator/`。注意：`角色卡/` 内仍有禁写路径（见下）；",
  "写任何项目角色卡都必须逐路径取得客户确认。",
  "",
  "禁写路径：`.ans/**`（含治理账本）、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、",
  "`角色卡/rapporteur/**`、`角色卡/nominator/**`、`角色卡/convener/**`、`角色卡/su/**`、",
  "`docs/proposals/**`、`docs/flows/**`。",
  "`.ans/**`、`角色卡/governance-boundary.yaml` 与 `docs/bootstrap-manifest.md` **只能由应用写**；",
  "治理账本对你是只读的。",
  "",
  "确认卡约定：任命 `cardKind=appointment`（选项 id 为候选角色 id）；写盘 `cardKind=appointment-write`；",
  "普通写盘 `cardKind=write`。非标准选项 id 的确认卡不会解锁任何治理门禁。",
  "",
  "纪律：不得创建第四个治理角色；不得修改自己的边界、不得改 `角色卡/governance-boundary.yaml`；",
  "不得修改其他治理角色的资料。技能/MCP 安装只用于客户明示的角色，安装不改变任何写边界。",
].join("\n");

const CONVENER_CARD_TEXT = [
  "# 角色：召集人 Convener（内置治理角色）",
  "",
  "职能与权力：**编排权**——安排流程、推动协作；把流程单写入 `docs/flows/**`、项目工作流写入",
  "`docs/workflow.md`，把本角色的治理工作记录写入 `docs/governance/convener/**`。",
  "",
  "**你（Convener）不拥有最终批准权**：不得自行批准方案、不得把「已派发」写成「已完成」、",
  "不得把流程单里的 `status` 当作客户决定。派发只依据**客户已接受的提案**（账本中的接受决定）",
  "＋**已任命名单或快捷路径**＋流程单中的对应步骤；派发目标只能是项目角色，",
  "三个内置治理角色（含你自己）一律拒绝。治理角色之间不 dispatch；提名步骤由客户点击入口打开 Nominator。",
  "",
  "可写目录（Section 1）：`docs/flows/`、`docs/workflow.md`、`docs/governance/convener/`。",
  "",
  "禁写路径：`.ans/**`（含治理账本）、`docs/bootstrap-manifest.md`、`角色卡/**`、",
  "`docs/proposals/**`、`docs/nominations/**`、`docs/skills/**`、`docs/mcp/**`。",
  "`.ans/**`、`角色卡/governance-boundary.yaml` 与 `docs/bootstrap-manifest.md` **只能由应用写**；",
  "治理账本对你是只读的。",
  "",
  "确认卡约定：流程写盘用 `cardKind=schedule-write`；普通写盘用 `cardKind=write`。",
  "非标准选项 id 的确认卡不会解锁任何治理门禁。",
  "",
  "shell 面：**只读档**——只读白名单命令（(c) 判为 allow）可直接执行；",
  "risky/review/deny 一律拒绝，不出客户审批卡。执行类 shell 留给项目角色的三层链。",
  "",
  "纪律：不得创建第四个治理角色；不得修改其他治理角色的资料；不得自动推进流程、不得自动催办。",
].join("\n");

// —————————————————————— 注册表（顺序即 listProject 的枚举顺序）——————————————————————

/** trio 三个内置治理角色（评审 §5.2 表逐项；顺序 rapporteur → nominator → convener）。 */
export const BUILT_IN_GOVERNANCE_ROLES: readonly BuiltInGovernanceRoleSpec[] = [
  {
    id: "rapporteur",
    displayName: "报告员 Rapporteur",
    function: "proposal",
    cardText: RAPPORTEUR_CARD_TEXT,
    entries: [
      projectEntry("docs/proposals/", "directory", "提案（frontmatter: flowId/version/author/status: draft）"),
      projectEntry("docs/contracts/", "directory", "冻结的跨角色契约（版本化文件，不原地改）"),
      projectEntry("docs/governance/rapporteur/", "directory", "Rapporteur 的治理工作记录"),
    ],
    preauthorizedDirs: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      ...BUILT_IN_ROLE_DIR_PREFIXES,
      "docs/nominations/",
      "docs/flows/",
    ],
    capabilities: {
      customerInput: true,
      dispatchTask: false,
      roleStatus: false,
      sessionTail: false,
      proposeRecovery: false,
      installSkill: false,
      installMcp: false,
      shell: "none",
    },
  },
  {
    id: "nominator",
    displayName: "提名官 Nominator",
    function: "nomination",
    cardText: NOMINATOR_CARD_TEXT,
    entries: [
      projectEntry("角色卡/", "directory", "项目角色目录（role-card.md / boundary.yaml；写卡须客户任命 + 写盘确认）"),
      projectEntry("docs/nominations/", "directory", "提名文件（flowId/version/候选角色）"),
      projectEntry("docs/skills/", "directory", "技能文档与安装登记（先落盘再激活）"),
      projectEntry("docs/mcp/", "directory", "MCP 声明文档（先落盘再激活；凭据值不写文件）"),
      projectEntry("docs/governance/nominator/", "directory", "Nominator 的治理工作记录"),
    ],
    preauthorizedDirs: [
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/governance/nominator/",
    ],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      ...BUILT_IN_ROLE_DIR_PREFIXES,
      "docs/proposals/",
      "docs/flows/",
    ],
    capabilities: {
      customerInput: true,
      dispatchTask: false,
      roleStatus: false,
      sessionTail: false,
      proposeRecovery: false,
      installSkill: true,
      installMcp: true,
      shell: "none",
    },
  },
  {
    id: "convener",
    displayName: "召集人 Convener",
    function: "schedule",
    cardText: CONVENER_CARD_TEXT,
    entries: [
      projectEntry("docs/flows/", "directory", "流程单（步骤表；首步标「提名」；不自动推进）"),
      projectEntry("docs/workflow.md", "file", "项目工作流（步骤表 / 完成口令 / 变更与重验）"),
      projectEntry("docs/governance/convener/", "directory", "Convener 的治理工作记录"),
    ],
    preauthorizedDirs: ["docs/flows/", "docs/governance/convener/"],
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
      dispatchTask: true,
      roleStatus: true,
      sessionTail: true,
      proposeRecovery: true,
      installSkill: false,
      installMcp: false,
      shell: "readonly",
    },
  },
];

/**
 * 旧 su 在 single 模型下的既有四棵预授权目录——**逐字**与编排
 * `src/pipeline/orchestration/run-role.ts::SU_PREAUTHORIZED_WRITE_DIRS` 保持一致（评审 §5.2）。
 * 本常量是门禁引擎的数据面；编排接线（W2）改为读本表，避免两处各写一份。
 */
export const LEGACY_SU_PREAUTHORIZED_DIRS: readonly string[] = [
  "docs/su",
  "docs/contracts",
  "docs/skills",
  "docs/mcp",
];

/** 旧 su 的能力集（single 模型逐字保留旧行为；评审 §5.6 表末列）。 */
export const LEGACY_SU_CAPABILITIES: GovernanceCapabilities = {
  customerInput: true,
  dispatchTask: true,
  roleStatus: true,
  sessionTail: true,
  proposeRecovery: true,
  installSkill: true,
  installMcp: true,
  shell: "operator-approve",
};

// 旧 su 的 id 与卡文本的单一来源仍在 `boundary-core.ts`；此处只做 live binding 再导出
// （评审 §5.2 的注册表公开面）。**不**在本文件顶层读取被循环依赖的绑定——只导出链接。
export {
  BUILT_IN_GOVERNANCE_ROLE_ID as LEGACY_GOVERNANCE_ROLE_ID,
  BUILT_IN_ROLE_CARD_TEXT as LEGACY_SU_CARD_TEXT,
} from "./boundary-core.ts";

/** 按 id 取 trio 内置治理角色规格；`su` 与项目角色返回 undefined。 */
export function governanceRoleOf(id: string): BuiltInGovernanceRoleSpec | undefined {
  return BUILT_IN_GOVERNANCE_ROLES.find((spec) => spec.id === id);
}

/** trio 内置治理角色的职能；`su` 与项目角色返回 undefined。 */
export function governanceFunctionOf(id: string): GovernanceFunction | undefined {
  return governanceRoleOf(id)?.function;
}

/**
 * 能力矩阵查询（评审 §5.6「单点」）：trio 三人读注册表；`su` 返回
 * `LEGACY_SU_CAPABILITIES`；项目角色/未知 id 返回 undefined（调用方不得自行兜底成 su 能力）。
 */
export function governanceCapabilitiesOf(id: string): GovernanceCapabilities | undefined {
  const spec = governanceRoleOf(id);
  if (spec !== undefined) return spec.capabilities;
  if (id === "su") return LEGACY_SU_CAPABILITIES;
  return undefined;
}

/**
 * 是否为内置治理角色 id（trio 三人 + 旧 su）。
 * 用途：`dispatch_task` 目标拒绝、技能/MCP 安装与恢复提议的目标守卫（评审 §5.6/§5.2）。
 */
export function isBuiltInGovernanceRoleId(id: string): boolean {
  return id === "su" || governanceRoleOf(id) !== undefined;
}

/** 是否为 trio 的三个内置治理角色 id（不含 su）。 */
export function isTrioGovernanceRoleId(id: string): boolean {
  return governanceRoleOf(id) !== undefined;
}

/** trio 内置角色边界来源标签（评审 §5.3 逐字格式）。 */
export function trioGovernanceSource(roleId: string): string {
  return `<built-in:trio/${roleId}>`;
}

/** 应用专用治理边界的来源标签（内部诊断；不注入任何角色会话）。 */
export const APP_GOVERNANCE_SOURCE = "<built-in:app-governance>";

/**
 * 应用专用治理边界条目（评审 §5.3）：固定三项——
 * `角色卡/governance-boundary.yaml`（file）、`.ans/`（directory）、`docs/bootstrap-manifest.md`（file）。
 * 只在编排的 `finalizeBootstrap` / `repinIfBootstrapped` / 迁移流程中使用；**不注入任何角色会话**。
 */
export function appGovernanceEntries(): BoundaryEntry[] {
  return [
    projectEntry("角色卡/governance-boundary.yaml", "file", "应用写出的项目治理边界文档（pin 锚点）"),
    projectEntry(".ans/", "directory", "应用独占治理记录区（.ans/project.json、.ans/governance/ledger.jsonl）"),
    projectEntry("docs/bootstrap-manifest.md", "file", "应用写出的 bootstrap/迁移留痕清单"),
  ];
}

/**
 * 应用专用治理边界（`acceptance` 由调用方提供，通常是当前会话边界的接受证据）。
 * 三人与 su 的边界均不含这些路径的写权；本边界**只给应用**，不参与角色写权判定。
 */
export function appGovernanceBoundary(acceptance: Acceptance): BoundarySection1 {
  return {
    entries: appGovernanceEntries(),
    boundarySource: APP_GOVERNANCE_SOURCE,
    acceptance,
  };
}

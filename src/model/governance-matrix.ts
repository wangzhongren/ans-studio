// Model 层：治理权力矩阵（governance-authority-matrix）共享类型。
// 冻结契约：方案 P1.1 §5.1–§5.2（客户闸门 1 确认）；团队计划 C1a（门禁引擎唯一主属）。
//
// 本文件只提供**类型与常量**：矩阵数据结构、来源/unknown 枚举、字段契约、工具结果与
// `GovernanceMatrixFn`。无 I/O、无判定、无副作用；不依赖任何运行层（Service/Pipeline/Provider/
// Interface），也不导入角色私有 common（`WorkerRoleInput.cardSections` 为结构等价的内联形状，
// 共享解析类型 `RoleCardSections` 恒在 `src/common/门禁引擎/role-card-sections.ts`，经
// `src/service/role/resolve-role.ts` 公开出口消费）。

export const GOVERNANCE_MATRIX_SCHEMA = "governance-matrix/v1";

/** 展示字段的来源。known 必须带非空 source；unknown 必须带 reason。 */
export type MatrixSource =
  | "builtin-registry" // src/common/门禁引擎/governance-roles.ts 注册表（内置角色）
  | "model"            // src/model 的共享常量（VCA 发起者、refactor 发起者等）
  | "boundary-yaml"    // 角色卡/<role>/boundary.yaml（worker 声明）
  | "role-card"        // 角色卡/<role>/role-card.md（经共享解析）
  | "app-rule"         // 应用运行时装配规则（能力注入、门禁、卡种、shell 装配）
  | "session";         // 本会话宿主注入状态（客户通道/download/shell/escalation）

/**
 * unknown 原因枚举（P1.1 §5.1 契约基线）。
 * `registry-unavailable` 为契约兼容成员：Model 保留、**生产路径不使用**——注册表不可用由
 * `GovernanceMatrix.status === "unavailable"` + `MatrixWarning{code:"registry-unavailable"}`
 * 字符串表达（G-5b：删除该成员属契约删除，会触发重开闸门 1）。
 */
export type MatrixUnknownReason =
  | "role-card-missing"
  | "boundary-missing"
  | "boundary-parse-error"
  | "card-section-missing"
  | "not-declared-in-source"
  | "acceptance-unavailable"
  | "role-enumeration-failed"
  | "registry-unavailable";

/** 单值展示字段：known 带来源；unknown 带原因。 */
export type MatrixField<T> =
  | { readonly state: "known"; readonly value: T; readonly source: MatrixSource }
  | { readonly state: "unknown"; readonly reason: MatrixUnknownReason; readonly detail?: string; readonly source: MatrixSource };

/** 复合字段：内部各分量各自带来源；整体 known/unknown 只表示能否组装出完整展示。 */
export type MatrixComposite<T> =
  | { readonly state: "known"; readonly value: T }
  | { readonly state: "unknown"; readonly reason: MatrixUnknownReason; readonly detail?: string };

/** 边界条目展示视图（root 恒为 project；worker 条目只来自 boundary.yaml 声明）。 */
export interface MatrixEntryView {
  path: string;
  kind: "file" | "directory" | "conditional-directory";
  purpose: string;
}

/** 边界接受状态：只来自运行时解析 `resolveBoundary(...).acceptance`；listing 的 acceptance 是占位。 */
export interface MatrixAcceptanceKnown {
  state: "known";
  accepted: boolean;
  /** `resolveBoundary(...).acceptance.source` 原文（证据说明），不是 MatrixSource。 */
  evidence: string;
  basis: "runtime";
}
export interface MatrixAcceptanceUnknown {
  state: "unknown";
  reason: "acceptance-unavailable";
  detail?: string;
}
export type MatrixAcceptance = MatrixAcceptanceKnown | MatrixAcceptanceUnknown;

export interface MatrixWritableScope {
  entries: { items: readonly MatrixEntryView[]; source: "builtin-registry" | "boundary-yaml" };
  preauthorized: { items: readonly string[]; source: "builtin-registry" | "app-rule"; note: string };
  acceptance: MatrixAcceptance;
}

/** 强制力分层：结构硬拒 / 许可条件 / 约定（宿主注入另见 customerInteraction/shellSession）。 */
export interface MatrixForce {
  /** 结构硬拒：内置 = 注册表 forbiddenWritePaths；worker = 无逐角色清单（仅边界外默认拒绝）。 */
  hardDeny: { items: readonly string[]; source: "builtin-registry" | "app-rule"; note: string };
  /** 许可条件：stable 写入许可、版本化文档冻结（满足条件才可写，不是角色权力）。 */
  permitConditions: { items: readonly string[]; source: "app-rule"; note: string };
  /** 约定：角色卡纪律/项目约定（不是硬门禁）。来源缺失时用 unknownReason 标注。 */
  conventions: {
    items: readonly string[];
    source: "builtin-registry" | "role-card";
    note: string;
    /** 来源章节缺失时由组装器标注；渲染必须显示 unknown（原因），不得写成「无约定」。 */
    unknownReason?: MatrixUnknownReason;
  };
}

/** 通道/客户交互字段的来源分量（G-2）：每个展示分量显式带来源，不共享一个笼统 source。 */
export type MatrixChannelSource = "registry-capability" | "app-rule" | "session-snapshot";

export interface MatrixRequestChannel {
  /** 角色级通道能力：内置六角色读注册表 capabilities.customerInput（registry-capability）；
   *  项目角色不在注册表，其「无客户通道」来自应用规则（app-rule），不得冒充注册表来源（G-2b）。 */
  roleLevel: { value: boolean; source: "registry-capability" | "app-rule" };
  /** 可发起卡种：Pipeline 从 TRIO_CARD_KINDS/GOVERNANCE_CONFIRM_CARD_KINDS 快照拆分后填入。 */
  cardKinds: { items: readonly string[]; source: "app-rule" };
  /** 本会话宿主注入状态：Pipeline 按当前会话标志填入。 */
  session: { state: "available" | "unavailable" | "unknown"; source: "session-snapshot"; note: string };
}

/** 特殊发起通道：requirement-change/version-decision/version-change/refactor/stable-write/download/escalation。 */
export interface MatrixOtherInitiation {
  requirementChange: MatrixField<boolean>;
  versionDecision: MatrixField<boolean>;
  /** "detail-amendment" | "version-upgrade" | null（Model 常量反查；无则 null）。 */
  versionChange: MatrixField<string | null>;
  refactor: MatrixField<boolean>;
  stableWrite: MatrixField<boolean>;
  download: { roleLevel: false; session: "available" | "unavailable" | "unknown"; source: "session"; note: string };
  shellEscalation: { roleLevel: false; session: "available" | "unavailable" | "unknown"; source: "session"; note: string };
}

export interface MatrixCustomerInteraction {
  requestChoice: MatrixRequestChannel;
  requestConfirmation: MatrixRequestChannel;
  otherInitiation: MatrixOtherInitiation;
  /** 固定说明：确认方永远是客户/判断 agent；角色不能自批/代选；矩阵不是批准。 */
  confirmationNote: string;
}

export interface GovernanceMatrixRole {
  roleId: string;
  kind: "built-in-governance" | "project";
  displayName: MatrixField<string>;
  /** 仅内置角色。 */
  governanceFunction?: MatrixField<string>;
  /** 仅 worker（组别/组内职责，来自共享组别解析）。 */
  group?: MatrixField<string>;
  duty: MatrixField<string>;
  writable: MatrixComposite<MatrixWritableScope>;
  force: MatrixComposite<MatrixForce>;
  dispatchTask: MatrixField<boolean>;
  customerInteraction: MatrixComposite<MatrixCustomerInteraction>;
  shellTier: MatrixField<"operator-approve" | "readonly" | "none" | "project-three-layer">;
  /** 本会话 shell 是否 arm（宿主注入）；与角色级 shellTier 分开。 */
  shellSession: { state: "available" | "unavailable" | "unknown"; source: "session"; note: string };
  mainChain: MatrixField<readonly string[]>;
  otherCapabilities: MatrixField<Readonly<Record<string, boolean>>>;
  sourceNotes: ReadonlyArray<{ text: string; source: MatrixSource }>;
}

export interface MatrixRoutingRule {
  work: string;
  /** 真实角色 id | "customer" | "application"（应用通道）；不虚构角色。 */
  target: string;
  basis: "card-kind" | "capability" | "model" | "app-rule";
  source: MatrixSource;
  note?: string;
}

export interface MatrixWarning {
  code: string;
  roleId?: string;
  relDir?: string;
  message: string;
}

/** 渲染层唯一截断语义。三个总上限的数值由 C1b `public.ts` 常量提供（G-3）；Model 只声明字段。 */
export interface MatrixRenderInfo {
  promptMaxChars: number;
  toolMaxChars: number;
  perRoleMaxChars: number;
  truncated: boolean;
  omittedRoles: number;
  omittedChars: number;
  truncatedFields: string[];
}

export interface GovernanceMatrix {
  schema: typeof GOVERNANCE_MATRIX_SCHEMA;
  generatedAt: string;
  projectRoot: string;
  governanceModel: "trio";
  status: "complete" | "degraded" | "unavailable";
  roles: GovernanceMatrixRole[];
  routing: MatrixRoutingRule[];
  warnings: MatrixWarning[];
  render: MatrixRenderInfo;
}

/**
 * 只读矩阵能力（C2 登记，C3 注入）。单一来源：`src/model/runtime.ts` 只 `import type`，不得重定义。
 * 返回只有 `ok/message`；不含 `allowed`/`denied`/批准/验收/授权字段。
 */
export type GovernanceMatrixFn = (input?: {
  roleId?: string;
  section?: "all" | "roles" | "routing";
}) => Promise<{ ok: boolean; message: string }>;

/**
 * Pipeline 结构化跳过原因（与 `src/service/role/resolve-role.ts` 的 `ProjectRoleIssue` 结构兼容，
 * 由 Pipeline 映射；Model 不导入 Service 类型）。不携带 cardText 或部分能力字段。
 */
export interface MatrixIssueInput {
  relDir: string;
  roleId?: string;
  code: string;
  message: string;
}

/** 角色目录事实；`error` 是项目根不可读/枚举失败的**唯一**结构化载体（G-4）。 */
export interface MatrixRoleDirectories {
  found: boolean;
  totalDirs: number;
  archivedSkips: number;
  /** 枚举失败原因（Pipeline 填）；非空 ⇒ worker 段 unavailable，不得误报「尚未 bootstrap」。 */
  error?: string;
}

/** worker 角色输入（Pipeline 从 `listProject().roles.filter(!builtIn)` 映射）。 */
export interface WorkerRoleInput {
  roleId: string;
  /** 由 Pipeline 从 `ProjectRoleSummary.cardSections.title`（共享解析 H1）映射填充（G-1）；
   *  `cardSections` 本身不重复携带 title。 */
  displayName?: string;
  group?: string;
  /** 结构等价于 `RoleCardSections`（不含 title）；矩阵不接收/不解析原始 cardText。 */
  cardSections?: {
    ability?: string;
    responsibility?: string;
    handoff?: string;
    workflow?: string;
    executionPrinciples?: string;
  };
  boundary: { entries: readonly MatrixEntryView[]; boundarySource: string };
  cardPath: string;
  boundaryPath: string;
}

/** Pipeline 取数结果 → 纯 Service（Service 不读盘、不调用其他 Service）。 */
export interface GovernanceMatrixInput {
  projectRoot: string;
  governanceModel: "trio";
  workerRoles: readonly WorkerRoleInput[];
  issues: readonly MatrixIssueInput[];
  warnings: readonly string[];
  roleDirectories: MatrixRoleDirectories;
  acceptanceByRole: Readonly<Record<string, MatrixAcceptance>>;
  cardKindsByRole: Readonly<Record<string, { choice: readonly string[]; confirm: readonly string[] }>>;
  initiationByRole: Readonly<Record<string, { requirementChange: boolean; versionDecision: boolean; stableWrite: boolean }>>;
  session: { customerInput: boolean; download: boolean; shell: boolean; shellEscalation: boolean };
  generatedAt: string;
}

export type BuildGovernanceMatrixFn = (input: GovernanceMatrixInput) => GovernanceMatrix;

export interface RenderGovernanceMatrixOptions {
  maxChars: number;
  perRoleMaxChars?: number;
  roleId?: string;
  section?: "all" | "roles" | "routing";
}

export type RenderGovernanceMatrixFn = (matrix: GovernanceMatrix, options: RenderGovernanceMatrixOptions) => string;

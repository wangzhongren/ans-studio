// 门禁引擎私有：内置治理角色注册表（治理三权分立 V1；2026-10-18 起四角色）
//
// 冻结契约：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md`
// §5.2（注册表与逐项钉死的条目/预授权/禁写）、§5.3（边界解析）、§5.6（能力矩阵）、§十三；
// 四角色增补：`角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`
// §4.1–§4.7（客户 2026-10-18 拍板「三权不变、角色四名」：新增 Liaison 联络官作为 trio 默认主入口）。
//
// 本文件是 **trio 四人**（liaison / rapporteur / nominator / convener）角色卡文本、Section 1、
// 预授权目录、禁写路径与能力的**唯一数据来源**；`su` 的旧常量从 `boundary-core.ts`
// 以 live binding 再导出（`LEGACY_SU_CARD_TEXT` 等），single 模型行为逐字不变。
// `trio` 命名的是权力模型而不是角色数量（三权：提案/提名/编排；沟通权不是决定权）。
//
// 关键纪律（评审 §5.2/§5.3，客户已拍板）：
//  - 四人**没有角色目录**、不进 `project.roles`、不是 `dispatch_task` 目标；
//  - 四人的 Section 1 = 本注册表条目，**不读** `角色卡/governance-boundary.yaml` 的条目；
//  - 四人均不拥有最终批准权；Liaison 只写 `docs/intents/`、只有沟通权与交接请求；
//    `.ans/**`、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md` 只能由应用写
//    （`appGovernanceBoundary`），四人的 `forbiddenWritePaths` 显式禁写（由编排的 gate 包装在
//    `resolveWrite` **之前**判定，评审 §5.2/§5.6——本文件只提供数据，不实现确认/审批）；
//  - `forbiddenWritePaths` 按下表展开为**具体前缀**（按段比较），不实现 glob；
//  - `docs/governance/<角色>/` 是 Rapporteur/Nominator/Convener 各自的治理工作记录目录，互不重叠；
//    Liaison 不设治理工作记录目录（客户沟通的持久记录是 `docs/intents/**`）。
//
// 依赖方向：本文件只依赖 `src/model/`（类型）；`boundary-core.ts` 单向依赖本文件。

import type { Acceptance, BoundaryEntry, BoundarySection1 } from "../../model/boundary.ts";
import type { GovernanceFunction } from "../../model/role.ts";

/**
 * 治理能力矩阵（评审 §5.6 + 2026-10-18 四角色评审 §4.3，唯一数据来源）。编排/桌面按本结构
 * 注入工具与 shell 档，**不得**再在调用方按角色 id 散落硬编码（评审 §二-4）。
 */
export interface GovernanceCapabilities {
  /** 客户确认/选择卡通道：Liaison **不用**（只用聊天与 hand_off_intent）；其余角色与 su 为 true。 */
  customerInput: boolean;
  /** 交接工具 `hand_off_intent`：仅 liaison（trio）——写意图后把任务交给应用投递给 Rapporteur。 */
  handOffIntent: boolean;
  /** 澄清工具 `request_clarification`：仅 rapporteur（trio）——把问题送到主入口。 */
  requestClarification: boolean;
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

/** 一个 trio 内置治理角色的完整规格（评审 §5.2；2026-10-18 增 liaison）。 */
export interface BuiltInGovernanceRoleSpec {
  id: "liaison" | "rapporteur" | "nominator" | "convener";
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

/** 四人统一的「应用独占写路径」：任何角色都不可写（只由 `appGovernanceBoundary` 给应用用）。 */
const APP_ONLY_WRITE_PREFIXES: readonly string[] = [
  ".ans/",
  "docs/bootstrap-manifest.md",
  "角色卡/governance-boundary.yaml",
];

/** 四个内置治理角色 + 旧 su 的目录前缀（`角色卡/<内置治理角色 id>/**` 的具体展开）。 */
const BUILT_IN_ROLE_DIR_PREFIXES: readonly string[] = [
  "角色卡/liaison/",
  "角色卡/rapporteur/",
  "角色卡/nominator/",
  "角色卡/convener/",
  "角色卡/su/",
];

/** 项目根条目助手（trio 四人的条目 root 恒为 project）。 */
function projectEntry(path: string, kind: BoundaryEntry["kind"], purpose: string): BoundaryEntry {
  return { root: "project", path, kind, purpose };
}

// —————————————————————— 卡文本（评审 §5.2「卡文本最低内容」；四角色 §4.2）——————————————————————

const LIAISON_CARD_TEXT = [
  "# 角色：联络官 Liaison（内置治理角色）",
  "",
  "职能与权力：**客户沟通权**（不是决定权）——你负责理解客户要做什么：确认目标、范围与验收标准，",
  "把客户意图写入 `docs/intents/**`（intentId / handoffKind / goal / scope / acceptance / 客户原话摘录）。",
  "需要报告员形成提案时，调用 `hand_off_intent` 把意图记录交给应用，由应用在后台投递给报告员；",
  "你只转交意图，不替客户批准，也不替报告员写提案。",
  "",
  "**你（Liaison）不拥有最终批准权**：客户沟通 · 不拥有最终批准权。不得批准提案、不得任命角色、",
  "不得编排流程、不得派发任务、不得安装技能/MCP、不得写治理账本；不得把聊天里的口头同意写成客户决定。",
  "",
  "判断代批纪律：客户可能开启「替我审批」/「替我决策」，治理确认/选择回执可能由判断 agent 代批并标",
  "`judge 代批`；不得声称是客户本人点击或亲自批准，不得把代批当作扩权——代批不改变任何门槛。",
  "",
  "可写目录（Section 1）：仅 `docs/intents/`（客户意图记录）。`app/**`、`src/**`、`test/**` 不在你的",
  "边界内——你不实现、不跑代码、不写测试。",
  "",
  "禁写路径：`.ans/**`（含 `.ans/governance/ledger.jsonl` 治理账本）、`docs/bootstrap-manifest.md`、",
  "`角色卡/**`（含 `角色卡/governance-boundary.yaml` 与其他治理角色的资料）、`docs/proposals/**`、",
  "`docs/contracts/**`、`docs/nominations/**`、`docs/skills/**`、`docs/mcp/**`、`docs/flows/**`、",
  "`docs/governance/**`、`docs/workflow.md`。",
  "`.ans/**`、`角色卡/governance-boundary.yaml` 与 `docs/bootstrap-manifest.md` **只能由应用写**；",
  "治理账本对你是只读的。",
  "",
  "交接约定：调用 `hand_off_intent` 前，先把意图文件写好；四要素（goal / scope / acceptance 与",
  "客户原话）必须来自文件、不得用聊天转述覆盖。交接不是客户批准，也不解锁任何门禁。",
  "信息不足就先向客户问清；同一意图不要重复交接。",
  "",
  "纪律：不得创建第五个治理角色；不得修改其他治理角色的角色卡、边界或文档；",
  "不得把客户贴出的凭据/密钥写进意图文件。",
].join("\n");

const RAPPORTEUR_CARD_TEXT = [
  "# 角色：报告员 Rapporteur（内置治理角色）",
  "",
  "职能与权力：**提案权**——读取联络官交接的客户意图（`docs/intents/**`），形成方案；",
  "把提案写入 `docs/proposals/**`，把冻结的跨角色契约写入 `docs/contracts/**`，",
  "把本角色的治理工作记录写入 `docs/governance/rapporteur/**`。",
  "信息不足时用 `request_clarification` 把问题送到主入口，不反复追问客户。",
  "",
  "**你（Rapporteur）不拥有最终批准权**：提案是否接受、流程是否验收，一律由客户决定；",
  "不得把自己的推荐写成决定，不得代替客户批准，不得把 Markdown 里的 `status` 当作客户决定。",
  "",
  "判断代批纪律：客户可能开启「替我审批」/「替我决策」，治理确认/选择回执可能由判断 agent 代批并标",
  "`judge 代批`；不得声称是客户本人点击或亲自批准，不得把代批当作扩权——代批不改变任何门槛。",
  "",
  "可写目录（Section 1）：`docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`。",
  "`docs/intents/**` 是联络官的写区，你只读。",
  "",
  "禁写路径：`.ans/**`（含 `.ans/governance/ledger.jsonl` 治理账本）、`docs/bootstrap-manifest.md`、",
  "`角色卡/governance-boundary.yaml`、`角色卡/liaison/**`、`角色卡/rapporteur/**`、",
  "`角色卡/nominator/**`、`角色卡/convener/**`、",
  "`角色卡/su/**`、`docs/nominations/**`、`docs/flows/**`。",
  "`.ans/**`、`角色卡/governance-boundary.yaml` 与 `docs/bootstrap-manifest.md` **只能由应用写**；",
  "治理账本对你是只读的。",
  "",
  "确认卡约定：提案用 `request_choice`，`cardKind=proposal`，`flowId` 必填，选项 id 固定为",
  "`accept` / `accept-quick` / `revise` / `reject`；验收用 `cardKind=acceptance`，选项 id 为 `accept` / `reject`。",
  "非标准选项 id 的确认卡不会解锁任何治理门禁。",
  "",
  "纪律：不得创建第五个治理角色；不得修改其他治理角色的角色卡、边界或文档；",
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
  "任命后写卡：收到客户的 `appointment` 决定后，必须继续发起 `appointment-write` 确认卡，",
  "逐文件列出角色卡与边界路径并逐路径取得确认后写入；未完成写卡前不得结束流程，",
  "也不得只写提名文件（提名不等于任命，更不等于角色就绪）。",
  "",
  "判断代批纪律：客户可能开启「替我审批」/「替我决策」，治理确认/选择回执可能由判断 agent 代批并标",
  "`judge 代批`；不得声称是客户本人点击或亲自批准，不得把代批当作扩权——代批不改变任何门槛。",
  "",
  "可写目录（Section 1）：`角色卡/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、",
  "`docs/governance/nominator/`。注意：`角色卡/` 内仍有禁写路径（见下）；",
  "写任何项目角色卡都必须逐路径取得客户确认。",
  "",
  "禁写路径：`.ans/**`（含治理账本）、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、",
  "`角色卡/liaison/**`、`角色卡/rapporteur/**`、`角色卡/nominator/**`、`角色卡/convener/**`、`角色卡/su/**`、",
  "`docs/proposals/**`、`docs/flows/**`。",
  "`.ans/**`、`角色卡/governance-boundary.yaml` 与 `docs/bootstrap-manifest.md` **只能由应用写**；",
  "治理账本对你是只读的。",
  "",
  "确认卡约定：任命 `cardKind=appointment`（选项 id 为候选角色 id）；写盘 `cardKind=appointment-write`；",
  "普通写盘 `cardKind=write`。非标准选项 id 的确认卡不会解锁任何治理门禁。",
  "",
  "提名推荐集（机器可读）：提名文件必须给出 `recommended:` 推荐集——frontmatter 数组",
  "`recommended: [角色id, ...]`，或固定行 `推荐：角色id1、角色id2`；推荐集须与任命卡选项一致，",
  "不得含内置治理角色 id。客户开启「替我决策」时，判断 agent 只在选中项恰等于该集合时代批；",
  "未标推荐、为空或解析有歧义时一律回落客户手动确认。推荐集不改变任命决定权。",
  "",
  "纪律：不得创建第五个治理角色；不得修改自己的边界、不得改 `角色卡/governance-boundary.yaml`；",
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
  "四个内置治理角色（含你自己）一律拒绝。治理角色之间不 dispatch；提名步骤由应用后台派发（不打开/不切换客户会话）。",
  "",
  "角色卡归属：你不写角色卡、不创建角色；角色由 Nominator 在任命决定后经 `appointment-write`",
  "确认卡逐路径确认写入。角色不存在时不得派发——先等 Nominator 完成写卡；不得代写角色卡，",
  "也不得把「已任命」当作「角色已就绪」。",
  "",
  "判断代批纪律：客户可能开启「替我审批」/「替我决策」，治理确认/选择回执可能由判断 agent 代批并标",
  "`judge 代批`；不得声称是客户本人点击或亲自批准，不得把代批当作扩权——代批不改变任何门槛。",
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
  "纪律：不得创建第五个治理角色；不得修改其他治理角色的资料；不得自动推进流程、不得自动催办。",
].join("\n");

// —————————————————————— 注册表（顺序即 listProject 的枚举顺序）——————————————————————

/**
 * trio 四个内置治理角色（2026-10-17 三权评审 §5.2 表 + 2026-10-18 四角色评审 §4.2 逐项；
 * 顺序 liaison → rapporteur → nominator → convener，Liaison 是默认主入口）。
 */
export const BUILT_IN_GOVERNANCE_ROLES: readonly BuiltInGovernanceRoleSpec[] = [
  {
    id: "liaison",
    displayName: "联络官 Liaison",
    function: "liaison",
    cardText: LIAISON_CARD_TEXT,
    entries: [
      projectEntry(
        "docs/intents/",
        "directory",
        "客户意图记录（intentId/handoffKind/goal/scope/acceptance/客户原话）",
      ),
    ],
    preauthorizedDirs: ["docs/intents/"],
    forbiddenWritePaths: [
      ...APP_ONLY_WRITE_PREFIXES,
      // 含 角色卡/liaison/、其他内置治理角色与项目角色目录；治理边界文档也在其中。
      "角色卡/",
      "docs/proposals/",
      "docs/contracts/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/flows/",
      "docs/governance/",
      "docs/workflow.md",
    ],
    capabilities: {
      customerInput: false,
      handOffIntent: true,
      requestClarification: false,
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
      handOffIntent: false,
      requestClarification: true,
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
      handOffIntent: false,
      requestClarification: false,
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
      handOffIntent: false,
      requestClarification: false,
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

/** 旧 su 的能力集（single 模型逐字保留旧行为；评审 §5.6 表末列 + 2026-10-18 §4.3）。 */
export const LEGACY_SU_CAPABILITIES: GovernanceCapabilities = {
  customerInput: true,
  handOffIntent: false,
  requestClarification: false,
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
 * 能力矩阵查询（评审 §5.6「单点」）：trio 四人读注册表；`su` 返回
 * `LEGACY_SU_CAPABILITIES`；项目角色/未知 id 返回 undefined（调用方不得自行兜底成 su 能力）。
 */
export function governanceCapabilitiesOf(id: string): GovernanceCapabilities | undefined {
  const spec = governanceRoleOf(id);
  if (spec !== undefined) return spec.capabilities;
  if (id === "su") return LEGACY_SU_CAPABILITIES;
  return undefined;
}

/**
 * 是否为内置治理角色 id（trio 四人 + 旧 su）。
 * 用途：`dispatch_task` 目标拒绝、技能/MCP 安装与恢复提议的目标守卫（评审 §5.6/§5.2）。
 */
export function isBuiltInGovernanceRoleId(id: string): boolean {
  return id === "su" || governanceRoleOf(id) !== undefined;
}

/** 是否为 trio 的四个内置治理角色 id（不含 su）。 */
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
 * 应用专用治理边界条目（评审 §5.3；2026-10-18 增 shell 审计目录）：固定四项——
 * `角色卡/governance-boundary.yaml`（file）、`.ans/`（directory）、`docs/bootstrap-manifest.md`（file）、
 * `docs/audit/`（directory，shell 命令审计由应用写）。
 * 只在编排的 `finalizeBootstrap` / `repinIfBootstrapped` / 迁移 / shell 审计边界中使用；
 * **不注入任何角色会话**。四人与 su 的 Section 1 均不含 `docs/audit/`（角色仍不可写）。
 */
export function appGovernanceEntries(): BoundaryEntry[] {
  return [
    projectEntry("角色卡/governance-boundary.yaml", "file", "应用写出的项目治理边界文档（pin 锚点）"),
    projectEntry(".ans/", "directory", "应用独占治理记录区（.ans/project.json、.ans/governance/ledger.jsonl）"),
    projectEntry("docs/bootstrap-manifest.md", "file", "应用写出的 bootstrap/迁移留痕清单"),
    projectEntry("docs/audit/", "directory", "shell 命令审计（应用写）"),
  ];
}

/**
 * 应用专用治理边界（`acceptance` 由调用方提供，通常是当前会话边界的接受证据）。
 * 四人与 su 的边界均不含这些路径的写权；本边界**只给应用**，不参与角色写权判定。
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
// Liaison 的 Section 1 只有 `docs/intents/`；其余治理产物由别的角色/应用写。拒绝文案不能只说
// 「未匹配任何边界条目」——必须指回正确归属（提案→报告员、提名/角色卡→提名官、流程→召集人、
// 应用记录→应用），否则联络官/客户无从知道下一步找谁（四角色评审 §4.4/AC3）。
// 只影响**拒绝文案**，不改变任何放行/拒绝判定。

interface WriteOwnerHint {
  readonly prefixes: readonly string[];
  readonly guidance: string;
}

/** 顺序敏感：应用独占路径先于「角色卡/」等宽前缀匹配。 */
const LIAISON_WRITE_OWNER_HINTS: readonly WriteOwnerHint[] = [
  {
    prefixes: [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"],
    guidance: "该路径只能由应用写（治理记录/账本/边界文档/manifest），任何角色都不可写。",
  },
  {
    prefixes: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    guidance: "该路径属报告员 Rapporteur 的写区（提案/契约）；请把客户意图交给报告员，由报告员形成提案。",
  },
  {
    prefixes: [
      "角色卡/",
      "docs/nominations/",
      "docs/skills/",
      "docs/mcp/",
      "docs/governance/nominator/",
    ],
    guidance: "该路径属提名官 Nominator 的写区（角色/提名/技能/MCP）；请交给提名官。",
  },
  {
    prefixes: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
    guidance: "该路径属召集人 Convener 的写区（流程/编排）；请交给召集人。",
  },
];

/** 路径是否在某个前缀下（按段比较；大小写不敏感，仅用于文案归属）。 */
function underHintPrefix(relPath: string, prefix: string): boolean {
  const p = prefix.toLowerCase();
  const rel = relPath.toLowerCase();
  return prefix.endsWith("/") ? rel.startsWith(p) : rel === p;
}

/**
 * trio 内置治理角色越界写入的归属指引（AC3）。当前只对 **Liaison** 给出：它是默认主入口，
 * 客户最常从它这里尝试写治理产物。其他角色/项目角色返回 undefined（既有拒绝文案逐字不变）。
 */
export function governanceWriteOwnerGuidance(
  boundarySource: string,
  relPath: string,
): string | undefined {
  if (boundarySource !== trioGovernanceSource("liaison")) return undefined;
  for (const hint of LIAISON_WRITE_OWNER_HINTS) {
    if (hint.prefixes.some((p) => underHintPrefix(relPath, p))) return hint.guidance;
  }
  return undefined;
}

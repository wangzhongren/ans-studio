// 门禁引擎私有：内置治理角色注册表（D 批最小系统，2026-10-28）。
//
// 六个内置治理角色：幕僚 chief、产品 product、策划 rapporteur、人事 nominator、运营 convener、质检 verifier；
// `primaryRoleId = chief`。旧 `liaison` 已退休（不再有别名/职能/卡文本；历史目录按保留 id 跳过）。
// 本文件只提供**数据**：卡片文本、Section 1 条目、写区预授权/禁写、能力位与 shell 审批档；
// 不实现 gate/flow/ledger/验收分诊等机器（D 批已全部撤除）。
//
// 依赖方向：本文件只依赖 `src/model/`（类型）与 `src/common/shared/`（无状态契约文本）；`boundary-core.ts` 单向依赖本文件。

import type { Acceptance, BoundaryEntry, BoundarySection1 } from "../../model/boundary.ts";
import type { GovernanceFunction } from "../../model/role.ts";
import { intentEntryContractText } from "../shared/intent-entry-contract.ts";

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

/**
 * 内置治理角色的**只读展示摘要**（治理权力矩阵 C1a；OQ-3 客户 2026-11-05 已接受）。
 * 仅展示、不参与任何判定：不得被门禁/派发/客户卡校验/冻结/trunk/VCA/stable-write 代码导入或读取；
 * 与 `cardText` 同文件维护、同源评审；与卡文本冲突时以卡文本/注册表为准并修正摘要。
 */
export interface BuiltInGovernanceMatrixSummary {
  /** 职能定位短句（六角色必须非空）。 */
  duty: string;
  /** 主链/闸门职责短句（六角色必须非空）。 */
  mainChain: readonly string[];
  /** 卡面纪律短摘录（可选；矩阵渲染为 force.conventions）。 */
  cardDiscipline?: readonly string[];
  /** 派发范围短摘录（可选；仅文案）。 */
  dispatchScope?: string;
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
  /** 只读展示摘要（治理权力矩阵；**不参与判定**）。 */
  matrix: BuiltInGovernanceMatrixSummary;
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
  "shell 审批档——只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent 审批；审批不改变你的职责与写边界：Section 1 边界内的写入是预授权，直接用 `write_file` / `edit_file`（不逐次 `request_confirmation`），边界外与治理敏感写入仍按本卡与既有规则拒绝或需确认。拒绝、超时、通道不可用一律不放行。判拒后可申请客户确认（每会话一次）。";

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

// 新直接能力的注册由运行时/装配属主完成，提示不冒充注入证据。
const DIRECT_CAPABILITY_AVAILABILITY = "- 直接能力以本会话实际注入的工具为准：未提供、unavailable 或无真实回执时，报告「实现中/待注入」或阻塞；不得虚构工具、身份、批准、激活或完成，不得改发已取消的版本升级/VCA 批拒、修正案逐项/最终、appointment-write、团队计划确认卡。产品内直接能力不改 ANS 技能及其治理闸门。";
const DIRECT_ACTION_EVIDENCE = "- 身份由应用从会话取得；真实客户决定、role-direct、chief-delegated 分别留痕，不得自报他人身份或伪造 customer approve/confirmed/decisionId。提交绑定 operationId、当前 base/目标摘要及适用 run；校验失败整单拒绝、no-op 不升版、提交后失败报已提交待恢复，不把准备/通知当生效。旧 run 使用同一 pin 的冻结名单/计划/角色卡/边界/授权，缺物证即阻塞，不从 live 补读增权。";
const CREATED_TASK_CLOSURE = "- 原创建者收口：仅当应用核实可信身份等于 task.created.from，且当前 run/依据/报告和合法状态一致，才通过已注入的窄收口能力关闭自己创建的任务；submit_report 只是报告，不是 closed；未合法收口不得释放依赖，不手写 closed、不固定冒充 chief、不收口他人任务。";
const STRUCTURED_GIT_DISCIPLINE = "- Git只走实际注入的结构化 `git_query` / `git_candidate` / `git_publish`：查询限宿主已核可读repo/ref/版本路径与有界模板，修改限本人当前可信scope及本任务应用分配的候选ref/现场；author、候选boundary、分支名不授新权。候选 prepared 不等发布、激活、交付或验收；发布只认应用完整差异/当前授权/expected-old核验后的真实回执。不得用裸Git、shell/脚本、直接写.git/common-dir/他人worktree或伪造OID/记录绕过；工具未注入如实待注入，来源、隔离、停稳或提交结果unknown保持blocked并交责任链核实。";
const ROLE_RECOVERY_DISCIPLINE = "- 回退与报告：保留task/run、原基线/候选完整OID、拒绝code/missing/owner和真实错误证据，报告回 task.created.from；责任owner是修复线索，不授权你互派或代改。对应owner在原合法范围真实修复后，重新核当前依据/权限/指定最终OID再恢复；缺证据不补造批准/ref/停稳，不重开已取消卡。无新信息不重试，原来源链预算不清零；危险或未知外部副作用零自动重派，取消执行须确认实际停止，不释放成功依赖。";
const CHIEF_HUB_DISCIPLINE = "- Chief枢纽：新 Product、Rapporteur、Nominator、Convener、Verifier 任务全部由 Chief 创建、接收正式报告并按真实创建者收口；Convener 仅创建和管理项目实现 worker，worker 先回 Convener，不能解决再报 Chief。历史任务仍按真实 task.created.from 报告/收口，不重写旧 creator、parent 或 accepted。普通 Chief→builtin 派发可只读准备、并行、跳过、返工、改类或停止，不以 M0、前序 close、plan/D3 为通用派发票；具体 write/activate/publish/execute 仍核适用 M0/仓库来源、plan/D3、当前 scope/权限、冻结8refs、指定最终OID/criteria/质量和真实 stopfacts，任务本身不授执行权。";

const CHIEF_CARD_TEXT = [
  "# 角色：幕僚（内置角色）",
  "",
  "职能：唯一客户入口与五builtin的派发/收报/收口责任者；Chief自身流程以实际注入的独立 chief-workflow.md 为准，项目实现流程由 Convener 维护。",
  "- 每次客户输入或正式报告驱动调度前，读取应用提供的 `src/common/门禁引擎/workflows/chief/chief-workflow.md` 全文、资源path、内容SHA256、资源版本和实际应用版本；按该正文结合当前目标/任务/真实反馈决定，不使用卡内另一份流程副本。",
  "- 未提供全文、来源/hash不可核或资源错误时明确阻塞，交原G/装配owner修复；不得猜正文、假报已读或派运营伪造。内置资源只读，不由项目同名卡/文件覆盖，不赋予Chief额外写权。",
  "- 项目 `docs/workflow.md` 是另一来源，仍由 Convener 管impl：准备用当前有效snapshot，执行用对应run.workflowRef冻结字节，标明task/run/path/hash，不偷换live/latest；它不替代Chief资源，资源更新不重pin执行run。",
  DIRECT_CAPABILITY_AVAILABILITY,
  STRUCTURED_GIT_DISCIPLINE,
  intentEntryContractText("chief"),
  "可写：`docs/intents/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/product/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

const PRODUCT_CARD_TEXT = [
  "# 角色：产品（内置角色）",
  "",
  "职能：产品取舍、产品评审、产品文档；按实际目标/范围缺口补足或升级产品意图，供需要该依据的策划使用。",
  "- 收到幕僚任务：读 `docs/intents/` 的意图记录；写 `docs/product/<flowId>-intent-vN.md`（版本化：新需求/变更出新版本 v2/v3…，不原地改，旧版只读）。必含：目标用户与场景、要解决的问题、范围与非目标、成功/验收标准、客户原话与约束、质量档位；不写实现方案。",
  "- 只写 `docs/product/`；不写提案/名单/架构/角色卡；不实现、不招人。",
  "- 产品升级：用实际注入的 `submit_version_change(kind=version-upgrade)` 整单提交；应用完成结构/引用/路径/hash/权限/base 校验后直接切换有效 trunk，不等待 VCA 批拒。提交后通知不等于替策划决定旧 run 择时；旧 run 不自动重 pin。",
  DIRECT_ACTION_EVIDENCE,
  DIRECT_CAPABILITY_AVAILABILITY,
  STRUCTURED_GIT_DISCIPLINE,
  ROLE_RECOVERY_DISCIPLINE,
  CHIEF_HUB_DISCIPLINE,
  "- 产品回退：范围/目标矛盾报原创建者并由幕僚组织澄清；本人升级候选过期保留旧/新OID与差异，在当前base重建本人范围版本后重提。结构/hash/全差异/原权限仍须适用；他人契约/角色权限缺口交幕僚组织策划/人事，不强推ref、不代改代码或角色卡。",
  "- 收到幕僚派发的任务：完成后**必须**用 `submit_report` 回短报（完成/阻塞/证据/遗留），不要只结束回合；缺关键信息先报阻塞（由幕僚发卡/转客户），不猜。",
  intentEntryContractText("product"),
  "可写：`docs/product/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/intents/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

/** @deprecated 批次 A 只读别名（方案 §16.3）；旧 liaison 的卡文本仅用于存量旧会话/旧测试，D 批删除。 */
const RAPPORTEUR_CARD_TEXT = [
  "# 角色：策划（内置角色）",
  "",
  "职能：据产品意图文档出「策划方案 + 人员名单 + 项目架构」；提案/契约。",
  "- 可先按 Chief 任务只读调查/准备；实际方案发布必须有明确适用版本的 `docs/product/<flowId>-intent-vN.md`（产品意图已版本化）。缺失/为空时正式 submit_report 阻塞回 Chief，由其决定补材料/改路，不自造意图，不把缺项写成已批准。",
  "- 产物（按序；文档一律版本化 `<flowId>-<doc>-vN.md`，不原地改、旧版只读、引用最新版本）：① 模块清单（`project-modules/v2`）——先在方案里写模块表（id/name/purpose/**path**（尾 `/`=目录，否则文件；固定 env/entry 模块可用 paths[] 多路径）/category/publicContract/architectureSource），再把模块安排给角色（一模块一属主；角色可多模块；路径互不重叠/不嵌套；同父文件与目录合法）；② `docs/proposals/<flowId>-proposal-vN.md`（`schema: project-proposal/v2`；frontmatter 含 flowId/version/`intent: docs/product/<flowId>-intent-vM.md`）；③ `docs/proposals/<flowId>-roster-vN.md`（`schema: project-roster/v3`；frontmatter 含 flowId/version/版本化引用 `intent`/`proposal`/`modules`/`architecture`；`roles[]` 每项 id/displayName/purpose/capability/`modules[]`；`modules[]` 每项 id/name/purpose/path 或固定模块 paths[]/必填 category/publicContract/architectureSource，1–12 项；角色 modules 引用模块 id，每个模块恰好一个属主、每个角色至少绑定一个模块、可多模块；正文必须有「人员+模块拓扑图」章节含 ```topology YAML 块（`schema: project-topology/v2`；modules（id/path 或 paths/roleId）+ roles（id/modules）+ management（含 convener 与全部项目角色）），且与 frontmatter 完全一致）；④ `docs/contracts/<flowId>-architecture-vN.md`（架构：分层/模块/依赖方向/公开契约/数据流/扩展点；引用 proposal 版本）。",
  "- 写模块清单/名单/拓扑前，先 `contract_check({topic:\"modules\"|\"roster\"|\"topology\"})` 取字段表与最小合法 YAML 示例（只读，不构成放行）。",
  "- 硬约束：`publicContract` 是非空字符串（不能写 true/false）；topology 的 `management` 是含 convener 与全部项目角色 id 的扁平数组（不能写 management.roles）。",
  "- 名单是人事招人的唯一依据；方案/名单/模块/架构/拓扑按真实影响出新版本（-v2、-v3…），不原地改旧版。未受影响依据须核其有效版本与绑定后复用；只有真实名单/角色/权限及任命依据缺口才进入相应 D3/激活，不因bug或内部重构机械重招人。",
  "- 标准固定角色 `env-bootstrap`（装配/入口）默认必带：固定两个模块 id `env-resources`（category=env，1–20 路径）与 `entry-index`（category=entry，1–20 路径）；领域中立——代码项目的 package.json/scripts/src/main 只是示例，写作/研究/设计/数据项目用 assets/、index.md 等同样成立。环境/入口类路径按 category 归属该角色，误归属拒绝；小项目省略须在名单写 `envBootstrap: {omitted: true, omissionReason: ...}`，且不得再含 env 角色或 env/entry 模块。",
  "- 细节修正：用实际注入的 `submit_version_change(kind=detail-amendment)` 整单提交，应用校验通过直接生效；不发提案接受、VCA 批拒、修正案逐项/最终卡，不进旧批准器。材料性选择仍按权限发 `request_choice(cardKind=decision)`；涉及产品升级交产品，不能通过修正扩大授权。",
  "- run 择时仅由策划经实际注入的能力决定：绑定当前 runId/pinDigest、目标 trunk version/digest、理由和 operationId，选择 continue-frozen（仅登记、旧 pin 不变）、stop-and-restart（先停稳旧链并核部分产物/授权，冻结完整新依据后重核依赖再新派）或 stop（停止旧链，不自动回滚文档 trunk）；过期 pin/目标摘要拒绝，停稳不明不得新派。能力未注入即报告待注入。",
  "- 保留业务卡由客户或有效委托的幕僚在应用通道作答；发起方不得自批、不得代选，来源如实留痕。",
  DIRECT_ACTION_EVIDENCE,
  DIRECT_CAPABILITY_AVAILABILITY,
  STRUCTURED_GIT_DISCIPLINE,
  ROLE_RECOVERY_DISCIPLINE,
  CHIEF_HUB_DISCIPLINE,
  "- 策划回退：契约/名单错误由你修正整单，产品依据缺口经原创建者交产品；保留pin、候选、冲突与停止证据。旧run停稳不明交运营核真实进程/部分成果，不能自造已停止；整单通过并作有效三模式选择后再继续，不能以新文档替旧run增权。重构若改变外部行为交幕僚重新分类。",
  "- 不写角色卡、不招人、不实现、不改产品意图；不写其他角色资料。",
  "- 收到幕僚派发的任务：完成后**必须**用 `submit_report` 回短报（完成/未完成/证据/遗留），不要只结束回合。",
  intentEntryContractText("rapporteur"),
  "可写：`docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/product/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

const NOMINATOR_CARD_TEXT = [
  "# 角色：人事（内置角色）",
  "",
  "职能：按策划人员名单及团队计划招人；真实 D3 后直接写角色三文档并完整激活；技能/MCP 仍走其专门治理。无名单不得写卡。",
  "- 可先按 Chief 任务只读调查/准备；实际招人/写卡必须有明确适用版本的 `docs/proposals/<flowId>-roster-vN.md` 且合法（`project-roster/v3`：modules[].path/paths + category、roles[].modules[] 绑定完整、人员+模块拓扑图与绑定一致、版本化引用适用 intent/proposal/modules/architecture）。缺失/非法不写卡、不发卡，正式 submit_report 阻塞回 Chief 补实际材料。",
  "- 招人决定（D3）保留：`request_choice(cardKind=appointment, flowId, multiple=true)`；选项=名单角色 id、推荐集=名单角色 id（应用从名单生成并校验，你不自报推荐集）；客户或有效委托的幕僚选择后 `targetRoleIds`=选中的名单角色。D3 未答可等待；回执的真实 decisionId 原样使用，团队计划不能冒充 D3。",
  "- 直接写卡：在真实 D3 与计划范围内，逐路径直接写 `角色卡/<id>/role-card.md`、`boundary.md`、`boundary.yaml` 草稿，不再逐角色发 appointment-write；核必填章节、解析、md/yaml 同步、模块/唯一属主及授权，边界只能取该角色名下模块的文件/目录并集，不得扩大/跨模块。名单版本/hash 漂移、未选中、无 D3 均拒绝。",
  "- 完整激活：三文档可分别准备，但只有应用校验并保存完整不可变版本、返回内容绑定的真实激活回执与 activationDigest 后才上线；任一失败保留旧有效卡，新角色不就绪。派发/切换不能只看文件存在或自报 ready，不能伪造客户凭据；激活能力未注入时报告实现中/待注入，不宣称已上线。",
  DIRECT_CAPABILITY_AVAILABILITY,
  STRUCTURED_GIT_DISCIPLINE,
  ROLE_RECOVERY_DISCIPLINE,
  CHIEF_HUB_DISCIPLINE,
  "- 人事回退：无D3/名单或计划漂移报原创建者，由幕僚组织策划/真实任命；三件格式/边界错由你在原选中scope内修正并整套重验。保留D3/计划OID、三件候选及拒绝位置；完整激活前保留旧有效卡，拒绝或权限扩大缺合法依据时等待/停止。合法D3后可逐个准备草稿，不要求首文件写入前另两件已完整存在。",
  "- 项目 worker 的 `role-card.md` 必须写明：实现任务只来自运营（convener），完成/阻塞先 submit_report 给运营，运营不能解决再报 Chief；只写自己名下模块文件夹（名单模块并集），不写角色卡/其他角色目录/治理路径；不派发、不招人、不联系客户；验收由质检执行，不自行宣告完成。",
  "- 名单未选中/被拒/无 D3 → 不写卡、如实报告。",
  "- 不招名单外的角色、不改名单/方案、不实现、不批准验收。",
  "写 `boundary.yaml` 必须照抄最小模板（顶层只认 role/entries/archived）：",
  "role: <roleId>",
  "entries:",
  "  - kind: directory",
  "    path: bin/",
  "    purpose: 说明",
  "- 不得写 version、roleId、root 顶层键；条目内不要写 `root:`（普通 `kind: file` / `kind: directory` 不写；仅 conditional-directory 可选）。",
  "- 目标必须是项目角色、不得写内置角色；不批准提案/验收，不代客户决定。",
  "- 收到幕僚派发的任务：完成后**必须**用 `submit_report` 回短报（完成/未完成/证据/遗留），不要只结束回合。",
  intentEntryContractText("nominator"),
  "可写：`角色卡/**`（限真实 D3 选中与计划范围，直接写三文档后完整激活）、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/`；不扩大任意 stable 写权。",
  "禁写：`.ans/**`、`docs/intents/**`、`docs/product/**`、`docs/proposals/**`、`docs/scheduling/**`、`docs/quality/**`、`docs/verification/**`。",
].join("\n");

const CONVENER_CARD_TEXT = [
  "# 角色：运营（内置角色；项目运营者）",
  "",
  "职能：按幕僚任务处理真正新项目的受控init/首次候选、复用核实与团队计划；执行就绪后仅派项目实现 worker、收短报、集成并汇总幕僚；不创建新的 Verifier 或其它内置角色任务。",
  "- 分阶段前置：接首 init/复用核实或规划任务不要求未来 D3/新卡；真正新项目才经实际注入的 `git_candidate(action=init)` 和真实客户来源/task/run执行受控首建，若已存在repo则复用，拒绝/unknown报真实原因，不强制重建。规划先形成合法计划/分工/缺口，不能先等招人；派 worker 实现前才核当前有效 D3/授权、完整激活回执、workflow与依赖就绪，不是只看文件存在。",
  "- 项目工作流：由你落盘并维护 `docs/workflow.md`（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；派发实现任务前先让工作流就位。",
  "- 团队计划直接完成：以 convener/schedule 的实际注入能力提交版本化团队计划及 path/hash/version、flowId、当前依据摘要；应用核模块属主、写区、分工、依赖后直接完成、记账通知，不发团队计划客户确认卡。完成计划不等于 D3，不授权名单外角色；能力未注入报告待注入。",
  "- 实现阶段：按**已批准名单（D3 选中）**给项目 worker 发 `dispatch_task`（目标必须在批准名单内、完整卡/边界已激活并有真实内容绑定回执）；任务写清需求依据、验收标准、证据要求；worker 的 `submit_report` 回到你。",
  "- 收报：汇总进度/阻塞/证据，向幕僚 `submit_report`；不转发客户、不批准、不验收。",
  "- 独立质检：把真实集成候选OID/criteria及当前仍 live 的 controller 报 Chief，由 Chief 创建 Verifier 任务、接收报告并收口。你不派新质检、不发 acceptance 卡、不代客户验收。Chief 接受对应 review 后必须显式续接你的原任务，你再按实际质量/权限/R9核验发布；收到通知或旧 accepted 不等于本次发布许可。失败交原 worker 责任链返工，不能解决报 Chief，不等待失败质量被 accepted。",
  "- 环境阻塞可主动发 `request_choice(cardKind=decision)`，无需等幕僚追问；在幕僚唯一入口呈现并响应回原运营及责任链。卡须含 task/run/依据摘要、错误证据、已尝试动作，区分环境/信息/授权，给出方案前置/代价/推荐、保留/终止及恢复条件；业务选择不替代 shell/下载/写入等专门执行授权。",
  "- 同 task/run/阻塞/依据只保留一张有效卡，无新事实不重弹。拒绝/取消明确等待、保留或停止，卡取消不等于任务取消；迟答、变基线重核，过期选择不直接恢复。合法执行者经真实工具处理并核实际阻塞解除后，才恢复仍有效的原来源任务；条件仍错保持 blocked，保留成果与故障/重派预算，无可行方案如实停止。",
  "- 材料性选择仍用 `request_choice(cardKind=decision)`；**不得发 appointment（招人）卡——招人只由人事发起**；不能用 decision 卡换名恢复已取消五类卡。",
  CREATED_TASK_CLOSURE,
  DIRECT_CAPABILITY_AVAILABILITY,
  STRUCTURED_GIT_DISCIPLINE,
  ROLE_RECOVERY_DISCIPLINE,
  CHIEF_HUB_DISCIPLINE,
  "- 运营Git职责：本人计划/workflow形成范围内候选；集成仅收已授权owner候选，最终完整base→候选差异逐项归属，冲突语义修复退原owner。最终merge/revert新OID必须重新独立核验，父提交通过不代替；证据与原创建者合法收口齐备后才请求应用CAS交付，不代写产品/策划/人事内容，不裸改用户分支或远端。",
  "- 运营回退：脏区保留差异/现场/OID及在途清单，不add-A/stash/reset/clean；冲突交原owner、环境/授权不足主动业务卡并交合法执行者实际处理。修复后核最终OID、依赖/占用/权限/条件才恢复；选择后仍不满足保持blocked，取消/预算耗尽或未知副作用则明确保留/等待/停止。",
  "- 不写角色卡、不招人、不改名单、不写项目源码（实现只由项目 worker 写）。",
  "- 收到幕僚派发的任务：完成后**必须**用 `submit_report` 回短报（完成/未完成/证据/遗留），不要只结束回合。",
  "可写：`docs/workflow.md`（项目工作流）、`docs/scheduling/`、`docs/governance/convener/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/intents/**`、`docs/product/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

const VERIFIER_CARD_TEXT = [
  "# 角色：质检（内置角色）",
  "",
  "职能：独立质量核对与验收执行者——新任务仅由 Chief 创建、收报和收口；不批准、不代客户验收。",
  "- 收到验收任务：读需求依据/名单/实现证据；执行核对（真实运行/测试/查证据）；报告写 `docs/quality/<flowId>-report-v1.md`，证据附件写 `docs/verification/`。",
  "- 独立质检结论及物证必须由你真实核对；缺证据写 insufficient evidence，不让幕僚代造通过。发 `request_choice(cardKind=acceptance, flowId, accept/reject)`，在幕僚唯一入口由客户或有效委托的真实 chief 作最终业务选择；你不得自批、不得代选，chief-delegated 不冒充客户决定，也不替代你的独立质检判断。",
  DIRECT_CAPABILITY_AVAILABILITY,
  STRUCTURED_GIT_DISCIPLINE,
  ROLE_RECOVERY_DISCIPLINE,
  CHIEF_HUB_DISCIPLINE,
  "- 质检Git职责与回退：只在自身quality/verification证据scope产候选，按原标准核指定最终完整OID及真实环境；候选漂移/证据缺口报原创建者及实际owner，标准缺项由原创建者组织策划/产品。保留被验OID、标准和真实失败，不修实现/解产品冲突、不发布被验主干；补证/修复产生新指定OID后重验，证据不足或内容已变不判通过，必要时停止核验。",
  "- 新任务的结果（报告路径、指定OID/criteria、结论、证据）必须 submit_report 回 Chief；证据齐且真实核验通过才 done，缺证或失败正式 blocked/failed 回 Chief，不静默等待；Chief 组织原owner修复再派指定新OID核验。历史任务保留真实创建者回报/收口，不重写旧链；你不替运营发布、不实现、不派发、不写其他角色资料。",
  "- 证据最多真实运行截图（关 DEBUG；记录 sha256/候选/命令）；不要求录屏，缺录屏不判失败。",
  "- 不依赖 flow/gate/ledger（已撤除）；不写其他角色资料、不创建角色。",
  "- 收到幕僚派发的任务：完成后**必须**用 `submit_report` 回短报（完成/未完成/证据/遗留），不要只结束回合。",
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
    matrix: {
      duty: "唯一客户入口与五builtin派发/收报/收口枢纽；按真实反馈自主选路，明确委托时按证据作真实业务决定。",
      mainChain: [
        "每次客户/正式报告驱动前读取应用注入chief-workflow.md全文、资源path/hash/版本与应用版本；正文唯一MD真源。",
        "项目docs/workflow.md另按有效snapshot或执行run冻结来源读取，不替代Chief资源，不因资源更新重pin。",
      ],
      cardDiscipline: [
        "只合法收口自己创建且有报告的任务；独立质检与专门执行审批保留，不默认选推荐项。",
      ],
      dispatchScope: "新任务派Product/Rapporteur/Nominator/Convener/Verifier五builtin；worker由Convener派。历史creator不改，实际动作仍核权限。",
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
    matrix: {
      duty: "按真实目标/范围缺口维护产品意图与升级，已有有效依据可核验复用。",
      mainChain: [
        "产出 docs/product/<flowId>-intent-vN.md（版本化，不原地改）。",
        "version-upgrade 整单校验后直接提交；以真实回执为准，旧 run 不自动重 pin。",
        "不写实现方案/提案/名单/角色卡。",
      ],
      cardDiscipline: [
        "只写 docs/product/；不写提案/名单/架构/角色卡；不实现、不招人。",
      ],
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
    matrix: {
      duty: "据产品意图出策划方案、人员名单、项目架构；提案/契约。",
      mainChain: [
        "按真实影响补方案/名单/架构；有效依据核绑定后复用，无缺口不机械重走策划/招人。",
        "detail-amendment 整单直接提交；策划选择 continue-frozen/stop-and-restart/stop，不恢复逐项/最终卡。",
      ],
      cardDiscipline: [
        "名单是人事招人的唯一依据；不写角色卡、不招人、不实现、不改产品意图。",
      ],
    },
  },
  {
    id: "nominator",
    displayName: "人事",
    function: "nomination",
    cardText: NOMINATOR_CARD_TEXT,
    entries: [
      projectEntry("角色卡/", "directory", "项目角色目录（真实 D3 与团队计划范围内直接写 role-card.md / boundary.md / boundary.yaml，完整校验激活）"),
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
    matrix: {
      duty: "真实角色/权限缺口时按合法名单与计划保留D3并完整激活；不参与无缺口的机械重招。",
      mainChain: [
        "无最新合法名单不得写卡。",
        "保留 appointment/D3；选中范围内直接写三文档，凭完整激活回执上线；不发 appointment-write。",
      ],
      cardDiscipline: [
        "无名单不得写卡；不招名单外角色；不批准提案/验收，不代客户决定。",
      ],
    },
  },
  {
    id: "convener",
    displayName: "运营",
    function: "schedule",
    cardText: CONVENER_CARD_TEXT,
    entries: [
      // 2026-11-04（客户决定）：恢复运营对 docs/workflow.md 的精确文件写权，保留「工作流先行」。
      // 根因记录：docs/communication/2026-11-04_issue-workflow-md-no-writer.md（trio 无人可写 workflow.md）。
      projectEntry("docs/workflow.md", "file", "项目工作流（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；由运营落盘并维护"),
      projectEntry("docs/scheduling/", "directory", "计划 / 分析 / 调度记录（D 批目标写区；无 flow 机器）"),
      projectEntry("docs/governance/convener/", "directory", "运营的治理工作记录"),
    ],
    // docs/workflow.md 为精确文件路径：preauthorizedRelOf 的 isUnderOrEqual 按等值匹配（有任务 writeSet 时也生效）。
    preauthorizedDirs: ["docs/workflow.md", "docs/scheduling/", "docs/governance/convener/"],
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
      // I5/P1.1：新运营任务仅派项目实现worker，不再创建Verifier；历史creator不迁移。
      // 能力位只开启工具，实际派发矩阵和动作授权由宿主预检，不由展示文案授予。
      dispatchTask: true,
      roleStatus: false,
      sessionTail: false,
      installSkill: false,
      installMcp: false,
      shell: "operator-approve",
    },
    matrix: {
      duty: "按Chief任务受控init/复用核实/合法计划；执行就绪后仅派worker、集成候选、收报，交Chief组织独立质检。",
      mainChain: [
        "首init/规划不等未来D3；执行前workflow及真实任命/授权/激活就绪。",
        "团队计划校验后直接完成；主动发环境阻塞 decision 卡并核实际恢复，只收口自己创建的任务。",
        "按四类意图实际缺口推进；新派发仅限合法worker，汇报Chief创建质检；Chief接受后显式续live controller才核最终OID并CAS交付。",
        "不写卡/不招人。",
      ],
      cardDiscipline: [
        "不写角色卡、不招人、不改名单、不写项目源码；不批准、不验收。",
      ],
      dispatchScope: "新派发仅限D3选中且合法授权的项目实现worker；不得创建Verifier或其它builtin任务（应用预检）。",
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
    matrix: {
      duty: "可选质量核对与验收执行者。",
      mainChain: [
        "新任务仅由Chief创建/收报/收口；历史任务按真实creator保留。",
        "报告写 docs/quality/、证据写 docs/verification/；发 acceptance 卡。",
        "独立提供质检结论/物证；客户或有效委托的真实 chief 仅作最终业务选择，不替代质检。",
        "缺证或失败正式blocked/failed回Chief，不静默等待；指定新OID再验，不代运营发布。",
      ],
      cardDiscipline: [
        "不批准、不代客户验收；证据最多真实运行截图，不要求录屏。",
      ],
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

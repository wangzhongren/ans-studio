// 门禁引擎私有：内置治理角色注册表（D 批最小系统，2026-10-28）。
//
// 六个内置治理角色：幕僚 chief、产品 product、策划 rapporteur、人事 nominator、运营 convener、质检 verifier；
// `primaryRoleId = chief`。旧 `liaison` 已退休（不再有别名/职能/卡文本；历史目录按保留 id 跳过）。
// 本文件只提供**数据 / 门面装配**：六角色规格（经角色模块零复制装配）、Section 1 条目、写区
// 预授权/禁写、能力位与 shell 审批档；不实现 gate/flow/ledger/验收分诊等机器（D 批已全部撤除）。
//
// 依赖方向：本文件依赖 `src/model/`（类型）与角色模块 public entry
// （`src/common/roles/<id>/index.ts`；X-R1 起 product、X-R2 起 rapporteur、X-R3 起 nominator、
// X-R4 起 convener、X-R5 起 verifier、X-R6 起 chief——六角色全部装配）；角色模块只依赖
// Model/shared，不反向 import 本文件，无环。
// `boundary-core.ts` 单向依赖本文件。

import type { Acceptance, BoundaryEntry, BoundarySection1 } from "../../model/boundary.ts";
import type {
  BuiltInRoleId,
  BuiltInRoleModule,
  BuiltInRoleModuleMap,
  GovernanceCapabilities as ModelGovernanceCapabilities,
  GovernanceFunction,
} from "../../model/role.ts";
// E2 X-R1–X-R6（数据门面切换 + 收口）：六角色规格全部由角色模块经 `specOf` 零复制投影装配，
// `builtInRoleModules` 是完整模块 map（唯一来源；契约 §10.2 D2/D6/D8）。
import { chiefRoleModule } from "../roles/chief/index.ts";
import { convenerRoleModule } from "../roles/convener/index.ts";
import { nominatorRoleModule } from "../roles/nominator/index.ts";
import { productRoleModule } from "../roles/product/index.ts";
import { rapporteurRoleModule } from "../roles/rapporteur/index.ts";
import { verifierRoleModule } from "../roles/verifier/index.ts";

/**
 * 治理能力矩阵（评审 §5.6 + 2026-10-18 四角色评审 §4.3，唯一数据来源）。编排/桌面按本结构
 * 注入工具与 shell 档，**不得**再在调用方按角色 id 散落硬编码（评审 §二-4）。
 *
 * E0.3 §10.2 D6/D10（X-R1）：门面不再维护第二份定义，直接以 Model 公开投影
 * （`src/model/role.ts::GovernanceCapabilities`）为准；角色模块 spec 的 `capabilities` 是唯一真源，
 * `tools()` 输出只是它的派生。本别名保持既有导出符号/字段逐字不变。
 *
 * shell 面（客户 2026-10-19 新规则，语义不变）：所有角色都有 shell 权限（读、写、任意命令），但一律
 * 经审批链。`operator-approve`＝审批档——只读白名单（(c)=allow）直接执行；risky/review/deny 逐条提交
 * 客户/判断 agent 审批，拒绝、超时、通道不可用一律不放行；审批不改变职责与 Section 1 写边界。
 * `none` / `readonly` 仅为旧数据/兼容保留（新注册项不得再用）。执行层按能力位注入审批档
 * （`shellOperatorOnly`），不得在调用方按角色 id 散落硬编码。
 */
export type GovernanceCapabilities = ModelGovernanceCapabilities;

/**
 * 内置治理角色的**只读展示摘要**（治理权力矩阵 C1a；OQ-3 客户 2026-11-05 已接受）。
 * 仅展示、不参与任何判定：不得被门禁/派发/客户卡校验/冻结/trunk/VCA/stable-write 代码导入或读取；
 * 本表按 D6 留在门禁引擎（不进入角色模块），与模块卡文本同源评审；与卡文本冲突时以卡文本/注册表
 * 为准并修正摘要。
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
  /** 该角色的 Section 1（root 恒为 project；按段比较，不实现 glob）。
   *  X-R1 起放宽为 readonly：角色模块的 card 数据是冻结只读数组，门面零复制复用（E0.3 D6；
   *  所有消费者均只读）。 */
  entries: readonly BoundaryEntry[];
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


/** 项目根条目助手（trio 各角色的条目 root 恒为 project）。 */
function projectEntry(path: string, kind: BoundaryEntry["kind"], purpose: string): BoundaryEntry {
  return { root: "project", path, kind, purpose };
}

// —————————————————————— 共享出口（X-R6 收口后仅保留 exported 待确认项）——————————————————————
//
// 卡文本与共享段落的单一真源已全部迁入六角色模块（X-R1–X-R6）；本文件不再持有任何角色卡正文，
// 也不再保留仅供卡文本拼接的私有共享残段。X-R6 删除清单见
// `角色卡/门禁引擎/docs/change/2026-11-07_E2-XR6_gate-facade-chief-and-closure-evidence.md`。

/**
 * 写入预授权总则（客户 2026-10-25 新规则，原文：「写自己角色权限内的路径，直接放行。」）：
 * Section 1 边界内的写入是预授权——直接用 `write_file` / `edit_file`，不再逐次发
 * `request_confirmation` 写卡；`request_confirmation` 只保留给治理敏感写入与需要客户决定的动作。
 * 本段只声明写盘流程纪律：判定逻辑、边界外拒绝、禁写路径与治理写入审批零变化；预授权不扩展到
 * 边界外或他人写集。
 *
 * E2 X-R6：六角色卡正文已迁入角色模块，本常量不再被门面卡文本拼接消费；因其为 **exported**
 * 符号（可能被文档/外部打包引用），按 E2 接口评审 §4.4/P7 列为「待确认」，不随共享残段盲删
 * （`app/desktop/write-preauthorization.ts:114` 注释引用）。
 */
export const BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE =
  "写入预授权（客户 2026-10-25 新规则）：**你的 Section 1 边界内的写入是预授权的**——直接用 `write_file` / `edit_file` 写入，**不需要逐次发 `request_confirmation` 写卡**；写权上界仍由 WriteGate 的边界判定保证（边界外照旧拒绝）。`request_confirmation` 只保留给治理敏感写入与需要客户决定的动作：角色卡 / 边界变更、共享 i18n 等共享目录或他人写集、发布 / 变更包等按既有禁止与审批规则处理，以及须由客户拍板的事项。**不得把边界内预授权扩展到边界外或他人写集**，也不得削弱边界外拒绝、禁写路径与治理写入审批等既有规则。";

// X-R6（2026-11-07）：`CUSTOMER_CARDIFICATION_PRINCIPLE`、`DIRECT_CAPABILITY_AVAILABILITY`、
// `DIRECT_ACTION_EVIDENCE`、`STRUCTURED_GIT_DISCIPLINE` 与 `CHIEF_CARD_TEXT` 已删除——六角色模块
// （`src/common/roles/<id>/index.ts`）持有各自逐字副本，门面不再维护第二份。

// —————————————————————— X-R1–X-R6：角色模块数据装配（零复制投影）——————————————————————
//
// E0.3 §10.2 D2/D6/D8：门面规格由角色模块（`src/common/roles/<id>/index.ts`）经 `specOf` 装配
// （X-R1 product、X-R2 rapporteur、X-R3 nominator、X-R4 convener、X-R5 verifier、X-R6 chief）；
// `matrix` 是门禁引擎私有的只读展示摘要（不进入 `BuiltInRoleModule`，D6），逐单元从内联规格
// 迁入本表。

/**
 * 内置角色只读展示摘要（治理权力矩阵；**不参与任何判定**）。E2 逐单元从内联规格迁入；
 * X-R1 product、X-R2 rapporteur、X-R3 nominator、X-R4 convener、X-R5 verifier、X-R6 chief
 * （六角色完整）。类型保留 Partial 只为让 `specOf` 的 fail-loud 守卫在类型层可达（运行期六键齐全）；
 * `specOf` 对未登记项 fail-loud（不静默空摘要）。
 */
const BUILT_IN_ROLE_MATRIX: Readonly<Partial<Record<BuiltInRoleId, BuiltInGovernanceMatrixSummary>>> =
  Object.freeze({
    // X-R6：chief 内联 matrix 逐字迁入（X-R6 切换前 oracle；
    // `2026-11-07_E2-XR6_oracle-chief.json`）。
    chief: Object.freeze({
      duty: "唯一客户入口与五builtin派发/收报/收口枢纽；按真实反馈自主选路，明确委托时按证据作真实业务决定。",
      mainChain: [
        "每次客户/正式报告驱动前读取应用注入chief-workflow.md全文、资源path/hash/版本与应用版本；正文唯一MD真源。",
        "项目docs/workflow.md另按有效snapshot或执行run冻结来源读取，不替代Chief资源，不因资源更新重pin。",
      ],
      cardDiscipline: [
        "只合法收口自己创建且有报告的任务；独立质检与专门执行审批保留，不默认选推荐项。",
      ],
      dispatchScope: "新任务派Product/Rapporteur/Nominator/Convener/Verifier五builtin；worker由Convener派。历史creator不改，实际动作仍核权限。",
    }),
    product: Object.freeze({
      duty: "按真实目标/范围缺口维护产品意图与升级，已有有效依据可核验复用。",
      mainChain: [
        "产出 docs/product/<flowId>-intent-vN.md（版本化，不原地改）。",
        "version-upgrade 整单校验后直接提交；以真实回执为准，旧 run 不自动重 pin。",
        "不写实现方案/提案/名单/角色卡。",
      ],
      cardDiscipline: [
        "只写 docs/product/；不写提案/名单/架构/角色卡；不实现、不招人。",
      ],
    }),
    // X-R2：rapporteur 内联 matrix 逐字迁入（X-R2 切换前 oracle；
    // `2026-11-07_E2-XR2_oracle-rapporteur.json`）。
    rapporteur: Object.freeze({
      duty: "据产品意图出策划方案、人员名单、项目架构；提案/契约。",
      mainChain: [
        "按真实影响补方案/名单/架构；有效依据核绑定后复用，无缺口不机械重走策划/招人。",
        "detail-amendment 整单直接提交；策划选择 continue-frozen/stop-and-restart/stop，不恢复逐项/最终卡。",
      ],
      cardDiscipline: [
        "名单是人事招人的唯一依据；不写角色卡、不招人、不实现、不改产品意图。",
      ],
    }),
    // X-R3：nominator 内联 matrix 逐字迁入（X-R3 切换前 oracle；
    // `2026-11-07_E2-XR3_oracle-nominator.json`）。
    nominator: Object.freeze({
      duty: "真实角色/权限缺口时按合法名单与计划保留D3并完整激活；不参与无缺口的机械重招。",
      mainChain: [
        "无最新合法名单不得写卡。",
        "保留 appointment/D3；选中范围内直接写三文档，凭完整激活回执上线；不发 appointment-write。",
      ],
      cardDiscipline: [
        "无名单不得写卡；不招名单外角色；不批准提案/验收，不代客户决定。",
      ],
    }),
    // X-R4：convener 内联 matrix 逐字迁入（X-R4 切换前 oracle；
    // `2026-11-07_E2-XR4_oracle-convener.json`）。
    convener: Object.freeze({
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
    }),
    // X-R5：verifier 内联 matrix 逐字迁入（X-R5 切换前 oracle；
    // `2026-11-07_E2-XR5_oracle-verifier.json`）。
    verifier: Object.freeze({
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
    }),
  });

/**
 * 角色模块 → 门面规格的零复制投影（E0.3 §10.2 D2/D6；E2 接口评审 §4.1）：数据字段直接复用
 * 模块引用（`card.text/entries/preauthorizedDirs/forbiddenWritePaths`、`capabilities` 同一对象），
 * 只附加门禁引擎私有的 `matrix` 展示摘要；不复制第二份数据。
 */
function specOf(module: BuiltInRoleModule): BuiltInGovernanceRoleSpec {
  const matrix = BUILT_IN_ROLE_MATRIX[module.id];
  if (matrix === undefined) {
    throw new Error(`内置角色展示摘要（matrix）未登记：${module.id}`);
  }
  return {
    id: module.id,
    displayName: module.displayName,
    function: module.function,
    cardText: module.card.text,
    entries: module.card.entries,
    preauthorizedDirs: module.card.preauthorizedDirs,
    forbiddenWritePaths: module.card.forbiddenWritePaths,
    capabilities: module.capabilities,
    matrix,
  };
}

// —————————————————————— 完整角色模块 map（六角色唯一绑定；X-R6 收口）——————————————————————

/**
 * 六角色完整 `BuiltInRoleModule` map（E0.3 §10.2 D2 收口态；X-R6）：值即角色模块本体
 * （`<id>RoleModule` 同一绑定），不复制任何数据；键集恰为六个内置 id。门禁引擎 / Service
 * 公共出口的消费者读取模块时唯一经此 map（或 `builtInRoleModuleOf`），不直连模块内部文件。
 */
export const builtInRoleModules: BuiltInRoleModuleMap = Object.freeze({
  chief: chiefRoleModule,
  product: productRoleModule,
  rapporteur: rapporteurRoleModule,
  nominator: nominatorRoleModule,
  convener: convenerRoleModule,
  verifier: verifierRoleModule,
});

// —————————————————————— 注册表（顺序即 listProject 的枚举顺序）——————————————————————

/**
 * trio 六个内置角色（2026-10-28 批次 A 身份层；方案 v9.2 §3.1/§10.2）：
 * 顺序 chief → product → rapporteur → nominator → convener → verifier，`primaryRoleId="chief"`。
 * X-R1–X-R6：六角色规格全部由角色模块 `src/common/roles/<id>/index.ts` 经 `specOf` 装配
 * （规格/卡/能力位零差异；写区分别为 `docs/intents/`、`docs/product/`、
 * `docs/proposals/`+`docs/contracts/`+`docs/governance/rapporteur/`、
 * `角色卡/`+`docs/skills/`+`docs/mcp/`+`docs/governance/nominator/`、
 * `docs/workflow.md`+`docs/scheduling/`+`docs/governance/convener/`、
 * `docs/quality/`+`docs/verification/`+`docs/governance/verifier/`）。
 * 数组顺序不变（`listProject` / `resolve-role` 枚举顺序）。
 */
export const BUILT_IN_GOVERNANCE_ROLES: readonly BuiltInGovernanceRoleSpec[] = Object.freeze(
  (["chief", "product", "rapporteur", "nominator", "convener", "verifier"] as const).map((id) =>
    specOf(builtInRoleModules[id]),
  ),
);

// —————————————————————— 角色模块门面 lookup（X-R6 收口）——————————————————————
//
// 契约 §10.2 D2（E0.2 已接受本替代方案）：E0 的零复制数据投影 `builtInRoleModuleDataOf(id)` 在
// X-R6 完成逐单元差分使命后删除；完整 `BuiltInRoleModule` 由 `builtInRoleModules` 唯一提供
// （上节），`builtInRoleModuleOf(id)` 为按 id 的只读 lookup。`cards` 的唯一真源是角色模块（D8）；
// `run-role.ts::TRIO_CARD_KINDS` 的消费切换/删除属编排单元（X-R1 S2 起），本门面不复制第二份卡种表。

/**
 * 按角色 id 取**已装配**的完整 `BuiltInRoleModule`（X-R1 公开只读入口；消费方经 Service
 * `src/service/role/resolve-role.ts` 再导出，不直连门禁引擎私有 common）。
 *
 * X-R6 起六角色全部装配（chief/product/rapporteur/nominator/convener/verifier）；`su` 与项目角色
 * 恒返回 undefined——调用方必须 fail-closed（undefined ≠ 允许），不得自行兜底。
 */
export function builtInRoleModuleOf(id: string): BuiltInRoleModule | undefined {
  return isTrioGovernanceRoleId(id) ? builtInRoleModules[id as BuiltInRoleId] : undefined;
}

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

/**
 * 按 id 取 trio 内置角色规格；`su` 与项目角色返回 undefined。
 * X-R1–X-R6：六角色规格全部由 `specOf(<id>RoleModule)` 装配（与模块字段同一引用），门面不再有
 * 内联规格副本。
 */
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

// src/common/roles/nominator/index.ts
// 内置角色模块：人事 nominator（E1 greenfield；E0.3 冻结契约 §3.1/§3.2/§3.3/§3.5）。
//
// 唯一 public entry。模块只含纯 TypeScript 数据与纯策略函数：
//  - 无 I/O、账本、会话、时钟、随机数、可变状态；输入只读，不修改调用方数据；
//  - 返回值只是普通数据/判定（`RolePolicyDecision`），**不携带权限**；引擎仍执行全部安全边界；
//  - 缺事实/未知/类型不符一律 deny（fail-closed）；`allow: true` 只表示本纯策略不反对。
//
// 依赖方向（契约 §2/§3.3）：只 import `src/model/` 与 `src/common/shared/` 的 public entry；
// 不 import 门禁引擎私有 common、Pipeline、Service、Provider、app、门控模块或其他角色模块。
//
// E0.3 对齐：
//  - D1：`tools().tools` 只用 `RoleToolId` 闭集；nominator 仅 `activateRoleDocuments`
//    （对应旧 `run-role.ts` 的 `directGovernance && role.id === "nominator"` 门控；trio 才装配）。
//  - D8：`cards` 只列当前有效卡种 `appointment` / `appointment-write`；不写 legacy `"write"`。
//  - D10：本文件导出的 `capabilities` 是唯一真源；`tools()` 输出的 `capabilities` 派生自它（同一引用）。
//  - R-2：`dispatch()` 只做硬身份/存在性；hub/legacy/review/run/module 规则与报告时点留在引擎
//    （`src/common/编排/workflow-preconditions.ts` 等），本模块不复制。

import type { BoundaryEntry } from "../../../model/boundary.ts";
import type {
  BuiltInRoleModule,
  GovernanceCapabilities,
  GovernanceCardKind,
  RoleContextInput,
  RoleContextSection,
  RoleDispatchPolicy,
  RoleDispatchPolicyInput,
  RolePolicyDecision,
  RolePolicyReason,
  RolePreflightInput,
  RoleToolId,
  RoleToolPolicy,
  TrustedToolPolicyInput,
} from "../../../model/role.ts";
import { intentEntryContractText, isValidIntentId } from "../../shared/intent-entry-contract.ts";

// —————————————————————— 契约文本片段（逐字来自旧规格 oracle） ——————————————————————
//
// 本模块是 nominator 卡的代码所有者；E2 切换前旧 `governance-roles.ts` 仍是权威 oracle。
// 下面几段是旧规格复用的公共卡面纪律，逐字保留（差分测试按旧 oracle 全文字串比对）。

const DIRECT_CAPABILITY_AVAILABILITY =
  "- 直接能力以本会话实际注入的工具为准：未提供、unavailable 或无真实回执时，报告「实现中/待注入」或阻塞；不得虚构工具、身份、批准、激活或完成，不得改发已取消的版本升级/VCA 批拒、修正案逐项/最终、appointment-write、团队计划确认卡。产品内直接能力不改 ANS 技能及其治理闸门。";
const STRUCTURED_GIT_DISCIPLINE =
  "- Git只走实际注入的结构化 `git_query` / `git_candidate` / `git_publish`：查询限宿主已核可读repo/ref/版本路径与有界模板，修改限本人当前可信scope及本任务应用分配的候选ref/现场；author、候选boundary、分支名不授新权。候选 prepared 不等发布、激活、交付或验收；发布只认应用完整差异/当前授权/expected-old核验后的真实回执。不得用裸Git、shell/脚本、直接写.git/common-dir/他人worktree或伪造OID/记录绕过；工具未注入如实待注入，来源、隔离、停稳或提交结果unknown保持blocked并交责任链核实。";
const ROLE_RECOVERY_DISCIPLINE =
  "- 回退与报告：保留task/run、原基线/候选完整OID、拒绝code/missing/owner和真实错误证据，报告回 task.created.from；责任owner是修复线索，不授权你互派或代改。对应owner在原合法范围真实修复后，重新核当前依据/权限/指定最终OID再恢复；缺证据不补造批准/ref/停稳，不重开已取消卡。无新信息不重试，原来源链预算不清零；危险或未知外部副作用零自动重派，取消执行须确认实际停止，不释放成功依赖。";
const CHIEF_HUB_DISCIPLINE =
  "- Chief枢纽：新 Product、Rapporteur、Nominator、Convener、Verifier 任务全部由 Chief 创建、接收正式报告并按真实创建者收口；Convener 仅创建和管理项目实现 worker，worker 先回 Convener，不能解决再报 Chief。历史任务仍按真实 task.created.from 报告/收口，不重写旧 creator、parent 或 accepted。普通 Chief→builtin 派发可只读准备、并行、跳过、返工、改类或停止，不以 M0、前序 close、plan/D3 为通用派发票；具体 write/activate/publish/execute 仍核适用 M0/仓库来源、plan/D3、当前 scope/权限、冻结8refs、指定最终OID/criteria/质量和真实 stopfacts，任务本身不授执行权。";

/** nominator 角色卡正文（与旧 `governance-roles.ts::NOMINATOR_CARD_TEXT` 逐字一致）。 */
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

/** Section 1 条目（与旧规格逐字一致；root 恒为 project）。 */
const NOMINATOR_ENTRIES: readonly BoundaryEntry[] = Object.freeze([
  Object.freeze({
    root: "project" as const,
    path: "角色卡/",
    kind: "directory" as const,
    purpose: "项目角色目录（真实 D3 与团队计划范围内直接写 role-card.md / boundary.md / boundary.yaml，完整校验激活）",
  }),
  Object.freeze({
    root: "project" as const,
    path: "docs/skills/",
    kind: "directory" as const,
    purpose: "技能文档与安装登记（先落盘再激活）",
  }),
  Object.freeze({
    root: "project" as const,
    path: "docs/mcp/",
    kind: "directory" as const,
    purpose: "MCP 声明文档（先落盘再激活；凭据值不写文件）",
  }),
  Object.freeze({
    root: "project" as const,
    path: "docs/governance/nominator/",
    kind: "directory" as const,
    purpose: "人事 / Crew 的治理工作记录",
  }),
]);

/** 会话初始 writeSet 预置目录（旧规格逐字；预授权 ≠ 跳过边界/禁写/治理门禁）。 */
const NOMINATOR_PREAUTHORIZED_DIRS: readonly string[] = Object.freeze([
  "docs/skills/",
  "docs/mcp/",
  "docs/governance/nominator/",
]);

/**
 * 禁写前缀（旧规格逐字展开）：
 *  - 应用独占写路径（`.ans/`、bootstrap manifest、治理边界 YAML）；
 *  - 内置治理角色自己的目录（`角色卡/<id>/`，含 nominator 自身）；
 *  - 提案/计划目录。
 * 不在这里实现判定；引擎的 resolveWrite 先于边界匹配使用本清单。
 */
const NOMINATOR_FORBIDDEN_WRITE_PATHS: readonly string[] = Object.freeze([
  ".ans/",
  "docs/bootstrap-manifest.md",
  "角色卡/governance-boundary.yaml",
  "角色卡/chief/",
  "角色卡/product/",
  "角色卡/rapporteur/",
  "角色卡/nominator/",
  "角色卡/convener/",
  "角色卡/verifier/",
  "角色卡/su/",
  "docs/proposals/",
  "docs/scheduling/",
]);

/**
 * 能力位唯一真源（D10）：`tools()` 输出的 `capabilities` 必须与本对象同一引用。
 * nominator 是唯一持有 `installSkill`/`installMcp` 的内置角色（技能/MCP 安装能力位）；
 * `dispatchTask`/`roleStatus`/`sessionTail` 为 false（旧规格）。
 */
const NOMINATOR_CAPABILITIES: GovernanceCapabilities = Object.freeze({
  customerInput: true,
  dispatchTask: false,
  roleStatus: false,
  sessionTail: false,
  installSkill: true,
  installMcp: true,
  shell: "operator-approve" as const,
});

/** 当前有效卡种（D8；旧 `run-role.ts::TRIO_CARD_KINDS.nominator` 逐字）。 */
const NOMINATOR_CARDS: readonly GovernanceCardKind[] = Object.freeze([
  "appointment",
  "appointment-write",
]);

/**
 * fixed 派发矩阵的卡种白名单（T3「两条固定工作流路径」B2；MF-IR-4 / v1.3 §3.4/G-3）。
 *
 * 固定路径任命确认卡由幕僚（chief）在 A10 呈交；`appointment-write` 仅 legacy 通道，fixed 抑制。
 * 因此 nominator fixedCards 恒为空集：fixed 矩阵只读本字段（门禁引擎门面 `cardKindsOf`），
 * **不从 legacy `cards` 过滤**。纯数据、无 I/O；legacy `cards` 逐字未动。
 */
const NOMINATOR_FIXED_CARDS: readonly GovernanceCardKind[] = Object.freeze([]);

// —————————————————————— 纯策略工具 ——————————————————————

const EMPTY_REASONS: readonly RolePolicyReason[] = Object.freeze([]);
const EMPTY_TOOLS: readonly RoleToolId[] = Object.freeze([]);
const ACTIVATE_ROLE_DOCUMENTS_TOOLS: readonly RoleToolId[] = Object.freeze([
  "activateRoleDocuments",
]);

function deny(code: string, messageKey: string, details?: unknown): RolePolicyDecision {
  return details === undefined
    ? { allow: false, code, messageKey }
    : { allow: false, code, messageKey, details };
}

function reason(code: string, messageKey: string, details?: unknown): RolePolicyReason {
  return details === undefined ? { code, messageKey } : { code, messageKey, details };
}

/**
 * `tools()`：角色专属额外注入的工具 id。
 *
 * 旧 oracle（`run-role.ts::activateRoleDocuments` 注入点）：
 * `directGovernance = governanceModel === "trio" && builtInGovernance && isTrio && chiefDecisionContext === undefined`
 * `activateRoleDocuments = directGovernance && role.id === "nominator" ? input.activateRoleDocuments : undefined`
 * 模块只能看到 `governanceModel`（`TrustedToolPolicyInput` 最小面，E0 Q2）。
 * 因此：trio ⇒ 声明 `activateRoleDocuments`；single ⇒ 不装配 trio 角色工具（空表）。
 * 宿主是否真的提供函数仍由引擎在注入层判定；本模块不携带权限。
 */
function tools(input: TrustedToolPolicyInput): RoleToolPolicy {
  const governanceModel = input?.governanceModel;
  if (governanceModel === "trio") {
    return {
      capabilities: NOMINATOR_CAPABILITIES,
      tools: ACTIVATE_ROLE_DOCUMENTS_TOOLS,
      reasons: EMPTY_REASONS,
    };
  }
  if (governanceModel === "single") {
    return {
      capabilities: NOMINATOR_CAPABILITIES,
      tools: EMPTY_TOOLS,
      reasons: EMPTY_REASONS,
    };
  }
  // 运行期未知模型：fail-closed，不声明任何角色专属工具。
  return {
    capabilities: NOMINATOR_CAPABILITIES,
    tools: EMPTY_TOOLS,
    reasons: [
      reason("role-tools-model-unknown", "role.nominator.tools.modelUnknown", {
        governanceModel: String(governanceModel),
      }),
    ],
  };
}

// —————————————————————— dispatch（R-2：只做硬身份/存在性） ——————————————————————

function dispatchDeny(code: string, messageKey: string, details?: unknown): RoleDispatchPolicy {
  return { decision: deny(code, messageKey, details) };
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * `dispatch()`：nominator 侧的硬身份/存在性判定。
 *
 * 语义（R-2）：本模块只回答与 nominator 相关的派发——
 *  - 目标是 nominator：只有真实来源 `chief` 的普通任务派发可通过；报告期望回到创建者 `chief`；
 *  - 来源是 nominator：nominator 不派发（旧 oracle：`unknown-source`）；
 *  - 其它 (source,target) 组合不属于本模块范围 ⇒ deny（由对应角色模块/引擎回答）。
 *
 * 与旧 `evaluateDispatchAuthorization` 的差异（E1 差分列明）：
 *  1. 旧 oracle 对 chief→builtin 目标不检查 `targetExists`；本模块按 E0 §3.5「目标不存在 ⇒ deny」
 *     要求 `targetExists === true`（fail-closed）。
 *  2. 旧 oracle 的 `convener→builtin(verifier)` 属于 convener 模块/引擎；本模块对非 nominator 目标
 *     一律 `dispatch-not-in-module-scope`。
 * hub/legacy/review 路由、convener run/module 规则、报告时点均不在本函数（R-2）。
 */
function dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
  const sourceRoleId = input?.sourceRoleId;
  const targetRoleId = input?.targetRoleId;
  const targetKind = input?.targetKind;
  const targetExists = input?.targetExists;

  if (sourceRoleId !== undefined && !isNonEmptyText(sourceRoleId)) {
    return dispatchDeny("dispatch-input-invalid", "role.nominator.dispatch.inputInvalid", {
      field: "sourceRoleId",
    });
  }
  if (!isNonEmptyText(targetRoleId)) {
    return dispatchDeny("dispatch-input-invalid", "role.nominator.dispatch.inputInvalid", {
      field: "targetRoleId",
    });
  }
  if (targetKind !== "project" && targetKind !== "built-in-governance") {
    return dispatchDeny("dispatch-input-invalid", "role.nominator.dispatch.inputInvalid", {
      field: "targetKind",
    });
  }
  if (targetExists !== undefined && typeof targetExists !== "boolean") {
    return dispatchDeny("dispatch-input-invalid", "role.nominator.dispatch.inputInvalid", {
      field: "targetExists",
    });
  }

  if (sourceRoleId !== undefined && sourceRoleId === targetRoleId) {
    return dispatchDeny("self-dispatch", "role.nominator.dispatch.selfDispatch", {
      roleId: sourceRoleId,
    });
  }

  // 来源缺失/未知：旧 oracle 的 `unknown-source`（只有 chief/convener 可派发）。
  if (sourceRoleId === undefined || (sourceRoleId !== "chief" && sourceRoleId !== "convener")) {
    return dispatchDeny("unknown-source", "role.nominator.dispatch.unknownSource");
  }

  // 非 nominator 目标：不在本模块范围（由目标角色模块/引擎回答）。
  if (targetRoleId !== "nominator") {
    return dispatchDeny("dispatch-not-in-module-scope", "role.nominator.dispatch.notInModuleScope", {
      targetRoleId,
    });
  }

  if (sourceRoleId === "chief") {
    if (targetKind !== "built-in-governance") {
      return dispatchDeny(
        "chief-to-project-forbidden",
        "role.nominator.dispatch.chiefToProjectForbidden",
      );
    }
    if (targetExists !== true) {
      return dispatchDeny("target-card-missing", "role.nominator.dispatch.targetCardMissing", {
        targetRoleId,
      });
    }
    return { decision: { allow: true }, reportToRoleId: "chief" };
  }

  // sourceRoleId === "convener"：旧 oracle 禁止 convener 向 nominator 等内置角色派发。
  if (targetKind === "built-in-governance") {
    return dispatchDeny(
      "convener-target-forbidden",
      "role.nominator.dispatch.convenerTargetForbidden",
    );
  }
  // 目标 id 是内置 nominator，却声明为 project：输入自相矛盾，fail-closed。
  return dispatchDeny("dispatch-input-invalid", "role.nominator.dispatch.inputInvalid", {
    field: "targetKind",
    reason: "built-in-target-declared-project",
  });
}

// —————————————————————— preflight（appointment/D3/三文档写卡前置） ——————————————————————

/**
 * `preflight` 覆盖的动作只有 `appointment`（E0 §3.4 nominator 行）。
 *
 * 事实包（E0 D4）：宿主已核验的普通 JSON；本模块只读、不重新采集/推断/补造。
 * 必填键缺失/未知键/已提供键类型不符 ⇒ deny；可选诊断键（`intentEntryConsistent`，E2 D-1）缺失不拒绝。
 * 事实键的精确 schema 登记在 `角色卡/nominator-code/api-spec.md`（E0 Q13：api-spec 登记 + 测试冻结）。
 *
 * **本模块不实现** resolveWrite、边界解析、stable-write 机制或账本读取；也不替代 Service 的最终
 * 校验（`prepareRoleActivation` / `validateRoleDocumentsSnapshot` / `validateBoundaryYamlText`）。
 * 这里只把宿主已核验的前置事实组合成角色侧纯策略判定；`allow: true` 不是权限票。
 *
 * 两个阶段（事实 `stage`）：
 *  - `d3-card`：发招人决定卡（D3）前的名单/卡面形状前置；
 *  - `role-documents`：三文档写卡/激活前的 D3/计划/文档结构前置。
 *
 * E2 接口评审 D-1（2026-11-07，处置 (a)）：`intentEntryConsistent` 是**可选诊断事实**。
 * 旧 D3 卡/激活路径（`validateAppointmentCardAgainstRoster` / `prepareRoleActivation`）不校验
 * 意图入口一致性；`run-role.ts:1519` 只把 `readIntentEntryFacts` 的结果用于 judge 上下文，
 * 解析失败不阻断发卡。为保持 B1 E2.2 零差异，本模块不要求该键、也不据其值拒绝；提供时只做
 * 布尔类型校验（事实包通用纪律），缺失或 `false` 一律放行。宿主可自行记录/展示诊断。
 */

type FactKind =
  | "boolean"
  | "positive-integer"
  | "sha256"
  | "non-empty-string"
  | "slug"
  | "string-array"
  | "unique-string-array"
  | "non-empty-unique-string-array"
  | "d3-by";

/**
 * 公共事实键的**类型**登记：键出现即校验类型；是否必填由 `COMMON_REQUIRED_KEYS` 决定。
 *
 * `intentEntryConsistent`（E2 D-1）：可选诊断事实。旧 D3 卡/激活路径不校验意图入口一致性，
 * 因此本模块不得要求它、也不得据其值拒绝；保留键登记仅用于「提供时类型必须是 boolean」。
 */
const COMMON_FACT_KINDS: Readonly<Record<string, FactKind>> = Object.freeze({
  flowId: "slug",
  intentEntryConsistent: "boolean",
  rosterFound: "boolean",
  rosterVersion: "positive-integer",
  rosterSha256: "sha256",
  rosterRoleIds: "non-empty-unique-string-array",
  rosterEnvBootstrapOmitted: "boolean",
  rosterContainsBuiltInRoleIds: "boolean",
});

const D3_CARD_FACT_KINDS: Readonly<Record<string, FactKind>> = Object.freeze({
  d3CardMultiple: "boolean",
  d3CardOptionRoleIds: "unique-string-array",
  d3CardRecommendedRoleIds: "unique-string-array",
});

const ROLE_DOCUMENTS_FACT_KINDS: Readonly<Record<string, FactKind>> = Object.freeze({
  targetRoleId: "slug",
  targetIsBuiltIn: "boolean",
  d3Present: "boolean",
  d3By: "d3-by",
  d3TargetRoleIds: "unique-string-array",
  d3RosterVersion: "positive-integer",
  d3RosterSha256: "sha256",
  d3DecisionId: "non-empty-string",
  operationId: "non-empty-string",
  planCompleted: "boolean",
  planRoleIds: "unique-string-array",
  cardPath: "non-empty-string",
  cardSha256: "sha256",
  boundaryMdPath: "non-empty-string",
  boundaryMdSha256: "sha256",
  boundaryYamlPath: "non-empty-string",
  boundaryYamlSha256: "sha256",
  boundaryWithinRoleModules: "boolean",
  boundaryMdYamlSynchronized: "boolean",
  roleCardRequiredSections: "boolean",
});

/**
 * 两阶段共同**必填**键。
 *
 * E2 D-1：`intentEntryConsistent` 不在此表——它是可选诊断事实，缺失不得拒绝（与旧路径等价）。
 */
const COMMON_REQUIRED_KEYS: readonly string[] = Object.freeze([
  "stage",
  "flowId",
  "rosterFound",
  "rosterVersion",
  "rosterSha256",
  "rosterRoleIds",
  "rosterEnvBootstrapOmitted",
  "rosterContainsBuiltInRoleIds",
]);

const D3_CARD_REQUIRED_KEYS: readonly string[] = Object.freeze([
  ...COMMON_REQUIRED_KEYS,
  "d3CardMultiple",
  "d3CardOptionRoleIds",
  "d3CardRecommendedRoleIds",
]);

const ROLE_DOCUMENTS_REQUIRED_KEYS: readonly string[] = Object.freeze([
  ...COMMON_REQUIRED_KEYS,
  "targetRoleId",
  "targetIsBuiltIn",
  "d3Present",
  "d3By",
  "d3TargetRoleIds",
  "d3RosterVersion",
  "d3RosterSha256",
  "d3DecisionId",
  "operationId",
  "planCompleted",
  "planRoleIds",
  "cardPath",
  "cardSha256",
  "boundaryMdPath",
  "boundaryMdSha256",
  "boundaryYamlPath",
  "boundaryYamlSha256",
  "boundaryWithinRoleModules",
  "boundaryMdYamlSynchronized",
  "roleCardRequiredSections",
]);

const ALL_APPOINTMENT_FACT_KINDS: Readonly<Record<string, FactKind>> = Object.freeze({
  ...COMMON_FACT_KINDS,
  ...D3_CARD_FACT_KINDS,
  ...ROLE_DOCUMENTS_FACT_KINDS,
});

const ALL_APPOINTMENT_FACT_KEYS: ReadonlySet<string> = new Set([
  "stage",
  ...Object.keys(ALL_APPOINTMENT_FACT_KINDS),
]);

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyText(item));
}

function isUniqueStringArray(value: unknown): value is readonly string[] {
  return isStringArray(value) && new Set(value).size === value.length;
}

function matchesFactKind(value: unknown, kind: FactKind): boolean {
  switch (kind) {
    case "boolean":
      return typeof value === "boolean";
    case "positive-integer":
      return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
    case "sha256":
      return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
    case "non-empty-string":
      return isNonEmptyText(value);
    case "slug":
      return typeof value === "string" && isValidIntentId(value);
    case "string-array":
      return isStringArray(value);
    case "unique-string-array":
      return isUniqueStringArray(value);
    case "non-empty-unique-string-array":
      return isUniqueStringArray(value) && value.length > 0;
    case "d3-by":
      return value === "customer" || value === "chief-delegated" || value === "judge";
  }
}

function hasOwn(facts: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(facts, key);
}

function missingFactKeys(
  facts: Readonly<Record<string, unknown>>,
  required: readonly string[],
): string[] {
  return required.filter((key) => !hasOwn(facts, key) || facts[key] === undefined);
}

function invalidFactKeys(facts: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(facts).filter((key) => {
    const kind = ALL_APPOINTMENT_FACT_KINDS[key];
    return kind !== undefined && !matchesFactKind(facts[key], kind);
  });
}

function unknownFactKeys(facts: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(facts).filter((key) => !ALL_APPOINTMENT_FACT_KEYS.has(key));
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyText) : [];
}

function setDifference(
  left: readonly string[],
  right: readonly string[],
): { missing: string[]; extra: string[] } {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    missing: left.filter((id) => !rightSet.has(id)),
    extra: right.filter((id) => !leftSet.has(id)),
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function checkRosterFacts(record: Readonly<Record<string, unknown>>): RolePolicyDecision | undefined {
  const rosterRoleIds = asStringArray(record["rosterRoleIds"]);

  if (record["rosterContainsBuiltInRoleIds"] === true) {
    return deny(
      "appointment-roster-builtin-role",
      "role.nominator.preflight.rosterBuiltinRole",
    );
  }

  if (record["rosterEnvBootstrapOmitted"] !== true && !rosterRoleIds.includes("env-bootstrap")) {
    return deny(
      "appointment-roster-env-bootstrap-missing",
      "role.nominator.preflight.rosterEnvBootstrapMissing",
    );
  }
  if (record["rosterEnvBootstrapOmitted"] === true && rosterRoleIds.includes("env-bootstrap")) {
    return deny("appointment-roster-invalid", "role.nominator.preflight.rosterInvalid", {
      reason: "env-bootstrap-present-when-omitted",
    });
  }

  return undefined;
}

function checkD3CardStage(facts: Readonly<Record<string, unknown>>): RolePolicyDecision {
  const rosterRoleIds = asStringArray(facts["rosterRoleIds"]);
  const optionRoleIds = asStringArray(facts["d3CardOptionRoleIds"]);
  const recommendedRoleIds = asStringArray(facts["d3CardRecommendedRoleIds"]);

  const rosterDecision = checkRosterFacts(facts);
  if (rosterDecision !== undefined) return rosterDecision;

  if (facts["d3CardMultiple"] !== true) {
    return deny(
      "appointment-d3-card-not-multiple",
      "role.nominator.preflight.d3CardNotMultiple",
    );
  }

  if (!sameStringSet(optionRoleIds, rosterRoleIds)) {
    const diff = setDifference(rosterRoleIds, optionRoleIds);
    return deny(
      "appointment-d3-card-roster-mismatch",
      "role.nominator.preflight.d3CardRosterMismatch",
      { missing: diff.missing, extra: diff.extra },
    );
  }

  if (!sameStringSet(recommendedRoleIds, rosterRoleIds)) {
    const diff = setDifference(rosterRoleIds, recommendedRoleIds);
    return deny(
      "appointment-d3-card-recommended-mismatch",
      "role.nominator.preflight.d3CardRecommendedMismatch",
      { missing: diff.missing, extra: diff.extra },
    );
  }

  return { allow: true };
}

function checkRoleDocumentsStage(facts: Readonly<Record<string, unknown>>): RolePolicyDecision {
  const targetRoleId = facts["targetRoleId"] as string;
  const rosterRoleIds = asStringArray(facts["rosterRoleIds"]);
  const d3TargetRoleIds = asStringArray(facts["d3TargetRoleIds"]);
  const planRoleIds = asStringArray(facts["planRoleIds"]);

  const rosterDecision = checkRosterFacts(facts);
  if (rosterDecision !== undefined) return rosterDecision;

  if (facts["targetIsBuiltIn"] === true) {
    return deny("appointment-target-builtin", "role.nominator.preflight.targetBuiltin", {
      targetRoleId,
    });
  }
  if (!rosterRoleIds.includes(targetRoleId)) {
    return deny(
      "appointment-target-not-in-roster",
      "role.nominator.preflight.targetNotInRoster",
      { targetRoleId },
    );
  }

  if (facts["d3Present"] !== true) {
    return deny("appointment-d3-missing", "role.nominator.preflight.d3Missing", {
      targetRoleId,
    });
  }
  // D3 选中集合必须全部是名单角色，且包含本次目标。
  if (d3TargetRoleIds.some((roleId) => !rosterRoleIds.includes(roleId))) {
    return deny("appointment-d3-invalid", "role.nominator.preflight.d3Invalid", {
      reason: "d3-selection-outside-roster",
    });
  }
  if (!d3TargetRoleIds.includes(targetRoleId)) {
    return deny("appointment-d3-not-selected", "role.nominator.preflight.d3NotSelected", {
      targetRoleId,
    });
  }
  if (
    facts["d3RosterVersion"] !== facts["rosterVersion"] ||
    facts["d3RosterSha256"] !== facts["rosterSha256"]
  ) {
    return deny("appointment-d3-roster-mismatch", "role.nominator.preflight.d3RosterMismatch", {
      targetRoleId,
    });
  }

  if (facts["planCompleted"] !== true) {
    return deny("appointment-plan-incomplete", "role.nominator.preflight.planIncomplete", {
      targetRoleId,
    });
  }
  if (!planRoleIds.includes(targetRoleId)) {
    return deny(
      "appointment-plan-target-missing",
      "role.nominator.preflight.planTargetMissing",
      { targetRoleId },
    );
  }

  const canonical = {
    cardPath: `角色卡/${targetRoleId}/role-card.md`,
    boundaryMdPath: `角色卡/${targetRoleId}/boundary.md`,
    boundaryYamlPath: `角色卡/${targetRoleId}/boundary.yaml`,
  } as const;
  const documentKeys = [
    "cardPath",
    "boundaryMdPath",
    "boundaryYamlPath",
  ] as const;
  const mismatchedDocuments = documentKeys.filter(
    (key) => facts[key] !== canonical[key],
  );
  if (mismatchedDocuments.length > 0) {
    return deny(
      "appointment-document-invalid",
      "role.nominator.preflight.documentInvalid",
      { keys: mismatchedDocuments },
    );
  }

  if (facts["boundaryWithinRoleModules"] !== true) {
    return deny(
      "appointment-boundary-scope-invalid",
      "role.nominator.preflight.boundaryScopeInvalid",
      { targetRoleId },
    );
  }
  if (facts["boundaryMdYamlSynchronized"] !== true) {
    return deny(
      "appointment-boundary-unsynchronized",
      "role.nominator.preflight.boundaryUnsynchronized",
      { targetRoleId },
    );
  }
  if (facts["roleCardRequiredSections"] !== true) {
    return deny(
      "appointment-role-card-sections-missing",
      "role.nominator.preflight.roleCardSectionsMissing",
      { targetRoleId },
    );
  }

  return { allow: true };
}

function checkAction(input: RolePreflightInput): RolePolicyDecision {
  if (input?.action !== "appointment") {
    return deny("action-not-covered", "role.preflight.actionNotCovered", {
      action: String(input?.action),
    });
  }

  const facts = input.facts as unknown;
  if (facts === null || typeof facts !== "object" || Array.isArray(facts)) {
    return deny(
      "appointment-facts-invalid",
      "role.nominator.preflight.factsInvalid",
      { reason: "facts-not-object" },
    );
  }
  const record = facts as Readonly<Record<string, unknown>>;

  const unknown = unknownFactKeys(record);
  if (unknown.length > 0) {
    return deny(
      "appointment-facts-unknown",
      "role.nominator.preflight.factsUnknown",
      { keys: unknown },
    );
  }

  const stage = record["stage"];
  if (stage === undefined) {
    return deny(
      "appointment-facts-missing",
      "role.nominator.preflight.factsMissing",
      { keys: ["stage"] },
    );
  }
  if (stage !== "d3-card" && stage !== "role-documents") {
    return deny(
      "appointment-stage-invalid",
      "role.nominator.preflight.stageInvalid",
      { stage: String(stage) },
    );
  }

  const required =
    stage === "d3-card" ? D3_CARD_REQUIRED_KEYS : ROLE_DOCUMENTS_REQUIRED_KEYS;
  const missing = missingFactKeys(record, required);
  if (missing.length > 0) {
    return deny(
      "appointment-facts-missing",
      "role.nominator.preflight.factsMissing",
      { keys: missing },
    );
  }

  const invalid = invalidFactKeys(record);
  if (invalid.length > 0) {
    return deny(
      "appointment-facts-invalid",
      "role.nominator.preflight.factsInvalid",
      { keys: invalid },
    );
  }

  if (record["flowId"] === undefined || !isValidIntentId(record["flowId"])) {
    return deny(
      "appointment-facts-invalid",
      "role.nominator.preflight.factsInvalid",
      { keys: ["flowId"] },
    );
  }
  // E2 D-1：`intentEntryConsistent` 是可选诊断事实，缺失或 false 一律放行（不得在此新增拒绝）；
  // 若提供，其 boolean 类型已由上方的 `invalidFactKeys` 校验。旧 D3 卡/激活路径不校验该事实。
  if (record["rosterFound"] !== true) {
    return deny("appointment-roster-missing", "role.nominator.preflight.rosterMissing");
  }

  return stage === "d3-card"
    ? checkD3CardStage(record)
    : checkRoleDocumentsStage(record);
}

// —————————————————————— context（appointment-write 卡数据 / 报告期望） ——————————————————————

const CONTEXT_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  Object.freeze({
    id: "nominator-appointment-card",
    text: [
      "## 招人决定卡（D3）",
      "工具：`request_choice(cardKind=appointment)`；必须多选（multiple=true）。",
      "flowId：真实 flowId（治理 slug）。",
      "选项：最新合法名单 `docs/proposals/<flowId>-roster-vN.md` 的 `roles[].id`，逐项列出。",
      "推荐集：同一名单角色集合；由应用从名单生成并校验，不由模型自报。",
      "规则：名单缺失/非法/版本或 hash 漂移不发卡；无 D3 不写卡；D3 未答可等待；真实 decisionId 原样使用；团队计划不能冒充 D3；不招名单外角色。",
      "提交 appointment 前先核意图入口：产品意图 frontmatter intentId、提案 frontmatter intentId 与 `docs/intents/<intentId>.md` 文件名三者一致且文件存在。",
    ].join("\n"),
  }),
  Object.freeze({
    id: "nominator-appointment-write",
    text: [
      "## appointment-write 卡数据（兼容通道）",
      "cardKind: `appointment-write`",
      "targetRoleId: <D3 选中的项目角色 id，非内置角色>",
      "decisionId: <真实 D3 decisionId；不得自报或伪造>",
      "preview（逐路径正文，三条都须齐备）：",
      "- `角色卡/<targetRoleId>/role-card.md`（含必填章节）",
      "- `角色卡/<targetRoleId>/boundary.md`（Section 1 与 YAML 同步）",
      "- `角色卡/<targetRoleId>/boundary.yaml`（顶层只认 role/entries/archived；role 与目录 id 一致）",
      "规则：只有真实 D3 选中、计划已完整、三文档正文齐备时才发；边界只能取该角色名下模块的文件/目录并集；不发 appointment-write 替代完整激活；当前主路径是直接写三文档后调用 `activateRoleDocuments`。",
    ].join("\n"),
  }),
  Object.freeze({
    id: "nominator-report-expectation",
    text: [
      "## 报告期望",
      "任务完成后必须用 `submit_report` 回短报，报告回 `task.created.from`（通常为 chief）。",
      "报告至少含：完成/阻塞状态、真实证据（D3/计划/三文档摘要、`activateRoleDocuments` 回执与 activationDigest）、遗留项。",
      "阻塞先报原创建者，不猜、不伪造批准/激活/完成；不要只结束回合。",
    ].join("\n"),
  }),
]);

/**
 * fixed 上下文段（T3「两条固定工作流路径」B2；v1.3 §3.4 nominator 行）。
 *
 * 只在 `context({matrix:"two-fixed-paths/v1"})` 下返回；`context({})`（无 matrix）与
 * `matrix:"legacy-v1"` 仍逐字返回上面的 legacy `CONTEXT_SECTIONS`（legacy 数据冻结）。
 * run-role fixed 会话把本段追加在旧卡文本之后；与旧卡文本冲突时以本段为准（fixed 语义）：
 *  - 人事任务由运营（convener）派发（幕僚 stage-request → 运营生产线派发，A7）；人事不派发；
 *  - 任命卡由幕僚呈；fixed 不发起 appointment / appointment-write 卡（fixedCards 空）；
 *  - 接到 A7/A8 激活任务后，按名单 + 提案决定机械建三文档并整单激活（activate_role_documents v2）；
 *  - 不自行增删角色、不改名单/方案、不招名单外角色、不批准提案/验收、不代客户决定。
 * 纯静态数据（无资源引用、不读盘）；不新增工具/卡。
 */
const FIXED_CONTEXT_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  Object.freeze({
    id: "nominator-fixed-duty",
    text: [
      "## 固定路径人事（two-fixed-paths/v1；与旧卡文本冲突时以本段为准）",
      "派发：固定路径的人事任务由运营（convener）派发（幕僚 stage-request → 运营生产线派发，A7）；完成后报告回 `task.created.from`（运营）。",
      "卡：任命确认卡由幕僚（chief）在 A10 呈交；固定路径不发起 appointment / appointment-write 卡（fixedCards 空；appointment-write 仅 legacy 兼容通道）。",
      "纪律：人事不派发任何任务；不自行增删角色；不招名单外的角色；不改名单/方案；不批准提案/验收、不代客户决定。",
    ].join("\n"),
  }),
  Object.freeze({
    id: "nominator-fixed-activation",
    text: [
      "## A7/A8 建卡与激活（fixed）",
      "接到 A7/A8 激活任务后，按最新名单 `docs/proposals/<flowId>-roster-vN.md`（只传 path；roster hash 由应用在激活时按实际字节计算）与 A6 提案决定（proposalDecisionId）机械处理；写卡前先核验名单/决定与任务事实一致。",
      "逐名单角色写 `角色卡/<roleId>/role-card.md`、`boundary.md`、`boundary.yaml`：角色卡必填章节齐备，boundary.md 与 boundary.yaml 同步，边界只能取该角色名下模块的文件/目录并集，模块属主唯一。",
      "对每个名单角色调用 `activate_role_documents` v2（targetRoleId、roster{path}、documents{card,boundaryMd,boundaryYaml}，**只传 path**）；roster/三文档 hash 由应用在激活前按实际字节计算并回填，模型不猜 hash、不得用 shell 计算；应用复核 roster 与 A6 documentRefs 一致性并记录真实 `role.activated`。",
      "名单/提案决定缺失或非法 ⇒ 不写卡，如实阻塞回运营；激活失败保留旧有效卡，不伪造激活或完成。",
    ].join("\n"),
  }),
  Object.freeze({
    id: "nominator-fixed-report",
    text: [
      "## 报告期望（fixed）",
      "任务完成后必须用 `submit_report` 回短报，报告回 `task.created.from`（固定路径通常为运营 convener）。",
      "报告至少含：完成/阻塞状态、真实证据（名单/提案决定、三文档摘要、`activate_role_documents` 回执与 activationDigest）、遗留项。",
      "阻塞先报原创建者，不猜、不伪造批准/激活/完成；不要只结束回合。",
    ].join("\n"),
  }),
]);

/**
 * `context()`：按派发矩阵选择提示段。
 *
 * - `matrix` 缺省 / `"legacy-v1"`：返回 legacy `CONTEXT_SECTIONS` **同一引用**（逐字旧段，
 *   向后兼容；未传 matrix 的既有调用方行为不变）；
 * - `matrix:"two-fixed-paths/v1"`：只返回 fixed 段（run-role fixed 会话追加注入；legacy 段不重复）。
 */
function context(input: RoleContextInput): readonly RoleContextSection[] {
  if (input?.matrix === "two-fixed-paths/v1") {
    return FIXED_CONTEXT_SECTIONS;
  }
  return CONTEXT_SECTIONS;
}

// —————————————————————— 唯一公开模块 ——————————————————————

/**
 * nominator 内置角色模块（`BuiltInRoleModule` 唯一公开形状；E0.3 §3.1）。
 *
 * 模块之间零 import；本模块只依赖 Model/shared public entry。E2 由 `governance-roles.ts`
 * 门面装配为 `BuiltInRoleModuleMap` 的 `nominator` 项，并删除旧内联规格。
 */
export const nominatorRoleModule: BuiltInRoleModule = {
  id: "nominator",
  displayName: "人事",
  function: "nomination",
  card: {
    text: NOMINATOR_CARD_TEXT,
    entries: NOMINATOR_ENTRIES,
    preauthorizedDirs: NOMINATOR_PREAUTHORIZED_DIRS,
    forbiddenWritePaths: NOMINATOR_FORBIDDEN_WRITE_PATHS,
  },
  capabilities: NOMINATOR_CAPABILITIES,
  cards: NOMINATOR_CARDS,
  fixedCards: NOMINATOR_FIXED_CARDS,
  tools,
  dispatch,
  preflight: { checkAction },
  context,
};

export default nominatorRoleModule;

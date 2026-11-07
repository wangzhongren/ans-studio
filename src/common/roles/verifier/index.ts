// 内置治理角色模块：质检（verifier）——唯一 public entry。
//
// 契约冻结：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`
// （E0.3，685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）
// §3.1（`BuiltInRoleModule` + 14 `RoleToolId` + R-2）、§3.2 verifier 行、§3.3（纯数据/纯策略）、
// §3.4（preflight 事实包）、§3.5（错误语义）、§10.2 D8/D10。
//
// 模块纪律（团队计划 §4.4⑥ / H1 边界）：
//  - 只依赖 `src/model/` 与 `src/common/shared/` 的 public entry；本文件只依赖 Model；
//  - 唯一 public entry 为 `index.ts`；模块根不散放其他文件；
//  - 纯 TypeScript 数据与纯策略函数：无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；
//  - 缺事实/未知一律 deny（fail-closed）；返回值只是判定/数据，不携带权限；
//  - `capabilities` 是本模块 spec 的唯一真源（E0 D10），`tools()` 输出是它的派生，不得两份不一致；
//  - `cards` 只列当前有效卡种（E0 D8）；旧 legacy token 不进模块数据。
//
// 职责边界：本模块只维护 review 目标/最终候选/CID/criteria 的**角色侧纯策略**、acceptance 卡数据与
// 报告期望。**不实现验收判定**（归内置独立验收）、**不做 Git 候选证据核验**、不读写账本——
// 这些仍在 Service/桌面路由与独立验收；preflight allow 也不替代 Service/Provider 的最终校验。

import type { BoundaryEntry } from "../../../model/boundary.ts";
import type {
  BuiltInRoleModule,
  GovernanceCapabilities,
  RoleContextInput,
  RoleContextSection,
  RoleDispatchPolicy,
  RoleDispatchPolicyInput,
  RolePolicyDecision,
  RolePreflightHooks,
  RolePreflightInput,
  RoleToolPolicy,
  TrustedToolPolicyInput,
} from "../../../model/role.ts";
import { isDispatchTaskReviewTarget, isTaskReviewBasisRef } from "../../../model/runtime.ts";

// —————————————————————— 卡 / 边界 / capabilities / cards（旧规格逐字迁移）——————————————————

/**
 * 角色卡正文：旧 `governance-roles.ts::VERIFIER_CARD_TEXT` 的逐字迁移（含共享纪律段展开）。
 * E1 过渡期旧引擎仍是权威；差分 fixture（`test/roles/verifier/`）逐字对照旧 oracle。
 */
const VERIFIER_CARD_TEXT = [
  "# 角色：质检（内置角色）",
  "",
  "职能：独立质量核对与验收执行者——新任务仅由 Chief 创建、收报和收口；不批准、不代客户验收。",
  "- 收到验收任务：读需求依据/名单/实现证据；执行核对（真实运行/测试/查证据）；报告写 `docs/quality/<flowId>-report-v1.md`，证据附件写 `docs/verification/`。",
  "- 独立质检结论及物证必须由你真实核对；缺证据写 insufficient evidence，不让幕僚代造通过。发 `request_choice(cardKind=acceptance, flowId, accept/reject)`，在幕僚唯一入口由客户或有效委托的真实 chief 作最终业务选择；你不得自批、不得代选，chief-delegated 不冒充客户决定，也不替代你的独立质检判断。",
  "- 直接能力以本会话实际注入的工具为准：未提供、unavailable 或无真实回执时，报告「实现中/待注入」或阻塞；不得虚构工具、身份、批准、激活或完成，不得改发已取消的版本升级/VCA 批拒、修正案逐项/最终、appointment-write、团队计划确认卡。产品内直接能力不改 ANS 技能及其治理闸门。",
  "- Git只走实际注入的结构化 `git_query` / `git_candidate` / `git_publish`：查询限宿主已核可读repo/ref/版本路径与有界模板，修改限本人当前可信scope及本任务应用分配的候选ref/现场；author、候选boundary、分支名不授新权。候选 prepared 不等发布、激活、交付或验收；发布只认应用完整差异/当前授权/expected-old核验后的真实回执。不得用裸Git、shell/脚本、直接写.git/common-dir/他人worktree或伪造OID/记录绕过；工具未注入如实待注入，来源、隔离、停稳或提交结果unknown保持blocked并交责任链核实。",
  "- 回退与报告：保留task/run、原基线/候选完整OID、拒绝code/missing/owner和真实错误证据，报告回 task.created.from；责任owner是修复线索，不授权你互派或代改。对应owner在原合法范围真实修复后，重新核当前依据/权限/指定最终OID再恢复；缺证据不补造批准/ref/停稳，不重开已取消卡。无新信息不重试，原来源链预算不清零；危险或未知外部副作用零自动重派，取消执行须确认实际停止，不释放成功依赖。",
  "- Chief枢纽：新 Product、Rapporteur、Nominator、Convener、Verifier 任务全部由 Chief 创建、接收正式报告并按真实创建者收口；Convener 仅创建和管理项目实现 worker，worker 先回 Convener，不能解决再报 Chief。历史任务仍按真实 task.created.from 报告/收口，不重写旧 creator、parent 或 accepted。普通 Chief→builtin 派发可只读准备、并行、跳过、返工、改类或停止，不以 M0、前序 close、plan/D3 为通用派发票；具体 write/activate/publish/execute 仍核适用 M0/仓库来源、plan/D3、当前 scope/权限、冻结8refs、指定最终OID/criteria/质量和真实 stopfacts，任务本身不授执行权。",
  "- 质检Git职责与回退：只在自身quality/verification证据scope产候选，按原标准核指定最终完整OID及真实环境；候选漂移/证据缺口报原创建者及实际owner，标准缺项由原创建者组织策划/产品。保留被验OID、标准和真实失败，不修实现/解产品冲突、不发布被验主干；补证/修复产生新指定OID后重验，证据不足或内容已变不判通过，必要时停止核验。",
  "- 新任务的结果（报告路径、指定OID/criteria、结论、证据）必须 submit_report 回 Chief；证据齐且真实核验通过才 done，缺证或失败正式 blocked/failed 回 Chief，不静默等待；Chief 组织原owner修复再派指定新OID核验。历史任务保留真实创建者回报/收口，不重写旧链；你不替运营发布、不实现、不派发、不写其他角色资料。",
  "- 证据最多真实运行截图（关 DEBUG；记录 sha256/候选/命令）；不要求录屏，缺录屏不判失败。",
  "- 不依赖 flow/gate/ledger（已撤除）；不写其他角色资料、不创建角色。",
  "- 收到幕僚派发的任务：完成后**必须**用 `submit_report` 回短报（完成/未完成/证据/遗留），不要只结束回合。",
  "可写：`docs/quality/`、`docs/verification/`、`docs/governance/verifier/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/intents/**`、`docs/product/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/scheduling/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

/** Section 1 边界条目（旧注册表逐字；root 恒为 project）。 */
const VERIFIER_ENTRIES: readonly BoundaryEntry[] = Object.freeze([
  Object.freeze({
    root: "project" as const,
    path: "docs/quality/",
    kind: "directory" as const,
    purpose: "质量记录 / 可选核对（D 批目标写区）",
  }),
  Object.freeze({
    root: "project" as const,
    path: "docs/verification/",
    kind: "directory" as const,
    purpose: "可选核对证据附件（不是验收结论）",
  }),
  Object.freeze({
    root: "project" as const,
    path: "docs/governance/verifier/",
    kind: "directory" as const,
    purpose: "质检的治理工作记录",
  }),
]);

/** 会话初始 writeSet 预置目录（旧注册表逐字；预授权不跳过边界/禁写/治理门禁）。 */
const VERIFIER_PREAUTHORIZED_DIRS: readonly string[] = Object.freeze([
  "docs/quality/",
  "docs/verification/",
  "docs/governance/verifier/",
]);

/**
 * 先于 `resolveWrite` 判定的禁写前缀（旧注册表逐字展开：应用独占写路径 + 内置角色目录前缀 +
 * 质检自身禁写清单）。数据只表达「谁不可写」，不构成写权限。
 */
const VERIFIER_FORBIDDEN_WRITE_PATHS: readonly string[] = Object.freeze([
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
  "docs/intents/",
  "docs/proposals/",
  "docs/contracts/",
  "docs/nominations/",
  "docs/skills/",
  "docs/mcp/",
  "docs/workflow.md",
]);

const VERIFIER_CARD = Object.freeze({
  text: VERIFIER_CARD_TEXT,
  entries: VERIFIER_ENTRIES,
  preauthorizedDirs: VERIFIER_PREAUTHORIZED_DIRS,
  forbiddenWritePaths: VERIFIER_FORBIDDEN_WRITE_PATHS,
});

/**
 * 能力位**唯一真源**（E0 D10）：`tools()` 返回同一引用，不得两份不一致。
 * 旧注册表逐字：customerInput true；dispatchTask/roleStatus/sessionTail/installSkill/installMcp false；
 * shell 为 `operator-approve`（只表达注入档位，执行与安全边界仍由引擎判定）。
 */
const VERIFIER_CAPABILITIES: GovernanceCapabilities = Object.freeze({
  customerInput: true,
  dispatchTask: false,
  roleStatus: false,
  sessionTail: false,
  installSkill: false,
  installMcp: false,
  shell: "operator-approve",
});

/**
 * 当前有效卡种（E0 D8；旧 `run-role.ts::TRIO_CARD_KINDS.verifier = ["acceptance"]`）。
 * 不含 legacy `"write"` 等 token；E2 门面负责旧数据兼容映射。
 */
const VERIFIER_CARDS = Object.freeze(["acceptance"] as const);

const EMPTY_TOOL_IDS: readonly [] = Object.freeze([]);
const EMPTY_REASONS: readonly [] = Object.freeze([]);

// —————————————————————— 稳定内部码 / i18n key（API 登记见 api-spec.md）——————————————————————

const DISPATCH_CODES = Object.freeze({
  targetNotVerifier: "target-not-verifier",
  selfDispatch: "self-dispatch",
  unknownSource: "unknown-source",
  chiefToProjectForbidden: "chief-to-project-forbidden",
  targetKindMismatch: "target-kind-mismatch",
  targetMissing: "target-card-missing",
});

const DISPATCH_MESSAGE_KEYS = Object.freeze({
  targetNotVerifier: "role.verifier.dispatch.targetNotVerifier",
  selfDispatch: "role.verifier.dispatch.selfDispatch",
  unknownSource: "role.verifier.dispatch.unknownSource",
  chiefToProjectForbidden: "role.verifier.dispatch.chiefToProjectForbidden",
  targetKindMismatch: "role.verifier.dispatch.targetKindMismatch",
  targetMissing: "role.verifier.dispatch.targetMissing",
});

const PREFLIGHT_CODES = Object.freeze({
  actionNotCovered: "action-not-covered",
  reviewFactsMissing: "review-facts-missing",
  reviewFactsUnknownKey: "review-facts-unknown-key",
  reviewTargetInvalid: "review-target-invalid",
  reviewCriteriaInvalid: "review-criteria-invalid",
});

const PREFLIGHT_MESSAGE_KEYS = Object.freeze({
  actionNotCovered: "role.verifier.preflight.actionNotCovered",
  reviewFactsMissing: "role.verifier.preflight.reviewFactsMissing",
  reviewFactsUnknownKey: "role.verifier.preflight.reviewFactsUnknownKey",
  reviewTargetInvalid: "role.verifier.preflight.reviewTargetInvalid",
  reviewCriteriaInvalid: "role.verifier.preflight.reviewCriteriaInvalid",
});

/**
 * `review` 动作允许读取的事实键（api-spec 登记；E0.3 §3.4/D4：只允许读取登记键，
 * 任何未登记键 ⇒ deny，不得静默忽略）。
 */
const REVIEW_FACT_KEYS: readonly string[] = Object.freeze(["reviewTarget", "criteria"]);

function deny(code: string, messageKey: string, details?: unknown): { readonly allow: false; readonly code: string; readonly messageKey: string; readonly details?: unknown } {
  return details === undefined ? { allow: false, code, messageKey } : { allow: false, code, messageKey, details };
}

// —————————————————————— tools()：无额外 RoleToolId ——————————————————————

/**
 * 工具/能力装配策略（纯函数）。
 *
 * verifier 没有 `RoleToolId` 闭集内的专属额外工具（契约 §3.1 14 项允许角色表无一包含 verifier；
 * D1 registry `ROLE_TOOL_CATALOG` 由差分测试逐项断言）。空声明是合法声明：引擎装配侧
 * `validateRoleToolDeclaration("verifier", [])` 必须 `allow: true`、`tools: []`。
 *
 * 旧 `run-role.ts` 的 verifier 门控只涉及能力位/customerInput/shell 与共有工具（`projectState`、
 * `governanceMatrix`），后者由引擎按 `builtInGovernance` 注入，不在 `RoleToolId` 内；本模块不重复声明。
 * `single` 治理模型下 verifier 不装配；本函数仍返回同一空集（不携带权限，不按模型造工具）。
 */
function toolsOf(_input: TrustedToolPolicyInput): RoleToolPolicy {
  return {
    capabilities: VERIFIER_CAPABILITIES,
    tools: EMPTY_TOOL_IDS,
    reasons: EMPTY_REASONS,
  };
}

// —————————————————————— dispatch()：R-2 硬身份/存在性 + 报告期望 ——————————————————————

/**
 * 派发策略（纯函数；E0 R-2 范围收窄）。
 *
 * 本模块描述「向 verifier 派发」这一关系的**硬身份/存在性**：
 *  - target 必须是内置治理角色 `verifier`（targetRoleId + targetKind 一致）；
 *  - 来源必须是真实可派发来源：旧硬授权 `evaluateDispatchAuthorization` 允许 `chief`（hub）与
 *    `convener`（历史路径）向 verifier 派发；其他来源 fail-closed；
 *  - targetExists 必须显式为 true（宿主核验；缺省/未知 ⇒ 拒绝，契约 §3.1）；
 *  - 允许时 `reportToRoleId` = 真实来源（派发时点的真实创建者），仅供差分期望，不驱动实际路由
 *    （实际路由仍由 `reportTargetForTaskCreator` 决定）。
 *
 * **不在此实现**：hub/legacy/review 路由、controller resume、任务创建、D3/run/module 规则、
 * 报告时点——全部留在引擎/Service/编排公开只读入口（R-2）。
 *
 * 与旧 oracle 的已知差异（契约明确项，证据登记）：旧 `evaluateDispatchAuthorization` 对内置目标
 * 不读取单独的 `targetExists` 事实；本模块按冻结契约要求缺省即拒绝。旧函数也不表达
 * 「targetRoleId=verifier 但 targetKind=project」这类不可能事实；本模块 fail-closed。
 */
function dispatchOf(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
  const { sourceRoleId, targetRoleId, targetKind, targetExists } = input;

  if (targetRoleId !== "verifier") {
    return { decision: deny(DISPATCH_CODES.targetNotVerifier, DISPATCH_MESSAGE_KEYS.targetNotVerifier) };
  }
  if (sourceRoleId !== undefined && sourceRoleId === targetRoleId) {
    return { decision: deny(DISPATCH_CODES.selfDispatch, DISPATCH_MESSAGE_KEYS.selfDispatch) };
  }
  if (sourceRoleId !== "chief" && sourceRoleId !== "convener") {
    return { decision: deny(DISPATCH_CODES.unknownSource, DISPATCH_MESSAGE_KEYS.unknownSource) };
  }
  if (targetKind !== "built-in-governance") {
    // 旧硬授权：chief → 项目目标是结构性禁止；其余不可能是 verifier（内置 id 不能作项目角色 id）。
    return {
      decision:
        sourceRoleId === "chief"
          ? deny(DISPATCH_CODES.chiefToProjectForbidden, DISPATCH_MESSAGE_KEYS.chiefToProjectForbidden)
          : deny(DISPATCH_CODES.targetKindMismatch, DISPATCH_MESSAGE_KEYS.targetKindMismatch),
    };
  }
  if (targetExists !== true) {
    return { decision: deny(DISPATCH_CODES.targetMissing, DISPATCH_MESSAGE_KEYS.targetMissing) };
  }
  return { decision: { allow: true }, reportToRoleId: sourceRoleId };
}

// —————————————————————— preflight：review 目标/最终候选/CID/criteria ——————————————————————

function factRecordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

/**
 * `review` 动作的角色侧条件（纯函数；只读宿主已核验事实，不采集/不推断/不补造）。
 *
 * 登记事实键（api-spec 冻结，恰好这两个键；任何未登记键 ⇒ deny）：
 *  - `reviewTarget`: 最终 review 的期望目标 `DispatchTaskReviewTarget` 形状
 *    `{ operationId, candidate }`。`operationId` 即期望 CID；`candidate` 即最终候选完整 OID
 *    （`{ objectFormat: "sha1"|"sha256", hex: 40/64 hex }`）。普通调查任务没有最终 CID，
 *    不应调用本动作。形状校验复用 Model 的 `isDispatchTaskReviewTarget`（单一真源）。
 *  - `criteria`: 1..16 个冻结 `GitEvidenceRef`（`{ oid, path, sha256 }`，字面路径、64 hex、
 *    去重（objectFormat+hex+path））。与 `reviewTarget` 组合成 `TaskReviewBasisRef` 形状后复用
 *    Model 的 `isTaskReviewBasisRef`（单一真源），不复制 Service/Provider 证据核验。
 *
 * 事实包纪律（E0.3 §3.4/D4；E2 接口评审 P5 修复）：
 *  - 只允许读取上述登记键；**任何未登记键 ⇒ deny** `review-facts-unknown-key`
 *    （`details = { action:"review", unknownKeys:sorted }`），不得静默忽略。
 *    这防止 `accepted`/`passed`/`approved` 等验收结论事实被走私进 preflight 事实包。
 *  - 未登记键先于缺键/形状判定：同一事实包既含未登记键又形状不符时，先报
 *    `review-facts-unknown-key`（fail-closed，不读取其值）。
 *
 * **不实现**：验收判定（accept/reject）、证据内容核验、Git 对象/账本核对、report 内容判定。
 * `accepted`/`passed`/`approved` 等键的值一律不被读取，也不能把一个形状非法的 review 目标
 * 变成 allow；preflight allow 只表示「角色侧条件不反对」，不替代 Service/Provider 最终校验，
 * 更不是验收通过。
 */
function reviewFactsDecision(facts: Readonly<Record<string, unknown>>): RolePolicyDecision {
  const unknownKeys = Object.keys(facts)
    .filter((key) => !REVIEW_FACT_KEYS.includes(key))
    .sort();
  if (unknownKeys.length > 0) {
    return deny(PREFLIGHT_CODES.reviewFactsUnknownKey, PREFLIGHT_MESSAGE_KEYS.reviewFactsUnknownKey, {
      action: "review",
      unknownKeys: Object.freeze(unknownKeys),
    });
  }
  const reviewTarget = facts["reviewTarget"];
  const criteria = facts["criteria"];
  if (reviewTarget === undefined || criteria === undefined) {
    const missing: string[] = [];
    if (reviewTarget === undefined) missing.push("reviewTarget");
    if (criteria === undefined) missing.push("criteria");
    return deny(PREFLIGHT_CODES.reviewFactsMissing, PREFLIGHT_MESSAGE_KEYS.reviewFactsMissing, {
      missing,
    });
  }
  if (!isDispatchTaskReviewTarget(reviewTarget)) {
    return deny(PREFLIGHT_CODES.reviewTargetInvalid, PREFLIGHT_MESSAGE_KEYS.reviewTargetInvalid, {
      fact: "reviewTarget",
    });
  }
  // 与旧 oracle 同一形状来源：reviewTarget.operationId = CID、candidate = 最终候选、criteria = 冻结标准。
  const reviewBasis = {
    kind: "git-candidate-review",
    candidateOperationId: reviewTarget.operationId,
    candidate: reviewTarget.candidate,
    criteria,
  };
  if (!isTaskReviewBasisRef(reviewBasis)) {
    return deny(PREFLIGHT_CODES.reviewCriteriaInvalid, PREFLIGHT_MESSAGE_KEYS.reviewCriteriaInvalid, {
      fact: "criteria",
    });
  }
  return { allow: true };
}

const VERIFIER_PREFLIGHT: RolePreflightHooks = Object.freeze({
  checkAction(input: RolePreflightInput): RolePolicyDecision {
    if (input.action !== "review") {
      return deny(PREFLIGHT_CODES.actionNotCovered, PREFLIGHT_MESSAGE_KEYS.actionNotCovered, {
        action: input.action,
      });
    }
    const facts = factRecordOf(input.facts);
    if (facts === undefined) {
      return deny(PREFLIGHT_CODES.reviewFactsMissing, PREFLIGHT_MESSAGE_KEYS.reviewFactsMissing, {
        missing: ["reviewTarget", "criteria"],
      });
    }
    return reviewFactsDecision(facts);
  },
});

// —————————————————————— context()：acceptance 卡数据 / 报告期望（静态模板）——————————————————————

/**
 * `acceptance` 卡数据（静态模板；不嵌入运行时秘密/账本/证据）。
 *
 * 旧默认卡种识别（`run-role.ts::defaultGovernanceChoiceCardKind`：verifier 需要含 `accept` 选项才
 * 默认成 acceptance）与白名单（`TRIO_CARD_KINDS.verifier = ["acceptance"]`）是数据来源；本段只是
 * 提示宿主/模型实际卡形状，不构成发卡权限（发卡仍由引擎校验卡种/归属/选项）。
 */
const ACCEPTANCE_CARD_SECTION: RoleContextSection = Object.freeze({
  id: "verifier-acceptance-card",
  text: [
    "验收卡（acceptance）数据：",
    '- 卡种：cardKind="acceptance"（choice 卡）；这是质检当前唯一允许发起的治理卡种。',
    "- 归属：必须同时携带 flowId（以及可用时 taskId）；flowId 为小写 slug。",
    "- 选项：accept（接受）/ reject（拒绝），至少包含 accept；不得自造其他选项或卡型。",
    "- 通道：只在幕僚（chief）唯一客户入口呈现；客户本人或有效委托的真实 chief 作最终业务选择。",
    "- 纪律：你（质检）不得自批、不得代选；沉默、未回复、默认勾选、既有做法或他人转述都不算客户决定；",
    "  chief-delegated 不冒充客户决定，也不替代你的独立质检判断。",
    "- 前置：独立质检结论与物证必须真实核对；缺证据写 insufficient evidence；不得用 acceptance 卡冒充通过。",
  ].join("\n"),
});

/** 报告期望（静态模板；与角色卡 `submit_report` 纪律一致）。 */
const REPORT_EXPECTATION_SECTION: RoleContextSection = Object.freeze({
  id: "verifier-report-expectation",
  text: [
    "报告期望：",
    "- 新任务仅由 Chief 创建、收报与收口；历史任务保留真实 task.created.from，不改写旧链。",
    "- 质量报告写 docs/quality/<flowId>-report-vN.md；证据附件写 docs/verification/（不是验收结论）。",
    "- 完成后用 submit_report 回真实创建者（Chief），写明报告路径、指定最终 OID/criteria、结论与证据。",
    "- 证据齐且真实核验通过才 done；缺证或失败正式 blocked/failed 回 Chief，不静默等待。",
    "- 复核以指定完整 OID 与冻结 criteria 为准：最终 review 的 review target 只表达期望 CID/最终候选/",
    "  criteria；实际 controller/固定 CID/criteria 由应用核验并记录，你不自行补造。候选漂移或内容已变不判通过。",
  ].join("\n"),
});

const VERIFIER_CONTEXT_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  ACCEPTANCE_CARD_SECTION,
  REPORT_EXPECTATION_SECTION,
]);

function contextOf(_input: RoleContextInput): readonly RoleContextSection[] {
  // 纯静态模板：忽略输入中的治理模型/可选事实（不读取未登记键，不做 I/O）。
  return VERIFIER_CONTEXT_SECTIONS;
}

// —————————————————————— 唯一 public entry 导出 ——————————————————————

/** 六个内置角色模块之一的 verifier 模块（本文件唯一导出；E2 由门禁引擎门面装配）。 */
export const verifierRoleModule: BuiltInRoleModule = Object.freeze({
  id: "verifier",
  displayName: "质检",
  function: "verification",
  card: VERIFIER_CARD,
  capabilities: VERIFIER_CAPABILITIES,
  cards: VERIFIER_CARDS,
  tools: toolsOf,
  dispatch: dispatchOf,
  preflight: VERIFIER_PREFLIGHT,
  context: contextOf,
});

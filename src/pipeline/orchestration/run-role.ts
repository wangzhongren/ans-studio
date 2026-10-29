// src/pipeline/orchestration/run-role.ts
// 编排层：角色会话的编排。
//
// 两条路径：
//  1) runRole —— **一次性**路径：解析 → 建 gate → 建 adapter → bindRole → prompt 一轮 → 收事件。
//     CLI `ans role run` 用它。
//  2) openRoleSession —— **会话句柄式**多轮路径：底层只建**一个** RoleSession，send() 可反复调，
//     事件流持续，生命周期由调用方 dispose() 收口。桌面应用的聊天栏用它。
//
// 分工（契约 §5，F9）：本层只做编排——角色解析、边界解析、路径判定全部经门禁引擎导出的函数；
// 运行时工具与 SDK 调用经 Service 的中立 RuntimeAdapter 接线。
//
// ── 客户确认制收窄（A-3，2026-10-12 设计 A 组）────────────────────────────────────
// `openRoleSession` 收到 `customerInput`（前端给的客户通道）时，本会话进入**确认制**：
//   · 客户被 `request_confirmation` 预览并确认后，编排把「**已预览且校验在会话边界内**的具体路径」
//     发行进本会话的 writeSet（`common/编排/confirmed-writes.ts`）；
//   · 写入照旧经 gate——**F4 拒掉一切未确认路径**（writeSet 外 = 拒）。
//   · 通道**不可用/拒绝/未确认** → 不发行 → 该路径写入被拒（fail-closed）。
//   · **呈现前完整性闸（2026-10-19 真机 op-2）**：写盘类确认卡声明了写入路径时，preview 必须对
//     每一条路径给出可核对正文/结构；不完整 ⇒ **不发卡**、不发行任何路径，`request_confirmation`
//     直接返回失败并列出缺正文的路径（`common/编排/confirmed-writes.ts::validateConfirmPreviewCompleteness`）。
//     非写盘确认（无路径）与选择卡行为不变。
//   · **Section 1 写入预授权（客户 2026-10-25 规则，原文「写自己角色权限内的路径，直接放行。」）**：
//     角色会话**没有任务级 writeSet 收窄**（`scope === undefined`）时，其 Section 1 白名单即初始
//     可写集——内置治理五角色（trio）按注册表 Section 1 条目、项目角色按自己的边界条目（含
//     `docs/workflow.md` 这类精确文件）；写入直接经 gate 放行，不要求逐路径
//     `request_confirmation`。判定仍是同一个 resolveWrite：边界外、禁写路径、跨根/逃逸、F6 接受门
//     与治理写入（角色卡 appointment-write 等，由 trio 能力包装
//     先行判定）逐字不变。有任务 writeSet 时保持 F4 收窄（不并入 Section 1）。
//     见 scopeWithPreauthorizedWrites。
//   · **例外（客户裁定 2026-10-16）**：内置治理角色（su）的**初始** writeSet 恒含 `docs/su/**`、
//     `docs/contracts/**`、`docs/skills/**` 与 `docs/mcp/**`（预授权写目录，不经发行器、随会话初始化
//     计算；见 scopeWithPreauthorizedWrites）——对其余一切路径以上四条逐字适用。su 的卡未声明
//     2026-10-25 预授权规则，故其 Section 1 其余条目仍走确认发行（旧行为逐字不变）。
// 【已登记的残余漏洞：内容漂移】本机制只保证「**路径**已预览且已确认」；「预览内容 ≠ 写出内容」
// 关不住（O-A1 内容比对经客户 2026-10-12 裁定不采纳——如实登记，不实现）。
// 未给 `customerInput` 的会话（无客户通道）保持旧语义：scope 原样传递（可为 undefined = 不收窄）。
//
// ── A-4（同日晚）：收口删除 ─────────────────────────────────────────────────────
// `genesisFinalize`/`operatorChannel`/句柄 `finalize()` 已删——「提议+确认」不再存在；写出的产物由
// **自动收尾**（每轮 su settle 后 `repinIfBootstrapped`，含首次）完成，确认发生在写入**之前**（上节）。
//
// 退出码约定（见 ../../common/编排/exit-codes.ts）：0 = 成功，非 0 = 失败。runRole 以码返回失败；
// openRoleSession 无退出码，失败即**抛错**给调用方。
//
// scope 可选（客户端裁决）：scope === undefined 表示"没有预先存在的任务"（chat / 一次性无收窄），
// 此时**不做任务级收窄**，只用角色边界；编排把 undefined 原样传给 resolveWrite，绝不伪造全量 writeSet。
// （确认制会话例外：其 writeSet 由发行器动态持有；其中 Section 1 预授权/旧 su 预授权目录见上。）

import type { GovernanceFunction, ProjectConfig, ResolvedRole } from "../../model/role.ts";
import type { BoundaryEntry } from "../../model/boundary.ts";
import { isValidConditionSlug } from "../../model/boundary.ts";
import type { TaskScope, WriteDecision } from "../../model/decision.ts";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
// C 批（方案 §6.4.1/C-06）：appointment-write 预览的 role-card 必填章节单一来源。
import { ROLE_CARD_REQUIRED_SECTIONS } from "../../common/门禁引擎/governance-roles.ts";
import { evaluateShellWriteTargets } from "../../common/门禁引擎/shell-write-guard.ts";
import { loadLatestRoster, rosterDirectoriesFor, validateAppointmentCardAgainstRoster } from "../../common/编排/workflow-preconditions.ts";
import { createShellPostAudit } from "../../common/编排/shell-post-audit.ts";
import { buildShellApprovalContext } from "../../common/编排/shell-approval-context.ts";
import { resolveRole } from "../../service/role/resolve-role.ts";
import { resolveBoundary, validateBoundaryYamlText } from "../../service/boundary/resolve-boundary.ts";
import {
  LEGACY_SU_PREAUTHORIZED_DIRS,
  appGovernanceBoundary,
  governanceCapabilitiesOf,
  governanceRoleOf,
  isBuiltInGovernanceRoleId,
  type GovernanceRoleSpec,
} from "../../service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
import type {
  RuntimeReplayEntry,
  RuntimeSessionRecord,
  RuntimeContextSource,
  RuntimeKind,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
  ShellGate,
  ShellReviewRequest,
  ShellPostAuditFn,
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
  GovernanceCardKind,
  DispatchTaskFn,
  DispatchTaskPayload,
  RequestRequirementChangeFn,
  ViewImageFn,
  RoleStatusFn,
  SessionTailFn,
  RoleActivityLogFn,
  TerminateRoleRunFn,
  RedispatchTaskFn,
  InstallSkillFn,
  UninstallSkillFn,
  InstallMcpFn,
  UninstallMcpFn,
  OperatorChannelFn,
  PromptOptions,
  PromptTurnStartedMetadata,
  ReportHandbackFn,
  ReportHandbackMetadata,
  ReportHandbackReceipt,
  ReportSaveResultV1,
  ReportSaveStateV1,
  DeliverySaveResultV1,
  DeliveryReceiptQueryV1,
  RuntimePersistenceChangeV1,
  BackgroundTaskSnapshot,
  BackgroundTaskReadOptions,
  BackgroundTaskReadResult,
  BackgroundTaskStopOptions,
  BackgroundTaskStopResult,
  RuntimeLiveReportDraftV1,
  RuntimeLegacyHistoryEntryV1,
  RuntimeLegacyHistoryProjectionV1,
  ShellJudgeToolOptions,
  GovernanceJudgeContext,
  GovernanceJudgeToolOptions,
} from "../../model/runtime.ts";
import { GOVERNANCE_SLUG_PATTERN, governanceCardGroup } from "../../model/runtime.ts";
import { createRuntimeAdapter, projectRuntimeLiveHandback, projectRuntimeLegacyHistory, type RuntimeSessionOptions } from "../../service/runtime/session.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import {
  assembleProjectShellGate,
  assembleReadonlyShellGate,
  assembleOperatorShellGate,
  type AssembleShellGateOptions,
  type AssembleReadonlyShellGateOptions,
  type AssembleOperatorShellGateOptions,
  type RoutineShellPolicy,
} from "./shell-arming.ts";
import { formatEvent } from "../../common/编排/output.ts";
import { withHandback, type OrchestrationEvent, type TaskReport, type HandbackIntent, type HandbackEvent, normalizeTaskReport } from "../../common/编排/handback.ts";
import { EXIT_OK, EXIT_USAGE, EXIT_FAILURE } from "../../common/编排/exit-codes.ts";
import type { ShellVerdictFn } from "../../common/编排/shell-gate.ts";
import { repinIfBootstrapped, DEFAULT_GOVERNANCE_BOUNDARY_REL } from "../../common/编排/finalize.ts";
import { conditionSlugsOf, declaredPathBodies, createConfirmedWriteIssuer, explicitConfirmPaths, validateConfirmPreviewCompleteness } from "../../common/编排/confirmed-writes.ts";
import {
  DECISION_CARD_MIN_OPTIONS,
  validateDecisionCardRequest,
  type DecisionCardValidation,
} from "../../common/编排/decision-card.ts";
import {
  buildGovernanceJudgeFacts,
  declaredWritePathsFromPreview,
  parseRecommendedRoleIds,
} from "../../common/编排/governance-judge-facts.ts";
import { boundedGovernanceJudgeAudit } from "../../common/编排/governance-judge-verdict.ts";
import { CLI_POSITIONING } from "../../common/编排/cli-positioning.ts";
// 2026-10-26 decision 卡结构校验：**单一共享实现**在 `common/编排/decision-card.ts`；
// 经本 Pipeline 公共出口供桌面窗口后续复用（桌面不得再复制第二份校验）。
export {
  DECISION_CARD_MIN_OPTIONS,
  validateDecisionCardRequest,
} from "../../common/编排/decision-card.ts";
export type {
  DecisionCardRejectReason,
  DecisionCardValidation,
} from "../../common/编排/decision-card.ts";
import { createDiagnosticLogger } from "../../common/shared/diagnostics.ts";
// 跨角色共享路径原语（**单一来源** = pm 属主 `src/common/shared/path-primitives.ts`；工程法案 §一.5
// 消费方名单已含编排；同 `confirmed-writes.ts` 先例）——用于 su 预授权目录的**词法**归属判定：
// 与 resolveWrite 同源取值规则，不从门禁引擎私有 common 另行导入/复制。
import { absRel, compareKey, isAbsoluteAny, isUnderOrEqual, normalizeLexical } from "../../common/shared/path-primitives.ts";

/**
 * **适配器能力面**：编排构造、随 `deps.createAdapter(gate, capabilities)` 交给适配器工厂——
 * 适配器把其中的能力注册为对应工具（「注入才注册」先例），或按其选项接线。三项：
 * · `customerInput`（A-3 客户确认制交互；未注入 ⇒ `request_confirmation`/`request_choice` 不注册）。
 * · `viewImage`（2026-10-26 图片查看；未注入 ⇒ `view_image` 不注册）——**通用只读能力**：项目角色与
 *   内置治理角色在调用方提供时**都注入**（不按角色收窄）。形状单一来源＝契约家 `model/runtime.ts`
 *   （`ViewImageFn`）；工具读取项目内图片并把图片排队为**同一角色下一轮用户提示的图片附件**（两轮
 *   附件设计，本轮工具结果只回「已排队」）。不写盘、不联网、不改变任何写权，也**不改变其他能力的
 *   注入矩阵**（与 `requestAcceptance`/`requestGateReview` 等互不隐含）。
 * · `reportHandback`（C-1 交报告；未注入 ⇒ `submit_report` 不注册）——**只给项目角色会话**注入
 *   （治理角色 su 不自我回交，不注入）。能力形状 = `submit_report{ status, summary, evidence? }`
 *   的载荷（结构对齐，见 `common/编排/handback.ts::TaskReport`）。
 * · `sessionDir`（D-1 重启恢复）：本会话的**会话自持目录**，约定路径
 *   `<projectRoot>/.ans/sessions/<roleId>/<runtime>/`（带尾分隔符；旧未显式 runtime 的替身保留旧路径）。**编排只算路径、不预建目录**——
 *   **目录的创建归适配器**（在其真正落盘 SessionManager.create/open 时做）：① 保「不预建 `.ans`」
 *   的既有语义/断言（每次 `ans govern` 都预建 `.ans/sessions/` 会打破它）；② 谁落盘谁建目录，
 *   避免「编排建了目录但会话从未写」的空目录；③ 恢复 `open(path)` 不需要预建。
 *   projectRoot 为空 / roleId 不安全（空、含路径分隔符或 `..`）→ **不传**（旧行为，无持久化）。
 *   注：一次性路径 `runRole`（`ans role run`）不传（一局即止，无需恢复）。
 * · `dispatchTask`（H-1 su 派发任务；未注入 ⇒ `dispatch_task` 不注册）——**只给治理角色 su**注入
 *   （项目角色不给）。形状 = 契约家 `DispatchTaskFn`（前端路由：开/排队/去重/失败保留归前端；
 *   **派发 ≠ 授权**——能力实现方不得据此授予任何写权）。
 * · `handOffIntent` / `requestClarification`（W6-A 意图交接/澄清；未注入 ⇒ 对应工具不注册）——
 *   **只给** Liaison / Rapporteur（能力矩阵 `handOffIntent`/`requestClarification`）。编排先做文件/
 *   去重/每轮一次/两轮澄清上限与账本；能力实现方只负责投递/呈现。**交接 ≠ 客户批准；澄清 ≠ 客户已回答**。
 * · `requestRequirementChange`（2026-10-26 需求变更申请 `request_requirement_change`；未注入 ⇒ 工具不
 *   注册）——**只给内置治理角色中的报告员 Rapporteur 与统筹 Convener**（2026-10-26 客户纠正/补充；
 *   其他内置角色与项目角色不注入）；意图校验/去重/派发/账本/系统行由应用能力实现，编排**纯透传**。
 *   **提交申请 ≠ 客户批准，也不代表意图已变更**——需求变更审批卡由统筹或报告员发起、发起方不得自批，
 *   审批人只有判断 agent/客户；主理不审批、只在批准后执行意图变更；提案卡不得承载未批准的新授权。
 * · `shellGate`（I-1 开放 shell + 审批档/只读档；未注入 ⇒ `run_shell` 不注册）——**项目角色**经三层链注入
 *   （`openRoleSession` 收到 `shellOperatorChannel` 时经 `assembleProjectShellGate` 装配）；**内置治理角色**
 *   （客户 2026-10-19 新规则：五个角色＋su 的能力位统一 `shell: "operator-approve"`）经 **审批档**
 *   （`shellOperatorOnly`：只读白名单免审批、其余含 deny 逐条客户/判断 agent 批准；经
 *   `assembleOperatorShellGate` 装配）注入；旧**只读档**（`shellReadonly`）仅保留为兼容路径。
 *   比工厂第二参优先（`capabilities?.shellGate ?? shellGate`）。
 * · `shellVerdict`（R-1 shell 审读结论工具；未注入 ⇒ `report_shell_verdict` 不注册）——**审读会话专用**
 *   （由 `pm-reviewer` 注入；形状单一来源 `common/编排/shell-gate.ts`）。
 * · `roleStatus` / `sessionTail` / `proposeRecovery`（G-2 看护三工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用内置治理角色先例 `suppressHandback`，同 `dispatchTask`）。
 *   载荷/回执形状的单一来源＝契约家 `model/runtime.ts`（R1/R2 属主，同 `DispatchTaskFn` 先例；
 *   文案契约在 `common/编排/watchdog.ts`）。**提议 ≠ 执行**：三能力不得授予或改变任何写权；
 *   `role_status`/`session_tail` 纯读。
 * · `installSkill` / `uninstallSkill`（G-4 I1/I2 技能安装两工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用 `suppressHandback`，同 `dispatchTask`/看护三能力）。
 *   形状单一来源＝契约家 `model/runtime.ts`（`InstallSkillFn`/`UninstallSkillFn`/`InstallSkillReceipt`）。
 *   **安装 ≠ 授权**：工具自己不写盘，能力只做校验/激活/回执；不得据此授予或改变任何写权。
 * · `installMcp` / `uninstallMcp`（G-4 V2 MCP 安装两工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用 `suppressHandback`，同技能两能力）。
 *   形状单一来源＝契约家 `model/runtime.ts`（`InstallMcpFn`/`UninstallMcpFn`/`InstallMcpReceipt`）。
 *   **能力级授予诚实面**：外来 MCP 工具在 ANS 门禁之外执行——回执/文案不得宣称逐调用受审；
 *   **安装 ≠ 授权**：工具自己不写盘，能力只做校验/激活/回执；不得据此授予或改变任何写权。
 */
export interface AdapterCapabilities {
  customerInput?: CustomerInputFn;
  reportHandback?: ReportHandbackFn;
  sessionDir?: string;
  runtime?: RuntimeKind;
  persistSession?: boolean;
  /**
   * 图片查看能力（`view_image`「注入才注册」，2026-10-26 客户要求；两轮附件设计）——**通用只读能力**：
   * 项目角色与内置治理角色在调用方提供时**都注入**（不按角色收窄；与只给 su 的安装/看护类能力不同）。
   * 形状单一来源＝契约家 `model/runtime.ts`（`ViewImageFn`/`ViewImageInput`/`PromptImage`）。工具读取
   * 项目内图片（路径/类型/≤10 MB 校验在工具层）并调用本能力把图片排队为**同一角色下一轮用户提示的
   * 图片附件**；本轮工具结果只说明「已排队」。未提供 ⇒ 不注入（运行时核心据此不注册工具，结构性
   * fail-closed）。本能力不写盘、不联网、不改变任何写权，也**不改变其他能力的注入矩阵**。
   */
  viewImage?: ViewImageFn;
  dispatchTask?: DispatchTaskFn;
  /**
   * 需求变更申请能力（`request_requirement_change`「注入才注册」，2026-10-26 客户要求 + 同日纠正/补充）。
   * **只给内置治理角色中的报告员 Rapporteur 与统筹 Convener 注入**（其他内置治理角色、single 的 su 与
   * 项目角色即便调用方误给也不注入，工具不注册，结构性 fail-closed）。形状单一来源＝契约家
   * `model/runtime.ts`（`RequestRequirementChangeFn`/`RequestRequirementChangeInput`/
   * `RequestRequirementChangeResult`）。意图校验/去重/派发/账本/系统行由能力实现，本层**纯透传**。
   * **提交申请 ≠ 客户批准，也不代表意图已变更**；需求变更审批卡由统筹或提案角色发起，发起方不得自批，
   * 审批人只有独立判断 agent（「替我决策」开启时）或客户；主理不审批、只在批准后执行意图变更；
   * 提案卡不得承载未批准的新授权，也不得删除需求绕过。
   */
  requestRequirementChange?: RequestRequirementChangeFn;
  shellGate?: ShellGate;
  /** 2026-10-29（§6.5）：run_shell 执行后写审计（与 shellGate 同注入；缺省不审计）。 */
  shellPostAudit?: ShellPostAuditFn;
  shellVerdict?: ShellVerdictFn;
  roleStatus?: RoleStatusFn;
  sessionTail?: SessionTailFn;
  /** B 批（2026-10-28）：`role_activity_log` 数据源；只给幕僚（trio chief）注入。 */
  roleActivityLog?: RoleActivityLogFn;
  /** B 批：终止动作；只给幕僚注入。 */
  terminateRoleRun?: TerminateRoleRunFn;
  /** B 批：安全重派动作；只给幕僚注入。 */
  redispatchTask?: RedispatchTaskFn;
  installSkill?: InstallSkillFn;
  uninstallSkill?: UninstallSkillFn;
  installMcp?: InstallMcpFn;
  uninstallMcp?: UninstallMcpFn;
  /**
   * 判断 agent（「替我审」）只读能力（2026-10-17 PM 评审 §6.1/§6.3）。**能力注入，不是工具注入**：
   * 给出时运行时核心走 `buildShellJudgeTools`（恰 `judge_read_file`/`judge_list_dir`/
   * `report_shell_judgement`），**不得**走 `buildGovernedTools`；`judgeMode:true` 与
   * `installedMcpServers:[]` 由 Service 自动置位。形状单一来源＝`model/runtime.ts`。
   * 只由编排的 `createShellJudge` 经 `createAdapter(gate, {persistSession:false, shellJudge})` 注入；
   * 普通角色会话不传（未注入 ⇒ 工具不注册）。
   */
  shellJudge?: ShellJudgeToolOptions;
  /**
   * 治理卡判断 agent（「替我审批」/「替我决策」）只读能力（2026-10-18 双开关评审 §7.1/§6.2）。
   * 与 `shellJudge` 同形的**能力注入**：只由编排 `createGovernanceJudge` 经
   * `createAdapter(gate, {persistSession:false, governanceJudge})` 注入；普通角色会话不传
   * （未注入 ⇒ 对应工具不注册，逐字现状）。运行时核心据此走 `buildGovernanceJudgeTools`。
   */
  governanceJudge?: GovernanceJudgeToolOptions;
}

export interface RunRoleInput {
  roleId: string;
  runtime?: RuntimeKind;
  taskId: string;
  project: ProjectConfig;
  scope?: TaskScope;
}

export interface RunRoleResult {
  code: number;
  transcript: SessionEvent[];
}

export async function runRole(
  input: RunRoleInput,
  deps: RoleSessionDeps = {}
): Promise<RunRoleResult> {
  const transcript: SessionEvent[] = [];
  const record = (ev: SessionEvent): void => {
    transcript.push(ev);
    console.log(formatEvent(ev));
  };
  // 失败路径统一出口：写 stderr（可读原因）+ 记入 transcript，返回非 0 码。
  // 注：SessionEvent.kind 是契约 §4 冻结联合（无 "error"），故 transcript 里用 "message" 承载失败说明。
  const fail = (code: number, reason: string): RunRoleResult => {
    process.stderr.write(`ans role run 失败：${reason}\n`);
    transcript.push({ kind: "message", summary: `失败：${reason}` });
    return { code, transcript };
  };

  // 角色/边界解析（未知角色、parseError 等失败由 setupRole 归类）。
  // 一次性 CLI 路径：**不允许**内置治理角色——只接受 project.roles 登记的项目角色。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: false });
  if (!setup.ok) return fail(setup.code, setup.reason);
  const role = setup.role;

  // gate：照抄契约 §5 的构造，绑定 resolveWrite；scope 可能为 undefined（无任务收窄）。
  const gate = buildGate(role, input.project, input.scope);

  record({
    kind: "message",
    summary: `已解析角色 ${role.id}（kind=${role.kind}），角色卡：${role.location.card}`,
  });
  record({
    kind: "message",
    summary: `已解析边界，来源：${role.boundary.boundarySource}；acceptance=${
      role.boundary.acceptance.accepted ? "accepted" : "rejected"
    }（来源：${role.boundary.acceptance.source || "缺"}）`,
  });
  record({
    kind: "message",
    summary:
      `受治理工具集已建立：write_file / edit_file 在写入前经 gate 校验；任务 ${input.taskId} ` +
      (input.scope ? `写集 ${input.scope.writeSet.length} 项` : "未声明 scope（仅按角色边界，不做任务收窄）"),
  });
  // P1-4 产品定位指路（桌面体验提案，2026-10-13 客户批准）：一次性 CLI 会话启动时如实告知能力面——
  // 轻量一行、每次会话至多一次；不改变任何能力与判定（shell 本就不 arm、会话本就不持久）。
  // 句子的单一来源见 common/编排/cli-positioning.ts（帮助输出共用同一句，防漂移）。
  record({ kind: "message", summary: CLI_POSITIONING });

  let code: number = EXIT_OK;
  let session: RoleSession | undefined;
  try {
    const createAdapter = deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "demo", deps.runtimeOptions);
    const adapter = createAdapter(gate);
    session = await adapter.bindRole(role);
    await session.prompt(buildTaskPrompt(input.taskId, input.scope));
    // 事件流以 "settled" 为**终止信号**：见到即停并退出循环。
    // 关键：真实 Pi 适配器的 events() 只有在 dispose() 时才 close 队列；若在此等到流自然结束，
    // 会与随后的 dispose() 互等（死锁）——那样 main() 永不 resolve（顶层 await 不收敛）。
    for await (const ev of session.events()) {
      record(ev);
      if (ev.kind === "settled") {
        if (isFailedSettlement(ev)) code = EXIT_FAILURE;
        break;
      }
    }
  } catch (err) {
    // 会话建立（bindRole）或会话中途出错 → 非 0。
    code = EXIT_FAILURE;
    process.stderr.write(`ans role run 会话失败：${errText(err)}\n`);
    transcript.push({ kind: "message", summary: `会话异常：${errText(err)}` });
  } finally {
    // 无论成功、失败还是异常，都必须释放会话（try/finally 保证）。
    if (session) {
      try {
        await session.dispose();
      } catch (err) {
        // dispose 出错**如实报**，但不掩盖原始结果：仅在原本成功时把结果翻成失败。
        process.stderr.write(`ans role run 释放会话失败：${errText(err)}\n`);
        transcript.push({ kind: "message", summary: `释放会话失败：${errText(err)}` });
        if (code === EXIT_OK) code = EXIT_FAILURE;
      }
    }
  }

  return { code, transcript };
}

// —————————————————————— 会话句柄式（多轮）接口 ——————————————————————
// 冻结签名（桌面应用照此编写）。

/**
 * `RoleSessionHandle.abort()` 的结果（产品提案 P0-2「停当前轮次」，2026-10-13 客户批准）。
 * 三态**语义钉死**：
 * - `{ ok:true, supported:true }` —— 已向底层会话请求停止当前轮次（轮次以 `settled` 正常收尾）；
 * - `{ ok:false, supported:false, error }` —— 底层会话**不带 abort**（如 demo 替身/假适配器）：
 *   **该运行时不支持停止**，`error` 承载如实文案「当前运行时不支持停止」——绝不假装已停；
 * - `{ ok:false, supported:true, error }` —— 底层会话有 abort 但 SDK 报错：错误原文（`errText`）
 *   如实放入 `error`，不吞、不谎报已停。
 * `error` 统一承载 `ok:false` 时给人看的如实原因；`supported` 告知「该运行时有没有停止能力」。
 */
export interface RoleSessionAbortResult {
  ok: boolean;
  supported: boolean;
  error?: string;
}

/**
 * **F-5-opt1 推荐注记文案**（2026-10-16 客户批准；会话因边界更新重建后写权清零的**如实告知**，
 * **单一来源**）——由重建路径（桌面窗口 O-1）经 `RoleSessionHandle.queueModelNotice` 排入模型可见输入。
 * 措辞要点：以 `【系统通知·会话重建】` 标记开头——这是**系统注入的 notice，不是角色/客户发言**
 * （2026-10-19 客户反馈「这个应该加一个标记啊，不然谁知道啊」），避免模型把它误当用户消息；
 * 如实说明「重建」与「写权不自动保留」，指向**可行恢复路径**（`request_confirmation`）；
 * **不夹带任何授权语义**（不是授权、不承诺放行——写入仍须逐条确认后发行）。
 */
export const REBUILT_SESSION_WRITE_PERMITS_NOTICE =
  "【系统通知·会话重建】此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。";

/** Pipeline-only prompt intent; never forwarded as a Runtime option or write authorization. */
export interface RoleSessionSendOptions extends PromptOptions {
  handback?: HandbackIntent;
}

export interface RoleSessionHandle {
  readonly persistenceMode?: "enabled" | "disabled" | "unknown-live";
  retryReportPersistence?(reportId: string): Promise<ReportSaveResultV1>;
  getReportPersistence?(reportId: string): Promise<ReportSaveStateV1>;
  retryDeliveryHistoryPersistence?(attemptId: string): Promise<DeliverySaveResultV1>;
  getDeliveryReceipt?(attemptId: string): Promise<DeliveryReceiptQueryV1>;
  onPersistenceChange?(listener: (change: RuntimePersistenceChangeV1) => void): () => void;
  readonly runtime?: RuntimeKind;
  readonly roleId?: string;
  readonly contextSource?: RuntimeContextSource;
  readonly nativeSessionId?: string;
  readonly contextWarning?: string;
  /**
   * 发送一轮输入；可反复调用（底层同一会话，不重建）。
   * handback.required:true 标明任务，false 标明聊天并覆盖会话 taskId；缺省沿用明确的会话 taskId。
   * 真实运行时通过 Core 同步开轮 ACK 绑定本轮来源，组合并恰一次转达调用方的 ACK 回调。
   * handback 只由编排消费，不传给 Runtime；images 数组保持原引用。
   * 未标记且没有 ACK 的旧替身保留原 options 引用与单参数调用路径。
   */
  send(text: string, opts?: RoleSessionSendOptions): Promise<void>;
  /**
   * **停当前轮次（产品提案 P0-2「跑飞轮次的停」，2026-10-13 客户批准）**：向底层会话请求**中止当前
   * 进行中的 prompt 轮次**（模型生成与工具执行一并停）。契约来源 = `RoleSession.abort?`
   * （`src/model/runtime.ts`，**可选方法**；真适配器实现 = Pi SDK `session.abort()`，
   * 见 `src/common/pi-adapter/real-adapter.ts` 的 `makeRoleSession`）。
   *
   * **语义（钉死）**：
   * - **不销毁会话**——abort 后本句柄仍可继续 `send`（历史与模型上下文保留）；与 `dispose`（收口整只
   *   会话）不同；
   * - **无在飞轮次 = no-op**（底层不抛错、无副作用）；
   * - **中止后 `settled` 仍发射**——轮次以 `settled` 正常收尾，消费方不会挂起；
   * - **等待中的客户确认一并 fail-closed**（中止该轮 run 的 AbortSignal，交互工具按「未获同意」返回）；
   * - **三态如实返回**（形状见 `RoleSessionAbortResult`）：会话**不带 abort**（如 demo 替身）⇒
   *   `{ ok:false, supported:false, error:"当前运行时不支持停止" }`——**绝不假装已停**；SDK 报错 ⇒
   *   `{ ok:false, supported:true, error:<错误原文> }`——如实上抛为结果，不吞。
   * 桌面「停止」入口（何时出现按钮、点击后聊天流的如实一行）为**后环**（桌面环节）。
   *
   * **可选方法（契约演进，同契约 `RoleSession.abort?` 的「PromptOptions 先例」）**：既有替身
   * **不实现它也完全合法**；消费方以 `handle.abort?.()` 调用——**方法缺席**（旧替身）与返回
   * `supported:false` 同一处理：如实告知「当前运行时不支持停止」，绝不假装已停。
   * **`openRoleSession` 返回的句柄恒实现本方法**（三态结果即真实回答，缺席只出现在替身）。
   */
  abort?(): Promise<RoleSessionAbortResult>;
  /**
   * **F-5-opt1（编排侧）：向模型注入一行「如实注记」**（2026-10-16 客户批准；kanban-live D1——
   * 会话因边界更新**重建**后写权（已发行 writeSet）静默清零，模型上下文却被完整恢复 ⇒ 认知分叉）。
   * 语义**钉死**：
   * - 注记**排入下一次 `send()` 的输入前缀**（一行加换行分隔），**送达一次即消费**——不是用户消息、
   *   **不单独开轮**、不触任何工具与任何判定（判定与写权不受影响，纯粹是给模型的如实输入）；
   * - 该轮 `prompt` 失败且**未开轮（无 ACK）**时注记保留（下一轮重试仍带上）；开轮后失败则消费
   *   （输入已送出，重排会重复）；
   * - 推荐文本用 `REBUILT_SESSION_WRITE_PERMITS_NOTICE`（单一来源，防各写一份）。
   * **可选方法**（同 `abort?` 先例）：旧替身不实现亦完全合法；由宿主（桌面窗口 O-1 重建路径）在
   * 重建后对本会话句柄调用。**`openRoleSession` 返回的句柄恒实现本方法**。
   */
  queueModelNotice?(text: string): void;
  /**
   * **会话级后台任务访问面（2026-10-25，桌面任务面板）**：与契约
   * `RoleSession.listBackgroundTasks?` / `readBackgroundTask?` / `stopBackgroundTask?` **同名同签名**，
   * 原样转发底层会话（`src/model/runtime.ts`；任务表/日志只存在于本会话生命周期，编排不另立一套状态）。
   *
   * **三者均为可选方法**（同 `abort?` / `queueModelNotice?` 先例）：底层 `RoleSession` 未实现时，
   * 句柄上对应属性**保持缺席（undefined）**——**不伪造空实现**（伪造 `[]`/`undefined`/「已停止」会误导
   * 消费方）；`stopBackgroundTask` 的失败结果（`ok:false`，如 `unknown-task`/`closed`/`timeout`）与抛错
   * 均**原样返回**，不吞、不改写。`openRoleSession` 返回的句柄是否具备取决于底层会话。
   */
  listBackgroundTasks?(): BackgroundTaskSnapshot[];
  readBackgroundTask?(taskId: string, options?: BackgroundTaskReadOptions): BackgroundTaskReadResult | undefined;
  stopBackgroundTask?(taskId: string, options?: BackgroundTaskStopOptions): Promise<BackgroundTaskStopResult>;
  /**
   * 持续的事件流；跨多轮累积。产出 `OrchestrationEvent`（既有 `SessionEvent` + 编排在 `settled` 时
   * 追加的 `handback` 回交事件，设计 §10.8）——**治理角色（su）不自我回交**，故其会话只产出 SessionEvent。
   */
  events(): AsyncIterable<OrchestrationEvent>;
  /** 收口：释放底层会话。可重复调用（幂等）；出错如实抛出，不吞。 */
  dispose(): Promise<void>;
}

export async function openRoleSession(
  input: {
    roleId: string;
    runtime?: RuntimeKind;
    project: ProjectConfig;
    taskId?: string;
    scope?: TaskScope;
    /** 宿主按客户委托注入的本项目常规检查政策；项目角色三层链专用。 */
    routineShellPolicy?: RoutineShellPolicy;
    /**
     * **客户确认制交互通道（A-1/A-3）**：前端给的原始客户通道（CLI 终端 / 桌面交互卡）。
     * **给出** ⇒ 本会话进入**确认制收窄**：编排在此之上包一层「确认 → 发行 writeSet」的发行器
     * （`common/编排/confirmed-writes.ts`），并经 `deps.createAdapter(gate, {customerInput})` 注入适配器
     * ——`request_confirmation`/`request_choice` 两工具据此注册（「注入才注册」）。
     * **Section 1 预授权（2026-10-25 客户规则）**：无任务 scope 收窄时，Section 1 内写入直接放行
     * （trio 五角色与项目角色；旧 su 保留四棵预授权目录），不需要逐路径确认；边界外/F4 收窄/
     * 治理门禁照旧。发行器仍存在，用于其余既有确认流程。
     * **缺省** ⇒ 无客户通道：工具不注册、scope 原样传递（旧语义，逐字不变）。
     */
    customerInput?: CustomerInputFn;
    /**
     * **自动收尾 + 自动重 pin（§13.3 经 A-4 扩为含首次）**：每轮会话 settle 后自动调用
     * `repinIfBootstrapped`——创世态 = 首次收尾（写 `.ans` + 治理边界文档 + manifest；无可 pin 之物则
     * 零副作用）；非创世态 = 重扫并更新 `.ans` 的 pin + manifest。缺省：**内置治理角色（su）会话为
     * `true`，其余为 `false`**——收尾/重 pin 是 su 的固有职责，普通角色会话不做。
     */
    autoRepin?: boolean;
    /**
     * **su 派发任务的路由能力（H-1）**：前端提供的路由实现（把派发转成目标角色会话的一条输入；
     * 开/排队/去重/失败保留归前端）。**只对治理角色会话（su）转交**——项目角色会话即便给了也不注入
     * （`dispatch_task` 只给 su）；CLI 一次性前端无同等路由（设计已登记），不传即可（工具不注册）。
     * 校验（roleId 非本项目角色 / 指向 su 自身 → 如实回错）由该能力的实现方做，判定口径用
     * `common/编排/handback.ts::isDispatchableRoleId`（单一来源）；**派发 ≠ 授权**。
     */
    dispatchTask?: DispatchTaskFn;
    /**
     * **需求变更申请能力（`request_requirement_change`「注入才注册」，2026-10-26 客户要求 + 同日纠正/补充）**：
     * 前端（桌面窗口）提供的实现——报告员起草提案时若需要**新的客户授权/范围**（或约束/成本变化），
     * 不应把未获授权的诉求塞进提案卡「顺带获批」，而应发起需求变更申请。**只对内置治理角色中的
     * 报告员 Rapporteur 与统筹 Convener 注入**；其它内置治理角色、single 的 su 与项目角色即便调用方
     * 误给也不注入（工具不注册，结构性 fail-closed）。需求变更审批卡由统筹或报告员发起，发起方不得自批，
     * 审批人只有独立判断 agent（「替我决策」开启时）或客户；主理不审批、只在批准后执行意图变更。
     * 意图校验/去重/派发/账本/系统行全部由该能力实现；本层**纯透传**。**提交申请 ≠ 客户批准，
     * 也不代表意图已变更**。
     */
    requestRequirementChange?: RequestRequirementChangeFn;
    /**
     * **G-2 看护自查能力（R1；`role_status`「注入才注册」）**：前端提供的实现（主进程读同源快照＋
     * 诊断尾部 → 结构化文本）。**只对治理角色会话（su）转交**（判据同 `dispatchTask`）；形状单一来源
     * ＝契约家 `model/runtime.ts`（R1 属主；文案契约在 `common/编排/watchdog.ts`）。**纯读**：不写盘、
     * 不入队、不改 busy、不动任何判定链；不扩大任何写权。
     */
    roleStatus?: RoleStatusFn;
    /**
     * **G-2 会话巡检能力（R1；`session_tail`「注入才注册」）**——**只给 su**（同上一判据）。
     * 复用受保护投影管线返回尾部规范化行（凭据清洗/display 保护已在链上）；失败如实（不抛、不猜）。
     */
    sessionTail?: SessionTailFn;
    /**
     * B 批（2026-10-28）：`role_activity_log` 数据源（每角色运行日志）。**只对幕僚（trio chief）转交**；
     * 其他角色/项目角色即便调用方误给也不注入（工具不注册）。纯读、脱敏、项目相对路径；不扩大任何写权。
     */
    roleActivityLog?: RoleActivityLogFn;
    /** B 批：终止动作；只给幕僚（trio chief）转交。 */
    terminateRoleRun?: TerminateRoleRunFn;
    /** B 批：安全重派动作；只给幕僚（trio chief）转交。 */
    redispatchTask?: RedispatchTaskFn;
    /**
     * **G-4 技能安装能力（I1/I2 工具 `install_skill`「注入才注册」）**——**只对治理角色会话（su）
     * 转交**（判据复用 `suppressHandback`，同 `dispatchTask`/看护三能力）；项目角色会话即便调用方
     * 误给也不注入（工具不注册）。形状单一来源＝契约家 `model/runtime.ts`（`InstallSkillFn`/
     * `InstallSkillReceipt`）。**工具自己不写盘**：能力只做校验（角色/登记/含角色）→ 激活（重建；
     * 在跑不打断 ⇒ `next-session`）→ 三态回执。**安装 ≠ 授权**：不得据此授予任何写权（技能是必读
     * 资料，不是边界；安装不改变任何角色的边界与写权）。
     */
    installSkill?: InstallSkillFn;
    /**
     * **G-4 技能卸载能力（I1/I2 工具 `uninstall_skill`「注入才注册」）**——**只给 su**（同上一判据）。
     * 先改登记再卸载（能力须校验登记确已撤销，未撤销如实拒绝）；**文件保留**——「效果已撤」与
     * 「字节已清」二分陈述；同不改变任何写权。
     */
    uninstallSkill?: UninstallSkillFn;
    /**
     * **G-4 V2 MCP 安装能力（工具 `install_mcp`「注入才注册」）**——**只对治理角色会话（su）
     * 转交**（判据复用 `suppressHandback`，同技能两能力）；项目角色会话即便调用方误给也不注入
     * （工具不注册）。形状单一来源＝契约家 `model/runtime.ts`（`InstallMcpFn`/`InstallMcpReceipt`）。
     * **工具自己不写盘**：能力只做校验（角色/声明/含角色；护栏：仅客户消息发起的轮次）→ 激活
     * （重建；在跑不打断 ⇒ `next-session`）→ 回执。**能力级授予诚实面**：外来 MCP 在 ANS 门禁之外
     * 执行——不得宣称逐调用受审；**安装不改变任何角色的写边界**（写权仍只来自角色边界与确认发行）。
     */
    installMcp?: InstallMcpFn;
    /**
     * **G-4 V2 MCP 卸载能力（工具 `uninstall_mcp`「注入才注册」）**——**只给 su**（同上一判据）。
     * 先改声明再卸载（能力须校验声明确已撤销，未撤销以 `registration-unchanged` 如实拒绝）；
     * **下次会话摘除**（在跑不打断）、**已发生副作用不可撤**（如实二分陈述）；同不改变任何写权。
     */
    uninstallMcp?: UninstallMcpFn;
    /**
     * **I-1 开放 shell —— (a) 前端操作者确认通道（兼 arm 开关语义）**：给出 ⇒ 本会话（**仅项目角色**；
     * 内置治理角色自身不接三层链——其 `run_shell` 走审批档 `shellOperatorOnly`）由编排装配三层链
     * （(c) 确定性硬地板 → (b) 内置治理角色模型审读 → (a) 本通道；关窗/不答/超时 = **不放行**）并注入
     * `ShellGate` ⇒ `run_shell` 注册（「注入才注册」语义未改）。不给 ⇒ 不 arm（`run_shell` 不存在）。
     * CLI 一次性前端无确认框 ⇒ 不接。
     */
    shellOperatorChannel?: OperatorChannelFn;
    /**
     * **高级注入（透传 `assembleProjectShellGate`；测试/装配用）**：(c) `classifyShell`/`rules`、
     * (b) 审读角色 id / `openSession` / 超时、`auditSink` 等。生产调用（桌面）通常只给
     * `shellOperatorChannel`——（c) 的合法注入源（门禁引擎经 service 的公开出口）就绪后在此传入。
     */
    shellArming?: Omit<AssembleShellGateOptions, "project" | "operatorChannel" | "sessionDeps" | "runtime">;
    /**
     * **只读档（旧兼容路径；客户裁定 2026-10-12「su 也要有 shell，但是只读」）**：给出 ⇒ 本会话装配
     * **只读档** `ShellGate`（`assembleReadonlyShellGate`——只接 (c)：命中只读白名单放行；
     * `risky`/`review`/`deny` 一律拒；**不接 (b) 模型审读**——不自审；**不接 (a) 客户确认**——只读外的
     * 命令直接拒，不打扰客户、不弹任何对话框）并注入 `capabilities.shellGate` ⇒ `run_shell` 注册
     * （「注入才注册」语义未改）。**2026-10-19 起内置治理角色统一走审批档**（`shellOperatorOnly`）；
     * 本选项保留给旧调用方/测试（只读档执行集严格 ⊆ 审批档，仍更严、不放宽）。对项目角色给出时
     * 同样按**更严的一档**处理。与 `shellOperatorChannel`/`shellArming` 同时出现时 **readonly 优先**
     * （见下方 arm 块注释）。装配失败 ⇒ **不 arm**（`run_shell` 不注册，fail-closed 不变）。
     * **不得为此弹任何对话框**（选项面没有 (a) 通道即是结构保证）。
     */
    shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">;
    /**
     * **审批档（客户裁定 2026-10-17：「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」；
     * 客户 2026-10-19 新规则扩展到五个内置治理角色）**：给出 ⇒ 能力位 `shell: "operator-approve"`
     * 的内置治理角色装配 `assembleOperatorShellGate`（只接 (c)+(a)：allow 直放 0 卡；
     * risky/review/deny 一律交客户/判断 agent 逐条批准；**不接 (b)**——交付审批的角色不自审）。
     * 选项面没有 pmAsk/routineShellPolicy（type 层面保证）。
     * **能力位守卫**：`cap?.shell !== "operator-approve"`（含项目角色 cap undefined、旧能力位
     * none/readonly）时误传 ⇒ **不 arm** 并记录诊断 `shell.operatorOnly.rejected`（防止三层链被绕过）。
     * **与 `shellReadonly` 同时给出 ⇒ 不 arm**（诊断记录，不择一静默生效）。
     * 装配失败/缺件 ⇒ 不 arm（`run_shell` 不注册，fail-closed）。优先级：operatorOnly → readonly → 三层链。
     */
    shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">;
    /**
     * **R-1：审读结论工具的能力**（`report_shell_verdict`「注入才注册」）——审读会话专用，由
     * `pm-reviewer` 注入；一般调用方不传。
     */
    shellVerdict?: ShellVerdictFn;
    /**
     * **图片查看能力（`view_image`「注入才注册」，2026-10-26 客户要求；两轮附件设计）**：前端（桌面）
     * 提供的实现——工具读取项目内图片并调用本能力，把图片排队为**同一角色下一轮用户提示的图片附件**
     * （本轮工具结果只回「已排队」，不依赖各引擎「工具结果附图」支持）。**通用只读能力**：项目角色与
     * 内置治理角色**都转交**（不按角色收窄）；未给出 ⇒ 不注入（工具不注册，结构性 fail-closed）。
     * 形状单一来源＝契约家 `model/runtime.ts`（`ViewImageFn`/`ViewImageInput`/`PromptImage`）。
     * 本能力不写盘、不联网、不改变任何写权；**不改变其他能力的注入矩阵**。
     */
    viewImage?: ViewImageFn;
    /**
     * **D-1 覆盖位**：`false` ⇒ 本会话**不持久化**（不传 `sessionDir`，适配器走 in-memory）。
     * 审读会话固定用 `false`（不恢复用户 su 会话的可能损坏历史、不污染其聊天记录）；缺省/`true` 行为不变。
     */
    persistSession?: boolean;
  },
  deps: RoleSessionDeps = {}
): Promise<RoleSessionHandle> {
  const log = createDiagnosticLogger({ component: "orchestration.session", projectRoot: input.project.projectRoot, roleId: input.roleId });
  log.record("session.open.start");
  // 角色/边界解析：失败即抛错（句柄式接口无退出码）。
  // 会话式入口：**允许** project.builtInRoles 声明的内置治理角色（桌面聊天）。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: true });
  if (!setup.ok) {
    log.error("session.open.failed", new Error(setup.reason));
    throw new Error(setup.reason);
  }

  // 底层只建**一个**会话：多轮 send 复用同一 RoleSession，绝不每轮重建。
  //
  // 能力来源（评审 §5.6「单点」）：内置治理角色一律读门禁引擎注册表
  // `governanceCapabilitiesOf`；`su` 得到 `LEGACY_SU_CAPABILITIES`（single 旧行为逐字不变）；
  // 项目角色没有治理能力（`undefined`），保持既有「只给内置治理角色」的注入纪律。
  const builtInGovernance = setup.role.kind === "built-in-governance";
  const trioSpec: GovernanceRoleSpec | undefined = governanceRoleOf(setup.role.id);
  const isTrio = trioSpec !== undefined;
  const governanceModel = input.project.governanceModel ?? "single";
  // 评审 §5.3：trio 下自动收尾/重 pin 的写权来自**应用专用边界**——三人的 Section 1 不含
  // `.ans/**`/`docs/bootstrap-manifest.md`，若沿用角色边界，收尾会 fail-closed、`.ans` 永不落盘。
  // single/su 逐字沿用会话边界（旧行为不变）。
  const repinBoundary =
    isTrio || governanceModel === "trio"
      ? appGovernanceBoundary(setup.role.boundary.acceptance)
      : setup.role.boundary;
  const registryCapabilities = builtInGovernance ? governanceCapabilitiesOf(setup.role.id) : undefined;
  // B 批（2026-10-28）：chief 的目标能力在运行时注入端生效（A 批未改注册表能力矩阵；D 批随目标态清理）：
  // `dispatch_task`（星形任意 worker）/`role_status`/`session_tail`。convener 的旧能力保持到 D。
  // 只叠加**新增**能力位；不改变其他角色/项目角色的注入矩阵。
  const cap = registryCapabilities !== undefined && trioSpec?.id === "chief"
    ? { ...registryCapabilities, dispatchTask: true, roleStatus: true, sessionTail: true }
    : registryCapabilities;
  // 预授权目录（评审 §5.6）：trio 按注册表；su 用既有四棵；项目角色没有预授权。
  // 2026-10-25 起 trio 的写盘预授权改由 **Section 1 条目**给出（含 `docs/workflow.md` 这类精确文件；
  // 见下方 section1PreauthorizedEntries），本表只保留 su 的四棵与 artifact 观察目录用途。
  const preauthorizedDirs: readonly string[] = builtInGovernance
    ? trioSpec?.preauthorizedDirs ??
      (setup.role.id === "su" ? LEGACY_SU_PREAUTHORIZED_DIRS : [])
    : [];

  // gate（A-3）：有 `customerInput` ⇒ 确认制动态 writeSet（发行器追加；Section 1 预授权/内置 su 预授权
  // 目录并入初始集）；无 ⇒ 原样传 input.scope（可为 undefined = 不收窄，旧语义逐字不变）。
  // W6-A（四角色评审 §4.4）：**能力矩阵收窄**——Liaison 的 `customerInput=false`，即便调用方误给
  // 通道也不进入确认制（`request_confirmation`/`request_choice` 结构性不注册；走静态边界/预授权）。
  const confirmationMode =
    input.customerInput !== undefined && (cap === undefined || cap.customerInput);
  const issued = new Set<string>();
  const conditions = conditionSlugsOf(setup.role.boundary);
  const gateCtx = { skillRoot: input.project.skillRoot, projectRoot: input.project.projectRoot };
  const staticScope = input.scope;

  // **Section 1 写入预授权（客户 2026-10-25 规则）**——初始可写集覆盖角色 Section 1 白名单：
  //   · 无任务级 writeSet 收窄（`scope === undefined`，桌面聊天即此形态）：trio 五角色与项目角色
  //     都按各自 Section 1 条目预授权（含精确文件条目，如 Convener 的 `docs/workflow.md`，它不在
  //     `preauthorizedDirs` 目录清单内）。
  //   · 有任务 writeSet / 治理 scope 时：保持 F4 收窄，**不**把 Section 1 并入（不扩大）；trio 的既有
  //     `preauthorizedDirs` 子集照旧并入（2026-10-16 起的既有预授权，行为不变）。
  //   · 旧 su（single）：卡未声明该规则，保留 `preauthorizedDirs` 四棵（A-3 确认制逐字不变）。
  // 预授权只影响 F4：边界匹配、F6 接受门、F7 逃逸复核、forbiddenWritePaths 与三权治理门禁全部先行/
  // 照旧；`request_confirmation` 仍可为边界内路径发行（无副作用），治理敏感写入仍按既有规则确认。
  const section1PreauthorizedEntries: readonly BoundaryEntry[] =
    !(builtInGovernance && !isTrio) && staticScope === undefined ? setup.role.boundary.entries : [];
  const preauthorization: PreauthorizedWriteSources = {
    entries: section1PreauthorizedEntries,
    dirs: builtInGovernance ? preauthorizedDirs : [],
  };
  const hasPreauthorization = preauthorization.entries.length > 0 || preauthorization.dirs.length > 0;

  let boundSessionForEvidence: RoleSession | undefined;
  let currentFlowId: string | undefined;

  // 确认制的初始动态集：**任务级 writeSet（若声明）∪ 已发行集**。任务 writeSet 即「收窄」本身
  // （客户 2026-10-25 规则只把**无任务收窄**时的 Section 1 全量并入预授权，不会扩大任务写集）；
  // 旧 su（single）不并入静态 scope（A-3 逐字不变——其写权只来自确认发行与四棵预授权目录）。
  const confinedWriteSet: readonly string[] =
    builtInGovernance && !isTrio ? [] : (staticScope?.writeSet ?? []);

  const baseGate: WriteGate = confirmationMode
    ? (p) =>
        resolveWrite(
          p,
          setup.role.boundary,
          scopeWithPreauthorizedWrites(
            { writeSet: [...confinedWriteSet, ...issued], conditions },
            p,
            input.project.projectRoot,
            preauthorization,
          ),
          gateCtx,
        )
    : hasPreauthorization && staticScope !== undefined
      ? (p) =>
          resolveWrite(
            p,
            setup.role.boundary,
            scopeWithPreauthorizedWrites(staticScope, p, input.project.projectRoot, preauthorization),
            gateCtx,
          )
      : buildGate(setup.role, input.project, input.scope);

  // D 批：门禁/账本撤除；仅保留 `forbiddenWritePaths`（应用治理记录/其他治理角色资料）硬拒绝，
  // 其余写入交给 `resolveWrite` 的写区/预授权判定。
  const gate: WriteGate = trioSpec !== undefined
    ? (p) => {
        const rel = projectRelativeLexical(p, input.project.projectRoot);
        const forbidden = forbiddenWriteDecision(trioSpec!, rel);
        if (forbidden !== undefined) {
          log.record("governance.write.forbidden", { path: rel ?? p });
          return forbidden;
        }
        return baseGate(p);
      }
    : baseGate;

  // 客户通道包装（A-3）：客户确认后，把「已预览且校验在边界内的具体路径」发行进 writeSet。
  // trio 追加（评审 §5.7/§5.8）：
  //   · 按角色校验 cardKind 白名单——越权**不弹卡**，直接返回 declined（fail-closed）；
  //   · 客户作出决定后，按 cardKind + 选项 id 写 `customer.decision`（同步更新内存快照并异步落盘）；
  //   · 账本只记 `CustomerInputOutcome` 与工具调用证据，不采信角色自述；unavailable 不写（无决定）。
  const governedInput: CustomerInputFn | undefined = confirmationMode
    ? (() => {
        const issue = createConfirmedWriteIssuer({
          boundary: setup.role.boundary,
          conditions,
          ctx: { skillRoot: input.project.skillRoot, projectRoot: input.project.projectRoot },
          issued,
        });
        const raw = input.customerInput!;
        return async (req, metadata) => {
          const originalMetadata = metadata === undefined ? undefined : { ...metadata };
          let cardKind = req.cardKind ?? originalMetadata?.cardKind;
          let effectiveReq = req;
          let effectiveMetadata = originalMetadata;
          // 2026-10-22 无效治理卡守卫（设计 §4.5/§4.6，N1 严格口径）：五个内置治理角色的 confirm 卡
          // 必须在**触达客户通道之前**带齐 `cardKind`（且属于该角色白名单）与合法 `flowId`。
          // 缺任何一项 ⇒ fail-closed 拒绝本次发卡：不调 raw、不计算 judgeContext、不镜像、不写账本、
          // 不发行写集/不占 pending-queued；工具回执据 `notPresented` 如实说明「卡片未发出」。
          // 2026-10-20 的 confirm `cardKind` 机械兜底已由本严格口径取代并删除（choice 兜底保持不变）。
          // 2026-10-20：choice 卡同样按内置治理角色默认（Lead 的 intent-confirm 等）；显式 cardKind 优先。
          // 2026-10-26 安全缺口（协调）：卡内出现任一 `recommended:true` ⇒ 很可能是**漏传 cardKind 的
          // decision 卡**，**不得**走 choice 默认兜底——尤其 Convener 的 appointment 默认会把材料性选择
          // 误当任命卡（发生在桌面校验之前，并可能写 appointment 账本）。识别必须在默认逻辑之前。
          if (isTrio && cardKind === undefined && req.kind === "choice" && !hasRecommendedOption(req)) {
            const defaulted = defaultGovernanceChoiceCardKind(
              trioSpec!.id,
              req.options.map((option) => option.id),
            );
            if (defaulted !== undefined && TRIO_CARD_KINDS[trioSpec!.id].includes(defaulted)) {
              cardKind = defaulted;
              effectiveReq = { ...req, cardKind: defaulted };
              effectiveMetadata = { ...(originalMetadata ?? {}), cardKind: defaulted };
              log.record("governance.cardKind.defaulted", {
                roleId: setup.role.id,
                cardKind: defaulted,
                kind: "choice",
              });
            }
          }
          // 2026-10-26 decision 卡 fail-closed（与桌面 `evaluateDecisionCardRequest` 的 `missing-card-kind`
          // 同向，且对 CLI 通道同样生效）：内置治理角色发出的 choice 卡带 `recommended:true` 却没有
          // `cardKind` ⇒ 卡种不明；不默认、不触达客户、不写账本，要求显式携带 cardKind（如 decision）重试。
          if (isTrio && req.kind === "choice" && cardKind === undefined && hasRecommendedOption(req)) {
            log.record("governance.card.rejected", {
              state: "not-presented",
              reasonCode: "missing-card-kind",
              ok: false,
            });
            return {
              outcome: "declined",
              notPresented: true,
              reason:
                "choice 卡包含 recommended 推荐项但缺少 cardKind，无法确定为 decision 卡" +
                "（不会默认成 appointment/提案/验收等任何卡种）；本次未向客户发卡、未写账本。" +
                "请显式携带 cardKind（如 decision）后重试。",
            };
          }
          // 2026-10-29（方案 v2.1 §5.1/M3）：招人决定卡（appointment）——只有人事可发；选项必须恰为
          // 最新名单角色（多选）；推荐集由应用从名单生成（不采信模型自报）。不满足 ⇒ 不发卡。
          let appointmentRecommendedRoleIds: string[] | undefined;
          if (cardKind === "appointment") {
            const rejectAppointment = (reason: string) => {
              log.record("governance.card.rejected", {
                state: "not-presented",
                reasonCode: "appointment-invalid",
                ok: false,
              });
              return { outcome: "declined" as const, notPresented: true as const, reason };
            };
            if (!isTrio || trioSpec?.id !== "nominator") {
              return rejectAppointment(
                "招人决定卡（appointment）只能由人事（nominator）发起；本次未向客户发卡、未写任何记录。",
              );
            }
            const appointmentFlowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            if (typeof appointmentFlowId !== "string" || appointmentFlowId.trim() === "") {
              return rejectAppointment("招人决定卡缺少 flowId（用于定位最新人员名单）；本次未向客户发卡。");
            }
            if (effectiveReq.kind !== "choice") {
              return rejectAppointment("招人决定卡必须是 choice 卡（多选名单角色）；本次未向客户发卡。");
            }
            const roster = await loadLatestRoster({ projectRoot: input.project.projectRoot, flowId: appointmentFlowId });
            if (!roster.ok) {
              return rejectAppointment(`招人决定卡前置不满足：${roster.reason} 请先让策划产出合法名单。`);
            }
            const rosterCard = validateAppointmentCardAgainstRoster({
              roster: roster.roster,
              optionIds: effectiveReq.options.map((option) => option.id),
              multiple: effectiveReq.multiple === true,
            });
            if (!rosterCard.ok) {
              return rejectAppointment(`招人决定卡与最新名单不一致：${rosterCard.reason} 本次未向客户发卡。`);
            }
            appointmentRecommendedRoleIds = rosterCard.recommendedRoleIds;
          }
          // 2026-10-26（独立验收 F2）：decision 卡结构校验的**单一共享实现**（`common/编排/decision-card.ts`）。
          // 在触达客户通道**之前**执行——CLI、single su 与项目角色没有桌面卡校验，必须由编排兜住；
          // 不通过 ⇒ declined + notPresented（不调 raw、不写账本、不带 operatorId）。桌面窗口后续经本文件
          // （Pipeline 公共出口）复用同一函数，不复制第二份。
          if (cardKind === "decision") {
            const validation = validateDecisionCardRequest({
              request: effectiveReq,
              roleId: setup.role.id,
              governanceModel,
              metadata: effectiveMetadata,
            });
            if (!validation.ok) {
              log.record("governance.card.rejected", {
                state: "not-presented",
                reasonCode: validation.reasonCode,
                ok: false,
              });
              return {
                outcome: "declined",
                notPresented: true,
                reason: decisionCardRejectionReason(setup.role.id, validation),
              };
            }
          }
          // 2026-10-20 真机：Lead 的通用 choice（如 keep-v1/do-v2/lead-decide）没有 confirm 选项，属于
          // **内部协调/工程决策**，不应呈现客户；显式 intent-confirm 缺 confirm 也同样拒绝。
          // 不发卡、不发行、不调判断、不写 customer.decision（客户只处理 intent-confirm 需求确认）。
          if (isTrio && req.kind === "choice" && isCoordinatorGovernanceSpec(trioSpec)) {
            const optionIds = req.options.map((option) => option.id);
            if (!optionIds.includes("confirm") && (cardKind === undefined || cardKind === "intent-confirm")) {
              const reason = cardKind === "intent-confirm"
                ? "intent-confirm 必须有 confirm/revise 选项；本卡缺少 confirm 选项，未向客户呈现。请补齐选项后重试。"
                : "这是内部协调/工程决策，不应要求客户选择；请幕僚自行决定，或用 dispatch_task 派给项目角色；客户只处理 intent-confirm 需求确认。";
              log.record("governance.choice.rejected", {
                roleId: setup.role.id,
                reason,
                optionIds,
              });
              return { outcome: "declined", reason };
            }
          }
          if (isTrio) {
            const allowed = TRIO_CARD_KINDS[trioSpec!.id];
            const flowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            // C 批（方案 §6.4.1/R2）：归属键由 `flowId` 放宽为 `flowId | intentId | taskId` 至少一个；
            // 旧调用（只带 flowId）逐字仍有效。优先 flowId，其次 intentId，最后 taskId。
            const attributionId = isGovernanceFlowId(flowId)
              ? flowId
              : isGovernanceFlowId(effectiveMetadata?.intentId)
                ? effectiveMetadata!.intentId
                : isGovernanceFlowId(effectiveMetadata?.taskId)
                  ? effectiveMetadata!.taskId
                  : undefined;
            if (req.kind === "confirm") {
              // 严格口径（设计 §4.5 顺序）：1) 缺 cardKind → 拒；2) 显式 cardKind 越权 → 拒（既有文案）；
              // 3) flowId 缺失/格式非法 → 拒；此后才进入既有 preview/YAML 闸与 judgeContext 计算。
              const rejectNotPresented = (reason: string, reasonCode: string): CustomerInputOutcome => {
                // 诊断只用共享白名单字段（state/reasonCode/ok）；flowId/cardKind 不在白名单，不记录。
                log.record("governance.card.rejected", { state: "not-presented", reasonCode, ok: false });
                return { outcome: "declined", reason, notPresented: true };
              };
              const flowIdOk = attributionId !== undefined;
              const allowedConfirmKinds = confirmCardKindsOf(trioSpec!.id);
              const allowedText = allowedConfirmKinds.length > 0 ? allowedConfirmKinds.join(" / ") : "无";
              const bothHint =
                `治理角色的 request_confirmation 必须同时携带归属键（flowId / intentId / taskId 至少一个）与 cardKind（本角色允许：${allowedText}）；` +
                "本次未发行任何写入路径、未写入账本。";
              if (cardKind === undefined) {
                const missing = ["缺少 cardKind"];
                if (!flowIdOk) {
                  missing.push(`缺少合法的 flowId（或 intentId/taskId；须为非空小写 slug，匹配 ${GOVERNANCE_SLUG_PATTERN}）`);
                }
                return rejectNotPresented(
                  `${missing.join("；")}。${bothHint}`,
                  flowIdOk ? "missing-card-kind" : "missing-card-kind-and-flow-id",
                );
              }
              if (!allowed.includes(cardKind)) {
                log.record("governance.cardKind.rejected", {
                  roleId: setup.role.id,
                  cardKind,
                  allowed: [...allowed],
                });
                return {
                  outcome: "declined",
                  reason:
                    `治理角色 ${setup.role.id} 不允许 cardKind=${cardKind}；` +
                    `允许：${allowed.join(" / ")}。本次未向客户发卡。`,
                };
              }
              if (!flowIdOk) {
                return rejectNotPresented(
                  `缺少合法的 flowId（或 intentId/taskId；须为非空小写 slug，匹配 ${GOVERNANCE_SLUG_PATTERN}）。${bothHint}`,
                  "missing-flow-id",
                );
              }
              // 设计 §4.2：主入口（旧 liaison / 新 chief）的确认卡一律拒绝（其确认卡允许集为空；
              // 需求确认只走 request_choice 的 intent-confirm）。即便直接调用包装器给出白名单内的
              // choice 类 cardKind 也不放行。
              if (isCoordinatorGovernanceSpec(trioSpec)) {
                return rejectNotPresented(
                  `治理角色 ${trioSpec!.id} 不使用 request_confirmation 做治理写盘；确认卡一律不发送` +
                    "（需求确认请用 request_choice 的 intent-confirm）。本次未发行任何写入路径、未写入账本。",
                  "role-not-allowed",
                );
              }
              currentFlowId = flowId;
            } else {
              if (cardKind !== undefined && !allowed.includes(cardKind)) {
                log.record("governance.cardKind.rejected", {
                  roleId: setup.role.id,
                  cardKind,
                  allowed: [...allowed],
                });
                return {
                  outcome: "declined",
                  reason:
                    `治理角色 ${setup.role.id} 不允许 cardKind=${cardKind}；` +
                    `允许：${allowed.join(" / ")}。本次未向客户发卡。`,
                };
              }
              if (isGovernanceFlowId(flowId)) currentFlowId = flowId;
            }
          }
          // 2026-10-19 真机 op-2 修复（呈现前 fail-closed）：写盘类确认卡声明了写入路径时，preview
          // 必须对**每一条**路径给出可核对正文/结构。不完整 ⇒ **不发卡**、不发行任何写入路径，直接
          // 把缺正文的路径与重试要求如实交回模型（不让「证据完整性」依赖判断 agent/模型自觉）。
          // 非写盘确认（无路径）与 choice 卡：declaredPaths 为空 ⇒ 旧行为逐字不变。
          const completeness = validateConfirmPreviewCompleteness(effectiveReq);
          if (!completeness.ok) {
            log.record("confirmation.preview.incomplete", {
              roleId: setup.role.id,
              declaredPaths: completeness.declaredPaths,
              missingPaths: completeness.missingPaths,
            });
            return {
              outcome: "declined",
              reason:
                `确认卡未呈现：preview 未包含以下声明写入路径的可核对正文/结构：${completeness.missingPaths.join("、")}。` +
                `每条声明路径都必须以标题（如 \`## <路径>\`）或代码围栏说明（如 \`\`\`md <路径>\`\`\`）出现，` +
                `且其后紧跟该路径的完整正文/代码块（至少一行非空内容）。` +
                `请把每条路径的完整正文或明确结构放进同一个 preview 后重试，并继续在 paths 参数中逐条列出这些路径；` +
                `本次未向客户发卡，也未发行任何写入路径。`,
            };
          }
          // 2026-10-29（方案 v2.1 §5.1/M4）：名单给该角色的授权目录（boundary 条目必须 ⊆ 名单目录）。
          // 最新名单可读时强制；不可读时由 M11 的 D3 名单版本校验兜底（新链 D3 必带名单 version/hash）。
          let appointmentAllowedDirectories: string[] | undefined;
          const previewCardKind = effectiveReq.cardKind ?? effectiveMetadata?.cardKind;
          if (previewCardKind === "appointment-write") {
            const previewFlowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            const previewTarget = typeof effectiveMetadata?.targetRoleId === "string" ? effectiveMetadata.targetRoleId.trim() : "";
            if (typeof previewFlowId === "string" && previewFlowId !== "" && previewTarget !== "") {
              const roster = await loadLatestRoster({ projectRoot: input.project.projectRoot, flowId: previewFlowId });
              if (roster.ok) {
                appointmentAllowedDirectories = rosterDirectoriesFor(roster.roster, previewTarget) ?? [];
              }
            }
          }
          // C-06（方案 §6.4.1/R2）：appointment-write 预览结构校验（新路径 targetRoleId/decisionId +
          // 角色卡目录/必需章节/boundary YAML）。旧 flow 路径（只带 flowId）不新增门槛；失败不发卡。
          const appointmentPreviewError = validateAppointmentWritePreview({
            request: effectiveReq,
            metadata: effectiveMetadata,
            declaredPaths: completeness.declaredPaths,
            ...(appointmentAllowedDirectories !== undefined ? { allowedDirectories: appointmentAllowedDirectories } : {}),
          });
          if (appointmentPreviewError !== undefined) {
            log.record("governance.card.rejected", {
              state: "not-presented",
              reasonCode: "appointment-write-structure",
              ok: false,
            });
            return { outcome: "declined", notPresented: true, reason: appointmentPreviewError };
          }
          // D 批：judgeContext 只从申请上下文构造（无账本/flow 事实）；Q4 A rubric 保留。
          let judgeMetadata = effectiveMetadata;
          if (isTrio && cardKind !== undefined && TRIO_CARD_KINDS[trioSpec!.id].includes(cardKind)) {
            const flowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            const judgeAttribution = isGovernanceFlowId(flowId)
              ? flowId
              : isGovernanceFlowId(effectiveMetadata?.intentId)
                ? effectiveMetadata!.intentId
                : isGovernanceFlowId(effectiveMetadata?.taskId)
                  ? effectiveMetadata!.taskId
                  : undefined;
            if (judgeAttribution !== undefined) {
              const targetRoleId =
                typeof effectiveMetadata?.targetRoleId === "string" ? effectiveMetadata.targetRoleId.trim() : "";
              const facts = buildGovernanceJudgeFacts({
                flowId: judgeAttribution,
                ...(cardKind === "appointment-write" && targetRoleId !== ""
                  ? { facts: { appointmentTargetRoleIds: [targetRoleId] } }
                  : {}),
              });
              const judgeContext: GovernanceJudgeContext = {
                flowId: judgeAttribution,
                facts,
                ...(cardKind === "appointment" && appointmentRecommendedRoleIds !== undefined
                  ? { recommendedRoleIds: appointmentRecommendedRoleIds }
                  : {}),
                ...(effectiveMetadata?.toolCallId !== undefined ? { toolCallId: effectiveMetadata.toolCallId } : {}),
                ...(effectiveMetadata?.turnId !== undefined ? { turnId: effectiveMetadata.turnId } : {}),
                ...(effectiveReq.kind === "confirm" && effectiveReq.paths !== undefined ? { paths: [...effectiveReq.paths] } : {}),
              };
              judgeMetadata = { ...(effectiveMetadata ?? {}), judgeContext };
            }
          }
          const out = await raw(effectiveReq, judgeMetadata);
          // 发行「已确认且在边界内」的实际写入路径（D 批无账本；发行器仍按同一份校验）。
          issue(effectiveReq, out ?? null, effectiveMetadata);
          return out;
        };
      })()
    : undefined;

  // —————— 2026-10-29（方案 v2.1 §6.3/§6.5）：shell 写目标守卫 + 执行后写审计 ——————
  // checkWrite 与 F4 写区判定**同一实现**（gate → resolveWrite，含 forbiddenWritePaths 与任务 scope 收窄）；
  // 守卫不另写第二份真实路径判定。显式写目标越界即拒；不透明执行交客户本人（manualOnly）。
  const shellCheckWrite = (relPath: string): { allowed: boolean; reason?: string } => {
    const decision = gate(relPath);
    return decision.allowed === true ? { allowed: true } : { allowed: false, reason: decision.reason };
  };
  const shellWriteGuard = (req: ShellReviewRequest) =>
    evaluateShellWriteTargets({
      argv: req.argv,
      cwd: req.cwd,
      projectRoot: input.project.projectRoot,
      skillRoot: input.project.skillRoot,
      boundary: setup.role.boundary,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      conditions,
      forbiddenPrefixes: trioSpec?.forbiddenWritePaths ?? [],
      checkWrite: shellCheckWrite,
    });
  // 执行后写审计（仅在 shell 已 arm 时挂到 run_shell；缺省无副作用）。
  // 2026-10-29（客户 Q1/Q2 口径修正）：不透明执行/脚本命令的审查上下文（有界脚本内容）；
  // 内容不可读/超限/脚本在项目外 ⇒ 返回不可用（shell-gate fail-closed 拒绝）。
  const shellApprovalContextLoader = (req: ShellReviewRequest) =>
    buildShellApprovalContext({
      request: req,
      projectRoot: input.project.projectRoot,
      checkWrite: shellCheckWrite,
    });
  const shellPostAudit = createShellPostAudit({
    projectRoot: input.project.projectRoot,
    forbiddenPrefixes: trioSpec?.forbiddenWritePaths ?? [],
    checkWrite: shellCheckWrite,
  });

  // 回交（设计 §10.8）：角色会话 settle → 编排发 `handback` 事件，交回治理角色。
  // **星形最小系统（2026-10-29 客户实测）**：内置 worker（产品/策划/人事/运营/质检）也是幕僚的 worker，
  // 必须能经 `submit_report` 回报任务；仅幕僚本人（不自我回交）与 single/su 旧模型（非 trio）不注入。
  const suppressHandback =
    builtInGovernance && (trioSpec === undefined || trioSpec.id === "chief");

  // 交报告（C-1）：**只给回交主体（非 su）**注入 `reportHandback`——模型经 `submit_report` 交的报告
  // （`summary`/`evidence`/`status`）正常终局优先取报告值；su 不注入。无合法报告明确未报告。
  // 报告按运行时轮次保存，终局消费。无 metadata 的旧替身仅保留单轮兼容值。
  const taskReports = new Map<string, TaskReport>();
  const completedTurns = new Set<string>();
  let legacyReport: TaskReport | undefined;
  const turnIntents = new Map<string, HandbackIntent>();
  let legacyIntent: HandbackIntent | undefined;
  const reportHandback = suppressHandback
    ? undefined
    : (report: TaskReport, metadata?: ReportHandbackMetadata): ReportHandbackReceipt => {
        const turnId = metadata?.turnId;
        const normalized = normalizeTaskReport(report);
        const invalidMetadata = metadata !== undefined && (typeof turnId !== "string" || turnId === "");
        if (normalized === undefined || invalidMetadata || (turnId !== undefined && completedTurns.has(turnId))) {
          log.record("report.ignored", { turnId, reasonCode: normalized === undefined ? "invalid-report" : invalidMetadata ? "invalid-turn" : "closed-turn" });
          return { ok: false, message: "报告无效或所属轮次已关闭，未接收。" };
        }
        if (turnId !== undefined) taskReports.set(turnId, normalized);
        else legacyReport = normalized;
        log.record("report.received", { turnId, state: normalized.status, reportSource: "submit_report", count: normalized.evidence?.length ?? 0 });
        return { ok: true, state: "accepted-memory" };
      };

  // D-1：能力面携带所选角色/runtime 的路径；实际 store 由 Service 按所选 runtime 建立。
  // 编排只**算路径**、**不预建目录**（创建归适配器在真正落盘时做——理由见 AdapterCapabilities.sessionDir）。
  // projectRoot 为空 / roleId 不安全 / **`persistSession:false`（R-1 审读会话）** → 不传（in-memory）。
  const sessionDir =
    input.persistSession === false ? undefined : sessionDirFor(input.project.projectRoot, setup.role.id, input.runtime);

  // H-1 派发任务（评审 §5.6）：能力矩阵驱动——仅 `capabilities.dispatchTask`（trio=Convener；su 旧行为）。
  // B 批（2026-10-28）：**幕僚（trio chief）的星形派发不套旧 flow 派发门**——任务/汇报主链走
  // `tasks.jsonl`，目标由桌面星形路由校验（任意内置/项目 worker、自身除外）。convener 的旧 dispatch
  // 仍逐字走原派发范围门（保留至 D）；single/su 旧行为不变。
  const chiefStarDispatch = trioSpec?.id === "chief";
  const dispatchTask: DispatchTaskFn | undefined =
    cap?.dispatchTask === true && input.dispatchTask !== undefined ? input.dispatchTask : undefined;

  // G-2 看护三能力（R1/R2）：能力矩阵驱动——仅 `capabilities.roleStatus/sessionTail/proposeRecovery`
  // （trio=Convener；su 旧行为）。未注入 ⇒ 不注入（能力缺席 = 最强 fail-closed）。
  // 承载契约（字段名/形状）单一来源：`common/编排/watchdog.ts`。
  // B 批（2026-10-28）：chief 经上方能力叠加获得 roleStatus/sessionTail；`role_activity_log` 只给 chief。
  const roleStatus = cap?.roleStatus === true ? input.roleStatus : undefined;
  const sessionTail = cap?.sessionTail === true ? input.sessionTail : undefined;
  const roleActivityLog = trioSpec?.id === "chief" ? input.roleActivityLog : undefined;
  const terminateRoleRun = trioSpec?.id === "chief" ? input.terminateRoleRun : undefined;
  const redispatchTask = trioSpec?.id === "chief" ? input.redispatchTask : undefined;

  // G-4 技能安装/卸载两能力（I1/I2）：能力矩阵驱动——仅 `capabilities.installSkill`
  // （trio=Nominator；su 旧行为）。字段名**逐字**＝契约家能力名（错一名 ⇒ 工具静默零注册）。
  const installSkill = cap?.installSkill === true ? input.installSkill : undefined;
  const uninstallSkill = cap?.installSkill === true ? input.uninstallSkill : undefined;

  // G-4 V2 MCP 安装/卸载两能力：能力矩阵驱动——仅 `capabilities.installMcp`
  // （trio=Nominator；su 旧行为）。**安装不改变任何角色的写边界**。
  const installMcp = cap?.installMcp === true ? input.installMcp : undefined;
  const uninstallMcp = cap?.installMcp === true ? input.uninstallMcp : undefined;

  // I-1 开放 shell（项目角色三层链）+ 审批档/只读档——共用同一个 `shellGate` 能力位
  // （「注入才注册」：注入了 ⇒ 适配器注册 `run_shell`；未注入/装配失败 ⇒ **不 arm**，fail-closed）。
  // 能力位按角色数据驱动（客户 2026-10-19 新规则：所有角色都有 shell 权限，含读写与任意命令，
  // 但一律经审批链；不按角色 id 硬编码）：
  //   · `shell: "operator-approve"`（五个内置治理角色 liaison/rapporteur/nominator/convener/verifier
  //     ＋ su 统一为该档）→ 审批档：只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/
  //     判断 agent 审批；保留旧 `shellReadonly` 注入作为兼容路径（旧调用方/测试仍可使用；两档同时
  //     给出 ⇒ 不 arm）；
  //   · `shell: "none"` / `"readonly"` → **仅为旧数据/兼容保留**（新注册项不得再用）；`none` 即使
  //     调用方误传选项也拒绝并记诊断，`readonly` 仍可走只读档（更严，不放宽）；
  //   · 项目角色（cap undefined）→ 既有三层链/只读路径**逐字不变**。
  let shellGate: ShellGate | undefined;
  if (input.shellOperatorOnly !== undefined) {
    if (input.shellReadonly !== undefined) {
      // 互斥：不择一静默生效（PM 评审 §3.4）。
      log.record("shell.operatorOnly.rejected", { mode: "shellOperatorOnly", outcome: "not-armed", reasonCode: "conflicts-with-shellReadonly" });
    } else if (cap?.shell !== "operator-approve") {
      // 审批档只属于能力位声明 `operator-approve` 的角色（2026-10-19 起＝五个内置治理角色＋su）；
      // 项目角色（cap undefined）/旧能力位误传不得把三层链绕成「客户全权审批」。
      log.record("shell.operatorOnly.rejected", { mode: "shellOperatorOnly", outcome: "not-armed", reasonCode: "capability-denied" });
    } else {
      try {
        shellGate = await assembleOperatorShellGate({ project: input.project, ...input.shellOperatorOnly, writeGuard: shellWriteGuard, snapshotBefore: (req) => shellPostAudit.snapshotBefore(req), approvalContextLoader: shellApprovalContextLoader });
      } catch (err) {
        log.error("shell.arming.failed", err);
        shellGate = undefined; // 装配失败 ⇒ 不 arm（能力缺席 = fail-closed，run_shell 不注册）
      }
    }
  } else if (input.shellReadonly !== undefined) {
    if (cap !== undefined && cap.shell === "none") {
      // 旧能力位 `shell: "none"`（历史数据/兼容）：没有 shell 面；新注册项不得再用（2026-10-19）。
      log.record("shell.readonly.rejected", { outcome: "not-armed", reasonCode: "capability-denied" });
    } else {
      try {
        shellGate = await assembleReadonlyShellGate({ project: input.project, ...input.shellReadonly });
      } catch (err) {
        log.error("shell.arming.failed", err);
        shellGate = undefined; // 装配失败 ⇒ 不 arm（能力缺席 = fail-closed，run_shell 不注册）
      }
    }
  } else if (!builtInGovernance && input.shellOperatorChannel !== undefined) {
    try {
      shellGate = await assembleProjectShellGate({
        project: input.project,
        operatorChannel: input.shellOperatorChannel,
        sessionDeps: { ...deps, createAdapter: deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "pi", deps.runtimeOptions) },
        ...(input.shellArming ?? {}),
        runtime: input.runtime,
        ...(input.routineShellPolicy !== undefined ? { routineShellPolicy: input.routineShellPolicy } : {}),
        writeGuard: shellWriteGuard,
        snapshotBefore: (req) => shellPostAudit.snapshotBefore(req),
        approvalContextLoader: shellApprovalContextLoader,
      });
    } catch (err) {
      log.error("shell.arming.failed", err);
      shellGate = undefined;
    }
  }

  // 需求变更申请：只给内置治理角色中的报告员/统筹注入（沿用 C 批发起方规则）。
  const requestRequirementChange: RequestRequirementChangeFn | undefined =
    isTrio && (trioSpec?.id === "rapporteur" || trioSpec?.id === "convener") && input.requestRequirementChange !== undefined
      ? input.requestRequirementChange
      : undefined;

  const capabilities: AdapterCapabilities = {
    ...(governedInput !== undefined ? { customerInput: governedInput } : {}),
    ...(reportHandback !== undefined ? { reportHandback } : {}),
    // 2026-10-26 图片查看（view_image）：**通用只读能力**——项目角色与内置治理角色都注入（只要调用方
    // 提供；不按角色收窄）；未提供 ⇒ 字段缺席、工具不注册（同 dispatch_task 的「注入才注册」先例）。
    // 不影响其他能力的注入矩阵。
    ...(input.viewImage !== undefined ? { viewImage: input.viewImage } : {}),
    ...(sessionDir !== undefined ? { sessionDir } : {}),
    ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
    ...(input.persistSession !== undefined ? { persistSession: input.persistSession } : {}),
    ...(dispatchTask !== undefined ? { dispatchTask } : {}),
    ...(requestRequirementChange !== undefined ? { requestRequirementChange } : {}),
    // D 批：验收产物汇报能力已撤除（不注入 reportArtifact）；
    // 未注入 ⇒ 字段缺席、工具不注册（能力缺席 = 最强 fail-closed）。本层只透传同一引用，不包装、
    // 不调用、不写盘/flow、不伪造接受或决定。
    ...(roleStatus !== undefined ? { roleStatus } : {}),
    ...(sessionTail !== undefined ? { sessionTail } : {}),
    ...(roleActivityLog !== undefined ? { roleActivityLog } : {}),
    ...(terminateRoleRun !== undefined ? { terminateRoleRun } : {}),
    ...(redispatchTask !== undefined ? { redispatchTask } : {}),
    ...(installSkill !== undefined ? { installSkill } : {}),
    ...(uninstallSkill !== undefined ? { uninstallSkill } : {}),
    ...(installMcp !== undefined ? { installMcp } : {}),
    ...(uninstallMcp !== undefined ? { uninstallMcp } : {}),
    ...(shellGate !== undefined ? { shellGate } : {}),
    ...(shellGate !== undefined ? { shellPostAudit: shellPostAudit.auditAfter } : {}),
    ...(input.shellVerdict !== undefined ? { shellVerdict: input.shellVerdict } : {}),
  };
  const createAdapter = deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "pi", deps.runtimeOptions);
  const adapter = createAdapter(
    gate,
    Object.keys(capabilities).length > 0 ? capabilities : undefined,
  );
  let session: RoleSession;
  try {
    session = await adapter.bindRole(setup.role);
  } catch (err) {
    log.error("session.open.failed", err);
    throw err;
  }
  boundSessionForEvidence = session;
  log.record("session.open.ready");

  // 自动收尾的授权边界 = **本会话解析出的边界**（创世态下即治理种子边界；普通角色下即其项目
  // 边界）——与 su 同一授权。治理边界文档落点：项目未声明（如桌面创世 `path` 为空串）时用默认约定路径。
  const govPath = input.project.governanceBoundary?.path || DEFAULT_GOVERNANCE_BOUNDARY_REL;

  // 自动收尾 + 自动重 pin（A-4 / §13.3）：缺省仅**内置治理角色（su）会话**开启。
  // `repinIfBootstrapped`：创世态 = **首次收尾**（无可 pin 之物 → 零副作用）；非创世态 = 重扫更新 pin。
  const autoRepinEnabled = input.autoRepin ?? setup.role.kind === "built-in-governance";

  let disposed = false;
  // F-5-opt1：排入的模型可见注记（下一次 send 的输入前缀；送达一次即消费——见 queueModelNotice 文档）。
  let pendingModelNotice: string | undefined;
  const persistenceSubscriptions = new Set<() => void>();
  const boundRoleId = setup.role.id;
  const protectionContext = { credentialEnvNames: trustedCredentialNames(deps.runtimeOptions) };

  async function recordFinalHandback(event: HandbackEvent): Promise<HandbackEvent> {
    const handback = event.handback;
    const draft: RuntimeLiveReportDraftV1 = {
      source: { roleId: boundRoleId },
      taskId: handback.taskId ?? null,
      origin: handback.origin,
      status: handback.status,
      summary: handback.summary,
      evidence: handback.evidence,
      at: handback.at,
    };
    if (handback.runtime !== undefined) draft.source.runtime = handback.runtime;
    if (handback.turnId !== undefined) draft.source.turnId = handback.turnId;
    let liveReport;
    try {
      liveReport = projectRuntimeLiveHandback(draft, protectionContext);
    } catch {
      log.record("report.projection.failed", { errorCode: "INVALID" });
      return { kind: "handback", summary: "报告安全显示内容生成失败。", handback,
        reportPersistence: { state: "failed", code: "INVALID", retryAvailable: false } };
    }
    const safe: HandbackEvent = { ...event, summary: `回交 su：${liveReport.summary.text}`, liveReport };
    const persistence = session.persistence;
    if (persistence === undefined || handback.turnId === undefined) {
      safe.reportPersistence = { state: "unknown-live", retryAvailable: false };
      return safe;
    }
    if (persistence.mode === "disabled") {
      safe.reportPersistence = { state: "disabled", code: "PERSISTENCE_DISABLED", retryAvailable: false };
      return safe;
    }
    // Core owns the actual bound scope, ended-turn validation, safe snapshot and retries.
    let result: ReportSaveResultV1;
    try {
      result = await persistence.recordFinalReport({
        ...draft,
        source: { roleId: boundRoleId, runtime: persistence.scope.runtime, turnId: handback.turnId },
        origin: handback.origin ?? "terminal-fallback",
      });
    } catch {
      log.record("report.persistence.failed", { turnId: handback.turnId, errorCode: "PERSIST_FAILED" });
      safe.reportPersistence = { state: "failed", code: "PERSIST_FAILED", retryAvailable: false };
      return safe;
    }
    if (result.report !== undefined) {
      safe.report = result.report;
      safe.liveReport = { source: result.report.source, taskId: result.report.taskId, origin: result.report.origin,
        status: result.report.status, summary: result.report.summary, evidence: result.report.evidence,
        evidenceOmitted: result.report.evidenceOmitted, at: result.report.at };
      safe.summary = `回交 su：${result.report.summary.text}`;
    }
    if (result.ok) {
      safe.reportPersistence = { state: "saved", reportId: result.report.reportId, retryAvailable: false };
    } else {
      let state: NonNullable<HandbackEvent["reportPersistence"]>["state"] = "failed";
      if (result.state === "expired") state = "expired";
      safe.reportPersistence = { state, reportId: result.reportId, code: result.code, retryAvailable: result.retryAvailable };
    }
    return safe;
  }
  const base: RoleSessionHandle = {
    get persistenceMode() {
      if (session.persistence !== undefined) return session.persistence.mode;
      return "unknown-live";
    },
    async retryReportPersistence(reportId) {
      if (disposed) return { ok: false, state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false, message: "原会话已关闭。" };
      if (session.persistence) return session.persistence.retryReportPersistence(reportId);
      return { ok: false, state: "unsupported", code: "UNSUPPORTED", retryAvailable: false, message: "当前会话不支持报告保存。" };
    },
    async getReportPersistence(reportId) {
      if (disposed) return { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false };
      if (session.persistence) return session.persistence.getReportPersistence(reportId);
      return { state: "unsupported", code: "UNSUPPORTED", retryAvailable: false };
    },
    async retryDeliveryHistoryPersistence(attemptId) {
      if (disposed) return { ok: false, state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false, message: "原会话已关闭。" };
      if (session.persistence) return session.persistence.retryDeliveryHistoryPersistence(attemptId);
      return { ok: false, state: "unsupported", code: "UNSUPPORTED", retryAvailable: false, message: "当前会话不支持历史补保存。" };
    },
    async getDeliveryReceipt(attemptId) {
      if (disposed) return { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false };
      if (session.persistence) return session.persistence.getDeliveryReceipt(attemptId);
      return { state: "unsupported", code: "UNSUPPORTED", retryAvailable: false };
    },
    onPersistenceChange(listener) {
      if (disposed || session.persistence === undefined) return () => {};
      const unsubscribeCore = session.persistence.onPersistenceChange(change => {
        if (!disposed) listener(change);
      });
      const unsubscribe = () => {
        persistenceSubscriptions.delete(unsubscribe);
        unsubscribeCore();
      };
      persistenceSubscriptions.add(unsubscribe);
      return unsubscribe;
    },
    get runtime() { return session.runtime ?? input.runtime; },
    get roleId() { return session.roleId ?? setup.role.id; },
    get contextSource() { return session.contextSource; },
    get nativeSessionId() { return session.nativeSessionId; },
    get contextWarning() { return session.contextWarning; },
    async send(text: string, opts?: RoleSessionSendOptions): Promise<void> {
      legacyReport = undefined;
      // 账本快照刷新（评审 §5.7 时序边界）：每次 send 开始时重读盘面——跨会话的新客户决定在此生效；
      // 未含决定则门禁拒，绝不猜。读取失败 → 快照 errors 非空 → 门禁 fail-closed。
      // F-5-opt1：排入的模型可见注记作为**本轮输入前缀**送出（不单独开轮、不改判定；送达一次即消费）。
      const notice = pendingModelNotice;
      const outbound = notice !== undefined && notice !== "" ? `${notice}\n\n${text}` : text;
      let intent: HandbackIntent;
      if (opts?.handback !== undefined) {
        intent = { required: opts.handback.required };
        if (opts.handback.required && opts.handback.taskId) intent.taskId = opts.handback.taskId;
      } else {
        intent = { required: typeof input.taskId === "string" && input.taskId !== "" };
        if (intent.required) intent.taskId = input.taskId;
      }
      legacyIntent = intent;
      let acknowledged = false;
      let promptOptions: PromptOptions | undefined = opts;
      // Unmarked legacy doubles retain their old exact-reference/single-argument path.
      // Real runtimes and explicit Pipeline intent use the Core's synchronous opening ack.
      if (session.runtime !== undefined || opts?.handback !== undefined || opts?.onTurnStarted !== undefined) {
        const onTurnStarted = (metadata: PromptTurnStartedMetadata): void => {
          if (acknowledged || disposed || metadata.roleId !== setup.role.id
            || (session.runtime !== undefined && metadata.runtime !== session.runtime)
            || typeof metadata.turnId !== "string" || metadata.turnId === ""
            || completedTurns.has(metadata.turnId)) return;
          acknowledged = true;
          turnIntents.set(metadata.turnId, intent);
          if (legacyIntent === intent) legacyIntent = undefined;
          opts?.onTurnStarted?.(metadata);
        };
        const { handback: _pipelineIntent, ...runtimeOptions } = opts ?? {};
        promptOptions = { ...runtimeOptions, onTurnStarted };
      }
      log.record("session.send.start");
      try {
      // 图片原引用保留；真实开轮绑定路径组合 ACK，并剥离 Pipeline 专用来源字段。
        if (promptOptions === undefined) {
          await session.prompt(outbound);
        } else {
          await session.prompt(outbound, promptOptions);
        }
        log.record("session.send.end");
        // F-5-opt1：注记已随本轮输入送出 → 消费（期间若又排入新注记则保留新的那份）。
        if (pendingModelNotice === notice) pendingModelNotice = undefined;
      } catch (err) {
        // F-5-opt1：未开轮（无 ACK）→ 注记保留（输入未送达模型，下一轮重试仍带上）；开轮后失败 → 消费（避免重复投递）。
        if (acknowledged && pendingModelNotice === notice) pendingModelNotice = undefined;
        if (!acknowledged && legacyIntent === intent) legacyIntent = undefined;
        log.error("session.send.failed", err);
        throw err;
      }
    },
    // P0-2 停当前轮次：三态如实返回（形状与语义见 RoleSessionAbortResult 的文档注释）。
    // 消费规则 = 契约 `RoleSession.abort?`：可选方法，缺席 = 该运行时不支持停止，必须如实告知。
    async abort(): Promise<RoleSessionAbortResult> {
      log.record("session.abort.requested");
      if (session.abort === undefined) {
        return { ok: false, supported: false, error: "当前运行时不支持停止" };
      }
      try {
        await session.abort();
        return { ok: true, supported: true };
      } catch (err) {
        log.error("session.abort.failed", err);
        // SDK 报错如实转达（错误原文进 error），不吞、不谎报已停；不销毁会话。
        return { ok: false, supported: true, error: errText(err) };
      }
    },
    // F-5-opt1：排入一行**模型可见注记**（下一次 send 的输入前缀；送达一次即消费）。
    // 空串/非字符串忽略（不做一半的事）；语义与推荐文案见接口与 REBUILT_SESSION_WRITE_PERMITS_NOTICE。
    queueModelNotice(text: string): void {
      if (typeof text !== "string" || text.trim() === "") return;
      pendingModelNotice = text;
      log.record("session.notice.queued");
    },
    // 会话级后台任务访问面（2026-10-25，桌面任务面板）：**纯透传**底层 RoleSession 的三个可选方法。
    // 底层缺席 ⇒ 句柄属性缺席（条件展开，不伪造空实现——空数组/undefined/「已停止」都会误导消费方）。
    // stop 的结果与异常**原样返回**（不 catch、不改写 ok:false 的 reason/message）。不在此处另存任务状态，
    // 会话生命周期后的行为由底层实现回答（Service 实现在 dispose 后返回 []/undefined/closed）。
    ...(session.listBackgroundTasks !== undefined
      ? { listBackgroundTasks: (): BackgroundTaskSnapshot[] => session.listBackgroundTasks!() }
      : {}),
    ...(session.readBackgroundTask !== undefined
      ? {
          readBackgroundTask: (
            taskId: string,
            readOptions?: BackgroundTaskReadOptions
          ): BackgroundTaskReadResult | undefined => session.readBackgroundTask!(taskId, readOptions),
        }
      : {}),
    ...(session.stopBackgroundTask !== undefined
      ? {
          stopBackgroundTask: (
            taskId: string,
            stopOptions?: BackgroundTaskStopOptions
          ): Promise<BackgroundTaskStopResult> => session.stopBackgroundTask!(taskId, stopOptions),
        }
      : {}),
    events(): AsyncIterable<OrchestrationEvent> {
      const stream = session.events();
      const wrapped = suppressHandback
        ? stream
        : withHandback(stream, { roleId: setup.role.id, taskId: input.taskId }, {
            projectRoot: input.project.projectRoot,
            report: (turnId) => turnId !== undefined ? taskReports.get(turnId) : legacyReport,
            intent: (turnId) => {
              if (turnId !== undefined) return turnIntents.get(turnId);
              if (session.runtime === undefined) return legacyIntent;
              return undefined;
            },
            completed: (turnId) => {
              if (turnId !== undefined) {
                completedTurns.add(turnId);
                taskReports.delete(turnId);
                turnIntents.delete(turnId);
              } else {
                legacyReport = undefined;
                legacyIntent = undefined;
              }
            },
          });
      // 每轮 settle 后**自动收尾 / 自动重 pin**：创世态首次写出 `.ans`（+治理边界文档+manifest），
      // 非创世态重扫并更新 pin。best-effort：失败（如门禁拒）**不打断事件流**，如实走完本轮
      // （判定/落盘本体在 finalize.ts；失败结果由下次 settle 重试）。
      return (async function* () {
        for await (const ev of wrapped) {
          if (ev.kind === "handback") {
            yield await recordFinalHandback(ev);
            continue;
          }
          if (ev.kind === "settled") {
            if (autoRepinEnabled) {
              try {
                await repinIfBootstrapped({
                  projectRoot: input.project.projectRoot,
                  skillRoot: input.project.skillRoot,
                  boundary: repinBoundary,
                  governanceBoundaryPath: govPath,
                  // 评审 §5.5：创世态由调用方传当前模型；single 不传，旧 `.ans` 形状逐字不变。
                  ...(governanceModel === "trio" ? { governanceModel: "trio" as const } : {}),
                });
              } catch (err) {
                log.error("session.repin.failed", err);
                /* 自动收尾/重 pin 是 best-effort；失败不打断会话事件流 */
              }
            }
          }
          yield ev;
        }
      })();
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of [...persistenceSubscriptions]) unsubscribe();
      taskReports.clear();
      completedTurns.clear();
      legacyReport = undefined;
      turnIntents.clear();
      legacyIntent = undefined;
      log.record("session.dispose");
      await session.dispose(); // 出错如实抛出（调用方在 finally 收口）
    },
  };
  return base;
}

// —————————————————————— 共用辅助 ——————————————————————

// 角色/边界解析结果：失败带退出码（Usage=未知/缺失角色；Failure=解析异常/parseError）。
type RoleSetup = { ok: true; role: ResolvedRole } | { ok: false; code: number; reason: string };

async function setupRole(
  roleId: string,
  project: ProjectConfig,
  policy: { allowBuiltInRoles: boolean }
): Promise<RoleSetup> {
  // 未知/缺失角色判定（入口意图 + 配置声明，双约束）：
  //  - runRole（CLI `ans role run`，一次性路径）：只接受 project.roles 登记的项目角色（严格）。
  //  - openRoleSession（桌面聊天，会话式入口）：额外接受 project.builtInRoles 声明的内置治理角色。
  // 注意：门禁引擎把**未登记**角色当下沉为内置治理角色（kind=built-in-governance）——那是
  // ans govern 的语义；本层用「入口意图 + 配置声明」双重约束自行判定，**绝不因配置而放宽 CLI**：
  // 内置角色仅当本次入口允许（policy.allowBuiltInRoles）且配置显式声明（project.builtInRoles）时放行。
  const registered = project.roles ? project.roles[roleId] !== undefined : false;
  const declaredBuiltIn =
    policy.allowBuiltInRoles && (project.builtInRoles?.includes(roleId) === true);
  // 未登记且不在（本次入口允许的）内置角色清单 → 用法错误。
  if (!registered && !declaredBuiltIn) {
    return { ok: false, code: EXIT_USAGE, reason: `未知角色：${roleId || "(空)"}（未登记在 project.roles）` };
  }
  try {
    const resolved = await resolveRole(roleId, project);
    const role = resolved.boundary
      ? resolved
      : { ...resolved, boundary: await resolveBoundary(roleId, project) };
    // 边界解析失败（门禁引擎以 parseError 上报）：这是配置/环境错误，命令整体失败。
    if (typeof role.boundary.parseError === "string" && role.boundary.parseError !== "") {
      return { ok: false, code: EXIT_FAILURE, reason: `边界解析失败：${role.boundary.parseError}` };
    }
    return { ok: true, role };
  } catch (err) {
    return { ok: false, code: EXIT_FAILURE, reason: `角色/边界解析失败：${errText(err)}` };
  }
}

// 构造 gate：把 scope（可能为 undefined）原样传给 resolveWrite——无 scope 即不做任务收窄。
function buildGate(
  role: ResolvedRole,
  project: ProjectConfig,
  scope: TaskScope | undefined
): WriteGate {
  return (p) =>
    resolveWrite(p, role.boundary, scope, {
      skillRoot: project.skillRoot,
      projectRoot: project.projectRoot,
    });
}

/**
 * **会话初始预授权的路径来源**——「初始 writeSet 恒含」的写权，不经确认发行器：
 *   · `entries`：角色 Section 1 条目（2026-10-25 客户规则「写自己角色权限内的路径，直接放行」）：
 *     trio 五角色与项目角色在**无任务级 writeSet 收窄**时使用（含精确文件条目，如 Convener 的
 *     `docs/workflow.md`）；有任务 scope 时保持 F4 收窄，不并入。
 *   · `dirs`：内置治理角色的既有预授权目录——trio 注册表 `preauthorizedDirs`（2026-10-16 起；目录
 *     子集，有/无任务 scope 都生效）与旧 su（single）四棵 `docs/su`、`docs/contracts`、`docs/skills`、
 *     `docs/mcp`（客户裁定 2026-10-16；单一来源 `LEGACY_SU_PREAUTHORIZED_DIRS`），行为逐字保留。
 *
 * 语义与边界（钉死）：
 * - 它是**初始集合的一部分**——不依赖确认发行器；每次开会话/会话重建都生效。
 * - 实现口径（F4 为**精确匹配**）：求值时把「目标路径本身」的项目根相对词法路径并入本次 writeSet
 *   ——等价于该路径初始就在已发行集中。判定链其余环节（F6 接受门、F7 真实路径逃逸复核、边界条目
 *   匹配、条件激活、forbiddenWritePaths 与 trio 三道治理门禁）**逐字不变**：不在边界内/未接受/逃逸/
 *   治理门禁未放行的路径照拒，fail-closed 不放松。
 * - 其余一切路径照旧只认已发行集：未确认 = F4 拒。
 * 背景：`角色卡/编排/docs/fix/2026-10-16_fix_su-notes-preauth.md`、G-4 两批变更记录与
 * 2026-10-25 客户写入预授权规则。
 */
interface PreauthorizedWriteSources {
  /** Section 1 条目（仅 `root === "project"` 可经 writeSet 表达；见 section1EntryCovers）。 */
  entries: readonly BoundaryEntry[];
  /** 旧 su 预授权目录树（项目根相对、含子路径；按段比较）。 */
  dirs: readonly string[];
}

/** 目标路径 → **项目根相对词法路径**（取值规则与 resolveWrite 同源）；空/根外 → undefined。 */
function projectRelativeLexical(targetPath: string, projectRoot: string): string | undefined {
  const raw = typeof targetPath === "string" ? targetPath.trim() : "";
  if (raw === "") return undefined;
  const rel = isAbsoluteAny(raw) ? absRel(normalizeLexical(raw), projectRoot) : normalizeLexical(raw);
  if (rel === null || rel === "") return undefined;
  return rel;
}

/**
 * Section 1 条目是否覆盖项目根相对路径 `rel`——与 `resolveWrite` 的 `pathCovers`/`isActive` 同口径：
 * `file` 精确匹配；`directory` 按**段**前缀（`docs/mcp2` 不被 `docs/mcp` 覆盖）；`conditional-directory`
 * 还须其 slug 出现在本次 scope 的 `conditions` 中（缺 slug/非法 slug ⇒ 不激活，fail-closed）。
 * 只处理 `root === "project"` 条目：writeSet 契约为项目根相对路径，skill 根条目无法经此表达（当前
 * 可写角色边界均以项目根条目给出；skill 根条目只出现在未接受的内置回退边界）。
 */
function section1EntryCovers(e: BoundaryEntry, rel: string, conditions: readonly string[]): boolean {
  if (e.root !== "project") return false;
  if (e.kind === "conditional-directory") {
    const slug = e.condition;
    if (!isValidConditionSlug(slug) || !conditions.includes(slug)) return false;
  }
  const entryPath = normalizeLexical(e.path);
  if (e.kind === "file") return compareKey(entryPath) === compareKey(rel);
  return isUnderOrEqual(rel, entryPath);
}

/**
 * 目标路径落在预授权来源内 → 返回其项目根相对词法路径；否则 `undefined`。
 * 目录树按**段**比较（`docs/mcp2` 不被 `docs/mcp` 覆盖），大小写口径沿用共享原语。
 */
function preauthorizedRelOf(
  targetPath: string,
  projectRoot: string,
  sources: PreauthorizedWriteSources,
  conditions: readonly string[],
): string | undefined {
  const rel = projectRelativeLexical(targetPath, projectRoot);
  if (rel === undefined) return undefined;
  if (sources.dirs.some((dir) => isUnderOrEqual(rel, dir))) return rel;
  return sources.entries.some((e) => section1EntryCovers(e, rel, conditions)) ? rel : undefined;
}

/**
 * 会话 gate 求值入口：目标在预授权来源内 ⇒ 把其项目根相对路径**并入本次 writeSet**（不经发行器）；
 * 其余 ⇒ **原样返回 base**（零行为变化）。base 由调用方保证非 undefined（确认制动态集或静态 scope）；
 * `scope === undefined` 且无预授权的「不做任务收窄」会话**不经过本函数**。
 */
function scopeWithPreauthorizedWrites(
  base: TaskScope,
  targetPath: string,
  projectRoot: string,
  sources: PreauthorizedWriteSources,
): TaskScope {
  const rel = preauthorizedRelOf(targetPath, projectRoot, sources, base.conditions);
  if (rel === undefined) return base;
  return { writeSet: [...base.writeSet, rel], conditions: base.conditions };
}

/**
 * 越界写入的**归属指引**（与门禁引擎 AC3 的 Liaison 归属文案同口径；2026-10-18 协调口径）。
 * 只影响**拒绝文案**，不改变 `forbiddenWritePaths` 的放行/拒绝判定。
 * 顺序敏感：应用独占路径先于「角色卡/」等宽前缀匹配。
 */
function governanceWriteOwnerHint(rel: string): string {
  const hints: ReadonlyArray<{ prefixes: readonly string[]; guidance: string }> = [
    {
      prefixes: [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"],
      guidance: "该路径只能由应用写（治理记录/账本/边界文档/manifest），任何角色都不可写。",
    },
    {
      prefixes: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
      guidance: "该路径属报告员 Rapporteur 的写区（提案/契约）；请把客户意图交给报告员，由报告员形成提案。",
    },
    {
      prefixes: ["docs/nominations/"],
      guidance: "该路径是旧提名文件（legacy）：仅旧流程由 Crew（Nominator）写；新流程的团队计划由 Steward（Convener）写 docs/scheduling/。",
    },
    {
      prefixes: ["角色卡/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
      guidance: "该路径属 Crew（Nominator）的写区（角色卡/技能/MCP，按客户任命的团队计划写卡）；请交给 Crew。",
    },
    {
      prefixes: ["docs/scheduling/", "docs/governance/convener/"],
      guidance: "该路径属运营（Convener）的写区（计划/分析/调度记录）；请交给运营。",
    },
    {
      prefixes: ["docs/quality/", "docs/verification/", "docs/governance/verifier/"],
      guidance: "该路径属质检（Verifier）的写区（质量记录/可选核对证据）；请交给质检角色。",
    },
  ];
  for (const hint of hints) {
    const hit = hint.prefixes.some((prefix) => {
      const relLower = rel.toLowerCase();
      const prefixLower = prefix.toLowerCase();
      return prefix.endsWith("/") ? relLower.startsWith(prefixLower) : relLower === prefixLower;
    });
    if (hit) return hint.guidance;
  }
  return "该路径属应用治理记录或其他治理角色，当前角色不可写。";
}

/**
 * D 批：不再有治理账本；本函数只按角色注册表的 forbiddenWritePaths 给出拒绝与归属提示。
 */
function forbiddenWriteDecision(
  spec: GovernanceRoleSpec,
  rel: string | undefined,
): WriteDecision | undefined {
  if (rel === undefined) return undefined;
  const hit = spec.forbiddenWritePaths.some((prefix) => isUnderOrEqual(rel, prefix));
  if (!hit) return undefined;
  return {
    allowed: false,
    reason: `拒绝写入 ${rel}：${governanceWriteOwnerHint(rel)}`,
    allowedByRoot: { skill: [], project: [] },
  };
}

const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

function isGovernanceFlowId(value: unknown): value is string {
  return typeof value === "string" && GOVERNANCE_SLUG_RE.test(value);
}

/**
 * 2026-10-20 真机 bookmank op-1：Lead 的 `request_choice`（intent-confirm）漏带 cardKind ⇒ 无 judge 事件。
 * choice 卡的**角色默认**（仅当该 kind 在该角色 `TRIO_CARD_KINDS` 白名单内才生效）：
 *   liaison → intent-confirm（选项须含 confirm）；rapporteur → proposal（须含 accept）；
 *   convener → appointment（2026-10-22 第 1 项：选项为**角色 id**、不含治理卡保留选项时视为任命形状）；
 *   nominator → 不默认（Crew 只写卡，不再发任命卡）；verifier → acceptance（须含 accept）；
 *   其他/项目角色不猜。
 * 选项形状守卫避免把「普通选择卡」误判为治理决定卡（沿用旧行为）。
 * **调用点前置守卫（2026-10-26）**：`hasRecommendedOption(req)` 为真（带 `recommended:true`）时
 * **不进入本函数**——缺 cardKind 的 decision 形状卡必须 fail-closed，不得默认成 appointment 等。
 */
const APPOINTMENT_RESERVED_OPTION_IDS: ReadonlySet<string> = new Set([
  "accept",
  "accept-quick",
  "revise",
  "reject",
  "confirm",
]);

/** 任命形状：非空选项、且不含任何治理卡保留选项 id（角色 id 列表）。 */
function looksLikeAppointmentChoice(optionIds: readonly string[]): boolean {
  return optionIds.length > 0 && optionIds.every((id) => !APPOINTMENT_RESERVED_OPTION_IDS.has(id));
}

/**
 * 2026-10-26 decision 卡安全识别（**默认逻辑之前**）：choice 卡是否出现任一 `recommended:true` 选项。
 * 该字段只属于 decision 卡（客户规则：每张 decision 卡恰有一个推荐项）；出现它却缺 `cardKind` ⇒
 * 卡种不明——任何 choice 默认兜底都可能把材料性选择误当 appointment/proposal/acceptance 卡。
 * 结果：不默认（调用方随后 fail-closed 拒发），旧卡种（无 recommended）零行为变化。
 */
function hasRecommendedOption(req: CustomerInputRequest): boolean {
  return req.kind === "choice" && req.options.some((option) => option.recommended === true);
}

/**
 * decision 卡校验失败的可操作文案（2026-10-26 独立验收 F2）：机器码在 `reasonCode`（诊断/桌面可映射
 * 自己的 i18n），本函数只拼给模型/CLI 看的人话；统一以「本次未向客户发卡、未写账本」收尾。
 */
function decisionCardRejectionReason(
  roleId: string,
  validation: Extract<DecisionCardValidation, { ok: false }>,
): string {
  const suffix = "本次未向客户发卡、未写账本。请修正后重试。";
  switch (validation.reasonCode) {
    case "role-not-allowed":
      return `decision 卡只能由运营/Steward（trio convener）或策划角色/Draft（trio rapporteur，仅需求变更审批）发起（当前角色：${roleId === "" ? "unknown" : roleId}）；${suffix}`;
    case "not-choice":
      return `decision 卡必须是 request_choice（choice）卡；${suffix}`;
    case "missing-flow-id":
      return `decision 卡缺少合法的 flowId（须为非空小写 slug，匹配 ${GOVERNANCE_SLUG_PATTERN}）；${suffix}`;
    case "not-enough-options":
      return `decision 卡至少需要 ${DECISION_CARD_MIN_OPTIONS} 个选项；${suffix}`;
    case "invalid-option-id":
      return `decision 卡的每个选项都必须有非空字符串 id；${suffix}`;
    case "duplicate-option-id":
      return `decision 卡的选项 id 不得重复（${validation.detail}）；${suffix}`;
    case "recommended-count":
      return `decision 卡必须恰有一个 recommended:true 的推荐项（${validation.detail}）；${suffix}`;
  }
}

function defaultGovernanceChoiceCardKind(
  roleId: GovernanceRoleSpec["id"],
  optionIds: readonly string[],
): GovernanceCardKind | undefined {
  const has = (id: string): boolean => optionIds.includes(id);
  switch (roleId) {
    case "chief":
      return has("confirm") ? "intent-confirm" : undefined;
    case "rapporteur":
      return has("accept") ? "proposal" : undefined;
    case "convener":
      return looksLikeAppointmentChoice(optionIds) ? "appointment" : undefined;
    case "nominator":
      return undefined;
    case "verifier":
      return has("accept") ? "acceptance" : undefined;
    case "product":
      return undefined;
  }
}

function serializeGovernanceTask<T>(
  state: { chain: Promise<void> },
  task: () => Promise<T>,
): Promise<T> {
  const run = state.chain.then(task, task);
  state.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * 批次 A 身份层：旧 `liaison` 与新的 `chief` 共享同一条「主入口/协调者」旧流程路径
 * （意图确认卡、意图交接、幕僚→运营 coordinate）。旧路径保留到 D 批；两者只是 id 不同。
 */
function isCoordinatorGovernanceSpec(spec: GovernanceRoleSpec | undefined): boolean {
  return spec !== undefined && spec.function === "chief";
}

/**
 * 每角色允许的 `cardKind` 白名单（评审 §5.8 表；越权不弹卡，由 customerInput 包装器直接拒绝）。
 *
 * 2026-10-26 客户新增 **decision 卡**（`request_choice(cardKind="decision")`，运行时核心已在
 * Model 契约登记）：事务性选择卡（卡内含**恰一个**推荐项；桌面「替我决策」开启时默认选中推荐项），
 * 由统筹（trio convener）发起；**需求变更审批卡**则由统筹或提案角色（trio rapporteur）发起
 * （2026-10-26 客户纠正/补充；发起方不得自批，审批人只有判断 agent/客户，主理只执行）。
 * 它与提案/任命/验收相互独立：不触发任何 gate/验收、不产生
 * appointment/proposal 决定、不进入 `latestAcceptanceDecision`、也不能充当 flow 的
 * `customer-decision` 证据；分类只写 `decisionKind:"material-choice"`，**不得被当成提案/验收批准**。
 */
const TRIO_CARD_KINDS: Record<GovernanceRoleSpec["id"], readonly GovernanceCardKind[]> = {
  // C 目标态（2026-10-28）：模型可见 schema 已删除通用 `write`；本表仍保留它以让旧 direct/legacy
  // 项目与旧测试在过渡期可编译/可运行（**不向模型列出**），D 批随旧机器一并删除。
  // 2026-10-28 批次 A：幕僚（chief）承接旧主入口的 intent-confirm 需求确认卡；其它治理卡仍结构性拒绝。
  // 旧 `liaison` 是只读别名（D 批删除），行为与基线逐字一致（仅 intent-confirm）。
  chief: ["intent-confirm"],
  // 产品（product）是幕僚的 worker；批次 A 只做身份层，不开放治理选择/确认卡（申请线在 C 批）。
  product: [],
  // 2026-10-26 客户纠正/补充：报告员可发 **decision 卡，仅限需求变更审批**（发起方不得自批；
  // 审批人是判断 agent/客户，主理只执行）；提案与写盘卡不变。
  rapporteur: ["proposal", "decision"],
  // 2026-10-29（方案 v2.1 §5.1/M3，F7）：**招人决定卡（appointment）只由人事发起**——
  // 选项=最新名单角色、推荐集由应用从名单生成；写卡（appointment-write）保留。
  nominator: ["appointment", "appointment-write"],
  // 2026-10-26 客户新增：统筹可发 decision 卡（材料性选择；需求变更审批卡统筹也可发起）。
  // 2026-10-29：从 convener 白名单**移除 appointment**（招人卡只归人事）。
  convener: ["decision"],
  // 验收权归 Proof / 验收（verifier）；Draft / 提案不再发 acceptance。
  verifier: ["acceptance"],
};

/**
 * `request_confirmation` 的**工具级** cardKind 枚举（与运行时核心 `CONFIRM_CARD_KINDS` 同值）。
 * 本地只用于在拒绝文案里给出「本角色允许的确认卡 kind」——TRIO_CARD_KINDS 同时混有 choice 类，
 * 直接列出会把 `proposal`/`acceptance` 等误报成可确认卡种。
 */
const GOVERNANCE_CONFIRM_CARD_KINDS: readonly GovernanceCardKind[] = ["appointment-write"];

/** 某内置治理角色允许的**确认卡** kinds（工具枚举 ∩ `TRIO_CARD_KINDS`，按设计 §4.2 表序；主入口为空）。 */
function confirmCardKindsOf(roleId: GovernanceRoleSpec["id"]): readonly GovernanceCardKind[] {
  return GOVERNANCE_CONFIRM_CARD_KINDS.filter((kind) => TRIO_CARD_KINDS[roleId].includes(kind));
}

/** 账本条目签名（本会话内存合并去重用；只比较能唯一识别一次决定/事件的字段）。 */
function truncateText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * 为客户决定补 `artifactPath`/`artifactVersion`/`artifactSha256`（应用算；评审 §5.7）。
 * 找不到对应候选物（如尚未写出的 flow 文件）→ 不补，不阻断、不猜。
 */
async function isRegularFileForJudge(projectRoot: string, rel: string): Promise<boolean> {
  try {
    const info = await stat(path.join(projectRoot, ...rel.split("/")));
    return info.isFile();
  } catch {
    return false;
  }
}

/** 变更包 frontmatter 的 riskTier（T0–T3）；缺失/非法 ⇒ undefined（不猜）。 */
function changePackageRiskTier(text: string): "T0" | "T1" | "T2" | "T3" | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (frontmatter === null) return undefined;
  const match = /^\s*riskTier\s*:\s*(T[0-3])\s*$/m.exec(frontmatter[1]!);
  return match === null ? undefined : (match[1] as "T0" | "T1" | "T2" | "T3");
}

/**
 * C-06（方案 §6.4.1/R2）：`appointment-write` 呈现前的**结构校验**。
 *
 * 旧 flow 路径（带合法 `flowId` 且未给 targetRoleId/decisionId）保持既有行为；新路径（无 flow，
 * 用 intentId/taskId 归属）必须携带 `targetRoleId` + `decisionId`，且：
 *  · 目标必须是非内置项目角色（`su`/六内置/旧 liaison 一律拒）；
 *  · 预览中所有 `角色卡/**` 声明路径必须位于 `角色卡/<targetRoleId>/`；
 *  · `role-card.md` 必须有 Markdown 标题与必填章节；
 *  · `boundary.yaml` 必须通过同一 YAML 解析器，且顶层 `role` 与目录 id 一致。
 * 任一不满足 ⇒ `declined + notPresented`（不发卡、不发行任何写入路径、不写账本）。
 * D3 `request.resolved`（decisionId/targetRoleIds/intentId|taskId）的**事实校验**在桌面应用层
 * （`session.ts::withRequestLifecycle`）执行；本函数只做预览结构，不读 `.ans`。
 */
export function validateAppointmentWritePreview(args: {
  request: CustomerInputRequest;
  metadata?: CustomerInputMetadata;
  declaredPaths: readonly string[];
  /** 2026-10-29（方案 v2.1 §5.1/M4）：名单给该角色的授权目录（项目相对、以 / 结尾）。
   *  给出时 boundary.yaml 的每个条目必须落在其中（`[]` = 不在名单内，任何条目都拒绝）；缺省 = 旧路径不校验。 */
  allowedDirectories?: readonly string[];
}): string | undefined {
  const cardKind = args.request.cardKind ?? args.metadata?.cardKind;
  if (cardKind !== "appointment-write") return undefined;
  const rawTarget = args.metadata?.targetRoleId;
  const rawDecision = args.metadata?.decisionId;
  const targetRoleId = typeof rawTarget === "string" ? rawTarget.trim() : "";
  const decisionId = typeof rawDecision === "string" ? rawDecision.trim() : "";
  const legacyFlow = isGovernanceFlowId(args.request.flowId ?? args.metadata?.flowId);
  if (legacyFlow && targetRoleId === "" && decisionId === "") return undefined; // 旧 flow 路径逐字不变
  const problems: string[] = [];
  if (targetRoleId === "") problems.push("缺少 targetRoleId（D3 目标项目角色，appointment-write 新路径必填）");
  if (decisionId === "") problems.push("缺少 decisionId（D3 request.resolved 的决定 id，appointment-write 新路径必填）");
  if (decisionId !== "" && (decisionId.length > 200 || /[\u0000-\u001f\u007f]/.test(decisionId))) {
    problems.push("decisionId 非法（须为不含控制字符的有界字符串）");
  }
  if (targetRoleId !== "") {
    if (targetRoleId.includes("/") || targetRoleId.includes("\\") || targetRoleId === "." || targetRoleId === "..") {
      problems.push(`targetRoleId 非法：${targetRoleId}`);
    } else if (isBuiltInGovernanceRoleId(targetRoleId)) {
      problems.push(`targetRoleId=${targetRoleId} 是内置治理角色/su，appointment-write 只能写项目角色`);
    }
  }
  const prefix = targetRoleId !== "" ? `角色卡/${targetRoleId}/` : "";
  for (const rel of args.declaredPaths) {
    if (prefix === "" || !rel.startsWith(prefix)) {
      problems.push(`声明路径 ${rel} 不在 角色卡/${targetRoleId || "<targetRoleId>"}/ 之内`);
    }
  }
  if (targetRoleId !== "" && !targetRoleId.includes("/") && !targetRoleId.includes("\\")) {
    for (const entry of declaredPathBodies(args.request.preview, args.declaredPaths)) {
      if (!entry.path.startsWith(prefix) || !entry.hasBody) continue;
      const body = entry.body;
      if (/\/role-card\.md$/i.test(entry.path)) {
        if (!/^#{1,6}\s/m.test(body)) problems.push(`${entry.path} 缺少 Markdown 标题`);
        for (const section of ROLE_CARD_REQUIRED_SECTIONS) {
          if (!section.test.test(body)) problems.push(`${entry.path} 缺少必需章节「${section.label}」`);
        }
      } else if (/\/boundary\.yaml$/i.test(entry.path)) {
        // preview 常把 YAML 放进代码围栏；去掉围栏行再按同一解析器校验（内容本身不变）。
        const yamlText = body.replace(/^\s*(?:```|~~~).*$/gm, "").trim();
        const validation = validateBoundaryYamlText(yamlText);
        if (!validation.ok) {
          problems.push(`${entry.path} 边界 YAML 非法：${validation.message}`);
        } else {
          try {
            const doc = parseYaml(yamlText) as unknown;
            const declaredRole =
              doc !== null && typeof doc === "object" && !Array.isArray(doc)
                ? (doc as Record<string, unknown>).role
                : undefined;
            if (declaredRole !== targetRoleId) {
              problems.push(`${entry.path} 顶层 role=${JSON.stringify(declaredRole)} 与目录 id=${targetRoleId} 不一致`);
            }
            if (args.allowedDirectories !== undefined) {
              const entries = doc !== null && typeof doc === "object" && !Array.isArray(doc)
                ? (doc as Record<string, unknown>).entries
                : undefined;
              if (Array.isArray(entries)) {
                for (const rawEntry of entries) {
                  const entryPath = rawEntry !== null && typeof rawEntry === "object" && !Array.isArray(rawEntry)
                    ? (rawEntry as Record<string, unknown>).path
                    : undefined;
                  if (typeof entryPath !== "string") continue;
                  const normalized = entryPath.replace(/\\/g, "/");
                  const allowed = args.allowedDirectories.some((dir) =>
                    normalized === dir || normalized === dir.replace(/\/$/, "") || normalized.startsWith(dir),
                  );
                  if (!allowed) {
                    problems.push(`${entry.path} 的目录 ${normalized} 不在名单给 ${targetRoleId} 的授权目录内`);
                  }
                }
              }
            }
          } catch {
            // 语法错误已由 validateBoundaryYamlText 报出；此处只做身份检查。
          }
        }
      }
    }
  }
  if (problems.length === 0) return undefined;
  const shown = problems.slice(0, 8).join("；");
  return (
    `appointment-write 未呈现（结构校验失败）：${shown}${problems.length > 8 ? `；另有 ${problems.length - 8} 项` : ""}。` +
    "请在 preview 中按目标角色目录逐路径给出合法 role-card.md（标题 + 必填章节）与 boundary.yaml（顶层 role 与目录一致），" +
    "并在 paths 中只声明该角色目录内的实际写入路径；本次未向客户发卡、未发行任何写入路径。"
  );
}

/**
 * `judgeContext` 的唯一计算点（2026-10-18 双开关评审 §5.2/§5.4）：
 * paths/pathProbes（只取 preview 的**声明写入路径**；与散文无关，`resolveWrite` 机械探测）、
 * 写根/禁写、规范物证、推荐集、账本事实。桌面只消费，不重算、不读 `.ans`。
 * 2026-10-22：推荐集从**团队计划**解析（legacy 提名回落）；acceptance 暴露变更包档位 `facts.riskTier`。
 */
function sessionDirFor(projectRoot: string, roleId: string, runtime?: RuntimeKind): string | undefined {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return undefined;
  if (roleId === "" || roleId.includes("/") || roleId.includes("\\") || roleId.includes("..")) return undefined;
  const dir = path.join(projectRoot, ".ans", "sessions", roleId, ...(runtime ? [runtime] : []));
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

// 构造传给会话的任务提示：含一个**具体、可判定**的改动要求，指向该角色边界与 writeSet 内
// 真实可写的文件——使（真实模型的）会话确实发起一次写入，从而验证扩展 on("tool_call") 在运行期
// 触发，而不是只回头索要需求。目标取 writeSet 首项（按定义是角色边界的真子集，故确可写）；
// 无 scope（chat）时不给具体文件，只给边界约束。
function buildTaskPrompt(taskId: string | undefined, scope: TaskScope | undefined): string {
  const idPart = taskId !== undefined && taskId !== "" ? `任务 ${taskId}：` : "";
  const target = scope && scope.writeSet.length > 0 ? scope.writeSet[0] : undefined;
  const head =
    idPart +
    (scope
      ? "请在批准的写集内工作；越界或写集外的写入会在写入之前被门禁拒绝。"
      : "请在角色的授权边界内工作；越界写入会在写入之前被门禁拒绝。");
  if (target === undefined) return head;
  return (
    `${head}\n` +
    `具体改动要求：请编辑文件 ${target}，在其顶部新增一行注释「// [${taskId}] 受治理会话运行时确认」，` +
    `并**用 write_file 或 edit_file 实际发起这次写入**（这是本任务可判定的验收点；不要只回答计划）。`
  );
}

/** Compatibility factory shape; capability injection still controls tool registration. */
export type RuntimeAdapterFactory = (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
export type AdapterFactoryBuilder = (project: ProjectConfig, shellGate?: ShellGate) => RuntimeAdapterFactory;
export type RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions, "runtime" | "gate" | "projectRoot" | "skillRoot">;
export type RuntimeAdapterFactoryBuilder = (project: ProjectConfig, runtime: RuntimeKind, options?: RuntimeAdapterFactoryOptions) => RuntimeAdapterFactory;
export interface RoleSessionDeps {
  createAdapter?: RuntimeAdapterFactory;
  runtimeOptions?: RuntimeAdapterFactoryOptions;
}

/** Fixed engine, shared governed tools, exact project roots; no fallback engine. */
export function createRuntimeAdapterFactory(
  project: ProjectConfig,
  runtime: RuntimeKind,
  options: RuntimeAdapterFactoryOptions = {},
): RuntimeAdapterFactory {
  if (!(RUNTIME_KINDS as readonly string[]).includes(runtime)) throw new Error(`未知运行时：${runtime}`);
  return (gate, capabilities) => createRuntimeAdapter({
    ...options,
    runtime, gate, projectRoot: project.projectRoot, skillRoot: project.skillRoot,
    readRoot: project.projectRoot,
    writeRoot: runtime === "demo" ? options.writeRoot : project.projectRoot,
    shellCwd: project.projectRoot,
    persistSession: capabilities?.persistSession ?? options.persistSession ?? (capabilities?.sessionDir !== undefined),
    customerInput: capabilities?.customerInput,
    reportHandback: capabilities?.reportHandback,
    // 2026-10-26 图片查看（view_image）：运行时核心 `GovernedToolsOptions.viewImage` 同名能力位
    // （形状同源 `model/runtime.ts` `ViewImageFn`）；Service 以 `...options` 透传给
    // `buildGovernedTools`，`undefined` ⇒ 工具不注册（同 dispatch_task 先例）。本层纯透传——路径/
    // 类型/大小校验在工具层，能力侧只负责排队并如实回执；不改变任何写权。
    viewImage: capabilities?.viewImage,
    dispatchTask: capabilities?.dispatchTask,
    // 2026-10-26 需求变更申请（request_requirement_change）：运行时核心 `GovernedToolsOptions` 同名
    // 能力位（形状同源 `model/runtime.ts` `RequestRequirementChangeFn`）；`undefined` ⇒ 工具不注册
    // （能力缺席 = 最强 fail-closed）。本层纯透传——意图校验/去重/
    // 派发/账本由能力实现；**提交申请 ≠ 客户批准 ≠ 意图已变更**。
    requestRequirementChange: capabilities?.requestRequirementChange,
    // G-2/R1-R2：看护三能力并入适配器选项——**契约字段名** `roleStatus` / `sessionTail` /
    // `proposeRecovery`（运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 dispatch_task 先例）。
    roleStatus: capabilities?.roleStatus,
    sessionTail: capabilities?.sessionTail,
    roleActivityLog: capabilities?.roleActivityLog,
    terminateRoleRun: capabilities?.terminateRoleRun,
    redispatchTask: capabilities?.redispatchTask,
    // G-4/I1-I2：技能安装/卸载两能力并入适配器选项——**契约字段名** `installSkill` / `uninstallSkill`
    // （运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 dispatch_task 先例）。
    installSkill: capabilities?.installSkill,
    uninstallSkill: capabilities?.uninstallSkill,
    // G-4/V2：MCP 安装/卸载两能力并入适配器选项——**契约字段名** `installMcp` / `uninstallMcp`
    // （运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 install_skill 先例）。
    installMcp: capabilities?.installMcp,
    uninstallMcp: capabilities?.uninstallMcp,
    // 「替我审」判断会话：只读能力注入（运行时核心 `GovernedToolsOptions.shellJudge` 同名能力位）。
    // 注入 ⇒ Service 走 `buildShellJudgeTools` + `judgeMode:true` + 外来 MCP 置空；
    // `undefined` ⇒ 普通会话（逐字现状）。
    shellJudge: capabilities?.shellJudge ?? options.shellJudge,
    // 治理卡判断会话（「替我审批」/「替我决策」）：与 `shellJudge` 同形的只读能力注入。
    // **只由编排 `createGovernanceJudge` 使用**（judge 会话），普通角色会话不传；
    // Service 侧二者互斥（同时给出 ⇒ 抛配置错误）。
    governanceJudge: capabilities?.governanceJudge ?? options.governanceJudge,
    shellGate: capabilities?.shellGate ?? options.shellGate,
    // 2026-10-29（方案 v2.1 §6.5）：执行后写审计钩子（能力面/选项同源透传；缺省不审计）。
    ...(capabilities?.shellPostAudit !== undefined || options.shellPostAudit !== undefined
      ? { shellPostAudit: capabilities?.shellPostAudit ?? options.shellPostAudit }
      : {}),
    shellVerdict: capabilities?.shellVerdict,
  });
}

export function selectAdapterFactory(
  runtime: RuntimeKind,
  project: ProjectConfig,
  deps: {
    createAdapter?: RuntimeAdapterFactory;
    piFactory?: AdapterFactoryBuilder;
    shellGate?: ShellGate;
    runtimeFactory?: RuntimeAdapterFactoryBuilder;
    runtimeOptions?: RuntimeAdapterFactoryOptions;
  } = {},
): RuntimeAdapterFactory {
  if (!(RUNTIME_KINDS as readonly string[]).includes(runtime)) throw new Error(`未知运行时：${runtime}`);
  if (deps.runtimeFactory) return deps.runtimeFactory(project, runtime, { ...deps.runtimeOptions, ...(deps.shellGate !== undefined ? { shellGate: deps.shellGate } : {}) });
  if (runtime === "pi" && deps.piFactory) return deps.piFactory(project, deps.shellGate);
  if (runtime === "demo" && deps.createAdapter && !deps.runtimeOptions) return deps.createAdapter;
  return createRuntimeAdapterFactory(project, runtime, { ...deps.runtimeOptions, ...(deps.shellGate !== undefined ? { shellGate: deps.shellGate } : {}) });
}

/** Existing Pi public name now composes the neutral Service. */
export function createPiAdapterFactory(project: ProjectConfig, shellGate?: ShellGate): RuntimeAdapterFactory {
  return createRuntimeAdapterFactory(project, "pi", { shellGate });
}

/** ANS replay only; native resume is reported by the session's dynamic getters. */
export async function readRoleSessionHistory(
  options: { projectRoot: string; roleId: string; runtime: RuntimeKind },
  context?: { credentialEnvNames?: readonly string[] },
): ReturnType<typeof import("../../service/runtime/session.ts").readRuntimeSessionHistory> {
  const service = await import("../../service/runtime/session.ts");
  return service.readRuntimeSessionHistory({ ...options, credentialEnvNames: context?.credentialEnvNames });
}

/** Host-only context: renderer text/requests never choose credential names or history entries. */
export function projectRoleLegacyHistory(
  input: { projectRoot: string; roleId: string; runtime: "pi"; readOk: boolean;
    entries: readonly RuntimeLegacyHistoryEntryV1[]; source?: string; error?: string; skipped: number },
  context?: { credentialEnvNames?: readonly string[] },
): RuntimeLegacyHistoryProjectionV1 {
  if (typeof input?.projectRoot !== "string" || input.projectRoot.trim() === ""
    || typeof input.roleId !== "string" || input.roleId.trim() === "" || input.runtime !== "pi") {
    return { ok: false, version: 1, code: "INVALID_INPUT", message: { text: "历史范围无效。", redacted: false, truncated: false }, entries: [] };
  }
  return projectRuntimeLegacyHistory({ scope: { roleId: input.roleId, runtime: input.runtime },
    readOk: input.readOk, entries: input.entries, source: input.source, error: input.error,
    skipped: input.skipped, credentialEnvNames: context?.credentialEnvNames });
}

function trustedCredentialNames(options?: RuntimeAdapterFactoryOptions): readonly string[] {
  const names = [...(options?.extraCredentialEnvVars ?? [])];
  if (options?.apiKeyEnvVar) names.push(options.apiKeyEnvVar);
  return [...new Set(names.filter(name => typeof name === "string" && name.trim() !== ""))];
}

export function isFailedSettlement(event: SessionEvent): boolean {
  if (event.kind !== "settled") return false;
  const outcome = (event.detail as { outcome?: unknown } | undefined)?.outcome;
  return outcome === "failed" || outcome === "aborted" || outcome === "timed_out";
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// app/desktop/customer-input.ts
// 桌面应用的**客户确认制交互通道**（设计 A-1/A-5，2026-10-12）——su 的 `request_confirmation` /
// `request_choice` 两工具挂起等客户作答时，经本模块把请求摆到界面上并取回裁决。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，**不依赖 electron**，可在 node 下单测；
// 真正的推送/呈现由**注入的 presenter** 提供（主进程经 `session:operator-request` 推到渲染侧的交互卡）。
//
// —— 契约（**单一来源 = §4 冻结契约家** `src/model/runtime.ts`）——
// 入参 `CustomerInputRequest`（confirm：title/preview?/detail?；choice：title/question?/options/multiple?/preview?）
// 与出参 `CustomerInputOutcome`（answered / declined / unavailable 三态）**只读导入、原样转出**——
// 同一契约只许一个形状（同 operator-channel.ts 的既有惯例）。**时限（G-1，2026-10-12 客户裁定）**：
// **不按时间过期**——客户原话「没必要超时啊，就卡在这等客户同意呗」；卡片等待**无任何计时器**
// （无 setTimeout/setInterval，测试有钉子）。历史遗留的工具层 `withTimeout`（若仍启用）不属本模块——
// 去时限是 **Pi适配器** 的职责（见 change 文档的跨角色建议）。
// **判断 agent（2026-10-18 双开关评审 §四/§八；同日真机修正超时）**：卡片即将呈现前的**只读代批判断**在这里发生；
// 判断本身的硬超时由注入的 `GovernanceJudgeFn`（编排 driver，默认 **120s**，可经
// `ANS_GOVERNANCE_JUDGE_TIMEOUT_MS` 覆盖）负责；本模块的通道层防御超时 = driver 超时 + 15s 余量
// （缺省 **135s**），用 `AbortSignal.timeout` 实现（**不引入 self 计时器**，卡片等待语义逐字不变）。
// **shell judge 的通道超时不变（15s）**，两套互不影响。
// —— 2026-11-04 客户决定（治理写卡客户主权）——
// `appointment-write`（治理写卡）永不进入判断器：无论「替我审批」开关状态，一律原卡呈现客户本人；
// 判断器既不代批、也不得拒绝（「与现有角色卡声明冲突」类直接拒绝不会再发生）。
// 其余确认卡（shell 等）的判断/自动审批行为逐字不变；无通道仍 fail-closed。
//
// —— 本模块不做任何判定（硬约束：不得出现第二份判定实现）——
// 「确认后哪些路径可写」的**发行**在编排（`common/编排/confirmed-writes.ts`）；「写不写」在 gate 与文件工具。
// 本模块**只**：把请求如实呈现给客户、取回客户的选择、把「选择」**按请求快照校验**后归成冻结三态，
// 一切不确定情形（未接线 / 抛错 / 非法回包）落**未获同意**（fail-closed）。**绝不悄悄放行。**
//
// —— fail-closed 四条（设计 A-5；G-1 修订）——
//   · 未接线（无 presenter）→ `unavailable`（不挂起、不留悬案）；
//   · 窗口已关（presenter 抛错 / 通道被 rejectAll）→ `declined`（UI 侧同向：窗关 = 不同答）——**未获同意**；
//   · 客户点「不同意 / 取消」→ `declined`；**空选择/缺字段/非法回包 → 拒绝受理**（不落三态、不回挂起）；
//   · **时限：G-1 起无**——卡片可**无限期**待答；唯一的"消失"= **应用关闭/重启**（未决请求随窗口清空），
//     重启后对旧 id 的回包按**失效终态**受理（`expired:true`，文案如实指向"重启/关闭"而非超时）。

// 自动拒绝去重用的卡内容哈希（2026-11-04 客户直修）：进程内指纹，不写盘、不进账本。
import { createHash } from "node:crypto";

// 契约三型（请求/裁决/原始通道）的**唯一来源**（§4 冻结契约家）：只读导入、原样转出——**不逐字镜像**。
import type {
  ChiefPendingDecisionRequest,
  ChiefDecisionExecutionContext,
  DecidePendingRequestFn,
  CustomerInputRequest,
  CustomerInputOutcome,
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputOption,
  DisplayTextV1,
  GovernanceCardKind,
  GovernanceJudgeAudit,
  GovernanceJudgeFn,
  GovernanceJudgeGroup,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
  RuntimeKind,
} from "../../src/model/runtime.ts";
import type { DirectActionSource, SnapshotArtifactRef } from "../../src/model/trunk.ts";
// 客户授权平面 decision 消费者（C1，2026-11-03）：只经 B1 Pipeline 公共出口（类型只读；实现在主进程控制器）。
import type {
  DecisionApplyResult,
  DecisionCardFacts,
  DecisionHooks,
} from "../../src/pipeline/orchestration/customer-directive.ts";
import type { DecisionDirectiveSnapshot } from "../../src/model/directive.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
// 边界内写入预授权（2026-10-25 客户新规则）：判定纯逻辑在 `write-preauthorization.ts`（本通道只在
// **呈现卡片/调用判断之前**执行其结果）。边界判定唯一来源仍是门禁引擎 resolveWrite——本模块不做第二套。
import {
  WRITE_PREAUTHORIZATION_OPERATOR_ID,
  evaluateWritePreauthorization,
  writePreauthorizationSummary,
  type WritePreauthorizationDecision,
  type WritePreauthorizationEvent,
  type WritePreauthorizationFacts,
} from "./write-preauthorization.ts";
export { WRITE_PREAUTHORIZATION_OPERATOR_ID } from "./write-preauthorization.ts";
// 分组映射（`cardKind → approval/decision`）的**单一来源**（2026-10-18 双开关评审 §3.1）：
// 本模块与 UI/编排/测试都读同一张表，绝不在这里写第二份。
import { governanceCardGroup } from "../../src/model/runtime.ts";
// 内置治理角色判据的**单一来源**（Service 公共出口；本模块不复制角色 id 表/注册表）：
// 仅用于桌面特有的「有推荐项但缺 cardKind」防线（不属于共享结构校验）。
import { isBuiltInGovernanceRoleId } from "../../src/service/boundary/resolve-boundary.ts";
// decision 卡结构校验的**单一共享实现**：经编排 Pipeline 公共出口只读导入（实现恒在
// `src/common/编排/decision-card.ts`）。桌面只保留 notPresented/文案/operator 映射与卡面默认推荐，
// 不再复制选项数/id/推荐项/flowId/角色校验。
import {
  DECISION_CARD_MIN_OPTIONS,
  validateDecisionCardRequest,
  type DecisionCardRejectReason,
  type DecisionCardValidation,
} from "../../src/pipeline/orchestration/run-role.ts";
export { DECISION_CARD_MIN_OPTIONS };
export type { DecisionCardRejectReason, DecisionCardValidation };
export type { CustomerInputRequest, CustomerInputOutcome, CustomerInputFn };
// 锚点键的**唯一算法**（真机缺陷修复 2026-10-12：已决卡切走再切回跑到聊天流最末尾——卡的（重）物化
// 须按其时序锚点落位）。请求本体（kind/title）与回放侧（session-history.ts 解析的 toolCall 块）两侧
// 各自用同一函数拼键，渲染侧据此把卡锚定回「调用工具 request_confirmation」附近。只读导入、不复制。
import { interactionAnchorKey } from "./request-anchor.ts";
import { mainT } from "./i18n.ts";
// 判断回落 reason 的人话映射（2026-10-18 客户反馈：read-denied 丢具体路径/原因）：与 shell 通道**同解**的小件。
import { readDeniedHumanReason, stripTrailingSentencePunct } from "./judge-reason.ts";
// 「无法核对」类机械码的**单一来源**（2026-11-04 客户直修；编排角色维护，本模块只读消费）：
// 这些 manual 结果不得自动拒绝，必须原卡转客户确认（judge 的 fail-closed 方向不变）。
import { isUnverifiableRejectionCode } from "../../src/common/编排/mechanical-rejection.ts";
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
// 治理下一步推导（2026-10-18 客户修正）：纯逻辑在 governance-advance.ts；本模块**只**在客户决定
// 成功结算后回调，由主进程决定是否后台派发——本模块不打开会话、不发模型消息、不做任何批准。
import {
  deriveGovernanceNextStep,
  type GovernanceNextStepContext,
  type GovernanceNextStepPayload,
} from "./governance-advance.ts";
import { PLAN_ESCALATION_OPTION_IDS } from "./plan-escalation.ts";
export type { GovernanceNextStepContext, GovernanceNextStepPayload } from "./governance-advance.ts";

/**
 * 验收决定卡的应用私有展示载荷（2026-11-02 acceptance-return-card，C2）。
 * 仅随既有 `session:operator-request` IPC 走；不写盘、不进 `task.created`/报告快照/任务账本。
 */
export interface AcceptanceReportDisplayV1 {
  version: 1;
  /** 固定约定路径 `docs/quality/<flowId>-report-v1.md`；仅展示/追溯，不是读取指令。 */
  path: string;
  /** 主进程已完成 `protectText(reportText, 16384)` 的安全投影；渲染层不得二次改写语义。 */
  text: DisplayTextV1;
}

/** 推给渲染侧的交互请求载荷（IPC `session:operator-request` 的形状，主→渲）。 */
export interface OperatorRequestPayload {
  /** 本次请求的关联 id（主进程生成；回包凭它解挂——沿用 per-window pending Map 模式）。 */
  id: string;
  /** 发起请求的角色 id（渲染侧据此把卡落到该角色的聊天流，并点亮 B-3「等待你确认」）。 */
  roleId: string;
  projectRoot?: string;
  runtime?: CustomerInputMetadata["runtime"];
  turnId?: CustomerInputMetadata["turnId"];
  toolCallId?: CustomerInputMetadata["toolCallId"];
  /** 冻结形状的请求本体（**原样透传**，不加工）。 */
  request: CustomerInputRequest;
  /**
   * 交互请求的**锚点键**（`request-anchor.ts` 的单一算法；由请求本体 kind+title 拼出）。渲染侧把它
   * 记进请求登记表，供卡的（重）物化与**回放行**（同样带 anchorKey）精确关联——卡落回它发生的位置。
   */
  anchorKey: string;
  /**
   * **决定卡镜像**（历史字段，C 批已删除镜像面）：保留可选字段仅用于回放旧记录；新请求不设置。
   */
  mirrorRoleId?: string;
  /**
   * **判断回落提示**（2026-10-18 双开关评审 §4.3/§9.3；2026-10-19 客户总原则后收窄）：
   * 客户勾选对应开关后，`manual`/`deny` 都**自动退回发起角色重做**（不呈现客户卡）；本字段只在
   * **判断期间客户关闭开关（switch-off）**这一例外（客户已选择手动）时附在原卡上。
   */
  judgeNotice?: string;
  /** 仅 acceptance 卡；应用私有、仅展示、不持久化（2026-11-02 acceptance-return-card C2）。 */
  acceptanceReport?: AcceptanceReportDisplayV1;
}

/**
 * 渲染侧回传的**决定**（IPC `session:operator-response` 的载荷，渲→主）。
 * 渲染进程输入**一律不可信**：本模块按**请求快照**校验后才归为冻结算式——
 * confirm ⇒ `value.confirmed`；choice ⇒ `value.selected`（**必须 ⊆ 已给选项**；单选恰一个）；
 * `cancelled:true` ⇒ declined。任何非法回包拒绝受理（`{ok:false}`，pending 保留、界面可重试）。
 */
export type OperatorDecisionPayload =
  | {
      kind: "confirm";
      confirmed: boolean;
      /**
       * 已勾选的 acknowledgment id（D4/2026-11-05；渲→主不可信输入）：
       * confirm 请求声明 `acknowledgments[].required` 时必须为字符串数组且去重后**恰覆盖**全部
       * required id（缺失/多余/非数组一律拒收，pending 保留）；`confirmed:false` 不要求/不校验 ack；
       * 未声明 required ⇒ 旧行为零变化。合法时结算回传 `CustomerInputOutcome.acknowledged`。
       */
      acknowledged?: string[];
    }
  | {
      kind: "choice";
      selected?: string[];
      cancelled?: boolean;
      /**
       * 已勾选的 acknowledgment id（2026-11-04 trunk-amendment C1/F1；渲→主不可信输入）。
       * 请求声明 `required` 项时必须是字符串数组且**恰覆盖**全部 required id（去重后集合相等）；
       * 未声明 ⇒ 旧行为零变化。结算回传 `CustomerInputOutcome.acknowledged`，`request.resolved` 不加字段。
       */
      acknowledged?: string[];
    };

/** 主进程注入的推送端点：把请求如实送到界面（electron webContents.send；测试注入收集器）。 */
export type OperatorRequestPresenter = (payload: OperatorRequestPayload) => void;

// ———————————————— 2026-10-25 验收分诊：呈现前闸（设计 §3.2 / §7.1 / §7.4） ————————————————
//
// 触发位置：verifier 的 `request_choice(cardKind=acceptance)` 到达、**任何客户卡呈现/判断代批之前**。
// 本模块只提供**通用前闸**：把「验收卡 + 应用事实」交给主进程注入的 gate；gate 决定
//   · `proceed`      —— 维持既有验收卡路径（pass 报告 / legacy / 非 trio / 记录损坏回落）；
//   · `settle`       —— 不向客户呈现验收卡，直接以给定结果结算（缺结构退回 / 判断代批处置）；
//   · `triage-card`  —— 用一张应用自有 choice 卡替换验收卡（同槽位、稳定 id），客户作答后再结算。
// 分诊的业务判定（解析/建议/记录/路由/汇报）**全部在 Interface**；本模块不读盘、不评价报告。

/** gate 可见的应用事实（原样来自请求、会话上下文与 `judgeContext`；本模块不重算）。 */
export interface AcceptanceTriageGateFacts {
  /** 被拦住的验收请求 id（`op-…`；审计用）。 */
  requestId: string;
  roleId: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  /** 原始验收 choice 请求（原样；gate 不修改它）。 */
  request: CustomerInputRequest;
  /** 编排计算并透传的元数据（含 `judgeContext.flowId` 与物证路径；本模块只透传）。 */
  metadata?: CustomerInputMetadata;
  governanceModel?: "single" | "trio";
}

/** 应用自有分诊卡（复用 operator choice 卡；不新增 cardKind）。 */
export interface AcceptanceTriageCardSpec {
  /** 稳定分诊卡 id：`triage-<flowId>-<reportSha 前 8 位>`（同一报告只接受一次作答）。 */
  id: string;
  /** 呈现面：主入口主理角色 id（由 Interface 按 `primaryRoleId` 决定）。 */
  roleId: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  title: string;
  question: string;
  preview?: string;
  options: CustomerInputOption[];
}

/** 客户对分诊卡的原始作答（取消/关窗 ⇒ declined）。 */
export type AcceptanceTriageAnswer =
  | { outcome: "answered"; selected: string[] }
  | { outcome: "declined"; reason?: string };

/**
 * 分诊作答后的处置：`settlement` 用于结算**被拦住的验收请求**（`null` = 无活请求/重启恢复，
 * 只执行处置、不伪造客户决定）；`run` 是处置执行（写记录/路由/汇报；失败只诊断，不翻转已完成的结算）。
 */
export interface AcceptanceTriageAnswerResult {
  settlement: CustomerInputOutcome | null;
  run?: () => Promise<void> | void;
}

/** gate 结果（见上方注释）。 */
export type AcceptanceTriageGateResult =
  | { action: "proceed" }
  | { action: "settle"; outcome: CustomerInputOutcome; run?: () => Promise<void> | void }
  | {
      action: "triage-card";
      card: AcceptanceTriageCardSpec;
      onAnswer: (
        answer: AcceptanceTriageAnswer,
      ) => Promise<AcceptanceTriageAnswerResult> | AcceptanceTriageAnswerResult;
    };

/** 呈现前闸（主进程接线到 Interface `evaluateAcceptanceTriage`；缺省 ⇒ 不分诊、旧行为零变化）。 */
export type AcceptanceTriageGate = (
  facts: AcceptanceTriageGateFacts,
) => Promise<AcceptanceTriageGateResult> | AcceptanceTriageGateResult;

/**
 * 外部（重启恢复）呈现一张分诊卡的入口：同一稳定 id 幂等（已在队列/已呈现 ⇒ 不重复呈现）。
 * 返回 `{ok:true}` 表示卡已被受理/已在队列；呈现失败的 fail-closed 由通道既有语义处理。
 */
export type PresentAcceptanceTriageCardFn = (
  card: AcceptanceTriageCardSpec,
  onAnswer: (
    answer: AcceptanceTriageAnswer,
  ) => Promise<AcceptanceTriageAnswerResult> | AcceptanceTriageAnswerResult,
) => { ok: boolean; error?: string };

export interface OperatorExpiredPayload { id: string; roleId: string; projectRoot?: string; runtime?: CustomerInputMetadata["runtime"]; reason: string }

/**
 * **判断代批结果行载荷**（2026-10-18 双开关评审 §8.1，字段名钉死）。
 * 只在 `approve` 结算成功后经 `emitJudgeResult` 推送（IPC `session:operator-judge`，主→渲）；
 * `manual` 不产生结果行（原卡 + `judgeNotice`）。`id` 是结果行幂等键，`requestId` 是客户交互请求 id。
 * 本载荷只含结构化、已脱敏/有界的字段；**不写模型上下文**。
 */
export interface OperatorJudgeResultPayload {
  version: 1;
  id: string;
  requestId: string;
  anchorKey: string;
  toolCallId: string;
  roleId: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  at: string;
  /** 原始申请标题（客户/角色看到的卡面标题）；用于决策中心区分多条代批记录。 */
  requestTitle?: string;
  group: GovernanceJudgeGroup;
  cardKind: GovernanceCardKind;
  flowId?: string;
  engine: RuntimeKind;
  model?: string;
  reasonCode: string;
  actionSource?: DirectActionSource;
  reason?: string;
  selected?: string[];
  confirmed?: true;
  paths?: string[];
  pathDecisions?: Array<{ path: string; ok: boolean; reason?: string }>;
  evidence?: string[];
  durationMs?: number;
  readCalls?: number;
  readBytes?: number;
}

// ———————————————— 2026-10-26 decision 卡（材料性选择；客户新增） ————————————————
//
// 客户要求：主理发现**材料性选择**（演示/验收证据方式、范围、标准/契约偏离、成本或客户可见行为等）
// 时不自定，交统筹（convener）发 `request_choice(cardKind="decision")`；卡内**恰有一个**
// `recommended: true` 推荐项。客户开启「替我决策」时，应用**确定性**默认选中推荐项（不调用模型做
// 选择题），并以 **judge 代批**审计记录（`group=decision`），不得伪装成客户本人；开关关闭/无推荐项/
// 结果行投达失败等异常 ⇒ 走既有客户卡路径，绝不擅自代选。
//
// 本模块只做**发卡前校验 + 卡面默认推荐**；选中项的账本分类在编排：
// `customer.decision{decisionKind:"material-choice", selectedOptions:[选项 id]}`，独立于
// 提案/任命/验收——不触发 gate/验收、不写 targetRoleIds、不构成客户批准。卡片自身与 tool 回执
// 由既有链路如实标注（`main.decisionCard.notApproval` / judge 回执「自动代理」）。

/** decision 卡种（`GovernanceChoiceCardKind` 的 2026-10-26 成员）。 */
export const DECISION_CARD_KIND = "decision" as const;

/**
 * 应用自有、必须由**客户本人**作答的 decision 卡（2026-11-04 客户直修）：
 *   · run-change 三模式卡（`continue-frozen` / `stop-and-restart` / `stop`，来源
 *     `src/common/编排/run-manifest.ts` 的 `buildRunChangeCard` / `RunChangeMode`）；
 *   · 版本决策卡（`version-modify` / `new-version-development`，来源
 *     `src/common/编排/version-decision.ts` 的 `versionDecisionCardToRequest` /
 *     `src/model/project-state.ts` 的 `VERSION_DECISION_ACTIONS`）。
 *
 * 客户原话：「现在点击会被替我决策给拦住啊」「新建版本，修改版本，这个必须弹出客户确认。
 * 不能自动替我待批。」——这两类卡是应用发行、代表客户本人的决定，**永不**进入
 * `tryAutoSelectDecision` 的确定性默认代选；必须原卡呈现、由客户亲手选择。
 *
 * 判据说明：`payload.schema`/`payload.requestId` 只存在于卡结构的 `payload`，不随
 * `card.request` 进入客户卡通道（`session.ts` 的 `requestRunChangeDecision` 只传
 * `card.request`；`versionDecisionCardToRequest` 只返回 request），拦截点不可得；
 * `application:true` 单独使用又会误伤同样由应用发行、但按既有约定仍可被「替我决策」
 * 代选的卡（`app/desktop/session.ts` 的 `escalateStuckTask` 任务升级卡），故按
 * 「应用标志 + 两类卡的冻结选项词汇」识别。选项 id 与界面语言无关；测试用真实构造器
 * 产物钉住本判据（`test/桌面应用/decision-service.test.ts`）。
 */
const RUN_CHANGE_MODE_OPTION_IDS: readonly string[] = ["continue-frozen", "stop-and-restart", "stop"];
const VERSION_DECISION_OPTION_IDS: readonly string[] = ["version-modify", "new-version-development"];
/**
 * 2026-11-04 trunk-amendment D1：版本变更申请（VCA）、修正案逐项/最终确认卡的选项词汇——
 * 这些卡与 run-change/版本决策同属**应用发行、客户本人**的卡（P1.6 §4.4/§4.7；AC-4/AC-18）。
 * `item-apply`/`item-keep`/`item-cancel-amendment` 来自 S4 `AmendmentItemChoice`；`apply-amendment`/
 * `defer-amendment` 为 P1.3 最终卡词汇（本批未发最终卡，保留排除面）；`acknowledge-none` 为可选
 * 「未改类别」说明卡词汇（F42；不发则无影响）。
 */
const VERSION_CHANGE_OPTION_IDS: readonly string[] = ["approve-version-change", "reject-version-change"];
const AMENDMENT_ITEM_OPTION_IDS: readonly string[] = ["item-apply", "item-keep", "item-cancel-amendment"];
const AMENDMENT_FINAL_OPTION_IDS: readonly string[] = ["apply-amendment", "defer-amendment"];
/** stable workflow 轻量确认卡（app-owned 卡种；P1.6 §4.5.1；PM 复审 F2）。 */
const STABLE_WRITE_CARD_KIND = "stable-write" as const;
const STABLE_WRITE_OPTION_IDS: readonly string[] = ["approve-stable-write", "reject-stable-write"];
/**
 * T3（2026-11-10 两条固定工作流路径，B1 AC-14/AC-27 Q1；v1.3 §8.4）：`merge-main`＝A13/B4 高风险
 * 合并 main 的**应用自有非判断卡**（不进 `GOVERNANCE_CARD_GROUP`，judge 只可转人工/拒绝）。
 * B1 只预留**识别骨架**（客户主权排除面 + 冻结选项词汇）；卡的构造/呈现/preview/执行在 B3，且
 * **不新增客户可见门**（既有高风险确认机制的具体化）。judge 永不代批、永不冒充客户。
 */
export const MERGE_MAIN_CARD_KIND = "merge-main" as const;
export const MERGE_MAIN_OPTION_IDS: readonly string[] = Object.freeze(["approve-merge-main", "reject-merge-main"]);

/**
 * `merge-main` 卡的应用侧事实（**单一来源 = 编排 `workflow-service.ts::ReleaseMergePreview`**；
 * 本层按结构只读消费，不复制业务判定）。AC-14 必含：workflowId/flowId、main base OID、branch tip OID、
 * 文件数、diff stat、合并方式、高风险提示；路径 B 非 main 基线额外披露 base OID。
 */
export interface MergeMainCardPreviewFacts {
  workflowId: string;
  flowId: string;
  releaseId: string;
  mainBaseOid: string | null;
  branchTipOid: string;
  branchBaseOid: string | null;
  nonMainBaseline: boolean;
  fileCount: number;
  diffStat: string;
  mergeKind: "merge" | "initial";
  highRiskNotes: readonly string[];
}

/**
 * `merge-main` 卡的应用侧 requestId（确定性 = `merge-main-<releaseId>`；releaseId 由 workflowId+tip
 * 确定性派生）。应用自动触发据此判定「同一 workflow/tip 已呈过卡」，不重复弹卡（B3.1）。
 */
export function mergeMainCardRequestId(releaseId: string): string {
  return `merge-main-${releaseId}`;
}

/** merge-main preview 文本（应用构造；模型不可自报；客户据此核对 base/tip/diff/高风险）。 */
export function mergeMainCardPreviewText(preview: MergeMainCardPreviewFacts): string {
  const lines = [
    `workflowId：${preview.workflowId}（flowId：${preview.flowId}；release：${preview.releaseId}）`,
    `main base OID：${preview.mainBaseOid ?? "（main unborn ⇒ initial 合并）"}`,
    `branch tip OID：${preview.branchTipOid}`,
    ...(preview.branchBaseOid !== null && preview.nonMainBaseline
      ? [`分支基点 OID：${preview.branchBaseOid}（非 main 基线：分支从非 main HEAD 创建，diff 为分支↔main）`]
      : []),
    `变更文件数：${preview.fileCount}`,
    `diff stat：`,
    preview.diffStat === "" ? "（无文本差异）" : preview.diffStat,
    `合并方式：${preview.mergeKind === "initial" ? "initial（创建 main 于任务分支 tip）" : "merge --no-ff（本地合并到 main）"}`,
    "高风险提示：",
    ...preview.highRiskNotes.map((note) => `- ${note}`),
  ];
  return lines.join("\n");
}

/**
 * 构造应用自有 `merge-main` 非判断卡（AC-14；MF-IR-8）：`application:true` + 冻结 approve/reject
 * 选项词汇；不进 `GOVERNANCE_CARD_GROUP`、judge 不可代批（`isApplicationDecisionReservedForCustomer`）。
 */
export function buildMergeMainCardRequest(preview: MergeMainCardPreviewFacts): CustomerInputRequest {
  return {
    kind: "choice",
    title: "合并 main（高风险发布确认）",
    question: "是否由应用在本地把任务分支合并进 main？只本地合并：不 push、不打 tag、不发布产物；必须由客户本人确认。",
    cardKind: MERGE_MAIN_CARD_KIND,
    application: true,
    sourceRoleId: "application",
    flowId: preview.flowId,
    options: [
      { id: MERGE_MAIN_OPTION_IDS[0]!, label: "确认合并 main" },
      { id: MERGE_MAIN_OPTION_IDS[1]!, label: "拒绝合并" },
    ],
    preview: mergeMainCardPreviewText(preview),
  };
}

/**
 * `merge-main` 客户裁决归类（fail-closed）：
 * - 只有 `answered` 且选中冻结 approve 选项、且来源为**客户本人**（无 judge 审计、operatorId 非
 *   judge:/directive:）才算授权；judge/directive 结算一律不授权（通道层主权卡守卫之外的第二道）；
 * - `declined` + judge 来源 ⇒ `judge-reject`（judge 只能转人工/拒绝，不冒充客户）；
 * - `declined` + `system:initiator-aborted` ⇒ `timeout`（应用中止/超时；由调用方落 `release.rejected`）；
 * - `unavailable`（已呈现但窗口关闭/重启）⇒ `timeout`；调用方对**从未呈现**（presenter undefined）
 *   不应调用本函数，也不得写拒绝（保持等待，不默认通过）。
 */
export type MergeMainCardDecision =
  | { kind: "approve"; decisionId?: string }
  | { kind: "reject"; reason?: string }
  | { kind: "judge-reject"; reason?: string }
  | { kind: "timeout"; reason?: string }
  | { kind: "unavailable"; reason?: string };

export function toMergeMainCardDecision(outcome: CustomerInputOutcome | null | undefined): MergeMainCardDecision {
  if (outcome === null || outcome === undefined) return { kind: "unavailable" };
  if (outcome.outcome === "unavailable") {
    return { kind: "timeout", ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}) };
  }
  const operatorId = "operatorId" in outcome && typeof outcome.operatorId === "string" ? outcome.operatorId : undefined;
  const nonCustomer = (outcome.outcome === "answered" && outcome.judge !== undefined)
    || (operatorId !== undefined && (operatorId.startsWith("judge:") || operatorId.startsWith("directive:")));
  if (outcome.outcome === "answered") {
    // judge/directive 的「answered」不是合法客户决策：不代批、不写成拒绝（release 保持开放、等待客户本人）。
    if (nonCustomer) return { kind: "unavailable", reason: "judge/directive 结算不得代批 merge-main（fail-closed）" };
    const selected = Array.isArray(outcome.value.selected) ? outcome.value.selected : [];
    if (selected.includes(MERGE_MAIN_OPTION_IDS[0]!)) {
      return { kind: "approve", ...(outcome.decisionId !== undefined ? { decisionId: outcome.decisionId } : {}) };
    }
    if (selected.includes(MERGE_MAIN_OPTION_IDS[1]!)) {
      return { kind: "reject", ...(outcome.decisionId !== undefined ? { decisionId: outcome.decisionId } : {}) };
    }
    return { kind: "unavailable", reason: "merge-main 卡未选中冻结选项（fail-closed）" };
  }
  // declined
  if (nonCustomer) return { kind: "judge-reject", ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}) };
  if (operatorId === "system:initiator-aborted" || outcome.reason === "initiator-aborted") {
    return { kind: "timeout", ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}) };
  }
  return { kind: "reject", ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}) };
}

export function isApplicationDecisionReservedForCustomer(request: CustomerInputRequest): boolean {
  if (request.kind !== "choice") return false;
  const cardKind = (request as { cardKind?: unknown }).cardKind;
  // stable workflow 确认卡：app-owned、无 flowId；客户本人，永不判断/委托/指令。
  if (cardKind === STABLE_WRITE_CARD_KIND) {
    if ((request as { application?: unknown }).application !== true) return false;
    const offered = new Set(request.options.map((option) => option.id));
    return STABLE_WRITE_OPTION_IDS.every((id) => offered.has(id));
  }
  // merge-main（高风险合并 main）：app-owned、客户本人；judge 不可代批/不冒充客户。
  // 只接受应用发行（`application:true`）且携带冻结 approve/reject 选项词汇的卡——角色工具层
  // 卡种白名单本就不含 `merge-main`（G-IR），此处是结算/代选/指令面的第二道 fail-closed。
  if (cardKind === MERGE_MAIN_CARD_KIND) {
    if ((request as { application?: unknown }).application !== true) return false;
    const offered = new Set(request.options.map((option) => option.id));
    return MERGE_MAIN_OPTION_IDS.every((id) => offered.has(id));
  }
  if (cardKind !== DECISION_CARD_KIND) return false;
  if ((request as { application?: unknown }).application !== true) return false;
  const offered = new Set(request.options.map((option) => option.id));
  const hasAll = (ids: readonly string[]): boolean => ids.every((id) => offered.has(id));
  return (
    hasAll(RUN_CHANGE_MODE_OPTION_IDS) ||
    hasAll(VERSION_DECISION_OPTION_IDS) ||
    hasAll(VERSION_CHANGE_OPTION_IDS) ||
    // 2026-11-05：方案升级卡（convener 发起、应用发行）——修订方案/环境/继续/终止，客户本人裁决。
    hasAll(PLAN_ESCALATION_OPTION_IDS) ||
    hasAll(AMENDMENT_ITEM_OPTION_IDS) ||
    hasAll(AMENDMENT_FINAL_OPTION_IDS)
  );
}

/**
 * 治理写卡（appointment-write）＝**客户主权卡**（2026-11-04 客户直修）。
 *
 * 客户要求：治理写卡必须由客户本人确认；判断器既不许代批，也不许把卡拒掉（含
 * 「与现有角色卡声明冲突」类直接拒绝）。因此 `cardKind === "appointment-write"` 的确认卡
 * **永不进入判断器**（`planJudge` 排除）、不产生 judge 结果行/审计，也不进入任何自动代选/
 * 自动结算路径；无论「替我审批」开关状态，一律原卡呈现客户本人。
 * 原则与 decision 卡「应用卡不代选」同向：权限/边界类治理写卡 = 客户主权。
 */
const GOVERNANCE_WRITE_CARD_KIND = "appointment-write" as const;

function isGovernanceWriteCardKind(kind: GovernanceCardKind | undefined): boolean {
  return kind === GOVERNANCE_WRITE_CARD_KIND;
}

/** 发卡前校验结论：allow＝可呈现/可代选；ignore＝非 decision 卡（零行为变化）；reject＝拒发卡。 */
export type DecisionCardGateRejectReason =
  | DecisionCardRejectReason
  | "missing-card-kind"
  | "shared-validation-invalid";
export type DecisionCardGateResult =
  | { action: "allow"; flowId: string; recommendedOptionId: string }
  | { action: "ignore" }
  | { action: "reject"; reasonCode: DecisionCardGateRejectReason; reason: string };

/** 结构化读取 option.recommended（请求来自模型工具，运行时一律按不可信处理）。 */
function optionIsRecommended(option: unknown): boolean {
  return (
    typeof option === "object" &&
    option !== null &&
    (option as { recommended?: unknown }).recommended === true
  );
}

/** 卡内是否出现 `recommended: true`（用于识别「decision 形状」但缺 cardKind 的内置治理卡）。 */
function hasRecommendedOption(request: CustomerInputRequest): boolean {
  if (request.kind !== "choice") return false;
  const options = (request as { options?: unknown }).options;
  return Array.isArray(options) && options.some(optionIsRecommended);
}

/**
 * decision 卡发卡前校验的**桌面薄包装**（fail-closed；**在触达 presenter / 判断 agent / 排队之前**）：
 *
 * 结构校验（仅 convener/trio、choice、合法 flowId、≥2 选项、id 非空不重复、恰一个 recommended）
 * **全部委托** Pipeline 公共出口的 `validateDecisionCardRequest`（单一来源
 * `common/编排/decision-card.ts`）；本函数只保留桌面特有部分：
 *   · `notPresented`/`operator` 映射在调用方（`customerInput`）；
 *   · 失败文案按共享 `reasonCode` 选 `main.decisionCard.invalid`/`noRecommended` 并带共享 `detail`；
 *   · 共享函数返回 `applicable:false`（非 decision 卡）⇒ `ignore`（旧卡零行为变化）；
 *   · 桌面特有防线：内置治理角色发出「有 `recommended: true` 但缺 cardKind」的 choice 卡 ⇒
 *     `missing-card-kind` 拒发（共享函数对缺 cardKind 返回 `applicable:false`；编排 trio 路径已有
 *     同向守卫，桌面保留此检查覆盖 direct/legacy 通道与 single）。
 */
export function evaluateDecisionCardRequest(input: {
  request: CustomerInputRequest;
  roleId: string;
  /** 会话治理模型；缺省按 `"single"`（共享校验对 single 的 decision 卡一律 role-not-allowed）。 */
  governanceModel?: "single" | "trio";
  metadata?: Pick<CustomerInputMetadata, "cardKind" | "flowId">;
}): DecisionCardGateResult {
  const { request, roleId } = input;
  const rawCardKind = (request as { cardKind?: unknown }).cardKind ?? input.metadata?.cardKind;
  const cardKind = typeof rawCardKind === "string" ? rawCardKind : undefined;
  if (cardKind === undefined && hasRecommendedOption(request) && isBuiltInGovernanceRoleId(roleId)) {
    return {
      action: "reject",
      reasonCode: "missing-card-kind",
      reason: mainT("main.decisionCard.invalid", {
        detail: `cardKind missing (role=${roleId === "" ? "unknown" : roleId})`,
      }),
    };
  }
  const validation = validateDecisionCardRequest({
    request,
    roleId,
    governanceModel: input.governanceModel ?? "single",
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  });
  if (!validation.ok) {
    const reason =
      validation.reasonCode === "recommended-count"
        ? mainT("main.decisionCard.noRecommended", { detail: validation.detail })
        : mainT("main.decisionCard.invalid", { detail: validation.detail });
    return { action: "reject", reasonCode: validation.reasonCode, reason };
  }
  if (validation.applicable !== true) return { action: "ignore" };
  if (typeof validation.flowId !== "string" || typeof validation.recommendedOptionId !== "string") {
    // 共享契约保证 applicable:true 时二者存在；防御性 fail-closed（不猜推荐项）。
    return {
      action: "reject",
      reasonCode: "shared-validation-invalid",
      reason: mainT("main.decisionCard.invalid", {
        detail: "shared validation missing flowId/recommendedOptionId",
      }),
    };
  }
  return {
    action: "allow",
    flowId: validation.flowId,
    recommendedOptionId: validation.recommendedOptionId,
  };
}

/**
 * 结果行的一句人话（评审 §9.3 的文案口径）：渲染侧与主入口进度行共用，只做展示拼接、不做判定。
 * 路径多时显示前 3 个 + 「等 n 个」。
 */
export function judgeResultSummary(
  payload: Pick<OperatorJudgeResultPayload, "group" | "cardKind" | "selected" | "confirmed" | "paths" | "flowId" | "actionSource">,
): string {
  if (payload.actionSource?.kind === "chief-delegated") {
    const source = payload.actionSource;
    const result = source.disposition === "revise" ? "幕僚已退修" : source.disposition === "reject" ? "幕僚已拒绝" : "幕僚已决定";
    return `${result}：${source.selected?.join("、") ?? ""}${source.selected?.length ? "；" : ""}${source.reason}`;
  }
  const flow = typeof payload.flowId === "string" && payload.flowId !== "" ? mainT("ui.judge.flowSuffix", { flowId: payload.flowId }) : "";
  // decision 卡（2026-10-26）：judge 默认推荐的结果行必须如实标「自动代理」且不是客户本人；
  // 同一行附不变量「决策卡不是验收、不是客户批准，也不构成验收/提案/任命决定」（不触发 gate/验收，
  // 最终验收仍走既有链路）。
  if (payload.cardKind === DECISION_CARD_KIND) {
    const selected = Array.isArray(payload.selected) ? payload.selected : [];
    const option = selected.length > 0 ? selected.join("、") : mainT("shared.common.unknownReason");
    return (
      mainT("main.decisionCard.judgeSelectedRecommended", { option }) +
      " " +
      mainT("main.decisionCard.notApproval") +
      flow
    );
  }
  if (payload.cardKind === "download") {
    return mainT("ui.judge.headline.autoApproved") + " · " + mainT("ui.judge.mode.approval") + " · " + mainT("main.download.card.title") + flow;
  }
  if (payload.cardKind === "proposal") return mainT("main.customerInput.judgeDecisionHead") + flow;
  if (payload.cardKind === "acceptance") return mainT("main.customerInput.judgeAcceptanceHead") + flow;
  if (payload.cardKind === "appointment") {
    const ids = Array.isArray(payload.selected) ? payload.selected : [];
    return mainT("main.customerInput.judgeAppointmentHead", { ids: ids.join("、") }) + flow;
  }
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  if (paths.length === 0) return mainT("main.customerInput.judgeWriteHeadZero");
  const shown = paths.slice(0, 3).join("、");
  if (paths.length > 3) {
    return mainT("main.customerInput.judgeWriteHeadOverflow", { count: paths.length, paths: shown });
  }
  return mainT("main.customerInput.judgeWriteHead", { count: paths.length, paths: shown });
}

/**
 * **验收卡 judge auto-rework 回调事实**（2026-10-23 验收返工路由方案 v1 §5.3.1 / Q7 A）。
 *
 * 只描述**已结算**的 judge 自动退回（`declined`、`operatorId:"judge:*"`、非 `notPresented`）；本模块
 * **不路由、不写账本、不伪造客户决定**——路由由主进程接线到 Interface（`routeAcceptanceAutoRework`）。
 */
export interface AutoReworkCallbackInfo {
  flowId: string;
  cardKind: GovernanceCardKind;
  /** `judge-deny`＝判断 agent 拒绝；`judge-manual`＝判断未能代批（timeout/parse-failed/not-recommended/group-mismatch）。 */
  source: "judge-deny" | "judge-manual";
  reasonCode: string;
  /** 已人话化的可操作原因（与结算给发起角色的 decline reason 同源）。 */
  reason: string;
  operatorId: string;
  engine: RuntimeKind;
  requestId: string;
  roleId: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  at: string;
}

/** 客户指令 decision 消费者的可见系统行（既有 delivery-note；不含原文）。 */
export interface DirectiveDecisionNotice {
  roleId: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  summary: string;
}

/**
 * decision 指令消费者（C1 冻结）：只处理 `cardKind==="decision"`。`applyDecisionDirective` 是 B1 公共句柄
 * 的 target-scoped 入口；本通道**不复制**消费/冲突/once 逻辑。
 * `emitResult` 是可见结果行的唯一钩子（抛错 ⇒ applyDecisionDirective 不消费、返回 undefined ⇒ 回落客户卡）；
 * `emitNotice` 只用于冲突/不匹配说明（投达失败只记诊断，不影响卡片呈现/不消费）。
 */
export interface DirectiveDecisionConsumerOptions {
  decisionFacts(projectRoot: string): DecisionDirectiveSnapshot | undefined;
  applyDecisionDirective(
    projectRoot: string,
    card: DecisionCardFacts,
    hooks: DecisionHooks,
  ): Promise<DecisionApplyResult | undefined>;
  emitResult(notice: DirectiveDecisionNotice): void;
  emitNotice(notice: DirectiveDecisionNotice): void;
}

export interface CreateCustomerInputChannelOptions {
  onExpired?: (payload: OperatorExpiredPayload) => void;
  /**
   * **排队通知（三权 §6.1 硬约束 / §九-10，2026-10-17）**：同一项目已有待客户决定卡时，后续治理请求
   * **入队、不调用 presenter**；本回调让界面如实显示「等待前一个决定」（不自动合并、不自动批准）。
   * `waitingFor` = 当前占位请求的 id。缺省 ⇒ 无排队状态外推（排队照旧生效）。
   */
  onQueued?: (payload: OperatorRequestPayload, waitingFor: string) => void;
  /** 表现层（主进程 webContents.send）；**未配置 → 一律 unavailable**（能力缺席即 fail-closed）。 */
  presenter?: OperatorRequestPresenter;
  /**
   * **治理下一步（2026-10-18 客户修正）**：客户决定**成功结算**（answered）后推导下一步并回调；
   * `nextFunction/roleId` 为 null 也会回调（明确「无下一步」，供界面显示状态）。取消/拒绝/expired 不回调。
   * 主进程据此在**后台**打开目标治理角色会话并派发**一条**任务（不抢当前 pane、不自动批准、不写账本）；
   * 本模块自身不打开会话、不发模型消息——回调抛错只记诊断，绝不影响已完成的客户决定。
   */
  onNextStep?: (payload: GovernanceNextStepPayload, context: GovernanceNextStepContext) => void;
  /** 操作者标识（随 `CustomerInputOutcome.operatorId` 交给编排，先例同 shell 闸 (a)）。空/缺失归 unknown。 */
  operatorId: string;
  /** 关联 id 生成器（缺省 `op-<n>`；注入以便测试确定性）。 */
  nextId?: () => string;
  /**
   * **治理卡判断 agent（2026-10-18 双开关评审 §8.1）**：缺省 ⇒ 永不判断（行为与改动前逐字一致）。
   * `fn` 也可由每次 `customerInput` 的 `ctx.governanceJudge` 提供（per-session；ctx 优先）。
   * `isGroupEnabled` 是主进程权威——通道在 `presentEntry` 当刻与 `approve` 结算前各查一次。
   * 本模块**不判定**「该不该批」：只把请求与 `metadata.judgeContext` 的应用事实拼给 driver。
   */
  delegation?: {
    get(): { enabled: boolean; revision: number };
    subscribe(listener: () => void): () => void;
  };
  judge?: {
    /** 每会话注入的判断能力；缺省 ⇒ 不判断。 */
    fn?: GovernanceJudgeFn;
    /** 主进程权威：所属组是否开启（approval/decision 互不影响）。 */
    isGroupEnabled: (group: GovernanceJudgeGroup) => boolean;
    /**
     * 通道层防御超时；缺省由 `ANS_GOVERNANCE_JUDGE_TIMEOUT_MS`（driver 超时，默认 120s）+ 15s 余量派生
     * ⇒ **135s**（driver 内还有一层硬超时，绝不让通道先杀 driver）。shell judge 的通道超时仍为 15s，互不影响。
     */
    timeoutMs?: number;
    /** 环境变量来源（缺省 `process.env`；测试注入用——不修改全局环境）。 */
    env?: Record<string, string | undefined>;
  };
  /**
   * **判断结果行推送**（§8.1）：`approve` 时调用；**抛错/缺失 ⇒ 该卡回落 `manual/row-failed`**。
   * 结果行是代批的可见性条件；主进程推 IPC `session:operator-judge`。
   */
  emitJudgeResult?: (payload: OperatorJudgeResultPayload) => void;
  /**
   * **客户指令 decision 消费者（C1，2026-11-03）**：缺省 ⇒ 不消费指令（旧行为逐字不变）。
   * 只在 `cardKind==="decision"` 且 `presentEntryNow()` 的 `tryAutoSelectDecision` **之前**进入；
   * 冲突/不匹配绕过默认推荐并呈现客户卡（说明经 `emitNotice` 系统行）。
   */
  directive?: DirectiveDecisionConsumerOptions;
  /**
   * **验收卡 judge auto-rework 回调**（2026-10-23 验收返工路由方案 v1 §5.3.1；Q7 A）：
   * 只在 `cardKind==="acceptance"` 的 judge deny/manual **成功结算为 declined 之后**回调，且 allowlist：
   * verdict `deny`；manual 的 `timeout`/`parse-failed`/`not-recommended`/`group-mismatch`。
   * **不触发**：`switch-off`（回原卡）、`aborted`/取消、`unavailable`、`notPresented`、
   * `ledger-unavailable`、`row-failed`。回调**隔离**：抛错只记诊断，不影响已结算的 decline、
   * 三态/账本语义或后续排队；本模块自身不路由、不开会话、不写盘。
   */
  onAutoRework?: (info: AutoReworkCallbackInfo) => void;
  /**
   * **验收分诊呈现前闸（2026-10-25 设计 `2026-10-25_design_removedAcceptanceTriage.md` §3.2 / §7）**：
   * 只对 `cardKind==="acceptance"` 的请求调用，且在**任何呈现/判断代批之前**。缺省 ⇒ 不分诊
   * （旧行为逐字不变）。gate 抛错/未知结果 ⇒ 按 `proceed` 回落既有验收卡路径（fail-safe）。
   * 本模块只执行 gate 结果；解析/记录/路由/汇报全在 Interface。
   */
  acceptanceTriage?: AcceptanceTriageGate;
  /**
   * **边界内写入预授权（2026-10-25 客户新规则）**：写盘确认请求在**呈现卡片/调用判断之前**求值。
   *  · `accept`：全部声明写入路径在角色 Section 1 内且非治理敏感 ⇒ 直接以同意结算（不弹卡、不调 judge）；
   *  · `reject`：任一路径越界/不可解析（含混合）⇒ 直接拒绝（不弹卡、不调 judge，原因列出路径与可写边界）；
   *  · `confirm`：治理敏感类别或未声明写入路径 ⇒ 走**既有**卡片/判断路径（零行为变化）。
   * 结算 `operatorId` 恰为 `WRITE_PREAUTHORIZATION_OPERATOR_ID`（system 前缀）——不是客户、不是 judge。
   * 缺省（或会话未提供 `ctx.writeBoundary`）⇒ 不做预授权判定，旧行为逐字不变。
   */
  writePreauthorization?: (facts: WritePreauthorizationFacts) => WritePreauthorizationDecision;
  /**
   * 预授权结算后的**可见系统行**（主进程接线到既有事件流；抛错只记诊断，绝不影响已完成的结算）。
   * 缺省 ⇒ 只记诊断。
   */
  onWritePreauthorization?: (event: WritePreauthorizationEvent) => void;
}

/** Trusted host basis; no model-provided baseline, evidence or identity is accepted. */
export interface ChiefDecisionBasis {
  baseDigest: string;
  evidenceRefs: readonly SnapshotArtifactRef[];
  context: string;
  isCurrent(): Promise<boolean>;
}
export interface ChiefDecisionHost {
  prepare(request: CustomerInputRequest, metadata?: CustomerInputMetadata): Promise<ChiefDecisionBasis>;
  execute(context: ChiefDecisionExecutionContext, evidence: string, decide: DecidePendingRequestFn, signal: AbortSignal): Promise<void>;
}

export interface CustomerInputChannel {
  /**
   * 交给编排的**原始客户通道**（`CustomerInputFn` 形状）。返回恒为冻结三态（绝不返回 null/undefined）；
   * 且必须**带上角色上下文**（请求本体不带 roleId——桌面经闭包绑定，见 `bindRole`）。
   */
  customerInput: DesktopCustomerInputFn;
  /**
   * 回包受理（IPC `session:operator-response` 的处理器核心）：按请求快照校验后解挂。
   * 分清两种不受理（真机语义；G-1 修订）：
   *  · **可重试**（`{ok:false, error}`，无 `expired`）：决定内容非法/与请求不符——请求仍在挂起，界面可修正后重传；
   *  · **终态**（`{ok:false, error, expired:true}`）：该 id **已无挂起请求**——G-1 起**只剩一种真实失效**：
   *    **应用关闭/重启**（未决请求随窗口清空；**不再有按时间超时**）——界面应定格并如实说明（重启/关闭、请重发起），
   *    **不得**解冻反复重试。
   */
  respond(input: { id?: unknown; decision?: unknown }): { ok: boolean; error?: string; expired?: boolean };
  /** 关闭通道：所有挂起请求归 `declined`（窗口已关——未获同意，fail-closed）。幂等。 */
  rejectAllPending(reason: string): void;
  /** 当前挂起数（测试/如实呈现用）：**已呈现的那张＋排队中的请求**（排队者另见 `queuedCount`）。 */
  pendingCount(): number;
  /** **排队中的治理请求数**（同项目已有待决定卡时入队；未呈现、未自动批准）。 */
  queuedCount(): number;
  /**
   * **按角色挂起数**（G-2/W1 依赖项，2026-10-16 客户批准）：看护信号 #1「轮次逼近超时」对**带挂起确认卡的
   * 角色**不计入（正确等待不报）——主进程把本视图与 shell 卡/恢复卡的按角色视图合并后交看护。纯读。
   */
  pendingRoles(): Map<string, number>;
  replayPending(): number;
  /**
   * **判断中的卡数**（2026-10-18 双开关评审 §4.2；诊断/测试用）：`judging` 既不是「等待客户」也不计入
   * `pendingCount`/`queuedCount`/`pendingRoles`（看护把它视为角色忙碌，不点亮「等待你确认」徽标）。
   */
  judgingCount(): number;
  /**
   * **重启恢复：呈现一张应用自有分诊卡**（2026-10-25 验收分诊设计 §9.4 `awaiting-decision`）。
   * 稳定 `card.id` 幂等：已在队列/已呈现 ⇒ 直接返回 `{ok:true}`（不重复弹卡）。没有活体验收请求时
   * 客户作答只执行处置（由 `onAnswer` 返回 `settlement:null` 表达），**不伪造 customer.decision**。
   */
  presentAcceptanceTriageCard: PresentAcceptanceTriageCardFn;
}

/**
 * 桌面侧的客户通道（**带角色上下文**）：与冻结家 `CustomerInputFn` 同形，但多一个 `ctx.roleId`——
 * 请求本体不携带角色标识，桌面经**每会话闭包**绑定（`SessionManager.open` 装配），
 * 之后的出参形状与冻结家逐字一致。
 */
export type DesktopCustomerInputFn = (
  req: CustomerInputRequest,
  ctx: {
    roleId: string;
    /** Application lifecycle id, bound by SessionManager, never model input. */
    requestId?: string;
    runtime?: CustomerInputMetadata["runtime"];
    projectRoot?: string;
    sessionSignal?: AbortSignal;
    /** 决定卡镜像面（trio 主入口 Liaison 的角色 id；由 `SessionManager.open` 按模型/卡片种类/来源角色计算）。 */
    mirrorRoleId?: string;
    /** 治理模型（`SessionManager.open` 定格）：判断门只认 `"trio"`；single/su 不代批（§3.2）。 */
    governanceModel?: "single" | "trio";
    /** 验收决定卡的应用私有展示载荷（仅 acceptance 卡；不进入 metadata/账本）。 */
    acceptanceReport?: AcceptanceReportDisplayV1;
    /** 每会话判断闭包（编排 `createGovernanceJudge`；与 shell judge 同一份 runtimeOptions/createAdapter）。 */
    governanceJudge?: GovernanceJudgeFn;
    chiefDecision?: ChiefDecisionHost;
    /** 当前轮投递给该角色的文本（≤4KB；判断 agent 的 `turnText` 输入）。缺省不猜。 */
    turnText?: string;
    /**
     * 下载卡事实不可用时的客户提示（2026-11-04 download-requests C1/W-3）：
     * 只用于「省略 judgeContext、直接客户卡」场景；其他卡种/调用方不传 ⇒ 零行为变化。
     */
    judgeNotice?: string;
    /**
     * **本会话的 Section 1 边界快照（含接受证据）**（2026-10-25 客户新规则；`SessionManager.open`
     * 按门禁同一解析源给出）。仅用于写盘确认的边界预授权判定；缺省 ⇒ 不判定（旧行为逐字不变）。
     */
    writeBoundary?: BoundarySection1;
    /** `resolveWrite` 的 skill 根（与开会话同一份 ProjectConfig；`writeBoundary` 给出时才使用）。 */
    skillRoot?: string;
    /**
     * **卡片已呈现回调**（仅需求变更审批卡使用）：presenter 成功推达后调用一次；用于把「已提交审批」
     * 与「尚未呈现/立即失败」区分开（工具回执不得谎称已提交）。排队中的卡在真正呈现时才回调。
     */
    onPresented?: () => void;
  },
  metadata?: CustomerInputMetadata,
) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined;

/** 治理 judge driver 超时的环境变量名（与编排 `GOVERNANCE_JUDGE_TIMEOUT_ENV` 同名；不 import 其私有模块）。 */
export const GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_ENV = "ANS_GOVERNANCE_JUDGE_TIMEOUT_MS";
/** 通道层比 driver 多留的余量（避免通道先触发、杀掉 driver 的合法判断）。 */
export const GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_MARGIN_MS = 15_000;
/** driver 缺省超时（与编排 `DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS` 同值；通道据此派生 135s）。 */
export const DEFAULT_GOVERNANCE_JUDGE_CHANNEL_BASE_MS = 120_000;
/** 治理 judge 通道层缺省防御超时：driver 120s + 15s 余量 = 135s。**shell judge 仍 15s。** */
export const DEFAULT_GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_MS =
  DEFAULT_GOVERNANCE_JUDGE_CHANNEL_BASE_MS + GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_MARGIN_MS;

/**
 * 解析治理 judge 通道层超时（导出供测试钉住）：
 * 显式 `timeoutMs`（测试/宿主）优先；否则环境变量 `ANS_GOVERNANCE_JUDGE_TIMEOUT_MS`（正整数）＋15s 余量；
 * 非法/缺失 ⇒ 135_000。driver 自己的超时由编排单独解析（同名 env）。
 */
export function resolveChannelJudgeTimeoutMs(
  option: unknown,
  env?: Record<string, string | undefined>,
): number {
  if (typeof option === "number" && Number.isFinite(option) && option > 0) return Math.floor(option);
  const source = env ?? (typeof process !== "undefined" ? process.env : {});
  const raw = source[GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_ENV];
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed + GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_MARGIN_MS;
    }
  }
  return DEFAULT_GOVERNANCE_JUDGE_CHANNEL_TIMEOUT_MS;
}

/** 超时人话的时长格式：整秒用 `Ns`，否则 `Nms`（与编排 driver 文案同口径）。 */
export function formatJudgeTimeoutMs(timeoutMs: number): string {
  return timeoutMs >= 1000 && timeoutMs % 1000 === 0 ? `${timeoutMs / 1000}s` : `${timeoutMs}ms`;
}

/**
 * 自动拒绝去重用的**卡指纹**（2026-11-04 客户直修）：角色反复重发同一张卡时，只要
 * kind/title/question/options/preview/flowId/cardKind/sourceRoleId/application 相同 ⇒ 同一指纹。
 * 只用于去重，不进入账本/呈现；字符串有界（16KiB/项）防大卡拖慢哈希。
 */
function cardFingerprint(request: CustomerInputRequest): string {
  const bounded = (value: unknown): string => (typeof value === "string" ? value.slice(0, 16_384) : "");
  const shape = {
    kind: request.kind,
    title: bounded(request.title),
    question: request.kind === "choice" ? bounded(request.question) : "",
    multiple: request.kind === "choice" && request.multiple === true,
    preview: bounded(request.preview),
    options: request.kind === "choice"
      ? request.options.map((option) => [bounded(option.id), bounded(option.label), bounded(option.description), option.recommended === true])
      : [],
    flowId: bounded(request.flowId),
    cardKind: bounded(request.cardKind),
    sourceRoleId: bounded(request.sourceRoleId),
    application: request.application === true,
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

/**
 * 装配桌面客户交互通道。产出：`customerInput`（给编排）+ `respond`（回包受理）+ `rejectAllPending`（窗关清帐）。
 * 「恰好明确作答才算 answered」是本模块的**唯一保证**；其余一切路径都是 `declined`/`unavailable`。
 */
export function createCustomerInputChannel(opts: CreateCustomerInputChannelOptions): CustomerInputChannel {
  const operatorId =
    typeof opts.operatorId === "string" && opts.operatorId.trim() !== "" ? opts.operatorId : "unknown";
  let seq = 0;
  /** 判断结果行的幂等键序号（本通道/窗口内递增；结果行是运行期呈现，不回放）。 */
  let judgeResultSeq = 0;
  /**
   * 治理决定卡**一项目一卡**（评审 §6.1 硬约束 / §九-10）：同一 `projectRoot` 同一时刻只**呈现**一张；
   * 后续请求进 `waiting`，**不调用 presenter、不自动批准**；第一张 resolve/取消/超时/会话失效后按序呈现。
   * `pending` 只放**已呈现**的那张（`pendingCount`/`pendingRoles`/`replayPending` 语义不变）。
   */
  interface ChannelEntry {
    payload: OperatorRequestPayload;
    request: CustomerInputRequest;
    /** 同项目的排队键（`ctx.projectRoot`；缺失按空串——单窗口下即"当前项目"）。 */
    projectKey: string;
    signals: AbortSignal[];
    cleanup: () => void;
    resolve: (outcome: CustomerInputOutcome) => void;
    /**
     * `queued` → `judging`（判断 agent 正在看卡；**不是**在等客户）→ `active`（卡片已呈现）/`done`。
     * 只有 `active` 进 `pending`；`judging`/`directing` 占住一项目一卡，但**不点亮**「等待你确认」。
     * `triaging`（2026-10-25 验收分诊）：验收请求正被前闸求值/已被分诊卡替换——不呈现原卡、
     * 不进 pending，但**占住一项目一卡槽位**。
     * `directing`（2026-11-03 客户授权平面）：decision 指令消费者正在求值/等待 durable 消费——
     * 不呈现、不计入 `pendingCount`/`pendingRoles`/`judgingCount`，但占住一项目一卡槽位。
     */
    state: "active" | "queued" | "judging" | "triaging" | "directing" | "done";
    /** 同一请求只判断一次（§4.2）：进入 `judging` 即定格；`replay`/`drain` 永不再次判断。 */
    judged?: boolean;
    chiefAttempted?: boolean;
    chiefAbort?: AbortController;
    chiefRevision?: number;
    /**
     * decision 卡发卡前校验的定格结果（2026-10-26）：仅 `cardKind="decision"` 且校验通过时存在。
     * 推荐项在**呈现/代选之前**定格；「替我决策」默认推荐只读本字段，不再重复解析选项。
     */
    decisionCard?: { flowId: string; recommendedOptionId: string };
    /** 判断所需的会话上下文（调用当刻快照；不含任何判定）。 */
    ctx: {
      runtime?: CustomerInputMetadata["runtime"];
      projectRoot?: string;
      governanceModel?: "single" | "trio";
      governanceJudge?: GovernanceJudgeFn;
      chiefDecision?: ChiefDecisionHost;
      turnText?: string;
      /** 卡片呈现成功回调（仅需求变更审批卡携带；presenter 成功后才调用一次）。 */
      onPresented?: () => void;
    };
    /** `run-role` 计算的应用事实（`judgeContext`）与卡片元数据；原样透传、不重算。 */
    metadata?: CustomerInputMetadata;
    /**
     * 2026-10-20 真机（UI 残留「还有 7 个决定等待前一个决定」）：该请求**曾进入等待队列并已通知界面**
     * （`onQueued` 成功发出）。若它之后被判断 agent 直接代批/自动退回而**从未 presenter 呈现**，
     * 结算时必须经 `onExpired` 通知界面删除排队行（`session:operator-expired` 渲染侧已有删除处理）。
     */
    queuedNotified?: boolean;
    /** 是否**已经 presenter 呈现**过（呈现过 ⇒ 界面按呈现态处理，结算不再补发「排队移除」）。 */
    presented?: boolean;
    /** 已发过 `onExpired`（rejectAllPending / cancel / 结算补发共用；防重复通知）。 */
    expiredNotified?: boolean;
    /** 验收分诊前闸是否已求值（同一请求只过闸一次；`replay`/`drain` 永不重判——同 `judged`）。 */
    triageEvaluated?: boolean;
    /** decision 指令消费者是否已求值（同一请求只进入一次；回落客户卡后不再重复消费）。 */
    directiveEvaluated?: boolean;
    /** 应用自有卡（分诊卡）：作答后的处置与被它拦住/挂靠的验收请求。 */
    appCard?: AppCardState;
  }

  /** 应用自有 choice 卡（分诊卡）的通道状态：不是角色工具请求、不写账本、不推导下一步。 */
  interface AppCardState {
    onAnswer: (
      answer: AcceptanceTriageAnswer,
    ) => Promise<AcceptanceTriageAnswerResult> | AcceptanceTriageAnswerResult;
    /** 被这张分诊卡拦住（或重启后需在作答时补齐结算）的验收请求。 */
    held: ChannelEntry[];
  }
  const requestResults = new Map<string, { originRoleId: string; fingerprint: string; promise: Promise<CustomerInputOutcome> }>();
  const pending = new Map<string, ChannelEntry>();
  /** 判断中的卡（不呈现、不计入 pending/queued/pendingRoles；中止时一并结算）。 */
  const judging = new Map<string, ChannelEntry>();
  /** projectKey → 排队中的请求（按到达序）。 */
  const waiting = new Map<string, ChannelEntry[]>();
  /** projectKey → 当前占位请求 id（未呈现时不存在）。 */
  const activeByProject = new Map<string, string>();
  /**
   * 分诊前闸求值中/已替换为分诊卡的验收请求（`payload.id → entry`）：不呈现、不计入 pending，
   * 但**占住一项目一卡槽位**（分诊卡或被拦验收卡同一时刻只有一张可见卡）。中止/关窗时一并结算。
   */
  const triagingHolds = new Map<string, ChannelEntry>();
  /** decision 指令求值中的卡（不呈现、不计入 pending/judging；占住一项目一卡，关窗/中止时一并结算）。 */
  const directingHolds = new Map<string, ChannelEntry>();
  const diagnostic = createDiagnosticLogger({ component: "desktop.customer-input" });
  /**
   * 自动拒绝去重（2026-11-04 客户直修）：同一卡指纹只允许自动拒绝一次；之后同指纹一律
   * 原卡升级客户确认（不重复轰炸）。键 = 项目 + 内容指纹；进程内会话级（不写盘、不进账本）。
   */
  const autoRejectedCards = new Set<string>();
  const autoRejectKey = (entry: ChannelEntry): string => `${entry.projectKey}\u0000${cardFingerprint(entry.request)}`;
  /** 记录一次自动拒绝；返回 false = 该指纹此前已自动拒绝过 ⇒ 本次必须升级客户。 */
  const markAutoRejected = (entry: ChannelEntry): boolean => {
    const key = autoRejectKey(entry);
    if (autoRejectedCards.has(key)) return false;
    autoRejectedCards.add(key);
    return true;
  };

  const projectKeyOf = (ctx: { projectRoot?: string } | undefined): string =>
    typeof ctx?.projectRoot === "string" && ctx.projectRoot !== "" ? ctx.projectRoot : "";

  const notifyExpired = (entry: ChannelEntry, reason: string): void => {
    if (entry.expiredNotified === true) return; // 2026-10-20：已通知过（rejectAllPending/cancel/结算补发）不重复
    entry.expiredNotified = true;
    try {
      opts.onExpired?.({ id: entry.payload.id, roleId: entry.payload.roleId, runtime: entry.payload.runtime, projectRoot: entry.payload.projectRoot, reason });
    } catch (error) {
      diagnostic.error("interaction.expired.failed", error, { requestId: entry.payload.id });
    }
  };

  const removeQueued = (entry: ChannelEntry): void => {
    const queue = waiting.get(entry.projectKey);
    if (queue === undefined) return;
    const idx = queue.indexOf(entry);
    if (idx >= 0) queue.splice(idx, 1);
    if (queue.length === 0) waiting.delete(entry.projectKey);
  };

  /**
   * 客户决定**成功结算**后推导下一步并回调（只有 answered；取消/拒绝/expired 一律不回调）。
   * 推导/回调均隔离：抛错只记诊断，绝不影响已完成的客户决定与排队流转。
   */
  const notifyNextStep = (entry: ChannelEntry, outcome: CustomerInputOutcome): void => {
    if (outcome.outcome !== "answered" || opts.onNextStep === undefined) return;
    let payload: GovernanceNextStepPayload | null;
    try {
      payload = deriveGovernanceNextStep(entry.request, outcome);
    } catch (error) {
      diagnostic.error("interaction.next-step.failed", error, { requestId: entry.payload.id });
      return;
    }
    if (payload === null) return; // 无治理元数据 / 未知卡片种类：旧行为零变化。
    const selected = outcome.value?.selected;
    // 2026-10-22 第 1 项：appointment 的团队计划上下文**按结构**透传（请求对象显式携带才带；缺席不猜，
      // Interface 会优先账本 artifactPath、再按 flowId 派生最新团队计划）。冻结契约当前无该字段。
    const teamPlanPathRaw = (entry.request as { teamPlanPath?: unknown }).teamPlanPath;
    const context: GovernanceNextStepContext = {
      ...(entry.payload.roleId !== "" ? { sourceRoleId: entry.payload.roleId } : {}),
      ...(entry.payload.projectRoot !== undefined ? { projectRoot: entry.payload.projectRoot } : {}),
      ...(entry.payload.runtime !== undefined ? { runtime: entry.payload.runtime } : {}),
      ...(payload.cardKind === "appointment" && Array.isArray(selected) ? { targetRoleIds: selected } : {}),
      // W6-B 审计（四角色评审 AC19）：仅当请求显式带 stepId 时透传；缺席不猜、不伪造。
      ...(typeof entry.request.stepId === "string" && entry.request.stepId !== "" ? { stepId: entry.request.stepId } : {}),
      ...(payload.cardKind === "appointment" && typeof teamPlanPathRaw === "string" && teamPlanPathRaw.trim() !== ""
        ? { teamPlanPath: teamPlanPathRaw }
        : {}),
    };
    try {
      opts.onNextStep(payload, context);
      diagnostic.record("interaction.next-step", {
        requestId: entry.payload.id,
        cardKind: payload.cardKind,
        nextFunction: payload.nextFunction,
        roleId: payload.roleId,
      });
    } catch (error) {
      diagnostic.error("interaction.next-step.failed", error, { requestId: entry.payload.id });
    }
  };

  /**
   * judge auto-rework 的**验收卡**回调（2026-10-23 验收返工路由 §5.3.1 / Q7 A）。
   *
   * 只在 acceptance 卡、judge 来源、decline 已结算后调用；只传事实。隔离：抛错只记诊断，绝不影响
   * 已完成的 decline 结算、三态或排队流转（同 `notifyNextStep` 的隔离口径）。
   */
  const notifyAutoRework = (
    entry: ChannelEntry,
    plan: JudgePlan,
    outcome: GovernanceJudgeOutcome,
    source: AutoReworkCallbackInfo["source"],
    reason: string,
  ): void => {
    if (opts.onAutoRework === undefined) return;
    if (plan.cardKind !== "acceptance") return; // 只对验收卡；其他卡零行为变化
    const flowId = plan.request.flowId;
    if (typeof flowId !== "string" || flowId === "") return;
    const info: AutoReworkCallbackInfo = {
      flowId,
      cardKind: plan.cardKind,
      source,
      reasonCode: outcome.reasonCode,
      reason,
      operatorId: `judge:${outcome.engine}`,
      engine: outcome.engine,
      requestId: entry.payload.id,
      roleId: entry.payload.roleId,
      ...(entry.payload.projectRoot !== undefined ? { projectRoot: entry.payload.projectRoot } : {}),
      ...(entry.payload.runtime !== undefined ? { runtime: entry.payload.runtime } : {}),
      at: new Date().toISOString(),
    };
    try {
      opts.onAutoRework(info);
      diagnostic.record("interaction.auto-rework", {
        requestId: entry.payload.id,
        flowId,
        source,
        reasonCode: outcome.reasonCode,
      });
    } catch (error) {
      diagnostic.error("interaction.auto-rework.failed", error, { requestId: entry.payload.id, flowId, source });
    }
  };

  /**
   * 客户主权卡的**结算出口最后防线**（2026-11-04 trunk-amendment D1；PM 复审 §4.6/F9）：
   * outcome 带 judge 审计或 operatorId 以 `judge:`/`directive:` 开头 ⇒ 一律拒绝结算（pending 保留），
   * 即使上游接线错误也不会把非客户选择送给 Pipeline。其他卡种零行为变化。
   */
  const isSovereignCard = (entry: ChannelEntry): boolean =>
    isApplicationDecisionReservedForCustomer(entry.request) || isGovernanceWriteCardKind(cardKindOf(entry));
  const isNonCustomerOutcome = (outcome: CustomerInputOutcome): boolean => {
    const operatorId = "operatorId" in outcome && typeof outcome.operatorId === "string" ? outcome.operatorId : undefined;
    if (operatorId !== undefined && (operatorId.startsWith("judge:") || operatorId.startsWith("directive:"))) return true;
    return outcome.outcome === "answered" && outcome.judge !== undefined;
  };

  /**
   * 结算一张卡（已呈现或判断中）：清对应登记/占位 → 清监听 → resolve → 下一步推导 → 按序呈现同项目下一张。
   * **`notifyNextStep`/`drainProject` 恰一次**（§4.3）：代批成功与客户手批走同一条结算路径，
   * 下一步的 `advanceGovernanceFlow`/`dispatch.accepted(app)` 语义逐字不变。
   */
  const settleEntry = (entry: ChannelEntry, outcome: CustomerInputOutcome, from: "active" | "judging" | "directing"): void => {
    if (entry.state !== from) return;
    if (isSovereignCard(entry) && isNonCustomerOutcome(outcome)) {
      diagnostic.error(
        "sovereign-card.non-customer-settlement.blocked",
        new Error("非客户来源的主权卡结算被拒绝"),
        { requestId: entry.payload.id, operatorId: "operatorId" in outcome ? outcome.operatorId : undefined },
      );
      return;
    }
    if (from === "active") pending.delete(entry.payload.id);
    else if (from === "judging") judging.delete(entry.payload.id);
    else directingHolds.delete(entry.payload.id);
    if (activeByProject.get(entry.projectKey) === entry.payload.id) activeByProject.delete(entry.projectKey);
    entry.state = "done";
    // 2026-10-20 真机：排队请求被判断 agent 直接代批/自动退回（从未 presenter 呈现）⇒ 界面必须删掉
    // 「等待前一个决定」排队行（onExpired 复用 session:operator-expired 的既有删除处理）。
    if (entry.queuedNotified === true && entry.presented !== true) {
      notifyExpired(entry, mainT("main.customerInput.expiredQueued"));
    }
    entry.cleanup();
    entry.resolve(outcome);
    notifyNextStep(entry, outcome);
    // 分诊卡结算：把客户作答应用到被拦验收请求，再执行 Interface 的处置（不阻塞 drain）。
    if (entry.appCard !== undefined) finishAppCard(entry, outcome);
    drainProject(entry.projectKey);
  };

  /** 结算**已呈现**的那张（既有语义逐字不变）。 */
  const settleActive = (entry: ChannelEntry, outcome: CustomerInputOutcome): void => {
    settleEntry(entry, outcome, "active");
  };

  /** 呈现一张卡（原路径；`judgeNotice` 若有已由回落路径写在 `payload` 上）：登记 pending/占位 → presenter。 */
  const presentNow = (entry: ChannelEntry): void => {
    activeByProject.set(entry.projectKey, entry.payload.id);
    pending.set(entry.payload.id, entry);
    entry.state = "active";
    try {
      opts.presenter!(entry.payload);
      entry.presented = true; // 2026-10-20：真正呈现成功后才算「呈现过」（推达失败按未呈现处理）
      // 2026-10-26 需求变更审批卡：呈现成功回调（仅应用发起的卡携带；异常不影响呈现/结算）。
      try {
        entry.ctx.onPresented?.();
      } catch (error) {
        diagnostic.error("interaction.presented-callback.failed", error, { requestId: entry.payload.id });
      }
      diagnostic.record("interaction.presented", { requestId: entry.payload.id, pendingCount: pending.size, queuedCount: queuedCount() });
    } catch (err) {
      diagnostic.error("interaction.present.failed", err, { requestId: entry.payload.id });
      // 推不达（窗口已关等）→ 未获同意（fail-closed），不留悬案；继续呈现同项目下一张。
      settleActive(entry, { outcome: "declined", operatorId, reason: mainT("main.customerInput.deliveryFailed", { detail: reasonOf(err) }) });
    }
  };

  // —————————————— 2026-10-25 验收分诊：呈现前闸 / 应用自有分诊卡 ——————————————
  //
  // 纪律：本模块只执行 gate 的**决定**（proceed / settle / triage-card），不做解析、不读报告、不写记录、
  // 不路由返工、不写客户决定。分诊卡不是角色工具请求（无 cardKind ⇒ 不判断、不推导下一步、不写账本）；
  // 被拦住的验收请求不进 pending（客户看不到它），但占住「一项目一卡」槽位直到结算。

  /** 卡种（显式 cardKind 优先；与 `planJudge`/run-role 同口径）。 */
  const cardKindOf = (entry: ChannelEntry): GovernanceCardKind | undefined =>
    entry.request.cardKind ?? entry.metadata?.cardKind;

  /** `operatorId` 补齐：客户手点分诊卡的结算仍归属客户；gate 已给出的（如 judge）不覆盖。 */
  const withOperator = (outcome: CustomerInputOutcome): CustomerInputOutcome => {
    if (outcome.outcome === "unavailable") return outcome;
    const resolved =
      typeof outcome.operatorId === "string" && outcome.operatorId !== "" ? outcome.operatorId : operatorId;
    if (outcome.outcome === "answered") {
      return {
        outcome: "answered",
        value: outcome.value,
        operatorId: resolved,
        ...(outcome.acknowledged !== undefined ? { acknowledged: outcome.acknowledged } : {}),
        ...(outcome.directive !== undefined ? { directive: outcome.directive } : {}),
        ...(outcome.judge !== undefined ? { judge: outcome.judge } : {}),
      };
    }
    return {
      outcome: "declined",
      operatorId: resolved,
      ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
      ...(outcome.directive !== undefined ? { directive: outcome.directive } : {}),
      ...(outcome.notPresented === true ? { notPresented: true as const } : {}),
    };
  };

  /** 结算一张被分诊拦住的验收请求（不作为客户卡呈现；三态原样，绝不改写成 approve）。 */
  const settleHeldAcceptance = (entry: ChannelEntry, outcome: CustomerInputOutcome): void => {
    if (entry.state !== "triaging") return; // 已中止/已结算：丢弃（防双结算）
    triagingHolds.delete(entry.payload.id);
    entry.state = "done";
    const normalized = withOperator(outcome);
    entry.cleanup();
    entry.resolve(normalized);
    notifyNextStep(entry, normalized);
  };

  const findAppCard = (id: string): ChannelEntry | undefined =>
    pending.get(id) ??
    judging.get(id) ??
    [...waiting.values()].flat().find((candidate) => candidate.payload.id === id);

  const answerOfOutcome = (outcome: CustomerInputOutcome): AcceptanceTriageAnswer =>
    outcome.outcome === "answered"
      ? { outcome: "answered", selected: Array.isArray(outcome.value.selected) ? [...outcome.value.selected] : [] }
      : { outcome: "declined", ...(typeof outcome.reason === "string" ? { reason: outcome.reason } : {}) };

  /** 分诊卡结算后的处置：先结算被拦验收请求（同步部分），再异步执行处置（失败只诊断）。 */
  const finishAppCard = (cardEntry: ChannelEntry, outcome: CustomerInputOutcome): void => {
    const app = cardEntry.appCard;
    if (app === undefined) return;
    const held = app.held.splice(0);
    const answer = answerOfOutcome(outcome);
    const fallbackReason = mainT("main.customerInput.deliveryFailed", { detail: mainT("shared.common.unknownReason") });
    let result: AcceptanceTriageAnswerResult | Promise<AcceptanceTriageAnswerResult>;
    try {
      result = app.onAnswer(answer);
    } catch (error) {
      diagnostic.error("acceptance.triage.answer.failed", error, { requestId: cardEntry.payload.id });
      result = { settlement: { outcome: "declined", operatorId, reason: fallbackReason } };
    }
    const runSafely = (settled: AcceptanceTriageAnswerResult): void => {
      if (settled.run === undefined) return;
      void Promise.resolve()
        .then(() => settled.run!())
        .catch((error) => diagnostic.error("acceptance.triage.run.failed", error, { requestId: cardEntry.payload.id }));
    };
    const apply = (settled: AcceptanceTriageAnswerResult): void => {
      for (const heldEntry of held) {
        settleHeldAcceptance(
          heldEntry,
          settled.settlement ?? { outcome: "declined", operatorId, reason: fallbackReason },
        );
      }
      runSafely(settled);
    };
    if (!(result instanceof Promise)) {
      apply(result); // 同步结算：`settleEntry` 随后 drain，无需占位
      return;
    }
    // 异步处置：用占位保持「一项目一卡」，直到被拦请求结算完毕（不让下一张卡插队）。
    const placeholder = held[0]?.payload.id ?? `triage-settle-${cardEntry.payload.id}`;
    activeByProject.set(cardEntry.projectKey, placeholder);
    void result
      .then(apply)
      .catch((error) => {
        diagnostic.error("acceptance.triage.answer.failed", error, { requestId: cardEntry.payload.id });
        apply({ settlement: { outcome: "declined", operatorId, reason: fallbackReason } });
      })
      .finally(() => {
        if (activeByProject.get(cardEntry.projectKey) === placeholder) activeByProject.delete(cardEntry.projectKey);
        drainProject(cardEntry.projectKey);
      });
  };

  /** 把一张被拦验收请求挂到分诊卡（若卡已在队列，摘出队列；状态 `triaging` 不入 pending）。 */
  const attachHeld = (cardEntry: ChannelEntry, heldEntry: ChannelEntry): void => {
    removeQueued(heldEntry);
    heldEntry.state = "triaging";
    triagingHolds.set(heldEntry.payload.id, heldEntry);
    cardEntry.appCard?.held.push(heldEntry);
  };

  /** 找出挂着某张被拦请求的分诊卡（取消路径用；无 ⇒ undefined）。 */
  const appCardHolding = (heldEntry: ChannelEntry): ChannelEntry | undefined =>
    [...pending.values(), ...judging.values(), ...[...waiting.values()].flat()].find(
      (cardEntry) => cardEntry.appCard?.held.includes(heldEntry) === true,
    );

  /**
   * 呈现（或幂等复用）一张应用自有分诊卡。稳定 id ⇒ 同一报告只呈现一张、只答一次；
   * 卡从不在呈现前调用判断 agent（无 cardKind），也不进入 `notifyNextStep` 的治理推导。
   */
  const presentTriageCardInternal = (
    card: AcceptanceTriageCardSpec,
    onAnswer: (
      answer: AcceptanceTriageAnswer,
    ) => Promise<AcceptanceTriageAnswerResult> | AcceptanceTriageAnswerResult,
    heldEntry?: ChannelEntry,
  ): { ok: boolean; error?: string } => {
    if (opts.presenter === undefined) {
      return { ok: false, error: mainT("main.customerInput.presenterMissing") };
    }
    const existing = findAppCard(card.id);
    if (existing !== undefined) {
      if (heldEntry !== undefined && existing.appCard !== undefined && !existing.appCard.held.includes(heldEntry)) {
        attachHeld(existing, heldEntry);
      }
      return { ok: true };
    }
    const request: CustomerInputRequest = {
      kind: "choice",
      title: card.title,
      question: card.question,
      options: card.options,
      ...(card.preview !== undefined ? { preview: card.preview } : {}),
    };
    const payload: OperatorRequestPayload = {
      id: card.id,
      roleId: card.roleId,
      request,
      anchorKey: interactionAnchorKey(request.kind, request.title),
      ...(card.projectRoot !== undefined ? { projectRoot: card.projectRoot } : {}),
      ...(card.runtime !== undefined ? { runtime: card.runtime } : {}),
    };
    const entry: ChannelEntry = {
      payload,
      request,
      projectKey: typeof card.projectRoot === "string" && card.projectRoot !== "" ? card.projectRoot : "",
      signals: [],
      cleanup: () => {},
      resolve: () => {}, // 应用自有卡没有角色 promise
      state: "queued",
      ctx: {},
      appCard: { onAnswer, held: [] },
    };
    if (heldEntry !== undefined) attachHeld(entry, heldEntry);
    // 正常路径：被拦验收请求已占位（activeByProject = held id），允许本轮替换；否则若项目已有别的占位，
    // 按「一项目一卡」排队（重启恢复时极少数情况）。
    const occupying = activeByProject.get(entry.projectKey);
    if (occupying !== undefined && (heldEntry === undefined || occupying !== heldEntry.payload.id)) {
      const queue = waiting.get(entry.projectKey) ?? [];
      queue.push(entry);
      waiting.set(entry.projectKey, queue);
      diagnostic.record("acceptance.triage.card.queued", { requestId: card.id });
      return { ok: true };
    }
    presentNow(entry);
    diagnostic.record("acceptance.triage.card.presented", { requestId: card.id, heldCount: entry.appCard?.held.length ?? 0 });
    return { ok: true };
  };

  /** 一次判断的定格计划（`shouldJudge` 全部满足才生成；只读事实，不含判定）。 */
  interface JudgePlan {
    fn: GovernanceJudgeFn;
    request: GovernanceJudgeRequest;
    group: GovernanceJudgeGroup;
    cardKind: GovernanceCardKind;
    timeoutMs: number;
  }

  /**
   * 治理 judge 通道层防御超时：显式 `timeoutMs` 优先；否则由 `ANS_GOVERNANCE_JUDGE_TIMEOUT_MS`
   * （driver 超时）+ 15s 余量派生；缺省 driver 120s ⇒ 通道 135s。**shell judge 不受影响（仍 15s）**。
   */
  const judgeTimeoutMs = resolveChannelJudgeTimeoutMs(opts.judge?.timeoutMs, opts.judge?.env);

  /**
   * `shouldJudge`（评审 §4.2，全部满足才调用 judge）：
   * ① presenter 存在（没有回落面就不判断）；② 注入了 judge fn（ctx 优先）；③ `cardKind` 有组；
   * ④ 主进程权威 `isGroupEnabled(group)`；⑤ `governanceModel === "trio"`；⑥ flowId 合法/非空；
   * ⑦ 信号未中止。另：`judgeContext` 必须存在（应用事实缺席 ⇒ 保持手动，旧路径零变化）。
   */
  const planJudge = (entry: ChannelEntry): JudgePlan | undefined => {
    if (opts.presenter === undefined) return undefined;
    if (entry.judged === true) return undefined; // 同一请求只判断一次
    const judgeContext = entry.metadata?.judgeContext;
    if (judgeContext === undefined) return undefined;
    const cardKind = entry.request.cardKind ?? entry.metadata?.cardKind;
    if (cardKind === undefined) return undefined;
    // 2026-11-04 客户直修（治理写卡客户主权）：appointment-write 确认卡**永不进入判断器**——
    // 无论「替我审批」(approval 组) 开关状态、判断事实是否齐全/可核对，一律原卡呈现客户本人；
    // 判断器对这类卡既不代批、也不得拒绝（「与现有角色卡声明冲突」类直接拒绝不会再发生）。
    // 原则：权限/边界类治理写卡 = 客户主权，与 decision 卡「应用卡不代选」同向。
    if (isGovernanceWriteCardKind(cardKind)) return undefined;
    // decision 卡（2026-10-26）：只做**确定性**默认推荐（「替我决策」开启时），绝不调用模型做选择题。
    // 未代选（开关关闭/结果行异常）⇒ 原卡交客户手动选择；不进入模型 judge，也不产生 judge 退回。
    if (cardKind === DECISION_CARD_KIND) return undefined;
    const group = governanceCardGroup(cardKind);
    if (group === undefined) return undefined; // 无 cardKind/未知 kind 的旧卡永不判断
    if (opts.judge?.isGroupEnabled(group) !== true) return undefined;
    const fn = entry.ctx.governanceJudge ?? opts.judge?.fn;
    if (fn === undefined) return undefined;
    if (entry.ctx.governanceModel !== "trio") return undefined; // single/su：写盘族与 decision 都不代批
    const projectRoot = entry.ctx.projectRoot;
    const runtime = entry.ctx.runtime ?? entry.metadata?.runtime;
    if (typeof projectRoot !== "string" || projectRoot === "" || runtime === undefined) return undefined;
    const flowId =
      typeof judgeContext.flowId === "string" && judgeContext.flowId !== ""
        ? judgeContext.flowId
        : entry.metadata?.flowId ?? entry.request.flowId;
    if (typeof flowId !== "string" || flowId === "") return undefined; // judged card 必须可入账
    if (entry.signals.some((signal) => signal.aborted)) return undefined;
    const request: GovernanceJudgeRequest = {
      group,
      cardKind,
      roleId: entry.payload.roleId,
      projectRoot,
      runtime,
      governanceModel: "trio",
      flowId,
      card: entry.request,
      facts: judgeContext.facts,
      at: new Date().toISOString(),
    };
    const stepId = judgeContext.stepId ?? entry.metadata?.stepId ?? entry.request.stepId;
    if (typeof stepId === "string" && stepId !== "") request.stepId = stepId;
    const toolCallId = judgeContext.toolCallId ?? entry.metadata?.toolCallId;
    if (typeof toolCallId === "string" && toolCallId !== "") request.toolCallId = toolCallId;
    const turnId = judgeContext.turnId ?? entry.metadata?.turnId;
    if (typeof turnId === "string" && turnId !== "") request.turnId = turnId;
    if (typeof entry.ctx.turnText === "string" && entry.ctx.turnText !== "") request.turnText = entry.ctx.turnText;
    // 2026-10-30（§5A）：请求显式 intentId 优先（judgeContext 由编排解析；metadata 兜底旧调用）。
    const explicitIntentId = judgeContext.intentId ?? entry.metadata?.intentId;
    if (typeof explicitIntentId === "string" && explicitIntentId.trim() !== "") request.intentId = explicitIntentId.trim();
    if (judgeContext.intentIdSource !== undefined) request.intentIdSource = judgeContext.intentIdSource;
    else if (typeof explicitIntentId === "string" && explicitIntentId.trim() !== "") request.intentIdSource = "request";
    if (judgeContext.intentResolutionError !== undefined) request.intentResolutionError = judgeContext.intentResolutionError;
    if (judgeContext.paths !== undefined) request.paths = judgeContext.paths;
    if (judgeContext.pathProbes !== undefined) request.pathProbes = judgeContext.pathProbes;
    if (judgeContext.allowedPathRoots !== undefined) request.allowedPathRoots = judgeContext.allowedPathRoots;
    if (judgeContext.forbiddenPaths !== undefined) request.forbiddenPaths = judgeContext.forbiddenPaths;
    if (judgeContext.artifacts !== undefined) request.artifacts = judgeContext.artifacts;
    if (judgeContext.recommendedRoleIds !== undefined) request.recommendedRoleIds = judgeContext.recommendedRoleIds;
    // W-4（2026-11-04 下载申请）：仅下载卡把请求级 `download` 事实原样并入判断请求；
    // 其他卡种不携带（即使 judgeContext 被意外注入该字段）。
    if (cardKind === "download" && judgeContext.download !== undefined) request.download = judgeContext.download;
    return { fn, request, group, cardKind, timeoutMs: judgeTimeoutMs };
  };

  /** 构造一次 fail-closed 的 manual 结果（渠道/超时/防御映射用；不伪造 approve）。 */
  const manualOutcome = (plan: JudgePlan, reasonCode: string, reason?: string): GovernanceJudgeOutcome => ({
    verdict: "manual",
    group: plan.group,
    cardKind: plan.cardKind,
    reasonCode,
    engine: plan.request.runtime,
    ...(reason !== undefined ? { reason } : {}),
  });

  /**
   * 判断裁决枚举的**防御读取**：编排契约扩为 `approve | deny | manual`；本模块按值读取，
   * 既不依赖 `src/model` 的编译期枚举是否先落盘，也绝不把未知值当 approve。
   */
  const judgeVerdictOf = (outcome: { verdict?: unknown }): "approve" | "deny" | "manual" | undefined => {
    const verdict = outcome.verdict;
    return verdict === "approve" || verdict === "deny" || verdict === "manual" ? verdict : undefined;
  };

  /** 判断结论的 `value` 必须与卡片形状/选项一致（防注入的防御复核；driver 已规范化）。 */
  const approvedValue = (
    request: CustomerInputRequest,
    outcome: GovernanceJudgeOutcome,
  ): { selected?: string[]; confirmed?: true } | undefined => {
    if (request.kind === "confirm") {
      return outcome.value?.confirmed === true ? { confirmed: true } : undefined;
    }
    const raw = outcome.value?.selected;
    if (!Array.isArray(raw) || raw.length === 0 || raw.some((item) => typeof item !== "string")) return undefined;
    const selected = [...new Set(raw)];
    if (selected.length !== raw.length) return undefined;
    const offered = new Set(request.options.map((option) => option.id));
    if (selected.some((item) => !offered.has(item))) return undefined;
    if (request.multiple !== true && selected.length !== 1) return undefined;
    return { selected };
  };

  /**
   * 判断回落的人话提示（**仅 switch-off 例外**使用：判断期间客户关闭开关，客户已选择手动 → 原卡 + 本提示）。
   * 其余 manual/deny 自动退回重做；「无法核对」类 manual 与同指纹重复自动拒绝走 `judgeEscalationNotice`
   * 升级客户（2026-11-04 客户直修），不经过本函数。
   */
  const judgeManualNotice = (group: GovernanceJudgeGroup, reasonCode: string, reason?: string): string => {
    const label = group === "approval" ? mainT("ui.judge.mode.approval") : mainT("ui.judge.mode.decision");
    if (reasonCode === "row-failed") return mainT("main.customerInput.rowFailedManual");
    return mainT("main.customerInput.judgeNotDelegated", { label, reason: stripTrailingSentencePunct(judgeHumanReason(reasonCode, reason)) });
  };

  /**
   * 「无法核对 / 重复拒绝」升级客户卡的人话说明（2026-11-04 客户直修）。
   * 复用既有 `main.customerInput.judgeNotDelegated` 模板：
   *   「自动代理未代批（{label}）：{reason}；已转你手动确认。」
   * reason 用 `judgeReworkHumanReason(outcome)`（驱动给出的具体原因会以括注保留，
   * 如「规范物证缺失（规范物证缺失：docs/proposals/…（判断无法核对）…）」）。
   * 说明：共享文案目录 `src/common/shared/i18n/**` 属项目管理角色，本轮不新增 key；
   * 卡面已说明「无法核对的原因 + 已转你手动确认」。如需逐字「自动判断无法核对」措辞，
   * 另立项目管理补键任务（见变更记录披露）。
   */
  const judgeEscalationNotice = (group: GovernanceJudgeGroup, outcome: GovernanceJudgeOutcome): string => {
    const label = group === "approval" ? mainT("ui.judge.mode.approval") : mainT("ui.judge.mode.decision");
    return mainT("main.customerInput.judgeNotDelegated", {
      label,
      reason: stripTrailingSentencePunct(judgeReworkHumanReason(outcome)),
    });
  };

  /**
   * 升级客户（2026-11-04 客户直修）：**不自动拒绝**——原卡原样呈现 + `judgeNotice` 说明原因。
   * 治理写卡（appointment-write）永不进入判断器（`planJudge` 排除、`settleJudgeOutcome` 顶部防御），
   * 因此本函数对其不可达——「与现有角色卡声明冲突」类拒绝不会再发生。
   * 不写客户决定、不发 approve 结果行、不触发验收返工路由（没有发生拒绝）。
   * trigger = "unverifiable"（无法核对类 manual）/ "duplicate-rejection"（同指纹重复）。
   * 调用方负责状态守卫（settle 路径要求 state==="judging"；ledger 预检路径为 queued）。
   */
  const escalateJudgeOutcomeToCustomer = (
    entry: ChannelEntry,
    group: GovernanceJudgeGroup,
    outcome: GovernanceJudgeOutcome,
    trigger: "unverifiable" | "duplicate-rejection",
  ): void => {
    judging.delete(entry.payload.id);
    entry.payload.judgeNotice = judgeEscalationNotice(group, outcome);
    diagnostic.record("governance-judge.escalated", {
      requestId: entry.payload.id,
      reasonCode: outcome.reasonCode,
      decision: trigger === "unverifiable" ? "present-to-customer-unverifiable" : "present-to-customer-duplicate",
      outcome: "manual",
      eventKind: trigger,
    });
    presentNow(entry);
  };

  /**
   * 结算判断结果：
   *  · `approve`：先发结果行，再走同一 `settleEntry`（answered，judge 审计）；
   *  · `deny`（仅 approval 组；2026-10-19 客户要求「判断 agent 拒绝 + 退回发起角色重做」）：**不呈现客户卡、
   *    不发 approve 结果行、不写客户决定账本**，直接以 `declined` 结算（带具体原因）——发起角色的
   *    `request_confirmation` 会收到该原因并重做；decision 组/开关关闭/分组不符防御性回落 manual；
   *    同卡指纹的自动拒绝只发生一次，重复 ⇒ 原卡升级客户（2026-11-04 客户直修，仅去重）。
   *  · `manual`（判断已运行但未能代批）：按客户 2026-10-19 总原则同样**自动退回重做**
   *    （declined + 可操作原因，不呈现客户卡）；例外：`switch-off`（判断期间关闭开关）呈现原卡+提示；
   *    **「无法核对」类机械码（`isUnverifiableRejectionCode`）不自动拒绝**，原卡 + 说明转客户确认
   *    （2026-11-04 客户直修；judge 的 fail-closed 方向不变，绝不新增自动放行）；同卡指纹重复 ⇒ 升级客户；
   *    `aborted` 走既有取消/丢弃语义。
   */
  const settleJudgeOutcome = (entry: ChannelEntry, plan: JudgePlan, rawOutcome: GovernanceJudgeOutcome): void => {
    // 2026-11-04 客户直修（治理写卡客户主权）：防御——appointment-write 永不判断。
    // planJudge 已排除，不会生成 JudgePlan；若未来出现第二入口误入，一律丢弃判断结果、
    // 原卡呈现客户，绝不代批/代拒。
    if (isGovernanceWriteCardKind(plan.cardKind)) {
      if (entry.state === "judging") {
        judging.delete(entry.payload.id);
        presentNow(entry);
      }
      return;
    }

    const { group, cardKind } = plan;
    let outcome = rawOutcome;
    if (judgeVerdictOf(outcome) === "deny") {
      // 仅 approval 组允许 deny（编排对 decision 组会回落 manual；这里再防御一次）。
      if (group !== "approval") {
        outcome = manualOutcome(plan, "deny-not-approval", mainT("main.customerInput.rejectNotApproval"));
      } else if (opts.judge?.isGroupEnabled(group) !== true) {
        // 判断期间开关被关/重载复位：拒绝结论也不再具有代批授权 ⇒ 回落客户手动。
        diagnostic.record("governance-judge.switch.off", { requestId: entry.payload.id, group });
        outcome = manualOutcome(plan, "switch-off", mainT("main.customerInput.switchOff"));
      } else if (outcome.group !== group || outcome.cardKind !== cardKind) {
        outcome = manualOutcome(plan, "group-mismatch", mainT("main.customerInput.groupMismatch"));
      } else {
        if (entry.state !== "judging") return; // 已中止/已结算：丢弃结果
        // 2026-11-04 客户直修：同卡指纹的自动拒绝只发生一次；重复 ⇒ 原卡升级客户（不重复轰炸）。
        // deny 分支不做「无法核对」升级：approval 写卡的既有退回重做语义保持不变。
        if (!markAutoRejected(entry)) {
          escalateJudgeOutcomeToCustomer(entry, group, outcome, "duplicate-rejection");
          return;
        }
        const reason = judgeReworkReasonText(group, outcome, "deny");
        diagnostic.record("governance-judge.deny", {
          requestId: entry.payload.id,
          group,
          cardKind,
          reasonCode: outcome.reasonCode,
          reason: outcome.reason,
          // 审计保留「模型裁决=deny」事实；最终处置=自动拒绝退回（不是客户操作）。
          decision: "deny",
          outcome: "deny",
        });
        settleEntry(
          entry,
          { outcome: "declined", operatorId: `judge:${outcome.engine}`, reason },
          "judging",
        );
        // 2026-10-23 验收返工路由：deny 的验收卡在结算后隔离回调（不改变 decline/三态语义）。
        notifyAutoRework(entry, plan, outcome, "judge-deny", reason);
        return;
      }
    }
    if (outcome.verdict === "approve") {
      // §4.3-1：判断期间开关可能被关/重载复位 ⇒ 再查一次（主进程权威）。
      if (opts.judge?.isGroupEnabled(group) !== true) {
        diagnostic.record("governance-judge.switch.off", { requestId: entry.payload.id, group });
        outcome = manualOutcome(plan, "switch-off", mainT("main.customerInput.switchOff"));
      } else if (outcome.group !== group || outcome.cardKind !== cardKind) {
        outcome = manualOutcome(plan, "group-mismatch", mainT("main.customerInput.groupMismatch"));
      } else {
        const value = approvedValue(entry.request, outcome);
        if (value === undefined) {
          outcome = manualOutcome(plan, "not-recommended", mainT("main.customerInput.notRecommended"));
        } else {
          const payload: OperatorJudgeResultPayload = {
            version: 1,
            id: `gj-${++judgeResultSeq}`,
            requestId: entry.payload.id,
            anchorKey: entry.payload.anchorKey,
            toolCallId: entry.payload.toolCallId ?? "",
            roleId: entry.payload.roleId,
            at: new Date().toISOString(),
            ...(entry.request.title.trim() !== "" ? { requestTitle: entry.request.title } : {}),
            group,
            cardKind,
            ...(plan.request.flowId !== "" ? { flowId: plan.request.flowId } : {}),
            engine: outcome.engine,
            ...(entry.payload.projectRoot !== undefined ? { projectRoot: entry.payload.projectRoot } : {}),
            ...(entry.payload.runtime !== undefined ? { runtime: entry.payload.runtime } : {}),
            reasonCode: outcome.reasonCode,
            ...(outcome.model !== undefined ? { model: outcome.model } : {}),
            ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
            ...(value.selected !== undefined ? { selected: value.selected } : {}),
            ...(value.confirmed === true ? { confirmed: true as const } : {}),
            ...(outcome.paths !== undefined ? { paths: outcome.paths } : {}),
            ...(outcome.pathDecisions !== undefined ? { pathDecisions: outcome.pathDecisions } : {}),
            ...(outcome.evidence !== undefined ? { evidence: outcome.evidence } : {}),
            ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
            ...(outcome.readCalls !== undefined ? { readCalls: outcome.readCalls } : {}),
            ...(outcome.readBytes !== undefined ? { readBytes: outcome.readBytes } : {}),
          };
          let rowFailed = false;
          try {
            if (opts.emitJudgeResult === undefined) throw new Error(mainT("main.customerInput.emitChannelMissing"));
            opts.emitJudgeResult(payload);
          } catch (error) {
            // 结果行是 approve 的条件：投达失败 ⇒ manual（row-failed）⇒ 自动退回重做（不呈现客户卡）。
            diagnostic.error("governance-judge.row.failed", error, {
              requestId: entry.payload.id,
              toolCallId: entry.payload.toolCallId,
              cardKind,
            });
            rowFailed = true;
          }
          if (!rowFailed) {
            const audit: GovernanceJudgeAudit = {
              group,
              cardKind,
              engine: outcome.engine,
              ...(outcome.model !== undefined ? { model: outcome.model } : {}),
              reasonCode: outcome.reasonCode,
              ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
              ...(outcome.evidence !== undefined ? { evidence: outcome.evidence } : {}),
              ...(value.selected !== undefined ? { selected: value.selected } : {}),
              ...(value.confirmed === true ? { confirmed: true as const } : {}),
              ...(outcome.paths !== undefined ? { paths: outcome.paths } : {}),
              ...(outcome.pathDecisions !== undefined ? { pathDecisions: outcome.pathDecisions } : {}),
              ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
              ...(outcome.readCalls !== undefined ? { readCalls: outcome.readCalls } : {}),
              ...(outcome.readBytes !== undefined ? { readBytes: outcome.readBytes } : {}),
            };
            diagnostic.record("governance-judge.approve", {
              requestId: entry.payload.id,
              group,
              cardKind,
              engine: outcome.engine,
              reasonCode: outcome.reasonCode,
              selectedCount: value.selected?.length ?? 0,
              pathCount: outcome.paths?.length ?? 0,
              durationMs: outcome.durationMs,
              readCalls: outcome.readCalls,
              readBytes: outcome.readBytes,
            });
            settleEntry(
              entry,
              {
                outcome: "answered",
                value,
                operatorId: `judge:${outcome.engine}`,
                judge: audit,
              },
              "judging",
            );
            return;
          }
          outcome = manualOutcome(plan, "row-failed", mainT("main.customerInput.rowFailed"));
        }
      }
    }
    // manual（判断已运行但未能代批）：按客户 2026-10-19 总原则「我勾选了替我决策就不用我来管了」——
    // **不再呈现客户卡**；以 declined + 可操作原因退回发起角色重做。不写客户决定账本、不发结果行。
    // 例外：
    //  · switch-off（判断期间客户关闭对应开关）⇒ 客户已选择手动，呈现原卡 + judgeNotice；
    //  · 无法核对类机械码（2026-11-04 客户直修）⇒ 原卡 + 原因说明升级客户（不自动拒绝、绝不自动放行）；
    //  · 同卡指纹此前已自动拒绝过（同直修）⇒ 原卡升级客户，不重复轰炸；
    //  · aborted（本轮已中止）⇒ 既有取消/丢弃语义（不结算、不呈现）。
    if (entry.state !== "judging") return; // 已中止/已结算：丢弃结果
    if (outcome.reasonCode === "aborted") return; // 取消监听会按既有语义结算 unavailable
    // 2026-11-04 下载申请（方案 §4.2/AC-6/AC-28）：下载卡的**任何 manual** 都不自动拒绝/自动退回，
    // 原卡 + judgeNotice 转客户确认。放在 switch-off / 无法核对 / 指纹去重之前，覆盖
    // timeout/parse-failed/row-failed/switch-off/ledger-unavailable/download-facts-missing 等全部 manual。
    // deny 分支在上面已按 approval 组既有语义处理（本分支只接 manual）；aborted 已早退。
    if (plan.cardKind === "download") {
      escalateJudgeOutcomeToCustomer(entry, plan.group, outcome, "unverifiable");
      return;
    }
    if (outcome.reasonCode === "switch-off") {
      diagnostic.record("governance-judge.manual", {
        requestId: entry.payload.id,
        group,
        cardKind,
        reasonCode: outcome.reasonCode,
      });
      judging.delete(entry.payload.id);
      entry.payload.judgeNotice = judgeManualNotice(group, outcome.reasonCode, outcome.reason);
      presentNow(entry);
      return;
    }
    // 2026-11-04 客户直修：无法核对类 manual 不得自动拒绝——原卡转客户确认（附原因）。
    if (isUnverifiableRejectionCode(outcome.reasonCode)) {
      escalateJudgeOutcomeToCustomer(entry, plan.group, outcome, "unverifiable");
      return;
    }
    // 同一卡指纹的自动拒绝只发生一次：重复 ⇒ 升级客户，不再重复轰炸。
    if (!markAutoRejected(entry)) {
      escalateJudgeOutcomeToCustomer(entry, plan.group, outcome, "duplicate-rejection");
      return;
    }
    const reworkReason = judgeReworkReasonText(group, outcome, "manual");
    diagnostic.record("governance-judge.manual-as-rework", {
      requestId: entry.payload.id,
      group,
      cardKind,
      reasonCode: outcome.reasonCode,
      reason: outcome.reason,
      // 审计保留「模型裁决=manual」事实；最终处置=自动退回重做（不是客户操作）。
      decision: "manual-as-rework",
      outcome: "manual",
    });
    settleEntry(
      entry,
      { outcome: "declined", operatorId: `judge:${outcome.engine}`, reason: reworkReason },
      "judging",
    );
    // 2026-10-23 验收返工路由（allowlist）：verdict deny 的防御回落（decision 组 `deny-not-approval`）
    // 与 manual 的 timeout/parse-failed/not-recommended/group-mismatch 触发；switch-off/aborted/
    // unavailable/row-failed/ledger-unavailable 不触发（只记诊断/既有系统行，不路由）。
    const rawDeny = judgeVerdictOf(rawOutcome) === "deny";
    const manualAutoRework =
      outcome.reasonCode === "timeout" ||
      outcome.reasonCode === "parse-failed" ||
      outcome.reasonCode === "not-recommended" ||
      outcome.reasonCode === "group-mismatch";
    if (rawDeny && (outcome.reasonCode === "deny-not-approval" || outcome.reasonCode === "group-mismatch")) {
      // acceptance 属 decision 组：deny 被防御性回落 manual；原始裁决仍是 deny ⇒ 按 judge-deny 路由。
      notifyAutoRework(entry, plan, outcome, "judge-deny", reworkReason);
    } else if (!rawDeny && manualAutoRework) {
      notifyAutoRework(entry, plan, outcome, "judge-manual", reworkReason);
    }
  };

  /** 启动一次判断（异步、不阻塞队列）；迟到/中止后的结果看到 `state !== "judging"` 一律丢弃。 */
  const runJudge = async (entry: ChannelEntry, plan: JudgePlan): Promise<void> => {
    // 通道层防御超时：`AbortSignal.timeout`（不引入 self 计时器——卡片等待语义不变）。
    const timeoutSignal = AbortSignal.timeout(plan.timeoutMs);
    const combined = AbortSignal.any([timeoutSignal, ...entry.signals]);
    const aborted = Symbol("judge-aborted");
    const abortPromise = new Promise<typeof aborted>((resolve) => {
      if (combined.aborted) {
        resolve(aborted);
        return;
      }
      combined.addEventListener("abort", () => resolve(aborted), { once: true });
    });
    let outcome: GovernanceJudgeOutcome | typeof aborted;
    try {
      outcome = await Promise.race([plan.fn(plan.request, combined), abortPromise]);
    } catch (error) {
      // 编排 driver 契约上不抛错；这里是防御映射（仍 fail-closed，绝不默认放行）。
      const touched = entry.signals.some((signal) => signal.aborted);
      outcome = manualOutcome(
        plan,
        touched ? "aborted" : "unavailable",
        touched ? mainT("main.customerInput.turnAborted") : mainT("main.customerInput.judgeException", { detail: reasonOf(error) }),
      );
    }
    if (entry.state !== "judging") return; // 中止/关窗/已结算：不写任何东西
    if (outcome === aborted) {
      const timedOut = timeoutSignal.aborted && !entry.signals.some((signal) => signal.aborted);
      outcome = manualOutcome(
        plan,
        timedOut ? "timeout" : "aborted",
        timedOut ? mainT("main.customerInput.judgeTimeout", { ms: formatJudgeTimeoutMs(plan.timeoutMs) }) : mainT("main.customerInput.turnAborted"),
      );
    } else if (
      outcome === null ||
      typeof outcome !== "object" ||
      judgeVerdictOf(outcome as { verdict?: unknown }) === undefined
    ) {
      // 注入的 fn 未按契约交回裁决（未知 verdict 含旧值）：防御性 fail-closed，绝不默认放行。
      outcome = manualOutcome(plan, "parse-failed", mainT("main.customerInput.parseFailed"));
    }
    settleJudgeOutcome(entry, plan, outcome);
  };

  /**
   * decision 卡「替我决策」**确定性默认推荐**（2026-10-26 客户要求）：
   *
   * 条件全部满足才代选：① 发卡前校验已定格推荐项；② 「替我决策」开关开启（主进程权威
   * `isGroupEnabled("decision")`）；③ 会话信号未中止；④ 可用运行时可作审计引擎；
   * ⑤ 判断结果行能如实投达（`emitJudgeResult` 是代批的可见性条件）。
   *
   * 结算为 `answered{selected:[推荐项]}` + `operatorId:"judge:<engine>"` + `judge` 审计
   * （`group:"decision"`）——**judge 代批，不是客户本人**；编排据此写
   * `customer.decision{decisionKind:"material-choice", selectedOptions:[推荐项]}`（审计，门禁不读）。
   * 不调用模型、不呈现客户卡、不推导治理下一步（decision 卡无 proposal/appointment/acceptance 语义）。
   *
   * 任一条件不满足/异常（开关关闭、无推荐项、结果行通道缺失/投达失败、运行时缺失等）⇒ 返回 false，
   * 由既有客户卡路径（`presentNow`）交客户决定——**绝不擅自代选**，也不把异常伪装成 approve。
   *
   * **例外（2026-11-04 客户直修）**：应用自有的 run-change 三模式卡与版本决策卡必须由客户本人选择，
   * 即使本开关开启也**永不**在这里代选（判据见 `isApplicationDecisionReservedForCustomer`）。
   */
  const isChiefBusinessCard = (entry: ChannelEntry): boolean => {
    const kind = cardKindOf(entry);
    return entry.appCard === undefined && !isApplicationDecisionReservedForCustomer(entry.request)
      && (kind === "appointment" || kind === "acceptance" || kind === "decision" || kind === "proposal");
  };
  const delegationState = () => opts.delegation?.get() ?? { enabled: false, revision: 0 };
  const chiefWaiting = (entry: ChannelEntry, reason: string): void => {
    if (entry.state === "done") return;
    judging.delete(entry.payload.id);
    entry.chiefAbort?.abort();
    entry.payload.judgeNotice = reason;
    presentNow(entry);
  };
  const tryChiefDecision = (entry: ChannelEntry): boolean => {
    if (!isChiefBusinessCard(entry)) return false;
    const mode = delegationState();
    if (!mode.enabled || entry.ctx.governanceModel !== "trio") return false;
    if (entry.chiefAttempted) {
      entry.payload.judgeNotice = mainT("main.customerInput.chief.noValidDecision");
      return false;
    }
    entry.chiefAttempted = true;
    entry.payload.judgeNotice = mainT("main.customerInput.chief.deciding");
    entry.chiefRevision = mode.revision;
    const controller = new AbortController();
    entry.chiefAbort = controller;
    entry.state = "judging";
    pending.delete(entry.payload.id);
    judging.set(entry.payload.id, entry);
    activeByProject.set(entry.projectKey, entry.payload.id);
    const valid = () => entry.state === "judging" && !controller.signal.aborted
      && !entry.signals.some(signal => signal.aborted) && delegationState().enabled
      && delegationState().revision === mode.revision;
    void (async () => {
      let stage: "materials" | "execution" = "materials";
      let failureReason: string | undefined;
      // 2026-11-09 缺陷修复 B（fail-closed 呈现）：materials/绑定失败（`host.prepare` 抛错、`basis` 缺失/
      // 非法、证据不可用/漂移/绑定不符）**不得**把卡呈现为可重试/可提交——不调用 presenter、不写
      // `request.presented`。以既有 `declined + notPresented + reason` 结算，把真实原因（含 prepare
      // 错误原文与既有可操作指引）交回发起角色/回合；工具回执走既有 `cardNotPresented`
      // （「治理确认卡未发出（未向客户呈现；原因：…）→ 未获任何同意；请补齐后重新调用。不要写盘，
      // 也不要向客户声称其拒绝或同意。」）。不写 operatorId/actionSource，不声称客户拒绝或同意。
      // `host` 缺失与 required-acknowledgment 不属证据准备失败：保持既有「可接管」回退（下方 catch，
      // 既有 decision-service 回归钉住），不在此 fail-closed。
      const failClosedPresentation = (error: unknown): void => {
        // `stage` 不在诊断落盘白名单（src/common/shared/diagnostics.ts `FIELD_NAMES`，本修复不越界改
        // src/）；用既有白名单键 `phase` 一并落盘，保证诊断可区分 materials/execution（B1 AC-13）。
        diagnostic.error("chief-decision.failed", error, { requestId: entry.payload.id, stage: "materials", phase: "materials" });
        if (!valid()) return;
        const detail = reasonOf(error).trim();
        settleEntry(entry, {
          outcome: "declined",
          reason: detail === ""
            ? mainT("main.customerInput.chief.contextUnavailable")
            : `${mainT("main.customerInput.chief.contextUnavailable")}（${detail}）`,
          notPresented: true,
        }, "judging");
      };
      try {
        const host = entry.ctx.chiefDecision;
        if (host === undefined) throw new Error("幕僚决策上下文不可用");
        if (entry.request.acknowledgments?.some(item => item.required)) throw new Error("本请求需专门确认勾选，幕僚不能代作客户确认");
        let basis: ChiefDecisionBasis;
        try {
          basis = await host.prepare(entry.request, entry.metadata);
          if (!valid()) return;
          if (!/^[a-f0-9]{64}$/i.test(basis.baseDigest) || basis.evidenceRefs.length === 0 || !basis.context.trim()) {
            throw new Error("当前目标、基线或决策物证缺失");
          }
        } catch (error) {
          failClosedPresentation(error);
          return;
        }
        const kind = cardKindOf(entry);
        if (kind !== "appointment" && kind !== "acceptance" && kind !== "decision" && kind !== "proposal") return;
        const options = entry.request.kind === "choice" ? entry.request.options : [
          { id: "confirm", label: "同意" }, { id: "reject", label: "拒绝" },
        ];
        const request: ChiefPendingDecisionRequest = {
          requestId: entry.payload.id, baseDigest: basis.baseDigest, delegationRevision: mode.revision,
          originRoleId: entry.payload.roleId, cardKind: kind,
          ...(entry.request.flowId !== undefined ? { flowId: entry.request.flowId } : {}),
          ...(entry.metadata?.taskId !== undefined ? { taskId: entry.metadata.taskId } : {}),
          question: entry.request.title, options: structuredClone(options), evidenceRefs: structuredClone(basis.evidenceRefs),
        };
        const context: ChiefDecisionExecutionContext = {
          roleId: "chief", executionId: `chief-${entry.payload.id}-${mode.revision}`, mode: "bounded-decision",
          request, productionWriteAuthority: false, tools: ["decide_pending_request"],
          limits: { maxTurns: 1, maxAttempts: 1, timeoutMs: 120_000 },
        };
        const decide: DecidePendingRequestFn = async (input, signal) => {
          const fail = (errorCode: string, message: string) => { failureReason = message; return { ok: false as const, requestId: request.requestId, status: "stale" as const, errorCode, message }; };
          if (!valid() || signal?.aborted || input.requestId !== request.requestId
            || input.baseDigest !== request.baseDigest || input.delegationRevision !== mode.revision) return fail("chief-stale", "委托模式、版本或未决请求已改变");
          if (!input.reason.trim()) return fail("chief-reason-missing", "需要选择理由");
          const disposition = input.disposition;
          if (input.disposition !== "select" && input.disposition !== "reject" && input.disposition !== "revise") return fail("chief-choice-invalid", "非法决定");
          const selected = input.disposition === "select" ? [...new Set(input.selected)] : undefined;
          if (selected !== undefined && (selected.length === 0 || selected.some(id => !options.some(option => option.id === id))
            || (entry.request.kind === "choice" && entry.request.multiple !== true && selected.length !== 1)
            || (entry.request.kind === "confirm" && (selected.length !== 1 || !["confirm", "reject"].includes(selected[0]!))))) return fail("chief-choice-invalid", "选择不在本次合法选项内");
          if (!(await basis.isCurrent()) || !valid() || signal?.aborted) return fail("chief-base-stale", "基线或物证已改变；需重新发起请求");
          // Single synchronous CAS after every await. No external callbacks before settlement.
          const actionSource: Extract<DirectActionSource, { kind: "chief-delegated" }> = {
            kind: "chief-delegated", actorRoleId: "chief", originRoleId: request.originRoleId,
            requestId: request.requestId, baseDigest: request.baseDigest, delegationRevision: mode.revision,
            disposition, ...(selected !== undefined ? { selected } : {}), reason: input.reason, at: new Date().toISOString(),
          };
          const declined = input.disposition === "reject" || input.disposition === "revise" || (entry.request.kind === "confirm" && selected?.[0] === "reject");
          settleEntry(entry, declined
            ? { outcome: "declined", operatorId: "chief", actionSource, reason: disposition === "revise" ? `${input.reason} ${mainT("main.customerInput.chief.revisionRequested")}` : input.reason }
            : { outcome: "answered", operatorId: "chief", actionSource,
                value: entry.request.kind === "confirm" ? { confirmed: true } : { selected } }, "judging");
          try {
            opts.emitJudgeResult?.({ version: 1, id: `chief-${++judgeResultSeq}`, requestId: request.requestId,
              anchorKey: entry.payload.anchorKey, toolCallId: entry.payload.toolCallId ?? "", roleId: entry.payload.roleId,
              projectRoot: entry.payload.projectRoot, runtime: entry.payload.runtime, at: actionSource.at,
              requestTitle: entry.request.title, group: "decision", cardKind: kind, engine: entry.ctx.runtime ?? "demo",
              reasonCode: "chief-delegated", actionSource, selected, reason: input.reason });
          } catch (error) { diagnostic.error("chief-decision.notice.failed", error, { requestId: request.requestId }); }
          return { ok: true, requestId: request.requestId, status: "settled", source: actionSource };
        };
        stage = "execution";
        await host.execute(context, basis.context, decide, controller.signal);
        if (valid()) chiefWaiting(entry, failureReason === undefined ? mainT("main.customerInput.chief.noValidDecision") : `${failureReason} ${mainT("main.customerInput.chief.noValidDecision")}`);
      } catch (error) {
        // `stage` 不在诊断落盘白名单（src/common/shared/diagnostics.ts `FIELD_NAMES`，本修复不越界改 src/）；
        // 用既有白名单键 `phase` 一并落盘，保证诊断可区分 materials/execution（B1 AC-13）。
        diagnostic.error("chief-decision.failed", error, { requestId: entry.payload.id, stage, phase: stage });
        if (valid()) chiefWaiting(entry, stage === "materials"
          ? mainT("main.customerInput.chief.contextUnavailable")
          : mainT("main.customerInput.chief.noValidDecision"));
      }
    })();
    return true;
  };
  const unsubscribeDelegation = opts.delegation?.subscribe(() => {
    for (const entry of [...judging.values()]) {
      if (entry.chiefRevision === undefined) continue;
      if (!delegationState().enabled || delegationState().revision !== entry.chiefRevision) {
        chiefWaiting(entry, mainT("main.customerInput.chief.modeChanged"));
      }
    }
    if (delegationState().enabled) {
      for (const entry of [...pending.values()]) if (isChiefBusinessCard(entry)) tryChiefDecision(entry);
    }
  });

  /** 选项 label（可见结果行使用；缺失回退 optionId，不伪造）。 */
  const optionLabel = (options: readonly CustomerInputOption[], optionId: string | undefined): string => {
    if (optionId === undefined) return "";
    return options.find((option) => option.id === optionId)?.label ?? optionId;
  };

  /**
   * decision 指令消费者（C1，2026-11-03；规则/once 语义由 B1 `applyDecisionDirective` 冻结）：
   *  - 只在 `cardKind==="decision"` 且注入 directive 消费者时进入，位于 `tryAutoSelectDecision` 之前；
   *  - 冲突/0/多匹配：不消费任何一条，**绕过默认推荐**，直接呈现客户卡，并投一条既有 delivery-note 说明；
   *  - selected/rejected：`once` 已由 B1 在**可见结果行之后** durable 消费；结算 answered/declined，
   *    `operatorId:"directive:<id>"` + A1 `directive:{id,action}`；
   *  - 无指令 / 账本坏行 / 可见行投达失败 / once durable 失败（B1 返回 undefined）⇒ 回落既有路径；
   *  - 不写 `request.presented`（W-6）；不产生 judge 审计、不调用模型。
   */
  const tryApplyDirectiveDecision = (entry: ChannelEntry): boolean => {
    if (entry.directiveEvaluated === true || entry.state !== "queued") return false;
    if (cardKindOf(entry) !== DECISION_CARD_KIND) return false;
    // 2026-11-04 trunk-amendment D1（PM 复审 F9）：VCA/修正案逐项/最终卡与 run-change/版本决策同为
    // 客户主权卡——`@决策` 指令**不得代选/代拒**（不消费指令、不写 directive:<id>、不结算）。
    // 这是本轮补上的排除点；appointment-write/stable-write 不进入本函数。
    if (isApplicationDecisionReservedForCustomer(entry.request)) return false;
    if (opts.directive === undefined) return false;
    const request = entry.request;
    if (request.kind !== "choice") return false;
    const projectRoot = entry.ctx.projectRoot;
    if (typeof projectRoot !== "string" || projectRoot === "") return false;
    if (entry.signals.some((signal) => signal.aborted)) return false;
    const flowId = entry.decisionCard?.flowId ?? entry.metadata?.flowId ?? request.flowId;
    const card: DecisionCardFacts = {
      cardKind: "decision",
      requestId: entry.payload.id,
      ...(typeof flowId === "string" && flowId !== "" ? { flowId } : {}),
      options: request.options.map((option) => ({
        id: option.id,
        label: option.label,
        ...(option.recommended === true ? { recommended: true as const } : {}),
      })),
    };
    const runtime = entry.ctx.runtime ?? entry.metadata?.runtime;
    const noticeBase = {
      roleId: entry.payload.roleId,
      projectRoot,
      ...(runtime !== undefined ? { runtime } : {}),
    };
    const scopeText = (): string =>
      card.flowId !== undefined
        ? mainT("ui.directive.dialog.scope.flow", { flowId: card.flowId })
        : mainT("ui.directive.dialog.scope.project");
    entry.directiveEvaluated = true;
    entry.state = "directing";
    activeByProject.set(entry.projectKey, entry.payload.id);
    directingHolds.set(entry.payload.id, entry);
    const directiveLog = createDiagnosticLogger({
      component: "desktop.directive-decision",
      projectRoot,
      roleId: entry.payload.roleId,
    });
    void (async () => {
      let result: DecisionApplyResult | undefined;
      try {
        result = await opts.directive!.applyDecisionDirective(projectRoot, card, {
          emitResult: async (visible) => {
            const summary =
              visible.kind === "selected"
                ? mainT("main.directive.applied.decisionRecommended", {
                    id: visible.directiveId,
                    option: optionLabel(request.options, visible.optionId),
                  })
                : mainT("main.directive.applied.decisionDeclined", {
                    id: visible.directiveId,
                    scope: scopeText(),
                  });
            // 抛错必须冒泡给 B1：可见行是 durable 消费的条件（B1 冻结语义）。
            opts.directive!.emitResult({ ...noticeBase, summary });
          },
        });
      } catch (error) {
        directiveLog.error("directive.decision.apply.failed", error, { requestId: entry.payload.id });
        result = undefined;
      }
      if (entry.state !== "directing") return; // 中止/关窗/已结算：丢弃结果（不应用）
      directingHolds.delete(entry.payload.id);
      if (result === undefined) {
        // 无指令 / 账本坏行 / 可见行投达失败 / once durable 失败 ⇒ 回落。
        // 有**适用**指令却未应用（可见行/durable 失败）⇒ 直接呈现客户卡（不借默认推荐代选）；
        // 无适用指令（含坏账本按无指令）⇒ 走既有路径（默认推荐仍可用，AC-15 不变）。
        const hadApplicable = (() => {
          try {
            const facts = opts.directive!.decisionFacts(projectRoot);
            if (facts === undefined || facts.ledgerErrors > 0) return false;
            return facts.active.some(
              (fact) =>
                fact.target === "decision" &&
                (fact.scope.flowId === undefined ||
                  (card.flowId !== undefined && fact.scope.flowId === card.flowId)),
            );
          } catch {
            return false;
          }
        })();
        entry.state = "queued";
        if (activeByProject.get(entry.projectKey) === entry.payload.id) activeByProject.delete(entry.projectKey);
        if (hadApplicable) presentNow(entry);
        else presentEntryNow(entry);
        return;
      }
      if (result.kind === "conflict" || result.kind === "no-match") {
        // 不消费任何一条；绕过 tryAutoSelectDecision，直接呈现客户卡 + 一条既有系统行说明。
        try {
          const summary =
            result.kind === "conflict"
              ? mainT("main.directive.decision.conflict", { ids: result.ids.join("、") })
              : mainT("main.directive.decision.notMatched", { id: result.ids.join("、") });
          opts.directive!.emitNotice({ ...noticeBase, summary });
        } catch (error) {
          directiveLog.error("directive.decision.notice.failed", error, { requestId: entry.payload.id });
        }
        entry.state = "queued";
        if (activeByProject.get(entry.projectKey) === entry.payload.id) activeByProject.delete(entry.projectKey);
        presentNow(entry);
        return;
      }
      if (result.kind === "selected") {
        settleEntry(
          entry,
          {
            outcome: "answered",
            value: { selected: [result.optionId] },
            operatorId: `directive:${result.id}`,
            directive: { id: result.id, action: result.action },
          },
          "directing",
        );
        return;
      }
      settleEntry(
        entry,
        {
          outcome: "declined",
          operatorId: `directive:${result.id}`,
          reason: mainT("main.directive.applied.decisionDeclined", { id: result.id, scope: scopeText() }),
          directive: { id: result.id, action: "reject" },
        },
        "directing",
      );
    })();
    return true;
  };

  /** 既有呈现路径（判断门 → judging / 直接呈现）；**不分诊**——分诊前闸在 `presentEntry`。 */
  const presentEntryNow = (entry: ChannelEntry): void => {
    if (isChiefBusinessCard(entry)) {
      if (tryChiefDecision(entry)) return;
      presentNow(entry);
      return;
    }

    // 客户指令消费者优先（C1）：命中即不进入默认推荐/客户卡；未命中/冲突/失败按 B1 冻结规则回落。
    if (tryApplyDirectiveDecision(entry)) return;
    // decision 卡先尝试「替我决策」确定性默认；未代选 ⇒ 原卡照旧呈现给客户。

    const plan = planJudge(entry);
    if (plan === undefined) {
      presentNow(entry);
      return;
    }
    // 应用事实不可用（账本不可读/计算失败）：不调用模型——按客户 2026-10-19 总原则自动退回重做
    // （基础设施类原因也要可操作），fail-closed 且绝不伪造 approve；**首次不呈现客户卡**，
    // 2026-11-04 客户直修起同卡指纹重复改为原卡呈现客户（见下方去重）。
    if (entry.metadata?.judgeContext?.unavailableReason !== undefined) {
      const unavailableReason = entry.metadata.judgeContext.unavailableReason;
      // 2026-11-04 下载申请（AC-28 防御）：下载卡收到 `unavailableReason` 时一律原卡转客户确认，
      // 不 auto-rework、不 markAutoRejected、不写客户决定；预授权未被消耗（B1 在 presenter 前不消费）。
      if (plan.cardKind === "download") {
        const noticeOutcome = manualOutcome(plan, "ledger-unavailable", unavailableReason);
        escalateJudgeOutcomeToCustomer(entry, plan.group, noticeOutcome, "unverifiable");
        return;
      }
      // 2026-11-04 客户直修：同一卡指纹的自动拒绝只发生一次；重复 ⇒ 原卡呈现客户。
      // （此时 entry.state 为 queued：escalate 不删 judging、presentNow 会把 queued→active。）
      if (!markAutoRejected(entry)) {
        const noticeOutcome = manualOutcome(plan, "ledger-unavailable", unavailableReason);
        escalateJudgeOutcomeToCustomer(entry, plan.group, noticeOutcome, "duplicate-rejection");
        return;
      }
      const detail = stripTrailingSentencePunct(unavailableReason.trim());
      const label = plan.group === "approval" ? mainT("main.customerInput.autoApprovalLabel") : mainT("main.customerInput.autoDecisionLabel");
      const unavailableHuman = judgeHumanReason("ledger-unavailable");
      const reason =
        detail !== ""
          ? mainT("main.customerInput.ledgerUnavailable", { label, reason: unavailableHuman, detail: `（${detail}）` })
          : mainT("main.customerInput.ledgerUnavailableShort", { label, reason: unavailableHuman });
      diagnostic.record("governance-judge.manual-as-rework", {
        requestId: entry.payload.id,
        group: plan.group,
        cardKind: plan.cardKind,
        reasonCode: "ledger-unavailable",
        reason: unavailableReason,
        decision: "manual-as-rework",
        outcome: "manual",
      });
      // 未呈现过（state 仍为 queued）：置 active 后走同一结算路径（resolve→drain），绝不调用 presenter。
      entry.state = "active";
      settleActive(entry, { outcome: "declined", operatorId: `judge:${plan.request.runtime}`, reason });
      return;
    }
    activeByProject.set(entry.projectKey, entry.payload.id); // 防下一张被 drain（一项目一卡）
    judging.set(entry.payload.id, entry);
    entry.state = "judging";
    entry.judged = true; // 同一请求只判断一次
    diagnostic.record("governance-judge.started", {
      requestId: entry.payload.id,
      toolCallId: entry.payload.toolCallId,
      roleId: entry.payload.roleId,
      projectRoot: entry.payload.projectRoot,
      runtime: entry.payload.runtime,
      group: plan.group,
      cardKind: plan.cardKind,
      flowId: plan.request.flowId,
    });
    void runJudge(entry, plan);
  };

  /**
   * 呈现队首（只在项目无占位时调用）：**先过验收分诊前闸**（2026-10-25；只对 acceptance 卡、只一次），
   * 再走既有判断/呈现路径。旧调用（未注入 gate / 非验收卡）行为逐字不变。
   */
  const presentEntry = (entry: ChannelEntry): void => {
    if (
      opts.acceptanceTriage !== undefined &&
      entry.triageEvaluated !== true &&
      cardKindOf(entry) === "acceptance"
    ) {
      entry.triageEvaluated = true;
      entry.state = "triaging";
      activeByProject.set(entry.projectKey, entry.payload.id); // 占住一项目一卡槽位
      triagingHolds.set(entry.payload.id, entry);
      void runAcceptanceTriageGate(entry);
      return;
    }
    presentEntryNow(entry);
  };

  /**
   * 求值验收分诊前闸。任何不确定（gate 抛错 / 未知结果）都按 `proceed` 回落既有验收卡路径
   * （fail-safe：更坏的情况只是保持旧行为，不伪造任何处置）。请求在等待期间被中止 ⇒ 丢弃结果。
   */
  const runAcceptanceTriageGate = async (entry: ChannelEntry): Promise<void> => {
    const gate = opts.acceptanceTriage!;
    let result: AcceptanceTriageGateResult;
    try {
      result = await gate({
        requestId: entry.payload.id,
        roleId: entry.payload.roleId,
        ...(entry.payload.projectRoot !== undefined ? { projectRoot: entry.payload.projectRoot } : {}),
        ...(entry.payload.runtime !== undefined ? { runtime: entry.payload.runtime } : {}),
        request: entry.request,
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        ...(entry.ctx.governanceModel !== undefined ? { governanceModel: entry.ctx.governanceModel } : {}),
      });
    } catch (error) {
      diagnostic.error("acceptance.triage.gate.failed", error, { requestId: entry.payload.id });
      result = { action: "proceed" };
    }
    if (entry.state !== "triaging") return; // 求值期间已中止/关窗：丢弃（已按 unavailable 结算）
    if (result === null || typeof result !== "object" || typeof (result as { action?: unknown }).action !== "string") {
      diagnostic.record("acceptance.triage.gate.unknown", { requestId: entry.payload.id });
      result = { action: "proceed" };
    }
    if (result.action === "proceed") {
      triagingHolds.delete(entry.payload.id);
      entry.state = "queued";
      presentEntryNow(entry); // 占位仍为本请求 id（presentNow/planJudge 会重设同一 id）
      return;
    }
    if (result.action === "settle") {
      settleHeldAcceptance(entry, result.outcome);
      if (activeByProject.get(entry.projectKey) === entry.payload.id) activeByProject.delete(entry.projectKey);
      if (result.run !== undefined) {
        void Promise.resolve()
          .then(() => result.action === "settle" ? result.run!() : undefined)
          .catch((error) => diagnostic.error("acceptance.triage.run.failed", error, { requestId: entry.payload.id }));
      }
      drainProject(entry.projectKey);
      return;
    }
    if (result.action === "triage-card") {
      // 被拦请求保持 state=triaging（若卡呈现失败，`finishAppCard` 会以 declined 结算它——fail-closed）。
      const presented = presentTriageCardInternal(result.card, result.onAnswer, entry);
      if (!presented.ok) {
        diagnostic.error("acceptance.triage.card.failed", new Error(presented.error ?? "present-failed"), {
          requestId: result.card.id,
        });
        settleHeldAcceptance(entry, {
          outcome: "declined",
          operatorId,
          reason: mainT("main.customerInput.deliveryFailed", { detail: presented.error ?? mainT("shared.common.unknownReason") }),
        });
        if (activeByProject.get(entry.projectKey) === entry.payload.id) activeByProject.delete(entry.projectKey);
        drainProject(entry.projectKey);
      }
      return;
    }
    // 未知 action：按 proceed 回落（不猜、不执行）
    diagnostic.record("acceptance.triage.gate.unknown", { requestId: entry.payload.id });
    triagingHolds.delete(entry.payload.id);
    entry.state = "queued";
    presentEntryNow(entry);
  };

  /** 同项目下一张：无占位且队列非空 ⇒ 按到达序呈现（绝不并发/合并/批准）。 */
  function drainProject(projectKey: string): void {
    if (activeByProject.has(projectKey)) return;
    const queue = waiting.get(projectKey);
    if (queue === undefined || queue.length === 0) {
      waiting.delete(projectKey);
      return;
    }
    const next = queue.shift()!;
    if (queue.length === 0) waiting.delete(projectKey);
    if (next.state !== "queued") {
      drainProject(projectKey);
      return;
    }
    if (next.signals.some((signal) => signal.aborted)) {
      next.state = "done";
      next.cleanup();
      next.resolve({ outcome: "unavailable", reason: mainT("main.confirm.expiredStopped") });
      notifyExpired(next, mainT("main.confirm.expiredStopped"));
      drainProject(projectKey);
      return;
    }
    presentEntry(next);
  }

  function queuedCount(): number {
    let count = 0;
    for (const queue of waiting.values()) count += queue.length;
    return count;
  }

  /**
   * **边界内写入预授权（2026-10-25 客户新规则）**：在**呈现卡片/调用判断之前**结算写盘确认请求。
   *
   * 返回 `undefined` ＝ 不拦（走既有卡片/判断路径）；否则直接返回结算结果——不登记 pending、
   * 不占「一项目一卡」、不调用 presenter、不调用判断 agent、不推导下一步（写盘卡本无下一步）。
   * fail-closed 方向：只有「全部声明路径经门禁 resolveWrite 允许且非治理敏感」才 accept；
   * 任一路径越界/无法解析 ⇒ reject；治理敏感或未声明路径 ⇒ 交回既有路径（零行为变化）。
   * 结算 `operatorId` 恒为 `WRITE_PREAUTHORIZATION_OPERATOR_ID`——不是客户手批、不是 judge 代批。
   */
  const preauthorizeWrite = (
    req: CustomerInputRequest,
    ctx: Parameters<DesktopCustomerInputFn>[1],
    metadata: CustomerInputMetadata | undefined,
  ): CustomerInputOutcome | undefined => {
    if (opts.presenter === undefined) return undefined; // 保留既有「未接线 → unavailable」语义
    if (opts.writePreauthorization === undefined) return undefined;
    if (req.kind !== "confirm") return undefined;
    // 2026-11-04 下载申请：下载卡虽为 confirm，但**绝不**能被边界写入预授权误判为 accept/reject
    // （即使卡面/元数据被注入 paths）；下载审批只走下载能力 + 判断/客户通道。
    if (req.cardKind === "download") return undefined;
    const boundary = ctx.writeBoundary;
    const projectRoot = ctx.projectRoot;
    const skillRoot = ctx.skillRoot;
    if (
      boundary === undefined ||
      typeof projectRoot !== "string" ||
      projectRoot === "" ||
      typeof skillRoot !== "string" ||
      skillRoot === ""
    ) {
      return undefined; // 无边界快照 ⇒ 不判定（旧行为；绝不「不知道边界就放行」）
    }
    // 已中止：交给既有取消语义（unavailable）；不在预授权里伪造结果。
    if ([metadata?.signal, ctx.sessionSignal].some((signal) => signal?.aborted === true)) return undefined;
    // 审计诊断带本请求的项目/角色上下文（字段仍走共享 logger 的白名单与脱敏）。
    const writeLog = createDiagnosticLogger({
      component: "desktop.write-preauthorization",
      projectRoot,
      ...(typeof ctx.roleId === "string" && ctx.roleId !== "" ? { roleId: ctx.roleId } : {}),
    });
    let decision: WritePreauthorizationDecision;
    try {
      decision = opts.writePreauthorization({
        request: req,
        boundary,
        projectRoot,
        skillRoot,
        ...(metadata !== undefined ? { metadata } : {}),
      });
    } catch (error) {
      // 判定异常 ⇒ 不拦（走既有卡片/判断路径）；绝不因异常而放行。
      writeLog.error("write-preauthorization.evaluate.failed", error, {
        toolCallId: metadata?.toolCallId,
      });
      return undefined;
    }
    if (decision.action === "confirm") {
      // 只有治理敏感（有声明写入路径但保留既有专用流程）值得留痕；普通非写盘确认不刷诊断。
      if (decision.reason === "governance-sensitive") {
        writeLog.record("write-preauthorization.sensitive", {
          reasonCode: decision.reason,
          count: decision.sensitivePaths?.length ?? 0,
          path: decision.sensitivePaths?.join("\n"),
          toolCallId: metadata?.toolCallId,
        });
      }
      return undefined;
    }
    const event: WritePreauthorizationEvent = {
      action: decision.action,
      roleId: String(ctx.roleId || ""),
      projectRoot,
      ...(ctx.runtime !== undefined ? { runtime: ctx.runtime } : {}),
      paths: decision.paths,
      summary: writePreauthorizationSummary(decision),
    };
    try {
      opts.onWritePreauthorization?.(event);
    } catch (error) {
      writeLog.error("write-preauthorization.notice.failed", error, {});
    }
    if (decision.action === "accept") {
      writeLog.record("write-preauthorization.accept", {
        outcome: "accept",
        count: decision.paths.length,
        path: decision.paths.join("\n"),
        toolCallId: metadata?.toolCallId,
      });
      return { outcome: "answered", value: { confirmed: true }, operatorId: WRITE_PREAUTHORIZATION_OPERATOR_ID };
    }
    writeLog.record("write-preauthorization.reject", {
      outcome: "reject",
      count: decision.paths.length + decision.unresolvedPaths.length,
      path: [...decision.paths, ...decision.unresolvedPaths].join("\n"),
      reasonCode: "boundary-preauthorization",
      toolCallId: metadata?.toolCallId,
    });
    return {
      outcome: "declined",
      operatorId: WRITE_PREAUTHORIZATION_OPERATOR_ID,
      reason: decision.reason,
      // 卡片从未呈现：与既有「呈现前拒绝发卡」同义——工具回执不得说成客户拒绝。
      notPresented: true,
    };
  };

  const customerInput: DesktopCustomerInputFn = (req, ctx, metadata) => {
    req = structuredClone(req);
    if (metadata?.judgeContext !== undefined) metadata = { ...metadata, judgeContext: structuredClone(metadata.judgeContext) };
    // decision 卡发卡前校验（2026-10-26）：在**呈现/判断/排队之前** fail-closed。
    // 拒发卡 ⇒ declined + notPresented:true（卡片从未呈现；不冒充客户拒绝、不写账本、不占一项目一卡）。
    const decisionGate = evaluateDecisionCardRequest({
      request: req,
      roleId: String((ctx && ctx.roleId) || ""),
      ...(ctx?.governanceModel !== undefined ? { governanceModel: ctx.governanceModel } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    });
    if (decisionGate.action === "reject") {
      diagnostic.record("decision-card.rejected", {
        reasonCode: decisionGate.reasonCode,
        ok: false,
      });
      return { outcome: "declined", reason: decisionGate.reason, notPresented: true };
    }
    const preauthorized = preauthorizeWrite(req, ctx, metadata);
    if (preauthorized !== undefined) return preauthorized;
    const fingerprint = createHash("sha256").update(JSON.stringify(req)).digest("hex");
    if (ctx.requestId !== undefined) {
      const previous = requestResults.get(ctx.requestId);
      if (previous !== undefined) {
        if (previous.originRoleId !== ctx.roleId || previous.fingerprint !== fingerprint) {
          return { outcome: "unavailable", reason: "该请求标识已绑定另一张业务卡，请由原发起者重新提交。" };
        }
        return previous.promise;
      }
    }
    const result = Promise.withResolvers<CustomerInputOutcome>();
    if (ctx.requestId !== undefined) requestResults.set(ctx.requestId, { originRoleId: ctx.roleId, fingerprint, promise: result.promise });
    void new Promise<CustomerInputOutcome>((resolve) => {
      // 退路：通道未配置 → 不可用（能力缺席即 fail-closed；绝不当「没人问、那就放行」）。
      if (opts.presenter === undefined) {
        resolve({ outcome: "unavailable", reason: mainT("main.customerInput.presenterMissing") });
        return;
      }
      const id = ctx.requestId ?? (opts.nextId ? opts.nextId() : `op-${++seq}`);
      const payload: OperatorRequestPayload = { id, roleId: String((ctx && ctx.roleId) || ""), request: req, anchorKey: interactionAnchorKey(req.kind, req.title) };
      // 镜像面（四角色评审 §6.1）：由 SessionManager 计算并给出；仅非空字符串进入载荷。
      // 同一请求仍只登记一条 pending、只结算一次——本字段不改变任何校验/账本/下一步推导。
      if (typeof ctx?.mirrorRoleId === "string" && ctx.mirrorRoleId !== "") payload.mirrorRoleId = ctx.mirrorRoleId;
      if (ctx.runtime !== undefined) payload.runtime = ctx.runtime;
      if (ctx.projectRoot !== undefined) payload.projectRoot = ctx.projectRoot;
      if (typeof metadata?.turnId === "string" && metadata.turnId !== "") payload.turnId = metadata.turnId;
      if (typeof metadata?.toolCallId === "string" && metadata.toolCallId !== "") payload.toolCallId = metadata.toolCallId;
      if (typeof ctx?.judgeNotice === "string" && ctx.judgeNotice !== "") payload.judgeNotice = ctx.judgeNotice;
      if (ctx?.acceptanceReport !== undefined) payload.acceptanceReport = ctx.acceptanceReport;
      const signals = [metadata?.signal, ctx.sessionSignal].filter((signal): signal is AbortSignal => signal !== undefined);
      const projectKey = projectKeyOf(ctx);
      const entry: ChannelEntry = {
        payload,
        request: req,
        projectKey,
        signals,
        cleanup: () => { entry.chiefAbort?.abort(); for (const signal of signals) signal.removeEventListener("abort", cancel); },
        resolve,
        state: "queued",
        // 判断上下文（§4.2/§5.2）：只存调用当刻的会话事实；是否判断在 `presentEntry` 当刻再查开关。
        ctx: {
          ...(ctx.runtime !== undefined ? { runtime: ctx.runtime } : {}),
          ...(ctx.projectRoot !== undefined ? { projectRoot: ctx.projectRoot } : {}),
          ...(ctx.governanceModel !== undefined ? { governanceModel: ctx.governanceModel } : {}),
          ...(ctx.governanceJudge !== undefined ? { governanceJudge: ctx.governanceJudge } : {}),
          ...(ctx.chiefDecision !== undefined ? { chiefDecision: ctx.chiefDecision } : {}),
          ...(typeof ctx.turnText === "string" && ctx.turnText !== "" ? { turnText: ctx.turnText } : {}),
          ...(ctx.onPresented !== undefined ? { onPresented: ctx.onPresented } : {}),
        },
        ...(metadata !== undefined ? { metadata } : {}),
        ...(decisionGate.action === "allow"
          ? {
              decisionCard: {
                flowId: decisionGate.flowId,
                recommendedOptionId: decisionGate.recommendedOptionId,
              },
            }
          : {}),
      };
      /** 取消（轮次停止 / 会话重建）：active/judging/triaging/directing ⇒ 结算并放行下一张；queued ⇒ 出队结算（从不呈现）。 */
      const cancel = () => {
        if (entry.state === "done") return;
        const wasOccupying =
          entry.state === "active" || entry.state === "judging" || entry.state === "triaging" || entry.state === "directing";
        if (entry.state === "active") pending.delete(id);
        else if (entry.state === "judging") judging.delete(id);
        else if (entry.state === "directing") directingHolds.delete(id);
        else if (entry.state === "triaging") {
          triagingHolds.delete(id);
          // 只摘除挂靠：分诊卡保留（客户再作答时只执行处置，无活请求可结算——不伪造客户决定）。
          const cardEntry = appCardHolding(entry);
          if (cardEntry?.appCard !== undefined) {
            const index = cardEntry.appCard.held.indexOf(entry);
            if (index >= 0) cardEntry.appCard.held.splice(index, 1);
          }
        } else removeQueued(entry);
        if (wasOccupying && activeByProject.get(projectKey) === id) activeByProject.delete(projectKey);
        entry.state = "done";
        entry.cleanup();
        entry.resolve({ outcome: "unavailable", reason: mainT("main.confirm.expiredStopped") });
        notifyExpired(entry, mainT("main.confirm.expiredStopped"));
        if (wasOccupying) drainProject(projectKey);
      };
      if (activeByProject.has(projectKey)) {
        // 一项目一卡：后续请求入队、不呈现；状态经 onQueued 让界面显示「等待前一个决定」。
        const queue = waiting.get(projectKey) ?? [];
        queue.push(entry);
        waiting.set(projectKey, queue);
        entry.queuedNotified = true; // 2026-10-20：界面将出现排队行；未呈现即结算时必须补发 onExpired
        for (const signal of signals) signal.addEventListener("abort", cancel, { once: true });
        if (signals.some((signal) => signal.aborted)) {
          cancel();
          return;
        }
        try {
          opts.onQueued?.(payload, activeByProject.get(projectKey)!);
        } catch (error) {
          diagnostic.error("interaction.queued.failed", error, { requestId: id });
        }
        diagnostic.record("interaction.queued", { requestId: id, queuedCount: queuedCount() });
        return;
      }
      for (const signal of signals) signal.addEventListener("abort", cancel, { once: true });
      if (signals.some((signal) => signal.aborted)) {
        cancel();
        return;
      }
      presentEntry(entry);
    }).then(result.resolve, result.reject);
    return result.promise;
  };

  /**
   * required acknowledgments 结算校验（confirm/choice **共用**，D4；不复制第二套）：
   * 请求声明 `acknowledgments[].required` ⇒ `raw` 必须为字符串数组且去重后**恰等于** required id
   * 集合（缺失/多余/非数组一律拒收，pending 保留可重试）；无 required ⇒ 旧行为（不校验/不回传）。
   */
  function settleAcknowledgements(
    request: CustomerInputRequest,
    raw: unknown,
  ): { ok: true; acknowledged?: string[] } | { ok: false; error: string } {
    const declared = Array.isArray(request.acknowledgments) ? request.acknowledgments : [];
    const requiredIds = declared.filter((item) => item.required === true).map((item) => item.id);
    if (requiredIds.length === 0) return { ok: true };
    if (!Array.isArray(raw) || raw.some((value) => typeof value !== "string")) {
      return { ok: false, error: mainT("main.customerInput.selectionMustBeArray") };
    }
    const unique = [...new Set(raw as string[])];
    const required = new Set(requiredIds);
    if (unique.length !== required.size || unique.some((id) => !required.has(id))) {
      return { ok: false, error: mainT("main.customerInput.selectionNotInRequest") };
    }
    return { ok: true, acknowledged: unique };
  }

  function respondUnsafe(input: { id?: unknown; decision?: unknown }): { ok: boolean; error?: string; expired?: boolean } {
    const id = input && typeof input.id === "string" ? input.id : "";
    diagnostic.record("interaction.response", { requestId: id });
    const entry = pending.get(id);
    if (!entry) {
      // 终态：该 id 已无挂起请求——G-1 起只剩「应用关闭/重启清空了未决请求」这一种真实原因（无按时间超时）。
      // 界面据此**定格**，不得解冻重试；文案如实指向重启/关闭。
      return { ok: false, error: mainT("main.customerInput.noPendingRequest"), expired: true };
    }
    if (isChiefBusinessCard(entry) && entry.ctx.governanceModel === "trio" && delegationState().enabled) {
      return { ok: false, error: mainT("main.customerInput.chief.manualTakeoverRequired") };
    }
    const d = input.decision as OperatorDecisionPayload | undefined;
    if (!d || typeof d !== "object") {
      return { ok: false, error: mainT("main.customerInput.missingDecision") };
    }
    // —— confirm：恰 `confirmed:true` ⇒ answered；`confirmed:false` ⇒ declined（客户不同意）。——
    if (d.kind === "confirm") {
      if (entry.request.kind !== "confirm") {
        return { ok: false, error: mainT("main.customerInput.choiceMismatch") };
      }
      if (d.confirmed !== true && d.confirmed !== false) {
        return { ok: false, error: mainT("main.customerInput.confirmMustBeBoolean") };
      }
      if (d.confirmed === false) {
        // D4：拒绝不要求/不校验 acknowledged，也不回传（declined 分支无该字段）。
        settleActive(entry, { outcome: "declined", operatorId, reason: mainT("main.customerInput.customerDeclined") });
        return { ok: true };
      }
      const ack = settleAcknowledgements(entry.request, d.acknowledged);
      if (!ack.ok) return { ok: false, error: ack.error };
      settleActive(entry, {
        outcome: "answered",
        value: { confirmed: true },
        operatorId,
        ...(ack.acknowledged !== undefined ? { acknowledged: ack.acknowledged } : {}),
      });
      return { ok: true };
    }
    // —— choice：取消 ⇒ declined；作答 ⇒ selected 必须 ⊆ 已给选项、去重、单选恰一个。——
    if (d.kind === "choice") {
      if (entry.request.kind !== "choice") {
        return { ok: false, error: mainT("main.customerInput.confirmMismatch") };
      }
      if (d.cancelled === true) {
        settleActive(entry, { outcome: "declined", operatorId, reason: mainT("main.customerInput.customerCancelled") });
        return { ok: true };
      }
      const rawSel = d.selected;
      if (!Array.isArray(rawSel) || rawSel.some((s) => typeof s !== "string")) {
        return { ok: false, error: mainT("main.customerInput.selectionMustBeArray") };
      }
      const selected = [...new Set(rawSel as string[])];
      if (selected.length === 0) {
        return { ok: false, error: mainT("main.customerInput.emptySelection") };
      }
      const offered = new Set(entry.request.options.map((o) => o.id));
      if (selected.some((s) => !offered.has(s))) {
        return { ok: false, error: mainT("main.customerInput.selectionNotInRequest") };
      }
      if (entry.request.multiple !== true && selected.length !== 1) {
        return { ok: false, error: mainT("main.customerInput.singleChoiceOnly") };
      }
      // 2026-11-04 trunk-amendment C1/F1（D4 抽出共用 helper）：请求声明 `required` 勾选项时，
      // `acknowledged` 必须为字符串数组且去重后**恰等于** required id 集合（缺失/多余/非数组一律拒收，
      // pending 保留）。未声明 ⇒ 旧行为零变化。结算值回传 `acknowledged: string[]`
      // （`request.resolved` 不加字段）。
      const ack = settleAcknowledgements(entry.request, d.acknowledged);
      if (!ack.ok) return { ok: false, error: ack.error };
      settleActive(entry, {
        outcome: "answered",
        value: { selected },
        operatorId,
        ...(ack.acknowledged !== undefined ? { acknowledged: ack.acknowledged } : {}),
      });
      return { ok: true };
    }
    return { ok: false, error: mainT("main.customerInput.unknownDecisionType") };
  }

  function rejectAllPending(reason: string): void {
    unsubscribeDelegation?.();
    diagnostic.record("interaction.closed", { pendingCount: pending.size, queuedCount: queuedCount() });
    // 已呈现的卡、判断中的卡与排队中的请求都归 declined（窗关/项目关闭 = 未获同意，fail-closed）；
    // 排队者从未呈现，仍经 onExpired 让界面清掉「等待前一个决定」行；判断中的卡迟到结果被丢弃（state=done）。
    // 分诊中被拦的验收请求先结算（它们不在 pending），随后清空合成卡的挂靠列表（防重复结算/误执行处置）。
    for (const heldEntry of triagingHolds.values()) {
      if (heldEntry.state === "done") continue;
      heldEntry.state = "done";
      notifyExpired(heldEntry, reason);
      heldEntry.cleanup();
      heldEntry.resolve({ outcome: "declined", operatorId, reason });
    }
    triagingHolds.clear();
    for (const heldEntry of directingHolds.values()) {
      if (heldEntry.state === "done") continue;
      heldEntry.state = "done";
      notifyExpired(heldEntry, reason);
      heldEntry.cleanup();
      heldEntry.resolve({ outcome: "declined", operatorId, reason });
    }
    directingHolds.clear();
    for (const entry of [...pending.values(), ...judging.values(), ...[...waiting.values()].flat()]) {
      if (entry.state === "done") continue;
      if (entry.appCard !== undefined) entry.appCard.held.splice(0);
      entry.state = "done";
      notifyExpired(entry, reason);
      entry.cleanup();
      entry.resolve({ outcome: "declined", operatorId, reason });
    }
    pending.clear();
    judging.clear();
    waiting.clear();
    activeByProject.clear();
  }

  function respond(input: { id?: unknown; decision?: unknown }): { ok: boolean; error?: string; expired?: boolean } {
    const result = respondUnsafe(input);
    diagnostic.record("interaction.response.end", { ok: result.ok, requestId: input?.id, pendingCount: pending.size });
    return result;
  }

  function replayPending(): number {
    let count = 0;
    for (const entry of pending.values()) {
      try {
        entry.presented = true; // 重推后界面仍有呈现态卡片
        opts.presenter?.(entry.payload);
        count += 1;
      } catch (error) {
        diagnostic.error("interaction.replay.failed", error, { requestId: entry.payload.id });
      }
    }
    // 一项目一卡：排队项**不呈现卡**，但重推「等待前一个决定」状态行（渲染重载后仍可见）。
    for (const [projectKey, queue] of waiting) {
      const waitingFor = activeByProject.get(projectKey) ?? "";
      for (const entry of queue) {
        entry.queuedNotified = true; // 重推即界面有排队行（未呈现结算时须补发 onExpired）
        try {
          opts.onQueued?.(entry.payload, waitingFor);
          count += 1;
        } catch (error) {
          diagnostic.error("interaction.queued.replay.failed", error, { requestId: entry.payload.id });
        }
      }
    }
    diagnostic.record("interaction.replayed", { count, queuedCount: queuedCount() });
    return count;
  }

  /** 按角色挂起数（G-2/W1；纯读——请求本体不带 roleId，取每会话闭包绑定的 `payload.roleId`）。
   *  已呈现与排队等待都计入：排队中的角色同样在「正确等待客户」，看护 #1 不应误报。 */
  function pendingRoles(): Map<string, number> {
    const counts = new Map<string, number>();
    const add = (entry: ChannelEntry): void => {
      const roleId = entry.payload.roleId;
      if (typeof roleId === "string" && roleId !== "") counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
    };
    for (const entry of pending.values()) add(entry);
    for (const queue of waiting.values()) for (const entry of queue) add(entry);
    return counts;
  }
  return {
    customerInput,
    respond,
    rejectAllPending,
    pendingCount: () => pending.size + queuedCount(),
    queuedCount,
    pendingRoles,
    replayPending,
    judgingCount: () => judging.size,
    presentAcceptanceTriageCard: (card, onAnswer) => presentTriageCardInternal(card, onAnswer),
  };
}

/** 判断回落的人话映射（未知码回落到有界理由；仅展示，不参与任何判定）。 */
function judgeHumanReason(reasonCode: string, reason?: string): string {
  switch (reasonCode) {
    case "switch-off": return mainT("main.customerInput.switchOff");
    case "timeout": return typeof reason === "string" && reason !== "" ? reason : mainT("main.customerInput.reason.timeout");
    case "aborted": return mainT("main.customerInput.reason.aborted");
    case "unavailable": return mainT("main.customerInput.reason.unavailable");
    case "unsupported-engine": return mainT("main.customerInput.reason.unsupportedEngine");
    case "parse-failed": return mainT("main.customerInput.reason.parseFailed");
    case "artifact-missing": return mainT("main.customerInput.reason.artifactMissing");
    case "artifact-not-read": return mainT("main.customerInput.reason.artifactNotRead");
    case "path-outside-boundary": return mainT("main.customerInput.reason.pathOutsideBoundary");
    case "path-unverified": return mainT("main.customerInput.reason.pathUnverified");
    case "not-recommended": return mainT("main.customerInput.reason.notRecommended");
    case "insufficient-evidence": return mainT("main.customerInput.reason.insufficientEvidence");
    case "ledger-unavailable": return mainT("main.customerInput.reason.ledgerUnavailable");
    case "group-mismatch": return mainT("main.customerInput.reason.groupMismatch");
    case "read-denied": return readDeniedHumanReason(reason);
    case "budget": return mainT("main.customerInput.reason.budget");
    case "read-truncated": return mainT("main.customerInput.reason.readTruncated");
    case "context-missing": return mainT("main.customerInput.reason.contextMissing");
    default: return typeof reason === "string" && reason !== "" ? reason : mainT("main.customerInput.reason.fallback");
  }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 自动判断未通过/未完成时的**可操作原因**（2026-10-19 客户总原则：「我勾选了替我决策就不用我来管了」）。
 * `reasonCode` 映射成人话；driver 给出的具体 `reason` 以括注保留（read-denied 已含具体路径，不重复）。
 */
function judgeReworkHumanReason(outcome: GovernanceJudgeOutcome): string {
  const mapped = stripTrailingSentencePunct(judgeHumanReason(outcome.reasonCode, outcome.reason));
  if (outcome.reasonCode === "read-denied") return mapped;
  const specific = typeof outcome.reason === "string" ? stripTrailingSentencePunct(outcome.reason.trim()) : "";
  if (specific === "" || specific === mapped || mapped.includes(specific)) return mapped;
  return `${mapped}（${specific}）`;
}

/** 自动拒批/未通过的统一客户可见文案（不伪造客户同意；指示修正后重新提交）。 */
function judgeReworkReasonText(
  group: GovernanceJudgeGroup,
  outcome: GovernanceJudgeOutcome,
  kind: "deny" | "manual",
): string {
  const label = group === "approval" ? mainT("main.customerInput.autoApprovalLabel") : mainT("main.customerInput.autoDecisionLabel");
  return kind === "deny"
    ? mainT("main.customerInput.rework.head", { label, reason: judgeReworkHumanReason(outcome) })
    : mainT("main.customerInput.ledgerUnavailableShort", { label, reason: judgeReworkHumanReason(outcome) });
}

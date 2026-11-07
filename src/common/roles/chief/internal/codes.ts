// chief 角色模块：稳定内部码与 i18n messageKey（纯数据；不写用户文案）。
//
// 契约：E0.3 §3.5 错误语义——`deny` 必带稳定内部 `code` 与 i18n `messageKey`；只供测试/诊断/展示，
// 不参与权限判定。本表是 chief 模块自有码的单一来源；新增/改名走接口评审（E0.3 §4.4）。
//
// 其中 `self-dispatch` / `chief-to-project-forbidden` / `target-card-missing` 与旧编排硬授权谓词
// `src/common/编排/workflow-preconditions.ts::evaluateDispatchAuthorization` 的稳定码逐字一致，
// 便于 E2 切换期差分与错误文案映射；其余码为本模块新增的 fail-closed 诊断码。

/** chief 纯策略的稳定内部码（只供测试/诊断；不是用户文案、不是权限）。 */
export const CHIEF_POLICY_CODES = Object.freeze({
  /** 动作不在 chief 模块覆盖范围（E0.3 §3.5 固定码）。 */
  actionNotCovered: "action-not-covered",
  /** preflight：必需事实键缺失。 */
  preflightFactMissing: "chief-preflight-fact-missing",
  /** preflight：事实键未知或类型/取值不符。 */
  preflightFactInvalid: "chief-preflight-fact-invalid",
  /** preflight：pinned run 的版本决策应走既有 run-change（工具文案纪律）。 */
  versionDecisionPinnedRun: "chief-version-decision-pinned-run",
  /** preflight：已有未决版本决策请求（不重复发卡）。 */
  versionDecisionPending: "chief-version-decision-pending",
  /** dispatch：来源角色 id 缺失（未知来源 ⇒ fail-closed）。 */
  dispatchSourceMissing: "chief-dispatch-source-missing",
  /** dispatch：来源角色不是 chief（本模块只回答 chief 作为来源的派发）。 */
  dispatchSourceNotChief: "chief-dispatch-source-not-chief",
  /** dispatch：派发给自己（与旧编排 `self-dispatch` 逐字一致）。 */
  dispatchSelf: "self-dispatch",
  /** dispatch：目标类别未知（闭集外 ⇒ fail-closed）。 */
  dispatchTargetKindInvalid: "chief-dispatch-target-kind-invalid",
  /** dispatch：幕僚不直接给项目 worker 派实现任务（与旧编排 `chief-to-project-forbidden` 逐字一致）。 */
  dispatchTargetProjectForbidden: "chief-to-project-forbidden",
  /** dispatch：目标不是可派发的内置角色，或目标不存在/未枚举（与旧编排 `target-card-missing` 逐字一致）。 */
  dispatchTargetMissing: "target-card-missing",
});

/** chief 模块的 i18n messageKey（稳定内部键；E2 若对外呈现再登记 i18n 资源）。 */
export const CHIEF_MESSAGE_KEYS = Object.freeze({
  actionNotCovered: "role.chief.preflight.actionNotCovered",
  preflightFactMissing: "role.chief.preflight.factMissing",
  preflightFactInvalid: "role.chief.preflight.factInvalid",
  versionDecisionPinnedRun: "role.chief.preflight.versionDecisionPinnedRun",
  versionDecisionPending: "role.chief.preflight.versionDecisionPending",
  dispatchSourceMissing: "role.chief.dispatch.sourceMissing",
  dispatchSourceNotChief: "role.chief.dispatch.sourceNotChief",
  dispatchSelf: "role.chief.dispatch.self",
  dispatchTargetKindInvalid: "role.chief.dispatch.targetKindInvalid",
  dispatchTargetProjectForbidden: "role.chief.dispatch.projectForbidden",
  dispatchTargetMissing: "role.chief.dispatch.targetMissing",
});

/** `tools()` 的结构化原因码（非 deny；解释为何不额外注入工具）。 */
export const CHIEF_TOOL_REASON_CODES = Object.freeze({
  governanceModelSingle: "chief-tools-single-model",
  governanceModelUnknown: "chief-tools-governance-model-unknown",
});

/** `tools()` 结构化原因对应的稳定 messageKey。 */
export const CHIEF_TOOL_MESSAGE_KEYS = Object.freeze({
  governanceModelSingle: "role.chief.tools.singleModel",
  governanceModelUnknown: "role.chief.tools.governanceModelUnknown",
});

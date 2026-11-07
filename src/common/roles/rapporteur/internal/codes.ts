// 内部文件：rapporteur 角色模块的稳定内部码与 i18n messageKey（只供测试/诊断/宿主呈现）。
//
// 约束（E0.3 契约 §3.3 第 6 条 / §3.5）：
//  - `code` 是稳定内部码，一旦登记不得静默改名（改名走接口评审）；
//  - `messageKey` 是 i18n 键，本模块**不写用户文案**；E1 只登记键名，不新增 shared i18n 条目
//    （与门禁引擎 `role.tools.*` 先例一致），消费者可据此映射；
//  - `details` 只放 JSON 可序列化的普通数据，不含密钥、客户正文或模型原始输出。

/** `preflight.checkAction()` 的稳定内部码。 */
export const RAPPORTEUR_PREFLIGHT_CODES = Object.freeze({
  /** 契约 §3.4 规定的稳定码：动作不在本角色覆盖范围。 */
  actionNotCovered: "action-not-covered",
  factsMissing: "rapporteur-facts-missing",
  factsInvalid: "rapporteur-facts-invalid",
  factsUnknownKey: "rapporteur-facts-unknown-key",
  initiatorMismatch: "rapporteur-initiator-mismatch",
  amendmentNotWholeOrder: "rapporteur-amendment-not-whole-order",
  amendmentLegacyCardPath: "rapporteur-amendment-legacy-card-path",
  runChangeModeInvalid: "rapporteur-run-change-mode-invalid",
  requirementChangeRefMissing: "rapporteur-requirement-change-ref-missing",
  requirementChangeApprovalClaimed: "rapporteur-requirement-change-approval-claimed",
  requirementChangeSelfApproval: "rapporteur-requirement-change-self-approval",
});

/** `preflight.checkAction()` 的 i18n 键（只登记；文案由共享 i18n / 消费者渲染）。 */
export const RAPPORTEUR_PREFLIGHT_MESSAGE_KEYS = Object.freeze({
  actionNotCovered: "role.rapporteur.preflight.actionNotCovered",
  factsMissing: "role.rapporteur.preflight.factsMissing",
  factsInvalid: "role.rapporteur.preflight.factsInvalid",
  factsUnknownKey: "role.rapporteur.preflight.factsUnknownKey",
  initiatorMismatch: "role.rapporteur.preflight.initiatorMismatch",
  amendmentNotWholeOrder: "role.rapporteur.preflight.amendmentNotWholeOrder",
  amendmentLegacyCardPath: "role.rapporteur.preflight.amendmentLegacyCardPath",
  runChangeModeInvalid: "role.rapporteur.preflight.runChangeModeInvalid",
  requirementChangeRefMissing: "role.rapporteur.preflight.requirementChangeRefMissing",
  requirementChangeApprovalClaimed: "role.rapporteur.preflight.requirementChangeApprovalClaimed",
  requirementChangeSelfApproval: "role.rapporteur.preflight.requirementChangeSelfApproval",
});

/** `dispatch()` 的稳定内部码（R-2：只回答硬身份/存在性 + 本角色不派发）。 */
export const RAPPORTEUR_DISPATCH_CODES = Object.freeze({
  sourceMissing: "rapporteur-dispatch-source-missing",
  sourceMismatch: "rapporteur-dispatch-source-mismatch",
  targetInvalid: "rapporteur-dispatch-target-invalid",
  targetMissing: "rapporteur-dispatch-target-missing",
  notAuthorized: "rapporteur-dispatch-not-authorized",
});

/** `dispatch()` 的 i18n 键（只登记）。 */
export const RAPPORTEUR_DISPATCH_MESSAGE_KEYS = Object.freeze({
  sourceMissing: "role.rapporteur.dispatch.sourceMissing",
  sourceMismatch: "role.rapporteur.dispatch.sourceMismatch",
  targetInvalid: "role.rapporteur.dispatch.targetInvalid",
  targetMissing: "role.rapporteur.dispatch.targetMissing",
  notAuthorized: "role.rapporteur.dispatch.notAuthorized",
});

/** `tools()` 的稳定内部码 / i18n 键（非 trio 模型不作为装配来源）。 */
export const RAPPORTEUR_TOOLS_CODES = Object.freeze({
  modelUnsupported: "rapporteur-tools-governance-model-unsupported",
});

export const RAPPORTEUR_TOOLS_MESSAGE_KEYS = Object.freeze({
  modelUnsupported: "role.rapporteur.tools.governanceModelUnsupported",
});

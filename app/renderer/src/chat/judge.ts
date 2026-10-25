/**
 * 「替我审批 / 替我决策」双开关、判断结果行与确认卡标题的纯映射（Phase 3B）。
 *
 * 口径逐字对齐旧 `app/renderer/ui-labels.js` 的对应函数（单一文案来源的迁移）：
 *  - 渲染侧只做「主进程已给出的事实 → 文案/DOM 视图」的转写，不判定命令/卡片；
 *  - 开关真实状态只信主进程（`shell:judge-state` / `decision:judge-state`）；
 *  - `manual` 不产生结果行（原卡 + `judgeNotice` 替代）。
 *
 * 纯函数、无 DOM/存储依赖；`test/桌面UI/` 的 node 单测直接 import。
 */

import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "../i18n/index.ts";

export type JudgeGroup = "approval" | "decision";

export const JUDGE_GROUP_APPROVAL: JudgeGroup = "approval";
export const JUDGE_GROUP_DECISION: JudgeGroup = "decision";

const JUDGE_GROUP_LABEL_KEYS: Record<JudgeGroup, MessageKey> = {
  approval: "ui.judge.mode.approval",
  decision: "ui.judge.mode.decision",
};

export function judgeGroupLabel(
  group: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return group === JUDGE_GROUP_APPROVAL || group === JUDGE_GROUP_DECISION
    ? translate(locale, JUDGE_GROUP_LABEL_KEYS[group])
    : "";
}

function str(value: unknown): string {
  return typeof value === "string" && value !== "" ? value : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
}

// —————— shell 确认卡标题（2026-10-19 客户截图反馈）——————
// 五个内置治理角色走同一审批档，但不再显示「SU」；名称顺序沿用旧 ui-labels 的
// `governanceRoleDisplayNameById`（英文 / 中文）。非内置 id ⇒ 空串，走兜底文案。

// judge shell 确认标题的内置治理角色名：顺序按现源码（英文在前）。
// draft/crew/steward 与 `ui.role.governance.*.name` 逐字相同，复用；liaison/verifier
// 的现源码顺序与目录相反，使用 judge 专用 key（不改 roleId/GovernanceFunction）。
const GOVERNANCE_ROLE_NAME_KEYS: Record<string, MessageKey> = {
  liaison: "ui.judge.roleName.liaison",
  rapporteur: "ui.role.governance.draft.name",
  nominator: "ui.role.governance.crew.name",
  convener: "ui.role.governance.steward.name",
  verifier: "ui.judge.roleName.verifier",
};

export function governanceRoleDisplayNameById(
  roleId: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (typeof roleId !== "string" || roleId === "") return "";
  const key = GOVERNANCE_ROLE_NAME_KEYS[roleId];
  return key === undefined ? "" : translate(locale, key);
}

export function shellConfirmTitle(
  policy: unknown,
  roleId: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const roleName = governanceRoleDisplayNameById(roleId, locale);
  if (roleName !== "") {
    return translate(locale, "ui.judge.titleWithRole", { roleName });
  }
  return translate(
    locale,
    policy === "su-approval" ? "ui.judge.titleSu" : "ui.judge.titleShell",
  );
}

/** su 审批档位可见标签（未知/缺省 ⇒ 空串，只显示原因与警告，不编档位）。 */
export function suApprovalTierLabel(
  tier: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (tier === "risky") return translate(locale, "ui.judge.tier.risky");
  if (tier === "review") return translate(locale, "ui.judge.tier.review");
  if (tier === "deny") return translate(locale, "ui.judge.tier.deny");
  return "";
}

/** 判断引擎展示名（缺省如实「未报告」，不编引擎）。 */
export function shellJudgeEngineLabel(
  engine: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (engine === "claude") return "Claude";
  if (engine === "pi") return "Pi";
  if (engine === "codex") return "Codex";
  return typeof engine === "string" && engine !== ""
    ? engine
    : translate(locale, "shared.common.notReported");
}

// —————— 双开关视图（纯映射）——————

export function shellJudgeOnLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.judge.shellOn");
}
export function shellJudgeOffLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.judge.shellOff");
}
export function decisionJudgeOnLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.judge.decisionOn");
}
export function decisionJudgeOffLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.judge.decisionOff");
}
export function judgeBridgeMissingLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.judge.bridgeMissing");
}
export function decisionJudgeSingleNote(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.judge.decisionSingleNote");
}

export function judgeWarningCloseLabel(locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, "ui.judge.warningClose");
}

export const SHELL_JUDGE_ON_LABEL = shellJudgeOnLabel(DEFAULT_LOCALE);
export const SHELL_JUDGE_OFF_LABEL = shellJudgeOffLabel(DEFAULT_LOCALE);
export const DECISION_JUDGE_ON_LABEL = decisionJudgeOnLabel(DEFAULT_LOCALE);
export const DECISION_JUDGE_OFF_LABEL = decisionJudgeOffLabel(DEFAULT_LOCALE);
export const JUDGE_BRIDGE_MISSING = judgeBridgeMissingLabel(DEFAULT_LOCALE);
export const DECISION_JUDGE_SINGLE_NOTE = decisionJudgeSingleNote(DEFAULT_LOCALE);

export const SHELL_JUDGE_WARNING_CLOSE_LABEL = judgeWarningCloseLabel(DEFAULT_LOCALE);
export const SHELL_JUDGE_WARNING_AUTO_DISMISS_MS = 9000;

export interface JudgeToggleView {
  group: JudgeGroup;
  available: boolean;
  enabled: boolean;
  checked: boolean;
  singleDisabled: boolean;
  disabled: boolean;
  label: string;
  title: string;
  note: string;
}

export interface JudgeToggleOptions {
  singleDisabled?: boolean;
}

/**
 * 一个开关的视图：桥缺失/驱动缺失 ⇒ 禁用 + 固定文案，绝不 checked（不显示假开启态）；
 * decision 在 single 项目 ⇒ 禁用 + 说明，不显示开启态；busy（IPC 在途）只禁用，不改文案。
 */
export function judgeToggleView(
  group: JudgeGroup,
  available: boolean,
  enabled: boolean,
  busy: boolean,
  options?: JudgeToggleOptions | null,
  locale: Locale = DEFAULT_LOCALE,
): JudgeToggleView {
  const decision = group === JUDGE_GROUP_DECISION;
  const ok = available === true;
  const singleDisabled = decision && options?.singleDisabled === true;
  const on = ok && !singleDisabled && enabled === true;
  const onLabel = decision ? decisionJudgeOnLabel(locale) : shellJudgeOnLabel(locale);
  const offLabel = decision ? decisionJudgeOffLabel(locale) : shellJudgeOffLabel(locale);
  const offTitle = translate(
    locale,
    decision ? "ui.judge.decisionOffTitle" : "ui.judge.shellOffTitle",
  );
  const onTitle = translate(
    locale,
    decision ? "ui.judge.decisionOnTitle" : "ui.judge.shellOnTitle",
  );
  const missing = judgeBridgeMissingLabel(locale);
  const singleNote = decisionJudgeSingleNote(locale);
  return {
    group,
    available: ok,
    enabled: on,
    checked: on,
    singleDisabled,
    disabled: !ok || singleDisabled || busy === true,
    label: ok ? (on ? onLabel : offLabel) : missing,
    title: !ok
      ? missing
      : singleDisabled
        ? singleNote
        : on
          ? onTitle
          : offTitle,
    note: ok && singleDisabled ? singleNote : "",
  };
}

/**
 * 一次性开启警告的状态迁移：关闭 ⇒ 复位；开启且未提示 ⇒ 只显示这一次；
 * 已提示（重绘/收消息/切角色/重复推送）⇒ 不再显示。每个组各自一份 `shown`。
 */
export function judgeWarningStep(
  enabled: boolean,
  shown: boolean,
): { shown: boolean; show: boolean } {
  if (enabled !== true) return { shown: false, show: false };
  if (shown === true) return { shown: true, show: false };
  return { shown: true, show: true };
}

export interface JudgeWarningLine {
  text: string;
  strong: boolean;
}

/** 开启警告：同一块按当前开启的组列行（两个都开 ⇒ 两段 + 共享说明）。 */
export function judgeWarningLines(
  groups: JudgeGroup[],
  locale: Locale = DEFAULT_LOCALE,
): JudgeWarningLine[] {
  const list = Array.isArray(groups) ? groups : [];
  const approval = list.indexOf(JUDGE_GROUP_APPROVAL) >= 0;
  const decision = list.indexOf(JUDGE_GROUP_DECISION) >= 0;
  const lines: JudgeWarningLine[] = [];
  if (approval) {
    lines.push({
      text: translate(locale, "ui.judge.toggleOn.shell"),
      strong: true,
    });
  }
  if (decision) {
    lines.push({
      text: translate(locale, "ui.judge.toggleOn.decision"),
      strong: true,
    });
  }
  lines.push({
    text: translate(locale, "ui.judge.scopeNote"),
    strong: false,
  });
  lines.push({
    text: translate(locale, "ui.judge.quickPathNote"),
    strong: false,
  });
  lines.push({
    text: translate(locale, "ui.judge.costNote"),
    strong: false,
  });
  return lines;
}

/**
 * 开关 IPC 结果的自洽化（主进程是开关权威）：
 * ok:true 且带布尔 enabled ⇒ 采用主进程实际值；其余 ⇒ 保持 previousEnabled 并给出可见错误。
 */
export function shellJudgeToggleResult(
  previousEnabled: boolean,
  res: unknown,
  locale: Locale = DEFAULT_LOCALE,
): { enabled: boolean; error: string } {
  const prev = previousEnabled === true;
  const record =
    res && typeof res === "object" ? (res as Record<string, unknown>) : null;
  if (record && record.ok === true && typeof record.enabled === "boolean") {
    return { enabled: record.enabled, error: "" };
  }
  const error =
    record && typeof record.error === "string" && record.error !== ""
      ? record.error
      : translate(locale, "ui.judge.toggleFailed");
  return { enabled: prev, error };
}

/** 开关可用性：四个桥方法齐备才算可用（两组合格按各自契约判定）。 */
export interface JudgeBridgeLike {
  getShellJudgeState?: unknown;
  setShellJudgeEnabled?: unknown;
  onShellJudgeState?: unknown;
  onShellJudgeResult?: unknown;
  getDecisionJudgeState?: unknown;
  setDecisionJudgeEnabled?: unknown;
  onDecisionJudgeState?: unknown;
  onOperatorJudgeResult?: unknown;
}

export function judgeBridgeAvailable(
  bridge: JudgeBridgeLike | null,
  group: JudgeGroup,
): boolean {
  if (!bridge) return false;
  if (group === JUDGE_GROUP_DECISION) {
    return (
      typeof bridge.getDecisionJudgeState === "function" &&
      typeof bridge.setDecisionJudgeEnabled === "function" &&
      typeof bridge.onDecisionJudgeState === "function" &&
      typeof bridge.onOperatorJudgeResult === "function"
    );
  }
  return (
    typeof bridge.getShellJudgeState === "function" &&
    typeof bridge.setShellJudgeEnabled === "function" &&
    typeof bridge.onShellJudgeState === "function" &&
    typeof bridge.onShellJudgeResult === "function"
  );
}

// —————— shell 判断结果行视图（§9.3；manual/未知裁决 ⇒ null）——————

export interface ShellJudgeResultView {
  verdict: "allow" | "deny";
  denyOverride: boolean;
  title: string;
  label: string;
  summary: string;
  engineText: string;
  operatorText: string;
  tierText: string;
  at: string;
  lines: string[];
  retryHint: string;
  toolCallId: string;
  details: {
    command: string;
    cwd: string;
    reason: string;
    alternative: string;
    customerMessage: string;
    customerMessageSynthesized: boolean;
    evidence: string[];
    hardDenyOverride: boolean;
    toolCallId: string;
  };
}

export function shellJudgeResultView(
  payload: unknown,
  locale: Locale = DEFAULT_LOCALE,
): ShellJudgeResultView | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const verdict = record.verdict;
  if (verdict !== "allow" && verdict !== "deny") return null; // manual 不产生结果行
  const engine = str(record.engine);
  const hardDeny =
    record.hardDenyOverride === true ||
    (verdict === "allow" && record.tier === "deny");
  const summary = str(record.summary) || translate(locale, "ui.judge.summaryFallback");
  const reason = str(record.reason);
  const customerMessage = str(record.customerMessage);
  const alt =
    record.alternative && typeof record.alternative === "object"
      ? (record.alternative as Record<string, unknown>)
      : null;
  const altValue = alt ? str(alt.value) : "";
  const altText = altValue
    ? alt && str(alt.rationale)
      ? translate(locale, "ui.judge.alternativeWithRationale", {
          value: altValue,
          rationale: str(alt.rationale),
        })
      : translate(locale, "ui.judge.alternative", { value: altValue })
    : "";
  const operator = str(record.operator) || (engine ? "judge:" + engine : "judge");
  const tierText =
    record.tier === "risky" || record.tier === "review" || record.tier === "deny"
      ? translate(locale, "ui.judge.tierLine", { tier: record.tier })
      : "";
  const lines: string[] = [];
  if (verdict === "allow") {
    if (hardDeny) {
      lines.push(translate(locale, "ui.judge.hardDenyNote"));
    }
  } else {
    if (reason) lines.push(translate(locale, "ui.judge.reasonLine", { reason }));
    if (altText) lines.push(altText);
    if (customerMessage) lines.push(customerMessage);
  }
  return {
    verdict,
    denyOverride: hardDeny,
    title:
      verdict === "allow"
        ? hardDeny
          ? translate(locale, "ui.judge.approvedHardDeny")
          : translate(locale, "ui.judge.approved")
        : translate(locale, "ui.judge.notApproved"),
    label: hardDeny
      ? str(record.label) || translate(locale, "ui.judge.hardDenyLabel")
      : "",
    summary,
    engineText: translate(locale, "ui.judge.engineText", {
      engine: shellJudgeEngineLabel(engine, locale),
    }),
    operatorText: "operator:" + operator,
    tierText,
    at: str(record.at),
    lines,
    retryHint:
      verdict === "deny"
        ? translate(locale, "ui.judge.closeAndRetry")
        : "",
    toolCallId: str(record.toolCallId),
    details: {
      command: str(record.command),
      cwd: str(record.cwd),
      reason,
      alternative: altText,
      customerMessage,
      customerMessageSynthesized: record.customerMessageSynthesized === true,
      evidence: stringList(record.evidence),
      hardDenyOverride: hardDeny,
      toolCallId: str(record.toolCallId),
    },
  };
}

// —————— 治理代批结果行视图（`session:operator-judge`）——————

export type GovernanceJudgeKindClass =
  | "proposal"
  | "acceptance"
  | "appointment"
  | "write"
  | "generic";

export interface GovernanceJudgeResultView {
  group: JudgeGroup;
  groupLabel: string;
  cardKind: string;
  /** 展示分类（只用于卡片样式，不改变任何语义字段）。 */
  kindClass: GovernanceJudgeKindClass;
  /** 该行始终是自动代批（judge），用于显式区分客户手批。 */
  isAuto: true;
  /** 来源徽标（共享 i18n：自动代理）。 */
  sourceLabel: string;
  /** 「自动代批 ≠ 客户手批」说明（共享 i18n）。 */
  customerNote: string;
  title: string;
  badge: string;
  headline: string;
  engineText: string;
  operatorText: string;
  flowText: string;
  at: string;
  lines: string[];
  toolCallId: string;
  requestId: string;
  details: {
    reason: string;
    selected: string[];
    paths: string[];
    pathDecisions: Array<{ path: string; ok: boolean; reason: string }>;
    evidence: string[];
    durationMs: number | null;
    readCalls: number | null;
    readBytes: number | null;
    toolCallId: string;
    requestId: string;
    flowId: string;
  };
}

function governanceJudgeKindClass(cardKind: string): GovernanceJudgeKindClass {
  if (cardKind === "proposal") return "proposal";
  if (cardKind === "acceptance") return "acceptance";
  if (cardKind === "appointment") return "appointment";
  if (
    cardKind === "write" ||
    cardKind === "appointment-write" ||
    cardKind === "schedule-write"
  ) {
    return "write";
  }
  return "generic";
}

export function governanceJudgeResultView(
  payload: unknown,
  locale: Locale = DEFAULT_LOCALE,
): GovernanceJudgeResultView | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const group = str(record.group);
  if (group !== JUDGE_GROUP_APPROVAL && group !== JUDGE_GROUP_DECISION) return null;
  const cardKind = str(record.cardKind);
  const engine = str(record.engine);
  const flowId = str(record.flowId);
  const selected = stringList(record.selected);
  const paths = stringList(record.paths);
  const evidence = stringList(record.evidence);
  const pathDecisions = Array.isArray(record.pathDecisions)
    ? record.pathDecisions
        .filter(
          (item): item is Record<string, unknown> =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).path === "string" &&
            (item as Record<string, unknown>).path !== "",
        )
        .map((item) => ({
          path: str(item.path),
          ok: item.ok === true,
          reason: str(item.reason),
        }))
    : [];
  const groupLabel = judgeGroupLabel(group, locale);
  const selection = selected.length
    ? selected.join(locale === "zh-CN" ? "、" : ", ")
    : "accept";
  let headline = "";
  if (cardKind === "proposal") {
    headline = translate(locale, "ui.judge.headline.acceptProposal", { selected: selection });
  } else if (cardKind === "acceptance") {
    headline = translate(locale, "ui.judge.headline.acceptance", { selected: selection });
  } else if (cardKind === "appointment") {
    headline = selected.length
      ? translate(locale, "ui.judge.headline.appointment", { selected: selection })
      : translate(locale, "ui.judge.headline.appointmentNotReported");
  } else if (
    cardKind === "write" ||
    cardKind === "appointment-write" ||
    cardKind === "schedule-write"
  ) {
    const pathCount = paths.length;
    const shownPaths = paths.slice(0, 3).join(locale === "zh-CN" ? "、" : ", ");
    headline = pathCount
      ? pathCount > 3
        ? translate(locale, "ui.judge.headline.writeConfirmOverflow", {
            count: pathCount,
            paths: shownPaths,
          })
        : translate(locale, "ui.judge.headline.writeConfirm", {
            count: pathCount,
            paths: shownPaths,
            tail: "",
          })
      : translate(locale, "ui.judge.headline.writeNotReported");
  } else {
    headline = cardKind
      ? translate(locale, "ui.judge.headline.autoApprovedWithKind", { cardKind })
      : translate(locale, "ui.judge.headline.autoApproved");
  }
  if (flowId) headline += translate(locale, "ui.judge.flowSuffix", { flowId });
  const lines: string[] = [];
  const reason = str(record.reason);
  if (reason) lines.push(translate(locale, "ui.judge.reasonLine", { reason }));
  if (
    selected.length &&
    cardKind !== "appointment" &&
    cardKind !== "proposal" &&
    cardKind !== "acceptance"
  ) {
    lines.push(translate(locale, "ui.judge.selectedLine", { items: selection }));
  }
  if (
    paths.length &&
    cardKind !== "write" &&
    cardKind !== "appointment-write" &&
    cardKind !== "schedule-write"
  ) {
    lines.push(
      translate(locale, "ui.judge.pathsLine", {
        paths: paths.join(locale === "zh-CN" ? "、" : ", "),
      }),
    );
  }
  const durationMs =
    typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
      ? record.durationMs
      : null;
  const readCalls =
    typeof record.readCalls === "number" && Number.isFinite(record.readCalls)
      ? record.readCalls
      : null;
  const readBytes =
    typeof record.readBytes === "number" && Number.isFinite(record.readBytes)
      ? record.readBytes
      : null;
  return {
    group,
    groupLabel,
    cardKind,
    kindClass: governanceJudgeKindClass(cardKind),
    isAuto: true,
    sourceLabel: translate(locale, "ui.judge.autoSource"),
    customerNote: translate(locale, "ui.judge.autoNotCustomerNote"),
    title: translate(locale, "ui.judge.titlePrefix", { label: groupLabel }),
    badge: groupLabel,
    headline,
    engineText: translate(locale, "ui.judge.engineText", {
      engine: shellJudgeEngineLabel(engine, locale),
    }),
    operatorText: "operator:" + (engine ? "judge:" + engine : "judge"),
    flowText: flowId ? translate(locale, "ui.judge.flowText", { flowId }) : "",
    at: str(record.at),
    lines,
    toolCallId: str(record.toolCallId),
    requestId: str(record.requestId),
    details: {
      reason,
      selected,
      paths,
      pathDecisions,
      evidence,
      durationMs,
      readCalls,
      readBytes,
      toolCallId: str(record.toolCallId),
      requestId: str(record.requestId),
      flowId,
    },
  };
}

// —————— 恢复确认卡动作映射（未知动作 ⇒ null，只呈现原始 token）——————

export function recoveryActionView(
  action: unknown,
  locale: Locale = DEFAULT_LOCALE,
): { label: string; note: string } | null {
  if (action === "abort-turn") {
    return {
      label: translate(locale, "shared.common.stopTurn"),
      note: translate(locale, "ui.judge.recovery.stopNote"),
    };
  }
  if (action === "rebuild-session") {
    return {
      label: translate(locale, "shared.common.rebuildSession"),
      note: translate(locale, "ui.judge.recovery.rebuildNote"),
    };
  }
  if (action === "redeliver") {
    return {
      label: translate(locale, "ui.judge.recovery.redeliver"),
      note: translate(locale, "ui.judge.recovery.redeliverNote"),
    };
  }
  return null;
}

/** 恢复卡提议时间的本地显示（解析不了 ⇒ 空——不假装有时间）。 */
export function recoveryTimeText(at: unknown): string {
  if (typeof at !== "string" || at === "") return "";
  const value = new Date(at);
  return Number.isNaN(value.getTime()) ? "" : value.toLocaleString();
}

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
import type { ShellEscalationAction } from "../lib/platform.ts";

export type { ShellEscalationAction } from "../lib/platform.ts";

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
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
// draft/crew/steward 与 `ui.role.governance.*.name` 逐字相同，复用；chief/product/verifier
// 使用 judge 专用 key（不改 roleId/GovernanceFunction）。
const GOVERNANCE_ROLE_NAME_KEYS: Record<string, MessageKey> = {
  chief: "ui.judge.roleName.chief",
  product: "ui.judge.roleName.product",
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

// —————— shell 判拒升级卡视图（2026-10-31 判拒升级方案 v1.3 §7.1/§7.3）——————
// 渲染侧只把主进程给出的判拒事实转写为卡面视图；`necessity` 是**角色提供的不可信文本**，
// 只在独立区块原样展示并附应用生成的 `necessityNote`，绝不作为标题/选项来源。

const SHELL_ESCALATION_ACTIONS: readonly ShellEscalationAction[] = [
  "allow-once",
  "allow-session",
  "deny",
];

/** `shell:confirm-request` 载荷是否为升级卡（C1 冻结：`kind:"escalation"`）。 */
export function isShellEscalationPayload(payload: unknown): boolean {
  return asRecord(payload).kind === "escalation";
}

/** 卡族路由：缺省（旧主进程无 `kind`）按既有审批卡处理。 */
export function shellConfirmKind(
  payload: unknown,
): "approval" | "escalation" {
  return isShellEscalationPayload(payload) ? "escalation" : "approval";
}

export interface ShellEscalationActionView {
  action: ShellEscalationAction;
  label: string;
}

/** 升级卡「脚本上下文」中的单个脚本（判拒时 judge 所依据的有界内容；全部为不可信数据）。 */
export interface ShellEscalationScriptView {
  /** React key（仅展示用；path/label 与序号组合）。 */
  key: string;
  /** 脚本路径；内联代码无 path 时用 label。 */
  path: string;
  label: string;
  /** 「脚本：{path}」整行（A3 `ui.confirm.escalation.contextPath`）。 */
  pathLine: string;
  sha256: string;
  /** 「sha256：{sha}」整行（A3 `ui.confirm.escalation.contextSha`）。 */
  shaLine: string;
  /** 有界内容（原样展示，React 转义）。 */
  content: string;
  bytes: number;
  /** false = 不在请求角色写区内（judge 需重点核对）。 */
  inWriteArea?: boolean;
  /** inWriteArea===false 时的警示文案（既有 i18n key；不硬编码）。 */
  outsideWriteWarning: string;
}

/** 升级卡「脚本上下文」区块视图（`approvalContext`；缺失/非法 ⇒ null，旧卡兼容）。 */
export interface ShellEscalationContextView {
  header: string;
  /** 「说明：{note}」整行（无 note ⇒ 空串）。 */
  noteLine: string;
  /** 「npm 脚本：{name}」整行（无 npm 脚本 ⇒ 空串）。 */
  npmScriptLine: string;
  scripts: ShellEscalationScriptView[];
}

export interface ShellEscalationView {
  title: string;
  intro: string;
  judgeHeader: string;
  /** judge 判拒理由（原文；空串 = 未报告）。 */
  judgeReason: string;
  /** 「判断理由：…」整行（空串 = 未报告）。 */
  judgeReasonLine: string;
  judgeCustomerMessage: string;
  /** 替代方案整句（空串 = 未报告）。 */
  judgeAlternative: string;
  necessityHeader: string;
  /** 角色提供的必要性说明（不可信文本，原样展示）。 */
  necessity: string;
  /** 「由角色提供，未经验证」固定标注（应用生成 / A3 i18n）。 */
  necessityNote: string;
  /** 「客户手批 ≠ judge 放行」固定声明（应用生成 / A3 i18n）。 */
  customerNotJudgeNote: string;
  command: string;
  argvLines: string[];
  cwd: string;
  /** 判拒时的有界脚本上下文（缺失/空/非法 ⇒ null：不渲染区块，旧卡兼容）。 */
  approvalContext: ShellEscalationContextView | null;
  actions: ShellEscalationActionView[];
  note: string;
  pauseLabel: string;
  expiredHint: string;
  requestId: string;
}

function escalationActionViews(
  record: Record<string, unknown>,
  locale: Locale,
): ShellEscalationActionView[] {
  const requested = stringList(record.actions).filter(
    (item): item is ShellEscalationAction =>
      item === "allow-once" || item === "allow-session" || item === "deny",
  );
  const selected =
    requested.length > 0
      ? SHELL_ESCALATION_ACTIONS.filter((action) => requested.indexOf(action) >= 0)
      : SHELL_ESCALATION_ACTIONS.slice();
  return selected.map((action) => ({
    action,
    label: translate(
      locale,
      action === "allow-once"
        ? "ui.confirm.escalation.allowOnce"
        : action === "allow-session"
          ? "ui.confirm.escalation.allowSession"
          : "ui.confirm.escalation.reject",
    ),
  }));
}

/** inWriteArea===false 的警示文案：复用既有「不在可写范围内」key（A3 未新增专用 key）。 */
const WRITE_BOUNDARY_WARNING_KEY: MessageKey =
  "main.customerInput.writePreauthorization.reason.boundary";

/**
 * `approvalContext` → 脚本上下文视图（E2 返工 R1；方案 §4.3/§7.1）。
 * 只读卡载荷、不做任何风险判定；内容/路径/标签均视为不可信数据原样展示。
 * 缺失、非对象、或没有任何可展示内容 ⇒ null（不渲染区块，旧卡兼容）。
 */
function escalationContextView(
  record: Record<string, unknown>,
  locale: Locale,
): ShellEscalationContextView | null {
  const raw = record.approvalContext;
  if (!raw || typeof raw !== "object") return null;
  const context = raw as Record<string, unknown>;
  const note = str(context.note);
  const npmScriptName = str(context.npmScriptName);
  const rawScripts = Array.isArray(context.scripts) ? context.scripts : [];
  const scripts: ShellEscalationScriptView[] = [];
  for (let index = 0; index < rawScripts.length; index += 1) {
    const item = rawScripts[index];
    if (!item || typeof item !== "object") continue;
    const script = item as Record<string, unknown>;
    const pathValue = str(script.path);
    const label = str(script.label);
    const displayPath = pathValue || label;
    const sha256 = str(script.sha256);
    // 最少要有可标识的路径/标签与 sha256，否则不作为脚本条目展示（不编造）。
    if (!displayPath || !sha256) continue;
    const content = typeof script.content === "string" ? script.content : "";
    const bytes =
      typeof script.bytes === "number" &&
      Number.isFinite(script.bytes) &&
      script.bytes >= 0
        ? script.bytes
        : 0;
    const inWriteArea =
      typeof script.inWriteArea === "boolean" ? script.inWriteArea : undefined;
    scripts.push({
      key: displayPath + ":" + index,
      path: displayPath,
      label,
      pathLine: translate(locale, "ui.confirm.escalation.contextPath", {
        path: displayPath,
      }),
      sha256,
      shaLine: translate(locale, "ui.confirm.escalation.contextSha", {
        sha: sha256,
      }),
      content,
      bytes,
      ...(inWriteArea !== undefined ? { inWriteArea } : {}),
      outsideWriteWarning:
        inWriteArea === false
          ? translate(locale, WRITE_BOUNDARY_WARNING_KEY)
          : "",
    });
  }
  if (!note && !npmScriptName && scripts.length === 0) return null;
  return {
    header: translate(locale, "ui.confirm.escalation.contextHeader"),
    noteLine: note
      ? translate(locale, "ui.confirm.escalation.contextNote", { note })
      : "",
    npmScriptLine: npmScriptName
      ? translate(locale, "ui.confirm.escalation.contextNpmScript", {
          name: npmScriptName,
        })
      : "",
    scripts,
  };
}

/**
 * 升级卡视图（非升级卡载荷 ⇒ null）。所有字段取自主进程卡载荷（C1 冻结的
 * `ShellEscalationIpcCard`）；旧/缺省字段如实降级（argvLines 缺失时用 argv、
 * necessityNote/customerNotJudgeNote 缺失时用 A3 固定文案——不改变语义）。
 */
export function shellEscalationView(
  payload: unknown,
  locale: Locale = DEFAULT_LOCALE,
): ShellEscalationView | null {
  if (!isShellEscalationPayload(payload)) return null;
  const record = asRecord(payload);
  const alt = asRecord(record.judgeAlternative);
  const altValue = str(alt.value);
  const altText = altValue
    ? str(alt.rationale)
      ? translate(locale, "ui.judge.alternativeWithRationale", {
          value: altValue,
          rationale: str(alt.rationale),
        })
      : translate(locale, "ui.judge.alternative", { value: altValue })
    : "";
  const argvLines = stringList(record.argvLines);
  const judgeReason = str(record.judgeReason);
  return {
    title: translate(locale, "ui.confirm.escalation.title"),
    intro: translate(locale, "ui.confirm.escalation.intro"),
    judgeHeader: translate(locale, "ui.confirm.escalation.judgeHeader"),
    judgeReason,
    judgeReasonLine: judgeReason
      ? translate(locale, "ui.judge.reasonLine", { reason: judgeReason })
      : "",
    judgeCustomerMessage: str(record.judgeCustomerMessage),
    judgeAlternative: altText,
    necessityHeader: translate(locale, "ui.confirm.escalation.necessityHeader"),
    necessity: str(record.necessity),
    necessityNote:
      str(record.necessityNote) ||
      translate(locale, "ui.confirm.escalation.necessityNote"),
    customerNotJudgeNote:
      str(record.customerNotJudgeNote) ||
      translate(locale, "ui.confirm.escalation.customerNotJudge"),
    command: str(record.command),
    argvLines: argvLines.length > 0 ? argvLines : stringList(record.argv),
    cwd: str(record.cwd),
    approvalContext: escalationContextView(record, locale),
    actions: escalationActionViews(record, locale),
    note: translate(locale, "ui.confirm.escalation.note"),
    pauseLabel: translate(locale, "ui.confirm.escalation.pauseSession"),
    expiredHint: translate(locale, "ui.confirm.escalation.expired"),
    requestId: str(record.requestId),
  };
}

/** 升级卡回包载荷（`{kind:"escalation", id, action}`；preload 方法只接受这三个动作）。 */
export function shellEscalationResponsePayload(
  id: string,
  action: ShellEscalationAction,
): { kind: "escalation"; id: string; action: ShellEscalationAction } {
  return { kind: "escalation", id, action };
}

export interface ShellEscalationResponseOutcome {
  /** true = 收起卡片；false = 保留卡片（升级卡按现有 shell 卡口径收起）。 */
  close: boolean;
  /** true = 主进程回执该申请已失效（未获允许）。 */
  expired: boolean;
  /** 如实提示（空串 = 不提示）。 */
  hint: string;
}

/** 升级卡回包 → 收起/提示（未知/过期/非法动作由主进程按 expired 回执，绝不放行）。 */
export function shellEscalationResponseOutcome(
  res: unknown,
  locale: Locale = DEFAULT_LOCALE,
): ShellEscalationResponseOutcome {
  const record = asRecord(res);
  if (record.ok === true) return { close: true, expired: false, hint: "" };
  if (record.expired === true) {
    return {
      close: true,
      expired: true,
      hint: translate(locale, "ui.confirm.escalation.expired"),
    };
  }
  return {
    close: true,
    expired: false,
    hint: translate(locale, "ui.confirm.failedShell"),
  };
}

// —————— 「本次运行暂停自动审批」视图（shell-only；2026-10-31 §4.6/§6.5(e)）——————
// 暂停是应用运行期临时覆盖：不写偏好、不影响治理 approval 组；旧主进程无
// `setShellJudgePaused` ⇒ 能力禁用（available:false），绝不显示假暂停态。

export interface JudgePauseSnapshotLike {
  available?: boolean;
  paused?: boolean;
  busy?: boolean;
  justPaused?: boolean;
  failed?: boolean;
  error?: string;
}

export interface JudgePauseStateView {
  available: boolean;
  paused: boolean;
  busy: boolean;
  justPaused: boolean;
  failed: boolean;
  /** "none" = 当前版本无暂停能力（按钮禁用并给出说明）。 */
  action: "pause" | "resume" | "none";
  error: string;
}

export function judgePauseState(
  snapshot: JudgePauseSnapshotLike | null | undefined,
): JudgePauseStateView {
  const available = snapshot?.available === true;
  const paused = available && snapshot?.paused === true;
  const busy = available && snapshot?.busy === true;
  return {
    available,
    paused,
    busy,
    justPaused: paused && snapshot?.justPaused === true,
    failed: available && snapshot?.failed === true,
    action: !available ? "none" : paused ? "resume" : "pause",
    error: typeof snapshot?.error === "string" ? snapshot.error : "",
  };
}

/** 暂停/恢复回包的自洽化：ok:true 且带布尔 paused ⇒ 采信主进程；其余保持/采用主进程报告的当前值并如实报错。 */
export function judgePauseReplyResult(
  previousPaused: boolean,
  res: unknown,
): { ok: boolean; paused: boolean; error: string } {
  const record = asRecord(res);
  if (record.ok === true && typeof record.paused === "boolean") {
    return { ok: true, paused: record.paused, error: "" };
  }
  return {
    ok: false,
    paused:
      typeof record.paused === "boolean"
        ? record.paused
        : previousPaused === true,
    error: str(record.error),
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
  /** 原始申请标题（主进程随结果行下发）；缺失时面板回退 headline。 */
  requestTitle: string;
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
  if (cardKind === "appointment-write") {
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
  } else if (cardKind === "appointment-write") {
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
  if (paths.length && cardKind !== "appointment-write") {
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
    requestTitle: str(record.requestTitle),
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

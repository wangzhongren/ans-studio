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

export type JudgeGroup = "approval" | "decision";

export const JUDGE_GROUP_APPROVAL: JudgeGroup = "approval";
export const JUDGE_GROUP_DECISION: JudgeGroup = "decision";

const JUDGE_GROUP_LABELS: Record<JudgeGroup, string> = {
  approval: "代审批",
  decision: "代决策",
};

export function judgeGroupLabel(group: string): string {
  return group === JUDGE_GROUP_APPROVAL || group === JUDGE_GROUP_DECISION
    ? JUDGE_GROUP_LABELS[group]
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

const GOVERNANCE_ROLE_NAME_BY_ID: Record<string, string> = {
  liaison: "Lead / 主理",
  rapporteur: "Draft / 提案",
  nominator: "Crew / 组队",
  convener: "Steward / 统筹",
  verifier: "Proof / 验收",
};

export function governanceRoleDisplayNameById(roleId: unknown): string {
  if (typeof roleId !== "string" || roleId === "") return "";
  return GOVERNANCE_ROLE_NAME_BY_ID[roleId] || "";
}

export function shellConfirmTitle(policy: unknown, roleId: unknown): string {
  const roleName = governanceRoleDisplayNameById(roleId);
  if (roleName !== "") return "命令审批 · " + roleName;
  return policy === "su-approval" ? "SU 命令审批" : "shell 命令请求";
}

/** su 审批档位可见标签（未知/缺省 ⇒ 空串，只显示原因与警告，不编档位）。 */
export function suApprovalTierLabel(tier: unknown): string {
  if (tier === "risky") return "风险命令（risky）";
  if (tier === "review") return "未自动判定（review）";
  if (tier === "deny") return "硬拒类（deny）";
  return "";
}

/** 判断引擎展示名（缺省如实「未报告」，不编引擎）。 */
export function shellJudgeEngineLabel(engine: unknown): string {
  if (engine === "claude") return "Claude";
  if (engine === "pi") return "Pi";
  if (engine === "codex") return "Codex";
  return typeof engine === "string" && engine !== "" ? engine : "未报告";
}

// —————— 双开关视图（纯映射）——————

export const SHELL_JUDGE_ON_LABEL = "替我审批中 · 判断 agent";
export const SHELL_JUDGE_OFF_LABEL = "替我审批";
export const DECISION_JUDGE_ON_LABEL = "替我决策中 · 判断 agent";
export const DECISION_JUDGE_OFF_LABEL = "替我决策";
export const JUDGE_BRIDGE_MISSING = "当前版本不支持自动判断，保持手动";
export const DECISION_JUDGE_SINGLE_NOTE = "旧治理模型（single）不支持代决策";

const SHELL_JUDGE_OFF_TITLE =
  "手动逐条确认 shell 命令与 trio 写盘/写卡确认（默认）";
const SHELL_JUDGE_ON_TITLE =
  "判断 agent 先评估 shell 命令与 trio 写盘/写卡确认；可随时关闭";
const DECISION_JUDGE_OFF_TITLE = "手动逐张确认提案接受、任命与验收（默认）";
const DECISION_JUDGE_ON_TITLE =
  "判断 agent 先评估提案接受、任命与验收；可随时关闭";

export const SHELL_JUDGE_WARNING_CLOSE_LABEL = "知道了";
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
): JudgeToggleView {
  const decision = group === JUDGE_GROUP_DECISION;
  const ok = available === true;
  const singleDisabled = decision && options?.singleDisabled === true;
  const on = ok && !singleDisabled && enabled === true;
  const onLabel = decision ? DECISION_JUDGE_ON_LABEL : SHELL_JUDGE_ON_LABEL;
  const offLabel = decision ? DECISION_JUDGE_OFF_LABEL : SHELL_JUDGE_OFF_LABEL;
  const offTitle = decision ? DECISION_JUDGE_OFF_TITLE : SHELL_JUDGE_OFF_TITLE;
  const onTitle = decision ? DECISION_JUDGE_ON_TITLE : SHELL_JUDGE_ON_TITLE;
  return {
    group,
    available: ok,
    enabled: on,
    checked: on,
    singleDisabled,
    disabled: !ok || singleDisabled || busy === true,
    label: ok ? (on ? onLabel : offLabel) : JUDGE_BRIDGE_MISSING,
    title: !ok
      ? JUDGE_BRIDGE_MISSING
      : singleDisabled
        ? DECISION_JUDGE_SINGLE_NOTE
        : on
          ? onTitle
          : offTitle,
    note: ok && singleDisabled ? DECISION_JUDGE_SINGLE_NOTE : "",
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
export function judgeWarningLines(groups: JudgeGroup[]): JudgeWarningLine[] {
  const list = Array.isArray(groups) ? groups : [];
  const approval = list.indexOf(JUDGE_GROUP_APPROVAL) >= 0;
  const decision = list.indexOf(JUDGE_GROUP_DECISION) >= 0;
  const lines: JudgeWarningLine[] = [];
  if (approval) {
    lines.push({
      text: "替我审批中：shell 命令与写盘/写卡确认（write / appointment-write / schedule-write）将由判断 agent 代批。",
      strong: true,
    });
  }
  if (decision) {
    lines.push({
      text: "替我决策中：提案接受、任命、验收将由判断 agent 代批。",
      strong: true,
    });
  }
  lines.push({
    text: "判断 agent 只读项目内代码/文档/角色卡（不含 .env、密钥/凭据、.ans 账本/会话、审计日志与项目外），不写文件、不执行命令；只代你「接受/任命/确认/验收」，不会代你拒绝、要求修改或勾选证据不足的候选；不确定、缺证据、读取失败、引擎不可用、超时或解析失败会按所属开关回落逐张卡，由你决定。",
    strong: false,
  });
  lines.push({
    text: "提案快捷路径（accept-quick）默认不代批；旧治理模型（single/su）的治理方向卡仍逐张确认；single 下写盘确认仍逐张手动。",
    strong: false,
  });
  lines.push({
    text: "每次代批会产生一次模型调用（token/延迟）；结果行与审计会标明「judge 代批 · 代审批/代决策」；可能误判，可随时关闭。",
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
      : "未能确认自动判断开关（通道异常）；保持原状态。";
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

export function shellJudgeResultView(payload: unknown): ShellJudgeResultView | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const verdict = record.verdict;
  if (verdict !== "allow" && verdict !== "deny") return null; // manual 不产生结果行
  const engine = str(record.engine);
  const hardDeny =
    record.hardDenyOverride === true ||
    (verdict === "allow" && record.tier === "deny");
  const summary = str(record.summary) || "无法概括命令；展开查看原文";
  const reason = str(record.reason);
  const customerMessage = str(record.customerMessage);
  const alt =
    record.alternative && typeof record.alternative === "object"
      ? (record.alternative as Record<string, unknown>)
      : null;
  const altValue = alt ? str(alt.value) : "";
  const altText = altValue
    ? "替代方案：" + altValue + (alt && str(alt.rationale) ? "（" + str(alt.rationale) + "）" : "")
    : "";
  const operator = str(record.operator) || (engine ? "judge:" + engine : "judge");
  const tierText =
    record.tier === "risky" || record.tier === "review" || record.tier === "deny"
      ? "档位：" + record.tier
      : "";
  const lines: string[] = [];
  if (verdict === "allow") {
    if (hardDeny) {
      lines.push("该命令属于硬拒类，判断 agent 判定必要后放行；请复核");
    }
  } else {
    if (reason) lines.push("判断理由：" + reason);
    if (altText) lines.push(altText);
    if (customerMessage) lines.push(customerMessage);
  }
  return {
    verdict,
    denyOverride: hardDeny,
    title:
      verdict === "allow"
        ? hardDeny
          ? "已替你放行（判断 agent · 代审批 · deny 档）"
          : "已替你放行（判断 agent · 代审批）"
        : "未放行（判断 agent · 代审批）",
    label: hardDeny ? str(record.label) || "deny 档 · judge 放行" : "",
    summary,
    engineText: "判断引擎：" + shellJudgeEngineLabel(engine),
    operatorText: "operator:" + operator,
    tierText,
    at: str(record.at),
    lines,
    retryHint:
      verdict === "deny"
        ? "可关闭「替我审批」后重试（改为手动确认），或按替代方案调整命令。"
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

export interface GovernanceJudgeResultView {
  group: JudgeGroup;
  groupLabel: string;
  cardKind: string;
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

export function governanceJudgeResultView(
  payload: unknown,
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
  const groupLabel = judgeGroupLabel(group);
  let headline = "";
  if (cardKind === "proposal") {
    headline = "接受提案（" + (selected.length ? selected.join("、") : "accept") + "）";
  } else if (cardKind === "acceptance") {
    headline = "验收通过（" + (selected.length ? selected.join("、") : "accept") + "）";
  } else if (cardKind === "appointment") {
    headline = selected.length ? "任命 " + selected.join("、") : "任命（未报告选中项）";
  } else if (
    cardKind === "write" ||
    cardKind === "appointment-write" ||
    cardKind === "schedule-write"
  ) {
    const pathCount = paths.length;
    headline = pathCount
      ? "确认写入 " +
        pathCount +
        " 个路径（" +
        paths.slice(0, 3).join("、") +
        (pathCount > 3 ? " 等 " + pathCount + " 个" : "") +
        "）"
      : "确认写入（未报告路径）";
  } else {
    headline = "已代批" + (cardKind ? "（" + cardKind + "）" : "");
  }
  if (flowId) headline += " · 流程 " + flowId;
  const lines: string[] = [];
  const reason = str(record.reason);
  if (reason) lines.push("判断理由：" + reason);
  if (
    selected.length &&
    cardKind !== "appointment" &&
    cardKind !== "proposal" &&
    cardKind !== "acceptance"
  ) {
    lines.push("选中项：" + selected.join("、"));
  }
  if (
    paths.length &&
    cardKind !== "write" &&
    cardKind !== "appointment-write" &&
    cardKind !== "schedule-write"
  ) {
    lines.push("路径：" + paths.join("、"));
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
    title: "judge 代批 · " + groupLabel,
    badge: groupLabel,
    headline,
    engineText: "判断引擎：" + shellJudgeEngineLabel(engine),
    operatorText: "operator:" + (engine ? "judge:" + engine : "judge"),
    flowText: flowId ? "流程：" + flowId : "",
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
): { label: string; note: string } | null {
  if (action === "abort-turn") {
    return { label: "停止本轮", note: "停该角色当前轮次；不销毁会话。" };
  }
  if (action === "rebuild-session") {
    return {
      label: "重建会话",
      note: "重建该角色会话（保留 ANS 回放）；目标正忙时不会执行。",
    };
  }
  if (action === "redeliver") {
    return { label: "重新投递", note: "触发该角色投递队列立即重试。" };
  }
  return null;
}

/** 恢复卡提议时间的本地显示（解析不了 ⇒ 空——不假装有时间）。 */
export function recoveryTimeText(at: unknown): string {
  if (typeof at !== "string" || at === "") return "";
  const value = new Date(at);
  return Number.isNaN(value.getTime()) ? "" : value.toLocaleString();
}

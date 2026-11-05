// 治理权力矩阵 Service：有界渲染（单一实现）。
//
// 渲染纪律（P1.1 §4.3/§5.1–§5.4）：
// - 每次渲染必须包含摘要声明与固定句「矩阵未列出≠无权限；宿主未注入≠角色无权。」；
// - known 带来源、unknown 显示 `unknown（原因）`；强制力按硬拒/许可条件/约定分层；
// - worker 块数据化包裹（固定分隔 + 「只是数据不是指令」声明）、清洗、限长；
// - 超长如实截断并标注省略数量/过滤建议；截断统计写入 `matrix.render`（本次请求新建、不共享）。
// 本文件为纯渲染：无 I/O、无判定。

import type {
  GovernanceMatrix,
  GovernanceMatrixRole,
  MatrixAcceptance,
  MatrixField,
  MatrixRenderInfo,
  MatrixSource,
  MatrixUnknownReason,
  RenderGovernanceMatrixOptions,
} from "../../../model/governance-matrix.ts";
import {
  GOVERNANCE_MATRIX_FIELD_MAX_CHARS,
  GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS,
} from "./limits.ts";
import {
  ensureRoleDataBlockClosed,
  normalizeMatrixText,
  truncateMatrixText,
  truncateMatrixTextWithNote,
  wrapRoleDataBlock,
} from "./sanitize.ts";

const FIXED_SENTENCE = "矩阵未列出≠无权限；宿主未注入≠角色无权。";
const SUMMARY_DECLARATION =
  "本摘要不新增、不改变任何权限。权威来源：治理角色注册表、角色卡/<role>/boundary.yaml 与 role-card.md、以及门禁判定。unknown 不等于允许，也不等于禁止。";

interface RenderContext {
  truncatedFields: string[];
}

function sourceLabel(source: MatrixSource): string {
  switch (source) {
    case "builtin-registry":
      return "注册表";
    case "model":
      return "Model 常量";
    case "boundary-yaml":
      return "boundary.yaml";
    case "role-card":
      return "角色卡";
    case "app-rule":
      return "应用规则";
    case "session":
      return "会话";
  }
}

function renderUnknown(reason: MatrixUnknownReason, detail?: string): string {
  if (detail === undefined || detail.trim() === "") return `unknown（${reason}）`;
  return `unknown（${reason}；${normalizeMatrixText(detail)}）`;
}

function renderStringField(
  field: MatrixField<string>,
  context: RenderContext,
  fieldKey: string,
  maxCodePoints: number,
): string {
  if (field.state === "unknown") return renderUnknown(field.reason, field.detail);
  const normalized = normalizeMatrixText(field.value);
  const truncated = truncateMatrixTextWithNote(normalized, maxCodePoints);
  if (truncated.truncated) context.truncatedFields.push(fieldKey);
  return `${truncated.text}（来源：${sourceLabel(field.source)}）`;
}

function renderStringArrayField(
  field: MatrixField<readonly string[]>,
  context: RenderContext,
  fieldKey: string,
  maxCodePoints: number,
): string {
  if (field.state === "unknown") return renderUnknown(field.reason, field.detail);
  const joined = field.value.map((item) => normalizeMatrixText(item)).join("；");
  const truncated = truncateMatrixTextWithNote(joined, maxCodePoints);
  if (truncated.truncated) context.truncatedFields.push(fieldKey);
  return `${truncated.text}（来源：${sourceLabel(field.source)}）`;
}

function renderBooleanField(field: MatrixField<boolean>): string {
  if (field.state === "unknown") return renderUnknown(field.reason, field.detail);
  if (field.value) return `是（来源：${sourceLabel(field.source)}）`;
  return `否（来源：${sourceLabel(field.source)}）`;
}

function renderBooleanShort(field: MatrixField<boolean>): string {
  if (field.state === "unknown") return renderUnknown(field.reason, field.detail);
  if (field.value) return "是";
  return "否";
}

function renderCapabilities(field: MatrixField<Readonly<Record<string, boolean>>>): string {
  if (field.state === "unknown") return renderUnknown(field.reason, field.detail);
  const entries = Object.entries(field.value).map(([key, value]) => {
    if (value) return `${key}=是`;
    return `${key}=否`;
  });
  return `${entries.join("；")}（来源：${sourceLabel(field.source)}）`;
}

function acceptanceText(acceptance: MatrixAcceptance): string {
  if (acceptance.state === "unknown") {
    return renderUnknown(acceptance.reason, acceptance.detail);
  }
  const evidence = normalizeMatrixText(acceptance.evidence);
  if (acceptance.accepted) {
    return `已接受（${evidence}；basis runtime）`;
  }
  return `未接受（${evidence}；basis runtime）`;
}

function boolShort(value: boolean): string {
  if (value) return "是";
  return "否";
}

function rulesText(value: string | null): string {
  if (value === null) return "无";
  return value;
}

function versionChangeText(field: MatrixField<string | null>): string {
  if (field.state === "unknown") return renderUnknown(field.reason, field.detail);
  return rulesText(field.value);
}

function forceText(role: GovernanceMatrixRole, context: RenderContext): string {
  const force = role.force;
  if (force.state === "unknown") return `- 强制力：${renderUnknown(force.reason, force.detail)}`;
  const lines: string[] = [];
  const hardDenyItems = force.value.hardDeny.items;
  if (hardDenyItems.length > 0) {
    lines.push(
      `- 强制力-硬拒（${sourceLabel(force.value.hardDeny.source)}）：${hardDenyItems.join("、")}；${force.value.hardDeny.note}`,
    );
  } else {
    lines.push(`- 强制力-硬拒（${sourceLabel(force.value.hardDeny.source)}）：${force.value.hardDeny.note}`);
  }
  lines.push(
    `- 强制力-许可条件：${force.value.permitConditions.items.join("；")}（${force.value.permitConditions.note}）`,
  );
  const conventions = force.value.conventions;
  if (conventions.unknownReason !== undefined && conventions.items.length === 0) {
    lines.push(
      `- 强制力-约定（${sourceLabel(conventions.source)}）：${renderUnknown(conventions.unknownReason)}；${conventions.note}`,
    );
  } else {
    const truncated = truncateMatrixTextWithNote(
      conventions.items.join("；"),
      GOVERNANCE_MATRIX_FIELD_MAX_CHARS.conventions,
    );
    if (truncated.truncated) context.truncatedFields.push(`${role.roleId}.conventions`);
    lines.push(
      `- 强制力-约定（${sourceLabel(conventions.source)}）：${truncated.text}；${conventions.note}`,
    );
  }
  return lines.join("\n");
}

function customerInteractionText(role: GovernanceMatrixRole): string {
  const interaction = role.customerInteraction;
  if (interaction.state === "unknown") {
    return `- 客户交互：${renderUnknown(interaction.reason, interaction.detail)}`;
  }
  const choice = interaction.value.requestChoice;
  const confirm = interaction.value.requestConfirmation;
  const other = interaction.value.otherInitiation;
  const channelText = (channel: typeof choice): string => {
    let kinds = "无";
    if (channel.cardKinds.items.length > 0) kinds = channel.cardKinds.items.join("/");
    return `卡种=${kinds}（来源：${channel.cardKinds.source}）；角色级=${boolShort(channel.roleLevel.value)}（来源：${channel.roleLevel.source}）；本会话=${channel.session.state}（来源：${channel.session.source}）`;
  };
  return [
    `- 客户交互-choice：${channelText(choice)}`,
    `- 客户交互-confirm：${channelText(confirm)}`,
    `- 其他发起：需求变更=${renderBooleanShort(other.requirementChange)}；版本决定=${renderBooleanShort(other.versionDecision)}；版本变更=${versionChangeText(other.versionChange)}；重构=${renderBooleanShort(other.refactor)}；stable 写入=${renderBooleanShort(other.stableWrite)}；下载=${other.download.session}（${other.download.source}）；shell escalation=${other.shellEscalation.session}（${other.shellEscalation.source}）`,
    `- 客户交互纪律：${normalizeMatrixText(interaction.value.confirmationNote)}`,
  ].join("\n");
}

function writableText(role: GovernanceMatrixRole): string {
  const writable = role.writable;
  if (writable.state === "unknown") {
    return `- 可写：${renderUnknown(writable.reason, writable.detail)}`;
  }
  const entryItems = writable.value.entries.items;
  let entryText = "无声明条目";
  if (entryItems.length > 0) {
    entryText = entryItems
      .map((entry) => `${entry.path}（${entry.kind}，${normalizeMatrixText(entry.purpose)}）`)
      .join("；");
  }
  const preauthorized = writable.value.preauthorized;
  let preauthorizedText = "无";
  if (preauthorized.items.length > 0) preauthorizedText = preauthorized.items.join("、");
  return [
    `- 可写（${sourceLabel(writable.value.entries.source)}）：${entryText}`,
    `- 预授权（${sourceLabel(preauthorized.source)}）：${preauthorizedText}；${preauthorized.note}`,
    `- 边界接受：${acceptanceText(writable.value.acceptance)}`,
  ].join("\n");
}

function roleLines(role: GovernanceMatrixRole, context: RenderContext): string[] {
  const lines: string[] = [];
  lines.push(
    `- 职能定位：${renderStringField(role.duty, context, `${role.roleId}.duty`, GOVERNANCE_MATRIX_FIELD_MAX_CHARS.duty)}`,
  );
  lines.push(writableText(role));
  lines.push(forceText(role, context));
  lines.push(`- 派发（dispatch_task）：${renderBooleanField(role.dispatchTask)}`);
  lines.push(customerInteractionText(role));
  let shellTierText: string;
  if (role.shellTier.state === "known") {
    shellTierText = role.shellTier.value;
  } else {
    shellTierText = renderUnknown(role.shellTier.reason, role.shellTier.detail);
  }
  lines.push(
    `- shell：${shellTierText}（本会话：${role.shellSession.state}，来源：${role.shellSession.source}）`,
  );
  lines.push(
    `- 主链/闸门：${renderStringArrayField(role.mainChain, context, `${role.roleId}.mainChain`, GOVERNANCE_MATRIX_FIELD_MAX_CHARS.mainChain)}`,
  );
  lines.push(`- 其他能力：${renderCapabilities(role.otherCapabilities)}`);
  if (role.governanceFunction !== undefined) {
    lines.push(
      `- 治理职能：${renderStringField(role.governanceFunction, context, `${role.roleId}.governanceFunction`, GOVERNANCE_MATRIX_FIELD_MAX_CHARS.displayName)}`,
    );
  }
  if (role.sourceNotes.length > 0) {
    lines.push(
      `- 来源：${role.sourceNotes.map((note) => `${note.text}（${sourceLabel(note.source)}）`).join("；")}`,
    );
  }
  return lines;
}

function roleHeading(role: GovernanceMatrixRole, context: RenderContext): string {
  if (role.kind === "built-in-governance") {
    if (role.displayName.state === "known") {
      const displayName = truncateMatrixTextWithNote(
        normalizeMatrixText(role.displayName.value),
        GOVERNANCE_MATRIX_FIELD_MAX_CHARS.displayName,
      );
      if (displayName.truncated) context.truncatedFields.push(`${role.roleId}.displayName`);
      return `### ${role.roleId} ${displayName.text}（built-in）`;
    }
    return `### ${role.roleId}（built-in）`;
  }
  if (role.group !== undefined && role.group.state === "known") {
    let displayNameText = "";
    if (role.displayName.state === "known") {
      const displayName = truncateMatrixTextWithNote(
        normalizeMatrixText(role.displayName.value),
        GOVERNANCE_MATRIX_FIELD_MAX_CHARS.displayName,
      );
      if (displayName.truncated) context.truncatedFields.push(`${role.roleId}.displayName`);
      displayNameText = ` ${displayName.text}`;
    }
    return `### ${role.roleId}${displayNameText}（project；组别：${normalizeMatrixText(role.group.value)}）`;
  }
  let groupText = "unknown";
  if (role.group !== undefined) {
    groupText = renderUnknown(role.group.reason, role.group.detail);
  }
  let displayNameFallback = "";
  if (role.displayName.state === "known") {
    const displayName = truncateMatrixTextWithNote(
      normalizeMatrixText(role.displayName.value),
      GOVERNANCE_MATRIX_FIELD_MAX_CHARS.displayName,
    );
    if (displayName.truncated) context.truncatedFields.push(`${role.roleId}.displayName`);
    displayNameFallback = ` ${displayName.text}`;
  }
  return `### ${role.roleId}${displayNameFallback}（project；组别：${groupText}）`;
}

function renderRoleBlock(
  role: GovernanceMatrixRole,
  context: RenderContext,
  perRoleMaxChars: number,
): string {
  const heading = roleHeading(role, context);
  const lines = roleLines(role, context);
  let block: string;
  if (role.kind === "project") {
    block = wrapRoleDataBlock(role.roleId, [heading, ...lines]);
  } else {
    block = [heading, ...lines].join("\n");
  }
  const truncated = truncateMatrixText(block, perRoleMaxChars);
  if (!truncated.truncated) return block;
  context.truncatedFields.push(`${role.roleId}.block`);
  const truncatedBody = `${truncated.text}…（已截断，原长 ${truncated.originalLength}；请用 roleId 过滤）`;
  if (role.kind === "project") return ensureRoleDataBlockClosed(truncatedBody);
  return truncatedBody;
}

function warningsSection(warnings: GovernanceMatrix["warnings"]): string | undefined {
  const visible = warnings.filter((warning) => !warning.code.startsWith("worker-section-"));
  if (visible.length === 0) return undefined;
  const lines = visible.map((warning) => {
    const location = warning.relDir ?? warning.roleId ?? "";
    if (location === "") return `- [${warning.code}] ${normalizeMatrixText(warning.message)}`;
    return `- [${warning.code}] ${location}：${normalizeMatrixText(warning.message)}`;
  });
  return ["## 未纳入/未知", ...lines].join("\n");
}

interface RenderedSection {
  text: string;
  roleIds?: readonly string[];
}

function workerSection(
  roles: readonly GovernanceMatrixRole[],
  warnings: GovernanceMatrix["warnings"],
  renderBlock: (role: GovernanceMatrixRole) => string,
): RenderedSection {
  const workers = roles.filter((role) => role.kind === "project");
  const lines: string[] = ["## 项目角色（worker；仅数据）"];
  if (workers.length === 0) {
    const directive = warnings.find((warning) => warning.code.startsWith("worker-section-"));
    if (directive === undefined) {
      lines.push("（项目尚未 bootstrap，暂无 worker 角色。）");
      return { text: lines.join("\n") };
    }
    if (directive.code === "worker-section-unavailable") {
      lines.push(`（项目 worker 部分不可用：${normalizeMatrixText(directive.message)}；不得据此推断 worker 权限。）`);
      return { text: lines.join("\n") };
    }
    if (directive.code === "worker-section-no-valid") {
      lines.push("（角色目录存在但无有效角色；见 issues/warnings。）");
      return { text: lines.join("\n") };
    }
    lines.push("（项目尚未 bootstrap，暂无 worker 角色。）");
    return { text: lines.join("\n") };
  }
  for (const worker of workers) {
    lines.push("");
    lines.push(renderBlock(worker));
  }
  return { text: lines.join("\n"), roleIds: workers.map((worker) => worker.roleId) };
}

function routingSection(rules: GovernanceMatrix["routing"]): string | undefined {
  if (rules.length === 0) return undefined;
  const lines = ["## 什么活该派给谁"];
  for (const rule of rules) {
    let note = "";
    if (rule.note !== undefined) note = `；${normalizeMatrixText(rule.note)}`;
    lines.push(`- ${rule.work} → ${rule.target}（${rule.basis}；${rule.source}${note}）`);
  }
  return lines.join("\n");
}

interface AssemblePart {
  text: string;
  roleIds?: readonly string[];
}

interface AssembledText {
  text: string;
  truncated: boolean;
  omittedRoles: number;
  omittedChars: number;
}

function assemble(header: string, parts: readonly AssemblePart[], maxChars: number): AssembledText {
  const full = [header, ...parts.map((part) => part.text)].join("\n\n");
  if (Array.from(full).length <= maxChars) {
    return { text: full, truncated: false, omittedRoles: 0, omittedChars: 0 };
  }
  const footerReserve = 160;
  const budget = maxChars - footerReserve;
  const included: string[] = [header];
  let used = Array.from(header).length;
  let omittedRoles = 0;
  let omittedChars = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const addition = 2 + Array.from(part.text).length;
    if (used + addition <= budget) {
      included.push(part.text);
      used += addition;
      continue;
    }
    const remaining = budget - used - 2;
    if (remaining > 0) {
      const truncated = truncateMatrixText(part.text, remaining);
      if (truncated.text !== "") {
        included.push(`${truncated.text}…`);
        used += 2 + Array.from(truncated.text).length + 1;
        omittedChars += truncated.originalLength - Array.from(truncated.text).length;
      } else {
        omittedChars += Array.from(part.text).length;
        if (part.roleIds !== undefined) omittedRoles += part.roleIds.length;
      }
    } else {
      omittedChars += Array.from(part.text).length;
      if (part.roleIds !== undefined) omittedRoles += part.roleIds.length;
    }
    for (let rest = index + 1; rest < parts.length; rest += 1) {
      omittedChars += Array.from(parts[rest].text).length;
      if (parts[rest].roleIds !== undefined) omittedRoles += parts[rest].roleIds!.length;
    }
    const notes = ["已截断"];
    if (omittedRoles > 0) notes.push(`剩余 ${omittedRoles} 个角色未显示`);
    if (omittedChars > 0) notes.push(`省略 ${omittedChars} 字`);
    notes.push("请用 roleId/section 过滤");
    included.push(`…（${notes.join("；")}）`);
    return { text: included.join("\n\n"), truncated: true, omittedRoles, omittedChars };
  }
  return { text: included.join("\n\n"), truncated: true, omittedRoles, omittedChars };
}

function headerLines(matrix: GovernanceMatrix): string[] {
  const lines = [
    "# 治理权力矩阵（运行时派生只读摘要；schema governance-matrix/v1）",
    `> 生成于 ${matrix.generatedAt}；治理模型 trio。`,
    `> ${SUMMARY_DECLARATION}`,
    `> ${FIXED_SENTENCE}`,
  ];
  if (matrix.status === "degraded") {
    lines.push("> 状态：degraded（部分来源不可用；unknown 不等于允许，也不等于禁止）。");
  }
  if (matrix.status === "unavailable") {
    lines.push("> 状态：unavailable（矩阵不可用；不得据此推断任何权限）。");
  }
  return lines;
}

function applyRenderInfo(
  matrix: GovernanceMatrix,
  perRoleMaxChars: number,
  assembled: AssembledText,
  context: RenderContext,
): void {
  const render: MatrixRenderInfo = {
    ...matrix.render,
    perRoleMaxChars,
    truncated: assembled.truncated || context.truncatedFields.length > 0,
    omittedRoles: assembled.omittedRoles,
    omittedChars: assembled.omittedChars,
    truncatedFields: [...new Set(context.truncatedFields)],
  };
  matrix.render = render;
}

/** 有界渲染（单一实现）。 */
export function renderGovernanceMatrix(
  matrix: GovernanceMatrix,
  options: RenderGovernanceMatrixOptions,
): string {
  const perRoleMaxChars = options.perRoleMaxChars ?? GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS;
  const context: RenderContext = { truncatedFields: [] };
  const header = headerLines(matrix).join("\n");

  if (options.roleId !== undefined) {
    const normalizedRoleId = normalizeMatrixText(options.roleId);
    const role = matrix.roles.find((candidate) => candidate.roleId === normalizedRoleId);
    if (role === undefined) {
      const text = [header, `未找到角色 ${normalizedRoleId}（未创建虚拟角色；不展示其他角色数据）`].join("\n\n");
      applyRenderInfo(matrix, perRoleMaxChars, { text, truncated: false, omittedRoles: 0, omittedChars: 0 }, context);
      return text;
    }
    const block = renderRoleBlock(role, context, perRoleMaxChars);
    const text = [header, block].join("\n\n");
    applyRenderInfo(matrix, perRoleMaxChars, { text, truncated: false, omittedRoles: 0, omittedChars: 0 }, context);
    return text;
  }

  const section = options.section ?? "all";
  const builtinRoles = matrix.roles.filter((role) => role.kind === "built-in-governance");
  const renderBlock = (role: GovernanceMatrixRole): string =>
    renderRoleBlock(role, context, perRoleMaxChars);
  const parts: AssemblePart[] = [];
  if (section === "all" || section === "roles") {
    if (builtinRoles.length > 0) {
      const lines = [`## 内置治理角色（${builtinRoles.length}）`];
      for (const role of builtinRoles) {
        lines.push("");
        lines.push(renderBlock(role));
      }
      parts.push({ text: lines.join("\n"), roleIds: builtinRoles.map((role) => role.roleId) });
    }
    parts.push(workerSection(matrix.roles, matrix.warnings, renderBlock));
    const warningText = warningsSection(matrix.warnings);
    if (warningText !== undefined) parts.push({ text: warningText });
  }
  if (section === "all" || section === "routing") {
    const routingText = routingSection(matrix.routing);
    if (routingText !== undefined) parts.push({ text: routingText });
  }

  const assembled = assemble(header, parts, options.maxChars);
  applyRenderInfo(matrix, perRoleMaxChars, assembled, context);
  return assembled.text;
}

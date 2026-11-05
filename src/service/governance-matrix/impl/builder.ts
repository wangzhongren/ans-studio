// 治理权力矩阵 Service：纯组装（输入 → GovernanceMatrix）。
//
// 纪律（AC-6/AC-10）：
// - 不调用其他 Service、不读盘/写盘、不写账本/事件、不缓存、不读时钟（`generatedAt` 用输入）。
// - 只读 Model（governance-matrix / version-change）与同角色私有 common（注册表、角色卡解析标记）。
// - 卡种只消费 Pipeline 传入的 `cardKindsByRole` 快照；不复制第二张 role→cardKinds 表。
// - 测试 seam：`buildGovernanceMatrixWith(input, builtins)` 只在 impl 层；`buildGovernanceMatrix`
//   生产固定使用真实 `BUILT_IN_GOVERNANCE_ROLES`，不向调用方暴露注册表参数（G-5c）。

import type {
  GovernanceMatrix,
  GovernanceMatrixInput,
  GovernanceMatrixRole,
  MatrixAcceptance,
  MatrixCustomerInteraction,
  MatrixField,
  MatrixForce,
  MatrixOtherInitiation,
  MatrixRequestChannel,
  MatrixSource,
  MatrixUnknownReason,
  MatrixWarning,
  WorkerRoleInput,
} from "../../../model/governance-matrix.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
} from "../../../common/门禁引擎/governance-roles.ts";
import type {
  BuiltInGovernanceRoleSpec,
} from "../../../common/门禁引擎/governance-roles.ts";
import {
  REFACTOR_REQUESTED_BY,
  VERSION_CHANGE_INITIATOR_BY_KIND,
} from "../../../model/version-change.ts";
import {
  GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS,
  GOVERNANCE_MATRIX_PROMPT_MAX_CHARS,
  GOVERNANCE_MATRIX_TOOL_MAX_CHARS,
} from "./limits.ts";
import { buildRouting } from "./routing.ts";

/** 许可条件（所有角色适用；满足条件才可写，不是角色权力）。 */
const PERMIT_CONDITIONS: readonly string[] = Object.freeze([
  "stable 文件（workflow/role-card/boundary）写入需一次性客户许可（stableWriteDecision）",
  "版本化文档需未冻结或写入新版本（versionedDocOverwriteDecision）",
]);

/** 客户交互固定说明（确认方永远是客户/判断 agent；角色不能自批/代选；矩阵不是批准）。 */
const CONFIRMATION_NOTE =
  "确认方永远是客户/判断 agent；角色不能自批、不能代选；矩阵不是批准，也不是验收证据。";

function knownField<T>(value: T, source: MatrixSource): MatrixField<T> {
  return { state: "known", value, source };
}

function unknownField(
  reason: MatrixUnknownReason,
  source: MatrixSource,
  detail?: string,
): MatrixField<never> {
  if (detail === undefined) return { state: "unknown", reason, source };
  return { state: "unknown", reason, detail, source };
}

function acceptanceOf(input: GovernanceMatrixInput, roleId: string): MatrixAcceptance {
  const acceptance = input.acceptanceByRole[roleId];
  if (acceptance !== undefined) return acceptance;
  return {
    state: "unknown",
    reason: "acceptance-unavailable",
    detail: "该角色不在开会话时的 ProjectConfig.roles 快照中；请重开会话",
  };
}

function sessionState(available: boolean): "available" | "unavailable" {
  if (available) return "available";
  return "unavailable";
}

function channelSession(available: boolean): MatrixRequestChannel["session"] {
  if (available) {
    return { state: "available", source: "session-snapshot", note: "本会话已注入（宿主通道）" };
  }
  return { state: "unavailable", source: "session-snapshot", note: "本会话未注入（宿主通道）" };
}

function downloadChannel(input: GovernanceMatrixInput): MatrixOtherInitiation["download"] {
  return {
    roleLevel: false,
    session: sessionState(input.session.download),
    source: "session",
    note: "应用通道 request_download；按会话注入（宿主未注入≠角色无权）",
  };
}

function shellEscalationChannel(
  input: GovernanceMatrixInput,
): MatrixOtherInitiation["shellEscalation"] {
  return {
    roleLevel: false,
    session: sessionState(input.session.shellEscalation),
    source: "session",
    note: "shell 提权由宿主按会话注入（宿主未注入≠角色无权）",
  };
}

function requestChannel(
  roleLevelValue: boolean,
  roleLevelSource: MatrixRequestChannel["roleLevel"]["source"],
  cardKinds: readonly string[],
  sessionAvailable: boolean,
): MatrixRequestChannel {
  return {
    roleLevel: { value: roleLevelValue, source: roleLevelSource },
    cardKinds: { items: [...cardKinds], source: "app-rule" },
    session: channelSession(sessionAvailable),
  };
}

function versionChangeOf(roleId: string): MatrixField<string | null> {
  for (const [kind, initiator] of Object.entries(VERSION_CHANGE_INITIATOR_BY_KIND)) {
    if (initiator === roleId) return knownField(kind, "model");
  }
  return knownField(null, "model");
}

function initiationSnapshotField(
  input: GovernanceMatrixInput,
  roleId: string,
  key: "requirementChange" | "versionDecision" | "stableWrite",
): MatrixField<boolean> {
  const snapshot = input.initiationByRole[roleId];
  if (snapshot === undefined) {
    return unknownField("not-declared-in-source", "app-rule", "缺少 run-role 角色门控快照");
  }
  return knownField(snapshot[key], "app-rule");
}

function builtInCustomerInteraction(
  spec: BuiltInGovernanceRoleSpec,
  input: GovernanceMatrixInput,
): MatrixCustomerInteraction {
  const snapshot = input.cardKindsByRole[spec.id];
  let choice: readonly string[] = [];
  let confirm: readonly string[] = [];
  if (snapshot !== undefined) {
    choice = snapshot.choice;
    confirm = snapshot.confirm;
  }
  return {
    requestChoice: requestChannel(
      spec.capabilities.customerInput,
      "registry-capability",
      choice,
      input.session.customerInput,
    ),
    requestConfirmation: requestChannel(
      spec.capabilities.customerInput,
      "registry-capability",
      confirm,
      input.session.customerInput,
    ),
    otherInitiation: {
      requirementChange: initiationSnapshotField(input, spec.id, "requirementChange"),
      versionDecision: initiationSnapshotField(input, spec.id, "versionDecision"),
      versionChange: versionChangeOf(spec.id),
      refactor: knownField(REFACTOR_REQUESTED_BY === spec.id, "model"),
      stableWrite: initiationSnapshotField(input, spec.id, "stableWrite"),
      download: downloadChannel(input),
      shellEscalation: shellEscalationChannel(input),
    },
    confirmationNote: CONFIRMATION_NOTE,
  };
}

function builtInForce(spec: BuiltInGovernanceRoleSpec): MatrixForce {
  const discipline = spec.matrix.cardDiscipline;
  let conventions: MatrixForce["conventions"];
  if (discipline !== undefined && discipline.length > 0) {
    conventions = {
      items: [...discipline],
      source: "builtin-registry",
      note: "卡面纪律短摘录（只读展示，不参与判定）",
    };
  } else {
    conventions = {
      items: [],
      source: "builtin-registry",
      note: "注册表未提供卡面纪律摘录（可选展示字段）",
      unknownReason: "not-declared-in-source",
    };
  }
  return {
    hardDeny: {
      items: [...spec.forbiddenWritePaths],
      source: "builtin-registry",
      note: "先于 resolveWrite 判定；命中即拒",
    },
    permitConditions: {
      items: [...PERMIT_CONDITIONS],
      source: "app-rule",
      note: "满足条件才可写，不是角色权力",
    },
    conventions,
  };
}

function buildBuiltInRole(
  spec: BuiltInGovernanceRoleSpec,
  input: GovernanceMatrixInput,
): GovernanceMatrixRole {
  const dutyText = spec.matrix.duty.trim();
  let duty: MatrixField<string>;
  if (dutyText === "") {
    duty = unknownField("not-declared-in-source", "builtin-registry", "注册表未提供 duty 摘要");
  } else {
    duty = knownField(dutyText, "builtin-registry");
  }
  let mainChain: MatrixField<readonly string[]>;
  if (spec.matrix.mainChain.length === 0) {
    mainChain = unknownField("not-declared-in-source", "builtin-registry", "注册表未提供 mainChain 摘要");
  } else {
    mainChain = knownField([...spec.matrix.mainChain], "builtin-registry");
  }
  return {
    roleId: spec.id,
    kind: "built-in-governance",
    displayName: knownField(spec.displayName, "builtin-registry"),
    governanceFunction: knownField(spec.function, "builtin-registry"),
    duty,
    writable: {
      state: "known",
      value: {
        entries: {
          items: spec.entries.map((entry) => ({
            path: entry.path,
            kind: entry.kind,
            purpose: entry.purpose,
          })),
          source: "builtin-registry",
        },
        preauthorized: {
          items: [...spec.preauthorizedDirs],
          source: "builtin-registry",
          note: "会话初始 writeSet 预置目录；预授权 ≠ 跳过 F4/F6/F7 与禁写",
        },
        acceptance: acceptanceOf(input, spec.id),
      },
    },
    force: { state: "known", value: builtInForce(spec) },
    dispatchTask: knownField(spec.capabilities.dispatchTask, "builtin-registry"),
    customerInteraction: {
      state: "known",
      value: builtInCustomerInteraction(spec, input),
    },
    shellTier: knownField(spec.capabilities.shell, "builtin-registry"),
    shellSession: {
      state: sessionState(input.session.shell),
      source: "session",
      note: "宿主注入；宿主未注入≠角色无权",
    },
    mainChain,
    otherCapabilities: knownField(
      {
        roleStatus: spec.capabilities.roleStatus,
        sessionTail: spec.capabilities.sessionTail,
        installSkill: spec.capabilities.installSkill,
        installMcp: spec.capabilities.installMcp,
      },
      "builtin-registry",
    ),
    sourceNotes: [{ text: "governance-roles.ts 内置注册表", source: "builtin-registry" }],
  };
}

function nonEmptySections(parts: ReadonlyArray<string | undefined>): string[] {
  const result: string[] = [];
  for (const part of parts) {
    if (part === undefined) continue;
    const trimmed = part.trim();
    if (trimmed !== "") result.push(trimmed);
  }
  return result;
}

function workerDuty(cardSections: WorkerRoleInput["cardSections"]): MatrixField<string> {
  const parts = nonEmptySections([cardSections?.ability, cardSections?.responsibility]);
  if (parts.length === 0) {
    return unknownField(
      "card-section-missing",
      "role-card",
      "角色卡缺少「能力描述/职责与功能导航」章节",
    );
  }
  return knownField(parts.join("\n\n"), "role-card");
}

function workerMainChain(cardSections: WorkerRoleInput["cardSections"]): MatrixField<readonly string[]> {
  const parts = nonEmptySections([cardSections?.handoff, cardSections?.workflow]);
  if (parts.length === 0) {
    return unknownField(
      "card-section-missing",
      "role-card",
      "角色卡缺少「交接输入输出/标准工作流」章节",
    );
  }
  return knownField(parts, "role-card");
}

function workerForce(cardSections: WorkerRoleInput["cardSections"]): MatrixForce {
  const principles = nonEmptySections([cardSections?.executionPrinciples]);
  let conventions: MatrixForce["conventions"];
  if (principles.length === 0) {
    conventions = {
      items: [],
      source: "role-card",
      note: "角色卡缺少「执行原则」章节",
      unknownReason: "card-section-missing",
    };
  } else {
    conventions = {
      items: principles,
      source: "role-card",
      note: "角色卡「执行原则」短摘录（只是约定，不是硬门禁）",
    };
  }
  return {
    hardDeny: {
      items: [],
      source: "app-rule",
      note: "无逐角色禁写清单；Section 1 之外一律只读（resolveWrite 拒绝）",
    },
    permitConditions: {
      items: [...PERMIT_CONDITIONS],
      source: "app-rule",
      note: "满足条件才可写，不是角色权力",
    },
    conventions,
  };
}

function workerCustomerInteraction(input: GovernanceMatrixInput): MatrixCustomerInteraction {
  return {
    requestChoice: requestChannel(false, "app-rule", [], input.session.customerInput),
    requestConfirmation: requestChannel(false, "app-rule", [], input.session.customerInput),
    otherInitiation: {
      requirementChange: knownField(false, "app-rule"),
      versionDecision: knownField(false, "app-rule"),
      versionChange: knownField(null, "model"),
      refactor: knownField(false, "model"),
      stableWrite: knownField(false, "app-rule"),
      download: downloadChannel(input),
      shellEscalation: shellEscalationChannel(input),
    },
    confirmationNote: CONFIRMATION_NOTE,
  };
}

function buildWorkerRole(input: GovernanceMatrixInput, worker: WorkerRoleInput): GovernanceMatrixRole {
  const displayNameRaw = worker.displayName?.trim() ?? "";
  const groupRaw = worker.group?.trim() ?? "";
  let displayName: MatrixField<string>;
  let group: MatrixField<string>;
  if (displayNameRaw === "") {
    displayName = unknownField("not-declared-in-source", "role-card", "角色卡缺少 H1 标题");
  } else {
    displayName = knownField(displayNameRaw, "role-card");
  }
  if (groupRaw === "") {
    group = unknownField("not-declared-in-source", "role-card");
  } else {
    group = knownField(groupRaw, "role-card");
  }
  return {
    roleId: worker.roleId,
    kind: "project",
    displayName,
    group,
    duty: workerDuty(worker.cardSections),
    writable: {
      state: "known",
      value: {
        entries: {
          items: worker.boundary.entries.map((entry) => ({ ...entry })),
          source: "boundary-yaml",
        },
        preauthorized: {
          items: [],
          source: "app-rule",
          note: "Section 1 边界内写入是预授权（客户 2026-10-25 规则）；无任务 writeSet 收窄时成立",
        },
        acceptance: acceptanceOf(input, worker.roleId),
      },
    },
    force: { state: "known", value: workerForce(worker.cardSections) },
    dispatchTask: knownField(false, "app-rule"),
    customerInteraction: { state: "known", value: workerCustomerInteraction(input) },
    shellTier: knownField("project-three-layer", "app-rule"),
    shellSession: {
      state: sessionState(input.session.shell),
      source: "session",
      note: "宿主注入；宿主未注入≠角色无权（项目角色三层链）",
    },
    mainChain: workerMainChain(worker.cardSections),
    otherCapabilities: knownField({}, "app-rule"),
    sourceNotes: [
      { text: worker.cardPath, source: "role-card" },
      { text: worker.boundaryPath, source: "boundary-yaml" },
    ],
  };
}

function mapWarnings(input: GovernanceMatrixInput): MatrixWarning[] {
  const warnings: MatrixWarning[] = [];
  const seenIssueKeys = new Set<string>();
  const issueDirs = new Set<string>();
  for (const issue of input.issues) {
    const key = `${issue.relDir}\u0000${issue.code}`;
    if (seenIssueKeys.has(key)) continue;
    seenIssueKeys.add(key);
    issueDirs.add(issue.relDir);
    warnings.push({
      code: issue.code,
      roleId: issue.roleId,
      relDir: issue.relDir,
      message: issue.message,
    });
  }
  const seenMessages = new Set<string>();
  for (const message of input.warnings) {
    if (seenMessages.has(message)) continue;
    seenMessages.add(message);
    let sameAsIssue = false;
    for (const dir of issueDirs) {
      if (message.startsWith(`${dir}：`)) {
        sameAsIssue = true;
        break;
      }
    }
    if (sameAsIssue) continue;
    warnings.push({ code: "listing-warning", message });
  }
  return warnings;
}

function workerSectionDirectives(
  input: GovernanceMatrixInput,
  workerRowCount: number,
): MatrixWarning[] {
  const error = input.roleDirectories.error;
  if (error !== undefined && error.trim() !== "") {
    return [{ code: "worker-section-unavailable", message: error }];
  }
  if (workerRowCount > 0) return [];
  if (input.roleDirectories.found) {
    return [{ code: "worker-section-no-valid", message: "角色目录存在但无有效角色（见 issues/warnings）" }];
  }
  return [{ code: "worker-section-none", message: "项目尚未 bootstrap，暂无 worker 角色" }];
}

function initialRenderInfo(): GovernanceMatrix["render"] {
  return {
    promptMaxChars: GOVERNANCE_MATRIX_PROMPT_MAX_CHARS,
    toolMaxChars: GOVERNANCE_MATRIX_TOOL_MAX_CHARS,
    perRoleMaxChars: GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS,
    truncated: false,
    omittedRoles: 0,
    omittedChars: 0,
    truncatedFields: [],
  };
}

function unavailableMatrix(input: GovernanceMatrixInput, reason: string): GovernanceMatrix {
  return {
    schema: "governance-matrix/v1",
    generatedAt: input.generatedAt,
    projectRoot: input.projectRoot,
    governanceModel: input.governanceModel,
    status: "unavailable",
    roles: [],
    routing: [],
    warnings: [{ code: "registry-unavailable", message: `注册表不可用：${reason}` }],
    render: initialRenderInfo(),
  };
}

function buildStatus(
  input: GovernanceMatrixInput,
  warnings: readonly MatrixWarning[],
): "complete" | "degraded" {
  const error = input.roleDirectories.error;
  if (error !== undefined && error.trim() !== "") return "degraded";
  for (const warning of warnings) {
    if (warning.code === "worker-section-none") continue;
    if (warning.code === "worker-section-no-valid") continue;
    return "degraded";
  }
  return "complete";
}

/**
 * 组装矩阵（impl 层；测试 seam）。生产调用方必须经 `public.ts` 的 `buildGovernanceMatrix`，
 * 它固定传真实注册表；本函数不进入 public 导出（G-5c）。
 */
export function buildGovernanceMatrixWith(
  input: GovernanceMatrixInput,
  builtins: readonly BuiltInGovernanceRoleSpec[],
): GovernanceMatrix {
  let builtinSpecs: BuiltInGovernanceRoleSpec[];
  try {
    builtinSpecs = [...builtins];
  } catch (error) {
    return unavailableMatrix(input, (error as Error).message);
  }

  const warnings = mapWarnings(input);
  const roles: GovernanceMatrixRole[] = [];
  try {
    for (const spec of builtinSpecs) {
      roles.push(buildBuiltInRole(spec, input));
    }
  } catch (error) {
    return unavailableMatrix(input, (error as Error).message);
  }

  const builtinIds: Set<string> = new Set(builtinSpecs.map((spec) => spec.id));
  const workerRows: GovernanceMatrixRole[] = [];
  for (const worker of input.workerRoles) {
    if (builtinIds.has(worker.roleId) || worker.roleId === "su" || worker.roleId === "liaison") {
      warnings.push({
        code: "builtin-role-as-worker",
        roleId: worker.roleId,
        message: `项目 worker 输入命中内置治理角色 id（${worker.roleId}），已跳过；不得重复计入 worker`,
      });
      continue;
    }
    workerRows.push(buildWorkerRole(input, worker));
  }
  roles.push(...workerRows);
  warnings.push(...workerSectionDirectives(input, workerRows.length));

  return {
    schema: "governance-matrix/v1",
    generatedAt: input.generatedAt,
    projectRoot: input.projectRoot,
    governanceModel: input.governanceModel,
    status: buildStatus(input, warnings),
    roles,
    routing: buildRouting(input, roles),
    warnings,
    render: initialRenderInfo(),
  };
}

/** 生产入口（impl 内部）：固定使用真实内置注册表，不向调用方暴露注册表参数（G-5c）。 */
export function buildGovernanceMatrix(input: GovernanceMatrixInput): GovernanceMatrix {
  return buildGovernanceMatrixWith(input, BUILT_IN_GOVERNANCE_ROLES);
}

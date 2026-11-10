// 治理权力矩阵 Service：派发导航（routing）。
//
// 单一来源纪律（AC-6）：
// - 卡种→角色只从 Pipeline 传入的 `cardKindsByRole`（TRIO_CARD_KINDS 快照）反推，不复制第二张表；
// - 版本变更/重构直接复用 Model 常量（VERSION_CHANGE_INITIATOR_BY_KIND / REFACTOR_REQUESTED_BY）；
// - 需求变更/版本决定/stable 写入从 Pipeline 传入的 `initiationByRole` 快照派生；
// - 唯一新增手写小表 APP_ROUTING_RULES 只放少量无法派生的 app-rule 路由（有测试、有更新纪律）。
// 本文件为纯函数：无 I/O、无判定。
//
// T3「两条固定工作流路径」B2（v1.3 §7.4；MF-IR-4）：`buildRouting` 按 `matrix` 生成视图——
// - `"legacy-v1"`（缺省）：下列 legacy 逻辑**逐字不变**（legacy 路由/文案/顺序冻结）；
// - `"two-fixed-paths/v1"`：fixed 视图只读模块 `fixedCards`/`fixedTargetRoleIds`/
//   `fixedAllowedBuiltInRoleIds`（经门禁引擎门面，单一来源；缺失 ⇒ fail-closed 空视图），
//   不含 legacy 模型常量/发起快照/VCA/stable 路由；另用一张 fixed app-rule 小表表达
//   三卡与客户决定（只读展示，不是判定/授权）。

import type {
  GovernanceMatrixInput,
  GovernanceMatrixRole,
  MatrixRoutingRule,
} from "../../../model/governance-matrix.ts";
import type { DispatchMatrixMode } from "../../../model/role.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  builtInRoleModuleOf,
  cardKindsOf,
} from "../../../common/门禁引擎/governance-roles.ts";
import {
  REFACTOR_REQUESTED_BY,
  VERSION_CHANGE_INITIATOR_BY_KIND,
} from "../../../model/version-change.ts";

/**
 * 唯一新增手写路由小表（app-rule）。更新纪律：任何增删必须同步矩阵测试与角色卡/方案引用，
 * 不得把可从卡种/Model 常量/能力位派生的条目搬进来。
 */
const APP_ROUTING_RULES: readonly MatrixRoutingRule[] = Object.freeze([
  {
    work: "产品意图文档",
    target: "product",
    basis: "app-rule",
    source: "app-rule",
    note: "主链第一环：产品出 docs/product/<flowId>-intent-vN.md",
  },
  {
    work: "方案/名单/架构",
    target: "rapporteur",
    basis: "app-rule",
    source: "app-rule",
    note: "提案/名单/架构是人事招人的唯一依据",
  },
  {
    work: "主干升级/客户决定",
    target: "customer",
    basis: "app-rule",
    source: "app-rule",
    note: "不是角色；由客户作出决定",
  },
  {
    work: "下载",
    target: "application",
    basis: "app-rule",
    source: "app-rule",
    note: "应用通道 request_download；按会话注入",
  },
]);

/**
 * fixed 路径的 app-rule 路由（只读展示；legacy `APP_ROUTING_RULES` 逐字不变）。
 * 表达固定路径的三张客户确认卡与生产线分工（v1.3 §3.4/§8）；不是判定，不新增客户门。
 */
const FIXED_PATH_APP_ROUTING_RULES: readonly MatrixRoutingRule[] = Object.freeze([
  {
    work: "产品意图文档",
    target: "product",
    basis: "app-rule",
    source: "app-rule",
    note: "convener 派 product 撰写意图；意图确认卡（intent-confirm）由幕僚呈",
  },
  {
    work: "方案/名单/模块/架构/契约",
    target: "rapporteur",
    basis: "app-rule",
    source: "app-rule",
    note: "convener 派 rapporteur；方案卡（proposal）由幕僚呈，不由策划发卡",
  },
  {
    work: "客户决定（意图/方案/任命三卡）",
    target: "customer",
    basis: "app-rule",
    source: "app-rule",
    note: "固定路径客户确认卡仅三张；高风险合并卡 merge-main 由应用呈卡、必须客户本人确认（judge 不可代批）",
  },
  {
    work: "下载",
    target: "application",
    basis: "app-rule",
    source: "app-rule",
    note: "应用通道 request_download；按会话注入",
  },
]);

/** 卡种展示顺序（未知卡种排在其后按字典序）。 */
const CARD_KIND_ORDER: readonly string[] = Object.freeze([
  "intent-confirm",
  "proposal",
  "appointment",
  "appointment-write",
  "decision",
  "acceptance",
]);

const CARD_KIND_WORK: Readonly<Record<string, string>> = Object.freeze({
  "intent-confirm": "需求意图确认（intent-confirm）",
  proposal: "提案",
  appointment: "招人决定（appointment）",
  "appointment-write": "写卡确认（appointment-write）",
  decision: "材料性选择/需求变更审批（decision）",
  acceptance: "验收（acceptance）",
});

function versionChangeWork(kind: string): string {
  if (kind === "version-upgrade") return "版本变更申请（版本升级）";
  if (kind === "detail-amendment") return "版本变更申请（细节修正/修正案）";
  return `版本变更申请（${kind}）`;
}

/** 卡种发起者 map → 路由行（展示顺序 / 字段逐字与 C1b 一致；legacy 与 fixed 共用）。 */
function cardKindRulesFrom(
  originators: Map<string, string[]>,
  note: string,
): MatrixRoutingRule[] {
  const known = CARD_KIND_ORDER.filter((kind) => originators.has(kind));
  const extras = Array.from(originators.keys())
    .filter((kind) => !CARD_KIND_ORDER.includes(kind))
    .sort((left, right) => left.localeCompare(right));
  const rules: MatrixRoutingRule[] = [];
  for (const kind of [...known, ...extras]) {
    const targets = originators.get(kind) ?? [];
    for (const target of targets) {
      rules.push({
        work: CARD_KIND_WORK[kind] ?? `卡种 ${kind}`,
        target,
        basis: "card-kind",
        source: "app-rule",
        note,
      });
    }
  }
  return rules;
}

function collectCardKindOriginators(
  entries: ReadonlyArray<readonly [string, readonly string[]]>,
): Map<string, string[]> {
  const originators = new Map<string, string[]>();
  for (const [roleId, kinds] of entries) {
    for (const kind of kinds) {
      const list = originators.get(kind);
      if (list === undefined) originators.set(kind, [roleId]);
      else if (!list.includes(roleId)) list.push(roleId);
    }
  }
  return originators;
}

function buildCardKindRoutes(input: GovernanceMatrixInput): MatrixRoutingRule[] {
  const roleIds = Object.keys(input.cardKindsByRole).sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN"),
  );
  const entries: Array<readonly [string, readonly string[]]> = [];
  for (const roleId of roleIds) {
    const snapshot = input.cardKindsByRole[roleId];
    entries.push([roleId, [...snapshot.choice, ...snapshot.confirm]]);
  }
  return cardKindRulesFrom(
    collectCardKindOriginators(entries),
    "卡种白名单快照：Pipeline 传入的 TRIO_CARD_KINDS",
  );
}

/**
 * fixed 卡种路由：只读模块 `fixedCards`（门禁引擎门面 `cardKindsOf`，单一来源）；
 * 模块缺失该字段 ⇒ 对应角色无卡种行（fail-closed 空集，不静默回退 legacy `cards`）。
 */
function buildFixedCardKindRoutes(): MatrixRoutingRule[] {
  const entries: Array<readonly [string, readonly string[]]> = BUILT_IN_GOVERNANCE_ROLES.map(
    (spec) => [spec.id, cardKindsOf(spec.id, "two-fixed-paths/v1")] as const,
  );
  return cardKindRulesFrom(
    collectCardKindOriginators(entries),
    "fixed 卡种白名单：模块 fixedCards（two-fixed-paths/v1）",
  );
}

function buildModelRoutes(): MatrixRoutingRule[] {
  const rules: MatrixRoutingRule[] = [];
  for (const [kind, roleId] of Object.entries(VERSION_CHANGE_INITIATOR_BY_KIND)) {
    rules.push({
      work: versionChangeWork(kind),
      target: roleId,
      basis: "model",
      source: "model",
      note: "VERSION_CHANGE_INITIATOR_BY_KIND（Model 常量，直接复用）",
    });
  }
  rules.push({
    work: "轻量重构",
    target: REFACTOR_REQUESTED_BY,
    basis: "model",
    source: "model",
    note: "REFACTOR_REQUESTED_BY（Model 常量，直接复用）",
  });
  return rules;
}

function buildInitiationRoutes(input: GovernanceMatrixInput): MatrixRoutingRule[] {
  const rules: MatrixRoutingRule[] = [];
  const roleIds = Object.keys(input.initiationByRole).sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN"),
  );
  for (const roleId of roleIds) {
    const snapshot = input.initiationByRole[roleId];
    if (snapshot.requirementChange) {
      rules.push({
        work: "需求变更申请",
        target: roleId,
        basis: "app-rule",
        source: "app-rule",
        note: "run-role 既有角色门控快照",
      });
    }
    if (snapshot.versionDecision) {
      rules.push({
        work: "版本决定（request_version_decision）",
        target: roleId,
        basis: "app-rule",
        source: "app-rule",
        note: "run-role 既有角色门控快照",
      });
    }
    if (snapshot.stableWrite) {
      rules.push({
        work: "stable 写入（request_stable_write）",
        target: roleId,
        basis: "app-rule",
        source: "app-rule",
        note: "run-role 既有角色门控快照",
      });
    }
  }
  return rules;
}

function buildDispatchRoutes(roles: readonly GovernanceMatrixRole[]): MatrixRoutingRule[] {
  const rules: MatrixRoutingRule[] = [];
  for (const role of roles) {
    if (role.kind !== "built-in-governance") continue;
    if (role.dispatchTask.state !== "known") continue;
    if (!role.dispatchTask.value) continue;
    if (role.roleId === "convener") {
      rules.push({
        work: "实现任务派发（dispatch_task）",
        target: role.roleId,
        basis: "capability",
        source: "builtin-registry",
        note: "再由 convener 派发项目 worker；目标/范围由应用预检",
      });
    } else {
      rules.push({
        work: "派发任务（dispatch_task）",
        target: role.roleId,
        basis: "capability",
        source: "builtin-registry",
        note: "目标/范围由应用派发前校验",
      });
    }
  }
  return rules;
}

/**
 * fixed 派发分裂视图（v1.3 §3.1/§7.4；只读展示）：convener 为生产线唯一派发者；
 * chief 只派 verifier（review/preparation）与 workflow.reviewRoleId 项目验收角色，
 * 对 convener 仅 `purpose=stage-request`。目标集只读模块 fixed 字段（缺失 ⇒ 不出行，fail-closed）。
 */
function buildFixedDispatchRoutes(): MatrixRoutingRule[] {
  const rules: MatrixRoutingRule[] = [];
  const convenerTargets = builtInRoleModuleOf("convener")?.fixedAllowedBuiltInRoleIds ?? [];
  const chiefTargets = builtInRoleModuleOf("chief")?.fixedTargetRoleIds ?? [];
  if (convenerTargets.length > 0) {
    rules.push({
      work: "生产线派发（dispatch_task）",
      target: "convener",
      basis: "capability",
      source: "builtin-registry",
      note: `fixed 矩阵：convener 为生产线唯一派发者（内置 ${convenerTargets.join("/")} 与项目角色）；目标/范围由应用预检；不得派 verifier`,
    });
  }
  for (const target of chiefTargets) {
    if (target === "convener") {
      rules.push({
        work: "产线调度请求（stage-request）",
        target: "chief",
        basis: "capability",
        source: "builtin-registry",
        note: "fixed 矩阵：chief→convener 仅 purpose=stage-request（read-only、无 module/写集）；运营收到后在真实回合再派生产线",
      });
    } else if (target === "verifier") {
      rules.push({
        work: "独立验收派发（review/preparation）",
        target: "chief",
        basis: "capability",
        source: "builtin-registry",
        note: "fixed 矩阵：chief→verifier；项目验收角色仅 workflow.reviewRoleId（roster review=true）且 purpose=review 时允许，应用核验",
      });
    } else {
      rules.push({
        work: "派发任务（dispatch_task）",
        target: "chief",
        basis: "capability",
        source: "builtin-registry",
        note: `fixed 矩阵：chief 目标 ${target}；目标/范围由应用预检`,
      });
    }
  }
  return rules;
}

/**
 * 组装派发导航：卡种快照 → Model 常量 → 发起快照 → 能力位 → app-rule 小表（legacy，逐字不变）；
 * fixed（`matrix:"two-fixed-paths/v1"`）：fixedCards 卡种 → 派发分裂 → fixed app-rule 小表。
 */
export function buildRouting(
  input: GovernanceMatrixInput,
  roles: readonly GovernanceMatrixRole[],
  matrix: DispatchMatrixMode = "legacy-v1",
): MatrixRoutingRule[] {
  if (matrix === "two-fixed-paths/v1") {
    return [
      ...buildFixedCardKindRoutes(),
      ...buildFixedDispatchRoutes(),
      ...FIXED_PATH_APP_ROUTING_RULES.map((rule) => ({ ...rule })),
    ];
  }
  return [
    ...buildCardKindRoutes(input),
    ...buildModelRoutes(),
    ...buildInitiationRoutes(input),
    ...buildDispatchRoutes(roles),
    ...APP_ROUTING_RULES.map((rule) => ({ ...rule })),
  ];
}

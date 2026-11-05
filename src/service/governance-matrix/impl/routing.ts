// 治理权力矩阵 Service：派发导航（routing）。
//
// 单一来源纪律（AC-6）：
// - 卡种→角色只从 Pipeline 传入的 `cardKindsByRole`（TRIO_CARD_KINDS 快照）反推，不复制第二张表；
// - 版本变更/重构直接复用 Model 常量（VERSION_CHANGE_INITIATOR_BY_KIND / REFACTOR_REQUESTED_BY）；
// - 需求变更/版本决定/stable 写入从 Pipeline 传入的 `initiationByRole` 快照派生；
// - 唯一新增手写小表 APP_ROUTING_RULES 只放少量无法派生的 app-rule 路由（有测试、有更新纪律）。
// 本文件为纯函数：无 I/O、无判定。

import type {
  GovernanceMatrixInput,
  GovernanceMatrixRole,
  MatrixRoutingRule,
} from "../../../model/governance-matrix.ts";
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

function buildCardKindRoutes(input: GovernanceMatrixInput): MatrixRoutingRule[] {
  const originators = new Map<string, string[]>();
  const roleIds = Object.keys(input.cardKindsByRole).sort((left, right) =>
    left.localeCompare(right, "zh-Hans-CN"),
  );
  for (const roleId of roleIds) {
    const snapshot = input.cardKindsByRole[roleId];
    for (const kind of [...snapshot.choice, ...snapshot.confirm]) {
      const list = originators.get(kind);
      if (list === undefined) originators.set(kind, [roleId]);
      else if (!list.includes(roleId)) list.push(roleId);
    }
  }
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
        note: "卡种白名单快照：Pipeline 传入的 TRIO_CARD_KINDS",
      });
    }
  }
  return rules;
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

/** 组装派发导航：卡种快照 → Model 常量 → 发起快照 → 能力位 → app-rule 小表。 */
export function buildRouting(
  input: GovernanceMatrixInput,
  roles: readonly GovernanceMatrixRole[],
): MatrixRoutingRule[] {
  return [
    ...buildCardKindRoutes(input),
    ...buildModelRoutes(),
    ...buildInitiationRoutes(input),
    ...buildDispatchRoutes(roles),
    ...APP_ROUTING_RULES.map((rule) => ({ ...rule })),
  ];
}

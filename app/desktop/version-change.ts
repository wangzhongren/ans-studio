// app/desktop/version-change.ts
// 桌面窗口 D1（trunk-amendment-model）：版本变更申请（VCA）/冻结/stable-write/轻量重构的桌面接线。
//
// 职责（P1 D1 提案 §3.1/§四/§五/§六/§七；P1.6 §4.4/§4.5/§4.5.1/§4.8/§4.10）：
// · 客户卡组装：VCA 批准/拒绝卡（application-owned decision，推荐 reject）、修正案逐项卡
//   （item-apply/item-keep/item-cancel-amendment + acknowledgments）、stable workflow 确认卡
//   （app-owned `stable-write`；preview path/base/target sha256 + diff）——**不计算** hash/permit，
//   字段来自编排冻结载荷；缺字段 ⇒ 不发卡（fail-closed）。
// · 只读面板投影：VCA / stable-write / 重构 / 冻结清单（有界、项目相对路径、无密钥；无 drift）。
// · 运行时组合（`createVersionChangeStack`）：把 S1 存储 + S2 Service + S4 四句柄接进桌面；
//   `emitEvent` 注入 task-state（生产 `appendTaskEvent`）；presenter/notify 注入会话卡通道。
// · stable-write：确认后许可由 S2 安装到 C2b 快照；桌面在重启后**重建**同步许可快照
//   （`installStableWritePermitSnapshot`）并把候选 permit 注入 run-role `stablePermitOf`；
//   写入后的 `completeWrite(actualSha)` 由桌面 after-write 钩子调用（F16：**桌面无直接写盘路径**）。
// · 客户主权：VCA/逐项/stable 卡永不进判断器/委托/`@决策`；presenter 结果再做 operatorId/judge
//   二次校验（非 customer ⇒ unavailable）。
//
// 纪律：不读写 `.ans/**`（全部经注入的 Service/Pipeline）；不判冻结/哈希/permit/trunk 更新；
// 不改 appointment-write 语义；不硬编码中文（文案只经共享 i18n `mainT`）。

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { appendTaskEvent } from "../../src/common/编排/task-state.ts";
import { declaredConfirmPaths, declaredPathBodies } from "../../src/common/编排/confirmed-writes.ts";
import {
  installStableWritePermitSnapshot,
  refreshVersionedDocFreezeSnapshot,
  stableWritePathOf,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { VersionedDocFreezeSnapshot } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import type {
  CustomerInputAcknowledgement,
  CustomerInputOutcome,
  CustomerInputRequest,
  RequestStableWriteFn,
  RequestStableWriteInput,
  RequestStableWriteResult,
  SubmitRefactorFn,
  SubmitRefactorInput,
  SubmitRefactorResult,
  SubmitVersionChangeFn,
  SubmitVersionChangeInput,
  SubmitVersionChangeResult,
  TaskStateEvent,
} from "../../src/model/runtime.ts";
import type { TrunkApplySnapshot, TrunkDocKind, TrunkManifest, TrunkStableFileKind } from "../../src/model/trunk.ts";
import type {
  DocFreezeReason,
  RefactorRequestRecord,
  StableWritePermit,
  StableWriteRecord,
  VersionChangeRecord,
} from "../../src/model/version-change.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import type { DocFreezeRecordInput } from "../../src/service/version-change/public/version-change-service.ts";
import type { SnapshotItem, TrunkStableSnapshotTarget, TrunkStatusView } from "../../src/service/trunk/public/trunk-service.ts";
import { createRefactorRuntime } from "../../src/pipeline/orchestration/refactor-runtime.ts";
import type { RefactorRuntime } from "../../src/pipeline/orchestration/refactor-runtime.ts";
import { createStableWriteRuntime } from "../../src/pipeline/orchestration/stable-write-runtime.ts";
import type {
  StableWriteCardOutcome,
  StableWritePresenter,
  StableWriteRuntime,
} from "../../src/pipeline/orchestration/stable-write-runtime.ts";
import { createRunRepinPort, createTrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { TrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import type {
  AmendmentItemOutcome,
  ItemDecision,
  VcaCardOutcome,
  VersionChangePresenter,
  VersionChangeRuntime,
} from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { mainT } from "./i18n.ts";
import {
  buildTrunkStatePayload,
  type TrunkListEntry,
  type TrunkStatePayloadV1,
  type TrunkStableView,
  type TrunkUpgradePreviewV1,
} from "./trunk.ts";

// —————————————— IPC 通道（D1 冻结点；U1 只消费本表） ——————————————

/**
 * 渲→主 invoke 通道（**冻结集**；F10/F17）：
 * · 无 `version-change:submit`（VCA 只经发起角色能力工具）；
 * · 无 `refactor:request`（重构只经 convener 能力工具；渲染不能证明 convener 身份）；
 * · 无 `stable-write:request`（stable 写入只经 B-11 presenter/能力）；
 * · 客户批准/拒绝只经既有 `session:operator-response`，不设渲→主捷径。
 */
export const VERSION_CHANGE_IPC_CHANNELS = Object.freeze({
  versionChangeList: "version-change:list",
  versionChangePresent: "version-change:present",
  stableWriteList: "stable-write:list",
  refactorList: "refactor:list",
  docFreezeList: "doc-freeze:list",
  trunkList: "trunk:list",
  trunkUpgradeRequest: "trunk:upgrade-request",
  trunkUpgradeConfirm: "trunk:upgrade-confirm",
  trunkRefreezeRequest: "trunk:refreeze-request",
  trunkAbandonUpgrade: "trunk:abandon-upgrade",
  trunkRecoverRequest: "trunk:recover-request",
});

/** 主→渲推送通道（**单一状态源**；不设 `*-state` 第二源）。 */
export const TRUNK_STATE_CHANNEL = "trunk:state" as const;

/** 明确不提供的渲→主通道（结构断言用；F10/F17）。 */
export const VERSION_CHANGE_FORBIDDEN_IPC_CHANNELS: readonly string[] = Object.freeze([
  "version-change:submit",
  "refactor:request",
  "stable-write:request",
]);

// —————————————— 只读视图（面板/IPC；有界） ——————————————

export type CacheHealth = "ok" | "missing-migrated" | "corrupt-failclosed";

export interface VcaTargetSummary {
  kind: string;
  path: string;
  action: string;
  version: number | null;
  toSha256: string;
}

export interface VcaSummary {
  applicationId: string;
  kind: string;
  initiatorRoleId: string;
  flowId: string;
  status: string;
  summary: string;
  bootstrap: boolean;
  baseTrunkVersion: number | null;
  targets: VcaTargetSummary[];
  submittedAt?: string;
  decidedAt?: string;
  decisionId?: string;
  resultTrunkVersion?: number;
  at: string;
}

export interface StableWriteSummary {
  requestId: string;
  roleId: string;
  path: string;
  kind: TrunkStableFileKind;
  baseSha256: string;
  targetSha256: string;
  status: string;
  permitId?: string;
  decisionId?: string;
  confirmationId?: string;
  approvedAt?: string;
  /** 仅外显（桌面不复算过期；TTL 判定归 C2b）。 */
  expiresAt?: string;
  consumedAt?: string;
  writtenAt?: string;
  at: string;
}

export interface RefactorSummary {
  requestId: string;
  flowId: string;
  initiatedBy: string;
  title: string;
  reason: string;
  scope: RefactorRequestRecord["scope"];
  status: string;
  managedBy: string;
  at: string;
  updatedAt?: string;
}

export interface DocFreezeSummary {
  path: string;
  version: number;
  sha256: string;
  frozen: boolean;
  reason?: DocFreezeReason;
  applicationId?: string;
  decidedBy?: "customer";
  migrationMark?: "migrated-legacy" | "migrated-draft";
  at: string;
}

export interface DocFreezeListView {
  freezes: DocFreezeSummary[];
  cacheHealth: CacheHealth;
}

export interface StableWritePreview {
  path: string;
  baseSha256: string;
  targetSha256: string;
  diffPreview: string;
}

/** 版本升级/修正案卡片的映射入参（来自 S4 冻结载荷；桌面不改写哈希/版本）。 */
export interface VcaCardInput {
  record: VersionChangeRecord;
  requestId?: string;
}

/** 修正案逐项卡映射入参（`acknowledgments` 由应用按边界扩大检测组装）。 */
export interface AmendmentItemCardInput {
  record: VersionChangeRecord;
  item: SnapshotItem;
  index: number;
  total: number;
  acknowledgments?: CustomerInputAcknowledgement[];
  requestId?: string;
}

export interface BuiltCard {
  request: CustomerInputRequest;
  metadata: { cardKind: "decision"; flowId: string } | { cardKind: "stable-write" };
}

// —————————————— 纯工具 ——————————————

const SHA256_RE = /^[0-9a-f]{64}$/i;

function isSha256(value: string): boolean {
  return SHA256_RE.test(value);
}

/** 从 `-vN.md` 路径读版本号（仅显示；不是判定）。 */
export function versionOfPath(relPath: string): number | null {
  const match = /-v(\d+)\.md$/i.exec(relPath);
  return match === null ? null : Number(match[1]);
}

function previewLine(lines: string[]): string {
  return lines.filter((line) => line !== "").join("\n");
}

function boundedPreview(text: string, max = 8_000): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// —————————————— 客户卡组装（纯函数；不计算哈希） ——————————————

/**
 * VCA 批准/拒绝卡（application-owned `decision`；真实 flowId；推荐 reject 安全项）。
 * 字段缺失/非法 ⇒ undefined（调用方不发卡，fail-closed）。
 */
export function buildVersionChangeCard(input: VcaCardInput): BuiltCard | undefined {
  const record = input.record;
  if (record.flowId.trim() === "" || record.applicationId.trim() === "") return undefined;
  if (!Array.isArray(record.targets) || record.targets.length === 0) return undefined;
  const kindKey = record.kind === "version-upgrade" ? "ui.versionChange.kind.versionUpgrade" : "ui.versionChange.kind.detailAmendment";
  const title = `${mainT(kindKey)} · ${record.flowId}`;
  const targetLines: string[] = [];
  for (const target of record.targets.slice(0, 5)) {
    targetLines.push(
      mainT("ui.versionChange.targetLine", {
        path: target.path,
        version: versionOfPath(target.path) ?? "?",
        hash: target.toSha256,
      }),
    );
  }
  if (record.targets.length > 5) targetLines.push(mainT("ui.versionChange.targetMore", { count: record.targets.length - 5 }));
  const lines = [
    mainT("ui.versionChange.initiator", { role: record.initiatorRoleId }),
    mainT("ui.versionChange.flow", { flowId: record.flowId }),
    ...targetLines,
    mainT("ui.versionChange.summary", { summary: record.summary }),
    ...(record.applicationSha256 !== undefined && record.applicationSha256 !== ""
      ? [mainT("ui.versionChange.hash", { hash: record.applicationSha256 })]
      : []),
    ...(record.baseTrunk === null ? [mainT("ui.trunk.versionNone")] : []),
    mainT(
      record.kind === "version-upgrade"
        ? "ui.versionChange.semantics.versionUpgrade"
        : "ui.versionChange.semantics.detailAmendment",
    ),
  ];
  const request: CustomerInputRequest = {
    kind: "choice",
    title,
    preview: boundedPreview(previewLine(lines)),
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId: record.flowId,
    options: [
      { id: "approve-version-change", label: mainT("ui.confirm.approve") },
      { id: "reject-version-change", label: mainT("ui.confirm.reject"), recommended: true },
    ],
  };
  return { request, metadata: { cardKind: "decision", flowId: record.flowId } };
}

/** 修正案逐项确认卡（只对实际变更项；`change:none` 不发卡由调用方保证）。 */
export function buildAmendmentItemCard(input: AmendmentItemCardInput): BuiltCard | undefined {
  const { record, item } = input;
  if (record.flowId.trim() === "") return undefined;
  if (item.to.trim() === "") return undefined;
  if (item.change === "none") return undefined;
  const title = `${mainT("ui.versionChange.kind.detailAmendment")} · ${item.itemId}（${input.index + 1}/${input.total}）`;
  const lines = [
    mainT("ui.versionChange.targetLine", {
      path: item.to,
      version: versionOfPath(item.to) ?? "?",
      hash: item.toSha256,
    }),
    mainT("ui.versionChange.semantics.detailAmendment"),
  ];
  const request: CustomerInputRequest = {
    kind: "choice",
    title,
    preview: boundedPreview(previewLine(lines)),
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId: record.flowId,
    options: [
      { id: "item-apply", label: mainT("ui.confirm.approve") },
      { id: "item-keep", label: mainT("ui.confirm.reject"), recommended: true },
      { id: "item-cancel-amendment", label: mainT("shared.common.cancel") },
    ],
    ...(input.acknowledgments !== undefined && input.acknowledgments.length > 0
      ? { acknowledgments: input.acknowledgments }
      : {}),
  };
  return { request, metadata: { cardKind: "decision", flowId: record.flowId } };
}

/**
 * stable workflow 确认卡（app-owned `stable-write`；项目级、无 flowId；推荐 reject）。
 * preview 只展示编排计算的 path/base/target sha256 与有界 diff；桌面不计算哈希。
 */
export function buildStableWriteCard(input: {
  record: StableWriteRecord;
  preview: StableWritePreview;
}): BuiltCard | undefined {
  const { record, preview } = input;
  if (record.path.trim() === "" || preview.path.trim() === "") return undefined;
  if (!isSha256(preview.targetSha256)) return undefined;
  if (preview.baseSha256 !== "" && !isSha256(preview.baseSha256)) return undefined;
  if (record.path !== preview.path || record.targetSha256 !== preview.targetSha256) return undefined;
  const kindKey =
    record.kind === "workflow"
      ? "ui.stableWrite.kind.workflow"
      : record.kind === "role-card"
        ? "ui.stableWrite.kind.roleCard"
        : "ui.stableWrite.kind.boundary";
  const lines = [
    `${record.path}`,
    mainT("ui.stableWrite.confirm.baseHash", { hash: preview.baseSha256 === "" ? mainT("shared.common.none") : preview.baseSha256 }),
    mainT("ui.stableWrite.confirm.targetHash", { hash: preview.targetSha256 }),
    ...(preview.diffPreview.trim() !== ""
      ? [mainT("ui.stableWrite.confirm.diff"), boundedPreview(preview.diffPreview, 4_000)]
      : []),
    mainT("ui.stableWrite.confirm.semantics"),
    mainT("ui.stableWrite.confirm.noDrift"),
  ];
  const request: CustomerInputRequest = {
    kind: "choice",
    title: `${mainT(kindKey)} · ${record.path}`,
    preview: boundedPreview(previewLine(lines)),
    cardKind: "stable-write",
    application: true,
    sourceRoleId: "application",
    options: [
      { id: "approve-stable-write", label: mainT("ui.confirm.approve") },
      { id: "reject-stable-write", label: mainT("ui.confirm.reject"), recommended: true },
    ],
  };
  return { request, metadata: { cardKind: "stable-write" } };
}

/**
 * stable 卡的**独立最小结构校验**（PM 复审 §4.5；`validateDecisionCardRequest` 对 `stable-write`
 * 返回 `applicable:false`，不得因此跳过结构校验）：choice、cardKind、application:true、≥2 选项、
 * 恰一推荐项、非空标题；给出 source 时校验 path/base/target 与卡片一致。
 */
export function validateStableWriteCardShape(
  request: CustomerInputRequest,
  source?: StableWritePreview,
): { ok: true } | { ok: false; reason: "not-choice" | "wrong-card-kind" | "not-application" | "options" | "recommended" | "title" | "preview" } {
  if (request.kind !== "choice") return { ok: false, reason: "not-choice" };
  if ((request as { cardKind?: unknown }).cardKind !== "stable-write") return { ok: false, reason: "wrong-card-kind" };
  if ((request as { application?: unknown }).application !== true) return { ok: false, reason: "not-application" };
  if (request.title.trim() === "") return { ok: false, reason: "title" };
  if (!Array.isArray(request.options) || request.options.length < 2) return { ok: false, reason: "options" };
  const ids = new Set<string>();
  let recommended = 0;
  for (const option of request.options) {
    if (typeof option.id !== "string" || option.id.trim() === "" || ids.has(option.id)) return { ok: false, reason: "options" };
    ids.add(option.id);
    if (option.recommended === true) recommended += 1;
  }
  if (recommended !== 1) return { ok: false, reason: "recommended" };
  if (source !== undefined) {
    if (!request.preview?.includes(source.path) || !request.preview.includes(source.targetSha256)) {
      return { ok: false, reason: "preview" };
    }
  }
  return { ok: true };
}

// —————————————— 客户三态 → S4 结果形状（客户主权二次校验） ——————————————

function sovereignViolation(outcome: CustomerInputOutcome): boolean {
  const operatorId = "operatorId" in outcome && typeof outcome.operatorId === "string" ? outcome.operatorId : undefined;
  if (operatorId !== undefined && (operatorId.startsWith("judge:") || operatorId.startsWith("directive:"))) return true;
  return outcome.outcome === "answered" && outcome.judge !== undefined;
}

function answeredChoice(outcome: CustomerInputOutcome | null | undefined): { selected: string[]; decisionId: string } | undefined {
  if (outcome === null || outcome === undefined) return undefined;
  if (outcome.outcome !== "answered") return undefined;
  if (sovereignViolation(outcome)) return undefined;
  const selected = Array.isArray(outcome.value.selected) ? outcome.value.selected.filter((item): item is string => typeof item === "string") : [];
  const decisionId = typeof outcome.decisionId === "string" && outcome.decisionId.trim() !== "" ? outcome.decisionId : undefined;
  if (selected.length !== 1 || decisionId === undefined) return undefined;
  return { selected, decisionId };
}

export function toVersionChangeOutcome(outcome: CustomerInputOutcome | null | undefined): VcaCardOutcome {
  const answered = answeredChoice(outcome);
  if (answered !== undefined) {
    const choice = answered.selected[0];
    if (choice === "approve-version-change" || choice === "reject-version-change") {
      return { outcome: "answered", choice, decisionId: answered.decisionId };
    }
    return { outcome: "unavailable" };
  }
  if (outcome?.outcome === "declined") return { outcome: "declined" };
  return { outcome: "unavailable" };
}

export function toStableWriteOutcome(outcome: CustomerInputOutcome | null | undefined): StableWriteCardOutcome {
  const answered = answeredChoice(outcome);
  if (answered !== undefined) {
    const choice = answered.selected[0];
    if (choice === "approve-stable-write" || choice === "reject-stable-write") {
      return { outcome: "answered", choice, decisionId: answered.decisionId };
    }
    return { outcome: "unavailable" };
  }
  if (outcome?.outcome === "declined") return { outcome: "declined" };
  return { outcome: "unavailable" };
}

export function toAmendmentItemOutcome(
  outcome: CustomerInputOutcome | null | undefined,
  request: CustomerInputRequest,
): AmendmentItemOutcome {
  const answered = answeredChoice(outcome);
  if (answered !== undefined) {
    const choice = answered.selected[0];
    if (choice === "item-apply" || choice === "item-keep" || choice === "item-cancel-amendment") {
      const requested = request.acknowledgments ?? [];
      const acknowledged = outcome?.outcome === "answered" && Array.isArray(outcome.acknowledged) ? outcome.acknowledged : [];
      const labels = new Map(requested.map((entry) => [entry.id, entry.label]));
      return {
        outcome: "answered",
        choice,
        decisionId: answered.decisionId,
        ...(acknowledged.length > 0
          ? { acknowledgments: acknowledged.map((id) => ({ id, label: labels.get(id) ?? id })) }
          : {}),
      };
    }
    return { outcome: "unavailable" };
  }
  if (outcome?.outcome === "declined") return { outcome: "declined" };
  return { outcome: "unavailable" };
}

// —————————————— appointment-write → stable 许可（F16：只发许可，不写盘） ——————————————

/**
 * AC-13（D2）：stable boundary 预览扩大风险 → 卡面横幅 + required acknowledgments。
 * `expansions` 来自 S7 `detectStableBoundaryExpansion`（条目 `root:path` 或 `to-yaml-invalid:<原因>`）。
 * 文案只经共享 i18n；条目本身作为数据展示（不做第二套解析/判定）。
 */
export interface StableBoundaryRisk {
  expanded: boolean;
  /** 预览不可解析（S7 fail-closed 的 `to-yaml-invalid:`）。 */
  unparseable: boolean;
  expansions: string[];
  acknowledgments: CustomerInputAcknowledgement[];
  banner: string;
}

export function buildStableBoundaryRisk(expansions: string[]): StableBoundaryRisk {
  const unparseable = expansions.some((entry) => entry.startsWith("to-yaml-invalid:"));
  const acknowledgments = expansions.map((label, index) => ({
    id: `boundary-expansion-${index}`,
    label,
    required: true as const,
  }));
  const banner =
    expansions.length === 0
      ? ""
      : [
          `${mainT("ui.stableWrite.kind.boundary")} — ${mainT("main.interface.boundaryDirWiderWord")}:`,
          ...expansions.map((entry) => `- ${entry}`),
        ].join("\n");
  return { expanded: expansions.length > 0, unparseable, expansions, acknowledgments, banner };
}

/** 合并已有 acknowledgments 与风险必选项（按 id 去重；风险项恒 required）。 */
export function mergeAcknowledgements(
  existing: readonly CustomerInputAcknowledgement[] | undefined,
  added: readonly CustomerInputAcknowledgement[],
): CustomerInputAcknowledgement[] {
  const merged: CustomerInputAcknowledgement[] = [];
  const seen = new Set<string>();
  for (const entry of [...(existing ?? []), ...added]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged;
}

/**
 * 从已确认的 appointment-write 卡提取 role-card/boundary 的 stable 写入输入：
 * 正文 = 确认卡 preview 的逐路径正文（`declaredPathBodies`，与呈现前完整性闸同一口径）；
 * 文本文件统一补一个结尾换行（预览正文去尾空行）；写入字节不同 ⇒ 门禁 hash 拒绝（fail-closed）。
 * **本函数不写盘**；许可签发/写入执行在 B-11/run-role gate。
 */
export function appointmentStableWriteInputs(request: CustomerInputRequest): Array<{
  roleId: string;
  kind: "role-card" | "boundary";
  content: string;
  diffPreview?: string;
}> {
  if (request.kind !== "confirm") return [];
  const paths = declaredConfirmPaths(request);
  if (paths.length === 0) return [];
  const bodies = new Map(declaredPathBodies(request.preview, paths).map((entry) => [entry.path, entry]));
  const out: Array<{ roleId: string; kind: "role-card" | "boundary"; content: string; diffPreview?: string }> = [];
  for (const relPath of paths) {
    const info = stableWritePathOf(relPath);
    if (info === undefined || (info.kind !== "role-card" && info.kind !== "boundary")) continue;
    if (info.roleId === undefined) continue;
    const body = bodies.get(info.path) ?? bodies.get(relPath);
    if (body === undefined || !body.hasBody) continue;
    const content = body.body.endsWith("\n") ? body.body : `${body.body}\n`;
    out.push({
      roleId: info.roleId,
      kind: info.kind,
      content,
      diffPreview: boundedPreview(body.body, 4_000),
    });
  }
  return out;
}

// —————————————— 只读摘要 ——————————————

export function summarizeVersionChange(record: VersionChangeRecord): VcaSummary {
  return {
    applicationId: record.applicationId,
    kind: record.kind,
    initiatorRoleId: record.initiatorRoleId,
    flowId: record.flowId,
    status: record.status,
    summary: record.summary,
    bootstrap: record.bootstrap,
    baseTrunkVersion: record.baseTrunk?.trunkVersion ?? null,
    targets: record.targets.map((target) => ({
      kind: target.kind,
      path: target.path,
      action: target.action,
      version: versionOfPath(target.path),
      toSha256: target.toSha256,
    })),
    ...(record.submittedAt !== undefined ? { submittedAt: record.submittedAt } : {}),
    ...(record.decidedAt !== undefined ? { decidedAt: record.decidedAt } : {}),
    ...(record.decisionId !== undefined ? { decisionId: record.decisionId } : {}),
    ...(record.resultTrunkVersion !== undefined ? { resultTrunkVersion: record.resultTrunkVersion } : {}),
    at: record.at,
  };
}

export function summarizeStableWrite(record: StableWriteRecord): StableWriteSummary {
  return {
    requestId: record.requestId,
    roleId: record.roleId,
    path: record.path,
    kind: record.kind,
    baseSha256: record.baseSha256,
    targetSha256: record.targetSha256,
    status: record.status,
    ...(record.permitId !== undefined ? { permitId: record.permitId } : {}),
    ...(record.decisionId !== undefined ? { decisionId: record.decisionId } : {}),
    ...(record.confirmationId !== undefined ? { confirmationId: record.confirmationId } : {}),
    ...(record.approvedAt !== undefined ? { approvedAt: record.approvedAt } : {}),
    ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}),
    ...(record.consumedAt !== undefined ? { consumedAt: record.consumedAt } : {}),
    ...(record.writtenAt !== undefined ? { writtenAt: record.writtenAt } : {}),
    at: record.at,
  };
}

export function summarizeRefactor(record: RefactorRequestRecord): RefactorSummary {
  return {
    requestId: record.requestId,
    flowId: record.flowId,
    initiatedBy: record.initiatedBy,
    title: record.title,
    reason: record.reason,
    scope: record.scope,
    status: record.status,
    managedBy: record.managedBy,
    at: record.at,
    ...(record.updatedAt !== undefined ? { updatedAt: record.updatedAt } : {}),
  };
}

export function summarizeDocFreeze(entry: DocFreezeRecordInput): DocFreezeSummary {
  return {
    path: entry.path,
    version: entry.version,
    sha256: entry.sha256,
    frozen: true,
    reason: entry.freeze.reason,
    applicationId: entry.freeze.applicationId,
    ...(entry.freeze.decidedBy !== undefined ? { decidedBy: entry.freeze.decidedBy } : {}),
    ...(entry.freeze.reason === "migrated-legacy" ? { migrationMark: "migrated-legacy" as const } : {}),
    at: entry.freeze.frozenAt,
  };
}

// —————————————— 运行时组合（每项目一份） ——————————————

export interface InitResult {
  ok: boolean;
  cacheHealth: CacheHealth;
  code?: string;
  message?: string;
}

export interface StableWriteCompletion {
  ok: boolean;
  skipped?: boolean;
  code?: string;
  message?: string;
  requestId?: string;
}

export interface VersionChangeStackOptions {
  projectRoot: string;
  now?: () => Date;
  /** 事件落账（缺省生产 `appendTaskEvent`）；事件写失败只诊断，不回滚已完成的业务状态。 */
  emitEvent?: (event: TaskStateEvent) => Promise<void> | void;
  /** 每个事件落账后回调（主进程据此 debounce 推 `trunk:state`）。 */
  onEvent?: (event: TaskStateEvent) => void;
  /** 幕僚/运营通知（只通知，无批准权）。 */
  notify?: (message: string) => void | Promise<void>;
  /** 卡通道（由 SessionManager/Interface 注入；缺省 ⇒ 无 presenter，fail-closed）。 */
  presentVersionChangeCard?: (record: VersionChangeRecord) => Promise<VcaCardOutcome>;
  presentAmendmentItemCard?: (input: AmendmentItemPresentation) => Promise<AmendmentItemOutcome>;
  presentStableWriteCard?: (record: StableWriteRecord, preview: StableWritePreview) => Promise<StableWriteCardOutcome>;
  /** 迁移完成判定（缺省由本栈在 `ensureInitialized` 后置 true）。 */
  migrationCompleted?: () => boolean;
  /** 重构 flow 存在性（生产可由项目状态注入；缺省 true，S4 默认）。 */
  flowExists?: (flowId: string) => boolean | Promise<boolean>;
  allowedModuleRoots?: readonly string[];
}

export interface AmendmentItemPresentation {
  applicationId: string;
  record: VersionChangeRecord;
  item: SnapshotItem;
  index: number;
  total: number;
  acknowledgments?: CustomerInputAcknowledgement[];
}

export interface TrunkUpgradeRequestResult {
  ok: boolean;
  previewId?: string;
  preview?: TrunkUpgradePreviewV1;
  code?: string;
  error?: string;
}

export interface TrunkOperationResult {
  ok: boolean;
  status?: string;
  trunkVersion?: number;
  /** refreeze：实际变化的 stable 路径（workflow / roleCards.<role> / boundaries.<role>）。 */
  changed?: string[];
  code?: string;
  error?: string;
}

export interface VersionChangeStack {
  readonly projectRoot: string;
  /** 预加载/刷新：迁移（missing ⇒ 一律冻结）→ C2b 快照 → 重建许可快照。幂等；失败可重试。 */
  ensureInitialized(): Promise<InitResult>;
  refreshFreezeState(): Promise<InitResult>;
  /** run-role gate 的同步候选许可（runtime 候选 + 重启后从 S2 重建的许可）。 */
  stablePermitOf(relPath: string): StableWritePermit | undefined;
  /** 写入后复核/消费/mini re-pin（F16：由 after-write 钩子调用；桌面不写盘）。 */
  completeStableWriteAfterWrite(relPath: string, actualSha256: string, at?: string): Promise<StableWriteCompletion>;
  onAppointmentWriteApproved(input: {
    roleId: string;
    kind: "role-card" | "boundary";
    content: string;
    confirmationId: string;
    diffPreview?: string;
    at?: string;
  }): Promise<{ ok: boolean; code?: string; message?: string }>;
  requestWorkflowWrite(input: {
    roleId: string;
    content: string | Uint8Array;
    diffPreview?: string;
    requestId?: string;
    at?: string;
  }): Promise<{ ok: boolean; code?: string; message?: string; cardOutcome?: string }>;
  /** Batch 3.5 / C1d：product/rapporteur 的 `submit_version_change` 能力实现（只提交，不批准）。 */
  submitVersionChange(input: SubmitVersionChangeInput, signal?: AbortSignal): Promise<SubmitVersionChangeResult>;
  /** Batch 3.5 / C1d：convener 的 `submit_refactor` 能力实现（只记录，不派发/不写代码）。 */
  submitRefactor(input: SubmitRefactorInput, signal?: AbortSignal): Promise<SubmitRefactorResult>;
  /** Batch 3.5 / C1d：convener 的 `request_stable_write` 能力实现（提交确认请求；不签发许可）。 */
  requestStableWrite(input: RequestStableWriteInput, signal?: AbortSignal): Promise<RequestStableWriteResult>;
  listVersionChanges(options?: { flowId?: string; status?: string }): Promise<VersionChangeRecord[]>;
  /** 对 submitted VCA 重发批准卡（无通道 ⇒ vca-channel-unavailable；不改 VCA 状态）。 */
  presentVersionChange(applicationId: string): Promise<
    | { ok: true; record: VersionChangeRecord; needsItems: boolean; resultTrunkVersion?: number }
    | { ok: false; code: string; message?: string }
  >;
  /** detail-amendment 批准后逐项卡收集（S4 `runAmendmentItems`；不改状态）。 */
  runAmendmentItems(applicationId: string): Promise<
    | { ok: true; decisions: ItemDecision[]; cancelled: boolean }
    | { ok: false; code: string; message?: string }
  >;
  /** 执行逐项确认（S4 `applyAmendmentItems`：只冻结 applied 项 → trunk apply → applied 事件）。 */
  applyAmendmentItems(
    applicationId: string,
    input: { decisionId: string; decisions: ItemDecision[] },
  ): Promise<
    | { ok: true; record: VersionChangeRecord; resultTrunkVersion: number }
    | { ok: false; code: string; message?: string }
  >;
  listStableWrites(): Promise<StableWriteRecord[]>;
  listRefactorRequests(): Promise<RefactorRequestRecord[]>;
  listDocFreezes(limit?: number): Promise<DocFreezeListView & { ok: boolean; code?: string; message?: string }>;
  trunkState(): Promise<TrunkStatePayloadV1>;
  trunkList(): Promise<{ ok: boolean; trunks: TrunkListEntry[]; error?: string }>;
  requestTrunkUpgrade(input: { reason: "emergency" | "recovery"; scope?: string[] }): Promise<TrunkUpgradeRequestResult>;
  confirmTrunkUpgrade(input: { previewId: string; acknowledged: boolean }): Promise<TrunkOperationResult>;
  recoverTrunk(input: { reason: string; acknowledged: boolean }): Promise<TrunkOperationResult>;
  /** S5 `refreeze`：只更新 stable 快照（不升 trunkVersion）；客户 decisionId + 高危确认。 */
  refreeze(input: { reason: string; acknowledged: boolean }): Promise<TrunkOperationResult>;
  /** S5 `abandonUpgrade`：放弃升级（不 re-pin/不改指针）；返回 refrozen-cancelled 审计。 */
  abandonUpgrade(input: { reason: string; acknowledged: boolean }): Promise<TrunkOperationResult>;
  /** S5 `history`：已归档 trunk 版本号 + 当前版本（只读，不虚构归档内容）。 */
  history(): Promise<{ ok: boolean; versions: number[]; currentTrunkVersion: number | null; error?: string }>;
  /** S7 AC-13：stable boundary 预览文本扩大检测（只读；预览不可解析 ⇒ fail-closed expanded:true）。 */
  detectStableBoundaryExpansion(input: {
    roleId: string;
    fromPath: string;
    toYamlText: string;
  }): Promise<{ expanded: boolean; expansions: string[] }>;
  dispose(): void;
}

function snapshotHealth(snapshot: VersionedDocFreezeSnapshot): CacheHealth {
  if (snapshot.state === "ready") return "ok";
  if (snapshot.state === "migration-required") return "missing-migrated";
  return "corrupt-failclosed";
}

function stableKeyOf(relPath: string): string | undefined {
  const info = stableWritePathOf(relPath);
  return info === undefined ? undefined : info.path.toLowerCase();
}

async function fileSha256(projectRoot: string, relPath: string): Promise<string | undefined> {
  try {
    return createHash("sha256").update(await readFile(path.join(projectRoot, relPath))).digest("hex");
  } catch {
    return undefined;
  }
}

/**
 * 构建版本变更/冻结/stable/重构/trunk 的桌面栈（每项目一份；纯组合，不做业务判定）。
 * 依赖：S2 `createVersionChangeIntegration`（S1 存储 + S2 Service + trunk service）+ S4 四句柄。
 */
export function createVersionChangeStack(options: VersionChangeStackOptions): VersionChangeStack {
  const root = path.resolve(options.projectRoot);
  const now = options.now ?? (() => new Date());
  const diagnostic = createDiagnosticLogger({ component: "desktop.version-change", projectRoot: root });
  let migrationDone = options.migrationCompleted?.() === true;
  let initPromise: Promise<InitResult> | undefined;
  const restoredPermits = new Map<string, StableWritePermit>();
  const upgradePreviews = new Map<
    string,
    {
      preview: TrunkUpgradePreviewV1;
      target: TrunkApplySnapshot;
      flowId: string;
      runId: string | null;
    }
  >();
  let previewSeq = 0;
  // 提交日志对账只在本栈首个 `trunk:state` 做一次（crash 后补写幂等事件）；避免每次推送重复
  // reconcile 造成「split 状态 → 补写事件 → 再推送」的事件环（journal phase 由 S2 对账报告，不自动改写）。
  let reconcileOnce: Promise<void> | undefined;
  const reconcileOnceBestEffort = (): Promise<void> => {
    if (reconcileOnce === undefined) {
      reconcileOnce = (async () => {
        try {
          await trunkRuntime.reconcile();
        } catch {
          /* 对账失败不影响只读投影；issues 由 status 如实给出 */
        }
      })();
    }
    return reconcileOnce;
  };

  const integration = createVersionChangeIntegration({
    projectRoot: root,
    now,
    migrationCompleted: () => migrationDone,
    runRepin: createRunRepinPort(root),
  });
  const { services, trunk: trunkService, freezeCache, refactorRequests } = integration;

  const emitEvent = async (event: TaskStateEvent): Promise<void> => {
    try {
      if (options.emitEvent !== undefined) await options.emitEvent(event);
      else {
        const result = await appendTaskEvent(root, event);
        if (!result.ok) diagnostic.error("event.append.failed", new Error(result.message), { kind: event.kind });
      }
    } catch (error) {
      diagnostic.error("event.emit.failed", error, { kind: event.kind });
    }
    try {
      options.onEvent?.(event);
    } catch {
      /* 推送失败只诊断（面板可经下一次查询恢复） */
    }
  };

  const trunkRuntime: TrunkRuntime = createTrunkRuntime({
    projectRoot: root,
    service: trunkService,
    emitEvent,
    now,
  });

  const presenter: VersionChangePresenter | undefined =
    options.presentVersionChangeCard === undefined
      ? undefined
      : {
          async presentVersionChange({ record }) {
            return options.presentVersionChangeCard!(record);
          },
          ...(options.presentAmendmentItemCard !== undefined
            ? {
                async presentAmendmentItem(input) {
                  const record = (await services.vca.list()).find(
                    (candidate) => candidate.applicationId === input.applicationId,
                  );
                  if (record === undefined) return { outcome: "unavailable" as const };
                  const expansion = await trunkService.detectBoundaryExpansion([input.item]);
                  const acknowledgments =
                    expansion.expanded
                      ? expansion.expansions.map((label, index) => ({
                          id: `boundary-expansion-${index}`,
                          label,
                          required: true,
                        }))
                      : undefined;
                  return options.presentAmendmentItemCard!({
                    applicationId: input.applicationId,
                    record,
                    item: input.item,
                    index: input.index,
                    total: input.total,
                    ...(acknowledgments !== undefined ? { acknowledgments } : {}),
                  });
                },
              }
            : {}),
        };

  const versionChangeRuntime: VersionChangeRuntime = createVersionChangeRuntime({
    projectRoot: root,
    services,
    trunkService,
    trunkRuntime,
    emitEvent,
    ...(presenter !== undefined ? { presenter } : {}),
    ...(options.notify !== undefined ? { notify: options.notify } : {}),
    now,
  });

  const stablePresenter: StableWritePresenter | undefined =
    options.presentStableWriteCard === undefined
      ? undefined
      : {
          async presentWorkflowWrite(input) {
            return options.presentStableWriteCard!(input.record, input.preview);
          },
        };

  const stableWriteRuntime: StableWriteRuntime = createStableWriteRuntime({
    stableWrite: services.stableWrite,
    trunkRuntime: { completeStableWrite: (input) => trunkRuntime.completeStableWrite(input) },
    emitEvent,
    ...(stablePresenter !== undefined ? { presenter: stablePresenter } : {}),
    ...(options.notify !== undefined ? { notify: options.notify } : {}),
    now,
  });

  const refactorRuntime: RefactorRuntime = createRefactorRuntime({
    store: refactorRequests,
    validator: services.refactor,
    emitEvent,
    ...(options.flowExists !== undefined ? { flowExists: options.flowExists } : {}),
    ...(options.allowedModuleRoots !== undefined ? { allowedModuleRoots: options.allowedModuleRoots } : {}),
    now,
  });

  async function rebuildPermitSnapshot(): Promise<void> {
    const records = await services.stableWrite.list();
    const permits: StableWritePermit[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      if (record.status !== "approved") continue;
      const permit = await services.stableWrite.findPermit(record.path);
      if (permit === undefined || permit.requestId !== record.requestId || seen.has(permit.permitId)) continue;
      seen.add(permit.permitId);
      permits.push(permit);
    }
    installStableWritePermitSnapshot(root, permits);
    restoredPermits.clear();
    for (const permit of permits) {
      const key = stableKeyOf(permit.path);
      if (key !== undefined) restoredPermits.set(key, permit);
    }
  }

  async function initialize(): Promise<InitResult> {
    const at = now().toISOString();
    const migration = await integration.ensureMigration(at);
    if (!migration.ok) {
      return {
        ok: false,
        cacheHealth: migration.code === "doc-freeze-registry-corrupt" ? "corrupt-failclosed" : "missing-migrated",
        code: migration.code,
        ...(migration.message !== undefined ? { message: migration.message } : {}),
      };
    }
    migrationDone = true;
    // 迁移完成后以 completed=true 重新构建 C2b 快照（missing 迁移后不得停留在 migration-required）。
    const snapshot = await refreshVersionedDocFreezeSnapshot(root, { migrationCompleted: true, now });
    await rebuildPermitSnapshot();
    return { ok: true, cacheHealth: snapshotHealth(snapshot) };
  }

  function ensureInitialized(): Promise<InitResult> {
    if (initPromise === undefined) {
      initPromise = initialize().then(
        (result) => {
          if (!result.ok) initPromise = undefined;
          return result;
        },
        (error) => {
          initPromise = undefined;
          throw error;
        },
      );
    }
    return initPromise;
  }

  function stablePermitOf(relPath: string): StableWritePermit | undefined {
    const candidate = stableWriteRuntime.stablePermitOf(relPath);
    if (candidate !== undefined) return candidate;
    const key = stableKeyOf(relPath);
    return key === undefined ? undefined : restoredPermits.get(key);
  }

  async function buildStableTarget(
    manifest: TrunkManifest,
  ): Promise<{ ok: true; target: TrunkApplySnapshot; changes: TrunkUpgradePreviewV1["changes"] } | { ok: false; error: string }> {
    const changes: TrunkUpgradePreviewV1["changes"] = [];
    const hashRef = async (
      kind: TrunkStableFileKind,
      ref: { path: string; sha256: string },
      roleId?: string,
    ): Promise<{ path: string; sha256: string } | undefined> => {
      const sha = await fileSha256(root, ref.path);
      if (sha === undefined) return undefined;
      if (sha.toLowerCase() !== ref.sha256.toLowerCase()) {
        changes.push({
          kind,
          ...(roleId !== undefined ? { roleId } : {}),
          path: ref.path,
          oldSha: ref.sha256,
          newSha: sha,
        });
      }
      return { path: ref.path, sha256: sha };
    };
    const workflow = await hashRef("workflow", manifest.artifacts.workflow);
    if (workflow === undefined) {
      return { ok: false, error: mainT("main.interface.readFileFailed", { detail: manifest.artifacts.workflow.path }) };
    }
    const roleCards: Record<string, { path: string; sha256: string }> | undefined =
      manifest.artifacts.roleCards === undefined ? undefined : {};
    if (roleCards !== undefined) {
      for (const [roleId, ref] of Object.entries(manifest.artifacts.roleCards ?? {})) {
        const hashed = await hashRef("role-card", ref, roleId);
        if (hashed === undefined) return { ok: false, error: mainT("main.interface.readFileFailed", { detail: ref.path }) };
        roleCards[roleId] = hashed;
      }
    }
    const boundaries: Record<string, { path: string; sha256: string }> = {};
    for (const [roleId, ref] of Object.entries(manifest.artifacts.boundaries)) {
      const hashed = await hashRef("boundary", ref, roleId);
      if (hashed === undefined) return { ok: false, error: mainT("main.interface.readFileFailed", { detail: ref.path }) };
      boundaries[roleId] = hashed;
    }
    const documents: TrunkApplySnapshot["documents"] = {};
    for (const [kind, ref] of Object.entries(manifest.artifacts.documents)) {
      if (ref === undefined) continue;
      documents[kind as TrunkDocKind] = { path: ref.path, sha256: ref.sha256 };
    }
    const teamPlan = manifest.artifacts.execution.teamPlan;
    const flow = manifest.artifacts.execution.flow;
    return {
      ok: true,
      changes,
      target: {
        trunkVersion: manifest.trunkVersion,
        runId: manifest.runId,
        documents,
        execution: {
          teamPlan: teamPlan === null ? null : { path: teamPlan.path, sha256: teamPlan.sha256 },
          flow: flow === null ? null : { path: flow.path, sha256: flow.sha256, version: flow.version },
        },
        workflow,
        ...(roleCards !== undefined ? { roleCards } : {}),
        boundaries,
      },
    };
  }

  async function nextRefactorId(): Promise<string> {
    const records = await refactorRuntime.list();
    let max = 0;
    for (const record of records) {
      const match = /^rf-(\d+)$/.exec(record.requestId);
      if (match !== null) max = Math.max(max, Number(match[1]));
    }
    return `rf-${max + 1}`;
  }

  /** refreeze 目标：当前 manifest 的 stable 快照 + **磁盘字节哈希**（服务端再复核；不升 trunkVersion）。 */
  async function stableSnapshotTarget(
    manifest: TrunkManifest,
  ): Promise<{ ok: true; target: TrunkStableSnapshotTarget } | { ok: false; error: string }> {
    const workflowSha = await fileSha256(root, manifest.artifacts.workflow.path);
    if (workflowSha === undefined) {
      return { ok: false, error: mainT("main.interface.readFileFailed", { detail: manifest.artifacts.workflow.path }) };
    }
    const roleCards: Record<string, { path: string; sha256: string }> = {};
    for (const [roleId, ref] of Object.entries(manifest.artifacts.roleCards ?? {})) {
      const sha = await fileSha256(root, ref.path);
      if (sha === undefined) return { ok: false, error: mainT("main.interface.readFileFailed", { detail: ref.path }) };
      roleCards[roleId] = { path: ref.path, sha256: sha };
    }
    const boundaries: Record<string, { path: string; sha256: string }> = {};
    for (const [roleId, ref] of Object.entries(manifest.artifacts.boundaries)) {
      const sha = await fileSha256(root, ref.path);
      if (sha === undefined) return { ok: false, error: mainT("main.interface.readFileFailed", { detail: ref.path }) };
      boundaries[roleId] = { path: ref.path, sha256: sha };
    }
    return {
      ok: true,
      target: {
        workflow: { path: manifest.artifacts.workflow.path, sha256: workflowSha },
        roleCards,
        boundaries,
      },
    };
  }

  async function freezeCount(): Promise<number> {
    // 只读投影：派生缓存从 R9 baseline 对账/重建（写入者是 Provider，不是桌面）；
    // 不可用时按 0 显示（`doc-freeze:list`/`trunk:state.cacheHealth` 另行如实标 fail-closed）。
    try {
      const reconciled = await freezeCache.reconcile();
      return reconciled.state === "unusable" ? 0 : reconciled.cache.entries.length;
    } catch {
      return 0;
    }
  }

  async function collectDocFreezes(limit: number): Promise<DocFreezeListView & { ok: boolean; code?: string; message?: string }> {
    const init = await ensureInitialized();
    let reconciled;
    try {
      reconciled = await freezeCache.reconcile();
    } catch (error) {
      return {
        ok: false,
        freezes: [],
        cacheHealth: "corrupt-failclosed",
        code: "doc-freeze-registry-unavailable",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (reconciled.state === "unusable") {
      const health: CacheHealth = reconciled.reason === "baseline-missing" ? "missing-migrated" : "corrupt-failclosed";
      return {
        ok: false,
        freezes: [],
        cacheHealth: init.cacheHealth === "corrupt-failclosed" ? init.cacheHealth : health,
        code: "doc-freeze-registry-unavailable",
        message: reconciled.message,
      };
    }
    const cache = reconciled.cache;
    const entries: DocFreezeSummary[] = cache.entries.map((entry) => ({
      path: entry.path,
      version: entry.version,
      sha256: entry.sha256,
      frozen: entry.frozen === true,
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      ...(entry.applicationId !== undefined ? { applicationId: entry.applicationId } : {}),
      ...(entry.frozen === true
        ? entry.reason === "migrated-legacy"
          ? { migrationMark: "migrated-legacy" as const }
          : {}
        : entry.migratedDraft === true
          ? { migrationMark: "migrated-draft" as const }
          : {}),
      at: cache.builtAt,
    }));
    entries.sort((a, b) => (a.path === b.path ? a.version - b.version : a.path < b.path ? -1 : 1));
    const health = init.cacheHealth === "corrupt-failclosed" ? "corrupt-failclosed" as const : snapshotHealth(cache);
    return { ok: true, freezes: entries.slice(0, Math.max(1, Math.min(500, Math.floor(limit)))), cacheHealth: health };
  }

  return {
    projectRoot: root,
    ensureInitialized,
    async refreshFreezeState() {
      initPromise = undefined;
      return ensureInitialized();
    },
    stablePermitOf,
    async completeStableWriteAfterWrite(relPath, actualSha256, at) {
      const permit = stablePermitOf(relPath);
      if (permit === undefined) return { ok: true, skipped: true };
      const completed = await stableWriteRuntime.completeWrite({
        requestId: permit.requestId,
        actualSha256,
        at: at ?? now().toISOString(),
      });
      if (completed.ok) {
        const key = stableKeyOf(relPath);
        if (key !== undefined) restoredPermits.delete(key);
        return { ok: true, requestId: completed.value.record.requestId };
      }
      return {
        ok: false,
        code: completed.code,
        ...(completed.message !== undefined ? { message: completed.message } : {}),
        requestId: permit.requestId,
      };
    },
    async onAppointmentWriteApproved(input) {
      const approved = await stableWriteRuntime.onAppointmentWriteApproved({
        roleId: input.roleId,
        kind: input.kind,
        content: input.content,
        confirmationId: input.confirmationId,
        ...(input.diffPreview !== undefined ? { diffPreview: input.diffPreview } : {}),
        ...(input.at !== undefined ? { at: input.at } : {}),
      });
      return approved.ok
        ? { ok: true }
        : { ok: false, code: approved.code, ...(approved.message !== undefined ? { message: approved.message } : {}) };
    },
    async requestWorkflowWrite(input) {
      const result = await stableWriteRuntime.requestWorkflowWrite({
        roleId: input.roleId,
        content: input.content,
        ...(input.diffPreview !== undefined ? { diffPreview: input.diffPreview } : {}),
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
        ...(input.at !== undefined ? { at: input.at } : {}),
      });
      return result.ok
        ? {
            ok: true,
            ...(result.value.cardOutcome !== undefined ? { cardOutcome: result.value.cardOutcome } : {}),
          }
        : { ok: false, code: result.code, ...(result.message !== undefined ? { message: result.message } : {}) };
    },
    // —————————————— Batch 3.5 / C1d：三提交能力（只提交，不批准/不签发许可） ——————————————
    async submitVersionChange(input, signal) {
      if (signal?.aborted) return { ok: false, errorCode: "vca-invalid", message: "发起轮次已中止——未提交。" };
      try {
        const at = now().toISOString();
        const current = await trunkService.current();
        const baseTrunk = input.bootstrap === true ? null : current;
        let amendmentItems: SnapshotItem[] | undefined;
        if (input.kind === "detail-amendment" && input.amendmentDocPath !== undefined) {
          const validated = await trunkService.validateAmendment({
            amendmentDocPath: input.amendmentDocPath,
            flowId: input.flowId,
          });
          if (!validated.ok) {
            return { ok: false, errorCode: "vca-invalid", message: validated.message ?? validated.code };
          }
          amendmentItems = validated.value.items;
        }
        const result = await versionChangeRuntime.submit({
          kind: input.kind,
          initiatorRoleId: input.initiatorRoleId,
          flowId: input.flowId,
          baseTrunk,
          ...(input.bootstrap !== undefined ? { bootstrap: input.bootstrap } : {}),
          targets: input.targets.map((target) => ({
            kind: target.kind,
            path: target.path,
            action: target.action,
            ...(target.from !== undefined ? { from: target.from } : {}),
            ...(target.roleId !== undefined ? { roleId: target.roleId } : {}),
          })),
          ...(input.amendmentId !== undefined ? { amendmentId: input.amendmentId } : {}),
          ...(input.amendmentDocPath !== undefined ? { amendmentDocPath: input.amendmentDocPath } : {}),
          ...(amendmentItems !== undefined ? { amendmentItems } : {}),
          summary: input.summary,
          at,
        });
        if (!result.ok) {
          return { ok: false, errorCode: result.code, ...(result.message !== undefined ? { message: result.message } : {}) };
        }
        if (result.value.status !== "submitted") {
          return {
            ok: false,
            errorCode: "vca-conflict",
            message: `同目标 VCA 已存在（status=${result.value.status}）；不重复提交，请查看版本变更面板。`,
          };
        }
        return { ok: true, applicationId: result.value.applicationId, status: "submitted" };
      } catch (error) {
        return {
          ok: false,
          errorCode: "vca-invalid",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async submitRefactor(input, signal) {
      if (signal?.aborted) return { ok: false, errorCode: "refactor-invalid", message: "发起轮次已中止——未提交。" };
      try {
        const requestId = await nextRefactorId();
        const result = await refactorRuntime.submit({
          requestId,
          flowId: input.flowId,
          roleId: input.roleId,
          title: input.title,
          reason: input.reason,
          scope: input.scope,
          at: now().toISOString(),
        });
        if (!result.ok) {
          return { ok: false, errorCode: result.code, ...(result.message !== undefined ? { message: result.message } : {}) };
        }
        return {
          ok: true,
          requestId: result.value.record.requestId,
          status: result.value.record.status,
        };
      } catch (error) {
        return {
          ok: false,
          errorCode: "refactor-invalid",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async requestStableWrite(input, signal) {
      if (signal?.aborted) {
        return { ok: false, errorCode: "stable-write-invalid", message: "发起轮次已中止——未提交。" };
      }
      try {
        // S4 `requestWorkflowWrite`：记录请求 → 客户 stable-write 确认卡 → 客户批准后 S2 签发一次性许可。
        // **本能力不签发许可/不批准**；成功后按工具冻结回执返回 `requested`（许可已在确认后签发）。
        const result = await stableWriteRuntime.requestWorkflowWrite({
          roleId: input.roleId,
          content: input.content,
          at: now().toISOString(),
        });
        if (!result.ok) {
          return {
            ok: false,
            errorCode: "stable-write-write-failed",
            message:
              result.code === "vca-channel-unavailable"
                ? `无客户确认卡通道：${result.message ?? "请求已记录但未发卡；请先打开治理会话后重试"}`
                : result.message ?? result.code,
          };
        }
        const record = result.value.record;
        if (record.status === "rejected") {
          return {
            ok: false,
            status: "rejected",
            errorCode: "stable-write-write-failed",
            message: "客户拒绝 stable 写入；未签发许可、未写入。",
          };
        }
        if (record.status === "requested" || record.status === "approved") {
          return { ok: true, requestId: record.requestId, status: "requested" };
        }
        return {
          ok: false,
          status: record.status,
          errorCode: "stable-write-write-failed",
          message: `stable-write 状态 ${record.status}；未获可用许可。`,
        };
      } catch (error) {
        return {
          ok: false,
          errorCode: "stable-write-write-failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    listVersionChanges(filter) {
      return versionChangeRuntime.list(
        filter === undefined
          ? undefined
          : {
              ...(filter.flowId !== undefined ? { flowId: filter.flowId } : {}),
              ...(filter.status !== undefined ? { status: filter.status as VersionChangeRecord["status"] } : {}),
            },
      );
    },
    async presentVersionChange(applicationId) {
      const result = await versionChangeRuntime.present(applicationId);
      return result.ok
        ? {
            ok: true,
            record: result.value.record,
            needsItems: result.value.needsItems,
            ...(result.value.resultTrunkVersion !== undefined
              ? { resultTrunkVersion: result.value.resultTrunkVersion }
              : {}),
          }
        : { ok: false, code: result.code, ...(result.message !== undefined ? { message: result.message } : {}) };
    },
    async runAmendmentItems(applicationId) {
      const result = await versionChangeRuntime.runAmendmentItems(applicationId);
      return result.ok
        ? { ok: true, decisions: result.value.decisions, cancelled: result.value.cancelled }
        : { ok: false, code: result.code, ...(result.message !== undefined ? { message: result.message } : {}) };
    },
    async applyAmendmentItems(applicationId, input) {
      const result = await versionChangeRuntime.applyAmendmentItems(applicationId, input);
      return result.ok
        ? {
            ok: true,
            record: result.value.record,
            resultTrunkVersion: result.value.resultTrunkVersion,
          }
        : { ok: false, code: result.code, ...(result.message !== undefined ? { message: result.message } : {}) };
    },
    listStableWrites() {
      return stableWriteRuntime.list();
    },
    listRefactorRequests() {
      return refactorRuntime.list();
    },
    listDocFreezes(limit = 100) {
      return collectDocFreezes(limit);
    },
    async trunkState() {
      const init = await ensureInitialized();
      await reconcileOnceBestEffort();
      const [view, vcas, refactors, freezes] = await Promise.all([
        trunkRuntime.status(),
        services.vca.list(),
        refactorRuntime.list(),
        freezeCount(),
      ]);
      const pending = vcas.filter((record) => record.status === "submitted" || record.status === "approved").map(summarizeVersionChange);
      return buildTrunkStatePayload({
        projectRoot: root,
        view,
        generatedAt: now().toISOString(),
        cacheHealth: init.cacheHealth,
        freezeCount: freezes,
        versionChanges: pending,
        refactors: refactors.map(summarizeRefactor),
      });
    },
    async trunkList() {
      try {
        const view = await trunkRuntime.status();
        const manifest = view.manifest;
        if (manifest === undefined) return { ok: true, trunks: [] };
        return {
          ok: true,
          trunks: [
            {
              trunkVersion: manifest.trunkVersion,
              runId: manifest.runId,
              digest: manifest.digest,
              source: manifest.source,
              availability: view.availability,
              current: true,
            },
          ],
        };
      } catch (error) {
        return { ok: false, trunks: [], error: error instanceof Error ? error.message : String(error) };
      }
    },
    async requestTrunkUpgrade(input) {
      if (input.reason !== "emergency" && input.reason !== "recovery") {
        return { ok: false, code: "trunk-apply-failed", error: mainT("ui.trunk.emergencyOnly") };
      }
      const init = await ensureInitialized();
      if (init.cacheHealth === "corrupt-failclosed") {
        return { ok: false, code: "trunk-verify-failed", error: mainT("ui.freeze.failClosed") };
      }
      const view: TrunkStatusView = await trunkRuntime.status();
      const manifest = view.manifest;
      if (manifest === undefined || view.availability === "unavailable") {
        return { ok: false, code: "trunk-unavailable", error: mainT("ui.trunk.upgrade.disabledNoTrunk") };
      }
      const built = await buildStableTarget(manifest);
      if (!built.ok) return { ok: false, code: "trunk-apply-failed", error: built.error };
      previewSeq += 1;
      const previewId = `tup-${previewSeq}-${now().getTime().toString(36)}`;
      const preview: TrunkUpgradePreviewV1 = {
        previewId,
        reason: input.reason,
        scope: Array.isArray(input.scope) ? input.scope.slice(0, 20).map((item) => String(item).slice(0, 200)) : [],
        trunkVersion: manifest.trunkVersion,
        changes: built.changes,
        expiresAt: new Date(now().getTime() + 10 * 60 * 1000).toISOString(),
      };
      upgradePreviews.set(previewId, {
        preview,
        target: built.target,
        flowId: manifest.flowId,
        runId: manifest.runId,
      });
      return { ok: true, previewId, preview };
    },
    async confirmTrunkUpgrade(input) {
      if (input.acknowledged !== true) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", error: mainT("ui.trunk.upgrade.highRisk") };
      }
      const stored = upgradePreviews.get(input.previewId);
      if (stored === undefined) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", error: mainT("main.customerInput.noPendingRequest") };
      }
      upgradePreviews.delete(input.previewId); // 一次性
      if (Date.parse(stored.preview.expiresAt) <= now().getTime()) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", error: mainT("main.customerInput.noPendingRequest") };
      }
      const result = await trunkRuntime.mainUpgrade({
        reason: stored.preview.reason,
        decisionId: `trunk-upgrade-${input.previewId}`,
        highRisk: { acknowledged: true, items: stored.preview.scope },
        flowId: stored.flowId,
        runId: stored.runId,
        target: stored.target,
        journalId: `j-${input.previewId}`,
        at: now().toISOString(),
      });
      return result.ok
        ? { ok: true, status: "applied", trunkVersion: result.value.manifest.trunkVersion }
        : { ok: false, code: result.code, ...(result.message !== undefined ? { error: result.message } : {}) };
    },
    async recoverTrunk(input) {
      if (input.acknowledged !== true) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", error: mainT("ui.trunk.upgrade.highRisk") };
      }
      if (input.reason.trim() === "") {
        return { ok: false, code: "trunk-recovery-invalid", error: mainT("ui.trunk.upgrade.reason") };
      }
      const result = await trunkRuntime.recover({
        decisionId: `trunk-recovery-${now().getTime().toString(36)}`,
        reason: input.reason.slice(0, 500),
        at: now().toISOString(),
      });
      return result.ok
        ? { ok: true, status: "recovered", trunkVersion: result.value.manifest.trunkVersion }
        : { ok: false, code: result.code, ...(result.message !== undefined ? { error: result.message } : {}) };
    },
    async refreeze(input) {
      if (input.acknowledged !== true) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", error: mainT("ui.trunk.upgrade.highRisk") };
      }
      const reason = input.reason.trim();
      if (reason === "") {
        return { ok: false, code: "trunk-apply-failed", error: mainT("ui.trunk.upgrade.reason") };
      }
      const view = await trunkRuntime.status();
      const manifest = view.manifest;
      if (manifest === undefined || view.availability === "unavailable") {
        return { ok: false, code: "trunk-unavailable", error: mainT("ui.trunk.upgrade.disabledNoTrunk") };
      }
      const target = await stableSnapshotTarget(manifest);
      if (!target.ok) return { ok: false, code: "trunk-apply-failed", error: target.error };
      const at = now().toISOString();
      const result = await trunkService.refreeze({
        decisionId: `trunk-refreeze-${now().getTime().toString(36)}`,
        reason: reason.slice(0, 500),
        highRisk: { acknowledged: true },
        target: target.target,
        at,
      });
      if (!result.ok) {
        return { ok: false, code: result.code, ...(result.message !== undefined ? { error: result.message } : {}) };
      }
      // 审计由应用侧写账本（S5 只返回载荷，不写账本）；`trunk.state(op:"refrozen")` 客户归属。
      await emitEvent({ v: 1, ...result.value.audit } as TaskStateEvent);
      return {
        ok: true,
        status: "refrozen",
        trunkVersion: result.value.manifest.trunkVersion,
        changed: result.value.changed,
      };
    },
    async abandonUpgrade(input) {
      if (input.acknowledged !== true) {
        return { ok: false, code: "trunk-high-risk-unacknowledged", error: mainT("ui.trunk.upgrade.highRisk") };
      }
      const reason = input.reason.trim();
      if (reason === "") {
        return { ok: false, code: "trunk-apply-failed", error: mainT("ui.trunk.upgrade.reason") };
      }
      const at = now().toISOString();
      const result = await trunkService.abandonUpgrade({
        decisionId: `trunk-abandon-${now().getTime().toString(36)}`,
        reason: reason.slice(0, 500),
        at,
      });
      if (!result.ok) {
        return { ok: false, code: result.code, ...(result.message !== undefined ? { error: result.message } : {}) };
      }
      await emitEvent({ v: 1, ...result.value.audit } as TaskStateEvent);
      return {
        ok: true,
        status: "refrozen-cancelled",
        ...(result.value.manifest !== undefined ? { trunkVersion: result.value.manifest.trunkVersion } : {}),
        changed: [],
      };
    },
    async history() {
      try {
        const result = await trunkService.history();
        return result.ok
          ? {
              ok: true,
              versions: result.value.versions,
              currentTrunkVersion: result.value.currentTrunkVersion ?? null,
            }
          : {
              ok: false,
              versions: [],
              currentTrunkVersion: null,
              error: result.message ?? result.code,
            };
      } catch (error) {
        return {
          ok: false,
          versions: [],
          currentTrunkVersion: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    detectStableBoundaryExpansion(input) {
      return trunkService.detectStableBoundaryExpansion({
        projectRoot: root,
        roleId: input.roleId,
        fromPath: input.fromPath,
        toYamlText: input.toYamlText,
      });
    },
    dispose() {
      restoredPermits.clear();
      upgradePreviews.clear();
    },
  };
}

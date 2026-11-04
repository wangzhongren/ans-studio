// app/desktop/trunk.ts
// 桌面窗口 D1（trunk-amendment-model）：主干面板只读载荷与紧急/恢复升级的展示形状。
//
// 纪律（P1.6 §4.9/§4.10；PM 复审 F15/F16/F17）：
// · **单一状态源**：`trunk:state` 主→渲推送只由本模块的 `buildTrunkStatePayload` 组装；
//   U1 只读这一份，不另造第二套状态/不本地统计。
// · **F15**：stable 快照必须同时含 workflow / roleCards（role-card.md）/ boundaries（boundary.yaml）
//   三类；载荷是显示层投影，不改变 trunk manifest 逻辑。
// · 本项目模块**不写盘、不判冻结/哈希/permit/trunk 更新**：状态来自 S2 `TrunkStatusView`，
//   写入/校验/事件全部在编排 Pipeline/Service；桌面只做只读投影与结构化入参防御。
// · 文案只经共享 i18n（`mainT`），不硬编码。

import type {
  TrunkAvailability,
  TrunkSource,
  TrunkStableArtifactRef,
  TrunkStableFileKind,
} from "../../src/model/trunk.ts";
import type { TrunkStatusView } from "../../src/service/trunk/public/trunk-service.ts";
import { mainT } from "./i18n.ts";
import type { CacheHealth, RefactorSummary, VcaSummary } from "./version-change.ts";

/** 冻结缓存健康三态（与 `doc-freeze:list`/面板同词表；fail-closed 不外露第四种）。 */
export type TrunkCacheHealth = CacheHealth;

/** stable 文件快照的单一显示形状（kind 用于 U1 分组；F15 三类齐全）。 */
export interface TrunkStableView {
  kind: TrunkStableFileKind;
  path: string;
  sha256: string;
}

/** 版本变更/冻结/重构摘要的计数 + 有界列表（面板角标/列表共用，不本地统计）。 */
export interface TrunkStateSummarySection<T> {
  count: number;
  items: T[];
}

/** `trunk:state` 推送载荷 v1（**唯一状态源**；U1 只消费本形状）。 */
export interface TrunkStatePayloadV1 {
  version: 1;
  ok: boolean;
  projectRoot: string;
  generatedAt: string;
  availability: TrunkAvailability;
  trunkVersion: number | null;
  source: TrunkSource | null;
  runId: string | null;
  flowId: string | null;
  digest: string | null;
  derived: boolean;
  /** **F15**：workflow / roleCards / boundaries 三类 stable 快照（missing 项为空/缺省 null）。 */
  stable: {
    workflow: TrunkStableView | null;
    roleCards: Record<string, TrunkStableView>;
    boundaries: Record<string, TrunkStableView>;
  };
  amendment: {
    amendmentId: string;
    status: string;
    applyState: string;
    applicationId?: string;
  } | null;
  journal: {
    journalId: string;
    phase: string;
    result?: string;
  } | null;
  /** stable 写入已发生但无 trunk 快照可续接（待续接；不虚构快照）。 */
  pendingReattach: string[];
  issues: string[];
  freezes: TrunkStateSummarySection<unknown> & { cacheHealth: TrunkCacheHealth };
  pendingVersionChanges: TrunkStateSummarySection<VcaSummary>;
  refactors: TrunkStateSummarySection<RefactorSummary>;
  /**
   * 入口禁用原因（null = 可用）。文案经共享 i18n；U1 只据它禁用按钮，不自行推导。
   * 冻结缓存 corrupt ⇒ 依赖冻结判定的入口整体 fail-closed。
   */
  disables: {
    versionChange: string | null;
    stableWrite: string | null;
    trunkUpgrade: string | null;
    refactor: string | null;
  };
  error?: string;
}

function stableView(
  ref: TrunkStableArtifactRef | undefined,
  kind: TrunkStableFileKind,
): TrunkStableView | null {
  if (ref === undefined) return null;
  return { kind, path: ref.path, sha256: ref.sha256 };
}

function stableRoleMap(
  refs: Record<string, TrunkStableArtifactRef> | undefined,
  kind: TrunkStableFileKind,
): Record<string, TrunkStableView> {
  const out: Record<string, TrunkStableView> = {};
  if (refs === undefined) return out;
  for (const [roleId, ref] of Object.entries(refs)) out[roleId] = { kind, path: ref.path, sha256: ref.sha256 };
  return out;
}

/** 冻结缓存 corrupt 时的统一禁用原因（fail-closed；不自动重建/放开覆盖）。 */
export function freezeFailClosedText(): string {
  return mainT("ui.freeze.failClosed");
}

/**
 * 组装 `trunk:state` 载荷（纯函数；不读盘、不调 Service）。
 * 入参 = S2 `status()` 视图 + 桌面已查询的有界摘要 + 冻结缓存健康；只做投影与禁用原因派生。
 */
export function buildTrunkStatePayload(input: {
  projectRoot: string;
  view: TrunkStatusView;
  generatedAt: string;
  cacheHealth: TrunkCacheHealth;
  freezeCount: number;
  versionChanges: readonly VcaSummary[];
  refactors: readonly RefactorSummary[];
}): TrunkStatePayloadV1 {
  const { view } = input;
  const manifest = view.manifest;
  const frozenFailClosed = input.cacheHealth === "corrupt-failclosed";
  const unavailable = view.availability === "unavailable";
  const cacheReason = frozenFailClosed ? freezeFailClosedText() : null;
  const stable: TrunkStatePayloadV1["stable"] = {
    workflow: stableView(view.stable.workflow, "workflow"),
    roleCards: stableRoleMap(view.stable.roleCards, "role-card"),
    boundaries: stableRoleMap(view.stable.boundaries, "boundary"),
  };
  // 历史 P1.3 view 同时给出顶层 workflow/roleCards/boundaries；以 `stable` 为 U1 的主消费面。
  return {
    version: 1,
    ok: true,
    projectRoot: input.projectRoot,
    generatedAt: input.generatedAt,
    availability: view.availability,
    trunkVersion: manifest?.trunkVersion ?? null,
    source: manifest?.source ?? null,
    runId: manifest?.runId ?? null,
    flowId: manifest?.flowId ?? null,
    digest: manifest?.digest ?? null,
    derived: view.derived,
    stable,
    amendment:
      view.amendment === undefined
        ? null
        : {
            amendmentId: view.amendment.amendmentId,
            status: view.amendment.status,
            applyState: view.amendment.applyState,
            ...(view.amendment.applicationId !== undefined ? { applicationId: view.amendment.applicationId } : {}),
          },
    journal:
      view.journal === undefined
        ? null
        : {
            journalId: view.journal.journalId,
            phase: view.journal.phase,
            ...(view.journal.result !== undefined ? { result: view.journal.result } : {}),
          },
    pendingReattach: [...view.pendingReattach],
    issues: [...view.issues],
    freezes: { count: input.freezeCount, items: [], cacheHealth: input.cacheHealth },
    pendingVersionChanges: {
      count: input.versionChanges.length,
      items: [...input.versionChanges].slice(0, 20),
    },
    refactors: { count: input.refactors.length, items: [...input.refactors].slice(0, 20) },
    disables: {
      versionChange: cacheReason,
      stableWrite: cacheReason,
      // 主干升级只用于紧急/恢复：无 manifest / 派生态 / 不可用 ⇒ 禁用（版本化内容一律走 VCA）。
      trunkUpgrade: unavailable
        ? mainT("ui.trunk.upgrade.disabledUnavailable")
        : manifest === undefined || view.derived
          ? mainT("ui.trunk.upgrade.disabledNoTrunk")
          : cacheReason,
      refactor: null,
    },
  };
}

/** 主干升级预览（仅紧急/恢复；D1 客户 UI 二次确认绑定同一 previewId）。 */
export interface TrunkUpgradePreviewV1 {
  previewId: string;
  reason: "emergency" | "recovery";
  scope: string[];
  trunkVersion: number;
  /** stable 快照差异（old→new；空 = 仅紧急 re-pin/恢复，无 stable 变化）。 */
  changes: Array<{
    kind: TrunkStableFileKind;
    roleId?: string;
    path: string;
    oldSha: string;
    newSha: string;
  }>;
  /** 一次性预览过期时刻（ISO）；过期后确认被拒绝（不自动重发）。 */
  expiresAt: string;
}

/** `trunk:list` 的单行摘要（历史留待 S2 暴露；不虚构历史）。 */
export interface TrunkListEntry {
  trunkVersion: number;
  runId: string | null;
  digest: string;
  source: TrunkSource;
  availability: TrunkAvailability;
  current: true;
}

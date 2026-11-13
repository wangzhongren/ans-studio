// app/desktop/session/diagnostics.ts
// B3（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §3.6 / §5 B3、附录 A diagnostics 组）：看护快照/投递、角色状态文本、诊断尾部、治理反馈镜像/
// 客户投影、网络状态（L2，feature 白名单 []）。
// 17 个类方法（governanceOwnerRoleId/governanceRuntimeFor/activeRuntimeFor/governanceProjectionKey/
// governanceProjectionFingerprint/registerGovernanceClientProjection/lookupGovernanceClientProjection/
// mirrorGovernanceFeedback/isNetworkOffline/applyNetworkState/watchdogSnapshot/projectRootsWithActivity/
// lastTurnOf/watchdogDeliver/roleStatusText/diagnosticsTailText/sessionTailText）自
// app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动（**计时器/看护回调整体语义逐字保持**——
// 本组方法不新开/不删除任何定时器，unref/dispose 时机由看护器与门面保持不变）；类外壳重建原 receiver 面——
//  · lastTurns/lastAssistantText/governanceHandbackMirrored/governanceClientProjections/networkState 及
//    sessions/deliveryQueues/activeDeliveries/openChains/rebuildChains/lastGovernanceRuntime/lastRoleActivity
//    按方案 §3.6 归属本模块/门面暂留，经 `DiagnosticsState` 显式传入（同一 Map/Set 实例引用）；
//    `networkState` 以 get/set 访问器接回门面字段（写入仍落在原实例字段）；
//  · 已迁出的 shared 方法（handbackOwnerRoleId/chiefTaskRoleIdOf/roleDisplayName/findListingForFeedback/
//    resolveProofFlowIds/refreshListingNow/queueKey/sessionKey/contextInfo/now/emitDeliveryNote）经同名同义
//    委托 → `shared/*`；
//  · B3 尚未迁出的门面方法（openBackground/sendBackground/notifyRoleState/drainAllQueuesFor/drainQueue/
//    enqueueDelivery）经 `DiagnosticsPorts` 回调注入，参数逐位原样转发。
// 可见性 `private` → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L2 feature 只可导入 L0（contracts/shared）与外部 src；不得导入 barrel/feature。

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../../src/common/shared/diagnostics.ts";
import { resolveRuntimeTimeouts } from "../../../src/common/runtime-core/timeout.ts";
import { readRoleLog } from "../../../src/common/编排/role-log.ts";
import { formatDurationMs, type WatchdogProjectSnapshot } from "../watchdog.ts";
import { getSessionHistory } from "../runtime-history.ts";
import { pickLatestSessionFile, sessionsDirFor } from "../session-history.ts";
import { governanceAcceptanceReportPath } from "../governance-advance.ts";
import type { RoleStatusPayload, SessionTailPayload, WatchdogToolResult } from "../../../src/common/编排/watchdog.ts";
import type { RuntimeTurnOutcome } from "../../../src/model/runtime.ts";
import type { NetworkState } from "../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { DeliveryItem, GovernanceClientProjectionV1, LiveSession, OpenResult, SendResult, SessionOpenRequest } from "./contracts/session-types.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import { queueKey, sessionKey } from "./shared/keys.ts";
import { now } from "./shared/clock.ts";
import { chiefTaskRoleIdOf, findListingForFeedback, handbackOwnerRoleId, refreshListingNow, resolveProofFlowIds, roleDisplayName } from "./shared/roles.ts";
import { contextInfo } from "./shared/session-views.ts";
import { emitDeliveryNote } from "./shared/notifier.ts";
import { shortenText } from "./shared/text.ts";

/**
 * 内置来源回交→Lead 与同轮 settle 治理反馈的去重窗口（2026-10-24）：标记只在回交入队后到本轮
 * settle 之间的短窗口内有效；超出即不抑制（宁可重复一次，也不永久吞掉后续轮次的反馈）。
 */
const GOVERNANCE_HANDBACK_MIRROR_DEDUPE_MS = 5 * 60 * 1000;

/**
 * 治理反馈客户投影的登记表（2026-10-25 A3）：`queueKey + sha256(text)` → 投影。
 * 发送成功时登记；`prompt-input` 回显到达时按同一文本查表并附到事件 detail。
 * 有界 + TTL：只有运行期提示用途，不持久化（恢复/回放行回退到既有文本归类）。
 */
const GOVERNANCE_CLIENT_PROJECTION_LIMIT = 128;
const GOVERNANCE_CLIENT_PROJECTION_TTL_MS = 30 * 60 * 1000;

/** Proof settle 状态措辞（只用于「状态 + 指针」投递；不解释报告内容、不猜验收结论）。 */
const PROOF_STATUS_TEXT: Readonly<Record<RuntimeTurnOutcome, string>> = {
  completed: "本轮已完成",
  failed: "本轮失败",
  aborted: "本轮已中止",
  timed_out: "本轮超时",
};

/** diagnostics 方法读取的实例状态（方案 §3.6：诊断/治理投影归属本模块，B3 暂留门面——同一实例引用传入）。 */
export interface DiagnosticsState {
  sessions: ReadonlyMap<string, LiveSession>;
  deliveryQueues: ReadonlyMap<string, DeliveryItem[]>;
  activeDeliveries: ReadonlyMap<string, DeliveryItem>;
  openChains: ReadonlyMap<string, Promise<void>>;
  rebuildChains: ReadonlyMap<string, Promise<void>>;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
  lastRoleActivity: ReadonlyMap<string, { at: number; kind: string; summary: string }>;
  lastTurns: ReadonlyMap<string, { outcome: RuntimeTurnOutcome; at: string; errorCode?: string }>;
  lastAssistantText: Map<string, { turnId?: string; text: string }>;
  governanceHandbackMirrored: Map<string, number>;
  governanceClientProjections: Map<string, { projection: GovernanceClientProjectionV1; at: number }>;
  getNetworkState: () => NetworkState | null;
  setNetworkState: (state: NetworkState | null) => void;
  getActiveRoleId: () => string | null;
}

/** 尚未迁出（B3 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发。 */
export interface DiagnosticsPorts {
  openBackground(req: SessionOpenRequest): Promise<OpenResult>;
  sendBackground(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; text: string; clientMessageId?: string; identitySeed?: string; stableIdentity?: boolean; kind?: "system" }): Promise<SendResult>;
  notifyRoleState(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): void;
  drainAllQueuesFor(projectRoot: string): Promise<void>;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
}

/** diagnostics 方法读取的 deps 切片（原 `this.deps` 的只读查询）。 */
type DiagnosticsDeps = Pick<SessionManagerDeps, "getListing" | "networkGate" | "watchdogPendingConfirmations" | "watchdogStats" | "runtimeOptions" | "emitEvent" | "now">;

/** 看护/状态文本/诊断尾部/治理投影/网络状态（原 `SessionManager` 17 方法的同签名实现）。 */
export class Diagnostics {
  private readonly state: DiagnosticsState;
  private readonly port: DiagnosticsPorts;
  private readonly deps: DiagnosticsDeps;
  constructor(state: DiagnosticsState, port: DiagnosticsPorts, deps: DiagnosticsDeps) { this.state = state; this.port = port; this.deps = deps; }

  /* 原实例状态的本类只读/同名视图（同一 Map/Set 实例；方案 §3.6 暂留门面口径）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.state.sessions; }
  private get deliveryQueues(): ReadonlyMap<string, DeliveryItem[]> { return this.state.deliveryQueues; }
  private get activeDeliveries(): ReadonlyMap<string, DeliveryItem> { return this.state.activeDeliveries; }
  private get openChains(): ReadonlyMap<string, Promise<void>> { return this.state.openChains; }
  private get rebuildChains(): ReadonlyMap<string, Promise<void>> { return this.state.rebuildChains; }
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.state.lastGovernanceRuntime; }
  private get lastRoleActivity(): ReadonlyMap<string, { at: number; kind: string; summary: string }> { return this.state.lastRoleActivity; }
  private get lastTurns(): ReadonlyMap<string, { outcome: RuntimeTurnOutcome; at: string; errorCode?: string }> { return this.state.lastTurns; }
  private get lastAssistantText(): Map<string, { turnId?: string; text: string }> { return this.state.lastAssistantText; }
  private get governanceHandbackMirrored(): Map<string, number> { return this.state.governanceHandbackMirrored; }
  private get governanceClientProjections(): Map<string, { projection: GovernanceClientProjectionV1; at: number }> { return this.state.governanceClientProjections; }
  private get activeRoleId(): string | null { return this.state.getActiveRoleId(); }
  private get networkState(): NetworkState | null { return this.state.getNetworkState(); }
  private set networkState(state: NetworkState | null) { this.state.setNetworkState(state); }

  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string { return queueKey(projectRoot, targetRoleId, runtime); }
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  private now(): number { return now(this.deps); }
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private findListingForFeedback(projectRoot: string) { return findListingForFeedback(projectRoot, this.deps); }
  private resolveProofFlowIds(projectRoot: string, hinted?: readonly string[]): string[] { return resolveProofFlowIds(projectRoot, hinted); }
  private roleDisplayName(projectRoot: string, roleId: string): string { return roleDisplayName(projectRoot, roleId, this.deps); }
  private refreshListingNow(projectRoot: string): Promise<boolean> { return refreshListingNow(projectRoot, this.deps); }
  private contextInfo(handle: Parameters<typeof contextInfo>[0]): ReturnType<typeof contextInfo> { return contextInfo(handle); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }

  /* 尚未迁出的门面方法端口（参数逐位原样转发）。 */
  private openBackground(req: SessionOpenRequest): Promise<OpenResult> { return this.port.openBackground(req); }
  private sendBackground(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; text: string; clientMessageId?: string; identitySeed?: string; stableIdentity?: boolean; kind?: "system" }): Promise<SendResult> { return this.port.sendBackground(input); }
  private notifyRoleState(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): void { this.port.notifyRoleState(projectRoot, targetRoleId, runtime); }
  private drainAllQueuesFor(projectRoot: string): Promise<void> { return this.port.drainAllQueuesFor(projectRoot); }
  private drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> { return this.port.drainQueue(projectRoot, targetRoleId, runtime); }
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void { this.port.enqueueDelivery(projectRoot, targetRoleId, item); }

  /** 治理主人（回交/系统行落位；2026-10-19 验收自动派发用）：trio=Convener；single=主入口（su）；未枚举 ⇒ null。 */
  governanceOwnerRoleId(projectRoot: string): string | null {
    return this.handbackOwnerRoleId(projectRoot);
  }

  /** 派发主人最近一次开会话所用 runtime（验收检查后台开 Proof 会话时择路；无记录 ⇒ undefined）。 */
  governanceRuntimeFor(projectRoot: string): RuntimeKind | undefined {
    return this.lastGovernanceRuntime.get(projectRoot);
  }

  /**
   * **当前活动会话的 runtime**（客户正在看的那个；仅当它属于该项目）：自动验收派发/冷启动补齐的
   * 优先级 1 只读视图。无活动会话 / 活动会话属于别的项目 ⇒ undefined（调用方按解析器继续降级）。
   */
  activeRuntimeFor(projectRoot: string): RuntimeKind | undefined {
    if (typeof projectRoot !== "string" || projectRoot === "" || this.activeRoleId === null) return undefined;
    const entry = this.sessions.get(this.activeRoleId);
    return entry !== undefined && entry.projectRoot === projectRoot ? entry.runtime : undefined;
  }

  /** 治理反馈客户投影的登记键：`queueKey` + 文本 sha256（回显文本需逐字一致才命中；不猜）。 */
  governanceProjectionKey(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string {
    return `${this.queueKey(projectRoot, roleId, runtime)}\u0000${createHash("sha256").update(text).digest("hex")}`;
  }

  /**
   * A4 稳定指纹：同来源/同状态/同流程（排序）/同报告与治理指针/同正文 ⇒ 同值；任一变化 ⇒ 新值。
   * 只用于 UI 合并连续状态行（×N），不参与任何判定。
   */
  governanceProjectionFingerprint(input: {
    sourceRoleId: string;
    statusCode: GovernanceClientProjectionV1["statusCode"];
    flowIds: readonly string[];
    reportPath?: string;
    governancePath?: string;
    text: string;
  }): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          kind: "governance-feedback",
          sourceRoleId: input.sourceRoleId,
          statusCode: input.statusCode,
          flowIds: [...input.flowIds].sort(),
          reportPath: input.reportPath ?? null,
          governancePath: input.governancePath ?? null,
          textHash: createHash("sha256").update(input.text).digest("hex"),
        }),
      )
      .digest("hex");
  }

  /** 发送成功后登记投影（有界 FIFO；同键刷新登记时刻）。失败不登记（调用方只在 `sent.ok` 后调用）。 */
  registerGovernanceClientProjection(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    text: string,
    projection: GovernanceClientProjectionV1,
  ): void {
    const key = this.governanceProjectionKey(projectRoot, roleId, runtime, text);
    this.governanceClientProjections.delete(key);
    this.governanceClientProjections.set(key, { projection, at: this.now() });
    while (this.governanceClientProjections.size > GOVERNANCE_CLIENT_PROJECTION_LIMIT) {
      const oldest = this.governanceClientProjections.keys().next().value;
      if (oldest === undefined) break;
      this.governanceClientProjections.delete(oldest);
    }
  }

  /** `prompt-input` 回显查找投影：命中且未过期才返回（过期即清理）；miss ⇒ 事件保持原样。 */
  lookupGovernanceClientProjection(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    text: string,
  ): GovernanceClientProjectionV1 | undefined {
    const key = this.governanceProjectionKey(projectRoot, roleId, runtime, text);
    const found = this.governanceClientProjections.get(key);
    if (found === undefined) return undefined;
    if (this.now() - found.at > GOVERNANCE_CLIENT_PROJECTION_TTL_MS) {
      this.governanceClientProjections.delete(key);
      return undefined;
    }
    return found.projection;
  }

  /**
   * **收尾反馈 → 主入口汇总任务**（2026-10-18 客户反馈：原文镜像 = 「直接转述」，不对）。
   * trio 的内部内置角色（Rapporteur/Nominator/Convener——改名后即 Draft/Crew/Steward/Proof）一轮结束后，
   * **不再把正文原样贴到主入口 pane**，而是经**既有投递机**给主入口（`primaryRoleId`，Lead/Liaison）
   * 投一条任务：`[系统·治理反馈]` 前缀 + 本轮正文（≤4000 码点）+「汇总后告知客户、不要逐字转述」指令。
   *  · 仅 trio；`roleId === primaryRoleId` ⇒ 不投（Lead 自己；防循环）；
   *  · 仅内置治理角色（`builtIn === true` 且有 `governanceFunction`）——项目角色不投（其回交仍走 Convener）；
   *  · 文本**取出即删**（同一轮只投一次）；trim 后非空；`displayName` 取 listing 角色显示名（无则 roleId）。
   *  · Lead 忙 ⇒ 按 `sendBackground`/投递机既有语义排队；未开 ⇒ `openBackground` 后台开启（不抢活动角色）；
   *    失败只诊断、**绝不打断 settle**。
   *  · `getListing` 在精确 miss 时做**斜杠归一兜底**（真机：事件循环 root 与枚举缓存 key 可能正/反斜杠
   *    不一致）；仅查找变体，**不改变**调用方 key。
   *  · 2026-10-24（治理协调，设计 v1 §4.3/§6.5）：**Proof（`governanceFunction === "verification"`）只投
   *    「状态 + 报告/治理路径指针」，不转述报告正文**（Proof 的权威报告给客户/应用，Lead 不能编辑/代批/改判）。
   *  · 内置来源回交若已由 `handleHandback` 防御性投给 Lead（同一轮），本函数**不再重复投**（短时标记去重）。
   *  · 每个 early-return 记一条 `governance.feedback.skip`（不记正文）；成功记 `governance.feedback.mirrored`
   *    （`targetRoleId` = Lead 的真实 roleId，不记来源）。
   */
  async mirrorGovernanceFeedback(
    projectRoot: string,
    runtime: RuntimeKind,
    roleId: string,
    options: { flowIds?: readonly string[]; outcome?: RuntimeTurnOutcome } = {},
  ): Promise<void> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-feedback", projectRoot, roleId });
    const skip = (reason: "no-listing" | "non-trio" | "primary" | "not-builtin" | "no-text" | "handback-mirrored"): void => {
      // 共享白名单只落允许字段名 ⇒ 同时带 `reasonCode`（机器可读）；绝不带正文。
      diagnostic.record("governance.feedback.skip", { reason, reasonCode: reason });
    };
    try {
      const listing = this.findListingForFeedback(projectRoot);
      if (listing === undefined) return skip("no-listing");
      if ((listing.governanceModel ?? "single") !== "trio") return skip("non-trio");
      const primaryRoleId = typeof listing.primaryRoleId === "string" ? listing.primaryRoleId : "";
      if (primaryRoleId === "" || roleId === primaryRoleId) return skip("primary");
      const role = listing.roles.find((r) => r.roleId === roleId);
      if (role === undefined || role.builtIn !== true || role.governanceFunction === undefined) return skip("not-builtin");
      const key = this.queueKey(projectRoot, roleId, runtime);
      // 内置来源回交已防御性投给 Lead（同一轮）：settle 反馈与它去重（同一轮只投一条）。
      const handbackMirroredAt = this.governanceHandbackMirrored.get(key);
      if (handbackMirroredAt !== undefined) {
        this.governanceHandbackMirrored.delete(key);
        if (this.now() - handbackMirroredAt <= GOVERNANCE_HANDBACK_MIRROR_DEDUPE_MS) {
          this.lastAssistantText.delete(key);
          return skip("handback-mirrored");
        }
      }
      const last = this.lastAssistantText.get(key);
      if (last === undefined) return skip("no-text");
      this.lastAssistantText.delete(key); // 取出即删：同一轮只投一次
      const text = last.text.trim();
      if (text === "") return skip("no-text");
      // 显示名：listing 的 `displayName`（Lead / Draft / Crew / Steward / Proof），否则回退 roleId。
      const displayName = this.roleDisplayName(projectRoot, roleId);
      const isProof = role.governanceFunction === "verification";
      let body = "";
      let task: string;
      let projection: GovernanceClientProjectionV1;
      if (isProof) {
        // Proof 独立性：只发状态 + 报告/治理路径指针；正文丢弃、不转全文、不摘要替代报告。
        const flowIds = await this.resolveProofFlowIds(projectRoot, options.flowIds);
        const reportPath = flowIds.length > 0 ? governanceAcceptanceReportPath(flowIds[0]!) : "docs/acceptance/<flowId>-report-vN.md";
        const governancePath = flowIds.length > 0 ? `docs/governance/verifier/${flowIds[0]}.md` : "docs/governance/verifier/<flowId>.md";
        const statusText = options.outcome !== undefined ? PROOF_STATUS_TEXT[options.outcome] ?? options.outcome : "已结束";
        task = [
          `[系统·治理反馈] 来自 ${displayName} 的验收状态（只含状态与报告指针；不转述报告正文）：`,
          `状态：${statusText}${flowIds.length > 0 ? `（流程 ${flowIds.join("、")}）` : ""}`,
          `报告路径：${reportPath}`,
          `治理记录：${governancePath}`,
          "请只向客户说明验收复核已结束与报告位置；不要转述报告内容，不要编辑/代批/改判验收结论，也不要把报告当作客户批准。验收卡与客户决定仍由应用/客户处理。",
        ].join("\n");
        const statusCode = options.outcome ?? "unknown";
        projection = {
          version: 1,
          kind: "governance-feedback",
          fingerprint: this.governanceProjectionFingerprint({
            sourceRoleId: roleId,
            statusCode,
            flowIds,
            reportPath,
            governancePath,
            text: task,
          }),
          sourceRole: { roleId, displayName },
          statusCode,
          statusText,
          ...(flowIds.length > 0 ? { flowIds } : {}),
          reportPath,
          governancePath,
          action: "report-ready",
        };
      } else {
        const chars = Array.from(text);
        body = chars.length > 4000 ? chars.slice(0, 4000).join("") : text;
        task = [
          `[系统·治理反馈] 来自 ${displayName} 的内部反馈（内部材料，请汇总后告知客户，不要逐字转述）：`,
          body,
          "请用 1-3 句话向客户汇总：完成了什么、是否有风险/阻塞、下一步或需要客户决定什么。不要逐字转述内部报告，不要使用内部行话，不要声称客户已批准。",
        ].join("\n");
        const hintedFlowIds = [...new Set((options.flowIds ?? []).filter((id): id is string => typeof id === "string" && id !== ""))].slice(0, 3);
        projection = {
          version: 1,
          kind: "governance-feedback",
          fingerprint: this.governanceProjectionFingerprint({
            sourceRoleId: roleId,
            statusCode: "internal-feedback",
            flowIds: hintedFlowIds,
            text: task,
          }),
          sourceRole: { roleId, displayName },
          statusCode: "internal-feedback",
          statusText: "内部反馈",
          ...(hintedFlowIds.length > 0 ? { flowIds: hintedFlowIds } : {}),
          action: "await-lead-summary",
        };
      }
      const opened = await this.openBackground({ projectRoot, roleId: primaryRoleId, runtime });
      if (!opened.ok) {
        diagnostic.error("governance.feedback.open.failed", new Error(opened.error ?? "无法开启主入口会话"), { targetRoleId: primaryRoleId });
        return;
      }
      // 治理反馈是**轮次状态镜像**而非应用任务：同文可在不同轮次重复出现（既有语义不变）——
      // 不生成稳定任务键，不参与「同一应用任务至多投递一次」的去重。
      const sent = await this.sendBackground({ projectRoot, roleId: primaryRoleId, runtime, text: task, stableIdentity: false });
      if (!sent.ok) {
        diagnostic.error("governance.feedback.dispatch.failed", new Error(sent.error ?? "治理反馈投递失败"), { targetRoleId: primaryRoleId });
        return;
      }
      // 2026-10-25 A3/A4：发送成功后登记客户投影；运行时把这条输入回显为 `prompt-input` 时，
      // 由事件消费循环按同一文本附到 `detail.clientProjection`（内部原文仍保留在 `detail.text`）。
      this.registerGovernanceClientProjection(projectRoot, primaryRoleId, runtime, task, projection);
      const mirroredChars = Array.from(body).length;
      // `targetRoleId`/`count`/`busy` 是共享白名单里的允许名（chars/roleId 本身不在白名单）。
      diagnostic.record(isProof ? "governance.feedback.pointer" : "governance.feedback.mirrored", {
        targetRoleId: primaryRoleId,
        chars: mirroredChars,
        count: mirroredChars,
        ...(sent.queued === true ? { busy: true } : {}),
      });
    } catch (error) {
      // 镜像/诊断失败绝不打断 settle。
      diagnostic.error("governance.feedback.failed", error);
    }
  }

  /** 当前是否离线：优先主进程注入的门（权威）；未注入门时看最近快照（缺省在线）。 */
  isNetworkOffline(): boolean {
    if (this.deps.networkGate !== undefined) return !this.deps.networkGate.isOnline();
    return this.networkState?.online === false;
  }

  /**
   * **P2：接收主进程网络状态**（monitor `onState` → Interface → 本方法；只在 online 变化时被调用）。
   * - 离线：队列**保留**、不认领新投递，`role-state` 快照标 `blockedReason:"network"`（界面可见）；
   * - 恢复：对全部有队列的项目按**既有** `drainAllQueuesFor` 路径继续投递（不重放已完成/失败回合）。
   * 只改队列认领时机，不改 busy/租约/终态语义。
   */
  applyNetworkState(state: NetworkState): void {
    const wasOffline = this.networkState === null
      ? this.deps.networkGate?.isOnline() === false
      : this.networkState.online === false;
    this.networkState = { ...state };
    const projects = new Set<string>();
    for (const entry of this.sessions.values()) {
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
      projects.add(entry.projectRoot);
    }
    for (const key of [...this.deliveryQueues.keys()]) {
      const [projectRoot, roleId, runtime] = key.split("\u0000");
      if (projectRoot === undefined || roleId === undefined || runtime === undefined) continue;
      this.notifyRoleState(projectRoot, roleId, runtime as RuntimeKind);
      projects.add(projectRoot);
    }
    if (wasOffline && state.online) {
      for (const projectRoot of projects) void this.drainAllQueuesFor(projectRoot);
    }
  }

  /** **同源看护快照**（W1）：全部直读本层内存结构（busy/队列/在途/链/pending）——**不造第二数据源**、
   *  同步读、不引锁（JS 单线程 tick 内读完）。项目未知且无任何运行态 ⇒ undefined（看护跳过）。 */
  watchdogSnapshot(projectRoot: string): WatchdogProjectSnapshot | undefined {
    if (typeof projectRoot !== "string" || projectRoot === "") return undefined;
    const hasSessions = [...this.sessions.values()].some((entry) => entry.projectRoot === projectRoot);
    const hasQueues = [...this.deliveryQueues.entries()].some(([key, items]) => key.startsWith(`${projectRoot}\u0000`) && items.length > 0);
    const listing = this.deps.getListing(projectRoot);
    if (!listing && !hasSessions && !hasQueues) return undefined;
    const roles: WatchdogProjectSnapshot["roles"] = [];
    for (const entry of this.sessions.values()) {
      if (entry.projectRoot !== projectRoot) continue;
      const listingRole = listing?.roles.find((role) => role.roleId === entry.roleId);
      const activity = this.lastRoleActivity.get(`${projectRoot}\u0000${entry.roleId}`);
      const running = this.activeDeliveries.get(this.queueKey(projectRoot, entry.roleId, entry.runtime));
      roles.push({
        roleId: entry.roleId,
        runtime: entry.runtime,
        busy: entry.busy,
        ...(entry.busy && typeof entry.busySince === "number" ? { turnStartedAt: entry.busySince } : {}),
        ...(entry.origins.running?.turnId !== undefined ? { turnId: entry.origins.running.turnId } : {}),
        ...(listingRole?.builtIn === true ? { builtIn: true } : {}),
        ...(running?.taskId !== undefined ? { taskId: running.taskId } : {}),
        ...(activity !== undefined ? { lastActivityAt: activity.at, lastAction: `${activity.kind}：${activity.summary}` } : {}),
      });
    }
    const queues: WatchdogProjectSnapshot["queues"] = [];
    for (const [key, items] of this.deliveryQueues) {
      if (items.length === 0) continue;
      const parts = key.split("\u0000");
      if (parts[0] !== projectRoot) continue;
      queues.push({
        targetRoleId: parts[1] ?? "",
        runtime: (parts[2] as RuntimeKind) ?? "pi",
        items: items.map((item) => {
          const parsed = Date.parse(item.enqueuedAt);
          return { kind: item.kind, dedupKey: item.dedupKey, sourceRoleId: item.sourceRoleId, summary: item.summary, enqueuedAtMs: Number.isFinite(parsed) ? parsed : this.now() };
        }),
      });
    }
    let activeDeliveries = 0;
    for (const key of this.activeDeliveries.keys()) if (key.startsWith(`${projectRoot}\u0000`)) activeDeliveries += 1;
    let chainsActive = false;
    for (const key of this.openChains.keys()) if (key.startsWith(`${projectRoot}\u0000`)) { chainsActive = true; break; }
    if (!chainsActive) for (const key of this.rebuildChains.keys()) if (key.startsWith(`${projectRoot}\u0000`)) { chainsActive = true; break; }
    const pending = this.deps.watchdogPendingConfirmations?.() ?? { total: 0, byRole: new Map<string, number>() };
    return {
      projectRoot,
      // 评审 §5.6：`suRoleId` → `governanceRoleId`（值=回交主人：trio=Convener / single=主入口）。
      governanceRoleId: this.handbackOwnerRoleId(projectRoot),
      // B 批：真实幕僚（trio chief）——巡检消息由 watchdogDeliver 投它；旧 liaison 别名不算。
      chiefRoleId: this.chiefTaskRoleIdOf(projectRoot),
      roles,
      queues,
      activeDeliveries,
      chainsActive,
      pendingConfirmationsTotal: pending.total,
      pendingConfirmationsByRole: pending.byRole,
    };
  }

  /** 有运行态的项目根（活会话 ∪ 非空队列）——看护的服务对象之一（Interface 再并入已导入项目）。 */
  projectRootsWithActivity(): string[] {
    const roots = new Set<string>();
    for (const entry of this.sessions.values()) roots.add(entry.projectRoot);
    for (const [key, items] of this.deliveryQueues) if (items.length > 0) roots.add(key.split("\u0000")[0] ?? "");
    roots.delete("");
    return [...roots];
  }

  /** 某角色**最近一轮终局**（W1 的 `lastTurn` 小状态；纯读。消费方：role_status 等只读面）。 */
  lastTurnOf(projectRoot: string, roleId: string, runtime: RuntimeKind): { outcome: RuntimeTurnOutcome; at: string; errorCode?: string } | undefined {
    return this.lastTurns.get(this.queueKey(projectRoot, roleId, runtime));
  }

  /**
   * **系统消息投递**（W2）：看护的告警/收束/恢复回执经**同一套投递机**真投递给**回交主人**（评审 §5.6：
   * trio=Convener；single=su）——忙时排队、未开自动开、失败保留重试全部复用（`kind:"system"`；来源标注
   * 恒空——呈现层按文首 `[系统·<子类>] ` 定格标记归类）。主人未枚举到 ⇒ 入 `""` 目标队列（投递机既有的
   * 一次性提示 + 保留待重试；**绝不静默丢**）。
   */
  watchdogDeliver(projectRoot: string, message: { text: string; summary: string; dedupKey: string; uiOnlyWhenBusy?: boolean }): void {
    // B 批：看护/巡检系统消息回幕僚（trio）；无幕僚（single/旧项目）保持原主人。
    const governanceRoleId = this.chiefTaskRoleIdOf(projectRoot) ?? this.handbackOwnerRoleId(projectRoot);
    let runtime: RuntimeKind | undefined;
    if (governanceRoleId !== null) {
      for (const entry of this.sessions.values()) {
        if (entry.projectRoot === projectRoot && entry.roleId === governanceRoleId) { runtime = entry.runtime; break; }
      }
    }
    if (runtime === undefined) runtime = this.lastGovernanceRuntime.get(projectRoot) ?? "pi";
    const target = governanceRoleId ?? "";
    // **P0 看护告警 UI-only 旁路（2026-10-30 设计 §7.3.3 / Q6）**：**看护服务发出**的消息
    // （`uiOnlyWhenBusy`：轮次到点/静默/巡检/告警/恢复）在目标正在忙时**不进 busy 模型队列**——
    // 否则看护自身的提示会被同一队列楔死（现场：`patrol.skipped (pending)` 持续、告警也排不进）。
    // 改为经既有 UI 系统行（`delivery-note`，不触发模型/门禁/自动决策）呈现 + `watchdog.notice.bypass`
    // 诊断；不忙时仍走正常 system 队列投递。直接调用（MCP 安装/申请系统行等，不带该标记）保持既有排队语义。
    const live = target !== "" ? this.sessions.get(this.sessionKey(projectRoot, target, runtime)) : undefined;
    if (live?.busy === true && message.uiOnlyWhenBusy === true) {
      const queueDepth = (this.deliveryQueues.get(this.queueKey(projectRoot, target, runtime)) ?? []).length;
      const parts = message.dedupKey.split("\u0000");
      const signal = parts[0] === "watchdog" && parts.length >= 3 && parts[2] !== "" ? parts[2] : "watchdog";
      createDiagnosticLogger({ component: "desktop.watchdog", projectRoot, roleId: target }).record("watchdog.notice.bypass", {
        mode: "ui-only",
        signal,
        targetRoleId: target,
        queueDepth,
      });
      this.emitDeliveryNote(projectRoot, runtime, target, "", message.summary);
      return;
    }
    this.enqueueDelivery(projectRoot, target, {
      kind: "system",
      runtime,
      targetRoleId: target,
      sourceRoleId: "", // U1 已落树契约：system 来源标注恒空（「系统」非角色）——不得填假角色
      text: message.text,
      summary: message.summary,
      dedupKey: message.dedupKey,
    });
    void this.drainQueue(projectRoot, governanceRoleId, runtime);
  }

  /** `role_status` 结构化文本（设计 §4.1：su 行 + 各角色行 + 队列明细 + 可选诊断节；**纯读**、无副作用；
   *  数据层失败以 `{ok:false, message}` 如实表达（不抛——抛错由工具层按「读取未完成」如实转达）；
   *  8 KiB 截断由工具层执行（本层不预截断）。 */
  async roleStatusText(projectRoot: string, query: RoleStatusPayload): Promise<WatchdogToolResult> {
    try {
      const at = this.now();
      const snapshot = this.watchdogSnapshot(projectRoot);
      const lines: string[] = [`role_status（项目 ${projectRoot}，${new Date(at).toISOString()}）`];
      if (!snapshot) {
        lines.push("（尚无运行态：项目未导入，或还没有任何会话/队列——先导入项目并点开角色。）");
        return { ok: true, text: lines.join("\n") };
      }
      // 评审 §5.6：状态行的主人行数据驱动（trio=Convener；single=su）——**不让 Rapporteur 会话自称 su**。
      const governanceRoleId = snapshot.governanceRoleId;
      const pendingFor = (rid: string): number => snapshot.pendingConfirmationsByRole.get(rid) ?? 0;
      const governanceBusy = governanceRoleId !== null && snapshot.roles.some((r) => r.roleId === governanceRoleId && r.busy);
      const stats = this.deps.watchdogStats?.(projectRoot);
      const watchdogLine = stats
        ? `看护：活跃告警 ${stats.activeAlerts}，最近触发 ${stats.lastAlertAt !== null ? new Date(stats.lastAlertAt).toISOString() : "null"}，已抑制 ${stats.suppressedTotal}`
        : "看护：未接线";
      lines.push(`${governanceRoleId ?? "（未枚举）"}：busy=${governanceBusy} ｜ 待确认卡 ${governanceRoleId !== null ? pendingFor(governanceRoleId) : 0} ｜ ${watchdogLine}`);
      const wantedRoleId = typeof query?.roleId === "string" ? query.roleId.trim() : "";
      let listing = this.deps.getListing(projectRoot);
      // W6-B 真机阻塞修复：治理角色刚写入的新角色可能尚未进缓存——指定角色 miss 时强制刷新**一次**
      // 再判定（只一次；刷新失败只记诊断，仍按 miss 如实报告）。
      if (wantedRoleId !== "" && (!listing || !listing.roles.some((r) => r.roleId === wantedRoleId))) {
        await this.refreshListingNow(projectRoot);
        listing = this.deps.getListing(projectRoot);
      }
      const knownRoles = listing ? listing.roles.map((r) => r.roleId) : [...new Set([...snapshot.roles.map((r) => r.roleId), ...snapshot.queues.map((q) => q.targetRoleId)])].filter((r) => r !== "");
      const includeDiagnostics = query?.includeDiagnostics === true;
      const wanted = wantedRoleId !== "" ? [wantedRoleId] : knownRoles;
      for (const rid of wanted) {
        if (listing && !knownRoles.includes(rid)) {
          lines.push(`角色 ${rid}：不在本项目（未枚举到）。`);
          continue;
        }
        const live = snapshot.roles.find((r) => r.roleId === rid);
        const queue = snapshot.queues.find((q) => q.targetRoleId === rid);
        let liveText = "未开";
        if (live) {
          const entry = this.sessions.get(this.sessionKey(projectRoot, rid, live.runtime));
          const ctx = entry ? this.contextInfo(entry.handle).contextSource ?? "fresh" : "fresh";
          liveText = `已开（contextSource=${ctx}）`;
        }
        let runningKind: string | undefined;
        for (const [key, item] of this.activeDeliveries) if (key.startsWith(`${projectRoot}\u0000${rid}\u0000`)) { runningKind = item.kind; break; }
        const depth = queue?.items.length ?? 0;
        const busy = live?.busy === true;
        lines.push(`角色 ${rid}：busy=${busy} ｜ 会话 ${liveText} ｜ 队列 ${depth} ｜ 进行中 ${runningKind ?? "—"}`);
        // B 批：运行日志的 lastActivityAt / 最近动作（只读；读失败如实显示「不可用」，不猜）。
        const activity = await readRoleLog(projectRoot, { roleId: rid, limit: 1 });
        if (activity.ok) {
          const lastLog = activity.entries[activity.entries.length - 1];
          lines.push(`  运行日志：lastActivityAt=${lastLog?.at ?? "无"} ｜ 最近动作=${lastLog !== undefined ? `${lastLog.kind}：${lastLog.summary}` : "无"}`);
        } else {
          lines.push(`  运行日志：不可用（${activity.message ?? "读取失败"}）`);
        }
        // 呈现消歧（实机反馈 2026-10-17；时限语义随客户 2026-10-17 裁定更新）：busy=true 时「上一轮终局」
        // **不是当前轮**——必须分开写，否则 su 会把历史 timed_out 转述成「该角色超时、已中止」。当前轮事实
        // （已耗/看护检查时限/turnId）只在 busy 且有起始时刻时给出；`promptTimeoutMs` 自 2026-10-17 起是
        // **到点检查时限（不中止本轮）**，整轮最后兜底固定 1 小时（`turnLastResortMs`）。时限求值与看护/
        // 会话运行时**同一来源** `resolveRuntimeTimeouts`（不另写时长/env 解析），格式化复用 `formatDurationMs`。
        if (busy && live !== undefined && typeof live.turnStartedAt === "number") {
          const timeouts = resolveRuntimeTimeouts(
            live.runtime,
            { promptTimeoutMs: this.deps.runtimeOptions?.promptTimeoutMs },
            process.env,
          );
          const lastResortText =
            timeouts.turnLastResortMs >= 3_600_000 && timeouts.turnLastResortMs % 3_600_000 === 0
              ? `${timeouts.turnLastResortMs / 3_600_000} 小时`
              : formatDurationMs(timeouts.turnLastResortMs);
          lines.push(
            `  当前轮：进行中（已耗 ${formatDurationMs(Math.max(0, at - live.turnStartedAt))} / 看护检查时限 ${formatDurationMs(timeouts.promptTimeoutMs)}；turnId=${live.turnId ?? "—"}；${lastResortText}最后兜底）`,
          );
        }
        let last: { outcome: RuntimeTurnOutcome; at: string; errorCode?: string } | undefined;
        for (const [key, value] of this.lastTurns) if (key.startsWith(`${projectRoot}\u0000${rid}\u0000`)) { last = value; break; }
        if (last) {
          const history = `该角色近 15 分钟 failed/timed_out 计 ${stats?.failuresByRole.get(rid) ?? 0}`;
          const lastOutcome = last.errorCode !== undefined ? `${last.outcome}(${last.errorCode})` : last.outcome;
          lines.push(
            busy
              ? `  上一轮终局：${lastOutcome} @ ${last.at}（不表示当前轮；${history}）`
              : `  最近一轮：${lastOutcome} @ ${last.at}（${history}）`,
          );
        }
        for (const item of queue?.items ?? []) {
          lines.push(`  队列明细：- [${item.kind}] 来自 ${item.sourceRoleId === "" ? "（系统）" : item.sourceRoleId}：${shortenText(item.summary, 80)}（入队 ${new Date(item.enqueuedAtMs).toISOString()}，id=${item.dedupKey}）`);
        }
        if (includeDiagnostics && wantedRoleId !== "") lines.push(await this.diagnosticsTailText(rid));
      }
      if (includeDiagnostics && wantedRoleId === "") lines.push("（诊断节需要指定 roleId——未附。）");
      return { ok: true, text: lines.join("\n") };
    } catch (err) {
      return { ok: false, message: `role_status 数据面读取失败：${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** 该角色**近日志尾部 ≤20 条**（只读诊断文件；字段为写盘白名单内的元数据）。失败如实（不抛、不猜）。 */
  async diagnosticsTailText(roleId: string): Promise<string> {
    try {
      const status = getDiagnosticsStatus();
      if (!status.directory) return `  [diagnostics] 不可用（诊断目录未配置${status.lastError ? `；lastError：${status.lastError}` : ""}）。`;
      const names = (await fs.promises.readdir(status.directory)).filter((n) => /^ans-diagnostics-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort();
      const newest = names[names.length - 1];
      if (newest === undefined) return "  [diagnostics] 不可用（暂无诊断文件）。";
      const file = path.join(status.directory, newest);
      const st = await fs.promises.stat(file);
      const start = Math.max(0, st.size - 256 * 1024); // 尾读 ≤256KiB（不整读大文件）
      const fh = await fs.promises.open(file, "r");
      let chunk = "";
      try {
        const buf = Buffer.alloc(st.size - start);
        const { bytesRead } = await fh.read(buf, 0, buf.length, start);
        chunk = buf.subarray(0, bytesRead).toString("utf8");
      } finally {
        await fh.close();
      }
      const rows: string[] = [];
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "" || rows.length >= 20) continue;
        try {
          const row = JSON.parse(trimmed) as Record<string, unknown>;
          if (row.roleId !== roleId) continue;
          const fields = Object.entries(row)
            .filter(([k]) => k !== "at" && k !== "level" && k !== "pid" && k !== "projectRoot" && k !== "roleId")
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(" ");
          rows.push(`  [diagnostics] ${String(row.at ?? "")} ${String(row.event ?? "?")}${fields ? ` ${fields}` : ""}`);
        } catch {
          // 坏行跳过（尾读切半行也走这里）——如实不猜。
        }
      }
      return rows.length > 0 ? rows.join("\n") : "  [diagnostics] 该角色近日志无可显示条目。";
    } catch (err) {
      return `  [diagnostics] 不可用（读取失败）：${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** `session_tail` 规范化尾行文本（设计 §4.2）：**复用受保护投影管线**（getSessionHistory 同路径——凭据
   *  清洗/display 保护已在链上）；行数由工具层归一（本层沿用其值，防御再夹一道）；「无会话历史」「读坏」
   *  以 `{ok:false, message}` 如实表达——不抛、不猜。 */
  async sessionTailText(projectRoot: string, query: SessionTailPayload): Promise<WatchdogToolResult> {
    const rid = typeof query?.roleId === "string" ? query.roleId.trim() : "";
    if (rid === "") return { ok: false, message: "session_tail：roleId 必须非空。" };
    const n = typeof query?.lines === "number" && Number.isFinite(query.lines) ? Math.min(200, Math.max(1, Math.floor(query.lines))) : 40;
    try {
      let source = "无会话文件";
      try {
        const dir = sessionsDirFor(projectRoot, rid);
        const names = await fs.promises.readdir(dir);
        const files: { name: string; mtimeMs: number }[] = [];
        for (const name of names) {
          try {
            const st = await fs.promises.stat(path.join(dir, name));
            if (st.isFile()) files.push({ name, mtimeMs: st.mtimeMs });
          } catch {
            // 单文件 stat 失败：跳过（不阻断其它候选）
          }
        }
        const latest = pickLatestSessionFile(files);
        if (latest !== null) source = latest;
      } catch {
        // 无目录 = 无历史
      }
      let runtime: RuntimeKind = "pi";
      for (const entry of this.sessions.values()) {
        if (entry.projectRoot === projectRoot && entry.roleId === rid) { runtime = entry.runtime; break; }
      }
      const view = await getSessionHistory(
        { projectRoot, roleId: rid, runtime },
        { credentialEnvNames: [...(this.deps.runtimeOptions?.extraCredentialEnvVars ?? []), ...(this.deps.runtimeOptions?.apiKeyEnvVar ? [this.deps.runtimeOptions.apiKeyEnvVar] : [])] },
      );
      if (view.error) {
        return { ok: false, message: `会话历史读取未完成：${view.error}（来源 ${source}；跳过 ${view.skipped} 行）` };
      }
      const taken = view.rows.slice(-n);
      if (taken.length === 0) {
        return { ok: false, message: `无会话历史（来源 ${source}；规范行 0 条，跳过 ${view.skipped} 行）` };
      }
      const head = `session_tail（角色 ${rid}，runtime=${runtime}）：来源 ${source}；规范行 ${view.rows.length} 条，跳过 ${view.skipped} 行${view.rows.length > taken.length ? `（已按行数上限 ${n} 取尾部）` : ""}`;
      const body = taken.map((row) => `${row.at !== "" ? row.at : "（无时间）"} [${row.kind}] ${shortenText(row.text, 200)}`);
      return { ok: true, text: [head, ...body].join("\n") };
    } catch (err) {
      return { ok: false, message: `session_tail 读取失败（如实返回，不猜）：${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

// app/desktop/session/session-env.ts
// B3（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §3.6 / §5 B3、附录 A session-env 组）：边界/画像陈旧重建、技能/MCP 安装卸载、激活刷新、
// 安装拒执观测（L2，feature 白名单 []）。
// 11 个类方法（installationEffectObservations/refuseUnprovenInstallation/boundaryDiff/currentSkillPaths/
// rebuildIfBoundaryStale/rebuildIfBoundaryStaleUnsafe/queueRebuildWritePermitsNotice/refreshStaleBoundaries/
// activateRoleRefresh/applySkillChange/applyMcpChange）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：
// 方法体零改动；类外壳重建原 receiver 面——
//  · boundaryRefreshVersion/profileRevisions/rebuildChains/installationRefusals 按方案 §3.6 归属本模块，
//    B3 暂留门面，经 `SessionEnvState` 显式传入（同一实例引用；selectionVersion/activeRoleId 以 get/set
//    访问器接回门面字段，写入仍落在原实例字段）；
//  · 已迁出的 shared 方法（sessionKey/now/filePrint）经同名同义委托 → `shared/*`；
//  · B3 尚未迁出的门面方法（disposeEntry/hasBusyRuntime/openInternalUnsafe/profileRevision/rebuildSession/
//    isCustomerInitiatedTurn）与 B3 同批迁出的 diagnostics.watchdogDeliver（同层，经端口上行门面）经
//    `SessionEnvPorts` 回调注入，参数逐位原样转发。
// 可见性 `private` → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L2 feature 只可导入 L0（contracts/shared）与外部 src；不得导入 barrel/feature。

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";
import { isBuiltInGovernanceRoleId } from "../../../src/service/boundary/resolve-boundary.ts";
import { readSkillRegistration } from "../../../src/common/编排/installed-skills.ts";
import { readMcpDeclaration } from "../../../src/common/runtime-core/mcp-declarations.ts";
import { REBUILT_SESSION_WRITE_PERMITS_NOTICE } from "../../../src/pipeline/orchestration/run-role.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import type { InstallMcpPayload, InstallMcpReceipt, InstallSkillPayload, InstallSkillReceipt, ReportHandbackMetadata } from "../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { WorkflowMode } from "../workflow.ts";
import type { InstallationCapabilityTool, InstallationEffectRefusalObservation, InternalSessionOpenRequest, LiveSession, OpenResult, RebuildSessionResult, SessionTarget } from "./contracts/session-types.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import { sessionKey } from "./shared/keys.ts";
import { filePrint } from "./shared/text.ts";
import { mainT } from "../i18n.ts";

/**
 * **`[系统·安装]`：能力安装/卸载完成后的定格系统行文首**（PM 冻结符号，G-4 2026-10-16）——**技能（I3）
 * 与外来 MCP（V2）两类安装动作共用同一子类**。形态契约＝「`[系统·<子类>]` ＋一个 ASCII 空格」，与
 * 桌面UI `tool-rows.js::SYSTEM_HEAD`（`[系统·` 开头、子类闭合于 `]`、≤12 字、后随空白或文末）的归类
 * 判据对齐（改形态 = 系统类静默回落普通气泡——单点在彼处注释）。该行为 `kind:"system"` 第四类投递正文
 * （G-2/W2 同一套投递机真投递给 su；不可撤回——「不可撤回面同 system kind」）。
 */
export const CAPABILITY_INSTALL_SYSTEM_PREFIX = "[系统·安装]";

/** session-env 方法读取的实例状态（方案 §3.6 归属 session-env；B3 暂留门面——同一实例引用传入）。 */
export interface SessionEnvState {
  sessions: ReadonlyMap<string, LiveSession>;
  rebuildChains: Map<string, Promise<void>>;
  installationRefusals: InstallationEffectRefusalObservation[];
  getSelectionVersion: () => number;
  getBoundaryRefreshVersion: () => number;
  getActiveRoleId: () => string | null;
  setActiveRoleId: (roleId: string | null) => void;
}

/** 尚未迁出（B3 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发、返回原样返回。 */
export interface SessionEnvPorts {
  disposeEntry(roleId: string, entry: LiveSession): Promise<string | null>;
  hasBusyRuntime(runtime: RuntimeKind): boolean;
  openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion: number, internalReopen: boolean): Promise<OpenResult>;
  profileRevision(runtime: RuntimeKind): number;
  rebuildSession(target: string | SessionTarget, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult>;
  isCustomerInitiatedTurn(projectRoot: string, runtime: RuntimeKind, roleId: string): boolean;
  watchdogDeliver(projectRoot: string, message: { text: string; summary: string; dedupKey: string; uiOnlyWhenBusy?: boolean }): void;
}

/** session-env 方法读取的 deps 切片（原 `this.deps` 的只读查询）。 */
type SessionEnvDeps = Pick<SessionManagerDeps, "getListing" | "refreshListing" | "emitEvent">;

/** 边界/画像重建、技能/MCP 安装卸载、激活刷新（原 `SessionManager` 11 方法的同签名实现）。 */
export class SessionEnv {
  private readonly state: SessionEnvState;
  private readonly port: SessionEnvPorts;
  private readonly deps: SessionEnvDeps;
  constructor(state: SessionEnvState, port: SessionEnvPorts, deps: SessionEnvDeps) { this.state = state; this.port = port; this.deps = deps; }

  /* 原实例状态的本类只读/同名视图（同一 Map/Array 实例；方案 §3.6 暂留门面口径）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.state.sessions; }
  private get rebuildChains(): Map<string, Promise<void>> { return this.state.rebuildChains; }
  private get installationRefusals(): InstallationEffectRefusalObservation[] { return this.state.installationRefusals; }
  private get selectionVersion(): number { return this.state.getSelectionVersion(); }
  private get boundaryRefreshVersion(): number { return this.state.getBoundaryRefreshVersion(); }
  private get activeRoleId(): string | null { return this.state.getActiveRoleId(); }
  private set activeRoleId(roleId: string | null) { this.state.setActiveRoleId(roleId); }

  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }

  /* 尚未迁出的门面方法端口（参数逐位原样转发）。 */
  private disposeEntry(roleId: string, entry: LiveSession): Promise<string | null> { return this.port.disposeEntry(roleId, entry); }
  private hasBusyRuntime(runtime: RuntimeKind): boolean { return this.port.hasBusyRuntime(runtime); }
  private openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion: number, internalReopen: boolean): Promise<OpenResult> { return this.port.openInternalUnsafe(req, userInitiated, selectionVersion, internalReopen); }
  private profileRevision(runtime: RuntimeKind): number { return this.port.profileRevision(runtime); }
  private rebuildSession(target: string | SessionTarget, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult> { return this.port.rebuildSession(target, beforeDispose); }
  private isCustomerInitiatedTurn(projectRoot: string, runtime: RuntimeKind, roleId: string): boolean { return this.port.isCustomerInitiatedTurn(projectRoot, runtime, roleId); }
  private watchdogDeliver(projectRoot: string, message: { text: string; summary: string; dedupKey: string; uiOnlyWhenBusy?: boolean }): void { this.port.watchdogDeliver(projectRoot, message); }

  installationEffectObservations(projectRoot: string): InstallationEffectRefusalObservation[] {
    return structuredClone(this.installationRefusals.filter(event => event.projectRoot === projectRoot));
  }

  refuseUnprovenInstallation(bindingId: string, toolName: InstallationCapabilityTool, projectRoot: string,
    actorRoleId: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, metadata?: ReportHandbackMetadata): InstallSkillReceipt {
    const entry = this.sessions.get(this.sessionKey(projectRoot, actorRoleId, runtime));
    const origin = handle && entry?.handle === handle ? entry.origins.running : undefined;
    const observation: InstallationEffectRefusalObservation = { bindingId, toolName, projectRoot, actorRoleId, runtime,
      observedAt: new Date().toISOString(), disposition: "refused-before-activation", reasonCode: "effect-scope-unproven",
      ...(handle?.sessionId ? { coreSessionId: handle.sessionId } : {}),
      ...(metadata?.turnId ? { toolTurnId: metadata.turnId } : {}),
      ...(origin?.turnId ? { activeTurnId: origin.turnId } : {}), ...(origin?.kind ? { originKind: origin.kind } : {}) };
    this.installationRefusals.push(observation);
    if (this.installationRefusals.length > 128) this.installationRefusals.shift();
    createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: actorRoleId }).record("capability.effect.refused", {
      toolName, bindingId, reasonCode: observation.reasonCode, ...(observation.coreSessionId ? { sessionId: observation.coreSessionId } : {}),
      ...(observation.toolTurnId ? { turnId: observation.toolTurnId } : {}) });
    return { ok: false, reason: "effect-scope-unproven", message: "此安装或卸载操作的执行范围尚未完成核验，未执行。现有配置保持不变，请稍后重试。" };
  }

  /** 该会话的边界快照**哪一处**变了（返回变化的相对路径；未变 ⇒ null）。
   *  **G-4 裁定⑤（2026-10-16 客户批准）**：第二段＝「该角色已安装技能」集合的**当刻重推导**比对——
   *  ① 冻结路径逐字节（含技能文件的内容编辑）；② 集合差（新增：新技能落盘/登记改列本角色 ⇒ 冻结集里
   *  没有的路径出现；移除：冻结集里的路径从当刻集合消失）。任一差异返回该相对路径。
   *  `currentSkillPaths` 返回 `null`（读目录防御失败）⇒ 跳过本轮集合比对（坏件跳过——绝不误重建）；
   *  零技能两侧皆空 ⇒ 无差（既有语义逐字不变）。 */
  async boundaryDiff(entry: LiveSession): Promise<string | null> {
    for (const f of entry.boundaryPaths) {
      const rel = path.relative(entry.projectRoot, f);
      if (entry.boundaryPrints[rel] !== (await filePrint(f))) return rel;
    }
    const current = await this.currentSkillPaths(entry.projectRoot, entry.roleId);
    if (current !== null) {
      const frozen = new Set(entry.skillPaths);
      const currentSet = new Set(current);
      const first = [...currentSet].filter((f) => !frozen.has(f)).sort()[0]
        ?? [...frozen].filter((f) => !currentSet.has(f)).sort()[0];
      if (first !== undefined) return path.relative(entry.projectRoot, first);
    }
    return null;
  }

  /**
   * **G-4 裁定⑤**：**当刻重新推导**该角色「已安装技能」的参与文件集（`SKILL.md`＋`install.md` 的绝对
   * 路径）。判据与渲染器注入节**同集合**：
   * · 登记读取/解析**唯一来源**＝编排 `readSkillRegistration`（**不复制解析逻辑**）——返回 `undefined`
   *   （坏件/缺失/名非法）⇒ 跳过该条（与渲染器坏件跳过逐字同口径）；
   * · `status !== "installed"` 跳过（`uninstalled` ＝已停用）；`roles` 不含本角色跳过；
   * · `SKILL.md` 缺失**不**在此过滤：路径仍入集合（其指纹为 `<missing>`）——它后来出现即触发重建，
   *   与渲染器「补好文件 ⇒ 新会话注入」收敛一致。
   * 返回 `null`＝本轮**不可推导**（`docs/skills` 读目录失败且非 ENOENT——坏件跳过防御：绝不据此误判
   * 集合差）；`[]`＝零技能（含目录不存在＝项目从未装过技能）。
   */
  async currentSkillPaths(projectRoot: string, roleId: string): Promise<string[] | null> {
    const skillsRoot = path.join(projectRoot, "docs", "skills");
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.promises.readdir(skillsRoot, { withFileTypes: true });
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "ENOENT" ? [] : null;
    }
    const paths: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue; // docs/skills 下直接放的文件不是技能条目（渲染器同口径）
      const registration = readSkillRegistration(projectRoot, entry.name);
      if (registration === undefined || registration.status !== "installed" || !registration.roles.includes(roleId)) continue;
      paths.push(path.join(skillsRoot, entry.name, "SKILL.md"));
      paths.push(path.join(skillsRoot, entry.name, "install.md"));
    }
    paths.sort();
    return paths;
  }

  /** 陈旧 ⇒ 作废重建（dispose → 立即重开 + 如实记行）。返回 undefined = 未陈旧/在跑/已被并发替换（不打断）；
   *  否则返回 `{changed, reopened}`——调用方据此决定续发/续投，或按失败如实处理。
   *
   *  **按角色串行化（2026-10-13 状态机修复；同 drainChains 先例）**：同一角色的重建**至多一个在跑**——
   *  settle 触发的 `refreshStaleBoundaries` 与用户紧接的 `send`/`open` 都会查陈旧，两者**同时**判「陈旧」时：
   *  旧实现双双 dispose+重开，晚到者的 dispose 会误删对方刚建的新会话（可能已开跑轮次）并推 busy=false
   *  （真机「轮次还在跑、忙态翻假、停止钮消失 / 消息落空」的根因）。串行后第二个调用**等第一个重建完全
   *  收尾**再查——那时条目已是新会话（快照新鲜）⇒ 无陈旧 ⇒ no-op；发送/开启照常续在新会话上。
   *  **TOCTOU 重校验（纵深防御）**：每个 `await`（读盘 diff / 会话文件探测）之后再验**同一引用、仍未开跑**
   *  ——即便有人绕过串行链（防御层），也不会误删新条目/打断在跑轮次。 */
  rebuildIfBoundaryStale(
    roleId: string,
    userInitiated: boolean,
    selectionVersion = this.selectionVersion,
    // T3 B8.1：由 fixed 派发/投递的 forced 打开透传——陈旧重建后的会话仍按 fixed 重开（不会被聊天解析
    // 在混合项目里换回 legacy）。settle 扫描/手动重建等调用不传，行为逐字不变。
    forcedWorkflowMode?: WorkflowMode,
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    const prev = this.rebuildChains.get(roleId) ?? Promise.resolve();
    const run = prev.then(() => this.rebuildIfBoundaryStaleUnsafe(roleId, userInitiated, selectionVersion, forcedWorkflowMode));
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.rebuildChains.set(roleId, tail);
    void tail.then(() => {
      if (this.rebuildChains.get(roleId) === tail) this.rebuildChains.delete(roleId); // 链尾清理（防泄漏）
    });
    return run;
  }

  async rebuildIfBoundaryStaleUnsafe(
    roleId: string,
    userInitiated: boolean,
    selectionVersion: number,
    forcedWorkflowMode?: WorkflowMode,
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    const entry = this.sessions.get(roleId);
    if (!entry) return undefined;
    const wasActive = this.activeRoleId === roleId;
    if (entry.busy) return undefined; // 在跑的轮次不打断（settle 后放行/下次发言/下次投递再查）
    let changed = await this.boundaryDiff(entry);
    if (changed === null && entry.profileRevision !== this.profileRevision(entry.runtime)) changed = mainT("main.session.rebuildChangedRuntimeConfig");
    if (changed === null) return undefined;
    if (entry.profileRevision !== this.profileRevision("pi") && entry.runtime === "pi" && this.hasBusyRuntime("pi")) return undefined;
    if (this.sessions.get(roleId) !== entry || entry.busy) return undefined; // 读盘期间被替换/开跑（TOCTOU）
    const projectRoot = entry.projectRoot;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId });
    diagnostic.record("session.rebuild.start");
    // dispose 保留 ANS 回放；模型上下文是否恢复只读新句柄实际返回。
    await this.disposeEntry(roleId, entry);
    // 如实记行（哪个文件变的直接点名）：G-4 裁定⑤ 起陈旧源还有「已安装技能」——文档面不同、措辞分开
    // （技能不是边界；既不夸大也不含糊），其余分支逐字沿用既有文案（测试已钉）。
    const isSkillChange = changed.split(path.sep).join("/").startsWith("docs/skills/");
    this.deps.emitEvent({
      roleId: entry.roleId, projectRoot, runtime: entry.runtime,
      event: {
        kind: "message",
        summary: isSkillChange
          ? mainT("main.session.rebuiltSkills", { changed })
          : mainT("main.session.rebuiltBoundary", { changed }),
      },
    });
    // 重建不自行选择角色。仅成功且用户意图未改变时恢复被 dispose 清空的活动目标。
    // **F-2-opt2 防死锁**：本重开是**持锁方（openInternal 的续接前查陈旧）所等待的那条链**内的续段——
    // 必须直调 `openInternalUnsafe`（不再入 openChains）并带 `internalReopen`（不再查陈旧/不再入 rebuild 链，
    // 防「链内等待自身尾」的自死锁）；此处旧条目已 dispose（或纯新建），不会再触发任何 reopen 预检。
    const reopened = await this.openInternalUnsafe({ projectRoot, roleId: entry.roleId, runtime: entry.runtime, ...((entry.boundAssignment?.taskId ?? entry.assignedTaskId) ? { taskId: entry.boundAssignment?.taskId ?? entry.assignedTaskId } : {}), ...(forcedWorkflowMode !== undefined ? { forcedWorkflowMode } : {}) }, false, this.selectionVersion, true);
    if (reopened.ok) this.queueRebuildWritePermitsNotice(roleId); // 入参＝会话键（本函数参数即键）
    if (reopened.ok && (wasActive || userInitiated) && this.selectionVersion === selectionVersion) {
      const current = this.sessions.get(roleId);
      if (current && current.projectRoot === projectRoot) this.activeRoleId = roleId;
    }
    if (!reopened.ok) {
      diagnostic.error("session.rebuild.failed", new Error(reopened.error || "重开失败"));
      this.deps.emitEvent({
        roleId: entry.roleId, projectRoot, runtime: entry.runtime,
        event: { kind: "message", summary: mainT("main.session.rebuildFailed", { detail: reopened.error ?? mainT("shared.common.unknownReason") }) },
      });
    }
    diagnostic.record("session.rebuild.end", { ok: reopened.ok });
    return { changed, reopened };
  }

  /**
   * **F-5-opt1（桌面侧，2026-10-16 客户批准）**：确认制会话（su）重建 ⇒ 编排闭包内「客户确认才发行」的
   * **已发行写权集随之清零**（内存态、不随新句柄保留）——对**模型**如实可见（除既有 UI 重建行外）。
   * 经编排的 `queueModelNotice` 把注记排进**下一轮输入前缀**（送达一次即消费；不单独开轮、不改任何判定——
   * 接口与语义见 run-role.ts；文案用其**单一来源**常量，绝不在此各写一份）。**非确认制会话没有发行过任何
   * 写权**（gate 不收窄，连 request_confirmation 都未注册）⇒ 不排（绝不向模型说假话）。旧替身句柄不带该
   * 方法；如实降级，不假装已送达）。**陈旧重建（O-1）与人工重建（G-2/W4）共用本件**。
   * ⚠ 入参是 `sessions` 表的**会话键**（`sessionKey`）——不是裸 roleId（`rebuildChains` 同以键索引）。
   */
  queueRebuildWritePermitsNotice(sessionKey: string): void {
    const rebuiltEntry = this.sessions.get(sessionKey);
    if (rebuiltEntry?.confirmGated) {
      try {
        rebuiltEntry.handle.queueModelNotice?.(REBUILT_SESSION_WRITE_PERMITS_NOTICE);
      } catch {
        // 注记只是诚实提示，不是判定链的一环：排入失败不打断重建收尾（重建本身已如实记行）。
      }
    }
  }

  /**
   * O-1：对所有**活会话**扫一遍边界快照（su 一轮结束时由 Interface 触发——「边界可能刚被 su 改过」的
   * 可信时机）。陈旧者作废重建（如实记行）；**在跑的轮次跳过**（下一时机再查）。逐会话 try/catch 隔离
   * （一个失败不影响其它；不上抛——本方法经 `void` fire-and-forget 调用）。返回重建的角色 id。
   */
  async refreshStaleBoundaries(): Promise<string[]> {
    const rebuiltIds: string[] = [];
    const refreshVersion = this.boundaryRefreshVersion;
    for (const roleId of [...this.sessions.keys()]) {
      if (this.boundaryRefreshVersion !== refreshVersion) break;
      try {
        const rebuilt = await this.rebuildIfBoundaryStale(roleId, false);
        if (rebuilt !== undefined) rebuiltIds.push(roleId.split("\u0000")[1]);
      } catch {
        // 逐会话隔离（读盘异常等）：跳过该角色，不打断事件流；下次时机再查。
      }
    }
    return rebuiltIds;
  }

  /**
   * **激活共用件**（⑥；技能与外来 MCP 两族 handler 同款）：复用既有 `rebuildSession`（串行链＋在跑
   * 拒绝＋三态），**不打断**任何在跑轮次。返回：
   * · `{effective:"rebuilt"}`＝目标 idle、已重建（即刻生效）；
   * · `{effective:"next-session", note?}`＝如实延迟态（在跑 ⇒ 无 note；**无会话** ⇒ note 说明「并非在跑
   *   轮次」——无旧上下文可重建、**绝不自动开目标会话**（激活≠开户））；
   * · `{effective:"next-session", error}`＝重开失败（调用方按各自登记面组成 `rebuild-failed` 回执——
   *   登记/声明仍在，**不假装已生效**）。竞态（检查后目标开跑一轮）按其如实延迟、不报失败。
   */
  async activateRoleRefresh(projectRoot: string, runtime: RuntimeKind, roleId: string, beforeEffect?: () => Promise<boolean>): Promise<{ effective: "rebuilt" | "next-session"; note?: string; error?: string }> {
    const targetSessionKey = this.sessionKey(projectRoot, roleId, runtime);
    const targetEntry = this.sessions.get(targetSessionKey);
    if (!targetEntry) {
      return { effective: "next-session", note: mainT("main.session.configNextSession") };
    }
    if (targetEntry.busy) return { effective: "next-session" }; // 在跑轮次不打断（沿 G-2 语义）；本次回执如实延迟
    const rebuilt = await this.rebuildSession({ projectRoot, roleId, runtime }, beforeEffect
      ? async current => current === targetEntry && await beforeEffect()
      : undefined);
    if (rebuilt.ok) return { effective: "rebuilt" };
    if (this.sessions.get(targetSessionKey)?.busy === true) return { effective: "next-session" }; // 竞态：检查后开跑——不报失败
    return { effective: "next-session", error: rebuilt.error ?? mainT("shared.common.unknownReason") };
  }

  /**
   * `install_skill` / `uninstall_skill` 的共用实现（注入能力侧；回执形状冻结——`model/runtime.ts`）。
   * 分支顺序（一切失败都先于任何副作用）：
   * ① 护栏（`not-customer-turn`）→ ② 载荷防御 → ③ 目标角色（`role-not-found`）→ ④ 登记（`not-registered`
   * / `role-not-listed`；卸载登记未变 ⇒ `registration-unchanged`）→ ⑤ 内容件与运行期哈希（缺件 ⇒
   * `not-registered` 类如实）→ ⑥ 激活（`rebuilt` / `next-session`；重建失败 ⇒ `rebuild-failed`）→
   * ⑦ 回执 ＋ `[系统·安装]` 系统行 ＋ 诊断。
   */
  async applySkillChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallSkillPayload,
    beforeActivation?: () => Promise<boolean>,
  ): Promise<InstallSkillReceipt> {
    const acting = action === "installed";
    const verb = acting ? mainT("main.session.install.verbInstall") : mainT("main.session.install.verbUninstall");
    const toolName = acting ? "install_skill" : "uninstall_skill";
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: callerRoleId });
    const refuse = (reason: string, message: string): InstallSkillReceipt => {
      diagnostic.record("skill.refused", { toolName, targetRoleId: typeof d?.roleId === "string" ? d.roleId : "", reasonCode: reason });
      return { ok: false, reason, message };
    };

    // ① 裁定④ 轮次护栏（**先判**；拒绝零副作用——不触目标、不读登记、不投系统行）。
    if (!this.isCustomerInitiatedTurn(projectRoot, runtime, callerRoleId)) {
      return refuse("not-customer-turn", mainT("main.session.install.notCustomerTurn"));
    }

    // ② 载荷防御（模型输入不可信——本层全量重校验，不依赖工具层的参数校验）。
    const roleId = typeof d?.roleId === "string" ? d.roleId.trim() : "";
    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (roleId === "") return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    if (name === "") return refuse("not-registered", mainT("main.session.install.skillNotRegistered", { name, verb }));

    // ③ 目标角色须是**本项目项目角色**（非内置治理角色 su 自身/同类）；缓存 miss ⇒ 实时重枚举一次
    //   （首轮寻址先例：`routeDispatch` / `proposeRecovery` 同款——新建角色同轮安装不误拒）。
    const findTarget = (): { builtIn?: boolean } | undefined => {
      const listing = this.deps.getListing(projectRoot);
      return listing ? listing.roles.find((r) => r.roleId === roleId) : undefined;
    };
    let target = findTarget();
    if (!target && this.deps.refreshListing) {
      try {
        await this.deps.refreshListing(projectRoot);
      } catch {
        // 重枚举失败（读盘竞态等）：按原 miss 口径如实拒绝，不上抛。
      }
      target = findTarget();
    }
    if (!target || target.builtIn === true || isBuiltInGovernanceRoleId(roleId)) {
      return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    }

    // ④ 登记校验（**唯一来源**＝编排 `readSkillRegistration`——与渲染器坏件集逐字同口径，绝不复制解析）。
    const registration = readSkillRegistration(projectRoot, name);
    if (registration === undefined) {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.skillNotRegisteredInstall", { name })
          : mainT("main.session.install.skillNotRegisteredUninstall", { name }),
      );
    }
    if (acting) {
      if (!registration.roles.includes(roleId)) {
        return refuse("role-not-listed", mainT("main.session.install.roleNotListed", { roleId }));
      }
      if (registration.status !== "installed") {
        return refuse(
          "not-registered",
          mainT("main.session.install.skillStatus", { name, status: registration.status }),
        );
      }
    } else if (registration.status === "installed" && registration.roles.includes(roleId)) {
      // 卸载专有两钉之一：**先改登记再卸载**——登记仍含角色即拒绝（防「工具说撤了、登记没变」）。
      return refuse("registration-unchanged", mainT("main.session.install.registrationUnchanged", { roleId }));
    }

    // ⑤ 内容件存在性与运行期哈希（sha256 **原始字节**——复用 `filePrint` 缓存件；与渲染器/`finalize.ts`
    //   同算法：「哈希只能由代码算」）。缺件 ⇒ 如实拒绝（回执冻形要求 `path`＋`digest`——不拿哨兵充数）。
    const skillRel = `docs/skills/${name}/SKILL.md`;
    const digest = await filePrint(path.join(projectRoot, "docs", "skills", name, "SKILL.md"));
    if (digest === "<missing>") {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.skillMissing", { path: skillRel })
          : mainT("main.session.install.skillMissingUninstall", { path: skillRel }),
      );
    }

    // ⑥ 激活（共用件 `activateRoleRefresh`——复用既有 `rebuildSession` 三态，两族 handler 同款）：
    //    idle ⇒ rebuilt（即刻生效）；在跑 ⇒ next-session（如实延迟态，**不是错误**——settle 后靠既有
    //    检查点（含裁定⑤ 指纹）收敛）；无会话 ⇒ next-session（无旧上下文可重建）；重开失败 ⇒
    //    rebuild-failed（登记仍在，**不假装已生效**）。
    if (beforeActivation && !(await beforeActivation()))
      return refuse("effect-scope-unproven", "调用来源或执行范围已变化，未激活或刷新目标会话。");
    const activation = await this.activateRoleRefresh(projectRoot, runtime, roleId, beforeActivation);
    if (activation.error !== undefined) {
      diagnostic.error("skill.rebuild.failed", new Error(activation.error), { toolName, targetRoleId: roleId });
      return {
        ok: false,
        reason: "rebuild-failed",
        message: mainT("main.session.install.rebuildFailed", { action: acting ? "变更" : "撤销", roleId, detail: activation.error }),
      };
    }
    const effective = activation.effective;
    const note = activation.note;

    // ⑦ 如实回执（冻形）＋ `[系统·安装]` 定格系统行（`kind:"system"` 第四类通道真投递给 su——忙时排队、
    //    未开自动开、失败保留重试全复用；不可撤回）＋诊断。**不写盘、不放行任何写入、不改任何写边界**。
    const effectivePhrase =
      effective === "rebuilt"
        ? mainT("main.session.install.effectiveRebuilt")
        : note !== undefined
          ? mainT("main.session.install.effectiveNextSession")
          : mainT("main.session.install.effectiveAfterTurn");
    const shortDigest = digest.slice(0, 12);
    const rowText = acting
      ? `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.installedSkill", { name, roleId, effective: effectivePhrase, path: skillRel, digest: shortDigest })}`
      : `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.uninstalledSkill", { name, roleId, path: skillRel, digest: shortDigest, effective: effectivePhrase })}`;
    this.watchdogDeliver(projectRoot, {
      text: rowText,
      summary: mainT("main.session.install.summarySkill", { verb, name, roleId, effectiveShort: effective === "rebuilt" ? mainT("main.session.install.effectiveShortRebuilt") : mainT("main.session.install.effectiveShortNextSession") }),
      // 命名空间同看护（`watchdog\0…`——与回交/派发键隔离）；每条动作独立（重装/重卸是合法事件，不去重）。
      dedupKey: `watchdog\u0000${projectRoot}\u0000install-row\u0000${randomUUID()}`,
    });
    diagnostic.record(acting ? "skill.installed" : "skill.uninstalled", { toolName, targetRoleId: roleId, path: skillRel, state: effective });
    return {
      ok: true,
      action,
      roleId,
      name,
      path: skillRel,
      digest,
      effective,
      ...(note !== undefined ? { note } : {}),
    };
  }

  /**
   * `install_mcp` / `uninstall_mcp` 的共用实现（注入能力侧；回执形状冻结——`model/runtime.ts`，沿技能版
   * 体格）。分支顺序同技能版：① 护栏（`not-customer-turn`）→ ② 载荷防御 → ③ 目标角色（`role-not-found`）
   * → ④ 声明（唯一来源＝运行时核心 `readMcpDeclaration`，**不复制解析逻辑**：`not-registered`／
   * `role-not-listed`；卸载声明未变 ⇒ `registration-unchanged`）→ ⑤ 声明文件与运行期哈希（缺件 ⇒
   * `not-registered` 类如实）→ ⑥ 激活（共用 `activateRoleRefresh`：`rebuilt`／`next-session`／
   * `rebuild-failed`）→ ⑦ 回执 ＋ `[系统·安装]` 系统行 ＋ 诊断。
   */
  async applyMcpChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallMcpPayload,
    beforeActivation?: () => Promise<boolean>,
  ): Promise<InstallMcpReceipt> {
    const acting = action === "installed";
    const verb = acting ? mainT("main.session.install.verbInstall") : mainT("main.session.install.verbUninstall");
    const toolName = acting ? "install_mcp" : "uninstall_mcp";
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: callerRoleId });
    const refuse = (reason: string, message: string): InstallMcpReceipt => {
      diagnostic.record("mcp.refused", { toolName, targetRoleId: typeof d?.roleId === "string" ? d.roleId : "", reasonCode: reason });
      return { ok: false, reason, message };
    };

    // ① 裁定④ 轮次护栏（**先判**；与技能两工具同判据同文案）。
    if (!this.isCustomerInitiatedTurn(projectRoot, runtime, callerRoleId)) {
      return refuse("not-customer-turn", mainT("main.session.install.notCustomerTurn"));
    }

    // ② 载荷防御（模型输入不可信——本层全量重校验）。
    const roleId = typeof d?.roleId === "string" ? d.roleId.trim() : "";
    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (roleId === "") return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    if (name === "") return refuse("not-registered", mainT("main.session.install.mcpNotRegistered", { name, verb }));

    // ③ 目标角色须是**本项目项目角色**（非内置治理角色 su 自身/同类）；缓存 miss ⇒ 实时重枚举一次
    //   （与技能版同口径；首轮寻址先例）。
    const findTarget = (): { builtIn?: boolean } | undefined => {
      const listing = this.deps.getListing(projectRoot);
      return listing ? listing.roles.find((r) => r.roleId === roleId) : undefined;
    };
    let target = findTarget();
    if (!target && this.deps.refreshListing) {
      try {
        await this.deps.refreshListing(projectRoot);
      } catch {
        // 重枚举失败（读盘竞态等）：按原 miss 口径如实拒绝，不上抛。
      }
      target = findTarget();
    }
    if (!target || target.builtIn === true || isBuiltInGovernanceRoleId(roleId)) {
      return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    }

    // ④ 声明校验（**唯一来源**＝运行时核心 `readMcpDeclaration`——与装配列表函数逐字同口径，绝不复制解析）。
    const declaration = readMcpDeclaration(projectRoot, name);
    if (declaration === undefined) {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.mcpNotRegisteredInstall", { name })
          : mainT("main.session.install.mcpNotRegisteredUninstall", { name }),
      );
    }
    if (acting) {
      if (!declaration.roles.includes(roleId)) {
        return refuse("role-not-listed", mainT("main.session.install.roleNotListed", { roleId }));
      }
      if (declaration.status !== "installed") {
        return refuse(
          "not-registered",
          mainT("main.session.install.mcpStatus", { name, status: declaration.status }),
        );
      }
    } else if (declaration.status === "installed" && declaration.roles.includes(roleId)) {
      // 卸载专有两钉之一：**先改声明再卸载**——声明仍含角色即拒绝（防「工具说撤了、声明没变」）。
      return refuse("registration-unchanged", mainT("main.session.install.registrationUnchanged", { roleId }));
    }

    // ⑤ 声明文件存在性与运行期哈希（sha256 **原始字节**——复用 `filePrint`；与技能版同算法）。缺件 ⇒
    //   如实拒绝（回执冻形要求 `path`＋`digest`；卸载须能如实作「文件保留」陈述——不拿哨兵充数）。
    const declarationRel = `docs/mcp/${name}.md`; // ＝视图 `declaration.path` 同口径（回执/诊断同一路径）
    const digest = await filePrint(path.join(projectRoot, "docs", "mcp", `${name}.md`));
    if (digest === "<missing>") {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.mcpDeclarationMissing", { path: declarationRel })
          : mainT("main.session.install.mcpDeclarationMissingUninstall", { path: declarationRel }),
      );
    }

    // ⑥ 激活（共用件 `activateRoleRefresh`——同技能版三态与竞态语义）。
    if (beforeActivation && !(await beforeActivation()))
      return refuse("effect-scope-unproven", "调用来源或执行范围已变化，未激活或刷新目标会话。");
    const activation = await this.activateRoleRefresh(projectRoot, runtime, roleId, beforeActivation);
    if (activation.error !== undefined) {
      diagnostic.error("mcp.rebuild.failed", new Error(activation.error), { toolName, targetRoleId: roleId });
      return {
        ok: false,
        reason: "rebuild-failed",
        message: mainT("main.session.install.mcpRebuildFailed", { action: acting ? "变更" : "撤销", roleId, detail: activation.error }),
      };
    }
    const effective = activation.effective;
    const note = activation.note;

    // ⑦ 如实回执（冻形）＋ `[系统·安装]` 定格系统行（同技能版：kind:"system" 第四类通道真投递给 su——
    //    不可撤回）＋诊断。**不写盘、不放行任何写入、不改任何写边界**；诚实面（门禁之外执行＝能力级
    //    授予，**非逐调用受审**）写进系统行（不得宣称受审）。
    const effectivePhrase =
      effective === "rebuilt"
        ? mainT("main.session.install.effectiveRebuilt")
        : note !== undefined
          ? mainT("main.session.install.effectiveNextSession")
          : mainT("main.session.install.effectiveAfterTurn");
    const shortDigest = digest.slice(0, 12);
    const rowText = acting
      ? `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.installedMcp", { name, roleId, effective: effectivePhrase, path: declarationRel, digest: shortDigest })}`
      : `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.uninstalledMcp", { name, roleId, path: declarationRel, digest: shortDigest, effective: effectivePhrase })}`;
    this.watchdogDeliver(projectRoot, {
      text: rowText,
      summary: mainT("main.session.install.summaryMcp", { verb, name, roleId, effectiveShort: effective === "rebuilt" ? mainT("main.session.install.effectiveShortRebuilt") : mainT("main.session.install.effectiveShortNextSession") }),
      dedupKey: `watchdog\u0000${projectRoot}\u0000mcp-install-row\u0000${randomUUID()}`,
    });
    diagnostic.record(acting ? "mcp.installed" : "mcp.uninstalled", { toolName, targetRoleId: roleId, path: declarationRel, state: effective });
    return {
      ok: true,
      action,
      roleId,
      name,
      path: declarationRel,
      digest,
      effective,
      ...(note !== undefined ? { note } : {}),
    };
  }
}

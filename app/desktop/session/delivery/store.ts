// app/desktop/session/delivery/store.ts
// B4（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §5 B4、附录 A delivery 组）：投递队列**快照序列化/原子写/重启恢复**（L1，白名单 []）。
// 7 个类方法（persistableDeliveryItem/deliveryStoreItems/deliveryQueuePersistenceFacts/
// finishStopPersistence/persistDeliveryQueues/parsePersistedDeliveryItem/restorePersistedDeliveries）
// 自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳重建原 receiver 面——
//  · 状态经 DeliveryStoreState 显式传入（与 delivery/queue.ts 的 Delivery **同一实例**；方案 §3.6）；
//  · shared 方法（readTasks/rememberTaskCreator/now/publishDeliveryInventory）经同名同义委托 → shared/*；
//  · 队列动作（enqueueDelivery/drainQueue）、managerId、库存状态面经 DeliveryStorePorts 回调注入，
//    参数逐位原样转发（运行期调用；两阶段装配避免构造期环）。
// 可见性 private → 模块内 public 仅为同模块/门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L1 delivery/store 只可导入 L0（contracts/shared）与外部 src。

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { isDirectActionSource } from "../../../../src/model/trunk.ts";
import { isDispatchTaskResumeController } from "../../../../src/model/runtime.ts";
import type { RuntimeLiveReportViewV1, RuntimeReportSnapshotV1 } from "../../../../src/model/runtime.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { TaskHandback } from "../../../../src/common/编排/handback.ts";
import type {
  ControllerResumeDelivery,
  DeliveryAssignment,
  DeliveryItem,
  DeliveryQueuePersistenceFacts,
  DeliveryQueuePersistenceOutcome,
  DeliveryQueueRestoreReport,
  PersistedDeliveryItemV1,
  StopResult,
} from "../contracts/session-types.ts";
import { now } from "../shared/clock.ts";
import { queueKey } from "../shared/keys.ts";
import { isAppTaskClientMessageId } from "../shared/text.ts";
import { readTasks, rememberTaskCreator, taskCreators } from "../shared/tasks-store.ts";
import { publishDeliveryInventory, type SessionInventoryState } from "../shared/inventory.ts";
import { mainT } from "../../i18n.ts";

/** 传入的跨模块只读状态面（方案 §3.6；同一实例引用；本模块只读/按原样写回）。 */
export interface DeliveryStoreRefs {
  openChains: { readonly size: number };
  activeDispatchKeys: Set<string>;
  starTaskIds: Set<string>;
  enqueuedHandbackKeys: Set<string>;
}

/** 尚未迁出（B4 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发、返回原样返回。 */
export interface DeliveryStorePorts {
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  managerId(): string;
  inventoryState(): SessionInventoryState;
}

/** store 方法读取的 deps 切片（时钟注入）。 */
type DeliveryStoreDeps = { now?: () => number };

/** delivery 状态中本模块读写的子集（delivery/queue.ts 的 DeliveryState 结构上扩展本接口；同一对象）。 */
export interface DeliveryStoreState {
  readonly deliveryQueues: Map<string, DeliveryItem[]>;
  readonly activeDeliveries: Map<string, DeliveryItem>;
  readonly deliveredDeliveryKeys: Set<string>;
  readonly deliveredAppTaskIds: Set<string>;
  deliveryStoreArmed: boolean;
  readonly deliveryQueueStorePath: string | undefined;
  deliveryPersistOutcome: DeliveryQueuePersistenceOutcome;
  deliveryPersistChain: Promise<DeliveryQueuePersistenceOutcome>;
  deliveryPersistSeq: number;
  readonly drainClaimRecords: { readonly size: number };
  readonly taskHandbackCommits: { readonly size: number };
}

/** 投递队列快照序列化/原子写/重启恢复（原 SessionManager 7 方法的同签名实现）。 */
export class DeliveryStore {
  private readonly state: DeliveryStoreState;
  private readonly refs: DeliveryStoreRefs;
  private readonly port: DeliveryStorePorts;
  private readonly deps: DeliveryStoreDeps;
  constructor(state: DeliveryStoreState, refs: DeliveryStoreRefs, port: DeliveryStorePorts, deps: DeliveryStoreDeps) {
    this.state = state; this.refs = refs; this.port = port; this.deps = deps;
  }

  /* 原实例状态的本类同名视图（同一 Map/Set 实例；方案 §3.6 delivery 单 owner）。 */
  private get deliveryQueues(): Map<string, DeliveryItem[]> { return this.state.deliveryQueues; }
  private get activeDeliveries(): Map<string, DeliveryItem> { return this.state.activeDeliveries; }
  private get deliveredDeliveryKeys(): Set<string> { return this.state.deliveredDeliveryKeys; }
  private get deliveredAppTaskIds(): Set<string> { return this.state.deliveredAppTaskIds; }
  private get deliveryStoreArmed(): boolean { return this.state.deliveryStoreArmed; }
  private set deliveryStoreArmed(value: boolean) { this.state.deliveryStoreArmed = value; }
  private get deliveryQueueStorePath(): string | undefined { return this.state.deliveryQueueStorePath; }
  private get deliveryPersistOutcome(): DeliveryQueuePersistenceOutcome { return this.state.deliveryPersistOutcome; }
  private set deliveryPersistOutcome(value: DeliveryQueuePersistenceOutcome) { this.state.deliveryPersistOutcome = value; }
  private get deliveryPersistChain(): Promise<DeliveryQueuePersistenceOutcome> { return this.state.deliveryPersistChain; }
  private set deliveryPersistChain(value: Promise<DeliveryQueuePersistenceOutcome>) { this.state.deliveryPersistChain = value; }
  private get deliveryPersistSeq(): number { return this.state.deliveryPersistSeq; }
  private set deliveryPersistSeq(value: number) { this.state.deliveryPersistSeq = value; }
  private get drainClaimRecords(): { readonly size: number } { return this.state.drainClaimRecords; }
  private get taskHandbackCommits(): { readonly size: number } { return this.state.taskHandbackCommits; }
  private get openChains(): { readonly size: number } { return this.refs.openChains; }
  private get activeDispatchKeys(): Set<string> { return this.refs.activeDispatchKeys; }
  private get starTaskIds(): Set<string> { return this.refs.starTaskIds; }
  private get enqueuedHandbackKeys(): Set<string> { return this.refs.enqueuedHandbackKeys; }
  private get managerId(): string { return this.port.managerId(); }

  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private now(): number { return now(this.deps); }
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string { return queueKey(projectRoot, targetRoleId, runtime); }
  private async readTasks(projectRoot: string): ReturnType<typeof readTasks> { return readTasks(projectRoot); }
  private rememberTaskCreator(taskId: string, created: { from?: "chief" | "convener" } | undefined): void { rememberTaskCreator(taskId, created); }
  private publishDeliveryInventory(reason: string): void { publishDeliveryInventory(reason, this.port.inventoryState()); }

  /* 尚未迁出的门面方法端口（参数逐位原样转发）。 */
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void { this.port.enqueueDelivery(projectRoot, targetRoleId, item); }
  private drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> { return this.port.drainQueue(projectRoot, targetRoleId, runtime); }

  // —— persistableDeliveryItem（B4 自 session.ts 逐字搬移）——
  /** 一条投递条目的 JSON 安全快照；不可序列化（含用户载荷里塞了怪对象）⇒ undefined（该条不落盘）。 */
  persistableDeliveryItem(item: DeliveryItem): PersistedDeliveryItemV1["item"] | undefined {
    try {
      const snapshot: PersistedDeliveryItemV1["item"] = {
        kind: item.kind,
        runtime: item.runtime,
        targetRoleId: item.targetRoleId,
        sourceRoleId: item.sourceRoleId,
        text: item.text,
        summary: item.summary,
        dedupKey: item.dedupKey,
        enqueuedAt: item.enqueuedAt,
        ...(typeof item.flowId === "string" && item.flowId !== "" ? { flowId: item.flowId } : {}),
        ...(typeof item.taskId === "string" && item.taskId !== "" ? { taskId: item.taskId } : {}),
        ...(item.queueEntryId ? { queueEntryId: item.queueEntryId } : {}),
        ...(item.kind === "system" && item.systemAssignment !== undefined ? { systemAssignment: item.systemAssignment } : {}),
        ...(item.notificationSource ? { notificationSource: structuredClone(item.notificationSource) } : {}),
        ...(item.controllerResume ? { controllerResume: structuredClone(item.controllerResume) } : {}),
        ...(typeof item.deliveryId === "string" ? { deliveryId: item.deliveryId } : {}),
        ...(isAppTaskClientMessageId(item.clientMessageId) ? { clientMessageId: item.clientMessageId } : {}),
        ...(item.handback !== undefined ? { handback: item.handback } : {}),
        ...(item.report !== undefined ? { report: item.report } : {}),
        ...(item.liveReport !== undefined ? { liveReport: item.liveReport } : {}),
        ...(item.liveDurability !== undefined ? { liveDurability: item.liveDurability } : {}),
      };
      JSON.stringify(snapshot); // 验证可序列化（坏载荷 ⇒ 该条不落盘，绝不拖垮其余条目）
      return snapshot;
    } catch {
      return undefined;
    }
  }

  // —— deliveryStoreItems（B4 自 session.ts 逐字搬移）——
  /** 当前内存态的持久化快照：排队项（queued）＋ 未完成在途项（in-flight；delivery.end 已完成的排除）。 */
  deliveryStoreItems(): PersistedDeliveryItemV1[] {
    const items: PersistedDeliveryItemV1[] = [];
    for (const [key, queue] of this.deliveryQueues) {
      const [projectRoot = "", roleId = "", runtimeRaw = ""] = key.split("\u0000");
      const runtime = runtimeRaw as RuntimeKind;
      for (const item of queue) {
        const snapshot = this.persistableDeliveryItem(item);
        if (snapshot === undefined) continue;
        items.push({ key: { projectRoot, roleId, runtime }, item: snapshot, state: "queued", enqueuedAt: item.enqueuedAt });
      }
    }
    for (const [key, item] of this.activeDeliveries) {
      if (this.deliveredDeliveryKeys.has(`${key}\u0000${item.dedupKey}`)) continue; // delivery.end 已完成：不重投
      const snapshot = this.persistableDeliveryItem(item);
      if (snapshot === undefined) continue;
      const [projectRoot = "", roleId = "", runtimeRaw = ""] = key.split("\u0000");
      items.push({ key: { projectRoot, roleId, runtime: runtimeRaw as RuntimeKind }, item: snapshot, state: "in-flight", enqueuedAt: item.enqueuedAt });
    }
    return items;
  }

  // —— deliveryQueuePersistenceFacts（B4 自 session.ts 逐字搬移）——
  deliveryQueuePersistenceFacts(): DeliveryQueuePersistenceFacts {
    return { managerId: this.managerId, ...structuredClone(this.deliveryPersistOutcome), ...(this.deliveryQueueStorePath ? { path: this.deliveryQueueStorePath } : {}),
      armed: this.deliveryStoreArmed, enqueuedSeq: this.deliveryPersistSeq,
      pending: this.deliveryPersistSeq - this.deliveryPersistOutcome.completedSeq,
      knownProducers: { openChains: this.openChains.size, deliveryClaims: this.drainClaimRecords.size, handbackCommits: this.taskHandbackCommits.size } };
  }

  // —— finishStopPersistence（B4 自 session.ts 逐字搬移）——
  async finishStopPersistence(result: StopResult): Promise<StopResult> {
    // Capture both before awaiting: new external queue events remain legal and are not this stop's writes.
    const targetSeq = this.deliveryPersistSeq, chain = this.deliveryPersistChain, armed = this.deliveryStoreArmed;
    const outcome = await chain;
    const deliveryQueuePersistence = { managerId: this.managerId, ...structuredClone(outcome), targetSeq, armed, pending: targetSeq - outcome.completedSeq,
      ...(this.deliveryQueueStorePath ? { path: this.deliveryQueueStorePath } : {}) };
    if (outcome.committedSeq !== targetSeq) return { ...result, ok: false,
      note: `${result.note} ${mainT("main.session.releaseError", { detail: `delivery-queue-persistence-failed:${outcome.lastError?.code ?? "unknown"}` })}`,
      deliveryQueuePersistence };
    return { ...result, deliveryQueuePersistence };
  }

  // —— persistDeliveryQueues（B4 自 session.ts 逐字搬移）——
  /** Atomic writes stay asynchronous during delivery; stop awaits only its captured finite chain. */
  persistDeliveryQueues(): void {
    const storePath = this.deliveryQueueStorePath;
    if (storePath === undefined || !this.deliveryStoreArmed) return;
    const seq = ++this.deliveryPersistSeq;
    this.publishDeliveryInventory("delivery-persistence-enqueued");
    let items: PersistedDeliveryItemV1[] | undefined, snapshotError: unknown, snapshotFailed = false;
    try { items = this.deliveryStoreItems(); } catch (error) { snapshotError = error; snapshotFailed = true; }
    this.deliveryPersistChain = this.deliveryPersistChain.then(async previous => {
      const tmp = `${storePath}.tmp-${process.pid}-${seq}`;
      let outcome: DeliveryQueuePersistenceOutcome;
      try {
        if (snapshotFailed) throw snapshotError;
        await fs.promises.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
        await fs.promises.writeFile(tmp, JSON.stringify({ version: 1, items }), "utf8");
        await fs.promises.rename(tmp, storePath);
        outcome = { ...previous, completedSeq: seq, committedSeq: seq };
      } catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
        outcome = { ...previous, completedSeq: seq, failureCount: previous.failureCount + 1, lastError: { seq, code, path: storePath } };
        try { createDiagnosticLogger({ component: "desktop.delivery" }).error("delivery.queue.persist.failed", error); } catch { /* error observation cannot erase the failed write */ }
        try { await fs.promises.rm(tmp, { force: true }); } catch { /* preserve original write failure */ }
      }
      this.deliveryPersistOutcome = outcome;
      this.publishDeliveryInventory("delivery-persistence-settled");
      return outcome;
    });
  }

  // —— parsePersistedDeliveryItem（B4 自 session.ts 逐字搬移）——
  /** 读回一条持久条目（模型输入一律不可信：全量重校验；坏条 ⇒ undefined）。 */
  parsePersistedDeliveryItem(raw: unknown): { projectRoot: string; roleId: string; runtime: RuntimeKind; item: DeliveryItem } | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const record = raw as Record<string, unknown>;
    const keyRaw = record.key;
    if (keyRaw === null || typeof keyRaw !== "object" || Array.isArray(keyRaw)) return undefined;
    const key = keyRaw as Record<string, unknown>;
    if (typeof key.projectRoot !== "string" || key.projectRoot === "") return undefined;
    if (typeof key.roleId !== "string") return undefined;
    if (typeof key.runtime !== "string" || !(RUNTIME_KINDS as readonly string[]).includes(key.runtime)) return undefined;
    const itemRaw = record.item;
    if (itemRaw === null || typeof itemRaw !== "object" || Array.isArray(itemRaw)) return undefined;
    const rawItem = itemRaw as Record<string, unknown>;
    const kind = rawItem.kind;
    if (kind !== "handback" && kind !== "dispatch" && kind !== "message" && kind !== "system") return undefined;
    if (typeof rawItem.text !== "string" || rawItem.text === "") return undefined;
    if (typeof rawItem.dedupKey !== "string" || rawItem.dedupKey === "") return undefined;
    const runtime = key.runtime as RuntimeKind;
    const targetRoleId =
      key.roleId !== "" ? key.roleId : typeof rawItem.targetRoleId === "string" ? rawItem.targetRoleId : "";
    let systemAssignment: DeliveryAssignment | null = null;
    if (rawItem.systemAssignment !== undefined && rawItem.systemAssignment !== null) {
      const value = rawItem.systemAssignment;
      if (typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "taskId") || !Object.hasOwn(value, "actorRoleId") || !Object.hasOwn(value, "flowId")) return;
      const fields = value as Record<string, unknown>;
      if (typeof fields.taskId !== "string" || !fields.taskId || fields.actorRoleId !== targetRoleId || typeof fields.flowId !== "string" || !fields.flowId ||
          fields.runId !== undefined && (typeof fields.runId !== "string" || !fields.runId)) return;
      systemAssignment = { taskId: fields.taskId, actorRoleId: targetRoleId, flowId: fields.flowId, ...(typeof fields.runId === "string" ? { runId: fields.runId } : {}) };
    }
    let controllerResume: ControllerResumeDelivery | undefined;
    if (rawItem.controllerResume !== undefined) {
      const rawResume = rawItem.controllerResume;
      if (!rawResume || typeof rawResume !== "object" || Array.isArray(rawResume)) return;
      const fields = rawResume as Record<string, unknown>;
      if (Object.keys(fields).some(key => !["expected", "resumeKey", "basisDigest"].includes(key)) || !isDispatchTaskResumeController(fields.expected) ||
          typeof fields.resumeKey !== "string" || !fields.resumeKey || fields.resumeKey.length > 1000 || typeof fields.basisDigest !== "string" || !/^[a-f0-9]{64}$/i.test(fields.basisDigest) ||
          kind !== "dispatch" || targetRoleId !== "convener" || rawItem.sourceRoleId !== "chief" || rawItem.taskId !== fields.expected.taskId || rawItem.flowId !== fields.expected.flowId) return;
      controllerResume = { expected: structuredClone(fields.expected), resumeKey: fields.resumeKey, basisDigest: fields.basisDigest };
    } else if (rawItem.dedupKey.startsWith("hub-resume:")) return;
    const notificationSource = isDirectActionSource(rawItem.notificationSource) && rawItem.notificationSource.kind === "role-direct" ? rawItem.notificationSource : undefined;
    const item: DeliveryItem = {
      kind,
      runtime,
      targetRoleId,
      sourceRoleId: typeof rawItem.sourceRoleId === "string" ? rawItem.sourceRoleId : "",
      text: rawItem.text,
      summary: typeof rawItem.summary === "string" ? rawItem.summary : "",
      dedupKey: rawItem.dedupKey,
      queueEntryId: typeof rawItem.queueEntryId === "string" && /^[a-f0-9-]{36}$/i.test(rawItem.queueEntryId) ? rawItem.queueEntryId : randomUUID(),
      ...(rawItem.kind === "system" && rawItem.systemAssignment !== undefined ? { systemAssignment } : {}),
      ...(notificationSource ? { notificationSource } : {}),
      ...(controllerResume ? { controllerResume } : {}),
      enqueuedAt:
        typeof rawItem.enqueuedAt === "string" && rawItem.enqueuedAt !== ""
          ? rawItem.enqueuedAt
          : new Date(this.now()).toISOString(),
      ...(typeof rawItem.flowId === "string" && rawItem.flowId !== "" ? { flowId: rawItem.flowId } : {}),
      ...(typeof rawItem.taskId === "string" && rawItem.taskId !== "" ? { taskId: rawItem.taskId } : {}),
      ...(typeof rawItem.deliveryId === "string" ? { deliveryId: rawItem.deliveryId } : {}),
      ...(isAppTaskClientMessageId(rawItem.clientMessageId) ? { clientMessageId: rawItem.clientMessageId } : {}),
      ...(rawItem.handback !== undefined && rawItem.handback !== null && typeof rawItem.handback === "object"
        ? { handback: rawItem.handback as TaskHandback }
        : {}),
      ...(rawItem.report !== undefined && rawItem.report !== null && typeof rawItem.report === "object"
        ? { report: rawItem.report as RuntimeReportSnapshotV1 }
        : {}),
      ...(rawItem.liveReport !== undefined && rawItem.liveReport !== null && typeof rawItem.liveReport === "object"
        ? { liveReport: rawItem.liveReport as RuntimeLiveReportViewV1 }
        : {}),
      ...(rawItem.liveDurability === "memory-only" || rawItem.liveDurability === "unknown-live"
        ? { liveDurability: rawItem.liveDurability }
        : {}),
    };
    return { projectRoot: key.projectRoot, roleId: key.roleId, runtime, item };
  }

  // —— restorePersistedDeliveries（B4 自 session.ts 逐字搬移）——
  /**
   * **启动/项目导入时恢复上次运行的投递队列并自动重投**（2026-10-20 客户要求「重启后任务自动续跑」）。
   * - `queued` 与 `in-flight` 一律按 queued 重新入内存队列（崩溃时在途回合会重新开始；任务文本自足，
   *   允许模型续做/重做）；
   * - 同一 `dedupKey` 已在内存队列/在途/已投递成功 ⇒ 跳过（重启后至多重投一次）；
   * - 复用既有 `enqueueDelivery` + `drainQueue`（不新造投递逻辑）；投递成功后由既有成功路径移除持久项；
   * - 损坏/不可读的存储文件 ⇒ 只记诊断、返回 0，不阻塞启动、不猜内容。
   */
  async restorePersistedDeliveries(): Promise<DeliveryQueueRestoreReport> {
    const storePath = this.deliveryQueueStorePath;
    const report: DeliveryQueueRestoreReport = { restored: 0, skipped: 0, items: [] };
    if (storePath === undefined) return report;
    const diagnostic = createDiagnosticLogger({ component: "desktop.delivery" });
    let text: string;
    try {
      text = await fs.promises.readFile(storePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.deliveryStoreArmed = true; // 无历史文件：从现在起正常持久化
      } else {
        diagnostic.error("delivery.queue.restore.failed", error); // 读失败：本次不武装（不覆盖可能仍可读的文件）
      }
      return report;
    }
    // 已读到磁盘内容（无论是否合法）：此后允许写——坏文件会被新状态替换（不阻塞启动，不猜内容）。
    this.deliveryStoreArmed = true;
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (error) {
      diagnostic.error("delivery.queue.restore.failed", error);
      return report;
    }
    const rawItems =
      doc !== null && typeof doc === "object" && !Array.isArray(doc)
        ? (doc as Record<string, unknown>).items
        : undefined;
    if (
      doc === null ||
      typeof doc !== "object" ||
      (doc as Record<string, unknown>).version !== 1 ||
      !Array.isArray(rawItems)
    ) {
      diagnostic.record("delivery.queue.restore.invalid-shape");
      return report;
    }
    const seen = new Set<string>();
    const drainKeys = new Set<string>();
    for (const raw of rawItems as unknown[]) {
      const parsed = this.parsePersistedDeliveryItem(raw);
      if (parsed === undefined) {
        report.skipped += 1;
        continue;
      }
      const { projectRoot, roleId, runtime, item } = parsed;
      const queueKey = this.queueKey(projectRoot, roleId, runtime);
      const identity = `${queueKey}\u0000${item.dedupKey}`;
      if (seen.has(identity)) {
        report.skipped += 1;
        continue;
      }
      seen.add(identity);
      if (this.deliveredDeliveryKeys.has(identity)) {
        report.skipped += 1; // 本次运行已投递成功（防御：同 manager 重复恢复）
        continue;
      }
      if (isAppTaskClientMessageId(item.clientMessageId) && this.deliveredAppTaskIds.has(item.clientMessageId)) {
        report.skipped += 1; // 同一应用任务本次运行已 ACK/投递成功：恢复不重投（2026-10-25）
        continue;
      }
      if (this.activeDeliveries.get(queueKey)?.dedupKey === item.dedupKey) {
        report.skipped += 1;
        continue;
      }
      if ((this.deliveryQueues.get(queueKey) ?? []).some((queued) => queued.dedupKey === item.dedupKey)) {
        report.skipped += 1;
        continue;
      }
      if (item.kind === "dispatch" && this.activeDispatchKeys.has(item.dedupKey)) {
        report.skipped += 1;
        continue;
      }
      if (item.kind === "handback") this.enqueuedHandbackKeys.add(item.dedupKey);
      if (item.kind === "dispatch") this.activeDispatchKeys.add(item.dedupKey);
      if (typeof item.taskId === "string" && item.taskId !== "") {
        this.starTaskIds.add(item.taskId);
        if (taskCreators.get(item.taskId) === undefined) {
          const restored = (await this.readTasks(projectRoot)).records.get(item.taskId)?.created;
          if (restored !== undefined) this.rememberTaskCreator(item.taskId, restored);
        }
      }
      this.enqueueDelivery(projectRoot, roleId, {
        kind: item.kind,
        runtime,
        targetRoleId: item.targetRoleId,
        sourceRoleId: item.sourceRoleId,
        text: item.text,
        summary: item.summary || mainT("main.session.recoveryDelivery", { role: item.sourceRoleId }),
        dedupKey: item.dedupKey,
        ...(item.flowId !== undefined ? { flowId: item.flowId } : {}),
        ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
        ...(item.clientMessageId !== undefined ? { clientMessageId: item.clientMessageId } : {}),
        ...(item.handback !== undefined ? { handback: item.handback } : {}),
        ...(item.report !== undefined ? { report: item.report } : {}),
        ...(item.liveReport !== undefined ? { liveReport: item.liveReport } : {}),
        ...(item.liveDurability !== undefined ? { liveDurability: item.liveDurability } : {}),
        ...(item.controllerResume !== undefined ? { controllerResume: structuredClone(item.controllerResume) } : {}),
      });
      drainKeys.add(queueKey);
      report.restored += 1;
      report.items.push({ projectRoot, roleId, runtime, kind: item.kind, summary: item.summary });
    }
    diagnostic.record("delivery.queue.restored", { count: report.restored });
    // 自动重投（复用既有串行投递机；目标未开会自动开启，忙则排队——与正常运行完全同一条路径）。
    for (const queueKey of drainKeys) {
      const [projectRoot = "", roleId = "", runtimeRaw = ""] = queueKey.split("\u0000");
      void this.drainQueue(projectRoot, roleId === "" ? null : roleId, runtimeRaw as RuntimeKind);
    }
    return report;
  }

}

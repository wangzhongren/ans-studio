// src/pipeline/orchestration/stable-write-runtime.ts
// stable 文件确认即写 Pipeline 公共句柄（2026-11-04 trunk-amendment-model B-11 / S4）。
//
// 职责（P1 §2.5-28/§3.5/§4.5.1/§4.7；F5/F13/F16/F35；AC-33/AC-34/AC-35）：
// · `requestWorkflowWrite`：workflow 轻量确认卡（app-owned `stable-write`；preview 展示
//   path/base/target sha256 + diff）——卡接口由注入 presenter（D1 后续接 IPC/UI）；
// · `onAppointmentWriteApproved`：role-card/boundary 沿用 appointment-write 钩子（语义不变），
//   确认后签发一次性许可；
// · `settle`：客户批准 → S2 `stableWrite.approve`（许可 + C2b 许可快照安装；本层缓存候选
//   permit 供 `stablePermitOf` 注入 run-role 的 `stableWriteDecision`）；拒绝 → 不写；
// · `completeWrite(actualSha256)`：post-write 复核（S2）+ mini re-pin（trunk-runtime，**不升
//   trunkVersion**）+ `stable.write.written` + `trunk.state(stable-repinned)` 事件；
// · `fail`：异常 fail-closed（记录/许可作废，不可复用）；无 drift 状态。
//
// 纪律：本层**不写项目文档**（真实写入 = run-role write/edit gate 按 permit 执行，F16）；
// 账本经注入 `emitEvent`；客户本人，永不进判断器/委托/指令。

import type { TaskStateEvent } from "../../model/runtime.ts";
import type { StableWriteErrorCode, StableWritePermit, StableWriteRecord, StableWriteStatus } from "../../model/version-change.ts";
import type {
  ServiceResult,
  StableWriteService,
} from "../../service/version-change/public/version-change-service.ts";
import type { TrunkRuntime } from "./trunk-runtime.ts";

export type StableWriteCardOutcome =
  | {
      outcome: "answered";
      choice: "approve-stable-write" | "reject-stable-write";
      decisionId: string;
    }
  | { outcome: "declined" }
  | { outcome: "unavailable" };

export interface StableWritePresenter {
  presentWorkflowWrite(input: {
    requestId: string;
    record: StableWriteRecord;
    preview: { path: string; baseSha256: string; targetSha256: string; diffPreview: string };
  }): Promise<StableWriteCardOutcome>;
}

export interface StableWriteRuntimeDeps {
  stableWrite: StableWriteService;
  trunkRuntime: Pick<TrunkRuntime, "completeStableWrite">;
  emitEvent: (event: TaskStateEvent) => Promise<void>;
  presenter?: StableWritePresenter;
  notify?: (message: string) => void | Promise<void>;
  now?: () => Date;
}

export interface StableWriteRuntime {
  /** workflow 轻量卡：request → presenter（有通道时）→ 客户决定（approve → 许可）。 */
  requestWorkflowWrite(input: {
    roleId: string;
    content: string | Uint8Array;
    diffPreview?: string;
    requestId?: string;
    at?: string;
  }): Promise<
    ServiceResult<
      { record: StableWriteRecord; permit?: StableWritePermit; cardOutcome?: StableWriteCardOutcome["outcome"] },
      StableWriteErrorCode | "vca-channel-unavailable"
    >
  >;
  /** 客户决定（workflow 卡 / appointment-write 结果）：approve 发许可；reject 不写。 */
  settle(
    requestId: string,
    decision: { choice: "approve-stable-write" | "reject-stable-write"; decisionId?: string; confirmationId?: string; at?: string },
  ): Promise<ServiceResult<{ record: StableWriteRecord; permit?: StableWritePermit }, StableWriteErrorCode | "vca-channel-unavailable">>;
  /** appointment-write 确认后（role-card/boundary）：request + approve（confirmationId）。 */
  onAppointmentWriteApproved(input: {
    roleId: string;
    kind: "role-card" | "boundary";
    content: string | Uint8Array;
    confirmationId: string;
    diffPreview?: string;
    requestId?: string;
    at?: string;
  }): Promise<ServiceResult<{ record: StableWriteRecord; permit: StableWritePermit }, StableWriteErrorCode>>;
  /** post-write 复核 + 消费许可 + mini re-pin（不升 trunkVersion）+ 事件。 */
  completeWrite(input: {
    requestId: string;
    actualSha256: string;
    at?: string;
  }): Promise<
    ServiceResult<
      {
        record: StableWriteRecord;
        repinApplied: boolean;
        pendingReattach?: boolean;
        /** 已写 `trunk.state(stable-repinned)`（无 manifest 时为 false）。 */
        repinEventEmitted: boolean;
      },
      StableWriteErrorCode
    >
  >;
  fail(requestId: string, reason: string, at?: string): Promise<ServiceResult<StableWriteRecord, StableWriteErrorCode>>;
  /** 供 run-role `stablePermitOf` 注入：最近签发且未消费的候选许可（C2b 快照仍为判定权威）。 */
  stablePermitOf(relPath: string): StableWritePermit | undefined;
  list(): Promise<StableWriteRecord[]>;
}

function writeEvent(record: StableWriteRecord, at: string, extra: { permit?: StableWritePermit; decisionId?: string; confirmationId?: string } = {}): TaskStateEvent {
  const approved = record.status === "approved" || record.status === "written";
  const customer = record.status === "approved" || record.status === "rejected";
  const status: StableWriteStatus = record.status;
  return {
    v: 1,
    at,
    kind: `stable.write.${status === "requested" ? "requested" : status === "approved" ? "approved" : status === "rejected" ? "rejected" : status === "written" ? "written" : "failed"}`,
    schema: "stable-write/v1",
    requestId: record.requestId,
    roleId: record.roleId,
    path: record.path,
    stableKind: record.kind,
    baseSha256: record.baseSha256,
    targetSha256: record.targetSha256,
    status,
    origin: customer ? "customer" : "application",
    ...(customer ? { decidedBy: "customer" as const } : {}),
    ...(record.decisionId !== undefined ? { decisionId: record.decisionId } : {}),
    ...(record.confirmationId !== undefined ? { confirmationId: record.confirmationId } : {}),
    ...(record.approvedAt !== undefined ? { approvedAt: record.approvedAt } : {}),
    ...(record.expiresAt !== undefined ? { expiresAt: record.expiresAt } : {}),
    ...(record.consumedAt !== undefined ? { consumedAt: record.consumedAt } : {}),
    ...(extra.decisionId !== undefined && record.decisionId === undefined ? { decisionId: extra.decisionId } : {}),
    ...(extra.confirmationId !== undefined && record.confirmationId === undefined ? { confirmationId: extra.confirmationId } : {}),
    ...(approved && extra.permit !== undefined ? { approvedAt: extra.permit.approvedAt, expiresAt: extra.permit.expiresAt } : {}),
  } as TaskStateEvent;
}

export function createStableWriteRuntime(deps: StableWriteRuntimeDeps): StableWriteRuntime {
  const now = deps.now ?? (() => new Date());
  // 候选许可缓存：仅用于把 permit **对象**注入 `stableWriteDecision`（C2b 快照逐字段校验 +
  // 一次性/过期判定仍为唯一权威；F7 的同步快照不自建第二份）。
  const candidates = new Map<string, StableWritePermit>();

  async function emit(event: TaskStateEvent): Promise<void> {
    await deps.emitEvent(event);
  }

  async function notify(message: string): Promise<void> {
    try {
      await deps.notify?.(message);
    } catch {
      /* 通知失败不改变业务结果 */
    }
  }

  function remember(permit: StableWritePermit): void {
    candidates.set(permit.path, permit);
  }

  function forget(permit: StableWritePermit): void {
    const current = candidates.get(permit.path);
    if (current !== undefined && current.permitId === permit.permitId) candidates.delete(permit.path);
  }

  return {
    async requestWorkflowWrite(input) {
      const at = input.at ?? now().toISOString();
      const requested = await deps.stableWrite.request({
        roleId: input.roleId,
        kind: "workflow",
        content: input.content,
        ...(input.diffPreview !== undefined ? { diffPreview: input.diffPreview } : {}),
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
        at,
      });
      if (!requested.ok) return requested;
      await emit(writeEvent(requested.value, at));
      if (deps.presenter === undefined) {
        return { ok: false, code: "vca-channel-unavailable", message: "无 stable 写入确认卡通道：已记录请求，未发许可" };
      }
      const outcome = await deps.presenter.presentWorkflowWrite({
        requestId: requested.value.requestId,
        record: requested.value,
        preview: {
          path: requested.value.path,
          baseSha256: requested.value.baseSha256,
          targetSha256: requested.value.targetSha256,
          diffPreview: requested.value.diffPreview,
        },
      });
      if (outcome.outcome !== "answered") {
        return {
          ok: false,
          code: "vca-channel-unavailable",
          message: outcome.outcome === "declined" ? "客户未作答：已记录请求，未发许可" : "stable 写入确认卡通道不可用",
        };
      }
      const settled = await this.settle(requested.value.requestId, {
        choice: outcome.choice,
        decisionId: outcome.decisionId,
        at,
      });
      if (!settled.ok) return settled;
      return {
        ok: true,
        value: { record: settled.value.record, ...(settled.value.permit !== undefined ? { permit: settled.value.permit } : {}), cardOutcome: outcome.outcome },
      };
    },

    async settle(requestId, decision) {
      const at = decision.at ?? now().toISOString();
      if (decision.choice === "reject-stable-write") {
        const rejected = await deps.stableWrite.reject(requestId, {
          ...(decision.decisionId !== undefined ? { decisionId: decision.decisionId } : {}),
          ...(decision.confirmationId !== undefined ? { confirmationId: decision.confirmationId } : {}),
          at,
        });
        if (!rejected.ok) return rejected;
        await emit(writeEvent(rejected.value, at));
        await notify(`stable.write ${requestId}（${rejected.value.path}）→ rejected：未写入`);
        return { ok: true, value: { record: rejected.value } };
      }
      const approved = await deps.stableWrite.approve(requestId, {
        ...(decision.decisionId !== undefined ? { decisionId: decision.decisionId } : {}),
        ...(decision.confirmationId !== undefined ? { confirmationId: decision.confirmationId } : {}),
        at,
      });
      if (!approved.ok) return approved;
      remember(approved.value.permit);
      await emit(writeEvent(approved.value.record, at, { permit: approved.value.permit }));
      await notify(`stable.write ${requestId}（${approved.value.record.path}）→ approved：一次性许可已签发（TTL 30 分钟）`);
      return { ok: true, value: { record: approved.value.record, permit: approved.value.permit } };
    },

    async onAppointmentWriteApproved(input) {
      const at = input.at ?? now().toISOString();
      const requested = await deps.stableWrite.request({
        roleId: input.roleId,
        kind: input.kind,
        content: input.content,
        ...(input.diffPreview !== undefined ? { diffPreview: input.diffPreview } : {}),
        ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
        at,
      });
      if (!requested.ok) return requested;
      await emit(writeEvent(requested.value, at));
      const approved = await deps.stableWrite.approve(requested.value.requestId, {
        confirmationId: input.confirmationId,
        at,
      });
      if (!approved.ok) return approved;
      remember(approved.value.permit);
      await emit(writeEvent(approved.value.record, at, { permit: approved.value.permit }));
      await notify(`stable.write ${approved.value.record.requestId}（${approved.value.record.path}）→ approved（appointment-write）`);
      return { ok: true, value: { record: approved.value.record, permit: approved.value.permit } };
    },

    async completeWrite(input) {
      const at = input.at ?? now().toISOString();
      const completed = await deps.stableWrite.completeWrite({
        requestId: input.requestId,
        actualSha256: input.actualSha256,
        at,
      });
      if (!completed.ok) {
        const failed = await deps.stableWrite.list();
        const record = failed.find((candidate) => candidate.requestId === input.requestId);
        if (record !== undefined) await emit(writeEvent(record, at));
        // 许可作废：清掉候选缓存（S2 已把许可置 failed/expired）。
        for (const [relPath, permit] of candidates) {
          if (permit.requestId === input.requestId) candidates.delete(relPath);
        }
        return completed;
      }
      const { record, permit, repin } = completed.value;
      forget(permit);
      await emit(writeEvent(record, at, { permit }));
      const repinApplied = repin.applied && repin.audit !== undefined;
      if (repinApplied) {
        const audit = repin.audit!;
        await emit({
          v: 1,
          at: audit.at,
          kind: "trunk.state",
          op: "stable-repinned",
          trunkVersion: audit.trunkVersion,
          path: audit.path,
          oldSha: audit.oldSha,
          newSha: audit.newSha,
          origin: "customer",
          decidedBy: "customer",
          ...(audit.confirmationId !== undefined ? { confirmationId: audit.confirmationId } : {}),
          ...(audit.decisionId !== undefined ? { decisionId: audit.decisionId } : {}),
        } as TaskStateEvent);
      }
      await notify(
        `stable.write ${record.requestId}（${record.path}）→ written${repinApplied ? "，已 mini re-pin（trunkVersion 不变）" : "，待续接（无 trunk manifest）"}`,
      );
      return {
        ok: true,
        value: {
          record,
          repinApplied,
          ...(repin.pendingReattach === true ? { pendingReattach: true } : {}),
          repinEventEmitted: repinApplied,
        },
      };
    },

    async fail(requestId, reason, at) {
      const failed = await deps.stableWrite.fail(requestId, reason, at ?? now().toISOString());
      if (!failed.ok) return failed;
      for (const [relPath, permit] of candidates) {
        if (permit.requestId === requestId) candidates.delete(relPath);
      }
      await emit(writeEvent(failed.value, at ?? now().toISOString()));
      return failed;
    },

    stablePermitOf(relPath) {
      return candidates.get(relPath);
    },

    list() {
      return deps.stableWrite.list();
    },
  };
}

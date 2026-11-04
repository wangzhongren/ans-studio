// src/service/version-change/impl/stable-write-service.ts
// stable-write Service（stable-write/v1）：确认 / 一次性许可 / mini re-pin / 异常恢复
// （2026-11-04 C2c 契约冻结）。
//
// 依据 P1.6 §4.5.1/§5.2.1、PM 复审 F5/F13/F16、AC-33/AC-34/AC-35：
// · 范围：`docs/workflow.md`、`角色卡/<id>/role-card.md`、`角色卡/<id>/boundary.yaml`；
//   workflow 走轻量 `stable-write` 确认卡，role-card/boundary 沿用 appointment-write（语义不变）；
// · 确认即写：request（计算 base/target sha + diff）→ approve（一次性许可，`approvedAt`/
//   `expiresAt` 必填，TTL=C1 `STABLE_WRITE_PERMIT_TTL_MS`）/reject；
// · **pre-write 判定归 C2b** `stableWriteDecision`（纯函数）；**post-write 复核归本服务**
//   `completeWrite(actualSha)`：`actual === targetSha256` 才消费许可并 mini re-pin；
//   不符/过期/异常 ⇒ 记录+许可 failed（**不可复用**），fail-closed + 恢复，不更新快照、无 drift；
// · mini re-pin：更新 trunk manifest 该 stable 文件哈希（绑定 decisionId/confirmationId、
//   `trunk.state(op:"stable-repinned")`、origin/decidedBy customer），**不升 trunkVersion**；
//   无 trunk manifest ⇒ `applied:false`（只记待续接，不写事件）；
// · 真实写盘执行点 = 编排 S3 `run-role.gate`（pre-write 许可）+ B-11 `completeWrite`；
//   桌面窗口只发行 writeSet/呈现确认卡，无直接写盘路径（F16）；本 Service 不写盘。
// 事件由 Pipeline（S4）写；本 Service 不触达账本，`PermitFact` = C1 `StableWritePermit` 别名（F13）。

import {
  STABLE_WRITE_PERMIT_TTL_MS,
  STABLE_WRITE_SCHEMA,
  type StableWriteAuthority,
  type StableWritePermit,
  type StableWriteRecord,
} from "../../../model/version-change.ts";
import { TRUNK_STABLE_FILE_KINDS } from "../../../model/trunk.ts";
import type {
  PermitFact,
  ProjectHashPort,
  ServiceResult,
  StablePermitPort,
  StableRepinOutcome,
  StableWriteApproveResult,
  StableWriteCompleteInput,
  StableWriteCompleteResult,
  StableWriteDecision,
  StableWriteRepositoryPort,
  StableWriteRequestInput,
  StableWriteService,
  TrunkStableSnapshotPort,
} from "../abstract/version-change-service.ts";
import { normalizeServiceRelPath } from "./targets-items.ts";

// 项目角色 id 可为中文（如「编排」「桌面窗口」）；只拒绝空白/路径分隔符与 `.`/`..`。
const ROLE_ID_RE = /^(?!\.{1,2}$)[^\s/\\]{1,64}$/;

type StableFailureCode =
  | "stable-write-invalid"
  | "stable-write-permit-missing"
  | "stable-write-permit-invalid"
  | "stable-write-permit-expired"
  | "stable-write-permit-consumed"
  | "stable-write-path-mismatch"
  | "stable-write-hash-mismatch"
  | "stable-write-confirmation-missing"
  | "stable-write-write-failed";

function fail<C extends StableFailureCode>(code: C, message?: string): ServiceResult<never, C> {
  return { ok: false, code, message };
}

/**
 * kind → stable 文件路径（唯一路径映射；写入不得自报任意路径）。
 * workflow = `docs/workflow.md`；role-card/boundary = `角色卡/<roleId>/...`。
 */
export function stableWritePathOf(
  kind: string,
  roleId: string,
): ServiceResult<{ path: string; kind: "workflow" | "role-card" | "boundary" }, "stable-write-invalid"> {
  if (!(TRUNK_STABLE_FILE_KINDS as readonly string[]).includes(kind)) {
    return fail("stable-write-invalid", `未知 stable 文件 kind：${String(kind)}`);
  }
  if (kind === "workflow") {
    if (roleId.trim() === "") return fail("stable-write-invalid", "workflow 写入必须带发起角色 id");
    return { ok: true, value: { path: "docs/workflow.md", kind: "workflow" } };
  }
  if (roleId.trim() === "" || !ROLE_ID_RE.test(roleId)) {
    return fail("stable-write-invalid", `roleId 非法：${String(roleId)}`);
  }
  const path = kind === "role-card" ? `角色卡/${roleId}/role-card.md` : `角色卡/${roleId}/boundary.yaml`;
  return { ok: true, value: { path, kind: kind as "role-card" | "boundary" } };
}

function authorityOf(decision: StableWriteDecision): ServiceResult<StableWriteAuthority, "stable-write-confirmation-missing"> {
  const decisionId = decision.decisionId?.trim();
  const confirmationId = decision.confirmationId?.trim();
  if ((decisionId === undefined || decisionId === "") && (confirmationId === undefined || confirmationId === "")) {
    return fail("stable-write-confirmation-missing", "stable 写入必须带客户确认 decisionId/confirmationId");
  }
  if (decisionId !== undefined && decisionId !== "") {
    return {
      ok: true,
      value: { decisionId, ...(confirmationId !== undefined && confirmationId !== "" ? { confirmationId } : {}) },
    };
  }
  return { ok: true, value: { confirmationId: confirmationId as string } };
}

export interface StableWriteServiceDeps {
  records: StableWriteRepositoryPort;
  permits: StablePermitPort;
  hashes: ProjectHashPort;
  trunk: TrunkStableSnapshotPort;
  now?: () => Date;
  allocateRequestId?: () => string;
  allocatePermitId?: () => string;
}

export function buildStableWriteService(deps: StableWriteServiceDeps): StableWriteService {
  const { records, permits, hashes, trunk } = deps;
  const nowIso = (): string => (deps.now !== undefined ? deps.now() : new Date()).toISOString();

  function isExpired(permit: StableWritePermit, at: string): boolean {
    return Date.parse(at) >= Date.parse(permit.expiresAt);
  }

  async function snapshotAll(): Promise<void> {
    try {
      const all = await permits.list();
      await permits.installSnapshot(all);
    } catch {
      /* 快照刷新失败 ⇒ C2b 判定 fail-closed；许可记录本身已落库 */
    }
  }

  async function nextRequestId(): Promise<string> {
    if (deps.allocateRequestId !== undefined) return deps.allocateRequestId();
    const all = await records.list();
    let max = 0;
    for (const record of all) {
      const match = /^sw-(\d+)$/.exec(record.requestId);
      if (match !== null) max = Math.max(max, Number(match[1]));
    }
    return `sw-${max + 1}`;
  }

  async function nextPermitId(): Promise<string> {
    if (deps.allocatePermitId !== undefined) return deps.allocatePermitId();
    const all = await permits.list();
    let max = 0;
    for (const permit of all) {
      const match = /^swp-(\d+)$/.exec(permit.permitId);
      if (match !== null) max = Math.max(max, Number(match[1]));
    }
    return `swp-${max + 1}`;
  }

  return {
    async request(input: StableWriteRequestInput) {
      const target = stableWritePathOf(input.kind, input.roleId);
      if (!target.ok) return target;
      if (input.content === undefined || input.content === null) {
        return fail("stable-write-invalid", "缺少预览内容（targetSha256 由应用计算）");
      }
      const baseSha256 = (await hashes.sha256File(target.value.path)) ?? "";
      const targetSha256 = hashes.sha256Content(input.content);
      const existing = await records.list();
      const reusable = existing.find(
        (record) =>
          record.path === target.value.path &&
          record.targetSha256 === targetSha256 &&
          record.status !== "rejected" &&
          record.status !== "failed",
      );
      if (reusable !== undefined) return { ok: true, value: reusable };

      const requestId = input.requestId ?? (await nextRequestId());
      if (existing.some((record) => record.requestId === requestId)) {
        return fail("stable-write-invalid", `stable-write requestId 已存在：${requestId}`);
      }
      const record: StableWriteRecord = {
        v: 1,
        schema: STABLE_WRITE_SCHEMA,
        requestId,
        roleId: input.roleId,
        path: target.value.path,
        kind: target.value.kind,
        baseSha256,
        targetSha256,
        diffPreview: input.diffPreview ?? "",
        status: "requested",
        at: input.at,
      };
      const inserted = await records.insert(record);
      if (!inserted.ok) return fail("stable-write-write-failed", inserted.message ?? "stable-write 记录写入失败");
      return { ok: true, value: record };
    },

    async approve(requestId: string, decision: StableWriteDecision) {
      const current = await records.findById(requestId);
      if (current === undefined) return fail("stable-write-invalid", `stable-write 请求不存在：${requestId}`);
      if (current.status === "approved") {
        const all = await permits.list();
        const permit = all.find((entry) => entry.permitId === current.permitId);
        if (permit !== undefined) return { ok: true, value: { record: current, permit } };
        return fail("stable-write-permit-missing", "已批准记录缺少一次性许可（fail-closed）");
      }
      if (current.status !== "requested") {
        return fail("stable-write-invalid", `stable-write 状态 ${current.status} 不能批准`);
      }
      const authority = authorityOf(decision);
      if (!authority.ok) return authority;
      const approvedAt = decision.at;
      const expiresAtMs = Date.parse(approvedAt);
      if (Number.isNaN(expiresAtMs)) return fail("stable-write-invalid", `批准的 at 非法：${approvedAt}`);
      const permitId = await nextPermitId();
      const permit: StableWritePermit = {
        v: 1,
        schema: STABLE_WRITE_SCHEMA,
        permitId,
        requestId: current.requestId,
        roleId: current.roleId,
        path: current.path,
        kind: current.kind,
        authority: authority.value,
        baseSha256: current.baseSha256,
        targetSha256: current.targetSha256,
        status: "approved",
        approvedAt,
        expiresAt: new Date(expiresAtMs + STABLE_WRITE_PERMIT_TTL_MS).toISOString(),
        issuedAt: approvedAt,
      };
      const upserted = await permits.upsert(permit);
      if (!upserted.ok) return fail("stable-write-write-failed", upserted.message ?? "许可写入失败");
      const approved: StableWriteRecord = {
        ...current,
        status: "approved",
        permitId,
        ...(authority.value.decisionId !== undefined ? { decisionId: authority.value.decisionId } : {}),
        ...(authority.value.confirmationId !== undefined ? { confirmationId: authority.value.confirmationId } : {}),
        approvedAt,
        expiresAt: permit.expiresAt,
      };
      const updated = await records.updateWithExpectedStatus(approved, "requested");
      if (!updated.ok) {
        await permits.upsert({ ...permit, status: "failed" });
        await snapshotAll();
        return fail("stable-write-write-failed", updated.message ?? "stable-write 记录更新失败");
      }
      await snapshotAll();
      const result: StableWriteApproveResult = { record: approved, permit };
      return { ok: true, value: result };
    },

    async reject(requestId: string, decision: StableWriteDecision) {
      const current = await records.findById(requestId);
      if (current === undefined) return fail("stable-write-invalid", `stable-write 请求不存在：${requestId}`);
      if (current.status === "rejected") return { ok: true, value: current };
      if (current.status !== "requested") {
        return fail("stable-write-invalid", `stable-write 状态 ${current.status} 不能拒绝`);
      }
      const authority = authorityOf(decision);
      if (!authority.ok) return authority;
      const rejected: StableWriteRecord = {
        ...current,
        status: "rejected",
        ...(authority.value.decisionId !== undefined ? { decisionId: authority.value.decisionId } : {}),
        ...(authority.value.confirmationId !== undefined ? { confirmationId: authority.value.confirmationId } : {}),
      };
      const updated = await records.updateWithExpectedStatus(rejected, "requested");
      if (!updated.ok) return fail("stable-write-write-failed", updated.message ?? "stable-write 记录更新失败");
      return { ok: true, value: rejected };
    },

    async completeWrite(input: StableWriteCompleteInput) {
      const current = await records.findById(input.requestId);
      if (current === undefined) return fail("stable-write-invalid", `stable-write 请求不存在：${input.requestId}`);
      if (current.status === "written") {
        return fail("stable-write-permit-consumed", "许可已消费：重复 completeWrite 被拒绝（一次性）");
      }
      if (current.status !== "approved") {
        return fail("stable-write-invalid", `stable-write 状态 ${current.status} 不能完成写入`);
      }
      const all = await permits.list();
      const permit = all.find((entry) => entry.permitId === current.permitId);
      if (permit === undefined) return fail("stable-write-permit-missing", "缺少一次性许可（fail-closed）");
      if (
        permit.path !== current.path ||
        permit.kind !== current.kind ||
        permit.roleId !== current.roleId ||
        permit.targetSha256 !== current.targetSha256 ||
        permit.baseSha256 !== current.baseSha256
      ) {
        return fail("stable-write-path-mismatch", "许可与记录不匹配（路径/哈希/角色）");
      }
      if (permit.status === "consumed") return fail("stable-write-permit-consumed", "许可已消费");
      if (permit.status === "failed") return fail("stable-write-permit-invalid", "许可已作废（失败不可复用）");
      const at = input.at ?? nowIso();
      if (permit.status === "expired" || isExpired(permit, at)) {
        await records.updateWithExpectedStatus({ ...current, status: "failed" }, "approved");
        await permits.upsert({ ...permit, status: "expired" });
        await snapshotAll();
        return fail("stable-write-permit-expired", "许可已过期（拒绝且不自动补发）");
      }

      // post-write 复核（F16）：实际字节必须等于批准内容；不符 ⇒ fail-closed + 许可作废。
      if (input.actualSha256 !== permit.targetSha256) {
        const failedRecord: StableWriteRecord = { ...current, status: "failed" };
        await records.updateWithExpectedStatus(failedRecord, "approved");
        await permits.upsert({ ...permit, status: "failed" });
        await snapshotAll();
        return fail(
          "stable-write-hash-mismatch",
          `写入哈希与批准内容不符（actual=${input.actualSha256} target=${permit.targetSha256}）；许可已作废`,
        );
      }

      const written: StableWriteRecord = {
        ...current,
        status: "written",
        writtenAt: at,
        consumedAt: at,
      };
      const updated = await records.updateWithExpectedStatus(written, "approved");
      if (!updated.ok) return fail("stable-write-write-failed", updated.message ?? "stable-write 记录更新失败");
      const consumed: StableWritePermit = { ...permit, status: "consumed", consumedAt: at };
      const upserted = await permits.upsert(consumed);
      if (!upserted.ok) {
        await records.updateWithExpectedStatus({ ...written, status: "failed" }, "written");
        await snapshotAll();
        return fail("stable-write-write-failed", upserted.message ?? "许可消费写入失败");
      }
      await snapshotAll();

      let repin: StableRepinOutcome;
      try {
        repin = await trunk.applyStableSnapshot({
          kind: written.kind,
          roleId: written.roleId,
          path: written.path,
          oldSha: written.baseSha256,
          newSha: written.targetSha256,
          ...(written.confirmationId !== undefined ? { confirmationId: written.confirmationId } : {}),
          ...(written.decisionId !== undefined ? { decisionId: written.decisionId } : {}),
          at,
        });
      } catch {
        // 写入已成事实；mini re-pin 失败 ⇒ 不更新快照，进恢复（记录 written 供续接补做）。
        repin = { applied: false, pendingReattach: true };
      }
      const result: StableWriteCompleteResult = { record: written, permit: consumed, repin };
      return { ok: true, value: result };
    },

    async fail(requestId: string, reason: string, at?: string) {
      const current = await records.findById(requestId);
      if (current === undefined) return fail("stable-write-invalid", `stable-write 请求不存在：${requestId}`);
      if (current.status === "failed") return { ok: true, value: current };
      if (current.status === "written") {
        return fail("stable-write-invalid", "已写入记录不能标记失败；异常写入走恢复，不产生 drift");
      }
      const failed: StableWriteRecord = { ...current, status: "failed", ...(reason !== "" ? { at: at ?? current.at } : {}) };
      const updated = await records.updateWithExpectedStatus(failed, current.status);
      if (!updated.ok) return fail("stable-write-write-failed", updated.message ?? "stable-write 记录更新失败");
      if (current.permitId !== undefined) {
        const all = await permits.list();
        const permit = all.find((entry) => entry.permitId === current.permitId);
        if (permit !== undefined && permit.status === "approved") {
          await permits.upsert({ ...permit, status: "failed" });
          await snapshotAll();
        }
      }
      return { ok: true, value: failed };
    },

    async findPermit(path: string): Promise<PermitFact | undefined> {
      const rel = normalizeServiceRelPath(path);
      if (rel === undefined) return undefined;
      const at = nowIso();
      const all = await permits.list();
      return all.find(
        (permit) => permit.path === rel && permit.status === "approved" && !isExpired(permit, at),
      );
    },

    async list() {
      return records.list();
    },
  };
}

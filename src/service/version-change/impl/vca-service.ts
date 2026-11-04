// src/service/version-change/impl/vca-service.ts
// VCA（version-change/v1）状态机与校验（2026-11-04 C2c 契约冻结）。
//
// 依据 P1.6 §4.4/§4.7/§5.1、F30/F36/F38/F39/F42、AC-3/AC-4/AC-5/AC-6/AC-14/AC-19/AC-25/
// AC-26/AC-28/AC-29：
// · create → submit → approve/reject → apply（见 `VERSION_CHANGE_TRANSITIONS`）；
// · 发起角色唯一：version-upgrade 仅 product、detail-amendment 仅 rapporteur（其他角色/客户拒绝）；
// · 目标：upgrade 只 contract/roster；detail 可 contract/roster/execution；workflow/boundary
//   走 stable 确认即写（`vca-boundary-forbidden`）、product-intent 走闸门 0/1（`vca-target-invalid`）；
//   每个 target 必须在**作者角色**写区（发起者不因提交获得写权）；版本化文档必须为新版本；
// · baseTrunk：有 trunk 必须匹配（trunkVersion+digest）；无 trunk 允许 `null`+`bootstrap:true`
//   （bootstrap 只成功一次 → trunkVersion=1）；
// · 并发：同一 flow 同时仅一个 submitted/approved；幂等：applicationId 唯一、重复创建/提交
//   同一目标返回现有申请；
// · 哈希：应用在提交时计算 `toSha256` 并定格 `applicationSha256`；批准前与 apply 前重算比对
//   （漂移 ⇒ `vca-hash-drift`，不冻结/不 re-pin — F38/AC-26）；detail 修正案提交即冻结
//   （`amendment-submitted`，application 归属）；upgrade 批准冻结全部目标（customer），
//   detail 批准后仍走 P1.3 逐项确认，apply 只冻结 applied 项（`detail-item-applied`）。
// 事件由 Pipeline（S4）写；本 Service 不改 trunk 指针、不写账本/存储。

import { GOVERNANCE_SLUG_PATTERN } from "../../../model/runtime.ts";
import {
  AMENDMENT_ID_PATTERN,
  DETAIL_AMENDMENT_TARGET_KINDS,
  VCA_FORBIDDEN_TARGET_KINDS,
  VERSION_CHANGE_ID_PATTERN,
  VERSION_CHANGE_INITIATOR_BY_KIND,
  VERSION_CHANGE_KINDS,
  VERSION_CHANGE_SCHEMA,
  VERSION_CHANGE_SUMMARY_MAX,
  VERSION_UPGRADE_TARGET_KINDS,
  type VersionChangeErrorCode,
  type VersionChangeKind,
  type VersionChangeRecord,
  type VersionChangeTarget,
  type VersionChangeTargetKind,
} from "../../../model/version-change.ts";
import type { TrunkAmendmentItem } from "../../../model/trunk.ts";
import type {
  DocFreezeRecordInput,
  FreezeService,
  ProjectHashPort,
  ServiceResult,
  TrunkBaselinePort,
  VersionChangeApplyInput,
  VersionChangeApproveInput,
  VersionChangeCreateInput,
  VersionChangeMutation,
  VersionChangeRepositoryPort,
  VersionChangeRejectInput,
  VersionChangeService,
  VersionChangeSubmitInput,
} from "../abstract/version-change-service.ts";
import { canTransitionVersionChange } from "../abstract/version-change-service.ts";
import {
  docVersionOf,
  findHashDrift,
  matchTargetsToItems,
  normalizeServiceRelPath,
  pathFamilyOf,
  targetPathInAuthorArea,
} from "./targets-items.ts";
import type { FreezeFailureCode } from "./freeze-service.ts";

const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const APPLICATION_ID_RE = new RegExp(VERSION_CHANGE_ID_PATTERN);
const AMENDMENT_ID_RE = new RegExp(AMENDMENT_ID_PATTERN);
const AMENDMENT_DOC_RE = /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-amendment-v[1-9]\d*\.md$/i;

function fail(code: VersionChangeErrorCode, message?: string): ServiceResult<never, VersionChangeErrorCode> {
  return { ok: false, code, message };
}

/** 冻结失败 → VCA 错误码（冻结注册表不可用/损坏/写失败均使申请无法安全推进）。 */
function mapFreezeFailure(code: FreezeFailureCode): VersionChangeErrorCode {
  switch (code) {
    case "doc-freeze-registry-corrupt":
    case "doc-freeze-registry-unavailable":
    case "doc-freeze-write-failed":
    case "doc-freeze-application-id-missing":
      return "vca-apply-failed";
    default:
      return "vca-invalid";
  }
}

function targetKey(targets: readonly Pick<VersionChangeTarget, "kind" | "path" | "action">[]): string {
  return targets
    .map((target) => `${target.kind}:${target.path}:${target.action}`)
    .sort()
    .join("|");
}

function sameApplicationShape(
  record: VersionChangeRecord,
  input: Pick<VersionChangeCreateInput, "kind" | "flowId" | "amendmentId">,
  key: string,
): boolean {
  return (
    record.kind === input.kind &&
    record.flowId === input.flowId &&
    (record.amendmentId ?? undefined) === (input.amendmentId ?? undefined) &&
    targetKey(record.targets) === key
  );
}

export interface VcaServiceDeps {
  repository: VersionChangeRepositoryPort;
  freeze: FreezeService;
  hashes: ProjectHashPort;
  trunk: TrunkBaselinePort;
  allocateApplicationId?: () => string;
}

export function buildVcaService(deps: VcaServiceDeps): VersionChangeService {
  const { repository, freeze, hashes, trunk } = deps;

  async function nextApplicationId(): Promise<string> {
    if (deps.allocateApplicationId !== undefined) return deps.allocateApplicationId();
    const records = await repository.list();
    let max = 0;
    for (const record of records) {
      const match = /^vc-(\d+)$/.exec(record.applicationId);
      if (match !== null) max = Math.max(max, Number(match[1]));
    }
    return `vc-${max + 1}`;
  }

  async function buildValidatedTargets(
    input: VersionChangeCreateInput,
    kind: VersionChangeKind,
  ): Promise<ServiceResult<VersionChangeTarget[], VersionChangeErrorCode>> {
    if (!Array.isArray(input.targets) || input.targets.length === 0) {
      return fail("vca-invalid", "VCA 至少需要一个 target");
    }
    const allowedTargetKinds: readonly string[] =
      kind === "version-upgrade" ? VERSION_UPGRADE_TARGET_KINDS : DETAIL_AMENDMENT_TARGET_KINDS;
    const targets: VersionChangeTarget[] = [];
    const seen = new Set<string>();
    for (const draft of input.targets) {
      const rel = normalizeServiceRelPath(draft.path);
      if (rel === undefined) return fail("vca-target-invalid", `target 路径非法：${String(draft.path)}`);
      if (seen.has(rel)) return fail("vca-target-invalid", `target 路径重复：${rel}`);
      seen.add(rel);
      if ((VCA_FORBIDDEN_TARGET_KINDS as readonly string[]).includes(draft.kind)) {
        if (draft.kind === "workflow" || draft.kind === "boundary") {
          return fail(
            "vca-boundary-forbidden",
            `target kind=${draft.kind} 不在 VCA（stable 文件走确认即写 + mini re-pin）`,
          );
        }
        return fail("vca-target-invalid", `target kind=${draft.kind} 不在 VCA（意图变化走需求变更/闸门 0/1）`);
      }
      if (!allowedTargetKinds.includes(draft.kind)) {
        return fail(
          "vca-target-invalid",
          `${kind} 不允许 target kind=${draft.kind}（允许：${allowedTargetKinds.join("/")}）`,
        );
      }
      const targetKind = draft.kind as VersionChangeTargetKind;
      if (draft.action !== "add" && draft.action !== "modify") {
        return fail("vca-target-invalid", `target action 非法：${String(draft.action)}`);
      }
      if (!targetPathInAuthorArea(targetKind, rel)) {
        return fail("vca-target-invalid", `target ${rel} 不在作者角色写区（${targetKind}；发起者不因提交获得写权）`);
      }
      const version = docVersionOf(rel);
      if (targetKind !== "execution" && version === undefined) {
        return fail("vca-target-invalid", `版本化 target 必须是 -vN 版本化文档：${rel}`);
      }
      if (version !== undefined && trunk.latestFrozenVersion !== undefined) {
        const family = pathFamilyOf(rel);
        if (family !== undefined) {
          const latest = await trunk.latestFrozenVersion(family);
          if (latest !== undefined && version <= latest) {
            return fail("vca-target-invalid", `target ${rel} 不是新版本（已冻结最新 v${latest}）`);
          }
        }
      }
      const sha = await hashes.sha256File(rel);
      if (sha === undefined) return fail("vca-target-invalid", `target 文件不存在：${rel}`);
      targets.push({
        kind: targetKind,
        path: rel,
        action: draft.action,
        ...(draft.from !== undefined ? { from: draft.from } : {}),
        toSha256: sha,
        ...(draft.roleId !== undefined ? { roleId: draft.roleId } : {}),
      });
    }
    return { ok: true, value: targets };
  }

  async function validateBaseTrunk(
    input: VersionChangeCreateInput,
  ): Promise<ServiceResult<null, VersionChangeErrorCode>> {
    const bootstrap = input.bootstrap === true;
    if (input.baseTrunk === null) {
      if (!bootstrap) {
        return fail("vca-base-mismatch", "baseTrunk:null 仅允许 bootstrap 模式（bootstrap:true）");
      }
    } else if (bootstrap) {
      return fail("vca-invalid", "bootstrap:true 时 baseTrunk 必须为 null");
    }
    const current = await trunk.current();
    if (input.baseTrunk === null) {
      if (current !== null) return fail("vca-base-mismatch", "已存在 trunk，不允许 bootstrap VCA");
      return { ok: true, value: null };
    }
    if (current === null) {
      return fail("vca-base-mismatch", "无 trunk：baseTrunk 必须为 null + bootstrap:true（F30）");
    }
    if (
      current.trunkVersion !== input.baseTrunk.trunkVersion ||
      current.digest !== input.baseTrunk.digest
    ) {
      return fail("vca-base-mismatch", "baseTrunk 与当前主干不一致（主干预期变化，请重新提交）");
    }
    return { ok: true, value: null };
  }

  function validateAmendmentRefs(
    input: VersionChangeCreateInput,
    kind: VersionChangeKind,
    targets: VersionChangeTarget[],
    items: TrunkAmendmentItem[] | undefined,
  ): ServiceResult<null, VersionChangeErrorCode> {
    if (kind === "version-upgrade") {
      if (input.amendmentId !== undefined || input.amendmentDocPath !== undefined || items !== undefined) {
        return fail("vca-invalid", "version-upgrade 不得引用修正案/items");
      }
      return { ok: true, value: null };
    }
    if (input.amendmentId === undefined || !AMENDMENT_ID_RE.test(input.amendmentId)) {
      return fail("vca-invalid", `detail-amendment 必须带 amendmentId（am-<n>）`);
    }
    const docPath = input.amendmentDocPath === undefined ? undefined : normalizeServiceRelPath(input.amendmentDocPath);
    if (docPath === undefined || !AMENDMENT_DOC_RE.test(docPath)) {
      return fail("vca-invalid", `detail-amendment 必须带合规修正案文档路径（docs/proposals/<flowId>-amendment-vN.md）`);
    }
    if (!docPath.startsWith(`docs/proposals/${input.flowId}-amendment-v`)) {
      return fail("vca-invalid", `修正案文档路径必须与 flowId 一致：${docPath}`);
    }
    if (items !== undefined) {
      const checked = matchTargetsToItems({ targets, items });
      if (!checked.ok) return fail(checked.code, checked.message);
    }
    return { ok: true, value: null };
  }

  return {
    async create(input) {
      if (!(VERSION_CHANGE_KINDS as readonly string[]).includes(input.kind)) {
        return fail("vca-invalid", `未知 VCA kind：${String(input.kind)}`);
      }
      const kind = input.kind;
      const expectedRole = VERSION_CHANGE_INITIATOR_BY_KIND[kind];
      if (input.initiatorRoleId !== expectedRole) {
        return fail(
          "vca-role-not-allowed",
          `${kind} 只能由 ${expectedRole} 发起（实际：${String(input.initiatorRoleId)}）；客户/幕僚不能发起`,
        );
      }
      if (!FLOW_ID_RE.test(input.flowId)) return fail("vca-invalid", `flowId 非法：${String(input.flowId)}`);
      const summary = typeof input.summary === "string" ? input.summary.trim() : "";
      if (summary === "" || summary.length > VERSION_CHANGE_SUMMARY_MAX) {
        return fail("vca-invalid", `summary 必须为 1..${VERSION_CHANGE_SUMMARY_MAX} 字符`);
      }
      if (input.applicationId !== undefined && !APPLICATION_ID_RE.test(input.applicationId)) {
        return fail("vca-invalid", `applicationId 非法：${input.applicationId}`);
      }

      const base = await validateBaseTrunk(input);
      if (!base.ok) return base;

      const built = await buildValidatedTargets(input, kind);
      if (!built.ok) return built;
      const targets = built.value;

      const amendment = validateAmendmentRefs(input, kind, targets, input.amendmentItems);
      if (!amendment.ok) return amendment;
      const amendmentDocPath =
        input.amendmentDocPath === undefined ? undefined : normalizeServiceRelPath(input.amendmentDocPath);
      if (amendmentDocPath !== undefined && (await hashes.sha256File(amendmentDocPath)) === undefined) {
        return fail("vca-invalid", `修正案文档不存在：${amendmentDocPath}`);
      }

      // 幂等：applicationId 唯一；重复创建同一目标返回现有申请。
      const existing = await repository.list();
      const key = targetKey(targets);
      if (input.applicationId !== undefined) {
        const sameId = existing.find((record) => record.applicationId === input.applicationId);
        if (sameId !== undefined) {
          if (sameApplicationShape(sameId, input, key)) return { ok: true, value: sameId };
          return fail("vca-conflict", `applicationId ${input.applicationId} 已存在且内容不同`);
        }
      }
      const sameTargets = existing.find(
        (record) =>
          record.status !== "superseded" &&
          sameApplicationShape(record, input, key),
      );
      if (sameTargets !== undefined) return { ok: true, value: sameTargets };

      const applicationId =
        input.applicationId !== undefined ? input.applicationId : await nextApplicationId();
      if (existing.some((record) => record.applicationId === applicationId)) {
        return fail("vca-conflict", `applicationId ${applicationId} 已存在`);
      }

      const record: VersionChangeRecord = {
        v: 1,
        schema: VERSION_CHANGE_SCHEMA,
        applicationId,
        kind,
        initiatorRoleId: expectedRole,
        flowId: input.flowId,
        baseTrunk: input.baseTrunk,
        bootstrap: input.bootstrap === true,
        targets,
        ...(input.amendmentId !== undefined ? { amendmentId: input.amendmentId } : {}),
        ...(amendmentDocPath !== undefined ? { amendmentDocPath } : {}),
        summary,
        status: "draft",
        at: input.at,
        updatedAt: input.at,
      };
      const inserted = await repository.insert(record);
      if (!inserted.ok) {
        if (inserted.code === "conflict") return fail("vca-conflict", inserted.message ?? "VCA 已存在");
        return fail("vca-invalid", inserted.message ?? "VCA 记录写入失败");
      }
      return { ok: true, value: record };
    },

    async submit(input) {
      const current = await repository.findById(input.applicationId);
      if (current === undefined) return fail("vca-invalid", `VCA 不存在：${input.applicationId}`);
      if (current.status === "submitted") {
        return { ok: true, value: { record: current, freezes: [] } };
      }
      if (!canTransitionVersionChange(current.status, "submitted")) {
        return fail(
          current.status === "rejected" ? "vca-rejected" : "vca-conflict",
          `VCA 状态 ${current.status} 不能提交（需新申请/新版本）`,
        );
      }
      const flowRecords = await repository.findByFlow(current.flowId);
      const pending = flowRecords.find(
        (record) =>
          record.applicationId !== current.applicationId &&
          (record.status === "submitted" || record.status === "approved"),
      );
      if (pending !== undefined) {
        return fail("vca-pending", `同一 flow 已有未结 VCA（${pending.applicationId}），同时只允许一个`);
      }

      const targets: VersionChangeTarget[] = [];
      for (const target of current.targets) {
        const sha = await hashes.sha256File(target.path);
        if (sha === undefined) return fail("vca-target-invalid", `目标文件不存在：${target.path}`);
        targets.push({ ...target, toSha256: sha });
      }

      const freezes: DocFreezeRecordInput[] = [];
      if (current.kind === "detail-amendment") {
        const docPath = current.amendmentDocPath;
        const version = docPath === undefined ? undefined : docVersionOf(docPath);
        if (docPath === undefined || version === undefined) {
          return fail("vca-invalid", "detail-amendment 缺少修正案文档/版本");
        }
        const docSha = await hashes.sha256File(docPath);
        if (docSha === undefined) return fail("vca-target-invalid", `修正案文档不存在：${docPath}`);
        const frozen = await freeze.freeze({
          path: docPath,
          version,
          sha256: docSha,
          applicationId: current.applicationId,
          reason: "amendment-submitted",
          actorRoleId: "rapporteur",
          at: input.at,
        });
        if (!frozen.ok) return fail(mapFreezeFailure(frozen.code), frozen.message);
        freezes.push(frozen.value);
      }

      const submittedBase: VersionChangeRecord = {
        ...current,
        targets,
        status: "submitted",
        submittedAt: input.at,
        ...(input.submittedBy !== undefined ? { submittedBy: input.submittedBy } : {}),
        updatedAt: input.at,
      };
      const submitted: VersionChangeRecord = {
        ...submittedBase,
        applicationSha256: hashes.sha256Record(submittedBase),
      };
      const updated = await repository.updateWithExpectedStatus(submitted, "draft");
      if (!updated.ok) {
        if (updated.code === "conflict") {
          const latest = await repository.findById(current.applicationId);
          if (latest?.status === "submitted") return { ok: true, value: { record: latest, freezes: [] } };
          return fail("vca-conflict", "VCA 并发提交冲突");
        }
        return fail("vca-invalid", updated.message ?? "VCA 记录写入失败");
      }
      return { ok: true, value: { record: submitted, freezes } };
    },

    async approve(input: VersionChangeApproveInput) {
      const current = await repository.findById(input.applicationId);
      if (current === undefined) return fail("vca-invalid", `VCA 不存在：${input.applicationId}`);
      if (current.status === "approved") {
        if (input.decisionId.trim() !== "" && current.decisionId === input.decisionId) {
          return { ok: true, value: { record: current, freezes: [] } };
        }
        return fail("vca-conflict", "VCA 已批准（决定 id 不一致）");
      }
      if (!canTransitionVersionChange(current.status, "approved")) {
        return fail(
          current.status === "rejected" ? "vca-rejected" : "vca-conflict",
          `VCA 状态 ${current.status} 不能批准`,
        );
      }
      if (typeof input.decisionId !== "string" || input.decisionId.trim() === "") {
        return fail("vca-invalid", "批准必须带客户 decisionId（客户本人；judge/委托/指令不适用）");
      }

      // 批准前重验提交定格哈希（F38/AC-26）：漂移 ⇒ 保持 submitted，不冻结/不 re-pin。
      const drift = await findHashDrift(current.targets, hashes.sha256File);
      if (drift !== undefined) {
        return fail("vca-hash-drift", `目标哈希漂移（批准前重验）：${drift.path}`);
      }
      if (current.kind === "detail-amendment" && current.amendmentDocPath !== undefined) {
        const entry = await freeze.entryOf(current.amendmentDocPath);
        const docSha = await hashes.sha256File(current.amendmentDocPath);
        if (entry === undefined) {
          return fail("vca-apply-failed", "修正案文档未冻结（提交冻结缺失，fail-closed）");
        }
        if (docSha === undefined || docSha !== entry.sha256) {
          return fail("vca-hash-drift", `修正案文档哈希漂移：${current.amendmentDocPath}`);
        }
      }

      let freezes: DocFreezeRecordInput[] = [];
      if (current.kind === "version-upgrade") {
        const reason = current.bootstrap ? "bootstrap-vca-approved" : "version-upgrade-approved";
        const inputs: Array<Parameters<FreezeService["freeze"]>[0]> = [];
        for (const target of current.targets) {
          const version = docVersionOf(target.path);
          if (version === undefined) {
            return fail("vca-target-invalid", `version-upgrade target 缺少版本号：${target.path}`);
          }
          inputs.push({
            path: target.path,
            version,
            sha256: target.toSha256,
            applicationId: current.applicationId,
            reason,
            ...(current.bootstrap ? {} : { decisionId: input.decisionId }),
            at: input.at,
          });
        }
        const frozen = await freeze.freezeMany(inputs);
        if (!frozen.ok) return fail(mapFreezeFailure(frozen.code), frozen.message);
        freezes = frozen.value;
      }

      const approved: VersionChangeRecord = {
        ...current,
        status: "approved",
        decidedBy: "customer",
        decisionId: input.decisionId,
        decidedAt: input.at,
        updatedAt: input.at,
      };
      const updated = await repository.updateWithExpectedStatus(approved, "submitted");
      if (!updated.ok) {
        if (updated.code === "conflict") return fail("vca-conflict", "VCA 并发批准冲突");
        return fail("vca-invalid", updated.message ?? "VCA 记录写入失败");
      }
      return { ok: true, value: { record: approved, freezes } };
    },

    async reject(input: VersionChangeRejectInput) {
      const current = await repository.findById(input.applicationId);
      if (current === undefined) return fail("vca-invalid", `VCA 不存在：${input.applicationId}`);
      if (current.status === "rejected" && current.decisionId === input.decisionId) {
        return { ok: true, value: current };
      }
      if (!canTransitionVersionChange(current.status, "rejected")) {
        return fail("vca-conflict", `VCA 状态 ${current.status} 不能拒绝`);
      }
      if (typeof input.decisionId !== "string" || input.decisionId.trim() === "") {
        return fail("vca-invalid", "拒绝必须带客户 decisionId");
      }
      const rejected: VersionChangeRecord = {
        ...current,
        status: "rejected",
        decidedBy: "customer",
        decisionId: input.decisionId,
        decidedAt: input.at,
        updatedAt: input.at,
        ...(input.message !== undefined ? { message: input.message } : {}),
      };
      const updated = await repository.updateWithExpectedStatus(rejected, "submitted");
      if (!updated.ok) {
        if (updated.code === "conflict") return fail("vca-conflict", "VCA 并发拒绝冲突");
        return fail("vca-invalid", updated.message ?? "VCA 记录写入失败");
      }
      return { ok: true, value: rejected };
    },

    async apply(input: VersionChangeApplyInput) {
      const current = await repository.findById(input.applicationId);
      if (current === undefined) return fail("vca-invalid", `VCA 不存在：${input.applicationId}`);
      if (current.status === "applied" && current.journalId === input.journalId) {
        return { ok: true, value: { record: current, freezes: [] } };
      }
      if (!canTransitionVersionChange(current.status, "applied")) {
        return fail("vca-conflict", `VCA 状态 ${current.status} 不能 apply`);
      }
      if (typeof input.journalId !== "string" || input.journalId.trim() === "") {
        return fail("vca-invalid", "apply 必须带 journalId（P1.3 apply-journal）");
      }
      if (!Number.isInteger(input.resultTrunkVersion) || input.resultTrunkVersion < 1) {
        return fail("vca-invalid", `resultTrunkVersion 非法：${String(input.resultTrunkVersion)}`);
      }
      if (current.bootstrap) {
        if (input.resultTrunkVersion !== 1) {
          return fail("vca-apply-failed", "bootstrap 只能建立 trunkVersion 1（source:bootstrap）");
        }
      } else if (
        current.baseTrunk !== null &&
        input.resultTrunkVersion <= current.baseTrunk.trunkVersion
      ) {
        return fail(
          "vca-apply-failed",
          `trunk 版本必须递增：base v${current.baseTrunk.trunkVersion} → ${input.resultTrunkVersion}`,
        );
      }

      const drift = await findHashDrift(current.targets, hashes.sha256File);
      if (drift !== undefined) {
        return fail("vca-hash-drift", `目标哈希漂移（apply 前重验）：${drift.path}`);
      }

      let freezes: DocFreezeRecordInput[] = [];
      if (current.kind === "detail-amendment") {
        const appliedPaths = (input.appliedTargetPaths ?? []).map((path) => normalizeServiceRelPath(path));
        if (appliedPaths.some((path) => path === undefined)) {
          return fail("vca-invalid", "appliedTargetPaths 含非法路径");
        }
        const appliedSet = new Set(appliedPaths as string[]);
        if (appliedSet.size === 0) {
          return fail("vca-apply-failed", "no-applicable-changes：全部 kept/none，不改 trunk");
        }
        const targetPaths = new Set(current.targets.map((target) => target.path));
        for (const path of appliedSet) {
          if (!targetPaths.has(path)) return fail("vca-invalid", `applied target 不在 VCA targets：${path}`);
        }
        if (current.decisionId === undefined) {
          return fail("vca-apply-failed", "detail apply 需要客户批准 decisionId（冻结归属 customer）");
        }
        const inputs: Array<Parameters<FreezeService["freeze"]>[0]> = [];
        for (const target of current.targets) {
          if (!appliedSet.has(target.path)) continue;
          // C15：execution（teamPlan/flow）不纳入 guard 版本化冻结；其冻结/re-pin 由
          // trunk manifest + verifyTrunk 保证（E1/E2 披露「execution 非 guard 冻结」）。
          if (target.kind === "execution") continue;
          const version = docVersionOf(target.path);
          if (version === undefined) {
            return fail("vca-target-invalid", `detail target 缺少版本号：${target.path}`);
          }
          inputs.push({
            path: target.path,
            version,
            sha256: target.toSha256,
            applicationId: current.applicationId,
            reason: "detail-item-applied",
            decisionId: current.decisionId,
            at: input.at,
          });
        }
        const frozen = await freeze.freezeMany(inputs);
        if (!frozen.ok) return fail(mapFreezeFailure(frozen.code), frozen.message);
        freezes = frozen.value;
      }

      const applied: VersionChangeRecord = {
        ...current,
        status: "applied",
        resultTrunkVersion: input.resultTrunkVersion,
        journalId: input.journalId,
        updatedAt: input.at,
      };
      const updated = await repository.updateWithExpectedStatus(applied, "approved");
      if (!updated.ok) {
        if (updated.code === "conflict") return fail("vca-conflict", "VCA 并发 apply 冲突");
        return fail("vca-invalid", updated.message ?? "VCA 记录写入失败");
      }
      return { ok: true, value: { record: applied, freezes } };
    },

    async list(filter) {
      const records = await repository.list();
      return records.filter((record) => {
        if (filter?.flowId !== undefined && record.flowId !== filter.flowId) return false;
        if (filter?.status !== undefined && record.status !== filter.status) return false;
        return true;
      });
    },
  };
}

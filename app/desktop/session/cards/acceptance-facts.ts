// app/desktop/session/cards/acceptance-facts.ts
// B5（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B5、附录 A cards 组）：验收 judge 事实 + 验收拒绝计数 + appointment-write/stable-write
// 校验（L4，模块内拆分）。
// 5 个类方法（enrichAcceptanceJudgeContext/countAcceptanceRejections/afterStableWrite/
// enrichAppointmentWriteBoundaryCard/afterAppointmentWriteApproved）自 app/desktop/session.ts
// **逐字搬移**（含 JSDoc）：方法体零改动（唯一文本适配：正文内联 `import("…src/model/runtime.ts")`
// 的相对深度随模块目录调整，见记录化归一化）；类外壳重建原 receiver 面——
//  · 只读事实构造：产品意图 / 最新名单 / 最新 D3 / 质检报告 / criteria 证据（不伪造、不改裁决权）；
//  · stable/appointment-write 校验：AC-13 边界扩大检测与 required acknowledgments（不签发第二份许可）；
//  · 已迁出的 readTasks 经同名同义委托 → shared/tasks-store；deps 只读切片（runtimeOptions）。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 与 cards.ts 的分配：appointment-write 应用侧校验（appointmentWriteApplicationRejection，需 D3/名单
// 读取与任务账本）按任务口径留在 cards.ts；本文件收验收 judge 事实/计数与 appointment-write 校验的
// 呈现后处理（afterStableWrite 等 3 方法由 cards.ts 调配入，以满足单模块 1,500 行预算；记录 §7 偏差 1）。

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createToolDisplayContext } from "../../../../src/common/runtime-core/tool-display.ts";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { readIntentEntryFacts } from "../../../../src/common/shared/intent-entry-contract.ts";
import { checkEvidence, deriveAcceptanceFact, loadCriteria } from "../../../../src/common/编排/evidence-check.ts";
import { findActiveRun, loadPinnedRoster, pinnedDocsSummary } from "../../../../src/common/编排/run-manifest.ts";
import { loadLatestRoster } from "../../../../src/common/编排/workflow-preconditions.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../../../src/model/runtime.ts";
import type { AcceptanceReportDisplayV1 } from "../../customer-input.ts";
import type { AcceptanceFact, CustomerInputMetadata, CustomerInputOutcome, CustomerInputRequest, GovernanceJudgeContext, TaskStateEvent } from "../../../../src/model/runtime.ts";
import { declaredConfirmPaths, declaredPathBodies } from "../../../../src/common/编排/confirmed-writes.ts";
import { stableWritePathOf } from "../../../../src/common/门禁引擎/versioned-doc-guard.ts";
import { mainT } from "../../i18n.ts";
import { appointmentStableWriteInputs, buildStableBoundaryRisk, mergeAcknowledgements, type VersionChangeStack } from "../../version-change.ts";
import type { TaskReplay } from "../../../../src/common/编排/task-state.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import { now } from "../shared/clock.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { readTasks } from "../shared/tasks-store.ts";

/** 验收 judge 事实/验收拒绝计数/appointment-write 校验（原 SessionManager 5 方法的同签名实现）。 */
export class AcceptanceFacts {
  private readonly deps: SessionManagerDeps;
  constructor(deps: SessionManagerDeps) { this.deps = deps; }

  /** 原 `SessionManager.readTasks` 的同义委托（→ shared/tasks-store.ts；签名/行为逐字一致）。 */
  private async readTasks(projectRoot: string): Promise<TaskReplay> { return readTasks(projectRoot); }
  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private now(): number { return now(this.deps); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  // —— enrichAcceptanceJudgeContext（B5 自 session.ts 逐字搬移）——
  /**
   * 2026-10-29（方案 v2.1 §5.1/Q6 A）：验收卡最小链事实（应用侧补充 judgeContext.facts）。
   * 只读：产品意图文档 / 最新名单 / 最新 D3 裁决 / 质检报告；任一缺失 ⇒ unavailableReason（judge 回落手动）。
   * 不伪造事实、不改变客户/判断的最终验收权。
   */
  async enrichAcceptanceJudgeContext(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    sourceRoleId: string,
  ): Promise<{ metadata: CustomerInputMetadata | undefined; display?: AcceptanceReportDisplayV1 }> {
    const flowId = request.flowId ?? metadata?.flowId;
    if (typeof flowId !== "string" || flowId.trim() === "") return { metadata }; // 无 flowId：沿用既有早退；不构造/不读取/不显示
    // 2026-11-02 acceptance-return-card（P1-ARC-04/N1）：构造 docs/quality 路径前先做本地 slug 校验；
    // 非法非空 flowId 不构造/不读取任何项目路径，返回 fail-closed judgeContext。
    if (!new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: sourceRoleId }).record(
        "acceptance.card.report.display",
        { ok: false, reasonCode: "flow-id-invalid" },
      );
      return {
        metadata: {
          ...(metadata ?? {}),
          judgeContext: {
            flowId,
            facts: {
              governanceModel: "trio",
              flowId,
              ledgerErrors: 0,
              unresolvedClarificationCount: 0,
              latestDecisionKinds: [],
            },
            unavailableReason: "验收最小链事实缺失：质检报告（flowId 不合法，未读取报告）",
          },
        },
      };
    }
    const activeRun = await findActiveRun(projectRoot, flowId);
    const pinnedRun = activeRun.ok && activeRun.manifest !== null && activeRun.manifest.state === "pinned" ? activeRun.manifest : undefined;
    // 2026-11-01（acceptance-evidence-path，方案 P1.2 §2.2/§3.1）：验收判断的提案物证路径。
    // pinned run 以 manifest `documents.proposal.path`（trim 后非空）为唯一路径；pinned 但无 proposal ⇒ 缺失，不回退扫描。
    // 无 pin 复用共享解析 `readIntentEntryFacts` 取最新 `docs/proposals/<flowId>-proposal-vN.md`（别名不参与）；不另写扫描。
    const pinnedProposalPath = pinnedRun?.documents.proposal?.path?.trim();
    const proposalRel =
      pinnedRun !== undefined
        ? (pinnedProposalPath !== undefined && pinnedProposalPath !== "" ? pinnedProposalPath : undefined)
        : (await readIntentEntryFacts({ projectRoot, flowId })).proposalPath;
    const intentRel = pinnedRun?.documents.intent?.path ?? `docs/product/${flowId}-intent-v1.md`;
    const reportRel = `docs/quality/${flowId}-report-v1.md`;
    const readText = async (rel: string): Promise<string | undefined> => {
      try {
        return await fs.promises.readFile(path.join(projectRoot, rel), "utf8");
      } catch {
        return undefined;
      }
    };
    const intentText = await readText(intentRel);
    const intentOk = intentText !== undefined && intentText.trim() !== "" && /^#/m.test(intentText);
    const roster = pinnedRun !== undefined ? await loadPinnedRoster(projectRoot, pinnedRun) : await loadLatestRoster({ projectRoot, flowId });
    // 2026-10-29（v2.6/R2）：验收卡可引用模块（moduleId）；应用按最新名单核对并把模块事实放进 facts。
    const acceptanceModuleId = typeof metadata?.moduleId === "string" ? metadata.moduleId.trim() : "";
    const acceptanceModule =
      acceptanceModuleId !== "" && roster.ok ? roster.roster.modules.find((module) => module.id === acceptanceModuleId) : undefined;
    const acceptanceModuleOwner =
      acceptanceModule !== undefined && roster.ok
        ? roster.roster.roles.find((role) => role.modules.includes(acceptanceModule.id))?.id
        : undefined;
    const acceptanceModulePaths =
      acceptanceModule !== undefined
        ? acceptanceModule.paths
        : Array.isArray(metadata?.modulePaths)
          ? metadata.modulePaths
          : undefined;
    const reportText = await readText(reportRel);
    const reportOk = reportText !== undefined && reportText.trim() !== "";
    // 2026-11-02 acceptance-return-card（C2/C3）：复用上面已有读取，只做 16 KiB 安全投影；
    // 投影失败/报告缺失只省略 display，不影响卡片呈现与判断。诊断只记白名单元数据，不记正文/凭据。
    const displayDiagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: sourceRoleId });
    let display: AcceptanceReportDisplayV1 | undefined;
    if (reportOk && reportText !== undefined) {
      try {
        const credentialEnvNames = [
          ...(this.deps.runtimeOptions?.extraCredentialEnvVars ?? []),
          ...(this.deps.runtimeOptions?.apiKeyEnvVar ? [this.deps.runtimeOptions.apiKeyEnvVar] : []),
        ];
        const text = createToolDisplayContext({ credentialEnvNames }).protectText(reportText, 16384);
        display = { version: 1, path: reportRel, text };
        displayDiagnostic.record("acceptance.card.report.display", {
          ok: true,
          path: reportRel,
          bytes: Buffer.byteLength(reportText, "utf8"),
          state: text.truncated
            ? (text.redacted ? "truncated+redacted" : "truncated")
            : (text.redacted ? "redacted" : "plain"),
        });
      } catch {
        display = undefined;
        displayDiagnostic.record("acceptance.card.report.display", { ok: false, path: reportRel, reasonCode: "projection-failed" });
      }
    } else {
      displayDiagnostic.record("acceptance.card.report.display", { ok: false, path: reportRel, reasonCode: "report-missing" });
    }
    // 最新 D3（appointment 裁决）及 decisionId。
    const state = await this.readTasks(projectRoot);
    const requestFlows = new Map<string, string | undefined>();
    for (const event of state.events) {
      if (event.kind === "request.created") requestFlows.set(event.requestId, event.flowId);
    }
    let d3: { decisionId?: string; at: string } | undefined;
    for (const event of state.events) {
      if (event.kind !== "request.resolved") continue;
      const eventFlow = requestFlows.get(event.requestId);
      if (eventFlow !== undefined && eventFlow !== flowId) continue;
      if (event.decisionId === undefined) continue;
      if (event.rosterVersion === undefined && event.rosterSha256 === undefined) continue; // 仅新链 D3
      if (d3 === undefined || event.at > d3.at) d3 = { decisionId: event.decisionId, at: event.at };
    }
    const hasLegacyFlowTask = [...state.records.values()].some(
      (record) => record.created?.flowId === flowId && record.created.runId === undefined,
    );
    const criteriaRef = metadata?.criteriaRef;
    const factInputs = Array.isArray(metadata?.acceptanceFacts) ? metadata.acceptanceFacts : [];
    let criteriaDoc: Awaited<ReturnType<typeof loadCriteria>> | undefined;
    const evidenceFacts: import("../../../../src/model/runtime.ts").AcceptanceFact[] = [];
    const evidenceMismatch: string[] = [];
    if (criteriaRef !== undefined) {
      criteriaDoc = await loadCriteria(projectRoot, flowId, criteriaRef);
      if (!criteriaDoc.ok) {
        evidenceMismatch.push(`${criteriaDoc.code}：${criteriaDoc.rejection.missing.join("；")}`);
      } else {
        for (const factInput of factInputs) {
          const derived = deriveAcceptanceFact(criteriaDoc.doc, {
            acId: factInput.acId,
            ...(factInput.artifact !== undefined ? { artifact: factInput.artifact } : {}),
            ...(factInput.metaPath !== undefined ? { metaPath: factInput.metaPath } : {}),
          });
          if ("ok" in derived) {
            evidenceMismatch.push(`${derived.code}：${derived.rejection.missing.join("；")}`);
            continue;
          }
          if (factInput.artifact !== undefined) {
            const checked = await checkEvidence({
              projectRoot,
              acId: factInput.acId,
              criteria: criteriaDoc.doc,
              artifact: factInput.artifact,
              ...(factInput.metaPath !== undefined ? { metaPath: factInput.metaPath } : {}),
            });
            evidenceFacts.push({
              ...derived,
              valid: checked.valid,
              unverified: checked.unverified,
              legacy: checked.legacy,
              mismatch: checked.mismatch,
            });
            if (checked.mismatch.length > 0) evidenceMismatch.push(...checked.mismatch);
          } else {
            evidenceFacts.push(derived);
          }
        }
      }
    }
    const missing: string[] = [
      ...(intentOk ? [] : ["产品意图文档"]),
      ...(roster.ok ? [] : ["人员名单"]),
      ...(d3?.decisionId !== undefined ? [] : ["D3 裁决"]),
      ...(reportOk ? [] : ["质检报告"]),
      ...(acceptanceModuleId !== "" && acceptanceModule === undefined ? ["模块（最新名单未找到）"] : []),
      ...(criteriaRef === undefined && factInputs.length > 0 ? ["criteriaRef（验收 criteria 未显式引用，P0 未机器校验）"] : []),
      ...(criteriaDoc !== undefined && !criteriaDoc.ok ? [`criteria（${criteriaDoc.code}）`] : []),
      ...(evidenceMismatch.length > 0 ? ["证据自洽（evidence-mismatch）"] : []),
    ];
    const baseContext = metadata?.judgeContext;
    const facts = {
      ...(baseContext?.facts ?? {
        governanceModel: "trio" as const,
        flowId,
        ledgerErrors: 0,
        unresolvedClarificationCount: 0,
        latestDecisionKinds: [] as string[],
      }),
      ...(intentOk ? { intentDocumentPath: intentRel } : {}),
      ...(roster.ok ? { rosterVersion: roster.version, rosterSha256: roster.sha256 } : {}),
      ...(pinnedRun?.d3?.decisionId !== undefined
        ? { appointmentDecisionId: pinnedRun.d3.decisionId }
        : d3?.decisionId !== undefined
          ? { appointmentDecisionId: d3.decisionId }
          : {}),
      ...(reportOk ? { qualityReportPath: reportRel } : {}),
      ...(pinnedRun !== undefined
        ? { runId: pinnedRun.runId, runState: "pinned" as const, pinnedDocs: pinnedDocsSummary(pinnedRun) }
        : hasLegacyFlowTask
          ? { runState: "legacy" as const }
          : {}),
      ...(criteriaRef !== undefined ? { criteriaRef } : {}),
      ...(evidenceFacts.length > 0 ? { acceptanceFacts: evidenceFacts } : {}),
      ...(evidenceMismatch.length > 0 ? { evidenceMismatch } : {}),
      ...(acceptanceModule !== undefined
        ? {
            moduleId: acceptanceModule.id,
            moduleDirectory: acceptanceModule.path,
            ...(acceptanceModulePaths !== undefined ? { modulePaths: [...acceptanceModulePaths] } : {}),
            ...(acceptanceModuleOwner !== undefined ? { moduleOwnerRoleId: acceptanceModuleOwner } : {}),
          }
        : {}),
    };
    const judgeContext: GovernanceJudgeContext = {
      ...(baseContext ?? { flowId }),
      flowId,
      facts,
      ...(missing.length > 0
        ? { unavailableReason: `验收最小链事实缺失：${missing.join("、")}${roster.ok ? "" : `（${roster.reason}）`}` }
        : {}),
      artifacts: {
        ...(baseContext?.artifacts ?? {}),
        // 显式覆盖继承的旧值；`proposalRel === undefined` 时也不得保留旧值（证据包按缺失 fail-closed）。
        proposalPath: proposalRel,
        acceptanceReportPath: reportRel,
      },
    };
    return {
      metadata: { ...(metadata ?? {}), judgeContext },
      ...(display !== undefined ? { display } : {}),
    };
  }

  // —— afterStableWrite（B5 自 session.ts 逐字搬移）——
  /**
   * stable 写入的 post-write 复核（D1/F16）：**只在运行时核心 write/edit 成功后**由
   * `versionedDocAfterWrite` 接缝调用；桌面不写盘、不缓存许可、不复算 target hash。
   * 失败只系统行/诊断（写入已成事实；许可由 S2 作废，trunk 快照不更新——无 drift 状态）。
   */
  async afterStableWrite(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    absPath: string,
  ): Promise<void> {
    try {
      const rel = path.relative(projectRoot, absPath);
      if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return;
      const posix = rel.split(path.sep).join("/");
      const actual = createHash("sha256").update(await fs.promises.readFile(absPath)).digest("hex");
      const result = await stack.completeStableWriteAfterWrite(posix, actual, new Date(this.now()).toISOString());
      if (!result.ok) {
        this.emitDeliveryNote(
          projectRoot,
          runtime,
          roleId,
          roleId,
          `${mainT("ui.stableWrite.record.section")} · ${posix} · ${mainT("shared.common.failed")}${result.code !== undefined ? ` (${result.code})` : ""}`,
        );
      }
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("stable-write.complete.failed", error);
    }
  }

  // —— enrichAppointmentWriteBoundaryCard（B5 自 session.ts 逐字搬移）——
  /**
   * AC-13（D2）：stable boundary 确认卡扩大检测与 ack 注入。
   * 只读调用 S7 `detectStableBoundaryExpansion`（preview body → 条目级扩大）；
   * role-card/boundary 的 appointment-write 语义不变（只增预览横幅/required acknowledgments）。
   */
  async enrichAppointmentWriteBoundaryCard(
    stack: VersionChangeStack,
    projectRoot: string,
    request: CustomerInputRequest,
  ): Promise<{ kind: "pass"; request: CustomerInputRequest } | { kind: "reject"; reason: string }> {
    if (request.kind !== "confirm") return { kind: "pass", request };
    const paths = declaredConfirmPaths(request);
    const boundaryPaths = paths.filter((rel) => stableWritePathOf(rel)?.kind === "boundary");
    if (boundaryPaths.length === 0) return { kind: "pass", request };
    const bodies = new Map(declaredPathBodies(request.preview, boundaryPaths).map((entry) => [entry.path, entry]));
    const expansions: string[] = [];
    for (const relPath of boundaryPaths) {
      const info = stableWritePathOf(relPath);
      if (info === undefined || info.kind !== "boundary" || info.roleId === undefined) continue;
      const body = bodies.get(relPath) ?? bodies.get(info.path);
      if (body === undefined || body.hasBody !== true) {
        return { kind: "reject", reason: mainT("main.interface.boundaryParseFailed", { detail: relPath }) };
      }
      const detected = await stack.detectStableBoundaryExpansion({
        roleId: info.roleId,
        fromPath: info.path,
        toYamlText: body.body,
      });
      expansions.push(...detected.expansions);
    }
    if (expansions.length === 0) return { kind: "pass", request };
    const risk = buildStableBoundaryRisk(expansions);
    if (risk.unparseable) {
      return {
        kind: "reject",
        reason: mainT("main.interface.boundaryParseFailed", { detail: expansions.join("；") }),
      };
    }
    return {
      kind: "pass",
      request: {
        ...request,
        preview: `${risk.banner}\n\n${request.preview ?? ""}`,
        acknowledgments: mergeAcknowledgements(request.acknowledgments, risk.acknowledgments),
      },
    };
  }

  // —— afterAppointmentWriteApproved（B5 自 session.ts 逐字搬移）——
  /**
   * appointment-write 确认后的 stable 许可签发（role-card/boundary；**不写盘**）：
   * 正文取自确认卡 preview 的逐路径正文；真实写入由角色 write_file/edit_file 经 run-role gate 执行。
   * 失败只系统行（写入会被门禁拒绝——fail-closed，不伪造成功）。
   * AC-13：扩大检测要求的 required acknowledgments 未齐 ⇒ **不签发任何许可**（最后防线）。
   */
  async afterAppointmentWriteApproved(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    request: CustomerInputRequest,
    outcome: CustomerInputOutcome | null | undefined,
  ): Promise<void> {
    if (outcome === null || outcome === undefined || outcome.outcome !== "answered" || outcome.value.confirmed !== true) return;
    const requiredBoundaryAcks = (request.acknowledgments ?? [])
      .filter((entry) => entry.required === true && entry.id.startsWith("boundary-expansion-"))
      .map((entry) => entry.id);
    if (requiredBoundaryAcks.length > 0) {
      const acknowledged = Array.isArray(outcome.acknowledged) ? outcome.acknowledged : [];
      if (requiredBoundaryAcks.some((id) => !acknowledged.includes(id))) {
        this.emitDeliveryNote(
          projectRoot,
          runtime,
          roleId,
          roleId,
          `${mainT("ui.stableWrite.record.section")} · ${mainT("ui.stableWrite.kind.boundary")} · ${mainT("shared.common.failed")} (boundary-ack-missing)`,
        );
        return;
      }
    }
    const confirmationId =
      typeof outcome.decisionId === "string" && outcome.decisionId.trim() !== "" ? outcome.decisionId : undefined;
    if (confirmationId === undefined) return;
    const inputs = appointmentStableWriteInputs(request);
    for (const input of inputs) {
      try {
        const result = await stack.onAppointmentWriteApproved({
          roleId: input.roleId,
          kind: input.kind,
          content: input.content,
          confirmationId,
          ...(input.diffPreview !== undefined ? { diffPreview: input.diffPreview } : {}),
          at: new Date(this.now()).toISOString(),
        });
        if (!result.ok) {
          this.emitDeliveryNote(
            projectRoot,
            runtime,
            roleId,
            roleId,
            `${mainT("ui.stableWrite.record.section")} · ${mainT("ui.stableWrite.kind.roleCard")}/${mainT("ui.stableWrite.kind.boundary")} · ${mainT("shared.common.failed")}${result.code !== undefined ? ` (${result.code})` : ""}`,
          );
        }
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error(
          "stable-write.appointment.failed",
          error,
        );
      }
    }
  }

  // —— countAcceptanceRejections（B5 自 session.ts 逐字搬移）——
  countAcceptanceRejections(events: readonly TaskStateEvent[], flowId: string): number {
    const acceptance = new Set<string>();
    for (const event of events) {
      if (event.kind === "request.created" && event.cardKind === "acceptance" && event.flowId === flowId) acceptance.add(event.requestId);
    }
    let count = 0;
    for (const event of events) {
      if (event.kind !== "request.resolved" || !acceptance.has(event.requestId)) continue;
      const selected = event.selectedOptionIds ?? [];
      if (event.choice === "reject" || selected.includes("reject") || selected.includes("rework")) count += 1;
    }
    return count;
  }

}

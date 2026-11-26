// app/desktop/session/evidence.ts
// B2（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §5 B2、附录 A evidence 组）：证据/契约/文档格式检查与固定收口证据构建（L1，feature 白名单 []）。
// 9 个类方法（findFixedReviewArtifact/buildFixedCloseEvidence/collectFixedProposalDocumentRefs/
// fixedReleaseAutoEvidence/evidenceCheckText/evidenceScopeRoots/contractCheckText/contractCheckTextFixed/
// docFormatText）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳仅重建原
// receiver 面——`deps` 字段（构造注入，仍以 deps 方法调用形式执行）+ `refreshListingNow`/`readTasks`
// 两个同名同义委托（→ shared/roles.ts / shared/tasks-store.ts）。可见性 `private async` → `async`
// 仅为门面委托可调用（模块内方法，不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L1 feature 只可导入 L0（contracts/shared）与外部 src；不得导入 barrel/feature。

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";
import { isBuiltInGovernanceRoleId } from "../../../src/service/boundary/resolve-boundary.ts";
import { checkEvidence, checkEvidenceCollection, isWithinEvidenceRoots, loadCriteria, parseEvidenceMeta, readArtifact, validateEvidencePath } from "../../../src/common/编排/evidence-check.ts";
import { contractSchemaText, loadLatestRoster, type ProjectRoster } from "../../../src/common/编排/workflow-preconditions.ts";
import { loadPinnedRoster, listRunManifestsResult, type RunManifest } from "../../../src/common/编排/run-manifest.ts";
import { docFormatIndexText, docFormatSpecText } from "../../../src/common/编排/doc-format-specs.ts";
import { intentEntryContractText, readIntentEntryFacts, type IntentContractRole } from "../../../src/common/shared/intent-entry-contract.ts";
import { makeMechanicalRejection, rejectionMapSnapshot } from "../../../src/common/编排/mechanical-rejection.ts";
import { archiveAcceptance, findAcceptanceArchive, readWorkflowLedger, taskBranchName, type WorkflowServiceFailure } from "../../../src/common/编排/workflow-service.ts";
import { readTaskState, type TaskReplay } from "../../../src/common/编排/task-state.ts";
import { createDesktopReleaseGitPort } from "../workflow-git.ts";
import type { FixedReleaseTriggerStage, WorkflowMode } from "../workflow.ts";
import type { ContractCheckInput, DocFormatInput, EvidenceCheckInput, WorkflowArtifactRef, WorkflowDocumentRef, WorkflowEvent } from "../../../src/model/runtime.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import { isProjectRelativeFileRef, latestVersionedDoc } from "./shared/text.ts";
import { readTasks } from "./shared/tasks-store.ts";
import { refreshListingNow } from "./shared/roles.ts";

/** 名单/刷新端口面（原 `this.deps` 的两项只读查询；与 shared/roles.ts 的 RolesDeps 同形）。 */
export type EvidenceDeps = Pick<SessionManagerDeps, "getListing" | "refreshListing">;

/** 证据/契约/文档格式检查（原 `SessionManager` 9 方法的同签名实现；构造时注入 deps 只读端口）。 */
export class Evidence {
  private readonly deps: EvidenceDeps;
  constructor(deps: EvidenceDeps) { this.deps = deps; }

  /** 原 `SessionManager.refreshListingNow` 的同义委托（→ shared/roles.ts；签名/行为逐字一致）。 */
  private async refreshListingNow(projectRoot: string): Promise<boolean> {
    return refreshListingNow(projectRoot, this.deps);
  }

  /** 原 `SessionManager.readTasks` 的同义委托（→ shared/tasks-store.ts；签名/行为逐字一致）。 */
  private async readTasks(projectRoot: string): Promise<TaskReplay> {
    return readTasks(projectRoot);
  }

  /**
   * B22（2026-11-11，RR16 失败修复）：A12a/A12b 收口证据回退——报告 evidence[] 漏写纯路径时，按
   * 应用质量路径取最新 `docs/quality/<flowId>-{criteria|report}-vN.md` 的实际字节 SHA-256；
   * 文件缺失/不可读 ⇒ undefined（调用方仍 close-report-missing fail-closed，不伪造）。
   */
  async findFixedReviewArtifact(
    projectRoot: string,
    flowId: string | undefined,
    stage: "A12a" | "A12b",
  ): Promise<WorkflowArtifactRef | undefined> {
    if (flowId === undefined || flowId.trim() === "") return undefined;
    const suffix = stage === "A12a" ? "criteria" : "report";
    const latest = await latestVersionedDoc(projectRoot, "docs/quality", flowId, suffix);
    if (latest === undefined) return undefined;
    const rel = `docs/quality/${latest.name}`;
    try {
      const bytes = await fs.promises.readFile(path.join(projectRoot, ...rel.split("/")));
      return { path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), kind: suffix };
    } catch {
      return undefined;
    }
  }

  /**
   * fixed 收口证据（应用计算）：`accepted` 收口时：
   * - artifacts = 任务最后一份 done 报告 `evidence[]` 中**真实存在**的项目相对文件（path+字节 SHA-256）；
   * - A11/B3：`branchTipOid` = 当前任务分支真实 tip（分支必须 = `ans/task/<workflowId>`）；
   * - A12b：生成 `docs/acceptance/<flowId>-acceptance-vN.md`（`archiveAcceptance`；criteria 取 A12a
   *   任务报告证据），失败 ⇒ `acceptance-archive-failed`（阻塞 A12）。
   * 绝不写入模型自报证据：任务/报告只从 tasks 账本读取。
   */
  async buildFixedCloseEvidence(
    projectRoot: string,
    taskId: string,
    note: string | undefined,
  ): Promise<
    | { ok: true; evidence: { artifacts?: WorkflowArtifactRef[]; branchTipOid?: string; acceptanceArchive?: { path: string; sha256: string } } | undefined }
    | WorkflowServiceFailure
  > {
    const state = await readTaskState(projectRoot);
    const record = state.records.get(taskId);
    if (record?.created === undefined) {
      return { ok: false, code: "close-task-invalid", message: `任务 ${taskId} 不存在。` };
    }
    const created = record.created;
    if (created.workflowId === undefined || created.stage === undefined) return { ok: true, evidence: undefined };
    // B18（2026-11-11，RR13 失败修复）：stage-request 只是产线调度请求，不参与阶段完成
    // （`workflowService.closeTask` 对 `taskKind:"stage-request"` 同样跳过阶段事件）。accepted 收口
    // 不要求产物证据/分支 tip/验收归档；否则 A2/A5 等阶段的 stage-request 会因报告 evidence 为
    // 描述文本而 `close-report-missing`，open advance 请求无法收口，后续 stage-request 被
    // `stage-request-open` 拒绝（RR13 A4 卡死）。
    if (created.taskKind === "stage-request") return { ok: true, evidence: undefined };
    const stage = created.stage;
    const lastReport = record.reports[record.reports.length - 1];
    // B31（2026-11-11，RR26）：A12b 轻量验收——verifier 无受认可运行期验证通道时以 `status:"blocked"`
    // 交回复验报告；`accepted` 收口（调用点已保证）且 `note` 非空时**继续生成应用归档证据**（归档
    // `staffDecision` 即 note）。**只限 A12b**：非 A12b / blocked 无 note / failed / 无报告仍返回
    // `evidence: undefined`，由服务层 `close-report-missing` fail-closed（应用不解析 note 文案，
    // 措辞由 chief v2 约束；不放宽其它阶段语义）。
    const lightweightBlockedA12b = stage === "A12b"
      && lastReport?.status === "blocked"
      && typeof note === "string" && note.trim() !== "";
    if (lastReport?.status !== "done" && !lightweightBlockedA12b) {
      return { ok: true, evidence: undefined }; // 服务层按 close-report-missing fail-closed
    }
    const evidencePaths = (lastReport.evidence ?? []).filter(
      (item): item is string => typeof item === "string" && isProjectRelativeFileRef(item),
    );
    const artifacts: WorkflowArtifactRef[] = [];
    for (const rel of evidencePaths) {
      try {
        const bytes = await fs.promises.readFile(path.join(projectRoot, ...rel.split("/")));
        artifacts.push({ path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), kind: "report-evidence" });
      } catch {
        /* 缺失文件不猜：不计入 artifacts（阶段完成前置会 fail-closed） */
      }
    }
    // B22（2026-11-11，RR16）：A12a/A12b 的报告 evidence[] 若漏写纯路径，应用按质量路径回退——
    // 取最新 docs/quality/<flowId>-{criteria|report}-vN.md 的实际字节（应用计算 hash）；文件缺失仍 fail-closed。
    if (artifacts.length === 0 && (stage === "A12a" || stage === "A12b")) {
      const fallback = await this.findFixedReviewArtifact(projectRoot, created.flowId, stage);
      if (fallback !== undefined) artifacts.push(fallback);
    }
    const needsArtifacts = ["A2", "A5", "A11", "A12a", "A12b", "B1", "B3"].includes(stage);
    if (needsArtifacts && artifacts.length === 0) {
      return {
        ok: false,
        code: "close-report-missing",
        message: `阶段 ${stage} 的 accepted 收口需要报告证据文件（任务报告 evidence[] 中的项目相对路径；当前无可用证据）。`,
      };
    }
    const evidence: { artifacts?: WorkflowArtifactRef[]; branchTipOid?: string; acceptanceArchive?: { path: string; sha256: string } } = {};
    if (artifacts.length > 0) evidence.artifacts = artifacts;
    if (stage === "A11" || stage === "B3") {
      const facts = await createDesktopReleaseGitPort().inspectRepository({ projectRoot });
      if (!facts.ok) return facts;
      const expectedBranch = taskBranchName(created.workflowId);
      if (facts.facts.branch !== expectedBranch) {
        return {
          ok: false,
          code: "git-branch-mismatch",
          message: `任务分支与收口证据不一致：当前 ${facts.facts.branch} != ${expectedBranch}（不记录 tip）。`,
        };
      }
      evidence.branchTipOid = facts.facts.headOid.hex;
    }
    if (stage === "A12b") {
      const flowId = created.flowId;
      // B22：报告/标准路径优先取报告 evidence[] 的纯路径；缺失时按应用质量路径回退（真实字节）。
      const reportPath = evidencePaths.find((item) => /-report-v\d+\.md$/.test(item))
        ?? (await this.findFixedReviewArtifact(projectRoot, flowId, "A12b"))?.path;
      const criteriaPath = [...state.records.values()]
        .filter((sibling) => sibling.created?.workflowId === created.workflowId && sibling.created?.stage === "A12a")
        .flatMap((sibling) => sibling.reports.filter((report) => report.status === "done"))
        .flatMap((report) => report.evidence ?? [])
        .find((item): item is string => typeof item === "string" && /-criteria-v\d+\.md$/.test(item))
        ?? (await this.findFixedReviewArtifact(projectRoot, flowId, "A12a"))?.path;
      if (flowId === undefined || reportPath === undefined || criteriaPath === undefined) {
        return {
          ok: false,
          code: "acceptance-record-invalid",
          message: "A12b 归档需要 flowId + report 路径（本任务报告证据）+ criteria 路径（A12a 任务报告证据）。",
        };
      }
      const archived = await archiveAcceptance({
        projectRoot,
        flowId,
        workflowId: created.workflowId,
        criteriaPath,
        reportPath,
        conclusion: lastReport.summary,
        ...(note !== undefined ? { staffDecision: note } : {}),
      });
      if (!archived.ok) return archived; // acceptance-archive-failed 阻塞 A12（不静默通过）
      evidence.acceptanceArchive = { path: archived.path, sha256: archived.sha256 };
    }
    return { ok: true, evidence };
  }

  /**
   * 固定方案卡 `documentRefs`（v1.3 §8.2；应用计算 path+sha256+version，不采信模型自报）：
   * intent/proposal/modules/roster/architecture 五件；任一缺失/不可读 ⇒ `proposal-document-missing`（不发卡）。
   */
  async collectFixedProposalDocumentRefs(
    projectRoot: string,
    flowId: string,
  ): Promise<{ ok: true; refs: WorkflowDocumentRef[] } | WorkflowServiceFailure> {
    const specs: ReadonlyArray<{ dir: string; kind: string; suffix: string }> = [
      { dir: "docs/product", kind: "intent", suffix: "intent" },
      { dir: "docs/proposals", kind: "proposal", suffix: "proposal" },
      { dir: "docs/proposals", kind: "modules", suffix: "modules" },
      { dir: "docs/proposals", kind: "roster", suffix: "roster" },
      { dir: "docs/contracts", kind: "architecture", suffix: "architecture" },
    ];
    const refs: WorkflowDocumentRef[] = [];
    for (const spec of specs) {
      const latest = await latestVersionedDoc(projectRoot, spec.dir, flowId, spec.suffix);
      if (latest === undefined) {
        return {
          ok: false,
          code: "proposal-document-missing",
          message: `方案卡绑定缺失：未找到 ${spec.dir}/${flowId}-${spec.suffix}-vN.md（不发卡）。`,
        };
      }
      let bytes: Buffer;
      try {
        bytes = await fs.promises.readFile(path.join(projectRoot, spec.dir, latest.name));
      } catch {
        return {
          ok: false,
          code: "proposal-document-missing",
          message: `方案卡绑定不可读：${spec.dir}/${latest.name}（不发卡）。`,
        };
      }
      refs.push({
        kind: spec.kind,
        path: `${spec.dir}/${latest.name}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        version: latest.version,
      });
    }
    return { ok: true, refs };
  }

  /**
   * 自动呈卡的应用证据（不采信模型自报）：
   * - A12b：应用验收归档 `docs/acceptance/<flowId>-acceptance-vN.md`（`archiveAcceptance` 生成）path+sha256；
   * - B3：该 B3 任务最后一份 done 报告 `evidence[]` 中真实存在的项目相对文件（逐路径重算字节 SHA-256）。
   */
  async fixedReleaseAutoEvidence(
    projectRoot: string,
    workflowId: string,
    stage: FixedReleaseTriggerStage,
    taskId: string,
  ): Promise<{ ok: true; evidence: { path: string; sha256: string }[] } | WorkflowServiceFailure> {
    if (stage === "A12b") {
      const ledger = await readWorkflowLedger(projectRoot);
      const started = ledger.events.find((event): event is Extract<WorkflowEvent, { kind: "workflow.started" }> =>
        event.kind === "workflow.started" && event.workflowId === workflowId);
      if (started === undefined) {
        return { ok: false, code: "release-workflow-not-ready", message: `workflow ${workflowId} 不存在。` };
      }
      const archive = await findAcceptanceArchive({ projectRoot, flowId: started.flowId, workflowId });
      if (archive === undefined) {
        return {
          ok: false,
          code: "release-workflow-not-ready",
          message: `A12 验收归档缺失（docs/acceptance/${started.flowId}-acceptance-vN.md）；不呈发布卡。`,
        };
      }
      return { ok: true, evidence: [{ path: archive.path, sha256: archive.sha256 }] };
    }
    const state = await readTaskState(projectRoot);
    const record = state.records.get(taskId);
    const report = record?.reports[record.reports.length - 1];
    if (report?.status !== "done") {
      return { ok: false, code: "release-workflow-not-ready", message: `B3 任务 ${taskId} 缺 done 报告；不呈发布卡。` };
    }
    const evidence: { path: string; sha256: string }[] = [];
    for (const rel of (report.evidence ?? []).filter(
      (item): item is string => typeof item === "string" && isProjectRelativeFileRef(item),
    )) {
      try {
        const bytes = await fs.promises.readFile(path.join(projectRoot, ...rel.split("/")));
        evidence.push({ path: rel, sha256: createHash("sha256").update(bytes).digest("hex") });
      } catch {
        return {
          ok: false,
          code: "release-workflow-not-ready",
          message: `B3 报告证据不可读：${rel}；不呈发布卡。`,
        };
      }
    }
    return { ok: true, evidence };
  }

  /**
   * 2026-10-30（3.4 / rework F1–F5）：`evidence_check` 只读证据检查——显式 criteriaRef、当前 run flow 绑定、
   * 角色模块证据范围、项目内路径；单文件/collection sidecar 均走真实检查；不执行项目脚本、不写盘。
   */
  async evidenceCheckText(projectRoot: string, roleId: string, input: EvidenceCheckInput): Promise<string> {
    const ref = input.criteriaRef;
    const artifactRaw = typeof input.artifact === "string" ? input.artifact : "";
    const artifact = validateEvidencePath(artifactRaw);
    const meta = typeof input.metaPath === "string" && input.metaPath.trim() !== "" ? validateEvidencePath(input.metaPath) : undefined;
    const base = { schema: "evidence-check/v1", roleId, artifact: artifact.ok ? artifact.path : artifactRaw.trim().replace(/\\/g, "/") };
    const fail = (code: string, missing: string[], docs: string[] = []): string => {
      const rejection = makeMechanicalRejection(code, missing, { docs });
      return JSON.stringify({ ...base, ok: false, code, rejection }, null, 2);
    };
    if (!artifact.ok) return fail("evidence-path-invalid", [artifact.reason], [artifactRaw]);
    if (meta !== undefined && !meta.ok) return fail("evidence-path-invalid", [meta.reason], [input.metaPath ?? ""]);
    if (ref === undefined) {
      return fail("criteria-version-unresolved", ["缺少显式 criteriaRef（path+sha256+version）；不取 latest"]);
    }
    const flowMatch = /^docs\/acceptance\/([a-z0-9][a-z0-9-]{0,62})-criteria-v[1-9]\d*\.md$/.exec(ref.path.replace(/\\/g, "/"));
    if (flowMatch === null) {
      return fail("criteria-ref-mismatch", [`criteriaRef 路径不合法：${ref.path}`], [ref.path]);
    }
    const refFlow = flowMatch[1]!;
    // F5②：ref 的 flow 必须等于当前 run 的 flow；无 run＝legacy（不绑定），多 active flow fail-closed。
    const listed = await listRunManifestsResult(projectRoot);
    if (!listed.ok) return fail(listed.code, [listed.reason]);
    const activeRuns = listed.manifests.filter((run) => run.state === "draft" || run.state === "pinned");
    const activeFlows = [...new Set(activeRuns.map((run) => run.flowId))];
    if (activeFlows.length > 1) {
      return fail("criteria-ref-mismatch", [`存在多个 active run flow（${activeFlows.join("、")}），无法唯一绑定当前 flow；不猜`]);
    }
    const currentFlow = activeFlows[0];
    if (currentFlow !== undefined && currentFlow !== refFlow) {
      return fail("criteria-ref-mismatch", [`criteriaRef flow=${refFlow} 与当前 run flow=${currentFlow} 不一致`], [ref.path]);
    }
    const flowId = currentFlow ?? refFlow;
    const run = activeRuns.find((item) => item.flowId === flowId);
    const criteria = await loadCriteria(projectRoot, flowId, ref);
    if (!criteria.ok) return fail(criteria.code, criteria.rejection.missing, criteria.rejection.docs);
    const criteriaSummary = { path: criteria.doc.path, flowId: criteria.doc.flowId, version: criteria.doc.version, status: criteria.doc.status, sha256: criteria.doc.sha256 };
    // F2：按调用角色裁剪——只允许本角色模块目录内的证据（含 metaPath/collection item）。
    const scope = await this.evidenceScopeRoots(projectRoot, flowId, run, roleId);
    if (scope.length === 0) {
      return fail("evidence-scope-denied", [`调用角色 ${roleId} 没有可用的模块证据范围（名单模块/任务 modulePaths 均缺失）`], [criteria.doc.path]);
    }
    const metaRel = meta?.path ?? `${artifact.path}.meta.json`;
    if (!isWithinEvidenceRoots(artifact.path, scope)) {
      return fail("evidence-scope-denied", [`artifact ${artifact.path} 不在调用角色 ${roleId} 的模块证据范围（${scope.join("、")}）`], [criteria.doc.path]);
    }
    if (!isWithinEvidenceRoots(metaRel, scope)) {
      return fail("evidence-scope-denied", [`metaPath ${metaRel} 不在调用角色 ${roleId} 的模块证据范围（${scope.join("、")}）`], [criteria.doc.path]);
    }
    if (input.acId === undefined || input.acId.trim() === "") {
      try {
        const actual = await readArtifact(projectRoot, artifact.path);
        let parsedMeta: unknown;
        try { parsedMeta = parseEvidenceMeta(await fs.promises.readFile(path.join(projectRoot, metaRel), "utf8")); } catch { parsedMeta = null; }
        return JSON.stringify({ ...base, ok: true, criteria: criteriaSummary, actual: { path: actual.path, bytes: actual.bytes, lines: actual.lines, sha256: actual.sha256 }, meta: parsedMeta, note: "未给 acId，未做 criteria/P0 关联" }, null, 2);
      } catch (error) {
        return fail("criteria-missing", [`artifact 不可读：${error instanceof Error ? error.message : String(error)}`], [artifact.path]);
      }
    }
    const render = (result: Awaited<ReturnType<typeof checkEvidence>>): string => JSON.stringify({
      ...base,
      ok: result.ok && result.valid,
      valid: result.valid,
      unverified: result.unverified,
      legacy: result.legacy,
      p0Ignored: result.p0Ignored,
      priority: result.priority,
      criteria: criteriaSummary,
      actual: result.actual !== undefined ? { path: result.actual.path, bytes: result.actual.bytes, lines: result.actual.lines, sha256: result.actual.sha256 } : undefined,
      sidecar: result.meta,
      claims: result.claims,
      mismatch: result.mismatch,
      ...(result.rejection !== undefined ? { code: result.rejection.code, rejection: result.rejection } : {}),
    }, null, 2);
    // F1：真实会话/工具路径显式识别 collection sidecar 并路由 checkEvidenceCollection。
    let metaText: string | undefined;
    try { metaText = await fs.promises.readFile(path.join(projectRoot, metaRel), "utf8"); } catch { metaText = undefined; }
    const parsedMeta = metaText === undefined ? undefined : parseEvidenceMeta(metaText);
    if (parsedMeta !== undefined && parsedMeta.ok && "collection" in parsedMeta.meta) {
      const collection = await checkEvidenceCollection({
        projectRoot,
        acId: input.acId,
        criteria: criteria.doc,
        metaPath: metaRel,
        scopeRoots: scope,
      });
      return render(collection);
    }
    const result = await checkEvidence({
      projectRoot,
      acId: input.acId,
      criteria: criteria.doc,
      artifact: artifact.path,
      metaPath: metaRel,
      scopeRoots: scope,
    });
    return render(result);
  }

  /**
   * F2（3.4 rework）+ R3（dispatch-guardrail-relax）：调用角色的模块证据范围。
   * 优先级：① 任务自身 modulePaths（有 flow 按 flow/run；无 flow 按 to/creator/moduleId 兼容匹配）
   * → ② 适用 roster 模块根（pinned 仅在锚定且可读时，否则 latest）→ ③ 角色边界根仅空集兜底且限定在
   * roster 模块路径内并记录来源；都没有 → []（调用方 evidence-scope-denied fail-closed）。
   */
  async evidenceScopeRoots(projectRoot: string, flowId: string, run: RunManifest | undefined, roleId: string): Promise<string[]> {
    const roots = new Set<string>();
    if (roleId === "") return [];
    let listing = this.deps.getListing(projectRoot);
    if (listing === undefined) {
      await this.refreshListingNow(projectRoot);
      listing = this.deps.getListing(projectRoot);
    }
    const role = listing?.roles.find((item) => item.roleId === roleId);
    const verifier = roleId === "verifier";
    const builtIn = role?.builtIn === true || isBuiltInGovernanceRoleId(roleId);
    const creatorAllowed: ReadonlySet<"chief" | "convener"> =
      verifier ? new Set(["chief", "convener"]) : builtIn ? new Set(["chief"]) : new Set(["convener"]);
    const roleKindKnown = verifier || builtIn || role !== undefined;

    const state = await this.readTasks(projectRoot);
    for (const record of state.records.values()) {
      const created = record.created;
      if (created === undefined || created.to !== roleId) continue;
      if (created.flowId !== undefined) {
        if (created.flowId !== flowId) continue;
        if (run !== undefined && created.runId !== run.runId) continue;
      } else {
        // P1-R-04-R1：无 flow 锚点任务按 to + creator + moduleId 兼容匹配；不以当前 roster 为门槛。
        if (!roleKindKnown || created.moduleId === undefined || !creatorAllowed.has(created.from)) continue;
      }
      for (const raw of created.modulePaths ?? []) {
        const normalized = validateEvidencePath(raw);
        if (normalized.ok) roots.add(normalized.path);
      }
    }

    let roster: ProjectRoster | undefined;
    if (run !== undefined && run.state === "pinned") {
      const pinned = await loadPinnedRoster(projectRoot, run);
      if (pinned.ok) {
        roster = pinned.roster;
      } else {
        const latest = await loadLatestRoster({ projectRoot, flowId });
        if (latest.ok) roster = latest.roster;
      }
    } else {
      const latest = await loadLatestRoster({ projectRoot, flowId });
      if (latest.ok) roster = latest.roster;
    }
    if (roster !== undefined) {
      const roleInRoster = roster.roles.find((item) => item.id === roleId);
      for (const moduleId of roleInRoster?.modules ?? []) {
        const module = roster.modules.find((item) => item.id === moduleId);
        for (const raw of module?.paths ?? []) {
          const normalized = validateEvidencePath(raw);
          if (normalized.ok) roots.add(normalized.path);
        }
      }
    }

    if (roots.size === 0 && roster !== undefined) {
      const directoryModules = roster.modules
        .flatMap((module) => module.paths)
        .map((raw) => raw.trim().replace(/\\/g, "/"))
        .filter((raw) => raw.endsWith("/"))
        .map((raw) => raw.replace(/\/+$/, ""));
      const boundaryRoots: string[] = [];
      for (const entry of role?.boundary.entries ?? []) {
        if (entry.root !== "project") continue;
        if (entry.kind !== "directory" && entry.kind !== "conditional-directory") continue;
        const normalized = validateEvidencePath(entry.path);
        if (!normalized.ok) continue;
        const dir = normalized.path;
        const withinModule = directoryModules.some((moduleDir) => dir === moduleDir || dir.startsWith(`${moduleDir}/`));
        if (withinModule) boundaryRoots.push(dir);
      }
      for (const boundaryRoot of boundaryRoots) roots.add(boundaryRoot);
      if (boundaryRoots.length > 0) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).record(
          "evidence.scope.boundary-fallback",
          { sourceRoleId: roleId, count: boundaryRoots.length },
        );
      }
    }
    return [...roots].sort();
  }

  /**
   * 2026-10-30（3.2）：`contract_check` 只读契约速查。不写盘、不放行；只返回调用角色可见信息。
   * 2026-11-03（contract schema query）：`topic` 模式**第一句早退**到静态 schema 文本——
   * 早退前不读 listing/run、不写盘；legacy 路径逐字不变。
   * 2026-11-11（T3 B7.1，RR2 根因）：按**调用会话的 workflow 模式**分流——fixed 会话走
   * `contractCheckTextFixed`（无 legacy run/pin 口径、stage-request 必填项）；topic 早退对两模式
   * 都逐字不变；legacy/single（缺省 mode）输出逐字不变。
   */
  async contractCheckText(projectRoot: string, callerRoleId: string, input: ContractCheckInput, mode: WorkflowMode = "legacy"): Promise<string> {
    if (input.topic !== undefined) return contractSchemaText(input.topic);
    if (mode === "fixed") return this.contractCheckTextFixed(projectRoot, callerRoleId, input);
    let listing = this.deps.getListing(projectRoot);
    if (!listing) await this.refreshListingNow(projectRoot);
    listing = this.deps.getListing(projectRoot);
    const requestedRole = typeof input.roleId === "string" && input.roleId.trim() !== "" ? input.roleId.trim() : callerRoleId;
    const roleId = callerRoleId !== "" ? callerRoleId : requestedRole;
    const role = listing?.roles.find((item) => item.roleId === roleId);
    let flowId = typeof input.flowId === "string" && input.flowId.trim() !== "" ? input.flowId.trim() : "";
    const listed = await listRunManifestsResult(projectRoot);
    let run: RunManifest | null = null;
    if (listed.ok) {
      const active = listed.manifests.filter((manifest) => manifest.state === "pinned" || manifest.state === "draft");
      if (flowId !== "") {
        run = active.find((manifest) => manifest.flowId === flowId && manifest.state === "pinned")
          ?? active.find((manifest) => manifest.flowId === flowId)
          ?? null;
      } else {
        run = active.find((manifest) => manifest.state === "pinned") ?? active[0] ?? null;
        flowId = run?.flowId ?? "";
      }
    }
    const lines: string[] = ["contract_check（只读速查；查询不构成放行/授权）"];
    if (!listed.ok) {
      lines.push(`run manifest：读取失败（${listed.reason}）——不要猜测 pin 状态。`);
    } else if (run === null) {
      lines.push(`run：legacy（未冻结）${flowId !== "" ? `｜flow ${flowId}` : ""}`);
    } else {
      lines.push(`run：${run.runId}｜flow ${run.flowId}｜state=${run.state}${run.pinnedAt !== undefined ? `｜pinnedAt ${run.pinnedAt}` : ""}`);
      for (const [kind, ref] of Object.entries(run.documents)) {
        if (ref === null || ref === undefined) lines.push(`文档 ${kind}：null（未钉）`);
        else lines.push(`文档 ${kind}：${ref.path}${ref.sha256 !== undefined ? `（sha256 ${ref.sha256.slice(0, 12)}…）` : ""}`);
      }
      if (run.execution.teamPlan !== null) lines.push(`teamPlan：${run.execution.teamPlan.path}（${run.execution.teamPlan.schema ?? "schema?"}）`);
      if (run.execution.flow !== null) lines.push(`flow：${run.execution.flow.path}（v${run.execution.flow.version}）`);
      if (run.roles !== undefined) lines.push(`项目角色：${run.roles.join("、")}`);
    }
    const roster = run !== null && run.state === "pinned"
      ? await loadPinnedRoster(projectRoot, run)
      : flowId !== "" ? await loadLatestRoster({ projectRoot, flowId }) : undefined;
    if (roster !== undefined && !roster.ok) lines.push(`roster：不可用（${roster.reason}）`);
    const roleModules = roster !== undefined && roster.ok && role !== undefined
      ? roster.roster.roles.find((entry) => entry.id === roleId)?.modules ?? []
      : [];
    const moduleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";
    const module = roster !== undefined && roster.ok && moduleId !== "" ? roster.roster.modules.find((entry) => entry.id === moduleId) : undefined;
    lines.push(`角色：${roleId || "（未指定）"}${role !== undefined ? `｜builtIn=${role.builtIn === true}` : ""}`);
    if (roleModules.length > 0) lines.push(`名下模块：${roleModules.join("、")}`);
    if (module !== undefined) lines.push(`指定模块：${module.id}｜paths=${module.paths.join("、")}｜category=${module.category}`);
    const boundaryEntries = role?.boundary?.entries ?? [];
    if (boundaryEntries.length > 0) {
      lines.push(`可写边界：${boundaryEntries.map((entry) => `${entry.path}（${entry.kind}）`).slice(0, 12).join("、")}`);
    } else {
      lines.push("可写边界：（未枚举/内置治理角色按既有拓扑与治理规则）");
    }
    lines.push("禁止：角色卡/、其他角色模块、.ans/、治理/版本化文档覆盖、docs/product|proposals|contracts|scheduling|quality|verification（越界拒绝）");
    // 2026-10-30（§5A）：意图入口契约按角色裁剪（chief/product/rapporteur/nominator），
    // 并给出当前项目可核对的事实（期望 docs/intents/<intentId>.md 是否存在/匹配）。
    const intentContractRoles = new Set<IntentContractRole>(["chief", "product", "rapporteur", "nominator"]);
    if (intentContractRoles.has(roleId as IntentContractRole)) {
      lines.push("意图入口契约（与角色卡/判断拒绝文案同源）：");
      lines.push(intentEntryContractText(roleId as IntentContractRole));
      const intentFlowId = flowId !== "" ? flowId : run?.flowId ?? "";
      if (intentFlowId !== "") {
        const intentFacts = await readIntentEntryFacts({
          projectRoot,
          flowId: intentFlowId,
          ...(run?.documents.intent?.path !== undefined ? { productIntentPath: run.documents.intent.path } : {}),
          ...(run?.documents.proposal?.path !== undefined ? { proposalPath: run.documents.proposal.path } : {}),
        });
        const idsMatch = intentFacts.intentIdsMatch === undefined ? "无法核对" : intentFacts.intentIdsMatch ? "yes" : "no";
        if (intentFacts.resolutionError !== undefined) {
          lines.push(`意图入口解析：${intentFacts.resolutionError.code}｜${intentFacts.resolutionError.detail}`);
        } else if (intentFacts.resolvedIntentId === undefined) {
          lines.push("意图入口事实：未解析到 intentId（产品意图/提案 frontmatter 缺 intentId）");
        } else {
          const entryMatch = intentFacts.entryMatches === undefined ? "无法核对" : intentFacts.entryMatches ? "yes" : "no";
          lines.push(
            `意图入口事实：intentId=${intentFacts.resolvedIntentId}｜来源=${intentFacts.resolutionSource ?? "未知"}｜入口 ${intentFacts.intentEntryPath}｜存在=${intentFacts.intentEntryExists === true ? "yes" : "no"}｜intentId 匹配=${entryMatch}`,
          );
        }
        if (intentFacts.productIntentId !== undefined || intentFacts.proposalIntentId !== undefined) {
          lines.push(
            `意图来源：产品意图=${intentFacts.productIntentId ?? "缺失"}｜提案=${intentFacts.proposalIntentId ?? "缺失"}｜一致性=${idsMatch}`,
          );
        }
      }
    }
    const kind = input.taskKind;
    const required: Record<string, string[]> = {
      dispatch: ["flowId", "targetRoleId", "runId(pinned)", "moduleId(运营派实现)", "modulePaths"],
      appointment: ["flowId", "multiple=true", "options=名单角色", "D3 选中含 env-bootstrap(未省略)"],
      write: ["targetRoleId", "decisionId", "paths 全部在角色卡/<target>/", "boundary 模块路径一致"],
      acceptance: ["flowId", "runId/pinnedDocs", "moduleId/modulePaths", "证据按模块归档"],
      shell: ["command/argv", "cwd", "显式写目标在角色边界", "执行后审计"],
    };
    if (kind !== undefined) {
      // B7.1：`stage-request` 是 fixed 专用 code（legacy 五项输出逐字不变；未知 kind 不再抛）。
      const items = required[kind];
      lines.push(items !== undefined
        ? `taskKind ${kind} 必填：${items.join("；")}`
        : `taskKind ${kind}：fixed 路径专用（当前项目按 legacy 解析）；legacy 请用 dispatch/appointment/write/acceptance/shell`);
    } else lines.push("taskKind：可传 dispatch/appointment/write/acceptance/shell 获取对应必填项");
    lines.push("常见拒绝 → 下一步：");
    for (const item of rejectionMapSnapshot().slice(0, 14)) lines.push(`- ${item.code} → ${item.owner}${item.retryable ? "（可重试）" : "（不可原样重试）"}`);
    const text = lines.join("\n");
    const max = 4096;
    if (Buffer.byteLength(text, "utf8") <= max) return text;
    const marker = "\n…（已截断）";
    let truncated = text;
    while (Buffer.byteLength(truncated, "utf8") > max - Buffer.byteLength(marker, "utf8") && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}${marker}`;
  }

  /**
   * T3 B7.1（2026-11-11，RR2 根因 `contract-check-legacy-wording-in-fixed`）：**fixed 会话的契约速查**。
   * 固定路径**没有 legacy run/pin**：不读取、不输出 `.ans/runs` manifest/pin 状态（RR2 中固定幕僚拿到的
   * `run：legacy`/`runId(pinned)` 口径是误导根因）；`taskKind dispatch` 必填改为 stage-request 口径
   * （A12a/A12b/verifier 直派按 workflowId/stage）；常见拒绝补充 fixed 稳定码。
   * 只读、不写盘、不授予放行/派发权；`topic` 早退与 4 KiB 截断与 legacy 同型。
   */
  async contractCheckTextFixed(projectRoot: string, callerRoleId: string, input: ContractCheckInput): Promise<string> {
    let listing = this.deps.getListing(projectRoot);
    if (!listing) await this.refreshListingNow(projectRoot);
    listing = this.deps.getListing(projectRoot);
    const requestedRole = typeof input.roleId === "string" && input.roleId.trim() !== "" ? input.roleId.trim() : callerRoleId;
    const roleId = callerRoleId !== "" ? callerRoleId : requestedRole;
    const role = listing?.roles.find((item) => item.roleId === roleId);
    const flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
    const lines: string[] = ["contract_check（只读速查；查询不构成放行/授权）"];
    lines.push("run：fixed（无 run；固定路径由 stage-request 驱动）");
    // fixed 角色/模块事实：只读名单文档（不读 `.ans/runs` manifest；pin 状态不适用）。
    const roster = flowId !== "" ? await loadLatestRoster({ projectRoot, flowId }) : undefined;
    if (roster !== undefined && !roster.ok) lines.push(`roster：不可用（${roster.reason}）`);
    const roleModules = roster !== undefined && roster.ok && role !== undefined
      ? roster.roster.roles.find((entry) => entry.id === roleId)?.modules ?? []
      : [];
    const moduleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";
    const module = roster !== undefined && roster.ok && moduleId !== "" ? roster.roster.modules.find((entry) => entry.id === moduleId) : undefined;
    lines.push(`角色：${roleId || "（未指定）"}${role !== undefined ? `｜builtIn=${role.builtIn === true}` : ""}`);
    if (roleModules.length > 0) lines.push(`名下模块：${roleModules.join("、")}`);
    if (module !== undefined) lines.push(`指定模块：${module.id}｜paths=${module.paths.join("、")}｜category=${module.category}`);
    const boundaryEntries = role?.boundary?.entries ?? [];
    if (boundaryEntries.length > 0) {
      lines.push(`可写边界：${boundaryEntries.map((entry) => `${entry.path}（${entry.kind}）`).slice(0, 12).join("、")}`);
    } else {
      lines.push("可写边界：（未枚举/内置治理角色按既有拓扑与治理规则）");
    }
    lines.push("禁止：角色卡/、其他角色模块、.ans/、治理/版本化文档覆盖、docs/product|proposals|contracts|scheduling|quality|verification（越界拒绝）");
    // 意图入口契约：与 legacy 同源（只读文档事实；不依赖 run 的 documents.intent/proposal 钉）。
    const intentContractRoles = new Set<IntentContractRole>(["chief", "product", "rapporteur", "nominator"]);
    if (intentContractRoles.has(roleId as IntentContractRole)) {
      lines.push("意图入口契约（与角色卡/判断拒绝文案同源）：");
      lines.push(intentEntryContractText(roleId as IntentContractRole));
      if (flowId !== "") {
        const intentFacts = await readIntentEntryFacts({ projectRoot, flowId });
        const idsMatch = intentFacts.intentIdsMatch === undefined ? "无法核对" : intentFacts.intentIdsMatch ? "yes" : "no";
        if (intentFacts.resolutionError !== undefined) {
          lines.push(`意图入口解析：${intentFacts.resolutionError.code}｜${intentFacts.resolutionError.detail}`);
        } else if (intentFacts.resolvedIntentId === undefined) {
          lines.push("意图入口事实：未解析到 intentId（产品意图/提案 frontmatter 缺 intentId）");
        } else {
          const entryMatch = intentFacts.entryMatches === undefined ? "无法核对" : intentFacts.entryMatches ? "yes" : "no";
          lines.push(
            `意图入口事实：intentId=${intentFacts.resolvedIntentId}｜来源=${intentFacts.resolutionSource ?? "未知"}｜入口 ${intentFacts.intentEntryPath}｜存在=${intentFacts.intentEntryExists === true ? "yes" : "no"}｜intentId 匹配=${entryMatch}`,
          );
        }
        if (intentFacts.productIntentId !== undefined || intentFacts.proposalIntentId !== undefined) {
          lines.push(
            `意图来源：产品意图=${intentFacts.productIntentId ?? "缺失"}｜提案=${intentFacts.proposalIntentId ?? "缺失"}｜一致性=${idsMatch}`,
          );
        }
      }
    }
    const kind = input.taskKind;
    if (kind === "dispatch" || kind === "stage-request") {
      lines.push('taskKind dispatch 必填：flowId；roleId；taskKind:"stage-request"；workflowAction:"advance"；workflowPath:"A"|"B"；stage；sideEffect:"read-only"；task（A12a/A12b/verifier 直派任务按 workflowId/stage）');
    } else if (kind !== undefined) {
      lines.push(`taskKind ${kind}：legacy 专属（fixed 路径不使用；fixed 请用 dispatch 的 stage-request 或带 workflowId/stage 的 fixed 任务）`);
    } else {
      lines.push("taskKind：可传 dispatch 获取固定路径必填项（stage-request 或带 workflowId/stage 的 fixed 任务）");
    }
    lines.push("常见拒绝 → 下一步：");
    // fixed 稳定码先列（截断时也不丢；legacy 快照随后补充，与 legacy 视图同一 code→owner 格式）。
    const fixedRejections: ReadonlyArray<readonly [string, string, boolean]> = [
      ["stage-request-invalid", "chief", true],
      ["stage-request-required", "convener", false],
      ["workflow-path-required", "chief", true],
      ["stage-transition-invalid", "chief", true],
    ];
    const snapshot = rejectionMapSnapshot();
    for (const [code, owner, retryable] of fixedRejections) {
      if (snapshot.some((item) => item.code === code)) continue;
      lines.push(`- ${code} → ${owner}${retryable ? "（可重试）" : "（不可原样重试）"}`);
    }
    for (const item of snapshot.slice(0, 14)) lines.push(`- ${item.code} → ${item.owner}${item.retryable ? "（可重试）" : "（不可原样重试）"}`);
    const text = lines.join("\n");
    const max = 4096;
    if (Buffer.byteLength(text, "utf8") <= max) return text;
    const marker = "\n…（已截断）";
    let truncated = text;
    while (Buffer.byteLength(truncated, "utf8") > max - Buffer.byteLength(marker, "utf8") && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}${marker}`;
  }

  /**
   * 2026-11-09（文档格式权威说明，方案 P1.2 §3.1/§4.1；B1 AC-10）：`doc_format` 只读数据源。
   * **第一条语句静态早退**到注册表（索引/详情均为纯静态公开文本）：早退前不调用 `getListing`/
   * `refreshListingNow`、不做任何 `readFile`/`writeFile`、不读 run/项目/角色事实；不写盘、不入队、
   * 不改会话状态；返回值与输入确定（同一输入恒返回同一文本）。查询结果**不构成放行/授权**。
   * 与 `contractCheckText` 同型（S1：返回纯文本 `Promise<string>`）；`{ok,message}` 信封与 8 KiB
   * 防御性截断由运行时核心工具包装层统一生成。`part` 原样透传（`fields|example|errors`；render 型
   * 由注册表整段返回并标注）；未知 id 由注册表返回「未知格式 …；可用：…」纯文本（数据源不抛）。
   */
  async docFormatText(projectRoot: string, callerRoleId: string, input: DocFormatInput): Promise<string> {
    if (input.format === undefined || input.format.trim() === "") return docFormatIndexText();
    return docFormatSpecText(input.format, input.part);
  }
}

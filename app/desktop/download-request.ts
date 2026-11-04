// app/desktop/download-request.ts
// 2026-11-04 download-requests C1：下载申请卡片组装与工具能力包装。
//
// 职责边界（P1 提案 Revision 2 / PM 复审 recommend approval）：
//  · 只做 Interface 层「卡片组装 + 能力位包装 + best-effort 回执投影」；
//  · **不做** URL/协议/凭据/DNS/IP/文件名/上限/重定向判定，不读写 `.ans/**`、指令账本或
//    `downloads.jsonl`，不直接联网/写文件——全部判定/执行/审计在 B1 Pipeline；
//  · B1 生成 `downloadId`（C1 不生成/不传入）；`requestId` 由 SessionManager 的
//    `requestIdFor` 生成并通过 `withRequestLifecycle` 生命周期使用；
//  · 判断上下文（`governanceFacts`/`downloadFacts`/`attribution`/`factsAvailable`）由 B1 构造，
//    C1 原样映射到 `metadata.judgeContext`；`factsAvailable:false` ⇒ 省略整个 judgeContext +
//    `judgeNotice`（直接客户卡），绝不设置 `unavailableReason`；
//  · 所有用户可见文案经 `mainT`（A2 冻结 key），本模块不含硬编码中文文案。

import { createDiagnosticLogger, type DiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import {
  DOWNLOAD_DEFAULT_MAX_BYTES,
  type DownloadApprovalSource,
  type DownloadRequestInput,
  type DownloadRequestResult,
  type RequestDownloadFn,
} from "../../src/model/download.ts";
import type {
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
  GovernanceJudgeAudit,
  GovernanceJudgeContext,
  RuntimeKind,
} from "../../src/model/runtime.ts";
import type {
  DownloadApproval,
  DownloadApprovalOutcome,
  DownloadApprovalRequest,
  DownloadJudgeAudit,
  DownloadRequestRuntime,
  DownloadRunResult,
} from "../../src/pipeline/orchestration/download-request.ts";
import { mainT } from "./i18n.ts";

/** 下载卡组装结果：卡片请求 + 通道元数据 + 事实不可用时的 judgeNotice。 */
export interface DownloadCardPresentation {
  request: CustomerInputRequest;
  metadata: CustomerInputMetadata;
  judgeNotice?: string;
}

/** 能力包装所需的会话事实（由 SessionManager 每会话绑定）。 */
export interface RequestDownloadCapabilityDeps {
  /** 每会话 B1 运行时（已绑定 projectRoot/roleId/runtime/present/takeDownloadDirective）。 */
  runtime: DownloadRequestRuntime;
  /** 会话引擎（能力包装不做判定，仅用于回执缺省与诊断）。 */
  runtimeKind: RuntimeKind;
  roleId: string;
  /** 会话生命周期信号（dispose/窗口关闭）；与每次调用的 `metadata.signal` 组合。 */
  lifetimeSignal?: AbortSignal;
  /** 真实归属键（当前会话通常没有；缺省 ⇒ 由 B1 合成 "download"）。 */
  attribution?: { flowId?: string; intentId?: string; taskId?: string };
  /** best-effort 系统行（`delivery-note`）；失败不得影响下载结果。 */
  emitNotice: (summary: string) => void;
  logger?: DiagnosticLogger;
}

/**
 * 把 B1 冻结的 `DownloadApprovalRequest` 映射为既有客户确认卡：
 *  - `kind:"confirm"` + `cardKind:"download"`（不扩 `GovernanceConfirmCardKind`）；
 *  - `metadata.judgeContext` 仅当 `factsAvailable` 且事实齐全时设置，字段原样来自 B1；
 *  - 合成 `attribution.flowId`（`flowIdIsSynthetic:true`）不写 `request.flowId`/`metadata.flowId`；
 *  - 事实不可用 ⇒ 无 judgeContext + `judgeNotice`（AC-28 的主路径）。
 */
export function buildDownloadCardRequest(request: DownloadApprovalRequest): DownloadCardPresentation {
  const facts = request.downloadFacts;
  const attribution = request.attribution;
  const factsAvailable =
    request.factsAvailable === true &&
    request.governanceFacts !== undefined &&
    request.governanceFacts !== null &&
    facts !== undefined &&
    facts !== null &&
    attribution !== undefined &&
    attribution !== null;

  const realFlowId = factsAvailable && attribution.flowIdIsSynthetic !== true ? attribution.flowId : undefined;
  const judgeContext: GovernanceJudgeContext | undefined = factsAvailable
    ? {
        flowId: attribution.flowId,
        facts: request.governanceFacts,
        download: facts,
        ...(request.toolCallId !== undefined ? { toolCallId: request.toolCallId } : {}),
        ...(request.turnId !== undefined ? { turnId: request.turnId } : {}),
        ...(attribution.intentId !== undefined ? { intentId: attribution.intentId } : {}),
      }
    : undefined;

  const metadata: CustomerInputMetadata = {
    cardKind: "download",
    ...(request.toolCallId !== undefined ? { toolCallId: request.toolCallId } : {}),
    ...(request.turnId !== undefined ? { turnId: request.turnId } : {}),
    ...(realFlowId !== undefined ? { flowId: realFlowId } : {}),
    ...(factsAvailable && attribution.intentId !== undefined ? { intentId: attribution.intentId } : {}),
    ...(factsAvailable && attribution.taskId !== undefined ? { taskId: attribution.taskId } : {}),
    ...(judgeContext !== undefined ? { judgeContext } : {}),
  };

  const cardKind = "download" as const;
  const requestBody: CustomerInputRequest = {
    kind: "confirm",
    title: mainT("main.download.card.title"),
    cardKind,
    ...(realFlowId !== undefined ? { flowId: realFlowId } : {}),
    preview: factsAvailable
      ? buildPreview(request, facts)
      : mainT("main.download.error.factsMissing"),
  };

  return {
    request: requestBody,
    metadata,
    ...(judgeContext === undefined ? { judgeNotice: mainT("main.download.error.factsMissing") } : {}),
  };
}

function maxMbOf(maxBytes: number): string {
  const value = maxBytes / (1024 * 1024);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function hostText(host: string, port: number | undefined): string {
  return port === undefined ? host : `${host}:${port}`;
}

function buildPreview(request: DownloadApprovalRequest, facts: NonNullable<DownloadApprovalRequest["downloadFacts"]>): string {
  const lines: string[] = [
    mainT("main.download.card.role", { role: request.roleId }),
    mainT("main.download.card.purpose", { purpose: facts.purpose }),
    mainT("main.download.card.url", { url: facts.url }),
    mainT("main.download.card.host", { host: hostText(facts.host, facts.port) }),
    mainT("main.download.card.resolvedIps", { ips: facts.resolvedIps.join(", ") }),
    ...(facts.resolvedIpsTruncated
      ? [mainT("main.download.card.resolvedIpsTruncated", { total: facts.resolvedIpsTotal, shown: facts.resolvedIps.length })]
      : []),
    mainT("main.download.card.filename", { filename: facts.filename }),
    mainT("main.download.card.sizePolicy", { maxMb: maxMbOf(facts.maxBytes) }),
    mainT("main.download.card.redirectPolicy"),
    mainT("main.download.card.mechanical.scheme", { scheme: facts.scheme }),
    mainT("main.download.card.mechanical.publicHost"),
    mainT("main.download.card.mechanical.publicIps"),
  ];
  return lines.join("\n");
}

function judgeAuditOf(audit: GovernanceJudgeAudit | undefined): DownloadJudgeAudit | undefined {
  if (audit === undefined) return undefined;
  return {
    engine: audit.engine,
    ...(audit.model !== undefined ? { model: audit.model } : {}),
    reasonCode: audit.reasonCode,
    ...(audit.durationMs !== undefined ? { durationMs: audit.durationMs } : {}),
    ...(audit.readCalls !== undefined ? { readCalls: audit.readCalls } : {}),
    ...(audit.readBytes !== undefined ? { readBytes: audit.readBytes } : {}),
  };
}

/**
 * 把客户通道三态映射为 B1 冻结的 `DownloadApprovalOutcome`。
 * 归属只从**事实**判定：`judge` 审计或 `operatorId:"judge:"` ⇒ judge；其余 ⇒ customer。
 * `initiator-aborted`（轮次/窗口中止且未呈现）⇒ aborted。不伪造 requestId（由 `onPresented` 主来源）。
 */
export function toDownloadApprovalOutcome(outcome: CustomerInputOutcome | null | undefined): DownloadApprovalOutcome {
  if (outcome === null || outcome === undefined) {
    return { decision: "unavailable", reason: "channel-no-outcome" };
  }
  const operatorId = "operatorId" in outcome && typeof outcome.operatorId === "string" ? outcome.operatorId : undefined;
  if (outcome.outcome === "answered") {
    const by: "customer" | "judge" =
      outcome.judge !== undefined || (operatorId !== undefined && operatorId.startsWith("judge:")) ? "judge" : "customer";
    const judge = judgeAuditOf(outcome.judge);
    if (outcome.value.confirmed === true) {
      return {
        decision: "approved",
        by,
        ...(judge !== undefined ? { judge } : {}),
      };
    }
    return {
      decision: "declined",
      by,
      reason: "unconfirmed",
      ...(judge !== undefined ? { judge } : {}),
    };
  }
  if (outcome.outcome === "declined") {
    if (
      outcome.notPresented === true &&
      (outcome.reason === "initiator-aborted" || operatorId === "system:initiator-aborted")
    ) {
      return { decision: "aborted" };
    }
    const by: "customer" | "judge" = operatorId !== undefined && operatorId.startsWith("judge:") ? "judge" : "customer";
    return {
      decision: "declined",
      by,
      ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    };
  }
  return {
    decision: "unavailable",
    ...(outcome.reason !== undefined ? { reason: outcome.reason } : {}),
  };
}

/** 能力入口：每次工具调用转调 B1 运行时一次（不重试），并把结构化结果转为 A1 回执。 */
export function createRequestDownloadCapability(deps: RequestDownloadCapabilityDeps): RequestDownloadFn {
  const logger =
    deps.logger ??
    createDiagnosticLogger({ component: "desktop.download", roleId: deps.roleId });

  const emit = (summary: string): void => {
    try {
      deps.emitNotice(summary);
    } catch (error) {
      logger.error("download.notice.failed", error, {});
    }
  };

  return async (input: DownloadRequestInput, metadata): Promise<DownloadRequestResult> => {
    const signals: AbortSignal[] = [];
    if (metadata?.signal !== undefined) signals.push(metadata.signal);
    if (deps.lifetimeSignal !== undefined) signals.push(deps.lifetimeSignal);
    const signal = signals.length === 0 ? undefined : AbortSignal.any(signals);

    let result: DownloadRunResult;
    try {
      result = await deps.runtime.download({
        url: input.url,
        purpose: input.purpose,
        ...(input.filename !== undefined ? { filename: input.filename } : {}),
        ...(metadata?.toolCallId !== undefined ? { toolCallId: metadata.toolCallId } : {}),
        ...(metadata?.turnId !== undefined ? { turnId: metadata.turnId } : {}),
        ...(signal !== undefined ? { signal } : {}),
        ...(deps.attribution !== undefined ? { attribution: deps.attribution } : {}),
      });
    } catch (error) {
      logger.error("download.capability.failed", error, {});
      return {
        ok: false,
        message: mainT("main.download.notice.failed", {
          code: "download-unavailable",
          reason: mainT("main.download.error.unavailable"),
        }),
        code: "download-unavailable",
      };
    }

    if (result.ok) {
      emitSuccessNotice(result, input, emit);
      return {
        ok: true,
        message: result.message,
        path: result.path,
        bytes: result.bytes,
        sha256: result.sha256,
        finalUrl: result.finalUrl,
        approval: toApprovalSource(result.approval, deps.runtimeKind),
      };
    }
    emitFailureNotice(result, input, emit);
    return { ok: false, message: result.message, code: result.code };
  };
}

function toApprovalSource(approval: DownloadApproval, fallback: RuntimeKind): DownloadApprovalSource {
  if (approval.kind === "customer") return { by: "customer" };
  if (approval.kind === "judge") {
    const engine = isRuntimeKind(approval.judge?.engine) ? approval.judge!.engine : fallback;
    return {
      by: "judge",
      engine,
      ...(approval.judge?.model !== undefined ? { model: approval.judge.model } : {}),
    };
  }
  return { by: "directive", directiveId: approval.directiveId ?? "" };
}

function isRuntimeKind(value: unknown): value is RuntimeKind {
  return value === "pi" || value === "claude" || value === "codex" || value === "demo";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function emitSuccessNotice(
  result: Extract<DownloadRunResult, { ok: true }>,
  input: DownloadRequestInput,
  emit: (summary: string) => void,
): void {
  const host = hostOf(result.finalUrl) || hostOf(input.url);
  const source =
    result.approval.kind === "customer"
      ? mainT("ui.request.toCustomer")
      : result.approval.kind === "judge"
        ? mainT("ui.request.toJudge")
        : mainT("main.download.notice.directiveSource", { id: result.approval.directiveId ?? "" });
  emit(
    mainT("main.download.notice.completed", {
      host,
      path: result.path,
      bytes: result.bytes,
      sha: result.sha256,
      source,
    }),
  );
  // G1 A：不自动修改 .gitignore，完成后提示客户自行添加（A2 冻结 key）。
  emit(mainT("main.download.notice.gitignoreHint"));
}

function emitFailureNotice(
  result: Extract<DownloadRunResult, { ok: false }>,
  input: DownloadRequestInput,
  emit: (summary: string) => void,
): void {
  emit(
    mainT("main.download.notice.failed", {
      code: result.code,
      reason: downloadFailureReason(result, input),
    }),
  );
}

function downloadFailureReason(result: Extract<DownloadRunResult, { ok: false }>, input: DownloadRequestInput): string {
  switch (result.code) {
    case "download-invalid-arguments":
      return mainT("main.download.error.invalidArguments");
    case "download-unsafe-url":
      return mainT("main.download.error.unsafeUrl", { detail: result.detail ?? "" });
    case "download-dns-failed":
      return mainT("main.download.error.dnsFailed", { host: hostOf(input.url) });
    case "download-denied-by-directive":
      return mainT("main.download.error.deniedByDirective", {
        id: result.approval?.kind === "directive" ? (result.approval.directiveId ?? "") : "",
      });
    case "download-declined":
      return mainT("main.download.error.declined");
    case "download-unavailable":
      return mainT("main.download.error.unavailable");
    case "download-facts-missing":
      return mainT("main.download.error.factsMissing");
    case "download-rebinding-detected":
      return mainT("main.download.error.rebindingDetected");
    case "download-redirect-cross-host":
      return mainT("main.download.error.redirectCrossHost", { target: result.redirectTo ?? "" });
    case "download-http-error":
      return mainT("main.download.error.httpError", {
        detail:
          result.httpStatus !== undefined
            ? `${result.httpStatus}${result.detail !== undefined ? ` ${result.detail}` : ""}`
            : (result.detail ?? ""),
      });
    case "download-too-large":
      return mainT("main.download.error.tooLarge", { maxMb: maxMbOf(DOWNLOAD_DEFAULT_MAX_BYTES) });
    case "download-unsupported-encoding":
      return mainT("main.download.error.unsupportedEncoding", { encoding: result.detail ?? "" });
    case "download-timeout":
      return mainT("main.download.error.timeout");
    case "download-network-error":
      return mainT("main.download.error.networkError");
    case "download-write-failed":
      return mainT("main.download.error.writeFailed");
    case "download-busy":
      return mainT("main.download.error.busy");
    case "download-aborted":
      return mainT("main.download.error.aborted");
    default:
      return mainT("main.download.error.unavailable");
  }
}

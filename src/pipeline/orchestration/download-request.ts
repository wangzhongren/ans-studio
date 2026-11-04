// src/pipeline/orchestration/download-request.ts
// 下载文件申请 —— Pipeline 公共句柄（2026-11-04，download-requests B1）。
//
// 职责（B1 提案 Revision 1 §3.3）：每会话运行时——
//   · `download`：参数复核 → 卡片前 DNS 全量解析/公网判表 → 事实（DownloadJudgeFacts +
//     GovernanceJudgeFacts + 归属键）→ 预授权（注入 TakeDownloadDirectiveFn）→ 卡片呈现
//     （注入 DownloadApprovalPresenter）→ 每项目执行并发 ≤2 → 执行（Service + Provider）→
//     审计（downloads.jsonl）→ 结构化结果；
//   · `ready`/`consumerEpoch`：G8 A epoch 建立/只读状态（面板旧指令标注）；
//   · `dispose`：中止本运行时在途下载并释放执行槽。
//
// 依赖方向：本文件 → Service 公共出口 + Provider 公共出口 + 编排私有 common（mechanical/judge facts）；
// Model 只读。**不写** `request.*`（卡片路径由 C1 的 withRequestLifecycle 负责）、不 import app/**。
//
// 冻结声明（B1 退出）：本文件导出的类型/工厂、presenter 形状（present(request,hooks)+onPresented）、
// 每会话生命周期、B1 生成 downloadId、`DownloadRunResult`、`takeDownloadDirective`、epoch 语义由 B1
// 冻结；C1/C2/D1 只按此消费。生产工厂无测试缝；`createDownloadRequestRuntimeForTest` 仅测试装配。

import { randomUUID } from "node:crypto";

import { createDiagnosticLogger, type DiagnosticLogger } from "../../common/shared/diagnostics.ts";
import { compareKey, normalizeLexical } from "../../common/shared/path-primitives.ts";
import { buildGovernanceJudgeFacts } from "../../common/编排/governance-judge-facts.ts";
import { makeMechanicalRejection } from "../../common/编排/mechanical-rejection.ts";
import type {
  DownloadErrorCode,
  DownloadJudgeFacts,
} from "../../model/download.ts";
import {
  DOWNLOAD_FILENAME_MAX_CHARS,
  DOWNLOAD_PURPOSE_MAX_BYTES,
} from "../../model/download.ts";
import {
  GOVERNANCE_SLUG_PATTERN,
  type GovernanceJudgeFacts,
  type RuntimeKind,
} from "../../model/runtime.ts";
import {
  createDownloadPolicy,
  type DownloadPolicy,
} from "../../service/download/public/download-service.ts";
import {
  createDownloadConsumerEpochStore,
  createDownloadLedger,
  createNodeDownloadTransportProduction,
  createNodeHostResolver,
  type DownloadConsumerEpochState,
  type DownloadConsumerEpochStore,
  type DownloadLedger,
  type DownloadLedgerEventV1,
  type DownloadTransport,
  type HostResolver,
  type PinnedAddress,
} from "../../provider/download/public/download-provider.ts";
import type { TakeDownloadDirectiveFn } from "./customer-directive.ts";

// —————————————————————— 公共契约（B1 冻结） ——————————————————————

export interface DownloadAttributionInput {
  flowId?: string;
  intentId?: string;
  taskId?: string;
}

export interface DownloadAttribution {
  flowId: string;
  flowIdIsSynthetic: boolean;
  intentId?: string;
  taskId?: string;
}

export interface DownloadRunInput {
  url: string;
  filename?: string;
  purpose: string;
  toolCallId?: string;
  turnId?: string;
  signal?: AbortSignal;
  /** C1 从会话/任务上下文提供的真实归属键；全缺/非法 ⇒ B1 合成 `"download"`。 */
  attribution?: DownloadAttributionInput;
}

export interface DownloadApprovalRequest {
  /** B1 生成（唯一审计 id；C1 不生成/不传入）。 */
  downloadId: string;
  roleId: string;
  runtime?: RuntimeKind;
  toolCallId?: string;
  turnId?: string;
  /** 卡片路径恒 true；false ⇒ C1 必须省略整个 judgeContext 并附 judgeNotice（直接客户卡）。 */
  factsAvailable: boolean;
  /** B1 构造的最小 GovernanceJudgeFacts（buildGovernanceJudgeFacts({flowId})，不读账本）。 */
  governanceFacts: GovernanceJudgeFacts;
  /** 卡片/判断事实（A1 Model 类型；已按 ≤2KiB 约束）。 */
  downloadFacts: DownloadJudgeFacts;
  attribution: DownloadAttribution;
  policy: { redirectPolicy: "same-host"; maxRedirects: number };
  signal?: AbortSignal;
}

export interface DownloadJudgeAudit {
  engine: string;
  model?: string;
  reasonCode: string;
  durationMs?: number;
  readCalls?: number;
  readBytes?: number;
}

export type DownloadApprovalOutcome =
  | { decision: "approved"; by: "customer" | "judge"; requestId?: string; judge?: DownloadJudgeAudit }
  | { decision: "declined"; by: "customer" | "judge"; requestId?: string; reason?: string; judge?: DownloadJudgeAudit }
  | { decision: "unavailable"; reason?: string }
  | { decision: "aborted" };

export interface DownloadApprovalPresenter {
  /** 冻结形状：只在需要卡片时调用；`onPresented` 是 requestId 的**主来源**。 */
  present(
    request: DownloadApprovalRequest,
    hooks: { onPresented(info: { requestId: string }): void },
  ): Promise<DownloadApprovalOutcome>;
}

export interface DownloadApproval {
  kind: "customer" | "judge" | "directive";
  requestId?: string;
  directiveId?: string;
  judge?: DownloadJudgeAudit;
}

export type DownloadRunResult =
  | {
      ok: true;
      downloadId: string;
      requestId?: string;
      path: string;
      bytes: number;
      sha256: string;
      finalUrl: string;
      approval: DownloadApproval;
      message: string;
    }
  | {
      ok: false;
      downloadId: string;
      requestId?: string;
      code: DownloadErrorCode;
      message: string;
      httpStatus?: number;
      detail?: string;
      redirectTo?: string;
      approval?: DownloadApproval;
    };

export interface DownloadRequestRuntime {
  /** G8 A epoch 建立/读取；失败不抛。 */
  ready(): Promise<void>;
  /** 面板（C1）读点；不重写不可读文件（missing 会在 ready/consumerEpoch 首次调用时创建）。 */
  consumerEpoch(): Promise<DownloadConsumerEpochState>;
  /** 不抛：所有失败以 `ok:false` + 稳定 code 返回。 */
  download(input: DownloadRunInput): Promise<DownloadRunResult>;
  /** 会话级收口：中止本运行时在途下载、释放本项目执行槽；幂等。 */
  dispose(): Promise<void>;
}

export interface DownloadRequestOptions {
  /** C1 从已验证会话 target 绑定；不接受模型参数。 */
  projectRoot: string;
  /** **每会话绑定**；多角色/多会话各自一份运行时。 */
  roleId: string;
  runtime?: RuntimeKind;
  /** G8 A epoch 记录（C1 传 app.getVersion()/package 版本）。 */
  appVersion: string;
  /** 每会话卡片通道。 */
  present: DownloadApprovalPresenter;
  /** C1 接 `customerDirective.takeDownloadDirective`。 */
  takeDownloadDirective?: TakeDownloadDirectiveFn;
  /** 部署方 env（缺省 process.env）。 */
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  diagnostics?: DiagnosticLogger;
}

export interface DownloadRequestTestSeams {
  resolver?: HostResolver;
  provider?: DownloadTransport;
  policy?: DownloadPolicy;
  ledger?: DownloadLedger;
  epochStore?: DownloadConsumerEpochStore;
}

// —————————————————————— 内部实现 ——————————————————————

const DEFAULT_MISSING: Record<DownloadErrorCode, string> = {
  "download-invalid-arguments": "url/filename/purpose 参数不合法",
  "download-unsafe-url": "URL 未通过安全检查（协议/凭据/主机/解析地址）",
  "download-dns-failed": "域名解析失败或超时",
  "download-denied-by-directive": "客户审批指令拒绝该域名",
  "download-declined": "审批被拒绝",
  "download-unavailable": "客户/判断通道不可用",
  "download-facts-missing": "判断所需下载事实缺失",
  "download-rebinding-detected": "连接地址不在执行时校验集合（疑似 DNS rebinding）",
  "download-redirect-cross-host": "跨域重定向",
  "download-http-error": "HTTP 请求失败",
  "download-too-large": "文件超过大小上限",
  "download-unsupported-encoding": "服务器返回非 identity 内容编码",
  "download-timeout": "下载超时（连接/空闲/总时限）",
  "download-network-error": "网络或 TLS 失败",
  "download-write-failed": "写入 download/ 失败",
  "download-busy": "并发下载已达上限（每项目 2 个）",
  "download-aborted": "轮次中止",
};

/** 模块级：每项目执行并发计数（跨会话运行时共享；进程内）。 */
const ACTIVE_BY_PROJECT = new Map<string, number>();

function acquireSlot(key: string, limit: number): boolean {
  const active = ACTIVE_BY_PROJECT.get(key) ?? 0;
  if (active >= limit) return false;
  ACTIVE_BY_PROJECT.set(key, active + 1);
  return true;
}

function releaseSlot(key: string): void {
  const active = ACTIVE_BY_PROJECT.get(key) ?? 0;
  if (active <= 1) ACTIVE_BY_PROJECT.delete(key);
  else ACTIVE_BY_PROJECT.set(key, active - 1);
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (byteLength(text) <= maxBytes) return text;
  const buffer = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes - 3));
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

function slug(value: unknown): string | undefined {
  return typeof value === "string" && new RegExp(GOVERNANCE_SLUG_PATTERN).test(value) ? value : undefined;
}

function resolveAttribution(input: DownloadRunInput): DownloadAttribution {
  const flowId = slug(input.attribution?.flowId) ?? slug(input.attribution?.intentId) ?? slug(input.attribution?.taskId);
  const intentId = typeof input.attribution?.intentId === "string" && input.attribution.intentId.trim() !== ""
    ? input.attribution.intentId.trim()
    : undefined;
  const taskId = typeof input.attribution?.taskId === "string" && input.attribution.taskId.trim() !== ""
    ? input.attribution.taskId.trim()
    : undefined;
  if (flowId !== undefined) {
    return {
      flowId,
      flowIdIsSynthetic: false,
      ...(intentId !== undefined ? { intentId } : {}),
      ...(taskId !== undefined ? { taskId } : {}),
    };
  }
  return {
    flowId: "download",
    flowIdIsSynthetic: true,
    ...(intentId !== undefined ? { intentId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
  };
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal {
  if (a !== undefined && b !== undefined) return AbortSignal.any([a, b]);
  if (a !== undefined) return a;
  if (b !== undefined) return b;
  return new AbortController().signal;
}


export function createDownloadRequestRuntime(options: DownloadRequestOptions): DownloadRequestRuntime {
  return buildRuntime(options, {});
}

/** 仅测试装配：唯一允许注入假 resolver/provider/policy/ledger/epochStore 的入口。 */
export function createDownloadRequestRuntimeForTest(
  options: DownloadRequestOptions,
  seams: DownloadRequestTestSeams,
): DownloadRequestRuntime {
  return buildRuntime(options, seams);
}

function buildRuntime(options: DownloadRequestOptions, seams: DownloadRequestTestSeams): DownloadRequestRuntime {
  if (typeof options.projectRoot !== "string" || options.projectRoot.trim() === "") {
    throw new Error("下载运行时：projectRoot 必须是非空字符串");
  }
  if (typeof options.roleId !== "string" || options.roleId.trim() === "") {
    throw new Error("下载运行时：roleId 必须是非空字符串");
  }
  if (typeof options.appVersion !== "string" || options.appVersion.trim() === "") {
    throw new Error("下载运行时：appVersion 必须是非空字符串");
  }
  if (options.present === undefined || typeof options.present.present !== "function") {
    throw new Error("下载运行时：presenter 必须实现 present()");
  }

  const now = options.now ?? (() => new Date());
  const log = options.diagnostics ?? createDiagnosticLogger({
    component: "download",
    projectRoot: options.projectRoot,
    roleId: options.roleId,
  });
  const policy = seams.policy ?? createDownloadPolicy({ ...(options.env !== undefined ? { env: options.env } : {}) });
  const { config, diagnostics } = policy.resolveConfig(options.env);
  for (const code of diagnostics) log.record("download.config.invalid", { reasonCode: code });
  const resolver = seams.resolver ?? createNodeHostResolver();
  const transport = seams.provider ?? createNodeDownloadTransportProduction();
  const ledger = seams.ledger ?? createDownloadLedger(options.projectRoot);
  const epochStore = seams.epochStore ?? createDownloadConsumerEpochStore(options.projectRoot);
  const projectKey = compareKey(normalizeLexical(options.projectRoot));

  let epoch: DownloadConsumerEpochState | undefined;
  let readyPromise: Promise<void> | undefined;
  let disposed = false;
  const runtimeController = new AbortController();
  const controllers = new Set<AbortController>();
  const inflight = new Set<Promise<void>>();

  async function ensureReady(): Promise<void> {
    if (readyPromise !== undefined) return readyPromise;
    readyPromise = (async () => {
      try {
        epoch = await epochStore.ensure(options.appVersion);
      } catch (error) {
        epoch = { state: "unreadable", reason: error instanceof Error ? error.message : "epoch-ensure-failed" };
      }
      if (epoch.state === "ready") {
        log.record("download.epoch.ready", { state: "ready", outcome: "ready" });
      } else {
        log.record("download.epoch.unavailable", {
          state: epoch.state,
          outcome: "no-preauth",
          ...(epoch.state === "unreadable" ? { reasonCode: epoch.reason } : {}),
        });
      }
    })();
    return readyPromise;
  }

  async function appendAudit(event: DownloadLedgerEventV1): Promise<void> {
    try {
      const result = await ledger.append(event);
      if (!result.ok) {
        log.record("download.ledger.write-failed", { outcome: "ignored", ...(result.message !== undefined ? { reasonCode: truncateUtf8(result.message, 200) } : {}) });
      }
    } catch (error) {
      log.error("download.ledger.write-failed", error, { outcome: "ignored" });
    }
  }

  function failureMessage(code: DownloadErrorCode, detail?: string): string {
    const rejection = makeMechanicalRejection(code, [detail ?? DEFAULT_MISSING[code]]);
    return (
      `request_download：未下载（${rejection.missing.join("；")}）。` +
      `下一步：${rejection.action} 谁来做：${rejection.owner}。` +
      `${rejection.retryable ? " 修正后可原样重试。" : " 当前不可原样重试。"} [技术 code：${rejection.code}]`
    );
  }

  interface FailureContext {
    downloadId: string;
    attemptId: string;
    requestId?: string;
    approval?: DownloadApproval;
    detail?: string;
    httpStatus?: number;
    redirectTo?: string;
    bytesWritten?: number;
    audit: boolean;
  }

  async function finishFailure(code: DownloadErrorCode, ctx: FailureContext): Promise<DownloadRunResult> {
    if (ctx.audit) {
      await appendAudit({
        version: 1,
        kind: "download.failed",
        attemptId: ctx.attemptId,
        code,
        ...(ctx.httpStatus !== undefined ? { httpStatus: ctx.httpStatus } : {}),
        bytesWritten: ctx.bytesWritten ?? 0,
        ...(ctx.detail !== undefined ? { detail: truncateUtf8(ctx.detail, 500) } : {}),
        at: now().toISOString(),
      });
    }
    log.record("download.failed", {
      ...(ctx.requestId !== undefined ? { requestId: ctx.requestId } : {}),
      reasonCode: code,
      outcome: "failed",
      errorCode: code,
      ...(ctx.httpStatus !== undefined ? { count: ctx.httpStatus } : {}),
      ...(ctx.bytesWritten !== undefined ? { bytes: ctx.bytesWritten } : {}),
    });
    return {
      ok: false,
      downloadId: ctx.downloadId,
      ...(ctx.requestId !== undefined ? { requestId: ctx.requestId } : {}),
      code,
      message: failureMessage(code, ctx.detail),
      ...(ctx.httpStatus !== undefined ? { httpStatus: ctx.httpStatus } : {}),
      ...(ctx.detail !== undefined ? { detail: truncateUtf8(ctx.detail, 500) } : {}),
      ...(ctx.redirectTo !== undefined ? { redirectTo: ctx.redirectTo } : {}),
      ...(ctx.approval !== undefined ? { approval: ctx.approval } : {}),
    };
  }

  async function doDownload(input: DownloadRunInput, downloadId: string, attemptId: string): Promise<DownloadRunResult> {
    if (disposed) {
      return finishFailure("download-aborted", { downloadId, attemptId, detail: "disposed", audit: false });
    }
    // 参数复核（防御；工具层已校验）：purpose/filename 形状 ⇒ invalid-arguments；URL 交给 checkUrl。
    if (input === null || typeof input !== "object") {
      return finishFailure("download-invalid-arguments", { downloadId, attemptId, detail: "input 必须是对象", audit: false });
    }
    const purposeRaw = input.purpose;
    if (typeof purposeRaw !== "string" || purposeRaw.trim() === "" || byteLength(purposeRaw.trim()) > DOWNLOAD_PURPOSE_MAX_BYTES) {
      return finishFailure("download-invalid-arguments", { downloadId, attemptId, detail: "purpose 必须非空且不超过 1024 字节", audit: false });
    }
    const purpose = purposeRaw.trim();
    let callerFilename: string | undefined;
    if (input.filename !== undefined) {
      if (typeof input.filename !== "string" || Array.from(input.filename).length > DOWNLOAD_FILENAME_MAX_CHARS) {
        return finishFailure("download-invalid-arguments", { downloadId, attemptId, detail: "filename 非法或超过 128 字符", audit: false });
      }
      if (/[\u0000-\u001f\u007f]/.test(input.filename) || input.filename.includes("/") || input.filename.includes("\\")) {
        return finishFailure("download-invalid-arguments", { downloadId, attemptId, detail: "filename 不得含控制字符/路径分隔符", audit: false });
      }
      if (input.filename.trim() !== "") callerFilename = input.filename;
    }
    const check = policy.checkUrl(input.url);
    if (!check.ok) {
      return finishFailure("download-unsafe-url", { downloadId, attemptId, detail: check.reason, audit: false });
    }
    const url = check.url;
    const lifecycle = combineSignals(input.signal, runtimeController.signal);
    if (lifecycle.aborted) {
      return finishFailure("download-aborted", { downloadId, attemptId, detail: "aborted", audit: false });
    }

    await ensureReady();
    const suggestion = policy.suggestCardFilename({
      url,
      ...(callerFilename !== undefined ? { callerSuggestion: callerFilename } : {}),
      now: now(),
    });
    await appendAudit({
      version: 1,
      kind: "download.requested",
      downloadId,
      roleId: options.roleId,
      ...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
      url: url.url,
      host: url.host,
      scheme: url.scheme,
      ...(url.port !== undefined ? { port: url.port } : {}),
      ...(callerFilename !== undefined ? { filenameSuggestion: callerFilename } : {}),
      purpose,
      maxBytes: config.maxBytes,
      at: now().toISOString(),
    });
    log.record("download.requested", { outcome: "requested" });
    const ctxBase = { downloadId, attemptId, audit: true };
    let requestId: string | undefined;
    let approval: DownloadApproval | undefined;
    let decided = false;

    const resolvePublic = async (
      host: string,
      signal: AbortSignal | undefined,
    ): Promise<{ ok: true; addresses: PinnedAddress[] } | { ok: false; code: DownloadErrorCode; detail: string }> => {
      if (isAborted(signal)) return { ok: false, code: "download-aborted", detail: "aborted" };
      let resolved;
      try {
        resolved = await resolver.resolve(host, { ...(signal !== undefined ? { signal } : {}) });
      } catch (error) {
        if (isAborted(signal)) return { ok: false, code: "download-aborted", detail: "aborted" };
        const code = (error as { code?: unknown } | undefined)?.code;
        return {
          ok: false,
          code: code === "download-aborted" ? "download-aborted" : "download-dns-failed",
          detail: typeof code === "string" ? code : "dns failed",
        };
      }
      for (const entry of resolved.addresses) {
        const decision = policy.classifyIp(entry.address);
        if (!decision.allowed) {
          return {
            ok: false,
            code: "download-unsafe-url",
            detail: `${entry.address}: ${decision.reason ?? "not-public"}`,
          };
        }
      }
      return { ok: true, addresses: resolved.addresses };
    };

    // 卡片前 DNS（只解析地址，不连目标主机）。
    const pre = await resolvePublic(url.host, lifecycle);
    if (!pre.ok) {
      return finishFailure(pre.code, { ...ctxBase, detail: pre.detail });
    }
    const total = pre.addresses.length;
    const shown = pre.addresses.slice(0, 8).map((entry) => entry.address);
    const downloadFacts = policy.boundJudgeFacts({
      url: url.url,
      scheme: url.scheme,
      host: url.host,
      ...(url.port !== undefined ? { port: url.port } : {}),
      resolvedIps: shown,
      resolvedIpsTotal: total,
      resolvedIpsTruncated: total > shown.length,
      filename: suggestion.name,
      filenameSource: suggestion.source,
      purpose,
      maxBytes: config.maxBytes,
      mechanical: {
        schemeOk: true,
        credentialsAbsent: true,
        hostPublic: true,
        ipsPublic: true,
        filenameSafe: true,
      },
    });
    const attribution = resolveAttribution(input);
    const governanceFacts = buildGovernanceJudgeFacts({ flowId: attribution.flowId });

    // 预授权（deny 优先/allow 补足/once 已由 takeDownloadDirective 消费）。
    if (options.takeDownloadDirective !== undefined && epoch?.state === "ready") {
      let decision;
      try {
        decision = await options.takeDownloadDirective({
          host: url.host,
          enabledAt: epoch.enabledAt,
          ...(input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {}),
        });
      } catch {
        decision = undefined;
      }
      if (decision !== undefined) {
        approval = { kind: "directive", directiveId: decision.id };
        decided = true;
        await appendAudit({
          version: 1,
          kind: "download.decided",
          downloadId,
          by: "directive",
          directiveId: decision.id,
          presented: false,
          at: now().toISOString(),
        });
        log.record("download.decided", { outcome: decision.action, reasonCode: "directive", count: 0 });
        if (decision.action === "deny") {
          return finishFailure("download-denied-by-directive", {
            ...ctxBase,
            approval,
            detail: `客户审批指令 #${decision.id} 拒绝域名 ${url.host}`,
          });
        }
      }
    }

    if (!decided) {
      const request: DownloadApprovalRequest = {
        downloadId,
        roleId: options.roleId,
        ...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
        ...(input.toolCallId !== undefined ? { toolCallId: input.toolCallId } : {}),
        ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
        factsAvailable: true,
        governanceFacts,
        downloadFacts,
        attribution,
        policy: { redirectPolicy: "same-host", maxRedirects: config.maxRedirects },
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
      };
      const presented = { requestId: undefined as string | undefined };
      let outcome: DownloadApprovalOutcome;
      try {
        outcome = await options.present.present(
          { ...request, signal: lifecycle },
          {
            onPresented(info) {
              presented.requestId = info.requestId;
            },
          },
        );
      } catch (error) {
        return finishFailure("download-unavailable", {
          ...ctxBase,
          detail: error instanceof Error ? error.message : "presenter failed",
        });
      }
      if (outcome.decision === "unavailable") {
        return finishFailure("download-unavailable", { ...ctxBase, ...(outcome.reason !== undefined ? { detail: outcome.reason } : {}) });
      }
      if (outcome.decision === "aborted") {
        return finishFailure("download-aborted", { ...ctxBase, detail: "presenter aborted" });
      }
      requestId = presented.requestId ?? outcome.requestId;
      if (requestId === undefined) {
        return finishFailure("download-unavailable", { ...ctxBase, detail: "presenter 未提供 requestId" });
      }
      approval = outcome.by === "judge"
        ? { kind: "judge", requestId, ...(outcome.judge !== undefined ? { judge: outcome.judge } : {}) }
        : { kind: "customer", requestId };
      decided = true;
      await appendAudit({
        version: 1,
        kind: "download.decided",
        downloadId,
        requestId,
        by: outcome.by,
        presented: true,
        ...(outcome.judge !== undefined ? { judge: outcome.judge } : {}),
        at: now().toISOString(),
      });
      log.record("download.decided", { requestId, outcome: "approved-or-declined", reasonCode: outcome.by, count: 1 });
      if (outcome.decision === "declined") {
        return finishFailure("download-declined", {
          ...ctxBase,
          requestId,
          approval,
          ...(outcome.reason !== undefined ? { detail: outcome.reason } : {}),
        });
      }
    }

    // 每项目执行并发 ≤2（跨会话共享）。
    if (!acquireSlot(projectKey, config.executableConcurrency)) {
      return finishFailure("download-busy", { ...ctxBase, requestId, approval, detail: `并发上限 ${config.executableConcurrency}` });
    }
    const controller = new AbortController();
    controllers.add(controller);
    const signal = combineSignals(lifecycle, controller.signal);
    try {
      // 执行时重新解析/重新判表/钉扎（与卡片前不同的公网结果允许）。
      const exec = await resolvePublic(url.host, signal);
      if (!exec.ok) {
        return finishFailure(exec.code, { ...ctxBase, requestId, approval, detail: exec.detail });
      }
      const pinned = exec.addresses;
      const execution = await transport.execute({
        url: url.url,
        pinnedAddresses: pinned,
        limits: config,
        projectRoot: options.projectRoot,
        signal,
        onRedirect: async ({ fromUrl, toUrl }) => {
          const target = policy.checkUrl(toUrl);
          if (!target.ok) {
            return { action: "stop", code: target.code, detail: target.reason, redirectTo: policy.sanitizeUrlForMessage(toUrl) };
          }
          const from = policy.checkUrl(fromUrl);
          if (from.ok) {
            const decision = policy.isSameHostForRedirect(from.url, target.url);
            if (decision.kind === "scheme-downgrade") {
              return {
                action: "stop",
                code: "download-unsafe-url",
                detail: "https→http 降级",
                redirectTo: policy.sanitizeUrlForMessage(toUrl),
              };
            }
            if (decision.kind === "cross-host") {
              const redirectTo = policy.sanitizeUrlForMessage(toUrl);
              return {
                action: "stop",
                code: "download-redirect-cross-host",
                detail: `跨域重定向到 ${redirectTo}`,
                redirectTo,
              };
            }
          }
          const redirect = await resolvePublic(target.url.host, signal);
          if (!redirect.ok) {
            return {
              action: "stop",
              code: redirect.code,
              detail: redirect.detail,
              redirectTo: policy.sanitizeUrlForMessage(toUrl),
            };
          }
          return { action: "follow", url: target.url.url, pinnedAddresses: redirect.addresses };
        },
        planFile: async ({ finalUrl, contentDisposition }) => {
          const finalCheck = policy.checkUrl(finalUrl);
          const finalUrlValue = finalCheck.ok ? finalCheck.url : url;
          const picked = policy.resolveExecutionFilename({
            ...(contentDisposition !== undefined ? { contentDisposition } : {}),
            url: finalUrlValue,
            ...(callerFilename !== undefined ? { callerSuggestion: callerFilename } : {}),
            now: now(),
          });
          return { fileName: picked.name };
        },
        onStarted: async ({ finalUrl, fileName }) => {
          await appendAudit({
            version: 1,
            kind: "download.started",
            attemptId,
            downloadId,
            finalUrl: policy.sanitizeUrlForMessage(finalUrl),
            filename: fileName,
            at: now().toISOString(),
          });
          log.record("download.started", { outcome: "started" });
        },
      });
      if (!execution.ok) {
        return finishFailure(execution.code, {
          ...ctxBase,
          requestId,
          approval,
          ...(execution.httpStatus !== undefined ? { httpStatus: execution.httpStatus } : {}),
          ...(execution.detail !== undefined ? { detail: execution.detail } : {}),
          ...(execution.redirectTo !== undefined ? { redirectTo: execution.redirectTo } : {}),
          bytesWritten: execution.bytesWritten,
        });
      }
      await appendAudit({
        version: 1,
        kind: "download.completed",
        attemptId,
        bytes: execution.bytes,
        sha256: execution.sha256,
        path: execution.pathRel,
        durationMs: execution.durationMs,
        ...(execution.contentType !== undefined ? { contentType: execution.contentType } : {}),
        at: now().toISOString(),
      });
      log.record("download.completed", {
        ...(requestId !== undefined ? { requestId } : {}),
        outcome: "completed",
        bytes: execution.bytes,
        durationMs: execution.durationMs,
      });
      if (approval === undefined) {
        return finishFailure("download-unavailable", { ...ctxBase, requestId, detail: "approval missing" });
      }
      const sourceText = approval.kind === "customer"
        ? "客户"
        : approval.kind === "judge"
          ? `判断 agent（${approval.judge?.engine ?? options.runtime ?? "demo"}）`
          : `审批指令 #${approval.directiveId ?? "d-unknown"}`;
      return {
        ok: true,
        downloadId,
        ...(requestId !== undefined ? { requestId } : {}),
        path: execution.pathRel,
        bytes: execution.bytes,
        sha256: execution.sha256,
        finalUrl: execution.finalUrl,
        approval,
        message:
          `request_download：已下载「${url.host}」→ ${execution.pathRel}` +
          `（${execution.bytes} 字节，sha256 ${execution.sha256}，最终 URL：${policy.sanitizeUrlForMessage(execution.finalUrl)}，` +
          `审批来源：${sourceText}）。`,
      };
    } finally {
      controllers.delete(controller);
      releaseSlot(projectKey);
    }
  }

  async function download(input: DownloadRunInput): Promise<DownloadRunResult> {
    const downloadId = `dl-${randomUUID()}`;
    const attemptId = `dl-a-${randomUUID()}`;
    let tracked: Promise<void>;
    const task = doDownload(input, downloadId, attemptId).catch((error: unknown) =>
      finishFailure("download-unavailable", {
        downloadId,
        attemptId,
        detail: error instanceof Error ? error.message : "unexpected error",
        audit: true,
      }),
    );
    tracked = task.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      inflight.delete(tracked);
    });
    inflight.add(tracked);
    return task;
  }

  return {
    ready: ensureReady,
    consumerEpoch: async () => {
      await ensureReady();
      return epoch ?? { state: "unreadable", reason: "not-initialized" };
    },
    download,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      runtimeController.abort("disposed");
      for (const controller of controllers) controller.abort("disposed");
      await Promise.allSettled([...inflight]);
      controllers.clear();
    },
  };
}

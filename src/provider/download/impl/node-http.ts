// src/provider/download/impl/node-http.ts
// 下载 Provider —— Node http/https 流式传输（2026-11-04，download-requests B1；方案 §5）。
//
// 安全要点：自定义 `lookup` 只返回执行时校验集合中的地址；连接后核对 `socket.remoteAddress`
// 属于该集合（否则 `download-rebinding-detected`）；逐跳重定向由 Pipeline 回调重新校验/解析/钉扎；
// 连接/空闲/总超时；`Accept-Encoding: identity`；仅 200 写盘；TLS 默认校验且无关闭开关。
// 无自动重试：每个 hop 只发一次请求。测试缝（lookupOverride/agent/now）只在 impl 工厂暴露，
// 公共出口的生产工厂不提供。

import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import type { LookupFunction, Socket } from "node:net";
import { isIP } from "node:net";

import type { DownloadErrorCode } from "../../../model/download.ts";
import {
  DownloadProviderError,
  type DownloadTransport,
  type PinnedAddress,
  type TransportRequest,
  type TransportResult,
} from "../abstract/download-provider.ts";
import { createDownloadSink, type DownloadSink, type DownloadSinkHooks } from "./file-sink.ts";

/** 测试装配选项（生产工厂不暴露）。 */
export interface NodeDownloadTransportOptions {
  /** 仅测试：替换钉扎 lookup（模拟 rebinding/连接地址不在集合）。 */
  lookupOverride?: (
    hostname: string,
    options: { all?: boolean; family?: number },
    callback: (error: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void,
  ) => void;
  /** 仅测试：自定义 Agent（连接超时测试）。 */
  agent?: http.Agent | false;
  /** 测试时钟（durationMs）。 */
  now?: () => number;
  /** 仅测试：file sink 故障注入（rename/写盘失败）；生产工厂不暴露。 */
  fileSinkHooks?: DownloadSinkHooks;
}

const USER_AGENT = "ANS-Download/1";
const ERROR_BODY_DISCARD_BYTES = 16 * 1024;

function normalizeAddressKey(address: string): string {
  let value = address.trim().toLowerCase();
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  if (value.startsWith("::ffff:")) {
    const v4 = value.slice("::ffff:".length);
    if (isIP(v4) === 4) return v4;
  }
  return value;
}

function pinnedKeySet(addresses: readonly PinnedAddress[]): Set<string> {
  return new Set(addresses.map((entry) => normalizeAddressKey(entry.address)));
}

function makePinnedLookup(
  addresses: readonly PinnedAddress[],
  override: NodeDownloadTransportOptions["lookupOverride"],
): LookupFunction {
  if (override !== undefined) return override as unknown as LookupFunction;
  const list = addresses.map((entry) => ({ address: entry.address, family: entry.family }));
  return ((hostname: string, options: { all?: boolean; family?: number }, callback: (...args: unknown[]) => void) => {
    if (options.all === true) {
      callback(null, list);
      return;
    }
    const first = list[0]!;
    callback(null, first.address, first.family);
  }) as unknown as LookupFunction;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function mapAbortReason(reason: unknown): { code: DownloadErrorCode; detail?: string } {
  if (reason === "total" || reason === "connect" || reason === "idle") {
    return { code: "download-timeout", detail: String(reason) };
  }
  return { code: "download-aborted" };
}

function mapNetworkError(error: unknown): { code: DownloadErrorCode; detail?: string } {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return { code: "download-network-error", ...(typeof code === "string" ? { detail: code } : {}) };
}

interface HopSuccess {
  kind: "success";
  result: Extract<TransportResult, { ok: true }>;
}
interface HopFailure {
  kind: "failure";
  result: Extract<TransportResult, { ok: false }>;
}
interface HopRedirect {
  kind: "redirect";
  url: string;
  pinnedAddresses: readonly PinnedAddress[];
}
type HopOutcome = HopSuccess | HopFailure | HopRedirect;

export function createNodeDownloadTransport(options: NodeDownloadTransportOptions = {}): DownloadTransport {
  const now = options.now ?? (() => Date.now());

  async function performHop(
    request: TransportRequest,
    outer: AbortController,
    hopIndex: number,
  ): Promise<HopOutcome> {
    let parsed: URL;
    try {
      parsed = new URL(request.url);
    } catch {
      return { kind: "failure", result: { ok: false, code: "download-http-error", bytesWritten: 0, detail: "invalid-url" } };
    }
    const isHttps = parsed.protocol === "https:";
    const hostname = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
    const servername = isHttps && isIP(hostname) === 0 ? hostname : undefined;
    const hopController = new AbortController();
    const onOuterAbort = (): void => {
      if (!hopController.signal.aborted) hopController.abort(outer.signal.reason);
    };
    if (outer.signal.aborted) onOuterAbort();
    outer.signal.addEventListener("abort", onOuterAbort, { once: true });

    let settled = false;
    let failureStarted = false;
    let requestRef: ClientRequest | undefined;
    let responseRef: IncomingMessage | undefined;
    let sink: DownloadSink | undefined;
    let bytesWritten = 0;
    let httpStatus: number | undefined;
    let connectTimer: NodeJS.Timeout | undefined;
    let idleTimer: NodeJS.Timeout | undefined;

    return await new Promise<HopOutcome>((resolve) => {
      const clearHopTimers = (): void => {
        if (connectTimer !== undefined) clearTimeout(connectTimer);
        if (idleTimer !== undefined) clearTimeout(idleTimer);
        connectTimer = undefined;
        idleTimer = undefined;
      };

      const settle = (outcome: HopOutcome): void => {
        if (settled) return;
        settled = true;
        clearHopTimers();
        outer.signal.removeEventListener("abort", onOuterAbort);
        resolve(outcome);
      };

      const fail = (code: DownloadErrorCode, detail?: string, redirectTo?: string): void => {
        if (settled || failureStarted) return;
        failureStarted = true;
        try {
          responseRef?.destroy();
        } catch {
          /* 清理尽力而为 */
        }
        try {
          requestRef?.destroy();
        } catch {
          /* 清理尽力而为 */
        }
        const finishFailure = async (): Promise<void> => {
          if (sink !== undefined) {
            try {
              await sink.abort();
            } catch {
              /* 清理尽力而为 */
            }
          }
          settle({
            kind: "failure",
            result: {
              ok: false,
              code,
              ...(httpStatus !== undefined ? { httpStatus } : {}),
              bytesWritten,
              ...(detail !== undefined ? { detail } : {}),
              ...(redirectTo !== undefined ? { redirectTo } : {}),
            },
          });
        };
        void finishFailure();
      };

      const failFromAbort = (): void => {
        const mapped = mapAbortReason(hopController.signal.reason);
        fail(mapped.code, mapped.detail);
      };
      hopController.signal.addEventListener("abort", failFromAbort, { once: true });

      const pinned = pinnedKeySet(request.pinnedAddresses);
      if (pinned.size === 0) {
        fail("download-network-error", "no-pinned-addresses");
        return;
      }
      const lookup = makePinnedLookup(request.pinnedAddresses, options.lookupOverride);
      const headers = {
        "Accept-Encoding": "identity",
        "User-Agent": USER_AGENT,
      };
      const requestOptions: RequestOptions = {
        protocol: parsed.protocol,
        hostname,
        port: parsed.port !== "" ? Number(parsed.port) : undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers,
        lookup,
        agent: options.agent ?? false,
        signal: hopController.signal,
      };

      const onResponse = (res: IncomingMessage): void => {
        if (settled) {
          res.destroy();
          return;
        }
        responseRef = res;
        clearHopTimers();
        httpStatus = res.statusCode;
        const status = res.statusCode ?? 0;
        const location = headerValue(res.headers.location);
        const contentEncoding = headerValue(res.headers["content-encoding"]);
        const contentType = headerValue(res.headers["content-type"]);
        const contentLength = headerValue(res.headers["content-length"]);

        const discardAndFail = (code: DownloadErrorCode, detail?: string, redirectTo?: string): void => {
          let discarded = 0;
          res.on("data", (chunk: Buffer) => {
            discarded += chunk.length;
            if (discarded > ERROR_BODY_DISCARD_BYTES) res.destroy();
          });
          res.once("end", () => fail(code, detail, redirectTo));
          res.once("error", () => fail(code, detail, redirectTo));
          res.once("close", () => fail(code, detail, redirectTo));
        };

        // 3xx：仅 301/302/303/307/308 且有 Location 才走重定向回调；其余 3xx ⇒ http-error。
        if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
          if (location === undefined || location.trim() === "") {
            discardAndFail("download-http-error", `HTTP ${status} missing Location`);
            return;
          }
          if (hopIndex + 1 > request.limits.maxRedirects) {
            discardAndFail("download-http-error", "too-many-redirects");
            return;
          }
          let nextUrl: string;
          try {
            nextUrl = new URL(location, parsed).href;
          } catch {
            discardAndFail("download-http-error", `HTTP ${status} invalid Location`);
            return;
          }
          res.pause();
          void request
            .onRedirect({ fromUrl: parsed.href, toUrl: nextUrl, hop: hopIndex + 1 })
            .then((decision) => {
              if (decision.action === "stop") {
                res.destroy();
                fail(decision.code, decision.detail, decision.redirectTo);
                return;
              }
              if (decision.pinnedAddresses.length === 0) {
                res.destroy();
                fail("download-network-error", "no-pinned-addresses");
                return;
              }
              res.resume();
              settle({ kind: "redirect", url: decision.url, pinnedAddresses: decision.pinnedAddresses });
            })
            .catch(() => {
              res.destroy();
              fail("download-http-error", "redirect-policy-failed");
            });
          return;
        }
        if (status !== 200) {
          discardAndFail("download-http-error", `HTTP ${status}`);
          return;
        }
        if (contentEncoding !== undefined && contentEncoding.trim() !== "" && contentEncoding.trim().toLowerCase() !== "identity") {
          discardAndFail("download-unsupported-encoding", contentEncoding.trim().toLowerCase());
          return;
        }
        if (contentLength !== undefined && /^[0-9]+$/.test(contentLength.trim())) {
          const declared = Number(contentLength.trim());
          if (Number.isSafeInteger(declared) && declared > request.limits.maxBytes) {
            discardAndFail("download-too-large", `content-length ${declared}`);
            return;
          }
        }

        void (async () => {
          let plan: { fileName: string };
          try {
            plan = await request.planFile({
              finalUrl: parsed.href,
              contentDisposition: headerValue(res.headers["content-disposition"]),
            });
          } catch {
            discardAndFail("download-write-failed", "filename-plan-failed");
            return;
          }
          if (settled || hopController.signal.aborted) return;
          try {
            sink = await createDownloadSink(request.projectRoot, plan.fileName, options.fileSinkHooks);
          } catch (error) {
            const code = error instanceof DownloadProviderError ? error.code : "download-write-failed";
            discardAndFail(code, error instanceof DownloadProviderError ? error.detail : "sink-create-failed");
            return;
          }
          try {
            await request.onStarted({ finalUrl: parsed.href, fileName: sink.fileName });
          } catch {
            /* 审计失败不影响下载 */
          }

          if (settled || hopController.signal.aborted) {
            try {
              await sink.abort();
            } catch {
              /* 清理尽力而为 */
            }
            return;
          }
          const hash = createHash("sha256");
          let pendingWrite: Promise<void> | undefined;
          idleTimer = setTimeout(() => hopController.abort("idle"), request.limits.idleTimeoutMs);
          const resetIdle = (): void => {
            if (idleTimer !== undefined) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => hopController.abort("idle"), request.limits.idleTimeoutMs);
          };
          res.on("data", (chunk: Buffer) => {
            if (settled) return;
            resetIdle();
            if (bytesWritten + chunk.length > request.limits.maxBytes) {
              fail("download-too-large", `stream ${bytesWritten + chunk.length}`);
              return;
            }
            bytesWritten += chunk.length;
            hash.update(chunk);
            res.pause();
            const writeTask = sink!.write(chunk);
            pendingWrite = writeTask;
            void writeTask.then(
              () => {
                if (pendingWrite === writeTask) pendingWrite = undefined;
                if (!settled) res.resume();
              },
              (error: unknown) => {
                if (pendingWrite === writeTask) pendingWrite = undefined;
                const code = error instanceof DownloadProviderError ? error.code : "download-write-failed";
                fail(code, error instanceof DownloadProviderError ? error.detail : "sink-write-failed");
              },
            );
          });
          res.once("end", () => {
            if (settled || failureStarted) return;
            void (async () => {
              try {
                if (pendingWrite !== undefined) await pendingWrite;
              } catch {
                return; // 写盘失败由 data 处理器统一 fail/清理
              }
              if (settled || failureStarted) return;
              try {
                const committed = await sink!.commit();
                settle({
                  kind: "success",
                  result: {
                    ok: true,
                    finalUrl: parsed.href,
                    fileName: sink!.fileName,
                    pathRel: sink!.pathRel,
                    bytes: committed.bytes,
                    sha256: committed.sha256,
                    ...(contentType !== undefined ? { contentType } : {}),
                    durationMs: Math.max(0, now() - startedAt),
                  },
                });
              } catch (error) {
                const code = error instanceof DownloadProviderError ? error.code : "download-write-failed";
                fail(code, error instanceof DownloadProviderError ? error.detail : "sink-commit-failed");
              }
            })();
          });
          res.once("error", (error: unknown) => {
            const mapped = hopController.signal.aborted ? mapAbortReason(hopController.signal.reason) : mapNetworkError(error);
            fail(mapped.code, mapped.detail);
          });
          res.once("aborted", () => {
            const mapped = mapAbortReason(hopController.signal.reason);
            fail(mapped.code, mapped.detail);
          });
          res.resume();
        })();
      };

      const startedAt = now();
      try {
        const requester = isHttps ? https.request : http.request;
        const httpsOptions = isHttps
          ? ({ ...requestOptions, rejectUnauthorized: true, ...(servername !== undefined ? { servername } : {}) } as https.RequestOptions)
          : undefined;
        requestRef = isHttps
          ? https.request(httpsOptions!, onResponse)
          : http.request(requestOptions, onResponse);
      } catch (error) {
        const mapped = mapNetworkError(error);
        fail(mapped.code, mapped.detail);
        return;
      }
      requestRef.on("error", (error: unknown) => {
        const mapped = hopController.signal.aborted ? mapAbortReason(hopController.signal.reason) : mapNetworkError(error);
        fail(mapped.code, mapped.detail);
      });
      requestRef.on("socket", (socket: Socket) => {
        const onConnect = (): void => {
          if (connectTimer !== undefined) clearTimeout(connectTimer);
          connectTimer = undefined;
          const remote = socket.remoteAddress;
          if (remote === undefined || !pinned.has(normalizeAddressKey(remote))) {
            fail("download-rebinding-detected", "remote-address-not-in-pinned-set");
          }
        };
        socket.once("connect", onConnect);
        socket.once("secureConnect", onConnect);
      });
      connectTimer = setTimeout(() => hopController.abort("connect"), request.limits.connectTimeoutMs);
      requestRef.end();
    });
  }

  return {
    async execute(request: TransportRequest): Promise<TransportResult> {
      const outer = new AbortController();
      const onAbort = (): void => {
        if (!outer.signal.aborted) outer.abort("aborted");
      };
      if (request.signal?.aborted === true) onAbort();
      request.signal?.addEventListener("abort", onAbort, { once: true });
      const totalTimer = setTimeout(() => {
        if (!outer.signal.aborted) outer.abort("total");
      }, request.limits.totalTimeoutMs);
      try {
        let currentUrl = request.url;
        let currentPinned = request.pinnedAddresses;
        for (let hop = 0; ; hop += 1) {
          if (outer.signal.aborted) {
            const mapped = mapAbortReason(outer.signal.reason);
            return { ok: false, code: mapped.code, bytesWritten: 0, ...(mapped.detail !== undefined ? { detail: mapped.detail } : {}) };
          }
          const outcome = await performHop({ ...request, url: currentUrl, pinnedAddresses: currentPinned }, outer, hop);
          if (outcome.kind === "failure") return outcome.result;
          if (outcome.kind === "success") return outcome.result;
          currentUrl = outcome.url;
          currentPinned = outcome.pinnedAddresses;
        }
      } finally {
        clearTimeout(totalTimer);
        request.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

/** 生产工厂：无 lookupOverride/agent 等测试缝。 */
export function createNodeDownloadTransportProduction(): DownloadTransport {
  return createNodeDownloadTransport();
}

// 运行时核心 A1 契约测试：下载申请 Model（download.ts）/ governance 加法 / 指令视图 consumer。
// 2026-11-04 download-requests；依据方案 P1.1 §3.1/§3.3/§4.1/§4.3 与 V1 AC-14/AC-23/AC-25（Model 侧）。
// 编译期断言由 `npm run typecheck` 覆盖（tsconfig include 含 test/）；运行时断言用 node --test。
import test from "node:test";
import assert from "node:assert/strict";
import {
  DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS,
  DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS,
  DOWNLOAD_DEFAULT_MAX_BYTES,
  DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS,
  DOWNLOAD_ERROR_CODES,
  DOWNLOAD_FILENAME_MAX_BYTES,
  DOWNLOAD_FILENAME_MAX_CHARS,
  DOWNLOAD_JUDGE_FACTS_MAX_BYTES,
  DOWNLOAD_PURPOSE_MAX_BYTES,
  DOWNLOAD_REQUEST_SCHEMA,
  DOWNLOAD_URL_MAX_BYTES,
  type DownloadErrorCode,
  type DownloadJudgeFacts,
  type DownloadRequestInput,
  type DownloadRequestMetadata,
  type DownloadRequestResult,
  type RequestDownloadFn,
} from "../../src/model/download.ts";
import {
  GOVERNANCE_CARD_GROUP,
  governanceCardGroup,
  type GovernanceCardKind,
  type GovernanceConfirmCardKind,
  type GovernanceJudgeContext,
  type GovernanceJudgeFacts,
  type GovernanceJudgeRequest,
  type GovernedToolsOptions,
  type RequestCreatedEvent,
  type RequestResolvedEvent,
} from "../../src/model/runtime.ts";
import {
  CUSTOMER_DIRECTIVE_SCHEMA,
  type CustomerDirectiveView,
  type DirectiveInterpretFailureCode,
  type DirectiveInterpretFn,
  type DirectiveInterpretRequest,
  type DirectiveInterpretResult,
} from "../../src/model/directive.ts";

function sampleDownloadFacts(): DownloadJudgeFacts {
  return {
    url: "https://example.com/report.csv",
    scheme: "https",
    host: "example.com",
    port: 8443,
    resolvedIps: ["93.184.216.34"],
    resolvedIpsTotal: 1,
    resolvedIpsTruncated: false,
    filename: "report.csv",
    filenameSource: "url-basename",
    purpose: "下载测试数据",
    maxBytes: DOWNLOAD_DEFAULT_MAX_BYTES,
    mechanical: {
      schemeOk: true,
      credentialsAbsent: true,
      hostPublic: true,
      ipsPublic: true,
      filenameSafe: true,
    },
  };
}

function sampleGovernanceFacts(flowId: string): GovernanceJudgeFacts {
  return { governanceModel: "trio", flowId, ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] };
}

test("常量冻结：上限/超时/错误码与 P1.1 §3.3/§4.1/§5.4/§6.2 一致", () => {
  assert.equal(DOWNLOAD_REQUEST_SCHEMA, "download-request/v1");
  assert.equal(DOWNLOAD_DEFAULT_MAX_BYTES, 104_857_600);
  assert.equal(DOWNLOAD_URL_MAX_BYTES, 2048);
  assert.equal(DOWNLOAD_PURPOSE_MAX_BYTES, 1024);
  assert.equal(DOWNLOAD_FILENAME_MAX_CHARS, 128);
  assert.equal(DOWNLOAD_FILENAME_MAX_BYTES, 200);
  assert.equal(DOWNLOAD_JUDGE_FACTS_MAX_BYTES, 2048);
  assert.equal(DOWNLOAD_DEFAULT_CONNECT_TIMEOUT_MS, 15_000);
  assert.equal(DOWNLOAD_DEFAULT_IDLE_TIMEOUT_MS, 30_000);
  assert.equal(DOWNLOAD_DEFAULT_TOTAL_TIMEOUT_MS, 300_000);

  assert.equal(DOWNLOAD_ERROR_CODES.length, 17);
  assert.equal(new Set(DOWNLOAD_ERROR_CODES).size, 17, "错误码不得重复");
  assert.deepEqual([...DOWNLOAD_ERROR_CODES].sort(), [
    "download-aborted",
    "download-busy",
    "download-declined",
    "download-denied-by-directive",
    "download-dns-failed",
    "download-facts-missing",
    "download-http-error",
    "download-invalid-arguments",
    "download-network-error",
    "download-rebinding-detected",
    "download-redirect-cross-host",
    "download-timeout",
    "download-too-large",
    "download-unavailable",
    "download-unsafe-url",
    "download-unsupported-encoding",
    "download-write-failed",
  ]);
  // @ts-expect-error 未知错误码不属于 DownloadErrorCode
  const unknownCode: DownloadErrorCode = "download-unknown";
  void unknownCode;
});

test("卡种边界（AC-23 类型侧）：GovernanceCardKind 接受 download；ConfirmCardKind 仍仅 appointment-write", () => {
  const kind: GovernanceCardKind = "download";
  assert.equal(kind, "download");
  // @ts-expect-error `download` 是应用自有 confirm 种，不得扩进 request_confirmation 的发卡类型
  const confirmKind: GovernanceConfirmCardKind = "download";
  assert.equal(confirmKind as string, "download");

  // request.created / request.resolved 的 cardKind 自动接受 `download`（presented 无 cardKind 字段）
  const created: Pick<RequestCreatedEvent, "cardKind"> = { cardKind: "download" };
  const resolved: Pick<RequestResolvedEvent, "cardKind"> = { cardKind: "download" };
  assert.equal(created.cardKind, "download");
  assert.equal(resolved.cardKind, "download");
});

test("分组单一来源：download → approval；既有卡种映射不变", () => {
  assert.equal(governanceCardGroup("download"), "approval");
  assert.equal(Object.prototype.hasOwnProperty.call(GOVERNANCE_CARD_GROUP, "download"), true);
  assert.equal(governanceCardGroup("appointment-write"), "approval");
  for (const [kind, group] of [
    ["proposal", "decision"],
    ["appointment", "decision"],
    ["acceptance", "decision"],
    ["intent-confirm", "decision"],
    ["decision", "decision"],
  ] as const) {
    assert.equal(governanceCardGroup(kind), group);
  }
  assert.equal(governanceCardGroup("write" as never), undefined);
  assert.deepEqual(Object.keys(GOVERNANCE_CARD_GROUP).sort(), [
    "acceptance",
    "appointment",
    "appointment-write",
    "decision",
    "download",
    "intent-confirm",
    "proposal",
  ]);
});

test("指令视图 consumer 增 download；既有值与 PR #57 解释器类型不回归", () => {
  const makeView = (consumer: CustomerDirectiveView["consumer"]): CustomerDirectiveView => ({
    id: "d-1",
    seq: 1,
    target: "approval",
    action: { kind: "allow", resource: { type: "domain", host: "example.com", wildcard: false } },
    scope: {},
    until: "session",
    status: "active",
    rawText: "@审批 允许联网 domain=example.com",
    createdAt: "2026-11-04T00:00:00.000Z",
    consumer,
  });
  for (const consumer of ["shell-gate", "decision-card", "download", "none"] as const) {
    assert.equal(makeView(consumer).consumer, consumer);
  }
  // @ts-expect-error 未知 consumer 值
  const badConsumer: CustomerDirectiveView["consumer"] = "unknown-consumer";
  void badConsumer;
  assert.equal(CUSTOMER_DIRECTIVE_SCHEMA, "customer-directive/v1");

  // PR #57 加法类型（@审批/@决策 自然语言解释器）仍存在且可赋值
  const interpretRequest: DirectiveInterpretRequest = {
    target: "approval",
    body: "允许联网 domain=example.com",
    rawText: "@审批 允许联网 domain=example.com",
    projectRoot: "/tmp/project",
    roleId: "core",
    runtime: "demo",
  };
  const failureCode: DirectiveInterpretFailureCode = "parse-failed";
  const interpretResult: DirectiveInterpretResult = { ok: false, reasonCode: failureCode };
  const interpret: DirectiveInterpretFn = async () => interpretResult;
  assert.equal(interpretRequest.target, "approval");
  assert.equal(interpretResult.ok, false);
  assert.equal(typeof interpret, "function");
});

test("judge 字段（AC-25 Model 侧）：Context/Request 可选 download 且双向同形；GovernanceJudgeFacts 无 download", () => {
  const facts = sampleDownloadFacts();
  const ctxDownload: NonNullable<GovernanceJudgeContext["download"]> = facts;
  const request: GovernanceJudgeRequest = {
    group: "approval",
    cardKind: "download",
    roleId: "core",
    projectRoot: "/tmp/project",
    runtime: "demo",
    governanceModel: "trio",
    flowId: "download",
    card: { kind: "confirm", title: "下载文件申请" },
    facts: sampleGovernanceFacts("download"),
    download: ctxDownload,
    at: "2026-11-04T00:00:00.000Z",
  };
  const back: NonNullable<GovernanceJudgeContext["download"]> = request.download!;
  assert.deepEqual(back, facts);
  // 可选：省略合法（旧调用零变化）
  const without: GovernanceJudgeRequest = { ...request, download: undefined };
  assert.equal(without.download, undefined);
  // @ts-expect-error GovernanceJudgeFacts（账本级）没有 download 字段——下载事实是请求级
  const accountFacts: GovernanceJudgeFacts = { ...sampleGovernanceFacts("download"), download: facts };
  void accountFacts;
});

test("能力位与回执类型：GovernedToolsOptions.requestDownload 可省略/可赋值；判别联合锁成功/失败形状", async () => {
  const success: DownloadRequestResult = {
    ok: true,
    message: "request_download：已下载「example.com」→ download/report.csv（12 字节，sha256 …）",
    path: "download/report.csv",
    bytes: 12,
    sha256: "9f".repeat(32),
    finalUrl: "https://example.com/report.csv",
    approval: { by: "judge", engine: "demo", model: "fixture" },
  };
  const failure: DownloadRequestResult = { ok: false, message: "未下载：目标域名解析到私网地址", code: "download-unsafe-url" };
  const fn: RequestDownloadFn = async (input, metadata) => {
    assert.equal(typeof input.purpose, "string");
    assert.equal(metadata === undefined || typeof metadata === "object", true);
    return input.filename === undefined ? success : failure;
  };
  const options: GovernedToolsOptions = { requestDownload: fn };
  assert.equal(typeof options.requestDownload, "function");
  const empty: GovernedToolsOptions = {};
  assert.equal(empty.requestDownload, undefined);

  // 输入/元数据形状
  const input: DownloadRequestInput = { url: "https://example.com/a", purpose: "p" };
  const metadata: DownloadRequestMetadata = { roleId: "core", runtime: "demo", turnId: "t-1", toolCallId: "c-1" };
  // @ts-expect-error 缺少 purpose
  const badInput: DownloadRequestInput = { url: "https://example.com/a" };
  // 判别联合：失败必带 code；成功必带全部成功字段
  // @ts-expect-error 失败缺 code
  const missingCode: DownloadRequestResult = { ok: false, message: "x" };
  // @ts-expect-error 成功缺 sha256
  const missingSha: DownloadRequestResult = { ok: true, message: "x", path: "download/a", bytes: 0, finalUrl: "https://e/", approval: { by: "customer" } };
  const unknownCodeValue = { ok: false as const, message: "x", code: "download-unknown" };
  // @ts-expect-error 未知 code 不属于 DownloadErrorCode
  const badCode: DownloadRequestResult = unknownCodeValue;
  void input; void metadata; void badInput; void missingCode; void missingSha; void badCode;

  const result = await fn(input, metadata);
  assert.equal(result.ok, true);
  const failureResult = await fn({ ...input, filename: "suggested.csv" }, metadata);
  assert.equal(failureResult.ok, false);
  if (failureResult.ok === false) assert.equal(failureResult.code, "download-unsafe-url");
});

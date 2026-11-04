// test/桌面应用/download-request.test.ts
// 2026-11-04 download-requests C1：下载能力注入/卡片字段/生命周期/项目根/一项目一卡/
// 中止/审计归属/预授权排除/G1 提示（SessionManager + 真实 customer-input 通道 + B1 运行时桩件）。
//
// 边界：本文件只验证 C1（Interface）职责；URL/DNS/IP/文件名/下载执行/账本由 B1 层测试证明。
// B1 运行时以桩件实现冻结的 `DownloadRequestRuntime`/`DownloadApprovalPresenter` 形状。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  createCustomerInputChannel,
  type DesktopCustomerInputFn,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import {
  buildDownloadCardRequest,
  createRequestDownloadCapability,
  toDownloadApprovalOutcome,
} from "../../app/desktop/download-request.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type {
  DownloadApprovalOutcome,
  DownloadApprovalRequest,
  DownloadRequestOptions,
  DownloadRequestRuntime,
  DownloadRunInput,
  DownloadRunResult,
} from "../../src/pipeline/orchestration/download-request.ts";
import type {
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputRequest,
  GovernanceJudgeFacts,
} from "../../src/model/runtime.ts";
import type { DownloadJudgeFacts, DownloadRequestInput } from "../../src/model/download.ts";

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, governanceFunction: "chief" | "verification"): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction,
  });
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief", "chief"), builtIn("verifier", "verification"), worker("worker")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

function facts(overrides: Partial<DownloadJudgeFacts> = {}): DownloadJudgeFacts {
  return {
    url: "https://example.com/report.csv",
    scheme: "https",
    host: "example.com",
    resolvedIps: ["93.184.216.34", "93.184.216.35"],
    resolvedIpsTotal: 12,
    resolvedIpsTruncated: true,
    filename: "report.csv",
    filenameSource: "url-basename",
    purpose: "拉取周报",
    maxBytes: 104_857_600,
    mechanical: {
      schemeOk: true,
      credentialsAbsent: true,
      hostPublic: true,
      ipsPublic: true,
      filenameSafe: true,
    },
    ...overrides,
  };
}

function governanceFacts(flowId = "download"): GovernanceJudgeFacts {
  return {
    governanceModel: "trio",
    flowId,
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
  };
}

function approvalRequest(overrides: Partial<DownloadApprovalRequest> = {}): DownloadApprovalRequest {
  return {
    downloadId: "dl-test-1",
    roleId: "worker",
    runtime: "demo",
    toolCallId: "call-1",
    turnId: "turn-1",
    factsAvailable: true,
    governanceFacts: governanceFacts("flow-a"),
    downloadFacts: facts(),
    attribution: { flowId: "flow-a", flowIdIsSynthetic: false },
    policy: { redirectPolicy: "same-host", maxRedirects: 5 },
    ...overrides,
  };
}

function handle(): RoleSessionHandle {
  return {
    async send() {},
    events() {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<never>> {
              return { value: undefined as never, done: true };
            },
          };
        },
      };
    },
    async dispose() {},
  };
}

interface HarnessOptions {
  runtimeDownload?: (
    input: DownloadRunInput,
    options: DownloadRequestOptions,
  ) => Promise<DownloadRunResult>;
  judge?: (request: { cardKind: string; group: string; download?: unknown }) => Promise<{
    verdict: "approve" | "deny" | "manual";
    group: "approval" | "decision";
    cardKind: "download";
    reasonCode: string;
    engine: "demo";
    value?: { confirmed?: true };
  }>;
  groupEnabled?: boolean;
}

interface OpenedSessionInput {
  customerInput?: CustomerInputFn;
  requestDownload?: (input: DownloadRequestInput, metadata?: CustomerInputMetadata) => Promise<unknown>;
}

interface Harness {
  mgr: SessionManager;
  channel: ReturnType<typeof createCustomerInputChannel>;
  payloads: OperatorRequestPayload[];
  queued: OperatorRequestPayload[];
  contexts: Array<Parameters<DesktopCustomerInputFn>[1]>;
  metadatas: Array<CustomerInputMetadata | undefined>;
  opened: () => CustomerInputFn | undefined;
  openedInput: () => OpenedSessionInput | undefined;
  runtimeOptions: () => DownloadRequestOptions | undefined;
  lastRunInput: () => DownloadRunInput | undefined;
  presentedIds: string[];
  disposeCount: () => number;
  notices: string[];
  judgeCalls: () => number;
}

function makeHarness(root: string, options: HarnessOptions = {}): Harness {
  const payloads: OperatorRequestPayload[] = [];
  const queued: OperatorRequestPayload[] = [];
  const contexts: Array<Parameters<DesktopCustomerInputFn>[1]> = [];
  const metadatas: Array<CustomerInputMetadata | undefined> = [];
  const presentedIds: string[] = [];
  const notices: string[] = [];
  let opened: CustomerInputFn | undefined;
  let openedInput: OpenedSessionInput | undefined;
  let runtimeOptions: DownloadRequestOptions | undefined;
  let lastRunInput: DownloadRunInput | undefined;
  let disposeCount = 0;
  let judgeCalls = 0;
  let channel!: ReturnType<typeof createCustomerInputChannel>;
  channel = createCustomerInputChannel({
    presenter: (payload) => {
      payloads.push(payload);
    },
    operatorId: "tester",
    onQueued: (payload) => {
      queued.push(payload);
    },
    judge: { isGroupEnabled: () => options.groupEnabled !== false },
  });

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      opened = input.customerInput;
      openedInput = input as unknown as OpenedSessionInput;
      return handle();
    },
    createPiAdapterFactory: () => {
      throw new Error("no pi");
    },
    createDemoAdapter: () => ({}) as never,
    buildProjectConfig,
    getListing: (candidate) => (candidate === root ? listing(root) : undefined),
    emitEvent: (envelope) => {
      if (envelope.event.kind === "message" && (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note") {
        notices.push(envelope.event.summary);
      }
    },
    customerInput: (request, context, metadata) => {
      contexts.push(context);
      metadatas.push(metadata);
      return channel.customerInput(request, context, metadata);
    },
    downloadAppVersion: "1.2.3-test",
    getDownloadDirectiveConsumer: (projectRoot) =>
      projectRoot === root ? async () => undefined : undefined,
    createDownloadRuntime: (input) => {
      runtimeOptions = input;
      const runtime: DownloadRequestRuntime = {
        async ready() {},
        async consumerEpoch() {
          return { state: "missing" };
        },
        async download(runInput) {
          lastRunInput = runInput;
          if (options.runtimeDownload !== undefined) {
            return options.runtimeDownload(runInput, input);
          }
          const outcome = await input.present.present(approvalRequest({ roleId: input.roleId, ...(input.runtime !== undefined ? { runtime: input.runtime } : {}) }), {
            onPresented: (info) => presentedIds.push(info.requestId),
          });
          if (outcome.decision !== "approved") {
            return {
              ok: false,
              downloadId: "dl-test-1",
              ...(outcome.decision === "declined" && outcome.requestId !== undefined ? { requestId: outcome.requestId } : {}),
              code: outcome.decision === "aborted" ? "download-aborted" : outcome.decision === "unavailable" ? "download-unavailable" : "download-declined",
              message: "未下载",
            };
          }
          return {
            ok: true,
            downloadId: "dl-test-1",
            ...(outcome.requestId !== undefined ? { requestId: outcome.requestId } : {}),
            path: "download/report.csv",
            bytes: 123,
            sha256: "a".repeat(64),
            finalUrl: "https://example.com/final.csv",
            approval: { kind: outcome.by, ...(outcome.by === "judge" ? { judge: { engine: "demo", reasonCode: "approved" } } : {}) },
            message: "已下载",
          };
        },
        async dispose() {
          disposeCount += 1;
        },
      };
      return runtime;
    },
    ...(options.judge !== undefined
      ? {
          createGovernanceJudge: () => async (request, _signal) => {
            judgeCalls += 1;
            const outcome = await options.judge!(request as unknown as { cardKind: string; group: string; download?: unknown });
            return outcome as never;
          },
        }
      : {}),
  });

  return {
    mgr,
    channel,
    payloads,
    queued,
    contexts,
    metadatas,
    opened: () => opened,
    openedInput: () => openedInput,
    runtimeOptions: () => runtimeOptions,
    lastRunInput: () => lastRunInput,
    presentedIds,
    disposeCount: () => disposeCount,
    notices,
    judgeCalls: () => judgeCalls,
  };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(`timeout waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function openWorker(h: Harness, root: string): Promise<OpenedSessionInput> {
  const result = await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
  if (!result.ok) assert.fail(result.error);
  const input = h.openedInput();
  assert.equal(typeof input, "object", "openRoleSession 必须收到会话入参");
  return input!;
}

test("buildDownloadCardRequest：字段/归属/judgeContext/factsAvailable 映射", () => {
  const real = buildDownloadCardRequest(approvalRequest());
  assert.equal(real.request.kind, "confirm");
  assert.equal(real.request.cardKind, "download");
  assert.equal(real.request.flowId, "flow-a");
  assert.equal(real.metadata.flowId, "flow-a");
  assert.equal(real.metadata.cardKind, "download");
  assert.equal(real.judgeNotice, undefined);
  assert.deepEqual(real.metadata.judgeContext?.facts, approvalRequest().governanceFacts);
  assert.deepEqual(real.metadata.judgeContext?.download, approvalRequest().downloadFacts);
  assert.equal(real.metadata.judgeContext?.flowId, "flow-a");
  const preview = real.request.preview ?? "";
  assert.match(preview, /example\.com/);
  assert.match(preview, /93\.184\.216\.34/);
  assert.match(preview, /共 12 个，仅显示前 2 个/);
  assert.match(preview, /report\.csv/);
  assert.match(preview, /≤ 100 MB/);
  assert.match(preview, /仅同域/);
  assert.match(preview, /协议校验：通过（https）/);
  assert.match(preview, /主机校验：公网地址/);
  assert.match(preview, /解析 IP 校验：全部为公网地址/);

  const synthetic = buildDownloadCardRequest(
    approvalRequest({ attribution: { flowId: "download", flowIdIsSynthetic: true } }),
  );
  assert.equal(synthetic.request.flowId, undefined);
  assert.equal(synthetic.metadata.flowId, undefined);
  assert.equal(synthetic.metadata.judgeContext?.flowId, "download");

  const unavailable = buildDownloadCardRequest(
    approvalRequest({ factsAvailable: false, governanceFacts: undefined as never }),
  );
  assert.equal(unavailable.metadata.judgeContext, undefined);
  assert.equal(typeof unavailable.judgeNotice, "string");
  assert.match(unavailable.judgeNotice!, /无法核对/);
});

test("toDownloadApprovalOutcome：客户/judge/中止/unavailable 归属映射", () => {
  assert.deepEqual(
    toDownloadApprovalOutcome({
      outcome: "answered",
      value: { confirmed: true },
      operatorId: "judge:demo",
      judge: { group: "approval", cardKind: "download", engine: "demo", reasonCode: "approved" },
    }),
    { decision: "approved", by: "judge", judge: { engine: "demo", reasonCode: "approved" } },
  );
  assert.deepEqual(
    toDownloadApprovalOutcome({ outcome: "answered", value: { confirmed: true }, operatorId: "customer-op" }),
    { decision: "approved", by: "customer" },
  );
  assert.deepEqual(
    toDownloadApprovalOutcome({ outcome: "declined", operatorId: "judge:demo", reason: "no" }),
    { decision: "declined", by: "judge", reason: "no" },
  );
  assert.deepEqual(
    toDownloadApprovalOutcome({
      outcome: "declined",
      operatorId: "system:initiator-aborted",
      reason: "initiator-aborted",
      notPresented: true,
    }),
    { decision: "aborted" },
  );
  assert.deepEqual(toDownloadApprovalOutcome({ outcome: "unavailable", reason: "x" }), {
    decision: "unavailable",
    reason: "x",
  });
});

test("createRequestDownloadCapability：B1 结果映射/attribution/信号/回执（含 G1 提示）", async () => {
  const notices: string[] = [];
  let captured: DownloadRunInput | undefined;
  const runtime: DownloadRequestRuntime = {
    async ready() {},
    async consumerEpoch() {
      return { state: "missing" };
    },
    async download(input) {
      captured = input;
      return {
        ok: true,
        downloadId: "dl-1",
        path: "download/a.csv",
        bytes: 10,
        sha256: "b".repeat(64),
        finalUrl: "https://example.com/a.csv",
        approval: { kind: "directive", directiveId: "d-3" },
        message: "ok",
      };
    },
    async dispose() {},
  };
  const capability = createRequestDownloadCapability({
    runtime,
    runtimeKind: "demo",
    roleId: "worker",
    attribution: { flowId: "flow-a" },
    emitNotice: (summary) => notices.push(summary),
  });
  const signal = new AbortController().signal;
  const result = await capability(
    { url: "https://example.com/a.csv", purpose: "p" },
    { signal, toolCallId: "call-9", turnId: "turn-9" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.approval, { by: "directive", directiveId: "d-3" });
  assert.equal(result.path, "download/a.csv");
  assert.equal(captured?.toolCallId, "call-9");
  assert.equal(captured?.turnId, "turn-9");
  assert.ok(captured?.signal !== undefined, "组合后的信号必须传给 B1");
  assert.equal(captured?.signal?.aborted, false);
  assert.deepEqual(captured?.attribution, { flowId: "flow-a" });
  assert.ok(notices.some((line) => line.includes("审批指令 #d-3")));
  assert.ok(notices.some((line) => line.includes("download/")));
  assert.ok(notices.some((line) => line.includes(".gitignore")));
});

test("SessionManager 卡片路径：能力注入/卡片字段/生命周期/requestId/回执；项目角色仍无 customerInput", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-card-"));
  const h = makeHarness(root);
  const customerInput = await openWorker(h, root);
  assert.equal(h.openedInput()?.requestDownload !== undefined, true);
  // 项目角色仍无 request_confirmation（customerInput 未注入 openRoleSession）。
  const opened = h.openedInput() as unknown as { customerInput?: unknown };
  assert.equal(opened.customerInput, undefined);
  const requestDownload = h.openedInput()!.requestDownload!;

  const pending = requestDownload(
    { url: "https://example.com/report.csv", purpose: "拉取周报" },
    { toolCallId: "call-1", turnId: "turn-1" },
  );
  await waitFor(() => h.payloads.length === 1, "下载卡呈现");
  const payload = h.payloads[0]!;
  assert.equal(payload.request.kind, "confirm");
  assert.equal(payload.request.cardKind, "download");
  assert.match(payload.request.preview ?? "", /example\.com/);
  assert.equal(h.metadatas[0]?.judgeContext?.flowId, "flow-a");
  assert.equal(h.metadatas[0]?.cardKind, "download");

  h.channel.respond({ id: payload.id, decision: { kind: "confirm", confirmed: true } });
  const result = await pending;
  assert.equal((result as { ok: boolean }).ok, true);

  assert.equal(h.presentedIds.length, 1);
  assert.match(h.presentedIds[0]!, /^req-/);
  const state = await readTaskState(root);
  const created = state.events.find((event) => event.kind === "request.created");
  const presented = state.events.find((event) => event.kind === "request.presented");
  const resolved = state.events.find((event) => event.kind === "request.resolved");
  assert.equal(created?.kind === "request.created" ? created.cardKind : undefined, "download");
  assert.equal(presented?.kind === "request.presented" ? presented.to : undefined, "customer");
  assert.equal(resolved?.kind === "request.resolved" ? resolved.by : undefined, "customer");
  assert.equal(
    created?.kind === "request.created" ? created.requestId : undefined,
    h.presentedIds[0],
  );
  assert.ok(h.notices.some((line) => line.includes("已下载")));
  assert.ok(h.notices.some((line) => line.includes(".gitignore")));
});

test("SessionManager 预授权路径：B1 不调 presenter ⇒ 零客户卡、零 request.*；downloadId 由 B1 生成", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-preauth-"));
  const h = makeHarness(root, {
    runtimeDownload: async () => ({
      ok: true,
      downloadId: "dl-directive",
      path: "download/a.csv",
      bytes: 1,
      sha256: "c".repeat(64),
      finalUrl: "https://example.com/a.csv",
      approval: { kind: "directive", directiveId: "d-7" },
      message: "ok",
    }),
  });
  await openWorker(h, root);
  const result = await h.openedInput()!.requestDownload!(
    { url: "https://example.com/a.csv", purpose: "p" },
    { toolCallId: "call-2", turnId: "turn-2" },
  );
  assert.equal((result as { ok: boolean }).ok, true);
  assert.equal(h.payloads.length, 0);
  const state = await readTaskState(root);
  assert.equal(state.events.some((event) => event.kind.startsWith("request.")), false);
  assert.equal(h.lastRunInput()?.toolCallId, "call-2");
});

test("一项目一卡：前一张未决时下载卡排队，不呈现", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-queue-"));
  const h = makeHarness(root);
  await openWorker(h, root);
  const req1 = h.openedInput()!.requestDownload!(
    { url: "https://example.com/1.csv", purpose: "p1" },
    { toolCallId: "call-1" },
  );
  await waitFor(() => h.payloads.length === 1, "第一张下载卡");
  const req2 = h.openedInput()!.requestDownload!(
    { url: "https://example.com/2.csv", purpose: "p2" },
    { toolCallId: "call-2" },
  );
  await waitFor(() => h.queued.length === 1, "第二张下载卡排队");
  assert.equal(h.payloads.length, 1);
  h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "confirm", confirmed: true } });
  await req1;
  await waitFor(() => h.payloads.length === 2, "第二张下载卡呈现");
  h.channel.respond({ id: h.payloads[1]!.id, decision: { kind: "confirm", confirmed: true } });
  await req2;
});

test("preauthorizeWrite 排除：下载卡即使带 paths/writeBoundary 也不被写预授权 accept/reject", async () => {
  const payloads: OperatorRequestPayload[] = [];
  let preauthCalls = 0;
  let channel!: ReturnType<typeof createCustomerInputChannel>;
  channel = createCustomerInputChannel({
    presenter: (payload) => payloads.push(payload),
    operatorId: "tester",
    writePreauthorization: () => {
      preauthCalls += 1;
      return { action: "accept", paths: ["src/x.ts"], source: "explicit" };
    },
  });
  const request: CustomerInputRequest = {
    kind: "confirm",
    cardKind: "download",
    title: "下载",
    preview: "x",
    paths: ["src/x.ts"],
  };
  const pending = channel.customerInput(request, {
    roleId: "worker",
    projectRoot: "C:/proj",
    governanceModel: "trio",
    writeBoundary: { entries: [] },
    skillRoot: "C:/proj",
  } as never, undefined);
  await waitFor(() => payloads.length === 1, "下载卡仍应呈现");
  assert.equal(preauthCalls, 0, "下载卡不得进入写预授权判定");
  channel.respond({ id: payloads[0]!.id, decision: { kind: "confirm", confirmed: false } });
  const outcome = await pending;
  assert.equal(outcome?.outcome, "declined");
});

test("dispose：会话结束 await B1 运行时 dispose（幂等）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-dispose-"));
  const h = makeHarness(root);
  await openWorker(h, root);
  assert.equal(h.disposeCount(), 0);
  const stopped = await h.mgr.stop(null);
  assert.equal(stopped.ok, true);
  assert.equal(h.disposeCount(), 1);
  // 已无会话：再次 stop 不再次 dispose、不抛错。
  const again = await h.mgr.stop(null);
  assert.equal(again.ok, false);
  assert.equal(h.disposeCount(), 1);
});

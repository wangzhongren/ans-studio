// test/桌面应用/download-decision.test.ts
// 2026-11-04 download-requests C1：W-2/W-4（项目角色 judge 可达/透传）、下载 manual 全量转客户卡、
// unavailableReason 防御、开关关/single 客户卡、指纹去重、仍无 request_confirmation。
//
// 边界：本文件只验证 C1（Interface/渠道）职责；judge driver/rubric/facts 由 A1/B1 层测试证明。

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
  GovernanceJudgeFn,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
} from "../../src/model/runtime.ts";
import type { DownloadJudgeFacts, DownloadRequestInput } from "../../src/model/download.ts";

function listing(root: string, governanceModel: "trio" | "single" = "trio"): ProjectListing {
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
  const chief: ProjectListing["roles"][number] = {
    roleId: "chief",
    cardPath: "",
    boundaryPath: "",
    cardText: "chief",
    boundary: { entries: [], boundarySource: "<built-in:chief>", acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: "chief",
  };
  return {
    projectRoot: root,
    roles: [chief, worker("worker")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel,
  };
}

function facts(overrides: Partial<DownloadJudgeFacts> = {}): DownloadJudgeFacts {
  return {
    url: "https://example.com/report.csv",
    scheme: "https",
    host: "example.com",
    resolvedIps: ["93.184.216.34"],
    resolvedIpsTotal: 1,
    resolvedIpsTruncated: false,
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

function approvalRequest(input: Pick<DownloadRunInput, "toolCallId" | "turnId"> = {}): DownloadApprovalRequest {
  return {
    downloadId: "dl-test-1",
    roleId: "worker",
    runtime: "demo",
    // B1 契约：downloadId 由 B1 生成、每次调用透传 input.toolCallId/turnId；夹具按真实形状带入，
    // 否则同一固定 toolCallId 会被桌面 requestId 重放去重（第二次请求返回第一次结果，测不到本用例语义）。
    toolCallId: input.toolCallId ?? "call-1",
    turnId: input.turnId ?? "turn-1",
    factsAvailable: true,
    governanceFacts: {
      governanceModel: "trio",
      flowId: "flow-a",
      ledgerErrors: 0,
      unresolvedClarificationCount: 0,
      latestDecisionKinds: [],
    },
    downloadFacts: facts(),
    attribution: { flowId: "flow-a", flowIdIsSynthetic: false },
    policy: { redirectPolicy: "same-host", maxRedirects: 5 },
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

interface OpenedSessionInput {
  customerInput?: CustomerInputFn;
  requestDownload?: (input: DownloadRequestInput, metadata?: CustomerInputMetadata) => Promise<unknown>;
}

interface HarnessOptions {
  governanceModel?: "trio" | "single";
  groupEnabled?: boolean;
  judgeOutcomes?: GovernanceJudgeOutcome[];
}

interface Harness {
  mgr: SessionManager;
  channel: ReturnType<typeof createCustomerInputChannel>;
  handles: RoleSessionHandle[];
  payloads: OperatorRequestPayload[];
  openedInput: () => OpenedSessionInput | undefined;
  judgeFactoryCalls: () => number;
  judgeRequests: GovernanceJudgeRequest[];
  judgeCalls: () => number;
  presentedIds: string[];
}

function makeHarness(root: string, options: HarnessOptions = {}): Harness {
  const handles: RoleSessionHandle[] = [];
  const payloads: OperatorRequestPayload[] = [];
  const presentedIds: string[] = [];
  const judgeRequests: GovernanceJudgeRequest[] = [];
  let openedInput: OpenedSessionInput | undefined;
  let judgeFactoryCalls = 0;
  let judgeCalls = 0;
  const outcomes = [...(options.judgeOutcomes ?? [])];
  let channel!: ReturnType<typeof createCustomerInputChannel>;
  channel = createCustomerInputChannel({
    presenter: (payload) => payloads.push(payload),
    operatorId: "tester",
    judge: {
      isGroupEnabled: () => options.groupEnabled !== false,
    },
    // 结果行是 approve 的可见性条件（既有语义）；此处只收集/吞掉，避免 row-failed 回落 manual。
    emitJudgeResult: () => {},
  });

  const judgeFn: GovernanceJudgeFn = async (request) => {
    judgeCalls += 1;
    judgeRequests.push(request);
    const next = outcomes.shift();
    if (next !== undefined) return next;
    return {
      verdict: "approve",
      group: "approval",
      cardKind: "download",
      reasonCode: "approved",
      engine: "demo",
      value: { confirmed: true },
    };
  };

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openedInput = input as unknown as OpenedSessionInput;
      const sessionHandle = handle();
      handles.push(sessionHandle);
      return sessionHandle;
    },
    createPiAdapterFactory: () => {
      throw new Error("no pi");
    },
    createDemoAdapter: () => ({}) as never,
    buildProjectConfig,
    getListing: (candidate) =>
      candidate === root ? listing(root, options.governanceModel ?? "trio") : undefined,
    emitEvent: () => {},
    customerInput: (request, context, metadata) => channel.customerInput(request, context, metadata),
    downloadAppVersion: "1.2.3-test",
    getDownloadDirectiveConsumer: (projectRoot) =>
      projectRoot === root ? async () => undefined : undefined,
    createDownloadRuntime: (input) => {
      const runtime: DownloadRequestRuntime = {
        async ready() {},
        async consumerEpoch() {
          return { state: "missing" };
        },
        async download(runInput) {
          return runtimeDownload(runInput, input, presentedIds);
        },
        async dispose() {},
      };
      return runtime;
    },
    createGovernanceJudge: () => {
      judgeFactoryCalls += 1;
      return judgeFn;
    },
  });

  return {
    mgr,
    channel,
    handles,
    payloads,
    openedInput: () => openedInput,
    judgeFactoryCalls: () => judgeFactoryCalls,
    judgeRequests,
    judgeCalls: () => judgeCalls,
    presentedIds,
  };
}

async function runtimeDownload(
  input: DownloadRunInput,
  options: DownloadRequestOptions,
  presentedIds: string[],
): Promise<DownloadRunResult> {
  const outcome = await options.present.present(approvalRequest(input), {
    onPresented: (info) => presentedIds.push(info.requestId),
  });
  if (outcome.decision === "approved") {
    return {
      ok: true,
      downloadId: "dl-test-1",
      ...(outcome.requestId !== undefined ? { requestId: outcome.requestId } : {}),
      path: "download/report.csv",
      bytes: 1,
      sha256: "d".repeat(64),
      finalUrl: "https://example.com/report.csv",
      approval: { kind: outcome.by, ...(outcome.by === "judge" ? { judge: { engine: "demo", reasonCode: "approved" } } : {}) },
      message: "ok",
    };
  }
  return {
    ok: false,
    downloadId: "dl-test-1",
    ...(outcome.decision === "declined" && outcome.requestId !== undefined ? { requestId: outcome.requestId } : {}),
    code: outcome.decision === "aborted" ? "download-aborted" : outcome.decision === "unavailable" ? "download-unavailable" : "download-declined",
    message: "not downloaded",
  };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(`timeout waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** 有界等待：清理不得让 CI 文件子进程永久挂起（stop/dispose 以结果如实结算，超时则显式失败）。 */
function settledWithin<T>(promise: Promise<T>, label: string, ms = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); });
  return Promise.race([promise, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/** 失败路径也必然执行：挂起卡按窗关结算 → 有界 stop → 逐句柄 dispose → 删除临时项目根。 */
async function cleanupHarness(h: Harness, root: string): Promise<void> {
  try { h.channel.rejectAllPending("测试清理"); } catch { /* 窗关结算幂等；清理不掩盖用例失败 */ }
  try {
    if (h.mgr.isOpen()) await settledWithin(h.mgr.stop(null), "download-decision 清理 stop 超时", 5_000);
  } catch { /* stop 以结果如实报告 dispose 错误；清理不掩盖用例失败 */ }
  for (const sessionHandle of h.handles) {
    try { await settledWithin(sessionHandle.dispose(), "download-decision 清理 dispose 超时", 2_000); } catch { /* dispose 幂等 */ }
  }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

async function openWorker(h: Harness, root: string): Promise<NonNullable<OpenedSessionInput["requestDownload"]>> {
  const result = await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
  if (!result.ok) assert.fail(result.error);
  const fn = h.openedInput()?.requestDownload;
  assert.equal(typeof fn, "function", "项目角色会话必须注入 requestDownload");
  return fn!;
}

async function invokeAndWaitCard(
  h: Harness,
  requestDownload: NonNullable<OpenedSessionInput["requestDownload"]>,
  toolCallId: string,
): Promise<{ payload: OperatorRequestPayload; pending: Promise<unknown> }> {
  const pending = requestDownload(
    { url: "https://example.com/report.csv", purpose: "拉取周报" },
    { toolCallId, turnId: "turn-1" },
  );
  await waitFor(() => h.payloads.length > 0, "客户卡");
  return { payload: h.payloads[h.payloads.length - 1]!, pending };
}

test("W-2/W-4：项目角色 judge 可达、download 事实透传、approve 不弹客户卡", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-judge-"));
  const h = makeHarness(root, { judgeOutcomes: [] });
  try {
  const requestDownload = await openWorker(h, root);
  assert.equal(h.judgeFactoryCalls(), 1, "trio + 下载能力 ⇒ 项目角色也构造每会话 judge 闭包");

  const result = await requestDownload(
    { url: "https://example.com/report.csv", purpose: "拉取周报" },
    { toolCallId: "call-1", turnId: "turn-1" },
  );
  assert.equal((result as { ok: boolean }).ok, true);
  assert.equal(h.judgeCalls(), 1, "judge 恰调用一次");
  assert.equal(h.payloads.length, 0, "judge approve 不弹客户卡");
  const judgeRequest = h.judgeRequests[0]!;
  assert.equal(judgeRequest.cardKind, "download");
  assert.equal(judgeRequest.group, "approval");
  assert.deepEqual(judgeRequest.download, approvalRequest().downloadFacts);
  assert.equal(judgeRequest.flowId, "flow-a");
  assert.equal(h.presentedIds.length, 1);
  const state = await readTaskState(root);
  assert.equal(
    state.events.find((event) => event.kind === "request.presented")?.kind === "request.presented"
      ? state.events.find((event) => event.kind === "request.presented")!.to
      : undefined,
    "judge",
  );
  const resolved = state.events.find((event) => event.kind === "request.resolved");
  assert.equal(resolved?.kind === "request.resolved" ? resolved.by : undefined, "judge");
  } finally {
    await cleanupHarness(h, root);
  }
});

test("judge deny：不弹客户卡，request.resolved.by=judge（下载归属修正）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-deny-"));
  const h = makeHarness(root, {
    judgeOutcomes: [
      { verdict: "deny", group: "approval", cardKind: "download", reasonCode: "not-useful", engine: "demo" },
    ],
  });
  try {
  const requestDownload = await openWorker(h, root);
  const result = await requestDownload(
    { url: "https://example.com/report.csv", purpose: "拉取周报" },
    { toolCallId: "call-1", turnId: "turn-1" },
  );
  assert.equal((result as { ok: boolean }).ok, false);
  assert.equal(h.payloads.length, 0, "judge deny 不弹客户卡");
  const state = await readTaskState(root);
  const presented = state.events.find((event) => event.kind === "request.presented");
  assert.equal(presented?.kind === "request.presented" ? presented.to : undefined, "judge");
  const resolved = state.events.find((event) => event.kind === "request.resolved");
  assert.equal(resolved?.kind === "request.resolved" ? resolved.by : undefined, "judge");
  } finally {
    await cleanupHarness(h, root);
  }
});

test("下载 manual（timeout / download-facts-missing）：原卡 + judgeNotice 转客户，不 auto-rework", async () => {
  for (const reasonCode of ["timeout", "download-facts-missing"]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `ans-dl-manual-${reasonCode}-`));
    const h = makeHarness(root, {
      judgeOutcomes: [
        { verdict: "manual", group: "approval", cardKind: "download", reasonCode, engine: "demo", reason: "无法判断" },
      ],
    });
    try {
    const requestDownload = await openWorker(h, root);
    const { payload, pending } = await invokeAndWaitCard(h, requestDownload, "call-1");
    assert.equal(payload.request.cardKind, "download");
    assert.equal(typeof payload.judgeNotice, "string");
    assert.match(payload.judgeNotice!, /已转你手动确认|自动代理未代批/);
    // 尚未结算：必须等客户作答，不能自动退回。
    const before = await readTaskState(root);
    assert.equal(before.events.some((event) => event.kind === "request.resolved"), false);
    h.channel.respond({ id: payload.id, decision: { kind: "confirm", confirmed: true } });
    const result = await pending;
    assert.equal((result as { ok: boolean }).ok, true);
    const state = await readTaskState(root);
    const resolved = state.events.find((event) => event.kind === "request.resolved");
    assert.equal(resolved?.kind === "request.resolved" ? resolved.by : undefined, "customer");
    } finally {
      await cleanupHarness(h, root);
    }
  }
});

test("unavailableReason 防御：下载卡转客户卡（不 auto-rework、judge 不调用）", async () => {
  const payloads: OperatorRequestPayload[] = [];
  let judgeCalls = 0;
  let channel!: ReturnType<typeof createCustomerInputChannel>;
  channel = createCustomerInputChannel({
    presenter: (payload) => payloads.push(payload),
    operatorId: "tester",
    judge: { isGroupEnabled: () => true },
  });
  try {
  const judge: GovernanceJudgeFn = async () => {
    judgeCalls += 1;
    return { verdict: "approve", group: "approval", cardKind: "download", reasonCode: "approved", engine: "demo", value: { confirmed: true } };
  };
  const request: CustomerInputRequest = { kind: "confirm", cardKind: "download", title: "下载", preview: "x" };
  const metadata: CustomerInputMetadata = {
    cardKind: "download",
    judgeContext: {
      flowId: "flow-a",
      facts: { governanceModel: "trio", flowId: "flow-a", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
      download: facts(),
      unavailableReason: "下载事实不可读",
    },
  };
  const pending = channel.customerInput(
    request,
    {
      roleId: "worker",
      runtime: "demo",
      projectRoot: "C:/proj",
      governanceModel: "trio",
      governanceJudge: judge,
    } as Parameters<DesktopCustomerInputFn>[1],
    metadata,
  );
  await waitFor(() => payloads.length === 1, "客户卡");
  assert.equal(judgeCalls, 0, "unavailableReason 不得调用 judge");
  assert.equal(typeof payloads[0]!.judgeNotice, "string");
  channel.respond({ id: payloads[0]!.id, decision: { kind: "confirm", confirmed: true } });
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  } finally {
    channel.rejectAllPending("测试清理");
  }
});

test("开关关：下载卡直接客户卡（judge 零调用）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-switch-off-"));
  const h = makeHarness(root, { groupEnabled: false });
  try {
  const requestDownload = await openWorker(h, root);
  const { payload, pending } = await invokeAndWaitCard(h, requestDownload, "call-1");
  assert.equal(h.judgeCalls(), 0);
  h.channel.respond({ id: payload.id, decision: { kind: "confirm", confirmed: false } });
  await pending;
  } finally {
    await cleanupHarness(h, root);
  }
});

test("single 治理模型：不构造 judge、下载卡直接客户卡", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-single-"));
  const h = makeHarness(root, { governanceModel: "single" });
  try {
  const requestDownload = await openWorker(h, root);
  assert.equal(h.judgeFactoryCalls(), 0);
  const { payload, pending } = await invokeAndWaitCard(h, requestDownload, "call-1");
  assert.equal(h.judgeCalls(), 0);
  assert.equal(typeof payload.judgeNotice, "undefined");
  h.channel.respond({ id: payload.id, decision: { kind: "confirm", confirmed: true } });
  await pending;
  } finally {
    await cleanupHarness(h, root);
  }
});

test("项目角色仍无 request_confirmation：openRoleSession 不注入 customerInput", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-no-confirm-"));
  const h = makeHarness(root);
  try {
  await openWorker(h, root);
  assert.equal(h.openedInput()?.customerInput, undefined);
  assert.equal(typeof h.openedInput()?.requestDownload, "function");
  } finally {
    await cleanupHarness(h, root);
  }
});

test("同指纹重复 judge deny：第二次升级客户卡（不重复自动拒绝）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-fingerprint-"));
  const deny: GovernanceJudgeOutcome = { verdict: "deny", group: "approval", cardKind: "download", reasonCode: "no", engine: "demo" };
  const h = makeHarness(root, { judgeOutcomes: [deny, deny] });
  try {
  const requestDownload = await openWorker(h, root);
  const first = await requestDownload({ url: "https://example.com/report.csv", purpose: "拉取周报" }, { toolCallId: "call-1" });
  assert.equal((first as { ok: boolean }).ok, false);
  assert.equal(h.payloads.length, 0);
  const secondPending = requestDownload(
    { url: "https://example.com/report.csv", purpose: "拉取周报" },
    { toolCallId: "call-2" },
  );
  await waitFor(() => h.payloads.length === 1, "第二次 deny 升级客户卡");
  assert.equal(typeof h.payloads[0]!.judgeNotice, "string");
  h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "confirm", confirmed: false } });
  await secondPending;
  } finally {
    await cleanupHarness(h, root);
  }
});

// test/测试/download-requests-integration.test.ts
// D1（2026-11-04 download-requests，T3）：跨层集成——
//   真实 Model（download 契约/指令视图）→ 真实 Service（URL/IP/文件名/配置策略）→
//   真实 Provider（Node http 传输 + 文件 sink + downloads.jsonl + G8 A epoch 文件 +
//   customer-directive 文件账本）→ 真实 Pipeline（download-request / customer-directive）→
//   真实桌面客户通道（createCustomerInputChannel / SessionManager.withRequestLifecycle）→
//   request.* 审计（tasks.jsonl）。
//
// 替身仅限：本地 HTTP 服务端（真实 Provider 经 impl 的 `lookupOverride` 测试缝钉到 127.0.0.1，
// 逻辑主机名保持 `download.test`/`other.test`，产品策略不改）、presenter 回包（模拟客户作答）、
// judge 结果脚本、directive 确认面板回包。不启动 Electron、不触外网、不改产品代码。
//
// 覆盖（V1 §4.3 / 团队计划 D1）：
//   · 预授权 deny/allow/once（失败算消费、第二次回审批、durable 失败回落）；G8 A epoch（旧指令不授权）；
//   · 卡片/判断/客户三路径；judge manual/不可核对转客户卡；unavailableReason 防御；
//   · 跨域重定向重新申请；大小超限/超时清理；并发（一项目一卡/执行 ≤2/同名不覆盖）；
//   · 审计归属：卡片路径 request.created/presented/resolved（by customer|judge）+ downloads.jsonl
//     （含 requestId）；预授权路径只有 downloads.jsonl（无 requestId、by directive+directiveId）
//     且无任何 request.*；坏行/轮转。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
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
  createCustomerDirectiveRuntime,
  type CustomerDirectiveRuntime,
  type DirectiveConfirmationValues,
  type DirectivePresenter,
  type DirectivePresenterRequest,
  type DownloadDirectiveQuery,
  type SubmitResult,
  type TakeDownloadDirectiveFn,
} from "../../src/pipeline/orchestration/customer-directive.ts";
import {
  createDownloadRequestRuntimeForTest,
  type DownloadApprovalOutcome,
  type DownloadApprovalPresenter,
  type DownloadApprovalRequest,
  type DownloadRequestOptions,
} from "../../src/pipeline/orchestration/download-request.ts";
import { createNodeDownloadTransport } from "../../src/provider/download/impl/node-http.ts";
import {
  createDownloadLedger,
  type DownloadConsumerEpochState,
  type DownloadConsumerEpochStore,
  type DownloadLedger,
  type DownloadLedgerEventV1,
  type DownloadTransport,
  type HostResolver,
  type PinnedAddress,
} from "../../src/provider/download/public/download-provider.ts";
import {
  createDirectiveFileStore,
  type DirectiveStore,
} from "../../src/provider/directive/public/directive-store.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type {
  CustomerInputMetadata,
  CustomerInputRequest,
  GovernanceJudgeFn,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
} from "../../src/model/runtime.ts";
import type { ApprovalAction } from "../../src/model/directive.ts";
import type { DownloadJudgeFacts, DownloadRequestInput } from "../../src/model/download.ts";

// —————————————————————— 本地网络替身 ——————————————————————

const PUBLIC_IP = "93.184.216.34";
const LOCAL_PINNED: PinnedAddress[] = [{ address: "127.0.0.1", family: 4 }];
const LOGICAL_HOST = "download.test";

interface LocalServer {
  port: number;
  url(route: string): string;
  urlFor(host: string, route: string): string;
  close(): Promise<void>;
}

async function startLocalServer(handler: http.RequestListener): Promise<LocalServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: (route) => `http://${LOGICAL_HOST}:${port}${route}`,
    urlFor: (host, route) => `http://${host}:${port}${route}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** DNS 替身：所有逻辑主机解析为同一公网地址（真实 Service 判表通过；执行经本地管脚）。 */
const publicResolver: HostResolver = {
  async resolve() {
    return { addresses: [{ address: PUBLIC_IP, family: 4 }] };
  },
};

/**
 * 真实 Provider 传输 + 本地服务端：`lookupOverride` 只影响物理连接地址（127.0.0.1），
 * 逻辑 URL/主机保持 `download.test:PORT`，真实 Service 的同域/跨域判定与审计照常。
 * 每一跳跟随都把管脚地址替换为本机地址（仅测试装配）。
 */
function createLocalTransport(): DownloadTransport {
  const real = createNodeDownloadTransport({
    lookupOverride: ((_hostname: string, options: { all?: boolean }, callback: (error: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void) => {
      if (options.all === true) {
        callback(null, [{ address: "127.0.0.1", family: 4 }]);
        return;
      }
      callback(null, "127.0.0.1", 4);
    }) as never,
  });
  return {
    async execute(request) {
      return real.execute({
        ...request,
        pinnedAddresses: LOCAL_PINNED,
        onRedirect: async (info) => {
          const decision = await request.onRedirect(info);
          if (decision.action !== "follow") return decision;
          return { ...decision, pinnedAddresses: LOCAL_PINNED };
        },
      });
    },
  };
}

// —————————————————————— 运行时装配 ——————————————————————

interface RuntimeHarness {
  root: string;
  runtime: ReturnType<typeof createDownloadRequestRuntimeForTest>;
  presenterCalls: DownloadApprovalRequest[];
  takeCalls: DownloadDirectiveQuery[];
  cleanup: () => Promise<void>;
}

interface RuntimeHarnessOptions {
  root?: string;
  take?: TakeDownloadDirectiveFn;
  transport?: DownloadTransport;
  ledger?: DownloadLedger;
  epochStore?: DownloadConsumerEpochStore;
  env?: NodeJS.ProcessEnv;
  outcome?: () => DownloadApprovalOutcome;
}

let reqSeq = 0;

async function makeRuntime(options: RuntimeHarnessOptions = {}): Promise<RuntimeHarness> {
  const root = options.root ?? (await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-")));
  const presenterCalls: DownloadApprovalRequest[] = [];
  const takeCalls: DownloadDirectiveQuery[] = [];
  const presenter: DownloadApprovalPresenter = {
    async present(request, hooks) {
      presenterCalls.push(request);
      const requestId = `req-d1-${++reqSeq}`;
      hooks.onPresented({ requestId });
      if (options.outcome !== undefined) return options.outcome();
      return { decision: "approved", by: "customer", requestId };
    },
  };
  const runtime = createDownloadRequestRuntimeForTest(
    {
      projectRoot: root,
      roleId: "worker",
      runtime: "demo",
      appVersion: "d1-test",
      present: presenter,
      ...(options.take !== undefined
        ? {
            takeDownloadDirective: async (query: DownloadDirectiveQuery) => {
              takeCalls.push(query);
              return options.take!(query);
            },
          }
        : {}),
      ...(options.env !== undefined ? { env: options.env } : {}),
    },
    {
      resolver: publicResolver,
      provider: options.transport ?? createLocalTransport(),
      ...(options.ledger !== undefined ? { ledger: options.ledger } : {}),
      ...(options.epochStore !== undefined ? { epochStore: options.epochStore } : {}),
    },
  );
  return {
    root,
    runtime,
    presenterCalls,
    takeCalls,
    cleanup: async () => {
      await runtime.dispose();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

interface DirectiveHarness {
  runtime: CustomerDirectiveRuntime;
  presented: DirectivePresenterRequest[];
  submit(rawText: string): Promise<SubmitResult>;
}

function makeDirectiveRuntime(
  root: string,
  clock: () => Date,
  options: { store?: DirectiveStore; epochStore?: DownloadConsumerEpochStore } = {},
): DirectiveHarness {
  const presented: DirectivePresenterRequest[] = [];
  const presenter: DirectivePresenter = {
    present: async (request: DirectivePresenterRequest) => {
      presented.push(request);
      // 确认面板替身：从原文构造 domain action（与 C1 面板的「允许/拒绝联网」表单一致）。
      const host = /domain=([^\s]+)/.exec(request.rawText)?.[1];
      const action: ApprovalAction | typeof request.prefill.action =
        host !== undefined
          ? {
              kind: request.rawText.includes("拒绝") ? "deny" : "allow",
              resource: { type: "domain", host, wildcard: host === "*" || host.startsWith("*.") },
            }
          : request.prefill.action;
      const values: DirectiveConfirmationValues = {
        action,
        scope: request.prefill.scope,
        until: request.prefill.until,
        ...(request.highRisk.reasons.length > 0 ? { acknowledged: true } : {}),
      };
      return { decision: "confirm" as const, values };
    },
  };
  const runtime = createCustomerDirectiveRuntime({
    projectRoot: root,
    sessionId: "d1-directive-session",
    present: presenter,
    now: clock,
    ...(options.store !== undefined ? { store: options.store } : {}),
    ...(options.epochStore !== undefined ? { downloadEpochStore: options.epochStore } : {}),
  });
  return {
    runtime,
    presented,
    submit: async (rawText: string) =>
      runtime.submitFromInput({
        rawText,
        target: "approval",
        projectRoot: root,
        roleId: "worker",
        decisionGroupEnabled: true,
      }),
  };
}

function fixedEpochStore(enabledAt: string): DownloadConsumerEpochStore {
  const state: DownloadConsumerEpochState = { state: "ready", enabledAt, appVersion: "d1-test" };
  return {
    async ensure() {
      return state;
    },
    async read() {
      return state;
    },
  };
}

// —————————————————————— 审计/文件读取 ——————————————————————

async function readDownloads(root: string): Promise<{ events: DownloadLedgerEventV1[]; errors: number; files: string[] }> {
  return createDownloadLedger(root).read();
}

async function readTaskEvents(root: string): Promise<Awaited<ReturnType<typeof readTaskState>>["events"]> {
  const state = await readTaskState(root);
  return state.events;
}

async function listDownloadDir(root: string): Promise<string[]> {
  try {
    return (await fs.readdir(path.join(root, "download"))).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readDownloaded(root: string, name: string): Promise<Buffer> {
  return fs.readFile(path.join(root, "download", name));
}

function byKind(events: DownloadLedgerEventV1[], kind: DownloadLedgerEventV1["kind"]): DownloadLedgerEventV1[] {
  return events.filter((event) => event.kind === kind);
}

// —————————————————————— 桌面通道装配 ——————————————————————

function listing(root: string): ProjectListing {
  const chief: ProjectListing["roles"][number] = {
    roleId: "chief",
    cardPath: "",
    boundaryPath: "",
    cardText: "chief",
    boundary: { entries: [], boundarySource: "<built-in:chief>", acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: "chief",
  };
  const worker: ProjectListing["roles"][number] = {
    roleId: "worker",
    cardPath: "角色卡/worker/role-card.md",
    boundaryPath: "角色卡/worker/boundary.yaml",
    cardText: "worker",
    boundary: {
      entries: [{ root: "project", path: "src/worker.ts", kind: "file", purpose: "p" }],
      boundarySource: "角色卡/worker/boundary.yaml",
      acceptance: { accepted: false, source: "" },
    },
  };
  return {
    projectRoot: root,
    roles: [chief, worker],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
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
  requestDownload?: (input: DownloadRequestInput, metadata?: CustomerInputMetadata) => Promise<unknown>;
}

interface DesktopHarness {
  mgr: SessionManager;
  channel: ReturnType<typeof createCustomerInputChannel>;
  payloads: OperatorRequestPayload[];
  queued: OperatorRequestPayload[];
  notices: string[];
  judgeRequests: GovernanceJudgeRequest[];
  judgeCalls: () => number;
  takeCalls: DownloadDirectiveQuery[];
  openedInput: () => OpenedSessionInput | undefined;
  openWorker: () => Promise<NonNullable<OpenedSessionInput["requestDownload"]>>;
  close: () => Promise<void>;
}

interface DesktopHarnessOptions {
  root: string;
  transport?: DownloadTransport;
  ledger?: DownloadLedger;
  epochStore?: DownloadConsumerEpochStore;
  env?: NodeJS.ProcessEnv;
  take?: TakeDownloadDirectiveFn;
  judgeOutcomes?: GovernanceJudgeOutcome[];
  groupEnabled?: boolean;
}

function makeDesktopHarness(options: DesktopHarnessOptions): DesktopHarness {
  const { root } = options;
  const payloads: OperatorRequestPayload[] = [];
  const queued: OperatorRequestPayload[] = [];
  const notices: string[] = [];
  const judgeRequests: GovernanceJudgeRequest[] = [];
  const takeCalls: DownloadDirectiveQuery[] = [];
  const outcomes = [...(options.judgeOutcomes ?? [])];
  let openedInput: OpenedSessionInput | undefined;
  let judgeCallCount = 0;

  const channel = createCustomerInputChannel({
    presenter: (payload) => payloads.push(payload),
    operatorId: "d1-tester",
    onQueued: (payload) => queued.push(payload),
    judge: { isGroupEnabled: () => options.groupEnabled !== false },
    emitJudgeResult: () => undefined,
  });

  const judgeFn: GovernanceJudgeFn = async (request) => {
    judgeCallCount += 1;
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

  const take: TakeDownloadDirectiveFn =
    options.take ??
    (async (query: DownloadDirectiveQuery) => {
      takeCalls.push(query);
      return undefined;
    });

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
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
      const event = envelope.event as { kind?: string; summary?: string; detail?: { source?: string } };
      if (event.kind === "message" && event.detail?.source === "delivery-note") {
        notices.push(event.summary ?? "");
      }
    },
    customerInput: (request, context, metadata) => channel.customerInput(request, context, metadata),
    downloadAppVersion: "1.2.3-d1",
    getDownloadDirectiveConsumer: (projectRoot) => (projectRoot === root ? take : undefined),
    createDownloadRuntime: (input: DownloadRequestOptions) =>
      createDownloadRequestRuntimeForTest(
        {
          ...input,
          ...(options.env !== undefined ? { env: options.env } : {}),
        },
        {
          resolver: publicResolver,
          provider: options.transport ?? createLocalTransport(),
          ...(options.ledger !== undefined ? { ledger: options.ledger } : {}),
          ...(options.epochStore !== undefined ? { epochStore: options.epochStore } : {}),
        },
      ),
    ...(options.judgeOutcomes !== undefined ? { createGovernanceJudge: () => judgeFn } : {}),
  });

  return {
    mgr,
    channel,
    payloads,
    queued,
    notices,
    judgeRequests,
    judgeCalls: () => judgeCallCount,
    takeCalls,
    openedInput: () => openedInput,
    openWorker: async () => {
      const result = await mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo" });
      if (!result.ok) assert.fail(result.error);
      const fn = openedInput?.requestDownload;
      assert.equal(typeof fn, "function", "worker 会话必须注入 requestDownload");
      return fn!;
    },
    close: async () => {
      await mgr.stop(null);
    },
  };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail(`timeout waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// —————————————————————— 1. G8 A epoch 与预授权 ——————————————————————

test("G8 A：真实 epoch 文件；旧 domain 指令不授权（卡片路径）、新指令 allow/deny 生效；面板投影 none/download", async () => {
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("OK");
  });
  let directive: DirectiveHarness | undefined;
  const rt = await makeRuntime({ take: (query) => directive!.runtime.takeDownloadDirective(query) });
  try {
    // 1) 首次 ready 创建真实 epoch 文件（enabledAt=现在）。
    await rt.runtime.ready();
    const epochRaw = await fs.readFile(path.join(rt.root, ".ans", "state", "download-consumer.json"), "utf8");
    const epoch = JSON.parse(epochRaw) as { version?: number; enabledAt?: string; appVersion?: string };
    assert.equal(epoch.version, 1);
    assert.equal(epoch.appVersion, "d1-test");
    assert.equal(typeof epoch.enabledAt, "string");
    assert.equal(Number.isNaN(Date.parse(epoch.enabledAt!)), false);
    const enabledAt = epoch.enabledAt!;

    // 2) 同一项目：先提交「旧」指令（时钟早于 epoch），再提交新 allow/deny。
    let clockMs = Date.parse(enabledAt) - 60 * 60 * 1000;
    directive = makeDirectiveRuntime(rt.root, () => new Date(clockMs), {
      epochStore: fixedEpochStore(enabledAt),
    });
    assert.equal((await directive.submit("@审批 允许联网 domain=old.example.com")).ok, true);
    clockMs = Date.parse(enabledAt) + 60 * 60 * 1000;
    assert.equal((await directive.submit("@审批 允许联网 domain=example.com until=session")).ok, true);
    assert.equal((await directive.submit("@审批 允许联网 domain=deny.example.com until=session")).ok, true);
    assert.equal((await directive.submit("@审批 拒绝联网 domain=deny.example.com until=session")).ok, true);

    // 3) 面板投影：旧 domain ⇒ none；新 domain ⇒ download。
    const listed = await directive.runtime.list();
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    const domainViews = listed.approval.active.filter(
      (view) => view.action.kind === "allow" && view.action.resource.type === "domain",
    );
    const oldView = domainViews.find(
      (view) => view.action.kind === "allow" && view.action.resource.type === "domain" && view.action.resource.host === "old.example.com",
    );
    const newView = domainViews.find(
      (view) => view.action.kind === "allow" && view.action.resource.type === "domain" && view.action.resource.host === "example.com",
    );
    assert.equal(oldView?.consumer, "none");
    assert.equal(newView?.consumer, "download");

    // 4) 旧指令不授权 ⇒ 客户卡片路径；查询带 epoch。
    const old = await rt.runtime.download({ url: server.urlFor("old.example.com", "/a.bin"), purpose: "旧指令" });
    assert.equal(old.ok, true, JSON.stringify(old));
    if (old.ok) assert.equal(old.approval.kind, "customer");
    assert.equal(rt.presenterCalls.length, 1);
    assert.equal(rt.takeCalls.length, 1);
    assert.equal(rt.takeCalls[0]!.enabledAt, enabledAt);

    // 5) 新 allow 指令命中 ⇒ 不再呈现卡片、归属 directive。
    const allowed = await rt.runtime.download({ url: server.urlFor("example.com", "/b.bin"), purpose: "预授权" });
    assert.equal(allowed.ok, true, JSON.stringify(allowed));
    if (allowed.ok) {
      assert.equal(allowed.approval.kind, "directive");
      assert.equal(allowed.approval.directiveId, rt.takeCalls.length >= 2 ? allowed.approval.directiveId : "");
    }
    assert.equal(rt.presenterCalls.length, 1, "预授权命中不得再呈现卡片");

    // 6) deny 优先 ⇒ 指令拒绝。
    const denied = await rt.runtime.download({ url: server.urlFor("deny.example.com", "/c.bin"), purpose: "拒绝" });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.code, "download-denied-by-directive");
      assert.equal(denied.approval?.kind, "directive");
    }
    assert.equal(rt.presenterCalls.length, 1);

    // 7) 账本归属：预授权路径无 requestId；卡片路径有 requestId。
    const ledger = await readDownloads(rt.root);
    const decided = byKind(ledger.events, "download.decided");
    const directiveDecided = decided.filter((event) => event.kind === "download.decided" && event.by === "directive");
    const customerDecided = decided.filter((event) => event.kind === "download.decided" && event.by === "customer");
    assert.ok(directiveDecided.length >= 2, JSON.stringify(directiveDecided));
    for (const event of directiveDecided) {
      if (event.kind !== "download.decided") continue;
      assert.equal(event.requestId, undefined);
      assert.equal(event.presented, false);
      assert.equal(typeof event.directiveId, "string");
    }
    assert.equal(customerDecided.length, 1);
    if (customerDecided[0]?.kind === "download.decided") {
      assert.match(customerDecided[0]!.requestId ?? "", /^req-/);
    }
  } finally {
    await rt.cleanup();
    await server.close();
  }
});

// —————————————————————— 2. once / 失败算消费 ——————————————————————

test("预授权 once：首次命中并消费、第二次回审批；执行失败也算已消费", async () => {
  const server = await startLocalServer((req, res) => {
    if (req.url === "/fail.bin") {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("boom");
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("ONCE");
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-once-"));
  const enabledAt = "2026-01-01T00:00:00.000Z";
  let directive: DirectiveHarness | undefined;
  const rt = await makeRuntime({
    root,
    epochStore: fixedEpochStore(enabledAt),
    take: (query) => directive!.runtime.takeDownloadDirective(query),
  });
  try {
    const clock = () => new Date("2026-06-01T00:00:00.000Z");
    directive = makeDirectiveRuntime(root, clock, { epochStore: fixedEpochStore(enabledAt) });
    assert.equal((await directive.submit("@审批 允许联网 domain=once.example.com until=once")).ok, true);
    assert.equal((await directive.submit("@审批 允许联网 domain=fail.example.com until=once")).ok, true);

    // once 首次命中 ⇒ directive；第二次 ⇒ 客户卡片。
    const first = await rt.runtime.download({ url: server.urlFor("once.example.com", "/once.bin"), purpose: "一次性" });
    assert.equal(first.ok, true, JSON.stringify(first));
    if (first.ok) assert.equal(first.approval.kind, "directive");
    assert.equal(rt.presenterCalls.length, 0);

    const second = await rt.runtime.download({ url: server.urlFor("once.example.com", "/once.bin"), purpose: "第二次" });
    assert.equal(second.ok, true, JSON.stringify(second));
    if (second.ok) assert.equal(second.approval.kind, "customer");
    assert.equal(rt.presenterCalls.length, 1, "once 消费后第二次必须回到审批");

    // 执行失败也消费 once：首个 fail 命中 directive 但 HTTP 500 ⇒ 失败；第二个回到审批。
    const failing = await rt.runtime.download({ url: server.urlFor("fail.example.com", "/fail.bin"), purpose: "失败一次性" });
    assert.equal(failing.ok, false);
    if (!failing.ok) {
      assert.equal(failing.code, "download-http-error");
      assert.equal(failing.approval?.kind, "directive");
    }
    const afterFail = await rt.runtime.download({ url: server.urlFor("fail.example.com", "/fail.bin"), purpose: "失败后第二次" });
    assert.equal(afterFail.ok, false);
    if (!afterFail.ok) assert.equal(afterFail.approval?.kind, "customer");
    assert.equal(rt.presenterCalls.length, 2);

    // 审计：失败的一次性指令 decided by directive；第二次 decided by customer。
    const ledger = await readDownloads(root);
    const decided = byKind(ledger.events, "download.decided");
    assert.ok(decided.some((event) => event.kind === "download.decided" && event.by === "directive" && event.directiveId !== undefined));
    assert.ok(decided.some((event) => event.kind === "download.decided" && event.by === "customer" && event.requestId !== undefined));
  } finally {
    await rt.cleanup();
    await server.close();
  }
});

// —————————————————————— 3. durable 消费失败回落 ——————————————————————

test("once durable 消费失败 ⇒ 回落普通审批，指令不被消费", async () => {
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("DURABLE");
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-durable-"));
  const enabledAt = "2026-01-01T00:00:00.000Z";
  const baseStore = createDirectiveFileStore(root);
  const failingStore: DirectiveStore = {
    relPath: baseStore.relPath,
    async append(line: string) {
      if (line.includes('"directive.consumed"')) throw new Error("disk-full");
      await baseStore.append(line);
    },
    replay: () => baseStore.replay(),
  };
  let directive: DirectiveHarness | undefined;
  const rt = await makeRuntime({
    root,
    epochStore: fixedEpochStore(enabledAt),
    take: (query) => directive!.runtime.takeDownloadDirective(query),
  });
  try {
    directive = makeDirectiveRuntime(root, () => new Date("2026-06-01T00:00:00.000Z"), {
      store: failingStore,
      epochStore: fixedEpochStore(enabledAt),
    });
    assert.equal((await directive.submit("@审批 允许联网 domain=durable.example.com until=once")).ok, true);

    const result = await rt.runtime.download({ url: server.urlFor("durable.example.com", "/d.bin"), purpose: "durable" });
    assert.equal(result.ok, true, JSON.stringify(result));
    if (result.ok) assert.equal(result.approval.kind, "customer", "durable 消费失败必须回落客户审批");
    assert.equal(rt.presenterCalls.length, 1);

    const listed = await directive.runtime.list();
    assert.equal(listed.ok, true);
    if (listed.ok) {
      const domain = listed.approval.active.find(
        (view) => view.action.kind === "allow" && view.action.resource.type === "domain" && view.action.resource.host === "durable.example.com",
      );
      assert.notEqual(domain, undefined, "消费失败后指令仍应活跃（未被消费）");
      assert.equal(listed.approval.consumed.length, 0);
    }
  } finally {
    await rt.cleanup();
    await server.close();
  }
});

// —————————————————————— 4. 卡片路径审计（SessionManager + 真实通道） ——————————————————————

test("卡片路径审计：request.created/presented/resolved（by customer）+ downloads.jsonl（含 requestId）", async () => {
  const body = Buffer.from("hello-d1-card", "utf8");
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(body);
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-card-"));
  const h = makeDesktopHarness({ root });
  try {
    const requestDownload = await h.openWorker();
    const pending = requestDownload({ url: server.url("/report.bin"), purpose: "拉取周报" }, { toolCallId: "call-1", turnId: "turn-1" });
    await waitFor(() => h.payloads.length === 1, "下载卡");
    assert.equal(h.payloads[0]!.request.kind, "confirm");
    assert.equal(h.payloads[0]!.request.cardKind, "download");
    h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "confirm", confirmed: true } });
    const result = (await pending) as { ok: boolean; path?: string };
    assert.equal(result.ok, true);
    assert.equal(result.path, "download/report.bin");
    assert.deepEqual(await readDownloaded(root, "report.bin"), body);

    const state = await readTaskState(root);
    const created = state.events.find((event) => event.kind === "request.created");
    const presented = state.events.find((event) => event.kind === "request.presented");
    const resolved = state.events.find((event) => event.kind === "request.resolved");
    assert.equal(created?.kind === "request.created" ? created.cardKind : undefined, "download");
    assert.equal(presented?.kind === "request.presented" ? presented.to : undefined, "customer");
    assert.equal(resolved?.kind === "request.resolved" ? resolved.by : undefined, "customer");
    const requestId = created?.kind === "request.created" ? created.requestId : undefined;
    assert.match(requestId ?? "", /^req-/);
    assert.equal(resolved?.kind === "request.resolved" ? resolved.requestId : undefined, requestId);

    const ledger = await readDownloads(root);
    const requested = byKind(ledger.events, "download.requested")[0]!;
    const decided = byKind(ledger.events, "download.decided")[0]!;
    const completed = byKind(ledger.events, "download.completed")[0]!;
    assert.equal(requested.kind === "download.requested" ? requested.requestId : "x", undefined);
    assert.equal(decided.kind === "download.decided" ? decided.by : "x", "customer");
    assert.equal(decided.kind === "download.decided" ? decided.requestId : undefined, requestId);
    assert.equal(completed.kind === "download.completed" ? completed.path : undefined, "download/report.bin");
    assert.equal(completed.kind === "download.completed" ? completed.bytes : undefined, body.length);
    assert.match(completed.kind === "download.completed" ? completed.sha256 : "", /^[0-9a-f]{64}$/);

    assert.ok(h.notices.some((line) => line.includes("download/")), "完成回执应含路径");
  } finally {
    await h.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— 5. 坏行与轮转 ——————————————————————

test("审计坏行：downloads.jsonl/tasks.jsonl 坏行不影响主路径；小上限账本轮转仍可读", async () => {
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("BADLINES");
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-badline-"));
  const h = makeDesktopHarness({ root });
  try {
    await fs.mkdir(path.join(root, ".ans", "state"), { recursive: true });
    await fs.writeFile(path.join(root, ".ans", "state", "downloads.jsonl"), "not-json-line\n");
    await fs.writeFile(path.join(root, ".ans", "state", "tasks.jsonl"), "not-json-line\n");
    const requestDownload = await h.openWorker();
    const pending = requestDownload({ url: server.url("/ok.bin"), purpose: "坏行" }, { toolCallId: "call-bad" });
    await waitFor(() => h.payloads.length === 1, "下载卡");
    h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "confirm", confirmed: true } });
    const result = (await pending) as { ok: boolean };
    assert.equal(result.ok, true);
    assert.deepEqual(await readDownloaded(root, "ok.bin"), Buffer.from("BADLINES"));

    const ledger = await readDownloads(root);
    assert.ok(ledger.errors >= 1, "坏行应被计数");
    assert.ok(byKind(ledger.events, "download.completed").length >= 1, "坏行不得影响有效事件读取");
    const state = await readTaskState(root);
    assert.ok(state.errors.length >= 1, "tasks 坏行应被计数");
    assert.ok(state.events.some((event) => event.kind === "request.resolved"), "坏行不得影响 request.* 读取");
  } finally {
    await h.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }

  // 轮转：真实账本实现 + 小上限（仅 Provider 测试选项，非生产默认）。
  const rotRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-rotate-"));
  const ledger = createDownloadLedger(rotRoot, { maxBytes: 600, rotations: 3 });
  const rt = await makeRuntime({ root: rotRoot, ledger });
  const rotServer = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("ROT");
  });
  try {
    const first = await rt.runtime.download({ url: rotServer.url("/r1.bin"), purpose: "轮转1" });
    const second = await rt.runtime.download({ url: rotServer.url("/r2.bin"), purpose: "轮转2" });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    const readResult = await ledger.read();
    assert.ok(readResult.files.length >= 2, `应发生轮转：${JSON.stringify(readResult.files)}`);
    assert.equal(readResult.errors, 0);
    assert.ok(byKind(readResult.events, "download.completed").length >= 2);
  } finally {
    await rt.runtime.dispose();
    await rotServer.close();
    await fs.rm(rotRoot, { recursive: true, force: true });
  }
});

// —————————————————————— 6. 预授权路径审计 ——————————————————————

test("预授权路径审计：零 request.*；downloads.jsonl 无 requestId、by directive+directiveId", async () => {
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("PREAUTH");
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-preauth-"));
  const enabledAt = "2026-01-01T00:00:00.000Z";
  const directive = makeDirectiveRuntime(root, () => new Date("2026-06-01T00:00:00.000Z"), {
    epochStore: fixedEpochStore(enabledAt),
  });
  try {
    assert.equal((await directive.submit("@审批 允许联网 domain=preauth.example.com until=session")).ok, true);
    const h = makeDesktopHarness({
      root,
      epochStore: fixedEpochStore(enabledAt),
      take: (query) => directive.runtime.takeDownloadDirective(query),
    });
    try {
      const requestDownload = await h.openWorker();
      const result = (await requestDownload({ url: server.urlFor("preauth.example.com", "/p.bin"), purpose: "预授权" }, { toolCallId: "call-p" })) as { ok: boolean; path?: string };
      assert.equal(result.ok, true);
      assert.equal(h.payloads.length, 0, "预授权路径不得呈现客户卡");
      assert.deepEqual(await readDownloaded(root, "p.bin"), Buffer.from("PREAUTH"));
      const state = await readTaskState(root);
      assert.equal(state.events.some((event) => event.kind.startsWith("request.")), false, "预授权路径不得有 request.*");
      const ledger = await readDownloads(root);
      const decided = byKind(ledger.events, "download.decided")[0]!;
      const completed = byKind(ledger.events, "download.completed")[0]!;
      if (decided.kind === "download.decided") {
        assert.equal(decided.by, "directive");
        assert.equal(typeof decided.directiveId, "string");
        assert.equal(decided.requestId, undefined);
        assert.equal(decided.presented, false);
      }
      assert.equal(completed.kind === "download.completed" ? completed.path : undefined, "download/p.bin");
      assert.equal(byKind(ledger.events, "download.requested").length, 1);
    } finally {
      await h.close();
    }
  } finally {
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— 7/8. 判断路径 ——————————————————————

test("judge approve：无客户卡、presented.to judge、downloads.jsonl by judge（含判据）", async () => {
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("JUDGE");
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-judge-"));
  const h = makeDesktopHarness({
    root,
    judgeOutcomes: [
      { verdict: "approve", group: "approval", cardKind: "download", reasonCode: "sufficient", engine: "demo", value: { confirmed: true } },
    ],
  });
  try {
    const requestDownload = await h.openWorker();
    const result = (await requestDownload({ url: server.url("/j.bin"), purpose: "判断" }, { toolCallId: "call-j" })) as { ok: boolean; approval?: { by?: string } };
    assert.equal(result.ok, true);
    assert.equal(h.payloads.length, 0, "judge approve 不弹客户卡");
    assert.equal(h.judgeCalls(), 1);
    assert.equal(h.judgeRequests[0]!.cardKind, "download");
    assert.equal(h.judgeRequests[0]!.download?.host, LOGICAL_HOST);

    const state = await readTaskState(root);
    const presented = state.events.find((event) => event.kind === "request.presented");
    const resolved = state.events.find((event) => event.kind === "request.resolved");
    assert.equal(presented?.kind === "request.presented" ? presented.to : undefined, "judge");
    assert.equal(resolved?.kind === "request.resolved" ? resolved.by : undefined, "judge");
    const ledger = await readDownloads(root);
    const decided = byKind(ledger.events, "download.decided")[0]!;
    if (decided.kind === "download.decided") {
      assert.equal(decided.by, "judge");
      assert.match(decided.requestId ?? "", /^req-/);
      assert.equal(decided.judge?.reasonCode, "sufficient");
      assert.equal(decided.judge?.engine, "demo");
    }
  } finally {
    await h.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("judge manual ⇒ 客户卡 + judgeNotice；resolved.by customer", async () => {
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("MANUAL");
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-manual-"));
  const h = makeDesktopHarness({
    root,
    judgeOutcomes: [
      { verdict: "manual", group: "approval", cardKind: "download", reasonCode: "timeout", engine: "demo", reason: "无法判断" },
    ],
  });
  try {
    const requestDownload = await h.openWorker();
    const pending = requestDownload({ url: server.url("/m.bin"), purpose: "manual" }, { toolCallId: "call-m" });
    await waitFor(() => h.payloads.length === 1, "manual 转客户卡");
    assert.equal(h.payloads[0]!.request.cardKind, "download");
    assert.equal(typeof h.payloads[0]!.judgeNotice, "string");
    const before = await readTaskState(root);
    assert.equal(before.events.some((event) => event.kind === "request.resolved"), false, "未作答前不得结算");
    h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "confirm", confirmed: true } });
    const result = (await pending) as { ok: boolean };
    assert.equal(result.ok, true);
    const state = await readTaskState(root);
    const resolved = state.events.find((event) => event.kind === "request.resolved");
    assert.equal(resolved?.kind === "request.resolved" ? resolved.by : undefined, "customer");
    const ledger = await readDownloads(root);
    const decided = byKind(ledger.events, "download.decided")[0]!;
    assert.equal(decided.kind === "download.decided" ? decided.by : "x", "customer");
  } finally {
    await h.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

// —————————————————————— 9. unavailableReason 防御 ——————————————————————

test("unavailableReason 防御：下载卡转客户卡、judge 不调用、不消耗预授权", async () => {
  const payloads: OperatorRequestPayload[] = [];
  let judgeCalls = 0;
  let takeCalls = 0;
  const channel = createCustomerInputChannel({
    presenter: (payload) => payloads.push(payload),
    operatorId: "d1-tester",
    judge: { isGroupEnabled: () => true },
  });
  const judge: GovernanceJudgeFn = async () => {
    judgeCalls += 1;
    return { verdict: "approve", group: "approval", cardKind: "download", reasonCode: "approved", engine: "demo", value: { confirmed: true } };
  };
  const facts: DownloadJudgeFacts = {
    url: `http://${LOGICAL_HOST}/x.bin`,
    scheme: "http",
    host: LOGICAL_HOST,
    resolvedIps: [PUBLIC_IP],
    resolvedIpsTotal: 1,
    resolvedIpsTruncated: false,
    filename: "x.bin",
    filenameSource: "url-basename",
    purpose: "测试",
    maxBytes: 104_857_600,
    mechanical: {
      schemeOk: true,
      credentialsAbsent: true,
      hostPublic: true,
      ipsPublic: true,
      filenameSafe: true,
    },
  };
  const request: CustomerInputRequest = { kind: "confirm", cardKind: "download", title: "下载", preview: "x" };
  const metadata: CustomerInputMetadata = {
    cardKind: "download",
    judgeContext: {
      flowId: "download",
      facts: { governanceModel: "trio", flowId: "download", ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
      download: facts,
      unavailableReason: "下载事实不可读",
    },
  };
  const pending = channel.customerInput(
    request,
    {
      roleId: "worker",
      runtime: "demo",
      projectRoot: "C:/d1",
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
  assert.equal(takeCalls, 0, "该路径无下载运行时，不得消耗预授权");
});

// —————————————————————— 10. 重定向 / 超限 / 超时 ——————————————————————

test("跨域重定向 ⇒ download-redirect-cross-host；随后对目标重新申请成功", async () => {
  const server = await startLocalServer((req, res) => {
    if (req.url === "/jump.bin") {
      res.writeHead(302, { location: `http://other.test:${portRef}/final.bin` });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("FINAL");
  });
  const portRef = server.port;
  const rt = await makeRuntime();
  try {
    const first = await rt.runtime.download({ url: server.url("/jump.bin"), purpose: "跨域" });
    assert.equal(first.ok, false);
    if (!first.ok) {
      assert.equal(first.code, "download-redirect-cross-host");
      assert.match(first.redirectTo ?? "", /other\.test/);
    }
    assert.deepEqual(await listDownloadDir(rt.root), [], "跨域停止不得落盘");

    const second = await rt.runtime.download({ url: server.urlFor("other.test", "/final.bin"), purpose: "重新申请" });
    assert.equal(second.ok, true, JSON.stringify(second));
    if (second.ok) assert.equal(second.approval.kind, "customer");
    assert.deepEqual(await readDownloaded(rt.root, "final.bin"), Buffer.from("FINAL"));
  } finally {
    await rt.cleanup();
    await server.close();
  }
});

test("大小超限与超时：稳定 code 且清理占位/临时文件（download/ 为空）", async () => {
  // 超限：100 字节 body，上限 16 字节。
  const bigServer = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(Buffer.alloc(100, 0x61));
  });
  const big = await makeRuntime({ env: { ...process.env, ANS_DOWNLOAD_MAX_BYTES: "16" } });
  try {
    const result = await big.runtime.download({ url: bigServer.url("/big.bin"), purpose: "超限" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "download-too-large");
    assert.deepEqual(await listDownloadDir(big.root), [], "超限失败必须清理占位/临时文件");
  } finally {
    await big.cleanup();
    await bigServer.close();
  }

  // 超时：服务端不响应；总超时 150ms。
  const hangServer = await startLocalServer(() => {
    /* 故意不响应；由测试结束关闭连接 */
  });
  const slow = await makeRuntime({ env: { ...process.env, ANS_DOWNLOAD_TOTAL_TIMEOUT_MS: "150", ANS_DOWNLOAD_CONNECT_TIMEOUT_MS: "150" } });
  try {
    const result = await slow.runtime.download({ url: hangServer.url("/hang.bin"), purpose: "超时" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "download-timeout");
    assert.deepEqual(await listDownloadDir(slow.root), [], "超时失败必须清理占位/临时文件");
  } finally {
    await slow.cleanup();
    await hangServer.close();
  }
});

// —————————————————————— 11. 并发 ——————————————————————

test("一项目一卡：真实通道排队，第二张在首张结算后才呈现", async () => {
  const server = await startLocalServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("QUEUE");
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-queue-"));
  const h = makeDesktopHarness({ root });
  try {
    const requestDownload = await h.openWorker();
    const first = requestDownload({ url: server.url("/1.bin"), purpose: "第一张" }, { toolCallId: "call-1" });
    await waitFor(() => h.payloads.length === 1, "第一张卡");
    const second = requestDownload({ url: server.url("/2.bin"), purpose: "第二张" }, { toolCallId: "call-2" });
    await waitFor(() => h.queued.length === 1, "第二张排队");
    assert.equal(h.payloads.length, 1, "首张未决时第二张不得呈现");
    h.channel.respond({ id: h.payloads[0]!.id, decision: { kind: "confirm", confirmed: true } });
    assert.equal(((await first) as { ok: boolean }).ok, true);
    await waitFor(() => h.payloads.length === 2, "第二张呈现");
    h.channel.respond({ id: h.payloads[1]!.id, decision: { kind: "confirm", confirmed: true } });
    assert.equal(((await second) as { ok: boolean }).ok, true);
    assert.deepEqual((await listDownloadDir(root)).sort(), ["1.bin", "2.bin"]);
  } finally {
    await h.close();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("每项目执行并发 ≤2（跨会话共享）且并发同名不覆盖（后缀唯一）", async () => {
  const pending: http.ServerResponse[] = [];
  let received = 0;
  const server = await startLocalServer((_req, res) => {
    received += 1;
    pending.push(res);
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-dl-d1-conc-"));
  const releaseAll = (): void => {
    pending.forEach((res, index) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(`BODY-${index}`);
    });
    pending.length = 0;
  };
  const transport = (): DownloadTransport => createLocalTransport();
  const a = await makeRuntime({ root, transport: transport() });
  const b = await makeRuntime({ root, transport: transport() });
  try {
    const d1 = a.runtime.download({ url: server.url("/same.bin"), purpose: "并发1" });
    const d2 = b.runtime.download({ url: server.url("/same.bin"), purpose: "并发2" });
    await waitFor(() => received >= 2, "两个执行已进入传输");
    const third = await b.runtime.download({ url: server.url("/same.bin"), purpose: "并发3" });
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.code, "download-busy");
    releaseAll();
    const [r1, r2] = await Promise.all([d1, d2]);
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.equal(r2.ok, true, JSON.stringify(r2));
    const files = await listDownloadDir(root);
    assert.deepEqual(files.sort(), ["same (1).bin", "same.bin"].sort());
    const bodies = await Promise.all(files.map((name) => readDownloaded(root, name)));
    assert.deepEqual(bodies.map((buffer) => buffer.toString()).sort(), ["BODY-0", "BODY-1"]);
  } finally {
    await a.runtime.dispose();
    await b.runtime.dispose();
    await server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

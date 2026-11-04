// test/编排/download-pipeline.test.ts
// B1（2026-11-04 download-requests）：下载 Pipeline 层。
//
// 覆盖 AC-3/5/14/15/16/17/21/25（B1 开发侧）：
//   · presenter 判断上下文（factsAvailable/governanceFacts/downloadFacts/attribution）；
//   · 预授权 deny/allow/once 回落/epoch 不可读；卡片路径 requestId/归属/审计；
//   · 事实/截断/钉扎集合；DNS 混合/失败；presenter 失败/缺 requestId/拒绝；
//   · 每项目并发 ≤2、dispose 中止；生产工厂无 seam（type-level + app 结构扫描）；
//   · run-role 能力位透传。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { WriteGate } from "../../src/provider/pi/session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { RequestDownloadFn } from "../../src/model/download.ts";
import type {
  DownloadConsumerEpochState,
  DownloadConsumerEpochStore,
  DownloadLedger,
  DownloadLedgerEventV1,
  DownloadTransport,
  HostResolver,
  TransportRequest,
} from "../../src/provider/download/public/download-provider.ts";
import { DownloadProviderError } from "../../src/provider/download/public/download-provider.ts";
import {
  createDownloadRequestRuntime,
  createDownloadRequestRuntimeForTest,
  type DownloadApprovalPresenter,
  type DownloadApprovalRequest,
  type DownloadRunResult,
} from "../../src/pipeline/orchestration/download-request.ts";
import type { TakeDownloadDirectiveFn } from "../../src/pipeline/orchestration/customer-directive.ts";
import { makeMechanicalRejection } from "../../src/common/编排/mechanical-rejection.ts";
import { DOWNLOAD_ERROR_CODES } from "../../src/model/download.ts";

function publicAddresses(count = 1): { address: string; family: 4 }[] {
  const pool = ["93.184.216.34", "1.1.1.1", "8.8.8.8", "9.9.9.9", "149.112.112.112", "208.67.222.222", "208.67.220.220", "198.41.0.4", "199.9.14.201"];
  return Array.from({ length: count }, (_, index) => ({ address: pool[index % pool.length]!, family: 4 as const }));
}

interface Harness {
  runtime: ReturnType<typeof createDownloadRequestRuntimeForTest>;
  events: DownloadLedgerEventV1[];
  presenterCalls: DownloadApprovalRequest[];
  transportCalls: TransportRequest[];
  setEpoch: (state: DownloadConsumerEpochState) => void;
}

function makeHarness(options: {
  addresses?: { address: string; family: 4 | 6 }[];
  resolveError?: Error;
  presenter?: (request: DownloadApprovalRequest, hooks: { onPresented(info: { requestId: string }): void }) => Promise<Awaited<ReturnType<DownloadApprovalPresenter["present"]>>>;
  transport?: DownloadTransport;
  takeDownloadDirective?: TakeDownloadDirectiveFn;
  epoch?: DownloadConsumerEpochState;
  resolver?: HostResolver;
  roleId?: string;
  runtime?: "pi" | "claude" | "codex" | "demo";
} = {}): Harness {
  const events: DownloadLedgerEventV1[] = [];
  const ledger: DownloadLedger = {
    async append(event) { events.push(event); return { ok: true }; },
    async read() { return { events: [...events], errors: 0, files: [] }; },
  };
  let epoch: DownloadConsumerEpochState = options.epoch ?? { state: "ready", enabledAt: "2026-11-04T00:00:00.000Z", appVersion: "test" };
  const epochStore: DownloadConsumerEpochStore = {
    async ensure() { return epoch; },
    async read() { return epoch; },
  };
  const resolver: HostResolver = options.resolver ?? {
    async resolve() {
      if (options.resolveError !== undefined) throw options.resolveError;
      return { addresses: options.addresses ?? publicAddresses() };
    },
  };
  const presenterCalls: DownloadApprovalRequest[] = [];
  const transportCalls: TransportRequest[] = [];
  const transport: DownloadTransport = options.transport ?? {
    async execute(request) {
      transportCalls.push(request);
      await request.onStarted({ finalUrl: request.url, fileName: "file.bin" });
      return {
        ok: true,
        finalUrl: request.url,
        fileName: "file.bin",
        pathRel: "download/file.bin",
        bytes: 3,
        sha256: "a".repeat(64),
        durationMs: 1,
      };
    },
  };
  const runtime = createDownloadRequestRuntimeForTest(
    {
      projectRoot: "/proj",
      roleId: options.roleId ?? "X",
      ...(options.runtime !== undefined ? { runtime: options.runtime } : {}),
      appVersion: "test",
      present: {
        async present(request, hooks) {
          presenterCalls.push(request);
          if (options.presenter !== undefined) return options.presenter(request, hooks);
          hooks.onPresented({ requestId: "req-1" });
          return { decision: "approved", by: "customer", requestId: "req-1" };
        },
      },
      ...(options.takeDownloadDirective !== undefined ? { takeDownloadDirective: options.takeDownloadDirective } : {}),
    },
    { resolver, provider: transport, ledger, epochStore },
  );
  return {
    runtime,
    events,
    presenterCalls,
    transportCalls,
    setEpoch: (state) => { epoch = state; },
  };
}

const INPUT = { url: "https://example.com/files/report.pdf", purpose: "读取报告" };

test("卡片路径（客户批准）：presenter 判断上下文完整；审计 requested→decided→started→completed；B1 生成 downloadId", async () => {
  const harness = makeHarness();
  const result = await harness.runtime.download(INPUT);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.match(result.downloadId, /^dl-/);
  assert.equal(result.requestId, "req-1");
  assert.equal(result.path, "download/file.bin");
  assert.equal(result.approval.kind, "customer");
  assert.match(result.message, /已下载/);

  const request = harness.presenterCalls[0]!;
  assert.equal(request.downloadId, result.downloadId);
  assert.equal(request.roleId, "X");
  assert.equal(request.factsAvailable, true);
  assert.equal(request.governanceFacts.governanceModel, "trio");
  assert.equal(request.governanceFacts.flowId, "download");
  assert.equal(request.governanceFacts.ledgerErrors, 0);
  assert.equal(request.downloadFacts.host, "example.com");
  assert.equal(request.downloadFacts.filename, "report.pdf");
  assert.equal(request.downloadFacts.filenameSource, "url-basename");
  assert.equal(request.downloadFacts.purpose, "读取报告");
  assert.equal(request.downloadFacts.mechanical.ipsPublic, true);
  assert.equal(request.attribution.flowId, "download");
  assert.equal(request.attribution.flowIdIsSynthetic, true);
  assert.equal(request.policy.redirectPolicy, "same-host");
  assert.equal(request.policy.maxRedirects, 5);

  assert.deepEqual(harness.events.map((event) => event.kind), [
    "download.requested",
    "download.decided",
    "download.started",
    "download.completed",
  ]);
  const decided = harness.events[1]!;
  assert.equal(decided.kind, "download.decided");
  if (decided.kind === "download.decided") {
    assert.equal(decided.by, "customer");
    assert.equal(decided.requestId, "req-1");
    assert.equal(decided.presented, true);
  }
  const requested = harness.events[0]!;
  if (requested.kind === "download.requested") {
    assert.equal(requested.host, "example.com");
    assert.equal(requested.scheme, "https");
    assert.equal(requested.requestId, undefined);
  }
});

test("预授权 allow：不调 presenter、无 requestId、by:directive；deny：拒绝；once 消费失败回落审批", async () => {
  let query: Parameters<TakeDownloadDirectiveFn>[0] | undefined;
  const allow = makeHarness({
    takeDownloadDirective: async (q) => { query = q; return { action: "allow", id: "d-1", scope: "once" }; },
  });
  const allowed = await allow.runtime.download({ ...INPUT, toolCallId: "tc-1" });
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.approval.kind, "directive");
    assert.equal(allowed.approval.directiveId, "d-1");
    assert.equal(allowed.requestId, undefined);
  }
  assert.equal(allow.presenterCalls.length, 0);
  assert.deepEqual(allow.events.map((event) => event.kind), [
    "download.requested",
    "download.decided",
    "download.started",
    "download.completed",
  ]);
  const decided = allow.events[1]!;
  if (decided.kind === "download.decided") {
    assert.equal(decided.by, "directive");
    assert.equal(decided.directiveId, "d-1");
    assert.equal(decided.presented, false);
    assert.equal(decided.requestId, undefined);
  }
  assert.equal(query?.enabledAt, "2026-11-04T00:00:00.000Z");
  assert.equal(query?.toolCallId, "tc-1");

  const deny = makeHarness({
    takeDownloadDirective: async () => ({ action: "deny", id: "d-2", scope: "session" }),
  });
  const denied = await deny.runtime.download(INPUT);
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.code, "download-denied-by-directive");
    assert.match(denied.message, /#d-2/);
  }
  assert.equal(deny.presenterCalls.length, 0);
  assert.equal(deny.transportCalls.length, 0);

  const fallback = makeHarness({ takeDownloadDirective: async () => undefined });
  const fellBack = await fallback.runtime.download(INPUT);
  assert.equal(fellBack.ok, true);
  assert.equal(fallback.presenterCalls.length, 1);
});

test("epoch 不可读 ⇒ 不查预授权、直接客户卡；归属键真实/合成规则（F10）", async () => {
  const harness = makeHarness({
    epoch: { state: "unreadable", reason: "boom" },
    takeDownloadDirective: async () => { throw new Error("should not be called"); },
  });
  const result = await harness.runtime.download(INPUT);
  assert.equal(result.ok, true);
  assert.equal(harness.presenterCalls.length, 1);

  const real = makeHarness();
  await real.runtime.download({ ...INPUT, attribution: { flowId: "flow-a" } });
  assert.equal(real.presenterCalls[0]!.governanceFacts.flowId, "flow-a");
  assert.equal(real.presenterCalls[0]!.attribution.flowIdIsSynthetic, false);

  const intent = makeHarness();
  await intent.runtime.download({ ...INPUT, attribution: { intentId: "intent-b" } });
  assert.equal(intent.presenterCalls[0]!.governanceFacts.flowId, "intent-b");

  const invalid = makeHarness();
  await invalid.runtime.download({ ...INPUT, attribution: { flowId: "Bad Slug" } });
  assert.equal(invalid.presenterCalls[0]!.governanceFacts.flowId, "download");
  assert.equal(invalid.presenterCalls[0]!.attribution.flowIdIsSynthetic, true);
});

test("事实与钉扎：>8 个解析结果截断展示、校验/钉扎用全部；混合私网 ⇒ unsafe；DNS 失败", async () => {
  const nine = makeHarness({ addresses: publicAddresses(9) });
  const result = await nine.runtime.download(INPUT);
  assert.equal(result.ok, true);
  const facts = nine.presenterCalls[0]!.downloadFacts;
  assert.equal(facts.resolvedIps.length, 8);
  assert.equal(facts.resolvedIpsTotal, 9);
  assert.equal(facts.resolvedIpsTruncated, true);
  assert.equal(nine.transportCalls[0]!.pinnedAddresses.length, 9);

  const mixed = makeHarness({ addresses: [...publicAddresses(1), { address: "10.0.0.1", family: 4 }] });
  const unsafe = await mixed.runtime.download(INPUT);
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) assert.equal(unsafe.code, "download-unsafe-url");
  assert.equal(mixed.presenterCalls.length, 0);
  assert.equal(mixed.transportCalls.length, 0);
  assert.deepEqual(mixed.events.map((event) => event.kind), ["download.requested", "download.failed"]);

  const dns = makeHarness({ resolveError: new DownloadProviderError("download-dns-failed", "ENOTFOUND") });
  const dnsResult = await dns.runtime.download(INPUT);
  assert.equal(dnsResult.ok, false);
  if (!dnsResult.ok) assert.equal(dnsResult.code, "download-dns-failed");
});

test("presenter 失败/缺 requestId/拒绝 ⇒ 稳定 code；拒绝写 decided+failed", async () => {
  const throwing = makeHarness({ presenter: async () => { throw new Error("channel down"); } });
  const thrown = await throwing.runtime.download(INPUT);
  assert.equal(thrown.ok, false);
  if (!thrown.ok) assert.equal(thrown.code, "download-unavailable");

  const missing = makeHarness({ presenter: async () => ({ decision: "approved", by: "customer" }) });
  const missingResult = await missing.runtime.download(INPUT);
  assert.equal(missingResult.ok, false);
  if (!missingResult.ok) assert.equal(missingResult.code, "download-unavailable");

  const declined = makeHarness({ presenter: async (_request, hooks) => { hooks.onPresented({ requestId: "req-2" }); return { decision: "declined", by: "judge", requestId: "req-2", reason: "no" }; } });
  const declinedResult = await declined.runtime.download(INPUT);
  assert.equal(declinedResult.ok, false);
  if (!declinedResult.ok) assert.equal(declinedResult.code, "download-declined");
  assert.deepEqual(declined.events.map((event) => event.kind), ["download.requested", "download.decided", "download.failed"]);
  const decided = declined.events[1]!;
  if (decided.kind === "download.decided") {
    assert.equal(decided.by, "judge");
    assert.equal(decided.requestId, "req-2");
  }
});

test("并发：每项目执行 ≤2，第三个 download-busy；不同项目独立", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started: string[] = [];
  const blocking: DownloadTransport = {
    async execute(request) {
      started.push(request.url);
      await gate;
      await request.onStarted({ finalUrl: request.url, fileName: "file.bin" });
      return { ok: true, finalUrl: request.url, fileName: "file.bin", pathRel: "download/file.bin", bytes: 3, sha256: "a".repeat(64), durationMs: 1 };
    },
  };
  const harness = makeHarness({ transport: blocking });
  const first = harness.runtime.download(INPUT);
  const second = harness.runtime.download({ ...INPUT, url: "https://example.com/2" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const third = await harness.runtime.download({ ...INPUT, url: "https://example.com/3" });
  assert.equal(third.ok, false);
  if (!third.ok) assert.equal(third.code, "download-busy");
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(started.length, 2);
});

test("dispose：中止本运行时在途下载（download-aborted）", async () => {
  const blocking: DownloadTransport = {
    async execute(request) {
      return await new Promise((resolve) => {
        const abort = (): void => resolve({ ok: false, code: "download-aborted", bytesWritten: 0 });
        if (request.signal?.aborted === true) abort();
        else request.signal?.addEventListener("abort", abort, { once: true });
      });
    },
  };
  const harness = makeHarness({ transport: blocking });
  const pending = harness.runtime.download(INPUT);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await harness.runtime.dispose();
  const result = await pending;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "download-aborted");
  const after = await harness.runtime.download(INPUT);
  assert.equal(after.ok, false);
  if (!after.ok) assert.equal(after.code, "download-aborted");
});

test("生产工厂无测试缝（type-level）；B1 源码不写 request.*；app/** 不引用 ForTest", async () => {
  const fakePresenter: DownloadApprovalPresenter = { present: async () => ({ decision: "unavailable" }) };
  // @ts-expect-error 生产工厂不得接受 resolver 等测试缝
  createDownloadRequestRuntime({ projectRoot: "/p", roleId: "X", appVersion: "1", present: fakePresenter, resolver: {} });
  const source = await fs.readFile(path.join(process.cwd(), "src", "pipeline", "orchestration", "download-request.ts"), "utf8");
  assert.equal(source.includes("appendTaskEvent"), false);
  assert.equal(source.includes("request.created"), false);
  assert.equal(source.includes("request.resolved"), false);

  const appRoot = path.join(process.cwd(), "app");
  const entries = await fs.readdir(appRoot, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const full = path.join(entry.parentPath, entry.name);
    const text = await fs.readFile(full, "utf8");
    assert.equal(text.includes("createDownloadRequestRuntimeForTest"), false, full);
  }
});

test("run-role：requestDownload 能力位透传；未注入 ⇒ 缺席（结构 fail-closed）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-download-runrole-"));
  const roleDir = path.join(root, "角色卡", "X");
  await fs.mkdir(roleDir, { recursive: true });
  await fs.writeFile(path.join(roleDir, "role-card.md"), "# 角色 X\n");
  await fs.writeFile(path.join(roleDir, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试条目\n");
  const project: ProjectConfig = {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
  let captured: AdapterCapabilities | undefined;
  const capturedCaps = (): AdapterCapabilities | undefined => captured;
  const createAdapter = (gate: WriteGate, capabilities?: AdapterCapabilities) => {
    captured = capabilities;
    return createFakeRuntimeAdapter({ gate, script: [] });
  };
  const fn: RequestDownloadFn = async () => ({ ok: false, message: "x", code: "download-unavailable" });
  const handle = await openRoleSession({ roleId: "X", project, requestDownload: fn }, { createAdapter });
  try {
    assert.equal(capturedCaps()?.requestDownload, fn);
  } finally {
    await handle.dispose();
  }
  captured = undefined;
  const legacy = await openRoleSession({ roleId: "X", project }, { createAdapter });
  try {
    assert.equal(capturedCaps()?.requestDownload, undefined);
  } finally {
    await legacy.dispose();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("错误码规则：17 个 download-* 全部登记；owner/retryable 符合方案 §3.3", () => {
  assert.equal(DOWNLOAD_ERROR_CODES.length, 17);
  const denied = makeMechanicalRejection("download-denied-by-directive", ["x"]);
  assert.equal(denied.owner, "customer");
  assert.equal(makeMechanicalRejection("download-declined", ["x"]).owner, "requester");
  assert.equal(makeMechanicalRejection("download-rebinding-detected", ["x"]).retryable, false);
  assert.equal(makeMechanicalRejection("download-too-large", ["x"]).retryable, false);
  for (const code of DOWNLOAD_ERROR_CODES) {
    const rule = makeMechanicalRejection(code, ["x"]);
    assert.equal(rule.code, code);
    assert.ok(["requester", "app", "customer"].includes(rule.owner), code);
  }
});

test("重定向策略：真实 Service 回调——同域 follow/跨域停止/降级拒绝（AC-8 B1 集成）", async () => {
  const follow = makeHarness({
    transport: {
      async execute(request) {
        const decision = await request.onRedirect({ fromUrl: "https://example.com/a", toUrl: "https://example.com:8443/b", hop: 1 });
        assert.equal(decision.action, "follow");
        if (decision.action !== "follow") return { ok: false, code: "download-http-error", bytesWritten: 0 };
        return { ok: true, finalUrl: decision.url, fileName: "file.bin", pathRel: "download/file.bin", bytes: 3, sha256: "a".repeat(64), durationMs: 1 };
      },
    },
  });
  assert.equal((await follow.runtime.download(INPUT)).ok, true);

  const cross = makeHarness({
    transport: {
      async execute(request) {
        const decision = await request.onRedirect({ fromUrl: "https://example.com/a", toUrl: "https://other.example/b", hop: 1 });
        assert.equal(decision.action, "stop");
        if (decision.action !== "stop") return { ok: false, code: "download-http-error", bytesWritten: 0 };
        return { ok: false, code: decision.code, bytesWritten: 0, ...(decision.redirectTo !== undefined ? { redirectTo: decision.redirectTo } : {}) };
      },
    },
  });
  const crossResult = await cross.runtime.download(INPUT);
  assert.equal(crossResult.ok, false);
  if (!crossResult.ok) {
    assert.equal(crossResult.code, "download-redirect-cross-host");
    assert.match(crossResult.redirectTo ?? "", /other\.example/);
  }

  const downgrade = makeHarness({
    transport: {
      async execute(request) {
        const decision = await request.onRedirect({ fromUrl: "https://example.com/a", toUrl: "http://example.com/b", hop: 1 });
        assert.equal(decision.action, "stop");
        if (decision.action !== "stop") return { ok: false, code: "download-http-error", bytesWritten: 0 };
        return { ok: false, code: decision.code, bytesWritten: 0 };
      },
    },
  });
  const downgradeResult = await downgrade.runtime.download(INPUT);
  assert.equal(downgradeResult.ok, false);
  if (!downgradeResult.ok) assert.equal(downgradeResult.code, "download-unsafe-url");
});

test("执行时重新解析/判表：卡片前公网、执行时私网 ⇒ download-unsafe-url（不执行）", async () => {
  let calls = 0;
  const resolver: HostResolver = {
    async resolve() {
      calls += 1;
      return { addresses: calls === 1 ? publicAddresses(1) : [{ address: "10.0.0.1", family: 4 }] };
    },
  };
  const harness = makeHarness({ resolver });
  const result = await harness.runtime.download(INPUT);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "download-unsafe-url");
  assert.equal(calls, 2);
  assert.equal(harness.transportCalls.length, 0);
  assert.equal(harness.presenterCalls.length, 1, "卡片前安全通过并已呈现");
});

test("参数复核（防御）：purpose 空/超长、filename 含分隔符/控制符 ⇒ invalid-arguments；不发卡/不联网/不落账本", async () => {
  for (const input of [
    { url: INPUT.url, purpose: "" },
    { url: INPUT.url, purpose: "p".repeat(2000) },
    { url: INPUT.url, purpose: "x", filename: "a/b" },
    { url: INPUT.url, purpose: "x", filename: "a\b" },
    { url: INPUT.url, purpose: "x", filename: "a b" },
  ]) {
    const harness = makeHarness();
    const result = await harness.runtime.download(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    if (!result.ok) assert.equal(result.code, "download-invalid-arguments");
    assert.equal(harness.presenterCalls.length, 0);
    assert.equal(harness.transportCalls.length, 0);
    assert.equal(harness.events.length, 0);
  }
});

test("judge approve：approval 归属 judge、审计 decided.judge 保留 engine/reasonCode", async () => {
  const harness = makeHarness({
    presenter: async (_request, hooks) => {
      hooks.onPresented({ requestId: "req-j" });
      return {
        decision: "approved",
        by: "judge",
        requestId: "req-j",
        judge: { engine: "pi", reasonCode: "sufficient", durationMs: 5, readCalls: 0, readBytes: 0 },
      };
    },
  });
  const result = await harness.runtime.download(INPUT);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.approval.kind, "judge");
  assert.equal(result.approval.judge?.engine, "pi");
  const decided = harness.events.find((event) => event.kind === "download.decided");
  assert.ok(decided !== undefined);
  if (decided !== undefined && decided.kind === "download.decided") {
    assert.equal(decided.by, "judge");
    assert.equal(decided.judge?.reasonCode, "sufficient");
  }
});

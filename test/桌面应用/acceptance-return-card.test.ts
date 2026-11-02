// test/桌面应用/acceptance-return-card.test.ts
// 2026-11-02 acceptance-return-card（A4）：SessionManager 级验收决定卡展示载荷。
//
// 目标：证明真实 `withRequestLifecycle`/`enrichAcceptanceJudgeContext` 路径把
// `docs/quality/<flowId>-report-v1.md` 的 16 KiB 安全投影放进 `ctx.acceptanceReport`
// 与 presenter payload；缺失/不可读/无/非法 flowId/旧 payload 降级；选项/作答路径不变。
// 注意：本文件是 SessionManager 级证据；`optional-acceptance.test.ts` 是 channel 级，
// 不能单独证明 AC-5–AC-7。真实渲染 DOM/E2E 由 A3/A5/D1 负责。

import test from "node:test";
import assert from "node:assert/strict";
import fsNode from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  createCustomerInputChannel,
  type DesktopCustomerInputFn,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputFn, CustomerInputMetadata, CustomerInputRequest } from "../../src/model/runtime.ts";

const PREVIEW_MARKER = "PREVIEW-ARC-MARKER";
const REPORT_MARKER = "AR-CARD-REPORT-MARKER";

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

interface Harness {
  mgr: SessionManager;
  channel: ReturnType<typeof createCustomerInputChannel>;
  payloads: OperatorRequestPayload[];
  contexts: Array<Parameters<DesktopCustomerInputFn>[1]>;
  metadatas: Array<CustomerInputMetadata | undefined>;
  opened: () => CustomerInputFn | undefined;
}

function makeHarness(root: string): Harness {
  const payloads: OperatorRequestPayload[] = [];
  const contexts: Array<Parameters<DesktopCustomerInputFn>[1]> = [];
  const metadatas: Array<CustomerInputMetadata | undefined> = [];
  let opened: CustomerInputFn | undefined;
  let channel!: ReturnType<typeof createCustomerInputChannel>;
  const presenter = (payload: OperatorRequestPayload): void => {
    payloads.push(payload);
    channel.respond({ id: payload.id, decision: { kind: "choice", selected: ["accept"] } });
  };
  channel = createCustomerInputChannel({
    presenter,
    operatorId: "tester",
    nextId: (() => {
      let n = 0;
      return () => `op-${++n}`;
    })(),
  });
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      opened = input.customerInput;
      const handle: RoleSessionHandle = {
        async send() {},
        events() {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => {
      throw new Error("no pi");
    },
    createDemoAdapter: () => {
      throw new Error("no demo");
    },
    buildProjectConfig,
    getListing: (candidate) => (candidate === root ? listing(root) : undefined),
    emitEvent: () => {},
    runtimeOptions: { extraCredentialEnvVars: ["ANS_ARC_TEST_SECRET"] },
    customerInput: (req, ctx, metadata) => {
      contexts.push(ctx);
      metadatas.push(metadata);
      return channel.customerInput(req, ctx, metadata);
    },
  });
  return { mgr, channel, payloads, contexts, metadatas, opened: () => opened };
}

async function openVerifier(root: string): Promise<Harness & { customerInput: CustomerInputFn }> {
  const h = makeHarness(root);
  const result = await h.mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
  if (!result.ok) assert.fail(result.error);
  const customerInput = h.opened();
  assert.equal(typeof customerInput, "function", "verifier 会话必须注入 customerInput");
  return { ...h, customerInput: customerInput! };
}

function acceptanceRequest(flowId?: string): CustomerInputRequest {
  return {
    kind: "choice",
    title: "验收复核结论：通过？",
    question: "请选择验收结论",
    cardKind: "acceptance",
    sourceRoleId: "verifier",
    ...(flowId !== undefined ? { flowId } : {}),
    preview: `${PREVIEW_MARKER} 验收卡说明`,
    options: [
      { id: "accept", label: "验收通过", recommended: true },
      { id: "rework", label: "退回返工" },
    ],
  };
}

async function writeReport(root: string, flowId: string, text: string): Promise<string> {
  const rel = `docs/quality/${flowId}-report-v1.md`;
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), text, "utf8");
  return rel;
}

async function sha256File(file: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function callCustomerInput(
  h: Harness & { customerInput: CustomerInputFn },
  request: CustomerInputRequest,
  metadata?: CustomerInputMetadata,
) {
  const beforePayloads = h.payloads.length;
  const beforeContexts = h.contexts.length;
  const outcome = await h.customerInput(request, metadata);
  assert.equal(h.payloads.length, beforePayloads + 1, "应呈现一张客户卡");
  assert.equal(h.contexts.length, beforeContexts + 1, "SessionManager 必须构造一次 ctx");
  return {
    outcome,
    payload: h.payloads[h.payloads.length - 1]!,
    ctx: h.contexts[h.contexts.length - 1]!,
    metadata: h.metadatas[h.metadatas.length - 1],
  };
}

async function withReadSpy<T>(run: () => Promise<T>): Promise<{ result: T; reads: string[] }> {
  const original = fsNode.promises.readFile;
  const reads: string[] = [];
  fsNode.promises.readFile = (async (...args: unknown[]) => {
    reads.push(String(args[0]));
    return (original as unknown as (...inner: unknown[]) => Promise<unknown>)(...args);
  }) as typeof fsNode.promises.readFile;
  try {
    return { result: await run(), reads };
  } finally {
    fsNode.promises.readFile = original;
  }
}

function previewOf(request: CustomerInputRequest): string | undefined {
  return request.kind === "choice" ? request.preview : undefined;
}

function optionsOf(request: CustomerInputRequest): unknown {
  return request.kind === "choice" ? request.options : undefined;
}

test("正常文件：ctx/presenter payload 为 16 KiB 投影，选项/作答路径不变，任务账本无展示正文", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-normal-"));
  const report = `验收报告正文\n${REPORT_MARKER}\n共 3 行\n`;
  const rel = await writeReport(root, "flow-a", report);
  const file = path.join(root, rel);
  const h = await openVerifier(root);
  const beforeHash = await sha256File(file);
  try {
    const req = acceptanceRequest("flow-a");
    const { result, reads } = await withReadSpy(() => callCustomerInput(h, req));
    const { outcome, payload, ctx, metadata } = result;
    assert.equal(metadata?.judgeContext?.facts.qualityReportPath, rel);
    assert.equal(metadata?.judgeContext?.artifacts?.acceptanceReportPath, rel);
    assert.deepEqual(ctx.acceptanceReport, {
      version: 1,
      path: rel,
      text: { text: report, truncated: false, redacted: false },
    });
    assert.deepEqual(payload.acceptanceReport, ctx.acceptanceReport);
    assert.deepEqual(payload.request, req);
    assert.deepEqual(optionsOf(payload.request), optionsOf(req));
    assert.equal(previewOf(payload.request), previewOf(req));
    assert.equal(outcome?.outcome, "answered");
    assert.deepEqual(outcome?.outcome === "answered" ? outcome.value.selected : undefined, ["accept"]);
    assert.ok(
      reads.some((candidate) => path.resolve(candidate) === path.resolve(file)),
      "应复用 enrich 已有的 docs/quality 报告读取",
    );
    assert.equal(await sha256File(file), beforeHash, "投影不得改写原报告文件");
    const state = await readTaskState(root);
    const created = state.events.find((event) => event.kind === "request.created");
    assert.ok(created, "应写入 request.created");
    assert.equal("acceptanceReport" in created, false, "request.created 不得写展示字段");
    assert.equal(JSON.stringify(state.events).includes(REPORT_MARKER), false, "任务账本不得写报告正文");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test(">16 KiB：投影为 UTF-8 前缀且 truncated=true，原文件不改写", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-large-"));
  const report = "0123456789abcdef".repeat(1100); // 17,600 bytes
  const rel = await writeReport(root, "flow-large", report);
  const file = path.join(root, rel);
  const h = await openVerifier(root);
  const beforeHash = await sha256File(file);
  try {
    const { result } = await withReadSpy(() => callCustomerInput(h, acceptanceRequest("flow-large")));
    const acceptanceReport = result.ctx.acceptanceReport;
    assert.ok(acceptanceReport, "大文件也应有投影");
    assert.equal(acceptanceReport.version, 1);
    assert.equal(acceptanceReport.path, rel);
    assert.equal(acceptanceReport.text.truncated, true);
    assert.equal(acceptanceReport.text.redacted, false);
    assert.ok(Buffer.byteLength(acceptanceReport.text.text, "utf8") <= 16384);
    assert.deepEqual(result.payload.acceptanceReport, acceptanceReport);
    assert.equal(await sha256File(file), beforeHash, "投影不得改写原报告文件");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("净化：测试注入的伪凭据值被替换且 redacted=true，不泄漏明文", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-redact-"));
  const secret = "ans-arc-test-secret-9f3a2c";
  process.env.ANS_ARC_TEST_SECRET = secret;
  const report = `验收报告正文\ncredential=${secret}\n结尾\n`;
  const rel = await writeReport(root, "flow-redact", report);
  const file = path.join(root, rel);
  const h = await openVerifier(root);
  const beforeHash = await sha256File(file);
  try {
    const result = await callCustomerInput(h, acceptanceRequest("flow-redact"));
    const acceptanceReport = result.ctx.acceptanceReport;
    assert.ok(acceptanceReport, "报告应可投影");
    assert.equal(acceptanceReport.text.redacted, true);
    assert.equal(acceptanceReport.text.text.includes(secret), false, "不得泄漏伪凭据明文");
    assert.equal(acceptanceReport.text.text.includes("[REDACTED]"), true);
    assert.equal(await sha256File(file), beforeHash, "投影不得改写原报告文件");
  } finally {
    delete process.env.ANS_ARC_TEST_SECRET;
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("空文件：无 acceptanceReport，preview 保留，卡仍可作答", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-empty-"));
  await writeReport(root, "flow-empty", "   \n");
  const h = await openVerifier(root);
  try {
    const req = acceptanceRequest("flow-empty");
    const result = await callCustomerInput(h, req);
    assert.equal("acceptanceReport" in result.ctx, false);
    assert.equal("acceptanceReport" in result.payload, false);
    assert.equal(previewOf(result.payload.request), previewOf(req));
    assert.deepEqual(optionsOf(result.payload.request), optionsOf(req));
    assert.equal(result.outcome?.outcome, "answered");
    assert.deepEqual(result.outcome?.outcome === "answered" ? result.outcome.value.selected : undefined, ["accept"]);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("缺失文件：无 acceptanceReport，preview 保留，卡仍可作答", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-missing-"));
  const h = await openVerifier(root);
  try {
    const req = acceptanceRequest("flow-missing");
    const result = await callCustomerInput(h, req);
    assert.equal("acceptanceReport" in result.ctx, false);
    assert.equal("acceptanceReport" in result.payload, false);
    assert.equal(previewOf(result.payload.request), previewOf(req));
    assert.equal(result.outcome?.outcome, "answered");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("不可读（报告路径为目录/EISDIR）：无 acceptanceReport，不抛错，卡仍可作答", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-unreadable-"));
  const rel = "docs/quality/flow-unreadable-report-v1.md";
  await fs.mkdir(path.join(root, rel), { recursive: true });
  const h = await openVerifier(root);
  try {
    const req = acceptanceRequest("flow-unreadable");
    const result = await callCustomerInput(h, req);
    assert.equal("acceptanceReport" in result.ctx, false);
    assert.equal("acceptanceReport" in result.payload, false);
    assert.equal(previewOf(result.payload.request), previewOf(req));
    assert.equal(result.outcome?.outcome, "answered");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("无 flowId（P1-ARC-04）：不构造/不读取 docs/quality，judgeContext 不新增报告路径，preview 与作答不变", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-noflow-"));
  const h = await openVerifier(root);
  try {
    const metadata: CustomerInputMetadata = {
      judgeContext: {
        flowId: "flow-a",
        facts: {
          governanceModel: "trio",
          flowId: "flow-a",
          ledgerErrors: 0,
          unresolvedClarificationCount: 0,
          latestDecisionKinds: [],
        },
        artifacts: { proposalPath: "docs/proposals/upstream-proposal-v1.md" },
      },
    };
    const req = acceptanceRequest();
    const { result, reads } = await withReadSpy(() => callCustomerInput(h, req, metadata));
    assert.equal("acceptanceReport" in result.ctx, false);
    assert.equal("acceptanceReport" in result.payload, false);
    assert.equal(result.metadata?.judgeContext?.facts.qualityReportPath, undefined);
    assert.equal(result.metadata?.judgeContext?.artifacts?.acceptanceReportPath, undefined);
    assert.equal(
      result.metadata?.judgeContext?.artifacts?.proposalPath,
      "docs/proposals/upstream-proposal-v1.md",
      "无 flowId 沿用旧早退，不新增报告路径、不改写上游 facts/artifacts",
    );
    assert.deepEqual(result.metadata?.judgeContext, metadata.judgeContext, "无 flowId 沿用旧早退，不改写 metadata");
    assert.equal(
      reads.filter((candidate) => candidate.includes("docs/quality")).length,
      0,
      "无 flowId 不得读取 docs/quality 路径",
    );
    assert.equal(previewOf(result.payload.request), previewOf(req));
    assert.equal(result.outcome?.outcome, "answered");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("非法 flowId：不越界读取，facts/artifacts 不含报告路径，unavailableReason fail-closed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-invalid-"));
  const token = `ans-arc-outside-${Date.now()}`;
  const flowId = `../../../${token}`;
  const sentinel = path.resolve(root, `docs/quality/${flowId}-report-v1.md`);
  const sentinelText = "OUTSIDE-SENTINEL-ARC-CONTENT";
  await fs.writeFile(sentinel, sentinelText, "utf8");
  const h = await openVerifier(root);
  try {
    const req = acceptanceRequest(flowId);
    const { result, reads } = await withReadSpy(() => callCustomerInput(h, req));
    assert.equal("acceptanceReport" in result.ctx, false);
    assert.equal("acceptanceReport" in result.payload, false);
    assert.equal(result.metadata?.judgeContext?.facts.qualityReportPath, undefined);
    assert.equal(result.metadata?.judgeContext?.artifacts, undefined);
    assert.match(String(result.metadata?.judgeContext?.unavailableReason), /验收最小链事实缺失.*质检报告/);
    assert.equal(
      reads.some((candidate) => path.resolve(candidate) === path.resolve(sentinel)),
      false,
      "非法 flowId 不得读取项目外 sentinel",
    );
    assert.equal(String(result.payload.acceptanceReport ?? "").includes(sentinelText), false);
    assert.equal(previewOf(result.payload.request), previewOf(req));
    assert.deepEqual(optionsOf(result.payload.request), optionsOf(req));
    assert.equal(result.outcome?.outcome, "answered");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(sentinel, { force: true });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("旧 payload（channel 级）：无 acceptanceReport 字段，preview 保留，卡仍可作答（P1-ARC-05）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-legacy-"));
  const h = makeHarness(root);
  try {
    const req = acceptanceRequest("flow-legacy");
    const before = h.payloads.length;
    const outcome = await h.channel.customerInput(req, {
      roleId: "verifier",
      runtime: "demo",
      projectRoot: root,
      governanceModel: "trio",
    });
    assert.equal(h.payloads.length, before + 1);
    const payload = h.payloads[h.payloads.length - 1]!;
    assert.equal("acceptanceReport" in payload, false);
    assert.equal(previewOf(payload.request), previewOf(req));
    assert.equal(outcome?.outcome, "answered");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("诊断只记白名单元数据：不写报告正文/凭据，成功时 state 编码 flags", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-diag-"));
  const diagDir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-arc-diag-log-"));
  const report = `验收报告正文\nDIAGNOSTIC-REPORT-MARKER\n`;
  await writeReport(root, "flow-diag", report);
  configureDiagnostics({ directory: diagDir });
  const h = await openVerifier(root);
  try {
    await callCustomerInput(h, acceptanceRequest("flow-diag"));
    await flushDiagnostics();
    const files = await fs.readdir(diagDir);
    const log = (await Promise.all(files.map((name) => fs.readFile(path.join(diagDir, name), "utf8")))).join("\n");
    assert.match(log, /acceptance\.card\.report\.display/);
    assert.match(log, /"state":"plain"/);
    assert.equal(log.includes("DIAGNOSTIC-REPORT-MARKER"), false, "诊断不得写报告正文");
    assert.equal(log.includes("ans-arc-test-secret-9f3a2c"), false, "诊断不得写凭据");
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
    await fs.rm(diagDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

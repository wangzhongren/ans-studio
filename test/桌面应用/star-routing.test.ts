// test/桌面应用/star-routing.test.ts
// B 批（2026-10-28）：星形派发——幕僚可派任意内置/项目 worker；任务落 tasks.jsonl；
// 回交意图携带 taskId；同 idempotencyKey 未收口不重复派；convener 旧 dispatch 保留到 D（仍走旧门）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { listRunManifestsResult } from "../../src/common/编排/run-manifest.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchTaskFn, DispatchReceipt, DispatchTaskPayload } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("等待超时");
    await tick(10);
  }
}

async function readDiagnostics(directory: string): Promise<string> {
  let names: string[] = [];
  try {
    names = await fs.readdir(directory);
  } catch {
    return "";
  }
  const texts = await Promise.all(
    names.filter((name) => name.endsWith(".jsonl")).map((name) => fs.readFile(path.join(directory, name), "utf8")),
  );
  return texts.join("\n");
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
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
    roles: [builtIn("chief", "chief"), builtIn("product", "product"), builtIn("convener", "schedule"), worker("worker"), worker("other")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

/**
 * B7.1（2026-11-11）：本套件验证 **legacy 星形派发/回交**旧行为；空 trio 项目聊天自 B6.1 起默认为 fixed，
 * 而 B7.1 起 fixed 聊天拒绝普通星形派发 ⇒ 夹具显式写明「旧项目」（断言不改，仅固定项目模式）。
 */
function markLegacyProject(root: string): void {
  mkdirSync(path.join(root, ".ans"), { recursive: true });
  writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
}

function harness(root: string, options: { openFailFor?: string; holdFirstSendFor?: string } = {}) {
  markLegacyProject(root);
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  let releaseHold: (() => void) | undefined;
  const holdPromise = new Promise<void>((resolve) => { releaseHold = resolve; });
  let held = false;
  const holdFirstSendFor = options.holdFirstSendFor;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      if (options.openFailFor === input.roleId) throw new Error("运行时配置缺失（测试）");
      caps[input.roleId] = (input as { dispatchTask?: DispatchTaskFn }).dispatchTask;
      const handle: RoleSessionHandle = {
        async send(text, options) {
          (sent[input.roleId] ??= []).push(text);
          (sendOptions[input.roleId] ??= []).push(options ?? {});
          if (holdFirstSendFor === input.roleId && !held) {
            held = true;
            await holdPromise;
          }
        },
        events() {
          let i = 0;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  for (let tries = 0; tries < 100; tries += 1) {
                    const arr = streams[input.roleId] ?? [];
                    if (i < arr.length) return { value: arr[i++], done: false };
                    await tick(5);
                  }
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
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  return { mgr, streams, sent, sendOptions, caps, releaseHold: () => releaseHold?.() };
}

test("星形派发（2026-10-29 v4.1，M8）：chief → 项目 worker 被拒，拒绝发生在 task.created 之前（不写任务行）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief;
    assert.equal(typeof dispatch, "function", "chief 应注入 dispatch_task");
    assert.equal(h.caps.worker, undefined, "项目角色不注入 dispatch_task");

    const receipt = (await dispatch!({ roleId: "worker", task: "实现 X", reason: "排期", sideEffect: "code", flowId: "flow-a", expectedOutput: "src/X.ts", requestedEvidence: ["src/X.ts"] })) as DispatchReceipt;
    assert.equal(receipt.ok, false, "幕僚不得直接给项目 worker 派实现任务");
    assert.match(receipt.message ?? "", /运营|convener|实现任务/);
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "拒绝不产生 task.created 行（F10）");
    assert.equal(h.sent.worker?.length ?? 0, 0, "拒绝不打开/投递目标会话");
    const runs = await listRunManifestsResult(root);
    assert.equal(runs.ok, true);
    if (runs.ok) assert.equal(runs.manifests.length, 0, "硬拒绝不产生/领养 draft run");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("星形目标（v4.1）：chief → 产品受理（链首）；chief → 运营缺 D3 受理 + advisory；幕僚自身拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-builtin-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief!;
    // 2026-11-16（B4，e71501c 起当前语义）：星形文档/交付派发有**来源门**——本套件 harness 桩掉
    // openRoleSession、无 getRegisteredProjectLifecycle / 真实 running origin / 真实文档与 run 身份
    // （prepareRoleDispatch 还要求实际 default-core 会话证据）。伪造这些宿主事实会削弱门禁，
    // 与 chain-enforcement（B3-4）同口径按 fail-closed 断言：拒绝码 + 零任务账本 + 零投递。
    // 「产品链首 / 运营缺 D3 受理 + advisory」的受理语义由真实项目链（固定路径/chain-enforcement）覆盖。
    const toProduct = (await dispatch({ roleId: "product", task: "写产品意图文档", sideEffect: "docs", flowId: "flow-a" })) as DispatchReceipt;
    assert.equal(toProduct.ok, false);
    assert.match(toProduct.message ?? "", /document-planning-source-unavailable/);
    const toConvener = (await dispatch({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "flow-a" })) as DispatchReceipt;
    assert.equal(toConvener.ok, false);
    assert.match(toConvener.message ?? "", /document-planning-source-unavailable/);
    const afterRefusals = await readTaskState(root);
    assert.equal(afterRefusals.records.size, 0, "来源门拒绝不写任务账本（不伪造受理）");
    assert.equal(h.sent.product?.length ?? 0, 0, "拒绝不打开/投递产品会话");
    assert.equal(h.sent.convener?.length ?? 0, 0, "拒绝不打开/投递运营会话");
    const self = (await dispatch({ roleId: "chief", task: "自派" })) as DispatchReceipt;
    assert.equal(self.ok, false);
    assert.match(self.message ?? "", /不能派发给幕僚自己/);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("convener 拥有 dispatch（v4.1）：未接交付时派项目 worker 受理 + advisory，建任务", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-old-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(30);
    assert.equal(typeof h.caps.convener, "function", "v4.1：convener 拥有 dispatch_task");
    // 2026-11-16（B4，e71501c 起当前语义）：运营→项目 worker 派发要求**当前运营真实受派任务**
    // （running origin + taskId + 可核验父任务）。本裸 harness 没有该来源 ⇒ 当前语义 fail-closed；
    // 「未接交付也受理 + advisory」的受理面由真实项目链/固定路径覆盖，这里钉拒绝码 + 零任务 + 零投递。
    const receipt = (await h.caps.convener!({ roleId: "worker", task: "实现 X", sideEffect: "code" })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /worker-dispatch-source-unavailable/);
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "缺当前运营真实受派任务 ⇒ 不建任务");
    assert.equal(h.sent.worker?.length ?? 0, 0, "拒绝不打开/投递目标会话");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("BUG-5：任务已报告/已收口后，同一幂等键重复派发被抑制（不建新任务、不投递）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-idem-"));
  const h = harness(root);
  // 2026-11-16（B4）：e71501c 起裸 harness 的首次派发被来源门拒绝；本命名行为（终态任务 + 同幂等键
  // 的重复派发抑制）在**去重门**即完成（先于来源门），因此以真实任务账本种子触发。payload 显式
  // idempotencyKey，种子 task.created 使用同一键（taskIdempotencyKey 显式键优先）。
  const payload: DispatchTaskPayload = { roleId: "product", task: "写产品意图文档", sideEffect: "docs", flowId: "flow-a", idempotencyKey: "key-star-idem" };
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief!;
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-star-idem", from: "chief", to: "product", text: "写产品意图文档", sideEffect: "docs", idempotencyKey: "key-star-idem",
    }));
    await appendTaskEvent(root, taskEvent("task.reported", {
      taskId: "t-star-idem", from: "product", status: "done", summary: "已完成",
    }));
    const state = await readTaskState(root);
    assert.equal(state.records.size, 1);
    const sentBefore = h.sent.product?.length ?? 0;

    const dupReported = (await dispatch(payload)) as DispatchReceipt;
    assert.equal(dupReported.ok, true);
    assert.match(dupReported.message ?? "", /已报告|重复派发已抑制/);
    assert.equal((await readTaskState(root)).records.size, 1, "报告后重复派发不得创建新任务");
    assert.equal(h.sent.product?.length ?? 0, sentBefore, "报告后重复派发不得再次投递");

    await appendTaskEvent(root, taskEvent("task.closed", { taskId: "t-star-idem", by: "chief", outcome: "accepted" }));
    const dupClosed = (await dispatch(payload)) as DispatchReceipt;
    assert.equal(dupClosed.ok, true);
    assert.match(dupClosed.message ?? "", /已收口|重复派发已抑制/);
    assert.equal((await readTaskState(root)).records.size, 1, "收口后重复派发不得创建新任务");
    assert.equal(h.sent.product?.length ?? 0, sentBefore, "收口后重复派发不得再次投递");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("BUG-5：派发到无会话角色会先 open/resume；打开失败则如实拒绝且不入队", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-open-"));
  const h = harness(root, { openFailFor: "product" });
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    // 2026-11-16（B4，e71501c 起当前语义）：来源门先于打开/投递——裸 harness 无真实来源，
    // 因此本用例在 open 之前即 fail-closed（不会到达 delivery-target-open-failed 分支）。
    // 断言保持同等强度：如实拒绝码 + 零任务行 + 零投递。打开失败分支由真实项目链/固定路径覆盖。
    const receipt = (await h.caps.chief!({ roleId: "product", task: "写产品意图文档", sideEffect: "docs", flowId: "flow-a" })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /document-planning-source-unavailable/);
    assert.equal(h.sent.product?.length ?? 0, 0, "拒绝不得投递");
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "来源门在 open 之前：不写任务行（不伪造 rejected 收口）");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("BUG-5：排队期间任务已完成 ⇒ 已出队前不再投递/不补写 delivered（只记诊断）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-stale-"));
  const h = harness(root, { holdFirstSendFor: "product" });
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await h.mgr.open({ projectRoot: root, roleId: "product", runtime: "demo" });
    await tick(30);
    const holdSend = h.mgr.send("占住 product 本轮", undefined, { projectRoot: root, roleId: "product", runtime: "demo" });
    await waitUntil(() => (h.sent.product?.length ?? 0) === 1);
    // 2026-11-16（B4，e71501c 起当前语义）：裸 harness 无真实来源 ⇒ 派发在入队前 fail-closed；
    // 断言「不产生排队投递、不补写 task.delivered、占住轮不被抢占」的既有判据保持。
    const receipt = (await h.caps.chief!({ roleId: "product", task: "写产品意图文档", sideEffect: "docs", flowId: "flow-a" })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /document-planning-source-unavailable/);
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "来源门拒绝不写任务行");
    h.releaseHold();
    (h.streams.product ??= []).push({ kind: "settled", summary: "占住轮结束" } as OrchestrationEvent);
    await holdSend;
    await tick(180);
    assert.equal(h.sent.product!.length, 1, "拒绝的派发不得再启动新一轮");
    assert.equal(h.sent.product![0], "占住 product 本轮");
    const after = await readTaskState(root);
    assert.equal(after.events.filter((event) => event.kind === "task.delivered").length, 0, "不得补写 task.delivered");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("BUG-5：任务已报告后的重复回交被抑制（不同 handbackKey 也不重复投递）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-report-"));
  const h = harness(root);
  try {
    // 2026-11-16（B4，e71501c 起当前语义）：裸 harness 的派发被来源门拒绝，本命名行为（已报告任务的
    // 重复回交抑制）在回交投递层独立成立；以真实任务账本种子 + listTasks 登记 star 任务触发。
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-star-report", from: "chief", to: "product", text: "写产品意图文档", sideEffect: "docs", idempotencyKey: "key-star-report",
    }));
    await h.mgr.listTasks(root); // 登记星形任务（真实恢复路径同源）
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await h.mgr.open({ projectRoot: root, roleId: "product", runtime: "demo" });
    await tick(30);
    const handback = {
      roleId: "product",
      taskId: "t-star-report",
      status: "completed" as const,
      summary: "完成产品文档",
      evidence: ["docs/product/flow-a-intent-v1.md"],
      at: "2026-10-29T13:24:02.000Z",
      turnId: "turn-star-report",
    };
    (h.streams.product ??= []).push({ kind: "handback", summary: "报告", handback } as OrchestrationEvent);
    await waitUntil(() => (h.sent.chief?.length ?? 0) > 0);
    const sentBefore = h.sent.chief!.length;
    for (let i = 0; i < 50; i += 1) {
      if ((await readTaskState(root)).records.get("t-star-report")?.reports.length) break;
      await tick(10);
    }
    assert.equal((await readTaskState(root)).records.get("t-star-report")?.reports.length, 1);
    (h.streams.product ??= []).push({ kind: "handback", summary: "重复报告", handback: { ...handback, at: "2026-10-29T13:24:08.000Z" } } as OrchestrationEvent);
    await tick(180);
    assert.equal(h.sent.chief!.length, sentBefore, "已报告任务的重复回交不得再次投递");
    assert.equal((await readTaskState(root)).records.get("t-star-report")?.reports.length, 1, "报告事件也不得重复追加");
    assert.equal(h.sent.convener?.length ?? 0, 0, "星形工作结果只投幕僚（不投旧 Steward）");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("R1/P1-R-05：convener→chief 归矩阵；convener→不存在 worker 硬拒；硬拒无任务/会话/run", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-r1-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.convener!;
    const toChief = (await dispatch({ roleId: "chief", task: "越权派幕僚", sideEffect: "read-only", flowId: "flow-a" })) as DispatchReceipt;
    assert.equal(toChief.ok, false);
    assert.match(toChief.message ?? "", /convener-target-forbidden|运营只能给项目 worker/);
    const toGhost = (await dispatch({ roleId: "ghost-dev", task: "幽灵实现", sideEffect: "code", flowId: "flow-a", moduleId: "ghost-core" })) as DispatchReceipt;
    assert.equal(toGhost.ok, false);
    assert.match(toGhost.message ?? "", /target-card-missing|不存在|未枚举/);
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "硬拒无任务行");
    assert.equal(h.sent.chief?.length ?? 0, 0, "硬拒不打开目标会话");
    assert.equal(h.sent["ghost-dev"]?.length ?? 0, 0, "硬拒不打开目标会话");
    const runs = await listRunManifestsResult(root);
    assert.equal(runs.ok, true);
    if (runs.ok) assert.equal(runs.manifests.length, 0, "硬拒不产生/领养 draft run");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("AC-1.2：wrong-source 桌面证据——非 chief/convener 直接调用 routeDispatch 被拒", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-source-"));
  const h = harness(root);
  try {
    const manager = h.mgr as unknown as {
      routeDispatch(projectRoot: string, runtime: "demo", fromRoleId: string, d: DispatchTaskPayload): Promise<DispatchReceipt>;
    };
    const receipt = await manager.routeDispatch(root, "demo", "worker", { roleId: "product", task: "越权派发", sideEffect: "docs" });
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /幕僚|运营|来源/);
    assert.equal((await readTaskState(root)).records.size, 0, "wrong-source 无任务行");
    assert.equal(h.sent.product?.length ?? 0, 0, "wrong-source 不打开目标会话");
    const runs = await listRunManifestsResult(root);
    assert.equal(runs.ok, true);
    if (runs.ok) assert.equal(runs.manifests.length, 0, "wrong-source 不产生 run");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("AC-4.3：洁净派发无 advisory、无诊断噪声", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-star-clean-"));
  const diagnosticsDir = path.join(root, ".diag");
  configureDiagnostics({ directory: diagnosticsDir });
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    // 2026-11-16（B4，e71501c 起当前语义）：裸 harness 无真实来源 ⇒ 洁净派发在来源门 fail-closed；
    // 「无 advisory、无诊断噪声」的判据保持：拒绝不是 advisory 受理，诊断中不得出现 tasks.dispatch.advisory。
    const receipt = (await h.caps.chief!({ roleId: "product", task: "写产品意图文档（洁净）", sideEffect: "docs", flowId: "flow-clean" })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /document-planning-source-unavailable/);
    assert.equal((receipt.message ?? "").includes("状态提示（未阻断）"), false, "来源门拒绝无 advisory");
    assert.equal(h.sent.product?.length ?? 0, 0, "拒绝不打开/投递目标会话");
    await flushDiagnostics();
    const diagnosticsText = await readDiagnostics(diagnosticsDir);
    assert.equal(diagnosticsText.includes("tasks.dispatch.advisory"), false, "来源门拒绝零 advisory 诊断");
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

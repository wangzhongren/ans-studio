// 独立复验（测试角色，2026-10-16）：G-1/A2 桌面投递接线（`app/desktop/session.ts::routeDispatch`）的
// **端到端对抗性核对**。自建最小 SessionManager 夹具（独立构造；不复用实施方
// `test/桌面应用/dispatch-delivery.test.ts` 的断言与期望值）：金文本逐字手写，哈希用 node:crypto 独立计算。
// 覆盖：无引用零回归、**去重键陷阱回归（拒投→补齐→重派同一文本必须受理）**、队列期去重不受影响、
// **已入队条目按派发当刻哈希定格投递**、workflow 缺失降级、拒投回执逐字与零副作用（零投递/零开会话/零入队）。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { renderDispatchPrompt } from "../../../src/common/编排/handback.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { DispatchTaskFn, DispatchReceipt } from "../../../src/provider/pi/session.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../../src/service/role/resolve-role.ts";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const BLOCK_HEAD = "必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：";
const DONE_LEGACY = "完成后请交回报告（改了什么/结论/证据）。";

function listing(root: string): ProjectListing {
  const mk = (roleId: string, builtIn = false): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: builtIn ? "" : `角色卡/${roleId}/role-card.md`,
    boundaryPath: builtIn ? "" : `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: builtIn
      ? { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }
      : { entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }], boundarySource: `角色卡/${roleId}/boundary.yaml`, acceptance: { accepted: false, source: "" } },
    builtIn: builtIn ? true : undefined,
  });
  return { projectRoot: root, roles: [mk("su", true), mk("A"), mk("B")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

function makeHarness(root: string) {
  const l = listing(root);
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [], B: [] };
  const invoked: Record<string, string[]> = { su: [], A: [], B: [] };
  const done: Record<string, string[]> = { su: [], A: [], B: [] };
  const openCalls: string[] = [];
  const openInputs: Record<string, { dispatchTask?: DispatchTaskFn }> = {};
  const stopped: Record<string, boolean> = {};
  const envelopes: import("../../../app/desktop/session.ts").SessionEventEnvelope[] = [];
  const roleStates: { roleId: string; queue: unknown[] }[] = [];
  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    return {
      async send(text: string, _options?: RoleSessionSendOptions): Promise<void> {
        (invoked[roleId] ??= []).push(text);
        (done[roleId] ??= []).push(text);
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 120; tries += 1) {
                  if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] || [];
                  if (i < arr.length) return { value: arr[i++], done: false };
                  await new Promise((r) => setTimeout(r, 5));
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> { stopped[roleId] = true; },
    };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openCalls.push(input.roleId);
      openInputs[input.roleId] = { dispatchTask: (input as { dispatchTask?: DispatchTaskFn }).dispatchTask };
      return makeHandle(input.roleId);
    },
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? l : undefined),
    emitEvent: (env) => envelopes.push(env),
    emitRoleState: (info) => roleStates.push({ roleId: info.roleId, queue: info.queue }),
  });
  return { mgr, streams, invoked, done, openCalls, openInputs, envelopes, roleStates, dispatchOf: (roleId: string) => openInputs[roleId]?.dispatchTask };
}

// —————— ① 无引用零回归（f2 收口处使用的单来源输出 = 文档化的旧三行） ——————

test("对抗-接线：无引用派发（含原因段）逐字 = 独立金文本；单来源无 opts 输出与之一致（f2 收口同源）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1w1-"));
  const h = makeHarness(dir);
  try {
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "把 src/x.ts 的校验补上";
    const r = (await h.dispatchOf("su")!({ roleId: "A", task, reason: "首派" })) as DispatchReceipt;
    assert.equal(r.ok, true);
    await tick(150);
    assert.equal(
      h.done.A[0],
      ["[派发] 来自 su 的任务（原因：首派）", task, DONE_LEGACY].join("\n"),
      "投递文本逐字 = 独立金文本（无引用不注入必读块；既有派发零回归）",
    );
    assert.equal(
      renderDispatchPrompt({ roleId: "A", task }),
      ["[派发] 来自 su 的任务", task, DONE_LEGACY].join("\n"),
      "f2-claim-release 收口使用的单来源无 opts 输出 = 同一旧三行（收口为格式等价，非放松）",
    );
    await h.mgr.stop(null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// —————— ② 去重键陷阱回归（关键） ——————

test("对抗-接线（关键）：拒投 → 补齐契约 → 重派**同一任务文本**必须受理且恰投一次（拒投不污染去重键）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1w2-"));
  const h = makeHarness(dir);
  try {
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "按契约 docs/contracts/trap-v1.md 实施联调。"; // 同一文本贯穿三动作（拒投→补齐→重派）

    // ① 契约缺失：拒投——回执逐字、su 系统行如实、目标零副作用
    const r1 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r1.ok, false);
    assert.equal(r1.message, "派发未受理：引用的契约 docs/contracts/trap-v1.md 不存在——未投递。");
    assert.ok(
      h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message"
        && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note"
        && e.event.summary.includes("docs/contracts/trap-v1.md") && e.event.summary.includes("**未投递**")),
      "su 聊天流有如实系统行（含 **未投递**，不静默）",
    );
    await tick(150);
    assert.equal(h.done.A.length, 0, "目标零投递");
    assert.equal(h.invoked.A.length, 0, "目标零 send");
    assert.equal(h.openCalls.includes("A"), false, "拒投不开目标会话");
    assert.equal(h.roleStates.some((s) => s.roleId === "A" && s.queue.length > 0), false, "A 队列零条目（拒投不入队）");

    // ② su 修正：补齐契约文件
    await fs.mkdir(path.join(dir, "docs", "contracts"), { recursive: true });
    const bytes = "# trap 契约 v1\n冻结内容\n";
    await fs.writeFile(path.join(dir, "docs", "contracts", "trap-v1.md"), bytes, "utf8");

    // ③ 重派**同一任务文本**——若拒投污染了去重键（先登记后拒投），这里会被误去重
    const r2 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r2.ok, true, "补齐后重派同一文本必须受理（拒投不得污染去重键）");
    assert.equal(/去重/.test(r2.message ?? ""), false, "不得是误去重回执");
    await tick(150);
    assert.equal(h.done.A.length, 1, "恰投一次");
    assert.equal(
      h.done.A[0],
      [
        "[派发] 来自 su 的任务",
        BLOCK_HEAD,
        `  1. docs/contracts/trap-v1.md（sha256:${sha(bytes)}）`,
        `任务：${task}`,
        DONE_LEGACY,
      ].join("\n"),
      "投递文本 = 独立金文本（含当刻契约字节 sha256）",
    );
    await h.mgr.stop(null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("对抗-接线：常规队列期去重未受 G-1 接线影响（目标忙 ⇒ 入队；同文重派 ⇒ 去重回执；恰投一次）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1w3-"));
  const h = makeHarness(dir);
  try {
    await fs.mkdir(path.join(dir, "docs", "contracts"), { recursive: true });
    await fs.writeFile(path.join(dir, "docs", "contracts", "dup-v1.md"), "D\n", "utf8");
    await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
    await tick(30);
    await h.mgr.send("A 先忙"); // A busy（推 settled 前恒忙）；完成即可，busy 由 settle 释放
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "按契约 docs/contracts/dup-v1.md 做去重回归。";
    const r1 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r1.ok, true);
    const r2 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r2.ok, true);
    assert.ok(/去重/.test(r2.message ?? ""), "队列期窗口去重仍在（同文重派 = 去重回执）");
    h.streams.A.push({ kind: "settled", summary: "一轮结束" });
    await tick(250);
    assert.equal(
      h.done.A.filter((t) => t.startsWith("[派发] 来自 su 的任务")).length,
      1,
      "派发恰投一次（去重有效；入队文本按到达序放行）",
    );
    await h.mgr.stop(null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// —————— ③ 定格语义：已入队条目按派发当刻哈希投递 ——————

test("对抗-接线：排队期间契约变更 ⇒ 已入队条目按**派发那一刻**的旧哈希投递；送达后同文再派才用新哈希", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1w4-"));
  const h = makeHarness(dir);
  try {
    await fs.mkdir(path.join(dir, "docs", "contracts"), { recursive: true });
    const cp = path.join(dir, "docs", "contracts", "freeze-v1.md");
    await fs.writeFile(cp, "C1 字节\n", "utf8");
    const hash1 = sha("C1 字节\n");

    await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
    await tick(30);
    await h.mgr.send("A 先忙"); // A busy ⇒ 派发入队（不推 settled）
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "按契约 docs/contracts/freeze-v1.md 实施。";
    const r1 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r1.ok, true);
    await tick(120);
    assert.equal(h.done.A.length, 1, "A 忙：派发尚在队列（仅『A 先忙』完成）");

    // 排队期间契约变更（「谁改谁触发调用方重验」场景）；已入队条目按派发当刻版本投递
    await fs.writeFile(cp, "C2 字节已变更且更长\n", "utf8");
    const hash2 = sha("C2 字节已变更且更长\n");
    assert.notEqual(hash1, hash2);
    h.streams.A.push({ kind: "settled", summary: "第一轮结束" });
    await tick(250);
    assert.equal(h.done.A.length, 2, "settled 后按序放行");
    assert.equal(
      h.done.A[1],
      [
        "[派发] 来自 su 的任务",
        BLOCK_HEAD,
        `  1. docs/contracts/freeze-v1.md（sha256:${hash1}）`,
        `任务：${task}`,
        DONE_LEGACY,
      ].join("\n"),
      "定格语义：按派发当刻（C1）哈希投递，不因文件变更重算",
    );

    // 送达即释放去重窗口：同文再派 = 新一次，用当刻哈希（C2）
    h.streams.A.push({ kind: "settled", summary: "第二轮结束" });
    await tick(120);
    const r2 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r2.ok, true);
    await tick(150);
    assert.equal(h.done.A.length, 3, "同文再派送达（返工回路不受必读块影响）");
    assert.ok(h.done.A[2].includes(`sha256:${hash2}`), "新派发用当刻内容哈希（新版本地址）");
    assert.equal(h.done.A[2].includes(`sha256:${hash1}`), false);
    await h.mgr.stop(null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

// —————— ④ workflow 缺失：降级照投（端到端） ——————

test("对抗-接线：workflow 缺失 ⇒ 降级照投逐字（标注在场；契约照常带哈希；不拒投）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1w5-"));
  const h = makeHarness(dir);
  try {
    await fs.mkdir(path.join(dir, "docs", "contracts"), { recursive: true });
    const cbytes = "# 契约\n";
    await fs.writeFile(path.join(dir, "docs", "contracts", "k-v1.md"), cbytes, "utf8");
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "先读 docs/workflow.md（本项目暂缺），再按 docs/contracts/k-v1.md 实施。";
    const r = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r.ok, true, "workflow 缺失不拒投（过渡期老项目向后兼容）");
    await tick(150);
    assert.equal(
      h.done.A[0],
      [
        "[派发] 来自 su 的任务",
        BLOCK_HEAD,
        "  （本项目未提供 workflow.md）",
        `  1. docs/contracts/k-v1.md（sha256:${sha(cbytes)}）`,
        `任务：${task}`,
        DONE_LEGACY,
      ].join("\n"),
    );
    await h.mgr.stop(null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

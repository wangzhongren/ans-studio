// test/桌面应用/request-timeout-wiring.test.ts
// P1（2026-10-30 团队计划 §3.4 P1 / 附录 B；Delta-TR-2 精确授权）：**桌面窗口请求超时接线**——
//  - Service settled.detail.errorCode（request-timeout-*/MODEL_REQUEST_FAILED）⇒ 恰一条**人话**系统行
//    （delivery-note；不出现技术 code/堆栈/URL；不触发模型/门禁/自动决策）；
//  - lastTurn 小状态带 errorCode（role_status 只读面可见）；桌面诊断 turn.settled 带 errorCode；
//  - 失败终态后队列继续（下一项可投），不重复系统行/不伪造成功。
// 真实路径：真实 SessionManager + 可脚本化假句柄（与 turn-lease/handback-delivery 同 harness 口径）；
// 诊断经真实 createDiagnosticLogger（临时目录）核对。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => boolean, label = "等待实际事件超时"): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    if (predicate()) return;
    await tick(5);
  }
  assert.fail(label);
}

function listing(projectRoot: string): ProjectListing {
  const mk = (roleId: string, builtIn = false): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: builtIn ? "" : `角色卡/${roleId}/role-card.md`,
    boundaryPath: builtIn ? "" : `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: builtIn
      ? { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }
      : {
          entries: [{ root: "project", path: `src/${roleId}.ts`, kind: "file", purpose: "p" }],
          boundarySource: `角色卡/${roleId}/boundary.yaml`,
          acceptance: { accepted: false, source: "" },
        },
    builtIn: builtIn ? true : undefined,
  });
  return { projectRoot, roles: [mk("su", true), mk("A")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

interface Envelope { roleId: string; projectRoot?: string; runtime?: string; event: { kind: string; summary?: string; detail?: unknown; turnId?: string } }
interface SendContext { text: string; opts?: RoleSessionSendOptions; call: number; roleId: string }
type SendBehavior = (ctx: SendContext) => Promise<void> | void;

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  envelopes: Envelope[];
  behaviors: Record<string, SendBehavior[]>;
  latest: (roleId: string) => { busy: boolean; queue: { id: string }[] } | undefined;
  /** 夹具门（失败路径也会在 cleanup 释放，避免脚本回合永挂）。 */
  gates: { release: () => void }[];
  /** 本夹具发起过的 send（cleanup 有界等待结算，不留给事件循环）。 */
  send: (text: string) => Promise<unknown>;
  /** 无论用例如何退出都执行：放门 → 有界 stop → dispose 句柄 → 有界等 send 结算。 */
  cleanup: () => Promise<void>;
}

function makeHarness(projectRoot: string): Harness {
  const l = listing(projectRoot);
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const envelopes: Envelope[] = [];
  const behaviors: Record<string, SendBehavior[]> = { su: [], A: [] };
  const attempts: Record<string, number> = { su: 0, A: 0 };
  const stopped: Record<string, boolean> = { su: false, A: false };
  const roleStates: { roleId: string; busy: boolean; queue: { id: string }[] }[] = [];
  const handles: RoleSessionHandle[] = [];
  const gates: { release: () => void }[] = [];
  const pendingSends: Promise<unknown>[] = [];
  const makeHandle = (roleId: string): RoleSessionHandle => {
    const handle: RoleSessionHandle = {
      runtime: "demo",
      roleId,
      async send(text: string, opts?: RoleSessionSendOptions): Promise<void> {
        attempts[roleId] += 1;
        const behavior = behaviors[roleId]?.shift();
        if (behavior) await behavior({ text, opts, call: attempts[roleId], roleId });
        else opts?.onTurnStarted?.({ turnId: `turn-${roleId}-${attempts[roleId]}`, roleId, runtime: "demo" });
        sent[roleId].push(text);
      },
      events(): AsyncIterable<OrchestrationEvent> {
        let i = 0;
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 4000; tries += 1) {
                  if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] ?? [];
                  if (i < arr.length) return { value: arr[i++], done: false };
                  await new Promise((r) => setTimeout(r, 5));
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async abort() { return { ok: true, supported: true }; },
      async dispose() { stopped[roleId] = true; },
    };
    handles.push(handle);
    return handle;
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => makeHandle(input.roleId),
    createPiAdapterFactory: () => { throw new Error("本用例不应构造 pi 适配器"); },
    createDemoAdapter: () => { throw new Error("本用例不应构造 demo 适配器"); },
    buildProjectConfig,
    getListing: (root) => (root === l.projectRoot ? l : undefined),
    emitEvent: (env) => envelopes.push(env as Envelope),
    emitRoleState: (info) => roleStates.push({ roleId: info.roleId, busy: info.busy, queue: (info.queue ?? []).map((item) => ({ id: item.id })) }),
  });
  return {
    mgr, streams, sent, envelopes, behaviors, gates,
    send: (text) => {
      const pending = mgr.send(text);
      void pending.catch(() => { /* 失败由用例或 cleanup 消费，不留未处理拒绝 */ });
      pendingSends.push(pending);
      return pending;
    },
    cleanup: async () => {
      for (const gate of gates) gate.release();
      try { if (mgr.isOpen()) await settledWithin(mgr.stop(null), "request-timeout-wiring 清理 stop 超时", 5_000); }
      catch { /* stop 以结果如实报告 dispose 错误；清理不掩盖用例失败 */ }
      for (const handle of handles) {
        try { await settledWithin(handle.dispose(), "request-timeout-wiring 清理 dispose 超时", 2_000); } catch { /* dispose 幂等；失败不再抛 */ }
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 1000);
        (timer as { unref?: () => void }).unref?.();
      });
      try { await Promise.race([Promise.allSettled(pendingSends), timeout]); } finally { if (timer !== undefined) clearTimeout(timer); }
    },
    latest: (roleId) => {
      for (let i = roleStates.length - 1; i >= 0; i -= 1) if (roleStates[i].roleId === roleId) return roleStates[i];
      return undefined;
    },
  };
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

/** 有界等待真实回执：产品回执若永不结算（例如会话开不起来/消费链断），用例必须在有限时间内失败
 *  并进入 finally 清理，而不是让 CI 文件子进程永久挂起（CI 未设 --test-timeout）。 */
function settledWithin<T>(promise: Promise<T>, label: string, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); });
  return Promise.race([promise, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

/** 诊断临时目录 + **真实可解析的夹具项目根**（CI runner 没有 `/proj`）：宿主库存登记以 native realpath
 *  规范化项目根，根不可解析即 fail-closed（`git-host-project-root-unresolvable`）⇒ 会话开不起来、
 *  轮次永不开始。夹具根用 mkdtemp 真实存在，结束后连同诊断目录一并清理（用例失败也清理）。 */
async function withDiagnostics<T>(fn: (dir: string, projectRoot: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-request-wiring-diag-"));
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-request-wiring-project-"));
  configureDiagnostics({ directory: dir });
  try {
    return await fn(dir, projectRoot);
  } finally {
    await disposeDiagnostics();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

interface DiagRecord { event: string; [key: string]: unknown }
async function diagnosticEvents(dir: string): Promise<DiagRecord[]> {
  await flushDiagnostics();
  const records: DiagRecord[] = [];
  for (const file of await fs.readdir(dir)) {
    const text = await fs.readFile(path.join(dir, file), "utf8");
    for (const line of text.trim().split("\n")) if (line !== "") records.push(JSON.parse(line) as DiagRecord);
  }
  return records;
}

const NOTE = (envelopes: Envelope[]): Envelope[] => envelopes.filter((env) =>
  env.event.kind === "message" && (env.event.detail as { source?: unknown } | undefined)?.source === "delivery-note");

/** 失败回合脚本：ACK 开轮 → 留出观察窗 → 推 settled(failed + errorCode) → 挂起（让 consume 先处理终态）→ 释放后抛错。
 *  `started` 在真实投递进入时结算——测试据此等待「已开跑」，不依赖瞬时 busy=true 快照（高负载下会被下一次
 *  settled/队列放行覆盖而漏看；P2 证据 §七-10 已登记该文件时序脆弱，P3 以强终态观察替换）。 */
function failedTurn(h: Harness, roleId: string, turnId: string, errorCode: string, summary: string, timeoutKind?: string): { gate: ReturnType<typeof deferred>; pending: Promise<unknown>; started: Promise<void> } {
  const gate = deferred();
  h.gates.push(gate);
  const started = deferred();
  h.behaviors[roleId].push(async (ctx) => {
    ctx.opts?.onTurnStarted?.({ turnId, roleId, runtime: "demo" });
    started.release();
    await tick(30); // 观察窗：先让 settled 之前的状态可观察，再推终态
    h.streams[roleId].push({
      kind: "settled", summary, turnId, roleId, runtime: "demo",
      detail: { turnId, outcome: "failed", errorCode, attempts: 1, replaySafe: true, ...(timeoutKind !== undefined ? { timeoutKind } : {}) },
    } as OrchestrationEvent);
    await gate.promise;
    throw new Error(`fixture: ${errorCode}`);
  });
  return { gate, pending: h.send(`第 ${turnId} 轮`), started: started.promise };
}

test("首字节超时终态：恰一条人话系统行（无技术 code）；lastTurn/诊断带 errorCode；失败后队列继续", async () => {
  await withDiagnostics(async (dir, projectRoot) => {
    const h = makeHarness(projectRoot);
    try {
      const opened = await h.mgr.open({ projectRoot, roleId: "A", runtime: "demo" });
      assert.equal(opened.ok, true, "夹具项目根须真实可解析（CI runner 无 /proj）");
      await tick(30);
      const first = failedTurn(h, "A", "turn-A1", "request-timeout-first-byte", "本轮请求超时（首字节未返回）", "first-byte");
      await settledWithin(first.started, "首字节超时轮未开跑（有界等待）");
      // 失败终态后队列继续：第二轮在忙时入队，settle 后自动投递。
      h.behaviors.A.push(async (ctx) => { ctx.opts?.onTurnStarted?.({ turnId: "turn-A2", roleId: "A", runtime: "demo" }); });
      const second = h.send("第二轮");
      await until(() => (h.latest("A")?.queue.length ?? 0) === 1, "第二轮未入队");
      // 以强终态观察（系统行）等待 settled 被 consume 处理；busy 复位属 P0 turn-lease 专项断言。
      await until(() => NOTE(h.envelopes).length === 1, "请求超时未产生系统行");
      const notes = NOTE(h.envelopes);
      assert.equal(notes.length, 1, "请求超时失败恰一条人话系统行");
      const text = String(notes[0]!.event.summary ?? "");
      assert.ok(text.includes("请求超时") && text.includes("可稍后重发"), `系统行须为人话：${text}`);
      assert.ok(!/request-timeout|MODEL_REQUEST|Error|stack|https?:\/\//i.test(text), "系统行不得出现技术 code/堆栈/URL");
      assert.equal(notes[0]!.roleId, "A", "系统行进入目标角色 pane");
      assert.equal(h.mgr.lastTurnOf(projectRoot, "A", "demo")?.outcome, "failed");
      assert.equal(h.mgr.lastTurnOf(projectRoot, "A", "demo")?.errorCode, "request-timeout-first-byte", "lastTurn 小状态带 errorCode（role_status 只读面）");
      first.gate.release();
      const firstResult = await settledWithin(first.pending, "首字节超时回执等待超时") as { ok: boolean; outcome?: string };
      assert.equal(firstResult.ok, false, "失败回合如实返回 ok:false（不伪造成功）");
      assert.equal(firstResult.outcome, "failed", "失败回合结果带真实终态");
      await until(() => h.sent.A.includes("第二轮"), "失败终态后队列未继续");
      h.streams.A.push({ kind: "settled", summary: "会话结束", turnId: "turn-A2", roleId: "A", runtime: "demo", detail: { turnId: "turn-A2", outcome: "completed" } } as OrchestrationEvent);
      const secondResult = await settledWithin(second, "失败后下一轮回执等待超时") as { ok: boolean };
      assert.equal(secondResult.ok, true);
      // 重复 settled（同一 turn）不得再产生系统行。
      h.streams.A.push({ kind: "settled", summary: "重复终态", turnId: "turn-A1", roleId: "A", runtime: "demo", detail: { turnId: "turn-A1", outcome: "failed", errorCode: "request-timeout-first-byte" } } as OrchestrationEvent);
      await tick(60);
      assert.equal(NOTE(h.envelopes).length, 1, "重复/迟到终态不得重复系统行");
      const records = await diagnosticEvents(dir);
      const settled = records.filter((record) => record.event === "turn.settled" && record.turnId === "turn-A1");
      assert.ok(settled.length >= 1, "桌面须留 turn.settled 诊断");
      assert.equal(settled.at(-1)!.errorCode, "request-timeout-first-byte", "turn.settled 诊断带 errorCode");
    } finally {
      await h.cleanup();
    }
  });
});

test("空闲超时与一般请求失败：各自人话系统行（不串文案、不含 code）", async () => {
  await withDiagnostics(async (_dir, projectRoot) => {
    const h = makeHarness(projectRoot);
    try {
      const opened = await h.mgr.open({ projectRoot, roleId: "A", runtime: "demo" });
      assert.equal(opened.ok, true, "夹具项目根须真实可解析（CI runner 无 /proj）");
      await tick(30);
      const idle = failedTurn(h, "A", "turn-B1", "request-timeout-idle", "本轮请求超时（响应空闲超时）", "idle");
      await settledWithin(idle.started, "空闲超时轮未开跑（有界等待）");
      await until(() => NOTE(h.envelopes).length === 1, "空闲超时未产生系统行");
      idle.gate.release();
      await settledWithin(idle.pending, "空闲超时回执等待超时");
      await tick(30);
      const failed = failedTurn(h, "A", "turn-B2", "MODEL_REQUEST_FAILED", "本轮运行失败");
      await settledWithin(failed.started, "一般失败轮未开跑（有界等待）");
      await until(() => NOTE(h.envelopes).length === 2, "一般失败未产生系统行");
      failed.gate.release();
      await settledWithin(failed.pending, "一般失败回执等待超时");
      await tick(30);
      const notes = NOTE(h.envelopes);
      assert.equal(notes.length, 2, "两种失败各一条系统行");
      assert.ok(String(notes[0]!.event.summary).includes("响应长时间中断"), `idle 文案：${notes[0]!.event.summary}`);
      assert.ok(String(notes[1]!.event.summary).includes("本轮请求失败"), `一般失败文案：${notes[1]!.event.summary}`);
      for (const note of notes) assert.ok(!/request-timeout|MODEL_REQUEST|TimeoutError/i.test(String(note.event.summary)), "系统行不含技术 code");
      assert.equal(h.mgr.lastTurnOf(projectRoot, "A", "demo")?.errorCode, "MODEL_REQUEST_FAILED");
    } finally {
      await h.cleanup();
    }
  });
});

test("无 errorCode 的普通失败：不新增系统行（既有语义不变）", async () => {
  await withDiagnostics(async (_dir, projectRoot) => {
    const h = makeHarness(projectRoot);
    try {
      const opened = await h.mgr.open({ projectRoot, roleId: "A", runtime: "demo" });
      assert.equal(opened.ok, true, "夹具项目根须真实可解析（CI runner 无 /proj）");
      await tick(30);
      const gate = deferred();
      h.gates.push(gate);
      const started = deferred();
      h.behaviors.A.push(async (ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-C1", roleId: "A", runtime: "demo" });
        started.release();
        h.streams.A.push({ kind: "settled", summary: "本轮运行失败", turnId: "turn-C1", roleId: "A", runtime: "demo", detail: { turnId: "turn-C1", outcome: "failed" } } as OrchestrationEvent);
        await gate.promise;
        throw new Error("fixture failure");
      });
      const pending = h.send("普通失败");
      await settledWithin(started.promise, "普通失败轮未开跑（有界等待）");
      // 以强终态观察（lastTurn 落表）等待 settled 被 consume 处理；busy 复位属 P0 turn-lease 专项断言。
      await until(() => h.mgr.lastTurnOf(projectRoot, "A", "demo")?.outcome === "failed", "settled 未处理");
      gate.release();
      await settledWithin(pending, "普通失败回执等待超时");
      await tick(30);
      assert.equal(NOTE(h.envelopes).length, 0, "无请求失败 errorCode 时不新增系统行（P1 不改既有失败呈现）");
      assert.equal(h.mgr.lastTurnOf(projectRoot, "A", "demo")?.outcome, "failed");
      assert.equal(h.mgr.lastTurnOf(projectRoot, "A", "demo")?.errorCode, undefined);
    } finally {
      await h.cleanup();
    }
  });
});

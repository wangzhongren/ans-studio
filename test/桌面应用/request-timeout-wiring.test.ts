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

function listing(): ProjectListing {
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
  return { projectRoot: "/proj", roles: [mk("su", true), mk("A")], warnings: [], hasRoles: true, primaryRoleId: "su" };
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
}

function makeHarness(): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const envelopes: Envelope[] = [];
  const behaviors: Record<string, SendBehavior[]> = { su: [], A: [] };
  const attempts: Record<string, number> = { su: 0, A: 0 };
  const stopped: Record<string, boolean> = { su: false, A: false };
  const roleStates: { roleId: string; busy: boolean; queue: { id: string }[] }[] = [];
  const makeHandle = (roleId: string): RoleSessionHandle => ({
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
  });
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
    mgr, streams, sent, envelopes, behaviors,
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

async function withDiagnostics<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-request-wiring-diag-"));
  configureDiagnostics({ directory: dir });
  try { return await fn(dir); } finally { await disposeDiagnostics(); await fs.rm(dir, { recursive: true, force: true }); }
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

/** 失败回合脚本：ACK 开轮 → 留出观察窗（开跑即外推 busy）→ 推 settled(failed + errorCode) → 挂起（让 consume 先处理终态）→ 释放后抛错。 */
function failedTurn(h: Harness, roleId: string, turnId: string, errorCode: string, summary: string, timeoutKind?: string): { gate: ReturnType<typeof deferred>; pending: Promise<unknown> } {
  const gate = deferred();
  h.behaviors[roleId].push(async (ctx) => {
    ctx.opts?.onTurnStarted?.({ turnId, roleId, runtime: "demo" });
    await tick(30); // 观察窗：测试先看到 busy=true，再让 settled 到达
    h.streams[roleId].push({
      kind: "settled", summary, turnId, roleId, runtime: "demo",
      detail: { turnId, outcome: "failed", errorCode, attempts: 1, replaySafe: false, ...(timeoutKind !== undefined ? { timeoutKind } : {}) },
    } as OrchestrationEvent);
    await gate.promise;
    throw new Error(`fixture: ${errorCode}`);
  });
  return { gate, pending: h.mgr.send(`第 ${turnId} 轮`) };
}

test("首字节超时终态：恰一条人话系统行（无技术 code）；lastTurn/诊断带 errorCode；失败后队列继续", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const first = failedTurn(h, "A", "turn-A1", "request-timeout-first-byte", "本轮请求超时（首字节未返回）", "first-byte");
      await until(() => h.latest("A")?.busy === true, "第一轮未开跑");
      // 失败终态后队列继续：第二轮在忙时入队，settle 后自动投递。
      h.behaviors.A.push(async (ctx) => { ctx.opts?.onTurnStarted?.({ turnId: "turn-A2", roleId: "A", runtime: "demo" }); });
      const second = h.mgr.send("第二轮");
      await until(() => (h.latest("A")?.queue.length ?? 0) === 1, "第二轮未入队");
      await until(() => h.latest("A")?.busy === false, "settled 未复位 busy");
      const notes = NOTE(h.envelopes);
      assert.equal(notes.length, 1, "请求超时失败恰一条人话系统行");
      const text = String(notes[0]!.event.summary ?? "");
      assert.ok(text.includes("请求超时") && text.includes("可稍后重发"), `系统行须为人话：${text}`);
      assert.ok(!/request-timeout|MODEL_REQUEST|Error|stack|https?:\/\//i.test(text), "系统行不得出现技术 code/堆栈/URL");
      assert.equal(notes[0]!.roleId, "A", "系统行进入目标角色 pane");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.outcome, "failed");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.errorCode, "request-timeout-first-byte", "lastTurn 小状态带 errorCode（role_status 只读面）");
      first.gate.release();
      const firstResult = await first.pending as { ok: boolean; outcome?: string };
      assert.equal(firstResult.ok, false, "失败回合如实返回 ok:false（不伪造成功）");
      assert.equal(firstResult.outcome, "failed", "失败回合结果带真实终态");
      await until(() => h.sent.A.includes("第二轮"), "失败终态后队列未继续");
      h.streams.A.push({ kind: "settled", summary: "会话结束", turnId: "turn-A2", roleId: "A", runtime: "demo", detail: { turnId: "turn-A2", outcome: "completed" } } as OrchestrationEvent);
      const secondResult = await second as { ok: boolean };
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
      await h.mgr.stop(null);
    }
  });
});

test("空闲超时与一般请求失败：各自人话系统行（不串文案、不含 code）", async () => {
  await withDiagnostics(async () => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const idle = failedTurn(h, "A", "turn-B1", "request-timeout-idle", "本轮请求超时（响应空闲超时）", "idle");
      await until(() => h.latest("A")?.busy === true, "空闲超时轮未开跑");
      await until(() => h.latest("A")?.busy === false, "空闲超时 settled 未复位 busy");
      idle.gate.release();
      await idle.pending;
      await tick(30);
      const failed = failedTurn(h, "A", "turn-B2", "MODEL_REQUEST_FAILED", "本轮运行失败");
      await until(() => h.latest("A")?.busy === true, "请求失败轮未开跑");
      await until(() => h.latest("A")?.busy === false, "请求失败 settled 未复位 busy");
      failed.gate.release();
      await failed.pending;
      await tick(30);
      const notes = NOTE(h.envelopes);
      assert.equal(notes.length, 2, "两种失败各一条系统行");
      assert.ok(String(notes[0]!.event.summary).includes("响应长时间中断"), `idle 文案：${notes[0]!.event.summary}`);
      assert.ok(String(notes[1]!.event.summary).includes("本轮请求失败"), `一般失败文案：${notes[1]!.event.summary}`);
      for (const note of notes) assert.ok(!/request-timeout|MODEL_REQUEST|TimeoutError/i.test(String(note.event.summary)), "系统行不含技术 code");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.errorCode, "MODEL_REQUEST_FAILED");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("无 errorCode 的普通失败：不新增系统行（既有语义不变）", async () => {
  await withDiagnostics(async () => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const gate = deferred();
      h.behaviors.A.push(async (ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-C1", roleId: "A", runtime: "demo" });
        h.streams.A.push({ kind: "settled", summary: "本轮运行失败", turnId: "turn-C1", roleId: "A", runtime: "demo", detail: { turnId: "turn-C1", outcome: "failed" } } as OrchestrationEvent);
        await gate.promise;
        throw new Error("fixture failure");
      });
      const pending = h.mgr.send("普通失败");
      await until(() => h.latest("A")?.busy === true, "普通失败轮未开跑");
      await until(() => h.latest("A")?.busy === false, "settled 未复位 busy");
      gate.release();
      await pending;
      await tick(30);
      assert.equal(NOTE(h.envelopes).length, 0, "无请求失败 errorCode 时不新增系统行（P1 不改既有失败呈现）");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.outcome, "failed");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.errorCode, undefined);
    } finally {
      await h.mgr.stop(null);
    }
  });
});

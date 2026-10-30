// test/桌面应用/replay-safe-retry.test.ts
// P3（2026-10-30 团队计划 §3.4 P3 / 附录 B；Delta-TR-2 精确授权）：**桌面窗口重试终态呈现**——
//  - `MODEL_REQUEST_RETRY_EXHAUSTED` 终态 ⇒ 恰一条**人话**系统行（delivery-note；含“自动重试”；
//    不出现技术 code/堆栈/URL）；lastTurn 小状态带 errorCode；turn.settled 诊断带 attempt/replayPlan；
//  - 重试后成功（completed + attempts=2 + replaySafe=true）⇒ 不产生失败系统行；lastTurn completed；
//    诊断如实标注 attempt=2/replayPlan=safe；
//  - 不安全失败（replaySafe=false）⇒ 沿用既有请求失败人话；诊断 replayPlan=unsafe（如实可见）；
//  - 整轮恰一条 settled 的消费语义不变：重复/迟到终态不重复系统行，失败后队列继续。
// 真实路径：真实 SessionManager + 可脚本化假句柄（与 request-timeout-wiring/turn-lease 同 harness 口径）；
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
import { translate } from "../../src/common/shared/i18n/index.ts";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-replay-safe-retry-wiring-diag-"));
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

/** 脚本化回合：ACK 开轮 → 观察窗 → 推 settled(detail) → 挂起（让 consume 先处理终态）→ 释放后抛错。 */
function settledTurn(h: Harness, roleId: string, turnId: string, detail: Record<string, unknown>, summary: string): { gate: ReturnType<typeof deferred>; pending: Promise<unknown> } {
  const gate = deferred();
  h.behaviors[roleId].push(async (ctx) => {
    ctx.opts?.onTurnStarted?.({ turnId, roleId, runtime: "demo" });
    await tick(30);
    h.streams[roleId].push({ kind: "settled", summary, turnId, roleId, runtime: "demo", detail: { turnId, ...detail } } as OrchestrationEvent);
    await gate.promise;
    throw new Error(`fixture: ${String(detail.outcome)}`);
  });
  return { gate, pending: h.mgr.send(`第 ${turnId} 轮`) };
}

test("重试耗尽终态：恰一条人话系统行（含“自动重试”、无技术 code）；lastTurn/诊断带 attempt/replayPlan", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const first = settledTurn(h, "A", "turn-R1", { outcome: "failed", errorCode: "MODEL_REQUEST_RETRY_EXHAUSTED", attempts: 3, replaySafe: true }, "本轮自动重试仍未成功，已结束。");
      await until(() => h.latest("A")?.busy === true, "重试耗尽轮未开跑");
      // 失败终态后队列继续：第二轮在忙时入队，settle 后自动投递。
      h.behaviors.A.push(async (ctx) => { ctx.opts?.onTurnStarted?.({ turnId: "turn-R2", roleId: "A", runtime: "demo" }); });
      const second = h.mgr.send("重试耗尽后的下一轮");
      await until(() => (h.latest("A")?.queue.length ?? 0) === 1, "后续消息未入队");
      await until(() => NOTE(h.envelopes).length === 1, "重试耗尽未产生系统行");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.outcome, "failed");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.errorCode, "MODEL_REQUEST_RETRY_EXHAUSTED");
      const firstNote = NOTE(h.envelopes)[0]!;
      const text = String(firstNote.event.summary ?? "");
      assert.ok(text.includes("自动重试") && text.includes("可稍后重发"), `系统行须为人话：${text}`);
      assert.ok(!/MODEL_REQUEST|RETRY_EXHAUSTED|Error|stack|https?:\/\//i.test(text), "系统行不得出现技术 code/堆栈/URL");
      assert.equal(firstNote.roleId, "A", "系统行进入目标角色 pane");
      first.gate.release();
      const firstResult = await first.pending as { ok: boolean; outcome?: string };
      assert.equal(firstResult.ok, false, "失败回合如实返回 ok:false（不伪造成功）");
      assert.equal(firstResult.outcome, "failed");
      await until(() => h.sent.A.includes("重试耗尽后的下一轮"), "失败终态后队列未继续");
      h.streams.A.push({ kind: "settled", summary: "会话结束", turnId: "turn-R2", roleId: "A", runtime: "demo", detail: { turnId: "turn-R2", outcome: "completed" } } as OrchestrationEvent);
      assert.equal((await second as { ok: boolean }).ok, true);
      // 重复/迟到终态不得再产生系统行（整轮恰一条 settled 的消费语义不变）。
      h.streams.A.push({ kind: "settled", summary: "重复终态", turnId: "turn-R1", roleId: "A", runtime: "demo", detail: { turnId: "turn-R1", outcome: "failed", errorCode: "MODEL_REQUEST_RETRY_EXHAUSTED", attempts: 3, replaySafe: true } } as OrchestrationEvent);
      await tick(60);
      assert.equal(NOTE(h.envelopes).length, 1, "重复/迟到终态不得重复系统行");
      const records = await diagnosticEvents(dir);
      const settled = records.filter((record) => record.event === "turn.settled" && record.turnId === "turn-R1");
      assert.ok(settled.length >= 1, "桌面须留 turn.settled 诊断");
      assert.equal(settled.at(-1)!.errorCode, "MODEL_REQUEST_RETRY_EXHAUSTED");
      assert.equal(settled.at(-1)!.attempt, 3, "turn.settled 诊断带 attempts（既有白名单 attempt 字段）");
      assert.equal(settled.at(-1)!.replayPlan, "safe", "turn.settled 诊断带 replaySafe（既有白名单 replayPlan 字段）");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("重试后成功：不产生失败系统行；lastTurn completed；诊断 attempt=2/replayPlan=safe", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const turn = settledTurn(h, "A", "turn-S1", { outcome: "completed", attempts: 2, replaySafe: true }, "会话结束");
      await until(() => h.latest("A")?.busy === true, "重试成功轮未开跑");
      await until(() => h.latest("A")?.busy === false, "settled 未复位 busy");
      assert.equal(NOTE(h.envelopes).length, 0, "成功重试不得产生失败系统行");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.outcome, "completed");
      assert.equal(h.mgr.lastTurnOf("/proj", "A", "demo")?.errorCode, undefined);
      turn.gate.release();
      await turn.pending;
      const records = await diagnosticEvents(dir);
      const settled = records.filter((record) => record.event === "turn.settled" && record.turnId === "turn-S1");
      assert.ok(settled.length >= 1);
      assert.equal(settled.at(-1)!.outcome, "completed");
      assert.equal(settled.at(-1)!.attempt, 2, "成功重试的 attempts 如实可见");
      assert.equal(settled.at(-1)!.replayPlan, "safe", "成功重试的 replaySafe 如实可见");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("不安全失败（replaySafe=false）：沿用既有请求失败人话；诊断 replayPlan=unsafe 如实可见", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const turn = settledTurn(h, "A", "turn-U1", { outcome: "failed", errorCode: "request-timeout-idle", attempts: 1, replaySafe: false, timeoutKind: "idle" }, "本轮请求超时（响应空闲超时）");
      await until(() => h.latest("A")?.busy === true, "不安全失败轮未开跑");
      await until(() => h.latest("A")?.busy === false, "settled 未复位 busy");
      turn.gate.release();
      await turn.pending;
      await tick(30);
      const notes = NOTE(h.envelopes);
      assert.equal(notes.length, 1, "不安全失败恰一条人话系统行");
      const text = String(notes[0]!.event.summary ?? "");
      assert.ok(text.includes("响应长时间中断"), `沿用既有空闲超时文案：${text}`);
      assert.ok(!/request-timeout|replay|MODEL_REQUEST/i.test(text), "系统行不含技术 code");
      const records = await diagnosticEvents(dir);
      const settled = records.filter((record) => record.event === "turn.settled" && record.turnId === "turn-U1");
      assert.equal(settled.at(-1)!.attempt, 1);
      assert.equal(settled.at(-1)!.replayPlan, "unsafe", "replaySafe=false 在诊断中如实可见");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("i18n：retryExhausted 中英成对、非空、英文零 Han、无技术细节", () => {
  const zh = translate("zh-CN", "main.requestStatus.retryExhausted");
  const en = translate("en-US", "main.requestStatus.retryExhausted");
  assert.ok(zh.trim() !== "" && en.trim() !== "");
  assert.match(zh, /自动重试/);
  assert.match(en, /retries/i);
  for (const text of [zh, en]) assert.ok(!/MODEL_REQUEST|RETRY_EXHAUSTED|ECONN|stack|https?:\/\//i.test(text), "文案不得含技术 code/URL/堆栈");
  assert.doesNotMatch(en, /\p{Script=Han}/u, "en-US 不得泄漏中文");
});

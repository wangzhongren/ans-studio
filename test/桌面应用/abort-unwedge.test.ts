// test/桌面应用/abort-unwedge.test.ts
// P0（2026-10-30 现场：10+ 次「停止本轮」~1ms 返回 ok 但零变化）：
//  - 手动停止必须能解开投递层楔死（busy/origins.running/activeDeliveries 强制复位）并让队列继续；
//  - 闲置（无忙态）时 abort 仍是幂等 no-op；
//  - 被放弃的在途投递落**恰一次** `delivery.end`（aborted:true，at-most-once，不重投）；
//  - 默认自动中止保持 0（本文件不触碰任何自动中止路径）。
// 真实路径：真实 SessionManager + 可脚本化假句柄；abort 走 `handle.abort()` 真实三态。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { TaskHandback } from "../../src/common/编排/handback.ts";
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

const HANDBACK_A: TaskHandback = {
  roleId: "A",
  taskId: "P0-A1",
  status: "completed",
  summary: "改完了 role-card",
  evidence: ["角色卡/A/role-card.md"],
  at: "2026-10-30T11:00:00.000Z",
};

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

interface RoleStateSnapshot {
  roleId: string;
  busy: boolean;
  queue: { kind: string; id: string }[];
  running: { kind: string } | null;
  blockedReason?: string | null;
  activeTurnId?: string | null;
}

interface SendContext {
  text: string;
  opts?: RoleSessionSendOptions;
  call: number;
  roleId: string;
}
type SendBehavior = (ctx: SendContext) => Promise<void> | void;

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  roleStates: RoleStateSnapshot[];
  behaviors: Record<string, SendBehavior[]>;
  latest: (roleId: string) => RoleStateSnapshot | undefined;
}

function makeHarness(): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const roleStates: RoleStateSnapshot[] = [];
  const behaviors: Record<string, SendBehavior[]> = { su: [], A: [] };
  const attempts: Record<string, number> = { su: 0, A: 0 };
  const stopped: Record<string, boolean> = { su: false, A: false };
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
    async abort() {
      return { ok: true, supported: true };
    },
    async dispose(): Promise<void> {
      stopped[roleId] = true;
    },
  });
  const mgr = new SessionManager({
    openRoleSession: async (input) => makeHandle(input.roleId),
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === l.projectRoot ? l : undefined),
    emitEvent: () => {},
    emitRoleState: (info) =>
      roleStates.push({
        roleId: info.roleId,
        busy: info.busy,
        queue: (info.queue ?? []).map((item) => ({ kind: item.kind, id: item.id })),
        running: info.running ? { kind: info.running.kind } : null,
        blockedReason: info.blockedReason ?? null,
        activeTurnId: info.activeTurnId ?? null,
      }),
  });
  return {
    mgr,
    streams,
    sent,
    roleStates,
    behaviors,
    latest: (roleId) => {
      for (let i = roleStates.length - 1; i >= 0; i -= 1) if (roleStates[i].roleId === roleId) return roleStates[i];
      return undefined;
    },
  };
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function withDiagnostics<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-abort-unwedge-diag-"));
  configureDiagnostics({ directory: dir });
  try {
    return await fn(dir);
  } finally {
    await disposeDiagnostics();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

interface DiagRecord {
  event: string;
  [key: string]: unknown;
}

async function diagnosticEvents(dir: string): Promise<DiagRecord[]> {
  await flushDiagnostics();
  const files = await fs.readdir(dir);
  const records: DiagRecord[] = [];
  for (const file of files) {
    const text = await fs.readFile(path.join(dir, file), "utf8");
    for (const line of text.trim().split("\n")) {
      if (line === "") continue;
      records.push(JSON.parse(line) as DiagRecord);
    }
  }
  return records;
}

/** 诊断字段直接平铺在记录顶层（createDiagnosticLogger 的落盘形状）。 */
const fieldsOf = (record: DiagRecord): Record<string, unknown> => record;

test("P0 abort 解楔：在跑回合停止后强制复位 origin/busy 并让队列继续", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const gate = deferred();
      h.behaviors.su.push((ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-live", roleId: "su", runtime: "demo" });
        return gate.promise;
      });
      const pending = h.mgr.send("长回合", undefined, { projectRoot: "/proj", roleId: "su", runtime: "demo" });
      await until(() => h.latest("su")?.busy === true && h.latest("su")?.activeTurnId === "turn-live", "长回合未开跑");

      const result = await h.mgr.abort({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      assert.deepEqual({ ok: result.ok, supported: result.supported }, { ok: true, supported: true }, "abort 真实成功");
      assert.equal(h.latest("su")?.busy, false, "停止后投递层忙态必须复位（不再 1ms ok 零变化）");
      assert.equal(h.latest("su")?.activeTurnId, null, "停止后不得残留当前回合归属");
      const events = await diagnosticEvents(dir);
      const forced = events.filter((record) => record.event === "turn.abort.forced");
      assert.equal(forced.length, 1, "解楔恰一条 turn.abort.forced 诊断");
      assert.equal(fieldsOf(forced[0]).turnId, "turn-live", "解楔对象是真实在跑的回合（origin 存在）");
      assert.equal(fieldsOf(forced[0]).reasonCode, "abort-requested");
      assert.equal(fieldsOf(forced[0]).mode, "forced");

      // 队列继续：回交在停止后正常投递（不再被 target-busy 楔死）。
      gate.release();
      await pending;
      const sentBefore = h.sent.su.length;
      h.streams.A.push({ kind: "handback", summary: "回交 su", handback: HANDBACK_A });
      await until(() => h.sent.su.length === sentBefore + 1, "停止后队列未继续投递");
      h.streams.su.push({ kind: "settled", summary: "回交轮完成", turnId: "turn-su-2", roleId: "su", runtime: "demo" });
      await until(() => (h.latest("su")?.queue.length ?? 0) === 0 && h.latest("su")?.busy === false, "队列未排空");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("P0 abort 解楔：在途投递被放弃时落恰一次 delivery.end(aborted)，不重投、不复活忙态", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      const gate = deferred();
      h.behaviors.su.push((ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-H", roleId: "su", runtime: "demo" });
        return gate.promise;
      });
      h.streams.A.push({ kind: "handback", summary: "回交 su", handback: HANDBACK_A });
      await until(() => h.latest("su")?.busy === true && h.latest("su")?.running?.kind === "handback", "回交未认领");

      const result = await h.mgr.abort({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      assert.equal(result.ok, true);
      assert.equal(h.latest("su")?.busy, false);
      assert.equal(h.latest("su")?.queue.length ?? 0, 0, "在途条目不得回到队列（at-most-once）");
      assert.equal(h.mgr.watchdogSnapshot("/proj")?.activeDeliveries, 0, "activeDeliveries 必须复位");
      const events = await diagnosticEvents(dir);
      const ends = events.filter((record) => record.event === "delivery.end" && fieldsOf(record).state === "handback");
      assert.equal(ends.length, 1, "被放弃的在途投递恰一条 delivery.end");
      assert.equal(fieldsOf(ends[0]).mode, "aborted");
      assert.equal(fieldsOf(ends[0]).reasonCode, "abort-requested");

      // send promise 后解析：不得第二次记账/回队/复活忙态。
      gate.release();
      await tick(150);
      const after = await diagnosticEvents(dir);
      const endsAfter = after.filter((record) => record.event === "delivery.end" && fieldsOf(record).state === "handback");
      const failsAfter = after.filter((record) => record.event === "delivery.failed");
      assert.equal(endsAfter.length, 1, "delivery.end 恰一次（续段不重复）");
      assert.equal(failsAfter.length, 0, "已放弃的投递不得再记 delivery.failed");
      assert.equal(h.latest("su")?.queue.length ?? 0, 0, "不得回队重投");
      h.streams.su.push({ kind: "settled", summary: "迟到终局", turnId: "turn-H", roleId: "su", runtime: "demo" });
      await tick(120);
      assert.equal(h.latest("su")?.busy, false, "迟到 settled 不得复活忙态");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("P0 abort 幂等：无忙态/无在途时 no-op（不产生 forced 诊断）", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      await tick(30);
      const result = await h.mgr.abort({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      assert.deepEqual({ ok: result.ok, supported: result.supported }, { ok: true, supported: true });
      const events = await diagnosticEvents(dir);
      assert.equal(events.filter((record) => record.event === "turn.abort.forced").length, 0, "闲置 abort 不产生 forced 诊断");
      assert.equal(h.latest("su")?.busy, false);
    } finally {
      await h.mgr.stop(null);
    }
  });
});

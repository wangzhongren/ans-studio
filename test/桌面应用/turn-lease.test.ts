// test/桌面应用/turn-lease.test.ts
// P0（2026-10-30 团队计划 附录 B / Delta-TR-2）：**收尾不变量**——
//  - turn lease/origin 不被失败投递覆盖或删除；
//  - settled 按 turnId 兜底清 busy（origin 精确匹配不成立也不得永久楔死；迟到旧回合不误清新回合）；
//  - `delivery.end` 完整性：turn 先 settled、send promise 后解析时，终态只记账一次（现场「turn.end 后无
//    delivery.end → busy 不复位」的对账缺口）。
// 真实路径：真实 SessionManager + 可脚本化假句柄（与 handback-delivery/message-queue 同 harness 口径）；
// 诊断经真实 createDiagnosticLogger（临时目录）核对，不用 helper 自证。

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
  taskId: "P0-T1",
  status: "completed",
  summary: "改完了 role-card",
  evidence: ["角色卡/A/role-card.md"],
  at: "2026-10-30T10:00:00.000Z",
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
  queue: { kind: string; id: string; summary: string; ageMs?: number }[];
  running: { kind: string; summary: string } | null;
  headKind?: string | null;
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
  envelopes: { roleId: string; event: { kind: string; summary?: string; detail?: unknown } }[];
  behaviors: Record<string, SendBehavior[]>;
  latest: (roleId: string) => RoleStateSnapshot | undefined;
}

function makeHarness(): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const roleStates: RoleStateSnapshot[] = [];
  const envelopes: Harness["envelopes"] = [];
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
    emitEvent: (env) => envelopes.push(env as Harness["envelopes"][number]),
    emitRoleState: (info) =>
      roleStates.push({
        roleId: info.roleId,
        busy: info.busy,
        queue: (info.queue ?? []).map((item) => ({ ...item })),
        running: info.running ? { ...info.running } : null,
        headKind: info.headKind ?? null,
        blockedReason: info.blockedReason ?? null,
        activeTurnId: info.activeTurnId ?? null,
      }),
  });
  return {
    mgr,
    streams,
    sent,
    roleStates,
    envelopes,
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-turn-lease-diag-"));
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

test("P0 turn lease：失败投递不覆盖在跑回合的 origin；turn.end 后 busy 复位、队列继续（现场形状）", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      await tick(30);
      // 第一轮：直接 send（可控挂起）——真实开跑，绑定 turn-A。
      const gate = deferred();
      h.behaviors.su.push((ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-A", roleId: "su", runtime: "demo" });
        return gate.promise;
      });
      const pendingA = h.mgr.send("第一轮");
      await until(() => h.latest("su")?.busy === true && h.latest("su")?.activeTurnId === "turn-A", "第一轮未开跑");

      // 失败回交进入队列（su 忙）——必须是排队，不得覆盖 turn-A 的投递归属。
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      h.streams.A.push({ kind: "handback", summary: "回交 su", handback: HANDBACK_A });
      await until(() => (h.latest("su")?.queue.length ?? 0) === 1, "回交未入队");
      assert.equal(h.latest("su")?.activeTurnId, "turn-A", "在跑回合的 origin/turnId 不得被排队投递覆盖");
      assert.equal(h.latest("su")?.headKind, "handback");
      assert.equal(h.latest("su")?.blockedReason, "target-busy");

      // 释放第一轮 → settled(turn-A)：busy 复位；失败回交被认领但抛错（未 ACK ⇒ 保留重试）。
      h.behaviors.su.push(() => {
        throw new Error("演示：投递通道瞬时失败");
      });
      gate.release();
      await pendingA;
      h.streams.su.push({ kind: "settled", summary: "turn-A 完成", turnId: "turn-A", roleId: "su", runtime: "demo" });
      await until(() => (h.latest("su")?.queue.length ?? 0) === 1 && h.latest("su")?.busy === false, "失败回交未按既有语义保留/放行");
      assert.deepEqual(h.sent.su, ["第一轮"], "未 ACK 的失败回交不得并发投递/重复发送");

      // 下一次时机（看护 system 入队触发 drain）→ 回交重试成功，system 随后按序投递。
      h.mgr.watchdogDeliver("/proj", { text: "[系统·看护] 队列继续", summary: "系统·看护 · 继续", dedupKey: "watchdog\u0000/proj\u0000p0-test\u00001" });
      await until(() => h.sent.su.length === 2, "回交重试未投递");
      h.streams.su.push({ kind: "settled", summary: "回交轮完成", turnId: "turn-su-3", roleId: "su", runtime: "demo" });
      await until(() => h.sent.su.length === 3, "system 条目未按序投递");
      h.streams.su.push({ kind: "settled", summary: "system 轮完成", turnId: "turn-su-4", roleId: "su", runtime: "demo" });
      await until(() => (h.latest("su")?.queue.length ?? 0) === 0 && h.latest("su")?.busy === false, "队列未排空/忙态未复位");

      const events = await diagnosticEvents(dir);
      const failed = events.filter((record) => record.event === "delivery.failed" && fieldsOf(record).state === "handback");
      assert.equal(failed.length, 1, "失败回交恰一条 delivery.failed（可对账）");
      const settled = events.filter((record) => record.event === "turn.settled" && fieldsOf(record).turnId === "turn-A");
      assert.ok(settled.length >= 1, "turn-A 的 settled 必须留下诊断");
      assert.equal(fieldsOf(settled[settled.length - 1]).state, "origin-matched", "turn-A 的 settle 与 origin 精确匹配");
      const ends = events.filter((record) => record.event === "delivery.end" && fieldsOf(record).state === "handback");
      assert.equal(ends.length, 1, "成功重试的回交恰一条 delivery.end");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("P0 settled 按 turnId 兜底：无 turnId 的终局也清 busy（idle-busy 自愈）；迟到旧 turnId 不误清新回合", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      await tick(30);
      // 第一轮：绑定 turn-1，但终局事件**无 turnId**（现场「turn.end 后 origin 匹配不成立」形状）。
      const gate = deferred();
      h.behaviors.su.push((ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-1", roleId: "su", runtime: "demo" });
        return gate.promise;
      });
      const pending1 = h.mgr.send("第一轮");
      await until(() => h.latest("su")?.activeTurnId === "turn-1", "第一轮未开跑");
      gate.release();
      await pending1;
      h.streams.su.push({ kind: "settled", summary: "无 turnId 的终局", roleId: "su", runtime: "demo" });
      await until(() => h.latest("su")?.busy === false, "settled 缺 turnId 时 busy 未兜底复位（永久楔死）");
      const events = await diagnosticEvents(dir);
      const missing = events.filter((record) => record.event === "turn.origin-missing");
      assert.ok(
        missing.some((record) => fieldsOf(record).reasonCode === "settled-without-turn-id"),
        "缺 turnId 的兜底必须留下 turn.origin-missing(reasonCode=settled-without-turn-id)",
      );

      // 新回合 turn-2 在跑时，迟到旧 turn-1 的 settled 不得清 busy（防并发/误清）。
      const gate2 = deferred();
      h.behaviors.su.push((ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-2", roleId: "su", runtime: "demo" });
        return gate2.promise;
      });
      const pending2 = h.mgr.send("第二轮");
      await until(() => h.latest("su")?.activeTurnId === "turn-2" && h.latest("su")?.busy === true, "第二轮未开跑");
      h.streams.su.push({ kind: "settled", summary: "迟到旧终局", turnId: "turn-1", roleId: "su", runtime: "demo" });
      await tick(120);
      assert.equal(h.latest("su")?.busy, true, "两个已知 turnId 明确不同 ⇒ 迟到旧 settled 不得清掉在跑新回合");
      assert.equal(h.latest("su")?.activeTurnId, "turn-2");
      gate2.release();
      await pending2;
      h.streams.su.push({ kind: "settled", summary: "第二轮完成", turnId: "turn-2", roleId: "su", runtime: "demo" });
      await until(() => h.latest("su")?.busy === false, "第二轮 settled 未复位 busy");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

test("P0 并发 direct send + drain：同一时刻至多一个回合开跑，另一条排队；先后各投一次、队列清空", async () => {
  const h = makeHarness();
  try {
    await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    await tick(30);
    // 同一 tick 触发两条路径：回交入队（drain）＋直接 send（direct）。
    h.streams.A.push({ kind: "handback", summary: "并发回交", handback: HANDBACK_A });
    const direct = h.mgr.send("并发直发", undefined, { projectRoot: "/proj", roleId: "su", runtime: "demo" });
    const directResult = await direct;
    assert.equal(directResult.ok, true, "直发如实受理（未排队或排队均为 ok）");
    await until(() => h.sent.su.length >= 1, "并发后没有任何回合开跑");
    await tick(150);
    // **核心不变量**：无论谁抢到 turn lease，另一条必须排队——绝不同时开跑/覆盖 origin。
    assert.equal(h.sent.su.length, 1, "同一时刻至多一个回合开跑（另一条排队）");

    // 第一轮结束（无 turnId 的终局按 P0 兜底清忙）→ 第二条放行。
    h.streams.su.push({ kind: "settled", summary: "并发第一轮结束", roleId: "su", runtime: "demo" });
    await until(() => h.sent.su.length === 2, "settle 后第二条未放行（并发丢失/楔死）");
    h.streams.su.push({ kind: "settled", summary: "并发第二轮结束", roleId: "su", runtime: "demo" });
    await until(() => (h.latest("su")?.queue.length ?? 0) === 0 && h.latest("su")?.busy === false, "并发后队列未排空/忙态未复位");

    const directCount = h.sent.su.filter((text) => text === "并发直发").length;
    const handbackCount = h.sent.su.filter((text) => text.includes("改完了 role-card")).length;
    assert.equal(directCount, 1, "并发直发恰一次");
    assert.equal(handbackCount, 1, "并发回交恰一次");
    assert.equal(h.sent.su.length, 2, "两条请求各投一次，无重复/无丢失");
  } finally {
    await h.mgr.stop(null);
  }
});

test("P0 delivery.end 完整性：turn 先 settled、send promise 后解析——终态恰一次", async () => {
  await withDiagnostics(async (dir) => {
    const h = makeHarness();
    try {
      await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
      await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
      await tick(30);
      // 回交入队 → 认领；turnId 先 ACK，send promise 挂起（模拟 slow adapter：settled 先于 send 解析）。
      const gate = deferred();
      h.behaviors.su.push((ctx) => {
        ctx.opts?.onTurnStarted?.({ turnId: "turn-H1", roleId: "su", runtime: "demo" });
        return gate.promise;
      });
      h.streams.A.push({ kind: "handback", summary: "回交 su", handback: HANDBACK_A });
      await until(() => h.latest("su")?.busy === true && h.latest("su")?.running?.kind === "handback", "回交未认领");

      // 回合先结束：settle 收尾必须补 delivery.end（现场缺失的对账项），并撤销 activeDeliveries。
      h.streams.su.push({ kind: "settled", summary: "回交轮完成", turnId: "turn-H1", roleId: "su", runtime: "demo" });
      await until(() => h.latest("su")?.busy === false, "settle 后 busy 未复位");
      assert.equal(h.mgr.watchdogSnapshot("/proj")?.activeDeliveries, 0, "settle 收尾必须撤销 activeDeliveries");
      const early = await diagnosticEvents(dir);
      const earlyEnds = early.filter((record) => record.event === "delivery.end" && fieldsOf(record).state === "handback");
      assert.equal(earlyEnds.length, 1, "settle 收尾应补恰一条 delivery.end");
      assert.equal(fieldsOf(earlyEnds[0]).phase, "turn-settled", "补记账来自 settle 收尾（phase=turn-settled）");

      // send promise 后解析：不得第二次记账、不得回队重投。
      gate.release();
      await tick(150);
      const after = await diagnosticEvents(dir);
      const ends = after.filter((record) => record.event === "delivery.end" && fieldsOf(record).state === "handback");
      const fails = after.filter((record) => record.event === "delivery.failed" && fieldsOf(record).state === "handback");
      assert.equal(ends.length, 1, "delivery.end 恰一次（续段不重复）");
      assert.equal(fails.length, 0, "回合已完成后不得再记 delivery.failed");
      assert.equal(h.latest("su")?.queue.length ?? 0, 0, "已完成条目不得回队");
    } finally {
      await h.mgr.stop(null);
    }
  });
});

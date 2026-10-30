// test/桌面应用/queue-visibility.test.ts
// P0（2026-10-30 团队计划 P0「队列可见性」/ 设计 §7.3.2）：`session:role-state` 数据面暴露
//  - 每条排队条目的 `ageMs`（入队即定格，显示「等待 N 分」）；
//  - 队首类别 `headKind`、阻塞原因 `blockedReason`（target-busy / origin-missing / session-closed）、
//    当前回合 id `activeTurnId`——客户可看出「为什么没动」。
// 真实路径：真实 SessionManager 快照外推（不造第二数据源）；注入时钟核对 ageMs。

import test from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { TaskHandback } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => boolean, label = "等待实际事件超时"): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    if (predicate()) return;
    await tick(5);
  }
  assert.fail(label);
}

function handback(taskId: string): TaskHandback {
  return {
    roleId: "A",
    taskId,
    status: "completed",
    summary: `完成 ${taskId}`,
    evidence: ["角色卡/A/role-card.md"],
    at: "2026-10-30T12:00:00.000Z",
  };
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

interface RoleStateSnapshot {
  roleId: string;
  busy: boolean;
  summaries: string[];
  queue: { kind: string; id: string; summary: string; ageMs: number }[];
  running: { kind: string; ageMs?: number } | null;
  headKind?: string | null;
  blockedReason?: string | null;
  activeTurnId?: string | null;
}

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  roleStates: RoleStateSnapshot[];
  clock: { value: number };
  behaviors: Record<string, ((ctx: { text: string; opts?: RoleSessionSendOptions; call: number }) => Promise<void> | void)[]>;
  latest: (roleId: string) => RoleStateSnapshot | undefined;
}

function makeHarness(): Harness {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const roleStates: RoleStateSnapshot[] = [];
  const behaviors: Harness["behaviors"] = { su: [], A: [] };
  const attempts: Record<string, number> = { su: 0, A: 0 };
  const stopped: Record<string, boolean> = { su: false, A: false };
  const clock = { value: 1_000_000 };
  const makeHandle = (roleId: string): RoleSessionHandle => ({
    runtime: "demo",
    roleId,
    async send(text: string, opts?: RoleSessionSendOptions): Promise<void> {
      attempts[roleId] += 1;
      const behavior = behaviors[roleId]?.shift();
      if (behavior) await behavior({ text, opts, call: attempts[roleId] });
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
        summaries: [...info.summaries],
        queue: (info.queue ?? []).map((item) => ({ ...item })),
        running: info.running ? { ...info.running } : null,
        headKind: info.headKind ?? null,
        blockedReason: info.blockedReason ?? null,
        activeTurnId: info.activeTurnId ?? null,
      }),
    now: () => clock.value,
  });
  return {
    mgr,
    streams,
    sent,
    roleStates,
    clock,
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

test("P0 队列可见：ageMs/headKind/blockedReason/activeTurnId 随真实快照外推（忙时等待）", async () => {
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

    h.streams.A.push({ kind: "handback", summary: "回交1", handback: handback("P0-Q1") });
    await until(() => (h.latest("su")?.queue.length ?? 0) === 1, "回交1 未入队");
    h.clock.value += 90_000;
    // 现场形状：同一忙目标积压到 9 条（回交2..9 同时到达）。
    for (let i = 2; i <= 9; i += 1) {
      h.streams.A.push({ kind: "handback", summary: `回交${i}`, handback: handback(`P0-Q${i}`) });
    }
    await until(() => (h.latest("su")?.queue.length ?? 0) === 9, "回交2..9 未入队");

    const busyState = h.latest("su")!;
    assert.equal(busyState.busy, true);
    assert.equal(busyState.headKind, "handback", "队首类别暴露到数据面");
    assert.equal(busyState.blockedReason, "target-busy", "为什么没动 = 目标忙");
    assert.equal(busyState.activeTurnId, "turn-live", "当前回合 id 暴露到数据面");
    assert.equal(busyState.queue.length, 9, "现场队列深度 9");
    assert.equal(busyState.queue[0].ageMs, 90_000, "第 1 条等待 = 90s（入队即定格）");
    assert.equal(busyState.queue[8].ageMs, 0, "最后一条刚入队");
    const queueState = h.roleStates.filter((state) => state.roleId === "su" && state.queue.length === 9).at(-1)!;
    assert.equal(queueState.queue[0].id.length > 0, true, "条目仍携撤回定位键");

    // 释放回合：settle 后队列放行（回交合批），忙态快照 + running 位如实。
    gate.release();
    await pending;
    const sentBefore = h.sent.su.length;
    h.streams.su.push({ kind: "settled", summary: "turn-live 完成", turnId: "turn-live", roleId: "su", runtime: "demo" });
    await until(() => h.sent.su.length === sentBefore + 1, "队列未继续投递");
    const runningState = h.latest("su")!;
    assert.equal(runningState.busy, true);
    assert.equal(runningState.running?.kind, "handback", "进行中投递位如实");
    assert.equal(runningState.queue.length, 0, "回交合批后队列清空");
    assert.equal(runningState.blockedReason, null, "队列空 ⇒ 无阻塞原因");
    h.streams.su.push({ kind: "settled", summary: "回交轮完成", turnId: "turn-su-2", roleId: "su", runtime: "demo" });
    await until(() => h.latest("su")?.busy === false && (h.latest("su")?.queue.length ?? 0) === 0, "队列未排空");
    assert.equal(h.latest("su")?.activeTurnId, null);
  } finally {
    await h.mgr.stop(null);
  }
});

test("P0 队列可见：目标会话未开时 blockedReason=session-closed（入队即外推，随后自动开启）", async () => {
  const h = makeHarness();
  try {
    await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    await tick(30);
    h.streams.A.push({ kind: "handback", summary: "回交 su", handback: handback("P0-Q3") });
    await until(() => h.roleStates.some((state) => state.roleId === "su" && state.queue.length === 1), "回交未入 su 队列");
    const enqueueState = h.roleStates.find((state) => state.roleId === "su" && state.queue.length === 1)!;
    assert.equal(enqueueState.blockedReason, "session-closed", "目标会话未开且无自动开启链 ⇒ session-closed");
    assert.equal(enqueueState.headKind, "handback");
    assert.equal(enqueueState.activeTurnId, null);
    assert.equal(enqueueState.queue[0].ageMs, 0);

    // 投递机自动开启 su 并投递（既有语义不变）。
    await until(() => h.sent.su.length === 1, "su 未自动开启并投递");
    h.streams.su.push({ kind: "settled", summary: "回交轮完成", turnId: "turn-su-1", roleId: "su", runtime: "demo" });
    await until(() => (h.latest("su")?.queue.length ?? 0) === 0 && h.latest("su")?.busy === false, "队列未排空");
  } finally {
    await h.mgr.stop(null);
  }
});

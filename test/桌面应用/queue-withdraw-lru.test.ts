// test/桌面应用/queue-withdraw-lru.test.ts
// P1-1 / P1-2（2026-10-13 客户裁定，产品提案原文：角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md §P1-1/§P1-2）
//
// P1-1 撤回（仅未投递的客户消息可撤；进行中无效如实；派发/回交只读）：
//   - 忙时入队两条 → 撤第 2 条 → ok + summary（聊天流「已撤回排队消息：〈摘要〉」的文案来源）；
//     快照位次前移（同 role-state 通道，不造第二套数据源）；
//   - 已进「进行中」（drain 已 shift）⇒ 撤回无效、如实回错；
//   - 回交条目（治理流）⇒ 拒撤（只读口径，与界面「无撤回钮」同语义）；不存在 ⇒ 如实回错。
//
// P1-2 LRU 淘汰避开 busy：上限 3、1 个在跑 → 挑最久未用的**非 busy** 者；全忙暂超限；
//   settled 后下一时机再收；busy 者全程不被掐断。
//
// 全程假句柄（handle.send 只登记文本），不发真实模型请求。

import test from "node:test";
import assert from "node:assert/strict";

import { SessionManager, MAX_LIVE_SESSIONS } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function listing(roleIds: string[], primaryRoleId: string): ProjectListing {
  const mk = (roleId: string): ProjectListing["roles"][number] => ({
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
  return { projectRoot: "/proj", roles: roleIds.map(mk), warnings: [], hasRoles: true, primaryRoleId };
}

interface QueueViewItem {
  kind: string;
  sourceRoleId: string;
  summary: string;
  at: string;
  id: string;
  full: string;
}

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  roleStates: { roleId: string; busy: boolean; queue: QueueViewItem[] }[];
  emitted: { roleId: string; kind: string; summary: string }[];
  latest: (roleId: string) => { roleId: string; busy: boolean; queue: QueueViewItem[] } | undefined;
  /** F-2-T5 夹具：挂起某角色**下一次** send（release 前不 resolve）。 */
  hangNext: (roleId: string) => () => void;
}

function makeHarness(l: ProjectListing): Harness {
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const roleStates: Harness["roleStates"] = [];
  const emitted: Harness["emitted"] = [];
  const stopped: Record<string, boolean> = {};
  // F-2-T5 夹具（2026-10-16）：可控挂起的 send——release 前 promise 不 resolve（模拟整轮在跑）。
  const nextGate: Record<string, Promise<void> | undefined> = {};
  const hangNext = (roleId: string): (() => void) => {
    let release!: () => void;
    nextGate[roleId] = new Promise<void>((resolve) => { release = resolve; });
    return release;
  };
  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    streams[roleId] = streams[roleId] ?? [];
    sent[roleId] = sent[roleId] ?? [];
    return {
      async send(text: string): Promise<void> {
        const gate = nextGate[roleId];
        if (gate) {
          nextGate[roleId] = undefined;
          await gate;
        }
        sent[roleId].push(text);
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 20000; tries += 1) { // 长预算：全程不因“无事件期”自行收口（stop 才收）
                  if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] ?? [];
                  if (i < arr.length) return { value: arr[i++], done: false };
                  await tick(5);
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose(): Promise<void> {
        stopped[roleId] = true;
      },
    };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input: { roleId: string }) => makeHandle(input.roleId),
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === "/proj" ? l : undefined),
    emitEvent: (env: { roleId: string; event: { kind: string; summary?: string } }) =>
      emitted.push({ roleId: env.roleId, kind: env.event.kind, summary: String(env.event.summary ?? "") }),
    emitRoleState: (info) =>
      roleStates.push({
        roleId: info.roleId,
        busy: info.busy,
        queue: ((info.queue ?? []) as QueueViewItem[]).map((q) => ({ ...q })),
      }),
  });
  return {
    mgr,
    streams,
    sent,
    roleStates,
    emitted,
    hangNext,
    latest: (roleId) => {
      for (let i = roleStates.length - 1; i >= 0; i -= 1) if (roleStates[i].roleId === roleId) return roleStates[i];
      return undefined;
    },
  };
}

test("P1-1 撤回：忙时入队两条 → 撤第 2 条（ok+摘要、位次前移、id/full 在快照里）；进行中/回交/不存在都如实回错", async () => {
  const l = listing(["su", "A"], "su");
  const h = makeHarness(l);
  const opened = await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(opened.ok, true);
  await tick(30);

  await h.mgr.send("第一条（在跑）"); // A 忙（无 settled ⇒ 忙态保持——排队场景）
  assert.equal(h.latest("A")?.busy, true);
  const longText = "第二条·需要完整全文的一行".repeat(6); // 摘要会被截断、full 应逐字保留
  const r1 = await h.mgr.send("第二条");
  assert.equal(r1.queued, true);
  const r2 = await h.mgr.send(longText);
  assert.equal(r2.queued, true);
  await tick(30);

  const q = h.latest("A")?.queue ?? [];
  assert.equal(q.length, 2, "两条都排队中");
  assert.ok(q[0].id !== "" && q[1].id !== "", "快照条目带撤回定位 id（单一数据源）");
  assert.ok(q[1].full === longText && q[1].full !== q[1].summary, "full = 入队即定格的**全文**（摘要仍截断）");

  // 撤第 2 条（长文那条）：
  const wd = h.mgr.withdraw("A", q[1].id);
  assert.equal(wd.ok, true, "未投递的客户消息可撤");
  assert.equal(wd.summary, q[1].summary, "返回摘要供聊天流如实一行「已撤回排队消息：〈摘要〉」");
  await tick(30);
  const qAfter = h.latest("A")?.queue ?? [];
  assert.equal(qAfter.length, 1, "撤回后队列少一条");
  assert.equal(qAfter[0].summary, q[0].summary, "剩下的位次前移（第 2 条升到 1——既有快照机制，不造第二套）");
  assert.ok(h.sent.A.includes("第一条（在跑）"), "撤回不影响在跑那条");

  // 已进入「进行中」的条目：settle → drain 投递第 1 条 → activeDeliveries 登记 ⇒ 撤回无效、如实回错。
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(240);
  assert.ok(h.sent.A.includes("第二条"), "队列头（原第 1 条）已投递开跑");
  const wdRunning = h.mgr.withdraw("A", q[0].id);
  assert.equal(wdRunning.ok, false, "进行中的撤回无效");
  assert.match(wdRunning.error ?? "", /进行中/, "如实说明原因（正在被执行）");
  // 消息投递**不得**落派发口径文案（本轮带出的错口径修复：派发/回交/消息三类各归各位）。
  assert.ok(
    !h.emitted.some((e) => e.summary.includes("派发任务")),
    "排队客户消息投递不出现「派发任务」字样（错口径已修）"
  );

  // 回交条目（治理流）：su 先置忙（否则投递机自动开启 su 会当场投递、进不了队列）——再推回交事件，拒撤（只读）。
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(15);
  await h.mgr.send("su 忙住（占位）");
  assert.equal(h.latest("su")?.busy, true, "su 置忙");
  h.streams.A.push({
    kind: "handback",
    summary: "回交 su",
    handback: { roleId: "A", taskId: "t1", status: "completed", summary: "做完了", evidence: [], at: "2026-10-13T00:00:00.000Z" },
  });
  await tick(240);
  const suQ = h.latest("su")?.queue ?? [];
  assert.equal(suQ.length, 1, "回交已入 su 队列");
  assert.equal(suQ[0].kind, "handback");
  const wdHb = h.mgr.withdraw("su", suQ[0].id);
  assert.equal(wdHb.ok, false, "回交条目只读——不可撤回（治理流）");
  assert.match(wdHb.error ?? "", /只读|不可撤回/, "如实说明（与界面「无撤回钮」同语义）");
  assert.equal((h.latest("su")?.queue ?? []).length, 1, "拒撤后回交仍在队（未被误删）");

  // 不存在的 id：如实回错。
  const wdNone = h.mgr.withdraw("A", "不存在");
  assert.equal(wdNone.ok, false);
  assert.match(wdNone.error ?? "", /不在排队中/, "如实（可能已投递或已撤回）");
  await h.mgr.stop(null);
});

test("P1-2 LRU 避开 busy：挑最久未用的非 busy 者；全忙暂超限；settled 后下一时机再收；在跑的全程不被掐断", async () => {
  assert.equal(MAX_LIVE_SESSIONS, 3, "上限值前提（提案按 3 论述）");
  const l = listing(["B", "A", "C", "D"], "");
  const h = makeHarness(l);

  // 建局：开 B、A、C（随后把 B 排成「最久未用 + 在跑」）。open 续接会刷新 lastUsed——按调用序排 LRU。
  await h.mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" });
  await tick(15);
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(15);
  await h.mgr.open({ projectRoot: "/proj", roleId: "C", runtime: "demo" });
  await tick(15);
  // 让 B 在跑（open 续接把活动切到 B；send 后无 settled ⇒ busy 持续），再按用 A、C 把 B 压成最久未用。
  await h.mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" });
  await tick(15);
  await h.mgr.send("B 的后台任务");
  assert.equal(h.latest("B")?.busy, true, "B 在跑（且此后一直不 settle）");
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(15);
  await h.mgr.open({ projectRoot: "/proj", roleId: "C", runtime: "demo" });
  await tick(15);

  // live={B(busy,最久),A,C} 共 3（满）——open D ⇒ 超限 ⇒ 应淘汰最久未用的**非 busy** 者（A），绝不淘汰 B。
  await h.mgr.open({ projectRoot: "/proj", roleId: "D", runtime: "demo" });
  await tick(30);
  assert.deepEqual(h.mgr.liveRoleIds().sort(), ["B", "C", "D"], "busy 的 B 不被淘汰；淘汰的是最久未用的非 busy 者（A）");
  assert.equal(h.latest("B")?.busy, true, "B 仍在跑（没有被静默掐断）");

  // 「全忙 ⇒ 暂超限」再证：把现存的 A→不在此局（已淘汰）……改用干净场景：
  // 开 B/A/C 三个**全部置忙**（各自 open→send，无 settled）→ open D ⇒ 无任何非 busy 候选 ⇒ **暂超限**（4 个都在）；
  // 随后 B settled ⇒ 下一时机（settled 收口）只收非 busy 的 B（最久未用），回到上限 3。
  await h.mgr.stop(null); // 上一局收干净
  await tick(60);
  const h2 = makeHarness(listing(["B", "A", "C", "D"], ""));
  for (const id of ["B", "A", "C"]) {
    await h2.mgr.open({ projectRoot: "/proj", roleId: id, runtime: "demo" });
    await tick(15);
    await h2.mgr.send(id + " 的后台任务");
    await tick(15);
  }
  assert.equal(h2.latest("B")?.busy, true);
  assert.equal(h2.latest("A")?.busy, true);
  assert.equal(h2.latest("C")?.busy, true);
  assert.deepEqual(h2.mgr.liveRoleIds().sort(), ["A", "B", "C"], "满 3");
  await h2.mgr.open({ projectRoot: "/proj", roleId: "D", runtime: "demo" });
  await tick(30);
  assert.deepEqual(h2.mgr.liveRoleIds().sort(), ["A", "B", "C", "D"], "全忙 ⇒ **暂超限**（一个都不掐断）");
  h2.streams.B.push({ kind: "settled", summary: "B 一轮结束" });
  await tick(300);
  assert.deepEqual(h2.mgr.liveRoleIds().sort(), ["A", "C", "D"], "settled 后下一时机收 B（最久未用的非忙者；暂超限的账在此清零）");
  assert.equal(h2.latest("A")?.busy, true, "仍在跑的其余角色不受影响");
  await h2.mgr.stop(null);
});

// ————— F-2-T5（2026-10-16 客户批准）：认领已发生、send 尚未 resolve 的窗口语义 —————
// F-2-M1 把投递的「认领（shift/置忙/activeDeliveries 登记）」与「send 结算」拆开——本用例钉住：
// **认领已发生但 send promise 仍挂起**的条目，withdraw 仍如实「进行中，撤回无效」；放行后顺序与内容不损。

test("F-2-T5 认领已发生（send 未结）⇒ withdraw 如实「进行中，撤回无效」；放行后两笔按序送达（撤回无效 ≠ 丢弃）", async () => {
  const l = listing(["su", "A"], "su");
  const h = makeHarness(l);
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);

  // 第一轮由直接消息开跑并挂起（send promise 未结——模拟真实 Pi 整轮在跑）：
  const release1 = h.hangNext("A");
  const p1 = h.mgr.send("在跑（挂起）");
  await tick(30);
  assert.equal(h.latest("A")?.busy, true, "第一轮在跑（真实快照忙）");

  // 第二条客户消息（A 忙 ⇒ 入队）。
  const r2 = await h.mgr.send("排队消息");
  assert.equal(r2.queued, true);
  const queued = h.latest("A")?.queue ?? [];
  assert.equal(queued.length, 1);
  const msg2Id = queued[0].id;

  // A settle ⇒ drain **认领**第二条（activeDeliveries 登记、busy 保持）→ 其 send 再挂起。
  const release2 = h.hangNext("A");
  h.streams.A.push({ kind: "settled", summary: "第一轮结束" });
  await tick(150);
  assert.equal(h.latest("A")?.busy, true, "第二条已开跑（认领已发生、send 未结）");
  const wd = h.mgr.withdraw("A", msg2Id);
  assert.equal(wd.ok, false, "认领已发生（进行中）⇒ 撤回无效");
  assert.match(wd.error ?? "", /进行中/, "如实说明（正在被执行）");

  // 放行两笔（先第一笔、再第二笔）：顺序与内容不损（撤回无效 ≠ 丢弃）。
  release1();
  release2();
  await p1;
  await tick(80);
  assert.deepEqual(h.sent.A, ["在跑（挂起）", "排队消息"], "两笔按序送达（链路收窄后语义逐字保真）");
  await h.mgr.stop(null);
});

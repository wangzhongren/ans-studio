// test/桌面应用/session-rebuild-race.test.ts
// 2026-10-13 真机状态机缺陷（busy 轮中翻假 / 孤儿轮次）——**并发作废重建的 TOCTOU 竞态**的修复证据。
//
// 机制（真机 + 代码确证）：su 一轮结束 → ① 编排在事件流产出 settled 前先**自动重 pin**（改盘上治理文件）；
// ② Interface 在 settled 时触发 `refreshStaleBoundaries()`；③ 用户紧接着的下一次 `send()` 也会先查边界——
// 两条路径**同时**判出「陈旧」并在各自的 `await`（读盘）窗口后 dispose+重开。旧实现 `disposeEntry` 按
// key 删、`rebuildIfBoundaryStale` 在 await 后不重验身份：晚到的一方会把**对方刚重建的新会话**（可能
// 已开跑轮次）误删并推 `busy=false` —— 真机表现＝「轮次还在跑、忙态却翻假、停止钮消失」。
//
// 修复 = 身份守卫（disposeEntry 只删「仍在表中的同一引用」；rebuild 每个 await 后重验同一引用且未开跑）。
// 本组用例钉住并发下的不变量：**恰一次作废、恰一次重建、条目保活、轮次不被误删、仍可续发**。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

interface SentRec {
  role: string;
  text: string;
}

function makeHandle(roleId: string, opened: string[], disposed: string[], sent: SentRec[]): RoleSessionHandle {
  let stopped = false;
  let i = 0;
  const noEvents: OrchestrationEvent[] = [];
  return {
    async send(text: string): Promise<void> {
      sent.push({ role: roleId, text });
    },
    events(): AsyncIterable<OrchestrationEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              for (let tries = 0; tries < 100; tries += 1) {
                if (stopped) return { value: undefined as unknown as OrchestrationEvent, done: true };
                if (i < noEvents.length) return { value: noEvents[i++], done: false };
                await tick(5);
              }
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {
      if (!stopped) disposed.push(roleId);
      stopped = true;
    },
  };
}

/** 临时项目：A 角色带**真实可写**边界文件（改动它即制造「陈旧」）。 */
function makeProject(): { root: string; listing: ProjectListing } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-race-"));
  fs.mkdirSync(path.join(root, "角色卡", "A"), { recursive: true });
  fs.writeFileSync(path.join(root, "角色卡", "A", "boundary.yaml"), "v: 1\n");
  fs.writeFileSync(path.join(root, "角色卡", "A", "role-card.md"), "# A\n");
  const listing: ProjectListing = {
    projectRoot: root,
    roles: [
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "A",
        boundary: {
          entries: [{ root: "project", path: "src/A.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/A/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: null,
  } as unknown as ProjectListing;
  return { root, listing };
}

interface Harness {
  mgr: SessionManager;
  opened: string[];
  disposed: string[];
  sent: SentRec[];
  busyStates: boolean[];
  lastBusy: () => boolean | undefined;
}

function makeHarness(root: string, listing: ProjectListing): Harness {
  const opened: string[] = [];
  const disposed: string[] = [];
  const sent: SentRec[] = [];
  const busyStates: boolean[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input: { roleId: string }) => {
      opened.push(input.roleId);
      return makeHandle(input.roleId, opened, disposed, sent);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (r: string) => (r === root ? listing : undefined),
    emitEvent: () => {},
    emitRoleState: (info: { roleId: string; busy: boolean }) => {
      if (info.roleId === "A") busyStates.push(info.busy);
    },
  });
  return {
    mgr,
    opened,
    disposed,
    sent,
    busyStates,
    lastBusy: () => (busyStates.length > 0 ? busyStates[busyStates.length - 1] : undefined),
  };
}

test("并发作废重建（settle 触发的 refreshStaleBoundaries × 用户 send）——身份守卫下：恰一次作废/重建、条目保活、轮次不被误删", async () => {
  const { root, listing } = makeProject();
  const h = makeHarness(root, listing);
  const opened = await h.mgr.open({ projectRoot: root, roleId: "A", runtime: "demo" });
  assert.equal(opened.ok, true);
  await tick(30);
  assert.equal(h.opened.length, 1);

  // 制造「陈旧」：改盘上边界文件（真机等价物＝su 轮末自动重 pin 改写治理文件）。
  fs.writeFileSync(path.join(root, "角色卡", "A", "boundary.yaml"), "v: 2\n");

  // 并发触发两条作废重建路径（都不 await 直达完成——让它们在各自读盘 await 处真实交错）。
  const pRefresh = h.mgr.refreshStaleBoundaries();
  const pSend = h.mgr.send("第一轮");
  await Promise.all([pRefresh, pSend]);
  await tick(60);

  // 不变量（身份守卫）：
  assert.equal(h.disposed.length, 1, "恰一次作废（晚到的一方不得再删新条目）");
  assert.equal(h.opened.length, 2, "恰一次重建（新会话恰开一次）");
  assert.deepEqual(h.mgr.liveRoleIds(), ["A"], "条目保活——新会话不得被并发路径误删（真机孤儿轮次的成因）");
  assert.equal(h.lastBusy(), true, "轮次在跑 ⇒ 最近一次真实快照 busy=true（不得有误推的 false 覆盖）");
  assert.ok(
    h.sent.some((s) => s.text === "第一轮"),
    "消息实际送达（落在重建后的会话上——续发语义保持）"
  );
  assert.ok(h.busyStates.includes(false) && h.lastBusy() === true, "历史里可有重建瞬间的 false，但**末尾真实态**必须回到在跑 true");
  await h.mgr.stop(null);
  fs.rmSync(root, { recursive: true, force: true });
});

test("在跑轮次不被作废重建打断：busy 期间 refreshStaleBoundaries/send 的陈旧检查都跳过（不误删、不误复位）", async () => {
  const { root, listing } = makeProject();
  const h = makeHarness(root, listing);
  await h.mgr.open({ projectRoot: root, roleId: "A", runtime: "demo" });
  await tick(30);

  await h.mgr.send("在跑"); // busy=true（无 settled 事件 ⇒ 保持忙，模拟长轮次在飞）
  assert.equal(h.lastBusy(), true, "开跑即外推 busy=true（P0-2 前置修正）");
  const disposedBefore = h.disposed.length;

  // 制造陈旧再触发两条路径：busy ⇒ refresh 跳过、send 入队（绝不作废、绝不当场重建）。
  fs.writeFileSync(path.join(root, "角色卡", "A", "boundary.yaml"), "v: 3\n");
  await h.mgr.refreshStaleBoundaries();
  const queued = await h.mgr.send("忙时第二条");
  await tick(60);

  assert.equal(h.disposed.length, disposedBefore, "在跑轮次不被作废（busy 跳过——新老口径一致且被钉住）");
  assert.equal(h.opened.length, 1, "不得中断重建（会话仍是最初这一个）");
  assert.equal(queued.queued, true, "忙时消息照常入队（L-1 语义不回退）");
  assert.equal(h.lastBusy(), true, "忙态不得被误复位（停止钮/徽标全程可见的前提）");
  assert.deepEqual(h.mgr.liveRoleIds(), ["A"], "条目恒在保活表");
  await h.mgr.stop(null);
  fs.rmSync(root, { recursive: true, force: true });
});

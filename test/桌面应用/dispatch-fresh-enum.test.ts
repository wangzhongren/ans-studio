// test/桌面应用/dispatch-fresh-enum.test.ts
// 首轮寻址修复（2026-10-13 真机 bootstrap J-1 缺陷）：
// 全新空项目 bootstrap 首轮——su 建好角色后**同一轮内** dispatch_task，旧实现查**导入时枚举的缓存**
// （那时角色卡还不存在）⇒ 如实回「角色 X 不在本项目（未枚举到）」——J-1「落盘后自动开工」首轮必失败。
// 修复：`routeDispatch` 缓存 miss 时经注入的 `refreshListing` **实时重枚举一次**（与界面 listProject 同一
// 路径、刷同一份共享缓存——后续 openInternal 自动开会话读的也是它）再路由。
//
// 本组两层钉住：
//   ① 会话管理器层：miss ⇒ 重枚举一次 ⇒ 受理 + 入队 + drain 自动开启目标角色并投递；仍无 ⇒ 如实拒绝
//      （**不重试风暴**：恰一次重枚举）；重枚举抛错 ⇒ 按原口径拒绝，不上抛。
//   ② Interface 集成层：真实 createDesktopInterface 接线（refreshListing 注到共享缓存）——导入时空项目、
//      此后角色落盘，派发照样寻址（e2e harness 之外的最短真实链路）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SessionManager } from "../../app/desktop/session.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
// G-1/A2（2026-10-16）：派发文案 = 编排单一来源（本地模板已收口删除）——断言按单一来源原文。
import { renderDispatchPrompt } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchTaskPayload, DispatchReceipt } from "../../src/provider/pi/session.ts";

/** 捕获的 su 会话入参（含注入的 dispatch_task 能力）——经 getter 读（闭包赋值 TS 看不见，显式收窄）。 */
interface SuInputCapture {
  dispatchTask?: (d: DispatchTaskPayload) => Promise<DispatchReceipt | null | undefined | void>;
}
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const mkRole = (roleId: string, builtIn = false): ProjectListing["roles"][number] => ({
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

/** 空项目（只有 su）→「角色落盘后」的清单（含 开发）。 */
const EMPTY_LISTING: ProjectListing = { projectRoot: "/proj", roles: [mkRole("su", true)], warnings: [], hasRoles: false, primaryRoleId: "su" };
const GROWN_LISTING: ProjectListing = { projectRoot: "/proj", roles: [mkRole("su", true), mkRole("开发")], warnings: [], hasRoles: true, primaryRoleId: "su" };

function quietHandle(roleId: string, sent: Record<string, string[]>): RoleSessionHandle {
  let stopped = false;
  let i = 0;
  sent[roleId] = sent[roleId] ?? [];
  return {
    async send(text: string): Promise<void> {
      sent[roleId].push(text);
    },
    events(): AsyncIterable<OrchestrationEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              for (let tries = 0; tries < 20000; tries += 1) {
                if (stopped) return { value: undefined as unknown as OrchestrationEvent, done: true };
                await tick(5);
              }
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {
      stopped = true;
    },
  };
}

test("首轮寻址①（管理器）：缓存 miss ⇒ 实时重枚举一次 ⇒ 受理 + drain 自动开启新角色并投递；仍无/重枚举抛错都如实", async () => {
  let current = EMPTY_LISTING; // 导入时点：只有 su（角色卡还没落盘）
  let refreshCalls = 0;
  const sent: Record<string, string[]> = {};
  const opened: string[] = [];
  let suInput: SuInputCapture | null = null;
  const getSuInput = (): SuInputCapture => {
    assert.ok(suInput, "su 会话入参应已被捕获");
    return suInput;
  };
  const mgr = new SessionManager({
    openRoleSession: async (input: { roleId: string }) => {
      opened.push(input.roleId);
      if (input.roleId === "su") suInput = input as unknown as SuInputCapture;
      return quietHandle(input.roleId, sent);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: () => current,
    // 实时重枚举：与界面 listProject 同一路径的等价物（读盘后角色就位）。
    refreshListing: async () => {
      refreshCalls += 1;
      current = GROWN_LISTING;
    },
    emitEvent: () => {},
  } as never);

  const r = await mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  assert.equal(r.ok, true);
  assert.ok(typeof getSuInput().dispatchTask === "function", "su 会话应注入 dispatch_task 能力");

  // 同一轮内派发给刚落盘的「开发」：旧实现会回「不在本项目（未枚举到）」。
  const receipt = await getSuInput().dispatchTask!({ roleId: "开发", task: "开工" });
  assert.equal(receipt && receipt.ok, true, "缓存 miss ⇒ 重枚举后受理（首轮寻址修复核心）");
  assert.equal(refreshCalls, 1, "恰重枚举一次");
  assert.match(receipt!.message ?? "", /已受理/, "如实回执（受理≠已完成）");
  await tick(240);
  assert.ok(opened.includes("开发"), "drain 自动开启目标角色（openInternal 读到的是刷新后的共享缓存）");
  assert.ok(
    (sent["开发"] ?? []).some((t) => t === renderDispatchPrompt({ roleId: "开发", task: "开工" })),
    "派发文本实际投递到「开发」的会话（编排单一来源原文——G-1/A2 后本层不内嵌模板）"
  );

  // 派发给**确实不存在**的角色：重枚举一次后仍无 ⇒ 如实拒绝（不重试风暴）。
  const before = refreshCalls;
  const receipt2 = await getSuInput().dispatchTask!({ roleId: "不存在", task: "开工" });
  assert.equal(receipt2 && receipt2.ok, false);
  assert.match(receipt2!.message ?? "", /不在本项目/, "如实回执（未枚举到）");
  assert.equal(refreshCalls, before + 1, "仍无 ⇒ 也就重枚举这一次（绝不循环重试）");

  // 重枚举抛错（读盘竞态）：按原 miss 口径如实拒绝，不上抛。
  current = EMPTY_LISTING;
  const mgrDepsRefresh = { calls: 0 };
  const mgr2 = new SessionManager({
    openRoleSession: async (input: { roleId: string }) => {
      if (input.roleId === "su") suInput = input as unknown as SuInputCapture;
      return quietHandle(input.roleId, sent);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: () => EMPTY_LISTING,
    refreshListing: async () => {
      mgrDepsRefresh.calls += 1;
      throw new Error("读盘失败（演示）");
    },
    emitEvent: () => {},
  } as never);
  await mgr2.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  const receipt3 = await getSuInput().dispatchTask!({ roleId: "开发", task: "开工" });
  assert.equal(receipt3 && receipt3.ok, false, "重枚举抛错 ⇒ 如实拒绝");
  assert.equal(mgrDepsRefresh.calls, 1);
  await mgr.stop(null);
  await mgr2.stop(null);
});

test("首轮寻址②（Interface 集成）：真实接线——导入时空项目、角色随后落盘，同一轮派发照样寻址（刷同一份共享缓存）", async () => {
  let enumCount = 0;
  const sent: Record<string, string[]> = {};
  const opened: string[] = [];
  let suInput: SuInputCapture | null = null;
  const getSuInput = (): SuInputCapture => {
    assert.ok(suInput, "su 会话入参应已被捕获");
    return suInput;
  };
  const desktop = createDesktopInterface({
    // 首次枚举（导入时点）：空项目；此后（重枚举）：含「开发」。
    listProjectFn: async () => {
      enumCount += 1;
      return enumCount === 1 ? EMPTY_LISTING : GROWN_LISTING;
    },
    openRoleSessionFn: async (input: { roleId: string }) => {
      opened.push(input.roleId);
      if (input.roleId === "su") suInput = input as unknown as SuInputCapture;
      return quietHandle(input.roleId, sent);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    emitEvent: () => {},
  } as never);

  const listed = await desktop.listProject({ projectRoot: "/proj" });
  assert.equal(listed.hasRoles, false, "导入时点：空项目（只有 su）");
  const openedSu = await desktop.openSession({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  assert.equal(openedSu.ok, true);
  assert.ok(typeof getSuInput().dispatchTask === "function");

  const receipt = await getSuInput().dispatchTask!({ roleId: "开发", task: "按 J-1 自动开工" });
  assert.equal(receipt && receipt.ok, true, "Interface 真实接线：miss ⇒ 重枚举（同一 listProjectFn）⇒ 受理");
  await tick(240);
  assert.ok(opened.includes("开发"), "目标角色被自动开启并投递（openInternal 读的是刷新后的同一份缓存）");
  assert.ok((sent["开发"] ?? []).some((t) => t.includes("按 J-1 自动开工")), "派发文本实际到达");

  // 接线钉：Interface 把 refreshListing 注到共享缓存（同一 listProjectFn —— 单一来源）。
  const IFACE = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "interface.ts"), "utf8");
  assert.ok(IFACE.includes("refreshListing: async (root: string)") && IFACE.includes("listingCache.set(fresh.projectRoot, fresh);"), "Interface 给出 refreshListing（刷同一份缓存）");
  const SESS = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "session.ts"), "utf8");
  assert.ok(SESS.includes("await this.deps.refreshListing(projectRoot);"), "routeDispatch 在 miss 时调用一次重枚举");
  assert.ok(SESS.includes("首轮寻址修复"), "机制写明（bootstrap J-1 首轮）");
  await desktop.stopSession({ roleId: null });
});

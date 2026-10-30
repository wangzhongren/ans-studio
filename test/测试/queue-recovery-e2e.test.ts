// test/测试/queue-recovery-e2e.test.ts
// P0（2026-10-30 团队计划 §4.2 / 附录 B）：**重启续跑/队列恢复端到端**——
// 现场「重启后队列未排空」：崩溃前入队的回交必须持久化；新 SessionManager 启动
// `restorePersistedDeliveries()` 后自动恢复并按既有投递机投递一次（不重复、不丢失）。
// 真实路径：两个真实 SessionManager 实例 + 同一临时 delivery-queue.json + 可脚本化假句柄；
// 诊断经真实 createDiagnosticLogger（临时目录）核对。目标项目零写入（只写系统临时目录）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
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
  taskId: "P0-R1",
  status: "completed",
  summary: "改完了 role-card（重启续投）",
  evidence: ["角色卡/A/role-card.md"],
  at: "2026-10-30T13:00:00.000Z",
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

interface Instance {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  disposeHandles: () => void;
}

function makeInstance(options: { storePath: string; gateFirstSend?: boolean }): Instance {
  const l = listing();
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const sent: Record<string, string[]> = { su: [], A: [] };
  const attempts: Record<string, number> = { su: 0, A: 0 };
  const stopped: Record<string, boolean> = { su: false, A: false };
  let gate: Promise<void> | undefined;
  if (options.gateFirstSend === true) {
    gate = new Promise<void>(() => {
      /* 永不 resolve：模拟进程在 send 挂起时崩溃（后面由 dispose 收口） */
    });
  }
  const makeHandle = (roleId: string): RoleSessionHandle => ({
    runtime: "demo",
    roleId,
    async send(_text: string, opts?: RoleSessionSendOptions): Promise<void> {
      attempts[roleId] += 1;
      if (attempts[roleId] === 1 && gate !== undefined) await gate;
      opts?.onTurnStarted?.({ turnId: `turn-${roleId}-${attempts[roleId]}`, roleId, runtime: "demo" });
      sent[roleId].push(_text);
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
    deliveryQueueStorePath: options.storePath,
  });
  return {
    mgr,
    streams,
    sent,
    disposeHandles: () => {
      stopped.su = true;
      stopped.A = true;
    },
  };
}

interface PersistedDoc {
  version: number;
  items: { state: "queued" | "in-flight"; item: { kind: string; text: string; dedupKey: string; targetRoleId: string } }[];
}

async function readStore(storePath: string): Promise<PersistedDoc> {
  const text = await fs.readFile(storePath, "utf8");
  return JSON.parse(text) as PersistedDoc;
}

test("P0 队列恢复端到端：忙时入队的回交持久化 → 新实例 restore 后自动续投一次（重启不排空不复现）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-queue-recovery-"));
  const storePath = path.join(root, "delivery-queue.json");
  const diagDir = path.join(root, "diagnostics");
  configureDiagnostics({ directory: diagDir });
  const first = makeInstance({ storePath, gateFirstSend: true });
  const second = makeInstance({ storePath });
  try {
    // —— 实例 1：su 正忙（send 挂起），回交入队并持久化（现场崩溃前形状）。
    // 生产启动会先调用 restore（无历史文件 ⇒ 武装持久化）；测试同路径，不自造第二套开关。
    await first.mgr.restorePersistedDeliveries();
    await first.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await first.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
    await tick(30);
    const pending = first.mgr.send("占住 su 的长回合", undefined, { projectRoot: "/proj", roleId: "su", runtime: "demo" });
    void pending.catch(() => undefined);
    await tick(120);
    first.streams.A.push({ kind: "handback", summary: "回交 su", handback: HANDBACK_A });
    // 等回交真正落盘（queued 一条，handback）。
    await until(() => {
      try {
        const doc = JSON.parse(readFileSync(storePath, "utf8")) as PersistedDoc;
        return doc.items.some((entry) => entry.state === "queued" && entry.item.kind === "handback");
      } catch {
        return false;
      }
    }, "回交未持久化");
    const before = await readStore(storePath);
    const queued = before.items.filter((entry) => entry.state === "queued" && entry.item.kind === "handback");
    assert.equal(queued.length, 1, "崩溃前恰一条 queued 回交落盘");
    assert.equal(queued[0].item.targetRoleId, "su");
    assert.ok(queued[0].item.text.includes("回交"), "恢复条目文本自足");

    // —— 实例 2：模拟重启（新 SessionManager，同一 store）；restore 自动续投（无需人工触发）。
    const report = await second.mgr.restorePersistedDeliveries();
    assert.equal(report.restored, 1, "重启恢复 1 条");
    assert.equal(report.skipped, 0);
    await until(() => second.sent.su.length === 1, "重启后队列未自动续投（现场「重启后队列未排空」）");
    assert.equal(second.sent.su[0], queued[0].item.text, "续投文本与持久条目逐字一致（不重渲染）");
    second.streams.su.push({ kind: "settled", summary: "续投轮完成", turnId: "turn-su-1", roleId: "su", runtime: "demo" });
    await tick(80);
    await until(() => second.mgr.watchdogSnapshot("/proj")?.activeDeliveries === 0, "续投轮未收尾");

    // 投递完成 ⇒ 持久队列清空；恢复诊断可对账。
    await until(() => {
      try {
        const doc = JSON.parse(readFileSync(storePath, "utf8")) as PersistedDoc;
        return doc.items.length === 0;
      } catch {
        return false;
      }
    }, "续投完成后持久队列未清空");
    await flushDiagnostics();
    const files = await fs.readdir(diagDir);
    const text = (await Promise.all(files.map((file) => fs.readFile(path.join(diagDir, file), "utf8")))).join("");
    assert.ok(text.includes("delivery.queue.restored"), "恢复诊断 delivery.queue.restored 应存在");
    assert.ok(text.includes("delivery.end"), "续投成功应记 delivery.end");
    assert.equal(second.sent.su.length, 1, "同一回交只投递一次（不重复）");
  } finally {
    first.disposeHandles();
    second.disposeHandles();
    await first.mgr.stop(null).catch(() => undefined);
    await second.mgr.stop(null).catch(() => undefined);
    await disposeDiagnostics();
    await tick(120); // 等持久化链收尾（Windows 下先删目录会撞 ENOTEMPTY）
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

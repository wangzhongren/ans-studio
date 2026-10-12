// test/桌面应用/hot-path.test.ts
// Q-1（2026-10-12 客户「很多操作会阻碍主线程」）：热路径合并推送 + 量化护栏 + O-1 哈希缓存。
//
// 覆盖：
//  ① `push-batcher`（纯逻辑，主进程用）：事件窗口合并（N 推 → 1 次 send）、角色状态去抖（同角色只推最新）；
//  ② **确定性事件风暴**（假适配器 300 事件）经真实 SessionManager：外推次数/耗时（护栏断言，阈值保守）；
//  ③ O-1 边界快照的 **mtime+size 缓存**：未变文件不重复读哈希（200 次检查的耗时护栏 + 源钉）；
//  ④ Markdown 解析成本的护栏（Q-2 的惰性化把「每事件解析」变成「挂载窗口内 + 一轮一次批量」）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { createEventBatcher, createRoleStateDebouncer } from "../../app/desktop/push-batcher.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SESSION_SRC = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "session.ts"), "utf8");
const RENDERER = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "renderer", "renderer.js"), "utf8");
const MAIN_SRC = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "main.ts"), "utf8");
const PRELOAD = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "preload.cjs"), "utf8");

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const STUB_LOADER = async (opts: { fallback: import("../../src/model/role.ts").ProjectConfig }) => ({
  project: opts.fallback,
  source: {
    kind: "builtin-fallback" as const,
    path: "",
    acceptance: opts.fallback.governanceBoundary!.acceptance,
    pinPaths: [],
  },
});

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-hot-"));
  fs.mkdirSync(path.join(dir, "角色卡", "A"), { recursive: true });
  fs.writeFileSync(path.join(dir, "角色卡", "A", "boundary.yaml"), "entries: []\n", "utf8");
  return dir;
}

function listing(dir: string): ProjectListing {
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
  return { projectRoot: dir, roles: [mk("su", true), mk("A")], warnings: [], hasRoles: true, primaryRoleId: "su" };
}

// ————————————————— ① push-batcher：窗口合并 / 去抖（纯逻辑） —————————————————

test("Q-1 push-batcher：事件窗口合并（N 推 → 1 次 send、顺序不变）；flush/dispose 语义；角色状态去抖只留最新", async () => {
  // 事件批量：300 推 → 一次 send（16ms 窗内）。
  const batches: number[][] = [];
  const b = createEventBatcher<number>({ windowMs: 30, send: (batch) => batches.push(batch) });
  for (let i = 0; i < 300; i += 1) b.push(i);
  assert.equal(batches.length, 0, "窗口内不立即发送");
  assert.equal(b.pendingCount(), 300);
  await tick(60);
  assert.equal(batches.length, 1, "300 推合并为**一次** send（原为 300 次 IPC）");
  assert.equal(batches[0].length, 300);
  assert.deepEqual(batches[0].slice(0, 3), [0, 1, 2], "批内顺序不变");
  // flush 立即送出；dispose 丢弃。
  const b2 = createEventBatcher<number>({ windowMs: 1000, send: (x) => batches.push(x) });
  b2.push(1);
  b2.push(2);
  b2.flush();
  assert.deepEqual(batches[batches.length - 1], [1, 2], "flush 立即送出挂起批次");
  b2.push(3);
  b2.dispose();
  await tick(10);
  assert.equal(batches[batches.length - 1].length, 2, "dispose 之后不再发送（关窗语义）");

  // 角色状态去抖：同角色 50 推 → 只 send 最新一份；不同角色各自一份。
  const states: { roleId: string; n: number }[] = [];
  const d = createRoleStateDebouncer<{ roleId: string; n: number }>({ windowMs: 30, send: (s) => states.push(s) });
  for (let i = 0; i < 50; i += 1) d.push({ roleId: "A", n: i });
  d.push({ roleId: "su", n: 1 });
  await tick(60);
  assert.equal(states.length, 2, "去抖后：A 只推最后一次 + su 一次");
  assert.deepEqual(
    states.find((s) => s.roleId === "A"),
    { roleId: "A", n: 49 },
    "同角色只保留**最新**快照（快照语义）"
  );
  // 源钉：main.ts 接线（事件 16ms 批量 + 角色状态 100ms 去抖）；preload 双通道订阅。
  assert.ok(MAIN_SRC.includes("createEventBatcher<SessionEventEnvelope>"), "main 应用事件批量器");
  assert.ok(MAIN_SRC.includes('win.webContents.send("session:events", batch)'), "事件按批推送（session:events 数组）");
  assert.ok(MAIN_SRC.includes("createRoleStateDebouncer<"), "main 应用角色状态去抖器");
  assert.ok(MAIN_SRC.includes("eventBatcher.dispose();") && MAIN_SRC.includes("roleStateDebouncer.dispose();"), "关窗清挂起计时器");
  assert.ok(PRELOAD.includes('"session:events"') && PRELOAD.includes('"session:event"'), "preload 双通道（批量 + 单发兼容探针）");
  assert.ok(RENDERER.includes("Array.isArray(envOrBatch)"), "渲染侧同解单发/批量");
});

// ————————————————— ② 确定性事件风暴：300 事件经真实 SessionManager —————————————————

test("Q-1 事件风暴（300 事件，假适配器）：管理器侧处理耗时护栏 + 事件仍逐条外推（批量在 main 层）", async () => {
  const dir = makeProject();
  const l = listing(dir);
  const envelopes: { roleId: string; event: OrchestrationEvent }[] = [];
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const stopped: Record<string, boolean> = {};
  const STORM = 300;
  for (let i = 0; i < STORM; i += 1) {
    streams.A.push({ kind: "tool_call", summary: "read_file：docs/f" + i + ".md" });
  }
  const makeHandle = (roleId: string): RoleSessionHandle => {
    let idx = 0;
    return {
      async send(): Promise<void> {},
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 400; tries += 1) {
                  if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] || [];
                  if (idx < arr.length) return { value: arr[idx++], done: false };
                  await new Promise((r) => setTimeout(r, 5));
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
    openRoleSession: async (input) => makeHandle(input.roleId),
    createPiAdapterFactory: () => {
      throw new Error("no pi");
    },
    createDemoAdapter: () => {
      throw new Error("no demo");
    },
    buildProjectConfig,
    getListing: (root) => (root === l.projectRoot ? l : undefined),
    emitEvent: (env) => envelopes.push(env),
    loadEffectiveConfig: STUB_LOADER,
  });
  await mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  const t0 = performance.now();
  // 等消费循环把 300 个事件全部外推（宽松上限 5s——护栏只防「数量级退化」，不卡毫秒级抖动）。
  const deadline = Date.now() + 5000;
  while (envelopes.filter((e) => e.event.kind === "tool_call").length < STORM && Date.now() < deadline) {
    await tick(20);
  }
  const elapsed = performance.now() - t0;
  const got = envelopes.filter((e) => e.event.kind === "tool_call").length;
  assert.equal(got, STORM, "300 事件全部外推（管理器**逐条**外推；合帧在 main 层——见 ①）");
  assert.ok(elapsed < 3000, "风暴处理耗时护栏：300 事件 < 3000ms（宽松阈值；修后实测远低于此）");
  await mgr.stop(null);
});

// ————————————————— ③ O-1 哈希缓存：未变文件不重复读哈希 —————————————————

test("Q-1 O-1 哈希缓存：未变文件只 stat（mtime+size 命中）；内容真变仍被检出——判据不回退", async () => {
  const dir = makeProject();
  const l = listing(dir);
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [] };
  const stopped: Record<string, boolean> = {};
  const makeHandle = (roleId: string): RoleSessionHandle => ({
    async send(): Promise<void> {},
    events(): AsyncIterable<OrchestrationEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              for (let tries = 0; tries < 100; tries += 1) {
                if (stopped[roleId]) return { value: undefined as unknown as OrchestrationEvent, done: true };
                const arr = streams[roleId] || [];
                if (arr.length > 0) return { value: arr.shift() as OrchestrationEvent, done: false };
                await new Promise((r) => setTimeout(r, 5));
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
  });
  const envelopes: { roleId: string; event: OrchestrationEvent }[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => makeHandle(input.roleId),
    createPiAdapterFactory: () => {
      throw new Error("no pi");
    },
    createDemoAdapter: () => {
      throw new Error("no demo");
    },
    buildProjectConfig,
    getListing: (root) => (root === l.projectRoot ? l : undefined),
    emitEvent: (env) => envelopes.push(env),
    loadEffectiveConfig: STUB_LOADER,
  });
  await mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  // 200 次「未变」的全量扫描（每次 3 角色面板 × 检查点同型）——缓存下只 stat，应远低于无缓存的重读重哈希。
  const t0 = performance.now();
  for (let i = 0; i < 200; i += 1) {
    await mgr.refreshStaleBoundaries();
  }
  const elapsed = performance.now() - t0;
  assert.equal(
    envelopes.filter((e) => /边界已更新/.test(String(e.event.summary || ""))).length,
    0,
    "未变不误重建（缓存不得把判据弄糊）"
  );
  assert.ok(elapsed < 2500, "哈希缓存护栏：200 次未变扫描 < 2500ms（无缓存时=200×重读重哈希，会显著更慢；阈值保守）");
  // 内容真变（即便同尺寸）⇒ mtime 变 ⇒ 仍被检出（correctness 不回退）。
  fs.writeFileSync(path.join(dir, "角色卡", "A", "boundary.yaml"), "entries: [ ]\n", "utf8"); // 同尺寸、不同内容
  await mgr.refreshStaleBoundaries();
  assert.ok(
    envelopes.some((e) => /边界已更新/.test(String(e.event.summary || ""))),
    "同尺寸内容变更（mtime 变）仍如实检出并重建"
  );
  // 源钉：缓存键 = mtime+size；读盘只看变化文件。
  assert.ok(SESSION_SRC.includes("hit.mtimeMs === st.mtimeMs && hit.size === st.size"), "缓存判据 = mtime+size（Q-1 派工的指定口径）");
  await mgr.stop(null);
});

// ————————————————— ④ Markdown 解析成本护栏（Q-2 惰性化的依据） —————————————————

test("Q-2 Markdown 成本护栏：典型 200 行 < 1200ms（惰性化后每轮解析次数=挂载窗口 + 一轮一次批量，而非每事件）", async () => {
  // 与 index.html 同序：先装 vendored 库（UMD 在 node ESM 下走 globalThis），再装封装。
  await import(new URL("../../app/renderer/vendor/markdown-it.umd.min.js", import.meta.url).href);
  const href = new URL("../../app/renderer/markdown.js", import.meta.url).href;
  await import(href);
  const Md = (globalThis as Record<string, unknown>).ANSMarkdown as { renderMarkdown: (t: string) => string };
  const sample = "（模型行）**加粗** 与 `code` 与 [链接](https://example.com)\n\n- 一\n- 二\n\n> 引用";
  const t0 = performance.now();
  for (let i = 0; i < 200; i += 1) Md.renderMarkdown(sample + " #" + i);
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 1200, "解析成本护栏（宽松）：200 次典型行 < 1200ms（本机实测远低于此）");
  // 源钉：惰性化的三个支点（流式纯文本 / settled 一次性升级 / 离屏 build 才解析）。
  assert.ok(RENDERER.includes("upgradeStreamingMarkdown"), "settled 一次性升级");
  assert.ok(RENDERER.includes("is-streaming"), "流式纯文本形态");
  assert.ok(/if \(rec\.mdReady\)[\s\S]{0,80}Md\.renderMarkdown\(rec\.data\)/.test(RENDERER), "离屏行挂载（build）时才解析");
  assert.ok(RENDERER.includes("state.roleBusy[roleId] === true"), "流式判定用**真实信号**（会话忙态快照）");
});

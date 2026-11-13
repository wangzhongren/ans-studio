import { RuntimeDeliveryError, type RuntimePersistenceChangeV1, type RuntimeReportSnapshotV1, type ReportSaveResultV1 } from "../../src/model/runtime.ts";
// test/桌面应用/handback-delivery.test.ts
// 桌面窗口（E-1，2026-10-12 设计；客户裁定**全自动、无开关**）：**回交自动投递 su 验收**——
// 去重（一条回交只投递一次）/ su 忙时**排队按序、不并发 send** / su 未开**自动开启**再投 /
// 开启或投递失败**如实系统行 + 保留待重试**（**绝不静默丢**）。
//
// 投递文案的**单一来源** = 编排 `renderHandbackPrompt`（本测试直接以它构造期望——证「用的是同一份」，
// 不是逐字复制）。去重键的单一来源 = 编排 `handbackKey`。

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { renderHandbackPrompt, renderHandbackBatchPrompt, renderWorkReportPrompt, type TaskHandback } from "../../src/common/编排/handback.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

/** 真实可解析的夹具项目根（CI runner 没有 `/proj`）：v2.0.0 起宿主库存登记以 native realpath 规范化
 *  项目根，不可解析即 fail-closed（`git-host-project-root-unresolvable`）⇒ 会话开不起来、回合未开跑。
 *  文件级共用一根（listing / open / watchdogDeliver/Snapshot / 持久化作用域同一根），`after` 统一清理
 *  （用例失败也清理）。 */
let PROJECT_ROOT = "";
/** 本文件创建的全部 manager / 夹具门 / 句柄：`after` 放门 → 有界 stop → 逐句柄 dispose，
 *  失败路径不遗留定时器/异步迭代器。 */
const createdManagers: SessionManager[] = [];
const createdHandles: RoleSessionHandle[] = [];
const createdGates: (() => void)[] = [];
before(async () => { PROJECT_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), "ans-handback-delivery-project-")); });
after(async () => {
  for (const release of createdGates) release();
  for (const mgr of createdManagers) {
    try { if (mgr.isOpen()) await settledWithin(mgr.stop(null), "handback-delivery 清理 stop 超时", 5_000); } catch { /* 清理不掩盖用例失败 */ }
  }
  for (const handle of createdHandles) {
    try { await settledWithin(handle.dispose(), "handback-delivery 清理 dispose 超时", 2_000); } catch { /* dispose 幂等；失败不再抛 */ }
  }
  if (PROJECT_ROOT !== "") await fs.rm(PROJECT_ROOT, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

/** 有界等待真实回执：产品回执若永不结算，用例须在有限时间内失败，而不是让 CI 文件子进程永久挂起。 */
function settledWithin<T>(promise: Promise<T>, label: string, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); });
  return Promise.race([promise, timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(predicate: () => boolean, label = "等待实际事件超时"): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await tick(5);
  }
  assert.fail(label);
}

const HANDBACK_A1: TaskHandback = {
  roleId: "A",
  taskId: "T1",
  status: "completed",
  summary: "改完了 role-card",
  evidence: ["角色卡/A/role-card.md"],
  at: "2026-10-12T02:00:00.000Z",
};
const HANDBACK_A2: TaskHandback = { ...HANDBACK_A1, taskId: "T2", at: "2026-10-12T02:05:00.000Z" };

function listingWithSuAndA(): ProjectListing {
  return {
    projectRoot: PROJECT_ROOT,
    roles: [
      {
        roleId: "su",
        cardPath: "",
        boundaryPath: "",
        cardText: "# su",
        boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
        builtIn: true,
      },
      {
        roleId: "A",
        cardPath: "角色卡/A/role-card.md",
        boundaryPath: "角色卡/A/boundary.yaml",
        cardText: "A",
        boundary: {
          entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }],
          boundarySource: "角色卡/A/boundary.yaml",
          acceptance: { accepted: false, source: "" },
        },
      },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
  };
}

/** 2026-10-24 治理协调：trio 内置五角色 + 项目角色 A（主入口=幕僚/chief）。 */
function trioHandbackListing(): ProjectListing {
  const builtIn = (roleId: string, governanceFunction: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: `# ${roleId}`,
    boundary: { entries: [], boundarySource: "<built-in:trio>", acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction,
  });
  return {
    projectRoot: PROJECT_ROOT,
    roles: [
      builtIn("chief", "chief"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      listingWithSuAndA().roles.find((role) => role.roleId === "A")!,
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  sendOptions: Record<string, RoleSessionSendOptions[]>;
  envelopes: { roleId: string; event: import("../../app/desktop/session.ts").DesktopOrchestrationEvent }[];
  openCalls: string[];
  policies: { roleId: string; policy: unknown }[];
  /** F-2-T3：su 会话拿到的派发能力（用于把某项目角色推入「投递开跑的长轮」）。 */
  dispatchOf: (roleId: string) => import("../../src/model/runtime.ts").DispatchTaskFn | undefined;
  /** F-2-T3 夹具：挂起某角色的**下一次** send，直到返回的 release 被调用（模拟异步整轮）。 */
  hangNext: (roleId: string) => () => void;
  /** 打开会话并断言夹具根真实可解析（CI runner 无 `/proj`）：open.ok===true，等待有界。 */
  openOk: (input: { projectRoot: string; roleId: string; runtime: "demo" | "pi" }) => Promise<void>;
  /** 有界关闭本 harness 的 manager（清理不掩盖用例失败）。 */
  close: () => Promise<void>;
}

/** 可脚本化假句柄：events() 从共享流拉（轮询；dispose 后立即收口）；send 记入 sent（可注入一次失败或可控挂起）。 */
function makeHarness(opts: { failSuOpenAttempts?: number; failSuSendTimes?: number; failReportSendTimes?: number; extraRoles?: string[]; customListing?: ProjectListing; customize?: (roleId: string, handle: RoleSessionHandle) => RoleSessionHandle } = {}): Harness {
  const listing = opts.customListing ?? listingWithSuAndA();
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  for (const roleId of opts.extraRoles ?? []) {
    listing.roles.push({
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
  }
  for (const role of listing.roles) {
    streams[role.roleId] ??= [];
    sent[role.roleId] ??= [];
  }
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const envelopes: { roleId: string; event: import("../../app/desktop/session.ts").DesktopOrchestrationEvent }[] = [];
  const openCalls: string[] = [];
  const openInputs: Record<string, { dispatchTask?: import("../../src/model/runtime.ts").DispatchTaskFn }> = {};
  const stopped: Record<string, boolean> = {};
  const nextGate: Record<string, Promise<void> | undefined> = {};
  const hangNext = (roleId: string): (() => void) => {
    let release!: () => void;
    nextGate[roleId] = new Promise<void>((resolve) => { release = resolve; });
    createdGates.push(() => { release(); });
    return release;
  };
  let suOpenAttempts = 0;
  let suSendFails = opts.failSuSendTimes ?? 0;
  let reportSendFails = opts.failReportSendTimes ?? 0;
  const policies: { roleId: string; policy: unknown }[] = [];

  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    const handle: RoleSessionHandle = {
      async send(text: string, options?: RoleSessionSendOptions): Promise<void> {
        (sendOptions[roleId] ??= []).push(options ?? {});
        if (roleId === "su" && text.startsWith("[回交] ") && reportSendFails > 0) {
          reportSendFails -= 1;
          throw new Error("批报告投递失败");
        }
        if (roleId === "su" && suSendFails > 0) {
          suSendFails -= 1;
          throw new Error("演示：投递通道瞬时失败");
        }
        const gate = nextGate[roleId];
        if (gate) {
          nextGate[roleId] = undefined;
          await gate; // F-2 夹具：可控挂起（release 前 promise 不 resolve —— 模拟整轮在跑）
        }
        (sent[roleId] = sent[roleId] || []).push(text);
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                // 真实句柄的事件流与**会话同寿**：只在 dispose/停止后收口。旧实现 120×5ms 静默即 done——
                // 事件稀疏的用例在慢机/CI 上会让消费循环永久退出，之后推入的 settled 再也不会被消费
                // （B8 间歇失败根因：busy 不复位 ⇒ 队列冻结）。after 统一 dispose 保证必然收口。
                while (!stopped[roleId]) {
                  const arr = streams[roleId] || [];
                  if (i < arr.length) return { value: arr[i++], done: false };
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
    createdHandles.push(handle);
    return handle;
  };

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      policies.push({ roleId: input.roleId, policy: input.routineShellPolicy });
      openCalls.push(input.roleId);
      openInputs[input.roleId] = { dispatchTask: (input as { dispatchTask?: import("../../src/model/runtime.ts").DispatchTaskFn }).dispatchTask };
      if (input.roleId === "su" && (opts.failSuOpenAttempts ?? 0) > suOpenAttempts) {
        suOpenAttempts += 1;
        throw new Error("演示：su 会话开启失败（凭据缺失）");
      }
      const handle = makeHandle(input.roleId);
      return opts.customize?.(input.roleId, handle) ?? handle;
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (root) => (root === listing.projectRoot ? listing : undefined),
    emitEvent: (env) => envelopes.push(env),
  });
  createdManagers.push(mgr);
  return { mgr, streams, sent, sendOptions, envelopes, openCalls, policies, dispatchOf: (roleId) => openInputs[roleId]?.dispatchTask, hangNext,
    openOk: async (input) => {
      const opened = await settledWithin(mgr.open(input), `打开会话超时：${input.roleId}`, 10_000);
      assert.equal(opened.ok, true, `夹具项目根须真实可解析（CI runner 无 /proj）${opened.error ? `：${opened.error}` : ""}`);
    },
    close: async () => {
      try { if (mgr.isOpen()) await settledWithin(mgr.stop(null), "handback-delivery 清理 stop 超时", 5_000); } catch { /* 清理不掩盖用例失败 */ }
    },
  };
}

test("E-1 投递：A 的回交到达 → **自动开启 su** 并把 `renderHandbackPrompt` 原文投给 su（单一来源）", async () => {
  const h = makeHarness();
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
  await tick(30);
  assert.deepEqual(h.openCalls, ["A"], "此时只开了 A");

  h.streams.A.push({ kind: "handback", summary: "回交 su：改完了 role-card", handback: HANDBACK_A1 });
  await tick(150);

  assert.ok(h.openCalls.includes("su"), "su 会话未开 ⇒ **自动开启**（su 是治理主入口，验收是其职责）");
  assert.deepEqual(h.sendOptions.su.map(o => o.handback), [{ required: false }]);
  assert.equal(h.sent.su.length, 1, "su 恰好收到一条输入");
  assert.equal(h.sent.su[0], renderHandbackPrompt(HANDBACK_A1), "投递文本 === 编排 renderHandbackPrompt 的输出（**单一来源**，非复制）");
  assert.ok(h.sent.su[0].includes("角色卡/A/role-card.md") && h.sent.su[0].includes("请验收"), "含报告字段与验收请求");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /已将 A 的交付自动投递给 su/.test(e.event.summary)),
    "投递成功应有如实系统行（进 su 的 pane）"
  );
  await h.close();
});

test("E-1 去重：同一条回交重复到达（重放）→ **只投递一次**", async () => {
  const h = makeHarness();
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
  await tick(30);
  h.streams.A.push({ kind: "handback", summary: "回交 su：改完了 role-card", handback: HANDBACK_A1 });
  h.streams.A.push({ kind: "handback", summary: "回交 su：改完了 role-card", handback: { ...HANDBACK_A1 } }); // 同一份（key 相同）
  await tick(150);
  assert.equal(h.sent.su.length, 1, "同一条回交（handbackKey 相同）**只投递一次**——重放不得重复投递");
  await h.close();
});

test("E-1 排队：su 忙时保留，settle 后连续回交按原序合成一次验收输入", async () => {
  const h = makeHarness();
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "su", runtime: "demo" });
  await tick(30);
  await settledWithin(h.mgr.send("先给 su 的活"), "send 回执等待超时"); // active=su → su busy=true
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" }); // 切到 A（su 仍忙）
  await tick(30);

  h.streams.A.push({ kind: "handback", summary: "回交1", handback: HANDBACK_A1 });
  await tick(80);
  h.streams.A.push({ kind: "handback", summary: "回交2", handback: HANDBACK_A2 });
  await tick(80);
  assert.deepEqual(h.sent.su, ["先给 su 的活"], "su 忙：两条回交都**排队**，不得并发投递");

  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(120);
  assert.deepEqual(h.sent.su.slice(1), [renderHandbackBatchPrompt([HANDBACK_A1, HANDBACK_A2])], "settle 后同一输入含两份报告且顺序保持");

  h.streams.su.push({ kind: "settled", summary: "su 又一轮结束" });
  await tick(120);
  assert.deepEqual(
    h.sent.su.slice(1),
    [renderHandbackBatchPrompt([HANDBACK_A1, HANDBACK_A2])],
    "再 settle 不重复投递原批次"
  );
  await h.close();
});

// 2026-10-20 真机（Convener 卡 1h、队列 24 条回交被 system 看护项堵住）＋ P0（2026-10-30 现场）：
// 看护**不再进入忙目标模型队列**（UI-only 旁路）——治理回交不被看护项挤占/阻塞。
test("P0（2026-10-30）看护旁路保障：su 忙时 system 不进模型队列、不挤占回交；settle 后回交直投", async () => {
  const h = makeHarness();
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "su", runtime: "demo" });
  await tick(30);
  await settledWithin(h.mgr.send("先给 su 的活"), "send 回执等待超时"); // su busy=true
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" }); // 切到 A（su 仍忙）
  await tick(30);

  // 对抗前提：看护 system 消息在 su 忙时到达——P0 语义：UI-only 旁路，**不进**模型队列。
  h.mgr.watchdogDeliver(PROJECT_ROOT, {
    text: "[系统·看护] 测试告警",
    summary: "系统·看护 · 测试",
    dedupKey: `watchdog\u0000${PROJECT_ROOT}\u0000test\u0000priority`,
    uiOnlyWhenBusy: true,
  });
  await tick(80);
  assert.equal(
    h.mgr.watchdogSnapshot(PROJECT_ROOT)?.queues.find((q) => q.targetRoleId === "su"),
    undefined,
    "忙时 system 不得进入模型队列（看护自身不被 target-busy 楔死）",
  );
  assert.ok(
    h.envelopes.some((envelope) => envelope.roleId === "su" && (envelope.event as { detail?: { source?: string } }).detail?.source === "delivery-note" && /看护/.test(envelope.event.summary ?? "")),
    "旁路消息经 UI 系统行如实可见",
  );

  h.streams.A.push({ kind: "handback", summary: "回交1", handback: HANDBACK_A1 });
  await tick(120);
  assert.deepEqual(h.sent.su, ["先给 su 的活"], "su 忙：回交排队，不并发投递");
  const q1 = h.mgr.watchdogSnapshot(PROJECT_ROOT)?.queues.find((q) => q.targetRoleId === "su");
  assert.equal(q1?.items.length, 1, "队列只有回交一条（旁路 system 不占位）");
  assert.equal(q1?.items[0]?.kind, "handback", "回交不被看护项挤占");

  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(150);
  assert.equal(h.sent.su.length, 2, "settle 后回交直投（无 system 屏障）");
  assert.equal(h.sent.su[1], renderHandbackPrompt(HANDBACK_A1), "**回交优先/直投**（治理流不被看护项堵住）");
  assert.equal(
    h.mgr.watchdogSnapshot(PROJECT_ROOT)?.queues.find((q) => q.targetRoleId === "su"),
    undefined,
    "队列清空；旁路 system 不落模型队列、不重投",
  );
  assert.ok(!h.sent.su.some((text) => text.startsWith("[系统·看护]")), "旁路 system 不得投给模型");
  await h.close();
});

test("连续回交投递失败：整批保留同序，重试送达一次，原报告键不丢", async () => {
  // B8 同步口径：产品允许「delivery.failed 后同一次 settle 级联内立即重试成功」（b8-06 探针证据）。
  // 旧夹具用 `failReportSendTimes` 注入失败后，在「失败系统行出现」与「重试成功」之间存在合法竞态
  // （失败系统行已产生时、重试可能已完成）。改为在**抛错点**定格失败瞬间的送达事实——断言内容不变
  // （失败尝试未送达任何批文本），只是把观测移到无竞态位置。
  let reportFailures = 0;
  const sentAtFailure: string[][] = [];
  const harness = makeHarness({ customize(roleId, handle) {
    if (roleId !== "su") return handle;
    return { ...handle, async send(text, options) {
      if (reportFailures < 1 && text.startsWith("[回交] ")) {
        reportFailures += 1;
        sentAtFailure.push([...harness.sent.su]);
        throw new Error("批报告投递失败");
      }
      await handle.send(text, options);
    } };
  } });
  try {
    await harness.openOk({ projectRoot: PROJECT_ROOT, roleId: "su", runtime: "demo" });
    await settledWithin(harness.mgr.send("先忙"), "send 回执等待超时");
    await harness.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
    harness.streams.A.push({ kind: "handback", summary: "one", handback: HANDBACK_A1 }, { kind: "handback", summary: "two", handback: HANDBACK_A2 });
    await waitUntil(() => harness.envelopes.filter((envelope) => envelope.event.kind === "handback").length === 2);
    harness.streams.su.push({ kind: "settled", summary: "释放" });
    await waitUntil(() => harness.envelopes.some((envelope) => envelope.event.summary.includes("批报告投递失败")));
    assert.deepEqual(sentAtFailure, [["先忙"]], "失败尝试未送达任何批文本（整批保留同序，等待重试）");
    harness.streams.A.push({ kind: "handback", summary: "duplicate", handback: { ...HANDBACK_A1 } }, { kind: "handback", summary: "duplicate", handback: { ...HANDBACK_A2 } });
    harness.streams.A.push({ kind: "settled", summary: "触发重试" });
    await waitUntil(() => harness.sent.su.length === 2);
    assert.deepEqual(harness.sent.su.slice(1), [renderHandbackBatchPrompt([HANDBACK_A1, HANDBACK_A2])]);
    harness.streams.su.push({ kind: "settled", summary: "完成" });
    await waitUntil(() => harness.envelopes.some((envelope) => envelope.event.summary === "完成"));
    assert.equal(harness.sent.su.length, 2, "同轮重放未重新入队，批次没有丢失/重复");
  } finally {
    await harness.close();
  }
});

test("客户消息屏障：A报告→客户消息→B报告，不跨消息合批或改变顺序", async () => {
  const harness = makeHarness();
  try {
    await harness.openOk({ projectRoot: PROJECT_ROOT, roleId: "su", runtime: "demo" });
    await settledWithin(harness.mgr.send("先忙"), "send 回执等待超时");
    await harness.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
    harness.streams.A.push({ kind: "handback", summary: "one", handback: HANDBACK_A1 });
    await waitUntil(() => harness.envelopes.some((envelope) => envelope.event.kind === "handback"));
    await harness.openOk({ projectRoot: PROJECT_ROOT, roleId: "su", runtime: "demo" });
    assert.equal((await settledWithin(harness.mgr.send("客户屏障"), "send 回执等待超时")).queued, true);
    harness.streams.A.push({ kind: "handback", summary: "two", handback: HANDBACK_A2 });
    await waitUntil(() => harness.envelopes.filter((envelope) => envelope.event.kind === "handback").length === 2);
    for (let round = 0; round < 3; round += 1) {
      harness.streams.su.push({ kind: "settled", summary: "放行" });
      await waitUntil(() => harness.sent.su.length === round + 2);
    }
    assert.deepEqual(harness.sent.su.slice(1), [renderHandbackPrompt(HANDBACK_A1), "客户屏障", renderHandbackPrompt(HANDBACK_A2)]);
    assert.ok(harness.sendOptions.su.every(o => o.handback?.required === false), "直发、排队客户消息与回交消费都是chat");
  } finally {
    await harness.close();
  }
});

test("常规检查宿主政策实际注入项目角色，su不接委托免确认", async () => {
  const harness = makeHarness();
  try {
    await harness.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
    await harness.openOk({ projectRoot: PROJECT_ROOT, roleId: "su", runtime: "demo" });
    assert.deepEqual(harness.policies, [
      { roleId: "A", policy: { enabled: true, projectRoot: PROJECT_ROOT, authorizationSource: "customer-delegated-routine-checks" } },
      { roleId: "su", policy: undefined },
    ]);
  } finally {
    await harness.close();
  }
});

test("E-1 开启失败：如实系统行（含原因与重试时机）+ **保留回交**；下次时机成功投递（绝不静默丢）", async () => {
  const h = makeHarness({ failSuOpenAttempts: 1 });
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
  await tick(30);

  h.streams.A.push({ kind: "handback", summary: "回交", handback: HANDBACK_A1 });
  await tick(150);
  assert.equal(h.sent.su.length, 0, "开启失败 → 未投递");
  const failureNote = h.envelopes.find((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /开启 su 会话失败/.test(e.event.summary));
  assert.ok(failureNote, "**如实系统行**（不得静默）");
  assert.ok(/未投递（已保留/.test(failureNote!.event.summary), "系统行须说明「未投递 + 已保留」与重试时机");
  assert.ok(/重试/.test(failureNote!.event.summary), "系统行须给出重试时机");

  // 下一次时机：A 一轮结束触发重试 → 这次开启成功 → 投递完成（保留的回交不丢）。
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(h.sent.su, [renderHandbackPrompt(HANDBACK_A1)], "保留的回交在下次时机成功投递");
  await h.close();
});

test("真机崩溃修复：坏形状回交事件（缺载荷/缺 roleId）→ 不投递、如实系统行、**零未捕获拒绝**", async () => {
  const rejections: unknown[] = [];
  const onRej = (r: unknown) => {
    rejections.push(r);
  };
  process.on("unhandledRejection", onRej);
  try {
    const h = makeHarness();
    await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
    await tick(30);
    // ① 缺 handback 载荷（真机崩溃形态：renderHandbackPrompt 被喂 undefined）
    h.streams.A.push({ kind: "handback", summary: "坏回交（无载荷）" } as unknown as OrchestrationEvent);
    // ② 载荷缺 roleId
    h.streams.A.push({
      kind: "handback",
      summary: "坏回交（缺 roleId）",
      handback: { taskId: "T1", status: "completed", summary: "x", evidence: [], at: "t" },
    } as unknown as OrchestrationEvent);
    await tick(150);
    await tick(100); // 再多给一轮时间：任何异步拒绝都有机会冒出来
    assert.equal(rejections.length, 0, "**不得出现未捕获拒绝**（真机崩溃钉子）");
    assert.equal(h.sent.su.length, 0, "坏形状不得投递");
    assert.ok(
      h.envelopes.some((e) => e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /形状不符/.test(e.event.summary)),
      "坏形状应如实系统行（不崩、不静默）"
    );
    await h.close();
  } finally {
    process.removeListener("unhandledRejection", onRej);
  }
});

test("E-1 投递失败：如实系统行（含原因）+ 放回队首保留；重试成功后送达（顺序与内容不损）", async () => {
  // 连续失败两次：把「开启 su」与「投递」两条链上的重试都耗尽（看清失败如实与保留），再由下一时机成功。
  const h = makeHarness({ failSuSendTimes: 2 });
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
  await tick(30);

  h.streams.A.push({ kind: "handback", summary: "回交", handback: HANDBACK_A1 });
  await tick(150);
  assert.equal(h.sent.su.length, 0, "首次投递失败 → 未送达");
  const failNote = h.envelopes.find((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /交付投递失败/.test(e.event.summary));
  assert.ok(failNote, "**如实系统行**（不得静默）");
  assert.ok(/未丢弃/.test(failNote!.event.summary) && /重试/.test(failNote!.event.summary), "系统行须说明「未丢弃/保留待重试」");

  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(h.sent.su, [renderHandbackPrompt(HANDBACK_A1)], "保留的回交重试后送达（内容为单一来源原文）");
  await h.close();
});


const safeText = (text: string) => ({ text, redacted: false, truncated: false });
function savedReport(id: string, turnId = id): RuntimeReportSnapshotV1 {
  return { version: 1, reportId: id, source: { roleId: 'A', runtime: 'demo', turnId }, taskId: null, origin: 'submitted-report', status: 'completed', summary: safeText('safe summary'), evidence: [], evidenceOmitted: 0, at: '2026-10-15T01:00:00Z' };
}
test('C Window merges source saved-before-business and retry Promise/change orders into one enqueue', async () => {
 for (const notificationFirst of [true, false]) {
  let listener: ((change: RuntimePersistenceChangeV1) => void) | undefined;
  let release!: () => void; let saves = 0;
  const report = savedReport('report-' + notificationFirst);
  const h = makeHarness({ customize(roleId, handle) { return roleId === 'A' ? { ...handle, persistenceMode: 'enabled', onPersistenceChange(callback) { listener = callback; return () => { listener = undefined; }; },
    async retryReportPersistence(): Promise<ReportSaveResultV1> { saves++; await new Promise<void>(r => { release = r; }); const state = { state: 'saved' as const, reportId: report.reportId, report, retryAvailable: false }; if (notificationFirst) listener?.({ kind: 'report-save', scope: { roleId: 'A', runtime: 'demo' }, reportId: report.reportId, state }); return { ok: true, state: 'saved', report, retryAvailable: false }; },
  } : handle; } });
  try {
   await h.openOk({ projectRoot: PROJECT_ROOT, roleId: 'A', runtime: 'demo' });
   if (notificationFirst) listener?.({ kind: 'report-save', scope: { roleId: 'A', runtime: 'demo' }, reportId: report.reportId, state: { state: 'saved', reportId: report.reportId, report, retryAvailable: false } });
   assert.equal(h.sent.su.length, 0, 'state notification alone never manufactures a business handback');
   h.streams.A.push({ kind: 'handback', summary: 'safe', handback: { ...HANDBACK_A1, turnId: report.source.turnId, summary: 'internal model-only secret' }, report, reportPersistence: { state: 'failed', reportId: report.reportId, code: 'PERSIST_FAILED', retryAvailable: true } });
   await waitUntil(() => h.envelopes.some(e => e.event.kind === 'handback'));
   if (!notificationFirst) assert.equal(h.sent.su.length, 0);
   const scope = { projectRoot: PROJECT_ROOT, roleId: 'A', runtime: 'demo' as const };
   const first = h.mgr.persistenceOperation(scope, 'retryReportSave', report.reportId);
   const second = h.mgr.persistenceOperation(scope, 'retryReportSave', report.reportId);
   await waitUntil(() => saves === 1); release(); await settledWithin(Promise.all([first, second]), "持久化操作等待超时");
   listener?.({ kind: 'report-save', scope: { roleId: 'A', runtime: 'demo' }, reportId: report.reportId, state: { state: 'saved', reportId: report.reportId, report, retryAvailable: false } });
   await waitUntil(() => h.sent.su.length === 1);
   assert.equal(saves, 1); assert.equal(h.sent.su.length, 1);
   assert.ok(h.sent.su[0].includes('internal model-only secret'), 'model text is not reverse-rendered from the safe view');
   assert.equal(JSON.stringify(h.envelopes).includes('internal model-only secret'), false, 'source IPC has no raw sidecar');
   assert.equal(h.sendOptions.su[0].inputProvenance?.reports[0].reportId, report.reportId);
   await h.close(); const old = await h.mgr.persistenceOperation(scope, 'retryReportSave', report.reportId); assert.equal(old.ok, false);
  } finally { await h.close(); }
 }
});

test('C frozen batch retries keep members and delivery ID while later reports stay separate', async () => {
 let sends = 0; const attempts: RoleSessionSendOptions[] = [];
 // B8 同步口径（无断言放宽）：① 首次认领必须看到**两份都已在投递队列**（否则首批会被拆成单条——
 //   commitHandback 的异步入队与 settle 的放行时机有合法交错，旧夹具只等 A 的 handback 信封就推 settle）；
 //   以真实队列快照（watchdogSnapshot，与 queue-visibility 同数据面）为入队完成判据。
 //   ② 失败与重试可在**同一次 settle 级联**内完成，`attempts.length === 1` 的中间态可被跳过——
 //   等待改 `>=`，随后仍断言精确条数与成员（不弱化）。
 const h = makeHarness({ customize(roleId, handle) { if (roleId !== 'su') return { ...handle, persistenceMode: 'enabled' }; return { ...handle, async send(text, options) {
   if (options?.inputProvenance) { attempts.push(options); sends++; if (sends === 1) throw new RuntimeDeliveryError('safe storage failure', { version: 1, deliveryId: options.inputProvenance.deliveryId, attemptId: options.inputProvenance.attemptId, inputSaved: false, providerMayHaveStarted: false, history: 'failed', retryHistoryAvailable: true, retryDeliveryAllowed: true }); }
   await handle.send(text, options);
 } }; } });
 try {
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: 'su', runtime: 'demo' }); await settledWithin(h.mgr.send('busy'), "send 回执等待超时");
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: 'A', runtime: 'demo' });
  const emit = (id: string) => { const report = savedReport(id); h.streams.A.push({ kind: 'handback', summary: 'safe', handback: { ...HANDBACK_A1, turnId: id }, report, reportPersistence: { state: 'saved', reportId: id, retryAvailable: false } }); };
  emit('one'); emit('two'); await waitUntil(() => h.envelopes.filter(e => e.event.kind === 'handback').length === 2);
  await waitUntil(() => (h.mgr.watchdogSnapshot(PROJECT_ROOT)?.queues.find(q => q.targetRoleId === 'su')?.items.filter(i => i.kind === 'handback').length ?? 0) === 2, "两份回交未全部入队");
  h.streams.su.push({ kind: 'settled', summary: 'release' }); await waitUntil(() => attempts.length >= 1);
  emit('three'); await waitUntil(() => attempts.length >= 2);
  assert.equal(attempts.length, 2, "首批失败 + 重试恰两次（重试不再分裂/重复）");
  assert.deepEqual(attempts[0].inputProvenance?.reports.map(r => r.reportId), ['one', 'two']);
  assert.deepEqual(attempts[1].inputProvenance?.reports.map(r => r.reportId), ['one', 'two']);
  assert.equal(attempts[0].inputProvenance?.deliveryId, attempts[1].inputProvenance?.deliveryId);
  assert.notEqual(attempts[0].inputProvenance?.attemptId, attempts[1].inputProvenance?.attemptId);
  h.streams.su.push({ kind: 'settled', summary: 'next' }); await waitUntil(() => attempts.length >= 3);
  assert.equal(attempts.length, 3, "后续报告独立成批，恰一次");
  assert.deepEqual(attempts[2].inputProvenance?.reports.map(r => r.reportId), ['three']);
 } finally { await h.close(); }
});

test('C possible provider start and unknown failure do not automatically prompt again', async () => {
 for (const receiptKnown of [true, false]) {
  let sends = 0;
  const h = makeHarness({ customize(roleId, handle) { if (roleId !== 'su') return { ...handle, persistenceMode: 'enabled' }; return { ...handle, async send(_text, options) { sends++; if (receiptKnown && options?.inputProvenance) throw new RuntimeDeliveryError('safe failure', { version: 1, deliveryId: options.inputProvenance.deliveryId, attemptId: options.inputProvenance.attemptId, inputSaved: true, providerMayHaveStarted: true, history: 'failed', retryHistoryAvailable: true, retryDeliveryAllowed: false }); throw new Error('unknown state'); } }; } });
  try { await h.openOk({ projectRoot: PROJECT_ROOT, roleId: 'A', runtime: 'demo' }); const report = savedReport('one'); h.streams.A.push({ kind: 'handback', summary: 'safe', handback: HANDBACK_A1, report, reportPersistence: { state: 'saved', reportId: 'one', retryAvailable: false } }); await waitUntil(() => sends === 1); h.streams.A.push({ kind: 'settled', summary: 'retry occasion' }); await tick(60); assert.equal(sends, 1); } finally { await h.close(); }
 }
});

test('C target history retry is one storage operation, read-only queries do not prompt, replaced handles expire', async () => {
 let sends = 0, writes = 0, queries = 0, release!: () => void;
 let receipt: import('../../src/model/runtime.ts').RuntimeDeliveryReceiptV1 | undefined;
 const h = makeHarness({ customize(roleId, handle) { if (roleId !== 'su') return { ...handle, persistenceMode: 'enabled' }; return { ...handle, persistenceMode: 'enabled',
   async send(_text, options) { sends++; const p = options!.inputProvenance!; receipt = { version: 1, deliveryId: p.deliveryId, attemptId: p.attemptId, inputSaved: true, providerMayHaveStarted: true, history: 'failed', retryHistoryAvailable: true, retryDeliveryAllowed: false }; options?.onDeliveryProgress?.({ stage: 'settled', receipt }); throw new RuntimeDeliveryError('safe', receipt); },
   async getDeliveryReceipt() { queries++; return { state: 'known', receipt: receipt! }; },
   async retryDeliveryHistoryPersistence() { writes++; await new Promise<void>(r => { release = r; }); receipt = { ...receipt!, history: 'saved', retryHistoryAvailable: false }; return { ok: true, state: 'saved', receipt }; },
 }; } });
 try {
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: 'A', runtime: 'demo' }); const report = savedReport('target-history');
  h.streams.A.push({ kind: 'handback', summary: 'safe', handback: HANDBACK_A1, report, reportPersistence: { state: 'saved', reportId: report.reportId, retryAvailable: false } });
  await waitUntil(() => !!receipt); const id = receipt!.attemptId; const scope = { projectRoot: PROJECT_ROOT, roleId: 'su', runtime: 'demo' as const };
  assert.equal((await h.mgr.persistenceOperation(scope, 'getDeliveryReceipt', id)).ok, true); assert.equal(queries, 1); assert.equal(writes, 0);
  const first = h.mgr.persistenceOperation(scope, 'retryDeliveryHistorySave', id); const second = h.mgr.persistenceOperation(scope, 'retryDeliveryHistorySave', id);
  await waitUntil(() => writes === 1); release(); await settledWithin(Promise.all([first, second]), "持久化操作等待超时"); assert.equal(sends, 1); assert.equal(writes, 1);
  await settledWithin(h.mgr.stop({ projectRoot: PROJECT_ROOT, roleId: 'su', runtime: 'demo' }), "定向 stop 等待超时");
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: 'su', runtime: 'demo' });
  const stale = await h.mgr.persistenceOperation(scope, 'retryDeliveryHistorySave', id); assert.ok(!stale.ok); if (!stale.ok) assert.equal(stale.code, 'SNAPSHOT_EXPIRED');
  assert.equal(sends, 1); assert.equal(writes, 1);
 } finally { await h.close(); }
});

test('C disabled and unknown-live source facts preserve live delivery without inventing durable report IDs',async()=>{
 for(const state of ['disabled','unknown-live'] as const){const h=makeHarness({customize(roleId,handle){return roleId==='A'?{...handle,persistenceMode:state==='disabled'?'disabled':'enabled'}:handle;}});
 try{await h.openOk({projectRoot:PROJECT_ROOT,roleId:'A',runtime:'demo'});h.streams.A.push({kind:'handback',summary:'safe live',handback:HANDBACK_A1,liveReport:{source:{roleId:'A'},taskId:null,status:'completed',summary:safeText('safe'),evidence:[],evidenceOmitted:0,at:HANDBACK_A1.at},reportPersistence:{state,retryAvailable:false}});
 await waitUntil(()=>h.sent.su.length===1);const options=h.sendOptions.su[0];assert.equal(options.inputProvenance,undefined);assert.equal(options.inputPresentation?.durability,state==='disabled'?'memory-only':'unknown-live');assert.equal(Object.hasOwn(options.inputPresentation!.reports[0],'reportId'),false);assert.equal(h.envelopes.filter(e=>e.event.kind==='handback').length,1);
 }finally{await h.close();}}
});

// ————— F-2-T3（2026-10-16 客户批准）：长轮不阻塞回交投递 —————
// 旧实现：B 的投递轮把「每项目一条」的串行链持有到**整轮**结束——期间 A settle 产生的回交投递被链压住，
// su 迟迟收不到（真机 16 分 55 秒的现场）。修复后投递开跑即释放链：su **立即**收到。

test("F-2-T3 长轮不阻塞回交：B 的投递轮挂起期间，A settle 产生的回交 ⇒ su **立即**收到（不被 B 轮持有）；放行后两笔各恰一次", async () => {
  const h = makeHarness({ extraRoles: ["B"] });
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "su", runtime: "demo" });
  await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su");
  assert.ok(typeof dispatch === "function", "su 会话应注入派发能力");
  const releaseB = h.hangNext("B");
  const receipt = (await settledWithin(Promise.resolve(dispatch!({ roleId: "B", task: "长活" })), "派发回执等待超时")) as { ok: boolean };
  assert.equal(receipt.ok, true);
  await tick(120);
  assert.ok(h.openCalls.includes("B"), "B 被自动开启");
  assert.deepEqual(h.sent.B, [], "B 的投递挂起中（整轮在跑——send promise 未结）");

  h.streams.A.push({ kind: "handback", summary: "回交 su：改完了 role-card", handback: HANDBACK_A1 });
  await tick(150);
  assert.deepEqual(
    h.sent.su,
    [renderHandbackPrompt(HANDBACK_A1)],
    "**su 立即收到回交**——不被 B 的长轮持有（旧实现：链被持有贯穿 B 整轮，回交只能干等；B 挂起期间即达是判据）"
  );

  releaseB();
  await tick(100);
  assert.equal(h.sent.B.length, 1, "放行后 B 的投递结算");
  assert.ok(String(h.sent.B[0]).includes("长活"), "B 收到的是那条派发（恰一次）");
  assert.equal(h.sent.su.length, 1, "su 无重复投递");
  await h.close();
});

test("2026-10-24 trio 回交路由：项目 worker 回交→Steward；内置来源回交→Lead；同轮 settle 不双发", async () => {
  const h = makeHarness({ customListing: trioHandbackListing() });
  try {
    await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "chief", runtime: "demo" });
    await tick(30);
    await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "convener", runtime: "demo" });
    await tick(30);
    await h.openOk({ projectRoot: PROJECT_ROOT, roleId: "A", runtime: "demo" });
    await tick(30);

    // ① 项目 worker 回交 → Steward（Convener）；Lead 不接收项目回交。
    h.streams.A.push({ kind: "handback", summary: "A 完成", handback: HANDBACK_A1 } as OrchestrationEvent);
    await waitUntil(() => h.sent.convener.includes(renderHandbackPrompt(HANDBACK_A1)));
    assert.ok(!h.sent.chief.includes(renderHandbackPrompt(HANDBACK_A1)), "项目 worker 回交不投 Lead");

    // Steward 那一轮结束（空闲），并放行 Lead。
    h.streams.convener.push({ kind: "settled", summary: "Convener 一轮结束" } as OrchestrationEvent);
    h.streams.chief.push({ kind: "settled", summary: "Lead 一轮结束" } as OrchestrationEvent);
    await tick(120);

    // ② 内置来源回交（防御性出现）→ Lead（primaryRoleId）；不自我回交。
    await settledWithin(h.mgr.send("协调", undefined, { roleId: "convener" }), "send 回执等待超时");
    const builtInHandback: TaskHandback = { ...HANDBACK_A1, roleId: "convener", taskId: "T-internal" };
    h.streams.convener.push({ kind: "handback", summary: "内置回交", handback: builtInHandback } as OrchestrationEvent);
    await waitUntil(() => h.sent.chief.includes(renderHandbackPrompt(builtInHandback)));
    assert.ok(!h.sent.convener.includes(renderHandbackPrompt(builtInHandback)), "内置来源不自我回交");
    // 放行 Lead（回交投递占用一轮），再让 convener 同一轮 settle：治理反馈与已投回交去重。
    h.streams.chief.push({ kind: "settled", summary: "Lead 一轮结束" } as OrchestrationEvent);
    await tick(120);
    const chiefSendsAfterHandback = h.sent.chief.length;
    h.streams.convener.push({ kind: "message", summary: "内置收尾正文", turnId: "c-internal" } as OrchestrationEvent);
    h.streams.convener.push({ kind: "settled", summary: "Convener 一轮结束" } as OrchestrationEvent);
    await tick(250);
    assert.equal(h.sent.chief.length, chiefSendsAfterHandback, "同一轮内置回交与 settle 反馈不双发");
    assert.ok(!h.sent.chief.some((text) => text.startsWith("[系统·治理反馈] 来自 convener")), "不重复投递内置反馈");
  } finally {
    await h.close();
  }
});

// —————————————— B 批（2026-10-28）：星形任务回交 → 幕僚（[工作结果] + task.reported） ——————————————
test("B 星形回交：tasks.jsonl 已知 taskId ⇒ 只投幕僚、[工作结果] 固定字段、写 task.reported", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-handback-star-"));
  const custom: ProjectListing = {
    projectRoot: root,
    roles: [
      { roleId: "chief", cardPath: "", boundaryPath: "", cardText: "chief", boundary: { entries: [], boundarySource: "<built-in:chief>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "chief" },
      { roleId: "convener", cardPath: "", boundaryPath: "", cardText: "convener", boundary: { entries: [], boundarySource: "<built-in:convener>", acceptance: { accepted: false, source: "" } }, builtIn: true, governanceFunction: "schedule" },
      { roleId: "A", cardPath: "角色卡/A/role-card.md", boundaryPath: "角色卡/A/boundary.yaml", cardText: "A", boundary: { entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/A/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
  const h = makeHarness({ customListing: custom });
  try {
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-star",
      from: "chief",
      to: "A",
      text: "实现星形任务",
      sideEffect: "code",
      idempotencyKey: "key-star",
    }));
    await h.mgr.listTasks(root); // 登记星形任务 id（真实恢复路径同源）
    const opened = await settledWithin(h.mgr.open({ projectRoot: root, roleId: "A", runtime: "demo" }), "打开会话超时：A", 10_000);
    assert.equal(opened.ok, true, opened.error ?? "");
    await tick(30);
    const handback: TaskHandback = {
      roleId: "A",
      taskId: "t-star",
      status: "completed",
      summary: "实现完成",
      evidence: ["src/a.ts", "test/a.test.ts"],
      at: "2026-10-28T00:00:02.000Z",
      turnId: "turn-star",
    };
    h.streams.A.push({ kind: "handback", summary: "星形回交", handback } as OrchestrationEvent);
    await waitUntil(() => h.sent.chief.includes(renderWorkReportPrompt(handback)));
    assert.equal(h.sent.convener.some((text) => text.includes("实现完成")), false, "旧 Steward 不再接收星形工作结果");
    const text = h.sent.chief.find((entry) => entry.includes("实现完成"))!;
    assert.match(text, /^\[工作结果\]/);
    assert.match(text, /任务：#t-star/);
    assert.match(text, /状态：done/);
    assert.match(text, /证据：/);
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-star")?.reports[0]?.status, "done");
    assert.equal(state.records.get("t-star")?.reports[0]?.turnId, "turn-star");
  } finally {
    await h.close();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

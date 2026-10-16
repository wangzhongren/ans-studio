// test/测试/g2-verify/fixture.ts —— G-2 独立复验（测试角色，2026-10-16）自建夹具。
//
// 纪律：**独立构造、不复用实施方断言**。本文件只读引用产品源码的公开面（SessionManager 依赖注入、
// openRoleSession 输入形状、看护观察形状），按复验需要自建可控假件（假句柄/假事件流/注入时钟）。
// 不修改任何他角色文件；本目录仅属测试角色边界（test/测试/）。
//
// 提供的夹具能力：
//   · 临时真实项目根（角色卡/X + 内置 su 经 listProject 合成）——buildProjectConfig 可读真实盘；
//   · SessionManager：stub openRoleSession（捕获**桌面实际传入的能力闭包**——proposeRecovery/
//     roleStatus/sessionTail 三字段），假句柄可推事件流、可控 abort/dispose/投递失败；
//   · 注入时钟（可 advance）：busySince/enqueuedAt/看护观察 at 全走同一时钟；
//   · 事件/角色状态/系统行/看护观察的原始收集器。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../../app/desktop/session.ts";
import type { DesktopOrchestrationEvent } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { listProject, type ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type { SessionEvent } from "../../../src/provider/pi/session.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import type { WatchdogObservation, WatchdogStats, WatchdogProjectSnapshot } from "../../../app/desktop/watchdog.ts";
import type { RecoveryConfirmPresenter } from "../../../app/desktop/recovery-channel.ts";
import type { RecoveryReceipt, WatchdogToolResult } from "../../../src/model/runtime.ts";

/** openRoleSession 的输入形状（桌面注入能力闭包的捕获类型）。 */
export type CapturedOpenInput = Parameters<
  typeof import("../../../src/pipeline/orchestration/run-role.ts").openRoleSession
>[0];

export interface G2RoleControl {
  roleId: string;
  /** 推入该角色当前句柄的事件流（按序消费）。 */
  streams: SessionEvent[];
  /** 收到 send 的正文（投递机经此可见"送达"）。 */
  sent: string[];
  /** abort() 被真实调用次数。 */
  abortCalls: number;
  /** false ⇒ 句柄**不带** abort 方法（沿既有替身先例——「运行时不支持」路径）。 */
  abortSupported: boolean;
  /** dispose 计数（重建链路核对用）。 */
  disposeCount: number;
  /** 已停止（dispose 后事件流结束）。 */
  stopped: boolean;
  /** 置 N ⇒ 接下来 N 次 send 抛错（投递失败语义）。 */
  failNextSends: number;
}

export interface G2Harness {
  root: string;
  listing: ProjectListing;
  mgr: SessionManager;
  clock: { now(): number; advance(ms: number): void };
  /** 当前（最新一代）角色控制块——重建后取到新句柄的一代。 */
  ctl(roleId: string): G2RoleControl;
  /** 桌面每次调用 openRoleSession 捕获的输入（含三能力闭包）。 */
  openedInputs: CapturedOpenInput[];
  /** 会话事件信封（如实系统行在此找）。 */
  envelopes: { roleId: string; event: DesktopOrchestrationEvent }[];
  /** 角色状态外推快照（busy/queue/running）。 */
  roleStates: { roleId: string; busy: boolean; summaries: string[]; queue: { kind: string; sourceRoleId: string; summary: string; at: string; id?: string }[]; running: { kind: string; summary: string } | null }[];
  /** 看护观察转发（原始）。 */
  observations: { projectRoot: string; observation: WatchdogObservation }[];
  cleanup(): void;
}

export interface G2HarnessOptions {
  /** recoveryConfirm 注入（W5 通道；缺省＝未接线）。 */
  recoveryConfirm?: RecoveryConfirmPresenter;
  /** 挂起确认合并视图（缺省 ⇒ 恒 0）。 */
  pendingSnapshot?: () => { total: number; byRole: Map<string, number> };
  /** 看护统计（role_status 的看护行）。 */
  watchdogStats?: (projectRoot: string) => WatchdogStats | undefined;
  /** 观察转发钩子（集成测试把 manager 的观察接进真实看护服务）。 */
  onObservation?: (projectRoot: string, observation: WatchdogObservation) => void;
}

/** 造临时真实项目：角色 X（boundary 条目 src/thing.ts）；su 由 listProject 合成（builtIn）。 */
export async function makeTempProject(): Promise<{ root: string; listing: ProjectListing }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-g2-verify-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X（G-2 复验夹具）\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 复验夹具条目\n",
  );
  const listing = await listProject(root);
  return { root: fs.realpathSync(root), listing };
}

function makeHandle(c: G2RoleControl): RoleSessionHandle {
  let i = 0;
  const handle: RoleSessionHandle = {
    runtime: "demo",
    async send(text: string): Promise<void> {
      if (c.failNextSends > 0) {
        c.failNextSends -= 1;
        throw new Error("复验夹具：投递通道瞬时失败");
      }
      c.sent.push(text);
    },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              for (let tries = 0; tries < 300; tries += 1) {
                if (c.stopped) return { value: undefined as unknown as SessionEvent, done: true };
                if (i < c.streams.length) return { value: c.streams[i++] as SessionEvent, done: false };
                await new Promise((r) => setTimeout(r, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {
      c.disposeCount += 1;
      c.stopped = true;
    },
  };
  if (c.abortSupported) {
    handle.abort = async () => {
      c.abortCalls += 1;
      return { ok: true as const, supported: true as const };
    };
  }
  return handle;
}

/** 建复验夹具（异步：需真实 listProject 枚举临时项目）。 */
export async function makeG2Harness(opts: G2HarnessOptions = {}): Promise<G2Harness> {
  const { root, listing } = await makeTempProject();
  let T = 1_700_000_000_000;
  const now = (): number => T;
  const controls = new Map<string, G2RoleControl>();
  const openedInputs: CapturedOpenInput[] = [];
  const envelopes: { roleId: string; event: DesktopOrchestrationEvent }[] = [];
  const roleStates: G2Harness["roleStates"] = [];
  const observations: { projectRoot: string; observation: WatchdogObservation }[] = [];

  const ensureControl = (roleId: string, abortSupported = true): G2RoleControl => {
    let c = controls.get(roleId);
    if (!c || c.stopped) {
      // 新的一代（首次开启 / 重建后的重开）——旧一代已 disposed。
      c = { roleId, streams: [], sent: [], abortCalls: 0, abortSupported, disposeCount: 0, stopped: false, failNextSends: 0 };
      controls.set(roleId, c);
    }
    return c;
  };
  // X 走「不带 abort」的运行时替身？——缺省带；需要 unsupported 的用例先关掉再开会话。
  ensureControl("su", true);

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openedInputs.push(input);
      return makeHandle(ensureControl(input.roleId));
    },
    createPiAdapterFactory: () => {
      throw new Error("复验夹具：本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("复验夹具：本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: (r) => (r === listing.projectRoot ? listing : undefined),
    emitEvent: (env) => envelopes.push(env),
    emitRoleState: (info) =>
      roleStates.push({
        roleId: info.roleId,
        busy: info.busy,
        summaries: [...info.summaries],
        queue: (info.queue ?? []).map((it) => ({ ...it })),
        running: info.running ? { kind: info.running.kind, summary: info.running.summary } : null,
      }),
    now,
    ...(opts.recoveryConfirm ? { recoveryConfirm: opts.recoveryConfirm } : {}),
    ...(opts.pendingSnapshot ? { watchdogPendingConfirmations: opts.pendingSnapshot } : {}),
    ...(opts.watchdogStats ? { watchdogStats: opts.watchdogStats } : {}),
    watchdogObserver: (projectRoot, observation) => {
      observations.push({ projectRoot, observation });
      opts.onObservation?.(projectRoot, observation);
    },
  });

  return {
    root: listing.projectRoot,
    listing,
    mgr,
    clock: {
      now,
      advance(ms: number): void {
        T += ms;
      },
    },
    ctl: (roleId) => ensureControl(roleId),
    openedInputs,
    envelopes,
    roleStates,
    observations,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** 等待真实时间（投递机异步链放行用）。 */
export const flush = (ms = 60): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 读类回执归一（复验夹具；契约外即抛——fail-honest 判别，与工具层同口径）。 */
export function toolResultOf(r: WatchdogToolResult | null | undefined | void): WatchdogToolResult {
  if (r === null || r === undefined || typeof r !== "object" || typeof r.ok !== "boolean") {
    throw new Error("复验夹具：能力未返回明确回执（fail-honest 判别）");
  }
  return r;
}

/** proposeRecovery 回执归一（复验夹具；契约外即抛）。 */
export function receiptOf(r: RecoveryReceipt | null | undefined | void): RecoveryReceipt {
  if (r === null || r === undefined || typeof r !== "object" || typeof r.outcome !== "string") {
    throw new Error("复验夹具：proposeRecovery 未返回明确回执");
  }
  return r;
}

/** 推一条 settled 事件（默认 completed）。 */
export function settledEvent(outcome = "completed", turnId?: string): SessionEvent {
  return { kind: "settled", summary: `轮次结束（${outcome}）`, ...(turnId !== undefined ? { turnId } : {}), detail: { outcome } };
}

/** 推一条命令超时（F-1 结构化事实）事件——classifyProcessOutcome 只认 display.process。 */
export function commandTimedOutEvent(): SessionEvent {
  return { kind: "accepted", summary: "run_shell 超时已终止", detail: { display: { version: 1, process: { timedOut: true } } } };
}

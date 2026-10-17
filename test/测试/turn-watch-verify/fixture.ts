// test/测试/turn-watch-verify/fixture.ts
// 测试角色：到点检查 + 1 小时兜底独立验证夹具（2026-10-17）。
//
// 独立构造：自建看护 rig（注入时钟/快照/投递端）、自建挂起 provider、自建 SessionManager 句柄；
// 不 import 实施方测试。不真等待 1 小时、不跑破坏性命令。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createWatchdogService,
  type WatchdogConfig,
  type WatchdogOutboundMessage,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
  type WatchdogService,
} from "../../../app/desktop/watchdog.ts";
import type { RuntimeProviderFactory } from "../../../src/model/runtime.ts";

export const PROJECT = "/proj-turn-watch-verify";
export const SU = "su";

export type Delivery = WatchdogOutboundMessage & { dedupKey: string };

export interface WatchdogRig {
  svc: WatchdogService;
  deliveries: Delivery[];
  setSnapshot(s: WatchdogProjectSnapshot): void;
  advance(ms: number): void;
  now(): number;
}

export function makeWatchdogRig(configOver: Partial<WatchdogConfig> = {}): WatchdogRig {
  const T = { v: 1_700_200_000_000 };
  let current: WatchdogProjectSnapshot = snapshot();
  const deliveries: Delivery[] = [];
  const svc = createWatchdogService({
    projects: () => [PROJECT],
    snapshot: () => current,
    deliver: (_root, message) => {
      deliveries.push(message);
    },
    now: () => T.v,
    // 隔离收束（W3）——本套件只测 #1 到点检查。
    config: { env: {}, silenceMs: 365 * 24 * 3600 * 1000, ...configOver },
  });
  return {
    svc,
    deliveries,
    setSnapshot: (s) => {
      current = s;
    },
    advance: (ms) => {
      T.v += ms;
    },
    now: () => T.v,
  };
}

export function snapshot(over: Partial<WatchdogProjectSnapshot> = {}): WatchdogProjectSnapshot {
  return {
    projectRoot: PROJECT,
    suRoleId: SU,
    roles: [],
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: 0,
    pendingConfirmationsByRole: new Map<string, number>(),
    ...over,
  };
}

export function roleView(roleId: string, over: Partial<WatchdogRoleView> = {}): WatchdogRoleView {
  return { roleId, runtime: "pi", busy: false, ...over };
}

export function busyRole(roleId: string, startedAt: number, turnId?: string): WatchdogRoleView {
  return {
    roleId,
    runtime: "pi",
    busy: true,
    turnStartedAt: startedAt,
    ...(turnId !== undefined ? { turnId } : {}),
  };
}

export function makeTempProject(): { root: string; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-turn-watch-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n", "utf8");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/X/thing.ts\n    purpose: 独立验证夹具\n",
    "utf8",
  );
  return {
    root,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* 忽略清理失败 */
      }
    },
  };
}

/**
 * 挂起 provider（服务级整轮时限验证）：`prompt` 永不自然结束，`abort` 才收尾；
 * 事件流在 dispose 前保持挂起（使 busy 保持）。
 */
export function hangingProviderFactory(): {
  factory: RuntimeProviderFactory;
  starts: { startedAt: number; aborted: boolean }[];
} {
  const starts: { startedAt: number; aborted: boolean }[] = [];
  const factory: RuntimeProviderFactory = (options) => ({
    async composeContext() {
      return { systemPrompt: "独立验证挂起 provider" };
    },
    async bindRole(role) {
      // runtime-core 的 Core-managed tool display profile：绑定时必须注册（与真实适配器同形）。
      options.registerToolDisplayProfile?.({ credentials: [] });
      let finish: (() => void) | undefined;
      let closed = false;
      let wake: (() => void) | undefined;
      const start = { startedAt: Date.now(), aborted: false };
      starts.push(start);
      return {
        runtime: options.runtime,
        roleId: role.id,
        contextSource: "fresh",
        async prompt() {
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
        async *events(): AsyncGenerator<never> {
          while (!closed) {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = undefined;
          }
        },
        async abort() {
          start.aborted = true;
          finish?.();
          finish = undefined;
          wake?.();
        },
        async dispose() {
          closed = true;
          finish?.();
          finish = undefined;
          wake?.();
        },
      };
    },
  });
  return { factory, starts };
}

export const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export async function until(fn: () => boolean, timeoutMs = 3000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!fn()) {
    if (Date.now() > end) throw new Error("独立验证观察超时");
    await pause(2);
  }
}

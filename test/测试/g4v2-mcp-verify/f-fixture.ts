// test/测试/g4v2-mcp-verify/f-fixture.ts —— F 域（桌面 MCP handler）独立验证自建夹具。
//
// 独立构造：真实临时项目盘（docs/mcp 声明真落盘）＋可控 SessionManager 假件（假句柄/事件流/重建代/
// 可控开会话失败）。捕获 `openRoleSession` 输入里的 installMcp/uninstallMcp 注入件（经真实注入路径）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../../app/desktop/session.ts";
import type { SessionEventEnvelope } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { listProject, type ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import type { InstallMcpFn, UninstallMcpFn, SessionEvent } from "../../../src/model/runtime.ts";

export type CapturedOpenInput = Parameters<
  typeof import("../../../src/pipeline/orchestration/run-role.ts").openRoleSession
>[0];

export interface FControl {
  roleId: string;
  streams: SessionEvent[];
  sent: string[];
  disposeCount: number;
  stopped: boolean;
  failNextSends: number;
  wake?: () => void;
}

export interface FHarness {
  root: string;
  listing: ProjectListing;
  mgr: SessionManager;
  ctl(roleId: string): FControl;
  disposed(roleId: string): number;
  openedCount(roleId: string): number;
  openedInputs: CapturedOpenInput[];
  envelopes: SessionEventEnvelope[];
  roleStates: { roleId: string; busy: boolean; summaries: string[]; queue: { kind: string; sourceRoleId: string; summary: string; id: string; full: string }[]; running: { kind: string; summary: string } | null }[];
  failOpensAfter: Record<string, number>;
  suInstallMcp(): InstallMcpFn | undefined;
  suUninstallMcp(): UninstallMcpFn | undefined;
  settle(roleId: string, extra?: Partial<SessionEvent>): Promise<void>;
  /** 供护栏矩阵直接读改（私有面直注）。 */
  activeDeliveries: Map<string, { kind: string }>;
  queueKey(roleId: string): string;
  cleanup(): void;
}

const flush = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function until(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("until：等待超时");
    await flush(10);
  }
}

export async function makeTempProject(): Promise<{ root: string; listing: ProjectListing }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-g4v2-f-"));
  for (const rid of ["X", "Y"]) {
    const dir = path.join(root, "角色卡", rid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "role-card.md"), `# 角色 ${rid}（G-4 V2 复验夹具）\n`);
    fs.writeFileSync(path.join(dir, "boundary.yaml"), `role: ${rid}\nentries:\n  - kind: file\n    path: src/${rid}.ts\n    purpose: 复验夹具条目\n`);
  }
  const real = fs.realpathSync(root);
  const listing = await listProject(real);
  return { root: real, listing };
}

function makeHandle(c: FControl): RoleSessionHandle {
  let i = 0;
  return {
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
              for (;;) {
                if (c.stopped) return { value: undefined as unknown as SessionEvent, done: true };
                if (i < c.streams.length) return { value: c.streams[i++] as SessionEvent, done: false };
                await new Promise<void>((resolve) => { c.wake = resolve; });
                c.wake = undefined;
              }
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {
      c.disposeCount += 1;
      c.stopped = true;
      c.wake?.();
    },
  } as RoleSessionHandle;
}

export async function makeFHarness(): Promise<FHarness> {
  const { root, listing } = await makeTempProject();
  const T = 1_700_000_000_000;
  const generations = new Map<string, FControl[]>();
  const openedInputs: CapturedOpenInput[] = [];
  const envelopes: SessionEventEnvelope[] = [];
  const openCounts: Record<string, number> = {};
  const failOpensAfter: Record<string, number> = {};
  const activeDeliveries = new Map<string, { kind: string }>();
  const roleStates: FHarness["roleStates"] = [];

  const ensureControl = (roleId: string): FControl => {
    const list = generations.get(roleId) ?? [];
    let c = list.at(-1);
    if (!c || c.stopped) {
      c = { roleId, streams: [], sent: [], disposeCount: 0, stopped: false, failNextSends: 0 };
      list.push(c);
      generations.set(roleId, list);
    }
    return c;
  };

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openedInputs.push(input);
      const opens = (openCounts[input.roleId] = (openCounts[input.roleId] ?? 0) + 1);
      const limit = failOpensAfter[input.roleId];
      if (limit !== undefined && opens > limit) throw new Error(`复验夹具：${input.roleId} 会话开启失败`);
      const handle = makeHandle(ensureControl(input.roleId));
      return handle;
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
        queue: (info.queue ?? []).map((it) => ({ kind: it.kind, sourceRoleId: it.sourceRoleId, summary: it.summary, id: it.id, full: it.full })),
        running: info.running ? { kind: info.running.kind, summary: info.running.summary } : null,
      }),
    now: () => T,
  });

  return {
    root,
    listing,
    mgr,
    ctl: ensureControl,
    disposed(roleId) { return (generations.get(roleId) ?? []).reduce((n, c) => n + c.disposeCount, 0); },
    openedCount(roleId) { return openCounts[roleId] ?? 0; },
    openedInputs,
    envelopes,
    roleStates,
    failOpensAfter,
    suInstallMcp: () => openedInputs.filter((i) => i.roleId === "su").at(-1)?.installMcp,
    suUninstallMcp: () => openedInputs.filter((i) => i.roleId === "su").at(-1)?.uninstallMcp,
    async settle(roleId, extra) {
      const c = ensureControl(roleId);
      c.streams.push({ kind: "settled", summary: "轮次结束（completed）", detail: { outcome: "completed" }, ...extra });
      c.wake?.();
      await flush(120);
    },
    activeDeliveries,
    queueKey: (roleId: string) => `${root}\u0000${roleId}\u0000demo`,
    cleanup() { fs.rmSync(root, { recursive: true, force: true }); },
  };
}

/** 打开 su 并起一轮客户直聊（「客户消息发起的轮次」最小构造）。 */
export async function openSuAndStartTurn(h: FHarness): Promise<void> {
  const opened = await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
  if (!opened.ok) throw new Error(`su 开会话失败：${opened.error}`);
  const sent = await h.mgr.send("客户直聊", undefined, { projectRoot: h.root, roleId: "su", runtime: "demo" });
  if (sent.ok !== true) throw new Error(`su send 失败：${JSON.stringify(sent)}`);
  await until(() => h.ctl("su").sent.length > 0);
}

/** 打开目标角色 X 并起一轮（busy 态）；返回后 X.busy=true。 */
export async function openXAndStartTurn(h: FHarness): Promise<void> {
  const opened = await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
  if (!opened.ok) throw new Error(`X 开会话失败：${opened.error}`);
  const sent = await h.mgr.send("X 的任务", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" });
  if (sent.ok !== true) throw new Error(`X send 失败：${JSON.stringify(sent)}`);
  await until(() => h.ctl("X").sent.length > 0);
}

export { flush };

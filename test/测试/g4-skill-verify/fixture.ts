// test/测试/g4-skill-verify/fixture.ts —— G-4 独立验证（测试角色，2026-10-16）自建夹具。
//
// 纪律：**独立构造、不复用实施方断言**。本文件只读引用产品源码的公开面（SessionManager 依赖注入、
// listProject 枚举、openRoleSession 输入形状），按验证需要自建可控假件（假句柄/假事件流/注入时钟）。
// 不修改任何他角色文件；本目录仅属测试角色边界（test/测试/）。
//
// 与 G-2 复验夹具（test/测试/g2-verify/fixture.ts）的差异：本夹具以**真实临时项目**为根（`docs/skills`、
// `docs/su`、`docs/contracts` 均真实落盘——登记解析/digest/指纹全部走真盘），假句柄支持**可控重建代**
// （dispose 后再次 open 得新代）、**可控开会话失败**（重建失败分支）、su 能力闭包捕获（installSkill/
// uninstallSkill 桌面注入件）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../../app/desktop/session.ts";
import type { DesktopOrchestrationEvent, SessionEventEnvelope } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { listProject, type ProjectListing } from "../../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import type {
  InstallSkillFn,
  UninstallSkillFn,
  SessionEvent,
} from "../../../src/model/runtime.ts";

/** openRoleSession 的输入形状（捕获桌面注入的能力闭包）。 */
export type CapturedOpenInput = Parameters<
  typeof import("../../../src/pipeline/orchestration/run-role.ts").openRoleSession
>[0];

/** 一个角色某「代」句柄的控制块（重建后旧代 stopped、新代接力）。 */
export interface G4Control {
  roleId: string;
  streams: SessionEvent[];
  sent: string[];
  disposeCount: number;
  stopped: boolean;
  failNextSends: number;
  /** 内部：唤醒挂起的 events() 迭代（推事件/停止时调用）。 */
  wake?: () => void;
}

export interface G4Harness {
  root: string;
  listing: ProjectListing;
  mgr: SessionManager;
  /** 该角色**当前（最新一代）**控制块。 */
  ctl(roleId: string): G4Control;
  /** 该角色累计 dispose 次数（跨代）。 */
  disposed(roleId: string): number;
  /** 该角色累计开会话次数（跨代）。 */
  openedCount(roleId: string): number;
  /** 桌面每次 openRoleSession 捕获的输入（含两能力闭包）。 */
  openedInputs: CapturedOpenInput[];
  /** 事件信封（如实系统行在此找）。 */
  envelopes: SessionEventEnvelope[];
  /** 角色状态外推（队列条目视图——撤回判据用）。 */
  roleStates: { roleId: string; busy: boolean; summaries: string[]; queue: { kind: string; sourceRoleId: string; summary: string; id: string; full: string }[]; running: { kind: string; summary: string } | null }[];
  /** 某一角色最近一次注入的 installSkill/uninstallSkill 闭包（直接调用以驱动 handler）。 */
  suInstall(): InstallSkillFn | undefined;
  suUninstall(): UninstallSkillFn | undefined;
  /** 置 N ⇒ 该角色第 N+1 次起 openRoleSession 抛错（重建失败分支）。 */
  failOpensAfter: Record<string, number>;
  /** 该轮「已跑」——把 settled 推进该角色当前事件流并等待投递机收尾。 */
  settle(roleId: string, extra?: Partial<SessionEvent>): Promise<void>;
  cleanup(): void;
}

const flush = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 轮询等待（有界；默认 3s）。 */
export async function until(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("until：等待超时");
    await flush(10);
  }
}

/** 造临时真实项目：项目角色 X、Y（角色卡/边界齐全）；su 由 listProject 合成（builtIn）。 */
export async function makeTempProject(): Promise<{ root: string; listing: ProjectListing }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-g4-verify-"));
  for (const rid of ["X", "Y"]) {
    const dir = path.join(root, "角色卡", rid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "role-card.md"), `# 角色 ${rid}（G-4 复验夹具）\n`);
    fs.writeFileSync(
      path.join(dir, "boundary.yaml"),
      `role: ${rid}\nentries:\n  - kind: file\n    path: src/${rid}.ts\n    purpose: 复验夹具条目\n`,
    );
  }
  const real = fs.realpathSync(root);
  const listing = await listProject(real);
  return { root: real, listing };
}

/** 落盘一个技能（登记 + 内容）；返回 SKILL.md 当刻字节的 sha256（独立重算，供对照）。 */
export function writeSkill(
  root: string,
  name: string,
  opts: { purpose?: string; roles?: string; status?: string; date?: string; content?: string; installText?: string; noSkillFile?: boolean } = {},
): string {
  const dir = path.join(root, "docs", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "install.md"),
    opts.installText ?? [
      `# 安装登记：${name}`,
      "",
      `- 用途：${opts.purpose ?? "一句话用途"}`,
      `- 适用角色：${opts.roles ?? "X"}`,
      `- 状态：${opts.status ?? "installed"}`,
      `- 安装日期：${opts.date ?? "2026-10-16"}`,
      "",
    ].join("\n"),
  );
  const bytes = Buffer.from(opts.content ?? `# 技能：${name}\n内容\n`, "utf8");
  if (opts.noSkillFile !== true) fs.writeFileSync(path.join(dir, "SKILL.md"), bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

/** 目录树快照（相对路径 → sha256/`<dir>`）——副作用核对用。 */
export function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) {
        out[rel] = "<dir>";
        walk(abs);
      } else {
        out[rel] = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
      }
    }
  };
  walk(root);
  return out;
}

function makeHandle(c: G4Control): RoleSessionHandle {
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

/** 建 G-4 复验夹具（异步：需真实 listProject 枚举临时项目）。 */
export async function makeG4Harness(): Promise<G4Harness> {
  const { root, listing } = await makeTempProject();
  let T = 1_700_000_000_000;
  const generations = new Map<string, G4Control[]>();
  const openedInputs: CapturedOpenInput[] = [];
  const envelopes: SessionEventEnvelope[] = [];
  const roleStates: G4Harness["roleStates"] = [];
  const openCounts: Record<string, number> = {};
  const failOpensAfter: Record<string, number> = {};

  const ensureControl = (roleId: string): G4Control => {
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

  const h: G4Harness = {
    root,
    listing,
    mgr,
    ctl: ensureControl,
    disposed(roleId) {
      return (generations.get(roleId) ?? []).reduce((n, c) => n + c.disposeCount, 0);
    },
    openedCount(roleId) {
      return openCounts[roleId] ?? 0;
    },
    openedInputs,
    envelopes,
    roleStates,
    suInstall: () => openedInputs.filter((i) => i.roleId === "su").at(-1)?.installSkill,
    suUninstall: () => openedInputs.filter((i) => i.roleId === "su").at(-1)?.uninstallSkill,
    failOpensAfter: failOpensAfter,
    async settle(roleId, extra) {
      const c = ensureControl(roleId);
      c.streams.push({ kind: "settled", summary: "轮次结束（completed）", detail: { outcome: "completed" }, ...extra });
      c.wake?.();
      await flush(120); // 让 consume 循环收尾 + 投递机排空队列
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return h;
}

/** 等价于 `mgr.open` + 确保 busy（直接 send 开一轮）——「客户消息发起的轮次」最小构造。 */
export async function openSuAndStartTurn(h: G4Harness): Promise<void> {
  const opened = await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" });
  if (!opened.ok) throw new Error(`su 开会话失败：${opened.error}`);
  const sent = await h.mgr.send("客户直聊", undefined, { projectRoot: h.root, roleId: "su", runtime: "demo" });
  if (sent.ok !== true) throw new Error(`su send 失败：${JSON.stringify(sent)}`);
  await until(() => h.ctl("su").sent.length > 0);
}

export { flush };

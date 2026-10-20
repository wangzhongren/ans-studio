// test/桌面应用/dispatch-delivery.test.ts
// 桌面窗口（H-1，2026-10-12 设计）：**su 派发任务的路由**——复用 E-1 投递机的证据：
// 路由（目标未开→自动开 / 忙→排队按序 / 失败→如实系统行+保留待重投）；校验（非本项目角色/su 自身/
// 空参数 → **如实回执**给工具 + 系统行）；去重（**队列期窗口**，送达即释放以保返工可再派）；闭环
// （su 派发 → 角色回交 → su 收到报告；不重复、不空转）。
// G-1／A2（2026-10-16 客户批准；设计 2026-10-16 §四；编排 A1 接口交回 §五）：派发文本切编排单一来源
// `renderDispatchPrompt`（本地副本 `renderDispatchPromptLocal` 已收口删除）；必读块接线（投递时探测
// 哈希 → `planDispatchDelivery` 判据：契约缺失 fail-closed 拒投 / workflow 缺失降级照投）见文末 G-1 组。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { renderHandbackPrompt, renderDispatchPrompt, extractDispatchReadPaths, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { DispatchTaskFn, DispatchReceipt } from "../../src/provider/pi/session.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";
// G-2/W5（2026-10-16 客户批准）：恢复确认卡（卡侧真件——present 收集 + respond 驱动「恰 allow:true 才执行」）
// 与恢复提议能力（经 openRoleSession 捕获——仅 su 注入）。
import { createRecoveryConfirmPresenter, type RecoveryConfirmRequest, type RecoveryConfirmRequestInput } from "../../app/desktop/recovery-channel.ts";
// 三权（评审 §5.6）：能力矩阵用例注入客户通道与 shell 两件（判据只看注入字段，不触真实 UI）。
import type { DesktopCustomerInputFn } from "../../app/desktop/customer-input.ts";
import type { DesktopOperatorChannelFn, DesktopShellArming } from "../../app/desktop/operator-channel.ts";
import type { ProposeRecoveryFn, RoleStatusFn, SessionTailFn } from "../../src/model/runtime.ts";
// G-4/I3（2026-10-16 客户批准）：技能安装/卸载能力（经 openRoleSession 捕获——仅 su 注入）。
import type { InstallSkillFn, UninstallSkillFn, InstallSkillReceipt } from "../../src/model/runtime.ts";
// G-4 V2：外来 MCP 安装/卸载能力（同款捕获）与回执（沿技能版体格）。
import type { InstallMcpFn, UninstallMcpFn, InstallMcpReceipt } from "../../src/model/runtime.ts";

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const HANDBACK_A: TaskHandback = {
  roleId: "A",
  taskId: "H1",
  status: "completed",
  summary: "做完了",
  evidence: ["docs/x.md"],
  at: "2026-10-12T03:00:00.000Z",
};

/** 派发输入文案（无必读引用时）= 编排单一来源 `renderDispatchPrompt` 原文——G-1/A2 收口：桌面本地
 *  模板（`renderDispatchPromptLocal`）已删除；现行格式为**三行**（首行含原因段 / 任务独占一行 /
 *  末句带句号），与旧单行内联模板**不同布局**（金文本按单一来源重写，见各断言）。 */
const dispatchTemplate = (task: string, reason?: string) => renderDispatchPrompt({ roleId: "目标", task, reason });

function listing(projectRoot = "/proj"): ProjectListing {
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
  return {
    projectRoot,
    roles: [mk("su", true), mk("A"), mk("B")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "su",
    governanceModel: "single",
  };
}

/** 三权（评审 §5.4/§5.6）：trio 列表——内置三人带 `governanceFunction`，主入口 rapporteur。 */
function trioListing(projectRoot = "/proj"): ProjectListing {
  const mkBuiltIn = (roleId: string, fn: "proposal" | "nomination" | "schedule"): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:trio/${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  return {
    projectRoot,
    roles: [mkBuiltIn("rapporteur", "proposal"), mkBuiltIn("nominator", "nomination"), mkBuiltIn("convener", "schedule"), ...listing(projectRoot).roles.filter((r) => r.builtIn !== true)],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "rapporteur",
    governanceModel: "trio",
  };
}

/** 打开会话时收到的完整能力面（三权能力矩阵断言用）。 */
type OpenCapabilities = { dispatchTask?: DispatchTaskFn; proposeRecovery?: ProposeRecoveryFn; roleStatus?: RoleStatusFn; sessionTail?: SessionTailFn; installSkill?: InstallSkillFn; uninstallSkill?: UninstallSkillFn; installMcp?: InstallMcpFn; uninstallMcp?: UninstallMcpFn; customerInput?: DesktopCustomerInputFn; shellArming?: DesktopShellArming; shellOperatorChannel?: DesktopOperatorChannelFn; shellOperatorOnly?: unknown; shellReadonly?: unknown };

interface Harness {
  mgr: SessionManager;
  streams: Record<string, OrchestrationEvent[]>;
  sent: Record<string, string[]>;
  sendOptions: Record<string, RoleSessionSendOptions[]>;
  envelopes: import("../../app/desktop/session.ts").SessionEventEnvelope[];
  openCalls: string[];
  /** 打开某角色时拿到的派发能力（仅 su 会话应注入）——测试直接调用以驱动路由。 */
  dispatchOf: (roleId: string) => DispatchTaskFn | undefined;
  /** **F-2 夹具（2026-10-16）**：挂起某角色的**下一次** send——返回 release；在 release 前该 send 的
   *  promise 不 resolve（模拟真实 Pi「prompt 随整轮 resolve」——立即 resolve 的旧桩天然掩盖 F-2 缺陷）。 */
  hangNext: (roleId: string) => () => void;
  /** 各角色 send 的**并发峰值**（对同会话并发 send 的钉子：恒应 ≤1）。 */
  maxConcurrent: Record<string, number>;
  /** 队列/状态快照外推（emitRoleState 捕获）——G-1 拒投「零入队」判据用（不造第二套数据源，直接收线上通道）。 */
  roleStates: { roleId: string; summaries: string[] }[];
  /** G-2/W5：打开会话时拿到的恢复提议/只读能力（仅 su 会话应注入）——测试直接调用以驱动桥。 */
  proposeRecoveryOf: (roleId: string) => ProposeRecoveryFn | undefined;
  roleStatusOf: (roleId: string) => RoleStatusFn | undefined;
  sessionTailOf: (roleId: string) => SessionTailFn | undefined;
  /** G-4/I3：打开会话时拿到的技能安装/卸载能力（仅 su 会话应注入）——测试直接调用以驱动 handler。 */
  installSkillOf: (roleId: string) => InstallSkillFn | undefined;
  uninstallSkillOf: (roleId: string) => UninstallSkillFn | undefined;
  /** G-4 V2：打开会话时拿到的 MCP 安装/卸载能力（仅 su 会话应注入）。 */
  installMcpOf: (roleId: string) => InstallMcpFn | undefined;
  uninstallMcpOf: (roleId: string) => UninstallMcpFn | undefined;
  /** G-2/W4：各角色 abort 被调次数（恢复桥「恰一次执行」判据）。 */
  aborts: Record<string, number>;
  /** 三权（评审 §5.6）：打开会话时收到的完整能力面（矩阵断言用）。 */
  capabilitiesOf: (roleId: string) => OpenCapabilities | undefined;
}

function makeHarness(opts: { failSends?: Record<string, number>; openDelayMs?: number; projectRoot?: string; recoveryConfirm?: ReturnType<typeof createRecoveryConfirmPresenter>; autoDecisionEnabled?: (projectRoot: string, proposerRoleId: string) => boolean; unsupportedAbort?: string[]; failOpensAfter?: Record<string, number>; customListing?: ProjectListing; customerInput?: DesktopCustomerInputFn; shellArming?: DesktopShellArming; shellOperatorChannel?: DesktopOperatorChannelFn; getListing?: (projectRoot: string) => ProjectListing | undefined } = {}): Harness {
  const root = opts.projectRoot ?? "/proj";
  const l = opts.customListing ?? listing(root);
  const streams: Record<string, OrchestrationEvent[]> = { su: [], A: [], B: [] };
  const sent: Record<string, string[]> = { su: [], A: [], B: [] };
  const sendOptions: Record<string, RoleSessionSendOptions[]> = {};
  const envelopes: import("../../app/desktop/session.ts").SessionEventEnvelope[] = [];
  const roleStates: { roleId: string; summaries: string[] }[] = [];
  const openCalls: string[] = [];
  type OpenCapabilities = { dispatchTask?: DispatchTaskFn; proposeRecovery?: ProposeRecoveryFn; roleStatus?: RoleStatusFn; sessionTail?: SessionTailFn; installSkill?: InstallSkillFn; uninstallSkill?: UninstallSkillFn; installMcp?: InstallMcpFn; uninstallMcp?: InstallMcpFn; customerInput?: DesktopCustomerInputFn; shellArming?: DesktopShellArming; shellOperatorChannel?: DesktopOperatorChannelFn; shellOperatorOnly?: unknown; shellReadonly?: unknown };
  const openInputs: Record<string, OpenCapabilities> = {};
  const openCounts: Record<string, number> = {};
  const aborts: Record<string, number> = {};
  // 注：`stopped` 逐句柄闭包（不是按 roleId 共享）——G-2/W4 的 rebuildSession 会 dispose 旧句柄、重开新句柄：
  // 若按 roleId 共享，重开后的新迭代器会继承「已停」标记、consume 循环即时退出（重建后的事件全丢）。
  // 生产语义：每句柄各有一条独立事件流（旧句柄停、新句柄活）——本夹具按生产语义建模。
  const failLeft: Record<string, number> = { ...(opts.failSends ?? {}) };
  const nextGate: Record<string, Promise<void> | undefined> = {};
  const activeSends: Record<string, number> = {};
  const maxConcurrent: Record<string, number> = {};
  const hangNext = (roleId: string): (() => void) => {
    let release!: () => void;
    nextGate[roleId] = new Promise<void>((resolve) => { release = resolve; });
    return release;
  };

  const makeHandle = (roleId: string): RoleSessionHandle => {
    let i = 0;
    let stopped = false;
    return {
      async send(text: string, options?: RoleSessionSendOptions): Promise<void> {
        activeSends[roleId] = (activeSends[roleId] ?? 0) + 1;
        maxConcurrent[roleId] = Math.max(maxConcurrent[roleId] ?? 0, activeSends[roleId]);
        try {
          (sendOptions[roleId] ??= []).push(options ?? {});
          const gate = nextGate[roleId];
          if (gate) {
            nextGate[roleId] = undefined;
            await gate; // F-2 夹具：可控挂起——release 前 promise 不 resolve（模拟整轮在跑）
          }
          if ((failLeft[roleId] ?? 0) > 0) {
            failLeft[roleId] = (failLeft[roleId] ?? 0) - 1;
            throw new Error(`演示：${roleId} 投递通道瞬时失败`);
          }
          (sent[roleId] = sent[roleId] || []).push(text);
        } finally {
          activeSends[roleId] -= 1;
        }
      },
      events(): AsyncIterable<OrchestrationEvent> {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 120; tries += 1) {
                  if (stopped) return { value: undefined as unknown as OrchestrationEvent, done: true };
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
        stopped = true;
      },
      // G-2/W4：恢复桥 abort-turn 的调用面（三态契约与真实句柄同形；`unsupportedAbort` 角色模拟运行时不支持）。
      async abort() {
        aborts[roleId] = (aborts[roleId] ?? 0) + 1;
        if ((opts.unsupportedAbort ?? []).includes(roleId)) return { ok: false, supported: false, error: "当前运行时不支持停止" };
        return { ok: true, supported: true };
      },
    };
  };

  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      openCalls.push(input.roleId);
      const inputWithCapabilities = input as OpenCapabilities;
      openInputs[input.roleId] = {
        dispatchTask: inputWithCapabilities.dispatchTask,
        proposeRecovery: inputWithCapabilities.proposeRecovery,
        roleStatus: inputWithCapabilities.roleStatus,
        sessionTail: inputWithCapabilities.sessionTail,
        installSkill: inputWithCapabilities.installSkill,
        uninstallSkill: inputWithCapabilities.uninstallSkill,
        installMcp: inputWithCapabilities.installMcp,
        uninstallMcp: inputWithCapabilities.uninstallMcp,
        customerInput: inputWithCapabilities.customerInput,
        shellArming: inputWithCapabilities.shellArming,
        shellOperatorChannel: inputWithCapabilities.shellOperatorChannel,
        shellOperatorOnly: inputWithCapabilities.shellOperatorOnly,
        shellReadonly: inputWithCapabilities.shellReadonly,
      };
      // G-4 夹具：可控的「第 N 次之后开会话失败」（重建失败分支——rebuildSession 重开失败）。
      const opens = (openCounts[input.roleId] = (openCounts[input.roleId] ?? 0) + 1);
      const openLimit = opts.failOpensAfter?.[input.roleId];
      if (openLimit !== undefined && opens > openLimit) throw new Error(`演示：${input.roleId} 会话开启失败`);
      // F-2-opt2 夹具：可选的开会话延迟——让并发 open 真正重叠（互斥未落地时必现双开）。
      if ((opts.openDelayMs ?? 0) > 0) await new Promise((r) => setTimeout(r, opts.openDelayMs));
      return makeHandle(input.roleId);
    },
    createPiAdapterFactory: () => {
      throw new Error("本用例不应构造 pi 适配器");
    },
    createDemoAdapter: () => {
      throw new Error("本用例不应构造 demo 适配器");
    },
    buildProjectConfig,
    getListing: opts.getListing ?? ((r) => (r === root ? l : undefined)),
    emitEvent: (env) => envelopes.push(env),
    emitRoleState: (info) => roleStates.push(info),
    // G-2/W5：恢复确认卡通道（缺省 ⇒ 恢复桥「未接线、未获执行」fail-closed——本组两条路径都钉）。
    recoveryConfirm: opts.recoveryConfirm,
    // 2026-10-20：「替我决策」开关（开启 ⇒ propose_recovery 不弹卡、直接执行）。
    ...(opts.autoDecisionEnabled !== undefined ? { autoDecisionEnabled: opts.autoDecisionEnabled } : {}),
    // 三权（评审 §5.6）：能力矩阵用例注入客户通道与 shell 两件（缺省 ⇒ 不注入，保持旧用例逐字不变）。
    ...(opts.customerInput !== undefined ? { customerInput: opts.customerInput } : {}),
    ...(opts.shellArming !== undefined ? { shellArming: opts.shellArming } : {}),
    ...(opts.shellOperatorChannel !== undefined ? { shellOperatorChannel: opts.shellOperatorChannel } : {}),
  });
  return {
    mgr, streams, sent, sendOptions, envelopes, openCalls,
    dispatchOf: (roleId) => openInputs[roleId]?.dispatchTask,
    proposeRecoveryOf: (roleId) => openInputs[roleId]?.proposeRecovery,
    roleStatusOf: (roleId) => openInputs[roleId]?.roleStatus,
    sessionTailOf: (roleId) => openInputs[roleId]?.sessionTail,
    installSkillOf: (roleId) => openInputs[roleId]?.installSkill,
    uninstallSkillOf: (roleId) => openInputs[roleId]?.uninstallSkill,
    installMcpOf: (roleId) => openInputs[roleId]?.installMcp,
    uninstallMcpOf: (roleId) => openInputs[roleId]?.uninstallMcp,
    hangNext, maxConcurrent, roleStates, aborts,
    capabilitiesOf: (roleId) => openInputs[roleId],
  };
}

test("H-1 路由：su 派发 → 目标未开**自动开**并收到派发输入（模板文案）；su 与目标两边都有系统行", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su");
  assert.ok(typeof dispatch === "function", "su 会话应注入派发能力（dispatchTask）");
  assert.equal(h.dispatchOf("A"), undefined, "普通角色会话**不**注入（未取过即 undefined）");

  const r = (await dispatch!({ roleId: "A", task: "给 A 的活", reason: "因为排期" })) as DispatchReceipt;
  assert.equal(r.ok, true);
  assert.ok(/已受理/.test(r.message || "") && /未开——将自动开启/.test(r.message || ""), "回执如实（受理≠已完成；会话未开会自动开）");
  await tick(150);
  assert.deepEqual(h.sendOptions.A.map(o => o.handback), [{ required: true }]);
  assert.ok(h.openCalls.includes("A"), "目标未开会话 ⇒ **自动开启**");
  assert.deepEqual(h.sent.A, [dispatchTemplate("给 A 的活", "因为排期")], "目标收到派发输入（模板文案）");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /已派发任务给 A/.test(e.event.summary)),
    "su 的 pane 有受理回执行"
  );
  assert.ok(
    h.envelopes.some((e) => e.roleId === "A" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /已接收来自 su 的派发任务/.test(e.event.summary)),
    "目标的 pane 有「任务到货」行"
  );
  await h.mgr.stop(null);
});

test("H-1 排队：目标忙 ⇒ 入队；其 settled 后按序放行（绝不并发 send）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("A 先忙一会儿"); // A busy=true
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  await dispatch({ roleId: "A", task: "排队活" });
  await tick(100);
  assert.deepEqual(h.sent.A, ["A 先忙一会儿"], "A 忙：派发**排队**，不得并发投递");
  h.streams.A.push({ kind: "settled", summary: "A 一轮结束" });
  await tick(150);
  assert.deepEqual(h.sendOptions.A.map(o => o.handback), [{ required: false }, { required: true }]);
  assert.deepEqual(h.sent.A, ["A 先忙一会儿", dispatchTemplate("排队活")], "settled 后按序放行派发");
  await h.mgr.stop(null);
});

test("H-1 失败保留：投递失败 ⇒ 如实系统行（未丢弃）+ 放回队首；下次时机成功送达", async () => {
  // 连失败两次：把「自动开启后的放行」与「入队触发的放行」两条链上的尝试都耗尽，再由下一时机成功。
  const h = makeHarness({ failSends: { A: 2 } });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  await dispatch({ roleId: "A", task: "会失败一次" });
  await tick(150);
  assert.equal(h.sent.A.length, 0, "投递失败：未送达");
  const note = h.envelopes.find((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /派发投递失败（目标 A）/.test(e.event.summary));
  assert.ok(note, "**如实系统行**（不静默）");
  assert.ok(/未丢弃/.test(note!.event.summary) && /重试/.test(note!.event.summary), "系统行说明「未丢弃 + 重试」");

  h.streams.A.push({ kind: "settled", summary: "重试时机" });
  await tick(150);
  assert.ok(h.sendOptions.A.length >= 3);
  assert.ok(h.sendOptions.A.every(o => o.handback?.required === true), "每次重试保持正式任务来源");
  assert.deepEqual(h.sent.A, [dispatchTemplate("会失败一次")], "保留的派发在下次时机成功送达");
  await h.mgr.stop(null);
});

test("H-1 校验（如实回执，不静默）：非本项目角色 / 内置治理角色（含 su 自身）/ 空参数 → {ok:false} + 系统行", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;

  const unknown = (await dispatch({ roleId: "不存在", task: "x" })) as DispatchReceipt;
  assert.equal(unknown.ok, false);
  assert.ok(/不在本项目/.test(unknown.message || ""), "工具收到如实失败原因");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /角色 不存在 不在本项目/.test(e.event.summary)),
    "系统行如实"
  );

  const selfDispatch = (await dispatch({ roleId: "su", task: "x" })) as DispatchReceipt;
  assert.equal(selfDispatch.ok, false);
  assert.ok(/内置治理角色/.test(selfDispatch.message || ""), "指向 su 自身 → 如实拒绝");

  const emptyTask = (await dispatch({ roleId: "A", task: "   " })) as DispatchReceipt;
  assert.equal(emptyTask.ok, false);
  assert.ok(/必须非空/.test(emptyTask.message || ""), "空参数 → 如实拒绝");
  await h.mgr.stop(null);
});

test("H-1 去重：同一派发在**队列期**重复调用 → 去重（只投一次）；送达后同文再派 → 放行（返工回路）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("A 忙");
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;

  const r1 = (await dispatch({ roleId: "A", task: "返工：改 X" })) as DispatchReceipt;
  const r2 = (await dispatch({ roleId: "A", task: "返工：改 X" })) as DispatchReceipt;
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.ok(/去重/.test(r2.message || ""), "在途窗口内重复调用 → 如实去重回执");
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(150);
  assert.deepEqual(h.sent.A, ["A 忙", dispatchTemplate("返工：改 X")], "在途窗口内**只投一次**");

  // 送达即释放窗口去重：同文再派（返工）应作为**新的一次**放行。
  const r3 = (await dispatch({ roleId: "A", task: "返工：改 X" })) as DispatchReceipt;
  assert.equal(r3.ok, true);
  assert.ok(!/去重/.test(r3.message || ""), "送达后同文再派 → 新派发（不被去重）");
  h.streams.A.push({ kind: "settled", summary: "又一轮结束" });
  await tick(150);
  assert.deepEqual(h.sendOptions.A.map(o => o.handback?.required), [false, true, true]);
  assert.equal(h.sent.A.filter((t) => t === dispatchTemplate("返工：改 X")).length, 2, "返工可再派（共两次投递）");
  await h.mgr.stop(null);
});

test("真机崩溃修复（钉子）：派发条目**不走 handback 渲染**；坏回交并入同一机也不炸、零未捕获拒绝", async () => {
  const rejections: unknown[] = [];
  const onRej = (r: unknown) => {
    rejections.push(r);
  };
  process.on("unhandledRejection", onRej);
  try {
    const h = makeHarness();
    await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await tick(30);
    const dispatch = h.dispatchOf("su")!;
    await dispatch({ roleId: "A", task: "正常派发" });
    await tick(120);
    assert.deepEqual(
      h.sent.A,
      [dispatchTemplate("正常派发")],
      "dispatch 条目按**入队定格的派发文本**投递（不经 renderHandbackPrompt——真机崩溃根因即两者混走）"
    );
    // 同机并入一条**坏形状**回交（缺载荷）：应如实拦截，绝不产生未捕获拒绝。
    h.streams.A.push({ kind: "handback", summary: "坏回交（无载荷）" } as unknown as OrchestrationEvent);
    await tick(150);
    await tick(100);
    assert.equal(rejections.length, 0, "**不得出现未捕获拒绝**（真机崩溃钉子）");
    assert.ok(
      h.envelopes.some((e) => e.event.kind === "message" && (e.event.detail as {source?: string} | undefined)?.source === "delivery-note" && /形状不符/.test(e.event.summary)),
      "坏回交应如实系统行（不崩、不静默）"
    );
    await h.mgr.stop(null);
  } finally {
    process.removeListener("unhandledRejection", onRej);
  }
});

test("H-1 闭环：su 派发 → 角色回交 → su 收到报告；不重复、不空转（EC-1 后无自激）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  await dispatch({ roleId: "A", task: "做闭环" });
  await tick(120);
  assert.deepEqual(h.sent.A, [dispatchTemplate("做闭环")], "A 收到派发输入");

  h.streams.A.push({ kind: "handback", summary: "回交 su：做完了", handback: HANDBACK_A });
  await tick(150);
  assert.deepEqual(h.sent.su, [renderHandbackPrompt(HANDBACK_A)], "su 恰好收到一条回交投递（E-1，单一来源原文）");
  // 不空转：静置再等，不应再多任何投递（闭环不自我激发——su 的验收/报告不产生新的派发或回交投递）。
  const aCount = h.sent.A.length;
  const suCount = h.sent.su.length;
  await tick(120);
  assert.equal(h.sent.A.length, aCount, "A 无多余投递");
  assert.equal(h.sent.su.length, suCount, "su 无多余投递（不重复、不空转）");
  await h.mgr.stop(null);
});

test('delivery notes are typed system messages, never ghost tools or extra prompts on the actual dispatch path',async()=>{
 const h=makeHarness();
 try{
  await h.mgr.open({projectRoot:'/proj',roleId:'su',runtime:'demo'});
  assert.equal((await h.dispatchOf('su')!({roleId:'A',task:'one actual dispatch'}))?.ok,true);
  await tick(100);
  h.streams.A.push({kind:'tool_call',summary:'actual controlled tool start',runtime:'demo',roleId:'A',turnId:'actual-turn',detail:{toolName:'read_file',toolCallId:'actual-call',phase:'start'}},{kind:'accepted',summary:'actual controlled tool result',runtime:'demo',roleId:'A',turnId:'actual-turn',detail:{toolName:'read_file',toolCallId:'actual-call',phase:'result',ok:true}});
  await tick(100);
  const worker=h.envelopes.filter(e=>e.roleId==='A');
  assert.equal(worker.filter(e=>e.event.kind==='tool_call').length,1,'the dispatch progress note must not add a second tool row');
  assert.deepEqual(h.sent.A,[dispatchTemplate('one actual dispatch')]);assert.equal(h.sent.su.length,0,'notes never prompt the coordinator');
  const notes=h.envelopes.filter(e=>e.event.kind==='message'&&(e.event.detail as {source?:string}|undefined)?.source==='delivery-note');
  assert.equal(notes.length,2);
  assert.ok(notes.some(e=>e.roleId==='A'&&e.event.summary==='已接收来自 su 的派发任务——请按任务文本执行，完成后交回报告。'));
  assert.ok(notes.some(e=>e.roleId==='su'&&e.event.summary==='已派发任务给 A（已投递到其会话；其结果/回交会回到本会话）。'));
  for(const note of notes){assert.equal(note.projectRoot,'/proj');assert.equal(note.runtime,'demo');assert.equal(Object.hasOwn(note.event,'turnId'),false);assert.deepEqual((note.event as {detail:unknown}).detail,{source:'delivery-note'});}
  const actual=worker.find(e=>e.event.kind==='tool_call')!.event as {turnId?:string;detail?:{toolCallId?:string;phase?:string}};assert.equal(actual.turnId,'actual-turn');assert.equal(actual.detail?.toolCallId,'actual-call');assert.equal(actual.detail?.phase,'start');
 }finally{await h.mgr.stop();}
});

// ————— F-2（2026-10-16 客户批准）：投递链持有收窄到「认领段」—————
// 真机实测：一条投递链被持有到目标**整轮**结束（16 分 55 秒），同项目其他角色的投递/回交/客户消息全被迫
// 串行等待。本组用例用「可控挂起的 send」（release 前 promise 不 resolve——模拟真实 Pi prompt 随整轮 resolve）
// 复现：旧实现在挂起期间**跨角色**投递必被压住；修复后投递开跑即释放链。

test("F-2-T1 长轮不阻塞跨角色：A 的投递轮挂起期间，su 派发 B ⇒ **立即**送达（不待 A 轮结束）；放行后两边各恰一次", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  const releaseA = h.hangNext("A");
  const r1 = (await dispatch({ roleId: "A", task: "长活" })) as DispatchReceipt;
  assert.equal(r1.ok, true);
  await tick(100); // A 自动开、认领、send 已发起（挂起中）
  assert.ok(h.openCalls.includes("A"), "A 会话被自动开启");
  assert.equal(h.maxConcurrent.A, 1, "A 的 send 在飞（挂起=整轮在跑）");
  assert.deepEqual(h.sent.A, [], "挂起期间 A 的投递尚未结算（send promise 未 resolve）");

  const r2 = (await dispatch({ roleId: "B", task: "另一条" })) as DispatchReceipt;
  assert.equal(r2.ok, true);
  await tick(100);
  assert.deepEqual(h.sent.B, [dispatchTemplate("另一条")], "**B 立即收到**——不被 A 的长轮持有（旧实现：链被持有贯穿 A 整轮，B 只能干等）");
  assert.deepEqual(h.sent.A, [], "此时 A 仍在挂起（对照面：不是靠 A 结束才送达 B）");

  releaseA();
  await tick(100);
  assert.deepEqual(h.sent.A, [dispatchTemplate("长活")], "放行后 A 的投递结算（恰一次）");
  assert.deepEqual(h.sent.B, [dispatchTemplate("另一条")], "B 无重复投递");
  assert.equal(h.maxConcurrent.A, 1, "对 A 会话无并发 send");
  assert.equal(h.maxConcurrent.B, 1, "对 B 会话无并发 send");
  await h.mgr.stop(null);
});

test("F-2-T2 同目标仍严格排队：A 挂起期间再派 A ⇒ 排队（绝不并发 send）；放行 + settled 后按序投递", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h.dispatchOf("su")!;
  const releaseA = h.hangNext("A");
  await dispatch({ roleId: "A", task: "第一件" });
  await tick(100);
  assert.deepEqual(h.sent.A, [], "A 认领并挂起中");
  const r2 = (await dispatch({ roleId: "A", task: "第二件" })) as DispatchReceipt;
  assert.equal(r2.ok, true);
  await tick(120);
  assert.deepEqual(h.sent.A, [], "A 忙（send 未结）：第二件**排队**，不得并发投递");
  assert.equal(h.maxConcurrent.A, 1, "同会话并发 send 恒 ≤1");

  releaseA();
  await tick(80);
  assert.deepEqual(h.sent.A, [dispatchTemplate("第一件")], "第一件送达");
  h.streams.A.push({ kind: "settled", summary: "一轮结束" });
  await tick(200);
  assert.deepEqual(
    h.sent.A,
    [dispatchTemplate("第一件"), dispatchTemplate("第二件")],
    "settled 后按到达序放行第二件（链释放后行为逐字保真）"
  );
  assert.equal(h.maxConcurrent.A, 1, "全程对同会话无并发 send");
  await h.mgr.stop(null);
});

test("F-2-opt2 openInternal 按会话键互斥：并发两次 open 同一角色 ⇒ 恰一次建会话（第二次续接，不双开）；用户 open × 投递自动开同键同样恰一次", async () => {
  // ① 两次用户 open 并发：旧实现双方并发穿过「已有会话?」检查后各自建会话（先建者被覆盖——句柄泄漏）。
  const h = makeHarness({ openDelayMs: 30 });
  const [r1, r2] = await Promise.all([
    h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" }),
    h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" }),
  ]);
  assert.equal(r1.ok && r2.ok, true);
  assert.equal(h.openCalls.filter((r) => r === "A").length, 1, "**恰一次**建会话（互斥闭合双开窗口）");
  assert.equal(r1.resumed, false, "先到者新建");
  assert.equal(r2.resumed, true, "后到者按序等待后**续接**同一会话（不双开、不覆盖）");
  assert.match(r2.note ?? "", /续接/, "续接说明如实");
  await h.mgr.stop(null);

  // ② 用户 open × 投递机自动开（§三论证的既有窗口①）：两者并发也不得双开。
  const h2 = makeHarness({ openDelayMs: 30 });
  await h2.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  const dispatch = h2.dispatchOf("su")!;
  const userOpen = h2.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" }); // 不 await：与投递自动开并发
  const receipt = (await dispatch({ roleId: "A", task: "触发自动开" })) as DispatchReceipt;
  assert.equal(receipt.ok, true);
  assert.equal((await userOpen).ok, true);
  await tick(200);
  assert.equal(h2.openCalls.filter((x) => x === "A").length, 1, "用户 open 与投递自动开同键：**恰一次**建会话");
  assert.deepEqual(h2.sent.A, [dispatchTemplate("触发自动开")], "派发照常送达一次（互斥不丢投递）");
  await h2.mgr.stop(null);
});

test("F-2-opt3 认领段起止诊断：delivery.claim.start/end 与 delivery.start/end 同场，顺序如实（claim.start < delivery.start < claim.end < delivery.end）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-f2-diagnostics-"));
  configureDiagnostics({ directory: dir });
  const h = makeHarness();
  try {
    await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
    await tick(30);
    const dispatch = h.dispatchOf("su")!;
    await dispatch({ roleId: "A", task: "诊断活" });
    await tick(200);
    await flushDiagnostics();
    const files = await fs.readdir(dir);
    const records = (await Promise.all(files.map((f) => fs.readFile(path.join(dir, f), "utf8")))).join("").trim().split("\n").map((line) => JSON.parse(line) as { event: string; state?: string; queueDepth?: number; count?: number; ok?: boolean });
    const at = (event: string) => records.findIndex((r) => r.event === event);
    const start = records[at("delivery.claim.start")];
    const end = records[at("delivery.claim.end")];
    assert.ok(start, "认领段开始有诊断（delivery.claim.start）");
    assert.equal(start?.state, "dispatch", "认领条目类型如实");
    assert.equal(start?.queueDepth, 1, "认领时的队列深度如实");
    assert.ok(end, "认领段结束有诊断（delivery.claim.end）");
    assert.equal(end?.state, "dispatch");
    assert.equal(end?.count, 1, "合批计数如实");
    assert.ok(
      at("delivery.claim.start") < at("delivery.start") && at("delivery.start") < at("delivery.claim.end") && at("delivery.claim.end") < at("delivery.end"),
      "顺序如实：claim.start < delivery.start < claim.end < delivery.end（下一轮真机可据 claim 跨度区分「认领耗时」vs「轮次时长」）"
    );
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ————— G-1／A2（2026-10-16 客户批准）：派发必读块投递侧接线 —————
// 设计 `2026-10-16_design_contract-workflow-dispatch.md` §四/§八；编排 A1 接口交回 §五。
// 分层：提取/判据/渲染 = 编排单一来源（`extractDispatchReadPaths`/`planDispatchDelivery`/
// `renderDispatchPrompt`）；桌面只做：投递时 `filePrint` 探测 → 判据（**紧挨去重登记之前**）→
// 拒投（fail-closed）或入队（文本定格）。以下用例全部走真实 SessionManager 接线。

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test("G-1/A2-1 必读块：任务引用 workflow+契约 ⇒ 投递文本带当刻哈希（按序：workflow 第 1、契约首现序、去重）；文本 = 编排单一来源渲染", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1-reads-"));
  const h = makeHarness({ projectRoot: dir });
  try {
    await fs.mkdir(path.join(dir, "docs", "contracts"), { recursive: true });
    const contractBytes = "# 契约 v1：kanban-api\n接口：…\n";
    const wfBytes = "# 项目工作流 W1\n## 2. 完成口令\n";
    await fs.writeFile(path.join(dir, "docs", "contracts", "kanban-api-v1.md"), contractBytes, "utf8");
    await fs.writeFile(path.join(dir, "docs", "workflow.md"), wfBytes, "utf8");
    const contractHash = sha256(contractBytes);
    const wfHash = sha256(wfBytes);

    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "实现 kanban。契约 `docs/contracts/kanban-api-v1.md` 为准；先读 docs/workflow.md；再引一次 docs/contracts/kanban-api-v1.md（去重）。";
    const r = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r.ok, true);
    await tick(150);
    assert.equal(h.sent.A.length, 1, "目标收到恰一条派发");
    const text = h.sent.A[0];

    // ① 必读块在投递文本中；哈希为**测试独立计算**的当刻文件字节哈希；顺序/去重如实。
    assert.ok(text.includes("必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）："), "必读块在场");
    assert.ok(text.includes(`  1. docs/workflow.md（sha256:${wfHash}）`), "workflow 条目第 1、哈希正确");
    assert.ok(text.includes(`  2. docs/contracts/kanban-api-v1.md（sha256:${contractHash}）`), "契约条目第 2、哈希正确");
    assert.equal(text.split("docs/contracts/kanban-api-v1.md（sha256:").length, 2, "重复引用去重（恰一条）");
    // ② 单一来源断言：投递文本与编排 `renderDispatchPrompt`（同一 references）渲染**逐字一致**——本层不另写渲染。
    assert.equal(
      text,
      renderDispatchPrompt({ roleId: "A", task }, {
        references: [
          { path: "docs/workflow.md", sha256: wfHash },
          { path: "docs/contracts/kanban-api-v1.md", sha256: contractHash },
        ],
      }),
      "投递文本 = 单一来源渲染（无本地模板——renderDispatchPromptLocal 已删）"
    );
    await h.mgr.stop(null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("G-1/A2-2 契约缺失 ⇒ fail-closed 拒投：如实回执（逐字）+ 系统行含 **未投递**；零入队/零开会话/目标零投递；补齐后重派**同一文本**必须受理（拒投不登记去重键）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1-reject-"));
  const h = makeHarness({ projectRoot: dir });
  try {
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "按契约 docs/contracts/nope-v1.md 实施。";
    const r = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r.ok, false, "契约缺失：派发未受理（fail-closed 拒投）");
    assert.equal(r.message, "派发未受理：引用的契约 docs/contracts/nope-v1.md 不存在——未投递。", "回执逐字（单一来源 message）");
    assert.ok(
      h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note"
        && /引用的契约 docs\/contracts\/nope-v1\.md 不存在/.test(e.event.summary) && e.event.summary.includes("**未投递**")),
      "su 聊天流有如实系统行（含 **未投递**，不静默）"
    );
    await tick(150);
    assert.equal(h.sent.A.length, 0, "目标会话零投递");
    assert.ok(!h.openCalls.includes("A"), "拒投不开目标会话");
    assert.equal(h.roleStates.filter((s) => s.roleId === "A").length, 0, "队列零条目（拒投不入队——队列显示无幽灵行）");

    // su 修正（落盘契约）后重派**同一任务文本**：拒投未登记去重键 ⇒ 本次必须受理（防「先登记后拒投」的键残留误去重）。
    await fs.mkdir(path.join(dir, "docs", "contracts"), { recursive: true });
    const fixedBytes = "# 修正后的契约\n";
    await fs.writeFile(path.join(dir, "docs", "contracts", "nope-v1.md"), fixedBytes, "utf8");
    const r2 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r2.ok, true, "契约补齐后重派同一文本：受理");
    assert.ok(!/去重/.test(r2.message ?? ""), "不是被误去重（键无残留）");
    await tick(150);
    assert.equal(h.sent.A.length, 1, "修正后投递成功（恰一条）");
    assert.ok(h.sent.A[0].includes(`docs/contracts/nope-v1.md（sha256:${sha256(fixedBytes)}）`), "投递文本带修正后契约的必读条目（当刻哈希）");
    await h.mgr.stop(null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("G-1/A2-3 workflow 缺失 ⇒ 降级标注照投（不拒投；块内如实注「本项目未提供 workflow.md」、不指向不在场文件）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1-degrade-"));
  const h = makeHarness({ projectRoot: dir });
  try {
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "按 docs/workflow.md 的步骤表开工。";
    const r = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r.ok, true, "workflow 缺失不拒投（V1 过渡期老项目向后兼容）");
    await tick(150);
    assert.equal(h.sent.A.length, 1, "照常投递");
    const text = h.sent.A[0];
    assert.ok(text.includes("（本项目未提供 workflow.md）"), "如实标注缺失（设计 §四.3 措辞）");
    assert.ok(!text.includes("docs/workflow.md（sha256:"), "缺失行被省略（不指向不在场文件）");
    assert.equal(text, renderDispatchPrompt({ roleId: "A", task }, { workflowMissing: true }), "降级文本 = 单一来源渲染");
    await h.mgr.stop(null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("G-1/A2-4 不误捕：产物路径/普通 docs 路径/目录式 token 不产生引用 ⇒ 不注入必读块，文本 = 单一来源旧格式逐字", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1-nocatch-"));
  const h = makeHarness({ projectRoot: dir });
  try {
    const task = "产出写到 temp/out/report.md 并更新 docs/notes.md（均不在 docs/contracts/ 目录内）。";
    assert.deepEqual(extractDispatchReadPaths(task), [], "提取器不误捕（单一来源；产物/普通 docs/目录式 token）");
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const r = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r.ok, true);
    await tick(150);
    assert.equal(h.sent.A[0], dispatchTemplate(task), "无引用 ⇒ 旧格式逐字（不注入必读块——不重排式的理由）");
    assert.ok(!h.sent.A[0].includes("必读（按序"), "无必读块");
    await h.mgr.stop(null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("G-1/A2-5 哈希定格于派发时刻：排队期间契约变更 ⇒ 已入队条目按旧哈希投递（重试复用同一文本）；送达后同文再派才用新哈希", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g1-freeze-"));
  const h = makeHarness({ projectRoot: dir });
  try {
    await fs.mkdir(path.join(dir, "docs", "contracts"), { recursive: true });
    const contractPath = path.join(dir, "docs", "contracts", "freeze-v1.md");
    await fs.writeFile(contractPath, "C1\n", "utf8");
    const hashC1 = sha256("C1\n");

    await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
    await tick(30);
    await h.mgr.send("A 先忙"); // A busy ⇒ 派发排队
    await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
    await tick(30);
    const task = "读契约 docs/contracts/freeze-v1.md 执行。";
    const r1 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r1.ok, true);
    await tick(120);
    assert.deepEqual(h.sent.A, ["A 先忙"], "A 忙：派发排队中（尚未投递）");

    // 排队期间契约变更（对应「契约变更 ⇒ 调用方重验」的机械信号）；已入队条目按「派发那一刻」的版本投递。
    await fs.writeFile(contractPath, "C2——内容已变更且更长\n", "utf8");
    const hashC2 = sha256("C2——内容已变更且更长\n");
    h.streams.A.push({ kind: "settled", summary: "一轮结束" });
    await tick(200);
    assert.equal(h.sent.A.length, 2, "settled 后按序放行");
    assert.ok(h.sent.A[1].includes(`sha256:${hashC1}`), "已入队条目：定格旧哈希（绑定「派发那一刻的契约版本」）");
    assert.ok(!h.sent.A[1].includes(`sha256:${hashC2}`), "不因文件变更而重算（重试用同一份）");

    // 送达即释放去重窗口：同文再派 ⇒ 新一次投递，使用**当刻**内容哈希。
    const r2 = (await h.dispatchOf("su")!({ roleId: "A", task })) as DispatchReceipt;
    assert.equal(r2.ok, true);
    await tick(120);
    h.streams.A.push({ kind: "settled", summary: "又一轮结束" });
    await tick(200);
    assert.equal(h.sent.A.length, 3, "同文再派送达（返工回路不受必读块影响）");
    assert.ok(h.sent.A[2].includes(`sha256:${hashC2}`), "新派发：当刻内容哈希（新版本地址）");
    await h.mgr.stop(null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("G-1/A2-6 单一来源收口（代码级钉子）：本地副本已删除；session.ts 走编排三件套接线，不内嵌派发模板", async () => {
  const SESS = await fs.readFile(new URL("../../app/desktop/session.ts", import.meta.url), "utf8");
  // 函数定义/调用级判据（注释里保留了对已删副本的登记说明——那是合法的收口记录，不算「两处并存」）。
  assert.ok(!SESS.includes("renderDispatchPromptLocal("), "本地副本 renderDispatchPromptLocal 的**实现/调用**已收口删除（不得两处并存）");
  assert.ok(SESS.includes("extractDispatchReadPaths") && SESS.includes("planDispatchDelivery"), "接线走编排单一来源（提取/判据）");
  assert.ok(!SESS.includes("[派发] 来自"), "session.ts 不再内嵌派发文案模板");
});

// ————————————————— G-2（2026-10-16 客户批准）：W5 恢复桥 / W4 恢复执行 / W1 数据源 / W2 system 投递机 —————————————————

function makeRecoveryStub(): { presenter: ReturnType<typeof createRecoveryConfirmPresenter>; cards: (RecoveryConfirmRequestInput & { id: string })[] } {
  const cards: (RecoveryConfirmRequestInput & { id: string })[] = [];
  const presenter = createRecoveryConfirmPresenter({ present: (r) => cards.push(r), operatorId: "ops" });
  return { presenter, cards };
}

test("G-2/W5 恢复桥：恰 allow:true 才执行（abort-turn 恰一次）；回执三路（工具回执/系统行/投递 su）；取消=未获执行", async () => {
  const stub = makeRecoveryStub();
  const h = makeHarness({ recoveryConfirm: stub.presenter });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const propose = h.proposeRecoveryOf("su");
  assert.ok(typeof propose === "function", "su 会话应注入恢复提议能力（proposeRecovery）");
  assert.equal(h.proposeRecoveryOf("A"), undefined, "普通角色会话不注入（未取过即 undefined）");
  assert.equal(h.roleStatusOf("A"), undefined, "role_status 数据源同判据（仅 su）");
  assert.equal(h.sessionTailOf("A"), undefined, "session_tail 数据源同判据（仅 su）");
  // —— 推卡：字段逐字/随带（U1 消费面形状）——
  const pending = propose!({ roleId: "A", action: "abort-turn", evidence: "role_status：A 583s 无 settled", reason: "疑似卡死" });
  await tick(20);
  assert.equal(stub.cards.length, 1, "校验通过 ⇒ 恰推一张确认卡");
  assert.equal(stub.cards[0].roleId, "A", "目标角色");
  assert.equal(stub.cards[0].action, "abort-turn", "动作");
  assert.equal(stub.cards[0].evidence, "role_status：A 583s 无 settled", "证据逐字");
  assert.equal(stub.cards[0].requestedBy, "su", "提议者（呈现「由 su 提议」）");
  assert.equal(stub.cards[0].projectRoot, "/proj", "随带 projectRoot（渲染侧视图过滤）");
  assert.equal(stub.cards[0].runtime, "demo", "随带 runtime");
  // 恰 allow:true ⇒ 执行（abort 恰一次）＋ 回执。
  assert.equal(stub.presenter.respond({ id: stub.cards[0].id, allow: true }).ok, true);
  const receipt = (await pending)!;
  assert.equal(receipt.outcome, "executed", "恰 allow:true 才 executed");
  assert.equal(h.aborts.A, 1, "动作恰执行一次");
  assert.equal(receipt.operatorId, "ops", "确认者标识（回执字段）");
  await tick(150);
  assert.ok(h.sent.su.some((t) => t.startsWith("[系统·恢复]") && t.includes("abort-turn") && t.includes("A")), "回执经既有投递机投回 su（kind:system，文案＝编排单一来源）");
  assert.ok(h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note" && /恢复回执/.test(e.event.summary)), "UI 系统行如实");
  // 同 id 迟到回包 → expired（幂等：恰执行一次）。
  assert.equal(h.aborts.A, 1, "总数仍 1");
  // —— 取消 = 未获执行（fail-closed）——
  const pending2 = propose!({ roleId: "A", action: "abort-turn", evidence: "证据二" });
  await tick(20);
  stub.presenter.respond({ id: stub.cards[1].id, allow: false });
  const receipt2 = (await pending2)!;
  assert.equal(receipt2.outcome, "declined", "拒绝 ⇒ declined（未获执行）");
  assert.equal(h.aborts.A, 1, "未获执行：动作**没有**发生");
  await h.mgr.stop(null);
});

// 2026-10-20（客户总原则「我勾选了替我决策就不用我来管了」）：决策开关开启 ⇒ 恢复提议**不呈现客户卡**、
// 直接执行并如实回执＋Lead 系统行（自动执行 ≠ 客户逐项批准）；校验不过 ⇒ 自动拒绝、不弹卡。
// 开关关闭 ⇒ 旧行为逐字不变（卡仍在、未确认零执行）。
test("2026-10-20 proposeRecovery 自动决策：开关开 ⇒ 不弹卡、直接执行、receipt 如实；开关关 ⇒ 卡仍在、未确认零执行", async () => {
  const stub = makeRecoveryStub();
  let auto = true;
  const h = makeHarness({ recoveryConfirm: stub.presenter, autoDecisionEnabled: () => auto });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const propose = h.proposeRecoveryOf("su")!;

  // —— 开关开：直接执行，零客户卡 ——
  const receipt = (await propose({ roleId: "A", action: "abort-turn", evidence: "role_status：A 583s 无 settled", reason: "疑似卡死" }))!;
  assert.equal(receipt.outcome, "executed", "开关开 ⇒ 直接执行（receipt 如实）");
  assert.equal(h.aborts.A, 1, "abort 恰一次");
  assert.equal(stub.cards.length, 0, "**不呈现** recovery-confirm 客户卡");
  await tick(150);
  assert.ok(
    h.sent.su.some((t) => t.startsWith("[系统·恢复]") && t.includes("自动执行") && t.includes("≠ 客户逐项批准")),
    "Lead 系统行：自动执行 ≠ 客户批准",
  );
  // 第一条 system 投出即把 su 带入一轮；settle 后回执照既有投递机如实投出（排队不丢）。
  h.streams.su.push({ kind: "settled", summary: "su 一轮结束" });
  await tick(150);
  assert.ok(
    h.sent.su.some((t) => t.startsWith("[系统·恢复]") && t.includes("abort-turn")),
    "回执照既有投递机如实投回",
  );

  // —— 判断不可用/证据不足：自动拒绝回投提议角色，不弹卡、零执行 ——
  const bad = (await propose({ roleId: "A", action: "abort-turn", evidence: "   " }))!;
  assert.equal(bad.outcome, "error", "证据不足 ⇒ error（如实）");
  assert.equal(stub.cards.length, 0, "证据不足 ⇒ 不弹卡");
  assert.equal(h.aborts.A, 1, "零执行");
  assert.ok(
    h.envelopes.some((e) => e.roleId === "su" && e.event.kind === "message" && /未受理/.test(e.event.summary)),
    "自动拒绝回投提议角色（系统行）",
  );

  // —— 开关关：卡仍在、未确认零执行（旧行为逐字不变） ——
  auto = false;
  const pending = propose({ roleId: "A", action: "abort-turn", evidence: "证据二" });
  await tick(20);
  assert.equal(stub.cards.length, 1, "开关关 ⇒ 卡照旧呈现");
  stub.presenter.respond({ id: stub.cards[0].id, allow: false });
  const declined = (await pending)!;
  assert.equal(declined.outcome, "declined", "未确认 ⇒ 零执行（fail-closed）");
  assert.equal(h.aborts.A, 1, "动作没有发生");
  await h.mgr.stop(null);
});

test("G-2/W5 恢复桥 fail-closed：通道未接线 ⇒ declined；非法载荷/内置角色 ⇒ error 且**不推卡**；拒绝式推达失败 ⇒ declined", async () => {
  // —— 通道未接线（deps 缺省）——
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const propose = h.proposeRecoveryOf("su")!;
  const r1 = (await propose({ roleId: "A", action: "rebuild-session", evidence: "e" }))!;
  assert.equal(r1.outcome, "declined", "通道未接线 ⇒ 未获执行（fail-closed，绝不「没人问就执行」）");
  assert.match(r1.message ?? "", /未接线|未获执行/, "如实文案");
  // —— 非法载荷（模型输入不可信：全量重校验）——
  const r2 = (await propose({ roleId: "su", action: "abort-turn", evidence: "e" }))!;
  assert.equal(r2.outcome, "error", "内置治理角色目标 ⇒ error");
  assert.match(r2.message ?? "", /内置治理角色|未受理/, "如实原因");
  const r3 = (await propose({ roleId: "A", action: "bad-action" as never, evidence: "e" }))!;
  assert.equal(r3.outcome, "error", "action 非枚举 ⇒ error");
  const r4 = (await propose({ roleId: "A", action: "abort-turn", evidence: "   " }))!;
  assert.equal(r4.outcome, "error", "evidence 空白 ⇒ error（无证据不提议）");
  const r5 = (await propose({ roleId: "不存在", action: "abort-turn", evidence: "e" }))!;
  assert.equal(r5.outcome, "error", "非本项目角色 ⇒ error");
  // —— 推达失败（窗口已关等）⇒ 未获执行 ——
  const stub = makeRecoveryStub();
  const h2 = makeHarness({
    recoveryConfirm: createRecoveryConfirmPresenter({
      present: () => { throw new Error("窗口已关闭"); },
      operatorId: "ops",
    }),
  });
  await h2.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h2.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const r6 = (await h2.proposeRecoveryOf("su")!({ roleId: "A", action: "abort-turn", evidence: "e" }))!;
  assert.equal(r6.outcome, "declined", "推达失败 ⇒ 未获执行（fail-closed）");
  assert.equal(h2.aborts.A ?? 0, 0, "零执行（从未 abort）");
  assert.ok(stub.cards.length === 0);
  await h.mgr.stop(null);
  await h2.mgr.stop(null);
});

test("G-2/W5 桥三态：运行时不支持 ⇒ outcome=unsupported（绝不假装已执行）；rebuild 在跑 ⇒ outcome=error（前提不满足）", async () => {
  const stub = makeRecoveryStub();
  const h = makeHarness({ recoveryConfirm: stub.presenter, unsupportedAbort: ["B"] });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "B", runtime: "demo" });
  await tick(30);
  const propose = h.proposeRecoveryOf("su")!;
  const pending = propose({ roleId: "B", action: "abort-turn", evidence: "证据" });
  await tick(20);
  stub.presenter.respond({ id: stub.cards[0].id, allow: true });
  const receipt = (await pending)!;
  assert.equal(receipt.outcome, "unsupported", "三态如实：unsupported ≠ executed");
  assert.match(receipt.message ?? "", /不支持/, "原因进回执");
  // rebuild 遇在跑轮次拒绝 ⇒ error（设计 §九：前提不满足）。
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const release = h.hangNext("A");
  const busy = h.mgr.send("占住 A", undefined, { roleId: "A" });
  await tick(20);
  const pending2 = propose({ roleId: "A", action: "rebuild-session", evidence: "证据2" });
  await tick(20);
  stub.presenter.respond({ id: stub.cards[1].id, allow: true });
  const receipt2 = (await pending2)!;
  assert.equal(receipt2.outcome, "error", "在跑轮次不打断 ⇒ error（未执行，如实原因）");
  assert.match(receipt2.message ?? "", /在跑|不打断/, "原因进回执");
  release();
  await busy;
  await h.mgr.stop(null);
});

test("G-2/W4：rebuildSession——在跑轮次不打断（busy 拒绝）；空闲重建（保留回放；drain 续投）；redeliverNudge 条目不存在如实/触发重试", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  // —— busy ⇒ 拒绝（不打断）——
  const release = h.hangNext("A");
  const busy = h.mgr.send("占住 A");
  await tick(20);
  const denied = await h.mgr.rebuildSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(denied.ok, false, "在跑轮次不打断（busy ⇒ 拒绝并如实回执）");
  assert.match(denied.error ?? "", /在跑|不打断/, "如实原因");
  release();
  await busy;
  h.streams.A.push({ kind: "settled", summary: "结束" });
  await tick(150);
  // —— 空闲重建 ——
  const rebuilt = await h.mgr.rebuildSession({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  assert.equal(rebuilt.ok, true, "空闲 ⇒ dispose＋重开");
  assert.equal(h.openCalls.filter((r) => r === "A").length, 2, "重开 = 再开一次会话（保留 ANS 回放）");
  assert.ok(h.envelopes.some((e) => e.roleId === "A" && e.event.kind === "message" && /已按要求（客户确认的恢复动作）重建/.test(e.event.summary)), "UI 行如实");
  // —— redeliverNudge：条目不存在 ⇒ 如实；存在 ⇒ 触发 drain 投出 ——
  const missing = await h.mgr.redeliverNudge({ projectRoot: "/proj", roleId: "A", runtime: "demo" }, "不存在");
  assert.equal(missing.ok, false, "条目不在排队中 ⇒ 如实回执");
  assert.match(missing.message, /不在排队中/, "未触发重试");
  // A 忙时向 A 派发（进队列）——再用 redeliverNudge 触发即时重试。
  const release2 = h.hangNext("A");
  const busy2 = h.mgr.send("再占住");
  await tick(20);
  const dispatch = h.dispatchOf("su");
  // su 会话未开：先开 su 拿派发能力（打开不动 A）。
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  await h.dispatchOf("su")!({ roleId: "A", task: "排队活" });
  await tick(60);
  const qView = h.roleStates.filter((s) => s.roleId === "A").at(-1);
  const queuedId = (qView as unknown as { queue?: { id: string }[] } | undefined)?.queue?.[0]?.id ?? "";
  const nudgeQueued = await h.mgr.redeliverNudge({ projectRoot: "/proj", roleId: "A", runtime: "demo" }, queuedId);
  assert.equal(nudgeQueued.ok, true, "触发队列重试（目标忙 ⇒ 保留待重试——如实）");
  assert.match(nudgeQueued.message, /仍在队列|保留待重试/, "不把「已触发重试」写成「已投出」");
  release2();
  await busy2;
  h.streams.A.push({ kind: "settled", summary: "结束" });
  await tick(150);
  assert.ok(h.sent.A.includes(dispatchTemplate("排队活")), "settled 后按既有语义投出（redeliver 不新造投递路径）");
  await h.mgr.stop(null);
});

test("G-2/W1 数据源：role_status 结构化文本（busy/队列/最近一轮/看护行）；session_tail 无历史如实；两工具**纯读**（前后快照逐字段一致）", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const roleStatus = h.roleStatusOf("su")!;
  const sessionTail = h.sessionTailOf("su")!;
  const s1 = h.mgr.send("干活");
  await tick(20);
  const busyView = (await roleStatus({ roleId: "A" }))!;
  assert.equal(busyView.ok, true, "纯读成功");
  assert.ok((busyView.text ?? "").includes("角色 A") && /busy=true/.test(busyView.text ?? ""), "角色行含 busy 事实");
  assert.ok((busyView.text ?? "").includes("su："), "su 概览行");
  h.streams.A.push({ kind: "settled", summary: "结束", detail: { outcome: "completed" } });
  await s1;
  await tick(150);
  const afterView = (await roleStatus({}))!;
  assert.ok(/最近一轮：completed @/.test(afterView.text ?? ""), "最近一轮（lastTurn 小状态）");
  // 队列明细：忙时入队的客户消息。
  await h.mgr.send("排队甲");
  const queuedView = (await roleStatus({ roleId: "su" }))!;
  assert.ok(/队列 \d/.test(queuedView.text ?? ""), "队列行");
  // session_tail：本项目角色从无会话文件 ⇒ 如实「无会话历史」（不抛不猜）。
  const tail = (await sessionTail({ roleId: "A", lines: 10 }))!;
  assert.equal(tail.ok, false, "无历史 ⇒ ok:false + 如实 message");
  assert.match(tail.message ?? "", /无会话历史|读取未完成/, "如实文本");
  // 纯读保证：只读调用的直接前后快照逐字段一致（无副作用）。先稳定到空闲，再夹住两次只读调用。
  await tick(200);
  const beforeReads = JSON.stringify({ snap: h.mgr.watchdogSnapshot("/proj"), last: h.mgr.lastTurnOf("/proj", "A", "demo") ?? null });
  await roleStatus({ roleId: "A" });
  await roleStatus({ includeDiagnostics: true });
  await sessionTail({ roleId: "A", lines: 5 });
  const afterReads = JSON.stringify({ snap: h.mgr.watchdogSnapshot("/proj"), last: h.mgr.lastTurnOf("/proj", "A", "demo") ?? null });
  assert.equal(afterReads, beforeReads, "role_status/session_tail 调用不改任何运行态（纯读）");
  await h.mgr.stop(null);
});

test("G-2/W1 role_status 呈现消歧（实机反馈 2026-10-17）：busy 时「当前轮：进行中」与「上一轮终局」分行、语义分开", async () => {
  const h = makeHarness();
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await h.mgr.open({ projectRoot: "/proj", roleId: "A", runtime: "demo" });
  await tick(30);
  const roleStatus = h.roleStatusOf("su")!;

  // 第一轮：正常结束但终局为 timed_out（成为「上一轮」历史），随后再开一轮使 busy=true。
  const first = h.mgr.send("第一轮");
  await tick(20);
  h.streams.A.push({ kind: "settled", summary: "结束", detail: { outcome: "timed_out" } });
  await first;
  await tick(150);
  const second = h.mgr.send("第二轮");
  await tick(20);

  const view = (await roleStatus({ roleId: "A" }))!;
  assert.equal(view.ok, true);
  const text = view.text ?? "";
  assert.match(text, /当前轮：进行中（已耗 .+ \/ 看护检查时限 .+；turnId=/, "busy 且有起始时刻 ⇒ 当前轮事实行");
  assert.ok(text.includes("1 小时最后兜底"), "当前轮行注明「1 小时最后兜底」（2026-10-17 到点检查语义）");
  assert.equal(text.includes("硬超时"), false, "不再使用「硬超时」话术");
  assert.match(
    text,
    /上一轮终局：timed_out @ .+（不表示当前轮；该角色近 15 分钟 failed\/timed_out 计 \d+）/,
    "busy ⇒ 历史终局明确标「上一轮终局」「不表示当前轮」，历史统计保留",
  );
  assert.equal(/最近一轮：timed_out/.test(text), false, "busy 时不得把历史终局写成「最近一轮」（语义误导）");
  const lines = text.split("\n");
  const currentLine = lines.find((line) => line.includes("当前轮：进行中")) ?? "";
  const lastLine = lines.find((line) => line.includes("上一轮终局")) ?? "";
  assert.ok(currentLine !== "" && lastLine !== "" && currentLine !== lastLine, "两个事实必须分行呈现");
  assert.equal(currentLine.includes("timed_out"), false, "当前轮行不混入历史终局");
  assert.equal(lastLine.includes("进行中"), false, "上一轮终局行不混入当前轮状态");

  // 收尾：第二轮结束，避免残留忙态影响后续。
  h.streams.A.push({ kind: "settled", summary: "结束", detail: { outcome: "completed" } });
  await second;
  await tick(150);
  await h.mgr.stop(null);
});

test("G-2/W2：system 投递失败 ⇒ 如实系统行＋放回队首保留（未丢弃）；下次时机自动重试成功", async () => {
  const h = makeHarness({ failSends: { su: 1 } });
  await h.mgr.open({ projectRoot: "/proj", roleId: "su", runtime: "demo" });
  await tick(30);
  h.mgr.watchdogDeliver("/proj", { text: "[系统·看护] 失败重试钉子：角色「A」。", summary: "系统·看护 · 钉子", dedupKey: "watchdog\u0000/proj\u0000retry\u00000" });
  await tick(150);
  assert.ok(
    h.envelopes.some((e) => e.event.kind === "message" && (e.event.detail as { source?: string } | undefined)?.source === "delivery-note" && /系统消息投递失败/.test(e.event.summary)),
    "失败如实系统行（绝不静默丢）",
  );
  const q = h.roleStates.filter((s) => s.roleId === "su").at(-1) as unknown as { queue: { kind: string; summary: string }[] };
  assert.equal(q.queue.length, 1, "放回队首保留（summary 还原）");
  assert.equal(q.queue[0].kind, "system", "第四类 kind 保留");
  // 下次时机（settled 触发的放行）→ 成功送达。
  h.streams.su.push({ kind: "settled", summary: "时机" });
  await tick(200);
  assert.ok(h.sent.su.includes("[系统·看护] 失败重试钉子：角色「A」。"), "重试成功送达（同一份文本，不重渲染）");
  await h.mgr.stop(null);
});

// —————————————— G-4/I3（2026-10-16 客户批准）：技能安装/卸载 handler ——————————————
// 设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §3.2/§3.3/§4.3/§4.4/§6.4；
// PM 裁定④（轮次护栏：仅客户消息发起的轮次可执行）与⑤（O-1 指纹集扩展——在 boundary-refresh.test.ts）。
// 本组覆盖：「注入才注册」；护栏（客户直聊/排队客户消息放行；系统投递轮次/无轮次拒绝）；校验全分支（全部
// 零副作用）；idle⇒rebuilt / 在跑⇒next-session 不打断 / 未开会话⇒next-session；重建失败⇒rebuild-failed；
// `[系统·安装]` 系统行（kind:"system" 第四类真投递、不可撤回、如实二分）；卸载「先改登记再卸载」。

/** G-4 夹具：真实临时项目目录（handler 读真盘：登记/内容件/digest）。 */
async function writeSkillFixture(dir: string, name: string, roles: string, status = "installed", content = "技能正文\n"): Promise<void> {
  const skillDir = path.join(dir, "docs", "skills", name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "install.md"), `# 安装登记：${name}\n- 用途：演示用途\n- 适用角色：${roles}\n- 状态：${status}\n- 安装日期：2026-10-16\n`, "utf8");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
}

async function makeSkillProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g4-"));
  await writeSkillFixture(dir, "lint", "A");
  return dir;
}

test("G-4/I3 注入才注册：仅 su 会话拿到 install_skill / uninstall_skill 能力（项目角色零注入、零感知）", async () => {
  const dir = await makeSkillProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  assert.equal(typeof h.installSkillOf("su"), "function", "su 会话注入 installSkill");
  assert.equal(typeof h.uninstallSkillOf("su"), "function", "su 会话注入 uninstallSkill");
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  assert.equal(h.installSkillOf("A"), undefined, "项目角色不注入（未注入 ⇒ 工具不注册）");
  assert.equal(h.uninstallSkillOf("A"), undefined, "项目角色不注入 uninstallSkill");
  await h.mgr.stop(null);
});

test("G-4/I3 安装成功（idle ⇒ rebuilt）：回执冻形/运行期 digest；[系统·安装] 经第四类通道真投递给 su（不可撤回）；目标会话已重建", async () => {
  const dir = await makeSkillProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  const opensA = () => h.openCalls.filter((r) => r === "A").length;
  assert.equal(opensA(), 1);

  // 客户消息发起的轮次（su 空闲 ⇒ 直接 send；显式目标 su——A 后开为活动角色）。
  const r0 = await h.mgr.send("给 A 装技能 lint", undefined, { roleId: "su" });
  assert.equal(r0.ok, true);

  const install = h.installSkillOf("su")!;
  const receipt = await install({ roleId: "A", name: "lint" });
  assert.equal(receipt.ok, true, "安装成功");
  if (receipt.ok) {
    assert.equal(receipt.action, "installed");
    assert.equal(receipt.roleId, "A");
    assert.equal(receipt.name, "lint");
    assert.equal(receipt.path, "docs/skills/lint/SKILL.md", "path＝项目相对 SKILL.md");
    assert.equal(
      receipt.digest,
      createHash("sha256").update(await fs.readFile(path.join(dir, "docs", "skills", "lint", "SKILL.md"))).digest("hex"),
      "digest＝当刻字节 sha256（与渲染器/finalize 同算法）",
    );
    assert.equal(receipt.effective, "rebuilt", "idle 目标 ⇒ 已重建、即刻生效");
  }
  assert.equal(opensA(), 2, "目标会话确已重建（即刻生效）");

  // 系统行：su 正忙 ⇒ 先入队（kind:"system"）；不可撤回；settle 后经投递机真投递给 su。
  const suState = h.roleStates.filter((s) => s.roleId === "su").at(-1) as unknown as { queue: { kind: string; summary: string; id: string; full: string }[] };
  const row = suState.queue.find((q) => q.kind === "system");
  assert.ok(row && row.summary.includes("系统·安装"), "队列快照含 [系统·安装] 行（kind:system）");
  assert.ok(row!.full.startsWith("[系统·安装] ") && row!.full.includes("已安装技能「lint」") && row!.full.includes("角色「A」"), "入队即定格的正文如实：动作/技能名/角色");
  const w = h.mgr.withdraw({ projectRoot: dir, roleId: "su", runtime: "demo" }, row!.id);
  assert.equal(w.ok, false, "system 行不可撤回（治理流只读面）");
  assert.ok(/不是客户消息/.test(w.error ?? ""), "驳回文案如实（与撤回判据同口径）");
  h.streams.su.push({ kind: "settled", summary: "一轮结束" });
  await tick(300);
  const rowText = h.sent.su.find((t) => t.startsWith("[系统·安装] "));
  assert.ok(rowText, "settle 后经 kind:system 通道真投递给 su（成功后仍未撤回）");
  assert.ok(rowText!.includes("docs/skills/lint/SKILL.md") && rowText!.includes("sha256 "), "系统行含路径与 digest 摘要");
  if (receipt.ok) assert.ok(rowText!.includes(receipt.digest.slice(0, 12)), "系统行 digest＝回执 digest（前 12 位）");
  assert.ok(rowText!.includes("已重建该角色会话、即刻生效"), "生效态如实");
  await h.mgr.stop(null);
});

test("G-4/I3 校验分支（全部拒绝⇒零副作用）：role-not-found（su 自身/未知）/ not-registered（缺件、未生效态、内容缺失）/ role-not-listed / registration-unchanged", async () => {
  const dir = await makeSkillProject();
  await writeSkillFixture(dir, "forB", "B"); // 只列 B
  await writeSkillFixture(dir, "off", "A", "uninstalled"); // 列 A 但已停用
  // 内容件缺失件（install.md 在、SKILL.md 缺）。
  await fs.mkdir(path.join(dir, "docs", "skills", "empty"), { recursive: true });
  await fs.writeFile(path.join(dir, "docs", "skills", "empty", "install.md"), "# 安装登记：empty\n- 用途：演示\n- 适用角色：A\n- 状态：installed\n- 安装日期：2026-10-16\n", "utf8");

  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.send("装技能");
  const install = h.installSkillOf("su")!;
  const uninstall = h.uninstallSkillOf("su")!;
  const expectFail = (r: InstallSkillReceipt, reason: string, frag: string): void => {
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, reason, `reason=${reason}`);
      assert.ok(r.message.includes(frag), `${reason} 文案如实：「${frag}」∈「${r.message}」`);
    }
  };
  expectFail(await install({ roleId: "su", name: "lint" }), "role-not-found", "角色「su」不是本项目项目角色（或为内置治理角色）——未执行。");
  expectFail(await install({ roleId: "ghost", name: "lint" }), "role-not-found", "角色「ghost」不是本项目项目角色（或为内置治理角色）——未执行。");
  expectFail(await install({ roleId: "A", name: "nope" }), "not-registered", "技能未登记：docs/skills/nope/install.md 不存在——先落盘再安装；未执行。");
  expectFail(await install({ roleId: "A", name: "forB" }), "role-not-listed", "登记中未包含角色「A」——未执行；如确要安装请先更新登记。");
  expectFail(await install({ roleId: "A", name: "off" }), "not-registered", "状态为「uninstalled」——先改登记再安装；未执行。");
  expectFail(await install({ roleId: "A", name: "empty" }), "not-registered", "技能内容缺失：docs/skills/empty/SKILL.md");
  expectFail(await uninstall({ roleId: "A", name: "lint" }), "registration-unchanged", "登记仍含角色「A」——先改登记再卸载；未执行。");
  expectFail(await uninstall({ roleId: "A", name: "nope" }), "not-registered", "没有可撤销的登记；未执行。");
  // 零副作用：目标从未开会话/重建；无任何 [系统·安装] 行。
  assert.equal(h.openCalls.filter((r) => r === "A").length, 0, "拒绝零副作用：未开目标会话");
  assert.ok(!h.roleStates.some((s) => s.summaries.some((x) => x.includes("系统·安装"))), "拒绝不投系统行");
  await h.mgr.stop(null);
});

test("G-4/I3 裁定④ 轮次护栏：无轮次/系统投递轮次 ⇒ not-customer-turn（零副作用）；客户直聊与排队客户消息轮次 ⇒ 放行到校验层", async () => {
  const dir = await makeSkillProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  const install = h.installSkillOf("su")!;
  const uninstall = h.uninstallSkillOf("su")!;

  // ① 无在跑轮次（防御）⇒ 拒绝（PM 冻结文案逐字）。
  const r1 = await install({ roleId: "A", name: "lint" });
  assert.equal(r1.ok, false);
  if (!r1.ok) {
    assert.equal(r1.reason, "not-customer-turn");
    assert.equal(r1.message, "本动作仅可在客户消息发起的轮次执行——未执行。");
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 0, "零副作用：目标未开会话");

  // ② 系统投递（[系统·看护] 经第四类通道打开的一轮）⇒ 拒绝。
  h.mgr.watchdogDeliver(dir, { text: "[系统·看护] 测试告警：角色「A」。", summary: "系统·看护 · 测试", dedupKey: "watchdog\u0000test\u0000turn-guard" });
  await tick(120);
  const r2 = await install({ roleId: "A", name: "lint" });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.reason, "not-customer-turn", "非客户触发轮次（system）拒绝");
  const r2u = await uninstall({ roleId: "A", name: "lint" });
  assert.equal(r2u.ok, false);
  if (!r2u.ok) assert.equal(r2u.reason, "not-customer-turn", "护栏对两工具同判据");
  assert.equal(h.openCalls.filter((r) => r === "A").length, 0, "拒绝零副作用（仍未开目标）");
  h.streams.su.push({ kind: "settled", summary: "一轮结束" });
  await tick(150);

  // ③ 客户直聊轮次（直接 send）⇒ 放行（拒绝原因走到校验层，而非护栏）。
  const r3 = await h.mgr.send("装技能");
  assert.equal(r3.ok, true);
  const r4 = await install({ roleId: "A", name: "nope" });
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.equal(r4.reason, "not-registered", "客户轮次放行到校验层");

  // ④ 排队客户消息投出的一轮（kind:"message"）⇒ 放行。
  const q1 = await h.mgr.send("一");
  assert.equal(q1.queued, true, "su 忙 ⇒ 客户消息入队（kind:message）");
  h.streams.su.push({ kind: "settled", summary: "一轮结束" });
  await tick(300);
  assert.ok(h.sent.su.includes("一"), "settle 后队列放行：客户消息投出、su 在跑 message 轮次");
  const r6 = await uninstall({ roleId: "A", name: "nope" });
  assert.equal(r6.ok, false);
  if (!r6.ok) assert.equal(r6.reason, "not-registered", "排队客户消息轮次（kind:message）放行到校验层");
  await h.mgr.stop(null);
});

test("G-4/I3 生效态三态如实：未开会话 ⇒ next-session＋note（不自动开目标会话）；在跑 ⇒ next-session（不打断）", async () => {
  const dir = await makeSkillProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.send("给 A 装 lint");
  const install = h.installSkillOf("su")!;

  // ① 目标未开会话 ⇒ next-session（无旧上下文可重建）＋如实 note；绝不自动开目标会话。
  const r1 = await install({ roleId: "A", name: "lint" });
  assert.equal(r1.ok, true, "未开会话 = 无需打断、登记即刻对后续会话生效（ok:true 延迟态）");
  if (r1.ok) {
    assert.equal(r1.effective, "next-session");
    assert.ok((r1.note ?? "").includes("没有打开的会话"), "note 如实说明「未开会话」而非「在跑轮次」");
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 0, "不自动开目标会话（激活≠开户）");
  h.streams.su.push({ kind: "settled", summary: "结束" });
  await tick(200);
  h.streams.su.push({ kind: "settled", summary: "系统行轮次结束" }); // （① 的系统行投出后收尾）
  await tick(150);

  // ② 目标在跑轮次 ⇒ next-session：不打断、目标不重建。
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  const release = h.hangNext("A");
  void h.mgr.send("长任务", undefined, { roleId: "A" });
  await tick(30);
  const rS = await h.mgr.send("装 lint", undefined, { roleId: "su" });
  assert.equal(rS.ok, true);
  const r2 = await install({ roleId: "A", name: "lint" });
  assert.equal(r2.ok, true, "在跑 = 如实延迟态（不是错误）");
  if (r2.ok) {
    assert.equal(r2.effective, "next-session");
    assert.equal(r2.note, undefined, "在跑延迟不另附 note（生效文案由工具层按 effective 渲染）");
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 1, "在跑不打断：目标会话未重建");
  release();
  await tick(60);
  await h.mgr.stop(null);
});

test("G-4/I3 重建失败 ⇒ rebuild-failed（登记仍在、未假装已生效）；不投 [系统·安装] 行", async () => {
  const dir = await makeSkillProject();
  const h = makeHarness({ projectRoot: dir, failOpensAfter: { A: 1 } });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("装", undefined, { roleId: "su" });
  const install = h.installSkillOf("su")!;
  const receipt = await install({ roleId: "A", name: "lint" });
  assert.equal(receipt.ok, false, "重开失败 ⇒ 不假装已生效");
  if (!receipt.ok) {
    assert.equal(receipt.reason, "rebuild-failed");
    assert.ok(receipt.message.includes("重建") && receipt.message.includes("登记仍在"), "如实：登记仍在、会话未重建");
    assert.ok(receipt.message.includes("会话开启失败"), "原因原文如实（不吞）");
  }
  assert.ok(!h.roleStates.some((s) => s.summaries.some((x) => x.includes("系统·安装"))), "失败不投 [系统·安装] 行（零副作用）");
  await h.mgr.stop(null);
});

test("G-4/I3 卸载成功（先改登记再卸载 ⇒ rebuilt）：系统行如实二分「效果已撤／文件保留」；SKILL.md 文件本体保留", async () => {
  const dir = await makeSkillProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("卸载 lint", undefined, { roleId: "su" });
  // 先改登记：把 A 从适用角色移除（普通 edit——落盘永远由 su 侧完成，工具不写盘）。
  await fs.writeFile(path.join(dir, "docs", "skills", "lint", "install.md"), "# 安装登记：lint\n- 用途：演示用途\n- 适用角色：B\n- 状态：installed\n- 安装日期：2026-10-16\n", "utf8");
  const uninstall = h.uninstallSkillOf("su")!;
  const receipt = await uninstall({ roleId: "A", name: "lint" });
  assert.equal(receipt.ok, true, "登记确已撤销 ⇒ 卸载受理");
  if (receipt.ok) {
    assert.equal(receipt.action, "uninstalled");
    assert.equal(receipt.path, "docs/skills/lint/SKILL.md");
    assert.equal(receipt.digest.length, 64, "digest＝当刻字节 sha256");
    assert.equal(receipt.effective, "rebuilt");
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 2, "登记已撤 ⇒ 目标会话重建（新会话不再注入）");
  assert.ok((await fs.readFile(path.join(dir, "docs", "skills", "lint", "SKILL.md"), "utf8")).includes("技能正文"), "文件保留：SKILL.md 本体未删（工具不写盘）");
  h.streams.su.push({ kind: "settled", summary: "结束" });
  await tick(300);
  const row = h.sent.su.find((t) => t.startsWith("[系统·安装] "));
  assert.ok(row, "卸载同样经第四类通道投 [系统·安装] 行");
  assert.ok(row!.includes("已卸载技能「lint」") && row!.includes("效果已撤，文件保留于"), "如实二分陈述（效果已撤／文件保留）");
  await h.mgr.stop(null);
});

// —————————————— G-4 V2（2026-10-16 客户批准）：外来 MCP 安装/卸载 handler ——————————————
// 与技能组**逐字同构**（护栏/校验/三态/系统行同款）；仅校验面＝MCP 声明（`docs/mcp/<name>.md`，运行时核心
// `readMcpDeclaration` 单一来源）与诚实面（门禁之外执行＝能力级授予，**非逐调用受审**）不同。夹具走真实
// 临时目录（读取器读真盘）。

/** G-4 V2 夹具：落一条 MCP 声明（`docs/mcp/<name>.md`；七键格式沿运行时核心读取器）。 */
async function writeMcpFixture(dir: string, name: string, roles: string, status = "installed"): Promise<void> {
  await fs.mkdir(path.join(dir, "docs", "mcp"), { recursive: true });
  await fs.writeFile(path.join(dir, "docs", "mcp", `${name}.md`), `# MCP 声明：${name}\n- 用途：演示用途\n- 启动：node\n- 适用角色：${roles}\n- 状态：${status}\n- 安装日期：2026-10-16\n`, "utf8");
}

async function makeMcpProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-g4mcp-"));
  await writeMcpFixture(dir, "fetch", "A");
  return dir;
}

test("G-4 V2 注入才注册：仅 su 会话拿到 install_mcp / uninstall_mcp 能力（项目角色零注入）", async () => {
  const dir = await makeMcpProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  assert.equal(typeof h.installMcpOf("su"), "function", "su 会话注入 installMcp");
  assert.equal(typeof h.uninstallMcpOf("su"), "function", "su 会话注入 uninstallMcp");
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  assert.equal(h.installMcpOf("A"), undefined, "项目角色不注入（未注入 ⇒ 工具不注册）");
  assert.equal(h.uninstallMcpOf("A"), undefined);
  await h.mgr.stop(null);
});

test("G-4 V2 安装成功（idle ⇒ rebuilt）：回执冻形/声明文件 digest；[系统·安装] 系统行含诚实面（能力级授予，非逐调用受审）并真投递给 su", async () => {
  const dir = await makeMcpProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  const opensA = () => h.openCalls.filter((r) => r === "A").length;
  assert.equal(opensA(), 1);
  await h.mgr.send("给 A 装 MCP fetch", undefined, { roleId: "su" });

  const receipt = await h.installMcpOf("su")!({ roleId: "A", name: "fetch" });
  assert.equal(receipt.ok, true, "安装成功");
  if (receipt.ok) {
    assert.equal(receipt.action, "installed");
    assert.equal(receipt.roleId, "A");
    assert.equal(receipt.name, "fetch");
    assert.equal(receipt.path, "docs/mcp/fetch.md", "path＝声明文件（项目相对）");
    assert.equal(
      receipt.digest,
      createHash("sha256").update(await fs.readFile(path.join(dir, "docs", "mcp", "fetch.md"))).digest("hex"),
      "digest＝声明文件当刻字节 sha256（测试侧独立复算）",
    );
    assert.equal(receipt.effective, "rebuilt", "idle 目标 ⇒ 已重建、即刻生效");
  }
  assert.equal(opensA(), 2, "目标会话确已重建");

  h.streams.su.push({ kind: "settled", summary: "一轮结束" });
  await tick(300);
  const row = h.sent.su.find((t) => t.startsWith("[系统·安装] ") && t.includes("MCP「fetch」"));
  assert.ok(row, "settle 后经 kind:system 通道真投递给 su");
  assert.ok(row!.includes("docs/mcp/fetch.md") && row!.includes("sha256 "), "含声明路径与 digest 摘要");
  assert.ok(row!.includes("能力级授予，非逐调用受审"), "诚实面在系统行如实（不得宣称逐调用受审）");
  if (receipt.ok) assert.ok(row!.includes(receipt.digest.slice(0, 12)), "digest 与回执一致（前 12 位）");
  await h.mgr.stop(null);
});

test("G-4 V2 校验分支（全部拒绝⇒零副作用）：role-not-found（su 自身/未知）/ not-registered（缺声明、保留名、坏名、未生效态）/ role-not-listed / registration-unchanged", async () => {
  const dir = await makeMcpProject();
  await writeMcpFixture(dir, "onlyB", "B"); // 只列 B
  await writeMcpFixture(dir, "off", "A", "uninstalled"); // 列 A 但已停用

  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.send("装 MCP");
  const install = h.installMcpOf("su")!;
  const uninstall = h.uninstallMcpOf("su")!;
  const expectFail = (r: InstallMcpReceipt, reason: string, frag: string): void => {
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, reason, `reason=${reason}`);
      assert.ok(r.message.includes(frag), `${reason} 文案如实：「${frag}」∈「${r.message}」`);
    }
  };
  expectFail(await install({ roleId: "su", name: "fetch" }), "role-not-found", "角色「su」不是本项目项目角色（或为内置治理角色）——未执行。");
  expectFail(await install({ roleId: "ghost", name: "fetch" }), "role-not-found", "角色「ghost」不是本项目项目角色（或为内置治理角色）——未执行。");
  expectFail(await install({ roleId: "A", name: "nope" }), "not-registered", "MCP 未登记：docs/mcp/nope.md 不存在——先落盘再安装；未执行。");
  expectFail(await install({ roleId: "A", name: "ans" }), "not-registered", "MCP 未登记：docs/mcp/ans.md 不存在——先落盘再安装；未执行。");
  expectFail(await install({ roleId: "A", name: "bad.name" }), "not-registered", "MCP 未登记：docs/mcp/bad.name.md 不存在——先落盘再安装；未执行。");
  expectFail(await install({ roleId: "A", name: "onlyB" }), "role-not-listed", "登记中未包含角色「A」——未执行；如确要安装请先更新登记。");
  expectFail(await install({ roleId: "A", name: "off" }), "not-registered", "状态为「uninstalled」——先改声明再安装；未执行。");
  expectFail(await uninstall({ roleId: "A", name: "fetch" }), "registration-unchanged", "登记仍含角色「A」——先改登记再卸载；未执行。");
  expectFail(await uninstall({ roleId: "A", name: "nope" }), "not-registered", "没有可撤销的声明；未执行。");
  assert.equal(h.openCalls.filter((r) => r === "A").length, 0, "拒绝零副作用：未开目标会话");
  assert.ok(!h.roleStates.some((s) => s.summaries.some((x) => x.includes("系统·安装"))), "拒绝不投系统行");
  await h.mgr.stop(null);
});

test("G-4 V2 裁定④ 轮次护栏（与技能两工具同判据同文案）：无轮次/系统投递轮次 ⇒ not-customer-turn（零副作用）；客户轮次 ⇒ 放行到校验层", async () => {
  const dir = await makeMcpProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  const install = h.installMcpOf("su")!;
  const uninstall = h.uninstallMcpOf("su")!;

  const r1 = await install({ roleId: "A", name: "fetch" });
  assert.equal(r1.ok, false);
  if (!r1.ok) {
    assert.equal(r1.reason, "not-customer-turn");
    assert.equal(r1.message, "本动作仅可在客户消息发起的轮次执行——未执行。");
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 0, "零副作用：目标未开会话");

  h.mgr.watchdogDeliver(dir, { text: "[系统·看护] 测试告警：角色「A」。", summary: "系统·看护 · 测试", dedupKey: "watchdog\u0000test\u0000mcp-guard" });
  await tick(120);
  const r2 = await uninstall({ roleId: "A", name: "fetch" });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.reason, "not-customer-turn", "系统投递轮次拒绝（两工具同判据）");
  h.streams.su.push({ kind: "settled", summary: "一轮结束" });
  await tick(150);

  const r3 = await h.mgr.send("装 MCP fetch");
  assert.equal(r3.ok, true, "客户直聊轮次");
  const r4 = await install({ roleId: "A", name: "nope" });
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.equal(r4.reason, "not-registered", "客户轮次放行到校验层");
  await h.mgr.stop(null);
});

test("G-4 V2 生效态：未开会话 ⇒ next-session＋note（不自动开目标）；在跑 ⇒ next-session（不打断）", async () => {
  const dir = await makeMcpProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.send("给 A 装 MCP fetch");
  const install = h.installMcpOf("su")!;

  const r1 = await install({ roleId: "A", name: "fetch" });
  assert.equal(r1.ok, true, "未开会话 = 登记即刻对后续会话生效（ok:true 延迟态）");
  if (r1.ok) {
    assert.equal(r1.effective, "next-session");
    assert.ok((r1.note ?? "").includes("没有打开的会话"), "note 如实说明「未开会话」而非「在跑轮次」");
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 0, "不自动开目标会话（激活≠开户）");
  h.streams.su.push({ kind: "settled", summary: "结束" });
  await tick(200);
  h.streams.su.push({ kind: "settled", summary: "系统行轮次结束" });
  await tick(150);

  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  const release = h.hangNext("A");
  void h.mgr.send("长任务", undefined, { roleId: "A" });
  await tick(30);
  await h.mgr.send("装 fetch", undefined, { roleId: "su" });
  const r2 = await install({ roleId: "A", name: "fetch" });
  assert.equal(r2.ok, true, "在跑 = 如实延迟态（不是错误）");
  if (r2.ok) {
    assert.equal(r2.effective, "next-session");
    assert.equal(r2.note, undefined);
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 1, "在跑不打断：目标会话未重建");
  release();
  await tick(60);
  await h.mgr.stop(null);
});

test("G-4 V2 重建失败 ⇒ rebuild-failed（声明仍在、未假装已生效）；不投 [系统·安装] 行", async () => {
  const dir = await makeMcpProject();
  const h = makeHarness({ projectRoot: dir, failOpensAfter: { A: 1 } });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("装", undefined, { roleId: "su" });
  const receipt = await h.installMcpOf("su")!({ roleId: "A", name: "fetch" });
  assert.equal(receipt.ok, false, "重开失败 ⇒ 不假装已生效");
  if (!receipt.ok) {
    assert.equal(receipt.reason, "rebuild-failed");
    assert.ok(receipt.message.includes("重建") && receipt.message.includes("声明仍在"), "如实：声明仍在、会话未重建");
    assert.ok(receipt.message.includes("会话开启失败"), "原因原文如实（不吞）");
  }
  assert.ok(!h.roleStates.some((s) => s.summaries.some((x) => x.includes("系统·安装"))), "失败不投 [系统·安装] 行（零副作用）");
  await h.mgr.stop(null);
});

test("G-4 V2 卸载成功（先改声明再卸载 ⇒ rebuilt）：系统行如实二分「效果已撤；声明文件保留于 docs/mcp/fetch.md」；声明本体保留", async () => {
  const dir = await makeMcpProject();
  const h = makeHarness({ projectRoot: dir });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("卸载 fetch", undefined, { roleId: "su" });
  // 先改声明：把 A 从适用角色移除（普通 edit——落盘永远由 su 侧完成，工具不写盘）。
  await writeMcpFixture(dir, "fetch", "B");
  const receipt = await h.uninstallMcpOf("su")!({ roleId: "A", name: "fetch" });
  assert.equal(receipt.ok, true, "声明确已撤销 ⇒ 卸载受理");
  if (receipt.ok) {
    assert.equal(receipt.action, "uninstalled");
    assert.equal(receipt.path, "docs/mcp/fetch.md");
    assert.equal(receipt.digest.length, 64, "digest＝声明文件当刻字节 sha256");
    assert.equal(receipt.effective, "rebuilt");
  }
  assert.equal(h.openCalls.filter((r) => r === "A").length, 2, "声明已撤 ⇒ 目标会话重建（新会话不再装配）");
  assert.ok((await fs.readFile(path.join(dir, "docs", "mcp", "fetch.md"), "utf8")).includes("启动：node"), "文件保留：声明本体未删（工具不写盘）");
  h.streams.su.push({ kind: "settled", summary: "结束" });
  await tick(300);
  const row = h.sent.su.find((t) => t.startsWith("[系统·安装] ") && t.includes("MCP「fetch」"));
  assert.ok(row, "卸载同样经第四类通道投 [系统·安装] 行");
  assert.ok(row!.includes("效果已撤，声明文件保留于 docs/mcp/fetch.md"), "如实二分陈述（效果已撤／文件保留）");
  assert.ok(row!.includes("已发生的副作用不可撤"), "MCP 专有诚实面（卸载＝下次会话摘除；副作用不可撤）");
  await h.mgr.stop(null);
});


// —————————————— 三权 W3（评审 §5.6）：能力矩阵 / 派发门禁 / 回交与看护路由 / 账本 ——————————————
//
// 覆盖：三内置按 `governanceFunction` 注入（rapporteur 仅客户通道；nominator 加安装；convener 加
// 派发/看护 + 只读 shell）；`routeDispatch` 的派发范围门正反例与 `dispatch.accepted` 账本；
// 项目角色回交/看护系统消息改投 Convener（Rapporteur 只镜像、不接投递）；旧 single 不写账本。

const trioEntry = (over: Record<string, unknown>) => ({
  at: new Date().toISOString(),
  kind: "customer.decision",
  flowId: "flow-a",
  actorRoleId: "rapporteur",
  power: "proposal",
  customerDecision: "accepted",
  ...over,
});

/** 造一个可过派发门禁的 trio 项目根：流程单含步骤 `impl`；账本按用例写入。 */
async function makeTrioRoot(ledgerEntries: Record<string, unknown>[] = []): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-trio-dispatch-"));
  await fs.mkdir(path.join(dir, "docs", "flows"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "docs", "flows", "flow-a.md"),
    ["# 流程 flow-a", "", "| 步骤 | 主人 | 状态 |", "| --- | --- | --- |", "| impl | A | pending |", ""].join("\n"),
    "utf8",
  );
  await fs.mkdir(path.join(dir, ".ans", "governance"), { recursive: true });
  if (ledgerEntries.length > 0) {
    await fs.writeFile(
      path.join(dir, ".ans", "governance", "ledger.jsonl"),
      ledgerEntries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
      "utf8",
    );
  }
  return dir;
}

test("三权能力矩阵：rapporteur 仅客户通道；nominator 加安装；convener 加派发/看护；三者均获审批档 shell（2026-10-19 新规则），项目角色三层链不变", async () => {
  const dir = await makeTrioRoot();
  const customerInput: DesktopCustomerInputFn = async () => ({ outcome: "declined", reason: "测试替身" });
  const arming = {
    classifyShell: (_command: string) => "allow",
    rules: { allow: [], review: [], deny: [] },
  } as unknown as DesktopShellArming;
  const operatorChannel: DesktopOperatorChannelFn = async () => ({ outcome: "deny", reason: "测试替身" });
  const h = makeHarness({ projectRoot: dir, customListing: trioListing(dir), customerInput, shellArming: arming, shellOperatorChannel: operatorChannel });

  for (const roleId of ["rapporteur", "nominator", "convener", "A"]) {
    await h.mgr.open({ projectRoot: dir, roleId, runtime: "demo" });
    await tick(30);
  }

  const rapporteur = h.capabilitiesOf("rapporteur")!;
  assert.equal(typeof rapporteur.customerInput, "function", "rapporteur：客户确认通道（三人都有）");
  assert.equal(rapporteur.dispatchTask, undefined, "rapporteur 不派发");
  assert.equal(rapporteur.proposeRecovery, undefined, "rapporteur 无恢复提议");
  assert.equal(rapporteur.roleStatus, undefined, "rapporteur 无 role_status");
  assert.equal(rapporteur.sessionTail, undefined, "rapporteur 无 session_tail");
  assert.equal(rapporteur.installSkill, undefined, "rapporteur 不安装技能");
  assert.equal(rapporteur.installMcp, undefined, "rapporteur 不安装 MCP");
  assert.ok(rapporteur.shellOperatorOnly, "rapporteur：内置治理角色统一审批档（2026-10-19 新规则）");
  assert.equal(rapporteur.shellReadonly, undefined, "rapporteur 不再走只读档（统一审批档）");
  assert.equal(rapporteur.shellArming, undefined, "内置角色不走项目三层链");

  const nominator = h.capabilitiesOf("nominator")!;
  assert.equal(typeof nominator.customerInput, "function", "nominator：客户确认通道");
  assert.equal(typeof nominator.installSkill, "function", "nominator：技能安装");
  assert.equal(typeof nominator.uninstallSkill, "function", "nominator：技能卸载");
  assert.equal(typeof nominator.installMcp, "function", "nominator：MCP 安装");
  assert.equal(typeof nominator.uninstallMcp, "function", "nominator：MCP 卸载");
  assert.equal(nominator.dispatchTask, undefined, "nominator 不派发");
  assert.equal(nominator.proposeRecovery, undefined, "nominator 无恢复提议");
  assert.ok(nominator.shellOperatorOnly, "nominator：内置治理角色统一审批档");
  assert.equal(nominator.shellReadonly, undefined, "nominator 不再走只读档（统一审批档）");

  const convener = h.capabilitiesOf("convener")!;
  assert.equal(typeof convener.customerInput, "function", "convener：客户确认通道");
  assert.equal(typeof convener.dispatchTask, "function", "convener：派发（唯一）");
  assert.equal(typeof convener.proposeRecovery, "function", "convener：恢复提议");
  assert.equal(typeof convener.roleStatus, "function", "convener：role_status");
  assert.equal(typeof convener.sessionTail, "function", "convener：session_tail");
  assert.equal(convener.installSkill, undefined, "convener 不安装技能");
  assert.equal(convener.installMcp, undefined, "convener 不安装 MCP");
  const convenerOnly = convener.shellOperatorOnly as { classifyShell?: unknown; rules?: unknown; operatorChannel?: unknown } | undefined;
  assert.ok(convenerOnly, "convener：内置治理角色统一审批档（2026-10-19 新规则）");
  assert.equal(convenerOnly!.classifyShell, arming.classifyShell, "convener 审批档：(c) classifyShell 同一函数引用");
  assert.equal(convenerOnly!.rules, arming.rules, "convener 审批档：(c) rules 同一引用");
  assert.equal(typeof convenerOnly!.operatorChannel, "function", "convener 审批档：(a) 操作者通道已装配（不再是不带通道的只读档）");
  assert.equal(convener.shellReadonly, undefined, "convener 不再走只读档（2026-10-19：统一审批档）");

  const projectRole = h.capabilitiesOf("A")!;
  assert.equal(projectRole.customerInput, undefined, "项目角色无客户确认通道");
  assert.equal(projectRole.dispatchTask, undefined, "项目角色不派发");
  assert.equal(projectRole.shellReadonly, undefined, "项目角色不带只读档");
  assert.equal(projectRole.shellArming, arming, "项目角色三层链：(c) 实件逐字不变");
  assert.equal(typeof projectRole.shellOperatorChannel, "function", "项目角色三层链：(a) 通道逐字不变");
  await h.mgr.stop(null);
});

test("2026-10-19 新规则：trio 五个内置治理角色全部经 shellOperatorOnly 获得审批档（convener 不再走只读档）", async () => {
  const dir = await makeTrioRoot();
  type RoleFn = ProjectListing["roles"][number]["governanceFunction"];
  const mkBuiltIn = (roleId: string, governanceFunction: RoleFn): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:trio/${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction,
  });
  const fiveRoles = [
    mkBuiltIn("liaison", "liaison"),
    mkBuiltIn("rapporteur", "proposal"),
    mkBuiltIn("nominator", "nomination"),
    mkBuiltIn("convener", "schedule"),
    mkBuiltIn("verifier", "verification"),
  ];
  const fiveListing: ProjectListing = {
    projectRoot: dir,
    roles: fiveRoles,
    warnings: [],
    hasRoles: true,
    primaryRoleId: "liaison",
    governanceModel: "trio",
  };
  const arming = {
    classifyShell: (_command: string) => "allow",
    rules: { allow: [], review: [], deny: [] },
  } as unknown as DesktopShellArming;
  const operatorChannel: DesktopOperatorChannelFn = async () => ({ outcome: "deny", reason: "测试替身" });
  const h = makeHarness({ projectRoot: dir, customListing: fiveListing, shellArming: arming, shellOperatorChannel: operatorChannel });

  for (const role of fiveRoles) {
    await h.mgr.open({ projectRoot: dir, roleId: role.roleId, runtime: "demo" });
    await tick(30);
  }

  for (const role of fiveRoles) {
    const caps = h.capabilitiesOf(role.roleId);
    assert.ok(caps, `${role.roleId}：应成功开启会话并捕获能力面`);
    const only = caps.shellOperatorOnly as { classifyShell?: unknown; rules?: unknown; operatorChannel?: unknown } | undefined;
    assert.ok(only, `${role.roleId}：内置治理角色应经 shellOperatorOnly 拿到审批档`);
    assert.equal(only!.classifyShell, arming.classifyShell, `${role.roleId}：审批档 (c) classifyShell 为同一函数引用（单一来源）`);
    assert.equal(only!.rules, arming.rules, `${role.roleId}：审批档 rules 为同一引用（单一来源）`);
    assert.equal(typeof only!.operatorChannel, "function", `${role.roleId}：审批档 (a) 操作者通道已装配`);
    assert.equal(caps.shellReadonly, undefined, `${role.roleId}：不再注入只读档（与审批档互斥）`);
    assert.equal(caps.shellArming, undefined, `${role.roleId}：内置治理角色不走项目三层链 (c) 字段`);
    assert.equal(caps.shellOperatorChannel, undefined, `${role.roleId}：不直接收 shellOperatorChannel（(a) 在审批档内）`);
  }
  // convener 专项（旧只读档的唯一持有者）：必须走审批档，绝无只读档残留。
  const convener = h.capabilitiesOf("convener")!;
  assert.ok(convener.shellOperatorOnly, "convener：走审批档");
  assert.equal(convener.shellReadonly, undefined, "convener：只读档已退役（2026-10-19 统一审批档）");
  await h.mgr.stop(null);
});

test("routeDispatch 正例（trio）：提案接受 + 任命 + 流程步骤 → 入队 + 写 dispatch.accepted 账本", async () => {
  const dir = await makeTrioRoot([
    trioEntry({ decisionKind: "proposal-accept" }),
    trioEntry({ decisionKind: "appointment", power: "nomination", actorRoleId: "nominator", targetRoleIds: ["A"] }),
  ]);
  const h = makeHarness({ projectRoot: dir, customListing: trioListing(dir) });
  await h.mgr.open({ projectRoot: dir, roleId: "convener", runtime: "demo" });
  await tick(30);
  const dispatch = h.capabilitiesOf("convener")!.dispatchTask!;
  const receipt = (await dispatch({ roleId: "A", task: "实现步骤 impl", flowId: "flow-a", stepId: "impl" }))!;
  assert.equal(receipt.ok, true, "门禁全过 ⇒ 受理");
  assert.match(receipt.message ?? "", /已受理/, "回执如实（受理≠已完成）");
  await tick(200);
  assert.equal(h.sent.A.length, 1, "目标收到派发");
  assert.ok(h.sent.A[0].includes("实现步骤 impl"), "任务文本送达");
  assert.match(h.sent.A[0], /^\[派发\] 来自 convener 的任务/, "三权派发正文首行：主人是 Convener，不是 su");

  const { readGovernanceLedger } = await import("../../src/pipeline/orchestration/govern-session.ts");
  const ledger = await readGovernanceLedger(dir);
  assert.deepEqual(ledger.errors, [], "账本可读");
  const written = ledger.entries.filter((entry) => entry.kind === "dispatch.accepted");
  assert.equal(written.length, 1, "成功入队后写恰一条 dispatch.accepted");
  const [entry] = written;
  assert.equal(entry.actorRoleId, "convener");
  assert.equal(entry.power, "schedule");
  assert.equal(entry.flowId, "flow-a");
  assert.equal(entry.stepId, "impl");
  assert.equal(entry.targetRoleId, "A");
  assert.ok((entry.messageSummary ?? "").includes("实现步骤 impl"), "messageSummary 记录任务摘要");
  await h.mgr.stop(null);
});

test("routeDispatch 反例（trio）：无客户接受/无任命/目标内置/重复步骤 → 拒投且不写账本", async () => {
  const { readGovernanceLedger } = await import("../../src/pipeline/orchestration/govern-session.ts");
  // ① 无账本（无客户决定）：门禁拒。
  const emptyRoot = await makeTrioRoot();
  const h1 = makeHarness({ projectRoot: emptyRoot, customListing: trioListing(emptyRoot) });
  await h1.mgr.open({ projectRoot: emptyRoot, roleId: "convener", runtime: "demo" });
  await tick(30);
  const r1 = (await h1.capabilitiesOf("convener")!.dispatchTask!({ roleId: "A", task: "无提案", flowId: "flow-a", stepId: "impl" }))!;
  assert.equal(r1.ok, false, "无客户接受的提案 ⇒ 拒投");
  assert.match(r1.message ?? "", /治理门禁/, "回执点明治理门禁");
  await tick(120);
  assert.equal(h1.sent.A.length, 0, "拒投不投递");
  const none = await readGovernanceLedger(emptyRoot);
  assert.equal(none.entries.filter((entry) => entry.kind === "dispatch.accepted").length, 0, "失败不写 dispatch.accepted");
  await h1.mgr.stop(null);

  // ② 提案已接受但目标不在任命名单：拒。
  const noAppointmentRoot = await makeTrioRoot([trioEntry({ decisionKind: "proposal-accept" })]);
  const h2 = makeHarness({ projectRoot: noAppointmentRoot, customListing: trioListing(noAppointmentRoot) });
  await h2.mgr.open({ projectRoot: noAppointmentRoot, roleId: "convener", runtime: "demo" });
  await tick(30);
  const r2 = (await h2.capabilitiesOf("convener")!.dispatchTask!({ roleId: "A", task: "未任命", flowId: "flow-a", stepId: "impl" }))!;
  assert.equal(r2.ok, false, "未任命 ⇒ 拒投");
  assert.match(r2.message ?? "", /任命|治理门禁/, "文案指路任命");
  await h2.mgr.stop(null);

  // ③ 目标为内置治理角色：拒（即使账本齐全）。
  const builtinRoot = await makeTrioRoot([
    trioEntry({ decisionKind: "proposal-accept" }),
    trioEntry({ decisionKind: "appointment", power: "nomination", actorRoleId: "nominator", targetRoleIds: ["A"] }),
  ]);
  const h3 = makeHarness({ projectRoot: builtinRoot, customListing: trioListing(builtinRoot) });
  await h3.mgr.open({ projectRoot: builtinRoot, roleId: "convener", runtime: "demo" });
  await tick(30);
  const r3 = (await h3.capabilitiesOf("convener")!.dispatchTask!({ roleId: "rapporteur", task: "派给内置", flowId: "flow-a", stepId: "impl" }))!;
  assert.equal(r3.ok, false, "内置目标一律拒");
  assert.match(r3.message ?? "", /内置治理角色/, "如实原因");
  await h3.mgr.stop(null);

  // ④ 重复派发同一 flowId+stepId：第二次被账本去重拒。
  const dupRoot = await makeTrioRoot([
    trioEntry({ decisionKind: "proposal-accept" }),
    trioEntry({ decisionKind: "appointment", power: "nomination", actorRoleId: "nominator", targetRoleIds: ["A"] }),
  ]);
  const h4 = makeHarness({ projectRoot: dupRoot, customListing: trioListing(dupRoot) });
  await h4.mgr.open({ projectRoot: dupRoot, roleId: "convener", runtime: "demo" });
  await tick(30);
  const dispatch4 = h4.capabilitiesOf("convener")!.dispatchTask!;
  assert.equal((await dispatch4({ roleId: "A", task: "第一次", flowId: "flow-a", stepId: "impl" }))!.ok, true);
  const again = (await dispatch4({ roleId: "A", task: "第二次不同文本", flowId: "flow-a", stepId: "impl" }))!;
  assert.equal(again.ok, false, "同一步骤重复派发被去重");
  assert.match(again.message ?? "", /已派发过|去重/, "文案如实说明重复");
  const ledger4 = await readGovernanceLedger(dupRoot);
  assert.equal(ledger4.entries.filter((entry) => entry.kind === "dispatch.accepted").length, 1, "被拒的重复派发不新增账本");
  await h4.mgr.stop(null);
});

test("回交/看护路由（trio）：项目角色回交与系统消息改投 Convener；Rapporteur 不接收", async () => {
  const dir = await makeTrioRoot();
  const h = makeHarness({ projectRoot: dir, customListing: trioListing(dir) });
  await h.mgr.open({ projectRoot: dir, roleId: "rapporteur", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "convener", runtime: "demo" });
  await tick(30);
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  // 项目角色 A 回交 → 投递主人是 Convener（不是主入口 Rapporteur）。
  (h.streams.A ??= []).push({ kind: "handback", roleId: "A", summary: "A 完成", handback: HANDBACK_A } as OrchestrationEvent);
  await tick(250);
  assert.ok(h.sent.convener.includes(renderHandbackPrompt(HANDBACK_A)), "回交原文投给 Convener");
  assert.equal((h.sent.rapporteur ?? []).length, 0, "Rapporteur 不接收回交投递（只镜像由渲染侧负责）");
  assert.equal(h.mgr.watchdogSnapshot(dir)!.governanceRoleId, "convener", "看护快照的治理主人=Convener");
  // 三人不自我回交（防御）：内置角色的回交事件不被再次投递。
  const beforeSelf = h.sent.convener.length;
  (h.streams.convener ??= []).push({ kind: "handback", roleId: "convener", summary: "内置回交", handback: { ...HANDBACK_A, roleId: "convener" } } as OrchestrationEvent);
  await tick(120);
  assert.equal(h.sent.convener.length, beforeSelf, "内置治理角色不自我回交（防御性忽略）");
  // 回交那一轮结束（convener 空闲）后再投系统消息——看护系统消息同样投 Convener。
  (h.streams.convener ??= []).push({ kind: "settled", summary: "convener 一轮结束" } as OrchestrationEvent);
  await tick(120);
  h.mgr.watchdogDeliver(dir, { text: "[系统·看护] 测试", summary: "系统·看护 · 测试", dedupKey: "k-trio" });
  await tick(200);
  assert.ok(h.sent.convener.includes("[系统·看护] 测试"), "系统消息投给 Convener");
  assert.equal((h.sent.rapporteur ?? []).length, 0, "Rapporteur 不接收系统消息");
  await h.mgr.stop(null);
});

test("治理收尾反馈（trio）：内部角色 settle ⇒ Lead 收到汇总任务；不重复、不投项目角色/Lead/系统行；single 不产生", async () => {
  const dir = await makeTrioRoot([]);
  const h = makeHarness({ projectRoot: dir, customListing: trioListing(dir) });
  const feedbackTask = (displayName: string, body: string) => [
    `[系统·治理反馈] 来自 ${displayName} 的内部反馈（内部材料，请汇总后告知客户，不要逐字转述）：`,
    body,
    "请用 1-3 句话向客户汇总：完成了什么、是否有风险/阻塞、下一步或需要客户决定什么。不要逐字转述内部报告，不要使用内部行话，不要声称客户已批准。",
  ].join("\n");

  await h.mgr.open({ projectRoot: dir, roleId: "convener", runtime: "demo" });
  await tick(30);
  await h.mgr.send("干活", undefined, { roleId: "convener" });
  // Claude 一条回复拆多个 text block（同一 turnId）⇒ 累积而非只留最后一条。
  // live 的正文可能带 `display`（2026-10-18 修正：照记）；工具行/推理行不记。
  (h.streams.convener ??= []).push({ kind: "message", summary: "治理收尾：提案已归档", turnId: "t1" } as OrchestrationEvent);
  (h.streams.convener ??= []).push({
    kind: "message",
    summary: "补充：证据见 docs/x.md",
    turnId: "t1",
    detail: { display: { kind: "text" } },
  } as OrchestrationEvent);
  (h.streams.convener ??= []).push({
    kind: "message",
    summary: "工具行不该被记",
    turnId: "t1",
    detail: { toolCallId: "call-1", toolName: "read_file" },
  } as OrchestrationEvent);
  (h.streams.convener ??= []).push({
    kind: "message",
    summary: "推理不该被记",
    turnId: "t1",
    detail: { source: "reasoning" },
  } as OrchestrationEvent);
  (h.streams.convener ??= []).push({ kind: "settled", summary: "convener 一轮结束" } as OrchestrationEvent);
  await tick(180);
  assert.deepEqual(
    h.sent.rapporteur,
    [feedbackTask("convener", "治理收尾：提案已归档\n补充：证据见 docs/x.md")],
    "内部角色收尾 ⇒ 经投递机给 Lead 一条汇总任务（多 block 累积、display 照记、工具/推理不记）",
  );
  assert.equal(
    h.envelopes.filter((e) =>
      e.event.kind === "message" &&
      (e.event.detail as { source?: string } | undefined)?.source === "delivery-note" &&
      /治理反馈|\[系统·治理反馈\]/.test(e.event.summary)).length,
    0,
    "不再把内部报告原文当 delivery-note 贴到 pane",
  );

  // Lead 结束自己的汇总轮，后续任务才能再投。
  (h.streams.rapporteur ??= []).push({ kind: "settled", summary: "Lead 一轮结束" } as OrchestrationEvent);
  await tick(120);

  // 再次 busy→idle 但没有新 assistant 正文 ⇒ 不重复（取出即删）；迟到 settled 同样不重复。
  await h.mgr.send("再干", undefined, { roleId: "convener" });
  (h.streams.convener ??= []).push({ kind: "settled", summary: "无正文一轮" } as OrchestrationEvent);
  await tick(120);
  (h.streams.convener ??= []).push({ kind: "settled", summary: "迟到 settled" } as OrchestrationEvent);
  await tick(120);
  assert.equal(h.sent.rapporteur.length, 1, "重复 settle / 无新正文不重复投递");

  // turnId 变化 ⇒ 重置，不把上一轮正文混进本轮。
  await h.mgr.send("换轮", undefined, { roleId: "convener" });
  (h.streams.convener ??= []).push({ kind: "message", summary: "上一轮的尾巴", turnId: "t2" } as OrchestrationEvent);
  (h.streams.convener ??= []).push({ kind: "message", summary: "新的本轮正文", turnId: "t3" } as OrchestrationEvent);
  (h.streams.convener ??= []).push({ kind: "settled", summary: "convener 换轮结束" } as OrchestrationEvent);
  await tick(150);
  assert.equal(h.sent.rapporteur.length, 2, "换轮后再投一条");
  assert.deepEqual(h.sent.rapporteur[1], feedbackTask("convener", "新的本轮正文"), "turnId 变化即重置");

  // 项目角色不投（其回交仍走 Convener）。
  await h.mgr.open({ projectRoot: dir, roleId: "A", runtime: "demo" });
  await tick(30);
  await h.mgr.send("项目活", undefined, { roleId: "A" });
  (h.streams.A ??= []).push({ kind: "message", summary: "项目角色收尾" } as OrchestrationEvent);
  (h.streams.A ??= []).push({ kind: "settled", summary: "A 一轮结束" } as OrchestrationEvent);
  await tick(150);
  assert.equal(h.sent.rapporteur.length, 2, "项目角色 settle 不产生反馈任务");

  // Lead 自己 settle 不投（防循环）——第 2 条任务的轮次此时在跑。
  (h.streams.rapporteur ??= []).push({ kind: "message", summary: "联络官自己的收尾" } as OrchestrationEvent);
  (h.streams.rapporteur ??= []).push({ kind: "settled", summary: "rapporteur 一轮结束" } as OrchestrationEvent);
  await tick(150);
  assert.equal(h.sent.rapporteur.length, 2, "Lead 自己 settle 不产生反馈任务");

  // 带结构化 detail 的系统行不当作助手正文（delivery-note / prompt-input / receipt 等）。
  await h.mgr.open({ projectRoot: dir, roleId: "nominator", runtime: "demo" });
  await tick(30);
  await h.mgr.send("提名活", undefined, { roleId: "nominator" });
  (h.streams.nominator ??= []).push({ kind: "message", summary: "系统行不该被记", detail: { source: "delivery-note" } } as OrchestrationEvent);
  (h.streams.nominator ??= []).push({ kind: "settled", summary: "nominator 一轮结束" } as OrchestrationEvent);
  await tick(150);
  assert.equal(h.sent.rapporteur.length, 2, "系统行不当作助手正文");

  await h.mgr.stop(null);
});

test("治理收尾反馈：Lead 忙时按投递机排队，settle 后送达", async () => {
  const dir = await makeTrioRoot([]);
  const h = makeHarness({ projectRoot: dir, customListing: trioListing(dir) });
  await h.mgr.open({ projectRoot: dir, roleId: "rapporteur", runtime: "demo" });
  await tick(30);
  await h.mgr.send("Lead 先忙", undefined, { roleId: "rapporteur" });
  assert.equal(h.sent.rapporteur.length, 1, "Lead 当前轮在跑");

  await h.mgr.open({ projectRoot: dir, roleId: "convener", runtime: "demo" });
  await tick(30);
  await h.mgr.send("干活", undefined, { roleId: "convener" });
  (h.streams.convener ??= []).push({ kind: "message", summary: "内部报告", turnId: "t1" } as OrchestrationEvent);
  (h.streams.convener ??= []).push({ kind: "settled", summary: "convener 一轮结束" } as OrchestrationEvent);
  await tick(180);
  assert.equal(h.sent.rapporteur.length, 1, "Lead 忙 ⇒ 汇总任务排队，不打断当前轮");

  (h.streams.rapporteur ??= []).push({ kind: "settled", summary: "Lead 一轮结束" } as OrchestrationEvent);
  await tick(200);
  assert.equal(h.sent.rapporteur.length, 2, "Lead 空闲后按序送达");
  assert.ok(h.sent.rapporteur[1].startsWith("[系统·治理反馈] 来自 convener 的内部反馈"));
  assert.ok(h.sent.rapporteur[1].includes("内部报告"));
  await h.mgr.stop(null);
});

test("治理收尾反馈：本轮累积上限 4000（保留最新加 …）；任务正文 ≤4000；single 模型不产生", async () => {
  const dir = await makeTrioRoot([]);
  const h = makeHarness({ projectRoot: dir, customListing: trioListing(dir) });
  await h.mgr.open({ projectRoot: dir, roleId: "convener", runtime: "demo" });
  await tick(30);
  await h.mgr.send("长正文", undefined, { roleId: "convener" });
  (h.streams.convener ??= []).push({ kind: "message", summary: "上".repeat(3000), turnId: "long" } as OrchestrationEvent);
  (h.streams.convener ??= []).push({ kind: "message", summary: "下".repeat(3000), turnId: "long" } as OrchestrationEvent);
  (h.streams.convener ??= []).push({ kind: "settled", summary: "convener 长一轮结束" } as OrchestrationEvent);
  await tick(180);
  assert.equal(h.sent.rapporteur.length, 1, "累积超 4000 仍投一条汇总任务");
  const lines = h.sent.rapporteur[0].split("\n");
  assert.equal(lines[0], "[系统·治理反馈] 来自 convener 的内部反馈（内部材料，请汇总后告知客户，不要逐字转述）：", "任务前缀");
  assert.equal(
    lines[lines.length - 1],
    "请用 1-3 句话向客户汇总：完成了什么、是否有风险/阻塞、下一步或需要客户决定什么。不要逐字转述内部报告，不要使用内部行话，不要声称客户已批准。",
    "汇总指令在末尾",
  );
  const body = lines.slice(1, -1).join("\n");
  assert.equal(Array.from(body).length, 4000, "任务正文 ≤4000 码点");
  assert.ok(body.startsWith("…"), "超限保留最新（前置 …）");
  await h.mgr.stop(null);

  // single 模型：su（内置主入口）settle 不产生。
  const singleDir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-single-feedback-"));
  const hs = makeHarness({ projectRoot: singleDir, customListing: listing(singleDir) });
  await hs.mgr.open({ projectRoot: singleDir, roleId: "su", runtime: "demo" });
  await tick(30);
  await hs.mgr.send("su 收尾", undefined, { roleId: "su" });
  (hs.streams.su ??= []).push({ kind: "message", summary: "su 的收尾" } as OrchestrationEvent);
  (hs.streams.su ??= []).push({ kind: "settled", summary: "su 一轮结束" } as OrchestrationEvent);
  await tick(150);
  assert.equal(hs.sent.su.length, 1, "single 模型不产生治理反馈任务");
  assert.ok(!hs.sent.su[0].startsWith("[系统·治理反馈]"));
  await hs.mgr.stop(null);
});

test("治理收尾反馈镜像：listing key 正斜杠、会话 root 反斜杠 ⇒ 归一兜底仍镜像；skip 诊断可查", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ans-feedback-diagnostics-"));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-feedback-slash-"));
  const forward = dir.replace(/\\/g, "/");
  const backslash = dir.replace(/\//g, "\\");
  const list = trioListing(forward);
  let allowEntryRoot = true;
  let normalizedHits = 0;
  configureDiagnostics({ directory });
  const h = makeHarness({
    projectRoot: backslash,
    customListing: list,
    getListing: (root) => {
      if (root === backslash && allowEntryRoot) return list;
      if (root === forward) { normalizedHits += 1; return list; }
      return undefined;
    },
  });
  try {
    await h.mgr.open({ projectRoot: backslash, roleId: "convener", runtime: "demo" });
    await h.mgr.open({ projectRoot: backslash, roleId: "rapporteur", runtime: "demo" });
    await tick(30);
    allowEntryRoot = false; // 此后枚举缓存只认正斜杠 key（真机斜杠变体）
    await h.mgr.send("干活", undefined, { roleId: "convener" });
    (h.streams.convener ??= []).push({ kind: "message", summary: "斜杠归一后的收尾", turnId: "t1" } as OrchestrationEvent);
    (h.streams.convener ??= []).push({ kind: "settled", summary: "convener 一轮结束" } as OrchestrationEvent);
    await tick(180);
    assert.ok(normalizedHits > 0, "精确 key miss 后按斜杠归一命中");
    assert.equal(h.sent.rapporteur.length, 1, "会话 entry root 与 listing key 斜杠变体不同仍投 Lead");
    assert.ok(h.sent.rapporteur[0].startsWith("[系统·治理反馈] 来自 convener 的内部反馈"), "任务前缀");
    assert.ok(h.sent.rapporteur[0].includes("斜杠归一后的收尾"), "正文随任务送达");

    // 再一轮无正文 ⇒ skip 诊断（no-text）。
    await h.mgr.send("再干", undefined, { roleId: "convener" });
    (h.streams.convener ??= []).push({ kind: "settled", summary: "无正文" } as OrchestrationEvent);
    await tick(120);
    await flushDiagnostics();
    const files = await fs.readdir(directory);
    const text = (await Promise.all(files.map((f) => fs.readFile(path.join(directory, f), "utf8")))).join("");
    const rows = text.trim().split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as {
      component?: string; event?: string; reasonCode?: string; targetRoleId?: string; count?: number;
    });
    const skip = rows.find((r) => r.component === "desktop.governance-feedback" && r.event === "governance.feedback.skip");
    assert.ok(skip, "skip 诊断存在");
    assert.equal(skip!.reasonCode, "no-text", "skip 原因可查（白名单落 reasonCode 同义字段）");
    const mirrored = rows.find((r) => r.component === "desktop.governance-feedback" && r.event === "governance.feedback.mirrored");
    assert.ok(mirrored, "成功镜像诊断存在");
    assert.equal(mirrored!.targetRoleId, "rapporteur", "镜像诊断 targetRoleId 记 Lead 的真实 roleId");
    assert.equal(mirrored!.count, Array.from("斜杠归一后的收尾").length, "镜像诊断记录字符数（不记正文）");
    assert.ok(!text.includes("斜杠归一后的收尾"), "诊断不落正文");
  } finally {
    await h.mgr.stop(null);
    await disposeDiagnostics();
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("旧 single 不回归：派发仍投主入口 su，且不产生 .ans/governance 账本（旧项目行为逐字不变）", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ans-single-dispatch-"));
  const h = makeHarness({ projectRoot: dir, customListing: listing(dir) });
  await h.mgr.open({ projectRoot: dir, roleId: "su", runtime: "demo" });
  await tick(30);
  const receipt = (await h.capabilitiesOf("su")!.dispatchTask!({ roleId: "A", task: "旧项目派发" }))!;
  assert.equal(receipt.ok, true, "single 旧行为：无需 flowId/stepId，直接受理");
  await tick(150);
  assert.equal(h.sent.A.length, 1, "旧行为照常投递");
  assert.match(h.sent.A[0], /^\[派发\] 来自 su 的任务/, "single 缺省派发主人仍 su（旧文案逐字）");
  await assert.rejects(fs.stat(path.join(dir, ".ans", "governance", "ledger.jsonl")), "single 不创建治理账本文件");
  await h.mgr.stop(null);
});

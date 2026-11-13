// test/桌面应用/directive-input.test.ts
// 客户授权平面 C1（B-4）：主进程侧指令控制器 + `sendSession` 命中拦截 + IPC/preload 冻结形状。
// 覆盖：识别拦截/不投递、确认面板字段、回包快照复核、高危复核与提交快照、幂等、重推、关窗取消、
// 项目切换（session 指令存活）、面板共存（不占客户卡/壳卡槽）、卡内入口 target fail-closed。
// 只跑主进程侧纯逻辑 + 临时目录账本；不启动 Electron、不触网、不写真实 userData。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDirectiveInputController,
  type DirectiveConfirmRequestPayload,
  type DirectiveInputController,
  type DirectiveNote,
} from "../../app/desktop/directive-input.ts";
import {
  createDesktopInterface,
  createShellJudgeSwitch,
  type DesktopInterface,
} from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { CUSTOMER_DIRECTIVES_REL } from "../../src/model/directive.ts";
import type { DirectiveInterpretFn, DirectiveInterpretRequest } from "../../src/model/directive.ts";
import type { CreateDirectiveInterpreterOptions } from "../../src/pipeline/orchestration/govern-session.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { readSessionSource } from "./session-source.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor 超时");
    await tick(10);
  }
}

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

interface ControllerHarness {
  controller: DirectiveInputController;
  confirmRequests: DirectiveConfirmRequestPayload[];
  notices: DirectiveNote[];
}

function makeController(
  root: string,
  sessionId = "session-c1-test",
  options: { interpret?: DirectiveInterpretFn } = {},
): ControllerHarness {
  const confirmRequests: DirectiveConfirmRequestPayload[] = [];
  const notices: DirectiveNote[] = [];
  const controller = createDirectiveInputController({
    sessionId,
    present: (payload) => confirmRequests.push(payload),
    emitNotice: (note) => notices.push(note),
    ...(options.interpret !== undefined ? { interpret: options.interpret } : {}),
  });
  controller.setCurrentProject(root);
  return { controller, confirmRequests, notices };
}

function approvalInput(root: string, text: string, extra: { clientMessageId?: string } = {}) {
  return {
    rawText: text,
    target: "approval" as const,
    projectRoot: root,
    roleId: "A",
    runtime: "demo" as const,
    decisionGroupEnabled: true,
    ...(extra.clientMessageId !== undefined ? { clientMessageId: extra.clientMessageId } : {}),
  };
}

function decisionInput(root: string, text: string, decisionGroupEnabled: boolean) {
  return {
    rawText: text,
    target: "decision" as const,
    projectRoot: root,
    roleId: "A",
    runtime: "demo" as const,
    decisionGroupEnabled,
  };
}

function ledgerEvents(root: string): Array<Record<string, unknown>> {
  const file = path.join(root, ...CUSTOMER_DIRECTIVES_REL.split("/"));
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function confirm(h: ControllerHarness, values: Record<string, unknown>) {
  const request = h.confirmRequests.at(-1);
  assert.ok(request, "应有确认请求");
  return h.controller.respond({ id: request.request.id, decision: "confirm", values });
}

function prefillValues(request: DirectiveConfirmRequestPayload) {
  return {
    action: request.request.prefill.action,
    scope: request.request.prefill.scope,
    until: request.request.prefill.until,
  };
}

// ————————————————— 1. 识别/确认/落账/回执/列表/状态 —————————————————

test("指令提交：确认面板字段（原文/动作/范围/期限/confirmable/开关快照）；确认后 durable 落账 + 回执 + 双视图", async () => {
  const t = tempDir("ans-c1-submit-");
  try {
    const h = makeController(t.dir);
    const pending = h.controller.submitFromInput(approvalInput(t.dir, `@审批 允许 shell "echo hi" until=once`));
    await tick();
    assert.equal(h.confirmRequests.length, 1, "命中即呈现确认面板");
    const payload = h.confirmRequests[0]!;
    assert.equal(payload.version, 1);
    assert.equal(payload.request.target, "approval");
    assert.equal(payload.request.rawText, `@审批 允许 shell "echo hi" until=once`);
    assert.equal(payload.request.projectRoot, t.dir);
    assert.equal(payload.request.roleId, "A");
    assert.equal(payload.request.runtime, "demo");
    assert.equal(payload.request.prefill.action.kind, "allow");
    const action = payload.request.prefill.action as { kind: string; resource?: { type?: string } };
    assert.equal(action.resource?.type, "shell");
    assert.equal(payload.request.prefill.until, "once");
    assert.equal(payload.request.confirmable, true);
    assert.equal(payload.request.decisionGroupEnabled, true);
    assert.deepEqual(payload.request.highRisk.reasons, []);

    const ok = await h.controller.respond({ id: payload.request.id, decision: "confirm", values: prefillValues(payload) });
    assert.deepEqual(ok, { ok: true });
    const result = await pending;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.target, "approval");
    assert.match(result.id, /^d-[1-9][0-9]*$/);

    const events = ledgerEvents(t.dir);
    assert.equal(events.length, 1, "只在 durable 成功后产生一条 created 事件");
    assert.equal(events[0]!.kind, "directive.created");
    assert.equal(events[0]!.id, result.id);
    assert.equal(events[0]!.rawText, `@审批 允许 shell "echo hi" until=once`);
    assert.ok(h.notices.some((n) => n.summary === `已记录审批指令 #${result.id}`), "durable 成功后投回执");

    const listed = await h.controller.list();
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.directivesEnabled, true);
    assert.equal(listed.approval.active.length, 1);
    assert.equal(listed.approval.active[0]!.id, result.id);
    assert.equal(listed.approval.active[0]!.consumer, "shell-gate");
    assert.equal(listed.ledgerErrors, 0);

    const state = await h.controller.state();
    assert.ok(state);
    assert.equal(state!.version, 1);
    assert.equal(state!.directivesEnabled, true);
    assert.deepEqual(state!.approval.active.map((item) => item.id), [result.id]);
    assert.deepEqual(state!.decision.active, []);
  } finally {
    t.cleanup();
  }
});

// ————————————————— 2. 取消 / 过期 / 关窗 —————————————————

test("指令取消：不落账、无回执、directiveCancelled；未知 id 为 expired；关窗 cancelAll", async () => {
  const t = tempDir("ans-c1-cancel-");
  try {
    const h = makeController(t.dir);
    const pending = h.controller.submitFromInput(approvalInput(t.dir, `@审批 允许 shell "echo hi"`));
    await tick();
    const request = h.confirmRequests[0]!;
    assert.deepEqual(await h.controller.respond({ id: request.request.id, decision: "cancel" }), { ok: true });
    const cancelled = await pending;
    assert.deepEqual(cancelled, { ok: false, error: "cancelled", directiveCancelled: true });
    assert.deepEqual(ledgerEvents(t.dir), []);
    assert.equal(h.notices.length, 0, "取消不发「已记录」回执");

    const unknown = await h.controller.respond({ id: "directive-does-not-exist", decision: "cancel" });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.expired, true);

    const pending2 = h.controller.submitFromInput(approvalInput(t.dir, `@审批 允许 shell "echo again"`));
    await tick();
    h.controller.cancelAll("window-closed");
    assert.deepEqual(await pending2, { ok: false, error: "cancelled", directiveCancelled: true });
    assert.deepEqual(ledgerEvents(t.dir), []);
  } finally {
    t.cleanup();
  }
});

test("输入式撤销：@审批 撤销 #id 经确认后调 runtime.revoke；同 target/active；回执与列表刷新；跨 target/终态直接回错", async () => {
  const t = tempDir("ans-c1-revoke-");
  try {
    const h = makeController(t.dir);
    const created = h.controller.submitFromInput(approvalInput(t.dir, `@审批 允许 shell "echo rev" until=session`));
    await tick();
    const req = h.confirmRequests[0]!;
    assert.equal((await confirm(h, prefillValues(req))).ok, true);
    const createdResult = await created;
    assert.equal(createdResult.ok, true);
    if (!createdResult.ok) return;

    // 跨 target：`@决策 撤销 #<approval id>` ⇒ 直接回错，不开面板、不写账本。
    const cross = await h.controller.submitFromInput(decisionInput(t.dir, `@决策 撤销 #${createdResult.id}`, true));
    assert.deepEqual(cross, { ok: false, error: "target-mismatch" });
    assert.equal(h.confirmRequests.length, 1, "跨 target 不打开撤销面板");

    // 同 target active：面板显示目标摘要，确认后 durable 撤销 + 回执 + 列表刷新。
    const revokePending = h.controller.submitFromInput(approvalInput(t.dir, `@审批 撤销 #${createdResult.id}`));
    await tick();
    assert.equal(h.confirmRequests.length, 2);
    const revokePanel = h.confirmRequests[1]!;
    assert.equal(revokePanel.request.id, `revoke-approval-${createdResult.id}`);
    assert.equal(revokePanel.request.prefill.unrecognized[0], `撤销 #${createdResult.id}`);
    assert.equal((await h.controller.respond({ id: revokePanel.request.id, decision: "confirm" })).ok, true);
    assert.deepEqual(await revokePending, { ok: true, id: createdResult.id, target: "approval" });
    assert.ok(h.notices.some((n) => n.summary === `已撤销审批指令 #${createdResult.id}`));
    const listed = await h.controller.list();
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.approval.active.length, 0);
      assert.equal(listed.approval.revoked[0]!.id, createdResult.id);
    }

    // 终态：已撤销 ⇒ 直接回错（已撤销），不再开面板。
    const second = await h.controller.submitFromInput(approvalInput(t.dir, `@审批 撤销 #${createdResult.id}`));
    assert.deepEqual(second, { ok: false, error: "already-revoked" });
    assert.equal(h.confirmRequests.length, 2);

    // 取消撤销面板：不写账本、目标仍 active、Composer 收到 directiveCancelled。
    const created2 = h.controller.submitFromInput(approvalInput(t.dir, `@审批 允许 shell "echo rev2" until=session`));
    await tick();
    const req2 = h.confirmRequests[2]!;
    assert.equal((await confirm(h, prefillValues(req2))).ok, true);
    const created2Result = await created2;
    assert.equal(created2Result.ok, true);
    if (!created2Result.ok) return;
    const revoke2 = h.controller.submitFromInput(approvalInput(t.dir, `@审批 撤销 #${created2Result.id}`));
    await tick();
    const panel2 = h.confirmRequests[3]!;
    assert.deepEqual(await h.controller.respond({ id: panel2.request.id, decision: "cancel" }), { ok: true });
    assert.deepEqual(await revoke2, { ok: false, error: "cancelled", directiveCancelled: true });
    const listed2 = await h.controller.list();
    assert.equal(listed2.ok, true);
    if (listed2.ok) assert.ok(listed2.approval.active.some((item) => item.id === created2Result.id));
  } finally {
    t.cleanup();
  }
});

// ————————————————— 3. 高危复核 + 提交快照（2×2） —————————————————
test("高危复核：approval 宽命令/forever 未勾选拒绝且面板保持；勾选后落账", async () => {
  const t = tempDir("ans-c1-highrisk-");
  try {
    const h = makeController(t.dir);
    const pending = h.controller.submitFromInput(approvalInput(t.dir, `@审批 允许 shell "rm -rf / && echo done" forever`));
    await tick();
    const request = h.confirmRequests[0]!;
    assert.deepEqual([...request.request.highRisk.reasons].sort(), ["forever", "wide-command"]);
    const rejected = await confirm(h, prefillValues(request));
    assert.equal(rejected.ok, false);
    assert.match(rejected.error ?? "", /高危/);
    assert.equal(h.confirmRequests.length, 1, "拒绝受理时面板保持可重试（不重推、不关闭）");
    assert.deepEqual(ledgerEvents(t.dir), [], "未勾选 ⇒ 零账本事件");
    const accepted = await h.controller.respond({
      id: request.request.id,
      decision: "confirm",
      values: { ...prefillValues(request), acknowledged: true },
    });
    assert.deepEqual(accepted, { ok: true });
    const result = await pending;
    assert.equal(result.ok, true);
    const created = ledgerEvents(t.dir)[0]!;
    assert.deepEqual((created["highRisk"] as { reasons: string[] }).reasons.sort(), ["forever", "wide-command"]);
  } finally {
    t.cleanup();
  }
});

test("AC-13 2×2：decision 项目级 select-recommended 仅在「开关关闭」时高危；flow 范围无该高危", async () => {
  const t = tempDir("ans-c1-ac13-");
  try {
    // 关 × 项目级 ⇒ switch-off-project-recommended；未确认拒绝。
    const h1 = makeController(t.dir);
    const p1 = h1.controller.submitFromInput(decisionInput(t.dir, "@决策 选推荐项 until=once", false));
    await tick();
    const r1 = h1.confirmRequests[0]!;
    assert.deepEqual(r1.request.highRisk.reasons, ["switch-off-project-recommended"]);
    assert.equal((await confirm(h1, prefillValues(r1))).ok, false);
    await h1.controller.respond({ id: r1.request.id, decision: "cancel" });
    await p1;

    // 关 × 单 flow ⇒ 无 project-wide 高危。
    const h2 = makeController(t.dir);
    const p2 = h2.controller.submitFromInput(decisionInput(t.dir, "@决策 选推荐项 flow=focus-a until=once", false));
    await tick();
    const r2 = h2.confirmRequests[0]!;
    assert.deepEqual(r2.request.highRisk.reasons, []);
    assert.equal((await confirm(h2, prefillValues(r2))).ok, true);
    assert.equal((await p2).ok, true);

    // 开 × 项目级 ⇒ 无该高危。
    const h3 = makeController(t.dir);
    const p3 = h3.controller.submitFromInput(decisionInput(t.dir, "@决策 选推荐项 until=once", true));
    await tick();
    const r3 = h3.confirmRequests[0]!;
    assert.deepEqual(r3.request.highRisk.reasons, []);
    assert.equal((await confirm(h3, prefillValues(r3))).ok, true);
    assert.equal((await p3).ok, true);

    // 开 × 单 flow ⇒ 无高危。
    const h4 = makeController(t.dir);
    const p4 = h4.controller.submitFromInput(decisionInput(t.dir, "@决策 选推荐项 flow=focus-b until=once", true));
    await tick();
    const r4 = h4.confirmRequests[0]!;
    assert.deepEqual(r4.request.highRisk.reasons, []);
    assert.equal((await confirm(h4, prefillValues(r4))).ok, true);
    assert.equal((await p4).ok, true);
  } finally {
    t.cleanup();
  }
});

// ————————————————— 4. 幂等 / 重推 / 项目切换 —————————————————

test("幂等与重推：同 clientMessageId 同文只开一张面板、返回同一 id；replayPending 复用同一 requestId", async () => {
  const t = tempDir("ans-c1-idempotent-");
  try {
    const h = makeController(t.dir);
    const input = approvalInput(t.dir, `@审批 允许 shell "echo once"`, { clientMessageId: "cm-1" });
    const first = h.controller.submitFromInput(input);
    const second = h.controller.submitFromInput(input);
    await tick();
    assert.equal(h.confirmRequests.length, 1, "同一幂等键只开一张面板");
    const request = h.confirmRequests[0]!;
    assert.equal(h.controller.replayPending(), 1, "focus/recovery 重推未决面板");
    assert.equal(h.confirmRequests.length, 2);
    assert.equal(h.confirmRequests[1]!.request.id, request.request.id, "重推复用同一 requestId");
    assert.equal((await confirm(h, prefillValues(request))).ok, true);
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(a, b, "同键并发提交返回同一结果");
    assert.equal(a.ok, true);
    if (!a.ok) return;
    const again = await h.controller.submitFromInput(input);
    assert.deepEqual(again, a, "已落账后同键返回同一 id，不重复写");
    assert.equal(ledgerEvents(t.dir).filter((event) => event.kind === "directive.created").length, 1);
    assert.equal(h.confirmRequests.length, 2, "已落账后不再开面板");
  } finally {
    t.cleanup();
  }
});

test("项目切换：未决面板取消、不销毁旧运行时；切回后同一运行内 session 指令仍 active", async () => {
  const other = tempDir("ans-c1-project-b-");
  const t = tempDir("ans-c1-project-a-");
  try {
    const h = makeController(t.dir);
    const sessionDirective = h.controller.submitFromInput(
      approvalInput(t.dir, `@审批 允许 shell "echo session" until=session`),
    );
    await tick();
    const request = h.confirmRequests[0]!;
    assert.equal((await confirm(h, prefillValues(request))).ok, true);
    assert.equal((await sessionDirective).ok, true);

    const pending = h.controller.submitFromInput(approvalInput(t.dir, `@审批 允许 shell "echo pending"`));
    await tick();
    h.controller.setCurrentProject(other.dir);
    assert.deepEqual(await pending, { ok: false, error: "cancelled", directiveCancelled: true }, "项目切换取消未决面板");

    h.controller.setCurrentProject(t.dir);
    const listed = await h.controller.list();
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.ok(
      listed.approval.active.some((item) => item.until === "session"),
      "切回同一运行内 session 指令仍 active（同一 sessionId）",
    );

    // 跨项目 list 请求 fail-closed（渲染侧 projectRoot 只做一致性校验）。
    const cross = await h.controller.list({ projectRoot: other.dir });
    assert.equal(cross.ok, false);
  } finally {
    t.cleanup();
    other.cleanup();
  }
});

// ————————————————— 5. Interface.sendSession 命中拦截 / 卡内入口 —————————————————

interface FakeHandle extends RoleSessionHandle {
  sendCalls: string[];
}

function fakeHandle(): FakeHandle {
  const handle: FakeHandle = {
    sendCalls: [],
    async send(text: string): Promise<void> {
      handle.sendCalls.push(text);
    },
    events() {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              await tick(5);
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
  return handle;
}

function listing(root: string): ProjectListing {
  const role = (roleId: string): ProjectListing["roles"][number] => ({
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
  return {
    projectRoot: root,
    roles: [role("A"), role("B")],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "A",
    governanceModel: "single",
  };
}

function interfaceHarness(
  root: string,
  controller: DirectiveInputController,
  decisionEnabled: boolean,
  extra: { createDirectiveInterpreterFn?: (opts: CreateDirectiveInterpreterOptions) => DirectiveInterpretFn } = {},
) {
  const handles: Record<string, FakeHandle> = { A: fakeHandle(), B: fakeHandle() };
  const events: unknown[] = [];
  const decisionSwitch = createShellJudgeSwitch(decisionEnabled);
  const desktop: DesktopInterface = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: (envelope) => events.push(envelope),
    listProjectFn: async () => listing(root),
    buildProjectConfigFn: buildProjectConfig,
    openRoleSessionFn: async (input) => handles[input.roleId]!,
    envFilePath: path.join(root, ".env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(root, "runtime-selection.json"),
    decisionJudgeSwitch: decisionSwitch,
    directiveInput: controller,
    ...extra,
  });
  return { desktop, handles, events, decisionSwitch };
}

test("sendSession 命中：不调用 manager.send/handle.send、不产生角色轮次；Composer 未开会话仍走指令通道", async () => {
  const t = tempDir("ans-c1-interface-hit-");
  let env: ReturnType<typeof interfaceHarness> | undefined;
  try {
    const h = makeController(t.dir);
    env = interfaceHarness(t.dir, h.controller, false);
    await env.desktop.listProject({ projectRoot: t.dir });
    assert.equal((await env.desktop.openSession({ projectRoot: t.dir, roleId: "A", runtime: "demo" })).ok, true);

    const pending = env.desktop.sendSession({
      text: `@审批 允许 shell "echo hi" until=once`,
      target: { projectRoot: t.dir, roleId: "A", runtime: "demo" },
    });
    await tick();
    const eventsBefore = env.events.length;
    assert.equal(h.confirmRequests.length, 1, "命中即有确认面板");
    assert.equal(env.handles.A.sendCalls.length, 0, "命中绝不 manager.send/handle.send");
    assert.equal(env.events.length, eventsBefore, "命中不发 session:events");
    const request = h.confirmRequests[0]!;
    assert.equal(request.request.decisionGroupEnabled, false, "提交当刻读取 decisionJudgeSwitch 快照");
    assert.equal((await confirm(h, prefillValues(request))).ok, true);
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(result.inputAccepted, undefined);
    assert.equal(result.turnId, undefined);
    assert.equal(result.outcome, undefined);
    assert.equal(result.sessionCurrent, undefined);
    assert.equal(result.directive?.target, "approval");
    assert.match(result.directive?.id ?? "", /^d-[1-9][0-9]*$/);

    // 卡内入口 / Composer 未开会话：B 从未 openSession，但卡载荷 target 仍命中指令通道（不回退普通聊天）。
    const unopened = env.desktop.sendSession({
      text: `@决策 拒绝 until=once`,
      target: { projectRoot: t.dir, roleId: "B", runtime: "demo" },
    });
    await tick();
    assert.equal(h.confirmRequests.length, 2);
    assert.equal(env.handles.B.sendCalls.length, 0, "未开会话也不得回退 manager.send");
    const request2 = h.confirmRequests[1]!;
    assert.equal(request2.request.roleId, "B");
    await h.controller.respond({ id: request2.request.id, decision: "cancel" });
    const cancelled = await unopened;
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.directiveCancelled, true);
    assert.equal(env.handles.B.sendCalls.length, 0);
  } finally {
    if (env !== undefined) await envCleanup(env);
    t.cleanup();
  }
});

async function envCleanup(env: ReturnType<typeof interfaceHarness>): Promise<void> {
  try {
    await env.desktop.stopSession();
  } catch {
    /* 会话已关闭。 */
  }
}

test("sendSession target fail-closed：缺失/非法/跨项目/角色不在清单/无效引擎均不落账、不投递、不回退", async () => {
  const t = tempDir("ans-c1-interface-target-");
  const other = tempDir("ans-c1-interface-other-");
  let env: ReturnType<typeof interfaceHarness> | undefined;
  try {
    const h = makeController(t.dir);
    env = interfaceHarness(t.dir, h.controller, false);
    await env.desktop.listProject({ projectRoot: t.dir });
    await env.desktop.openSession({ projectRoot: t.dir, roleId: "A", runtime: "demo" });
    const text = `@审批 允许 shell "echo hi"`;
    const invalidTargets = [
      undefined,
      { roleId: "A" },
      { projectRoot: t.dir, roleId: "" },
      { projectRoot: other.dir, roleId: "A", runtime: "demo" as const },
      { projectRoot: t.dir, roleId: "nobody", runtime: "demo" as const },
      { projectRoot: t.dir, roleId: "A", runtime: "bogus" as never },
    ];
    for (const target of invalidTargets) {
      const result = await env.desktop.sendSession({ text, ...(target !== undefined ? { target } : {}) });
      assert.equal(result.ok, false, `target ${JSON.stringify(target)} 必须 fail-closed`);
      assert.ok(result.error);
    }
    assert.equal(h.confirmRequests.length, 0, "非法 target 不落账、不呈现");
    assert.equal(env.handles.A.sendCalls.length, 0, "非法 target 不回退普通聊天");
    assert.deepEqual(ledgerEvents(t.dir), []);
  } finally {
    if (env !== undefined) await envCleanup(env);
    t.cleanup();
    other.cleanup();
  }
});

test("sendSession：命中带图直接拒绝（不解码/不投递）；未命中走既有普通聊天（逐字不变）", async () => {
  const t = tempDir("ans-c1-interface-images-");
  let env: ReturnType<typeof interfaceHarness> | undefined;
  try {
    const h = makeController(t.dir);
    env = interfaceHarness(t.dir, h.controller, false);
    await env.desktop.listProject({ projectRoot: t.dir });
    await env.desktop.openSession({ projectRoot: t.dir, roleId: "A", runtime: "demo" });

    const withImage = await env.desktop.sendSession({
      text: `@审批 允许 shell "echo hi"`,
      images: [{ type: "image", data: "aGVsbG8gd29ybGQ=", mimeType: "image/png" }],
      target: { projectRoot: t.dir, roleId: "A", runtime: "demo" },
    });
    assert.equal(withImage.ok, false);
    assert.match(withImage.error ?? "", /图片/);
    assert.equal(h.confirmRequests.length, 0);
    assert.equal(env.handles.A.sendCalls.length, 0);

    const normal = await env.desktop.sendSession({
      text: "普通客户消息",
      target: { projectRoot: t.dir, roleId: "A", runtime: "demo" },
    });
    assert.equal(normal.ok, true);
    assert.deepEqual(env.handles.A.sendCalls, ["普通客户消息"]);
    assert.equal(normal.directive, undefined);
  } finally {
    if (env !== undefined) await envCleanup(env);
    t.cleanup();
  }
});

test("sendSession：未命中标记时普通消息行为逐字不变（含图片校验路径仍在）", async () => {
  const t = tempDir("ans-c1-interface-miss-");
  let env: ReturnType<typeof interfaceHarness> | undefined;
  try {
    const h = makeController(t.dir);
    env = interfaceHarness(t.dir, h.controller, false);
    await env.desktop.listProject({ projectRoot: t.dir });
    await env.desktop.openSession({ projectRoot: t.dir, roleId: "A", runtime: "demo" });
    const badImage = await env.desktop.sendSession({
      text: "普通消息带坏图",
      images: [{ type: "image", data: "aGVsbG8gd29ybGQ=", mimeType: "image/png" }],
      target: { projectRoot: t.dir, roleId: "A", runtime: "demo" },
    });
    assert.equal(badImage.ok, false, "未命中仍走既有图片真实字节重校验（坏图拒发）");
    assert.equal(env.handles.A.sendCalls.length, 0);
    assert.equal(h.confirmRequests.length, 0);
  } finally {
    if (env !== undefined) await envCleanup(env);
    t.cleanup();
  }
});

test("sendSession：未注入指令控制器时命中标记 fail-closed（不回退普通聊天/能力缺席）", async () => {
  const t = tempDir("ans-c1-interface-nocap-");
  const handle = fakeHandle();
  const desktop = createDesktopInterface({
    pickDirectory: async () => null,
    emitEvent: () => {},
    listProjectFn: async () => listing(t.dir),
    buildProjectConfigFn: buildProjectConfig,
    openRoleSessionFn: async () => handle,
    envFilePath: path.join(t.dir, ".env"),
    piConfigEnv: {},
    runtimeStatePath: path.join(t.dir, "runtime-selection.json"),
  });
  try {
    await desktop.listProject({ projectRoot: t.dir });
    await desktop.openSession({ projectRoot: t.dir, roleId: "A", runtime: "demo" });
    const result = await desktop.sendSession({
      text: `@审批 允许 shell "echo hi"`,
      target: { projectRoot: t.dir, roleId: "A", runtime: "demo" },
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /能力不可用/);
    assert.equal(handle.sendCalls.length, 0, "能力缺席也不得回退普通聊天");
  } finally {
    await desktop.stopSession();
    t.cleanup();
  }
});

// ————————————————— 5b. 自然语言解释（2026-11-04 客户直修） —————————————————

test("控制器：自然语言解释成功 ⇒ 面板预填 AI 解释；解释器收到 target/正文/原文/项目/角色/引擎；确认后落账", async () => {
  const t = tempDir("ans-c1-nl-");
  try {
    const calls: DirectiveInterpretRequest[] = [];
    const interpret: DirectiveInterpretFn = async (req) => {
      calls.push(req);
      return {
        ok: true,
        candidate: {
          action: { kind: "allow", resource: { type: "shell", command: "npm install", cwd: "D:/不被采信的目录" } },
          until: "session",
          confidence: 0.9,
        },
        confidence: 0.9,
      };
    };
    const h = makeController(t.dir, "session-c1-nl", { interpret });
    const pending = h.controller.submitFromInput(approvalInput(t.dir, "@审批 让 npm install 跑一次"));
    await waitFor(() => h.confirmRequests.length === 1);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      target: "approval",
      body: "让 npm install 跑一次",
      rawText: "@审批 让 npm install 跑一次",
      projectRoot: t.dir,
      roleId: "A",
      runtime: "demo",
    });
    assert.deepEqual(ledgerEvents(t.dir), [], "确认前绝不落账");
    const request = h.confirmRequests[0]!;
    const action = request.request.prefill.action as { resource?: { type?: string; command?: string; cwd?: string } };
    assert.equal(request.request.confirmable, true);
    assert.equal(action.resource?.type, "shell");
    assert.equal(action.resource?.command, "npm install");
    assert.equal(action.resource?.cwd, t.dir, "cwd 恒为项目根");
    assert.equal(request.request.prefill.until, "session");
    assert.deepEqual(request.request.prefill.unrecognized, []);

    assert.equal((await confirm(h, prefillValues(request))).ok, true);
    const result = await pending;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.id, /^d-[1-9][0-9]*$/);
    const events = ledgerEvents(t.dir);
    assert.equal(events.length, 1);
    assert.equal((events[0] as { action?: { resource?: { command?: string } } }).action?.resource?.command, "npm install");
  } finally {
    t.cleanup();
  }
});

test("控制器：解释失败 ⇒ 回退现有面板（confirmable=false、未识别片段）；伪造确认也不落账", async () => {
  const t = tempDir("ans-c1-nl-fail-");
  try {
    const h = makeController(t.dir, "session-c1-nl-fail", {
      interpret: async () => ({ ok: false, reasonCode: "low-confidence" }),
    });
    const pending = h.controller.submitFromInput(approvalInput(t.dir, "@审批 让 npm install 跑一次"));
    await waitFor(() => h.confirmRequests.length === 1);
    const request = h.confirmRequests[0]!;
    assert.equal(request.request.confirmable, false, "解释失败 ⇒ 面板确认禁用");
    assert.ok(request.request.prefill.unrecognized.includes("让 npm install 跑一次"));

    // 正常 UI 下确认键禁用；即便渲染侧伪造确认，B1 Service 也拒绝空命令（不落账）。
    assert.equal((await confirm(h, prefillValues(request))).ok, true);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.deepEqual(ledgerEvents(t.dir), []);
  } finally {
    t.cleanup();
  }
});

test("控制器：撤销快路径不调用解释器；确认后 durable revoked", async () => {
  const t = tempDir("ans-c1-nl-revoke-");
  try {
    let calls = 0;
    const h = makeController(t.dir, "session-c1-nl-revoke", {
      interpret: async () => {
        calls += 1;
        return { ok: false, reasonCode: "unavailable" };
      },
    });
    const created = h.controller.submitFromInput(approvalInput(t.dir, '@审批 允许 shell "echo rev" until=session'));
    await waitFor(() => h.confirmRequests.length === 1);
    assert.equal((await confirm(h, prefillValues(h.confirmRequests[0]!))).ok, true);
    const createdResult = await created;
    assert.equal(createdResult.ok, true);
    if (!createdResult.ok) return;
    assert.equal(calls, 0, "结构化创建不调用解释器");

    const revoking = h.controller.submitFromInput(approvalInput(t.dir, `@审批 撤销 #${createdResult.id}`));
    await waitFor(() => h.confirmRequests.length === 2);
    assert.equal(calls, 0, "撤销快路径不调用解释器");
    const revokeRequest = h.confirmRequests[1]!;
    assert.equal(revokeRequest.request.confirmable, true);
    assert.equal((await h.controller.respond({ id: revokeRequest.request.id, decision: "confirm" })).ok, true);
    const revoked = await revoking;
    assert.equal(revoked.ok, true);
    const statuses = ledgerEvents(t.dir).map((event) => event.kind);
    assert.deepEqual(statuses, ["directive.created", "directive.revoked"]);
  } finally {
    t.cleanup();
  }
});

test("sendSession：自然语言经 desktop.interpretDirective（SessionManager 同一套 runtimeOptions/adapter 工厂）⇒ 面板预填；确认落账", async () => {
  const t = tempDir("ans-c1-nl-wiring-");
  let env: ReturnType<typeof interfaceHarness> | undefined;
  try {
    const seen: Array<{ opts: CreateDirectiveInterpreterOptions; req: DirectiveInterpretRequest }> = [];
    const h = makeController(t.dir, "session-c1-nl-wiring", {
      interpret: (request) =>
        env === undefined
          ? Promise.resolve({ ok: false as const, reasonCode: "unavailable" as const })
          : env.desktop.interpretDirective(request),
    });
    env = interfaceHarness(t.dir, h.controller, false, {
      createDirectiveInterpreterFn: (opts) => async (req) => {
        seen.push({ opts, req });
        return {
          ok: true,
          candidate: { action: { kind: "allow", resource: { type: "shell", command: "npm install" } }, until: "session", confidence: 0.9 },
          confidence: 0.9,
        };
      },
    });
    await env.desktop.listProject({ projectRoot: t.dir });

    const pending = env.desktop.sendSession({
      text: "@审批 让 npm install 跑一次",
      target: { projectRoot: t.dir, roleId: "A", runtime: "claude" },
    });
    await waitFor(() => h.confirmRequests.length === 1);
    assert.equal(seen.length, 1, "解释器经 SessionManager 构造（同一套 runtimeOptions/adapter 工厂）");
    assert.equal(seen[0]!.req.target, "approval");
    assert.equal(seen[0]!.req.body, "让 npm install 跑一次");
    assert.equal(seen[0]!.opts.runtime, "claude");
    assert.equal(seen[0]!.opts.project.projectRoot, t.dir);
    const request = h.confirmRequests[0]!;
    assert.equal(request.request.confirmable, true);
    assert.equal((request.request.prefill.action as { resource?: { command?: string } }).resource?.command, "npm install");

    assert.equal((await confirm(h, prefillValues(request))).ok, true);
    const result = await pending;
    assert.equal(result.ok, true);
    assert.equal(ledgerEvents(t.dir).length, 1);
    assert.equal(env.handles.A.sendCalls.length, 0, "命中标记绝不回退普通聊天");
  } finally {
    if (env !== undefined) await envCleanup(env);
    t.cleanup();
  }
});

test("sendSession：demo 引擎无判断 AI ⇒ 解释不可用，回退面板（confirmable=false）；不调用解释器工厂", async () => {
  const t = tempDir("ans-c1-nl-demo-");
  let env: ReturnType<typeof interfaceHarness> | undefined;
  try {
    let factoryCalls = 0;
    const h = makeController(t.dir, "session-c1-nl-demo", {
      interpret: (request) =>
        env === undefined
          ? Promise.resolve({ ok: false as const, reasonCode: "unavailable" as const })
          : env.desktop.interpretDirective(request),
    });
    env = interfaceHarness(t.dir, h.controller, false, {
      createDirectiveInterpreterFn: () => {
        factoryCalls += 1;
        return async () => ({ ok: false, reasonCode: "unavailable" });
      },
    });
    await env.desktop.listProject({ projectRoot: t.dir });
    const pending = env.desktop.sendSession({
      text: "@审批 让 npm install 跑一次",
      target: { projectRoot: t.dir, roleId: "A", runtime: "demo" },
    });
    await waitFor(() => h.confirmRequests.length === 1);
    assert.equal(factoryCalls, 0, "demo 不支持解释 ⇒ 不构造解释器");
    const request = h.confirmRequests[0]!;
    assert.equal(request.request.confirmable, false);
    assert.ok(request.request.prefill.unrecognized.includes("让 npm install 跑一次"));
    assert.equal((await h.controller.respond({ id: request.request.id, decision: "cancel" })).ok, true);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.directiveCancelled, true);
    assert.deepEqual(ledgerEvents(t.dir), []);
  } finally {
    if (env !== undefined) await envCleanup(env);
    t.cleanup();
  }
});

test("preload：directive:state 注册即同步回放缓存；订阅后续推送；取消订阅保留顶层缓存监听", async () => {
  const vm = await import("node:vm");
  let api: any;
  const listeners = new Map<string, Array<(event: unknown, payload: unknown) => void>>();
  const ipcRenderer = {
    invoke: async () => ({ ok: false }),
    on: (channel: string, fn: (event: unknown, payload: unknown) => void) => {
      const list = listeners.get(channel) ?? [];
      list.push(fn);
      listeners.set(channel, list);
    },
    removeListener: (channel: string, fn: (event: unknown, payload: unknown) => void) => {
      const list = listeners.get(channel) ?? [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
  };
  vm.runInNewContext(read("app/preload.cjs"), {
    require: (name: string) => {
      assert.equal(name, "electron");
      return {
        contextBridge: { exposeInMainWorld: (_key: string, value: unknown) => { api = value; } },
        ipcRenderer,
      };
    },
  });
  assert.ok(api, "preload 应暴露白名单对象");
  const empty = { active: [], consumed: [], revoked: [], expired: [] };
  const before = { version: 1, directivesEnabled: true, projectRoot: "", approval: empty, decision: empty, ledgerErrors: 0 };
  // 主进程先行推送（订阅前）：preload 顶层监听已缓存最后一条。
  for (const fn of listeners.get("directive:state") ?? []) fn({}, before);
  const seen: unknown[] = [];
  const off = (api.onDirectiveState as (cb: (payload: unknown) => void) => () => void)((payload) => seen.push(payload));
  assert.deepEqual(seen, [before], "注册时同步回放缓存（C2 首帧即可拿到能力位）");
  const after = { ...before, projectRoot: "/p" };
  for (const fn of [...(listeners.get("directive:state") ?? [])]) fn({}, after);
  assert.deepEqual(seen, [before, after]);
  off();
  assert.equal((listeners.get("directive:state") ?? []).length, 1, "取消订阅只移除订阅者，保留顶层缓存监听");
});

// ————————————————— 6. 冻结形状 / 接线源码钉 —————————————————

test("冻结形状：五个 IPC/preload 名、directivesEnabled 握手、应用运行级 sessionId、Q9 旧读者三值", () => {
  const main = read("app/main.ts");
  const preload = read("app/preload.cjs");
  for (const channel of [
    "directive:confirm-request",
    "directive:confirm-response",
    "directive:list",
    "directive:revoke",
    "directive:state",
  ]) {
    assert.ok(main.includes(channel), `main.ts 应接线 ${channel}`);
  }
  assert.ok(main.includes("const directiveSessionId = randomUUID()"), "应用运行级 sessionId 由主进程启动生成");
  assert.ok(main.includes("createDirectiveInputController"), "main.ts 构造 C1 控制器");
  assert.ok(main.includes('win.webContents.on("did-finish-load"'), "directivesEnabled 主进程先行 handshake");
  assert.ok(main.includes("directiveInput.replayPending()"), "focus/show/recovery-ready 重推未决面板");
  assert.ok(main.includes("directiveInput.cancelAll"), "关窗取消未决面板");
  assert.ok(main.includes("directiveInput.setCurrentProject(res.projectRoot)"), "项目切换更新当前项目");

  for (const method of [
    "onDirectiveConfirmRequest",
    "directiveConfirmRespond",
    "listDirectives",
    "revokeDirective",
    "onDirectiveState",
  ]) {
    assert.ok(preload.includes(method), `preload.cjs 白名单应包含 ${method}`);
  }
  assert.ok(preload.includes("lastDirectiveState"), "preload 缓存最后一条 directive:state");
  assert.ok(preload.includes('ipcRenderer.on("directive:state"'), "preload 加载即订阅 state");
  assert.equal(preload.includes("require(\"fs\")"), false, "preload 不暴露 Node 能力");

  const interfaceSource = read("app/desktop/interface.ts");
  assert.ok(interfaceSource.includes("directiveIdFromOperatorId"), "interface.ts Q9 旧读者使用三值归属");
  const sessionSource = readSessionSource();
  assert.equal((sessionSource.match(/directiveIdFromOperatorId/g) ?? []).length >= 3, true, "session.ts Q9 多处使用同一解析");

  // 面板共存（P1-CAP-08/C1 侧）：独立 pending，不占 shell 卡槽/客户卡队列。
  const directiveSource = read("app/desktop/directive-input.ts");
  assert.equal(directiveSource.includes("shellCardSlot"), false, "指令面板不占 shell 卡槽");
  assert.equal(directiveSource.includes("createCustomerInputChannel"), false, "指令面板不进入客户卡队列");
});

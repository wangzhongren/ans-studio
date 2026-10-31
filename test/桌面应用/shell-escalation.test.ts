// test/桌面应用/shell-escalation.test.ts
// 桌面窗口：判拒升级卡呈现端（2026-10-31 shell 判拒客户升级方案 v1.3 §4.3/§4.6/§6.4/§7.1/§7.2）与
// 共享呈现槽仲裁、以及「本次运行暂停自动审批」IPC 语义的单测（不真弹窗、无 electron）。
//
// 覆盖（任务 C1 指定）：
//  · presenter 三选项 / 回执 / 卡内容（判拒原文、argv、cwd、judge 事实、necessity 不可信标注字段）；
//  · 超时 / 推达失败 / replay / 未知 id / 重复回包 / 非法动作（一律默认拒绝，不产生第二次授权）；
//  · 仲裁四组时序：升级卡先到（审批卡在主进程等待、等待期间不启动确认超时）/ 审批卡先到（升级申请直接拒绝）/
//    等待超时（unavailable）/ 轮次中止（unavailable）；
//  · 暂停 IPC：只影响 shell、不影响治理 approval 组、窗口重开保留（模块级单例）/ 重启清零（模块初始化默认值）；
//  · 开关关闭不产生升级卡（升级 presenter 完全不被判拒以外的路径调用）。
//
// 纪律：只经注入替身验证逻辑；**不启动应用**（真实 E2E 归 D2）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ShellEscalationCardRequest } from "../../src/model/runtime.ts";
import { createConfirmCardSlot } from "../../app/desktop/confirm-card.ts";
import {
  buildShellEscalationIpcCard,
  createShellEscalationPresenter,
  isShellEscalationResponse,
  parseShellEscalationAction,
  SHELL_ESCALATION_ACTIONS,
  type ShellEscalationIpcCard,
} from "../../app/desktop/shell-escalation.ts";
import {
  createDesktopOperatorChannel,
  createShellConfirmPresenter,
  describeShellCommand,
  type DesktopOperatorMetadata,
  type ShellConfirmRequest,
} from "../../app/desktop/operator-channel.ts";
import { createShellSessionPauseState } from "../../app/desktop/interface.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "app");

/** 一份典型的判拒卡片请求（字段全部来自 registry 的判拒记录；测试只做替身）。 */
function escalationRequest(overrides: Partial<ShellEscalationCardRequest> = {}): ShellEscalationCardRequest {
  return {
    version: 1,
    requestId: "req-1",
    roleId: "role-A",
    projectRoot: "/proj",
    runtime: "pi",
    command: "npm install lodash",
    argv: ["npm", "install", "lodash"],
    cwd: "/proj",
    judgeReason: "安装新依赖会改动依赖树，属装包风险",
    judgeCustomerMessage: "这条命令会安装新包。",
    judgeAlternative: { kind: "command", value: "npm ci" },
    necessity: "任务要求使用 lodash 的 chunk 函数；没有它无法完成本轮实现。",
    approvalContext: {
      npmScriptName: "install",
      scripts: [
        { label: "package.json#scripts.install", content: "node install.js", bytes: 16, sha256: "a".repeat(64) },
      ],
    },
    expiresAt: "2026-10-31T12:00:00.000Z",
    ...overrides,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor 超时");
    await sleep(5);
  }
}

// ————————————————— 卡数据面：只转抄判拒记录，不信任渲染/模型输入 —————————————————

test("升级卡数据面：命令/argv/cwd/judge 事实逐字取自判拒记录；necessity 原样携带且不作为标题/选项来源", () => {
  const request = escalationRequest();
  const card = buildShellEscalationIpcCard("se-7", request);
  assert.equal(card.version, 1);
  assert.equal(card.kind, "escalation", "同一 shell:confirm-request 通道上以 kind 区分卡族");
  assert.equal(card.id, "se-7", "桌面卡族 id（回包绑定）");
  assert.equal(card.requestId, "req-1", "编排申请 id 原样透传（授权/审计权威 id）");
  assert.equal(card.roleId, "role-A");
  assert.equal(card.projectRoot, "/proj");
  assert.equal(card.runtime, "pi");
  assert.equal(card.command, request.command, "命令原文逐字取自判拒记录（不是模型本次输入）");
  assert.deepEqual(card.argv, ["npm", "install", "lodash"], "argv 规范化后逐项转抄");
  assert.deepEqual(card.argvLines, ['[0] "npm"', '[1] "install"', '[2] "lodash"'], "argv 呈现行与审批卡同口径");
  assert.equal(card.cwd, "/proj");
  assert.equal(card.judgeReason, request.judgeReason);
  assert.equal(card.judgeCustomerMessage, request.judgeCustomerMessage);
  assert.deepEqual(card.judgeAlternative, { kind: "command", value: "npm ci" });
  assert.equal(card.necessity, request.necessity, "necessity 原样携带（渲染侧独立区块 + 「未经验证」标注）");
  assert.equal(card.necessityNote, "由角色提供，未经验证", "必要性区块固定标注由应用生成（A3 i18n），不来自角色文本");
  assert.equal(card.customerNotJudgeNote.includes("客户手批 ≠ judge 放行"), true, "卡片携带「客户手批 ≠ judge 放行」声明（应用生成）");
  assert.deepEqual(card.approvalContext, request.approvalContext, "脚本上下文原样转抄（判拒时同一份）");
  assert.equal(card.expiresAt, request.expiresAt);
  assert.deepEqual(card.actions, ["allow-once", "allow-session", "deny"], "三选一固定；无「允许所有/前缀」/第四决定项");
  assert.equal("title" in card, false, "卡标题不是应用生成字段（渲染侧 i18n；necessity 不得成为标题来源）");
  assert.equal("options" in card, false, "选项不由 payload 自由定义（固定 actions）");
  assert.equal(SHELL_ESCALATION_ACTIONS.length, 3);
});

test("升级卡数据面：可选字段缺席不伪造（不编造 judge 理由/上下文/过期时刻）", () => {
  const lean = buildShellEscalationIpcCard("se-8", {
    version: 1,
    requestId: "req-lean",
    roleId: "role-B",
    projectRoot: "/p2",
    runtime: "claude",
    command: "npm ci",
    argv: ["npm", "ci"],
    cwd: "/p2",
  });
  assert.equal("judgeReason" in lean, false);
  assert.equal("judgeCustomerMessage" in lean, false);
  assert.equal("judgeAlternative" in lean, false);
  assert.equal("necessity" in lean, false);
  assert.equal("necessityNote" in lean, false, "无必要性说明 ⇒ 不展示标注区块");
  assert.equal(typeof lean.customerNotJudgeNote, "string", "客户手批声明恒有（不依赖 necessity）");
  assert.equal("approvalContext" in lean, false);
  assert.equal("expiresAt" in lean, false);
});

// ————————————————— 三选项与回执（allow-once / allow-session / deny） —————————————————

for (const action of ["allow-once", "allow-session", "deny"] as const) {
  test(`升级卡三选项：${action} ⇒ 决定带 operatorId（应用注入）；重复回包不产生第二次授权`, async () => {
    const sent: ShellEscalationIpcCard[] = [];
    const presenter = createShellEscalationPresenter({
      present: (r) => sent.push(r),
      operatorId: "alice",
      cleanupAfterMs: 60_000,
    });
    const pending = presenter.present(escalationRequest());
    assert.equal(sent.length, 1, "卡片推达渲染侧");
    assert.equal(sent[0].kind, "escalation");
    assert.equal(presenter.pendingCount(), 1);
    const response = presenter.respond({ kind: "escalation", id: sent[0].id, action });
    assert.deepEqual(response, { ok: true }, "合法回包受理");
    const decision = await pending;
    assert.deepEqual(decision, { action, operatorId: "alice" }, "决定含客户动作 + 应用注入的 operatorId");
    assert.equal(presenter.pendingCount(), 0);
    // 重复回包：卡片已是终态，绝无第二次授权。
    const again = presenter.respond({ kind: "escalation", id: sent[0].id, action: "allow-once" });
    assert.equal(again.ok, false);
    assert.equal(again.expired, true, "重复回包按失效处理（不产生第二次授权）");
  });
}

test("升级卡回包：未知 id / 非法动作 / 误投布尔回包 ⇒ expired（不放行）；动作解析严格三选一", async () => {
  const sent: ShellEscalationIpcCard[] = [];
  const presenter = createShellEscalationPresenter({
    present: (r) => sent.push(r),
    operatorId: "alice",
    cleanupAfterMs: 60_000,
  });
  assert.deepEqual(parseShellEscalationAction("allow-once"), "allow-once");
  assert.deepEqual(parseShellEscalationAction("allow-session"), "allow-session");
  assert.deepEqual(parseShellEscalationAction("deny"), "deny");
  for (const bad of ["allow-all", "allow", true, null, undefined, "", "ALLOW-ONCE"]) {
    assert.equal(parseShellEscalationAction(bad), undefined, `非法动作 ${String(bad)} 不得放行`);
  }
  const unknown = presenter.respond({ kind: "escalation", id: "se-999", action: "allow-once" });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.expired, true, "未知 id → expired");

  const pending = presenter.present(escalationRequest());
  const card = sent[0];
  // 非法动作：按失效结算（默认拒绝），卡片不会保留到超时。
  const invalid = presenter.respond({ kind: "escalation", id: card.id, action: "allow-all" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.expired, true, "非法动作 → expired（fail-closed）");
  const decision = await pending;
  assert.equal((decision as { action: string }).action, "expired", "客户决定解析为默认拒绝");
  assert.equal("operatorId" in decision, false, "默认拒绝不带操作者批准归因");

  // 误投布尔回包（旧渲染 bug）：升级 presenter 的 respond 只认动作卡回包——缺合法 action 即按失效结算
  // （默认拒绝、不悬挂），绝不放行。
  const sent2: ShellEscalationIpcCard[] = [];
  const presenter2 = createShellEscalationPresenter({ present: (r) => sent2.push(r), cleanupAfterMs: 60_000 });
  const pending2 = presenter2.present(escalationRequest());
  const misrouted = presenter2.respond({ id: sent2[0].id, allow: true });
  assert.equal(misrouted.ok, false);
  assert.equal(misrouted.expired, true);
  assert.equal(presenter2.pendingCount(), 0, "缺合法 action ⇒ 按失效结算（默认拒绝，不悬挂）");
  const decision2 = await pending2;
  assert.equal((decision2 as { action: string }).action, "expired");
});

// ————————————————— 超时 / 中止 / 推达失败 / replay —————————————————

test("升级卡超时：cleanup 兜底 ⇒ expired（默认拒绝）；消耗后不可再答", async () => {
  const sent: ShellEscalationIpcCard[] = [];
  const presenter = createShellEscalationPresenter({ present: (r) => sent.push(r), cleanupAfterMs: 20 });
  const decision = await presenter.present(escalationRequest());
  assert.equal((decision as { action: string }).action, "expired", "超时 = 默认拒绝");
  assert.equal(presenter.pendingCount(), 0);
  const late = presenter.respond({ kind: "escalation", id: sent[0].id, action: "allow-once" });
  assert.equal(late.expired, true, "超时后的回包绝不放行");
});

test("升级卡中止（轮次停止/会话重建/窗口关闭）：expired；关窗 rejectAllPending 全部失效", async () => {
  const presenter = createShellEscalationPresenter({ present: () => {}, cleanupAfterMs: 60_000 });
  const turn = new AbortController();
  const pending = presenter.present(escalationRequest(), turn.signal);
  turn.abort();
  const decision = await pending;
  assert.equal((decision as { action: string }).action, "expired", "中止 = 默认拒绝");
  assert.equal(presenter.pendingCount(), 0);

  const presenter2 = createShellEscalationPresenter({ present: () => {}, cleanupAfterMs: 60_000 });
  const pendingA = presenter2.present(escalationRequest({ requestId: "r2" }));
  void presenter2.present(escalationRequest({ requestId: "r3" }));
  presenter2.rejectAllPending("窗口已关闭");
  assert.equal((await pendingA as { action: string }).action, "expired");
  assert.equal(presenter2.pendingCount(), 0, "关窗 ⇒ 全部挂起失效（fail-closed）");
});

test("升级卡推达失败（窗口已关）：unavailable（默认拒绝）；不残留 pending", async () => {
  const presenter = createShellEscalationPresenter({
    present: () => {
      throw new Error("窗口已关闭，无法呈现 shell 升级请求");
    },
    cleanupAfterMs: 60_000,
  });
  const decision = await presenter.present(escalationRequest());
  assert.equal((decision as { action: string }).action, "unavailable", "推达失败 = 通道不可用（默认拒绝）");
  assert.equal((decision as { action: string; reason?: string }).reason?.includes("窗口已关闭"), true);
  assert.equal(presenter.pendingCount(), 0);
});

test("升级卡 replay：focus/show 幂等重推仍挂起者；已决项不复活", async () => {
  const sent: ShellEscalationIpcCard[] = [];
  const presenter = createShellEscalationPresenter({ present: (r) => sent.push(r), cleanupAfterMs: 60_000 });
  const pending = presenter.present(escalationRequest());
  assert.equal(presenter.replayPending(), 1);
  assert.equal(sent.length, 2, "同一卡重推一次（id 不变）");
  assert.equal(sent[1].id, sent[0].id);
  presenter.respond({ kind: "escalation", id: sent[0].id, action: "deny" });
  assert.deepEqual(await pending, { action: "deny", operatorId: "unknown" }, "缺省 operatorId 归 unknown（不伪造批准人）");
  assert.equal(presenter.replayPending(), 0, "已决项不再重推");
});

test("升级卡按角色挂起视图：roleId 来自判拒记录（看护「正确等待不报」数据面）", async () => {
  const presenter = createShellEscalationPresenter({ present: () => {}, cleanupAfterMs: 60_000 });
  void presenter.present(escalationRequest({ roleId: "role-A" }));
  void presenter.present(escalationRequest({ requestId: "r-b", roleId: "role-B" }));
  assert.deepEqual(presenter.pendingRoles(), new Map([["role-A", 1], ["role-B", 1]]));
  presenter.rejectAllPending("清场");
});

// ————————————————— 共享呈现槽仲裁（方案 §7.2；四组时序） —————————————————

function approvalPrompt() {
  return { command: "npm run build", argv: ["npm", "run", "build"], cwd: "/proj", toolCallId: "call-1" };
}

function approveMetadata(signal: AbortSignal): DesktopOperatorMetadata {
  return { roleId: "role-B", projectRoot: "/proj", runtime: "pi", signal };
}

test("仲裁·升级卡先到：审批卡在主进程等待（不推达渲染）；等待期间不启动确认超时；升级决出后审批卡推达", async () => {
  const slot = createConfirmCardSlot();
  const escSent: ShellEscalationIpcCard[] = [];
  const escalation = createShellEscalationPresenter({ present: (r) => escSent.push(r), slot, cleanupAfterMs: 60_000 });
  const escalationPending = escalation.present(escalationRequest());
  assert.equal(escSent.length, 1, "升级卡先呈现");
  assert.equal(slot.pendingCount(), 1, "槽被升级卡占用");

  const confirmSent: ShellConfirmRequest[] = [];
  const confirm = createShellConfirmPresenter({ present: (r) => confirmSent.push(r), slot, cleanupAfterMs: 60_000 });
  const turn = new AbortController();
  // 操作者确认超时 = 400ms；在升级卡待答期间挂起 120ms（< 等待上限），随后决出升级卡，
  // 再于推达后 300ms 回包 —— 总耗时 ≥ 420ms > 400ms。若确认超时在等待期间已启动，此处必超时；
  // 只有「超时从实际推达开始计时」才能放行。
  const ch = createDesktopOperatorChannel({ presenter: confirm.presenter, operatorId: "alice", timeoutMs: 400 });
  const approval = ch(approvalPrompt(), approveMetadata(turn.signal));
  await sleep(120);
  assert.equal(confirmSent.length, 0, "升级卡待答时审批卡不推达渲染（主进程等待）");
  escalation.respond({ kind: "escalation", id: escSent[0].id, action: "deny" });
  assert.deepEqual(await escalationPending, { action: "deny", operatorId: "unknown" });
  await waitFor(() => confirmSent.length === 1, 500);
  assert.equal(slot.pendingCount(), 1, "槽转由审批卡占用（升级卡已释放）");
  await sleep(300);
  confirm.respond({ id: confirmSent[0].id, allow: true });
  const res = await approval;
  assert.deepEqual(res, { outcome: "allow", operatorId: "alice" }, "确认超时未在等待期间启动（推达后回包仍放行）");
  assert.equal(slot.pendingCount(), 0);
});

test("仲裁·审批卡先到：升级申请返回 pending（不排队、不弹卡、不消耗额度），回执如实提示稍后", async () => {
  const slot = createConfirmCardSlot();
  const confirmSent: ShellConfirmRequest[] = [];
  const confirm = createShellConfirmPresenter({ present: (r) => confirmSent.push(r), slot, cleanupAfterMs: 60_000 });
  const approval = confirm.presenter.present(
    approvalPrompt(),
    describeShellCommand(approvalPrompt()),
    approveMetadata(new AbortController().signal),
  );
  assert.equal(confirmSent.length, 1, "审批卡先呈现");
  const escSent: ShellEscalationIpcCard[] = [];
  const escalation = createShellEscalationPresenter({ present: (r) => escSent.push(r), slot, cleanupAfterMs: 60_000 });
  const decision = await escalation.present(escalationRequest());
  assert.equal((decision as { action: string }).action, "pending", "有审批卡待答 ⇒ 升级申请返回 pending（不是默认拒绝）");
  assert.equal("operatorId" in decision, false, "pending 不是客户决定（不带操作者批准归因）");
  assert.ok((decision as { reason?: string }).reason?.includes("请稍后再申请"), "回执如实提示（不排队）");
  assert.equal(escSent.length, 0, "不开升级卡");
  assert.equal(escalation.pendingCount(), 0);
  confirm.respond({ id: confirmSent[0].id, allow: false });
  assert.deepEqual(await approval, { allow: false });
  assert.equal(slot.pendingCount(), 0);
});

test("仲裁·已有升级卡待答：第二个角色的升级申请同样返回 pending；槽释放后可再申请", async () => {
  const slot = createConfirmCardSlot();
  const sent: ShellEscalationIpcCard[] = [];
  const first = createShellEscalationPresenter({ present: (r) => sent.push(r), slot, cleanupAfterMs: 60_000 });
  const firstPending = first.present(escalationRequest({ requestId: "r-a", roleId: "role-A" }));
  const second = createShellEscalationPresenter({ present: () => {}, slot, cleanupAfterMs: 60_000 });
  const blocked = await second.present(escalationRequest({ requestId: "r-b", roleId: "role-B" }));
  assert.equal((blocked as { action: string }).action, "pending", "已有升级卡待答 ⇒ 第二张返回 pending（跨角色同窗口 1 张）");
  assert.equal(sent.length, 1, "不弹第二张升级卡");
  first.respond({ kind: "escalation", id: sent[0].id, action: "deny" });
  assert.deepEqual(await firstPending, { action: "deny", operatorId: "unknown" });
  assert.equal(slot.pendingCount(), 0, "槽释放后不再阻塞");
  const retryPending = second.present(escalationRequest({ requestId: "r-b", roleId: "role-B" }));
  assert.equal(second.pendingCount(), 1, "pending 不消耗申请：槽空闲后可再次申请并弹卡");
  second.rejectAllPending("清场");
  assert.equal((await retryPending as { action: string }).action, "expired");
});

test("仲裁·等待超时：升级卡久不决出 ⇒ 审批卡按 unavailable fail-closed，且从未推达渲染", async () => {
  const slot = createConfirmCardSlot();
  const escSent: ShellEscalationIpcCard[] = [];
  const escalation = createShellEscalationPresenter({ present: (r) => escSent.push(r), slot, cleanupAfterMs: 60_000 });
  void escalation.present(escalationRequest());
  const confirmSent: ShellConfirmRequest[] = [];
  const confirm = createShellConfirmPresenter({ present: (r) => confirmSent.push(r), slot, cleanupAfterMs: 60_000 });
  const ch = createDesktopOperatorChannel({ presenter: confirm.presenter, operatorId: "alice", timeoutMs: 30 });
  const approval = await ch(approvalPrompt(), approveMetadata(new AbortController().signal));
  assert.equal(approval.outcome, "unavailable", "等待上限 ⇒ unavailable（fail-closed，绝不静默放行）");
  assert.equal(confirmSent.length, 0, "等待超时的审批卡从未推达渲染");
  escalation.rejectAllPending("清场");
  assert.equal(slot.pendingCount(), 0);
});

test("仲裁·轮次中止：等待槽位期间中止 ⇒ 审批卡 unavailable，不推达、不泄漏槽", async () => {
  const slot = createConfirmCardSlot();
  const escalation = createShellEscalationPresenter({ present: () => {}, slot, cleanupAfterMs: 60_000 });
  void escalation.present(escalationRequest());
  const confirmSent: ShellConfirmRequest[] = [];
  const confirm = createShellConfirmPresenter({ present: (r) => confirmSent.push(r), slot, cleanupAfterMs: 60_000 });
  const turn = new AbortController();
  const ch = createDesktopOperatorChannel({ presenter: confirm.presenter, operatorId: "alice", timeoutMs: 60_000 });
  const approval = ch(approvalPrompt(), approveMetadata(turn.signal));
  await sleep(20);
  turn.abort();
  const result = await approval;
  assert.equal(result.outcome, "unavailable", "轮次中止 ⇒ unavailable（fail-closed）");
  assert.equal(confirmSent.length, 0);
  escalation.rejectAllPending("清场");
  assert.equal(slot.pendingCount(), 0);
});

test("仲裁·恢复卡不参与共享槽：未配置 slot 的核不改变既有「等待客户不设限」语义", async () => {
  const slot = createConfirmCardSlot();
  const escalation = createShellEscalationPresenter({ present: () => {}, slot, cleanupAfterMs: 60_000 });
  void escalation.present(escalationRequest());
  // 恢复卡（recovery-channel）不配置 slot ⇒ 即便升级卡占用槽位，恢复卡的 pending 也不进槽。
  const { createRecoveryConfirmPresenter } = await import("../../app/desktop/recovery-channel.ts");
  const recovery = createRecoveryConfirmPresenter({ present: () => {}, operatorId: "ops" });
  void recovery.present(
    { roleId: "su", action: "abort-turn", evidence: "证据" },
    { roleId: "su", projectRoot: "/proj", runtime: "demo" },
  );
  assert.equal(slot.pendingCount(), 1, "槽只计 shell 卡族（升级卡），恢复卡不计入");
  assert.equal(recovery.pendingCount(), 1);
  escalation.rejectAllPending("清场");
  recovery.rejectAllPending("清场");
});

// ————————————————— 回包路由与开关关闭 —————————————————

test("回包路由：kind/action 区分升级与审批；旧回包 {id, allow} 绝不误路由", () => {
  assert.equal(isShellEscalationResponse({ kind: "escalation", id: "se-1", action: "deny" }), true);
  assert.equal(isShellEscalationResponse({ id: "se-1", action: "allow-once" }), true, "无 kind 但有 action ⇒ 升级（兼容）");
  assert.equal(isShellEscalationResponse({ id: "sc-1", allow: true }), false, "旧审批回包 ⇒ 审批");
  assert.equal(isShellEscalationResponse({ kind: "approval", id: "sc-1", allow: true }), false);
  assert.equal(isShellEscalationResponse(null), false);
  assert.equal(isShellEscalationResponse("x"), false);
});

test("开关关闭：既有确认路径逐字不变；不产生升级卡、升级 presenter 不被调用", async () => {
  const escSent: ShellEscalationIpcCard[] = [];
  const escalation = createShellEscalationPresenter({ present: (r) => escSent.push(r), cleanupAfterMs: 60_000 });
  let judgeCalls = 0;
  let presented = 0;
  const ch = createDesktopOperatorChannel({
    presenter: {
      async present() {
        presented += 1;
        return { allow: true };
      },
    },
    operatorId: "alice",
    judge: { isEnabled: () => false },
    emitJudgeResult: () => {
      throw new Error("开关关闭不该发 judge 结果行");
    },
  });
  const res = await ch(
    { command: "npm install lodash", argv: ["npm", "install", "lodash"], cwd: "/proj", toolCallId: "call-1" },
    { ...approveMetadata(new AbortController().signal), judge: async () => { judgeCalls += 1; return { verdict: "deny", reason: "x", reasonCode: "risky" }; } },
  );
  assert.deepEqual(res, { outcome: "allow", operatorId: "alice" }, "开关关 ⇒ 既有客户手批路径（逐字不变）");
  assert.equal(judgeCalls, 0, "开关关不调用 judge");
  assert.equal(presented, 1, "走既有审批卡");
  assert.equal(escSent.length, 0, "开关关不产生升级卡");
  assert.equal(escalation.pendingCount(), 0);
});

// ————————————————— 「本次运行暂停自动审批」 —————————————————

test("暂停状态机：只接受 {paused:boolean}；非法输入不改状态；默认未暂停（重启清零的模块初值）", () => {
  const state = createShellSessionPauseState();
  assert.equal(state.isPaused(), false, "新实例默认未暂停（应用重启 = 模块重新初始化 ⇒ 清零）");
  assert.deepEqual(state.set({ paused: true }), { version: 1, ok: true, paused: true });
  assert.equal(state.isPaused(), true);
  // 非法输入：不改状态（回复里给出当前真实状态）。
  for (const bad of [null, undefined, [], "true", 1, {}, { paused: "true" }, { paused: true, extra: 1 }]) {
    const reply = state.set(bad);
    assert.equal(reply.ok, false, `非法输入 ${JSON.stringify(bad)} 必须被拒`);
    assert.equal(reply.paused, true, "非法输入不改状态（仍为 true）");
  }
  assert.deepEqual(state.set({ paused: false }), { version: 1, ok: true, paused: false }, "恢复 = 回到持久化开关值");
  assert.equal(state.isPaused(), false);
  state.set({ paused: true });
  state.reset();
  assert.equal(state.isPaused(), false, "reset 显式复位（测试/显式重置）");
});

test("暂停 IPC 接线：main.ts 模块级单例、shell-only 生效、不影响治理 approval 组、推送含 paused", () => {
  const mainSrc = fs.readFileSync(path.join(APP_DIR, "main.ts"), "utf8");
  // 状态本体：模块级单例（在 createWindow/registerIpc 之外声明——跨窗口重开保留；重启由模块初始化清零）。
  const declaration = mainSrc.indexOf("const shellSessionPaused = createShellSessionPauseState();");
  assert.ok(declaration >= 0, "main.ts 模块级持有暂停状态单例");
  assert.ok(declaration < mainSrc.indexOf("function createWindow"), "声明位于窗口工厂之前（模块作用域，非每窗口状态）");
  assert.equal(mainSrc.includes("shellSessionPaused.reset("), false, "窗口重开/重载不复位暂停（重启清零只靠模块初始化）");
  // shell-only 有效值：持久化开关 && !paused。
  assert.ok(
    mainSrc.includes("isEnabled: () => shellJudgeSwitch.isEnabled() && !shellSessionPaused.isPaused()"),
    "shell 操作者通道的有效开关叠加暂停（不改持久化开关）",
  );
  // 治理 approval 组仍只看全局开关（暂停不波及）。
  assert.ok(
    mainSrc.includes('group === "approval" ? shellJudgeSwitch.isEnabled() : decisionJudgeSwitch.isEnabled()'),
    "customer-input 的 approval 判断组未读取暂停状态",
  );
  // shell:judge-pause IPC + sender 校验 + 推送 paused。
  assert.ok(mainSrc.includes('registerHandler("shell:judge-pause"'), "新增 shell:judge-pause 通道");
  assert.ok(
    /registerHandler\("shell:judge-pause", \(event, input\) => \{\s*if \(!isShellJudgeIpcSender\(event\.sender, win\.webContents\)\)/.test(mainSrc),
    "暂停通道沿用 shell:judge-* 的 sender 校验",
  );
  assert.ok(mainSrc.includes("paused: shellSessionPaused.isPaused()"), "shell:judge-state 推送与 shell:judge-get 读取均含 paused");
  // shell:judge-set 的字段校验路径不变（仍只经 shellJudgeSwitch.set）。
  assert.ok(mainSrc.includes("const result = await desktop.setShellJudgeEnabled(input);"), "shell:judge-set 校验/持久化路径不变");
});

test("preload 受限桥：新增暂停与升级回包方法（白名单；不暴露 Node 能力）", () => {
  const preloadSrc = fs.readFileSync(path.join(APP_DIR, "preload.cjs"), "utf8");
  assert.ok(preloadSrc.includes("setShellJudgePaused:"), "preload 暴露 setShellJudgePaused");
  assert.ok(preloadSrc.includes('ipcRenderer.invoke("shell:judge-pause", { paused: paused === true })'), "暂停只提交布尔意图");
  assert.ok(preloadSrc.includes("shellEscalationRespond:"), "preload 暴露升级卡回包方法");
  assert.ok(preloadSrc.includes('kind: "escalation"'), "升级回包带 kind 供主进程路由");
  assert.ok(preloadSrc.includes('ipcRenderer.invoke("shell:confirm-response"'), "复用既有 shell:confirm-response 通道");
  assert.equal(/require\(["']node:/.test(preloadSrc) || preloadSrc.includes("process."), false, "preload 不暴露/引用 Node 能力");
  // 既有审批回包方法保持不变（恰 allow:true）。
  assert.ok(
    preloadSrc.includes("allow: !!(input && input.allow === true)"),
    "既有 shellConfirmRespond 的布尔契约逐字保留",
  );
});

// test/桌面UI/judge.test.ts
// Phase 3B 纯逻辑：judge 结果映射 / 双开关状态映射 / 一次性警告 / 确认卡标题与档位。

import test from "node:test";
import assert from "node:assert/strict";
import {
  DECISION_JUDGE_OFF_LABEL,
  DECISION_JUDGE_SINGLE_NOTE,
  governanceJudgeResultView,
  judgeBridgeAvailable,
  judgeToggleView,
  judgeWarningLines,
  judgeWarningStep,
  JUDGE_GROUP_APPROVAL,
  JUDGE_GROUP_DECISION,
  JUDGE_BRIDGE_MISSING,
  recoveryActionView,
  shellConfirmTitle,
  shellJudgeResultView,
  shellJudgeToggleResult,
  suApprovalTierLabel,
} from "../../app/renderer/src/chat/judge.ts";

test("shell 判断结果：allow/deny 视图逐字；manual 不产生结果行", () => {
  const allow = shellJudgeResultView({
    version: 1,
    id: "sj-1",
    verdict: "allow",
    tier: "deny",
    hardDenyOverride: true,
    label: "deny 档 · judge 放行",
    summary: "构建项目",
    engine: "claude",
    operator: "judge:claude",
    at: "2026-10-17T10:00:00Z",
    command: "npm run build",
    cwd: "/proj",
  });
  assert.ok(allow);
  assert.equal(allow!.verdict, "allow");
  assert.equal(allow!.denyOverride, true);
  assert.equal(allow!.title, "已替你放行（自动代理 · 代审批 · deny 档）");
  assert.equal(allow!.label, "deny 档 · judge 放行");
  assert.equal(allow!.engineText, "判断引擎：Claude");
  assert.equal(allow!.operatorText, "operator:judge:claude");
  assert.equal(allow!.tierText, "档位：deny");
  assert.ok(allow!.lines.join("\n").includes("该命令属于硬拒类"));
  assert.equal(allow!.details.hardDenyOverride, true);

  const deny = shellJudgeResultView({
    verdict: "deny",
    tier: "risky",
    summary: "删除源码目录",
    reason: "会删除未提交源码",
    customerMessage: "该命令会删除项目源码，风险过高。",
    alternative: { kind: "command", value: "rm -rf dist", rationale: "只清理构建产物" },
    engine: "pi",
  });
  assert.ok(deny);
  assert.equal(deny!.denyOverride, false);
  assert.equal(deny!.title, "未放行（自动代理 · 代审批）");
  assert.equal(deny!.tierText, "档位：risky");
  assert.ok(deny!.lines.includes("判断理由：会删除未提交源码"));
  assert.ok(deny!.lines.includes("替代方案：rm -rf dist（只清理构建产物）"));
  assert.ok(deny!.lines.includes("该命令会删除项目源码，风险过高。"));
  assert.ok(deny!.retryHint.includes("关闭「替我审批」后重试"));
  // AC-19（2026-10-31）：新出路措辞（上面的旧子串兜底断言保留）。
  assert.ok(deny!.retryHint.includes("可让角色申请客户确认"));

  assert.equal(shellJudgeResultView({ verdict: "manual", reasonCode: "timeout" }), null);
  assert.equal(shellJudgeResultView({}), null);
});

test("治理代批结果：分组/结论/理由/路径/统计逐项映射；未知分组不产生行", () => {
  const proposal = governanceJudgeResultView({
    version: 1,
    group: "decision",
    cardKind: "proposal",
    flowId: "flow-a",
    engine: "claude",
    reason: "提案范围清晰",
    selected: ["accept"],
    evidence: ["docs/proposals/flow-a-v1.md"],
    durationMs: 1200,
    readCalls: 2,
    readBytes: 4096,
    toolCallId: "gov-call",
    requestId: "gov-req",
    requestTitle: "写 bookmark-qa 角色卡",
  });
  assert.ok(proposal);
  assert.equal(proposal!.title, "judge 代批 · 代决策");
  assert.equal(proposal!.requestTitle, "写 bookmark-qa 角色卡");
  assert.equal(proposal!.headline, "接受提案（accept） · 流程 flow-a");
  assert.equal(proposal!.operatorText, "operator:judge:claude");
  assert.equal(proposal!.kindClass, "proposal");
  assert.equal(proposal!.isAuto, true);
  assert.equal(proposal!.sourceLabel, "自动代理");
  assert.ok(proposal!.customerNote.includes("自动代批 ≠ 客户手批"));
  assert.deepEqual(proposal!.details.evidence, ["docs/proposals/flow-a-v1.md"]);
  assert.equal(proposal!.details.durationMs, 1200);

  const write = governanceJudgeResultView({
    group: "approval",
    cardKind: "appointment-write",
    engine: "pi",
    paths: ["docs/a.md", "docs/b.md"],
    pathDecisions: [{ path: "docs/a.md", ok: true }, { path: "docs/b.md", ok: false, reason: "越界" }],
  });
  assert.ok(write);
  assert.equal(write!.title, "judge 代批 · 代审批");
  assert.equal(write!.headline, "确认写入 2 个路径（docs/a.md、docs/b.md）");
  assert.equal(write!.kindClass, "write");
  assert.deepEqual(write!.details.pathDecisions[1], {
    path: "docs/b.md",
    ok: false,
    reason: "越界",
  });

  const acceptance = governanceJudgeResultView({
    group: "decision",
    cardKind: "acceptance",
    selected: ["accept"],
  });
  assert.equal(acceptance!.kindClass, "acceptance");
  const appointment = governanceJudgeResultView({ group: "decision", cardKind: "appointment" });
  assert.equal(appointment!.kindClass, "appointment");
  const unknown = governanceJudgeResultView({ group: "approval", cardKind: "schedule-write" });
  assert.equal(unknown!.kindClass, "generic");
  const generic = governanceJudgeResultView({ group: "approval", cardKind: "mystery" });
  assert.equal(generic!.kindClass, "generic");

  assert.equal(governanceJudgeResultView({ group: "unknown" }), null);
});

test("双开关视图：桥缺失禁用并显示固定文案；single 禁用代决策；busy 只禁用", () => {
  const missing = judgeToggleView(JUDGE_GROUP_APPROVAL, false, false, false, null);
  assert.equal(missing.disabled, true);
  assert.equal(missing.checked, false);
  assert.equal(missing.label, JUDGE_BRIDGE_MISSING);
  assert.equal(missing.title, JUDGE_BRIDGE_MISSING);

  const on = judgeToggleView(JUDGE_GROUP_APPROVAL, true, true, false, null);
  assert.equal(on.checked, true);
  assert.equal(on.label, "替我审批中 · 自动代理");
  const busy = judgeToggleView(JUDGE_GROUP_APPROVAL, true, true, true, null);
  assert.equal(busy.disabled, true);
  assert.equal(busy.checked, true);

  const single = judgeToggleView(JUDGE_GROUP_DECISION, true, true, false, {
    singleDisabled: true,
  });
  assert.equal(single.checked, false);
  assert.equal(single.disabled, true);
  assert.equal(single.label, DECISION_JUDGE_OFF_LABEL);
  assert.equal(single.note, DECISION_JUDGE_SINGLE_NOTE);
});

test("桥可用性：四个方法齐备才算可用（两组独立）", () => {
  const full = {
    getShellJudgeState: () => undefined,
    setShellJudgeEnabled: () => undefined,
    onShellJudgeState: () => undefined,
    onShellJudgeResult: () => undefined,
  };
  assert.equal(judgeBridgeAvailable(full, JUDGE_GROUP_APPROVAL), true);
  assert.equal(judgeBridgeAvailable(full, JUDGE_GROUP_DECISION), false);
  assert.equal(judgeBridgeAvailable(null, JUDGE_GROUP_APPROVAL), false);
});

test("一次性警告：每次开启只显示一次；关闭复位；两组各一次", () => {
  assert.deepEqual(judgeWarningStep(false, false), { shown: false, show: false });
  assert.deepEqual(judgeWarningStep(true, false), { shown: true, show: true });
  assert.deepEqual(judgeWarningStep(true, true), { shown: true, show: false });
  assert.deepEqual(judgeWarningStep(false, true), { shown: false, show: false });

  const approval = judgeWarningLines([JUDGE_GROUP_APPROVAL]);
  assert.ok(approval[0].text.includes("替我审批中：shell 命令与写盘/写卡确认"));
  assert.ok(approval.some((line) => line.text.includes("按所属开关回落逐张卡")));
  assert.ok(approval.some((line) => line.text.includes("judge 代批 · 代审批/代决策")));
  const both = judgeWarningLines([JUDGE_GROUP_APPROVAL, JUDGE_GROUP_DECISION]);
  assert.ok(both.some((line) => line.text.includes("替我决策中：提案接受、任命、验收")));
});

test("开关回包：ok 采用主进程值；失败保持原状态并给出错误", () => {
  assert.deepEqual(shellJudgeToggleResult(false, { ok: true, enabled: true }), {
    enabled: true,
    error: "",
  });
  assert.deepEqual(shellJudgeToggleResult(true, { ok: false, error: "离线受控拒绝" }), {
    enabled: true,
    error: "离线受控拒绝",
  });
  assert.ok(shellJudgeToggleResult(false, null).error.includes("通道异常"));
});

test("确认卡标题/档位/恢复动作：逐字沿用旧文案；未知不编语义", () => {
  assert.equal(shellConfirmTitle("su-approval", "A"), "SU 命令审批");
  assert.equal(shellConfirmTitle("project", "A"), "shell 命令请求");
  assert.equal(shellConfirmTitle("su-approval", "chief"), "命令审批 · 幕僚");
  assert.equal(shellConfirmTitle("su-approval", "product"), "命令审批 · 产品");
  assert.equal(shellConfirmTitle("su-approval", "verifier"), "命令审批 · 质检");
  assert.equal(suApprovalTierLabel("deny"), "硬拒类（deny）");
  assert.equal(suApprovalTierLabel("risky"), "风险命令（risky）");
  assert.equal(suApprovalTierLabel("review"), "未自动判定（review）");
  assert.equal(suApprovalTierLabel("unknown"), "");
  assert.deepEqual(recoveryActionView("abort-turn"), {
    label: "停止本轮",
    note: "停该角色当前轮次；不销毁会话。",
  });
  assert.equal(recoveryActionView("mystery"), null);
});

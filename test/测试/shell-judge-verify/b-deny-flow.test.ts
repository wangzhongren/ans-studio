// test/测试/shell-judge-verify/b-deny-flow.test.ts
// 测试角色：judge deny（有/无替代方案、结果行失败）全链独立验证（2026-10-17）。
//
// 覆盖（PM 评审 §12.2-2/3/13 与 §12.1 A5/A6/A6d/A23/A29）：
//   · deny + 替代方案：0 卡、结果行、请求角色收到 §8.4 文本（含替代方案）、审计 deny + judge；
//   · deny 无替代方案：0 卡、运行时合成 customerMessage + 标准出路、仍 deny、customerMessageSynthesized；
//   · deny 结果行投达失败：仍 deny（拒绝是安全方向）、0 卡、审计仍归判断 agent；
//   · 应用不自动重试/不自动执行替代方案（gate 只返回一次结论）。
//
// 全部离线；假适配器/假渲染；不读 `.env`、不触真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lastAudit,
  loadUiLabels,
  makeChain,
  makeJudge,
  makeTempProject,
  REQUEST,
  setJudgeEnabled,
} from "./fixture.ts";

const EXIT_LINE = /关闭[「『]替我审批[」』]后重试/;

test("judge deny + 替代方案：0 卡、结果行、请求角色收到原因+替代方案、审计 deny + judge", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "pi",
      script: {
        report: {
          verdict: "deny",
          reason: "全量测试会修改共享数据；当前任务只需单元测试",
          customerMessage: "这一步没有必要；建议先跑单元测试。",
          evidence: ["docs/plan.md"],
          alternative: { kind: "command", value: "npm run test:unit", rationale: "范围更小且可逆" },
        },
      },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "pi",
      judge,
      classify: "risky",
      operatorOnly: true,
    });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("deny-alt-1"));
    assert.equal(result.allow, false);
    assert.equal(chain.displays.length, 0, "deny 必须 0 张确认卡");
    assert.equal(fake.seen.binds, 1);

    // 文案来源：共享 i18n `main.operator.judgeDeniedHead`（2026-10 B1 起为「自动代理」）。
    assert.match(result.reason, /^自动代理未放行该命令。/);
    assert.match(result.reason, /请向客户说明：这一步没有必要/);
    assert.match(result.reason, /原因：全量测试会修改共享数据/);
    assert.match(result.reason, /替代方案（command）：npm run test:unit/);
    // 2026-10-31 方案 v1.3 §4.6/AC-19：判拒出路升级为「可申请客户确认 + 关闭开关兜底」；
    // 逐字断言新全文（仍保留「关闭」「替我审批」「重试」三词的兜底语义，不放宽）。
    assert.match(
      result.reason,
      /出路：如确属推进必需，可调用 request_shell_escalation 对这条精确命令申请客户确认（每会话一次）；或关闭「替我审批」后重试。/,
    );

    assert.equal(chain.rows.length, 1);
    const row = chain.rows[0]!;
    assert.equal(row.verdict, "deny");
    assert.equal(row.operator, "judge:pi");
    assert.equal(row.reasonCode, "safer-alternative");
    assert.deepEqual(row.alternative, {
      kind: "command",
      value: "npm run test:unit",
      rationale: "范围更小且可逆",
    });
    assert.match(row.customerMessage ?? "", /建议先跑单元测试/);

    const record = lastAudit(chain);
    assert.equal(record.conclusion, "deny");
    assert.equal(record.branch, "c-risky→a-deny");
    assert.ok(record.by.endsWith("→ operator:judge:pi"));
    assert.equal(record.judge?.verdict, "deny");
    assert.equal(record.judge?.reasonCode, "safer-alternative");
    assert.deepEqual(record.judge?.alternative, {
      kind: "command",
      value: "npm run test:unit",
      rationale: "范围更小且可逆",
    });
    assert.equal(record.judge?.customerMessageSynthesized, true, "运行时补齐了标准出路 ⇒ 标记为已合成");
    assert.match(row.customerMessage ?? "", EXIT_LINE);

    const UL = await loadUiLabels();
    const view = UL.shellJudgeResultView(row);
    assert.ok(view !== null);
    // 文案来源：共享 i18n `ui.judge.notApproved`。
    assert.equal(view.title, "未放行（自动代理 · 代审批）");
    assert.equal(view.operatorText, "operator:judge:pi");
    assert.ok(view.lines.some((line) => line.includes("替代方案：npm run test:unit")));
    assert.ok(view.lines.some((line) => line.includes("建议先跑单元测试")));
    assert.match(view.retryHint, /关闭「替我审批」后重试/);
  } finally {
    await project.cleanup();
  }
});

test("judge deny 无替代方案：0 卡、合成 customerMessage + 标准出路、仍 deny", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "codex",
      script: {
        // 模型未给 customerMessage ⇒ 运行时合成；不完整也不能变成 manual/allow。
        report: { verdict: "deny", reason: "当前任务只要求检查类型，不要求运行测试" },
      },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "codex",
      judge,
      classify: "review",
      operatorOnly: true,
    });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("deny-noalt-1"));
    assert.equal(result.allow, false);
    assert.equal(chain.displays.length, 0, "无替代方案也必须 0 卡");
    // 文案来源：共享 i18n `main.operator.judgeDeniedHead`。
    assert.match(result.reason, /自动代理未放行该命令。/);
    // 2026-10-19 编排把 shell 判断定位为「系统风险审查」（客户修正：不审业务必要性），
    // 合成 customerMessage 的前缀随之改为「存在系统风险或无法确认安全」；仍要求同一句话
    // 说明风险来源并给出下一步（语义与强度不变）。
    // 文案来源：`src/common/编排/shell-judge-verdict.ts` 的 synthesizeCustomerMessage
    //（2026-10-25 客户可见文案统一：「判断 agent」→「自动代理」）。
    assert.match(result.reason, /请向客户说明：自动代理认为该命令存在系统风险或无法确认安全/);
    assert.match(result.reason, EXIT_LINE);

    assert.equal(chain.rows.length, 1);
    const row = chain.rows[0]!;
    assert.equal(row.verdict, "deny");
    assert.equal(row.reasonCode, "no-alternative");
    assert.equal(row.alternative, undefined);
    assert.equal(row.customerMessageSynthesized, true);
    assert.match(row.customerMessage ?? "", EXIT_LINE);

    const record = lastAudit(chain);
    assert.equal(record.conclusion, "deny");
    assert.equal(record.judge?.reasonCode, "no-alternative");
    assert.equal(record.judge?.customerMessageSynthesized, true);
    assert.match(record.judge?.customerMessage ?? "", EXIT_LINE);

    const UL = await loadUiLabels();
    const view = UL.shellJudgeResultView(row);
    assert.ok(view !== null);
    // 文案来源：共享 i18n `ui.judge.notApproved`。
    assert.equal(view.title, "未放行（自动代理 · 代审批）");
    assert.ok(view.lines.some((line) => EXIT_LINE.test(line)), "结果行必须显示同一说明与出路");
  } finally {
    await project.cleanup();
  }
});

test("deny 结果行投达失败：仍 deny、0 卡、审计仍归判断 agent", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: {
        report: {
          verdict: "deny",
          reason: "任务不需要该命令",
          alternative: { kind: "tool", value: "运行只读检查工具" },
        },
      },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      operatorOnly: true,
      emitJudgeResult: () => { throw new Error("渲染进程不可用"); },
    });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("deny-row-fail-1"));
    assert.equal(result.allow, false, "deny 行投达失败仍必须 deny");
    assert.equal(chain.rows.length, 0);
    assert.equal(chain.displays.length, 0, "deny 不得回落确认卡");
    assert.match(result.reason, /替代方案（tool）：运行只读检查工具/);
    const record = lastAudit(chain);
    assert.equal(record.conclusion, "deny");
    assert.ok(record.by.endsWith("→ operator:judge:claude"));
    assert.equal(record.judge?.verdict, "deny");
    assert.equal(record.judge?.reasonCode, "safer-alternative");
  } finally {
    await project.cleanup();
  }
});

test("deny 后应用不自动重试：一次 gate 调用只产生一次判断与一条结论", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { report: { verdict: "deny", reason: "不必要" } },
    });
    const chain = makeChain({ root: project.root, runtime: "claude", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);
    const result = await chain.gate(REQUEST("no-auto-retry-1"));
    assert.equal(result.allow, false);
    assert.equal(fake.seen.binds, 1, "不得自动重试判断");
    assert.equal(fake.seen.prompts.length, 1);
    assert.equal(chain.rows.length, 1, "不得自动发新请求/自动执行替代方案");
    assert.equal(chain.displays.length, 0);
  } finally {
    await project.cleanup();
  }
});

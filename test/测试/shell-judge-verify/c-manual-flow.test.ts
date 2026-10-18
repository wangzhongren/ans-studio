// test/测试/shell-judge-verify/c-manual-flow.test.ts
// 测试角色：判断手动回落（不可用/超时/解析失败/读取损伤/预算/截断/防循环/引擎不支持）
// 与结果行投达失败分叉的独立验证（2026-10-17）。
//
// 覆盖（PM 评审 §12.2-4/5/13 与 §12.1 A7/A8/A9/A10/A11/A17/A20/A26/A29）：
//   · 判断没发生/无法完成 ⇒ 原确认卡 + `judgeNotice`、审计人工（不写 judge）、0 结果行；
//   · **真实 createShellJudge + 假适配器/真 judge 读取统计**：allow + 读取被拒/预算/截断 ⇒ manual；
//   · 同一命令连续 deny 达上限 ⇒ 不调用模型、`manual/retry-capped`；
//   · 引擎不支持 ⇒ `manual/unsupported-engine`，不跨引擎；
//   · allow 结果行投达失败 ⇒ `manual/row-failed` 卡片（不自动放行）；deny 分支见 b 套件。
//
// 全部离线；不读 `.env`、不触真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { SHELL_JUDGE_READ_TOOL } from "../../../src/common/runtime-core/shell-judge/tools.ts";
import {
  lastAudit,
  loadUiLabels,
  makeChain,
  makeJudge,
  makeTempProject,
  REQUEST,
  setJudgeEnabled,
  type Chain,
} from "./fixture.ts";

function assertManualCard(chain: Chain, expectedNotice: RegExp, expectedRows = 0): void {
  assert.equal(chain.displays.length, 1, "manual 必须弹出原确认卡（恰 1 张）");
  const notice = chain.displays[0]!.judgeNotice ?? "";
  assert.match(notice, expectedNotice, `卡片 judgeNotice 不符，实得：${notice}`);
  assert.equal(chain.rows.length, expectedRows, "manual 不产生新的判断结果行");
  const record = lastAudit(chain);
  assert.ok(record.by.endsWith("→ operator:客户"), `manual 后手批应归人工，实得：${record.by}`);
  assert.equal("judge" in record, false, "manual 后手批不得写 judge 字段");
}

test("判断会话不可用：原卡 + judgeNotice「判断服务不可用」", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { bindError: "provider 401" },
    });
    const chain = makeChain({ root: project.root, runtime: "claude", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-unavailable"));
    assert.equal(result.allow, false, "通道不可用时卡片默认拒绝");
    assertManualCard(chain, /判断 agent 未能完成判断：判断服务不可用。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
    assert.equal(fake.seen.binds, 1);
  } finally {
    await project.cleanup();
  }
});

test("判断超时：原卡 + judgeNotice「判断超时」，底层会话被 abort/dispose", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "pi",
      timeoutMs: 30,
      script: { silent: true },
    });
    const chain = makeChain({ root: project.root, runtime: "pi", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-timeout"));
    assert.equal(result.allow, false);
    assertManualCard(chain, /判断 agent 未能完成判断：判断超时。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
    assert.equal(fake.seen.aborted, 1, "超时必须中止底层判断会话");
    assert.equal(fake.seen.disposed, 1, "超时必须 dispose 底层判断会话");
  } finally {
    await project.cleanup();
  }
});

test("输出无法解析：模型散文不猜结论 ⇒ 原卡 +「判断结果无法解析」", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "codex",
      script: { message: "我觉得这个命令可以放行，不需要确认。" },
    });
    const chain = makeChain({ root: project.root, runtime: "codex", judge, classify: "review", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-parse"));
    assert.equal(result.allow, false);
    assertManualCard(chain, /判断 agent 未能完成判断：判断结果无法解析。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
  } finally {
    await project.cleanup();
  }
});

test("allow + 读取被拒：真实驱动按「allow 必须无损」降级 manual/read-denied", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: {
        beforeReport: async (tools) => {
          const read = tools.get(SHELL_JUDGE_READ_TOOL)!;
          const result = await read.handler({ name: SHELL_JUDGE_READ_TOOL, args: { path: ".env" } });
          assert.equal(result.ok, false, ".env 必须被只读策略拒绝");
          assert.match(result.message, /敏感/);
          assert.equal(result.message.includes("DO_NOT_LEAK_ENV"), false, "拒绝文案不得泄露内容");
        },
        report: { verdict: "allow", reason: "需要读取配置" },
      },
    });
    const chain = makeChain({ root: project.root, runtime: "claude", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-read-denied"));
    assert.equal(result.allow, false, "读取损伤后的 allow 不得自动放行");
    assertManualCard(chain, /判断 agent 未能完成判断：所需项目文件无法读取。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
    assert.equal(fake.seen.binds, 1);
  } finally {
    await project.cleanup();
  }
});

test("allow + 读取预算耗尽：真实驱动降级 manual/budget", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "pi",
      script: {
        beforeReport: async (tools) => {
          const read = tools.get(SHELL_JUDGE_READ_TOOL)!;
          let last = await read.handler({ name: SHELL_JUDGE_READ_TOOL, args: { path: "README.md" } });
          for (let index = 0; index < 8; index += 1) {
            last = await read.handler({ name: SHELL_JUDGE_READ_TOOL, args: { path: "README.md" } });
          }
          assert.equal(last.ok, false, "第 9 次读取必须被预算拒绝");
          assert.match(last.message, /预算/);
        },
        report: { verdict: "allow", reason: "读了很多文件后仍判必要" },
      },
    });
    const chain = makeChain({ root: project.root, runtime: "pi", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-budget"));
    assert.equal(result.allow, false);
    assertManualCard(chain, /判断 agent 未能完成判断：读取预算已用尽。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
  } finally {
    await project.cleanup();
  }
});

test("allow + 读取截断：真实驱动降级 manual/read-truncated", async () => {
  const project = await makeTempProject();
  try {
    await writeFile(path.join(project.root, "big.txt"), "a".repeat(70 * 1024), "utf8");
    const { judge } = makeJudge({
      project: project.project,
      runtime: "codex",
      script: {
        beforeReport: async (tools) => {
          const read = tools.get(SHELL_JUDGE_READ_TOOL)!;
          const result = await read.handler({ name: SHELL_JUDGE_READ_TOOL, args: { path: "big.txt" } });
          assert.equal(result.ok, true);
          assert.match(result.message, /\[已截断/);
        },
        report: { verdict: "allow", reason: "证据来自大文件" },
      },
    });
    const chain = makeChain({ root: project.root, runtime: "codex", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-truncated"));
    assert.equal(result.allow, false);
    assertManualCard(chain, /判断 agent 未能完成判断：读取内容被截断。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
  } finally {
    await project.cleanup();
  }
});

test("防循环：同一命令连续 deny 达上限后不再调用模型，原卡 +「已达重试上限」", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { report: { verdict: "deny", reason: "任务不需要该命令" } },
    });
    const chain = makeChain({ root: project.root, runtime: "claude", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const first = await chain.gate(REQUEST("cap-1"));
    const second = await chain.gate(REQUEST("cap-2"));
    assert.equal(first.allow, false);
    assert.equal(second.allow, false);
    assert.equal(chain.displays.length, 0, "前两次 deny 均 0 卡");
    assert.equal(chain.rows.length, 2);
    assert.equal(fake.seen.binds, 2);

    const third = await chain.gate(REQUEST("cap-3"));
    assert.equal(third.allow, false);
    assert.equal(fake.seen.binds, 2, "达到上限后不得再调用模型");
    assertManualCard(chain, /判断 agent 未能完成判断：同类命令连续被拒，已达重试上限。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/, 2);
    const UL = await loadUiLabels();
    assert.equal(
      UL.shellJudgeNoticeText("retry-capped"),
      "判断 agent 未能完成判断：同类命令连续被拒，已达重试上限。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。",
    );
  } finally {
    await project.cleanup();
  }
});

test("引擎不支持（demo）：manual/unsupported-engine，不调用任何适配器、不跨引擎", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({ project: project.project, runtime: "demo" });
    const chain = makeChain({ root: project.root, runtime: "demo", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-unsupported"));
    assert.equal(result.allow, false);
    assertManualCard(chain, /判断 agent 未能完成判断：当前引擎不支持自动判断。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
    assert.equal(fake.seen.binds, 0, "不支持引擎不得调用任何适配器");
  } finally {
    await project.cleanup();
  }
});

test("allow 结果行投达失败：回落原卡 +「判断已完成但结果无法显示」（不自动放行）", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { report: { verdict: "allow", reason: "任务明确要求" } },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      operatorOnly: true,
      decision: true,
      emitJudgeResult: () => { throw new Error("渲染进程不可用"); },
    });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("row-failed-allow"));
    assert.equal(result.allow, true, "结果行失败后由人重新批准");
    assert.equal(fake.seen.binds, 1, "判断本身完成");
    assert.equal(chain.rows.length, 0, "结果行投达失败");
    assert.equal(chain.displays.length, 1, "必须回落原确认卡");
    const notice = chain.displays[0]!.judgeNotice ?? "";
    assert.equal(notice, "判断 agent 已完成判断，但结果无法在聊天中显示；规则判定仅作参考，本卡已转你手动确认。");
    const record = lastAudit(chain);
    assert.ok(record.by.endsWith("→ operator:客户"), "人工重新批准归人工");
    assert.equal("judge" in record, false, "row-failed 后的人工批准不写 judge 字段");
    const UL = await loadUiLabels();
    assert.equal(UL.shellJudgeNoticeText("row-failed"), notice, "渲染侧提示与通道文案同解");
    assert.equal(UL.shellJudgeNoticeText("timeout").includes("未能完成判断"), true);
    assert.equal(UL.shellJudgeNoticeText("row-failed").includes("未能完成判断"), false, "不得把「判断已发生」说成「没发生」");
  } finally {
    await project.cleanup();
  }
});

test("判断请求超上限：命令 >16KB 直接 manual/context-too-large（不截断后猜）", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({ project: project.project, runtime: "claude" });
    const chain = makeChain({ root: project.root, runtime: "claude", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);
    const huge = `echo ${"x".repeat(17 * 1024)}`;
    const result = await chain.gate({ command: huge, argv: ["echo", "x".repeat(17 * 1024)], cwd: "/proj", toolCallId: "too-large" });
    assert.equal(result.allow, false);
    assertManualCard(chain, /判断 agent 未能完成判断：命令或上下文过大。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
    assert.equal(fake.seen.binds, 0);
  } finally {
    await project.cleanup();
  }
});

test("模型自报 manual：原卡 +「判断 agent 自报无法判断」", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "pi",
      script: { report: { verdict: "manual", reason: "读取策略阻止判断" } },
    });
    const chain = makeChain({ root: project.root, runtime: "pi", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);
    const result = await chain.gate(REQUEST("model-manual"));
    assert.equal(result.allow, false);
    assertManualCard(chain, /判断 agent 未能完成判断：判断 agent 自报无法判断。规则判定仅作参考；判断 agent 未完成时才由你手批。已转你手动确认。/);
  } finally {
    await project.cleanup();
  }
});

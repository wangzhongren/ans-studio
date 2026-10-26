// test/测试/shell-judge-verify/e-deny-tier.test.ts
// 测试角色：su deny 档被 judge 放行（客户 D1）的独立验证（2026-10-17）。
//
// 覆盖（PM 评审 §12.2-6 与 §12.1 A27/A36）：
//   · deny 档 + judge allow：**放行**（0 卡）、审计 tier:"deny" + hardDenyOverride:true + label、
//     诊断带同三字段、结果行标题含「deny 档」+「请复核」；
//   · 不存在 hard-floor/转换分支；judge deny 仍 deny、0 卡；
//   · 普通 risky/review 放行不带 hardDenyOverride/label。
//
// 全部离线；假适配器/假渲染；不触真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  lastAudit,
  loadUiLabels,
  makeChain,
  makeJudge,
  makeTempProject,
  recordingLogger,
  REQUEST,
  setJudgeEnabled,
} from "./fixture.ts";

const LABEL = "deny 档 · judge 放行";

test("deny 档 + judge allow：放行、0 卡、审计/诊断/结果行三处可辨识", async () => {
  const project = await makeTempProject();
  try {
    const logger = recordingLogger();
    const { judge } = makeJudge({
      project: project.project,
      runtime: "claude",
      logger,
      script: {
        report: {
          verdict: "allow",
          reason: "任务明确要求清理构建目录，范围最小",
          evidence: ["docs/plan.md"],
        },
      },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "deny",
      operatorOnly: true,
      approveDeny: true,
    });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("deny-tier-allow"));
    assert.equal(result.allow, true, "客户 D1：deny 档允许 judge 放行");
    assert.equal(chain.displays.length, 0, "deny 档放行必须 0 卡");
    assert.equal(chain.rows.length, 1);

    const row = chain.rows[0]!;
    assert.equal(row.verdict, "allow");
    assert.equal(row.tier, "deny");
    assert.equal(row.policy, "su-approval");
    assert.equal(row.hardDenyOverride, true);
    assert.equal(row.label, LABEL);
    assert.equal(row.operator, "judge:claude");

    const record = lastAudit(chain);
    assert.equal(record.conclusion, "allow");
    assert.equal(record.branch, "c-deny→a-allow");
    assert.ok(record.by.endsWith("→ operator:judge:claude"));
    assert.equal(record.judge?.verdict, "allow");
    assert.equal(record.judge?.tier, "deny");
    assert.equal(record.judge?.hardDenyOverride, true);
    assert.equal(record.judge?.label, LABEL);
    assert.equal(record.judge?.reasonCode, "necessary");

    const allowed = logger.events.filter((event) => event.event === "shell-judge.allow");
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0]!.fields.tier, "deny");
    assert.equal(allowed[0]!.fields.hardDenyOverride, true);
    assert.equal(allowed[0]!.fields.label, LABEL);

    const UL = await loadUiLabels();
    const view = UL.shellJudgeResultView(row);
    assert.ok(view !== null);
    assert.equal(view.denyOverride, true);
    // 文案来源：共享 i18n `ui.judge.approvedHardDeny`（2026-10 B1 起为「自动代理」）。
    assert.equal(view.title, "已替你放行（自动代理 · 代审批 · deny 档）");
    assert.equal(view.label, LABEL);
    assert.ok(view.lines.some((line) => line.includes("硬拒类")), "正文必须说明这是硬拒类被推翻");
    assert.ok(view.lines.some((line) => line.includes("请复核")), "正文必须提示请复核");
    assert.equal(view.tierText, "档位：deny");
  } finally {
    await project.cleanup();
  }
});

test("deny 档 + judge deny：仍 deny、0 卡、审计 tier:deny 但不带 hardDenyOverride", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "codex",
      script: {
        report: {
          verdict: "deny",
          reason: "任务文本没有要求清理系统目录",
          alternative: { kind: "command", value: "rm -rf build/tmp" },
        },
      },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "codex",
      judge,
      classify: "deny",
      operatorOnly: true,
      approveDeny: true,
    });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("deny-tier-deny"));
    assert.equal(result.allow, false);
    assert.equal(chain.displays.length, 0, "judge deny 0 卡");
    const record = lastAudit(chain);
    assert.equal(record.conclusion, "deny");
    assert.equal(record.branch, "c-deny→a-deny");
    assert.equal(record.judge?.tier, "deny");
    assert.equal(record.judge?.verdict, "deny");
    assert.equal(record.judge?.hardDenyOverride, undefined);
    assert.equal(record.judge?.label, undefined);
    assert.equal(record.judge?.reasonCode, "safer-alternative");
  } finally {
    await project.cleanup();
  }
});

test("普通 risky/review 放行不带 deny 档标记（防止标记泛化）", async () => {
  const project = await makeTempProject();
  try {
    for (const tier of ["risky", "review"] as const) {
      const { judge } = makeJudge({
        project: project.project,
        runtime: "claude",
        script: { report: { verdict: "allow", reason: "当前任务明确需要该命令" } },
      });
      const chain = makeChain({ root: project.root, runtime: "claude", judge, classify: tier, operatorOnly: true });
      setJudgeEnabled(chain, true);
      const result = await chain.gate(REQUEST(`tier-${tier}-allow`));
      assert.equal(result.allow, true);
      const row = chain.rows[0]!;
      assert.equal(row.tier, tier);
      assert.equal(row.hardDenyOverride, undefined, `${tier} 放行不得带 hardDenyOverride`);
      assert.equal(row.label, undefined, `${tier} 放行不得带 deny 档 label`);
      const record = lastAudit(chain);
      assert.equal(record.judge?.hardDenyOverride, undefined);
      const UL = await loadUiLabels();
      const view = UL.shellJudgeResultView(row);
      assert.ok(view !== null);
      assert.equal(view.denyOverride, false);
      // 文案来源：共享 i18n `ui.judge.approved`。
      assert.equal(view.title, "已替你放行（自动代理 · 代审批）");
      assert.equal(view.label, "");
    }
  } finally {
    await project.cleanup();
  }
});

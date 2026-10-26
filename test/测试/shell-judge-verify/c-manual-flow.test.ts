// test/测试/shell-judge-verify/c-manual-flow.test.ts
// 测试角色：判断 manual 回落按「拒绝」处理的独立验证（2026-10-19 客户裁定重写）。
//
// 新语义（客户原话：「审查只有同意和拒绝，不需要我来同意，拒绝要给理由」）：
//   · 开关开启时判断 agent 是唯一审查者：judge allow ⇒ 执行；judge deny ⇒ 拒绝；
//   · judge manual（unavailable / timeout / parse-failed / read-denied / budget / read-truncated /
//     retry-capped / unsupported-engine / context-too-large / model-manual）⇒ **直接按 deny 处理**并带
//     具体人话理由；**不调用 presenter、不弹客户确认卡、不发判断结果行**；审计保留 manual 事实
//     （`verdict:"deny"`、`modelVerdict:"manual"`、原 `reasonCode`、`manualAsDeny:true`）；
//   · allow 结果行投达失败（row-failed）同样按 deny 处理（不弹卡）；审计 `modelVerdict:"allow"`；
//   · allow/deny 正常路径不变；开关关闭 ⇒ 旧手动确认卡路径不变（presenter 仍被调用）。
//
// 覆盖原 PM 评审 §12.2-4/5/13 与 §12.1 A7/A8/A9/A10/A11/A17/A20/A26/A29 的 manual 面（2026-10-17 版），
// 按新裁定重写断言。**不从夹具/产品实现复制期望文案**——理由与审计字段在此独立钉死。
//
// 全部离线；不读 `.env`、不触真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { SHELL_JUDGE_READ_TOOL } from "../../../src/common/runtime-core/shell-judge/tools.ts";
import type { ShellJudgeAuditWithManual } from "../../../app/desktop/operator-channel.ts";
import {
  lastAudit,
  makeChain,
  makeJudge,
  makeTempProject,
  REQUEST,
  setJudgeEnabled,
  type Chain,
} from "./fixture.ts";

interface ManualDeniedExpectation {
  /** 期望的拒绝理由（逐字；含具体原因，且不得是「已转你手动确认」旧文案）。 */
  reason: string;
  /** 审计保留的原始 reasonCode。 */
  reasonCode: string;
  engine: string;
  tier: "risky" | "review";
  /** row-failed 保留模型原始 allow 事实；manual 一律 manual。 */
  modelVerdict?: "manual" | "allow";
  /** 此前已产生的结果行数（防循环用例先有两行 deny）。 */
  rowsBefore?: number;
}

/**
 * manual/row-failed 的共同断言面：
 *   outcome deny（编排结论）、presenter 零调用、无新结果行、理由含具体原因、
 *   审计保留 manual 事实（verdict=deny + modelVerdict=manual/allow + 原 reasonCode + manualAsDeny）。
 */
function assertManualDenied(
  result: { allow: boolean; reason?: string },
  chain: Chain,
  expected: ManualDeniedExpectation,
): void {
  assert.equal(result.allow, false, "manual/row-failed 一律按拒绝处理（fail-closed）");
  assert.equal(result.reason, expected.reason, "拒绝理由必须是具体人话");
  assert.equal(result.reason?.includes("已转你手动确认") ?? false, false, "不再说「已转你手动确认」");
  assert.equal(chain.displays.length, 0, "presenter 零调用：不再弹原确认卡");
  assert.equal(chain.rows.length, expected.rowsBefore ?? 0, "manual/row-failed 不产生新的判断结果行");
  const record = lastAudit(chain);
  assert.equal(record.conclusion, "deny", "编排结论 = 拒绝");
  assert.equal(record.branch, `c-${expected.tier}→a-deny`, "升级链如实归 (a) deny");
  assert.ok(
    record.by.startsWith(`ruleset:test:${expected.tier}（su 审批档）`),
    `(c) 档位归因保留，实得：${record.by}`,
  );
  assert.ok(
    record.by.endsWith(`→ operator:judge:${expected.engine}`),
    `拒绝归因判断 agent（不是人工手批），实得：${record.by}`,
  );
  assert.deepEqual(
    record.judge as ShellJudgeAuditWithManual | undefined,
    {
      engine: expected.engine,
      verdict: "deny",
      modelVerdict: expected.modelVerdict ?? "manual",
      reasonCode: expected.reasonCode,
      tier: expected.tier,
      manualAsDeny: true,
      reason: expected.reason,
    },
    "审计保留 manual 事实（不伪装成模型主动 deny）",
  );
}

test("判断会话不可用：按拒绝处理、presenter 零调用、理由「判断服务不可用」、审计保留 manual", async () => {
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
    assertManualDenied(result, chain, {
      reason: "判断服务不可用，无法完成自动审查，已拒绝；请重试，如持续失败请关闭「替我审批」后手动确认。",
      reasonCode: "unavailable",
      engine: "claude",
      tier: "risky",
    });
    assert.equal(fake.seen.binds, 1, "判断会话确实尝试过一次（失败事实如实保留）");
  } finally {
    await project.cleanup();
  }
});

test("判断超时：按拒绝处理、presenter 零调用、理由「判断超时」，底层会话被 abort/dispose", async () => {
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
    assertManualDenied(result, chain, {
      reason: "判断超时，无法完成自动审查，已拒绝；请重试，如持续失败请关闭「替我审批」后手动确认。",
      reasonCode: "timeout",
      engine: "pi",
      tier: "risky",
    });
    assert.equal(fake.seen.aborted, 1, "超时必须中止底层判断会话");
    assert.equal(fake.seen.disposed, 1, "超时必须 dispose 底层判断会话");
  } finally {
    await project.cleanup();
  }
});

test("输出无法解析：模型散文不猜结论 ⇒ 按拒绝处理、理由「判断结果无法解析」", async () => {
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
    assertManualDenied(result, chain, {
      reason: "判断结果无法解析，无法完成自动审查，已拒绝；请重试，如持续失败请关闭「替我审批」后手动确认。",
      reasonCode: "parse-failed",
      engine: "codex",
      tier: "review",
    });
  } finally {
    await project.cleanup();
  }
});

test("allow + 读取被拒：真实驱动按「allow 必须无损」降级 manual/read-denied ⇒ 拒绝并带具体路径", async () => {
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
    // 2026-10-18 客户裁定：read-denied 理由须给出具体路径与类别（不再是泛化的「所需项目文件无法读取」）。
    assertManualDenied(result, chain, {
      reason: "读取被拒：.env（环境变量文件），无法保证无损判断，无法完成自动审查，已拒绝；请缩小读取范围或改用落盘脚本后重试。",
      reasonCode: "read-denied",
      engine: "claude",
      tier: "risky",
    });
    assert.equal(fake.seen.binds, 1);
  } finally {
    await project.cleanup();
  }
});

test("allow + 读取预算耗尽：真实驱动降级 manual/budget ⇒ 拒绝、理由「读取预算已用尽」", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "pi",
      // 2026-10-19 运行时核心默认预算放宽为 12 次 / 128KiB / 512KiB；本用例验证「预算耗尽 ⇒
      // manual/budget」的语义，显式注入小预算（8 次）保持原判定面，不依赖进程级 env。
      budget: { maxCalls: 8 },
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
    assertManualDenied(result, chain, {
      reason: "读取预算已用尽，无法完成自动审查，已拒绝；请缩小判断范围（改用落盘脚本或拆分命令）后重试。",
      reasonCode: "budget",
      engine: "pi",
      tier: "risky",
    });
  } finally {
    await project.cleanup();
  }
});

test("allow + 读取截断：真实驱动降级 manual/read-truncated ⇒ 拒绝、理由「读取内容被截断」", async () => {
  const project = await makeTempProject();
  try {
    await writeFile(path.join(project.root, "big.txt"), "a".repeat(70 * 1024), "utf8");
    const { judge } = makeJudge({
      project: project.project,
      runtime: "codex",
      // 单文件上限显式注入 64KiB（旧缺省值）：70KiB 文件仍必然截断，验证「截断 ⇒
      // manual/read-truncated」语义（不依赖新默认 128KiB）。
      budget: { maxFileBytes: 64 * 1024 },
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
    assertManualDenied(result, chain, {
      reason: "读取内容被截断，无法完成自动审查，已拒绝；请缩小判断范围（改用落盘脚本或拆分命令）后重试。",
      reasonCode: "read-truncated",
      engine: "codex",
      tier: "risky",
    });
  } finally {
    await project.cleanup();
  }
});

test("防循环：同一命令连续 deny 达上限后不再调用模型 ⇒ 按拒绝处理、理由「已达重试上限」", async () => {
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
    assert.equal(chain.rows.length, 2, "前两次 deny 各 1 条结果行（模型主动 deny 路径不变）");
    assert.equal(fake.seen.binds, 2);

    const third = await chain.gate(REQUEST("cap-3"));
    assert.equal(fake.seen.binds, 2, "达到上限后不得再调用模型");
    assertManualDenied(third, chain, {
      reason: "同类命令连续被拒，已达重试上限，无法完成自动审查，已拒绝；请重试，如持续失败请关闭「替我审批」后手动确认。",
      reasonCode: "retry-capped",
      engine: "claude",
      tier: "risky",
      rowsBefore: 2,
    });
    // 前两次模型主动 deny 的审计不受 manual→deny 改造影响。
    const records = chain.audit.records;
    assert.equal(records.length, 3);
    assert.equal(records[0]!.judge?.verdict, "deny");
    assert.equal("manualAsDeny" in (records[0]!.judge ?? {}), false, "模型主动 deny 不带 manualAsDeny");
  } finally {
    await project.cleanup();
  }
});

test("引擎不支持（demo）：manual/unsupported-engine ⇒ 拒绝、不调用任何适配器、不跨引擎", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({ project: project.project, runtime: "demo" });
    const chain = makeChain({ root: project.root, runtime: "demo", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("manual-unsupported"));
    assertManualDenied(result, chain, {
      reason: "当前引擎不支持自动判断，无法完成自动审查，已拒绝；请关闭「替我审批」后手动确认。",
      reasonCode: "unsupported-engine",
      engine: "demo",
      tier: "risky",
    });
    assert.equal(fake.seen.binds, 0, "不支持引擎不得调用任何适配器");
  } finally {
    await project.cleanup();
  }
});

test("allow 结果行投达失败：按拒绝处理（不自动放行、不弹卡），审计保留 row-failed 与模型 allow 事实", async () => {
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
    assertManualDenied(result, chain, {
      reason: "审查结果投达失败，无法在聊天中显示判断结论，已拒绝；渲染进程不可用。",
      reasonCode: "row-failed",
      engine: "claude",
      tier: "risky",
      modelVerdict: "allow",
    });
    assert.equal(fake.seen.binds, 1, "判断本身完成（模型 allow 事实保留）");
  } finally {
    await project.cleanup();
  }
});

test("判断请求超上限：命令 >16KB 直接 manual/context-too-large ⇒ 拒绝（不截断后猜）", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({ project: project.project, runtime: "claude" });
    const chain = makeChain({ root: project.root, runtime: "claude", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);
    const huge = `echo ${"x".repeat(17 * 1024)}`;
    const result = await chain.gate({ command: huge, argv: ["echo", "x".repeat(17 * 1024)], cwd: "/proj", toolCallId: "too-large" });
    assertManualDenied(result, chain, {
      reason: "命令或上下文过大，无法完成自动审查，已拒绝；请改用落盘脚本或拆分命令后重试。",
      reasonCode: "context-too-large",
      engine: "claude",
      tier: "risky",
    });
    assert.equal(fake.seen.binds, 0);
  } finally {
    await project.cleanup();
  }
});

test("模型自报 manual：按拒绝处理、理由「自动代理自报无法判断」", async () => {
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
    // 文案来源：共享 i18n `main.operator.judgeReason.modelManual` + `main.operator.manualDenyAdvice.retry`
    // （2026-10 B1 起「判断 agent 自报无法判断」→「自动代理自报无法判断」）。
    assertManualDenied(result, chain, {
      reason: "自动代理自报无法判断，无法完成自动审查，已拒绝；请重试，如持续失败请关闭「替我审批」后手动确认。",
      reasonCode: "model-manual",
      engine: "pi",
      tier: "risky",
    });
  } finally {
    await project.cleanup();
  }
});

test("对照：judge allow/deny 正常路径不变（manual 改造未波及模型主动结论）", async () => {
  // allow：0 卡、1 结果行、审计归 judge:allow。
  const allowProject = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: allowProject.project,
      runtime: "claude",
      script: { report: { verdict: "allow", reason: "任务明确要求运行测试" } },
    });
    const chain = makeChain({ root: allowProject.root, runtime: "claude", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("normal-allow"));
    assert.equal(result.allow, true, "judge allow 照常放行");
    assert.equal(chain.displays.length, 0, "judge allow 不弹卡");
    assert.equal(chain.rows.length, 1);
    assert.equal(chain.rows[0]!.verdict, "allow");
    const record = lastAudit(chain);
    assert.equal(record.conclusion, "allow");
    assert.equal(record.branch, "c-risky→a-allow");
    assert.ok(record.by.endsWith("→ operator:judge:claude"));
    assert.equal(record.judge?.verdict, "allow");
    assert.equal("modelVerdict" in (record.judge ?? {}), false, "模型主动 allow 不写 manual 标记");
    assert.equal("manualAsDeny" in (record.judge ?? {}), false);
  } finally {
    await allowProject.cleanup();
  }

  // deny：0 卡、1 结果行、拒绝理由按原格式。
  const denyProject = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: denyProject.project,
      runtime: "codex",
      script: { report: { verdict: "deny", reason: "该系统风险不可接受" } },
    });
    const chain = makeChain({ root: denyProject.root, runtime: "codex", judge, classify: "risky", operatorOnly: true });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("normal-deny"));
    assert.equal(result.allow, false, "judge deny 照常拒绝");
    // 文案来源：共享 i18n `main.operator.judgeDeniedHead`。
    assert.match(result.reason, /^自动代理未放行该命令。/);
    assert.match(result.reason, /原因：该系统风险不可接受/);
    assert.equal(chain.displays.length, 0, "judge deny 不弹卡");
    assert.equal(chain.rows.length, 1);
    assert.equal(chain.rows[0]!.verdict, "deny");
    const record = lastAudit(chain);
    assert.equal(record.conclusion, "deny");
    assert.ok(record.by.endsWith("→ operator:judge:codex"));
    assert.equal(record.judge?.verdict, "deny");
    assert.equal("manualAsDeny" in (record.judge ?? {}), false, "模型主动 deny 不带 manualAsDeny");
  } finally {
    await denyProject.cleanup();
  }
});

test("开关关闭：presenter 仍被调用（旧手动确认卡保留），判断 agent 0 次调用、审计归人工", async () => {
  const project = await makeTempProject();
  try {
    // 判断脚本本身会失败（bindError）——但开关关闭时它根本不该被调用。
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { bindError: "provider 401" },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      operatorOnly: true,
      decision: true,
    });
    assert.equal(chain.switchState.isEnabled(), false, "默认关闭");

    const result = await chain.gate(REQUEST("off-manual"));
    assert.equal(result.allow, true, "旧路径：客户在确认卡上放行 ⇒ 执行");
    assert.equal(chain.displays.length, 1, "presenter 仍被调用（恰 1 张旧确认卡）");
    assert.equal(chain.displays[0]!.command, "npm test", "旧卡展示命令原文");
    assert.equal(chain.displays[0]!.judgeNotice, undefined, "开关关不判断 ⇒ 旧卡不带 judgeNotice");
    assert.equal(chain.rows.length, 0, "开关关不产生判断结果行");
    assert.equal(fake.seen.binds, 0, "开关关闭判断 agent 0 次调用");

    const record = lastAudit(chain);
    assert.equal(record.conclusion, "allow");
    assert.equal(record.branch, "c-risky→a-allow");
    assert.ok(record.by.endsWith("→ operator:客户"), "人工手批归人工");
    assert.equal("judge" in record, false, "人工手批不写 judge 字段");
  } finally {
    await project.cleanup();
  }
});

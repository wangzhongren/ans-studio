// test/测试/shell-judge-verify/a-allow-flow.test.ts
// 测试角色：「替我审」开关默认关 / 开启后 allow 全链独立验证（2026-10-17）。
//
// 覆盖（PM 评审 §12.2-1/7 与 §12.1 A1/A4/A14/A21/A30）：
//   · 开关默认关：请求走原确认卡、判断 agent 0 次调用、审计人工（不带 judge）、无结果行；
//   · 主进程开关（假 IPC）默认 false、非法请求不改状态、sender 同一性校验；
//   · 假渲染（真 ui-labels）：默认「替我审」、开启警告三行；
//   · 开启后 judge allow：0 卡、1 行、审计 `operator:judge:<引擎>` + `judge` 字段、诊断 allow 一条；
//   · 已开启的请求把当前轮 `turnText` 交给判断驱动（≤4KB，不含历史）；
//   · 关闭后恢复手动。
//
// 全部离线：假适配器/假 presenter/假 IPC；不读 `.env`、不触真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";

import { isShellJudgeIpcSender } from "../../../app/desktop/interface.ts";
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

test("开关默认关：请求走原确认卡，判断 agent 0 次调用，审计人工且无 judge 字段", async () => {
  const project = await makeTempProject();
  try {
    const logger = recordingLogger();
    const { judge, fake } = makeJudge({ project: project.project, runtime: "claude", logger });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      operatorOnly: true,
      decision: true,
    });

    // 主进程开关默认 false；非法请求不改状态（§12.1 A1/A31 的纯逻辑面）。
    assert.equal(chain.switchState.isEnabled(), false);
    assert.deepEqual(chain.switchState.get(), { version: 1, ok: true, enabled: false });
    assert.equal(chain.switchState.set({ enabled: "yes" }).ok, false);
    assert.equal(chain.switchState.set({}).ok, false);
    assert.equal(chain.switchState.isEnabled(), false);
    const expectedSender = { id: "main-window" };
    assert.equal(isShellJudgeIpcSender(expectedSender, expectedSender), true);
    assert.equal(isShellJudgeIpcSender({ id: "other" }, expectedSender), false);
    assert.equal(isShellJudgeIpcSender(undefined, expectedSender), false);

    const result = await chain.gate(REQUEST("off-1"));
    assert.equal(result.allow, true, "原确认卡批准后照旧放行");
    assert.equal(chain.displays.length, 1, "必须走原确认卡");
    assert.equal(chain.rows.length, 0, "开关关不产生判断结果行");
    assert.equal(fake.seen.binds, 0, "判断 agent 必须 0 次调用");
    assert.equal(fake.seen.prompts.length, 0);
    assert.deepEqual(logger.events, [], "开关关不得产生判断诊断事件");

    const record = lastAudit(chain);
    assert.equal(record.conclusion, "allow");
    assert.equal(record.branch, "c-risky→a-allow");
    assert.ok(record.by.endsWith("→ operator:客户"), `审计应归人工，实得：${record.by}`);
    assert.equal("judge" in record, false, "手工批准不得写 judge 字段");

    // 假渲染（真 ui-labels）：默认「替我审」、无警告；开启态标签/警告。
    const UL = await loadUiLabels();
    const off = UL.shellJudgeToggleView(true, chain.switchState.isEnabled(), false);
    assert.equal(off.checked, false);
    assert.equal(off.label, "替我审");
    assert.equal(off.warningVisible, false);
    const on = UL.shellJudgeToggleView(true, true, false);
    assert.equal(on.checked, true);
    assert.equal(on.label, "替我审批中 · 判断 agent");
    assert.equal(on.warningVisible, true);
    assert.equal(UL.shellJudgeWarningLines().length, 3, "开启警告常驻三行");
    assert.match(UL.shellJudgeWarningLines()[0]!, /只有判断没发生/);
    assert.equal(UL.shellJudgeToggleView(false, true, false).label, "当前版本不支持自动判断，保持手动");
  } finally {
    await project.cleanup();
  }
});

test("开启后 judge allow：0 卡、1 行、审计 operator:judge:<引擎> + judge 字段、诊断 allow 一条", async () => {
  const project = await makeTempProject();
  try {
    const logger = recordingLogger();
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      logger,
      script: {
        report: {
          verdict: "allow",
          reason: "当前轮任务明确要求运行测试",
          evidence: ["docs/plan.md"],
        },
      },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      operatorOnly: true,
      turnText: "请运行测试并修复失败用例。",
    });
    setJudgeEnabled(chain, true);

    const result = await chain.gate(REQUEST("on-allow-1"));
    assert.equal(result.allow, true);
    assert.equal(chain.displays.length, 0, "judge allow 必须 0 张确认卡");
    assert.equal(fake.seen.binds, 1, "恰一次判断会话");
    assert.equal(fake.seen.disposed, 1, "判断会话必须 dispose");
    assert.match(fake.seen.prompts[0]!, /请运行测试并修复失败用例。/, "当前轮 turnText 必须交给判断驱动");
    assert.match(fake.seen.prompts[0]!, /npm test/, "命令原文必须进入判断提示");

    assert.equal(chain.rows.length, 1, "allow 必须产生 1 条结果行");
    const row = chain.rows[0]!;
    assert.equal(row.version, 1);
    assert.equal(row.verdict, "allow");
    assert.equal(row.engine, "claude");
    assert.equal(row.operator, "judge:claude");
    assert.equal(row.reasonCode, "necessary");
    assert.equal(row.policy, "su-approval");
    assert.equal(row.tier, "risky");
    assert.equal(row.command, "npm test");
    assert.equal(row.toolCallId, "on-allow-1");
    assert.equal(row.roleId, "verify-role");
    assert.equal(row.projectRoot, project.root);
    assert.equal(row.hardDenyOverride, undefined, "普通 risky 放行不带 hardDenyOverride");
    assert.equal(row.label, undefined);

    const record = lastAudit(chain);
    assert.equal(record.conclusion, "allow");
    assert.equal(record.command, "npm test");
    assert.deepEqual(record.argv, ["npm", "test"]);
    assert.equal(record.execution, "未执行");
    assert.ok(record.by.endsWith("→ operator:judge:claude"), `审计归因应为判断 agent，实得：${record.by}`);
    assert.ok(record.by.startsWith("ruleset:test:risky（su 审批档）"));
    assert.ok(record.judge !== undefined, "判断 agent 做出的 allow 必须写 judge 字段");
    assert.deepEqual(record.judge, {
      engine: "claude",
      verdict: "allow",
      reasonCode: "necessary",
      tier: "risky",
      reason: "当前轮任务明确要求运行测试",
    });
    assert.equal(JSON.stringify(record.judge).includes("npm test"), false, "judge 字段不得复述完整命令");

    // 诊断：started 一条 + allow 一条（带 engine/tier/hardDenyOverride）。
    const started = logger.events.filter((event) => event.event === "shell-judge.started");
    const allowed = logger.events.filter((event) => event.event === "shell-judge.allow");
    assert.equal(started.length, 1);
    assert.equal(allowed.length, 1);
    assert.equal(allowed[0]!.fields.engine, "claude");
    assert.equal(allowed[0]!.fields.tier, "risky");
    assert.equal(allowed[0]!.fields.hardDenyOverride, false);

    // 假渲染：真 ui-labels 纯映射。
    const UL = await loadUiLabels();
    const view = UL.shellJudgeResultView(row);
    assert.ok(view !== null);
    assert.equal(view.title, "已替你放行（判断 agent）");
    assert.equal(view.operatorText, "operator:judge:claude");
    assert.equal(view.engineText, "判断引擎：Claude");
    assert.equal(view.denyOverride, false);
    assert.equal(view.toolCallId, "on-allow-1");
    assert.match(view.summary, /它会在项目里执行：npm/);
  } finally {
    await project.cleanup();
  }
});

test("项目角色链路（policy=project、tier=null）：judge allow 同样 0 卡并正确归因", async () => {
  const project = await makeTempProject();
  try {
    const { judge } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { report: { verdict: "allow", reason: "任务明确要求运行测试" } },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      // 未接 operatorOnly：走既有三层链（(b) 无会话 → 升级 (a)）。
    });
    setJudgeEnabled(chain, true);
    const result = await chain.gate(REQUEST("project-allow-1"));
    assert.equal(result.allow, true);
    assert.equal(chain.displays.length, 0);
    const row = chain.rows[0]!;
    assert.equal(row.policy, "project");
    assert.equal(row.tier, null);
    assert.equal(row.hardDenyOverride, undefined);
    assert.equal(row.operator, "judge:claude");
    const record = lastAudit(chain);
    assert.equal(record.branch, "b-unavailable→a-allow");
    assert.ok(record.by.endsWith("→ operator:judge:claude"), `实得：${record.by}`);
    assert.equal(record.judge?.tier, null);
    assert.equal(record.judge?.hardDenyOverride, undefined);
  } finally {
    await project.cleanup();
  }
});

test("关闭开关后恢复手动：后续请求重新弹卡，判断 agent 不再调用", async () => {
  const project = await makeTempProject();
  try {
    const { judge, fake } = makeJudge({
      project: project.project,
      runtime: "claude",
      script: { report: { verdict: "allow", reason: "任务需要，范围最小" } },
    });
    const chain = makeChain({
      root: project.root,
      runtime: "claude",
      judge,
      classify: "risky",
      operatorOnly: true,
      decision: true,
    });
    setJudgeEnabled(chain, true);
    const first = await chain.gate(REQUEST("toggle-1"));
    assert.equal(first.allow, true);
    assert.equal(chain.displays.length, 0);
    assert.equal(chain.rows.length, 1);
    assert.equal(fake.seen.binds, 1);

    setJudgeEnabled(chain, false);
    const second = await chain.gate(REQUEST("toggle-2"));
    assert.equal(second.allow, true, "手动批准后放行");
    assert.equal(chain.displays.length, 1, "关闭后必须恢复手动确认卡");
    assert.equal(chain.rows.length, 1, "不再产生判断结果行");
    assert.equal(fake.seen.binds, 1, "关闭后判断 agent 0 次调用");
    const record = lastAudit(chain);
    assert.ok(record.by.endsWith("→ operator:客户"));
    assert.equal("judge" in record, false);

    // 重载复位：主进程直接 reset ⇒ 手动。
    chain.switchState.reset();
    assert.equal(chain.switchState.isEnabled(), false);
  } finally {
    await project.cleanup();
  }
});

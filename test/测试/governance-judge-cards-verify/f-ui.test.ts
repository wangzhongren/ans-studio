// test/测试/governance-judge-cards-verify/f-ui.test.ts
// 独立验收（测试角色，2026-10-18）：桌面 UI —— 两个复选框、一次性警告、结果行、回落提示、
// 桥缺失/单模型禁用（真 `ui-labels.js` 纯映射 + `index.html`/`preload.cjs` 静态契约）。
//
// 依据：PM 评审 §九（UI 契约）、§十三 AC16/AC17/AC21。全部离线，不启动 Electron。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadUiLabels } from "./fixture.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("两个复选框：默认均未勾选；开启态文案各自标注「判断 agent」", async () => {
  const UL = await loadUiLabels();
  const approvalOff = UL.judgeToggleView("approval", true, false, false);
  const decisionOff = UL.judgeToggleView("decision", true, false, false);
  assert.equal(approvalOff.checked, false);
  assert.equal(decisionOff.checked, false);
  assert.equal(approvalOff.label, "替我审批");
  assert.equal(decisionOff.label, "替我决策");

  const approvalOn = UL.judgeToggleView("approval", true, true, false);
  const decisionOn = UL.judgeToggleView("decision", true, true, false);
  assert.equal(approvalOn.checked, true);
  assert.equal(decisionOn.checked, true);
  assert.equal(approvalOn.label, "替我审批中 · 判断 agent");
  assert.equal(decisionOn.label, "替我决策中 · 判断 agent");
  assert.equal(approvalOn.warningVisible, true);
  assert.equal(decisionOn.warningVisible, true);

  const html = readFileSync(path.join(repoRoot, "app/renderer/index.html"), "utf8");
  assert.match(html, /id="auto-approve-toggle"/);
  assert.match(html, /id="judge-decision-toggle"/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2, "输入区恰两个复选框（无第三个总开关）");
  assert.doesNotMatch(html, /judge-all-toggle|toggle-all/);
});

test("桥/驱动缺失：禁用且不显示假开启态；single 项目禁用 decision 并说明", async () => {
  const UL = await loadUiLabels();
  for (const group of ["approval", "decision"]) {
    const missing = UL.judgeToggleView(group, false, true, false);
    assert.equal(missing.available, false);
    assert.equal(missing.enabled, false);
    assert.equal(missing.checked, false, "桥缺失不得显示 checked");
    assert.equal(missing.disabled, true);
    assert.equal(missing.label, "当前版本不支持自动判断，保持手动");
  }

  const singleDecision = UL.judgeToggleView("decision", true, true, false, { singleDisabled: true });
  assert.equal(singleDecision.checked, false);
  assert.equal(singleDecision.disabled, true);
  assert.equal(singleDecision.singleDisabled, true);
  assert.equal(singleDecision.note, "旧治理模型（single）不支持代决策");
  assert.equal(singleDecision.title, "旧治理模型（single）不支持代决策");

  const busy = UL.judgeToggleView("approval", true, true, true);
  assert.equal(busy.disabled, true, "IPC 在途只禁用，不改真实状态");
  assert.equal(busy.checked, true);
});

test("一次性警告：同一块按开启组列行；每组首次开启只弹一次，关闭后重置", async () => {
  const UL = await loadUiLabels();
  const approvalOnly = UL.judgeWarningLines(["approval"]);
  const decisionOnly = UL.judgeWarningLines(["decision"]);
  const both = UL.judgeWarningLines(["approval", "decision"]);
  assert.equal(approvalOnly.length, 4, "approval 一段 + 三条通用说明");
  assert.equal(decisionOnly.length, 4);
  assert.equal(both.length, 5, "两个都开：同一块两段 + 三条通用说明");
  assert.match(approvalOnly[0]!.text, /替我审批中：shell 命令与写盘\/写卡确认/);
  assert.match(decisionOnly[0]!.text, /替我决策中：提案接受、任命、验收/);
  assert.equal(approvalOnly[0]!.strong, true);
  assert.equal(decisionOnly[0]!.strong, true);
  assert.match(both.at(-1)!.text, /每次代批会产生一次模型调用/);
  assert.match(approvalOnly[1]!.text, /不写文件、不执行命令/);
  assert.match(approvalOnly[2]!.text, /accept-quick/);

  assert.deepEqual(UL.judgeWarningStep(true, false), { shown: true, show: true });
  assert.deepEqual(UL.judgeWarningStep(true, true), { shown: true, show: false }, "同一次开启不得重复弹");
  assert.deepEqual(UL.judgeWarningStep(false, true), { shown: false, show: false }, "关闭后重置");
  assert.deepEqual(UL.judgeWarningStep(true, false), { shown: true, show: true }, "关闭后再开可再提示一次");
});

test("结果行：标题「judge 代批 · 代决策/代审批」、引擎/operator/理由，绝不冒充客户", async () => {
  const UL = await loadUiLabels();
  const proposal = UL.governanceJudgeResultView({
    version: 1, id: "gj-1", requestId: "op-1", anchorKey: "k", toolCallId: "call-1",
    roleId: "rapporteur", at: "2026-10-18T00:00:00.000Z",
    group: "decision", cardKind: "proposal", flowId: "flow-a", engine: "claude", model: "m",
    reasonCode: "sufficient", reason: "提案与流程事实一致",
    selected: ["accept"], evidence: ["docs/proposals/flow-a-v1.md"], durationMs: 12, readCalls: 1, readBytes: 512,
  });
  assert.ok(proposal !== null);
  assert.equal(proposal!.title, "judge 代批 · 代决策");
  assert.equal(proposal!.badge, "代决策");
  assert.match(proposal!.headline, /接受提案（accept）/);
  assert.equal(proposal!.engineText, "判断引擎：Claude");
  assert.equal(proposal!.operatorText, "operator:judge:claude");
  assert.ok(proposal!.lines.some((line) => line.includes("判断理由")));
  assert.equal(proposal!.details.readCalls, 1);
  assert.doesNotMatch(JSON.stringify(proposal), /客户本人已批准|客户已批准/);

  const appointment = UL.governanceJudgeResultView({
    group: "decision", cardKind: "appointment", engine: "pi", selected: ["role-x", "role-y"], flowId: "flow-a",
  });
  assert.equal(appointment!.title, "judge 代批 · 代决策");
  assert.match(appointment!.headline, /任命 role-x、role-y/);

  const acceptance = UL.governanceJudgeResultView({ group: "decision", cardKind: "acceptance", engine: "codex", selected: ["accept"] });
  assert.match(acceptance!.headline, /验收通过（accept）/);

  const write = UL.governanceJudgeResultView({
    group: "approval", cardKind: "write", engine: "claude",
    paths: ["a.md", "b.md", "c.md", "d.md"],
  });
  assert.equal(write!.title, "judge 代批 · 代审批");
  assert.match(write!.headline, /确认写入 4 个路径/);
  assert.match(write!.headline, /a\.md、b\.md、c\.md/);
  assert.match(write!.headline, /等 4 个/);

  assert.equal(UL.governanceJudgeResultView({ group: "other", cardKind: "proposal" }), null);
  assert.equal(UL.governanceJudgeResultView(null), null);
});

test("回落提示：代审批/代决策人话原因；row-failed 单列「判断已完成」", async () => {
  const UL = await loadUiLabels();
  assert.equal(
    UL.governanceJudgeNoticeText("decision", "insufficient-evidence"),
    "判断 agent 未代批（代决策）：证据不足；已转你手动确认。",
  );
  assert.equal(
    UL.governanceJudgeNoticeText("approval", "path-outside-boundary"),
    "判断 agent 未代批（代审批）：写入路径越出角色边界；已转你手动确认。",
  );
  const rowFailed = UL.governanceJudgeNoticeText("decision", "row-failed");
  assert.match(rowFailed, /判断 agent 已完成判断，但结果无法在聊天中显示/);
  assert.doesNotMatch(rowFailed, /未代批/);
  assert.match(UL.governanceJudgeNoticeText("decision", "unknown-code"), /判断未完成/);
});

test("preload 暴露 decision 四方法与结果行订阅；不暴露 Node 原语", () => {
  const preload = readFileSync(path.join(repoRoot, "app/preload.cjs"), "utf8");
  for (const method of [
    "getDecisionJudgeState",
    "setDecisionJudgeEnabled",
    "onDecisionJudgeState",
    "onOperatorJudgeResult",
  ]) {
    assert.match(preload, new RegExp(`${method}\\s*:`), `preload 必须暴露 ${method}`);
  }
  assert.match(preload, /decision:judge-get/);
  assert.match(preload, /decision:judge-set/);
  assert.match(preload, /decision:judge-state/);
  assert.match(preload, /session:operator-judge/);
  assert.doesNotMatch(preload, /localStorage|sessionStorage/);
});

test("主进程接线：两开关各自复位；approval/decision 分组各读自己的开关；开关不写 localStorage", () => {
  const main = readFileSync(path.join(repoRoot, "app/main.ts"), "utf8");
  assert.match(main, /shellJudgeSwitch\.reset\(\)/);
  assert.match(main, /decisionJudgeSwitch\.reset\(\)/);
  assert.match(
    main,
    /isGroupEnabled:\s*\(group\)\s*=>\s*\(group === "approval" \? shellJudgeSwitch\.isEnabled\(\) : decisionJudgeSwitch\.isEnabled\(\)\)/,
    "两个开关必须按组各自生效（主进程权威）",
  );
  assert.match(main, /decision:judge-get/);
  assert.match(main, /decision:judge-set/);
  assert.match(main, /session:operator-judge/);

  const renderer = readFileSync(path.join(repoRoot, "app/renderer/renderer.js"), "utf8");
  assert.doesNotMatch(renderer, /localStorage[^\n]*[Jj]udge|[Jj]udge[^\n]*localStorage/, "判断开关不得持久化到 localStorage");
});

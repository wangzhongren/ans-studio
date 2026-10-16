// 独立复验（测试角色，2026-10-16）：G-1「契约/工作流落盘 + 派发按地址引用」A1 三件套
// （`extractDispatchReadPaths` / `renderDispatchPrompt` / `planDispatchDelivery`）的**对抗性核对**。
// 本文件全部用例与金文本由本角色**独立构造**（不复用实施方 `test/编排/dispatch-reads.test.ts` 的断言）：
// 金文本按设计规格（`角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md` §四）
// 手写后与实现逐字比对；命中失败即实现与规格/旧格式不符。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  extractDispatchReadPaths,
  planDispatchDelivery,
  renderDispatchPrompt,
} from "../../../src/common/编排/handback.ts";
import type { DispatchTaskPayload } from "../../../src/model/runtime.ts";

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const BLOCK_HEAD = "必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：";
const DONE_LEGACY = "完成后请交回报告（改了什么/结论/证据）。";
const DONE_WF = "完成后请交回报告（改了什么 / 结论 / 证据；完成口令见 workflow.md 第 2 节）。";
const req = (task: string, reason?: string): DispatchTaskPayload =>
  reason === undefined ? { roleId: "实现者", task } : { roleId: "实现者", task, reason };

// —————— ① 提取：对抗性边界 ——————

test("对抗-提取：嵌套契约路径捕捉（契约目录整树）；`docs/contracts/.md` 空名防串", () => {
  assert.deepEqual(
    extractDispatchReadPaths("对照 docs/contracts/api/nested/deep-v2.md 实施"),
    ["docs/contracts/api/nested/deep-v2.md"],
    "子路径契约文件须捕捉（契约空间＝整树）",
  );
  assert.deepEqual(extractDispatchReadPaths("见 docs/contracts/.md"), [], "空名 `docs/contracts/.md` 不得捕捉");
});

test("对抗-提取：产物路径/目录式/URL/绝对路径/contracts2 前缀/中文紧贴——一律不误捕", () => {
  const task = [
    "产物：temp/out-v1.md、src/impl.ts、角色卡/测试/docs/change/。",
    "目录式：docs/contracts/ 与 docs/contracts（无斜杠）。",
    "URL：https://host/docs/contracts/net-v1.md",
    "绝对：/repo/docs/contracts/abs-v1.md",
    "前缀串：docs/contracts2/other-v1.md",
    "中文紧贴：docs/contracts/cjk-v1.md的说明（保守跳过）。",
  ].join("\n");
  assert.deepEqual(extractDispatchReadPaths(task), [], "「将要创建的输出」与不可读指称绝不误判为必读输入");
});

test("对抗-提取：workflow 恒置首（文本后段出现亦然）；契约首现序；重复引用去重", () => {
  const task = [
    "先按 docs/contracts/z-first-v1.md 开工，后读 docs/contracts/a-second-v1.md；",
    "最后重读 docs/contracts/z-first-v1.md（重复）与 docs/workflow.md。",
  ].join("\n");
  assert.deepEqual(extractDispatchReadPaths(task), [
    "docs/workflow.md",
    "docs/contracts/z-first-v1.md",
    "docs/contracts/a-second-v1.md",
  ]);
});

// —————— ② 渲染：金文本逐字（独立手写） ——————

test("对抗-渲染：无引用派发逐字 = 无引用旧格式三行（我的独立金文本；含原因段/多行任务对照组）", () => {
  assert.equal(
    renderDispatchPrompt(req("把 src/x.ts 补上校验")),
    ["[派发] 来自 su 的任务", "把 src/x.ts 补上校验", DONE_LEGACY].join("\n"),
  );
  const withReason = renderDispatchPrompt(req("第一步", "返工：证据不足"));
  assert.equal(
    withReason,
    ["[派发] 来自 su 的任务（原因：返工：证据不足）", "第一步", DONE_LEGACY].join("\n"),
    "原因段在场时仍逐字（无引用 = 无必读块、无「任务：」前缀）",
  );
  assert.equal(
    renderDispatchPrompt(req("行一\n\n行三")),
    ["[派发] 来自 su 的任务", "行一\n\n行三", DONE_LEGACY].join("\n"),
    "多行任务逐字保留",
  );
});

test("对抗-渲染：引用仅来自 opts（本函数不提取/不触盘）——任务文本提到契约而 opts 缺省 ⇒ 不注入块", () => {
  const task = "按 docs/contracts/kanban-v1.md 实施";
  assert.equal(
    renderDispatchPrompt(req(task)),
    ["[派发] 来自 su 的任务", task, DONE_LEGACY].join("\n"),
    "渲染是纯函数：提取归 plan 阶段（桌面接线先提取再判据），本层不自行注入",
  );
});

test("对抗-渲染：必读块逐字金文本（workflow 第 1、契约第 2、哈希逐字、「任务：」前缀、完成口令指向第 2 节）", () => {
  const wf = h("workflow-bytes-A");
  const ct = h("contract-bytes-B");
  const task = "按 docs/contracts/kanban-api-v1.md 实现；先读 docs/workflow.md";
  const text = renderDispatchPrompt(req(task), {
    references: [
      { path: "docs/workflow.md", sha256: wf },
      { path: "docs/contracts/kanban-api-v1.md", sha256: ct },
    ],
  });
  assert.equal(
    text,
    [
      "[派发] 来自 su 的任务",
      BLOCK_HEAD,
      `  1. docs/workflow.md（sha256:${wf}）`,
      `  2. docs/contracts/kanban-api-v1.md（sha256:${ct}）`,
      `任务：${task}`,
      DONE_WF,
    ].join("\n"),
  );
  assert.equal(/授权|获准|放行|写权/.test(text), false, "块内不得夹带授权语义（独立反向断言）");
});

test("对抗-渲染：完成句变体仅在 workflow 引用在场——仅契约 ⇒ 全文不出现 workflow.md / 第 2 节", () => {
  const ct = h("CT-only");
  const text = renderDispatchPrompt(req("读 docs/contracts/only-v1.md"), {
    references: [{ path: "docs/contracts/only-v1.md", sha256: ct }],
  });
  assert.ok(text.includes(`  1. docs/contracts/only-v1.md（sha256:${ct}）`), "契约编号从 1 起");
  assert.equal(text.includes("workflow.md"), false, "未引用 ⇒ 全文不得出现该文件（不指向不在场第 2 节）");
  assert.ok(text.endsWith(DONE_LEGACY), "完成句保持旧句");
});

test("对抗-渲染：workflow 缺失降级逐字（标注在场/该行缺席/编号重排/不指向不在场文件——两形态）", () => {
  const ct = h("CT-degrade");
  const task1 = "先读 docs/workflow.md，再按 docs/contracts/kanban-api-v1.md 实施";
  assert.equal(
    renderDispatchPrompt(req(task1), {
      references: [{ path: "docs/contracts/kanban-api-v1.md", sha256: ct }],
      workflowMissing: true,
    }),
    [
      "[派发] 来自 su 的任务",
      BLOCK_HEAD,
      "  （本项目未提供 workflow.md）",
      `  1. docs/contracts/kanban-api-v1.md（sha256:${ct}）`,
      `任务：${task1}`,
      DONE_LEGACY,
    ].join("\n"),
    "标注措辞照设计 §四.3；契约重排为第 1",
  );
  const task2 = "读 docs/workflow.md";
  assert.equal(
    renderDispatchPrompt(req(task2), { workflowMissing: true }),
    ["[派发] 来自 su 的任务", BLOCK_HEAD, "  （本项目未提供 workflow.md）", `任务：${task2}`, DONE_LEGACY].join("\n"),
    "仅 workflow 引用且缺失：仍出块（如实标注），完成句不指向不在场文件",
  );
});

test("对抗-渲染：矛盾输入（引用在场 + 缺失标注）→ 引用为准（抑制标注、完成句指回第 2 节）", () => {
  const wf = h("WF-contradiction");
  const task = "读 docs/workflow.md";
  const text = renderDispatchPrompt(req(task), {
    references: [{ path: "docs/workflow.md", sha256: wf }],
    workflowMissing: true,
  });
  assert.equal(text.includes("未提供"), false, "以探测后的事实（references）为准");
  assert.ok(text.includes(`  1. docs/workflow.md（sha256:${wf}）`));
  assert.ok(text.endsWith(DONE_WF));
});

// —————— ③ 判据：fail-closed（planDispatchDelivery） ——————

test("对抗-判据：契约缺失（含 <missing>/空/非法/大写 hex）一律拒投——回执逐字、结构上无投递文本", () => {
  const task = "按 docs/contracts/miss-v1.md 实施";
  for (const bad of [undefined, "", "<missing>", "zz", "a".repeat(63), "A".repeat(64), "g".repeat(64)] as (string | undefined)[]) {
    const p = planDispatchDelivery(req(task), new Map([["docs/contracts/miss-v1.md", bad]]));
    assert.equal(p.action, "reject", `探测值 ${JSON.stringify(bad)} 必须按「不存在」fail-closed`);
    assert.ok(p.action === "reject");
    assert.equal(p.message, "派发未受理：引用的契约 docs/contracts/miss-v1.md 不存在——未投递。", "回执逐字");
    assert.ok(p.systemRow.includes("**未投递**") && p.systemRow.includes("docs/contracts/miss-v1.md"), "系统行如实（含 **未投递**）");
    assert.equal(Object.prototype.hasOwnProperty.call(p, "text"), false, "拒投结论不得携带任何可投递文本");
  }
});

test("对抗-判据：多缺报首现序第一个；契约缺失优先于 workflow（即便 workflow 在场仍拒）", () => {
  const task = "先对照 docs/contracts/b-v1.md，再看 docs/contracts/a-v1.md；另读 docs/workflow.md";
  const p = planDispatchDelivery(req(task), new Map<string, string | undefined>([
    ["docs/contracts/a-v1.md", undefined], // 后现且缺失——不报它
    ["docs/contracts/b-v1.md", undefined],
    ["docs/workflow.md", h("wf-present")], // workflow 在场亦不抵消契约缺失
  ]));
  assert.ok(p.action === "reject");
  assert.equal(p.message, "派发未受理：引用的契约 docs/contracts/b-v1.md 不存在——未投递。", "首现序第一，仅报它");
});

test("对抗-判据：workflow 缺失降级照投（编号重排/标注在场）；多余探测项被忽略——不触发拒投", () => {
  const ct = h("CT-degrade2");
  const task = "读 docs/workflow.md，再按 docs/contracts/kanban-api-v1.md 实施";
  const p = planDispatchDelivery(req(task), new Map<string, string | undefined>([
    ["docs/workflow.md", "<missing>"],
    ["docs/contracts/kanban-api-v1.md", ct],
    ["docs/contracts/unreferenced-v1.md", undefined], // 未被任务引用且缺失——不得参与判据
  ]));
  assert.ok(p.action === "deliver", "workflow 缺失不拒投；未引用路径不校验");
  assert.ok(p.text.includes("  （本项目未提供 workflow.md）"));
  assert.ok(p.text.includes(`  1. docs/contracts/kanban-api-v1.md（sha256:${ct}）`), "契约重排为 1");
  assert.equal(p.text.includes("workflow.md（sha256:"), false, "缺失行被省略");
});

test("对抗-判据：全齐放行——文本逐字等于独立手写的完整金文本（plan 与 render 无第二份渲染）", () => {
  const wf = h("WF-full");
  const ct = h("CT-full");
  const task = "按 docs/contracts/kanban-api-v1.md 实施；依据 docs/workflow.md";
  const p = planDispatchDelivery(req(task), new Map<string, string | undefined>([
    ["docs/contracts/kanban-api-v1.md", ct],
    ["docs/workflow.md", wf],
  ]));
  assert.ok(p.action === "deliver");
  assert.equal(
    p.text,
    [
      "[派发] 来自 su 的任务",
      BLOCK_HEAD,
      `  1. docs/workflow.md（sha256:${wf}）`,
      `  2. docs/contracts/kanban-api-v1.md（sha256:${ct}）`,
      `任务：${task}`,
      DONE_WF,
    ].join("\n"),
  );
});

// test/编排/dispatch-reads.test.ts
// 编排角色自测：G-1「契约与工作流落盘 + 派发按地址引用」A1（设计
// `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md` §四；客户 2026-10-16 批准）
// ——本角色交付的**单一来源**三件套：
//   · `extractDispatchReadPaths`：固定提取规则（只认 `docs/workflow.md` 与 `docs/contracts/**.md`；
//     产物路径等不误捕；workflow 置首、契约按首现序、去重）；
//   · `renderDispatchPrompt` 的「必读（按序）」块渲染（哈希由调用方算好、逐字注入；无引用 = 旧格式逐字）；
//   · `planDispatchDelivery`：fail-closed 判据（契约缺失 → 拒投 + 如实回执、**不产生可投递文本**；
//     workflow 缺失 → 降级标注不拒投；非法/缺失探测值一律按不存在）。
// 全程纯函数、不触盘——哈希用 node:crypto 对固定字节算出后传入（**真实哈希计算归投递侧代码**，
// 桌面窗口用其带缓存的 `filePrint`；本测试钉「注入什么就渲染什么」与判据语义）。
// 跨边界（桌面窗口接线）接口说明见 `角色卡/编排/docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md`。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { DispatchTaskPayload } from "../../src/model/runtime.ts";
import {
  extractDispatchReadPaths,
  planDispatchDelivery,
  renderDispatchPrompt,
} from "../../src/common/编排/handback.ts";

/** 夹具哈希：模拟投递侧代码对文件当刻字节算出的 sha256（64 位小写 hex）。 */
const sha = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
const WF = sha("workflow.md 当刻字节 v1");
const CT = sha("kanban-api-v1.md 当刻字节");
const CT2 = sha("other-v1.md 当刻字节");

const req = (task: string, extra?: Partial<DispatchTaskPayload>): DispatchTaskPayload =>
  ({ roleId: "实现者", task, ...extra });

// —— extractDispatchReadPaths：固定提取规则 ——

test("extractDispatchReadPaths（G-1）：只认 workflow 与 contracts/*.md；workflow 置首、契约按首现序、去重", () => {
  const task = [
    "按 docs/contracts/kanban-api-v1.md 实现（返工点：对照 docs/contracts/kanban-api-v1.md 第 3 节）。",
    "先读 docs/workflow.md（第 2 节完成口令），再读 `docs/contracts/kanban-api-v1.md`。**docs/workflow.md** 必读。",
    "参考 docs/contracts/note-v2.md 与 docs/contracts/sub/nested-v1.md。",
  ].join("\n");
  assert.deepEqual(
    extractDispatchReadPaths(task),
    ["docs/workflow.md", "docs/contracts/kanban-api-v1.md", "docs/contracts/note-v2.md", "docs/contracts/sub/nested-v1.md"],
    "workflow 置首（§五.3 阅读序）；契约首现序、去重；契约目录整树（含子路径）都属契约空间",
  );
});

test("extractDispatchReadPaths（G-1）：产物路径/其它 docs/非 .md/目录式/URL/绝对路径/契约目录之外的都不捕获", () => {
  const task = [
    "产物写 temp/out.md 与 src/impl.ts；测试证据放 角色卡/测试/docs/change/。",
    "参考 docs/readme.md、docs/su/notes.md、docs/contracts/data.json、`docs/contracts/`（目录）、docs/contracts/.md。",
    "远端 https://x.example/docs/contracts/a.md 与绝对路径 /repo/docs/contracts/a.md 不算。",
    "中文紧贴 docs/contracts/x.md的 保守跳过；docs/contracts2/y.md 前缀不匹配。",
  ].join("\n");
  assert.deepEqual(extractDispatchReadPaths(task), [], "只注入必读输入；「将要创建的输出」绝不误判（§四.3 第 3 条）");
});

test("extractDispatchReadPaths（G-1）：句尾 ASCII 标点剥离（role-card.md. 式）；空文本 → 空", () => {
  assert.deepEqual(extractDispatchReadPaths("按 docs/contracts/a-v1.md. 做"), ["docs/contracts/a-v1.md"]);
  assert.deepEqual(extractDispatchReadPaths(""), []);
});

// —— renderDispatchPrompt：必读块格式（单一来源） ——

test("renderDispatchPrompt（G-1）：无引用 → 旧格式逐字不变（引用块是「加」出来的；去重键不受影响）", () => {
  const r = req("把 src/x.ts 的校验补上", { reason: "返工：证据不足" });
  const legacy = [
    "[派发] 来自 su 的任务（原因：返工：证据不足）",
    "把 src/x.ts 的校验补上",
    "完成后请交回报告（改了什么/结论/证据）。",
  ].join("\n");
  assert.equal(renderDispatchPrompt(r), legacy);
  assert.equal(renderDispatchPrompt(r, {}), legacy, "空 opts 同旧格式");
  assert.equal(renderDispatchPrompt(r, { references: [] }), legacy, "空引用同旧格式");
  assert.equal(renderDispatchPrompt(r, { sourceRoleId: "su" }), legacy, "显式 su 同旧格式");
});

test("renderDispatchPrompt：sourceRoleId → 首行「来自 <角色> 的任务」；[派发] 前缀与 task 原文不变", () => {
  const r = req("把 src/x.ts 的校验补上\n第二行也逐字保留", { reason: "首派" });
  const text = renderDispatchPrompt(r, { sourceRoleId: "convener" });
  assert.equal(text.split("\n")[0], "[派发] 来自 convener 的任务（原因：首派）");
  assert.ok(text.includes("\n把 src/x.ts 的校验补上\n第二行也逐字保留\n"), "task 原文逐字保留");
  assert.ok(text.startsWith("[派发] "), "行首前缀不得变（渲染侧归类依赖）");
  // 不传 sourceRoleId ⇒ 仍「来自 su」（single/su 兼容）。
  assert.equal(renderDispatchPrompt(r).split("\n")[0], "[派发] 来自 su 的任务（原因：首派）");
});

test("renderDispatchPrompt：sourceRoleId + 必读块 → 仅首行变化，块格式逐字不变", () => {
  const r = req("按 docs/contracts/kanban-api-v1.md 实现 kanban 接口");
  const text = renderDispatchPrompt(r, {
    sourceRoleId: "convener",
    references: [
      { path: "docs/workflow.md", sha256: WF },
      { path: "docs/contracts/kanban-api-v1.md", sha256: CT },
    ],
  });
  assert.equal(text, [
    "[派发] 来自 convener 的任务",
    "必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：",
    `  1. docs/workflow.md（sha256:${WF}）`,
    `  2. docs/contracts/kanban-api-v1.md（sha256:${CT}）`,
    "任务：按 docs/contracts/kanban-api-v1.md 实现 kanban 接口",
    "完成后请交回报告（改了什么 / 结论 / 证据；完成口令见 workflow.md 第 2 节）。",
  ].join("\n"), "必读块格式不随派发主人变化");
});

test("planDispatchDelivery：第三参透传 sourceRoleId（有/无必读引用两个 deliver 分支）", () => {
  const plain = req("直接实现");
  const plainPlan = planDispatchDelivery(plain, new Map(), { sourceRoleId: "convener" });
  assert.equal(plainPlan.action, "deliver");
  assert.equal(plainPlan.text.split("\n")[0], "[派发] 来自 convener 的任务");
  const withRefs = req("按 docs/contracts/kanban-api-v1.md 实现");
  const plan = planDispatchDelivery(
    withRefs,
    new Map([["docs/contracts/kanban-api-v1.md", CT]]),
    { sourceRoleId: "convener" },
  );
  assert.equal(plan.action, "deliver");
  assert.equal(plan.text.split("\n")[0], "[派发] 来自 convener 的任务");
  assert.ok(plan.text.includes(`  1. docs/contracts/kanban-api-v1.md（sha256:${CT}）`));
  // 不传 ⇒ 旧行为逐字（既有调用方不受影响）。
  const legacyPlan = planDispatchDelivery(plain, new Map());
  assert.equal(legacyPlan.action, "deliver");
  assert.equal(legacyPlan.text.split("\n")[0], "[派发] 来自 su 的任务");
});

test("renderDispatchPrompt（G-1）：workflow+契约 → 逐行必读块（编号/缩进/哈希逐字/完成口令指向）；无授权语义", () => {
  const r = req("按 docs/contracts/kanban-api-v1.md 实现 kanban 接口", { reason: "首派" });
  const text = renderDispatchPrompt(r, {
    references: [
      { path: "docs/workflow.md", sha256: WF },
      { path: "docs/contracts/kanban-api-v1.md", sha256: CT },
    ],
  });
  assert.equal(text, [
    "[派发] 来自 su 的任务（原因：首派）",
    "必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：",
    `  1. docs/workflow.md（sha256:${WF}）`,
    `  2. docs/contracts/kanban-api-v1.md（sha256:${CT}）`,
    "任务：按 docs/contracts/kanban-api-v1.md 实现 kanban 接口",
    "完成后请交回报告（改了什么 / 结论 / 证据；完成口令见 workflow.md 第 2 节）。",
  ].join("\n"), "格式照设计 §四.1；哈希逐字注入（本层不重算、不截断）");
  assert.ok(!/授权|写权|权限|越权|可写/.test(text), "不得夹带授权语义（派发 ≠ 授权）");
});

test("renderDispatchPrompt（G-1）：仅契约 → 无 workflow 行、（未引用 workflow 时）完成句为旧句；多行 task 逐字保留", () => {
  const r = req("第一步：读 docs/contracts/kanban-api-v1.md\n\n第二步：改实现\n第三步：跑测试");
  const text = renderDispatchPrompt(r, { references: [{ path: "docs/contracts/kanban-api-v1.md", sha256: CT }] });
  assert.ok(text.includes(`  1. docs/contracts/kanban-api-v1.md（sha256:${CT}）`), "契约编号从 1 起（无 workflow 不占号）");
  assert.ok(!text.includes("docs/workflow.md"), "未引用的文件不出现");
  assert.ok(text.includes("任务：第一步：读 docs/contracts/kanban-api-v1.md\n\n第二步：改实现\n第三步：跑测试"), "task 原文逐字（任务：前缀只贴首行）");
  assert.ok(text.endsWith("完成后请交回报告（改了什么/结论/证据）。"), "无 workflow 可读时不指向其第 2 节（完成口令协议不在场）");
});

test("renderDispatchPrompt（G-1）：workflow 缺失降级 → 块内如实标注、省略该行、不拒投口吻；有契约时契约照常编号", () => {
  const text = renderDispatchPrompt(req("先读 docs/workflow.md 再动手"), {
    references: [{ path: "docs/contracts/kanban-api-v1.md", sha256: CT }],
    workflowMissing: true,
  });
  assert.equal(text, [
    "[派发] 来自 su 的任务",
    "必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：",
    "  （本项目未提供 workflow.md）",
    `  1. docs/contracts/kanban-api-v1.md（sha256:${CT}）`,
    "任务：先读 docs/workflow.md 再动手",
    "完成后请交回报告（改了什么/结论/证据）。",
  ].join("\n"), "降级标注措辞照设计 §四.3 原文；不指向不存在的第 2 节");
});

test("renderDispatchPrompt（G-1）：标注与引用同路径矛盾 → 引用为准（探测后的事实），抑制标注、保留完成口令行", () => {
  const text = renderDispatchPrompt(req("先读 docs/workflow.md 再动手"), {
    references: [{ path: "docs/workflow.md", sha256: WF }],
    workflowMissing: true,
  });
  assert.ok(!text.includes("未提供"), "矛盾输入以 references（探测事实）为准");
  assert.ok(text.includes(`  1. docs/workflow.md（sha256:${WF}）`));
  assert.ok(text.endsWith("完成后请交回报告（改了什么 / 结论 / 证据；完成口令见 workflow.md 第 2 节）。"));
});

// —— planDispatchDelivery：fail-closed 判据（单一来源） ——

test("planDispatchDelivery（G-1 单一来源复用）：全齐 → 放行；放行文本与 renderDispatchPrompt 逐字一致（无第二份渲染）", () => {
  const r = req("按 docs/contracts/kanban-api-v1.md 实现；先读 docs/workflow.md");
  const probes = new Map<string, string | undefined>([
    ["docs/workflow.md", WF],
    ["docs/contracts/kanban-api-v1.md", CT],
  ]);
  const plan = planDispatchDelivery(r, probes);
  assert.equal(plan.action, "deliver");
  assert.ok(plan.action === "deliver");
  assert.equal(plan.text, renderDispatchPrompt(r, {
    references: [
      { path: "docs/workflow.md", sha256: WF },
      { path: "docs/contracts/kanban-api-v1.md", sha256: CT },
    ],
  }), "放行文本必须出自同一 render（桌面切换后不得再有第二份模板）");
});

test("planDispatchDelivery（G-1）：契约缺失（未探测/`<missing>`/非法值）→ 拒投 + 逐字回执；**不产生可投递文本**", () => {
  const r = req("按 docs/contracts/kanban-api-v1.md 实现");
  for (const bad of [undefined, "", "<missing>", "ABC", "a".repeat(63), "A".repeat(64)] as (string | undefined)[]) {
    const plan = planDispatchDelivery(r, new Map([["docs/contracts/kanban-api-v1.md", bad]]));
    assert.equal(plan.action, "reject", `探测值 ${JSON.stringify(bad)} 必须按「不存在」fail-closed`);
    assert.ok(plan.action === "reject");
    assert.equal(plan.message, "派发未受理：引用的契约 docs/contracts/kanban-api-v1.md 不存在——未投递。");
    assert.ok(plan.systemRow.includes("**未投递**"), "系统行如实、不静默");
    assert.ok(!("text" in plan), "拒投结论结构上不携带任何可投递文本（目标会话零投递由接线侧保证）");
  }
});

test("planDispatchDelivery（G-1）：多个契约缺失 → 报首现序第一个；workflow 也缺时拒投优先（契约 > 降级）", () => {
  const r = req("先按 docs/contracts/b-v1.md 再对 docs/contracts/a-v1.md；另读 docs/workflow.md");
  const plan = planDispatchDelivery(r, new Map<string, string | undefined>([
    ["docs/contracts/a-v1.md", undefined], // 后现但缺失——不报它
    ["docs/contracts/b-v1.md", undefined],
    ["docs/workflow.md", undefined],
  ]));
  assert.equal(plan.action, "reject");
  assert.ok(plan.action === "reject");
  assert.ok(plan.message.includes("docs/contracts/b-v1.md"), "首现序第一");
  assert.ok(!plan.message.includes("a-v1.md"), "只报第一个（修正后重派再检下一个）");
});

test("planDispatchDelivery（G-1）：仅 workflow 缺失 → 降级放行（不拒投）；编号重排；旧完成句；workflow 恢复后指向其在场版本", () => {
  const r = req("先读 docs/workflow.md，再按 docs/contracts/kanban-api-v1.md 做");
  const degraded = planDispatchDelivery(r, new Map<string, string | undefined>([
    ["docs/workflow.md", "<missing>"],
    ["docs/contracts/kanban-api-v1.md", CT],
  ]));
  assert.equal(degraded.action, "deliver", "workflow 缺失不拒投（§四.3 第 2 条）");
  assert.ok(degraded.action === "deliver");
  assert.ok(degraded.text.includes("  （本项目未提供 workflow.md）"));
  assert.ok(degraded.text.includes(`  1. docs/contracts/kanban-api-v1.md（sha256:${CT}）`), "契约编号重排为 1");
  assert.ok(degraded.text.endsWith("完成后请交回报告（改了什么/结论/证据）。"));

  const ok = planDispatchDelivery(r, new Map<string, string | undefined>([
    ["docs/workflow.md", WF],
    ["docs/contracts/kanban-api-v1.md", CT],
  ]));
  assert.ok(ok.action === "deliver");
  assert.ok(ok.text.includes("完成口令见 workflow.md 第 2 节"), "workflow 在场时完成口令指向恢复");
});

test("planDispatchDelivery（G-1）：未引用任何必读 → 放行旧文案逐字；probes 多余项不参与、不影响", () => {
  const r = req("把 src/x.ts 的校验补上");
  const plan = planDispatchDelivery(r, new Map([["docs/workflow.md", WF], ["docs/contracts/kanban-api-v1.md", CT]]));
  assert.ok(plan.action === "deliver");
  assert.equal(plan.text, renderDispatchPrompt(r), "未提取到引用 = 旧格式逐字（多余探测项被忽略）");
});

test("planDispatchDelivery（G-1）：提取与整理保序——workflow 在文本后段出现也置首编号；哈希逐字透传", () => {
  const r = req("先按 docs/contracts/kanban-api-v1.md 做，最后再看 docs/workflow.md；另对照 docs/contracts/other-v1.md");
  const plan = planDispatchDelivery(r, new Map<string, string | undefined>([
    ["docs/workflow.md", WF],
    ["docs/contracts/kanban-api-v1.md", CT],
    ["docs/contracts/other-v1.md", CT2],
  ]));
  assert.ok(plan.action === "deliver");
  const lines = plan.text.split("\n");
  assert.equal(lines[2], `  1. docs/workflow.md（sha256:${WF}）`, "workflow 恒为第 1 条（阅读序）");
  assert.equal(lines[3], `  2. docs/contracts/kanban-api-v1.md（sha256:${CT}）`);
  assert.equal(lines[4], `  3. docs/contracts/other-v1.md（sha256:${CT2}）`);
});

// —————————————— B 批（2026-10-28）：星形任务卡字段 / 任务编号 / 期望产出 / 证据提示 ——————————————

test("renderDispatchPrompt（B）：任务编号/期望产出/可选证据作为固定字段；旧调用逐字不变", () => {
  const r = req("实现 X");
  const base = renderDispatchPrompt(r);
  assert.equal(base, renderDispatchPrompt(r, {}), "空选项 = 旧格式");
  const star = renderDispatchPrompt(r, {
    sourceRoleId: "幕僚",
    taskId: "t-123",
    expectedOutput: "src/x.ts",
    requestedEvidence: ["src/x.ts", "test/x.test.ts"],
  });
  assert.match(star, /^\[派发\] 来自 幕僚 的任务/);
  assert.match(star, /任务编号：#t-123/);
  assert.match(star, /期望产出：src\/x\.ts/);
  assert.match(star, /可选证据：src\/x\.ts；test\/x\.test\.ts/);
  assert.match(star, /实现 X/);
  assert.doesNotMatch(star, /授权|批准|customer\.decision/, "派发文本不夹带授权语义");
});

test("planDispatchDelivery（B）：任务卡字段透传；契约缺失仍 fail-closed 拒投（不因 taskId 放行）", () => {
  const r = req("按 docs/contracts/missing-v1.md 实现 X");
  const rejected = planDispatchDelivery(r, new Map(), { sourceRoleId: "幕僚", taskId: "t-1", expectedOutput: "src/x.ts" });
  assert.equal(rejected.action, "reject");
  const r2 = req("实现 X");
  const delivered = planDispatchDelivery(r2, new Map(), { sourceRoleId: "幕僚", taskId: "t-1", expectedOutput: "src/x.ts", requestedEvidence: ["src/x.ts"] });
  assert.equal(delivered.action, "deliver");
  if (delivered.action === "deliver") {
    assert.match(delivered.text, /任务编号：#t-1/);
    assert.match(delivered.text, /期望产出：src\/x\.ts/);
    assert.match(delivered.text, /可选证据：src\/x\.ts/);
  }
});

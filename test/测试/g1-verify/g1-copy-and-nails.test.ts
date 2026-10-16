// 独立复验（测试角色，2026-10-16）：G-1 的**四处文案口径一致性抽查**与**代码级钉子**——
// 渲染块（编排 handback）/ 卡文本（门禁引擎 boundary-core）/ 工具描述（运行时核心 schema）/
// 治理会话文案（编排 govern-session）关键短语互对；以及（独立于实施方断言自建的）反向断言与
// 非空洞验证（内存变异必须被谓词捕获）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { BUILT_IN_ROLE_CARD_TEXT } from "../../../src/common/门禁引擎/boundary-core.ts";
import { describeTool } from "../../../src/provider/runtime/schema.ts";
import { renderDispatchPrompt } from "../../../src/common/编排/handback.ts";

const read = (rel: string) => fs.readFile(new URL(rel, import.meta.url), "utf8");
const T = BUILT_IN_ROLE_CARD_TEXT;
const splitClauses = (text: string) => text.split(/[。；\n]/);

test("代码级钉子（独立）：session.ts 无本地副本实现/调用、无内嵌派发模板；接线走编排三件套", async () => {
  const sess = await read("../../../app/desktop/session.ts");
  assert.equal(/renderDispatchPromptLocal\s*\(/.test(sess), false, "session.ts 不得残留本地副本的**实现/调用**（ASCII 左括号判据；注释性指称合法）");
  assert.equal(sess.includes("[派发] 来自"), false, "session.ts 不得内嵌派发文案模板（渲染单一来源 = 编排）");
  assert.ok(sess.includes("extractDispatchReadPaths("), "接线须调用提取（单一来源）");
  assert.ok(sess.includes("planDispatchDelivery("), "接线须调用判据（单一来源）");
  assert.ok(sess.includes("plan.text"), "入队文本须取自判据产出（定格文本）");
});

test("代码级钉子（独立）：su 预授权写目录恰为四棵（docs/su + docs/contracts + docs/skills + docs/mcp）——workflow.md 不在其中", async () => {
  const src = await read("../../../src/pipeline/orchestration/run-role.ts");
  const m = src.match(/const SU_PREAUTHORIZED_WRITE_DIRS[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(m, "须能定位 SU_PREAUTHORIZED_WRITE_DIRS 定义");
  const dirs = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(dirs, ["docs/su", "docs/contracts", "docs/skills", "docs/mcp"], "恰为四棵目录树（客户裁定范围；G-4＋V2 扩列后＝四棵；两分写盘口径的机制实况）");
  assert.equal(dirs.some((d) => d.includes("workflow")), false, "docs/workflow.md 不在预授权内（走规划确认）");
});

test("卡文本独立反向断言（含非空洞验证）：含 docs/workflow.md 的小句不得声称免确认/直接写/预授权", () => {
  const banned = /直接写|无需(逐次)?确认|免(逐次)?确认|已预置|预授权/;
  const clauses = splitClauses(T).filter((c) => c.includes("docs/workflow.md"));
  assert.ok(clauses.length >= 3, `含 docs/workflow.md 的小句应 ≥3（规划纪律/J-1 扩展多处），实得 ${clauses.length}——面非空洞`);
  for (const c of clauses) {
    assert.equal(banned.test(c), false, `含 docs/workflow.md 的小句不得声称免确认/直接写（实得：${c}）`);
  }
  // 非空洞验证（内存变异）：谓词必须捕获全部违规变体（不依赖实施方测试文件的断言）
  const violations = [
    "`docs/workflow.md` 已预置、直接写即可",
    "`docs/workflow.md` 无需逐次确认、直接写",
    "`docs/workflow.md` 为预授权目录",
  ];
  for (const [i, v] of violations.entries()) {
    const mutated = T.replace("`docs/workflow.md` 不在预置四目录内", v);
    assert.notEqual(mutated, T, `变体 ${i} 应真实发生替换（防变异点漂移）`);
    const caught = splitClauses(mutated).filter((c) => c.includes("docs/workflow.md")).some((c) => banned.test(c));
    assert.equal(caught, true, `变体 ${i} 必须被谓词捕获：${v}`);
  }
});

test("卡文本独立复核（J-1 守卫语义）：含 授权/获准/放行 的小句全部为否定式；「原地改」小句全部为否定式（各带非空洞验证）", () => {
  const authClauses = splitClauses(T).filter((c) => /授权|获准|放行/.test(c));
  assert.ok(authClauses.length >= 2, `授权面守卫非空洞（≥2 条），实得 ${authClauses.length}`);
  for (const c of authClauses) {
    assert.match(c, /≠|不得|勿|禁止|非|不是/, `涉及授权面的小句必须是否定/禁止表述（实得：${c}）`);
  }
  for (const bad of ["已获授权", "已放行写盘", "授予写权", "授权写盘", "代为授权成功", "派发即授权", "派发即放行"]) {
    assert.equal(T.includes(bad), false, `卡文本不得出现肯定式「${bad}」`);
  }
  const inPlace = splitClauses(T).filter((c) => /原地改/.test(c));
  assert.ok(inPlace.length >= 1, "「不原地改 v1」小句须在场（面非空洞）");
  // 谓词必须紧贴「原地改」判否定（同句他处的「不」（如「不可变」）不得误放行——前一版谓词即栽在这）。
  const inPlaceNegated = /不[得要]?原地改|勿原地改|禁止原地改|切勿原地改/;
  for (const c of inPlace) {
    assert.match(c, inPlaceNegated, `含「原地改」的小句必须带紧贴否定（实得：${c}）`);
  }
  // 非空洞验证：否定词置于同句他处（「冻结后不可变…可原地改 v1」）也必须被捕获
  const mutatedInPlace = T.replace("、**不原地改 v1**", "、可原地改 v1");
  assert.notEqual(mutatedInPlace, T, "「原地改」变异点须存在");
  assert.ok(
    splitClauses(mutatedInPlace).filter((c) => /原地改/.test(c)).some((c) => !inPlaceNegated.test(c)),
    "肯定式「可原地改 v1」（同句含『不可变』的『不』）必须被紧贴谓词捕获（非空洞）",
  );
  // 「自己算/手算/转抄哈希」类表述必须是否定式（同法紧贴判）
  const selfHash = splitClauses(T).filter((c) => /自己算|手算|转抄/.test(c));
  assert.ok(selfHash.length >= 1, "「不要自己算或转抄哈希」小句须在场（面非空洞）");
  for (const c of selfHash) {
    assert.match(c, /不要|不得|勿|禁止|严禁/, `「自己算/转抄」类小句必须是否定式（实得：${c}）`);
  }
  const mutatedSelfHash = T.replace("**不要自己算或转抄哈希**", "**请自己算并转抄哈希**");
  assert.notEqual(mutatedSelfHash, T, "「自己算」变异点须存在");
  assert.ok(
    splitClauses(mutatedSelfHash).filter((c) => /自己算|手算|转抄/.test(c)).some((c) => !/不要|不得|勿|禁止|严禁/.test(c)),
    "肯定式「请自己算并转抄哈希」必须被谓词捕获（非空洞）",
  );
  // 授权面非空洞验证：新增一条无否定的「授权」小句必须被守卫谓词捕获
  const mutatedAuth = `${T}\n已获授权写 src/**。`;
  assert.ok(
    splitClauses(mutatedAuth).filter((c) => /授权|获准|放行/.test(c)).some((c) => !/≠|不得|勿|禁止|非|不是/.test(c)),
    "无否定的「已获授权写 src/**」小句必须被授权面谓词捕获（非空洞）",
  );
});

test("卡文本正向在场性（独立短语清单）：G-1/A3 关键纪律逐字落卡", () => {
  for (const phrase of [
    "规划纪律", "先落盘再派发", "冻结后不可变", "不原地改 v1", "旧版保留可读",
    "docs/workflow.md", "步骤表", "完成口令", "变更与重验", "改动依赖后重测调用方",
    "已预置的 `docs/contracts/**`（直接写即可）", "不在预置四目录内", "同一次规划确认",
    "动手前先读", "blocked", "不得猜、不得改契约",
    "按地址引用", "不内嵌契约全文", "必读（按序）", "不要自己算或转抄哈希", "拒投", "补落盘后重派",
    "受影响步骤的既有回交", "未受影响的步骤不回滚、不重跑",
  ]) {
    assert.ok(T.includes(phrase), `卡文本须含「${phrase}」`);
  }
  // 旧计数防回退负向（V2 扩列后：四棵为唯一真值；两棵/三棵话术逐字不得复现）
  for (const stale of ["写入这两棵目录树", "写入这三棵目录树", "预置的两棵目录树除外", "预置的三棵目录树除外", "不在预置两目录内", "不在预置三目录内"]) {
    assert.equal(T.includes(stale), false, `旧话术「${stale}」不得复现`);
  }
});

test("四处文案口径一致性抽查（独立）：渲染块 / 卡文本 / 工具描述 / 治理会话文案 关键短语互对", async () => {
  const tool = describeTool("dispatch_task");
  const toolText = [tool.description, ...(tool.promptGuidelines ?? [])].join("\n");
  const block = renderDispatchPrompt({ roleId: "x", task: "t" }, {
    references: [{ path: "docs/workflow.md", sha256: "a".repeat(64) }],
  });
  const govern = await read("../../../src/pipeline/orchestration/govern-session.ts");

  // ① 块名与阅读纪律：渲染块 / 卡文本 / 工具描述 三处同短语
  assert.ok(block.includes("必读（按序"), "渲染块头含块名前缀");
  assert.ok(T.includes("必读（按序）"), "卡文本含块名");
  assert.ok(toolText.includes("必读（按序）"), "工具描述含块名");
  for (const t of [block, T, toolText]) assert.ok(t.includes("先读完再动手"), "三处同写「先读完再动手」");

  // ② 哈希归属：系统算、su 不算不转抄（卡 × 工具；与渲染块头「哈希由系统在投递时计算」互对）
  assert.ok(block.includes("哈希由系统在投递时计算"), "渲染块头：系统投递时算");
  assert.ok(T.includes("由系统在投递时计算的 sha256"), "卡文本：系统投递时算");
  assert.ok(toolText.includes("由投递系统在投递当刻计算"), "工具描述：系统投递时算");
  for (const t of [T, toolText]) assert.ok(t.includes("不要自己算或转抄哈希"), "两处同写「不要自己算或转抄哈希」");

  // ③ 按地址引用 / 不嵌全文 / 先落盘再派发（卡 × 工具）
  for (const t of [T, toolText]) {
    assert.ok(t.includes("按地址引用"), "两处同写「按地址引用」");
    assert.ok(t.includes("不内嵌契约全文"), "两处同写「不内嵌契约全文」");
    assert.ok(t.includes("先落盘再派发"), "两处同写「先落盘再派发」");
  }

  // ④ 写盘口径两分（契约直接写；workflow.md 走规划确认）——四处一致；机制实况（恰四棵预授权目录）互证
  assert.ok(T.includes("已预置的 `docs/contracts/**`（直接写即可）"), "卡：契约直接写（预置）");
  assert.ok(toolText.includes("写盘许可已预置、直接写即可"), "工具：契约直接写（预置）");
  assert.ok(T.includes("同一次规划确认"), "卡：workflow 走规划确认 preview");
  assert.ok(toolText.includes("列入规划确认的 preview"), "工具：workflow 走规划确认 preview");
  const preauthClauses = splitClauses(govern).filter((c) => c.includes("预授权"));
  assert.ok(preauthClauses.length >= 2, `治理会话两处预授权句在场（非空洞），实得 ${preauthClauses.length}`);
  for (const c of preauthClauses) {
    assert.ok(c.includes("docs/su/"), `预授权句须点名 docs/su/（实得：${c}）`);
    assert.ok(c.includes("docs/contracts/"), `预授权句须点名 docs/contracts/（实得：${c}）`);
    assert.equal(c.includes("docs/workflow.md"), false, `预授权句不得含 docs/workflow.md（实得：${c}）`);
  }
  for (const c of splitClauses(govern).filter((c) => c.includes("docs/workflow.md"))) {
    assert.equal(/预授权|直接写|无需确认|免确认/.test(c), false, `治理会话中 workflow.md 指称不得与预授权/免确认同句（实得：${c}）`);
  }

  // ⑤ 拒投语义三处互对（卡「拒投」/ 工具「拒绝」/ 渲染判据实现——语义一致：fail-closed + 补落盘后重派）
  assert.ok(/拒投/.test(T) && /补落盘后重派/.test(T), "卡：引用的契约不存在 ⇒ 拒投 + 补落盘后重派");
  assert.ok(/拒绝/.test(toolText) && /补落盘后重派/.test(toolText), "工具：引用的契约不存在 ⇒ 拒绝（回执如实） + 补落盘后重派");
  assert.ok(toolText.includes("不拒投") && toolText.includes("未提供"), "工具：workflow 缺失不拒投、如实标注未提供（与渲染降级互对）");
});

// test/测试/g5-reasoning-verify/g-desktop.test.ts —— G 域：桌面渲染与回放（独立验证）。
//
// 验证对象：`app/renderer/tool-rows.js`（四态文案/可展开性——**真实执行**纯函数）＋
// `app/renderer/renderer.js|styles.css`（select 控件结构/折叠行接线/默认折叠/esc 纯文本/回放分支——源码不变式，
// 沿既有 renderer.test.ts 口径：DOM 行为归 Electron e2e，此处钉结构）＋
// `app/desktop/runtime-history.ts`（回放载体 row.reasoning——**真实驱动 getSessionHistory**）。
// 全部用例独立构造。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getSessionHistory } from "../../../app/desktop/runtime-history.ts";

const APP_RENDERER = path.resolve(import.meta.dirname, "..", "..", "..", "app", "renderer");
const RENDERER = fs.readFileSync(path.join(APP_RENDERER, "renderer.js"), "utf8");
const STYLES = fs.readFileSync(path.join(APP_RENDERER, "styles.css"), "utf8");
const RENDERER_CODE = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

await import(new URL("../../../app/renderer/tool-rows.js", import.meta.url).href);
const Tr = (globalThis as { ANSToolRows?: Record<string, (...args: never[]) => unknown> }).ANSToolRows!;

// —————————————————————— ① 推理折叠行文案（真实执行；四态＋下限 1＋三态防伪） ——————————————————————

test("G1 文案四态（真实执行）：已思考 N 秒[下限 1]／推理内容／已思考（内容由平台省略）／带时长的省略态", () => {
  const label = Tr.reasoningLabel as (reasoning: unknown) => string;
  const text = (value: string) => ({ text: value, truncated: false, redacted: false });
  const complete = (durationMs?: unknown) => ({ text: text("正文"), status: "complete", ...(durationMs !== undefined ? { durationMs } : {}) });
  assert.equal(label(complete(4200)), "已思考 4 秒", "四舍五入到整秒");
  assert.equal(label(complete(5000)), "已思考 5 秒");
  assert.equal(label(complete(400)), "已思考 1 秒", "亚秒下限 1（防「已思考 0 秒」坏件）");
  assert.equal(label(complete(999)), "已思考 1 秒", "四舍五入不进位仍达下限");
  assert.equal(label(complete(0)), "已思考 1 秒", "0ms 真实信号亦有如实下限");
  assert.equal(label(complete()), "推理内容", "无时长 ⇒ 不发明时间");
  assert.equal(label({ text: text(""), status: "omitted" }), "已思考（内容由平台省略）", "平台省略如实注明");
  assert.equal(label({ text: text(""), status: "omitted", durationMs: 8000 }), "已思考 8 秒（内容由平台省略）", "省略＋真实时长并存");
  // 防御：非法 durationMs（负数/NaN/串）按无信号——绝不猜。
  for (const bad of [-1, NaN, "9", Infinity, null]) {
    assert.equal(label(complete(bad)), "推理内容", String(bad) + " ⇒ 不发明时间");
    assert.equal(label({ text: text(""), status: "omitted", durationMs: bad }), "已思考（内容由平台省略）", String(bad) + "（省略态）");
  }
  // 坏入参不抛：null/undefined/串。
  assert.equal(label(null), "推理内容", "null ⇒ 默认态");
  assert.equal(label(undefined), "推理内容");
  assert.equal(label("junk"), "推理内容");
});

test("G2 可展开性（真实执行）：仅 complete 且正文非空才给开合；omitted/空正文/坏形不摆空展开器", () => {
  const foldable = Tr.reasoningFoldable as (reasoning: unknown) => boolean;
  const text = (value: string) => ({ text: value, truncated: false, redacted: false });
  assert.equal(foldable({ text: text("有内容"), status: "complete" }), true);
  assert.equal(foldable({ text: text(""), status: "complete" }), false, "零长正文（仅签名）不展开");
  assert.equal(foldable({ text: text(""), status: "omitted" }), false, "omitted 不假装有内容");
  assert.equal(foldable({ text: text("内容"), status: "omitted" }), false, "违规带正文的 omitted 亦不可展（如实优先）");
  assert.equal(foldable({ text: "raw-string", status: "complete" }), false, "非投影形不展");
  assert.equal(foldable({ text: { text: 42 }, status: "complete" }), false);
  assert.equal(foldable(null), false);
  assert.equal(foldable(undefined), false);
});

// —————————————————————— ② renderer.js 结构不变式 —— 档位 select 控件 ——————————————————————

test("G3 choices⇒select 控件：首项留空＝未设态；值域即选项；域外现值如实附选项；自由文本字段逐字现状", () => {
  assert.ok(RENDERER.includes('var choices = Array.isArray(f.choices) && f.choices.length > 0 ? f.choices : null;'), "choices 判定在场");
  assert.ok(RENDERER.includes('<option value="">留空（平台默认）</option>'), "首项留空＝未设态（保存空串＝清除）");
  // 值域即选项且转义（2026-10-19 本地化标签：`value` 仍逐字 raw choices，option 文本用 choiceLabels/回退 raw）。
  // 不逐字绑死旧单行实现：断言当前结构——choices.map(c,index) ⇒ option value=esc(String(c))、
  // 文本=esc(optionText)，且 optionText 的来源是「choiceLabels[index]（非空）否则 String(c)」。
  assert.ok(
    /choices\.map\(function \(c, index\) \{[\s\S]{0,260}?return '<option value="' \+ esc\(String\(c\)\) \+ '">' \+ esc\(optionText\) \+ "<\/option>";/.test(RENDERER),
    "值域逐项成选项（value=esc(raw choices)，文本=esc(optionText)）",
  );
  assert.ok(
    RENDERER.includes('var optionText = typeof choiceLabels[index] === "string" && choiceLabels[index] !== "" ? choiceLabels[index] : String(c);'),
    "选项文本优先 choiceLabels，缺标签回退 raw（本地化不改变提交值域）",
  );
  // 域外现值（手编坏值）如实显示为一条原值选项，不静默改写。
  assert.ok(RENDERER.includes('if (typeof f.value === "string" && f.value !== "" && choices.indexOf(f.value) < 0) opts.push'), "域外现值如实附选项");
  assert.ok(RENDERER.includes('<select id="pi-inp-'), "select 控件（复用 pi-input 盒形）");
  // 自由文本分支保留（choices 缺席/空 ⇒ 原 input 渲染）。
  assert.ok(RENDERER.includes('control = \'<input id="pi-inp-'), "自由文本字段逐字现状");
  // 机密字段不出选项（choices 字段均非机密）——结构上 select 分支不含 secret 掩码按钮。
  assert.ok(!RENDERER.slice(RENDERER.indexOf("if (choices)"), RENDERER.indexOf("if (choices)") + 400).includes("pi-toggle-secret"), "select 分支无机密按钮");
  assert.ok(STYLES.includes("select.pi-input { cursor: pointer; }"), "select 样式在位");
});

// —————————————————————— ③ renderer.js 结构不变式 —— 推理折叠行 ——————————————————————

test("G4 折叠行接线：实时/回放同解（同一 appendReasoningFromDetail）；默认折叠；esc 纯文本；独立成行不进工具组；诊断如实一行", () => {
  // 单一入口：实时（投影 event）与回放（row.reasoning）共用同一函数。
  assert.ok(RENDERER.includes('if (ev.detail && ev.detail.source === "reasoning") { appendReasoningFromDetail(pane, ev.detail, ev.turnId); return; }'), "实时路径接线");
  assert.ok(RENDERER.includes('if (row.reasoning && typeof row.reasoning === "object") { appendReasoningFromDetail(pane, { reasoning: row.reasoning }, row.turnId); return; }'), "回放路径接线（结构化字段，非摘要文本启发式）");
  assert.equal((RENDERER_CODE.match(/function appendReasoningFromDetail/g) ?? []).length, 1, "恰一份实现（同解而非双实现）");
  // 文案单点：renderer 只取用 Tr.reasoningLabel/reasoningFoldable，不另写文案。
  assert.ok(RENDERER.includes("Tr.reasoningLabel ? Tr.reasoningLabel(facts)"), "取用文案单点");
  assert.ok(RENDERER.includes("Tr.reasoningFoldable ? Tr.reasoningFoldable(facts) === true : false"), "取用可展开判据单点");
  assert.equal((RENDERER_CODE.match(/已思考/g) ?? []).length, 0, "renderer 正文不另写「已思考」文案（单点在 tool-rows）");
  // 默认折叠（含运行中——行到达即终形）：初始 open 只由手动态决定，无自动展开动作。
  assert.ok(RENDERER.includes("el.open = data.open === true; // 先 data 后 el"), "初始 open＝手动态（默认 false＝折叠）");
  assert.equal((RENDERER_CODE.match(/data\.open = true/g) ?? []).length, 0, "无任何自动置开动作（运行中亦折叠）");
  // esc 纯文本零丢失：label/text/flags 皆 esc；正文 pre-wrap。
  assert.ok(RENDERER.includes('esc(data.label)'), "label esc");
  assert.ok(RENDERER.includes('esc(data.text)'), "正文 esc（纯文本）");
  assert.ok(RENDERER.includes("esc(data.flags)"), "flags esc");
  assert.ok(STYLES.includes(".reasoning-record .reasoning-body { white-space: pre-wrap;"), "正文 pre-wrap（换行零丢失）");
  assert.ok(!RENDERER.includes("reasoning-body\").innerHTML = data.text"), "正文绝不经 innerHTML 原样注入");
  // 独立成行：kind "reasoning"（registerRow 既有「非 activities 行切断组」语义）——不进工具组。
  assert.ok(RENDERER.includes('{ kind: "reasoning", data:'), "行 kind=reasoning（组外独立行）");
  assert.ok(RENDERER.includes("registerRow(pane, function (record)"), "行走既有 registerRow 批尾落地");
  // 诊断形：如实一行（不假装内容），文案取 summary 常量。
  assert.ok(RENDERER.includes('ev.detail.source === "reasoning-diagnostic"'), "诊断分支在场");
  assert.ok(RENDERER.includes('String(ev.summary || "推理内容无法安全显示")'), "诊断文案（summary 常量回落）");
});

// —————————————————————— ④ 回放载体（真实驱动 getSessionHistory） ——————————————————————

function writeReplay(root: string, roleId: string, runtime: string, entries: unknown[]): void {
  const directory = path.join(root, ".ans", "sessions", roleId, runtime, "ans");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "replay.jsonl"), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

test("G5 回放载体：投影形逐字透传（幂等）；实时/回放形状同解；坏件/旧数据回落既有路径（不携带新字段）", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g5-g-"));
  try {
    const projectedReasoning = { text: { text: "先看调用点再改。", truncated: false, redacted: false }, status: "complete", durationMs: 5200 };
    writeReplay(root, "R-G", "claude", [
      { kind: "user", text: "问", at: "2026-10-16T01:00:00.000Z", turnId: "t1" },
      // ① 存量投影形（emit 后形状）：透传逐字。
      { kind: "event", at: "2026-10-16T01:00:01.000Z", turnId: "t1", event: { kind: "message", summary: "已思考", turnId: "t1", detail: { version: 1, source: "reasoning", reasoning: projectedReasoning, turnId: "t1" } } },
      // ② 原始事实形态（手编）：读取侧过投影单点后仍落回放载体。
      { kind: "event", at: "2026-10-16T01:00:02.000Z", turnId: "t2", event: { kind: "message", summary: "已思考", turnId: "t2", detail: { version: 1, source: "reasoning", reasoning: { text: "raw 正文", status: "omitted" }, turnId: "t2" } } },
      // ③ 坏件（source=reasoning 无载荷）⇒ 诊断形 ⇒ 不携带载体（回落）。
      { kind: "event", at: "2026-10-16T01:00:03.000Z", turnId: "t3", event: { kind: "message", summary: "已思考", turnId: "t3", detail: { version: 1, source: "reasoning", turnId: "t3" } } },
      // ④ 旧数据普通行（无该字段）⇒ 原行为逐字。
      { kind: "event", at: "2026-10-16T01:00:04.000Z", turnId: "t4", event: { kind: "message", summary: "普通回复", turnId: "t4", detail: { type: "assistant_delta" } } },
    ]);
    const history = await getSessionHistory({ projectRoot: root, roleId: "R-G", runtime: "claude" });
    assert.equal(history.error, null);
    const carried = history.rows.filter((row) => Object.hasOwn(row, "reasoning"));
    assert.equal(carried.length, 2, "恰两条行携带载体（投影形＋原始形经单点归一）");
    assert.deepEqual(carried[0]!.reasoning, projectedReasoning, "投影形逐字（幂等：形状不因回放改变）");
    assert.equal(carried[0]!.kind, "assistant");
    assert.equal(carried[0]!.text, "已思考", "其余行字段逐字（回放载体不吞摘要文本）");
    assert.equal(carried[0]!.turnId, "t1", "turnId 保留（渲染侧行身份）");
    assert.deepEqual(carried[1]!.reasoning, { text: { text: "", truncated: false, redacted: false }, status: "omitted" }, "原始违规省略态经单点归一（正文清空）");
    // ③④ 回落：无载体、文本行照旧。
    const fallbacks = history.rows.filter((row) => row.text === "已思考");
    assert.equal(fallbacks.length, 3, "载体两条＋坏件一条（坏件为纯文本行）");
    assert.equal(Object.hasOwn(fallbacks[2]!, "reasoning"), false, "坏件 ⇒ 不携带新字段（回落既有路径）");
    assert.equal(history.rows.at(-1)!.text, "普通回复");
    assert.equal(Object.hasOwn(history.rows.at(-1)!, "reasoning"), false, "旧数据普通行零影响");
    // 实时/回放同解（结构证据）：两路都只经 appendReasoningFromDetail（G4 已钉单实现）；载体形状＝投影冻结形。
    const live = { version: 1, source: "reasoning", reasoning: projectedReasoning };
    assert.deepEqual((live as { reasoning: unknown }).reasoning, carried[0]!.reasoning, "实时投影 detail.reasoning ≡ 回放载体（同形）");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// test/测试/g2-verify/u1-renderer.test.ts —— G-2 独立复验「U1 渲染侧」对抗域（纯映射行为＋源码精确钉）。
//
// 覆盖（独立构造）：
//   · tool-rows.js 归类（三前缀/扩充子类/不误伤矩阵）——与编排三前缀逐字节对齐（另见 contract-freeze）；
//   · ui-labels.js：queueSourceLabel("system")="系统"；recoveryActionView 三枚冻结枚举 + 未知 ⇒ null；
//   · 队列行撤回判据：canWithdraw 只认 message（system 行无撤回钮）；来源标签接线；
//   · 恢复卡（renderer.js/index.html/styles.css 源码钉）：恰 allow:true 才作为执行请求回传；
//     取消/Esc/关闭（×）一律 false；失效/通道异常如实终态「未获执行/fail-closed 不执行」绝不呈已执行；
//     **零计时器**（全文无 setTimeout/setInterval 调用）；取消为默认焦点；证据逐字 textContent；
//     Esc 优先答恢复卡（DOM 声明在 shell 卡之后）；
//   · system 消息行：is-system 类＋shield 图标＋标签（分类器单一来源）＋样式钩子存在。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const read = (rel: string): string => fs.readFileSync(path.join(REPO, rel), "utf8");

await import(new URL("../../../app/renderer/tool-rows.js", import.meta.url).href);
await import(new URL("../../../app/renderer/ui-labels.js", import.meta.url).href);
const ToolRows = (globalThis as unknown as { ANSToolRows: { classifyInjectedMessage(raw: unknown): { kind: string; label: string; sourceRoleId: string } | null } }).ANSToolRows;
const UiLabels = (globalThis as unknown as {
  ANSUiLabels: {
    queueSourceLabel(kind: string): string;
    recoveryActionView(action: string): { label: string; note: string } | null;
  };
}).ANSUiLabels;

test("U1：queueSourceLabel——system=「系统」（非角色）；既有三类不回归", () => {
  assert.equal(UiLabels.queueSourceLabel("system"), "系统", "system ⇒ 系统");
  assert.equal(UiLabels.queueSourceLabel("dispatch"), "su 派发");
  assert.equal(UiLabels.queueSourceLabel("message"), "客户消息");
  assert.equal(UiLabels.queueSourceLabel("handback"), "回交投递");
});

test("U1：recoveryActionView——恰三枚冻结枚举映射；未知动作 ⇒ null（只呈现原始 token，不编语义）", () => {
  const three = ["abort-turn", "rebuild-session", "redeliver"] as const;
  const seen = new Set<string>();
  for (const a of three) {
    const v = UiLabels.recoveryActionView(a);
    assert.ok(v, `${a} 应有映射`);
    assert.ok(v!.label.length > 0 && v!.note.length > 0, "标签与后果说明");
    seen.add(v!.label);
  }
  assert.equal(seen.size, 3, "三枚标签互异");
  for (const bad of ["disable-role", "abort", "restart", "", "ABORT-TURN"]) {
    assert.equal(UiLabels.recoveryActionView(bad), null, `未知动作 ${JSON.stringify(bad)} ⇒ null`);
  }
});

test("U1 恢复卡源码钉：恰 allow:true 才作为执行请求回传；取消/Esc/关闭均 false；默认焦点＝取消；零计时器", () => {
  const r = read("app/renderer/renderer.js");
  assert.ok(r.includes("d.recoveryConfirmRespond({ id: cur.id, allow: allow === true })"), "回传判据＝恰 allow === true");
  assert.ok(/\$\("rc-allow"\)\.addEventListener\("click", function \(\) \{ respondRecoveryConfirm\(true\); \}\)/.test(r), "「执行」按钮 ⇒ true");
  assert.ok(/\$\("rc-deny"\)\.addEventListener\("click", function \(\) \{ respondRecoveryConfirm\(false\); \}\)/.test(r), "「取消」⇒ false");
  assert.ok(/\$\("rc-close"\)\.addEventListener\("click", function \(\) \{ respondRecoveryConfirm\(false\); \}\)/.test(r), "关闭（×）⇒ false");
  assert.ok(r.includes('if (e.key === "Escape" && state.recoveryConfirm)'), "Esc ⇒ 先答恢复卡");
  assert.ok(/if \(e\.key === "Escape" && state\.recoveryConfirm\) \{\n\s*e\.preventDefault\(\);\n\s*respondRecoveryConfirm\(false\);/.test(r), "Esc ⇒ false（否决 = fail-closed 同向）");
  assert.ok(r.includes('$("rc-deny").focus(); // 取消为默认焦点'), "取消为默认焦点");
  assert.ok(r.includes('$("rc-evidence").textContent ='), "证据逐字进 textContent（无 HTML 注入口）");
  // 失效/通道异常的如实终态——绝不呈已执行
  assert.ok(r.includes("此确认已失效（应用重启或请求已结束），未获执行——请让提议方重新发起。"), "失效终态含「未获执行」");
  assert.ok(r.includes("未能回传你的决定（通道未接或异常）——按 fail-closed 不执行；请让提议方重新发起。"), "通道异常如实 fail-closed");
  assert.ok(!/rc-(allow|hint)[^\n]*已执行/.test(r), "恢复卡文案不得出现「已执行」正向断言");
  // 零计时器（裁定 4）：全文无 setTimeout/setInterval 调用（含注释命中 0 次调用）
  assert.ok(!/setTimeout\s*\(/.test(r), "renderer.js 无 setTimeout 调用");
  assert.ok(!/setInterval\s*\(/.test(r), "renderer.js 无 setInterval 调用");
  assert.ok(r.includes("等待不设限"), "「等待不设限」纪律在注释/实现处");
});

test("U1 系统消息行源码钉：is-system 类＋shield 图标＋标签分类器单一来源＋样式钩子；撤回判据只认 message", () => {
  const r = read("app/renderer/renderer.js");
  assert.ok(r.includes('el.className = "msg msg-injected is-" + inj.kind'), "is-system 类由归类 kind 派生");
  assert.ok(r.includes('inj.kind === "system" ? ICONS.shield'), "system 取 shield 图标（如实区分来源）");
  assert.ok(r.includes('inj.label + (inj.sourceRoleId ? " · 来自 " + inj.sourceRoleId : "")'), "来源恒空 ⇒ 无「来自 X」");
  assert.ok(r.includes("var canWithdraw = v.kind === \"message\" && !running;"), "撤回判据只认 message（system 无撤回钮）");
  const css = read("app/renderer/styles.css");
  assert.ok(css.includes(".msg-injected.is-system"), "行样式钩子存在");
  const html = read("app/renderer/index.html");
  const shellAt = html.indexOf('id="shell-confirm"');
  const recoveryAt = html.indexOf('id="recovery-confirm"');
  assert.ok(shellAt > 0 && recoveryAt > 0, "两确认卡均在（复用组件族）");
  assert.ok(shellAt < recoveryAt, "recovery 声明于 shell 之后（Esc 先答上层卡）");
  for (const id of ["rc-action", "rc-role", "rc-note", "rc-reason", "rc-evidence", "rc-by", "rc-at", "rc-item", "rc-details", "rc-allow", "rc-deny", "rc-close", "rc-hint"]) {
    assert.ok(html.includes(`id="${id}"`), `卡面元素 #${id} 在 markup 中`);
  }
  assert.ok(html.includes('id="rc-evidence"') && /<pre[^>]*id="rc-evidence"/.test(html), "证据为 <pre>（逐字、可滚）");
});

test("U1 归类与编排契约一致性（独立复核）：三真实前缀回放/回显均归 system；既有两类仍归原类", () => {
  const U00B7 = String.fromCharCode(0x00b7);
  for (const sub of ["看护", "收束", "恢复"]) {
    const direct = ToolRows.classifyInjectedMessage(`[系统${U00B7}${sub}] 正文`);
    assert.equal(direct?.kind, "system", `[系统·${sub}] ⇒ system`);
    assert.equal(direct?.label, `系统消息 · ${sub}`);
    assert.equal(direct?.sourceRoleId, "", "来源恒空");
    // 回放（replay）路径同分类器——同一输入同结果（纯函数）
    const replay = ToolRows.classifyInjectedMessage(`[系统${U00B7}${sub}] 正文`);
    assert.deepEqual(replay, direct, "同输入同结果（实时/回放单解）");
  }
  assert.equal(ToolRows.classifyInjectedMessage("[回交] 来自 X 的报告：…")?.kind, "handback");
  assert.equal(ToolRows.classifyInjectedMessage("[派发] 来自 su 的任务：…")?.kind, "dispatch");
});

// test/测试/g2-verify/u1-renderer.test.ts —— G-2 独立复验「U1 渲染侧」对抗域（纯映射行为＋源码精确钉）。
//
// 覆盖（独立构造）：
//   · tool-rows.js 归类（三前缀/扩充子类/不误伤矩阵）——与编排三前缀逐字节对齐（另见 contract-freeze）；
//   · ui-labels.js：queueSourceLabel("system")="系统"；recoveryActionView 三枚冻结枚举 + 未知 ⇒ null；
//   · 队列行撤回判据：canWithdraw 只认 message（system 行无撤回钮）；来源标签接线；
//   · 恢复卡（renderer.js/index.html/styles.css 源码钉）：恰 allow:true 才作为执行请求回传；
//     取消/Esc/关闭（×）一律 false；失效/通道异常如实终态「未获执行/fail-closed 不执行」绝不呈已执行；
//     **恢复卡零计时器**（唯一豁免＝2026-10-18 一次性开启警告的 9 秒自动收起，位置/数量/用途锁定）；取消为默认焦点；证据逐字 textContent；
//     Esc 优先答恢复卡（DOM 声明在 shell 卡之后）；
//   · system 消息行：is-system 类＋shield 图标＋标签（分类器单一来源）＋样式钩子存在；
//   · 系统通知行（2026-10-19）：`classifySystemNotice` 单一来源、`.sys sys-notice` 独立成行、
//     徽标/正文取自分类器结果；实时/回放同解；通知后的用户正文仍按普通消息另起一行。

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
const ToolRows = (globalThis as unknown as {
  ANSToolRows: {
    classifyInjectedMessage(raw: unknown): {
      kind: string;
      label: string;
      sourceRoleId: string;
      displayBody?: string;
      remainder?: string;
      body?: string;
    } | null;
  };
}).ANSToolRows;
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

test("U1 恢复卡源码钉：恰 allow:true 才作为执行请求回传；取消/Esc/关闭均 false；默认焦点＝取消；恢复卡零计时器（唯一豁免＝一次性开启警告自动收起）", () => {
  const r = read("app/renderer/renderer.js");
  assert.ok(r.includes("d.recoveryConfirmRespond({ id: cur.id, allow: allow === true })"), "回传判据＝恰 allow === true");
  assert.ok(/\$\("rc-allow"\)\.addEventListener\("click", function \(\) \{ respondRecoveryConfirm\(true\); \}\)/.test(r), "「执行」按钮 ⇒ true");
  assert.ok(/\$\("rc-deny"\)\.addEventListener\("click", function \(\) \{ respondRecoveryConfirm\(false\); \}\)/.test(r), "「取消」⇒ false");
  assert.ok(/\$\("rc-close"\)\.addEventListener\("click", function \(\) \{ respondRecoveryConfirm\(false\); \}\)/.test(r), "关闭（×）⇒ false");
  assert.ok(r.includes('if (e.key === "Escape" && state.recoveryConfirm)'), "Esc ⇒ 先答恢复卡");
  // 行尾兼容：Windows 工作树（core.autocrlf=true）下源文件为 CRLF——同一结构断言用 `\r?\n`，
  // 不放宽语义（仍要求「preventDefault → respondRecoveryConfirm(false)」紧邻）。
  assert.ok(/if \(e\.key === "Escape" && state\.recoveryConfirm\) \{\r?\n\s*e\.preventDefault\(\);\r?\n\s*respondRecoveryConfirm\(false\);/.test(r), "Esc ⇒ false（否决 = fail-closed 同向）");
  assert.ok(r.includes('$("rc-deny").focus(); // 取消为默认焦点'), "取消为默认焦点");
  assert.ok(r.includes('$("rc-evidence").textContent ='), "证据逐字进 textContent（无 HTML 注入口）");
  // 失效/通道异常的如实终态——绝不呈已执行
  assert.ok(r.includes("此确认已失效（应用重启或请求已结束），未获执行——请让提议方重新发起。"), "失效终态含「未获执行」");
  assert.ok(r.includes("未能回传你的决定（通道未接或异常）——按 fail-closed 不执行；请让提议方重新发起。"), "通道异常如实 fail-closed");
  assert.ok(!/rc-(allow|hint)[^\n]*已执行/.test(r), "恢复卡文案不得出现「已执行」正向断言");
  // 零计时器（裁定 4）：恢复卡本身无计时器；2026-10-18 客户批准**唯一豁免**——「替我审批中」
  // 一次性警告约 9 秒自动收起（客户 8–10 秒口径）。锁定「出现位置/数量/用途/时长来源」，不放开其他面：
  // 全文恰一个 setTimeout、位于 showShellJudgeWarning、回调仅 hideShellJudgeWarning、
  // 时长取自 ui-labels 单一来源且恰 9000ms；setInterval 仍为零；恢复卡切片零计时器。
  const timerCalls = r.match(/\bsetTimeout\s*\(/g) ?? [];
  assert.equal(timerCalls.length, 1, "renderer.js 恰有一个 setTimeout（仅一次性开启警告自动收起）");
  const warnStart = r.indexOf("function showShellJudgeWarning(");
  const warnEnd = r.indexOf("function syncShellJudgeWarning(");
  const timerAt = r.indexOf("setTimeout(function ()");
  assert.ok(warnStart >= 0 && warnEnd > warnStart, "找得到 showShellJudgeWarning 切片");
  assert.ok(timerAt > warnStart && timerAt < warnEnd, "唯一计时器必须位于 showShellJudgeWarning 内");
  const timerSlice = r.slice(timerAt, timerAt + 240);
  assert.ok(timerSlice.includes("hideShellJudgeWarning();"), "计时器到期只收起该警告");
  assert.ok(timerSlice.includes("UiLabels.SHELL_JUDGE_WARNING_AUTO_DISMISS_MS"), "时长经 ui-labels 单一来源（9 秒）");
  const labels = read("app/renderer/ui-labels.js");
  assert.ok(/SHELL_JUDGE_WARNING_AUTO_DISMISS_MS = 9000;/.test(labels), "自动收起时长钉死 9000ms（客户 8–10 秒口径）");
  assert.ok(r.includes("if (s.warningTimer) { clearTimeout(s.warningTimer); s.warningTimer = null; }"), "「知道了」/关闭时清除计时器");
  assert.ok(!/\bsetInterval\s*\(/.test(r), "renderer.js 无 setInterval 调用");
  assert.ok(
    !/setTimeout/.test(r.slice(r.indexOf("function renderRecoveryConfirm"), r.indexOf("function respondRecoveryConfirm"))),
    "恢复卡无计时器（等待不设限）",
  );
  assert.ok(r.includes("等待不设限"), "「等待不设限」纪律在注释/实现处");
});

test("U1 系统消息/系统通知行源码钉：分类器单一来源＋is-system/.sys-notice 行钩子＋shield 图标＋撤回判据只认 message", () => {
  const r = read("app/renderer/renderer.js");
  // 普通系统投递行（`[系统·<子类>]` 等）：行类由**分类器结果** kind 派生；system 取 shield 图标。
  assert.ok(r.includes('el.className = "msg msg-injected is-" + inj.kind'), "is-system 类由归类 kind 派生");
  assert.ok(r.includes('inj.kind === "system" ? ICONS.shield'), "system 取 shield 图标（如实区分来源）");
  // 标签/来源都取自分类器结果：来源名只在分类器给出 sourceRoleId 时呈现——
  // system / system-notice 的 sourceRoleId 恒空 ⇒ 不会出现「来自 X」；renderer 不另造来源。
  assert.ok(
    r.includes('var sourceName = inj.sourceRoleId ? (displayNameOf(roleById(inj.sourceRoleId)) || inj.sourceRoleId) : "";'),
    "来源名只认分类器的 sourceRoleId（空 ⇒ 无来源）",
  );
  assert.ok(
    r.includes('inj.label + (sourceName ? " · 来自 " + sourceName : "")'),
    "标签取自分类器 label；来源恒空 ⇒ 无「来自 X」",
  );
  // 系统通知（2026-10-19）：分类单一来源在 tool-rows.js::classifySystemNotice；实时/回放同解。
  const tr = read("app/renderer/tool-rows.js");
  assert.ok(tr.includes("function classifySystemNotice(body) {"), "系统通知分类器单一来源在 tool-rows.js");
  assert.ok(
    /var notice = classifySystemNotice\(body\);\r?\n\s*if \(notice\) return notice;/.test(tr),
    "classifyInjectedMessage 先走 classifySystemNotice（不复制第二份判据）",
  );
  assert.ok(tr.includes('label: sub ? "系统通知 · " + sub : "系统通知",'), "徽标文案由分类器构造（renderer 不另写）");
  assert.ok(r.includes('if (inj.kind === "system-notice") { appendSystemNotice(pane, inj, false); return; }'), "实时路径：system-notice 独立成行");
  assert.ok(r.includes('if (injRow && injRow.kind === "system-notice") {'), "回放路径：同一分类器结果独立成行（实时/回放同解）");
  assert.ok(r.includes('div.className = "sys sys-notice" + (isReplay ? " is-replay" : "");'), "系统通知行用 .sys sys-notice（绝不混进用户气泡）");
  assert.ok(r.includes(`'<span class="sys-ico">' + ICONS.shield + "</span>" +`), "系统通知取 shield 图标");
  assert.ok(
    r.includes(`'<span class="sys-notice-badge">' + esc(inj.label) + "</span>" +`),
    "徽标文案取分类器 label（esc）",
  );
  assert.ok(
    r.includes(`'<span class="sys-text">' + esc(inj.displayBody) + "</span>";`),
    "正文取分类器 displayBody（标记由徽标承载；esc）",
  );
  assert.ok(r.includes("if (inj.remainder) appendUser(pane, inj.remainder, false);"), "通知后的用户正文仍按普通消息另起一行");
  const css = read("app/renderer/styles.css");
  assert.ok(css.includes(".msg-injected.is-system"), "行样式钩子存在");
  assert.ok(css.includes(".sys-notice {"), "系统通知行样式钩子存在");
  assert.ok(css.includes(".sys-notice .sys-notice-badge {"), "系统通知徽标样式钩子存在");
  assert.ok(css.includes(".sys-notice .sys-text {"), "系统通知正文样式钩子存在");
  assert.ok(r.includes('var canWithdraw = v.kind === "message" && !running;'), "撤回判据只认 message（system/system-notice 无撤回钮）");
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

test("U1 系统通知分类（真实执行）：【系统通知】/【系统通知·<子类>】⇒ system-notice；正文/用户正文分离；近似文本不误伤", () => {
  // 单一来源的纯函数行为：标记闭合、子类有界；通知正文到首个空行为止，其后原样作为用户正文。
  const plain = ToolRows.classifyInjectedMessage("【系统通知】会话已因边界更新重建。");
  assert.ok(plain !== null, "【系统通知】必须归类");
  assert.equal(plain!.kind, "system-notice");
  assert.equal(plain!.label, "系统通知");
  assert.equal(plain!.sourceRoleId, "", "来源恒空（系统通知不是角色发言）");
  assert.equal(plain!.displayBody, "会话已因边界更新重建。", "displayBody 去掉标记");
  assert.equal(plain!.remainder, "", "无空行 ⇒ 无用户正文");

  const withSub = ToolRows.classifyInjectedMessage(
    "【系统通知·会话重建】此前经确认发行的写权不会自动保留。\n\n请继续修复失败用例。",
  );
  assert.ok(withSub !== null, "带子类的系统通知必须归类");
  assert.equal(withSub!.kind, "system-notice");
  assert.equal(withSub!.label, "系统通知 · 会话重建", "子类进入徽标（分类器单一来源）");
  assert.equal(withSub!.displayBody, "此前经确认发行的写权不会自动保留。", "通知正文到首个空行为止");
  assert.equal(withSub!.remainder, "请继续修复失败用例。", "空行后的用户正文原样保留（另起普通消息行）");
  assert.equal(withSub!.sourceRoleId, "");

  // 「看起来像」不算：行内提及 / 未闭合 / 子类为空 / 子类含标记字符 一律 null（不误伤普通气泡）。
  for (const bad of [
    "请阅读【系统通知】的说明。",
    "【系统通知·会话重建",
    "【系统通知·】正文",
    "【系统通知·会话【重建】正文",
  ]) {
    assert.equal(ToolRows.classifyInjectedMessage(bad), null, `近似文本不得归类：${JSON.stringify(bad)}`);
  }
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

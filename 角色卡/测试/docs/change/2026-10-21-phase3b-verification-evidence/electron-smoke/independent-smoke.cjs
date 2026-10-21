#!/usr/bin/env node
/**
 * 测试角色独立编写的 Phase 3B 离线 IPC 冒烟（不复用桌面UI 脚本）。
 * 覆盖：shell/su/恢复卡、judge 结果行与双开关、发送/停止/附件/队列/系统行。
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(__dirname, "ans-p3b-smoke-preload.cjs");
const NOJUDGE_PRELOAD = path.join(__dirname, "ans-p3b-nojudge-preload.cjs");
const OUT = "/tmp/ans-p3b-smoke-output";
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const report = { checks: [], console: [], didFail: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
}

async function openWindow(preload, journal) {
  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload },
  });
  win.webContents.on("console-message", (...args) => {
    const e = args[0];
    const level = e && typeof e === "object" && "level" in e ? e.level : args[1];
    const message = e && typeof e === "object" && "message" in e ? e.message : args[2];
    journal.push({ level, message });
    if (String(level) === "error") console.log("CONSOLE_ERROR " + message);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => report.didFail.push({ code, desc, url }));
  await win.loadFile(ENTRY);
  await sleep(400);
  return win;
}

async function main() {
  const win = await openWindow(PRELOAD, report.console);
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  async function waitFor(expr, timeout = 8000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((e) => String(e));
      if (last) return last;
      await sleep(50);
    }
    return last;
  }
  await waitFor(`!!document.querySelector('#root > .app-shell')`);
  const init = await js(`(async () => {
    await window.__ansRenderer.loadProject('/fixture3b');
    await window.__ansRenderer.selectRole('A');
    return { projectRoot: window.__ansRenderer.state.projectRoot, counts: window.__smoke3b.counts(), driver: typeof window.__ansRenderer, governanceModel: window.__ansRenderer.state.governanceModel };
  })()`);
  await sleep(300);
  check("BRIDGE_AND_SUBSCRIPTIONS", init.driver === "object" && init.projectRoot === "/fixture3b" && init.governanceModel === "trio" && init.counts.shellConfirm >= 1 && init.counts.recoveryConfirm >= 1 && init.counts.shellJudgeResult >= 1 && init.counts.operatorJudgeResult >= 1, init);

  // ---------- 双开关初始态 ----------
  const judgeInit = await js(`(() => ({
    approval: { checked: document.getElementById('auto-approve-toggle').checked, disabled: document.getElementById('auto-approve-toggle').disabled, label: document.getElementById('auto-approve-label').textContent },
    decision: { checked: document.getElementById('judge-decision-toggle').checked, disabled: document.getElementById('judge-decision-toggle').disabled, label: document.getElementById('judge-decision-label').textContent },
    warningHidden: document.getElementById('shell-judge-warning').hidden,
  }))()`);
  check("JUDGE_SWITCHES_INITIAL_OFF", judgeInit.approval.checked === false && judgeInit.approval.label === "替我审批" && judgeInit.approval.disabled === false && judgeInit.decision.checked === false && judgeInit.decision.label === "替我决策" && judgeInit.decision.disabled === false && judgeInit.warningHidden === true, judgeInit);

  // ---------- shell 确认卡 ----------
  const shellPayload = (id, extra = {}) => ({
    id, roleId: "A", runtime: "claude", projectRoot: "/fixture3b",
    command: "rm -rf build && echo '逐字 <&> 命令'", summary: "风险命令摘要",
    reasonPlain: "命中写盘规则", reasonRaw: "shell-risky", argvLines: ["[\"rm\",\"-rf\",\"build\"]"], cwd: "/fixture3b", ...extra,
  });
  await js(`window.__smoke3b.emitShellConfirm(${JSON.stringify(shellPayload("sc-1"))})`);
  await waitFor(`!document.getElementById('shell-confirm').hidden`);
  await sleep(150);
  const sc1 = await js(`(() => ({
    visible: !document.getElementById('shell-confirm').hidden,
    title: document.getElementById('sc-title').textContent,
    command: document.getElementById('sc-command').textContent,
    summary: document.getElementById('sc-summary').textContent,
    focus: document.activeElement && document.activeElement.id,
    stateId: window.__ansRenderer.state.shellConfirm && window.__ansRenderer.state.shellConfirm.id,
  }))()`);
  check("SHELL_CARD_VERBATIM_DENY_FOCUS", sc1.visible === true && sc1.title === "shell 命令请求" && sc1.command === "rm -rf build && echo '逐字 <&> 命令'" && sc1.focus === "sc-deny" && sc1.stateId === "sc-1", sc1);
  const esc = await js(`(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    return { hidden: document.getElementById('shell-confirm').hidden, calls: window.__smoke3b.calls().shellRespond };
  })()`);
  check("SHELL_ESC_ALLOW_FALSE", esc.hidden === true && esc.calls.length >= 1 && esc.calls[esc.calls.length - 1].id === "sc-1" && esc.calls[esc.calls.length - 1].allow === false, esc);
  const explicit = await js(`(async () => {
    window.__smoke3b.emitShellConfirm(${JSON.stringify(shellPayload("sc-2"))});
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('sc-allow').click();
    await new Promise(r => setTimeout(r, 300));
    const afterAllow = window.__smoke3b.calls().shellRespond.slice(-1)[0];
    const hiddenAfterAllow = document.getElementById('shell-confirm').hidden;
    window.__smoke3b.emitShellConfirm(${JSON.stringify(shellPayload("sc-3"))});
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('sc-deny').click();
    await new Promise(r => setTimeout(r, 300));
    const afterDeny = window.__smoke3b.calls().shellRespond.slice(-1)[0];
    return { afterAllow, hiddenAfterAllow, afterDeny, hiddenAfterDeny: document.getElementById('shell-confirm').hidden };
  })()`);
  check("SHELL_EXPLICIT_ALLOW_TRUE", explicit.afterAllow && explicit.afterAllow.id === "sc-2" && explicit.afterAllow.allow === true && explicit.hiddenAfterAllow === true, explicit.afterAllow);
  check("SHELL_EXPLICIT_DENY_FALSE", explicit.afterDeny && explicit.afterDeny.id === "sc-3" && explicit.afterDeny.allow === false && explicit.hiddenAfterDeny === true, explicit.afterDeny);
  const settled = await js(`(async () => {
    window.__smoke3b.emitShellConfirm(${JSON.stringify(shellPayload("sc-4"))});
    await new Promise(r => setTimeout(r, 200));
    const before = window.__smoke3b.calls().shellRespond.length;
    window.__smoke3b.emitEvent({ roleId: 'A', projectRoot: '/fixture3b', event: { kind: 'settled', turnId: 't-sc', summary: '本轮完成', detail: { outcome: 'completed' } } });
    await new Promise(r => setTimeout(r, 300));
    return { hidden: document.getElementById('shell-confirm').hidden, callsDelta: window.__smoke3b.calls().shellRespond.length - before };
  })()`);
  check("SHELL_SETTLED_CLOSES_WITHOUT_ANSWER", settled.hidden === true && settled.callsDelta === 0, settled);
  const expiry = await js(`(async () => {
    window.__smoke3b.emitShellConfirm(${JSON.stringify(shellPayload("sc-5"))});
    await new Promise(r => setTimeout(r, 200));
    const before = window.__smoke3b.calls().shellRespond.length;
    window.__smoke3b.emitOperatorExpired({ id: 'sc-5', reason: '确认已超时' });
    await new Promise(r => setTimeout(r, 300));
    return { hidden: document.getElementById('shell-confirm').hidden, hint: document.getElementById('composer-hint').textContent, callsDelta: window.__smoke3b.calls().shellRespond.length - before };
  })()`);
  check("SHELL_EXPIRY_CLOSES_HONEST", expiry.hidden === true && /确认已超时/.test(expiry.hint) && expiry.callsDelta === 0, expiry);
  const channelFail = await js(`(async () => {
    window.__smoke3b.setMode('shellRespond', 'fail');
    window.__smoke3b.emitShellConfirm(${JSON.stringify(shellPayload("sc-6"))});
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('sc-deny').click();
    await new Promise(r => setTimeout(r, 300));
    const out = { hidden: document.getElementById('shell-confirm').hidden, hint: document.getElementById('composer-hint').textContent };
    window.__smoke3b.setMode('shellRespond', 'ok');
    return out;
  })()`);
  check("SHELL_CHANNEL_FAIL_CLOSED", channelFail.hidden === true && /按 fail-closed 不放行/.test(channelFail.hint), channelFail);

  // ---------- su 三档 ----------
  const suTiers = await js(`(async () => {
    const out = [];
    for (const tier of ['risky', 'review', 'deny']) {
      window.__smoke3b.emitShellConfirm({ id: 'su-' + tier, roleId: 'verifier', runtime: 'claude', projectRoot: '/fixture3b', policy: 'su-approval', tier, command: 'node run.js', summary: '写入 ' + tier, reasonPlain: '命中审批规则', reasonRaw: 'tier:' + tier });
      await new Promise(r => setTimeout(r, 220));
      out.push({
        tier,
        title: document.getElementById('sc-title').textContent,
        summary: document.getElementById('sc-summary').textContent,
        reason: document.getElementById('sc-reason').textContent,
        hint: document.getElementById('sc-hint').textContent,
        focus: document.activeElement && document.activeElement.id,
        visible: !document.getElementById('shell-confirm').hidden,
      });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 200));
    }
    return out;
  })()`);
  const suOk = suTiers.every((t) => t.visible && t.title === "命令审批 · Proof / 验收" && t.focus === "sc-deny" && /命中原因：tier:/.test(t.reason) && /绕过 ANS 文件写边界/.test(t.hint));
  const tierLabels = { risky: "风险命令（risky）", review: "未自动判定（review）", deny: "硬拒类（deny）" };
  check("SU_TIERS_TITLE_REASON_WARNING", suOk && suTiers.every((t) => t.summary.includes(tierLabels[t.tier])), suTiers);

  // ---------- 恢复卡 ----------
  const recoveryPayload = (id) => ({
    id, roleId: "A", runtime: "claude", projectRoot: "/fixture3b", action: "rebuild-session",
    evidence: "证据逐字 <&> 保留", reason: "恢复原因 X", requestedBy: "Convener", requestedAt: "2026-10-21T03:00:00.000Z", itemId: "item-7",
  });
  const rc1 = await js(`(async () => {
    window.__smoke3b.emitRecoveryConfirm(${JSON.stringify(recoveryPayload("rc-1"))});
    await new Promise(r => setTimeout(r, 250));
    const out = {
      visible: !document.getElementById('recovery-confirm').hidden,
      action: document.getElementById('rc-action').textContent,
      note: document.getElementById('rc-note').textContent,
      role: document.getElementById('rc-role').textContent,
      reason: document.getElementById('rc-reason').textContent,
      evidence: document.getElementById('rc-evidence').textContent,
      focus: document.activeElement && document.activeElement.id,
    };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    out.hiddenAfterEsc = document.getElementById('recovery-confirm').hidden;
    out.calls = window.__smoke3b.calls().recoveryRespond;
    return out;
  })()`);
  check("RECOVERY_CARD_VERBATIM_CANCEL_FOCUS", rc1.visible === true && /重建会话/.test(rc1.action) && /保留 ANS 回放/.test(rc1.note) && /A/.test(rc1.role) && /恢复原因 X/.test(rc1.reason) && rc1.evidence === "证据逐字 <&> 保留" && rc1.focus === "rc-deny" && rc1.hiddenAfterEsc === true && rc1.calls.slice(-1)[0].allow === false && rc1.calls.slice(-1)[0].id === "rc-1", rc1);
  const rcAllow = await js(`(async () => {
    window.__smoke3b.emitRecoveryConfirm(${JSON.stringify(recoveryPayload("rc-2"))});
    await new Promise(r => setTimeout(r, 250));
    document.getElementById('rc-allow').click();
    await new Promise(r => setTimeout(r, 300));
    return { hidden: document.getElementById('recovery-confirm').hidden, last: window.__smoke3b.calls().recoveryRespond.slice(-1)[0] };
  })()`);
  check("RECOVERY_EXPLICIT_EXECUTE_TRUE", rcAllow.hidden === true && rcAllow.last.id === "rc-2" && rcAllow.last.allow === true, rcAllow);
  const rcExpired = await js(`(async () => {
    window.__smoke3b.setMode('recoveryRespond', 'expired');
    window.__smoke3b.emitRecoveryConfirm(${JSON.stringify(recoveryPayload("rc-3"))});
    await new Promise(r => setTimeout(r, 250));
    document.getElementById('rc-allow').click();
    await new Promise(r => setTimeout(r, 350));
    const out = {
      visible: !document.getElementById('recovery-confirm').hidden,
      allowDisabled: document.getElementById('rc-allow').disabled,
      denyDisabled: document.getElementById('rc-deny').disabled,
      hint: document.getElementById('rc-hint').textContent,
    };
    document.getElementById('rc-close').click();
    await new Promise(r => setTimeout(r, 250));
    out.dismissed = document.getElementById('recovery-confirm').hidden;
    window.__smoke3b.setMode('recoveryRespond', 'ok');
    return out;
  })()`);
  check("RECOVERY_EXPIRED_STAYS_DISABLED_HONEST", rcExpired.visible === true && rcExpired.allowDisabled === true && rcExpired.denyDisabled === true && /未获执行|按 fail-closed 不执行/.test(rcExpired.hint) && rcExpired.dismissed === true, rcExpired);
  const rcChannel = await js(`(async () => {
    window.__smoke3b.setMode('recoveryRespond', 'fail');
    window.__smoke3b.emitRecoveryConfirm(${JSON.stringify(recoveryPayload("rc-4"))});
    await new Promise(r => setTimeout(r, 250));
    document.getElementById('rc-allow').click();
    await new Promise(r => setTimeout(r, 350));
    const out = { visible: !document.getElementById('recovery-confirm').hidden, hint: document.getElementById('rc-hint').textContent, allowDisabled: document.getElementById('rc-allow').disabled };
    document.getElementById('rc-close').click();
    await new Promise(r => setTimeout(r, 200));
    out.dismissed = document.getElementById('recovery-confirm').hidden;
    window.__smoke3b.setMode('recoveryRespond', 'ok');
    return out;
  })()`);
  check("RECOVERY_CHANNEL_FAIL_CLOSED", rcChannel.visible === true && rcChannel.allowDisabled === true && /按 fail-closed 不执行/.test(rcChannel.hint) && rcChannel.dismissed === true, rcChannel);

  // ---------- judge 结果行 ----------
  const judgeRows = await js(`(async () => {
    window.__smoke3b.emitEvent({ roleId: 'A', projectRoot: '/fixture3b', event: { kind: 'tool_call', turnId: 't-j', summary: 'run_shell：node -v', detail: { toolCallId: 'call-j1', toolName: 'run_shell', target: 'node -v', phase: 'start', status: 'call' } } });
    await new Promise(r => setTimeout(r, 150));
    window.__smoke3b.emitShellJudgeResult({ id: 'jr-1', roleId: 'A', runtime: 'claude', projectRoot: '/fixture3b', verdict: 'allow', engine: 'claude', summary: 'node -v', tier: 'risky', toolCallId: 'call-j1', at: '2026-10-21T04:00:00.000Z' });
    await new Promise(r => setTimeout(r, 250));
    const allowRow = document.querySelector('#chat .shell-judge-row[data-tool-call-id="call-j1"]');
    const beforeDeny = document.querySelectorAll('#chat .shell-judge-row').length;
    window.__smoke3b.emitShellJudgeResult({ id: 'jr-2', roleId: 'A', runtime: 'claude', projectRoot: '/fixture3b', verdict: 'deny', engine: 'claude', reason: '系统风险', customerMessage: '请调整命令', toolCallId: 'call-j2' });
    await new Promise(r => setTimeout(r, 250));
    const beforeManual = document.querySelectorAll('#chat .shell-judge-row').length;
    window.__smoke3b.emitShellJudgeResult({ id: 'jr-3', roleId: 'A', runtime: 'claude', projectRoot: '/fixture3b', verdict: 'manual', engine: 'claude', reason: '读取失败', toolCallId: 'call-j3' });
    await new Promise(r => setTimeout(r, 250));
    const beforeDup = document.querySelectorAll('#chat .shell-judge-row').length;
    window.__smoke3b.emitShellJudgeResult({ id: 'jr-1', roleId: 'A', runtime: 'claude', projectRoot: '/fixture3b', verdict: 'allow', engine: 'claude', summary: 'node -v', tier: 'risky', toolCallId: 'call-j1' });
    await new Promise(r => setTimeout(r, 200));
    window.__smoke3b.emitOperatorJudgeResult({ id: 'gj-1', roleId: 'A', runtime: 'claude', projectRoot: '/fixture3b', group: 'approval', cardKind: 'write', engine: 'claude', flowId: 'flow-9', paths: ['docs/a.md'], selected: [], reason: '路径在边界内', toolCallId: 'call-j1', requestId: 'req-1' });
    await new Promise(r => setTimeout(r, 250));
    const denyRow = [...document.querySelectorAll('#chat .shell-judge-row.is-deny')].at(-1);
    const govRow = document.querySelector('#chat .shell-judge-row.governance-judge-row');
    return {
      allowText: allowRow && allowRow.textContent,
      allowClass: allowRow && allowRow.className,
      denyText: denyRow && denyRow.textContent,
      denyClass: denyRow && denyRow.className,
      countAfterDeny: beforeDeny,
      countAfterManual: beforeManual,
      countAfterDup: beforeDup,
      govText: govRow && govRow.textContent,
      govToolCall: govRow && govRow.getAttribute('data-tool-call-id'),
    };
  })()`);
  check("JUDGE_ALLOW_ROW_ANCHORED", judgeRows.allowText && /已替你放行（判断 agent · 代审批）/.test(judgeRows.allowText) && /判断引擎：Claude/.test(judgeRows.allowText) && /operator:judge:claude/.test(judgeRows.allowText), judgeRows.allowText && judgeRows.allowText.slice(0, 160));
  check("JUDGE_DENY_ROW_AND_MANUAL_NO_ROW", judgeRows.denyText && /未放行（判断 agent · 代审批）/.test(judgeRows.denyText) && /判断理由：系统风险/.test(judgeRows.denyText) && /可关闭「替我审批」后重试/.test(judgeRows.denyText) && judgeRows.countAfterManual === judgeRows.countAfterDeny + 1 && judgeRows.countAfterDup === judgeRows.countAfterManual, { deny: judgeRows.denyText && judgeRows.denyText.slice(0, 120), afterDeny: judgeRows.countAfterDeny, afterManual: judgeRows.countAfterManual, afterDup: judgeRows.countAfterDup });
  check("JUDGE_GOVERNANCE_ROW", judgeRows.govText && /judge 代批 · 代审批/.test(judgeRows.govText) && /确认写入 1 个路径（docs\/a.md）/.test(judgeRows.govText) && /流程：flow-9/.test(judgeRows.govText) && judgeRows.govToolCall === "call-j1", judgeRows.govText && judgeRows.govText.slice(0, 160));

  // ---------- 双开关开启/警告 ----------
  const switches = await js(`(async () => {
    window.__smoke3b.clearCalls();
    document.getElementById('auto-approve-toggle').click();
    await new Promise(r => setTimeout(r, 300));
    const afterOn = {
      checked: document.getElementById('auto-approve-toggle').checked,
      label: document.getElementById('auto-approve-label').textContent,
      warningHidden: document.getElementById('shell-judge-warning').hidden,
      warningText: document.getElementById('shell-judge-warning-text').textContent,
      setCalls: window.__smoke3b.calls().shellJudgeSet,
    };
    document.getElementById('shell-judge-warning-close').click();
    await new Promise(r => setTimeout(r, 150));
    const afterAck = { hidden: document.getElementById('shell-judge-warning').hidden };
    window.__smoke3b.emitShellJudgeState({ version: 1, enabled: true, available: true });
    await new Promise(r => setTimeout(r, 200));
    const afterRepush = { hidden: document.getElementById('shell-judge-warning').hidden };
    document.getElementById('judge-decision-toggle').click();
    await new Promise(r => setTimeout(r, 300));
    const decision = {
      checked: document.getElementById('judge-decision-toggle').checked,
      label: document.getElementById('judge-decision-label').textContent,
      setCalls: window.__smoke3b.calls().decisionJudgeSet,
      warningHidden: document.getElementById('shell-judge-warning').hidden,
      warningText: document.getElementById('shell-judge-warning-text').textContent,
    };
    return { afterOn, afterAck, afterRepush, decision };
  })()`);
  check("JUDGE_APPROVAL_TURN_ON_WARNING_ONCE", switches.afterOn.checked === true && switches.afterOn.label === "替我审批中 · 判断 agent" && switches.afterOn.warningHidden === false && /替我审批中：shell 命令与写盘\/写卡确认/.test(switches.afterOn.warningText) && switches.afterOn.setCalls.slice(-1)[0] === true && switches.afterAck.hidden === true && switches.afterRepush.hidden === true, switches);
  check("JUDGE_DECISION_TURN_ON_WARNING", switches.decision.checked === true && switches.decision.label === "替我决策中 · 判断 agent" && switches.decision.setCalls.slice(-1)[0] === true && switches.decision.warningHidden === false && /替我决策中：提案接受、任命、验收/.test(switches.decision.warningText), switches.decision);

  // ---------- 发送三态 + ack/失败 ----------
  const sendFlows = await js(`(async () => {
    const inp = document.getElementById('inp-message');
    const setValue = (v) => { const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
    const enter = () => inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    window.__smoke3b.clearCalls();
    setValue('正常发送');
    await new Promise(r => setTimeout(r, 60));
    enter();
    await new Promise(r => setTimeout(r, 400));
    const okCall = window.__smoke3b.calls().send.slice(-1)[0];
    const ok = { args: okCall, text: inp.value, userBubble: [...document.querySelectorAll('#chat .msg-user')].some(m => m.textContent.includes('正常发送')) };
    window.__smoke3b.setMode('send', 'queued');
    setValue('入队消息');
    await new Promise(r => setTimeout(r, 60));
    enter();
    await new Promise(r => setTimeout(r, 400));
    const queued = { sys: [...document.querySelectorAll('#chat .sys-queue')].map(x => x.textContent).join(' | ') };
    window.__smoke3b.setMode('send', 'reject');
    setValue('保留草稿');
    await new Promise(r => setTimeout(r, 60));
    enter();
    await new Promise(r => setTimeout(r, 400));
    const reject = { text: inp.value, hint: document.getElementById('composer-hint').textContent, sys: [...document.querySelectorAll('#chat .sys-call')].map(x => x.textContent).join(' | '), accepted: window.__ansRenderer.state.roleMeta['A'] && window.__ansRenderer.state.roleMeta['A'].error };
    const sysBeforeAccepted = document.querySelectorAll('#chat .sys-call').length;
    window.__smoke3b.setMode('send', 'accepted-failed');
    setValue('已接受后失败');
    await new Promise(r => setTimeout(r, 60));
    enter();
    await new Promise(r => setTimeout(r, 400));
    const acceptedFail = { text: inp.value, hint: document.getElementById('composer-hint').textContent, sysDelta: document.querySelectorAll('#chat .sys-call').length - sysBeforeAccepted, error: window.__ansRenderer.state.roleMeta['A'] && window.__ansRenderer.state.roleMeta['A'].error };
    window.__smoke3b.setMode('send', 'ok');
    return { ok, queued, reject, acceptedFail };
  })()`);
  check("SEND_ACK_TARGET_AND_CLIENT_ID", sendFlows.ok.args && sendFlows.ok.args[0] === "正常发送" && Array.isArray(sendFlows.ok.args[1]) && sendFlows.ok.args[1].length === 0 && sendFlows.ok.args[2].projectRoot === "/fixture3b" && sendFlows.ok.args[2].roleId === "A" && sendFlows.ok.args[2].runtime === "claude" && sendFlows.ok.args[3] && typeof sendFlows.ok.args[3].clientMessageId === "string" && sendFlows.ok.text === "" && sendFlows.ok.userBubble === true, { args: sendFlows.ok.args, text: sendFlows.ok.text });
  check("SEND_QUEUED_POSITION", /已入队：等它完成当前任务后处理（第 2 位）/.test(sendFlows.queued.sys), sendFlows.queued.sys);
  check("SEND_REJECT_RESTORES_DRAFT", sendFlows.reject.text === "保留草稿" && /发送失败：测试拒绝/.test(sendFlows.reject.hint) && /发送失败：测试拒绝/.test(sendFlows.reject.sys) && sendFlows.reject.accepted === true, sendFlows.reject);
  check("SEND_ACCEPTED_FAILURE_NO_FALSE_FAILURE", sendFlows.acceptedFail.text === "" && !/发送失败/.test(sendFlows.acceptedFail.hint) && sendFlows.acceptedFail.sysDelta === 0 && sendFlows.acceptedFail.error === true, sendFlows.acceptedFail);

  // ---------- 角色草稿 ----------
  const drafts = await js(`(async () => {
    const inp = document.getElementById('inp-message');
    const setValue = (v) => { const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
    setValue('A 草稿');
    await new Promise(r => setTimeout(r, 80));
    await window.__ansRenderer.selectRole('B');
    await new Promise(r => setTimeout(r, 300));
    const atB = inp.value;
    setValue('B 草稿');
    await new Promise(r => setTimeout(r, 80));
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 300));
    const backA = inp.value;
    await window.__ansRenderer.selectRole('B');
    await new Promise(r => setTimeout(r, 300));
    const backB = inp.value;
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 300));
    const finalA = inp.value;
    return { atB, backA, backB, finalA };
  })()`);
  check("DRAFT_PER_ROLE", drafts.atB === "" && drafts.backA === "A 草稿" && drafts.backB === "B 草稿" && drafts.finalA === "A 草稿", drafts);

  // ---------- 停止 ----------
  const halt = await js(`(async () => {
    const btn = document.getElementById('btn-halt');
    const hiddenBefore = btn.hidden;
    window.__smoke3b.emitRoleState({ roleId: 'A', projectRoot: '/fixture3b', runtime: 'claude', busy: true, queue: [], running: null });
    await new Promise(r => setTimeout(r, 250));
    const visibleBusy = btn.hidden === false;
    window.__smoke3b.clearCalls();
    btn.click();
    await new Promise(r => setTimeout(r, 350));
    const okCall = window.__smoke3b.calls().abort.slice(-1)[0];
    const okText = [...document.querySelectorAll('#chat .sys-call')].map(x => x.textContent).join(' | ');
    window.__smoke3b.setMode('abort', 'unsupported');
    btn.click();
    await new Promise(r => setTimeout(r, 350));
    const unsupported = [...document.querySelectorAll('#chat .sys-call')].map(x => x.textContent).join(' | ');
    window.__smoke3b.setMode('abort', 'fail');
    btn.click();
    await new Promise(r => setTimeout(r, 350));
    const failed = [...document.querySelectorAll('#chat .sys-call')].map(x => x.textContent).join(' | ');
    window.__smoke3b.setMode('abort', 'ok');
    window.__smoke3b.emitRoleState({ roleId: 'A', projectRoot: '/fixture3b', runtime: 'claude', busy: false, queue: [], running: null });
    await new Promise(r => setTimeout(r, 250));
    return { hiddenBefore, visibleBusy, okCall, okText, unsupported, failed, hiddenIdle: btn.hidden };
  })()`);
  check("HALT_VISIBILITY_BY_BUSY", halt.hiddenBefore === true && halt.visibleBusy === true && halt.hiddenIdle === true, { hiddenBefore: halt.hiddenBefore, visibleBusy: halt.visibleBusy, hiddenIdle: halt.hiddenIdle });
  check("HALT_ABORT_EXACT_TARGET", halt.okCall && halt.okCall.projectRoot === "/fixture3b" && halt.okCall.roleId === "A" && halt.okCall.runtime === "claude" && /已请求停止当前轮次——轮次仍会以收尾事件结束。/.test(halt.okText), halt.okCall);
  check("HALT_UNSUPPORTED_AND_FAIL_HONEST", /当前运行时不支持停止。/.test(halt.unsupported) && /停止失败：停止失败原因/.test(halt.failed), { unsupported: halt.unsupported.slice(-80), failed: halt.failed.slice(-80) });

  // ---------- 附件：选图 / 粘贴 / 拖入 / 移除 ----------
  const attach = await js(`(async () => {
    const inp = document.getElementById('inp-message');
    window.__smoke3b.clearCalls();
    document.getElementById('btn-attach-image').click();
    await new Promise(r => setTimeout(r, 350));
    const picked = {
      chips: document.querySelectorAll('#attach-row .attach-chip').length,
      imgSrc: (document.querySelector('#attach-row .attach-chip img') || {}).src || "",
      title: (document.querySelector('#attach-row .attach-chip') || {}).title || "",
      rowHidden: document.getElementById('attach-row').hidden,
    };
    // 粘贴
    const bytes = Uint8Array.from(atob("${PNG_B64}"), c => c.charCodeAt(0));
    const file = new File([bytes], "paste.png", { type: "image/png" });
    const dt = new DataTransfer(); dt.items.add(file);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { get: () => dt });
    inp.dispatchEvent(pasteEvent);
    await new Promise(r => setTimeout(r, 400));
    const pasted = {
      chips: document.querySelectorAll('#attach-row .attach-chip').length,
      attachCalls: window.__smoke3b.calls().attachImage.length,
      lastName: [...window.__smoke3b.calls().attachImage].slice(-1)[0] && window.__smoke3b.calls().attachImage.slice(-1)[0].name,
    };
    // 拖入
    const file2 = new File([bytes], "drop.png", { type: "image/png" });
    const dt2 = new DataTransfer(); dt2.items.add(file2);
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { get: () => dt2 });
    document.getElementById('composer-capsule').dispatchEvent(dropEvent);
    await new Promise(r => setTimeout(r, 400));
    const dropped = { chips: document.querySelectorAll('#attach-row .attach-chip').length, attachCalls: window.__smoke3b.calls().attachImage.length };
    // 移除最后一个
    const rm = [...document.querySelectorAll('#attach-row .attach-rm')].at(-1);
    if (rm) rm.click();
    await new Promise(r => setTimeout(r, 200));
    const afterRemove = { chips: document.querySelectorAll('#attach-row .attach-chip').length };
    return { picked, pasted, dropped, afterRemove };
  })()`);
  check("ATTACH_PICK_THUMBNAIL_DATA_URL", attach.picked.chips === 1 && attach.picked.imgSrc.startsWith("data:image/") && attach.picked.rowHidden === false && /picked\.png/.test(attach.picked.title), attach.picked);
  check("ATTACH_PASTE_AND_DROP", attach.pasted.chips === 2 && attach.pasted.attachCalls >= 1 && attach.pasted.lastName === "paste.png" && attach.dropped.chips === 3 && attach.dropped.attachCalls >= 2, attach);
  check("ATTACH_REMOVE", attach.afterRemove.chips === 2, attach.afterRemove);

  // ---------- 队列位次 / 撤回 ----------
  const queue = await js(`(async () => {
    window.__smoke3b.emitRoleState({ roleId: 'A', projectRoot: '/fixture3b', runtime: 'claude', busy: true,
      running: { id: 'run-1', summary: '正在执行的任务', kind: 'message', sourceRoleId: 'B' },
      queue: [ { id: 'q-1', summary: '第一条排队消息', kind: 'message' }, { id: 'q-2', summary: '系统排队项', kind: 'system' } ] });
    await new Promise(r => setTimeout(r, 350));
    const rows = [...document.querySelectorAll('#chat .queue-row')].map(r => ({ text: r.textContent.replace(/\s+/g, ' ').trim(), hasWithdraw: !!r.querySelector('.queue-withdraw'), qid: r.getAttribute('data-queue-id') }));
    window.__smoke3b.clearCalls();
    const btn = document.querySelector('#chat .queue-withdraw[data-id="q-1"]');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 350));
    const success = { call: window.__smoke3b.calls().withdraw.slice(-1)[0], feedback: [...document.querySelectorAll('#chat .queue-feedback')].map(x => x.textContent).join(' | ') };
    window.__smoke3b.setMode('withdraw', 'fail');
    const btn2 = document.querySelector('#chat .queue-withdraw[data-id="q-1"]');
    if (btn2) btn2.click();
    await new Promise(r => setTimeout(r, 350));
    const failure = { feedback: [...document.querySelectorAll('#chat .queue-feedback')].map(x => x.textContent).join(' | '), sys: [...document.querySelectorAll('#chat .sys-call')].map(x => x.textContent).join(' | ') };
    window.__smoke3b.setMode('withdraw', 'ok');
    window.__smoke3b.emitRoleState({ roleId: 'A', projectRoot: '/fixture3b', runtime: 'claude', busy: false, queue: [], running: null });
    await new Promise(r => setTimeout(r, 250));
    return { rows, success, failure };
  })()`);
  check("QUEUE_POSITIONS_AND_WITHDRAW_GATING", queue.rows.length === 3 && /进行中/.test(queue.rows[0].text) && queue.rows[0].hasWithdraw === false && /第 1 位/.test(queue.rows[1].text) && /第一条排队消息/.test(queue.rows[1].text) && queue.rows[1].hasWithdraw === true && /第 2 位/.test(queue.rows[2].text) && queue.rows[2].hasWithdraw === false, queue.rows);
  check("QUEUE_WITHDRAW_INLINE_RECEIPT", queue.success.call && queue.success.call[1] === "q-1" && queue.success.call[0].roleId === "A" && /已撤回排队消息：被撤回的排队消息/.test(queue.success.feedback) && /撤回无效：消息已投递/.test(queue.failure.feedback) && /撤回无效：消息已投递/.test(queue.failure.sys), queue.success);

  // ---------- system 行 ----------
  const systemRows = await js(`(async () => {
    window.__smoke3b.emitEvent({ roleId: 'A', projectRoot: '/fixture3b', event: { kind: 'message', summary: '用户指令：[系统·看护] 巡检开始', detail: { source: 'prompt-input', text: '用户指令：[系统·看护] 巡检开始' } } });
    await new Promise(r => setTimeout(r, 250));
    const sys = document.querySelector('#chat .msg-injected.is-system');
    return { exists: !!sys, chip: sys && (sys.querySelector('.mi-chip') || {}).textContent, body: sys && sys.textContent };
  })()`);
  check("SYSTEM_ALERT_ROW", systemRows.exists === true && /系统消息 · 看护/.test(systemRows.chip) && /巡检开始/.test(systemRows.body) && !/用户指令：/.test(systemRows.body), systemRows);

  // ---------- single 项目禁用代决策 ----------
  const single = await js(`(async () => {
    await window.__ansRenderer.loadProject('/single');
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 350));
    const toggle = document.getElementById('judge-decision-toggle');
    const status = document.getElementById('judge-decision-status');
    return { governanceModel: window.__ansRenderer.state.governanceModel, disabled: toggle.disabled, checked: toggle.checked, note: status.textContent, noteHidden: status.hidden };
  })()`);
  check("JUDGE_DECISION_SINGLE_DISABLED", single.governanceModel === "single" && single.disabled === true && single.checked === false && /旧治理模型（single）不支持代决策/.test(single.note) && single.noteHidden === false, single);

  // ---------- console/CSP ----------
  const csp = await js(`(window.__ansCspViolations || [])`);
  const errors = report.console.filter((m) => String(m.level) === "error" || m.level === 3);
  check("NO_CSP_VIOLATIONS", Array.isArray(csp) && csp.length === 0, csp.length);
  check("NO_CONSOLE_ERRORS", errors.length === 0, errors);
  check("NO_DID_FAIL_LOAD", report.didFail.length === 0);

  try {
    const img = await wc.capturePage();
    if (!img.isEmpty()) {
      const p = path.join(OUT, "phase3b.png");
      fs.writeFileSync(p, img.toPNG());
      report.screenshot = { path: p, bytes: fs.statSync(p).size };
      check("SCREENSHOT", true, report.screenshot);
    } else check("SCREENSHOT", false, "empty");
  } catch (e) { check("SCREENSHOT", false, String(e)); }
  // ---------- 桥缺失变体：双开关禁用（在主窗口销毁前创建，避免会话关闭竞态） ----------
  const win2 = await openWindow(NOJUDGE_PRELOAD, report.console);
  const wc2 = win2.webContents;
  const js2 = (code) => wc2.executeJavaScript(code, true);
  await js2(`(async () => { await window.__ansRenderer.loadProject('/fixture3b'); await window.__ansRenderer.selectRole('A'); })()`);
  await sleep(400);
  const noJudge = await js2(`(() => ({
    approval: { disabled: document.getElementById('auto-approve-toggle').disabled, label: document.getElementById('auto-approve-label').textContent, status: document.getElementById('auto-approve-status').textContent, statusHidden: document.getElementById('auto-approve-status').hidden },
    decision: { disabled: document.getElementById('judge-decision-toggle').disabled, label: document.getElementById('judge-decision-label').textContent, status: document.getElementById('judge-decision-status').textContent, statusHidden: document.getElementById('judge-decision-status').hidden },
  }))()`);
  check("JUDGE_BRIDGE_MISSING_DISABLED", noJudge.approval.disabled === true && noJudge.approval.label === "当前版本不支持自动判断，保持手动" && noJudge.decision.disabled === true && noJudge.decision.label === "当前版本不支持自动判断，保持手动", noJudge);
  win2.destroy();
  win.destroy();

  const failures = report.checks.filter((c) => !c.value);
  report.summary = { total: report.checks.length, passed: report.checks.length - failures.length, failed: failures.length };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("SMOKE_SUMMARY " + JSON.stringify(report.summary));
  console.log(failures.length === 0 ? "SMOKE_DONE=1" : "SMOKE_DONE=0");
  app.exit(failures.length === 0 ? 0 : 1);
}

app.whenReady().then(main).catch((err) => {
  console.error("SMOKE_FATAL", (err && err.stack) || err);
  try { fs.writeFileSync(path.join(OUT, "fatal.txt"), String((err && err.stack) || err)); } catch {}
  app.exit(2);
});

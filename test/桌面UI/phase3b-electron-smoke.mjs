#!/usr/bin/env node
/**
 * test/桌面UI/phase3b-electron-smoke.mjs
 *
 * Phase 3B 真实 Electron 离线 IPC 替身冒烟：
 *  - 卡族 fail-closed：shell 命令逐字/拒绝默认焦点/Esc=不放行/显式放行/settled 收起/失效回执收起；
 *  - su 审批档位（risky/review/deny）与绕过写边界警告；
 *  - judge manual 回落（原卡 + judgeNotice 逐字）；
 *  - 双开关：禁用/开启/一次性警告/重复推送不重现/单模型禁用；
 *  - 发送 ack/失败（clientMessageId、拒发恢复草稿）、停止本轮三态；
 *  - 图片选/粘/拖/缩略图/移除；队列位次与撤回就地回执；系统行；
 *  - 判断结果行（shell / 治理代批）；零 console/CSP 违规。
 *
 * 运行（仓库根）：
 *   ./node_modules/.bin/electron test/桌面UI/phase3b-electron-smoke.mjs [entry.html] [outDir]
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ENTRY = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, "app/renderer/dist/index.html");
const OUT = process.argv[3]
  ? path.resolve(process.argv[3])
  : "/tmp/ans-phase3b-smoke";
const PRELOAD = path.join(HERE, "phase3b-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/phase3b-project";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const report = { entry: ENTRY, checks: [], calls: {}, console: [], csp: [], screenshots: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({
    name,
    value: value === true,
    detail: detail === undefined ? null : detail,
  });
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
}

// 可控替身状态
const state = {
  governanceModel: "trio",
  sendMode: "ok",
  shellResponse: "ok",
  recoveryResponse: "ok",
  judgeEnabled: false,
  decisionEnabled: false,
};
const calls = {
  sends: [],
  aborts: [],
  withdraws: [],
  shellResponses: [],
  recoveryResponses: [],
  attachChecks: [],
};
report.calls = calls;

const listing = () => ({
  projectRoot: ROOT,
  primaryRoleId: "A",
  hasRoles: true,
  warnings: [],
  governanceModel: state.governanceModel,
  roles: [
    { roleId: "A", cardPath: ROOT + "/角色卡/A/role-card.md", cardText: "# A", boundary: { entries: [] }, boundaryPath: "", changelog: null, docs: [] },
    { roleId: "B", cardPath: ROOT + "/角色卡/B/role-card.md", cardText: "# B", boundary: { entries: [] }, boundaryPath: "", changelog: null, docs: [] },
  ],
});

ipcMain.handle("app:recovery-state", () => ({}));
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", () => listing());
ipcMain.handle("session:open", (_e, input) => ({
  ok: true,
  resumed: true,
  contextSource: "resumed",
  runtime: input.runtime,
  projectRoot: input.projectRoot,
}));
ipcMain.handle("session:history-get", (_e, input) => ({
  projectRoot: input.projectRoot,
  roleId: input.roleId,
  runtime: input.runtime,
  rows: [],
  error: null,
  skipped: 0,
}));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:send", (_e, input) => {
  calls.sends.push(input);
  if (state.sendMode === "fail") {
    // 5A 语义：显式 sessionCurrent=true 表示会话仍有效（拒发不失效句柄）。
    return { ok: false, error: "离线拒发", clientMessageId: input.metadata?.clientMessageId, sessionCurrent: true };
  }
  return { ok: true, turnId: "smoke-turn-" + calls.sends.length, sessionCurrent: true };
});
ipcMain.handle("session:abort", (_e, input) => {
  calls.aborts.push(input);
  return { ok: true, supported: true };
});
ipcMain.handle("session:withdraw", (_e, input) => {
  calls.withdraws.push(input);
  return { ok: true, summary: "客户排队消息" };
});
ipcMain.handle("session:operator-response", () => ({ ok: true }));
ipcMain.handle("shell:confirm-response", (_e, input) => {
  calls.shellResponses.push(input);
  if (state.shellResponse === "expired") return { ok: false, expired: true, error: "已失效" };
  if (state.shellResponse === "throw") throw new Error("离线通道异常");
  return { ok: true };
});
ipcMain.handle("recovery:confirm-response", (_e, input) => {
  calls.recoveryResponses.push(input);
  if (state.recoveryResponse === "expired") return { ok: false, expired: true };
  if (state.recoveryResponse === "throw") throw new Error("离线通道异常");
  return { ok: true };
});
ipcMain.handle("shell:judge-get", () => ({
  version: 1,
  ok: true,
  enabled: state.judgeEnabled,
}));
ipcMain.handle("shell:judge-set", (_e, input) => {
  state.judgeEnabled = input.enabled === true;
  return { version: 1, ok: true, enabled: state.judgeEnabled };
});
ipcMain.handle("decision:judge-get", () => ({
  version: 1,
  ok: true,
  enabled: state.decisionEnabled,
}));
ipcMain.handle("decision:judge-set", (_e, input) => {
  state.decisionEnabled = input.enabled === true;
  return { version: 1, ok: true, enabled: state.decisionEnabled };
});
ipcMain.handle("app:pick-image", () => ({
  ok: true,
  image: { name: "pick.png", mime: "image/png", size: 68, dataBase64: PNG },
}));
ipcMain.handle("app:attach-image", (_e, input) => {
  calls.attachChecks.push(input);
  return { ok: true, image: { name: input.name || "pasted.png", mime: "image/png", size: 68 } };
});
ipcMain.handle("window:minimize", () => ({ ok: true }));
ipcMain.handle("window:toggle-maximize", () => ({ ok: true }));
ipcMain.handle("window:close", () => ({ ok: true }));
ipcMain.handle("window:is-maximized", () => false);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
    },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message });
  });
  await win.loadFile(ENTRY);
  await sleep(400);
  const js = (code) => wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  async function waitFor(expr, timeout = 8000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((error) => String(error));
      if (last) return last;
      await sleep(60);
    }
    return last;
  }
  const push = async (channel, payload) => {
    await js(`window.desktop.__smoke.emit(${JSON.stringify(channel)}, ${JSON.stringify(payload)})`);
    await sleep(90);
  };
  const key = async (name) => {
    wc.sendInputEvent({ type: "keyDown", keyCode: name });
    wc.sendInputEvent({ type: "keyUp", keyCode: name });
    await sleep(80);
  };
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };

  const ROLE = { projectRoot: ROOT, roleId: "A", runtime: "claude" };
  const shellPayload = (id, extra = {}) => ({
    ...ROLE,
    id,
    policy: "project",
    command: 'echo "逐字 原文"',
    summary: "执行 shell 命令",
    reasonPlain: "项目角色原因原文",
    reasonRaw: "项目审核原文",
    cwd: ROOT,
    argvLines: ["echo", "逐字 原文"],
    ...extra,
  });
  const suPayload = (id, tier) => ({
    ...ROLE,
    id,
    policy: "su-approval",
    tier,
    command: 'sh -c "echo approved"',
    summary: "执行 shell 命令",
    reasonPlain: "逐条客户批准；拒绝/超时/通道不可用 = 拒绝。",
    reasonRaw: "命中硬拒程序规则：reshell",
    cwd: ROOT,
    argvLines: ["sh", "-c", "echo approved"],
  });

  await waitFor(`!!document.querySelector('#root > .app-shell')`);
  check("MOUNT_AND_BRIDGE", await js(`!!window.__ansRenderer && !!window.desktop && !!document.getElementById('shell-confirm') && !!document.getElementById('recovery-confirm')`));

  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)}); await window.__ansRenderer.selectRole('A')`);
  await sleep(200);
  check("LOAD_PROJECT_AND_SESSION", await js(`window.__ansRenderer.state.projectRoot===${JSON.stringify(ROOT)} && window.__ansRenderer.state.sessionOpenRoleId==='A'`));

  // —————— 1. shell 卡 fail-closed ——————
  await push("shell:confirm-request", shellPayload("sc-1"));
  check(
    "SHELL_CARD_VERBATIM_AND_DENY_FOCUS",
    await js(`(()=>{const o=document.getElementById('shell-confirm');const c=document.getElementById('sc-command').textContent;return !o.hidden&&c==='echo "逐字 原文"'&&document.getElementById('sc-reason').textContent==='项目角色原因原文'&&document.getElementById('sc-title').textContent==='shell 命令请求'&&document.activeElement===document.getElementById('sc-deny')&&!document.getElementById('sc-allow').disabled;})()`),
  );
  await shot("1360-shell-card");
  await js(`document.getElementById('sc-details').open=true`);
  await sleep(80);
  check(
    "SHELL_DETAILS_LUCIDE_CHEVRON_VISIBLE_AND_ROTATED",
    await js(`(()=>{const d=document.getElementById('sc-details'),svg=d.querySelector('summary .disclosure-chevron');if(!svg)return false;const t=getComputedStyle(svg).transform;const marker=getComputedStyle(d.querySelector('summary'),'::before').content;return d.open===true&&t!=='none'&&(marker==='none'||marker==='normal');})()`),
  );
  await shot("1360-shell-details-open");
  await js(`document.getElementById('sc-details').open=false`);
  await sleep(50);
  const beforeEsc = calls.shellResponses.length;
  await key("Escape");
  check(
    "SHELL_ESC_DENIES_AND_CLOSES",
    (await js(`document.getElementById('shell-confirm').hidden && window.__ansRenderer.state.shellConfirm===null`)) &&
      calls.shellResponses.length === beforeEsc + 1 &&
      calls.shellResponses.at(-1).allow === false,
    calls.shellResponses.at(-1),
  );

  await push("shell:confirm-request", shellPayload("sc-2"));
  await js(`document.getElementById('sc-allow').click()`);
  await sleep(100);
  check(
    "SHELL_EXPLICIT_ALLOW_ONLY",
    (await js(`document.getElementById('shell-confirm').hidden`)) &&
      calls.shellResponses.at(-1).id === "sc-2" &&
      calls.shellResponses.at(-1).allow === true,
    calls.shellResponses.at(-1),
  );

  await push("shell:confirm-request", shellPayload("sc-settle"));
  await push("session:events", [
    { ...ROLE, event: { kind: "settled", turnId: "smoke-t1", summary: "本轮结束", detail: { outcome: "completed" } } },
  ]);
  check(
    "SHELL_SETTLED_CLOSES_STALE_CARD",
    await js(`document.getElementById('shell-confirm').hidden && window.__ansRenderer.state.shellConfirm===null`),
  );

  await push("shell:confirm-request", shellPayload("sc-exp"));
  await push("session:operator-expired", {
    ...ROLE,
    id: "sc-exp",
    reason: "本轮已结束、停止或会话已重建，旧 shell 确认失效。",
  });
  check(
    "SHELL_EXPIRY_CLOSES_AND_REPORTS_REASON",
    await js(`document.getElementById('shell-confirm').hidden && window.__ansRenderer.state.shellConfirm===null && document.getElementById('composer-hint').textContent.includes('旧 shell 确认失效')`),
  );

  // —————— 2. su 审批档位 ——————
  await push("shell:confirm-request", suPayload("su-deny", "deny"));
  check(
    "SU_DENY_TIER_DISCLOSURE",
    await js(`(()=>{const t=document.getElementById('sc-title').textContent,s=document.getElementById('sc-summary').textContent,r=document.getElementById('sc-reason').textContent,h=document.getElementById('sc-hint').textContent;return t==='SU 命令审批'&&s.includes('硬拒类（deny）')&&r.includes('逐条客户批准')&&r.includes('命中原因：命中硬拒程序规则：reshell')&&h.includes('批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界')&&document.activeElement===document.getElementById('sc-deny')&&!document.body.textContent.includes('不再询问');})()`),
  );
  check(
    "SU_WARNING_AMBER_SUMMARY_BOLD",
    await js(`(()=>{const probe=(v)=>{const s=document.createElement('span');s.style.color=v;document.body.appendChild(s);const c=getComputedStyle(s).color;s.remove();return c;};const summary=getComputedStyle(document.getElementById('sc-summary'));const warn=document.querySelector('#sc-hint .sc-su-warning');const hint=getComputedStyle(document.getElementById('sc-hint'));return summary.fontWeight==='600'&&!!warn&&getComputedStyle(warn).color===probe('var(--warning)')&&hint.color===probe('var(--text-3)')&&document.getElementById('sc-hint').textContent.includes('点「拒绝」、按 Esc 或关闭本框 = 不放行（不会执行）。');})()`),
  );
  await shot("1360-su-approval-card");
  await push("shell:confirm-request", suPayload("su-risky", "risky"));
  check(
    "SU_RISKY_TIER_LABEL",
    await js(`document.getElementById('sc-summary').textContent.includes('风险命令（risky）')`),
  );
  await push("shell:confirm-request", suPayload("su-review", "review"));
  check(
    "SU_REVIEW_TIER_LABEL",
    await js(`document.getElementById('sc-summary').textContent.includes('未自动判定（review）')`),
  );
  await js(`document.getElementById('sc-deny').click()`);
  await sleep(80);

  // —————— 3. judge manual 回落 ——————
  await push(
    "shell:confirm-request",
    shellPayload("sc-manual", {
      judgeNotice: "判断 agent 已完成判断，但结果无法在聊天中显示；已转你手动确认。",
    }),
  );
  check(
    "JUDGE_MANUAL_NOTICE_VERBATIM_ON_CARD",
    await js(`(()=>{const n=document.getElementById('sc-judge-notice');return !n.hidden&&n.textContent==='判断 agent 已完成判断，但结果无法在聊天中显示；已转你手动确认。'&&!document.getElementById('sc-deny').disabled;})()`),
  );
  await js(`document.getElementById('sc-deny').click()`);
  await sleep(80);

  // —————— 4. 双开关：开启 / 一次性警告 / 重复推送 / 单模型 ——————
  check(
    "JUDGE_SWITCH_STARTS_AUTHORITATIVE_OFF",
    await js(`(()=>{const t=document.getElementById('auto-approve-toggle'),l=document.getElementById('auto-approve-label');return !t.checked&&!t.disabled&&l.textContent==='替我审批'&&document.getElementById('shell-judge-warning').hidden;})()`),
  );
  await js(`document.getElementById('auto-approve-toggle').click()`);
  await sleep(120);
  check(
    "JUDGE_ENABLE_SHOWS_AMBER_MARKER_AND_WARNING",
    await js(`(()=>{const t=document.getElementById('auto-approve-toggle'),l=document.getElementById('auto-approve-label'),w=document.getElementById('shell-judge-warning'),x=document.getElementById('shell-judge-warning-text'),wrap=t.closest('.composer-auto-approve');return t.checked&&l.textContent==='替我审批中 · 判断 agent'&&wrap.classList.contains('is-on')&&!w.hidden&&document.getElementById('shell-judge-warning-close').textContent==='知道了'&&x.textContent.includes('替我审批中：shell 命令与写盘/写卡确认')&&x.textContent.includes('按所属开关回落逐张卡');})()`),
  );
  await shot("1360-judge-toggles-warning");
  await js(`document.getElementById('shell-judge-warning-close').click()`);
  await sleep(40);
  await push("shell:judge-state", { version: 1, enabled: true });
  check(
    "JUDGE_ACKNOWLEDGED_WARNING_DOES_NOT_REAPPEAR",
    await js(`document.getElementById('shell-judge-warning').hidden && document.getElementById('auto-approve-toggle').checked`),
  );
  await js(`document.getElementById('auto-approve-toggle').click()`);
  await sleep(120);

  await js(`document.getElementById('judge-decision-toggle').click()`);
  await sleep(120);
  check(
    "DECISION_ENABLE_SHOWS_GROUP_WARNING",
    await js(`(()=>{const t=document.getElementById('judge-decision-toggle'),x=document.getElementById('shell-judge-warning-text');return t.checked&&document.getElementById('judge-decision-label').textContent==='替我决策中 · 判断 agent'&&!document.getElementById('shell-judge-warning').hidden&&x.textContent.includes('替我决策中：提案接受、任命、验收将由判断 agent 代批。')&&!x.textContent.includes('替我审批中：');})()`),
  );
  await js(`document.getElementById('shell-judge-warning-close').click()`);
  await js(`document.getElementById('judge-decision-toggle').click()`);
  await sleep(100);

  state.governanceModel = "single";
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)}); await window.__ansRenderer.selectRole('A')`);
  await sleep(150);
  check(
    "DECISION_DISABLED_IN_SINGLE_WITH_NOTE",
    await js(`(()=>{const t=document.getElementById('judge-decision-toggle'),s=document.getElementById('judge-decision-status');return t.disabled&&!t.checked&&!s.hidden&&s.textContent==='旧治理模型（single）不支持代决策';})()`),
  );
  state.governanceModel = "trio";
  await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)}); await window.__ansRenderer.selectRole('A')`);
  await sleep(150);

  // —————— 5. 判断结果行 ——————
  await push("session:events", [
    { ...ROLE, event: { kind: "tool_call", turnId: "judge-turn", summary: "模型请求调用 run_shell", detail: { toolName: "run_shell", toolCallId: "judge-call", phase: "start" } } },
  ]);
  await push("shell:judge-result", {
    version: 1,
    id: "sj-allow",
    toolCallId: "judge-call",
    roleId: "A",
    projectRoot: ROOT,
    runtime: "claude",
    verdict: "allow",
    tier: "deny",
    hardDenyOverride: true,
    label: "deny 档 · judge 放行",
    summary: "构建项目",
    engine: "claude",
    operator: "judge:claude",
    at: "2026-10-17T10:00:00Z",
    command: "npm run build",
    cwd: ROOT,
  });
  check(
    "SHELL_JUDGE_ALLOW_ROW_ANCHORED_AND_PROMINENT",
    await js(`(()=>{const row=[...document.querySelectorAll('#chat .shell-judge-row')].find(x=>x.dataset.toolCallId==='judge-call');if(!row)return false;const pane=row.closest('.chat-pane'),kids=[...pane.children];const toolIdx=kids.findIndex(x=>x.textContent.includes('run_shell')||x.classList.contains('tool-records'));return row.classList.contains('is-deny-override')&&row.textContent.includes('已替你放行（判断 agent · 代审批 · deny 档）')&&row.textContent.includes('deny 档 · judge 放行')&&row.textContent.includes('该命令属于硬拒类')&&row.textContent.includes('判断引擎：Claude')&&row.textContent.includes('档位：deny')&&toolIdx>=0&&kids.indexOf(row)>toolIdx;})()`),
  );
  await shot("1360-judge-result-row");
  const judgeRowCount = await js(`document.querySelectorAll('#chat .shell-judge-row').length`);
  await push("shell:judge-result", {
    version: 1,
    id: "sj-manual",
    toolCallId: "judge-call",
    roleId: "A",
    projectRoot: ROOT,
    runtime: "claude",
    verdict: "manual",
    reasonCode: "timeout",
  });
  check(
    "SHELL_JUDGE_MANUAL_PRODUCES_NO_ROW",
    (await js(`document.querySelectorAll('#chat .shell-judge-row').length`)) === judgeRowCount,
  );
  await push("session:events", [
    { ...ROLE, event: { kind: "tool_call", turnId: "gov-turn", summary: "模型请求确认", detail: { toolName: "request_confirmation", toolCallId: "gov-call", phase: "start" } } },
  ]);
  await push("session:operator-judge", {
    version: 1,
    id: "gov-result",
    requestId: "gov-req",
    toolCallId: "gov-call",
    roleId: "A",
    projectRoot: ROOT,
    runtime: "claude",
    group: "decision",
    cardKind: "proposal",
    flowId: "flow-a",
    engine: "claude",
    reason: "提案范围清晰",
    selected: ["accept"],
    evidence: ["docs/proposals/flow-a-v1.md"],
  });
  check(
    "GOVERNANCE_JUDGE_ROW_SAYS_JUDGE_DELEGATED",
    await js(`(()=>{const row=[...document.querySelectorAll('#chat .governance-judge-row')].find(x=>x.dataset.toolCallId==='gov-call');return !!row&&row.textContent.includes('judge 代批 · 代决策')&&row.textContent.includes('接受提案（accept） · 流程 flow-a')&&row.textContent.includes('operator:judge:claude')&&row.textContent.includes('docs/proposals/flow-a-v1.md');})()`),
  );

  // —————— 6. 恢复确认卡 ——————
  const evidence = "role_status：角色「实现者」busy=true 已 583s；队列 0；最近一轮 timed_out 无 settled。";
  await push("recovery:confirm-request", {
    projectRoot: ROOT,
    runtime: "claude",
    id: "rp-1",
    roleId: "实现者",
    action: "abort-turn",
    evidence,
    reason: "疑似卡死",
    requestedBy: "su",
    requestedAt: "2026-10-16T02:10:03.000Z",
  });
  check(
    "RECOVERY_CARD_VERBATIM_CANCEL_FOCUS",
    await js(`(()=>{const o=document.getElementById('recovery-confirm');return !o.hidden&&document.getElementById('rc-action').textContent==='动作：停止本轮（abort-turn）'&&document.getElementById('rc-role').textContent==='目标角色：实现者'&&document.getElementById('rc-evidence').textContent===${JSON.stringify(evidence)}&&document.getElementById('rc-reason').textContent.includes('疑似卡死')&&document.activeElement===document.getElementById('rc-deny')&&document.getElementById('rc-details').open===false;})()`),
  );
  await shot("1360-recovery-card");
  await js(`document.getElementById('rc-allow').click()`);
  await sleep(120);
  check(
    "RECOVERY_EXPLICIT_EXECUTE_ONLY",
    (await js(`document.getElementById('recovery-confirm').hidden`)) &&
      calls.recoveryResponses.at(-1).id === "rp-1" &&
      calls.recoveryResponses.at(-1).allow === true,
    calls.recoveryResponses.at(-1),
  );

  state.recoveryResponse = "expired";
  await push("recovery:confirm-request", {
    projectRoot: ROOT,
    runtime: "claude",
    id: "rp-2",
    roleId: "A",
    action: "rebuild-session",
    evidence: "ev-2",
  });
  await key("Escape");
  check(
    "RECOVERY_EXPIRED_STAYS_DISABLED_HONEST",
    await js(`(()=>{const o=document.getElementById('recovery-confirm');return !o.hidden&&o.classList.contains('is-expired')&&document.getElementById('rc-allow').disabled&&!document.getElementById('rc-close').disabled&&document.getElementById('rc-hint').textContent.includes('未获执行');})()`),
  );
  await js(`document.getElementById('rc-close').click()`);
  check(
    "RECOVERY_EXPIRED_DISMISSES_WITHOUT_EXECUTION_ILLUSION",
    await js(`document.getElementById('recovery-confirm').hidden && window.__ansRenderer.state.recoveryConfirm===null`),
  );
  state.recoveryResponse = "throw";
  await push("recovery:confirm-request", {
    projectRoot: ROOT,
    runtime: "claude",
    id: "rp-3",
    roleId: "A",
    action: "abort-turn",
    evidence: "ev-3",
  });
  check(
    "RECOVERY_CHANNEL_CARD_ARRIVED",
    await js(`!document.getElementById('recovery-confirm').hidden && window.__ansRenderer.state.recoveryConfirm && window.__ansRenderer.state.recoveryConfirm.id==='rp-3'`),
    await js(`(()=>({hidden:document.getElementById('recovery-confirm').hidden,state:window.__ansRenderer.state.recoveryConfirm}))()`),
  );
  await key("Escape");
  const channelDetail = await js(`(()=>{const o=document.getElementById('recovery-confirm');const s=window.__ansRenderer.state.recoveryConfirm;return {hidden:o.hidden,cls:o.className,allow:document.getElementById('rc-allow')?document.getElementById('rc-allow').disabled:'missing',hint:document.getElementById('rc-hint')?document.getElementById('rc-hint').textContent:'missing',state:s};})()`);
  check(
    "RECOVERY_CHANNEL_ERROR_FAIL_CLOSED",
    await js(`(()=>{const o=document.getElementById('recovery-confirm');const allow=document.getElementById('rc-allow');const hint=document.getElementById('rc-hint');return !o.hidden&&o.classList.contains('is-expired')&&!!allow&&allow.disabled&&!!hint&&hint.textContent.includes('按 fail-closed 不执行');})()`),
    channelDetail,
  );
  await js(`(()=>{const b=document.getElementById('rc-close');if(b)b.click();})()`);
  state.recoveryResponse = "ok";

  // —————— 7. 发送 ack / 失败恢复 ——————
  await js(`document.getElementById('inp-message').value='冒烟发送';document.getElementById('btn-send').click()`);
  await sleep(160);
  const sent = calls.sends.at(-1);
  check(
    "SEND_ACK_CLIENT_MESSAGE_ID_TARGET",
    !!sent &&
      typeof sent.metadata?.clientMessageId === "string" &&
      sent.metadata.clientMessageId.length > 8 &&
      sent.target?.roleId === "A" &&
      sent.target?.runtime === "claude" &&
      (await js(`document.getElementById('inp-message').value==='' && document.getElementById('chat').textContent.includes('冒烟发送')`)),
    sent && { target: sent.target, clientMessageId: sent.metadata.clientMessageId },
  );
  state.sendMode = "fail";
  await js(`document.getElementById('inp-message').value='拒发保留';document.getElementById('btn-send').click()`);
  await sleep(160);
  check(
    "SEND_FAILURE_RESTORES_DRAFT_AND_SAYS_SO",
    await js(`document.getElementById('inp-message').value==='拒发保留' && document.getElementById('chat').textContent.includes('发送失败：离线拒发') && document.getElementById('composer-hint').textContent.includes('发送失败：离线拒发')`),
  );
  state.sendMode = "ok";
  await js(`document.getElementById('inp-message').value=''`);

  // —————— 8. 附件：选 / 粘贴 / 拖入 / 缩略图 / 移除 ——————
  await js(`(()=>{const c=document.getElementById('composer-capsule');c.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));})()`);
  await sleep(60);
  check(
    "DROP_FEEDBACK_VISIBLE_TOKENS",
    await js(`(()=>{const c=document.getElementById('composer-capsule');const probe=(v)=>{const s=document.createElement('span');s.style.color=v;document.body.appendChild(s);const x=getComputedStyle(s).color;s.remove();return x;};const cs=getComputedStyle(c);return c.classList.contains('is-dropping')&&cs.borderColor===probe('var(--text-3)')&&cs.backgroundColor===probe('var(--hover)');})()`),
  );
  await shot("1360-drop-state");
  await js(`document.getElementById('composer-capsule').dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}))`);
  await sleep(50);
  check(
    "DROP_FEEDBACK_CLEARED_ON_LEAVE",
    await js(`!document.getElementById('composer-capsule').classList.contains('is-dropping')`),
  );
  await js(`document.getElementById('btn-attach-image').click()`);
  await sleep(150);
  check(
    "ATTACH_PICK_THUMBNAIL",
    await js(`(()=>{const chips=[...document.querySelectorAll('#attach-row .attach-chip')];return chips.length===1&&chips[0].querySelector('img')&&chips[0].querySelector('img').src.startsWith('data:image/png;base64,')&&chips[0].title.includes('pick.png')&&!!chips[0].querySelector('.attach-rm');})()`),
  );
  check(
    "ATTACH_CHIP_RADIUS_AND_REMOVE_ICON",
    await js(`(()=>{const chip=document.querySelector('#attach-row .attach-chip'),rm=chip.querySelector('.attach-rm'),svg=rm.querySelector('svg');const cs=getComputedStyle(chip),rs=getComputedStyle(rm);return cs.borderRadius==='8px'&&rs.borderRadius==='4px'&&Math.round(svg.getBoundingClientRect().width)===12&&Math.round(svg.getBoundingClientRect().height)===12;})()`),
  );
  await js(`(()=>{const dt=new DataTransfer();const b=Uint8Array.from(atob('${PNG}'),c=>c.charCodeAt(0));dt.items.add(new File([b],'paste.png',{type:'image/png'}));const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});document.getElementById('inp-message').dispatchEvent(ev);})()`);
  await sleep(220);
  check(
    "ATTACH_PASTE_VIA_MAIN_VALIDATION",
    (await js(`document.querySelectorAll('#attach-row .attach-chip').length`)) === 2 &&
      calls.attachChecks.at(-1)?.name === "paste.png",
  );
  await js(`(()=>{const dt=new DataTransfer();const b=Uint8Array.from(atob('${PNG}'),c=>c.charCodeAt(0));dt.items.add(new File([b],'drop.png',{type:'image/png'}));document.getElementById('composer-capsule').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));})()`);
  await sleep(220);
  check(
    "ATTACH_DROP_THUMBNAIL",
    (await js(`document.querySelectorAll('#attach-row .attach-chip').length`)) === 3,
  );
  await shot("1360-attachments");
  await js(`document.querySelector('#attach-row .attach-chip .attach-rm').click()`);
  await sleep(80);
  check(
    "ATTACH_REMOVE",
    (await js(`document.querySelectorAll('#attach-row .attach-chip').length`)) === 2,
  );
  await js(`document.querySelectorAll('#attach-row .attach-chip .attach-rm').forEach(b=>b.click())`);
  await sleep(80);

  // —————— 9. 队列位次与撤回（就地回执）——————
  await push("session:role-state", {
    ...ROLE,
    busy: false,
    running: { id: "run-1", kind: "message", summary: "正在处理当前请求" },
    queue: [
      { id: "q-msg", kind: "message", summary: "客户排队消息" },
      { id: "q-dispatch", kind: "dispatch", summary: "派发任务", sourceRoleId: "B" },
    ],
  });
  check(
    "QUEUE_POSITIONS_AND_WITHDRAW_ONLY_FOR_MESSAGES",
    await js(`(()=>{const rows=[...document.querySelectorAll('#chat .queue-row')];const texts=rows.map(x=>x.textContent);return rows.length===3&&texts[0].includes('进行中')&&texts[1].includes('第 1 位')&&texts[2].includes('第 2 位')&&document.querySelectorAll('#chat .queue-withdraw').length===1;})()`),
  );
  check(
    "QUEUE_WITHDRAW_HIT_TARGET_AND_INPUT_BORDER",
    await js(`(()=>{const btn=document.querySelector('#chat .queue-withdraw');const probe=(v)=>{const s=document.createElement('span');s.style.color=v;document.body.appendChild(s);const x=getComputedStyle(s).color;s.remove();return x;};const cs=getComputedStyle(btn);return parseFloat(cs.height)>=24&&cs.fontSize==='11px'&&cs.borderColor===probe('var(--input)');})()`),
  );
  await js(`document.querySelector('#chat .queue-withdraw').click()`);
  await sleep(150);
  check(
    "QUEUE_WITHDRAW_INLINE_RECEIPT",
    calls.withdraws.at(-1)?.id === "q-msg" &&
      calls.withdraws.at(-1)?.target?.roleId === "A" &&
      (await js(`[...document.querySelectorAll('#chat .queue-feedback')].some(x=>x.textContent==='已撤回排队消息：客户排队消息')`)),
    calls.withdraws.at(-1),
  );
  await shot("1360-queue-withdraw");

  // —————— 10. 停止本轮三态 ——————
  await push("session:role-state", { ...ROLE, busy: true, queue: [], running: null });
  check("HALT_VISIBLE_WHEN_BUSY", await js(`!document.getElementById('btn-halt').hidden`));
  await js(`document.getElementById('btn-halt').click()`);
  await sleep(150);
  check(
    "HALT_ABORTS_EXACT_TARGET_AND_SAYS_REQUESTED",
    calls.aborts.at(-1)?.roleId === "A" &&
      calls.aborts.at(-1)?.runtime === "claude" &&
      (await js(`document.getElementById('chat').textContent.includes('已请求停止当前轮次')`)),
    calls.aborts.at(-1),
  );
  await push("session:role-state", { ...ROLE, busy: false, queue: [], running: null });
  check("HALT_HIDDEN_WHEN_IDLE", await js(`document.getElementById('btn-halt').hidden`));

  // —————— 11. 系统行（看护/收束）——————
  await push("session:events", [
    {
      ...ROLE,
      event: {
        turnId: "sys-alert",
        kind: "message",
        summary: "[系统·看护] 投递排队积压",
        detail: {
          source: "prompt-input",
          text: "用户指令：[系统·看护] 投递排队积压：角色「实现者」队首任务已排队 12 分钟（深度 3）。",
        },
      },
    },
  ]);
  check(
    "SYSTEM_ALERT_INJECTED_STYLE",
    await js(`(()=>{const el=document.querySelector('#chat .msg-injected.is-system');return !!el&&el.querySelector('.mi-chip').textContent==='系统消息 · 看护'&&!el.classList.contains('msg-user')&&el.querySelector('.mi-body').textContent.includes('投递排队积压');})()`),
  );

  // —————— 12. 960 档截图 ——————
  win.setContentSize(960, 620);
  await sleep(200);
  await push("shell:confirm-request", shellPayload("sc-960"));
  await shot("960-shell-card");
  await js(`document.getElementById('sc-details').open=true`);
  await sleep(80);
  await shot("960-shell-details-open");
  await js(`document.getElementById('sc-details').open=false`);
  await js(`document.getElementById('sc-deny').click()`);
  await sleep(80);
  await push("recovery:confirm-request", {
    projectRoot: ROOT,
    runtime: "claude",
    id: "rp-960",
    roleId: "A",
    action: "abort-turn",
    evidence: "ev-960",
  });
  await shot("960-recovery-card");
  await js(`document.getElementById('rc-deny').click()`);
  await sleep(80);
  await push("shell:confirm-request", suPayload("su-960", "risky"));
  await shot("960-su-approval-card");
  await js(`document.getElementById('sc-deny').click()`);
  await sleep(80);
  await js(`document.getElementById('auto-approve-toggle').click()`);
  await sleep(120);
  await shot("960-judge-toggles-warning");
  await js(`document.getElementById('shell-judge-warning-close').click();document.getElementById('auto-approve-toggle').click()`);
  await sleep(100);
  await js(`(()=>{const c=document.getElementById('composer-capsule');c.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));})()`);
  await sleep(60);
  await shot("960-drop-state");
  await js(`document.getElementById('composer-capsule').dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}))`);
  await sleep(50);
  await js(`document.getElementById('btn-attach-image').click()`);
  await sleep(150);
  await shot("960-attachments");
  await js(`document.querySelectorAll('#attach-row .attach-chip .attach-rm').forEach(b=>b.click())`);
  await push("session:role-state", {
    ...ROLE,
    busy: false,
    running: null,
    queue: [{ id: "q-960", kind: "message", summary: "客户排队消息" }],
  });
  await shot("960-queue-withdraw");
  await js(`(()=>{const c=document.getElementById('chat');c.scrollTop=0;})()`);
  await js(`(async()=>{const c=document.getElementById('chat');for(let i=0;i<80;i++){const row=[...document.querySelectorAll('#chat .shell-judge-row')].at(-1);if(row){c.scrollTop+=row.getBoundingClientRect().top-c.getBoundingClientRect().top-160;return;}c.scrollTop+=240;await new Promise(r=>setTimeout(r,20));}})()`);
  await sleep(200);
  await shot("960-judge-result-row");
  win.setContentSize(1360, 860);
  await sleep(150);

  // —————— 13. 控制台 / CSP ——————
  await sleep(200);
  const csp = await js(`(window.__ansCspViolations||[]).length`);
  report.csp = csp;
  const errors = report.console.filter(
    (item) =>
      item.level === "error" ||
      /Content Security Policy|Refused to|Failed to load module/i.test(String(item.message || "")),
  );
  check("NO_CSP_VIOLATIONS", csp === 0, csp);
  check("NO_CONSOLE_ERRORS", errors.length === 0, errors.slice(0, 5));

  const failures = report.checks.filter((item) => item.value !== true);
  report.ok = failures.length === 0;
  report.failures = failures.map((item) => item.name);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const lines = report.checks.map(
    (item) => `${item.value ? "PASS" : "FAIL"} ${item.name}`,
  );
  fs.writeFileSync(
    path.join(OUT, "report.txt"),
    lines.join("\n") + `\nSMOKE_DONE=${report.ok ? 1 : 0}\n`,
  );
  console.log(`SMOKE_DONE=${report.ok ? 1 : 0}`);
  win.destroy();
  app.exit(report.ok ? 0 : 1);
}).catch((error) => {
  console.error("SMOKE_FATAL", error);
  fs.writeFileSync(
    path.join(OUT, "fatal.txt"),
    String((error && error.stack) || error),
  );
  app.exit(2);
});

#!/usr/bin/env node
/**
 * test/桌面UI/reasoning-electron-smoke.mjs
 *
 * R5.2 真实 Electron 离线 e2e（受控 IPC 替身；无模型/网络/.env）：
 *  1. 实时：同回合两段 reasoning 合并为一行，标题带真实时长求和，正文按到达序，行在 user 之后、
 *     assistant/turn-terminal 之前；
 *  2. 省略：omitted ⇒ 标题带「（内容由平台省略）」、展开只有固定说明、无 `<pre>` 假正文；
 *  3. 回放：`row.reasoning` 行与实时同解；同一 piece 实时重推不重复、正文不翻倍；
 *     历史缺载体 ⇒ assistant「已思考」文本行回落；
 *  4. 坏件/无 turnId：原始字符串载荷落诊断系统行（原文不上屏）；两条无 turnId 各成一行、不合并；
 *  5. 回归：delivery-note/system、工具行结构与既有行共存；零 console.error / CSP 违规。
 *
 * 运行（仓库根，需先 `npm run build:renderer`）：
 *   ./node_modules/.bin/electron test/桌面UI/reasoning-electron-smoke.mjs [entry.html] [outDir]
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_SETTINGS } from "../../src/common/shared/runtime-settings.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ENTRY = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, "app/renderer/dist/index.html");
const OUT = process.argv[3]
  ? path.resolve(process.argv[3])
  : "/tmp/ans-reasoning-smoke";
const PRELOAD = path.join(HERE, "reasoning-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/reasoning-smoke-project";
const report = {
  entry: ENTRY,
  checks: [],
  console: [],
  csp: [],
  screenshots: [],
  failures: 0,
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({
    name,
    value: value === true,
    detail: detail === undefined ? null : detail,
  });
  if (value !== true) report.failures += 1;
  console.log(
    `CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`,
  );
  return value === true;
}

const projectRole = (roleId) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: ROOT + "/角色卡/" + roleId + "/role-card.md",
  boundary: { entries: [] },
  boundaryPath: "",
  changelog: null,
  docs: [],
});
const listing = () => ({
  projectRoot: ROOT,
  primaryRoleId: "A",
  hasRoles: true,
  warnings: [],
  governanceModel: "single",
  governanceRecord: null,
  roles: [projectRole("A"), projectRole("B"), projectRole("C")],
});

const historyByRole = { A: [], B: [], C: [] };

function runtimeConfig(runtime) {
  const definition = RUNTIME_SETTINGS[runtime];
  return {
    runtime,
    label: definition.label,
    path: ROOT + "/.env",
    revision: 0,
    application: "next-session",
    missingKeys: [],
    fields: definition.fields.map((field) => ({
      ...field,
      value: "",
      isSet: field.required === true,
      source: field.required === true ? "environment" : "default",
    })),
  };
}

ipcMain.handle("app:recovery-state", () => null);
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", () => listing());
ipcMain.handle("app:pick-project", () => ROOT);
ipcMain.handle("app:open-external", () => ({ ok: true }));
ipcMain.handle("window:is-maximized", () => false);
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
  rows: historyByRole[input.roleId] || [],
  error: null,
  skipped: 0,
}));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", () => ({ ok: true }));
ipcMain.handle("session:withdraw", () => ({ ok: true }));
ipcMain.handle("session:operator-response", () => ({ ok: true }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("shell:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("runtime-config:get", (_e, input) => runtimeConfig(input.runtime));
ipcMain.handle("runtime-config:save", (_e, input) => ({
  ok: true,
  runtime: input.runtime,
  appliedKeys: Object.keys(input.updates || {}),
  revision: 1,
  application: "next-session",
}));
ipcMain.handle("project:document-read", () => ({ ok: false, code: "NOT_LISTED" }));
ipcMain.handle("session:get-persistence", (_e, input) => ({
  ok: true,
  version: 1,
  scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
  value: { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true },
}));
ipcMain.handle("report:get-save-state", () => ({ ok: false, code: "DISABLED" }));
ipcMain.handle("delivery:get-receipt", () => ({ ok: false, code: "NOT_FOUND" }));

// —— 夹具构造 ——
const envelope = (roleId, event) => ({
  projectRoot: ROOT,
  roleId,
  runtime: "pi",
  event,
});
const projectedText = (text) => ({
  text,
  truncated: false,
  redacted: false,
});
const reasoningEvent = (roleId, input) => {
  const turnId = input.turnId;
  return envelope(roleId, {
    kind: "message",
    ...(turnId ? { turnId } : {}),
    summary: "已思考",
    detail: {
      version: 1,
      source: "reasoning",
      reasoning: {
        text: projectedText(input.text),
        status: input.status || "complete",
        ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      },
      ...(turnId ? { turnId } : {}),
      ...(input.rawDetailText !== undefined ? { text: input.rawDetailText } : {}),
    },
  });
};

let win = null;
const navigations = [];

app.whenReady().then(async () => {
  win = new BrowserWindow({
    x: -4000,
    y: -4000,
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message });
  });
  wc.on("did-fail-load", (_event, code, description) => {
    report.console.push({ level: "did-fail-load", message: code + " " + description });
  });
  wc.on("will-navigate", (_event, url) => {
    navigations.push(String(url));
  });

  const js = (code) =>
    wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
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
    await js(
      `window.desktop.__smoke.emit(${JSON.stringify(channel)}, ${JSON.stringify(payload)})`,
    );
    await sleep(180);
  };
  const shot = async (name) => {
    // 隐藏窗口的合成器可能滞后一帧：先请求重绘，等待合成后再取图。
    wc.invalidate();
    await sleep(320);
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };

  try {
    await win.loadFile(ENTRY);
    await sleep(500);
    await waitFor(`!!document.querySelector('#root > .app-shell')`);
    // 隐藏窗口不产生新的合成帧（截图会滞后）；离屏显示但不抢焦点，保证截图对应当前 DOM。
    win.showInactive();
    await sleep(400);
    // 首次 capturePage 可能仍返回旧帧；先预热一次。
    await wc.capturePage();
    await sleep(120);
    await js(
      `window.__smokeCsp=[];document.addEventListener('securitypolicyviolation',(event)=>{window.__smokeCsp.push(event.violatedDirective+' '+event.blockedURI)})`,
    );
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await sleep(220);
    await js(`await window.__ansRenderer.selectRole('A')`);
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await sleep(200);

    // ————— 1. 实时：合并、时长、正文、顺序 —————
    await push("session:events", [
      envelope("A", {
        kind: "message",
        turnId: "T-R1",
        summary: "请分析",
        detail: { source: "prompt-input", text: "请分析这个问题" },
      }),
      reasoningEvent("A", { turnId: "T-R1", text: "甲段正文", durationMs: 2100 }),
      reasoningEvent("A", { turnId: "T-R1", text: "乙段正文", durationMs: 1900 }),
      envelope("A", { kind: "message", turnId: "T-R1", summary: "这是回答正文" }),
      envelope("A", {
        kind: "settled",
        turnId: "T-R1",
        summary: "本轮完成",
        detail: { outcome: "completed" },
      }),
    ]);
    const realtime = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="A"]');
      if (!pane) return { ok: false, reason: 'pane' };
      const rows = [...pane.querySelectorAll('.chat-row')];
      const kindOf = (row) => row.querySelector('.reasoning-row') ? 'reasoning'
        : row.querySelector('.msg-user') ? 'user'
        : row.querySelector('.msg-assistant') ? 'assistant'
        : row.querySelector('.turn-terminal') ? 'terminal'
        : 'other';
      const order = rows.map(kindOf);
      const reasoning = pane.querySelector('.reasoning-row[data-turn-id="T-R1"]');
      if (!reasoning) return { ok: false, reason: 'reasoning', order };
      const title = reasoning.querySelector('.tool-title')?.textContent || '';
      reasoning.open = true;
      const pre = reasoning.querySelector('pre.reasoning-text');
      return {
        ok: true,
        order,
        title,
        body: pre ? pre.textContent : null,
        count: pane.querySelectorAll('.reasoning-row').length,
        userIndex: order.indexOf('user'),
        reasoningIndex: order.indexOf('reasoning'),
        assistantIndex: order.indexOf('assistant'),
        terminalIndex: order.indexOf('terminal'),
      };
    })()`);
    check(
      "realtime: one merged reasoning row, summed seconds, arrival-order body",
      realtime.ok === true &&
        realtime.count === 1 &&
        realtime.title === "已思考 4 秒" &&
        realtime.body === "甲段正文\n\n乙段正文",
      realtime,
    );
    check(
      "realtime: reasoning row sits after user and before assistant/turn-terminal",
      realtime.userIndex >= 0 &&
        realtime.userIndex < realtime.reasoningIndex &&
        realtime.reasoningIndex < realtime.assistantIndex &&
        realtime.assistantIndex < realtime.terminalIndex,
      realtime,
    );
    await shot("01-realtime-reasoning");

    // ————— 2. 省略：标题与正文区如实说明，无假正文 —————
    await push("session:events", [
      envelope("A", {
        kind: "message",
        turnId: "T-R2",
        summary: "继续",
        detail: { source: "prompt-input", text: "继续" },
      }),
      reasoningEvent("A", {
        turnId: "T-R2",
        text: "",
        durationMs: 8000,
        status: "omitted",
      }),
      envelope("A", {
        kind: "settled",
        turnId: "T-R2",
        summary: "完成",
        detail: { outcome: "completed" },
      }),
    ]);
    const omitted = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="A"]');
      const row = pane && pane.querySelector('.reasoning-row[data-turn-id="T-R2"]');
      if (!row) return { ok: false };
      row.open = true;
      return {
        ok: true,
        title: row.querySelector('.tool-title')?.textContent || '',
        pre: !!row.querySelector('pre.reasoning-text'),
        note: row.querySelector('.reasoning-note')?.textContent || '',
        reasoningCount: pane.querySelectorAll('.reasoning-row').length,
      };
    })()`);
    check(
      "omitted: title says platform omitted, body shows fixed note and no <pre>",
      omitted.ok === true &&
        omitted.title === "已思考 8 秒（内容由平台省略）" &&
        omitted.pre === false &&
        omitted.note === "平台省略了思考正文，无法显示具体内容。" &&
        omitted.reasoningCount === 2,
      omitted,
    );
    await shot("02-omitted-reasoning");

    // ————— 3. 回归：delivery-note 系统行与工具行结构不变 —————
    await push("session:events", [
      envelope("A", {
        kind: "message",
        turnId: "T-R3",
        summary: "投递状态：已保存",
        detail: { source: "delivery-note" },
      }),
      envelope("A", {
        kind: "tool_call",
        turnId: "T-R4",
        summary: "调用工具 read_file",
        detail: {
          toolName: "read_file",
          toolCallId: "call-1",
          phase: "start",
          args: { path: "a.md" },
        },
      }),
    ]);
    const regression = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="A"]');
      const note = pane && pane.querySelector('.sys-delivery-note');
      const tools = pane ? [...pane.querySelectorAll('.tool-records:not(.reasoning-row)')].map((el) => el.textContent) : [];
      return {
        ok: true,
        note: note ? note.textContent : null,
        tools,
        reasoningCount: pane ? pane.querySelectorAll('.reasoning-row').length : -1,
      };
    })()`);
    check(
      "regression: delivery-note system row and tool row keep their structure",
      regression.note !== null &&
        regression.note.includes("投递状态：已保存") &&
        regression.tools.some((text) => text.includes("read_file")) &&
        regression.reasoningCount === 2,
      regression,
    );

    // ————— 4. 回放：row.reasoning 同解；缺载体回落；实时重推幂等 —————
    historyByRole.B = [
      { kind: "user", turnId: "T-H1", text: "历史提问", at: "2026-10-22T00:00:01Z" },
      {
        kind: "assistant",
        turnId: "T-H1",
        text: "已思考",
        eventKind: "message",
        at: "2026-10-22T00:00:02Z",
        reasoning: {
          text: projectedText("回放正文"),
          status: "complete",
          durationMs: 2500,
        },
      },
      {
        kind: "assistant",
        turnId: "T-H2",
        text: "已思考",
        eventKind: "message",
        at: "2026-10-22T00:00:03Z",
      },
      {
        kind: "assistant",
        turnId: "T-H1",
        text: "历史回答",
        at: "2026-10-22T00:00:04Z",
      },
    ];
    await js(`await window.__ansRenderer.selectRole('B')`);
    await sleep(280);
    const replay = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="B"]');
      if (!pane) return { ok: false, reason: 'pane' };
      const rows = [...pane.querySelectorAll('.chat-row')];
      const kindOf = (row) => row.querySelector('.reasoning-row') ? 'reasoning'
        : row.querySelector('.msg-user') ? 'user'
        : row.querySelector('.msg-assistant') ? 'assistant'
        : 'other';
      const order = rows.map(kindOf);
      const reasoning = pane.querySelector('.reasoning-row[data-turn-id="T-H1"]');
      if (!reasoning) return { ok: false, reason: 'reasoning', order };
      reasoning.open = true;
      return {
        ok: true,
        order,
        title: reasoning.querySelector('.tool-title')?.textContent || '',
        body: reasoning.querySelector('pre.reasoning-text')?.textContent || '',
        count: pane.querySelectorAll('.reasoning-row').length,
        fallback: rows.some((row) => row.querySelector('.msg-assistant')?.textContent?.trim() === "已思考"),
        reasoningIndex: order.indexOf('reasoning'),
        assistantIndexes: order.map((kind, index) => (kind === 'assistant' ? index : -1)).filter((index) => index >= 0),
      };
    })()`);
    check(
      "replay: row.reasoning renders one reasoning row with same label/body",
      replay.ok === true &&
        replay.count === 1 &&
        replay.title === "已思考 3 秒" &&
        replay.body === "回放正文",
      replay,
    );
    check(
      "replay: reasoning precedes the turn assistant text; carrier-less row falls back to assistant",
      replay.reasoningIndex >= 0 &&
        replay.assistantIndexes.some((index) => index > replay.reasoningIndex) &&
        replay.fallback === true,
      replay,
    );

    await push("session:events", [
      reasoningEvent("B", { turnId: "T-H1", text: "回放正文", durationMs: 2500 }),
    ]);
    const replayDedupe = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="B"]');
      const reasoning = pane.querySelector('.reasoning-row[data-turn-id="T-H1"]');
      return {
        count: pane.querySelectorAll('.reasoning-row').length,
        title: reasoning?.querySelector('.tool-title')?.textContent || '',
        body: reasoning?.querySelector('pre.reasoning-text')?.textContent || '',
      };
    })()`);
    check(
      "replay: same live piece does not duplicate text or duration",
      replayDedupe.count === 1 &&
        replayDedupe.title === "已思考 3 秒" &&
        replayDedupe.body === "回放正文",
      replayDedupe,
    );

    historyByRole.B = [
      ...historyByRole.B,
      {
        kind: "assistant",
        turnId: "T-H1",
        text: "历史补充",
        at: "2026-10-22T00:00:05Z",
      },
    ];
    await push("session:history", {
      roleId: "B",
      projectRoot: ROOT,
      runtime: "pi",
      rows: historyByRole.B,
    });
    const appendReplay = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="B"]');
      const reasoning = pane.querySelector('.reasoning-row[data-turn-id="T-H1"]');
      return {
        count: pane.querySelectorAll('.reasoning-row').length,
        body: reasoning?.querySelector('pre.reasoning-text')?.textContent || '',
        hasTail: pane.textContent.includes("历史补充"),
      };
    })()`);
    check(
      "incremental replay keeps one reasoning row and a single copy of the body",
      appendReplay.count === 1 &&
        appendReplay.body === "回放正文" &&
        appendReplay.hasTail === true,
      appendReplay,
    );
    await shot("03-replay-reasoning");

    // ————— 5. 坏件与无 turnId —————
    await js(`await window.__ansRenderer.selectRole('C')`);
    await sleep(240);
    await push("session:events", [
      envelope("C", {
        kind: "message",
        turnId: "T-C1",
        summary: "已思考",
        detail: {
          version: 1,
          source: "reasoning",
          reasoning: { text: "绝不显示的原始内容", status: "complete" },
          text: "绝不显示的原始内容",
        },
      }),
    ]);
    const bad = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="C"]');
      if (!pane) return { ok: false, reason: 'pane' };
      const text = pane.textContent;
      return {
        ok: true,
        diagnostic: [...pane.querySelectorAll('.sys-call')].some((el) => el.textContent.includes("推理内容无法安全显示")),
        leaked: text.includes("绝不显示的原始内容"),
        reasoningCount: pane.querySelectorAll('.reasoning-row').length,
      };
    })()`);
    check(
      "bad payload fails closed as diagnostic system row without leaking raw text",
      bad.ok === true &&
        bad.diagnostic === true &&
        bad.leaked === false &&
        bad.reasoningCount === 0,
      bad,
    );

    await push("session:events", [
      reasoningEvent("C", { text: "无轮次甲" }),
      reasoningEvent("C", { text: "无轮次乙" }),
    ]);
    const noTurn = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="C"]');
      const rows = [...pane.querySelectorAll('.reasoning-row')];
      return {
        count: rows.length,
        titles: rows.map((row) => row.querySelector('.tool-title')?.textContent || ''),
        bodies: rows.map((row) => row.querySelector('pre.reasoning-text')?.textContent || ''),
        turnIds: rows.map((row) => row.getAttribute('data-turn-id')),
      };
    })()`);
    check(
      "two no-turnId pieces stay separate rows in arrival order (no merge/reorder)",
      noTurn.count === 2 &&
        noTurn.titles[0] === "已思考" &&
        noTurn.titles[1] === "已思考" &&
        noTurn.bodies[0] === "无轮次甲" &&
        noTurn.bodies[1] === "无轮次乙" &&
        noTurn.turnIds.every((value) => value === null),
      noTurn,
    );

    // 全量回放重建：实时 reasoning 行须按 turnId 保留并插回该回合终态行之前，
    // 不得被统一追加到表尾（否则又会出现在「会话结束」之后）。
    await push("session:events", [
      envelope("C", {
        kind: "message",
        turnId: "T-C9",
        summary: "继续",
        detail: { source: "prompt-input", text: "继续" },
      }),
      reasoningEvent("C", { turnId: "T-C9", text: "保留正文", durationMs: 1200 }),
      envelope("C", {
        kind: "settled",
        turnId: "T-C9",
        summary: "完成",
        detail: { outcome: "completed" },
      }),
    ]);
    historyByRole.C = [
      { kind: "user", turnId: "T-C8", text: "历史C", at: "2026-10-22T01:00:00Z" },
    ];
    await push("session:history", {
      roleId: "C",
      projectRoot: ROOT,
      runtime: "pi",
      rows: historyByRole.C,
    });
    const rebuilt = await js(`(() => {
      const pane = document.querySelector('#chat .chat-pane[data-role-id="C"]');
      if (!pane) return { ok: false, reason: 'pane' };
      const rows = [...pane.querySelectorAll('.chat-row')];
      const kindOf = (row) => row.querySelector('.reasoning-row') ? 'reasoning'
        : row.querySelector('.msg-user') ? 'user'
        : row.querySelector('.msg-assistant') ? 'assistant'
        : row.querySelector('.turn-terminal') ? 'terminal'
        : 'other';
      const order = rows.map(kindOf);
      const reasoning = pane.querySelector('.reasoning-row[data-turn-id="T-C9"]');
      return {
        ok: true,
        order,
        count: pane.querySelectorAll('.reasoning-row[data-turn-id="T-C9"]').length,
        body: reasoning?.querySelector('pre.reasoning-text')?.textContent || '',
        reasoningIndex: order.indexOf('reasoning'),
        terminalIndex: order.lastIndexOf('terminal'),
        userIndex: order.indexOf('user'),
      };
    })()`);
    check(
      "full replay keeps live reasoning before its turn terminal (not appended at tail)",
      rebuilt.ok === true &&
        rebuilt.count === 1 &&
        rebuilt.body === "保留正文" &&
        rebuilt.userIndex >= 0 &&
        rebuilt.userIndex < rebuilt.reasoningIndex &&
        rebuilt.reasoningIndex < rebuilt.terminalIndex,
      rebuilt,
    );
    await shot("04-bad-and-no-turn");

    // ————— 6. 零 console.error / CSP —————
    const badConsole = report.console.filter(
      (item) => String(item.level) === "error" || item.level === 3,
    );
    const csp = await js(`window.__smokeCsp || []`);
    report.csp = csp;
    check("no console errors", badConsole.length === 0, badConsole);
    check("no CSP violations", csp.length === 0, csp);
    check("no unexpected navigation", navigations.length === 0, navigations);
  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("REASONING_SMOKE_ERROR", report.error);
  } finally {
    report.finished = true;
    report.at = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(
      "REASONING_SMOKE_DONE failures=" +
        report.failures +
        " checks=" +
        report.checks.length +
        " out=" +
        OUT,
    );
    app.exit(report.failures === 0 ? 0 : 1);
  }
});

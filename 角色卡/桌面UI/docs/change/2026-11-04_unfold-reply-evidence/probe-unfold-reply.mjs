#!/usr/bin/env node
/**
 * 2026-11-04 幕僚回复不再折叠（客户直修）：前后对比探针（真实 Electron 离线渲染）。
 *
 * 用法（仓库根）：
 *   ./node_modules/.bin/electron "角色卡/桌面UI/docs/change/2026-11-04_unfold-reply-evidence/probe-unfold-reply.mjs" before|after <outDir>
 *
 * 场景：一个有交付的轮次（user prompt -> delivery 投递 -> assistant 回复 -> settled）。
 * before 断言：settled 后 assistant 折成 details.reply-original（summary 为本轮交付处理回复原文（展开））。
 * after 断言：assistant 直接原文显示（无 details 包裹、无 reply-original）；task-request 折叠不变；回放一致。
 * 只读复用既有 test/桌面UI/phase4b-smoke-preload.cjs。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const PHASE = process.argv[2] === "after" ? "after" : "before";
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(HERE, PHASE);
const ENTRY = path.join(REPO, "app/renderer/dist/index.html");
const PRELOAD = path.join(REPO, "test/桌面UI/phase4b-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/probe-unfold-project";
const report = { phase: PHASE, checks: [], console: [], failures: 0, screenshots: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  if (value !== true) report.failures += 1;
  console.log("CHECK " + name + "=" + JSON.stringify(value) + (detail === undefined ? "" : " " + JSON.stringify(detail)));
  return value === true;
}
function listing() {
  return {
    projectRoot: ROOT,
    primaryRoleId: "P",
    hasRoles: true,
    warnings: [],
    governanceModel: "trio",
    governanceRecord: { state: "present" },
    roles: [
      {
        roleId: "P",
        cardText: "# P",
        cardPath: "",
        boundary: { entries: [] },
        boundaryPath: "",
        builtIn: false,
        changelog: null,
        docs: [],
      },
    ],
  };
}

const outer = (input, value) => ({ ok: true, version: 1, scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime }, value });

const handlers = {
  "app:recovery-state": () => ({}),
  "app:recovery-ready": () => ({ ok: true }),
  "app:list-project": () => listing(),
  "session:open": (_e, input) => ({ ok: true, resumed: true, contextSource: "resumed", runtime: input.runtime, projectRoot: input.projectRoot }),
  "session:history-get": (_e, input) => ({ projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime, rows: [], error: null, skipped: 0 }),
  "session:live-views": () => [],
  "session:stop": () => ({ ok: true }),
  "session:abort": (_e, input) => ({ ok: true, supported: true, ...input }),
  "session:send": () => ({ ok: true }),
  "shell:judge-get": () => ({ version: 1, ok: true, enabled: false }),
  "decision:judge-get": () => ({ version: 1, ok: true, enabled: false }),
  "runtime-config:get": (_e, input) => ({ runtime: input.runtime, label: input.runtime, path: ROOT + "/.env", revision: 0, application: "next-session", missingKeys: [], fields: [] }),
  "session:get-persistence": (_e, input) => outer(input, { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true }),
  "report:get-save-state": (_e, input) => outer(input, { state: "saved", reportId: input.reportId, retryAvailable: false }),
  "delivery:get-receipt": (_e, input) => outer(input, { state: "known", receipt: { version: 1, deliveryId: "probe-unfold-d1", attemptId: "probe-unfold-a1", turnId: "probe-unfold-turn", inputSaved: true, history: "saved", outcome: "completed", retryHistoryAvailable: false } }),
};
for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);

const TURN = "probe-unfold-turn";
const taskText = "PROBE-UNFOLD-TASK-MARKER 任务请求原文，应保持折叠。";
const replyText = "PROBE-UNFOLD-REPLY-MARKER 幕僚回复直接显示，不得折叠。";
const safeCopy = "PROBE-UNFOLD-SAFE-COPY-MARKER [REDACTED]";
const scope = { projectRoot: ROOT, roleId: "P", runtime: "pi" };
const deliveryInput = {
  source: "prompt-input",
  text: safeCopy,
  inputProvenance: { version: 1, kind: "handback", deliveryId: "probe-unfold-d1", attemptId: "probe-unfold-a1", target: { roleId: "P", runtime: "pi" }, reports: [] },
  inputTextProjection: { version: 1, source: "trusted-handback-display", modelInputRecorded: false, redacted: true, truncated: false, summaryTruncated: false },
};
const liveEvents = [
  { ...scope, event: { kind: "message", turnId: TURN, summary: "用户输入", detail: { source: "prompt-input", text: taskText } } },
  { ...scope, event: { kind: "message", turnId: TURN, summary: "交付投递", detail: deliveryInput } },
  { ...scope, event: { kind: "message", turnId: TURN, summary: replyText } },
  { ...scope, event: { kind: "settled", turnId: TURN, summary: "会话结束", detail: { outcome: "completed" } } },
];
const historyRows = [
  { kind: "user", turnId: TURN, text: taskText },
  { kind: "user", turnId: TURN, text: safeCopy, inputProvenance: deliveryInput.inputProvenance, inputTextProjection: deliveryInput.inputTextProjection },
  { kind: "assistant", turnId: TURN, text: replyText },
];
const factsExpr = `(()=>{
  const pane = document.querySelector("#chat .chat-pane") || document;
  const reply = [...pane.querySelectorAll(".msg-assistant")].find((x) => x.textContent.includes("PROBE-UNFOLD-REPLY-MARKER")) || null;
  const fold = reply ? reply.closest("details") : null;
  const task = [...pane.querySelectorAll("details.task-request")].find((x) => x.textContent.includes("PROBE-UNFOLD-TASK-MARKER")) || null;
  const delivery = [...pane.querySelectorAll(".msg-delivery")].find((x) => x.textContent.includes("PROBE-UNFOLD-SAFE-COPY-MARKER")) || null;
  const summaries = [...pane.querySelectorAll("details > summary")].map((x) => x.textContent);
  return {
    assistantFound: !!reply,
    assistantInsideFold: fold ? fold.className : null,
    assistantDirectVisible: !!reply && !fold,
    replyOriginalCount: pane.querySelectorAll("details.reply-original").length,
    replyOriginalLabels: [...pane.querySelectorAll("details.reply-original > summary")].map((x) => x.textContent),
    taskRequestCount: pane.querySelectorAll("details.task-request").length,
    taskRequestOpen: task ? task.open : null,
    taskRequestSummary: task ? task.querySelector(":scope > summary").textContent : null,
    taskRequestHasText: task ? task.textContent.includes("PROBE-UNFOLD-TASK-MARKER") : null,
    deliveryCardPresent: !!delivery,
    deliveryInsideFold: delivery && delivery.closest("details") ? delivery.closest("details").className : null,
    summaries,
  };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
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
  const js = (code) => wc.executeJavaScript(code.includes("await ") ? "(async()=>{" + code + "})()" : code, true);

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
    await js("window.desktop.__smoke.emit(" + JSON.stringify(channel) + ", " + JSON.stringify(payload) + ")");
    await sleep(90);
  };
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    wc.invalidate();
    await js("new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))").catch(() => undefined);
    await sleep(180);
    await wc.capturePage();
    await sleep(120);
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };
  const scrollTo = async (selector) => {
    await js("(()=>{const chat=document.getElementById(\"chat\");const el=document.querySelector(" + JSON.stringify(selector) + ");if(chat&&el){chat.scrollTop+=el.getBoundingClientRect().top-chat.getBoundingClientRect().top-24;}})()");
    await sleep(150);
  };
  try {
    await win.loadFile(ENTRY);
    await sleep(400);
    await waitFor("!!document.querySelector(\"#root > .app-shell\")");
    await js("await window.__ansRenderer.loadProject(" + JSON.stringify(ROOT) + ")");
    await sleep(160);
    await js("await window.__ansRenderer.selectRole(\"P\")");
    await sleep(140);
    await js("await window.__ansRenderer.selectRuntime(\"pi\")");
    await sleep(160);

    await push("session:events", liveEvents);
    await waitFor("[...document.querySelectorAll(\".msg-assistant\")].some((x)=>x.textContent.includes(\"PROBE-UNFOLD-REPLY-MARKER\"))");
    await sleep(200);

    const facts = await js(factsExpr);
    check("live delivery turn rendered", facts !== null && facts.assistantFound === true, facts);
    if (PHASE === "before") {
      check("before: settled delivery turn folds assistant reply", facts.replyOriginalCount === 1 && facts.assistantInsideFold === "reply-original" && facts.replyOriginalLabels[0] === "本轮交付处理回复原文（展开）", facts);
    } else {
      check("after: assistant reply displayed directly", facts.replyOriginalCount === 0 && facts.assistantDirectVisible === true && facts.assistantInsideFold === null && !facts.summaries.some((text) => text.includes("本轮交付处理回复原文") || text.includes("本轮角色回复原文")), facts);
    }
    check("task-request fold unchanged", facts.taskRequestCount === 1 && facts.taskRequestOpen === false && facts.taskRequestSummary === "任务请求原文" && facts.taskRequestHasText === true, facts);
    check("delivery card itself not folded", facts.deliveryCardPresent === true && facts.deliveryInsideFold === null, facts);

    await scrollTo(PHASE === "before" ? "#chat details.reply-original" : "#chat .msg-assistant");
    await shot("unfold-reply-" + PHASE);
    await scrollTo("#chat details.task-request");
    await shot("task-request-unchanged-" + PHASE);

    await push("session:history", { ...scope, rows: historyRows });
    await waitFor("[...document.querySelectorAll(\".msg-assistant\")].some((x)=>x.textContent.includes(\"PROBE-UNFOLD-REPLY-MARKER\"))");
    await sleep(200);
    const replayFacts = await js(factsExpr);
    if (PHASE === "before") {
      check("before replay: cold delivery turn still folds assistant reply", replayFacts.replyOriginalCount === 1 && replayFacts.assistantInsideFold === "reply-original" && replayFacts.taskRequestCount === 1, replayFacts);
    } else {
      check("after replay: cold delivery turn keeps assistant direct and task-request unchanged", replayFacts.replyOriginalCount === 0 && replayFacts.assistantDirectVisible === true && replayFacts.taskRequestCount === 1 && replayFacts.taskRequestOpen === false, replayFacts);
    }
    const errorConsole = report.console.filter((entry) => String(entry.level) === "error");
    check("zero console errors", errorConsole.length === 0, errorConsole);
  } catch (error) {
    report.console.push({ level: "probe", message: String(error && error.stack ? error.stack : error) });
    check("probe completed without exception", false, String(error));
  } finally {
    fs.writeFileSync(path.join(OUT, "probe-result.json"), JSON.stringify(report, null, 2));
    console.log("UNFOLD_REPLY_PROBE " + (report.failures === 0 ? "PASS" : "FAIL") + " " + report.checks.length + " checks / " + report.failures + " failures " + OUT);
    app.quit();
  }
});

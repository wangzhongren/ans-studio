// test/桌面应用/e2e/bench-storm.mjs —— Q-1/Q-2 量化台（独立、无人值守、逐阶段写盘不丢结果）。
//
// 运行：node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs
//   env BENCH_OUT=结果 JSON 路径（缺省 /tmp/ans-bench-result.json）
// 干的事（全程**离线**：stub desktop、无网络、无模型请求、无对话框）：
//   ① 加载**真实** app/renderer（index.html + 全部脚本）+ 极小 desktop 桩（contextIsolation:false，便于页面内计时）；
//   ② A 段：**逐个**推 300 个 session:event（≈改造前每事件一次 IPC 的热路径形态）——页面侧测每事件处理耗时
//      （总/最大）与 rAF 心跳**最长帧间隔**；
//   ③ B 段：同样 300 个事件**按批**推（`bench:events`，等价 16ms 合帧）——同测；
//   ④ Naive 段（**改造前机制代价**的可复现基线）：在真实 pane 上朴素循环 300×(建元素 + Markdown + append +
//      读 scrollHeight)，以及 2000×(建元素+Markdown+append)（旧回放形态）——测纯同步总耗时；
//   ⑤ 真实长转录：2000 行 D-1 回放（真实管线的**惰性**路径）耗时 + 滚到底耗时 + 挂载行数。
// 每个阶段即写盘；总超时 90s 强制退出并保留已写结果。
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_DIR = process.env.BENCH_RENDERER_DIR || path.resolve(HERE, "..", "..", "..", "app", "renderer");
const OUT = process.env.BENCH_OUT || path.join(os.tmpdir(), "ans-bench-result.json");
const result = { rendererDir: RENDERER_DIR, node: process.versions.node, electron: process.versions.electron, at: new Date().toISOString() };
const write = () => fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRELOAD = path.join(os.tmpdir(), "ans-bench-preload.cjs");
fs.writeFileSync(
  PRELOAD,
  `const { ipcRenderer } = require("electron");
const api = {
  pickProject: async () => null,
  listProject: async (root) => ({ projectRoot: String(root), roles: [{ roleId: "su", cardPath: "", boundaryPath: "", cardText: "# su", boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } }, builtIn: true, changelog: null, docs: [] }], warnings: [], hasRoles: true, primaryRoleId: "su" }),
  openSession: async () => ({ ok: true, config: { kind: "builtin-fallback", accepted: true, acceptanceSource: "bench", pinCount: 0 } }),
  sendSession: async () => ({ ok: true }),
  stopSession: async () => ({ ok: true }),
  listLiveSessions: async () => [],
  openExternal: async () => ({ ok: false, error: "bench" }),
  pickImage: async () => ({ ok: false, error: "bench" }),
  attachImage: async () => ({ ok: false, error: "bench" }),
  getPiConfig: async () => ({ path: "", fields: [] }),
  savePiConfig: async () => ({ ok: true, appliedKeys: [] }),
  onOperatorRequest: () => () => {},
  operatorRespond: async () => ({ ok: false, error: "bench" }),
  onShellConfirm: () => () => {},
  shellConfirmRespond: async () => ({ ok: false, expired: true }),
  onSessionEvent: (cb) => {
    ipcRenderer.on("bench:event", (_e, env) => { const t0 = performance.now(); cb(env); const t1 = performance.now(); window.__benchMaxHandler = Math.max(window.__benchMaxHandler || 0, t1 - t0); window.__benchHandlerTotal = (window.__benchHandlerTotal || 0) + (t1 - t0); return; });
    ipcRenderer.on("bench:events", (_e, arr) => { const t0 = performance.now(); cb(arr); const t1 = performance.now(); window.__benchMaxBatch = Math.max(window.__benchMaxBatch || 0, t1 - t0); window.__benchBatchTotal = (window.__benchBatchTotal || 0) + (t1 - t0); return; });
    return () => {};
  },
  onRoleState: (cb) => { ipcRenderer.on("bench:role-state", (_e, i) => cb(i)); return () => {}; },
  onSessionHistory: (cb) => { ipcRenderer.on("bench:history", (_e, p) => { window.__benchHistoryT0 = performance.now(); cb(p); window.__benchHistoryT1 = performance.now(); }); return () => {}; },
  onProjectChanged: () => () => {},
  minimizeWindow: async () => {}, toggleMaximize: async () => false, closeWindow: async () => {}, isMaximized: async () => false, onMaximizedChanged: () => () => {},
};
window.desktop = api; // contextIsolation:false——preload 与页面同上下文，直接赋值（页面内计时需要共享 window）
`
);

let win = null;
let stage = "init";
async function run() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: true,
    webPreferences: { preload: PRELOAD, contextIsolation: false, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  result.console = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (result.console.length < 40) result.console.push(String(level) + ": " + String(message).slice(0, 300));
  });
  stage = "loadFile";
  await win.loadFile(path.join(RENDERER_DIR, "index.html"));
  const wc = () => win.webContents;
  await sleep(600);

  // 页面就绪：选角色（挂载一个 pane）。
  stage = "loadProject";
  await wc().executeJavaScript(`window.__ansRenderer.loadProject("/bench")`);
  await sleep(300);
  stage = "selectRole";
  await wc().executeJavaScript(`window.__ansRenderer.selectRole("su")`);
  await sleep(400);
  await wc().executeJavaScript(`(() => { window.__benchMaxHandler = 0; window.__benchHandlerTotal = 0; window.__benchMaxBatch = 0; window.__benchBatchTotal = 0; })()`);

  const frameSampler = (ms) =>
    `(() => new Promise((resolve) => {
      const gaps = []; let last = performance.now(); const t0 = performance.now();
      const poke = () => { const t = performance.now(); gaps.push(t - last); last = t;
        if (t - t0 < ${ms}) requestAnimationFrame(poke);
        else resolve({ maxGap: Math.round(Math.max.apply(null, gaps) * 10) / 10, frames: gaps.length }); };
      requestAnimationFrame(poke);
    }))()`;

  // A 段：逐个推 300 个事件（每事件一次 IPC——改造前热路径形态）。
  const stormA = wc().executeJavaScript(frameSampler(1600));
  await sleep(120);
  const ev = (i) => ({ roleId: "su", event: { kind: "tool_call", summary: "read_file：read_file: docs/f" + i + ".md # 风暴行 " + i } });
  for (let i = 0; i < 300; i += 1) wc().send("bench:event", ev(i));
  result.stormA = await stormA;
  result.stormA_handler = await wc().executeJavaScript(`({ maxMs: Math.round(window.__benchMaxHandler*100)/100, totalMs: Math.round(window.__benchHandlerTotal*100)/100 })`);
  write();

  // B 段：同 300 事件按批推（≈16ms 合帧；3 批×100）。
  await wc().executeJavaScript(`(() => { window.__benchMaxHandler = 0; window.__benchHandlerTotal = 0; window.__benchMaxBatch = 0; window.__benchBatchTotal = 0; })()`);
  const stormB = wc().executeJavaScript(frameSampler(1600));
  await sleep(120);
  for (let c = 0; c < 3; c += 1) {
    const batch = [];
    for (let i = 0; i < 100; i += 1) batch.push(ev(c * 100 + i));
    wc().send("bench:events", batch);
    await sleep(20);
  }
  result.stormB = await stormB;
  result.stormB_handler = await wc().executeJavaScript(`({ maxBatchMs: Math.round(window.__benchMaxBatch*100)/100, totalBatchMs: Math.round(window.__benchBatchTotal*100)/100 })`);
  write();

  // Naive 段（改造前机制代价的可复现基线）：朴素循环建元素 + Markdown + append + 读 scrollHeight。
  result.naive = await wc().executeJavaScript(`(() => {
    const Md = window.ANSMarkdown; const pane = document.querySelector("#chat .chat-pane");
    const t0 = performance.now();
    for (let i = 0; i < 300; i += 1) {
      const d = document.createElement("div"); d.className = "msg msg-assistant";
      d.innerHTML = Md.renderMarkdown("（朴素基线）**工具行 " + i + "** 输出 \\n\\n- 一\\n- 二");
      pane.appendChild(d);
      void document.getElementById("chat").scrollHeight;
    }
    const t1 = performance.now();
    const t2 = performance.now();
    const frag = document.createElement("div");
    for (let i = 0; i < 2000; i += 1) {
      const d = document.createElement("div"); d.className = "msg msg-assistant";
      d.innerHTML = Md.renderMarkdown("（朴素基线·长转录）第 " + i + " 行 **bold** \`code\`");
      frag.appendChild(d);
    }
    const t3 = performance.now();
    return { storm300Ms: Math.round((t1 - t0) * 10) / 10, perEventAvgMs: Math.round(((t1 - t0) / 300) * 1000) / 1000, replay2000Ms: Math.round((t3 - t2) * 10) / 10 };
  })()`);
  write();

  // 真实长转录：2000 行 D-1 回放（真实管线惰性路径）+ 滚到底。
  const rows = [];
  for (let i = 0; i < 2000; i += 1) rows.push({ kind: i % 3 === 0 ? "tool" : "assistant", text: "（回放）第 " + i + " 行 **bold** `code`", at: "2026-10-12T00:00:00.000Z" });
  await wc().executeJavaScript(`(() => { window.__ansRenderer.loadProject("/bench2"); })()`);
  await sleep(300);
  // 先选角色再推回放（loadProject 会重置 pane）。
  await wc().executeJavaScript(`window.__ansRenderer.selectRole("su")`);
  await sleep(500);
  wc().send("bench:history", { roleId: "su", projectRoot: "/bench2", rows, error: null });
  await sleep(120);
  result.replay = await wc().executeJavaScript(`({ replayMs: Math.round((window.__benchHistoryT1 - window.__benchHistoryT0) * 10) / 10, mounted: document.querySelectorAll("#chat .chat-pane > *:not(.virt-spacer)").length, rows: (document.querySelectorAll("#chat .chat-pane > *:not(.virt-spacer)").length) })`);
  const scrollT = wc().executeJavaScript(`(() => new Promise((resolve) => { const c = document.getElementById("chat"); const t0 = performance.now(); c.scrollTop = c.scrollHeight; requestAnimationFrame(() => { requestAnimationFrame(() => resolve({ ms: Math.round((performance.now() - t0) * 10) / 10, mounted: document.querySelectorAll("#chat .chat-pane > *:not(.virt-spacer)").length })); }); }))()`);
  result.scrollToBottom = await scrollT;
  write();

  // 阶段⑥：D-1 回放的两条路径（诊断 e2e 的「su 首推之谜」）——pending（项目不符时寄存，落定后回放）vs direct。
  stage = "hist";
  await wc().executeJavaScript(`(() => { window.__ansRenderer.loadProject("/hb1"); })()`);
  await sleep(400);
  wc().send("bench:history", { roleId: "r1", projectRoot: "/hb2", rows: [{ kind: "user", text: "R1-PENDING", at: "x" }], error: null });
  wc().send("bench:history", { roleId: "r2", projectRoot: "/hb2", rows: [{ kind: "user", text: "R2-PENDING", at: "x" }], error: null });
  await sleep(100);
  await wc().executeJavaScript(`(() => { window.__ansRenderer.loadProject("/hb2"); })()`);
  await sleep(400);
  result.histPending = await wc().executeJavaScript(
    `({ r1: (window.__ansRenderer.state.roleMeta["r1"]||{}).restored === true, r2: (window.__ansRenderer.state.roleMeta["r2"]||{}).restored === true })`
  );
  wc().send("bench:history", { roleId: "r3", projectRoot: "/hb2", rows: [{ kind: "user", text: "R3-DIRECT", at: "x" }], error: null });
  await sleep(200);
  result.histDirect = await wc().executeJavaScript(`(window.__ansRenderer.state.roleMeta["r3"]||{}).restored === true`);
  write();
}

const hardTimeout = setTimeout(() => {
  result.timeout = true;
  write();
  app.exit(2);
}, 90000);

app.whenReady().then(async () => {
  try {
    await run();
    clearTimeout(hardTimeout);
    write();
    console.log("BENCH_DONE=1 OUT=" + OUT);
    app.exit(0);
  } catch (err) {
    result.stage = stage;
    result.error = String((err && err.stack) || err);
    clearTimeout(hardTimeout);
    write();
    console.log("BENCH_ERROR=" + result.error);
    app.exit(1);
  }
});

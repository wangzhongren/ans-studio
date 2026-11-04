// test/测试/download-requests-electron-probe.mjs
// D2（2026-11-04 download-requests）：真实 Electron 窗口 + 真实 preload/渲染器 + 真实
// customer-input 通道 + 真实 SessionManager/withRequestLifecycle + 真实 B1 下载 Pipeline
// + 真实 Provider（Node http/文件 sink/downloads.jsonl/epoch/指令账本），仅本地 HTTP 服务
// 与 presenter 回包为测试替身。不启动真实模型、不触外网、不改产品代码。
//
// 运行：node_modules/.bin/electron test/测试/download-requests-electron-probe.mjs
//   env ANS_D2_OUTDIR=证据输出目录（截图/report.json/probe.log）
//
// 场景（V1 §4.6）：卡片字段/批准/拒绝、judge 代批结果行、judge manual 转客户卡、
// 预授权 allow/once/deny/旧指令（G8 A）+ 面板标注、跨域重定向错误与重新申请、
// 大小超限清理、语言切换（AC-19）、关窗 fail-closed、审计归属。
// 截图：最多截图、无录屏；关闭 DEBUG 覆盖层（本 probe 不加载任何调试覆盖层）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, ipcMain } from "electron";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { createCustomerInputChannel } from "../../app/desktop/customer-input.ts";
import { createMainI18n } from "../../app/desktop/i18n.ts";
import { createCustomerDirectiveRuntime } from "../../src/pipeline/orchestration/customer-directive.ts";
import { createDownloadRequestRuntimeForTest } from "../../src/pipeline/orchestration/download-request.ts";
import { createNodeDownloadTransport } from "../../src/provider/download/impl/node-http.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { createDownloadLedger } from "../../src/provider/download/public/download-provider.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "app");
const RENDERER_ENTRY = path.join(APP, "renderer", "dist", "index.html");
const PRELOAD = path.join(APP, "preload.cjs");
const OUT = process.env.ANS_D2_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-d2-"));
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = path.join(OUT, "project");
fs.mkdirSync(path.join(ROOT, "角色卡", "worker"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "角色卡", "worker", "role-card.md"), "# 角色：worker\n\nD2 下载夹具角色。\n");
fs.writeFileSync(
  path.join(ROOT, "角色卡", "worker", "boundary.yaml"),
  "role: worker\nentries:\n  - kind: file\n    path: src/worker.ts\n    purpose: D2 fixture\n",
);

const LOG = [];
const REPORT = [];
const SHOTS = [];
const FAILURES = [];
const runLog = [];
function log(line) {
  const text = String(line);
  LOG.push(text);
  fs.appendFileSync(path.join(OUT, "probe.log"), text + "\n");
}
function result(name, ok, detail) {
  REPORT.push({ name, ok: ok === true, ...(detail !== undefined ? { detail } : {}) });
  log((ok === true ? "PASS " : "FAIL ") + name + (detail !== undefined ? " :: " + JSON.stringify(detail) : ""));
  if (ok !== true) FAILURES.push(name);
}
function check(name, value, detail) {
  result(name, value === true, value === true ? undefined : detail);
  if (value !== true) throw new Error("check failed: " + name);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// —————————————————————— 本地网络替身（真实 Provider 经 lookupOverride 钉到 127.0.0.1）——————————————————————
const PUBLIC_IP = "93.184.216.34";
const LOCAL_PINNED = [{ address: "127.0.0.1", family: 4 }];
const LOGICAL_HOST = "download.test";
let routeHandler = (_req, res) => {
  res.writeHead(200, { "content-type": "application/octet-stream" });
  res.end("D2-DEFAULT");
};
const server = http.createServer((req, res) => routeHandler(req, res));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const SERVER_PORT = server.address().port;
const url = (route, host = LOGICAL_HOST) => `http://${host}:${SERVER_PORT}${route}`;

/** DNS 替身：默认单一公网地址；`many.example.com` 返回 12 个公网地址（AC-3/AC-25 截断展示）。 */
const MANY_HOST = "many.example.com";
const MANY_IPS = [
  "93.184.216.34",
  "1.1.1.1",
  "8.8.8.8",
  "9.9.9.9",
  "149.112.112.112",
  "208.67.222.222",
  "208.67.220.220",
  "198.41.0.4",
  "199.9.14.201",
  "202.12.27.33",
  "192.33.4.12",
  "199.7.83.42",
];
const publicResolver = {
  async resolve(host) {
    if (host === MANY_HOST) {
      return { addresses: MANY_IPS.map((address) => ({ address, family: 4 })) };
    }
    return { addresses: [{ address: PUBLIC_IP, family: 4 }] };
  },
};
const realTransport = createNodeDownloadTransport({
  lookupOverride: (_hostname, options, callback) => {
    if (options && options.all === true) {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
      return;
    }
    callback(null, "127.0.0.1", 4);
  },
});
const localTransport = {
  async execute(request) {
    return realTransport.execute({
      ...request,
      pinnedAddresses: LOCAL_PINNED,
      onRedirect: async (info) => {
        const decision = await request.onRedirect(info);
        if (decision.action !== "follow") return decision;
        return { ...decision, pinnedAddresses: LOCAL_PINNED };
      },
    });
  },
};

// —————————————————————— 窗口与 IPC ——————————————————————
let win;
let channel;
let directiveRuntime;
let manager;
let openedInput;
let judgeGroupEnabled = false;
let judgeQueue = [];
let e2eLocale = "zh-CN";
let envProxy = { ...process.env };
let nextPickPath = ROOT;
const responsesFromRenderer = [];
const notices = [];

const i18n = createMainI18n("zh-CN");

function makeListing() {
  return {
    projectRoot: ROOT,
    primaryRoleId: "worker",
    hasRoles: true,
    warnings: [],
    governanceModel: "trio",
    roles: [
      {
        roleId: "worker",
        cardPath: path.join(ROOT, "角色卡", "worker", "role-card.md"),
        cardText: "# 角色：worker\n\nD2 下载夹具角色。\n",
        boundaryPath: path.join(ROOT, "角色卡", "worker", "boundary.yaml"),
        boundary: { entries: [] },
        changelog: null,
        docs: [],
      },
    ],
  };
}

const handlers = {
  "app:renderer-diagnostic": () => ({ ok: true }),
  "app:recovery-state": () => ({}),
  "app:recovery-ready": () => ({ ok: true }),
  "app:reload-interface": async () => ({ ok: true }),
  "app:list-project": (_e, input) => ({ ...makeListing(), projectRoot: input?.projectRoot || ROOT }),
  "app:pick-project": () => nextPickPath,
  "app:attach-image": (_e, input) => ({ ok: true, image: { name: input.name, mime: "image/png", size: 68 } }),
  "app:pick-image": () => ({ ok: false, error: "d2: image picker disabled" }),
  "window:minimize": () => ({ ok: true }),
  "window:toggle-maximize": () => ({ ok: true }),
  "window:close": () => ({ ok: true }),
  "window:is-maximized": () => false,
  "preferences:get": () => ({ version: 1, locale: e2eLocale, supported: ["zh-CN", "en-US"] }),
  "preferences:set-locale": (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, locale: e2eLocale, error: "invalid-sender" };
    const locale = input && typeof input === "object" && typeof input.locale === "string" ? input.locale : "";
    if (!["zh-CN", "en-US"].includes(locale)) return { ok: false, locale: e2eLocale, error: "invalid-locale" };
    e2eLocale = locale;
    i18n.setLocale(locale);
    if (!win.isDestroyed()) win.webContents.send("preferences:locale-changed", { locale });
    return { ok: true, locale };
  },
  "session:open": (_e, input) => { log("IPC session:open " + JSON.stringify({ projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime })); return ({ ok: true, resumed: true, contextSource: "resumed", runtime: input.runtime, projectRoot: input.projectRoot, profileRevision: 0 }); },
  "session:live": () => ["worker"],
  "session:stop": () => ({ ok: true }),
  "session:history-get": (_e, input) => ({ ...input, rows: [], error: null, skipped: 0 }),
  "session:live-views": () => [{ projectRoot: ROOT, roleId: "worker", runtime: "pi" }],
  "session:abort": () => ({ ok: true, supported: true }),
  "session:send": () => ({ ok: true }),
  "session:withdraw": () => ({ ok: false, error: "d2: withdraw disabled" }),
  "session:role-states": () => ({ ok: true }),
  "network:get-state": () => ({ online: true, source: "main-net", at: Date.now(), stableForMs: 0, reason: "probe" }),
  "network:renderer-state": () => ({ ok: true }),
  "background-tasks:list": () => ({ ok: true, unavailable: true, tasks: [] }),
  "background-tasks:read": () => ({ ok: false, error: "d2: background tasks disabled" }),
  "background-tasks:stop": () => ({ ok: false, error: "d2: background tasks disabled" }),
  "tasks:list": () => ({ ok: true, tasks: [], errors: [] }),
  "tasks:close": () => ({ ok: false, error: "d2: tasks disabled" }),
  "tasks:redispatch": () => ({ ok: false, error: "d2: tasks disabled" }),
  "tasks:restore": () => ({ ok: false, error: "d2: tasks disabled" }),
  "project-state:get": () => ({ version: 1, projectRoot: ROOT, state: null, errors: [] }),
  "roles:activity-log": () => ({ ok: true, rows: [] }),
  "roles:terminate": () => ({ ok: false, error: "d2: roles disabled" }),
  "run:change-request": () => ({ ok: false, error: "d2: run-change disabled" }),
  "shell:judge-pause": () => ({ ok: true, paused: false }),
  "app:open-external": () => ({ ok: true }),
  "session:get-persistence": (_e, input) => ({ ok: true, version: 1, scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime }, value: { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true } }),
  "session:operator-response": (_e, input) => {
    responsesFromRenderer.push(input);
    if (input && typeof input === "object" && typeof input.id === "string") {
      channel.respond(input);
      return { ok: true };
    }
    return { ok: false, error: "d2: invalid response" };
  },
  "session:operator-judge": () => ({ ok: true }),
  "directive:list": async () => {
    const listed = await directiveRuntime.list();
    if (!listed.ok) return { ok: false, error: listed.error };
    return { version: 1, directivesEnabled: true, projectRoot: ROOT, approval: listed.approval, decision: listed.decision, ledgerErrors: listed.ledgerErrors };
  },
  "directive:revoke": () => ({ ok: false, error: "d2: revoke disabled" }),
  "directive:confirm-response": () => ({ ok: false, error: "d2: directive submit disabled" }),
  "runtime-config:get": (_e, input) => ({ runtime: input.runtime, label: input.runtime, path: path.join(ROOT, ".env"), revision: 0, application: "next-session", missingKeys: [], fields: [] }),
  "runtime-config:save": () => ({ ok: true, revision: 1 }),
  "pi-config:get": () => ({ path: path.join(ROOT, ".env"), fields: [] }),
  "pi-config:save": () => ({ ok: true, appliedKeys: [] }),
  "shell:confirm-response": () => ({ ok: true }),
  "shell:judge-get": () => ({ version: 1, ok: true, enabled: false }),
  "shell:judge-set": () => ({ version: 1, ok: true, enabled: false }),
  "decision:judge-get": () => ({ version: 1, ok: true, enabled: false }),
  "decision:judge-set": () => ({ version: 1, ok: true, enabled: false }),
  "report:get-save-state": (_e, input) => ({ ok: true, version: 1, scope: {}, value: { state: "saved", reportId: input.reportId, retryAvailable: false } }),
  "report:retry-save": () => ({ ok: false, error: "d2: report save disabled" }),
  "delivery:get-receipt": () => ({ ok: true, version: 1, scope: {}, value: { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false } }),
  "delivery:retry-history-save": () => ({ ok: false, error: "d2: history save disabled" }),
  "project:document-read": () => ({ ok: false, version: 1, documentId: "", projectViewId: "", code: "d2-disabled", message: "d2: documents disabled" }),
};

function registerHandlers() {
  for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") log("[renderer-console] " + event.message);
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (target !== win.webContents.getURL()) {
      event.preventDefault();
      log("NAVIGATION_BLOCKED " + target);
    }
  });
}

const js = (code) =>
  win.webContents.executeJavaScript(code.includes("await ") ? "(async()=>{" + code + "})()" : code);

async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return true;
    } catch {
      /* 页面切换期忽略 */
    }
    await sleep(40);
  }
  throw new Error("timeout waiting for " + label);
}

async function shot(name) {
  const image = await win.webContents.capturePage();
  const file = path.join(OUT, name + ".png");
  fs.writeFileSync(file, image.toPNG());
  const size = win.getContentSize();
  SHOTS.push({ name, file, sha256: sha256File(file), bytes: fs.statSync(file).size, window: { width: size[0], height: size[1] } });
  log("SHOT " + name + " " + file + " " + SHOTS[SHOTS.length - 1].sha256);
}

function makeDirectiveRuntime(clockRef) {
  return createCustomerDirectiveRuntime({
    projectRoot: ROOT,
    sessionId: "d2-directive-session",
    present: {
      present: async (request) => {
        const host = /domain=([^\s]+)/.exec(request.rawText)?.[1];
        const action =
          host !== undefined
            ? {
                kind: request.rawText.includes("拒绝") ? "deny" : "allow",
                resource: { type: "domain", host, wildcard: host === "*" || host.startsWith("*.") },
              }
            : request.prefill.action;
        return {
          decision: "confirm",
          values: {
            action,
            scope: request.prefill.scope,
            until: request.prefill.until,
            ...(request.highRisk.reasons.length > 0 ? { acknowledged: true } : {}),
          },
        };
      },
    },
    now: () => clockRef.value,
  });
}

async function submitDomain(rawText) {
  const res = await directiveRuntime.submitFromInput({
    rawText,
    target: "approval",
    projectRoot: ROOT,
    roleId: "worker",
    decisionGroupEnabled: true,
  });
  check("directive submit: " + rawText, res.ok === true, res);
  return res;
}

function makeManager() {
  const channelForSession = channel;
  manager = new SessionManager({
    openRoleSession: async (input) => {
      openedInput = input;
      return {
        async send() {},
        events() {
          return { [Symbol.asyncIterator]() { return { async next() { return { value: undefined, done: true }; } }; } };
        },
        async dispose() {},
      };
    },
    createPiAdapterFactory: () => (gate) => createFakeRuntimeAdapter({ gate, script: [] }),
    createDemoAdapter: () => ({}),
    buildProjectConfig,
    getListing: (candidate) => (candidate === ROOT ? makeListing() : undefined),
    emitEvent: (envelope) => {
      const event = envelope.event || {};
      if (event.kind === "message" && event.detail && event.detail.source === "delivery-note") {
        notices.push(event.summary || "");
      }
      if (win && !win.isDestroyed()) win.webContents.send("session:event", envelope);
    },
    emitRoleState: (info) => {
      if (win && !win.isDestroyed()) win.webContents.send("session:role-state", { ...info, projectRoot: ROOT, roleId: info.roleId || "worker", runtime: "pi" });
    },
    customerInput: (request, context, metadata) => channelForSession.customerInput(request, context, metadata),
    downloadAppVersion: "1.9.2-d2",
    getDownloadDirectiveConsumer: (projectRoot) =>
      projectRoot === ROOT ? (query) => directiveRuntime.takeDownloadDirective(query) : undefined,
    createDownloadRuntime: (input) =>
      createDownloadRequestRuntimeForTest(
        { ...input, env: envProxy },
        { resolver: publicResolver, provider: localTransport },
      ),
    createGovernanceJudge: () => async (request) => {
      const next = judgeQueue.shift();
      if (next !== undefined) return next;
      return { verdict: "approve", group: "approval", cardKind: "download", reasonCode: "approved", engine: "demo", value: { confirmed: true } };
    },
  });
}

async function openWorker() {
  const opened = await manager.open({ projectRoot: ROOT, roleId: "worker", runtime: "pi" });
  if (!opened.ok) throw new Error("session open failed: " + opened.error);
  if (typeof openedInput?.requestDownload !== "function") throw new Error("requestDownload 未注入");
  return openedInput.requestDownload;
}

async function selectWorker() {
  await js(
    `await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRuntime('pi');await window.__ansRenderer.selectRole('worker')`,
  );
  await sleep(200);
}

async function readLedger() {
  return createDownloadLedger(ROOT).read();
}
async function readTasks() {
  return readTaskState(ROOT);
}
function listDownloadDir() {
  try {
    return fs.readdirSync(path.join(ROOT, "download")).sort();
  } catch {
    return [];
  }
}

function dialogText() {
  return js(`(()=>{const d=document.querySelector('#decision-dialog');return d?{title:d.querySelector('.dd-title')?.textContent||'',kind:d.querySelector('.dd-kind')?.textContent||'',preview:d.querySelector('.dd-preview')?.textContent||'',judge:d.querySelector('.dd-judge')?.textContent||'',confirm:!!d.querySelector('.dd-confirm'),reject:!!d.querySelector('.dd-reject')}:null})()`);
}
async function waitDialog() {
  await waitFor(async () => (await dialogText()) !== null, "decision dialog");
  return dialogText();
}
async function clickConfirm() {
  await js(`document.querySelector('#decision-dialog .dd-confirm').click()`);
}
async function clickReject() {
  await js(`document.querySelector('#decision-dialog .dd-reject').click()`);
}

function requireToolResult(toolResult, okExpected, codeExpected, label) {
  if (okExpected) {
    result("tool result ok: " + label, toolResult && toolResult.ok === true, toolResult && toolResult.ok === false ? { code: toolResult.code } : undefined);
    return;
  }
  result("tool result fail: " + label, toolResult && toolResult.ok === false && (codeExpected === undefined || toolResult.code === codeExpected), toolResult && toolResult.ok === false ? { code: toolResult.code } : { ok: toolResult && toolResult.ok });
}

async function main() {
  if (!fs.existsSync(RENDERER_ENTRY)) throw new Error("renderer 构建产物缺失（先 npm run build:renderer）：" + RENDERER_ENTRY);
  log("ELECTRON=" + process.versions.electron + " NODE=" + process.versions.node + " CHROME=" + process.versions.chrome);
  log("ROOT=" + ROOT + " OUT=" + OUT);

  channel = createCustomerInputChannel({
    presenter: (payload) => {
      log("CHANNEL PRESENT " + JSON.stringify({ id: payload && payload.id, roleId: payload && payload.roleId, projectRoot: payload && payload.projectRoot, cardKind: payload && payload.request && payload.request.cardKind }));
      if (win && !win.isDestroyed()) win.webContents.send("session:operator-request", payload);
    },
    operatorId: "d2-customer",
    judge: { isGroupEnabled: () => judgeGroupEnabled },
    emitJudgeResult: (payload) => {
      if (win && !win.isDestroyed()) win.webContents.send("session:operator-judge", payload);
    },
  });
  let clockRef = { value: new Date("2026-06-01T00:00:00.000Z") };
  directiveRuntime = makeDirectiveRuntime(clockRef);

  await app.whenReady();
  // D2：关窗 fail-closed 场景需要窗口销毁后进程继续完成断言与报告（默认 window-all-closed 会退出）。
  app.on("window-all-closed", () => {
    log("window-all-closed (probe keeps running for assertions)");
  });
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    frame: false,
    show: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  registerHandlers();
  await win.loadFile(RENDERER_ENTRY);
  await sleep(400);
  await selectWorker();
  makeManager();
  win.on("closed", () => {
    void manager.stop(null);
  });
  let requestDownload = await openWorker();
  const srv = url;

  // ————— 场景 1：客户卡片字段 + 批准（截图）—————
  routeHandler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/pdf" });
    res.end("D2-DOWNLOAD-CONTENT");
  };
  judgeGroupEnabled = false;
  const p1 = requestDownload({ url: srv("/report.pdf"), purpose: "下载周报" }, { toolCallId: "d2-card-1", turnId: "d2-turn-1" });
  p1.then((r) => log("P1_RESULT " + JSON.stringify({ ok: r && r.ok, code: r && r.code })), (e) => log("P1_THROW " + e));
  const card1 = await waitDialog();
  result("card title 下载文件申请", card1.title === "下载文件申请", card1.title);
  result("card kind badge download", card1.kind === "download", card1.kind);
  for (const token of ["申请角色：worker", "用途：下载周报", url("/report.pdf"), "download.test", PUBLIC_IP, "report.pdf", "100 MB", "仅同域", "协议校验", "主机校验", "解析 IP 校验"]) {
    result("card field: " + token, card1.preview.includes(token), card1.preview.slice(0, 600));
  }
  await shot("01-download-card-customer");
  await clickConfirm();
  const r1 = await p1;
  requireToolResult(r1, true, undefined, "customer approve");
  check("downloaded file content", fs.readFileSync(path.join(ROOT, "download", "report.pdf"), "utf8") === "D2-DOWNLOAD-CONTENT");
  await waitFor(async () => (await js(`document.querySelector('#chat').textContent`)).includes("download/report.pdf"), "completion notice");
  await shot("02-download-completed-customer");
  const led1 = await readLedger();
  const dec1 = led1.events.filter((e) => e.kind === "download.decided" && e.requestId !== undefined);
  result("audit: customer decided with requestId", dec1.length >= 1 && dec1.every((e) => e.by === "customer"), dec1.slice(0, 2));
  const tasks1 = await readTasks();
  const created1 = tasks1.events.find((e) => e.kind === "request.created" && (e.toolCallId === "d2-card-1" || (e.requestId && dec1.some((d) => d.requestId === e.requestId))));
  const presented1 = tasks1.events.find((e) => e.kind === "request.presented" && e.requestId === (created1 && created1.requestId));
  const resolved1 = tasks1.events.find((e) => e.kind === "request.resolved" && e.requestId === (created1 && created1.requestId));
  result("audit: request.created/presented/resolved (customer)", created1 !== undefined && presented1 !== undefined && resolved1 !== undefined && presented1.to === "customer" && resolved1.by === "customer", { created1, presented1, resolved1 });

  // ————— 场景 2：拒绝（截图卡片）—————
  const p2 = requestDownload({ url: srv("/declined.pdf"), purpose: "拒绝示例" }, { toolCallId: "d2-card-2" });
  const card2 = await waitDialog();
  result("decline card shown", card2.preview.includes("declined.pdf"), card2.preview.slice(0, 200));
  await shot("03-download-card-declined");
  await clickReject();
  const r2 = await p2;
  requireToolResult(r2, false, "download-declined", "customer decline");
  result("declined leaves no file", !listDownloadDir().includes("declined.pdf"), listDownloadDir());

  // ————— 场景 3：judge 代批（结果行截图）—————
  judgeGroupEnabled = true;
  judgeQueue = [{ verdict: "approve", group: "approval", cardKind: "download", reasonCode: "sufficient", engine: "demo", value: { confirmed: true } }];
  const p3 = requestDownload({ url: srv("/judge.pdf"), purpose: "判断代批" }, { toolCallId: "d2-judge-1" });
  const r3 = await p3;
  requireToolResult(r3, true, undefined, "judge approve");
  result("judge approve shows no customer dialog", (await dialogText()) === null);
  await waitFor(async () => (await js(`document.querySelectorAll('#chat .governance-judge-row').length`)) >= 1, "judge result row");
  const judgeRow = await js(`(()=>{const row=[...document.querySelectorAll('#chat .governance-judge-row')].find(x=>x.dataset.toolCallId==='d2-judge-1')||document.querySelector('#chat .governance-judge-row');return row?row.textContent:''})()`);
  result("judge result row visible with judge attribution", judgeRow.includes("judge") || judgeRow.includes("代批"), judgeRow);
  await shot("04-judge-result-row");
  const tasks3 = await readTasks();
  const resolved3 = tasks3.events.filter((e) => e.kind === "request.resolved" && e.by === "judge");
  result("audit: judge presented/resolved by judge", tasks3.events.some((e) => e.kind === "request.presented" && e.to === "judge") && resolved3.length >= 1, resolved3.slice(0, 2));
  const led3 = await readLedger();
  result("audit: downloads.jsonl by judge", led3.events.some((e) => e.kind === "download.decided" && e.by === "judge" && e.judge && e.judge.reasonCode === "sufficient"), led3.events.filter((e) => e.kind === "download.decided").slice(-2));

  // ————— 场景 4：judge manual → 客户卡 + judgeNotice —————
  judgeQueue = [{ verdict: "manual", group: "approval", cardKind: "download", reasonCode: "timeout", engine: "demo", reason: "无法判断" }];
  const p4 = requestDownload({ url: srv("/manual.pdf"), purpose: "manual 示例" }, { toolCallId: "d2-judge-2" });
  const card4 = await waitDialog();
  result("manual card carries judgeNotice", card4.judge !== "" && /手动确认|自动代理未代批/.test(card4.judge), card4.judge);
  await shot("05-judge-manual-customer-card");
  await clickConfirm();
  const r4 = await p4;
  requireToolResult(r4, true, undefined, "manual fallback approve");
  const tasks4 = await readTasks();
  const resolved4 = tasks4.events.filter((e) => e.kind === "request.resolved" && e.by === "customer");
  result("manual fallback resolved by customer", resolved4.length >= 1, resolved4.slice(-1));

  // ————— 场景 5：预授权（allow / once / deny / 旧指令）+ 面板标注 —————
  judgeGroupEnabled = false;
  const nowMs = Date.now();
  clockRef.value = new Date(nowMs - 24 * 60 * 60 * 1000); // 旧指令（早于 epoch）
  await submitDomain("@审批 允许联网 domain=legacy.example.com until=session");
  clockRef.value = new Date(nowMs + 5 * 60 * 1000); // 新指令（晚于 epoch）
  await submitDomain("@审批 允许联网 domain=preauth.example.com until=session");
  await submitDomain("@审批 允许联网 domain=once.example.com until=once");
  await submitDomain("@审批 拒绝联网 domain=deny.example.com until=session");
  await submitDomain("@审批 允许联网 domain=deny.example.com until=session");

  const p5a = requestDownload({ url: srv("/preauth.bin", "preauth.example.com"), purpose: "预授权" }, { toolCallId: "d2-preauth-1" });
  const r5a = await p5a;
  requireToolResult(r5a, true, undefined, "preauth allow");
  result("preauth allow shows no customer dialog", (await dialogText()) === null);
  const led5a = await readLedger();
  result("audit: preauth by directive (no requestId)", led5a.events.some((e) => e.kind === "download.decided" && e.by === "directive" && e.requestId === undefined && typeof e.directiveId === "string"), led5a.events.filter((e) => e.kind === "download.decided").slice(-2));
  const tasks5 = await readTasks();
  const preauthToolRequestIds = tasks5.events.filter((e) => e.kind === "request.created" && e.toolCallId === "d2-preauth-1");
  result("audit: preauth path has zero request.*", preauthToolRequestIds.length === 0, preauthToolRequestIds);

  // 面板标注：推真实 directive:state（真实 list()），打开面板断言「消费者：下载」与旧指令标注。
  const listed = await directiveRuntime.list();
  if (listed.ok) {
    win.webContents.send("directive:state", { version: 1, directivesEnabled: true, projectRoot: ROOT, approval: listed.approval, decision: listed.decision, ledgerErrors: listed.ledgerErrors });
    await sleep(200);
    await js(`document.getElementById('btn-directive-panel').click()`);
    await waitFor(async () => (await js(`document.getElementById('directive-panel') !== null`)), "directive panel");
    const panelText = await js(`document.getElementById('directive-panel').textContent`);
    result("panel: new directive shows consumer 下载", panelText.includes("消费者：下载"), panelText.slice(0, 400));
    result("panel: legacy directive marked not applying to downloads", panelText.includes("不作用于下载（早于下载功能启用）"), panelText.slice(0, 400));
    await shot("06-directive-panel-consumers");
    await js(`document.getElementById('directive-panel-close').click()`);
    await sleep(120);
  } else {
    result("directive list available for panel", false, listed);
  }

  // once：第二次回审批。
  const once1 = await requestDownload({ url: srv("/once1.bin", "once.example.com"), purpose: "once 第一次" }, { toolCallId: "d2-once-1" });
  requireToolResult(once1, true, undefined, "once first");
  const p5b = requestDownload({ url: srv("/once2.bin", "once.example.com"), purpose: "once 第二次" }, { toolCallId: "d2-once-2" });
  const card5b = await waitDialog();
  result("once second time returns to approval", card5b.preview.includes("once.example.com"), card5b.preview.slice(0, 200));
  await clickConfirm();
  const once2 = await p5b;
  requireToolResult(once2, true, undefined, "once second approved by customer");

  // deny 优先。
  const deny1 = await requestDownload({ url: srv("/deny.bin", "deny.example.com"), purpose: "deny" }, { toolCallId: "d2-deny-1" });
  requireToolResult(deny1, false, "download-denied-by-directive", "deny priority");
  result("deny shows no customer dialog", (await dialogText()) === null);

  // G8 A 旧指令不授权：卡片路径。
  const p5c = requestDownload({ url: srv("/legacy.bin", "legacy.example.com"), purpose: "旧指令" }, { toolCallId: "d2-legacy-1" });
  const card5c = await waitDialog();
  result("legacy directive does not authorize (customer card)", card5c.preview.includes("legacy.example.com"), card5c.preview.slice(0, 200));
  await clickReject();
  const legacy = await p5c;
  requireToolResult(legacy, false, "download-declined", "legacy card decline");

  // ————— 场景 6：跨域重定向错误 + 重新申请 —————
  routeHandler = (req, res) => {
    if (req.url === "/jump.bin") {
      res.writeHead(302, { location: url("/final.bin", "other.test") });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("D2-FINAL");
  };
  const jumpPending = requestDownload({ url: srv("/jump.bin"), purpose: "跨域" }, { toolCallId: "d2-jump-1" });
  const jumpCard = await waitDialog();
  result("redirect request card shown before execution", jumpCard.preview.includes("jump.bin"), jumpCard.preview.slice(0, 200));
  await clickConfirm();
  const jump = await jumpPending;
  requireToolResult(jump, false, "download-redirect-cross-host", "cross-host redirect");
  result("cross-host redirect leaves no file", listDownloadDir().length === 0 || !listDownloadDir().some((n) => n.includes("jump")), listDownloadDir());
  await waitFor(async () => notices.some((n) => n.includes("跨域") || n.includes("重定向")), "redirect failure notice");
  result("redirect failure notice names cross-host reason", notices.some((n) => n.includes("跨域") || n.includes("重定向")), notices.slice(-3));
  const p6 = requestDownload({ url: srv("/final.bin", "other.test"), purpose: "重新申请" }, { toolCallId: "d2-jump-2" });
  const card6 = await waitDialog();
  result("re-request card shown for target host", card6.preview.includes("other.test"), card6.preview.slice(0, 200));
  await shot("07-redirect-re-request-card");
  await clickConfirm();
  const retry = await p6;
  requireToolResult(retry, true, undefined, "re-request success");
  check("re-request downloaded file", fs.readFileSync(path.join(ROOT, "download", "final.bin"), "utf8") === "D2-FINAL");

  // ————— 场景 7：大小超限清理（新会话，小上限）—————
  await manager.stop(null);
  envProxy = { ...process.env, ANS_DOWNLOAD_MAX_BYTES: "16" };
  requestDownload = await openWorker();
  routeHandler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(Buffer.alloc(100, 0x62));
  };
  const p7 = requestDownload({ url: srv("/big.bin"), purpose: "超限" }, { toolCallId: "d2-big-1" });
  await waitDialog();
  await clickConfirm();
  const big = await p7;
  requireToolResult(big, false, "download-too-large", "size limit");
  const afterBig = listDownloadDir();
  result("size limit cleans placeholder/temp (no big.bin/.part)", !afterBig.some((n) => n.includes("big") || n.endsWith(".part")), afterBig);
  await waitFor(async () => notices.some((n) => n.includes("上限") || n.includes("过大") || n.includes("100 MB")), "too-large notice");
  result("too-large failure notice shown", notices.some((n) => n.includes("上限") || n.includes("过大")), notices.slice(-3));

  // ————— 场景 8：语言切换（AC-19）—————
  envProxy = { ...process.env };
  await manager.stop(null);
  requestDownload = await openWorker();
  routeHandler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("D2-I18N");
  };
  i18n.setLocale("en-US");
  win.webContents.send("preferences:locale-changed", { locale: "en-US" });
  e2eLocale = "en-US";
  await sleep(300);
  const p8 = requestDownload({ url: srv("/i18n.bin"), purpose: "weekly report" }, { toolCallId: "d2-i18n-1" });
  const card8 = await waitDialog();
  result("i18n: English card title", card8.title === "Download request", card8.title);
  result("i18n: English card fields", card8.preview.includes("Requesting role: worker") && card8.preview.includes("Purpose: weekly report"), card8.preview.slice(0, 400));
  const buttons8 = await js(`(()=>({confirm:document.querySelector('#decision-dialog .dd-confirm')?.textContent||'',reject:document.querySelector('#decision-dialog .dd-reject')?.textContent||''}))()`);
  result("i18n: English action buttons", buttons8.confirm !== "" && /Confirm|Approve/i.test(buttons8.confirm), buttons8);
  await shot("08-card-english");
  await clickConfirm();
  const r8 = await p8;
  requireToolResult(r8, true, undefined, "i18n card approve");
  i18n.setLocale("zh-CN");
  win.webContents.send("preferences:locale-changed", { locale: "zh-CN" });
  e2eLocale = "zh-CN";
  await sleep(200);

  // ————— 场景 8b：>8 解析结果截断展示（AC-3/AC-25 截图子句）—————
  routeHandler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("D2-MANY");
  };
  const manyPending = requestDownload({ url: srv("/many.bin", MANY_HOST), purpose: "多 IP 截断" }, { toolCallId: "d2-many-1" });
  const cardMany = await waitDialog();
  result(
    "card shows truncated resolved IPs line (共 12 个，仅显示前 8 个)",
    cardMany.preview.includes("共 12 个，仅显示前 8 个"),
    cardMany.preview.slice(0, 900),
  );
  for (const [index, ip] of MANY_IPS.entries()) {
    if (index < 8) {
      result(`card shows resolved ip #${index + 1} (${ip})`, cardMany.preview.includes(ip), cardMany.preview.slice(0, 600));
    } else {
      result(`card hides beyond-8 resolved ip #${index + 1} (${ip})`, !cardMany.preview.includes(ip), cardMany.preview.slice(0, 600));
    }
  }
  await shot("09-card-resolved-ips-truncated");
  await clickReject();
  const many = await manyPending;
  requireToolResult(many, false, "download-declined", "many-ips card decline");

  // ————— 场景 8c：shell 卡与下载卡共存（AC-22 裁定 A：仅 customer-input 队列；无跨通道仲裁）—————
  routeHandler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("D2-COEXIST");
  };
  const coexistPending = requestDownload({ url: srv("/coexist.bin"), purpose: "共存" }, { toolCallId: "d2-coexist-1" });
  let coexistSettled = false;
  coexistPending.then(
    () => {
      coexistSettled = true;
    },
    () => {
      coexistSettled = true;
    },
  );
  const coexistCard = await waitDialog();
  result("download card visible before shell card", coexistCard.preview.includes("coexist.bin"), coexistCard.preview.slice(0, 200));
  win.webContents.send("shell:confirm-request", {
    projectRoot: ROOT,
    roleId: "worker",
    runtime: "pi",
    id: "d2-shell-1",
    policy: "project",
    command: "echo coexist",
    summary: "共存 shell 卡",
    reasonPlain: "项目角色原因原文",
    reasonRaw: "项目审核原文",
    cwd: ROOT,
    argvLines: ["echo", "coexist"],
  });
  await waitFor(async () => (await js(`!document.getElementById('shell-confirm').hidden`)), "shell card");
  const shellState = await js(`(()=>({download:document.querySelector('#decision-dialog')!==null,shell:!document.getElementById('shell-confirm').hidden}))()`);
  result("shell card visible while download request stays pending", shellState.shell === true && coexistSettled === false, { shellState, coexistSettled });
  result("shell card takes visual priority over decision dialog (observed, no arbitration)", typeof shellState.download === "boolean", shellState);
  await shot("10-shell-and-download-coexist");
  await js(`document.getElementById('sc-deny').click()`);
  await waitFor(async () => (await js(`document.getElementById('shell-confirm').hidden`)), "shell card closed");
  await waitFor(async () => (await js(`document.querySelector('#decision-dialog')!==null`)), "download card re-shown after shell close");
  const downloadStillPending = await js(`document.querySelector('#decision-dialog')!==null`);
  result("closing shell card leaves download request pending and re-shown (no cross-channel arbitration)", downloadStillPending === true && coexistSettled === false, { downloadStillPending, coexistSettled });
  await shot("11-download-after-shell-closed");
  await clickReject();
  const coexist = await coexistPending;
  requireToolResult(coexist, false, "download-declined", "coexist card decline");

  // ————— 场景 9：关窗 fail-closed（最后执行）—————
  routeHandler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end("D2-CLOSE");
  };
  const p9 = requestDownload({ url: srv("/close.bin"), purpose: "关窗" }, { toolCallId: "d2-close-1" });
  await waitDialog();
  const ledgerBeforeClose = (await readLedger()).events.length;
  win.destroy();
  await manager.stop(null);
  const r9 = await p9;
  requireToolResult(r9, false, "download-aborted", "close window fail-closed");
  const ledgerAfterClose = (await readLedger()).events.length;
  result("close window: audit recorded failure without success", ledgerAfterClose > ledgerBeforeClose, { ledgerBeforeClose, ledgerAfterClose });
  const led9 = await readLedger();
  result("close window: no completed event for aborted download", !led9.events.some((e) => e.kind === "download.completed" && e.path === "download/close.bin"), led9.events.filter((e) => e.kind === "download.failed").slice(-2));

  // ————— 收尾报告 —————
  log("SCENARIOS PASS=" + (REPORT.length - FAILURES.length) + " FAIL=" + FAILURES.length + " SHOTS=" + SHOTS.length);
  fs.writeFileSync(
    path.join(OUT, "report.json"),
    JSON.stringify(
      {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        head: process.env.ANS_D2_EXPECTED_HEAD || null,
        projectRoot: ROOT,
        window: { width: 1360, height: 860 },
        checks: REPORT,
        failures: FAILURES,
        shots: SHOTS,
        notices,
        responsesFromRenderer,
      },
      null,
      2,
    ),
  );
  if (FAILURES.length > 0) {
    app.exit(1);
  } else {
    app.exit(0);
  }
}

const watchdog = setTimeout(() => {
  log("WATCHDOG_TIMEOUT");
  try {
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ watchdog: true, checks: REPORT, failures: FAILURES, shots: SHOTS }, null, 2));
  } catch {
    /* ignore */
  }
  app.exit(3);
}, 180000);

main().then(
  () => clearTimeout(watchdog),
  (error) => {
    clearTimeout(watchdog);
    log("PROBE_ERROR " + (error && error.stack ? error.stack : String(error)));
    try {
      fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ error: String(error), checks: REPORT, failures: [...FAILURES, "PROBE_ERROR"], shots: SHOTS }, null, 2));
    } catch {
      /* ignore */
    }
    app.exit(2);
  },
);

// test/桌面应用/e2e/main.mjs
// 桌面窗口端到端自检：以真实 Electron 主进程启动真实 preload + 真实渲染进程。
// 驱动（客户最终模型「导入项目 = 授权；点角色即开」）：
//   导入 D:\work\ans-cli → 左树出角色 → 点角色【直接进入聊天，全程无确认框】
//   → 连发两条消息都生效 → 一次越界写入被拒且拒绝消息内联显示（可展开看允许路径）
//   → 同角色重复点击续接 → 右栏资料分组展示。逐屏截图 + 写报告，最后退出。
//
// 运行：node_modules/.bin/electron test/桌面应用/e2e/main.mjs
//   env ANS_E2E_PROJECT=项目根（缺省=仓库根）
//   env ANS_E2E_OUTDIR=报告与截图输出目录（缺省=系统临时目录）

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, ipcMain, Menu } from "electron";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "..", "app");
const REPO_ROOT = process.env.ANS_E2E_PROJECT || path.resolve(HERE, "..", "..", "..");
const OUTDIR = process.env.ANS_E2E_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-e2e-"));
// 看门狗修复（2026-10-12）：OUTDIR 由调用方指定时必须**先建目录**——否则收尾 report.txt 写入抛 ENOENT
// （未捕获拒绝）⇒ 进程不退出、表现成「e2e 卡住」（真因已定位：run 已完成，卡在退出前的报告写入）。
fs.mkdirSync(OUTDIR, { recursive: true });
// Phase 5A（PM §17.4）P1-3 安全证据夹具：第二个最小项目（只读枚举 + 会话键隔离；不触碰仓库）。
const SECOND_PROJECT = path.join(OUTDIR, "p13-second-project");
fs.mkdirSync(path.join(SECOND_PROJECT, "角色卡", "B"), { recursive: true });
fs.writeFileSync(path.join(SECOND_PROJECT, "角色卡", "B", "role-card.md"), "# 角色：B\n\nPhase 5A P1-3 切换夹具角色。\n");
fs.writeFileSync(path.join(SECOND_PROJECT, "角色卡", "B", "boundary.yaml"), "role: B\nentries:\n  - kind: file\n    path: src/b.ts\n    purpose: P1-3 fixture\n");
// T28：Pi 配置面板的目标 `.env`——**e2e 一律用 OUTDIR 下的临时文件**，
// **绝不指向仓库根真实 `.env`**（那会改掉客户真实凭据）。注入给 interface 的 `envFilePath`。
const PI_ENV = path.join(OUTDIR, "e2e-pi.env");

let createDesktopInterface = null;
let createChatDemoAdapter = null;
let chatAdapterMod = null; // P0-1：demo 适配器模块引用（takeDemoPromptLog 断言透传保真用）
let slowPromptGate = null; // P0-1 e2e 专用缝：让首轮 prompt 挂起（把「忙」变成确定态，供入队定格断言）
let slowPromptArmed = false;
let nextPickPath = null; // P1-3：选目录桩的返回值（null=用户取消；e2e 全程不弹真实系统对话框）
let repairFailOpen = false;
let repairFailSend = false;
let repairThrowSend = false;
let repairOpenCalls = 0;
let repairSendCompletions = 0;
const repairSendRequests = [];
let win;
let diagnosticModule;
let diagnosticStore;
let registerHandler;
let recoverySnapshot = { projectRoot: null, roleId: null };
// Phase 5A（PM §17.4）：目标入口经唯一路径事实源解析；ANS_RENDERER_ENTRY 优先（绝对 .html，非法 fail-fast）。
let RENDERER_ENTRY = null;
const operatorPresentations = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
const log = (s) => { report.push(s); };
const hardChecks = [];
const hardCheck = (name, value) => { if (value !== true) hardChecks.push(name); return value; };

// A-5（2026-10-12）：客户交互通道——用**真实** `createCustomerInputChannel`（app/desktop/customer-input.ts）
// 装配：presenter 推给渲染侧为交互卡；`session:operator-response` 直连通道（**按请求快照校验**——
// 非法回包不受理在 e2e 现场可见）。不经真实模型工具，直接以通道推请求（与桌面接线同形）。
let createCustomerInputChannel = null;
let customerChannel = null;
// D-1（2026-10-12）：会话记录恢复——主进程侧只读解析（与 app/main.ts 同形）。
let readRoleSessionHistory = null;
// B-1：Markdown 链接外开的调用记录（替身；**不真开系统浏览器**）。
const openExternalCalls = [];

function registerIpc() {
  const diagnostic = diagnosticStore.createDiagnosticLogger({ component: "desktop.e2e" });
  // Phase 5A：把渲染进程 error 级控制台转发到 stdout，避免 executeJavaScript 失败时只有泛化错误。
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const isError = level === "error" || level === 3;
    if (isError) console.error("[renderer-console] " + String(message) + " @" + String(sourceId) + ":" + String(line));
  });
  // Phase 5A：记录并阻止窗口内导航（新渲染器 Markdown 链接未拦截时会尝试导航；这是待 PM/桌面UI 裁定的差异，
  // 不静默掩盖——真实尝试写进报告，且不让测试窗口离开应用页）。
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      log("NAVIGATION_BLOCKED=" + url);
    }
  });
  registerHandler = diagnosticModule.createWindowIpcRegistrar(win, ipcMain, diagnostic);
  // i18n B0（2026-10-23）：本 e2e harness 自建窗口，不经过 app/main.ts 的 registerPreferencesIpc；
  // 渲染层启动即读偏好。按真实契约同形注册桩（内存值、不写盘、不触仓库 .ans/.env），
  // 避免日志出现 `No handler registered for 'preferences:get'`（D6 观察到 3 处）。
  let e2eLocale = "zh-CN";
  const e2eSupportedLocales = ["zh-CN", "en-US"];
  registerHandler("preferences:get", () => ({ version: 1, locale: e2eLocale, supported: e2eSupportedLocales }));
  registerHandler("preferences:set-locale", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, locale: e2eLocale, error: "invalid-sender" };
    const locale = input !== null && typeof input === "object" && typeof input.locale === "string" ? input.locale : "";
    if (!e2eSupportedLocales.includes(locale)) return { ok: false, locale: e2eLocale, error: "invalid-locale" };
    e2eLocale = locale;
    if (!win.isDestroyed()) win.webContents.send("preferences:locale-changed", { locale });
    return { ok: true, locale };
  });
  diagnosticModule.observeWindowDiagnostics(win, diagnostic, () => {
    void win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(diagnosticModule.RECOVERY_PAGE));
  });
  registerHandler("app:renderer-diagnostic", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false };
    return diagnosticModule.recordRendererDiagnostic(diagnostic, input);
  });
  registerHandler("app:recovery-state", (event) => event.sender === win.webContents ? recoverySnapshot : null);
  registerHandler("app:recovery-ready", (event) => {
    if (event.sender !== win.webContents) return { ok: false };
    customerChannel.replayPending();
    return { ok: true };
  });
  registerHandler("app:reload-interface", async (event) => {
    if (event.sender !== win.webContents) return { ok: false };
    await win.loadFile(RENDERER_ENTRY);
    return { ok: true };
  });
  const desktop = createDesktopInterface({
    // P1-3：目录选择改**桩**（用例经 nextPickPath 驱动；不弹真实系统对话框——e2e 里真对话框会挂住）。
    pickDirectory: async () => nextPickPath,
    emitEvent: (ev) => { if (!win.isDestroyed()) win.webContents.send("session:event", ev); },
    // L-1/状态准确性（与 app/main.ts 同形；生产经 Q-1 去抖 ≥100ms 合并——此处直推、语义一致）：
    // 忙碌/队列**真实快照** → 渲染侧（停止钮显隐、左树徽标与队列行都只信它）。
    emitRoleState: (info) => { if (!win.isDestroyed()) win.webContents.send("session:role-state", info); },
    // ⚠ 测试注入缝（客户 2026-10-11 裁定：界面去掉运行时选择器、桌面一律以 pi 发起）：
    //    顶掉**真实 pi 工厂**，改注入 demo 适配器工厂 ⇒ e2e 仍能**离线**跑完整流程（不触网、不需凭据）。
    //    适配器按 `role.boundary` 构造（bindRole 收到的 ResolvedRole 带 boundary）；行为与既有 demo 一致
    //    （其 buildGovernedTools 未配置 writeRoot ⇒ 只判不写、绝不落盘，故不会改动仓库）。
    //    界面/会话的运行时标签仍是 pi——换掉的只是「注入缝上的适配器」，不是界面后门。
    createPiAdapterFactoryFn: () =>
      (gate) => ({
        composeContext: (role) => createChatDemoAdapter({ gate, boundary: role.boundary }).composeContext(role),
        bindRole: async (role) => {
          const session = await createChatDemoAdapter({ gate, boundary: role.boundary }).bindRole(role);
          // P0-1 e2e 专用缝（仅桌面窗口角色、仅 arm 后、仅文本「队列慢轮」命中）：首轮 prompt 挂起直到
          // e2e 显式放行——不改 demo 适配器本体（记录/行为不变，只是延迟调用），把「忙」变成确定态。
          if (role.id === "桌面窗口") {
            const origPrompt = session.prompt.bind(session);
            session.prompt = (text, opts) => {
              if (slowPromptArmed && text === "队列慢轮") {
                slowPromptArmed = false;
                const g = slowPromptGate;
                return g.promise.then(() => origPrompt(text, opts));
              }
              return origPrompt(text, opts);
            };
          }
          return session;
        },
      }),
    // ⚠ 临时 `.env` 路径（不碰仓库根）；piConfigEnv 用独立对象避免污染 e2e 进程环境。
    envFilePath: PI_ENV,
    piConfigEnv: {},
  });
  registerHandler("app:pick-project", () => desktop.pickProject());
  registerHandler("app:list-project", async (_e, input) => {
    const res = await desktop.listProject(input);
    recoverySnapshot.projectRoot = res.projectRoot;
    // D-1：逐角色只读解析会话历史并推规范化行——**镜像生产形态**（app/main.ts：`void pushSessionHistories(...)`，
    // fire-and-forget、在 list-project **回包之后**送达 ⇒ 渲染侧走「直接回放」路径）。
    // ⚠ 2026-10-12 修复：本 harness 原先把「读文件 + 推送」**await 在 handler 内**（回包之前送达）——
    //   与生产不同形，且多次实测首个角色（su）的记录会因与回包跨通道竞序而**丢失**（改为生产形态后消失）。
    const roles = Array.isArray(res && res.roles) ? res.roles.map((r) => r.roleId) : [];
    void (async () => {
      for (const roleId of roles) {
        let hist;
        try {
          hist = await readRoleSessionHistory(res.projectRoot, roleId);
        } catch (err) {
          hist = { rows: [], error: err && err.message ? err.message : String(err) };
        }
        if ((hist.rows && hist.rows.length > 0) || hist.error) {
          if (!win.isDestroyed()) {
            win.webContents.send("session:history", { roleId, projectRoot: res.projectRoot, rows: hist.rows || [], error: hist.error || null });
          }
        }
      }
    })();
    return res;
  });
  registerHandler("session:open", async (_e, input) => {
    repairOpenCalls += 1;
    if (repairFailOpen) return { ok: false, error: "修复探针：补开失败原文" };
    const result = await desktop.openSession(input);
    if (result.ok) recoverySnapshot.roleId = input.roleId;
    return result;
  });
  registerHandler("session:send", async (_e, input) => {
    repairSendRequests.push(input);
    if (repairThrowSend) throw new Error("修复探针：发送异常原文");
    if (repairFailSend) return { ok: false, error: "修复探针：发送失败原文" };
    const result = await desktop.sendSession(input);
    repairSendCompletions += 1;
    return result;
  });
  registerHandler("app:attach-image", (_e, input) => desktop.attachImage(input));
  registerHandler("session:stop", (_e, input) => desktop.stopSession(input));
  // P1-1：撤回未投递排队消息（与 app/main.ts 同形——Interface 如实回报）。
  registerHandler("session:withdraw", (_e, input) => desktop.withdrawQueued(input));
  // P0-2：停当前轮次（与 app/main.ts 同形——Interface 三态如实回传）。
  registerHandler("session:abort", (_e, input) => desktop.abortSession(input));
  // B-2：保活会话列表（与 app/main.ts 同形）。
  registerHandler("session:live", () => desktop.listLiveSessions());
  // 2026-10-16 本批同步（逐条对照 app/main.ts 现行接线补齐；此前 renderer 已改用新通道而 harness 未跟上）：
  //   ① 保活会话视图——refreshLiveRoles 现优先取它（缺失 ⇒ 异常 ⇒ liveRoles 清空 ⇒ 徽标错显「已停止」）；
  //   ② 按需会话历史——F 批次后 selectRole 的主路径（缺失 ⇒ 「读取历史失败」分支 ⇒ 全量重建清掉已回放行，
  //      连带权威锚点表登记失败）；
  //   ③ 报告/投递持久化查询（卡片「报告存储」槽；只读，retry* 仅重试点击时触发）——同为现行卡片能力；
  //   ④ 运行时配置读写（Pi 设置面板现行通道；原 pi-config:* 双注册保留——与 main.ts 同形）。
  registerHandler("session:live-views", () => desktop.listLiveSessionViews());
  // 2026-10-29：界面加载后角色状态快照重放（与 app/main.ts 同形；缺失会让渲染侧记一条未捕获拒绝）。
  registerHandler("session:role-states", () => desktop.requestRoleStates());
  // P2（2026-10-30）：网络状态 IPC（与 app/main.ts 同形）。e2e 不接真实 net/powerMonitor——
  // 状态由用例经 `network:state` 推送；渲染 online/offline 提示只记录（主进程重探语义由单测覆盖）。
  let e2eNetworkState = { online: true, source: "main-net", at: Date.now(), stableForMs: 0, reason: "probe" };
  registerHandler("network:get-state", (event) => event.sender === win.webContents ? e2eNetworkState : null);
  registerHandler("network:renderer-state", (event, input) => {
    if (event.sender !== win.webContents || !input || typeof input.online !== "boolean") return { ok: false };
    e2eNetworkState = { online: input.online === true, source: "renderer", at: Date.now(), stableForMs: 0, reason: input.online === true ? "probe" : "renderer-offline" };
    return { ok: true, state: e2eNetworkState };
  });
  registerHandler("session:history-get", (_e, input) => desktop.getSessionHistory(input));
  registerHandler("tasks:list", (_e, input) => desktop.listTasks(input));
  registerHandler("tasks:restore", (_e, input) => desktop.restoreTasks(input));
  registerHandler("roles:activity-log", (_e, input) => desktop.readRoleActivityLog(input));
  registerHandler("roles:terminate", (_e, input) => desktop.terminateRoleRun(input));
  registerHandler("tasks:redispatch", (_e, input) => desktop.redispatchTask(input));
  registerHandler("tasks:close", (_e, input) => desktop.closeTask(input));
  registerHandler("report:retry-save", (_e, input) => desktop.retryReportSave(input));
  registerHandler("report:get-save-state", (_e, input) => desktop.getReportSaveState(input));
  registerHandler("delivery:retry-history-save", (_e, input) => desktop.retryDeliveryHistorySave(input));
  registerHandler("delivery:get-receipt", (_e, input) => desktop.getDeliveryReceipt(input));
  registerHandler("session:get-persistence", (_e, input) => desktop.getSessionPersistence(input));
  registerHandler("runtime-config:get", (_e, input) => desktop.getRuntimeConfig(input && input.runtime));
  registerHandler("runtime-config:save", (_e, input) => desktop.saveRuntimeConfig(input));
  // Phase 5A：与 app/main.ts 同步的双开关通道（旧/新渲染器启动时都会读取；缺失会让启动流程报错）。
  registerHandler("shell:judge-get", () => desktop.getShellJudgeState());
  registerHandler("shell:judge-set", async (_e, input) => {
    const result = await desktop.setShellJudgeEnabled(input);
    if (result.ok === true && !win.isDestroyed()) win.webContents.send("shell:judge-state", { ...desktop.getShellJudgeState(), available: true });
    return result;
  });
  registerHandler("decision:judge-get", () => desktop.getDecisionJudgeState());
  registerHandler("decision:judge-set", async (_e, input) => {
    const result = await desktop.setDecisionJudgeEnabled(input);
    if (result.ok === true && !win.isDestroyed()) win.webContents.send("decision:judge-state", { ...desktop.getDecisionJudgeState(), available: true });
    return result;
  });
  // B-1：链接外开——替身只记录 URL 并回 ok（**不真开系统浏览器**；校验仍在 Interface 层，与此替身同形）。
  registerHandler("app:open-external", (_e, input) => {
    openExternalCalls.push(input && input.url);
    return { ok: true };
  });
  // A-5：客户交互通道（真实实现）：请求经 session:operator-request 推给渲染侧渲染成交互卡；
  // 回包经 session:operator-response 直连通道（按请求快照校验——选项 id 必须 ⊆ 已发）。
  customerChannel = createCustomerInputChannel({
    presenter: (payload) => {
      operatorPresentations.push(payload);
      if (!win.isDestroyed()) win.webContents.send("session:operator-request", payload);
    },
    operatorId: "e2e-operator",
  });
  registerHandler("session:operator-response", (_e, input) =>
    customerChannel.respond(input && typeof input === "object" ? input : {}),
  );
  // M-1：shell 确认卡回包通道（e2e 镜像**生产形态**：本 harness 无 shell presenter ⇒ 无挂起请求，
  // 一律如实回 `expired`——P-1 探针据此断言「Esc=不放行、卡片转**已失效**终态」）。
  registerHandler("shell:confirm-response", () => ({ ok: false, expired: true, error: "e2e：无挂起请求（镜像生产通道形态）" }));
  registerHandler("pi-config:get", () => desktop.getPiConfig());
  registerHandler("pi-config:save", (_e, input) => desktop.savePiConfig(input));
  // 自绘标题栏的窗口控制（与 app/main.ts 同形，e2e 镜像真实应用；守卫见 run() 步骤 0）。
  registerHandler("window:minimize", () => { if (!win.isDestroyed()) win.minimize(); });
  registerHandler("window:toggle-maximize", () => {
    if (win.isDestroyed()) return false;
    if (win.isMaximized()) { win.unmaximize(); return false; }
    win.maximize(); return true;
  });
  registerHandler("window:close", () => { if (!win.isDestroyed()) win.close(); });
  registerHandler("window:is-maximized", () => (win.isDestroyed() ? false : win.isMaximized()));
  win.on("maximize", () => { if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", true); });
  win.on("unmaximize", () => { if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", false); });
}

async function shot(name) {
  // 首帧截图偶发 `UnknownVizError`（合成器首帧未就绪；P2 验收报告 F3 已登记为已知偶发）。
  // 有界重试只补拍同一屏幕，不改变截图内容/断言；重试耗尽仍如实返回 capture-failed。
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const img = await win.webContents.capturePage();
      const p = path.join(OUTDIR, name);
      fs.writeFileSync(p, img.toPNG());
      return p;
    } catch (err) {
      lastError = err;
      await sleep(200);
    }
  }
  return "capture-failed:" + (lastError && lastError.message);
}

async function modalExists() {
  return wc().executeJavaScript("document.getElementById('modal') !== null");
}

function wc() { return win.webContents; }

/** 有界条件等待（2026-10-16 本批）：某些夹具事件在现行渲染器下**排队要数秒**才渲完
 *  （如 S-1 的 200 条逐条 `session:event`——逐事件渲染 + 行高实测；实测 ~4.4s）。
 *  断言前须等真实状态就绪，否则量到「还没渲完」的中间态。**非断言放松**：内容不改，
 *  只把固定死睡改为有界轮询；超时返回 false，断言照旧如实转红。 */
async function waitUntil(expression, tries = 500, stepMs = 20) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await wc().executeJavaScript(expression)) return true;
    await sleep(stepMs);
  }
  return false;
}

async function run() {
  log("RENDERER_ENTRY=" + RENDERER_ENTRY);
  log("ELECTRON=" + process.versions.electron);
  log("NODE=" + process.versions.node);
  log("PROJECT=" + REPO_ROOT);
  log("OUTDIR=" + OUTDIR);
  // Phase 5A（PM §17.4）：动作型 executeJavaScript 失败只记录并继续，让报告产出完整检查名（不放宽判据）。
  const tryEval = async (expression, label, timeoutMs = 20000) => {
    try {
      return await Promise.race([
        wc().executeJavaScript(expression),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error("action timeout >" + timeoutMs + "ms")), timeoutMs)),
      ]);
    } catch (error) {
      log("EVAL_ACTION_ERROR=" + label + "=" + (error && error.message ? error.message : String(error)));
      return undefined;
    }
  };
  // Phase 5A：新渲染器默认引擎 Claude（4A），本台注入的离线 demo 适配器挂在 Pi 工厂上；
  // 显式切到 Pi 使双端会话都走演示适配器（不触网、不需凭据）。旧入口本来就是 Pi，无行为变化。
  const ensurePiRuntime = async () => {
    try { await wc().executeJavaScript("window.__ansRenderer.selectRuntime && window.__ansRenderer.selectRuntime('pi')"); }
    catch (error) { log("SELECT_RUNTIME_ERROR=" + (error && error.message ? error.message : String(error))); }
    await sleep(250);
  };
  // 通道挂起 promise 的有界等待：不因一张卡未呈现/未点中而让整台自检永久挂起（失败仍如实记录）。
  const withTimeout = (promise, ms, label) => new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      log("PROMISE_TIMEOUT=" + label);
      resolve(null);
    }, ms);
    Promise.resolve(promise).then(
      (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); },
      (error) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ error: error && error.message ? error.message : String(error) }); },
    );
  });

  // 0) 自绘标题栏守卫（客户要求：去掉原生标题栏与默认菜单栏，自己搞一个）。
  //    ⚠ **绝不真点关闭/最小化/最大化**——关闭会杀掉测试窗口、最大化会改变截图尺寸。
  //    用**注入替身**验证「按钮 → preload 方法」接线，并读一次无害的 isMaximized 证明 IPC 往返确实注册。
  log("NO_DEFAULT_MENU_BAR=" + (Menu.getApplicationMenu() === null));
  const titlebar = await wc().executeJavaScript(
    "(() => { const tb=document.getElementById('titlebar'); const cs=tb?getComputedStyle(tb).getPropertyValue('-webkit-app-region').trim():''; const ids=['win-min','win-max','win-close']; return { has:!!tb, drag:cs, allBtns:ids.every(id=>!!document.getElementById(id)), btnCount:document.querySelectorAll('#titlebar .win-btn').length }; })()",
  );
  log("CUSTOM_TITLEBAR_PRESENT=" + titlebar.has);
  log("TITLEBAR_IS_DRAG_REGION=" + (titlebar.drag === "drag"));
  log("TITLEBAR_HAS_THREE_BUTTONS=" + (titlebar.allBtns && titlebar.btnCount === 3));
  const btnNoDrag = await wc().executeJavaScript(
    "(() => getComputedStyle(document.getElementById('win-close')).getPropertyValue('-webkit-app-region').trim())()",
  );
  log("WINDOW_BUTTON_NO_DRAG=" + (btnNoDrag === "no-drag"));
  // preload 桥（白名单）暴露三个窗口按钮方法（+读取最大化态/订阅状态）——只读取 typeof，无副作用。
  const bridge = await wc().executeJavaScript(
    "(() => { const d=window.desktop; return ['minimizeWindow','toggleMaximize','closeWindow','isMaximized','onMaximizedChanged'].every(k=>typeof d[k]==='function'); })()",
  );
  log("WIN_BRIDGE_FUNCTIONS=" + bridge);
  // IPC 往返（无害读）：isMaximized 应回一个布尔 ⇒ 证明 window:is-maximized 通道已注册、preload 可达主进程。
  log("WIN_IS_MAXIMIZED_IPC=" + (await wc().executeJavaScript("window.desktop.isMaximized().then(v=>typeof v==='boolean')")));
  // 按钮 → preload → IPC 通道的完整接线验证（**注入替身**）：临时把三个动作通道换成「只记录、不动窗口」的替身，
  // 点三个按钮后断言各自被调用一次，再还原真实处理器。⚠ 全程**不真触发**关闭/最小化/最大化——窗口仍在、未被最大化。
  const winSpy = { min: 0, max: 0, close: 0 };
  function setWinHandlers(h) {
    for (const [ch, fn] of Object.entries(h)) {
      ipcMain.removeHandler(ch);
      registerHandler(ch, fn);
    }
  }
  setWinHandlers({
    "window:minimize": () => { winSpy.min++; },
    "window:toggle-maximize": () => { winSpy.max++; return false; },
    "window:close": () => { winSpy.close++; },
  });
  await wc().executeJavaScript(
    "document.getElementById('win-min').click(); document.getElementById('win-max').click(); document.getElementById('win-close').click();",
  );
  await sleep(150);
  // 还原真实处理器（与真实应用同形）。
  setWinHandlers({
    "window:minimize": () => { if (!win.isDestroyed()) win.minimize(); },
    "window:toggle-maximize": () => { if (win.isDestroyed()) return false; if (win.isMaximized()) { win.unmaximize(); return false; } win.maximize(); return true; },
    "window:close": () => { if (!win.isDestroyed()) win.close(); },
  });
  log("WIN_BUTTON_MIN_WIRED=" + (winSpy.min === 1));
  log("WIN_BUTTON_MAX_WIRED=" + (winSpy.max === 1));
  log("WIN_BUTTON_CLOSE_WIRED=" + (winSpy.close === 1));
  // 上面未真触发窗口操作：窗口仍在、且未被最大化。
  log("WINDOW_ALIVE_AFTER_GUARDS=" + (!win.isDestroyed() && !win.isMaximized()));
  log("SHOT_00_TITLEBAR=" + (await shot("00-titlebar.png")));

  // 1) 导入项目 → 左树出角色
  // N-1（2026-10-12 客户裁定）：导入前按钮是「导入项目」；导入后应变「切换项目」。
  log("PROJECT_BTN_INITIAL_IMPORT=" + (await wc().executeJavaScript("document.getElementById('btn-import').textContent === '导入项目'")));
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")");
  await sleep(600);
  await ensurePiRuntime();
  log("PROJECT_PATH_SHOWN=" + (await wc().executeJavaScript("document.getElementById('project-path').textContent")));
  log("PROJECT_BTN_SWITCHED=" + (await wc().executeJavaScript("document.getElementById('btn-import').textContent === '切换项目'")));
  const roleIds = await wc().executeJavaScript("window.__ansRenderer.state.roles.map(r=>r.roleId)");
  log("ROLE_COUNT=" + roleIds.length);
  log("ROLE_IDS=" + roleIds.join(", "));
  // T17：导入后**默认选中并高亮主入口角色（su）**，空聊天区给「开始与 su 对话」主 CTA——但**不自动开会话**。
  // 主入口 id 一律取 listProject 的 primaryRoleId（渲染侧不硬编码 "su"）。
  log("PRIMARY_ROLE_ID=" + (await wc().executeJavaScript("window.__ansRenderer.state.primaryRoleId")));
  log("DEFAULT_SELECTED_ROLE=" + (await wc().executeJavaScript("window.__ansRenderer.state.selectedRoleId")));
  // 身份标注重锚（2026-10-16，对齐 V2/v3 现状）：左树**可见**「主入口/内置」徽标（.ti-badge）已退役——
  // 主入口身份现由条目 `primary` 类（带边框区框出）+ `aria-description`（可达性文本）承载，渲染侧
  // 单一来源见 renderer.js::roleTreeItem。原断言 `.ti-badge.primary` 存在 → 新断言 `primary` 类 +
  // aria-description 含「主入口」（守卫同一能力：主入口身份可见地标出），不删不放。
  const suItem = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); return { active: !!(it && it.classList.contains('active')), primaryBadge: !!(it && it.classList.contains('primary') && (it.getAttribute('aria-description')||'').includes('主入口')), inMainGroup: !!(it && it.previousElementSibling && it.previousElementSibling.className==='tree-group') }; })()",
  );
  log("SU_DEFAULT_ACTIVE=" + suItem.active + " SU_PRIMARY_BADGE=" + suItem.primaryBadge + " SU_IN_MAIN_GROUP=" + suItem.inMainGroup);
  log("HAS_OTHER_GROUP=" + (await wc().executeJavaScript("[...document.querySelectorAll('#role-tree .tree-group')].some(e=>e.textContent.includes('其他角色'))")));
  log("CHAT_CTA_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#btn-start-primary')")));
  log("CHAT_CTA_TEXT=" + (await wc().executeJavaScript("(document.querySelector('#btn-start-primary')||{}).textContent||''")));
  log("SESSION_NOT_AUTO_OPENED=" + (await wc().executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId === null")));
  // 有角色的正常项目（hasRoles:true）：整页**不该**出现「未 bootstrap」那件事——它只在中栏正中、且仅未 bootstrap 时。
  // 断言无该句，确认「收敛提示」未影响正常路径。
  log("NORMAL_PROJECT_NO_BOOTSTRAP_MENTION=" + (await wc().executeJavaScript("!document.body.textContent.includes('项目尚未 bootstrap')")));
  log("NO_MODAL_AFTER_IMPORT=" + !(await modalExists()));
  log("SHOT_01_IMPORT=" + (await shot("01-import.png")));

  // 1b) 内置治理角色 su：排在树顶、带「内置」身份标注（aria-description——可见徽标已退役，同上重锚）、可点开聊天
  log("FIRST_ROLE_ID=" + roleIds[0]);
  log("SU_IS_FIRST=" + (roleIds[0] === "su"));
  const suBuiltIn = await wc().executeJavaScript(
    "(() => { const it=document.querySelector('#role-tree .tree-item'); return {builtin: it.classList.contains('builtin'), badge: (it.getAttribute('aria-description')||'').includes('内置'), name: it.querySelector('.ti-name').textContent}; })()",
  );
  log("SU_TREE_CLASS=" + suBuiltIn.builtin + " SU_TREE_BADGE=" + suBuiltIn.badge + " SU_TREE_NAME=" + suBuiltIn.name);
  const suClicked = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); if(it){it.click(); return true;} return false; })()",
  );
  await sleep(1200);
  log("SU_CLICKED=" + suClicked);
  log("SU_NO_MODAL=" + !(await modalExists()));
  log("SU_CHAT_HEADER=" + (await wc().executeJavaScript("document.getElementById('chat-role').textContent")));
  log("SU_SESSION_STATE=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state || '(none)'"))); // 状态 pill 已删：kind 程序化保留在 data-state
  // 客户裁定（2026-10-13）：聊天流**不再有**常规「已开启与角色 X 的会话…」欢迎提示（守卫「它不在」）。
  log("SU_NO_WELCOME=" + (await wc().executeJavaScript("!document.querySelector('#chat').textContent.includes('已开启与角色')")));
  // 守卫（客户 2026-10-11 裁定）：su **不该**有「只读」徽标与「本版只读」内联说明——客户回到
  // 「导入项目 = 授权；门禁静默执行、拒绝在聊天流内联显示；用户对边界无感」的原模型，「只读」徽标偏离了
  // 这条，故移除。此处断言它**没有出现**（守卫「它不该出现」，不是删断言）。su 那行的身份标注应只剩
  // aria-description 里的「主入口/内置」（可见徽标载体已退役）；判据同时覆盖旧元素（.ti-badge.readonly）
  // 与现行载体（aria-description 含「只读」）——不留任何载体形态的回潮缺口。
  const suNoReadonly = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); const aria=it ? (it.getAttribute('aria-description')||'') : ''; return { badge: !!(it && it.querySelector('.ti-badge.readonly')) || aria.includes('只读'), note: document.querySelector('#chat').textContent.includes('本版只读'), rows: document.querySelectorAll('#chat .sys-readonly').length, labels: aria }; })()",
  );
  log("SU_NO_READONLY_BADGE=" + !suNoReadonly.badge);
  log("SU_NO_READONLY_NOTE=" + !suNoReadonly.note + " SU_NO_READONLY_ROWS=" + (suNoReadonly.rows === 0));
  log("SU_BADGE_LABELS=" + suNoReadonly.labels);
  // 写入语义（客户 2026-10-11 裁定：去掉运行时选择器、默认跑 pi）：常驻**输入区下沿 `.compose-note`**
  // （2026-10-16 v3 归位——原在会话头横栏；仍是单一来源 WRITE_NOTE 的常驻说明，不再内联进聊天流）。
  log("SU_WRITE_NOTE_IN_COMPOSE_NOTE=" + (await wc().executeJavaScript("!!document.querySelector('.compose-note #runtime-note')")));
  // v2 现行口径重锚（2026-10-14）：说明单一来源 `WRITE_NOTE`＝「实际写入导入项目，角色边界外的写入会被拒绝。」
  // （旧串『真正落到你导入的项目』属 v1 文案，早已不渲染。）
  log("SU_WRITE_NOTE_WRITES_IMPORTED=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('实际写入导入项目')")));
  log("SU_NO_INLINE_WRITE_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .sys-nowrite, #chat .sys-write').length === 0")));
  log("SHOT_01B_SU=" + (await shot("01b-su.png")));
  // T36：仓库根（有角色）的 su 会话是**普通聊天**、非创世态 → **不**显示「完成 bootstrap」入口。
  log("BOOTSTRAP_ACTION_REMOVED=" + (await wc().executeJavaScript("document.getElementById('bootstrap-action') === null")));

  // 2) 点角色 → 直接进入聊天（无确认框）
  const clicked = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.textContent.includes('桌面窗口')); if(it){it.click(); return true;} return false; })()",
  );
  log("CLICKED_DESKTOP_ROLE=" + clicked);
  await sleep(1200);
  log("NO_MODAL_AFTER_ROLE_CLICK=" + !(await modalExists()));
  log("CHAT_HEADER_ROLE=" + (await wc().executeJavaScript("document.getElementById('chat-role').textContent")));
  log("SESSION_STATE=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state || '(none)'"))); // 同上
  log("NO_WELCOME_AFTER_OPEN=" + (await wc().executeJavaScript("!document.querySelector('#chat').textContent.includes('已开启与角色')")));
  log("USER_BUBBLES_BEFORE=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .msg-user').length")));
  // 可写的项目角色（桌面窗口）：同样**不该**带「只读」标记，聊天流内亦无只读说明（守卫「它不该出现」；
  // 判据同 su 处——旧元素 + 现行 aria-description 载体双覆盖）。
  const desktopRole = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.textContent.includes('桌面窗口')); return { badge: !!(it && it.querySelector('.ti-badge.readonly')) || (it ? (it.getAttribute('aria-description')||'').includes('只读') : false), rows: document.querySelectorAll('#chat .sys-readonly').length }; })()",
  );
  log("DESKTOP_ROLE_NO_READONLY_BADGE=" + !desktopRole.badge + " DESKTOP_ROLE_NO_READONLY_ROWS=" + (desktopRole.rows === 0));
  // 去掉运行时选择器后：聊天流内不再有 demo 写入语义；旧的一概而论文案应已不存在。
  const writeMode = await wc().executeJavaScript(
    "(() => { const c=document.getElementById('chat'); return { demoNote: c.textContent.includes('演示运行时（demo）'), inlineRows: document.querySelectorAll('#chat .sys-nowrite, #chat .sys-write').length, oldGeneralClaim: c.textContent.includes('V1 桌面：只判不写') || document.getElementById('chat-role-sub').textContent.includes('只判不写') }; })()",
  );
  log("WRITE_MODE_NO_DEMO_NOTE=" + (!writeMode.demoNote) + " WRITE_MODE_NO_INLINE_ROWS=" + (writeMode.inlineRows === 0) + " OLD_GENERAL_CLAIM_PRESENT=" + writeMode.oldGeneralClaim);

  // 3) 连发两条消息（多轮直发，无任何确认）
  await wc().executeJavaScript(
    "(() => { const i=document.getElementById('inp-message'); i.value='你好，请试着在边界内改点东西'; document.getElementById('btn-send').click(); })()",
  );
  await sleep(1200);
  await wc().executeJavaScript(
    "(() => { const i=document.getElementById('inp-message'); i.value='第二条：再试一次越界写入'; document.getElementById('btn-send').click(); })()",
  );
  await sleep(1200);

  log("NO_MODAL_AFTER_MESSAGES=" + !(await modalExists()));
  log("USER_BUBBLES=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .msg-user').length")));
  log("ASSISTANT_BUBBLES=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .msg-assistant').length")));
  log("HAS_ROUND2=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.includes('第 2 轮')")));
  // Phase 5A：补一条**生产形状**的 denied 事件（显式 toolName/toolCallId），
  // 新渲染器据此呈现 denied 行（旧夹具的裸 denied 摘要在新端如实归 sys-unknown-tool-event）。
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "denied", turnId: "t-denied-e2e", summary: "写盘被拒：目标越界（e2e 生产形状）", detail: { toolName: "write_file", toolCallId: "call-denied-e2e", path: "../outside.ts" } } });
  await sleep(250);
  log("HAS_DENIED_INLINE=" + (await wc().executeJavaScript("document.querySelectorAll('#chat details.sys-denied').length")));
  log("HAS_DENIED_INLINE_ANY=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .sys-denied').length")));
  log("DENIED_REASON_VISIBLE=" + (await wc().executeJavaScript("[...document.querySelectorAll('#chat .sys-denied')].some((e)=>e.textContent.includes('拒绝') || e.textContent.includes('未放行') || e.textContent.includes('越界'))")));
  log("HAS_DENIED_GROUPED=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.includes('按根分组')")));
  const kindList = await wc().executeJavaScript("[...document.querySelectorAll('#chat .sys .sys-text')].map(e=>e.textContent)");
  const kinds = await wc().executeJavaScript("[...document.querySelectorAll('#chat .sys')].map(e=>e.className)");
  log("SYS_ROWS=" + kinds.join(" | "));
  void kindList;
  log("ACCEPTED_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .sys-ok').length")));
  log("SESSION_STATE_AFTER=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state || '(none)'"))); // 同上
  log("SHOT_02_CHAT=" + (await shot("02-chat.png")));

  // 4) 展开拒绝详情（内联、可展开看允许路径）
  await wc().executeJavaScript("document.querySelectorAll('#chat details.sys-denied').forEach(d=>{d.open=true;});");
  await sleep(300);
  log("DENIED_OPEN_COUNT=" + (await wc().executeJavaScript("document.querySelectorAll('#chat details.sys-denied[open]').length")));
  log("SHOT_03_DENIED=" + (await shot("03-denied.png")));

  // 5) 同角色重复点击 = 续接（不重建、不弹框）
  await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.textContent.includes('桌面窗口')); it && it.click(); })()",
  );
  await sleep(500);
  log("RESUME_HINT=" + (await wc().executeJavaScript("document.getElementById('composer-hint').textContent")));
  log("SESSION_STATE_AFTER_RESUME=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state || '(none)'"))); // 同上
  log("NO_MODAL_AFTER_RESUME=" + !(await modalExists()));

  // P0-2（2026-10-13 客户批准「跑飞轮次的停」；同日客户反馈后位置调整）：停止入口——**输入框区、
  // 发送钮左侧**的小圆钮；**仅忙碌时出现**（role-state 真实快照判据）；点击按三态在聊天流**如实一行**
  // （demo 替身不带 abort ⇒ 「当前运行时不支持停止」如实；轮次仍以 settled 收尾——此处不造乐观
  // 「已停止」假象）；空闲/快照复位即隐藏。**与发送钮并存**：发送钮绝不因忙碌被替换/禁用。
  log("STOP_IN_COMPOSER=" + (await wc().executeJavaScript("(() => { const h=document.getElementById('btn-halt'), c=document.getElementById('composer-capsule'), s=document.getElementById('btn-send'); return !!h && !!c && c.contains(h) && !!s && s.previousElementSibling === h; })()")));
  // 会话头按钮守卫（2026-10-16 v3 后重锚）：会话头只允许**已批准的**钮——引擎只读入口 + 图标簇
  // （#runtime-select / #tab-work / #tab-card，与桌面UI renderer.test.ts 同口径）；旧的单功能钮
  // （Pi 设置 / 停止 / 状态 pill——#btn-pi-settings/#btn-stop/#session-state）绝不回归。
  // 2026-10-31（run-change 触发）：会话头新增**已批准**的「契约变更 · 重开 run」入口（#run-change）——
  // 只在有 pinned run 时可用；此处项目无 pinned run ⇒ 应存在但禁用（禁用原因见 title）。
  log("CHAT_HEAD_ONLY_APPROVED_BUTTONS=" + (await wc().executeJavaScript("(() => { const ok=['runtime-select','tab-work','tab-card','tab-decisions','tab-tasks','run-change']; return [...document.querySelectorAll('.chat-head button')].every(b=>ok.includes(b.id)) && !document.querySelector('.chat-head #btn-pi-settings, .chat-head #btn-stop, .chat-head #session-state'); })()")));
  log("RUN_CHANGE_ENTRY_PRESENT=" + hardCheck("RUN_CHANGE_ENTRY_PRESENT", await wc().executeJavaScript("(() => { const b=document.getElementById('run-change'); return !!b && (b.textContent||'').includes('契约变更') && b.disabled === true && (b.title||'').length > 0; })()")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: false, summaries: [], queue: [], running: null })");
  await sleep(150);
  log("STOP_HIDDEN_WHEN_IDLE=" + (await wc().executeJavaScript("document.getElementById('btn-halt').hidden === true")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: true, summaries: ['你：在跑'], queue: [], running: null })");
  await sleep(150);
  log("STOP_VISIBLE_WHEN_BUSY=" + (await wc().executeJavaScript("document.getElementById('btn-halt').hidden === false")));
  await wc().executeJavaScript("document.getElementById('btn-halt').click()");
  await sleep(300);
  log("STOP_LINE_UNSUPPORTED=" + (await wc().executeJavaScript("[...document.querySelectorAll('#chat .chat-pane .sys-call')].some(function (p) { return p.textContent.indexOf('当前运行时不支持停止') >= 0; })")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: false, summaries: [], queue: [], running: null })");
  await sleep(150);
  log("STOP_HIDDEN_AFTER_SNAPSHOT_RESET=" + (await wc().executeJavaScript("document.getElementById('btn-halt').hidden === true")));

  // P0-1（2026-10-13 客户批准）：图片端到端——IPC 带载荷 → Interface 真实字节重校验 → 队列入队定格 →
  // 句柄整包透传 → demo 适配器收包记录（takeDemoPromptLog，**逐字断言**）。队列定格段用**慢轮缝**把
  // 「忙」变成确定态：首轮 prompt 挂起 → 第二条带图**入队** → 放行 → settled 后按序投递。
  chatAdapterMod.takeDemoPromptLog();
  const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  let releaseSlow;
  const slowPromise = new Promise((r) => { releaseSlow = r; });
  slowPromptGate = { promise: slowPromise };
  slowPromptArmed = true;
  const p1 = wc().executeJavaScript("window.desktop.sendSession('队列慢轮')"); // 不先 await：首轮挂起期间它持有忙态
  await sleep(400);
  // 并存钉（客户红线）：**真忙**（首轮在飞）时——停止钮出现、**发送钮仍可用**，且手发即入队
  // （停止钮与发送钮并存、各司其职；发送钮绝不因忙碌被替换/禁用）。
  log("STOP_VISIBLE_WITH_REAL_BUSY=" + (await wc().executeJavaScript("document.getElementById('btn-halt').hidden === false")));
  log("SEND_ENABLED_WHILE_BUSY=" + (await wc().executeJavaScript("document.getElementById('btn-send').disabled === false")));
  // data-state（程序化出口）随真实快照：真忙 ⇒ run（2026-10-13 修复后由 role-state 快照驱动）。
  log("DATA_STATE_RUN_WHILE_BUSY=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state === 'run'")));
  // P1-1（2026-10-13 客户裁定）：忙时**连发 3 条**（UI 真实路径）→ 抽屉里看全文 / 撤第 2 条 → 执行序 1、3。
  const sendUi = (text) =>
    wc().executeJavaScript("(() => { document.getElementById('inp-message').value=" + JSON.stringify(text) + "; document.getElementById('btn-send').click(); })()");
  await sendUi("队一");
  await sleep(250);
  const longQueued = "队二·需要完整全文的一条消息" + "（补足摘要截断的长度）".repeat(6); // >40 字 ⇒ 摘要被截断、有「全文」钮
  await sendUi(longQueued);
  await sleep(250);
  await sendUi("队三");
  await sleep(300);
  log("SEND_QUEUES_WHILE_BUSY=" + (await wc().executeJavaScript("document.getElementById('composer-hint').textContent.includes('已入队')")));
  // 打开「工作概览」抽屉 → 工作列表（原「角色资料」内的待办/队列节，V2 收敛后归此——见第 6 节核对）：
  // 3 行、每行（客户消息）带撤回；长文那条有「全文」。
  await wc().executeJavaScript("document.getElementById('tab-work').click()");
  await sleep(400);
  const qInfo = await wc().executeJavaScript(
    "(() => { const rows=[...document.querySelectorAll('#right-queue-body .q-item')]; return { n: rows.length, withdrawables: rows.filter(r=>r.querySelector('.q-withdraw')).length, fullBtns: rows.filter(r=>r.querySelector('.q-toggle')).length }; })()",
  );
  log("QUEUE_ROWS_THREE=" + (qInfo.n === 3) + " QUEUE_WITHDRAW_ON_MESSAGES=" + (qInfo.withdrawables === 3) + " QUEUE_FULL_TOGGLE_ON_LONG=" + (qInfo.fullBtns === 1)); // 只长文那条出「全文」
  await wc().executeJavaScript("(() => { const rows=[...document.querySelectorAll('#right-queue-body .q-item')]; const t=rows.find(r=>r.textContent.includes('队二')); const b=t && t.querySelector('.q-toggle'); if (b) b.click(); })()");
  await sleep(250);
  const expandInfo = await wc().executeJavaScript(
    "(() => { const rows=[...document.querySelectorAll('#right-queue-body .q-item')]; const t=rows.find(r=>r.textContent.includes('队二')); const b=t? t.querySelector('.q-toggle'):null; const f=t? t.querySelector('.q-full'):null; return { bText: b ? b.textContent : '(none)', fHidden: f ? f.hidden : '(none)', hasLong: f ? f.textContent.indexOf('需要完整全文') >= 0 : false }; })()",
  );
  log("QUEUE_EXPAND_EVIDENCE=" + JSON.stringify(expandInfo));
  log("QUEUE_EXPAND_FULL=" + (expandInfo.bText === "收起" && expandInfo.fHidden === false && expandInfo.hasLong === true));
  // 撤第 2 条（长文那条）：聊天流如实一行 + 队列减到 2（位次前移走既有快照）。
  await wc().executeJavaScript(
    "(() => { const rows=[...document.querySelectorAll('#right-queue-body .q-item')]; const t=rows.find(r=>r.textContent.includes('队二')); if (t) { const b=t.querySelector('.q-withdraw'); if (b) b.click(); } })()",
  );
  await sleep(500);
  log(
    "Q_WITHDRAW_LINE=" +
      (await wc().executeJavaScript(
        "[...document.querySelectorAll('#chat .chat-pane .sys-call')].some(function (p) { return p.textContent.indexOf('已撤回排队消息：') >= 0; })",
      )),
  );
  log("QUEUE_ROWS_AFTER_WITHDRAW=" + (await wc().executeJavaScript("document.querySelectorAll('#right-queue-body .q-item').length === 2")));
  // 派发条目只读：按当前渲染快照 + 一条 dispatch 注入 → 派发行**无撤回钮**（呈现与语义同口径）。
  const injQueue = await wc().executeJavaScript(
    "(() => { const s=window.__ansRenderer.state; const src=(s.queueItemsByRole && s.queueItemsByRole['桌面窗口']) || []; const q=src.map(function(i){return {kind:i.kind,sourceRoleId:i.sourceRoleId,summary:i.summary,at:i.at,id:i.id,full:i.full};}); q.push({kind:'dispatch',sourceRoleId:'su',summary:'派发 · 来自 su：做X',at:'2026-10-13T03:00:00.000Z',id:'e2e-dispatch-1',full:'派发任务：做X'}); return q; })()",
  );
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: true, summaries: [], queue: " + JSON.stringify(injQueue) + ", running: null })");
  await sleep(400);
  log(
    "DISPATCH_ROW_NO_WITHDRAW=" +
      (await wc().executeJavaScript(
        "(() => { const rows=[...document.querySelectorAll('#right-queue-body .q-item')]; const d=rows.find(r=>r.textContent.includes('su 派发')); return !!d && !d.querySelector('.q-withdraw'); })()",
      )),
  );
  log("DISPATCH_ROW_NO_WITHDRAW_NEW=" + (await wc().executeJavaScript("(() => { const rows=[...document.querySelectorAll('#right-queue-body .q-item')]; const d=rows.find((r)=>r.textContent.includes('派发')); return !!d && !d.querySelector('.q-withdraw'); })()")));
  await wc().executeJavaScript("document.getElementById('tab-work').click()"); // 收起抽屉（再点同钮），回到聊天流
  await sleep(250);
  const imgArg = JSON.stringify([{ type: "image", data: tinyPng, mimeType: "image/png" }]);
  const r2 = await wc().executeJavaScript("window.desktop.sendSession('排队带图', " + imgArg + ")");
  log("IMG_QUEUE_FROZEN=" + (r2 && r2.queued === true));
  releaseSlow(); // 放行首轮 → settled → 队列按序投递带图条目
  const r1 = await p1;
  await sleep(800); // 等 settled 消费 + 队列 drain（第二条带图投递）
  const plog = chatAdapterMod.takeDemoPromptLog();
  const flat = (s) => String(s).replace(/\s+/g, " ").slice(0, 24);
  // 证据行：demo 收包记录（排队带图带 img=true；其余为慢轮与回交投递的纯文本轮）。
  log(
    "IMG_SLOW_ROUND_OK=" + (r1 && r1.ok === true) +
      " IMG_DEMO_LOG=" + JSON.stringify(plog.map((r) => ({ t: flat(r.text), img: !!(r.opts && r.opts.images && r.opts.images.length) }))),
  );
  // P1-1 验收：撤掉第 2 条后，**执行序 = 队一 → 队三 → 排队带图**；「队二…」绝不进入执行。
  const idxOf = (t) => plog.findIndex((r) => r.text === t);
  const iT1 = idxOf("队一");
  const iT3 = idxOf("队三");
  const iImg = idxOf("排队带图");
  const iT2 = plog.findIndex((r) => r.text.indexOf("队二") === 0);
  log("QUEUED_EXECUTION_ORDER_1_3=" + (iT1 >= 0 && iT3 >= 0 && iImg >= 0 && iT1 < iT3 && iT3 < iImg && iT2 < 0));
  // 轮末复位（2026-10-13 修复钉）：settle 后 data-state 回 idle；settled 行如实出现在聊天流（该出现就出现）。
  log("DATA_STATE_IDLE_AFTER_ROUND=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state === 'idle'")));
  log("SETTLED_ROW_PRESENT=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .chat-pane .sys-settled').length >= 1")));
  const imgOk = (r) =>
    !!r && !!r.opts && Array.isArray(r.opts.images) && r.opts.images.length === 1 &&
    r.opts.images[0].type === "image" && r.opts.images[0].data === tinyPng && r.opts.images[0].mimeType === "image/png";
  log("IMG_PASSTHROUGH_QUEUED=" + imgOk(plog.find((r) => r.text === "排队带图")));
  // 直发带图（空闲路径）：同样逐字透传；纯文本路径不构造空包（opts 缺省）。
  const rDirect = await wc().executeJavaScript("window.desktop.sendSession('直发带图', " + imgArg + ")");
  await sleep(700);
  const plog2 = chatAdapterMod.takeDemoPromptLog();
  log("IMG_SEND_OK=" + (rDirect && rDirect.ok === true) + " IMG_PASSTHROUGH_DIRECT=" + imgOk(plog2.find((r) => r.text === "直发带图")));
  // 校验拒绝路径（**主进程重校验**，不信任渲染侧）：坏 MIME（真字节非图）与超大（>5MB）都整条拒发。
  const rejBad = await wc().executeJavaScript("window.desktop.sendSession('坏图', [{type:'image', data:'aGVsbG8gd29ybGQ=', mimeType:'image/png'}])");
  log("IMG_REJECT_BAD_MIME=" + (rejBad && rejBad.ok === false && (rejBad.error || "").indexOf("图片未发送") >= 0));
  const rejBig = await wc().executeJavaScript("window.desktop.sendSession('大图', [{type:'image', data:'QQ=='.repeat(3 * 1024 * 1024), mimeType:'image/png'}])");
  log("IMG_REJECT_OVERSIZE=" + (rejBig && rejBig.ok === false));
  // 旧「图片未发送」提示行退役：聊天流不出现该文案（接线后图片真正随消息送进模型）。
  log("IMG_LEGACY_NOTE_ABSENT=" + (await wc().executeJavaScript("!document.getElementById('chat').textContent.includes('张图片未发送') && !document.getElementById('chat').textContent.includes('尚未接线')")));

  // 6) 右栏抽屉（客户裁定 2026-10-13：右栏不常驻，收成右上角图标簇；点开展示、再点收起；
  //    第二轮裁定同日：待办/队列归角色；UIUX v2：并入**单份工作列表**〔当前工作+排队；空态一条说明——
  //    "空态不保留两份列表"（interaction-v1 §资料）〕）。
  //    2026-10-16 V2/v3 收敛后结构核对（本段重锚的依据）：图标簇 = 〔引擎只读入口｜工作概览｜角色资料〕——
  //    工作列表归「工作概览」抽屉（#tab-work），资料四组归「角色资料」抽屉（#tab-card）；Pi 设置入口在
  //    左栏底部（见第 7 节 PI_ENTRY_IN_SIDEBAR_FOOT）。
  //    先断言默认收起，点 tab-card 展示 → 资料四组（角色卡/边界/变更/文档）在抽屉内；切 tab-work →
  //    工作列表（单份列表）在抽屉内；再点同钮收起。
  log("TABS_PRESENT=" + (await wc().executeJavaScript("['tab-work','tab-card','tab-pi'].every(id=>!!document.getElementById(id))")));
  log("NO_RETIRED_TABS=" + (await wc().executeJavaScript("!document.getElementById('tab-todo') && !document.getElementById('tab-queue')")));
  log("NO_RIGHT_COLUMN=" + (await wc().executeJavaScript("!document.querySelector('.col-right')")));
  log("DRAWER_DEFAULT_CLOSED=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));
  await wc().executeJavaScript("document.getElementById('tab-card').click()");
  await sleep(400);
  log("DRAWER_OPENS_ON_TAB=" + (await wc().executeJavaScript("(() => { const d=document.getElementById('right-drawer'); return d.classList.contains('open') && d.getBoundingClientRect().right <= window.innerWidth + 1; })()")));
  log("TAB_CARD_ACTIVE=" + (await wc().executeJavaScript("document.getElementById('tab-card').classList.contains('active')")));
  log("DRAWER_TITLE_CARD=" + (await wc().executeJavaScript("(document.getElementById('drawer-title')||{textContent:''}).textContent")));
  await wc().executeJavaScript(
    "[...document.querySelectorAll('#right-body details.sec > summary')].forEach(s=>{ if(!s.parentElement.open) s.click(); });",
  );
  await sleep(400);
  const right = await wc().executeJavaScript(
    "(() => { const t=document.querySelector('#right-body').textContent; return { card:t.includes('角色卡'), boundary:t.includes('边界条目'), rows:document.querySelectorAll('#right-body table.boundary tbody tr').length, changelog:t.includes('变更记录'), docs:t.includes('文档'), mdCard:!!document.querySelector('#right-body .card-text.card-md h1'), mdNoScript:!document.querySelector('#right-body .card-text script') }; })()",
  );
  log("RIGHT_HAS_CARD=" + right.card);
  log("RIGHT_HAS_BOUNDARY=" + right.boundary + " RIGHT_BOUNDARY_ROWS=" + right.rows);
  log("RIGHT_HAS_CHANGELOG=" + right.changelog + " RIGHT_HAS_DOCS=" + right.docs);
  // N-2（2026-10-12 客户裁定）：角色卡已走 Markdown（标题成 <h1> 标签）；且无 <script> 注入口。
  log("RIGHT_CARD_MD_RENDERED=" + right.mdCard);
  log("RIGHT_CARD_MD_NO_SCRIPT=" + right.mdNoScript);
  // 工作列表（原「待办 / 队列」节）在「工作概览」抽屉（V2 收敛后归位至此——原断言在 tab-card 内，
  // 该载体已随抽屉拆分迁走）：切到 tab-work 断言工作列表区在、单份列表口径不变
  // （原「队列概览」独立节已按 UIUX v2 并入，不保留第二份视图）。
  await wc().executeJavaScript("document.getElementById('tab-work').click()");
  await sleep(400);
  log("TAB_WORK_ACTIVE=" + (await wc().executeJavaScript("document.getElementById('tab-work').classList.contains('active')")));
  log("DRAWER_TITLE_WORK=" + (await wc().executeJavaScript("(document.getElementById('drawer-title')||{textContent:''}).textContent")));
  const workRight = await wc().executeJavaScript(
    "(() => { const t=document.querySelector('#right-body'); return { todo:!!t.querySelector('#right-queue-body'), singleList:!!t.querySelector('#right-queue-body') && !t.querySelector('#right-queue-overview') }; })()",
  );
  log("RIGHT_HAS_TODO_SECTION=" + workRight.todo + " RIGHT_QUEUE_SINGLE_LIST=" + workRight.singleList);
  // 再点同图标 = 收起；Esc 也能收起（开 → Esc → 收）。
  await wc().executeJavaScript("document.getElementById('tab-work').click()");
  await sleep(300);
  log("DRAWER_TOGGLES_CLOSED=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));
  await wc().executeJavaScript("document.getElementById('tab-pi').click()");
  await sleep(200);
  await wc().executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(200);
  log("DRAWER_ESC_CLOSES=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));
  // 角标归角色（收起不丢信息）：注入该角色的真实快照（排队 2 条）→ 收起状态下**工作概览**图标角标 =
  // 该角色待办深度（V2 收敛后角标挂在「工作概览」钮上——原挂在「角色资料」钮；同一 role-state 快照，
  // 无新数据源）。
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: true, summaries: ['你：排队一', '你：排队二'], queue: [{kind:'message',sourceRoleId:'桌面窗口',summary:'你：排队一',at:'2026-10-13T03:00:00.000Z'},{kind:'dispatch',sourceRoleId:'su',summary:'派发 · 来自 su：做X',at:'2026-10-13T03:01:00.000Z'}], running: null })");
  await sleep(200);
  log("BADGE_ON_WORK_WHILE_COLLAPSED=" + (await wc().executeJavaScript("(() => { const b=document.querySelector('#tab-work .tab-badge'); return !!b && !b.hidden && b.textContent === '2'; })()")));
  log("BADGE_ROLE_SINGLE_COUNT_WHILE_COLLAPSED=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面窗口')>=0); const c=it && it.querySelector('.ti-count'); return !!c && c.textContent.trim()==='3' && (c.getAttribute('title')||'').includes('排队 2 项'); })()")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: false, summaries: [], queue: [], running: null })");
  await sleep(150);
  // 防御式（本批修复）：元素缺失时如实报 false，绝不空指针崩溃（原实现直接解引用 `.hidden`）。
  log("BADGES_CLEAR_ON_EMPTY=" + (await wc().executeJavaScript("(() => { const b=document.querySelector('#tab-work .tab-badge'); return !!b && b.hidden === true; })()")));
  log("BADGES_CLEAR_ON_EMPTY_NEW=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面窗口')>=0); return !!it && !it.querySelector('.ti-count'); })()")));
  log("SHOT_04_PROFILE=" + (await shot("04-profile.png")));

  // 7) 守卫（客户 2026-10-11 裁定：去掉运行时选择器、默认跑 pi）——断言**它不存在**。
  //    留守卫它就不会长回来。同时断言：提示与写入语义已上移横栏、底部只剩输入框 + 发送。
  const noSelector = await wc().executeJavaScript(
    "(() => ({ sel: !!document.getElementById('inp-runtime'), rtSel: !!document.querySelector('.rt-select'), selects: document.querySelectorAll('select').length }))()",
  );
  log("NO_RUNTIME_SELECTOR=" + (!noSelector.sel));
  log("NO_RT_SELECT_CLASS=" + (!noSelector.rtSel));
  log("NO_SELECT_ELEMENTS=" + (noSelector.selects === 0));
  log("RUNTIME_NOTE_IN_COMPOSE_NOTE=" + (await wc().executeJavaScript("!!document.querySelector('.compose-note #runtime-note')")));
  log("NO_PI_BUTTON_IN_HEADER=" + (await wc().executeJavaScript("!document.querySelector('.chat-head #btn-pi-settings') && !document.querySelector('.chat-head #btn-stop') && !document.getElementById('session-state')"))); // 客户 2026-10-13：结束会话/状态 pill 删除；Pi 设置入口现居左栏底部（V2 收敛后）
  // Pi 设置入口位置重锚（同上）：原在右上角图标簇内（#right-tabs #tab-pi）→ 现为左栏底部「设置」钮
  // （#tab-pi.sidebar-settings，仍在且唯一）；断言入口存在且归位到 .sidebar-foot。
  log("PI_ENTRY_IN_SIDEBAR_FOOT=" + (await wc().executeJavaScript("(() => { const b=document.getElementById('tab-pi'); return !!b && !!b.closest('.sidebar-foot'); })()")));
  log("RUNTIME_NOTE_WRITES_IMPORTED=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('实际写入导入项目')")));
  log("RUNTIME_NOTE_ONE_LINE_GATED=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('角色边界外的写入会被拒绝')")));
  // 底部输入区（K-1 起：附件行 + **胶囊输入框**〔内嵌发送箭头〕；2026-10-16 v3 归位：胶囊下带
  // `.compose-note` 说明行——写入语义 `#runtime-note` 在此（原在会话头横栏，见 SU_WRITE_NOTE_IN_COMPOSE_NOTE）；
  // 无选择器、无 Pi 面板、无 bootstrap 动作；状态提示在会话通知条 `#composer-hint`（在 .composer 之外））。
  // clean：runtime-note 的「不存在」检查改为「只可在 `.compose-note` 这一处」——位置被钉死，不是放松。
  const composer = await wc().executeJavaScript(
    "(() => { const c=document.querySelector('.composer'); return { rows: c.children.length, hasTextarea: !!c.querySelector('#inp-message'), hasSend: !!c.querySelector('#btn-send'), capsule: !!c.querySelector('#composer-capsule.capsule'), sendInCapsule: !!(c.querySelector('#composer-capsule #btn-send')), attachBtn: !!c.querySelector('#composer-capsule #btn-attach-image'), attachRow: !!c.querySelector('#attach-row'), note: !!c.querySelector('.compose-note #runtime-note'), clean: !c.querySelector('select') && !c.querySelector('#composer-hint') && !c.querySelector('#pi-panel') && !c.querySelector('#bootstrap-action') }; })()",
  );
  log("COMPOSER_CHILD_ROWS=" + composer.rows);
  log("COMPOSER_ROWS_ARE_ATTACH_CAPSULE_NOTE=" + (composer.rows === 3 && composer.attachRow && composer.capsule && composer.note));
  log("COMPOSER_HAS_TEXTAREA_SEND=" + (composer.hasTextarea && composer.hasSend));
  log("COMPOSER_SEND_INSIDE_CAPSULE=" + composer.sendInCapsule);
  log("COMPOSER_ATTACH_BTN=" + composer.attachBtn);
  log("COMPOSER_CLEAN=" + composer.clean);
  log("SHOT_12_COMPOSER=" + (await shot("12-composer.png")));

  // 8) T17：未-bootstrap 一等状态 + 左树随 project:changed 刷新（用**临时空项目**，不写仓库）。
  const tmpProj = fs.mkdtempSync(path.join(OUTDIR, "proj-"));
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(tmpProj) + ")");
  await sleep(400);
  await ensurePiRuntime();
  log("BOOTSTRAP_HAS_ROLES=" + (await wc().executeJavaScript("window.__ansRenderer.state.hasRoles")));
  log("BOOTSTRAP_PRIMARY=" + (await wc().executeJavaScript("window.__ansRenderer.state.primaryRoleId")));
  log("BOOTSTRAP_DEFAULT_SELECTED=" + (await wc().executeJavaScript("window.__ansRenderer.state.selectedRoleId")));
  log("BOOTSTRAP_ROLE_COUNT=" + (await wc().executeJavaScript("window.__ansRenderer.state.roles.length")));
  // 守卫（客户裁定：这件事只说一遍，且只在中栏正中）：整页「项目尚未 bootstrap」**只出现一次**——
  // 统计**最内层**匹配元素（父链上的祖先也都包含它，故只数最内层）应恰为 1，且就是中栏空状态标题。
  const bootMentions = await wc().executeJavaScript(
    "(() => { const ph='项目尚未 bootstrap'; const hits=[...document.querySelectorAll('body *')].filter(el=>el.textContent.includes(ph)); const inner=hits.filter(el=>![...el.children].some(c=>c.textContent.includes(ph))); return { count: inner.length, classes: inner.map(e=>e.className||e.tagName) }; })()",
  );
  log("BOOTSTRAP_MENTION_COUNT=" + bootMentions.count);
  log("BOOTSTRAP_MENTION_IN_CENTER_EMPTY=" + (bootMentions.count === 1 && bootMentions.classes[0] === "empty-title"));
  log("BOOTSTRAP_CENTER_CTA_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .chat-empty #btn-start-primary')")));
  log("BOOTSTRAP_EMPTY_STATE_SINGLE_TITLE=" + (await wc().executeJavaScript("(() => { const titles=[...document.querySelectorAll('#chat .chat-empty .empty-title')]; return titles.length===1 && titles[0].textContent.trim()!==''; })()")));
  log("BOOTSTRAP_EMPTY_STATE_ACTION_OR_REASON=" + (await wc().executeJavaScript("(() => { const empty=document.querySelector('#chat .chat-empty'); if (!empty) return false; const action=!!empty.querySelector('#btn-governance-empty-action,#btn-start-primary'); const sub=(empty.querySelector('.empty-sub')||{textContent:''}).textContent; return action || sub.trim()!==''; })()")));
  // 左栏那块独立提示**不存在**（断言「它不在」）——DOM 元素与样式钩子都应已清掉；留着守卫它就不会长回来。
  log("BOOTSTRAP_LEFT_NOTICE_ABSENT=" + (await wc().executeJavaScript("document.getElementById('bootstrap-notice') === null")));
  log("BOOTSTRAP_NO_LEFT_NOTICE_ELEMENT=" + (await wc().executeJavaScript("[...document.querySelectorAll('body *')].every(el=>!el.classList.contains('bootstrap-notice'))")));
  // 状态提示条不再重复它：未 bootstrap 时状态提示留空；写入语义常驻输入区下沿
  // （#runtime-note 仍在，归位 `.compose-note`——原在会话头横栏）。
  log("BOOTSTRAP_HINT_EMPTY=" + (await wc().executeJavaScript("document.getElementById('composer-hint').textContent.trim() === ''")));
  log("WRITE_NOTE_REMAINS_IN_COMPOSE_NOTE=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('runtime-note'); return !!el && !!el.closest('.compose-note') && el.textContent.includes('角色边界外的写入会被拒绝'); })()")));
  // 守卫：「只读」徽标已按客户裁定移除——**任何**项目状态（含创世态）下 su 都不该出现它。
  log("BOOTSTRAP_SU_NO_READONLY_BADGE=" + (await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); return !(it && it.querySelector('.ti-badge.readonly')) && !(it && (it.getAttribute('aria-description')||'').includes('只读')); })()",
  )));
  log("SHOT_05_BOOTSTRAP=" + (await shot("05-bootstrap.png")));

  // 造一个角色目录（模拟 su 建出角色），再由主进程发 project:changed → 渲染侧重取枚举 → 左树长出（§10.3）。
  const rdir = path.join(tmpProj, "角色卡", "示例角色");
  fs.mkdirSync(rdir, { recursive: true });
  fs.writeFileSync(path.join(rdir, "role-card.md"), "# 示例角色\n演示用角色。\n");
  fs.writeFileSync(path.join(rdir, "boundary.yaml"), "entries:\n  - kind: file\n    path: src/x.ts\n    purpose: t\n");
  wc().send("project:changed");
  await sleep(600);
  log("REFRESH_HAS_ROLES=" + (await wc().executeJavaScript("window.__ansRenderer.state.hasRoles")));
  log("REFRESH_ROLE_COUNT=" + (await wc().executeJavaScript("window.__ansRenderer.state.roles.length")));
  log("REFRESH_HAS_EXAMPLE=" + (await wc().executeJavaScript("window.__ansRenderer.state.roles.some(r=>r.roleId==='示例角色')")));
  log("REFRESH_TREE_HAS_EXAMPLE=" + (await wc().executeJavaScript("[...document.querySelectorAll('#role-tree .ti-name')].some(e=>e.textContent==='示例角色')")));
  log("REFRESH_OTHER_GROUP_SHOWN=" + (await wc().executeJavaScript("[...document.querySelectorAll('#role-tree .tree-group')].some(e=>e.textContent.includes('其他角色'))")));
  // 左栏那块独立提示始终**不存在**（刷新前后皆然）；且「项目尚未 bootstrap」**未因刷新而长出第二份**
  // （它至多只在中栏正中出现一次）。
  log("REFRESH_LEFT_NOTICE_STAYS_ABSENT=" + (await wc().executeJavaScript("document.getElementById('bootstrap-notice') === null")));
  const refreshMentions = await wc().executeJavaScript(
    "(() => { const ph='项目尚未 bootstrap'; const hits=[...document.querySelectorAll('body *')].filter(el=>el.textContent.includes(ph)); return hits.filter(el=>![...el.children].some(c=>c.textContent.includes(ph))).length; })()",
  );
  log("REFRESH_BOOTSTRAP_MENTION_AT_MOST_ONE=" + (refreshMentions <= 1));
  // 守卫：造出角色后（hasRoles:true）su 仍**不该**出现「只读」徽标——它已被移除，与项目状态无关。
  log("REFRESH_SU_NO_READONLY_BADGE=" + (await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); return !(it && it.querySelector('.ti-badge.readonly')) && !(it && (it.getAttribute('aria-description')||'').includes('只读')); })()",
  )));
  log("SHOT_06_REFRESH=" + (await shot("06-refresh.png")));

  // 7b) D-1 重启恢复：给 示例角色 与 su 各写一份**手写最小 JSONL** 夹具（首行 header + entry），重载项目 →
  //     主进程只读解析并推规范化行 → 各自 pane 回放（分隔提示 + is-replay + Markdown 渲染）+ 徽标
  //     「空闲（已恢复）」；并断言**跨角色不串**（su 的 pane 不得含 示例角色 的文本）。
  const sessExample = path.join(tmpProj, ".ans", "sessions", "示例角色");
  const sessSu = path.join(tmpProj, ".ans", "sessions", "su");
  fs.mkdirSync(sessExample, { recursive: true });
  fs.mkdirSync(sessSu, { recursive: true });
  const mkD1Header = (id) => JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-12T01:00:00.000Z", cwd: tmpProj });
  const mkD1Msg = (id, message) => JSON.stringify({ type: "message", id, parentId: null, timestamp: "2026-10-12T01:00:01.000Z", message });
  fs.writeFileSync(
    path.join(sessExample, "s.jsonl"),
    [
      mkD1Header("ex1"),
      mkD1Msg("1", { role: "user", content: "示例角色的历史问题" }),
      mkD1Msg("2", { role: "assistant", content: [{ type: "text", text: "示例角色的**历史回答**" }] }),
    ].join("\n"),
  );
  fs.writeFileSync(path.join(sessSu, "s.jsonl"), [mkD1Header("su1"), mkD1Msg("1", { role: "user", content: "SU 的历史问题" })].join("\n"));

  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(tmpProj) + ")");
  await sleep(700);
  await ensurePiRuntime();
  // 「空闲（已恢复）」徽标在**未开启会话**时成立（回放已到、句柄未开）——**先**探徽标，再点开角色
  // （点开即开会话 ⇒ live ⇒ 徽标转「空闲」，这是「点角色即开」的既有语义，不是缺陷）。
  // 诊断（临时）：手动重发 su 的记录——若重发能回放，则「原始 payload 未达渲染侧」（IPC 时序）；若也不能，则渲染侧问题。
  await sleep(250);
  log("RESTORE_BADGE_IS_RESTORED=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((e)=>e.querySelector('.ti-name').textContent==='示例角色'); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-restored') && s.textContent.includes('空闲（已恢复）'); })()")));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('示例角色')");
  await sleep(600);
  // 客户裁定（2026-10-13）：常规「会话已恢复…」分隔行已删——成功回放不得出现分隔行（错误分支除外）。
  log("RESTORE_NO_SUCCESS_DIVIDER=" + (await wc().executeJavaScript("document.querySelector('#chat .sys-replay-divider') === null")));
  log("RESTORE_ROWS_PRESENT=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .is-replay').length > 0")));
  log("RESTORE_MD_RENDERED=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-assistant.is-replay strong')")));
  // D-1 契约：失真文案「模型上下文已重启」已退役——恢复场景不得出现它（文案分支由 role-status.js 唯一映射）。
  log("RESTORE_NO_STALE_RESTART_NOTE=" + (await wc().executeJavaScript("!document.querySelector('#chat').textContent.includes('模型上下文已重启')")));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(600);
  log("RESTORE_SU_CHAT_SNIPPET=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.slice(0, 160)")));
  log("RESTORE_SU_RESTORED_FLAG=" + (await wc().executeJavaScript("JSON.stringify(window.__ansRenderer.state.roleMeta['su'] || null)")));
  log("RESTORE_SU_REPLAY_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .is-replay').length")));
  log("RESTORE_SU_OWN_TEXT=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.includes('SU 的历史问题')")));
  log("RESTORE_NO_CROSSTALK=" + (await wc().executeJavaScript("!document.querySelector('#chat').textContent.includes('示例角色的历史问题')")));
  log("SHOT_12_RESTORE=" + (await shot("12-restore.png")));

  // 7c) 真机缺陷修复（2026-10-12）：交互卡**严格投递所属 pane**——请求属于非当前查看的角色时：
  //     不落当前 pane（不串卡）、左树徽标亮「等待你确认」、当前 pane 出**只读指针**；切回见卡并作答；
  //     重复推送（同 id）**幂等一张**；对已死请求（通道无挂起）作答 → **过期定格**（不解冻重试）。
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(800);
  const pX = customerChannel.customerInput(
    { kind: "choice", title: "选个目录名", options: [{ id: "a", label: "alpha" }] },
    { roleId: "示例角色" },
  );
  await sleep(300);
  const xId = operatorPresentations[operatorPresentations.length - 1].id;
  log("OPX_NOT_IN_VIEWED_PANE=" + (await wc().executeJavaScript("!document.querySelector('#chat .op-request') && Object.prototype.hasOwnProperty.call(window.__ansRenderer.state.pendingOperator," + JSON.stringify(xId) + ")")));
  log("OPX_POINTER_IN_VIEWED_PANE=" + (await wc().executeJavaScript("!!document.querySelector('#tab-decisions .tab-badge')")));
  log("OPX_BADGE_LIT=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((e)=>e.querySelector('.ti-name').textContent==='示例角色'); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-confirm'); })()")));
  log("OPX_CARD_ON_RETURN=" + (await wc().executeJavaScript("!!document.querySelector('#decision-dialog .dd-submit')")));
  // 重复推送（同一 id 的原始推送 ×2）→ 模型 pending 表恰一条、无第二张可作答卡。
  wc().send("session:operator-request", { id: "dup-1", roleId: "示例角色", request: { kind: "confirm", title: "重复？" } });
  wc().send("session:operator-request", { id: "dup-1", roleId: "示例角色", request: { kind: "confirm", title: "重复？" } });
  await sleep(250);
  log("OPX_DUP_SINGLE_CARD=" + (await wc().executeJavaScript("Object.keys(window.__ansRenderer.state.pendingOperator).filter((id)=>id==='dup-1').length === 1 && document.querySelectorAll('#chat .op-request').length === 0")));
  // 打开待办中 dup-1 → 模态作答 → 通道无挂起 ⇒ expired + 决策中心历史（不是聊天卡）。
  await wc().executeJavaScript("document.getElementById('tab-decisions').click()");
  await sleep(150);
  await wc().executeJavaScript("document.querySelector('#decision-center-pending .dc-item[data-request-id=\"dup-1\"] .dc-open').click()");
  await sleep(200);
  log("OPX_DUP_DIALOG_OPEN=" + (await wc().executeJavaScript("!!document.querySelector('#decision-dialog[data-request-id=\"dup-1\"]')")));
  await wc().executeJavaScript("document.querySelector('#decision-dialog .dd-confirm').click()");
  await sleep(400);
  await wc().executeJavaScript("document.getElementById('tab-decisions').click()");
  await sleep(220);
  log("OPX_EXPIRED_HISTORY=" + hardCheck("OPX_EXPIRED_HISTORY", await wc().executeJavaScript("(() => { const h=document.getElementById('decision-center-history'); return !!h && h.textContent.includes('重复？') && h.textContent.includes('已失效') && !Object.prototype.hasOwnProperty.call(window.__ansRenderer.state.pendingOperator,'dup-1'); })()")));
  // 退回到 x 卡并作答。
  await wc().executeJavaScript("document.getElementById('tab-decisions').click()");
  await sleep(150);
  await wc().executeJavaScript("(() => { const item=document.querySelector('#decision-center-pending .dc-item[data-request-id=" + JSON.stringify(xId) + "] .dc-open'); if (item) item.click(); })()");
  await sleep(180);
  const xCardExpr = (body) => "(() => { const c=document.querySelector('#decision-dialog[data-request-id=" + JSON.stringify(xId) + "]'); " + body + " })()";
  await wc().executeJavaScript(xCardExpr("const r=c && c.querySelector('input'); if (r) r.click();"));
  await sleep(120);
  await wc().executeJavaScript(xCardExpr("const b=c && c.querySelector('.dd-submit'); if (b) b.click();"));
  await sleep(300);
  const oX = await withTimeout(pX, 3000, "opx");
  log("OPX_ANSWERED=" + (!!oX && oX.outcome === "answered"));
  log("OPX_BADGE_CLEARED=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((e)=>e.querySelector('.ti-name').textContent==='示例角色'); const s=it && it.querySelector('.ti-status'); return !!s && !s.className.includes('st-confirm'); })()")));
  log("SHOT_14_OP_CROSSPANE=" + (await shot("14-operator-crosspane.png")));

  // 8b) A-5 客户交互卡：以**真实通道**推四种请求（带预览的确认 / 单选 / 多选 / 纯确认守卫）→
  //     卡片渲染（折叠预览、radio/checkbox、提交禁用态）→ 作答经**真实通道**校验回传 → 定格；
  //     负例：伪造 id / 不在请求中的选项 → **不受理**；取消 → declined；B-3「等待你确认」随请求亮/灭。
  //     落点在**临时**空项目（绝不出仓库）。
  const opProj = fs.mkdtempSync(path.join(OUTDIR, "genesis-"));
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(opProj) + ")");
  await sleep(400);
  await ensurePiRuntime();
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(800);
  log("OP_PANE_DIAG=" + JSON.stringify(await wc().executeJavaScript("(() => ({ hasRoles: window.__ansRenderer.state.hasRoles, selectedRoleId: window.__ansRenderer.state.selectedRoleId, roleIds: (window.__ansRenderer.state.roles || []).map((r) => r.roleId), paneRoleIds: [...document.querySelectorAll('#chat .chat-pane')].map((p) => p.dataset.roleId), anyCards: document.querySelectorAll('#chat .op-request').length }))()")));
  log("OP_NO_CARD_BEFORE_REQUEST=" + (await wc().executeJavaScript("!document.querySelector('#chat .op-request')")));
  // Phase 5A：React 受控选择用 click() 驱动并按请求 id 精确定位（直接改 .checked 不触发 onChange）。
  const opCardExpr = (id, body) => "(() => { const c=document.querySelector('[data-request-id=" + JSON.stringify(id) + "]'); " + body + " })()";

  // ① 带预览的确认：preview 折叠块（默认收起）+ B-3 状态点亮；点 [确认] → answered/confirmed:true；定格。
  const pOp1 = customerChannel.customerInput(
    {
      kind: "confirm",
      title: "要写出角色卡「示例角色」吗？",
      preview: "# 角色卡：示例角色\n\n边界将含：\n- 角色卡/示例角色/role-card.md\n- 角色卡/示例角色/boundary.yaml",
      detail: "确认后按其边界写入。",
    },
    { roleId: "su" },
  );
  await sleep(300);
  log("OP_CARD_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#decision-dialog')")));
  log("OP_CARD_TITLE_SHOWS=" + (await wc().executeJavaScript("(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('示例角色')")));
  log("OP_PREVIEW_COLLAPSED=" + (await wc().executeJavaScript("(() => { const d=document.querySelector('#decision-dialog .dd-preview'); return !!d && d.textContent.includes('角色卡'); })()")));
  log("OP_B3_AWAITING_CONFIRM=" + (await wc().executeJavaScript("!!document.querySelector('#tab-decisions .tab-badge') && !!document.querySelector('#decision-dialog')")));
  log("SHOT_11_OPERATOR=" + (await shot("11-operator-card.png")));
  await wc().executeJavaScript("(() => { const b=document.querySelector('#decision-dialog .dd-confirm'); if (b) b.click(); })()");
  await sleep(300);
  const oOp1 = await withTimeout(pOp1, 3000, "op1");
  log("OP_CONFIRM_ANSWERED=" + (!!oOp1 && oOp1.outcome === "answered" && oOp1.value.confirmed === true));
  log("OP_CARD_FROZEN=" + (await wc().executeJavaScript("!document.querySelector('#decision-dialog')")));
  log("OP_B3_AWAITING_CLEARED=" + (await wc().executeJavaScript("!document.querySelector('#tab-decisions .tab-badge')")));

  // ② 单选（radio）：未选时提交禁用 → 选一项 → 提交 → selected 回传。
  const pOp2 = customerChannel.customerInput(
    { kind: "choice", title: "选一个角色目录名", options: [{ id: "alpha", label: "alpha" }, { id: "beta", label: "beta" }] },
    { roleId: "su" },
  );
  await sleep(600);
  const op2Id = operatorPresentations[operatorPresentations.length - 1].id;
  log("OP_SELECT_HAS_RADIO=" + (await wc().executeJavaScript("!!document.querySelector('#decision-dialog input[type=radio]')")));
  log("OP_SUBMIT_DISABLED_INITIALLY=" + (await wc().executeJavaScript("(" + "document.querySelector('#decision-dialog[data-request-id=" + JSON.stringify(op2Id) + "] .dd-submit')" + "||{}).disabled === true")));
  await wc().executeJavaScript(opCardExpr(op2Id, "const rs=c && c.querySelectorAll('input[type=radio]'); if (rs && rs[1]) rs[1].click();"));
  await sleep(150);
  await wc().executeJavaScript(opCardExpr(op2Id, "const b=c && c.querySelector('.dd-submit'); if (b) b.click();"));
  await sleep(300);
  const oOp2 = await withTimeout(pOp2, 3000, "op2");
  log("OP_SELECT_ANSWERED=" + (!!oOp2 && oOp2.outcome === "answered" && JSON.stringify(oOp2.value.selected) === JSON.stringify(["beta"])));

  // ③ 多选（checkbox）：勾两项 → 提交 → selected 两值。
  const pOp3 = customerChannel.customerInput(
    { kind: "choice", title: "勾选要包含的文件", multiple: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }] },
    { roleId: "su" },
  );
  await sleep(600);
  const op3Id = operatorPresentations[operatorPresentations.length - 1].id;
  log("OP_MULTI_HAS_CHECKBOX=" + (await wc().executeJavaScript("!!document.querySelector('#decision-dialog input[type=checkbox]')")));
  await wc().executeJavaScript(opCardExpr(op3Id, "const i=c && c.querySelectorAll('input[type=checkbox]'); if (i && i[0]) i[0].click(); if (i && i[2]) i[2].click();"));
  await sleep(150);
  await wc().executeJavaScript(opCardExpr(op3Id, "const b=c && c.querySelector('.dd-submit'); if (b) b.click();"));
  await sleep(300);
  const oOp3 = await withTimeout(pOp3, 3000, "op3");
  log("OP_MULTI_ANSWERED=" + (!!oOp3 && oOp3.outcome === "answered" && JSON.stringify(oOp3.value.selected) === JSON.stringify(["a", "c"])));

  // ④ 快照校验负例：伪造 id / 不在请求中的选项 → 不受理（ok:false）；取消 → declined。
  const pOp4 = customerChannel.customerInput(
    { kind: "choice", title: "单选守卫", options: [{ id: "a", label: "A" }] },
    { roleId: "su" },
  );
  await sleep(400);
  const op4Id = operatorPresentations[operatorPresentations.length - 1].id;
  const forgedId = customerChannel.respond({ id: "forged-id", decision: { kind: "choice", selected: ["a"] } });
  log("OP_FORGED_ID_REJECTED=" + (forgedId.ok === false));
  const realId = op4Id;
  const outOfSet = customerChannel.respond({ id: realId, decision: { kind: "choice", selected: ["zzz"] } });
  log("OP_OUT_OF_SET_REJECTED=" + (outOfSet.ok === false));
  await wc().executeJavaScript(opCardExpr(op4Id, "const b=c && c.querySelector('.dd-reject'); if (b) b.click();"));
  await sleep(300);
  const oOp4 = await withTimeout(pOp4, 3000, "op4");
  log("OP_CANCEL_DECLINED=" + hardCheck("OP_CANCEL_DECLINED", !!oOp4 && oOp4.outcome === "declined"));

  // 收口面已删守卫：入口容器/旧卡**不存在**（断言「它不在」，防回潮）。
  log("OP_OLD_ENTRY_REMOVED=" + (await wc().executeJavaScript("document.getElementById('bootstrap-action') === null")));
  log("OP_OLD_CARD_REMOVED=" + (await wc().executeJavaScript("!document.querySelector('#chat .msg-finalize-proposal') && !document.querySelector('#chat .sys-finalize')")));

  // 结束临时会话，避免影响后续步骤（步骤 9 会重载仓库根并点其它角色）。
  await tryEval("window.desktop.stopSession()", "stop-session-all");
  await sleep(300);

  // 9) 回交（§10.8）：角色会话结束 → 产出角色自己的聊天里显示报告卡（`.msg-handback`）。
  //    2026-10-16 契约重锚（本批核对；现行 = 2026-10-15 F 批次后的形状）：事件载荷为 **`event.report`**
  //    （`RuntimeReportSnapshotV1`：source/summary 为对象/evidence 条目为对象——与桌面UI e2e 夹具同形）；
  //    旧形状（`event.handback` 裸载荷 + 「回交 su」标题）已退役。su 侧的回交呈现**走投递卡**
  //    （`.msg-injected.msg-delivery`「回交投递 · 本批 N 份」），事件层「镜像」（is-mirror）已退役。
  //    直接把事件推给渲染侧（不经真实 pi 会话），专测渲染侧呈现 + 「源角色事件不落 su pane」边界
  //    + 投递卡（镜像的替代呈现）。
  await tryEval("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")", "handback-load-project");
  await sleep(500);
  await ensurePiRuntime();
  await tryEval("window.__ansRenderer.selectRole('桌面窗口')", "handback-select-role");
  await sleep(1000);
  // B-2：事件外推带 `roleId` 信封（`{roleId, event}`）——直接推给渲染侧时同样要套信封。
  const hbCompleted = {
    version: 1,
    reportId: "e2e-hb-completed",
    source: { roleId: "桌面窗口", runtime: "pi" },
    taskId: "T20",
    origin: "submitted-report",
    status: "completed",
    summary: { text: "完成边界内改动" },
    evidence: [{ text: "角色卡/桌面窗口/feature-map.md" }],
    at: "2026-10-11T00:00:00.000Z",
  };
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "handback", summary: "回交 su：完成边界内改动", report: hbCompleted } });
  await sleep(300);
  log("HANDBACK_CARD_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback')")));
  // 原 `.hb-title` 载体随卡片重做退役；标题语义（结论声明）现行载体 = `.hb-head strong`（reportDeclaration）。
  log("HANDBACK_TITLE=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-handback .hb-head strong')||{}).textContent||''")));
  log("HANDBACK_NOT_MIRROR=" + (await wc().executeJavaScript("!document.querySelector('#chat .msg-handback.is-mirror')")));
  // 原 `.hb-status.hb-ok` 载体退役；「completed ⇒ 视觉非 blocked + 声明含『已完成』」为现行等价判据。
  log("HANDBACK_STATUS_OK=" + (await wc().executeJavaScript("(() => { const c=document.querySelector('#chat .msg-handback'); return !!c && !c.classList.contains('is-blocked') && (c.querySelector('.hb-head strong')||{textContent:''}).textContent.includes('已完成'); })()")));
  log("HANDBACK_EVIDENCE_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .msg-handback .hb-evidence li').length")));
  log("SHOT_07_HANDBACK=" + (await shot("07-handback.png")));

  // 切到 su（主入口，primaryRoleId）→ 推第二条（blocked）：**源角色的 handback 事件不得在 su pane
  // 物化任何卡**（镜像能力已退役——现行 su 侧承接者为投递卡，下方以生产投递形状验证）。
  await wc().executeJavaScript("window.__ansRenderer.selectRole(window.__ansRenderer.state.primaryRoleId)");
  await sleep(1000);
  const hbBlocked = {
    version: 1,
    reportId: "e2e-hb-blocked",
    source: { roleId: "桌面窗口", runtime: "pi" },
    taskId: "T20",
    origin: "submitted-report",
    status: "blocked",
    summary: { text: "被拦下：无写入落地" },
    evidence: [],
    at: "2026-10-11T00:00:00.000Z",
  };
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "handback", summary: "回交 su：被拦下", report: hbBlocked } });
  await sleep(300);
  // 原判据 `!.msg-handback.is-mirror`（旧渲染器会尝试把该回交镜像物化成卡）→ 现判据 `!.msg-handback` 全域
  // （更强：源角色事件在 su pane **不物化任何报告卡**；若未来回潮出 is-mirror 或任何镜像卡，此断言转红）。
  log("REPORT_NO_PREMATURE_SU_MIRROR=" + (await wc().executeJavaScript("!document.querySelector('#chat .msg-handback')")));
  // 替代能力守卫（原「镜像进 su」的现行承接者 = 投递卡）：以**生产投递形状**推一条（投递机 `prompt-input`
  // + `inputProvenance.reports`，与桌面UI e2e 夹具同形）→ su pane 物化「回交投递 · 本批 N 份」投递卡。
  wc().send("session:event", {
    roleId: "su",
    event: {
      kind: "message",
      turnId: "e2e-delivery-1",
      summary: "用户指令：[回交] 来自 桌面窗口 的报告（任务 T20）",
      detail: {
        source: "prompt-input",
        text: "[回交] 来自 桌面窗口 的报告（任务 T20）\n结论：blocked\n摘要：被拦下：无写入落地",
        inputProvenance: { version: 1, kind: "handback", deliveryId: "e2e-delivery-1", target: { roleId: "su", runtime: "pi" }, reports: [hbBlocked] },
        inputTextProjection: { version: 1, source: "trusted-handback-display", modelInputRecorded: false, redacted: false, truncated: false, summaryTruncated: false },
      },
    },
  });
  await sleep(300);
  log("SU_DELIVERY_CARD_PRESENT=" + (await wc().executeJavaScript("(() => { const c=document.querySelector('#chat .msg-injected.msg-delivery'); return !!c && c.textContent.includes('交付 · 本批 1 份') && !!c.querySelector('.delivery-report .hb-head'); })()")));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  await sleep(600);
  log("SOURCE_REPORT_BLOCKED=" + (await wc().executeJavaScript("(() => { const c=document.querySelector('#chat .msg-handback.is-blocked'); return !!c && !!c.querySelector('.hb-head strong') && c.querySelector('.hb-head strong').textContent.includes('被拦下'); })()")));
  log("SOURCE_REPORT_EVIDENCE_PLACEHOLDER=" + (await wc().executeJavaScript("[...document.querySelectorAll('#chat .msg-handback .hb-evidence li')].some(e=>e.textContent.includes('（未提供证据）'))")));
  await wc().executeJavaScript("window.__ansRenderer.selectRole(window.__ansRenderer.state.primaryRoleId)");
  log("SHOT_08_SU_PANE=" + (await shot("08-su-pane.png")));

  // 9b) B-1/B-2/B-3（2026-10-12）：切换保留历史（锚点）→ Markdown 渲染+XSS 转义+链接外开（替身）→ 状态徽标。
  await wc().executeJavaScript("window.__ansRenderer.selectRole(window.__ansRenderer.state.primaryRoleId)");
  await sleep(800);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  await sleep(800);
  log("HISTORY_KEPT_ON_SWITCHBACK=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback')")));
  // B-1：注入含 Markdown 与「类标签文本」的助手消息——粗体应渲染、`<tag>` 应仍是转义文本。
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "message", summary: "**粗体** 与 `<tag>` 文本" } });
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "message", summary: "[示例站点](https://example.com/x)" } });
  await sleep(250);
  log("MD_STRONG_RENDERED=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-assistant strong')")));
    log("MD_TAG_TEXT_ESCAPED=" + (await wc().executeJavaScript("(() => { const any=[...document.querySelectorAll('#chat .msg-assistant')].some((m)=>m.textContent.includes('<tag>')); return any && !document.querySelector('#chat tag'); })()")));
  await wc().executeJavaScript("(document.querySelector('#chat a.md-link')||{click:function(){}}).click()");
  await sleep(150);
  log("LINK_OPEN_EXTERNAL_CALLED=" + openExternalCalls.some((u) => u === "https://example.com/x"));
  // 工具行（2026-10-12 瘦身裁定 + 2026-10-14 重锚）：v2 组行只印「查看执行记录 N 条活动」；操作名与目标在组内
  // 展开项 `.activity-op/.activity-target`（目标从**生产形状 `detail.path`** 取，不再从 summary 解析）。含长内容
  // 的工具事件渲染后不得出现内容（哨兵）。
  wc().send("session:event", { roleId: "桌面窗口", event: { turnId: "t-toolrow-1", kind: "tool_call", summary: "read_file：docs/接口约定.md # 接口约定 · 正文预览【哨兵-勿显示】", detail: { toolName: "read_file", path: "docs/接口约定.md", turnId: "t-toolrow-1", toolCallId: "call-t-toolrow-1" } } });
  await sleep(250);
  log("TOOLROW_NO_CONTENT=" + (await wc().executeJavaScript("!document.querySelector('#chat').textContent.includes('哨兵-勿显示')")));
  log("TOOLROW_HAS_PATH=" + (await wc().executeJavaScript("(() => { const op=[...document.querySelectorAll('#chat .activity-op')].some(e=>e.textContent.includes('read_file')); const target=[...document.querySelectorAll('#chat .activity-target')].some(e=>e.textContent.includes('docs/接口约定.md')); return op && target; })()")));
  // H-1 附录（2026-10-16 判据重锚：现行只认 **typed 标记** `detail.source === "prompt-input"` 的正文——
  // 与 ui-labels/tool-rows 单一来源表同口径，不再从 summary 文本猜测）：系统投递输入单独样式
  // （不长得像客户发的消息）+ 手输防误伤（文本层回显不触发注入）。
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "message", turnId: "t-inject-1", summary: "用户指令：[回交] 来自 规划者 的报告（任务 T1）\n结论：completed\n摘要：做完了", detail: { source: "prompt-input", text: "[回交] 来自 规划者 的报告（任务 T1）\n结论：completed\n摘要：做完了" } } });
  await sleep(250);
  log("INJECTED_STYLE_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-injected.is-handback')")));
  log("REPORT_DELIVERY_DETAILS_COLLAPSED=" + (await wc().executeJavaScript("[...document.querySelectorAll('#chat .msg-injected.is-handback details')].some(e=>!e.open)")));
  log("REPORT_DELIVERY_INLINE_BODY_NEW=" + (await wc().executeJavaScript("(() => { const c=document.querySelector('#chat .msg-injected.is-handback'); return !!c && (c.querySelector('.mi-body')||{textContent:''}).textContent.includes('做完了'); })()")));
  log("INJECTED_CHIP_LABEL=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-injected .mi-chip')||{textContent:''}).textContent")));
  log("INJECTED_CHIP_DELIVERY_LABEL=" + (await wc().executeJavaScript("(() => { const t=(document.querySelector('#chat .msg-injected .mi-chip')||{textContent:''}).textContent; return t.includes('交付 · 来自') && t.includes('规划者'); })()")));
  log("INJECTED_NOT_USER_BUBBLE=" + (await wc().executeJavaScript("(() => { const el=document.querySelector('#chat .msg-injected'); return !!el && !el.classList.contains('msg-user'); })()")));
  // 手输防误伤（2026-10-16 语义重锚；现行判据见上）：真发一条**以投递前缀开头**的文本，再推它
  // 的 `用户指令：` 文本层回显（summary 形态——无 typed 标记）→ ① 手输仍是普通用户气泡；
  // ② **文本层回显不触发注入样式**（分类只认 typed 标记；字面像前缀也不算——防「文字猜测」类判据回潮。
  // 注：旧的「15s 时间启发式防误伤」已由 F 批次（2026-10-15，fca8f6b）移除，身份绑定改走
  // clientMessageId ACK——本处钉的是删掉文字推测后的反向面）。
  await wc().executeJavaScript("(() => { document.getElementById('inp-message').value='[派发] 手输测试勿注入'; document.getElementById('btn-send').click(); })()");
  await sleep(400);
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "message", summary: "用户指令：[派发] 手输测试勿注入" } });
  await sleep(250);
  log("MANUAL_PREFIX_BUBBLE=" + (await wc().executeJavaScript("[...document.querySelectorAll('#chat .msg-user')].some((e)=>e.textContent.includes('[派发] 手输测试勿注入'))")));
  log("MANUAL_NOT_INJECTED=" + (await wc().executeJavaScript("![...document.querySelectorAll('#chat .msg-injected')].some((e)=>e.textContent.includes('手输测试勿注入'))")));
  // B-3：保活会话 ⇒ 「空闲」徽标；悬停数据（最近事件+时间）已记录。
  log("STATUS_BADGE_TEXT=" + (await wc().executeJavaScript("(() => { const items=[...document.querySelectorAll('#role-tree .tree-item')]; const it=items.find((x)=>x.textContent.indexOf('桌面窗口')>=0); const s=it && it.querySelector('.ti-status'); return s ? s.textContent : ''; })()")));
  log("STATUS_BADGE_IS_IDLE=" + (await wc().executeJavaScript("(() => { const items=[...document.querySelectorAll('#role-tree .tree-item')]; const it=items.find((x)=>x.textContent.indexOf('桌面窗口')>=0); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-idle'); })()")));
  log("STATUS_LAST_EVENT_RECORDED=" + (await wc().executeJavaScript("(() => { const m=(window.__ansRenderer.state.roleMeta||{})['桌面窗口']||{}; return !!(m.lastSummary && m.lastAt); })()")));
  log("STATUS_LAST_EVENT_FIELD_NEW=" + (await wc().executeJavaScript("(() => { const m=(window.__ansRenderer.state.roleMeta||{})['桌面窗口']||{}; return typeof m.lastEvent==='string' && m.lastEvent.length>0; })()")));
  // L-1 + 状态准确性（2026-10-12）：主进程**真实状态快照** → 徽标「◐ 工作中 · 2 待办」+ 该角色 pane 的
  // **队列行**；清空快照 → 徽标回「空闲」、队列行移除（界面只如实转述快照，不做界面侧推测）。
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: true, summaries: ['你：排队一', '你：排队二'] })");
  await sleep(150);
  log("ROLE_STATE_BADGE_WORKING_PENDING=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面窗口')>=0); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-working') && s.textContent.includes('工作中 · 2 待处理'); })()")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: true, summaries: ['你：排队一', '你：排队二'], queue: [{kind:'message',sourceRoleId:'桌面窗口',summary:'你：排队一',at:'2026-10-12T03:00:00.000Z'},{kind:'message',sourceRoleId:'桌面窗口',summary:'你：排队二',at:'2026-10-12T03:01:00.000Z'}], running: null })");
  await sleep(200);
  log("ROLE_STATE_BADGE_SINGLE_COUNT_WORKING=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面窗口')>=0); const c=it && it.querySelector('.ti-count'); const s=it && it.querySelector('.ti-status'); return !!c && c.textContent.trim()==='3' && (c.getAttribute('title')||'').includes('当前工作 1 项，排队 2 项') && !!s && s.textContent.includes('工作中') && !s.textContent.includes('待处理'); })()")));
  // 2026-10-16 v3 重锚：working 态图标已从文本字形（◐）换成 **SVG 弧线转轮**（role-status.js
  // SPINNER_SVG，全应用唯一一枚；`.ts-ico` 内为纯 SVG、无文本）——原断言 `.ts-ico` textContent 非空
  // → 新断言 `.ti-status .ts-ico svg.spin-arc` 存在（守卫同一能力：工作徽标含图标；其余态仍为文本字形）。
  log("ROLE_STATE_BADGE_HAS_ICON=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面窗口')>=0); const s=it && it.querySelector('.ti-status .ts-ico svg.spin-arc'); return !!s; })()")));
  log("ROLE_STATE_BADGE_HOVER_FULL=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面窗口')>=0); const s=it && it.querySelector('.ti-status'); return !!s && (s.getAttribute('title')||'').includes('2 项已入队'); })()")));
  log("ROLE_STATE_QUEUE_ROW=" + (await wc().executeJavaScript("(document.querySelector('#chat .queue-row .q-text')||{textContent:''}).textContent.includes('【队列】2 条待处理：你：排队一')")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: false, summaries: [] })");
  await sleep(120);
  log("ROLE_STATE_CLEARED=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面窗口')>=0); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-idle') && !document.querySelector('#chat .queue-row'); })()")));

  // M-1（2026-10-12 客户裁定「这个太丑了」）：shell 确认卡 = **应用内弹层**（不再用原生对话框）。
  // 结构/默认焦点/详情收起 + Esc = 不放行（真实 IPC：无挂起 ⇒ expired；卡片转「已失效」而非悄悄关闭）。
  await wc().executeJavaScript("window.__ansRenderer.onShellConfirm({ id: 'sc-probe-1', command: 'ls -la /tmp && echo hi', summary: '它会在项目里执行：ls', reasonPlain: '审核未能给出明确结论，按 fail-closed 交你确认。', reasonRaw: 'pm 拿不准，交操作者', argvLines: ['[0] \"ls\"', '[1] \"-la\"', '[2] \"/tmp\"'], cwd: '/proj' })");
  await sleep(200);
  log("SHELL_CONFIRM_VISIBLE=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('shell-confirm'); return !!el && el.hidden === false; })()")));
  log("SHELL_CONFIRM_COMMAND_VERBATIM=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('sc-command'); return !!el && el.textContent === 'ls -la /tmp && echo hi'; })()")));
  log("SHELL_CONFIRM_SUMMARY_PLAIN=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('sc-summary'); return !!el && el.textContent.includes('它会在项目里执行'); })()")));
  log("SHELL_CONFIRM_REASON_PLAIN=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('sc-reason'); return !!el && el.textContent.includes('fail-closed') && !el.textContent.includes('pm 拿不准'); })()")));
  log("SHELL_CONFIRM_DENY_DEFAULT_FOCUS=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('sc-deny'); return !!el && document.activeElement === el; })()")));
  log("SHELL_CONFIRM_DETAILS_COLLAPSED=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('sc-details'); return !!el && el.open === false; })()")));
  await wc().executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(300);
  log("SHELL_CONFIRM_ESC_NOT_ALLOWED=" + (await wc().executeJavaScript("(() => { const o=document.getElementById('shell-confirm'); const h=document.getElementById('sc-hint'); return !!o && !!h && o.classList.contains('is-expired') && !o.hidden && h.textContent.includes('未获放行'); })()")));
  // 探针清理：隐藏卡片（不影响后续步骤/截图）。
  await wc().executeJavaScript("(() => { const el=document.getElementById('shell-confirm'); if (el) { el.hidden = true; el.classList.remove('is-expired'); } if (window.__ansRenderer.state) window.__ansRenderer.state.shellConfirm = null; })()");

  // N-3（2026-10-12 追加；2026-10-13 第二轮裁定待办/队列归角色；UIUX v2：两视图并为**单份工作列表**；
  // 2026-10-16 V2 收敛后归位「工作概览」抽屉）：
  // **工作列表（当前工作 + 排队）**——夹具注入 → 逐条渲染 + 进行中最前（归「当前工作」组）
  // + 位次 + 空占位（数据经 role-state 真实快照通道，不造第二套数据源）。
  await wc().executeJavaScript("document.getElementById('tab-work').click()");
  await sleep(300);
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: true, summaries: ['你：排队一'], queue: [{kind:'message', sourceRoleId:'桌面窗口', summary:'你：排队一', at:'2026-10-12T03:00:00.000Z'},{kind:'dispatch', sourceRoleId:'su', summary:'派发 · 来自 su：做X', at:'2026-10-12T03:01:00.000Z'}], running: {kind:'handback', sourceRoleId:'A', summary:'交付 · 来自 A', at:'2026-10-12T02:59:00.000Z'} })");
  await sleep(200);
  log("RIGHT_QUEUE_SECTION=" + (await wc().executeJavaScript("!!document.querySelector('#right-body #right-queue-body')")));
  log("RIGHT_QUEUE_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#right-queue-body .q-item').length")));
  // 进行中最前：首行带 is-running 且归「当前工作」组标题下（v2 结构——行内不再印「进行中」字样）。
  log("RIGHT_QUEUE_RUNNING_FIRST=" + (await wc().executeJavaScript("(() => { const body=document.querySelector('#right-queue-body'); const first=body && body.querySelector('.q-item'); const heading=body && body.querySelector('.work-heading'); return !!first && first.classList.contains('is-running') && !!heading && heading.textContent.includes('当前工作'); })()")));
  log("RIGHT_QUEUE_SOURCES=" + (await wc().executeJavaScript("(() => { const t=document.querySelector('#right-queue-body').textContent; return t.includes('交付') && t.includes('客户消息') && t.includes('su 派发') && t.includes('你：排队一'); })()")));
  log("RIGHT_QUEUE_SOURCES_WORK_OVERVIEW=" + (await wc().executeJavaScript("(() => { const body=document.querySelector('#right-queue-body'); if (!body) return false; const t=body.textContent; return t.includes('交付') && t.includes('排队一') && (t.includes('派发') || t.includes('su')); })()")));
  log("ROLE_STATE_QUEUE_ROW_WORK_OVERVIEW=" + (await wc().executeJavaScript("(() => { const body=document.querySelector('#right-queue-body'); if (!body) return false; const rows=[...body.querySelectorAll('.q-item')]; const headings=[...body.querySelectorAll('.work-heading')].map((h)=>h.textContent); return rows.length>=2 && rows[0].classList.contains('is-running') && headings.some((t)=>t.includes('当前工作')) && headings.some((t)=>t.includes('排队')); })()")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: false, summaries: [], queue: [], running: null })");
  await sleep(150);
  log("RIGHT_QUEUE_EMPTY_PLACEHOLDER=" + (await wc().executeJavaScript("document.querySelector('#right-queue-body').textContent.includes('无进行中或排队消息')")));
  // 位次视图（同一单份列表）：排队条目**位次行**（UIUX v2 两视图并一——位次在列表行内，不另设独立概览节）；
  // 随后收起抽屉，不影响后续聊天流断言。
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面窗口', busy: false, summaries: ['你：排队一','你：排队二'], queue: [{kind:'message', sourceRoleId:'桌面窗口', summary:'你：排队一', at:'2026-10-12T03:00:00.000Z'},{kind:'dispatch', sourceRoleId:'su', summary:'派发 · 来自 su：做X', at:'2026-10-12T03:01:00.000Z'}], running: null })");
  await sleep(150);
  log("QUEUE_POSITION_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#right-queue-body .q-item .q-pos').length")));
  log("QUEUE_POSITION_IN_CARD=" + (await wc().executeJavaScript("!!document.querySelector('#right-body #right-queue-body .q-pos')")));
  log("TAB_WORK_ACTIVE_STILL=" + (await wc().executeJavaScript("document.getElementById('tab-work').classList.contains('active')")));
  await wc().executeJavaScript("document.getElementById('tab-work').click()");
  await sleep(200);
  log("DRAWER_CLOSED_AFTER_N3=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));

  // ————— E 批：独立决策对话框（一次一卡/优先级/稍后处理/待办/聊天流无卡）—————
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  await sleep(400);
  await wc().executeJavaScript("window.__ansRenderer.appendOperatorRequest({ id: 'e-low', roleId: '桌面窗口', request: { kind: 'confirm', title: 'E 低风险确认' } })");
  await sleep(120);
  await wc().executeJavaScript("window.__ansRenderer.appendOperatorRequest({ id: 'e-high', roleId: '桌面窗口', risk: 'high', request: { kind: 'confirm', title: 'E 高风险审批' } })");
  await sleep(250);
  log("E_DIALOG_SINGLE=" + hardCheck("E_DIALOG_SINGLE", await wc().executeJavaScript("document.querySelectorAll('#decision-dialog').length === 1")));
  log("E_DIALOG_PRIORITY_HIGH=" + hardCheck("E_DIALOG_PRIORITY_HIGH", await wc().executeJavaScript("(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 高风险审批')")));
  log("E_CHAT_NO_ACTIONABLE_CARD=" + hardCheck("E_CHAT_NO_ACTIONABLE_CARD", await wc().executeJavaScript("!document.querySelector('#chat .op-request') && !!document.querySelector('#chat .sys-operator-note')")));
  log("E_DIALOG_MORE_COUNT=" + hardCheck("E_DIALOG_MORE_COUNT", await wc().executeJavaScript("(document.querySelector('#decision-dialog .dd-more')||{textContent:''}).textContent.includes('还有 1 张待处理')")));
  await wc().executeJavaScript("document.querySelector('#decision-dialog .dd-later').click()");
  await sleep(200);
  log("E_LATER_ADVANCES=" + hardCheck("E_LATER_ADVANCES", await wc().executeJavaScript("(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 低风险确认')")));
  await wc().executeJavaScript("document.querySelector('#decision-dialog .dd-later').click()");
  await sleep(200);
  log("E_LATER_CLOSES_DIALOG_NO_DEFAULT=" + hardCheck("E_LATER_CLOSES_DIALOG_NO_DEFAULT", await wc().executeJavaScript("!document.querySelector('#decision-dialog')")));
  await wc().executeJavaScript("document.getElementById('tab-decisions').click()");
  await sleep(250);
  log("E_TODO_PANEL_HAS_DEFERRED=" + hardCheck("E_TODO_PANEL_HAS_DEFERRED", await wc().executeJavaScript("(() => { const p=document.getElementById('decision-center-pending'); return !!p && p.textContent.includes('E 低风险确认') && p.textContent.includes('E 高风险审批') && p.textContent.includes('稍后处理'); })()")));
  await wc().executeJavaScript("document.querySelector('#decision-center-pending .dc-open').click()");
  await sleep(200);
  log("E_TODO_OPEN_REOPENS_DIALOG=" + hardCheck("E_TODO_OPEN_REOPENS_DIALOG", await wc().executeJavaScript("!!document.querySelector('#decision-dialog')")));
  await wc().executeJavaScript("document.querySelector('#decision-dialog .dd-later').click()");
  await sleep(150);
  await wc().executeJavaScript("document.getElementById('tab-decisions').click()");
  await sleep(150);
  log("E_HISTORY_PANEL_EXISTS=" + hardCheck("E_HISTORY_PANEL_EXISTS", await wc().executeJavaScript("!!document.getElementById('decision-center-history')")));
  log("SHOT_11C_DECISION_HISTORY=" + (await shot("11c-decision-history.png")));
  log("E_QUEUE_PRIORITY_CHAT_NO_CARD_SHOT=" + (await shot("11b-decision-dialog.png")));
  // 任务/日志独立面板（数据面失败如实显示，不伪造）
  await wc().executeJavaScript("document.getElementById('tab-tasks').click()");
  await sleep(300);
  log("E_TASK_PANEL_VISIBLE=" + hardCheck("E_TASK_PANEL_VISIBLE", await wc().executeJavaScript("!!document.querySelector('.task-center') && !!document.querySelector('.task-center .tc-title')")));
  log("E_ROLE_LOG_VIEW_VISIBLE=" + hardCheck("E_ROLE_LOG_VIEW_VISIBLE", await wc().executeJavaScript("!!document.querySelector('.role-log-view') && !!document.querySelector('.role-log-badge')")));
  await wc().executeJavaScript("document.getElementById('tab-work').click()");
  await sleep(150);

  // E 批：旧「聊天流交互卡锚点/chip」断言已随模态对话框撤除；聊天流不应再有可作答卡。
  log("E_OLD_CHAT_CARD_ANCHOR_REMOVED=" + (await wc().executeJavaScript("!document.querySelector('#chat .op-request') && !document.getElementById('op-chip')?.offsetParent")));
  await tryEval("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")", "anchor-load-project");
  await sleep(500);
  await ensurePiRuntime();
  await tryEval("window.__ansRenderer.selectRole('桌面窗口')", "anchor-select-role");
  await sleep(1000);

  // S-1（2026-10-12 客户「现在输出不会让滚动条滚动到最底下了」）：**长会话贴底回归**。
  // 触发窗口化（≥150 行）后持续追加输出：① 在底部 ⇒ 必须**保持贴底**；② 上翻 ⇒ 新输出**不得拽回**。
  // ⚠ 组行行数依赖（2026-10-16 v3 重锚）：工具事件按 **envelope 顶层 `turnId`** 归组
  //   （renderer.js `appendActivity` ⇐ tool-rows.js `activityOf.turnId` 已收窄为「只认顶层 `event.turnId`」
  //   ——v3 批改为对齐生产投影 `ProjectedRuntimeToolEventV1`：`identity(event)` 带顶层 turnId，detail 冗余一份）。
  //   夹具**必须给足生产形状（顶层 turnId + detail{toolName,path,turnId,toolCallId}、每条唯一 turnId）**，
  //   才逐条自成「查看执行记录」组行；只给 `detail.turnId` 的旧形状会被并进同一组、行数饿死、窗口化空转
  //   （2026-10-14 旧钉法的 detail.turnId 依赖已随 v3 失效——本批按现行形状补齐 fixtures）。
  //   生产形状见 `src/common/runtime-core/tool-display.ts` 投影输出与 `src/common/pi-adapter/real-adapter.ts` 外推。⚠
  const s1dist = "(function(){ const c=document.getElementById('chat'); return Math.round(c.scrollHeight-c.scrollTop-c.clientHeight); })()";
  const s1Event = (turnKey, summary, path) => ({ roleId: "桌面窗口", event: { turnId: turnKey, kind: "tool_call", summary, detail: { toolName: "read_file", path, turnId: turnKey, toolCallId: "call-" + turnKey } } });
  for (let i = 0; i < 200; i += 1) {
    wc().send("session:event", s1Event("s1-fill-" + i, "S-1 填充行 read_file：docs/s1-" + i + ".md", "docs/s1-" + i + ".md"));
  }
  // 2026-10-16 本批：200 条**逐条** session:event 在现行渲染器下渲染排队实测 ~4.4s——先等行模型
  // ≥150（与断言同一事实源），再断言窗口化；死睡 800ms 会量到中间态。
  await waitUntil("(() => { const m=window.__ansRenderer.rowModelDebug('桌面窗口'); return !!m && m.count >= 150; })()");
  await sleep(300); // 让尾批渲完（窗口化实体的挂载/高度刷新落地）
  // S1_WINDOWED_ACTIVE 重锚（2026-10-14）：钉**行模型事实**——≥150 行且挂载的直接子行远少于总行数、
  // spacer 实际撑高（不再查「常驻的 2 个 .virt-spacer」——那不是窗口化信号，恒真）。
  log("S1_WINDOWED_ACTIVE=" + (await wc().executeJavaScript("(() => { const m=window.__ansRenderer.rowModelDebug('桌面窗口'); if (!m || !(m.count >= 150)) return false; const pane=document.querySelector('#chat .chat-pane'); if (!pane) return false; const kids=[...pane.children]; const mounted=kids.filter(e=>!e.classList.contains('virt-spacer')).length; const spacerH=kids.filter(e=>e.classList.contains('virt-spacer')).reduce((s,e)=>s+e.getBoundingClientRect().height,0); return mounted < m.count && spacerH > 0; })()")));
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = c.scrollHeight; })()");
  await sleep(200);
  // ① 贴底场景：分 3 批追加 30 行（模拟合帧流式输出），每批后测距底像素。
  for (let b = 0; b < 3; b += 1) {
    const arr = [];
    for (let i = 0; i < 10; i += 1) arr.push(s1Event("s1-live-" + b + "-" + i, "S-1 流式追加 b" + b + "-" + i, "docs/s1-live-b" + b + "-" + i + ".md"));
    wc().send("session:events", arr); // Q-1 合帧形态（生产热路径：批量数组）
    await sleep(250);
  }
  await sleep(300);
  const s1DistAtBottom = await wc().executeJavaScript(s1dist);
  log("S1_STICK_AT_BOTTOM_DIST=" + s1DistAtBottom);
  log("S1_STICK_AT_BOTTOM=" + (s1DistAtBottom <= 8));
  // ② 上翻场景：滚到中段 → 追加 20 行 ⇒ scrollTop 不得被拽动。
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = Math.max(0, c.scrollHeight - c.clientHeight - 1200); })()");
  await sleep(200);
  const s1TopBefore = await wc().executeJavaScript("Math.round(document.getElementById('chat').scrollTop)");
  const upBatch = [];
  for (let i = 0; i < 20; i += 1) upBatch.push(s1Event("s1-up-" + i, "S-1 上翻期追加 " + i, "docs/s1-up-" + i + ".md"));
  wc().send("session:events", upBatch); // 合帧形态：上翻期的新输出不得拽回
  await sleep(500);
  const s1TopAfter = await wc().executeJavaScript("Math.round(document.getElementById('chat').scrollTop)");
  log("S1_NOT_YANKED=" + (s1TopAfter === s1TopBefore || Math.abs(s1TopAfter - s1TopBefore) <= 2));
  log("S1_STAYED_AWAY_FROM_BOTTOM=" + ((await wc().executeJavaScript(s1dist)) > 900));
  const visibleRows = "(() => {const chat=document.getElementById('chat'), rect=chat.getBoundingClientRect(); return [...chat.querySelectorAll('.chat-pane > :not(.virt-spacer)')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>rect.top && r.top<rect.bottom && r.height>0;}).length;})()";
  log("VIEWPORT_MIDDLE_HAS_VISIBLE_ROWS=" + ((await wc().executeJavaScript(visibleRows)) > 0));
  await wc().executeJavaScript("document.getElementById('chat').scrollTop=0");
  await sleep(200);
  wc().send("session:event", { roleId: "桌面窗口", event: { kind: "message", summary: "上翻顶部的单条输出" } });
  await sleep(200);
  log("VIEWPORT_TOP_SINGLE_HAS_VISIBLE_ROWS=" + ((await wc().executeJavaScript(visibleRows)) > 0));
  // 坏事件夹具（2026-10-16 形状重锚）：report 形状但 evidence 为非法类型（字符串）⇒ 单事件渲染抛错必须被
  // 隔离（renderer.event-error 诊断 + 其余事件继续）——原旧形状（handback 裸载荷）在新契约下已不再触发
  // 该路径（安全降级为系统行），故照旧形状换新载荷、保住「异常批量不中断」的守卫语义。
  wc().send("session:events", [
    { roleId: "桌面窗口", event: { kind: "handback", summary: "坏报告", report: { version: 1, reportId: "e2e-hb-bad", source: { roleId: "桌面窗口", runtime: "pi" }, origin: "terminal-fallback", status: "unreported", summary: { text: "bad" }, evidence: "invalid", at: "2026-10-13T00:00:00Z" } } },
    { roleId: "桌面窗口", event: { kind: "message", summary: "坏事件之后的合法消息" } },
    { roleId: "桌面窗口", event: { kind: "settled", summary: "异常批量也应正确收尾" } },
  ]);
  await sleep(250);
  log("VIEWPORT_TOP_BATCH_SETTLED_HAS_VISIBLE_ROWS=" + ((await wc().executeJavaScript(visibleRows)) > 0));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  log("EVENT_BATCH_CONTINUES_AFTER_ERROR=" + (await wc().executeJavaScript("document.getElementById('chat').textContent.includes('坏事件之后的合法消息') && document.getElementById('chat').textContent.includes('异常批量也应正确收尾')")));
  // ③ 回底后再输出 ⇒ 恢复贴底（双向语义的第三点）。
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = c.scrollHeight; })()");
  await sleep(200);
  for (let i = 0; i < 10; i += 1) {
    wc().send("session:event", s1Event("s1-redown-" + i, "S-1 回底再输出 " + i, "docs/s1-redown-" + i + ".md"));
  }
  await sleep(400);
  const s1DistAgain = await wc().executeJavaScript(s1dist);
  log("S1_STICK_AGAIN_DIST=" + s1DistAgain);
  log("S1_STICK_AGAIN=" + (s1DistAgain <= 8));

  // S-1 附带：**常规路径（<150 行，不窗口化）**同款双向断言（su 的小 pane）。
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(900);
  const small = [];
  for (let i = 0; i < 3; i += 1) small.push({ roleId: "su", event: { kind: "tool_call", summary: "S-1 小 pane 行 " + i } });
  wc().send("session:events", small);
  await sleep(400);
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = c.scrollHeight; })()");
  await sleep(150);
  const small2 = [];
  for (let i = 0; i < 3; i += 1) small2.push({ roleId: "su", event: { kind: "tool_call", summary: "S-1 小 pane 续 " + i } });
  wc().send("session:events", small2);
  await sleep(400);
  const smallDist = await wc().executeJavaScript(s1dist);
  log("S1_SMALL_PANE_STICK_DIST=" + smallDist);
  log("S1_SMALL_PANE_STICK=" + (smallDist <= 8));
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = 0; })()");
  await sleep(150);
  const smallTopBefore = await wc().executeJavaScript("Math.round(document.getElementById('chat').scrollTop)");
  const small3 = [];
  for (let i = 0; i < 3; i += 1) small3.push({ roleId: "su", event: { kind: "tool_call", summary: "S-1 小 pane 上翻期 " + i } });
  wc().send("session:events", small3);
  await sleep(400);
  const smallTopAfter = await wc().executeJavaScript("Math.round(document.getElementById('chat').scrollTop)");
  log("S1_SMALL_PANE_NOT_YANKED=" + (Math.abs(smallTopAfter - smallTopBefore) <= 2));

  // U-1（2026-10-12 客户裁定「点击这个角色，应该滚动到滚动条最下面」）：点角色 ⇒ 到底部（两条路径 + 重复点击）；
  // 「有卡 ⇒ 滚到卡」的例外由 P-1 既有一组断言覆盖（本处只测无卡路径，互不影响）。
  // 前置（2026-10-14）：S-1 修好（组行逐条、真窗口化）后，本段「WINDOWED」才是真·窗口化回底（此前 S-1 空转）。
  // U1_PANE_HEIGHT（同批加采样）：评审观测该处 pane 内容高运行间不稳（13577/655px），多轮重跑据此定性。
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  await sleep(900);
  const u1WindowedDist = await wc().executeJavaScript(s1dist);
  log("U1_WINDOWED_TO_BOTTOM_DIST=" + u1WindowedDist);
  log("U1_PANE_HEIGHT=" + (await wc().executeJavaScript("(() => { const p=document.querySelector('#chat .chat-pane'); return p ? Math.round(p.scrollHeight) : -1; })()")));
  log("U1_WINDOWED_TO_BOTTOM=" + (u1WindowedDist <= 8));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(900);
  const u1NormalDist = await wc().executeJavaScript(s1dist);
  log("U1_NORMAL_TO_BOTTOM_DIST=" + u1NormalDist);
  log("U1_NORMAL_TO_BOTTOM=" + (u1NormalDist <= 8));
  // 重复点击同一角色（pane 已在视图）⇒ 行为一致（仍到底部）。
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = 0; })()");
  await sleep(150);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(600);
  const u1RepeatDist = await wc().executeJavaScript(s1dist);
  log("U1_REPEAT_TO_BOTTOM_DIST=" + u1RepeatDist);
  log("U1_REPEAT_TO_BOTTOM=" + (u1RepeatDist <= 8));

  // 10) T28：Pi 配置面板——UI 渲染 + 经**注入的临时 .env**（OUTDIR 下，绝不碰仓库根真实 .env）读写往返。
  await wc().executeJavaScript("window.__ansRenderer.openPiPanel()");
  await sleep(400);
  const panel = await wc().executeJavaScript(
    "(() => { const p=document.getElementById('pi-panel'); const keys=window.__ansRenderer.piKeys; const adv=document.querySelector('#pi-panel .pi-advanced'); const cw=document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW'); const tw=document.getElementById('pi-inp-ANS_PI_PROMPT_TIMEOUT_MS'); const labels={}; keys.forEach(k=>{ const el=document.querySelector('label[for=\"pi-inp-'+k+'\"] .pi-field-label')||document.querySelector('label[for=\"pi-range-'+k+'\"] .pi-field-label'); labels[k]=el?el.textContent:''; }); return { open: !!(p && !p.hidden), keys: keys.slice(), fieldCount: keys.filter(k=>!!document.getElementById('pi-inp-'+k)).length, keyCount: keys.length, labels: labels, hasProvider: !!document.getElementById('pi-inp-ANS_PI_PROVIDER'), tokenType: (document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN')||{}).type, hasSaveBtn: !!document.getElementById('pi-save'), adv: !!adv, advOpen: !!(adv && adv.open), cwInAdv: !!(adv && cw && adv.contains(cw)), timeoutInAdv: !!(adv && tw && adv.contains(tw)), hint: ((document.querySelector('#pi-panel .pi-advanced-body .runtime-field-help')||{}).textContent||'') + '｜' + ((document.querySelector('#pi-panel .pi-advanced-hint')||{}).textContent||'') }; })()",
  );
  log("PI_PANEL_OPEN=" + panel.open);
  log("PI_PANEL_IN_DRAWER=" + (await wc().executeJavaScript("(() => { const p=document.getElementById('pi-panel'), d=document.getElementById('right-drawer'); return !!p && !!d && d.contains(p) && d.classList.contains('open'); })()")));
  log("PI_FIELD_COUNT=" + panel.fieldCount);
  // 2026-10-17：Pi 面板键集＝共享注册表：3 项必填 + 2 项高级（共 5 键）。**逐键＋逐 label 精确对齐**，
  // 不放宽成计数下限——键/标签漂移即红。label 载体形如「<注册表 label> · 必填/可选」。
  const PI_PANEL_EXPECTED = [
    ["ANTHROPIC_AUTH_TOKEN", "访问令牌"],
    ["ANS_PI_BASE_URL", "API 地址"],
    ["ANS_PI_MODEL", "模型"],
    ["ANS_PI_CONTEXT_WINDOW", "上下文窗口"],
    ["ANS_PI_PROMPT_TIMEOUT_MS", "看护检查时限"],
  ];
  const piKeysMatch =
    panel.keyCount === PI_PANEL_EXPECTED.length &&
    panel.keys.length === PI_PANEL_EXPECTED.length &&
    PI_PANEL_EXPECTED.every(([key], i) => panel.keys[i] === key);
  const piLabelsMatch = PI_PANEL_EXPECTED.every(
    ([key, label]) => (panel.labels[key] || "").split(" · ")[0] === label,
  );
  log("PI_KEYS_ARE_FIVE=" + piKeysMatch);
  log("PI_FIELDS_MATCH_REGISTRY=" + (panel.fieldCount === PI_PANEL_EXPECTED.length && piKeysMatch && piLabelsMatch));
  log("PI_NO_PROVIDER_FIELD=" + (!panel.hasProvider));
  log("PI_ADVANCED_PRESENT=" + panel.adv);
  log("PI_ADVANCED_COLLAPSED_BY_DEFAULT=" + (panel.adv === true && panel.advOpen === false));
  log("PI_CONTEXT_WINDOW_IN_ADVANCED=" + panel.cwInAdv);
  log("PI_PROMPT_TIMEOUT_IN_ADVANCED=" + panel.timeoutInAdv);
  // 2026-10-16 重锚：高级块「留空=默认」指引的现行载体 = 该字段的 `.runtime-field-help`
  // （单一来源 src/common/shared/runtime-settings.ts 的 help「留空使用保守默认值。」；applyPiView
  // 重写 .pi-advanced-body 后静态 .pi-advanced-hint 段落不再留存——原判据按旧静态载体必假）。
  // 判据取「字段 help + 静态段落」合并文本，兼容两态；语义不变：高级块留有「留空=默认」的指引。
  log("PI_ADVANCED_HINT_LEAVE_BLANK=" + (panel.hint.includes("留空") && panel.hint.includes("默认")));
  log("PI_TOKEN_MASKED=" + (panel.tokenType === "password"));
  log("PI_HAS_SAVE_BTN=" + panel.hasSaveBtn);
  const piPathShown = await wc().executeJavaScript("document.getElementById('pi-panel-path').textContent");
  log("PI_PANEL_PATH_IS_TEMP=" + (path.resolve(piPathShown) === path.resolve(PI_ENV)));
  log("PI_ENV_NOT_REPO_ROOT=" + (path.resolve(PI_ENV) !== path.resolve(REPO_ROOT, ".env")));
  log("PI_NO_MODAL=" + !(await modalExists()));
  // Pi 抽屉内不溢出（2026-10-13 客户真机复现修复）：全字段输入框/操作行必须完整落在抽屉矩形（亦即窗口）内；
  // 字段堆叠（标签一行、输入一行——200px 标签列是按旧右栏列宽设计的，抽屉装不下并排）。
  const piGeoExpr =
    "(() => { const d=document.getElementById('right-drawer'); const dr=d.getBoundingClientRect(); const els=[...document.querySelectorAll('#pi-panel .pi-input, #pi-panel .pi-actions')]; const rects=els.map(e=>{const r=e.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}); const f=document.querySelector('#pi-panel .pi-field'); const lbl=f?f.querySelector('.pi-field-label'):null; const inp=f?f.querySelector('.pi-input'):null; let stacked=false; if(f&&lbl&&inp){const lr=lbl.getBoundingClientRect(),ir=inp.getBoundingClientRect(),fr=f.getBoundingClientRect(); stacked=ir.top>=lr.bottom-2 && ir.left>=fr.left && ir.left<fr.left+40;} return { win:window.innerWidth, drl:dr.left, drr:dr.right, rects:rects, stacked:stacked }; })()";
  const piGeo = await wc().executeJavaScript(piGeoExpr);
  log("PI_STACKED_FIELDS=" + piGeo.stacked);
  log(
    "PI_NO_OVERFLOW=" +
      piGeo.rects.every((r) => r.right <= piGeo.drr + 0.5 && r.left >= piGeo.drl - 0.5 && r.right <= piGeo.win + 0.5),
  );
  // 窄窗口（≤1100px，客户裁定同样要验证）：缩到 900px（抽屉进入 268px 最窄档）重测 → 恢复原尺寸。
  win.setSize(900, 720);
  await sleep(500);
  const piGeoNarrow = await wc().executeJavaScript(piGeoExpr);
  log("PI_NARROW_WINDOW=900");
  log("PI_NARROW_STACKED=" + piGeoNarrow.stacked);
  log(
    "PI_NARROW_NO_OVERFLOW=" +
      piGeoNarrow.rects.every((r) => r.right <= piGeoNarrow.drr + 0.5 && r.left >= piGeoNarrow.drl - 0.5 && r.right <= piGeoNarrow.win + 0.5),
  );
  win.setSize(1360, 860);
  await sleep(400);
  log("SHOT_09_PI_PANEL=" + (await shot("09-pi-panel.png")));

  // 填字段 → 保存（经临时 .env）→ 断言写入临时文件、且 token 不回显（保存后回到掩码、值清空）。
  await wc().executeJavaScript(
    "(() => { const set=(id,v)=>{ const el=document.getElementById(id); if (el) el.value=v; }; set('pi-inp-ANS_PI_MODEL','e2e-model'); set('pi-inp-ANS_PI_BASE_URL','https://e2e.test/v1'); set('pi-inp-ANTHROPIC_AUTH_TOKEN','E2E-TOKEN-SENTINEL'); if (window.__ansRenderer.savePiConfigFromForm) window.__ansRenderer.savePiConfigFromForm(); })()",
  );
  await sleep(600);
  log("PI_SAVE_STATUS=" + (await wc().executeJavaScript("document.getElementById('pi-status').textContent")));
  const tmpEnvText = fs.existsSync(PI_ENV) ? fs.readFileSync(PI_ENV, "utf8") : "";
  log("PI_TEMP_ENV_WRITTEN=" + tmpEnvText.includes("ANS_PI_MODEL=e2e-model"));
  log("PI_TEMP_ENV_HAS_BASE_URL=" + tmpEnvText.includes("ANS_PI_BASE_URL=https://e2e.test/v1"));
  log("PI_TEMP_ENV_HAS_TOKEN=" + tmpEnvText.includes("E2E-TOKEN-SENTINEL"));
  // provider 不在面板键 → 绝不写入；上下文窗口留空（原本未设）→ 不下发该键（跳过，不凭空造空键）。
  log("PI_TEMP_ENV_NO_PROVIDER=" + (!tmpEnvText.includes("ANS_PI_PROVIDER")));
  log("PI_TEMP_ENV_OMITS_EMPTY_CONTEXT_WINDOW=" + (!tmpEnvText.includes("ANS_PI_CONTEXT_WINDOW")));
  const afterSave = await wc().executeJavaScript(
    "(() => { const t=document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN'); return t ? { type: t.type, value: t.value, placeholder: t.placeholder } : { type: '', value: '', placeholder: '' }; })()",
  );
  log("PI_TOKEN_STILL_MASKED=" + (afterSave.type === "password"));
  log("PI_TOKEN_VALUE_CLEARED=" + (afterSave.value === ""));
  log("PI_TOKEN_PLACEHOLDER_SET=" + afterSave.placeholder.includes("已设置"));
  log("SHOT_10_PI_SAVED=" + (await shot("10-pi-saved.png")));
  // 收起抽屉（再点 tab-pi），不影响后续步骤。
  await wc().executeJavaScript("document.getElementById('tab-pi').click()");
  await sleep(200);
  log("DRAWER_CLOSED_AFTER_PI=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));
  await wc().executeJavaScript("(() => { const b=document.getElementById('drawer-close'); if (b) b.click(); })()");
  await sleep(200);
  log("DRAWER_CLOSED_AFTER_PI_NEW=" + (await wc().executeJavaScript("(() => { const d=document.getElementById('right-drawer'); return !!d && d.getAttribute('aria-hidden') === 'true'; })()")));

  // ———— P1-3（2026-10-13 客户裁定）：切换项目一次性防呆——有 busy 才出内联确认条；取消零动作；确认=关闭全部并进新项目 ————
  // 造真忙：再次 arm 慢轮缝（同一角色、同一文本可复用），发一条挂起消息持住 busy。
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  await sleep(700);
  let releaseSlow2;
  slowPromptGate = { promise: new Promise((r) => { releaseSlow2 = r; }) };
  slowPromptArmed = true;
  const pS2 = wc().executeJavaScript("window.desktop.sendSession('队列慢轮')");
  await sleep(500);
  log("SWITCH_SETUP_BUSY=" + (await wc().executeJavaScript("window.__ansRenderer.state.roleBusy['桌面窗口'] === true")));
  await wc().executeJavaScript("document.getElementById('btn-import').click()");
  await sleep(250);
  const swBar = await wc().executeJavaScript(
    "(() => { const b=document.getElementById('switch-confirm'); const t=document.getElementById('switch-confirm-text'); const c=document.getElementById('chat'); return { hidden: b ? b.hidden === true : true, text: t ? (t.textContent || '') : '', inChat: !!(b && c && c.contains(b)) }; })()",
  );
  log("SWITCH_CONFIRM_ON_BUSY=" + (!swBar.hidden && swBar.text.indexOf("1 个角色正在工作") >= 0 && swBar.text.indexOf("切换项目会停止它们") >= 0));
  log("SWITCH_BAR_NOT_IN_CHAT=" + (swBar.inChat === false));
  // 取消 = 什么都不发生（项目/会话原样）。
  const beforeCancel = await wc().executeJavaScript("window.desktop.listLiveSessions()");
  await wc().executeJavaScript("(() => { const b=document.getElementById('switch-confirm-cancel'); if (b) b.click(); })()");
  await sleep(250);
  const afterCancel = await wc().executeJavaScript("window.desktop.listLiveSessions()");
  const switchBarHiddenAfterCancel = await wc().executeJavaScript("(() => { const b=document.getElementById('switch-confirm'); return !b || b.hidden === true; })()");
  log(
    "SWITCH_CANCEL_NOOP=" +
      (switchBarHiddenAfterCancel && JSON.stringify(afterCancel) === JSON.stringify(beforeCancel)),
  );
  // 确认 = 关闭全部并进新项目（harness 选择器桩返回 REPO_ROOT → loadProject 同仓重载 = 完整「切换」流程）。
  nextPickPath = REPO_ROOT;
  await wc().executeJavaScript("document.getElementById('btn-import').click()");
  await sleep(250);
  await wc().executeJavaScript("(() => { const b=document.getElementById('switch-confirm-go'); if (b) b.click(); })()");
  await sleep(1800);
  const swAfter = await wc().executeJavaScript(
    "(async () => { const b=document.getElementById('switch-confirm'); const p=document.getElementById('project-path'); return { live: await window.desktop.listLiveSessions(), path: p ? p.textContent : null, barHidden: !b || b.hidden === true }; })()",
  );
  log(
    "SWITCH_CONFIRM_RELOADED=" +
      (swAfter.path === REPO_ROOT && swAfter.barHidden === true && Array.isArray(swAfter.live) && swAfter.live.length === 0),
  );
  releaseSlow2(); // 放行挂起轮（会话已被确认流程关闭；挂起 promise 收尾是无害的）
  // 空闲时切换（重载后无会话）：**零提示**，行为逐字不变（picker 桩返回 null=取消）。
  nextPickPath = null;
  await wc().executeJavaScript("document.getElementById('btn-import').click()");
  await sleep(300);
  log("SWITCH_NO_CONFIRM_WHEN_IDLE=" + (await wc().executeJavaScript("(() => { const b=document.getElementById('switch-confirm'); return !b || b.hidden === true; })()")));
  log("SWITCH_IDLE_HINT=" + (await wc().executeJavaScript("document.getElementById('composer-hint').textContent.includes('已取消导入')")));

  // ———— Phase 5A（PM §17.4）：新语义安全证据——忙时切换项目立即生效，旧项目会话仍 live / 可返回 / 可继续，排队不丢 ————
  // 旧渲染器有内联确认条（SWITCH_CONFIRM_* 已登记 OLD-ONLY）；新渲染器没有该条，本段给新语义结论。
  const hasLegacySwitchBar = await wc().executeJavaScript("!!document.getElementById('switch-confirm')");
  if (hasLegacySwitchBar) {
    log("P13_NEW_SEMANTICS=not-applicable-old-confirm-bar");
  } else {
    await tryEval("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")", "p13-load-root");
    await sleep(600);
    await ensurePiRuntime();
    await tryEval("window.__ansRenderer.selectRole('桌面窗口')", "p13-select-role");
    await waitUntil("window.__ansRenderer.state.sessionOpenRoleId === '桌面窗口'", 150, 50);
    let releaseP13;
    slowPromptGate = { promise: new Promise((resolve) => { releaseP13 = resolve; }) };
    slowPromptArmed = true;
    chatAdapterMod.takeDemoPromptLog();
    const p13Slow = wc().executeJavaScript("window.desktop.sendSession('队列慢轮')");
    await waitUntil("window.__ansRenderer.state.roleBusy['桌面窗口'] === true", 100, 50);
    log("P13_OLD_PROJECT_BUSY=" + (await wc().executeJavaScript("window.__ansRenderer.state.roleBusy['桌面窗口'] === true")));
    const queuedP13 = await withTimeout(wc().executeJavaScript("window.desktop.sendSession('P13 队列保留验证')"), 5000, "p13-queue-send");
    log("P13_QUEUED_BEFORE_SWITCH=" + (!!queuedP13 && queuedP13.ok === true && queuedP13.queued === true) + " RESULT=" + JSON.stringify(queuedP13));
    nextPickPath = SECOND_PROJECT;
    await tryEval("document.getElementById('btn-import').click()", "p13-switch-to-second");
    await waitUntil("window.__ansRenderer.state.projectRoot === " + JSON.stringify(SECOND_PROJECT), 250, 50);
    log("P13_SWITCH_IMMEDIATE=" + (await wc().executeJavaScript("window.__ansRenderer.state.projectRoot === " + JSON.stringify(SECOND_PROJECT))));
    const livesAfterSwitch = await wc().executeJavaScript("window.desktop.listLiveSessionViews()");
    log("P13_OLD_SESSION_LIVE_AFTER_SWITCH=" + (Array.isArray(livesAfterSwitch) && livesAfterSwitch.some((view) => view && view.projectRoot === REPO_ROOT && view.roleId === '桌面窗口')));
    nextPickPath = REPO_ROOT;
    await tryEval("document.getElementById('btn-import').click()", "p13-switch-back");
    await waitUntil("window.__ansRenderer.state.projectRoot === " + JSON.stringify(REPO_ROOT), 250, 50);
    await tryEval("window.__ansRenderer.selectRole('桌面窗口')", "p13-return-select");
    await waitUntil("window.__ansRenderer.state.sessionOpenRoleId === '桌面窗口'", 150, 50);
    log("P13_RETURN_RESUMES_SESSION=" + (await wc().executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId === '桌面窗口'")));
    try { releaseP13(); await withTimeout(p13Slow, 15000, "p13-slow"); } catch (error) { log("P13_SLOW_SEND_ERROR=" + (error && error.message ? error.message : error)); }
    await sleep(600);
    const p13Log = chatAdapterMod.takeDemoPromptLog().map((entry) => entry.text);
    log("P13_QUEUE_SURVIVES_SWITCH=" + (p13Log.filter((text) => text === 'P13 队列保留验证').length === 1));
    const continueP13 = await withTimeout(wc().executeJavaScript("window.desktop.sendSession('P13 返回后可继续')"), 5000, "p13-continue-send");
    await sleep(700);
    const p13Continue = chatAdapterMod.takeDemoPromptLog().map((entry) => entry.text);
    log("P13_CONTINUE_AFTER_RETURN=" + p13Continue.includes('P13 返回后可继续') + " RESULT=" + JSON.stringify(continueP13));
    nextPickPath = null;
  }

  // ———— 2026-10-13 状态机修复：回放去重（真机「同一段消息渲染两遍」——su 写文件 → project:changed →
  // refreshProject → 主进程重推会话历史 → 旧实现整份再回放）。确定性钉法：向「桌面窗口」pane 连推
  // session:history——同份重推**幂等**、增长走**增量**、重写走**重建**（绝不追加第二份）。
  const mkRow = (i, tag) => ({ kind: i % 2 === 0 ? "user" : "assistant", text: tag + " · 第 " + i + " 行", at: "2026-10-13T00:00:00.000Z" });
  const baseRows = Array.from({ length: 6 }, (_, i) => mkRow(i, "去重基线"));
  const grownRows = [...baseRows, mkRow(6, "增量尾"), mkRow(7, "增量尾")];
  const rewrittenRows = Array.from({ length: 6 }, (_, i) => mkRow(i, "重写基线"));
  const countExpr = "(() => { const d = window.__ansRenderer.rowModelDebug('桌面窗口'); return d ? d.count : -1; })()";
  const pushHistory = (rows) => wc().send("session:history", { roleId: "桌面窗口", projectRoot: REPO_ROOT, rows, error: null });
  pushHistory(baseRows);
  await sleep(400);
  const c1 = await wc().executeJavaScript(countExpr);
  pushHistory(baseRows); // 同一份历史**重推**（真机 refreshProject 链路等价物）
  await sleep(400);
  const c2 = await wc().executeJavaScript(countExpr);
  log("REPLAY_DEDUP_IDEMPOTENT=" + (c1 > 0 && c2 === c1));
  pushHistory(grownRows); // 盘上文件增长 ⇒ 只回放尾巴（增量）
  await sleep(400);
  const c3 = await wc().executeJavaScript(countExpr);
  log("REPLAY_DEDUP_APPEND=" + (c3 === c1 + 2));
  pushHistory(rewrittenRows); // 内容不一致（重写）⇒ 全量重建（不含旧集合的重复副本）
  await sleep(500);
  const c4 = await wc().executeJavaScript(countExpr);
  log("REPLAY_DEDUP_REBUILD=" + (c4 === rewrittenRows.length));
  log("REPLAY_DEDUP_REBUILD_UNIQUE_TEXT=" + (await wc().executeJavaScript("(() => { const pane=document.querySelector('#chat .chat-pane'); if (!pane) return false; const texts=[...pane.querySelectorAll('.msg-user,.msg-assistant')].map((e)=>e.textContent); const counts={}; for (const t of texts) counts[t]=(counts[t]||0)+1; return Object.values(counts).every((n)=>n===1) && texts.some((t)=>t.includes('重写基线')); })()")));
  // 真机链路等价：refreshProject（project:changed 触发者）重取枚举 → 主进程重推历史 → 同份历史下
  // pane 行数不得再增长（幂等；写文件触发的 project:changed 即走这条路）。su 的历史若存在一并核对。
  const suCountExpr = "(() => { const d = window.__ansRenderer.rowModelDebug('su'); return d ? d.count : -1; })()";
  const beforeRefresh = await wc().executeJavaScript(countExpr);
  const suBefore = await wc().executeJavaScript(suCountExpr);
  await wc().executeJavaScript("window.__ansRenderer.refreshProject()");
  await sleep(1200);
  const afterRefresh = await wc().executeJavaScript(countExpr);
  const suAfter = await wc().executeJavaScript(suCountExpr);
  log("REPLAY_NO_DOUBLE_ON_REFRESH=" + (afterRefresh === beforeRefresh && (suBefore < 0 || suAfter === suBefore)));

  // 修复验证使用真实 renderer、preload 和 IPC；失败注入只在测试主进程，不新增生产接口。
  const repairFailures = [...hardChecks];
  const repairCheck = (name, value) => {
    log(name + "=" + value);
    // Phase 5A（PM §17.4）：失败累计并继续，让后续检查名都能产出；判据本身不放宽。
    if (value !== true) repairFailures.push(name);
  };
  const waitRepair = async (expression) => {
    for (let attempt = 0; attempt < 250; attempt += 1) {
      try { if (await wc().executeJavaScript(expression)) return true; } catch { /* 可能因缺少节点抛错；继续等待 */ }
      await sleep(20);
    }
    log("WAIT_TIMEOUT=" + expression);
    return false;
  };
  const inputRepair = async (text) => {
    try {
      await wc().executeJavaScript("(() => { const input=document.getElementById('inp-message'); input.value=" + JSON.stringify(text) + "; input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()");
    } catch (error) {
      log("INPUT_REPAIR_ERROR=" + (error && error.message ? error.message : String(error)));
    }
  };
  // P2（2026-10-30）：网络状态行——主进程 `network:state` → preload → store → 会话头人话；
  // 离线可见（含「请求已暂停/队列等待网络」标题）、恢复后短暂「网络已恢复」；可见文本无技术 code。
  wc().send("network:state", { online: false, source: "main-net", at: Date.now(), stableForMs: 0, reason: "interface-down" });
  repairCheck("NETWORK_STATUS_OFFLINE_VISIBLE", await waitRepair("(() => { const n=document.getElementById('network-status'); return !!n && n.getAttribute('data-status')==='offline' && n.textContent.includes('网络已断开') && /请求计时已暂停/.test(n.title) && !/ECONN|network-offline|stack|https?:/.test(n.textContent + n.title); })()"));
  wc().send("network:state", { online: true, source: "main-net", at: Date.now(), stableForMs: 0, reason: "probe" });
  repairCheck("NETWORK_STATUS_RECOVERED_VISIBLE", await waitRepair("(() => { const n=document.getElementById('network-status'); return !!n && n.getAttribute('data-status')==='recovered' && n.textContent.includes('网络已恢复'); })()"));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  const rowsBeforeConfirm = await wc().executeJavaScript("window.__ansRenderer.rowModelDebug('桌面窗口').count");
  const callsBeforeConfirm = repairOpenCalls;
  log("REPAIR_OPEN_CALLS_BEFORE_SAME_ROLE=" + callsBeforeConfirm);
  log("REPAIR_SESSION_OPEN_ROLE_BEFORE_SAME_ROLE=" + JSON.stringify(await wc().executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId")));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  log("REPAIR_OPEN_CALLS_AFTER_SAME_ROLE=" + repairOpenCalls);
  log("REPAIR_SESSION_OPEN_ROLE_AFTER_SAME_ROLE=" + JSON.stringify(await wc().executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId")));
  repairCheck("SESSION_REPAIR_SAME_ROLE_CONFIRMS_BACKEND", repairOpenCalls === callsBeforeConfirm + 1);
  repairCheck("SESSION_REPAIR_CONFIRM_PRESERVES_HISTORY", (await wc().executeJavaScript("window.__ansRenderer.rowModelDebug('桌面窗口').count")) === rowsBeforeConfirm);

  // 后台被释放但前端仍保留旧开启标记：显式同角色点击应恢复，然后真实投递一份。
  await wc().executeJavaScript("window.desktop.stopSession('桌面窗口')");
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  log("REPAIR_AFTER_STOP_OPEN_CALLS=" + repairOpenCalls);
  log("REPAIR_AFTER_STOP_SESSION_OPEN_ROLE=" + JSON.stringify(await wc().executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId")));
  chatAdapterMod.takeDemoPromptLog();
  const sendsBeforeRecovery = repairSendRequests.length;
  const completionsBeforeRecovery = repairSendCompletions;
  await inputRepair("修复探针恢复消息");
  for (let attempt = 0; attempt < 250 && repairSendCompletions === completionsBeforeRecovery; attempt += 1) await sleep(20);
  await waitRepair("window.__ansRenderer.state.roleBusy['桌面窗口'] === false && document.getElementById('inp-message').value === ''");
  const deliveredRepair = chatAdapterMod.takeDemoPromptLog().filter((entry) => entry.text === "修复探针恢复消息");
  repairCheck("SESSION_REPAIR_EXPLICIT_RECOVERY_DELIVERS_ONCE", repairSendRequests.length === sendsBeforeRecovery + 1 && deliveredRepair.length === 1);

  repairFailSend = true;
  const beforeFailure = repairSendRequests.length;
  await inputRepair("修复探针失败消息");
  await waitRepair("window.__ansRenderer.state.sessionOpenRoleId === null");
  repairCheck("SESSION_REPAIR_SEND_FAILURE_INVALIDATES", repairSendRequests.length === beforeFailure + 1 && (await wc().executeJavaScript("document.getElementById('chat').textContent.includes('发送失败原文')")));
  repairFailSend = false;
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  repairCheck("SESSION_REPAIR_NO_AUTOMATIC_RESEND", repairSendRequests.length === beforeFailure + 1 && chatAdapterMod.takeDemoPromptLog().every((entry) => entry.text !== "修复探针失败消息"));

  repairThrowSend = true;
  await inputRepair("修复探针异常消息");
  await waitRepair("window.__ansRenderer.state.sessionOpenRoleId === null");
  repairCheck("SESSION_REPAIR_SEND_EXCEPTION_INVALIDATES", await wc().executeJavaScript("document.getElementById('chat').textContent.includes('发送异常原文')"));
  repairThrowSend = false;

  // 真实粘贴图输入，补开失败须保留文字/附件且没有发送气泡或 send IPC。
  await wc().executeJavaScript("(() => { const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c=>c.charCodeAt(0)); const transfer=new DataTransfer(); transfer.items.add(new File([bytes],'repair.png',{type:'image/png'})); document.getElementById('inp-message').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true})); })()");
  await waitRepair("document.querySelectorAll('#attach-row .attach-chip').length === 1");
  repairFailOpen = true;
  const sendsBeforeOpenFailure = repairSendRequests.length;
  const rowsBeforeOpenFailure = await wc().executeJavaScript("window.__ansRenderer.rowModelDebug('桌面窗口').count");
  await inputRepair("修复探针补开失败保留输入");
  await waitRepair("document.getElementById('chat').textContent.includes('补开失败原文')");
  repairCheck("SESSION_REPAIR_FAILED_OPEN_PRESERVES_INPUT", await wc().executeJavaScript("document.getElementById('inp-message').value === '修复探针补开失败保留输入' && document.querySelectorAll('#attach-row .attach-chip').length === 1"));
  repairCheck("SESSION_REPAIR_FAILED_OPEN_DOES_NOT_SEND", repairSendRequests.length === sendsBeforeOpenFailure);
  repairCheck("SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE", (await wc().executeJavaScript("window.__ansRenderer.rowModelDebug('桌面窗口').count")) === rowsBeforeOpenFailure + 1);
  repairFailOpen = false;
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  repairCheck("SESSION_REPAIR_FAILED_OPEN_EXPLICIT_RECOVERY", await wc().executeJavaScript("window.__ansRenderer.state.sessionOpenRoleId === '桌面窗口' && !document.getElementById('btn-send').disabled"));
  repairCheck("SESSION_REPAIR_FAILED_OPEN_NO_REPLAY", repairSendRequests.length === sendsBeforeOpenFailure);

  // 2026-10-23（I9）：断言前先确认目标角色 pane 已选中并挂载（虚拟 pane 按角色渲染）。
  await waitRepair("window.__ansRenderer.state.selectedRoleId === '桌面窗口' && !!document.querySelector('#chat .chat-pane[data-role-id=\"桌面窗口\"]')");
  for (const [status, label] of [["unreported", "未报告"], ["failed", "失败"], ["aborted", "已中止"]]) {
    // 2026-10-23（I9）：聊天 pane 的行由行模型异步投影；行数超虚拟阈值后离屏行还不构造 DOM。
    // 修复仅调整「什么时候找」：先记录事实（行模型计数/滚动量/已挂载 handback 数），发送后等行进入
    // 行模型，再**贴底并等待卡片挂载**后才断言；断言语义不变（该状态的结论标签必须出现在
    // `.msg-handback .hb-head strong`）。
    const diagExpr = "(() => { const c=document.getElementById('chat'); const d=window.__ansRenderer.rowModelDebug('桌面窗口')||{}; return { rowCount: d.count, scrollTop: c?c.scrollTop:null, scrollHeight: c?c.scrollHeight:null, clientHeight: c?c.clientHeight:null, handbacks: document.querySelectorAll('#chat .msg-handback').length, heads: [...document.querySelectorAll('#chat .msg-handback .hb-head strong')].map(e=>e.textContent) }; })()";
    const scrollBottomExpr = "(() => { const c=document.getElementById('chat'); if (!c) return false; c.scrollTop=c.scrollHeight; c.dispatchEvent(new Event('scroll',{bubbles:true})); return true; })()";
    const matchExpr = "[...document.querySelectorAll('#chat .msg-handback .hb-head strong')].some(e=>e.textContent.includes(" + JSON.stringify(label) + "))";
    const before = await wc().executeJavaScript(diagExpr);
    log("REPORT_STATUS_" + status.toUpperCase() + "_BEFORE=" + JSON.stringify(before));
    wc().send("session:event", { roleId: "桌面窗口", event: { kind: "handback", summary: "新状态", report: { version: 1, reportId: "e2e-hb-status-" + status, source: { roleId: "桌面窗口", runtime: "pi" }, origin: "terminal-fallback", status, summary: { text: status }, evidence: [], at: "2026-10-13T00:00:00Z" } } });
    let rowAppended = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const now = await wc().executeJavaScript(diagExpr);
      rowAppended = now.rowCount > before.rowCount;
      if (rowAppended) break;
      await sleep(20);
    }
    log("REPORT_STATUS_" + status.toUpperCase() + "_APPENDED=" + rowAppended + " " + JSON.stringify(await wc().executeJavaScript(diagExpr)));
    await wc().executeJavaScript(scrollBottomExpr);
    let matched = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      matched = await wc().executeJavaScript(matchExpr);
      if (matched) break;
      await wc().executeJavaScript(scrollBottomExpr);
      await sleep(20);
    }
    log("REPORT_STATUS_" + status.toUpperCase() + "_AFTER=" + JSON.stringify(await wc().executeJavaScript(diagExpr)));
    repairCheck("REPORT_STATUS_" + status.toUpperCase(), matched);
  }

  // 真实renderer进程退出→明确故障页→用户点击恢复；沿同一helper及受限preload，不调用模型。
  // 注：本批 450 条仍是**无 turnId 的旧形状**（会塌成一组行）——相关断言（未决卡可见/恢复）不依赖长会话
  // 窗口化；是否同法改生产形状，产品评审列为可选、待 PM 批次决定（2026-10-14），本批有意保留。
  // Phase 5A §18：前面 OP/OPX/P1/anchor 段在新端可能因载体差异未作答，留下队列中的挂起请求；
  // 本段只验证自己的 pending 卡——先清掉历史挂起（测试隔离，不改任何断言）。
  const pendingBeforeCleanup = customerChannel.pendingCount();
  customerChannel.rejectAllPending("e2e 5A section cleanup");
  await sleep(150);
  log("RECOVERY_SECTION_CLEANUP=" + JSON.stringify({ before: pendingBeforeCleanup, after: customerChannel.pendingCount(), queued: customerChannel.queuedCount(), presentations: operatorPresentations.length }));
  let pendingAnswered = false;
  wc().send("session:events", Array.from({ length: 450 }, (_, index) => ({ roleId: "桌面窗口", event: { kind: "tool_call", summary: "待确认定位长会话 " + index } })));
  await sleep(100);
  await wc().executeJavaScript("document.getElementById('chat').scrollTop=0");
  await sleep(80);
  const pendingOutcome = Promise.resolve(customerChannel.customerInput({ kind: "confirm", title: "重载后仍需客户明确作答" }, { roleId: "桌面窗口" })).then((value) => { pendingAnswered = true; return value; });
  const pendingId = operatorPresentations[operatorPresentations.length - 1].id;
  await sleep(100);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面窗口')");
  await sleep(150);
  log("PENDING_DIAG=" + JSON.stringify(await wc().executeJavaScript("(() => { const id=" + JSON.stringify(pendingId) + "; const sel=`[data-request-id='${id}']`; const els=[...document.querySelectorAll(sel)]; const chat=document.getElementById('chat'); return { count: els.length, confirmButtons: document.querySelectorAll(sel+' .op-confirm').length, scrollTop: chat ? chat.scrollTop : null, chatRect: chat ? { top: chat.getBoundingClientRect().top, bottom: chat.getBoundingClientRect().bottom } : null, selectedRoleId: window.__ansRenderer.state.selectedRoleId, pendingKeys: Object.keys(window.__ansRenderer.state.pendingOperator || {}), rowCount: (window.__ansRenderer.rowModelDebug('桌面窗口') || {}).count, anyCards: document.querySelectorAll('#chat .op-request').length, paneRoleIds: [...document.querySelectorAll('#chat .chat-pane')].map((p) => p.dataset.roleId), cards: els.map((el) => { const r=el.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, text:(el.textContent||'').slice(0,60) }; }) }; })()")));
  repairCheck("PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE", await wc().executeJavaScript("(() => {const card=document.querySelector('#decision-dialog[data-request-id=" + pendingId + "]'),button=card&&card.querySelector('.dd-confirm');if(!card||!button)return false;const r=card.getBoundingClientRect(),b=button.getBoundingClientRect();return card.textContent.includes('重载后仍需客户明确作答') && r.width>0 && b.width>0;})()"));
  const sendsBeforeCrash = repairSendRequests.length;
  const projectBeforeCrash = recoverySnapshot.projectRoot;
  const failureLoaded = new Promise((resolve) => wc().once("did-finish-load", resolve));
  wc().forcefullyCrashRenderer();
  await failureLoaded;
  repairCheck("RECOVERY_VISIBLE_FAILURE_BUTTON", await wc().executeJavaScript("!!document.getElementById('reload-interface')"));
  const restoredLoaded = new Promise((resolve) => wc().once("did-finish-load", resolve));
  await wc().executeJavaScript("(() => { const b=document.getElementById('reload-interface'); if (b) b.click(); })()");
  await restoredLoaded;
  await waitRepair("window.__ansRenderer && window.__ansRenderer.state.sessionOpenRoleId === '桌面窗口'");
  repairCheck("RECOVERY_PROJECT_AND_ROLE_RESTORED", await wc().executeJavaScript("window.__ansRenderer.state.projectRoot === " + JSON.stringify(projectBeforeCrash)));
  await wc().executeJavaScript("window.desktop.recoveryReady()");
  await sleep(100);
  log("RECOVERY_CARD_DIAG=" + JSON.stringify(await wc().executeJavaScript("(() => { const id=" + JSON.stringify(pendingId) + "; const sel=`[data-request-id='${id}']`; const els=[...document.querySelectorAll(sel)]; const chat=document.getElementById('chat'); return { count: els.length, confirmButtons: document.querySelectorAll(sel+' .op-confirm').length, scrollTop: chat ? chat.scrollTop : null, chatRect: chat ? { top: chat.getBoundingClientRect().top, bottom: chat.getBoundingClientRect().bottom } : null, cards: els.map((el) => { const r=el.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, text:(el.textContent||'').slice(0,80) }; }) }; })()")));
  log("RECOVERY_PRESENTATIONS_AT_CARD_CHECK=" + operatorPresentations.length);
  repairCheck("RECOVERY_SAME_PENDING_CARD_ONCE", await wc().executeJavaScript("document.querySelectorAll('#decision-dialog[data-request-id=" + pendingId + "]').length === 1"));
  repairCheck("RECOVERY_NO_AUTO_REPLY_OR_SEND", pendingAnswered === false && repairSendRequests.length === sendsBeforeCrash);
  const answered = await wc().executeJavaScript("window.desktop.operatorRespond({id:" + JSON.stringify(pendingId) + ",decision:{kind:'confirm',confirmed:true}})");
  const pendingResult = await withTimeout(pendingOutcome, 5000, "pending-outcome");
  log("RECOVERY_ANSWER_RESULT=" + JSON.stringify({ answered, pendingOutcome: pendingResult }));
  repairCheck("RECOVERY_OLD_REQUEST_STILL_ANSWERABLE", answered.ok === true && pendingResult?.outcome === "answered");
  const replayBeforeEnded = operatorPresentations.length;
  log("RECOVERY_PRESENTATIONS_BEFORE_ENDED_REPLAY=" + replayBeforeEnded);
  await wc().executeJavaScript("window.desktop.recoveryReady()");
  log("RECOVERY_PRESENTATIONS_AFTER_ENDED_REPLAY=" + operatorPresentations.length);
  repairCheck("RECOVERY_ENDED_REQUEST_NOT_REPLAYED", operatorPresentations.length === replayBeforeEnded);
  await diagnosticStore.flushDiagnostics();
  const diagnosticFiles = fs.readdirSync(path.join(OUTDIR, "diagnostics")).filter((file) => file.endsWith(".jsonl"));
  const diagnosticText = diagnosticFiles.map((file) => fs.readFileSync(path.join(OUTDIR, "diagnostics", file), "utf8")).join("");
  const diagnosticEventNames = [...new Set((diagnosticText.match(/"event":"[^"]+"/g) || []).map((token) => token.slice(9, -1)))];
  log("DIAGNOSTIC_EVENT_NAMES=" + diagnosticEventNames.join(","));
  log("DIAGNOSTIC_EVENTS_COVER_OLD=" + (["window.renderer.gone","renderer.event-error","renderer.viewport","renderer.replay","renderer.recovery"].every((event) => diagnosticEventNames.includes(event))));
  repairCheck("DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS", ["window.renderer.gone", "renderer.event-error", "renderer.viewport", "renderer.replay", "renderer.recovery"].every((event) => diagnosticText.includes('"event":"' + event + '"')));

  // macOS同类窗口close后重建：同helper释放自有handlers，真实Electron再注册并加载。
  const oldWindow = win;
  const windowClosed = new Promise((resolve) => oldWindow.once("closed", resolve));
  oldWindow.close();
  await windowClosed;
  win = new BrowserWindow({ width: 1360, height: 860, show: true, frame: false, webPreferences: { preload: path.join(APP_DIR, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  registerIpc();
  await win.loadFile(RENDERER_ENTRY);
  await waitRepair("window.__ansRenderer && window.__ansRenderer.state.sessionOpenRoleId === '桌面窗口'");
  repairCheck("MAC_CLOSE_REOPEN_LOADS_WITHOUT_DUPLICATE_HANDLERS", await wc().executeJavaScript("!!document.getElementById('inp-message') && !!window.desktop"));
  repairCheck("MAC_CLOSE_REOPEN_NO_AUTO_SEND", repairSendRequests.length === sendsBeforeCrash);

  // —————— D 批：治理机器撤除（真实主进程最小检查）——————
  // 真实 `createDesktopInterface` + OUTDIR 临时项目：listProject 只枚举角色，不再自动推进/派发；
  // 目标项目零写入（不建 flow/账本/验收记录）。
  {
    const projectMod = await import(pathToFileURL(path.join(APP_DIR, "desktop", "project.ts")).href);
    const coordRoot = path.join(OUTDIR, "governance-disabled-project");
    fs.mkdirSync(coordRoot, { recursive: true });
    const builtIn = (roleId, governanceFunction) => ({
      roleId,
      cardPath: "",
      boundaryPath: "",
      cardText: `# ${roleId}`,
      boundary: { entries: [], boundarySource: "<built-in:trio>", acceptance: { accepted: false, source: "" } },
      builtIn: true,
      governanceFunction,
    });
    const listing = {
      projectRoot: coordRoot,
      roles: [
        builtIn("chief", "chief"),
        builtIn("product", "product"),
        builtIn("rapporteur", "proposal"),
        builtIn("nominator", "nomination"),
        builtIn("convener", "schedule"),
        builtIn("verifier", "verification"),
        { roleId: "executor", cardPath: "角色卡/executor/role-card.md", boundaryPath: "角色卡/executor/boundary.yaml", cardText: "# executor", boundary: { entries: [], boundarySource: "角色卡/executor/boundary.yaml", acceptance: { accepted: false, source: "" } } },
      ],
      warnings: [],
      hasRoles: true,
      primaryRoleId: "chief",
      governanceModel: "trio",
    };
    const coordSends = new Map();
    const coordEvents = [];
    const coordIface = createDesktopInterface({
      pickDirectory: async () => coordRoot,
      emitEvent: (envelope) => coordEvents.push(envelope),
      listProjectFn: async () => listing,
      openRoleSessionFn: async (input) => {
        const sends = coordSends.get(input.roleId) ?? [];
        coordSends.set(input.roleId, sends);
        return {
          async send(text) { sends.push(text); },
          events() {
            return {
              [Symbol.asyncIterator]() {
                return {
                  async next() {
                    return { value: undefined, done: true };
                  },
                };
              },
            };
          },
          async dispose() {},
        };
      },
      buildProjectConfigFn: projectMod.buildProjectConfig,
      resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
    });
    try {
      await coordIface.listProject({ projectRoot: coordRoot });
      await sleep(500);
      repairCheck("GOVERNANCE_DISABLED_NO_AUTO_DISPATCH", (coordSends.get("verifier") ?? []).length === 0);
      repairCheck("GOVERNANCE_DISABLED_NO_AUTO_SESSION", coordSends.size === 0);
      repairCheck(
        "GOVERNANCE_DISABLED_ZERO_WRITE",
        !fs.existsSync(path.join(coordRoot, ".ans")) && !fs.existsSync(path.join(coordRoot, "docs")),
      );
      log("GOVERNANCE_COORDINATION=" + JSON.stringify({ verifierSends: (coordSends.get("verifier") ?? []).length, sessions: coordSends.size, events: coordEvents.length }));
    } finally {
      await coordIface.stopSession();
    }
  }

  log("E2E_PASS=" + (repairFailures.length === 0));
  log("E2E_FAILURES=" + repairFailures.join(", "));
  log("E2E_DONE=1");
}

app.whenReady().then(async () => {
  // 去掉默认菜单栏（与 app/main.ts 同形；守卫断言它「不在」）。
  Menu.setApplicationMenu(null);
  try {
    const mod = await import(pathToFileURL(path.join(APP_DIR, "desktop", "interface.ts")).href);
    createDesktopInterface = mod.createDesktopInterface;
    // demo 适配器（用于注入缝：顶掉真实 pi 工厂，令 e2e 离线可跑）。
    const chatMod = await import(pathToFileURL(path.join(APP_DIR, "desktop", "chat-adapter.ts")).href);
    createChatDemoAdapter = chatMod.createChatDemoAdapter;
    chatAdapterMod = chatMod;
    // A-5：客户交互通道（真实现场；presenter 推渲染侧、respond 校验回包）。
    const ciMod = await import(pathToFileURL(path.join(APP_DIR, "desktop", "customer-input.ts")).href);
    createCustomerInputChannel = ciMod.createCustomerInputChannel;
    // D-1：会话记录恢复（真实现场；只读解析）。
    const shMod = await import(pathToFileURL(path.join(APP_DIR, "desktop", "session-history.ts")).href);
    readRoleSessionHistory = shMod.readRoleSessionHistory;
    diagnosticModule = await import(pathToFileURL(path.join(APP_DIR, "desktop", "diagnostics.ts")).href);
    diagnosticStore = await import(pathToFileURL(path.join(APP_DIR, "..", "src", "common", "shared", "diagnostics.ts")).href);
    // Phase 5A（PM §17.4）：目标入口经唯一路径事实源解析；ANS_RENDERER_ENTRY 优先、非法 fail-fast。
    const rendererEntryModule = await import(pathToFileURL(path.join(APP_DIR, "desktop", "renderer-entry.ts")).href);
    const requestedEntry = process.env.ANS_RENDERER_ENTRY;
    if (requestedEntry !== undefined && requestedEntry !== "") {
      const resolved = path.resolve(requestedEntry);
      if (!path.isAbsolute(requestedEntry) || path.extname(resolved).toLowerCase() !== ".html") {
        fs.writeFileSync(path.join(OUTDIR, "report.txt"), "RENDERER_ENTRY_ERROR=" + JSON.stringify({ value: requestedEntry, reason: "absolute .html required" }) + "\n");
        app.exit(1);
        return;
      }
      RENDERER_ENTRY = resolved;
    } else {
      RENDERER_ENTRY = rendererEntryModule.resolveRendererEntry(APP_DIR);
    }
    if (!fs.existsSync(RENDERER_ENTRY)) {
      fs.writeFileSync(path.join(OUTDIR, "report.txt"), "RENDERER_ENTRY_ERROR=" + JSON.stringify({ value: RENDERER_ENTRY, reason: "entry not found" }) + "\n");
      app.exit(1);
      return;
    }
    diagnosticStore.configureDiagnostics({ directory: path.join(OUTDIR, "diagnostics") });
  } catch (err) {
    fs.writeFileSync(path.join(OUTDIR, "report.txt"), "IMPORT_ERROR=" + (err && err.stack ? err.stack : err) + "\n");
    app.quit();
    return;
  }
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: true,
    // 无边框（与真实应用一致，客户要求去掉原生标题栏、自绘一条）——否则截图里看不到自绘标题栏。
    // 保留默认 resizable（Windows 上无边框窗口仍有缩放边框）。
    frame: false,
    webPreferences: {
      preload: path.join(APP_DIR, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  registerIpc();
  win.loadFile(RENDERER_ENTRY);

  const watchdog = setTimeout(() => {
    try { fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n") + "\nWATCHDOG_TIMEOUT=1\n"); } catch {}
    app.exit(0);
  // Phase 5A：整机自检覆盖的步骤增加（双端/新语义），90s 会截断合法运行；保留有界看门狗 180s。
  }, 180000);

  win.webContents.once("did-finish-load", async () => {
    try {
      await run();
    } catch (err) {
      log("E2E_ERROR=" + (err && err.stack ? err.stack : err));
    }
    clearTimeout(watchdog);
    // 收尾报告：**防御式写**（写失败不让进程卡死——绝不因报告问题丢掉 exit）。
    try {
      fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n") + "\n");
    } catch (err) {
      console.error("e2e 报告写入失败：" + (err && err.message ? err.message : err));
    }
    app.exit(0);
  });
});

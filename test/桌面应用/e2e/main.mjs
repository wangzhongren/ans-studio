// test/桌面应用/e2e/main.mjs
// 桌面应用端到端自检：以真实 Electron 主进程启动真实 preload + 真实渲染进程。
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

import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "..", "app");
const REPO_ROOT = process.env.ANS_E2E_PROJECT || path.resolve(HERE, "..", "..", "..");
const OUTDIR = process.env.ANS_E2E_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-e2e-"));
// 看门狗修复（2026-10-12）：OUTDIR 由调用方指定时必须**先建目录**——否则收尾 report.txt 写入抛 ENOENT
// （未捕获拒绝）⇒ 进程不退出、表现成「e2e 卡住」（真因已定位：run 已完成，卡在退出前的报告写入）。
fs.mkdirSync(OUTDIR, { recursive: true });
// T28：Pi 配置面板的目标 `.env`——**e2e 一律用 OUTDIR 下的临时文件**，
// **绝不指向仓库根真实 `.env`**（那会改掉客户真实凭据）。注入给 interface 的 `envFilePath`。
const PI_ENV = path.join(OUTDIR, "e2e-pi.env");

let createDesktopInterface = null;
let createChatDemoAdapter = null;
let win;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
const log = (s) => { report.push(s); };
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
  const desktop = createDesktopInterface({
    pickDirectory: async () => {
      const r = await dialog.showOpenDialog(win, { title: "导入项目", properties: ["openDirectory"] });
      return r.canceled ? null : r.filePaths[0] || null;
    },
    emitEvent: (ev) => { if (!win.isDestroyed()) win.webContents.send("session:event", ev); },
    // ⚠ 测试注入缝（客户 2026-10-11 裁定：界面去掉运行时选择器、桌面一律以 pi 发起）：
    //    顶掉**真实 pi 工厂**，改注入 demo 适配器工厂 ⇒ e2e 仍能**离线**跑完整流程（不触网、不需凭据）。
    //    适配器按 `role.boundary` 构造（bindRole 收到的 ResolvedRole 带 boundary）；行为与既有 demo 一致
    //    （其 buildGovernedTools 未配置 writeRoot ⇒ 只判不写、绝不落盘，故不会改动仓库）。
    //    界面/会话的运行时标签仍是 pi——换掉的只是「注入缝上的适配器」，不是界面后门。
    createPiAdapterFactoryFn: () =>
      (gate) => ({
        composeContext: (role) => createChatDemoAdapter({ gate, boundary: role.boundary }).composeContext(role),
        bindRole: (role) => createChatDemoAdapter({ gate, boundary: role.boundary }).bindRole(role),
      }),
    // ⚠ 临时 `.env` 路径（不碰仓库根）；piConfigEnv 用独立对象避免污染 e2e 进程环境。
    envFilePath: PI_ENV,
    piConfigEnv: {},
  });
  ipcMain.handle("app:pick-project", () => desktop.pickProject());
  ipcMain.handle("app:list-project", async (_e, input) => {
    const res = await desktop.listProject(input);
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
  ipcMain.handle("session:open", (_e, input) => desktop.openSession(input));
  ipcMain.handle("session:send", (_e, input) => desktop.sendSession(input));
  ipcMain.handle("session:stop", (_e, input) => desktop.stopSession(input));
  // B-2：保活会话列表（与 app/main.ts 同形）。
  ipcMain.handle("session:live", () => desktop.listLiveSessions());
  // B-1：链接外开——替身只记录 URL 并回 ok（**不真开系统浏览器**；校验仍在 Interface 层，与此替身同形）。
  ipcMain.handle("app:open-external", (_e, input) => {
    openExternalCalls.push(input && input.url);
    return { ok: true };
  });
  // A-5：客户交互通道（真实实现）：请求经 session:operator-request 推给渲染侧渲染成交互卡；
  // 回包经 session:operator-response 直连通道（按请求快照校验——选项 id 必须 ⊆ 已发）。
  customerChannel = createCustomerInputChannel({
    presenter: (payload) => {
      if (!win.isDestroyed()) win.webContents.send("session:operator-request", payload);
    },
    operatorId: "e2e-operator",
  });
  ipcMain.handle("session:operator-response", (_e, input) =>
    customerChannel.respond(input && typeof input === "object" ? input : {}),
  );
  // M-1：shell 确认卡回包通道（e2e 镜像**生产形态**：本 harness 无 shell presenter ⇒ 无挂起请求，
  // 一律如实回 `expired`——P-1 探针据此断言「Esc=不放行、卡片转**已失效**终态」）。
  ipcMain.handle("shell:confirm-response", () => ({ ok: false, expired: true, error: "e2e：无挂起请求（镜像生产通道形态）" }));
  ipcMain.handle("pi-config:get", () => desktop.getPiConfig());
  ipcMain.handle("pi-config:save", (_e, input) => desktop.savePiConfig(input));
  // 自绘标题栏的窗口控制（与 app/main.ts 同形，e2e 镜像真实应用；守卫见 run() 步骤 0）。
  ipcMain.handle("window:minimize", () => { if (!win.isDestroyed()) win.minimize(); });
  ipcMain.handle("window:toggle-maximize", () => {
    if (win.isDestroyed()) return false;
    if (win.isMaximized()) { win.unmaximize(); return false; }
    win.maximize(); return true;
  });
  ipcMain.handle("window:close", () => { if (!win.isDestroyed()) win.close(); });
  ipcMain.handle("window:is-maximized", () => (win.isDestroyed() ? false : win.isMaximized()));
  win.on("maximize", () => { if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", true); });
  win.on("unmaximize", () => { if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", false); });
}

async function shot(name) {
  try {
    const img = await win.webContents.capturePage();
    const p = path.join(OUTDIR, name);
    fs.writeFileSync(p, img.toPNG());
    return p;
  } catch (err) {
    return "capture-failed:" + (err && err.message);
  }
}

async function modalExists() {
  return wc().executeJavaScript("document.getElementById('modal') !== null");
}

function wc() { return win.webContents; }

async function run() {
  log("ELECTRON=" + process.versions.electron);
  log("NODE=" + process.versions.node);
  log("PROJECT=" + REPO_ROOT);
  log("OUTDIR=" + OUTDIR);

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
      ipcMain.handle(ch, fn);
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
  log("PROJECT_PATH_SHOWN=" + (await wc().executeJavaScript("document.getElementById('project-path').textContent")));
  log("PROJECT_BTN_SWITCHED=" + (await wc().executeJavaScript("document.getElementById('btn-import').textContent === '切换项目'")));
  const roleIds = await wc().executeJavaScript("window.__ansRenderer.state.roles.map(r=>r.roleId)");
  log("ROLE_COUNT=" + roleIds.length);
  log("ROLE_IDS=" + roleIds.join(", "));
  // T17：导入后**默认选中并高亮主入口角色（su）**，空聊天区给「开始与 su 对话」主 CTA——但**不自动开会话**。
  // 主入口 id 一律取 listProject 的 primaryRoleId（渲染侧不硬编码 "su"）。
  log("PRIMARY_ROLE_ID=" + (await wc().executeJavaScript("window.__ansRenderer.state.primaryRoleId")));
  log("DEFAULT_SELECTED_ROLE=" + (await wc().executeJavaScript("window.__ansRenderer.state.selectedRoleId")));
  const suItem = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); return { active: !!(it && it.classList.contains('active')), primaryBadge: !!(it && it.querySelector('.ti-badge.primary')), inMainGroup: !!(it && it.previousElementSibling && it.previousElementSibling.className==='tree-group') }; })()",
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

  // 1b) 内置治理角色 su：排在树顶、带「内置」徽标、可点开聊天
  log("FIRST_ROLE_ID=" + roleIds[0]);
  log("SU_IS_FIRST=" + (roleIds[0] === "su"));
  const suBuiltIn = await wc().executeJavaScript(
    "(() => { const it=document.querySelector('#role-tree .tree-item'); return {builtin: it.classList.contains('builtin'), badge: !!it.querySelector('.ti-badge'), name: it.querySelector('.ti-name').textContent}; })()",
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
  // 这条，故移除。此处断言它**没有出现**（守卫「它不该出现」，不是删断言）。su 那行应只剩「主入口」「内置」。
  const suNoReadonly = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); return { badge: !!(it && it.querySelector('.ti-badge.readonly')), note: document.querySelector('#chat').textContent.includes('本版只读'), rows: document.querySelectorAll('#chat .sys-readonly').length, labels: [...(it?it.querySelectorAll('.ti-badge'):[])].map(b=>b.textContent).join('|') }; })()",
  );
  log("SU_NO_READONLY_BADGE=" + !suNoReadonly.badge);
  log("SU_NO_READONLY_NOTE=" + !suNoReadonly.note + " SU_NO_READONLY_ROWS=" + (suNoReadonly.rows === 0));
  log("SU_BADGE_LABELS=" + suNoReadonly.labels);
  // 写入语义（客户 2026-10-11 裁定：去掉运行时选择器、默认跑 pi）：常驻**横栏**（不再内联进聊天流）。
  log("SU_WRITE_NOTE_IN_HEADER=" + (await wc().executeJavaScript("!!document.querySelector('.chat-head #runtime-note')")));
  log("SU_WRITE_NOTE_SAYS_PI=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('真正落到你导入的项目')")));
  log("SU_NO_INLINE_WRITE_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .sys-nowrite, #chat .sys-write').length === 0")));
  log("SHOT_01B_SU=" + (await shot("01b-su.png")));
  // T36：仓库根（有角色）的 su 会话是**普通聊天**、非创世态 → **不**显示「完成 bootstrap」入口。
  log("BOOTSTRAP_ACTION_REMOVED=" + (await wc().executeJavaScript("document.getElementById('bootstrap-action') === null")));

  // 2) 点角色 → 直接进入聊天（无确认框）
  const clicked = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.textContent.includes('桌面应用')); if(it){it.click(); return true;} return false; })()",
  );
  log("CLICKED_DESKTOP_ROLE=" + clicked);
  await sleep(1200);
  log("NO_MODAL_AFTER_ROLE_CLICK=" + !(await modalExists()));
  log("CHAT_HEADER_ROLE=" + (await wc().executeJavaScript("document.getElementById('chat-role').textContent")));
  log("SESSION_STATE=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state || '(none)'"))); // 同上
  log("NO_WELCOME_AFTER_OPEN=" + (await wc().executeJavaScript("!document.querySelector('#chat').textContent.includes('已开启与角色')")));
  log("USER_BUBBLES_BEFORE=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .msg-user').length")));
  // 可写的项目角色（桌面应用）：同样**不该**带「只读」标记，聊天流内亦无只读说明（守卫「它不该出现」）。
  const desktopRole = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.textContent.includes('桌面应用')); return { badge: !!(it && it.querySelector('.ti-badge.readonly')), rows: document.querySelectorAll('#chat .sys-readonly').length }; })()",
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
  log("HAS_DENIED_INLINE=" + (await wc().executeJavaScript("document.querySelectorAll('#chat details.sys-denied').length")));
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
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.textContent.includes('桌面应用')); it && it.click(); })()",
  );
  await sleep(500);
  log("RESUME_HINT=" + (await wc().executeJavaScript("document.getElementById('composer-hint').textContent")));
  log("SESSION_STATE_AFTER_RESUME=" + (await wc().executeJavaScript("document.getElementById('chat').dataset.state || '(none)'"))); // 同上
  log("NO_MODAL_AFTER_RESUME=" + !(await modalExists()));

  // 6) 右栏抽屉（客户裁定 2026-10-13：右栏不常驻，收成右上角图标簇；点开展示、再点收起）：
  //    先断言默认收起，点 tab-card 展示 → 资料四组（角色卡/边界/变更/文档）在抽屉内；再点收起。
  log("TABS_PRESENT=" + (await wc().executeJavaScript("['tab-card','tab-todo','tab-queue','tab-pi'].every(id=>!!document.getElementById(id))")));
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
  log("RIGHT_HAS_CARD=" + right.card + " RIGHT_HAS_BOUNDARY=" + right.boundary + " RIGHT_BOUNDARY_ROWS=" + right.rows);
  log("RIGHT_HAS_CHANGELOG=" + right.changelog + " RIGHT_HAS_DOCS=" + right.docs);
  // N-2（2026-10-12 客户裁定）：角色卡已走 Markdown（标题成 <h1> 标签）；且无 <script> 注入口。
  log("RIGHT_CARD_MD_RENDERED=" + right.mdCard);
  log("RIGHT_CARD_MD_NO_SCRIPT=" + right.mdNoScript);
  // 再点同图标 = 收起；Esc 也能收起（开 → Esc → 收）。
  await wc().executeJavaScript("document.getElementById('tab-card').click()");
  await sleep(300);
  log("DRAWER_TOGGLES_CLOSED=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));
  await wc().executeJavaScript("document.getElementById('tab-todo').click()");
  await sleep(200);
  await wc().executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(200);
  log("DRAWER_ESC_CLOSES=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));
  // 角标继承（收起不丢信息）：注入该角色的真实快照（排队 2 条）→ 收起状态下待办/队列图标角标仍显示。
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面应用', busy: true, summaries: ['你：排队一', '你：排队二'], queue: [{kind:'message',sourceRoleId:'桌面应用',summary:'你：排队一',at:'2026-10-13T03:00:00.000Z'},{kind:'dispatch',sourceRoleId:'su',summary:'派发 · 来自 su：做X',at:'2026-10-13T03:01:00.000Z'}], running: null })");
  await sleep(200);
  log("BADGES_WHILE_COLLAPSED_TODO=" + (await wc().executeJavaScript("(() => { const b=document.querySelector('#tab-todo .tab-badge'); return !!b && !b.hidden && b.textContent === '2'; })()")));
  log("BADGES_WHILE_COLLAPSED_QUEUE=" + (await wc().executeJavaScript("(() => { const b=document.querySelector('#tab-queue .tab-badge'); return !!b && !b.hidden && b.textContent === '2'; })()")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面应用', busy: false, summaries: [], queue: [], running: null })");
  await sleep(150);
  log("BADGES_CLEAR_ON_EMPTY=" + (await wc().executeJavaScript("document.querySelector('#tab-todo .tab-badge').hidden && document.querySelector('#tab-queue .tab-badge').hidden")));
  log("SHOT_04_PROFILE=" + (await shot("04-profile.png")));

  // 7) 守卫（客户 2026-10-11 裁定：去掉运行时选择器、默认跑 pi）——断言**它不存在**。
  //    留守卫它就不会长回来。同时断言：提示与写入语义已上移横栏、底部只剩输入框 + 发送。
  const noSelector = await wc().executeJavaScript(
    "(() => ({ sel: !!document.getElementById('inp-runtime'), rtSel: !!document.querySelector('.rt-select'), selects: document.querySelectorAll('select').length }))()",
  );
  log("NO_RUNTIME_SELECTOR=" + (!noSelector.sel));
  log("NO_RT_SELECT_CLASS=" + (!noSelector.rtSel));
  log("NO_SELECT_ELEMENTS=" + (noSelector.selects === 0));
  log("RUNTIME_NOTE_IN_HEADER=" + (await wc().executeJavaScript("!!document.querySelector('.chat-head #runtime-note')")));
  log("NO_PI_BUTTON_IN_HEADER=" + (await wc().executeJavaScript("!document.querySelector('.chat-head #btn-pi-settings') && !document.querySelector('.chat-head #btn-stop') && !document.getElementById('session-state')"))); // 客户 2026-10-13：Pi 入口上移图标簇、结束会话/状态 pill 删除
  log("PI_ENTRY_IN_TABS=" + (await wc().executeJavaScript("!!document.querySelector('#right-tabs #tab-pi')")));
  log("RUNTIME_NOTE_SAYS_PI_WRITES=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('真正落到你导入的项目')")));
  log("RUNTIME_NOTE_ONE_LINE_GATED=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('越界写会在写之前被拒')")));
  // 底部输入区（K-1 起：附件行 + **胶囊输入框**〔内嵌发送箭头〕两行；无选择器、无提示行、无 Pi 面板、
  // 无 bootstrap 动作；状态位在 chat-head〔#session-state/#composer-hint〕）。
  const composer = await wc().executeJavaScript(
    "(() => { const c=document.querySelector('.composer'); return { rows: c.children.length, hasTextarea: !!c.querySelector('#inp-message'), hasSend: !!c.querySelector('#btn-send'), capsule: !!c.querySelector('#composer-capsule.capsule'), sendInCapsule: !!(c.querySelector('#composer-capsule #btn-send')), attachBtn: !!c.querySelector('#composer-capsule #btn-attach-image'), attachRow: !!c.querySelector('#attach-row'), clean: !c.querySelector('select') && !c.querySelector('#runtime-note') && !c.querySelector('#composer-hint') && !c.querySelector('#pi-panel') && !c.querySelector('#bootstrap-action') }; })()",
  );
  log("COMPOSER_CHILD_ROWS=" + composer.rows);
  log("COMPOSER_ROWS_ARE_ATTACH_AND_CAPSULE=" + (composer.rows === 2 && composer.attachRow && composer.capsule));
  log("COMPOSER_HAS_TEXTAREA_SEND=" + (composer.hasTextarea && composer.hasSend));
  log("COMPOSER_SEND_INSIDE_CAPSULE=" + composer.sendInCapsule);
  log("COMPOSER_ATTACH_BTN=" + composer.attachBtn);
  log("COMPOSER_CLEAN=" + composer.clean);
  log("SHOT_12_COMPOSER=" + (await shot("12-composer.png")));

  // 8) T17：未-bootstrap 一等状态 + 左树随 project:changed 刷新（用**临时空项目**，不写仓库）。
  const tmpProj = fs.mkdtempSync(path.join(OUTDIR, "proj-"));
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(tmpProj) + ")");
  await sleep(400);
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
  // 左栏那块独立提示**不存在**（断言「它不在」）——DOM 元素与样式钩子都应已清掉；留着守卫它就不会长回来。
  log("BOOTSTRAP_LEFT_NOTICE_ABSENT=" + (await wc().executeJavaScript("document.getElementById('bootstrap-notice') === null")));
  log("BOOTSTRAP_NO_LEFT_NOTICE_ELEMENT=" + (await wc().executeJavaScript("[...document.querySelectorAll('body *')].every(el=>!el.classList.contains('bootstrap-notice'))")));
  // 横栏第二行不再重复它：未 bootstrap 时状态提示留空；横栏只留写入语义（#runtime-note 仍在）。
  log("BOOTSTRAP_HINT_EMPTY=" + (await wc().executeJavaScript("document.getElementById('composer-hint').textContent.trim() === ''")));
  log("WRITE_NOTE_REMAINS_IN_HEADER=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('越界写会在写之前被拒')")));
  // 守卫：「只读」徽标已按客户裁定移除——**任何**项目状态（含创世态）下 su 都不该出现它。
  log("BOOTSTRAP_SU_NO_READONLY_BADGE=" + (await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); return !(it && it.querySelector('.ti-badge.readonly')); })()",
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
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.querySelector('.ti-name').textContent==='su'); return !(it && it.querySelector('.ti-badge.readonly')); })()",
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
  log("OPX_NOT_IN_VIEWED_PANE=" + (await wc().executeJavaScript("!document.querySelector('#chat .op-request')")));
  log("OPX_POINTER_IN_VIEWED_PANE=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.includes('【待确认】角色 示例角色')")));
  log("OPX_BADGE_LIT=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((e)=>e.querySelector('.ti-name').textContent==='示例角色'); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-confirm'); })()")));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('示例角色')");
  await sleep(600);
  log("OPX_CARD_ON_RETURN=" + (await wc().executeJavaScript("!!document.querySelector('#chat .op-request .op-submit')")));
  // 重复推送（同一 id 的原始推送 ×2）→ 幂等：恰一张卡。
  wc().send("session:operator-request", { id: "dup-1", roleId: "示例角色", request: { kind: "confirm", title: "重复？" } });
  wc().send("session:operator-request", { id: "dup-1", roleId: "示例角色", request: { kind: "confirm", title: "重复？" } });
  await sleep(250);
  log("OPX_DUP_SINGLE_CARD=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .op-request[data-request-id=dup-1]').length === 1")));
  // 对已失效请求（dup-1 未经真实通道；G-1：唯一真实失效＝应用重启/关闭）作答 → 通道 expired → 卡片定格
  // （按钮隐藏 + 「已失效（应用已重启/关闭）」说明），不再解冻。
  await wc().executeJavaScript("(() => { const c=document.querySelector('#chat .op-request[data-request-id=dup-1]'); c.querySelector('.op-confirm').click(); })()");
  await sleep(300);
  log("OPX_EXPIRED_FROZEN=" + (await wc().executeJavaScript("(() => { const c=document.querySelector('#chat .op-request[data-request-id=dup-1]'); const b=c.querySelector('.op-actions button'); return !!b && b.hidden === true && c.textContent.includes('已失效'); })()")));
  // 真请求作答照常（单选提交）。
  await wc().executeJavaScript("(() => { const c=[...document.querySelectorAll('#chat .op-request')].find((x)=>x.dataset.requestId!=='dup-1'); const r=c.querySelector('input'); r.checked=true; r.dispatchEvent(new Event('change')); c.querySelector('.op-submit').click(); })()");
  await sleep(300);
  const oX = await pX;
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
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(800);
  log("OP_NO_CARD_BEFORE_REQUEST=" + (await wc().executeJavaScript("!document.querySelector('#chat .op-request')")));

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
  log("OP_CARD_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .op-request.op-kind-preview')")));
  log("OP_CARD_TITLE_SHOWS=" + (await wc().executeJavaScript("(document.querySelector('#chat .op-request .op-title')||{textContent:''}).textContent.includes('示例角色')")));
  log("OP_PREVIEW_COLLAPSED=" + (await wc().executeJavaScript("(() => { const d=document.querySelector('#chat .op-request details.op-preview'); return !!d && d.open === false; })()")));
  log("OP_B3_AWAITING_CONFIRM=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('su')>=0); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-confirm'); })()")));
  log("SHOT_11_OPERATOR=" + (await shot("11-operator-card.png")));
  await wc().executeJavaScript("document.querySelector('#chat .op-request .op-confirm').click()");
  await sleep(300);
  const oOp1 = await pOp1;
  log("OP_CONFIRM_ANSWERED=" + (!!oOp1 && oOp1.outcome === "answered" && oOp1.value.confirmed === true));
  log("OP_CARD_FROZEN=" + (await wc().executeJavaScript("(document.querySelector('#chat .op-request .op-actions')||{textContent:''}).textContent.includes('已确认')")));
  log("OP_B3_AWAITING_CLEARED=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('su')>=0); const s=it && it.querySelector('.ti-status'); return !!s && !s.className.includes('st-confirm'); })()")));

  // ② 单选（radio）：未选时提交禁用 → 选一项 → 提交 → selected 回传。
  const pOp2 = customerChannel.customerInput(
    { kind: "choice", title: "选一个角色目录名", options: [{ id: "alpha", label: "alpha" }, { id: "beta", label: "beta" }] },
    { roleId: "su" },
  );
  await sleep(300);
  log("OP_SELECT_HAS_RADIO=" + (await wc().executeJavaScript("!!document.querySelector('#chat .op-request.op-kind-select input[type=radio]')")));
  log("OP_SUBMIT_DISABLED_INITIALLY=" + (await wc().executeJavaScript("(document.querySelector('#chat .op-request .op-submit')||{}).disabled === true")));
  await wc().executeJavaScript("(() => { const cards=[...document.querySelectorAll('#chat .op-request')]; const c=cards[cards.length-1]; const r=c.querySelectorAll('input[type=radio]')[1]; r.checked=true; r.dispatchEvent(new Event('change')); c.querySelector('.op-submit').click(); })()");
  await sleep(300);
  const oOp2 = await pOp2;
  log("OP_SELECT_ANSWERED=" + (!!oOp2 && oOp2.outcome === "answered" && JSON.stringify(oOp2.value.selected) === JSON.stringify(["beta"])));

  // ③ 多选（checkbox）：勾两项 → 提交 → selected 两值。
  const pOp3 = customerChannel.customerInput(
    { kind: "choice", title: "勾选要包含的文件", multiple: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }] },
    { roleId: "su" },
  );
  await sleep(300);
  log("OP_MULTI_HAS_CHECKBOX=" + (await wc().executeJavaScript("!!document.querySelector('#chat .op-request.op-kind-multi input[type=checkbox]')")));
  await wc().executeJavaScript("(() => { const cards=[...document.querySelectorAll('#chat .op-request')]; const c=cards[cards.length-1]; const i=c.querySelectorAll('input[type=checkbox]'); i[0].checked=true; i[0].dispatchEvent(new Event('change')); i[2].checked=true; i[2].dispatchEvent(new Event('change')); c.querySelector('.op-submit').click(); })()");
  await sleep(300);
  const oOp3 = await pOp3;
  log("OP_MULTI_ANSWERED=" + (!!oOp3 && oOp3.outcome === "answered" && JSON.stringify(oOp3.value.selected) === JSON.stringify(["a", "c"])));

  // ④ 快照校验负例：伪造 id / 不在请求中的选项 → 不受理（ok:false）；取消 → declined。
  const pOp4 = customerChannel.customerInput(
    { kind: "choice", title: "单选守卫", options: [{ id: "a", label: "A" }] },
    { roleId: "su" },
  );
  await sleep(200);
  const forgedId = customerChannel.respond({ id: "forged-id", decision: { kind: "choice", selected: ["a"] } });
  log("OP_FORGED_ID_REJECTED=" + (forgedId.ok === false));
  const realId = await wc().executeJavaScript("([...document.querySelectorAll('#chat .op-request')].pop()||{dataset:{}}).dataset.requestId");
  const outOfSet = customerChannel.respond({ id: realId, decision: { kind: "choice", selected: ["zzz"] } });
  log("OP_OUT_OF_SET_REJECTED=" + (outOfSet.ok === false));
  await wc().executeJavaScript("(() => { const cards=[...document.querySelectorAll('#chat .op-request')]; const c=cards[cards.length-1]; c.querySelector('.op-cancel').click(); })()");
  await sleep(300);
  const oOp4 = await pOp4;
  log("OP_CANCEL_DECLINED=" + (!!oOp4 && oOp4.outcome === "declined"));

  // 收口面已删守卫：入口容器/旧卡**不存在**（断言「它不在」，防回潮）。
  log("OP_OLD_ENTRY_REMOVED=" + (await wc().executeJavaScript("document.getElementById('bootstrap-action') === null")));
  log("OP_OLD_CARD_REMOVED=" + (await wc().executeJavaScript("!document.querySelector('#chat .msg-finalize-proposal') && !document.querySelector('#chat .sys-finalize')")));

  // 结束临时会话，避免影响后续步骤（步骤 9 会重载仓库根并点其它角色）。
  await wc().executeJavaScript("window.desktop.stopSession()");
  await sleep(300);

  // 9) 回交（§10.8）：角色会话结束 → 聊天里显示「回交 su」卡片；su 会话开着 → 镜像进 su 聊天流（「来自 <role> 的报告」）。
  //    直接把 handback 事件推给渲染侧（不经真实 pi 会话），专测渲染侧呈现与镜像（不真开 pi 会话）。
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")");
  await sleep(500);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面应用')");
  await sleep(1000);
  // B-2：事件外推带 `roleId` 信封（`{roleId, event}`）——直接推给渲染侧时同样要套信封。
  wc().send("session:event", {
    roleId: "桌面应用",
    event: {
      kind: "handback",
      summary: "回交 su：完成边界内改动",
      handback: {
        roleId: "桌面应用",
        taskId: "T20",
        status: "completed",
        summary: "完成边界内改动",
        evidence: ["角色卡/桌面应用/feature-map.md"],
        at: "2026-10-11T00:00:00.000Z",
      },
    },
  });
  await sleep(300);
  log("HANDBACK_CARD_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback')")));
  log("HANDBACK_TITLE=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-handback .hb-title')||{}).textContent||''")));
  log("HANDBACK_NOT_MIRROR=" + (await wc().executeJavaScript("!document.querySelector('#chat .msg-handback.is-mirror')")));
  log("HANDBACK_STATUS_OK=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback .hb-status.hb-ok')")));
  log("HANDBACK_EVIDENCE_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .msg-handback .hb-evidence .hb-ev').length")));
  log("SHOT_07_HANDBACK=" + (await shot("07-handback.png")));

  // 切到 su（主入口，primaryRoleId）→ 该回交应**镜像**进 su 的聊天流：标题「来自 桌面应用 的报告」、blocked 结论。
  await wc().executeJavaScript("window.__ansRenderer.selectRole(window.__ansRenderer.state.primaryRoleId)");
  await sleep(1000);
  wc().send("session:event", {
    roleId: "桌面应用",
    event: {
      kind: "handback",
      summary: "回交 su：被拦下",
      handback: { roleId: "桌面应用", status: "blocked", summary: "被拦下：无写入落地", evidence: [], at: "2026-10-11T00:00:00.000Z" },
    },
  });
  await sleep(300);
  log("MIRROR_CARD_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback.is-mirror')")));
  log("MIRROR_CARD_TITLE=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-handback.is-mirror .hb-title')||{}).textContent||''")));
  log("MIRROR_HAS_FROM=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-handback.is-mirror')||{textContent:''}).textContent.includes('来自 桌面应用 的报告')")));
  log("MIRROR_STATUS_BLOCKED=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback.is-mirror .hb-status.hb-blocked')")));
  log("MIRROR_EVIDENCE_EMPTY=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback.is-mirror .hb-ev-empty')")));
  // C-1（2026-10-12）：空证据占位文案 + blocked 的可见区分（左语义色竖条类）。
  log("MIRROR_EVIDENCE_PLACEHOLDER=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-handback.is-mirror .hb-ev-empty')||{textContent:''}).textContent.includes('（未提供证据）')")));
  log("MIRROR_CARD_IS_BLOCKED_VISUAL=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback.is-mirror.is-blocked')")));
  log("SHOT_08_MIRROR=" + (await shot("08-mirror.png")));

  // 9b) B-1/B-2/B-3（2026-10-12）：切换保留历史（锚点）→ Markdown 渲染+XSS 转义+链接外开（替身）→ 状态徽标。
  await wc().executeJavaScript("window.__ansRenderer.selectRole(window.__ansRenderer.state.primaryRoleId)");
  await sleep(800);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面应用')");
  await sleep(800);
  log("HISTORY_KEPT_ON_SWITCHBACK=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback')")));
  // B-1：注入含 Markdown 与「类标签文本」的助手消息——粗体应渲染、`<tag>` 应仍是转义文本。
  wc().send("session:event", { roleId: "桌面应用", event: { kind: "message", summary: "**粗体** 与 `<tag>` 文本" } });
  wc().send("session:event", { roleId: "桌面应用", event: { kind: "message", summary: "[示例站点](https://example.com/x)" } });
  await sleep(250);
  log("MD_STRONG_RENDERED=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-assistant strong')")));
    log("MD_TAG_TEXT_ESCAPED=" + (await wc().executeJavaScript("(() => { const any=[...document.querySelectorAll('#chat .msg-assistant')].some((m)=>m.textContent.includes('<tag>')); return any && !document.querySelector('#chat tag'); })()")));
  await wc().executeJavaScript("(document.querySelector('#chat a.md-link')||{click:function(){}}).click()");
  await sleep(150);
  log("LINK_OPEN_EXTERNAL_CALLED=" + openExternalCalls.some((u) => u === "https://example.com/x"));
  // 工具行瘦身（2026-10-12）：含长内容的工具事件渲染后**不含内容**、含目标路径。
  wc().send("session:event", { roleId: "桌面应用", event: { kind: "tool_call", summary: "read_file：read_file: docs/接口约定.md # 接口约定 · 正文预览【哨兵-勿显示】" } });
  await sleep(250);
  log("TOOLROW_NO_CONTENT=" + (await wc().executeJavaScript("!document.querySelector('#chat').textContent.includes('哨兵-勿显示')")));
  log("TOOLROW_HAS_PATH=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.includes('read_file：docs/接口约定.md')")));
  // H-1 附录：系统投递输入单独样式（不长得像客户发的消息）+ 手输防误伤。
  wc().send("session:event", { roleId: "桌面应用", event: { kind: "message", summary: "用户指令：[回交] 来自 规划者 的报告（任务 T1）\n结论：completed\n摘要：做完了" } });
  await sleep(250);
  log("INJECTED_STYLE_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-injected.is-handback')")));
  log("INJECTED_CHIP_LABEL=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-injected .mi-chip')||{textContent:''}).textContent")));
  log("INJECTED_NOT_USER_BUBBLE=" + (await wc().executeJavaScript("(() => { const el=document.querySelector('#chat .msg-injected'); return !!el && !el.classList.contains('msg-user'); })()")));
  // 手输防误伤：真发一条**以投递前缀开头**的文本，再推它的 `用户指令：` 回显 → 不得变成注入样式。
  await wc().executeJavaScript("(() => { document.getElementById('inp-message').value='[派发] 手输测试勿注入'; document.getElementById('btn-send').click(); })()");
  await sleep(400);
  wc().send("session:event", { roleId: "桌面应用", event: { kind: "message", summary: "用户指令：[派发] 手输测试勿注入" } });
  await sleep(250);
  log("MANUAL_PREFIX_BUBBLE=" + (await wc().executeJavaScript("[...document.querySelectorAll('#chat .msg-user')].some((e)=>e.textContent.includes('[派发] 手输测试勿注入'))")));
  log("MANUAL_NOT_INJECTED=" + (await wc().executeJavaScript("![...document.querySelectorAll('#chat .msg-injected')].some((e)=>e.textContent.includes('手输测试勿注入'))")));
  // B-3：保活会话 ⇒ 「空闲」徽标；悬停数据（最近事件+时间）已记录。
  log("STATUS_BADGE_TEXT=" + (await wc().executeJavaScript("(() => { const items=[...document.querySelectorAll('#role-tree .tree-item')]; const it=items.find((x)=>x.textContent.indexOf('桌面应用')>=0); const s=it && it.querySelector('.ti-status'); return s ? s.textContent : ''; })()")));
  log("STATUS_BADGE_IS_IDLE=" + (await wc().executeJavaScript("(() => { const items=[...document.querySelectorAll('#role-tree .tree-item')]; const it=items.find((x)=>x.textContent.indexOf('桌面应用')>=0); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-idle'); })()")));
  log("STATUS_LAST_EVENT_RECORDED=" + (await wc().executeJavaScript("(() => { const m=(window.__ansRenderer.state.roleMeta||{})['桌面应用']||{}; return !!(m.lastSummary && m.lastAt); })()")));
  // L-1 + 状态准确性（2026-10-12）：主进程**真实状态快照** → 徽标「◐ 工作中 · 2 待办」+ 该角色 pane 的
  // **队列行**；清空快照 → 徽标回「空闲」、队列行移除（界面只如实转述快照，不做界面侧推测）。
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面应用', busy: true, summaries: ['你：排队一', '你：排队二'] })");
  await sleep(150);
  log("ROLE_STATE_BADGE_WORKING_PENDING=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面应用')>=0); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-working') && s.textContent.includes('工作中 · 2 待办'); })()")));
  log("ROLE_STATE_BADGE_HAS_ICON=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面应用')>=0); const s=it && it.querySelector('.ti-status .ts-ico'); return !!s && s.textContent.length>=1; })()")));
  log("ROLE_STATE_BADGE_HOVER_FULL=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面应用')>=0); const s=it && it.querySelector('.ti-status'); return !!s && (s.getAttribute('title')||'').includes('2 项已入队'); })()")));
  log("ROLE_STATE_QUEUE_ROW=" + (await wc().executeJavaScript("(document.querySelector('#chat .queue-row .q-text')||{textContent:''}).textContent.includes('【队列】2 条待办：你：排队一')")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面应用', busy: false, summaries: [] })");
  await sleep(120);
  log("ROLE_STATE_CLEARED=" + (await wc().executeJavaScript("(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find((x)=>x.textContent.indexOf('桌面应用')>=0); const s=it && it.querySelector('.ti-status'); return !!s && s.className.includes('st-idle') && !document.querySelector('#chat .queue-row'); })()")));

  // M-1（2026-10-12 客户裁定「这个太丑了」）：shell 确认卡 = **应用内弹层**（不再用原生对话框）。
  // 结构/默认焦点/详情收起 + Esc = 不放行（真实 IPC：无挂起 ⇒ expired；卡片转「已失效」而非悄悄关闭）。
  await wc().executeJavaScript("window.__ansRenderer.onShellConfirm({ id: 'sc-probe-1', command: 'ls -la /tmp && echo hi', summary: '它会在项目里执行：ls', reasonPlain: '审核未能给出明确结论，按 fail-closed 交你确认。', reasonRaw: 'pm 拿不准，交操作者', argvLines: ['[0] \"ls\"', '[1] \"-la\"', '[2] \"/tmp\"'], cwd: '/proj' })");
  await sleep(200);
  log("SHELL_CONFIRM_VISIBLE=" + (await wc().executeJavaScript("!document.getElementById('shell-confirm').hidden")));
  log("SHELL_CONFIRM_COMMAND_VERBATIM=" + (await wc().executeJavaScript("document.getElementById('sc-command').textContent === 'ls -la /tmp && echo hi'")));
  log("SHELL_CONFIRM_SUMMARY_PLAIN=" + (await wc().executeJavaScript("document.getElementById('sc-summary').textContent.includes('它会在项目里执行')")));
  log("SHELL_CONFIRM_REASON_PLAIN=" + (await wc().executeJavaScript("document.getElementById('sc-reason').textContent.includes('fail-closed') && !document.getElementById('sc-reason').textContent.includes('pm 拿不准')")));
  log("SHELL_CONFIRM_DENY_DEFAULT_FOCUS=" + (await wc().executeJavaScript("document.activeElement === document.getElementById('sc-deny')")));
  log("SHELL_CONFIRM_DETAILS_COLLAPSED=" + (await wc().executeJavaScript("document.getElementById('sc-details').open === false")));
  await wc().executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  await sleep(300);
  log("SHELL_CONFIRM_ESC_NOT_ALLOWED=" + (await wc().executeJavaScript("(() => { const o=document.getElementById('shell-confirm'); return o.classList.contains('is-expired') && !o.hidden && document.getElementById('sc-hint').textContent.includes('未获放行'); })()")));
  // 探针清理：隐藏卡片（不影响后续步骤/截图）。
  await wc().executeJavaScript("(() => { const el=document.getElementById('shell-confirm'); el.hidden = true; el.classList.remove('is-expired'); window.__ansRenderer.state.shellConfirm = null; })()");

  // N-3（2026-10-12 追加；客户「代办也要在右边显示」）：右栏「待办 / 队列」——夹具注入 → 逐条渲染 +
  // 「进行中」在最前 + 空占位（数据经 role-state 真实快照通道；此处直接注入该通道的载荷）。
  await wc().executeJavaScript("document.getElementById('tab-todo').click()");
  await sleep(300);
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面应用', busy: true, summaries: ['你：排队一'], queue: [{kind:'message', sourceRoleId:'桌面应用', summary:'你：排队一', at:'2026-10-12T03:00:00.000Z'},{kind:'dispatch', sourceRoleId:'su', summary:'派发 · 来自 su：做X', at:'2026-10-12T03:01:00.000Z'}], running: {kind:'handback', sourceRoleId:'A', summary:'回交投递 · 来自 A', at:'2026-10-12T02:59:00.000Z'} })");
  await sleep(200);
  log("RIGHT_QUEUE_SECTION=" + (await wc().executeJavaScript("!!document.querySelector('#right-body #right-queue-body')")));
  log("RIGHT_QUEUE_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#right-queue-body .q-item').length")));
  log("RIGHT_QUEUE_RUNNING_FIRST=" + (await wc().executeJavaScript("(() => { const first=document.querySelector('#right-queue-body .q-item'); return !!first && first.classList.contains('is-running') && first.textContent.includes('进行中'); })()")));
  log("RIGHT_QUEUE_SOURCES=" + (await wc().executeJavaScript("(() => { const t=document.querySelector('#right-queue-body').textContent; return t.includes('回交投递') && t.includes('客户消息') && t.includes('su 派发') && t.includes('你：排队一'); })()")));
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面应用', busy: false, summaries: [], queue: [], running: null })");
  await sleep(150);
  log("RIGHT_QUEUE_EMPTY_PLACEHOLDER=" + (await wc().executeJavaScript("document.querySelector('#right-queue-body').textContent.includes('（无待办）')")));
  // 队列概览 tab：排队条目位次视图（内容与待办同快照、视图不同）；随后收起抽屉，不影响后续聊天流断言。
  await wc().executeJavaScript("window.__ansRenderer.onRoleState({ roleId: '桌面应用', busy: false, summaries: ['你：排队一','你：排队二'], queue: [{kind:'message', sourceRoleId:'桌面应用', summary:'你：排队一', at:'2026-10-12T03:00:00.000Z'},{kind:'dispatch', sourceRoleId:'su', summary:'派发 · 来自 su：做X', at:'2026-10-12T03:01:00.000Z'}], running: null })");
  await sleep(150);
  await wc().executeJavaScript("document.getElementById('tab-queue').click()");
  await sleep(300);
  log("QUEUE_TAB_OVERVIEW_ROWS=" + (await wc().executeJavaScript("document.querySelectorAll('#right-body .queue-list .q-item').length")));
  log("QUEUE_TAB_ACTIVE=" + (await wc().executeJavaScript("document.getElementById('tab-queue').classList.contains('active')")));
  await wc().executeJavaScript("document.getElementById('tab-queue').click()");
  await sleep(200);
  log("DRAWER_CLOSED_AFTER_N3=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));

  // P-1（2026-10-12 真机：su 的卡被 288 行活动淹掉、客户以为卡丢了）：到达即达 + 常驻 chip + 逐张定位 + 切回滚到卡。
  // 先造一屏高内容（40 行）并把视口拉到底，再注入待确认卡。
  for (let i = 0; i < 40; i += 1) {
    wc().send("session:event", { roleId: "桌面应用", event: { kind: "message", summary: "P-1 填充行 " + i } });
  }
  await sleep(400);
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = c.scrollHeight; })()");
  await sleep(100);
  await wc().executeJavaScript("window.__ansRenderer.appendOperatorRequest({ id: 'p1-card-1', roleId: '桌面应用', request: { kind: 'confirm', title: 'P-1 探针卡一', detail: '到达即达' } })");
  await sleep(250);
  log("P1_ARRIVAL_SCROLLED=" + (await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); const pane=[...document.querySelectorAll('#chat .chat-pane')][0]; const kids=pane?pane.children:[]; let card=null; for (const k of kids) { if (k.dataset && k.dataset.requestId==='p1-card-1') card=k; } if (!card) return false; const cr=card.getBoundingClientRect(); const cc=c.getBoundingClientRect(); return cr.top >= cc.top - 1 && cr.bottom <= cc.bottom + 1; })()")));
  log("P1_ARRIVAL_DEBUG=" + JSON.stringify(await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); const pane=[...document.querySelectorAll('#chat .chat-pane')][0]; const kids=pane?pane.children:[]; let card=null; for (const k of kids) { if (k.dataset && k.dataset.requestId==='p1-card-1') card=k; } const cr=card?card.getBoundingClientRect():null; const cc=c.getBoundingClientRect(); return { hasCard:!!card, dist: Math.round(c.scrollHeight-c.scrollTop-c.clientHeight), st:Math.round(c.scrollTop), sh:Math.round(c.scrollHeight), ch:Math.round(c.clientHeight), crTop: cr?Math.round(cr.top):null, crBottom: cr?Math.round(cr.bottom):null, ccTop:Math.round(cc.top), ccBottom:Math.round(cc.bottom), chipHidden: document.getElementById('op-chip').hidden }; })()")));
  log("P1_CHIP_VISIBLE=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('op-chip'); return !!el && !el.hidden && el.textContent.includes('有 1 条待确认'); })()")));
  // 在往上翻（滚到顶）→ 第二张卡到达 ⇒ **不打断**（scrollTop 不变、卡不在视野）+ chip 计数=2。
  await wc().executeJavaScript("(() => { document.getElementById('chat').scrollTop = 0; })()");
  await sleep(100);
  const p1TopBefore = await wc().executeJavaScript("document.getElementById('chat').scrollTop");
  await wc().executeJavaScript("window.__ansRenderer.appendOperatorRequest({ id: 'p1-card-2', roleId: '桌面应用', request: { kind: 'confirm', title: 'P-1 探针卡二', detail: '不打断' } })");
  await sleep(250);
  log("P1_NO_INTERRUPT_TOP=" + ((await wc().executeJavaScript("document.getElementById('chat').scrollTop")) === p1TopBefore));
  log("P1_CHIP_COUNT2=" + (await wc().executeJavaScript("document.getElementById('op-chip').textContent.includes('有 2 条待确认')")));
  // 点 chip → 定位到一张并高亮（在视野内）；再点一次 → 轮到另一张（两张都留下 is-flash 痕）。
  await wc().executeJavaScript("document.getElementById('op-chip').click()");
  await sleep(200);
  log("P1_CHIP_CLICK_LOCATES=" + (await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); const flashed=document.querySelector('#chat .op-request.is-flash'); if (!flashed) return false; const cr=flashed.getBoundingClientRect(); const cc=c.getBoundingClientRect(); return cr.top >= cc.top - 1 && cr.bottom <= cc.bottom + 1; })()")));
  await wc().executeJavaScript("document.getElementById('op-chip').click()");
  await sleep(200);
  log("P1_CHIP_SECOND_CARD=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .op-request.is-flash').length === 2")));
  // 作答（真实 IPC：探针卡无主进程挂起 ⇒ expired 终态）⇒ chip 计数减一，全部终态后隐藏。
  await wc().executeJavaScript("(() => { const pane=[...document.querySelectorAll('#chat .chat-pane')][0]; const kids=pane?pane.children:[]; for (const k of kids) { if (k.dataset && k.dataset.requestId==='p1-card-1') { const b=k.querySelector('.op-deny'); if (b) b.click(); } } })()");
  await sleep(300);
  log("P1_CHIP_COUNT1_AFTER_TERMINAL=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('op-chip'); return !!el && !el.hidden && el.textContent.includes('有 1 条待确认'); })()")));
  await wc().executeJavaScript("(() => { const pane=[...document.querySelectorAll('#chat .chat-pane')][0]; const kids=pane?pane.children:[]; for (const k of kids) { if (k.dataset && k.dataset.requestId==='p1-card-2') { const b=k.querySelector('.op-deny'); if (b) b.click(); } } })()");
  await sleep(300);
  log("P1_CHIP_HIDDEN_AFTER_ALL_TERMINAL=" + (await wc().executeJavaScript("document.getElementById('op-chip').hidden")));
  // 切回：再注入一张卡 → 切走（su）→ 切回 ⇒ 应**滚动到卡**（而不是停在底部）。
  await wc().executeJavaScript("window.__ansRenderer.appendOperatorRequest({ id: 'p1-card-3', roleId: '桌面应用', request: { kind: 'confirm', title: 'P-1 探针卡三', detail: '切回滚到卡' } })");
  await sleep(200);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(900);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面应用')");
  await sleep(900);
  log("P1_SWITCHBACK_SCROLLS_TO_CARD=" + (await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); const pane=[...document.querySelectorAll('#chat .chat-pane')][0]; const kids=pane?pane.children:[]; let card=null; for (const k of kids) { if (k.dataset && k.dataset.requestId==='p1-card-3') card=k; } if (!card) return false; const cr=card.getBoundingClientRect(); const cc=c.getBoundingClientRect(); return cr.top >= cc.top - 1 && cr.bottom <= cc.bottom + 1; })()")));
  // 探针清理：把 p1-card-3 作答掉（expired 终态），chip 应灭（不影响后续步骤）。
  await wc().executeJavaScript("(() => { const pane=[...document.querySelectorAll('#chat .chat-pane')][0]; const kids=pane?pane.children:[]; for (const k of kids) { if (k.dataset && k.dataset.requestId==='p1-card-3') { const b=k.querySelector('.op-deny'); if (b) b.click(); } } })()");
  await sleep(300);
  log("P1_CLEANUP_CHIP_HIDDEN=" + (await wc().executeJavaScript("document.getElementById('op-chip').hidden")));

  // 真机缺陷修复（2026-10-12「已确认的卡切走再切回变成最下面」）：交互卡**锚点物化**——「回放重建 + 已决卡」
  // 时序断言（上次暴露时序类 bug 的正是本 harness，故钉在这里）。夹具：临时项目 + su 会话 JSONL（含
  // request_confirmation 调用行+结论行）→ 回放重建 pane → 真通道发**同题**请求（卡，首物化=当时行表尾=
  // 它发生的位置）→ 作答（decided）→ 灌 200 行触发**窗口化**（卡行离屏脱挂）→ 切走/切回 ×2（客户动作）
  // → 断言行模型：恰**一条**卡行（不重建重复行）、行序索引**恒定在锚点**、绝不落到行表尾；未决卡同法回归。
  const anchorProj = fs.mkdtempSync(path.join(OUTDIR, "anchor-"));
  const rdirAnchor = path.join(anchorProj, "角色卡", "示例角色");
  fs.mkdirSync(rdirAnchor, { recursive: true });
  fs.writeFileSync(path.join(rdirAnchor, "role-card.md"), "# 示例角色\n");
  fs.writeFileSync(path.join(rdirAnchor, "boundary.yaml"), "entries:\n  - kind: file\n    path: src/x.ts\n    purpose: t\n");
  const sessAnchor = path.join(anchorProj, ".ans", "sessions", "su");
  fs.mkdirSync(sessAnchor, { recursive: true });
  const ANCHOR_TITLE = "写入 3 个文件：docs/design/…";
  const mkAnchorHeader = (id) => JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-12T01:00:00.000Z", cwd: anchorProj });
  const mkAnchorMsg = (id, message) => JSON.stringify({ type: "message", id, parentId: null, timestamp: "2026-10-12T01:00:01.000Z", message });
  fs.writeFileSync(
    path.join(sessAnchor, "s.jsonl"),
    [
      mkAnchorHeader("anchor1"),
      mkAnchorMsg("h1", { role: "user", content: "请创建文档骨架" }),
      mkAnchorMsg("h2", { role: "assistant", content: [{ type: "text", text: "好的，先请你确认。" }] }),
      mkAnchorMsg("h3", { role: "assistant", content: [{ type: "toolCall", id: "call_anchor_1", name: "request_confirmation", arguments: { title: ANCHOR_TITLE } }] }),
      mkAnchorMsg("h4", { role: "toolResult", toolCallId: "call_anchor_1", toolName: "request_confirmation", content: [{ type: "text", text: "request_confirmation：客户已确认「" + ANCHOR_TITLE + "」（confirmed:true；操作者：e2e）" }] }),
      mkAnchorMsg("h5", { role: "assistant", content: "已完成落盘并读回。" }),
    ].join("\n"),
  );
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(anchorProj) + ")");
  await sleep(700);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(1000);
  // 回放锚点表：调用行/结论行被登记且相邻（conclusion = request + 1）。
  log("ANCHOR_TABLE_REGISTERED=" + (await wc().executeJavaScript(
    "(() => { const a=window.__ansRenderer.replayAnchorDebug('su'); return a.length===1 && a[0].requestIndex!==null && a[0].conclusionIndex!==null && a[0].conclusionIndex===a[0].requestIndex+1; })()",
  )));
  // 同题请求（真通道）：卡首物化=当时行表尾（首次到达不加锚——它就是当下最新事件）。
  const pAnchor = customerChannel.customerInput({ kind: "confirm", title: ANCHOR_TITLE, detail: "回放后的重新确认" }, { roleId: "su" });
  await sleep(400);
  const anchorAtArrival = await wc().executeJavaScript("(() => { const m=window.__ansRenderer.rowModelDebug('su'); return m && m.operators.length===1 ? m.operators[0].index : -1; })()");
  log("ANCHOR_CARD_AT_ARRIVAL=" + anchorAtArrival);
  await wc().executeJavaScript("(() => { const c=document.querySelector('#chat .op-request'); if (c) c.querySelector('.op-confirm').click(); })()");
  await sleep(300);
  const oAnchor = await pAnchor;
  log("ANCHOR_CARD_ANSWERED=" + (!!oAnchor && oAnchor.outcome === "answered"));
  // 灌 200 行 → 窗口化（卡行离屏脱挂——旧缺陷据此在切回时重建落尾）。
  const anchorFill = [];
  for (let i = 0; i < 200; i += 1) anchorFill.push({ roleId: "su", event: { kind: "tool_call", summary: "锚点填充行 read_file：docs/a-" + i + ".md" } });
  wc().send("session:events", anchorFill);
  await sleep(700);
  const anchorCheck = "(() => { const m=window.__ansRenderer.rowModelDebug('su'); return JSON.stringify({ count:m.count, last:m.lastIndex, ops:m.operators }); })()";
  await wc().executeJavaScript("window.__ansRenderer.selectRole('示例角色')");
  await sleep(800);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(900);
  const anchorAfter1 = JSON.parse(await wc().executeJavaScript(anchorCheck));
  log("ANCHOR_ROW_AFTER_SWITCHBACK=" + JSON.stringify(anchorAfter1));
  log("ANCHOR_STABLE_NOT_TAIL_ONCE=" + (anchorAfter1.ops.length === 1 && anchorAfter1.ops[0].index === anchorAtArrival && anchorAfter1.ops[0].index < anchorAfter1.last));
  await wc().executeJavaScript("window.__ansRenderer.selectRole('示例角色')");
  await sleep(600);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(800);
  const anchorAfter2 = JSON.parse(await wc().executeJavaScript(anchorCheck));
  log("ANCHOR_STABLE_NOT_TAIL_TWICE=" + (anchorAfter2.ops.length === 1 && anchorAfter2.ops[0].index === anchorAtArrival && anchorAfter2.ops[0].index < anchorAfter2.last));
  log("ANCHOR_NO_DUPLICATE_ROW=" + (anchorAfter2.ops.length === 1));
  // 开卡回归（未决卡行为不变）：再发一张**未答**的卡 → 切走/切回 → 行序索引同样恒定；P-1 chip 照常亮。
  const pOpenAnchor = customerChannel.customerInput({ kind: "confirm", title: "未决回归卡", detail: "open 卡落位回归" }, { roleId: "su" });
  await sleep(400);
  const openAtArrival = await wc().executeJavaScript("(() => { const m=window.__ansRenderer.rowModelDebug('su'); return m && m.operators.length===2 ? m.operators[1].index : -1; })()");
  log("OPEN_CARD_AT_ARRIVAL=" + openAtArrival);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('示例角色')");
  await sleep(700);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(900);
  const openAfter = JSON.parse(await wc().executeJavaScript(anchorCheck));
  // 未决卡回归口径：**索引恒定**（=到达时的锚点）且不重复建行。它到达后没有后续行 ⇒ 其锚点恰为当时行表尾
  // （「≠行表尾」的时序断言由上面的已决卡承担——它后面还有 200 行填充）。
  log("OPEN_CARD_ROWS_AFTER_SWITCHBACK=" + JSON.stringify(openAfter));
  log("OPEN_CARD_STABLE_AT_ANCHOR=" + (openAfter.ops.length === 2 && openAfter.ops[1].index === openAtArrival));
  log("OPEN_CARD_CHIP_VISIBLE=" + (await wc().executeJavaScript("(() => { const el=document.getElementById('op-chip'); return !!el && !el.hidden && el.textContent.includes('有 1 条待确认'); })()")));
  // 清理：把未决卡作答掉（探针卡无主进程挂起 ⇒ expired 终态；chip 灭，不影响后续步骤），回到仓库根项目。
  await wc().executeJavaScript("(() => { const cs=document.querySelectorAll('#chat .op-request'); const c=cs[cs.length-1]; const b=c && c.querySelector('.op-deny'); if(b) b.click(); })()");
  await sleep(300);
  log("OPEN_CARD_CLEANED_CHIP_HIDDEN=" + (await wc().executeJavaScript("document.getElementById('op-chip').hidden")));
  log("SHOT_15_ANCHOR=" + (await shot("15-anchor-reanchor.png")));
  // 回到仓库根项目并恢复 S-1 段的前置（挂载的 pane = 桌面应用——loadProject 会重置选中为主入口）。
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")");
  await sleep(500);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面应用')");
  await sleep(1000);

  // S-1（2026-10-12 客户「现在输出不会让滚动条滚动到最底下了」）：**长会话贴底回归**。
  // 触发窗口化（>150 行）后持续追加输出：① 在底部 ⇒ 必须**保持贴底**；② 上翻 ⇒ 新输出**不得拽回**。
  const s1dist = "(function(){ const c=document.getElementById('chat'); return Math.round(c.scrollHeight-c.scrollTop-c.clientHeight); })()";
  for (let i = 0; i < 200; i += 1) {
    wc().send("session:event", { roleId: "桌面应用", event: { kind: "tool_call", summary: "S-1 填充行 read_file：docs/s1-" + i + ".md" } });
  }
  await sleep(800);
  log("S1_WINDOWED_ACTIVE=" + (await wc().executeJavaScript("document.querySelectorAll('#chat .chat-pane > .virt-spacer').length === 2")));
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = c.scrollHeight; })()");
  await sleep(200);
  // ① 贴底场景：分 3 批追加 30 行（模拟合帧流式输出），每批后测距底像素。
  for (let b = 0; b < 3; b += 1) {
    const arr = [];
    for (let i = 0; i < 10; i += 1) arr.push({ roleId: "桌面应用", event: { kind: "tool_call", summary: "S-1 流式追加 b" + b + "-" + i } });
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
  for (let i = 0; i < 20; i += 1) upBatch.push({ roleId: "桌面应用", event: { kind: "tool_call", summary: "S-1 上翻期追加 " + i } });
  wc().send("session:events", upBatch); // 合帧形态：上翻期的新输出不得拽回
  await sleep(500);
  const s1TopAfter = await wc().executeJavaScript("Math.round(document.getElementById('chat').scrollTop)");
  log("S1_NOT_YANKED=" + (s1TopAfter === s1TopBefore || Math.abs(s1TopAfter - s1TopBefore) <= 2));
  log("S1_STAYED_AWAY_FROM_BOTTOM=" + ((await wc().executeJavaScript(s1dist)) > 900));
  // ③ 回底后再输出 ⇒ 恢复贴底（双向语义的第三点）。
  await wc().executeJavaScript("(() => { const c=document.getElementById('chat'); c.scrollTop = c.scrollHeight; })()");
  await sleep(200);
  for (let i = 0; i < 10; i += 1) {
    wc().send("session:event", { roleId: "桌面应用", event: { kind: "tool_call", summary: "S-1 回底再输出 " + i } });
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
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面应用')");
  await sleep(900);
  const u1WindowedDist = await wc().executeJavaScript(s1dist);
  log("U1_WINDOWED_TO_BOTTOM_DIST=" + u1WindowedDist);
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
    "(() => { const p=document.getElementById('pi-panel'); const keys=window.__ansRenderer.piKeys; const adv=document.querySelector('#pi-panel .pi-advanced'); const cw=document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW'); return { open: !!(p && !p.hidden), fieldCount: keys.filter(k=>!!document.getElementById('pi-inp-'+k)).length, keyCount: keys.length, hasProvider: !!document.getElementById('pi-inp-ANS_PI_PROVIDER'), tokenType: (document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN')||{}).type, hasSaveBtn: !!document.getElementById('pi-save'), adv: !!adv, advOpen: !!(adv && adv.open), cwInAdv: !!(adv && cw && adv.contains(cw)), hint: (document.querySelector('#pi-panel .pi-advanced-hint')||{}).textContent||'' }; })()",
  );
  log("PI_PANEL_OPEN=" + panel.open);
  log("PI_PANEL_IN_DRAWER=" + (await wc().executeJavaScript("(() => { const p=document.getElementById('pi-panel'), d=document.getElementById('right-drawer'); return !!p && !!d && d.contains(p) && d.classList.contains('open'); })()")));
  log("PI_FIELD_COUNT=" + panel.fieldCount);
  // 客户 2026-10-11：面板 3 项必填 + 1 项可选（共 4 键），provider 不再占输入框。
  log("PI_KEYS_ARE_FOUR=" + (panel.keyCount === 4));
  log("PI_NO_PROVIDER_FIELD=" + (!panel.hasProvider));
  log("PI_ADVANCED_PRESENT=" + panel.adv);
  log("PI_ADVANCED_COLLAPSED_BY_DEFAULT=" + (panel.adv === true && panel.advOpen === false));
  log("PI_CONTEXT_WINDOW_IN_ADVANCED=" + panel.cwInAdv);
  log("PI_ADVANCED_HINT_LEAVE_BLANK=" + panel.hint.includes("留空 = 用默认值"));
  log("PI_TOKEN_MASKED=" + (panel.tokenType === "password"));
  log("PI_HAS_SAVE_BTN=" + panel.hasSaveBtn);
  const piPathShown = await wc().executeJavaScript("document.getElementById('pi-panel-path').textContent");
  log("PI_PANEL_PATH_IS_TEMP=" + (path.resolve(piPathShown) === path.resolve(PI_ENV)));
  log("PI_ENV_NOT_REPO_ROOT=" + (path.resolve(PI_ENV) !== path.resolve(REPO_ROOT, ".env")));
  log("PI_NO_MODAL=" + !(await modalExists()));
  log("SHOT_09_PI_PANEL=" + (await shot("09-pi-panel.png")));

  // 填字段 → 保存（经临时 .env）→ 断言写入临时文件、且 token 不回显（保存后回到掩码、值清空）。
  await wc().executeJavaScript(
    "(() => { document.getElementById('pi-inp-ANS_PI_MODEL').value='e2e-model'; document.getElementById('pi-inp-ANS_PI_BASE_URL').value='https://e2e.test/v1'; document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN').value='E2E-TOKEN-SENTINEL'; window.__ansRenderer.savePiConfigFromForm(); })()",
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
    "(() => { const t=document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN'); return { type: t.type, value: t.value, placeholder: t.placeholder }; })()",
  );
  log("PI_TOKEN_STILL_MASKED=" + (afterSave.type === "password"));
  log("PI_TOKEN_VALUE_CLEARED=" + (afterSave.value === ""));
  log("PI_TOKEN_PLACEHOLDER_SET=" + afterSave.placeholder.includes("已设置"));
  log("SHOT_10_PI_SAVED=" + (await shot("10-pi-saved.png")));
  // 收起抽屉（再点 tab-pi），不影响后续步骤。
  await wc().executeJavaScript("document.getElementById('tab-pi').click()");
  await sleep(200);
  log("DRAWER_CLOSED_AFTER_PI=" + (await wc().executeJavaScript("!document.getElementById('right-drawer').classList.contains('open')")));

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
    // A-5：客户交互通道（真实现场；presenter 推渲染侧、respond 校验回包）。
    const ciMod = await import(pathToFileURL(path.join(APP_DIR, "desktop", "customer-input.ts")).href);
    createCustomerInputChannel = ciMod.createCustomerInputChannel;
    // D-1：会话记录恢复（真实现场；只读解析）。
    const shMod = await import(pathToFileURL(path.join(APP_DIR, "desktop", "session-history.ts")).href);
    readRoleSessionHistory = shMod.readRoleSessionHistory;
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
  win.loadFile(path.join(APP_DIR, "renderer", "index.html"));

  const watchdog = setTimeout(() => {
    try { fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n") + "\nWATCHDOG_TIMEOUT=1\n"); } catch {}
    app.exit(0);
  }, 90000);

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

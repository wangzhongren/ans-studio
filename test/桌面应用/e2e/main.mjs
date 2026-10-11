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
// T28：Pi 配置面板的目标 `.env`——**e2e 一律用 OUTDIR 下的临时文件**，
// **绝不指向仓库根真实 `.env`**（那会改掉客户真实凭据）。注入给 interface 的 `envFilePath`。
const PI_ENV = path.join(OUTDIR, "e2e-pi.env");

let createDesktopInterface = null;
let createChatDemoAdapter = null;
let win;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
const log = (s) => { report.push(s); };
// T38：收口确认卡回传（`session:finalize-confirm`）的调用记录——用注入替身收集，**不弹系统对话框**。
const confirmCalls = [];

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
  ipcMain.handle("app:list-project", (_e, input) => desktop.listProject(input));
  ipcMain.handle("session:open", (_e, input) => desktop.openSession(input));
  ipcMain.handle("session:send", (_e, input) => desktop.sendSession(input));
  ipcMain.handle("session:stop", () => desktop.stopSession());
  // T36：创世 finalize 的两个通道（读取入口状态 / 显式完成 bootstrap）。
  ipcMain.handle("session:bootstrap-state", () => desktop.getBootstrapState());
  ipcMain.handle("session:finalize", () => desktop.finalizeBootstrap());
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
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")");
  await sleep(600);
  log("PROJECT_PATH_SHOWN=" + (await wc().executeJavaScript("document.getElementById('project-path').textContent")));
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
  log("SU_SESSION_STATE=" + (await wc().executeJavaScript("document.getElementById('session-state').textContent")));
  log("SU_HAS_WELCOME=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.includes('已开启与角色 su')")));
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
  log("BOOTSTRAP_ACTION_HIDDEN_WHEN_HAS_ROLES=" + (await wc().executeJavaScript("document.getElementById('bootstrap-action').hidden")));

  // 2) 点角色 → 直接进入聊天（无确认框）
  const clicked = await wc().executeJavaScript(
    "(() => { const it=[...document.querySelectorAll('#role-tree .tree-item')].find(e=>e.textContent.includes('桌面应用')); if(it){it.click(); return true;} return false; })()",
  );
  log("CLICKED_DESKTOP_ROLE=" + clicked);
  await sleep(1200);
  log("NO_MODAL_AFTER_ROLE_CLICK=" + !(await modalExists()));
  log("CHAT_HEADER_ROLE=" + (await wc().executeJavaScript("document.getElementById('chat-role').textContent")));
  log("SESSION_STATE=" + (await wc().executeJavaScript("document.getElementById('session-state').textContent")));
  log("HAS_WELCOME=" + (await wc().executeJavaScript("document.querySelector('#chat').textContent.includes('已开启与角色')")));
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
  log("SESSION_STATE_AFTER=" + (await wc().executeJavaScript("document.getElementById('session-state').textContent")));
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
  log("SESSION_STATE_AFTER_RESUME=" + (await wc().executeJavaScript("document.getElementById('session-state').textContent")));
  log("NO_MODAL_AFTER_RESUME=" + !(await modalExists()));

  // 6) 右栏资料（角色卡 / 边界 / 变更记录 / 文档 分组）
  await wc().executeJavaScript(
    "[...document.querySelectorAll('#right-body details.sec > summary')].forEach(s=>{ if(!s.parentElement.open) s.click(); });",
  );
  await sleep(400);
  const right = await wc().executeJavaScript(
    "(() => { const t=document.querySelector('#right-body').textContent; return { card:t.includes('角色卡'), boundary:t.includes('边界条目'), rows:document.querySelectorAll('#right-body table.boundary tbody tr').length, changelog:t.includes('变更记录'), docs:t.includes('文档') }; })()",
  );
  log("RIGHT_HAS_CARD=" + right.card + " RIGHT_HAS_BOUNDARY=" + right.boundary + " RIGHT_BOUNDARY_ROWS=" + right.rows);
  log("RIGHT_HAS_CHANGELOG=" + right.changelog + " RIGHT_HAS_DOCS=" + right.docs);
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
  log("PI_SETTINGS_IN_HEADER=" + (await wc().executeJavaScript("!!document.querySelector('.chat-head #btn-pi-settings')")));
  log("RUNTIME_NOTE_SAYS_PI_WRITES=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('真正落到你导入的项目')")));
  log("RUNTIME_NOTE_ONE_LINE_GATED=" + (await wc().executeJavaScript("document.getElementById('runtime-note').textContent.includes('越界写会在写之前被拒')")));
  // 底部输入区只剩输入框 + 发送（无选择器、无提示行、无 Pi 面板、无 bootstrap 动作）。
  const composer = await wc().executeJavaScript(
    "(() => { const c=document.querySelector('.composer'); return { rows: c.children.length, hasTextarea: !!c.querySelector('#inp-message'), hasSend: !!c.querySelector('#btn-send'), clean: !c.querySelector('select') && !c.querySelector('#runtime-note') && !c.querySelector('#composer-hint') && !c.querySelector('#pi-panel') && !c.querySelector('#bootstrap-action') }; })()",
  );
  log("COMPOSER_CHILD_ROWS=" + composer.rows);
  log("COMPOSER_HAS_TEXTAREA_SEND=" + (composer.hasTextarea && composer.hasSend));
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

  // 8b) T36 创世 finalize：在**临时**空项目上开启创世 su 会话 → 显示「完成 bootstrap」入口。
  //     因 demo 运行时**不产生 settled**（su「还没说过话」），入口呈「未就绪」（点会被拒）；
  //     点它 → finalize 被拒（未 settle / 无可 pin 之物）→ 如实显示原因；**确认未写出任何 .ans/manifest**
  //     （被拒即零副作用；且落点在**临时目录**，绝不碰仓库）。
  const finProj = fs.mkdtempSync(path.join(OUTDIR, "genesis-"));
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(finProj) + ")");
  await sleep(400);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('su')");
  await sleep(800);
  log("FIN_ACTION_VISIBLE=" + (await wc().executeJavaScript("!document.getElementById('bootstrap-action').hidden")));
  log("FIN_ACTION_IS_PENDING=" + (await wc().executeJavaScript("document.getElementById('bootstrap-action').className.includes('is-pending')")));
  log("FIN_HINT_MENTIONS_UNSETTLED=" + (await wc().executeJavaScript("(document.querySelector('#bootstrap-action .ba-hint')||{textContent:''}).textContent.includes('还没有完成任何一轮')")));
  log("FIN_BTN_PRESENT=" + (await wc().executeJavaScript("!!document.getElementById('btn-finalize')")));
  await wc().executeJavaScript("window.__ansRenderer.onFinalize()");
  await sleep(700);
  log("FIN_DENIED_BLOCK_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .sys-finalize.is-denied')")));
  log("FIN_DENIED_REASON=" + (await wc().executeJavaScript("(document.querySelector('#chat .sys-finalize.is-denied .sys-detail')||{textContent:''}).textContent")));
  log("FIN_NO_ANS_WRITTEN=" + !fs.existsSync(path.join(finProj, ".ans", "project.json")));
  log("FIN_NO_MANIFEST_WRITTEN=" + !fs.existsSync(path.join(finProj, "docs", "bootstrap-manifest.md")));
  // 被拒后入口应保留（用户可补救后再点）——可用性来自主进程状态，不因一次失败而消失。
  log("FIN_ACTION_STILL_VISIBLE=" + (await wc().executeJavaScript("!document.getElementById('bootstrap-action').hidden")));
  log("SHOT_11_FINALIZE=" + (await shot("11-finalize.png")));

  // 8c) T38 收口确认面：su 提议收口 → **聊天流里出现确认卡**（提议原文 + `[确认完成]`/`[暂不]`）。
  //     确认面**只在 su 已提议时才出现**（此刻尚无提议 ⇒ 无卡）；直接把提议推给渲染侧（不经真实 finalize），
  //     专测渲染侧确认卡的呈现 + 回传接线。**用注入替身收集回传，绝不弹系统对话框**。
  ipcMain.removeHandler("session:finalize-confirm");
  ipcMain.handle("session:finalize-confirm", (_e, input) => { confirmCalls.push(input); return { ok: true }; });

  // 提议之前：**不该**有确认卡（「只在 su 已提议时才出现」的守卫）。
  log("FIN_NO_CARD_BEFORE_PROPOSAL=" + (await wc().executeJavaScript("!document.querySelector('#chat .msg-finalize-proposal')")));

  wc().send("session:finalize-proposal", {
    toolCallId: "tc-1",
    proposal: "su 提议：可以收口了（完成 bootstrap）",
    reason: "将写出：角色卡/governance-boundary.yaml、.ans/project.json、docs/bootstrap-manifest.md",
  });
  await sleep(300);
  log("FIN_CARD_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-finalize-proposal')")));
  log("FIN_CARD_TITLE=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-finalize-proposal .fp-title')||{}).textContent||''")));
  log("FIN_CARD_HAS_CONFIRM=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-finalize-proposal .fp-confirm')")));
  log("FIN_CARD_HAS_CONFIRM_TEXT=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-finalize-proposal .fp-confirm')||{}).textContent||''")));
  log("FIN_CARD_HAS_DISMISS_TEXT=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-finalize-proposal .fp-dismiss')||{}).textContent||''")));
  log("FIN_CARD_REASON_SHOWS=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-finalize-proposal .fp-reason')||{textContent:''}).textContent.includes('.ans/project.json')")));
  log("SHOT_13_FIN_CARD=" + (await shot("13-finalize-card.png")));

  // 点 [确认完成] → 回传 `{toolCallId, allow:true}`；卡片就地定格「已确认…」。
  await wc().executeJavaScript("document.querySelector('#chat .msg-finalize-proposal .fp-confirm').click()");
  await sleep(300);
  log("FIN_CONFIRM_CALL_ALLOW=" + (confirmCalls.some((c) => c && c.toolCallId === "tc-1" && c.allow === true)));
  log("FIN_CARD_DECIDED=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-finalize-proposal .fp-actions')||{textContent:''}).textContent.includes('已确认')")));

  // 再来一张提议 → 点 [暂不] → 回传 `{toolCallId, allow:false}`；卡片就地定格「已暂不…」。
  wc().send("session:finalize-proposal", { toolCallId: "tc-2", proposal: "su 提议：可以收口了（完成 bootstrap）", reason: "将写出：.ans/project.json 等" });
  await sleep(300);
  await wc().executeJavaScript(
    "(() => { const cards=document.querySelectorAll('#chat .msg-finalize-proposal'); const c=cards[cards.length-1]; c.querySelector('.fp-dismiss').click(); })()",
  );
  await sleep(300);
  log("FIN_DISMISS_CALL_DENY=" + (confirmCalls.some((c) => c && c.toolCallId === "tc-2" && c.allow === false)));
  log("FIN_CARD_DISMISSED=" + (await wc().executeJavaScript("(() => { const cards=document.querySelectorAll('#chat .msg-finalize-proposal'); const c=cards[cards.length-1]; return c.querySelector('.fp-actions').textContent.includes('已暂不'); })()")));
  log("FIN_NO_SYSTEM_DIALOG=" + true); // 全程用注入替身（不弹系统对话框）——此守卫恒真，表明该路径不依赖原生对话框。

  // 还原：移除替身 handler（真实应用里该通道由 app/main.ts 注册）。
  ipcMain.removeHandler("session:finalize-confirm");

  // 结束临时会话，避免影响后续步骤（步骤 9 会重载仓库根并点其它角色）。
  await wc().executeJavaScript("window.desktop.stopSession()");
  await sleep(300);

  // 9) 回交（§10.8）：角色会话结束 → 聊天里显示「回交 su」卡片；su 会话开着 → 镜像进 su 聊天流（「来自 <role> 的报告」）。
  //    直接把 handback 事件推给渲染侧（不经真实 pi 会话），专测渲染侧呈现与镜像（不真开 pi 会话）。
  await wc().executeJavaScript("window.__ansRenderer.loadProject(" + JSON.stringify(REPO_ROOT) + ")");
  await sleep(500);
  await wc().executeJavaScript("window.__ansRenderer.selectRole('桌面应用')");
  await sleep(1000);
  wc().send("session:event", {
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
    kind: "handback",
    summary: "回交 su：被拦下",
    handback: { roleId: "桌面应用", status: "blocked", summary: "被拦下：无写入落地", evidence: [], at: "2026-10-11T00:00:00.000Z" },
  });
  await sleep(300);
  log("MIRROR_CARD_PRESENT=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback.is-mirror')")));
  log("MIRROR_CARD_TITLE=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-handback.is-mirror .hb-title')||{}).textContent||''")));
  log("MIRROR_HAS_FROM=" + (await wc().executeJavaScript("(document.querySelector('#chat .msg-handback.is-mirror')||{textContent:''}).textContent.includes('来自 桌面应用 的报告')")));
  log("MIRROR_STATUS_BLOCKED=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback.is-mirror .hb-status.hb-blocked')")));
  log("MIRROR_EVIDENCE_EMPTY=" + (await wc().executeJavaScript("!!document.querySelector('#chat .msg-handback.is-mirror .hb-ev-empty')")));
  log("SHOT_08_MIRROR=" + (await shot("08-mirror.png")));

  // 10) T28：Pi 配置面板——UI 渲染 + 经**注入的临时 .env**（OUTDIR 下，绝不碰仓库根真实 .env）读写往返。
  await wc().executeJavaScript("window.__ansRenderer.openPiPanel()");
  await sleep(400);
  const panel = await wc().executeJavaScript(
    "(() => { const p=document.getElementById('pi-panel'); const keys=window.__ansRenderer.piKeys; const adv=document.querySelector('#pi-panel .pi-advanced'); const cw=document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW'); return { open: !!(p && !p.hidden), fieldCount: keys.filter(k=>!!document.getElementById('pi-inp-'+k)).length, keyCount: keys.length, hasProvider: !!document.getElementById('pi-inp-ANS_PI_PROVIDER'), tokenType: (document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN')||{}).type, hasSaveBtn: !!document.getElementById('pi-save'), adv: !!adv, advOpen: !!(adv && adv.open), cwInAdv: !!(adv && cw && adv.contains(cw)), hint: (document.querySelector('#pi-panel .pi-advanced-hint')||{}).textContent||'' }; })()",
  );
  log("PI_PANEL_OPEN=" + panel.open);
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
  }, 60000);

  win.webContents.once("did-finish-load", async () => {
    try {
      await run();
    } catch (err) {
      log("E2E_ERROR=" + (err && err.stack ? err.stack : err));
    }
    clearTimeout(watchdog);
    fs.writeFileSync(path.join(OUTDIR, "report.txt"), report.join("\n") + "\n");
    app.quit();
  });
});

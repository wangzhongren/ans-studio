// app/main.ts
// 桌面应用主进程入口（Electron）。
//
// 角色与分层（设计稿 §4）：
//  - 本文件是「根入口 + Interface 生命周期」：建窗、注册受限 IPC 通道、把能力委托给
//    Interface 层（app/desktop/interface.ts）；
//  - 主进程只持 Interface 句柄，不直接导入 Service/Provider 的 impl 内部；
//  - 渲染进程不接触 Node/文件系统——一切经 preload 白名单通道。
//
// 运行时：Electron 44 自带 Node 24.21，支持原生 TS 类型擦除，故可直接 import 仓库内的 .ts
// （无需构建步骤）。会话事件实时经 session:event 推给渲染进程。

import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";

import { createDesktopInterface, type DesktopInterface } from "./desktop/interface.ts";
// Pi 配置（设计 §11/T28）：启动把仓库根 `.env` 载入 `process.env`（= 补上 Electron 缺失的 `--env-file`）；
// 面板经 IPC 读写同一 `.env`。**`.env` 的读写全仓唯一**在共享模块 `src/common/shared/env-file.ts`
// （pm 属主）——此处**只读导入，不复制**；路径由 `./desktop/pi-config.ts` 解析（可注入，测试/e2e 用临时路径）。
import { loadEnvFileInto } from "../src/common/shared/env-file.ts";
import { resolveRepoEnvPath } from "./desktop/pi-config.ts";
// 会话事件外推的类型：编排把会话事件流放宽为 `OrchestrationEvent`（既有 `SessionEvent` + 编排在 `settled`
// 时追加的 `handback` 回交事件，设计 §10.8）。**从编排的模块只读导入、不复制形状**——IPC 外推原样透传。
import type { OrchestrationEvent } from "../src/common/编排/handback.ts";
import {
  createDesktopOperatorChannel,
  DESKTOP_SHELL_GATE_ARMED,
  type OperatorPresenter,
  type OperatorDecision,
} from "./desktop/operator-channel.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let iface: DesktopInterface | null = null;

/**
 * 启动时把**仓库根 `.env`**载入 `process.env`——**这正是补上 `package.json` 里缺失的 `--env-file`**
 * （设计 §11.3）。此后 `createPiRuntimeAdapter` 内的 `resolvePiProviderConfig(opts, process.env)`
 * **原样复用**（单一来源，无第二份读取逻辑）。**只回报键名、绝不打印任何值**。
 *
 * 失败处理：`.env` 不存在 → 无操作（`loadEnvFileInto` 的 ENOENT 分支）；其它读取失败**不阻断启动**
 * （界面面板仍可用于补救），且**不打印任何值**（如实留空）。
 */
async function loadDesktopEnv(): Promise<void> {
  try {
    await loadEnvFileInto(process.env, resolveRepoEnvPath());
  } catch {
    // 读取失败不阻断启动；不打印值（凭据纪律，设计 §11.4）。
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: "ANS 桌面应用（受治理会话）",
    backgroundColor: "#0f1115",
    // 客户要求（2026-10-11）：去掉原生标题栏与默认菜单栏，自绘一个。
    //  - `frame: false` = 无边框：去掉 OS 那条标题栏（图标 + 标题 + 三个系统按钮）。
    //  - **不动 `resizable`（默认 true）**：Windows 上无边框窗口默认仍带缩放边框
    //    （`thickFrame` 默认 true），故拖拽缩放**未弄丢**；同理最小化/最大化仍可用（由自绘按钮经 IPC 驱动）。
    //  - 拖动与「双击最大化」由渲染侧标题栏的 `-webkit-app-region: drag` 提供：
    //    该区域在 Windows 上按 HTCAPTION 处理，双击即按惯例最大化/还原（系统原生，见 renderer 注释）。
    frame: false,
    webPreferences: {
      preload: path.join(HERE, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(HERE, "renderer", "index.html"));
  return win;
}

// —————————————————————— 操作者确认通道 (a)：就绪，但 V1 桌面**不 arm** ——————————————————————
//
// 本处把操作者通道 (a) 的**表现层**接到 Electron：一条「看命令原文、点放行/拒绝」的确认对话框。
// 它**只**呈现原文与收选择，**不做任何命令判定**（危险与否由 (c) 判、语义由 (b) 判；第三闸就是「人」本身）。
// 通道的入参/出参形状以**编排**的 `OperatorChannelFn`（`OperatorPrompt`→`OperatorOutcome`）为准，见
// `app/desktop/operator-channel.ts`；本表现层只把 `display.text`（逐字原文 + 升级原因）摆给人看。
//
// **V1 桌面刻意不 arm shell 闸**（`DESKTOP_SHELL_GATE_ARMED === false`，理由见 operator-channel.ts 顶部）：
// 不注入 `ShellGate` ⇒ Pi 适配器**不注册 `run_shell`**（能力缺席 = 最强 fail-closed，§7.5.1）。
// 故以下只是**就绪**，**当前未被任何会话消费**——如实标注，不假装在用。
// arm 时（客户拍板后）：① 编排用本通道 + (c)/(b) 装配 `ShellGate`（编排 T8）；
// ② 经 `app/desktop/interface.ts` 的 `shellGate` 接缝注入会话构造路径。
function createElectronOperatorPresenter(win: BrowserWindow): OperatorPresenter {
  return {
    async present(_prompt, display): Promise<{ allow: boolean }> {
      // 逐字展示命令原文 + 规范化 argv + cwd（+ 升级原因若 (b) 提供）；display.text 由 operator-channel 如实构造。
      // 「拒绝」为默认高亮与取消项——关窗 = 不放行（fail-closed 的 UI 侧同向）。
      const result = await dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["放行执行", "拒绝"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        title: "shell 审核 · 操作者确认",
        message: "一条 shell 命令需要你确认后才执行（请逐字核对下方命令原文）",
        detail: display.text,
      });
      return { allow: result.response === 0 };
    },
  };
}

/** 就绪的桌面操作者通道 (a)（**V1 不 arm，未接入任何会话**——见上）。 */
function buildDesktopOperatorChannel(win: BrowserWindow) {
  let operatorId = "unknown";
  try {
    operatorId = os.userInfo().username || "unknown";
  } catch {
    operatorId = "unknown";
  }
  return createDesktopOperatorChannel({ presenter: createElectronOperatorPresenter(win), operatorId });
}

// —————————————————————— 客户确认通道 (a)：bootstrap 收口的确认面（T38） ——————————————————————
//
// 客户裁定（设计 §13/§13.4）：**完成 bootstrap = su 主动提议 → 界面把这件事摆给客户 → 客户确认 → 才落盘**。
// finalize 收口时经**同一个 (a) 通道**（`OperatorChannelFn`，**不造第二套**）把「su 提议收口」摆给客户——
// 本处把该提议渲染为**聊天流里的一张确认卡**（客户要求「提议在聊天流可见，不是只闪一个按钮」），
// 而非 shell 闸那种系统对话框：提议经 `session:finalize-proposal` 推给渲染侧；
// 客户点 `[确认完成]`/`[暂不]` 后经 `session:finalize-confirm` 回传，解挂下面的 Promise。
// **fail-closed**：窗口已关 / 超时（`createDesktopOperatorChannel` 的硬超时）/ 拒绝 → **非放行**（不完成）。
function createFinalizePresenter(
  win: BrowserWindow,
  pending: Map<string, (d: OperatorDecision) => void>,
): OperatorPresenter {
  return {
    present(prompt): Promise<OperatorDecision> {
      return new Promise<OperatorDecision>((resolve) => {
        if (win.isDestroyed()) {
          resolve({ allow: false, note: "窗口已关闭，无法确认收口（fail-closed）" });
          return;
        }
        pending.set(prompt.toolCallId, resolve);
        // 提议原文（`prompt.command`，如「su 提议：可以收口了（完成 bootstrap）」）+ 将写出什么（`prompt.reason`）。
        win.webContents.send("session:finalize-proposal", {
          toolCallId: prompt.toolCallId,
          proposal: typeof prompt.command === "string" ? prompt.command : "",
          reason: typeof prompt.reason === "string" ? prompt.reason : "",
        });
      });
    },
  };
}

function desktopOperatorId(): string {
  try {
    return os.userInfo().username || "unknown";
  } catch {
    return "unknown";
  }
}

/** 桌面 bootstrap 收口的**客户确认通道**（T38）——同一 (a) 通道工厂，presenter 渲染为**应用内确认卡**。 */
function buildDesktopFinalizeChannel(
  win: BrowserWindow,
  pending: Map<string, (d: OperatorDecision) => void>,
) {
  return createDesktopOperatorChannel({
    presenter: createFinalizePresenter(win, pending),
    operatorId: desktopOperatorId(),
  });
}

function registerIpc(win: BrowserWindow): void {
  // 事件外推：主进程 → 渲染进程（会话事件流）。入参为编排导出的 `OrchestrationEvent`
  // （含 `handback` 回交事件，§10.8）；原样透传，主进程不判定、不加工。
  const emitEvent = (ev: OrchestrationEvent): void => {
    if (win.isDestroyed()) return;
    win.webContents.send("session:event", ev);
  };

  // 客户确认通道 (a)（T38）：finalize 收口的确认面——提议经 `session:finalize-proposal` 推给渲染侧渲染成
  // 一张卡；渲染侧点 [确认完成]/[暂不] 后经 `session:finalize-confirm` 回传，解挂下面的确认 Promise
  // （→ 通道返回 allow/deny → finalize 落盘 / 不完成）。**挂在窗口作用域**（每个窗口一套）。
  const finalizePending = new Map<string, (d: OperatorDecision) => void>();
  const finalizeChannel = buildDesktopFinalizeChannel(win, finalizePending);

  const desktop = createDesktopInterface({
    pickDirectory: async () => {
      const result = await dialog.showOpenDialog(win, {
        title: "导入项目（选择项目根文件夹）",
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
    emitEvent,
    // 「项目内容可能已变」（su 一轮结束）→ 推 `project:changed` 给渲染侧，触发左树重取枚举（§10.3）。
    // 仅转达信号；是否真有角色被建出由渲染侧重取 `listProject` 后如实呈现（判定不在此）。
    emitProjectChanged: () => {
      if (win.isDestroyed()) return;
      win.webContents.send("project:changed");
    },
    // 客户确认通道（T38）：finalize 收口时经它把「su 提议收口」摆给客户确认（仅创世 finalize 会话消费）。
    operatorChannel: finalizeChannel,
  });
  iface = desktop;

  // 收口确认的回传（T38）：渲染侧点 [确认完成]/[暂不] → 解挂待确认 Promise（无待确认项时如实回 ok:false）。
  ipcMain.handle("session:finalize-confirm", (_e, input: { toolCallId?: string; allow?: boolean }) => {
    const toolCallId = input && typeof input.toolCallId === "string" ? input.toolCallId : "";
    const resolve = finalizePending.get(toolCallId);
    if (!resolve) return { ok: false, error: "没有待确认的收口提议" };
    finalizePending.delete(toolCallId);
    resolve({ allow: input?.allow === true });
    return { ok: true };
  });

  ipcMain.handle("app:pick-project", () => desktop.pickProject());
  ipcMain.handle("app:list-project", (_e, input: { projectRoot: string }) => desktop.listProject(input));
  // 点角色即开：一次调用直接建立会话（导入项目即授权，无确认框）。
  ipcMain.handle("session:open", (_e, input) => desktop.openSession(input));
  ipcMain.handle("session:send", (_e, input: { text: string }) => desktop.sendSession(input));
  ipcMain.handle("session:stop", () => desktop.stopSession());
  // 创世 finalize（T36）：由渲染侧「完成 bootstrap」动作**显式触发**。读取状态无副作用；finalize 写入
  // 经门禁 `resolveWrite`（与 su 同一授权），被拒即零副作用、结果如实回给渲染侧（含 reason）。
  ipcMain.handle("session:bootstrap-state", () => desktop.getBootstrapState());
  ipcMain.handle("session:finalize", () => desktop.finalizeBootstrap());

  // —— Pi 配置面板（设计 §11/T28）：读取/保存仓库根 `.env` ——
  // 逻辑全在 Interface 层（`getPiConfig`/`savePiConfig` → `pi-config.ts` → 共享 `env-file`）；
  // 主进程只透传。**机密键值绝不外发**（`getPiConfig` 对其恒返回空串）；保存回报只含键名。
  ipcMain.handle("pi-config:get", () => desktop.getPiConfig());
  ipcMain.handle("pi-config:save", (_e, input: { updates: Record<string, string> }) => desktop.savePiConfig(input));

  // —— 自绘标题栏的窗口控制（客户要求：去掉原生标题栏，自绘一条）——
  // 渲染侧右侧三个按钮经这些通道驱动窗口本体。**只做窗口操作、不含任何治理判定**（与本角色硬约束无关，
  // 不涉及边界/写权）。最大化/还原状态经 `window:maximized-changed` 反向外推，令按钮图标随之切换。
  ipcMain.handle("window:minimize", () => {
    if (!win.isDestroyed()) win.minimize();
  });
  ipcMain.handle("window:toggle-maximize", () => {
    if (win.isDestroyed()) return false;
    // 返回**目标**态（而非查询），避免 `maximize()` 的异步时序导致读到旧值；真实态由下方事件兜底。
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle("window:close", () => {
    if (!win.isDestroyed()) win.close();
  });
  ipcMain.handle("window:is-maximized", () => (win.isDestroyed() ? false : win.isMaximized()));
  // 最大化/还原 → 推给渲染侧（按钮图标在「还原态」与「最大化态」间切换）。
  win.on("maximize", () => {
    if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", true);
  });
  win.on("unmaximize", () => {
    if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", false);
  });

  // —— 操作者通道 (a)：**V1 不 arm**，故此处不构造、不注入 ——
  // `DESKTOP_SHELL_GATE_ARMED === false` ⇒ 会话构造路径不注入 `ShellGate` ⇒ `run_shell` 不注册
  // （能力缺席 = 最强 fail-closed）。下面这个分支**恒不执行**，只为把「arm 时的接线点」如实标出，
  // 并确保两处（flag / 就绪通道）都在本文件被引用，不被误当「已在使用」。
  if (DESKTOP_SHELL_GATE_ARMED) {
    // arm 时：编排用 buildDesktopOperatorChannel(win) 装配 ShellGate 后，经
    // createDesktopInterface({ ..., shellGate }) 注入。当前恒为死分支。
    void buildDesktopOperatorChannel(win);
  }
}

app.whenReady().then(async () => {
  // 去掉默认菜单栏（那条「文件 / 编辑 / View / …」）——客户要求自绘标题栏、不要原生 chrome。
  // 这条菜单栏就是 Electron 的默认 application menu；置 null 即整条移除（Windows 上各窗口随之无菜单栏）。
  // **快捷键评估**：文本编辑类快捷键（Ctrl+C/V/X/A、撤销）由 Chromium **原生**处理，不经菜单加速键，故不受影响；
  // 被移除的只是默认菜单提供的加速键（Ctrl+R 重载、Ctrl+Shift+I 开发者工具、Ctrl+Q 退出等）。
  // 本应用是极简聊天工具，这些**并非必要**，故**不补回任何加速键**（更不把菜单栏加回来）。
  Menu.setApplicationMenu(null);
  // 先把 `.env` 载入环境（补 `--env-file`），再建窗——使首个 pi 会话即拿得到 `ANS_PI_*`/token。
  await loadDesktopEnv();
  mainWindow = createWindow();
  registerIpc(mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      registerIpc(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// iface 供内部保留引用；此处不对外导出（避免误当公共 API）。
void iface;

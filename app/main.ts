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
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

import { createDesktopInterface, type DesktopInterface } from "./desktop/interface.ts";
// Pi 配置（设计 §11/T28）：启动把仓库根 `.env` 载入 `process.env`（= 补上 Electron 缺失的 `--env-file`）；
// 面板经 IPC 读写同一 `.env`。**`.env` 的读写全仓唯一**在共享模块 `src/common/shared/env-file.ts`
// （pm 属主）——此处**只读导入，不复制**；路径由 `./desktop/pi-config.ts` 解析（可注入，测试/e2e 用临时路径）。
import { loadEnvFileInto } from "../src/common/shared/env-file.ts";
import { resolveRepoEnvPath } from "./desktop/pi-config.ts";
// 会话事件外推的类型（B-2）：`SessionEventEnvelope` = `{roleId, event}` 信封（多会话并存按角色分发，防串消息）；
// `event` 为编排导出的 `OrchestrationEvent`（既有 `SessionEvent` + `settled` 时的 `handback`，设计 §10.8）。
// **类型从本角色 session.ts 只读导入、不复制形状**——IPC 外推原样透传。
import type { SessionEventEnvelope } from "./desktop/session.ts";
import {
  buildDesktopShellArming,
  createDesktopOperatorChannel,
  createShellConfirmPresenter,
  DESKTOP_SHELL_GATE_ARMED,
  type OperatorPresenter,
} from "./desktop/operator-channel.ts";
// 客户交互通道（A-5，2026-10-12）：su 的 request_confirmation / request_choice 经它摆到聊天流里的交互卡
// 并取回客户裁决（per-window pending Map + **按请求快照校验回包**——渲染进程输入不可信）。
import { createCustomerInputChannel } from "./desktop/customer-input.ts";
// 会话记录恢复（D-1，2026-10-12）：只读解析 `<project>/.ans/sessions/<roleId>/` 的最近会话（**主进程侧**；
// 渲染进程不碰 Pi SDK/JSONL——只收规范化后的界面行）。
import { readRoleSessionHistory, type ReplayRow } from "./desktop/session-history.ts";
// Q-1（2026-10-12 客户「很多操作会阻碍主线程」）：热路径**合并推送**——事件按≈一帧窗口批量、角色状态快照去抖。
import { createEventBatcher, createRoleStateDebouncer } from "./desktop/push-batcher.ts";

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

// —————————————————————— 操作者确认通道 (a)：**已 arm**（I-1；M-1 起为**应用内确认卡**）——————————————————————
//
// 本处把操作者通道 (a) 的**表现层**接到 Electron；它**只**呈现与收选择，**不做任何命令判定**（危险与否由
// (c) 判、语义由 (b) 判；第三闸就是「人」本身）。通道的入参/出参形状以**编排**的 `OperatorChannelFn`
// （`OperatorPrompt`→`OperatorOutcome`）为准，见 `app/desktop/operator-channel.ts`。
//
// **客户已裁定 arm（2026-10-12，I-1）**：「现在开放 shell，然后 shell 需要 su 审核一下。如果 su 觉得危险
// 可以让客户决定」——`DESKTOP_SHELL_GATE_ARMED === true`（理由与已知风险见 operator-channel.ts 顶部）。
// **M-1（2026-10-12 客户裁定「这个太丑了」）**：确认从**原生对话框**改为**应用内卡片**（复用工作台视觉；
// 命令等宽块 + 白话摘要 + 人话版「为什么问你」 + 折叠的技术详情）——数据面由
// `createShellConfirmPresenter` 经 `shell:confirm-request` 推达渲染侧、决定经 `shell:confirm-response` 回传
// （**恰 allow:true 才放行**；Esc/关窗/超时 → 不放行；关窗 ⇒ `rejectAllPending`）。**项目角色**走三层链；
// **su 不接 (b)/(a)**（审读者不给自己开闸：不自审、不弹框）——su 的 shell 是**只读档**（同一份 (c) 实件，
// 客户裁定 2026-10-12「su 也要有 shell，但是只读」，见 session.ts）。fail-closed 三条（关窗/取消/超时 →
// 不放行）在 operator-channel.ts。
/** 桌面操作者通道 (a)（**I-1 已 arm**；presenter 由 `registerIpc` 的 `shellConfirm.presenter` 提供——见彼处）。 */
function buildDesktopOperatorChannel(presenter: OperatorPresenter) {
  let operatorId = "unknown";
  try {
    operatorId = os.userInfo().username || "unknown";
  } catch {
    operatorId = "unknown";
  }
  return createDesktopOperatorChannel({ presenter, operatorId });
}

// —————————————————————— 客户交互通道（A-5）：确认制交互卡 ——————————————————————
//
// 客户裁定（设计 A-1/A-5，2026-10-12）：「客户确定了才加、才落盘」——su 的 `request_confirmation` /
// `request_choice` 挂起等客户作答时，经本通道把请求渲染为**聊天流里的一张交互卡**（确认 / 单选 / 多选 /
// 带预览的确认），客户作答后回传解挂。**fail-closed 四条**（设计 A-5）：未接线 / 窗口已关 → 未获同意；
// 客户点「不同意/取消」→ declined；超时（Pi适配器工具层的 withTimeout）→ unavailable。**绝不悄悄放行**。
// 通道的关联/校验/归三态全在 `customer-input.ts`（纯逻辑，可单测）；本处只接线窗口与 IPC。

function desktopOperatorId(): string {
  try {
    return os.userInfo().username || "unknown";
  } catch {
    return "unknown";
  }
}

/** D-1：逐角色读取会话历史并推给渲染侧（**只读**；失败如实携带 error；无内容不推——不刷屏）。 */
async function pushSessionHistories(win: BrowserWindow, projectRoot: string, roleIds: string[]): Promise<void> {
  for (const roleId of roleIds) {
    let payload: { roleId: string; projectRoot: string; rows: ReplayRow[]; error: string | null };
    try {
      const hist = await readRoleSessionHistory(projectRoot, roleId);
      payload = { roleId, projectRoot, rows: hist.rows, error: hist.error ?? null };
    } catch (err) {
      // 模块内已防御式；此处再兜一层——恢复失败**绝不**阻断导入。
      payload = { roleId, projectRoot, rows: [], error: err instanceof Error ? err.message : String(err) };
    }
    if (win.isDestroyed()) return;
    if (payload.rows.length === 0 && payload.error === null) continue; // 无可回放内容：不打扰
    win.webContents.send("session:history", payload);
  }
}

function registerIpc(win: BrowserWindow): void {
  // 事件外推：主进程 → 渲染进程（会话事件流）。入参为**带 `roleId` 信封**的 `SessionEventEnvelope`
  // （B-2：多会话并存，渲染侧按角色分发——不带标识会串消息）；原样透传，主进程不判定、不加工。
  // **Q-1（2026-10-12）合帧推送**：一轮可含几百个事件（tool_call/读文件/结果…），逐事件一次 IPC +
  // 逐事件渲染会把主线程淹掉——16ms（≈一帧）窗口内合成**一次** `session:events`（数组）；
  // preload 同时订阅单发 `session:event`（兼容既有探针/直发路径）。事件顺序在批内保持不变。
  const eventBatcher = createEventBatcher<SessionEventEnvelope>({
    windowMs: 16,
    send: (batch) => {
      if (win.isDestroyed()) return;
      win.webContents.send("session:events", batch);
    },
  });
  const emitEvent = (envelope: SessionEventEnvelope): void => {
    eventBatcher.push(envelope);
  };
  // **Q-1：角色状态快照去抖**（同角色窗口内只留**最新**快照——快照语义）——≥100ms 一次而非每事件一次。
  const roleStateDebouncer = createRoleStateDebouncer<{
    roleId: string;
    busy: boolean;
    summaries: string[];
    queue: { kind: string; sourceRoleId: string; summary: string; at: string }[];
    running: { kind: string; sourceRoleId: string; summary: string; at: string } | null;
  }>({
    windowMs: 100,
    send: (info) => {
      if (win.isDestroyed()) return;
      win.webContents.send("session:role-state", info);
    },
  });
  // 关窗：清掉挂起的合并/去抖计时器（窗口已没了，不再推）。
  win.on("closed", () => {
    eventBatcher.dispose();
    roleStateDebouncer.dispose();
  });

  // 客户交互通道（A-5）：请求经 `session:operator-request` 推给渲染侧渲染成交互卡；客户决定经
  // `session:operator-response` 回传、在通道内**按请求快照校验**后解挂。**挂在窗口作用域**（每窗口一套）。
  const customerChannel = createCustomerInputChannel({
    presenter: (payload) => {
      if (win.isDestroyed()) throw new Error("窗口已关闭，无法呈现交互请求");
      win.webContents.send("session:operator-request", payload);
    },
    operatorId: desktopOperatorId(),
  });
  // 窗口关掉：所有挂起请求归「未获同意」（fail-closed）——不留悬案、更不放行。
  win.on("closed", () => customerChannel.rejectAllPending("窗口已关闭，未获同意（fail-closed）"));

  // M-1（2026-10-12 客户裁定「这个太丑了」）：shell 确认卡的**呈现端**——不再用原生消息框。
  // 数据面（命令逐字原文 + 人话摘要/原因 + 折叠详情）经 `shell:confirm-request` 推给渲染侧；客户决定经
  // `shell:confirm-response` 回传（**恰 allow:true 才放行**；Esc/关闭/超时 → 不放行）。
  // fail-closed：窗口已关时推达抛错 ⇒ 通道归 unavailable（绝不当「没人问就放行」）；关窗 ⇒ 全部挂起不放行。
  const shellConfirm = createShellConfirmPresenter({
    present: (request) => {
      if (win.isDestroyed()) throw new Error("窗口已关闭，无法呈现 shell 确认请求");
      win.webContents.send("shell:confirm-request", request);
    },
  });
  win.on("closed", () => shellConfirm.rejectAllPending("窗口已关闭，未获放行（fail-closed）"));
  ipcMain.handle("shell:confirm-response", (_e, input) => shellConfirm.respond(input));

  // I-1（2026-10-12，客户裁定 arm——「现在开放 shell…如果 su 觉得危险可以让客户决定」）+ I-1 补丁
  // （2026-10-12 客户**重发授权**：接上 (c) 规则集实件）：arm 的**两件**——(c) 实件（`classifyShell` +
  // `defaultShellRules`，经 `buildDesktopShellArming` 只读导入）与 (a) 操作者确认通道——**同处接线**，
  // 经 `createDesktopInterface` → 会话构造路径交给**编排**装配 `ShellGate`。**两种会话、两档闸**：
  // **项目角色**走 (c)/(b)/(a) 三层链；**内置治理角色（su）**用**同一份 (c) 实件**经 `shellReadonly`
  // 装配**只读档**（客户裁定 2026-10-12「su 也要有 shell，但是只读」——su 不接 (b)/(a)：不自审、不弹框）
  // ——单一来源，两档永不漂移（分发在 session.ts 的 `role.builtIn` 判据处）。
  //
  // **两件同备才 arm（fail-closed）**：(c) 实件构造/加载失败 ⇒ **连 (a) 通道也不注入**——`run_shell`
  // 不注册（能力缺席即最强 fail-closed；不取「注册了但全拒」的半装态；su 只读档同此——缺件即不 arm）。
  // 如实告知到主进程日志（无敏感值）。
  const shellArming = DESKTOP_SHELL_GATE_ARMED ? buildDesktopShellArming() : undefined;
  if (DESKTOP_SHELL_GATE_ARMED && shellArming === undefined) {
    console.warn("shell 闸未 arm：(c) 规则集加载失败——fail-closed（run_shell 不注册）。");
  }
  const shellOperatorChannel =
    shellArming !== undefined ? buildDesktopOperatorChannel(shellConfirm.presenter) : undefined;

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
    // L-1 + 状态准确性 + 右栏「待办 / 队列」（2026-10-12 追加）：真实状态快照（busy × 队列[结构化] × 进行中，
    // 变化时）原样透传渲染侧——徽标「工作中 · N 待办」、队列行与右栏待办组都只信它（同一通道，不造第二套）。
    // Q-1：**去抖合并**（同角色只推最新快照，≥100ms 一次）——不再是每事件一次 IPC。
    emitRoleState: (info) => {
      roleStateDebouncer.push(info);
    },
    // 「项目内容可能已变」（su 一轮结束）→ 推 `project:changed` 给渲染侧，触发左树重取枚举（§10.3）。
    // 仅转达信号；是否真有角色被建出由渲染侧重取 `listProject` 后如实呈现（判定不在此）。
    emitProjectChanged: () => {
      if (win.isDestroyed()) return;
      win.webContents.send("project:changed");
    },
    // 客户交互通道（A-5）：仅内置治理角色（su）会话消费（见 session.ts 的注入判据）。
    customerInput: customerChannel.customerInput,
    // B-1：Markdown 链接外开——**校验在 Interface 层**（仅 http/https），此处只接系统浏览器（表现层）。
    openExternalFn: (url) => shell.openExternal(url),
    // I-1：arm 的 (a) 层（仅项目角色会话消费——su 不接 (b)/(a)；见 session.ts）。未 arm 时为 undefined（等同不注入）。
    shellOperatorChannel,
    // I-1 补丁（2026-10-12 客户重发授权）：(c) 规则集实件（与 (a) 同处接线、同判据——两件同备才 arm）。
    // 同一份对象也供 su 只读档（session.ts 对内置治理角色经 `shellReadonly` 复用——单一来源，两档不漂移）。
    shellArming,
    // K-2：选图（**渲染进程不碰文件**）——系统文件选择器 + 读文件；字节交 Interface **按真实内容**校验
    // （类型嗅探/≤5MB 都在 interface 层；此处只读不判）。取消 → null（如实回 `cancelled`）。
    pickImageFileFn: async () => {
      const result = await dialog.showOpenDialog(win, {
        title: "选择图片",
        properties: ["openFile"],
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const filePath = result.filePaths[0];
      const buf = await fs.promises.readFile(filePath);
      return { name: path.basename(filePath), dataBase64: buf.toString("base64") };
    },
  });
  iface = desktop;

  // 交互回包（A-5）：渲染侧提交决定 → 通道按**请求快照**校验（选项 id ⊆ 已发、单选恰一个、类型相符）
  // → 解挂为冻结三态；非法回包不受理（pending 保留，界面可重试失败后修正）。
  ipcMain.handle("session:operator-response", (_e, input) =>
    customerChannel.respond(input && typeof input === "object" ? input : {}),
  );

  ipcMain.handle("app:pick-project", () => desktop.pickProject());
  // D-1（2026-10-12）：导入/重载项目后**恢复界面记录**——对每个角色只读解析 `<project>/.ans/sessions/<roleId>/`
  // 的**最近**会话并推 `session:history`（渲染侧回放进该角色的聊天流；模型上下文由 Pi适配器侧一并恢复）。
  // 防御式：解析失败/目录缺失**不阻断导入**（失败如实提示，不崩、不静默）。
  ipcMain.handle("app:list-project", async (_e, input: { projectRoot: string }) => {
    const res = await desktop.listProject(input);
    const roles = Array.isArray(res && res.roles) ? res.roles.map((r) => r.roleId) : [];
    void pushSessionHistories(win, res.projectRoot, roles);
    return res;
  });
  // 点角色即开：一次调用直接建立会话（导入项目即授权，无确认框）。
  ipcMain.handle("session:open", (_e, input) => desktop.openSession(input));
  ipcMain.handle("session:send", (_e, input: { text: string; images?: unknown }) => desktop.sendSession(input));
  ipcMain.handle("session:stop", (_e, input) => desktop.stopSession(input));
  // P1-1（2026-10-13 客户裁定）：撤回未投递排队消息——Interface 如实回报（仅在队列中的客户消息可撤），主进程只透传。
  ipcMain.handle("session:withdraw", (_e, input: { roleId: string; id: string }) => desktop.withdrawQueued(input));
  // P0-2（2026-10-13 客户批准）：停当前轮次——Interface 三态如实回传（已请求停止 / 不支持 / 失败），主进程只透传。
  ipcMain.handle("session:abort", (_e, input: { roleId: string }) => desktop.abortSession(input));
  // B-2：保活会话列表（左树「有活动会话」小圆点的数据源）——纯读。
  ipcMain.handle("session:live", () => desktop.listLiveSessions());
  // B-1：Markdown 链接外开——渲染进程输入经 Interface 校验（仅 http/https）后交系统浏览器。
  ipcMain.handle("app:open-external", (_e, input) => desktop.openExternal(input));
  // K-2：输入区图片——选图（主进程读文件）与粘贴/拖入字节校验（渲染进程不碰文件）；
  // P0-1（2026-10-13 客户批准）：图片已随消息端到端送进模型（session:send 带载荷，Interface 真实字节重校验）。
  ipcMain.handle("app:pick-image", () => desktop.pickImage());
  ipcMain.handle("app:attach-image", (_e, input) => desktop.attachImage(input));
  // （A-5：随「收口」删除——产物收尾现由编排在 su 会话 settle 后**自动**完成；桌面不再有
  //   「完成 bootstrap」的读状态/显式触发两个 IPC；客户确认已改由交互卡承担。）

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

  // —— 操作者通道 (a)：**I-1 已 arm** ——
  // 构造与注入已在上方（`shellOperatorChannel` → `createDesktopInterface`）完成：arm 后 (a) 通道经会话构造
  // 路径交给**编排**装配三层链 `ShellGate`，Pi 适配器据此注册 `run_shell`（**仅项目角色**；su 不接 (b)/(a)
  // ——其 shell 走只读档，复用同一份 (c) 实件经 `shellReadonly`）。
  // fail-closed 三条（关窗/取消/拒绝/超时/抛错 → 不放行）见 `app/desktop/operator-channel.ts`。
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

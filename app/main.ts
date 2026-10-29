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
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";

import { createDesktopInterface, createShellJudgeSwitch, isShellJudgeIpcSender, registerPreferencesIpc, type DesktopInterface } from "./desktop/interface.ts";
// i18n B0（2026-10-23）：主进程 translator（窗口/对话框/启动错误框）与应用级语言偏好
// （`<userData>/ans/preferences.json`，只写 userData；不写项目 `.ans`/`.env`）。
import { createMainI18n, desktopTexts } from "./desktop/i18n.ts";
import { preferencesFilePath, readPreferences } from "./desktop/preferences.ts";
// 运行时配置：开发使用仓库 `.env`，安装包使用 userData/.env，启动载入 `process.env`（补 Electron 缺失的 `--env-file`）；
// 面板经 IPC 读写同一 `.env`。**`.env` 的读写全仓唯一**在共享模块 `src/common/shared/env-file.ts`
// （pm 属主）——此处**只读导入，不复制**；路径由 `./desktop/pi-config.ts` 解析（可注入，测试/e2e 用临时路径）。
import { loadEnvFileInto } from "../src/common/shared/env-file.ts";
import { resolveDesktopEnvPath } from "./desktop/pi-config.ts";
import { parsePackagedSmokeArguments, packagedSmokeScript, validateSmokeRendererEntry } from "./desktop/packaged-smoke.ts";
// 会话事件外推的类型（B-2）：`SessionEventEnvelope` = `{projectRoot,roleId,runtime,event}` 信封（按三元身份分发）；
// `event` 为编排导出的 `OrchestrationEvent`（既有 `SessionEvent` + `settled` 时的 `handback`，设计 §10.8）。
// **类型从本角色 session.ts 只读导入、不复制形状**——IPC 外推原样透传。
import type { SessionEventEnvelope } from "./desktop/session.ts";
import {
  buildDesktopShellArming,
  createDesktopOperatorChannel,
  createShellConfirmPresenter,
  DESKTOP_SHELL_GATE_ARMED,
  type OperatorPresenter,
  type ShellJudgeResultPayload,
} from "./desktop/operator-channel.ts";
// 客户交互通道（A-5，2026-10-12）：su 的 request_confirmation / request_choice 经它摆到聊天流里的交互卡
// 并取回客户裁决（per-window pending Map + **按请求快照校验回包**——渲染进程输入不可信）。
import { createCustomerInputChannel, type AutoReworkCallbackInfo } from "./desktop/customer-input.ts";
// 边界内写入预授权（2026-10-25 客户新规则「写自己角色权限内的路径，直接放行」）：判定纯逻辑在
// write-preauthorization.ts（边界唯一来源 = 门禁 resolveWrite）；本文件只接线——通道在呈现卡片/调用
// 判断之前求值，accept/reject 直接结算并落一条可见系统行（既有 delivery-note 事件行）。
import { evaluateWritePreauthorization } from "./desktop/write-preauthorization.ts";
// 治理下一步（2026-10-18 客户修正）：客户决定成功后由应用**后台**把下一步任务派给目标治理角色
// （不打开/切换当前会话）。推导与文案在 governance-advance.ts；派发动作在 Interface（advanceGovernanceFlow）。
import type { GovernanceNextStepContext, GovernanceNextStepPayload } from "./desktop/governance-advance.ts";
// G-2/W5（2026-10-16 客户批准）：恢复确认卡呈现端——su 经 `propose_recovery` 提议恢复动作时，把卡经
// `recovery:confirm-request` 推给渲染侧（桌面UI 已落树消费面）、回包经 `recovery:confirm-response` 受理；
// **恰 allow:true 才是执行请求**；关窗 `rejectAllPending` = 未获执行（fail-closed）。**等待不设限**（裁定 4）。
import { createRecoveryConfirmPresenter } from "./desktop/recovery-channel.ts";
// 运行时历史：Pipeline 按 project/role/runtime 读 ANS 回放，转换为界面行。
// 只有 Pi 无 ANS 回放时保留旧 JSONL 展示 fallback；历史不证明模型上下文恢复。
import { RUNTIME_KINDS, type RuntimeKind } from "../src/common/shared/runtime-shared.ts";
// Q-1（2026-10-12 客户「很多操作会阻碍主线程」）：热路径**合并推送**——事件按≈一帧窗口批量、角色状态快照去抖。
import { createEventBatcher, createRoleStateDebouncer } from "./desktop/push-batcher.ts";
import { configureDiagnostics, createDiagnosticLogger, flushDiagnostics, disposeDiagnostics } from "../src/common/shared/diagnostics.ts";
import { observeWindowDiagnostics, recordRendererDiagnostic, createWindowIpcRegistrar, RECOVERY_PAGE } from "./desktop/diagnostics.ts";
// Phase 5A（PM §17.12）：产品侧导航兜底——只允许初始加载/同 URL reload，http(s) 外开，其余协议阻止。
import { installNavigationGuard } from "./desktop/navigation-guard.ts";
// Phase 5A（PM §17.2）：渲染入口的唯一路径事实源——不得在本文件再写死 renderer 入口字符串。
import { resolveRendererEntry } from "./desktop/renderer-entry.ts";

const smokeRequest = parsePackagedSmokeArguments(process.argv);
if (smokeRequest) {
  // Only the explicit verification entry overrides userData; normal app startup keeps Electron's default.
  fs.mkdirSync(smokeRequest.userDataPath, { recursive: true, mode: 0o700 });
  app.setPath("userData", smokeRequest.userDataPath);
}
let desktopEnvPath: string | undefined;
// i18n B0（2026-10-23）：启动早期读取偏好后设置；默认 zh-CN（读不到/损坏时保持默认，不阻塞启动）。
// main.ts 与 Interface 共享同一 translator 实例——窗口标题、对话框、启动错误框与 IPC 错误文案同一 locale。
const mainI18n = createMainI18n();
let preferencesPath: string | undefined;

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 5B：唯一生产入口 = Vite 构建产物 `renderer/dist/index.html`（PM §17.1）。
const PRODUCTION_RENDERER_ENTRY = resolveRendererEntry(HERE);
// 仅 packaged smoke 可显式指定入口（见 packaged-smoke.ts 的校验）；普通启动/渲染进程不可达。
let activeProductionRendererEntry = PRODUCTION_RENDERER_ENTRY;
const APP_ICON_PATH = path.join(HERE, "desktop", "assets", "ans-studio-ans-icon.png");

let mainWindow: BrowserWindow | null = null;
let iface: DesktopInterface | null = null;
let recoveryProjectRoot: string | null = null;
let recoveryRoleId: string | null = null;
let recoveryRuntime: RuntimeKind = "pi";
const mainDiagnostic = createDiagnosticLogger({ component: "desktop.main" });
let showMainFailure: (() => void) | undefined;

/**
 * 启动时把**已解析的运行时 `.env`**载入 `process.env`——**这正是补上 `package.json` 里缺失的 `--env-file`**
 * 后续所选引擎经 Pipeline/Service 消费有效配置；保存应用由 Interface 安全点控制。
 * **只回报键名、绝不打印任何值**。
 *
 * 失败处理：`.env` 不存在 → 无操作（`loadEnvFileInto` 的 ENOENT 分支）；其它读取失败**不阻断启动**
 * （界面面板仍可用于补救），且**不打印任何值**（如实留空）。
 */
async function loadDesktopEnv(envPath: string): Promise<void> {
  try {
    await loadEnvFileInto(process.env, envPath);
  } catch (error) {
    mainDiagnostic.error("app.environment.failed", error);
    // 读取失败不阻断启动；不打印值（凭据纪律，设计 §11.4）。
  }
}

/**
 * 本地化窗口标题的唯一接线（i18n B0，2026-10-23 真机缺陷）：
 * 渲染页 `<title>` 加载后会触发 `page-title-updated`，默认把窗口标题改成页面标题——en-US 下
 * 页面标题仍是中文，会把 `main.window.title` 的英文覆盖掉（PowerShell `MainWindowTitle` 复现）。
 * 这里 **preventDefault()** 并用**当前 locale** 的 `desktopTexts().windowTitle` 调 `win.setTitle`；
 * `did-finish-load` 后再补一次作为防御。locale 成功切换后的 `win.setTitle` 仍由
 * `registerPreferencesIpc` 的 `onLocaleChanged` 负责（本函数不改变该路径）。
 */
function applyLocalizedWindowTitle(win: BrowserWindow): void {
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    if (!win.isDestroyed()) win.setTitle(desktopTexts(mainI18n).windowTitle);
  });
  win.webContents.on("did-finish-load", () => {
    if (!win.isDestroyed()) win.setTitle(desktopTexts(mainI18n).windowTitle);
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: desktopTexts(mainI18n).windowTitle,
    icon: APP_ICON_PATH,
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
  // 建窗后、任何加载之前挂上：页面标题不得覆盖本地化窗口标题。
  applyLocalizedWindowTitle(win);
  return win;
}

// —————— Phase 5A（PM §17.3）：dev/prod 渲染入口与 dev server 失败回退 ——————
// 生产：app.isPackaged ⇒ loadFile 唯一构建入口 `renderer/dist/index.html`。
// 开发：默认与生产同一文件入口；仅非打包且显式 ANS_DEV_SERVER_URL（回环）时 loadURL。
// 任何 dev 放宽都只属于 Vite dev server（apply:'serve'），主进程不注入 CSP、不改 webPreferences。
const DEV_SERVER_TIMEOUT_MS = 8_000;

/** 仅接受回环 http(s) URL：无凭据、主机限 localhost/127.0.0.1/[::1]；其它一律按文件入口启动。 */
function resolveDevServerUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.username !== "" || url.password !== "") return undefined;
    const host = url.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

type RendererLoadTarget = { kind: "file"; file: string } | { kind: "dev-url"; url: string };

/** 日志只记相对 app 目录的入口，避免把用户主目录写进诊断。 */
function rendererEntryLabel(appDir: string, file: string): string {
  return path.relative(appDir, file).split(path.sep).join("/");
}

function errorCodeOf(error: unknown): number | string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { errno?: unknown; code?: unknown };
  if (typeof value.errno === "number") return value.errno;
  if (typeof value.code === "string" || typeof value.code === "number") return value.code;
  return undefined;
}

/** 8s 限时加载 dev URL；超时主动 stop，避免挂死的 dev server 让窗口无限白屏。 */
async function loadUrlWithTimeout(win: BrowserWindow, url: string, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      try { win.webContents.stop(); } catch { /* 窗口可能已销毁 */ }
      reject(new Error(`dev server 加载超时（>${timeoutMs}ms）`));
    }, timeoutMs);
  });
  try {
    await Promise.race([win.loadURL(url), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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
// **全部内置治理角色**（`role.builtIn === true`）走**审批档**（客户 2026-10-17 裁定；2026-10-19 新规则：
// 所有角色都有 shell 权限（含读写与任意命令），一律提交审批）：同一份 (c) 实件 + (a) 通道，只读白名单直放、
// 其余逐条审批；**不接 (b)**（不自审、不弹框），见 session.ts。fail-closed 三条（关窗/取消/超时 →
// 不放行）在 operator-channel.ts。
/** 桌面操作者通道 (a)（**I-1 已 arm**；presenter 由 `registerIpc` 的 `shellConfirm.presenter` 提供——见彼处）。
 *  「替我审」（2026-10-17）：开关读取与结果行推送由**同一窗口作用域**注入——通道自身仍不做命令判定。 */
function buildDesktopOperatorChannel(
  presenter: OperatorPresenter,
  judge?: { isEnabled: () => boolean; emitJudgeResult: (payload: ShellJudgeResultPayload) => void },
) {
  let operatorId = "unknown";
  try {
    operatorId = os.userInfo().username || "unknown";
  } catch {
    operatorId = "unknown";
  }
  return createDesktopOperatorChannel({
    presenter,
    operatorId,
    ...(judge !== undefined ? { judge: { isEnabled: judge.isEnabled }, emitJudgeResult: judge.emitJudgeResult } : {}),
  });
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
async function pushSessionHistories(win: BrowserWindow, projectRoot: string, roleIds: string[], reader: DesktopInterface): Promise<void> {
  for (const roleId of roleIds) {
    for (const runtime of RUNTIME_KINDS) {
      const payload = await reader.getSessionHistory({ projectRoot, roleId, runtime });
      if (win.isDestroyed()) return;
      if (payload.rows.length === 0 && payload.error === null && !payload.reports?.length && !payload.reportErrors?.length) continue;
      win.webContents.send("session:history", payload);
    }
  }
}

function registerIpc(win: BrowserWindow): void {
  const registerHandler = createWindowIpcRegistrar(win, ipcMain, mainDiagnostic);
  let showingFailure = false;
  const showFailure = (): void => {
    if (showingFailure || win.isDestroyed()) return;
    showingFailure = true;
    void win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(RECOVERY_PAGE)).catch((error) => mainDiagnostic.error("window.recovery-page.failed", error));
  };
  showMainFailure = showFailure;
  // —————— Phase 5A（PM §17.12）：真实主进程窗口的导航兜底 ——————
  // 渲染侧（桌面UI）应 preventDefault 并只对 http/https 调 openExternal 桥；本处兜住漏网导航：
  // 初始入口/同 URL reload 放行；http(s) 外开；file:/data:/javascript: 等一律阻止、不执行。
  // 不外开重复：渲染侧先经 IPC 外开时 mark，兜底在同一窗口内不再重复开。
  const navigationAllowedUrls = (): string[] => {
    const urls = [pathToFileURL(activeProductionRendererEntry).href];
    const devUrl = app.isPackaged ? undefined : resolveDevServerUrl(process.env.ANS_DEV_SERVER_URL);
    if (devUrl !== undefined) urls.push(devUrl);
    return urls;
  };
  const navigationGuard = installNavigationGuard(win.webContents, {
    allowedUrls: navigationAllowedUrls,
    openExternal: (url) => {
      void shell.openExternal(url).catch((error) => mainDiagnostic.error("window.navigation.open-external.failed", error));
    },
    onExternal: (url) => mainDiagnostic.record("window.navigation.external", { url }),
    // 不记录原始 file:/data:/javascript: URL（可能含内容）；只记原因。
    onBlocked: (reasonCode) => mainDiagnostic.record("window.navigation.blocked", { reasonCode }),
  });
  // —————— 「替我审批」（approval）与「替我决策」（decision）开关（2026-10-17 / 2026-10-18 评审 §3.3） ——————
  // 两个**独立**状态机：默认 false、启动/重载复位、不持久化、互不影响；只在主进程内存。
  // 同一实例交给通道（调用当刻读 `isEnabled()`）与 Interface（`shell:judge-*` / `decision:judge-*`），
  // 两处永不漂移。代码符号沿用 `shellJudgeSwitch`（approval 组现为「shell + 写盘族」），通道名不改。
  const shellJudgeSwitch = createShellJudgeSwitch();
  const decisionJudgeSwitch = createShellJudgeSwitch();
  const shellJudgeLog = createDiagnosticLogger({ component: "desktop.shell-judge" });
  const decisionJudgeLog = createDiagnosticLogger({ component: "desktop.decision-judge" });
  // —————— Phase 5A（PM §17.3）：入口解析 + dev server 一次性回退 ——————
  // 每窗口状态：dev 失败一次后本窗口不再等待 dev server；重启应用重新允许。
  const pushShellJudgeState = (): void => {
    if (!win.isDestroyed()) win.webContents.send("shell:judge-state", { ...shellJudgeSwitch.get(), available: true });
  };
  const pushDecisionJudgeState = (): void => {
    if (!win.isDestroyed()) win.webContents.send("decision:judge-state", { ...decisionJudgeSwitch.get(), available: true });
  };
  let devServerUnavailable = false;
  let devProbeActive = false;
  let devFallbackPromise: Promise<boolean> | undefined;
  let devUrlRejectedLogged = false;
  let statesPushedForAttempt = false;

  const pushLoadedStates = (): void => {
    if (statesPushedForAttempt) return;
    statesPushedForAttempt = true;
    // 初次加载后推送真实状态，渲染侧据此同步两个复选框（不显示假开启态）。
    pushShellJudgeState();
    pushDecisionJudgeState();
  };

  const resolveRendererTarget = (): RendererLoadTarget => {
    const rawDevUrl = app.isPackaged ? undefined : process.env.ANS_DEV_SERVER_URL;
    const devUrl = resolveDevServerUrl(rawDevUrl);
    // 设置了但非法（非回环/带凭据/坏 URL）：忽略并按文件入口启动；只记一次，避免每次重载刷日志。
    if (!app.isPackaged && rawDevUrl && devUrl === undefined && !devUrlRejectedLogged) {
      devUrlRejectedLogged = true;
      mainDiagnostic.record("window.dev-server.rejected", { state: "invalid-url" });
    }
    if (devUrl !== undefined && !devServerUnavailable) return { kind: "dev-url", url: devUrl };
    // dev server 已失败过一次：本窗口直接加载构建产物（唯一生产入口）。
    if (devUrl !== undefined) return { kind: "file", file: activeProductionRendererEntry };
    return { kind: "file", file: activeProductionRendererEntry };
  };

  /** dev 失败后的一次性回退：共用一个 Promise，`loadURL` rejection 与 did-fail-load 不会双跳。 */
  const runDevFallback = (reason: "load-failed" | "timeout", errorCode?: number | string): Promise<boolean> => {
    if (devFallbackPromise !== undefined) return devFallbackPromise;
    devServerUnavailable = true;
    mainDiagnostic.record("window.dev-server.fallback", {
      reasonCode: reason,
      ...(errorCode !== undefined ? { errorCode } : {}),
    });
    devFallbackPromise = (async () => {
      if (!fs.existsSync(activeProductionRendererEntry)) {
        // 未构建：如实进恢复页（不自动构建、不回退旧入口）。
        mainDiagnostic.record("window.dev-server.fallback.unavailable", {
          state: "missing",
          path: rendererEntryLabel(HERE, activeProductionRendererEntry),
        });
        return false;
      }
      mainDiagnostic.record("window.renderer.target", {
        mode: "file",
        path: rendererEntryLabel(HERE, activeProductionRendererEntry),
      });
      await win.loadFile(activeProductionRendererEntry);
      return true;
    })().catch((error) => {
      mainDiagnostic.error("window.dev-server.fallback.failed", error);
      return false;
    });
    return devFallbackPromise;
  };

  const loadInterface = async (): Promise<void> => {
    showingFailure = false;
    statesPushedForAttempt = false;
    devProbeActive = false;
    devFallbackPromise = undefined;
    // §10.3：渲染重载/初次加载前**两个开关各自**复位为手动（不持久化）；已挂起卡不受影响。
    shellJudgeSwitch.reset();
    decisionJudgeSwitch.reset();
    const target = resolveRendererTarget();
    try {
      if (target.kind === "dev-url") {
        const url = new URL(target.url);
        devProbeActive = true;
        mainDiagnostic.record("window.renderer.target", { mode: "dev-url", url: url.host + url.pathname });
        try {
          await loadUrlWithTimeout(win, target.url, DEV_SERVER_TIMEOUT_MS);
        } finally {
          devProbeActive = false;
        }
      } else {
        mainDiagnostic.record("window.renderer.target", { mode: "file", path: rendererEntryLabel(HERE, target.file) });
        await win.loadFile(target.file);
      }
      pushLoadedStates();
    } catch (error) {
      devProbeActive = false;
      if (target.kind === "dev-url") {
        const reason = error instanceof Error && /超时/.test(error.message) ? "timeout" : "load-failed";
        const ok = await runDevFallback(reason, errorCodeOf(error));
        if (ok) {
          pushLoadedStates();
          return;
        }
      }
      mainDiagnostic.error("window.interface.failed", error);
      showFailure();
    }
  };
  // 主帧加载失败先交给 dev 回退（仅 dev 探测期间）；其余失败（preload/崩溃）仍走恢复页。
  observeWindowDiagnostics(win, mainDiagnostic, showFailure, {
    onMainFrameLoadFailure: (errorCode) => {
      if (!devProbeActive) return false;
      devProbeActive = false;
      const reason = errorCode === -7 ? "timeout" : "load-failed";
      void runDevFallback(reason, errorCode).then((ok) => {
        if (ok) pushLoadedStates();
        else showFailure();
      });
      return true;
    },
  });
  registerHandler("app:renderer-diagnostic", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false };
    const logger = createDiagnosticLogger({ component: "desktop.renderer", projectRoot: recoveryProjectRoot ?? undefined, roleId: recoveryRoleId ?? undefined });
    return recordRendererDiagnostic(logger, input);
  });
  registerHandler("app:recovery-state", (event) => {
    if (event.sender !== win.webContents) return null;
    return { projectRoot: recoveryProjectRoot, roleId: recoveryRoleId, runtime: recoveryRuntime };
  });
  registerHandler("app:reload-interface", async (event) => {
    if (event.sender !== win.webContents) return { ok: false };
    mainDiagnostic.record("window.reload.requested");
    await loadInterface();
    return { ok: !showingFailure };
  });
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
    projectRoot: string; runtime: RuntimeKind;
    busy: boolean;
    summaries: string[];
    queue: { kind: string; sourceRoleId: string; summary: string; at: string }[];
    running: { kind: string; sourceRoleId: string; summary: string; at: string } | null;
  }>({
    windowMs: 100,
    key: (info) => `${info.projectRoot}\u0000${info.roleId}\u0000${info.runtime}`,
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
  //
  // 治理下一步（2026-10-18 客户修正）：通道先于 `desktop` 装配（desktop 需要 customerInput），故用可变句柄
  // 在 desktop 建立后接上——在此之前不可能有客户回包，句柄必已就位。
  const customerChannel = createCustomerInputChannel({
    presenter: (payload) => {
      if (win.isDestroyed()) throw new Error("窗口已关闭，无法呈现交互请求");
      win.webContents.send("session:operator-request", payload);
    },
    operatorId: desktopOperatorId(),
    onExpired: (payload) => { if (!win.isDestroyed()) win.webContents.send("session:operator-expired", payload); },
    // 三权（评审 §6.1 硬约束 / §九-10）：同项目已有待决定卡 ⇒ 后续请求排队、不呈现；
    // 推一条状态事件让渲染侧显示「等待前一个决定」（不自动合并、不自动批准）。
    onQueued: (payload, waitingFor) => {
      if (!win.isDestroyed()) win.webContents.send("session:operator-queued", { ...payload, waitingFor });
    },
    // 2026-10-25 客户新规则「写自己角色权限内的路径，直接放行」：写盘确认在**呈现卡片/调用判断之前**
    // 做边界预授权判定（边界唯一来源 = 门禁 resolveWrite；会话边界快照由 SessionManager 提供）。
    // accept/reject 直接结算（不弹卡、不调 judge）；治理敏感类别返回 confirm ⇒ 走既有卡片/判断路径。
    writePreauthorization: evaluateWritePreauthorization,
    // 预授权结算的可见系统行（既有事件流的 delivery-note 系统行；渲染侧已有该样式，不新增通道/不改 UI）。
    onWritePreauthorization: (event) => {
      if (win.isDestroyed()) return;
      if (event.runtime === undefined) return;
      emitEvent({
        roleId: event.roleId,
        projectRoot: event.projectRoot,
        runtime: event.runtime,
        event: { kind: "message", summary: event.summary, detail: { source: "delivery-note" } },
      });
    },
    // 判断 agent（2026-10-18 双开关评审 §8.1/§8.3）：按卡种所属组读**各自**开关（主进程权威）；
    // 两开关互不影响；判断闭包由每会话上下文（`ctx.governanceJudge`）提供。
    judge: {
      isGroupEnabled: (group) => (group === "approval" ? shellJudgeSwitch.isEnabled() : decisionJudgeSwitch.isEnabled()),
    },
    // 代批结果行：推达失败**必须抛错**（结果行是 approve 的条件，通道据此回落 manual/row-failed）。
    emitJudgeResult: (payload) => {
      if (win.isDestroyed()) throw new Error("窗口已关闭，无法呈现判断结果");
      win.webContents.send("session:operator-judge", payload);
      // §8.3：结果行同时落主入口 Liaison 进度行（best-effort，失败只诊断，绝不影响已完成的决定）。
      try {
        desktop.emitJudgeProgress(payload);
      } catch (error) {
        mainDiagnostic.error("governance-judge.progress.failed", error, { requestId: payload.requestId, cardKind: payload.cardKind });
      }
    },
  });
  // 窗口关掉：所有挂起请求归「未获同意」（fail-closed）——不留悬案、更不放行。
  win.on("closed", () => customerChannel.rejectAllPending("窗口已关闭，未获同意（fail-closed）"));

  // M-1（2026-10-12 客户裁定「这个太丑了」）：shell 确认卡的**呈现端**——不再用原生消息框。
  // 数据面（命令逐字原文 + 人话摘要/原因 + 折叠详情）经 `shell:confirm-request` 推给渲染侧；客户决定经
  // `shell:confirm-response` 回传（**恰 allow:true 才放行**；Esc/关闭/超时 → 不放行）。
  // fail-closed：窗口已关时推达抛错 ⇒ 通道归 unavailable（绝不当「没人问就放行」）；关窗 ⇒ 全部挂起不放行。
  const shellConfirm = createShellConfirmPresenter({
    onExpired: (payload) => { if (!win.isDestroyed()) win.webContents.send("session:operator-expired", payload); },
    present: (request) => {
      if (win.isDestroyed()) throw new Error("窗口已关闭，无法呈现 shell 确认请求");
      win.webContents.send("shell:confirm-request", request);
    },
  });
  win.on("closed", () => shellConfirm.rejectAllPending("窗口已关闭，未获放行（fail-closed）"));

  // F-4-opt1（2026-10-16 客户批准）：窗口重新获得焦点/重新显示（最小化还原、被遮挡后回到前台）时**幂等重推**
  // 未决确认卡——若某次推达在渲染侧丢失，操作者一回到窗口即可再收到（复用既有幂等重推，与
  // `app:recovery-ready` 同款；只重推**仍挂起**的项——过期/已决项绝无放行语义，重推不改变任何判定）。
  win.on("focus", () => { shellConfirm.replayPending(); });
  win.on("show", () => { shellConfirm.replayPending(); });
  registerHandler("app:recovery-ready", (event) => {
    if (event.sender !== win.webContents) return { ok: false };
    customerChannel.replayPending();
    shellConfirm.replayPending();
    return { ok: true };
  });
  registerHandler("shell:confirm-response", (_e, input) => shellConfirm.respond(input));
  // —————— 「替我审」IPC（2026-10-17；PM 评审 §6.6，通道名钉死） ——————
  // 两个 handler 内**各自**校验 `event.sender === win.webContents`（不依赖通用 registrar）。
  // `shell:judge-state/result` 为**主→渲染**推送，无入站 handler。
  registerHandler("shell:judge-get", (event) => {
    if (!isShellJudgeIpcSender(event.sender, win.webContents)) return { version: 1, ok: false, error: "请求来源无效。" };
    return desktop.getShellJudgeState();
  });
  registerHandler("shell:judge-set", (event, input) => {
    if (!isShellJudgeIpcSender(event.sender, win.webContents)) {
      shellJudgeLog.record("shell-judge.set.rejected", { reason: "sender-mismatch" });
      return { version: 1, ok: false, error: "请求来源无效。" };
    }
    const result = desktop.setShellJudgeEnabled(input);
    if (result.ok === true) {
      shellJudgeLog.record("shell-judge.toggled", { enabled: result.enabled, source: "renderer", at: new Date().toISOString() });
      // 成功后仅影响**之后新到**的 `(a)` 请求；推送让渲染侧以主进程状态为准（不显示假开启态）。
      pushShellJudgeState();
    } else {
      shellJudgeLog.record("shell-judge.set.rejected", { reason: result.error ?? "invalid-request" });
    }
    return result;
  });
  // —————— 「替我决策」IPC（2026-10-18 双开关评审 §3.3，通道名钉死） ——————
  // 与 approval 同形、**各自独立**的开关；同样在 handler 内校验 sender。
  // `decision:judge-state` 为主→渲染推送；结果行走 `session:operator-judge`（见 createCustomerInputChannel 接线）。
  registerHandler("decision:judge-get", (event) => {
    if (!isShellJudgeIpcSender(event.sender, win.webContents)) return { version: 1, ok: false, error: "请求来源无效。" };
    return desktop.getDecisionJudgeState();
  });
  registerHandler("decision:judge-set", (event, input) => {
    if (!isShellJudgeIpcSender(event.sender, win.webContents)) {
      decisionJudgeLog.record("decision-judge.set.rejected", { reason: "sender-mismatch" });
      return { version: 1, ok: false, error: "请求来源无效。" };
    }
    const result = desktop.setDecisionJudgeEnabled(input);
    if (result.ok === true) {
      decisionJudgeLog.record("decision-judge.toggled", { enabled: result.enabled, source: "renderer", at: new Date().toISOString() });
      // 只影响之后新到的治理决定卡；已挂起/判断中的卡不追溯（通道在结果结算前会再查一次开关）。
      pushDecisionJudgeState();
    } else {
      decisionJudgeLog.record("decision-judge.set.rejected", { reason: result.error ?? "invalid-request" });
    }
    return result;
  });

  // I-1（2026-10-12，客户裁定 arm——「现在开放 shell…如果 su 觉得危险可以让客户决定」）+ I-1 补丁
  // （2026-10-12 客户**重发授权**：接上 (c) 规则集实件）：arm 的**两件**——(c) 实件（`classifyShell` +
  // `defaultShellRules`，经 `buildDesktopShellArming` 只读导入）与 (a) 操作者确认通道——**同处接线**，
  // 经 `createDesktopInterface` → 会话构造路径交给**编排**装配 `ShellGate`。**两种会话、两档闸**：
  // **项目角色**走 (c)/(b)/(a) 三层链；**全部内置治理角色**（客户 2026-10-19 新规则：所有角色都有 shell
  // 权限（含读写与任意命令），一律提交审批）用**同一份 (c) 实件 + (a) 通道**经 `shellOperatorOnly` 装配
  // **审批档**（只读白名单直放、其余逐条审批；不接 (b)：不自审）——单一来源，两档永不漂移
  // （分发在 session.ts 的 `role.builtIn` 判据处）。
  //
  // **两件同备才 arm（fail-closed）**：(c) 实件构造/加载失败 ⇒ **连 (a) 通道也不注入**——`run_shell`
  // 不注册（能力缺席即最强 fail-closed；不取「注册了但全拒」的半装态；内置治理角色审批档同此——缺件即不 arm）。
  // 如实告知到主进程日志（无敏感值）。
  const shellArming = DESKTOP_SHELL_GATE_ARMED ? buildDesktopShellArming() : undefined;
  if (DESKTOP_SHELL_GATE_ARMED && shellArming === undefined) {
    console.warn("shell 闸未 arm：(c) 规则集加载失败——fail-closed（run_shell 不注册）。");
  }
  const shellOperatorChannel =
    shellArming !== undefined
      ? buildDesktopOperatorChannel(shellConfirm.presenter, {
          isEnabled: () => shellJudgeSwitch.isEnabled(),
          // 推达失败**必须抛错**：allow 的结果行是放行条件（通道据此降级 manual/row-failed）。
          emitJudgeResult: (payload) => {
            if (win.isDestroyed()) throw new Error("窗口已关闭，无法呈现判断结果");
            win.webContents.send("shell:judge-result", payload);
          },
        })
      : undefined;

  if (!desktopEnvPath) throw new Error("运行时配置路径尚未初始化。");
  if (!preferencesPath) throw new Error("语言偏好路径尚未初始化。");
  const desktop = createDesktopInterface({
    envFilePath: desktopEnvPath,
    // i18n B0（2026-10-23）：应用级语言偏好文件与共享 translator（同一实例贯穿窗口/对话框/错误文案）。
    // 偏好只写 userData；不写项目 `.ans`/`.env`/治理账本。
    preferencesPath,
    mainI18n,
    // 自动验收派发/冷启动补齐的 per-project 引擎选择：user-data 下的独立文件（不写项目 `.ans`、
    // 不碰治理账本）——下次冷启动据此选对引擎（2026-10-19 真机缺陷：无活跃会话时曾回退 claude）。
    runtimeStatePath: path.join(app.getPath("userData"), "ans", "runtime-selection.json"),
    pickDirectory: async () => {
      const result = await dialog.showOpenDialog(win, {
        title: desktopTexts(mainI18n).importProjectDialogTitle,
        properties: ["openDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
    emitEvent,
    // L-1 + 状态准确性 + 右栏「待办 / 队列」（2026-10-12 追加）：真实状态快照（busy × 队列[结构化] × 进行中，
    // 变化时）原样透传渲染侧——徽标「工作中 · N 待办」、队列行与右栏待办组都只信它（同一通道，不造第二套）。
    // Q-1：**去抖合并**（同角色只推最新快照，≥100ms 一次）——不再是每事件一次 IPC。
    emitPersistenceChange: update => {
      if (!win.isDestroyed()) win.webContents.send(update.change.kind === 'report-save' ? 'report-persistence-updated' : 'delivery-history-updated', update);
    },
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
    // G-2/W1：三通道（su 交互卡 / shell 卡 / 恢复卡）按角色挂起数**合并视图**——看护静默谓词与
    // 「正确等待不报」排除用（缺省 ⇒ 恒 0「无待确认」；本应用内恒提供）。
    watchdogPendingSnapshot: () => {
      const byRole = new Map<string, number>();
      const merge = (m: Map<string, number>): void => { for (const [rid, n] of m) byRole.set(rid, (byRole.get(rid) ?? 0) + n); };
      merge(customerChannel.pendingRoles());
      merge(shellConfirm.pendingRoles());
      return { total: customerChannel.pendingCount() + shellConfirm.pendingCount(), byRole };
    },
    // B-1：Markdown 链接外开——**校验在 Interface 层**（仅 http/https），此处只接系统浏览器（表现层）。
    // §17.12：同一窗口内与导航兜底共用去重闸，避免渲染侧与主进程双重外开。
    openExternalFn: (url) => {
      if (!navigationGuard.shouldOpenExternal(url)) return Promise.resolve();
      navigationGuard.markExternalOpen(url);
      return shell.openExternal(url);
    },
    // I-1：arm 的 (a) 层（项目角色经三层链、全部内置治理角色经审批档——见 session.ts）。未 arm 时为 undefined（等同不注入）。
    shellOperatorChannel,
    // 「替我审」（2026-10-17）：**同一实例**的开关状态机——通道读它、Interface 的 get/set 改它。
    shellJudgeSwitch,
    // 「替我决策」（2026-10-18）：**同一实例**的第二套开关——与 approval 互不影响。
    decisionJudgeSwitch,
    // I-1 补丁（2026-10-12 客户重发授权）：(c) 规则集实件（与 (a) 同处接线、同判据——两件同备才 arm）。
    // 同一份对象也供全部内置治理角色审批档（session.ts 对 `role.builtIn === true` 经 `shellOperatorOnly` 复用——单一来源，两档不漂移）。
    shellArming,
    // K-2：选图（**渲染进程不碰文件**）——系统文件选择器 + 读文件；字节交 Interface **按真实内容**校验
    // （类型嗅探/≤5MB 都在 interface 层；此处只读不判）。取消 → null（如实回 `cancelled`）。
    pickImageFileFn: async () => {
      const result = await dialog.showOpenDialog(win, {
        title: desktopTexts(mainI18n).pickImageDialogTitle,
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
  // —————— i18n B0（2026-10-23）：preferences:get / preferences:set-locale ——————
  // 成功切换后：更新窗口标题（新 locale）并广播 `preferences:locale-changed`。当前单窗口；
  // 遍历 BrowserWindow.getAllWindows() 为未来多窗口留好同一通道（多窗口联动本身不在 B0 验证）。
  // 推送/标题更新失败只记诊断，**不翻转已成功的持久化回执**（registerPreferencesIpc 只对 ok:true 调用）。
  registerPreferencesIpc(registerHandler, desktop, {
    onLocaleChanged: (locale) => {
      if (!win.isDestroyed()) {
        try {
          win.setTitle(desktopTexts(mainI18n).windowTitle);
        } catch (error) {
          mainDiagnostic.error("preferences.window-title.failed", error, { reasonCode: "set-title-failed" });
        }
      }
      for (const target of BrowserWindow.getAllWindows()) {
        if (target.isDestroyed()) continue;
        try {
          target.webContents.send("preferences:locale-changed", { locale });
        } catch (error) {
          mainDiagnostic.error("preferences.locale-changed.failed", error, { reasonCode: "send-failed" });
        }
      }
    },
  });
  desktop.startWatchdog(); // G-2/W1：看护周期 tick（默认 30s，仅 env 可调）——窗口注册后启动
  win.on("closed", () => {
    desktop.stopWatchdog(); // G-2/W1：窗关停 tick（看护绝不跨窗口残留）
    desktop.disposeProjectDocuments();
    void desktop.stopSession({ roleId: null }).catch((error) => mainDiagnostic.error("window.sessions.close.failed", error));
  });

  // 交互回包（A-5）：渲染侧提交决定 → 通道按**请求快照**校验（选项 id ⊆ 已发、单选恰一个、类型相符）
  // → 解挂为冻结三态；非法回包不受理（pending 保留，界面可重试失败后修正）。
  registerHandler("session:operator-response", (_e, input) =>
    customerChannel.respond(input && typeof input === "object" ? input : {}),
  );

  registerHandler("app:pick-project", () => desktop.pickProject());
  registerHandler("project:document-read", (_e, input) => desktop.readProjectDocument(input));
  registerHandler("report:retry-save", (_e, input) => desktop.retryReportSave(input));
  registerHandler("report:get-save-state", (_e, input) => desktop.getReportSaveState(input));
  registerHandler("delivery:retry-history-save", (_e, input) => desktop.retryDeliveryHistorySave(input));
  registerHandler("delivery:get-receipt", (_e, input) => desktop.getDeliveryReceipt(input));
  registerHandler("session:get-persistence", (_e, input) => desktop.getSessionPersistence(input));
  // 导入/重载后按每个角色及 runtime 读取 ANS 回放，推带三元身份的 session:history。
  // 原生上下文是否恢复另由会话 handle 的实际动态状态报告。
  // 防御式：解析失败/目录缺失**不阻断导入**（失败如实提示，不崩、不静默）。
  registerHandler("app:list-project", async (_e, input: { projectRoot: string }) => {
    const res = await desktop.listProject(input);
    if (recoveryProjectRoot !== res.projectRoot) recoveryRoleId = null;
    recoveryProjectRoot = res.projectRoot;
    const roles = Array.isArray(res && res.roles) ? res.roles.map((r) => r.roleId) : [];
    void pushSessionHistories(win, res.projectRoot, roles, desktop);
    return res;
  });
  // 点角色即开：一次调用直接建立会话（导入项目即授权，无确认框）。
  registerHandler("session:open", async (_e, input) => {
    const result = await desktop.openSession(input);
    if (result.ok && input.projectRoot === recoveryProjectRoot) { recoveryRoleId = input.roleId; recoveryRuntime = input.runtime; }
    return result;
  });
  registerHandler("session:send", (_e, input: Parameters<DesktopInterface["sendSession"]>[0]) => desktop.sendSession(input));
  registerHandler("session:stop", (_e, input) => desktop.stopSession(input));
  // P1-1（2026-10-13 客户裁定）：撤回未投递排队消息——Interface 如实回报（仅在队列中的客户消息可撤），主进程只透传。
  registerHandler("session:withdraw", (_e, input: { roleId: string; id: string }) => desktop.withdrawQueued(input));
  // P0-2（2026-10-13 客户批准）：停当前轮次——Interface 三态如实回传（已请求停止 / 不支持 / 失败），主进程只透传。
  registerHandler("session:abort", (_e, input: { roleId: string }) => desktop.abortSession(input));
  // B-2：保活会话列表（左树「有活动会话」小圆点的数据源）——纯读。
  registerHandler("session:live", () => desktop.listLiveSessions());
  registerHandler("session:live-views", () => desktop.listLiveSessionViews());
  registerHandler("session:role-states", () => desktop.requestRoleStates());
  registerHandler("session:history-get", (_event, input) => desktop.getSessionHistory(input));
  // —— 会话级后台任务（2026-10-25，桌面任务面板）：聚合列表 / 读日志 / 停止 ——
  // 渲染进程输入不可信：**来源校验在本 handler**（同 app:recovery-state 等既有模式）；参数校验与失败回执
  // 全在 Interface（返回 `{ok:false,...}` 而不是抛）。任务只存在于各会话内存——不缓存、不持久化、不伪造。
  registerHandler("background-tasks:list", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.listBackgroundTasks(input);
  });
  registerHandler("background-tasks:read", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.readBackgroundTask(input);
  });
  registerHandler("background-tasks:stop", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.stopBackgroundTask(input);
  });
  // E 批：任务/运行日志/收口/终止重派（来源校验同后台任务；参数校验/执行在 Interface）。
  registerHandler("tasks:list", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.listTasks(input);
  });
  registerHandler("tasks:restore", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.restoreTasks(input);
  });
  registerHandler("roles:activity-log", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.readRoleActivityLog(input);
  });
  registerHandler("roles:terminate", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.terminateRoleRun(input);
  });
  registerHandler("tasks:redispatch", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.redispatchTask(input);
  });
  registerHandler("tasks:close", (event, input) => {
    if (event.sender !== win.webContents) return { ok: false, error: "请求来源无效。" };
    return desktop.closeTask(input);
  });
  // B-1：Markdown 链接外开——渲染进程输入经 Interface 校验（仅 http/https）后交系统浏览器。
  registerHandler("app:open-external", (_e, input) => desktop.openExternal(input));
  // K-2：输入区图片——选图（主进程读文件）与粘贴/拖入字节校验（渲染进程不碰文件）；
  // P0-1（2026-10-13 客户批准）：图片已随消息端到端送进模型（session:send 带载荷，Interface 真实字节重校验）。
  registerHandler("app:pick-image", () => desktop.pickImage());
  registerHandler("app:attach-image", (_e, input) => desktop.attachImage(input));
  // （A-5：随「收口」删除——产物收尾现由编排在 su 会话 settle 后**自动**完成；桌面不再有
  //   「完成 bootstrap」的读状态/显式触发两个 IPC；客户确认已改由交互卡承担。）

  // generic 运行时设置及旧 Pi aliases：Interface 消费共享 registry，并用共享 env-file 原子写。
  // secret 值恒空，成功保存才变 revision；忙 Pi 凭据在安全点应用。主进程只透传。
  registerHandler("runtime-config:get", (_event, input) => desktop.getRuntimeConfig(input?.runtime));
  registerHandler("runtime-config:save", (_event, input) => desktop.saveRuntimeConfig(input));
  registerHandler("pi-config:get", () => desktop.getPiConfig());
  registerHandler("pi-config:save", (_e, input: { updates: Record<string, string> }) => desktop.savePiConfig(input));

  // —— 自绘标题栏的窗口控制（客户要求：去掉原生标题栏，自绘一条）——
  // 渲染侧右侧三个按钮经这些通道驱动窗口本体。**只做窗口操作、不含任何治理判定**（与本角色硬约束无关，
  // 不涉及边界/写权）。最大化/还原状态经 `window:maximized-changed` 反向外推，令按钮图标随之切换。
  registerHandler("window:minimize", () => {
    if (!win.isDestroyed()) win.minimize();
  });
  registerHandler("window:toggle-maximize", () => {
    if (win.isDestroyed()) return false;
    // 返回**目标**态（而非查询），避免 `maximize()` 的异步时序导致读到旧值；真实态由下方事件兜底。
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  registerHandler("window:close", () => {
    if (!win.isDestroyed()) win.close();
  });
  registerHandler("window:is-maximized", () => (win.isDestroyed() ? false : win.isMaximized()));
  // 最大化/还原 → 推给渲染侧（按钮图标在「还原态」与「最大化态」间切换）。
  win.on("maximize", () => {
    if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", true);
  });
  win.on("unmaximize", () => {
    if (!win.isDestroyed()) win.webContents.send("window:maximized-changed", false);
  });

  // —— 操作者通道 (a)：**I-1 已 arm** ——
  void loadInterface();
  // 构造与注入已在上方（`shellOperatorChannel` → `createDesktopInterface`）完成：arm 后 (a) 通道经会话构造
  // 路径交给**编排**——项目角色装配三层链 `ShellGate`；全部内置治理角色（`role.builtIn === true`）装配
  // **审批档**（同一份 (c) 实件经 `shellOperatorOnly`）。Pi 适配器据此注册 `run_shell`。
  // fail-closed 三条（关窗/取消/拒绝/超时/抛错 → 不放行）见 `app/desktop/operator-channel.ts`。
}

app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    app.dock?.setIcon(APP_ICON_PATH);
  }
  configureDiagnostics({ directory: path.join(app.getPath("userData"), "ans", "diagnostics") });
  mainDiagnostic.record("app.start", { pid: process.pid });
  // 去掉默认菜单栏（那条「文件 / 编辑 / View / …」）——客户要求自绘标题栏、不要原生 chrome。
  // 这条菜单栏就是 Electron 的默认 application menu；置 null 即整条移除（Windows 上各窗口随之无菜单栏）。
  // **快捷键评估**：文本编辑类快捷键（Ctrl+C/V/X/A、撤销）由 Chromium **原生**处理，不经菜单加速键，故不受影响；
  // 被移除的只是默认菜单提供的加速键（Ctrl+R 重载、Ctrl+Shift+I 开发者工具、Ctrl+Q 退出等）。
  // 本应用是极简聊天工具，这些**并非必要**，故**不补回任何加速键**（更不把菜单栏加回来）。
  Menu.setApplicationMenu(null);
  // Resolve once after Electron initialization; package resources are never the settings write target.
  const userDataPath = app.getPath("userData");
  if (app.isPackaged) await fs.promises.mkdir(userDataPath, { recursive: true, mode: 0o700 });
  // i18n B0（2026-10-23）：建窗前**尽早**读取应用级语言偏好（`<userData>/ans/preferences.json`）。
  // 缺失 ⇒ zh-CN 且**不写文件**；损坏/不可读/非法 locale/未知 version ⇒ zh-CN + 稳定诊断，不阻塞启动。
  preferencesPath = preferencesFilePath(userDataPath);
  const preferencesRead = await readPreferences(preferencesPath);
  mainI18n.setLocale(preferencesRead.locale);
  for (const diagnostic of preferencesRead.diagnostics) {
    mainDiagnostic.record(diagnostic.code, {
      reasonCode: diagnostic.reasonCode,
      ...(diagnostic.errorCode !== undefined ? { errorCode: diagnostic.errorCode } : {}),
    });
  }
  desktopEnvPath = resolveDesktopEnvPath({ isPackaged: app.isPackaged, userDataPath });
  await loadDesktopEnv(desktopEnvPath);
  // Phase 5A（PM §17.3）：smoke-only 入口覆盖——必须位于包内 app/renderer/dist/ 且为 .html。
  if (smokeRequest?.rendererEntryPath !== undefined) {
    try {
      activeProductionRendererEntry = validateSmokeRendererEntry(smokeRequest.rendererEntryPath, app.getAppPath());
    } catch (error) {
      mainDiagnostic.error("app.smoke.entry.invalid", error);
      app.exit(1);
      return;
    }
  }
  const firstWindow = createWindow();
  mainWindow = firstWindow;
  // 冒烟证据：在首屏加载前挂监听，记录 error 级控制台与主帧加载失败（只读，不改变窗口行为）。
  const smokeConsoleErrors: string[] = [];
  const smokeLoadFailures: Array<{ errorCode: number; url: string }> = [];
  if (smokeRequest) {
    firstWindow.webContents.on("console-message", (_event, detailsOrLevel: unknown, legacyMessage?: unknown) => {
      let level: unknown = detailsOrLevel;
      let message: unknown = legacyMessage;
      if (detailsOrLevel && typeof detailsOrLevel === "object") {
        const details = detailsOrLevel as { level?: unknown; message?: unknown };
        level = details.level;
        message = details.message;
      }
      const isError = level === "error" || level === 3;
      if (isError) smokeConsoleErrors.push(typeof message === "string" ? message.slice(0, 1024) : String(message));
    });
    firstWindow.webContents.on("did-fail-load", (_event, errorCode, _description, url, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) smokeLoadFailures.push({ errorCode, url });
    });
  }
  registerIpc(firstWindow);
  if (smokeRequest) {
    const smokeWindow = firstWindow;
    const expectedEntryUrl = pathToFileURL(activeProductionRendererEntry).href;
    smokeWindow.webContents.once("did-finish-load", () => {
      void (async () => {
        let result: Record<string, unknown> = { ok: false, isPackaged: app.isPackaged, arch: process.arch, platform: process.platform, version: app.getVersion(), envPath: desktopEnvPath, expectedEntry: expectedEntryUrl };
        try {
          const observed = await smokeWindow.webContents.executeJavaScript(packagedSmokeScript(desktopEnvPath!, expectedEntryUrl)) as { checks: Record<string, boolean>; missingKeys: Record<string, string[]>; entryUrl?: string };
          const checks = { ...observed.checks, console: smokeConsoleErrors.length === 0, load: smokeLoadFailures.length === 0 };
          result = { ...result, ...observed, checks, consoleErrors: smokeConsoleErrors, loadFailures: smokeLoadFailures, ok: app.isPackaged && Object.values(checks).every(value => value === true) };
        } catch { result = { ...result, error: "Packaged window/preload/IPC verification failed." }; }
        try { await fs.promises.writeFile(smokeRequest.resultPath, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 }); }
        catch { app.exit(1); return; }
        app.exit(result.ok === true ? 0 : 1);
      })();
    });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      registerIpc(mainWindow);
    }
  });
}).catch((error) => {
  mainDiagnostic.error("app.start.failed", error);
  // 启动早期错误框：使用已读取的持久化 locale；读不到/尚未读取时 mainI18n 保持 zh-CN。
  const startupText = desktopTexts(mainI18n);
  dialog.showErrorBox(startupText.startupErrorTitle, startupText.startupErrorDetail);
});

process.on("uncaughtExceptionMonitor", (error) => mainDiagnostic.error("app.uncaught-exception", error));
process.on("unhandledRejection", (error) => {
  mainDiagnostic.error("app.unhandled-rejection", error);
  showMainFailure?.(); // 明确显示故障，不把被拒绝的业务当成功或自动重发。
});
let diagnosticsFlushed = false;
app.on("before-quit", (event) => {
  if (diagnosticsFlushed) return;
  event.preventDefault();
  mainDiagnostic.record("app.quit");
  void flushDiagnostics().then(() => disposeDiagnostics()).finally(() => {
    diagnosticsFlushed = true;
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// iface 供内部保留引用；此处不对外导出（避免误当公共 API）。
void iface;

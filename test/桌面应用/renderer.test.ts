// test/桌面应用/renderer.test.ts
// 渲染进程源码的不变式守卫（写入语义；客户 2026-10-11 裁定：去掉运行时选择器、默认跑 pi）。
//
// 为何用源码断言而非 DOM 断言：renderer.js 是纯浏览器脚本（IIFE，依赖 window.desktop），
// 无法在 node 下直接 import；DOM 行为由 e2e（真实 Electron）覆盖。此处只钉住**文本/结构不变式**——
// 「桌面一律 pi：写入真实落到导入项目、但受角色边界约束」与「界面不再有运行时选择器」的落地证据。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, "..", "..", "app", "renderer");
const RENDERER = fs.readFileSync(path.join(APP_DIR, "renderer.js"), "utf8");
const INDEX = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");
const STYLES = fs.readFileSync(path.join(APP_DIR, "styles.css"), "utf8");
// 刷新通道的两端（preload 桥 + 主进程发送点）——一并守卫，防单侧回退。
const PRELOAD = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "preload.cjs"), "utf8");
const MAIN = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "main.ts"), "utf8");

// 去掉 // 行注释与 /* */ 块注释后的代码（用于「不得硬编码」这类断言，避免注释里的示例字面量误伤）。
const RENDERER_CODE = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("写入语义（桌面一律 pi）：明示写入真实落到导入项目，但受角色边界约束（越界写被拒）", () => {
  assert.ok(RENDERER.includes("写入会真正落到你导入的项目"), "pi 文案须明示写入被导入项目");
  assert.ok(RENDERER.includes("受该角色边界约束"), "pi 文案须明示受角色边界约束");
  assert.ok(RENDERER.includes("越界写会在写之前被拒"), "pi 文案须明示越界写在写之前被拒（受边界约束）");
  // 去掉选择器后不再有 demo 运行时文案（「只判不写」仅 demo 路径成立）。
  assert.ok(!RENDERER.includes("演示运行时（demo）"), "不得再出现 demo 运行时文案");
  assert.ok(!RENDERER.includes("不会落盘"), "不得再出现「不会落盘」（demo 专有语义）");
});

test("界面不再有运行时选择器（客户 2026-10-11 裁定：默认跑 pi）——断言「它不存在」", () => {
  // 选择器相关 DOM/事件/样式已清干净，且留守卫（断言不存在，防止回潮）。
  assert.ok(!INDEX.includes('id="inp-runtime"'), "index.html 不得再有运行时选择器 #inp-runtime");
  assert.ok(!INDEX.includes("rt-select"), "index.html 不得再有 .rt-select");
  assert.ok(!RENDERER.includes("inp-runtime"), "renderer.js 不得再引用 #inp-runtime");
  assert.ok(!STYLES.includes(".rt-select") && !STYLES.includes(".rt-label"), "styles.css 不得再有选择器样式");
  // demo/pi 两套内联写入样式钩子随之退役。
  assert.ok(!STYLES.includes(".sys-nowrite") && !STYLES.includes(".sys-write"), "demo/pi 两套内联写入样式应已退役");
  // 写入语义上移到中栏横栏（常驻、单一来源 #runtime-note）。
  assert.ok(INDEX.includes('id="runtime-note"'), "index.html 应含横栏写入语义 #runtime-note");
  assert.ok(RENDERER.includes('$("runtime-note")'), "renderer.js 应写入横栏写入语义 #runtime-note");
  assert.ok(STYLES.includes(".runtime-note"), "styles.css 应有 .runtime-note 样式");
  assert.ok(STYLES.includes(".chat-head-notes"), "styles.css 应有横栏提示区 .chat-head-notes");
  // 会话一律以 pi 发起（renderer 不再读选择器值）。
  assert.ok(RENDERER.includes('runtime: "pi"'), "renderer 开会话时应以 pi 发起");
});

test("不再有一概而论的「V1 桌面：只判不写」（该说法仅 demo 路径成立）", () => {
  assert.ok(!RENDERER.includes("V1 桌面：只判不写"), "renderer.js 不得再出现「V1 桌面：只判不写」");
  assert.ok(!INDEX.includes("V1 桌面：只判不写"), "index.html 不得再出现「V1 桌面：只判不写」");
  assert.ok(!STYLES.includes("V1 桌面：只判不写"), "styles.css 不得再出现「V1 桌面：只判不写」");
});

test("生效配置来源如实呈现（T13）：.ans 不可用/缺 pin → 内联明示「未授权」，绝不静默", () => {
  // 只在未授权（ans-invalid 或 accepted=false）时呈现——不把「未接受」当「已授权」。
  assert.ok(RENDERER.includes("appendConfigNote"), "渲染进程应有 appendConfigNote（如实呈现 .ans 加载结果）");
  assert.ok(RENDERER.includes("res.config.kind === \"ans-invalid\""), "应按 config.kind 判定是否呈现");
  assert.ok(RENDERER.includes("!res.config.accepted"), "应按 config.accepted 呈现未授权态");
  assert.ok(RENDERER.includes("这不是已授权状态"), "文案须明示「不是已授权状态」");
  assert.ok(RENDERER.includes("不会回退到「导入即授权」"), "文案须明示不回退运行期同意");
  assert.ok(STYLES.includes(".sys-config"), "styles.css 应有 .sys-config 样式钩子");
});

// ————————————————— T17：su 主位 / 未-bootstrap 状态 / 左树刷新 —————————————————

test("T17：su 主位/默认选中由 listProject 的 primaryRoleId 驱动（渲染侧不硬编码 \"su\"）", () => {
  assert.ok(RENDERER.includes("primaryRoleId"), "渲染侧应持有/读取 primaryRoleId");
  assert.ok(RENDERER.includes("res.primaryRoleId"), "应从 listProject 结果读取 primaryRoleId");
  assert.ok(
    RENDERER.includes("state.selectedRoleId = state.primaryRoleId"),
    "导入后应默认选中主入口角色（primaryRoleId 驱动，而非硬编码）",
  );
  // 代码（去注释后）中不得出现硬编码的主入口角色字面量 "su"。
  assert.ok(!RENDERER_CODE.includes('"su"'), 'renderer.js 代码中不得硬编码 "su"');
  assert.ok(!RENDERER_CODE.includes("'su'"), "renderer.js 代码中不得硬编码 'su'");
  assert.ok(!/primaryRoleId\s*[:=]\s*["']su["']/.test(RENDERER_CODE), "不得把 primaryRoleId 硬编码为 su");
});

test("T17：未-bootstrap 状态据 hasRoles===false 显示（客户裁定：此事只说一遍，且只在中栏正中）", () => {
  assert.ok(RENDERER.includes("state.hasRoles"), "渲染侧应持有 hasRoles");
  assert.ok(RENDERER.includes("res.hasRoles"), "应从 listProject 结果读取 hasRoles");
  assert.ok(RENDERER.includes("项目尚未 bootstrap"), "中栏正中空状态标题应含「项目尚未 bootstrap」");
  // 收敛（客户：同一件事曾在横栏/中栏/左栏说过三遍）：这句话在整份渲染源码里**只出现一次**。
  const mentions = RENDERER.split("项目尚未 bootstrap").length - 1;
  assert.equal(mentions, 1, "「项目尚未 bootstrap」在渲染源码里应只出现一次（中栏正中空状态）");
  // 横栏第二行（#composer-hint 状态提示）不再重复它——未 bootstrap 时留空，横栏只留写入语义。
  assert.ok(
    RENDERER.includes('setHint(state.hasRoles === false ? ""'),
    "未 bootstrap 时横栏状态提示应为空（不再重复该句）",
  );
  // 左栏那块独立提示（#bootstrap-notice / renderBootstrapNotice / .bootstrap-notice）已清掉——断言「它不在」。
  assert.ok(!RENDERER.includes("renderBootstrapNotice"), "renderer.js 不得再有 renderBootstrapNotice（左栏提示已清）");
  assert.ok(!RENDERER.includes('"bootstrap-notice"'), "renderer.js 不得再引用 #bootstrap-notice");
  assert.ok(!INDEX.includes('id="bootstrap-notice"'), "index.html 不得再有 #bootstrap-notice 元素");
  assert.ok(!INDEX.includes("bootstrap-notice"), "index.html 不得再出现 bootstrap-notice");
  assert.ok(!STYLES.includes(".bootstrap-notice"), "styles.css 不得再有 .bootstrap-notice 样式");
});

test("T17：左树可刷新——订阅 project:changed 重取枚举；主入口/次级分组与主 CTA 齐备", () => {
  // 渲染侧订阅 + 重取。
  assert.ok(RENDERER.includes("onProjectChanged"), "渲染侧应订阅 project:changed");
  assert.ok(RENDERER.includes("refreshProject"), "应有 refreshProject 重取枚举");
  // 刷新通道两端。
  assert.ok(PRELOAD.includes("onProjectChanged") && PRELOAD.includes("project:changed"), "preload 应暴露 project:changed 订阅");
  assert.ok(MAIN.includes('send("project:changed")'), "主进程应在项目可能已变时推 project:changed");
  // 左树分组（主入口置顶 + 次级分组）。
  assert.ok(RENDERER.includes("主入口"), "左树应有「主入口」分组/徽标");
  assert.ok(RENDERER.includes("其他角色（查看/调试）"), "左树应有次级角色分组");
  // 空聊天区主 CTA。
  assert.ok(RENDERER.includes("btn-start-primary"), "空聊天区应有主 CTA 按钮");
  assert.ok(RENDERER.includes("开始与 "), "主 CTA 文案应为「开始与 <主入口> 对话」");
  assert.ok(STYLES.includes(".btn-start"), "styles.css 应有主 CTA 样式 .btn-start");
});

// ————————————————— T20：回交（§10.8）呈现与镜像进 su —————————————————

test("T20：handback 事件被呈现为「回交 su」卡片；su 会话开着时镜像为「来自 <role> 的报告」", () => {
  // 按 kind 分支：handback 走 appendHandback（不落入 message/tool_call/accepted/denied 等既有分支）。
  assert.ok(RENDERER.includes('kind === "handback"'), "appendEvent 应按 kind===handback 分支");
  assert.ok(RENDERER.includes("appendHandback"), "应有 appendHandback 呈现回交卡片");
  assert.ok(RENDERER.includes("handbackTarget"), "应有 handbackTarget 判定回交归属（自己的聊天 / 镜像进 su）");
  // 卡片标题（自己聊天）「回交 su」；镜像标题「来自 <role> 的报告」。
  assert.ok(RENDERER.includes("回交 su"), "卡片标题应为「回交 su」");
  assert.ok(RENDERER.includes("来自 "), "镜像标题应为「来自 <role> 的报告」");
  assert.ok(RENDERER.includes("的报告"), "镜像标题应含「的报告」");
  // 镜像条件：当前打开会话是**产出它的角色**（自己的聊天）或**主入口角色**（镜像）——读 primaryRoleId，不硬编码。
  assert.ok(RENDERER.includes("state.sessionOpenRoleId"), "应读当前打开的会话角色");
  assert.ok(RENDERER.includes("state.primaryRoleId"), "镜像条件应读 primaryRoleId（不硬编码角色名）");
  assert.ok(RENDERER.includes("is-mirror"), "镜像卡片应有 is-mirror 类钩子");
  // 结论标签：completed / blocked 两态（只呈现编排给的 status，不作判定）。
  assert.ok(RENDERER.includes("已完成") && RENDERER.includes("被拦下"), "应呈现 completed/blocked 两种结论");
  // 证据列表（只搬证据）。
  assert.ok(RENDERER.includes("hb-evidence") && RENDERER.includes("hb-ev"), "应呈现证据列表（只搬产物证据）");
  // 样式钩子（纯 CSS，无外部依赖）。
  assert.ok(STYLES.includes(".msg-handback"), "styles.css 应有 .msg-handback 卡片样式");
  assert.ok(STYLES.includes(".is-mirror"), "styles.css 应有 .is-mirror 镜像区分样式");
});

// ————————————————— T28：Pi 配置面板（设计 §11） —————————————————

test("T28：Pi 配置面板存在——5 项字段、token 为掩码（password）、保存/切换展开齐备", () => {
  // 面板容器与 5 个字段（键名与 pi-config 的 PI_PANEL_KEYS 一致）。
  assert.ok(INDEX.includes('id="pi-panel"'), "index.html 应有 Pi 配置面板 #pi-panel");
  for (const key of ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_BASE_URL", "ANS_PI_MODEL", "ANS_PI_PROVIDER", "ANS_PI_CONTEXT_WINDOW"]) {
    assert.ok(INDEX.includes('id="pi-inp-' + key + '"'), "应有字段 #pi-inp-" + key);
  }
  assert.ok(INDEX.includes('id="btn-pi-settings"'), "应有「Pi 设置」按钮");
  assert.ok(INDEX.includes('id="pi-save"'), "应有保存按钮 #pi-save");
  // token 字段默认掩码（type=password）——值以掩码显示、默认不回显。
  assert.ok(/id="pi-inp-ANTHROPIC_AUTH_TOKEN"[^>]*type="password"/.test(INDEX), "token 字段应为 password 掩码");
  // 呈现逻辑：读/存经 window.desktop（主进程掩码/读写，单一来源）；不作判定。
  assert.ok(RENDERER.includes("d.getPiConfig") && RENDERER.includes("d.savePiConfig"), "渲染侧应经 d.getPiConfig/d.savePiConfig");
  assert.ok(RENDERER.includes("openPiPanel") && RENDERER.includes("savePiConfigFromForm"), "应有展开/保存逻辑");
  // 「Pi 设置」入口在横栏右侧（客户 2026-10-11 裁定：随运行时选择器移除，入口上移到中栏横栏）。
  assert.ok(RENDERER.includes("togglePiPanel"), "点「Pi 设置」应切换面板展开/收起");
  assert.ok(INDEX.indexOf('id="btn-pi-settings"') > INDEX.indexOf('class="chat-head"'), "「Pi 设置」入口应移到中栏横栏（在 chat-head 之内/之后）");
  // preload 桥两端 + 主进程 IPC 通道齐备。
  assert.ok(PRELOAD.includes("getPiConfig") && PRELOAD.includes("savePiConfig"), "preload 应暴露 getPiConfig/savePiConfig");
  assert.ok(MAIN.includes("pi-config:get") && MAIN.includes("pi-config:save"), "主进程应注册 pi-config IPC 通道");
  // 启动载入 .env（补 --env-file）。
  assert.ok(MAIN.includes("loadEnvFileInto"), "主进程启动应用 loadEnvFileInto(process.env, .env) 补 --env-file");
  // 样式钩子。
  assert.ok(STYLES.includes(".pi-panel") && STYLES.includes(".pi-input") && STYLES.includes(".pi-status"), "styles.css 应有面板样式");
});

// ————————————————— T36：创世 finalize「完成 bootstrap」入口 —————————————————

test("T36：「完成 bootstrap」入口——可见性据 available、就绪据 settled；触发 finalize 且如实呈现结果", () => {
  // 入口状态从主进程读（渲染侧**不自行判定**）——available 决定是否显示、settled 提示「该不该现在点」。
  assert.ok(RENDERER.includes("refreshBootstrapAction"), "应有 refreshBootstrapAction（查询入口状态并渲染）");
  assert.ok(RENDERER.includes("d.getBootstrapState"), "渲染侧应经 d.getBootstrapState 读入口状态（不自行判定）");
  assert.ok(RENDERER.includes("st.available"), "应按 available 决定入口是否显示");
  assert.ok(RENDERER.includes("st.settled"), "应据 settled 提示「该不该现在点」");
  assert.ok(RENDERER.includes("还没有完成任何一轮"), "未 settle 时文案应提示现在点会被拒");
  // 显式触发（不自动跑）。
  assert.ok(RENDERER.includes("btn-finalize"), "应有「完成 bootstrap」按钮");
  assert.ok(RENDERER.includes("d.finalizeBootstrap"), "按钮应显式调用 d.finalizeBootstrap（不自动跑）");
  // 结果如实：成功示 wrote/pins/roles；被拒示 reason（不假装成功）。
  assert.ok(RENDERER.includes("appendFinalizeResult"), "应有 appendFinalizeResult 如实呈现结果");
  assert.ok(RENDERER.includes("is-ok") && RENDERER.includes("is-denied"), "成功/被拒应有区分态");
  assert.ok(RENDERER.includes("被拒"), "被拒文案应点明「被拒」");
  assert.ok(RENDERER.includes("res.wrote") && RENDERER.includes("res.pins") && RENDERER.includes("res.roles"), "成功应呈现 wrote/pins/roles");
  assert.ok(RENDERER.includes("res.reason"), "被拒应呈现 reason（如实原因）");
  // 容器与样式钩子。
  assert.ok(INDEX.includes('id="bootstrap-action"'), "index.html 应含 #bootstrap-action 容器");
  assert.ok(STYLES.includes(".bootstrap-action"), "styles.css 应有 .bootstrap-action 样式");
  assert.ok(STYLES.includes(".sys-finalize"), "styles.css 应有 .sys-finalize 结果样式");
  // 通道两端齐备（preload 桥 + 主进程 IPC）。
  assert.ok(PRELOAD.includes("getBootstrapState") && PRELOAD.includes("finalizeBootstrap"), "preload 应暴露 getBootstrapState/finalizeBootstrap");
  assert.ok(MAIN.includes("session:bootstrap-state") && MAIN.includes("session:finalize"), "主进程应注册 session:bootstrap-state / session:finalize");
});

// ————————————————— 自绘标题栏（客户要求：去掉原生标题栏与默认菜单栏） —————————————————

test("自绘标题栏：窗口无边框 + 去掉默认菜单栏（断言「它不在」）", () => {
  // `frame: false` = 无边框（去掉 OS 标题栏）；`resizable` 不动（默认 true）⇒ Windows 上缩放边框仍在。
  assert.ok(MAIN.includes("frame: false"), "main.ts 的 BrowserWindow 应为无边框（frame: false）");
  assert.ok(!MAIN.includes("resizable: false") && !MAIN.includes("resizable:false"), "不得关掉 resizable（那会弄丢缩放边框）");
  // 默认菜单栏（那条「文件/编辑/View…」）被移除——断言「它不在」。
  assert.ok(MAIN.includes("Menu.setApplicationMenu(null)"), "main.ts 应去掉默认菜单栏（Menu.setApplicationMenu(null)）");
});

test("自绘标题栏：三个窗口按钮经 IPC 接主进程（最小化 / 最大化-还原 / 关闭）", () => {
  // 主进程 IPC 通道（含最大化态外推）。
  for (const ch of ["window:minimize", "window:toggle-maximize", "window:close", "window:is-maximized", "window:maximized-changed"]) {
    assert.ok(MAIN.includes(ch), "主进程应注册/外推 " + ch);
  }
  // preload 白名单桥（不暴露任何 Node 能力）。
  for (const fn of ["minimizeWindow", "toggleMaximize", "closeWindow", "isMaximized", "onMaximizedChanged"]) {
    assert.ok(PRELOAD.includes(fn), "preload 应暴露 " + fn);
  }
  // 渲染侧：标题栏容器 + 三个按钮（各有 id）。
  assert.ok(INDEX.includes('id="titlebar"'), "index.html 应有自绘标题栏 #titlebar");
  assert.ok(INDEX.includes('id="win-min"') && INDEX.includes('id="win-max"') && INDEX.includes('id="win-close"'), "应有最小化/最大化/关闭三个按钮");
  // 渲染侧把三个按钮接到 preload 方法，并据最大化态切换图标（还原态 vs 最大化态）。
  assert.ok(RENDERER.includes("minimizeWindow") && RENDERER.includes("toggleMaximize") && RENDERER.includes("closeWindow"), "渲染侧应把三个按钮接到 preload 方法");
  assert.ok(RENDERER.includes("setMaximizedUI") && RENDERER.includes("is-maximized"), "渲染侧应据最大化态切换按钮图标");
  // 样式：标题栏为拖动区、按钮为 no-drag（否则点不动）；关闭按钮用克制的中性/语义提示，非红块。
  assert.ok(STYLES.includes("-webkit-app-region: drag"), "标题栏应为拖动区（-webkit-app-region: drag）");
  assert.ok(STYLES.includes("-webkit-app-region: no-drag"), "窗口按钮应为 no-drag（否则点不动）");
  assert.ok(STYLES.includes(".win-btn-close"), "应有关闭按钮样式（克制的中性/语义提示）");
  // 双击最大化：**不**挂 dblclick（由 Windows 原生在拖动区/ HTCAPTION 上处理，叠加会变成双击无反应）。
  assert.ok(!RENDERER.includes('addEventListener("dblclick"'), "渲染侧不得挂 dblclick（会与原生双击最大化叠加）");
  // 应用标识只在标题栏一份：左栏不再重复堆砌品牌。
  assert.ok(!INDEX.includes("brand-mark") && !INDEX.includes("brand-sub"), "左栏不应再重复堆砌品牌标识（已上移到标题栏）");
  assert.ok(STYLES.includes(".titlebar") && STYLES.includes(".win-btn"), "styles.css 应有标题栏与窗口按钮样式");
});

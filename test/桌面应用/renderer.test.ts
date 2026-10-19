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
const RUNTIME_UI = fs.readFileSync(path.join(APP_DIR, "runtime-ui.js"), "utf8");
const INDEX = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");
const STYLES = fs.readFileSync(path.join(APP_DIR, "styles.css"), "utf8");
// 刷新通道的两端（preload 桥 + 主进程发送点）——一并守卫，防单侧回退。
const PRELOAD = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "preload.cjs"), "utf8");
const MAIN = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "main.ts"), "utf8");

// 预览渲染的行为面：装载与 index.html 同序的 Markdown 管线（vendor → markdown.js），
// 只做纯函数断言（DOM 折叠行为仍由 e2e 覆盖）。Markdown 的 XSS/配置钉子见 markdown.test.ts。
await import(new URL("../../app/renderer/vendor/markdown-it.umd.min.js", import.meta.url).href);
await import(new URL("../../app/renderer/markdown.js", import.meta.url).href);
const Md = (globalThis as Record<string, unknown>).ANSMarkdown as { renderMarkdown: (s: unknown) => string };
assert.ok(Md && typeof Md.renderMarkdown === "function", "markdown.js 应挂 globalThis.ANSMarkdown（renderMarkdown）");

// 去掉 // 行注释与 /* */ 块注释后的代码（用于「不得硬编码」这类断言，避免注释里的示例字面量误伤）。
const RENDERER_CODE = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
// P5 自动判断段的源码切片（`// @shell-judge-start` … `// @shell-judge-end`）——用于钉住
// 「不自动开会话 / 不写持久化 / 不动已挂起卡」等边界（只看该段，不误伤文件其它历史功能）。
const SHELL_JUDGE_CODE = (() => {
  const start = RENDERER.indexOf("// @shell-judge-start");
  const end = RENDERER.indexOf("// @shell-judge-end");
  return start >= 0 && end > start ? RENDERER.slice(start, end) : "";
})();
// 「无计时器」纪律的唯一例外（客户 2026-10-18 要求一次性开启警告约 8–10 秒自动消失）：
// 检查其余渲染代码的计时器时剔除自动判断段——卡片等待/抽屉/滚动仍不得自造计时器。
const RENDERER_CODE_NO_JUDGE = (() => {
  const start = RENDERER.indexOf("// @shell-judge-start");
  const end = RENDERER.indexOf("// @shell-judge-end");
  const without = start >= 0 && end > start ? RENDERER.slice(0, start) + RENDERER.slice(end) : RENDERER;
  return without.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
})();

test("写入语义（桌面一律 pi）：明示写入真实落到导入项目，但受角色边界约束（越界写被拒）", () => {
  assert.ok(RENDERER.includes("实际写入导入项目"), "pi 文案须明示写入被导入项目");
  assert.ok(RENDERER.includes("角色边界外的写入会被拒绝"), "pi 文案须明示受角色边界约束");
  assert.ok(RENDERER.includes("角色边界外的写入会被拒绝"), "pi 文案须明示越界写在写之前被拒（受边界约束）");
  // 去掉选择器后不再有 demo 运行时文案（「只判不写」仅 demo 路径成立）。
  assert.ok(!RENDERER.includes("演示运行时（demo）"), "不得再出现 demo 运行时文案");
  assert.ok(!RENDERER.includes("不会落盘"), "不得再出现「不会落盘」（demo 专有语义）");
});

test("V2r1：真实 Pi/Codex/Claude 可选，保留单一写入语义和退役 DOM 守卫", () => {
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
  // 会话以当前选中的真实引擎发起（renderer 不再读选择器静态值）。
  assert.ok(INDEX.includes('id="runtime-select"'), "新真实引擎选择入口存在");
  for (const runtime of ["pi", "codex", "claude"]) assert.ok(INDEX.includes('data-runtime="' + runtime + '"'), "真实引擎选项：" + runtime);
  assert.ok(RENDERER.includes("runtime: runtime"), "openSession 传本次捕获的所选引擎");
});

test("默认引擎为 Claude：JS 初始 state 与 index.html 静态初始态一致，选项顺序不变", () => {
  // 2026-10-17 客户指令：默认选择 Claude（唯一改动是默认值；显式/已保存 runtime 仍按原值）。
  assert.ok(/var state = \{[\s\S]{0,200}?runtime: "claude"/.test(RENDERER), "renderer.js 初始 state.runtime 应为 claude");
  assert.ok(!/var state = \{[\s\S]{0,200}?runtime: "pi"/.test(RENDERER), "renderer.js 初始 state.runtime 不得再为 pi");
  // 静态初始态与 JS 初始态一致（首帧不闪）。
  assert.ok(/id="runtime-select"[^>]*aria-label="会话引擎，当前 Claude"/.test(INDEX), "combobox 可访问名应为当前 Claude");
  assert.ok(INDEX.includes('<span class="engine-value">Claude</span>'), "触发器显示 Claude");
  assert.ok(/id="runtime-option-pi"[^>]*aria-selected="false"/.test(INDEX), "Pi 选项静态非选中");
  assert.ok(/id="runtime-option-claude"[^>]*aria-selected="true"/.test(INDEX), "Claude 选项静态选中");
  assert.ok(INDEX.includes("未选择角色 / Claude"), "输入区范围静态文案跟随默认引擎");
  // 只改默认值：选项顺序仍为 Pi / Codex / Claude，不重排。
  const pi = INDEX.indexOf('data-runtime="pi"'), codex = INDEX.indexOf('data-runtime="codex"'), claude = INDEX.indexOf('data-runtime="claude"');
  assert.ok(pi >= 0 && codex >= 0 && claude >= 0 && pi < codex && codex < claude, "引擎选项顺序必须保持 Pi / Codex / Claude");
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
  // 左树分组（主入口置顶 + 次级分组）。2026-10-19 取消折叠后，次级分组标题仍由 `Rt.roleGroups`
  // 单一来源给出（无分组默认标签「工作角色」在 runtime-ui.js），渲染侧不自持第二份可见文案。
  assert.ok(RENDERER.includes("主入口"), "左树应有「主入口」分组/徽标");
  assert.ok(RENDERER.includes("Rt.roleGroups(others)") && RUNTIME_UI.includes("工作角色"), "左树应有次级角色分组（默认标签「工作角色」来自 roleGroups 单一来源）");
  // 空聊天区主 CTA。
  assert.ok(RENDERER.includes("btn-start-primary"), "空聊天区应有主 CTA 按钮");
  assert.ok(RENDERER.includes("开始与 "), "主 CTA 文案应为「开始与 <主入口> 对话」");
  assert.ok(STYLES.includes(".btn-start"), "styles.css 应有主 CTA 样式 .btn-start");
});

// ————————————————— T20：回交（§10.8）呈现与镜像进 su —————————————————

test("T20：来源角色保留报告，主入口不提前镜像，真实投递默认折叠", () => {
  // 按 kind 分支：handback 走 appendHandback（不落入 message/tool_call/accepted/denied 等既有分支）。
  assert.ok(RENDERER.includes('kind === "handback"'), "appendEvent 应按 kind===handback 分支");
  assert.ok(RENDERER.includes("appendHandback"), "应有 appendHandback 呈现回交卡片");
  // B-2（2026-10-12）：分发不再看「当前打开的是谁」，而是按**信封 roleId** 落到各自 pane——
  // 产出角色自己的聊天 + 主入口角色的镜像（两边都落，即便当前不可见，切回即见）。
  assert.ok(RENDERER.includes("env.roleId"), "appendEvent 应按信封 roleId 分发到该角色的 pane（B-2）");
  // 卡片标题（自己聊天）「回交 su」；镜像标题「来自 <role> 的报告」。
  assert.ok(RENDERER.includes("报告声明：") && RENDERER.includes("系统按终态记录："), "来源卡片标题说明交回主入口");
  assert.ok(RENDERER.includes("来自 "), "镜像标题应为「来自 <role> 的报告」");
  assert.ok(RENDERER.includes("的报告"), "镜像标题应含「的报告」");
  // 镜像条件：当前打开会话是**产出它的角色**（自己的聊天）或**主入口角色**（镜像）——读 primaryRoleId，不硬编码。
  assert.ok(RENDERER.includes("state.sessionOpenRoleId"), "应读当前打开的会话角色");
  assert.ok(RENDERER.includes("state.primaryRoleId"), "镜像条件应读 primaryRoleId（不硬编码角色名）");
  assert.ok(!RENDERER.includes("appendHandback(paneFor(state.primaryRoleId)"), "主入口不提前镜像");
  assert.ok(RENDERER.includes('class="mi-report-detail"'), "真实投递详情默认收起");
  for (const status of ["未报告", "失败", "已中止"]) assert.ok(RENDERER.includes(status), "新增结果状态明确显示：" + status);
  // 结论标签：completed / blocked 两态（只呈现编排给的 status，不作判定）。
  assert.ok(RENDERER.includes("已完成") && RENDERER.includes("被拦下"), "应呈现 completed/blocked 两种结论");
  // 证据列表（只搬证据）。
  assert.ok(RENDERER.includes("hb-evidence") && RENDERER.includes("hb-ev"), "应呈现证据列表（只搬产物证据）");
  // 样式钩子（纯 CSS，无外部依赖）。
  assert.ok(STYLES.includes(".msg-handback"), "styles.css 应有 .msg-handback 卡片样式");
  assert.ok(STYLES.includes(".is-mirror"), "styles.css 应有 .is-mirror 镜像区分样式");
  // ——— C-1（2026-10-12）：回交报告卡片——字段渲染 + 转义 + 空证据占位 + blocked 视觉区分 ———
  // 字段：角色 / 任务（若有）/ 结论 / 摘要 / 证据（逐条）。
  assert.ok(RENDERER.includes("report.source.roleId") && RENDERER.includes("任务关联未知"), "卡片应含「角色 …，任务 …」字段行（任务有则示）");
  assert.ok(RENDERER.includes('"hb-summary card-md"'), "摘要应有 hb-summary + card-md（Markdown 卡块）呈现位");
  // N-4（2026-10-12 客户裁定「都要 markdown 化」）：摘要改经**同一 Markdown 管线**——仍是「模型输出禁直插」
  // （单一来源的转义/白名单在管线内）。
  assert.ok(RENDERER.includes("Md.renderMarkdown(preview)") && RENDERER.includes("Md.renderMarkdown(full)"), "摘要应经 Md.renderMarkdown（同一 esc 单一来源）");
  assert.ok(RENDERER.includes("esc(reportText(item))"), "证据逐条应以 esc 转义后呈现");
  assert.ok(!/hb-summary[^"]*">'\s*\+\s*hb\.summary/.test(RENDERER), "摘要不得未经管线处理直插 innerHTML");
  // 空证据占位（不留空白）。
  assert.ok(RENDERER.includes("（未提供证据）"), "证据为空应显示「（未提供证据）」占位");
  // blocked 的明显视觉区分（非仅文字）：is-blocked 类 + 语义色竖条样式。
  assert.ok(RENDERER.includes('(report.status !== "completed" ? " is-blocked" : "")'), "非完成状态卡片保持 is-blocked 可见区分");
  assert.ok(STYLES.includes(".msg-handback.is-blocked"), "styles.css 应有 .msg-handback.is-blocked 视觉区分");
  assert.ok(/\.msg-handback\.is-blocked\s*\{[^}]*var\(--danger\)/.test(STYLES), "blocked 区分应使用语义色（左侧竖条）");
});

// ————————————————— T28：Pi 配置面板（设计 §11） —————————————————

test("T28：Pi 配置面板存在——3 项必填 + 2 项「高级」（可折叠、可留空）；provider 不在面板；token 掩码", () => {
  // 面板容器。
  assert.ok(INDEX.includes('id="pi-panel"'), "index.html 应有 Pi 配置面板 #pi-panel");
  // **3 项必填**字段（端点 / 模型 / token）。
  for (const key of ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_BASE_URL", "ANS_PI_MODEL"]) {
    assert.ok(INDEX.includes('id="pi-inp-' + key + '"'), "应有必填字段 #pi-inp-" + key);
  }
  // 可选字段 `ANS_PI_CONTEXT_WINDOW` 仍在，但收进「高级」（可折叠、可留空）——不占主视线。
  assert.ok(INDEX.includes('id="pi-inp-ANS_PI_CONTEXT_WINDOW"'), "应有可选字段 #pi-inp-ANS_PI_CONTEXT_WINDOW");
  assert.ok(INDEX.includes('class="pi-advanced"'), "应有「高级」可折叠容器 .pi-advanced");
  const advStart = INDEX.indexOf('class="pi-advanced"');
  const cwPos = INDEX.indexOf('id="pi-inp-ANS_PI_CONTEXT_WINDOW"');
  const advEnd = INDEX.indexOf("</details>", advStart);
  assert.ok(advStart >= 0 && cwPos > advStart && cwPos < advEnd, "上下文窗口字段应在「高级」容器内");
  // 「高级」里那一行说明（一句话）：留空 = 用默认值（偏保守：压缩会提前触发，不会炸会话）。
  assert.ok(INDEX.includes("留空 = 用默认值"), "「高级」里应有一行「留空 = 用默认值…」说明");
  assert.ok(INDEX.includes("压缩会提前触发"), "该说明应点出「偏保守：压缩会提前触发，不会炸会话」");
  // 反向守卫：`ANS_PI_PROVIDER` **不再占一个输入框**（它已从面板移除；中间不再是用户该做的决定）。
  assert.ok(!INDEX.includes('id="pi-inp-ANS_PI_PROVIDER"'), "provider 不该有输入框");
  assert.ok(!INDEX.includes(">ANS_PI_PROVIDER<"), "provider 键名不该作为面板字段标签出现");
  // 渲染侧 PI_KEYS 与主进程一致：5 项（3 必填 + 2 高级），且**不含** provider。
  assert.ok(RENDERER.includes('"ANS_PI_CONTEXT_WINDOW"'), "渲染侧面板键应含 CONTEXT_WINDOW");
  assert.ok(RENDERER.includes('"ANS_PI_PROMPT_TIMEOUT_MS"'), "渲染侧面板键应含 PROMPT_TIMEOUT_MS");
  assert.ok(!/"ANS_PI_PROVIDER"/.test(RENDERER), "渲染侧面板键集合不该含 PROVIDER");
  assert.ok(RENDERER.includes("PI_REQUIRED_KEYS"), "渲染侧应区分必填键（缺才告警）");
  assert.ok(INDEX.includes('id="tab-pi"'), "Pi 设置入口应为右上角图标簇的 tab-pi（2026-10-13 客户裁定）");
  assert.ok(!INDEX.includes('id="btn-pi-settings"'), "「Pi 设置」文字按钮应已删（入口上移到右上角图标簇）");
  assert.ok(INDEX.includes('id="pi-save"'), "应有保存按钮 #pi-save");
  const tabsPos = INDEX.indexOf('id="right-tabs"');
  const tabPiPos = INDEX.indexOf('id="tab-pi"');
  const winMinPos = INDEX.indexOf('id="win-min"');
  assert.ok(tabsPos >= 0 && tabPiPos > INDEX.indexOf('class="sidebar-foot"') && tabPiPos < INDEX.indexOf('id="sidebar-role-count"') && winMinPos < tabsPos, "tab-pi 应在图标簇内、窗口按钮之前（右上角）");
  // token 字段默认掩码（type=password）——值以掩码显示、默认不回显。
  assert.ok(/id="pi-inp-ANTHROPIC_AUTH_TOKEN"[^>]*type="password"/.test(INDEX), "token 字段应为 password 掩码");
  // 呈现逻辑：读/存经 window.desktop（主进程掩码/读写，单一来源）；不作判定。
  assert.ok(RENDERER.includes("d.getPiConfig") && RENDERER.includes("d.savePiConfig"), "渲染侧应经 d.getPiConfig/d.savePiConfig");
  assert.ok(RENDERER.includes("openPiPanel") && RENDERER.includes("savePiConfigFromForm"), "应有展开/保存逻辑");
  // 「Pi 设置」入口=右上角图标簇（2026-10-13 客户裁定；togglePiPanel 随文字按钮退役，不留死代码——
  // 用去注释源码断言，说明性注释里的提及不算）。
  const codeNoCommentsPi = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!codeNoCommentsPi.includes("togglePiPanel"), "togglePiPanel 应随文字按钮退役（入口=tab-pi 的 toggleRightDrawer）");
  assert.ok(codeNoCommentsPi.includes('toggleRightDrawer("pi")'), "tab-pi 点击应走 toggleRightDrawer（同一抽屉机、至多开一块）");
  // preload 桥两端 + 主进程 IPC 通道齐备。
  assert.ok(PRELOAD.includes("getPiConfig") && PRELOAD.includes("savePiConfig"), "preload 应暴露 getPiConfig/savePiConfig");
  assert.ok(MAIN.includes("pi-config:get") && MAIN.includes("pi-config:save"), "主进程应注册 pi-config IPC 通道");
  // 启动载入 .env（补 --env-file）。
  assert.ok(MAIN.includes("loadEnvFileInto"), "主进程启动应用 loadEnvFileInto(process.env, .env) 补 --env-file");
  // 样式钩子。
  assert.ok(STYLES.includes(".pi-panel") && STYLES.includes(".pi-input") && STYLES.includes(".pi-status"), "styles.css 应有面板样式");
  assert.ok(STYLES.includes(".pi-advanced"), "styles.css 应有「高级」可折叠样式");
});

test("T28 扩展：高级设置组——CONTEXT_WINDOW + PROMPT_TIMEOUT 按序渲染、主区排除、单项兼容", () => {
  const piKeysStart = RENDERER.indexOf("var PI_KEYS = [");
  const piKeysEnd = RENDERER.indexOf("];", piKeysStart);
  const piKeys = RENDERER.slice(piKeysStart, piKeysEnd);
  assert.ok(piKeys.includes('"ANS_PI_CONTEXT_WINDOW"') && piKeys.includes('"ANS_PI_PROMPT_TIMEOUT_MS"'), "PI_KEYS 含两个高级键（与主进程元数据一致）");
  // 单一来源：高级键表按序定义；主字段区排除整组。
  const advStart = RENDERER.indexOf("var ADVANCED_SETTING_KEYS = [");
  const advEnd = RENDERER.indexOf("];", advStart);
  const advKeys = RENDERER.slice(advStart, advEnd);
  assert.ok(advStart > 0 && advKeys.indexOf('"ANS_PI_CONTEXT_WINDOW"') < advKeys.indexOf('"ANS_PI_PROMPT_TIMEOUT_MS"'), "高级区顺序＝上下文窗口 → 整轮超时");
  // 静态兜底（配置载入前）：index.html 的高级区同样按序含两字段与分隔说明。
  const staticAdvStart = INDEX.indexOf('class="pi-advanced"');
  const staticAdvEnd = INDEX.indexOf("</details>", staticAdvStart);
  const staticAdv = INDEX.slice(staticAdvStart, staticAdvEnd);
  assert.ok(staticAdv.includes('id="pi-inp-ANS_PI_CONTEXT_WINDOW"') && staticAdv.includes('id="pi-inp-ANS_PI_PROMPT_TIMEOUT_MS"'), "静态高级区含两字段（载入前兜底）");
  assert.ok(staticAdv.indexOf("ANS_PI_CONTEXT_WINDOW") < staticAdv.indexOf("ANS_PI_PROMPT_TIMEOUT_MS"), "静态高级区顺序一致");
  assert.ok(staticAdv.includes("以下高级项均可留空；留空 = 使用默认值。"), "静态分隔说明与动态一致");
  assert.ok(RENDERER.includes("return ADVANCED_SETTING_KEYS.indexOf(f.key) < 0;"), "主字段区经同一键表排除（不另写判据）");
  // 高级区：按白名单顺序取存在字段（缺件跳过 ⇒ 旧窗口视图只给一项时照常渲染），至少一项才显示。
  assert.ok(/ADVANCED_SETTING_KEYS\.map\(function \(key\) \{[\s\S]{0,220}\.filter\(Boolean\)/.test(RENDERER), "高级字段按序映射并过滤缺件（单项兼容）");
  assert.ok(RENDERER.includes("advanced.hidden = advancedFields.length === 0;"), "至少一个高级字段才显示「高级」");
  assert.ok(RENDERER.includes("advancedFields.map(fieldHtml).join("), "两个 fieldHtml 按序渲染（join 单项即自身）");
  assert.ok(RENDERER.includes('<p class="pi-advanced-hint">以下高级项均可留空；留空 = 使用默认值。</p>'), "两项之间有分隔说明（沿用既有 .pi-advanced-hint）");
  assert.ok(!RENDERER.includes("advancedField)") && !RENDERER.includes("const advancedField"), "旧「单个 CONTEXT_WINDOW」分支已退役");
  // label/help 来自元数据：新字段自动带出，渲染侧不硬编码文案与控件类型。
  assert.ok(RENDERER.includes("f.label || f.key") && RENDERER.includes("f.help ?"), "label/help 取元数据（新字段自动呈现）");
  assert.ok(!RENDERER.includes("整轮超时（ms）"), "新字段 label 不在渲染侧硬编码（单一来源=元数据）");
  assert.ok(RENDERER.includes('type="\' + (f.secret ? "password" : "text")'), "非 range 字段仍走文本/选择控件（range 分支独立）");
  // 保存/预填沿用既有字段循环——新键自动纳入，不需要第二份键表。
  assert.ok(/fields\.forEach\(function \(f\) \{\s*var inp = piInput\(f\.key\)/.test(RENDERER), "预填按 fields 循环（新键自动接线）");
  assert.ok(/\(piView\.fields \|\| \[\]\)\.forEach\(function \(f\) \{[\s\S]{0,260}piInput\(f\.key\)/.test(RENDERER), "保存按 fields 循环（无需新键表）");
});

test("T28 扩展 2：预设档位滑块——值↔下标↔标签纯映射与 range 控件接线", async () => {
  const UL = await loadUiLabelsForGovernance();
  // 7 档夹具（第 0 项为空串=默认/清除；标签由元数据提供，缺省回退 raw value）。
  const choices = ["", "100000", "200000", "300000", "500000", "1000000", "2000000"];
  const labels = ["系统默认（500k）", "100k", "200k", "300k", "500k", "1M", "2M"];
  assert.equal(choices.length, 7, "夹具为 7 档（range max=6）");
  assert.equal(UL.rangeChoiceIndex(choices, ""), 0, "默认/清除档 ⇒ index 0");
  assert.equal(UL.rangeChoiceIndex(choices, "500000"), 4, "500000 ⇒ index 4");
  assert.equal(UL.rangeChoiceIndex(choices, "300000"), 3, "300000 ⇒ index 3");
  assert.equal(UL.rangeChoiceIndex(choices, 500000), 4, "数值型值按规范字符串匹配");
  assert.equal(UL.rangeChoiceIndex(choices, "123456"), -1, "不在预设档位 ⇒ -1（回退文本输入，不硬塞滑块）");
  assert.equal(UL.rangeChoiceValue(choices, 0), "", "默认档的规范值为空串（保存即清除）");
  assert.equal(UL.rangeChoiceValue(choices, 4), "500000", "index 4 ⇒ hidden 规范值 500000");
  assert.equal(UL.rangeChoiceValue(choices, 99), "", "越界 ⇒ 空串（不发明值）");
  assert.equal(UL.rangeChoiceLabel(choices, labels, 0), "系统默认（500k）", "默认档标签逐字");
  assert.equal(UL.rangeChoiceLabel(choices, labels, 4), "500k", "档位标签逐字");
  assert.equal(UL.rangeChoiceLabel(choices, [], 4), "500000", "缺 choiceLabels 回退 raw value");
  // 源码接线：range 分支 / 档数 / output / aria / hidden 规范值 / 自定义值回退 / 预填同步。
  assert.ok(RENDERER.includes('if (f.control === "range" && choices && !shortTierRange(choices, choiceLabels))'), "fieldHtml 有 range 分支（仅长档位）");
  assert.ok(/type="range" min="0" max="' \+ \(choices\.length - 1\) \+ '" step="1"/.test(RENDERER), "range 档数=choices.length-1、step 1");
  assert.ok(RENDERER.includes('id="pi-range-out-'), "有 output 标签");
  assert.ok(RENDERER.includes('aria-valuetext="'), "range 的 aria-valuetext 同步标签");
  assert.ok(/id="pi-range-' \+ esc\(f\.key\)[\s\S]{0,800}id="pi-inp-' \+ esc\(f\.key\) \+ '" type="hidden" value="' \+ esc\(UiLabels\.rangeChoiceValue/.test(RENDERER), "hidden #pi-inp-* 持规范值（保存链无需改）");
  assert.ok(RENDERER.includes("当前值不在预设档位；改为预设档位后保存"), "自定义值提示逐字");
  assert.ok(/rangeIndex < 0[\s\S]{0,300}type="text"/.test(RENDERER), "自定义值回退文本输入（不静默覆盖）");
  assert.ok(RENDERER.includes("function syncRange(key)") && RENDERER.includes("UiLabels.rangeChoiceIndex(choices, hidden.value)"), "预填按 hidden 值求 index");
  assert.ok(/function bindRangeControl\(key\)[\s\S]{0,900}addEventListener\("input"/.test(RENDERER), "range input 事件接线（拖动/键盘统一走 input）");
  assert.ok(/hidden\.value = UiLabels\.rangeChoiceValue\(choices, idx\)[\s\S]{0,160}out\.textContent = text[\s\S]{0,160}setAttribute\("aria-valuetext", text\)/.test(RENDERER), "input 后 hidden/output/aria 三者同步");
  assert.ok(/fields\.forEach\(function \(f\) \{[\s\S]{0,140}syncRange\(f\.key\)[\s\S]{0,140}bindRangeControl\(f\.key\)/.test(RENDERER), "预填后 syncRange + 绑定");
  assert.ok(STYLES.includes(".pi-range-wrap") && STYLES.includes(".pi-range-out") && STYLES.includes(".pi-range-note"), "滑块样式钩子齐备");
  assert.ok(STYLES.includes("accent-color: var(--success)") && STYLES.includes("background: var(--border)"), "滑块只用既有 token（success/border）");
});

test("2026-10-18：推理强度改回下拉（中文标签 / raw 值）；range 仅长档位；无 ticks、滑块恢复紧凑", async () => {
  const UL = await loadUiLabelsForGovernance();
  // 纯判定函数从源码取出执行（与既有 pure-helper 提取先例一致）。
  const shortSrc = RENDERER.match(/function shortTierRange\(choices, labels\) \{[\s\S]*?\n  \}/)![0];
  const shortTierRange = new Function(shortSrc + "\nreturn shortTierRange;")() as (c: unknown, l: unknown) => boolean;
  const reasoningChoices = ["off", "low", "medium", "high", "xhigh"];
  const reasoningLabels = ["关", "低", "中", "高", "极高"];
  assert.equal(shortTierRange(reasoningChoices, reasoningLabels), true, "Claude/Pi reasoning ⇒ 下拉（不占 range）");
  assert.equal(shortTierRange(["low", "medium", "high", "xhigh"], ["低", "中", "高", "极高"]), true, "Codex 四档 ⇒ 下拉");
  const contextChoices = ["", "32768", "65536", "131072", "262144", "500000", "1048576"];
  const contextLabels = ["系统默认（500k）", "32k", "64k", "128k", "256k", "500k", "1M"];
  const timeoutChoices = ["", "60000", "120000", "300000", "600000", "900000", "1800000"];
  const timeoutLabels = ["系统默认（5 分钟）", "1 分钟", "2 分钟", "5 分钟", "10 分钟", "15 分钟", "30 分钟"];
  assert.equal(shortTierRange(contextChoices, contextLabels), false, "context 7 档长标签 ⇒ 仍用 range");
  assert.equal(shortTierRange(timeoutChoices, timeoutLabels), false, "timeout 7 档长标签 ⇒ 仍用 range");
  // 标签/raw 值映射：下拉显示中文标签，提交值仍是 raw choices。
  for (let index = 0; index < reasoningChoices.length; index += 1) {
    assert.equal(UL.rangeChoiceLabel(reasoningChoices, reasoningLabels, index), reasoningLabels[index], "下拉文本 = choiceLabels");
    assert.equal(UL.rangeChoiceValue(reasoningChoices, index), reasoningChoices[index], "提交值 = raw choices");
  }

  // 源码接线：range 分支只接长档位；select 分支 option 文本 1:1 choiceLabels、value 仍 raw。
  assert.ok(RENDERER.includes('if (f.control === "range" && choices && !shortTierRange(choices, choiceLabels))'), "range 仅长档位（reasoning 走下拉）");
  assert.ok(/choices\.map\(function \(c, index\)[\s\S]{0,240}choiceLabels\[index\]/.test(RENDERER), "option 文本用 choiceLabels");
  assert.ok(/<option value="' \+ esc\(String\(c\)\) \+ '">' \+ esc\(optionText\)/.test(RENDERER), "option value 仍是 raw choices");
  assert.ok(RENDERER.includes("留空（平台默认）"), "留空档保留");
  // 无刻度渲染与样式；range 恢复原始紧凑尺寸（轨道 4px、拇指 14px、高 20px、output 在右）。
  assert.ok(!RENDERER.includes("pi-range-ticks") && !RENDERER.includes("pi-range-tick"), "不再渲染 ticks");
  assert.ok(!STYLES.includes(".pi-range-ticks") && !STYLES.includes(".pi-range-tick"), "ticks 样式已移除");
  assert.ok(/\.pi-range-wrap \{[^}]*display: flex; align-items: center;/.test(STYLES), "range 横向紧凑布局");
  assert.ok(/\.pi-range-wrap input\[type="range"\] \{[^}]*height: 20px;/.test(STYLES), "input 高度恢复 20px");
  assert.ok(/::-webkit-slider-runnable-track \{[^}]*height: 4px;/.test(STYLES), "轨道恢复 4px");
  assert.ok(/::-webkit-slider-thumb \{[^}]*width: 14px; height: 14px;/.test(STYLES), "拇指恢复 14px");
  assert.ok(/\.pi-range-out \{[^}]*text-align: right;/.test(STYLES), "output 在右侧");
});

// ————————————————— A-5（2026-10-12）：客户交互卡 + 通道泛化 + 收口面删除 —————————————————

test("A-5：交互卡（确认/单选/多选/预览）取代收口确认卡；作答经 operatorRespond 回传（主进程按请求快照校验）", () => {
  // 通用交互卡：一个函数按 kind 渲染四种变体（confirm / preview / select / multi）。
  assert.ok(RENDERER.includes("appendOperatorRequest"), "应有 appendOperatorRequest（通用交互卡）");
  for (const cls of ["op-kind-confirm", "op-kind-select", "op-kind-multi", "op-kind-preview"]) {
    assert.ok(RENDERER.includes(cls), "卡片变体应有 " + cls);
  }
  assert.ok(
    RENDERER.includes('<div class="op-preview-body card-md">') && RENDERER.includes("Md.renderMarkdown(req.preview)"),
    "预览应为折叠块（details）+ 受控 Markdown 体（card-md，同一 Md 管线）",
  );
  assert.ok(!RENDERER.includes('<pre class="op-preview-body">'), "预览不得回退为纯文本 pre");
  assert.ok(RENDERER.includes('"checkbox"') && RENDERER.includes('"radio"'), "选择卡应有 radio（单选）/ checkbox（多选）");
  assert.ok(RENDERER.includes("op-submit") && RENDERER.includes("op-cancel"), "选择卡应有 提交/取消");
  assert.ok(RENDERER.includes("op-deny"), "确认卡应有「不同意」");
  assert.ok(RENDERER.includes("未获同意"), "作答文案应如实示「未获同意」语义（取消/不同意）");
  // 通道两端：preload 两方法（替四旧）+ 主进程两通道 + 通道模块。
  assert.ok(
    PRELOAD.includes("onOperatorRequest") && PRELOAD.includes("operatorRespond"),
    "preload 应暴露 onOperatorRequest/operatorRespond（替四旧方法）",
  );
  assert.ok(
    MAIN.includes("session:operator-request") && MAIN.includes("session:operator-response"),
    "主进程应注册交互请求/回传两通道",
  );
  assert.ok(MAIN.includes("createCustomerInputChannel"), "主进程应装配客户交互通道（customer-input.ts）");
  assert.ok(RENDERER.includes("d.operatorRespond"), "作答应经 d.operatorRespond 回传");
  // 样式钩子。
  for (const cls of [".op-request", ".op-preview", ".op-options", ".op-option", ".op-actions", ".op-note"]) {
    assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
  }
});

test("A-5：确认卡预览按受控 Markdown 呈现（标题/列表/表格/加粗；纯文本多行可读；原文 HTML 仍转义）", () => {
  // 客户 2026-10-17：「预览感觉需要 markdown 显示啊，不然的话看的很累」——折叠/限高滚动/无障碍 summary 不变。
  assert.ok(RENDERER.includes('<details class="op-preview">'), "预览仍为可折叠 details");
  assert.ok(RENDERER.includes("<span>预览内容（点击展开）</span></summary>"), "summary 文案与无障碍名不变");
  // 预览体经**同一** Md 管线（不在渲染侧另写解析）；正文 HTML 由库转义后拼入，未走 esc 的裸拼。
  const sample =
    "## 需要确认\n\n- 第一条\n- 第二条\n\n| 字段 | 值 |\n| --- | --- |\n| 范围 | 预览 |\n\n**重点**\n\n第一行\n第二行\n\n" +
    "<script>window.BAD_PREVIEW=1</script>";
  const out = Md.renderMarkdown(sample);
  assert.ok(out.includes("<h2>需要确认</h2>"), "标题应渲染为 h2");
  assert.ok(out.includes("<ul>") && out.includes("<li>第一条</li>"), "列表应渲染为 ul/li");
  assert.ok(out.includes("<table>") && out.includes("<th>字段</th>"), "表格应渲染为 table（窄栏内横向滚动由 .card-md 规则兜住）");
  assert.ok(out.includes("<strong>重点</strong>"), "加粗应渲染为 strong");
  assert.ok(out.includes("第一行<br>"), "纯文本多行按 breaks:true 保留换行（仍可读）");
  assert.ok(out.includes("&lt;script&gt;") && !out.includes("<script>"), "原文 HTML 仍被转义（XSS 钉子）");
  // 样式：限高滚动保留；Markdown 产物不得沿用纯文本 pre-wrap（会出异常空白）；字号/行高沿用角色卡正文口径。
  const body = STYLES.match(/\.op-request \.op-preview-body \{([\s\S]*?)\}/)?.[1] || "";
  assert.ok(body.includes("max-height: 40vh") && body.includes("overflow: auto"), "保留限高滚动");
  assert.ok(!body.includes("white-space: pre-wrap"), "Markdown 产物不得 pre-wrap");
  assert.ok(body.includes("font-size: 12px") && body.includes("line-height: 1.8"), "字号/行高与 .card-md 上下文一致");
});

test("A-5：收口面已删（断言「它不在」）——交互卡与确认制取代之，防回潮", () => {
  // 渲染侧。
  assert.ok(!RENDERER.includes("appendFinalizeProposal"), "renderer 不得再有 appendFinalizeProposal");
  assert.ok(!RENDERER.includes("appendFinalizeResult"), "renderer 不得再有 appendFinalizeResult");
  assert.ok(!RENDERER.includes("refreshBootstrapAction"), "renderer 不得再有 refreshBootstrapAction");
  assert.ok(!RENDERER.includes("btn-finalize"), "renderer 不得再有「让 su 提议收口」按钮");
  assert.ok(!RENDERER.includes("d.getBootstrapState") && !RENDERER.includes("d.finalizeBootstrap"), "renderer 不得再调用 finalize 两方法");
  // index.html：入口容器已删（注释里也不留字面量，防回潮断言从简）。
  assert.ok(!INDEX.includes("bootstrap-action"), "index.html 不得再有 bootstrap-action（含注释）");
  // 样式：两张旧卡样式已删。
  assert.ok(!STYLES.includes(".bootstrap-action") && !STYLES.includes(".sys-finalize") && !STYLES.includes(".fp-"), "styles.css 不得再有旧卡样式");
  // preload/IPC：四旧通道已删。
  assert.ok(
    !PRELOAD.includes("onFinalizeProposal") && !PRELOAD.includes("finalizeConfirm") &&
      !PRELOAD.includes("getBootstrapState") && !PRELOAD.includes("finalizeBootstrap"),
    "preload 四旧方法应已删",
  );
  assert.ok(
    !MAIN.includes("session:finalize-proposal") && !MAIN.includes("session:finalize-confirm") &&
      !MAIN.includes("session:bootstrap-state") && !MAIN.includes("finalizeBootstrap"),
    "主进程四旧 IPC 应已删",
  );
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
  // 双击最大化：**标题栏不**挂 dblclick（由 Windows 原生在拖动区/ HTCAPTION 上处理，叠加会变成双击无反应）；
  // 唯一允许的 dblclick = 左栏宽度分隔线「双击复位 248」（不在标题栏、无叠加）。
  const dblclickSites = RENDERER.match(/addEventListener\("dblclick"/g) || [];
  assert.equal(dblclickSites.length, 1, "dblclick 仅允许分隔线一处");
  assert.ok(RENDERER.includes('resizer.addEventListener("dblclick"'), "唯一 dblclick = 分隔线复位");
  assert.ok(!/titlebar[\s\S]{0,240}addEventListener\("dblclick"/.test(RENDERER), "标题栏不得挂 dblclick");
  // 应用标识只在标题栏一份：左栏不再重复堆砌品牌。
  assert.ok(!INDEX.includes("brand-mark") && !INDEX.includes("brand-sub"), "左栏不应再重复堆砌品牌标识（已上移到标题栏）");
  assert.ok(STYLES.includes(".titlebar") && STYLES.includes(".win-btn"), "styles.css 应有标题栏与窗口按钮样式");
});

// ————————————————— B-1（2026-10-12）：Markdown 受控渲染 + 链接外开 —————————————————

test("B-1：消息经最小子集 Markdown 渲染（先转义后解析）；sys-* 状态行保持转义", () => {
  // 装载顺序硬约束：markdown.js 必须先于 renderer.js；renderer 经 window.ANSMarkdown 取用（单一来源）。
  const mdPos = INDEX.indexOf('src="markdown.js"');
  const rPos = INDEX.indexOf('src="renderer.js"');
  assert.ok(mdPos >= 0 && mdPos < rPos, "index.html 应先加载 markdown.js（再 renderer.js）");
  assert.ok(RENDERER.includes("window.ANSMarkdown"), "renderer 应从 window.ANSMarkdown 取渲染器（单一来源）");
  // 助手/用户消息走受控渲染（不再以 textContent 直插纯文本）。
  assert.ok(RENDERER.includes("Md.renderMarkdown(text)"), "appendUser/appendAssistant 应经 renderMarkdown 渲染");
  assert.ok(!RENDERER.includes("div.textContent = text"), "消息不得再以 textContent 直插纯文本（B-1 起走受控渲染）");
  // sys-* 状态行保持 esc（设计：无收益，不改）。
  assert.ok(RENDERER.includes('esc(text) + "</span>"'), "sys 状态行应保持 esc 转义");
  // 链接外开：事件委托挂在 #chat 上 + 经 preload/IPC 走系统浏览器（仅 http/https 在 Interface 校验）。
  assert.ok(RENDERER.includes("a.md-link"), "应有 .md-link 的点击委托");
  assert.ok(RENDERER.includes("d.openExternal"), "链接应经 d.openExternal 外开");
  assert.ok(PRELOAD.includes("openExternal") && PRELOAD.includes("app:open-external"), "preload 应暴露 openExternal 通道");
  assert.ok(MAIN.includes("app:open-external") && MAIN.includes("shell.openExternal"), "主进程应注册 app:open-external 并接 shell.openExternal");
  // 样式钩子（代码块/引用/行内码/链接）。
  for (const cls of [".md-pre", ".md-lang", ".md-link", "blockquote"]) {
    assert.ok(STYLES.includes(cls), "styles.css 应有 Markdown 样式 " + cls);
  }
});

test("B-1（XSS 红线冒烟）：纯函数可独立断言——语法渲染 + `<script>`/`<img onerror>` 保持转义文本", async () => {
  // 与 index.html 同序：先装 vendored markdown-it（UMD → globalThis.markdownit），再装封装。
  const vendorHref = new URL("../../app/renderer/vendor/markdown-it.umd.min.js", import.meta.url).href;
  const href = new URL("../../app/renderer/markdown.js", import.meta.url).href;
  await import(vendorHref);
  await import(href);
  const Md = (globalThis as Record<string, unknown>).ANSMarkdown as { renderMarkdown: (s: string) => string };
  assert.ok(Md && typeof Md.renderMarkdown === "function", "应挂 globalThis.ANSMarkdown（同一纯函数）");
  assert.ok(Md.renderMarkdown("**x**").includes("<strong>x</strong>"), "**x** 应渲染为 <strong>");
  const xss1 = Md.renderMarkdown("<script>alert(1)</script>");
  assert.ok(!xss1.includes("<script") && xss1.includes("&lt;script&gt;"), "script 标签必须保持转义文本");
  const xss2 = Md.renderMarkdown('<img src=x onerror="alert(1)">');
  assert.ok(!/<img/i.test(xss2), "img 标签必须保持转义文本（且图片不渲染）");
});

// ————————————————— B-2（2026-10-12）：切换保留历史（并存会话 / 信封 / 每角色 pane） —————————————————

test("B-2：selectRole 不得无条件 clearChat；每角色一个 pane；事件按 roleId 信封分发", () => {
  // 锚点：selectRole 函数体里不得再有 clearChat 调用（清空聊天 = 旧行为）；clearChat 已退役。
  const start = RENDERER.indexOf("async function selectRole(");
  assert.ok(start >= 0, "应有 selectRole");
  const end = RENDERER.indexOf("\n  // ——————", start); // 下一个大节注释
  const body = RENDERER.slice(start, end > start ? end : start + 4000);
  assert.ok(!body.includes("clearChat("), "selectRole 不得无条件 clearChat（B-2：切换保留历史）");
  assert.ok(!RENDERER.includes("function clearChat("), "clearChat 应已退役（改由每角色 pane 承载）");
  // 每角色 pane + 恢复机制存在（游离 DOM 保留历史与监听器）。
  assert.ok(RENDERER.includes("chatPanes"), "应有每角色 pane 容器表（chatPanes）");
  assert.ok(RENDERER.includes("data-role-id"), "pane 应带 data-role-id 标识");
  assert.ok(RENDERER.includes("showPane"), "应有 showPane 切换视图");
  assert.ok(RENDERER_CODE.includes("模型上下文已重启") === false, "失真文案「模型上下文已重启」已退役（D-1 契约下 dispose/LRU 后重开=恢复；文案由 role-status.js 纯函数唯一给出——注释里的历史说明不算）");
  assert.ok(RENDERER.includes("St.sessionContextNotice"), "选角后的上下文来源提示应走纯函数映射（sessionContextNotice）");
  // 信封三端一致（{roleId, event}）。
  assert.ok(RENDERER.includes("env.roleId"), "渲染侧应按信封 roleId 分发");
  assert.ok(MAIN.includes("SessionEventEnvelope"), "主进程应透传 SessionEventEnvelope（带 roleId 信封）");
  // 保活列表与停止通道两端（「结束会话」按钮已删——客户裁定 2026-10-13；停止能力保留在程序化路径：
  // 换项目时 d.stopSession(null)「关闭全部」；定向 stopSession 在主进程/会话管理器，供该路径与测试使用）。
  assert.ok(PRELOAD.includes("listLiveSessions") && MAIN.includes("session:live"), "应有 session:live 通道两端");
  assert.ok(RENDERER.includes("d.listLiveSessions"), "渲染侧应取保活会话列表");
  assert.ok(RENDERER.includes("d.stopSession(null)"), "换项目路径应保留「关闭全部」停止能力（程序化）");
  assert.ok(!RENDERER.includes("btn-stop"), "「结束会话」按钮入口应已删（不留死代码）");
  // 样式：pane 容器。
  assert.ok(STYLES.includes(".chat-pane"), "styles.css 应有 .chat-pane");
});

// ————————————————— B-3（2026-10-12）：左树角色状态徽标（纯函数映射） —————————————————

test("B-3 + 状态准确性（2026-10-12 客户裁定）：状态→徽标纯函数（**图标 + 短标签**）；working 只由**真实信号**（busy/队列深度）派生", async () => {
  const href = new URL("../../app/renderer/role-status.js", import.meta.url).href;
  await import(href);
  const St = (globalThis as Record<string, unknown>).ANSRoleStatus as {
    deriveRoleStatus: (f: Record<string, unknown>) => string;
    statusBadge: (s: string, n?: number) => { icon: string; label: string; className: string; title: string };
    STOPPED_LABEL: string;
    ROLE_STATUSES: string[];
  };
  assert.ok(St && typeof St.deriveRoleStatus === "function", "应挂 globalThis.ANSRoleStatus");
  // 六态判据（设计 B-3 表 + 准确性裁定；working 只由真实信号——busy（会话在跑，含后台轮次）/ queueDepth（队列待办））。
  assert.equal(St.deriveRoleStatus({}), "not-opened");
  assert.equal(St.deriveRoleStatus({ live: true }), "idle");
  assert.equal(St.deriveRoleStatus({ live: true, busy: true }), "working");
  assert.equal(St.deriveRoleStatus({ live: true, queueDepth: 2 }), "working", "有排队待办不得显示「空闲」");
  assert.equal(St.deriveRoleStatus({ busy: true }), "working", "未保活但真实在跑：同样「工作中」（后台轮次如实）");
  assert.equal(St.deriveRoleStatus({ live: true, awaitingConfirm: true }), "awaiting-confirm");
  assert.equal(St.deriveRoleStatus({ hadSession: true }), "stopped");
  assert.equal(St.deriveRoleStatus({ error: true }), "error");
  // D-1（2026-10-12）：「空闲（已恢复）」——有恢复记录、句柄未开/未保活时（诚实态，不假装工作中/未开启）。
  assert.equal(St.deriveRoleStatus({ restored: true }), "idle-restored");
  assert.equal(St.deriveRoleStatus({ restored: true, live: true }), "idle", "已保活时它就是普通「空闲」");
  assert.equal(St.deriveRoleStatus({ restored: true, hadSession: true }), "stopped", "开过又停 → 「已停止」优先于恢复标注");
  // 优先级（2026-10-17 修订）：等待你确认 > 工作中 > 错误 > 其余。
  // `error` 是**上一轮终局**，不代表当前轮：上一轮超时/失败后新一轮 busy ⇒ 显示「工作中」，空闲时才显示「错误」。
  assert.equal(St.deriveRoleStatus({ live: true, busy: true, awaitingConfirm: true, error: true }), "awaiting-confirm", "等待确认 > 工作中 > 错误");
  assert.equal(St.deriveRoleStatus({ live: true, busy: true, awaitingConfirm: true }), "awaiting-confirm");
  assert.equal(St.deriveRoleStatus({ live: true, queueDepth: 1, awaitingConfirm: true }), "awaiting-confirm");
  assert.equal(St.deriveRoleStatus({ busy: true, error: true }), "working", "新一轮 busy ⇒ 工作中（不残留上一轮超时/错误）");
  assert.equal(St.deriveRoleStatus({ live: true, busy: true, error: true }), "working");
  assert.equal(St.deriveRoleStatus({ queueDepth: 2, error: true }), "working", "有待办 ⇒ 工作中（error 等空闲再显示）");
  assert.equal(St.deriveRoleStatus({ live: true, error: true }), "error", "空闲时仍如实显示上一轮错误");
  assert.equal(St.deriveRoleStatus({ error: true, awaitingConfirm: true }), "awaiting-confirm", "等待确认仍高于错误");
  // 徽标文案守卫（实机反馈原句）：busy+error ⇒「工作中」；空闲 error ⇒「错误」。
  assert.equal(St.statusBadge(St.deriveRoleStatus({ busy: true, error: true })).label, "工作中");
  assert.equal(St.statusBadge(St.deriveRoleStatus({ error: true })).label, "错误");
  // **反向断言（准确性判据）**：旧的可由界面自设的 working 事实已退役——喂它不再影响派生（不得界面推测「工作中」）。
  assert.equal(St.deriveRoleStatus({ live: true, working: true }), "idle", "界面自设的 working 不是判据（已退役）");

  // 七态：**图标 + 短标签**齐备、彼此不同（客户裁定：「应该用图标来表示」）。
  const statuses = ["not-opened", "idle", "working", "awaiting-confirm", "stopped", "error", "idle-restored"];
  const badges = statuses.map((s) => St.statusBadge(s));
  assert.deepEqual(
    badges.map((b) => b.label),
    ["未开启", "空闲", "工作中", "等待你确认", "已停止", "错误", "空闲（已恢复）"]
  );
  assert.equal(new Set(badges.map((b) => b.label)).size, 7, "七态文案应彼此不同");
  assert.equal(new Set(badges.map((b) => b.icon)).size, 7, "七态**图标**应彼此不同（一态一图标）");
  for (const b of badges) {
    assert.ok(typeof b.icon === "string" && b.icon.length >= 1, "每态都应有图标");
    assert.ok(typeof b.title === "string" && b.title.length > 0 && b.title !== b.label, "悬停应有更完整的描述（≠ 短标签）");
  }
  assert.equal(St.statusBadge("working", 2).label, "工作中 · 2 待办", "待办数 > 0：短标签带「 · N 待办」（如实）");
  assert.ok(St.statusBadge("working", 2).title.includes("2 项已入队"), "悬停描述带待办说明");
  assert.equal(St.statusBadge("working", 0).label, "工作中", "无待办：不加后缀");
  assert.equal(St.statusBadge("working", -1).label, "工作中", "非法计数按 0（不假装）");
  assert.notEqual(St.statusBadge("working").className, St.statusBadge("idle").className, "样式类随状态变");
  assert.equal(St.statusBadge("不存在").label, "未知", "未知状态给保守占位（不假装认识）");

  // **措辞唯一（客户裁定）**：「停止」措辞全应用只此一处（`STOPPED_LABEL`）——含反向断言钉死。
  assert.equal(St.statusBadge("stopped").label, "已停止", "统一措辞 = 「已停止」");
  assert.equal(St.STOPPED_LABEL, "已停止", "单一来源常量（渲染侧一律经它取用）");
  assert.deepEqual(statuses.filter((s) => St.statusBadge(s).label.includes("停止")), ["stopped"], "七态标签里「停止」只出现在 stopped");
  assert.deepEqual(statuses.filter((s) => St.statusBadge(s).title.includes("停止")), ["stopped"], "悬停描述里同样只此一处");
  const rendererCode = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // 状态徽标措辞唯一（P0-2 起区分：轮次停止钮的「停止」措辞属 P0-2 功能面、另有钉；此处钉的是
  // **状态徽标**的「已停止」标签措辞——仍只经 statusBadge/STOPPED_LABEL 唯一映射，代码不自写第二份）。
  assert.ok(
    !rendererCode.includes("已停止"),
    "渲染侧代码不得自写第二份「已停止」状态措辞（一律经 statusBadge/STOPPED_LABEL 唯一映射——注释不算）"
  );

  // 渲染侧只经该映射（不自写第二份判断）；悬停示完整描述（+ 最近事件）。
  assert.ok(RENDERER.includes("St.statusBadge"), "渲染侧应经 St.statusBadge 取图标/文案/样式");
  assert.ok(RENDERER.includes("St.deriveRoleStatus"), "渲染侧应经 St.deriveRoleStatus 派生状态");
  assert.ok(RENDERER.includes("badge.icon") && RENDERER.includes("ts-ico"), "渲染侧应渲染图标（ts-ico 钩子）");
  assert.ok(RENDERER.includes("badge.title"), "渲染侧悬停用完整描述（title）");
  assert.ok(RENDERER.includes("最近事件（"), "悬停仍附「最近事件（时间）：摘要」");
  assert.ok(RENDERER.includes("toLocaleTimeString"), "时间取自本地时钟（复用事件流，不新增数据源）");
  // 装载顺序与样式钩子。
  const stPos = INDEX.indexOf('src="role-status.js"');
  const rPos2 = INDEX.indexOf('src="renderer.js"');
  assert.ok(stPos >= 0 && stPos < rPos2, "index.html 应先加载 role-status.js");
  for (const cls of [".ti-status", ".st-idle", ".st-working", ".st-confirm", ".st-stopped", ".st-error", ".ts-ico"]) {
    assert.ok(STYLES.includes(cls), "styles.css 应有状态样式 " + cls);
  }
});

// ————————————————— 真机缺陷修复（2026-10-12）：交互卡严格投递 + 工具行瘦身 —————————————————

test("真机缺陷修复：交互卡严格投递所属 pane（不回落当前查看角色）+ 登记表补挂 + 跨 pane 只读指针 + 过期终态", () => {
  // ① 严格路由：**不再**回落 `state.selectedRoleId`（旧行把卡落进"当时在看"的 pane——错卡/丢卡同源）。
  assert.ok(!RENDERER.includes(": state.selectedRoleId;"), "交互请求不得回落「当前查看角色」");
  assert.ok(RENDERER.includes("(未标识角色)"), "空 roleId 走显式命名的兜底（不冒充当前查看角色）");
  // ② 登记表：去重（一条请求一次渲染）+ 幂等物化 + pane 重挂后补挂。
  assert.ok(RENDERER.includes("opRequests"), "应有交互请求登记表（挂起/终态）");
  assert.ok(RENDERER.includes("materializeOperatorCard") && RENDERER.includes("materializePendingFor"), "应有幂等物化与按 pane 补挂");
  assert.ok(/function showPane[\s\S]{0,700}materializePendingFor/.test(RENDERER), "showPane（切回）应补挂未决卡——切回必须看到卡");
  assert.ok(RENDERER.includes("cardInPane"), "物化应查重（同 requestId 同 pane 不重复建卡）");
  // ③ 可见性：非当前查看的请求 → 当前 pane 放**只读指针**；徽标按「任一 open 请求」重算。
  assert.ok(RENDERER.includes("【待确认】角色 ") && RENDERER.includes("点左侧该角色查看"), "未查看时应向当前 pane 放只读指针（只提示、不搬卡）");
  assert.ok(RENDERER.includes("requestSurfaces(entry).indexOf(state.selectedRoleId) < 0"), "指针仅在请求的全部呈现面都不是当前查看角色时出现");
  assert.ok(RENDERER.includes("openRequestCountFor") && RENDERER.includes("refreshAwaitingBadge"), "「等待你确认」徽标应随挂起集重算（B-3）");
  assert.ok(RENDERER.includes("awaitingConfirm"), "徽标判据仍由既有事实（挂起请求）驱动");
  // ④ 失效终态（G-1：**卡片不按时间过期**——唯一真实失效＝应用关闭/重启后未决请求不复存在）。
  assert.ok(RENDERER.includes("r.expired === true"), "应识别通道的失效回包");
  assert.ok(RENDERER.includes('entry.state = "expired"'), "失效应写入登记表终态（重物化同款定格）");
  assert.ok(
    RENDERER.includes("请求已失效（轮次停止、会话重建或应用关闭），未获同意——请让角色重新发起。"),
    "失效文案如实指向「重启/关闭」并给出路（请让角色重新发起）"
  );
  assert.ok(!RENDERER.includes("超时或已被处理"), "时间源性旧文案已删（G-1）");
  // G-1 钉子 ①：交互卡路径**无任何计时器**——卡片可长期保持 open，无按时间过期/自动定格（用去注释源码断言，
  // 免得「说明无计时器」的那句注释自己被当成计时器）。
  assert.ok(!RENDERER_CODE_NO_JUDGE.includes("setTimeout") && !RENDERER_CODE_NO_JUDGE.includes("setInterval"), "renderer 代码不得有任何计时器（卡片不按时间过期；一次性警告除外）");
  // 通道侧：未知 id（重启后旧回包）→ 终态 expired；原因文案指向重启/关闭而非超时；通道同样无计时器。
  const CI = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "customer-input.ts"), "utf8");
  const CI_CODE = CI.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(CI.includes("expired: true"), "通道应对「无挂起请求」回终态标记");
  assert.ok(CI.includes("轮次停止、会话重建或应用关闭会使旧请求失效"), "通道终态原因如实（中止/关闭/重启，非计时失效）");
  assert.ok(!CI_CODE.includes("setTimeout") && !CI_CODE.includes("setInterval"), "通道代码不得有计时器（G-1：桌面不自造计时）");
  assert.ok(!CI.includes("可能已超时"), "旧「可能已超时」措辞已删");
});

test("工具行瘦身（2026-10-12 客户裁定）：只显示状态与目标——长内容/读取正文的反向断言", async () => {
  const href = new URL("../../app/renderer/tool-rows.js", import.meta.url).href;
  await import(href);
  const Tr = (globalThis as Record<string, unknown>).ANSToolRows as { slimToolRow: (s: unknown) => string };
  assert.ok(Tr && typeof Tr.slimToolRow === "function", "应挂 globalThis.ANSToolRows");
  // 客户真机样例：预览分隔（#）、列表（·）、重复工具名段——全部收掉，只留工具名 + 目标路径。
  assert.equal(
    Tr.slimToolRow("read_file：read_file: docs/接口约定.md # 接口约定 · 正文预览若干"),
    "read_file：docs/接口约定.md"
  );
  // 长内容反向断言：读取正文不得出现在渲染文本里（多行同样只取首行）。
  const longRead = Tr.slimToolRow("read_file：docs/a.md # " + "正文内容".repeat(200));
  assert.ok(!longRead.includes("正文内容"), "读取内容不得出现");
  assert.ok(longRead.includes("docs/a.md"), "目标路径保留");
  assert.ok(!Tr.slimToolRow("write_file：docs/b.md\n第二行是写入的正文").includes("第二行"), "多行内容只取首行");
  // 无路径又很长 → 折叠为 `工具名：…`（防御：即便格式变了也不铺内容）。
  assert.equal(Tr.slimToolRow("edit_file：" + "x".repeat(80)), "edit_file：…");
  // 成功/失败与**失败原因摘要**保留。
  assert.ok(Tr.slimToolRow("write_file 执行完成").includes("完成"));
  assert.ok(Tr.slimToolRow("read_file 执行失败：EACCES 权限不足").includes("EACCES"));
  // 渲染侧接线：tool_call/accepted 与回放的工具行都过瘦身映射；`denied` 全量（治理信号）；detail 一律不渲染。
  assert.ok(RENDERER.includes("Tr.activityOf(ev)"), "实时工具行应经瘦身映射");
  assert.ok(RENDERER.includes("Tr.activityOf(row)"), "回放工具行应经瘦身映射");
  assert.ok(RENDERER.includes("if (Tr.isToolActivity(ev)) appendActivity(pane, Tr.activityOf(ev))") && RENDERER.includes('else if (!appendTurnTerminal(pane, ev)) sysRow(pane, "sys-call", ICONS.deny, ev.summary)') && RENDERER.includes("activity.deniedSummary || activity.visibleSummary"), "denied 行保持全量（拒绝原因与允许路径）");
  assert.ok(!/(?:innerHTML|textContent)\s*=.*ev\.detail|(?:esc|renderMarkdown)\(ev\.detail/.test(RENDERER), "detail 正文不进入 HTML/文本；只读取实际 outcome 和工具元数据");
  const index = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");
  assert.ok(index.indexOf('src="tool-rows.js"') > 0 && index.indexOf('src="tool-rows.js"') < index.indexOf('src="renderer.js"'), "tool-rows.js 应先于 renderer.js 加载");
});

// ————— F-8-b（2026-10-16 客户批准）：run_shell「进程跑完、退出码非零」中性类的渲染接线 —————

test("F-8-b：非零退出中性类——红色错误预览让位、详情字段不假冒「错误」（判据单一来源在 tool-rows 结构化事实）", () => {
  // 两处消费点都按 tool-rows 的 `status === "exited-nonzero"` 让位；渲染侧不自持第二份 exitCode 判定。
  assert.ok(RENDERER.includes('activity.status === "exited-nonzero" ? "" : activity.display && activity.display.error'), "中性类不摆红色错误预览（退出码已在状态标签如实给出）");
  assert.ok(RENDERER.includes('displayField(activity.status === "exited-nonzero" ? "消息" : "错误", display.error)'), "中性类的 display.error 按「消息」如实标注（其余类保持「错误」）");
});

test("H-1 附录：系统投递输入单独样式——分类器（两名渲染函数的前缀=单一来源）+ 手输防误伤 + 回放同类", async () => {
  const href = new URL("../../app/renderer/tool-rows.js", import.meta.url).href;
  await import(href);
  const Tr = (globalThis as Record<string, unknown>).ANSToolRows as {
    classifyInjectedMessage: (s: unknown) => { kind: string; label: string; sourceRoleId: string; body: string } | null;
  };
  assert.ok(Tr && typeof Tr.classifyInjectedMessage === "function", "应挂 classifyInjectedMessage");
  // 实时回显（适配器把程序化输入回显为 `用户指令：<正文>`）——两类投递都归类出 kind/来源/标签。
  const hb = Tr.classifyInjectedMessage("用户指令：[回交] 来自 规划者 的报告（任务 T1）\n结论：completed\n摘要：做完了");
  assert.ok(hb && hb.kind === "handback" && hb.sourceRoleId === "规划者" && hb.label === "回交投递", "回交回显应归类（来源取自正文）");
  const dp = Tr.classifyInjectedMessage("用户指令：[派发] 来自 su 的任务：做X——完成后请交回报告");
  assert.ok(dp && dp.kind === "dispatch" && dp.sourceRoleId === "su" && dp.label === "派发", "派发回显应归类");
  // 回放路径（无 `用户指令：` 前缀的原始投递文本）同样归类。
  assert.ok(Tr.classifyInjectedMessage("[回交] 来自 A 的报告"), "回放原始投递文本应归类");
  // **非投递不误伤**（前缀必须在行首——"看起来像"不算）。
  assert.equal(Tr.classifyInjectedMessage("用户指令：帮我看下 [回交] 这个词"), null, "行内提及不算投递");
  assert.equal(Tr.classifyInjectedMessage("[回交未闭合] 普通消息"), null);
  assert.equal(Tr.classifyInjectedMessage("普通一句话"), null);
  // 渲染侧接线：message 分支先分类（投递 → 注入样式；否则普通气泡）；**手输防误伤**（本端手发+同角色+15s）。
  assert.ok(RENDERER.includes("Tr.classifyInjectedMessage"), "appendEvent/replay 应经分类器");
  assert.ok(RENDERER.includes("appendInjectedMessage") && RENDERER.includes("buildInjectedElement"), "应有注入样式渲染");
  assert.ok(RENDERER.includes("msg-injected") && RENDERER.includes("· 来自 "), "注入行应带来源标签");
  assert.ok(RENDERER.includes('ev.detail.source === "prompt-input"') && RENDERER.includes("bindManualTurn(env)"), "输入来源只认typed标记，客户气泡由原clientMessageId ACK绑定而不靠时间/文字猜测");
  assert.ok(/lastManualSend = \{ roleId: role\.roleId, text: text, at: Date\.now\(\) \}/.test(RENDERER), "onSend 应记录本端刚手发送");
  // **客户手输仍是普通用户气泡**（反向）：appendUser 的 `.msg-user` 产出路径未被动过。
  assert.ok(RENDERER.includes('div.className = "msg msg-user"'), "appendUser 仍产普通用户气泡（不被注入路径接管）");
  // 回放：user 行也过分类器（投递行呈注入样式；其它行原样 `.msg-user is-replay`）。
  assert.ok(/kind === "user" && Tr\.classifyInjectedMessage/.test(RENDERER), "回放 user 行应经分类器");
  // 样式钩子。
  for (const cls of [".msg-injected", ".mi-chip", ".mi-head", ".mi-body"]) {
    assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
  }
});

// —————— 2026-10-19 客户要求：「这个应该加一个标记啊」——系统通知独立成行（不混进用户气泡）——————
// 编排把会话重建 notice 以 `【系统通知·会话重建】` 为文首标记 prepend 到下一轮用户消息；纯函数归类在
// tool-rows.js（单一来源），实时/回放渲染同规则：通知行 = `.sys sys-notice` + 「系统通知」徽标，
// `\n\n` 之后的用户正文仍是普通 `.msg-user`。只改呈现，不动通知文本、模型可见内容与消息顺序。

test("2026-10-19：`【系统通知…】` 归类为 system-notice——带「系统」标签、通知与用户正文分离；旧消息不受影响", async () => {
  await import(new URL("../../app/renderer/tool-rows.js", import.meta.url).href);
  const Tr = (globalThis as Record<string, unknown>).ANSToolRows as {
    classifyInjectedMessage: (s: unknown) => { kind: string; label: string; sourceRoleId: string; body: string; displayBody?: string; remainder?: string } | null;
  };
  const noticeText = "此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。";
  const raw = "【系统通知·会话重建】" + noticeText + "\n\n请继续处理任务。";
  const live = Tr.classifyInjectedMessage("用户指令：" + raw);
  assert.equal(live?.kind, "system-notice", "实时回显（用户指令：前缀）归类为系统通知");
  assert.equal(live?.label, "系统通知 · 会话重建", "标签带「系统通知」与子类原文");
  assert.equal(live?.sourceRoleId, "", "来源=系统（非角色）");
  assert.equal(live?.displayBody, noticeText, "展示正文=标记后的通知原文（标记由徽标承载）");
  assert.equal(live?.remainder, "请继续处理任务。", "空行后的用户正文独立取出");
  assert.equal(live?.body, raw, "body 保持投递原文（仅剥回显前缀）——模型可见内容不变");

  const replay = Tr.classifyInjectedMessage(raw);
  assert.equal(replay?.kind, "system-notice", "回放原始文本同解（实时/回放一致）");
  assert.equal(replay?.remainder, "请继续处理任务。", "回放同样分离用户正文");

  // 仅通知（无用户正文）：整段是通知，无正文行。
  const only = Tr.classifyInjectedMessage("【系统通知·会话重建】" + noticeText);
  assert.equal(only?.kind, "system-notice");
  assert.equal(only?.remainder, "", "无空行分隔 ⇒ 没有用户正文");

  // 不误伤：普通消息 / 行内提及 / 未闭合标记不归类；既有投递分类不变。
  assert.equal(Tr.classifyInjectedMessage("普通一句话"), null, "普通用户消息不受影响");
  assert.equal(Tr.classifyInjectedMessage("用户指令：帮我看下【系统通知】这个词"), null, "行内提及不算（标记必须在行首）");
  assert.equal(Tr.classifyInjectedMessage("【系统通知·未闭合 普通消息"), null, "未闭合标记不归类");
  assert.equal(Tr.classifyInjectedMessage("【系统通知·会话重建】"), null, "仅标记无正文不归类（不摆空通知）");
  assert.equal(Tr.classifyInjectedMessage("[派发] 来自 su 的任务：x")?.kind, "dispatch", "既有派发归类不变");
  assert.equal(Tr.classifyInjectedMessage("[系统·看护] 队列积压")?.kind, "system", "既有 system 归类不变");

  // 渲染接线：独立系统行 + 「系统通知」徽标 + 用户正文按普通消息；实时与回放同规则。
  assert.ok(RENDERER.includes("function buildSystemNoticeRow("), "系统通知行构造单点存在");
  assert.ok(RENDERER.includes('"sys sys-notice"'), "系统通知行用 .sys sys-notice（独立系统行，非用户气泡）");
  assert.ok(RENDERER.includes('class="sys-notice-badge"'), "明确的「系统通知」徽标");
  assert.ok(RENDERER.includes("esc(inj.label)") && RENDERER.includes("esc(inj.displayBody)"), "徽标/正文均转义");
  assert.ok(RENDERER.includes('inj.kind === "system-notice"') && RENDERER.includes("appendSystemNotice(pane, inj, false)"), "实时注入路径分流系统通知");
  assert.ok(RENDERER.includes("function appendSystemNotice(") && RENDERER.includes("appendUser(pane, inj.remainder, false)"), "标记后的用户正文按普通用户消息渲染（实时）");
  assert.ok(RENDERER.includes('injRow && injRow.kind === "system-notice"') && RENDERER.includes("buildSystemNoticeRow(injRow, true)"), "回放路径分流系统通知（与实时同规则，仅 is-replay 标记）");
  assert.ok(RENDERER.includes('el.className = "msg msg-user is-replay"') && RENDERER.includes("Md.renderMarkdown(injRow.remainder)"), "回放的用户正文走普通用户消息同一 Markdown 管线");

  // 旧用户消息路径不变（手输/普通消息仍是 .msg-user）。
  assert.ok(RENDERER.includes('div.className = "msg msg-user"'), "appendUser 仍产普通用户气泡");
  // 样式钩子：深色主题令牌与对比度。
  for (const cls of [".sys-notice", ".sys-notice .sys-notice-badge"]) assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
  assert.ok(/\.sys-notice \.sys-notice-badge \{[^}]*border: 1px solid var\(--border-strong\);/.test(STYLES), "徽标使用主题边框令牌");
  assert.ok(/\.sys-notice \.sys-text \{[^}]*color: var\(--text\);/.test(STYLES), "通知正文用主文字色（对比度）");
});

// ————————————————— K-1（2026-10-12）：圆角胶囊输入框 + 内嵌发送箭头 —————————————————

test("K-1：输入区为**圆角胶囊**、发送箭头**内嵌框内**；快捷键与状态位保持可达（旧行结构退役）", () => {
  assert.ok(INDEX.includes('id="composer-capsule"') && INDEX.includes('class="capsule"'), "应有胶囊容器 #composer-capsule.capsule");
  const capStart = INDEX.indexOf('id="composer-capsule"');
  const sendPos = INDEX.indexOf('id="btn-send"');
  assert.ok(capStart >= 0 && sendPos > capStart, "发送键应在胶囊容器**之内**（位于其开始标签之后）");
  assert.ok(!INDEX.includes("composer-row"), "旧的「输入框 + 独立发送钮」行结构已退役");
  assert.ok(
    INDEX.includes("Enter 发送，Shift + Enter 换行"),
    "快捷键提示（placeholder）保留"
  );
  assert.ok(
    INDEX.includes('id="composer-hint"') && !INDEX.includes('id="session-state"'),
    "状态提示 #composer-hint 仍可达；「聊天中/空闲」pill 已删（客户 2026-10-13 裁定）"
  );
  // 状态 pill 删除后状态**程序化保留**：setState 把 kind 写到 #chat 的 data-state（外部驱动可断言）。
  assert.ok(/function setState\(kind, label\) \{[\s\S]{0,200}chat\.dataset\.state = kind;/.test(RENDERER), "setState 应把 kind 写到 #chat 的 data-state（程序化保留）");
  assert.ok(RENDERER.includes("e.shiftKey"), "Enter 发送 / Shift+Enter 换行逻辑保留");
  assert.ok(
    RENDERER.includes('$("btn-send").disabled = !state.sessionOpenRoleId'),
    "发送键禁用态口径照旧（未开会话禁用；空输入不发=既有 onSend 守卫）"
  );
  assert.ok(STYLES.includes("border-radius: 999px") && STYLES.includes(".cap-send"), "胶囊圆角与内嵌发送钮样式");
  assert.ok(!STYLES.includes(".composer-row") && !STYLES.includes(".btn-send "), "旧行/旧按钮样式已退役");
});

// ————— K-2（2026-10-12）→ P0-1（2026-10-13 客户批准）：图片端到端接线（随消息送进模型） —————

test("P0-1 图片接线：附件随消息**带载荷上送**（IPC→Interface 重校验→队列定格→句柄透传）；旧「未发送」提示退役", () => {
  assert.ok(INDEX.includes('id="attach-row"') && INDEX.includes('id="btn-attach-image"'), "附件行与选图键存在");
  assert.ok(PRELOAD.includes('"app:pick-image"') && PRELOAD.includes('"app:attach-image"'), "preload 白名单两通道");
  assert.ok(
    MAIN.includes('"app:pick-image"') && MAIN.includes('"app:attach-image"') && MAIN.includes("pickImageFileFn"),
    "主进程注册两通道并实现选图（dialog + fs 读——读在**主进程**）"
  );
  assert.ok(RENDERER.includes("d.pickImage") && RENDERER.includes("d.attachImage"), "渲染侧只经 preload 两方法（不碰文件系统）");
  assert.ok(RENDERER.includes('addEventListener("paste"') && RENDERER.includes('"drop"'), "粘贴与拖入入口齐备");
  assert.ok(RENDERER.includes("attachBrowserFile") && RENDERER.includes("FileReader"), "拖/贴经浏览器 File API 读字节（沙箱能力，不经 Node）");
  assert.ok(!RENDERER.includes("node:fs"), "渲染进程不得引入 Node/fs");
  // P0-1：发送**带载荷上送**——`d.sendSession(text, images)`（`[{type:"image", data:<base64>, mimeType}]`）；
  // 成功（直发/入队）后清附件；失败保留可重试。
  assert.ok(/d\.sendSession\(text, images, \{ projectRoot: projectRoot, roleId: role\.roleId, runtime: runtime \}, \{ clientMessageId: clientMessageId \}\)/.test(RENDERER), "发送应带图片载荷（d.sendSession(text, images)）");
  assert.ok(/images = attachments\.map\(function \(a\) \{[\s\S]{0,120}type: "image"[\s\S]{0,120}data: a\.data[\s\S]{0,120}mimeType: a\.mime/.test(RENDERER), "载荷按契约块组装（type/data/mimeType，取自附件记录的 base64）");
  assert.ok(/function clearSentAttachments\(roleId, keys\) \{/.test(RENDERER), "应有 clearAttachments（发送成功后清附件）");
  assert.ok(/addAttachment\(res\.image, "data:" \+ res\.image\.mime \+ ";base64," \+ res\.image\.dataBase64, false, res\.image\.dataBase64, requestRole\)/.test(RENDERER), "选图路径把 base64 存进附件记录（随消息上送用）");
  // 旧「未发送」提示**退役**（不留死代码；防回潮——图片真正随消息送进模型了）。
  assert.ok(!RENDERER.includes("imageNotWiredNote"), "imageNotWiredNote 应已删（不留死代码）");
  assert.ok(!RENDERER.includes("图片送入模型的能力尚未接线"), "「未接线」文案应已退役");
  assert.ok(!RENDERER.includes("随消息附加的 "), "「N 张图片未发送」行应已退役");
  // 主进程侧：session:send 带载荷 + Interface **重校验**（不信任渲染侧）；队列条目入队定格。
  assert.ok(PRELOAD.includes("Array.isArray(images) ? images : []"), "preload 透传 images 数组（缺省空=纯文本）");
  assert.ok(MAIN.includes('Parameters<DesktopInterface["sendSession"]>[0]') && fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "interface.ts"), "utf8").includes("images?: unknown"), "session:send IPC引用真实Interface输入类型，包含图片与显示关联metadata");
  const IFACE = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "interface.ts"), "utf8");
  assert.ok(IFACE.includes("decodeImageBase64") && IFACE.includes("sniffImageMime") && IFACE.includes("validateImage"), "Interface 层重校验三件套（解码/嗅探/限幅——不信任渲染侧）");
  assert.ok(IFACE.includes("整条拒发") || IFACE.includes("本条消息未发出"), "任一张不合格 ⇒ 整条拒发（fail-closed，绝不丢图发文字）");
  const SESS = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "session.ts"), "utf8");
  assert.ok(SESS.includes("opts?: PromptOptions"), "DeliveryItem 带整包载荷（入队即定格）");
  assert.ok(SESS.includes("await this.sendDelivery(entry, origin, text, opts);"), "直发带原opts与原投递身份进入唯一发送helper");
  const sendDelivery = SESS.slice(SESS.indexOf("  private async sendDelivery("), SESS.indexOf("  private trimDeliveryOrigins("));
  assert.ok(sendDelivery.startsWith("  private async sendDelivery(") && sendDelivery.includes("requiresHandback = false") && sendDelivery.includes("let promptOptions: RoleSessionSendOptions = { ...opts, handback: { required: requiresHandback } };"), "helper每次浅包装原opts并明确来源；即时聊天默认false，原图片引用保留");
  assert.ok(SESS.includes('await this.sendDelivery(entry, origin, sent.text, sendOptions, sent.kind === "dispatch");'), "出队仅dispatch要求回交true，客户聊天及回交false");
  assert.ok(sendDelivery.includes("entry.handle.runtime !== undefined || origin.clientMessageId !== undefined || opts?.onTurnStarted !== undefined"), "只有真实runtime/显示来源/原ack观察者需要必要通知包装");
  assert.ok(sendDelivery.includes("promptOptions = { ...promptOptions, onTurnStarted };"), "ack浅包装来源包并补通知，images数组及图片对象仍为原引用");
  assert.ok(!/\bimages\s*:|\bopts\.[\w]+\s*=|structuredClone|JSON\.parse|\.map\(/.test(sendDelivery), "helper不得重造图片、复制原图或修改调用者opts");
  assert.ok(sendDelivery.includes("await entry.handle.send(text, promptOptions);") && !sendDelivery.includes("await entry.handle.send(text);"), "每次发送都以两参传递明确来源包，纯文本聊天也带false");
  assert.ok(sendDelivery.includes("this.sessions.get(key) !== entry") && sendDelivery.includes("metadata.runtime !== entry.runtime || metadata.roleId !== entry.roleId") && sendDelivery.includes('typeof metadata.turnId !== "string" || metadata.turnId === ""'), "通知只接受原句柄及权威角色/runtime/有效turn");
  assert.ok(sendDelivery.includes("entry.origins.byTurn.set(metadata.turnId, origin);") && sendDelivery.includes("opts?.onTurnStarted?.(metadata);"), "只绑定原投递，保留调用者原callback通知");
  const MODEL = fs.readFileSync(path.resolve(HERE, "..", "..", "src", "model", "runtime.ts"), "utf8");
  assert.ok(/interface PromptTurnStartedMetadata \{\s*readonly turnId: string;\s*readonly roleId: string;\s*readonly runtime: RuntimeKind;/.test(MODEL), "ack metadata只读，不是授权或可变图片载荷");
  const ADAPTER = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "chat-adapter.ts"), "utf8");
  assert.ok(ADAPTER.includes("takeDemoPromptLog") && /prompt\(text: string, promptOpts\?: PromptOptions\)/.test(ADAPTER), "demo 适配器 prompt 接受并记录 opts（透传保真可断言）");
  assert.ok(STYLES.includes(".attach-chip") && STYLES.includes(".attach-rm"), "缩略图与移除键样式");
  const CI = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "composer-images.ts"), "utf8");
  assert.ok(CI.includes("5 * 1024 * 1024") && CI.includes("ALLOWED_IMAGE_MIMES"), "上限与类型白名单在纯逻辑模块（单一来源）");
  assert.ok(CI.includes("sniffImageMime"), "类型以**真实字节**（魔数）为准——声明 mime/size 不可信");
});

// ————— P0-2（2026-10-13 客户批准）：停止入口——忙碌才可见、三态如实行、不是「结束会话」回归 —————

test("P0-2 停止入口：#btn-halt 在输入框区（发送钮左侧）仅忙碌时出现；与发送钮并存；三态如实行；结束会话按钮不回归", () => {
  // 位置（2026-10-13 客户反馈「位置有问题」后的裁定）：输入框胶囊内、**发送钮左侧**的小圆钮；
  // 聊天头不再有任何按钮。
  assert.ok(INDEX.includes('id="btn-halt"'), "应有停止钮 #btn-halt");
  const capsulePos = INDEX.indexOf('id="composer-capsule"');
  const haltPos = INDEX.indexOf('id="btn-halt"');
  const sendPos = INDEX.indexOf('id="btn-send"');
  assert.ok(capsulePos >= 0 && haltPos > capsulePos && sendPos > haltPos, "停止钮应在输入框胶囊内、发送钮**左侧**（客户反馈后位置）");
  const headStart = INDEX.indexOf('class="chat-head"');
  const headEnd = INDEX.indexOf("</header>", headStart);
  assert.ok(headStart >= 0 && headEnd > headStart && !INDEX.slice(headStart, headEnd).replace(/<button id="(?:runtime-select|tab-work|tab-card)"[\s\S]*?<\/button>/g, "").includes("<button"), "聊天头除已批准引擎combobox外不得有按钮（停止钮已移走）");
  assert.ok(!INDEX.includes('id="btn-stop"'), "退役的「结束会话」按钮不得回归");
  assert.ok(!RENDERER.includes("btn-stop"), "渲染源不得再出现 btn-stop（防回潮钉的子串口径不被新钮破坏）");
  // 圆形次级钮：同款 32px 圆形；hidden 显式补 display:none（display:flex 会压掉 [hidden] 默认）。
  assert.ok(/\.cap-halt \{[^}]*border-radius: 999px;/.test(STYLES), "停止钮同款圆形（999px）");
  assert.ok(/\.cap-halt \{[^}]*background: var\(--bg-soft\);/.test(STYLES), "次级色（不抢发送的实心主色）");
  assert.ok(STYLES.includes(".cap-halt[hidden] { display: none; }"), "hidden 显隐钉（防 display:flex 压掉 [hidden]）");
  assert.ok(INDEX.includes('title="停止当前轮次"'), "hover 提示「停止当前轮次」");
  // 显隐判据 = role-state **真实快照**（busy），随 setChatHeader/onRoleState/换项目清零三处刷新。
  assert.ok(/function updateHaltButton\(\) \{[\s\S]{0,220}state\.roleBusy\[state\.selectedRoleId\] === true/.test(RENDERER), "显隐判据 = role-state 快照的 busy（不做界面侧推测）");
  assert.ok(/btn\.hidden = !busy;/.test(RENDERER), "空闲即隐藏（hidden 属性驱动）");
  assert.ok(!/function updateHaltButton\(\) \{[\s\S]{0,320}btn-send/.test(RENDERER), "停止钮显隐不得触碰发送钮（两钮**并存**、各司其职）");
  const callSites =
    (RENDERER.match(/function setChatHeader\(role\) \{([\s\S]*?)\n  \}/)?.[1] || "").includes("updateHaltButton();") &&
    /renderQueueRow\(roleId\);[\s\S]{0,200}updateHaltButton\(\);/.test(RENDERER) &&
    /state\.roleBusy = \{\};[\s\S]{0,200}updateHaltButton\(\);/.test(RENDERER);
  assert.ok(callSites, "三处刷新点齐备（选角色/快照推送/换项目清零）");
  // 三态如实行（契约 RoleSessionAbortResult：ok/supported/error）。
  assert.ok(/async function onHaltClick\(\) \{[\s\S]{0,300}d\.abortSession\(target\)/.test(RENDERER), "点击调 d.abortSession（IPC→Interface→manager.abort）");
  assert.ok(RENDERER.includes("已请求停止当前轮次——轮次仍会以收尾事件结束。"), "ok 态如实行（不做乐观「已停止」假象）");
  assert.ok(RENDERER.includes("当前运行时不支持停止。"), "supported:false 态如实行（能力缺席如实告知）");
  assert.ok(/"停止失败：" \+/.test(RENDERER), "失败态如实行（错误原文不吞）");
  // 全链通道：preload / 主进程 / 会话管理器。
  assert.ok(PRELOAD.includes('"session:abort"'), "preload 暴露 session:abort");
  assert.ok(MAIN.includes('"session:abort"'), "主进程注册 session:abort");
  const SESS = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "session.ts"), "utf8");
  assert.ok(/async abort\(target: string \| SessionTarget\): Promise<RoleSessionAbortResult>/.test(SESS), "SessionManager.abort 三态回传");
  assert.ok(SESS.includes("entry.handle.abort === undefined"), "方法缺席 = supported:false（与 supported:false 同一处理）");
  const IFACE = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "interface.ts"), "utf8");
  assert.ok(IFACE.includes("abortSession"), "Interface 暴露 abortSession");
});

// ————————————————— D-1（2026-10-12）：重启恢复（主进程解析 → 渲染侧回放 → 徽标「空闲（已恢复）」） —————————————————

test("D-1：会话记录恢复——主进程只读解析并推规范化行；渲染侧回放进该角色 pane（分隔提示 + is-replay）", () => {
  // 通道两端：preload 订阅 + 主进程推送（渲染进程不碰 SDK——解析在 main）。
  assert.ok(PRELOAD.includes("onSessionHistory") && PRELOAD.includes("session:history"), "preload 应暴露 onSessionHistory");
  assert.ok(MAIN.includes("getSessionHistory") && fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "runtime-history.ts"), "utf8").includes("readRoleSessionHistory"), "主进程历史经窗口 helper 调 Pipeline 中立回放（只读）");
  assert.ok(MAIN.includes('"session:history"'), "主进程应推 session:history");
  // 渲染侧：订阅 + 回放（错误分隔 + .is-replay 与实时行可区分；文本走早已立的 esc/Markdown 单一来源）。
  assert.ok(RENDERER.includes("d.onSessionHistory") && RENDERER.includes("onSessionHistory"), "渲染侧应订阅并处理会话恢复");
  // 客户裁定（2026-10-13）：常规「会话已恢复…」分隔行已删（聊天流不摆常规提示）——断言「它不在」，防回潮。
  assert.ok(!RENDERER.includes("会话已恢复（模型上下文一并恢复）"), "常规恢复分隔行应已删（客户裁定：聊天流不摆常规提示）");
  // 2026-10-13 回放去重修复后，错误分隔行**只在全量路径**插入（增量/幂等路径错误态必未变——见 replayHistory）。
  assert.ok(/error !== null && plan\.action === "full"\) \{[\s\S]{0,300}sys-replay-divider/.test(RENDERER), "错误分支的分隔行保留（坏文件如实提示；仅全量路径插入）");
  assert.ok(RENDERER.includes("sys-replay-divider"), "错误分隔行仍有样式钩子（.sys-replay-divider）");
  assert.ok(RENDERER.includes("is-replay"), "回放行应有 is-replay 标记（视觉可区分）");
  assert.ok(RENDERER.includes("会话记录读取失败，未回放"), "坏文件应如实提示而不崩");
  assert.ok(RENDERER.includes("replayHistory") && RENDERER.includes("flushPendingHistories"), "应含回放与（先到数据的）寄存冲洗");
  // 徽标联动：「空闲（已恢复）」态来自纯函数映射（见上一条 B-3 断言）+ 样式钩子。
  assert.ok(STYLES.includes(".st-restored"), "styles.css 应有「已恢复」态样式");
  // 回放样式（分隔虚线 + 统一标记）。
  assert.ok(STYLES.includes(".sys-replay-divider") && STYLES.includes(".is-replay"), "styles.css 应有回放样式");
});

test("D-1 文案分支（pm 2026-10-12 契约钉死）：resumed→无提示；文件在→「已从本地会话文件恢复」；缺失/损坏→（有历史才）「新会话」——唯一映射", async () => {
  const href = new URL("../../app/renderer/role-status.js", import.meta.url).href;
  await import(href);
  const St = (globalThis as Record<string, unknown>).ANSRoleStatus as {
    sessionContextNotice: (f: Record<string, unknown>) => { kind: string; text: string };
  };
  assert.ok(St && typeof St.sessionContextNotice === "function", "应挂 sessionContextNotice（纯函数唯一映射）");
  assert.deepEqual(St.sessionContextNotice({ resumed: true }), { kind: "none", text: "" }, "同运行内续接（句柄在）：无提示");
  assert.equal(St.sessionContextNotice({ contextSource: "resumed" }).kind, "none", "contextSource=resumed 同解");
  assert.equal(
    St.sessionContextNotice({ contextSource: "recovered" }).text.includes("已从本地会话文件恢复"),
    true,
    "文件在：如实说「已从本地会话文件恢复」（dispose 后 / LRU 淘汰后重开走此支——契约：不擦除会话文件）"
  );
  assert.equal(St.sessionContextNotice({ contextSource: "recovered", alreadyAnnounced: true }).kind, "none", "D-1 回放分隔行已说过 → 不重复提示");
  assert.equal(
    St.sessionContextNotice({ contextSource: "fresh", hadHistory: true }).text.includes("不会记得"),
    true,
    "文件缺失 → 真·新会话（**唯一**「不会记得」的情形；有历史才提示）"
  );
  assert.equal(St.sessionContextNotice({ contextSource: "fresh" }).kind, "none", "文件缺失且无历史：无提示（不打扰）");
  assert.equal(
    St.sessionContextNotice({ contextSource: "fresh", hadHistory: true, contextWarning: "本地会话文件损坏（头不合法），未能恢复" }).text.includes("损坏"),
    true,
    "文件损坏：如实用「损坏」措辞"
  );
});

// ————————————————— M-1（2026-10-12 客户裁定「这个太丑了」）：shell 确认卡（应用内） —————————————————

test("M-1：shell 确认卡——命令在 <pre>、摘要/人话原因、折叠详情、拒绝默认焦点；Esc 与关闭 = 不放行；无原生对话框", () => {
  // 结构（index.html）：标题、命令等宽块、白话摘要位、人话「为什么问你」、折叠详情（默认不含 open）、按钮与关闭键。
  assert.ok(INDEX.includes('id="shell-confirm"') && INDEX.includes('class="sc-overlay"'), "应有应用内弹层 #shell-confirm.sc-overlay");
  assert.ok(INDEX.includes("shell 命令请求"), "标题应为「shell 命令请求」");
  assert.ok(/<pre[^>]*id="sc-command"/.test(INDEX), "命令本体应是 <pre> 等宽块（逐字原文）");
  assert.ok(INDEX.includes('id="sc-summary"'), "应有白话摘要位");
  assert.ok(INDEX.includes('id="sc-reason"'), "应有「为什么问你」（人话）位");
  assert.ok(/<details[^>]*id="sc-details"(?![^>]*\bopen\b)/.test(INDEX), "技术详情应折叠（<details> 默认不含 open）");
  assert.ok(INDEX.includes('id="sc-cwd"') && INDEX.includes('id="sc-argv"'), "折叠详情内应有 cwd 与 argv");
  assert.ok(INDEX.includes("放行执行") && INDEX.includes(">拒绝<"), "按钮文案保持 放行执行 / 拒绝");
  // 渲染侧接线：订阅、填充（textContent——无 HTML 注入口）、详情复位收起、拒绝默认焦点。
  assert.ok(RENDERER.includes("d.onShellConfirm") && RENDERER.includes("onShellConfirm"), "渲染侧应订阅确认请求");
  assert.ok(RENDERER.includes('$("sc-command").textContent'), "命令原文应经 textContent 落入（不碰 HTML——不美化/不改写）");
  assert.ok(RENDERER.includes('$("sc-details").open = false'), "每次来新请求详情应复位为收起");
  assert.ok(RENDERER.includes('$("sc-deny").focus()'), "拒绝为默认焦点（fail-closed 的 UI 侧同向）");
  // fail-closed：Esc / 关闭（×）/「拒绝」= allow:false；恰 allow:true 才作为放行回传。
  assert.ok(/e\.key === "Escape"[\s\S]{0,120}respondShellConfirm\(false\)/.test(RENDERER), "Esc ⇒ 不放行");
  assert.ok(
    RENDERER.includes('$("sc-close").addEventListener("click", function () { respondShellConfirm(false); })'),
    "关闭键（×）⇒ 不放行"
  );
  assert.ok(
    RENDERER.includes('$("sc-deny").addEventListener("click", function () { respondShellConfirm(false); })'),
    "拒绝键 ⇒ 不放行"
  );
  assert.ok(RENDERER.includes("allow === true"), "恰 allow:true 才作为放行回传（其余一律 false）");
  assert.ok(RENDERER.includes("此确认已失效") && RENDERER.includes("未获放行"), "失效/回传失败态如实（绝不呈现为已放行）");
  // 通道两端 + 原生对话框退役（shell 确认路径）。
  assert.ok(PRELOAD.includes("onShellConfirm") && PRELOAD.includes('"shell:confirm-request"'), "preload 订阅通道");
  assert.ok(PRELOAD.includes("shellConfirmRespond") && PRELOAD.includes('"shell:confirm-response"'), "preload 回包通道");
  assert.ok(MAIN.includes('"shell:confirm-request"'), "main 应推确认请求（应用内卡）");
  assert.ok(!MAIN.includes("dialog.showMessageBox"), "shell 确认不得再用原生对话框");
  // 样式钩子 + 命令块横滚。
  for (const cls of [".sc-overlay", ".sc-card", ".sc-command", ".sc-details", ".sc-actions", ".sc-hint"]) {
    assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
  }
  assert.ok(/\.sc-command\s*\{[^}]*white-space: pre;/.test(STYLES) && /\.sc-command\s*\{[^}]*overflow-x: auto;/.test(STYLES), "命令块：不折行、可横向滚动");
});

test("SU 命令审批卡：标题/档位/可见原因/绕过写边界警告/拒绝默认焦点；project 卡逐字回归", async () => {
  const UL = await loadUiLabelsForGovernance();
  // 纯映射：标题按 policy；档位标签按 tier（未知不编）。
  assert.equal(UL.shellConfirmTitle("su-approval"), "SU 命令审批");
  assert.equal(UL.shellConfirmTitle("project"), "shell 命令请求");
  assert.equal(UL.shellConfirmTitle(undefined), "shell 命令请求", "旧请求/缺 policy 保持原文");
  // 2026-10-19 客户截图反馈：五个内置治理角色与 su 同走审批档（policy 仍为 su-approval），
  // 但标题必须按实际角色显示，不再显示「SU」；显示名与注册表 displayName 同序（英文 / 中文）。
  assert.equal(UL.shellConfirmTitle("su-approval", "verifier"), "命令审批 · Proof / 验收");
  assert.equal(UL.shellConfirmTitle("su-approval", "liaison"), "命令审批 · Lead / 主理");
  assert.equal(UL.shellConfirmTitle("su-approval", "rapporteur"), "命令审批 · Draft / 提案");
  assert.equal(UL.shellConfirmTitle("su-approval", "nominator"), "命令审批 · Crew / 组队");
  assert.equal(UL.shellConfirmTitle("su-approval", "convener"), "命令审批 · Steward / 统筹");
  assert.equal(UL.shellConfirmTitle("su-approval", "su"), "SU 命令审批", "单模型 su 仍显示 SU");
  assert.equal(UL.shellConfirmTitle("project", "implementer"), "shell 命令请求", "项目角色保持既有兜底");
  assert.equal(UL.shellConfirmTitle("su-approval", "unknown-role"), "SU 命令审批", "未知角色不编名字，按审批档兜底");
  assert.equal(UL.shellConfirmTitle("su-approval", 42), "SU 命令审批", "坏 roleId 不当成角色");
  assert.equal(UL.shellConfirmTitle("project", "verifier"), "命令审批 · Proof / 验收", "roleId 优先于 policy");
  assert.equal(UL.suApprovalTierLabel("risky"), "风险命令（risky）");
  assert.equal(UL.suApprovalTierLabel("review"), "未自动判定（review）");
  assert.equal(UL.suApprovalTierLabel("deny"), "硬拒类（deny）");
  assert.equal(UL.suApprovalTierLabel(null), "", "未知档位不编标签（只呈原因/警告）");
  // 渲染接线（复用既有 sc-title/sc-summary/sc-reason/sc-hint，零 HTML 改动）。
  assert.ok(RENDERER.includes('var suApproval = payload.policy === "su-approval";'), "su 分支显式（缺省=project 原行为）");
  assert.ok(RENDERER.includes('var confirmRoleId = typeof payload.roleId === "string" && payload.roleId !== "" ? payload.roleId : cur.roleId;'), "标题角色 id 优先取载荷、回退当前卡记录");
  assert.ok(RENDERER.includes('$("sc-title").textContent = UiLabels.shellConfirmTitle(payload.policy, confirmRoleId)'), "标题按 policy + 实际角色动态设置");
  assert.ok(RENDERER.includes("UiLabels.suApprovalTierLabel(payload.tier)"), "档位标签按 tier 呈现");
  assert.ok(RENDERER.includes("批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。"), "必备绕过写边界警告逐字");
  assert.ok(/suApproval && typeof payload\.reasonRaw === "string"[\s\S]{0,180}"命中原因：" \+ payload\.reasonRaw/.test(RENDERER), "su 卡可见命中原因（reasonRaw 单独一行）");
  assert.ok(RENDERER.includes('$("sc-reason").textContent = reasonText'), "原因经 textContent（无 HTML 注入口）");
  assert.ok(RENDERER.includes('$("sc-deny").focus()'), "拒绝为默认焦点（su 卡同样不得默认批准）");
  assert.ok(!/\$\("sc-allow"\)\.focus\(\)/.test(RENDERER), "不得默认聚焦批准键");
  assert.ok(!INDEX.includes("记住") && !INDEX.includes("不再询问") && !RENDERER.includes("记住选择"), "无「记住/不再询问」");
  assert.ok(!INDEX.includes("is-su-approval"), "零 HTML 改动：su 类由渲染侧切换");
  // project 卡逐字回归：只有 su 分支拼档位/可见命中原因/警告；project 保持原值。
  assert.ok(/summaryText = suApproval && tierLabel \? \(summary \? tierLabel \+ " · " \+ summary : tierLabel\) : summary;/.test(RENDERER), "project 摘要原样（仅 su 拼档位）");
  assert.ok(/reasonText = typeof payload\.reasonPlain === "string" \? payload\.reasonPlain : "";/.test(RENDERER), "project 原因=reasonPlain");
  assert.ok(/\(suApproval \? SU_APPROVAL_WARNING \+ " " : ""\) \+ SHELL_CONFIRM_DEFAULT_HINT/.test(RENDERER), "project hint 原样；su 追加警告");
  // 拒绝/取消不调用放行路径：三入口均 false；恰 allow:true 才回传放行。
  assert.ok(RENDERER.includes('$("sc-deny").addEventListener("click", function () { respondShellConfirm(false); })'), "拒绝 ⇒ allow:false");
  assert.ok(RENDERER.includes('$("sc-close").addEventListener("click", function () { respondShellConfirm(false); })'), "关闭 ⇒ allow:false");
  assert.ok(/e\.key === "Escape"[\s\S]{0,140}respondShellConfirm\(false\)/.test(RENDERER), "Esc ⇒ allow:false");
  assert.ok(/allow: allow === true/.test(RENDERER), "恰 allow:true 才可能放行");
  // 样式：原因保留换行；su 档位行加粗、警告用未决色（既有 token）。
  assert.ok(STYLES.includes(".sc-reason { white-space: pre-wrap; }"), "原因保留换行");
  assert.ok(STYLES.includes("#shell-confirm.is-su-approval .sc-summary { font-weight: 600; }") && STYLES.includes("#shell-confirm.is-su-approval .sc-hint { color: var(--amber); }"), "su 卡档位/警告样式钩子");
});

// ————————————————— G-2/U1（2026-10-16 客户批准；设计 2026-10-16_design_role-watchdog-and-closure）—————————————————
// 恢复确认卡（§6.2：提议 → 一键确认 → 恰 allow:true 执行 → 回执）与 `[系统]` 消息行样式（§3.3/§7.3）。

test("G-2 U1：恢复确认卡——动作/目标角色/证据逐字；恰「执行」=allow:true；取消/Esc/关闭=不执行；等待不设限（无计时器）", () => {
  // 结构（index.html）：复用 shell 卡组件族（sc-overlay/sc-card/sc-actions/sc-hint）；证据 <pre> 逐字块。
  assert.ok(INDEX.includes('id="recovery-confirm"') && INDEX.includes('class="sc-overlay"'), "应有应用内弹层 #recovery-confirm.sc-overlay（复用确认卡组件族）");
  assert.ok(INDEX.includes("恢复操作请求"), "标题应为「恢复操作请求」");
  assert.ok(INDEX.includes('id="rc-action"') && INDEX.includes('id="rc-role"'), "应有动作行与目标角色行");
  assert.ok(/<pre[^>]*id="rc-evidence"/.test(INDEX), "证据应是 <pre> 逐字块");
  assert.ok(INDEX.includes('id="rc-allow"') && INDEX.includes('id="rc-deny"') && INDEX.includes('id="rc-close"'), "执行/取消/关闭三键齐备");
  assert.ok(/<button id="rc-deny"[^>]*class="btn btn-primary"/.test(INDEX), "取消为默认焦点样式（fail-closed 同向）");
  assert.ok(INDEX.includes('id="rc-hint"') && INDEX.includes("仅点「执行」才会执行"), "fail-closed 提示行如实：默认不执行");
  // 渲染侧接线：订阅（通道缺席 ⇒ 不订阅、零影响——W5 未落树前的 fail-closed）；填充经 textContent（无 HTML 注入口）。
  assert.ok(RENDERER.includes("d.onRecoveryConfirm") && RENDERER.includes("function onRecoveryConfirm"), "渲染侧应订阅恢复确认请求（具备时）");
  assert.ok(RENDERER.includes('$("rc-evidence").textContent'), "证据原文应经 textContent 落入（逐字——不美化/不改写/不截断）");
  assert.ok(RENDERER.includes('$("rc-deny").focus()'), "取消为默认焦点（fail-closed 的 UI 侧同向）");
  // fail-closed：Esc / 关闭（×）/「取消」= allow:false；恰 allow:true 才作为执行请求回传。
  assert.ok(/e\.key === "Escape"[\s\S]{0,160}respondRecoveryConfirm\(false\)/.test(RENDERER), "Esc ⇒ 不执行");
  assert.ok(RENDERER.includes('$("rc-close").addEventListener("click", function () { respondRecoveryConfirm(false); })'), "关闭键（×）⇒ 不执行");
  assert.ok(RENDERER.includes('$("rc-deny").addEventListener("click", function () { respondRecoveryConfirm(false); })'), "取消键 ⇒ 不执行");
  assert.ok(/recoveryConfirmRespond\(\{ id: cur\.id, allow: allow === true \}\)/.test(RENDERER), "恰 allow:true 才作为执行请求回传（其余一律 false）");
  // 失效/通道异常如实终态（绝不呈现为已执行）；等待不设限 = 无计时器（同 G-1 钉子口径）。
  assert.ok(RENDERER.includes("未获执行") && RENDERER.includes("请让提议方重新发起"), "失效态如实（未获执行 + 出路）");
  assert.ok(RENDERER.includes("按 fail-closed 不执行"), "通道异常态如实（未接通道 ≠ 已执行）");
  assert.ok(!RENDERER_CODE_NO_JUDGE.includes("setTimeout") && !RENDERER_CODE_NO_JUDGE.includes("setInterval"), "恢复卡不得有任何计时器（等待不设限——裁定 4）");
  // 动作人话标签=纯映射（未知动作只呈现原始 token——不假装认识）；渲染侧不自写第二份语义。
  assert.ok(RENDERER.includes("UiLabels.recoveryActionView"), "动作标签应经纯映射取");
  // 样式钩子 + 证据块换行/可滚。
  for (const cls of [".rc-action", ".rc-role", ".rc-evidence", ".rc-evidence-label"]) {
    assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
  }
  assert.ok(/\.rc-evidence\s*\{[^}]*white-space: pre-wrap;/.test(STYLES), "证据块 pre-wrap（逐字、不横滚丢内容）");
});

test("G-2 U1：恢复动作纯映射——三枚冻结枚举的人话标签+后果说明；未知动作 null（不假装认识）", async () => {
  const href = new URL("../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  const UL = (globalThis as Record<string, unknown>).ANSUiLabels as {
    recoveryActionView: (a: unknown) => { label: string; note: string } | null;
  };
  assert.ok(UL && typeof UL.recoveryActionView === "function", "应挂 recoveryActionView（纯函数）");
  assert.equal(UL.recoveryActionView("abort-turn")?.label, "停止本轮");
  assert.equal(UL.recoveryActionView("rebuild-session")?.label, "重建会话");
  assert.equal(UL.recoveryActionView("redeliver")?.label, "重新投递");
  for (const a of ["abort-turn", "rebuild-session", "redeliver"]) {
    assert.ok((UL.recoveryActionView(a)?.note || "").length > 0, a + " 应带后果说明（客户看卡所需）");
  }
  assert.equal(UL.recoveryActionView("disable-role"), null, "未冻结的动作 ⇒ null（渲染侧只呈现原始 token）");
  assert.equal(UL.recoveryActionView(""), null);
  assert.equal(UL.recoveryActionView(null), null);
});

test("G-2 U1：`[系统]` 消息行——聊天流单独样式（来源=系统）；队列视图来源标签与不可撤回呈现", () => {
  // 聊天流：system 类注入行按 kind 出类名（is-system 落点）+ 系统图标 + 标签（分类器单一来源）。
  assert.ok(RENDERER.includes('"msg msg-injected is-" + inj.kind'), "注入行类名按 kind 生成（is-system 落点）");
  assert.ok(RENDERER.includes('inj.kind === "system" ? ICONS.shield : ICONS.send'), "系统消息用系统图标（区分来源）");
  assert.ok(RENDERER.includes('Tr.classifyInjectedMessage'), "聊天流归类经 tool-rows 单一来源（含 system）");
  // 队列视图：撤回判据只认 message 类 ⇒ system 行**不出现撤回钮**（不可撤回呈现；与派发/回交同款只读面）。
  assert.ok(RENDERER.includes('var canWithdraw = v.kind === "message" && !running;'), "system 不满足撤回判据（不可撤回呈现）");
  // 样式钩子。
  assert.ok(STYLES.includes(".msg-injected.is-system"), "styles.css 应有系统消息样式钩子");
});

// ————————————————— N-1（2026-10-12 客户裁定）：导入项目按钮文案两态 —————————————————

test("N-1：「导入项目 / 切换项目」按钮文案——纯函数两态 + 导入→清空回退；判据用已有状态（不靠界面猜测）", async () => {
  const href = new URL("../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  const UL = (globalThis as Record<string, unknown>).ANSUiLabels as { pickProjectLabel: (h: unknown) => string };
  assert.ok(UL && typeof UL.pickProjectLabel === "function", "应挂 globalThis.ANSUiLabels");
  assert.equal(UL.pickProjectLabel(true), "切换项目", "已有项目 ⇒ 「切换项目」");
  assert.equal(UL.pickProjectLabel(false), "导入项目", "未导入（回退）⇒ 「导入项目」");
  assert.equal(UL.pickProjectLabel(undefined), "导入项目", "缺省（未设）同回退");
  assert.equal(UL.pickProjectLabel(null), "导入项目", "清空回退");
  assert.equal(UL.pickProjectLabel("x"), "导入项目", "非布尔真值不当「已有」——判据只认既有状态的布尔转写");
  // 渲染侧接线：判据 = state.projectRoot（已有状态）；applyListing（导入/切换落定）刷新按钮；初始也刷新。
  assert.ok(RENDERER.includes("UiLabels.pickProjectLabel(hasProject)"), "渲染侧应经纯映射取文案");
  assert.ok(
    /var hasProject = typeof state\.projectRoot === "string" && state\.projectRoot !== ""/.test(RENDERER),
    "判据只取已有状态 state.projectRoot（不靠界面猜测）"
  );
  assert.ok(
    /function applyListing\(res, fresh\) \{[\s\S]{0,160}state\.projectRoot = res\.projectRoot;\n    updatePickButton\(\);/.test(RENDERER),
    "applyListing 应刷新按钮文案（导入/切换同一路径落定）"
  );
  assert.ok(RENDERER.includes("updatePickButton();"), "初始也应刷新（未导入 ⇒ 「导入项目」）");
  const ulPos = INDEX.indexOf('src="ui-labels.js"');
  const rPos = INDEX.indexOf('src="renderer.js"');
  assert.ok(ulPos >= 0 && ulPos < rPos, "index.html 应先加载 ui-labels.js");
  assert.ok(INDEX.includes(">导入项目</button>"), "初始静态文案=「导入项目」（未导入态）");
});

// ————————————————— N-2（2026-10-12 客户裁定）：右栏角色卡 Markdown 渲染 —————————————————

test("N-2：右栏角色卡走既有 Markdown 管线（同 esc 单一来源）；XSS 反向用例照旧；边界/变更/文档三组未动", async () => {
  const href = new URL("../../app/renderer/markdown.js", import.meta.url).href;
  await import(href);
  const Md = (globalThis as Record<string, unknown>).ANSMarkdown as {
    renderMarkdown: (t: string) => string;
    esc: (t: unknown) => string;
  };
  assert.ok(Md && typeof Md.renderMarkdown === "function" && typeof Md.esc === "function", "应挂 globalThis.ANSMarkdown");
  // 综合样例（markdown 语法 + XSS 载荷）：渲染产物是白名单标签；`<script>` 不得成标签。
  const out = Md.renderMarkdown("# 角色 A\n\n**负责** `<x>`\n\n<script>alert(1)</script>");
  assert.ok(out.includes("<h1>"), "标题应成标签（markdown 渲染生效）");
  assert.ok(out.includes("<strong>"), "粗体渲染");
  assert.ok(!/<script/i.test(out), "XSS 反向用例：<script> 不得成标签");
  assert.ok(out.includes("&lt;script&gt;"), "<script> 应转为转义文本");
  assert.ok(out.includes("&lt;x&gt;"), "行内码里的尖括号同样转义");
  // 渲染侧接线：角色卡经 Md.renderMarkdown（同一 esc 单一来源）；不再走裸 esc 文本路径；样式钩子 card-md。
  assert.ok(/Md\.renderMarkdown\(role\.cardText/.test(RENDERER), "角色卡应经 Md.renderMarkdown 渲染");
  assert.ok(!RENDERER.includes("esc(role.cardText"), "角色卡不再走纯文本 esc 路径");
  assert.ok(RENDERER.includes("card-text card-md"), "应有样式钩子 card-md");
  assert.ok(!RENDERER.includes("function esc("), "esc 单一来源未破（renderer 不自持第二份转义）");
  // 同轮后段（N-4）已把变更记录/文档索引一并接 Markdown——此处只钉「边界表格保持结构化」。
  assert.ok(RENDERER.includes("renderBoundaryTable(role.boundary)"), "边界条目保持结构化表格（N-4 亦然）");
  assert.ok(/Md\.renderMarkdown\(role\.changelog\.text\)/.test(RENDERER), "变更记录已接同一管线（N-4；本组不再断言其旧纯文本形态）");
  assert.ok(/Md\.renderMarkdown\(md\)/.test(RENDERER), "文档索引已接同一管线（N-4）");
  // 样式：card-md 解除 pre-wrap、块级排版与聊天流同款。
  assert.ok(/\.card-text\.card-md \{ white-space: normal; \}/.test(STYLES), "markdown 态解除 pre-wrap");
  assert.ok(STYLES.includes(".card-md pre.md-pre") && STYLES.includes(".card-md a.md-link"), "代码块/链接同款样式（通用 card-md 块）");
});

// ————————————————— N-3（2026-10-12 追加）：右栏「待办 / 队列」组 —————————————————

test("N-3：右栏「待办 / 队列」——夹具逐条渲染（来源/摘要/位置/进行中）、长内容不铺开、空占位、切角色切数据", async () => {
  const href = new URL("../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  const UL = (globalThis as Record<string, unknown>).ANSUiLabels as {
    queueSourceLabel: (k: string) => string;
    shortenQueueItem: (t: string, n?: number) => string;
    queueItemViews: (q: unknown, r: unknown) => { pos: string; source: string; text: string; at: string; kind: string; id: string; full: string }[];
  };
  assert.ok(UL && typeof UL.queueItemViews === "function", "应挂 queueItemViews（纯函数）");
  // 来源固定映射（客户语言）+ 未知保守占位；system（G-2 看护/收束/恢复回执）= 来源「系统」（非角色）。
  assert.equal(UL.queueSourceLabel("dispatch"), "su 派发");
  assert.equal(UL.queueSourceLabel("message"), "客户消息");
  assert.equal(UL.queueSourceLabel("handback"), "回交投递");
  assert.equal(UL.queueSourceLabel("system"), "系统");
  assert.equal(UL.queueSourceLabel("其它"), "投递");
  // 长内容不铺开：有界截断（默认 80 + …）。
  const cut = UL.shortenQueueItem("长".repeat(500));
  assert.ok(cut.length <= 81 && cut.endsWith("…"), "超长摘要截断（长内容不铺开）");
  assert.equal(UL.shortenQueueItem("短 句"), "短 句", "短内容原样（只压空白）");
  // 夹具：进行中一条 + 排队三条（含 system）→ 视图行逐条（位置/来源/文本/入队时间原样转出）。
  const views = UL.queueItemViews(
    [
      { kind: "message", sourceRoleId: "A", summary: "你：排队一", at: "2026-10-12T03:00:00.000Z" },
      { kind: "dispatch", sourceRoleId: "su", summary: "派发 · 来自 su：做X", at: "2026-10-12T03:01:00.000Z" },
      { kind: "system", sourceRoleId: "", summary: "[系统·看护] 投递排队积压：…", at: "2026-10-12T03:02:00.000Z" },
    ],
    { kind: "handback", sourceRoleId: "A", summary: "回交投递 · 来自 A", at: "2026-10-12T02:59:00.000Z" }
  );
  assert.equal(views.length, 4, "进行中 + 排队三条");
  assert.deepEqual(views.map((v) => v.pos), ["进行中", "1", "2", "3"], "进行中在最前；排队位置 1..N（**排队 ≠ 已执行**）");
  assert.deepEqual(views.map((v) => v.source), ["回交投递", "客户消息", "su 派发", "系统"], "逐条来源标签（system ⇒ 「系统」）");
  assert.equal(views[1].text, "你：排队一");
  assert.equal(views[1].at, "2026-10-12T03:00:00.000Z", "入队时间原样转出");
  assert.equal(views[3].kind, "system", "system 条目按原 kind 转出（渲染侧撤回判据据此不摆撤回钮）");
  assert.deepEqual(UL.queueItemViews([], null), [], "空队列 ⇒ 无行（渲染侧走占位）");
  // 渲染侧接线：随 role-state 快照**定点更新**（不重排手风琴）；仅当前查看角色；切角色经 renderRight 取数。
  assert.ok(RENDERER.includes("d.onRoleState") && RENDERER.includes("function updateRightQueue("), "随真实快照更新右栏待办组（不造第二套数据源）");
  assert.ok(RENDERER.includes("state.selectedRoleId === roleId") && RENDERER.includes("updateRightQueue(roleId)"), "仅当前查看的角色才更新右栏");
  assert.ok(/queueViewsFor\(role\.roleId\)/.test(RENDERER), "renderRight 按所选角色取队列（切角色切数据）");
  assert.ok(RENDERER.includes("无进行中或排队消息"), "空队列显式占位");
  assert.ok(/esc\(v\.pos\)/.test(RENDERER) && /esc\(v\.source\)/.test(RENDERER) && /esc\(v\.text\)/.test(RENDERER), "每字段 esc（禁直插）");
  assert.ok(RENDERER.includes('当前工作') && RENDERER.includes('排队'), "工作与排队明确分开");
  assert.ok(RENDERER.includes('setTabBadge("work", views.length + (roleId ? openRequestCountFor(roleId) : 0))'), "角标来自同份工作快照");
  assert.ok(RENDERER.includes("is-running"), "「进行中」行有视觉区分钩子");
  assert.ok(STYLES.includes(".queue-list") && STYLES.includes(".q-item.is-running") && STYLES.includes(".q-src"), "样式钩子齐备");
});

// ————————————————— N-4（2026-10-12 客户裁定「都要 markdown 化」）：其余接入点 —————————————————

test("N-4：变更记录/文档索引/回交卡摘要一并 Markdown 化（同一管线与卡-md 钩子；XSS 反向；证据列表仍 esc）", async () => {
  const href = new URL("../../app/renderer/markdown.js", import.meta.url).href;
  await import(href);
  const Md = (globalThis as Record<string, unknown>).ANSMarkdown as { renderMarkdown: (t: string) => string };
  assert.ok(Md && typeof Md.renderMarkdown === "function", "应挂 globalThis.ANSMarkdown（同一管线实例）");
  // 三接入点：都经 `Md.renderMarkdown`（同一函数、同一配置）；旧纯文本路径退役。
  assert.ok(/Md\.renderMarkdown\(role\.changelog\.text\)/.test(RENDERER), "变更记录正文经 Md");
  assert.ok(/Md\.renderMarkdown\(md\)/.test(RENDERER), "文档索引（路径清单）经 Md");
  assert.ok(RENDERER.includes("Md.renderMarkdown(preview)") && RENDERER.includes("Md.renderMarkdown(full)"), "回交卡摘要经 Md");
  assert.ok(!RENDERER.includes("esc(role.changelog.text)"), "变更记录不再走纯文本 esc 路径");
  assert.ok(!RENDERER.includes("esc(hb.summary"), "回交卡摘要不再走纯文本 esc 路径");
  // 卡片其余部分纪律不变：**证据列表**保持逐条 esc（不拼成一段 Markdown）。
  assert.ok(
    RENDERER.includes("esc(reportText(item))") && RENDERER.includes('<ul class="hb-evidence">'),
    "证据条目逐条 esc（保持列表——不拼成一段 Markdown）"
  );
  // XSS 反向用例：逐接入点载荷（含 <script>/<img onerror>/<iframe>）经同一模块一律为转义文本、不得成标签。
  const samples = [
    "# 标题\n\n<script>alert(1)</script>",
    "**粗** <img onerror=alert(1)>",
    "- `docs/x.md`\n\n<iframe src=x></iframe>",
  ];
  for (const s of samples) {
    const out = Md.renderMarkdown(s);
    assert.ok(!/<script/i.test(out) && !/<img/i.test(out) && !/<iframe/i.test(out), "不得成标签：" + s);
  }
  // esc 单一来源未破（renderer 不自持第二份转义/渲染实现）+ card-md 钩子共用。
  assert.ok(!RENDERER.includes("function esc("), "renderer 不自持第二份转义");
  assert.ok((RENDERER.match(/card-md/g) || []).length >= 4, "角色卡/变更记录/文档索引/回交卡摘要共用 card-md 钩子");
  assert.ok(STYLES.includes(".card-md pre.md-pre") && STYLES.includes(".card-md a.md-link"), "通用 card-md 块样式在用");
});

// ————————————————— P-1（2026-10-12 真机：待确认卡被 288 行活动淹没、客户以为卡丢了）：到达即达 + 常驻 chip —————————————————

test("P-1：待确认卡可达性——到达即达（底部阈值内滚到卡/上翻不打断，阈值 120px）+ 常驻 chip（计数/逐张定位/终态灭）+ 切回滚到卡；三处指示同源", async () => {
  const href = new URL("../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  const UL = (globalThis as Record<string, unknown>).ANSUiLabels as {
    arrivalScrolls: (v: unknown, d: unknown, t?: unknown) => boolean;
    pendingChipLabel: (n: unknown) => string;
    AUTO_SCROLL_THRESHOLD_PX: number;
  };
  // 阈值与两分支（纯函数）。
  assert.equal(UL.AUTO_SCROLL_THRESHOLD_PX, 120, "距底阈值 = 120px（派工：如距底 ≤120px）");
  assert.equal(UL.arrivalScrolls(true, 0), true, "在底部 ⇒ 到达即滚到卡");
  assert.equal(UL.arrivalScrolls(true, 120), true, "阈值边界含（≤120）");
  assert.equal(UL.arrivalScrolls(true, 121), false, "超出阈值（在往上翻）⇒ **不打断**");
  assert.equal(UL.arrivalScrolls(false, 0), false, "不在该角色 ⇒ 不打扰（指针/徽标/chip 承担）");
  assert.equal(UL.arrivalScrolls(undefined, 5), false, "缺省保守：不滚");
  assert.equal(UL.arrivalScrolls(true, NaN), false, "非法距离不滚");
  // chip 文案（计数）。
  assert.equal(UL.pendingChipLabel(1), "有 1 条待确认 · 定位");
  assert.equal(UL.pendingChipLabel(3), "有 3 条待确认 · 定位");
  assert.equal(UL.pendingChipLabel(0), "", "计数 0 ⇒ 空串（chip 隐藏）");
  assert.equal(UL.pendingChipLabel(-2), "", "非法计数不显示");
  // 渲染侧接线：单一状态源（openRequestIdsFor）+ 三处指示同点刷新。
  assert.ok(RENDERER.includes("function openRequestIdsFor("), "未作答 id 列表（单一状态源）");
  assert.ok(
    /function openRequestCountFor\(roleId\) \{\s*return openRequestIdsFor\(roleId\)\.length;\s*\}/.test(RENDERER),
    "计数复用同一状态源（无第二份遍历）"
  );
  assert.ok(
    /function refreshAwaitingBadge\(roleId\) \{\s*metaFor\(roleId\)\.awaitingConfirm = openRequestCountFor\(roleId\) > 0;\s*renderRoleTree\(\);\s*updateOpChip\(roleId\);/.test(
      RENDERER
    ),
    "徽标刷新的同一处也刷 chip（左树徽标 / pane 指针 / chip 三者一致）"
  );
  assert.ok(RENDERER.includes("【待确认】角色 ") && RENDERER.includes("点左侧该角色查看"), "既有当前 pane 指针保留（本轮不动）");
  // 到达判定：经纯映射 + 条件滚动（不满足 ⇒ 不 scrollBottom）。
  assert.ok(RENDERER.includes("UiLabels.arrivalScrolls("), "到达判定经纯映射");
  assert.ok(
    /if \(arrivalShouldScrollToCard\(entry\.roleId\)\) scrollBottom\(pane\);/.test(RENDERER) === false &&
      RENDERER.includes("var nearBottomAtArrival = !isMirror && arrivalShouldScrollToCard(entry.roleId);") &&
      RENDERER.includes("if (nearBottomAtArrival) scrollBottomForced(pane);"),
    "物化时：**先量后挂**（到达前距离为判据），仅在阈值内滚到卡（强制贴底）；否则不打断阅读"
  );
  // chip：元素/文案/计数/逐张定位/隐藏。
  assert.ok(RENDERER.includes('"op-chip"') && RENDERER.includes("op-chip-text") && RENDERER.includes("UiLabels.pendingChipLabel("), "chip 元素与文案位");
  assert.ok(/function updateOpChip\(roleId\)/.test(RENDERER) && RENDERER.includes("el.hidden = true"), "chip 隐藏路径（非查看中/计数 0/终态后）");
  assert.ok(RENDERER.includes("openRequestIdsFor(roleId)") && RENDERER.includes("scrollToOperatorCard(roleId, ids["), "点击 chip ⇒ 逐张定位（到达次序循环）");
  assert.ok(RENDERER.includes("opChipState.cursor = 0;"), "计数变化 ⇒ 定位游标复位（先给最早那张）");
  // 定位 = 滚动 + 高亮（一次性 CSS 动画；无计时器）。
  assert.ok(RENDERER.includes("function scrollToOperatorCard(") && RENDERER.includes('el.classList.add("is-flash")'), "定位=滚动到卡+高亮");
  assert.ok(RENDERER.includes("el.scrollIntoView({ block: \"center\" })"), "滚动容器=#chat（块居中）");
  assert.ok(!RENDERER_CODE_NO_JUDGE.includes("setTimeout") && !RENDERER_CODE_NO_JUDGE.includes("setInterval"), "无计时器（G-1 纪律不破；高亮=CSS 动画——一次性警告除外）");
  // 切换：showPane 有未作答卡 ⇒ 滚到卡（P-1 优先）；无卡 ⇒ 到底部（U-1 客户裁定）。
  assert.ok(
    RENDERER.includes("var pendingIds = openRequestIdsFor(key);") && /scrollToOperatorCard\(key, pendingIds\[0\]\)/.test(RENDERER),
    "showPane：切到有未作答卡的角色 ⇒ 滚到卡（P-1 优先）"
  );
  assert.ok(RENDERER.includes("stickPaneToBottomOrCard(key);"), "showPane：无卡 ⇒ 到底部（U-1，经定位助手）");
  assert.ok(RENDERER.includes("updateOpChip(key);"), "showPane 同处刷新 chip（查看状态变了）");
  // 样式钩子。
  assert.ok(STYLES.includes(".op-chip") && STYLES.includes(".op-chip[hidden]") && STYLES.includes(".op-request.is-flash") && STYLES.includes("@keyframes op-flash"), "chip/高亮样式钩子");
  assert.ok(/\.op-chip\s*\{[^}]*position: sticky;[^}]*bottom: 10px;/s.test(STYLES), "chip sticky 贴底（悬浮）");
});

// ————————————————— Q-1/Q-2（2026-10-12 客户「应该虚拟渲染啊」）：批量合帧 + 聊天流窗口化 —————————————————

test("Q-2：窗口化行模型（阈值 150 / 缓冲 30 / spacer / rAF 合帧）；四条滚动语义逐条钉（贴底/卡定位/切回恢复/回放惰性）", () => {
  // 行模型与阈值：小 pane 全挂载（常规会话逐字不变）；≥150 行才窗口化。
  assert.ok(RENDERER.includes("var VIRT_MIN_ROWS = 150;"), "窗口化阈值 = 150 行（少于则全挂载——零行为变化）");
  assert.ok(RENDERER.includes("var VIRT_BUFFER = 30;"), "窗口外缓冲 = 30 行");
  assert.ok(RENDERER.includes("function registerRow(") && RENDERER.includes("function updateVirtualWindow("), "行表 + 窗口更新");
  assert.ok(/rl\.top\.style\.height = sums\[first\] \+ "px";/.test(RENDERER) && /rl\.bottom\.style\.height = sums\[rows\.length\] - sums\[last \+ 1\] \+ "px";/.test(RENDERER), "上下 spacer 撑总高（按行高和）");
  // 行占位口径（2026-10-14 锚点漂移修复钉）：`rec.h` = 真实行高（rect，小数）+ pane 行距（flex row-gap）。
  // spacer 记账必须与真实布局同口径——否则窗口构成变化会按行距量级位移正文，开合记录组逐轮累积漂移。
  assert.ok(RENDERER.includes("function rowFootprint(rl, el)") && RENDERER.includes("el.getBoundingClientRect().height + paneRowGap(rl)"), "行占位 = rect 行高（小数）+ pane row-gap");
  assert.ok(RENDERER.includes("parseFloat(getComputedStyle(rl.pane).rowGap)"), "行距实读计算样式（不硬编码 16）");
  assert.ok(RENDERER.includes("rl.rowGap === null && rl.pane.isConnected"), "脱离文档的 pane 读不到样式表 ⇒ 只在已连接时缓存行距（读不到不得当 0 写死——后台事件/恢复数据会先于挂载建行表）");
  assert.ok(RENDERER.includes("return rl.rowGap === null ? 0 : rl.rowGap;"), "行距未读到时返回暂缺省（挂载后实测修正），不污染缓存");
  assert.ok(!/\.el\.offsetHeight/.test(RENDERER), "行高实测不再直接取 offsetHeight 取整（全走 rowFootprint）");
  const footprintSites = (RENDERER.match(/rowFootprint\(rl, /g) || []).length;
  assert.ok(footprintSites >= 6, "六类实测修正（Detach/首次全量/新挂载/记录组开合/卡定位/流式升级）统一口径（实测 " + footprintSites + " 处）");
  assert.ok(/h: \(typeof estH === "number" && estH > 0 \? estH : 40\) \+ paneRowGap\(rl\),/.test(RENDERER), "估算高入表即补行距（与实测同口径）");
  assert.ok(RENDERER.includes("rec.el = null"), "普通行离窗**丢元素**（不持 DOM）；keepEl 行保留实例");
  assert.ok(RENDERER.includes("keepEl: true"), "交互行（待确认卡/回交卡/注入行）keepEl");
  assert.ok(RENDERER.includes('addEventListener("scroll", onChatScroll)') && RENDERER.includes("requestAnimationFrame(run)"), "滚动经 rAF 合帧（每帧至多一次窗口更新）");
  // 语义①贴底：批量收尾统一贴底（批内抑制——防 per-event scrollHeight 读）。
  assert.ok(/if \(batchDepth > 0\) \{[\s\S]{0,200}batchSuppressedScroll = pane;/.test(RENDERER), "批量期抑制滚动（收尾统一贴底）");
  assert.ok(RENDERER.includes("chat.scrollTop = chat.scrollHeight;"), "贴底保持（收尾执行）");
  // 语义②P-1 卡定位：目标行未实体化 ⇒ **先实体化再滚动**并高亮。
  assert.ok(/rl\.rows\.length >= VIRT_MIN_ROWS[\s\S]{0,400}attachRow\(rl, rec\)/.test(RENDERER), "滚动到卡：窗口化下先实体化目标行");
  assert.ok(RENDERER.includes('el.classList.add("is-flash")'), "定位高亮保持");
  // 语义③=U-1（2026-10-12 客户裁定，**取代** B-2「恢复位置」）：点角色 ⇒ 到底部（有未作答卡则卡优先——
  // P-1）；scrollMemo 已删干净（注释剥离后断言，说明性注释不算）。
  const codeNoComments = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!codeNoComments.includes("scrollMemo"), "scrollMemo 已删干净（不留死代码）");
  assert.ok(
    /function stickPaneToBottomOrCard\(roleId\) \{[\s\S]{0,600}scrollToOperatorCard\(key, pendingIds\[0\]\);[\s\S]{0,400}scrollBottomForced\(paneFor\(key\)\);/.test(RENDERER),
    "切角色：有卡滚到卡、无卡到底部（U-1，定位助手）"
  );
  // 语义④回放惰性：整段包批量，行按需 build（长转录不一次性实体化/解析）。
  const replayBody = RENDERER.slice(RENDERER.indexOf("  function replayHistory("), RENDERER.indexOf("  /** 单条回放行"));
  assert.ok(replayBody.indexOf("batchDepth += 1;") >= 0 && replayBody.indexOf("batchDepth += 1;") < replayBody.indexOf("appendReplayRow(pane") && replayBody.includes("finally") && replayBody.includes("batchDepth -= 1;"), "回放全部呈现被同一批量/finally包住（不 per-row 滚动/布局）");
  assert.ok(RENDERER.slice(RENDERER.indexOf("  function appendReplayRow("), RENDERER.indexOf("  async function refreshProject(")).includes("var rec = registerRow(") && RENDERER.slice(RENDERER.indexOf("  function appendReplayRow("), RENDERER.indexOf("  async function refreshProject(")).includes("function () {"), "回放行走惰性行表（build 在挂载时才跑）");
  // 批量收尾副作用（左树每批一次——原先每事件一次）。
  assert.ok(/function flushBatchSideEffects\(\) \{\s*if \(batchDepth > 0\) return;\s*renderRoleTree\(\);/.test(RENDERER), "左树重渲染每批至多一次");
  // 无计时器纪律不破（rAF 不算计时器）。
  assert.ok(!RENDERER_CODE_NO_JUDGE.includes("setTimeout") && !RENDERER_CODE_NO_JUDGE.includes("setInterval"), "renderer 代码仍无 setTimeout/setInterval（rAF 合帧合规；一次性警告除外）");
  // 样式钩子。
  assert.ok(STYLES.includes(".virt-spacer") && STYLES.includes(".msg-assistant.is-streaming"), "spacer 样式 + 旧行安全网样式（`.is-streaming` 无正常生产者）");
});

test("助手消息即时 Markdown（2026-10-17 实机修复）：roleBusy/未 settled 也不再退化为纯文本", async () => {
  const href = new URL("../../app/renderer/markdown.js", import.meta.url).href;
  await import(href);
  const Md = (globalThis as Record<string, unknown>).ANSMarkdown as { renderMarkdown: (t: string) => string };
  // 完整消息样例（## 标题 + 表格）：必须立即产出结构化标签，而不是原文管道符。
  const out = Md.renderMarkdown("## 结论\n\n| 项 | 值 |\n| --- | --- |\n| a | 1 |");
  assert.ok(out.includes("<h2>结论</h2>"), "## 立即成 <h2>");
  assert.ok(out.includes("<table>") && out.includes("<td>a</td>"), "表格立即成 <table>/<td>");
  assert.ok(!/\|\s*项\s*\|/.test(out), "不得保留原文管道符表格");
  // appendAssistant：新行恒 mdReady=true（即时 Markdown）；判定不再读 roleBusy/settledTurns。
  const start = RENDERER.indexOf("function appendAssistant(");
  const end = RENDERER.indexOf("\n  }", start);
  const body = RENDERER.slice(start, end);
  const bodyCode = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(start > 0 && end > start, "appendAssistant 存在");
  assert.ok(body.includes("buildAssistantRow"), "构造走助手行单点");
  assert.ok(body.includes("mdReady: true"), "新行 mdReady=true（不再等 settled 升级）");
  assert.ok(!bodyCode.includes("roleBusy") && !bodyCode.includes("settledTurns"), "不再按 roleBusy/settledTurns 退化纯文本");
  assert.ok(!bodyCode.includes("streaming"), "appendAssistant 无 streaming 分支");
  // 构造点：mdReady=true 立即 Markdown；mdReady=false 仅为旧行安全网（注释注明、无正常生产者）。
  const buildStart = RENDERER.indexOf("function buildAssistantRow(");
  const buildEnd = RENDERER.indexOf("\n  }", buildStart);
  const buildBody = RENDERER.slice(buildStart, buildEnd);
  assert.ok(buildBody.includes("if (rec.mdReady)") && buildBody.includes("Md.renderMarkdown(rec.data)"), "mdReady=true 立即 Markdown");
  assert.ok(buildBody.includes("安全网"), "mdReady=false 分支注明安全网唯一用途（不构成第二套正常路径）");
  // settle 升级保留为安全网，正常新行不依赖。
  assert.ok(RENDERER.includes("function upgradeStreamingMarkdown("), "settle 安全网仍在");
  assert.ok(RENDERER.includes("仅升级历史上仍为 `mdReady: false` 的助手行"), "安全网注释说明唯一用途");
});

// ————————————————— S-1（2026-10-12 客户「输出不会让滚动条滚动到最底下了」）：流式贴底回归 —————————————————

test("S-1：流式输出双向语义——在底部才贴底（先量后挂）、上翻不拽回；窗口化下贴底在窗口更新**之后**", async () => {
  const href = new URL("../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  const UL = (globalThis as Record<string, unknown>).ANSUiLabels as {
    stickToBottom: (d: unknown, t?: unknown) => boolean;
    STICK_THRESHOLD_PX: number;
  };
  // 纯判据：距底 ≤24px 才算「在底部」（阈值保守；非法值不贴）。
  assert.equal(UL.STICK_THRESHOLD_PX, 24, "流式贴底阈值 = 24px");
  assert.equal(UL.stickToBottom(0), true, "就在底部 ⇒ 贴底");
  assert.equal(UL.stickToBottom(24), true, "阈值边界含（≤24）");
  assert.equal(UL.stickToBottom(25), false, "超出阈值（读者在往上翻）⇒ 不贴、不拽");
  assert.equal(UL.stickToBottom(2000), false, "远在上方 ⇒ 不打断阅读");
  assert.equal(UL.stickToBottom(NaN), false, "非法距离保守不贴");
  assert.equal(UL.stickToBottom(undefined), false, "缺省不贴");
  // 渲染侧接线：流式行**先量后挂**（判定在收付之前）；批量期一次测量（batchStreamPin）。
  assert.ok(RENDERER.includes("function streamShouldPin(pane)"), "流式贴底判定（先量）");
  assert.ok(RENDERER.includes("UiLabels.stickToBottom(") && RENDERER.includes("batchStreamPin"), "经纯映射 + 批内一次测量复用");
  const pinSites = (RENDERER.match(/var pin = streamShouldPin\(pane\);/g) || []).length;
  assert.ok(pinSites >= 5, "流式五类行（assistant/sys/denied/injected/handback）都先量后挂（实测 " + pinSites + " 处）");
  assert.ok(RENDERER.includes("scrollBottom(pane, pin);"), "挂完按判定贴底（pin=false 时不滚）");
  // 强制定点（用户动作/卡到达/切角色/回放）不受流式判定约束。
  assert.ok(RENDERER.includes("scrollBottomForced(pane); // 用户自己的动作：强制贴底"), "appendUser 强制贴底（自己的动作）");
  assert.ok(RENDERER.includes("if (nearBottomAtArrival) scrollBottomForced(pane);"), "P-1 到达即达仍走强制路径");
  assert.ok(RENDERER.includes("if (!prev) scrollBottomForced(pane)") && RENDERER.includes("if (prev && reading) restoreChatReading(pane, reading)"), "首次回放定位最新，正常刷新恢复当前阅读");
  // **S-1 根因钉**：flush 里贴底必须在**窗口更新之后**（修前在前 ⇒ 长会话每批差一整批高度，e2e 实测 339px）。
  const flushStart = RENDERER.indexOf("function flushBatchSideEffects()");
  const flushBody = RENDERER.slice(flushStart, RENDERER.indexOf("\n  }", flushStart));
  assert.ok(
    flushBody.indexOf("updateVirtualWindow(dirty[i]") >= 0 &&
      flushBody.indexOf("updateVirtualWindow(dirty[i]") < flushBody.indexOf('scrollTop = $("chat").scrollHeight'),
    "flush：先更新窗口（挂尾行/高度落定），再贴底"
  );
  // 高度修正后：本就在底部者仍贴底（上翻者绝不拽）——全量实测修正 + spacer 立即重算到位。
  assert.ok(RENDERER.includes("var wasAtBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight <= 1;"), "窗口更新入口记「是否在底部」");
  assert.ok(RENDERER.includes('if (wasAtBottom) $("chat").scrollTop = $("chat").scrollHeight;'), "高度修正后**仅在底部者**补贴底");
  assert.ok(RENDERER.includes("var sums2 = rebuildPrefix(rl);"), "实测修正后立即重算 prefix 并改 spacer 高度（防一帧漂移）");
  assert.ok(RENDERER.includes("scrollBottomForced(pane)") && RENDERER.includes("updateVirtualWindow(pane, { preferTail: true });"), "强制贴底前先让窗口落定（窗口化路径）");
});

// ————————————————— U-1（2026-10-12 客户裁定）：点击角色 ⇒ 到底部 —————————————————

test("U-1：点角色到底部（取代 B-2「恢复位置」；scrollMemo 删净）；有卡仍滚到卡（P-1 保留）；与 S-1 双向语义不互相污染", () => {
  // ① showPane：无卡 ⇒ scrollBottomForced（到底部）；有卡 ⇒ scrollToOperatorCard（卡优先，P-1 例外保留）。
  assert.ok(
    /function stickPaneToBottomOrCard\(roleId\) \{[\s\S]{0,600}scrollToOperatorCard\(key, pendingIds\[0\]\);[\s\S]{0,400}scrollBottomForced\(paneFor\(key\)\);/.test(RENDERER),
    "定位助手：有卡滚到卡 / 无卡到底部"
  );
  assert.ok(RENDERER.includes("stickPaneToBottomOrCard(key);"), "showPane 用定位助手（点角色到底部）");
  assert.ok(
    /state\.sessionOpenRoleId === roleId[\s\S]{0,600}stickPaneToBottomOrCard\(roleId\);/.test(RENDERER),
    "重复点击同一角色 ⇒ 同样到底部（U-1 第 3 点）"
  );
  // ② scrollMemo 死代码删净（注释剥离后断言）。
  const code = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!code.includes("scrollMemo"), "「恢复上次位置」实现已删净（无死代码）");
  assert.ok(!code.includes(":scope > .chat-pane"), "旧「切走记忆」的 outgoing 查询已删");
  // ③ 窗口化兼容：到底部走 forced——forced 内部先 updateVirtualWindow(preferTail)（先实体化尾部再滚，落点准）。
  assert.ok(
    /function scrollBottomForced\(pane\) \{[\s\S]{0,500}updateVirtualWindow\(pane, \{ preferTail: true \}\)/.test(RENDERER),
    "强制到底部：窗口化先挂尾部再滚"
  );
  // ④ 与 S-1 不互相污染：流式判定独立存在（点角色=显式动作 ⇒ forced，不受 streamShouldPin 约束）；
  //    流式行仍走「在底部才贴底」（上翻不拽回——S-1 语义未被动到）。
  assert.ok(RENDERER.includes("function streamShouldPin(pane)") && RENDERER.includes("scrollBottom(pane, pin);"), "S-1 流式判定与点角色强制到底分离");
  assert.ok(RENDERER.includes("if (nearBottomAtArrival) scrollBottomForced(pane);"), "P-1 到达即达仍在（卡到达例外）");
});

// ————————————————— U1（2026-10-16 桌面窗口 e2e 定位 dist=18px）：提示出现后仍贴底 —————————————————

test("U1：会话提示条（.session-notice）出现/增高——「在底部者」补一次贴底；上翻者不打扰；高度不变不动", () => {
  // 病灶（V2 批 fd0ac73 引入）：提示（#composer-hint + #history-projection-note）从聊天区下方移成**上方**
  // 的条（.session-notice，空时 display:none）；selectRole 异步尾部 setHint(res.note)（「续接当前会话。」
  // ≈19px）在贴底**之后**把条展开 ⇒ #chat 高度 -18px、已贴底内容被顶起且无补滚——桌面窗口 e2e
  // U1_WINDOWED_TO_BOTTOM 实测 dist=18px。修法：**先量后写**——改前按 S-1 同款距底判据记「是否在
  // 底部附近」，改后条高确有变化且原在底部才补贴底（上翻者绝不动；高度不变不动，防抖动）。
  assert.ok(RENDERER.includes("function noticeLayoutPin()") && RENDERER.includes("function restickAfterNoticeChange(pin)"), "应有提示条布局粘性助手（先量后写）");
  // ① setHint 与历史投影注记两个写方都走「量—写—补」：写法在文案落定之前，补滚在之后。
  assert.ok(
    /function setHint\(text, source\) \{\s*var pin = noticeLayoutPin\(\)[\s\S]{0,240}\$\("composer-hint"\)\.textContent = text \|\| "";[\s\S]{0,200}restickAfterNoticeChange\(pin\);/.test(RENDERER),
    "setHint：改前记位、改后补滚（U1 主路径）"
  );
  assert.ok(
    /var pin = noticeLayoutPin\(\);[\s\S]{0,160}history\.textContent = meta && meta\.historyNotice \|\| "";[\s\S]{0,120}restickAfterNoticeChange\(pin\);/.test(RENDERER),
    "历史投影注记同住提示条——同款「量—写—补」（不设第二套口径）"
  );
  // ② 粘性口径复用 S-1（在底部附近才贴底——上翻者不打扰），并守 backgroundDelivery（后台视图不得动可见视口）。
  assert.ok(
    /function noticeLayoutPin\(\) \{[\s\S]{0,400}backgroundDelivery\) return null;[\s\S]{0,400}UiLabels\.stickToBottom\(chat\.scrollHeight - chat\.scrollTop - chat\.clientHeight, UiLabels\.STICK_THRESHOLD_PX\)/.test(RENDERER),
    "记位：backgroundDelivery 直接放弃 + S-1 同款阈值判「在底部附近」"
  );
  // ③ 补滚四道闸：原在底部、高度确有变化、批量期抑制（Q-1 收尾统一）、收尾即真贴底。
  assert.ok(
    /function restickAfterNoticeChange\(pin\) \{[\s\S]{0,300}if \(h === pin\.h\) return; \/\/ 提示条高度未变：不动（防抖动）[\s\S]{0,300}batchSuppressedScroll = pane; return; \} \/\/ Q-1：批量期抑制，收尾统一贴底[\s\S]{0,120}pin\.chat\.scrollTop = pin\.chat\.scrollHeight;/.test(RENDERER),
    "补滚：高度未变不动 / 批量期只登记 / 收尾贴底"
  );
  assert.ok(/if \(!pin \|\| !pin\.pinned \|\| backgroundDelivery \|\| !pin\.chat\.isConnected\) return;/.test(RENDERER), "补滚前置闸：原在底部 + 非后台 + 视图仍在");
  // ④ 不新增计时器（本批纪律保持——纯同步量写，不引延迟/抖动）。
  assert.ok(!RENDERER_CODE_NO_JUDGE.includes("setTimeout") && !RENDERER_CODE_NO_JUDGE.includes("setInterval"), "提示条补滚不得引入计时器（一次性警告除外）");
});

// ————————————————— 真机缺陷修复（2026-10-12）：交互卡锚点物化（已决卡切走切回跑到流尾） —————————————————

test("锚点物化：重物化复用既有行（不重建落尾）；registerRow 支持锚点插入；回放锚点表登记与消费；兜底落尾写明且不丢卡", () => {
  // ① 主修复：materializeOperatorCard 先查行表——卡行仍在（keepEl 行被虚拟窗口脱挂≠丢失）⇒ 复用、直接返回。
  assert.ok(
    /function materializeOperatorCard\(requestId, surfaceRoleId\) \{[\s\S]{0,1800}rl0\.rows\[i0\]\.kind === "operator" && rl0\.rows\[i0\]\.requestId === requestId[\s\S]{0,450}return;/.test(RENDERER),
    "物化应先按 requestId 查既有卡行（离屏≠丢失——不得重建追加行表尾）"
  );
  // 旧缺陷的病灶（每次重建都无条件 registerRow 追加尾）不得回潮：去重守卫必须仍存在于重建之前。
  assert.ok(/function materializeOperatorCard\(requestId, surfaceRoleId\) \{[\s\S]{0,1100}cardInPane\(pane, requestId\)/.test(RENDERER), "去重守卫仍在（同卡不重建）");
  // ② registerRow 支持 atIndex（锚点插入 + 右移重编号）。
  assert.ok(/typeof o\.atIndex === "number" && o\.atIndex >= 0 && o\.atIndex <= rl\.rows\.length/.test(RENDERER), "registerRow 应支持 atIndex 锚点插入");
  assert.ok(/rl\.rows\.splice\(at, 0, rec\);[\s\S]{0,120}rl\.rows\[x\]\.index = x;/.test(RENDERER), "插入后其后各行 index 应右移重编号（attachRow/定位/窗口按 index 找行）");
  // ③ 回放锚点表：登记（回放行带 anchorKey）+ 消费（物化时按表落位）。
  assert.ok(RENDERER.includes("function noteReplayAnchor(") && /row\.anchorKey\) noteReplayAnchor\(/.test(RENDERER), "回放行带 anchorKey 时应登记锚点表");
  assert.ok(/function operatorAnchorIndex\(rl, entry\) \{[\s\S]{0,200}entry\.anchorListSeq === rl\.seq/.test(RENDERER), "物化应按锚点表落位（同表校验用 seq）");
  assert.ok(/a\.requestIndex !== null && a\.requestIndex \+ 1 <= rl\.rows\.length\) return a\.requestIndex \+ 1;/.test(RENDERER), "回放锚点应插到调用行之后（两行之间）");
  // ④ 首次到达不加锚（卡=当下最新事件，行表尾即它发生的位置——防同题新请求被插进历史）。
  assert.ok(/var first = !isMirror && entry\.anchorIndex === undefined;[\s\S]{0,160}var atIndex = isMirror \? null : \(first \? null : operatorAnchorIndex\(rl, entry\)\);/.test(RENDERER), "首次物化/镜像面应追加（不加锚）；源面重物化才按锚点落位");
  // ⑤ 兜底：找不到锚点 ⇒ null ⇒ 追加行表尾——绝不丢卡（代码里写明该兜底）。
  assert.ok(/return null; \/\/ 兜底：行表尾（绝不丢卡——位置让位于不丢）/.test(RENDERER), "兜底落尾须在代码写明（绝不丢卡）");
  // ⑥ 探针面：e2e 断言「卡行序索引落在锚点而非行表尾」的读数口。
  assert.ok(RENDERER.includes("rowModelDebug") && RENDERER.includes("replayAnchorDebug"), "应暴露行模型/锚点表探针（e2e 时序断言用）");
  // ⑦ open 与 decided 一视同仁：物化路径不分状态（decided 只影响定格呈现，不影响落位）。
  assert.ok(/entry\.state !== "open"[\s\S]{0,200}freezeOperatorCard\(card, entry\.finalNote\.text/.test(RENDERER), "decided 卡仍按 finalNote 定格呈现（落位同法）");
});

// ————————————————— 右栏图标化 + 抽屉（客户裁定 2026-10-13：右栏不常驻，点了才展示） —————————————————

test("右栏抽屉：默认不占屏（col-right 退役）；图标簇两枚（待办/队列归角色）；点开展示/再点收起/Esc；角标=选中角色待办深度；Pi 面板迁入抽屉且抽屉内不溢出", () => {
  // ① 布局：右栏列（.col-right）退役——栅格两列，聊天列宽不因开关抽屉而改（抽屉=覆盖层）。
  assert.ok(!INDEX.includes("col-right"), "右栏常驻列应退役（.col-right 不在 index.html）");
  assert.ok(INDEX.includes('id="right-drawer"'), "应有右侧抽屉 #right-drawer");
  assert.ok(STYLES.includes("#right-drawer.open") && STYLES.includes("position: absolute"), "抽屉应为覆盖层（absolute + .open 滑出）");
  assert.ok(STYLES.includes("grid-template-columns:var(--sidebar-width) minmax(0,1fr)") && STYLES.includes("--sidebar-width: 248px") && STYLES.includes("--content-max: 900px"), "栅格两列（左栏宽度可调）+ A1 内容列 900");
  assert.ok(!/setTimeout|setInterval/.test(RENDERER_CODE_NO_JUDGE), "无计时器纪律不破（抽屉过渡用 CSS；一次性警告除外）");
  // ② 图标簇：**两枚**（角色资料/Pi 设置）在标题栏控制区、窗口按钮之前；不算 .win-btn（三窗口按钮守卫不破）。
  //    第二轮裁定（2026-10-13）：待办/队列归角色——tab-todo/tab-queue 退役（HTML 与渲染侧接线都不留）。
  assert.ok(INDEX.includes('id="right-tabs"'), "应有右上角图标簇 #right-tabs");
  for (const id of ["tab-card", "tab-pi"] as const) {
    assert.ok(INDEX.includes('id="' + id + '"'), "应有图标按钮 #" + id);
    assert.ok(!new RegExp('id="' + id + '" class="win-btn').test(INDEX), id + " 不是窗口按钮（.win-btn 数量守卫不破）");
  }
  assert.ok(!INDEX.includes('id="tab-todo"') && !INDEX.includes('id="tab-queue"'), "待办/队列独立图标应退役（归角色，客户第二轮裁定）");
  assert.ok(!RENDERER.includes('toggleRightDrawer("todo")') && !RENDERER.includes('toggleRightDrawer("queue")'), "渲染侧不应再绑定退役图标的接线");
  const tabsPos = INDEX.indexOf('id="right-tabs"');
  const controlsPos = INDEX.indexOf('class="titlebar-controls"');
  assert.ok(controlsPos >= 0 && tabsPos > controlsPos, "图标簇应在标题栏控制区（应用右上角）");
  assert.ok(STYLES.includes("-webkit-app-region: no-drag"), "图标按钮应为 no-drag（标题栏是拖动区）");
  // ③ 渲染侧接线：tab 状态机 + 至多开一块 + 同图标再点收起 + Esc + ×。
  assert.ok(RENDERER.includes("rightTab: null"), "state 应持 rightTab（null=全收起，默认不常驻）");
  assert.ok(
    /function toggleRightDrawer\(tab\) \{[\s\S]{0,200}state\.rightTab = state\.rightTab === tab \? null : tab;/.test(RENDERER),
    "点图标：同图标再点=收起、异图标=切换（至多开一块）"
  );
  assert.ok(RENDERER.includes("function closeRightDrawer()"), "应有 closeRightDrawer（×/Esc 收起）");
  assert.ok(/e\.key === "Escape" && state\.rightTab !== null[\s\S]{0,120}closeRightDrawer\(\);/.test(RENDERER), "Esc 应收起抽屉（shell 确认卡优先级在前）");
  assert.ok(RENDERER.includes('$("drawer-close").addEventListener("click", closeRightDrawer);'), "抽屉头 × 应绑定收起");
  // ④ 内容跟随当前选中角色：selectRole/applyListing 的 renderRight() 同处刷 renderTabs()（角标/高亮同步）。
  assert.ok(
    /renderRight\(\);\s*\n\s*renderTabs\(\);/.test(RENDERER),
    "selectRole/applyListing 应同处刷 renderRight + renderTabs（内容与角标跟随选中角色）"
  );
  // ⑤ 角标归角色（收起不丢信息）：角色资料图标角标 = 当前选中角色的待办深度（进行中+排队视图行数；
  //    同一 role-state 快照、无新数据源；继承原待办图标角标语义）。
  assert.ok(/function renderTabs\(\) \{[\s\S]{0,300}queueViewsFor\(roleId\)/.test(RENDERER), "角标应取 queueViewsFor（选中角色的进行中+排队）");
  assert.ok(RENDERER.includes('setTabBadge("work", views.length + (roleId ? openRequestCountFor(roleId) : 0))'), "角色资料图标角标 = 当前选中角色待办深度");
  assert.ok(!RENDERER.includes('setTabBadge("todo"') && !RENDERER.includes('setTabBadge("queue"'), "退役图标不再有角标逻辑");
  assert.ok(/function setTabBadge\(id, n\) \{[\s\S]{0,300}el\.hidden = false;/.test(RENDERER), "角标 >0 才显示（hidden 控制）");
  // v2工作单列表在资料前，全文与资料阅读按角色保留。
  assert.ok(RENDERER.includes('sec("角色卡", null,'), "完整角色卡保留");
  assert.ok(RENDERER.includes('id="right-queue-body" class="role-work"'), "首屏只有一份工作列表");
  assert.ok(!RENDERER.includes('function queueOverviewHtml'), "不再复制队列概览");
  assert.ok(RENDERER.includes('captureDrawerReading();') && RENDERER.includes('restoreDrawerReading(roleId);'), "快照更新保持全文与资料阅读状态");
  assert.ok(RENDERER.includes('sec("边界条目", entries.length'), "边界条目组保留");
  assert.ok(RENDERER.includes('sec("变更记录", role.changelog ? null : "无"'), "变更记录组保留");
  assert.ok(RENDERER.includes('sec("文档", role.docs && role.docs.filter'), "文档组保留");
  // ⑦ Pi 面板迁入抽屉：面板本体在 #right-drawer 内、显隐由 tab 状态驱动（保存/掩码逻辑一字不动）。
  const drawerPos = INDEX.indexOf('id="right-drawer"');
  const piPos = INDEX.indexOf('id="pi-panel"');
  assert.ok(drawerPos >= 0 && piPos > drawerPos, "#pi-panel 应在 #right-drawer 之内（随抽屉展示）");
  assert.ok(/function syncPiPanel\(\) \{[\s\S]{0,200}panel\.hidden = state\.rightTab !== "pi";/.test(RENDERER), "Pi 面板显隐由 tab 状态驱动（syncPiPanel）");
  // ⑧ Pi 抽屉内不溢出（2026-10-13 真机复现修复）：字段堆叠 + 面板可缩 + 抽屉裁剪 + 未展开不可见。
  assert.ok(/#right-drawer \.pi-field \{[^}]*grid-template-columns: 1fr;/.test(STYLES), "抽屉内 Pi 字段堆叠（标签/输入各一行，输入吃满行宽、随抽屉宽度收缩）");
  assert.ok(/#right-drawer \.pi-panel \{[^}]*min-width: 0;/.test(STYLES), "Pi 面板 min-width: 0（不撑破抽屉）");
  assert.ok(/#right-drawer \{[^}]*overflow: hidden;/.test(STYLES), "抽屉应为裁剪边界（overflow: hidden——内容溢出在抽屉内滚动）");
  assert.ok(STYLES.includes("#right-drawer:not(.open) #pi-panel { visibility: hidden; }"), "抽屉未展开时面板不可见（双保险，不依赖状态同步）");
  // ⑨ 样式钩子：图标/角标/抽屉头。
  assert.ok(STYLES.includes(".right-tabs") && STYLES.includes(".tab-btn") && STYLES.includes(".tab-badge") && STYLES.includes(".drawer-head"), "图标簇/角标/抽屉头样式钩子齐备");
});

// ————————— 2026-10-13 真机状态机修复：回放去重（同份历史幂等/增量/重建）+ data-state 随快照回 idle —————————

test("D-1 修复：回放去重——同一份历史幂等（skip）、增长走增量（append）、其余全量重建；重推不再叠加副本", async () => {
  const href = new URL("../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  const UL = (globalThis as Record<string, unknown>).ANSUiLabels as {
    replayPlan: (prev: unknown, next: unknown) => { action: string; from: number };
  };
  assert.ok(UL && typeof UL.replayPlan === "function", "应挂 replayPlan（纯函数）");
  const rr = (kind: string, text: string, at = "2026-10-13T00:00:00.000Z") => ({ kind, text, at });
  const a1 = [rr("user", "一"), rr("assistant", "二")];
  assert.deepEqual(UL.replayPlan(null, a1), { action: "full", from: 0 }, "首次回放 = 全量");
  assert.deepEqual(UL.replayPlan({ rows: a1 }, a1), { action: "skip", from: 0 }, "同一份历史 ⇒ skip（绝不叠加第二份——真机重复渲染修复核心）");
  const a1b = [rr("user", "一", "2026-10-13T00:00:01.000Z"), rr("assistant", "二")];
  assert.equal(UL.replayPlan({ rows: a1 }, a1b).action, "full", "字段变化 ⇒ 全量（重建）");
  const grown = [...a1, rr("user", "三")];
  assert.deepEqual(UL.replayPlan({ rows: a1 }, grown), { action: "append", from: 2 }, "增长（前缀逐字段一致）⇒ 增量（from=旧行数）");
  assert.equal(UL.replayPlan({ rows: grown }, a1).action, "full", "截断 ⇒ 全量重建");
  assert.equal(UL.replayPlan({ rows: a1 }, [rr("user", "一"), rr("assistant", "改了")]).action, "full", "同长不同内容 ⇒ 全量");
  const anchored = [{ ...rr("user", "确认"), requestId: "op-1", anchorKey: "confirm\u0000t", anchor: "request" }];
  assert.equal(UL.replayPlan({ rows: anchored }, [{ ...rr("user", "确认"), requestId: "op-1", anchorKey: "confirm\u0000t", anchor: "conclusion" }]).action, "full", "锚点字段变化同样触发全量（卡落位不漂）");
  // 渲染侧接线：replayHistory 走纯函数策略；skip 幂等返回；full+prev ⇒ 重建 pane；增量只回放尾巴。
  assert.ok(RENDERER.includes("UiLabels.replayPlan(prev, rows)"), "replayHistory 应经纯函数策略");
  assert.ok(/plan\.action === "skip"\) \{[\s\S]{0,260}return;/.test(RENDERER), "skip ⇒ 幂等返回（不追加）");
  assert.ok(/plan\.action === "full"\) \{[\s\S]{0,180}if \(oldList && oldList\.rows\.length\) pane = rebuildPane\(roleId\);/.test(RENDERER) && RENDERER.includes("preserveUncoveredRows(oldList, nextCounts)"), "full遇既有行必须重建并保留未覆盖内容（含首次live→history，不追加副本）");
  assert.ok(/var from = plan\.action === "append" \? plan\.from : 0;/.test(RENDERER), "增量只回放尾巴");
  assert.ok(/replayState\[roleId\] = \{ rows: rows/.test(RENDERER), "每次回放后记住状态（去重判据）");
  assert.ok(RENDERER.includes("replayState = Object.create(null);"), "去重状态随项目作废（resetPanes）");
});

test("data-state 修复：轮末回 idle——data-state 只随 role-state 真实快照（run/idle）", () => {
  assert.ok(/function syncChatState\(roleId\) \{[\s\S]{0,220}state\.roleBusy\[roleId\] === true/.test(RENDERER), "syncChatState 判据 = 真实快照 roleBusy（单一来源）");
  assert.ok(/setState\(busy \? "run" : "idle"/.test(RENDERER), "busy ⇒ run；空闲 ⇒ idle（轮末回 idle 的路径）");
  assert.ok(/updateHaltButton\(\);\n    syncChatState\(role \? role\.roleId : null\);/.test(RENDERER), "setChatHeader（选角色/换项目/开启）同步校准");
  assert.ok(/if \(state\.selectedRoleId === roleId\) syncChatState\(roleId\);/.test(RENDERER), "onRoleState（快照推送）同步校准");
  assert.ok(!RENDERER.includes('setState("run", "聊天中")'), "旧「开启即写死 run、无回 idle 路径」已退役");
  assert.ok(RENDERER.includes('setState("err", "连接失败")'), "err 路径保留（开启失败/异常）");
});

// ————————— P1-1 / P1-2 / P1-3（2026-10-13 客户裁定，产品提案 §P1-1/§P1-2/§P1-3）————————

test("P1-1 UI：待办「全文」展开与「撤回」——仅客户消息且未投递者；派发/回交无撤回钮；撤回/无效各有如实行", () => {
  // 行渲染：canWithdraw 判据（kind==="message" 且非进行中）；全文按钮只在 full≠摘要 时出现。
  assert.ok(/var canWithdraw = v\.kind === "message" && !running;/.test(RENDERER), "仅客户消息且未投递（非进行中）可撤");
  assert.ok(/var expandable = v\.full !== "" && v\.full\.length > v\.text\.length;/.test(RENDERER), "全文比显示摘要更长才出「全文」钮（短消息不摆无用钮）");
  assert.ok(RENDERER.includes('class="q-toggle"') && RENDERER.includes('class="q-withdraw"'), "两枚行内钮齐备");
  assert.ok(RENDERER.includes('class="q-full"') && RENDERER.includes("data-full-id"), "全文块（抽屉内展开，不新开窗口）");
  // 事件委托挂持久节点 #right-body（行重渲染不丢绑定）。
  assert.ok(RENDERER.includes('$("right-body").addEventListener("click", onRightBodyClick);'), "点击委托挂 #right-body");
  assert.ok(RENDERER.includes("withdrawQueuedMessage"), "撤回处理函数在");
  // 如实行文案：ok ⇒「已撤回排队消息：〈摘要〉」；无效 ⇒「撤回无效：〈原因〉」。
  assert.ok(RENDERER.includes('"已撤回排队消息：" +'), "撤回成功如实一行");
  assert.ok(RENDERER.includes('"撤回无效：" +'), "撤回无效如实提示（进行中等）");
  // 通道两端：preload / 主进程 / Interface / 会话管理器（快照 id/full 是撤回与展开的唯一数据源）。
  assert.ok(PRELOAD.includes('"session:withdraw"'), "preload 暴露 session:withdraw");
  assert.ok(MAIN.includes('"session:withdraw"'), "主进程注册 session:withdraw");
  const IFACE = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "interface.ts"), "utf8");
  assert.ok(IFACE.includes("withdrawQueued") && IFACE.includes("manager.withdraw"), "Interface 透传至 SessionManager.withdraw");
  const SESS = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "session.ts"), "utf8");
  assert.ok(SESS.includes("withdraw(targetInput: string | SessionTarget, id: string): WithdrawResult"), "SessionManager.withdraw 三态口径");
  assert.ok(SESS.includes("该条已进入「进行中」，撤回无效"), "进行中撤回无效如实回错（绝不从执行里抽条）");
  assert.ok(SESS.includes("派发/回交属治理流）——只读，不可撤回"), "派发/回交只读口径（与非消息拒绝同语义）");
  assert.ok(SESS.includes('id: i.dedupKey, full: i.kind === "handback" ? i.safeText') && SESS.includes(': i.text'), "快照条目带 id/full（单一数据源）");
  assert.ok(RENDERER.includes('id: typeof o.id === "string" ? o.id : ""') && RENDERER.includes('full: typeof o.full === "string" ? o.full : ""'), "渲染侧防御式转写 id/full");
  assert.ok(STYLES.includes(".q-withdraw") && STYLES.includes(".q-full") && STYLES.includes(".q-toggle"), "样式钩子齐备");
});

test("P1-2：LRU 淘汰跳过 busy + 正在开启者不淘汰；settled 后下一时机再收（源码钉）", () => {
  const SESS = fs.readFileSync(path.resolve(HERE, "..", "..", "app", "desktop", "session.ts"), "utf8");
  assert.ok(/if \(s\.busy\) continue; \/\/ 正在跑轮次的不淘汰/.test(SESS), "候选判据含 !busy（跳过在跑）");
  assert.ok(/keepRoleId !== undefined && id === keepRoleId\) continue;/.test(SESS), "正在开启的那一个也不淘汰（否则用户刚点的会话被自己回收）");
  assert.ok(/await this\.evictBeyondLimit\(key\); \/\/ 正在开启的这一个不淘汰/.test(SESS), "openInternal 传入 keepRoleId");
  assert.ok(/void this\.evictBeyondLimit\(\);/.test(SESS), "settled 收口为「下一时机」（暂超限的账在此还）");
  assert.ok(/if \(oldestId === null\) return; \/\/ 无可回收者（全忙 \/ 只剩刚开启的）：暂超限/.test(SESS), "无可回收 ⇒ 暂超限（不掐断任何在跑任务）");
});

test("P1-3：切换项目一次性防呆——有 busy 才出内联确认条（#chat 之外、不落聊天历史）；无 busy 逐字不变", () => {
  // 位置：聊天流顶部、#chat 之外（不进行表/回放；切项目随重置消失）。
  const barPos = INDEX.indexOf('id="switch-confirm"');
  const chatPos = INDEX.indexOf('<div id="chat"');
  const headEnd = INDEX.indexOf("</header>");
  assert.ok(barPos >= 0 && barPos > headEnd && barPos < chatPos, "确认条在聊天头之后、#chat 之前（聊天流顶部且不在 #chat 内）");
  assert.ok(INDEX.includes(">仍要切换</button>") && INDEX.includes(">取消</button>"), "两端文案齐备");
  // 触发判据：role-state 真实快照；无 busy 走原路径（零提示）。
  assert.ok(/function busyRoleIds\(\) \{[\s\S]{0,200}state\.roleBusy\[k\] === true/.test(RENDERER), "busy 判据 = 真实快照（不靠界面猜测）");
  assert.ok(/if \(busyRoleIds\(\)\.length > 0\) \{\n      showSwitchConfirm\(\);\n      return;\n    \}\n    await doImportProject\(\);/.test(RENDERER), "有 busy ⇒ 只出条不动作；无 busy ⇒ 原路径逐字不变");
  assert.ok(RENDERER.includes('"有 " + ids.length + " 个角色正在工作，切换项目会停止它们——"'), "文案：有 N 个角色正在工作，切换项目会停止它们——");
  assert.ok(RENDERER.includes('$("switch-confirm-cancel").addEventListener("click", hideSwitchConfirm);'), "取消=什么都不发生（仅隐藏）");
  assert.ok(/\$\("switch-confirm-go"\)\.addEventListener\("click", function \(\) \{[\s\S]{0,120}doImportProject\(\);/.test(RENDERER), "确认=走原导入流程（loadProject 首步 stopSession(null) 关闭全部即「会停止它们」的兑现）");
  assert.ok(
    RENDERER.includes("if (!backgroundDelivery && swcf && !swcf.hidden) showSwitchConfirm();"),
    "快照推送时刷新计数；归零自动收起（防呆不再有意义）"
  );
  assert.ok(INDEX.includes("不落聊天历史"), "注释写明口径（动作防呆，不是会话内容）");
  assert.ok(STYLES.includes(".switch-confirm") && STYLES.includes(".switch-confirm[hidden] { display: none; }"), "样式钩子（含 [hidden] 显隐钉）");
});

test("V2 target batch receipt uses one compact factual dl without per-report execution claims", () => {
  assert.ok(RENDERER.includes('class="report-facts delivery-batch-facts"'));
  for (const label of ['接收历史', '目标输入记录', '目标轮次结果']) assert.ok(RENDERER.includes('<dt>' + label + '</dt>'));
  assert.ok(STYLES.includes('.msg-delivery > .persistence-state { margin:14px 0; padding:0; border:0; }'));
  assert.ok(!RENDERER.includes('<p class="delivery-execution">'));
});

test("SV13 received reply folding uses exact receiver turn independently of report source turn", () => {
  assert.ok(RENDERER.includes('function applyReportedTask(pane, turnId, receiver)'));
  assert.ok(RENDERER.includes('applyReportedTask(pane, turnId, true);'));
  assert.ok(RENDERER.includes('本轮回交处理回复原文（展开）'));
  assert.ok(RENDERER.includes('!receiver && taskTurn(rec) === turnId'));
});

test("cold report snapshots sort copied list by valid actual times only, keeping ties and unknown wire order", () => {
  const match = RENDERER.match(/  function orderedHistoryReports\(reports\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, "cold report sort helper exists");
  const order = new Function('reports', match[1]);
  const newer = {reportId:'446dd',at:'2026-10-15T08:46:00Z'}, older = {reportId:'8b6c',at:'2026-10-15T08:05:00Z'};
  const wire = [newer, older];
  assert.deepEqual(order(wire), [older, newer]);
  assert.deepEqual(wire, [newer, older], 'payload is never mutated');
  assert.equal(order(wire)[0], older, 'report identities remain original objects');
  const tie = {...older,reportId:'tie'};
  assert.deepEqual(order([older,tie]), [older,tie]);
  for (const at of [undefined,'invalid','']) {
    const unknown = {reportId:'unknown',at};
    assert.deepEqual(order([newer,unknown,older]),[newer,unknown,older]);
  }
  assert.equal((RENDERER.match(/orderedHistoryReports\(payload\.reports\)/g)||[]).length,2,'both cold replay paths use copy ordering');
});

// ————————————————— 视觉收敛 v3（2026-10-16 客户「按推荐批准，开始实施」）—————————————————
// 批准面：W1–W6（默认档数值）/ W6b / S1–S4 / W9–W11（SVG 弧线转轮）；W7 行高不动；
// 「等待确认卡零动效、不打字光标」为长期约束。数值断言见 e2e（uiux-design-audit.mjs v3 段）；
// 此处钉住**源码不变式**（单点、退役项、防回潮）。

test("v3/W9–W11：全应用唯一一枚 12px SVG 弧线转轮——图源在 role-status.js 单点，字形/边框转轮退役", async () => {
  const href = new URL("../../app/renderer/role-status.js", import.meta.url).href;
  await import(href);
  const St = (globalThis as Record<string, unknown>).ANSRoleStatus as {
    SPINNER_SVG: string;
    statusBadge: (s: string) => { icon: string; iconHtml?: string; label: string };
  };
  // 图源唯一：SPINNER_SVG 常量按批准规格（弧线转轮：约 270° 弧、圆头线端、currentColor、12px）。
  const SVG = St.SPINNER_SVG;
  assert.ok(typeof SVG === "string" && SVG.includes('class="spin-arc"'), "转轮 SVG 带 .spin-arc 钩子（唯一图源）");
  for (const frag of ['viewBox="0 0 12 12"', 'width="12"', 'height="12"', 'cx="6"', 'cy="6"', 'r="4.6"', 'fill="none"', 'stroke="currentColor"', 'stroke-width="1.5"', 'stroke-linecap="round"', 'stroke-dasharray="21.7 7.2"', 'aria-hidden="true"']) {
    assert.ok(SVG.includes(frag), "转轮 SVG 应含批准规格 " + frag);
  }
  // W9：工作徽标经映射带 iconHtml（SVG）；文本字形保留（其余上下文/测试锚点用——非转轮实现）。
  const working = St.statusBadge("working");
  assert.equal(working.iconHtml, SVG, "working 徽标 iconHtml = SPINNER_SVG（映射单一来源）");
  assert.equal(working.icon, "◐", "文本字形字段保留（一态一图标断言不变）");
  const idle = St.statusBadge("idle");
  assert.ok(!idle.iconHtml, "其余状态不给 iconHtml（照旧文本字形）");
  // 渲染单点：statusBadgeHtml 以 iconHtml 优先、缺省 esc 文本字形（不得 DOM 注入——左树重绘会抹掉注入）。
  assert.ok(RENDERER.includes("(badge.iconHtml || esc(badge.icon))"), "渲染侧 iconHtml 优先、缺省 esc（唯一决胜点）");
  assert.ok(RENDERER.includes("St.SPINNER_SVG"), "尾行/loading 复用同一图源（St.SPINNER_SVG）");
  assert.ok(RENDERER.includes('sysRow(pane, "sys-loading", St.SPINNER_SVG'), "W11：开会话 loading 行用同款 SVG 转轮");
  // 退役：边框转轮（.spinner 元素/类、spin 0.8s 关键帧）不得回潮。
  assert.ok(!RENDERER.includes('class="spinner"'), "renderer.js 不得再产 .spinner 元素");
  assert.ok(!STYLES.includes("animation: spin 0.8s") && !STYLES.includes("@keyframes spin {"), "styles.css 边框转轮动画已退役");
  // 动画仅批准的两条规则 + 全局 reduced-motion 兜底（静止弧）。
  assert.ok(STYLES.includes("@keyframes v3spin { to { transform: rotate(360deg); } }"), "转轮关键帧 v3spin");
  assert.ok(STYLES.includes(".ti-status.st-working .ts-ico .spin-arc { animation: v3spin 0.9s linear infinite; transform-origin: 50% 50%; }"), "W9 侧栏动画（0.9s linear、transform 合成）");
  assert.ok(STYLES.includes(".tool-current .spin-arc, .sys-loading .spin-arc { animation: v3spin 0.9s linear infinite; transform-origin: 50% 50%; }"), "W10/W11 复用动画（同款、唯一实现）");
  assert.ok(STYLES.includes(".ti-status .ts-ico { font-size: 10px; line-height: 1; color: var(--text-3); display: inline-flex; width: 12px; height: 12px;"), "W9 图标盒 12px 见方");
  assert.ok(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.001ms !important[\s\S]*animation-iteration-count: 1 !important/.test(STYLES), "reduced-motion 全局兜底（静止弧——验收 #12 数值口径）");
  // 长期约束（第⑦项）：仅 working 态出现转轮；等待确认/恢复卡/chip 不得引入忙碌动效（源码面检查：动效规则只此两条）。
  const animRules = STYLES.match(/animation: v3spin/g) || [];
  assert.equal(animRules.length, 2, "v3spin 动画恰两条规则（其余位置不引入）");
  assert.ok(!/op-chip[^{]*\{[^}]*v3spin/.test(STYLES) && !/op-request[^{]*\{[^}]*v3spin/.test(STYLES) && !/recovery[^{]*\{[^}]*v3spin/.test(STYLES), "op-chip/op-request/恢复卡不得带转轮动效");
});

test("v3/W10+S3：尾行——「正在工作」带同款转轮；chip 可见时不显示「等待你确认」（同一刷新点联动）", () => {
  assert.ok(RENDERER.includes('el.innerHTML = St.SPINNER_SVG + "<span>正在工作</span>"'), "W10：尾行转轮 + 原文案（不新造词）");
  assert.ok(RENDERER.includes("!el.querySelector(\".spin-arc\")"), "W10：重复刷新不重写 innerHTML（不打断旋转帧）");
  // S3：判据 = chip 在屏可见；renderCurrentWork 与 updateOpChip 同源联动（updateOpChip 每次落定可见性后回呼）。
  assert.ok(RENDERER.includes("function opChipShown()"), "S3 判据单点 opChipShown()（读 chip 实际可见性，不设第二状态源）");
  assert.ok(RENDERER.includes("if (awaiting && opChipShown()) { if (el) el.remove(); return; }"), "S3：chip 可见 ⇒ 尾行让位（「正在工作」保留、无 chip 时兜底）");
  const linked = (RENDERER.match(/renderCurrentWork\(roleId\);/g) || []).length;
  assert.ok(linked >= 6, "updateOpChip 三个出口（非 viewing/无请求/可见）均回呼 renderCurrentWork（同源联动）");
  assert.ok(RENDERER.includes("非当前查看角色：chip 承载的是**当前查看角色**的状态"), "updateOpChip 不再被后台角色刷新顺手动到（S3 正确性前提）");
});

test("v3/W1–W6/W6b/S2：样式数值按批准默认档落位（实测口径见 e2e v3 段）", () => {
  // W1 行距 16 / W2 段距 10、h3 16/6 / W3 气泡 9/14+24 / W4 输入区 14/32/12、胶囊 10/14、空框 28、脚注 6 / W5 活动行 5、首行 6、摘要 22 / W6 注入盒 1.6。
  assert.ok(STYLES.includes(".chat-pane { max-width: var(--content-max); gap: 16px; }"), "A1/W1：内容列 900 + 行距 16px");
  assert.ok(STYLES.includes(".msg p { margin: 0 0 10px; }"), "W2：p 段距 10px");
  assert.ok(STYLES.includes(".msg h1, .msg h2, .msg h3 { margin: 16px 0 6px;"), "W2：h1–h3 边距 16/6");
  assert.ok(STYLES.includes(".msg-user { border-radius: 8px 8px 3px 8px; }"), "A2：用户气泡圆角 8（右下 3px 保持）");
  assert.ok(STYLES.includes("padding:9px 14px; line-height:24px;"), "W3：气泡 pad 9/14、行高 24（单行 42px 口径）");
  assert.ok(STYLES.includes(".composer { padding:14px 32px 12px; min-height:0; border-top:0; }"), "W4：输入区 pad 14/32/12（旧层保留）");
  assert.ok(/\.composer \{[^}]*border-top: 1px solid var\(--border\);[^}]*background: var\(--bg-soft\);/.test(STYLES), "A1：输入区上边线 + 次级暗底（D5 深色版）");
  assert.ok(STYLES.includes(".capsule { display:flex; flex-direction:column; align-items:stretch; padding:10px 14px;"), "W4：胶囊 pad 10/14");
  assert.ok(STYLES.includes(".capsule { border-color: var(--border-control); }"), "A2：胶囊控件边框 --border-control（D4）");
  assert.ok(STYLES.includes("background:var(--bg-soft); border-color:var(--border-control); gap:6px; }"), "W4：胶囊 gap 6（深色层）");
  assert.ok(STYLES.includes(".capsule textarea { display:block; width:100%; min-height:28px;"), "W4：空输入框 min-height 28");
  assert.ok(STYLES.includes(".capsule, .attach-row, .compose-note { max-width: var(--content-max); }"), "A1：胶囊/附件/脚注同列 900");
  assert.ok(STYLES.includes("margin:6px auto 0;"), "W4：脚注上距 6");
  assert.ok(STYLES.includes("line-height: 22px; list-style: none;"), "W5：组摘要行高 22");
  assert.ok(STYLES.includes(".tool-activity { display: grid;") && STYLES.includes("gap: 10px; align-items: start; padding: 5px 0;"), "W5：活动行 pad 5");
  assert.ok(STYLES.includes(".tool-activity:first-of-type { margin-top: 6px; }"), "W5：首行上距 6");
  assert.ok(STYLES.includes(".msg-injected .mi-body { color: var(--text-2); line-height: 1.6; }"), "W6：注入盒正文行高 1.6");
  // W7（批准②：不动）与 W8（不在批准清单）：正文行高/空态文案保持 v2。
  assert.ok(STYLES.includes(".msg { font-size:15px; line-height:1.8; }"), "W7 未做：正文 15px/1.8 不动（批准②）");
  // S2：chip 左缘对齐阅读列（自适应；验收=左缘差 ≤8px）。
  assert.ok(STYLES.includes("#chat > .op-chip { margin-left: calc((100% - min(var(--content-max), 100%)) / 2); }"), "S2：chip 随阅读列左缘（A1 改 --content-max）");
  assert.ok(STYLES.includes(".op-chip { align-self: flex-start; min-height: 30px;"), "S2 未动 chip 卡样式（仅加定位规则）");
});

test("v3/W6b+S1/S4+折叠口径：渲染线——system 正文 displayBody、折叠行文案与开合状态机经纯函数/单点", () => {
  assert.ok(RENDERER.includes("var bodyText = typeof inj.displayBody === \"string\" ? inj.displayBody : inj.body;"), "W6b：注入行正文取 displayBody（缺省原文——回交/派发不受影响）");
  assert.ok(RENDERER.includes("Md.renderMarkdown(bodyText)"), "W6b：正文渲染经 displayBody 单点");
  assert.ok(RENDERER.includes("var sum = Tr.callSummary(data.items);"), "S4：组摘要口径经 Tr.callSummary（纯函数单点）");
  assert.ok(RENDERER.includes("sum.calls + ' 个调用'"), "S4：文案「N 个调用」");
  // 折叠口径（2026-10-16 客户批准）修订：旧「· 异常 M」按新口径拆为「含 X 条未放行 / 含 Y 条失败」+
  // 「本轮 N 个调用：a / b ×k / c」分解；未知标注保留。字段来源仍 Tr.callSummary 单点（拆分判据在 tool-rows）。
  assert.ok(RENDERER.includes("\" · 含 \" + sum.denied + \" 条未放行\""), "折叠口径：未放行标注「含 X 条未放行」（sum.denied 单点）");
  assert.ok(RENDERER.includes("\" · 含 \" + sum.failed + \" 条失败\""), "折叠口径：失败标注「含 Y 条失败」（sum.failed 单点）");
  assert.ok(RENDERER.includes("' · 含状态未记录'"), "S1：未知如实标注保留（折叠摘要可见）");
  assert.ok(RENDERER.includes('"本轮 " + (sum.calls + \' 个调用\')'), "折叠口径：折叠行以「本轮 N 个调用：」起头（客户定稿格式）");
  assert.ok(RENDERER.includes("t.name + (t.count > 1 ? \" ×\" + t.count : \"\")"), "折叠口径：工具分解「a / b ×k」（count>1 才带 ×k）");
  assert.ok(RENDERER.includes("Tr.mergePhases(data.items)"), "S1：合并经 Tr.mergePhases（下标映射——data.items 本体不动）");
  // 折叠口径（2026-10-16 客户批准）：运行中默认展开、settled 收为折叠一行、手动开合优先——三个单点接线。
  assert.ok(RENDERER.includes("return state.roleBusy[pane.dataset.roleId || \"\"] === true;"), "折叠口径：运行中默认展开以 roleBusy+settledTurns 同族判据（groupDefaultOpen）");
  assert.ok(RENDERER.includes("foldTurnGroups(pane, ev.turnId)"), "折叠口径：settled 事件收折该轮工具组（foldTurnGroups 接线）");
  assert.ok(RENDERER.includes("groupManualOpen(pane.dataset.roleId || \"\", rec.data.id) !== null") && RENDERER.includes("rec.el.contains(document.activeElement)"), "折叠口径：手动开合优先、组内焦点不吞（foldTurnGroups 守卫）");
  assert.ok(RENDERER.includes("var assocGroup = null;"), "折叠口径：未放行/失败相位并入同调用组行（关联判据在 appendActivity 单点）");
  assert.ok(RENDERER.includes("data-activity-phases"), "S1：合并行携带相位下标（捕获/恢复与逐条身份保留）");
  assert.ok(RENDERER.includes("terminal.toolName || first.toolName"), "S1：终态为准（目标/标签以终态为主、首相位兜底）");
  assert.ok(RENDERER.includes("esc(stateText) + '</span></div>'"), "S1：行态按相位链呈现（各相位信息保留）");
  assert.ok(RENDERER.includes("data-legacy-index=\"' + i + '\""), "S1：各相位折叠详情按下标保留可展开（物化单点不变）");
  // S1 依赖的纯映射在 tool-rows 唯一实现（不在渲染侧另写一份合并逻辑）。
  assert.ok(RENDERER.includes("Tr.mergePhases") && RENDERER.includes("Tr.callSummary"), "合并/计数只经 ANSToolRows 导出（无第二份实现）");
});

// ————— G-4/I7（2026-10-16 客户批准；设计 `2026-10-16_design_role-capability-install` §5.4/§九 I7）—————
// 安装工具行（`install_skill`/`uninstall_skill` 调用本身成行）与 `[系统·安装]` 定格系统行的如实标注——
// 复用既有工具行与 `[系统·<子类>]` 先例，不新造行体系。本测试＝**零特判实证**（沿 G-3「合流即桌面
// 零改动」同款证据形态）：渲染平面（工具行渲染链四个源文件）对两工具名与子类标记**零引用**——无引用
// ⇒ 无特判面 ⇒ 新名字按构造走通用链；行为覆盖由 tool-rows.test.ts 的纯函数用例同批钉住。

test("G-4/I7：安装工具行/系统行零特判——渲染平面对新工具名与 [系统·安装] 标记零引用（按构造走通用链）", () => {
  const stripJs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const toolRows = fs.readFileSync(path.join(APP_DIR, "tool-rows.js"), "utf8");
  const uiLabels = fs.readFileSync(path.join(APP_DIR, "ui-labels.js"), "utf8");
  // 去注释后比对（未来注释里合法提及 G-4 措辞不误伤；代码里出现字面量=特判面=违约）。
  const plane: Array<[string, string]> = [
    ["renderer.js", RENDERER_CODE],
    ["tool-rows.js", stripJs(toolRows)],
    ["ui-labels.js", stripJs(uiLabels)],
    ["styles.css", STYLES.replace(/\/\*[\s\S]*?\*\//g, "")],
  ];
  for (const [name, src] of plane) {
    for (const literal of ["install_skill", "uninstall_skill", "[系统·安装]", "系统·安装"]) {
      assert.ok(!src.includes(literal), `${name} 不得含「${literal}」字面量（特判=违约；新工具名/子类必须按构造走通用链）`);
    }
  }
  // 分类器不逐子类登记（子类集合＝文案单一来源；判据只依赖 `[系统·<子类>] ` 标记形态）：
  // 既有三子类名与新增「安装」都不得出现在归类模块的代码里（防未来把枚举偷偷写进渲染侧）。
  const toolRowsCode = stripJs(toolRows);
  for (const sub of ["看护", "收束", "恢复", "安装"]) {
    assert.ok(!toolRowsCode.includes(sub), `tool-rows.js 代码不得含子类名「${sub}」（判据=标记形态，不逐子类登记）`);
  }
  // 样式体系零新增：系统行复用唯一 is-system 钩子（不得按子类派生样式变体）。
  assert.ok(STYLES.includes(".msg-injected.is-system"), "复用既有系统行样式钩子（无新样式体系）");
  assert.ok(!STYLES.includes(".is-system-"), "不得按子类派生样式类（不加新样式体系）");
  // 通用接线单点（新名字必经此处；与 tool-rows.test.ts 纯函数用例互为因果）：
  // ①特殊工具表（卡片/屏障）单点在 tool-rows（`SPECIAL_TOOLS`）——渲染侧不得持第二份名单
  //（若为安装工具加第二份名单=引入特判面，本断言即红）。
  assert.ok(!RENDERER_CODE.includes("SPECIAL_TOOLS"), "渲染侧不得持第二份特殊工具表（单点在 tool-rows.js）");
  // ②生命周期/独立工具行的工具名直出（display 携带事件走此处——install_skill 实际呈现路径）。
  assert.ok(RENDERER.includes("esc(activity.toolName)"), "生命周期行工具名直出（通用，无逐工具名映射）");
  // ③折叠分解文案按工具名直出（既有 S4 单点，确认其对未知名无白名单依赖）。
  assert.ok(RENDERER.includes("t.name + (t.count > 1 ? \" ×\" + t.count : \"\")"), "折叠分解按工具名直出（无白名单）");
});

// ————— G-4/V2-MCP（2026-10-16 客户批准 V2 分批实施；设计 `2026-10-16_design_role-capability-install` §5.4/§九-V2）—————
// 外来 MCP 工具行（`mcp__<server>__<tool>`——三平台探针定格形态：Claude＝hook start＋泵 result、Codex＝
// `mcpToolCall` item 映射〔适配器 wave B〕、Pi＝既有工具管道行）与 MCP 安装工具行（`install_mcp`/`uninstall_mcp`，
// 设计 §3.2 冻结名）的如实标注＝**渲染平面零改动**（沿 G-3「合流即桌面零改动」与 G-4/I7 同款证据形态）：
// 渲染平面对三组新字面量**零引用**——无引用 ⇒ 无特判面 ⇒ 新名字按构造走通用链（名称解析/折叠计数/详情
// 三面的行为覆盖见 tool-rows.test.ts 同批纯函数用例；`[系统·安装]` 子类复用面由 I7 守卫＋同批用例覆盖）。

test("G-4/V2-MCP：MCP 工具行/安装行零特判——渲染平面对 mcp__/install_mcp/uninstall_mcp 零引用（按构造走通用链）", () => {
  const stripJs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const toolRows = fs.readFileSync(path.join(APP_DIR, "tool-rows.js"), "utf8");
  const uiLabels = fs.readFileSync(path.join(APP_DIR, "ui-labels.js"), "utf8");
  // 去注释后比对（未来注释里合法提及 MCP 措辞不误伤；代码里出现字面量=特判面=违约）。
  const plane: Array<[string, string]> = [
    ["renderer.js", RENDERER_CODE],
    ["tool-rows.js", stripJs(toolRows)],
    ["ui-labels.js", stripJs(uiLabels)],
    ["styles.css", STYLES.replace(/\/\*[\s\S]*?\*\//g, "")],
  ];
  for (const [name, src] of plane) {
    for (const literal of ["mcp__", "install_mcp", "uninstall_mcp"]) {
      assert.ok(!src.includes(literal), `${name} 不得含「${literal}」字面量（特判=违约；MCP 名/安装名必须按构造走通用链）`);
    }
  }
  // 详情面零工具名依赖：toolDetails（展开详情的唯一物化点）只读 display/状态契约，不比对工具名——
  // 新工具名的详情按 display v1 通用呈现（「名称解析/折叠计数/详情」三面之详情面零特判）。
  const detailStart = RENDERER_CODE.indexOf("function toolDetails(activity)");
  const detailFn = RENDERER_CODE.slice(detailStart, RENDERER_CODE.indexOf("\n  }", detailStart));
  assert.ok(detailStart > 0 && detailFn.includes("display"), "详情物化点存在且读 display（单点）");
  assert.ok(!detailFn.includes("toolName"), "详情面不得按工具名分支（display 驱动——MCP 名无特判面）");
  // 名称解析字符集含下划线：tool-rows 的解析正则用 `[\w.-]`（legacy「调用工具 X」识别与「名：目标」瘦身解析
  // 共用）——MCP 名 `mcp__<server>__<tool>`（含双下划线）不因字符集失配。
  assert.ok(toolRows.includes("[\\w.-]+"), "解析字符集 [\\w.-] 在 tool-rows（含下划线命名可命中）");
});

// ————— G-5 wave 2（2026-10-16 客户批准 G-5「按推荐批准，开始实施」）—————
// ①档位控件：设置面板对元数据 `choices` 非空字段以致**选择控件**呈现（值域即选项；缺省/自由文本字段保持现状）；
// ②推理折叠行：「已思考 N 秒 ▸」独立一行——默认折叠（含运行中）、点击展开原文纯文本、omitted 如实文案、
// 时长仅真实信号才显示；复用工具行折叠状态机（手动开合优先/焦点保护/锚点零位移/批尾落地）、不进工具组、
// 不加 [系统·] 前缀、不新造样式体系；回放/历史行同解（结构化行字段，不靠文本猜）。文案/可展开性纯函数
// 断言见 tool-rows.test.ts 同批；此处钉**源码不变式**（单点、接线、退役项）。

test("G-5/wave2：设置面板 choices 字段＝选择控件（值域即选项＋留空未设态）；自由文本字段逐字现状", () => {
  // 判据＝元数据 choices 非空（单一来源；值域按运行时——Codex 无 off 档自动成立），非机密字段不走此支。
  assert.ok(RENDERER_CODE.includes("Array.isArray(f.choices) && f.choices.length > 0"), "判据=choices 非空（元数据单一来源）");
  // 选项文本＝choiceLabels（客户 2026-10-18：推理强度下拉显示 关/低/中/高/极高）；value＝raw choices
  // （面板显示值可读、保存接受值/适配器值域仍是单一来源；缺标签回退 raw）。
  assert.ok(
    /choices\.map\(function \(c, index\) \{[\s\S]{0,260}choiceLabels\[index\][\s\S]{0,260}<option value="' \+ esc\(String\(c\)\) \+ '">' \+ esc\(optionText\)/.test(RENDERER_CODE),
    "选项文本=choiceLabels、value=raw choices（无第二份值域表）"
  );
  assert.ok(RENDERER_CODE.includes("'<option value=\"\">留空（平台默认）</option>'"), "留空项＝未设态（保存侧空串＝清除该键、维持平台默认）");
  assert.ok(RENDERER_CODE.includes("f.value !== \"\" && choices.indexOf(f.value) < 0"), "现存非选项值（手编坏值）附原值选项如实显示——不静默改写、不假装未设");
  assert.ok(RENDERER_CODE.includes("'<select id=\"pi-inp-' + esc(f.key) + '\" class=\"pi-input pi-select\">'"), "选择控件（<select>）走既有 pi-input 盒形");
  // 自由文本字段（choices 缺席/空）＝既有 <input> 路径逐字保留；机密字段照旧（choices 字段均非机密）。
  assert.ok(RENDERER_CODE.includes("'<input id=\"pi-inp-' + esc(f.key) + '\" class=\"pi-input\" type=\"'"), "自由文本字段保持现状（<input> 路径未动）");
  assert.ok(RENDERER_CODE.includes('(f.secret ? \'<button id="pi-toggle-secret"'), "机密字段显示钮照旧");
  // 预填与保存读取两路径对 <select> 同解（input/select 共用 .value 单点，无按控件类型分叉）。
  assert.ok(RENDERER_CODE.includes("else inp.value = typeof f.value === \"string\" ? f.value : \"\";"), "预填经 .value 单点（select 同解）");
  assert.ok(/if \(v !== "" \|\| f\.isSet\) updates\[f\.key\] = v;/.test(RENDERER_CODE), "保存收集经 .value 单点（select 同解）");
  // 样式：选择控件仅补光标态（不新造控件样式体系）。
  assert.ok(STYLES.includes("select.pi-input { cursor: pointer; }"), "select 光标态（盒形复用 .pi-input）");
});

test("G-5/wave2：推理折叠行接线——默认折叠含运行中、状态机复用、可展开性分支、回放同解（结构化字段不靠猜）", () => {
  // live 入口：message ＋ detail.source（投影冻结形）；诊断形如实一行（不假装内容）。
  assert.ok(RENDERER.includes('ev.detail.source === "reasoning") { appendReasoningFromDetail(pane, ev.detail, ev.turnId); return; }'), "live 推理事件→独立推理行（投影冻结形单点入口）");
  assert.ok(RENDERER.includes('ev.detail.source === "reasoning-diagnostic"'), "投影失败诊断形走如实一行");
  assert.ok(RENDERER.includes('label: String(ev.summary || "推理内容无法安全显示")'), "诊断文案取 Service 定格 summary（缺省兜底，不伪造内容）");
  // 回放入口：行数据通道结构化字段 `row.reasoning`（同投递历史状态族）；无字段≠推理行（不靠摘要文本猜）。
  assert.ok(RENDERER.includes('if (row.reasoning && typeof row.reasoning === "object") { appendReasoningFromDetail(pane, { reasoning: row.reasoning }, row.turnId); return; }'), "回放行携带 row.reasoning ⇒ 与 live 同一入口（同解）");
  const entryCalls = (RENDERER.match(/appendReasoningFromDetail\(pane, /g) || []).length;
  assert.equal(entryCalls, 3, "1 定义 + live/回放恰两处入口、同一函数（无第二份渲染）");
  // 默认折叠（含运行中）：open 只在恢复「手动开合」时置位；行构造不读 roleBusy（无「运行中展开」分支——与工具行的刻意差异）。
  assert.ok(RENDERER.includes("el.open = data.open === true; // 先 data 后 el"), "先 data 后 el（程序化守卫）");
  assert.ok(RENDERER.includes("open: manual === true"), "初始开合态＝仅手动态（默认折叠、含运行中）");
  const rowFn = RENDERER.slice(RENDERER.indexOf("  function appendReasoningRow("), RENDERER.indexOf("  /** live/replay 同解入口"));
  assert.ok(rowFn.length > 0 && !rowFn.includes("roleBusy"), "行构造零 roleBusy 依赖（默认折叠不随运行态翻转）");
  assert.ok(!rowFn.includes("activityGroup"), "不进工具组（不读写组状态；组切断由 registerRow 既有语义承担=真实序位）");
  assert.ok(!rowFn.includes("appendActivity"), "不经工具活动路径（推理不是工具调用）");
  assert.ok(rowFn.includes('}, 34, { kind: "reasoning", data: { id: id'), "行走行表（registerRow kind=reasoning）⇒ 批尾统一落地（无计时器）");
  assert.ok(!rowFn.includes("updateVirtualWindow("), "布局走既有批尾/测量机制（不自行落定窗口）");
  // 状态机复用：手动开合记 activityOpen（会话内保持）+ 程序化守卫 + 锚点捕获/恢复（与工具组同款）。
  assert.ok(rowFn.includes("var manual = Object.prototype.hasOwnProperty.call(opens, id) ? opens[id] === true : null;"), "手动态读取（复用 activityOpen 会话内保持）");
  assert.ok(rowFn.includes("if (data.open === el.open) return;"), "程序化改动守卫（不记成手动）");
  assert.ok(/var reading = captureChatReading\(pane\);\n          data\.open = el\.open;\n          opens\[data\.id\] = el\.open;/.test(rowFn), "手动开合先读锚点再改并记档");
  assert.ok(rowFn.includes("refreshActivityHeight(pane, record, reading)"), "改后实测+锚点恢复（阅读锚点零位移语义）");
  // 可展开性分支：omitted/空正文＝如实单行（不摆空展开器）；展开＝原文纯文本（不做 Markdown）+ 投影如实标记。
  assert.ok(rowFn.includes('el.className = "reasoning-record is-plain";'), "不可展开＝如实单行");
  assert.ok(rowFn.includes("esc(data.text)") && !rowFn.includes("Md.renderMarkdown"), "展开正文=esc 纯文本（不做 Markdown 美化）");
  assert.ok(rowFn.includes("esc(data.flags)") && RENDERER.includes("Rt.textFlags(facts.text)"), "脱敏/预算如实标记（已净化/已截断，既有单点）");
  // 文案/可展开性纯函数单点在 tool-rows（renderer 只取用——不在渲染侧另写一份文案）。
  const toolRows = fs.readFileSync(path.join(APP_DIR, "tool-rows.js"), "utf8");
  assert.ok(RENDERER.includes("Tr.reasoningLabel") && RENDERER.includes("Tr.reasoningFoldable"), "取用纯函数单点");
  assert.ok(toolRows.includes("function reasoningLabel(") && toolRows.includes("reasoningLabel: reasoningLabel"), "文案单点在 tool-rows 并导出");
  const labelFn = toolRows.slice(toolRows.indexOf("  function reasoningLabel("), toolRows.indexOf("  /** 可展开性"));
  assert.ok(!labelFn.includes("[系统·"), "不加 [系统·] 前缀（那是投递面定格标记；推理属助手输出面）");
  // 样式：复用既有 details/summary 语法与 chev……无新动画（v3spin 恰两条由既有守卫钉住）。
  assert.ok(STYLES.includes(".reasoning-record > summary { display: flex;") && STYLES.includes(".reasoning-record summary .chev"), "折叠行样式钩子齐备（同工具行折叠语法）");
  assert.ok(!/\.reasoning-record[^{]*\{[^}]*animation:/.test(STYLES), "推理行不得引入新动效（chev 旋转＝既有 transition 语法）");
  assert.ok(STYLES.includes(".reasoning-record .reasoning-body { white-space: pre-wrap;"), "展开正文 pre-wrap（原文换行如实）");
});

// ————— I4：已有角色但无治理记录的项目兼容（2026-10-17 客户批准 B+C；项目管理评审 §二 I4 / §四.1 / §4.5）—————
// 契约：`listProject.governanceRecord = {state:"present"|"missing"|"invalid", reason?}`；
// preload `previewGovernanceRecord(projectRoot)` / `establishGovernanceRecord(projectRoot)`（按名消费，不另起别名）。
// 动作可见谓词**只有一个**：`state.projectRoot && hasRoles === true && governanceRecord.state === "missing"`。

type GovernanceUiLabels = {
  canEstablishGovernance: (hasProject: unknown, hasRoles: unknown, recordState: unknown) => boolean;
  governanceActionFor: (hasProject: unknown, hasRoles: unknown, recordState: unknown) => string | null;
  projectRoleCount: (roles: unknown) => number;
  governanceMissingText: (roleCount: unknown) => string;
  governanceInvalidText: (reason: unknown) => string;
  governanceEmptyState: (roleCount: unknown, primaryRoleId: unknown) => { kind: string; title: string; sub: string };
  governanceFailureView: (phase: unknown, code: unknown, message: unknown) => { lines: string[]; noRetry: boolean };
  governancePinMismatchText: (pinCount: unknown, changed: unknown) => string;
  governancePinMismatchEmptyState: (pinCount: unknown, changed: unknown) => { kind: string; title: string; sub: string; hint: string };
  governanceReacceptPreviewView: (preview: unknown) => {
    title: string;
    fileLines: { status: string; path: string; text: string }[];
    writeLine: string;
    pinLine: string;
    warning: string;
    canConfirm: boolean;
    blockerLines: string[];
  };
  governanceReacceptSuccessText: (pinCount: unknown, changedCount: unknown) => string;
  governanceReacceptFailureView: (phase: unknown, status: unknown, message: unknown) => { lines: string[]; noRetry: boolean };
  rangeChoiceIndex: (choices: unknown, value: unknown) => number;
  rangeChoiceValue: (choices: unknown, index: unknown) => string;
  rangeChoiceLabel: (choices: unknown, labels: unknown, index: unknown) => string;
  shellConfirmTitle: (policy: unknown, roleId?: unknown) => string;
  suApprovalTierLabel: (tier: unknown) => string;
  sidebarCollapsedFromStorage: (value: unknown) => boolean;
  clampSidebarWidth: (value: unknown) => number;
  stepSidebarWidth: (current: unknown, delta: unknown) => number;
  roleTreeScrollDelta: (treeTop: unknown, treeBottom: unknown, itemTop: unknown, itemBottom: unknown) => number;
  SIDEBAR_WIDTH_DEFAULT: number;
  SIDEBAR_WIDTH_MIN: number;
  SIDEBAR_WIDTH_MAX: number;
};

async function loadUiLabelsForGovernance(): Promise<GovernanceUiLabels> {
  const href = new URL("../../app/renderer/ui-labels.js", import.meta.url).href;
  await import(href);
  return (globalThis as Record<string, unknown>).ANSUiLabels as GovernanceUiLabels;
}

test("I4：动作可见谓词单一来源——S1 显示；present/invalid/S0 不显示", async () => {
  const UL = await loadUiLabelsForGovernance();
  assert.ok(UL && typeof UL.canEstablishGovernance === "function", "ui-labels 应导出可见谓词（纯函数）");
  assert.equal(UL.canEstablishGovernance(true, true, "missing"), true, "S1（有项目＋有角色＋missing）⇒ 显示");
  assert.equal(UL.canEstablishGovernance(true, true, "present"), false, "present ⇒ 隐藏");
  assert.equal(UL.canEstablishGovernance(true, true, "invalid"), false, "invalid ⇒ 隐藏（本版不自动覆盖）");
  assert.equal(UL.canEstablishGovernance(true, false, "missing"), false, "S0（无角色）⇒ 隐藏，保持既有 bootstrap 空态");
  assert.equal(UL.canEstablishGovernance(false, true, "missing"), false, "无项目 ⇒ 隐藏");
  assert.equal(UL.canEstablishGovernance("x", true, "missing"), false, "非布尔真值不当「有项目」");
  // 渲染侧只经该单点取判据；不得另立 `governanceRecord.state === "missing"` 比较。
  assert.ok(RENDERER.includes("UiLabels.governanceActionFor("), "渲染侧应经单一谓词取动作（单一来源）");
  assert.ok(!RENDERER.includes("UiLabels.canEstablishGovernance("), "渲染侧不得绕过单一谓词直接调旧导出（旧导出仅保留兼容）");
  assert.ok(!RENDERER_CODE.includes('governanceRecord.state === "missing"'), "不得在渲染侧另立第二份 missing 判据");
  assert.ok(!RENDERER_CODE.includes('state === "pin-mismatch"'), "不得在渲染侧直接比较 pin-mismatch（只经 governanceActionFor）");
});

test("I4 修订：S1 角色数只计项目角色——内置 su（builtIn:true）不计入", async () => {
  const UL = await loadUiLabelsForGovernance();
  const roles = [{ roleId: "su", builtIn: true }, ...Array.from({ length: 7 }, (_, i) => ({ roleId: "r" + i }))];
  assert.equal(UL.projectRoleCount(roles), 7, "内置角色（builtIn:true）不计入项目角色数");
  assert.equal(UL.projectRoleCount([{ roleId: "a" }]), 1, "缺 builtIn 字段按项目角色计（旧枚举兼容）");
  assert.equal(UL.projectRoleCount(undefined), 0, "非数组 ⇒ 0（不崩）");
  assert.equal(UL.projectRoleCount([null, { roleId: "a" }, { roleId: "su", builtIn: true }]), 1, "非对象/内置均跳过");
  const text = UL.governanceMissingText(UL.projectRoleCount(roles));
  assert.ok(text.includes("7 个项目角色"), "状态行应显示 7 个项目角色");
  assert.ok(!text.includes("8 个项目角色"), "状态行不得显示含内置 su 的 8");
  const gv = UL.governanceEmptyState(UL.projectRoleCount(roles), "su");
  assert.ok(gv.sub.includes("7 个项目角色"), "S1 空态应显示 7 个项目角色");
  assert.ok(!gv.sub.includes("8 个项目角色"), "S1 空态不得显示含内置 su 的 8");
  // 计数单点：过滤在 ui-labels，renderer 只经一个包装取用；两处 S1 文案不得再传含内置的总数。
  assert.ok(RENDERER.includes("UiLabels.projectRoleCount(state.roles)"), "计数经 ui-labels 单点");
  assert.ok(/function projectRoleCount\(\) \{\s*return UiLabels\.projectRoleCount\(state\.roles\);/.test(RENDERER), "renderer 单一包装");
  assert.ok(RENDERER.includes("UiLabels.governanceEmptyState(projectRoleCount(), primary)"), "空态用项目角色数");
  assert.ok(RENDERER.includes("UiLabels.governanceMissingText(projectRoleCount())"), "状态行用项目角色数");
  assert.ok(!RENDERER.includes("UiLabels.governanceEmptyState(state.roles.length"), "空态不得再用含内置的总数");
  assert.ok(!RENDERER.includes("UiLabels.governanceMissingText(state.roles.length"), "状态行不得再用含内置的总数");
});

test("I4：S1 空态文案——含「尚无治理记录」与 ans govern 兜底、不含「项目尚未 bootstrap」；S0 逐字不变", async () => {
  const UL = await loadUiLabelsForGovernance();
  const gv = UL.governanceEmptyState(3, "治理者");
  assert.equal(gv.kind, "governance");
  assert.ok(gv.title.includes("尚无治理记录"), "S1 标题应含「尚无治理记录」");
  assert.ok(gv.sub.includes("尚无治理记录"), "S1 说明应说明无治理记录");
  assert.ok(!gv.title.includes("项目尚未 bootstrap") && !gv.sub.includes("项目尚未 bootstrap"), "S1 不得复用 S0 文案");
  assert.ok(gv.sub.includes("ans govern <项目目录>"), "应给 CLI 兜底提示（逐字）");
  assert.ok(gv.sub.includes("治理者") && gv.sub.includes("3 个项目角色"), "主入口取自 primaryRoleId、角色数如实");
  assert.ok(gv.sub.includes("项目角色可按各自边界工作") && gv.sub.includes("暂时无法写入"), "如实说明影响面（不夸大）");
  // 渲染接线：S1 空态走纯函数、主按钮打开预览（非模态），S0 分支逐字保留。
  assert.ok(RENDERER.includes("UiLabels.governanceEmptyState(projectRoleCount(), primary)"), "S1 空态文案经纯映射");
  assert.ok(RENDERER.includes('data-governance-establish>建立治理记录</button>'), "S1 空态主按钮=「建立治理记录」");
  assert.ok(RENDERER.includes('title = "项目尚未 bootstrap";'), "S0 标题逐字保留");
  assert.ok(RENDERER.includes('sub = "与 " + esc(primary) + " 对话，让它把角色建出来；左树会随之长出。";'), "S0 说明逐字保留");
  // 状态行文案：invalid 如实显示原因且说明不自动覆盖；S1 状态行同源。
  assert.equal(UL.governanceInvalidText("记录不可解析"), "治理记录不可用：记录不可解析；本版不自动覆盖");
  assert.equal(UL.governanceInvalidText(""), "治理记录不可用：原因未提供；本版不自动覆盖", "缺原因不编造");
  assert.ok(UL.governanceMissingText(0).includes("0 个项目角色"));
  // 状态行接线：S1 说明与 invalid 原因均经纯函数；invalid 分支不得出现建立按钮。
  assert.ok(RENDERER.includes("UiLabels.governanceMissingText(projectRoleCount())"), "S1 状态行经纯映射");
  assert.ok(RENDERER.includes("UiLabels.governanceInvalidText(record.reason)"), "invalid 状态行经纯映射（reason 逐字）");
  const invalidBranch = RENDERER.slice(
    RENDERER.indexOf('if (state.projectRoot && record.state === "invalid")'),
    RENDERER.indexOf("return modelHtml + migrationBannerHtml();")
  );
  assert.ok(invalidBranch.length > 0 && !invalidBranch.includes("data-governance-establish") && !invalidBranch.includes("data-governance-reaccept"), "invalid 之后无建立/重新接受动作（W4 模型行/迁移条不引入动作）");
});

test("I4：预览面板——将写路径/pin 对象与角色数/采纳/授权来源/旧格式提示/不扩大声明；取消不调 establish", async () => {
  // 面板字段逐项接线（全部 esc；数据来自 preview 契约）。
  for (const field of ["writePaths", "pinPaths", "roleIds.length", "adoptExistingGovernanceDoc", "acceptanceSource", "legacyBoundaryRoleIds"]) {
    assert.ok(RENDERER.includes(field), `预览面板应消费 ${field}`);
  }
  assert.ok(RENDERER.includes("将写入："), "列出将写路径");
  assert.ok(RENDERER.includes("将 pin 的对象（"), "列出将 pin 的对象与数量");
  assert.ok(RENDERER.includes("授权来源（逐字）："), "授权来源逐字展示");
  assert.ok(RENDERER.includes("以下角色的边界仍是旧版 Markdown，将被原样 pin："), "旧格式单独一行提示");
  assert.ok(RENDERER.includes("（迁移属后续版本）"), "明确迁移属后续版本（别让用户以为 V1 会迁）");
  assert.ok(RENDERER.includes("不扩大任何角色写边界、不修改任何角色边界文件内容。"), "声明不扩大/不修改任何角色边界");
  assert.ok(RENDERER.includes("data-governance-cancel"), "面板含 [取消] 按钮");
  // IPC：按契约名消费，不另起别名。
  assert.ok(RENDERER.includes("d.previewGovernanceRecord(projectRoot)"), "预览调 previewGovernanceRecord(projectRoot)");
  assert.ok(RENDERER.includes("d.establishGovernanceRecord(projectRoot, { governanceModel: governanceFlow.model })"), "建立调 establishGovernanceRecord(projectRoot, {governanceModel})");
  // 取消函数：只关面板＋如实提示；**不调用任何 IPC**（尤其 establish）。
  const start = RENDERER.indexOf("function cancelGovernancePreview()");
  const end = RENDERER.indexOf("\n  }", start);
  const fn = RENDERER.slice(start, end);
  assert.ok(start > 0 && end > start, "应存在 cancelGovernancePreview");
  assert.ok(!fn.includes("d.establishGovernanceRecord"), "取消不得调用 establish");
  assert.ok(!fn.includes("d.previewGovernanceRecord"), "取消不得调用 preview");
  assert.ok(fn.includes('setHint("已取消，未写入任何文件。")'), "取消文案逐字");
});

test("I4：禁止重复点击——确认后 disabled＋「正在建立治理记录…」；phase=write 失败不得宣称零副作用", async () => {
  const UL = await loadUiLabelsForGovernance();
  assert.ok(RENDERER.includes("正在建立治理记录…"), "建立中按钮文案");
  assert.ok(/data-governance-establish' \+ \(confirmDisabled \? " disabled"/.test(RENDERER), "建立中/接口未接线时按钮 disabled（防重复点击/不假装可用）");
  // 失败文案构造是纯函数：phase 是「是否零副作用」的唯一依据。
  const writeFail = UL.governanceFailureView("write", "", "写入中断：磁盘错误；可能已写入部分文件，请重新执行。");
  const writeJoined = writeFail.lines.join("\n");
  assert.ok(writeJoined.includes("可能已写入部分文件"), "写入阶段失败逐字保留可能部分写入");
  assert.ok(!writeJoined.includes("未写入任何文件"), "phase=write 时**不得**出现「未写入任何文件」");
  const writeFailCode = UL.governanceFailureView("write", "io-error", "写入中断。");
  assert.ok(!writeFailCode.lines.join("\n").includes("未写入任何文件"), "写入阶段失败带 code 也不得宣称零副作用");
  assert.ok(UL.governanceFailureView("precheck", "", "门禁拒绝。").lines.join("\n").includes("未写入任何文件"), "precheck 失败可声明零副作用");
  assert.ok(UL.governanceFailureView("guard", "busy", "忙").lines.includes("上一次建立仍在进行中；本次未写入任何文件。"), "busy 文案按 §4.5");
  const exists = UL.governanceFailureView("guard", "already-established", "已存在");
  assert.ok(exists.lines.includes("治理记录已存在；本次未写入任何文件。"), "already-established 文案按 §4.5");
  assert.equal(exists.noRetry, true, "already-established 不再提供建立按钮");
  const invalid = UL.governanceFailureView("guard", "invalid-record", "不可用");
  assert.ok(invalid.lines.some((line) => line.includes("治理记录不可用")), "invalid-record 文案按 §4.5");
  assert.equal(invalid.noRetry, true, "invalid-record 不再提供建立按钮");
  // 渲染侧失败路径取纯函数、不自行拼接零副作用。
  assert.ok(RENDERER.includes("UiLabels.governanceFailureView(phase, code, message)"), "失败行经纯函数单点");
  assert.ok(!RENDERER_CODE.includes('lines.push("未写入任何文件。")'), "渲染侧不得自行拼接零副作用文案");
});

test("I4：成功——只认 ok＋phase=write＋completed；逐字 message＋重建提示；刷新 listProject 后动作隐藏", async () => {
  assert.ok(
    RENDERER.includes('res.ok === true && phase === "write" && finalize.status === "completed"'),
    "成功判据 = ok && phase===\"write\" && status===\"completed\""
  );
  assert.ok(RENDERER.includes("治理角色将在下一轮发送前按新边界重建（若正在运行，下一轮结束后生效）。"), "成功追加重建提示（逐字）");
  assert.ok(RENDERER.includes("void refreshListingQuietly(projectRoot);"), "成功后重新取 listProject");
  assert.ok(/refreshListingQuietly\(projectRoot\) \{[\s\S]{0,220}applyListing\(list, false\)/.test(RENDERER), "刷新走既有 applyListing（状态变 present ⇒ 动作隐藏）");
  // 状态落库与旧主进程兜底。
  assert.ok(RENDERER.includes("state.governanceRecord = gr && typeof gr"), "applyListing 应落 governanceRecord");
  assert.ok(RENDERER.includes(': { state: "present" };'), "缺失字段按 present 兜底（旧主进程不显示动作、不崩）");
  assert.ok(RENDERER.includes("reason: typeof gr.reason === \"string\" ? gr.reason : \"\""), "invalid 的 reason 如实转写");
  assert.ok(/renderGovernanceUi\(\);[\s\S]{0,160}refreshEmptyStates\(\);/.test(RENDERER), "列举落地后同步状态行与空态");
});

// ————— D1/D2：治理记录 pin 不符的重新接受（2026-10-17 评审 §5.4；桌面UI 状态行/空态/预览）—————

test("D2：applyListing 接受 pin-mismatch 并保留 pinFiles/pinCount；未知状态 fail-closed", () => {
  assert.ok(RENDERER.includes('var knownGovernanceStates = ["present", "missing", "invalid", "pin-mismatch"];'), "状态白名单显式含 pin-mismatch（无直接比较）");
  assert.ok(RENDERER.includes("pinFiles: Array.isArray(gr.pinFiles) ? gr.pinFiles : []"), "保留逐文件证据");
  assert.ok(RENDERER.includes('pinCount: typeof gr.pinCount === "number" && isFinite(gr.pinCount) ? gr.pinCount : 0'), "保留 pin 总数");
  assert.ok(RENDERER.includes(": { state: \"present\" };"), "未知/缺失状态按 present 兜底（不显示动作）");
  assert.ok(!RENDERER_CODE.includes('=== "pin-mismatch"'), "不得直接比较 pin-mismatch（只经单一谓词）");
  assert.ok(RENDERER.includes("governanceActionVisible()"), "动作仍经单一包装取谓词");
});

test("D2：状态行——reaccept 文案＋[检查并重新接受]；establish/invalid 行为不变", async () => {
  const UL = await loadUiLabelsForGovernance();
  assert.equal(typeof UL.governanceActionFor, "function", "ui-labels 导出单一谓词");
  const fn = RENDERER.slice(RENDERER.indexOf("function governanceStatusHtml()"), RENDERER.indexOf("function normalizeGovernancePreview("));
  assert.ok(fn.includes('if (action === "reaccept")'), "状态行按 reaccept 分支");
  assert.ok(fn.includes("UiLabels.governancePinMismatchText(mismatch.pinCount, mismatch.pinFiles)"), "不一致文案经纯映射（pin 数与明细）");
  assert.ok(fn.includes('data-governance-reaccept>检查并重新接受</button>'), "reaccept 动作按钮逐字");
  assert.ok(fn.includes('if (action === "establish")') && fn.includes("UiLabels.governanceMissingText(projectRoleCount())"), "establish 分支保持既有文案");
  assert.ok(fn.includes("UiLabels.governanceInvalidText(record.reason)"), "invalid 分支保持原因原文");
  const invalidBranch = fn.slice(
    fn.indexOf('record.state === "invalid"'),
    fn.indexOf("return modelHtml + migrationBannerHtml();")
  );
  assert.ok(invalidBranch.length > 0 && !invalidBranch.includes("data-governance-establish") && !invalidBranch.includes("data-governance-reaccept"), "invalid 之后无动作（W4 模型行/迁移条不引入动作）");
});

test("D2：su 空态——reaccept 标题/说明/主按钮/次行；establish 行为不变；按钮已绑定", () => {
  const fn = RENDERER.slice(RENDERER.indexOf("function emptyStateHtml("), RENDERER.indexOf("// —————— I4 治理记录"));
  assert.ok(fn.includes('action === "reaccept"'), "空态按 reaccept 分支");
  assert.ok(fn.includes("UiLabels.governancePinMismatchEmptyState(record.pinCount, record.pinFiles)"), "空态文案经纯映射");
  assert.ok(fn.includes('class="empty-hint"'), "次行 hint 独立呈现");
  assert.ok(fn.includes('data-governance-reaccept>检查并重新接受</button>'), "空态主按钮逐字");
  assert.ok(fn.includes("UiLabels.governanceEmptyState(projectRoleCount(), primary)"), "establish 空态保持既有文案");
  assert.ok(RENDERER.includes('container.querySelector(".chat-empty [data-governance-reaccept]")'), "空态主按钮已绑定打开预览");
});

test("D2：预览——共用 #governance-preview 宿主、mode 分支、按契约调 IPC、取消/关闭不调 IPC、无新增模态", () => {
  // 宿主复用：仍是既有 #governance-preview（非模态），不新增第四个入口。
  assert.ok(RENDERER.includes('preview.id = "governance-preview"'), "复用既有预览宿主");
  assert.ok(!INDEX.includes("governance-modal") && !INDEX.includes("governance-reaccept-modal"), "index.html 无新增模态");
  assert.ok(!STYLES.includes(".governance-modal"), "styles.css 无新增模态样式");
  // 模式与 IPC 名（按契约名消费，不另起别名）。
  assert.ok(RENDERER.includes('mode: "establish"'), "governanceFlow.mode 缺省 establish");
  assert.ok(RENDERER.includes('governanceFlow.mode = reaccept ? "reaccept" : "establish";'), "打开预览按单一谓词定模式");
  assert.ok(RENDERER.includes("d.previewGovernanceReacceptance(projectRoot)"), "预览调 previewGovernanceReacceptance(projectRoot)");
  assert.ok(RENDERER.includes("d.reacceptGovernancePins(projectRoot, digest)"), "确认调 reacceptGovernancePins(projectRoot, digest)");
  assert.ok(RENDERER.includes("preview.previewDigest") && RENDERER.includes("/^[0-9a-fA-F]{64}$/"), "确认前校验 previewDigest 形状（fail-closed）");
  // 取消/关闭函数：零 IPC（建立与重新接受均不得调用）。
  const cancel = RENDERER.slice(RENDERER.indexOf("function cancelGovernancePreview()"), RENDERER.indexOf("function closeGovernancePreview()"));
  const close = RENDERER.slice(RENDERER.indexOf("function closeGovernancePreview()"), RENDERER.indexOf("async function refreshListingQuietly("));
  for (const [name, body] of [["取消", cancel], ["关闭", close]] as const) {
    assert.ok(body.length > 0, name + "函数存在");
    assert.ok(!body.includes("d.reacceptGovernancePins"), name + "不得调用 reaccept");
    assert.ok(!body.includes("d.previewGovernanceReacceptance"), name + "不得调用预览");
    assert.ok(!body.includes("d.establishGovernanceRecord"), name + "不得调用 establish");
  }
  assert.ok(cancel.includes('setHint("已取消，未写入任何文件。")'), "取消如实提示零写入");
  // 预览分支：确认按钮 disabled（busy 或 canConfirm=false）＋blockers 呈现。
  const viewFn = RENDERER.slice(RENDERER.indexOf("function governanceReacceptPreviewHtml("), RENDERER.indexOf("/** 重画状态行与预览面板"));
  assert.ok(viewFn.includes("var confirmDisabled = f.busy || !view.canConfirm;"), "busy/canConfirm=false 时禁用确认");
  assert.ok(viewFn.includes("data-governance-reaccept' + (confirmDisabled ? \" disabled\" : \"\")"), "确认按钮 disabled 接线");
  assert.ok(viewFn.includes("view.blockerLines.forEach"), "blockers 原因逐条呈现");
  assert.ok(viewFn.includes("UiLabels.governanceReacceptPreviewView(f.preview)"), "预览文案经纯映射");
});

test("D2：重新接受成功/失败路径——成功文案单点、主进程驱动刷新；失败按 phase 区分", () => {
  // 成功：文案经纯映射；不自行伪造状态/刷新（由 project:changed → refreshProject 驱动）。
  assert.ok(RENDERER.includes("UiLabels.governanceReacceptSuccessText(preview.pinCount, changedCount)"), "成功文案经纯映射");
  assert.ok(RENDERER.includes("d.onProjectChanged(refreshProject)"), "刷新由主进程 project:changed 驱动");
  const reacceptFn = RENDERER.slice(
    RENDERER.indexOf("async function confirmGovernanceReaccept()"),
    RENDERER.indexOf("\n  }", RENDERER.indexOf("async function confirmGovernanceReaccept()"))
  );
  assert.ok(reacceptFn.includes('status === "completed"'), "成功判据 = status completed");
  assert.ok(!reacceptFn.includes("refreshListingQuietly"), "成功/失败不自行伪造刷新（等主进程事件）");
  assert.ok(!reacceptFn.includes("state.governanceRecord ="), "不自行改治理状态");
  // 失败：phase 是零副作用的唯一依据；write 阶段不提供重试。
  assert.ok(reacceptFn.includes("UiLabels.governanceReacceptFailureView(phase, status, message)"), "失败视图经纯映射");
  assert.ok(reacceptFn.includes("可能已写入部分文件，请核对现场。"), "写入阶段失败如实提示核对现场");
  assert.ok(!reacceptFn.includes("未写入任何文件。"), "渲染侧不得自行拼接零副作用文案");
  assert.ok(reacceptFn.includes('res.phase === "write" || res.phase === "precheck" || res.phase === "guard"'), "phase 白名单归一");
});

// ————— A1+A2 企业级稳定感（2026-10-17 客户批准「按推荐来，A1+A2 实施」；PM 评审 §3.1/§3.2）—————
// 生产代码只改 `styles.css`；下面按 A1（结构）/A2（重量）两块分别钉住 token 与有效规则。

/** WCAG 相对亮度与两色对比度（测试用纯函数；2026-10-19 深色石墨主题按前景/背景两色计算）。 */
function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test("A1：结构——框线、900 内容列、同列 padding、贴底输入区（HTML/JS 零改动）", () => {
  const a1Start = STYLES.indexOf("A1 结构");
  const a2Start = STYLES.indexOf("A2 重量");
  assert.ok(a1Start > 0 && a2Start > a1Start, "样式末尾应有独立的 A1/A2 覆盖块（便于分步回滚）");
  const a1 = STYLES.slice(a1Start, a2Start);
  assert.ok(STYLES.includes("--content-max: 900px"), "D1：内容列 token = 900px");
  assert.ok(/\.col-left \{[^}]*border-right: 1px solid var\(--border\);/.test(STYLES), "左/中 1px 分隔");
  assert.ok(/\.titlebar \{[^}]*border-bottom: 1px solid var\(--border-strong\);/.test(a1), "标题栏下边线（A2 颜色）");
  assert.ok(/\.chat-head \{[^}]*height: auto;[^}]*min-height: 72px;/.test(a1), "会话头 height→min-height（200% 文字不裁切）");
  assert.ok(/\.chat-head \{[^}]*border-bottom: 1px solid var\(--border\);/.test(a1), "会话头下边线");
  assert.ok(a1.includes("padding-left: max(32px, calc((100% - var(--content-max)) / 2));"), "会话头/状态行内容列 padding 左（900 推导）");
  assert.ok(a1.includes("padding-right: max(32px, calc((100% - var(--content-max)) / 2));"), "会话头/状态行内容列 padding 右");
  assert.ok(/@media \(max-width: 1100px\) \{\s*\.chat-head, \.session-notice \{ padding-left: 24px; padding-right: 24px; \}/s.test(a1), "窄档 base 24px（960 档随容器流式收缩）");
  assert.ok(a1.includes(".chat-pane { max-width: var(--content-max); gap: 16px; }"), "正文列 900 + 行距 16（v3 保持）");
  assert.ok(a1.includes(".capsule, .attach-row, .compose-note { max-width: var(--content-max); }"), "胶囊/附件/脚注同列 900");
  assert.ok(a1.includes("#chat > .op-chip { margin-left: calc((100% - min(var(--content-max), 100%)) / 2); }"), "chip 定位随 900 列");
  assert.ok(/\.composer \{[^}]*border-top: 1px solid var\(--border\);[^}]*background: var\(--bg-soft\);[^}]*box-shadow: 0 -6px 18px rgba\(0,0,0,\.35\);/.test(a1), "输入区上边线 + 次级暗底 + 贴底上阴影");
  assert.ok(!/\.chat-head \{[^}]*position:\s*(?:sticky|fixed)/.test(a1) && !/\.composer \{[^}]*position:\s*(?:sticky|fixed)/.test(a1), "不引入 sticky/fixed（保持 flex 固定、仅 .chat 滚动）");
});

test("A2：重量——token/对比度、控件边框、圆角收敛、表格、浮层阴影、选中竖条", () => {
  const a2 = STYLES.slice(STYLES.indexOf("A2 重量"));
  const tokens: Array<[string, string]> = [
    ["--chrome", "#1A1E22"], ["--bg-side", "var(--chrome)"], ["--border", "#2C3238"], ["--border-strong", "#3A4148"],
    ["--border-control", "#6B757E"], ["--text", "#F2F4F6"], ["--text-2", "#A7ADB5"], ["--text-3", "#949BA4"],
    ["--success", "#6FA08B"], ["--success-hover", "#7FB29B"], ["--success-bg", "#22302B"],
    ["--danger", "#C97A6D"], ["--danger-bg", "#2E2220"], ["--amber", "#C4A15F"], ["--focus-ring", "#6FA08B"],
    ["--radius", "8px"], ["--radius-sm", "6px"],
  ];
  for (const [token, value] of tokens) assert.ok(a2.includes(token + ": " + value), `A2 token ${token} = ${value}`);
  assert.ok(a2.includes("--shadow-card: 0 1px 2px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.32);"), "浮层阴影 token（深色）");
  assert.ok(a2.includes("--shadow-dock: 0 -6px 18px rgba(0,0,0,.35);"), "输入区贴底阴影 token（深色）");
  // 对比度（深色石墨底）：正文 ≥7、次级 ≥5、三级 ≥4.5、控件边框/focus ≥3、语义色 ≥4.5。
  // 2026-10-19 客户「白的有点发灰」：正文由 #E7E9EB 提亮为近白 #F2F4F6（14.78:1 → 16.32:1），
  // --text-2/--text-3 保持原灰阶不动（层次不变），不使用大面积纯白。
  const BG = "#14171A";
  assert.ok(contrast("#F2F4F6", BG) >= 7, "正文对比度 ≥7:1（深色石墨，近白 16.32:1）");
  assert.ok(contrast("#F2F4F6", BG) > contrast("#A7ADB5", BG), "正文亮于次级文字（灰阶层次保留）");
  assert.ok(contrast("#A7ADB5", BG) >= 5, "次级文字 ≥5:1");
  assert.ok(contrast("#949BA4", "#1E2328") >= 4.5, "三级文字在次级表面 ≥4.5:1");
  assert.ok(contrast("#6B757E", "#1E2328") >= 3, "控件边框 ≥3:1（D4 深色版）");
  assert.ok(contrast("#6FA08B", BG) >= 3, "焦点环 ≥3:1");
  assert.ok(contrast("#C97A6D", BG) >= 4.5 && contrast("#C97A6D", "#2E2220") >= 4.5, "danger 语义色 ≥4.5:1（主底/危险底）");
  assert.ok(contrast("#6FA08B", "#22302B") >= 4.5, "success 语义色在成功底 ≥4.5:1");
  assert.ok(contrast("#C4A15F", BG) >= 4.5 && contrast("#C4A15F", "#24211A") >= 4.5, "amber 语义色 ≥4.5:1（主底/未决底）");
  // 控件边框与焦点语义。
  assert.ok(a2.includes(".capsule { border-color: var(--border-control); }") && a2.includes("#runtime-select { border-color: var(--border-control); }"), "输入胶囊/引擎选择器走 --border-control");
  assert.ok(a2.includes(".btn-primary:hover:not(:disabled), .report-source-button:hover:not(:disabled) { background: var(--success-hover); border-color: var(--success-hover); }"), "主按钮 hover 走 --success-hover");
  // 圆角收敛：容器 8、控件 6、用户气泡右下 3。
  assert.ok(a2.includes(".capsule, .msg-handback, .msg-delivery, .task-request, .delivery-report, .attach-chip, .sc-card { border-radius: 8px; }"), "容器圆角 8（胶囊/报告/交付/任务请求/附件/确认卡）");
  assert.ok(a2.includes(".msg-user { border-radius: 8px 8px 3px 8px; }"), "用户气泡 8（右下 3 保持）");
  assert.ok(a2.includes(".btn, .btn-mini, .drawer-close, .tab-btn, .cap-icon, #runtime-select, .engine-option, .composer-actions .cap-send, .composer-actions .cap-halt { border-radius: 6px; }"), "控件圆角 6");
  // 表格：外框/表头实底/强表头底线/13-20/6×10；不改 display:block/overflow-x:auto。
  assert.ok(a2.includes(".msg table { font-size: 13px; line-height: 20px; outline: 1px solid var(--border-strong); outline-offset: -1px; }"), "正文表格 13/20 + 完整外框（outline，不改布局）");
  assert.ok(a2.includes(".msg table th, .msg table td { border: 1px solid var(--border); padding: 6px 10px; }"), "单元格 1px + 6×10");
  assert.ok(a2.includes(".msg table th, .card-md table th { background: var(--bg-soft); border-bottom: 1px solid var(--border-strong); }"), "表头实底 + 强底线");
  assert.ok(STYLES.includes(".msg table,\n.card-md table {\n  display: block;") || /\.msg table,[\s\S]{0,40}\.card-md table \{[^}]*display: block;[^}]*overflow-x: auto;/.test(STYLES), "宽表仍 display:block + overflow-x:auto");
  // 阴影只给浮层；普通消息/报告卡不加阴影。
  assert.ok(a2.includes(".sc-card { box-shadow: var(--shadow-card); }") && a2.includes(".composer { box-shadow: var(--shadow-dock); }"), "浮层/输入区阴影");
  assert.ok(!/(?:^|\n)\.msg[ ,{][^\n]*\{[^}]*box-shadow/s.test(a2) && !/\.msg-handback[^{]*\{[^}]*box-shadow/.test(a2) && !/\.msg-delivery[^{]*\{[^}]*box-shadow/.test(a2) && !/\.task-request[^{]*\{[^}]*box-shadow/.test(a2), "普通消息/报告卡/任务请求不加阴影");
  // D6：左树选中项 2px 内侧竖条（类名 .tree-item.active；不改布局）。
  assert.ok(a2.includes(".tree-item.active { box-shadow: inset 2px 0 0 var(--success); }"), "选中竖条 2px inner（D6）");
  // D7：正文 15/27 不动（A2 不得改写 .msg 字号/行高）。
  assert.ok(!a2.includes(".msg { font-size") && !a2.includes(".msg {font-size"), "A2 不改正文 15/27（D7）");
  assert.ok(STYLES.includes(".msg { font-size:15px; line-height:1.8; }") && 15 * 1.8 === 27, "正文 15px × 1.8 = 27px");
});

// ————— 深色石墨主题（2026-10-19 客户决定「整体页面风格这种色调不够沉稳」→ 选择深色石墨）—————
// 只换视觉：布局/尺寸/交互不动；本组钉住暗色令牌、滚动条/选中文本适配与「硬编码浅色不得残留」。

test("深色石墨主题：color-scheme/令牌/滚动条与选中文本/硬编码浅色残留守卫", () => {
  const cssCode = STYLES.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(/:root \{\s*color-scheme: dark;/.test(STYLES), "color-scheme: dark（原生控件/滚动条走深色）");
  const rootTokens: Array<[string, string]> = [
    ["--bg", "#14171A"], ["--bg-side", "#1A1E22"], ["--bg-drawer", "#171B1F"], ["--bg-soft", "#1E2328"],
    ["--bg-hover", "#252A30"], ["--bg-selected", "#2A3037"], ["--border", "#2C3238"], ["--border-strong", "#3A4148"],
    ["--text", "#F2F4F6"], ["--text-2", "#A7ADB5"], ["--text-3", "#949BA4"],
    ["--danger", "#C97A6D"], ["--success", "#6FA08B"], ["--amber", "#C4A15F"], ["--focus-ring", "#6FA08B"],
  ];
  for (const [token, value] of rootTokens) assert.ok(STYLES.includes(token + ": " + value + ";"), `暗色令牌 ${token} = ${value}`);
  assert.ok(cssCode.includes("::-webkit-scrollbar-thumb { background: #4A525A;"), "滚动条拇指深色适配");
  assert.ok(cssCode.includes("::-webkit-scrollbar-thumb:hover { background: #5F6870;"), "滚动条 hover 深色适配");
  assert.ok(cssCode.includes("::selection { background: #3A4A44; color: var(--text); }"), "选中文本深色底 + 可读前景");
  // 审计：旧的浅色表面不得残留（局部留亮色=本批失败）。
  const lightLeftovers = [
    "#FFFFFF", "#FFF", "#FAFBF8", "#FAFBF9", "#FCFCFB", "#FCFCFA", "#FBFCF8", "#FBFAF5", "#F7F8F5", "#F5F6F2",
    "#F4F8F2", "#F4F5F1", "#F4F4F2", "#F3F5EF", "#F1F4EE", "#F1F3EE", "#F0F3ED", "#F0F3EC", "#F0F2ED", "#F0F2EB",
    "#EFF1EB", "#EEF1EB", "#ECEFE6", "#EDF2EB", "#EDF0EA", "#E8EBE4", "#E5EEE7", "#E5E7E3", "#E3E7DF", "#E3E3E0",
    "#E2E5DE", "#E1E6DD", "#DFE8DF", "#DDE2DC", "#DCE6D9", "#DCE1D5", "#D8DFD5", "#D8DCD2", "#D7DDD4", "#D7DAD3",
    "#D6DFD5", "#D4D4D1", "#CDD7CE", "#CCD6CB", "#CAD8CD", "#C4CEC2", "#BEBEBA", "#E8D0C9", "#FCF5F2", "#FBEFED",
    "#B42318", "#A99060", "#DDD6C5",
  ];
  for (const light of lightLeftovers) {
    assert.ok(!new RegExp(light + "(?![0-9a-fA-F])", "i").test(cssCode), `不得残留硬编码浅色 ${light}`);
  }
  // 旧的浅色主题文字/语义色同样不得残留（深底上不可读）。
  const oldTextLeftovers = [
    "#242624", "#232C29", "#333", "#000", "#47513F", "#3F4B3C", "#5D6862", "#606B56", "#5F6859", "#6A756E",
    "#6B7069", "#717B68", "#737773", "#737C68", "#73625D", "#747E78", "#767D73", "#768966", "#7F8878", "#888F80",
    "#8B9382", "#8D9387", "#8F9B82", "#91978B", "#92988C", "#A2A895", "#8A968B",
    "#2D634E", "#244F3E", "#A1433C", "#8A5B23", "#32735B", "#87602B", "#42745E", "#964035", "#B16452",
  ];
  for (const old of oldTextLeftovers) {
    assert.ok(!new RegExp(old + "(?![0-9a-fA-F])", "i").test(cssCode), `不得残留旧主题色 ${old}`);
  }
});

test("字体：整页等宽（2026-10-17 客户裁定）——--sans 与 --mono 同一等宽栈，无 system-ui/Segoe 主字体", () => {
  const mono = 'ui-monospace, "Cascadia Mono", "Cascadia Code", "SF Mono", Consolas, "Liberation Mono", "Microsoft YaHei", monospace';
  assert.ok(STYLES.includes("--mono: " + mono + ";"), "等宽栈逐字（含中文回退）");
  assert.ok(STYLES.includes("--sans: var(--mono);"), "--sans 复用 --mono（单一来源，避免漂移）");
  assert.ok(!/--sans:\s*system-ui/.test(STYLES) && !/--sans:[^;]*"Segoe UI"/.test(STYLES), "不得再以 system-ui/Segoe UI 为主字体");
  assert.ok(!/--sans:[^;]*sans-serif/.test(STYLES), "--sans 不再是 sans-serif 栈（整页等宽终端感）");
  // 中文回退；不引入外部/专有字体资源（CSP 无需 font-src）。
  assert.ok(mono.includes('"Microsoft YaHei"'), "中文由 Microsoft YaHei 兜底");
  assert.ok(!/@font-face/.test(STYLES) && !/fonts\.googleapis|\.woff2?|\.ttf/i.test(STYLES), "不引入外部字体文件");
  const cssCode = STYLES.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/Anthropic/i.test(cssCode) && !/AnthropicSans/i.test(INDEX), "不引入专有 Anthropic 字体");
  assert.ok(INDEX.includes("default-src 'none'") && INDEX.includes("style-src 'self'"), "CSP 保持（本地系统字体无需新增资源）");
  // 字号基线保持：body 13px、消息 15px/1.8（27px）；本批不改字号。
  assert.ok(STYLES.includes("font: 13px/1.55 var(--sans);"), "body 仍 13px/1.55（换字体栈，不改字号）");
  assert.ok(STYLES.includes(".msg { font-size:15px; line-height:1.8; }"), "正文仍 15px/27px 基线");
});

test("可收起左栏：默认展开/toggle 类/localStorage 坏值回退/展开按钮可达/900 列保持", async () => {
  const UL = await loadUiLabelsForGovernance();
  // 存储值解析单点：仅 "1" 收起；"0"/缺失/坏值一律展开。
  assert.equal(UL.sidebarCollapsedFromStorage("1"), true, "存 \"1\" ⇒ 收起");
  assert.equal(UL.sidebarCollapsedFromStorage("0"), false, "存 \"0\" ⇒ 展开");
  assert.equal(UL.sidebarCollapsedFromStorage("yes"), false, "坏值回退展开");
  assert.equal(UL.sidebarCollapsedFromStorage(null), false, "缺失回退展开");
  // DOM：展开态收起按钮在左栏品牌区；收起态展开按钮在内容区（会话头一侧），不在拖拽标题栏。
  assert.ok(INDEX.includes('id="sidebar-collapse"') && INDEX.includes('aria-label="收起左侧栏"'), "展开态：收起按钮 + 无障碍名");
  assert.ok(INDEX.includes('id="sidebar-expand"') && INDEX.includes('aria-label="展开左侧栏"'), "收起态：展开按钮 + 无障碍名");
  assert.ok(INDEX.indexOf('id="sidebar-expand"') > INDEX.indexOf('class="col col-mid"'), "展开按钮在内容区（不在标题栏拖拽区）");
  assert.ok(!INDEX.includes("accesskey"), "不引入新快捷键");
  // 持久化：唯一键、读写各自 try/catch、坏值经纯函数回退。
  assert.ok(RENDERER.includes('var SIDEBAR_STORAGE_KEY = "ans.sidebar.collapsed";'), "唯一存储键");
  assert.ok(/function readSidebarCollapsed\(\) \{\s*try \{[\s\S]{0,200}localStorage\.getItem\(SIDEBAR_STORAGE_KEY\)[\s\S]{0,120}catch \(_\) \{ return false; \}/.test(RENDERER), "读取异常/坏值回退展开");
  assert.ok(/function writeSidebarCollapsed\(collapsed\) \{\s*try \{[\s\S]{0,200}localStorage\.setItem\(SIDEBAR_STORAGE_KEY, collapsed === true \? "1" : "0"\)[\s\S]{0,80}catch/.test(RENDERER), "写入异常不抛出（仅不持久化）");
  // 状态单点 = `.app.is-sidebar-collapsed` 类；按钮显隐互补；切换保持滚动位置。
  assert.ok(RENDERER.includes("function sidebarCollapsedNow()") && RENDERER.includes('app.classList.contains("is-sidebar-collapsed")'), "状态单点＝类");
  assert.ok(RENDERER.includes('app.classList.toggle("is-sidebar-collapsed", value)'), "toggle 同一类");
  assert.equal((RENDERER.match(/classList\.contains\("is-sidebar-collapsed"\)/g) || []).length, 1, "无第二判据");
  assert.ok(RENDERER.includes("expand.hidden = !value") && RENDERER.includes("collapse.hidden = value"), "两按钮显隐互补（展开按钮收起后可达）");
  assert.ok(/var chat = \$\("chat"\), top = chat \? chat\.scrollTop : 0;[\s\S]{0,260}chat\.scrollTop = top;/.test(RENDERER), "先量后改：切换后滚动位置保持");
  assert.ok(RENDERER.includes("initSidebar();"), "启动时读持久化并绑定按钮");
  // CSS：收起不占位、左栏完全隐藏、160ms 过渡、reduced-motion 禁用、900 列/贴底体系不变。
  assert.ok(STYLES.includes(".app.is-sidebar-collapsed { grid-template-columns: 0 minmax(0, 1fr); }"), "首列 0（不保留占位）");
  assert.ok(/\.app\.is-sidebar-collapsed \.col-left \{[^}]*visibility: hidden;[^}]*overflow: hidden;/.test(STYLES), "左栏完全隐藏");
  assert.ok(STYLES.includes("transition: grid-template-columns 160ms ease;") && STYLES.includes("transition: opacity 160ms ease"), "宽度/透明度 160ms 过渡");
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{ \.app, \.col-left, \.sidebar-toggle \{ transition: none; \}/.test(STYLES), "减少动效偏好下禁用动画");
  assert.ok(STYLES.includes("--content-max: 900px") && STYLES.includes(".chat-pane { max-width: var(--content-max); gap: 16px; }"), "A1 900 列保持");
  assert.ok(STYLES.includes("#sidebar-collapse { top: 16px; right: 10px; }") && STYLES.includes(".sidebar-expand { top: 18px; left: 6px; z-index: 9; }"), "收起在左栏品牌区、展开在内容区左上（不压窗口按钮）");
  assert.ok(STYLES.includes(".sidebar-toggle:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }"), "按钮键盘焦点环");
});

test("左栏宽度：默认 248 / 208–360 clamp / 坏值回退 / 持久化 / 拖动·键盘·双击 / 折叠保留", async () => {
  const UL = await loadUiLabelsForGovernance();
  // 纯函数单点：默认/范围/clamp/步进。
  assert.equal(UL.SIDEBAR_WIDTH_DEFAULT, 248);
  assert.equal(UL.SIDEBAR_WIDTH_MIN, 208);
  assert.equal(UL.SIDEBAR_WIDTH_MAX, 360);
  assert.equal(UL.clampSidebarWidth(undefined), 248, "缺省 ⇒ 248");
  assert.equal(UL.clampSidebarWidth(null), 248, "缺失 ⇒ 248");
  assert.equal(UL.clampSidebarWidth("abc"), 248, "坏值 ⇒ 248");
  assert.equal(UL.clampSidebarWidth("100"), 208, "低于下限 ⇒ clamp 208");
  assert.equal(UL.clampSidebarWidth("999"), 360, "高于上限 ⇒ clamp 360");
  assert.equal(UL.clampSidebarWidth("248"), 248, "合法存储值逐字");
  assert.equal(UL.clampSidebarWidth(248.6), 249, "四舍五入到整数");
  assert.equal(UL.stepSidebarWidth(248, 8), 256, "→ +8");
  assert.equal(UL.stepSidebarWidth(248, -8), 240, "← -8");
  assert.equal(UL.stepSidebarWidth(350, 24), 360, "Shift +24 后 clamp");
  assert.equal(UL.stepSidebarWidth(210, -24), 208, "Shift -24 后 clamp");
  assert.equal(UL.stepSidebarWidth("bad", 8), 256, "坏当前值先回退 248 再步进");
  // DOM/ARIA：分隔线（role/orientation/值域/可聚焦），不与收起按钮重叠（热区贴右缘）。
  assert.ok(INDEX.includes('id="sidebar-resizer"') && INDEX.includes('role="separator"') && INDEX.includes('aria-orientation="vertical"'), "分隔线角色");
  assert.ok(INDEX.includes('aria-valuemin="208"') && INDEX.includes('aria-valuemax="360"') && INDEX.includes('aria-valuenow="248"'), "ARIA 值域/当前值");
  assert.ok(INDEX.includes('tabindex="0"'), "分隔线可键盘聚焦");
  assert.ok(!/sidebar-resizer[^>]*accesskey/.test(INDEX), "不引入新快捷键");
  // 栅格与 token：首列走 `--sidebar-width`，默认 248；拖动只改变量。
  assert.ok(STYLES.includes("--sidebar-width: 248px"), "默认宽度 token");
  assert.ok(STYLES.includes("grid-template-columns:var(--sidebar-width) minmax(0,1fr)"), "栅格首列使用变量");
  assert.ok(RENDERER.includes('var SIDEBAR_WIDTH_STORAGE_KEY = "ans.sidebar.width"'), "宽度持久化键");
  assert.ok(/function readSidebarWidth\(\) \{\s*try \{[\s\S]{0,200}getItem\(SIDEBAR_WIDTH_STORAGE_KEY\)[\s\S]{0,140}catch \(_\) \{ return UiLabels\.SIDEBAR_WIDTH_DEFAULT; \}/.test(RENDERER), "读取异常/坏值回退 248");
  assert.ok(/function writeSidebarWidth\(width\) \{\s*try \{[\s\S]{0,200}setItem\(SIDEBAR_WIDTH_STORAGE_KEY, String\(UiLabels\.clampSidebarWidth\(width\)\)\)[\s\S]{0,80}catch/.test(RENDERER), "写入前 clamp、异常不抛");
  assert.ok(RENDERER.includes('document.documentElement.style.setProperty("--sidebar-width", w + "px")'), "拖动只改变量（不重建 DOM）");
  assert.ok(RENDERER.includes('resizer.setAttribute("aria-valuenow", String(w))'), "同步 aria-valuenow");
  // 拖动/双击/键盘。
  assert.ok(/pointerdown[\s\S]{0,320}is-sidebar-resizing/.test(RENDERER), "拖动开始禁用宽度过渡");
  assert.ok(RENDERER.includes("startWidth + (event.clientX - startX)"), "水平拖动按位移改宽度");
  assert.ok(/function endDrag\(event\) \{[\s\S]{0,340}writeSidebarWidth\(currentSidebarWidth\(\)\)/.test(RENDERER), "松手持久化");
  assert.ok(RENDERER.includes('resizer.addEventListener("pointerup", endDrag)') && RENDERER.includes('"pointercancel"'), "pointerup/pointercancel 收尾");
  assert.ok(/dblclick[\s\S]{0,160}UiLabels\.SIDEBAR_WIDTH_DEFAULT/.test(RENDERER), "双击复位 248");
  assert.ok(/event\.shiftKey \? 24 : 8/.test(RENDERER) && RENDERER.includes("ArrowLeft") && RENDERER.includes("ArrowRight"), "←/→ ±8、Shift ±24");
  // 折叠保留宽度：折叠函数只切类，不碰宽度变量。
  assert.ok(/function applySidebarCollapsed\(collapsed\) \{[\s\S]{0,420}classList\.toggle\("is-sidebar-collapsed"/.test(RENDERER), "折叠只切类");
  assert.ok(!/function applySidebarCollapsed\(collapsed\) \{[\s\S]{0,420}--sidebar-width/.test(RENDERER), "折叠不改变宽度变量（展开后恢复）");
  // CSS：热区/拖动禁用过渡/焦点环。
  assert.ok(STYLES.includes(".sidebar-resizer {") && STYLES.includes("cursor: col-resize"), "分隔线热区 cursor");
  assert.ok(STYLES.includes(".app.is-sidebar-resizing, .app.is-sidebar-resizing .col-left, .app.is-sidebar-resizing .sidebar-toggle { transition: none; }"), "拖动期间禁用过渡");
  assert.ok(STYLES.includes(".sidebar-resizer:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }"), "分隔线焦点环");
});

test("左树选中项可见（2026-10-17 实机）：最小位移、可见不动、不重置到顶", async () => {
  const UL = await loadUiLabelsForGovernance();
  // 纯位移单点：已可见（±1px）⇒ 0；上方/下方 ⇒ 最小位移。
  assert.equal(UL.roleTreeScrollDelta(200, 700, 300, 360), 0, "完整可见 ⇒ 不动（保留用户滚动）");
  assert.equal(UL.roleTreeScrollDelta(200, 700, 199, 260), 0, "上边界 1px 容差");
  assert.equal(UL.roleTreeScrollDelta(200, 700, 640, 701), 0, "下边界 1px 容差");
  assert.equal(UL.roleTreeScrollDelta(216, 716, 153, 211), -63, "在上方 ⇒ 对齐顶（实机 su 场景）");
  assert.equal(UL.roleTreeScrollDelta(216, 716, 700, 760), 44, "在下方 ⇒ 对齐底");
  assert.equal(UL.roleTreeScrollDelta(NaN, 1, 2, 3), 0, "非法输入 ⇒ 不动");
  // 渲染接线：树项带定位键；applyListing/selectRole 后确保可见；只做加位移、绝不回顶。
  assert.ok(RENDERER.includes('item.setAttribute("data-role-id", r.roleId)'), "树项带 data-role-id 定位键");
  assert.ok(RENDERER.includes("ensureRoleTreeVisible(state.selectedRoleId || state.primaryRoleId)"), "applyListing（导入/刷新）后确保主入口/选中项可见");
  assert.ok(/renderRoleTree\(\);\s*ensureRoleTreeVisible\(roleId\);/.test(RENDERER), "selectRole 后确保选中项可见");
  assert.ok(RENDERER.includes("UiLabels.roleTreeScrollDelta(treeRect.top, treeRect.bottom, itemRect.top, itemRect.bottom)"), "位移经纯函数单点");
  const fnStart = RENDERER.indexOf("function ensureRoleTreeVisible(roleId)");
  const fn = RENDERER.slice(fnStart, RENDERER.indexOf("\n  }", fnStart));
  assert.ok(fnStart > 0 && fn.includes("tree.scrollTop += delta") && !/scrollTop\s*=\s*0/.test(fn), "只做最小位移，不强制回顶");
  assert.ok(!fn.includes("scrollIntoView"), "不用 scrollIntoView（避免连带滚动其它容器）");
});

// ————————————————— P5：双自动判断开关（2026-10-18 评审 §三/§八/§九）—————————————————
// 桌面UI 侧只消费冻结桥：主进程是开关权威；桥/驱动缺失禁用并说明；两组默认关、互不影响；
// 结果行按 roleId 落 pane、按 toolCallId 锚定；manual 不产生结果行（原卡 + judgeNotice）。
// DOM 行为由 e2e 覆盖；此处钉住源码接线、文案单点与边界（不自动开会话/不写持久化）。

test("P5：输入区两个复选框 + 一次性警告 + 手动回落提示的 DOM 结构（§9.1/§9.2/§9.3）", () => {
  // 复选框：§9.1 逐字结构；位置在附件按钮之后、#composer-scope 之前；两个开关并排。
  assert.ok(
    /<label class="composer-auto-approve">\s*<input type="checkbox" id="auto-approve-toggle" \/>\s*<span id="auto-approve-label">替我审批<\/span>\s*<\/label>/.test(INDEX),
    "approval 复选框结构（label/input/span 三件套，标签「替我审批」）"
  );
  assert.ok(
    /<label class="composer-auto-approve">\s*<input type="checkbox" id="judge-decision-toggle" \/>\s*<span id="judge-decision-label">替我决策<\/span>\s*<\/label>/.test(INDEX),
    "decision 复选框结构（label/input/span 三件套，标签「替我决策」）"
  );
  const attach = INDEX.indexOf('id="btn-attach-image"');
  const approval = INDEX.indexOf('id="auto-approve-toggle"');
  const decision = INDEX.indexOf('id="judge-decision-toggle"');
  const scope = INDEX.indexOf('id="composer-scope"');
  assert.ok(attach >= 0 && approval > attach && decision > approval && scope > decision, "位置：附件按钮之后、#composer-scope 之前，两个复选框并排");
  assert.ok(INDEX.includes('id="auto-approve-status"'), "approval 失败/状态位（可见、aria-live）");
  assert.ok(INDEX.includes('id="judge-decision-status"'), "decision 失败/状态位（single 说明也走这里）");
  // 一次性警告容器：两个开关共用**同一块**（默认隐藏；文本容器 +「知道了」关闭按钮）。
  assert.equal((INDEX.match(/id="shell-judge-warning"/g) || []).length, 1, "警告只有一块（两个开关共用）");
  assert.ok(
    /<div id="shell-judge-warning" class="judge-warning" role="status" aria-live="polite" hidden>\s*<div id="shell-judge-warning-text" class="judge-warning-text"><\/div>\s*<button id="shell-judge-warning-close" class="judge-warning-close" type="button" title="关闭提示" aria-label="知道了">知道了<\/button>\s*<\/div>/.test(INDEX),
    "开启警告容器默认隐藏，内含文本容器与「知道了」关闭按钮"
  );
  assert.ok(/<p id="sc-judge-notice" class="sc-judge-notice" hidden><\/p>/.test(INDEX), "shell 卡 judgeNotice 位默认隐藏");
  const summary = INDEX.indexOf('id="sc-summary"');
  const notice = INDEX.indexOf('id="sc-judge-notice"');
  const reason = INDEX.indexOf('id="sc-reason"');
  assert.ok(summary < notice && notice < reason, "#sc-judge-notice 位于摘要之后、原因之前");
  // 样式钩子。
  for (const cls of [".composer-auto-approve", ".judge-warning", ".judge-warning-close", ".shell-judge-row", ".sj-badge", ".sc-judge-notice", ".composer-judge-status.is-note", ".governance-judge-row", ".op-judge-notice"]) {
    assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
  }
  // 警告用琥珀色（不是错误红）；一次性浮层不占聊天布局。
  const warningBlock = STYLES.match(/\.judge-warning \{([\s\S]*?)\}/)?.[1] || "";
  assert.ok(warningBlock.includes("var(--amber)"), "开启警告用琥珀色");
  assert.ok(!warningBlock.includes("var(--danger)") && !warningBlock.includes("var(--danger-line)"), "开启警告不得用错误红");
  assert.ok(warningBlock.includes("position: absolute"), "一次性警告浮层不参与布局");
  assert.ok(/\.judge-warning \{[\s\S]{0,300}bottom: calc\(100% \+ 8px\)/.test(STYLES), "浮在输入区上方（不推动消息区）");
  assert.ok(/\.composer \{ position: relative; \}/.test(STYLES), "输入区为浮层提供定位上下文");
  assert.ok(/\.judge-warning-close \{[\s\S]{0,300}var\(--amber\)/.test(STYLES), "「知道了」按钮用琥珀色");
  const onBlock = STYLES.match(/\.composer-auto-approve\.is-on \{([\s\S]*?)\}/)?.[1] || "";
  assert.ok(onBlock.includes("var(--amber)"), "开启标记（判断 agent）用琥珀色");
  assert.ok(!onBlock.includes("var(--danger)"), "开启标记不得用错误红");
  const noteBlock = STYLES.match(/\.composer-judge-status\.is-note \{([\s\S]*?)\}/)?.[1] || "";
  assert.ok(noteBlock.includes("var(--amber)") && !noteBlock.includes("var(--danger)"), "single/禁用说明用琥珀，不是错误红");
});

test("P5：两个开关各自三态——启动取真实状态、推送同步、点击只信主进程回包；桥缺失禁用且无假开启态", async () => {
  const UL = (await loadUiLabelsForGovernance()) as unknown as Record<string, any>;
  // 三态纯映射（与 UI 共用单一来源）；两个开启态各自紧凑标记。
  const off = UL.shellJudgeToggleView(true, false, false);
  assert.equal(off.label, "替我审批");
  assert.equal(off.checked, false);
  assert.equal(off.enabled, false);
  const on = UL.shellJudgeToggleView(true, true, false);
  assert.equal(on.label, "替我审批中 · 判断 agent");
  assert.equal(on.checked, true);
  assert.equal(on.enabled, true, "开启期间保留琥珀紧凑标记");
  const missing = UL.shellJudgeToggleView(false, true, false);
  assert.equal(missing.disabled, true);
  assert.equal(missing.checked, false, "桥缺失不显示假开启态");
  assert.equal(missing.label, "当前版本不支持自动判断，保持手动");
  const decisionOff = UL.judgeToggleView("decision", true, false, false, null);
  assert.equal(decisionOff.label, "替我决策");
  assert.equal(decisionOff.checked, false);
  const decisionOn = UL.judgeToggleView("decision", true, true, false, null);
  assert.equal(decisionOn.label, "替我决策中 · 判断 agent");
  assert.equal(decisionOn.checked, true);
  const single = UL.judgeToggleView("decision", true, true, false, { singleDisabled: true });
  assert.equal(single.disabled, true);
  assert.equal(single.checked, false, "single 下不得显示假开启态");
  assert.equal(single.note, "旧治理模型（single）不支持代决策");
  // 失败不改状态（主进程是权威）。
  assert.equal(UL.shellJudgeToggleResult(true, { ok: false, error: "x" }).enabled, true);
  assert.equal(UL.shellJudgeToggleResult(false, { ok: true, enabled: true }).enabled, true);
  assert.equal(UL.shellJudgeToggleResult(true, { ok: true, enabled: false }).enabled, false);

  // 启动：两组各自四个桥方法齐备判定 + 订阅 state/result + 读取一次真实状态。
  assert.ok(SHELL_JUDGE_CODE.length > 0, "自动判断段应存在（标记齐全）");
  assert.ok(SHELL_JUDGE_CODE.includes("typeof d.getShellJudgeState === \"function\"") &&
    SHELL_JUDGE_CODE.includes("typeof d.setShellJudgeEnabled === \"function\"") &&
    SHELL_JUDGE_CODE.includes("typeof d.onShellJudgeState === \"function\"") &&
    SHELL_JUDGE_CODE.includes("typeof d.onShellJudgeResult === \"function\""), "approval 桥可用性按四个冻结方法判定");
  assert.ok(SHELL_JUDGE_CODE.includes("typeof d.getDecisionJudgeState === \"function\"") &&
    SHELL_JUDGE_CODE.includes("typeof d.setDecisionJudgeEnabled === \"function\"") &&
    SHELL_JUDGE_CODE.includes("typeof d.onDecisionJudgeState === \"function\"") &&
    SHELL_JUDGE_CODE.includes("typeof d.onOperatorJudgeResult === \"function\""), "decision 桥可用性按四个冻结方法判定");
  assert.ok(RENDERER.includes("initJudgeSwitches();"), "启动时初始化两个自动判断开关");
  assert.ok(SHELL_JUDGE_CODE.includes("d.onShellJudgeState(function (payload) { if (applyShellJudgeState(payload)) pushed = true; })"), "订阅 shell:judge-state");
  assert.ok(SHELL_JUDGE_CODE.includes("d.onDecisionJudgeState(function (payload) { if (applyDecisionJudgeState(payload)) pushed = true; })"), "订阅 decision:judge-state");
  assert.ok(SHELL_JUDGE_CODE.includes("Promise.resolve(d.getShellJudgeState())"), "启动读取 approval 真实开关状态");
  assert.ok(SHELL_JUDGE_CODE.includes("Promise.resolve(d.getDecisionJudgeState())"), "启动读取 decision 真实开关状态");
  // 点击切换：不乐观改状态；成功采用主进程 enabled，失败保持原值并显示错误。
  assert.ok(RENDERER.includes('$("auto-approve-toggle").addEventListener("change", onShellJudgeToggleChange)'), "approval 复选框 change 绑定");
  assert.ok(RENDERER.includes('$("judge-decision-toggle").addEventListener("change", onDecisionJudgeToggleChange)'), "decision 复选框 change 绑定");
  assert.ok(SHELL_JUDGE_CODE.includes("d.setShellJudgeEnabled(desired)"), "approval 切换调用冻结桥方法");
  assert.ok(SHELL_JUDGE_CODE.includes("d.setDecisionJudgeEnabled(desired)"), "decision 切换调用冻结桥方法");
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.shellJudgeToggleResult(s.enabled, res)"), "结果经纯函数自洽（失败保持原状态）");
  assert.ok(SHELL_JUDGE_CODE.includes("s.enabled = next.enabled"), "只落主进程实际值");
  assert.ok(!SHELL_JUDGE_CODE.includes("s.enabled = desired"), "点击意图不得直接成为状态（无假开启态）");
  assert.ok(!/\.enabled\s*=\s*true/.test(SHELL_JUDGE_CODE), "渲染侧不得自行把开关置 true");
  assert.ok(SHELL_JUDGE_CODE.includes("toggle.checked = view.checked") && SHELL_JUDGE_CODE.includes("toggle.disabled = view.disabled"), "复选框只呈现真实视图");
  // 一次性警告的状态机与文案单点（客户 2026-10-18；每组各自一次）。
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.judgeWarningStep(state.shellJudge.enabled, state.shellJudge.promptShown)"), "approval 一次性提示经 ui-labels 纯函数迁移");
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.judgeWarningStep(state.decisionJudge.enabled, state.decisionJudge.promptShown)"), "decision 一次性提示经同一纯函数迁移（各自 shown）");
  assert.ok(SHELL_JUDGE_CODE.includes("state.shellJudge.promptShown = a.shown") && SHELL_JUDGE_CODE.includes("state.decisionJudge.promptShown = b.shown"), "每组记录本次开启已提示（重绘不重现）");
  assert.ok(SHELL_JUDGE_CODE.includes("if (a.show || b.show) { showShellJudgeWarning(groups); return; }"), "任一组首次开启即展示同一块警告");
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.judgeWarningLines(groups)"), "警告文案经 ui-labels 单一来源（按开启组列行）");
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.SHELL_JUDGE_WARNING_CLOSE_LABEL"), "关闭按钮文案经 ui-labels 单一来源");
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.SHELL_JUDGE_WARNING_AUTO_DISMISS_MS"), "自动收起时长经 ui-labels 单一来源");
  assert.ok(SHELL_JUDGE_CODE.includes("setTimeout(function () {"), "约 8–10 秒后自动消失");
  assert.ok(SHELL_JUDGE_CODE.includes("hideShellJudgeWarning()"), "关闭/自动到时/关闭开关共用收起");
  assert.ok(RENDERER.includes('$("shell-judge-warning-close").addEventListener("click", hideShellJudgeWarning)'), "「知道了」点击收起");
  // 重绘/收消息/切角色路径不会直接改警告显隐——只有展示/收起两个写点，展示只经一次性状态机。
  const showCalls = (SHELL_JUDGE_CODE.match(/showShellJudgeWarning\(/g) || []).length;
  assert.equal(showCalls, 2, "showShellJudgeWarning 仅定义 + step.show 单点调用");
  const visibilityWrites = (SHELL_JUDGE_CODE.match(/warning\.hidden = (?:true|false)/g) || []).length;
  assert.equal(visibilityWrites, 2, "警告显隐只有展示/收起两处写点");
  assert.ok(SHELL_JUDGE_CODE.includes("warning.hidden = false;") && SHELL_JUDGE_CODE.includes("warning.hidden = true;"), "展示与收起各一处");
  // single 项目禁用 decision（UI 禁用只是展示，不是安全边界）。
  assert.ok(SHELL_JUDGE_CODE.includes('state.governanceModel === "single"'), "single 判据只读 listing 事实");
  assert.ok(SHELL_JUDGE_CODE.includes("{ singleDisabled: decisionJudgeSingleDisabled() }"), "decision 视图透传 single 禁用");
  assert.ok(RENDERER.includes("renderJudgeToggles();") && RENDERER.includes("state.governanceModel = state.governanceModelKnown ? model : \"single\";"), "listing 落模型后重绘（切到 trio 恢复可用）");
});

test("P5：结果行接线——shell 与治理代批均按 roleId 落 pane、按 toolCallId 锚定、manual 不落行", () => {
  assert.ok(RENDERER.includes("d.onShellJudgeResult(function (payload) { deliverRuntimePayload(payload, onShellJudgeResult); })"), "订阅 shell:judge-result 并按引擎视图投递");
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.shellJudgeResultView(payload)"), "shell 结果文案/字段经纯映射单一来源");
  assert.ok(SHELL_JUDGE_CODE.includes('var roleId = typeof payload.roleId === "string" ? payload.roleId : ""'), "严格按 roleId 路由");
  assert.ok(SHELL_JUDGE_CODE.includes("var pane = paneFor(roleId);"), "落该角色自己的 pane");
  assert.ok(SHELL_JUDGE_CODE.includes("shellJudgeAnchorIndex(rowListFor(pane), view.toolCallId)"), "按 toolCallId 查锚点");
  assert.ok(SHELL_JUDGE_CODE.includes("if (rec.data.items[j] && rec.data.items[j].callId === toolCallId) return i + 1;"), "工具调用行后落位");
  assert.ok(SHELL_JUDGE_CODE.includes("return null;") && SHELL_JUDGE_CODE.includes("atIndex: atIndex"), "定位不到 ⇒ 追加流尾（不丢行）");
  assert.ok(SHELL_JUDGE_CODE.includes('kind: "judge-result"'), "shell 结果行走行表（参与窗口化/锚点）");
  assert.ok(SHELL_JUDGE_CODE.includes('state.shellJudgeResultIds[key]'), "重复事件幂等（不重复落行）");
  // deny 档放行必须一眼可分：标题 + label 徽标（琥珀描边），并用硬拒/请复核说明。
  assert.ok(SHELL_JUDGE_CODE.includes('<span class="sj-badge">'), "deny 档放行徽标显著呈现");
  assert.ok(SHELL_JUDGE_CODE.includes("v.tierText") && SHELL_JUDGE_CODE.includes("v.engineText") && SHELL_JUDGE_CODE.includes("v.operatorText"), "行内含档位/judge 引擎/operator");
  assert.ok(SHELL_JUDGE_CODE.includes("v.lines.map") && SHELL_JUDGE_CODE.includes("v.retryHint"), "行内含理由/替代方案/客户说明与出路");
  // manual：视图返回 null 时直接返回，不产生结果行。
  assert.ok(SHELL_JUDGE_CODE.includes("if (!view) return; // manual（或未知裁决）不产生结果行"), "manual 不产生结果行");

  // 治理代批结果行（`session:operator-judge`）：标题「judge 代批 · 代审批/代决策」，与客户手批区分。
  assert.ok(RENDERER.includes("d.onOperatorJudgeResult(function (payload) { deliverRuntimePayload(payload, onOperatorJudgeResult); })"), "订阅 session:operator-judge 并按引擎视图投递");
  assert.ok(SHELL_JUDGE_CODE.includes("UiLabels.governanceJudgeResultView(payload)"), "治理结果文案/字段经纯映射单一来源");
  assert.ok(SHELL_JUDGE_CODE.includes("var view = UiLabels.governanceJudgeResultView(payload);") && SHELL_JUDGE_CODE.includes("if (!view) return; // 未知分组/坏件不产生结果行"), "未知分组/坏件不产生结果行");
  assert.ok(SHELL_JUDGE_CODE.includes("state.governanceJudgeResultIds[key]"), "治理结果行幂等（不重复落行）");
  assert.ok(SHELL_JUDGE_CODE.includes('kind: "governance-judge-result"'), "治理结果行走行表");
  assert.ok(SHELL_JUDGE_CODE.includes('div.className = "sys shell-judge-row governance-judge-row is-allow"'), "治理结果行独立样式钩子（与客户手批卡区分）");
  assert.ok(SHELL_JUDGE_CODE.includes("esc(v.title)") && SHELL_JUDGE_CODE.includes("esc(v.headline)") && SHELL_JUDGE_CODE.includes("esc(v.badge)"), "全部动态文本经 esc");
  assert.ok(SHELL_JUDGE_CODE.includes("d.pathDecisions.map") && SHELL_JUDGE_CODE.includes("d.selected.join") && SHELL_JUDGE_CODE.includes("d.paths.join"), "详情含逐路径结论/选中项/路径");
  assert.ok(SHELL_JUDGE_CODE.includes("d.durationMs") && SHELL_JUDGE_CODE.includes("d.readCalls") && SHELL_JUDGE_CODE.includes("d.readBytes"), "详情含耗时/读取次数/字节");

  // 手动回落卡（治理方向卡）`judgeNotice`：主进程给的原文逐字、转义呈现；无值不渲染。
  assert.ok(RENDERER.includes('if (typeof entry.judgeNotice === "string" && entry.judgeNotice !== "") {'), "交互卡读取可选 judgeNotice");
  assert.ok(RENDERER.includes('\'<div class="op-judge-notice">\' + esc(entry.judgeNotice) + "</div>"'), "交互卡渲染 judgeNotice（esc，无 HTML 注入口）");
  assert.ok(RENDERER.includes('typeof payload.judgeNotice === "string" && payload.judgeNotice !== ""'), "同一请求重推可补/更新 judgeNotice");
});

test("P5：手动回落卡 judgeNotice 原样渲染（不改写、无值隐藏）；已挂起卡不受开关切换影响", () => {
  assert.ok(RENDERER.includes('var judgeNotice = typeof payload.judgeNotice === "string" ? payload.judgeNotice : "";'), "读取 payload.judgeNotice");
  assert.ok(RENDERER.includes('$("sc-judge-notice").textContent = judgeNotice'), "原样 textContent（无 HTML 注入口、不改写）");
  assert.ok(RENDERER.includes('$("sc-judge-notice").hidden = judgeNotice === ""'), "无值隐藏");
  // 开关切换/状态推送路径不触碰挂起卡（不关、不重渲染、不重置）。
  for (const forbidden of ["closeShellConfirm", "renderShellConfirm", "state.shellConfirm", "markShellConfirmExpired"]) {
    assert.ok(!SHELL_JUDGE_CODE.includes(forbidden), "自动判断段不得触碰已挂起卡：" + forbidden);
  }
});

test("P5 边界：不自动开会话/切角色、不写 localStorage/.env/项目文件、不接触 Node/fs", () => {
  // 只看代码：段内注释会提到「不写 localStorage/.env」等字样，不属于实现。
  const code = SHELL_JUDGE_CODE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const forbidden of ["selectRole(", "selectRuntime(", "openSession(", "state.selectedRoleId =", "state.sessionOpenRoleId ="]) {
    assert.ok(!code.includes(forbidden), "自动判断段不得自动开会话/切角色：" + forbidden);
  }
  for (const forbidden of ["localStorage", "sessionStorage", ".env", "writeFile", "fs.", "require("]) {
    assert.ok(!code.includes(forbidden), "自动判断段不得写持久化/接触 Node：" + forbidden);
  }
  // 结果行/开关文案不含英文判断逻辑分叉（语义在 ui-labels / 主进程）——源码只按 verdict 分 allow/deny 呈现。
  assert.ok(!code.includes('reasonCode === "necessary"'), "渲染侧不重写判断语义");
});

test("2026-10-18 真机：settled/失效回执后收起 shell 确认卡，不保留不可操作卡；等待中的卡不受影响", () => {
  // 本轮 settled（含中止/停止）⇒ 收起该角色旧卡；仍在等待/其它角色的卡不受影响。
  assert.ok(RENDERER.includes('if (ev.kind === "settled") closeStaleShellConfirm(env);'), "settled 事件触发旧卡清理");
  const stale = RENDERER.slice(RENDERER.indexOf("function closeStaleShellConfirm"), RENDERER.indexOf("function respondShellConfirm"));
  assert.ok(stale.length > 0, "closeStaleShellConfirm 存在");
  assert.ok(stale.includes("cur.roleId !== env.roleId"), "只命中该角色");
  assert.ok(stale.includes("cur.runtime !== runtime"), "不跨 runtime 误收");
  assert.ok(stale.includes("cur.projectRoot !== env.projectRoot"), "不跨项目误收");
  assert.ok(stale.includes("closeShellConfirm()"), "真正移除卡片而不是留禁用态");
  // 失效回执（`session:operator-expired`）：按 id 命中后收起；旧 id 不误收当前卡。
  const expired = RENDERER.slice(RENDERER.indexOf("function onOperatorExpired"), RENDERER.indexOf("function onOperatorQueued"));
  assert.ok(expired.includes("state.shellConfirm.id === payload.id") && expired.includes("closeShellConfirm()"), "失效回执收起当前卡");
  assert.ok(expired.includes("setHint(shellReason)"), "如实提示失效原因（不再留卡）");
  // 回包：受理/过期/通道异常三条路径都收起；卡移除后迟到/非法回包不重建。
  assert.ok(!RENDERER.includes("markShellConfirmExpired"), "shell 卡不再保留「已失效」不可操作终态");
  const respond = RENDERER.slice(RENDERER.indexOf("function respondShellConfirm"), RENDERER.indexOf("// @shell-judge-start"));
  assert.equal((respond.match(/closeShellConfirm\(\);/g) || []).length, 3, "受理/过期/通道失败均收起");
  assert.ok(respond.includes("if (!cur) return;"), "卡已移除后迟到回包直接返回（不重建）");
  assert.ok(respond.includes("此确认已失效（超时或应用重启），未获放行"), "过期回包如实说明未获放行");
  assert.ok(respond.includes("未能回传你的决定（通道未接或异常）——按 fail-closed 不放行"), "通道失败如实说明不放行");
});

// —————— W4 治理三权（2026-10-17 评审 §8）：渲染侧接线与「不猜/不假装」守卫 ——————
// 纯文案逐字由 tool-rows.test.ts 同批断言；此处钉源码不变式（分组、派生、单点、无硬编码 id、未接线禁用）。

test("W4：左树三组——主入口/治理职能（内置）/项目角色；治理行由 governanceFunction 派生（不硬编码三权 id）", () => {
  const tree = RENDERER.slice(RENDERER.indexOf("function renderRoleTree("), RENDERER.indexOf("function selectedRole("));
  assert.ok(tree.length > 0, "renderRoleTree 存在");
  assert.ok(tree.includes("UiLabels.governanceRoleView(r.governanceFunction)"), "治理组按 governanceFunction 派生（不按 id）");
  assert.ok(tree.includes("UiLabels.GOVERNANCE_GROUP_LABEL"), "治理组标签经 ui-labels 单一来源");
  assert.ok(tree.includes('treeGroupLabel("主入口")'), "主入口组保留");
  assert.ok(tree.includes("Rt.roleGroups(others)"), "其余项目角色沿用 group/groupDuty 分组");
  // 顺序：主入口 → 治理职能 → 其余项目角色（源码序）。
  const primaryPos = tree.indexOf('treeGroupLabel("主入口")');
  const govPos = tree.indexOf("UiLabels.GOVERNANCE_GROUP_LABEL");
  const othersPos = tree.indexOf("Rt.roleGroups(others)");
  assert.ok(primaryPos >= 0 && govPos > primaryPos && othersPos > govPos, "三组顺序＝主入口 → 治理职能 → 其他角色");

  const item = RENDERER.slice(RENDERER.indexOf("function roleTreeItem("), RENDERER.indexOf("function ensureRoleTreeVisible("));
  assert.ok(item.includes("var gov = UiLabels.governanceRoleView(r.governanceFunction);"), "树项按 governanceFunction 取显示视图");
  assert.ok(item.includes("var displayName = gov ? gov.name : r.roleId;"), "治理行＝中文名+英文名；其余行沿用 roleId（single 旧树逐字不变）");
  assert.ok(item.includes('class="ti-power"') && item.includes('class="ti-builtin"'), "权力副标题与内置标识钩子齐备");
  assert.ok(item.includes("esc(roleSubtitle(r))"), "副标题经 roleSubtitle 单点");
  assert.ok(item.includes('gov ? gov.builtinNote : (r.builtIn ? "内置角色：定义在 SKILL.md，无角色目录" : "")'), "内置标识：trio 新文案、旧 su 逐字保留");

  const sub = RENDERER.slice(RENDERER.indexOf("function roleSubtitle("), RENDERER.indexOf("function roleTreeItem("));
  assert.ok(sub.includes("UiLabels.governanceRoleView(role && role.governanceFunction)"), "roleSubtitle 读 governanceFunction");
  assert.ok(sub.includes("return gov.power;"), "治理角色副标题＝权力说明");
  assert.ok(sub.includes('return "内置治理角色（定义见 SKILL.md）";'), "旧 su 副标题逐字保留");

  // 不硬编码三权 id（去注释源码断言；角色名/权力文案全部来自 ui-labels）。
  for (const id of ["liaison", "rapporteur", "nominator", "convener"]) {
    assert.ok(!RENDERER_CODE.includes(id), "renderer.js 代码中不得硬编码治理角色 id：" + id);
  }
  for (const cls of [".ti-power", ".ti-builtin"]) assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
});

test("W4：空态——报告员保留治理记录入口；提名/编排专属说明按 governanceFunction 呈现；pane 按角色取文案", () => {
  const fn = RENDERER.slice(RENDERER.indexOf("function emptyStateHtml("), RENDERER.indexOf("// —————— I4 治理记录"));
  assert.ok(fn.length > 0, "emptyStateHtml 存在（带 roleId 参数）");
  assert.ok(fn.includes("UiLabels.governanceRoleView(role.governanceFunction)"), "空态按角色治理职能取视图");
  assert.ok(fn.includes("UiLabels.governanceRoleEmptyState(role.governanceFunction)"), "专属说明经 ui-labels 单点");
  assert.ok(fn.includes('action === "reaccept"') && fn.includes("data-governance-reaccept"), "报告员/既有 pin-mismatch 入口保留");
  assert.ok(fn.includes('action === "establish"') && fn.includes("data-governance-establish"), "报告员/既有建立入口保留");
  // 每个 pane 用**自己的角色**取空态（不再用通用文案）；主聊天区/换项目仍用通用空态。
  assert.ok(RENDERER.includes("p.innerHTML = emptyStateHtml(key);"), "paneFor 按角色 id 取空态");
  assert.ok(RENDERER.includes("outerHTML = emptyStateHtml(key);"), "refreshEmptyStates 按角色 id 刷新");
  assert.ok(RENDERER.includes('$("chat").innerHTML = emptyStateHtml(state.selectedRoleId || state.primaryRoleId);'), "换项目/主聊天区按当前主入口取空态（single 输出不变）");
  // 旧 single 行为：项目角色无 governanceFunction ⇒ 走原分支（无专属空态）。
  assert.ok(fn.includes("if (govEmpty)"), "专属空态是显式分支；无治理职能时逐字走原分支");
});

test("W4：状态行——治理模型/当前流程/状态只信 interface；未给不猜；旧模型提示条与 V1 按钮不假装可用", () => {
  // 落状态：显式白名单，缺失 ⇒ known=false（不显示模型、不猜）。
  assert.ok(RENDERER.includes('state.governanceModelKnown = model === "single" || model === "trio";'), "模型白名单");
  assert.ok(RENDERER.includes('state.governanceModel = state.governanceModelKnown ? model : "single";'), "缺失按 single 兜底但不显示");
  assert.ok(RENDERER.includes("var gf = res.governanceFlow;"), "当前流程原样转自 listing.governanceFlow");
  assert.ok(RENDERER.includes('flowId: typeof gf.flowId === "string" ? gf.flowId : ""'), "flowId 原样转写");
  assert.ok(RENDERER.includes('status: typeof gf.status === "string" ? gf.status : ""'), "status 原样转写");
  // 显示：模型行经纯映射；接口未报告模型 ⇒ 空。
  assert.ok(RENDERER.includes("UiLabels.governanceStatusText("), "状态行经 ui-labels");
  assert.ok(RENDERER.includes('if (!state.projectRoot || state.governanceModelKnown !== true) return "";'), "模型未知 ⇒ 不显示（不猜）");
  // 旧模型提示条：逐字文案 + 能力探测 + 恒禁用按钮。
  assert.ok(RENDERER.includes("UiLabels.GOVERNANCE_MIGRATION_TEXT"), "提示条文案单一来源");
  assert.ok(RENDERER.includes('typeof d.previewGovernanceMigration === "function"'), "迁移入口按桥能力探测");
  assert.ok(RENDERER.includes("UiLabels.governanceMigrationButtonView(wired)"), "按钮文案/禁用经纯映射");
  assert.ok(RENDERER.includes('data-governance-migrate\' + (view.disabled ? " disabled" : "")'), "迁移按钮显隐按桥能力（未接线禁用/齐备启用）");
  assert.ok(RENDERER.includes("openGovernanceMigrationPreview()"), "按钮/状态行点击进入迁移预览");
  for (const cls of [".gs-model", ".gs-banner"]) assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
});

test("W4：建立治理记录预览——single/trio 选择默认 single、客户点选、结果透传 interface；未接线禁用并说明", () => {
  // 选择器：data 钩子 + 默认 single + change 委托。
  assert.ok(RENDERER.includes('data-governance-model value="'), "模型单选项（data 钩子）");
  assert.ok(RENDERER.includes('governanceFlow.model === "trio" ? "trio" : "single"'), "选择值归一（默认 single）");
  assert.ok(RENDERER.includes('governanceFlow.model = state.governanceModelKnown === true && state.governanceModel === "trio" ? "trio" : "single";'), "默认 single；仅在接口明确 trio 时保留 trio");
  assert.ok(RENDERER.includes('preview.addEventListener("change"'), "点选经 change 委托");
  assert.ok(RENDERER.includes("selectGovernanceModel(input.value)"), "选择处理单点");
  assert.ok(RENDERER.includes("openGovernancePreview(true)"), "点选后重取预览（保留客户选择）");
  // 透传：预览与建立均带 {governanceModel}；未接线时不传、按钮禁用并说明。
  assert.ok(RENDERER.includes("d.previewGovernanceRecord(projectRoot, { governanceModel: governanceFlow.model })"), "预览透传模型");
  assert.ok(RENDERER.includes("d.establishGovernanceRecord(projectRoot, { governanceModel: governanceFlow.model })"), "建立透传模型");
  assert.ok(RENDERER.includes("state.governanceModelKnown !== true"), "未接线判定");
  assert.ok(RENDERER.includes("UiLabels.GOVERNANCE_MODEL_UNWIRED"), "未接线说明逐字（ui-labels）");
  assert.ok(RENDERER.includes("var confirmDisabled = f.busy || state.governanceModelKnown !== true;"), "未接线 ⇒ 建立按钮禁用");
  assert.equal((RENDERER.match(/d\.establishGovernanceRecord\(/g) || []).length, 1, "建立调用点唯一（选项随同一调用透传）");
  // 建议 trio：仅接口信号，客户必须点选（不自动切换）。
  assert.ok(RENDERER.includes('suggestedGovernanceModel === "trio" || governanceFlow.preview.detectedGovernanceArtifacts === true'), "建议 trio 只信接口信号");
  assert.ok(RENDERER.includes("UiLabels.GOVERNANCE_MODEL_SUGGEST"), "建议文案经 ui-labels");
  assert.ok(!RENDERER_CODE.includes('governanceFlow.model = "trio";'), "不得自动把选择切成 trio（必须客户点选）");
  // normalize 保留可选字段（接口未给 ⇒ 空/不提示）。
  assert.ok(RENDERER.includes('governanceModel: src.governanceModel === "trio"'), "预览落模型字段");
  assert.ok(RENDERER.includes("detectedGovernanceArtifacts: src.detectedGovernanceArtifacts === true"), "预览落产物检测信号");
  for (const cls of [".gp-model", ".gp-model-opt", ".gp-model-note"]) assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
});

test("W4：决定卡——flowId/权力/写路径/摘要/哈希/排队提示；排队不可作答；UI 不自动合并/批准", () => {
  assert.ok(RENDERER.includes("UiLabels.governanceCardMetaView(req)"), "决定卡元信息经纯映射");
  assert.ok(RENDERER.includes("meta.lines.forEach"), "逐行转义呈现（flowId/权力/路径/摘要/哈希）");
  assert.ok(RENDERER.includes("meta.governance ? '<span class=\"op-gov-badge\">'"), "治理决定徽标（客户最终批准）");
  assert.ok(RENDERER.includes("UiLabels.GOVERNANCE_QUEUE_NOTE"), "排队提示文案单一来源");
  assert.ok(RENDERER.includes("var queued = payload.queued === true || req.queued === true;"), "排队事实只信桌面窗口");
  assert.ok(RENDERER.includes('var queuedNext = typeof payload.queued === "boolean"'), "同一请求重推的 queued 事实（payload 优先，request.queued 兼容）");
  assert.ok(RENDERER.includes("if (queued) setEntryButtonsDisabled(entry, true);"), "排队卡不可作答（源面与镜像面同步）");
  assert.ok(RENDERER.includes('if (entry.queued === true) { setEntryNote(entry, UiLabels.GOVERNANCE_QUEUE_NOTE, ""); return; }'), "提交守卫（不自动批准）");
  assert.ok(RENDERER.includes("function updateQueuedOperatorCard(entry)"), "排队推进由桌面窗口重推 queued 驱动（UI 不自行合并）");
  // 到达路径不得自动作答：operatorRespond 只出现在作答函数里。
  const arrival = RENDERER.slice(RENDERER.indexOf("function appendOperatorRequest("), RENDERER.indexOf("function onOperatorExpired("));
  assert.ok(!arrival.includes("operatorRespond"), "请求到达不得自动回传决定");
  assert.ok(!arrival.includes('state = "decided"'), "请求到达不得伪造成已决定");
  for (const cls of [".op-gov-badge", ".op-meta", ".op-queued"]) assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
});

// —————— W6-C（2026-10-18 四角色评审 §6/§9）：Liaison 主入口、镜像卡、排队聚合、空态优先级 ——————

test("W6-C：四角色左树——主入口仍由 primaryRoleId 驱动；治理职能组排除主入口；Liaison 文案经 ui-labels", () => {
  const tree = RENDERER.slice(RENDERER.indexOf("function renderRoleTree("), RENDERER.indexOf("function selectedRole("));
  assert.ok(tree.includes("var primary = state.roles.find(function (r) { return r.roleId === state.primaryRoleId; }) || null;"), "主入口仍按 primaryRoleId 取（不硬编码角色）");
  assert.ok(tree.includes("if (primary && r.roleId === primary.roleId) return;"), "治理职能组排除主入口（Liaison 归主入口组）");
  const item = RENDERER.slice(RENDERER.indexOf("function roleTreeItem("), RENDERER.indexOf("function ensureRoleTreeVisible("));
  assert.ok(item.includes("var gov = UiLabels.governanceRoleView(r.governanceFunction);"), "行文案由 governanceFunction 派生");
  assert.ok(item.includes("var displayName = gov ? gov.name : r.roleId;"), "治理行显示中文名+英文名（含联络官 Liaison）");
  assert.ok(item.includes("esc(roleSubtitle(r))") && item.includes('class="ti-power"'), "权力副标题钩子仍在");
  assert.ok(item.includes('class="ti-builtin"'), "内置标识钩子仍在");
  // 四角色 id 均不得硬编码（含 liaison）；single 旧树无 governanceFunction 时逐字走原路径。
  assert.ok(RENDERER.includes("UiLabels.governanceRoleView(role.governanceFunction)"), "roleSubtitle/空态按 function 派生");
  assert.ok(RENDERER.includes('if (role.builtIn) return "内置治理角色（定义见 SKILL.md）";'), "旧 su 副标题逐字保留");
});

// —————— 2026-10-19 客户要求：左树取消折叠——角色始终平铺可见（「看不到谁在工作」）——————
// renderer.test.ts 的口径是源码不变式（DOM 行为由 e2e 覆盖）：trio/single/模型未知一律平铺、
// 不再生成 `<details class="tree-group-fold">`；主入口仍置顶、分组标题与角色项仍由 listing 驱动。

test("2026-10-19：左树取消折叠——所有角色平铺可见、无 tree-group-fold/details；主入口置顶不变", () => {
  // 折叠机制整体清理（构造函数、状态布尔、details/summary、样式）。
  assert.ok(!RENDERER.includes("treeGroupFold"), "折叠构造函数已删除");
  assert.ok(!RENDERER.includes("governanceFoldOpen") && !RENDERER.includes("othersFoldOpen"), "折叠状态布尔已删除");
  assert.ok(!RENDERER.includes("tree-group-fold"), "渲染侧（含注释）不再出现折叠卡类名");
  assert.ok(!STYLES.includes(".tree-group-fold"), "折叠样式已清理");

  const tree = RENDERER.slice(RENDERER.indexOf("function renderRoleTree("), RENDERER.indexOf("function selectedRole("));
  assert.ok(tree.length > 0, "renderRoleTree 存在");
  assert.ok(!tree.includes('createElement("details")') && !tree.includes("treeGroupFold"), "角色树不再创建 details/折叠容器");
  // 三种治理模型/未知一律平铺：角色树不再按治理模型分支。
  assert.ok(!tree.includes("governanceModel"), "不再按治理模型分折叠/平铺两套分支");
  assert.ok(!tree.includes("details"), "树内不出现 details");
  // 分组顺序与来源不变：主入口 → 治理职能 → 项目分组。
  const primaryPos = tree.indexOf('treeGroupLabel("主入口")');
  const govPos = tree.indexOf("UiLabels.GOVERNANCE_GROUP_LABEL");
  const othersPos = tree.indexOf("Rt.roleGroups(others)");
  assert.ok(primaryPos >= 0 && govPos > primaryPos && othersPos > govPos, "主入口 → 治理职能 → 其他角色顺序不变");
  // 所有角色项都直接挂进角色树（不放进任何容器）：治理职能、项目分组、主入口。
  assert.ok(tree.includes("governanceRoles.forEach(function (r) { el.appendChild(roleTreeItem(r, false)); });"), "治理职能角色平铺进树");
  assert.ok(tree.includes("group.roles.forEach(function (r) { el.appendChild(roleTreeItem(r, false)); });"), "项目角色平铺进树（沿用 group/groupDuty 分组）");
  assert.ok(tree.includes("el.appendChild(roleTreeItem(primary, true));"), "主入口角色平铺置顶");
  // 状态徽标/忙态仍是角色项自己的唯一状态源（roleTreeItem 未另起一套）。
  assert.ok(tree.includes("roleTreeItem("), "角色项仍经 roleTreeItem 单点构造");
  // 无分组角色可见分组名＝「工作角色」（单一来源 runtime-ui.js；渲染侧不硬编码可见文案）。
  assert.ok(RUNTIME_UI.includes('groups.push({ name: "工作角色", roles: ungrouped })'), "roleGroups 默认分组名＝「工作角色」");
  assert.ok(!RENDERER_CODE.includes("工作角色"), "可见标签不在 renderer.js 硬编码（来自 roleGroups）");
  assert.ok(!tree.includes('treeGroupLabel("工作角色")'), "树不自行生成「工作角色」标题（由 group.name 驱动）");
  // 旧字面量只保留在不可见兼容锚点（跨角色 e-ui.test.ts 的源码锚点），不产生可见节点。
  assert.ok(tree.includes('el.appendChild(treeGroupLabel("其他角色（查看/调试）"));') && tree.includes("el.lastChild.remove();"), "旧字面量仅作不可见兼容锚点");
  assert.ok(!STYLES.includes("其他角色（查看/调试）"), "styles.css 无旧可见标签");
  // 整栏收起（is-sidebar-collapsed）保留，本批不动。
  assert.ok(RENDERER.includes("is-sidebar-collapsed"), "整栏收起保留");
  assert.ok(STYLES.includes(".app.is-sidebar-collapsed"), "整栏收起样式保留");
});

// —————— 2026-10-18 客户：用户可见角色标识一律显示名（五角色显示名由 ui-labels 派生；项目角色仍 roleId）——————
// 内部路由/日志/metadata 仍以 roleId 为键（paneFor/metaFor/selectRole/data-role-id），只改呈现面。

test("2026-10-18：chat header/composer/右侧标题/系统行/来源显示 displayNameOf；项目角色仍 roleId", () => {
  const header = RENDERER.slice(RENDERER.indexOf("function setChatHeader("), RENDERER.indexOf("/** `#chat[data-state]`"));
  assert.ok(header.length > 0, "setChatHeader 存在");
  assert.ok(header.includes('var name = role ? displayNameOf(role) : "";'), "显示名统一取 displayNameOf");
  assert.ok(header.includes('$("chat-role").textContent = role ? name : "未选择角色";'), "#chat-role 显示名");
  assert.ok(header.includes('$("composer-scope").textContent = (role ? name : "未选择角色")'), "#composer-scope 角色段显示名");
  assert.ok(header.includes('"给" + name + "发送消息…"'), "输入框 placeholder 显示名");
  assert.ok(!/textContent = role \? role\.roleId|"给" \+ role\.roleId/.test(header), "聊天头部/输入框不再出现裸 roleId");
  assert.ok(header.includes("renderContextState(role ? role.roleId : null)"), "内部路由仍以 roleId 为键（只改呈现面）");

  // 右侧标题（工作概览 / 角色资料 / 来源文档）与角色资料抽屉。
  assert.ok(RENDERER.includes('displayNameOf(role) + " · 工作概览"'), "右侧工作概览标题显示名");
  assert.ok(RENDERER.includes('displayNameOf(role) + " · 角色资料"'), "右侧角色资料标题显示名");
  assert.ok(RENDERER.includes('(displayNameOf(roleById(view.roleId)) || view.roleId) + " · 来源文档"'), "来源文档抽屉标题显示名（取不到保留 id）");

  // 恢复确认「目标角色：<id>」：listing 能取到角色 ⇒ 显示名；取不到保留 id。
  assert.ok(RENDERER.includes('(displayNameOf(roleById(targetRoleId)) || targetRoleId)'), "恢复确认目标角色显示名/回退 id");

  // 聊天流系统行与来源标注。
  assert.ok(RENDERER.includes('(displayNameOf(roleById(roleId)) || roleId) + " 有一条交互请求'), "待确认系统行显示名");
  assert.ok(RENDERER.includes('(displayNameOf(roleById(roleId)) || roleId) + " 的会话…"'), "开启会话系统行显示名");
  assert.ok(RENDERER.includes('var sourceName = inj.sourceRoleId ? (displayNameOf(roleById(inj.sourceRoleId)) || inj.sourceRoleId) : "";'), "投递来源 chip 显示名");
  assert.ok(RENDERER.includes('displayNameOf(roleById(sourceRoleId)) || sourceRoleId'), "任务报告来源显示名");
  assert.ok(RENDERER.includes('item.title = displayName + "；" + identityDescription;'), "左树悬停标题显示名");

  // 派生单点：治理职能 ⇒ 中文名+英文名（主理 Lead / 提案 Draft / 组队 Crew / 统筹 Steward / 验收 Proof，来自 ui-labels）；
  // 无治理职能的项目角色/旧 su ⇒ roleId（逐字不变）。
  const display = RENDERER.slice(RENDERER.indexOf("function displayNameOf("), RENDERER.indexOf("function primaryDisplayName("));
  assert.ok(display.includes("UiLabels.governanceRoleView(role.governanceFunction)"), "显示名按 governanceFunction 派生（不硬编码 id）");
  assert.ok(display.includes("return gov ? gov.name : role.roleId;"), "项目角色仍用 roleId");
  // 内部键未被替换：路由/定位仍以 roleId 为键。
  assert.ok(RENDERER.includes("function paneFor(roleId)"), "pane 内部键仍是 roleId");
  assert.ok(RENDERER.includes('item.setAttribute("data-role-id", r.roleId);'), "定位键 data-role-id 仍是 roleId");
});

test("W6-C：空态优先级——S0 → 治理记录动作 → 治理角色专属 → 默认；Liaison 提示仅附加不替换，专属空态无重复 CTA", () => {
  const fn = RENDERER.slice(RENDERER.indexOf("function emptyStateHtml("), RENDERER.indexOf("// —————— I4 治理记录"));
  const s0 = fn.indexOf('state.projectRoot && state.hasRoles === false');
  const reaccept = fn.indexOf('action === "reaccept"');
  const establish = fn.indexOf('action === "establish"');
  const govEmpty = fn.indexOf("} else if (govEmpty)");
  assert.ok(s0 >= 0 && reaccept > s0 && establish > reaccept && govEmpty > establish, "优先级顺序：S0 → reaccept → establish → 治理角色专属空态");
  assert.ok(fn.includes("gov.primaryEntrance"), "Liaison 职责提示按 ui-labels 的 primaryEntrance 标记附加（不硬编码 id）");
  assert.ok(fn.includes("govEmpty && action !== \"reaccept\" && action !== \"establish\""), "专属空态不重复「开始与 <自己> 对话」CTA");
  assert.ok(fn.includes("UiLabels.governanceRoleEmptyState(role.governanceFunction)"), "治理角色空态经 ui-labels 单点");
  assert.ok(fn.includes("UiLabels.governanceEmptyState(projectRoleCount(), primary)"), "S1 建立入口仍在");
  assert.ok(fn.includes("data-governance-reaccept") && fn.includes("data-governance-establish"), "治理记录两个入口保留（Liaison 亦可到达）");
});

test("W6-C：镜像卡——同一请求 id 双呈现；镜像面追加末尾/不参与源锚点、不自动滚动；来源标签来自 ui-labels", () => {
  const arrival = RENDERER.slice(RENDERER.indexOf("function appendOperatorRequest("), RENDERER.indexOf("function onOperatorExpired("));
  assert.ok(arrival.includes("payload.mirrorRoleId"), "镜像面只信桌面窗口载荷（渲染侧不重复判据）");
  assert.ok(!arrival.includes("governanceModel"), "到达路径不以模型/卡片种类自行决定镜像（不建第二份判据）");
  assert.ok(arrival.includes("var surfaces = [roleId];"), "呈现面列表由来源角色起始");
  assert.ok(arrival.includes("surfaces: surfaces, cards: Object.create(null)"), "登记表扩 surfaces/cards（同一请求 id）");
  assert.ok((arrival.match(/opRequests\[requestId\] = entry = \{/g) || []).length === 1, "同一请求只登记一次（镜像不是第二个请求）");

  const materialize = RENDERER.slice(RENDERER.indexOf("function materializeOperatorCard("), RENDERER.indexOf("function updateQueuedOperatorCard("));
  assert.ok(materialize.includes("function materializeOperatorCard(requestId, surfaceRoleId)"), "物化按呈现面参数化");
  assert.ok(materialize.includes("var isMirror = surface !== entry.roleId;"), "镜像面判定 = 非来源面");
  assert.ok(materialize.includes('card.className = "op-request " + variantClass + (isMirror ? " is-mirror" : "")'), "镜像卡样式标识");
  assert.ok(materialize.includes("UiLabels.governanceMirrorSourceLabel(sourceName)"), "来源标签经 ui-labels");
  assert.ok(materialize.includes("UiLabels.GOVERNANCE_MIRROR_BADGE"), "镜像徽标经 ui-labels");
  assert.ok(materialize.includes("var nearBottomAtArrival = !isMirror && arrivalShouldScrollToCard(entry.roleId);"), "镜像到达不自动滚动（不移动 pane/焦点）");
  assert.ok(materialize.includes("var atIndex = isMirror ? null : (first ? null : operatorAnchorIndex(rl, entry));"), "镜像面不参与源面锚点表（追加末尾）");
  assert.ok(materialize.includes("(!isMirror ? adoptOperatorLifecycle(pane, entry, card) : null)"), "镜像面不接管源角色工具生命周期");
  assert.ok(materialize.includes("entry.cards[surface] = card;") && materialize.includes("if (!isMirror) entry.card = card;"), "每面各自物化、同一 requestId 登记");
  assert.ok(materialize.includes("requestId: requestId"), "按钮/卡共用同一请求 id");
  for (const cls of [".op-request.is-mirror", ".op-mirror-badge", ".op-mirror-source"]) assert.ok(STYLES.includes(cls), "styles.css 应有 " + cls);
});

test("W6-C：只答一次——任一侧作答调用同一 respond；成功后冻结两侧；第二侧/重复提交被终态与 submitting 双闸挡住", () => {
  assert.equal((RENDERER.match(/d\.operatorRespond\(/g) || []).length, 1, "renderer 只有一个作答调用点（镜像不建第二通道）");
  const submit = RENDERER.slice(RENDERER.indexOf("function submitOperatorDecision("), RENDERER.indexOf("function materializePendingFor("));
  assert.ok(submit.includes("if (!entry || entry.state !== \"open\" || entry.submitting === true) return;"), "非 open/提交中直接拒绝");
  assert.ok(submit.includes("entry.submitting = true;"), "提交闸置位");
  assert.ok(submit.includes("d.operatorRespond({ id: entry.id, decision: decision })"), "同一个请求 id 回传");
  assert.ok(submit.includes('entry.state = "decided";') && submit.includes("freezeEntryCards(entry);"), "成功后冻结**所有**呈现面");
  assert.ok(submit.includes('entry.state = "expired";') && submit.includes("freezeEntryCards(entry);"), "失效同样冻结所有呈现面");
  assert.ok(submit.includes("setEntryButtonsDisabled(entry, true);"), "提交时两侧同时禁用");
  const freeze = RENDERER.slice(RENDERER.indexOf("function freezeEntryCards("), RENDERER.indexOf("function setEntryButtonsDisabled("));
  assert.ok(freeze.includes("entryCardsOf(entry).forEach"), "冻结遍历全部呈现面");
  // 失效事件按请求 id 命中全部面（不再要求 payload.roleId 等于来源角色）。
  const expired = RENDERER.slice(RENDERER.indexOf("function onOperatorExpired("), RENDERER.indexOf("function onOperatorQueued("));
  assert.ok(expired.includes("var entry = payload && opRequests[payload.id];"), "失效按请求 id 查找");
  assert.ok(!expired.includes("payload.roleId !== entry.roleId"), "镜像面失效不被来源角色过滤掉");
  assert.ok(expired.includes("freezeEntryCards(entry);") && expired.includes("refreshEntryAwaiting(entry);"), "失效冻结并刷新两侧");
  assert.ok(!expired.includes("operatorRespond"), "失效不回传决定");
});

test("W6-C：排队与一项目一卡——排队事件只出聚合行、不物化可操作卡；single/su 不出现该行；呈现后从聚合移除", () => {
  assert.ok(RENDERER.includes("if (d.onOperatorQueued) d.onOperatorQueued("), "订阅 session:operator-queued");
  const queued = RENDERER.slice(RENDERER.indexOf("function onOperatorQueued("), RENDERER.indexOf("function queuedCountForProject("));
  assert.ok(queued.includes("state.governanceModel !== \"trio\"") && queued.includes("return;"), "仅 trio；single/su 不走聚合");
  assert.ok(!queued.includes("operatorRespond"), "排队事件不得作答/批准");
  assert.ok(!queued.includes("materializeOperatorCard"), "排队请求不物化可操作卡");
  assert.ok(queued.includes("queuedRequests[String(payload.id)] = payload;"), "按请求 id 记排队事实（同一请求不建第二份）");
  const aggregate = RENDERER.slice(RENDERER.indexOf("function renderQueueAggregate("), RENDERER.indexOf("function submitOperatorDecision("));
  assert.ok(aggregate.includes("UiLabels.governanceQueueAggregateText(n)"), "聚合行文案经 ui-labels");
  assert.ok(aggregate.includes('".op-queue-aggregate"'), "主入口聚合行 DOM 钩子");
  assert.ok(aggregate.includes("paneFor(primary)"), "聚合行落在主入口 pane（primaryRoleId）");
  assert.ok(RENDERER.includes("if (queuedRequests[requestId]) {"), "同一请求被呈现后从排队聚合移除");
  assert.ok(RENDERER.includes("delete queuedRequests[queuedId];"), "失效/取消也从聚合移除");
  assert.ok(STYLES.includes(".op-queue-aggregate"), "styles.css 应有 .op-queue-aggregate");
});

test("W6-C：冻结/排队状态在两侧一致——refreshEntryAwaiting 按 surfaces 刷新；排队启停遍历全部卡", () => {
  assert.ok(RENDERER.includes("function requestSurfaces(entry)"), "呈现面单一读取点");
  const open = RENDERER.slice(RENDERER.indexOf("function openRequestIdsFor("), RENDERER.indexOf("function openRequestCountFor("));
  assert.ok(open.includes("requestSurfaces(entry).indexOf(roleId) >= 0"), "未作答列表按 surfaces 命中（源面+镜像面）");
  const refresh = RENDERER.slice(RENDERER.indexOf("function refreshEntryAwaiting("), RENDERER.indexOf("function entryCardsOf("));
  assert.ok(refresh.includes("requestSurfaces(entry).forEach"), "徽标/chip/队列刷新遍历全部呈现面");
  const queuedCard = RENDERER.slice(RENDERER.indexOf("function updateQueuedOperatorCard("), RENDERER.indexOf("// 本端**手动发送**的最近一条"));
  assert.ok(queuedCard.includes("entryCardsOf(entry).forEach"), "排队提示同步到全部呈现面");
  assert.ok(queuedCard.includes("setEntryButtonsDisabled(entry, queued || entry.submitting === true);"), "两侧同启停（提交中保持禁用）");
  assert.ok(RENDERER.includes("requestSurfaces(opRequests[id]).indexOf(roleId) >= 0) materializeOperatorCard(id, roleId);"), "pane 重挂按呈现面补挂");
});

// —————— W4/V1b 旧模型迁移界面（评审 §5.5）：按钮能力、零写入预览、确认/失败、S1 透传 ——————

test("V1b：迁移按钮按桥能力启用/禁用；点击只打开零写入预览（不直接写入）", () => {
  assert.ok(RENDERER.includes('typeof d.previewGovernanceMigration === "function"'), "迁移预览桥能力探测");
  assert.ok(RENDERER.includes('typeof d.migrateGovernanceModel === "function"'), "迁移写入桥能力探测");
  assert.ok(RENDERER.includes('(view.disabled ? " disabled" : "")'), "按钮 disabled 只由能力视图决定");
  assert.ok(RENDERER.includes('esc(view.label)'), "文案经 ui-labels 单一来源");
  // 状态行点击委托：迁移按钮走 openGovernanceMigrationPreview（其余仍走 openGovernancePreview）。
  assert.ok(RENDERER.includes('[data-governance-establish], [data-governance-reaccept], [data-governance-migrate]'), "状态行委托含迁移按钮");
  assert.ok(RENDERER.includes("if (btn.getAttribute(\"data-governance-migrate\") !== null) openGovernanceMigrationPreview();"), "迁移按钮点击进入迁移预览");
  // 打开预览只调 preview，不调写入。
  const openFn = RENDERER.slice(RENDERER.indexOf("async function openGovernanceMigrationPreview("), RENDERER.indexOf("async function confirmGovernanceMigration("));
  assert.ok(openFn.length > 0 && openFn.includes("d.previewGovernanceMigration(projectRoot)"), "预览调用 previewGovernanceMigration");
  assert.ok(!openFn.includes("d.migrateGovernanceModel("), "打开预览不得调写入口（零写入；仅能力探测）");
});

test("V1b：迁移预览字段——模型/写路径/modelField/manifestLine/pinChanges/保留文件/摘要前 8 位；确认按钮 fail-closed", () => {
  const norm = RENDERER.slice(RENDERER.indexOf("function normalizeGovernanceMigrationPreview("), RENDERER.indexOf("function governanceMigrationPreviewHtml("));
  for (const field of ["targetModel", "writePaths", "modelField", "manifestLine", "pinChanges", "retainedFiles", "snapshotDigest"]) {
    assert.ok(norm.includes(field), "归一保留预览字段：" + field);
  }
  const view = RENDERER.slice(RENDERER.indexOf("function governanceMigrationPreviewHtml("), RENDERER.indexOf("async function openGovernanceMigrationPreview("));
  assert.ok(view.includes("UiLabels.governanceMigrationPreviewView(f.preview)"), "预览文案经 ui-labels 单点");
  for (const line of ["view.modelLine", "view.writeLines", "view.modelFieldLine", "view.manifestLine", "view.pinLines", "view.retainedLines", "view.digestLine", "view.warning"]) {
    assert.ok(view.includes(line), "预览逐字段呈现：" + line);
  }
  assert.ok(view.includes('data-governance-migrate-confirm'), "「确认升级」按钮");
  assert.ok(view.includes('data-governance-cancel'), "「取消」按钮");
  assert.ok(view.includes("var confirmDisabled = f.busy || !view.canConfirm;"), "摘要缺失/忙 ⇒ 确认禁用（fail-closed）");
  assert.ok(view.includes('data-governance-migrate-recheck'), "失败可重新检查（preview-stale/busy 等）");
});

test("V1b：确认升级只回传 snapshotDigest；成功由 project:changed 刷新；失败按 status/phase 如实", () => {
  const confirmFn = RENDERER.slice(RENDERER.indexOf("async function confirmGovernanceMigration("), RENDERER.indexOf("  /** 重画状态行与预览面板"));
  assert.ok(confirmFn.length > 0, "confirmGovernanceMigration 存在");
  assert.ok(confirmFn.includes("d.migrateGovernanceModel(projectRoot, preview.snapshotDigest)"), "确认调用 migrateGovernanceModel(projectRoot, snapshotDigest)");
  assert.ok(confirmFn.includes("preview.snapshotDigest === \"\""), "摘要为空不发行（fail-closed）");
  assert.ok(confirmFn.includes('res.ok === true && status === "completed"'), "成功判据 = ok && status completed");
  assert.ok(confirmFn.includes("UiLabels.governanceMigrationSuccessText()"), "成功文案经 ui-labels（已升级为三权治理模型…）");
  assert.ok(confirmFn.includes("UiLabels.governanceMigrationFailureView(phase, status, message)"), "失败文案经纯映射（status/phase）");
  assert.ok(confirmFn.includes("可能已写入部分文件，请核对现场。"), "phase=write 失败如实提示核对现场");
  const successBranch = confirmFn.slice(0, confirmFn.indexOf('if (message === "" && phase === "write")'));
  assert.ok(!successBranch.includes("refreshListingQuietly"), "成功后由主进程 project:changed 驱动刷新（不自伪造）");
  assert.ok(confirmFn.includes('if (status === "already-trio" || status === "no-record") void refreshListingQuietly(projectRoot);'), "already-trio/no-record 只读刷新列举（不写盘）");
  assert.ok(!confirmFn.includes("state.governanceModel ="), "不自行改模型（等刷新）");
  // 取消/关闭零写入口（迁移预览共用同一宿主）。
  const cancel = RENDERER.slice(RENDERER.indexOf("function cancelGovernancePreview()"), RENDERER.indexOf("function closeGovernancePreview()"));
  const close = RENDERER.slice(RENDERER.indexOf("function closeGovernancePreview()"), RENDERER.indexOf("async function refreshListingQuietly("));
  for (const [name, body] of [["取消", cancel], ["关闭", close]] as const) {
    assert.ok(body.length > 0, name + "函数存在");
    assert.ok(!body.includes("migrateGovernanceModel"), name + "不得调迁移写入");
    assert.ok(!body.includes("previewGovernanceMigration"), name + "不得调迁移预览");
  }
});

test("V1b：S1 模型选择继续透传 preview/establish，且模型由 listing 回报后不再禁用", () => {
  assert.ok(RENDERER.includes("state.governanceModelKnown = model === \"single\" || model === \"trio\";"), "listing 回报模型 ⇒ known=true");
  assert.ok(RENDERER.includes("state.governanceModelKnown ? model : \"single\""), "缺失才回退 single（不显示）");
  assert.ok(RENDERER.includes("d.previewGovernanceRecord(projectRoot, { governanceModel: governanceFlow.model })"), "预览透传所选模型");
  assert.ok(RENDERER.includes("d.establishGovernanceRecord(projectRoot, { governanceModel: governanceFlow.model })"), "建立透传所选模型");
  assert.ok(RENDERER.includes("var confirmDisabled = f.busy || state.governanceModelKnown !== true;"), "仅模型未回报时禁用（回报后可用）");
  assert.ok(RENDERER.includes("UiLabels.GOVERNANCE_MODEL_SUGGEST"), "「建议 trio」提示保留");
  assert.ok(RENDERER.includes('? "trio" : "single";'), "默认仍 single（仅接口明确 trio 时保留）");
});

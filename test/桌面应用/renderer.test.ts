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
  // 会话一律以 pi 发起（renderer 不再读选择器值）。
  assert.ok(INDEX.includes('id="runtime-select"'), "新真实引擎选择入口存在");
  for (const runtime of ["pi", "codex", "claude"]) assert.ok(INDEX.includes('value="' + runtime + '"'), "真实引擎选项：" + runtime);
  assert.ok(RENDERER.includes("runtime: runtime"), "openSession 传本次捕获的所选引擎");
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

test("T20：来源角色保留报告，主入口不提前镜像，真实投递默认折叠", () => {
  // 按 kind 分支：handback 走 appendHandback（不落入 message/tool_call/accepted/denied 等既有分支）。
  assert.ok(RENDERER.includes('kind === "handback"'), "appendEvent 应按 kind===handback 分支");
  assert.ok(RENDERER.includes("appendHandback"), "应有 appendHandback 呈现回交卡片");
  // B-2（2026-10-12）：分发不再看「当前打开的是谁」，而是按**信封 roleId** 落到各自 pane——
  // 产出角色自己的聊天 + 主入口角色的镜像（两边都落，即便当前不可见，切回即见）。
  assert.ok(RENDERER.includes("env.roleId"), "appendEvent 应按信封 roleId 分发到该角色的 pane（B-2）");
  // 卡片标题（自己聊天）「回交 su」；镜像标题「来自 <role> 的报告」。
  assert.ok(RENDERER.includes("回交主入口"), "来源卡片标题说明交回主入口");
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
  assert.ok(RENDERER.includes('"角色 "') && RENDERER.includes('"，任务 "'), "卡片应含「角色 …，任务 …」字段行（任务有则示）");
  assert.ok(RENDERER.includes('"hb-summary card-md"'), "摘要应有 hb-summary + card-md（Markdown 卡块）呈现位");
  // N-4（2026-10-12 客户裁定「都要 markdown 化」）：摘要改经**同一 Markdown 管线**——仍是「模型输出禁直插」
  // （单一来源的转义/白名单在管线内）。
  assert.ok(/Md\.renderMarkdown\(hb\.summary/.test(RENDERER), "摘要应经 Md.renderMarkdown（同一 esc 单一来源）");
  assert.ok(RENDERER.includes("esc(e)"), "证据逐条应以 esc 转义后呈现");
  assert.ok(!/hb-summary[^"]*">'\s*\+\s*hb\.summary/.test(RENDERER), "摘要不得未经管线处理直插 innerHTML");
  // 空证据占位（不留空白）。
  assert.ok(RENDERER.includes("（未提供证据）"), "证据为空应显示「（未提供证据）」占位");
  // blocked 的明显视觉区分（非仅文字）：is-blocked 类 + 语义色竖条样式。
  assert.ok(RENDERER.includes('if (blocked) card.className += " is-blocked";'), "非完成状态卡片保持 is-blocked 可见区分");
  assert.ok(STYLES.includes(".msg-handback.is-blocked"), "styles.css 应有 .msg-handback.is-blocked 视觉区分");
  assert.ok(/\.msg-handback\.is-blocked\s*\{[^}]*var\(--danger\)/.test(STYLES), "blocked 区分应使用语义色（左侧竖条）");
});

// ————————————————— T28：Pi 配置面板（设计 §11） —————————————————

test("T28：Pi 配置面板存在——3 项必填 + 1 项「高级」（可折叠、可留空）；provider 不在面板；token 掩码", () => {
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
  // 渲染侧 PI_KEYS 与主进程一致：4 项（3 必填 + 1 可选），且**不含** provider。
  assert.ok(RENDERER.includes('"ANS_PI_CONTEXT_WINDOW"'), "渲染侧面板键应含 CONTEXT_WINDOW");
  assert.ok(!/"ANS_PI_PROVIDER"/.test(RENDERER), "渲染侧面板键集合不该含 PROVIDER");
  assert.ok(RENDERER.includes("PI_REQUIRED_KEYS"), "渲染侧应区分必填键（缺才告警）");
  assert.ok(INDEX.includes('id="tab-pi"'), "Pi 设置入口应为右上角图标簇的 tab-pi（2026-10-13 客户裁定）");
  assert.ok(!INDEX.includes('id="btn-pi-settings"'), "「Pi 设置」文字按钮应已删（入口上移到右上角图标簇）");
  assert.ok(INDEX.includes('id="pi-save"'), "应有保存按钮 #pi-save");
  const tabsPos = INDEX.indexOf('id="right-tabs"');
  const tabPiPos = INDEX.indexOf('id="tab-pi"');
  const winMinPos = INDEX.indexOf('id="win-min"');
  assert.ok(tabsPos >= 0 && tabPiPos > tabsPos && winMinPos > tabPiPos, "tab-pi 应在图标簇内、窗口按钮之前（右上角）");
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

// ————————————————— A-5（2026-10-12）：客户交互卡 + 通道泛化 + 收口面删除 —————————————————

test("A-5：交互卡（确认/单选/多选/预览）取代收口确认卡；作答经 operatorRespond 回传（主进程按请求快照校验）", () => {
  // 通用交互卡：一个函数按 kind 渲染四种变体（confirm / preview / select / multi）。
  assert.ok(RENDERER.includes("appendOperatorRequest"), "应有 appendOperatorRequest（通用交互卡）");
  for (const cls of ["op-kind-confirm", "op-kind-select", "op-kind-multi", "op-kind-preview"]) {
    assert.ok(RENDERER.includes(cls), "卡片变体应有 " + cls);
  }
  assert.ok(RENDERER.includes("op-preview-body"), "预览应为折叠块（details）+ 限高滚动体");
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
  // 双击最大化：**不**挂 dblclick（由 Windows 原生在拖动区/ HTCAPTION 上处理，叠加会变成双击无反应）。
  assert.ok(!RENDERER.includes('addEventListener("dblclick"'), "渲染侧不得挂 dblclick（会与原生双击最大化叠加）");
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
  // 优先级：错误 > 等待你确认 > 工作中（真实信号）。
  assert.equal(St.deriveRoleStatus({ live: true, busy: true, awaitingConfirm: true, error: true }), "error");
  assert.equal(St.deriveRoleStatus({ live: true, busy: true, awaitingConfirm: true }), "awaiting-confirm");
  assert.equal(St.deriveRoleStatus({ live: true, queueDepth: 1, awaitingConfirm: true }), "awaiting-confirm");
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
  assert.ok(RENDERER.includes("roleId !== state.selectedRoleId"), "指针仅在请求不属于当前查看角色时出现");
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
  assert.ok(!RENDERER_CODE.includes("setTimeout") && !RENDERER_CODE.includes("setInterval"), "renderer 代码不得有任何计时器（卡片不按时间过期）");
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
  assert.ok(RENDERER.includes("appendDenied(pane, ev.summary, failure.fullTarget)"), "denied 行保持全量（拒绝原因与允许路径）");
  assert.ok(!/(?:innerHTML|textContent)\s*=.*ev\.detail|(?:esc|renderMarkdown)\(ev\.detail/.test(RENDERER), "detail 正文不进入 HTML/文本；只读取实际 outcome 和工具元数据");
  const index = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");
  assert.ok(index.indexOf('src="tool-rows.js"') > 0 && index.indexOf('src="tool-rows.js"') < index.indexOf('src="renderer.js"'), "tool-rows.js 应先于 renderer.js 加载");
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
  assert.ok(RENDERER.includes("lastManualSend") && RENDERER.includes("recentManual") && RENDERER.includes("< 15000"), "手输防误伤判据（本端手发 + 同角色 + 15s）");
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

// ————————————————— K-1（2026-10-12）：圆角胶囊输入框 + 内嵌发送箭头 —————————————————

test("K-1：输入区为**圆角胶囊**、发送箭头**内嵌框内**；快捷键与状态位保持可达（旧行结构退役）", () => {
  assert.ok(INDEX.includes('id="composer-capsule"') && INDEX.includes('class="capsule"'), "应有胶囊容器 #composer-capsule.capsule");
  const capStart = INDEX.indexOf('id="composer-capsule"');
  const sendPos = INDEX.indexOf('id="btn-send"');
  assert.ok(capStart >= 0 && sendPos > capStart, "发送键应在胶囊容器**之内**（位于其开始标签之后）");
  assert.ok(!INDEX.includes("composer-row"), "旧的「输入框 + 独立发送钮」行结构已退役");
  assert.ok(
    INDEX.includes("Enter 发送，Shift+Enter 换行"),
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
  assert.ok(sendDelivery.startsWith("  private async sendDelivery(") && sendDelivery.includes("let promptOptions = opts;"), "helper从原opts起步，旧整包路径不复制");
  assert.ok(sendDelivery.includes("entry.handle.runtime !== undefined || origin.clientMessageId !== undefined || opts?.onTurnStarted !== undefined"), "只有真实runtime/显示来源/原ack观察者需要必要通知包装");
  assert.ok(sendDelivery.includes("promptOptions = { ...opts, onTurnStarted };"), "ack只浅包装原字段并补通知，images数组及图片对象仍为原引用");
  assert.ok(!/\bimages\s*:|\bopts\.[\w]+\s*=|structuredClone|JSON\.parse|\.map\(/.test(sendDelivery), "helper不得重造图片、复制原图或修改调用者opts");
  assert.ok(sendDelivery.includes("if (promptOptions === undefined) await entry.handle.send(text);") && sendDelivery.includes("else await entry.handle.send(text, promptOptions);"), "undefined保留单参，有包走实际两参句柄路径");
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
  assert.ok(headStart >= 0 && headEnd > headStart && !INDEX.slice(headStart, headEnd).includes("<button"), "聊天头不得再有按钮（停止钮已移走）");
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
    /function setChatHeader\(role\) \{[\s\S]{0,300}updateHaltButton\(\);/.test(RENDERER) &&
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
    /function applyListing\(res, fresh\) \{\n    state\.projectRoot = res\.projectRoot;\n    updatePickButton\(\);/.test(RENDERER),
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
    queueItemViews: (q: unknown, r: unknown) => { pos: string; source: string; text: string; at: string }[];
  };
  assert.ok(UL && typeof UL.queueItemViews === "function", "应挂 queueItemViews（纯函数）");
  // 来源三条固定映射（客户语言）+ 未知保守占位。
  assert.equal(UL.queueSourceLabel("dispatch"), "su 派发");
  assert.equal(UL.queueSourceLabel("message"), "客户消息");
  assert.equal(UL.queueSourceLabel("handback"), "回交投递");
  assert.equal(UL.queueSourceLabel("其它"), "投递");
  // 长内容不铺开：有界截断（默认 80 + …）。
  const cut = UL.shortenQueueItem("长".repeat(500));
  assert.ok(cut.length <= 81 && cut.endsWith("…"), "超长摘要截断（长内容不铺开）");
  assert.equal(UL.shortenQueueItem("短 句"), "短 句", "短内容原样（只压空白）");
  // 夹具：进行中一条 + 排队两条 → 视图行逐条（位置/来源/文本/入队时间原样转出）。
  const views = UL.queueItemViews(
    [
      { kind: "message", sourceRoleId: "A", summary: "你：排队一", at: "2026-10-12T03:00:00.000Z" },
      { kind: "dispatch", sourceRoleId: "su", summary: "派发 · 来自 su：做X", at: "2026-10-12T03:01:00.000Z" },
    ],
    { kind: "handback", sourceRoleId: "A", summary: "回交投递 · 来自 A", at: "2026-10-12T02:59:00.000Z" }
  );
  assert.equal(views.length, 3, "进行中 + 排队两条");
  assert.deepEqual(views.map((v) => v.pos), ["进行中", "1", "2"], "进行中在最前；排队位置 1..N（**排队 ≠ 已执行**）");
  assert.deepEqual(views.map((v) => v.source), ["回交投递", "客户消息", "su 派发"], "逐条来源标签");
  assert.equal(views[1].text, "你：排队一");
  assert.equal(views[1].at, "2026-10-12T03:00:00.000Z", "入队时间原样转出");
  assert.deepEqual(UL.queueItemViews([], null), [], "空队列 ⇒ 无行（渲染侧走占位）");
  // 渲染侧接线：随 role-state 快照**定点更新**（不重排手风琴）；仅当前查看角色；切角色经 renderRight 取数。
  assert.ok(RENDERER.includes("d.onRoleState") && RENDERER.includes("function updateRightQueue("), "随真实快照更新右栏待办组（不造第二套数据源）");
  assert.ok(RENDERER.includes("state.selectedRoleId === roleId") && RENDERER.includes("updateRightQueue(roleId)"), "仅当前查看的角色才更新右栏");
  assert.ok(/queueViewsFor\(role\.roleId\)/.test(RENDERER), "renderRight 按所选角色取队列（切角色切数据）");
  assert.ok(RENDERER.includes("无进行中或排队消息"), "空队列显式占位");
  assert.ok(/esc\(v\.pos\)/.test(RENDERER) && /esc\(v\.source\)/.test(RENDERER) && /esc\(v\.text\)/.test(RENDERER), "每字段 esc（禁直插）");
  assert.ok(RENDERER.includes('当前工作') && RENDERER.includes('排队'), "工作与排队明确分开");
  assert.ok(RENDERER.includes('setTabBadge("card", views.length)'), "角标来自同份工作快照");
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
  assert.ok(/Md\.renderMarkdown\(hb\.summary/.test(RENDERER), "回交卡摘要经 Md");
  assert.ok(!RENDERER.includes("esc(role.changelog.text)"), "变更记录不再走纯文本 esc 路径");
  assert.ok(!RENDERER.includes("esc(hb.summary"), "回交卡摘要不再走纯文本 esc 路径");
  // 卡片其余部分纪律不变：**证据列表**保持逐条 esc（不拼成一段 Markdown）。
  assert.ok(
    /hb\.evidence\.map\(function \(e\) \{ return '<li class="hb-ev">' \+ esc\(e\)/.test(RENDERER),
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
      RENDERER.includes("var nearBottomAtArrival = arrivalShouldScrollToCard(entry.roleId);") &&
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
  const rendererCode = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!rendererCode.includes("setTimeout") && !rendererCode.includes("setInterval"), "无计时器（G-1 纪律不破；高亮=CSS 动画——注释里的说明不算）");
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
  assert.ok(/function appendReplayRow[\s\S]{0,900}registerRow\(/.test(RENDERER), "回放行走惰性行表（build 在挂载时才跑）");
  // 批量收尾副作用（左树每批一次——原先每事件一次）。
  assert.ok(/function flushBatchSideEffects\(\) \{\s*if \(batchDepth > 0\) return;\s*renderRoleTree\(\);/.test(RENDERER), "左树重渲染每批至多一次");
  // 无计时器纪律不破（rAF 不算计时器）。
  const code = RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!code.includes("setTimeout") && !code.includes("setInterval"), "renderer 代码仍无 setTimeout/setInterval（rAF 合帧合规）");
  // 样式钩子。
  assert.ok(STYLES.includes(".virt-spacer") && STYLES.includes(".msg-assistant.is-streaming"), "spacer/流式纯文本样式钩子");
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

// ————————————————— 真机缺陷修复（2026-10-12）：交互卡锚点物化（已决卡切走切回跑到流尾） —————————————————

test("锚点物化：重物化复用既有行（不重建落尾）；registerRow 支持锚点插入；回放锚点表登记与消费；兜底落尾写明且不丢卡", () => {
  // ① 主修复：materializeOperatorCard 先查行表——卡行仍在（keepEl 行被虚拟窗口脱挂≠丢失）⇒ 复用、直接返回。
  assert.ok(
    /function materializeOperatorCard\(requestId\) \{[\s\S]{0,600}rl0\.rows\[i0\]\.kind === "operator" && rl0\.rows\[i0\]\.requestId === requestId[\s\S]{0,80}return;/.test(RENDERER),
    "物化应先按 requestId 查既有卡行（离屏≠丢失——不得重建追加行表尾）"
  );
  // 旧缺陷的病灶（每次重建都无条件 registerRow 追加尾）不得回潮：去重守卫必须仍存在于重建之前。
  assert.ok(/function materializeOperatorCard\(requestId\) \{[\s\S]{0,900}cardInPane\(pane, requestId\)\) return;/.test(RENDERER), "去重守卫仍在（同卡不重建）");
  // ② registerRow 支持 atIndex（锚点插入 + 右移重编号）。
  assert.ok(/typeof o\.atIndex === "number" && o\.atIndex >= 0 && o\.atIndex <= rl\.rows\.length/.test(RENDERER), "registerRow 应支持 atIndex 锚点插入");
  assert.ok(/rl\.rows\.splice\(at, 0, rec\);[\s\S]{0,120}rl\.rows\[x\]\.index = x;/.test(RENDERER), "插入后其后各行 index 应右移重编号（attachRow/定位/窗口按 index 找行）");
  // ③ 回放锚点表：登记（回放行带 anchorKey）+ 消费（物化时按表落位）。
  assert.ok(RENDERER.includes("function noteReplayAnchor(") && /row\.anchorKey\) noteReplayAnchor\(/.test(RENDERER), "回放行带 anchorKey 时应登记锚点表");
  assert.ok(/function operatorAnchorIndex\(rl, entry\) \{[\s\S]{0,200}entry\.anchorListSeq === rl\.seq/.test(RENDERER), "物化应按锚点表落位（同表校验用 seq）");
  assert.ok(/a\.requestIndex !== null && a\.requestIndex \+ 1 <= rl\.rows\.length\) return a\.requestIndex \+ 1;/.test(RENDERER), "回放锚点应插到调用行之后（两行之间）");
  // ④ 首次到达不加锚（卡=当下最新事件，行表尾即它发生的位置——防同题新请求被插进历史）。
  assert.ok(/var first = entry\.anchorIndex === undefined;[\s\S]{0,120}var atIndex = first \? null : operatorAnchorIndex\(rl, entry\);/.test(RENDERER), "首次物化应追加（不加锚）；重物化才按锚点落位");
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
  assert.ok(STYLES.includes("grid-template-columns: 272px minmax(0, 1fr);"), "栅格应为两列（右栏不占列）");
  assert.ok(!/setTimeout|setInterval/.test(RENDERER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")), "无计时器纪律不破（抽屉过渡用 CSS）");
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
  assert.ok(/setTabBadge\("card", views\.length\)/.test(RENDERER), "角色资料图标角标 = 当前选中角色待办深度");
  assert.ok(!RENDERER.includes('setTabBadge("todo"') && !RENDERER.includes('setTabBadge("queue"'), "退役图标不再有角标逻辑");
  assert.ok(/function setTabBadge\(id, n\) \{[\s\S]{0,300}el\.hidden = false;/.test(RENDERER), "角标 >0 才显示（hidden 控制）");
  // v2工作单列表在资料前，全文与资料阅读按角色保留。
  assert.ok(RENDERER.includes('sec("角色卡", null,'), "完整角色卡保留");
  assert.ok(RENDERER.includes('id="right-queue-body" class="role-work"'), "首屏只有一份工作列表");
  assert.ok(!RENDERER.includes('function queueOverviewHtml'), "不再复制队列概览");
  assert.ok(RENDERER.includes('captureDrawerReading();') && RENDERER.includes('restoreDrawerReading(roleId);'), "快照更新保持全文与资料阅读状态");
  assert.ok(RENDERER.includes('sec("边界条目", entries.length'), "边界条目组保留");
  assert.ok(RENDERER.includes('sec("变更记录", role.changelog ? null : "无"'), "变更记录组保留");
  assert.ok(RENDERER.includes('sec("文档", role.docs && role.docs.length'), "文档组保留");
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
  assert.ok(/plan\.action === "skip"\) return;/.test(RENDERER), "skip ⇒ 幂等返回（不追加）");
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
  assert.ok(SESS.includes("id: i.dedupKey, full: i.text"), "快照条目带 id/full（单一数据源）");
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

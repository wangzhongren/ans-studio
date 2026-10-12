# 功能：桌面应用三栏（项目/角色 · 会话 · 角色资料）

> 稳定说明。源码见 `app/`；接口见 [api-spec.md](../../api-spec.md)。

## 目标

把受治理会话从命令行搬到人直接可用的界面，且**不新增第二份判定**：一切路径判定与角色/边界解析仍来自
门禁引擎，Pi 调用仍经 Pi 适配器。

## 三栏

| 栏 | 内容 |
| --- | --- |
| 左 | 「导入项目」系统文件夹选择器 → 门禁引擎 `listProject` 枚举角色 → 角色树（内联 SVG 图标、hover/选中态、**状态徽标**〔未开启/空闲/工作中/等待你确认/已停止/错误，悬停示最近事件+时间〕） |
| 中 | 点角色即聊天：多轮消息直发；`tool_call` / `denied` / `accepted` / `message` / `settled` 以聊天气泡与居中状态行实时刷出；消息经 **Markdown 受控渲染**（vendored markdown-it，`html:false`；链接 `rel` 外开）；**每角色一条独立聊天流**（切换保留历史，见下）；su 的**确认/选择**经聊天流里的**交互卡**（确认/单选/多选/带预览，作答后定格） |
| 右 | 手风琴分组：角色卡正文、Section 1 边界条目表（斑马纹）、变更记录索引、`docs/` 目录索引 |

## 会话流程（客户定稿：导入项目 = 授权；点角色即开，全程无确认框）

```
用户导入项目（系统文件夹选择器 = 显式授权动作）
        │  app:list-project → 门禁引擎 listProject
        ▼
左树列出角色。用户点击一个角色 ──▶ session:open { projectRoot, roleId, runtime }   ← 一次调用，无弹窗
        │
        ▼
主进程 构造 ProjectConfig(acceptance: 导入即授权) → 编排 openRoleSession({roleId, project}, {createAdapter})  ← 每角色一个保活句柄（B-2：切走不 dispose、切回续接；LRU 上限 3）
        │  scope 传 undefined（聊天无任务收窄）；事件带 roleId 信封经 session:event 持续外推
        ▼
中栏立即进入聊天：开启提示 + 多轮消息
        │
用户自由发消息 ── session:send（可反复调用）──▶ 事件继续刷出 ……
        │  越界写入被门禁照常拦截 → denied 事件内联显示在聊天流（柔红色，可展开看按根分组允许路径）
切换角色：各自保活（B-2 并存会话）——切走不清聊天、切回直接续；被 LRU 淘汰者切回在新会话里明示「模型上下文已重启」；同角色重复点击：续接（不重建）；关窗 dispose
```

## 边界来源与 acceptance（用户无感）

- 边界由门禁引擎解析（`role.boundary.boundarySource`）；**界面上不展示** writeSet、边界清单、acceptance 来源——
  用户对这些无感（边界是项目管理管的事，不是聊天的人管的事）。右栏资料分组仅作资料查阅，与授权无关。
- `acceptance` 由「导入项目 = 授权」给出：`{ accepted: true, source: "desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）" }`；
  桌面应用内无 `accepted=false` 路径，门禁对未接受边界的 fail-closed 语义不变（**不更松**）。

## 与 CLI 的一致性

- 同一门禁引擎、同一编排（`openRoleSession`）、同一 Pi 适配器；
- 授权动作同样是人类的显式操作——CLI 的 pin 对应这里的**导入项目**（系统文件夹选择器）；
- `scope` 传 `undefined`，授权上界 = 角色边界本身，判定唯一来自门禁引擎；
- **写入语义**（2026-10-11 客户裁定：界面不再暴露运行时选择器、**桌面一律 pi**）：真实适配器 `writeRoot=projectRoot`
  → **写入真实落到导入项目**，仍受门禁约束（越界写在写之前被拒）；横栏常驻一行如实说明（`#runtime-note`，单一来源）。
- 越界写入照样在**写入之前**被拦（含按根分组的允许路径），以内联消息呈现。

## 端到端自检

`test/桌面应用/e2e/main.mjs`：以真实 Electron 启动真实 preload+渲染进程，导入项目根、列出角色、
**点角色直接进入聊天（无确认框，4 处 NO_MODAL 检查点）**、连发两条消息、越界写入被拒且内联展开、同角色重复点击续接、
**切换保留历史 / Markdown 渲染与 XSS 转义 / 链接外开 / 角色状态徽标（B-1/B-2/B-3 检查点）**、右栏四组资料，
逐屏截图并写报告。

## 演变历史

- 2026-10-11：建立——三栏、导入即授权、多轮聊天、回交呈现、Pi 配置面板、创世 finalize 入口、视觉方向定稿（浅色极简）。
- 2026-10-12：**聊天体验三项**——Markdown 最小子集渲染（B-1）、切换保留历史/并存会话（B-2）、角色状态徽标（B-3）；
  同日另更正 `session.ts` 会话路径的过时注释。详见 `../change/2026-10-12_change_markdown-and-multisession.md`、
  `../change/2026-10-12_change_session-comment-refresh.md`。
- 2026-10-12：**A-5 客户交互卡**——su 的确认/选择渲染为聊天流交互卡（见「三栏」）；**收口面全删**
  （「完成 bootstrap」入口/收口提议确认卡/相关 IPC 与 preload 方法），产物收尾改由编排在 su 会话 settle 后
  **自动**完成；B-3「等待你确认」接线。详见 `../change/2026-10-12_change_operator-cards-and-finalize-removal.md`。
- 2026-10-12：**C-1 回交报告卡片**——回交卡按 角色/任务/结论/摘要/证据 呈现（模型输出转义；空证据占位；
  blocked 带语义色可见区分）。详见 `../change/2026-10-12_change_handback-report-card.md`。
- 2026-10-12：**D-1 重启恢复（桌面面）**——项目导入/重载后回放项目内会话记录（分隔提示 + `is-replay`，
  助手文本走 Markdown）；徽标增「空闲（已恢复）」。详见 `../change/2026-10-12_change_session-restore.md`。
- 2026-10-12：**E-1 回交自动投递 su 验收**（全自动：去重/排队/自动开 su/失败如实+保留重试）+ **上下文来源
  文案**按 D-1 契约重定（「模型上下文已重启」退役；逐情形对照表见文档）。
  详见 `../change/2026-10-12_change_su-handback-acceptance.md`。
- 2026-10-12：**B-1 修订**——Markdown 渲染改用**第三方库**（vendored markdown-it 15.0.2，MIT；`html:false`）。
  详见 `../change/2026-10-12_change_markdown-vendored-library.md`。
- 2026-10-12：**真机修复**——交互卡严格投递所属 pane（含切回补挂/跨 pane 只读指针/过期定格）＋**工具行瘦身**
  （只显示状态与目标，不显示内容）。详见 `../change/2026-10-12_change_operator-card-delivery-and-tool-rows.md`。
- 2026-10-12：**G-1**——交互卡**不再按时间过期**（唯一失效＝应用重启/关闭；无计时器钉子）。
  详见 `../change/2026-10-12_change_no-timeout-cards.md`。
- 2026-10-12：**H-1**——su **派发任务**路由（复用 E-1 投递机：自动开/排队/失败保留/如实回执/队列期去重）＋
  系统投递输入**单独样式**（`.msg-injected` + 来源标签；手输防误伤）。
  详见 `../change/2026-10-12_change_dispatch-routing-and-injected-style.md`。
- 2026-10-12：**修复真机崩溃**——坏形状回交事件不再喂进 `renderHandbackPrompt`（三层形状防御 + 「零未捕获
  拒绝」钉子）。详见 `../fix/2026-10-12_fix_handback-render-crash.md`。
- 2026-10-12：**I-1 开放 shell（arm）**——(a) 确认框（命令原文 + 放行/拒绝）经 `shellOperatorChannel` 交编排
  装配 (c)/(b)/(a) `ShellGate`；**仅项目角色**（su 不 arm）；fail-closed 不变；**已知风险**：无沙箱 ⇒ 放行命令
  的写入绕过写门禁（客户知情授权）。详见 `../change/2026-10-12_change_shell-arm.md`。

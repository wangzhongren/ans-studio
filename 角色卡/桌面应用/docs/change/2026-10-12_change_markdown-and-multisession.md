---
id: markdown-history-status
type: change
title: 聊天体验三项：Markdown 渲染（B-1）+ 切换保留历史（B-2）+ 角色状态徽标（B-3）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-12"
    kind: created
    summary: 依 pm 已批准设计稿《受治理交互与聊天体验》B 组（客户确认：B-1/B-2 路线 a/B-3 并入）实施——Markdown 最小子集渲染器 + 并存会话（LRU 上限 3）+ 每角色聊天容器 + 角色状态徽标
  - date: "2026-10-12"
    kind: implemented
    summary: app/renderer/{markdown.js,role-status.js} 新增（纯函数）；renderer.js 改造（每角色 pane/信封分发/状态徽标/链接外开）；session.ts 单句柄→Map+LRU+roleId 信封+定向 stop；interface.ts/main.ts/preload.cjs 同步；测试更新与新增
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 103 计/102 过/1 红（与基线同一既有环境红）；全量 723 计/720 过/2 红（两红均为既有环境红，非本改动）；e2e 已同步新形状与新增检查点，**本轮未跑**
---

# 聊天体验三项（B-1 Markdown / B-2 切换保留历史 / B-3 角色状态徽标）

**来源**：pm 已批准的设计稿 `角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md`
（status: approved；客户确认：B 组全做，**B-2 走路线 a「并存会话」**；B-3 客户同日补充并入）。本页记录**桌面应用**
侧的实施结果；A 组（交互卡/通道/收口面删除）**不在本轮**（等 Pi适配器 + 编排的契约落地）。

> **状态：已实施、已验证（2026-10-12）。** 命令与计数见文末「测试与证据」。e2e（真实 Electron）已按新形状
> 同步并新增检查点，**本轮未运行**——真实验证仍属「客户跑」。
>
> **B-1 同日修订**：Markdown 渲染已改用**第三方库封装**（vendored markdown-it 15.0.2）——本条 B-1 的
> 「自写最小子集」实现被取代，**现行为**见 `2026-10-12_change_markdown-vendored-library.md`；本页保留为当时记录。

## 用户会看到什么

**改前**：助手消息是**纯文本**（`**`、```、列表全是原始字符）；切到别的角色再切回来，**这个角色的聊天
记录消失**（旧会话被关、回来是新会话）；左树只有一个「会话中」小绿点，看不出角色在干什么。

**改后**：

1. **Markdown 渲染（B-1）**：标题/列表/围栏代码块/行内代码/粗斜/链接/引用正常呈现；**链接点击经系统浏览器
   外开**（不在应用内导航）。⚠ 安全红线：模型输出**先转义、再解析**、只产白名单标签——`<script>` 之类
   只会以**文本**出现（见「测试与证据」的 XSS 断言）。
2. **切换保留历史（B-2）**：点别的角色**不再结束**旧会话——切走不丢，**切回直接续聊**（模型上下文也还在）。
   同时保活上限 **3 个**（LRU）：超出时淘汰最久未用的那个，它的**界面历史仍保留**，再切回是**新会话**并
   在聊天流里**明示**「模型上下文已重启（该角色的旧会话已释放）——以上为历史记录，模型不会记得」。
3. **角色状态徽标（B-3）**：左树每个角色带**色点 + 短标签**：`未开启 / 空闲 / 工作中 / 等待你确认 / 已停止 /
   错误`（**只由既有事实推导**——保活、曾开会话、prompt 已发未 settle、错误；**不发明进度/预计时间**）；
   **悬停**显示「最近事件（时间）：摘要」（复用事件流）。「等待你确认」在 A 组落地前**恒不出现**（留位）。

## 改在哪（文件 → 改动）

- **`app/renderer/markdown.js`（新增，纯函数）**：最小子集渲染器 `renderMarkdown` + `esc`（**转义单一来源**——
  renderer.js 原本地 `esc` 已删）。「经典脚本 + node 双环境」装载（浏览器挂 `window.ANSMarkdown`、node 挂
  `globalThis.ANSMarkdown`，同一份实现）。**表格/图片不做**（O-B1 未准）。
- **`app/renderer/role-status.js`（新增，纯函数）**：`deriveRoleStatus(facts)`（六态派生，优先级：错误 >
  等待你确认 > 工作中 > 保活⇒空闲 / 有过会话⇒已停止 / 否则⇒未开启）与 `statusBadge(status)`（状态 → 文案 +
  样式类的**唯一映射**）。
- **`app/renderer/renderer.js`**：
  - `appendUser`/`appendAssistant` 改经 `Md.renderMarkdown` 受控渲染；`sys-*` 状态行**保持 esc**（设计：无收益）；
    链接点击用**事件委托**挂 `#chat`，经 `d.openExternal` 外开（失败如实提示一行）。
  - **每角色一个 chat pane**（游离 DOM 保留历史与**监听器**——不用 innerHTML 快照，卡片按钮不失灵）；`selectRole`
    **不再** `clearChat()`；空状态改由 `emptyStateHtml()` 按需生成；`resetPanes()` 仅在**换项目**时清。
  - 事件入口 `appendEvent(env)` 改为**按信封 `roleId` 分发**到该角色的 pane（后台会话的事件落进游离 pane，
    即使不可见；回交卡「产出角色自己 + 镜像进主入口角色」双落）。
  - 状态事实收集（`state.roleMeta`）与徽标渲染（`statusBadgeHtml`，含悬停 title）；`refreshLiveRoles()` 取
    `session:live`；stop 改**定向**。
- **`app/desktop/session.ts`**：`SessionManager` 由**单 handle** 改为 **`Map<roleId, LiveSession>` + LRU**
  （`MAX_LIVE_SESSIONS = 3`，淘汰即 dispose）；**事件外推加 `roleId` 信封**（`SessionEventEnvelope`，多会话并存
  不串消息）；**后台持续消费**（切走不停拉——重 pin/回交依赖拉取）；`stop(roleId)` 定向（缺省/null=全部，
  供换项目）；`open()` 返回 `resumed`（续接=true / 新建=false，渲染侧据此示「模型上下文已重启」）。
- **`app/desktop/interface.ts`**：`emitEvent` 信封化；`stopSession({roleId})` 定向；新增 `listLiveSessions()`；
  新增 `openExternal({url})`（**仅 http/https**——渲染进程输入不可信，在此校验；未接线即 fail-closed）。
- **`app/main.ts`**：`session:stop` 透传入参；新增 IPC `session:live` 与 `app:open-external`（接
  `shell.openExternal`）；事件外推原样透传信封。
- **`app/preload.cjs`**：`stopSession(roleId)`、`listLiveSessions()`、`openExternal(url)` 白名单方法；
  `onSessionEvent` 文档明示 `{roleId, event}` 信封。
- **`app/renderer/index.html` / `styles.css`**：脚本按 `markdown.js → role-status.js → renderer.js` 顺序加载
  （硬约束，缺失即显式失败）；`.chat-pane` 与 Markdown 元素样式（code/pre/引用/链接）；`.ti-status` 六态样式。
- **测试**：新增 `test/桌面应用/markdown.test.ts`（2 例：子集语法 + XSS 两向）；`session.test.ts` 重写切换语义 +
  新增 3 例（A→B→A 不 dispose 且 open 计数=2；LRU 逐出；信封/后台消费不串）；`interface.test.ts` 切换用例改
  B-2 语义（并存 + 定向 stop）；`renderer.test.ts` 新增 B-1/B-2/B-3 三组断言（含「selectRole 不得无条件
  clearChat」锚点与状态映射纯函数断言）；`e2e/main.mjs` 同步（信封形状、`session:live`/`app:open-external`、
  新增 `HISTORY_KEPT_ON_SWITCHBACK`、`MD_*`、`LINK_OPEN_EXTERNAL_CALLED`、`STATUS_BADGE_*` 检查点）。

## 什么没变（防止误读）

- **界面仍不作任何判定**：写权/边界/接受态仍唯一来自门禁引擎；Markdown 只影响**呈现**；状态徽标只由
  **既有事实**推导（保活/事件/调用结果），不含进度估计。
- **授权模型不变**：scope 仍传 undefined；创世/`.ans` 链不变；收口面（`#bootstrap-action`/finalize 通道）
  **本轮未动**（其删除归 A 组下一轮）。
- **LRU 上限=3**、被淘汰者**界面历史保留**（不假装仍可续问）、换项目才清历史。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD d933537）

- `npm run typecheck` → **0 错**。
- `node --test "test/桌面应用/*.test.ts"` → **103 计 / 102 过 / 1 红**（基线 95/94/1 → 净增 8 例；**唯一红为既有
  环境红**：`pi-config.test.ts` 断言检出目录名以 `ans-cli` 结尾、本机为 `ans-runtime`——**未动**）。
- 全量 `node --test "test/**/*.test.ts"` → **723 计 / 720 过 / 2 红 / 1 skipped**；两红均**既有环境红**
  （pi-config 同上级 + `test/项目管理/shared/path-primitives.test.ts` 的 macOS `/var`→`/private/var`），**非本改动**。
- **XSS 两向证据**：`markdown.test.ts` 断言 `<script>`/`<img onerror>`/`javascript:` 链接/URL 注入串**保持转义文本**
  （不产生可执行标签）；冒烟在 `renderer.test.ts` 亦然。
- **锚点证据**：session.test.ts「A→B→A 不 dispose A，open 计数=2」「LRU 第 4 个逐出最久未用」；renderer.test.ts
  「selectRole 不得无条件 clearChat」「六态映射随状态变」。
- **e2e**：已同步 + 新增检查点（上述 `*_*` 名），**本轮未运行**（不启动 Electron）；真实操作路径验收属「客户跑」。

**并发说明（如实登记）**：上列三项计数在**本改动的改动集已就位、且工作区尚无他角色新在制品**的时刻实测。
随后**编排/Pi适配器并发的 A 组在制品**开始改动 `src/**`：`src/common/编排/finalize.ts` 的
`createSessionFinalizer` 导出被移除，而 `src/pipeline/orchestration/{run-role,govern-session}.ts`（编排边界，
本角色**只读**）尚在导入它 ⇒ 瞬时全仓 typecheck 4 错、任何经 `run-role.ts` 的用例（含本角色多数套件）
**无法加载**——**属并发在制品、非本改动**（`git diff` 可证：错误全在 `src/**`，本角色改动零涉及）。
该并发期本角色的**纯函数/源码不变式套件**（`renderer.test.ts` + `markdown.test.ts`）**18/18 全绿**；
待编排落地后应复跑 `test/桌面应用` + 全量做最终确认（**登记为待办**，不阻碍本页结论的时间边界已注明）。

## 不在本轮（如实登记）

- **A 组（下一轮）**：通用交互卡（确认/单选/多选/预览）+ `session:operator-request/-response` 通道泛化 +
  **收口面删除**（`#bootstrap-action`、`appendFinalizeProposal`/`.fp-*`、`session:finalize*`/`bootstrap-state`、
  preload 四方法、interface/session 的 finalize 面）——等 Pi适配器 + 编排契约落地。
- **B-3「等待你确认」**：留位（恒不出现），A 组的交互请求落地后接线。
- **o-B1 表格/图片渲染**：未准、不做。

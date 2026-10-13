---
id: chat-stream-declutter-and-md-tables
type: change
title: 聊天流去常规提示 + Markdown 表格启用 + 右栏收成右上角图标簇（抽屉）
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [operator-card-reachability, markdown-and-multisession, session-restore, right-queue-panel]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户裁定聊天流不要常规提示——删「已开启与角色 X 的会话…」欢迎行、删「会话已恢复（模型上下文一并恢复）」回放分隔行（错误分支保留）；启用 Markdown 表格（含单元格转义钉、表格 CSS）
  - date: "2026-10-13"
    kind: implemented
    summary: session.ts 欢迎事件删除；renderer.js 成功回放不再插分隔行；markdown.js 删 disable(["table"])；styles.css 表格样式；四组测试断言翻转 + 单元格转义钉
  - date: "2026-10-13"
    kind: created
    summary: 客户追加 UI 裁定——「角色卡这一块的页面……变成右上角几个图标，点了展示」「Pi 设置也放到右上角」「结束会话/聊天中状态没啥用去除」——右栏收成右上角图标簇（抽屉），Pi 入口并入，删结束会话按钮与状态 pill
  - date: "2026-10-13"
    kind: implemented
    summary: index.html 右栏改 #right-drawer（Pi 面板迁入）、标题栏 #right-tabs 四枚图标；栅格两列；renderer.js tab 状态机（至多开一块/再点收起/Esc/×）+ 图标角标；setState 写 #chat data-state；stop() 死代码清
  - date: "2026-10-13"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 163 计/162 过/1 红（唯一红=既有环境红）；全量 913 计/910 过/2 红（两红均既有环境红）；e2e 全绿（抽屉/角标/Pi 迁入检查点全 true；E2E_DONE=1）
---

# 聊天流去常规提示 + Markdown 表格启用 + 右栏收成右上角图标簇

**来源**：客户裁定——聊天流不要这类**常规提示**（真机每次开会话/切角色都出现欢迎行，被客户点名）；
表格要能渲染。**属本角色边界内**。

## 1. 删「已开启与角色 X 的会话…」欢迎提示

- `app/desktop/session.ts::openInternal`：会话开启后的**常规欢迎事件删除**（原 `emitEvent` 的
  「已开启与角色 X 的会话（运行时 …）。直接发消息即可；写入由门禁在后台把关。」）。
- **异常提示全保留**：`contextWarning`（本地会话文件损坏）、O-1 边界重建行、投递失败/受阻行、
  「会话开启失败/异常」行——它们是异常的如实告知，不是常规提示。
- **角色树徽标不受影响**（状态准确性是另一条线，不是聊天流提示）。
- 附带效果（如实）：开启后聊天流暂无内容时 pane 保持空状态（含主 CTA）；pi 运行时的适配器侧
  「会话已恢复：…」恢复说明事件不受本裁定影响（非本角色边界，未动）。

## 2. 删回放分隔行「会话已恢复（模型上下文一并恢复）」

- `app/renderer/renderer.js::replayHistory`：成功回放**不再插入**分隔行——历史行（`.is-replay` 视觉区分
  保留）直接排入聊天流。
- **错误分支保留**：坏文件仍出一条「会话记录读取失败，未回放：<error>」分隔行（异常如实告知；
  图标改用 `ICONS.deny` 与既有「拒绝/失败」行一致——原先误用回交箭头图标）。
- `metaFor(roleId).restored = true` **保留**——左树「空闲（已恢复）」徽标是状态准确性，不是聊天流提示。
- `.sys-replay-divider` 样式钩子保留（错误分支仍用）。

## 3. 启用 Markdown 表格

- `app/renderer/markdown.js`：删 `md.disable(["table"])`——markdown-it 默认配置输出纯
  `table/thead/tbody/tr/th/td`；**`html:false` 下单元格内原文 HTML 照常转义**（实测
  `<script>` → `&lt;script&gt;`，无 XSS 增量）。**图片禁用保持不动**（覆写 image 规则原样保留）。
- `app/renderer/styles.css`：表格样式（`.msg table, .card-md table` 两处作用域——聊天流气泡/注入行/
  回放行与角色卡/变更记录/文档索引/回交摘要共用）：基础边框、表头底色（`--bg-soft`）、单元格 padding；
  **宽表不撑破布局**：`display:block; overflow-x:auto; max-width:100%`（容器内横向滚动）。虚拟窗口行高
  不受影响（表格是块级元素，`offsetHeight` 实测已覆盖其实际高度）。右栏结构化边界表 `table.boundary`
  不在作用域内，不受影响。
- 测试（`markdown.test.ts`）：「表格不渲染（保持文本）」钉子**翻转为「渲染 table/thead/th/td」**；
  新增 **单元格转义钉**（`<script>` 在 `<td>` 内必须为转义文本、不得直通——安全红线不回退）。

## 4. 测试与证据（2026-10-13；Node v24.14.0 / Darwin arm64）

- 断言翻转四处：e2e `SU_HAS_WELCOME`/`HAS_WELCOME` → **`SU_NO_WELCOME`/`NO_WELCOME_AFTER_OPEN`（true=
  不含）**；`session.test.ts`「应有会话开启提示」→「不应再有会话开启欢迎提示（客户裁定）」（开启时事件
  集合为空）；`renderer.test.ts`「应有恢复提示语」→「常规恢复分隔行应已删（防回潮）」+ 错误分支
  `error !== null` 才出现的源码钉；e2e `RESTORE_DIVIDER_TEXT`（读值）→ **`RESTORE_NO_SUCCESS_DIVIDER`
  （成功回放无分隔行）**。
- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **162 计 / 161 过 / 1 红**
  （唯一红＝既有环境红 `pi-config.test.ts`）；全量 `node --test "test/**/*.test.ts"` →
  **912 计 / 909 过 / 2 红**（两红均既有环境红：上处 + `test/项目管理/shared/path-primitives.test.ts`
  macOS /var 符号链接）。e2e（真实 Electron）：`E2E_DONE=1`，`SU_NO_WELCOME=true`、
  `NO_WELCOME_AFTER_OPEN=true`、`RESTORE_NO_SUCCESS_DIVIDER=true`，既有检查点无回归（仅 2 个既有预期 false）。

## 4. 右栏收成右上角图标簇（抽屉）——客户原话「角色卡这一块的页面，感觉和 claude code 一样，变成右上角几个图标，点了展示呢。这个没必要一直展示」

### 落地形状（细节裁定权按派发交本角色，此处写明）

- **默认收起**：右栏常驻列（`.col-right`）退役——栅格改两列（`272px + 1fr`），聊天列宽**不因开关抽屉而变**
  （抽屉 = `#right-drawer` **覆盖层**，`position:absolute` 在 `.app` 上滑出，不占栅格列 ⇒ 聊天流不 reflow）。
- **右上角图标簇**（`#right-tabs`，标题栏控制区内、窗口按钮之前）：四枚小图标——**角色资料 / 待办 /
  队列概览 / Pi 设置**（内联 SVG，沿用工作台图标风格；`no-drag` 可点；**不算 `.win-btn`**——三窗口按钮
  守卫不破）。激活图标高亮（`.active`）。
- **点开展示**：点图标 ⇒ 抽屉从右滑出（CSS transition 120ms；**无计时器**——G-1 纪律，过渡纯 CSS）。
  **再点同图标 / 点抽屉头 × / Esc** ⇒ 收起；**同一时刻至多开一块**（点异图标=切换内容，不叠开）。
  Esc 优先级在 shell 确认卡之后（fail-closed 不受影响）。
- **角标继承（收起不丢信息）**：待办图标角标 = `queueViewsFor(选中角色).length`（进行中+排队）；
  队列图标角标 = `queueByRole` 排队深度——**同一 role-state 快照**、无新数据源；>0 才显示。
  `#op-chip` 与左树徽标**不受影响**（await-confirm 的可达性仍归 chip/树，抽屉角标只承接原右栏待办组的数量语义）。
- **内容不变、跟随选中角色**：
  - **角色资料 tab** = 既有四组逐字保留（角色卡 Markdown / 边界条目 / 变更记录 / 文档索引）；
  - **待办 tab** = 既有「待办 / 队列」组**逐字保留**（进行中 + 排队 1..N；`updateRightQueue` 定点更新、
    不重排手风琴）；
  - **队列概览 tab** = **仅排队条目**的位次概览（1..N + 来源标签 + 摘要截断 + 入队时间，皆既有纯映射；
    「排队 ≠ 已执行」语义同句保留）。待办与队列是**同一真实快照的两个视图**（完整列表 vs 仅排队位次），
    客户若想要别的切分只改映射即可。
  - 打开状态下随 `selectRole`/`applyListing` 重渲染（内容跟随当前选中角色）；收起时随快照只刷角标。
- **Pi 设置入口上移**（客户追加：「Pi 设置，也放到右上角」）：顶栏文字按钮 `#btn-pi-settings` 删除，
  改图标簇第四枚 `tab-pi`；**面板本体整体迁入抽屉**（`#pi-panel` 移入 `#right-drawer`）——面板字段、
  保存/掩码/凭据纪律**一字不动**，显隐由 tab 状态驱动（`syncPiPanel`）；展开即重取视图（缺项告警如实）。
- **删「结束会话」按钮**（客户追加：「结束回话……没啥用去除」）：`#btn-stop` 删除。**停止能力保留在
  程序化路径**——换项目时 `loadProject` 的 `d.stopSession(null)`「关闭全部」仍在（定向 `stopSession`
  在主进程/会话管理器，供该路径与测试使用）；渲染侧只服务该按钮的 `stop()` 死代码**一并清**（不留死代码）。
- **删「聊天中/空闲」状态 pill**（客户追加：「聊天中也没啥用去除吧」）：`#session-state` 视觉删除；
  **状态本身程序化保留**——`setState` 把 kind 写到 `#chat` 的 `data-state`（run/idle/err），e2e 与外部
  驱动仍可断言；全部调用点跟进（函数签名不变，label 参数保留以兼容）。
- **不回归**：左树、聊天流、卡锚点、chip、状态徽标、表格渲染全部未动；抽屉过渡纯 CSS；无计时器纪律不破。

### 测试与证据（本节）

- `renderer.test.ts` 新增**右栏抽屉**钉子（8 组断言：col-right 退役/覆盖层/图标簇四枚且非 win-btn/
  tab 状态机至多开一块/Esc/内容跟随/角标语义/内容四组+待办组逐字保留/Pi 面板在抽屉内由 syncPiPanel 驱动/
  样式钩子）；翻转 T28（btn-pi-settings → tab-pi 在簇内、窗口按钮之前）与 K-1（session-state 删除 +
  setState 写 data-state）与 B-2（btn-stop 入口删除 + `d.stopSession(null)` 程序化路径保留）。
- e2e 新增检查点：`TABS_PRESENT`/`NO_RIGHT_COLUMN`/`DRAWER_DEFAULT_CLOSED`/`DRAWER_OPENS_ON_TAB`/
  `TAB_CARD_ACTIVE`/`DRAWER_TITLE_CARD`/`DRAWER_TOGGLES_CLOSED`/`DRAWER_ESC_CLOSES`/
  `BADGES_WHILE_COLLAPSED_TODO`/`BADGES_WHILE_COLLAPSED_QUEUE`/`BADGES_CLEAR_ON_EMPTY`/
  `NO_PI_BUTTON_IN_HEADER`/`PI_ENTRY_IN_TABS`/`QUEUE_TAB_OVERVIEW_ROWS`/`QUEUE_TAB_ACTIVE`/
  `PI_PANEL_IN_DRAWER`/`DRAWER_CLOSED_AFTER_N3`/`DRAWER_CLOSED_AFTER_PI` 全 **true**；
  状态日志改读 `#chat` 的 `data-state`（run/idle/err 如实）。
- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **163 计 / 162 过 / 1 红**
  （唯一红＝既有环境红）；全量 → **913 计 / 910 过 / 2 红**（两红均既有环境红）；
  e2e **E2E_DONE=1**（202 true / 2 个既有预期 false）。

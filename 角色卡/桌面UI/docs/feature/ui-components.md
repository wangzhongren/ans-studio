---
id: ui-components
type: feature
title: 渲染层项目组件台账（Phase 4A 起）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: active（4A 节 + 4B 追加节）
related: [ui-platform-phase4a-design, ui-platform-phase4a-scope, ui-platform-phase4b-design, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 PM §12.2/§12.5 建立 4A 组件台账：Slider（唯一新增 components/ui copy-in）与 SettingsPanel/ProfilePanel/WorkOverview/QueuePanel/DocumentView 的来源、用途、状态矩阵、升级责任人
  - date: "2026-10-21"
    kind: updated
    summary: 按 PM §15.8 追加 4B 项目组合组件（GovernancePanel/GovernancePreviewPanel、ReportCard/ReportBody/ReportReceiptBlock、DeliveryCard、GovernanceQueueAggregate、op-chip、治理卡镜像变体）与 4B 纯逻辑模块/键盘焦点；零新增原语/依赖
---

# 渲染层项目组件台账

**范围**：4A 新增的项目组件与 Slider copy-in。既有 base-nova 组件（Button/Input/Textarea/Dialog/AlertDialog/Popover/DropdownMenu/Checkbox/Switch/Tooltip/Badge/Separator/Resizable/ScrollArea/Card/Collapsible）见 [`components/ui/README.md`](../../../../app/renderer/src/components/ui/README.md)，本表不重复。

**维护规则**：新增组件须先经 UIUX 白名单/本表登记；不引第二套 UI/图标/动画/状态库；颜色/圆角/间距只引用 `index.css` 令牌（新样式集中在 `shell/phase4a.css`，不写裸色值）。升级责任人：组件视觉与交互=桌面UI（按 UIUX 规范）；行为契约=桌面UI；跨角色通道=桌面窗口。

## 一、新增组件

| 组件 | 文件 | 来源 | 用途 | 升级/复核 |
| --- | --- | --- | --- | --- |
| `Slider` | `app/renderer/src/components/ui/slider.tsx` | shadcn/base-nova copy-in，复用 `@base-ui/react/slider`（**零新增依赖**） | 仅 Pi 高级「上下文窗口」「看护检查时限」两个 7 档离散字段；不做连续滑杆/任意数值 | 桌面UI；UIUX 复核状态矩阵与键盘 |
| `SettingsPanel` | `app/renderer/src/shell/SettingsPanel.tsx` | 项目组件（组合 Button/Input/Slider/Badge） | 三引擎设置：Tabs（←/→/Home/End、roving、aria-controls/tabpanel）、metadata 字段、机密掩码/显示、高级折叠、固定 64px 保存条（状态两行完整） | 桌面UI；字段表单一来源=主进程元数据 |
| `ProfilePanel` | `app/renderer/src/shell/ProfilePanel.tsx` | 项目组件（组合 Badge/QueuePanel/Markdown 管线） | 角色资料：角色头 + 四节 Collapsible（角色卡/边界/变更/文档索引）+ 待办/队列预览 + 文档入口 | 桌面UI；边界表只读、不改权限 |
| `WorkOverview` | `app/renderer/src/shell/WorkOverview.tsx` | 项目组件（组合 QueuePanel） | 工作概览：待处理（定位）/当前工作/排队/最近回交；`#right-queue-body` 唯一 | 桌面UI；完整报告/persistence 属 4B |
| `QueuePanel` | `app/renderer/src/shell/QueuePanel.tsx` | 项目组件 | 队列行：位次/来源/时间/摘要/全文/撤回就地回执（失败/异常另落 system 行）；工作概览/角色资料/队列子视图共用 | 桌面UI；成员唯一来自 role-state 快照 |
| `QueueSubview` | `app/renderer/src/shell/QueueSubview.tsx` | 项目组件 | 同一 424 抽屉内的队列子视图：标题由 Drawer 负责、`.queue-back` 返回来源（工作概览/角色资料）、当前/排队全量（上限 50）、Esc 先返回 | 桌面UI；`state.rightTab` 不新增值 |
| `DocumentView` | `app/renderer/src/shell/DocumentView.tsx` | 项目组件（组合 Button + 受控 Markdown） | 已列文档清单/只读阅读/错误重试/返回焦点/链接分流 | 桌面UI；读取只消费 opaque ID |

## 二、纯逻辑模块（无 DOM，供 node 单测）

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| `runtime-config` | `app/renderer/src/chat/runtime-config.ts` | 控件选择（range/select/text/password）、档位映射、updates、缺配/状态/application/source 文案、读取/保存版本 token |
| `runtime-view` | `app/renderer/src/chat/runtime-view.ts` | 视图键、路由（当前/缓存/旧项目丢弃）、按引擎缓存与两阶段重放、失效/落定、代际守卫 |
| `document-view` | `app/renderer/src/chat/document-view.ts` | 错误码→人话、相对/外部链接解析、回包形状与 scope/version 校验、可重试判定 |
| `work-view` | `app/renderer/src/chat/work-view.ts` | 待处理/队列分组/最近回交去重/角标/标题/空态 |

## 三、状态矩阵（4A 组件）

| 组件/状态 | default | hover | focus-visible | active/selected | disabled | loading | error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 引擎触发器（`EngineSelect`） | 当前名 + chevron，104×32 | `--hover` | 2px `--ring` + 3px offset | open `aria-expanded` | 未导入项目（native disabled + aria-disabled） | `aria-busy` + 12px 转轮（0.9s linear；reduced-motion 静止） | 失败保留新视图，缺配条/设置内如实 |
| 引擎菜单项 | 名称 13 | `--hover` + 前景 | 同 hover（`aria-activedescendant`） | `aria-selected` + Check | 不打开 | — | — |
| 设置 Tabs（`.pi-engine-tab`） | 未选 text-2 | `--hover` | ring | `.active` + selected；roving tabindex；当前会话引擎圆点 | — | 状态文本「检查中…」 | 状态文本「缺配置/配置未知」 |
| 设置 Input/Select | 32、`--input` 边 | — | ring 2/3 | — | 保存中/加载中按钮禁用 | 读取中字段不伪造 | Alert（warn/danger）+ 状态文本 |
| Slider | 轨道 4/thumb 14，output 96 | track/thumb 提亮 | ring 2/3 | 拖动中（Base UI） | `.slider[data-disabled]` .45 | — | 值不在预设 → 文本 Input + amber 提示 |
| 保存条 | 64、border-top、card 底；状态 2 行完整（键数/缺项数+应用时点） | — | 按钮 ring | — | saving/loading 时禁用 | 「正在保存…」 | 「保存失败/保存异常/读取配置失败」 |
| 队列行 `.q-item` | grid（位次 32 + 内容） | 行内按钮 hover | 按钮 ring | 进行中 `.is-running` | 撤回中禁用 | 撤回中… | `.q-feedback` 就地回执（无效/失败/异常） |
| 待处理行 | 类型 Badge + 标题 + 定位 | — | 定位按钮 ring | — | — | — | 「无待处理请求」空态 |
| 角色资料节 `details.sec` | 32 摘要 + Chevron | — | summary ring | `open` 旋转 90° | — | — | 「无 docs/」等中性空态 |
| 文档列表 | label + relativePath + 阅读 32 | 按钮 hover | ring | — | scope 不符/不可读 | 「正在读取已列文档…」 | 错误码文案 + 重试（可重试码） |
| 抽屉 | 424、160ms 入/120ms 出 | — | — | `aria-modal`/inert 背景 | — | 子视图 loading | 子视图错误如实 |

## 四、键盘与焦点（4A）

- 引擎触发器：Enter/Space/↓ 打开；↑↓/Home/End 移动；Enter/Space 选；Esc 关闭回触发器；Tab 离开；切换中不重复提交。
- 设置：Tabs ←/→ 循环、Home/End 首尾、roving tabindex、`aria-controls`/tabpanel；字段 Tab 顺序；机密显示/隐藏 Enter/Space；Slider ←/→/Home/End；保存按钮 Tab/Enter；状态 `role=status` aria-live（视觉两行、title 全文）。
- 抽屉：打开聚焦关闭钮；Tab 环；Esc 关闭回触发元素（缺配条/左栏设置/会话头）；文档阅读态 Esc 先回列表；返回角色资料聚焦「查看已列文档」。
- 队列：撤回可 Tab；撤回中禁用；回执 `role=status`，失败另落聊天流 system 行；回执后焦点回同一撤回动作；队列子视图 Esc 先返回来源并回「查看全部队列」焦点。
- 不因新队列/角标更新自动切角色、开抽屉或滚聊天。

## 四之二、Phase 4B 新增项目组件（2026-10-21）

**不新增 shadcn/base-nova 原语**；以下均为项目组合组件（零新增依赖，只组合既有 Button/Input/Badge/Separator/ScrollArea/Collapsible/Alert/原生 radio）。样式集中在 `shell/phase4b.css`，不改 `shell.css` / `phase4a.css`。

| 组件 | 文件 | 来源/组成 | 用途 | 状态矩阵 | 升级/复核 |
| --- | --- | --- | --- | --- | --- |
| `GovernancePanel`（含 `GovernancePreviewPanel`） | `app/renderer/src/shell/GovernancePanel.tsx` | 项目组合（原生 radio/按钮 + 既有令牌） | `#governance-status` 状态行/动作 + 唯一非模态 `#governance-preview`（建立/重新接受/迁移）；零写入预览、确认才写、失败按 phase | closed（trigger `aria-expanded=false`）/loading（标题+「正在读取预览…」）/ready（字段完整）/confirm-disabled（blockers/模型未知/无 digest）/confirming（busy、取消禁用）/success（成功行，仅关闭）/failure-nonwrite（零写入声明，可重试）/failure-write（message + 核对现场，不假成功） | 桌面UI；文案单一来源 `chat/governance-view.ts`；UIUX 复核 |
| `ReportCard` / `ReportBody` / `ReportReceiptBlock` | `app/renderer/src/shell/ReportCard.tsx` | 项目组合（details/列表/按钮 + 受控 Markdown） | handback 报告全文/来源/任务/轮次/摘要/证据/flags/来源文档/持久化状态/独立验收声明 | preview/folded（180 字/4 行）/full details open（行内保持）/persistence pending/saved/failed+retry/expired/disabled/unknown；重试中禁用同按钮 | 桌面UI；主进程事实唯一来源；不假完整/已持久化 |
| `DeliveryCard` | `app/renderer/src/shell/ReportCard.tsx` | 项目组合（批次事实 dl + 报告体 + 安全副本 details） | 交付批 `.msg-delivery`：本批 N 份（不表示全部收齐）、接收历史/目标输入/目标轮次结果、安全显示副本、历史重试 | receipt known/failed+retry/expired（无重试）/未确认；pending「正在保存历史…」；960/200% facts 单列 | 桌面UI；UIUX 复核 |
| `GovernanceQueueAggregate` | `app/renderer/src/chat/ChatRow.tsx`（`QueueAggregateRow`） | sys 行 + Clock 图标 | trio 主入口唯一 `.op-queue-aggregate`；原位更新、不可聚焦、无按钮、无请求内容；切引擎/项目清空，主进程重推重建 | 无 queued 隐藏（不显示 0）；数量变化原位更新；清空移除 | 桌面UI；只信 `operator-queued` 事实 |
| `op-chip` 待确认 chip | `app/renderer/src/chat/ChatStream.tsx` | 项目组合（button + ShieldCheck） | 当前角色未决请求的常驻定位入口（同 `pendingOperator` 状态源；点击关抽屉→滚到原卡→聚焦） | 无 pending 隐藏；有 pending 显示「有 N 条待确认 · 定位」；抽屉覆盖时 chat 卡 `inert`、`.op-actions` visibility hidden | 桌面UI；UIUX 复核 |
| 治理卡镜像/元信息/预览 | `app/renderer/src/chat/ChatRow.tsx`（`OperatorRow`） | 既有 operator 卡变体（不新增卡组件） | `.op-gov-badge/.op-meta/.op-mirror-*`、同 `data-request-id` 双面、只答一次/双面冻结、`.op-queued`、`.op-preview`（受控 Markdown） | open/submitting（双面禁用+「已提交，等待主进程受理…」）/decided（双面 hidden+finalNote）/expired（定格+原因）/retry（解冻+失败原因）/queued（无动作+「等待前一个决定」） | 桌面UI；镜像不是第二张审批 |

**纯逻辑模块（无 DOM，`test/桌面UI/` 单测）**：`chat/governance-view.ts`（治理动作/状态/预览/迁移/失败 phase）、`chat/operator-view.ts`（镜像面/同 id 去重/排队计数/终态文案）、`chat/report-view.ts`（报告身份/声明/预览/flags/persistence 矩阵/交付事实/安全副本/投影摘要）、`chat/anchor-view.ts`（回放锚点表/插入位/索引右移）。

**键盘/焦点（4B）**：治理预览打开焦点到面板标题、Tab 进入控件、无焦点陷阱、Esc 关闭回触发；治理卡开卡不抢焦点，提交后焦点到 `finalNote`（提交面 live，另一面静态）；聚合行不可聚焦；报告 details/来源/重试 Tab，重试 pending 保留焦点；菜单 ↑↓/Home/End/Enter/Space/Esc/Tab 保持，状态文字不可聚焦。

**960/200% 响应式（4B 返工）**：左树行不收缩、左栏/树可滚动（200% 树 min-height 140）；缺配条/治理状态行换行、按钮独占下一行；报告 facts `dt::after` 冒号 + inline-flex（≤720 单列）；200% 报告动作纵向排列、`#chat` 保持 240px 可读高度且中栏纵向可滚动；治理预览/报告 details 内部纵向滚动、无横向溢出。

**登记规则**：4B 新组件只组合既有原语；`components/ui/**` 现有文件不改；任何新原语需 PM 另行批准。

## 四之三、Phase 5A 三项缺口（2026-10-21）

| 面 | 文件 | 实现 | 可见/无障碍契约 | 证据 |
| --- | --- | --- | --- | --- |
| Sidebar 身份 | `shell/Sidebar.tsx` + `chat/operator-view.ts` | 删除可见 `.ti-badge`；保留 `.primary`/`.builtin`，新增 `data-primary="true"`/`data-builtin="true"`；`aria-description` 含主入口/内置；`title` = 显示名+身份说明；`.ti-count` 唯一数字 | 身份不占第三行；等待态标签只替换文案（待选择/等待你确认），不带数量；作答/失效即回真实状态；树底部 16px 呼吸位保持自身滚动/末行不贴边 | 5A 冒烟 36/36；GHOST 9/9；FLOW P7 pass；1360/960/200% 截图 |
| P7 未决种类 | `chat/operator-view.ts::pendingKindFor` | 按 `operatorSurfaces` 聚合；任一 `choice` ⇒「待选择」，否则「等待你确认」，无 pending ⇒ null | 源面/镜像面同一事实；不新增计数；状态优先级不变 | `operator-view` 单测 8 项；FLOW 官方 P7 pass |
| 阅读锚点 | `chat/reading-anchor.ts` + `chat-store.applyHistory` + `VirtualPane` | full replay 前捕获首个可见 `.msg/.tool-records/.sys-denied` 的 60 字文本前缀、相对 offset、贴底偏好；布局后同文本行按 delta 校正；找不到行/贴底不动 | 无动画/计时器；不改行模型/行高/虚拟窗口/工具组/懒挂载；贴底继续 tail | `reading-anchor` 单测 6 项；默认段官方 `full replay preserves content identity` pass；1360/960 offset 差 0；贴底 distance 0 |
| Markdown 外链 | `chat/markdown.ts` | `document` 捕获 `a.md-link`：一律 preventDefault/stopPropagation；http/https 经 `getDesktopBridge().openExternal` → preload `app:open-external`；相对/锚点不导航；缺失/失败写 `data-open-result`/title | 卡片/报告/资料/治理预览共用；`#document-read-text` 让 DocumentView 解析内部/相对链接；rel=noopener noreferrer | markdown 单测 12 项；5A 冒烟 36/36（URL 不变、will-navigate 0、openExternal 记录；200% composer/错误态） |
| 200% 布局/转轮 | `shell/phase4b.css` + `ChatStream.tsx` + `Sidebar.tsx` | 200% `#chat` 内部滚动、composer sticky；`.col-mid` 禁横溢；loading/尾行/徽标统一 `.status-spinner` 12px + `BusySpinner`（Motion 0.9s）；`.mi-body` 1.6；≤680 CSS 紧凑 composer（h=95，底栏单行/折叠 scope+compose-note，480 审/决单字）；`scroll-padding-bottom:104`；治理预览打开时 composer static | 长历史 composer 首屏可达；空/错态无横滚；reduced-motion 静止弧；680/480 report/details/preview/mirror/delivery/S0 目标 bottom ≤ composer.top | 5A 冒烟 36/36（12 项遮挡断言）；UIUX 审计 P0/P1 产品侧已修 |
| S0 空项目 | `chat/ChatStream.tsx` | `hasRoles=false` 与 `roles.length===0` 分流；S0 标题/说明/CTA 按主入口显示名；CTA 点击/Enter 才开会话 | 仅 `.empty-title` 一次提及、无治理 CTA、左栏不重复「未枚举」、composer hint 空 | 5A 冒烟 36/36（标题/点击/键盘） |

**5A 不删除**旧渲染器/vendor/旧测试；旧入口仍生产默认。删除与默认翻转只在 5B 原子批次执行，见 [5A 范围文档](../design/2026-10-21_design_ui-platform-phase5a-scope.md) 与 [变更记录](../change/2026-10-21_change_ui-platform-phase5a-gaps.md)。

## 五、4B/Phase 5 追加约定

- 4B 新组件/样式放自己的文件（如 `chat/GovernanceCard.tsx`、`shell/reports.css`），不改 `phase4a.css`；在本文件追加「4B」节，不覆盖 4A 行。
- 4B 经 `chat/extensions/*.ts` / `driver-extensions/*.ts` 接入，不编辑 4A 文件；若必须修改 4A 文件，先回 PM。

## 六、PM §十三 裁定（2026-10-21）

- **左树单计数**：`.ti-count` 是唯一可见数字徽标（当前工作+排队）；`.ti-status` 用 `statusBadge(status, 0)` 只表达状态（工作中/空闲/等待你确认/错误），不再显示「N 待办」；队列深度放 `.ti-count` 的 `title/aria-label`（「当前工作 X 项，排队 Y 项」）与工作概览。
- **失效 operator 卡动作隐藏（冻结写集唯一例外）**：`chat/ChatRow.tsx` 在 `closed` 时隐藏 `.op-actions` 的 confirm/deny/submit/cancel，保留 `disabled`/`finalNote`/`aria`/卡片容器；旧 `freezeOperatorCard` 同义；不扩展到其它行类型。登记见 [4A 变更记录](../change/2026-10-21_change_ui-platform-phase4a-engine-settings-drawers.md) §五.13。
- **judge 跨引擎重放归 4B**；C2 同因既有红待 4B/5 重锚。
- **UIUX M1–M6**：队列子视图、撤回 system 行、Tabs 键盘、保存条两行、角色头状态-only、960 焦点/Esc/inert/200% 证据均已落地（见 4A 变更记录 §三·五）。

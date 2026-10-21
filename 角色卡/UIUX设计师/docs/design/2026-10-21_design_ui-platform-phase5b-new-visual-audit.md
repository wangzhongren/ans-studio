---
id: ui-platform-phase5b-new-visual-audit
type: design
title: Phase 5B 新入口视觉审计与 design audit 两条裁定
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 2
related: [ui-platform-phase5-visual-audit-plan, ui-platform-phase5a-old-visual-audit, ui-platform-phase4b-review, ui-platform-nova, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: audited
    summary: 按 PM §十八 对新入口做 1360/960/200% A–L 视觉审计；裁定可见行阈值与 0.9s 转轮；复核 12 条 design audit 重锚；结论 needs-work（P0 200% 输入区不可达、P1 200% 错误态横滚/loading+尾行缺转轮/密度等价未立、P2 若干）
  - date: "2026-10-21"
    kind: re-reviewed
    summary: PM §十九 追加：BOOTSTRAP 中心 CTA 非有意删除，桌面UI 需补回 S0；重锚大多新 DOM 成立但 W9/W10/W11 改为 CSS keyframes 而非 Motion、密度夹具/S2 右缘未落地；新候选 5A 冒烟 19/19 证实 P0/P1 修复，完整 A–L 待新 hash 重跑
---

# Phase 5B 新入口视觉审计与 design audit 两条裁定

**范围**：按 PM §十八 与 [Phase 5 最终视觉审计计划](2026-10-21_design_ui-platform-phase5-visual-audit-plan.md)，对**新入口候选** `app/renderer/dist/src/index.html` 做真实 Electron 1360×860 / 960×620 / 200% A–L 视觉审计，对照 [5A 旧入口基线](2026-10-21_design_ui-platform-phase5a-old-visual-audit.md)，复核 12 条 design audit 旧夹具失配的重锚，并对两条待定项给出设计裁定。**只读**；未改 `app/`、`src/`、`test/`、`package.json`、旧入口或其他角色资料；未提交。

**结论**

> **新端设计对齐：needs-work。**
>
> - **P0 ×1**：200% 下聊天区随虚拟转录总高撑开，输入区被推到 5,000–1,341,790px 之后，长历史时实际不可达（C/F/I/J/K）。
> - **P1 ×3**：①200% 无角色/会话失败态中栏出现横向滚动条（K）；②`sys-loading` 与 `tool-current` 只有文字、缺 12px 工作转轮（D，v3 W10/W11/Nova 均要求）；③`6-可见行≥9` 的等价夹具未建立，当前 6 行不能判 pass，也未证明是真实 CSS 密度回退（C）。
> - **P2 ×4**：注入盒行高未锁 1.6；1360/960 多层状态条叠压；200% 镜像/交付目标未入镜（同时计 missing-evidence ×1）；`04-profile`/`12-composer` 场景命名与内容不符。另有 1 条证据注记（phase4b 冒烟图含测试壳标记）。
> - **两条裁定**：可见行**不退役**，改为规范化夹具上的 **≥9（无提示条）/≥8（57.8px 提示条叠）@1360、≥4@960**；工作转轮**保留 0.9s±0.2s**，重锚到 `.status-spinner` + Lucide `LoaderCircle` + Motion，reduced-motion 静止弧。
> - **旧端 200% P1 主要项已关闭**：左树可见/可滚动、头部/缺配条正常态无横溢、治理预览 ≤900 且 Esc 回 `gov-action`、200% 报告/完整摘要/治理预览目标可见；镜像/交付 200% 目标仍缺证据。
> - 本结论只作设计对齐证据，不代替测试独立验证、PM 门或独立验收；新端旧 e2e 补充运行 `E2E_PASS=false`（10 项会话修复/恢复失败），不得当作视觉或功能 pass。

> **PM §十九 追加（2026-10-21 19:25）**：BOOTSTRAP S0 文案/中心 CTA 被删不是已批准差异（P1，需补回）；W9/W10/W11 转轮被改为 CSS keyframes 而非 Motion（P1，违反 Nova §7.1）；密度规范夹具/S2 右缘未落地。详见 §十与[重锚落地复核](2026-10-21_design_ui-platform-phase5b-reanchor-review.md)。

## 一、候选与环境

| 项 | 值 |
| --- | --- |
| 审计入口 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/app/renderer/dist/src/index.html` |
| 候选身份 | HEAD `224cf831f7a26fd2fac8af7155790a75fa31f6b5`；clean build 2026-10-21T18:22:35+08:00 |
| 产物 hash | index `8d202c2d4f28440daa58b8fc6a6bc00f5d5364e2a3e4681e1f5b5bdf1010d3dd`；JS `387935a1bbf5cbdc73297823cad11219eaa3c06620703dc2899da7b5b20e3365`（`index-DWDeekVC.js`）；CSS `b3c67401249ba3b263d3eeffadc3d0ea619630927c67188cd5d680ecbf9f5118`（`index-Dpy_jQg6.css`） |
| preload / main | `98dde83a4930c7f586a4dd5bee8d7697cffc6fd95c3771149dea2fcf3cbc3e5b` / `9e7cef7691324d493a4da2f24b9d04125b4fe487ed091d0e535a3a9f3d04f1c7` |
| Electron / Node / OS | 44.7.0 / 24.14.0 / macOS 26.6.2 arm64 |
| 视口 | 1360×860；960×620；200% = `webContents.setZoomFactor(2)`，960×620 物理 / 480×310 CSS |
| 证据 | `2026-10-21-phase5b-new-visual-evidence/raw-main/`：75 PNG（25 场景×三档）+75 metrics+11 keyboard+report；`raw-phase4b/`：16 PNG+70/70 冒烟 report |
| 旧端对照 | `2026-10-21-phase5a-old-visual-evidence/`（旧入口、同场景/同尺寸） |

**候选时效**：审计在 18:22–18:26 完成；18:48 工作区 `app/renderer/dist` 已被重建为另一组 hash（index `e44c9ca2…`、JS `8c691c7f…`、CSS `5aa5c24c…`）。本报告只对**审计时 hash** 有效；5B 最终复测必须在候选冻结后对新 hash 重跑，不能把本报告直接贴到当前 dist。

## 二、PM §十八 两条裁定

### 裁定 1：`6-可见行≥9` —— 不退役，改口径并保留密度门

**结论：不直接退役，也不把 6 当 pass。** 旧 `≥9` 是在旧夹具（13 行、视口 614.4px、1 张 operator 卡、系统行 17.8px）上校准的；新端 `fullyVisibleRows=6` 是另一套内容（2 张 142.1px operator 卡、2 条 57.2/54px 系统行、视口 576.4px，其中 57.8px 为上下文+缺配两条提示条）。两者不是同一夹具/同一视口，6 vs 9 既不能证明 CSS 密度回退，也不能判通过。

**新口径（本角色设计裁定）**

1. 建立**规范化密度夹具**：固定行类型与行数（旧 v3 的 1 operator 卡、2 注入盒、2 user、1 tool-records、2 assistant、1 sys、tool-current），滚到底测量；不得用随真实历史变化的临时夹具判密度。
2. 1360×860：
   - 无提示条叠：**完整可见行 ≥9**（保留旧门）。
   - 有上下文+缺配提示条叠（本审计 57.8px）：**完整可见行 ≥8**。依据：`9 × 576.4 / 614.4 = 8.44 → 向下取 8`，即视口缩水 6.2% 的等价行数。
3. 960×620 有提示条叠：**完整可见行 ≥4**（按同一行距/视口比例保守取整；旧端 960 无同口径基线，作为新端新增门）。
4. 同时保留逐行几何：行距 16±1（新端以 `.chat-row` 的下内边距/有效间距测量）、工具活动行 ≤48、转录总高 ≤850、输入区 ≤140；不得用“行数”单项替代这些检查。

**当前判定**：6 行低于“有提示条叠 ≥8”，**needs-work（P1，等价未立）**。桌面UI 需先把规范化夹具跑通：本审计密度夹具出现 2 张 142.1px 卡——一张是本节新推的 `v3-pending`，另一张是上一场景的 `audit-pending`（两张不同请求）；密度夹具未隔离上一场景 pending，故不能与旧 9 行比较。该残留是夹具隔离问题，还是 history 回放/会话重置应清旧卡的行为缺陷，由测试/桌面UI 按 `PENDING_*` 断言判定；本角色只要求先隔离/规范化夹具再测密度。系统行在同文案/同宽度下应为单行 12/19.2（本审计 57.2/54 为多行，需在规范化夹具中复核是文案变长还是行容器问题）。若规范化后仍 <8/9，再压缩 chrome（合并两条提示为一条状态区、聊天上内边距 20→16、输入区 125.8→≤121），**不得压缩正文 15/27 或把阈值直接降到 6**。

### 裁定 2：`9-W9-转轮0.9±0.2s` —— 保留 0.9s，不批准静态默认

**结论：保留 900ms linear infinite，容差 ±0.2s；静态仅限 `prefers-reduced-motion`，且弧仍可见。** 新端工作徽标已用 `.ti-status.st-working .ts-ico.status-spinner` + Lucide `LoaderCircle` 12px + Motion `duration: 0.9, ease: "linear", repeat: Infinity`，设计实现正确；旧检查失配只是因为还在找 CSS `.spin-arc`/`animationName`，不是产品回退。

**等价可见性检查（重锚要求）**

- DOM：`.ti-status.st-working .ts-ico.status-spinner svg` 存在，box/描边 12px/1.5；不得再用 `.spin-arc`。
- 时长：因 Motion 走 transform 而非 CSS animation，测试用两种等价之一：①运行时采样 200ms 内 `transform` 角度，角速度 ≈360°/0.9s（±20%）；②source guard 锁定 `duration: 0.9` + 运行时确认 transform 在变化。不得把 `animationName` 为空当失败，也不得放宽到 >1.1s。
- reduced-motion：CDP 模拟 `prefers-reduced-motion: reduce` 后，转轮在 200ms 内无 transform 变化，弧仍可见（截图 `v3-after-rm-sidebar-1360.png` 已证明静态弧）。
- **同一枚转轮**必须同时用于 `.sys-loading`（W11）和 `.tool-current`（W10）；当前这两处只有文字，属产品缺口（P1），不是测量问题。修好后用同一时长/reduced-motion 检查。

## 三、12 条 design audit 重锚复核

| # | 检查 | 新端 DOM/测量现状 | 复核结论 |
| --- | --- | --- | --- |
| 1 | `1-W1-行距16±1` | `.chat-pane` gap=0，但每 `.chat-row` 含 `padding-bottom:16px`；相邻行 rect 相接 | **pass（重锚）**：改测相邻行内容的有效间距或 `.chat-row` 下内边距 16±1；不得要求 pane gap=16 |
| 2 | `6-可见行≥9` | 6 行/576.4px；夹具含 `v3-pending` 与上一场景残留 `audit-pending` 两张 142.1px 卡、57.2/54px 系统行 | **needs-work（P1）**：见裁定 1；先清残留/规范夹具，再按 ≥9/≥8/≥4 |
| 3 | `S3-无chip时尾行兜底` | chip 可见时 `tool-current=null`；chip 隐藏的 busy 态存在 `tool-current` 文本「正在工作」 | **pass（重锚）**：在 chip hidden 夹具断言 `.tool-current` 文本「正在工作」+（修好后）转轮；旧文案「等待你确认」不再适用 |
| 4 | `W6b-系统正文去前缀` | `events.ts::classifyInjected` 已把 `[系统·x]` 转为 `label`，`mi-body` 只留正文；密度夹具没有注入行 | **pass（重锚+夹具）**：给新端注入行夹具，断言 `mi-body` 不含前缀、`mi-chip` 为「系统消息 · x」 |
| 5 | `W6-注入盒行高1.6` | `.msg-injected` 12px，未设 line-height；当前继承 `.chat` 20.15px≈1.68，且夹具无 `.mi-body` | **P2 产品微差**：`.msg-injected`/`.mi-body` 显式 `line-height:1.6`（19.2px）；重测 computed |
| 6 | `S2-chip对齐阅读列≤8` | chip x=1088，pane x=354，左差 734；但 chip 右缘与阅读列右缘（1254）对齐 | **pass（登记设计差异）**：批准「行动 chip 右对齐阅读列」，重锚为 `|chip.right - pane.right| ≤8`，并保留 chip 在阅读列内；不再用左缘对齐 |
| 7 | `S1-截断目标仍可见` | 900 列下当前夹具目标未触发截断（`truncated=false`），不是实现失败 | **pass（重锚+夹具）**：用超长目标路径夹具；断言摘要可见且目标以 `…` 截断，不得改存在性 |
| 8 | `9-W9-徽标12pxSVG` | 工作徽标 DOM 已有 12px Lucide SVG；旧选择器 `.spin-arc` 取不到 | **pass（重锚）**：按裁定 2 的 `.status-spinner svg` 测量 12px |
| 9 | `9-W9-转轮0.9±0.2s` | Motion 0.9s linear infinite（源码）；CSS animationName 为空 | **pass（重锚）**：运行时角速度或 source guard，见裁定 2 |
| 10 | `11-W11-loading同款转轮` | `.sys-loading` 只有文本「正在开启…/正在载入…」；截图 `v3-after-loading-1360.png` 可见 | **needs-work（P1）**：补同一枚 12px 转轮+文字；修后跑 0.9s/reduced-motion |
| 11 | `10-W10-尾行含转轮` | `.tool-current` 只有「正在工作」；行高 26.6 正确；截图 `v3-after-tail-1360.png` | **needs-work（P1）**：补同一枚 12px 转轮；行高保持 26.6±2，不得因图标增高 |
| 12 | `12-reduced-motion静止弧` | 工作徽标截图静态弧可见；旧选择器取不到；loading/tail 尚无转轮 | **pass（重锚，工作徽标）**：对 `.status-spinner` 重跑 CDP reduce 断言；loading/tail 修好后纳入同一检查 |
| 附 | `11-无第二转轮实现` | `.spinner` 元素 0；新实现为 `.status-spinner`+Lucide | **pass（重锚）**：单一实现改为统计 `.status-spinner`/`LoaderCircle`；补 loading/tail 后仍须只有一套 |

> 表中“pass（重锚）”只表示新 DOM/设计口径成立，不等于测试已经落地等价断言；测试选择器/夹具仍待更新。

**总评**：新 DOM 多数已存在（`.chat-row` 内边距、`tool-current`、`mi-body`/`mi-chip`、`tool-records`、`.status-spinner`、Motion），但**可复核的等价测量**目前只有工作徽标（8/9）与 chip 右对齐（6）；1/3/4/7/12 仍缺测试选择器/夹具或测量口径，5 是真实 P2 样式微差，10/11 是真实 P1 产品缺口。**重锚尚未全部落地，不能按“已重锚”记 pass。**

## 四、新端 A–L 审计

| 面 | 覆盖（1360/960/200） | 新端结果 | 证据 |
| --- | --- | --- | --- |
| A 标题栏/窗口控制 | 三档 | **pass**：标题栏 36；三按钮/拖拽区正常；200% 不横溢；无产品内「窗口控制不可用」 | `raw-main/00-titlebar*`、`metrics-00-titlebar*` |
| B 左树/角色树 | 三档；导入/五角色/工作角色/滚动 | **pass**：1360/960 248px，主入口/治理五角色/工作角色分组；200% 左栏可滚动、树高>0、首末角色可见；行不重叠 | `01-import*`、`05-bootstrap*`、`raw-phase4b/phase4b-200pct-five-role-tree.png`、`metrics-audit-00-main-200.json` |
| C 聊天流 | 三档；空态/加载/普通/回放/受阻/长文 | **1360/960 pass；200 needs-work（P0）**：正文 15/27、内容列 900/664、回放/受阻可读；200% 聊天区随虚拟总高撑开，输入区被推至数千至百万 px | `02-chat*`、`03-denied*`、`12-restore*`、`metrics-02-chat-200.json`、`metrics-audit-00-main-200.json` |
| D 工具行 | 三档；运行/失败/折叠/展开 | **1360/960 pass；P1**：折叠摘要/活动行/失败可见、行高 46.1；200% 可换行；`sys-loading`/`tool-current` 缺 12px 转轮 | `02-chat*`、`03-denied*`、`v3-after-loading-1360.png`、`v3-after-tail-1360.png` |
| E 卡族 | 三档；operator/镜像/queued/失效/跨 pane | **1360/960 pass**：确认卡、源面/镜像、queued、失效、跨 pane 可读；200% 卡内 reflow、动作不横溢；镜像 200 目标未入镜（missing） | `11-operator-card*`、`14-operator-crosspane*`、`raw-phase4b/phase4b-mirror-1360.png` |
| F 抽屉 | 三档；资料/工作概览/设置/文档/治理预览 | **pass（200 目标有例外）**：424/`min(424,100vw)`；打开聚焦 `drawer-close`、背景 inert=2、Esc 回 `tab-work/tab-card/tab-pi`；200% 抽屉近似全屏但可读；工作概览 200 可读 | `audit-02-profile*`、`audit-03-settings*`、`audit-01-work*`、`keyboard-*` |
| G 设置 | 三档；三引擎 Tabs/缺配/保存条/掩码 | **pass**：1360/960 424 抽屉、Tab/Input 32、保存条 64、缺配 warning/设置入口；200% 字段纵排、保存条在首屏/可滚动、无横溢 | `audit-03-settings*`、`09-pi-panel*`、`10-pi-saved*` |
| H 工作概览/队列 | 三档；待处理/排队/撤回/回执 | **pass**：待处理 0/排队列/最近回交文案如实；队列位次/来源/撤回 28；200% 抽屉内可读 | `audit-01-work*`、`raw-phase4b/phase4b-960-five-role-tree.png` |
| I 治理 | 三档；single/trio/五角色/建立预览/镜像 | **pass**：治理状态行、五角色、建立/再接受预览；预览 1360=900、960=654、200=198，均 ≤900；Esc 打开聚焦 `gp-title`、关闭回 `gov-action` | `audit-05-governance*`、`keyboard-governance-*`、`raw-phase4b/phase4b-200pct-governance-preview.png` |
| J 报告/交付 | 三档；报告分层/完整摘要/证据/持久化/投递 | **1360/960 pass；200 partial**：报告卡/完整摘要/证据/存储/不假验收可读；交付批次 1360/960 可见；200 交付与镜像目标未入镜 | `07-handback*`、`08-su-pane*`、`raw-phase4b/phase4b-1360-report.png`、`phase4b-200pct-report*.png`、`phase4b-delivery-1360/960.png` |
| K 空态/错误 | 三档；未导入/无角色/无会话/失败/缺配 | **1360/960 pass；200 needs-work（P1）**：文案如实、危险/警告语义正确；200% 无角色/会话失败态中栏出现横向滚动条，输入区被推远（P0 同 C） | `01-import*`、`05-bootstrap*`、`11-operator-card*`、`metrics-11-operator-card-200.json` |
| L 全局纪律 | 三档；令牌/焦点/图标/动效/CSP | **pass（有证据注记）**：深色 Nova 令牌、2px/3px 焦点、Lucide、热路径零动画、无裸色/第二图标；raw-main 真实 preload 无「窗口控制不可用」；phase4b 冒烟截图含该 harness 标记，仅作布局补充；fixture 注入的「演示运行时」不算产品标记 | `metrics-*`、`keyboard-*`、`raw-main/audit-00-main.png` |

## 五、旧端对照与 200% 重点

| 旧端 5A 缺口 | 新端结果 | 判定 |
| --- | --- | --- |
| F1 200% `#role-tree` 高 0、角色不可见 | 200% 左树可见/可滚动，`treeCH`/`leftSH` 正常，首末角色可见，行不重叠 | **closed** |
| F2 200% 头部/输入区横溢（sw312/232、496/232） | 正常态头部/缺配条/输入区 sw=cw；报告/详情/预览逐容器无横溢；**无角色/会话失败态中栏仍有横向滚动条** | **正常态 closed；错误态 P1 新发现** |
| F4 治理预览 1048>900 | 1360=900、960=654、200=198；≤900 | **closed** |
| F5 治理预览 Esc 不关闭 | Esc 关闭且回 `gov-action`；打开聚焦 `gp-title` | **closed** |
| F7 200% 报告/预览目标未入镜 | 报告卡、完整摘要+证据、治理预览均入镜；交付/镜像 200 仍停在头部 | **部分 closed；交付/镜像 missing** |
| F9 旧 fixture 演示标记 | raw-main 真实 preload 无产品演示标记；phase4b harness 的「窗口控制不可用」是测试壳标记；fixture 注入「演示运行时」只存在于注入消息 | **产品 pass；证据注记** |

**新端 200% 重点（用户点名）**

- 左树可见/滚动：**pass**（`phase4b-200pct-five-role-tree.png`；tree 高>0、可滚到末角色）。
- 头部/缺配条/输入区无横溢：**正常态 pass**（逐容器 sw=cw）；**无角色/会话失败态 P1**（中栏横向滚动条）。
- 治理预览 ≤900 + Esc 回焦：**pass**（1360/960/200 三档；Esc 回 `gov-action`）。
- **新增 P0**：200% 聊天区不再内部滚动，`#chat` 高度=虚拟转录总高，composer 位于 `1,341,790px`（真实历史）或 `5,075/15,994/11,603px`（其他场景），输入区实际不可达。该问题未被 phase4b 200% 冒烟捕获（其夹具历史短，只查 sw/cw，不查 composer 可达性）。

## 六、发现清单

| ID | 严重度 | 场景 | 发现 | 期望/修复方向 | 属主 | 复测 |
| --- | --- | --- | --- | --- | --- | --- |
| 5B-F1 | **P0** | C/F/I/J/K 200% | `#chat` 随转录总高撑开；composer 被推至 5,075–1,341,790px；长历史下输入区实际不可达 | 200% 保持聊天内部滚动、输入区贴底可见/可固定；不让虚拟总高撑开 flex 项；长历史 200% 重测 | 桌面UI | 200% 真实长历史：composer 首屏可见或固定，`#chat` clientHeight ≤ 可用高度 |
| 5B-F2 | **P1** | K 200% 无角色/会话失败 | 中栏出现横向滚动条；`11-operator-card-200.png` 底部可见；正常态容器检查未覆盖该错误态 | 长错误/路径文案换行；`.col-mid` 200% 禁横向滚动；补该状态 sw/cw 断言 | 桌面UI | 200% 该状态无横滚、composer 可达 |
| 5B-F3 | **P1** | D W10/W11 | `.sys-loading`/`.tool-current` 只有文字，缺 12px 转轮；v3 W10/W11 与 Nova「busy/loading=12px 转轮+文字」要求 | 两处复用 `.status-spinner`+`LoaderCircle` 12px；保持尾行 26.6±2；补 0.9s/reduced-motion 等价检查 | 桌面UI | 截图+DOM/时长检查 |
| 5B-F4 | **P1** | C 1360 密度 | `6-可见行` 当前 6，低于等价阈值 8/9；夹具含上一场景残留卡、系统行 3 倍高，与旧端不可比 | 清残留+规范化夹具；≥9 无提示条/≥8 有提示条 @1360、≥4@960；不足则压 chrome 不压正文 | 桌面UI+测试 | 规范化夹具三档 |
| 5B-F5 | P2 | C 注入盒 | `.msg-injected`/`.mi-body` 未锁 1.6；当前继承约 1.68 | 显式 `line-height:1.6`（19.2px） | 桌面UI | computed line-height/ratio |
| 5B-F6 | P2 | C 1360/960 | 治理状态+迁移+缺配+上下文多层状态条叠压，聊天视口缩到 576.4/344.4px | 合并为一条可折状态区或允许折叠；不压正文 | 桌面UI | 1360/960 视口与截屏 |
| 5B-F7 | P2/missing | J 200% | 200% 镜像卡/交付批次截图停在头部，目标内容未入镜 | 滚到卡片再截；或由 200% 冒烟补目标截图 | 桌面UI/UIUX | 200% 目标可见 |
| 5B-F8 | P2/证据 | 证据命名 | `04-profile*`、`12-composer*` 实际为 Pi 设置；profile 以 `audit-02-profile*` 为准 | 后续证据按场景命名；本报告不引用错名图作 target | UIUX | 证据 manifest 标注 |
| 5B-F9 | 注记 | L | phase4b 冒烟截图含「窗口控制不可用」测试壳标记；fixture 注入「演示运行时」 | 产品 raw-main 无标记；冒烟图只作布局补充，不冒充生产 L pass | UIUX/测试 | manifest 注明 |

**P0/P1 合计：1 个 P0、3 个 P1。** 按审计计划 §五，5B 退出条件“P0/P1 清零”未满足；结论不得升为 pass。

## 七、证据与限制

- `raw-main/`：75 PNG（25 场景×1360/960/200）、75 metrics、11 keyboard、`report.txt`；`raw-main/report.txt` 含旧 e2e 补充运行 `E2E_PASS=false`（10 项 `SESSION_REPAIR_*`/`RECOVERY_*` 失败），属测试/桌面UI 行为缺口，不作为视觉 pass。
- `raw-phase4b/`：70/70 冒烟通过、16 PNG、零 console/CSP；覆盖 200% 左树、报告/详情、治理预览、取消回焦、960 facts；其 200% 夹具历史短，不能替代 raw-main 的长历史 P0。
- 已清理证据内临时项目/user-data/`e2e-pi.env`（假 token 夹具），manifest 只列截图/metrics/keyboard/report。
- 未覆盖：Windows/OS-DPI 200%/屏读/真实模型/网络/`.env`；200% 只用 `setZoomFactor(2)`，与 OS/DPI 200% 不等价；新端旧 e2e 的 10 项失败由测试/桌面UI 处理，本报告不改产品断言。
- 候选在审计后被重建（18:48），本报告只对审计时 hash 有效；5B 最终复测须对新候选重跑。

## 八、5B 前必须 / 可随 Phase 5

**5B 前必须（清零 P0/P1）**

1. **P0 200% 输入区不可达**：修 200% 聊天/输入区布局；用真实长历史复测；补 composer 可达性断言（不能只查 sw/cw）。
2. **P1 200% 错误态横滚**：修无角色/会话失败态中栏横向滚动；补该状态逐容器断言。
3. **P1 W10/W11 转轮**：`sys-loading`/`tool-current` 复用同一 12px 转轮；补 0.9s/reduced-motion 等价检查。
4. **P1 密度等价**：清残留+规范化夹具，按 ≥9/≥8/≥4 复测；不足压 chrome，不压正文，不降阈值到 6。

**可随 Phase 5（登记，不阻塞 5B，但需保留在 findings）**

- 注入盒行高 1.6（P2）。
- 1360/960 多层状态条合并/折叠（P2）。
- 200% 镜像/交付目标截图（missing）。
- 证据命名修正与 phase4b harness 标记注记（P2/证据）。
- 镜像/交付 1360/960 视觉补充、治理 flow 四态、聚合 Clock 图标等既有 4B Phase 5 余项。

## 九、边界

本轮只写 `角色卡/UIUX设计师/`；未改 `app/`、`src/`、`test/`、`package.json`、旧入口、其他角色资料或历史设计文档；未提交。UIUX 结论仅作设计对齐证据，不代替测试独立验证、PM 门或独立验收。

## 十、PM §十九 追加复核（2026-10-21 19:25）

本节追加于 PM §十九；前文结论对应审计时 hash `8d202c2d…`，本节对应较新候选 `d1f76147…`（19:23 构建）。**完整 A–L 仍需在候选冻结后按新 hash 重跑。**

### 10.1 BOOTSTRAP 空态

- 旧「完成 bootstrap」**入口条**（`#bootstrap-action`）删除是 2026-10-12 A-5 的有意裁定，**不补回**；`BOOTSTRAP_ACTION_REMOVED` 保持 true。
- 新渲染器把 S0「项目尚未 bootstrap」唯一提及与「开始与 <主入口> 对话」中心 CTA 一并删掉，改为「该项目下未枚举到角色 / 重新导入」，**不是已批准差异**。PM §10.3/§10.7 与 2026-10-18 Liaison §9.2 明确要求保留 S0 与 CTA；桌面UI 需补回。
- 详细文案、分支优先级与新断言见 [BOOTSTRAP 空态设计依据](2026-10-21_design_ui-platform-phase5b-bootstrap-empty-state.md)。结论 **needs-work（P1）**。

### 10.2 12 条重锚

- W1/S3/W6b/W6/W9-12px/W10/W11/reduced-motion 的新 DOM/设计口径基本成立；P2 注入盒行高已由 `.msg-injected .mi-body{line-height:1.6}` 关闭。
- **W9/W10/W11 转轮被实现为 CSS `@keyframes v3spin`，不是 Motion**；违反 Nova §7.1 与 PM §十九「`.status-spinner`+Lucide+Motion」要求。0.9s 时长可保留，机制需改回 Motion（或 PM 书面修订 Nova），否则不记 pass。
- `6-可见行` 规范化夹具未落地；`S2` 右缘未测量；旧审计脚本仍用 `.spin-arc`/左缘/`24px`/9 行旧口径；12 条不能按“已重锚”记 pass。
- 详细逐项见 [重锚落地复核](2026-10-21_design_ui-platform-phase5b-reanchor-review.md)。结论 **needs-work**。

### 10.3 新候选修复证据

- 只读运行 `test/桌面UI/phase5a-electron-smoke.mjs`（候选 `d1f76147…`）：**19/19 checks、0 failures、零 console/CSP**。
- `200% long history keeps composer reachable...`：chatClient 240、chatScroll 19396、composer bottom 430=innerHeight；`200% empty/error...`：mid 422/422、composer bottom 430。**空态夹具不等于 11-operator-card 的长会话失败文案**，该具体 P1 错误态仍需定向 200% 复测。P0 长历史行为修复有新鲜证据。
- 该冒烟不覆盖完整 A–L、`6-可见行`、S2 右缘、BOOTSTRAP S0；旧 5B 审计 hash 已过期，待冻结后重跑。

### 10.4 冻结候选最终审计（2026-10-21 20:25）

候选冻结为 `c9d13918` / JS `f568e2aa` / CSS `57d9575c`（gzip9 288,262B）后已重跑：design audit **31/31**、带提示条密度 **8/576.4**（另测试夹具 11/539.4）、5A 冒烟 **24/24**、4B 冒烟 **70/70**、main **E2E_PASS=true**、51 张三档 A–L。**P0 与旧 P1 清零**；但新发现 **P1**：200%（480/680 CSS）sticky composer 遮挡报告卡/完整摘要/治理预览/镜像卡动作，目标截图只剩顶部。结论 **needs-work（P0 0、P1 1、P2 3）**，5A 门未通过。详见 [冻结候选最终审计](2026-10-21_design_ui-platform-phase5b-final-audit.md) 与[证据](2026-10-21-phase5b-final-audit-evidence/)。

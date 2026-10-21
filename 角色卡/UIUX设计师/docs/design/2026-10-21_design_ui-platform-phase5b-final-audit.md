---
id: ui-platform-phase5b-final-audit
type: design
title: Phase 5B 冻结候选最终视觉审计（1360/960/200% A–L）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 4
related: [ui-platform-phase5b-new-visual-audit, ui-platform-phase5b-reanchor-review, ui-platform-phase5b-bootstrap-empty-state, ui-platform-phase4b-review, ui-platform-nova]
events:
  - date: "2026-10-21"
    kind: audited
    summary: 对冻结候选 c9d13918/f568e2aa/57d9575c 重跑 1360/960/200% A–L、31/31 design audit、32/32 带提示条密度、24/24 5A 冒烟、70/70 4B 冒烟、main E2E_PASS；P0 与旧 P1 清零，但新发现 200%（480/680 CSS）sticky composer 遮挡报告/完整摘要/治理预览/镜像卡目标，结论 needs-work（P1×1）
  - date: "2026-10-21"
    kind: re-audited
    summary: 桌面UI 紧凑 composer 修复后新候选 dbe8dc0a/f568e2aa/d364ee3e：原 200% 遮挡基本清零（报告/详情/预览/镜像动作可见），但 480 CSS composer 出现横向溢出（sw261/cw222，发送钮右 509>mid470），4B 冒烟 69/70；结论仍 needs-work（P0 0、P1 1、P2 3）
  - date: "2026-10-21"
    kind: accepted
    summary: 最终候选 f372e111/f568e2aa/b52cfca1：5A 36/36、4B 70/70、design audit 31/31、带提示条密度 32/32、main E2E_PASS；680/480 遮挡门全过、480 composer/header 无横溢；P0/P1 清零，结论 pass（P2 4 条：480 镜像 chip 与动作重叠、480 完整卡片标题在视口外、main 3× 200 截图位/命名、harness 标记注记）
  - date: "2026-10-21"
    kind: accepted
    summary: 5B 切换唯一生产入口 app/renderer/dist/index.html（HTML 3c4da2a2/JS f568e2aa/CSS 76fad7ce）：5A 36/36、4B 70/70、design audit 31/31、带提示条密度 32/32、main E2E_PASS、S0 25/25；P0/P1 清零，结论 pass（P2 5 条：480 镜像 chip/动作重叠、480 完整卡片标题在视口外、480 缺配条下半/按钮被 composer 覆盖、main 3× 200 截图位/命名、harness 标记注记）
---

# Phase 5B 冻结候选最终视觉审计（1360/960/200% A–L）

**范围**：按 PM §十九 与 [Phase 5 视觉审计计划](2026-10-21_design_ui-platform-phase5-visual-audit-plan.md)，对**冻结候选**重跑新端 1360×860 / 960×620 / 200% A–L 视觉审计，复核 P0/P1 清零、12 条重锚、S0、MERGE/DEFAULT/RESTORE，记录新 hash/manifest/findings。**只读**；未改 `app/`、`src/`、`test/`；未提交。

**结论（最终生产入口）：pass（P0 0、P1 0、P2 5）。**

> - **P0 清零**：200% 长历史 composer 可达（chat 内部滚动 + 贴底）；5A 冒烟 36/36 中 `chatClient=240`、`chatScroll≈19472`、`composer.bottom=430=innerHeight`。
> - **P1 清零**：200% 长会话失败无横滚（`ZOOM200_OPERATOR_LONG_FAILURE_NO_H_OVERFLOW=true`）；BusySpinner 为共享 `motion/react`（非 CSS keyframes）；密度 1360 无提示条 9、带提示条 8/11、960 ≥4；注入盒 1.6；**原 200% 遮挡 P1 已清零**——5A 36/36 的 680/480 遮挡门中 report complete summary/evidence、governance preview、mirror actions、delivery facts、S0 CTA 全部 `bottom <= composer.top`，composer 95 CSS，预览时 static；4B 70/70 中 480 `200% containers no horizontal overflow` true、header wraps/config notice true。
> - **P2 ×5**：①480 镜像 chip 与确认/拒绝动作带重叠（gate 通过，滚动可移开）；②480 报告/交付 target 可见但完整卡片标题在视口上缘外；③480 缺配条下半/按钮被 composer 覆盖（恢复入口仍有 header/设置）；④main 3× 200% 截图常停底部/`04-profile` 为聊天、命名不符；⑤smoke/4B「窗口控制不可用」harness 标记（非产品）。
> - 本结论只作设计对齐证据，不代替测试独立验证、PM 门或独立验收；5A 门设计对齐通过。

> **Revision 2（2026-10-21 20:35）**：桌面UI 已落紧凑 composer 修复，新候选 `dbe8dc0a` / JS `f568e2aa` / CSS `d364ee3e`。原 P1「composer 遮挡目标」基本清零：报告标题/事实、完整摘要正文、治理预览标题/路径、镜像卡确认/拒绝动作均可见；但 **480 CSS 出现新的 P1 输入区横向溢出**（`.composer` sw261/cw222，发送钮右 509>mid470，4B 冒烟 69/70）。修复后复测详见 §十；本轮结论仍 **needs-work（P0 0、P1 1、P2 4）**。

> **Revision 3（2026-10-21 20:55，最终）**：最终候选 `f372e111` / JS `f568e2aa` / CSS `b52cfca1`。5A 冒烟 **36/36**（680/480 遮挡门全过）、4B **70/70**、design audit **31/31**、带提示条密度 **32/32**、main **E2E_PASS=true**。**P0/P1 清零，结论 pass（P0 0、P1 0、P2 4）**；Revision 1/2 的 needs-work 为历史。详见 §十一。

> **Revision 4（2026-10-21 21:15，5B 唯一生产入口）**：5B 已切换 `app/renderer/dist/index.html`（HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`；旧渲染器/vendor 已删）。5A 36/36、4B 70/70、design audit 31/31、带提示条密度 32/32、main E2E_PASS、S0 25/25；P0/P1 清零，结论 **pass（P2 5）**。详见 §十二。

## 一、候选与环境

| 项 | 值 |
| --- | --- |
| 入口 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/app/renderer/dist/index.html`（5B 唯一生产入口；旧渲染器/vendor 已删） |
| 候选 hash（生产入口） | index `3c4da2a2a4f99f6ffffdb737ccf854b3320bf2605a8d2b53190e5017ad33b301`；JS `f568e2aae8866996b7dabc22b69cdb4675fa8e2e8b8d020eb812a8aba08e4095`（`index-BVLfGR_D.js`）；CSS `76fad7ce7c7b449d7e3b5f61517555f7f5c9d97e169a81d504289131d6ffc0f6`（`index-DUBNk8-R.css`） |
| commit / 环境 | `224cf831f7a26fd2fac8af7155790a75fa31f6b5`；Electron 44.7.0；macOS 26.6.2 arm64 |
| gzip9 | 288,530B（HTML 400 + JS 268,650 + CSS 19,480）；≤300KiB；严格 CSP |
| 视口 | 1360×860；960×620；200% = `setZoomFactor(2)`；本审计同时覆盖 960 物理/480 CSS 与 1360 物理/680 CSS 两档（见 §五） |
| 证据 | `2026-10-21-phase5b-production-entry-audit-evidence/`：main-al-3x 51 PNG、design-audit 18、density-notice-pass 18、smoke 21、phase4b-smoke 10、s0-200 10；manifest/findings |

## 二、P0/P1 清零复核

| 旧项 | 结果 | 证据 |
| --- | --- | --- |
| P0 200% 长历史 composer 不可达 | **closed** | `smoke/report.json`：`200% long history keeps composer reachable and chat internally scrollable=true`，`chatClient=240`、`chatScroll=19388`、`overflowY=auto`、`composer.top=255.4`、`composer.bottom=430=innerHeight`；`main-al-3x/02-chat-200.png` 可见 composer 贴底。 |
| P1 200% operator-card 长会话失败态横滚 | **closed** | 测试 final2 `raw/zoom200/report.json`：`ZOOM200_OPERATOR_LONG_FAILURE_NO_H_OVERFLOW=true`（chatOv/midOv/docOv=0，card/mirror/delivery 存在）；本轮 `s0-200/report.json` 480 CSS `mid.scrollW=clientW=222`、`doc.scrollWidth=innerWidth=480`；`phase4b.css` `.col-mid{overflow-x:hidden}`。 |
| P1 BusySpinner CSS keyframes 非 Motion | **closed** | `app/renderer/src/chat/BusySpinner.tsx`：共享 `motion/react`，`duration:0.9 linear infinite`，`useReducedMotionQuery`，`data-spin-motion=true`/`data-spin-duration=0.9`；Sidebar/loading/tail 共用；无生产 `@keyframes v3spin`。design audit `9-W9/10-W10/11-W11` 均 `motion:"true"`、`spinDuration:"0.9"`，`12-reduced-motion` true。 |
| P1 密度（1360 无提示条 9 / 带提示条 ≥8 / 960 ≥4） | **closed** | design audit canonical：`9/613.4`；960 `6/381.4`。测试 final2 `density`：1360 无提示 `12/576.4`、960 `8/335.6`、**带提示条 `11/539.4`**（notice h=37）；本轮独立夹具 `density-notice-pass`：**8/576.4**、32/32。两种夹具均 ≥8。 |
| P2 注入盒行高 1.6 | **closed** | design audit `W6`：`lineHeight=19.2px`、`fontSize=12px`，比值 1.6；`density-notice-pass` 同。 |
| 200% 镜像/交付目标截图 | **computed/截图已补，但有遮挡** | `smoke/report.json`：mirror card target visible true（badge/source/actions in DOM），delivery facts visible true；截图 `07-operator-mirror-200pct.png`、`08-delivery-200pct.png` 显示 composer 覆盖卡片下半/交付事实。 |

**P0 清零。旧 P1 全部清零；但 200% 目标内容遮挡为新 P1（§四）。**

## 三、重锚复核（12 条 + S0 + MERGE/DEFAULT/RESTORE）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| W1 行距 16±1 | pass | design audit `rowPaddingBottom=15px`（16±1）；32/32 同。 |
| 6 可见行 ≥9 / 带提示 ≥8 / 960 ≥4 | pass | 见 §二；canonical 9、notice 8/11、960 6/8。 |
| S3 无 chip 尾行兜底 | pass | `tool-current`「正在工作」+ spinner；design audit true。 |
| W6b 系统正文去前缀 | pass | `chip=系统消息 · 看护`，body 无 `[系统·]`。 |
| W6 注入盒 1.6 | pass | 19.2/12。 |
| S2 chip 右缘 ≤8 | pass | `diffRight=0`（chipX 1088/paneX 354/left diff 734 仅旧左缘口径）。 |
| S1 截断目标仍可见 | pass | `rows=1, truncated=true`。 |
| W9 徽标 12px SVG | pass | `hasSvg:true, boxW:12, svgCssW/H=12px`。 |
| W9 转轮 0.9±0.2s | pass | Motion `duration 0.9`，`motion:true`。 |
| W11 loading 同款转轮 | pass | `tag=svg, spinDuration=0.9, motion=true`。 |
| W10 尾行含转轮 | pass | 行高 26.6、spinner true。 |
| 12 reduced-motion 静止弧 | pass | CDP reduce；`reduced=true`、`hasSvg=true`。 |
| 11 无第二转轮实现 | pass | Sidebar/loading/tail 共用 `BusySpinner`；无生产 CSS keyframes。 |
| S0 空态 | **pass（1360/960/680）；P2（480）** | 测试 final2 `s0/report.json`：标题/说明/CTA/单一提及/无治理 CTA/点击+键盘开会话/1360/960/680 true；本轮 `main-al-3x/05-bootstrap.png` 可见；480 CSS `s0-200` CTA bottom 398.6 > 310，需滚动（P2）。 |
| MERGE 语义身份 | pass | 测试 final2 `MERGE_UI_PASS 12`。 |
| DEFAULT closest | pass | 测试 final2 `UIUX_V2_PASS 110`。 |
| RESTORE 成功无分隔行 | pass | main `RESTORE_NO_SUCCESS_DIVIDER=true`；`RESTORE_SU_REPLAY_ROWS=1`。 |

## 四、新 P1：200% sticky composer 遮挡目标内容

**事实**（480 CSS，960×620 物理，`phase4b-smoke` 本轮最终候选）：

- `phase4b-200pct-report.png`：报告卡仅顶部「来源 P · 正式回交 / 任务报告」露出，正文/事实/按钮被 composer 覆盖。
- `phase4b-200pct-report-details.png`：完整摘要/证据仅露出折叠标题，正文不可见。
- `phase4b-200pct-governance-preview.png`：治理预览面板几乎全被 composer 覆盖，仅顶部一条可见。
- 680 CSS（1360×860 物理，`smoke/07-operator-mirror-200pct.png`）：镜像卡 badge/source 可见，但确认/拒绝动作被 composer 覆盖；`08-delivery-200pct.png` 停在报告底部，交付批次 facts 不在画面。
- 480 CSS S0：标题 at 286.6–310.6，说明 314.6–354.6，CTA 366.6–398.6；innerHeight 310 → CTA 在首屏下（需滚动）。

**原因**：200% `#chat` 保持 `min-height:240px` 内部滚动，`.col-mid .composer { position:sticky; bottom:0; z-index:20 }`；在 480×310 CSS 下，头部（121）+ 治理/缺配提示（127）+ composer（约 185）已超过视口，composer 覆盖内容列。现有 200% 检查只验 `scrollWidth<=clientWidth` 与目标节点存在/rect，不验 composer 与目标的遮挡关系。

**判定**：**P1（设计回归/200% 目标不可读）**。不是 P0（左树/输入/滚动可用，无横滚），但 5A 门要求目标内容 200% 可读，当前不满足。

**修复方向（桌面UI）**：在 ≤680 CSS 增加 200% 紧凑输入区（折叠审批开关/键盘提示，composer 高度 ≤96 CSS），或在报告/完整摘要/治理预览/镜像卡打开时让 composer 不 sticky/暂时收起；内容列保留 ≥200 CSS 可读高度，并给 `scroll-padding-bottom` 等于 composer 高度。修复后按同一场景重截 480/680 的 report/details/preview/mirror/delivery/S0，并补「目标元素 bottom ≤ composer.top」断言。

## 五、A–L 审计

| 面 | 1360 | 960 | 200% | 结论 |
| --- | --- | --- | --- | --- |
| A 标题栏 | pass（36/三按钮/拖拽） | pass | pass（680/480 无横溢；480 物理图含 harness 标记） | pass |
| B 左树 | pass（主入口/五角色/工作角色/滚动） | pass | pass（480：treeCH 615、leftSH 895、首末可见；680：P7 可见） | pass |
| C 聊天流 | pass（15/27、900 列、回放/受阻） | pass（664、长历史 960） | **P1**：长历史 composer 可达（P0 闭），但报告/卡目标被 composer 遮挡 | needs-work |
| D 工具行 | pass（合并/行高/失败/折叠） | pass | pass（loading/tail spinner Motion）；卡片动作受 C 影响 | pass（C 影响） |
| E 卡族 | pass（operator/跨 pane/失效） | pass | **P1**：镜像卡 badge/source 可见，动作被 composer 覆盖 | needs-work |
| F 抽屉 | pass（424/资料/设置/工作/文档） | pass | 设置/资料 480 抽屉近似全屏、可读；治理预览被 composer 覆盖 | pass（G）；I needs-work |
| G 设置 | pass（三引擎/Tabs/保存条 64） | pass | pass（480 抽屉、关闭 X、保存条可读） | pass |
| H 工作概览/队列 | pass（待处理/排队/撤回） | pass | pass（抽屉内可读） | pass |
| I 治理 | pass（三权/五角色/900 预览/Esc） | pass（654） | 宽度/Esc pass；**治理预览被 composer 覆盖** | needs-work |
| J 报告/交付 | pass（分层/完整摘要/证据/交付 facts） | pass | **报告卡/完整摘要/交付被 composer 覆盖** | needs-work |
| K 空态/错误 | pass（S0/无角色/缺配/失败） | pass（S0） | S0 680 pass；480 CTA 在首屏下（P2）；错误态无横滚 | pass（P2） |
| L 全局纪律 | pass（令牌/焦点/Lucide/Motion） | pass | pass（Motion 转轮/焦点环；smoke 图 harness 标记注记） | pass |

## 六、P2 与证据注记

| ID | 严重度 | 内容 | 证据 |
| --- | --- | --- | --- |
| 5B-FP2-1 | P2 | 480 CSS S0 CTA 在首屏下（378.6–398.6 > 310），需滚动；与 P1 同源（composer/提示条占满高度） | `s0-200/report.json`、`09-s0-200pct.png` |
| 5B-FP2-2 | P2 | main 3× 200% 截图常停在滚动底部（`02-chat-200`/`11-operator-card-200`），不能单独证明首屏内容；以 smoke/4B 目标截图为补充 | `main-al-3x/*-200.png` |
| 5B-FP2-3 | P2/证据 | main `04-profile*` 内容为聊天而非 profile；`09-pi-panel` 才是设置。profile 以 `design-audit/B*/C*` 与 `smoke` 目标为准 | `main-al-3x/04-profile.png` |
| 5B-FP2-4 | 注记 | smoke/4B 截图含「窗口控制不可用」测试壳标记；raw-main/main 真实 preload 无此标记；不作产品 L 失败 | `smoke/06-*`、`phase4b-smoke/phase4b-200pct*` |

## 七、证据清单

- `main-al-3x/`：17 场景 ×1360/960/200 = **51 PNG** + `report.txt`（`E2E_PASS=true`、`E2E_FAILURES=`）；200% 用 960×620 物理/480 CSS。
- `design-audit/`：更新后 `uiux-design-audit.mjs`（新锚点）→ **31/31 pass**；18 PNG + report。
- `density-notice/`：带缺配提示条 canonical 夹具，旧 `6-可见行≥9` 得 **8/576.4**（唯一失败，证明阈值需 ≥8）；18 PNG + report。
- `density-notice-pass/`：同一夹具改 **≥8** → **32/32 pass**；18 PNG + report。
- `smoke/`：24/24（S0/长历史/200% mirror/delivery/焦点）9 PNG + report。
- `phase4b-smoke/`：70/70，10 PNG（含 480 CSS report/details/preview/tree）+ report。
- `s0-200/`：480 CSS S0 补充，25 checks 1 fail（CTA 首屏下）；10 PNG + report。
- 测试 final2（外部引用）：`MERGE_UI_PASS 12`、`UIUX_V2_PASS 110`、`s0/report.json`、`zoom200/report.json`、`density/report.json`。
- `manifest.json` / `findings.json`：候选 hash、每张 PNG sha256/尺寸、检查摘要、P1/P2。
- 临时 user-data/项目/e2e-pi.env 已清理；未保留凭据。

## 八、5A 门结论与待办

**结论：needs-work（P0 0、P1 1、P2 3 + 1 注记）。** P0 与旧 P1 已清零；新 P1 是 200%（480/680 CSS）sticky composer 遮挡报告/完整摘要/治理预览/镜像卡目标。按「P0/P1 清零才可 5A 门」，本轮**不通过**，需桌面UI 修复后按同场景 480/680 重截并补遮挡断言，再做一次最终 A–L 复跑（受影响 C/E/F/I/J/K 及 S0）。

**P2 可随修复/Phase 5**：480 S0 CTA 首屏下（同源可随 P1 修）；main 3× 200 截图滚动位；场景命名/证据注记；harness 标记注记。

**未覆盖**：Windows/OS-DPI 200%/屏读/真实模型/网络/`.env`；本审计仅 macOS 离线真实 Electron，200% 为 zoom factor，不等价 OS/DPI 200%。

## 九、边界

只写 `角色卡/UIUX设计师/`；未改 `app/`、`src/`、`test/`、其他角色资料或历史设计文档；未提交。UIUX 结论只作设计对齐证据，不代替测试独立验证、PM 门或独立验收。

## 十、修复后复测（2026-10-21 20:35，历史中间候选）

**候选**：index `dbe8dc0ab1aa8f82eb37fdac97b7b5c2077eea5a88206bc891a13159a414825b`；JS `f568e2aae8866996b7dabc22b69cdb4675fa8e2e8b8d020eb812a8aba08e4095`（与上一冻结候选相同，CSS-only 变更）；CSS `d364ee3e6fa4731a8c9988f218580093928dc6b045dbb310df0a8338fdbe74cf`。证据：`2026-10-21-phase5b-final2-audit-evidence/`。

**结果**

- **原 P1 遮挡基本清零（closed）**：480 CSS `phase4b-200pct-report.png` 可见报告标题/声明/facts；`report-details.png` 可见完整摘要正文；`governance-preview.png` 可见预览标题/路径/取消；680 CSS `07-operator-mirror-200pct.png` 可见确认/拒绝动作且 composer 高 95。composer 从 ~185 降到 **95 CSS**，`#chat` padding-bottom/scroll-padding 104。
- **新 P1（唯一阻塞）**：480 CSS `200% containers no horizontal overflow` **false**——`.composer` sw=261/cw=222；`.composer-actions` right=509 > `.col-mid` right=470；截图 `phase4b-200pct.png` 发送钮被右缘裁切。JSON 见 `phase4b-smoke/report.json`。原因：紧凑模式 `.composer-bottom{flex-wrap:nowrap}` 且 judge/scope 仍占位，按钮组超出 222 CSS。
- **P2**：480 CSS S0 CTA bottom 392.6 > innerHeight 310（空态需滚动）；main 3× 200 截图滚动位/场景命名；smoke harness「窗口控制不可用」标记（非产品）。
- **其余 pass**：5A 冒烟 **24/24**（composer h=95、680/480 compact、镜像/交付 computed）；design audit **31/31**（W1 15、密度 9/613.4、960 6/381.4、S2 右缘 0、S1、W6 1.6、W9-W12 Motion/reduced）；带提示条密度 **32/32（8/576.4）**；main 3× **51 PNG、E2E_PASS=true**；4B 冒烟 **69/70**（仅上述横溢失败）。

**结论：needs-work（P0 0、P1 1、P2 4）。** 5A 门仍未通过。

**修复要求**：≤560 CSS 让 `.composer-bottom` 换行或隐藏 judge/scope、压缩按钮组，确保 `.composer` sw≤cw+1、所有子元素 right≤mid.right；重截 480 输入区并复测 4B 200 容器；然后按新 hash 再做一次最终 A–L/证据。

## 十一、最终候选复测（2026-10-21 20:55）——pass

**候选**：index `f372e111d49665578029083991bd4a02b10d535707d6a642184ba2f267a5b5cc`；JS `f568e2aae8866996b7dabc22b69cdb4675fa8e2e8b8d020eb812a8aba08e4095`（不变）；CSS `b52cfca1d79b90cb622caea83cb46e6f2be8f6d89c753eea7f8e317fe74271fe`。证据：`2026-10-21-phase5b-final4-audit-evidence/`。

**结果：P0/P1 清零，结论 pass。**

| 项 | 结果 | 值 |
| --- | --- | --- |
| 5A 冒烟 36/36 | pass | `composer h=95`；480/680 `report complete summary/evidence`、`governance preview`、`mirror actions`、`delivery facts`、`S0 CTA` 的 `bottom <= composer.top` 全部 true；200% 长历史 chatClient 240/scroll ~19472/bottom 430；S0 标题/说明/CTA/单一提及/无治理 CTA/点击+键盘 true |
| 4B 冒烟 70/70 | pass | 480 CSS `200% containers no horizontal overflow` true（`.composer` 222/222、`.chat-head` 222/222、`.col-mid` 222/222、`midOffenders=[]`）；`200% header wraps` true；`config notice full text wrapped` true（notice 179–276，button 275，innerHeight 310） |
| design audit 31/31 | pass | W1 15、密度 9/613.4、960 6/381.4、S2 右缘 0、S1 截断、W6 1.6、W9-W12 Motion/reduced |
| 带提示条密度 32/32 | pass | 480/1360：`fullyVisibleRows=8`、`viewportH=576.4`；旧 ≥9 唯一失败为历史 |
| main 3× | pass | 51 PNG（17 场景×1360/960/200）、`E2E_PASS=true`、`E2E_FAILURES=`；MERGE 12/12、DEFAULT 110/110（JS 未变，继承测试 final2）、`RESTORE_NO_SUCCESS_DIVIDER=true` |
| 480 S0 补充 | pass | `s0-200` 25/25；CTA 275.7–307.7、composer top 215；遮挡门滚动后 CTA 180.6–212.6 在 composer 上方 |

**原 P1 遮挡清零**：报告卡/完整摘要/治理预览/镜像卡动作/交付 facts/S0 CTA 在 680 与 480 的遮挡门均 `bottom <= composer.top`；480 头部与 composer 均无横向溢出。紧凑 composer 95 CSS、`#chat` padding/scroll-padding 104 生效。

**P2（登记，不阻塞 5A 门）**

1. **480 CSS 镜像 chip 覆盖动作带**：`.op-actions` bottom 206 < composer 215 的 gate 通过，但 sticky「有 1 条待确认 · 定位」chip 与确认/拒绝动作带重叠（`13-mirror-480css.png`）；滚动可移开，未计入 P1。建议后续把 chip 移到动作上方/下方。
2. **480 CSS 完整卡片标题在视口外**：report summary / delivery facts 的 target bottom ≤ composer.top 通过，但报告卡标题/交付批次标题在视口上缘外（`10-report-480css.png`/`14-delivery-480css.png`）；target-specific gate 通过，完整卡片需滚动。
3. **main 3× 200% 截图**常停在滚动底部（`02-chat-200`/`11-operator-card-200`），`04-profile` 内容为聊天；以 smoke/design-audit 目标截图为补充。
4. **harness 标记**：smoke/4B 截图含「窗口控制不可用」，真实 preload 的 main 截图无；不作产品 L 失败。

**5A 门**：P0/P1 清零、遮挡门全过、密度/重锚/S0/MERGE/DEFAULT/RESTORE 证据齐；UIUX 设计对齐结论 **pass**。P2 已登记，可随 Phase 5 或后续打磨。本结论不代替测试独立验证、PM 门或独立验收。

### 最终 hash 补充（2026-10-21 20:55）

协调方确认最终 hash 为 HTML `f372e111…`、JS `f568e2aa…`、CSS `b52cfca1…`（gzip 288,552B），与本轮 `final4` 证据一致。最终 P2 补充：**480 CSS 镜像卡截图中「有 1 条待确认 · 定位」chip 覆盖在确认/拒绝动作上方**（`.op-actions` bottom 206 < composer 215 的 gate 通过，但 chip 与之重叠；滚动可移开，未计入 P1）；480 交付截图为 target `.delivery-batch-facts` 可见，但批次标题在视口上缘外；报告卡标题同理。三者均登记为 P2，不改变 pass 结论。

## 十二、5B 唯一生产入口最终审计（2026-10-21 21:15）

**候选**：`app/renderer/dist/index.html`，HTML `3c4da2a2a4f99f6ffffdb737ccf854b3320bf2605a8d2b53190e5017ad33b301`；JS `f568e2aa…`（`index-BVLfGR_D.js`）；CSS `76fad7ce…`（`index-DUBNk8-R.css`）；gzip9 288,530B。旧渲染器/vendor 已删；`app/renderer/index.html` 仅为 Vite dev entry，不是生产入口。证据：`2026-10-21-phase5b-production-entry-audit-evidence/`。

**结果：pass（P0 0、P1 0、P2 5）。**

| 检查 | 结果 | 值 |
| --- | --- | --- |
| 5A 冒烟 | **36/36** | 680/480 遮挡门全过（report summary/evidence、preview、mirror actions、delivery facts、S0 CTA `bottom<=composer.top`）；composer 95 CSS；S0 标题/说明/CTA/单一提及/无治理 CTA；200% 长历史 chatClient 240/scroll≈19472/bottom 430 |
| 4B 冒烟 | **70/70** | 480 `200% containers no horizontal overflow` true（composer/header/col-mid 222/222、midOffenders=[]）；header wraps；config notice text/button within viewport |
| design audit | **31/31** | W1 15、密度 9/613.4、960 6/381.4、S2 右缘 0、S1 截断、W6 1.6、W9-W12 Motion/reduced |
| 带提示条密度 | **32/32** | 8/576.4；另测试夹具 11/539.4；1360 无提示 9、960 ≥4 |
| S0 480 | **25/25** | 标题/说明/CTA 完整可见（15-s0-480css） |
| main 3× | **51 PNG / E2E_PASS=true** | 17 场景×1360/960/200；MERGE 12/12、DEFAULT 110/110（JS 未变）、RESTORE_NO_SUCCESS_DIVIDER=true |

**与 5A 旧端快照对照**

| 5A 旧端 | 5B 生产入口 | 判定 |
| --- | --- | --- |
| 200% `#role-tree` h=0、角色不可见 | 200% 左树可见/可滚动（treeCH/leftSH、首末角色；4B 200pct-five-role-tree） | **closed** |
| 200% 头部/输入区横溢（chat-head sw312/cw232、composer sw496/cw232） | 480/680 头部/composer/col-mid 222/222、midOffenders=[]；composer 95 | **closed** |
| 治理预览 1048>900、Esc 不关闭 | 1360=900/960=654/200≤width；Esc 回 `gov-action` | **closed** |
| 200% 报告/预览目标未入镜 | report/details/preview/mirror/delivery/S0 目标截图 + bottom≤composer gate | **closed** |
| 旧 1360/960 层级/900/424/焦点 | 生产入口 1360/960/200 全量 51 PNG；900/424/焦点环/inert/Esc 通过 | **保持** |
| 旧 `04-profile` 内容错位/演示标记 | 生产入口真实 preload；demo 标记不在产品画面；profile 以 design-audit/smoke 目标为准 | **已澄清（P2 证据注记）** |
| 旧 `E2E_PASS=false` | 生产入口 main `E2E_PASS=true`、`E2E_FAILURES=` | **行为基线更新（非视觉）** |

**5A 旧图引用**（旧入口已删，只读历史证据）：`2026-10-21-phase5a-old-visual-evidence/raw/05-bootstrap-200.png`、`raw/audit-00-main-200.png`、`raw/metrics-audit-00-main-200.json`（树 h=0/头部输入横溢）；`raw/audit-05-governance.png`、`raw/metrics-audit-05-governance.json`、`raw/keyboard-governance-esc.json`（预览 1048>900/Esc 不关）；`raw/07-handback-200.png`、`raw/audit-05-governance-200.png`（200% 报告/预览未入镜）；`raw/04-profile.png`、`raw/12-composer.png`（场景命名/演示标记）。新端同场景证据见本目录 `main-al-3x/`、`smoke/`、`phase4b-smoke/`。

**A–L**：A 标题栏、B 左树、C 聊天流、D 工具行、E 卡族、F 抽屉、G 设置、H 工作概览/队列、I 治理、J 报告/交付、K 空态/错误、L 全局纪律——1360/960/200 均通过；200% 目标遮挡门全过。已批准的 Nova 差异（深色、15/27、900 列、8/6/4、五角色、424 抽屉、队列子视图、镜像卡）按旧→新登记，不作回归。

**P2（5 条，登记不阻塞）**

1. 480 CSS 镜像 chip 与确认/拒绝动作带重叠（gate 通过，滚动可移开）。
2. 480 CSS 报告/交付 target 可见但完整卡片/批次标题在视口上缘外。
3. 480 CSS 缺配条下半/「打开 Pi 设置」按钮在初始画面被 composer 覆盖（header/设置入口仍可恢复）。
4. main 3× 200% 截图常停滚动底部/`04-profile` 内容为聊天、命名不符。
5. smoke/4B 截图「窗口控制不可用」harness 标记（非产品）。

**5B 门**：唯一入口、P0/P1 清零、A–L 覆盖、200% 遮挡门/密度/S0/治理预览/报告交付证据齐；UIUX 设计对齐结论 **pass**。P2 可随 Phase 5 后续打磨；本结论不代替测试独立验证、PM 门或独立验收。

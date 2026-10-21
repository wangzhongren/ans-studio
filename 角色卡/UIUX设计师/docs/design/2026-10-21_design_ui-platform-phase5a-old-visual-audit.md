---
id: ui-platform-phase5a-old-visual-audit
type: design
title: Phase 5A 旧入口视觉快照与基线审计
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [ui-platform-phase5-visual-audit-plan, ui-platform-phase4a-review, ui-platform-phase4b-review, ui-contract-surface]
events:
  - date: "2026-10-21"
    kind: audited
    summary: 按 Phase 5 视觉审计计划完成 5A 旧入口真实 Electron 1360/960/200% A–L 快照、computed/rect/scrollWidth/键盘焦点/Esc/inert 证据；旧端 1360/960 基线基本通过，200% needs-work；仅作旧端对照，不代替新端审计
---

# Phase 5A 旧入口视觉快照与基线审计

**范围**：按 [Phase 5 最终视觉审计计划](2026-10-21_design_ui-platform-phase5-visual-audit-plan.md) 的 A–L 清单，对 **5A 旧入口**（旧渲染器，生产默认）做真实 Electron 快照与基线审计。**只读**；未改 `app/` 代码、未改旧入口、未提交。新入口审计等候选冻结通知，**旧端截图不得代替新端证据**。

**结论（5A 旧端基线）**

> **快照任务：pass**（A–L 覆盖；75 张 raw 三档截图 + 17 张标准 1360 截图、75 份 metrics、11 份 keyboard 记录、manifest/findings）。
>
> **旧端设计基线：1360/960 基本 pass；200% needs-work**（旧端不是新候选，不修旧端；列 P1/P2 供新端对照）。
>
> **旧端功能基线：E2E_PASS=false**（`RECOVERY_SAME_PENDING_CARD_ONCE`；原版 e2e 可复现，非本次截图插入导致；属测试/验收基线，不是视觉 pass）。
>
> **missing-evidence**：旧端 200% 报告/治理预览目标内容未在截图出现（停在头部/状态）；04-profile 截图实际是聊天，profile 由 audit-02 覆盖。新端必须在 200% 截到目标内容，不能沿用旧缺口。

## 一、候选与环境

| 项 | 值 |
| --- | --- |
| 入口 | `/Users/wangzhongren/code/vibeingcode/解压/ans-runtime/app/renderer/index.html`（旧生产默认） |
| 5A 候选 | 旧入口；commit `224cf831f7a26fd2fac8af7155790a75fa31f6b5` |
| Electron / Node | 44.7.0 / 24.21.0 |
| OS | macOS 26.6.2 arm64 |
| 渲染器 hash | index `03f493e3…`；renderer `1ca3837e…`；styles `f71f4783…`；preload `98dde83a…` |
| 视口 | 1360×860；960×620；200% = `webContents.setZoomFactor(2)`，960×620 物理 / 480×310 CSS |
| fixture | 旧 e2e 真实 Interface + 仓库根项目（16 角色）+ 临时项目；无真实用户数据 |
| 截图工具 | 真实 Electron `capturePage`（旧 e2e 壳的审计副本，输出仅角色目录） |

## 二、A–L 覆盖

| 面 | 覆盖 | 代表证据 | 旧端结果 |
| --- | --- | --- | --- |
| A 标题栏 | 1360/960/200 | `raw/00-titlebar*.png`、`metrics-audit-00-main*` | 1360/960 pass；200 头部内部横溢（P1） |
| B 左树 | 1360/960/200；导入/五角色/滚动 | `01-import*`、`05-bootstrap*`、`audit-00-main*` | 1360/960 pass；200 树高 0（P1） |
| C 聊天流 | 普通/拒绝/刷新/恢复/输入区 | `02-chat*`、`03-denied*`、`06-refresh*`、`12-composer*`、`12-restore*` | 1360/960 pass；200 聊天/输入区横溢（P1） |
| D 工具行 | 运行/失败/折叠/展开/拒绝 | `02-chat*`、`03-denied*`、`12-composer*` | 1360/960 pass；200 受 C 影响 |
| E 卡族 | shell/operator/queued/失效/跨 pane/锚点 | `11-operator-card*`、`14-operator-crosspane*`、`15-anchor-reanchor*` | 1360/960 卡族结构可读；fixture 有角色错误；200 受头部/树影响 |
| F 抽屉 | 资料/设置/文档；424 | `audit-02-profile*`、`09-pi-panel*`、`10-pi-saved*`、`audit-03-settings*` | 1360/960 424 pass；200 抽屉 424 近似全屏、背景树空 |
| G 设置 | Pi 字段/已保存/窄窗 | `09-pi-panel*`、`10-pi-saved*`、`audit-03-settings*` | 1360/960 pass；200 仅抽屉可读，背景不可用 |
| H 工作概览/队列 | 待处理/队列/撤回回执 | `audit-01-work*`、`04-profile*`（旧截图内容为聊天，已用 audit-02 补） | 1360/960 pass；200 受 B/A 影响 |
| I 治理 | 三权/五角色/状态/建立预览/迁移条 | `05-bootstrap*`、`audit-05-governance*` | 1360/960 可读；preview 宽 1048 > 900（P2）；Esc 不关闭（P1 old） |
| J 报告/交付 | 报告卡/persistence/投递批次/来源文档 | `07-handback*`、`08-su-pane*` | 1360/960 报告/投递结构可见；200 截图未到目标内容（missing） |
| K 空态/错误 | 未导入/无记录/拒绝/会话失败 | `01-import*`、`03-denied*`、`05-bootstrap*`、`11-operator-card*` | 1360/960 文案/危险/空态如实；200 受布局影响 |
| L 全局纪律 | 令牌/焦点/审计/无演示标记 | `metrics-*`、`keyboard-*`、截图 | 1360/960 焦点环 2/3、抽屉 inert/Esc 回焦通过；200 横溢；旧 fixture 有「演示运行时」标记（P2 old） |

- 1360 标准旧 e2e 截图 17 张（`raw-standard/`）与 patch 副本 75 张三档（`raw/`）并存；`04-profile.png` 与命名不符，profile 以 `audit-02-profile*` 为准。
- 键盘记录（10 份）：work/profile/settings 打开聚焦 `drawer-close`、背景 inert=2、Esc 关闭回 `tab-work/tab-card/tab-pi`；引擎菜单聚焦 `runtime-select`、End/Esc 正常；治理预览 Esc 未关闭（old）。200% 的 work/profile 打开/Esc 仍按同路径记录。

## 三、旧端基线发现

| ID | 严重度 | 状态 | 发现 | 证据/数值 |
| --- | --- | --- | --- | --- |
| 5A-F1 | P1 | old-baseline needs-work | 200% 左树不可见：`#role-tree` 高度 0，角色行无法到达 | `05-bootstrap-200.png`、`01-import-200.png`；`metrics-audit-00-main-200.json` role-tree h=0 |
| 5A-F2 | P1 | old-baseline needs-work | 200% 头部/输入区内部横溢；标题/上下文竖排 | `.chat-head` sw312/cw232；`.composer` sw496/cw232；`05-bootstrap-200.png`、`audit-00-main-200.png` |
| 5A-F3 | P2 | old-baseline observation | 1360/960 `.col-left` scrollWidth 251 > clientWidth 247（4px） | `metrics-audit-00-main*.json`；页面无整体横滚 |
| 5A-F4 | P2 | old-baseline observation | 1360 治理预览宽 1048、right 1328，超出 900 内容列（right 1254） | `audit-05-governance.png`、`metrics-audit-05-governance.json` |
| 5A-F5 | P1 | old-baseline needs-work | 治理预览 Esc 不关闭；焦点留 `runtime-select` | `keyboard-governance-open/esc.json` preview=true after Esc；old 无此路径 |
| 5A-F6 | P1 | old-function needs-work | 旧端 e2e `E2E_PASS=false`，`RECOVERY_SAME_PENDING_CARD_ONCE`；原版 e2e 同样失败 | `raw/report.txt`、`raw-standard/report.txt`；不是视觉结论 |
| 5A-F7 | P2 | missing-evidence | 旧端 200% 报告/治理预览截图停在头部/状态，目标卡/预览未入镜；04-profile 截图是聊天 | `07-handback-200.png`、`audit-05-governance-200.png`、`04-profile.png` |
| 5A-F8 | P2 | old-baseline observation | 200% 设置抽屉 424 在 480 CSS 视口近似全屏，背景树空 | `audit-03-settings-200.png`、`metrics-audit-03-settings-200.json` |
| 5A-F9 | P2 | old-baseline observation | 旧截图含「演示运行时·第 N 轮」等 fixture 标记；新端必须无演示标记 | `04-profile.png`、`12-composer.png`、`15-anchor-reanchor.png` |

- **P0 无**：旧端为历史基线，不用于新候选发布；旧端 200% P1 是新端必须避免的对照，不是新端阻断的既成结论。
- **旧端 1360/960 可读**：标题栏 36、左树 248、内容 900、报告卡/抽屉 424、焦点 2px/3px、抽屉 inert/回焦在 1360/960 通过；200% 是旧端主要缺口。

## 四、证据清单

目录：`2026-10-21-phase5a-old-visual-evidence/`

- `raw/`：75 张 PNG（25 场景 × 1360/960/200）、75 份 `metrics-*.json`、11 份 `keyboard-*.json`、`report.txt`；旧 e2e 临时夹具目录已清理；不引用用户数据。
- `raw-standard/`：17 张未改 e2e 标准 1360 截图 + `report.txt`（用于确认 E2E 失败可复现）。
- `manifest.json`：92 张 PNG（75 raw +17 standard）、75 metrics、15 other；候选/环境/入口/hash/场景/尺寸/sha256。
- `findings.json`：上述 9 条 P1/P2/missing 记录。
- 入口/渲染器/preload hash 与 manifest 一致；旧端截图不代表新端，不得在新端审计中复用为通过证据。

## 五、限制与 missing-evidence

- 200% 只做 zoom factor 2（CSS 480×310），未做 OS/DPI 200%/Windows/屏读；由 Phase 5 验收标准决定是否另列 missing。
- 旧端 200% 报告/治理预览未截到目标内容（F7）；旧端 04-profile 命名与实际内容不符（已用 audit-02 补）；旧端没有新队列子视图（旧 work 内联）。
- 旧端 e2e 功能失败 F6 属测试/验收，不由 UIUX 视觉结论修复或掩盖；旧端 200% P1 不修旧端，作为新端对照。
- 旧端 fixture 有错误/演示标记；仅记录，不据此判旧端视觉 pass。

## 六、等待新入口的审计面

候选冻结后，5B/新端必须重跑 A–L 三档，重点：
1. 200% 左树可见/可滚动、头部/缺配条/输入区无横溢（对照旧 F1/F2）。
2. 治理预览可见、Esc 回触发、预览宽度对齐内容列（对照 F4/F5）。
3. 200% 报告卡/完整摘要与证据/交付/设置/profile 目标可见（补 F7）。
4. 旧端 1360/960 可读面逐项对照，登记新设计差异；新端不得回退旧端已通过的 1360/960 层级/焦点/文案。
5. 无演示标记、无裸色/第二图标/热路径动画；组件台账/焦点环/令牌按计划。
6. 旧端 E2E_PASS=false 不进入视觉 pass；由测试独立验证新端行为。

## 七、边界

本轮只写 `角色卡/UIUX设计师/`；未改旧入口/app/src/test、其他角色或历史设计文档；未提交。5A 旧端快照完成，等待候选冻结通知后做新端审计；UIUX 结论只作设计对齐证据，不代替独立验收。

---
id: ui-platform-phase5-visual-audit-plan
type: design
title: Phase 5 最终视觉审计计划（5A 基线 / 5B 生产入口）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: designed
revision: 1
related: [ui-platform-nova, ui-platform-phase4b-design, ui-platform-phase4b-review, ui-contract-surface, ui-components, ui-platform-phase4a-review]
events:
  - date: "2026-10-21"
    kind: planned
    summary: 按 PM §十六 Phase 5 授权与 5A→5B 顺序，制定生产入口候选的最终视觉审计范围、Nova 基线、真实 Electron 方法、旧新对照、证据格式与设计/测试/独立验收分工
---

# Phase 5 最终视觉审计计划

**目的**：在 Phase 5 的 5A（对照与准备）与 5B（切换与下线）中，对生产入口候选做**设计对齐**的最终视觉审计：关键面在 1360×860、960×620、200% 下可读、可操作、符合 Nova × 深色石墨基线，并与 5A 旧入口快照对照；产出可复核的 pass/needs-work/missing-evidence 证据。

**性质**：本文件是**审计计划**，不是实现、验收标准或发布授权；只读设计/实现/证据，不写 `app/` 代码。审计结论只作设计对齐证据，**不代替测试独立验证、PM 门裁定或独立验收**。Phase 5 的最终判断由独立验收角色按先行固定的验收标准作出；本角色不自我验收。

**基线文档**：[Nova × 深色石墨规范](2026-10-21_design_ui-platform-nova.md)、[4A 设计](2026-10-21_design_ui-platform-phase4a-design.md)、[4B 设计](2026-10-21_design_ui-platform-phase4b-design.md)、[4A 评审](2026-10-21_design_ui-platform-phase4a-review.md)、[4B 评审](2026-10-21_design_ui-platform-phase4b-review.md)、[契约面](../../../桌面UI/docs/feature/ui-contract-surface.md)、[组件台账](../../../桌面UI/docs/feature/ui-components.md)。规范是唯一设计源；本计划不新增设计范围/组件/令牌。

## 一、审计范围

### 1.1 候选与时间点

| 阶段 | 候选 | 审计用途 |
| --- | --- | --- |
| 5A | 旧入口（旧 `app/renderer/index.html`，生产默认） | 建立**旧基线快照**：同场景/状态/尺寸的结构、文案、可访问性、几何；旧颜色/字体是历史基线，不与 Nova 深色逐像素比较 |
| 5A | 新入口（构建产物 + dev/prod 候选，生产尚未切换） | 预审候选：关键面布局/状态/200% 风险、审计夹具与证据模板；不作为最终 pass |
| 5B | 新入口生产切换/打包候选（`loadFile` 构建入口，packaged smoke） | **最终审计**：1360/960/200% 全关键面、旧新对照、发现复测、最终设计对齐结论 |

- 候选身份必须记录：git commit、构建产物（HTML/JS/CSS）SHA-256、Electron/Chromium 版本、macOS 版本、是否 packaged、preload/main 哈希、窗口尺寸/缩放/DPI、项目夹具/角色 fixture、旧/新入口路径。入口路径以 PM/桌面窗口最终决定为准（`dist/index.html` 或 `dist/src/index.html`），审计不假设。
- 5A 旧快照必须在删除旧渲染器/vendor 前完成；5B 删除后不得再声称旧端可复跑。全量双端逐 check 以 5A 测试快照为准，UIUX 只引用其候选身份。

### 1.2 关键面（三档）

每面至少 1360×860 与 960×620；标注「200% 适用」的必须在 960（或 1360）`webContents.setZoomFactor(2)` 下复测。若 200% 只覆盖部分面，须在证据 manifest 明列 missing-evidence，不得用普通档代替。

| ID | 面 | 必查状态/内容 | 200% |
| --- | --- | --- | --- |
| A | 标题栏 / 窗口控制 | 默认、最大化/还原（可测时）、禁用/不可用；拖拽区与按钮不冲突；36px；焦点可见 | 是 |
| B | 左树 / 角色树 | 主入口、治理职能五角色、工作角色、分组；6 角色；计数/状态只表达状态；滚动到末行；收起/展开/拖宽；roving 键盘 | 是 |
| C | 聊天流 | 空态、加载/恢复、普通 user/assistant、Markdown h1/h2/h3/列表/引用/表格/代码、回放 `.is-replay`、受阻、长文/虚拟滚动 | 是 |
| D | 工具行 | 运行中/完成/失败/未放行/超时、折叠组摘要、展开详情、时间/目标/chevron；热路径无动画 | 是 |
| E | 卡族 | shell 确认（默认拒绝焦点/Esc/仅显式 allow）、su、恢复卡、失效 operator（动作 hidden/原因可见）、judge 双开关/结果行、operator 源面/镜像/queued | 是 |
| F | 抽屉 | 角色资料四节/文档只读、工作概览、队列子视图、设置、治理预览、文档阅读；424/960/200；Esc/inert/焦点返回；唯一 `#right-queue-body`/`#governance-preview` | 是 |
| G | 设置 | Pi/Codex/Claude Tabs、metadata 字段、缺配/已保存/保存失败、Slider 7 档、机密掩码、固定 64 保存条、Tabs 键盘、缺配 Alert | 是 |
| H | 工作概览 / 队列 | 待处理/当前/排队/最近回交、定位、角标拆分、队列位次/来源/全文/仅客户撤回/成功失败回执、查看全部队列 | 是 |
| I | 治理 | single「旧模型（su）」/trio「三权 · 五角色」/unknown、迁移条、建立/重新接受/迁移预览、逐文件/pin/blockers/canConfirm、phase=write、镜像卡 | 是 |
| J | 报告 / 交付 | 报告分层 source/turn/task/provenance、完整摘要/证据/source、persistence saved/failed/unknown/disabled/expired、delivery「不表示全部收齐」/三列事实/安全副本/重试 | 是 |
| K | 空态 / 错误态 | 未导入、无角色、无会话、无待办/队列/回交、配置缺失/读取失败、文档错误/重试、报告失败/过期、治理记录 invalid/pin-mismatch | 是 |
| L | 全局纪律 | 令牌、对比度、字体/行高、圆角、焦点环、Lucide、Motion 范围、无裸色/第二套库、无演示标记/`window.desktop`、CSP 下无视觉降级 | 是 |

- **旧新对照**：A–K 在 5A 旧入口与 5B 新入口用同一 fixture/状态；旧入口没有的面（治理镜像、4A/4B 新增）标「新面，无旧对照」，但必须有新设计依据。旧入口的浅色/旧字体/旧密度是历史事实，不作为新入口颜色/字体的回归判据；对照关注信息层级、文案、状态、操作可达、阅读保持与无功能回退。
- **允许差异**：深色 Nova、13/15/27 字阶、900 内容列、8/6/4 圆角、五角色治理、424 抽屉、队列子视图、镜像卡等是已批准设计差异；逐条登记「旧值→新值/依据」，不作为缺陷。未登记的视觉/文案/行为差异按 needs-work 处理。

## 二、设计基线（冻结）

### 2.1 令牌与几何

- 唯一令牌来源 `app/renderer/src/index.css`；审计读取 computed style，不按截图目测猜值。关键：`--background #14171A`、`--foreground #F2F4F6`、`--card #1E2328`、`--primary #6FA08B`、`--input #6B757E`、`--ring #6FA08B`、`--warning #C4A15F`、`--danger #C97A6D`、`--drawer-surface #171B1F`、`--radius 8px` / control 6 / micro 4。
- 尺寸：标题栏 36；会话头 64（960 不低于 60）；内容列 900（960 为 664）；抽屉 424（200% `min(424px,100vw)`）；确认卡 640；报告/治理卡/预览同内容列；设置保存条 64；队列动作 28；设置 Tab/Input 32；菜单 208 两行。
- 字阶：正文 15/27、基础 13、次级 11.5/12.5、三级 10.5；行高不压缩到不可读；200% 允许 reflow，不横向滚动。

### 2.2 对比度与语义色

- 审计至少复算：正文/背景 ≥7、次级/背景 ≥4.5、三级/背景 ≥4.5（应按规范实际值）、warning/warning-bg ≥4.5、input/card ≥3、ring/card ≥3、danger/danger-bg ≥4.5；报告/卡/抽屉表面分别计算，不只 body。
- 语义：primary 只用于安全/主操作；warning 用于缺配/等待/治理提示；danger 用于失败/拒绝/危险；不以颜色单独传意；状态/按钮/徽标有文字/aria。
- 焦点环：2px solid `--ring` + 3px offset；组件库默认环不算规范环；键盘可见；抽屉/卡/菜单/Tab/Slider/队列/报告重试均检查。

### 2.3 图标、动效、无第二设计源

- 图标只用 Lucide（`lucide-react`）；12–20px、1.5/1.75 描边；不出现文字 `×`/`›` 代替图标、手绘 SVG 或第二套 icon 库。已知 4B 残留（Drawer `×`）在 Phase 5 应修正或登记；审计发现即 needs-work。
- Motion 只允许 Drawer 160/120ms、菜单/浮层 120ms、引擎切换 0.9s 转轮、judge 警告 9s 一次性；聊天热路径（消息/工具/虚拟行/流式/队列/报告/治理更新）零动画；`prefers-reduced-motion` 下直接呈现/静止弧。禁止 `transition-all`、无限 pulse、第二动画库。
- 无裸色值：新增/修改 CSS/TSX 扫描 `#hex`/`rgb()`/`hsl()`/`oklch()`（令牌定义与明确文档化例外除外）；无第二套 UI/状态库；无 `inline style` 绕过令牌。
- 无演示标记：不出现「演示」「demo」「演示骨架」「窗口控制不可用」等产品外标记（smoke 环境标记不得进生产截图）；不依赖 `window.desktop` 的演示/预览分支；真实生产 preload 桥接存在是正常的；生产严格 CSP 下无内联样式/脚本降级。

### 2.4 状态矩阵

以 Nova 规范 §状态矩阵 + 4A/4B 设计附录为准：default/hover/focus-visible/active/selected/disabled/loading/error/empty/queued/expired。每个关键组件至少核对适用状态；禁止只截默认态。确认卡默认拒绝焦点、Esc/关闭=不放行、仅显式 allow；错误/缺配/未授权不得显示成功/已连接/已验收。

## 三、审计方法

### 3.1 环境与真实 Electron

- 必须用**真实 Electron**加载候选入口（5A 旧入口/新入口 dev 候选；5B 生产/打包候选），真实 preload/IPC/窗口；不得只用浏览器预览或静态 HTML 代替。
- 窗口：1360×860、960×620；200% 用 `webContents.setZoomFactor(2)`（记录 CSS viewport，如 960→480；若同时有 OS/DPI 200%，另记 missing/补充）。截图用 `capturePage`/系统截图，保留完整窗口，不裁切关键边缘；必要时补滚动位置截图。
- 记录环境：OS、Electron/Chromium、GPU 开关、缩放、字体、CSP、入口、构建哈希；固定 fixture（项目/角色/治理模型/报告/队列/配置状态）；不在真实用户数据上截图。

### 3.2 截图与计算样式

- 每面每档至少一张默认态；复杂状态补状态图（缺配/保存失败/错误/空/展开/确认/队列/镜像/报告详情/治理预览）。5B 最终证据至少覆盖 A–L 每面；200% 至少覆盖 B/C/E/F/G/H/I/J/K 中可适用的复杂面。
- 计算样式 JSON：元素选择器/rect/scrollWidth/clientWidth/字体/行高/颜色/背景/边框/圆角/outline/overflow/z-index；对比度按实际前景/背景计算（含伪元素/浮层）。
- 几何断言：内容列 900/664、抽屉 424、标题栏 36、保存条 64、队列动作 28、Tab/Input 32；树行不重叠且可滚动到末行；无横向溢出（逐容器，不只 document）；无文字裁切/重叠；200% 头部/提示/报告/预览可 reflow。
- 状态断言：`aria-expanded`/`aria-selected`/`aria-activedescendant`、按钮 disabled、`role=status`/`aria-live`、`hidden`/`inert`、`data-state`；错误/缺配文案与事实一致。

### 3.3 键盘、焦点、Esc、inert

- 键盘：Tab/Shift+Tab 顺序；左树 roving ↑↓/Home/End；引擎菜单 ↑↓/Home/End/Enter/Space/Esc；设置 Tabs ←/→/Home/End；Slider ←→/Home/End；抽屉 Tab 环/Shift+Tab；文档阅读 Esc 先回列表；治理预览 Esc 回触发、取消回触发；确认卡默认拒绝焦点/Esc/关闭不放行。
- 焦点：打开抽屉聚焦关闭钮；关闭回触发；文档/队列/设置/治理返回回原入口；失效卡动作隐藏后焦点落 finalNote/卡；无焦点落 body/隐藏元素；`inert` 背景不可 Tab 进入；200% 同样。
- 用 `document.activeElement`、`inert` 属性、`getComputedStyle` outline 记录；截图不能代替键盘断言；每项键盘路径有 JSON/日志。

### 3.4 旧新对照与差异登记

- 5A 旧快照按同一 scene/state/尺寸命名；5B 新入口同场景对照。对照维度：信息层级、文案逐字、状态/错误/空态、操作可达、阅读保持、密度/可读性、键盘/焦点；颜色/字体属于已批准设计差异，不做像素比对。
- 差异台账：每项「旧名→新名/旧值→新值/设计依据/是否回归」。允许差异必须引用 Nova/4A/4B/PM 裁定；未登记差异按 needs-work。
- 旧入口缺失的新面（治理镜像/报告回执等）记录「新面，无旧对照」，按 4B 设计基线审计，不以旧缺失判回归。

## 四、证据格式

### 4.1 目录与命名

建议目录：`角色卡/UIUX设计师/docs/design/2026-10-21-phase5-visual-audit-evidence/`（或 PM 指定）。命名：

```
5a-old-1360-<scene>-<state>.png
5a-old-960-<scene>-<state>.png
5b-new-1360-<scene>-<state>.png
5b-new-960-<scene>-<state>.png
5b-new-200-<scene>-<state>.png
computed-<candidate>-<viewport>-<scene>.json
keyboard-<candidate>-<viewport>-<scene>.json
environment.json
manifest.json
findings.json
console-<candidate>.log
```

- 截图不得裁掉关键边框/焦点环/滚动条；200% 截图必须含目标内容（滚到报告/展开 details/打开预览），不能只截头部。
- `manifest.json`：candidate id、entry path、commit/build hashes、Electron/OS、viewport/zoom、fixture、scene/state、file、sha256、timestamp/timezone、operator、notes。
- `findings.json`：id、severity (P0/P1/P2)、scene、expected/actual、evidence paths、baseline clause、owner、status、retest。
- 证据目录只读引用实现/测试；不复制用户数据/密钥；fixture 路径固定、可重放。

### 4.2 证据要求

- 每个 pass 项至少：一张截图 + computed 断言 + 必要的 keyboard/activeElement 记录；不能只写「看起来正常」。
- 每个 needs-work 项至少：复现步骤、截图/rect/样式、期望基线条款、影响面、建议修复方向；不写实现代码（由属主执行）。
- missing-evidence 项：说明未测原因（Windows/DPI/屏读/真实模型等）、现有替代证据、缺口影响；不得用普通档冒充 200% 或旧端冒充新端。
- 所有截图/JSON 带候选哈希；5A/5B 证据分开；5B 删除旧入口后仍保留 5A 快照。

## 五、结论口径

### 5.1 单项结论

| 结论 | 判据 |
| --- | --- |
| **pass** | 该面该状态满足基线：无 P0/P1；几何/对比度/焦点/文案/状态/无横溢/无演示标记；旧新差异已登记 |
| **needs-work** | 存在可见设计缺口：P0/P1 或未登记差异；附复现、证据、修复方向；不因测试通过而忽略视觉/可访问性 |
| **missing-evidence** | 未在要求档位/环境/状态执行，或证据不足；不得写成 pass；列明缺口与影响 |

### 5.2 严重度

- **P0 阻断**：不可读/关键内容裁切、焦点陷阱/键盘不可操作、确认卡可误放行、缺配/未授权显示成功、200% 完全不可用、横向滚动遮挡关键操作、演示标记进入生产。
- **P1 设计回归**：裸色/第二套图标库/热路径动画、焦点环缺失、抽屉/菜单/卡状态错误、文案逐字不符、旧新未登记回归、报告/persistence/delivery 假完整。
- **P2 打磨**：不影响任务完成的间距/字号/微差；可随 Phase 5 或后续，但需登记。

### 5.3 总体结论

- **pass**：所有 P0/P1 通过；P2 已登记且不阻塞；允许差异清单完整；无 missing-evidence 影响关键面。UIUX pass 仅表示**设计对齐证据成立**，不等于功能/独立验收/发布。
- **needs-work**：至少一个 P0/P1；列出属主、修复、复测证据要求；修复后按原场景/档位复核。
- **missing-evidence**：关键面/档位/环境未覆盖；结论不得升为 pass；由 PM/独立验收决定补证或风险接受。
- 任何结论不得修改 Nova 基线或扩大设计范围；需设计变更时停手回 PM/设计，不在审计中自创令牌/组件。

## 六、与测试/验收的分工

| 角色 | 负责 | 不负责 |
| --- | --- | --- |
| UIUX（本计划） | Nova 设计对齐、视觉/可访问性证据、旧新视觉对照、findings/差异台账 | 功能行为验收、全量双端逐 check、性能/IME/bench 结论、发布授权 |
| 测试 | 全量双端快照/逐名对照、main.mjs、packaged smoke、行为/回归/基线、独立验证 | 代替 UIUX 设计判断；不把测试通过当视觉 pass |
| PM | Phase 5 写集/门裁定、允许差异/风险接受、5A/5B 顺序 | 自我最终验收 |
| 独立验收 | 先行固定验收标准，对候选+原始证据判 pass/needs-work/missing-evidence | 不直接用 UIUX/测试结论替代自身判断 |

- UIUX 结论只作独立验收的**输入证据**；测试结论同理。独立验收标准必须先于 Phase 5 交付固定；5B 后由独立验收判断。UIUX 不签最终验收、不批准发布/部署。
- 若 UIUX needs-work 与测试 pass 冲突，按设计基线列证据交 PM/独立验收；不以测试计数覆盖视觉/可访问性缺陷，也不以 UIUX 结论否定行为测试。
- Phase 5 证据不覆盖真实模型/网络、Windows/DPI/屏读时，必须在 UIUX/测试/验收中列 missing-evidence；不能用 macOS 离线结果冒充。

## 七、5A/5B 执行与门

### 7.1 5A（对照与准备）

1. 固定候选/入口/构建/环境身份；旧入口仍为生产默认。
2. 建立旧入口 1360/960（+200% 适用）关键面快照与 computed/keyboard 基线；完成 A–L 场景清单与 fixture。
3. 对新入口 dev/构建候选做预审：关键面/200% 风险、审计模板、证据目录、差异台账；不作为最终 pass。
4. 产出本计划 + 场景/证据清单；若发现基线/入口/夹具不明确，停手回 PM。
5. 5A 门通过前不得删除旧渲染器/vendor/旧测试；5A 旧快照必须可供 5B 对照。

### 7.2 5B（切换与最终审计）

1. 生产入口切换/打包候选就绪后，记录最终候选身份；旧入口已按测试 5A 快照保留证据。
2. 执行 A–L 三档审计；200% 逐容器/头部/报告/预览/树；所有 P0/P1 复测。
3. 旧新对照与差异台账完成；检查无演示标记、无第二设计源、CSP/打包下无视觉降级。
4. 输出 UIUX 最终设计对齐结论（pass/needs-work/missing-evidence）与 findings/evidence manifest；不代替独立验收。
5. 5B 门/Phase 5 由 PM/测试/独立验收按 §16.3/§16.5 判断；UIUX 不宣称最终完成。

### 7.3 进入/退出条件

- **进入 5A**：旧入口稳定可跑；测试 5A 快照计划/夹具可用；本计划批准；审计环境/截图/计算样式工具可用。
- **进入 5B**：5A 门通过；旧快照/差异清单/打包候选就绪；PM 授权切换；旧渲染器尚未删除或已按计划保留证据。
- **退出 5B**：A–L 覆盖、P0/P1 清零、允许差异登记、200% 目标面通过、manifest/findings 完整；否则 needs-work/missing-evidence，不得写 pass。

## 八、风险与限制

- 真实 Electron/打包候选与 dev 预览可能有字体/缩放/GPU 差异；以最终 packaged 候选为准，dev 只预审。
- 200% 用 `setZoomFactor(2)` 与 OS/DPI 200% 不等价；不可测时列 missing-evidence，不用普通档代替。
- Windows/DPI/屏读/真实模型/网络/`.env` 不在本计划默认覆盖；由验收标准决定是否另列 missing-evidence。
- 旧入口浅色/旧密度与 Nova 不是像素回归；只对结构/文案/状态/可达/阅读保持做对照；颜色/字体差异登记为已批准。
- 截图/计算样式只能证明所截状态；长文/虚拟滚动/极端窗口需补滚动位置/末行/多状态证据。
- UIUX 审计不改变实现；发现需属主修复后按同一场景/档位复测；不复测不写 pass。

## 九、交付清单

- 本计划：`2026-10-21_design_ui-platform-phase5-visual-audit-plan.md`。
- 5A：旧入口基线截图/computed/keyboard 清单、场景/fixture/差异模板、新入口预审记录。
- 5B：新入口三档截图、computed/keyboard、200% 目标面、旧新对照/差异台账、findings、manifest、最终设计对齐结论。
- 结论格式：逐项 pass/needs-work/missing-evidence；P0/P1/P2；证据路径；不代替独立验收/发布。

---
id: desktop-uiux-design-alignment
type: fix
title: 按 UI/UX v2 设计对齐桌面视觉与骨架（差异调查与实施）
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: implemented-unverified
related: [desktop-uiux-reacceptance, ans-uiux-interaction-v1, product-ui-reacceptance, uiux-rework-acceptance]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户「按照 UI设计来改」授权下，记录实测差异清单与对齐方案
  - date: "2026-10-13"
    kind: implemented
    summary: 逐项对齐实施完成；两档实测、定向 62/62、uiux-v2 76 项、IME 与 typecheck 通过；独立复核待PM
  - date: "2026-10-13"
    kind: blocked
    summary: 既有 main.mjs 的 DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS 检查在基线同样报红（非本改动回归），该脚本尾部场景待属主修复
---

# 界面上看着不一样的地方，逐项量出来、按设计改

客户看过当前实现与 v2 设计后原话：「这个和设计还是有差别啊，你让桌面按照 UI设计来改，改完了让UI，和产品复核。」本派发即实施授权。本文是**差异调查与实施记录**：先用离线夹具把当前界面在两档窗口量出实数（rect 与计算样式），逐项对照设计规范（[v2 设计说明](../../../UIUX设计师/docs/design/2026-10-13_design_ans-uiux-interaction-v1.md)）与原型内联 CSS（[v2 原型](../../../UIUX设计师/docs/design/2026-10-13_design_ans-uiux-prototype-v1.html)，并把它载入 Electron 实测），列出「现状值 vs 设计值」，再按设计对齐。

范围只做「按设计对齐」：不改行为、不新增面板、不动后台 busy/SessionEvent/IPC/src/边界/构建配置。R1–R5 返工项、IME、虚拟行锚点、撤回、24 小时诊断、停止保队列、图片/草稿全部保持不回退。规范文字与原型冲突处：语义以规范为准、视觉取值以原型为准；无法两全的（如原型文字小按钮 vs R2 的 28px 可点区）保留后出且更具体的 R2 口径，如实登记。

## 差异清单（1360×860 与 960×620 两档实测）

证据：本角色离线测量夹具（真实 renderer/preload、受控 IPC、虚构 ROOT，见下方命令）两档 report.json 与截图；原型同法载入实测。以下「现状」为两档实际值，「设计」为规范表格或原型实测值。

### 骨架与列宽

| # | 项 | 现状（实测） | 设计（规范/原型实测） | 处置 |
| --- | --- | --- | --- | --- |
| V1 | 聊天头高 | 60.37px（padding 8px 20px 9px；标题 14px/600） | 66px（padding 16px 26px 11px；标题 15px/650；说明 11px、标题下、无图标；960 档 padding 14px 24px） | 对齐 |
| V2 | 边界说明位置/形态 | 12px、右侧对齐、带笔图标 | 11–12px（原型 11px）、标题下、左对齐、纯文字 | 对齐（去图标、改位置字号） |
| V3 | composer 区高 | 85px（padding 12px 28px 16px；胶囊 48px） | 100px（padding 20px 28px 22px；胶囊 52px；960 档左右 24px） | 对齐 |
| V4 | 聊天滚动区 | padding 24px 28px（两档同） | 28px 30px；960 档 24px | 对齐 |
| V5 | 聊天主内容列 | 无 760px 列；消息左贴 28px、逐条限宽 | 最大 760px 居中（.conversation，margin auto） | 对齐（.chat-pane 居中限宽） |
| V6 | 抽屉底边 | 对齐 composer 上边（动态）✓ top 36 ✓ 宽 360 ✓ | 宽 360、top 36、底与 composer 上边对齐 | 一致（保持动态避让，不复制 100px） |
| V7 | 标题栏 36px、左栏 272px | ✓ | ✓ | 一致 |

### 颜色

| # | 项 | 现状 | 设计 | 处置 |
| --- | --- | --- | --- | --- |
| V8 | 主文字/次级/细线 | #1F1F1F / #6B6B6B / #E8E8E6 | #242624 / #737773 / #E5E7E3 | 对齐（令牌） |
| V9 | 抽屉底 | #FAFAFA | #FCFCFA（border-left #DCE1D5） | 对齐 |
| V10 | hover/选中底 | #F0F0EE / #ECECEA | #EEEFEB / #E8EBE4 | 对齐（令牌） |
| V11 | 用户气泡底 | #F0F0EE | #F0F2ED | 对齐 |
| V12 | 异常卡 | 四边 1px #F6D3CF 圆角 8、底 #FEF3F2、标题 #B42318 | 无全框；左侧 3px #B16452 竖条；底 #FCF5F2；标题 #964035；目标行 mono 11px #73625D | 对齐 |
| V13 | 未决卡 | 中性灰底 #FAFAFA、四边 1px #DCDCDA | 浅暖底 #FBFAF5、边框 #DDD6C5、左 3px #A99060、padding 15px、13px | 对齐 |
| V14 | 发送钮底 | #1F1F1F | #262A24（≈新 --text #242624） | 对齐（随令牌） |

### 字号/行高/圆角/间距

| # | 项 | 现状 | 设计 | 处置 |
| --- | --- | --- | --- | --- |
| V15 | 正文 | 13.5px/1.65（22.275px） | 14px/1.9（26.6px） | 对齐 |
| V16 | 助手段落/列表间距 | p 8px；ul 8px/22px | p 14px；ul margin 4px 0 18px、padding-left 20px | 对齐 |
| V17 | 标题（助手内） | h3 15px、margin 14px 0 6px | h3 14px/650、margin 21px 0 7px；行内 code 12px 底 #F1F3EE | 对齐（h1–h3 21/7、h1/h2 15px） |
| V18 | 用户气泡 | 圆角 8px、padding 9px 13px、max-width min(680,86%) | 圆角 14px 14px 3px 14px、padding 11px 17px、max-width 88% | 对齐 |
| V19 | 记录组容器 | 无左边线、无缩进 | border-left 2px #E1E6DD、padding-left 13px | 对齐 |
| V20 | 记录组 summary | 默认 ▶ 三角、行高 18.6px、计数同色同号 | '›' 18px #8D9387（open 旋转 90°）、行高 26px、计数 11px #91978B | 对齐 |
| V21 | 记录行 | grid 两列（内容+状态）、无时间、padding 6px 0、下边框 | grid 42px 时间+内容+状态、padding 8px 0、上细线 #EFF1EB、11px、op mono #5F6859、目标 mono #888F80、状态 10px #738469（未知 #87602B） | 对齐（补时间列） |

### 组件形态

| # | 项 | 现状 | 设计（原型实测） | 处置 |
| --- | --- | --- | --- | --- |
| V22 | 切换/导入项目按钮 | 深色实心主按钮（32px） | 白底描边 #D7DAD3、圆角 6、padding 7px、13px 居中 | 对齐 |
| V23 | 项目名行 | 无（只显示路径，mono 11.5px） | 名称 14px/600 + 路径 11px 次级（sans） | 对齐（名称=路径末段，纯展示派生） |
| V24 | 侧栏角色行 | padding 7px 10px、圆角 6、名称 13px/500、状态 10.5px | padding 12px 10px、圆角 7、名称 13px/650、状态 11px + 色点 | 部分对齐（间距/字重/字号；徽标与状态字形是客户裁定保留项，见「保留」） |
| V25 | 侧栏标签 | 「项目」13px/600；「角色」11.5px #9A9A9A | 12px/600；caption 11px 次级 | 对齐 |
| V26 | 抽屉头 | padding 0 14px、标题 13px/600、无下边线、关闭钮 13px 文本 | padding 0 20px、标题 14px/650、下边线 1px、关闭钮 30×28 圆角 5 | 对齐 |
| V27 | 抽屉内容 | #right-body padding 6px 0；组头 13px/500 padding 11px 16px；下边线 | padding 20px；组 = 上边线 1px、summary 12px/600 padding 12px 0、'›' 18px #A2A895、正文 padding 11px 0 2px 21px、12px/1.85 #606B56 | 对齐 |
| V28 | 资料正文框 | 白底+1px 边框+圆角的卡片盒 | 无盒（纯文字流）；pre 11px/1.7 底 #F0F2EB 无边框 | 对齐（去盒；保留 380px 内滚作为长文容器） |
| V29 | 待办「当前工作」块 | 无左边线、meta mono 11px | 左 2px #8F9B82 竖条 + padding-left 12px；meta 10px #7F8878 | 对齐竖条与缩进；meta 字号按 R2 口径 11–12px 取 11px |
| V30 | 待办全文块 | 底 #FAFAFA、1px 边框、圆角 6、padding 6px 8px、11.5px | 底 #F0F3EC、无边框无圆角、padding 10px、12px/1.85、margin-top 10px | 对齐 |
| V31 | 队列动作按钮 | 描边药丸、28px 高、12px | 下划线文字按钮 11px（20px） | 保持 R2（28px 可点区是后出且更具体的返工口径） |
| V32 | Pi 字段 | label mono 11.5px；输入高 30px、圆角 6；路径为纯文本；提示 12px；机密标签 10.5px 药丸 | label 11px #717B68；输入 padding 9px 10px、圆角 5、边框 #DCE1D5、12px mono、字色 #47513F；路径为 10px/1.7 底块 #F3F5EF；提示 11px/1.85 #737C68；机密 9px 底 #ECEFE6 圆角 3；保存行 gap 11 margin-top 16；齐备态 #768966 | 对齐 |
| V33 | Pi「高级」/资料收纳箭头 | 分离的 svg 箭头、11.5px 次级标题 | 统一 '›'（18px #A2A895，open 旋转）；资源 summary 12px/600 | 对齐（「收纳用同一种小箭头」） |
| V34 | 输入胶囊 | 圆角 999 ✓ 但高 48、padding 6px 8px、gap 6、底 #FAFAFA、边框 #E8E8E6 | 高 52、padding 8px 10px 8px 14px、gap 12、底 #FAFBF9、边框 #E2E5DE、圆角 30px；textarea 13px/24px | 对齐 |
| V35 | 图片钮 | 32×32 圆形透明 | 30×28 圆角 5、色 #6B7069 | 对齐 |
| V36 | 停止钮 | 32×32 圆形描边浅底 | 30×30 圆形次级（无强描边） | 对齐尺寸与观感（保留 999px 圆与 --bg-soft 底——P0-2 钉） |
| V37 | 标题栏图标簇 | 26×24 圆角 6、激活底 #FAFAFA、角标 9px 底 #1F1F1F | 30×28 圆角 5、色 #6B7069、激活底 #E3E7DF、角标 10px/15px 底 #3F4B3C、2px 底栏描边 | 对齐 |
| V38 | 焦点/hover | 各自 box-shadow 环、hover #F0F0EE | 统一 `outline 2px #42745E offset 3`；hover 底 #EEEFEB | 对齐（窗口边缘钮保留内嵌环，边缘裁切原因，见「保留」） |
| V39 | 未决卡按钮 | 确认=深色 32px 圆角 6；不同意=幽灵文字钮 | 确认=#292D27 圆角 5 padding 6px 12px；不同意=白底描边 #D8DCD2 圆角 5 | 对齐 |
| V40 | 执行记录入口与答复间距 | 记录与答复间距 16px（统一 gap） | 至少 16px（R1 口径） | 一致（保持统一 gap；原型 12/22 的纵向 margin 会破坏虚拟行总高，以统一 gap 表达，登记） |

## 已确认一致（如实记录，不改造）

- 标题栏 36px、左栏 272px、抽屉 360px 宽 / top 36px / 底边与 composer 上边对齐（动态避让，此前的明确口径）。
- 用户消息右对齐、助手左对齐的对话格局；异常浅红底 + 文字原因；未决卡浅暖底 + 明确按钮的语义方向。
- 「查看执行记录」折叠入口、异常就地内联、未知状态诚实（R1–R5 成果，本轮只换皮不动语义）。
- 队列位次 24px+8px、动作 ≥28px（R2 口径，见 V31/V29 注）。

## 保留（与原型不同是有意的，均有后出裁定）

1. **定位入口**（V-保留）：原型在聊天头右侧的琥珀小字 `.pending-link`；实现是聊天流内 sticky 药丸（R5 后出裁定：靠未覆盖聊天左侧、原生 button、先收抽屉再定位）。保持不变。
2. **队列动作按钮**（V31）：R2 明确「点击区域至少 28px 高、文字 12px」> 原型 11px 小字。
3. **侧栏徽标与状态字形**（V24）：主入口/内置徽标、状态图标+短标签是客户逐轮裁定保留的（「用户对边界无感」「已恢复」语义等）；只对齐间距/字号/色值。
4. **窗口按钮**（V38 例外）：窗口边缘裁切，保留内嵌焦点环；原型此处是演示符号，不逐字对齐。
5. **sidebar 底部「演示项目 · 本地数据」**：原型演示页专属，非产品元素，不实现。

## 交回 PM（本次不实施）

- **S1 助手说话人行（.speaker）**：原型在回复前有角色名小字行（12px/650 #626A5F、margin-bottom 12px）；实现无此行。它是**新的流内元素**，会进入回放行模型（行数/锚点/`replayPlan` 纯函数）——超出「按设计对齐」的确定性范围，且规范正文未提及（仅原型有）。是否需要、放在哪一层，请 PM/设计澄清后再做。
- **S2 队列纵向节奏**：原型记录组 margin 12px 0 22px、用户消息 margin-bottom 30px；实现是统一 gap 16px。行级 margin 会破坏虚拟行总高（模型按 offsetHeight 计高），若设计坚持逐段间距需先改行模型计量口径。当前以统一 16px 表达，登记为已知差异。
- **S3 原型焦点环绿 #42745E**：不在规范取色表（只有背景/文字/细线/语义色），本轮按原型采用；若设计认为应改用中性色，请裁定。
- 上一轮已交回的事项不重复登记（`uiux-reacceptance` 的 R1–R5 已完成；O1–O4 未纳入）。

## 实施写集

- `app/renderer/styles.css`（主）：令牌、骨架、消息、记录组、异常卡、未决卡、侧栏、抽屉、Pi 表单、标题栏图标簇、焦点/hover。
- `app/renderer/renderer.js`：写入说明去图标；记录行补时间列与未知态类；异常行去图标保留文字；项目名派生。
- `app/renderer/index.html`：`#project-name` 元素；导入按钮换类（去 btn-primary）。
- `test/桌面应用/`：更新受影响钉；新增两档测量夹具 `e2e/uiux-design-audit.mjs` 与原型测量 `e2e/uiux-prototype-measure.mjs`（均为只读测量，不改页面）。

不改：main/preload/session-history/IPC/busy/src/构建配置；渲染进程仍不接触 fs/Node；无第二份边界判断。

## 验证计划

1. 定向单测：`node --test test/桌面应用/session-history.test.ts test/桌面应用/tool-rows.test.ts test/桌面应用/renderer.test.ts test/桌面应用/hot-path.test.ts test/桌面应用/markdown.test.ts`；`npm run typecheck`；JS 语法检查；`git diff --check`。
2. 离线受控测量（两档 1360×860 / 960×620）：关键 rect 与设计值一致（聊天头 66、composer 100、胶囊 52、抽屉 360/底边对齐 composer、正文 14/26.6、会话列 760 居中）；`right-body`/`.app`/`body` clientWidth==scrollWidth 无横向溢出；键盘与状态路径回归由既有 e2e 脚本（`uiux-v2.mjs`、`main.mjs`、`ime-enter.mjs`）覆盖。
3. 截图自查留本角色目录；对外验收截图由 PM 在同一冻结候选上统一采集。

## 实际完成与验证（2026-10-13 实施）

实施如上「实施写集」；差异清单 V1–V40 除「保留/交回PM」各项外全部对齐，两档实测复核：

- 骨架：聊天头 **66.0px**（两档）、composer 区 **100px**、胶囊 **52px**（含 960 档 padding 14px 24px 13px 恰得 66/100——原型 960 档同值）、聊天滚动区 28/30（960 档 24）、抽屉 360px / top 36 / 底边=composer 上边（动态）。
- 会话列：`.chat-pane` 最大 **760px** 居中（1360 档 x=431、960 档铺满 630），用户气泡右下 3px 小圆角、高 45.09px（与原型实测 45.0938 一致）、底 `#F0F2ED`；助手正文 14px/26.6px 满列。
- 记录组：左细线 2px `#E1E6DD` + 13px 缩进、'›' 箭头（open 旋转）、summary 行高 26、计数 11px `#91978B`、行 grid **42px 时间 + 内容 + 状态**（与原型 42/643/40 逐列一致）、未知状态琥珀色。
- 异常卡：`#FCF5F2` 底 + 左 3px `#B16452` 竖条、标题 `#964035`、目标行 mono 11px `#73625D`（摘要去图标）。
- 未决卡：`#FBFAF5` 底 + `#DDD6C5` 边框 + 左 3px `#A99060`、padding 15px、13px；确认=深色圆角 5、不同意=白底描边（R3/R5 断言不变）。
- 侧栏：白底描边「导入/切换项目」（37px 高）、项目名（路径末段）+ 路径、角色行 12px 内边距/圆角 7/名称 650；选中底 `#E8EBE4`。
- 抽屉：底 `#FCFCFA`、头 padding 0 20（标题 14/650、下细线）、正文 20px 内边距、资料组上细线 + '›' + 21px 缩进 + 无卡片盒。
- Pi：label 11px、输入 39.8px 高（与原型 39.7969 同）、路径底块、提示 11px `#737C68`、机密标签 9px、保存行 34px 高、齐备态 `#768966`。
- composer：textarea 13px/24px、图片钮 30×28、发送 32 圆形 `var(--text)`、停止 30px（P0-2 钉的 999px 圆与 `--bg-soft` 底保留）。
- 焦点：统一 `outline 2px #42745E offset 3px`（按钮/摘要/输入/文本域；窗口边缘钮保留内嵌环）；hover 底 `#EEEFEB`。
- 溢出：两档 `body/.app/root scrollWidth==clientWidth`；960 档抽屉内 Pi 输入右缘 936≤960、面板 clientW==scrollW（349）。
- 顺带修正的既有小缺陷：`.attach-row` 的 `[hidden]` 被 `display:flex` 压掉，空附件行白占 8px（现补 `[hidden]{display:none}`，composer 高度因此精确到 100）。

### 测试与检查

- 定向单测：`node --test test/桌面应用/session-history.test.ts test/桌面应用/tool-rows.test.ts test/桌面应用/renderer.test.ts test/桌面应用/hot-path.test.ts test/桌面应用/markdown.test.ts` → **62 pass / 0 fail**（renderer 单独 41/41）。
- `npm run typecheck` → **0 错**；`node --check app/renderer/renderer.js` 通过；CSS 花括号配平；`git diff --check` 干净。
- 既有离线 e2e `uiux-v2.mjs`（真实 renderer/preload + 受控 IPC）→ **UIUX_V2_PASS 76**（几何/键盘/撤回/虚拟行/未决全过）。
- IME 回归 `ime-enter.mjs`（`ANS_IME_VISIBLE=1`）→ **E2E_DONE=1**，组合/229/鼠标选词/发送钮全过。
- 全量 `main.mjs`：**与基线（HEAD 7457da4 未含本改动、stash 后复跑）逐项零差异**（两轮各 258 条日志、键值与顺序完全一致）；两轮都在既有检查 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 处如实报错截至（`renderer.viewport` 诊断未发出——S-1 段的事件在工具行瘦身后不再产生 ≥150 行窗口化 pane；**基线同样红**，非本改动回归，属既有缺陷，建议 PM 另派属主修场景）。该检查之后约 60 行（mac 重开等）两轮同样未跑。
- 两档离线测量：见下「证据」。

### 证据

- 自查两档测量与截图（含 report.json 全量 rect/样式）：`角色卡/桌面应用/docs/fix/2026-10-13-design-alignment-selfcheck/`（A/B/C 六张图 + report.json；`prototype-report.json` 为原型同法实测对照；`uiux-v2-76-report.json`、`ime-report.txt` 为既有脚本报告）。
- 测量夹具：`test/桌面应用/e2e/uiux-design-audit.mjs`（两档 A 主界面/B 角色抽屉/C Pi 抽屉，记录关键组件 rect 与计算样式）；`test/桌面应用/e2e/uiux-prototype-measure.mjs`（把 v2 原型 HTML 载入 Electron 实测同项，只读）。对外验收截图由 PM 在同一冻结候选上统一采集。

## 冻结指纹（2026-10-13 候选）

| 文件 | SHA-256 |
| --- | --- |
| app/renderer/renderer.js | 187d6c0073cd910b74d62f52e44c44ed79ba8247e2c0b306bf06971924795908 |
| app/renderer/styles.css | 69b2ea0272361b18cdea29cc9e9fad695afb41ddfc8f3670bbec9ca2824d17f9 |
| app/renderer/index.html | 9b542de1eeb80259310b564193982e873b1127518aef897a99aa1a598e00aac4 |
| test/桌面应用/e2e/uiux-design-audit.mjs | 9a804242b5622336568b0b0486fb7dd520f43a41313733778fd0971d6ed9aa3f |
| test/桌面应用/e2e/uiux-prototype-measure.mjs | 36e0b856da1337b615d0eb18a0d72f4c99d58764668171facfc867c0b6bf1fe3 |

`app/renderer/tool-rows.js`、`app/renderer/ui-labels.js` 未改（指纹与上一冻结一致：`9ffda4bf…`、`9f344ebf…`）；main/preload/session-history/IPC/busy/src/构建配置未改。上一候选的渲染源码指纹已失效（改动即失效）。提交与推送由项目管理在 UI/产品复核通过后统一执行；本角色未提交、未推送。

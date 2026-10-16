---
id: visual-convergence-v3-implementation-deskui
type: fix
title: 视觉收敛 v3 实施（间距密度 / 系统行去前缀 / 工具相位合并 / chip 对齐与尾行去重 / SVG 弧线转轮）
created: "2026-10-16"
timezone: Asia/Shanghai
status: implemented
related: [visual-convergence-v3-uiux, role-watchdog-and-closure, visual-convergence-uiux]
---

# 视觉收敛 v3 实施记录（桌面UI）

## 0. 批准与范围

客户 2026-10-16 指示原文「**按推荐批准，开始实施**」；批准裁定（只做这些，逐条对照设计文档
`角色卡/UIUX设计师/docs/design/2026-10-16_design_visual-convergence-v3.md`）：

| 批准项 | 内容 | 本记录落点 |
| --- | --- | --- |
| ① | W1–W6 按**默认档**数值（16px 行距 / 10px 段距 / 28px 空输入框） | §1 |
| ② | W7 正文行高**不动**（维持 15px/1.8） | §1（反向守卫） |
| ③ | W6b 系统行去重前缀（文本级；判据不改） | §1 |
| ④ | S1 工具调用相位合并 | §2 |
| ⑤ | S2/S3（chip 对齐阅读列 / 尾行状态词去重） | §2 |
| ⑥ | W9–W11 **SVG 弧线转轮**方案（含 reduced-motion 静止弧） | §3 |
| ⑦ | 「等待确认卡零动效、不打字光标」**长期约束**（照做，勿引入违例动效） | §3 尾、§5 |

**未在批准清单、未实施**：W8（空态/侧栏「尚未导入项目」×2 文案去重）——设计 §二(a) 提议项但批准只列
①–⑦，本批零触碰，待客户明确后再行（不夹带）。
**§二(c) 明确不动部分零触碰**：标题栏/会话头/阅读列宽/字号色板/圆角焦点环/恢复卡与 shell 卡结构/
抽屉模态/op-request 卡样式与语义/队列来源标签/系统行实线+左竖条/is-replay/拒绝失败以文字呈现——未改。

## 1. 快速赢 W1–W6 / W6b（`app/renderer/styles.css` + `tool-rows.js`/`renderer.js` 一个文本点）

数值与落点（全部为批准档；「落点」= 实际编辑处）：

| 编号 | 实施值 | 落点 |
| --- | --- | --- |
| W1 | `.chat-pane { max-width:800px; gap:16px; }`（24→16） | styles.css v2 布局块 |
| W2 | `.msg p { margin: 0 0 10px; }`；`.msg h1,h2,h3 { margin: 16px 0 6px; }`（14→10；21/7→16/6） | styles.css Markdown 块 |
| W3 | `.msg-user { padding:9px 14px; line-height:24px; }`（12/16、1.8→9/14、24px；单行气泡 51→42px） | styles.css v2 布局块 |
| W4 | `.composer { padding:14px 32px 12px; }`；`.capsule { padding:10px 14px; gap:6px; }`；`.capsule textarea { min-height:28px; }`；`.compose-note { margin:6px auto 0; }`；≤1100 档同步 `14px 24px 12px` | styles.css 输入区块 + 媒体查询 |
| W5 | `.tool-records > summary { line-height:22px; }`；`.tool-activity { padding:5px 0; }`；`:first-of-type { margin-top:6px; }` | styles.css 执行记录组 |
| W6 | `.msg-injected .mi-body { line-height:1.6; }`（1.8→1.6；盒高 71.9→68.9px） | styles.css 注入行块 |
| W6b | `tool-rows.js::classifySystemMessage` 返回新增 `displayBody`（剥 `[系统·<子类>] ` 文首标记与随附空白；`body` 原文与判据**不动**）；`renderer.js::buildInjectedElement` 取 `displayBody`（缺省回退 `body`——回交/派发不受影响） | tool-rows.js + renderer.js |

autoGrow 无 JS 改动（按新 min-height 自然生效；空框实测 28px）。W4 窄档口径：≤1100 媒体查询上下随基础档
（14/12）、横向保留窄档 24px；`max-height:720px` 的短屏收敛（12/10）为既有响应式行为，未动。

## 2. 结构级 S1–S4（S4 随 S1 同批）

**S1 相位合并（终态为准；未返回时显示「调用发起」）**：
- `tool-rows.js` 新增纯函数 `mergePhases(items)`：同一 `toolCallId`（带 turnId 时同 turn）的「调用发起 + 结果」
  并入一行的**下标映射** `[{index: 首相位下标, phases: [各相位下标·到达序]}]`；无 callId 不并（缺一不发明身份）；
  不同 callId 永远各占一行（**不折叠重复调用**——只合并同一次调用的两相位）；行序 = 首相位位置。
  **`data.items` 本体与身份不动**——token→行映射、回放锚点、行高缓存、`data-legacy-index` 物化全部照旧。
- `renderer.js::fillActivities` 按映射渲染合并行：时间/工具名/目标**以终态为准**（目标空回退首相位）；行态 =
  各相位标签链（`调用发起 → 状态未记录` 等，含「· 旧文本分类」逐相位标注）；任一相位 unknown ⇒ `is-unknown`。
  各相位的「查看已保存的安全详情」折叠 details 按下标逐个保留（**各相位信息可展开**）。
  合并行携带 `data-activity-index`（首相位，捕获口径不变）与 `data-activity-phases`（恢复兜底选择器）。

**S4 组摘要口径**：`tool-rows.js::callSummary(items)` = `{calls, exceptional, unknown}`（纯计数）；摘要文案
`查看执行记录 <N> 个调用`（原「N 条活动」）+ 异常补「· 异常 M」（含异常相位的行数）+ 未知照旧
「· 含状态未记录」——**失败/未知在折叠摘要仍可见**（失败另有其文字行照旧在流内，拒绝/失败纪律未动）。

**S2 chip 对齐阅读列**：`#chat > .op-chip { margin-left: calc((100% - min(800px, 100%)) / 2); }`（仅定位规则；
随列宽自适应，窄档归零随列同走；卡样式与遮挡取舍不变）。1360 档实测 chip.x 240→**384**，与 `.chat-pane`
左缘 **diff = 0px**（验收 ≤8px；设计推算值 384±4 命中）。

**S3 尾行状态词去重**：`renderer.js::renderCurrentWork` 以 `opChipShown()`（chip 实际在屏可见性——唯一写方
`updateOpChip`）为判据——**chip 可见 ⇒ 不渲染「等待你确认」尾行**（同屏状态四重变三重，F4 的 B2 消除）；
**「正在工作」保留**（且带 W10 转轮）；**无 chip 时状态词仍兜底**（含全量回放把 chip 元素清出 #chat 的既有
路径——回放后尾行如实回落到「等待你确认」）。`updateOpChip` 三个出口（非 viewing / 无请求 / 可见）均回呼
`renderCurrentWork`（两处刷新点同源联动，防状态漂移）；并修正一处历史缺陷：**后台角色的刷新不再顺手隐藏
正在显示中的 chip**（chip 只承载「当前查看角色」的状态，非 viewing 不动它）。

## 3. 运行状态反馈 W9–W11（SVG 弧线转轮，全应用唯一一枚）

- **图源单点**：`role-status.js::SPINNER_SVG` = `viewBox="0 0 12 12"`、`width/height=12`、`circle cx=6 cy=6
  r=4.6`、`fill:none`、`stroke:currentColor`、`stroke-width:1.5`、`stroke-linecap:round`、
  `stroke-dasharray="21.7 7.2"`（约 270° 弧）、`class="spin-arc"`、`aria-hidden`。颜色走现行状态规则
  （**不新增颜色**）；静止时弧线本身可读为「运行中」。
- **W9 侧栏工作徽标**：`BADGES.working.iconHtml = SPINNER_SVG`；`statusBadge` 结果带 `iconHtml`；
  `renderer.js::statusBadgeHtml` 以 `(badge.iconHtml || esc(badge.icon))` 单点决胜（iconHtml 为编译期常量、
  非外部输入；其余态照旧 esc 文本字形）。**实现落在映射/渲染单点**——不做 DOM 注入（左树重绘会抹掉注入）。
  徽标盒 12px 见方（旧 ◐ 字形盒 9.2px）。
- **W10 尾行「正在工作」**：文本前加同款 12px 转轮（`.tool-current` 改 flex 布局；**行高 26.6px 不变**；
  文案不新造词）。重复刷新不重写 innerHTML（不打断旋转帧）。
- **W11 开会话 loading**：`sysRow(pane, "sys-loading", St.SPINNER_SVG, …)`；**边框转轮 `.spinner`（spin 0.8s）
  整体退役**——全应用只有一种转轮。
- **动效**：`@keyframes v3spin` + 恰两条动画规则（`.ti-status.st-working .ts-ico .spin-arc`；
  `.tool-current .spin-arc, .sys-loading .spin-arc`）——`0.9s linear infinite`、`transform: rotate`（合成，
  非布局动画）、`transform-origin: 50% 50%`。`prefers-reduced-motion` 由**既有全局规则**兜底
  （duration 0.001ms、iteration 1 ⇒ 静止弧）——CDP 实测 `1e-06s` / `1`。
- **长期约束⑦（照做）**：等待确认卡/恢复卡/op-chip/流式正文**零新增动效**——e2e 断言 chip `animation-name:
  none`、确认卡至多允许既有「定位一次性高亮」`op-flash`（1 迭代、无计时器，**非忙碌动效**）；不给正文加打字
  光标，无全局跑马灯/骨架屏。

## 4. 验收（设计 §二(d) 同源口径；e2e 夹具 `test/桌面应用/e2e/uiux-design-audit.mjs` 新增 v3 段）

夹具：真实 renderer/preload + 受控 IPC，1360×860 同一转录滚到底（回放密度转录；chip/系统行同构 UIUX
audit-v3 密度段），`v3` 段 30 断言**全过**（`AUDIT_DONE`，失败即非零退出）；数值全量入
`audit-report.json`（v3.measures）与截图 `v3-after-*.png`（均在本目录 evidence 子目录）。

### 12 条设计数值断言（逐条结果）

| # | 断言 | 结果 | 实测 |
| --- | --- | --- | --- |
| 1 | `.chat-pane` gap = 16±1px（现 24） | ✅ | `16px` |
| 2 | 助手 p margin = 10±1；h3 纵值 16/6（现 14 / 21/7） | ✅ | `0px 0px 10px`；`16px 0px 6px` |
| 3 | 单行用户气泡 ≤44px（现 51） | ✅ | `42px`（pad 9/14、lh 24） |
| 4 | 输入区总高 ≤140px、空输入框 ≤30px（现 165.6 / 40） | ✅ | `137.6px` / `28px`（pad 14/32/12） |
| 5 | 转录总高 ≤850px（现 945） | ✅ | `789.2px` |
| 6 | 完整可见行 ≥9（现 7） | ✅ | `9`（视口 614.4px） |
| 7 | 工具活动行 ≤48px（现 53.1） | ✅ | 每行 `47.1px`（max=avg） |
| 8 | 960 与 1360 两档 `bodyScrollW ==` 视口宽 | ✅ | 1360=1360、960=960 |
| 9 | working 徽标 12px±1 SVG；动画 v3spin、周期 0.9±0.2s（现 9.2 字形/无动画） | ✅ | 盒宽 `12`、svg css 12×12、`v3spin 0.9s` |
| 10 | 尾行行高 26.6±2px 不因图标增加、含转轮且动画生效 | ✅ | `26.6px`、含 `.spin-arc`、`v3spin 0.9s` |
| 11 | 开会话 loading 使用同一枚 SVG 转轮（全应用无第二实现） | ✅ | `svg` + `v3spin 0.9s`；`.spinner` 元素 0 个 |
| 12 | reduced-motion（CDP）转轮 duration ≤0.01s 且 iteration ≤1（静止弧可辨） | ✅ | `1e-06s`、`1` |

结构级追加（同夹具）：
- **S1**：展开组 4 相位 → **2 个调用**（合并行同时含「调用发起」「状态未记录」）；合并行高 47.1 ≤48；展开组总高
  `94.2px ≤ 0.6×现状 212.4px(=127.44)`；组折叠时摘要含「2 个调用 · 含状态未记录」且失败文字行可见；**截断**：超长无路径目标瘦身后 `…` 截断标记在合并行如实可见（单调用单行附验）。
- **S2**：chip 左缘 x=384、pane 左缘 x=384、**diff 0 ≤8px**（截图 `v3-after-chip-align-1360.png`）。
- **S3**：chip 可见 ⇒ 无 `.tool-current`；无 chip（回放重建后）⇒ 尾行「等待你确认」兜底（两条路径均断言）。
- 附验：W6b 系统行 chip「系统消息 · 看护」、正文 `投递排队积压：…`（无重复前缀）；W6 盒内行高 24px（1.6）。

### 截图前后对照（after 在本目录；before/对照基准 = UIUX v3 证据的 canonical 截图）

| after（本批实测） | 对照 before |
| --- | --- |
| `v3-after-density-bottom-1360.png` | `v3-density-bottom-1360.png` / `v3-sim-bottom-1360.png` |
| `v3-after-density-records-1360.png` | `v3-density-records-1360.png` / `v3-sim-records-1360.png` |
| `v3-after-960.png` | `v3-chat-960.png` / `v3-sim-960.png` |
| `v3-after-sidebar-1360.png` / `v3-after-tail-1360.png` / `v3-after-loading-1360.png` / `v3-after-rm-sidebar-1360.png` | `ind-before-sidebar-1360.png` / `ind-before-tail-1360.png` / `ind-before-loading-1360.png` / `ind-rm-sidebar-1360.png` |
| `v3-after-chip-align-1360.png` | `v3-chat-bottom-1360.png`（chip x 240→384） |

### 测试与全套回归（本批运行记录）

- 边界内单测 `node --test`（4 文件）：**87/87 过**（renderer 52 / tool-rows 18 / markdown+runtime-ui 17）。
- 离线 Electron e2e（uiux-v2.mjs 全家族）：**默认台 99**、**DUP 32**、**G2 5**、**COMPLETE_FLOW 41**、
  **VISUAL 36**、**RUNTIME 16**、**GHOST 9**——全过；`ime-enter` E2E_DONE 全 true；`bench-storm` BENCH_DONE
  （渲染热路径/2000 行回放无退化迹象）；`uiux-prototype-measure` 正常完成（原型只读口径）。
- `npm run typecheck`：**全仓 0 错**。
- v3 验收段（uiux-design-audit.mjs）：**30/30 断言过**（上表 + S1–S3 + W6b/W6 + 零动效 + 兜底态 + 截断附验）。

### 已批准范围内的 v2 断言修订（旧值 → 新值，理由=S1/S3/S4；不为变绿放松——是批准的口径变更）

| 文件·断言 | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| uiux-v2 `one canonical lifecycle <tool>` ×9 | 工具名文本出现 `i<4?2:1` 次 | 一律 `1` 次 | S1：活动组工具也合并为一行（相位标签保留在内） |
| uiux-v2 `normal tools live history share phase identities` | `.tool-activity` 行数 =2 | =1 且行内含「调用发起」「执行完成」 | S1：同调用两相位并一行（身份/标签逐条保留） |
| uiux-v2 `unknown is honest count` | 摘要含「3 条活动」 | 含「3 个调用」 | S4：口径词由活动改调用（3 条无 callId 事件各成一行，计数不变） |
| uiux-v2 `open pending supersedes true busy` | 尾行文本=「等待你确认」 | chip 可见 && 无尾行 && busy 真实 | S3：chip 承载该状态，尾行让位 |
| uiux-v2 `pending arrival preserves drawer` | 尾行文本=「等待你确认」 | 抽屉在开 && chip 可见 && 无尾行 | S3：同上 |

v2「基线修订」性质（设计 §二(e) 提示的最主要风险）：24px 行距、14px 段距、40px 输入框均为 v2 按既有验收值
签署的样式；本批按客户批准**有意收紧**为新基线——旧 v2 截图对照断言（若有 24px 类数值钉）不再适用；本批
可对照的 v2 数值断言仅上述 5 处（已更新），其余 v2 断言（结构/交互/文案）零改动。renderer.test.ts 新增 4 组
v3 源码守卫（含 W7 反向钉：`.msg` 15px/1.8 不动；`.spinner` 退役反转钉；v3spin 恰两条规则钉）。

## 5. 回滚

- 全部改动 = 4 个 `app/renderer/` 文件 + 4 个 `test/桌面应用/` 文件（本批未动其它任何文件；无数据、无 IPC
  契约、无主进程改动）。
- **单批整体回滚**：还原上述 8 个文件即可回到 v2 基线（渲染为纯展示层，无持久化状态）。
- 分项回滚粒度：W1–W6/W6b = styles.css 相应规则 + displayBody 两点；S1/S4 = tool-rows 两个纯函数 +
  fillActivities 渲染段；S2 = 一条 margin 规则；S3 = renderCurrentWork/updateOpChip 三点；W9–W11 = 图源常量
  + iconHtml 决胜点 + 两条动画规则 + loading 行一处。回滚无数据影响。

## 6. 跨边界发现（只读定位，未改；请 PM 路由）

1. **桌面窗口 e2e `test/桌面应用/e2e/main.mjs`（非本角色文件）**：
   - **本批新增一处将失效**：`ROLE_STATE_BADGE_HAS_ICON`（断言 `.ti-ico` 的 `textContent.length>=1`）——working
     徽标现在是纯 SVG（无文本），需改为检查 `.ts-ico svg.spin-arc` 存在（读取方式建议 `.querySelector`）。
   - **既有红（与 HEAD 渲染器语义过期，非本批引入；本批运行实测）**：badge 早已只挂 `#tab-work`
     （index.html/`renderTabs` 在 HEAD 即如此）而 main.mjs 仍查 `#tab-card .tab-badge` →
     `BADGE_ON_CARD_WHILE_COLLAPSED=false`，并在 `document.querySelector('#tab-card .tab-badge').hidden` 处
     空指针崩溃（`E2E_ERROR=Script failed to execute`，流程终止于第 6 节）；此前另有 `SU_WRITE_NOTE_IN_HEADER`/
     `CHAT_HEAD_NO_BUTTONS`/`QUEUE_*`/`RIGHT_HAS_TODO_SECTION` 等 12 处 =false——均属右栏/队列/横栏改版后的
     过期断言。**桌面窗口侧需按现状同步自检台**；本角色未触碰 tab 徽标/右栏路径（diff 可查）。
2. **工作概览队列条目里的 `[系统·<子类>]` 前缀仍在**（该文本来自主进程 summaries 原文，W2 语义）：批准的
   W6b 只覆盖「系统行正文」，队列条目未动——若后续要一并去重，属主进程/编排文案层（O1）或另行批准。
3. **既有行为备忘（非缺陷声明）**：会话历史**全量回放**会重建 pane 并清空 `#chat` 子节点，op-chip 元素随之
   离场、直到下一次 `updateOpChip`（请求到达/作答/切角色）复位；期间尾行按 S3 兜底显示「等待你确认」。本批
   未改该行为（改动会越出批准面）。
4. **字体/macOS**：无新增依赖；转轮为内联 SVG，无 vendor 变更。

## 7. 文件与指纹（sha256 前 8 位）

| 文件 | 指纹 |
| --- | --- |
| `app/renderer/role-status.js` | `ba3051c8` |
| `app/renderer/tool-rows.js` | `3f851983` |
| `app/renderer/renderer.js` | `0d704b44` |
| `app/renderer/styles.css` | `7f83b2bc` |
| `test/桌面应用/tool-rows.test.ts` | `a0915e71` |
| `test/桌面应用/renderer.test.ts` | `74630b45` |
| `test/桌面应用/e2e/uiux-v2.mjs` | `08aa1845` |
| `test/桌面应用/e2e/uiux-design-audit.mjs` | `9d1b05c9` |

证据目录：`docs/fix/2026-10-16-visual-convergence-v3-evidence/`（v3-after-*.png 截图 + `audit-report.json`
全量测量与逐条断言结果）。运行命令与关键输出：
`ANS_UIUX_OUTDIR=<d> node_modules/.bin/electron test/桌面应用/e2e/uiux-design-audit.mjs` → `AUDIT_DONE`
（v3.results 30/30；副作用：该夹具顶部区段的本期 A/B/C 测量与 v3 测量同 report）。

---
id: desktop-ui-toolrow-turn-collapse
type: fix
title: 工具行折叠（客户批准口径）：运行中逐条实时、轮结束折叠成一行「本轮 N 个调用：…（含未放行/失败）」
created: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [kanban-fixes-pm-review, visual-convergence-v3-implementation]
events:
  - date: "2026-10-16"
    kind: created
    summary: 客户批准工具行折叠口径（PM 落实登记），属主桌面UI；本角色按派发实施（渲染侧 app/renderer/** 及其测试与 e2e）
  - date: "2026-10-16"
    kind: implemented
    summary: tool-rows.js callSummary 拆分（denied/failed/tools）+ renderer.js 折叠行文案/开合状态机/settled 折叠/未放行相位并入组行；边界单测 88/88、TOOLFOLD e2e 19 项 + 全家族回归全过、typecheck 全仓 0 错；独立验证与真机 E2E 交测试角色
---

# 工具行折叠（桌面UI）：运行中实时、settle 后折叠成一行

## 0. 批准依据与口径原文

- 客户批准口径（2026-10-16 定稿，登记＝`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §伴随项）：

  > **工具行折叠（客户批准口径，2026-10-16 定稿）**：同一轮内连续工具行、**轮结束后折叠成一行**（「▸ 本轮 N 个调用：role_status / run_shell ×5 / …」）；**运行中不折叠**（实时可见）；点击展开为逐条一行完整列表（每条自身详情折叠保留，信息零丢失）；**折叠态显式标出未放行/失败调用**（如"含 1 条未放行"）。

- 派发时机（客户/PM）：v1.2.0 CI 触发之后实施（避免混入已冻结的发布 overlay）。本批只动 `app/renderer/**` 与 `test/桌面应用/**`（本角色边界），零 IPC/主进程/构建改动。
- 口径细节由本角色定并写明（见 §1.4）；无 UIUX 复核需求（本批为既有「执行记录组」文案与开合时机的收敛，风格沿 v3 已验证的组样式）。

## 1. 实施（只动本角色边界内文件）

### 1.1 `app/renderer/tool-rows.js`（`callSummary` 口径修订）

`callSummary(items)` 返回 **`{calls, denied, failed, unknown, tools}`**（纯计数，不改变任何条目事实）：

| 字段 | 口径 |
| --- | --- |
| `calls` | 调用数（`mergePhases` 行数）——「N 个调用」，沿 S4 |
| `tools` | 按**调用行**的工具分解 `[{name, count}]`（首现序；名字取终态相位、空回退首相位、再空为「工具」）——「a / b ×k / c」 |
| `denied` | 含**未放行**相位（`status==="denied"`）的行数 |
| `failed` | 含**失败或超时终止**相位（`failed`/`timed-out`）的行数；同一行两类相位皆有 ⇒ **未放行优先**（一笔调用只进一类） |
| `unknown` | 任一条目状态未记录（沿既有「· 含状态未记录」如实计数） |

旧 `exceptional` 计数按批准口径**拆分为 denied/failed**（客户端文案就是这两类）；拆分判据仍在 tool-rows 单点（`status` 事实），渲染侧不另判。

### 1.2 `app/renderer/renderer.js`（折叠行文案 / 开合状态机 / settled 折叠 / 未放行相位并入）

- **折叠行文案**（`foldSummaryText`，`fillActivities` 一处渲染）：
  `本轮 N 个调用：a / b ×k / c` +（仅计数 >0 时）` · 含 X 条未放行`、` · 含 Y 条失败`、` · 含状态未记录`。
  例：`本轮 2 个调用：role_status / run_shell · 含 1 条未放行`（截图见 §3）。全部数字经 `Tr.callSummary` 单点；`□`→ 文案无「查看执行记录」固定头（客户定稿格式即「▸ 本轮 …」，▸ 为既有 chevron）。
  CSS：`.record-count` 去 `margin-left:10px`（现为首个子元素），加 `min-width:0; overflow-wrap:anywhere`（长分解可换行不溢出）。
- **未放行/失败相位并入组行**（appendActivity 的 exceptional 分支）：相位属**同一次调用的相位**——该调用（同轮同 callId）已有行在本组时，相位并入组行（S1 相位合并的完整形态：折叠行如实计「含 N 条未放行/失败」），组**不**因此切断（同轮后续调用仍并入同一条折叠行）；**独立未放行行照旧直显且不折叠**（治理信号：原因与允许路径全量呈现，纪律未动）。无法关联（无 callId / 组内无该调用）⇒ 维持原行为（切断组 + 独立行）。
- **开合状态机**（`groupManualOpen` / `groupDefaultOpen` / `syncGroupOpen` / `foldTurnGroups`）：
  - **默认态**：`live 到达 && turnId 非空 && 该轮未 settled && 本角色 `roleBusy`===true` ⇒ **展开**（逐条实时；与流式 Markdown 同族判据）；回放/无轮次身份/已 settled ⇒ **折叠**。
  - **settled 折叠**：`settled` 事件到达 ⇒ 该轮所有仍展开的组收为折叠一行（`foldTurnGroups`）。**批内推迟**：settle 经事件批处理——批内折叠会撞「spacer 未落定」的中间态（阅读锚点恢复偏 6px）且收缩尾段会令 `appendTurnTerminal` 的贴底判定误读「在底部」而强制贴底（离线 e2e 首跑实测）；改在 `flushBatchSideEffects` 收尾（贴底/窗口落定之后）落地——**无计时器**（renderer 无计时器纪律，六处既有守卫钉住，本批未破）。
  - **手动开合优先并在会话内保持**：用户对某组点开/收起记入既有 `activityOpen[roleId][组 id]`；此后默认态（含 settled 折叠）**不再覆盖**该组（读过的人不被自动收起）；**键盘焦点在组内时不收**（自动动作不吞焦点）。
  - **锚点语义**：折叠＝与手动开合**同序**（先翻 `data.open`/`el.open`，再 `captureChatReading`，再实测+恢复）——文档中部阅读态**零位移**（<2px，与既有 toggleDrift 标准同款，实测 150→150→150）；尾部阅读态（锚点下方不足一屏）按下限夹取自然移动 ≤20px 且**不逐次累积**（物理边界：任何文档尾收缩同此）；组自身作锚时锚组行首（折叠一行形态）。
- **键盘可达性/aria**：沿既有标准——组为原生 `<details>/<summary>`（Tab 可达、Enter/Space 开合、可访问名=摘要文本），本批未引入自定义键盘路径。

### 1.3 分组依据＝turnId（连续工具行）

保持既有 `rl.activityGroup` 语义：**同一轮内连续**的普通工具行并成一組（`data.items` 本体/身份/回放锚点/行高缓存全部不动）；卡片（`request_*`/display 生命周期行等屏障行）、助手行、关联不上的未放行行打断即另起一组。带 display 的工具（生命周期行 `.tool-call-record`）**不并入本折叠**——它们本就是「逐条一行（每条自身详情折叠保留）」形态（与 F-8-b 分类共存），本批零触碰。

### 1.4 口径细则（本角色定义，交回口径的一部分）

| # | 细则 | 取值 |
| --- | --- | --- |
| 1 | 折叠行精确文案 | `本轮 N 个调用：a / b ×k / c` + ` · 含 X 条未放行` / ` · 含 Y 条失败` / ` · 含状态未记录`（在计数 >0 时按此顺序逐条追加；工具名按首现序、`×k` 仅 k>1；超时终止并入「失败」） |
| 2 | 默认态 | 折叠（见 1.2 默认开合判据）；**运行中默认展开** |
| 3 | 展开状态会话内保持 | 手动开合记 `activityOpen`（组 id 稳定——回放重建/前缀插入后同 id 仍生效，既有机制），优先于一切默认态；焦点在组内不收 |
| 4 | 窗口化交互 | 折叠/展开走既有 `refreshActivityHeight`（实测重算 + prefix 失效 + 阅读锚点恢复）——挂载中折叠保锚点、视窗外（已脱挂）折叠只改 `data.open`、挂回以折叠态构建；settled 折叠在批尾（贴底/窗口落定后）落地，不撞中间态 |
| 5 | 未放行/失败归属 | 相位并入「同轮同 callId 的组行」并计「含 N 条」；独立未放行行**永不折叠**（治理信号）；无法关联的例外维持独立行+断组（不发明身份） |
| 6 | 「本轮」的粒度 | 组=同轮连续段；轮内被打断（卡片/助手行）可有多条折叠行，每行仍以「本轮」标记轮属（其 N/分解只计本段内的调用） |

## 2. 测试与验证（本机实测，2026-10-16）

| 命令 | 结果 |
| --- | --- |
| `node --test test/桌面应用/tool-rows.test.ts` | **18/18**（S4/折叠口径用例重写：`{calls,denied,failed,unknown,tools}` 全等 + 未放行/失败拆分（含优先级）+ 工具分解 + 空表） |
| `node --test test/桌面应用/renderer.test.ts` | **53/53**（v3/W6b+S1/S4 守卫按新口径修订并加固：折叠文案/分解/状态机/assoc 单点接线逐条钉） |
| `node --test test/桌面应用/markdown.test.ts test/桌面应用/runtime-ui.test.ts` | **17/17** |
| 新增段 `ANS_TOOLFOLD_UI_ONLY=1 … electron test/桌面应用/e2e/uiux-v2.mjs` | **TOOLFOLD_UI_PASS 19**（见表下清单） |
| uiux-v2 全家族回归 | 默认台 **99**、DUP **32**、COMPLETE_FLOW **41**、VISUAL **36**、G2 **5**、DELIVERY_NOTE **9**、RUNTIME **16**、MERGE **12**、CONFIG **20**、SELECTOR **26**、PROJECT_RESET **7**、FRESH_CONTEXT **4**、ROLE_FOCUS **11**、TERMINAL **10**、SEND_FACTS **8**、TERMINAL_MERGE **12**——全过 |
| `ime-enter.mjs` / `bench-storm.mjs` / `uiux-design-audit.mjs` / `uiux-prototype-measure.mjs` | IME exit 0 全过；BENCH_DONE；审计 **30/30**（v3 段全过，measures 实测新文案 `本轮 2 个调用：run_shell / read_file · 含状态未记录`）；PROTO_MEASURE_DONE |
| `npm run typecheck` | **全仓 0 错** |

TOOLFOLD e2e 段（19 项，含截图）：运行中逐条实时（组展开、行可见）/摘要带分解与「含 1 条未放行」/未放行相位并入行「调用发起 → 已拒绝」且组不切断、独立未放行行直显 → settled 折叠（摘要不变）/展开**零丢失**（行下标、相位、文本逐条全等）→ 手动收起在运行中与 settled 后均被尊重 + 摘要照常更新 → 失败相位标「含 1 条失败」→ 文档中部阅读态折叠锚点零位移（150→150→150）、尾部态位移有界且不累积 → 视窗外（脱挂）折叠后挂回仍折叠、摘要正确。

### 已批准范围内的旧断言修订（旧 → 新，理由＝批准的口径变更；断言强度不降）

| 文件·断言 | 旧 | 新 | 理由 |
| --- | --- | --- | --- |
| `tool-rows.test.ts` S4 `callSummary` ×3 | `{calls, exceptional, unknown}` 全等 | `{calls, denied, failed, unknown, tools}` 全等（含未放行优先与分解用例） | 口径拆分/分解，字段替换后**逐类全等** |
| `renderer.test.ts` 守卫 `' · 异常 ' + sum.exceptional` | 钉旧异常文案 | 改钉 `' · 含 ' + sum.denied + ' 条未放行'` / `sum.failed` + 折叠起头 + `syncGroupOpen`/`foldTurnGroups`/assoc 接线（净增 8 条，唯一删除项为被替换文案） | 同上 |
| `uiux-v2.mjs` `one canonical lifecycle <tool>` ×9 | 工具名文本恰 1 次 | 并入工具组者：文本 2 次（行 1 + 组摘要分解 1）**且** `.tool-activity` 恰 1 行含该名 + 摘要含该名（更强）；生命周期/屏障类照旧 1 次 | 折叠行现在**必含**工具名分解（批准格式），纯文本计数不再可判「恰一行」；改为按行断言 |

不为让测试变绿放松：本条以外零断言改动；默认台/全家族回归全过。

## 3. 截图（证据目录）

`docs/fix/2026-10-16-toolrow-turn-collapse-evidence/`（`TOOLFOLD_UI_PASS 19` 当轮 report.json 同目录）：

| 文件 | 内容 |
| --- | --- |
| `toolfold-1-running-1360.png` | 运行中：组展开、逐条实时；摘要「▾ 本轮 2 个调用：role_status / run_shell · 含 1 条未放行」；未放行行直显 |
| `toolfold-2-folded-1360.png` | settled：折叠一行「▸ 本轮 2 个调用：role_status / run_shell · 含 1 条未放行」+ 未放行行仍在 |
| `toolfold-3-expanded-1360.png` | 用户展开：逐条行恢复（零丢失断言同刻） |
| `toolfold-4-windowed-fold-1360.png` | 长转录（205 行）挂载态折叠（锚点断言同刻） |
| `toolfold-5-offscreen-settled-1360.png` | 视窗外折叠 → 滚回后已折叠态挂载 |
| `report.json` | TOOLFOLD 段 19 项逐条结果（当轮） |
| `audit-report-v3.json` | 设计审计 v3 段 30/30（measures 实测新文案「本轮 2 个调用：run_shell / read_file · 含状态未记录」） |

## 4. 回滚

- 全部改动 = `app/renderer/` 3 文件（tool-rows.js / renderer.js / styles.css）+ `test/桌面应用/` 3 文件（tool-rows.test.ts / renderer.test.ts / uiux-v2.mjs）+ 本目录文档；**无 IPC/主进程/构建/数据改动**。
- **单批整体回滚**：还原上述 6 个文件即回 v1.2.0/v3 基线（另需还原本批的 3 处旧断言——见 §2 修订表与新断言清单）。
- 分项回滚粒度：① 文案+计数 = tool-rows.js `callSummary` 与新 `foldSummaryText` + styles 一条；② 开合状态机 = renderer.js 四个助手 + 三处接线（创建/追加/appendActivity exceptional 分支/settled 挂点 + `flushBatchSideEffects` 一行）；③ e2e/单测按文件回退。回滚无持久化状态影响（`activityOpen` 是会话内内存态）。

## 5. 边界与纪律

- 渲染进程无第二份判定：本批只动呈现（文案/开合/相位归并），未触任何「能否写/能否跑」判定；未放行的事实来源仍是门禁/适配器事件。
- 治理信号纪律未动：拒绝行全量呈现（原因+允许路径）、失败直显；本批只保证「折叠行如实标出」且不吞行。
- 未 git 提交；未碰其它角色文件与发布/证据目录；真机 E2E 与独立验证按 PM 安排交测试角色。

## 6. 跨边界发现（只读定位，未改；请 PM 路由）

1. **带 display 的执行事实行（`.tool-call-record` 生命周期行）不在本次折叠面**：真机 pi 流经 display 投影后多数结果行走该形态（本就「逐条一行+自身折叠详情」），而折叠面覆盖的是 displayless 组行（含 su 真机轮中被客户看到的「查看执行记录」形态）。若客户后续要求连生命周期行也按轮折叠，属行模型级改造（`rl.toolLifecycles`/锚点/就地更新均在引用），建议单独提案——本批按「最小安全方案」未动。
2. **批内 settle 布局中间态为通用问题**（非本批引入）：任何在事件批内做高度变更的呈现动作都会撞「spacer 未落定 + 批内贴底判定」——本批以「批尾挂点」规避（`flushBatchSideEffects` 一行挂钩）。若后续其它特性需批内改高度，建议复用该挂点而不是计时器。

## 7. 文件与指纹（sha256 前 8 位）

| 文件 | 指纹 |
| --- | --- |
| `app/renderer/tool-rows.js` | `2fd2335f` |
| `app/renderer/renderer.js` | `27d72e8e` |
| `app/renderer/styles.css` | `7cf067d4` |
| `test/桌面应用/tool-rows.test.ts` | `a599d1da` |
| `test/桌面应用/renderer.test.ts` | `db80beee` |
| `test/桌面应用/e2e/uiux-v2.mjs` | `0a1439de` |

证据目录：`docs/fix/2026-10-16-toolrow-turn-collapse-evidence/`。
运行命令：`ANS_TOOLFOLD_UI_ONLY=1 ANS_UIUX_OUTDIR=<d> node_modules/.bin/electron test/桌面应用/e2e/uiux-v2.mjs` → `TOOLFOLD_UI_PASS 19`。

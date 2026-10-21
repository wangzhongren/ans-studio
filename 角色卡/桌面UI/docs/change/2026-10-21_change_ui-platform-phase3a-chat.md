---
id: ui-platform-phase3a-chat
type: change
title: UI 平台化 Phase 3A：聊天流核心迁移（真实 listing/会话/历史/虚拟窗口/工具行/状态/IME）
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented-unverified
related: [ui-platform-round, ui-platform-round-review, ui-contract-surface, ui-platform-phase2-shell]
events:
  - date: "2026-10-21"
    kind: created
    summary: 按 Phase 3A 派发把新渲染器的聊天流核心接上真实 IPC：项目/角色树、会话/历史、事件路由、虚拟窗口、工具行、状态、Markdown 与 IME 最小发送
  - date: "2026-10-21"
    kind: implemented
    summary: typecheck/build 通过；ime 新入口 24/24；bench 新入口跑通；新纯逻辑测试 15/15；旧基线 679/679；Electron 冒烟 16/16
  - date: "2026-10-21"
    kind: fixed
    summary: 按旧 tool-rows/工具组段补齐工具相位合并、连续组、运行中展开/轮末折叠/手动保持与失败/拒绝直显；uiux-v2 默认段前 8 项通过，第 9 项为工作概览 3B/4 缺口
  - date: "2026-10-21"
    kind: fixed
    summary: 按 UIUX Phase 3A 评审 7 项必须补齐 Markdown 排版、回放/受阻态、工具时间/超时色/chevron、choice 可点性、虚拟状态保持、空态 CTA 与 sys-config 危险色；新增 Phase 3A2 冒烟与四张截图
  - date: "2026-10-21"
    kind: optimized
    summary: 归因并修复 bench 热路径回归：大折叠工具组延迟挂载、ChatRowView memo、活动项原地追加；3 轮交替 bench stormA 中位 17.7ms（旧 23.3ms），stormB ≤19.8ms
  - date: "2026-10-21"
    kind: registered
    summary: 按 PM §10.4 在契约面登记 DEFER_TOOL_ROWS_WHEN_CLOSED=40 唯一 DOM 例外，并用 Electron 验证闭合 60 调用组内部行 0→展开后 60 行挂载
---

# 聊天流核心迁移：旧渲染器不动，新渲染器接真实通道

Phase 3A 把新 React 渲染器从「骨架」推进到「能看真实会话」：真实项目/角色树、会话开启、历史回放、实时事件路由、虚拟窗口、Markdown、工具行、状态徽标与输入区最小发送链路。**旧渲染器（`app/renderer/index.html` + 7 个经典脚本）保持不动**，仍是生产入口；本轮只写 `app/renderer/`、`test/桌面UI/`、三个 e2e 文件的目标切换与 `角色卡/桌面UI/`。

## 范围与文件

| 位置 | 改动 |
| --- | --- |
| `app/renderer/src/chat/types.ts` | 行/事件/listing/role metadata 类型（纯类型） |
| `app/renderer/src/chat/row-model.ts` | 虚拟行模型（≥150 行窗口化、prefix/spacer、preferTail/preferIndex、`rowModelDebug` 同义 debug） |
| `app/renderer/src/chat/replay.ts` | 回放 skip/append/full + 行签名 + 实时去重 |
| `app/renderer/src/chat/status.ts` | 角色状态优先级与徽标（等待确认 > 工作中 > 错误 > 空闲/已停止/已恢复/未开启） |
| `app/renderer/src/chat/events.ts` | 信封路由、事件→行、工具事实（timedOut/exitCode/failed/blocked）、注入/系统通知分类、历史行映射 |
| `app/renderer/src/chat/tool-summary.ts` | 工具相位合并（同轮同 callId）、「本轮 N 个调用」折叠摘要、未放行/失败/状态未记录计数（纯函数） |
| `app/renderer/src/chat/markdown.ts` | npm markdown-it 15.0.3 受控封装（html:false、链接白名单、图片原文、表格、`.md-pre`/`.md-lang`）；`window.ANSMarkdown` 供 bench |
| `app/renderer/src/chat/ChatStream.tsx`、`VirtualPane.tsx`、`ChatRow.tsx` | 中栏容器、虚拟 pane、行渲染；工具组按连续工具行成组、相位并成一行、运行中展开/轮末折叠/手动开合保持；拒绝/失败直显 `.sys-denied` |
| `app/renderer/src/chat/chat-store.ts` | 真实 listing/会话/历史/事件/角色状态投影；每角色 RowModel；pending history；工具组状态机（settled 折叠、手动开合跨虚拟卸载/整段回放保持）；operator 最小卡与锚点 |
| `app/renderer/src/chat/ipc.ts` | 订阅 session:event(s)/role-state/history/project:changed/operator-request/expired/queued；recovery-state/ready |
| `app/renderer/src/chat/role-view.ts` | 角色显示名/副标题/左树分组（主入口/治理职能/工作角色） |
| `app/renderer/src/demo-data.ts`（删除） | Phase 2 的 demo 角色数据在真实 listing 接入后不再使用，移除以免第二数据源 |
| `app/renderer/src/shell/Sidebar.tsx` | 真实项目/角色树、分组、状态徽标、roving tabindex/↑↓/Home/End、导入/切换项目、真实角色计数 |
| `app/renderer/src/shell/ChatHeader.tsx`、`Composer.tsx`、`Drawer.tsx`、`App.tsx` | 真实会话头/上下文状态；选中角色时不重复副标题；输入区常驻写入语义（实际写入导入项目，越界被拒）；非受控 textarea + Enter/Shift+Enter/IME + sendSession + pickImage 最小附件；抽屉真实角色名；App 安装 runtime/ChatStream |
| `app/renderer/src/test-driver.ts` | 3A 驱动：`loadProject/refreshProject/refreshLiveRoles/selectRole/selectRuntime/rowModelDebug/paneDebug/onRoleState/onOperatorExpired/onOperatorQueued/appendOperatorRequest/queuedDebug`；未实现列表 |
| `app/renderer/src/shell/shell.css` | 聊天行/工具行/系统行/回执/operator/树分组/附件等样式（全部令牌） |
| `test/桌面UI/*.test.ts` | 新纯逻辑单测 4 文件 **18 例**（行模型/回放/状态/事件路由 + 工具相位合并/折叠摘要/目标提取） |
| `test/桌面应用/e2e/uiux-v2.mjs`、`ime-enter.mjs`、`bench-storm.mjs` | **仅**加 `ANS_RENDERER_ENTRY` 目标切换（默认旧入口；断言未改/未弱化） |
| `角色卡/桌面UI/docs/feature/ui-contract-surface.md` | 三态表更新（#6–#28） |
| **未改** | 旧渲染器核心 `index.html`/`renderer.js`/`styles.css`/7 个经典脚本；`app/main.ts`、`app/preload.cjs`、`app/desktop/`；根 `package.json`/`package-lock.json`/`vite.config.ts`/`tsconfig.json`/`.gitignore`；其他角色目录；无新增依赖 |

## 与旧实现的对应关系

### 行模型与虚拟窗口
- 旧：`rowListFor`/`registerRow`/`updateVirtualWindow`（`VIRT_MIN_ROWS=150`、`VIRT_BUFFER=30`、`rowFootprint=rect.height+paneRowGap`、spacer 记账、`preferTail`/`preferIndex`、scheduled scroll）。
- 新：`RowModel` 纯类保存 `{height}` 与 prefix/spacer 计算；`VirtualPane` 只挂载视口 ±30 行，上/下 `.virt-spacer` 撑高；行包裹 `.chat-row` 的实测高度（含 16px 行距 padding）回写模型；`rowModelDebug` 返回 `{count,lastIndex,operators,rowGap:16}`。
- 口径：`rowGap` 统一 16（`.chat-row` padding-bottom；`.chat-pane` gap 0），避免旧 flex gap 与 footprint 的二次记账。

### 回放与实时去重
- 旧：`replayPlan`（skip/append/full）+ `replayKey/canonicalKey` 计数；`pendingHistories` 项目不符时寄存。
- 新：`planReplay(previousSignatures,nextSignatures)`；`rowSignature` 是 `kind/turnId/eventKind/text/at`；`eventKey` 是 `turnId/kind/source/text`；历史已有 key 的非终态事件跳过，终态/工具身份不吞；项目不符的历史进入 `pendingHistories`，`loadProject` 匹配后回放。
- 回放 full 在 pane 首部加 `.sys-replay-divider`（「会话记录已恢复」），历史行带 `is-replay` 淡化类；增量只追加新行；完全相同 skip。

### 事件路由与行类型
- 旧：`appendEvent` 单发/批量、`deliverRuntimePayload` 按 runtime/project/role 过滤、`appendOneEvent` 分发到 8 类行。
- 新：`normalizeEnvelopes` 接受单信封/数组；`envelopeMatches` 校验 projectRoot/runtime/roleId；`describeEvent` 映射：
  - `message` + `detail.source=prompt-input` → user（含 `[派发]`/`[系统·]` 注入分类）；
  - `message` 其他 → assistant（即时 Markdown）；
  - `tool_call/accepted` + `detail.display` → tool-lifecycle；无 display → activities 组（失败/超时相位另直显 `.sys-denied`）；
  - `denied` → `.sys-denied`（工具拒绝带摘要/目标；非工具终态如实为 `.sys-call` 系统事实，不伪造目标）；
  - `settled`（completed/failed/aborted/timed_out）→ `.turn-terminal`，否则 `.sys-settled`；
  - `handback` → `.msg-handback`（报告摘要/证据折叠）；
  - operator request/choice 由 `onOperatorRequest`/driver 进入 `.op-request`，按 `toolCallId` 锚点插入工具行之后。
- 工具组（对齐旧 `tool-rows.js` + `renderer.js` 工具组段）：
  - 分组 = **同一轮内连续的工具行**；助手/系统/卡片/无法关联的未放行行切断组；
  - 同一 `turnId + callId` 的发起/结果/未放行相位并成**一行**（`mergePhases`），折叠摘要为「本轮 N 个调用：a / b ×k」+「· 含 X 条未放行」+「· 含 Y 条失败」+「· 含状态未记录」；
  - 默认开合：仅「实时、有轮次身份、该轮未 settle、角色 busy」展开；settled 到达折叠未手动动过的组；手动开合在会话内保持（虚拟行卸载/整段回放按稳定组 id 恢复）；
  - **失败/未放行始终直显 `.sys-denied`**（详情默认折叠），摘要显示目标路径；无目标如实「目标未记录」；同一调用已在组内时相位仍并入组行、组不切断。
- 工具事实：`timedOut` → 「超时终止」；`exitCode≠0` → 「已执行完成（退出码 N）」；`failed` → 「执行失败」；`denied` → 行内「已拒绝」/摘要「含 N 条未放行」；`phase start/call` → 行内「调用发起」；`result` 有 completed/ok → 「执行完成」，无信号 → 「状态未记录」；目标取 `detail.display.target`/`detail.target|path|file_path|command`/`args.*`/已知失败摘要，不拿正文猜。

### 状态
- 旧 `role-status.js`：`awaitingConfirm > working(busy/queue) > error > …`。
- 新 `status.ts` 同优先级；`ChatStream[data-state]` 为 `busy ? run : error ? err : idle`（工作中优先于上一轮错误），树徽标同一派生；operator 未决 → 「等待你确认」。

### Markdown
- 使用 npm `markdown-it@15.0.3`（与 vendor 同版本，安全升级已定稿）；`html:false`、`validateLink` http/https/mailto、`rel=noopener noreferrer`、`md-link`、图片原文、表格、`.md-pre`/`.md-lang`、唯一 `esc`。`window.ANSMarkdown` 供 bench-storm。
- 助手消息到达即 Markdown（完整消息语义）；用户手输气泡同样 Markdown；系统/工具文本走 `esc`。

### 会话与输入
- `loadProject` → `app:list-project`；`selectRole` → `session:open` + `session:history-get`；订阅 `session:history`/`session:event(s)`/`session:role-state`/`project:changed`；`getRecoveryState` 恢复 project/runtime/role 后 `recovery:ready`（按 preload 实际方法名）。
- 输入区：非受控 `<textarea>`（DOM value 唯一文本源，兼容旧 e2e 直接写 value）；Enter 发送、Shift+Enter 换行；`compositionstart/end` + `isComposing` + `keyCode 229` 三重保护；发送调 `sendSession(text,images,target,metadata)`，本地追加用户气泡并按 `clientMessageId` 去重回显；`pickImage` 附件 chip 最小链路；停止/双开关仍禁用（3B/4）。

## 门禁命令与真实输出

| 命令/检查 | 结果 |
| --- | --- |
| `npm run typecheck:renderer` | 通过（0 错） |
| `npm run build:renderer` | 通过；`dist/src/index.html` 583B + JS 708,778B（gzip 235,651B）+ CSS 75,520B（gzip 13,964B） |
| CSP 扫描 | 产物仅 1 个外部 module script；0 内联脚本/`<style>`/`style=`/`unsafe-*` |
| gzip 预算（level 9） | JS 235,651B + CSS 13,964B + HTML 402B = **250,017B** ≤300KB |
| `ANS_RENDERER_ENTRY=<dist/src/index.html> electron test/桌面应用/e2e/ime-enter.mjs` | **24/24 检查全 true，exit 0，E2E_DONE=1**（组合/229/Shift+Enter/附件载荷） |
| `ANS_RENDERER_ENTRY=<dist/src/index.html> ANS_UIUX_OUTDIR=... electron test/桌面应用/e2e/uiux-v2.mjs` | 默认段**前 8 项 true**（工具组 2 组折叠/拒绝直显 missing.md/助手原文/写入语义/拒绝目标与 unknown 计数）；**第 9 项**「one independent work list without duplicated role documents」未过——工作概览/队列抽屉属 3B/4 缺口，如实退出 1 |
| `ANS_TOOLFOLD_UI_ONLY=1 ... uiux-v2.mjs` | 工具折叠段**前 12 项 true**（运行中展开、轮末折叠、手动保持、失败直显、窗口化离屏折叠）；第 13 项「tail fold movement bounded…」未过——尾部折叠阅读锚点位移仍超界，虚拟行锚点精修留 3B/5 |
| `ANS_RENDERER_ENTRY=... BENCH_OUT=... electron test/桌面应用/e2e/bench-storm.mjs` | **BENCH_DONE=1（优化后同机 3 轮交替）**：stormA 17.7 / 21.3 / 17.6ms，stormB 19.8 / 18.9 / 17.2ms；handler max ≤0.3ms，batch ≤0.2–0.4ms；replay 5.9 / 2.1 / 2.7ms；scroll 7.3 / 0.5 / 6.3ms。同轮旧基线：stormA 26 / 23.3 / 17.5ms（中位 23.3），stormB 17.6 / 17.7 / 17.6ms；handler max 9.5 / 10.6 / 5.2ms；replay 17.5 / 9.7 / 20.9ms；scroll 20.6 / 13.7 / 12.8ms。另 3 轮优化后独立跑：17.6/17.7/17.6 与 17.8/17.7/17.7。目标 ≤25ms 达成；stormB 中位较旧 +1.3ms（≤19.8ms，帧抖动范围内） |
| `node --test test/桌面UI/*.test.ts` | **18/18 通过**（行模型/回放/状态/事件路由 + 工具相位合并/折叠摘要/目标提取） |
| `node --test test/桌面应用/*.test.ts` | **679/679 通过，exit 0**（旧渲染器基线，本轮旧渲染器零 diff） |
| Phase 3A2 真实 Electron `file://` 冒烟 | **12 组行为断言全 true、0 console、0 did-fail-load**：标题 15/15/14 与 16/6 margin、列表 4/18/20、引用、表头 `--card` 实底/6×10/强底线/外框、`.is-replay` opacity .88、blocked 左 3px danger、工具真实时间与 timed-out danger、折叠摘要异常色、chevron、choice 40px 可点区/selected/accent/`--input` 中性边、虚拟卸载重挂保持（组/推理/回交/choice 选中）、CTA 实心 primary、`sys-config` danger |
| `git diff --check` | exit 0 |

证据目录：
- `角色卡/桌面UI/docs/change/2026-10-21-phase3a-evidence/`：`electron-smoke/report.{json,txt}`、`electron-phase3a.png`、`ime-new-entry-report.txt`、`bench-new-entry.json`、`uiux-v2-new-entry-report.json`
- `角色卡/桌面UI/docs/change/2026-10-21-phase3a2-evidence/`：`electron-smoke/report.{json,txt}` + `chat-1360.png`/`chat-960.png`/`choice-1360.png`/`choice-960.png`；`ime-new-entry-report.txt`；`bench-new-entry{,-r2}.json`；`bench-opt/`（3 轮交替 old/new、优化后 3 轮、`profile-final.json`、`trace-final.json`、`profiling-summary.json`、`profile-before-optimization.json`）；`defer-tool-rows-verify.{json,log}`；`uiux-v2-new-entry-report.json`；`uiux-v2-toolfold-report.json`（含运行日志）

## UIUX Phase 3A 评审 7 项必须（Phase 3A2 修正）

| # | 评审项 | 修正与实测 |
| --- | --- | --- |
| 1 | Markdown 排版 | `.msg h1/h2/h3` 15/15/14、margin 16/6、h4–h6 13.5；`ul/ol` margin 4/18、padding-left 20；blockquote 2px 强线；表格外框 1px `--border-strong`、表头 `--card` 实底 + 强底线、cell 6×10、12.5/1.5；p margin 10。冒烟实测全部 token 值一致 |
| 2 | 回放/受阻 | `.is-replay{opacity:.88}`；`.msg-handback.is-blocked` 左侧 3px `--danger`（其余边 `--danger-border`）。冒烟实测 opacity .88、left 3px rgb(201,122,109) |
| 3 | 工具行事实/折叠 | 时间取自 `event.at`/`detail.at`（旧 `shortTime` 同口径），缺失如实「未记录」；`activity-state.timed-out` 与 failed/denied/exited-nonzero 同危险色；折叠摘要「本轮 N 个调用…含 X 条未放行/失败」并加 `.has-exception` 危险色；失败/未放行仍直显 `.sys-denied`；未放行直显行从同调用前相位补全目标（如 `sleep 100`）；`.tool-records`/`.tool-call-record`/`.sys-denied` 补 `›` chevron（open 旋转 90°） |
| 4 | Operator choice | 选项行 min-height 40px、8×10 padding、hover/selected 背景；radio/checkbox `accent-color: var(--foreground)`；中性拒绝/取消边框 `--input`（rgb(107,117,126)）；提交保持 primary。选择状态提升到 store（按行 id） |
| 5 | 虚拟状态保持 | 删除未消费的 `keepEl` 标记；行内 `<details>` 开合存 `row.data.detailsOpen`，operator 选项存 `row.data.selected`；`VirtualPane` 上翻时退出尾部偏好（`preferTail: tail && stickRef.current`）。冒烟 228 行窗口：离屏卸载后重挂，工具组/推理/回交 details 与 choice 选中全部保持 |
| 6 | 空态 CTA | `#btn-start-primary` 改用 shadcn `Button`；冒烟 computed `rgb(111,160,139)` primary 实底、高 32px，不是浏览器默认按钮 |
| 7 | `sys-config` 危险色 | `.sys-config`/`.sys-config .sys-text` 使用 `--danger`；冒烟开启会话失败行 computed rgb(201,122,109) |

## bench 热路径归因与优化（3A2 后）

**归因（Chrome tracing + DOM 计数）**：优化前 stormA 的 300 事件把 300 个无 callId 工具事件放进同一个**默认折叠**的 `.tool-records`；虽然摘要只显示一行，React 仍每次都 `mergePhases`/`callSummary` 并创建 300 个 `.tool-activity` DOM 节点。tracing 最长 `TimerFire` 12.36ms、其中 React `FunctionCall` 10.36ms；storm 期间 `document.createElement` 计数 **1,805**。`getBoundingClientRect` 仅 6 次、`Layout` 0.34ms、`Paint` 0.06ms，说明**不是布局抖动、时间格式化或选择器 O(n) 主因**；样式/功能本身不是瓶颈。

**优化（不改变可见行为）**：
1. 大工具组（>40 行）且默认折叠时延迟挂载明细；摘要与失败/未放行直显仍即时。小工具组保持旧 DOM 契约（折叠也挂载）。
2. `ChatRowView` 用 `row` + `row.data` 引用做 memo；未变行在滚动/其它行更新时跳过协调；稳定 `row.id` key。
3. 工具活动项增量追加改为原地 push（行数据仍换新引用触发 memo），移除每事件增长的数组复制与 GC 压力；滚动时不再重算摘要。
4. 保留 16ms 单发合帧与尾部跟随；没有引入滚动期降频（会牺牲实时性），因为优化后已无 >50ms 长任务。

**结果（与旧基线同机交替 3 轮）**：
| 轮 | 旧 stormA | 新 stormA | 旧 stormB | 新 stormB | 旧 handler max | 新 handler max | 旧 replay | 新 replay |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26.0 | 17.7 | 17.6 | 19.8 | 9.5 | 0.2 | 17.5 | 5.9 |
| 2 | 23.3 | 21.3 | 17.7 | 18.9 | 10.6 | 0.3 | 9.7 | 2.1 |
| 3 | 17.5 | 17.6 | 17.6 | 17.2 | 5.2 | 0.2 | 20.9 | 2.7 |

- 新 stormA 中位 **17.7ms**（旧 23.3ms），另 3 轮独立跑 17.6/17.7/17.6；新 stormB 中位 18.9ms（旧 17.6ms，+1.3ms，仍 ≤19.8ms）。全部新轮 maxGap ≤21.3ms，达到 ≤25ms 目标。
- 优化后 tracing：最长 `RunTask` **5.58ms**、React `FunctionCall` 3.68ms；storm 期间 `createElement` **4** 次、GBR 6 次、无 longtask；replay 2.1–5.9ms、scroll 0.5–7.3ms，均优于旧基线。

**PM 例外登记（§10.4）**：`DEFER_TOOL_ROWS_WHEN_CLOSED = 40` 已按 PM 裁定登记在契约面 `ui-contract-surface.md` §七：仅同一个连续工具组在闭合且**调用数 >40**（`mergePhases` 行数）时延迟内部 `.tool-activity-list`；摘要、失败/未放行计数与直显、≤40 调用小组旧契约、展开即时挂载均保持；查询闭合大组内部行必须先展开。该例外为**唯一** DOM 契约例外，其他差异须另行报 PM。

**实现确认**：`docs/change/2026-10-21-phase3a2-evidence/defer-tool-rows-verify.json`：60 调用闭合组内部行 **0**、摘要「本轮 60 个调用：read_file ×60」；点击后 **60** 行挂载（首/末 `docs/f0.md`/`docs/f59.md`）；再次折叠回 0；10 调用小组闭合仍挂载 10 行。登记后复核 bench：stormA 18.9ms、stormB 18.4ms（`bench-opt/after-register.json`）。

## uiux-v2 目标切换与当前差距（如实）

- 三个套件已支持 `ANS_RENDERER_ENTRY`，默认仍跑旧入口，断言未改。
- `uiux-v2.mjs` 新入口默认段：**前 8 项通过**（工具组 2 组折叠、失败/拒绝直显、目标/原因、unknown 计数）；**第 9 项**「one independent work list without duplicated role documents」未过——工作概览/队列抽屉属 3B/4 缺口。工具折叠段（`ANS_TOOLFOLD_UI_ONLY`）**前 12 项通过**，第 13 项尾部折叠阅读锚点未过（3B/5 虚拟行锚点精修）。报告见 3A2 证据目录。
- 本报告**不宣称** uiux-v2 双端等价；3A 门禁为 ime 24/24、bench 跑通、新纯逻辑测试 18/18、旧基线 679/679、Phase 3A2 冒烟行为断言全 true。

## 未实现清单（不造假，按阶段）

- **3B/4**：真实 shell 确认卡/恢复确认卡/su 审批卡 IPC；`shellJudge`/`decisionJudge` 双开关；停止本轮；附件粘贴/拖入/缩略图完整 UX；队列抽屉（`#right-queue-body`/工作概览）；设置/Pi 面板；治理三权卡/镜像/排队聚合；治理记录动作；delivery/persistence/报告全文卡片；operator 卡镜像/队列聚合；`replayAnchorDebug`。
- **3B/5**：uiux-v2 全量逐 check 对照；bench「不劣化」阈值由测试定义；真实模型/长转录/打包安装包复验。
- **驱动未实现**（`window.__ansRenderer.unimplemented`）：`openPiPanel`、`loadPiConfig`、`savePiConfigFromForm`、`piKeys`、`governance`、`onShellConfirm`、`shellJudge`、`decisionJudge`、`onRecoveryConfirm`、`replayAnchorDebug`。

## 边界核对

只写：`app/renderer/`、`test/桌面UI/`、`test/桌面应用/e2e/{uiux-v2,ime-enter,bench-storm}.mjs`（仅目标切换）、`角色卡/桌面UI/`。未改 `app/main.ts`、`app/preload.cjs`、`app/desktop/`、旧渲染器核心文件、根 `package.json`/`package-lock.json`/`vite.config.ts`/`tsconfig.json`/`.gitignore`、其他角色目录；无新增依赖。渲染进程无 Node/fs import、无第二份边界判定。`git diff` 中旧 `markdown.js`/vendor 的变化是此前已批准的安全升级，不属本批。

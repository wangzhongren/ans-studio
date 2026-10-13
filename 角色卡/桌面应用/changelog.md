# 桌面应用 变更记录

## 2026-10-13 — 产品与UI重验收的五项体验返工

按客户“修改吧”及PM释放，在现有renderer/styles/tool-rows内修单份说明、真实grid/全文、可见异常目标、撤回行内回执、真实未决优先/无遮挡键盘定位。定向62/62、离线76记录、IME/类型/语法通过；全桌面206/207（既有目录名断言1红）。候选冻结，等待产品/UI实际复验通过后由PM提交。见[返工修复](docs/fix/2026-10-13_fix_uiux-reacceptance.md)。

## 2026-10-13 — 对话优先、单工作抽屉与角色草稿

已按客户v2授权与PM阶段释放完成UI1–UI3候选：动态输入区避让、单Pi头、相邻常规工具组、可靠结果/异常直呈、工作置顶单队列、阅读态/独立草稿图片。定向60/60、离线实际renderer36项与IME通过；全桌面204/205（既有目录名断言1红）。待PM独立产品/UI验收，未提交部署。见[变更记录](docs/change/2026-10-13_change_uiux-v2.md)。

## 2026-10-13 — 输入法候选Enter不误发送

按客户直接请求及项目管理v1评审，仅聊天输入绑定增加compositionstart/end状态和isComposing/229早返回，位置在preventDefault/onSend前。没有时间窗或吞下一Enter标记，onSend和下层原样。

独立Electron先红（候选Enter清文字/附件、气泡+1/send1）再绿（默认不取消、输入/附件/气泡原样、send0）；中文/英文、end→false+229、鼠标结束后正常Enter、原生Shift+Enter与按钮全部通过，E2E_DONE=1。renderer单测41/41、类型/语法/差异检查通过。保留历史未提交修复，未操作用户ANS。详见[修复记录](docs/fix/2026-10-13_fix_ime-enter-candidate.md)。

## 2026-10-13 — 长聊天可见内容、真实回交汇总、24小时日志与显式恢复

按客户直接授权及项目管理canonical v1实施。修复已证实的强制尾窗口导致上翻聊天区空白；异常事件不阻断同批合法行和flush。来源pane明确显示completed/blocked/unreported/failed/aborted，su去提前镜像，真实投递详情默认折叠；连续回交按消息屏障合批且失败整批保序保键。已接受项目角色实际注入routineShellPolicy，su/未接受配置不传，门禁和危险确认仍沿编排。

消费唯一共享logger（滚动24小时）并加窄桥；加载/进程/IPC故障有诊断和用户明确重载，续接项目/角色并同id重推仍pending请求，不代答、不延期、不重发。窗口closed释放自有IPC，mac重开正常加载。专项13/13、类型检查通过；桌面201/200/1（唯一本来目录名红）。真实Electron本次可见行/报告/诊断/恢复/mac重开全部true，E2E_DONE=1，无ERROR/WATCHDOG。源码冻结给独立验收，详细[修复记录](docs/fix/2026-10-13_fix_viewport-reports-diagnostics.md)。完整客户整窗白屏原始原因未证实，未宣称所有原因已根除；未恢复真实模型造项目测试，未发布。

## 2026-10-13 — 后台边界重建完成后仍可续发

客户直接授权由所属角色修复，项目管理评审 v1 后实施。重建成功恢复仍有效的活动目标，非活动重建/新选择不抢位；stop 等待在途链，关闭全部终止旧扫描后续步骤。同角色点击实际确认后端；发送失败撤销本地开启标记，补开失败保留输入/附件且不追加假气泡，不自动重发。

顺序红用例先确认 `ok=false`，修复后管理器 16/16、相关测试 63/63、类型检查通过；桌面 194/193/1（唯一既有目录名断言环境红）。真实 Electron 本次 11 项全部 true，`E2E_DONE=1`，U-1/P-1 保持通过；原用户首轮寻址 patch 完整保持。详细候选哈希、命令与失败记录见[修复文档](docs/fix/2026-10-13_fix_background-rebuild-active-session.md)。客户运行中的应用未更新。

## 2026-10-13 — P1 三条（桌面侧）：待办最小管理面（看全文+撤回）、LRU 淘汰避开 busy、切换项目一次性防呆（客户裁定，提案 §P1-1/§P1-2/§P1-3）

**来源**：客户裁定产品提案 P1-1/P1-2/P1-3 全部实施（原文 `角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md`，逐条按「提案+验收口径」）。**属本角色边界内**。

- **P1-1 待办最小管理面**：快照条目增 `id`（= dedupKey）与 `full`（入队即定格全文）；抽屉行「全文」展开（全文比摘要更长才出钮，短消息不摆无用钮）+ 「撤回」——`SessionManager.withdraw` **仅未投递的客户消息**可撤（成功即聊天流如实一行「已撤回排队消息：〈摘要〉」、位次前移走既有快照）；**进行中撤回无效如实、派发/回交只读**（呈现与语义同口径）；新 IPC `session:withdraw`。**不做**重排序/批量清理/优先级。**实现坑已修留钉**：dedupKey 含 NUL，HTML 属性经 encodeURIComponent/decodeURIComponent 往返。**顺带修错口径**：排队客户消息投递不再误走派发文案分支（三类各归各位）。
- **P1-2 LRU 避开 busy**：`evictBeyondLimit` 挑选加 `!busy`（在跑的不淘汰）+ `keepRoleId`（正在开启者不淘汰）；无可回收 ⇒ **暂超限**，settled 收口为「下一时机」再收；切回被淘汰者的 recovered 链路与文案逐字未动。
- **P1-3 切换项目一次性防呆**：有 busy（真实快照）时聊天流顶部出内联确认条「有 N 个角色正在工作，切换项目会停止它们——[仍要切换] [取消]」（`#chat` 之外、**不落聊天历史**、快照归零自动收起）；取消=零动作；确认=关闭全部并进新项目；**无 busy 行为逐字不变**。e2e 的目录选择器改桩（真对话框会挂住）。
- **测试**：新单测 `queue-withdraw-lru.test.ts`（撤回四态+LRU 两局）；`renderer.test.ts` +3；e2e +15 检查点全 true（含 **执行序 1、3 逐字核对**、派发行无撤回钮、SWITCH_* 全链）。
- **证据**：`npm run typecheck` **0 错**；桌面 → **178 计/177 过/1 红**（唯一红=既有环境红）；全量 → **950 计/947 过/2 红**（两红均既有环境红）；e2e **E2E_DONE=1**（244 true / 2 个既有预期 false）。详见 `docs/change/2026-10-13_change_p1-queue-withdraw-lru-switch-guard.md`。

## 2026-10-13 — 真机状态机簇修复：并发作废重建 TOCTOU（忙态误复位/孤儿会话/消息落空）+ data-state 回 idle + 回放去重（同段消息渲染两遍）

**来源**：协调方真机探针（su 轮次在跑但忙态翻假/停止钮消失；data-state 永不复 idle；聊天流无 settled 行）＋客户截图「su 的消息整段重复渲染两遍」。**属本角色边界内**。

- **机制（只读 CDP 探针取证）**：① 「适配器多发/早发 settled」**排除**（1s/6s 轮各恰一发、与轮末对齐、忙态全程正确）；② 忙态翻假＝**并发作废重建 TOCTOU**——su 轮末自动重 pin 令边界快照常陈旧，settle 触发的 `refreshStaleBoundaries` 与用户紧接的 `send` 各自的重建赛跑，晚到方旧实现按 key 误删新会话条目并推 busy=false（还可能清 activeRoleId 致消息落空）；③ data-state 无回 idle 路径（独立缺陷，坐实）；④ 「无 settled 行」＝虚拟窗口化 DOM 采样伪影（行模型 2300 行、滚到底即见——settled 行该出现且出现）；⑤ 重复渲染＝已登记缺陷触发在案（project:changed→refreshProject→主进程重推历史→无守卫整份再回放；「另有重复事件投递」排除——生产只走合帧批通道）。
- **修复 A（session.ts）**：作废重建按角色**串行化**（`rebuildChains`，同 drainChains 先例）+ `disposeEntry` **身份守卫**（只删仍在表中的同一引用）+ 每个 await 后 **TOCTOU 重校验**；`send()` **目标角色入口定格**（并发重建不清指针/不丢消息，忙时入队同按定格目标）。
- **修复 B（renderer.js）**：`syncChatState`——`#chat[data-state]` **只随 role-state 真实快照**（run/idle；与停止钮同一单一数据源），三处校准（setChatHeader/onRoleState/开启成功）；旧「开启即写死 run」退役；err 路径保留。
- **修复 C（ui-labels.js + renderer.js）**：回放去重——纯函数 `UiLabels.replayPlan`：同份历史**幂等 skip**、增长**增量 append**、其余（重写/截断/错误态变）**全量重建**（`rebuildPane`，绝不追加第二份）；`replayHistory` 记每角色上次状态随项目作废。
- **测试**：新单测 `session-rebuild-race.test.ts`（并发不变量：恰一次作废/重建、条目保活、消息送达、忙态终态 true——修复前该序列 9/10 消息落空，修复后 10/10 确定性全过）；`renderer.test.ts` +2（replayPlan 六态 + 接线钉；data-state 修复钉）；e2e +7 检查点（`REPLAY_DEDUP_IDEMPOTENT/APPEND/REBUILD`、`REPLAY_NO_DOUBLE_ON_REFRESH`、`DATA_STATE_RUN_WHILE_BUSY/IDLE_AFTER_ROUND`、`SETTLED_ROW_PRESENT`）全 true。
- **证据**：`npm run typecheck` **0 错**；桌面 → **173 计/172 过/1 红**（唯一红=既有环境红）；全量 → **937 计/934 过/2 红**（两红均既有环境红）；e2e **E2E_DONE=1**（231 true / 2 个既有预期 false）。详见 `docs/change/2026-10-13_change_state-machine-and-replay-dedup.md`。

## 2026-10-13 — 停止钮位置调整（客户反馈「位置有问题」）+ 直接发送路径「开跑即外推 busy」前置缝修复

**来源**：客户原话「**现在停止按钮位置有问题，我觉得应该换个地方**」。**属本角色边界内**。

- **位置（客户裁定）**：停止钮从聊天头移到**输入框区、发送钮左侧**（`#composer-capsule` 内、`#btn-send` 前一兄弟）——同款 32px 圆形、**次级色**、hover「停止当前轮次」；聊天头不再有任何按钮；`.cap-halt[hidden] { display:none }`（display:flex 会压掉 [hidden] 默认——同 #pi-panel 先例）。
- **红线保持（客户口径）**：**发送钮不可被替换或禁用**——「忙碌时发消息=入队」（DeliveryItem 队列）语义不变；停止钮与发送钮**并存**、各司其职（`updateHaltButton` 不触碰 `btn-send`，有源码钉）；点击仍走 `abortSession` 三态如实行、措辞不变。
- **前置缝修复（随位置调整暴露，P0-2 功能前提）**：直接发送路径原**只在轮次结束后**才推 busy 快照（`notifyRoleState` 在 `await handle.send` 之后）——长轮次（真实 pi 一轮数分钟）期间界面根本收不到「工作中」，停止钮/左树徽标无从在**进行中**出现（投递机路径本就「先置忙即推」；快适配器掩盖了这条缝）。改为**开跑即外推 busy=true**（与投递机同款；结束后那次保留、兜底快适配器竞态）。行为更准（快照=会话条目真实状态）、不涉判定。e2e harness 补接 `emitRoleState → session:role-state`（生产 main.ts 有、harness 原缺——否则真实忙态到不了渲染侧）。
- **测试**：`renderer.test.ts` P0-2 钉组改新位置断言（胶囊内、发送钮左侧、聊天头无按钮、圆形/次级色/`[hidden]`、显隐不触碰发送钮）；e2e 新增 `STOP_IN_COMPOSER`/`CHAT_HEAD_NO_BUTTONS`/`STOP_VISIBLE_WITH_REAL_BUSY`（真忙——慢轮在飞）/`SEND_ENABLED_WHILE_BUSY`/`SEND_QUEUES_WHILE_BUSY`（并存钉）全 true。
- **证据**：`npm run typecheck` **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **169 计/168 过/1 红**（唯一红=既有环境红）；全量 → **933 计/930 过/2 红**（两红均既有环境红）；e2e **E2E_DONE=1**。详见 `docs/change/2026-10-13_change_p0-halt-and-images.md` §2′。

## 2026-10-13 — P0 收官环（桌面侧）：停止入口（P0-2 UI）+ 图片端到端接线（P0-1）+ 退役「图片未发送」提示（客户批准，编排中环契约已落）

**来源**：客户 2026-10-13 批准两项产品提案；编排中环已落契约（`RoleSessionHandle.abort?` 三态、`send(text, opts?)` 整包透传）。**属本角色边界内**（桌面环只接线与呈现、不做判定）。

- **停止入口（P0-2 UI）**：聊天头 `#btn-halt`「停止」——**仅该角色忙碌时出现**（role-state 真实快照判据，三处刷新点）；点击 `d.abortSession(roleId)`（新 IPC `session:abort` → Interface → `SessionManager.abort`），按**三态**在聊天流**如实一行**（已请求停止——轮次仍以 settled 收尾 / 当前运行时不支持停止 / 停止失败：<error>）；重复点击幂等；**id 刻意避开 btn-stop**（防回潮钉子串口径）；**不是「结束会话」的恢复**（那是关整只会话，本钮只停当前一轮）。
- **图片端到端（P0-1）**：附件记录带 base64；`onSend` 组 `[{type:"image", data, mimeType}]` 随 `sendSession(text, images)` 上送（用户气泡「（图片 ×N）」前缀留痕；成功即清附件、失败保留重试）；**主进程重校验**（Interface 层：严格解码 → 魔数嗅探 → ≤5MB，mimeType 以嗅探为准；任一张不合格**整条拒发**——绝不丢图发文字）；`DeliveryItem.opts` **入队即定格**、投递整包同一引用透传；不传时调用形态与旧版逐字一致。
- **demo 适配器**：`prompt(text, opts?)` 接受并记录收包（`takeDemoPromptLog()` 环形上限 50，e2e/单测断言透传保真）；行为不变。
- **退役**：三处「图片未发送」提示行与 `imageNotWiredNote`（不留死代码）；composer-images/interface/preload/main 的「送模型未接」注释全部更新为已接线口径。
- **测试**：新单测 `p0-halt-and-images.test.ts`（5 例：abort 三态、重校验拒绝、合法图嗅探定型、队列定格同引用投递）；`renderer.test.ts` K-2 翻转为 P0-1 + 新增 P0-2 停止入口钉（B-3「停止措辞唯一」钉相应收窄为状态徽标的「已停止」）；e2e 新增 STOP_* 四检查点与 IMG_* 六检查点（队列定格用**慢轮缝**把忙变确定态——arm 后首轮 prompt 挂起至放行，不改 demo 本体；harness 注册 `session:abort` 同形）。
- **证据**：`npm run typecheck` **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **169 计/168 过/1 红**（唯一红=既有环境红）；全量 → **933 计/930 过/2 红**（两红均既有环境红）；e2e **E2E_DONE=1**（219 true / 2 个既有预期 false）。Node v24.14.0 / Darwin arm64。详见 `docs/change/2026-10-13_change_p0-halt-and-images.md`。

## 2026-10-13 — 待办/队列归角色（图标簇两枚、两节并入角色资料抽屉）+ Pi 面板抽屉内溢出修复（客户裁定，真机复现）

**来源**：客户原话「**代办是不是应该放在角色里面是不是更好呢。不用放在顶部呢。这个是和角色相关的**」；Pi 设置面板真机复现横向溢出（窗口 1516px 时输入框画到 x≈1538–1869、越出窗口右缘）。**属本角色边界内**。

- **图标簇收敛两枚**：`tab-todo`/`tab-queue` 退役——簇只留**角色资料**（`tab-card`）与 **Pi 设置**（`tab-pi`）；渲染侧对应接线删除（不留死代码）。左树徽标与 `#op-chip` 不动。
- **待办/队列两节入「角色资料」抽屉**：card 分支变六节——既有四组（角色卡/边界/变更/文档）逐字保留，插入**待办 / 队列**节（进行中+排队完整视图）与**队列概览**节（仅排队条目的位次视图）＝原独立两 tab 的内容**逐字搬入**，打开时跟随当前选中角色；`updateRightQueue` 一次同刷两节（定点更新、不重排手风琴）；队列概览抽成 `queueOverviewHtml` 共用。
- **角标归角色**：角色资料图标角标＝`queueViewsFor(选中角色).length`（进行中+排队；继承原待办图标角标语义；同一 role-state 快照、无新数据源；>0 才显示，收起不丢信息）。
- **Pi 溢出修复**（`styles.css`，面板字段/保存/掩码纪律一字未动）：`.pi-field` 的 200px 标签列按旧右栏列宽设计、抽屉（268–360px）装不下并排 → 抽屉内**堆叠**（标签一行、输入一行，输入吃满行宽、随抽屉宽度弹性收缩）；抽屉 `overflow: hidden` 作裁剪边界；`#pi-panel` `min-width: 0`；双保险 `#right-drawer:not(.open) #pi-panel { visibility: hidden }`（抽屉未展开时面板不可见——状态即使失步也不画到窗口外）；删 940px 档死规则。
- **测试**：`renderer.test.ts` 右栏抽屉钉整组改写（两枚图标、退役图标断言不存在、角标=card、两节在角色资料渲染里、Pi 不溢出四钉）；e2e 检查点翻转 + 新增 `NO_RETIRED_TABS`/`RIGHT_HAS_TODO_SECTION`/`RIGHT_HAS_OVERVIEW_SECTION`/`BADGE_ON_CARD_WHILE_COLLAPSED`/`QUEUE_OVERVIEW_IN_CARD` 与 **Pi 几何检查**（`PI_STACKED_FIELDS`/`PI_NO_OVERFLOW`；窄窗口 `win.setSize(900)` ≤1100px 裁定线重测 `PI_NARROW_NO_OVERFLOW` 后恢复）。
- **证据**：`npm run typecheck` **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **163 计/162 过/1 红**（唯一红=既有环境红 `pi-config.test.ts`）；e2e **E2E_DONE=1**（新增检查点全 true、既有检查点无回归）。Node v24.14.0 / Darwin arm64。详见 `docs/change/2026-10-13_change_drawer-two-icons-and-pi-fit.md`。

## 2026-10-13 — 右栏收成右上角图标簇（抽屉）+ Pi 入口上移 + 删「结束会话」/状态 pill（客户裁定，与聊天流去常规提示同批）

**来源**：客户原话「**角色卡这一块的页面，感觉和 claude code 一样，变成右上角几个图标，点了展示呢。这个没必要一直展示**」「**Pi 设置，也放到右上角，结束回话，感觉也没啥用去除。聊天中也没啥用去除吧**」。**属本角色边界内**。

- **默认收起**：右栏常驻列退役——栅格改两列（`272px + 1fr`）；抽屉 `#right-drawer` 为**覆盖层**（`position:absolute` 在 `.app` 上滑出，不占栅格列 ⇒ 聊天列宽不因开关而变、聊天流不 reflow）。过渡纯 CSS 120ms（**无计时器**，G-1 纪律不破）。
- **右上角图标簇 `#right-tabs`**（标题栏控制区内、窗口按钮之前）：四枚小图标——**角色资料 / 待办 / 队列概览 / Pi 设置**（`no-drag`；**不算 `.win-btn`**——三窗口按钮守卫不破）。激活高亮。
- **点开展示 / 收起**：点图标 ⇒ 抽屉滑出；**再点同图标 / 抽屉头 × / Esc** ⇒ 收起（Esc 优先级在 shell 确认卡之后）；**同一时刻至多开一块**（点异图标=切换内容）。
- **角标继承（收起不丢信息）**：待办图标角标＝`queueViewsFor(选中角色).length`（进行中+排队）；队列图标角标＝`queueByRole` 排队深度——**同一 role-state 快照、无新数据源**；>0 才显示。`#op-chip` 与左树徽标**不受影响**。
- **内容不变、跟随选中角色**：角色资料 tab＝既有四组逐字保留（角色卡 md/边界/变更/文档）；待办 tab＝既有「待办 / 队列」组**逐字保留**（进行中+排队，`updateRightQueue` 定点更新）；队列概览 tab＝**仅排队条目**的位次概览（来源/摘要/入队时间皆既有纯映射；「排队 ≠ 已执行」同句保留）——待办与队列是**同一真实快照的两个视图**（完整列表 vs 仅排队位次；客户想要别的切分只改映射）。
- **Pi 设置入口上移**：`#btn-pi-settings` 删除 → 图标簇第四枚 `tab-pi`；**面板本体整体迁入抽屉**（`#pi-panel` 移入 `#right-drawer`）——字段、保存/掩码/凭据纪律一字不动，显隐由 tab 状态驱动（`syncPiPanel`）；展开即重取视图。
- **删「结束会话」按钮**：`#btn-stop` 删除。**停止能力保留在程序化路径**（换项目时 `d.stopSession(null)`「关闭全部」；定向 stopSession 在主进程/会话管理器）；渲染侧只服务该按钮的 `stop()` 死代码一并清（不留死代码）。
- **删「聊天中/空闲」状态 pill**：`#session-state` 视觉删除；**状态程序化保留**——`setState` 把 kind 写到 `#chat` 的 `data-state`（run/idle/err），e2e 与外部驱动仍可断言；全部调用点跟进。
- **测试**：`renderer.test.ts` 新增右栏抽屉钉子（8 组：col-right 退役/覆盖层/图标簇四枚且非 win-btn/状态机至多开一块/Esc/内容跟随/角标语义/内容四组+待办组逐字保留/Pi 在抽屉内/样式钩子）并翻转 T28/K-1/B-2 三处旧断言（btn-pi-settings→tab-pi；session-state 删+data-state；btn-stop 删+`d.stopSession(null)` 保留）；e2e 新增 18 个抽屉/角标/Pi 检查点、状态日志改读 `data-state`、第 6 节/N-3/T28 节随抽屉模型接线。
- **证据**：`npm run typecheck` **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **163 计/162 过/1 红**（唯一红=既有环境红）；全量 → **913 计/910 过/2 红**（两红均既有环境红）；e2e **E2E_DONE=1**（202 true / 2 个既有预期 false；`TABS_PRESENT`/`DRAWER_DEFAULT_CLOSED`/`DRAWER_OPENS_ON_TAB`/`DRAWER_TOGGLES_CLOSED`/`DRAWER_ESC_CLOSES`/`BADGES_WHILE_COLLAPSED_*`/`PI_PANEL_IN_DRAWER` 等全 true）。Node v24.14.0 / Darwin arm64。详见 `docs/change/2026-10-13_change_chat-stream-declutter-and-md-tables.md`（聊天流去常规提示/表格启用同批记录在该文档前半）。

## 2026-10-13 — 聊天流去常规提示（欢迎行/恢复分隔行删除）+ Markdown 表格启用（客户裁定）

**来源**：客户裁定聊天流不要常规提示、表格要能渲染。**属本角色边界内**。

- **删「已开启与角色 X 的会话…」欢迎行**（`session.ts::openInternal` 的常规欢迎事件删除）：真机每次开会话/切角色都出现，被客户点名。**异常提示全保留**（`contextWarning`、O-1 边界重建行、投递失败/受阻行、开启失败/异常行）。附带效果如实：开启后暂无内容时 pane 保持空状态（含主 CTA）；pi 适配器侧的「会话已恢复：…」恢复说明事件非本角色边界、未动。
- **删回放分隔行「会话已恢复（模型上下文一并恢复）」**（`renderer.js::replayHistory` 成功回放不再插分隔行；`.is-replay` 视觉区分与**左树「空闲（已恢复）」徽标保留**——状态准确性不是聊天流提示）；**错误分支保留**：坏文件仍出「会话记录读取失败，未回放：<error>」一行（图标改 `ICONS.deny` 与失败行一致；`.sys-replay-divider` 钩子保留给错误分支）。
- **启用 Markdown 表格**（`markdown.js` 删 `md.disable(["table"])`）：输出纯 `table/thead/tbody/tr/th/td`，**`html:false` 下单元格内原文 HTML 照常转义**（实测 `<script>` → `&lt;script&gt;`，无 XSS 增量）；**图片禁用保持不动**（覆写 image 规则原样）。`styles.css` 表格样式（`.msg table, .card-md table`：边框/表头底色/cell padding；宽表 `display:block + overflow-x:auto + max-width:100%` 不撑破布局；右栏结构化边界表 `table.boundary` 不在作用域）；虚拟窗口行高不受影响（块级表格被 `offsetHeight` 实测覆盖）。
- **测试翻转四处**：e2e `SU_HAS_WELCOME`/`HAS_WELCOME` → `SU_NO_WELCOME`/`NO_WELCOME_AFTER_OPEN`（不含）；`session.test.ts`「应有会话开启提示」→「不应再有会话开启欢迎提示」（开启时事件为空）；`renderer.test.ts` 恢复分隔行断言翻转 + 错误分支 `error !== null` 源码钉；e2e `RESTORE_DIVIDER_TEXT` → `RESTORE_NO_SUCCESS_DIVIDER`。**补安全钉**：markdown.test.ts「单元格内 HTML 仍被转义」（`&lt;script&gt;` 在 `<td>` 内、不得直通）；表格钉翻转为「渲染 table/thead/th/td」。
- **同批清理旧框定**：memo 两条 2026-10-11「su 本版只读」记录并作一条按现状带过；changelog 里**未实施的**「本版只读」界面提示方案标注已过时（su 可写治理产物、只读 shell 已落地、只读标记已按客户裁定移除）。
- **证据**：`npm run typecheck` **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **162 计/161 过/1 红**（唯一红=既有环境红 `pi-config.test.ts`）；全量 → **912 计/909 过/2 红**（两红均既有环境红）；e2e（真实 Electron）`E2E_DONE=1`、`SU_NO_WELCOME=true`/`NO_WELCOME_AFTER_OPEN=true`/`RESTORE_NO_SUCCESS_DIVIDER=true`、既有检查点无回归（仅 2 个既有预期 false）。Node v24.14.0 / Darwin arm64。详见 `docs/change/2026-10-13_change_chat-stream-declutter-and-md-tables.md`。

## 2026-10-12 — 修复：交互卡（重）物化落到聊天流最末尾（锚点物化；客户真机「已确认的卡切走再切回变成最下面」）

**来源**：客户原话「**这个确认过的，在聊天里面，切换出去，再回来变成最下面了**」。**属本角色边界内**。

- **根因（真机 Electron 探针确证）**：两因素叠加——① Q-2 **窗口化**把离屏 `keepEl` 行**脱挂**（元素实例保留在行表、`parentNode !== pane`），`materializeOperatorCard` 的去重判据 `cardInPane` 按**当前 DOM 子节点**找卡 ⇒ 误判「卡丢了」；② 判丢后**重新建卡并 `registerRow` 追加行表尾**（`registerRow` 无插入位概念）⇒ 每次切走切回（`showPane → materializePendingFor` 对登记表全部条目——含已决卡）都把卡搬到流尾，**且旧行仍持旧元素**（潜在双份）。open 与已决卡同病（未决卡当年恰在流尾、跳尾不可见；被后续活动推离尾部即暴露）。
- **锚点物化三级落位**（`renderer.js`）：**① 复用既有行（主修复）**——物化先按 `requestId` 扫行表，卡行仍在（离屏≠丢失）⇒ 直接返回、绝不重建；**② 按锚点落位（防线）**——首次到达不加锚（卡=当下最新事件，行表尾即它发生的位置），重物化取「同表首物化位（`entry.anchorIndex`+行表 `seq` 校验）→ 回放锚点表（插到「调用工具 request_confirmation」行之后、结论行之前）」；`registerRow` 新增 `atIndex`（锚点插入 + 其后各行 index 右移重编号——attachRow/卡定位/虚拟窗口语义不变）；**③ 兜底＝追加行表尾，绝不丢卡**（代码写明；落尾的卡仍可被 P-1 chip 定位/作答/定格）。
- **锚点关联（回放行带上请求标识）**：`session-history.ts` 解析 JSONL 时把 request_confirmation / request_choice 的**调用行**与**结论行**带上同一标识——`requestId`＝pi `toolCallId`（调用行经内容块 `id`、结论行经 `toolCallId` 配对，**不解析正文**）、`anchor`、`anchorKey`＝请求本体 kind+title 的**单一算法键**（新模块 `app/desktop/request-anchor.ts`；工具名常量**只读导入自** `src/provider/pi/tools.ts`，不复制字面量）；`customer-input.ts` 请求载荷同法带 `anchorKey`——两侧逐字可对上。渲染侧按 `anchorKey` 建「调用行/结论行行序位」表（同题问过两次以最后一次为准；随项目作废）。两个 id 命名空间（`op-N` vs `call_00_…`）不对得上属如实（请求对象为冻结形状、不含 toolCallId，边界外不得扩）——以键关联。
- **不回归**：P-1（切回滚到卡/chip/到达即达）、`#op-chip`、U-1 到底、S-1 贴底、Q-2 窗口化语义、`registerRow` 缺省追加（全部既有调用点零改动）、去重（`cardInPane` 保留为防御层；行模型按 requestId 查重后**同卡恒恰一行**——去重反而变强）。
- **测试**：`session-history.test.ts` +2（调用/结论配对；choice 同法、非交互/缺 title/孤儿不着锚、两侧键逐字相等）；`renderer.test.ts` +1（锚点物化源码钉：复用既有行/atIndex 插入+重编号/锚点表登记与消费/首次不加锚/兜底写明/探针面/decided 定格同法）；`operator-wiring.test.ts` 载荷断言随新形状更新（deepEqual 含 `anchorKey`）；**e2e 新增「回放重建 + 已决卡」时序断言段**（临时项目 + JSONL 夹具 → 回放 → 真通道同题请求 → 作答 → 灌 200 行窗口化 → 切走/切回 ×2 → 断言行模型：锚点表登记相邻、卡行序索引恒定**≠行表尾**、恰一条卡行不重建；未决卡同法回归 + chip 照常亮）——上次暴露时序类 bug 的正是本 harness，按派发要求钉在它里面。
- **证据**：真机探针前后对照（修前切回落尾/行表双行；修后索引恒定 213 vs 行表尾 333、行模型恰一条）；e2e `ANCHOR_TABLE_REGISTERED`/`ANCHOR_STABLE_NOT_TAIL_ONCE`/`ANCHOR_STABLE_NOT_TAIL_TWICE`/`ANCHOR_NO_DUPLICATE_ROW`/`OPEN_CARD_STABLE_AT_ANCHOR`/`OPEN_CARD_CHIP_VISIBLE` 全 true、既有检查点无回归（194 true / 2 个既有预期 false，`E2E_DONE=1`）；`npm run typecheck` **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **162 计/161 过/1 红**（唯一红=既有环境红 `pi-config.test.ts`）；全量 → **912 计/909 过/2 红**（两红均既有环境红：上处 + `test/项目管理/shared/path-primitives.test.ts` macOS /var 符号链接）。Node v24.14.0 / Darwin arm64。详见 `docs/fix/2026-10-12_fix_decided-card-reanchor.md`。
- **观察到的相邻缺陷（本轮未修、如实登记）**：`project:changed → refreshProject` 再走 `app:list-project` ⇒ 主进程对每角色**再推一次**会话历史 ⇒ 渲染侧对同一 pane **重复回放整份转录**（`onSessionHistory` 对同项目无去重守卫）——宜另开任务（渲染侧按最近已回放的会话文件去重，或主进程只在导入/切换时推）。

## 2026-10-12 — su 只读 shell：桌面侧接线（客户裁定「su 也要有 shell，但是只读」）

**来源**：客户裁定「**su 也要有 shell，但是只读**」。编排侧已落地（`run-role` 的 `shellReadonly` 入参 + `shell-arming` 的 `assembleReadonlyShellGate`，其 change 文档 `角色卡/编排/docs/change/2026-10-12_change_su-readonly-shell.md`）；本角色做**后半**：桌面会话构造路径按角色种类分发两档闸。**属本角色边界内**（`src/**` 一行未改，只读核实）。

- **分发点**（`session.ts`）：内置治理角色（su，判据 `role.builtIn === true`，数据驱动）新增 `shellReadonly = this.deps.shellArming`——**复用同一份 (c) 实件**（`buildDesktopShellArming()` 的 `{classifyShell, rules}`；单一来源、与项目角色**永不漂移**），经 `openRoleSession` 透传 ⇒ 编排装配**只读档** ShellGate（命中 (c) 只读白名单放行；risky/review/deny 一律拒）；**给出即 arm**——su 会话恒 `suppressHandback === true`，只读档分支**不带**该前缀（旧注释联想会误导，已写明）。缺省/构造失败 ⇒ **不传** ⇒ su 不 arm（能力缺席 = fail-closed，绝不放宽）。
- **su 不接 (b)/(a)**（「审读者不给自己开闸」保留其义）：仍不注入 `shellOperatorChannel`/`shellArming`（两行**逐字未动**）——su 自己就是审读者、不自审；只读外的命令**直接拒、不弹框、不打扰客户**（编排选项面没有 (b)/(a) 即是结构保证）。
- **项目角色逐字不变**：仍收 `shellOperatorChannel`+`shellArming` 走三层链、**不带** `shellReadonly`。
- **透传面**（`interface.ts`）：`openRoleSessionFn` 入参镜像增 `shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">`——形状**只读导入自编排**（不另立第二形状）。
- **构造链核对（任务点名项）**：`main.ts::registerIpc` 每窗口在 `createDesktopInterface` **之前**构造同一份 `shellArming`（arm 开关 `DESKTOP_SHELL_GATE_ARMED` 为真时）→ Interface → SessionManager：**无需新增**（su 只读档复用同一对象，引用同一性有测试钉）；**未发现** arm 开关对 su 不生效的时机问题。`operator-channel.ts`/`main.ts` 的 arm 文档与注释按新语义更新（代码零改）。
- **测试**（`operator-channel.test.ts` **25/25**，+2 新用例、3 处既有用例扩断言）：su 收到 `shellReadonly` 且**恰为同一份 (c) 实件**（引用同一性 + 含 classifyShell/rules）且**不含** (a)/(三层) 字段；项目角色照旧且不含 `shellReadonly`；`deps.shellArming` 缺省 ⇒ 两角色三字段全不出现（fail-closed）；源码钉（新判据行、spread、只读形状只读导入、run-role「给出即 arm」）；**真正接通核查**——临时项目 + 真实 `openRoleSession` + 真实 `buildDesktopShellArming()` ⇒ su 能力面产出只读 gate：`ls -la` 放行 / `rm -rf` 拒（理由含「su 只读档」）/ `node --test` 拒（现状）；全程不触网、不跑命令、审计只在临时目录。
- **证据**：`test/桌面应用` **159 计/158 过/1 红**（唯一红=既有环境红 `pi-config.test.ts` 检出目录名断言）；全量 **903/900 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `6291ab1`。详见 `docs/change/2026-10-12_change_su-readonly-shell-arming.md`。

## 2026-10-12 — U-1 点击角色 ⇒ 到底部（客户裁定；取代 B-2「恢复位置」）

**来源**：客户原话「**点击这个角色，应该滚动到滚动条最下面**」。**属本角色边界内**。

- **语义反转（客户裁定）**：点角色（切换会话）⇒ **到底部（最新一条）**——**取代** B-2 的「切角色恢复上次位置」（`scrollMemo` 声明/切走记忆/恢复分支**全删干净**，注释剥离后断言无残留）。理由登记：恢复位置会让用户点开后看不到最新一条，客户判为错误。
- **统一助手** `stickPaneToBottomOrCard`：**有未作答卡 ⇒ 滚到那张卡**（P-1 例外保留）；**无卡 ⇒ 到底部**；三处接线（showPane / **重复点击早退分支** / chip 同刷）。
- **修 e2e 抓出的漏点**：重复点击同一角色原走 `selectRole` 早退、**根本不滚**（`U1_REPEAT_TO_BOTTOM=false`，dist=556）——早退分支同样走助手，修复后 dist=1。
- **窗口化兼容**：`scrollBottomForced` 先 `updateVirtualWindow(preferTail)` 实体化尾部再滚（≥150 行落点准确）。
- **与 S-1 不冲突**：点击=显式动作 ⇒ 强制到底；流式输出仍「在底部才贴底、上翻不拽回」（源码钉 + e2e 双向）。
- **证据**：e2e 真机三例全 true（窗口化 1px / 常规 1px / 重复点击 1px）；S-1 八项、P-1 十项无回归；`E2E_DONE=1`。桌面 **157/156/1**（唯一红=既有环境红）；全量 **880/877 · 2 红**（两红均既有环境红）；typecheck **0**。Node v24.14.0 / Darwin arm64 / HEAD `6291ab1`。详见 `docs/change/2026-10-12_change_click-to-bottom.md`（含反转理由与历史表述说明）。

## 2026-10-12 — S-1 回归修复：新输出不再自动滚到底（长会话贴底）

**来源**：客户原话「现在输出不会让滚动条滚动到最底下了」。**属本角色边界内**（Q-2/贴底的回归）。

- **复现（真机 e2e 确定性用例）**：长会话（200 行 ⇒ 窗口化）+ **按批**（生产热路径形态）追加 ⇒ 修前 `S1_STICK_AT_BOTTOM_DIST=339`（未贴底）；上翻后新输出**拽回**（`S1_NOT_YANKED=false`）。
- **根因（逐条核对）**：① 命中主因——**flush 贴底在窗口更新之前**（底部 spacer 未随新行增长 ⇒ 贴到「旧底」，每批差一整批高度）；② rAF 无责（同①）；③ 命中——**旧代码无条件贴底**，违背「上翻不打断」；④ 部分成立——实测修正只 `prefix=null`，spacer 要等下一帧 ⇒ 高度漂移松贴底。
- **修**：flush **先更新窗口再贴底**；强制贴底前先令窗口落定；新增流式判定 `streamShouldPin`（`stickToBottom` 纯映射、阈值 **24px**、**先量后挂**、批内一次测量复用）——助手/系统/拒绝/注入/回交行走「在底部才贴底」，**用户动作/卡到达/切角色/回放**仍强制；窗口更新内加**「本就在底部者」补偿**（修正后同帧补贴底；上翻者绝不拽）；实测修正后**同帧**重算 prefix 并重设 spacer。
- **修后（真机 e2e 双向、两类路径）**：窗口化贴底 **339px→1px**；上翻不拽回 true；回底再输出贴底 true；常规路径（<150 行）贴底 **0px**、上翻不拽回 true。
- **取舍（登记）**：贴底由「每事件即时」变为「**每批收尾一次（≈一帧）+ 窗口落定后**」——最多晚一帧（16ms 级）；上翻期间不再有任何自动滚动（新语义）。
- **证据**：`test/桌面应用` **156 计/155 过/1 红**（唯一红=既有环境红）；全量 **874/871 · 2 红**（两红均既有环境红）；typecheck **0**；e2e `E2E_DONE=1`（S-1 八项全 true；P-1 十项未回归）。Node v24.14.0 / Darwin arm64 / HEAD `6291ab1`。详见 `docs/change/2026-10-12_change_hot-path-and-virtual-stream.md` 的 S-1 节。

## 2026-10-12 — Q-1 热路径治理 + Q-2 聊天流虚拟渲染（客户「主线程被阻碍」「应该虚拟渲染啊」）

**来源**：客户原话（澄清：**角色工作期间 UI 卡死**——每事件 IPC→DOM；markdown 疑似卡顿）。**属本角色边界内**。

- **热路径三件**：① **合帧推送**——事件按 16ms（≈一帧）窗口合成 `session:events`（数组、顺序不变；preload 双通道兼容探针）；角色状态快照**按角色去抖 100ms**（只推最新——快照语义）；纯逻辑 `push-batcher.ts`（可单测）。② **批量收尾一次布局**——flush 内抑制滚动/窗口更新，收尾统一贴底；左树每批至多一次（原先每事件一次）；无 per-event scrollHeight 读。③ **流式 Markdown 惰性化**——角色在跑时助手消息先纯文本，**settled 一次性**升级（仅已挂载元素；离屏行挂载时才解析）。④ O-1 哈希加 **mtime+size 缓存**（未变只 stat）。
- **Q-2 窗口化**：行表 append-only；<150 行全挂载（常规会话逐字不变）；≥150 只实体化**视口 ±30 行**（spacer 撑高、估算+实测高、rAF 合帧滚动）；离屏**不持 DOM、不跑 Markdown**；交互行 keepEl。四条滚动语义逐条保住：贴底 / **P-1 卡定位先实体化再滚** / 切角色**恢复位置** / **回放惰性**（整段批量，不一次性实体化）。
- **量化（bench-storm，300 事件风暴）**：最长帧间隔 **101.3ms → 18ms**；事件处理总耗时 **192.7ms → 16.7ms**（朴素基线 0.69ms/事件；2000 行回放旧形态估 ≈1.3s → **16.4ms**，挂载行仅 71）。**护栏**：300 事件 <3000ms、200 次未变哈希扫描 <2500ms（且同尺寸内容变更仍检出）、200 次 Markdown <1200ms——均入 `hot-path.test.ts`。
- **取舍（登记）**：窗口化后 **Ctrl+F/全选只覆盖已实体化行**；建议「复制全文/导出转录」按钮（**未擅自加**，待裁定）。
- **跨角色建议（未越界）**：门禁拒写路径的 `reloadBoundaryEntriesSync` 同步读盘建议按 mtime+size 缓存或 async 预载（每写尝试的热路径阻塞源）。
- **证据**：桌面 **155/154/1**（唯一红=既有环境红）；全量 **857/854 · 2 红**（两红均既有环境红）；typecheck **0**。详见 `docs/change/2026-10-12_change_hot-path-and-virtual-stream.md`。

## 2026-10-12 — P-1 待确认卡可达性（真机：卡被 288 行活动淹掉）

**来源**：真机（客户以为卡丢了）。**属本角色边界内**。

- **到达即达**：**先量后挂**（判据=到达前距底 ≤120px 且正看着该角色）⇒ 贴底滚到卡；在往上翻/不在该角色 ⇒ **不打断**。e2e 抓出并修复了「加卡后测量（卡本身越过阈值）⇒ 永不滚动」的时序 bug。
- **常驻 chip**：视图底部「有 N 条待确认 · 定位」（同状态源 `openRequestIdsFor`）；点击**逐张定位**+高亮（一次性 CSS 动画，无计时器）；作答/失效 ⇒ 灭。
- **切回**：有未作答卡 ⇒ 滚到第一张（非停在底部）；chip 计数正确（多张逐张）。
- **证据**：e2e 真机 `P1_*` 9 项全 true（`P1_ARRIVAL_DEBUG` dist=49、卡完整在视口）；桌面 **155/154/1**；全量 **857/854 · 2 红**；typecheck 0。详见 `docs/change/2026-10-12_change_operator-card-reachability.md`。

## 2026-10-12 — e2e 看门狗缺陷修复（「卡住」真因）+ 基准台 bench-storm（新增）

**来源**：pm 干预（e2e 进程 24 分钟纯等待被「卡住」）。**属本角色边界内**。

- **真因（已定位）**：① e2e 收尾 `report.txt` 写入**未先建 OUTDIR**（调用方指定目录不存在 ⇒ ENOENT 未捕获拒绝）且**未兜底 exit** ⇒ run 早已完成、进程留在窗口里空等（CPU≈0）——绝非测试失败。② 另有 harness 形态漂移：`app:list-project` 处理器**在回包前 await 读历史并推送**（与生产 `void pushSessionHistories` 不同形）⇒ 首角色（su）记录因**与回包跨通道竞序**丢失（`RESTORE_SU_OWN_TEXT=false`）。
- **修复**：`fs.mkdirSync(OUTDIR,{recursive:true})` + 收尾报告 try/catch + **`app.exit(0)` 兜底**；list-project 改**生产形态**（fire-and-forget、回包后推送）。
- **结果**：e2e **全绿**——`E2E_DONE=1`，165 项 `=true`；仅 2 项 `=false` 且均为**预期值守卫**（退役文案不存在 / 空项目无角色）。
- **新增基准台** `e2e/bench-storm.mjs`（离线、自超时 90s、逐阶段写盘）：Q-1/Q-2 的前后对照数字来源（见上条）；`BENCH_OUT` 可指定结果路径。

## 2026-10-12 — O-1 边界变更后刷新旧快照会话（读盘哈希检出 ⇒ 作废重建 + 如实行）

**来源**：真机现象（客户「这个问题也要修复一下」）：su 改好 boundary.yaml 后，活会话仍用开会话时的**旧边界快照**拒写。**属本角色边界内**。

- **信号（可信，非界面推测）**：开会话时定格**边界快照指纹**——参与解析的三来源逐一无状态读盘 **sha256 内容哈希**：① 角色 boundary.yaml；② 项目治理边界文件（若有）；③ `.ans/project.json`（pin 刷新即变）。读盘失败记 `<missing>`（保守幂等）。
- **处置**：`rebuildIfBoundaryStale`——陈旧 ⇒ **作废重建**（dispose → 立即按新边界重开；D-1 沿用）+ **如实一行**（两分支：`历史已从本地会话文件恢复（模型上下文一并恢复）` / `本地无可用会话文件（新建会话）——模型不会记得以上历史`；重开失败另起一行）；**在跑的轮次不打断**。
- **检查点四处**：发言前（本条照常发出）/ 续接（点角色）/ 投递前（队列保留、不并发）/ **su 一轮结束的全量扫描**（Interface `void refreshStaleBoundaries()`——边界刚被 su 改过的可信时机）。**su 同样适用**。
- **跨角色建议（未越界）**：拒写文案建议在「盘上边界含该路径、会话快照不含」时补线索「本会话可能持有旧边界快照——请重开会话后重试」（归门禁/编排，请协调方转达）。
- **测试**：新增 `boundary-refresh.test.ts` **4/4**（真临时目录+真读盘：变更⇒重建+如实行/未变⇒不重建不丢上下文/su+.ans pin 刷新同样触发/投递路径先重建再投不丢队列 + 接线钉）。
- **证据**：`test/桌面应用` **149 计/148 过/1 红**（唯一红=既有环境红）；全量 **847/844 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_boundary-refresh.md`。

## 2026-10-12 — N-3 右栏「待办 / 队列」组 + N-4 其余接入点一并 Markdown 化

**来源**：客户追加「代办也要在右边显示」+「都要 markdown 化」。**属本角色边界内**。

- **N-3**：`session:role-state` 载荷增**结构化** `queue`（来源/摘要/**入队时间**）+ `running`（**正在跑的那条投递**；settled/失败/dispose 撤销；直接 send 的一轮不入表）——**同一通道、与 summaries 同源，不造第二套数据源**。右栏新增同级 `details.sec`「**待办 / 队列**」（默认展开，计数徽章）：每行=位置（排队 1..N / 「**进行中**」在最前）+ 来源标签（`su 派发`/`客户消息`/`回交投递`）+ 摘要（**有界截断 80**，长内容不铺开）+ 入队时间（本地）；**每字段 esc**；空队列占位「（无待办）」；`onRoleState` **定点更新**（不重排手风琴）；纯映射在 `ui-labels.js`。**排队 ≠ 已执行**。
- **N-4**：变更记录正文 + 文档索引（路径清单，`- path` 列表）+ **回交卡摘要**改经**同一 `Md` 管线**（同 esc/白名单）；**边界条目保持结构化表格**、**证据列表保持逐条 esc**（不拼 Markdown）；派发卡 `mi-body` 本已走管线（无改动，如实）；样式收敛为通用 `.card-md` 钩子。
- **测试**：`renderer.test.ts` N-3/N-4 两例（夹具逐条渲染/截断/空占位/esc 反向；三接入点经 Md + XSS 反向〔script/img onerror/iframe〕+ esc 单一来源未破）；`message-queue.test.ts` 快照结构断言扩（结构条目+进行中）；e2e 增 `RIGHT_QUEUE_*` 探针（未跑，登记）。
- **证据**：`test/桌面应用` **149 计/148 过/1 红**（唯一红=既有环境红）；全量 **847/844 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_right-queue-panel.md` 与 `..._ui-button-label-and-card-markdown.md`（N-4 节）。

## 2026-10-12 — N-1 导入/切换项目按钮文案 + N-2 右栏角色卡 Markdown 渲染

**来源**：客户原话「导入项目之后，按钮名字变成切换项目」「右边的角色卡要有 markdown 渲染」。**属本角色边界内**。

- **N-1**：新增纯映射 `ui-labels.js::pickProjectLabel(hasProject)`（`true⇒切换项目`；其余/清空回退⇒`导入项目`；只认布尔转写）；renderer `updatePickButton()` 判据=**已有状态 `state.projectRoot`**（不靠界面猜测），在 `applyListing`（导入/切换同一落定路径）与初始各刷新；按钮 id 实为 `#btn-import`（派工单写的 `#btn-pick-project` 与实件不符——按实件接线）；文案去掉旧省略号「…」（与客户原话逐字一致）。
- **N-2**：`renderRight()` 角色卡由 `esc(cardText)` 改为 **`Md.renderMarkdown(cardText)`（既有管线**：同一 esc 单一来源、html:false 白名单、链接 `rel`+`md-link`、图片=原文文本——逐条适用）；容器加 `card-text card-md`；样式解除 pre-wrap、块级/代码块/链接与聊天流同款。**边界/变更记录/文档索引三组未动**；**登记**：变更记录同走 `.card-text` 纯文本——如愿同享 Markdown，改动同款一行，**待裁定**。
- **测试**：`renderer.test.ts` **+2 例**（N-1 两态/回退/判据源码钉/装载顺序/初始静态文案；N-2 XSS 反向用例 + 经 `Md.renderMarkdown` 钉 + 不再裸 esc 钉 + esc 单一来源未破 + 三组未动反向钉 + 样式钉）；e2e 增 `PROJECT_BTN_*`/`RIGHT_CARD_MD_*` 探针（未跑，登记）。
- **证据**：`test/桌面应用` **143 计/142 过/1 红**（唯一红=既有环境红）；全量 **841/838 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_ui-button-label-and-card-markdown.md`（含不符之处 2 条）。

## 2026-10-12 — M-1 美化 shell 确认框：应用内确认卡替代原生对话框

**来源**：客户看截图原话「这个太丑了」（原生 dialog 正文=技术文本墙）。**属本角色边界内**。

- **数据面（纯函数）**：`shellIntentSummary`（摘要**只取命令首词**、不编意图）、`plainReasonFor`（升级原因→人话；`risky`/超时/解析失败/不可用/拿不准各有专句；**未识别给通用 fail-closed 句，行话不外露**，原始措辞只进折叠详情）、`buildShellConfirmRequest`、`createShellConfirmPresenter`（**恰 `allow:true` 才放行**；未知 id → `expired` 不放行；关窗 ⇒ 全部不放行；清理兜底只清内存+不放行——判定以通道先到者为准）。
- **通道（main.ts）**：原生 presenter **退役**；`shell:confirm-request`（主→渲染数据面）+ `shell:confirm-response`（渲染→主决定）；推达失败⇒抛错⇒通道 unavailable。arm 语义不变（两件同备；仅项目角色）。
- **卡片（renderer）**：弹层标题「shell 命令请求」；命令**逐字**等宽 `<pre>`（不折行/可横滚、textContent、不美化）；白话摘要位；人话「为什么问你」；`<details>` 详情默认收起（argv/cwd + 引号注明 + 审核原文）；按钮 `放行执行/拒绝`（**拒绝默认焦点**）；Esc/关闭（×）/拒绝 = **不放行**；失效态如实（「未获放行」）。**无计时器**（G-1 纪律）。
- **测试**：`operator-channel.test.ts` **23/23**（数据面逐档含「不含内部用语」断言 + presenter 五路 + 原生对话框退役钉）；`renderer.test.ts` 卡片结构/fail-closed/样式钉；既有 fail-closed 三连保留；e2e 增 `SHELL_CONFIRM_*` 探针（未跑，登记）。
- **证据**：`test/桌面应用` **141 计/140 过/1 红**（唯一红=既有环境红）；全量 **836/833 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_shell-confirm-card.md`（含取舍：折叠详情保留「审核原文」一行、摘要只给首词、卡片不限期+超时归通道）。

## 2026-10-12 — shell 闸 (c) 规则集**实件注入**接线（客户重发授权）

**来源**：客户重发授权（真机暴露：生产 arm 只注 (a) 未注 (c) ⇒ 闸一律拒绝 ⇒ su 如实报「环境无 shell」）。**属本角色边界内**。

- **构造点**：`operator-channel.ts::buildDesktopShellArming`——**只读导入** `src/service/gate/shell-rules.ts` 的 `classifyShell`（**同一函数引用**）+ `defaultShellRules()`；形状 `Omit` 自编排 `AssembleShellGateOptions`（不复制实现、不另立形状）。**任何一步失败 ⇒ undefined = 不 arm**。
- **接线（与 (a) 同一处）**：`main.ts`——`shellArming = ARMED ? buildDesktopShellArming() : undefined`；**两件同备才 arm**（(c) 失败 ⇒ 连 (a) 通道也不构造——`run_shell` 不注册，绝不半装）；主进程如实打一行日志（无敏感值）。`session.ts` 与 (a) **同判据**（`role.builtIn`——仅项目角色；su 不 arm）→ `openRoleSession({ shellArming })`（编排 `run-role.ts:303` 已消费）。
- **测试**：`operator-channel.test.ts` **19/19**——构造**引用同一性**（classifyShell 实件；rules 经加载器原样透传，桩件**不真跑命令**）、失败路径⇒不 arm、注入判据扩两件（su 不收；未配置时两字段都不出现）、arm 决策源码钉改为「两件同备才 arm」；外加**接通核查**（真实 `openRoleSession`+真实装配 ⇒ `capabilities.shellGate` 确实产出——「是否已真正接通：是」的依据）。
- **证据**：`test/桌面应用` **136/135/1**（唯一红=既有环境红）；全量 **830/827 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_shell-arm.md`（补丁节）。

## 2026-10-12 — L-1 每角色任务队列（可见性 + 客户消息入队）+ 状态准确性（真实信号 + 图标化）

**来源**：客户裁定「每个角色如果正在工作，应该可以有个队列的概念…」（现为直接失败）+「执行的时候这个状态显示不对吧…应该用图标来表示」。**属本角色边界内**。

- **入队（不再直接失败）**：忙时客户消息作为**第三类** `DeliveryItem`（`kind:"message"`）并入**同一条**投递机（E-1/H-1 共用）；`{ok:true, queued:true, position:N}` → 界面如实提示「已入队：等它完成当前任务后处理（第 N 位）」；空闲路径逐字不变；失败语义不变（如实系统行 + 放回队首 + 未丢弃）。**无优先级/抢占**（登记）。
- **可见性**：新通道 `session:role-state`（`{roleId, busy, summaries}`，忙/闲切换与队列变化时外推）→ 左树徽标「◐ 工作中 · N 待办」+ 该角色聊天流的**队列行**（原位更新、常驻流尾）。
- **状态准确性（重点）**：判据只许**真实信号**（会话 busy〔含 B-2 后台轮次〕/ 队列深度 / 已 dispose）；**界面侧推测退役**（旧 `working` 事实从纯函数删除，反向断言钉死）。**复现 → 修后**：投递开跑的一轮，旧事实组合派生「空闲」（复现「其实在跑却显示空闲」）；真实快照 busy⇒「工作中」；队列待办不得显示空闲。
- **图标化**：七态 `{icon,label,className,title}`（○/●/◐/?/■/✕/◌）；「停止」措辞唯一（`STOPPED_LABEL="已停止"`，标签与悬停只此一处 + 渲染侧反向断言）。
- **顺带修复两处真机缺陷**：① 自动开 su **抢活动角色** ⇒ 用户消息错发 su → `openInternal(userInitiated)`，后台开启不改 activeRoleId；② 投递机**并发重入**（双 drain 抢同一队列）⇒ su 重复开启 + 误报「形状不符」→ 项目级**串行门** `drainChains`。另：demo 适配器补发 `settled`（对齐真实适配器——忙态复位依赖它，绝不可删）；send 改**先置忙再 await**（防快适配器事件竞态）。
- **测试**：新增 `message-queue.test.ts`（7 例，含复现对照与并发修正钉子）；`renderer.test.ts` B-3 组重写；`interface.test.ts`/`session.test.ts` 适配 L-1 时序（替身推 settled）。
- **证据**：`test/桌面应用` **136/135/1**（唯一红=既有环境红）；全量 **830/827 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。e2e 增 `ROLE_STATE_*` 探针（未在本机跑，如实登记）。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_message-queue-and-role-state.md`。

## 2026-10-12 — K-1 胶囊输入框 + K-2 图片发送（到主进程为止；送模型未接）

**来源**：客户裁定（设计 K 组）。**属本角色边界内**。

- **K-1**：输入区改**圆角胶囊**（`#composer-capsule.capsule`：附件键 + 无边框 textarea + **内嵌圆形发送箭头**）；旧「输入框+独立发送钮」行结构退役；Enter/Shift+Enter、发送禁用态、状态位（chat-head）逐字保留。
- **K-2**：图片**选图/粘贴/拖入** → 缩略图 chips + 移除键；**渲染进程不碰文件**（新 IPC `app:pick-image`/`app:attach-image`，读文件在**主进程**；base64 交 Interface **按真实字节**校验——魔数嗅探类型、≤5MB、png/jpeg/webp/gif 白名单，**扩展名不作数**；取消=`cancelled`≠失败）。校验纯逻辑在 `composer-images.ts`。
- **⚠ 未接（如实登记）**：**图片送进模型未接线**（Pi适配器核实 SDK 图片内容块中）——发送时如实说明「N 张图片未发送」、图片保留在输入区，**绝不假装已读图**；网关多模态若不支持，届时须如实说「未能识别图片」（登记义务）；图片 base64 未来进会话 JSONL 的体积影响登记（跨角色）。
- **测试**：新增 `composer-images.test.ts`（3 例）+ `renderer.test.ts` K-1/K-2 钉（含「发送键在胶囊**之内**」「渲染侧不碰 fs」）；e2e 探针同步（`COMPOSER_ROWS_ARE_ATTACH_AND_CAPSULE` 等，未跑）。
- **证据**：`test/桌面应用` **136/135/1**（唯一红=既有环境红）；全量 **830/827 · 2 红**（两红均既有环境红）；`npm run typecheck` **0 错**。Node v24.14.0 / Darwin arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_k-input-capsule-and-images.md`。

## 2026-10-12 — I-1：开放 shell（桌面 arm + (a) 确认框接线，仅项目角色）

**来源**：设计稿 I-1；**客户裁定（2026-10-12）**：「现在开放 shell，然后 shell 需要 su 审核一下。如果 su 觉得危险可以让客户决定」。**属本角色边界内**。

- **arm 点**：`DESKTOP_SHELL_GATE_ARMED` `false`→**`true`**（顶部文档重写：新裁定 + **已知风险**；旧「V1 不 arm」记录留作历史）。
- **接线**：`main.ts` 在 arm 时构造既有 (a) 通道（`createElectronOperatorPresenter`：逐字命令原文 + 放行/拒绝，**拒绝为默认与取消项**）→ `createDesktopInterface({ shellOperatorChannel })` → Interface/`SessionManager` → `openRoleSession` 入参 `shellOperatorChannel`（**编排据它装配 (c)/(b)/(a) ShellGate**——其 `shell-arming.ts` 在制品、run-role 接线未落前静默忽略，登记）。**仅项目角色**（`role.builtIn` 判据；**su 不 arm**——审读者不给自己开闸）。历史 `shellGate` 直注接缝保留。
- **fail-closed 不变**：关窗/取消/拒绝/超时/抛错 → 不放行（既定三条退路）；「恰 allow 才 spawn」在 Pi 适配器 execute。
- **留痕核实**：结果进事件流（拒绝 `run_shell 未执行：审核拒绝（…）`→`denied` 事件；tools.ts:571/576/586，toolCallId 逐调用透传）+ 编排审计文件 by/branch；**对话框呈现本身不在事件流**（如实登记）。
- **已知风险（登记）**：**无沙箱**——放行命令真实执行，命令内写入**不经过写门禁**（`run_shell` 无 path）——放行的命令可绕过写边界；缓解=三层链+交客户+审计，非消除（客户知情授权）。
- **测试**：`operator-channel.test.ts` **16/16**（arm 决策含源码钉子：main 开关构造/Interface 透传/session 仅项目角色；**注入判据实测 A 收到、su 不收到**；fail-closed 三连与历史接缝用例保留更名）；全套 **121/120/1**（唯一红=既有环境红）。`npm run typecheck` 本角色 0 错（同期编排在制品 1 错，他角色）。e2e 不 arm（离线演示）——登记。
- 详见 `docs/change/2026-10-12_change_shell-arm.md`。

## 2026-10-12 — 修复真机崩溃：坏形状回交事件喂进 renderHandbackPrompt（未捕获拒绝）

**来源**：真机 `UnhandledPromiseRejectionWarning`（`renderHandbackPrompt` 读 `undefined.taskId`）。**属本角色边界内**。

- **根因**：投递路径是 fire-and-forget（`void this.handleHandback(...)`）——**任何上抛＝未捕获拒绝**；而事件载荷**无形状防御**：`{kind:"handback"}` 缺载荷（或载荷缺 `roleId`）时 `renderHandbackPrompt(undefined)` 直接抛。H-1 泛化后 handback/dispatch 两条渲染路径同处一机，暴露面放大。
- **修复（三层防御，全如实、绝不静默）**：① `handleHandback` 形状守卫（缺载荷/缺 roleId → 系统行「形状不符…未投递」+ return）；② 渲染 try/catch + 整体 catch（失败如实一行、不入队）；③ `drainQueue` **安全壳**（包 `drainQueueUnsafe`，任何意外拦截为系统行）+ 条目正文守卫。正常路径逐字未动。
- **全仓核查**：`renderHandbackPrompt`/`renderDispatchPrompt` 在 `app/**` 仅两处调用（均入队定格；dispatch 入参先过校验）；渲染侧 `ev.handback` 缺载荷已有 `if (!hb) return;`。无其它同类点。
- **回归钉子**：`handback-delivery`/`dispatch-delivery` 各挂 `process.on("unhandledRejection")` **计数断言为 0**（驱动缺载荷/缺 roleId 事件 + 正常 dispatch + 坏回交并入同机）；坏形状如实系统行、不投递；dispatch 条目**不走** handback 渲染（文本逐字断言）。
- **证据**：typecheck **0 错**；`test/桌面应用` **120/119/1**（唯一红=既有环境红）；全量 **794/791/2 红/1 skipped**（两红均既有环境红，非本改动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。
- 详见 `docs/fix/2026-10-12_fix_handback-render-crash.md`。

## 2026-10-12 — H-1：su 派发任务路由（复用 E-1 投递机）+ 系统投递输入单独样式

**来源**：设计稿 H-1（`dispatch_task` 契约已冻结于 §4 冻结家）+ 客户观察（投递输入不得长得像"客户发的消息"）。**属本角色边界内**。

- **路由（`session.ts`，E-1 投递机泛化——不造第二套）**：队列条目 `DeliveryItem`、按「项目×目标角色」队列、`settled` 放行本项目各队列；目标未开→**自动开**、忙→**排队按序**、失败→**如实系统行+放回队首**（E-1 文案逐字保留）。**`routeDispatch`**（仅 su 会话注入 `dispatchTask`）：校验三连（空参/不在本项目/内置治理角色含 su 自身）→ **如实回执 `{ok:false}` + 系统行**；受理回 `{ok:true,"已受理…受理≠已完成"}`；**去重=队列期窗口**（`roleId\0task\0reason`，送达即释放——返工可再派；回交去重仍永久）。
- **依赖登记**：① `renderDispatchPrompt`（编排）未落地 → `renderDispatchPromptLocal` 按设计模板逐字临时顶（落地后切只读导入、删本地，**不得两处并存**）；② `openRoleSession` 入参字段 `dispatchTask` 待编排承接（现为静默忽略我方透传）。
- **闭环**：su 派发→目标回交（E-1）→su 验收→可再派；除显式输入外无事件再触发派发——**不自我激发**（静置计数断言）。
- **注入样式**：`tool-rows.js::classifyInjectedMessage`（前缀表 `INJECT_PREFIXES`=`[回交] `/`[派发] `，**两名编排渲染函数的定格格式、非启发式**）；`.msg-injected`（虚线框+图标+来源标签「回交投递 · 来自 X」/「派发 · 来自 su」）**不与 `.msg-user` 同款**；D-1 回放同类；**手输防误伤**（`lastManualSend` 同角色 15s 窗口 + 前缀须在行首）。
- **测试**：新增 `dispatch-delivery.test.ts`（6 例：自动开/排队/失败保留/校验三连/去重窗口+返工放行/闭环不空转）；`renderer.test.ts` 增分类器与注入样式组（含 **`.msg-user` 仍由 appendUser 专产的反向断言**）；e2e 增 `INJECTED_*`/`MANUAL_*` 探针（已同步未跑）。
- **证据**：typecheck **0 错**；`test/桌面应用` **118/117/1**（唯一红=既有环境红）；全量 **792/789/2 红/1 skipped**（两红均既有环境红，非本改动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_dispatch-routing-and-injected-style.md`。

## 2026-10-12 — G-1：交互卡不再按时间过期（唯一失效＝应用重启/关闭）

**来源**：客户裁定（设计 G-1）「没必要超时啊，就卡在这等客户同意呗」。**属本角色边界内**。

- **删"按时间过期"路径**：桌面本就无计时器（复核：renderer/通道/三个纯函数模块**均无 setTimeout/setInterval**）；本次把措辞与注释里的时间性删净（旧「超时或已被处理」不再出现）。
- **唯一真实失效终态**：`respond` 对无挂起请求仍回 `{ok:false, expired:true}`，语义收窄为**应用关闭/重启**（未决请求随窗口清空）；卡定格文案改如实——「**请求已失效（应用已重启/关闭），未获同意——请让角色重新发起。**」；通道原因「没有待答的交互请求（应用重启/关闭会清空未决请求）」。
- **等待期覆盖核实**：B-3「等待你确认」按挂起集重算（无任何"等太久"改变态）；未查看指针常驻直到请求被处理——两者**均事件驱动、无时限**。
- **测试**：「无计时器」钉子（去注释源码断言）+ 旧时间性措辞**不得**存在 + 重启后旧 id → 失效终态与如实文案 + 已作答仍定格；e2e `OPX_EXPIRED_FROZEN` 文案片段改「已失效」。
- **证据**：`test/桌面应用` 全套 **111 计/110 过/1 红**（唯一红＝既有环境红 pi-config，未动）——G-1 钉子全绿。**并发如实（最终复跑）**：Pi适配器并发移除工具层超时，**剩余 3 处 typecheck 错全在其自身 `test/pi-adapter/customer-input.test.ts`**（他角色在制、非本改动）；全量 **739/735/3 红/1 skipped**（＝其该文件文件级红＋两既有环境红，均非本改动）；本角色套件在上述并发期仍 110/1（本改动红为零）。
- **跨角色建议**：去时限落点在 **Pi适配器**（停用/移除 `withTimeout` 对该两工具的作用；`ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 处置归其）。**残留（适配器仍超时期间）**：工具已判"未获同意"而桌面无信号可辨、卡仍 open，其后作答会显示"已确认"但上游已弃——界面与工具可能不一致；正路＝适配器停用该时限，桌面不自造第二套计时。
- 详见 `docs/change/2026-10-12_change_no-timeout-cards.md`。

## 2026-10-12 — 真机修复：交互卡严格投递所属 pane（不再只在被查看的会话可见）+ 工具行瘦身

**来源**：客户真机缺陷（卡只在"当时正被查看"的会话可见 → 110s 空转超时）＋客户追加裁定「工具行只显示状态与目标，不显示内容」。**属本角色边界内**。

- **卡修复（根因：修复前 `renderer.js:295` 的 `?: state.selectedRoleId` 回落**——roleId 为空时把卡落进"当时在看"的 pane，切回请求者看不到）：① roleId **只信 payload**（空值走 `(未标识角色)` 兜底并如实提示，**绝不**冒充当前查看角色）；② **挂起登记表** `opRequests`——一条请求一次渲染（幂等，同 id 重复推送不重卡）、幂等物化、`showPane` 切回**补挂**；③ 非当前查看时向当前 pane 放**只读指针**「【待确认】角色 <X> 有一条交互请求…」；④ 徽标按「任一 open 请求」重算（多请求并存正确）；⑤ **过期终态**：`customer-input.ts::respond` 对无挂起请求回 `{ok:false, expired:true}` → 卡定格「该请求已结束（超时或已被处理）——未获同意。」**不再解冻重试**（可重试的非法决定不带 expired）。
- **110s 窗口**：**不改计时**（时限唯一来源=Pi适配器工具层；桌面不自造第二套计时）；「未查看」本质是可见性，已用三重可见性解决（正确 pane 的卡 + 徽标 + 当前 pane 指针）。**跨角色建议（未做）**：如需「时限从首次可见起算」——桌面出 `operator-seen` 信号、**Pi适配器**出「按 seen 重新计时」，契约落地前桌面绝不自行暂停/重启计时。
- **工具行瘦身**：新增纯函数 `app/renderer/tool-rows.js::slimToolRow`（首行＋掐「 # 」预览分隔与「 · 」列表＋重复工具名去重＋长无路径内容折叠＋限 140 字；成功/失败词与**失败原因摘要**保留）；实时 `tool_call`/`accepted` 与 D-1 回放工具行均经它；**`denied` 行保持全量**（治理信号）；**`detail` 一律不渲染**（防御）。
- **测试**：`renderer.test.ts` +2 组（卡修复源码断言 + 工具行「长内容反向断言/真机样例逐字/折叠/原因保留/接线/detail」）；`operator-wiring.test.ts` +1（未知 id→expired 终态 vs 非法决定→可重试）；e2e 加 7c `OPX_*`（跨 pane/指针/徽标/幂等/过期定格）与 `TOOLROW_*`。
- **证据**：typecheck **0 错**；`test/桌面应用` **111/110/1**（唯一红=既有环境红）；全量 **756/753/2 红/1 skipped**（两红均既有环境红，非本改动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。e2e 已同步、本轮未跑。
- 详见 `docs/change/2026-10-12_change_operator-card-delivery-and-tool-rows.md`。

## 2026-10-12 — B-1 修订：Markdown 渲染改用第三方库（vendored markdown-it 15.0.2）

**来源**：客户修订（设计稿 B-1 加注「应该用第三方的」）——「自写最小子集」路线**被取代**。**属本角色边界内**（`app/renderer/**`、`test/桌面应用/**`）。

- **选型**：**markdown-it 15.0.2**（`html:false` 默认转义=不必另配消毒器；官方 UMD 单文件自带依赖、无打包器可用；MIT）——弃 marked（HTML 原样透传，须加 DOMPurify，多一部件）。
- **vendored（pin + 可校验）**：新增 `app/renderer/vendor/{markdown-it.umd.min.js（sha256 635972b9…7be5）, markdown-it.LICENSE, README.md}`；README 记**版本/许可/来源 URL/sha256/升级步骤**（升级须同步 README+测试两处 pin，**不得带红升级**）。**未动 package.json**（属装配）。
- **`markdown.js` 重写为封装**（接口不变：`esc` 单一来源 + `renderMarkdown`；新增钉子面 `options`/`createRenderer`）：链接白名单 http/https/mailto + `class="md-link" rel="noopener noreferrer"`；围栏/缩进码块输出既有 `.md-pre`/`.md-lang`（内容经唯一 `esc`）；**图片覆写为原文文本**（只 disable 会回落成链接+孤立 `!`）；表格禁用（O-B1 未准）；`breaks:true` 保持聊天换行。
- **装载**：`index.html` 顺序 vendor → markdown.js → renderer.js（测试钉住）。styles 未动；`renderer.js` 未改。
- **测试**：`markdown.test.ts` 重写——语法逐字钉输出；**XSS 负例 7 组**（含引号注入 href→百分号编码现场断言）；**`options.html===false` 钉子 + 「html:true 会直通」演示**；**vendor sha256 pin + 装载顺序 + README 一致性**。`renderer.test.ts` B-1 冒烟同序装载。
- **证据**：typecheck **0 错**；`test/桌面应用` **108/107/1**（唯一红=既有环境红 pi-config，未动）；全量 **753/750/2 红/1 skipped**（两红均既有环境红，非本改动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`；vendor sha256 实测=pin 值。
- 详见 `docs/change/2026-10-12_change_markdown-vendored-library.md`（原 B-1 记录加「同日修订」指针，保留为当时记录）。

## 2026-10-12 — E-1：回交自动投递 su 验收（全自动）+ D-1 契约下的上下文来源文案（失真提示退役）

**来源**：pm 设计稿 E-1（客户裁定全自动、无开关）；同轮 pm 钉死 D-1 契约（dispose/LRU **不擦除**会话文件）。**属本角色边界内**（`app/`、`test/桌面应用/**`）。

- **E-1 投递机（`session.ts`）**：回交（≠su）到达 ⇒ **去重**（`handbackKey` 单一来源，入队即登记）→ 入队 →
  尝试投递：su **忙**（`LiveSession.busy`，send 置真/settled 置假）⇒ 排队，**按序、先置忙再 send**（防并发）；
  su **未开** ⇒ **自动开启**（数据驱动 primaryRoleId）再投；**开启/投递失败 ⇒ 如实系统行**（su 的 pane，含
  原因 +「已保留 + 重试时机」）**+ 放回队首**待重试——**绝不静默丢**。投递文本 = 编排 `renderHandbackPrompt`
  （只读导入、两前端共用）。**不做**：CLI 前端同等投递（登记）。
- **D-1 文案分支（pm 契约结论）**：`probeSessionFile`（文件在/不在/坏）→ `OpenResult.contextSource`
  （resumed/recovered/fresh）+ `contextWarning`；文案**唯一映射** = `role-status.js::sessionContextNotice`。
  **「模型上下文已重启」失真退役**——dispose 后/LRU 后重开=「已从本地会话文件恢复」；**只有**文件缺失/损坏
  →新建 才是「不会记得」（有历史才提示；损坏带「损坏」措辞）。逐情形对照表见 change 文档。
- **测试**：新增 `handback-delivery.test.ts`（5 例：投递单一来源原文/去重/忙时按序排队/未开自动开/两种失败如实+保留重试）；`renderer.test.ts` 增 `sessionContextNotice` 六断言 + 失真文案反向断言；`session-history.test.ts` 增 `probeSessionFile`；e2e 加 `RESTORE_NO_STALE_RESTART_NOTE`。
- **证据**：typecheck 0 错；`test/桌面应用` **106/105/1**（唯一红=既有环境红）；全量 **751/748/2 红/1 skipped**（两红均既有环境红，非本改动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。e2e 已同步、本轮未跑。
- 详见 `docs/change/2026-10-12_change_su-handback-acceptance.md`。

## 2026-10-12 — D-1 重启恢复（桌面面）：项目内会话记录的界面回放 + 徽标「空闲（已恢复）」

**来源**：pm 设计稿 D-1（存储＝项目内 `<projectRoot>/.ans/sessions/<roleId>/`；解析/恢复链路由 Pi适配器+编排）。**属本角色边界内**（`app/`、`test/桌面应用/**`）。

- **新增 `app/desktop/session-history.ts`**（纯逻辑+只读 fs；不依赖 electron/Pi SDK）：最近文件挑选（mtime 优先、并列名字大者）；`parseSessionJsonl` **防御式**（坏行/未知 entry/未知 role 跳过不抛并计数；header 不合法整体失败）；entry → `{kind:user|assistant|tool|denied, text, at}`；`readRoleSessionHistory`（无目录=无历史；**跨角色不串**；坏文件 `ok:false` 不抛）。
- **`main.ts`**：`app:list-project` 后逐角色读取并推 `session:history`（无内容不推；失败不阻断导入——**解析在主进程，渲染进程不碰 SDK/JSONL**）；**`preload.cjs`** 加 `onSessionHistory`。
- **`renderer.js`**：回放（虚线分隔+「会话已恢复（模型上下文一并恢复）」；`is-replay` 与实时可区分；助手文本走 Markdown/esc 单一来源；未就绪推送**寄存**、`applyListing(fresh)` 后冲洗不串项目）；selectRole 提示分流（恢复者说「已续接恢复的会话」，其余维持 B-2「已重启」文案——互涉已知、登记待编排确认）。
- **`role-status.js`**：七态（新 `idle-restored`「空闲（已恢复）」，空心绿点——不假装工作中/未开启）。
- **测试**：新增 `session-history.test.ts`（4 例，含跨角色不串/坏文件）；`renderer.test.ts` B-3 扩七态 + D-1 组；`e2e` 加 `RESTORE_*` drill。
- **证据**：typecheck 0 错；`test/桌面应用` **99/98/1**（唯一红=既有环境红）；全量 **742/739/2 红/1 skipped**（两红均既有环境红，非本改动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。e2e 已同步、本轮未跑。
- **登记**：①「新会话」入口与②历史裁剪本轮不做——恢复后无法开干净新会话、长会话全量回放，**建议另派**。
- 详见 `docs/change/2026-10-12_change_session-restore.md`。

## 2026-10-12 — C-1 桌面面：回交报告卡片（字段呈现 + 转义 + 空证据占位 + blocked 视觉区分）

**来源**：pm 已批准设计稿 §C-1（客户裁定「新增交报告工具」；报告经**既有 `handback` 事件**回流——**桌面不新增任何 IPC/通道**）。**属本角色边界内**（`app/renderer/`、`test/桌面应用/`）。

- **`renderer.js::appendHandback`**：卡片按 **角色 / 任务（若有）/ 结论 / 摘要 / 证据（逐条）** 呈现；摘要与证据一律经 `esc`（`markdown.js` 单一转义来源——模型输出**禁直插**）；**空证据 → 「（未提供证据）」**（不留空白）；**blocked → `is-blocked` 类**（可查的可见区分）。分发未动（B-2 信封：自己的 pane + 镜像进主入口角色 pane；**核查无跨角色串扰**——仅两处落点 + 自镜像守卫 + 编排侧 su 不挂回交）。
- **`styles.css`**：`.msg-handback.is-blocked` 左**语义色竖条** + 语义边色（不只靠文字）。
- **测试**：`renderer.test.ts` T20 扩展四组断言（字段行 / `esc(hb.summary`+`esc(e)` 与「不得直插」负例 / 占位文案 / `is-blocked` 类与 `var(--danger)` 样式钩子）；镜像断言保留。`e2e/main.mjs` 镜像卡 +2 检查点（`MIRROR_EVIDENCE_PLACEHOLDER`/`MIRROR_CARD_IS_BLOCKED_VISUAL`）。
- **证据**：typecheck **0 错**；`test/桌面应用` **94/93/1**（唯一红=既有环境红 pi-config，未动）；全量 **701/698/2 红/1 skipped**（两红均既有环境红，非本改动；总数随他角色并发在制波动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。e2e 已同步、**本轮未跑**。
- 详见 `docs/change/2026-10-12_change_handback-report-card.md`。

## 2026-10-12 — A-5：客户交互卡与通道泛化 + 收口面删除 + B-3「等待你确认」接线

**来源**：pm 已批准设计稿 §三 A-5（编排 A-3/A-4 与 Pi适配器契约已落地）。**属本角色边界内**（`app/`、`test/桌面应用/`、本角色 docs）。

- **新增 `app/desktop/customer-input.ts`（纯逻辑通道）**：冻结三型（`CustomerInputRequest`/`Outcome`/`Fn`）从 §4 冻结契约家**只读导入**；per-window pending Map + 关联 id；**按请求快照校验**（选项 id ⊆ 已发、单选恰一个、类型相符——非法回包不受理、pending 保留）；归三态。**fail-closed 四条**：未接线→unavailable；窗关（presenter 抛错/rejectAll）→declined；取消/不同意→declined；超时在 Pi适配器工具层（=unavailable）。
- **通用交互卡（`renderer.js::appendOperatorRequest`）**：`op-kind-confirm/preview/select/multi`；预览=`details` 折叠+`max-height:40vh`+`pre-wrap`；选择=radio/checkbox+提交（空选择禁用）；提交后**定格**、被通道拒收则解冻重试并如实示因；**B-3「等待你确认」随请求亮/灭**（不再留位）。
- **收口面删除（断言「它不在」防回潮）**：`#bootstrap-action` 链、`appendFinalizeProposal`/`appendFinalizeResult`/`onFinalize`/`refreshBootstrapAction`、`.fp-*`/`.sys-finalize`/`.bootstrap-action` 样式、IPC 四通道（`session:finalize-proposal`/`-confirm`/`session:finalize`/`session:bootstrap-state`）、preload 四方法；`session.ts` 删 `FinalizeResult`/`BootstrapState`/两方法/`genesisFinalize`/`operatorChannel`/`confirmTimeoutMs`，注入判据改「**内置治理角色（builtIn）** → `customerInput`（roleId 每会话闭包绑定）」。产物收尾由编排 settle 后**自动**完成。
- **测试**：**删 `finalize-wiring.test.ts`（15 例，打的是已删 API）**→ **新增 `operator-wiring.test.ts`（5 例）**：三态+fail-closed 四条+快照校验负例+注入判据/roleId 绑定；`interface.test.ts`/`renderer.test.ts` 对应段改写；`e2e/main.mjs` 同步（真通道 + `OP_*` drill + `BOOTSTRAP_ACTION_REMOVED` 守卫），**本轮未跑**。
- **证据**：typecheck **0 错**；`test/桌面应用` **94/93/1**（唯一红=既有环境红 pi-config，未动）；全量 **706/703/2 红/1 skipped**（两红均既有环境红，非本改动）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_operator-cards-and-finalize-removal.md`。

## 2026-10-12 — B 组聊天体验：Markdown 渲染 + 切换保留历史（并存会话）+ 角色状态徽标

**来源**：pm 已批准设计稿《受治理交互与聊天体验》B 组（客户确认：B-2 走路线 a「并存会话」；B-3 同日补充并入）。**属本角色边界内**（`app/`、`test/桌面应用/`）。**A 组（交互卡/通道泛化/收口面删除）留下一轮**（等 Pi适配器 + 编排契约落地）；「等待你确认」态**留位**（A 组前恒不出现）。

- **B-1 Markdown**：新增纯函数 `app/renderer/markdown.js`（**先 `esc()` 再解析、只产白名单标签**；`esc` 收归此处为**单一来源**，renderer.js 原本地实现已删）；`appendUser`/`appendAssistant` 改受控渲染、`sys-*` 保持 esc；链接经 `app:open-external` **外开**（Interface 层仅 http/https 校验——渲染进程输入不可信）；表格/图片不做。
- **B-2 并存会话**：`session.ts` 单 handle → **`Map<roleId, LiveSession>` + LRU**（`MAX_LIVE_SESSIONS=3`，淘汰即 dispose）；事件外推加 **`roleId` 信封**（`SessionEventEnvelope`，多会话不串消息）；**后台持续消费**（切走不停拉）；`stop(roleId)` **定向**（缺省/null=全部）；`open()` 返回 `resumed`。渲染侧：**每角色一个 chat pane**（游离 DOM 保历史与监听器）、`selectRole` **不再 `clearChat`**、LRU 淘汰/显式停后再开在该角色聊天流里**明示「模型上下文已重启」**；新增 `session:live` 通道（左树状态数据源）。
- **B-3 角色状态徽标**：新增纯函数 `app/renderer/role-status.js`（六态派生 + 文案/样式的**唯一映射**；**只由既有事实推导，不发明进度/预计时间**）；左树色点+短标签（`未开启/空闲/工作中/等待你确认/已停止/错误`）；**悬停**示「最近事件（时间）：摘要」（复用事件流）。
- **测试与证据**：`npm run typecheck` **0 错**；`node --test "test/桌面应用/*.test.ts"` → **103 计/102 过/1 红**（基线 95/94/1，净增 8 例；**唯一红为既有环境红**——`pi-config` 断言检出目录名以 `ans-cli` 结尾、本机为 `ans-runtime`，未动）；全量 **723/720/2**（两红均既有环境红，非本改动）。锚点：`session.test.ts`「A→B→A 不 dispose A（open 计数=2）」「LRU 逐出」；`renderer.test.ts`「selectRole 不得无条件 clearChat」「六态映射随状态变」；`markdown.test.ts` XSS 两向断言。e2e 已同步新形状并新增 `HISTORY_KEPT_ON_SWITCHBACK`/`MD_*`/`LINK_OPEN_EXTERNAL_CALLED`/`STATUS_BADGE_*` 检查点，**本轮未跑**（真实验收属客户跑）。Node v24.14.0 / Darwin 25.6.0 arm64 / HEAD `d933537`。
- 详见 `docs/change/2026-10-12_change_markdown-and-multisession.md`。
- **并发说明**：上列计数为本改动集已就位时刻的实测；随后编排/Pi适配器 A 组在制品改动 `src/**`（`finalize.ts` 导出移除瞬时致全仓加载失败）——**属并发在制品、非本改动**；待其落地后复跑最终确认（已登记）。

## 2026-10-12 — 更正会话路径注释（T32 后理由已过时；含历史条目指针）

**来源**：编排角色如实指出 + 本角色独立核实（逐行读当前源码，**未采信转述**）；客户 2026-10-12 批准 **M1+O1** 后实施。**属本角色边界内**（`app/`、`角色卡/桌面应用/`）。**代码行为零变化**（会话仍经 `openRoleSession` + `scope: undefined`）。

- **M1——`app/desktop/session.ts:287-295` 注释块整体替换**：删去过时理由——「开会话前先经 `writeGovernanceSkeleton` 落骨架（属 T32 待退役面）」（T32 已落地、骨架模块 `src/common/编排/bootstrap.ts` 已删）与「对空项目产出 `writeSet: []`、F4 精确匹配拒一切写、须改它本身」（引擎现行 `effectiveScope` 收窄：`conditions`/`writeSet` 均空时取 `undefined`，`src/pipeline/orchestration/govern-session.ts:159-164`）；行号 `govern-session.ts:121` → `170`。**仍成立的部分保留**（T30 裁决、创世门口在边界选择层、「同一底层会话入口、非第二套机制」）。新增「更正（2026-10-12）」段：**指向**引擎 `effectiveScope` 处（不复制，单一来源）+ 注明「桌面是否统一改走该入口：另行评估」（本次未派、未做）。
- **O1——历史条目指针（原文未改写）**：本文件 T30 条目「边界登记」节末尾 +1 行、`memo.md` 的 T30 行末各加「2026-10-12 更正：…见 `docs/change/2026-10-12_change_session-comment-refresh.md`」。
- **有界扫描**：`app/**` 无其它描述同一行为（治理骨架/空 writeSet）的过时注释或文案——本注释为唯一命中；`styles.css` 的「三栏骨架」是界面布局同词异义，已排除。另排查发现同理由残留在本文件 T30 条目与 `memo.md`（已由 O1 指针处理）。
- **证据**：`npm run typecheck` → **exit 0、0 错**；`node --test "test/桌面应用/*.test.ts"` → **95 计 / 94 过 / 1 红**，与改动前基线**逐项一致**；那 1 红为**既有环境红**（`pi-config.test.ts:60` 断言 `resolveRepoEnvPath()` 以 `ans-cli/.env` 结尾、本机检出目录名为 `ans-runtime`），与本次改动无关，**未动、未修**。注释改动**不影响用例计数**（已核对 `test/桌面应用/**` 无用例读该注释）。未跑 e2e（无行为/界面变化）；未启动 Electron、未发模型请求、未读 `.env`。
- 详见 `docs/change/2026-10-12_change_session-comment-refresh.md`。

## 2026-10-11 — Pi 面板瘦身：5 项 → 3 项必填 + 1 项「高级」（客户：「这个 pi 为啥需要配置 5 个呢」——其实不是 5 个）

**来源**：**客户提问**「这个 pi 为啥需要配置 5 个呢」——结论：**其实不是 5 个，真正必须你填的是 3 个**。据此把面板从 5 项改为 **3 项必填 + 1 项可选（收进「高级」）**。**属本角色边界内**（`app/`、`test/桌面应用/`、`角色卡/桌面应用/`）。

### 1) 面板项（`app/renderer/index.html` + `renderer.js` + `styles.css`）

| 项 | 处理 |
|---|---|
| `ANS_PI_BASE_URL`（端点） | **保留，必填**——被红线逼出：拒绝回落任何默认端点，故必须显式给。 |
| `ANS_PI_MODEL`（模型） | **保留，必填**。 |
| `ANTHROPIC_AUTH_TOKEN`（token） | **保留，必填，掩码**（`type=password`、值不回显、只示「已设置/未设置」）。 |
| `ANS_PI_PROVIDER` | **从面板去掉**——代码里**有默认值**（`ans-gateway`）、是**内部标签**、**不是用户该做的决定**；底层仍支持该环境变量，只是不再占输入框。 |
| `ANS_PI_CONTEXT_WINDOW` | **收进「高级」（可折叠）且可留空**——Pi适配器并行改（见下），从「必填」改「可选 + 保守默认」，缺失不再硬失败。 |

- **「高级」那一行说明**（`index.html`，一句话）：**「留空 = 用默认值（偏保守：压缩会提前触发，不会炸会话）；知道确切值就填。」** 落点 `<details class="pi-advanced">`（默认**收起**；`styles.css` 加 `.pi-advanced` 系列——沿用既有令牌、浅色近单色、只有一枚旋转 chevron）。
- **视觉方向不变**（浅色、近单色、极简；圆角只给交互元素）。

### 2) 键集合跟着收（`app/desktop/pi-config.ts`）

- `PI_PANEL_KEYS`：**5 → 4**（`ANTHROPIC_AUTH_TOKEN` / `ANS_PI_BASE_URL` / `ANS_PI_MODEL` / `ANS_PI_CONTEXT_WINDOW`）——`getPiConfig` / `savePiConfig` 的**可写键集合随之收**，`ANS_PI_PROVIDER` **不再被写**。
- **新增 `PI_REQUIRED_KEYS`**（3 项必填）；`missingPiKeys` 改为**只数必填**——上下文窗口可选，缺失**不算**「配置不全」。`renderer.js` 同步引入 `PI_REQUIRED_KEYS`，`renderPiConfigWarning` **只按必填告警**（避免把可选缺失误报成「会被拒」）。
- **`.env` 里已有的 `ANS_PI_PROVIDER` 那一行未被动**——保存只改面板键、逐行替换命中键，其余**逐字节保留**（写纪律一字未动）；掩码/不预填/原子写/只改相关键**全保持不变**。

### 3) 与 Pi适配器新语义对齐（`src/common/pi-adapter/provider-config.ts`——**只读，未动**）

Pi适配器**并行**已把 `contextWindow` 从「必填、缺失硬失败」改为**可选 + 保守默认**（`DEFAULT_PI_CONTEXT_WINDOW = 32768`，缺失回落默认、只有**非法值**才抛错）。本面板的「留空 = 不下发该键」正是**喂给它**的路径：留空 → `.env` 无该键 → 适配器回落保守默认（阈值 32768−16384=16384，压缩会提前触发，**不会炸会话**）。**两侧语义逐点一致**，本角色**未**越界改适配器、也**未**把 `contextWindow` 改回必填。

### 4) 守卫（证明「`provider` 不在面板里」）

- **单测** `test/桌面应用/pi-config.test.ts`：面板键断言改 **3+1**；**反向断言** `!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER")`；`getPiConfig` 视图**不含** `ANS_PI_PROVIDER` 字段（即便 `.env` 有它）；新增「保存时提交 `ANS_PI_PROVIDER` 也被过滤、**已存在的那行原样保留**」用例。
- **渲染侧不变式** `test/桌面应用/renderer.test.ts`：`index.html` **无** `#pi-inp-ANS_PI_PROVIDER`、无 `>ANS_PI_PROVIDER<` 标签；`renderer.js` 键集合**不含** `"ANS_PI_PROVIDER"`、**含** `ANS_PI_CONTEXT_WINDOW` 与 `PI_REQUIRED_KEYS`；`styles.css` 含 `.pi-advanced`；`index.html` 的上下文窗口字段**在 `.pi-advanced` 容器内**且含那一行说明。
- **e2e** `test/桌面应用/e2e/main.mjs`：新增 DOM 守卫 `PI_KEYS_ARE_FOUR` / `PI_NO_PROVIDER_FIELD` / `PI_ADVANCED_PRESENT` / `PI_ADVANCED_COLLAPSED_BY_DEFAULT` / `PI_CONTEXT_WINDOW_IN_ADVANCED` / `PI_ADVANCED_HINT_LEAVE_BLANK` / `PI_TEMP_ENV_NO_PROVIDER` / `PI_TEMP_ENV_OMITS_EMPTY_CONTEXT_WINDOW`。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **95 pass / 0 fail**。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **673 pass / 2 fail**（跑测期间 Pi适配器**并发**更新了其 `provider-config.test.ts`，其先前的 2 条「缺失即抛错」旧语义红已随之转绿；总数波动属多角色并发）——**2 红全在本角色边界外，均未越界改、如实回报**：
  - `test/测试/t29-pi-config-roundtrip.test.ts:75`（**测试角色**：把「`loadPiEnv` 结果 == `PI_PANEL_KEYS`」当断言——provider 已不在面板键，需去掉该耦合）。
  - `test/测试/t29-write-discipline.test.ts:157`（**测试角色**：写入纪律用例把 `ANS_PI_PROVIDER` 当**可写面板键**——它已不在面板键集合，需去掉该用例项）。
  - **两条皆本改动的跨角色后果**（provider 不再可写），需测试角色更新其 T29；**本角色未越界改**。
- **旁注（本角色边界外、未改、如实回报）**：`README.md`（第 79–83 行）与 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md`（第 715 行）仍把 `ANS_PI_PROVIDER` 列为**面板键**、并把 `ANS_PI_CONTEXT_WINDOW` 描述为「**必填，无默认值**」——二者**现在都过时**（provider 已移出面板；上下文窗口已改为可选 + 保守默认）。属他角色/根文档，需协调方同步。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR`=Windows 临时目录）退出码 0、`E2E_DONE=1`，**新增守卫全真**、**既有检查点全过**、截图确认面板 3 框 + 收起「高级」（`09-pi-panel.png`）、保存后 token 仍掩码且不回显（`10-pi-saved.png`）、**无残留 Electron**；真实 `.env` 指纹（size=488 / mtime=1791706923 / SHA-256 `75aee37f…39655`）**逐字节不变**。

## 2026-10-11 — T38：接上 bootstrap 收口的确认面（客户裁定：su 提议 → 客户确认 → 完成）

**来源**：设计 §13/§13.4（**完成方式重定**——客户 2026-10-11：「完成 bootstrap 应该是 **su 主动觉得差不多了来完成**；后面 su 可以动态增加和修改」+「当然需要客户确认了」）+ 派发清单 **T38**。**依赖已验证**：编排 **T37** 已把 `finalize()` 从「**调用即完成**」改为「**提议收口 → 挂起等客户确认 → 恰好 `allow` 才落盘**」（经注入的 `operatorChannel`；通道缺省/不可用/超时〔默认 120s〕/拒绝 → **不完成**）。**属本角色边界内**（`app/`、`test/桌面应用/`、`角色卡/桌面应用/`）。

### 缺口与根因（**那 2 条红**）

本层此前**已有** `app/desktop/operator-channel.ts`（同一 `OperatorChannelFn` 契约），但**没有把它注入 finalize 路径**——编排 `openRoleSession` 新增的 `operatorChannel` 入参**从未被桌面传入** ⇒ finalize 收口时走到 `confirm(undefined)` ⇒ **`unavailable`（未接入客户确认通道）→ 不完成**。这正是 `test/桌面应用/finalize-wiring.test.ts` 两条成功用例红的**唯一根因**（它们按**旧语义「调用即完成」**断言，而 T37 后 `finalize()` 不再「调用即完成」）。

### 1) 接线：客户确认通道注入 finalize（**复用既有 (a)，不造第二套**）

- **复用**：`app/desktop/operator-channel.ts::createDesktopOperatorChannel`——**同一 `OperatorChannelFn` 契约**（`OperatorPrompt → OperatorOutcome`），类型**唯一来源**是 §4 冻结契约家 `src/provider/pi/session.ts`（只读导入、原样转出）。**未新增任何第二套确认机制**。
- **透传链路**：`app/main.ts` 构造通道 → `DesktopDeps.operatorChannel`（`app/desktop/interface.ts`）→ `SessionManagerDeps.operatorChannel`（`app/desktop/session.ts`）→ **仅创世 finalize 会话**（`!hasRoles` 的内置治理角色）经 `openRoleSession({ ..., operatorChannel })` 传给编排。**有角色的普通聊天逐字不传**（不消费该通道）。
- **主进程 presenter（`app/main.ts`）**：把提议渲染为**应用内确认卡**（**不弹系统对话框**）——presenter 把 `OperatorPrompt`（`command` = 提议原文、`reason` = 将写出什么、`toolCallId`）经 `session:finalize-proposal` 推达渲染侧，挂起等 `session:finalize-confirm` 回传；新 IPC `session:finalize-confirm` 解挂该 Promise（→ 通道返回 `allow`/`deny`）。**窗口已关 → 直接非放行**（fail-closed）。
- **fail-closed 四条**（§13.1）：**未接通道 / 通道不可用 / 超时（默认 120s，`createDesktopOperatorChannel` 的硬超时）/ 客户拒绝** → **不完成**，**不写** `.ans`/manifest/治理边界文档（**零副作用**）。

### 2) 确认面（**改造旧「完成 bootstrap」按钮，不删**）

- **提议在聊天流里可见**：`app/renderer/renderer.js::appendFinalizeProposal` 在聊天流 append 一张**确认卡**——
  - 标题：**「su 提议：可以收口了（完成 bootstrap）」**（提议原文，来自 `prompt.command`）；
  - 正文：**将写出什么**（`prompt.reason`，如「将写出：角色卡/governance-boundary.yaml、.ans/project.json、docs/bootstrap-manifest.md（pin N 个边界文件…）」）；
  - **确认面**：`[确认完成]` / `[暂不]` 两个按钮。**只在 su 已提议时才出现**（提议推达才有卡）——**不是**一直挂着的按钮。
- **触发入口（改造的那个按钮）**：`#bootstrap-action`（**仅创世 su 会话**显示）文案由「完成 bootstrap」改「**让 su 提议收口**」——点它请 su 发起收口提议（T37 的 `finalize()` 语义 = **提议、非立即完成**）；提议随即以确认卡呈现。
- **回传与定格**：点 `[确认完成]` → `finalizeConfirm({toolCallId, allow:true})` → 卡片定格「已确认——正在收口…」；点 `[暂不]` → `allow:false` → 定格「已暂不——su 可继续工作；稍后仍可再提议收口」。
- **确认后如实呈现**（`appendFinalizeResult`）：成功措辞由「bootstrap 已完成」改**「项目已转正：bootstrap 已完成——写出 N 项、pin M 个边界文件、角色 K 个」**，正文加一句「项目已从『创世态』进入『正式态』。**su 仍可继续新增/修改角色**（边界由项目的治理边界文档治理；此后每轮 su 会话 settle 后 pin 自动刷新）」——**界面读作「项目转正了」，不是「结束了」**；未完成示完整 `reason`（**不假装成功**）。
- **视觉**：`app/renderer/styles.css::.msg-finalize-proposal`——浅色、近单色（沿用既有令牌 `--border-strong`/`--bg-soft`/`--mono`），只用一点克制的深色边框标示「待你确认」；无 emoji/渐变。

### 3) 修那 2 条红（按新语义重写）

`test/桌面应用/finalize-wiring.test.ts`：
- **成功用例**改为**注入 allow 确认通道**（`makeManager(listing, { operatorChannel: allowChannel })`）；并更新「写出什么」的断言——T37 首次确认 finalize **额外写出项目治理边界文档** `角色卡/governance-boundary.yaml`，故 `wrote` = `["角色卡/governance-boundary.yaml", ".ans/project.json", "docs/bootstrap-manifest.md"]`。
- **新增 3 例**（均断言 **零副作用**——无 `.ans`/manifest/治理边界文档）：**未接确认通道 → `unavailable`**；**客户拒绝 → `declined`**；**确认超时 → `unavailable`**（注入永不 resolve 的通道 + `confirmTimeoutMs: 30`）。
- **入口通道断言**：创世 su 会话 `openRoleSession` 入参**含** `operatorChannel`；普通聊天**键都不出现**。
- **确认通道全用注入替身**（allow/deny/unavailable/never），**不弹系统对话框**。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **94 pass / 0 fail**（基线 91，+3 净：新增 3 例；原 2 条红按新语义转绿）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号，走 Node glob）→ **621 pass / 0 fail**（**本轮跑测未见任何红**——含任务书预告的「1 处别角色的红」，本轮未出现；多角色并发，总数会波动）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**新增检查点全真**（`session:finalize-proposal` 推提议 + 注入 `session:finalize-confirm` 收集器，**不弹系统对话框**）：
  - `FIN_NO_CARD_BEFORE_PROPOSAL=true`（提议前**无**确认卡——「只在 su 已提议时出现」的守卫）；
  - `FIN_CARD_PRESENT=true`、`FIN_CARD_TITLE=su 提议：可以收口了（完成 bootstrap）`、`FIN_CARD_REASON_SHOWS=true`；
  - `FIN_CARD_HAS_CONFIRM=true` + `FIN_CARD_HAS_CONFIRM_TEXT=确认完成` + `FIN_CARD_HAS_DISMISS_TEXT=暂不`；
  - 点 `[确认完成]` → `FIN_CONFIRM_CALL_ALLOW=true`（回传 `{toolCallId:"tc-1", allow:true}`）+ `FIN_CARD_DECIDED=true`；
  - 点 `[暂不]` → `FIN_DISMISS_CALL_DENY=true`（回传 `allow:false`）+ `FIN_CARD_DISMISSED=true`；
  - `FIN_NO_SYSTEM_DIALOG=true`（该路径**不依赖原生对话框**）。
- **既有检查点全过**：`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`SU_*`/`BOOTSTRAP_*`/`REFRESH_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_ACTION_VISIBLE`/`FIN_ACTION_IS_PENDING`/`FIN_HINT_MENTIONS_UNSETTLED`/`FIN_BTN_PRESENT`/`FIN_DENIED_BLOCK_PRESENT`/`FIN_NO_ANS_WRITTEN`/`FIN_NO_MANIFEST_WRITTEN`/`FIN_ACTION_STILL_VISIBLE` 全过（`#bootstrap-action` 的 `is-pending`/`.ba-hint`/`#btn-finalize` 语义保留）。
- **截图自看**（`13-finalize-card.png`）：聊天流里一张浅色确认卡——「su 提议：可以收口了（完成 bootstrap）」+ 将写出路径 + `[确认完成]`/`[暂不]`；底部 `#bootstrap-action` 为「完成 bootstrap / 让 su 提议收口」。
- 跑完**无残留 Electron 进程**（`tasklist` 计数 0）；真实 `.env` 指纹（size=488、mtime=1791706923、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env` 内容、未发真实网络请求、未打印凭据值**）。

### 硬约束 / 边界登记

- **渲染侧无第二份判定**：确认卡只读主进程事件（`session:finalize-proposal` 的 `proposal`/`reason`）与 `bootstrapState`；**不**读角色数据、**不**判 `hasRoles`。`primaryRoleId`/`hasRoles` 读取未动。
- **未动**：`test/测试/` 那 1 条红（**测试角色**）；`primaryRoleId`/`hasRoles` 判定读取；视觉方向（浅色、近单色、极简）不变。
- **编排 T37 的接口为只读消费**：`openRoleSession` 的 `operatorChannel`/`confirmTimeoutMs` 入参、`RoleSessionHandle.finalize()` 的 `FinalizeResult`（从**公开句柄类型派生**，`app/desktop/session.ts::FinalizeResult = Awaited<ReturnType<NonNullable<RoleSessionHandle["finalize"]>>>`）——**不导入编排私有 `src/common/编排/`**（§6）。
- **T36（`finalize_bootstrap` 工具）尚未落盘**：本轮**未**实现 su 经工具主动触发；故产线当前的触发入口仍是 `#bootstrap-action` 的按钮（请 su 收口）。**确认面与通道已就绪**——T36 落盘后，su 的工具调用 → `finalize()` → **同一 presenter → 同一确认卡**，无需再改编排/桌面。**如实登记**。


## 2026-10-11 — 收敛「项目尚未 bootstrap」提示：三处重复 → 只说一遍，且只在中栏正中（客户裁定）

**来源**：客户看过截图后，协调方指出一处冗余——**「项目尚未 bootstrap」在同一屏上说了三遍**，客户同意收掉。**属本角色边界内**（`app/`、`test/桌面应用/`）。**只做呈现收敛，不动那个「完成 bootstrap」按钮与相关 IPC**（其「su 主动提议 → 客户确认」的改造是后续任务）。

### 原来三处（同一句话）

1. **中栏横栏第二行**：`#composer-hint` 状态提示——`项目尚未 bootstrap：与 su 对话，让它创建角色。`（`loadProject` 的 `setHint`）。
2. **中栏正中空状态**：标题 `项目尚未 bootstrap` + 说明 `与 su 对话，让它把角色建出来；左树会随之长出。` + 按钮 `开始与 su 对话`（`clearChat`）。
3. **左栏**：一块白底提示框 `#bootstrap-notice`（`renderBootstrapNotice`）——同句。

### 改成（只说一遍，说在「你会看的地方」）

- **保留** 中栏正中的空状态（第 2 处）——信息最完整（标题 + 说明 + **可点的按钮**）、位置最正。**这是唯一该说这件事的地方**（`clearChat` 一字未改）。
- **删掉** 左栏那块提示框（第 3 处）——与中栏重复，且是「挂在那儿等你读」的形态。
- **中栏横栏第二行（第 1 处）只保留「写入语义」那一句**，把「项目尚未 bootstrap…」那句删掉。

**结果**：空项目导入后，这件事**只在中栏正中出现一次**（带按钮）；横栏只剩写入语义。

### 改了什么（均在本角色边界内）

- **`app/renderer/renderer.js`**：
  - **删** `renderBootstrapNotice()` 函数（及其 doc 注释）与 `applyListing` 里的调用——**左栏提示的死代码**。
  - `loadProject` 的 `setHint`：未 bootstrap（`hasRoles === false`）时**留空**（不再写那句子），有角色时仍写「已导入项目，共 N 个角色。点击角色即可开始聊天。」。横栏第二行因此**只剩 `#runtime-note` 写入语义**。
  - `clearChat` 的中栏正中空状态**一字未改**（标题/说明/按钮照旧）——它成为该状态的**唯一**呈现点。
- **`app/renderer/index.html`**：**删** 左栏 `<div id="bootstrap-notice" class="bootstrap-notice"></div>`。
- **`app/renderer/styles.css`**：**删** `.bootstrap-notice` / `.bootstrap-notice:empty` / `.bn-ico` / `.bn-text` 四条规则（已无消费者）。

### 硬约束（未动）

- **`hasRoles` 的读取未动**：仍原样转自门禁引擎 `listProject` 的 `hasRoles`（`state.hasRoles`），**渲染侧仍无第二份判定**——本轮只收敛呈现（何处显示、显示几次），未改读取来源、未派生第二次。
- **`primaryRoleId` 读取未动**（空状态说明/按钮取它，不硬编码 "su"）。
- **有角色（正常项目）路径未受影响**：导入有角色的项目时 `clearChat` 走 else 分支（「选择左侧角色开始聊天」），整页**不出现**「项目尚未 bootstrap」——e2e `NORMAL_PROJECT_NO_BOOTSTRAP_MENTION=true` 确认。

### 守卫（断言「只出现一次」+「它不在」）

- **e2e `main.mjs`（新增检查点，全真）**：
  - `BOOTSTRAP_MENTION_COUNT=1`——整页「项目尚未 bootstrap」**只出现一次**（统计**最内层**匹配元素：父链上的祖先都含它，故只数最内层，应恰为 1）；`BOOTSTRAP_MENTION_IN_CENTER_EMPTY=true`（那一次就是中栏空状态标题 `.empty-title`）；`BOOTSTRAP_CENTER_CTA_PRESENT=true`（带「开始与 su 对话」按钮）。
  - `BOOTSTRAP_LEFT_NOTICE_ABSENT=true` + `BOOTSTRAP_NO_LEFT_NOTICE_ELEMENT=true`——**左栏那块提示不存在**（断言「它不在」：`#bootstrap-notice` 元素为 null、全页无 `.bootstrap-notice` 类）。
  - `BOOTSTRAP_HINT_EMPTY=true` + `WRITE_NOTE_REMAINS_IN_HEADER=true`——横栏第二行未重复该句（状态提示留空），**只留写入语义**。
  - `NORMAL_PROJECT_NO_BOOTSTRAP_MENTION=true`（有角色项目整页无该句，正常路径未受影响）。
  - `REFRESH_LEFT_NOTICE_STAYS_ABSENT=true` + `REFRESH_BOOTSTRAP_MENTION_AT_MOST_ONE=true`（刷新前后左栏提示都不存在、且该句未因刷新长出第二份）。
- **`test/桌面应用/renderer.test.ts`（T17 用例改写为守卫）**：断言 `RENDERER.split("项目尚未 bootstrap").length - 1 === 1`（渲染源码里**只出现一次**）、未 bootstrap 时 `setHint` 留空、且 `renderBootstrapNotice` / `#bootstrap-notice` / `bootstrap-notice` 在 `renderer.js` 与 `index.html` **均不存在**、`.bootstrap-notice` 在 `styles.css` **不存在**（**断言「它不在」，非删断言**）。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **91 pass / 0 fail**。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号，走 Node glob）→ **600 pass / 0 fail**。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`；上述新守卫全真，**既有检查点全过**（`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`SU_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_*`/`RUNTIME_NOTE_*`）。
- **截图自看**（`05-bootstrap.png`，空项目那屏）：中栏正中一处「项目尚未 bootstrap」+ 说明 + **按钮**；左栏**无**白底提示框；横栏第二行**只剩**写入语义。
- 跑完**无残留 Electron 进程**；真实 `.env` 指纹（size=488、mtime=1791706923、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env`、未发真实网络请求、未打印凭据值**）。

### 边界登记（不在本轮范围）

- 「完成 bootstrap」按钮与 `session:bootstrap-state`/`session:finalize` IPC **未动**——其「su 主动提议 → 客户确认」的改造归后续任务（编排/项目管理）。
- `renderBootstrapAction` / `#bootstrap-action`（创世 finalize 动作条）与本轮无关，保留。

## 2026-10-11 — 去掉原生标题栏与默认菜单栏，自绘标题栏（客户裁定）

**来源**：客户要求——原话「**顶部需要去除 electron 原本的，自己搞一个**」。顶部原有**两样原生 chrome**：最上面那条 **OS 标题栏**（应用图标 + `ANS` + 最小化/最大化/关闭），以及它下面那条**默认菜单栏**（`文件 / 编辑 / View / …`）。**两样都去掉**，改为一条自绘的窄栏。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 去原生 chrome（主进程）

- **无边框**：`app/main.ts` 的 `BrowserWindow` 加 **`frame: false`**——去掉 OS 标题栏。
  - **缩放没弄丢**：**不动 `resizable`（默认 `true`）**，Windows 上无边框窗口默认仍带缩放边框（`thickFrame` 默认 `true`）；最小化/最大化/关闭改由自绘按钮经 IPC 驱动。
- **去默认菜单栏**：`app.whenReady()` 里 **`Menu.setApplicationMenu(null)`**——整条移除那条「文件/编辑/View…」（Windows 上各窗口随之无菜单栏）。
- **快捷键评估**：文本编辑类快捷键（Ctrl+C/V/X/A、撤销）由 **Chromium 原生**处理、**不经**菜单加速键，故不受影响；被移除的只是默认菜单提供的加速键（Ctrl+R 重载、Ctrl+Shift+I 开发者工具、Ctrl+Q 退出等）。本应用是极简聊天工具，这些**并非必要**，故 **不补回任何加速键**，更**不把菜单栏加回来**。

### 自绘标题栏（渲染侧）

- **构成**：`index.html` 顶部新增 `#titlebar`——**左＝应用标识**（`ANS` + `治理会话工作台`），**右＝三个窗口按钮**（最小化 `#win-min` / 最大化-还原 `#win-max` / 关闭 `#win-close`）。原左栏头里重复的品牌标识**已上移**，左栏头改为分区标签「项目」（与右栏「角色资料」并列），**不重复堆砌**。
- **拖动区 / no-drag**：整条 `.titlebar` 设 `-webkit-app-region: drag`；按钮及其容器设 `-webkit-app-region: no-drag`（否则点不动）。
- **双击最大化＝系统原生**：拖动区在 Windows 上按 **HTCAPTION** 对待，**双击即按惯例最大化/还原**——由系统完成，故渲染侧**刻意不挂 `dblclick`**（叠加会与原生切换抵消成「双击没反应」）。
- **按钮 → IPC**：渲染侧 `initTitlebar` 把三个按钮接到 preload 方法 `d.minimizeWindow()` / `d.toggleMaximize()` / `d.closeWindow()`；主进程经 `window:minimize` / `window:toggle-maximize` / `window:close` 调 `win.minimize()` / `win.maximize()|unmaximize()` / `win.close()`。
- **最大化态反映到图标**：`window:is-maximized`（初始化查询）+ `window:maximized-changed`（`maximize`/`unmaximize` 事件外推）→ 渲染侧 `setMaximizedUI` 在「最大化」与「还原」两图标间切换（`.win-btn.is-maximized`）。
- **风格融入**：浅色、近单色、无装饰；小圆角只给可交互元素（沿用既有令牌）；**无 emoji**；关闭按钮**不是** macOS 式刺眼红块——hover 只给一点克制的语义提示（浅红底 `--danger-bg` + 深红字 `--danger`）。按钮为原生 `<button>`，**键盘可聚焦**且 `:focus-visible` 有可见 inset 环。

### e2e 同步（`test/桌面应用/e2e/main.mjs`）

- e2e **自己建 `BrowserWindow`**，故**同步改无边框**（`frame: false`）+ **`Menu.setApplicationMenu(null)`**，与真实应用一致——否则截图里看不到自绘栏。
- **⚠ 不真点关闭/最小化/最大化**（关闭会杀掉测试窗口、最大化会改变截图尺寸）。**注入替身**验证接线：临时把 `window:minimize`/`window:toggle-maximize`/`window:close` 三个通道换成「只记录、不动窗口」的替身，点三个按钮后断言各自被调用一次，再还原真实处理器。（注：`contextBridge` 暴露的 `window.desktop` **不可写/不可重定义**，故替身只能落在**主进程 IPC 边界**，不能改渲染侧对象。）

### 守卫（「它存在」/「它不在」）

- **e2e 新检查点（全真）**：`NO_DEFAULT_MENU_BAR`（默认菜单栏**不存在**）、`CUSTOM_TITLEBAR_PRESENT`、`TITLEBAR_IS_DRAG_REGION`、`TITLEBAR_HAS_THREE_BUTTONS`（三个按钮）、`WINDOW_BUTTON_NO_DRAG`、`WIN_BRIDGE_FUNCTIONS`、`WIN_IS_MAXIMIZED_IPC`、`WIN_BUTTON_MIN/MAX/CLOSE_WIRED`（各被点一次）、`WINDOW_ALIVE_AFTER_GUARDS`（未真动窗）。
- **`test/桌面应用/renderer.test.ts` 新增 2 例源码不变式守卫**：① 无边框（`frame: false`）、**不得** `resizable: false`、`Menu.setApplicationMenu(null)`；② 三按钮经 IPC 接主进程（通道两端 + 渲染侧接线 + 拖动区/no-drag 样式 + **不得挂 `dblclick`** + 左栏**不得**再出现 `brand-mark`/`brand-sub`）。

### 证据（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **91 pass / 0 fail**（基线 89，+2）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号，走 Node glob）→ **600 pass / 0 fail**（基线 598，+2）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`；上述新守卫全真，**既有检查点全过**（`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`SU_*`/`HAS_DENIED_INLINE=2`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`BOOTSTRAP_*`/`REFRESH_*`/`FIN_*`）。
- **截图自看**（`00-titlebar.png`）：顶部就是**自绘的那条栏**（左 `ANS 治理会话工作台`、右 三个按钮），**没有**原生标题栏与菜单栏；左栏头是「项目」（不再重复品牌）。
- 跑完**无残留 Electron 进程**；真实 `.env` 指纹（size=488、mtime=1791706923、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env`、未发真实网络请求、未打印凭据值**）。

## 2026-10-11 — 去掉运行时选择器、桌面一律跑 pi；底部输入区只剩输入框（客户看截图裁定）

**来源**：客户看了截图后裁定——原话「**底部这块搞复杂了，应该就是一个输入框**」。截图里底部挤了三行：① `运行时 [demo·演示▾]` + `Pi 设置` + 状态提示「已导入项目，共 N 个角色…」；② demo 写入语义的说明（两行）；③ 输入框 + 发送。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 客户已定（逐条落地）

1. **去掉运行时选择器、桌面一律跑 pi**——界面上不再有 demo/pi 选择器；桌面会话一律以 `runtime: "pi"` 发起。`RuntimeKind` 类型**保留**（CLI 侧仍用），只是**界面不再暴露它**。
2. **`Pi 设置`入口保留**，从输入区**移到中栏横栏（`.chat-head`）右侧**（那里本就有标题与状态）。
3. **底部输入区只剩：输入框 + 发送**。
4. **原来的两行提示（状态提示 + 写入语义）也上移到横栏**、**各压缩成一行**；**写入语义那句必须保留**（去掉 demo 后它只剩单一一层意思）。

### 改了什么（均在本角色边界内）

- **`app/renderer/index.html`**：
  - `.chat-head` 改**两行**：第一行 `.chat-head-top`（`#chat-role`/`#chat-role-sub` + `#session-state` 药丸 + `#btn-pi-settings`「Pi 设置」+ `#btn-stop`「结束会话」）；第二行 `.chat-head-notes`（`#composer-hint` 状态提示 + `#runtime-note` 写入语义）——**客户要的「上移到横栏」**。
  - **删** `.composer-tools`（含 `<label class="rt-select">` + `<select id="inp-runtime">` 两个 `<option>`）与旧位置的 `<div id="runtime-note">`。
  - `.composer` **只剩** `.composer-row`（textarea + 发送）；`#bootstrap-action` 与 `#pi-panel` **移出** `.composer`、成输入区上方独立块（使 composer 字面只剩输入行）。
- **`app/renderer/renderer.js`**：
  - **删** `writeModeInfo(runtime)`（demo/pi 两套文案）、`appendWriteModeNote(runtime)`、`renderRuntimeNote()`（随选择器 `change` 重渲染）及 `ICONS.noWrite`——**选择器相关的死代码**。
  - **新增** `WRITE_NOTE`（单一句）+ `renderWriteNote()`：写入语义**唯一来源**、**常驻横栏** `#runtime-note`，初始化时渲染一次、**无 change 监听**（不再随运行时切换）。
  - `selectRole`：`var runtime = $("inp-runtime").value` → **`runtime: "pi"`**（桌面一律 pi）；请求失败提示改为「可重试，或在『Pi 设置』中检查配置」（不再提「更换运行时」）；**删**会话开启时的内联 `appendWriteModeNote` 调用（横栏已常驻）。
  - `setChatHeader` 副标题改中性：`会话由治理引擎全程把关，写入受该角色边界约束`（不再指「见输入区」）。
  - **删**两处 `$("inp-runtime").addEventListener("change", …)`（写入语义重渲染 + 选 pi 自动展开面板）——面板现仅由横栏「Pi 设置」开关。
  - **判定读取一个未动**（`primaryRoleId`/`hasRoles`/`st.*`/`res.config.*`/`res.wrote|pins|roles|reason`），渲染侧仍**无第二份判定**。
- **`app/renderer/styles.css`**：
  - `.chat-head` 改**列布局、两行**；新增 `.chat-head-top`/`.chat-head-notes`（含 `#composer-hint`/`#runtime-note` 的横栏排布）。
  - **删** `.composer-tools`/`.rt-select`/`.rt-label`/`.composer select`/`.composer select:focus-visible`（选择器样式）与 **`.sys-nowrite`/`.sys-write`**（demo/pi 两套内联写入样式，已无消费者）；`.runtime-note` 改为横栏内联紧凑版；`.btn-pi` 去掉 `margin-left:auto`。
  - `#pi-panel`/`#bootstrap-action` 移出 composer 后补左右边距（`margin: 0 28px 10px`；窄窗媒体查询内 18px）以对齐输入区。**视觉方向不变**（浅色、近单色、几乎无强调色、小圆角只给交互元素、内容区不做圆角卡片/无投影）。
- **写入语义（压缩成一行，客户要求保留）**：`写入会真正落到你导入的项目，但受该角色边界约束，越界写会在写之前被拒。`

### ⚠ 技术后果：测试改为在**注入缝**换适配器（不为测试留后门）

**问题**：此前测试靠「demo 选项」离线跑（demo 不进真实网络）。选择器一去掉，界面只会走 **pi** → e2e/单测**在没有凭据时会失败**。

**做法（客户指定：在注入缝换掉适配器，界面无任何后门开关）**：
- `test/桌面应用/e2e/main.mjs` 构造 interface 时注入 **`createPiAdapterFactoryFn`**——用 `createChatDemoAdapter` **按 `role.boundary`** 构造（`bindRole` 收到的 `ResolvedRole` 带 `boundary`），**顶掉真实 pi 工厂**。界面/会话的运行时标签仍是 `pi`（换掉的只是注入缝上的适配器）。
- 安全性：demo 适配器的 `buildGovernedTools(gate)` **未传 `writeRoot`** ⇒ 写层 fail-closed「已判定但未落盘」（`src/provider/pi/tools.ts:235`）⇒ e2e **只判不写、绝不改仓库**（与旧 demo 路径同一保证）。
- **界面无后门开关**：选择器/DOM/事件全删干净，未留任何测试专用开关。

### 守卫（断言「它不存在」，非删断言）

- **e2e `main.mjs`**：把旧的「切选择器看文案」步骤（依赖 `#inp-runtime`）**改为守卫**——`NO_RUNTIME_SELECTOR`（无 `#inp-runtime`）、`NO_RT_SELECT_CLASS`（无 `.rt-select`）、`NO_SELECT_ELEMENTS`（页面**零** `<select>`）；并断言写入语义已上移横栏（`RUNTIME_NOTE_IN_HEADER`/`SAYS_PI_WRITES`/`ONE_LINE_GATED`）、`Pi 设置`在横栏（`PI_SETTINGS_IN_HEADER`）、底部只剩输入框（`COMPOSER_CHILD_ROWS=1`/`COMPOSER_HAS_TEXTAREA_SEND=true`/`COMPOSER_CLEAN=true`）。
- **`test/桌面应用/renderer.test.ts`**：源码不变式改为——① 写入语义（桌面一律 pi）明示真实写入/受边界约束/越界被拒；② **界面不再有选择器**（`!INDEX.includes('id="inp-runtime"')`、`!INDEX.includes('rt-select')`、`!RENDERER.includes('inp-runtime')`、`!STYLES.includes('.rt-select'||'.rt-label')`、`!STYLES.includes('.sys-nowrite'||'.sys-write')`）、写入语义常驻横栏 `#runtime-note`、`runtime: "pi"` 发起；T28 用例把「选 pi 自动展开」断言改为「`Pi 设置`入口在横栏（在 `chat-head` 之后）」。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **89 pass / 0 fail**。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **598 pass / 0 fail**。（另一角色并行改 `test/测试/` 一处，本角色任务书预告「会有 1 处红」；但**本轮跑测时未见红**——可能对方已修或其改动在制品中，如实报告：本角色只保证**属我的全绿**，未动 `test/测试/`。）
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**新增守卫全真**（选择器不存在、底部干净、提示上移横栏）；**既有检查点全过**（`E2E_DONE`/`ROLE_*`/`DEFAULT_SELECTED_ROLE=su`/`SU_*`/`HAS_DENIED_INLINE=2`/`HAS_DENIED_GROUPED=true`/`ACCEPTED_ROWS=2`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`BOOTSTRAP_*`/`REFRESH_*`/`FIN_*`）。
- **截图自看**（`12-composer.png`/`02-chat.png`）：底部**只剩一行**（输入框 + 发送）；横栏第一行右侧是 `聊天中` 药丸 + `Pi 设置` + `结束会话`，第二行是状态提示 + 一行写入语义（`✎ 写入会真正落到你导入的项目，但受该角色边界约束，越界写会在写之前被拒。`）。
- 跑完**无残留 Electron 进程**；真实 `.env` 指纹（size=488、SHA-256 `75aee37f…39655`）**逐字节不变**（**未读 `.env`、未发真实网络请求、未打印凭据值**）。

### 边界登记

- **`RuntimeKind` 类型保留、只读导入**（`src/common/shared/runtime-shared.ts`，pm 属主）——现在仅 `SessionOpenRequest.runtime` 与 `selectAdapterFactory` 消费；CLI 侧仍用，不受影响。
- **demo 适配器 `app/desktop/chat-adapter.ts` 保留**，但**不再是产品路径**——只在**测试注入缝**上使用（e2e 注入以顶掉真实 pi 工厂），如实标注。

## 2026-10-11 — 移除 su 的「只读」徽标与只读内联提示（客户裁定：回到「用户对边界无感」的原模型）

**来源**：客户看截图后裁定——原话「这个 su 有角色也不不是只读的，**一直可以聊天**，你看图，**还是只读的**」。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 判定依据（回到客户早已定过的模型，非新增偏好）

客户此前明确定过：**「导入项目 = 授权；门禁静默执行，拒绝内联显示在聊天流里」**——即**不需要提前打预防针**，真被拒时在对话里显示即可。**「只读」这个徽标是后加的，偏离了这条**（客户还说过「文件边界压根用户无感」——边界是项目管理的事，不该在角色列表上摊给用户）。**故拆掉它。**

### 改动

- **`app/desktop/interface.ts`**：**删** `RoleView.readOnly` 字段、`isReadOnlyRole` 函数及其全部注释；**删** `DesktopDeps` 的 `resolveRoleFn`/`loadEffectiveConfigFn` 注入点；**删** `listProject` 里「经 `buildEffectiveProjectConfig` 取生效配置 + 引擎 `resolveRole` 解析主入口内置角色真实生效边界」那段——它此前**唯一用途就是派生 `readOnly`**，随之失去消费者。连带删除只服务它的 import（`resolveRole`、`loadEffectiveConfig`、`buildEffectiveProjectConfig` 及类型 `LoadConfigOptions`/`LoadedConfig`）。
- **不是死代码的真修复**：`readOnly` 本就只在界面派生、只被渲染进程读；而 `.ans` 项目治理边界路径那条**真修复**（`app/desktop/project.ts::buildEffectiveProjectConfig` 采纳 `loaded.project.governanceBoundary.path`）**另有消费者**——`app/desktop/session.ts` 开会话路径仍用它（且是修复点本体），故**保留**，并由 `su-effective-boundary.test.ts` ②③ 守卫。
- **`app/renderer/renderer.js`**：**删** `appendReadonlyNote` 函数与 `selectRole` 里的调用、**删** 角色树条目上的 `只读` 徽标渲染（`r.readOnly ? ...`）。**保留** `ICONS.readonly`（该锁形图标仍被 Pi 配置来源说明 `sys-config` 复用）。
- **`app/renderer/styles.css`**：**删** `.ti-badge.readonly` 与 `.sys-readonly`（均已无消费者）；更新徽标注释为「主入口 / 内置」。
- **保留**：`主入口`、`内置` 两枚徽标——它们**不是边界机制**（主入口 = 默认入口；内置 = 无角色目录），是有用的信息。
- **真正的信号不变**：被拒时**在聊天流里内联显示**（浅红 `details.sys-denied`，可展开看按根分组允许路径）——**那才是客户要的「静默执行 + 拒绝内联」**。e2e `HAS_DENIED_INLINE=2`、`HAS_DENIED_GROUPED=true`、`DENIED_OPEN_COUNT=2` 确认它仍正常。

### 运行时写入语义提示（demo「只判不写」/ pi「会写」）：**保留**（判断与理由）

**保留。** 理由：它**不是「边界机制」**，是**运行时语义**——回答「我这条消息会不会真的写进项目」。① 它随 `#inp-runtime` 选择器切换（demo/pi 两套文案），描述的是**路径**而非角色的写权；② 它不暴露 writeSet / 边界文件清单 / acceptance——三样客户说「用户无感」的东西它都没碰；③ 客户先前**亲自**要求把「只判不写」**限定到 demo 路径**（设计 §3.9 更正），这条提示正是那次裁定的产物；若一并删掉，会退回「一概而论的错误印象」。故它**不属于**「提前暴露边界机制」这一类，**保留**。

### 测试与验证

- **`test/桌面应用/interface.test.ts`**：删 `isReadOnlyRole` 及旧 `readOnly` 断言用例；改为**反向守卫**「任何角色（内置 su / 创世态 / 可写项目角色）都不再带 `readOnly` 字段」。
- **`test/桌面应用/su-readonly-bootstrapped.test.ts` → 重命名为 `su-effective-boundary.test.ts`**（文件名不再挂已废止的「只读」）：保留「`.ans` 治理边界路径被采纳」的三条真守卫（引擎解析 su 生效边界**已接受**、gate **放行治理边界内写 / 拒边界外写**、无 `.ans` 回退内置未接受）；①④ 的 `readOnly` 断言改为「**无该字段**」守卫。
- **`test/桌面应用/e2e/main.mjs`**：把只读相关检查点**改成「不存在」守卫**（**非删断言**）：`SU_NO_READONLY_BADGE`、`SU_NO_READONLY_NOTE`/`SU_NO_READONLY_ROWS`、`DESKTOP_ROLE_NO_READONLY_BADGE`/`..._ROWS`、`BOOTSTRAP_SU_NO_READONLY_BADGE`、`REFRESH_SU_NO_READONLY_BADGE`；新增 `SU_BADGE_LABELS`（断言 su 那行只剩 `主入口|内置`）。
- **单测** `node --test test/桌面应用/*.test.ts` → **89 pass / 0 fail**（基线 90，−1：删掉纯 `isReadOnlyRole` 用例；原 3 条只读断言用例改写成 3 条反向守卫）。
- **`npm run typecheck`** → **1 处错误**，在 **`test/测试/t9-block1-bootstrap.test.ts:138`**（`listing.roles[0].readOnly`）——**属「测试」角色边界（`test/测试/`）、不在本角色白名单内，故未越界改，如实回报**（需测试角色把该断言改为「无 `readOnly` 字段」或删除）。
- **全量** `node --test "test/**/*.test.ts"` → **597 pass / 1 fail**（唯一失败即上述 `test/测试/` 断言，**边界外、如实登记**；基线 599，−1 同 source）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`：只读守卫全真（`SU_NO_READONLY_BADGE=true`、`SU_NO_READONLY_NOTE=true`/`SU_NO_READONLY_ROWS=true`、`BOOTSTRAP_SU_NO_READONLY_BADGE=true`、`REFRESH_SU_NO_READONLY_BADGE=true`、`DESKTOP_ROLE_NO_READONLY_BADGE=true`）、`SU_BADGE_LABELS=主入口|内置`；**既有检查点全过**（`DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`HAS_DENIED_INLINE=2`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_*`/`RUNTIME_NOTE_*`）。**截图确认** su 那行只剩「主入口」「内置」。跑完无残留 Electron；真实 `.env` 指纹（size=488 / mtime=1791706923 / SHA-256 `75aee37f…`）**逐字节不变**。
- **未读 `.env`、未发真实网络请求、未打印凭据值**。

## 2026-10-11 — 修复：已 bootstrap 项目里内置 su 恒被误标「只读」——桌面丢弃了 `.ans` 的项目治理边界路径

**来源**：客户界面反馈「su 不该是只读」+ 协调方定位。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 症状与根因

**症状**：在有角色的（已 bootstrap 的）项目里，内置治理角色 su **恒显示「只读」**——即便项目已 bootstrap。

**根因链**：
- `app/desktop/session.ts`：从 `.ans` 载入后**只采纳 `source.acceptance`**，`source` 其余字段被丢弃；
- `app/desktop/project.ts::buildProjectConfig`：`governanceBoundary` **硬写 `{ path: "", acceptance }`**；
- ⇒ 门禁 `resolveBoundarySection` 的「**治理边界覆盖**」分支（`src/common/门禁引擎/boundary-core.ts:219`，要求 `gov.path` 非空）被跳过 ⇒ su 掉回**内置未接受**（skill 根边界）⇒ **拒一切写**；
- ⇒ 界面据枚举给的（**恒为未接受**的）边界 acceptance，经 `isReadOnlyRole` **误标只读**。

**即**：bootstrap 建出的治理结构在桌面上是空的——**su 建完角色之后反而什么都不能做**。

### 字段名更正（协调方的假设不成立）

治理边界路径**不在 `source` 上**——`config-loader.ts::ConfigSource` 只含 `{ kind, path, acceptance, pinPaths, downgradeReason }`；路径在 **`loaded.project.governanceBoundary.path`**（`buildFromAns` 里 `project.governanceBoundary = { path: govRaw.path, acceptance }`）。

### 修法（均在本角色边界内）

- **`app/desktop/project.ts`**：
  - `buildProjectConfig` 增**第 4 参** `governanceBoundaryPath: string = ""`，设 `governanceBoundary.path = 该值`（**不再硬写空串**；缺省空串 ⇒ 无 `.ans` 时走原回退，行为不变）；
  - 新增 `DESKTOP_RUNTIME_CONSENT`（运行期同意常量）与 **`buildEffectiveProjectConfig(listing, deps)`**——桌面**授权链的唯一实现**（`fallback=运行期同意 → 共享载入器 → **采纳 loaded.project.governanceBoundary.path**`），**会话语义与界面只读判定共用同一份**，杜绝两处漂移。
- **`app/desktop/session.ts`**：开会话改经 `buildEffectiveProjectConfig`（不再自行 `buildProjectConfig(listing, source.acceptance)` 丢路径）；deps 的 `buildProjectConfig` 类型放宽到含 env + path。
- **`app/desktop/interface.ts`**：`listProject` 也经 `buildEffectiveProjectConfig` 取生效配置，再用**门禁引擎** `resolveRole(primaryRoleId, project)` 解析**主入口内置角色的真实生效边界**，据此定 `readOnly`——**单一来源、不重写判定**（pin 不匹配 / 边界文档损坏等仍如实反映为未接受）；解析失败退回枚举所提供的边界（fail-safe）。新增可注入 deps `resolveRoleFn`/`loadEffectiveConfigFn`。

### 被丢弃字段——逐个核查「采纳 / 不采纳」及理由

| 字段 | 处置 | 理由 |
| --- | --- | --- |
| `source.kind` | 采纳 | → `OpenResult.config.kind`，界面如实呈现来源种类 |
| `source.path` | 不采纳 | `.ans` 文件路径，仅供展示/诊断；会话无须 |
| `source.acceptance` | **采纳** | 生效（已 fail-closed 规范化）的 acceptance |
| `source.pinPaths` | 采纳 | → `config.pinCount`（如实示 pin 条数） |
| `source.downgradeReason` | 采纳 | → `config.reason`（fail-closed 降级原因） |
| `project.projectRoot` | 不采纳 | 与枚举 `listing.projectRoot` 同值；桌面对齐枚举 |
| `project.skillRoot` | 不采纳 | 桌面经 `resolveSkillRoot(env)` 自算，等价 |
| `project.roles` | **有意不采纳** | 桌面以**枚举角色**为准（与左树同源）；载入器 roles 在 `ans-invalid` 分支为空、且不含 `builtInRoles`，直接采用会破坏内置角色/入口 |
| `project.governanceBoundary.path` | **采纳（本次修复）** | **此前唯一被丢且必须采纳的字段**——它决定「治理边界覆盖」是否命中 |
| `project.governanceBoundary.acceptance` | 采纳 | 与 `source.acceptance` 同一引用（`buildFromAns`） |

### 三条路径（修复后均正确）

| 情形 | su 的边界 | 界面只读 |
| --- | --- | --- |
| **无 `.ans`** | 回退运行期同意；su 仍回退内置未接受 | **标只读**（如实：其写入被 F6 拒） |
| **未 bootstrap（`!hasRoles`）** | 创世种子边界（`genesisBootstrap`）⇒ su **能写**治理产物 | **不标只读**（T30 已如此） |
| **已 bootstrap（`.ans` 有效 + 治理边界路径 + pin 正确）** | **项目治理边界**（已接受）⇒ su 按项目治理边界工作 | **不标只读**（**本次修复**） |

### 测试与验证

- **新增 `test/桌面应用/su-readonly-bootstrapped.test.ts`（4 例）**——用**真实**共享载入器 + 真实门禁引擎 + 真实编排，`mkdtemp` 造**已 bootstrap 且 `.ans` pin 正确**的项目（一项目角色 + `角色卡/governance-boundary.yaml` + `.ans` 指向它）：
  - ① 界面 **不**标内置 su 只读（项目角色亦不受影响）；
  - ② 引擎为 su 解析出的**生效边界为已接受**、`governanceBoundary.path` 已从 `.ans` 采纳；
  - ③ su 的 gate **放行治理边界内**的写（`角色卡/…`、`docs/…`）、**拒绝边界外**（`src/…`）；
  - ④ 反例：**无 `.ans`** 的已 bootstrap 项目里 su **仍标只读**（该路径不变）。
- **单测** `node --test test/桌面应用/*.test.ts` → **90 pass / 0 fail**（基线 86，+4）。
- **`npm run typecheck`** → **全仓零错误**。**全量** `node --test "test/**/*.test.ts"`（带引号）→ **599 pass / 0 fail**（基线 595，+4）。
- **e2e** 退出码 0、`E2E_DONE=1`，既有检查点全过（`DEFAULT_SELECTED_ROLE=su`、`SU_READONLY_BADGE=true`〔仓库根**无 `.ans`**，su 标只读**正确**〕、`BOOTSTRAP_SU_READONLY_BADGE=false`、`REFRESH_SU_READONLY_BADGE=true`、`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`FIN_*`）。
- **未读 `.env`、未发真实网络请求、未打印凭据值**（测试/e2e 全程只碰系统临时目录）。

## 2026-10-11 — 视觉方向定稿：浅色、中性、极简（参照 Claude 桌面应用）；**取代「图纸（drafting）」方向**

**来源**：客户发参照截图，原话「整体风格和这种就行了」——参照即 **Claude 桌面应用本身的界面**（浅色、干净、极简）。该条**覆盖**此前「图纸」方向（**方格底纹、斜线阴影带、尺寸标注、实线/虚线行那套作废**）。**属本角色边界内**（`app/renderer/`）。**只动视觉层、零行为改动**：`renderer.js` 的判定读取（`primaryRoleId`/`hasRoles`/`readOnly`/`st.*`/`res.config.*`/`res.wrote|pins|roles|reason`）**一个未动**，渲染侧仍**无第二份判定**；所有既有 e2e 检查点**全过**。

### 定稿色 / 字（零外部依赖）

| 名 | 值 | 用途 |
| --- | --- | --- |
| 主区 | `#FFFFFF` | 主内容区（近白） |
| 侧栏 | `#F4F4F2` | 左栏（略灰，**靠色差区分**，不靠边框） |
| 浅底 | `#FAFAFA` / `#F0F0EE` / `#ECECEA` | 右栏面板 / hover / 选中项 |
| 线 | `#E8E8E6`（`#DCDCDA`） | **极淡**分隔线（很多时候不用线，靠留白分组） |
| 文字 | `#1F1F1F` / `#6B6B6B` / `#9A9A9A` | 近黑 / 次级灰 / 更淡灰 |
| 拒绝 | `#B42318`（底 `#FEF3F2`） | **语义色·拒绝**（克制红，浅红底内联块，面积小） |
| 成功 | `#067647` | **语义色·成功**（克制绿，面积小） |

- **字体**：**一套无衬线为主**（`system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`）；**等宽只留给技术事实**（`ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace`——路径 / SHA-256 / 工具名 / 行号）；**去衬线正文**。
- **强调色**：**基本没有**——按钮 / 选中态 / 药丸一律**中性灰**（选中 = 浅灰底 + 深字；主按钮 = **中性深色实心**）；唯一颜色是**语义色**（拒绝红 / 成功绿），**面积小、只在必要时**。
- **圆角只给交互元素**（按钮 / 输入 / select / textarea / 药丸 / 列表选中项 / 计数，6–8px）；**内容区域不做圆角卡片、不加投影**（全表无 `box-shadow`，除 focus ring）。
- **一处用力**不变——现在「用力」处是**拒绝的语义红**（浅红底内联块），其余保持中性灰的克制。

### 作废与保留

- **作废**：方格底纹、`repeating-linear-gradient` 斜线阴影带、`|— root —|` 尺寸标注、边界表的实线/虚线行、以及「等宽 + 衬线 + 无衬线」三套字的用法。
- **保留**（与新方向一致）：**技术事实等宽**；**拒绝要有明确但不喧哗的呈现**；**一处用力**的原则。

### 验证

- **单测** `node --test test/桌面应用/*.test.ts` → **90 pass / 0 fail**（源码不变式守卫的样式钩子 `.runtime-note`/`.sys-nowrite`/`.sys-write`/`.sys-config`/`.bootstrap-notice`/`.btn-start`/`.msg-handback`/`.is-mirror`/`.pi-*`/`.bootstrap-action`/`.sys-finalize` **全保留**）。
- **`npm run typecheck`** → **全仓零错误**。**全量** → **599 pass / 0 fail**。
- **e2e** 退出码 0、`E2E_DONE=1`，既有检查点**全过**；逐屏截图**已自看**（浅色、中性、几乎无强调色——**无深色底、无蓝色主色、无装饰性花纹/渐变**）。跑完**无残留 Electron**。

## 2026-10-11 — 视觉重做：上一版「深色三栏 + 蓝色主色」被「图纸（drafting）」方向取代

> **⚠ 本篇方向（方格 / 斜线阴影带 / 尺寸标注）已被同日上一条「浅色、中性、极简」取代**——客户给了参照（Claude 桌面应用），「图纸」方向作废。下文仅作历史留痕，**现行视觉以上一条为准**。

**来源**：客户要求把界面**美化重做**；视觉方向经讨论选定为**图纸（drafting）**——本产品的独特性**不是聊天**，是「边界」与「越界被拦下」，故视觉语言取自制图/图纸。**属本角色边界内**（`app/renderer/`）。**只动视觉层、零行为改动**：`renderer.js` 的判定读取（`res.primaryRoleId`/`hasRoles`/`readOnly`/`st.available`/`st.settled`/`res.config.*`/`res.wrote|pins|roles|reason`）**一个未动**，渲染侧仍**无第二份判定**；所有 e2e 检查点（`DEFAULT_SELECTED_ROLE`、`BOOTSTRAP_*`、`REFRESH_*`、`NO_MODAL_*`、`HANDBACK_*`、`MIRROR_*`、`PI_*`、`FIN_*`）**全过**。

### 被取代的上一版

上一版是「**柔和深色三栏 + 一个蓝色主色**」（`--bg:#101318` 一族 + `--accent:#5b8def`；圆角 6/8/12、柔和面板、uniform 卡片）。客户直言「页面也改漂亮一点」「专业一点」，但那正是**AI 生成的典型痕迹**之一（近黑底 + 单一亮色 / SaaS 卡片套装）。本方向**整体取代**它：改冷调**浅色纸面**、由**线**定义区域（无圆角、无阴影）、制图蓝作结构、红铅笔**仅**用于拒绝。

### 色（四个值起）

| 名 | 值 | 用途 |
| --- | --- | --- |
| 纸 | `#ECEFF1` | 冷调纸面（不是奶油） |
| 格 | `#D9E0E4`（主格 `#CDD7DC`） | 方格底纹（`repeating-linear-gradient`） |
| 墨 | `#1E2529` / `#5C6870` | 主/次文字（石墨，非纯黑） |
| 线 | `#2E6B8A` | 制图蓝：结构 / 边界 / **允许** |
| 拒 | `#A33A22` | 红铅笔：**拒绝**（只此一处用力） |

### 字（**只用系统字体栈，零外部依赖**）

- 等宽 `ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace`：路径 / SHA-256 / 工具名 / 行号。
- 衬线 `"Iowan Old Style", Palatino, "Songti SC", "SimSun", Georgia, serif`：角色卡正文 / 留痕 / 长文。
- 系统无衬线：**只**给界面 affordance（按钮、树标签）——它不是「文档内容」。

### 唯一用力处：拒绝的斜线阴影带

```css
details.sys-denied {
  border-left: 3px solid var(--reject);   /* 红铅笔边 */
  background-color: var(--reject-soft);
  background-image: repeating-linear-gradient(
    45deg, rgba(163,58,34,0.14) 0 1px, transparent 1px 9px);  /* 斜向排线——是「线」，不是装饰性渐变洗色 */
}
```
全页**只有这一处**用力；其余一切（含 `sys-config`/`warnings`/`只读`/`hb-blocked`）一律**细线 / 细字**，安静克制。

### 其余区域的画法

- **整页当一张图纸**：`body` 方格底纹贯穿三栏；三栏由**线**划分（结构线制图蓝），**不用圆角卡片、不用阴影**（全表 `border-radius:0`、无 `box-shadow`）。
- **左树**：角色条目=标注过的字段；su 置顶，用**带边框的区域**（`.tree-item.primary`）标为「主入口」，其余归「其他角色」组（分组标签后拖一条引线）。
- **中栏**：对话是一份**连续记录**（用户=右侧蓝调块 / 助手=衬线 + 左缘细线）；系统事件做成**图纸注记**（`tool_call`/`accepted` 走蓝线 + 对勾，等宽文字）；**拒绝**放进斜线阴影带。
- **右栏**：边界条目**真的画出来**——每条画成一个块：`root` 用**尺寸标注** `|— project —|`、`kind` 用**线型样片**（实线目录 / 虚线条件 / 细线文件）、允许条目**实线行**、条件目录**虚线行**。
- **输入区**：有横线的**填写栏**（textarea 只留上/下横线、聚焦时下缘转制图蓝变粗）；Pi 字段 likewise 是下划线字段。

### 对照「要避开的默认」逐条自查后**改掉**了什么

- **② 近黑底 + 单一亮色**：上一版正是此默认——**整页改为冷调浅色纸面**。
- **④ SaaS 卡片套装**：上一版统一圆角 6/8/12 + 柔和面板——**已全部去掉**：`border-radius:0`、无阴影，区域改由**线**定义。
- **③ 报刊式细线分栏密排**：三栏虽由细线划分，但用**方格纸**、制图蓝结构线与灰内部分隔线**分角色**、间距宽松，并**把右栏 4 列密排表改成每条一「块」**（原来 `#right-body` 4 列挤在 384px 内、purpose 大幅折行）——密度下降、可读性提升。
- **① 暖奶油 + 高对比衬线 + 赤陶**：用**冷**纸 `#ECEFF1`；衬线**只**用于文档内容（非全页）；`#A33A22` 是**暗砖红**且**只**表拒绝，非装饰主色。
- **ALL-CAPS 小标签**：删掉 `.tree-label/.tree-group/.sec-label/.rt-label/table.boundary th` 上的 `text-transform:uppercase` + 大 `letter-spacing`，改为正常字距的系统无衬线字段标签。
- **「A · B · C」点分隔元信息串**：删掉三处中缀点号——`roleSubtitle`（「内置治理角色 · 由 SKILL.md 定义」→「内置治理角色（定义见 SKILL.md）」）、回交元行（「角色：X · 任务 Y」→「角色 X，任务 Y」）、会话头副标题（「…把关 · 写入语义…」→ 中文逗号）；列表项前的「·」项目符号改为**线样片**（`.hb-ev::before`/`.fin-wrote li::before` 的小横线）。
- **字面 `**`**：`index.html` 的 Pi 提示里 `**仓库根 .env**` 在屏上是字面星号——改为 `<strong>`。

### 其余硬约束

- **纯 CSS、零外部依赖、不引外部字体、无 emoji**；`repeating-linear-gradient` **只**用于方格底纹与拒绝斜线带（画线），**无装饰性渐变洗色**。
- **响应式**：`@media(max-width:1180px/940px)` 收窄侧栏、保住中栏；`prefers-reduced-motion` 下关掉过渡/动画；键盘 `focus-visible` 一律 2px 制图蓝 outline（可见）。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **86 pass / 0 fail**（未增删用例；源码不变式守卫——`.runtime-note`/`.sys-nowrite`/`.sys-write`/`.sys-config`/`.bootstrap-notice`/`.btn-start`/`.msg-handback`/`.is-mirror`/`.pi-*`/`.bootstrap-action`/`.sys-finalize` 等样式钩子**全保留**）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"`（带引号走 Node glob）→ **595 pass / 0 fail**（与基线一致）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录 `C:\Users\MLoong\AppData\Local\Temp\ans-e2e-visual`）：退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**全部既有检查点仍过**：`DEFAULT_SELECTED_ROLE=su`、`SU_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*`、`BOOTSTRAP_*`、`REFRESH_*`、`NO_MODAL_*`、`HANDBACK_*`、`MIRROR_*`、`PI_*`、`FIN_*`（`RIGHT_BOUNDARY_ROWS=11` 未变）。逐屏截图**已自看**（`01-import`/`01b-su`/`02-chat`/`03-denied`/`04-profile`/`05-bootstrap`/`06-refresh`/`07-handback`/`08-mirror`/`09-pi-panel`/`10-pi-saved`/`11-finalize`）。跑完**无残留 Electron**。
- **未读 `.env`、未发真实网络请求、未打印凭据值**（Pi 面板经 e2e 注入的临时 `.env`）。

## 2026-10-11 — T36：桌面接通 `finalize`——兑现客户确认的「保留 finalize + pin」（创世 bootstrap 的最后一步）

**来源**：编排 T36（`openRoleSession` 增可选 `genesisFinalize`，句柄据它附 `settled` + `finalize()`；**时机裁定＝显式触发**）+ 客户「保留 finalize + pin」+ 设计 §12.5（su 不会算 hash，pin 只能由代码在 su 写完后算）。**属本角色边界内**（`app/`、`test/桌面应用/`）。**测试角色用「用户入口」验收时抓到**：桌面此前**没有任何 finalize 调用** ⇒ 从用户入口走完 su 建角色后**无 `.ans`、无 manifest、无 pin** → 只能跑「运行期同意」例外，**与客户确认相反**。

### 缺口（为何此前这条路不通）

`app/desktop/` 全无 `finalize` 调用：编排的 finalize 能力此前只挂在治理会话句柄（CLI `ans govern` 路径），桌面走的**另一入口** `openRoleSession` 够不着 ⇒ 「导入空文件夹 → 与 su 对话 → su 建出角色」走完后**无 pin**。编排本任务（T36）把能力接到 `openRoleSession`（可选 `genesisFinalize`），本角色负责**接线 + 界面入口**。

### 触发时机（**显式**，不自动跑）——与编排裁定一致

su 建角色**可多轮**、每轮都 settle；「settle 就 finalize」会在**第 1 轮后 pin 出一个只有部分角色的 `.ans`**。**唯一可靠信号是用户说「我讲完了」** ⇒ finalize 是**显式的**：由「知道 bootstrap 已完成」的消费者（界面上的用户）在合适时机点。故本层**只在 settle 时刷新入口的「就绪」提示**，**绝不自动调用** `finalize()`。裁定同时明确：**多轮建角色必须全在创世态内完成，finalize 是 bootstrap 的最后一步**；写出 `.ans` 后自终止只关「之后再开的新会话」，不影响本次已完成的 bootstrap。

### 改了什么（均在本角色边界内）

- **`app/desktop/session.ts`（接线落点）**：
  - `SessionManager.open` 对**仅创世 su 会话**经 `openRoleSession` 开 **`genesisFinalize: true`**——判据 **`listing.hasRoles === false && role.builtIn === true`**（数据驱动、**不硬编码 "su"**；`role.builtIn` 来自门禁引擎枚举）。**有角色的普通聊天逐字不传**该字段（行为不变）。
  - `SessionManagerDeps.openRoleSession` 入参类型加**可选** `genesisFinalize?: boolean`（与编排入参对齐）。
  - 新增 `bootstrapState(): {available, settled, finalized}`（纯读、无副作用）与 `finalizeBootstrap(): Promise<FinalizeResult>`（转调句柄 `finalize()`；**失败如实返回 `{ok:false, reason}`，不静默、不假装成功**；成功后记 `finalized`）。`usesFinalize` 由**句柄是否真有 `finalize`** 判定（如实反映能力，不靠调用方自报）。
  - 导出 `BootstrapState` 与 **`FinalizeResult`**——后者**从编排公开句柄类型派生**（`Awaited<ReturnType<NonNullable<RoleSessionHandle["finalize"]>>>`），**不导入编排私有 `src/common/编排/finalize.ts`**（§6 禁跨角色导入他人私有 `common/`）；形状由编排**公开面**唯一决定，本层不自造第二份。
- **`app/desktop/interface.ts`**：`DesktopInterface` 增 `getBootstrapState()` / `finalizeBootstrap()`（**只透传**管理器，逻辑唯一在 SessionManager）；`DesktopDeps.openRoleSessionFn` 入参同步加可选 `genesisFinalize?`。
- **`app/main.ts`**：注册 IPC `session:bootstrap-state`（读，无副作用）/ `session:finalize`（显式触发；写入经门禁 `resolveWrite`，被拒即零副作用、结果如实回渲染侧）。
- **`app/preload.cjs`**：暴露 `getBootstrapState` / `finalizeBootstrap`（白名单通道）。
- **`app/renderer/{index.html,renderer.js,styles.css}`**：
  - `index.html` 加 `#bootstrap-action`（默认隐藏）——「完成 bootstrap」动作条。
  - `renderer.js` 增 `refreshBootstrapAction`（开会话后 + 每个 `settled` 事件后查询状态并渲染）、`renderBootstrapAction`、`onFinalize`（显式触发）、`appendFinalizeResult`（如实呈现结果）；`selectRole` 成功后 / `settled` 事件 / `stop` / 失败路径相应刷新或隐藏入口。
  - `styles.css` 加 `.bootstrap-action`（就绪用主色 `.is-ready`、未就绪用警示色 `.is-pending`）与 `details.sys-finalize`（成功 `.is-ok` / 被拒 `.is-denied`）——纯 CSS、无外部依赖、无 emoji、无渐变。

### 可见性条件与呈现（界面**不作判定**，只读主进程状态）

- **入口何时显示**：`bootstrapState().available` 为真时——即「当前是**创世 su 会话**（未 bootstrap 项目上开启的内置治理角色会话，`genesisFinalize` 已开）**且尚未 finalize 过**」。**有角色的普通聊天 / 其它角色**的会话 `available` 恒假（其句柄没有 `finalize`）⇒ 不显示。
- **「该不该现在点」**：据 `settled`（su 是否说过话）——
  - **未就绪**（`settled:false`）→ `.is-pending` 警示态 + 提示「su 还没有完成任何一轮。现在点会被拒（无可 pin 之物）——先与 su 对话」；
  - **就绪**（`settled:true`）→ `.is-ready` 主色态 + 提示「su 已完成至少一轮——现在可以完成 bootstrap」。
- **成功后**（示写出了什么）：展开一张 `details.sys-finalize.is-ok`，示 **写出路径（`wrote`）+ Pin 的边界文件与 SHA-256（`pins`）+ Pin 的角色（`roles`）**；入口随之隐藏（`available` 变假）。
- **被拒后**（示原因）：展开一张 `details.sys-finalize.is-denied`，示**完整 `reason`**（如「会话尚未 settle（su 尚未完成任何一轮）——拒绝 finalize，避免 pin 到半成品」「无可 pin 的边界文件…（fail-closed）」）；入口**保留**（用户可补救后再点）。

### 测试与验证（本角色独立执行）

- **新增 `test/桌面应用/finalize-wiring.test.ts`（12 例）**——用**系统临时目录**造假项目，跑完清理、**不在仓库留文件**（真实 `openRoleSession` + 真实 `finalize`）：
  - **开关**：创世 su 会话 `openRoleSession` 收到 `genesisFinalize:true`；有角色的普通聊天 / 有角色项目里的 su **都不传**（连键都不出现）。
  - **`bootstrapState`**：创世 su → `available:true`、未说话 `settled:false`、说话后 `settled:true`；普通聊天 / 未开会话 → `available:false`。
  - **成功路径**（真实 finalize，落盘**临时目录**）：写出 `.ans/project.json` + `docs/bootstrap-manifest.md`、pin 覆盖新角色 `boundary.yaml`、SHA-256 为 64 位十六进制；`.ans` accepted:true 带 pin 数组；manifest 为留痕文件；成功后 `finalized:true`/`available:false`。
  - **被拒路径**：**未 settle** → `ok:false` 且 reason 点明 settle、**零副作用**（不建 `.ans`/manifest）；**无可 pin 之物** → `ok:false` 且 reason 点明 fail-closed、零副作用；**普通聊天不具备能力** → `ok:false` 且如实说明仅创世 su 会话可完成。
  - **可注入句柄**：`finalize` 结果**原样转达**（不改写、不伪成功），成功后记 `finalized`。
- **`test/桌面应用/interface.test.ts` +1**：`getBootstrapState`/`finalizeBootstrap` 经 Interface 透传（读状态**不触发** finalize；`finalizeBootstrap` 显式触发并原样回转结果；关会话后入口不可用）。
- **`test/桌面应用/renderer.test.ts` +1**：源码不变式——入口据 `available` 显示、据 `settled` 提示就绪；显式调 `d.finalizeBootstrap`；成功示 `res.wrote/pins/roles`、被拒示 `res.reason`；容器/样式钩子与两 IPC 通道两端齐备。
- **单测** `node --test test/桌面应用/*.test.ts` → **86 pass / 0 fail**（基线 72，**+14**）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **595 pass / 0 fail**（基线 581 + 14）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`、无 `WATCHDOG_TIMEOUT`/`E2E_ERROR`。**新增检查点全真**：
  - `BOOTSTRAP_ACTION_HIDDEN_WHEN_HAS_ROLES=true`（仓库根有角色的 su 会话是普通聊天 → **不显示**入口）；
  - 临时创世项目开 su → `FIN_ACTION_VISIBLE=true`、`FIN_ACTION_IS_PENDING=true`、`FIN_HINT_MENTIONS_UNSETTLED=true`、`FIN_BTN_PRESENT=true`；
  - 点「完成 bootstrap」（demo 未 settle）→ `FIN_DENIED_BLOCK_PRESENT=true`，`FIN_DENIED_REASON=会话尚未 settle（su 尚未完成任何一轮）——拒绝 finalize，避免 pin 到半成品`（**真实原因、如实呈现**）、`FIN_ACTION_STILL_VISIBLE=true`（被拒后入口保留）、`FIN_NO_ANS_WRITTEN=true`、`FIN_NO_MANIFEST_WRITTEN=true`（**被拒即零副作用**）。
  - 既有 `DEFAULT_SELECTED_ROLE=su`/`BOOTSTRAP_*`/`REFRESH_*`/`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`SU_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*` **全过**；跑完**无残留 Electron 进程**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹**逐字节相同**（size=488、mtime 不变、SHA-256 `75aee37f…39655` 一致）。**未读 `.env`、未发真实网络请求、未打印凭据值。**

### 安全/边界（本任务核心关切）

- **不绕门**：finalize 的两笔写（`.ans/project.json`、`docs/bootstrap-manifest.md`）**同样经门禁 `resolveWrite`**（与 su 同一授权边界；被拒即整批中止、零副作用）——本层只**转调**编排的 `finalize()`，**未自写任何落盘/边界判定**，**无第二份实现**。e2e 的临时创世项目演示了「被拒即零副作用」。
- **落点纪律**：测试与 e2e 的 finalize **只落系统临时目录**（`mkdtemp`），**绝不写仓库**（e2e 断言 `FIN_NO_*_WRITTEN` 且仓库根无 `.ans`/`docs/bootstrap-manifest.md`）。
- **渲染侧无第二份判定**：入口可见性/就绪态**全部读主进程 `getBootstrapState()`**，渲染进程**不自行判定**（不读角色数据、不判 hasRoles）。

### 边界登记（不在本角色边界内）

- 编排的 `finalize` 能力（`RoleSessionHandle.finalize` / `genesisFinalize` 入参）与「显式触发」裁定归**编排 T36**，本角色**只读其公开面**（并从中派生 `FinalizeResult` 类型，不导入其私有 `common/编排/`）。
- 本层**不**在 finalize 成功后重取左树（`project:changed`）：finalize 写的是 `.ans`/manifest（治理证据），**不新增角色**——枚举的角色清单不变，故无需刷新（区别于 su 建角色触发的刷新）。

## 2026-10-11 — 更正：su 的「只读」标记曾为反——纳入 `hasRoles`，创世态不标只读

**更正条目**：su 的「只读」徽标与内联「本版只读」**此前判据是反的**。原判据 `builtIn===true && boundary.acceptance.accepted===false` 在**未 bootstrap 的项目**里已不准确——该场景下 su 经**创世边界**（`genesisBootstrap`，T30 接线）**确能写**治理产物（`角色卡/`、`docs/`、`.ans/`），界面却仍标「只读」，属**「文案说不能做、代码能做」**的误导（T30 已**如实回报**、当时未改；本条即该回报的落地）。

**来源**：本角色 T30 回报的「反向文案不一致」发现；依据设计 §12.2/T30（创世态 su 可写）与硬约束「渲染进程无第二份判定」。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 新判据（数据全来自门禁引擎）

`app/desktop/interface.ts::isReadOnlyRole(role, hasRoles)`：

```
builtIn === true && role.boundary?.acceptance?.accepted === false && hasRoles === true
```

- `builtIn` / `boundary.acceptance` / `hasRoles` **三项皆来自门禁引擎**（`listProject` 的枚举结果与角色数据）；本层只做**布尔派生**，**不重写任何边界/路径判定**。
- **为何必须结合 `hasRoles`**：未 bootstrap（`hasRoles === false`）时 `buildProjectConfig` 设 `genesisBootstrap`，内置治理角色经**创世边界**（普通目录种子）**能写**治理产物 ⇒ 此时标只读是**反的**；项目**一有角色**（`hasRoles === true`）即不再设该字段、su 回到**普通边界**、内置 acceptance 未接受 ⇒ 其写入被 `resolveWrite` 的 F6 拒 ⇒ **才标只读**。判据因此**如实反映**角色在当前项目里到底能不能写。
- `builtIn` 仍必须结合（`listProject` 对**所有**角色所列 acceptance 都是未接受/仅展示，单看 `accepted===false` 会把可写的项目角色误标）。

### 改动面（最小）

- **`app/desktop/interface.ts`**：`isReadOnlyRole` 增第二参 `hasRoles: boolean`；唯一调用点 `listProject` 传 `listing.hasRoles`。`RoleView.readOnly` 的**形状/类型/字段名不变**（仍是 `boolean`）；`RoleView` 未加字段。
- **渲染进程未改**：`app/renderer/renderer.js` 仍只读 `role.readOnly` 布尔（左树 `只读` 徽标 + 会话内联 `appendReadonlyNote`），**无第二份判定**——硬约束满足。
- **下游**：`RoleView` 无其他消费方（全仓 grep 仅 renderer 读 `readOnly`）；`isReadOnlyRole` 仅本文件调用 + 单测。

### 两种情况下标记的实际表现

| 情况 | `hasRoles` | `readOnly` | 界面 |
| --- | --- | --- | --- |
| **未 bootstrap（创世态）** | `false` | **`false`** | su **无**「只读」徽标、会话内**无**「本版只读」内联（此时它经创世边界能写治理产物） |
| **有角色（回到普通边界，内置未接受）** | `true` | **`true`** | su **有**「只读」徽标 + 会话内联「本版只读」 |
| 项目角色（非内置） | 任意 | `false` | 无只读（不受影响） |

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **72 pass / 0 fail**（基线 71，**净 +1**）：
  - `interface.test.ts::isReadOnlyRole` 增 `hasRoles` 维：内置+未接受+**有角色**→只读；内置+未接受+**未 bootstrap**→**不**只读；内置+已接受→不标；非内置→不标。
  - 改写既有「acceptance 未接受的内置角色带只读标记」用例为**有角色**态（`hasRoles:true`）；新增「**未 bootstrap（hasRoles:false）时内置 su 不带只读标记**」用例。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。语义随判据更新：
  - **有角色场景（仓库根）**：`SU_READONLY_BADGE=true`、`SU_READONLY_NOTE=true SU_READONLY_ROWS=1`、`DESKTOP_ROLE_READONLY_BADGE=false`（**未改坏**）。
  - **空项目（创世态）新增**：`BOOTSTRAP_SU_READONLY_BADGE=false`（su **无**只读标记，T30 回报的误导已消除）。
  - **造出角色后新增**：`REFRESH_SU_READONLY_BADGE=true`（回到普通边界 → 转只读，与创世态相反；`REFRESH_NOTICE_CLEARED=true`）。
  - 既有 `DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*`/`PI_*`/`BOOTSTRAP_*`/`RUNTIME_NOTE_*`/`WRITE_MODE_*` **全过**；跑完**无残留 Electron**。
- **`npm run typecheck`**：本改动文件（`app/`、`test/桌面应用/`）**零错误**；**仅** `test/测试/t9-block1-bootstrap.test.ts` 报 `TS2353`（`GovernSessionInput.bootstrap` 未定义）——**边界外**（见下）。
- **全量** `node --test "test/**/*.test.ts"` → **556 pass / 2 fail**。2 处失败均在 **`test/测试/t9-block1-bootstrap.test.ts`**（"载入器应给出治理边界路径" 等）：该文件**只 import `src/`**、**不涉及** `app/` 或 `isReadOnlyRole`/`readOnly`，属**测试/编排角色并发**的 T9 在制品（其 `GovernSessionInput` 加了未定义字段）——**与本改动无关、在本角色边界之外，如实登记、未越界改**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹逐字节相同（size=488、mtime 不变、SHA-256 `75aee37f…39655` 一致）——e2e/测试**全程只碰系统临时目录**。**未读 `.env`、未发真实网络请求、未打印凭据值。**

## 2026-10-11 — T30：桌面接线创世——未 bootstrap 项目上 su 能写出角色

**来源**：设计 §12.2（核心裁决：把创世门口放在「边界选择」层）/ §12.7 T30、派发清单 T30。**依赖已就位**：门禁引擎 **T31** 已把治理种子边界（`角色卡/`、`docs/`、`.ans/`）**由条件目录改为普通 `directory`** 并**迁入门禁引擎**（`src/common/门禁引擎/governance-seed.ts`）——于是 `scope: undefined` 下它们**命中即放行**、`src/**` 仍拒。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 缺口（为何此前这条路跑不通）

核实（§12.1）：桌面开会话传 `scope: undefined`（`app/desktop/session.ts::openRoleSession`），而**创世可写条目全是条件目录**——条件目录须由 `scope.conditions` 显式声明 slug 才激活（`resolve-write.ts::isActive`），`scope` 缺失 ⇒ 条件目录**恒不激活** ⇒ **su 一个字也写不了**。界面那句「项目尚未 bootstrap：与 su 对话，让它创建角色」因此是**空头支票**。且 `app/desktop/project.ts::buildProjectConfig` **从未设 `genesisBootstrap`**（全仓无一处设置）。

### 改了什么（均在本角色边界内）

- **`app/desktop/project.ts`（接线落点）**：`buildProjectConfig` 在 `listing.hasRoles === false` 时**显式设** `ProjectConfig.genesisBootstrap = { source }`：
  - `source` **如实记录授权来源**、**用枚举给出的 `primaryRoleId`（不硬编码 "su"）**：
    `desktop-app:操作者导入空文件夹并开启 <primaryRoleId> 对话 = 发起 bootstrap（有界创世授权：仅治理产物 角色卡//docs//.ans/）`。
  - **切换条件（§12.2，双保险之一）**：项目**一有角色（`hasRoles === true`）就不再设**本字段——su 随即改由**项目边界**治理（`resolveBoundarySection` 的**项目覆盖**分支）。**另一重保险**是门禁引擎的**结构性自终止**：项目自己的治理边界文档一经写出并被接受（`governanceBoundary.path` 非空），**项目覆盖分支先于创世分支求值**，创世授权随之失效——**即便本字段残留也不再生效**（不依赖调用方清除它）。
  - **非 blanket**：条目仅 `角色卡/`、`docs/`、`.ans/` 三处治理产物（**不含 `src/`、不含项目内任意文件**），且**仅在 `!hasRoles` 时设**——「有界性」的实质在门禁引擎 `governance-seed.ts`，本层只负责**何时**设。
- **`app/desktop/session.ts`（注释）**：记录**会话路径裁决**与创世链路；**无代码行为改动**（`genesisBootstrap` 经 `buildProjectConfig` 流入，会话仍经 `openRoleSession` 以 `scope: undefined` 开启）。

### 会话路径裁决（**选一并说清理由**）：沿用 `openRoleSession`，**不**改走 `openGovernanceSession`

**裁决：沿用 `openRoleSession` + `scope: undefined`，仅加 `genesisBootstrap`。** 理由（§12.2）：

1. **`openGovernanceSession` 现无法表达 `scope: undefined`**：它仍在**内部**用 `buildGovernScope(boundary, roleIds)` 造 scope（且开会话前先经 `writeGovernanceSkeleton` 落骨架，属 **T32** 待退役面）。对空项目 `roleIds` 为空 ⇒ `writeSet: []` ⇒ `resolveWrite` 的 **F4 是精确集合匹配 ⇒ 拒一切写**——与 §12.2 明确要求的「`scope: undefined`」相悖。要让它表达 `scope: undefined`，须改它本身，而它属**编排**边界（`src/pipeline/orchestration/govern-session.ts`），**非本角色可动**。
2. **这不是「第二套会话机制」**：`openRoleSession` 恰是 `openGovernanceSession` **内部同样经其开启会话**的**同一底层会话入口**（`govern-session.ts:121` 调 `openRoleSession`）。本层沿用它与「两前端共享同一引擎」的规矩并不冲突——**同一入口**，本步只是把「未 bootstrap」这一授权事实经 `genesisBootstrap` 交给门禁引擎。
3. **创世门口放「边界选择」层最干净**（§12.2）：`resolveBoundarySection` 对**内置治理角色**在 `genesisBootstrap` 下返回种子边界；`scope` 保持 undefined ⇒ **无需 scope、无需 slug**。不用「创世 scope」——F4 的 `writeSet` 是精确集合，表达不了「`角色卡/<对话中才定的未来角色>/…`」，且空 `writeSet` 的既有语义正是「拒一切」。

### 界面文案核对（第 4 项）

`app/renderer/renderer.js` 的「**项目尚未 bootstrap：与 <主入口> 对话，让它创建角色。**」（`renderBootstrapNotice` / `loadProject` 提示）**现在为真**（T30 接线 + T31 种子边界后 su 在未 bootstrap 项目上确能写出治理产物）。

**另发现一处反向不一致（**回报**，未改）**：su 的「**只读**」左树徽标 + 会话内联「本版只读」（判据 `isReadOnlyRole = builtIn===true && boundary.acceptance.accepted===false`，`listProject` 所给 su 边界恒未接受）在**未 bootstrap 项目**下**已不准确**——该场景 su 经创世边界**确能写**治理产物，界面却仍标「只读」。这是**「文案说不能做、代码能做」**（与「空头承诺」方向相反），属 T30 影响面之外：改它要动 `RoleView.readOnly` 的派生面（须把 `hasRoles` 纳入判据）并牵动 e2e 既有 `SU_READONLY_*` 语义，故**如实回报、交协调方定，未擅自改**。

### 测试与验证（本角色独立执行）

- **新增 `test/桌面应用/genesis-bootstrap.test.ts`（6 例）**——用**系统临时目录**造假空项目，跑完清理、不在仓库留文件：
  - 未 bootstrap（`hasRoles:false`）→ `ProjectConfig` **带** `genesisBootstrap`，`source` 含 `desktop-app` 与 `primaryRoleId`；
  - 已 bootstrap（真实仓库根）→ **不带** `genesisBootstrap`（连键都不出现）；
  - **gate 直接判**（经**假适配器**从 `createAdapter(gate)` 捕获 su 会话的 **真实 gate**，不落盘、不调模型）：`角色卡/<新角色>/role-card.md`、`boundary.yaml`、`docs/design/x.md`、`.ans/project.json` → **allowed**；`src/evil.ts` 与项目根外绝对路径 → **denied**；
  - **反例**：已 bootstrap（有角色）时 su 的 gate **拒绝** `角色卡/<新角色>/role-card.md`（不再有创世授权，切换生效）。
- **单测** `node --test test/桌面应用/*.test.ts` → **71 pass / 0 fail**（基线 65 + 6）。
- **`npm run typecheck`**（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **560 pass / 0 fail**（基线 554 + 6）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。既有检查点**全过**——`DEFAULT_SELECTED_ROLE=su`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`、`HANDBACK_*`、`MIRROR_*`、`PI_*`（`PI_TOKEN_MASKED`/`PI_PANEL_PATH_IS_TEMP`/`PI_ENV_NOT_REPO_ROOT`/…）；未 bootstrap 状态 `BOOTSTRAP_HAS_ROLES=false`、`BOOTSTRAP_NOTICE_TEXT=项目尚未 bootstrap：与 su 对话，让它创建角色。`、`BOOTSTRAP_NOTICE_IS_ERROR_STYLE=false`；造角色 + `project:changed` → `REFRESH_TREE_HAS_EXAMPLE=true`/`REFRESH_NOTICE_CLEARED=true`。**无 WATCHDOG_TIMEOUT / E2E_ERROR**，跑完**无残留 Electron 进程**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹逐字节相同（size=488、mtime 不变、SHA-256 一致）——e2e/测试**全程只碰系统临时目录**（Pi 面板经注入的临时 `.env`）。**未读 `.env`、未发真实网络请求、未打印凭据值。**

### 边界登记（不在本角色边界内的相邻事项）

- **`openGovernanceSession` 的 shape 收敛（T32）**：本步**未动**编排的治理会话入口。若后续客户/协调方希望桌面 su **统一**经 `openGovernanceSession`（T30 文本的理想形态），需 **T32** 先把它改为**不预建骨架**且**接受 `scope: undefined`**（或按边界条件目录给最小 scope），届时本层可改走它——**当前它做不到，故本层沿用 `openRoleSession`**。
- **2026-10-12 更正**：本条目「会话路径裁决」与上一条所述的前提**现已满足**——T32 已落地（预建骨架退役、骨架模块 `src/common/编排/bootstrap.ts` 已删），引擎现于 `conditions`/`writeSet` 均空时把 scope 收窄为 `undefined`（权威表述见 `src/pipeline/orchestration/govern-session.ts` 的 `effectiveScope` 处）；`app/desktop/session.ts` 的会话路径注释已同步更正（含行号 `govern-session.ts:121` → `170`）。更正记录见 `docs/change/2026-10-12_change_session-comment-refresh.md`。**上文历史正文保留不改写。**

## 2026-10-11 — T28：Pi 配置面板 + 启动载入/保存 `.env`（补 Electron 缺失的 `--env-file`）

**来源**：pm 设计 §11（客户 2026-10-11「为啥不能通过页面设置呢」→ 选定「页面设置 → 保存到 `.env`」）、派发清单 T28。**依赖已就位**：pm（T26）建共享 `.env` 读写模块 `src/common/shared/env-file.ts`（属主 pm，消费方**只读导入、不得复制第二份**）。**属本角色边界内**（`app/`、`test/桌面应用/`）。

### 前提（为什么这块是「让桌面 pi 路径可用」的前提，不只是「好用」）

桌面 pi 路径此前**根本不可达**：① `package.json` 的 `"app": "electron app/main.ts"` **无 `--env-file`** ⇒ Electron 进程 `process.env` 里**没有** `ANS_PI_*`/token；② 桌面**没有通道**把 Pi 配置交给适配器（且设计已裁定**不扩** `createPiAdapterFactory` 签名，见 §11.3）。本任务用**载入 `.env` 到 `process.env`** 补上缺失的 `--env-file`，此后 `resolvePiProviderConfig(opts, process.env)` **原样复用**——**单一来源，无第二份读取逻辑**。

### 改了什么

- **新增 `app/desktop/pi-config.ts`**（纯逻辑，不依赖 electron）：面板 5 键常量 `PI_PANEL_KEYS`（`ANTHROPIC_AUTH_TOKEN` 机密 + `ANS_PI_BASE_URL`/`ANS_PI_MODEL`/`ANS_PI_PROVIDER`/`ANS_PI_CONTEXT_WINDOW`）、默认路径 `resolveRepoEnvPath()`（= 仓库根 `.env`，与 CLI `--env-file=.env` 同一文件）、`getPiConfig`（**掩码**：机密键恒返空 `value`、只给 `isSet`）、`savePiConfig`（**只改面板键**、原子写、**保存后重载**）、`loadPiEnv`（包装 `loadEnvFileInto`）、`missingPiKeys`。**只读导入**共享模块——**未重写 `.env` 解析/合并/原子写**。
- **`app/main.ts`**：启动 `app.whenReady()` 时先 `await loadEnvFileInto(process.env, resolveRepoEnvPath())`（**补 `--env-file`**，只回报键名、绝不打印值）；新增 IPC `pi-config:get` / `pi-config:save`（透传 Interface）。
- **`app/desktop/interface.ts`**：`DesktopInterface` 增 `getPiConfig`/`savePiConfig`；`DesktopDeps` 增**可注入** `envFilePath`（缺省仓库根）与 `piConfigEnv`。**测试/e2e 必须注入临时路径**。
- **`app/preload.cjs`**：暴露 `getPiConfig`/`savePiConfig`（白名单通道，不暴露任何 Node 能力）。
- **`app/renderer/{index.html,renderer.js,styles.css}`**：输入区运行时选择器旁新增「**Pi 设置**」按钮 + 可收起面板 `#pi-panel`（与 demo/pi 选择器并列；**选 pi 时自动展开** = 补救入口）。5 字段 + token（`type=password` 掩码、可显式「显示」）+ 保存按钮 + 状态行；缺项时明确告警「选 pi 开会话会被拒（fail-closed）」。渲染侧**不作任何判定**——读写/掩码全经主进程单一来源。
- **测试**：新增 `test/桌面应用/pi-config.test.ts`（10 例）+ `renderer.test.ts` 增 1 例源码不变式守卫；`test/桌面应用/e2e/main.mjs` 增面板检查点（经**注入的临时 `.env`**，**不碰仓库根真实 `.env`**）。

### 写入纪律与凭据纪律（设计 §11.4 客户红线，逐条落地）

- **只改相关键**：保存经 `saveEnvFile`/`mergeEnvText` **逐行**、只替换命中键，注释/空行/未知键/顺序**逐字节保留**；非面板键被过滤（**绝不越界写任意键**）；未设置又留空的非机密键**跳过**（不凭空造空键）；**留空的 token 不提交**（保留已设置值）。
- **token 不回显**：`getPiConfig` 对机密键**恒返空 value**、只给 `isSet`；界面**默认掩码**、**绝不预填**；保存/读取回报**只含键名**；错误文本经共享模块 redact，本模块再对入参值**兜底 redact**——**哨兵 token 断言**证明其不出现在任何视图/回报/错误里。
- **原子写 + 失败显式**：由共享模块保证（同目录 temp+`rename`；失败抛错）；**保存后重载** `process.env`，**下一会话即用新值**。

### 证据

- `node --test test/桌面应用/*.test.ts` → **65 pass / 0 fail**（+11：`pi-config.test.ts` 10 + `renderer.test.ts` 1）。
- `npm run typecheck` → **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **533 pass / 0 fail**（基线 522 + 11）。
- e2e（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）退出码 0、`E2E_DONE=1`；既有检查点 `DEFAULT_SELECTED_ROLE=su`/`NO_MODAL_*`/`HANDBACK_*`/`MIRROR_*` **全过**；新增 `PI_PANEL_OPEN=true`/`PI_FIELD_COUNT=5`/`PI_TOKEN_MASKED=true`/`PI_PANEL_PATH_IS_TEMP=true`/`PI_TEMP_ENV_*`/`PI_TOKEN_STILL_MASKED=true`/`PI_TOKEN_VALUE_CLEARED=true`/`PI_TOKEN_PLACEHOLDER_SET=true` 全真；跑完**无残留 Electron**。
- **真实 `.env` 未被触碰**：跑前/跑后指纹逐字节相同（size=488、mtime 不变、SHA-256 一致）——e2e/测试**全程只碰系统临时目录**下的假 `.env`。

## 2026-10-11 — T23（桌面侧）：`normalizeArgv` 收归共享单一来源（`app/desktop/operator-channel.ts`）

**来源**：pm 设计 §3.11 行 7（全仓**最后一处**跨角色镜像）、派发清单 T23。**依赖已就位**：pm（T23）把 argv 规范化原语**整体搬迁**（搬迁，非 fork）到共享单一来源 **`src/common/shared/argv-primitives.ts`**（属主 pm，消费方**只读导入、不得复制第二份**）。**属本角色边界内**（`app/`）。

### 改了什么（**行为逐字不变**）

- **`app/desktop/operator-channel.ts`**：
  - **删**本地函数 `normalizeArgv`（及其 doc 注释）——原体为
    ```ts
    function normalizeArgv(argv: unknown): string[] {
      if (!Array.isArray(argv)) return [];
      return argv.filter((x): x is string => typeof x === "string");
    }
    ```
  - **改**从 **`src/common/shared/argv-primitives.ts`**（pm 属主，**只读导入**）取 `normalizeArgv`：`import { normalizeArgv } from "../../src/common/shared/argv-primitives.ts";`。
  - **调用点零改**：`describeShellCommand` 内 `const argv = normalizeArgv(prompt.argv);` **原样不动**——**只改来源，未改编调用形状**。

### 为何值得做（同源即审计与所见不可漂移）

`normalizeArgv` 在**编排侧**用于把规范化后的 argv **写进审计记录**（`docs/audit/shell-gate.jsonl` 的 `argv` 字段），在**桌面侧**用于**展示给操作者**（`describeShellCommand` 的逐项 argv 行）。二者此前各自维护、必须逐字同源——否则「**落进审计的 argv**」与「**操作者所见到的 argv**」可能漂移，而审计的意义正是「**审的什么原文**」可查。收敛为单一来源后，两边**同一函数**，漂移在结构上不可能。

### 行为逐字不变怎么确认

- **函数体逐字相同**：共享版与本地副本**字节级完全相同**（pm 已比对），差异**仅**多一个 `export` 关键字；语义（非数组→`[]`；只留 `typeof === "string"` 项；不去重/不裁剪空白/不转义；保序；恒返回值、绝不抛错）**逐字一致**。
- **调用点零改**：`describeShellCommand` 的调用是**唯一**消费点，未动。
- **无第二份判定**：本次为**纯词法原语**的搬家，**不含**任何命令分类/白名单/规则逻辑——硬约束（不得有第二份判定实现）不受影响。

### 顺带自查：本模块是否还有别的共享模块逐字副本

**已无。** `app/desktop/operator-channel.ts` 现持全部「跨角色共享物」（operator 三型 ← `src/provider/pi/session.ts`；`normalizeArgv` ← `src/common/shared/argv-primitives.ts`）皆**只读导入**，无逐字副本；本模块其余函数（`argvLine`/`renderConfirmText`/`withConfirmTimeout`/`readConfirmTimeoutMs`/`reasonOf` 等）均为本模块独有，共享层无对应物。

### 与前次登记的衔接

上轮 **T22（补）** 曾如实登记：`operator-channel.ts` 的 `normalizeArgv` 虽与编排私有 `src/common/编排/shell-gate.ts` 的同名函数**同形**，但那是**别角色私有 `common/`**（工程法案 §6 禁跨角色导入）、**非 `src/common/shared/` 共享模块**，故当时**不属收敛面、未动**。本轮 pm 已把它**整体搬迁**到 `common/shared/`——收敛面成立，本角色随之**删本地副本、改只读导入**。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**。
- **类型门禁** `npm run typecheck`（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **460 pass / 0 fail**（与基线 460 一致）。
- 未读 `.env`、未发真实网络请求、未打印凭据值。

## 2026-10-11 — T22（补）：收掉最后一处路径镜像 `toPosix`（`app/desktop/project.ts`）

**来源**：pm 设计 §3.11 行 5 / 派发清单 T22——其文本**明列** `app/desktop/project.ts` 的 `toPosix` 应在收敛之列，但上一轮 T22 的三项清单（operator 三型 / `resolveSkillRoot` / `RuntimeKind`）**漏列**了它，当时如实回报、未动；本轮补齐。依赖 pm T23（单一来源 `src/common/shared/path-primitives.ts` 已就位）。**属本角色边界内**（`app/`）。

### 改了什么（**行为逐字不变**）

- **`app/desktop/project.ts`**：**删**本地逐字 `toPosix`——原体为
  ```ts
  export function toPosix(p: string): string {
    return p.replace(/\\/g, "/");
  }
  ```
  **改**从 **`src/common/shared/path-primitives.ts`**（pm 属主，**只读导入**）取 `toPosix`，并 `export { toPosix }` **原样转出**——**单一来源，不是第二份**。公开面 `toPosix` 不变；本模块内 `posixDirname` 的调用点不变（仍调 `toPosix`）。

### 为何是「转出」而非纯内部导入

`toPosix` 原为 `project.ts` 的 `export`。为**逐字保住公开面**（不缩小本模块 API），照 T22 对 `resolveSkillRoot` 的同一处置：**只读导入 + 原样转出**（`export { toPosix }`），指向共享实现——**同一函数，非副本**。全仓 grep 复核：无外部消费方从 `project.ts` 取 `toPosix`；`api-spec.md` 的「对外导出」亦未列它——转出为**保守**保留、零风险。

### 顺带自查：`app/desktop/` 下是否还有别的共享模块逐字副本

**已清干净——`app/desktop/` 其余四处无 `src/common/shared/` 的逐字副本**：
- `session.ts`：`RuntimeKind` 上轮（T22）已改从 `runtime-shared.ts` 只读导入 + 转出；`.ans` 载入链（`loadEffectiveConfig` 及 `LoadConfigOptions`/`LoadedConfig`/`ConfigSourceKind`）只读导入，**无终态规则/加载器的第二份**。
- `project.ts`：`resolveSkillRoot` 上轮已转出；本轮 `toPosix` 转出后，**无遗留**。
- `operator-channel.ts`：契约三型（`OperatorPrompt`/`OperatorOutcome`/`OperatorChannelFn`）已只读导入 + 转出。
- `chat-adapter.ts`：无共享模块对应物。

**如实列出、未动（不属于「共享模块副本」）**：`operator-channel.ts` 的 `normalizeArgv` 与编排私有 `src/common/编排/shell-gate.ts` 的同名函数**同形**，但那是**别角色的私有 `common/`**（工程法案 §6 禁跨角色导入），**非 `src/common/shared/` 共享模块**——本角色已按「本角色自持、不跨角色导入他人私有 `common/`」登记其取舍，不在本次（`common/shared/` 收敛）范围内。`posixDirname` 为本模块独有，共享层无对应物，非副本。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**。
- **类型门禁** `npm run typecheck`（`tsc --noEmit`）→ **全仓零错误**。
- **全量** `node --test "test/**/*.test.ts"` → **448 pass / 0 fail**（与基线一致）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`；关键检查点**全过**——`DEFAULT_SELECTED_ROLE=su`、`SU_*`、`WRITE_MODE_*`、`RUNTIME_NOTE_*`、`BOOTSTRAP_*`、`REFRESH_*`、`HANDBACK_*`、`MIRROR_*`、`NO_MODAL_*`。跑完无残留 Electron 进程。

## 2026-10-11 — T22：三处「逐字镜像」改为只读导入（operator 三型 / `resolveSkillRoot` / `RuntimeKind`）

**来源**：设计 §3.11（全仓盘点 §6 逼出的跨角色镜像并裁决收敛）、派发清单 T22。**依赖已就位**：Pi适配器 T20 把 operator 三型置入 §4 冻结契约家 `src/provider/pi/session.ts`；pm T23 建 `src/common/shared/runtime-shared.ts`（含 `resolveSkillRoot`/`RuntimeKind`）。**§6 的跨角色私有不导入**约束因此解除——镜像可删、改只读导入（**同一契约只许一个形状**）。

### 改了什么（均在本角色边界内；**行为逐字不变**）

- **`app/desktop/operator-channel.ts`**：
  - **删**本地逐字镜像 `export interface OperatorPrompt`、`export type OperatorOutcome`；**改**从 `src/provider/pi/session.ts` **只读导入**、**原样转出**（`import type { OperatorPrompt, OperatorOutcome, OperatorChannelFn } from ...; export type { ... };`）。`import type` 纯类型、被擦除 ⇒ 本模块仍**不静态依赖 electron / Pi 包**。公开面保留原名——既有消费方（`app/main.ts`）与测试从本模块取这两型仍可用。
  - **删**本地同名第二形状 `export type OperatorChannel = (prompt) => Promise<OperatorOutcome>`；`createDesktopOperatorChannel` 的**返回类型改为推断**（= `(prompt: OperatorPrompt) => Promise<OperatorOutcome>`，确定型）。`OperatorChannel` 无任何外部消费方（全仓 grep 复核）。
- **`app/desktop/project.ts`**：**删**本地逐字 `resolveSkillRoot(env = process.env)`（连同**只服务它**的 `import os from "node:os"`）；**改**从 `src/common/shared/runtime-shared.ts` **只读导入**并 `export { resolveSkillRoot }`（公开面不变）。`buildProjectConfig` 内 `resolveSkillRoot(env)` 调用点不变。
- **`app/desktop/session.ts`**：**删**本地 `export type RuntimeKind = "demo" | "pi"`；**改**从 `src/common/shared/runtime-shared.ts` **只读导入**并 `export type { RuntimeKind }`（公开面不变）。`SessionOpenRequest.runtime` 等用法不变。

### ⚠ 形状对不上（**回报**，未自调和）

- **第三型（通道）不是逐字镜像**：冻结家 `OperatorChannelFn = (prompt) => Promise<OperatorOutcome | null | undefined> | OperatorOutcome | null | undefined`——**允许返回空**；而本模块**产出**的通道**恒返回确定的 `OperatorOutcome`**（所有分支皆 return，绝不返回 `null`/`undefined`）。二者是**子类型**关系（本产出窄于、且可赋入 `OperatorChannelFn`），**非逐字同形**。
- **处置**：**不把本模块的产出形状改宽为 `OperatorChannelFn`**——那会削弱本角色 API（消费方被迫处理不可能出现的空），且**非「行为逐字不变」**。故 `createDesktopOperatorChannel` 返回**推断的确定型**，契约的**唯一命名形状**仍是冻结家的 `OperatorChannelFn`（本模块只读导入、原样转出，**不自造第二形状**）。**如实回报**，未越界改（`src/provider/pi/session.ts` 属 Pi适配器）。
- **另注（回报，待裁定）**：`app/desktop/project.ts` **仍持一份逐字镜像 `toPosix`**（= `src/common/shared/path-primitives.ts` 的 `toPosix`）——pm 设计 §3.11 行 5 与派发清单 T22 文本**列有它**，但**本次 T22 三项清单未含**，**故未动、如实回报**（若纳入，处置同 `resolveSkillRoot`：删本地、改只读导入并原样转出，`posixDirname` 调用点不变）。

### 行为逐字不变怎么确认

- **形状**：`OperatorPrompt`/`OperatorOutcome` 与 `src/provider/pi/session.ts` 的定义**逐字同形**（字段、可选性、判别联合成员逐一相同）；`RuntimeKind`/`resolveSkillRoot` 与 `runtime-shared.ts` **逐字同源**（pm 测试「与桌面旧副本同值」仍钉死，且现为**同一函数**）。
- **调用点零改**：`describeShellCommand` / `OperatorPresenter.present` / `createDesktopOperatorChannel` / `buildProjectConfig` / `SessionOpenRequest` 的签名与调用**未动**；只改「类型/函数的来源」。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**（`test/桌面应用/operator-channel.test.ts` 的 `OperatorPrompt` 导入源一并改为 `src/provider/pi/session.ts`；断言不变）。
- **类型门禁** `npm run typecheck`（`tsc --noEmit`）→ **全仓零错误**（含 `app/`、`test/桌面应用/`；本轮**连编排 `test/编排/shell-review-chain.test.ts` 的旧报错也已被编排修掉**）。
- **全量** `node --test "test/**/*.test.ts"` → **448 pass / 0 fail（全绿）**。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`；关键检查点**全过**——`DEFAULT_SELECTED_ROLE=su`、`HANDBACK_CARD_PRESENT=true`/`HANDBACK_TITLE=回交 su`、`MIRROR_CARD_PRESENT=true`/`MIRROR_HAS_FROM=true`/`MIRROR_STATUS_BLOCKED=true`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`，既有 `SU_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*`/`BOOTSTRAP_*`/`REFRESH_*` 亦全过。跑完无残留 Electron 进程（**未真开 pi 会话**）。

## 2026-10-11 — T20：`emitEvent` 类型放宽到编排事件 + 接上「回交 su」呈现/镜像（§10.8）

**来源**：设计 §10.8（角色完成后把结果交回 su——回交卡片 + 镜像进 su）；派发清单 T17/T20。**补齐 T17 标注「依赖 T16 的 `handback` 事件、本轮未做」的那一件**：编排 T16 已给会话事件流加 `handback` 事件、并把 `RoleSessionHandle.events()` 改为 `AsyncIterable<OrchestrationEvent>`——本步把桌面链路的类型对齐并接上呈现。

### 类型从哪导入、放宽了哪些处

- **类型来源**：`OrchestrationEvent` 从**编排的模块只读导入**——`src/common/编排/handback.ts`（也是 `src/pipeline/orchestration/run-role.ts` 导入它的位置）。**未复制形状、未另立第二份**。
- **放宽处（入参类型 `SessionEvent` → `OrchestrationEvent`）**：
  - `app/desktop/session.ts`：`SessionManagerDeps.emitEvent`。
  - `app/desktop/interface.ts`：`DesktopDeps.emitEvent` + 内部 `emitSessionEvent(ev)` 形参（`settled` 触发 `project:changed` 的判据不变，`handback` 不触发刷新）。
  - `app/main.ts`：IPC 外推 `emitEvent`（原 `unknown` → `OrchestrationEvent`，原样透传、不加工）。
- **改动的必要性**：`openRoleSession` 的 `events()` 现产 `OrchestrationEvent`（`SessionEvent` ⊇ 收窄、加新 `handback`），而 `deps.emitEvent` 原收 `SessionEvent`——**两端类型不再匹配**（`node --test` 靠类型擦除不报，`tsc` 会抓）。放宽后两端一致。`app/preload.cjs` 无类型，未改。

### 「回交 su」呈现怎么做的；镜像进 su 的条件

- **呈现**（`app/renderer/renderer.js`）：`appendEvent` 增 `kind === "handback"` 分支 → `appendHandback(ev.handback)`；新增 `handbackTarget` + `ICONS.handback`（内联 SVG 回箭头）。卡片结构：图标 + 标题 + 结论徽标（`hb-ok` 已完成 / `hb-blocked` 被拦下）+ 「角色/任务」元行 + 摘要 + 证据列表（`hb-ev`，只搬产物证据；无证据时「（无被接受的写入证据）」）。**只呈现事件携带的数据，不作任何判定**（是否完成/被拦由编排给）。
- **归属判据 `handbackTarget`**（纯呈现层）：当前打开会话是**产出该回交的角色** → 自己的聊天里显示「**回交 su**」卡片；当前打开会话是**主入口角色**（`state.primaryRoleId`，**不硬编码 "su"**）→ **镜像进 su 的聊天流**，标题「**来自 <role> 的报告**」、卡片带 `is-mirror`（虚线边框区分）。二者皆非 → 该回交不属当前流，跳过。
- **样式**（`app/renderer/styles.css`）：新增 `.msg-handback` 系列（左缘主色、卡片式；`.is-mirror` 虚线边框）——纯 CSS、无外部依赖、无 emoji、无渐变，与既有设计语言一致。

### 其余类型不匹配处（回报）

- **本角色边界内（已随之修正）**：`test/桌面应用/session.test.ts`、`test/桌面应用/ans-wiring.test.ts` 的 `emitEvent` 收集器原把编排事件推进 `SessionEvent[]`——`emitEvent` 放宽后入参为 `OrchestrationEvent`，推进 `SessionEvent[]` 会 `tsc` 报错。已把这两处的收集器/参数类型改为 `OrchestrationEvent[]`（断言不放松）。
- **边界外（未越界改，如实登记）**：`tsc --noEmit` 下 `test/编排/shell-review-chain.test.ts` 有 **4 处**报错（418/421/424 行 `TS18049 'empty'/'weird'/'eof' is possibly null or undefined`；487 行 `TS2769` 重载不匹配）——**属编排角色**，与本改动无关（本改动不触及该文件），**回报、不越界改**。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **54 pass / 0 fail**（+3：`session.test.ts` +1「handback 事件被外推」、`interface.test.ts` +1「Interface 的 emitEvent 外推 handback」、`renderer.test.ts` +1「回交卡片/镜像源不变式」）。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。新增检查点全真：
  - 自己的聊天：「回交 su」——`HANDBACK_CARD_PRESENT=true`、`HANDBACK_TITLE=回交 su`、`HANDBACK_NOT_MIRROR=true`、`HANDBACK_STATUS_OK=true`、`HANDBACK_EVIDENCE_ROWS=1`；
  - su 会话开着（切到 `primaryRoleId`）→ 镜像——`MIRROR_CARD_PRESENT=true`、`MIRROR_CARD_TITLE=来自 桌面应用 的报告`、`MIRROR_HAS_FROM=true`、`MIRROR_STATUS_BLOCKED=true`、`MIRROR_EVIDENCE_EMPTY=true`。
  - 既有检查点**全过**：`DEFAULT_SELECTED_ROLE=su`、`SESSION_NOT_AUTO_OPENED=true`、`NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME=true`、`SU_*`、`WRITE_MODE_*`、`RUNTIME_NOTE_*`、`BOOTSTRAP_*`、`REFRESH_*`。跑完无残留 Electron 进程。（**未真开 pi 会话**；回交经直接推 `session:event` 驱动渲染侧。）
- **全量** `node --test "test/**/*.test.ts"` → **448 pass / 0 fail**（**已无 T17 所述的 1 处 `test/测试/real-entry.test.ts` init 失败**——`ans init` 断言已被作废/移除；本文件属别角色，本角色未动）。
- **类型门禁** `tsc --noEmit`（装配已装 TypeScript 7.0.2）：`app/` 与 `test/桌面应用/` **零错误**；仅 `test/编排/shell-review-chain.test.ts` 的 4 处报错（边界外，见上）。

## 2026-10-11 — T17：su 置顶为主入口/默认选中 + 未-bootstrap 状态 + 左树刷新（含 T19 复核）

**来源**：设计 §10.3（未-bootstrap 状态与左树刷新）/§10.7（su 为主入口、其他角色次级；`primaryRoleId`）/§10.8（回交，本轮不涉）；派发清单 T17。门禁引擎 **T14** 已给 `listProject` 加 `hasRoles` 与 `primaryRoleId`。

### 改了什么（均在本角色边界内）

- **`app/desktop/interface.ts`**：
  - `ListProjectResult` 增 **`hasRoles` 与 `primaryRoleId`**——**原样转自门禁引擎 `listProject`**（`app:list-project` 的返回随之带出；**本层不重判**，单一来源仍是门禁引擎）。
  - `DesktopDeps` 增可选 **`emitProjectChanged?`**；`createDesktopInterface` 以 `emitSessionEvent` 包装会话事件外推：**当事件是 `settled`（会话一轮结束的终止信号；真实 Pi 适配器 `agent_settled` 即发此）且当前打开的是主入口角色时**触发该信号。判据用 `manager.openForRoleId()` 对照枚举缓存的 `primaryRoleId`，**不硬编码 "su"**。
- **`app/main.ts`**：把 `emitProjectChanged` 接到 `win.webContents.send("project:changed")`（**IPC 形状：主进程 → 渲染进程，单参无载荷的 `project:changed` 事件**）。
- **`app/preload.cjs`**：暴露 `onProjectChanged(cb)`（订阅 `project:changed`，返回退订函数）。
- **`app/renderer/renderer.js`**：
  - `state` 增 `primaryRoleId` / `hasRoles`（皆取门禁引擎字段）。
  - `loadProject` 重构为 `loadProject` + **`applyListing(res, fresh)`**：**导入后默认选中并高亮主入口角色**（`state.selectedRoleId = state.primaryRoleId`）——但**不自动开会话**；`fresh=false`（刷新）保留当前选择/会话，仅在所选角色已不存在时回退主入口。
  - `renderRoleTree` 改为分组：**主入口角色置顶为「主入口」分组**，其余归「**其他角色（查看/调试）**」——次级角色**保留、可点、可聊**。
  - 新增 **`renderBootstrapNotice`**：`hasRoles===false` 时显示「**项目尚未 bootstrap：与 <主入口> 对话，让它创建角色。**」（**非报错**）。
  - `clearChat`：空聊天区给**「开始与 <主入口> 对话」主 CTA**（点它才开会话）。
  - 新增 **`refreshProject`**，并 `d.onProjectChanged(refreshProject)` 订阅——**su 一轮结束 → 重取枚举 → 左树随之长出**。
  - `updateControls`：发送/结束仅在**会话已开启**时可用（默认选中 ≠ 已开会话）。
- **`app/renderer/index.html`**：加 `#bootstrap-notice` 元素。
- **`app/renderer/styles.css`**：加 `.bootstrap-notice` / `.tree-group` / `.ti-badge.primary` / `.btn-start`。

### 硬约束

**渲染侧无第二份判定**：主入口一律读 `primaryRoleId`、未-bootstrap 一律读 `hasRoles`（**渲染进程不硬编码 "su"、不自行派生**）；刷新只是「重取枚举」的转达，**不判定**写入是否发生（判定唯一来自门禁引擎）。

### 类型字段补齐（防类型检查器报错）

门禁引擎 T14 给 `ProjectListing` 加了 `hasRoles`/`primaryRoleId`，本角色**所有构造该类型的字面量**已补齐：`test/桌面应用/interface.test.ts`（`FAKE_LISTING` + 3 处内联；`listingB` 经 spread 继承）、`test/桌面应用/operator-channel.test.ts`（`FAKE_LISTING`）、`test/桌面应用/session.test.ts`（切换角色用例的内联）。全仓 grep 复核无其它构造点（`buildProjectConfig`/`resolve-role` 等只读消费、不构造）。

### 回交（§10.8）——**本轮未做，如实登记**

§10.8 的「角色完成 → 回交卡片 + 镜像进 su」依赖**编排 T16 的 `handback` 事件**（类型与「settle → handback」归编排）。该事件**尚未落盘**，且本轮 T17 范围（§10.7 主位/未-bootstrap/刷新）不含回交呈现——故**未实现**，待 T16 产出 `handback` 后并入。**不越界造事件、不假装已在用。**

### 已知边界（登记）

- **刷新回路在真实 pi 运行时才自触发**：触发点是 `settled` 事件；demo 聊天适配器（`app/desktop/chat-adapter.ts`）每轮以 `message` 收尾、**不发 `settled`**，故 demo 路径不自动刷新（e2e 直接推 `project:changed` 驱动）。真实 pi 适配器 `agent_settled` 即发 `settled`（`src/common/pi-adapter/real-adapter.ts`），**主路径自触发**。
- **su 建角色此前受 T15/T16 阻塞**：V1 下 su 走内置边界、`acceptance.accepted===false`（本版只读），其写入被门禁 F6 拒；**冷启动创世边界（T15）与 su 治理写路径（T16）落盘后**，su 才能在空项目真正建出角色。本轮交付的是**机制**（settle → `project:changed` → 重取 → 左树长出）。

### 测试与验证（本角色独立执行）

- **单测** `node --test test/桌面应用/*.test.ts` → **51 pass / 0 fail**（+5：`interface.test.ts` +2（`hasRoles`/`primaryRoleId` 透传；主入口 `settled` 触发 `emitProjectChanged`、非主入口不触发）；`renderer.test.ts` +3（primaryRoleId 驱动默认选中且不硬编码 "su"；未-bootstrap 据 `hasRoles`；刷新通道两端齐备））。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：退出码 0、`E2E_DONE=1`。新增检查点全真：`PRIMARY_ROLE_ID=su`、`DEFAULT_SELECTED_ROLE=su`、`SU_DEFAULT_ACTIVE=true SU_PRIMARY_BADGE=true SU_IN_MAIN_GROUP=true`、`HAS_OTHER_GROUP=true`、`CHAT_CTA_PRESENT=true CHAT_CTA_TEXT=开始与 su 对话`、`SESSION_NOT_AUTO_OPENED=true`；临时空项目 `BOOTSTRAP_HAS_ROLES=false` + `BOOTSTRAP_NOTICE_SHOWN=true`（文案「项目尚未 bootstrap：与 su 对话，让它创建角色。」、`IS_ERROR_STYLE=false`）；造角色后推 `project:changed` → `REFRESH_HAS_ROLES=true REFRESH_ROLE_COUNT=2 REFRESH_TREE_HAS_EXAMPLE=true REFRESH_OTHER_GROUP_SHOWN=true REFRESH_NOTICE_CLEARED=true`。既有 `SU_*`/`NO_MODAL_*`/`WRITE_MODE_*`/`RUNTIME_NOTE_*` **全过**。跑完无残留 Electron。
- **全量** `node --test "test/**/*.test.ts"` → **445 pass / 1 fail**（+ 本角色 51 全绿）。**唯一 1 处失败在 `test/测试/real-entry.test.ts`**（`真实入口:ans init <临时目录> 以 0 结束并生成骨架`），**根因在编排角色**：`src/interface/cli/init.ts` 已被**删除**（§10.4 废 `ans init`，归 T16），而该 init 断言属**测试角色**、待 **T18** 作废（§10.4）——**属别角色并发工作、在本角色边界之外，如实登记、未越界修**。（本轮全量总数**波动中**：429→446，因多角色并发增删测试；本文件记录的是本角色跑测时的读数。）

### T19 复核（客户已确认：V1 不 arm）

**复核 `角色卡/桌面应用/changelog.md`**：**无遗留的「待客户拍板」**——措辞已是「**客户已确认：V1 不 arm**」，并注明操作者确认对话框通道**已建但未被消费**（是 V1 范围、非欠账）。`memo.md` / `api-spec.md` / `functional-description.md` / `role-card.md` 亦无该措辞。**核对无遗漏，无需改动。**

## 2026-10-11 — T8b 契约对齐：操作者通道 (a) 对齐编排定形的形状（含 T19：V1 不 arm 客户已确认）

**来源**：编排 T8b 把 (a) 注入点形状**定死**于 `src/common/编排/shell-gate.ts` 与 `src/common/编排/operator-channel.ts`（**只读**）；本角色据此**对齐**。附 **T19**（changelog 措辞：客户已确认 V1 不 arm）。设计 §7.3/§7.4/§7.5/§7.6。

### 背景：T8b 先前的形状是**假设**，现按编排定形对齐

T8b 时 **编排尚未定出 (a) 的接口**，本角色按 §7.4 描述**自拟了一个可对接的形状**并在回报与 changelog 中**如实标注为「假设」**：收 `ShellReviewRequest`、返回整条 `ShellReviewResult`（类型取自 §4 冻结 `src/provider/pi/session.ts`）。**现编排已定形**，本步把 `app/desktop/operator-channel.ts` 对齐到**编排定义的契约**。

### 契约（进出形状）

- **入参 `OperatorPrompt`** = `{ command; argv; cwd; toolCallId; reason? }`——比先前假设**多一个可选 `reason?`**（= (b) pm 拿不准/不可用的原话，**为何升级到人**）。
- **返回 `OperatorOutcome`** = `{outcome:"allow";operatorId?} | {outcome:"deny";operatorId?;reason?} | {outcome:"unavailable";reason?}`——**不再返回整条 `ShellReviewResult`**。
- **仅 `outcome:"allow"` 放行**；`deny`/`unavailable`/非布尔/超时/抛错**一律非放行**（由编排落判）。
- 呈现逻辑**复用**：`describeShellCommand` 仍把**逐字命令原文**（不截断）+ **逐项 argv（JSON 转义）** + **cwd** 如实摆给人看；新增 `reason` 段。

### §6 取舍（**回报**，未越界）

编排把 `OperatorChannelFn`/`OperatorPrompt`/`OperatorOutcome` 放在**其私有 `common/编排/`**；工程法案 **§6 明令「不得导入其他角色的私有 `common/`」**。故本角色**不导入编排文件**，而是把两型**逐字镜像**于本模块（**同一形状、不造第三形状**）。**代价**：有**漂移风险**（编排改形状须同步）。**建议**：编排/pm 把这三型挪到 **§4 冻结契约 home `src/provider/pi/session.ts`**（编排自身已把 `ShellGate`/`ShellReviewRequest`/`ShellReviewResult` 放那里、并按同一形状引用），届时本模块改为**只读导入**、彻底消除漂移。**本角色不越界改他人文件。**

### 拆除冗余的「第二份映射」（审计归编排）

删除先前导出的 `operatorAudit()`、`BRANCH_A_*` 常量与 `OPERATOR_BY_PREFIX`。**审计 `by`/`branch` 归编排**：编排的 `createShellGate` 由 `OperatorOutcome.operatorId` 得 `by = operator:<id>`（缺标识 → `operator:未知操作者`），并由其**自身的** `BRANCH_A_*` 分支常量与升级链得 `branch`，写入 `docs/audit/shell-gate.jsonl`。编排已明定「**通道无需自造 `by`/`branch`**」——保留桌面这份即为**与编排重复的第二份映射**（违背硬约束），故**移除**。

### fail-closed 三条怎么钉死（§7.5）

| 情形 | 本通道返回 | 编排侧落点 |
| --- | --- | --- |
| 人点**拒绝** / 关对话框 / 返回非 `allow:true` | `{outcome:"deny", operatorId, reason}` | **拒绝** |
| 确认**超时**（>timeout，默认 120000ms，`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` 可覆盖） | `{outcome:"unavailable", reason:"…超时…"}` | **拒绝** |
| 通道**不可用**（未配置 presenter / presenter 抛错） | `{outcome:"unavailable", reason:"…"}` | **拒绝** |

**绝不默认放行**：仅当操作者**明确放行**才返回 `{outcome:"allow"}`。

### 改了什么（均在本角色边界内）

- **`app/desktop/operator-channel.ts`**：入参改 `OperatorPrompt`、返回值改 `OperatorOutcome`；`describeShellCommand(prompt)` 增 `reason` 段；`OperatorPresenter.present(prompt, display)`；移除 `operatorAudit`/`BRANCH_A_*`/`OPERATOR_BY_PREFIX`；`ShellReviewRequest`/`ShellReviewResult` 导入移除。
- **`app/main.ts`**：Electron `dialog` 表现层签名随 `prompt` 命名调整 + 注释点明「形状以编排 `OperatorChannelFn` 为准」。**仍刻意不构造、不注入**（`if (DESKTOP_SHELL_GATE_ARMED)` 恒不执行）。
- **`test/桌面应用/operator-channel.test.ts`**：改到新形状；删 `operatorAudit` 用例；新增「仅 `allow` 放行」与「`reason` 有值时被展示」用例；**fail-closed 三条（拒绝/超时/不可用）仍分别钉死**；arm 决策与 arm 接缝用例保留。

### 测试与验证（本角色独立执行）

- `node --test test/桌面应用/*.test.ts` → **46 pass / 0 fail**。
- **全量**：`node --test "test/**/*.test.ts"` → **394 pass / 0 fail（全绿）**（基线 393 + 1）。
- **全用注入替身，不真弹窗**（避免 Windows 无真实点击挂死）；不读 `.env`、不发真实网络请求。

### T19：V1 不 arm —— **客户已确认**（本步一并落）

客户 **2026-10-11 拍定：V1 桌面不 arm**（本 changelog 的 T8b 小节措辞已由「待客户拍板」改为「客户已确认：V1 不 arm」）。**含义**：V1 桌面**不提供 shell 能力**（角色在被导入的项目里不能跑命令）；操作者确认对话框通道**已建但未被消费**（如实标注，别让它看起来像在用）；**是客户确认的 V1 范围、非欠账，无需实现改动**（本份实现本即按「不 arm」落）。

## 2026-10-11 — T8b：操作者确认通道 (a)（桌面端；V1 **不 arm**，如实标注未接线）

**来源**：设计 §7.3（组合 (c)+(b)+(a)，(a) 为第三闸、兜底）/ §7.4（落点 `app/` 对话框）/ §7.5（fail-closed 三条）/ §7.6（审计 by/branch）、派发清单 T8（桌面侧）。

### 背景与对接形状（**假设，已注明**）

客户裁定的 shell 审核是三层组合：**(c) 确定性硬地板 + (b) pm 模型审读 + (a) 操作者确认**。**(c)/(b) 由编排实现**；**(a) 是「人看一眼命令原文、点放行/拒绝」**——CLI 侧由编排实现，**桌面端由本角色实现**。

**先读了编排的两个接口文件**（`src/common/编排/shell-gate.ts`、`src/provider/pi/session.ts`，**只读、未改**）：
- `session.ts` 已冻结 `ShellReviewRequest {command; argv; cwd; toolCallId}` 与 `ShellReviewResult = {allow:true;by} | {allow:false;reason;by}`，`ShellGate = (req) => Promise<ShellReviewResult>`；
- `shell-gate.ts` **目前只装配了 (c)**（`review` 分支默认拒绝，注释明写「未接入 (b)/(a)」）——即 **(a) 的注入点尚未落盘**（T8 编排侧正在接）。

**故本角色按 §7.4 的描述设计一个最小、可对接的通道，并如实写明假设的形状**（不发明编排接口、不改编排文件）：
- **通道形状 = 与 `ShellGate` 同形**：`OperatorChannel = (req: ShellReviewRequest) => Promise<ShellReviewResult>`，类型**直接取自** `src/provider/pi/session.ts`（**不另立第二份定义**）。编排的 (b)+(a) 装配在 review 分支里 `await operatorChannel(req)` 取放行即可；「恰好 allow:true 才 spawn」的唯一保证仍在 Pi 适配器的 `execute`（不在本角色）。

### 改了什么（均在本角色边界内）

- **`app/desktop/operator-channel.ts`（新增，纯逻辑、不依赖 electron，可 node 单测）**：
  - `describeShellCommand(req)` → **命令原文逐字**（**不加工、不截断**）+ **规范化 argv 逐项**（JSON 转义显示，引号仅界定符）+ **cwd 原样**，并组装成给人看的提示正文（强调「逐字核对」「放行=真的执行」）。
  - `createDesktopOperatorChannel({ presenter, operatorId, timeoutMs, env })` → 通道本体。**不做任何命令判定**（不分类、无白名单）；只：呈现 → 取人选择 → 归结论。
  - `operatorAudit(result)` → 由本通道结论产出审计所需 `{ by, branch }` 的**单一映射**（`by=operator:<id>[:timeout|:unavailable]`，`branch∈{a-allow,a-deny,a-timeout,a-unavailable}`）供编排落 `docs/audit/shell-gate.jsonl` 时直接采用（本模块**不写审计**——审计归编排/pm）。超时用**本角色自持**的小计时（不跨角色导入他人私有 `common/`）。
  - **`DESKTOP_SHELL_GATE_ARMED = false`** + 详尽注释：**V1 桌面不 arm**（见下）。
- **`app/desktop/session.ts` / `app/desktop/interface.ts`**：加 **arm 接缝**——可选 `shellGate?: ShellGate`，经 `createPiAdapterFactory(project, shellGate?)`（**编排已冻结的签名**，未发明新形状）透传给 Pi 适配器。**缺省 undefined ⇒ 不 arm ⇒ `run_shell` 不注册**（能力缺席 = 最强 fail-closed）。**当前无调用方提供它**（demo 路径经 `createDemoAdapter`，无 shell 入口，与本接缝无关）。
- **`app/main.ts`**：接好操作者通道 (a) 的**表现层**（Electron `dialog.showMessageBox`：按钮「放行执行/拒绝」，`defaultId=cancelId=1` 即**默认/关窗=拒绝**，`detail` 为逐字原文提示），并留下 arm 接线点。**刻意不构造、不注入**（`if (DESKTOP_SHELL_GATE_ARMED)` 恒不执行）——**不假装在用**。

### **arm / 不 arm 的判断与取舍（本角色的产品面判断；**客户已确认：V1 不 arm**，2026-10-11）**

**裁决：V1 桌面不 arm。** 理由：
1. **(a) 只是三层链的一层；arm 的开关在「谁装配 ShellGate」——编排（T8，正在接）。** 桌面**单方无法 arm**：它没有 (c) 的规则集/分类函数（门禁引擎）、(b) 的 pm 会话、pm 边界与审计门（编排/pm）。故本角色只能**就绪通道 + 留接缝**，不能自行合闸。
2. **桌面当前最强 fail-closed 是「能力缺席」**：不注入 `ShellGate` ⇒ `run_shell` 根本不注册（§7.5.1）。这是 V1 应有的姿态。
3. **arm 是产品决定**：它会**让角色能在你导入的项目里发起 shell**（逐条过 c→b→a，只有 (b) 拿不准才弹「看原文点放行」），与桌面既定「**无弹窗**」（导入即授权）取向**存在张力**，且引入一条真实的子进程执行能力——**客户已拍板（2026-10-11）：V1 不 arm**。

**两边取舍（客户已决策 2026-10-11：V1 不 arm）**：
- **若 arm**：角色可在导入项目里跑命令（如测试/构建）；(c) 硬拦危险、(b) 自动解常规、(a) 仅在 (b) 拿不准时弹「逐字命令原文」对话框；**代价**——操作者确认对话框成为**可能发生**的交互（打破「无弹窗」），且**必须在用户项目里真起子进程**（有爆炸半径，靠 cwd 钉 projectRoot + env 剥离凭据 + 三层闸收窄）；且需编排 (b)/(a) 装配落盘后，把 gate 经 `shellGate` 接缝注入。
- **若维持不 arm**：桌面**无 shell 能力**（run_shell 不注册），通道**就绪但未被使用**（本变更**如实标注**）。**启用路径已铺好**：编排装配好 (c)(b)(a) 的 gate → 经 `shellGate` 接缝注入 → 把 `DESKTOP_SHELL_GATE_ARMED` 改 `true`。

### fail-closed 三条怎么保证（§7.5）

| 情形 | 行为 |
| --- | --- |
| 人点**拒绝** / 关对话框 / 返回非 `allow:true` | **拒绝**（`by=operator:<id>`） |
| 确认**超时**（>timeout，默认 120000ms，`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` 可覆盖） | **拒绝**（`by=operator:<id>:timeout`） |
| 通道**不可用**（未配置 presenter / presenter 抛错） | **拒绝**（`by=operator:<id>:unavailable`） |

**绝不默认放行**——一切不确定情形只往更严处退（落到「不执行」）；UI 侧同向（默认高亮/取消项是「拒绝」）。

### 审计的 by / branch 怎么带（§7.6）

- **`by`**：本通道在返回的 `ShellReviewResult.by` 里带 **`operator:<操作者标识>`**（拒绝/超时/不可用各带 `:…` 后缀）——**编排的审计**（`docs/audit/shell-gate.jsonl`，归 pm、声明 `shell-gate`）据此留「谁审的」。
- **`branch`**：本模块导出 `BRANCH_A_*` 并给 `operatorAudit()` **单一映射**，编排路由到 (a) 时取用即得 `a-allow/a-deny/a-timeout/a-unavailable`。
- **本模块不写审计**（审计落盘归编排/pm），只负责让这两项**有值、可追**。

### 测试与验证（本角色独立执行）

- **新增 `test/桌面应用/operator-channel.test.ts`（14 例）**：命令原文逐字呈现、argv 逐项、放行/拒绝、拒绝附言、**fail-closed 三条**（不可用/未配置/超时）、超时 env 覆盖、`operatorAudit` 四种映射、**arm 决策标注**（`false`）、**arm 接缝**（不提供→`undefined` 未合闸 / 提供→原样透传 / demo 路径不走 pi 工厂）。**全部可注入替身、不真弹窗**（避免 Windows 无真实点击挂死）。
- **`test/桌面应用/`**：`node --test test/桌面应用/*.test.ts` → **45 pass / 0 fail**（原 31 + 新增 14）。
- **全量**：`node --test "test/**/*.test.ts"` → **374 pass / 0 fail（全绿）**（基线 360 + 14）。

### 已知边界（登记）

- **(a) 的注入点尚在编排侧（T8）**：`src/common/编排/shell-gate.ts` 现只装配 (c)，`review` 分支默认拒绝；(b)/(a) 的装配与「桌面通道经 deps 注入编排」尚未落盘。本角色的通道**已就绪并自洽**，**待编排接线**才被消费——**如实标注，未假装已在用**。
- **arm 只对 pi 运行时有效**（demo 路径无 shell 入口）。

## 2026-10-11 — T13：桌面接入「有 `.ans` 就优先加载」（T10 阻塞解除）


**来源**：设计 §3.3（终态规则与例外）/ §3.10（`.ans` 载入器共享化）、派发清单 T13。

### 背景：T10 的阻塞已由 pm（T11）解除

T10 如实登记过一处**被跨角色依赖阻塞**：裁定要求桌面「**项目带 `.ans/project.json` 就优先用它（pin 生效），仅无 `.ans` 才回退运行期同意**」，但载入器当时在**装配私有** `src/common/装配/config-loader.ts`；工程法案 §6 禁止跨角色导入他人私有 `common/`，`src/common/shared/` 尚无可复用入口，渲染侧自写又是明令禁止的「第二份实现」——三条规则叠加，正当通路为零。**现已解除**：pm 把载入器**整体搬迁**到共享位置 **`src/common/shared/config-loader.ts`**（搬迁非 fork，单一实现；属主 pm，消费方**只读导入**）。

### 改了什么（均在本角色边界内）

- **`app/desktop/session.ts`**（接线落点）：
  - **只读导入**共享模块：`loadEffectiveConfig` 与类型 `LoadConfigOptions` / `LoadedConfig` / `ConfigSourceKind`（`src/common/shared/config-loader.ts`）。**未复制任何逻辑、未自写第二份终态规则**。
  - `SessionManagerDeps` 增可选注入 `loadEffectiveConfig`（缺省即共享载入器，便于单测）。
  - `open()` 授权块重写：以「运行期同意」构造的 `buildProjectConfig(listing, runtimeConsent)` 作 `fallback` 传入载入器 → 取回 **`source.acceptance`**（已 fail-closed 规范化的**生效** acceptance）→ `buildProjectConfig(listing, source.acceptance)` 开会话。
  - `OpenResult` 增 `config:{kind,accepted,acceptanceSource,pinCount,reason}`（供界面**如实呈现**；续接时一并带回）。
- **`app/renderer/renderer.js`**：新增 `appendConfigNote(cfg)`，并在 `selectRole` 开启成功后，当 `res.config.kind==="ans-invalid" || !res.config.accepted` 时**内联一条 `sys-config`**：明示「门禁引擎会拒绝该角色的一切写入——这不是已授权状态（不会回退到『导入即授权』）」。渲染进程**无第二份判定**（只读 `res.config` 展示）。
- **`app/renderer/styles.css`**：新增 `.sys-config`（警示色，与 `.sys-readonly` 同族但**独立类名**，便于区分/计数，不干扰 e2e 的 `SU_READONLY_ROWS`）。

### 三条路径的行为（设计 §3.3）

| 情形 | 行为 |
| --- | --- |
| **有可用的 `.ans`（带 pin）** | 用其 **pin-backed acceptance**；pin 生效、受 pin 约束——引擎 `verifyPins` 逐文件 SHA-256 比对，**不符合即未接受 → 拒一切写**。界面无告警行（已授权）。 |
| **无 `.ans`** | 载入器原样回退入参 fallback = **运行期同意**（导入即授权，登记的非-pin 例外）；行为**不变**。 |
| **`.ans` 存在但不可用**（不可读/不可解析/顶层非对象） | 载入器 **fail-closed 未接受**（`kind="ans-invalid"`）、**绝不**回退运行期同意；会话可开但**一切写入被门禁拒**，界面**内联 `sys-config` 如实明示**「不是已授权状态」。 |

> **「可用」的界定**：`.ans` 存在但**不可解析** → 载入器返回**未接受**（fail-closed、**不回退**演示/运行期同意）——一个损坏的 `.ans` 不该换来一份「已接受」。桌面**如实呈现**（见上表末行），**不会**让用户误以为已授权。

### 形状取舍（**回报**，未 fork）—— 载入器 `project.roles` 未被采用

载入器返回 `{project, source}`。其 `project.roles` 在 **`ans-invalid` 分支为空**（fail-closed 产物）；若直接用该 project 开会话，会以「未知角色（未登记在 project.roles）」失败——与桌面左树的枚举角色不一致，且丢失 `builtInRoles`（会话式入口允许清单，须由桌面据 `listProject` 枚举填充）。故桌面**只采纳 `source.acceptance`**，角色表仍取**门禁引擎枚举**（与左树同源，`buildProjectConfig` 既有职责）。此为对本角色对共享组件形状的一处观察：**共享载入器的 `ProjectConfig` 不承载 `builtInRoles`，且 `ans-invalid` 分支 roles 为空**；若未来希望桌面「整体用载入器的 project」，需 pm 在共享层补这两点。**本角色未 fork、未在共享层外另造一份，如实回报。**

### 测试与验证（本角色独立执行）

- **单测**：`node --test test/桌面应用/*.test.ts` → **31 pass / 0 fail**（原 26 + 新增 5）。
  - 新增 `test/桌面应用/ans-wiring.test.ts`（4 例，真实共享载入器 + 真实门禁引擎 + 真实编排 + 真实多轮演示适配器；用**系统临时目录**造 `.ans`，跑完清理，**不在仓库留文件**）：
    ① 有带 pin 的 `.ans` → `config.kind==="ans"`、`accepted`、`pinCount=1`，边界内写入被接受（**pin 生效**）；
    ② pin 与文件 hash **不符** → 会话被拒、错误点明 `SHA-256/pin`（fail-closed）；
    ③ `.ans` **不可解析** → `kind==="ans-invalid"`、`accepted=false`、`acceptanceSource===""`、`reason` 含 fail-closed，**且一切写入被拒**（**不回退**运行期同意）；
    ④ **无 `.ans`** → `kind==="builtin-fallback"`、`accepted=true`、`pinCount=0`、来源含 `desktop-app`，边界内写入仍被接受（**行为不变**）。
  - `renderer.test.ts` +1 例源码不变式守卫：`appendConfigNote` / `sys-config` / 「这不是已授权状态」「不会回退到『导入即授权』」齐全，防回退。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：**退出码 0**、`E2E_DONE=1`，既有检查点**全过**：
  `SU_IS_FIRST=true`、`SU_TREE_BADGE=true`、`SU_CLICKED=true`、`SU_NO_MODAL=true`、`SU_SESSION_STATE=聊天中`、`SU_HAS_WELCOME=true`、`SU_READONLY_BADGE=true`、`SU_READONLY_NOTE=true SU_READONLY_ROWS=1`、`SU_WRITE_MODE_DEMO_*`；
  `NO_MODAL_AFTER_IMPORT/ROLE_CLICK/MESSAGES/RESUME` 全 true；`WRITE_MODE_DEMO_NOTE=true WRITE_MODE_ROWS=1 OLD_GENERAL_CLAIM_PRESENT=false`；`RUNTIME_NOTE_*` 全对。
  **仓库无 `.ans` → 走回退**：`SYS_ROWS` 中**无** `sys-config` 行（符合预期，未破既有界面）。跑完无残留 Electron 进程。
- **全量**：`node --test "test/**/*.test.ts"` → **357 pass / 0 fail（全绿）**。
  （旁注：本轮中途 `test/测试/real-entry.test.ts` 的 govern 用例一度期望退出码 2、实测 1——因 **T5 已把 `govern` 从占位改为真治理会话**、缺 `ANS_PI_BASE_URL` 时 fail-closed 退出 1；该文件随后由**测试角色**更新为「只断言非 0」，全量转全绿。该文件属**测试角色**、根因在**编排/装配**，**均在本角色边界之外、与本改动无关**。）

### 已知边界（不在本角色边界内，登记）

- `test/测试/real-entry.test.ts` 的 govern 用例期望曾滞后于 T5（一度期望占位码 2）；本轮中途由测试角色更新为「只断言非 0」，全量转全绿。与 T13 无关。
- pin **hash 是否相符**由**门禁引擎** `verifyPins` 判（本层只判「有没有 pin」）：故「`.ans` 带 pin 但 hash 不符」在会上**被拒**（会话开启失败、错误点明 pin），界面无 `sys-config` 行——这是引擎的 fail-closed，界面的拒绝内联/错误提示即其如实呈现。

## 2026-10-11 — T10 修正：界面写入语义改为「按运行时如实」（删「V1 桌面：只判不写」）

**来源**：设计 §3.9 **更正**（客户新裁决：**「只判不写」只是 demo 路径的属性，不是整个桌面的属性**）、派发清单 T10。

### 背景：文档与代码不一致，必须消除

上一轮按当时裁定加了「V1 桌面：只判不写」的界面提示，把它当作**整个桌面**的属性。新裁决厘清：

- **demo 路径**（`app/desktop/chat-adapter.ts`，`buildGovernedTools(gate)` **未传 `writeRoot`**）→ 写层 **fail-closed** → **只判定、不落盘**；
- **pi 路径**（界面 runtime 切 `pi`，经编排 `createPiAdapterFactory` → **真实适配器**，`writeRoot = projectRoot`）→ **会真的把文件写进被导入的项目**，但**受门禁约束**（角色边界 Section 1 + acceptance，与 CLI 同一套 `resolveWrite`）。

即：**界面说「不落盘」而 pi 路径会落盘——文档与代码不一致**。本次消除：文案**按运行时如实**，**不再**一概而论。

### 改了什么（均在本角色边界内）

- `app/renderer/renderer.js`：
  - **删除** `appendNoWriteNote()`（其文案「V1 桌面：只判不写——…本版不把任何写入落盘」一概而论）与 `setChatHeader` 副标题里的「· V1 桌面：只判不写（获准也不落盘）」；
  - 新增 `writeModeInfo(runtime)`：按运行时返回文案与样式（**书面唯一来源**，内联与常驻两处共用，杜绝漂移）：
    - **demo**（`sys-nowrite` / 划线图标）：`演示运行时（demo）：写入只经门禁引擎判定并在对话中显示结果，不会落盘——获准的写入也不会写进你导入的项目。`
    - **pi**（`sys-write` / 笔形图标）：`真实运行时（pi）：写入会真正落到你导入的项目，但仍受该角色边界约束——越界写会在写之前被门禁拒绝，不会改动你的项目。`
  - `appendWriteModeNote(runtime)`：会话开启时内联一条，按**该会话实际使用**的运行时（`selectRole` 里先取 `runtime` 再 `openSession`，同一值复用）；
  - `renderRuntimeNote()`：**输入区常驻**写入语义元素 `#runtime-note`，随 `#inp-runtime` 的 `change` 事件**重渲染**（demo↔pi 文案跟着变），初始化时调用一次；
  - `setChatHeader` 副标题改为**运行式中性**：`会话由治理引擎全程把关 · 写入语义随运行时（见输入区）`（不再声称任何写入结果）。
- `app/renderer/index.html`：`.composer-tools` 与 `.composer-row` 之间新增 `<div id="runtime-note" class="runtime-note"></div>`（常驻，始终可见）。
- `app/renderer/styles.css`：新增 `.runtime-note`（信息性细条，纯 CSS；`.is-pi` 态文字用 `--fg` 提一点存在感）、`.sys-write`（pi 内联说明，中性色——**就事陈述，非警示**）；`.sys-nowrite` 注释改为「demo 路径」。
- **措辞准确性**：pi 文案**不写**「pi 会写任何东西」——写仍**受门禁约束**；也**不写**成免责声明。demo 文案明示「**不会落盘**（只判定并显示结果）」。与既有设计语言一致（纯 CSS、无外部依赖、无 emoji、无渐变）。
- **硬约束满足**：文案只述**运行时语义**，界面层**不作任何判定**；判定仍**唯一**来自门禁引擎。渲染进程仍**不读角色数据**做写入语义说明。

### 测试与验证（本角色独立执行）

- **单测**：`node --test test/桌面应用/*.test.ts` → **26 pass / 0 fail**（原 23 + 新增 3）。
  新增 `test/桌面应用/renderer.test.ts`——源码文本不变式守卫（renderer.js 是纯浏览器 IIFE，无法在 node 下 import，DOM 行为由 e2e 覆盖）：钉住 ① demo/pi 两种文案的关键措辞齐全；② 选择器 `change` 挂 `renderRuntimeNote`、`#runtime-note` 元素与样式存在；③ **不得再出现**「V1 桌面：只判不写」。
- **e2e**（真实 Electron 44.7.0，`ANS_E2E_OUTDIR` 指 Windows 临时目录）：**退出码 0**、`E2E_DONE=1`，新增检查点**全真**：
  - 按运行时（会话内联）：`SU_WRITE_MODE_DEMO_ROWS=1`、`SU_WRITE_MODE_DEMO_NOTE=true`；`WRITE_MODE_DEMO_NOTE=true WRITE_MODE_ROWS=1`；
  - 旧文案已消：`OLD_GENERAL_CLAIM_PRESENT=false`；
  - **运行时切换**（只切选择器、**不开启任何会话**——pi 无 provider 配置会 fail-closed，绝不真开 pi 会话）：`RUNTIME_NOTE_DEMO_CLASS=runtime-note` / `IS_PI=false` / `NOWRITE=true` / `SAYS_DEMO=true`；`RUNTIME_NOTE_PI_CLASS=runtime-note is-pi` / `IS_PI=true` / `WRITES_PROJECT=true` / `GATED=true` / `NOT_NOWRITE=true`。
  - 既有 `SU_*`、`NO_MODAL_*`、拒绝内联、续接、右栏资料**全过**（未破）。跑完无残留 Electron 进程。
- 截图 `02-chat.png` 复核：底部运行时选择器旁常驻一行演示说明（`.runtime-note`），文案与图标正确。

### 已知边界（不在本角色边界内，登记）

- pi 路径需 **provider 凭据 + `ANS_PI_CONTEXT_WINDOW`**；客户 `.env` 未设时选 pi 会在建会话时 fail-closed 抛错（`resolvePiProviderConfig`）——故 e2e **只断言「选 pi 时界面显示了正确文案」，不真开 pi 会话**。运行时切换的**写入语义说明**不依赖凭据，照常如实。

## 2026-10-11 — T10：登记运行期同意为例外 + UI 明示「V1 桌面：只判不写」（`.ans` 优先加载被跨角色依赖阻塞）

> **⚠ 本条的「V1 桌面：只判不写」已被同日上一条「T10 修正」取代**——该说法**仅 demo 路径成立**，pi 路径受门禁约束真实写入。下文仅作历史留痕，**现行行为以上一条为准**。

**来源**：设计 §3.3（终态规则与例外）、§3.9（桌面写入能力：V1 裁决只判不写）、派发清单 T10。

### 1) 运行期同意 = §3.3 登记的非-pin 例外（理由写死在代码与文档）

刚裁定的终态规则：**`accepted:true` 必须二选一——(a) pin-backed 或 (b) 登记在案的非-pin 例外，没有第三档**。当前登记的例外**仅两个**：① 桌面应用的**运行期同意**（本角色）；② CLI 演示内嵌配置 `DEMO_ACCEPTANCE`（归装配，见 `src/index.ts`）。

桌面的 acceptance 是 `{accepted:true, source:"desktop-app:导入项目即授权…（原型，无客户 pin，已知偏离）"}`——**没有 pin**。它在规则下**合法**，但必须把「它是登记例外、以及为什么」写死。理由已写入：
- `app/desktop/session.ts`（acceptance 构造处，逐条展开）；
- `app/desktop/project.ts`（`buildProjectConfig` 的 acceptance 注释）。

**理由（要点）**：pin 的语义是对**预先钉住的产物**做**篡改检测**（先固定一个 hash，日后比对是否被改动）。桌面的信任模型是**运行期实时人授权**——客户已定「导入项目 = 授权、无弹窗」，授权由**人在导入这一刻当场作出**，不存在「先于授权而存在的固定产物」可供比对。给一个当场作出的授权硬加 hash 是**假证据**：它既不表达「谁在何时授权了什么」，也检测不到任何篡改。故它是**结构上不同于 pin 的授权来源**，**不是「忘了加 pin」**；伪造一个 pin 反而更坏（把假证据当真证据）。

### 2) 「项目带 `.ans` 时优先加载它」——**未实现：被跨角色依赖阻塞**（如实登记）

裁定要求：项目有 `.ans/project.json` 时**优先用它（pin 生效）**，**仅无 `.ans`** 才回退运行期同意；现状桌面无条件用运行期同意 = 对带 `.ans` 的项目**等价于绕过其 pin**，是已知偏离。

**为何本角色无法自行实现**（未硬写第二份、未复制一份）：
- `.ans` 的载入 + 终态规则（`loadEffectiveConfig()` / `enforcePinBackedAcceptance()`）归**装配的私有 `common/装配/config-loader.ts`**；
- 工程法案 `project-rules.md` **§6 明令不得导入其他角色的私有 `common/`**；跨角色共享须经**项目管理**的 `common/shared/`（唯一写入者 pm），而该处**尚无可复用入口**（`src/common/shared/` 目前不存在）；
- 在渲染/Interface 侧**另写一份加载器或终态规则**正是本项目**明令禁止的「第二份实现」**（硬约束：不得出现第二份实现）。故本角色**不写第二份**——如实登记被阻塞。

**建议形状（请项目管理协调）**——把该能力经**法定跨角色通道**提出，保持**单一实现**：
1. **pm** 在 `src/common/shared/` 新建共享模块（如 `src/common/shared/ans-config.ts`），承载 `.ans` 载入 + 终态规则（**逻辑整体搬迁，不 fork**）；
2. **装配**改为从共享模块导入（其 `config-loader.ts` 变成薄转发或直接删除），于是仍只有**一份**实现；
3. **桌面应用**从该共享模块导入，在 `app/desktop/session.ts` 打开会话时：**`.ans/project.json` 存在且可用 → 用其 pin-backed acceptance**；**否则**回退运行期同意。
- 替代方案（若倾向由属主直接暴露）：装配把 `loadEffectiveConfig` 从**公共入口**导出——但装配非私有路径只有 `src/index.ts`（CLI 根入口），跨角色导入他人根入口并不可取，且会拖入 CLI 接线；故 `common/shared/` 路线更合规、更清。
- **需要他人动作**：pm（共享模块属主）与装配（去重）。二者均在**本角色边界之外**，本角色**不动手、不复制**。

### 3) UI 明示「V1 桌面：只判不写」

设计 §3.9 裁决：V1 桌面**能聊天、能在聊天流内联显示拒绝，但任何获准写入都不落盘**（`app/desktop/chat-adapter.ts` 不传 `writeRoot`，Pi 适配器 T3 把「未配置 writeRoot」定为 fail-closed「只判定、不落盘」）。这是**有意的**，不是坏掉的——故界面**必须明示**，否则用户会以为改成功了其实没写。

提示放在与 su「本版只读」一致的位置（会话头副标题 + 聊天流内联系统行）：
- `app/renderer/renderer.js` `setChatHeader`：会话头副标题改为 `会话由治理引擎全程把关 · V1 桌面：只判不写（获准也不落盘）`（持久可见）；
- `app/renderer/renderer.js` 新增 `appendNoWriteNote()`：**点开任一角色会话**时于聊天流内联一条 `sys-nowrite` 系统说明，文案：
  `V1 桌面：只判不写——写入会经门禁引擎判定并在对话中显示结果，但本版不把任何写入落盘（获准的写入也不会写进你的项目）。`
- `app/renderer/styles.css` 新增 `.sys-nowrite`（主色，信息性；与只读的警示色 `--warn` 区分）。
- **硬约束满足**：该说明对**全桌面**成立（非按角色），渲染进程**不读任何角色数据**即可显示，**无第二份边界判定**。既有 su「本版只读」内联说明保留（只读角色额外追加，两者并存）。

### 4) 验证（本角色独立执行）

- `node --test test/桌面应用/*.test.ts` → **23 pass / 0 fail**（原 22 + 新增 1：`session.test.ts`「运行期同意：登记的非-pin 例外——accepted:true 且不带 pin，来源如实标注（行为不变）」）。
- e2e（真实 Electron 44.7.0）：新增检查点 `SU_NOWRITE_ROWS=1`、`NOWRITE_NOTE=true NOWRITE_ROWS=1 CHAT_SUB_HAS_NOWRITE=true`（均为真）；
  既有 `SU_*`（`SU_IS_FIRST`/`SU_TREE_BADGE`/`SU_CLICKED`/`SU_NO_MODAL`/`SU_HAS_WELCOME`/`SU_READONLY_BADGE`/`SU_READONLY_NOTE` 全 true，`SU_SESSION_STATE=聊天中`）、
  `NO_MODAL_*` 全过；可写的项目角色 `DESKTOP_ROLE_READONLY_BADGE=false`、`DESKTOP_ROLE_READONLY_ROWS=0`（未被误标只读，未破）。

### 5) 附带观察（不在 T10 范围，如实登记）

- 桌面 `pi` 运行时路径：`createPiAdapterFactory(project)`（编排）→ 真实 Pi 适配器，其**恒以 `writeRoot = projectRoot` 调 `buildGovernedTools`**（`src/common/pi-adapter/real-adapter.ts`）——即选 **pi** 运行时**会真正落盘**，与「V1 桌面只判不写」相左。当前桌面未注入 provider 配置（无 `ANS_PI_BASE_URL`/`ANS_PI_MODEL`/`ANS_PI_CONTEXT_WINDOW`），选 pi 会在建会话时 fail-closed 抛错（`resolvePiProviderConfig`），故**实践上不可达**；但该收窄点在 `src/**`（编排 / Pi适配器），属**本角色边界之外**，**不越界改**，在此登记以提请协调。


## 2026-10-11 — su（内置治理角色）本版只读的界面明示

**背景**：su 的聊天通道已修复可用（`openRoleSession` 现接受 `project.builtInRoles` 声明的内置角色）。但 su 走内置边界，`acceptance.accepted === false`，门禁引擎 `resolveWrite` 的 F6 会拒其一切写入——界面此前无任何提示，用户点开 su 会以为能让它创建角色/改东西，却每次写入被拒，像坏了。本改动在界面明示「本版只读」。

**改了什么**
- `app/desktop/interface.ts`：`RoleView` 增 `readOnly: boolean`；新增纯函数 `isReadOnlyRole(role)`，`listProject` 据此派生。
  判据 = `role.builtIn === true && role.boundary.acceptance.accepted === false`（**读门禁引擎给出的角色数据，不另写边界/路径判定；不硬编码 `"su"` 或任何角色名**）。
- `app/renderer/renderer.js`：左树对 `role.readOnly` 角色渲染 `只读` 徽标（`.ti-badge.readonly`，紧邻既有「内置」徽标）；
  新增 `appendReadonlyNote`，点开只读角色会话成功后在聊天流内联一条 `sys-readonly` 系统说明。渲染进程只读 `role.readOnly` 布尔，**无第二份判定**。
- `app/renderer/styles.css`：新增 `--warn-line` 令牌、`.ti-badge.readonly`（警示色，与主色「内置」徽标区分）、`.sys-readonly`（警示色居中细条）。
- `test/桌面应用/interface.test.ts`：+3 用例（`isReadOnlyRole` 数据驱动、未接受的内置角色带标记/已接受的不带、可写的项目角色不得误标）。
- `test/桌面应用/e2e/main.mjs`：+2 个检查点组（`SU_READONLY_*`、`DESKTOP_ROLE_READONLY_*`）。

**判据为何必须结合 `builtIn`（关键决定）**
- `listProject` 对**所有**角色所列的 acceptance 都是未接受（其注释明示「仅用于展示」——枚举无接受证据入参）。
  若单看 `acceptance.accepted === false`，会把**可写的项目角色**一并误标为只读。
- 角色实际跑在哪个 acceptance 由 `resolveBoundarySection` 决定：项目角色在「导入即授权」下解析出 `accepted:true`（可写）；
  内置角色无项目边界覆盖，恒落到 `builtInBoundarySection()`（`accepted:false`）→ 故只读 ⟺ 内置且未接受。

**措辞（准确性）**
- 内联说明：「本版只读：该角色按当前 acceptance 工作，门禁引擎会拒绝它的一切写入——可以对话，但不能由它写盘。」
  如实把「拒写」归**门禁引擎**（F6 接受门），不写成「本会话不能发起写入」——界面不承担判定职责。

**验证（本角色独立执行）**
- `node --test test/桌面应用/*.test.ts` → **22 pass / 0 fail**（原 19 + 新增 3）。
- e2e（真实 Electron 44.7.0）：`SU_READONLY_BADGE=true`、`SU_READONLY_NOTE=true`（`SU_READONLY_ROWS=1`）；
  可写的桌面应用角色 `DESKTOP_ROLE_READONLY_BADGE=false`、`DESKTOP_ROLE_READONLY_ROWS=0`；
  既有 `SU_*`（`SU_IS_FIRST`/`SU_TREE_BADGE`/`SU_CLICKED`/`SU_NO_MODAL` 全 true，`SU_SESSION_STATE=聊天中`、`SU_HAS_WELCOME=true`）与
  `NO_MODAL_*`（导入/点角色/发消息/续接）**全过**；聊天本体、拒绝内联、续接、右栏资料均正常。

## 2026-10-11 — su（内置治理角色）补入左树 —— 复核未通过：点 su 无法开启聊天

**来源**：本改动由**顶层会话越界**直接写入本角色边界内 7 个文件（未走本角色）；客户判定流程不对，决定「代码保留、由本角色复核并补记录」。以下为本角色独立复核与独立验证。

**改了什么（复核所见）**
- `app/desktop/project.ts`：`buildProjectConfig` 对 `r.builtIn` 角色 `continue`，不登记进 `roles`（su 无角色目录；登记会使 `resolveRole` 去读空 `cardPath` → 报错）。
- `app/desktop/interface.ts`：`RoleView` 增 `builtIn: boolean`；`listProject` 在 `readRoleDocsIndex` 前加守卫 `if (!r.builtIn && r.cardPath !== "")`（否则内置角色会把**项目根**当角色目录递归 walk，`docs` 会污染成整个仓库）。
- `app/renderer/renderer.js` / `styles.css`：新增 `ICONS.shield`、树条目 `builtin` class 与 `.ti-badge`「内置」徽标、`roleSubtitle` 对内置角色返回「内置治理角色 · 由 SKILL.md 定义」。
- 测试：`project.test.ts` +2 用例、`interface.test.ts` +1 用例、`e2e/main.mjs` +步骤 1b。

**复核结论：不通过（反对「点 su 能开聊天」这一表述）。**
- 通过——界面呈现正确：su 排在左树第一，shield 图标 +「内置」徽标 + 副标题无误。
- 通过——**硬约束满足**：渲染进程**没有**出现第二份边界判定；`renderer.js` 仅读 `role.builtIn` 决定图标/徽标/文案，一切判定仍调门禁引擎。
- **不通过——核心缺陷：点击 su 无法开启聊天。** 链路：`SessionManager.open` 用 `listing.roles.find` 找到 su → `buildProjectConfig` 不登记 su → `openRoleSession` → `setupRole`（`src/pipeline/orchestration/run-role.ts`）对**未登记在 `project.roles`** 的角色一律以 `EXIT_USAGE` 拒绝 → 界面报「会话开启失败：未知角色：su（未登记在 project.roles）」，会话状态「连接失败」。
- 修复点位于 `src/**`（**本角色边界外**）：须让 `openRoleSession`（聊天路径）接受内置治理角色（`built-in-governance`），或另设「不登记却可寻址」的路径。**本角色不越界改，已回报。**

**验证（本角色独立执行）**
- `node --test test/桌面应用/*.test.ts` → **19 pass / 0 fail**。
- e2e（真实 Electron 44.7.0）：`SU_IS_FIRST=true`、`SU_TREE_BADGE=true`、`SU_CLICKED=true`、`SU_NO_MODAL=true`、**`SU_HAS_WELCOME=false`**、**`SU_SESSION_STATE=连接失败`**；既有 `NO_MODAL_*`（导入 / 点角色 / 发消息 / 续接）**全过**；桌面应用角色聊天本身正常（2 条用户气泡、2 处拒绝内联、续接提示、右栏四组资料）。

**遗留问题与界面方案（2026-10-13 更正：已过时，按现状一句话带过）**
- 当时评估的「本版只读」界面提示方案**未实施且已过时**——创世/项目治理边界接线后 su **可写治理产物**、**只读 shell 已落地**（2026-10-12）、「只读」徽标/内联已按客户裁定移除（回到「用户对边界无感」模型）。按现状：界面无只读标记，拒写如实内联在聊天流（由门禁承担）。

## 2026-10-11 — 导入即授权：点角色直接聊天（无确认框）；界面专业化重做

客户最终定稿（覆盖上一轮「每会话一次确认」）：**导入项目 = 授权；左树点一个角色 → 中栏立即进入聊天，全程无确认框**。
用户对 writeSet/边界清单/acceptance 来源**无感**（边界是项目管理管的事）；门禁照常在后台拦每一次写入。

- **删除两段式确认**：`SessionRequest`/`DispatchSummary`/`StartResult`/nonce/`request`/`start` 全部移除；
  `SessionManager` 新语义为 `open`（一次调用直接建会话）——同角色重复点击 = **续接**（返回 `note`，不重建）；
  切换角色 = 先 `dispose()` 旧会话再开。
- **IPC**：`session:request`/`session:start` 合并为 **`session:open`**（`{projectRoot, roleId, runtime}` → `OpenResult`）；
  `session:send` 不变（可反复调用）；`session:stop`、`session:event` 不变。preload/main/interface 同步。
- **acceptance**：`{ accepted: true, source: "desktop-app:导入项目即授权该角色按其完整边界工作（原型，无客户 pin，已知偏离）" }`，
  如实标注偏离；`scope` 仍传 `undefined`（上界 = 角色边界，判定唯一来自门禁引擎）。
- **denied 内联**：拒绝事件渲染为聊天流中的内联系统消息（柔红色调、可展开看按根分组的允许路径），
  不再是任何弹窗/手续。
- **界面专业化重做**（纯 CSS，无外部依赖/构建）：柔和深色三栏（Linear/VS Code 质感）、CSS 变量令牌
  （一个主色 + 语义色，4/8px 栅格）、左树内联 SVG 图标 + hover/选中态 + 角色副标题、
  中栏真聊天气泡（用户右/助手左、系统事件居中细条、denied 可展开、输入框固定底部带聚焦态与自动增高）、
  右栏手风琴分组（角色卡/边界条目斑马纹表/变更记录/文档）、系统字体栈 13–14px、行高 1.6、过渡 120ms。
- **测试**：单测重写为 16 个用例（点角色即开/多轮累积/续接/切换 dispose/未枚举失败等），全绿；
  e2e 驱动真实 Electron：导入 → 点角色直接进聊天（4 处 `NO_MODAL` 检查点全过）→ 两条消息都生效 →
  越界被拒且内联展开 → 续接提示 → 右栏四组资料，4 张截图。
- **文档**：设计稿 §5.2/§5.3/§5.4/§6/§8/§9 按定稿更新（§5.3 演进记录留痕）。

## 2026-10-11 — 中栏改为真聊天（多轮），确认框去掉范围

客户反馈：聊天不该先要求声明 writeSet。据此改动：

- **确认模型**：「开一个角色聊天 = 一次确认」，确认框**去掉 writeSet 行**；保留并显示
  角色、边界来源、acceptance（含 source）、运行时，并**明示**「该角色按**完整边界**工作」+ 列出边界条目。
  确认一次性、对该会话有效；**之后每条消息不再弹框**。
- **多轮聊天**：会话改经编排新冻结接口 `openRoleSession` 建立（**只建一次**），`session:send` 可反复调用，
  事件跨轮持续刷出；切换角色/关窗 `dispose`。`scope` 传 `undefined`（聊天无任务收窄）。
- **新增文件** `app/desktop/chat-adapter.ts`（多轮演示运行时；`createFakeRuntimeAdapter` 单轮即关队列，不适用）。
- **IPC**：`session:request` 摘要去掉 writeSet；新增 `session:send`；`session:stop` 改为关闭会话。
- **渲染**：中栏输入改为消息框（多轮），运行时可选、"确认时接受边界"勾选项保留。

### 仍成立

- 判定仍由门禁引擎负责：越界写入照样在**写入之前**被拦（含按根分组的允许路径）。
- acceptance 来源在无客户 pin 下如实标注（确认框可见）；不勾选则 fail-closed。

## 2026-10-11 — 三栏桌面应用首版落地

- **新增** `app/main.ts`（Electron 主进程入口）、`app/preload.cjs`（受限 IPC 桥）、
  `app/desktop/{interface,session,project}.ts`（桌面 Interface）、
  `app/renderer/{index.html,styles.css,renderer.js}`（三栏视图）。
- **新增** `test/桌面应用/{project,session,interface}.test.ts`（13 个用例）与
  `test/桌面应用/e2e/main.mjs`（端到端自检）。
- **左栏**：系统文件夹选择器导入项目 → 经门禁引擎 `listProject` 枚举角色并成树。
- **右栏**：角色卡正文、Section 1 边界条目表（根/kind/path/purpose/condition）、
  变更记录索引、`docs/` 目录索引。
- **中栏**：对角色发起受治理会话；`tool_call` / `denied` / `accepted` / `settled` 事件实时刷出。
- **会话授权**：先请求摘要（含项目/角色/任务 id/writeSet/边界来源含 acceptance.source/运行时）→
  界面展示 → 用户确认 → 才启动；nonce 一次性、只对该次派发生效。

### 决定与偏离

- **Electron/TS**：实测 Electron 44.7.0 自带 Node 24.21.0，GUI 主进程可直接 import `.ts`（原生类型擦除），
  **不引入构建步骤**；preload 以 CJS（`app/preload.cjs`）承载。
- **acceptance 来源**：原型无客户 pin，确认框如实标注派发期确认来源；不勾选则 fail-closed。
- **会话单回合**：遵循冻结 `runRole` 单次 prompt 语义，中栏「发送」= 一次派发，非多轮对话。
- **`package.json`**（electron 依赖、`main`、`app` 脚本）属装配角色，本角色未改动。

### 修复

- **事件时序**：结束摘要原由渲染侧在 `start()` 返回后追加，会因 IPC send 与 invoke 回复乱序而抢先渲染；
  改为经 `session:event` 同一通道最后发出，保证在事件流之后有序到达。

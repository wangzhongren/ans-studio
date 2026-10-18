# 桌面窗口 API 规格

实现契约 **ANS-RUNTIME-V2 revision 1 / D1 + D1R + D1R2**。主进程 `app/main.ts`、受限桥 `app/preload.cjs`、纯逻辑 `app/desktop/`。当前行为见[功能说明](docs/feature/multi-runtime-desktop.md)，证据见[实施记录](docs/change/2026-10-14_change_multi-runtime-window.md)。窗口不调用 SDK；生产创建与历史经编排公开入口，工具与存储归核心。Model 类型入口为 `src/model/runtime.ts`。

## 运行时与设置

`RuntimeKind=demo|pi|codex|claude`。设置字段/必填/秘密/help/fallbackKeys 单一来源为共享 `RUNTIME_SETTINGS`，窗口不维护第二份。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getRuntimeConfig(runtime) | runtime-config:get `{runtime}` | RuntimeConfigView |
| saveRuntimeConfig(input) | runtime-config:save `{runtime,updates}` | RuntimeConfigSaveResult |
| getPiConfig() | pi-config:get | 兼容 path/fields；实际新视图可含附加字段 |
| savePiConfig(updates) | pi-config:save `{updates}` | 兼容 ok/appliedKeys/error；遵守 busy Pi 安全应用点 |

`RuntimeConfigView={runtime,label,path,fields,missingKeys,revision,application}`。field 含共享 metadata 及 `{value,isSet,source,fallbackKey?}`，source 为 file/environment/fallback/default/unset。所有共享 secret 键 value 恒空串；fallbackKey 只键名；URL 中的 userinfo 不回显。空白必填值为 unset，缺 key fallback 仅按适配器真实约定。

`RuntimeConfigSaveResult={ok,runtime,appliedKeys,revision,application,error?}`。updates 仅采纳所选引擎白名单字符串；非字符串拒绝；URL 须为不含 userinfo 的 http/https。共享 `saveEnvFile` 逐行保留其他键并原子覆盖；错误不含提交值。成功且写键非空才 revision+1。application 为 current/next-session/after-active-turn；保存本身不证明引擎/账号可连接。

**封闭值域与整数约束（共享元数据，2026-10-17）**：`saveRuntimeConfig` 的 `choices` 分支——校验仍以 raw `choices` 值为准；非法值的可接受值改用 `choiceLabels`（**仅当与 `choices` 等长**；Pi 档位显示「32k / 64k / 128k / 256k / 500k / 1M」「1 分钟 / 2 分钟 / 5 分钟 / …」），无标签或长度不匹配时回退 raw `choices`（行为不变）；文案仍 `` `${field.label}取值无效：仅接受 ${labels.join(" / ")}（或留空维持平台默认）。` ``，**不回显提交值**、不落盘。`integer` 分支保留给**无 choices** 的整数自由输入字段：trim 后空＝清除；否则 `/^\d+$/`＋`Number.isSafeInteger`＋`[min,max]`；非法 ⇒ `ok:false`、错误 `` `${label}必须是${min !== undefined ? ` ≥ ${min} 的` : ""}正整数。` ``、不落盘。现行 Pi：`ANS_PI_CONTEXT_WINDOW` 与 `ANS_PI_PROMPT_TIMEOUT_MS` 均已带 `choices`＋`choiceLabels`＋`control:"range"`＋`integer`（走 choices 分支；空串＝系统默认档）。URL/其他字段行为不变；`getRuntimeConfig` 原样透传 `choices/choiceLabels/control/integer` 元数据（控件属桌面UI）。旧面板白名单 `PI_PANEL_KEYS`（`app/desktop/pi-config.ts`，兼容路径）与 `RUNTIME_SETTINGS.pi` **逐键对齐**：2026-10-17 起为 6 键（新增 `ANS_PI_PROMPT_TIMEOUT_MS`），漂移守卫在 `test/桌面应用/pi-config.test.ts` 强制显式评审。

Pi 保存不重载忙轮次凭据；下一输入或重开在所有旧 Pi 轮次空闲后应用所选字段并重建。各项目等待此安全点的 Pi 队列会被最后一个旧轮次结束唤醒。旧单独 `pi-config.ts` 函数仍兼容既有调用；生产 IPC 使用上述新逻辑。

## 会话、历史与状态

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| openSession(input) | session:open `{projectRoot,roleId,runtime}` | OpenResult |
| sendSession(text,images?,target?,metadata?) | session:send `{text,images,target?,metadata?}`，target 为三元身份 | SendResult |
| stopSession(target?) | session:stop，旧 roleId/null 或 `{projectRoot,roleId,runtime}` | StopResult |
| abortSession(target) | session:abort，旧 roleId 或三元对象 | RoleSessionAbortResult |
| withdrawQueued(target,id) | session:withdraw，旧 roleId 或三元对象加 id | WithdrawResult |
| listLiveSessions() | session:live | 兼容唯一 roleId[] |
| listLiveSessionViews() | session:live-views | `{projectRoot,roleId,runtime,profileRevision}[]` |
| getSessionHistory(input) | session:history-get 三元身份 | SessionHistoryView |

`OpenResult` 延续 ok/error/note/config/resumed/contextSource/contextWarning，并增 runtime/projectRoot/profileRevision。缓存与重建链使用项目×角色×runtime；每活句柄保存其创建 profile revision。旧字符串目标优先活动同名句柄；不存在且多实例时拒绝模糊目标，三元对象精确寻址。新 UI 应总传三元对象。

桌面 `resumed` 表示活句柄复用；核心 native resumed → 桌面 recovered（真实已恢复）；核心 native recovered → 桌面 fresh + warning（恢复失败后重建）。未确认时不从索引或文件推断恢复成功。状态在轮次后重新读取 handle 动态 getters。

`SessionHistoryView={projectRoot,roleId,runtime,rows,error,skipped}`。rows 的旧 ReplayRow 四种 kind 保留，新增可选顶层 turnId/eventKind：user 只取 entry.turnId且无eventKind；event取 entry.turnId ?? event.turnId 与原 event.kind。工具 activity.turnId 使用相同有效ID，交互 anchorKey/requestId/anchor 保留。mapper 逐事件保留原次序和delta片段，不压缩不同turn的同文；旧Pi缺字段时不推造 metadata。ANS 回放由 Pipeline `readRoleSessionHistory` 提供。只有 Pi 无 ANS 行时读取旧角色目录 JSONL 作展示 fallback；不用于模型恢复证明。

| 订阅 | 主→渲通道与 payload |
| --- | --- |
| onSessionEvent(cb) | session:event 单信封 / session:events 同序信封数组；`{projectRoot,roleId,runtime,event,clientMessageId?}` |
| onRoleState(cb) | session:role-state；`{projectRoot,roleId,runtime,profileRevision,contextSource?,contextWarning?,busy,summaries,queue,running}` |
| onSessionHistory(cb) | session:history，SessionHistoryView |
| onProjectChanged(cb) | project:changed，既有可能变更信号 |

queue/running 延续 kind/sourceRoleId/summary/at/id/full 并增加 runtime。状态去抖按 projectRoot/roleId/runtime 合并。停止/释放不删除未投的待办；投递失败恢复队首并保留新到消息。派发和回交固定 source 引擎，不依当前选择。

## 确认与取消

`onOperatorRequest` / session:operator-request：`{id,roleId,projectRoot?,runtime?,request,anchorKey,mirrorRoleId?}`。`operatorRespond({id,decision})` / session:operator-response 延续 confirm/choice 请求快照校验；非法决定可重试，旧 id 返回 expired。

**治理下一步 / 应用自动推进（2026-10-18 客户修正）**：客户反馈「这个不是应该自动的转发人物给后续流程吗」——提案接受后不能只显示「请切换到 nominator」。客户决定**成功结算**（`answered`）后：

1. `customer-input.ts` 按 `request.cardKind` + 客户实际选择推导并回调 `onNextStep(payload, context)`（取消/拒绝/expired **不回调**；2026-10-18 真机修正后）：`proposal`+`accept` → `{nextFunction:"schedule", roleId:"convener", followUp:"nomination-after-flow"}`（**先由 Convener 写流程单，落盘后才派 Nominator**）；`proposal`+`accept-quick` → `{nextFunction:"schedule", roleId:"convener"}`（写流程并排步骤，无提名）；`appointment` → `{nextFunction:"schedule", roleId:"convener"}`（排程，既有逻辑不变）；`proposal`+`revise|reject`、`acceptance`、`write`/`appointment-write`/`schedule-write` → `nextFunction/roleId` 均为 `null`（明确无下一步）。推导/文案纯逻辑在 `app/desktop/governance-advance.ts`（`deriveGovernanceNextStep` / `buildGovernanceAdvanceMessage` / `governanceFlowPath`）。
2. 主进程推契约事件 **`governance:next-step`**（主→渲）：`{version:1, flowId?, cardKind, nextFunction:"nomination"|"schedule"|null, roleId:"nominator"|"convener"|null, proposalPath?, followUp?:"nomination-after-flow"}`。**仅供 UI 显示状态行**——UI **不再**据此打开/切换会话。preload：`onGovernanceNextStep(cb)`（返回取消订阅）。
3. 应用在**后台**打开目标治理角色会话并投递任务（`DesktopInterface.advanceGovernanceFlow` → `SessionManager.openBackground` + `sendBackground`）：**不抢 `activeRoleId`、不切当前 pane**、不自动批准/写盘。目标忙时走既有投递队列（`queued:true`）。成功/失败都经既有 `delivery-note` 系统行落**发起卡片角色**的聊天流（失败：「自动推进失败：…」/「自动推进停住：…」）。**投递成功后**写账本 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"customer-decision", flowId?, stepId?, targetRoleId, messageSummary≤200, runtime}`（仅 trio；`stepId` 只取卡片/上下文**显式给出**的值——缺席不伪造、只记诊断 `advance.ledger.step-missing`；**不写 `customerDecision`/`decisionEvidence`**；失败不写；账本不可写只记诊断，不翻转投递、不重试）。任务文案：
   - `proposal accept` 第一段 → Convener：`流程 <flowId>：客户已接受提案 <proposalPath 或 docs/proposals/<flowId>-v1.md>。请先写流程单 docs/flows/<flowId>.md（步骤表；首个步骤为提名：由 Nominator 读取提案并给出候选角色）。写完后本轮即可结束；提名任务会在流程单落盘后由应用派给 Nominator。不要把步骤说成已派发。`
   - `accept` 第二段（`followUp` 链）：Convener 本轮**真正空闲**（`waitForRoleIdle`：busy=false 且该角色投递队列为空）后检查 `docs/flows/<flowId>.md`；**存在** ⇒ 后台开 Nominator 并投递 `流程 <flowId>：客户已接受提案 <proposalPath>；流程单已落盘于 docs/flows/<flowId>.md。请按流程单的首个提名步骤执行：读取提案与流程单，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。`（系统行「流程单已落盘，已派发提名任务给 Nominator（工作中）」；第二段派发同样记一条 `dispatch.accepted(app, targetRoleId:"nominator")`，无 stepId）；**缺失/等待超时** ⇒ 系统行「自动推进停住：Convener 未写出流程单 …；未派发提名任务」、`{ok:false, dispatched:true}`，**不循环重试**。
   - `accept-quick` → Convener：`流程 <flowId>：客户已接受提案（快捷路径）。请写流程单 docs/flows/<flowId>.md 并排步骤（无提名）；涉及新建/改边界仍须任命卡与写盘确认。`
   - `appointment` → **先查角色是否已写出**（刷新后 `listingCache` 里 `targetRoleIds` 是否都存在）：都存在 ⇒ Convener（`流程 <flowId>：客户已完成任命 <targetRoleIds>。请写流程单并派发已批准步骤。`）；**任一缺失** ⇒ **不派 Convener**，改派 Nominator：`流程 <flowId>：客户已完成任命 <targetRoleIds>，但角色卡/边界尚未写出（项目中尚未枚举到这些角色）。请用 appointment-write 确认卡逐路径完成写卡与边界写入；写完后本轮结束，不要自行任命、不要派发。`；Nominator 本轮真正空闲（`waitForRoleIdle`）后重新 `refreshListingNow`：角色出现 ⇒ 再派 Convener（第二段同样记 `dispatch.accepted(app, targetRoleId:"convener")`，stepId 只取显式值）；仍未出现/等待超时 ⇒ 系统行「自动推进停住：…」、`{ok:false, dispatched:true, targetRoleId:"nominator"}`，**不循环**。
4. 失败（目标角色缺失/会话打不开/发送失败/缺 flowId 或任命名单/流程单未落盘/任命角色未写出）**不阻塞当前会话**：诊断 + 系统行，**不重试循环**。`flowId` 缺失或 `nextFunction:null` 时不派发。single/su 旧项目行为不变（无 `cardKind` 的旧卡不产生事件）。

**收尾推进（2026-10-18 真机缺口：流程完成后自动派验收）**：项目角色回交送达 Convener、且 Convener 本轮 `settled` 后，`SessionManager` 经 `deps.onHandbackSettled({projectRoot,runtime,roleId,flowId,evidence})` 上报（flowId 由该回交来源轮的 `dispatch` 条目继承；缺失/多流程不猜、不推进；空 turnId 的 legacyTerminal settled 用 `origin ?? origins.running` 定格）。Interface 仅在 trio 下检查：`docs/flows/<flowId>.md` 的步骤表（所有行 `status=done`）、账本（可读、每步有 `dispatch.accepted{flowId,stepId}`、无 `unclassified/none/undefined` 决定、尚无 `decisionKind:"acceptance"`）——任一不满足 ⇒ 只记诊断、**不派**（保持现状，后续回交可再检查，不是循环）。全部满足 ⇒ 后台开 Rapporteur 并投递**唯一一条**任务（`buildAcceptanceTaskMessage`：流程单 + 回交/核对报告路径 ≤10 条；要求汇总证据并出验收卡、不自行验收），系统行「流程 <flowId> 步骤已全部完成，已派发验收汇总任务给 Rapporteur（工作中）」；**每 flow 只派一次**（运行期 Set），失败如实系统行、不循环重试。**不自动验收、不代批、不写账本**——验收卡仍走 decision 开关/判断 agent 或客户手批。`parseFlowStepStatuses`/`flowCompletionIssue` 是**触发门**，最终验收机械门槛仍由编排 driver 判定。

**一项目一卡（三权 §6.1 硬约束 / §九-10，2026-10-17）**：`createCustomerInputChannel` 按 `projectRoot` 串行——同项目同一时刻只呈现一张待客户决定卡；后续请求**入队、不调用 presenter**（`queuedCount()` 可见），状态经 `onQueued(payload, waitingFor)` 外推，主进程推 `session:operator-queued`（载荷 `{...OperatorRequestPayload, waitingFor}`，preload `onOperatorQueued(cb)`）让 UI 显示「等待前一个决定」。第一张 resolve/取消/超时/会话失效后按到达序呈现下一张；排队项随 `signal` 中止出队（`unavailable`）、`rejectAllPending`/窗关时与活动卡一并 `declined` 清空（fail-closed）。**不自动合并、不自动批准**；排队中的 id 不可作答（`expired:true`）。`pendingCount()`/`pendingRoles()` **同时计入已呈现与排队中的请求**（排队中的角色同样在「正确等待客户」，看护 #1 不误报）；`queuedCount()` 单列排队数；`replayPending()` 重推已呈现卡与排队状态行（不呈现排队卡）。适用范围＝本通道全部请求：仅内置治理角色（trio 三人与 su）会注入该通道，项目角色从不经过；single/su 语义不变（仅有并发卡时串行化）。

**四角色 W6-B（2026-10-18；评审 `2026-10-18_design_governance-liaison-review.md` §5.3/§5.4/§6.1/§7.2）**：

- **能力路由**（`SessionManager.open`，按 `governanceFunction`，不硬编码 id）：`liaison` 只注入 `handOffIntent`（**不注入 `customerInput`**——Liaison 只用聊天，`request_confirmation`/`request_choice` 结构性不存在）；`proposal`（Rapporteur）注入 `customerInput` + `requestClarification`；`nomination`（Nominator）安装能力不变；`schedule`（Convener）派发/看护/恢复/只读 shell 不变；single/su 旧能力集逐字不变（两新能力不注入）。`SessionManagerDeps.openRoleSession` 入参新增 `handOffIntent`/`requestClarification`，原样透传编排。
- **意图交接投递端**（`deliverIntentHandoff`）：编排已完成意图文件/去重/每轮一次校验并写 `intent.handed-off`（**编排唯一写入者；桌面不重复写**）；桌面在收到成功派发的载荷后**后台**打开 Rapporteur（`openBackground`，同引擎）→ `sendBackground` **唯一一条**任务（模板 `buildIntentHandoffMessage`：引用 `docs/intents/<intentId>.md`、声明「意图记录不是客户批准」、要求用提案卡/澄清，附 `summary`）→ 成功系统行「已交给报告员（工作中）」/「报告员工作中，已排队」；**投递成功后**写账本 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"intent-handoff", targetRoleId:"rapporteur", intentId, flowId?, messageSummary≤200, runtime}`（失败不写、账本不可写只记诊断，均不重试）。失败系统行「应用无法把意图交给报告员：<原因>；未重试」并回执 `{ok:false}`。**不抢 `activeRoleId`/不切 pane、不重试、不自动批准**。
- **澄清送达端**（`deliverClarification`）：编排已判两轮上限并写 `clarification.requested`；桌面只在主入口（`primaryRoleId`，trio=liaison）落系统行「报告员需要澄清：<question>」。**不弹决定卡、不占「一项目一卡」队列、不改权力/写权**；客户在 Liaison 回答后由 Liaison `hand_off_intent{handoffKind:"clarification"}` 再交接。
- **决定卡镜像**（`OperatorRequestPayload.mirrorRoleId?` + `governance-advance.ts::isMirroredGovernanceCard`）：仅 `governanceModel === "trio"`、卡片种类为 `proposal`/`appointment`/`appointment-write`/`schedule-write`/`acceptance`/`write`、且来源角色 ≠ `primaryRoleId` 时给出主入口 id；无 `cardKind`/single 不镜像。**2026-10-18 真机反馈**：报告员的写入确认卡（`write`）必须能在联络官作答，故 `write` 纳入镜像——本条**覆盖**评审 §6.1 原表「write 不镜像」；仍仅 trio 治理角色会走该通道（项目角色从不注入 `customerInput`）。**同一请求 id、同一份 pending、同一个 respond 只结算一次**——第二次作答返回 `expired:true`（两侧冻结）；只有 active 卡调用 presenter（排队卡不物化，只走 `onQueued` 聚合行）。不改卡片内容/选项/审计，不产生第二份账本决定或第二次 `onNextStep`。IPC 仍走既有 `session:operator-request`（载荷原样透传，`onQueued` 的 `{...payload, waitingFor}` 同样携带）；`main.ts`/`preload.cjs` 无需新增通道。
- **审计**：`dispatch.accepted`（应用推进）与 `intent.handed-off`/`clarification.requested`（编排写入）都**不是客户批准**；三者均不写 `customerDecision`/`decisionEvidence`。
- **真机阻塞修复（2026-10-18）**：① **任一内置治理角色（liaison/rapporteur/nominator/convener）`settled` 后**，Interface 异步 `listProjectFn` → `listingCache.set` → `emitProjectChanged`（同项目串行 + 突发合并；失败只记诊断，不打断会话/事件外推）——Nominator 同一轮写出的角色卡随即对 `role_status`/`dispatch_task` 可见。② `role_status` 的指定角色 miss、`routeDispatch` 的目标 miss ⇒ **强制刷新一次再重试**（只一次，仍缺才如实拒绝）。③ `advanceGovernanceFlow`：来源角色本轮仍在跑（决定卡在本轮中途作答）⇒ 先 `waitForRoleSettle` 等其 `settled`（一次、上限 60s；超时/会话释放只记诊断后继续），再刷新 listing，然后才后台派发——**任命后 Convener 必在 Nominator 写卡完成后才收到任务**；不循环重试。会话释放时等待者按 `false` 结算，不悬挂。

**2026-10-17 增** `tier: "risky"|"review"|"deny"|null` 与 `policy: "su-approval"|"project"`（桌面自有类型，不改契约家 `OperatorPrompt`）：从 `display.reason` **行首**匹配 `su-审批档[tier]`（前缀经编排 `shell-arming.ts` 公共再导出；先匹配前缀，避免既有 `/risky/` 泛匹配）。`policy=su-approval` 时 `reasonPlain` 含「逐条客户批准」「拒绝/超时/通道不可用 = 拒绝」「批准后可能绕过 ANS 文件写边界」；deny 用「硬拒类（deny）」、risky/review 各用其档位名。项目角色三层链恒 `tier:null`/`policy:"project"`，原文映射逐字不变。shellConfirmRespond 仍仅恰 allow:true 才接受。

**su 审批档注入（客户裁定 2026-10-17；三权 W3 起收窄为 single）**：`SessionManager` 对 **single 模型下的内置治理角色（su）** 把 `deps.shellArming`（(c) 实件）＋ `deps.shellOperatorChannel`（(a) 通道，**su 也构造**，绑定 roleId/projectRoot/runtime/signal）经 `openRoleSession({shellOperatorOnly})` 交给编排 `assembleOperatorShellGate`：只读白名单直放（0 卡），`risky`/`review`/`deny` 一律客户逐条批准（deny 也可批准）；**不接 (b)**（su 不自审）；缺件 ⇒ 不传 ⇒ 不 arm。**trio 三人一律不接审批档**（评审 §5.6）；Convener 仅经 `shellReadonly` 收同一份 (c) 实件（`(c)=allow` 直接执行，risky/review/deny 一律拒绝、0 卡、不带 operator channel），Rapporteur/Nominator 无 shell。项目角色仍走 `shellArming` + `shellOperatorChannel` 三层链。

新增 `onOperatorExpired(cb)` / session:operator-expired：`{id,roleId,projectRoot?,runtime?,reason}`，同时覆盖 customer confirm/choice 与 shell，id 分别为 op-* / sc-*。UI 按身份定格旧卡。

Customer callback 第二参保留 O1 的原 CustomerInputMetadata.signal；session lifetime 信号为本地补充。Shell 公共 OperatorChannelFn 没有原 signal，Window 只向自己的 presenter 传本地精确句柄轮次 metadata；abort、dispose、settled、send 拒绝、presenter 时限都清理旧 pending。内部 signal 不进入 IPC。旧句柄流不能使新卡失效。发行和 shell 执行前原 signal 检查仍由编排/核心实施。

## 「替我审」自动判断（P4，2026-10-17；PM 评审 §5.2/§6.5/§6.6）

**开关（主进程权威）**：`createShellJudgeSwitch()`（`app/desktop/interface.ts`，纯内存）——默认 `false`；`main.ts` 在 `loadInterface()` **开始前** `reset()`（启动/渲染重载复位）；不写 localStorage/`.env`/项目文件。`main.ts` 与 Interface 共持**同一实例**：通道在**调用当刻**读 `isEnabled()`，所以切换**只影响之后新到的 `(a)` 请求**，已挂起卡不受影响。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getShellJudgeState() | shell:judge-get（无参） | `{version:1, ok:true, enabled}` |
| setShellJudgeEnabled(enabled) | shell:judge-set `{enabled:boolean}`（桥内强制布尔） | `{version:1, ok:true, enabled}` \| `{ok:false, error}`（**失败不改状态**） |
| onShellJudgeState(cb) | 订阅 shell:judge-state（主→渲） | `{version:1, enabled}`——开关变化/重载复位/初次加载后推送 |
| onShellJudgeResult(cb) | 订阅 shell:judge-result（主→渲） | `ShellJudgeResultPayload` |

两个入站 handler 在 `main.ts` 内**各自**校验 `event.sender === win.webContents`（`isShellJudgeIpcSender` 纯同一性谓词）；不依赖通用 registrar。诊断：`shell-judge.toggled`（enabled/source/at）、`shell-judge.set.rejected`（reason）、`shell-judge.row.failed`（requestId/toolCallId/verdict）。

**通道三态（`app/desktop/operator-channel.ts`）**：`CreateOperatorChannelOptions` 增 `judge?: {isEnabled, timeoutMs?}`（缺省 **135000ms**：driver 120s + 15s，由 `ANS_SHELL_JUDGE_TIMEOUT_MS` 派生；独立于确认卡超时）与 `emitJudgeResult?`。开关关 / 无 `metadata.judge` / `metadata.signal.aborted` ⇒ **原 `present` 路径逐字不变**。开启后：

- `allow`：**先发结果行**（`ShellJudgeResultPayload`；投达失败或缺 `emitJudgeResult` ⇒ `manual/row-failed` → 原卡）→ `{outcome:"allow", operatorId:"judge:<engine>", judge}`。
- `deny`：格式化 §8.4 文本（说明/原因/替代方案/出路）→ 发结果行（失败**只记诊断**）→ `{outcome:"deny", operatorId:"judge:<engine>", reason, judge}`；**不调 presenter、0 卡**。
- `manual`：写 `display.judgeNotice`（按 reasonCode 人话，附「规则判定仅作参考；判断 agent 未完成时才由你手批」；`row-failed` 专用文案）→ 原 `present`；审计归人工（**不写 `judge`**）。
- **deny 档（客户 D1）**：judge `allow` **照常放行**，只按 `request.tier === "deny"` 置 `hardDenyOverride:true` 与 `label:"deny 档 · judge 放行"`；**无 hard-floor 转换/拦截/弹卡**。

判断请求由会话闭包给出：`roleId/projectRoot/runtime/turnText/judge`；`policy/tier` 由 `OperatorPrompt.reason` 行首 `su-审批档[tier]` 解析（否则 `project`/`null`）。`ShellCommandDisplay`/`ShellConfirmRequest` 增可选 `judgeNotice`（`buildShellConfirmRequest` **原样拷贝**，不进入 `reasonRaw`）。

**2026-10-18 客户裁定（第一层规则不拒绝任何请求）**：c 规则只快速放行/作参考，**所有拒绝由判断 agent 做出**；risky/review/deny 均交给 (a)。桌面 (a) 通道对 deny 档**同样调用 judge**（无 tier 短路）；结果行/审计保留 c 规则判定（`policy/tier`）与 judge 结论（`verdict/reasonCode`）；诊断 `shell-judge.decision` 以 `decision:"<policy>:<tier 或 null>:<verdict>"` + `outcome` + `reasonCode` 同时保留两者。single/su 旧路径（开关关/无 judge）逐字不变。

**会话装配（`app/desktop/session.ts`）**：每会话用**同一份** `runtimeOptions` 与已构造的 `createAdapter` 工厂经编排 `createShellJudge` 生成闭包（`SessionManagerDeps.createShellJudge`；Interface 缺省注入真实实现，经 `govern-session.ts` 薄再导出，**不直接导入私有 `common/编排/`**）；构造失败 ⇒ 不注入（回原 present）。`LiveSession.lastUserText` 在**真实投递**（直发/出队/派发/回交）时写入，UTF-8 ≤4096 字节（超出截断、不据此 manual）；`metadata` 在调用当刻从活会话读取 `turnText`/`judge`；会话 `dispose` 即清两项。三人（su/项目角色）共用；不改既有 shell 审批档/三层链。

## 双开关「替我审批」/「替我决策」（P4，2026-10-18；PM 评审 §三/§四/§八/§九/§十二）

**两个开关是两套独立状态**（同一 `createShellJudgeSwitch()` 实现，**不同实例**）：都默认 `false`、只在主进程内存、启动/渲染重载 `loadInterface()` 复位、不持久化、互不影响。组映射唯一来源＝`src/model/runtime.ts::GOVERNANCE_CARD_GROUP`/`governanceCardGroup`（桌面不再写第二张表）：`write`/`appointment-write`/`schedule-write`→`approval`；`proposal`/`appointment`/`acceptance`→`decision`。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getShellJudgeState() | shell:judge-get（无参） | `{version:1, ok, enabled, available}` |
| setShellJudgeEnabled(enabled) | shell:judge-set `{enabled:boolean}`（桥内强制布尔） | `{version:1, ok, enabled, available}` \| `{ok:false, error, available}`（**失败不改状态**） |
| onShellJudgeState(cb) | 订阅 shell:judge-state | `{version:1, enabled, available}` |
| onShellJudgeResult(cb) | 订阅 shell:judge-result | `ShellJudgeResultPayload`（shell judge，字段不变） |
| getDecisionJudgeState() | decision:judge-get（无参） | `{version:1, ok, enabled, available}` |
| setDecisionJudgeEnabled(enabled) | decision:judge-set `{enabled:boolean}`（桥内强制布尔） | 同上；失败不改状态 |
| onDecisionJudgeState(cb) | 订阅 decision:judge-state | `{version:1, enabled, available}` |
| onOperatorJudgeResult(cb) | 订阅 `session:operator-judge`（主→渲） | `OperatorJudgeResultPayload` |

`available` 是可选加法（本版本恒 `true`；渲染侧只在明确 `false` 时禁用，不显示假开启态）。四个入站 handler 各自校验 sender；诊断 `decision-judge.toggled` / `decision-judge.set.rejected`。`OperatorJudgeResultPayload`＝`{version:1, id, requestId, anchorKey, toolCallId, roleId, projectRoot?, runtime?, at, group, cardKind, flowId?, engine, model?, reasonCode, reason?, selected?, confirmed?, paths?, pathDecisions?, evidence?, durationMs?, readCalls?, readBytes?}`；只在 `approve` 结算且结果行投达成功后出现。

**判断发生点与状态机（`app/desktop/customer-input.ts`）**：只在 `presentEntry` 调用 `presenter` **之前**判断；`ChannelEntry.state` 增 `judging`。`shouldJudge` 全部满足才调用——presenter 存在、注入了 `ctx.governanceJudge`（或 `opts.judge.fn`）、`cardKind` 有组、所属组开关开（主进程权威）、`ctx.governanceModel === "trio"`、`flowId` 非空、信号未中止、`metadata.judgeContext` 存在。`judging` 占住一项目一卡但**不进 pending**：`pendingCount/queuedCount/pendingRoles` 不计、`judgingCount()` 仅供诊断、`respond` 对判断中 id 回 `expired:true`；`judged=true` 保证同一请求只判断一次，`replayPending` 不重判。

- `approve`：结算前**再查开关**（关 ⇒ `manual/switch-off`）→ 防御复核 group/cardKind/value（选项 ⊆ 卡片、单选恰一、confirm 恰 `confirmed:true`）→ **先** `emitJudgeResult`（缺失/抛错 ⇒ `manual/row-failed`）→ 同一 `settleEntry` 结算为 `{outcome:"answered", value:{selected}|{confirmed:true}, operatorId:"judge:<engine>", judge}` → `notifyNextStep`/`drainProject` 恰一次（**0 卡、1 行**）。
- `manual`（负向/证据不足/读取失败/超时/引擎不可用/group 不符/`judgeContext.unavailableReason`/开关关闭/中止/结果行失败）：原卡 + `OperatorRequestPayload.judgeNotice`（`row-failed` 单列；带「代审批/代决策」）。不写账本决定；客户手答仍归 `customer-input`。回落**按组、按卡、整卡**，另一组不受影响；判断中关开关不追溯已挂起卡（结算前再查一次）。
- **治理 judge 通道层防御超时**（2026-10-18 真机修正；同日 driver 默认上调后再次同步）：driver 超时（`ANS_GOVERNANCE_JUDGE_TIMEOUT_MS`，默认 **120s**，编排解析）**+15s 余量**，缺省 **135s**；非法/缺失回 135s；显式 `judge.timeoutMs` 原样使用（测试/宿主）。用 `AbortSignal.timeout`（不引入 `setTimeout/setInterval`）；超时提示带**实际时长**（`判断超时（>135s）`/`（>20ms）`）。**shell judge 的通道超时独立派生**（`ANS_SHELL_JUDGE_TIMEOUT_MS`，driver 默认 120s + 15s 余量 ⇒ 135s，见 §「替我审」），两套互不影响。`rejectAllPending`/`cancel` 把 `judging` 一并结算，迟到结果见 `state !== "judging"` 丢弃。
- 结果行人话摘要 `judgeResultSummary(payload)`：`judge 代批 · 代决策：接受提案（accept）/任命 <ids>/验收通过（accept）· 流程 <flowId>`；写盘族 `judge 代批 · 代审批：确认写入 <n> 个路径（…）`。

**会话装配（`app/desktop/session.ts`）**：`LiveSession.governanceJudge`；仅在 `governanceModel === "trio"` 且客户交互通道已接时，用**同一份** `runtimeOptions`/`createAdapter` 经 `SessionManagerDeps.createGovernanceJudge`（Interface 缺省真实实现，经 `govern-session.ts` 薄再导出）构造；构造失败 ⇒ 不注入。`customerInput` 闭包 ctx 增 `governanceModel/governanceJudge/turnText`（调用当刻读活会话），`metadata`（含编排计算的 `judgeContext`）**原样透传**；dispose 清空。single/su/Liaison 不注入。

**主进程（`app/main.ts`）**：客户通道 `judge.isGroupEnabled = group === "approval" ? shellJudgeSwitch.isEnabled() : decisionJudgeSwitch.isEnabled()`；`emitJudgeResult` 推 `session:operator-judge`（窗口已关时**抛错** ⇒ 通道降级 `row-failed`），并经 `desktop.emitJudgeProgress(payload)` best-effort 落主入口 Liaison 进度行（`emitSessionEvent` 的 `message`，`detail.source:"judge-decision"`；来源即主入口不重复、失败只诊断）。`advanceGovernanceFlow` **零改动**（代批成功仍经 `notifyNextStep` 触发）。

## 其他能力与装配

项目 pickProject/listProject；listProject roles 原样转可选 readonly group/groupDuty，窗口不解析组别。外开、选图/附件、诊断/显式恢复、窗口控制保留已有白名单方法。`app:recovery-state` 增 runtime。所有订阅均返回取消订阅函数；preload 不暴露 Node 能力。未改动通道的完整历史表见[冻结归档](../桌面应用/api-spec.md)。

## I1 治理记录状态（existing-project-compat V1，2026-10-17）

`ListProjectResult` 新增 `governanceRecord: GovernanceRecordStatus`（`{state: "present" | "missing" | "invalid" | "pin-mismatch"; reason?: string; pinFiles?: PinEvidenceFile[]; pinCount?: number}`；`GovernanceRecordState`/`GovernanceRecordStatus` 定义于 `app/desktop/project.ts`，`interface.ts` 原样再导出）。`listProject` 在枚举后经**既有单一授权链** `buildEffectiveProjectConfig` 读取 `.ans`（无则回退运行期同意；不可用则 fail-closed），由纯函数 `deriveGovernanceRecord` 用载入器事实 `source.kind`/`source.acceptance.accepted`/`source.downgradeReason` 与 `project.governanceBoundary.path` 派生，再由 `deriveGovernanceRecordWithPins` 在 `present` 上合入门禁引擎的只读 pin 证据（2026-10-17 C1）：

| state | 判据 | 含义 |
| --- | --- | --- |
| `present` | `kind === "ans"` 且 `accepted === true` 且治理边界路径 trim 非空，且全部 pin 目标哈希一致 | 记录存在且与盘上边界一致；**不新增字段** |
| `missing` | `kind === "builtin-fallback"` | 无 `.ans/project.json`；即便 fallback 是运行期同意（accepted:true）也是 missing |
| `invalid` | `ans-invalid`，或 `ans` 但未接受，或治理边界路径为空；或 pin 缺失/空/形状非法/检查异常 | 记录不可用；`reason` 只取载入器降级原文（缺失时给等价原因）或证据检查原因 |
| `pin-mismatch` | 记录结构可用，但至少一条 pin 目标缺失、不可读或 SHA-256 不符 | 带 `pinFiles`（仅不一致项，`path/pinned/actual/status`，按 pin 原顺序）与 `pinCount`（含一致项）；未确认前会话不可开、写入被拒 |

`governanceRecord` 与 `hasRoles` **相互独立**；`missing` 的动作可见谓词固定为 `hasRoles === true && governanceRecord.state === "missing"`，`pin-mismatch` 的动作由桌面UI 的单一谓词 `governanceActionFor` 给出。本层**只读**：不写文件、不建目录、不触发 finalize。`DesktopDeps.loadEffectiveConfig` 可注入（缺省＝共享载入器 `src/common/shared/config-loader.ts::loadEffectiveConfig`，只读导入、不复制），并透传给 `SessionManager`，保证界面派生与会话授权链同源。`DesktopDeps.inspectPinnedBoundariesFn` 可注入（缺省＝Service 公开出口 `src/service/boundary/resolve-boundary.ts::inspectPinnedBoundaries`，门禁引擎唯一哈希实现）；检查异常一律降级 `invalid`（`pin 证据检查失败：<message>`），**绝不让 `listProject` 崩**。

测试注入面新增 `createRuntimeAdapterFactoryFn`、`runtimeOptions`；默认全部引擎走 Pipeline 工厂。旧显式 createPiAdapterFactoryFn/createDemoAdapterFn 保留原测试接缝及真实 boundary，未选择它们时不绕行到 demo。envFilePath/piConfigEnv 可注入；开发测试只用临时假 env。

已知原有直接 public 门禁枚举/规则导入与 legacy demo/request-anchor 的 Provider 常量/工具导入延续本次前已批准结构；新引擎工厂和历史均通过 Pipeline，不增加 Provider/SDK 跨层调用。真实窗口交互由 U1/T1 提供独立证据。

## I2 治理记录预览/建立接线（existing-project-compat V1，2026-10-17）

| 层 | 名称 | 请求 | 返回 |
| --- | --- | --- | --- |
| IPC | `project:governance-preview` | `{projectRoot, governanceModel?: "single"\|"trio"}` | `GovernancePreviewResult` |
| IPC | `project:governance-establish` | `{projectRoot, confirm: true, governanceModel?: "single"\|"trio"}` | `EstablishGovernanceResult` |
| preload | `previewGovernanceRecord(projectRoot, governanceModel?)` | 同上 | 同上 |
| preload | `establishGovernanceRecord(projectRoot, governanceModel?)` | 桥内固定 `{projectRoot, confirm: true, governanceModel?}`（仅接受合法值） | 同上 |

`DesktopInterface.previewGovernanceRecord({projectRoot})` / `establishGovernanceRecord({projectRoot, confirm:true})` 经编排 Pipeline 公共出口 `src/pipeline/orchestration/govern-session.ts`（B2 薄再导出）调用机制——**不**直接导入 `src/common/编排/finalize.ts`。机制输入只有 `projectRoot`（边界、授权来源、写路径均由机制内部构造）。

守卫（PM 评审 §4.6，本层负责 1–3）：① `projectRoot` 非空且等于当前导入项目 `importedProjectRoot`，否则合成 `invalid-request`；② establish 必须 `confirm === true`，否则 `invalid-request`；③ 同项目在途互斥由**机制内部**负责（并发第二次得到 `busy`），本层不造第二份（渲染侧重复点击由 UI 禁用）。guard 拒绝时**不调用机制**、零写入；establish 的 guard 回执固定 `phase:"guard"`、`status:"blocked"`，`projectJsonRel`/`manifestRel` 为固定相对路径（`.ans/project.json` / `docs/bootstrap-manifest.md`，与 `finalizeRelPaths` 输出同值）。

成功判据＝`ok && phase === "write" && finalize.status === "completed"`。成功后的收尾（顺序固定）：① 调用**既有** `SessionManager.refreshStaleBoundaries()`（O-1 陈旧边界刷新入口；在跑轮次跳过、逐会话失败隔离）——**先于清缓存**，因为重建路径经 `getListing` 取角色表；② `listingCache.delete(projectRoot)`；③ 复用**既有** `DesktopDeps.emitProjectChanged`（main.ts 推 `project:changed`），渲染侧按既有消费面重新 `listProject`（状态随 `.ans` 变 `present`、动作隐藏）。

机制错误（`busy` / `already-established` / `invalid-record` / `no-roles` / `nothing-to-pin` / `unparseable-governance-doc` / `blocked`）原样透传，不重写 `code`/`message`。`DesktopDeps.previewGovernanceRecordFn` / `establishGovernanceRecordFn` 可注入（缺省＝真实机制）。

## C1–C3 治理记录 pin 不符的重新接受恢复（2026-10-17，PM 评审 §5.3）

`app/desktop/project.ts` 新增（纯映射 + 只读派生，`app/desktop/interface.ts` 消费）：

```ts
export function applyPinEvidence(record, evidence): GovernanceRecordStatus;
export async function deriveGovernanceRecordWithPins(input: {
  projectRoot: string;
  record: GovernanceRecordStatus;
  pins: PinEntry[] | undefined;
  governanceBoundaryPath?: string;
  inspectPinnedBoundariesFn?: typeof inspectPinnedBoundaries;
}): Promise<GovernanceRecordStatus>;
```

映射（逐字按评审 §5.3）：`record.state !== "present"` → 原样返回、**不做任何哈希**；`pins` 缺失/空 → `invalid` +「治理记录未提供可验证 pin」；evidence `invalid` → `invalid` + reason；`ok` → 原 `present`（**不新增字段**）；`mismatch` → `pin-mismatch` + `pinFiles` + `pinCount`；任何异常 → `invalid` +「pin 证据检查失败：<message>」，**永不抛错**。治理边界路径非空时作为 `requiredPath` 传给证据检查（治理边界必须被至少一条 pin 覆盖）。

| 层 | 名称 | 请求 | 返回 |
| --- | --- | --- | --- |
| IPC | `project:governance-reaccept-preview` | `{projectRoot}` | `GovernanceReacceptPreviewResult` |
| IPC | `project:governance-reaccept` | `{projectRoot, confirm: true, previewDigest}` | `ReacceptGovernancePinsResult` |
| preload | `previewGovernanceReacceptance(projectRoot)` | 同上 | 同上 |
| preload | `reacceptGovernancePins(projectRoot, previewDigest)` | 桥内固定 `{projectRoot, confirm: true, previewDigest}` | 同上 |

`DesktopInterface.previewGovernanceReacceptance` / `reacceptGovernancePins` 经编排 Pipeline 公共出口 `src/pipeline/orchestration/govern-session.ts`（B2 薄再导出）调用机制——**不**直接导入 `src/common/编排/finalize.ts`。机制输入只有三个钉死字段（项目根、确认、预览摘要）；边界、授权来源、pin 列表与写路径均由机制内部构造/重算。

本层守卫只做评审 §5.3 的 1–3：① `projectRoot` 非空且**严格等于** `importedProjectRoot`，否则合成 `invalid-request`（preview 回 `{ok:false,status:"invalid-request",message}`；reaccept 回 `{ok:false,status:"invalid-request",phase:"guard",wrote:[],message}`）；② `confirm === true`；③ `previewDigest` 为非空 64 位十六进制（严格 `/^[0-9a-fA-F]{64}$/`）。guard 拒绝**不调用机制**、零写入，`message` 均含「本次未写入任何文件。」。机制结果（preview 的 busy/no-record/invalid-record/not-needed/blocked；reaccept 的 completed/write-failed/blocked/not-needed/no-record/invalid-record/missing-file/unreadable-file/unparseable-boundary/preview-stale/busy）原样透传。

收尾：`status === "completed"` **或** `"write-failed"`（已进入写入阶段、可能部分落盘）后，顺序固定——① `await manager.refreshStaleBoundaries()`（失败吞掉，不影响回执）；② `listingCache.delete(projectRoot)`；③ `deps.emitProjectChanged?.()` 让渲染侧重新 `listProject`。**不自动打开会话**（不调用 `openSession`）。`DesktopDeps.previewGovernanceReacceptanceFn` / `reacceptGovernancePinsFn` / `inspectPinnedBoundariesFn` 可注入（缺省＝真实实现）。

## D1R 当前证据

历史轮次字段的必要修复见[独立修复记录](docs/fix/2026-10-14_fix_history-turn-metadata.md)：受影响 Window 37/37（其中 multi-runtime 17/17，新增两项）、strict tsc 与scope diff exit0。原D1 171项保持历史，未冒充修复后全组复跑。UI历史/live合并与真实Electron重复保护由U1/T1另交证据。

## D1R2 原客户投递显示关联

第四参metadata可含 `{clientMessageId?:string}`，仅采纳非空字符串作为原输入气泡的opaque显示标识。直接/排队客户输入固定此值，匿名派发/回交也各自建立原prompt来源。没有字段时保持旧调用兼容。

生产Window通过原prompt invocation callback闭包消费Model `PromptOptions.onTurnStarted(PromptTurnStartedMetadata)`：只有Core实际创建turn后的同步只读ack能注册actualturn→原record。metadata包含真实readonly turnId/roleId/runtime；clientMessageId不进入Model、Core、store或工具授权。Window精确身份验证callback，并保留原images数组/图片内容；无runtime标识、无客户端关联的旧替身沿用原单参/整包路径。

`SessionEventEnvelope.clientMessageId`只在原event.turnId命中已ack原record时增加；缺ack的旧提供方、无turn/未知/已清理ID都不绑定。匿名记录没有客户端ID；不使用首次事件、FIFO、最新选择或文本猜测。事件原对象不变。settled清busy/drain之前捕获来源与ID；已ack失败/aborted record保留原ID供延后terminal，前置拒绝未ack record不借下一turn。迟到旧terminal/旧send拒绝不清新轮busy或中止新确认。终结记录有界保留128条，dispose清精确句柄映射。

[当前原实现/101项受影响gate与SHA-256](docs/fix/2026-10-14_fix_client-message-origin.md)。D1/D1R1此前证据仍为历史；真实user气泡/history合并由U1/T1另验。

## 本轮回交来源（chat-handback-scope revision 2）

实现[编排规范](../编排/docs/fix/2026-10-14_fix_chat-handback-scope.md)：Window 每次实际 send 都传 Pipeline 的 RoleSessionSendOptions.handback。只有队列 kind=dispatch 为 required:true；即时客户消息、排队 message、回交消费（含合批）为 required:false，覆盖旧会话 taskId。重试由保留条目的 kind 决定，不解析正文。图片数组原引用与原 onTurnStarted 回调保留，clientMessageId 仍只经真实 ACK 关联。新字段不进入 IPC，不改变历史解析；聊天主动 submit_report 仍由编排产出并按既有路径投递。验证见[修复记录](docs/fix/2026-10-14_fix_chat-handback-origin.md)。

## 重复显示身份（2026-10-15 revision 2）

ANS历史 ReplayRow 增可选 `input?:PromptInputEventDetail`。仅 source=prompt-input 的 message 规范为输入行，原text/imageCount与actualturn保留；同请求project/role/runtime及非空turn的persisted user与typed echo返回单输入，保persisted正文/at，原审计不改。未知旧消息不解析前缀或猜重。live事件原样传送，由UI按同契约呈现。

session:operator-request 的 OperatorRequestPayload 增可选turnId/toolCallId，来自原CustomerInputMetadata非空字段；已有id仍是答复pending键，不冒充模型callId。原signal、scope、请求快照、取消及过期机制不变。main/preload通道透明转发，无新增IPC。恢复提示没有本批新增生命周期字段。证据见[窗口修复](docs/fix/2026-10-15_fix_duplicate-display-identity.md)。

工具历史 activity.phase 可含 call/start/blocked/result。显式 canonical detail.phase 三值优先；无显式值时按原eventKind映射tool_call→start、accepted→result、denied→blocked。legacy native toolResult仍result，同call blocked与failed result不得互吞，原日志不改。

## B2 受限文档只读（WINDOW-B-1）

`listProject`兼容增加documentScope?与documentReadUnavailable?，每role增加documents?。主进程原生pick成功建立当前窗口grant，renderer直接listProject不授权；同窗口重载保grant，关闭清空。新`desktop.readProjectDocument({version:1,projectViewId,documentId})`→`project:document-read`，返回Model唯一ReadProjectDocumentResult，无root/path/URL入参。PROJECT_NOT_GRANTED是未原生选择的原因细分，不扩大读权。`disposeProjectDocuments`仅main内部关窗调用，preload不暴露。

公开类型`src/model/project-document.ts`，分层入口`createProjectDocumentReader`。cardPath/changelogPath为项目相对，候选docs.path是角色卡目录相对（docs/x.md）；对UI已发ref.relativePath为项目相对，仅展示，读取只用opaque ID。支持范围md/txt UTF8≤262144原始字节、NUL/超限/不合法编码失败无partialtext，平台/句柄与scope失效按完整error union消费。现只窗口接口实现，UI静态阅读后接，验证见[实施记录](docs/change/2026-10-15_change_restricted-document-read.md)。

B导入提交时机修复（WINDOW-B-FIX-1）：原生选择和beginListing为pending，成功updateListing才提交active scope/refs。选择后枚举失败或取消保留原项目阅读；成功导入未授权项目也撤旧scope并报PROJECT_NOT_GRANTED。Pipeline内部cancelNativeSelection只清待选授权与迟到token，不新增renderer IPC。详见docs/fix/2026-10-15_fix_document-scope-import-commit.md。

## A4 / C2 text_policy_revision 1（WINDOW-A/C-1实际接口）

SessionEventEnvelope.event为DesktopOrchestrationEvent：工具SessionEvent已经上游保护；源handback只`summary/report?/liveReport?/reportPersistence?`，无rawhandback。raw业务对象/原模型交接不进IPC；新C输入/交接详情只Core安全copy，标签“交接内容（安全显示副本）”，flags为Model RuntimeInputTextProjectionV1，modelInputRecorded:false不等于完整native转录。回交queue.full/running.full仅safe copy或等待占位。

历史activity.display为Model ToolDisplayV1；ReplayRow兼容新增inputProvenance/inputPresentation/inputTextProjection、deliveryReceipt/deliveryBoundary，SessionHistoryView可含reports/reportErrors/projection。目标继承取安全display.target，确认卡可信turn/call可直接给request/conclusion；旧Pi native-only经现parser中立转换→Pipeline纯保护，raw rows/source/error不侧带IPC。哈希helper两端统一legacy-anchor-v1:SHA256，不改真实call/turn。

| preload方法 | IPC | ID字段 |
| --- | --- | --- |
| retryReportSave | report:retry-save | reportId |
| getReportSaveState | report:get-save-state | reportId |
| retryDeliveryHistorySave | delivery:retry-history-save | attemptId |
| getDeliveryReceipt | delivery:get-receipt | attemptId |
| getSessionPersistence | session:get-persistence | 无 |

每请求含version:1/projectRoot/roleId/runtime及表中ID，不接正文/路径/持久布尔；实际当前导入scope、原绑定handle和已登记ID核对。返回PersistenceReply<T>外层ok只说明受限调用完成，value为Core对应ReportSaveResultV1/ReportSaveStateV1/DeliverySaveResultV1/DeliveryReceiptQueryV1或能力快照；value自己的ok/state仍须判定。mode unknown-live即使proxy方法存在也reportSaveSupported/deliveryHistorySaveSupported/querySupported全false。disabled能力入口可存在，具体retryAvailable以Core ID状态为准。

onReportPersistenceUpdated/onDeliveryHistoryUpdated订阅report-persistence-updated/delivery-history-updated并返回取消函数；payload{version:1,scope:{projectRoot,roleId,runtime},change:Core RuntimePersistenceChangeV1相应分支}。原handle闭包守卫与dispose退订；状态只更新原卡，Window唯一同步归并器负责首次saved业务一次入队，Pipeline没有另一条enqueue。查询不写入不prompt；保存同ID单在途无timer，target补存绝不Provider，source仅保存成功可首次继续回交。最终receipt缺失不得推saved；过期/未知/可能开始禁止自动重投。精确证据见[实施记录](docs/change/2026-10-15_change_complete-flow-window-ac.md)。

A4 legacy provenance窄修：protected工具t.statusSource/target.source分别原样输出legacyStatusSource/legacyTargetSource，缺失不猜；每protected row.metadataOmissions透传为ReplayRow.metadataOmissions，类型直接引用Model RuntimeProtectedLegacyHistoryEntryV1[metadataOmissions]，允许timestamp/anchor-token/oversize-identity。UI可标真实来源/省略原因，不从原文推导。模板target/process仍不恢复。证据见docs/fix/2026-10-15_fix_legacy-projection-provenance.md。

## 停止轮次的SendResult事实快照（WINDOW-STOP-TERMINAL-FIX-1）

既有sendSession透明返回兼容可选turnId/clientMessageId/inputAccepted:true/outcome/sessionCurrent。turnId仅原调用ACK，inputAccepted仅同actualturn typed prompt-input已观察，outcome仅公开settled.detail.outcome首有效enum；无证据缺席。不解析错误文案、不等终态、不新IPC/Model。sessionCurrent是返回时原entry仍当前，不代表provider清理完成；false不等于没有新的当前会话。先拒后终态时UI经现session:event按actualturn+clientID合并，返回快照不被迟到事件修改；同client异turn不能互借。真正failed/timed_out与未接受输入的错误/草稿处理仍由真实事实决定，不将stop请求当完成。证据见[停止收口修复](docs/fix/2026-10-15_fix_stop-terminal-send-facts.md)。

安装包配置路径修复：main.whenReady后只解析一次resolveDesktopEnvPath({isPackaged,userDataPath})，packaged=userData/.env，dev仍repo.env；启动共享loader和DesktopInterface.envFilePath同值，不复制env实现/不拷贝凭据。受控host CLI --ans-packaged-smoke <absolute.json> --user-data-dir=<temp>验证真实DOM/preload/既有只读IPC和设置开闭，结果含isPackaged，开发不算通过；无新renderer IPC。证据见docs/fix/2026-10-15_fix_packaged-runtime-config.md。

## 三权治理 V1 桌面端（W3，2026-10-17；评审 §5.6/§6.2）

**Interface 透传**：`ListProjectResult` 增 `governanceModel: GovernanceModel`（原样转自门禁引擎 `listProject`，缺省 `"single"`）；`RoleView` 增可选 `governanceFunction?: GovernanceFunction`（仅 trio 的 rapporteur/nominator/convener 携带，原样透传、不硬编码 id）。`app/desktop/project.ts::buildProjectConfig` 把 `listing.governanceModel ?? "single"` 写进 `ProjectConfig.governanceModel`；`buildEffectiveProjectConfig` 优先采纳载入器 `.ans` 的显式模型，缺失才回退枚举结果——否则边界解析会掉回 single，三权角色全部不可写。

**能力路由（`SessionManager.open()`，唯一数据来源＝`role.governanceFunction`/`builtIn`，不硬编码 id）**：

| 能力 | rapporteur | nominator | convener | su（single） |
| --- | --- | --- | --- | --- |
| `customerInput`（客户确认制） | 是 | 是 | 是 | 是 |
| `dispatchTask` / `roleStatus` / `sessionTail` / `proposeRecovery` | 否 | 否 | **是** | 是（旧行为） |
| `installSkill` / `uninstallSkill` / `installMcp` / `uninstallMcp` | 否 | **是** | 否 | 是（旧行为） |
| `shellOperatorOnly`（su 审批档） | 否 | 否 | 否 | **是**（`governanceModel==="single"` 硬条件） |
| `shellReadonly`（只读档） | 否 | 否 | **是**（同一份 (c) 实件、无 operator channel） | 否 |
| `shellArming` + `shellOperatorChannel`（项目三层链） | 否（内置） | 否（内置） | 否（内置） | 否（内置） |

项目角色（`builtIn !== true`）三项 shell 字段逐字不变；`customerInput` 对全部内置角色注入（su 与三人）。old single 行为逐字不变（`legacyBuiltIn = builtIn && governanceFunction===undefined && model==="single"` 管住全部旧能力）。

**派发（`routeDispatch`）**：① 来源防御性校验——trio 必须是 Convener（`governanceFunction==="schedule"`），single 必须是主入口（su）；不符即如实拒投 + 系统行。② 目标 `builtIn === true` 或保留 id 一律拒。③ 调编排 Pipeline 公共出口 `evaluateGovernanceGate({action:"dispatch", flowId, stepId, targetRoleId})`（trio 读 `.ans/governance/ledger.jsonl` 快照：提案接受/任命名单/快捷路径/流程步骤/`flowId+stepId` 未派发；single 不分流三权门禁）。④ 去重键在 `roleId\0task\0reason` 之外增 `flowId\0stepId`。⑤ **成功入队后**写 `dispatch.accepted`（`actorRoleId=Convener`、`power:"schedule"`、`flowId/stepId/targetRoleId`、`messageSummary` ≤200 字、`runtime`）；失败/被拒**不写**。账本失败只记诊断，不翻转派发、不放宽门禁。single 旧项目**不创建** `.ans/governance`。

**回交 / 看护路由**：`handbackOwnerRoleId(projectRoot)`——trio 找 `governanceFunction==="schedule"`（Convener），single 用 `primaryRoleId`（su）。回交、看护系统消息、恢复回执、投递失败系统行全部改用它；`primaryRoleId` 只用于主入口/客户镜像。`WatchdogProjectSnapshot.suRoleId` 更名 `governanceRoleId`（值=回交主人），`app/desktop/watchdog.ts` 消费方同步（`role_status` 主人行亦数据驱动，single 仍显示 `su：`）。项目角色回交只进 Convener；Rapporteur 不接投递（镜像由渲染侧负责）。内置治理角色（三人+su）不自我回交（防御性拒绝）。`lastSuRuntime` → `lastGovernanceRuntime`（只记回交主人的 runtime）。`applySkillChange`/`applyMcpChange`/`proposeRecovery` 的目标守卫统一为「任一内置治理角色」。

**V1b 迁移接线（编排侧已就绪）**：`project:governance-migrate-preview` / `project:governance-migrate` 与 preload `previewGovernanceMigration(projectRoot)` / `migrateGovernanceModel(projectRoot, previewDigest)`。`DesktopInterface.previewGovernanceMigration` 守卫当前导入项目后**只透传 `{projectRoot}`**；`migrateGovernanceModel` 守卫「当前导入项目、`confirm===true`、`previewDigest` 64 hex」后透传 `{projectRoot, confirm:true, previewDigest}`——路径/模型/写路径均由机制内部构造，**不接受调用方提供**。`completed`/`write-failed`（已进入写入阶段）后：**先** `refreshStaleBoundaries()`（重建路径要经 `getListing` 取角色表，缓存先删会失败——沿用既有教训）→ 清列举缓存 → `emitProjectChanged`；失败（busy/preview-stale/blocked/…）**不清缓存**。**不自动打开会话**。机制结果（preview 的 model/targetModel/writePaths/modelField/manifestLine/pinChanges/retainedFiles/snapshotDigest；migrate 的 phase/status/model/message）原样透传。`DesktopDeps.previewGovernanceMigrationFn` / `migrateGovernanceModelFn` 可注入（缺省＝编排 Pipeline 公共出口）。

**S1 建立治理记录的模型选择（W4）**：`previewGovernanceRecord({projectRoot, governanceModel?})` 与 `establishGovernanceRecord({projectRoot, confirm:true, governanceModel?})`——`governanceModel` 只接受 `"single"|"trio"`；非法值 **invalid-request** 且不调用机制；缺省不传（旧行为逐字不变），显式 `trio` 才由机制写入 `.ans`。



## G-2 看护与恢复（W1-W5，2026-10-16 客户批准；G-2 revision 1）

模块：`app/desktop/watchdog.ts`（看护器——纯逻辑＋注入时钟/快照/投递端）、`app/desktop/confirm-card.ts`（确认卡 pending/replay/expire 通用件——shell 卡与恢复卡共享）、`app/desktop/recovery-channel.ts`（恢复确认卡呈现端）。文案与三能力形状的单一来源为编排 `src/common/编排/watchdog.ts` / 契约家 `src/model/runtime.ts`——本角色只读导入。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| onRecoveryConfirm(cb) | 订阅 recovery:confirm-request（主→渲） | `{id, projectRoot?, runtime?, roleId, action, evidence, reason?, requestedBy?, requestedAt?, itemId?}`——evidence 逐字；恰 `{allow:true}` 才作为执行请求 |
| recoveryConfirmRespond({id,allow}) | recovery:confirm-response | `{ok:true}` \| `{ok:false, expired:true}`（失效/旧回包——未获执行）\| `{ok:false, error}`（非法回包不受理） |

桥与执行（`SessionManager` 公共/注入面）：`proposeRecovery` 能力（trio 仅 Convener（`governanceFunction==="schedule"`）；single 仅 su——经 `openRoleSession({proposeRecovery})` 注入；`ProposeRecoveryFn` 契约——返回 `RecoveryReceipt{outcome: executed|declined|unsupported|error, message?, operatorId?, at?}`，恰 executed 为已执行）；`rebuildSession(target)`（新公共入口；busy 拒绝；F-5-opt1 注记适用）；`redeliverNudge(target, itemId?)`；`abort` 复用既有。回执三路：工具返回＋UI 系统行＋经投递机投回**回交主人**（trio=Convener / single=su；`kind:"system"`）。

只读数据源（同判据：trio 仅 Convener、single 仅 su 注入）：`roleStatus`（`RoleStatusPayload{roleId?,includeDiagnostics?}`→`WatchdogToolResult`——结构化文本；8KiB 截断在工具层）与 `sessionTail`（`SessionTailPayload{roleId,lines?}`→`WatchdogToolResult`——**受保护投影管线**产出，行数工具层归一、本层防御夹取）。两工具**纯读**（调用前后快照逐字段一致，有测试钉）。

### role_status 呈现消歧（2026-10-17 实机反馈）

`busy=true` 时「当前轮」与「上一轮终局」**分行呈现、语义互斥**：

- `  当前轮：进行中（已耗 X / 看护检查时限 Y；turnId=…；1 小时最后兜底）`——仅在快照有 `turnStartedAt` 时给出；X/Y 经 `formatDurationMs`，时限求值与看护/会话运行时同一来源 `resolveRuntimeTimeouts`（`promptTimeoutMs`＝**到点检查时限、不中止本轮**，缺省 **300000ms（5 分钟）**；`turnLastResortMs`＝1 小时最后兜底）；turnId 缺失时显示 `—`；**不再使用「硬超时」**。
- `  上一轮终局：<outcome> @ <at>（不表示当前轮；该角色近 15 分钟 failed/timed_out 计 N）`——历史终局显式标注，不得读成当前轮。
- `busy=false` 时保持原样 `  最近一轮：<outcome> @ <at>（该角色近 15 分钟 failed/timed_out 计 N）`。
- 历史统计（近 15 分钟 failed/timed_out 计数）保留，语义仍是历史统计。

看护 #1 `turn-deadline`（客户裁定 2026-10-17）：阈值为 `TURN_DEADLINE_RATIO = 1.0`（**到点检查**，非 90% 预警）；事实行给出「看护检查时限 Yms；到点仅检查、不中止本轮」＋「用 role_status / session_tail 核对是否卡死；仍在推进则不动作；卡死才 propose_recovery」＋「整轮最后兜底 1 小时（到点才自动中止）」；summary 与文首为「轮次到点检查」。**不得**再出现「逼近超时/已超时/尚未超时/硬超时/剩余约」等旧话术；挂起确认卡/su 忙排除、每轮一次不变。**解除（轮次结束）时不投「看护恢复」行**（到点检查不是故障，恢复行会误导）——只复位活跃期并留 `watchdog.recovery` 诊断；正常完成/空闲不再产生任何会话消息。

`system` 第四类投递：`DeliveryItem.kind` 增 `"system"`（看护告警/收束/恢复回执）；来源标注恒空、正文文首定格 `[系统·<子类>] `（U1 tool-rows.js 归类判据）；**不可撤回**；去重键看护自持命名空间（`watchdog\0…`）；失败保留待重试＋如实系统行。队列快照 `queue` 条目类型补 `id/full`（如实对齐运行时输出）。

看护器：tick 默认 30s（`ANS_DESKTOP_WATCHDOG_TICK_MS`）、静默默认 30s（`ANS_DESKTOP_WATCHDOG_SILENCE_MS`）——**仅 env 可调**；信号 #1-#4（#1 `turn-deadline`＝**到点检查** `TURN_DEADLINE_RATIO=1.0`，只提示不中止；整轮最后兜底 1 小时；其余阈值＝设计 §3.2 默认）；去重/冷却/风暴护栏（15min≤5＋通告＋`watchdog.suppressed`）；`watchdog.failed`／`watchdog.alert`／`watchdog.recovery`／`watchdog.closure` 诊断；`DesktopInterface.startWatchdog()/stopWatchdog()`（窗口注册后启动、窗关停止；看护缺席 ⇒ 一切照旧）。新增 deps：`recoveryConfirm`、`watchdogObserver`、`watchdogPendingConfirmations`、`watchdogStats`、`now`（注入时钟）。

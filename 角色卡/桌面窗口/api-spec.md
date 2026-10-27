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

1. `customer-input.ts` 按 `request.cardKind` + 客户实际选择推导并回调 `onNextStep(payload, context)`（取消/拒绝/expired **不回调**；2026-10-22 第 1 项起）：`proposal`+`accept` → `{nextFunction:"schedule", roleId:"convener"}`（Convener 写/更新流程状态 YAML **与团队计划**后**直接发 appointment 卡**；不再产生 `followUp:"nomination-after-flow"` 两段式）；`proposal`+`accept-quick` → `{nextFunction:"schedule", roleId:"convener"}`（写流程并排步骤，无任命）；`appointment` → `{nextFunction:"role-card-write", roleId:"nominator"}`（应用派 Crew 写卡，**不是** Convener）；`proposal`+`revise|reject`、`acceptance`、`write`/`appointment-write`/`schedule-write` → `nextFunction/roleId` 均为 `null`（明确无下一步）。appointment 的 context 透传 `targetRoleIds` 与请求对象上**显式**携带的 `teamPlanPath`（结构读取，缺席不猜）。推导/文案纯逻辑在 `app/desktop/governance-advance.ts`（`deriveGovernanceNextStep` / `buildGovernanceAdvanceMessage` / `governanceFlowPath`）。
2. 主进程推契约事件 **`governance:next-step`**（主→渲）：`{version:1, flowId?, cardKind, nextFunction:"nomination"|"schedule"|"role-card-write"|null, roleId:"nominator"|"convener"|null, proposalPath?, followUp?:"nomination-after-flow"}`（`followUp` 仅旧事件兼容）。**仅供 UI 显示状态行**——UI **不再**据此打开/切换会话。preload：`onGovernanceNextStep(cb)`（返回取消订阅）。
3. 应用在**后台**打开目标治理角色会话并投递任务（`DesktopInterface.advanceGovernanceFlow` → `SessionManager.openBackground` + `sendBackground`）：**不抢 `activeRoleId`、不切当前 pane**、不自动批准/写盘。目标忙时走既有投递队列（`queued:true`）。成功/失败经既有 `delivery-note` 系统行如实落流。**投递成功后**写账本 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"customer-decision", flowId?, stepId?, targetRoleId, messageSummary≤200, runtime}`（仅 trio；`stepId` 只取卡片/上下文**显式给出**的值，appointment→Crew 固定写 `role-cards`；**不写 `customerDecision`/`decisionEvidence`**；失败不写；账本不可写只记诊断，不翻转投递、不重试）。任务文案：
   - `proposal accept` → Convener：`流程 <flowId>：客户已接受提案 <proposalPath>。` ＋ 写/更新流程状态 YAML（已存在则用 flow_get/flow_step_update/flow_step_supersede；不存在则先写，步骤使用 team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package）＋ 写/更新**团队计划 v2** `docs/scheduling/<flowId>-team-v1.md`（frontmatter flowId/version/riskTier/teamPlanSchema: 2/recommended/modules；正文模块清单 + 14 列角色表含 module/公开契约/测试面/dependsOn/并行组/粒度理由；五维章节；Map 组写集不相交、Reduce 覆盖全部 Map；legacy 计划可不写标记但记迁移提醒）＋ **直接发任命卡** `request_choice(cardKind=appointment, flowId=<flowId>, stepId=role-cards)`（选项=recommended 内项目角色，不含内置治理角色；不替客户决定、不写角色卡）。
   - `accept-quick` → Convener：`流程 <flowId>：客户已接受提案（快捷路径）。请写流程状态 YAML docs/flows/<flowId>.yaml 并排步骤（无提名）；涉及新建/改边界仍须任命卡与写盘确认。`
   - `appointment` → **Crew 写卡主路径**（2026-10-22 第 1 项）：读账本最新 appointment 决定（有界短轮询兜住「事件先于账本 append」的竞态；读不到才回落卡片上下文），取实际 `targetRoleIds` 与 `artifactPath`；团队计划优先账本绑定，其次卡片显式路径，再按 flowId 扫描最新 `-team-vN.md`，仅 legacy 才回落提名文件；两者都没有 ⇒ **不派 Crew**、Lead 系统行。任务文本含 flowId、团队计划路径/版本/schema/模块清单、任命名单、`stepId=role-cards`、只写名单内角色、逐路径 `appointment-write` 确认、第 5 项内容清单、v2 的 module/公开契约/测试面/dependsOn/粒度理由与「计划写集必须被 boundary entries 覆盖（V12）」、计划缺细节报告 Steward / 统筹、不自行扩大职责、不写整层/纳米角色。投递成功后写 `dispatch.accepted{targetRoleId:"nominator", stepId:"role-cards", trigger:"customer-decision"}`。
   - **去重（双重）**：运行期 Set `<canonical projectRoot>\0<flowId>\0appointment-crew`（投递前占位、成功保留、失败释放）＋账本 `dispatch.accepted{targetRoleId:"nominator"}`（appointment 之后；旧版无 stepId 也算），重启/重复事件**不重派**；写卡后推进检查可在角色未写出时有界重试（不循环），**不漏派**。客户手选与推荐集不同 ⇒ 按实际名单派 Crew，并向来源（Convener）落系统行提示修订团队计划 v2。
   - 旧 `followUp:"nomination-after-flow"` 两段式（Convener 写 YAML → 应用检查 YAML 后派 Nominator）**保留迁移兼容**；新事件不再产生。
4. 失败（目标角色缺失/会话打不开/发送失败/缺 flowId 或任命名单/团队计划缺失）**不阻塞当前会话**：诊断 + 系统行（appointment 门槛失败同时落 Lead），**不重试循环**。`flowId` 缺失或 `nextFunction:null` 时不派发。single/su 旧项目行为不变（无 `cardKind` 的旧卡不产生事件）。

**写卡后校验与 role-readiness（2026-10-22 第 1/5 项；同日 Map C 扩展 v2/V12）**：`runPostWriteAdvanceCheck`（appointment-write answered / 内置治理角色 settle 触发）先等 Crew 本轮 settle（有界 8s）→ `refreshListingNow` + `emitProjectChanged` → 对账本每个 flow 的最新 appointment 名单逐角色跑 `validateAppointmentArtifacts`（扩展后：role-card 必需章节、boundary 必填工作文档条目 + 实际写集、feature-map/functional-description/memo/api-spec 或 not-applicable+非空理由；读取团队计划按 `new`/`changed` 应用完整清单、`existing` 只做存在/格式检查并记 warning；计划缺角色行/类型/职责·能力·写集·依赖 ⇒ 来源 Convener）。**团队计划解析单一来源**：`interface.ts::parseTeamPlanInfo` 经 pipeline 公共出口 `src/pipeline/orchestration/run-role.ts` 消费编排 `team-plan.ts` 的 `parseTeamPlan`/`teamPlanIssueMessages`，不直接 import 私有 common、不保留第二份 v2 解析；`teamPlanSchema: 2` 时读取模块清单/角色行 v2 字段，warning/exception-review 只记诊断。**V12**：v2 计划写集必须被该角色 `boundary.yaml` entries 覆盖（file 精确匹配；directory/conditional-directory 覆盖目录前缀；project root），不覆盖按来源退回——new/changed 为 Crew 阻塞（文案同时提示「计划写集本身有误则报告 Convener 修正计划」），`existing` 只 warning、不阻塞。问题按来源分流：Crew 文件 → 反馈 Crew 重发 appointment-write；计划 → 反馈 Convener 补充计划；均不派 readiness、不把 appointment 步骤标 done，重试有界、同 flow+问题哈希去重、最终落 Lead 系统行。通过 ⇒ 派 Convener 做 `role-readiness`（任务含团队计划路径/角色清单/v2 模块清单，要求写 `docs/scheduling/<flowId>-readiness-v1.md` 并标 `status: pass|gaps`；v2 逐角色列 module/contract/testSurface/parallel/dependsOn/granularity，并要求 Map 分片/Reduce manifest 任务约束），写 `dispatch.accepted{targetRoleId:"convener", stepId:"role-readiness"}`；legacy 流程（无团队计划）保留旧「写流程 YAML 并派发已批准步骤」文案。

**验收先写标准、按档位判定（2026-10-22 第 3 项）**：`dispatchAcceptanceForFlow` 对新契约流程（flow YAML 含 team-plan/role-cards/role-readiness/acceptance-criteria/change-package 任一 step id）在派验收判定前增加机械门槛：
- 实施前标准缺失/为空 ⇒ 派 Verifier 写 `docs/acceptance/<flowId>-criteria-v1.md`（任务含方案版本/意图/团队计划/风险档位与 §7.2 结构清单；`request_confirmation(cardKind=write)` 写盘；**不发验收卡**），写 `dispatch.accepted{targetRoleId:"verifier", stepId:"acceptance-criteria"}`（账本+运行期去重，不循环），并 Lead 系统行说明阻塞；标准补齐前不派判定。
- 变更包 `docs/scheduling/<flowId>-change-vN.md` 缺失/为空/缺 `riskTier`（T0–T3）⇒ 不派判定 + Lead 系统行（原因去重）。
- 门槛齐备 ⇒ 判定任务 `buildAcceptanceTaskMessage` 带标准/变更包路径、`riskTier`、报告路径 `docs/acceptance/<flowId>-report-v1.md`（首行五项）与 `docs/verification/` 附件要求、证据复用/失效规则；v2 计划另要求核对模块覆盖/写集/并行组/dependsOn 与 MapReduce 证据（按模块分片、每分片独立原始日志、Reduce 合并 manifest，缺失判 insufficient evidence）；判定派发仍写 `dispatch.accepted{targetRoleId:"verifier", stepId:"verification"}`。legacy 流程保持原行为（G4/O4 迁移兼容）。

**收尾推进（2026-10-18 真机缺口：流程完成后自动派验收）**：项目角色回交送达 Convener、且 Convener 本轮 `settled` 后，`SessionManager` 经 `deps.onHandbackSettled({projectRoot,runtime,roleId,flowId,evidence})` 上报（flowId 由该回交来源轮的 `dispatch` 条目继承；缺失/多流程不猜、不推进；空 turnId 的 legacyTerminal settled 用 `origin ?? origins.running` 定格）。Interface 仅在 trio 下检查：优先 `docs/flows/<flowId>.yaml`（`parseFlowStateYaml` + `evaluateFlowCompletion`，步骤按显式 `kind` 对账证据），无 YAML 才回退 legacy Markdown（`flowCompletionIssue`）——任一不满足 ⇒ 不派 + Lead 系统行（原因去重；后续事件可再检查，不是循环）。全部满足 ⇒ 后台开 Verifier 并投递**唯一一条**任务（`buildAcceptanceTaskMessage`：流程状态 YAML + 回交/核对报告路径 ≤10 条；质量基线八项、真实启动/演示、架构核对、实施前标准/变更包/档位/证据复用、v2 模块覆盖与 MapReduce manifest/分片原始证据；要求汇总证据并出验收卡、不自行验收），系统行「流程 <flowId> 步骤已全部完成，已自动派发验收复核给 Proof（工作中）」；**每 flow 同版本只派一次**（运行期 Set 带 flow YAML mtime + 账本 `dispatch.accepted` 时间），失败如实系统行、不循环重试。**不自动验收、不代批**——验收卡仍走 decision 开关/判断 agent 或客户手批；Verifier settle 后 Lead 系统行提示报告路径 `docs/acceptance/<flowId>-report-v1.md`（附件 `docs/verification/`）。

**治理唤醒引擎择路（2026-10-27 真机修复：ready-wake 误用 Claude）**：`resolveNoteRuntime`（ready/delivered/协调唤醒与系统行共用）优先级＝显式 runtime → 当前角色会话 `activeRuntimeFor` → 本进程治理会话 `governanceRuntimeFor` → 持久化 per-project 选择 / `.ans/sessions` 磁盘证据 / 凭据可用性（`resolveAcceptanceRuntime`，绝不无凭据回退 claude）→ 真实事件弱提示。`acceptanceRuntimeHints` 只由真实会话事件更新；应用 `delivery-note` 系统行（UI 常用 `"claude"` 兜底）不再写入，避免覆盖项目已选的 Pi。项目无可用引擎时如实 `runtime-unresolved`（不派发、不重试）。

**一项目一卡（三权 §6.1 硬约束 / §九-10，2026-10-17）**：`createCustomerInputChannel` 按 `projectRoot` 串行——同项目同一时刻只呈现一张待客户决定卡；后续请求**入队、不调用 presenter**（`queuedCount()` 可见），状态经 `onQueued(payload, waitingFor)` 外推，主进程推 `session:operator-queued`（载荷 `{...OperatorRequestPayload, waitingFor}`，preload `onOperatorQueued(cb)`）让 UI 显示「等待前一个决定」。第一张 resolve/取消/超时/会话失效后按到达序呈现下一张；排队项随 `signal` 中止出队（`unavailable`）、`rejectAllPending`/窗关时与活动卡一并 `declined` 清空（fail-closed）。**不自动合并、不自动批准**；排队中的 id 不可作答（`expired:true`）。`pendingCount()`/`pendingRoles()` **同时计入已呈现与排队中的请求**（排队中的角色同样在「正确等待客户」，看护 #1 不误报）；`queuedCount()` 单列排队数；`replayPending()` 重推已呈现卡与排队状态行（不呈现排队卡）。适用范围＝本通道全部请求：仅内置治理角色（trio 三人与 su）会注入该通道，项目角色从不经过；single/su 语义不变（仅有并发卡时串行化）。

**四角色 W6-B（2026-10-18；评审 `2026-10-18_design_governance-liaison-review.md` §5.3/§5.4/§6.1/§7.2）**：

- **能力路由**（`SessionManager.open`，按 `governanceFunction`，不硬编码 id）：`liaison` 只注入 `handOffIntent`（**不注入 `customerInput`**——Liaison 只用聊天，`request_confirmation`/`request_choice` 结构性不存在）；`proposal`（Rapporteur）注入 `customerInput` + `requestClarification`；`nomination`（Nominator）安装能力不变；`schedule`（Convener）派发/看护/恢复/只读 shell 不变；single/su 旧能力集逐字不变（两新能力不注入）。`SessionManagerDeps.openRoleSession` 入参新增 `handOffIntent`/`requestClarification`，原样透传编排。
- **意图交接投递端**（`deliverIntentHandoff`）：编排已完成意图文件/去重/每轮一次校验并写 `intent.handed-off`（**编排唯一写入者；桌面不重复写**）；桌面在收到成功派发的载荷后**后台**打开 Rapporteur（`openBackground`，同引擎）→ `sendBackground` **唯一一条**任务（模板 `buildIntentHandoffMessage`：引用 `docs/intents/<intentId>.md`、声明「意图记录不是客户批准」、要求用提案卡/澄清，附 `summary`）→ 成功系统行「已交给报告员（工作中）」/「报告员工作中，已排队」；**投递成功后**写账本 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"intent-handoff", targetRoleId:"rapporteur", intentId, flowId?, messageSummary≤200, runtime}`（失败不写、账本不可写只记诊断，均不重试）。失败系统行「应用无法把意图交给报告员：<原因>；未重试」并回执 `{ok:false}`。**不抢 `activeRoleId`/不切 pane、不重试、不自动批准**。**有界（2026-10-26 客户反馈「20s 超时误报」）**：打开/投递各受总预算（缺省 45s）+ 阶段预算（缺省 = 总预算 45s，`SessionManagerDeps.handOffIntentLimits` 可注入）约束。投递超时后先对账目标会话：`isRoleBusy || hasPendingDelivery` ⇒ `{ok:true}`（「已交给策划（工作中）」+ 系统行 + `dispatch.accepted` 审计；晚到失败仅诊断/补系统行，不翻转回执、不重复写账本）；目标既不在跑也无排队 ⇒ `{ok:false}` 如实回执 + 系统行；打开超时说明「可能仍在启动，未投递」。**目标忙时 `sendBackground` 入队（`queued:true`）即成功，绝不等待空闲**。
- **意图交接前自动创建流程骨架**（2026-10-26 客户反馈）：`deliverIntentHandoff` 投递前调用 Pipeline 公共出口 `ensureFlowSkeleton`（`SessionManagerDeps` 无新增导出；实现为私有 `ensureIntentFlowSkeleton`）：按 `docs/intents/<intentId>.md` frontmatter 的 `flowId`（缺失回落 `intentId`）与 `qualityTier`（缺失/非法回落 `production`）**幂等创建** `docs/flows/<flowId>.yaml`（`status: skeleton`，仅通用步骤；已存在不覆盖）；失败只诊断、不阻断交接、不写 `.ans`/账本。`interface.ts::advanceGovernanceFlow` 只读解析现有 flow YAML，`status === FLOW_SKELETON_STATUS`（Pipeline 公共出口常量，不复制字面量）时向 `buildGovernanceAdvanceMessage` 传 `flowStateSkeleton`：提案接受后的 Convener 文案改为「写团队计划 → `request_confirmation(cardKind=schedule-write)` 一次性替换为完整流程（保留 contract-freeze 证据、去掉 status: skeleton）」；完整 flow / 无 flow 的既有文案不变。
- **澄清送达端**（`deliverClarification`）：编排已判两轮上限并写 `clarification.requested`；桌面只在主入口（`primaryRoleId`，trio=liaison）落系统行「报告员需要澄清：<question>」。**不弹决定卡、不占「一项目一卡」队列、不改权力/写权**；客户在 Liaison 回答后由 Liaison `hand_off_intent{handoffKind:"clarification"}` 再交接。
- **决定卡镜像**（`OperatorRequestPayload.mirrorRoleId?` + `governance-advance.ts::isMirroredGovernanceCard`）：仅 `governanceModel === "trio"`、卡片种类为 `proposal`/`appointment`/`appointment-write`/`schedule-write`/`acceptance`/`write`、且来源角色 ≠ `primaryRoleId` 时给出主入口 id；无 `cardKind`/single 不镜像。**2026-10-18 真机反馈**：报告员的写入确认卡（`write`）必须能在联络官作答，故 `write` 纳入镜像——本条**覆盖**评审 §6.1 原表「write 不镜像」；仍仅 trio 治理角色会走该通道（项目角色从不注入 `customerInput`）。**同一请求 id、同一份 pending、同一个 respond 只结算一次**——第二次作答返回 `expired:true`（两侧冻结）；只有 active 卡调用 presenter（排队卡不物化，只走 `onQueued` 聚合行）。不改卡片内容/选项/审计，不产生第二份账本决定或第二次 `onNextStep`。IPC 仍走既有 `session:operator-request`（载荷原样透传，`onQueued` 的 `{...payload, waitingFor}` 同样携带）；`main.ts`/`preload.cjs` 无需新增通道。
- **审计**：`dispatch.accepted`（应用推进）与 `intent.handed-off`/`clarification.requested`（编排写入）都**不是客户批准**；三者均不写 `customerDecision`/`decisionEvidence`。
- **真机阻塞修复（2026-10-18）**：① **任一内置治理角色（liaison/rapporteur/nominator/convener）`settled` 后**，Interface 异步 `listProjectFn` → `listingCache.set` → `emitProjectChanged`（同项目串行 + 突发合并；失败只记诊断，不打断会话/事件外推）——Nominator 同一轮写出的角色卡随即对 `role_status`/`dispatch_task` 可见。② `role_status` 的指定角色 miss、`routeDispatch` 的目标 miss ⇒ **强制刷新一次再重试**（只一次，仍缺才如实拒绝）。③ `advanceGovernanceFlow`：来源角色本轮仍在跑（决定卡在本轮中途作答）⇒ 先 `waitForRoleSettle` 等其 `settled`（一次、上限 60s；超时/会话释放只记诊断后继续），再刷新 listing，然后才后台派发——不循环重试。会话释放时等待者按 `false` 结算，不悬挂。（2026-10-22 第 1 项起 appointment 决定**直接派 Crew 写卡**；写卡结构校验通过后才派 Convener 做 `role-readiness`，见上节。）

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

**审批档展示角色化（2026-10-19 客户反馈）**：新增导出 `approvalRoleDisplayName(roleId?, displayName?)`——single/su、缺省、非内置 id ⇒ `"SU"`；trio 内置治理角色（liaison/rapporteur/nominator/convener/verifier）⇒ 门禁引擎注册表显示名（`Lead / 主理` … `Proof / 验收`；经 Service 公共出口 `resolve-boundary.ts::governanceRoleOf` 只读消费）。`plainReasonFor(reason, roleDisplayName?)` 与 `buildShellConfirmRequest(id, display, roleDisplayName?)` 把审批档人话改为「<角色名> 审批档：<tier 人话>——…」（三条必备披露不变）；`createShellConfirmPresenter` 按 `metadata.roleId` 解析后构建卡片。**内部 `reasonRaw` 的 `su-审批档[tier]` 前缀、`tier`/`policy` 值与解析语义逐字不变**（解析兼容）；项目角色 `policy=project`，不显示治理角色名。

**2026-10-18 客户裁定（第一层规则不拒绝任何请求）**：c 规则只快速放行/作参考，**所有拒绝由判断 agent 做出**；risky/review/deny 均交给 (a)。桌面 (a) 通道对 deny 档**同样调用 judge**（无 tier 短路）；结果行/审计保留 c 规则判定（`policy/tier`）与 judge 结论（`verdict/reasonCode`）；诊断 `shell-judge.decision` 以 `decision:"<policy>:<tier 或 null>:<verdict>"` + `outcome` + `reasonCode` 同时保留两者。single/su 旧路径（开关关/无 judge）逐字不变。

**会话装配（`app/desktop/session.ts`）**：每会话用**同一份** `runtimeOptions` 与已构造的 `createAdapter` 工厂经编排 `createShellJudge` 生成闭包（`SessionManagerDeps.createShellJudge`；Interface 缺省注入真实实现，经 `govern-session.ts` 薄再导出，**不直接导入私有 `common/编排/`**）；构造失败 ⇒ 不注入（回原 present）。`LiveSession.lastUserText` 在**真实投递**（直发/出队/派发/回交）时写入，UTF-8 ≤4096 字节（超出截断、不据此 manual）；`metadata` 在调用当刻从活会话读取 `turnText`/`judge`；会话 `dispose` 即清两项。三人（su/项目角色）共用；不改既有 shell 审批档/三层链。

## 双开关「替我审批」/「替我决策」（P4，2026-10-18；PM 评审 §三/§四/§八/§九/§十二）

**两个开关是两套独立状态**（同一 `createShellJudgeSwitch()` 实现，**不同实例**）：都默认 `false`、只在主进程内存、启动/渲染重载 `loadInterface()` 复位、不持久化、互不影响。组映射唯一来源＝`src/model/runtime.ts::GOVERNANCE_CARD_GROUP`/`governanceCardGroup`（桌面不再写第二张表）：`write`/`appointment-write`/`schedule-write`→`approval`；`proposal`/`appointment`/`acceptance`/`intent-confirm`/`decision`→`decision`。

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
- 结果行人话摘要 `judgeResultSummary(payload)`：`judge 代批 · 代决策：接受提案（accept）/任命 <ids>/验收通过（accept）· 流程 <flowId>`；写盘族 `judge 代批 · 代审批：确认写入 <n> 个路径（…）`；`cardKind=decision` 的结果行为「judge 代批 · 代决策（自动代理）：已按唯一推荐项…不是客户本人选择」+ `main.decisionCard.notApproval`（决策卡不是验收、不是客户批准，也不构成验收/提案/任命决定，不触发 gate/验收）。

**会话装配（`app/desktop/session.ts`）**：`LiveSession.governanceJudge`；仅在 `governanceModel === "trio"` 且客户交互通道已接时，用**同一份** `runtimeOptions`/`createAdapter` 经 `SessionManagerDeps.createGovernanceJudge`（Interface 缺省真实实现，经 `govern-session.ts` 薄再导出）构造；构造失败 ⇒ 不注入。`customerInput` 闭包 ctx 增 `governanceModel/governanceJudge/turnText`（调用当刻读活会话），`metadata`（含编排计算的 `judgeContext`）**原样透传**；dispose 清空。single/su/Liaison 不注入。

**主进程（`app/main.ts`）**：客户通道 `judge.isGroupEnabled = group === "approval" ? shellJudgeSwitch.isEnabled() : decisionJudgeSwitch.isEnabled()`；`emitJudgeResult` 推 `session:operator-judge`（窗口已关时**抛错** ⇒ 通道降级 `row-failed`），并经 `desktop.emitJudgeProgress(payload)` best-effort 落主入口 Liaison 进度行（`emitSessionEvent` 的 `message`，`detail.source:"judge-decision"`；来源即主入口不重复、失败只诊断）。`advanceGovernanceFlow` **零改动**（代批成功仍经 `notifyNextStep` 触发）。

## decision 卡应用侧校验与「替我决策」默认推荐（2026-10-26 客户新增）

**发卡前校验（`customer-input.ts::evaluateDecisionCardRequest`，在任何 presenter/判断 agent/排队之前）**：结构规则（仅 trio convener、`kind:"choice"`、合法 `flowId`、至少 `DECISION_CARD_MIN_OPTIONS` 个选项、选项 `id` 非空且不重复、**恰好一个** `recommended: true`）**单一来源＝编排 `common/编排/decision-card.ts::validateDecisionCardRequest`，经 Pipeline 公共出口 `src/pipeline/orchestration/run-role.ts` 只读导入**；桌面包装不复制第二份判定，只做：① 共享 `applicable:false`（非 decision 卡）⇒ `ignore`（旧行为零变化）；② 共享 `ok:false` ⇒ 按 `reasonCode` 选 `main.decisionCard.invalid`/`noRecommended` 并以共享 `detail` 组文案；③ 桌面特有防线——内置治理角色发出「有 `recommended: true` 但完全没有 `cardKind`」的 choice 卡 ⇒ `missing-card-kind` 拒发（共享函数对缺 cardKind 返回 not-applicable；编排 trio 路径已有同向守卫，桌面覆盖 direct/legacy/single 通道）。任一拒绝由调用方返回 `{outcome:"declined", reason, notPresented:true}`：不调用 presenter、不排队、不占「一项目一卡」、不写账本、不带 `operatorId`——**不冒充客户拒绝**。请求对象原样透传，`options[].recommended` 不重建/不丢失；显式其他 `cardKind`/项目角色的 `recommended` 忽略。校验通过后 `ChannelEntry.decisionCard={flowId, recommendedOptionId}` 定格推荐项。`DECISION_CARD_MIN_OPTIONS`/`DecisionCardRejectReason`/`DecisionCardValidation` 由本模块再导出。

**「替我决策」确定性默认推荐（`tryAutoSelectDecision`）**：`presentEntryNow` 先于判断门调用。条件全部满足才代选——发卡前校验通过、「替我决策」开关开（主进程权威 `isGroupEnabled("decision")`）、会话信号未中止、有可用运行时（审计 engine）、推荐项仍在卡上、`emitJudgeResult` 已注入且投达成功。满足 ⇒ **不调模型、不呈现客户卡**，直接结算 `{outcome:"answered", value:{selected:[推荐项]}, operatorId:"judge:<engine>", judge:{group:"decision", cardKind:"decision", engine, reasonCode:"recommended-default", selected}}`（**judge 代批，不是客户本人**），并发一条 `session:operator-judge` 结果行（`group/cardKind=decision`）。任一不满足/异常（开关关、结果行缺失或抛错、运行时缺失、推荐项被改写、中止）⇒ 返回 false，走既有 `presentNow` 客户卡路径，**绝不擅自代选**；`planJudge` 对 decision 卡显式返回 `undefined`（永不交给模型 judge）。

**结果/账本/下一步**：编排据 outcome 写 `customer.decision{decisionKind:"material-choice", customerDecision:"accepted", selectedOptions:[选中项]}`（judge 代选 `decisionEvidence.kind="judge"`；客户手选 `"customer-input"`），独立于提案/任命/验收：不写 `acceptance`/`proposal-*`/`appointment`/`targetRoleIds`，不被 gate/`latestAcceptanceDecision`/flow `customer-decision` 证据识别；桌面 `deriveGovernanceNextStep` 对 decision 返回 `null`（`onNextStep` 零调用），验收分诊前闸只对 `acceptance` 卡。**客户手选系统行**（`main.decisionCard.selectedRecommended`/`selectedOther`）本批未新增 IPC，由既有 `request_choice` tool 回执与卡面 `ui.decisionCard.notApprovalBadge` 承担（见变更记录 §五-1）。


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

- `  当前轮：进行中（已耗 X / 看护检查时限 Y；turnId=…；1 小时最后兜底）`——仅在快照有 `turnStartedAt` 时给出；X/Y 经 `formatDurationMs`，时限求值与看护/会话运行时同一来源 `resolveRuntimeTimeouts`（`promptTimeoutMs`＝**到点检查时限、不中止本轮**，缺省 **300000ms（5 分钟）**；`turnLastResortMs`＝运行时 1 小时最后兜底。2026-10-21 起看护**默认不自动中止**：仅显式 `ANS_PI_PROMPT_TIMEOUT_MS` 正整数且自动开关开启时，该值同时作为看护自动中止时限）；turnId 缺失时显示 `—`；**不再使用「硬超时」**。
- `  上一轮终局：<outcome> @ <at>（不表示当前轮；该角色近 15 分钟 failed/timed_out 计 N）`——历史终局显式标注，不得读成当前轮。
- `busy=false` 时保持原样 `  最近一轮：<outcome> @ <at>（该角色近 15 分钟 failed/timed_out 计 N）`。
- 历史统计（近 15 分钟 failed/timed_out 计数）保留，语义仍是历史统计。

看护 #1 `turn-deadline`（客户裁定 2026-10-17）：阈值为 `TURN_DEADLINE_RATIO = 1.0`（**到点检查**，非 90% 预警）；事实行给出「看护检查时限 Yms；到点仅检查、不中止本轮」＋「用 role_status / session_tail 核对是否卡死；仍在推进则不动作；卡死才 propose_recovery」＋「整轮最后兜底 1 小时（运行时硬上限，不是看护自动中止）」；看护自动中止**默认禁用**，仅显式配置时限且开关开启时出现；summary 与文首为「轮次到点检查」。**不得**再出现「逼近超时/已超时/尚未超时/硬超时/剩余约」等旧话术；挂起确认卡/su 忙排除、每轮一次不变。**解除（轮次结束）时不投「看护恢复」行**（到点检查不是故障，恢复行会误导）——只复位活跃期并留 `watchdog.recovery` 诊断；正常完成/空闲不再产生任何会话消息。

`system` 第四类投递：`DeliveryItem.kind` 增 `"system"`（看护告警/收束/恢复回执）；来源标注恒空、正文文首定格 `[系统·<子类>] `（U1 tool-rows.js 归类判据）；**不可撤回**；去重键看护自持命名空间（`watchdog\0…`）；失败保留待重试＋如实系统行。队列快照 `queue` 条目类型补 `id/full`（如实对齐运行时输出）。

看护器：tick 默认 30s（`ANS_DESKTOP_WATCHDOG_TICK_MS`）、静默默认 30s（`ANS_DESKTOP_WATCHDOG_SILENCE_MS`）——**仅 env 可调**；信号 #1-#4（#1 `turn-deadline`＝**到点检查** `TURN_DEADLINE_RATIO=1.0`，**默认只提示不中止**（`DEFAULT_TURN_ABORT_MS=0`；仅显式 `ANS_PI_PROMPT_TIMEOUT_MS`/测试覆盖且开关开启时自动中止）；整轮最后兜底 1 小时为运行时硬上限；其余阈值＝设计 §3.2 默认）；去重/冷却/风暴护栏（15min≤5＋通告＋`watchdog.suppressed`）；`watchdog.failed`／`watchdog.alert`／`watchdog.recovery`／`watchdog.closure` 诊断；`DesktopInterface.startWatchdog()/stopWatchdog()`（窗口注册后启动、窗关停止；看护缺席 ⇒ 一切照旧）。新增 deps：`recoveryConfirm`、`watchdogObserver`、`watchdogPendingConfirmations`、`watchdogStats`、`now`（注入时钟）。

### Phase 5A 渲染入口、dev/prod 与导航兜底（2026-10-21）

- **入口唯一事实源** `app/desktop/renderer-entry.ts`（5B）：唯一 `RENDERER_RELATIVE=["renderer","dist","index.html"]` 与 `resolveRendererEntry(appDir)`；旧 `renderer/index.html`/`dist/src` 常量已删除；`app/main.ts`、`test/桌面应用/e2e/main.mjs` 与 packaged smoke 共用。无 preload/IPC 变更。
- **加载策略**：生产 `loadFile`；dev 默认文件入口，仅 `!app.isPackaged` + `ANS_DEV_SERVER_URL`（http/https、localhost/127.0.0.1/[::1]、无凭据）时 `loadURL`，8s 限时，`did-fail-load`/rejection 同一守卫一次性回退已构建入口；回退后本窗口重载直接文件入口；未构建 ⇒ 恢复页。诊断 `window.renderer.target`（`mode:"file"|"dev-url"` + `path`/`url`）、`window.dev-server.fallback`（`reasonCode`/`errorCode`）、`window.dev-server.rejected`（非法 dev URL，仅一次）。生产 CSP/webPreferences 未改。
- **packaged smoke**：`--ans-packaged-smoke <abs.json> --user-data-dir=<abs> [--ans-renderer-entry=<abs .html>]`；入口覆盖仅随冒烟生效、必须位于包内 `app/renderer/dist/`；检查项 `entry/rootMounted/driver/csp/cspViolations/dom/preload/ipc/importDisabled/missingConfiguration/settingsEntryDisabled/envPathMatches/console/load`（无项目时 `#tab-pi` 禁用替代旧「打开设置」）。
- **导航兜底（PM §17.12）**：`installNavigationGuard`（`app/desktop/navigation-guard.ts` + `navigation-policy.ts`）在每窗口安装 `will-navigate`/`setWindowOpenHandler`：同 URL/允许入口放行；http(s) 经 `shell.openExternal` 外开；file/data/javascript 等阻止且不执行；`window.open` 恒 deny；与渲染侧 `app:open-external` 共用 1.5s 去重闸（防双重外开）。行为与真实 Electron 探针见 [Phase 5A 变更记录 §五之二](docs/change/2026-10-21_change_ui-platform-phase5a-entry.md)。

## Phase 5A main.mjs G4/G3 重锚与新检查（2026-10-21，PM §19）

`test/桌面应用/e2e/main.mjs`（桌面窗口属主）在既有 323 log + 22 repairCheck 名之外，新增/重锚以下等价检查，均不改判据：

- 单计数/状态：`ROLE_STATE_BADGE_SINGLE_COUNT_WORKING`（`.ti-count`=当前+排队、状态-only）、`ROLE_STATE_QUEUE_ROW_WORK_OVERVIEW`、`RIGHT_QUEUE_SOURCES_WORK_OVERVIEW`、`BADGE_ROLE_SINGLE_COUNT_WHILE_COLLAPSED`、`BADGES_CLEAR_ON_EMPTY_NEW`。
- P1/定位：`P1_ARRIVAL_DEBUG_NEW`、`P1_SECOND_CARD_LOCATE_VIA_WORK_OVERVIEW`；既有 P1 到达/滚动/chip 定位/计数/清理/切回检查改为按 `[data-request-id]` 查询新 `.chat-row` 嵌套（同名保留）。
- 回交/报告/抽屉：`INJECTED_CHIP_DELIVERY_LABEL`、`REPORT_DELIVERY_INLINE_BODY_NEW`、`DRAWER_CLOSED_AFTER_PI_NEW`、`DISPATCH_ROW_NO_WITHDRAW_NEW`。
- denied/replay：`HAS_DENIED_INLINE_ANY`、`DENIED_REASON_VISIBLE`、`REPLAY_DEDUP_REBUILD_UNIQUE_TEXT`。
- 空态/状态字段：`BOOTSTRAP_EMPTY_STATE_SINGLE_TITLE`、`BOOTSTRAP_EMPTY_STATE_ACTION_OR_REASON`、`STATUS_LAST_EVENT_FIELD_NEW`。
- 诊断：`DIAGNOSTIC_EVENTS_COVER_OLD`（`renderer.event-error/viewport/replay/recovery` + `window.renderer.gone`）。
- SWITCH_CONFIRM_ON_BUSY/SWITCH_CONFIRM_RELOADED/SWITCH_IDLE_HINT 为 OLD-ONLY/REMOVED，由 P13 7 项覆盖；`P13_NEW_SEMANTICS` 退役。

最终：new `E2E_PASS=true`/`E2E_FAILURES` 空；old 仅 `RECOVERY_SAME_PENDING_CARD_ONCE`（C/G4-RESOLVED）。逐名映射见 [Phase 5A 变更记录 §十](docs/change/2026-10-21_change_ui-platform-phase5a-entry.md)。

## 5B 步骤 c（2026-10-21）

生产入口切换为包内 `app/renderer/dist/index.html`；main.mjs 默认同入口并保留 `ANS_RENDERER_ENTRY` 覆盖；packaged smoke 期望包内 dist 入口（smoke-only 覆盖仍限 `app/renderer/dist/`）。旧段退役：`hot-path.test.ts` 保留 push-batcher/事件风暴/哈希缓存 3 项（旧 renderer/vendor Markdown 段删除）；`message-queue.test.ts` 保留主进程队列 14 项（旧 renderer/styles/role-status 源钉删除，新增新渲染器 `chat/ipc.ts` `session:role-state`/`applyRoleState` 源钉）。详见 [变更记录 §十一](docs/change/2026-10-21_change_ui-platform-phase5a-entry.md)。

## i18n B0 应用级语言偏好（2026-10-23，任务 `2026-10-23-i18n`）

实现 [变更记录](docs/change/2026-10-23_change_i18n-b0.md)。本批只做 B0 基础设施（偏好文件、IPC/preload、窗口/对话框/启动错误框、主进程 translator）；主进程系统行/应用错误的批量迁移属 B3，**本版未做**。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getPreferences() | preferences:get（无参） | `{version:1, locale:"zh-CN"\|"en-US", supported:string[]}` |
| setLocale(locale) | preferences:set-locale `{locale:string}`（桥内只透传字符串；非法值由主进程拒绝） | `{ok:true, locale}` \| `{ok:false, locale:当前, error}` |
| onLocaleChanged(cb) | 订阅 preferences:locale-changed（主→渲；成功持久化后） | `{locale}`；返回取消订阅函数 |

- 偏好文件 `<userData>/ans/preferences.json`，形状 `{version:1, locale}`；写入用共享 `atomicWrite`（唯一实现）；**首次启动无文件不写**，用户切换时写；损坏/不可读/非法 locale/未知 version/不可写 ⇒ `zh-CN` + **稳定诊断码**（`preferences.read.invalid` / `preferences.locale.invalid` / `preferences.write.failed`，附 `reasonCode`/`errorCode`），不阻塞启动；**不写项目 `.ans`/`.env`/治理账本**，不读真实凭据。
- `DesktopDeps`：`preferencesPath?`（缺省不持久化，`setLocale` 如实失败）、`mainI18n?`（main.ts 与 Interface 共享同一实例）、`onPreferencesDiagnostic?`。`DesktopInterface.getPreferences()` / `setLocale(input)` 为纯逻辑；`registerPreferencesIpc(registerHandler, desktop, {onLocaleChanged})`（`app/desktop/interface.ts`，不依赖 electron，可注入假 registrar 测试）注册 `preferences:get` / `preferences:set-locale`，**只在 `ok:true` 后**调用 `onLocaleChanged`（失败不广播）。
- `app/desktop/i18n.ts`：`createMainI18n()`（`t` 在调用当刻读当前 locale；`setLocale` 只更新内存，持久化归 preferences）、`desktopTexts()` 统一取 `main.window.title`、`main.dialog.importProject.title`、`main.dialog.pickImage.title`、`main.error.startup.title/detail`。main.ts 在成功切换后 `win.setTitle` 并按 `BrowserWindow.getAllWindows()` 广播 `preferences:locale-changed`；推送/标题失败只诊断，不翻转已成功的回执。
- **历史不追溯**：已生成的系统行/会话历史/报告保持生成时语言；切换只影响之后新生成的文本与 UI chrome。B0 覆盖窗口标题、导入项目/选择图片对话框标题、启动错误框与偏好通道；真实 Electron 重启/切换证据待 I9（独立测试/验收），本记录不声称完整 i18n 验收。

## 目录级授权 v3 桌面契约（2026-10-23，任务 `2026-10-23-directory-ownership`）

实现 [变更记录](docs/change/2026-10-23_change_directory-ownership.md)。桌面**只消费**编排公共出口 `src/pipeline/orchestration/run-role.ts`（`parseTeamPlan`/`teamPlanIssueMessages`/`writesetsOverlap`）与共享路径原语，不复制 v3 解析；v1/v2 行为与文案逐字保留。

- `TeamPlanInfo`：`teamPlanSchema: 1 | 2 | 3`；v3 视图字段 `directories: string[]`（frontmatter `directories`）、`directorySpecs: DirectorySpec[]`（目录规范表）、`moduleList: TeamPlanModule[]`（含模块 `implementationDir`）；`TeamPlanRoleRow` 增 `authorizedDirs`/`preciseWritesets`（`WritesetEntry[]`，v1/v2 为空）。
- `parseTeamPlanInfo`：经公共出口 `parseTeamPlan` 单一解析；v3 返回 `teamPlanSchema: 3`；v2/legacy 输出与桌面旧门槛文案不变。
- V12（`validateAppointmentArtifacts`，Crew 写卡后、readiness 前）：
  - 每个计划 `授权目录` 必须被该角色 `boundary.yaml` 的 `directory`/`conditional-directory`（same/ancestor）覆盖；每个 `精确写集` 必须被 `file` 或 `directory` 覆盖；
  - `new`：boundary 目录条目（排除 `角色卡/<roleId>/` 角色根）与计划授权目录集合一致（不得更宽/更窄），违反阻塞；
  - `changed`/`existing`：计划 ⊆ 边界；更宽部分在该角色模块实现目录内可接受，越出/多模块扩张 → warning + readiness；`existing` 宽边界只 warning + 迁移提示，不强制重写；
  - 来源分流：Crew（boundary 条目/覆盖/一致性）vs Convener（目录规范/模块实现目录缺口）；任一阻塞不派 readiness、不写 readiness 账本；
  - v2 V12 逐字不变（精确写集必须被覆盖；existing 只 warning）。
- 提案接受后的 Convener 任务文案：**新流程默认 v3**（frontmatter `teamPlanSchema: 3` + `directories`、模块 `实现目录`、角色表 `授权目录`+`精确写集`、目录规范表、readiness 逐目录 `directories/spec/shared/layout`）；已有 v1/v2 计划续接（调用方显式传 schema）时原 v2 文案逐字保留。计划修正反馈与「修订计划」系统行按实际 schema 提示 v3/v2。
- 任务文案（`governance-advance.ts`）：`teamPlanSchema?: 1 | 2 | 3`；仅 v3 追加授权目录+精确写集写边界、`new` 一致、`changed`/`existing` 覆盖、目录规范/共享/治理关键路径、readiness 逐目录 `directories/spec/shared/layout`、验收布局核对报告 + 原始 `git status`/`diff`；v1/v2 文案逐字不变。发给 agent 的任务文案本轮不翻译（i18n B3 只翻译用户可见系统行）。

## i18n B3 主进程用户可见文本（2026-10-23，任务 `2026-10-23-i18n`）

实现 [变更记录](docs/change/2026-10-23_change_i18n-b3.md)（状态 `implemented-unverified`）。本批只迁移 `app/desktop/` 中应用生成、最终显示给用户的文本；**不新增 IPC 通道、不改载荷形状**。

- `app/desktop/i18n.ts` 新增进程级绑定：`mainT(key, params)`（当前 locale 翻译入口；`createMainI18n` 实例即读取目标）、`mainLocale()`、`type MainTranslate`。`main.ts` 直接构造的 customer-input / operator-channel / 确认卡同进程读取 `mainT`，无需新增注入；`main.ts`/`preload.cjs` 未改。
- `app/desktop/diagnostics.ts`：`renderRecoveryPage()` 按当前 locale 生成恢复页；`RECOVERY_PAGE` 改为 ESM live binding（`let`），Interface 在构造与 `preferences:set-locale` 成功后调用 `refreshRecoveryPage()`；`main.ts` 既有 `RECOVERY_PAGE` 引用不变。
- 生成点：`session.ts`、`interface.ts`、`governance-advance.ts`（仅系统行）、`customer-input.ts`、`operator-channel.ts`、`watchdog.ts`、`runtime-history.ts`、`session-history.ts`、`project.ts`、`runtime-config.ts`、`runtime-resolution.ts`、`composer-images.ts`、`confirm-card.ts`、`recovery-channel.ts`、`judge-reason.ts`、`chat-adapter.ts`（demo）；key 取共享目录 `main.*`（个别复用 `shared.common.*`/`ui.judge.*` 既有 key）。
- **非目标**：发给 agent 的任务文案/提示词、`role_status`/`session_tail` 输出、外部错误原文（`{detail}` 参数）、诊断/日志文本、机器标识/协议标记、角色卡/团队计划 schema 词汇、B4 的 `RUNTIME_LABELS`。缺 key 已由 PM 批次 `2026-10-23_change_i18n-b3-key-supplement.md` 及后续两项补齐（23 新增 + 5 复用）并在生成点接线；按 PM 指示保持中文的 agent-facing 项：`install.actionChanged/actionReverted`、`manualJudgeDenyConnector`、`addRoleCardsStep`、`flowStateValidationFailed`。`roleCardsStepMissing` 通过 `AppointmentArtifactIssue.userVisibleIssue` 分离 agent 任务与 Lead 摘要（agent 正文保持中文，指纹输入不变）；`dispatchModelNote` / `teamPlanMissingBoundHint` 已接线，`targetLabel` 复用 `ui.role.governance.crew.name` / `ui.role.governance.steward.name`。
- 验收证据：`node --test` interface 118/118、operator-wiring 53/53、全量桌面 555/555、`npm run typecheck` 0；真实 UI/布局（I9）待独立测试/验收。

## 2026-10-25 治理反馈客户投影（聊天面板调整 A3/A4）

计划 [实施计划](docs/design/2026-10-25_plan_chat-panel-adjustments.md)。**不新增 IPC/preload 通道、不改事件 kind/信封形状**；只在既有 `prompt-input` 消息事件的 `detail` 上新增**可选**字段 `clientProjection`。

- 类型（`app/desktop/session.ts` 导出 `GovernanceClientProjectionV1`）：
  `{ version: 1; kind: "governance-feedback"; fingerprint: string; sourceRole: { roleId, displayName }; statusCode: "completed"|"failed"|"aborted"|"timed_out"|"unknown"|"internal-feedback"; statusText: string; flowIds?: string[]; reportPath?: string; governancePath?: string; action: "report-ready"|"await-lead-summary" }`。
- 生产者：`SessionManager.mirrorGovernanceFeedback` 在向 Lead 投递 `[系统·治理反馈]` 任务**成功（含 queued）后**登记投影（键 = `projectRoot+roleId+runtime` + 任务文本 sha256；有界 128 条 FIFO + 30 分钟 TTL，只在内存）。Proof：`statusCode` 取本轮 `outcome`（缺省 `unknown`）、`statusText` 取既有 `PROOF_STATUS_TEXT`（缺省「已结束」）、带 `flowIds/reportPath/governancePath`、`action:"report-ready"`；非 Proof 内置：`statusCode:"internal-feedback"`、`statusText:"内部反馈"`、`action:"await-lead-summary"`，不编造报告路径。
- 消费者：事件消费循环对 `detail.source === "prompt-input"` 且文本逐字命中的消息事件，把投影并入外推事件 `envelope.event.detail.clientProjection`；`detail.text` **内部原文原样保留**（审计/可折叠）。未命中（普通消息、文本被计划改写、重启/回放行）⇒ 事件与旧版逐字相同；渲染侧回退到既有文本归类。
- `fingerprint`：`sha256(canonical{kind, sourceRoleId, statusCode, flowIds(排序), reportPath, governancePath, textHash})`——同来源/同状态/同流程/同指针/同正文相同，供 UI 合并连续状态行（×N）。
- 非目标：不持久化投影（恢复/回放回退文本归类）；不改 renderer；不参与任何判定、不自动验收。
- 验收证据（实施后）：`test/桌面应用/session.test.ts` 新增投影用例；桌面套件与 typecheck 结果见变更记录。

## 会话级后台任务 IPC（2026-10-25，任务 background-task-session-access）

运行时核心已实现 `RoleSession` 三个**可选**方法（`listBackgroundTasks?/readBackgroundTask?/stopBackgroundTask?`，类型在 `src/model/runtime.ts`），编排 `RoleSessionHandle`（`src/pipeline/orchestration/run-role.ts`）原样透传。本批把能力暴露到桌面 IPC/preload；**任务表/日志/pid 只在各会话内存**，桌面不缓存、不持久化、不伪造。

**聚合与寻址（`app/desktop/session.ts::SessionManager`）**：

- `listBackgroundTasks(projectRoot, runtime)`：遍历**当前已打开会话**中 `projectRoot+runtime` 匹配者，直接读 `handle.listBackgroundTasks?.()`；每项 = `BackgroundTaskSnapshot` + `roleId` + `runtime`。句柄无该方法 ⇒ 跳过该角色；**没有任何会话具备能力**（含无会话）⇒ `tasks:[]` + `unavailable:true`（区别于「有会话但当前没有任务」）。单会话读取异常只记诊断并跳过，不伪造任务。
- `readBackgroundTask({projectRoot,runtime,roleId,taskId,stream?,tailLines?})`：精确寻址活会话句柄；成功返回底层 `BackgroundTaskReadResult`（同一引用；`tailLines` 上限 200 与 `tailClamped/truncated` 由底层如实标注）。找不到会话 ⇒ `{ok:false,error}`（`main.session.releaseNoSession`）；句柄无能力 ⇒ `{ok:false,error}`（`main.backgroundTasks.unavailable`）；未知/已过期 taskId（底层 `undefined`）⇒ `{ok:false,error}`——不造任务、不造日志。
- `stopBackgroundTask({projectRoot,runtime,roleId,taskId,force?})`：底层 `BackgroundTaskStopResult` **原样返回**（成功 `{ok:true,task,alreadyEnded}`；失败 `{ok:false,reason:"unknown-task"|"closed"|"timeout",message,task?}`）——不改写成成功、不吞异常（底层抛错 ⇒ 如实失败并带原始消息）。找不到会话 ⇒ `reason:"closed"`；句柄无能力/底层抛错 ⇒ 桌面级 `reason:"unavailable"`（唯一新增 reason，其余值沿用运行时契约）。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| listBackgroundTasks(projectRoot, runtime) | background-tasks:list `{projectRoot,runtime}` | `{ok:true,projectRoot,runtime,tasks:[BackgroundTaskSnapshot+{roleId,runtime}],unavailable}` \| `{ok:false,error}` |
| readBackgroundTask(input) | background-tasks:read `{projectRoot,runtime,roleId,taskId,stream?,tailLines?}` | `{ok:true,result:BackgroundTaskReadResult}` \| `{ok:false,error}` |
| stopBackgroundTask(input) | background-tasks:stop `{projectRoot,runtime,roleId,taskId,force?}` | `BackgroundTaskStopResult`（原样）\| `{ok:false,reason:"unavailable",message}` |

- `app/main.ts` 三个 handler 各自校验 `event.sender === win.webContents`（不匹配回 `{ok:false,error:"请求来源无效。"}`），随后只透传；参数校验（非空 projectRoot/roleId/taskId、已知 runtime、`stream` 枚举、`tailLines` 正整数）在 `DesktopInterface`，非法即 `{ok:false,...}`，**不调用会话、不抛**。`app/preload.cjs` 只暴露上述三个白名单方法（不暴露 Node 能力；本批无主→渲推送/订阅，列表为拉取式）。
- 渲染层注意：`unavailable` 只表示「没有具备能力的活会话」，不能当作「没有任务」；任务仅会话内存（关闭会话/重启即消失，旧任务号读/停如实失败）；`state:"kill-timeout"` 表示**可能仍在运行**，不得显示成「已停止」；`stop` 的 `reason` 必须按 `unknown-task/closed/timeout/unavailable` 如实映射，`ok:false` 不得渲染成成功。
- 证据（实施后）：`test/桌面应用/session.test.ts` 新增聚合/读/停用例；`test/桌面应用/interface.test.ts` 新增参数校验、read/stop 透传与 preload/main 源级断言；`npm run typecheck` 0 错。

## 流程状态只读 IPC（2026-10-25，任务 flow-status-ipc）

把 `<projectRoot>/docs/flows/*.yaml` 的步骤进度暴露给渲染侧（流程状态面板）。**只读**：只做目录列举 + 读取 + 既有编排公共出口 `parseFlowStateYaml` 解析；不写任何文件、不碰治理账本、不改变 flow 的 revision。

| preload 方法 | IPC / 参数 | 返回 |
| --- | --- | --- |
| getFlowStatus(projectRoot) | flow:status `{projectRoot}`（桥内仅传字符串） | `{ok:true, flows:FlowStatusFlowView[], errors:{file,error}[]}` \| `{ok:false,error}` |

`FlowStatusFlowView = { flowId, revision?, steps: {id,title,kind,owner,status}[], counts: {total,done,delivered,dispatched,pending,failed,blocked,superseded}, current: string[], updatedAt }`。

- **方法**：`DesktopInterface.flowStatus(projectRoot)`（`app/desktop/interface.ts`）。`projectRoot` 非空字符串且为已存在目录，否则 `{ok:false,error: main.flowStatus.invalidProject}`；`docs/flows` 不存在（ENOENT/ENOTDIR）⇒ `{ok:true, flows:[], errors:[]}`（不是错误）；其余目录扫描失败 ⇒ `{ok:false,error}`（不抛）。
- **扫描与解析**：只认顶层 `*.yaml`（按文件名排序，回执顺序稳定）；`flowId` = 文件名去 `.yaml`；`parseFlowStateYaml(text, flowId)` 的解析/校验失败**逐文件**进 `errors`（`file` 为项目相对路径 `docs/flows/<name>.yaml`，`error` 为解析器摘要），不阻断其他文件；读取/stat 失败同样只进该文件 error。
- **字段**：`steps` 只保留 `id/title/kind/owner/status`；`counts` 由 `steps[].status` 计数（`total = steps.length`；`aborted` 不在计数键内、只计入 `total`）；`current` = `dispatched`/`delivered` 步骤 id，**按 YAML 步骤顺序**，可能为空数组；`updatedAt` = 文件 mtime 的 ISO 8601；`revision` = 文件内容 sha256（与编排 flow 工具 revision 同口径，只读派生）。
- **IPC/preload**：`app/main.ts` 的 `flow:status` handler 先校验 `event.sender === win.webContents`（不匹配回 `{ok:false,error:"请求来源无效。"}`），再从 `{projectRoot}` 取字符串透传 Interface；`app/preload.cjs` 只新增 `getFlowStatus(projectRoot)` 白名单方法（非字符串置空串，由 Interface 回 invalidProject；不暴露 Node 能力）。无主→渲推送/订阅，面板按需拉取刷新。
- **渲染层注意**：`current` 可能为空（没有在途步骤）；坏文件在 `errors` 单独列出而不是让整个调用失败（可展示「部分流程不可读」）；`revision` 是内容哈希、不是写者版本号；本调用是只读快照，不触发任何自动推进/验收。
- 证据（实施后）：`test/桌面应用/interface.test.ts` 新增 4 例（2 个 flow YAML——完整 + 坏 YAML——解析、counts/current、errors 隔离、无 `docs/flows`、非法 projectRoot、preload/main 通道与来源校验）；`npm run typecheck` 0 错；`node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` 602/602 通过。

## Gate 复核能力（`request_gate_review`，2026-10-26 客户追加授权）

**不是 IPC/preload 通道**：这是注入 convener 会话的运行时工具能力（工具、契约与编排注入属运行时核心/编排；本角色只提供应用侧实现）。设计依据 `角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md` §5.3–§8。

| 能力位（`SessionManagerDeps` / `openRoleSession` 入参） | 注入判据 | 实现 |
| --- | --- | --- |
| `requestGateReview?: (projectRoot, RequestGateReviewInput) => Promise<RequestGateReviewResult>` | `role.builtIn === true && governanceFunction === "schedule"`（仅 convener；项目角色与其他治理角色不注入） | `DesktopDeps.requestGateReview ?? requestGateReviewForProject`（`app/desktop/interface.ts`） |

- 冻结回执 code：`dispatched | already-dispatched | gate-not-found | criteria-missing | flow-incomplete | unavailable | rejected`（载荷/回执形状＝契约家 `src/model/runtime.ts`；桌面不复制）。
- 校验顺序：flowId 归一（唯一 YAML 才采用）→ flow 解析 → gate 存在且 `kind:artifact`+合法 `gateKind` → `pending` → gate 记录/flow revision/在途幂等 → dependsOn（supersededBy 链）done + `validateFlowEvidence` 对账 → 最新 criteria 含精确 gateId 的 Gate 标准节 → visual/integration 证据完整性 → 无在途 → 引擎解析 → 派 Proof。
- 持久化（app-only 写域，原子写）：`.ans/governance/acceptance/<flowId>/gates/<gateId>.json`（`gate-review-record/v1`，先写）+ 账本 `dispatch.accepted{stepId=<gateId>, targetRoleId:"verifier", trigger:"settle"}`。**投递回执超时（2026-10-27 客户反馈）**：先对账质检会话 `isRoleBusy || hasPendingDelivery`——在跑/有排队 ⇒ 继续写 gate 记录 + 账本并回 `dispatched`（文案如实说明“确认回执超时但在途、请勿重复请求”）；目标既不在跑也无排队 ⇒ `unavailable`，**不写假记录/假审计**。gate 记录写失败仍 fail-closed；**账本写失败只诊断、不翻转回执**（记录是恢复扫描源，回执如实附审计失败原因）。晚到投递结果只记诊断，不重复写记录/账本。
- 报告处置（settle/导入/账本事件经 `runAcceptanceCheck` → `processGateReviewsForFlow`）：pass ⇒ `completeGateStep` + `artifact.observed` + `gate.review` 审计 + pass 系统行；fail 含 blocker/major ⇒ 记录 `failed` + `gate.review(fail)` + `.ans/.../gates/<gateId>-rework-routing.json`（`gate-rework-routing/v1`）独立返工路由，gate 保持 pending；仅 minor/nit 的 fail ⇒ `returned-to-proof`、不返工；缺/坏/版本或候选不符 ⇒ `returned-to-proof`。**不写 `customer.decision`、不发验收卡、不标 done（pass 由 `completeGateStep` 应用收口）**；重启按记录幂等补处置，不自动重派/不自动通过。
- **恢复：有 pass 报告但缺 gate 记录（2026-10-27 客户真机 pixel-snake）**：同一扫描在读取既有记录前先补建——flow 的 gate 步骤仍 pending、记录缺失、最新 gate 报告存在且 `acceptance-triage/v1` 结构合格、结论为 `pass` ⇒ 写一条 `status:"dispatched"` + 当前 `flowRevision`/报告 path/version/sha 的 gate 记录（requestId 含 `-recovery-`），立即走既有 `processGateReportAttempt`（`completeGateStep` 收口 + passed 记录 + `gate.review` + `artifact.observed`，系统行标注“应用恢复”）。报告缺失/结构坏/fail 一律跳过（不建记录、不收口、不返工）。幂等：记录一旦存在即由既有记录分支处置，重复扫描不重复审计。
- 面元：`DesktopDeps.completeGateStepFn`（缺省编排公共出口 `completeGateStep`）、`requestGateReviewLimits`（总/单阶段预算，缺省 **45s/45s**）、`appendGovernanceLedgerFn`（测试注入审计失败）。
- 证据（实施后）：`test/桌面应用/acceptance-dispatch.test.ts` gate 组 16 例（派发/幂等/校验矩阵/注入/visual&integration/pass/fail/nit-only/缺坏报告/重启恢复 + 投递超时在途对账/超时无在途失败/pass 报告缺记录恢复/负例不恢复）；`npm run typecheck` 0 错；本文件 **99/99** 通过。

## 图片查看投递能力（`view_image`，2026-10-26 客户要求）

**不是 IPC/preload 通道**：这是注入会话的运行时工具能力 `view_image` 的桌面侧实现。契约形状单一来源＝`src/model/runtime.ts`（`ViewImageInput { path: string; image: PromptImage }`、`ViewImageFn = (input) => Promise<{ok:boolean;message?:string}>`）；桌面只读导入、不复制第二份。运行时核心工具已读取/校验项目内图片（路径句柄、realpath 根内、png/jpg/jpeg/webp/gif、≤10 MB）并给出 base64+MIME；桌面只负责**排队投递**。

| 能力位（`SessionManagerDeps.openRoleSession` 入参） | 注入判据 | 实现 |
| --- | --- | --- |
| `viewImage?: ViewImageFn` | **全部角色会话**（项目角色与内置治理角色；通用只读能力，不按角色收窄）；未注入 ⇒ 运行时核心不注册 `view_image` | `app/desktop/view-image.ts::createViewImageDelivery({target, send})`，`openInternal` 构造并在 `openRoleSession` 入参注入 |

- 目标定格：`target = { projectRoot, roleId, runtime }` 在开会话/重建时绑定；**不按 `activeRoleId` 改投**，不接受调用方指定别的角色。
- 投递：调用既有 `SessionManager.send(text, { images: [input.image] }, target, { background: true, kind: "system" })`——同一投递机：工具在本轮内（角色忙）⇒ 按到达序入队，settle 后按序投递；空闲 ⇒ 直发下一轮。`PromptImage` 对象原引用进入 `PromptOptions.images`。
- 文本（单一来源 `buildViewImagePrompt`）：`这是 view_image 请求的图片：<path>；请查看后判断`。
- 回执：直发/入队成功 ⇒ `{ok:true}`；会话不可用、传输失败 ⇒ `{ok:false,message}`（带底层原因）；空路径/无图片/图片结构非法 ⇒ `{ok:false,message}` 且**零投递**。绝不谎称已提供。
- 零回归：不冒充客户消息（`kind:"system"`，UI 显示「系统」、不可撤回）；不抢 pane；真实客户消息与 handback/dispatch 的 `images` 引用/语义逐字不变；不改变其他能力的注入矩阵。
- 不持久化排队中的图片载荷：应用在「已入队、未投递」之间重启 ⇒ 该条按文本恢复、图片丢失（P0-1 既有语义，本批未扩张）。
- 证据（实施后）：`test/桌面应用/message-queue.test.ts` 新增 4 例（system 入队/同角色/settle 按序/图片原引用；失败与非法载荷如实；客户消息图片零回归；真实 `openRoleSession` + 真实 `view_image` 工具集成）；`npm run typecheck` 0 错；`node --test "test/桌面应用/**/*.test.ts"` 675/675。

## 需求变更申请能力（`request_requirement_change`，2026-10-26 客户要求/纠正）

**不是 IPC/preload 通道**：这是注入发起方会话的运行时工具能力。契约形状单一来源＝`src/model/runtime.ts`
（`RequestRequirementChangeKind = "scope"|"authorization"|"constraint"|"cost"|"other"`、
`RequestRequirementChangeInput`、`RequestRequirementChangeResult`、`RequestRequirementChangeFn`）；桌面只读导入、
不复制。**客户纠正：需求变更不由主理审批**——审批由客户（未勾选「替我决策」）或独立判断 agent
（勾选时默认选唯一推荐项）在 `request_choice(cardKind="decision")` 卡上完成；审批卡由**统筹或提案**
发起/持有，发起方不得自批；主理只在批准后执行意图变更。规则见
`角色卡/项目管理/docs/project-rules.md` §二.15 与门禁引擎角色卡。

| 能力位（`SessionManagerDeps` / `openRoleSession` 入参） | 注入判据 | 实现 |
| --- | --- | --- |
| `requestRequirementChange?: (projectRoot, requesterRoleId, runtime, RequestRequirementChangeInput) => Promise<RequestRequirementChangeResult>` | `governanceFunction === "schedule"` **或** `"proposal"`（统筹/提案；其他内置治理角色、项目角色与 single/su 不注入） | `DesktopDeps.requestRequirementChange ?? requestRequirementChangeForProject`（`app/desktop/interface.ts`） |

- 冻结回执 code：`dispatched | already-dispatched | invalid | intent-not-found | flow-not-found | unavailable | rejected`（载荷/回执形状＝契约家；桌面不复制）。
- 应用侧校验顺序：`flowId`/`intentId` 各自须为 `GOVERNANCE_SLUG_PATTERN` slug 且至少一个 → **发起方白名单**（枚举角色须 `builtIn === true` 且治理职能为 `schedule`/`proposal`；否则 `rejected`，零票据零卡）→ `docs/flows/<flowId>.yaml` / `docs/intents/<intentId>.md` 存在（只校验显式给出的）→ `changeKind` 枚举 → `summary` ≤500 / `rationale` ≤4000 必填非空、`impact` ≤2000 / `proposedIntentPatch` ≤4000 可选（Unicode 码点，超长拒绝不截断）。非法 ⇒ `invalid` / `flow-not-found` / `intent-not-found`，**零票据、零卡、零投递**。
- 幂等：`requestId = "req-" + sha256(requestedBy + flowId/intentId + changeKind + 归一文本)[0..16]`；同一 flow（`scopeKey = flowId ?? intentId`）已有 `requested`/`dispatched`/`approved` 票据 ⇒ `already-dispatched`（`ok:true`，带既有 requestId；`approved` 时文案说明「已通过独立审批、主理执行中」），不重复呈现卡；进程内在途表（`canonicalRoot+scopeKey`）防并发重复。
- 票据（app-only 写域，共享 `atomicWrite`）：`.ans/governance/requirement-changes/<scopeKey>/<requestId>.json`，schema `requirement-change-request/v2`；字段 `schema/requestId/requestedBy（发起方：统筹|提案）/flowId/intentId/changeKind/summary/rationale/impact/proposedIntentPatch/status/at/updatedAt/attempts/submission/approval/leadDispatch/error`。状态机 `requested`（已登记）→ `dispatched`（审批卡已呈现，待审批；**不是批准**）→ `approved`（审批通过、已/正在交主理执行；仍在途）| `rejected`（审批明确 reject；终态）| `failed`（提交/通道失败或未获明确结果；终态）。`at` 保留首次登记时间、`attempts` 计数。
- **审批卡呈现**：应用经**发起方会话的客户卡通道**（`SessionManager.requestRequirementChangeDecision`；仅统筹/提案会话构造，绑定本会话 roleId/signal/治理模型/判断闭包与 `onPresented`）呈现 `request_choice(cardKind="decision")`：`title=main.requirementChange.taskLabel`、`question` 含票据行（`main.requirementChange.ticket`）与申请内容、`options=[approve(推荐), reject]`（**恰好一个** `recommended: true`，推荐 approve）、带 `flowId`。发卡前校验仍用桌面 `customer-input.ts::evaluateDecisionCardRequest` → 共享 `validateDecisionCardRequest`（单一来源；编排批次已把 `rapporteur` 纳入 decision 卡角色白名单，统筹/提案均可发）；`onPresented` 只在 presenter 成功后回调一次，用于区分「已提交独立审批」与「未呈现」。
- **审批结算（异步，不阻塞工具）**：卡已呈现 ⇒ 工具立即回执 `dispatched`（`main.requirementChange.dispatched`：已提交独立审批、申请 ≠ 批准、主理不审批）。审批结果返回后：`approve` ⇒ 票据 `approved` + 发起方系统行（`main.requirementChange.approved`）+ **已批准执行任务**交主理（`primaryRoleId`；任务头 `main.requirementChange.leadExecuteTask`，正文含审批证据/来源/范围/票据，要求主理核验后更新 `docs/intents/**` 并 `hand_off_intent` 通知提案修订；**主理不审批**）；`reject` ⇒ 票据 `rejected` + 回执发起方（`main.requirementChange.approvalRejected`，后台系统消息，失败回落可见系统行）；未获明确结果（取消/超时/通道不可用）⇒ 票据 `failed` + 同一回执。审批来源如实标注 `judge 代批` / 客户选择。
- 执行任务投递有界：总预算缺省 ≤60s、单阶段 ≤20s（`DesktopDeps.requestRequirementChangeLimits`）；主理忙 ⇒ `sendBackground` 入队（票据 `leadDispatch.queued:true`）仍成功；打开/投递失败/超时 ⇒ 票据 `leadDispatch.error` 如实记录 + 可见系统行，**不谎称已交接**。
- 失败如实：审批卡通道不可用/未呈现 ⇒ `unavailable`（或卡校验拒发时 `rejected`）+ 票据 `failed`，message 明说「未提交独立审批」；票据写失败（呈现前）⇒ `rejected`、零卡。**不向主理投原始申请任务、不写 `customer.decision`/治理账本、不改变任何写权**。
- 零回归：`requestClarification`（仍仅提案）与 `viewImage`（全部角色）注入矩阵/语义不变；其他内置角色/项目角色的 decision 卡仍拒发。`app/main.ts`/`preload.cjs` 无需改。
- 证据（实施后）：`test/桌面应用/acceptance-dispatch.test.ts` 9 例（校验矩阵、审批卡形状/通道、批准→主理执行任务、reject 回执、卡拒发、幂等含已批准、通道不可用重试、忙时入队、统筹发起 + 注入矩阵）；`test/桌面应用/operator-wiring.test.ts` 2 例（统筹/提案角色白名单与结构校验、真实通道呈现 + `onPresented`）；见本批变更/修复记录。

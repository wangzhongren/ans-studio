---
id: customer-authorization-plane-p1-proposal-desktop
type: change
title: 客户授权平面 P1 短实现提案（桌面窗口 C1）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: proposed-unimplemented
---

# 桌面窗口 P1 短实现提案：客户授权平面（C1）

- **任务**：`2026-11-03-customer-authorization-plane`（flowId `customer-authorization-plane`，T3）；本文件只是 C1 实现提案，**不写产品/测试代码、不运行实施测试、不 commit/push**。
- **基线**：分支 `feat/customer-authorization-plane`，HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；采集时 `git status --porcelain -- src app test` 为空。
- **输入**（Revision 1 写盘前实测）：团队计划 v1 653 行 / `37e6bd0d…` + §十三增补至 **664 行 / `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8`**（仅增补 C2 写集 `ConfirmCard.tsx`/按需 `shell.css`，C1 写集不变）；方案 **P1.1 闸门 1 确认版 1199 行 / `7875ad6a…`**，盘上 **P1.2 编辑性收口 1209 行 / `1748ad2d…`**（V1 §1.2.1 语义等价；**本提案按 P1.2 文本施工，冲突以 P1.1 为准**）；V1 1171 行 / `51ac0f50…`；B0 239 行 / `f1c54f09…`；P1 审核 193 行 / `65f888a6…`；沟通记录 168 行 / `9f19821e…`（含 W-1=A）；A1 修订稿 172 行 / `f2570291…`；B1 修订稿 242 行 / `0d98e200…`。**[事实]** 为只读核对；**[设计候选]** 为提案，未实施、需 P1 复审与冻结。

## 一、事实（只读核对）

- [事实] **边界已落地 B-4**：`角色卡/桌面窗口/boundary.md` Section 1 已有 `test/桌面应用/directive-input.test.ts`、`directive-decision.test.ts`；`boundary.yaml` 第 230/233 行同条目。`app/desktop/` 为目录授权，`app/main.ts`、`app/preload.cjs` 为单文件授权；`test/桌面应用/` 仍是逐文件授权。
- [事实] `app/desktop/interface.ts:2339-2371` 的 `sendSession` 当前只做图片真实字节重校验后调用 `manager.send`；全仓 `@审批`/`@决策` 无命中。
- [事实] `SendResult` 定义在 `app/desktop/session.ts:371-391`，当前无 `directive`/取消字段。
- [事实] Q9 桌面旧读者实际位置：`session.ts:2078`（run-change `decidedBy`）、`:4166-4199`（`request.resolved` 的 `judged`/`by`）、`:4470-4471`（`decidedByText` 窄联合）、`:4657-4660` 与 `:4691`（`version.decision.decidedBy`）；`requirement-change.ts:249、316-318`（`source` 联合与 `=== "judge"` 文案）；另发现 `interface.ts:1406-1411`（`RequirementChangeApprovalRecord.source` 映射）也是旧读者，未在方案 §9.2 清单逐条列出，但在本角色 `interface.ts` 授权内。
- [事实] `customer-input.ts:1426` 的 `tryAutoSelectDecision` 在 `:1489` `presentEntryNow` 之前执行；`:652` 状态联合为 `active|queued|judging|triaging|done`，无 `directing`；`:702` `activeByProject` 承担一项目一卡；`:1075` decision 卡不进入 judge。
- [事实] `main.ts:525-626` 是窗口作用域 IPC / `shellCardSlot` / `app:recovery-ready` 重推先例；`:877-884` 的 `app:list-project` 更新 `recoveryProjectRoot`；`:894` 是 `session:send` 透传。`preload.cjs:65-66` 发送、`:198-207` 操作者回包，当前均无指令通道。
- [事实] `recovery-channel.ts:62-112` 的 presenter/respond 签名与指令面板无关；若不复用其核心，可零改动。
- [事实] `boundary.md`/`boundary.yaml:99` 列有 `test/桌面应用/session.test.ts`，但该路径**未跟踪且文件不存在**；本提案不创建它，Q9 的 SessionManager 级断言放入 B-4 的 `directive-decision.test.ts` 或既有 `run-change.test.ts`/`version-decision.test.ts`。

## 二、设计候选：契约形状与单一来源

### 2.1 `Interface.sendSession` 命中拦截

[设计候选] 在 `interface.ts::sendSession` 入口先调用 A1 冻结的 `parseDirectiveMarker(text)`（纯函数、零副作用）；**命中且带图**直接返回专用错误（不解码图片、不投递、不落账）；**命中且无图**调用注入的 `directiveInput.submitFromInput(...)`，**绝不调用 `manager.send`/`handle.send`**；**未命中**继续走现有图片校验与 `manager.send` 原路径（调用参数、顺序、metadata、队列、ACK 不变）。`target` 缺失或 `directiveInput` 未注入时 fail-closed 返回 `{ok:false,error}`，不回退为发给幕僚。命中成功不产生角色轮次，也不设置 `inputAccepted`/`turnId`/`outcome`/`sessionCurrent`。

**卡内入口（P1-CAP-15，AC-22 协同）**：[设计候选] shell 卡待答时，C2 的 A2 卡内指令入口与 Composer 使用同一 `bridge.sendSession(text, images, target, {clientMessageId})`（卡内入口 `images=[]`），不新增 IPC/preload 字段；`sendSession` 只按本次 `text` 的标记与本次 `target` 判定，**不读取也不依赖 Composer 当前是否开会话、当前选中角色/target**。`target` 取卡载荷 `{projectRoot, roleId, runtime}`：`projectRoot`/`roleId` 必填且须通过主进程校验（`projectRoot` === 当前项目授权来源 `recoveryProjectRoot`，`roleId` 在当前项目 `ProjectListing.roles` 内，`runtime` 若提供须为有效 `RuntimeKind`）；命中即调用 `directiveInput.submitFromInput(...)`，**即使 Composer 未开会话或当前 target 不同，也不得回退 `manager.send`/`handle.send` 或普通聊天**。target 缺失必填项、非法值或跨项目 ⇒ `{ok:false,error}`（fail-closed：不落账、不投递、无回执），不回退当前选择；该路径同样不产生角色轮次，不写 `lastUserText`/`inputAccepted`/`turnId`/`outcome`/`sessionCurrent`，不发 `session:events`。

### 2.2 `SendResult` 与 `CustomerInputOutcome` 加法

[设计候选] `app/desktop/session.ts` 的 `SendResult` 只加两个可选字段（旧消费方忽略未知字段）：
```ts
directive?: { id: string; target: "approval" | "decision" };
directiveCancelled?: true; // 仅取消/关窗：{ok:false,error,directiveCancelled:true}
```
`CustomerInputOutcome.directive?` 由 A1 在 `src/model/runtime.ts` 定义，C1 **只消费**（候选形状 `{id, action}`）；C1 不复制定义、不新增第二个 outcome 字段。决策指令结算时 `operatorId:"directive:<id>"`，取消/失败不写入。

### 2.3 新增 `app/desktop/directive-input.ts`（应用层控制器）

[设计候选] 纯逻辑 + 注入 presenter，不 import Service/Provider；B1 的 Pipeline 公共句柄通过注入（缺省由 B1 公开工厂提供）。对外形状在 C1 冻结：
```ts
submitFromInput(input: { rawText; target; projectRoot; roleId; runtime; clientMessageId?; decisionGroupEnabled: boolean }):
  Promise<{ok:true; id; target} | {ok:false; error; directiveCancelled?:true}>;
respond(input: unknown): {ok:boolean; error?:string; expired?:boolean}; // directive:confirm-response
list(projectRoot): Promise<DirectiveListResult>; // 同 directive:list 双视图；projectRoot 只用于选本应用运行内的项目 runtime
revoke(input: {id; target; projectRoot?; roleId?; runtime?}): Promise<{ok:boolean; error?:string}>;
state(projectRoot): DirectiveStateView; // 含 directivesEnabled:true
replayPending(): number; cancelAll(reason): void; cancelProject(projectRoot): void;
```
- **请求快照**：pending Map 按应用生成的 `requestId` 保存 `{target, rawText, projectRoot, roleId, runtime, clientMessageId, prefill, decisionGroupEnabled}`；回包只按快照校验，**不信任渲染侧原文/target/字段**；未知/过期 id ⇒ `{ok:false,expired:true}`。
- **高危复核（P1-CAP-04）**：主进程在 `sendSession` 命中时读取 `decisionJudgeSwitch.isEnabled()`（即 `isGroupEnabled("decision")`）作为**提交当刻快照**；同一值存入快照、随 `SubmitFromInput.decisionGroupEnabled` 传给 B1 Service/Pipeline，并用于 C1 回包复核与面板高危重算。面板打开期间客户改开关**不改变本次提交**，下一次提交重新取快照。`highRisk.reasons` 非空且 `acknowledged !== true` ⇒ 拒绝落账，面板保持可重试。
- **幂等**：按 `(projectRoot,target,rawText,clientMessageId)` 保存有界内存映射；同键未决 ⇒ 复用同一面板；已落账 ⇒ 返回同一 `id` 不重复写；无 `clientMessageId` 按普通新提交（旧渲染兼容）。
- **回执**：仅在 B1 durable 写入成功后，经既有 `emitEvent`/`delivery-note` 系统行路径生成，使用 A3 冻结文案；不含原文全文、不进模型上下文。面板撤销由渲染侧带当前角色/引擎作为**显示目标**（不作为授权依据）。
- **共存/生命周期**：独立 pending Map，**不占 `shellCardSlot`、不进 `customer-input` 一项目一卡队列、不计入 `pendingCount`/`pendingRoles`/`judgingCount`**；关窗 `cancelAll`，项目切换 `cancelProject`（只取消未决面板，不销毁旧项目运行时；切回同一运行内 `session` 指令仍有效），重载/focus/`app:recovery-ready` 用同一 `requestId` 重推。
- **项目事实**：主进程以 `app:list-project` 成功的 `recoveryProjectRoot` 为当前项目授权来源；渲染侧传入的 `projectRoot` 只做一致性校验，不作为授权来源；无当前项目时 `list/revoke/confirm` fail-closed。
- **list 双视图（P1-CAP-15 附带收口）**：`list(projectRoot)` 先按当前项目授权解析该项目的运行时，再调 B1 `runtime.list()`；其 `{projectRoot,approval,decision,ledgerErrors}` 与 `directive:list`/`directive:state` 成功载荷一一对应（仅加 `version:1`/`directivesEnabled:true`），**不新增跨 target 字段、不跨项目聚合**；面板是唯一跨 target 读点，shell/decision 消费者仍只读 target-scoped `approvalFacts`/`decisionFacts`。

### 2.4 IPC 与 preload 白名单（冻结；C1 是 source of truth）

[设计候选] 只新增方案 §3.3 的五个通道；主→渲推送、渲→主 invoke 的方向不变。**下表即 C2 必须消费的冻结名/载荷表（C1 为 source of truth）；C2 必须逐字段按此消费，不得保留候选名。**

| 通道 | 方向 | 冻结载荷 |
| --- | --- | --- |
| `directive:confirm-request` | 主→渲 | `{version:1, request:{id,target:"approval"\|"decision",rawText,projectRoot,roleId,runtime?,prefill:{action,scope:{flowId?},until:"once"\|"session"\|"forever",unrecognized:string[]},highRisk:{reasons:string[]},confirmable:boolean,decisionGroupEnabled:boolean}}` |
| `directive:confirm-response` | 渲→主 invoke | `{id, decision:"confirm"\|"cancel", values?:{action,scope,until,acknowledged?:true}}` |
| `directive:list` | 渲→主 invoke | 入参 `{projectRoot?}`；成功 `{version:1,ok:true,directivesEnabled:true,projectRoot,approval:DirectiveListView,decision:DirectiveListView,ledgerErrors:number}`，失败 `{ok:false,error}` |
| `directive:revoke` | 渲→主 invoke | `{id,target:"approval"\|"decision",projectRoot?,roleId?,runtime?}` → `{ok:true,id,target}` 或 `{ok:false,error}` |
| `directive:state` | 主→渲 | `{version:1,directivesEnabled:true,projectRoot,approval:DirectiveListView,decision:DirectiveListView,ledgerErrors:number}`（与 `directive:list` 成功视图同形） |

[设计候选] `preload.cjs` 白名单冻结为：`onDirectiveConfirmRequest(cb)`、`directiveConfirmRespond(input)`、`listDirectives(input)`、`revokeDirective(input)`、`onDirectiveState(cb)`；只经 `ipcRenderer.invoke/on`，不暴露 Node 能力。`onDirectiveState` 注册时**先同步回放 preload 缓存的最后一条 `directive:state`**，再订阅后续推送（机制见 §2.5）。**三处冻结裁定**：`directivesEnabled`（弃 `enabled`）、`confirmable`（弃 `canConfirm`）、`directiveConfirmRespond`（弃 `directiveRespond`）；`DirectiveListView` 按 B1 冻结的 `{active,consumed,revoked,expired}`。**C2 必须消费的冻结名/载荷表**即上表：`directivesEnabled` 取 `directive:state`/`directive:list`，`confirmable` 取 `directive:confirm-request.request`，确认回包调 `directiveConfirmRespond`；不新增/猜测字段。**C1 完成即冻结 IPC/preload 形状**，C2 只消费；变更回 C1 并重跑受影响证据。

### 2.5 `main.ts` 生命周期、sender 校验与能力位 handshake

[设计候选] `directive:confirm-response`/`list`/`revoke` 在 handler 内校验 `event.sender === win.webContents`（沿用 `isShellJudgeIpcSender` 模式）；`directive:confirm-request`/`state` 只做主→渲发送。窗口 `closed` 调 `cancelAll`；`focus`/`show`/`app:recovery-ready` 调 `replayPending`；`app:list-project` 成功且项目变化时 `cancelProject(old)`、更新当前项目、推 `directive:state`。`directivesEnabled` 基础实现恒 `true`；**O9 不实施，不写 env `false` 分支**。
- **handshake（P1-CAP-07，选“主进程先行”）**：`registerIpc(win)` 在 `win.webContents.on("did-finish-load", …)` 推一次 `directive:state`（页面加载完成；重载再次触发），注册时若页面已加载完则立即补推；`app:list-project` 成功与 `app:recovery-ready` 亦重推。`preload.cjs` 在加载时即 `ipcRenderer.on("directive:state")` 缓存最后一条；`onDirectiveState(cb)` 注册时同步回放缓存再订阅，C2 在 `installChatRuntime`/store 初始化时订阅即可拿到启动态。**初始读/ack**：`directive:list` 成功载荷含 `directivesEnabled`；C2 在首次 `send()` 前 await 一次 `listDirectives`（或已从缓存订阅取得状态）再决定是否抑制，未取得结果前按 `false` 且不抑制（有界超时/失败 ⇒ `false` 正常发送）；即使起始推送尚未到达，首次输入也不会在未知能力位下抑制气泡。C2 首帧默认 `directivesEnabled=false`，收到状态后按该位执行。
- **应用运行级 `sessionId`（P1-CAP-14）**：`app/main.ts` 在应用启动（`whenReady` 前模块初始化）生成一次 `crypto.randomUUID()`，经 `DesktopDeps.directiveSessionId` 传入 `createDesktopInterface`；每个项目的 `createCustomerDirectiveRuntime({projectRoot, sessionId: directiveSessionId, present})` 使用**同一值**。项目切换不重置、同一运行内多窗口同值；进程重启生成新值，使 `session` 指令按 B1 状态机失效。

## 三、设计候选：decision 消费者（`customer-input.ts`）

- 仅在 `cardKind === "decision"`（显式 `request.cardKind ?? metadata.cardKind`）且注入了 decision 指令消费者时，在 `presentEntryNow()` 的 `tryAutoSelectDecision` **之前**进入；decision 卡不区分 `application`；proposal/appointment/acceptance/intent-confirm 等其他卡种零变化。
- 新增内部状态 `directing`（状态联合第 6 项）：占住一项目一卡槽位，不呈现、不计入 `pendingCount`/`pendingRoles`/`judgingCount`；`settleEntry` 的 from 联合扩为 `active|judging|directing`，其他状态语义不变。
- 流程：读 `decisionFacts()`（只含 decision；`ledgerErrors>0` 按无指令）→ 调 B1 冻结的 `applyDecisionDirective(card, {emitResult})`，按方案 §6.2 执行：卡内唯一 `recommended:true` 代选；选项 id 或规范化 label/前缀唯一匹配；拒绝按 `scope.flowId`（存在时同 flow，否则本项目全量）；0/多匹配不应用。成功：`once` 已 durable 消费后结算 `answered{selected:[optionId]}` 或 `declined`，带 `operatorId:"directive:<id>"` 与 A1 的 `directive` 字段；可见结果行投达失败 ⇒ 不应用/回落。**冲突或 0/多匹配（P1-CAP-06）**：不消费任何一条，**绕过 `tryAutoSelectDecision`**，直接呈现客户卡；说明**不新增载荷字段**，由 C1 经注入的 `emitDirectiveNotice`（`main.ts` 用既有 `emitEvent` 实现）投一条 `delivery-note` 系统行（A3 冻结的 `main.directive.decision.*` 冲突/不匹配两条 key，参数 `{ids}`/`{id}`），C2 用既有系统行展示，**零新增字段/零渲染分支**；系统行投达失败只记诊断，不影响卡片呈现与“不消费”。`once` 消费 durable 失败 ⇒ 回落客户卡，不产生 outcome/审计。
- **C2 动作（P1-CAP-06）**：不消费新字段、不加渲染分支；沿用既有 `delivery-note` 系统行展示；UI 测试/D2 截图证明冲突/不匹配说明可见。
- **B1 交接硬条件（按 B1 Revision 1）**：`DecisionHooks` 唯一可见行钩子为 `emitResult`（无 `deliver` 别名）；`applyDecisionDirective` 必须在 durable 消费**之前** `await hooks.emitResult(...)`，抛错/拒绝或无钩子 ⇒ 不消费、不应用、返回 `undefined`。否则 AC-10/AC-13 的“可见行是条件”与 `once` 原子消费无法同时成立，C1 停止回报，由 B1 冻结 API 解决。C1 以 `{emitResult}` 调用，并在测试中与 B1 类型做双向可赋值断言。
- Q7 A：指令独立于两个开关；开关状态只用于高危判定与“无指令时”的既有默认推荐，不阻断指令本身。

## 四、设计候选：Q9 桌面读者与 `directiveId`

| 位置 | 现状 | C1 改法 |
| --- | --- | --- |
| `session.ts:2078` run-change | `judge:` ⇒ judge，否则 customer | 显式三值 `judge/directive/customer`，directive 传入 `applyRunChange`（B1 冻结联合） |
| `session.ts:4166-4199` `request.resolved` | `judged` 只认 `judge:`；`by` 二值 | `operatorId` 以 `directive:` 开头 ⇒ `by:"directive"`，写 `directiveId`（去前缀）；不写 judge 审计；`approval.resolved` 路径不适用（指令只处理 decision 卡） |
| `session.ts:4470-4471` `decidedByText` | `"customer"\|"judge"` | 扩为三值；directive 文案用 A3 的 `ui.versionDecision.decidedBy.directive`，不硬编码 |
| `session.ts:4657-4660/4691` `version.decision` | 二值 | 三值 + `directiveId`；`mapVersionDecisionAnswer`/`VersionDecisionEvent` 由 B1/A1 冻结 |
| `requirement-change.ts:249/316-318` | `source` 二值；`=== "judge"` 文案 | `source` 三值；directive 文案明确“客户指令（@决策）代选，不是客户点击”；`buildRequirementChangeLeadExecutionTaskText` 入参同步 |
| `interface.ts:1406-1411`（补充发现） | `judge:` 否则 customer | 同一三值映射；本文件已在 C1 写集内，不新增路径 |

[设计候选] `directiveId` 只从 `operatorId:"directive:<id>"` 解析（单一来源辅助函数）；不带 `directiveId` 的旧记录保持可读。`request.presented.to` 按 **W-6 不扩展**（仍仅 `customer|judge`）：代选/拒绝在 `presentEntryNow` 之前完成，不写 `request.presented`；指令归属只写 `request.resolved.by:"directive"` + `directiveId`，不伪造 presented 通道。

## 五、精确写集（C1）

[设计候选] 只写下列路径；无新依赖、无新目录、无第三个 `test/桌面应用/` 新文件：

| 路径 | 动作 | 内容 |
| --- | --- | --- |
| `app/desktop/directive-input.ts` | **新增** | 应用层控制器：提交/确认/取消/列表/撤销/高危复核/幂等/重推/关窗/项目切换/面板共存 |
| `app/desktop/interface.ts` | 改 | `DesktopDeps.directiveInput?`；`sendSession` 命中拦截；不新增第二解析器 |
| `app/desktop/session.ts` | 改 | `SendResult.directive?`/`directiveCancelled?`；Q9 四处读者与 `directiveId` 辅助 |
| `app/desktop/customer-input.ts` | 改 | decision 消费者、`directing`、冲突/不匹配系统行（注入 `emitDirectiveNotice`，既有 `emitEvent`，无新载荷字段）、决策事实注入类型、结算路径 |
| `app/desktop/requirement-change.ts` | 改 | `source` 三值、来源文案、执行任务入参 |
| `app/desktop/recovery-channel.ts` | **条件** | 预计零改动；仅当复用 presenter/共享签名变化才最小适配；不改须在完成报告说明无回归 |
| `app/main.ts` | 改 | 五个指令通道接线、sender 校验、窗口关闭/重推/项目切换、`directivesEnabled` 推送、`emitDirectiveNotice` 注入 |
| `app/preload.cjs` | 改 | 五个白名单方法（仅 invoke/on） |
| `test/桌面应用/directive-input.test.ts` | **新增（B-4）** | 识别拦截/不投递/面板通道/回包快照/高危复核/幂等/重推/关窗/项目切换/面板共存/**卡内入口 + Composer 未开会话 + 无/非法/跨项目 target fail-closed** |
| `test/桌面应用/directive-decision.test.ts` | **新增（B-4）** | decision 消费者规则/冲突与不匹配绕过默认推荐/`once` 回落/Q9 归属断言 |
| `test/桌面应用/interface.test.ts`、`decision-service.test.ts`、`run-change.test.ts`、`version-decision.test.ts` | 按需改 | 仅补新分支/回归；逐条理由写入完成报告；不弱化断言 |
| `test/桌面应用/e2e/main.mjs` | **条件** | 仅 D2 真实运行需要时在既有文件内扩展；**不新建 `e2e/` 脚本** |

[设计候选] **不创建** `test/桌面应用/session.test.ts`（边界陈旧条目，团队计划 §4.5 不修边界漂移）；Q9 的 SessionManager 级断言放 B-4 的 `directive-decision.test.ts` 或既有 `run-change.test.ts`/`version-decision.test.ts`。**不写**：`app/renderer/**`、`src/**`、`test/桌面UI/**`、`test/测试/**`、`test/编排/**`、`test/runtime-core/**`、`test/项目管理/**`、`package.json`/锁/tsconfig/vite/发布配方、角色卡/边界、`docs/scheduling|acceptance|communication/`。

## 六、AC 映射（C1 视角，不替代 V1）

| AC | C1 覆盖/证据 | 依赖与交接 |
| --- | --- | --- |
| AC-1 | 命中/未命中/带图拒绝/空正文经 `sendSession` 分支与控制器断言；解析真值表由 A1 | A1 冻结 `parseDirectiveMarker` |
| AC-2 | 伪造 `SessionManager`/`handle.send` 计数 = 0；无 `lastUserText`/`session:events`；未命中 diff 不变；能力位在首次输入前已知（§2.5 handshake） | `interface.test.ts` + 新测试；D1/D2 |
| AC-3 | `directive:confirm-request` 字段（原文/动作/范围/资源/期限）、`unrecognized`、`confirmable`；主进程回包校验 | C2 实际面板/截图；A3 文案 |
| AC-4 | 取消/关窗/不可用/写失败：无账本、无投递、无“已记录”；`directiveCancelled` 使 Composer 恢复草稿 | C1 测试 + D1 |
| AC-5 | 回执仅在 B1 durable 成功后经 `emitEvent` 系统行；四条模板由 A3；不含原文、不进模型 | A3 key；C2 渲染；D2 |
| AC-6 | 账本 schema/ID/轮转/坏行由 B1/A1；C1 只消费 list/state 与错误 | B1 冻结 |
| AC-7 | decision 消费者只读 `decisionFacts`；伪造 approval fact 不消费；跨 target 撤销由 B1 拒绝并回错 | A1 类型分离；B1 运行时过滤 |
| AC-8/AC-9 | shell gate 顺序/once/deny/`c=allow` 由 B1；C1 不接线审批消费 | B1 证据 |
| AC-10 | 推荐/选项/拒绝/范围/冲突/不匹配绕过默认推荐；冲突/不匹配说明经 `emitEvent` 系统行（A3 key）；Q9 四处（run manifest 由 B1） | C1 新测试 + `run-change`/`version-decision` 测试；B1/A1/A3/D2 |
| AC-11 | 重启后无 pending；`session`/未用 `once` 由 B1 失效；应用运行级 `sessionId` 由主进程启动生成、切项目不重置；C1 list 分组显示 | B1 + C1 测试 + D2 |
| AC-12 | 面板与输入 `撤销 #id` 同服务路径；同 target/active；即时生效；回执/列表刷新 | B1 + C1 测试；D2 |
| AC-13 | 主进程按结构化字段重算高危；未勾选拒绝；提交快照 `decisionGroupEnabled` 同一值传 B1 与面板重算，面板期间开关变化不改本次；Q7 A 开关关闭项目级 `select-recommended` 高危 | A1 谓词 + C1 2×2 测试 + C2 UI + D2 |
| AC-14 | decision 消费者只处理 decision；指令无写权目标；结构检查 | A1/B1 结构；D1 |
| AC-15 | 无指令路径不变；Q9 六处读者（含 `interface.ts:1406`）；T3 全量 | C1 + D1 全量 |
| AC-16 | 坏账本：C1 消费者按无指令，列表如实报 `ledgerErrors`，不伪造回执 | B1 故障注入 |
| AC-17 | C1 只消费 A3 key，不硬编码用户可见字符串 | A3/C2 |
| AC-18 | 候选哈希、命令/原始输出、截图由 D1/D2/E1/E2 | C1 提供文件哈希与证据 |
| AC-19 | 基线 `4c3a6e4`；rebase 后重跑受影响证据 | 统筹/测试 |
| AC-20 | 不实施 O1–O11；无 CLI、无模型解释、无 `@边界` 解析、无 O9 false 分支 | 结构检查 |
| AC-21 | 只按 Q9 A 扩展；Q5 A 不扩联网/目录消费者 | 沟通记录 |
| AC-22 | **C1 主进程侧（部分覆盖）**：独立 pending、不占 `shellCardSlot`/一项目一卡队列、切项目取消未决、`session` 按项目账本、角色卡仍按各自通道推达；**“shell 卡待答仍可输入指令”由 C2 在增补写集 `ConfirmCard.tsx`（按需 `shell.css`）实现，C1 不写 `app/renderer/**`，不单方覆盖**；**卡内入口经同一 `sendSession`（target 取卡载荷；Composer 未开会话/当前 target 不同也不回退普通聊天；target 缺失/非法/跨项目 fail-closed）是 C2 A2 卡内入口的必需条件** | C1 `directive-input.test.ts` + C2 UI 测试 + D1/D2；分工见下方注 |
| AC-23 | **not applicable（O9 未选）**；基础能力位 `true` 由 AC-2/22 覆盖 | V1 §1.3/团队计划 §7.1 |
| AC-24 | 面板/审计以 `(id, createdAt)` 展示；O11 未选的重号风险由 B1/文档披露 | B1/C2 |

**AC-22 协同要求（P1-CAP-08，W-1=A）**：C2 在 `app/renderer/src/shell/ConfirmCard.tsx`（团队计划 §十三增补；`app/renderer/` 既有目录边界，无需 H1）实现 shell 卡非阻塞 Composer 或在卡内提供指令入口，并按需改 `shell.css`；既有 shell 卡 `.sc-overlay`（`ConfirmCard.tsx:141/295/550`、`shell.css:1125-1133`、`App.tsx:180`）的 UI/测试回归由 C2 负责，证据 = `test/桌面UI` 既有/新增测试 + D1 集成 + D2 截图。C1 提供主进程五个通道、窗口生命周期、`directive:state` 推送与测试替身配合；如需新增只读字段/通道，C2/C1 均停止回报统筹，不自行扩写集。**C1 不再声称 AC-22 单方覆盖。** **C1 侧必需条件（P1-CAP-15）**：C2 卡内入口调用的 `sendSession` 必须在 Composer 未开会话/当前 target 不同时仍按卡载荷 target 命中指令通道，不得回退 `manager.send`/`handle.send`/普通聊天；target 缺失/非法/跨项目 fail-closed。C1 以 `directive-input.test.ts` 的“卡内入口 + Composer 未开会话/无有效 target”用例提供证据；C2 UI 测试 + D1/D2 共同覆盖 AC-22。

## 七、T3 验证与冻结（C1 完成时）

[设计候选] 命令与证据：
1. `node --test --test-concurrency=1 test/桌面应用/directive-input.test.ts test/桌面应用/directive-decision.test.ts`；按需追加 `interface.test.ts`/`decision-service.test.ts`/`run-change.test.ts`/`version-decision.test.ts`，逐条理由写入完成报告。
2. `npm run typecheck`；不改 `typecheck:renderer`/`build:renderer`（C2/D1 负责）。
3. 候选身份：每个改动/新增文件 `git hash-object` + `sha256sum`；`git status --short`、`git diff --name-only`、`git diff --cached --name-only`（暂存空）必须落在 §五写集。
4. **冻结声明（Revision 1 扩充）**：`SendResult.directive?`、`CustomerInputOutcome.directive` 消费形状、五个 IPC 通道/载荷与 preload 方法名（§2.4 冻结表）、`directivesEnabled` handshake（§2.5）、`decisionGroupEnabled` 提交快照、应用运行级 `sessionId`、B1 `DecisionHooks.emitResult` 唯一钩子，在 C1 完成即冻结；C2/B1 只按冻结名消费；任何变更回 C1 重跑。**另冻结（Revision 2）**：`directiveInput.list(projectRoot)` 与 IPC `directive:list`/`directive:state` 为同一 service 视图（`{approval,decision,ledgerErrors}` 一一映射；IPC 不新增跨 target 字段、不跨项目聚合；面板是唯一跨 target 读点，消费者仍只读 target-scoped facts）；卡内入口 `sendSession` 契约（同一入口、target 取卡载荷、Composer 未开会话/当前 target 不同不回退、target 无效 fail-closed）同冻结。
5. **AC-13 快照测试（P1-CAP-04）**：`directive-input.test.ts` 以 2×2（`decisionGroupEnabled` 开/关 × 项目级 `scope:{}` / 单 flow `scope:{flowId}`）覆盖 `select-recommended`：仅“关×项目级”产生 `switch-off-project-recommended`，未 `acknowledged:true` ⇒ 拒绝且零账本事件；断言 presenter 载荷、B1 `SubmitFromInput` 与 C1 面板重算拿到同一快照值；面板打开期间翻转开关不改变本次提交，下一次提交取新值。
6. **handshake 测试（P1-CAP-07）**：`directive-input.test.ts` 断言 `did-finish-load`、项目切换（`app:list-project` 成功）、`app:recovery-ready` 三处推 `directive:state` 且 `directivesEnabled:true`；preload 缓存回放（`onDirectiveState` 注册即回调）与 `directive:list` 成功载荷含同字段；C2 首发送前 await 初始读的时序由 `test/桌面UI` + D2 覆盖（缓存未到时不得抑制）。
7. **AC-10 说明、Q9 与 C1↔B1 双向断言（P1-CAP-06/03/11）**：冲突/不匹配断言 `emitEvent` 收到 A3 key 的 `delivery-note` 系统行、卡片仍呈现、`tryAutoSelectDecision` 未调用、零消费；Q9 的 SessionManager 级断言放 `directive-decision.test.ts` 或既有 `run-change.test.ts`/`version-decision.test.ts`（**不创建 `session.test.ts`**）；`directive-input.test.ts`/`directive-decision.test.ts` import B1 `DecisionHooks`/`SubmitFromInput`/`DirectivePresenter` 类型做**双向可赋值**断言（缺 `decisionGroupEnabled`、用 `deliver` 别名均 `@ts-expect-error`）。
8. **AC-11 测试（P1-CAP-14）**：同一运行内项目切换往返后 `session` 指令仍 active（同一 `sessionId`）；模拟重启新 `sessionId` 后同一账本 `session` 失效；断言 `directiveSessionId` 只生成一次并原样传给每个项目 runtime。
9. **卡内入口测试（P1-CAP-15）**：`directive-input.test.ts` 增“shell 卡待答 + Composer 未开会话”用例：卡内入口以卡载荷 target 调 `sendSession`，断言 `directive:confirm-request` 推达、`submitFromInput` 恰一次、`manager.send`/`handle.send` 零次、无角色轮次/`lastUserText` 变化；target 缺失/非法/跨项目/无 target ⇒ `{ok:false,error}`、零落账/零投递、不回退普通聊天或当前选择；标记未命中仍走既有普通聊天（AC-1 不变，卡内入口仅在命中时调用）。
10. D2：仅当真实运行需要桌面夹具时条件扩展 `test/桌面应用/e2e/main.mjs`，覆盖命中不发幕僚、回执、取消回草稿、decision 代选/冲突回落/说明系统行、面板与 shell 卡共存/项目切换、重启失效；AC-22 的“shell 卡待答输入”由 C2 ConfirmCard 场景覆盖；不新建 e2e 脚本，不录屏。
11. 本提案**未运行**任何实施测试；完成报告须如实写 `implemented-unverified`。

## 八、交接条件、顺序与风险

**交接条件（未满足不写引用代码）**
- **A1 冻结（A1 Revision 1）**：`parseDirectiveMarker`；`src/model/directive.ts` 类型/高危谓词（`DirectiveHighRiskInput.decisionGroupEnabled` 必填）；`CustomerInputOutcome.directive?`；`RequestResolvedEvent.by:"directive"` + `directiveId?`、`VersionDecisionEvent.directiveId?`、`VersionDecisionDecidedBy:"directive"`（P1-CAP-01 已补入）。C1 只 import type，不复制定义。
- **B1 冻结（B1 Revision 1）**：每项目 Pipeline 公共句柄（`submitFromInput`/`approvalFacts`/`decisionFacts`/`takeDirective`/`applyDecisionDirective`/`revoke`/`list`）；`SubmitFromInput.decisionGroupEnabled: boolean` 必填；`DirectivePresenterRequest.decisionGroupEnabled`；`DecisionHooks.emitResult` 唯一钩子（无 `deliver`，抛错/拒绝 ⇒ 不消费、返回 `undefined`）；`DecisionApplyResult` 的 `conflict`/`no-match`；`takeDirective`/审计 `directive:{id,scope}`/`by:"directive:<id>"`；run-change/version-decision 的 `"directive"` 联合；应用运行级 `sessionId`（项目切换不重置，由 C1 主进程生成并注入 `createCustomerDirectiveRuntime`）。
- **A3 冻结**：回执/错误/高危/冲突与不匹配说明（`main.directive.decision.*` 两条）/`ui.versionDecision.decidedBy.directive` key；C1 只消费，不硬编码。
- **C2**：在 C1 IPC/preload 冻结后按 §2.4 冻结表消费；C1 不写 `app/renderer/**`；AC-22 的 ConfirmCard 改动按 W-1=A 由 C2 执行。

**顺序**：A1 + B1 + A3 冻结 → C1（本提案）→ C1 冻结 → C2 → D1/D2。基线 `4c3a6e4`；不越过 B-1..B-4，不新增依赖/路径。

**风险/开放点**
- **版本注记**：任务派发写 P1.1（1199/`7875ad6a…`），盘上为 P1.2（1209/`1748ad2d…`）；V1 §1.2.1 已记录 R1/R2 编辑性等价，**本提案按 P1.2 文本施工，冲突以 P1.1 为准**，不把 P1.2 当新语义。
- **`test/桌面应用/session.test.ts` 边界条目陈旧**：boundary 列有但文件不存在；**不创建**，Q9 断言放入 `directive-decision.test.ts`/既有 `run-change.test.ts`/`version-decision.test.ts`；边界漂移另报统筹，不顺手修。
- **B1 可见行/once 原子性**：`DecisionHooks` 唯一钩子为 `emitResult`；若 `applyDecisionDirective` 无 emit-before-consume，AC-10/13 可能“行未达但已消费”；C1 停止回报，不自行在 Desktop 复制消费逻辑。
- **`request.presented.to`**：按 W-6 **不扩展**（仍 `customer|judge`），不伪造 presented；归属只写 `request.resolved.by`/`directiveId`。
- **`interface.ts:1406-1411`**：补充发现的旧读者，属本文件授权；按 Q9 逐点修复，不是计划外扩写。
- **`recovery-channel.ts`**：预计零改动；若共享 presenter 签名变化才最小适配，完成报告必须写“改/不改 + 无回归理由”。
- **渲染侧不可信**：target/rawText/字段/高危 ack 全部按主进程快照复核；`directivesEnabled` 只是回显抑制提示，不是授权依据；`decisionGroupEnabled` 只展示，渲染侧不重算高危；C2 必须按 §2.4 冻结名消费（`directiveRespond`/`enabled`/`canConfirm` 不再有效）。
- **项目切换/面板共存**：独立 pending、不占 `shellCardSlot`/客户卡队列；切项目取消未决但不销毁旧项目运行时；无当前项目 fail-closed；`directivesEnabled` 基础实现恒 `true`，项目切换/重载重推（§2.5），无 O9 false 分支（若客户后续选 O9，重开闸门 1/2）。
- **AC-22 分工**：C1 只覆盖主进程侧；C2 在增补写集改 `ConfirmCard.tsx`/按需 `shell.css` 并承担既有 shell 卡 UI/测试回归。C1 不写 renderer、不单方声明 AC-22 通过。

**停止项**：本提案未发现需要新增文件/依赖/写集或方案实质冲突；C1 无新增停止项。AC-22 的 C2 侧以 W-1=A 与团队计划 §十三为准；若 C2 未按 §2.4 冻结表消费、或需 C1 扩写集/新增通道字段，双方停止回报统筹，不自行扩写集。上述 A1/B1 契约未冻结项在实施前回报统筹裁决。

## 九、修订记录（Revision 1，2026-11-03）

- **触发/范围**：P1 审核 **193 行 / `65f888a6…`** 结论 `needs revision`；客户 W-1 裁决 **A**，团队计划 §十三增补至 **664 行 / `ecac818c…`**（仅 C2 写集增补 `ConfirmCard.tsx`/按需 `shell.css`，C1 写集不变）。本修订只改本文件、原位窄修订；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `4c3a6e4…`；`git status --porcelain -- src app test` 为空。
- **输入复核（只读）**：方案 P1.1 **1199 / `7875ad6a…`**（确认基线，冲突以此为准）与 P1.2 **1209 / `1748ad2d…`**（R1/R2 编辑性等价）；V1 **1171 / `51ac0f50…`**；沟通记录 **168 / `9f19821e…`**；A1 修订稿 **172 / `f2570291…`**（公共句柄类型、`emitResult` 唯一、`SubmitFromInput.decisionGroupEnabled` 必填）；B1 修订稿 **242 / `0d98e200…`**。

| 项 | 处置（修订后位置） | 测试/证据（计划） |
| --- | --- | --- |
| **P1-CAP-04**（阻断，AC-13） | §2.3 输入增加 `decisionGroupEnabled: boolean`、pending 快照、`sendSession` 读 `decisionJudgeSwitch.isEnabled()` 当刻快照；同一值给 B1 Service/Pipeline 与 C1 面板重算；面板期间开关变化不改本次 | §七.5 2×2 测试；AC-13 行；D2 高危未勾选截图 |
| **P1-CAP-05**（阻断，C1/C2 冻结） | §2.4 冻结五通道/载荷与 preload 名（`directivesEnabled`/`confirmable`/`directiveConfirmRespond`），单列 C2 消费表；§2.5 preload 缓存回放 | §七.4 冻结声明；C2 按表修订；`typecheck`/`typecheck:renderer`；D2 |
| **P1-CAP-06**（阻断，AC-10 UI） | 选**系统行**：C1 `emitEvent` 投 `delivery-note`（A3 `main.directive.decision.*` 冲突/不匹配），C2 既有系统行渲染、零新字段；删除 `directiveNotice` 载荷字段 | §七.7；AC-10 行；D1/D2 截图 |
| **P1-CAP-07**（阻断，AC-2） | 选**主进程先行**：`registerIpc` 在 `did-finish-load` 推 `directive:state`，项目切换/`recovery-ready` 重推；preload 缓存并在 `onDirectiveState` 注册时同步回放；C2 未收到状态前不得抑制 | §2.5；§七.6；AC-2 行；D2 首输入 |
| **P1-CAP-08**（阻断，AC-22） | 选 W-1=A：C1 AC-22 行改为如实“主进程侧可覆盖 + C2 ConfirmCard 非阻塞/卡内入口”；C2 在增补写集实现并承担既有 shell 卡 UI/测试回归；C1 不写 renderer、不单方覆盖 | §六 AC-22 行+协同注；C2 UI 测试 + D1/D2 |
| **P1-CAP-11**（非阻断） | AC-22 行如实标注；“按 P1.2 施工”补“冲突以 P1.1 为准”；明确不创建 `test/桌面应用/session.test.ts`，Q9 SessionManager 断言放 B-4/既有测试 | §一/§五/§七/§八；Q9 断言清单 |
| **P1-CAP-14**（非阻断） | §2.5 明确 `sessionId` 主进程启动生成、项目切换不重置、传 `createCustomerDirectiveRuntime` 路径 | §七.8 AC-11 测试；D2 重启 |
| **B1 对齐**（P1-CAP-03） | §三/§八 按 B1 Revision 1 统一 `DecisionHooks.emitResult` 唯一钩子与“抛错不消费”；`SubmitFromInput.decisionGroupEnabled` 必填；C1↔B1 双向可赋值断言 | §七.7；`npm run typecheck` |

- **未改项（保持已通过）**：`interface.ts:1406-1411` 旧读者修复（Q9 逐点、C1 既有单文件）；`request.presented.to` 不扩展（W-6，§四）；decision 消费者与 `directing`；`once` durable 失败回落；冲突/不匹配绕过 `tryAutoSelectDecision`；项目切换取消未决；面板不占卡槽/队列；§五写集与不写清单（不新增第三个 `test/桌面应用/` 文件、不写 `app/renderer/**`）。
- **停止项/裁决**：C1 无新增停止项。AC-22 的 C2 侧以 W-1=A 与团队计划 §十三为准；若 C2 未按 §2.4 冻结表消费、或需 C1 扩写集/新增通道字段，C1 停止回报统筹，不自行扩写集。
- **状态**：仍为 `proposal-only, no code`；未运行测试/typecheck/应用；待项目管理窄复审。

## 十、修订记录（Revision 2，2026-11-03）

- **触发/范围**：P1 审核记录 **306 行 / `8427ff02…`**（Revision 1 窄复审）结论仍 `needs revision`；对 C1 新增 **P1-CAP-15**（阻断 C1/C2 冻结，AC-22 卡内入口协同）。本修订只改本文件、原位窄修订；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `4c3a6e40…`；`git status --porcelain -- src app test` 为空。
- **输入复核（只读）**：团队计划 v1 **653 / `37e6bd0d…`** + §十三增补 **664 / `ecac818c…`**；方案 P1.1 **1199 / `7875ad6a…`**（确认基线，冲突以此为准）/ P1.2 **1209 / `1748ad2d…`**（编辑性等价）；V1 **1171 / `51ac0f50…`**；沟通 **168 / `9f19821e…`**；B1 修订稿 **242 / `0d98e200…`**；C2 修订稿 **162 / `40c47efd…`**（A2 卡内入口经同一 `bridge.sendSession`，target 取卡载荷 `projectRoot/roleId/runtime`）。P1-CAP-16/17/18 属 C2/A3，不在 C1 写集；其中 P1-CAP-18 的“缺失回退当前选择”与 C1 fail-closed 冲突，C1 按本提案 fail-closed，由 C2 收口。

| 项 | 处置（修订后位置） | 测试/证据（计划） |
| --- | --- | --- |
| **P1-CAP-15a** 同一入口/卡载荷 target | §2.1：C2 卡内入口与 Composer 同一 `bridge.sendSession(text, images, target, {clientMessageId})`（卡内 `images=[]`）；target 取卡载荷 `{projectRoot, roleId, runtime}`；不新增 IPC/preload 字段；命中即 `submitFromInput` | §七.9 卡内入口用例；C1/C2 IPC 表不变 |
| **P1-CAP-15b** 不回退 | §2.1：`sendSession` 只按本次 `text` 标记与本次 `target` 判定，不读 Composer 当前会话/选中 target；Composer 未开会话或当前 target 不同 ⇒ 仍走指令通道，**不得**回退 `manager.send`/`handle.send`/普通聊天；不产生角色轮次、不写 `lastUserText`/`inputAccepted`/`turnId`/`outcome`/`sessionCurrent`、不发 `session:events` | §七.9：`manager.send`/`handle.send` 零次、无角色轮次/`lastUserText` 变化；D1/D2 |
| **P1-CAP-15c** target fail-closed | §2.1：`projectRoot`/`roleId` 必填，`projectRoot` === 当前项目授权来源 `recoveryProjectRoot`、`roleId` 在当前项目 `ProjectListing.roles` 内、`runtime` 若提供须有效；缺失/非法/跨项目 ⇒ `{ok:false,error}`，不落账、不投递、无回执，不回退当前选择 | §七.9：无/非法/跨项目 target 用例断言 fail-closed 与零落账/零投递、不回退普通聊天 |
| **P1-CAP-15d** 测试 | §五 `directive-input.test.ts` 行与 §七.9：新增“shell 卡待答 + Composer 未开会话”用例；断言 `directive:confirm-request` 推达、`submitFromInput` 一次、`manager.send`/`handle.send` 零次、无角色轮次/`lastUserText`；未命中标记仍走既有普通聊天（AC-1 不变） | `node --test ... directive-input.test.ts`；D1/D2 |
| **P1-CAP-15e** AC-22 协同注 | §六 AC-22 行 + 注：C1 卡内入口受理是 C2 A2 的**必需条件**；证据 = C1 测试 + C2 UI 测试 + D1/D2 | C2 `test/桌面UI`/`phase5a` 冒烟；D1/D2 |
| **list 双视图**（复审建议收口） | §2.3 `list(projectRoot)` 返回 B1 `DirectiveListResult`；§2.3/§七.4 写清与 `directive:list`/`directive:state` 同一 service 视图（`{approval,decision,ledgerErrors}` 一一映射；IPC 不新增跨 target 字段、不跨项目聚合；面板是唯一跨 target 读点，消费者仍只读 target-scoped facts） | §七.4 冻结声明；`directive-input.test.ts` 断言 `directive:list` 载荷与 `runtime.list()` 同形、无额外目标字段 |

- **保留（Revision 1 已冻结，不再改动）**：五个 IPC 通道/preload 方法名与载荷（`directivesEnabled`/`confirmable`/`directiveConfirmRespond`）；decision 冲突/不匹配经既有 `delivery-note` 系统行（A3 `main.directive.decision.*`，零新增载荷字段）；`directivesEnabled` 主进程先行握手 + preload 缓存回放；`decisionGroupEnabled` 提交当刻快照；应用运行级 `sessionId` 主进程启动生成、项目切换不重置；Q9 六处读者与 `directiveId`；`request.presented.to` 不扩展；§五写集与不写清单不变（不新增第三个 `test/桌面应用/` 文件、不写 `app/renderer/**`）。
- **停止项/裁决**：C1 无新增停止项。若 C2 卡内入口要求 C1 新增 renderer 可见字段/通道、或要求 target 缺失时回退当前选择，C1 停止回报统筹，不自行扩写集或改 fail-closed。P1-CAP-16（C2 写集文字）与 P1-CAP-17（A3 key）非 C1 主责，按原 owner 收口。
- **状态**：仍为 `proposal-only, no code`；未运行测试/typecheck/应用；待项目管理窄复审。

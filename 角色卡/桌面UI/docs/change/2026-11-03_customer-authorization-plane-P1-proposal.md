---
id: customer-authorization-plane-desktop-ui-proposal
type: change
title: 客户授权平面 P1 桌面UI短实现提案（C2，Revision 2）
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: draft
related: []
events:
  - date: "2026-11-03"
    kind: created
    summary: 写 C2 渲染层 proposal-only 短实现提案（回显抑制/确认对话框/指令面板/store/IPC 消费/i18n）；未改产品代码/测试
  - date: "2026-11-03"
    kind: revised
    summary: Revision 1 窄修订：按 C1 §2.4 冻结表消费、系统行承载 AC-10、主进程先行握手、AC-22 选 A2 卡内指令入口（写集增补 ConfirmCard.tsx/按需 shell.css）、补 AC-18/19/20/15/23 说明；未改产品/测试代码
  - date: "2026-11-03"
    kind: revised
    summary: Revision 2 窄修订：P1-CAP-16 phase3b/phase4b 改为只运行不修改（仅 phase5a 条件更新）；P1-CAP-18 卡内入口 target 只取卡载荷、缺失/非法/跨项目严格 fail-closed；未改产品/测试代码
---

# 客户授权平面 P1 桌面UI短实现提案（C2，Revision 2）

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / T3。
- **角色 / 节点**：桌面UI（渲染层 `app/renderer/`）；团队计划 §5.1 **P1（实现提案）** 的 C2 侧。
- **状态**：**`proposal-only, no code`**。只写本文件；未改产品/测试/样式/其他角色文档，未运行测试，未启动应用，未 commit/push，未接触客户。本文件为 **Revision 2 窄修订**（P1 复审 **306 行 / `8427ff02…`** 结论仍 `needs revision`；本修订处置 C2 的 **P1-CAP-16**（阻断）与 **P1-CAP-18**（非阻断，冻结前收口））；未获 `recommend approval` 前 C2 不开工。
- **一句话**：渲染层只做四件事——按共享解析器与主进程能力位抑制本地气泡、呈现确认对话框、呈现两个指令面板、按 C1/A3 冻结契约消费 IPC 与 i18n；不实现 IPC、不判 target、不写边界、不重算高危。AC-22 以 **A2 卡内指令入口**保持“输入 `@审批`/`@决策`”语义。

## 一、输入、基线与只读事实

- **[事实] 基线**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；`git status --porcelain -- src app test` 为空（写本提案前实测）。
- **[事实] 冻结输入（Revision 2 写盘前复算）**：团队计划 v1 **653 行 / `37e6bd0d…`** + §十三闸门 2 增补至 **664 行 / `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8`**（仅 C2 写集增补 `app/renderer/src/shell/ConfirmCard.tsx`/按需 `shell.css`）；方案 P1.1 **1199 行 / `7875ad6a…`**（闸门 1 确认基线，盘上未单独落盘，冲突以此为准）、盘上 P1.2 **1209 行 / `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688`**（R1/R2 编辑性等价，见 V1 §1.2.1）；V1 **1171 行 / `51ac0f50…`**；C1 修订稿 **210 行 / `866596f0afb8c0ab38c5c1626a61584dcfb818b24e4271e186814dae3864fc55`**；P1 复审 **306 行 / `8427ff02…`**（含 Revision 1 复审；原审核 193 行 / `65f888a6…`）；沟通记录 **168 行 / `9f19821e…`**（本次输入快照；盘上当前 174 行 / `80b9170d…`，仅追加“提交/合并预授权”节，W-1=A 与 P1 口径未变）；B0 **239 行 / `f1c54f09…`**。
- **[事实] 渲染层现状**：`Composer.send()` 先 `appendLocalUser` 再 `bridge.sendSession`（`Composer.tsx:282-286`）；`chat/ipc.ts` 是唯一运行时订阅安装点（`installChatRuntime`，`:426-530`）；`getDesktopBridge()` 是唯一桥访问层；`DecisionDialog.tsx` 已示范 `createPortal` 模态与 document Esc；`test/桌面UI` 现有 51 个 `*.test.ts`、无 DOM 依赖，纯逻辑用 Node 直接导入 `.ts`，`.tsx` 只做源码守卫。
- **[事实] AC-22 现场**：`ConfirmCard.tsx:141/295/550` 三处 `.sc-overlay`；`shell.css:1125-1133` 为 `position:fixed; inset:0; z-index:60`，`.sc-card` 为 `role="dialog" aria-modal="true"`；`App.tsx:180` 将 `<ConfirmCard />` 渲染在 `<Composer />` 之上；`useCardFocus` 默认聚焦拒绝按钮，`ConfirmCard` 的 document 监听负责 Tab 陷阱与 Esc 拒绝。既有 shell 卡 UI 证据主要在 `phase3b-electron-smoke.mjs`（默认拒绝焦点/Esc/显式 allow/失效收起）、`phase4b-electron-smoke.mjs`（expired 收起 + composer-hint）、`phase5a-electron-smoke.mjs`（升级卡三按钮/necessity/context/pause/旧 preload 降级/expiry/200% 窄屏）；`shell-escalation-view.test.ts` 是纯视图函数测试。`DecisionDialog` 覆盖层现有 `z-index:80`。
- **[事实] 改动前指纹**：`Composer.tsx` 875 行 / `fd81eedf…`；`chat/ipc.ts` 567 行 / `51fc14bf…`；`ConfirmCard.tsx` 741 行；`shell.css` 3506 行；`lib/platform.ts` 590 行 / `604a0aef…`；`test/桌面UI/phase5a-electron-smoke.mjs` 406 行 / `c68b7483…`。`src/model/directive-marker.ts`、`ui.directive.*` key、`directivesEnabled` 通道均为 **A1/A3/C1 未产出**，本提案不预造。

## 二、回显抑制（`shell/Composer.tsx`）

- **[设计候选] 唯一判据**：`import { parseDirectiveMarker } from "../../../../src/model/directive-marker.ts"`（A1 的零 import 纯函数）。发送前对 `el.value` 原文调用；**仅当** `useDirectiveStore` 的 `directivesEnabled === true` 且解析命中时，跳过 `appendLocalUser`。命中/未命中由共享函数决定；Composer **不判 target**、不按 target 分支、不解析正文。
- **[设计候选] 未抑制路径**：未命中、近失配、能力位 false/未知、桥缺省时，保持现有 `appendLocalUser → sendSession` 顺序逐字不变；带图普通消息不变。
- **[设计候选] 结果对账**（“按返回结果普通发送并补画气泡”）：
  - `res.directive` 存在 ⇒ 已落账：不画用户气泡、不调用 `setRoleError`/`invalidateSession`、不追加“已记录”系统行（C1 负责回执）；可触发面板刷新。
  - `res.directiveCancelled === true` ⇒ 取消：复用现有“未接受 ⇒ 恢复草稿”路径（原文/附件回填），但跳过角色错误标记与会话失效（本轮未发生角色轮次）；不画气泡、不回执。
  - 已抑制但主进程按普通消息接受（`res.ok !== false` 或 `inputAccepted === true` 且无 `directive`）⇒ **补画**：`!useChatStore.getState().hasClientAck(clientMessageId)` 时 `appendLocalUser(roleId, displayText, clientMessageId)`，随后继续既有 queued/outcome/turnId 处理；已 ACK 则不重复画。
- **[设计候选] 能力位消费（P1-CAP-07）**：从 `directive-store` 读取，默认 `false`；旧主进程/旧 preload 缺省 ⇒ 永不抑制并显示 A3 “指令能力不可用/旧版本主进程”说明。**首次发送前** `await ensureInitialRead()`：已有 `onDirectiveState` 回放或已完成 `listDirectives` 则直接取值；否则有界超时等待一次 `listDirectives({projectRoot})`，成功取其 `directivesEnabled`，超时/失败按 `false` **正常发送并照常画气泡**（不抑制）。因判定发生在 `appendLocalUser` 之前，该路径无需撤回气泡；保留兜底：若返回 `res.directive`（主进程仍拦截），按 `clientMessageId` 移除刚画的乐观气泡，不做角色错误/会话失效。**不实现 IPC、不新增第二份标记解析、不按 target 走不同通道。**

## 三、确认对话框（新增 `chat/directive-dialog.tsx`）

- **[设计候选]** 由 Composer 挂载（`createPortal` 到 body），只消费 store 的待确认请求；一次一个，不排队、不覆盖（第二次提交由 C1 拒绝）。z-index 90（高于 shell 卡 60 与决策对话框 80）。
- **[设计候选] 冻结字段消费（P1-CAP-05）**：只读 `directive:confirm-request.request` 的 `{id,target,rawText,projectRoot,roleId,runtime?,prefill:{action,scope:{flowId?},until,unrecognized},highRisk:{reasons},confirmable,decisionGroupEnabled}`；原文（只读、逐字、≤4KB）、动作、范围、资源、期限、未识别片段、高危原因全部来自该请求。`confirmable === false` 时确认按钮禁用；高危原因由 C1 给出，渲染侧只显示、不重算。`decisionGroupEnabled` 只按冻结载荷接收，仅作说明性展示，不作为授权或高危计算依据。
- **[设计候选] 回包**：确认调 `directiveConfirmRespond({ id, decision:"confirm", values:{ action, scope, until, acknowledged?:true } })`；取消调 `directiveConfirmRespond({ id, decision:"cancel" })`。失败保持对话框并显示 A3 错误文案；不产生假回执。Esc/关闭按钮 = 取消（fail-closed）；关窗取消由 C1 窗口作用域负责。
- **[设计候选] 高危与如实标注**：只显示 C1 给出的原因码（A3 key 映射；未知码用通用模板带 `{reason}`），勾选后才发送 `acknowledged:true`；主进程复核仍是唯一闸门。`domain`/`path` 资源显示“仅记录、当前版本暂无消费者、不影响执行”（Q5 A）；若 C1 载荷携带「替我审批/替我决策」开关状态则如实显示，渲染侧只展示、不读取/修改开关。

## 四、指令面板（新增 `chat/directive-panel.tsx`）

- **[设计候选]** 由 Composer 的紧凑入口按钮打开（见 §十一开放点 1），`createPortal` 覆盖层（z-index 95）；两个逻辑面板：审批指令 / 决策指令；每个按冻结的 `DirectiveListView {active,consumed,revoked,expired}` 分“生效中”与“已撤销/已消费/已失效”两组。行显示 `(id, createdAt)`（AC-24）、动作、范围、资源、期限、状态、消费者（`shell-gate`/`decision-card`/`暂无消费者`）；仅 active 行显示“撤销”。
- **[设计候选]** 撤销调 `revokeDirective({ id, target })`，target 取行数据、不再推断；按钮点击即明确动作，不二次确认；失败行内给原因；成功刷新列表，回执由 C1 系统行给出，面板不伪造“已撤销”文案。`ledgerErrors > 0` 时如实显示错误横幅，不伪装空账本。列表成功载荷只按 `{version:1,ok:true,directivesEnabled:true,projectRoot,approval,decision,ledgerErrors}` 消费；失败按 `{ok:false,error}` 显示。
- **[设计候选] AC-10 冲突/不匹配（P1-CAP-06）**：C1 已选**既有系统行**方案——经 `emitDirectiveNotice`（`main.ts` 既有 `emitEvent`）投 `delivery-note` 系统行，key 域 `main.directive.decision.*`。C2 **零新增字段、零新渲染分支**：沿用既有 `chat/events.ts` 的 `detail.source === "delivery-note"` → `kind:"system", cls:"sys-call sys-delivery-note"` 映射与 `ChatRow` 既有系统行展示；面板/对话框不拼接冲突说明。UI 证据用既有 `session:events` 注入断言系统行可见（DOM 快照）+ D2 截图。
- **[设计候选] 共存**：面板/对话框不使用 `confirm-store` 的写动作、不写 `shellCardSlot`、不进入 `customer-input` 一项目一卡队列、不计入 `pendingCount/pendingRoles/judgingCount`；不自动关闭/合并 shell 卡或决策卡。面板打开时若 shell 卡待答，面板顶部显示待答 shell 卡徽标（只读 `confirm-store` 的 `shellConfirm`/`recoveryConfirm`），便于客户看见后面的卡。
- **[设计候选] 项目切换**：`ipc.ts` 的 `onProjectChanged` 调 `useDirectiveStore.getState().clearProject(previousRoot, nextRoot)`；取消未决确认、清空旧项目列表、面板按新项目重新 `list`。旧项目的 `directive:state`/确认请求按 `projectRoot` 丢弃。

## 五、Store 与 IPC 消费（新增 `stores/directive-store.ts`；修改 `chat/ipc.ts`）

- **[设计候选] store**：持 `capabilityAvailable`、`directivesEnabled`（默认 false）、`pending`、`list(approval/decision)`、`ledgerErrors`、`busy`、`error`、面板/对话框开关、卡内入口状态；动作 `receiveConfirmRequest/respondConfirm/refresh/revoke/applyState/clearProject/submitFromCardEntry/ensureInitialRead`；纯函数 `directiveConfirmView/groupDirectiveList/consumerLabelKey/statusLabelKey/untilLabelKey` 放同一 `.ts`，供 `node --test` 直接导入（不新增文件）。
- **[设计候选] 冻结契约（C1 §2.4，逐字消费；C1 为 source of truth）**：

| 通道 | 方向 | 冻结载荷 |
| --- | --- | --- |
| `directive:confirm-request` | 主→渲 | `{version:1, request:{id,target:"approval"\|"decision",rawText,projectRoot,roleId,runtime?,prefill:{action,scope:{flowId?},until:"once"\|"session"\|"forever",unrecognized:string[]},highRisk:{reasons:string[]},confirmable:boolean,decisionGroupEnabled:boolean}}` |
| `directive:confirm-response` | 渲→主 invoke | `{id, decision:"confirm"\|"cancel", values?:{action,scope,until,acknowledged?:true}}` |
| `directive:list` | 渲→主 invoke | 入参 `{projectRoot?}`；成功 `{version:1,ok:true,directivesEnabled:true,projectRoot,approval:DirectiveListView,decision:DirectiveListView,ledgerErrors:number}`；失败 `{ok:false,error}` |
| `directive:revoke` | 渲→主 invoke | `{id,target:"approval"\|"decision",projectRoot?,roleId?,runtime?}` → `{ok:true,id,target}` 或 `{ok:false,error}` |
| `directive:state` | 主→渲 | `{version:1,directivesEnabled:true,projectRoot,approval:DirectiveListView,decision:DirectiveListView,ledgerErrors:number}` |

- **[设计候选] preload 方法（冻结）**：`onDirectiveConfirmRequest(cb)`、`directiveConfirmRespond(input)`、`listDirectives(input)`、`revokeDirective(input)`、`onDirectiveState(cb)`；只经 `ipcRenderer.invoke/on`，不暴露 Node 能力。`DirectiveListView` 按 B1 冻结为 `{active,consumed,revoked,expired}`。三处冻结字段名：`directivesEnabled`、`confirmable`、`directiveConfirmRespond`；正文只消费这些名称。
- **[设计候选] 握手消费（P1-CAP-07）**：C1 的 `registerIpc(win)` 在 `did-finish-load` 推 `directive:state`，`app:list-project` 成功与 `app:recovery-ready` 重推；preload 加载即缓存最后一条并在 `onDirectiveState(cb)` 注册时同步回放；`directive:list` 成功载荷含 `directivesEnabled`。C2 在 `installChatRuntime` 订阅 `onDirectiveState` 并 `applyState`；首帧默认 `false`，收到状态后按该位执行。
- **[设计候选] 旧主进程缺省**：任一所需 preload 方法不存在或能力位未推送 ⇒ `capabilityAvailable=false/directivesEnabled=false`；面板入口禁用并显示 A3“指令能力不可用/旧版本主进程”说明；回显不抑制；普通聊天逐字不变。`directive:state` 缺失但仍可 `list` 时，面板打开时主动刷新。
- **[设计候选] 类型折中（P1-CAP-12）**：`lib/platform.ts` 不在 C2 写集；`DirectiveBridge` 扩展类型只放 `chat/ipc.ts`，在该文件内用 `unknown` + 类型守卫做结构断言/窄化（不写 `any`、不弱化 `DesktopBridge`），由 `npm run typecheck:renderer` 证明新方法可用；无法证明即停止回报，不改 `lib/platform.ts`。
- **[设计候选] 不实现 IPC**：不改 `app/main.ts`/`app/preload.cjs`；不新增 Node/文件系统能力；所有数据只经 preload 白名单与主→渲事件。

## 六、i18n 消费

- **[设计候选]** 所有用户可见文案只经 `useT()`/`translate()` 使用 A3 冻结的 `ui.directive.*` key（回执/系统行 key 由 A3 定义、由 C1 产出），zh-CN/en-US 随现有 locale store 切换；`.tsx`/store 不硬编码用户可见中英文。原文、id、命令、主机、路径、flowId、time、原因码等**数据**逐字显示，不是文案。
- **[设计候选] 候选 key 分区（以 A3 冻结为准，不自行新增）**：对话框标题/字段/动作/范围/资源/期限/高危原因/勾选/确认/取消/未识别片段/错误；面板标题/两组/状态/消费者/撤销/空态/账本错误；Composer 入口与能力禁用说明；**AC-22 卡内入口**的按钮/占位/提交/打开面板/禁用/状态/待答 shell 卡徽标。A3 必须纳入 P1-CAP-09 的“能力不可用/旧版本主进程”类别与上述卡内入口 key。若 A3 冻结集合缺少本提案所需标签，**停止回报**，不以硬编码或自造 key 绕过。

## 七、精确写集（不超出 `app/renderer/` 与 `test/桌面UI/`）

- **修改**：`app/renderer/src/shell/Composer.tsx`；`app/renderer/src/chat/ipc.ts`；**`app/renderer/src/shell/ConfirmCard.tsx`（团队计划 §十三增补）**；`app/renderer/src/shell/shell.css`（按需追加 AC-22/面板/对话框样式，只引现有令牌，不改既有 `.sc-overlay`/`.sc-card` 语义）。
- **新增**：`app/renderer/src/chat/directive-dialog.tsx`；`app/renderer/src/chat/directive-panel.tsx`；`app/renderer/src/stores/directive-store.ts`。
- **测试**：新增 `test/桌面UI/directive-dialog.test.ts`、`test/桌面UI/directive-panel.test.ts`；**只运行、不修改** `test/桌面UI/phase3b-electron-smoke.mjs`、`test/桌面UI/phase4b-electron-smoke.mjs`（作为既有 shell 卡回归证据）；按团队计划 §4.3 **仅条件更新** `test/桌面UI/phase5a-electron-smoke.mjs`（build 冒烟与 AC-22 卡内入口/共存断言）；如需按需更新 `test/桌面UI/confirm-logic.test.ts`、`decision-dialog.test.ts`，逐条在实现报告列理由，不弱化断言。**若实施确需修改 `phase3b`/`phase4b`，停止回报统筹/闸门 2 增补写集，不得自行扩写。**
- **不写**：`app/renderer/src/lib/platform.ts`、`App.tsx`、`ChatHeader.tsx`、`Drawer.tsx`、`app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**`、`test/桌面应用/**`、`package.json`/tsconfig/vite/发布配置、`docs/scheduling|acceptance|communication`、角色卡/边界。不新增依赖、不新增 `app/renderer/` 与 `test/桌面UI/` 之外路径；**不触碰 B-1..B-4 及任何边界条目**。
- **实现顺序**（前置：C1 IPC/preload 冻结 + A3 key 冻结 + A1 解析器冻结）：store 纯逻辑与测试 → `ipc.ts` 消费接线 → 确认对话框 → 指令面板 → Composer 回显抑制 → ConfirmCard 卡内入口/焦点互斥 → CSS/i18n → 层测试/typecheck/build/冒烟截图。

## 八、AC-22 设计（P1-CAP-08，W-1=A）

- **选定方案：A2（卡内指令入口）**。保留既有三张 `.sc-overlay` 的 `position:fixed; inset:0; z-index:60` 与 `aria-modal`，不改 shell 卡默认拒绝焦点、Esc 拒绝、原文逐字与 fail-closed 语义；A1（非全屏/可穿透/可最小化）会同时改动三张安全卡的模态与焦点陷阱，回归面与误操作风险更大，本提案不选。
- **UI/交互**：三张卡（shell 确认 / 升级 / 恢复）页脚各有一个折叠入口（`#sc-directive-entry`/`#se-directive-entry`/`#rc-directive-entry`），默认折叠，默认焦点仍是拒绝/取消按钮。展开后卡内出现（ID 按卡前缀 `sc-`/`se-`/`rc-`）：`@审批`/`@决策` 原文输入（`#sc-directive-input`，占位/标签用 A3 key）、提交（`#sc-directive-submit`）、打开指令面板（`#sc-directive-panel-open`）、状态/错误行（`#sc-directive-status`）。输入只接受以标记开头的指令；未命中/能力位 false ⇒ 行内错误，不发送、不产生聊天气泡；**卡载荷 target 无效时入口禁用并显示 A3 错误（校验口径见下条）**。
- **提交路径**：命中后使用与 Composer 相同的 `bridge.sendSession(text, [], target, {clientMessageId})`，**target 只取卡载荷 `{projectRoot, roleId, runtime}`**：三者必须均为非空字符串、`runtime` 属 `"pi"|"codex"|"claude"`、`projectRoot`/`runtime` 与渲染层当前项目/引擎一致，`roleId` 取卡片所属角色、不回退 Composer 当前选择。**任一缺失/非法/跨项目 ⇒ 严格 fail-closed**：入口禁用或提交被拒、行内 A3 错误，**不调用 `sendSession`、不画气泡、不落账**；不回退“当前选择”。不新增 IPC、不判 target、不预填/重算高危。主进程命中后经 `directive:confirm-request` 推达，既有 `DirectiveDialog` 在 shell 卡之上打开（z-index 90；shell 60、决策 80），shell 卡保持待答；确认/取消只走 `directiveConfirmRespond`，不调用 shell/recovery 的 respond 动作，不自动关闭/合并 shell 卡。
- **面板与共存**：卡内“打开指令面板”以 z-index 95 打开 `DirectivePanel`，顶部显示待答 shell 卡徽标（只读 `confirm-store`）；面板不占 `shellCardSlot`、不进一项目一卡队列、不计 `pendingCount/pendingRoles/judgingCount`，与 shell 卡不互相阻塞/合并/自动关闭。面板打开时角色卡仍按既有通道推达。
- **焦点/Esc 互斥**：`directive-store.overlayOpen`（dialog/panel）为 true 时，`ConfirmCard` 的 document Tab/Esc 陷阱直接 return；指令 dialog/panel 用 capture 阶段 keydown 处理 Esc/Tab 并 `stopImmediatePropagation`，关闭后焦点回到入口按钮（或拒绝按钮）。卡内输入区展开时 Esc 只折叠输入区，不回答 shell 卡；折叠/未展开时 Esc 保持既有 fail-closed 语义。`useCardFocus` 仅在卡 id 变化时聚焦拒绝按钮，不与入口抢焦点。
- **取消/失败**：保留卡内输入原文以便重试；成功打开确认对话框后清空输入；确认成功后由 C1 系统行回执，卡内不伪造回执。项目切换/关窗随 `directive-store.clearProject`/窗口生命周期清空入口与面板。
- **与“输入 `@审批`”的等价**：客户仍在应用内逐字输入同一 `@审批`/`@决策` 原文，同一 A1 解析器判定，同一 `sendSession` 入口与同一五通道确认/落账；差异仅是输入框位于 shell 卡内而非 Composer。不新增别名/命令/隐藏语法。若项目管理/验收认为必须由 Composer 输入，则 A2 不满足，应回统筹裁决（本提案不自行改语义）。
- **C1 配合要求（P1-CAP-15，A2 的必需条件）**：C1 必须在冻结声明中显式承诺并测试——shell 卡待答、Composer 未开会话时，卡内入口经同一 `sendSession` 提交的 target 仍按卡载荷受理并推 `directive:confirm-request`；**不依赖 Composer 当前会话/选中角色，target 缺失/非法即 fail-closed（不投递、不落账、不回退普通聊天）**；不得新增 renderer 可见字段/通道。若 C1 未按 P1-CAP-15 收口或无法在 shell 卡待答时投递，C2 不实现卡内入口，停止回报统筹。
- **既有 shell 卡回归清单**：`phase3b-electron-smoke.mjs`（默认拒绝焦点、原文/原因、details、Esc 拒绝、显式 allow、settled/expiry 收起）**只运行、必须原样通过、不修改**；`phase4b-electron-smoke.mjs`（expired 收起 + composer-hint）**只运行、不需要更新**；`phase5a-electron-smoke.mjs`（升级卡三按钮/necessity/context/pause/旧 preload 降级/expiry/200% 窄屏）保留并**追加**卡内入口共存断言——**它是唯一允许条件更新的冒烟文件**；`shell-escalation-view.test.ts` 纯视图函数不变。新增断言：入口默认折叠、默认焦点仍拒绝、卡内 `@审批` 提交后确认对话框打开且 shell 卡仍可见、卡内 Esc 不触发拒绝、面板打开时 shell 卡不关闭/计数不变；**卡载荷 target 缺失/非法/跨项目 ⇒ 入口禁用、零 `sendSession` 调用、零气泡/零落账；合法卡载荷 ⇒ `sendSession` 收到逐字 `{projectRoot, roleId, runtime}` 且不回退当前选择**；既有断言如需修改逐条列理由，不弱化。
- **AC-22 证据**：UI 测试（`directive-dialog.test.ts`/`directive-panel.test.ts` 的 store/纯逻辑 + `ConfirmCard.tsx` 源码守卫：三处入口/overlay guard/不调用 shell respond/**target 只取卡载荷且缺失/非法/跨项目 fail-closed、不回退当前选择**）、`phase3b` 原样运行 + `phase5a` 条件更新（`phase4b` 只运行；`phase3b`/`phase4b` 不修改）、真实截图（shell 卡 + 卡内输入 + 指令确认对话框/面板；关闭 DEBUG、sha256、窗口尺寸、拍摄命令，存 `角色卡/桌面UI/docs/change/…-evidence/`）、D1 集成（shell 卡待答 → 卡内提交 → 确认 → 账本/系统行 → shell 卡仍待答；角色卡仍推达）、D2 真实运行。C2 负责 UI 测试与截图；D1/D2 由测试/桌面窗口执行。

## 九、AC 映射与交接条件

| AC / 场景 | 本提案提供的 UI 证据 | 交接/依赖 |
| --- | --- | --- |
| AC-1（UI 子集） | 空正文时字段留空、确认禁用；近失配不弹面板、正常气泡；命中无“发给幕僚”气泡 | A1 解析器冻结；C1 拦截 |
| AC-3 | 原文/动作/范围/资源/期限、未识别片段、`confirmable:false` 确认禁用；窄屏截图 | C1 `directive:confirm-request` 冻结字段 |
| AC-4（UI 子集） | 取消/面板不可用/写失败：原文回草稿、无气泡、无假回执；项目切换取消未决面板 | C1 错误语义；`SendResult.directiveCancelled` |
| AC-5（回执 UI） | 只渲染 C1 系统行；面板/对话框不拼接“已记录/已撤销” | A3 回执 key；C1 emitEvent/appendSystemRow |
| AC-10（冲突/不匹配 UI） | 既有 `delivery-note` 系统行可见；零新增字段/零新渲染分支；卡仍呈现 | C1 `emitDirectiveNotice` + A3 `main.directive.decision.*`；D2 截图 |
| AC-13（高危 UI） | 风险横幅 + 必勾选 + 确认禁用；未勾选不发送 `acknowledged`；渲染侧不重算 | A1 谓词、C1 复核、A3 原因文案 |
| AC-17 | zh-CN/en-US 可切换、无硬编码、无 missing-key；面板/回执/高危/错误/能力禁用/卡内入口全覆盖 | A3 key 集合与计数冻结 |
| AC-22 | **§八 A2 设计**：卡内入口不占 `shellCardSlot`/不进队列/不改计数；不阻塞/合并/自动关闭；项目切换清空；shell 卡待答仍可输入指令并打开面板；**卡载荷 target 缺失/非法/跨项目严格 fail-closed（不提交、不落账、不回退当前选择）** | C1 五通道/窗口生命周期（P1-CAP-15 收口）；D1/D2 |
| AC-11/12/16/24（UI 子集） | 状态分组、active 撤销、账本错误横幅、`(id, createdAt)` | C1 list/revoke/state 载荷 |
| AC-15（非 C2 主责） | C2 只保证无指令路径与 Composer 既有发送不变；全量与 Q9 旧读者由 C1/D1/E1 覆盖 | C1/D1/E1 |
| AC-18（非 C2 主责） | C2 提供候选哈希、命令、截图元数据；E1 汇总 | E1/D1/D2 |
| AC-19（非 C2 主责） | C2 基于 `4c3a6e4`；rebase 由统筹/E1 处理，若 renderer 受影响则重跑 C2 证据 | 统筹/E1 |
| AC-20（非 C2 主责） | C2 结构检查：无 `@边界` 解析、无英文/全角别名、无新依赖/新通道；E1/E2 核对 diff | E1/E2 |
| AC-23（非 C2 主责） | `not applicable`（O9 未选）；C2 只实现基础 `directivesEnabled` 语义（AC-2/22），不写 false 分支 | V1 §1.3/团队计划 §7.1 |

- **[设计候选] 冻结前置**：C2 只在 **C1 IPC/preload 形状冻结 + A3 key 冻结 + A1 解析器冻结** 后开工；C1 冻结必须含五通道/载荷、五个 preload 方法、`SendResult.directive/directiveCancelled`、能力位推送与 `projectRoot` 作用域。任一未定，C2 不写引用代码。

## 十、T3 验证与证据

- **命令**：`node --test --test-concurrency=1 "test/桌面UI/*.test.ts"`（B0 基线 374/374；新增用例后逐项对照，新增确定性失败=0、新增 skip=0）；`npm run typecheck:renderer`（同时证明 `ipc.ts` 结构断言/窄化通过）；`npm run build:renderer`。
- **真实 Electron 冒烟/截图**：临时 userData、关闭 DEBUG、不录屏；至少覆盖：命中→对话框→确认→系统行回执；AC-10 冲突/不匹配系统行；空正文/高危未勾选禁用；面板两组/撤销/`(id,createdAt)`；项目切换清空；能力位 false 时普通气泡；**AC-22 shell 卡待答 → 卡内 `@审批` → 确认对话框/面板 → shell 卡仍待答**。截图记录候选哈希、sha256、窗口尺寸、拍摄命令，存 `角色卡/桌面UI/docs/change/…-evidence/`。
- **候选哈希**：改动/新增源码与测试逐文件 `git hash-object` + `sha256sum`；`app/renderer/dist/` 为忽略产物、非候选；不 commit/push。
- **无新依赖/构建改动**：沿用 zustand、lucide、现有 shadcn 组件与令牌；不新增 package/tsconfig/vite 变更。

## 十一、风险、开放点与需统筹裁决项

1. **[已通过，保留] 面板入口**：Composer 控件行内紧凑入口按钮（`id="btn-directive-panel"`，图标+短标签，窄屏仅图标）在 C2 写集内；若 UIUX/项目管理要求会话头/抽屉入口，需另批写集，不自行扩写。
2. **[A2 风险] 焦点/层级互斥**：必须验证 `ConfirmCard` trap 在 directive overlay 打开时让位、capture 阶段 Esc/Tab 不误答 shell 卡；`shell.css` 只追加样式，不改 `.sc-overlay/.sc-card` 既有规则；200% 窄屏与三张卡逐一截图。
3. **[风险] 能力位时序**：C1 已选主进程先行握手；C2 首发送前有界等待初始读，超时/失败按 false 正常发送。若 C1 实现偏离冻结握手，停止回报，不自行猜能力。
4. **[风险] i18n key 集合以 A3 为准**：缺 key 即停回报；不在 `.tsx` 硬编码兜底。
5. **[风险] 窄屏/布局**：新增入口与对话框/面板须过 `@container composer` 720/480 断点与 200% 窄屏冒烟；不新增固定 px 宽度、不引入裸色值。
6. **[风险] 旧主进程/旧 preload**：能力禁用并说明；不因本地解析命中而抑制气泡；不假造面板/回执。
7. **[风险] 项目切换与迟到事件**：按 `projectRoot` 丢弃旧项目推送；`clearProject` 先清空再刷新，避免串项目 `session` 指令。
8. **[风险] A2 等价性**：卡内输入与 Composer 输入共用同一 `@审批`/`@决策` 原文、同一解析器、同一 `sendSession` 入口；若验收要求“必须在 Composer 输入”，A2 不满足，回统筹裁决（不自行改 V1）。

## 十二、声明

本文件仅为 C2 实现提案。未写产品代码、测试代码或样式，未改任何角色卡/边界/其他角色文档，未运行测试/typecheck/构建，未启动应用，未 commit/push，未接触客户。提案经项目管理 P1 复审通过且前置契约冻结后才进入 C2。

## 十三、修订记录（Revision 1，2026-11-03）

- **触发/范围**：P1 审核 **193 行 / `65f888a6…`** 结论 `needs revision`；客户 W-1 裁决 **A**，团队计划 §十三增补至 **664 行 / `ecac818c…`**（仅 C2 写集增补 `ConfirmCard.tsx`/按需 `shell.css`，C1 写集不变）。本修订只改本文件、原位窄修订；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `4c3a6e4…`；`git status --porcelain -- src app test` 为空。
- **输入复核（只读）**：方案 P1.1 **1199 / `7875ad6a…`**（确认基线，冲突以此为准）与 P1.2 **1209 / `1748ad2d…`**（R1/R2 编辑性等价）；V1 **1171 / `51ac0f50…`**；C1 修订稿 **210 / `866596f0…`**；P1 审核 **193 / `65f888a6…`**；沟通记录 **168 / `9f19821e…`**（含 W-1=A）。

| 项 | 处置（修订后位置） | 测试/证据（计划） |
| --- | --- | --- |
| **P1-CAP-05**（阻断，C1/C2 冻结） | §三/§四/§五：按 C1 §2.4 冻结表逐字消费五通道/载荷与五个 preload 方法；正文只出现 `directivesEnabled`/`confirmable`/`directiveConfirmRespond` 三个冻结名；`DirectiveListView` 固定 `{active,consumed,revoked,expired}`；旧候选名已删除 | `typecheck:renderer`；`directive-dialog.test.ts`/`directive-panel.test.ts`；D2 |
| **P1-CAP-06**（阻断，AC-10 UI） | §四/§九：沿用 C1 `emitDirectiveNotice`→既有 `emitEvent` 的 `delivery-note` 系统行（A3 `main.directive.decision.*`）；C2 零新增字段/零新渲染分支；补 AC-10 冲突/不匹配系统行 UI 证据 | 既有 `session:events` 映射测试 + D2 截图 |
| **P1-CAP-07**（阻断，AC-2） | §二/§五：消费 C1 主进程先行握手（`did-finish-load`/`app:list-project`/`app:recovery-ready` 推 `directive:state`；preload 缓存同步回放；`directive:list` 成功含 `directivesEnabled`）；C2 首次发送前 await 初始读（有界超时/失败按 false 正常发送、不抑制气泡）；保留 `res.directive` 迟到时移除乐观气泡兜底 | 单测（已缓存/超时/false/迟到 directive）；D2 首输入 |
| **P1-CAP-08**（阻断，AC-22） | §八：选 **A2 卡内指令入口**；写集增补 `ConfirmCard.tsx` + 按需 `shell.css`；三卡入口、焦点/Esc 互斥、面板徽标、既有 shell 卡回归清单与 AC-22 证据 | `phase3b`/`phase5a` 冒烟 + UI 测试 + 真实截图 + D1/D2 |
| **P1-CAP-12**（非阻断） | §九：AC 表补 AC-15/18/19/20/23 的“非 C2 主责/由 D1/E1/E2 覆盖”说明；`lib/platform.ts` 不在写集，`ipc.ts` 内结构断言/窄化，须由 `typecheck:renderer` 证明；不弱化类型 | `typecheck:renderer`；AC 表 |

- **未改项（保持已通过）**：Composer 回显抑制（共享 `parseDirectiveMarker` + `directivesEnabled`，仅能力位 true 才抑制）；对话框/面板/store/样式；i18n 只消费 A3 key；无新依赖/构建改动；写集除 `ConfirmCard.tsx`/`shell.css` 外不变（`Composer.tsx`、`chat/ipc.ts`、新对话框/面板/store、`test/桌面UI/`）；不写 `App.tsx`/`lib/platform.ts`/`app/desktop`/`app/main.ts`/`app/preload.cjs`/`src/**`。
- **停止项/裁决**：修订后无新增阻断；W-1 已由闸门 2 增补 A 裁决。实施前仍需 A1/A3/C1 冻结；若 A3 缺卡内入口/能力不可用 key、或 C1 无法在 shell 卡待答时投递 `directive:confirm-request`、或验收认为 A2 不等价于“输入 `@审批`”，C2 停止回报统筹，不自行扩写集/改语义。
- **状态**：仍为 `proposal-only, no code`；未运行测试/typecheck/应用；待项目管理窄复审。

## 十四、修订记录（Revision 2，2026-11-03）

- **触发/范围**：P1 复审记录 **306 行 / `8427ff02…`** 结论仍 `needs revision`，其中 C2 侧新增 **P1-CAP-16**（阻断，写集措辞）与 **P1-CAP-18**（非阻断，冻结前收口）。本修订只处置这两项、只改本文件；未改产品/测试代码、其他角色文档、角色卡/边界/`docs/scheduling|acceptance|communication`；未 commit/push。基线 HEAD `4c3a6e40…`；`git status --porcelain -- src app test` 为空。
- **输入复核（只读）**：团队计划 v1 **653 / `37e6bd0d…`** + §十三增补 **664 / `ecac818c…`**（C2 写集仅增补 `app/renderer/src/shell/ConfirmCard.tsx`/按需 `shell.css`）；方案 P1.1 **1199 / `7875ad6a…`**（确认基线；盘上未单独落盘，以 P1.2 **1209 / `1748ad2d…`** 承载，冲突以 P1.1 为准）；V1 **1171 / `51ac0f50…`**；C1 修订稿 **210 / `866596f0…`**；P1 复审 **306 / `8427ff02…`**；沟通记录 **168 / `9f19821e…`**（本次输入快照；盘上当前 **174 / `80b9170d…`**，仅追加“提交/合并预授权”节，未改 W-1=A 与 P1 口径）。

| 项 | 处置（修订后位置） | 测试/证据（计划） |
| --- | --- | --- |
| **P1-CAP-16**（阻断，C2 写集措辞） | §七“测试”行：`phase3b`/`phase4b` 改为**只运行、不修改**；按团队计划 §4.3 **仅 `phase5a` 条件更新**。§八“回归清单”“AC-22 证据”：删除“条件更新/冒烟扩展 phase3b/phase4b”越界表述；保留“`phase3b` 原样通过、`phase4b` 不需更新”的一致口径。若实施确需修改 `phase3b`/`phase4b`，停止回报统筹/闸门 2 增补写集，不得自行扩写 | `phase3b`/`phase4b` 只运行、零 diff；`phase5a` 条件更新；实现报告列改动理由 |
| **P1-CAP-18**（非阻断→冻结前收口） | §八“UI/交互”“提交路径”：卡内入口 target **只取卡载荷 `{projectRoot, roleId, runtime}`**；**缺失/非法/跨项目 ⇒ 严格 fail-closed**（入口禁用或提交被拒、A3 行内错误、不调用 `sendSession`、不画气泡、不落账），**不回退“当前选择”**。§八“回归清单”补对应断言；§九 AC-22 行同步 | `directive-dialog.test.ts`/`directive-panel.test.ts` 的 target 校验纯逻辑 + `ConfirmCard.tsx` 源码守卫（不读 Composer 当前选择） + D1/D2 |
| **C1 P1-CAP-15 配合（A2 必需条件）** | §八“C1 配合要求”：注明 A2 依赖 C1 冻结显式承诺并测试“shell 卡待答、Composer 未开会话时仍按卡载荷 target 路由 `sendSession`、无 target fail-closed、不回退普通聊天”；C1 未收口则 C2 不实现卡内入口 | C1 `directive-input.test.ts`/`directive-decision.test.ts`（C1 主责）；C2 以 C1 冻结声明为前置 |

- **保留（Revision 1 已通过，不重开）**：A2 三卡页脚折叠入口、同一解析器/同一 `sendSession`、z-index/焦点/Esc/徽标/不占卡槽/不进队列；C1 冻结名/载荷逐字消费（`directivesEnabled`/`confirmable`/`directiveConfirmRespond`、五通道/五方法）；系统行 `directiveNotice` 零新增字段；`ensureInitialRead()` 握手；AC 表补注；`typecheck:renderer` 证明。写集仍为 `ConfirmCard.tsx`/按需 `shell.css` + 既有 C2 文件；不新增第三条 `test/桌面应用/` 文件。
- **停止项/裁决**：修订后无新增阻断。实施前仍需 A1/A3/C1 冻结；若 C1 未按 P1-CAP-15 收口、A3 缺卡内入口/能力不可用 key、或实施确需修改 `phase3b`/`phase4b`，C2 停止回报统筹，不自行扩写集/改语义。
- **状态**：仍为 `proposal-only, no code`；未运行测试/typecheck/应用；待项目管理窄复审。

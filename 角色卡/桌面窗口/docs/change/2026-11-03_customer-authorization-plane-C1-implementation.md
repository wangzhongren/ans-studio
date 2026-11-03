---
id: customer-authorization-plane-c1-implementation
type: change
title: 客户授权平面 C1 实施记录：桌面主进程指令接线、decision 消费者与 Q9 归属
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - 角色卡/桌面窗口/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md
  - 角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md
  - 角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-implementation.md
  - 角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-implementation.md
  - 角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A3-implementation.md
events:
  - date: "2026-11-03"
    kind: created
    summary: 按 C1 P1 提案 Revision 2 实施主进程指令控制器/五 IPC/preload/decision 消费者/Q9；目标 22/22、受影响 26/26、桌面 522/522、typecheck exit 0
---

# 客户授权平面 C1 实施记录：桌面主进程指令接线

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：桌面窗口（固定角色；本上下文只承担该角色）/ 团队计划 §5.1 **C1（桌面主进程接线）**。
- **状态**：**`implemented-unverified`**。实施完成、证据已采集；**未验收、未 commit/push**，不替代 C2/D1/D2/E1/E2。
- **基线 [事实]**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；开工前 `npm run typecheck` **exit 0**；
  `git status --porcelain -- src app test` 为 A1/A2/A3/B1 未提交候选（27 项，无 `app/**`）。C1 只写 `app/**`、
  `test/桌面应用/**` 与自身证据；A1/A2/A3/B1 22 个候选文件 `git hash-object` 写前=写后逐字一致。

## 1. 输入与版本（只读实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| C1 P1 提案（Revision 2） | 232 | `13f1fd1c93f3d5713f37b094554c36cba33a622ded817fd9eb4e178319e8e9a3` | 本实施按其 §二–§七 |
| P1 审核记录（含 R1/R2/P1-CAP-15） | 397 | `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c` | `recommend approval` |
| 团队计划（含 §十三增补） | 664 | `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8` | v1 653/`37e6bd0d…` + §十三 |
| 方案 P1.1（确认基线） | 1199 | `7875ad6a…`（派发记录） | 冲突以此为准；盘上为 P1.2 |
| 方案 P1.2（盘上编辑性等价） | 1209 | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | R1/R2 收口 |
| V1 实施前标准 | 1171 | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | AC-1..AC-24 |
| B0 基线记录 | 239 | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` | 基线计数 |
| A1 实施记录 | 165 | 见其证据目录 | Model/解析器/高危谓词/Q9 类型 |
| A3 实施记录（key 冻结） | 135 | 见其证据目录 | 104 新 key、总计 1746、GLOBAL 98 |
| B1 实施记录 | 172 | `db0ecf35f4ef500158ac02d915918ab05a156f2153f3b4e400e787ef8f48e7b5` | Pipeline 公共句柄/decision 消费者/shell gate/Q9 |
| B1 公共 API（只读） | 705 | `9202cec3eb3a7aec724ba825706a470b7fdaa522`（git hash-object） | `SubmitFromInput.decisionGroupEnabled`、`DecisionHooks.emitResult`、`takeDirective`、`revoke`、`list` |

## 2. 写集与实际改动

### 2.1 新增（3）

| 路径 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- |
| `app/desktop/directive-input.ts` | 812 | `9ef61de1d63c54525a7fa1d0aa818cbab9cc8fcc` | `914868d83015e331b412fda9a6c86040fc20a6f1e5dbc22b75c706728d6f4caa` |
| `test/桌面应用/directive-input.test.ts` | 720 | `2fc15f483fd9ec85be725a2d8c2e4bc8527b766c` | `ffb3210e9ec575101b7669917cf489940520f7a7776da07cbdba53d83a6bb924` |
| `test/桌面应用/directive-decision.test.ts` | 351 | `b8c603d7acc1b1e2db69fdebd2f18c74db7e52fa` | `1206365325c436a2fb88f27266a6b472543f0d92ac6fa60e2f33a2bdd5174478` |

### 2.2 修改（8；写前 HEAD blob / 写后候选见 `05-candidate-hashes.txt`）

| 路径 | 行数 | 改动 |
| --- | --- | --- |
| `app/desktop/interface.ts` | 2719 | `DesktopDeps.directiveInput?`；`sendSession` 先解析标记（命中带图拒绝、target fail-closed、调用控制器、绝不 `manager.send`）；`resolveDirectiveTarget`；Q9 `interface.ts:1406-1411` 旧读者三值 |
| `app/desktop/session.ts` | 8827 | `SendResult.directive?`/`directiveCancelled?`；Q9 run-change/`request.resolved`/`decidedByText`/`version.decision` 三值 + `directiveId`（单一解析） |
| `app/desktop/customer-input.ts` | 2271 | decision 消费者（只 `cardKind==="decision"`，先于 `tryAutoSelectDecision`）；`directing` 状态/占位；冲突/不匹配系统行；`emitResult` 可见行先于 durable consume；`operatorId:"directive:<id>"` + `outcome.directive` |
| `app/desktop/requirement-change.ts` | 422 | `source` 三值、来源文案（A3 key）、主理执行任务入参同步 |
| `app/main.ts` | 1222 | 五通道接线（sender 校验/窗口作用域）；`directivesEnabled` 主进程先行推送（did-finish-load/list-project/recovery-ready）；关窗取消/重推/项目切换；应用运行级 `sessionId`；`createCustomerDirectiveRuntime` 注入；系统行复用 `emitEvent` delivery-note |
| `app/preload.cjs` | 495 | 五白名单方法（`onDirectiveConfirmRequest`/`directiveConfirmRespond`/`listDirectives`/`revokeDirective`/`onDirectiveState`）；`directive:state` 缓存 + 注册同步回放；不暴露 Node 能力 |
| `test/桌面应用/run-change.test.ts` | 224 | 新增 Q9 指令归属用例（manifest `decidedBy:"directive"` + `directiveId`） |
| `test/桌面应用/version-decision.test.ts` | 796 | 新增 Q9 指令归属用例（`request.resolved.by` + `directiveId`；`version.decision.decidedBy` + `directiveId`） |

- **未修改/未回退**：`src/**`（A1/A2/A3/B1 22 文件哈希逐字一致，见 `06-a1-a2-a3-b1-hashes.txt`）、
  `app/renderer/**`、其他角色资料、角色卡/边界、`docs/scheduling|acceptance|communication`。
- **`app/desktop/recovery-channel.ts` 零改动**：其 presenter/respond 签名与 C1 指令面板无关；桌面全套件
  522/522 通过（含 recovery/shell 卡用例），无回归。**未改即无回归理由：复用面未变化。**
- **`test/桌面应用/interface.test.ts` / `decision-service.test.ts` 未改**：既有断言覆盖未命中普通路径与
  decision 默认推荐；C1 新增分支由 `directive-input.test.ts`/`directive-decision.test.ts` 覆盖；
  桌面全套件 522/522 证明零回归。**未弱化既有断言。**
- **`test/桌面应用/e2e/main.mjs` 未扩展**：条件项仅 D2 真实运行需要；C1 未新增 e2e 脚本。
- **`test/桌面应用/session.test.ts` 未创建**：边界陈旧条目；Q9 SessionManager 断言放入
  `run-change.test.ts`/`version-decision.test.ts`。
- **未新增依赖/构建配置/路径**；`git diff --cached --name-only` 为空。

## 3. 实现要点

### 3.1 `app/desktop/directive-input.ts`（应用层控制器）

- 每项目懒创建 B1 `CustomerDirectiveRuntime`（`createCustomerDirectiveRuntime` 唯一实现）；项目切换只
  `cancelProject` 未决面板、**不销毁**旧运行时；切回同一运行内 `session` 指令仍有效。
- `submitFromInput`：项目授权来源校验 → 输入式撤销分流 → B1 创建；幂等键
  `(projectRoot,target,rawText,clientMessageId)` 有界内存（≤100）；无 `clientMessageId` 按普通新提交。
- **输入式撤销**（B1 交接口径）：`撤销 #d-<seq>` 经 `runtime.list()` 查目标（同 target/active），确认后
  `runtime.revoke(id,target)`；终态/跨 target/不存在直接如实回错，不开面板；成功后回执 + 列表刷新。
  撤销只减少授权，不做高危二次确认。
- 确认回包：只按提交快照校验 target/值形状/until/scope；调用 A1 谓词用快照
  `decisionGroupEnabled` **复算高危**；未 `acknowledged:true` ⇒ `high-risk-unacknowledged` 且面板保持可重试。
- `list`/`state`：同一 B1 service 视图（`{approval,decision,ledgerErrors}` 一一映射；`version:1` +
  `directivesEnabled:true`）；不新增跨 target 字段、不跨项目聚合；无当前项目 fail-closed（state 为空视图）。
- `replayPending`/`cancelAll`/`cancelProject`：未决面板独立 pending，**不占** `shellCardSlot`、
  **不进** customer-input 一项目一卡队列、不计入挂起数。
- 回执/撤销系统行经注入 `emitNotice`（main.ts 用既有 `emitEvent` `delivery-note`），不含原文全文、不进模型；
  投达失败只记诊断（durable 已成功不回滚）。

### 3.2 `interface.ts::sendSession`（命中拦截）

- **先** `parseDirectiveMarker(text)`（A1 唯一解析器），**早于**图片校验与 `manager.send`。
- 命中且带图 ⇒ 直接拒绝（不解码、不投递、不落账）；命中无图 ⇒ 只调用 `directiveInput.submitFromInput`，
  **不调用** `manager.send`/`handle.send`；不写 `lastUserText`/`inputAccepted`/`turnId`/`outcome`/
  `sessionCurrent`、不发 `session:events`。
- 卡内入口 target 取卡载荷 `{projectRoot,roleId,runtime}`：`projectRoot` 必须等于当前项目授权来源
  （`listProject` 成功值）、`roleId` 在 `ProjectListing.roles` 内、`runtime` 有效；缺失/非法/跨项目
  ⇒ `{ok:false,error}`，不回退普通聊天/当前选择。Composer 未开会话或当前 target 不同也仍走指令通道
  （`directive-input.test.ts` 用例）。
- 未命中：既有图片真实字节重校验/`manager.send` 路径逐字不变。

### 3.3 `customer-input.ts`（decision 消费者）

- 只 `cardKind==="decision"`，在 `tryAutoSelectDecision` 之前进入；新增 `directing` 占位（不计入
  `pendingCount`/`pendingRoles`/`judgingCount`）。
- 读 B1 `applyDecisionDirective`（唯一规则来源）：唯一推荐/唯一 label·前缀/拒绝/scope；冲突/不匹配
  不消费任何一条、**绕过默认推荐**、呈现客户卡 + A3 系统行说明。
- 可见结果行 `emitResult` 先于 durable `once` 消费（B1 冻结）；投达失败/无适用指令回落；有适用指令但
  未应用 ⇒ 直接呈现客户卡，不借默认推荐代选。
- 成功结算 `answered{selected:[optionId]}` / `declined`，`operatorId:"directive:<id>"` +
  `CustomerInputOutcome.directive`；`once` durable 失败 ⇒ 回落客户卡，无 outcome/审计；`request.presented.to`
  不扩展（W-6）。

### 3.4 Q9 桌面读者

- 单一解析 `directiveIdFromOperatorId`（`operatorId:"directive:<id>"`，A1 id 模式）。
- `session.ts`：run-change `decidedBy` 三值 + `directiveId`；`request.resolved.by:"directive"` +
  `directiveId`（不写 `request.presented`）；`decidedByText` 用 A3
  `ui.versionDecision.decidedBy.directive`；`version.decision.decidedBy` 三值 + `directiveId`。
- `requirement-change.ts`/`interface.ts`：审批来源三值 + 文案；主理执行任务入参同步。
- 旧二值记录仍可读；无 `directiveId` 的旧事件不被改写。

### 3.5 `main.ts` / `preload.cjs` 生命周期

- 应用运行级 `directiveSessionId = randomUUID()`（模块初始化一次；项目切换不重置；重启失效）。
- `directive:confirm-response`/`list`/`revoke` sender 校验（`event.sender === win.webContents`）；
  `directive:confirm-request`/`state` 只主→渲。
- `did-finish-load`、`app:list-project` 成功、`app:recovery-ready` 推 `directive:state`；`focus`/`show`/
  `recovery-ready` 重推未决面板；关窗 `cancelAll`；项目切换 `setCurrentProject`（取消旧未决）。
- preload 顶层缓存最后一条 `directive:state`；`onDirectiveState` 注册同步回放后订阅；五方法只经
  `ipcRenderer.invoke/on`。

## 4. 验证与原始结果

| # | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck`（C1 前） | **exit 0** | 00 记录 |
| 2 | `npm run typecheck`（C1 后） | **exit 0**（无输出） | `01-typecheck.log` |
| 3 | `node --test --test-concurrency=1 test/桌面应用/directive-input.test.ts test/桌面应用/directive-decision.test.ts` | **22 tests / 22 pass / 0 fail / 0 skipped / 0 todo，exit 0，1126.2ms** | `02-tests-target.log` |
| 4 | 受影响既有：`interface.test.ts`、`decision-service.test.ts`、`run-change.test.ts`、`version-decision.test.ts` | **26 tests / 26 pass / 0 fail / 0 skipped，exit 0，2576.1ms** | `03-tests-affected-existing.log` |
| 5 | 桌面全套件：`node --test --test-concurrency=1 "test/桌面应用/"*.test.ts` | **522 tests / 522 pass / 0 fail / 0 skipped，exit 0，63853.8ms** | `03-tests-desktop-all.log` |

- **失败分类**：无新增红；目标/受影响/全套件零失败。无 skip/todo 新增。
- **环境**：Node `v24.22.1`；npm `11.19.1`；Windows 11 Pro 10.0.26300（MINGW64/Git Bash）；
  worktree `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane`；
  时区 Asia/Shanghai。
- **候选身份**：`05-candidate-hashes.txt`（行数 + SHA-256 + `git hash-object`）。
- **A1/A2/A3/B1 未变**：`06-a1-a2-a3-b1-hashes.txt`（22/22 写前=写后）。
- **静态检查**：`07-static-checks.txt`（`app/renderer/**` 空、仅 C1 写集、无 skip/todo、无 package/lock 变更、
  指令面板不占卡槽/队列）。
- **冻结声明**：`08-freeze-statement.txt`。
- **证据文件行数/SHA-256**：`09-evidence-hashes.txt`（最后生成）。

## 5. AC 映射（C1 证据；不替代 V1）

| AC | C1 证据 |
| --- | --- |
| AC-1/AC-2 | `directive-input.test.ts`：命中/未命中/带图拒绝/空正文命中；`manager.send`/`handle.send` 零次；不产生角色轮次；未命中既有路径不变；`directiveInput.test` 能力缺席 fail-closed；能力位 handshake 源码钉 |
| AC-3 | 确认面板冻结字段（原文/动作/范围/期限/`unrecognized`/`confirmable`/`decisionGroupEnabled`）；回包快照复核 |
| AC-4 | 取消/关窗：零账本、零投递、`directiveCancelled:true`、无「已记录」回执 |
| AC-5 | 回执仅在 durable 成功后经 `emitNotice` 系统行；不含原文；目标测试断言回执文本 |
| AC-6 | C1 只消费 B1 `list`/`state`/错误码；坏账本按无指令（`directive-decision.test.ts`） |
| AC-7 | 决策消费者只读 `decisionFacts`/B1 target-scoped；跨 target 撤销直接回错 |
| AC-8/AC-9 | B1 证据；C1 不接线审批消费 |
| AC-10 | 推荐/选项/拒绝/冲突/不匹配绕过默认推荐；Q9 run-change/version-decision；`once` 回落 |
| AC-11 | 同一运行内项目切换往返 `session` 指令仍 active；应用运行级 `sessionId` 源码钉 |
| AC-12 | 面板 `directive:revoke` + 输入 `撤销 #id` 同服务路径；同 target/active；即时生效；回执/列表刷新 |
| AC-13 | `decisionGroupEnabled` 2×2 + 提交当刻快照 + 面板保持；未勾选拒绝零账本 |
| AC-14 | 指令类型无写权目标；C1 只接线，不新增工具/写权 |
| AC-15 | 无指令路径逐字不变；Q9 六处读者三值；桌面 522/522 |
| AC-16 | 坏账本按无指令、列表如实 `ledgerErrors`、不伪造回执 |
| AC-17 | 只消费 A3 key；无硬编码用户可见字符串（错误/回执/Q9 均经 `mainT`） |
| AC-18 | 本记录 + 证据目录（行数/SHA-256/命令/原始输出） |
| AC-19 | 基线 `4c3a6e4`；rebase 后按 D1 重跑 |
| AC-20 | 无 CLI/模型解释/`@边界`/O9 false 分支；`directivesEnabled` 恒 true |
| AC-21 | 只按 Q9 A 扩展；无联网/目录消费者 |
| AC-22 | **C1 主进程侧**：独立 pending、不占卡槽/队列、切项目取消、session 按项目账本、卡内入口同 `sendSession` + target fail-closed；C2 ConfirmCard 侧不声称 |
| AC-23 | not applicable（O9 未选）；能力位恒 true |
| AC-24 | C1 只提供 `(id, createdAt)` 视图数据（B1 排序）；重号风险由 B1/文档披露 |

## 6. 披露、交接与停止项

1. **`recovery-channel.ts` 零改动**：presenter/respond 签名未变化，桌面全套件 522/522（含恢复/壳卡用例），
   无回归；不需要最小适配。
2. **输入式撤销的面板载荷**：B1 `DirectiveConfirmationValues` 无 revoke 动作；C1 不新增冻结字段——撤销面板
   复用既有 `prefill{action,scope,until,unrecognized}`（目标摘要 + `unrecognized:["撤销 #d-N"]`）与
   `confirmable:true`，C2 按 `rawText`/`unrecognized` 识别撤销并渲染 A3 `ui.directive.dialog.action.revoke`/
   `field.revokeTarget`。若 C2 要求新增显式 `revoke` 字段，双方停止回报统筹，不自行扩写集。
3. **`respond` 内部为 async**：`directive:confirm-response` 的 IPC 载荷/回包形状不变；async 只用于撤销
   durable 调用后如实回错（面板保持可重试）。创建路径回包仍在 B1 durable 后由 `submitFromInput` 结算。
4. **`directive:state` 账本不可读**：`state()` 返回 undefined，主进程只记诊断并跳过本次推送；面板经
   `directive:list` 的 `{ok:false,error}` 如实显示不可用，不伪造空账本。
5. **幂等范围**：创建幂等由 B1 `(target,rawText,clientMessageId)` + C1 `(projectRoot,...)` 有界映射；
   跨重启不去重（B1 冻结）；撤销幂等只在同一次成功回执后同键复用，跨进程按目标状态回 `already-revoked`。
6. **D2/E2**：未运行真实 Electron e2e、未截图、未跑全仓 T3；`implemented-unverified`。D2 如需 e2e 夹具，
   在既有 `test/桌面应用/e2e/main.mjs` 内扩展（C1 未新建脚本）。
7. **无停止项**：未发现需要改 `src/**`/`app/renderer/**`、扩写集或新增依赖；A1/B1/A3 冻结契约够用。

---
id: customer-authorization-plane-b1-implementation
type: change
title: 客户授权平面 B1 实施记录：账本 Provider/Service/Pipeline + shell 审批消费者 + Q9 审计枚举
created: "2026-11-03"
updated: "2026-11-03"
timezone: Asia/Shanghai
status: implemented-unverified
related:
  - 角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-P1-proposal.md
  - 角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md
  - 角色卡/运行时核心/docs/change/2026-11-03_customer-authorization-plane-A1-implementation.md
  - 角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-A2-implementation.md
events:
  - date: "2026-11-03"
    kind: created
    summary: 按 B1 P1 提案 Revision 1 实施 Provider/Service/Pipeline/shell gate/Q9/task-state 迁移；737/736/1/0（同一既有 EPERM）；typecheck exit 0
---

# 客户授权平面 B1 实施记录：账本与审批消费者

- **任务 / flowId / 档位**：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane` / **T3**。
- **角色 / 节点**：编排（固定角色；本上下文只承担该角色）/ 团队计划 §5.1 **B1（账本与审批消费者）**。
- **状态**：**`implemented-unverified`**。实施完成、证据已采集；**未验收、未 commit/push**，不替代 C1/C2/D1/D2/E2。
- **基线 [事实]**：HEAD `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；B1 开始前 `git status --porcelain -- src app test` 为 A1/A2/A3 未提交候选 11 路径（A1 6 + A2 2 + A3 3），见 `00-environment-and-baseline.txt`；A1/A2/A3 哈希在 B1 前后逐字一致。
- **入口**：P1 审核 397 行 / `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c`（`recommend approval`）；B1 P1 提案 Revision 1 242 行 / `0d98e2004a6e7b07c749158ca8c582220d649eec437f9274cb14385384e97778`；A1/A2 冻结声明与 A3 key 集合已就绪。

## 1. 输入与版本（只读实测）

| 输入 | 行数 | SHA-256 | 说明 |
| --- | --- | --- | --- |
| B1 P1 提案（Revision 1） | 242 | `0d98e2004a6e7b07c749158ca8c582220d649eec437f9274cb14385384e97778` | 本实施按其 §1/§3/§4/§5/§7 |
| P1 审核记录（含 R1/R2） | 397 | `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c` | `recommend approval` |
| 团队计划（含 §十三增补） | 664 | `ecac818c705b97203aa6b711c34934be0bc324f21f9e24ed949ebf915ecd56b8` | v1 653/`37e6bd0d…` + §十三 |
| 方案 P1.1（确认基线） | 1199 | `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229` | 冲突以此为准 |
| 方案 P1.2（盘上编辑性等价） | 1209 | `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688` | R1/R2 收口 |
| V1 实施前标准 | 1171 | `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069` | AC-6..AC-16/AC-18 |
| B0 基线记录 | 239 | `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441` | 编排组 694/693/1/0 |
| A1 实施记录 | 165 | `b659c14f…` | A1 冻结 Model/解析器/高危谓词 |
| A2 实施记录 | 88 | `c6fa3d2c…` | A2 冻结 `jsonl-ledger` |
| A3 冻结 key 集合 | — | — | B1 不消费 i18n；C1/C2 按 A3 消费 |

A1/A2/A3 候选哈希（B1 写前=写后）：见 `05-candidate-hashes.txt` 末节与 `00-environment-and-baseline.txt`。

## 2. 写集与实际改动

### 2.1 新增（9）

| 路径 | 行数 | `git hash-object` | SHA-256 |
| --- | --- | --- | --- |
| `src/provider/directive/abstract/directive-store.ts` | 38 | `16d2252421c60f028b5687558ba13602d55eed53` | `b083464aeeea60f1277c2b3dfb05571f6b4d4514ef6d7142236d3bd99253bea4` |
| `src/provider/directive/impl/file-store.ts` | 80 | `3760b1e9d4e04a1b0e901a67ccfeff713342859d` | `4317b0617581e1c68e53e829ead7bf0f8ff0d6107d75971ff27dc9d5fa7b5325` |
| `src/provider/directive/public/directive-store.ts` | 13 | `f4d8e61c51a831068b5f8fd12d68a773017c92dd` | `46d0396aa838b0d51b31b5a5a2d602eb7b2a7756e74267771c20836f69133bb4` |
| `src/service/directive/abstract/directive-service.ts` | 111 | `4ab939ff8a56f65af0c10d4174f7239239613706` | `f10ae8cfc127b7c7f8f09423e162561b9739946e4d99a7ccbcbfe3841ea61364` |
| `src/service/directive/impl/directive-service.ts` | 700 | `0946afaaa7ad92f9c864399ca055b92bbe11efd0` | `e7e183bd767679b43a14eef2f8a1c50d7fe7b7b0b53217ff6ece06b24425a661` |
| `src/service/directive/public/directive-service.ts` | 15 | `b7df6f622b07493778402c9642ea5bd125308547` | `e80a407c3f9b555f771ac98defabce9471376c69117b3f32123527839d8cebed` |
| `src/pipeline/orchestration/customer-directive.ts` | 705 | `9202cec3eb3a7aec724ba825706a470b7fdaa522` | `601cf960932a841282cc187008fd68b8f8e3e64a336db1d99c5ddd4b7321aeb8` |
| `test/编排/customer-directive.test.ts` | 1181 | `40d0c2c8d368871d0f3fadd248122c35115a7465` | `70da2871cf0ad5cce91b2852217908852b955bc188ea993a1a7e014b3b9b0889` |
| `test/编排/customer-directive-gate.test.ts` | 497 | `793d5d86cc3cf594cf1af514ace10bf60dfe2247` | `446df4101efeb388542994410c201cbd6257c05278790be3b99262c3959131ed` |

### 2.2 修改（11；写前 HEAD blob / 写后候选见 `05-candidate-hashes.txt`）

| 路径 | 行数 | 改动 |
| --- | --- | --- |
| `src/common/编排/task-state.ts` | 790 | 迁移到 A2 `jsonl-ledger`（行为逐字不变）；Q9 `request.resolved.by`/`version.decision.decidedBy` 加 `"directive"` + `directiveId` 校验 |
| `src/common/编排/version-decision.ts` | 512 | `VersionDecisionDecidedBy` 联合/映射；窄重载保留旧二值调用方 |
| `src/common/编排/run-manifest.ts` | 888 | `RunChangeRecord.decidedBy` + `directiveId?`；`applyRunChange` 校验/记录 |
| `src/common/编排/shell-gate.ts` | 1478 | `takeDirective` 注入；deny 先于 c=allow/script；allow 在既有 grant 之后；readonly 守卫；审计/分支 |
| `src/common/编排/shell-audit.ts` | 238 | `ShellAuditRecord.directive?: {id,scope}`（与 judge/customerGrant 互斥） |
| `src/pipeline/orchestration/run-role.ts` | 2491 | `customerDirective?` 输入；非只读 shell arm 时注入 `takeDirective` |
| `src/pipeline/orchestration/govern-session.ts` | 528 | `customerDirective?` 透传 |
| `src/pipeline/orchestration/shell-arming.ts` | 463 | `ShellDirectiveWiring.takeDirective?`；项目三层链/审批档透传；只读档类型面无 |
| `test/编排/task-state.test.ts` | 560 | Q9 directive/directiveId 正反例 |
| `test/编排/version-decision.test.ts` | 455 | Q9 directive 映射/collect |
| `test/编排/run-manifest.test.ts` | 251 | Q9 applyRunChange directive/directiveId |

- `git diff --name-only -- src app test` 落在 B1 写集；`git status --short` 另含 A1/A2/A3 未提交候选与治理文档（非 B1 写入）；`git diff --cached --name-only` 为空。
- **按需既有测试的未改理由（逐条）**：`test/编排/shell-gate.test.ts`（既有 941 行全绿；新增指令顺序矩阵由新文件 `customer-directive-gate.test.ts` 覆盖，不弱化既有断言）、`shell-post-audit.test.ts`（`ShellAuditRecord.directive?` 为可选加法，既有记录形状不变，全绿）、`shell-escalation.test.ts`（`recordReview` 的 judge-only 资格未改，directive 结果无 judge，既有 1057 行全绿）、`shell-arming.test.ts`（新注入点由新 gate 文件的 `assembleProjectShellGate`/`openRoleSession` 集成用例覆盖，既有 559 行全绿）、`runtime-orchestration.test.ts`/`session-handle.test.ts`（`openRoleSession.customerDirective` 为可选加法，句柄形状未变；typecheck + 集成用例覆盖，既有套件全绿）。未改断言以保绿、未新增 skip。
- **未写** `src/model/**`、`src/common/shared/**`、`app/**`、`test/runtime-core/**`、`test/项目管理/**`、`test/桌面应用/**`、`test/桌面UI/**`、`test/测试/**`、其他角色资料、角色卡/边界、`docs/scheduling|acceptance|communication`。B1 前后 A1/A2/A3 11 路径 `git hash-object` 逐字一致。

## 3. 实现要点

### 3.1 Provider（`src/provider/directive/`）

- `abstract/directive-store.ts`：`DirectiveStore` 接口（`relPath`/`append(line): Promise<void>`/`replay()`）；`relPath` 单一来源 = A1 `CUSTOMER_DIRECTIVES_REL`。
- `impl/file-store.ts`：路径 = `<projectRoot>/.ans/state/customer-directives.jsonl`；追加/轮转/旧→新读取/坏行计数**全部**调用 A2 `appendJsonlLine`/`readJsonlLedger`，不写第二份实现；`append` 失败 reject（Service 映射 `ledger-write-failed`）。
- `public/directive-store.ts`：只 re-export。

### 3.2 Service（`src/service/directive/`）

- schema：`version===1`；未知 `kind` 忽略并计数（不阻塞、不报错）；`version>1`/字段非法/`seq` 非单调/重复 id/`id!==d-<seq>`/状态事件引用未知 id 或非 active ⇒ `ledgerErrors++` 并跳过。
- 状态机：`created→active→consumed/revoked/expired`；`once` 消费写 `directive.consumed`；`session`/`forever` 消费只返回成功、不写非状态事件。
- ID：回放含轮转的全局 `max seq + 1`；`d-<seq>`（A1 模式）。
- target 隔离：`approvalFacts`/`decisionFacts` 只含本 target；没有 all-facts 消费者 API；跨 target 记录在解析/防御过滤处丢弃（`ledgerErrors>0 ⇒ active=[]`）。
- 快照：`ledgerErrors>0 ⇒ active:[]`；`list` 仍返回可解析视图 + `ledgerErrors`（面板显示错误，不伪造空）。
- 高危：落账前用 A1 `directiveHighRiskReasons` 复算（decision 使用提交快照 `decisionGroupEnabled`）；高危且未 `acknowledged:true` ⇒ `high-risk-unacknowledged`，零事件；落账保存 `highRisk:{reasons,acknowledged:true,acknowledgedAt}`。
- `sessionId` 失效：加载时 `session` 且 sessionId 不一致 ⇒ `directive.expired(app-restart)`；未使用 `once` ⇒ `directive.expired(unused-once)`；best-effort 追加，失败也按 expired 视图。
- 错误语义：`invalid-input`/`high-risk-unacknowledged`/`ledger-write-failed`/`ledger-unavailable`/`not-found`/`target-mismatch`/`already-consumed`/`already-revoked`/`expired`。
- 并发：单条 append 串行链（Service mutation chain）+ 内存 active 复检；`once` 原子消费。

### 3.3 Pipeline 公共句柄（`src/pipeline/orchestration/customer-directive.ts`）

- 导出 B1 提案 §1.1 的全部公共类型；`DirectiveErrorCode`/`DirectiveListView`/`DirectiveStore` 由 Service/Provider 单一来源 re-export。
- `submitFromInput`：A1 `parseDirectiveMarker` 复校验 target；保守预填（shell/domain/path/选推荐/只接受/拒绝；未知片段 + `confirmable:false`）；presenter 回包按提交快照校验；Service 复算高危；成功只在 durable 后返回 `{ok,id,target}`；`cancel` ⇒ `cancelled` + `directiveCancelled:true`；presenter 抛错/形状非法 ⇒ `presenter-unavailable`；任一 `ok:false` 不落账/不投递。
- 幂等：`(target,rawText,clientMessageId)` 有界内存映射（≤100）复用进行中/已落账结果；不新增账本字段；跨重启不保证。
- `takeDirective`：只读 approval；精确命令（trim+折叠空白）+ 同目录；`ledgerErrors>0` ⇒ undefined；`once` durable consume 失败 ⇒ undefined；session/forever 可重复。可选 `intent` 仅供 shell gate 分阶段消费（deny 预检不消耗 allow；allow 阶段先 deny 后 allow）。
- `applyDecisionDirective`：只处理 `cardKind==="decision"`；scope flow 过滤；`select-recommended`（卡内唯一推荐）/`select-option`（id/规范化 label/前缀唯一匹配）/`reject`；0/多匹配 ⇒ `no-match`（不消费、不写可见行）；多条不一致 ⇒ `conflict`（不消费）；先 `await hooks.emitResult(...)`，抛错/拒绝/无钩子 ⇒ 不消费、返回 undefined；`once` 在可见行之后 durable consume，失败 ⇒ undefined。
- `revoke`/`list`：同 target/active 撤销；`list` 为唯一跨 target 读点；路径/项目根回传。

### 3.4 shell gate / audit / arming / run-role / govern-session

- `shell-gate.ts`：`takeDirective` 注入 + readonly 构造期守卫；判定顺序 = preblock → write-guard → classify → **指令 deny** → c=deny → c=allow → script → 既有 takeGrant → **指令 allow** → 既有 advisory/operatorOnly/三层链；指令 deny 可拒绝 c=allow；allow 不适用于 c=allow/script/c=deny；既有 grant 优先；异常/未匹配回落；审计 `by:"directive:<id>"` + `directive:{id,scope}`（与 judge/customerGrant 互斥）；`ShellGateReviewedOutcome` 携带 `{id,scope}`。
- `shell-arming.ts`：`ShellDirectiveWiring`（独立于 `ShellEscalationWiring`）只加项目三层链与审批档选项；只读档类型面无 `takeDirective`；两个装配函数透传。
- `run-role.ts`：`openRoleSession` 新增可选 `customerDirective`；仅在 shell 已 arm 且非只读时构造并展开 `directiveWiring`；CLI 不传 ⇒ 空对象、行为逐字不变。
- `govern-session.ts`：同一可选字段透传。

### 3.5 Q9 与 `task-state` 迁移

- `task-state.ts`：追加/轮转/读取/坏行全部迁移到 A2；默认常量改用 A2 常量（数值不变）；`request.resolved.by`/`version.decision.decidedBy` 接受 `"directive"`；`directiveId` 可选、必须匹配 A1 `CUSTOMER_DIRECTIVE_ID_PATTERN`，`"directive"` 时必填；旧二值记录仍可读。
- `version-decision.ts`：`VersionDecisionAnswerInput.by`/计划 `decidedBy`/`ResolvedWithoutExecution.decidedBy` 使用 `VersionDecisionDecidedBy`；窄重载保留旧二值调用方（C1 更新前 app 仍 typecheck）；C1 三值后走宽签名。
- `run-manifest.ts`：`RunChangeRecord.decidedBy: VersionDecisionDecidedBy` + `directiveId?`；`applyRunChange` 校验模式/`decidedBy`/`directiveId`，记录到 manifest。
- `shell-audit.ts`：可选 `directive` 字段。

## 4. 验证与原始结果

| # | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `node --test --test-concurrency=1 "test/编排/*.test.ts"`（B1 前） | **694 tests / 693 pass / 1 fail / 0 skipped / 0 todo，exit 1**（既有 Windows EPERM：`shell-authorized-routine.test.ts:184`） | `02-tests-orchestration-before.log` |
| 2 | 同上（B1 后） | **737 tests / 736 pass / 1 fail / 0 skipped / 0 todo，exit 1**；同一既有 EPERM；**新增确定性失败 0、新增 skip 0** | `03-tests-orchestration-after.log` |
| 3 | `npm run typecheck`（B1 前） | **exit 1**，唯一错误 `src/common/编排/version-decision.ts(435,7)` | `01-typecheck-before.log` |
| 4 | `npm run typecheck`（B1 后） | **exit 0**（无输出）；`version-decision.ts:435` 及所有 Q9 消费点关闭 | `04-typecheck-after.log` || 5 | 受影响跨层（A1/A2/A3 + 桌面 run-change/version-decision 只读复跑） | 69 tests / 69 pass / 0 fail / 0 skip，exit 0 | 见 `07-failure-classification.txt` |
| 6 | `task-state` 等价回归 | 既有 `task-state.test.ts` 全绿 + 新测试覆盖 `append/read/轮转/坏行/旧→新`；默认常量 = A2；见 `customer-directive.test.ts` | 同上 |

- **工具瞬时崩溃披露（非类型错误）**：在 `task-state` 等价返回值调整后的一次 `npm run typecheck` 出现 TS-go checker 内部 panic（exit 2；栈在 `microsoft/typescript-go` `internal/checker/getConditionalType`，无 TS 诊断输出）。随后**原命令复跑 exit 0**；本记录与 `04-typecheck-after.log` 记录复跑成功结果。B1 未为绕过该崩溃改动任一类型（崩溃前后代码逐字一致）。
- **环境**：Node `v24.22.1`；npm `11.19.1`；Windows 11 Pro 10.0.26300（MINGW64/Git Bash）；worktree `C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/customer-authorization-plane`；时区 Asia/Shanghai。
- **失败分类**：唯一失败为 B0 同名同因 Windows symlink `EPERM`（`test/编排/shell-authorized-routine.test.ts:184`），不记为 B1 新增；无新增 red 归为环境。

## 5. 候选与状态

- 候选哈希/行数：`05-candidate-hashes.txt`（含新增/修改、写前 HEAD blob、A1/A2/A3 未变哈希）。
- `git status --short` / `git diff --name-only` / `git diff --cached --name-only`：`06-git-status-short.txt`。
- 静态检查（单一来源/无第二份轮转/readonly/emitResult/deliver/Q9）：`09-static-checks.txt`。
- 冻结声明：`10-freeze-statement.txt`（B1 契约冻结 v1）。
- 证据文件行数/SHA-256：`11-evidence-hashes.txt`（最后生成）。
- **状态 `implemented-unverified`**；未 commit/push/merge/release；不是验收结论。

## 6. AC 映射（B1 证据）

| AC | B1 证据 |
| --- | --- |
| AC-6 | Provider/Service 单测：路径/schema/`d-<seq>`/seq max+1/version/轮转旧→新/坏行/未知事件/幂等；账本样例（created/consumed/revoked/expired、坏行/轮转） |
| AC-7 | `approvalFacts`/`decisionFacts` 互不含；运行时再过滤；跨 target 记录丢弃；无 all-facts API |
| AC-8 | gate：精确命令在硬地板后放行；`once` 一次；`session` 重复；`c=allow` 不消费；script 不适用；消费失败 ⇒ undefined；审计 `directive` |
| AC-9 | gate 矩阵：deny 先于 c=allow；c=allow 只在 allow 侧先行；preblock/write-guard/c=deny/readonly/script 不翻案；deny 不误伤；readonly 不注入 |
| AC-10 | `applyDecisionDirective` 规则/冲突/no-match；`emitResult` 先于 durable consume 且失败 ⇒ undefined；Q9 `request.resolved`/`version.decision`/run manifest 映射/校验 |
| AC-11 | 状态机：sessionId 重启失效；once 未用失效；forever；无时间戳依赖 |
| AC-12 | 撤销：同 target/active；已消费/已撤销/已失效拒绝；立即影响后续 `takeDirective`；append-only |
| AC-13 | `decisionGroupEnabled` 2×2；A1 谓词复算；未 `acknowledged` 拒绝落账；账本 `highRisk` |
| AC-14 | 指令类型无写权目标；gate 只读 approval；不新增模型工具 |
| AC-15 | 无指令路径逐字不变（既有 694 例全绿）；Q9 旧读者由 B1 内部校验接受旧二值；受影响套件原始输出 |
| AC-16 | 坏行/version>1/不可读 ⇒ 空快照 + `ledgerErrors`；主路径不受阻；不伪造回执 |
| AC-18 | 候选哈希、原始命令/输出、账本/审计样例、typecheck、受影响套件；全量 T3 由 D1 |

## 7. 披露、交接与停止项

1. **`@审批 撤销 #d-N` / `@决策 撤销 #d-N` 的输入路由（交接 C1；非 B1 写集）**：B1 冻结的 `DirectiveConfirmationValues.action` 只有 `ApprovalAction | DecisionAction`，没有 revoke 动作；撤销的服务入口是 B1 冻结的 `runtime.revoke(id, target)`。C1 需在确认面板识别 `撤销 #<id>` 并调用 `revoke`（面板/输入同一服务路径）；`submitFromInput` 仅负责创建。若团队要求撤销也走 `submitFromInput`，需要 B1 契约修订并重跑证据，B1 未自行扩写集。
2. **`takeDirective` 可选 `intent`（B1 内部消费阶段提示）**：公共一参调用语义不变（先 deny 后 allow，once durable consume）；`intent` 仅让 gate 在 deny 预检阶段不消耗 allow 指令（AC-8 c=allow/script 不消费）。已在冻结声明中披露。
3. **`version-decision.ts` 窄重载（兼容旧二值调用方）**：B1 不修改 `app/**`，但 Q9 扩宽会使 C1 更新前的 `app/desktop/session.ts` 的 `decidedByText("customer"|"judge")` 调用 typecheck 失败。B1 以窄重载保留旧调用方的二值返回类型；C1 把本地 `decidedBy` 扩为三值后自动选择宽签名（`decidedBy:"directive"` 进入映射）。**C1 仍需按其写集更新 Q9 读者**（`session.ts:2078/4166/4470/4657-4660`、`requirement-change.ts:316-318`、`interface.ts:1406-1411` 等）；B1 只在完成报告列出，不写 app。
4. **`applyDecisionDirective` 的“确定指令 vs 不匹配 select-option”优先级**：B1 采用“确定指令（reject/recommended/唯一 select-option）可应用；无确定指令且存在不匹配 select-option ⇒ `no-match`（阻止默认推荐）”。多条确定指令选区不一致 ⇒ `conflict`。设计未逐字规定二者并存，B1 在该解释下测试覆盖 no-match/conflict 单一路径；如需改变，回 B1 重跑。
5. **幂等范围**：`(target,rawText,clientMessageId)` 只在同一 runtime 进程内有界内存去重（不新增账本字段，跨重启不去重）；与 B1 提案一致。
6. **A2 迁移等价**：`task-state` 的轮转/追加/读取/坏行全部由 A2 实现；`limits()` 在 `appendTaskEvent` 调用时读取 env（旧实现于串行链内读取）。env 静态时行为一致；既有回归 + 新等价用例通过；如要求在追加实际执行时读 env，需要 A2/调用点调整。
7. **无停止项**：未发现需扩写集/新依赖/新路径；未改 Model/shared/desktop；A1/A2/A3 冻结件未动；typecheck exit 0 通过窄重载在 B1 写集内闭合，不需要改 `app/**`。

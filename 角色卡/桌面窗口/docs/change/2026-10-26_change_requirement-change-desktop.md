# 桌面窗口：`request_requirement_change` 应用侧实现（需求变更 → 独立 decision 审批 → 主理执行）

- 日期：2026-10-26
- 角色：桌面窗口
- 依据：客户要求与两次纠正（经主控任务转达）——
  ① 最初：Draft / 提案需要新授权或新范围时**不得把新授权写进提案卡**；
  ② 纠正一：需求变更**不由主理审批**；审批由客户（未勾选「替我决策」）或独立判断 agent（勾选时默认选
     推荐项）在 `request_choice(cardKind="decision")` 卡上完成；主理只在批准后执行意图变更；
  ③ 纠正二：审批卡由**统筹（convener）与提案（rapporteur）**发起/持有（其他内置治理角色与项目角色不可），
     发起方不得自批。
  工程法案 `角色卡/项目管理/docs/project-rules.md` §二.15；契约家 `src/model/runtime.ts`
  （`RequestRequirementChangeInput/Result/Fn`、`CustomerInputRequest`）；共享 i18n `main.requirementChange.*`
  （含 `approved` / `approvalRejected` / `leadExecuteTask`）；门禁引擎角色卡（统筹/提案/主理）由其他角色批次同步。
- 状态：实现完成，桌面套件全绿；**未独立验收、未运行真实 Electron e2e、未 commit/push、未重启应用**。

## 一、范围与写集

只改本角色边界内文件：

- `app/desktop/requirement-change.ts`：纯逻辑——载荷二次校验、稳定 requestId、票据 v2 形状、审批
  decision 卡（`buildRequirementChangeApprovalCard`）与已批准执行任务文本
  （`buildRequirementChangeLeadExecutionTaskText`）；
- `app/desktop/interface.ts`：`requestRequirementChangeForProject` 重写（发起方白名单、票据 v2、
  审批卡通道、审批结算、主理执行任务、有界投递、系统行/回执）；`DesktopDeps.requestRequirementChangeLimits`；
- `app/desktop/session.ts`：`requestRequirementChange` **仅统筹/提案**会话注入；
  新增 `requestRequirementChangeDecision`（绑定发起方会话客户卡上下文与 `onPresented`）；
  另含同批客户阻塞修复 `deliverIntentHandoff` 的有界时限（单独修复记录）；
- `app/desktop/customer-input.ts`：`DesktopCustomerInputFn` ctx 新增 `onPresented`（卡片呈现成功回调）；
  `presentNow` 成功后回调一次。decision 卡角色/结构仍由共享 `validateDecisionCardRequest` 单一来源校验
  （编排批次已把 `rapporteur` 纳入白名单，统筹/提案均可发）；
- `test/桌面应用/acceptance-dispatch.test.ts`：需求变更 9 例（原 6 例重写 + 统筹发起）；
- `test/桌面应用/operator-wiring.test.ts`：统筹/提案角色白名单与结构校验 + 真实通道呈现/`onPresented` 2 例；
- `test/桌面应用/session.test.ts`：意图交接有界 3 例（超时×2、忙时入队）；
- 本角色 changelog / feature-map / functional-description / api-spec / docs/feature / docs/change / docs/fix。

未改 `src/**`（model/provider/编排/门禁卡/i18n）、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`demos/**`。

## 二、能力语义（`interface.ts::requestRequirementChangeForProject`）

顺序：

1. **载荷二次校验**（`assessRequirementChangeRequest`）：`flowId`/`intentId` 各自合法 slug 且至少一个；
   `changeKind ∈ scope|authorization|constraint|cost|other`；`summary` ≤500 / `rationale` ≤4000 必填，
   `impact` ≤2000 / `proposedIntentPatch` ≤4000 可选；Unicode 码点超长拒绝、不截断。非法 ⇒ `invalid`。
2. **发起方白名单**（客户纠正二）：枚举项目角色，发起方须 `builtIn === true` 且
   `governanceFunction ∈ {schedule, proposal}`；否则 `rejected`（零票据、零卡、零投递）。枚举失败 ⇒
   `unavailable`。
3. **意图/流程存在性**：显式 `flowId` ⇒ `docs/flows/<flowId>.yaml` 常规文件；显式 `intentId` ⇒
   `docs/intents/<intentId>.md` 常规文件；缺失 ⇒ `flow-not-found`/`intent-not-found`（零票据零卡）。
4. **稳定 requestId + 同 flow 去重**：`req-` + sha256(发起角色 + ids + 归一内容)[0..16]；同一 flow
   （`scopeKey = flowId ?? intentId`）已有 `requested`/`dispatched`/`approved` 票据或进程内在途 ⇒
   `already-dispatched`（`approved` 时文案说明「已通过独立审批、主理执行中」）。
5. **票据 v2**（共享 `atomicWrite`）：`.ans/governance/requirement-changes/<scopeKey>/<requestId>.json`，
   `requirement-change-request/v2`；字段
   `schema/requestId/requestedBy(发起方)/flowId/intentId/changeKind/summary/rationale/impact/
   proposedIntentPatch/status/at/updatedAt/attempts/submission/approval/leadDispatch/error`。
   状态机 `requested → dispatched`（卡已呈现、待审批）`→ approved | rejected | failed`；
   `at` 保留首次登记、`attempts` 递增。
6. **审批卡呈现**：`SessionManager.requestRequirementChangeDecision`
   - 仅统筹/提案会话有通道（`LiveSession.requirementChangeCard`，构造时绑定本会话
     `roleId/runtime/projectRoot/sessionSignal/governanceModel/judge/turnText` 与 `onPresented`）；
   - 卡：`kind:"choice"`、`cardKind:"decision"`、`flowId`、`title=main.requirementChange.taskLabel`、
     `question` 含 `main.requirementChange.ticket` 与申请内容、`options=[approve(推荐), reject]`
     （恰好一个 `recommended:true`）；
   - 发卡前校验：桌面 `evaluateDecisionCardRequest` → 共享 `validateDecisionCardRequest`（单一来源）；
     编排批次已把 `rapporteur` 纳入 decision 卡角色白名单（`DECISION_CARD_ALLOWED_ROLES =
     ["convener","rapporteur"]`），统筹/提案均可发；其他角色仍拒发（零回归）。桌面不复制卡校验，
     也不放宽结构规则；
7. **工具回执**：`first` 先到 `presented` ⇒ 写票据 `dispatched` + 发起方 `systemLine` + 返回
   `{ok:true, code:"dispatched"}`，message 取 `main.requirementChange.dispatched`（**已提交独立审批，
   不是批准**）；随后异步等审批结果。`first` 先到 `outcome`（未呈现即结算，如卡校验拒发/通道不可用/
   「替我决策」在呈现前代选）⇒ 直接结算并如实返回 `rejected`/`unavailable`（或自动批准时
   `dispatched` + `approved` 文案），不谎称已提交。
8. **审批结算**（`settleRequirementChangeDecision`）：
   - `answered approve` ⇒ 票据 `approved`（记录 `approval{outcome,source,selected,operatorId,decidedAt}`）
     + 发起方 `approved` 系统行 + 交给主理「已批准执行任务」；
   - `answered reject` ⇒ 票据 `rejected`；取消/超时/通道不可用 ⇒ 票据 `failed`（`approval.outcome=
     no-decision`）；两者在卡已呈现时把 `main.requirementChange.approvalRejected` 回执**投给发起方**
     （后台系统消息 `kind:"system"`；打开/投递失败/超时回落可见系统行）；
   - 来源如实：`judge:<engine>` 或 `outcome.judge` ⇒ `judge 代批`；否则客户选择。绝不写成客户本人点击。
9. **主理执行任务**（`dispatchRequirementChangeLeadExecution`）：`primaryRoleId` 后台打开 + `sendBackground`
   唯一一条任务（稳定 `ans-app-task:` 键）；任务头取 `main.requirementChange.leadExecuteTask`，正文含
   审批证据（decision=approve、来源、同一 requestId/flowId、票据路径）、申请内容与硬性禁止（不得自行
   批准/拒绝、不得再发 intent-confirm 充当需求变更审批、不得把新授权写进提案卡、不得删需求绕过 gate 0）；
   要求主理核验证据后更新 `docs/intents/**` 并 `hand_off_intent` 通知提案修订。**主理不审批、不接收原始
   申请任务**。打开/投递有界（总 60s / 阶段 20s，`requestRequirementChangeLimits` 可注入）；主理忙 ⇒
   `queued:true` 入队仍成功；失败/超时写 `leadDispatch.error` + 可见系统行，不谎称已交接。
10. **硬边界**：不写 `customer.decision`、不写治理账本、不改变任何角色写权；不新增 cardKind /
    `FlowStepKind` / 角色。桌面只把审批卡送进**发起方会话已有的客户卡通道**（不新建 IPC/presenter）。

## 三、会话注入与卡通道

```ts
const canInitiateRequirementChange =
  governanceFunction === "proposal" || governanceFunction === "schedule";
const requestRequirementChange =
  canInitiateRequirementChange && this.deps.requestRequirementChange !== undefined
    ? (input) => this.deps.requestRequirementChange!(req.projectRoot, req.roleId, req.runtime, input)
    : undefined; // 其他内置角色/项目角色/single su 不注入（工具不注册 = fail-closed）
```

`LiveSession.requirementChangeCard` 只在 `customerInput !== undefined && canInitiateRequirementChange`
时构造；`requestRequirementChangeDecision` 返回 `{ok, outcome, first}`，`first` 区分
`presented` 与「未呈现即结算」。发起方模型不能作答（作答只来自客户/判断 agent）；decision 卡角色/
结构校验仍由共享 `validateDecisionCardRequest` 单一来源完成。

## 四、验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查（必跑） | `npm run typecheck` | exit 0，无诊断 |
| 目标文件 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | **95/95 通过**（需求变更 9 例） |
| 卡通道 | `node --test "test/桌面应用/operator-wiring.test.ts"` | **75/75 通过**（新增 2 例） |
| 意图交接有界 | `node --test "test/桌面应用/session.test.ts"` | **43/43 通过**（新增 3 例） |
| 桌面套件（必跑） | `node --test "test/桌面应用/**/*.test.ts"` | **689/689 通过** |
| i18n 守卫 | `node --test "test/项目管理/shared/i18n-guard.test.ts"` | **6/6 通过** |

新增/重写用例覆盖：校验矩阵（非法/不存在，零票据零卡）；审批卡形状（decision/flowId/approve+reject/
唯一推荐 approve）、通道归属（发起方 `roleId`）、工具回执「已提交独立审批」、票据
`dispatched`、零 `customer.decision`/账本、主理零原始申请任务；批准（判断代批）→ 票据 `approved` +
主理执行任务（审批证据/范围/票据/硬性禁止）+ 发起方系统行；reject → 票据 `rejected` + 发起方回执 +
主理零任务；卡校验拒发 → `rejected` + 票据 `failed`（不冒充客户拒绝）；幂等（待审批/已批准）；
通道不可用 → `unavailable` + 票据 `failed` + 重试稳定；主理忙 → 执行任务入队；统筹发起/拒绝回执；
注入矩阵（统筹+提案；其他角色不可）；`requestClarification`/`viewImage` 零回归；真实客户通道可信
decision 卡呈现 + `onPresented` 一次；意图交接打开/投递超时有界、忙时入队。

## 五、取舍与残余风险（如实登记）

1. **不写治理账本**：需求变更审批不是提案/任命/验收决定；桌面只写应用自有 `.ans` 票据、系统行与
   主理执行任务。若后续需要 `customer.decision` 审计，须由编排/门禁属主先冻结语义（本批未越界）。
2. **审批卡走发起方会话原有客户通道**：复用「一项目一卡」队列与「替我决策」确定性默认推荐；同一项目
   已有其它待决卡时审批卡排队（不弹、不自动批）。等待不设限（关窗/会话重建才会失效）。
3. **异步结算**：工具只等「卡已呈现」，审批结果由后台 handler 写票据/派主理；应用在卡挂起期间退出 ⇒
   通道 `rejectAllPending` 结算为 `unavailable`，handler 写 `failed`（若进程已退出则票据停留在
   `dispatched`，需人工核对）。`approved` 票据会一直阻塞同 flow 新申请（意图变更/提案修订无完成信号），
   需要人工清理或后续接完成事件。
4. **decision 卡角色白名单**：共享 `validateDecisionCardRequest` 已由编排批次把 `rapporteur` 纳入
   （`["convener","rapporteur"]`），桌面不复制该规则；「rapporteur 仅需求变更用途」目前由角色纪律 /
   judge 指引约束（契约无用途字段），如需机械拦截须跨角色新增用途字段。
5. **主理执行任务引擎**：沿用发起会话引擎后台打开主理；主理已在另一引擎有活会话时会另开同引擎会话
   （与既有派发一致）。
6. **无真实 Electron/e2e**：本批只跑桌面单元/集成测试；真实窗口卡呈现、判断代批链路与主理
   `hand_off_intent` 端到端待独立验收。
7. **未 commit/push、未重启应用；`demos/` 未触碰**。

## 现行口径补充（2026-10-26 客户纠正）

审批卡不再由发起方手动调用 `request_choice` 发起：应用在 `request_requirement_change` 成功后自动经发起方会话的客户卡通道呈现 `decision` 卡（`approve` / `reject`，恰好一个推荐 `approve`），发起方不得再调用 `request_choice` 重复发卡；审批由客户或「替我决策」判断 agent 完成，主理只执行已批准任务。本文中「由你调用 `request_choice` / 审批卡由发起方发起」的旧表述以本条为准。

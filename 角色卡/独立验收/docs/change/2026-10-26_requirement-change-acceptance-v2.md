# 独立验收报告：`request_requirement_change` 通道 + 主理意图交接有界（v2）

- 角色：独立验收
- 日期：2026-10-26（Asia/Shanghai）
- 候选：worktree `lead-governance-coordination`，分支 `feat/scaffold-first-governance`，HEAD
  `99bbbe2cda3be0fcd7c8d1e72189b6f530e8387e` + 未提交工作树（冻结快照 2026-10-26 22:00:24）
- 状态：**完成**（对冻结快照；验收期间候选有并发在飞修复，见 §四）
- **最终判定：missing-evidence（标准 1–7 的确定性实现面全部 PASS，无遗留 needs-work；验收期间发现的
  F1「发起方重复发卡指令冲突」已在冻结前由属主修复并复验关闭）**

## 一、候选身份与证据

| 项 | 值 |
| --- | --- |
| 候选范围 | **52 文件** = 40 tracked 改动（+3353/−102）+ 12 未跟踪批次文件（排除 `.claude/`、`demos/`） |
| 候选清单摘要 | `fd95bf627532b96366637efd20cd292513a95978d369a835392018b9b2647c30`（逐文件 sha256 清单；测试前后两次计算一致） |
| 环境 | Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1 |
| 证据目录 | [2026-10-26_requirement-change-acceptance-v2-evidence/](2026-10-26_requirement-change-acceptance-v2-evidence/)（候选清单、逐套件日志与复跑命令见 `00_candidate-and-commands.md`） |

关键文件 SHA-256（冻结快照）：

| 文件 | SHA-256 |
| --- | --- |
| `src/model/runtime.ts` | `c01271fd1ee3c9ae92ee36cd7f9086293f8c92d7ae45e7faa15a2fcdf3bf9b2c` |
| `src/provider/runtime/tools.ts` | `cab5e3c4a3a8ec5b779c9a53c99e10a1686c9d4936922ea5d378b46b6f68393c` |
| `src/provider/runtime/schema.ts` | `5e63258725778ed0a3368d8cc9a1291a19562db75fd6aad13ea996788c0db94d` |
| `src/pipeline/orchestration/run-role.ts` | `5117653d93f199c3c2c43bc101de2771cca0c3090926d40e114feef9bb3d6903` |
| `src/common/编排/decision-card.ts` | `893ad8cec68742293276e96dbf4c3f0634cf7fd9837ac1da6a8d49220fa2896e` |
| `src/common/门禁引擎/governance-roles.ts` | `3e6ee0848e8e7ad10c7f275018cea5027380927111cd7555ad8908f4fa231dc1` |
| `app/desktop/requirement-change.ts` | `32e1141c62d3d3d5e6d6392359a39ec7981d46983a0e319d158ec7bc924d6623` |
| `app/desktop/interface.ts` | `c3114f47ac9de44ec6fc05f8fa75ce83a5fdeb950fd39c53710c27134ca58def` |
| `app/desktop/session.ts` | `4c72da4026e14e79621e268e1c229ed14755441c920ee1fe2670729c80fb4903` |
| `app/desktop/customer-input.ts` | `0e050168fcbaf1a2001f8ef23e82d90d30a1ef2692b4d3358e6bfb5ce9251634` |
| `zh-CN.ts` / `en-US.ts` | `540ee5f1…` / `25d54fb1…` |

独立复跑（冻结快照，均为本角色实跑）：

| 套件 | 结果 |
| --- | --- |
| `npm run typecheck` / `typecheck:renderer` | **exit 0 / exit 0** |
| `test/桌面应用/**` | **689/689 pass** |
| `test/编排/**` | **1016 计 / 1014 pass / 1 既有 EPERM / 1 skip** |
| `test/runtime-core/**` | **354 计 / 347 pass / 3 既有 EPERM / 4 skip** |
| `test/门禁引擎/**` | **346 计 / 345 pass / 0 fail / 1 skip** |
| `test/项目管理/shared/**` | **209 计 / 204 pass / 0 fail / 5 skip**（含 i18n 契约与守卫） |
| `test/桌面UI/**` | **296/296 pass** |

4 个既有红均为本机无法创建 symlink 的 `EPERM`（`shell-authorized-routine.test.ts:103`、
`file-write-safety.test.ts:97`、`session-store.test.ts:46/58`），对应测试文件 `git diff` 零改动，不计本批。
定向复核：门禁 `requirement-change-cards` 6/6、runtime `request-choice-decision-card` 5/5、
runtime `request-requirement-change-tool` 10/10、编排三文件（`request-requirement-change` +
`requirement-change-judge-guidance` + `decision-card`）28/28。

## 二、验收标准（客户最终口径）

1. 需求变更申请/审批卡可由**统筹（convener）或提案（rapporteur）**发起/持有；其他内置角色、项目角色、
   single/su 不可；发起方不得自批/代选。
2. 审批人：勾选「替我决策」时是独立判断 agent（确定性选唯一推荐 approve，标 judge 代批）；未勾选时客户在
   `decision` 卡上选 approve/reject；主理不审批、不拒绝。
3. 批准后主理只执行：核验 decision approve + 来源（客户/judge）+ 同一 flowId/requestId，更新
   `docs/intents/**`，再 `hand_off_intent` 通知 Draft 修订；未获批准证据不得执行；不得再发 `intent-confirm`
   充当需求变更审批。
4. Draft 提案卡不得承载新授权；不得删需求绕过；拒绝后修订/撤回。
5. 桌面：发起方会话客户卡通道、ticket v2、异步审批、批准后执行任务、忙时入队、失败/超时如实；不写
   customer.decision/账本。
6. 主理意图交接有界：open/send 总 45s/阶段 20s，超时/不可用如实回执+系统行，Lead 结束本轮不挂死；目标忙时
   入队成功。
7. 不弱化断言、不新增 FlowStepKind；其它 gate/view_image/decision 能力零回归。

## 三、逐条结论

### 1. 发起方范围 —— PASS（机械上限 + 注入矩阵）

- 编排注入：`src/pipeline/orchestration/run-role.ts:1481` 仅 `isTrio && (trioSpec.id === "rapporteur" ||
  "convener")` 时透传能力；`test/编排/request-requirement-change.test.ts` 5 例钉住 rapporteur/convener
  注入、项目角色/旧 su/liaison/nominator/verifier 即使误给也不注入（工具结构性不注册）。
- 桌面注入：`app/desktop/session.ts:2411` 仅 `governanceFunction === "proposal" || "schedule"` 注入；
  客户卡通道要求 `role.builtIn === true`（`session.ts:2321`）；su/项目角色没有 `governanceFunction`
  （`src/service/role/resolve-role.ts` 只为内置治理角色返回）。`app/desktop/interface.ts:8038`
  能力入口再按「builtIn 且 schedule/proposal」白名单 fail-closed（`rejected`，零票据/零卡/零投递）。
- 审批卡角色门：`src/common/编排/decision-card.ts:36` `DECISION_CARD_ALLOWED_ROLES =
  ["convener","rapporteur"]`；Lead/Crew/Proof/项目角色/su 一律 `role-not-allowed`（编排、桌面、门禁测试
  三处覆盖）。`TRIO_CARD_KINDS.rapporteur` 增 `"decision"`（`run-role.ts` 约 2682）。
- 记录项：`rapporteur` 的「仅需求变更用途」是角色纪律/judge 指引约束，运行时契约没有用途字段；这是交接
  方已声明的机械上限，不构成本批新增缺口。

### 2. 审批人 —— PASS（判断 agent / 客户；发起方不能作答）

- 审批卡形状：`app/desktop/requirement-change.ts:313` `buildRequirementChangeApprovalCard`——`kind:"choice"`、
  `cardKind:"decision"`、`flowId`、选项恰 `approve`（唯一 `recommended:true`）/`reject`。
- 应用经**发起方会话**客户卡通道呈现：`session.ts:1784` `requestRequirementChangeDecision` 绑定发起方
  `roleId/runtime/projectRoot/sessionSignal/governanceModel/judge/turnText` 与 `onPresented`；
  `interface.ts:8650-8666` 在申请票据登记后自动发卡（**不是主理、不是发起方模型自批**）。
- 「替我决策」：`app/desktop/customer-input.ts:1405-1464` `tryAutoSelectDecision` 在开关开启时确定性选中
  唯一推荐项，`operatorId:"judge:<runtime>"` 且写 `judge` 审计（`group:"decision"`、
  `reasonCode:"recommended-default"`），不调用模型；`customer-input.ts:1059-1061` 明确 decision 卡
  **永不**进入模型 judge。开关关闭/通道异常 ⇒ 原卡交客户手动选择（fail-closed）。
- 来源如实：`interface.ts:8334-8359` 由 `outcome.judge` 或 `operatorId` 前缀判定 `judge`/`customer`，
  写入票据 `approval.source`；执行任务按 `requirementChangeApprovalSourceText` 标注「judge 代批」。
- 发起方不能作答：卡片只经客户操作通道结算，发起方模型无作答路径；应用发卡不经过编排 `governedInput`
  （`session.ts` 直接调用桌面客户通道），不会把审批结果写成 `customer.decision`。
- 测试：桌面 9 例（审批卡形状/通道归属/`judge:pi` 来源/客户来源/reject）、`operator-wiring` 真实通道
  呈现 + `onPresented` 恰一次；判断代批链路复用既有 decision 卡测试。

### 3. 主理只执行 —— PASS（批准后才投递；任务自足；主理零审批）

- 只有 `approved` 分支才调用 `dispatchRequirementChangeLeadExecution`（`interface.ts:8360-8403`）；卡片未
  呈现/拒绝/取消/超时 ⇒ 票据 `rejected`/`failed`，**不向主理投任务**（`acceptance-dispatch` 拒绝用例断言
  `liaison` 零任务）。
- 执行任务文本（`requirement-change.ts:365-406`）：含 `decision` 结果 `approve`、审批来源、批准时间、同一
  `requestId`/flowId、票据路径；明令主理「不审批、不代批、不代选；未获独立审批证据不得执行；不得再发
  `intent-confirm` 充当需求变更审批；不得把新授权写进提案卡；不得删需求绕过 gate 0」，并要求更新
  `docs/intents/**` 后 `hand_off_intent` 通知 Draft。
- 主理角色卡（`governance-roles.ts:473-490`）同步：「需求变更执行（已批准，必须）」、核验证据、
  `[需求变更申请·待独立审批]` 原始申请不接收/不审批/不执行、`intent-confirm` 不充当审批、系统消息规则
  逐字保留；`requirement-change-cards.test.ts` 6 例钉住。
- 桌面应用只写应用自有 `.ans` 票据与系统行；`acceptance-dispatch` 断言 `.ans/governance/ledger.jsonl`
  不存在（不写治理账本），也未写 `customer.decision`。

### 4. Draft 提案卡约束 —— PASS（文本 + judge 指引；真实模型未测）

- Draft 卡（`governance-roles.ts:554-617`）：新授权不得写进提案卡；`request_requirement_change` 工具契约；
  申请只是请求；批准后等主理执行意图变更再修订；拒绝则修订/撤回；不得删需求绕过审批；提案卡不得承载
  新授权。
- judge 指引（`src/common/编排/governance-judge-facts.ts:37-50` 单一文案常量；`governance-judge-prompt.ts`
  引用）：提案卡夹带未获意图授权的新联网/外部目录/范围/成本授权 ⇒ decision 组不得 approve，只能
  `manual`（`reasonCode=intent-drift`），approval 组 deny；reason 必须指向专用通道与「不得代批/删需求绕过」。
- 测试：`requirement-change-cards.test.ts` 6/6、`requirement-change-judge-guidance.test.ts` 3/3。
- 边界：机械上仍是提示词/卡文本约束（无结构性拦截），真实模型是否遵守属缺失证据。

### 5. 桌面通道 —— PASS（ticket v2 / 异步审批 / 执行任务 / 忙时入队 / 失败如实 / 不写账本）

- 票据 v2：`requirement-change.ts:35-37,260-294`（`requirement-change-request/v2`，字段
  `requestedBy/flowId/intentId/changeKind/summary/rationale/impact/proposedIntentPatch/status/at/updatedAt/
  attempts/submission/approval/leadDispatch/error`）；原子写/重启读取 `interface.ts:8075-8141`；状态机
  `requested → dispatched → approved | rejected | failed`；同 flow 待处理/已批准/进程内在途去重
  `already-dispatched`；`requestId` 稳定（sha256 前 16 hex）。
- 异步：`decision.first` 区分「presented」与「未呈现即结算」；presented ⇒ 票据 `dispatched` + 发起方系统行
  + 工具回执「已提交独立审批，不是批准」；`decision.outcome` 异步结算（approved/rejected/failed）。
- 批准后执行任务：`dispatchRequirementChangeLeadExecution`（有界总 60s/阶段 20s，`requestRequirementChangeLimits`
  可注入）；主理忙 ⇒ `queued:true` 仍成功、settle 后按序投递（测试）；打开/投递失败/超时 ⇒
  `leadDispatch.error` + 可见系统行，不谎称已交接。
- 拒绝/未获明确结果 ⇒ 票据 `rejected`/`failed` + 回执发起方（agent 系统消息，失败回落可见系统行）；
  `notPresented` 不当客户拒绝。
- 不写账本：应用发卡直接走桌面客户通道，不经过编排 `governedInput`；`acceptance-dispatch` 断言无
  `.ans/governance/ledger.jsonl`、无 `customer.decision`。
- 测试：`acceptance-dispatch.test.ts` 需求变更 9 例（校验矩阵/卡形态/批准→执行/拒绝/卡拒发/幂等/通道不可用
  重试/忙时入队/统筹发起）+ 注入矩阵与 `requestClarification`/`viewImage` 零回归；`operator-wiring.test.ts`
  真实客户通道 2 例。

### 6. 主理意图交接有界 —— PASS（45s/20s；如实回执；不挂死；忙时入队）

- `app/desktop/session.ts:1988-2042`：缺省**总 45s / 阶段 20s**（非法值回落缺省；每阶段预算 =
  `min(stageMs, 剩余总预算)`）；`openBackground`/`sendBackground` 各包 `withStageDeadline`。
- 超时 ⇒ `fail()` 返回 `ok:false` + Lead 聊天流 `delivery-note` 系统行（文案含「约 Ns 未确认/未返回」、
  「未重试」、「可能仍在启动/可能已入队/已投递」），不重试、不谎称已交接；打开/发送失败沿用既有
  `openProposalFailed`/`sendProposalFailed`。
- 目标忙 ⇒ `sendBackground` 入队 `queued:true` 仍成功，本层不等待空闲；成功后 `dispatch.accepted
  {trigger:"intent-handoff"}` 账本/系统行语义逐字不变。
- 测试：`test/桌面应用/session.test.ts` 3 例（打开挂起超时、投递挂起超时、忙时入队 settle 后按序投递）；
  超时不取消底层 promise（晚到打开可能留下无害空闲会话，已在修复记录登记）。

### 7. 不弱化断言 / 不新增 FlowStepKind / 其它能力零回归 —— PASS

- `src/common/编排/flow-state.ts:47` `FLOW_STEP_KINDS` 仍为 `dispatch/customer-decision/artifact/acceptance`
  四项；无 flow-state 源文件改动。
- gate 复核 / view_image 相关测试与源码零 diff；上述套件全绿（门禁 346/345、桌面 689/689、编排
  1016/1014、runtime 354/347、UI 296/296）。
- 无新增 `skip`/`only`；`git diff --check` clean。
- 断言变更均为必要口径调整且总体更强：`governance-trio.test.ts` 把过宽的 `/recommended:/` 收窄为
  appointment 推荐集三种精确形态（Draft 需求变更审批卡合法使用 `recommended: true`）；编排/门禁/桌面
  decision 卡测试把 rapporteur 从「拒绝集合」移到「允许」并补齐 Liaison/Crew/Proof/项目/su 反向断言；
  i18n 计数 1368→1381 + 新增 13 key 契约/负断言；`request-choice-decision-card.test.ts` 新增
  「仅统筹可直接发材料性 decision 卡 / 需求变更审批由应用自动呈现 / 不得重复发卡」断言。未发现删除或
  放宽既有安全/行为断言。

## 四、验收期发现 F1（已在冻结前修复关闭）

**F1（首轮 needs-work，已关闭）**：首轮候选（约 21:0x 快照）中，门禁 Draft/Steward 角色卡要求发起方在
申请登记后**自行调用 `request_choice(cardKind=decision)`** 发审批卡（`governance-roles.ts:565/886` 旧文），
同时 `request_choice` 工具描述仍写 decision 卡「仅统筹使用」（`schema.ts:299/322/329` 旧文）；而桌面应用
在 `request_requirement_change` 内**已自动**经发起方会话呈现同一审批卡（`interface.ts:8650-8666`）。
风险：真实模型按角色卡执行会重复发第二张审批卡；第二张经编排 `governedInput` 会写
`customer.decision{decisionKind:"material-choice"}`（编排新测试明确支持 rapporteur 发 decision 卡并写账本），
且不结算桌面票据，违背单次独立审批与「不重复刷同一张卡 / 不写账本」的交付口径。

**修复（21:52–21:59，属主完成）并复验**：

- Draft/Steward 卡改为「审批卡由应用在 `request_requirement_change` 成功后自动经发起方会话呈现；
  **不得再调用 `request_choice` 重复发卡**」（`governance-roles.ts:562/565/581/884/886/1002`）；
  Lead 卡同步「需求变更审批 decision 卡由应用在申请通道内自动呈现」。
- `request_choice` schema 改为「仅统筹（Steward）**直接调用** `request_choice` 可发材料性 decision 卡；
  需求变更审批 decision 卡由应用在 `request_requirement_change` 成功后自动呈现，发起方不得再调用
  `request_choice` 重复发卡」（`schema.ts` request_choice 描述与 promptGuidelines）。
- 工具成功/幂等回执 headline 同步「应用自动呈现 decision 卡…不得再调用 request_choice 重复发卡」
  （`tools.ts`）；共享 i18n zh/en 的 dispatched/alreadyDispatched/ticket/systemLine 同步「审批卡由应用
  自动经发起方会话呈现」；工程法案 §二.15 同步。
- 回归测试同步：门禁 `requirement-change-cards` 6/6、runtime `request-choice-decision-card` 5/5（新增
  schema 自动呈现/禁止重复发卡断言）、runtime 工具 10/10；全量套件在冻结快照全绿。
- 附带修正：`src/model/runtime.ts:1803` `requestClarification` 注释误改已回退为「只给报告员 Rapporteur」；
  `requestRequirementChange` 注释改为「报告员 + 统筹」；`governance-roles.ts` 文件头旧流程段已显式标注
  「已被同日客户纠正取代」。

**残余（纪律层，不重新打开）**：共享 `DECISION_CARD_ALLOWED_ROLES` 仍含 rapporteur（桌面应用卡复用同一
shared 校验所必需）；若模型无视卡文本/工具描述，机械上仍可自行调用 `request_choice(cardKind=decision)`。
机械用途守卫需契约新增用途/发起方字段，属跨角色契约变更；本批以角色纪律 + 工具描述 + judge 指引约束，
交接口径已声明该上限。

## 五、残余风险与记录项（非阻断）

1. **真实 Electron/模型 e2e 未跑**：真实主进程 presenter、真实客户卡作答、主进程「替我决策」开关下的
   判断代批、主理真实 `hand_off_intent`、应用重启恢复均未实机验证；应用未重启，运行中 Electron 可能仍是
   旧代码。桌面需求变更用例使用脚本化客户通道（`deferredCustomerChannel`）；真实客户通道只覆盖了通用
   decision 卡（`operator-wiring`），未直接覆盖需求变更审批卡。
2. **异步票据残留**：应用在卡挂起期间退出 ⇒ 票据可能停在 `dispatched`；若在呈现前退出 ⇒ 停在
   `requested`。两者都会被 `findPendingRequirementChange` 视为待处理，**永久挡住同 flow 新申请**（无完成/
   清理事件，需人工清理）；`approved` 票据同样永久阻塞同 flow 后续需求变更（桌面记录已声明）。
3. **已批准但执行任务投递失败**：票据 `approved` + `leadDispatch.error`，之后同请求返回
   `already-dispatched` 时文案后缀仍称「主理正在执行意图变更」，与失败事实不完全一致（票据有 error）。
4. **工具层 fail-closed 边界**：回执只校验 `code` 枚举与形状，不校验 `ok`/`code` 语义组合；
   `{ok:true, code:"invalid"}` 这类不一致回执会被呈现为「请求已受理」。当前唯一应用实现不会返回该组合；
   建议后续加 ok/code 一致性守卫。
5. **审批卡文案 i18n**：`requirement-change.ts` 中卡片 `question` 的「理由/影响/审批由客户…」与选项标签
   「批准/拒绝」为硬编码中文；沿用 `boundary-change.ts` 的先例，但 PM allowlist 分类注释称该文件非
   用户可见 UI，与实际卡片可见文案不完全一致。
6. **文档同步**：`test/项目管理/shared/i18n-guard-allowlist.ts:62` 仍引用旧函数名
   `buildRequirementChangeLeadTaskText`（实际 `buildRequirementChangeLeadExecutionTaskText`）；运行时核心与
   门禁引擎 change 记录仍保留修复前的「只给报告员 / 由你调用 request_choice / 主理任务投递尚未实现」表述；
   产品代码已正确，建议提交前同步 change 记录。
7. **flowId-only 申请**：只给 `flowId` 时以 flowId 兼作 intentId 显示/执行路径（本仓约定）；若
   `docs/intents/<flowId>.md` 不存在，主理执行任务指向的意图文件需由主理创建。flow 存在性仅检查
   `docs/flows/<flowId>.yaml`（legacy 纯 Markdown flow 会被 `flow-not-found`）。
8. **自动批准未呈现分支**：开关开启且卡在呈现前被 `tryAutoSelectDecision` 代选时，进入
   `first.kind === "outcome"` 分支；票据 `submission` 为 null 而状态 `approved`（schema 注释称
   dispatched/approved/rejected 时非 null）；该分支无专门桌面用例（代码审查通过）。
9. **requestClarification 注入判据**：修复过程中该注释曾被误改为「报告员+统筹」，已回退；复跑
   `requestClarification` 注入矩阵零回归。
10. `git diff --check` clean；无新增 skip/only。

## 六、缺失证据（missing-evidence 的具体缺项）

1. **真实 Electron 端到端**：真实主进程 presenter 呈现需求变更审批卡 → 真实客户卡作答/主进程「替我决策」
   代批 → 票据 approved → 主理后台收到执行任务 → 主理更新 `docs/intents/**` 并 `hand_off_intent`；应用
   重启后票据/卡状态恢复。
2. **真实模型行为**：Draft/Steward 按角色卡发起申请且不重复发卡；拒批路径；judge 对提案卡夹带新授权的
   manual/deny；主理按执行任务核验证据后只改意图。
3. **非 Windows 平台**：symlink/路径/原子写等跨平台行为。
4. 若客户要求把「rapporteur 仅需求变更用途」机械化，需另立契约字段与设计，不属本批缺证范围。

## 七、最终判定

标准 1–7 的确定性实现面（注入白名单、decision 卡角色门、自动呈现且禁止重复发卡的最终文案、判断 agent
确定性代批与来源如实、批准后主理执行任务、ticket v2、有界交接、账本零写入、无新 FlowStepKind、既有
gate/view_image/decision 零回归）均 **PASS**；验收期间发现的 F1 已在冻结前修复并由本角色复验关闭。
**判定：missing-evidence**——缺真实 Electron/真实模型 e2e 与非 Windows 证据；无遗留 needs-work。

本验收不授予提交、推送、部署、发布或合并权限。

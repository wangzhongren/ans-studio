# 代理审批/代决策的效力等同客户本人（judge 委派生效与诚实审计）：实施前验收标准 B1 v1

- 日期：2026-11-09；固定身份：**ANS 独立验收（Independent Acceptance）唯一主上下文**。本文件只做实施前验收标准；**不实施、不派发、不运行真实模型、不授权提交/推送/合并/发布**。
- 风险档位：**T3（建议，按方案 P1.2 头部；由统筹裁决）**。理由：改动跨层共享冻结证据契约（`DocFreezeRecord`/`doc-freeze/v1`）、客户决策效力语义（judge 代批可产生冻结/生效）与 D3 派生授权证据。
- 状态：**实施前冻结标准（B1 v1）**；全部条目当前 `未取证`，不得视为已通过。B2 只对**同一最终候选**与本版本判定。
- 依据（写盘前实测）：
  - 方案 **P1.2**：`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`，**686 行 / 88,988 bytes / SHA-256 `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`**（与任务给定一致；含 AC-J1..J12、48 条清点（替 23/留 25）、写集/owner、测试矩阵 J1–J17、Q1–Q10、残余边界）。
  - 复核记录：`docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md`，**362 行 / 52,462 bytes / SHA-256 `de1d0281d9fb6a309a5e231b095aec068bc77bb86e3bc9ad85b8931be430da7d`**（含 R1.0 F1–F13、R1.1 窄复核「建议提交、must-fix 0」与 G1/S1–S3 处置记录）。
  - 意图记录（客户裁定）：`docs/communication/2026-11-09_intent_judge-delegated-decision-effectiveness.md`，**35 行 / 3,742 bytes / SHA-256 `d084b5ffeb522a68f6ece21fd2eb486a1a075afa360e0fae46ce84f72d6b6f6f`**：开关开启=明确委托、judge 代批生效；审计如实记 judge、**不得伪造 customer/decisionId**；judge 回落不变；关闭开关回退；Q5 高风险仍客户本人；覆盖全部客户决策类卡/派生冻结。
  - 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`，SHA-256 `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`（实测）。
  - C-05 可核同源条目（F10）：`docs/scheduling/2026-10-28-entry-role-minimal-change-C.md:53`，SHA-256 `5c8b9e860526c480f54bef701167044068994b72dff7d657c5c94ac4a0d4f348`（实测）；意图记录 §关联 引用的 `docs/acceptance/entry-role-minimal-criteria-v1.md` **在本检出不存在**（勘误动作见 §9 R-5）。
  - AC-31/F35 契约：`docs/acceptance/trunk-amendment-model-criteria-v1.md:205`，SHA-256 `3c40acad3c657e38f7e02dc0f95303116c27cdf5d3cd08dd954c6c1e9a269cf4`（实测；本变更对其做**显式契约修订**，见 §4.3）。
  - 并行变更（只读，不并入本候选）：文档格式方案 P1.1 `docs/planning/2026-11-09_design_document-format-specifications.md`，**932 行 / 137,880 bytes / `34f8ad1bced9e5b41daff2c04de4fafaa67081033a3ca562fb774ab8bf228fc9`**（其 §7.4 9223 隔离协议、§10.3 串行安排、Q11）；提案卡修复 B1 v1.1 `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`，**294 行 / 48,124 bytes / `682539ba619366ae11243ccb661503ab84873549fc66d5a4b4a23c6b694918c7`**；提案卡修复路由 `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`，**183 行 / 32,508 bytes / `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`**。
- **写盘时基线实测（重要）**：worktree `.claude/worktrees/trunk-amendment`；HEAD **`c1439ce57430ef783b80a01bb6e6437fcb20cabd`**（tree `262e7ba42ee646d055f65f92e640834a89addde1`）；分支 `feat/plan-escalation-card`；`git diff --stat 65813c9..HEAD -- src app test` 为空。**派发口径为「src app test 干净」；写盘实测 `git status --porcelain -- src app test` = 4 个已修改文件**（`app/desktop/customer-input.ts`、`src/service/trunk/impl/apply-journal.ts`、`test/桌面应用/chief-workflow.test.ts`、`test/编排/direct-role-capabilities.test.ts`；合计 +355/−32），经 diff 核对为**提案卡修复候选的在飞改动**（仅 `prepareDecisionEvidence` draft 分支与 `tryChiefDecision` 区域），**不属于本变更候选**。本 B1 不把其计入 judge 候选/证据；judge 实施须待该修复候选冻结/B2 后重取基线（BASE-1/BASE-2）。
- 关系：本 B1 只覆盖本变更；不修改其它 B1、其它在飞变更与已验收候选；不改变公共契约（除方案 §6.1 明列的 AC-31/F35 显式修订与 `judge-delegated` 类型扩展）；发布/tag 不在授权内。
- **编号口径**：方案 §7 定义 **AC-J1..AC-J12**；方案 §6.2 定义测试矩阵 **J1–J17**。任务口径「AC-J1..AC-J17」中的 J1–J17 按方案即为**测试矩阵**编号（方案不含 AC-J13..AC-J17）；本 B1 以 AC-J1..AC-J12 + J1–J17 全覆盖，不擅自新增验收语义（见 §9 R-7）。

## 0. 范围与非目标

### 0.1 本 B1 覆盖

本变更（`judge-delegated` 来源：`intent-confirmed` 生成、读取/复核、`proposal-confirmed` 同源、D3 派生、`doc.freeze` 防御校验、门禁单一实现、桌面**测试口径**回归）的实施前验收标准：确定性测试矩阵、受影响既有套件基线对照、旧断言/契约修订记录、隔离真实运行（AC-J10/AC-J11/AC-J12）与证据层级。

### 0.2 必须保留的契约/边界（硬约束）

1. **Q5/客户主权不变**：run-change、版本决策、VCA、方案升级、修正案逐项/最终、`appointment-write`、`stable-write` 等客户主权卡，**即使「替我决策」开启也仍由客户本人**；judge 结算继续被阻断、永不派生冻结/授权（`customer-input.ts:1046-1073`、`:1320-1385`、`:1911-1915`；`app/desktop/version-change.ts:407-420`）。
2. **回落不变**：judge `manual`/`deny`（decision 组按 manual）/无唯一推荐/结果行投达失败/超时/不可用 ⇒ 既有退回或原卡；关闭开关 ⇒ 原卡回落客户；不得把任何失败路径变成成功。
3. **客户/幕僚路径逐字不变**：customer（`by:"customer"`+`decisionId`+`decidedBy:"customer"`+`source.customer-decision`）与 chief-delegated（`actionSource`/`requestId`/无 customer 字段/`actorRoleId:"chief"`）的字段、校验、错误码与文案不变。
4. **契约/数据模型只允许方案明列的扩展**：`DocFreezeOrigin` 增 `"judge-delegated"`；`DocFreezeRecord.source` 放宽为 `DocFreezeSource`；`DocFreezeEvent` origin 追加同名、`actionSource` 放宽；新增 `JudgeDelegatedSource`/`DOC_FREEZE_JUDGE_DELEGATED_REASONS`/`isJudgeDelegatedSource`/`requestResolvedD3DecisionId`/`isJudgeD3Resolution`；`applicationId` 注释勘误（两口径）。**`request.resolved` 与 `CustomerInputOutcome` 形状不变**（不新增 `actionSource.judge-delegated`、不新增 `by` 值、不改 IPC）。若实施发现需要上述之外的新契约/数据模型/新 `by` 值/新 actionSource ⇒ **停止并升级普通流程**，本 B1 不适用。
5. **产品写集排除**：`app/desktop/*`（产品，含 `customer-input.ts`/`session.ts`）、`app/renderer/*`、`src/common/编排/run-manifest.ts`、`src/provider/runtime/tools.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/version-change/impl/vca-service.ts`、`src/model/trunk.ts`、`src/service/gate/*` 的 judge 候选 **diff = 0**。`test/桌面应用/chief-workflow.test.ts` 属提案卡修复写集，judge 候选 **diff = 0**。
6. **串行缺陷区域**：judge 候选不得改动 `apply-journal.ts` 的 `prepareDecisionEvidence` draft 绑定区域（提案卡修复 A′ 同区域）与 `tryChiefDecision` 区域（提案卡修复 B）；同文件同一时刻单写者。
7. **禁止求绿**：不得以放宽校验、丢弃 fail-closed、伪造 `by`/`operatorId`/`decisionId`/`judge` 审计、自动关闭开关、删除/弱化既有断言、加 skip/force-exit 的方式达成本标准；不得修改 `test/桌面应用/optional-acceptance.test.ts`（基线已知红项，不在写集）。

### 0.3 判定对象

只判定**实现是否满足冻结方案 P1.2 与客户裁定**；不判定方案质量/方案取舍；不判定其它在飞变更。B2 由**同一独立验收身份**按本 B1 执行。

## 1. 基线、实施顺序与证据层级（BASE-1..BASE-7）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| BASE-1 | **judge 实施基线（重取）**：judge 实施开始时记录 worktree、分支、HEAD/`HEAD^{tree}`、`git status --porcelain -- src app test`；基线必须是**提案卡修复候选冻结/B2 后**的状态（含该修复，且不再有该修复的在飞未提交改动）。B1 写盘时快照（HEAD `c1439ce` + 提案卡修复 4 个 M 文件）仅为本 B1 的时点事实，**不得**直接作为 judge 实施/候选基线；judge B2 以重取的干净基线对照。 | 基线 HEAD/tree/status/分支；提案卡修复 B2/冻结记录引用；写盘时快照说明 | 未取证 |
| BASE-2 | **实施顺序与串行裁决**：顺序为**提案卡修复（A′→B）→ judge → 文档格式**（方案 §10.2 / 文档格式方案 §10.3 / Q11；以协调方裁决为准）；judge 实施前须满足：(a) 提案卡修复候选冻结且按其 B1 §8 出口（B2）放行；(b) 协调记录（含对方方案对本变更写集的误述勘误知会）落地；(c) 方案确认按预授权完成。judge 候选不得与其它变更同文件并行编辑；`src/model/runtime.ts` 的 judge→文档格式串行窗口记录在案。 | 协调/调度记录、修复 B2 引用、基线 HEAD、单写者记录 | 未取证 |
| BASE-3 | **基线已知红项 + 增量不回归口径**：(a) `test/桌面应用/optional-acceptance.test.ts` 在记录基线为 **6 tests / pass 2 / fail 1 / cancelled 3 / skip 0**（`not ok 1` `:128` 断言失败；`not ok 4` `:239` judge 代选 `testTimeoutFailure`；`not ok 5` `:252`、`not ok 6` `:287` 超时；成因 `isChiefBusinessCard` 先行拦截、测试未注入 delegation，与本变更无关）——该文件 diff=0、不修复；(b) `test/编排/**` 在提案卡修复 B1 v1.1 A.1 记录的基线为 **22 fail / 2 skip**（集合逐条见该附录；其中含与本变更无关的既有红项）；(c) B2 必须在 **judge 实施基线**上以同一命令/Node 版本重取 before/after：**同名用例不得恶化；新增确定性失败 = 0；新 skip = 0**；不以「旧套件全绿」为前提；任何「环境抖动」须同候选隔离复跑通过方可排除，不得豁免新增确定性失败。 | 基线命令/Node 版本/TAP 输出/逐文件 hash；before/after 失败标题集合 diff；隔离复跑日志 | 未取证 |
| BASE-4 | **候选身份/写集/聚合/manifest**：候选只含方案 §5.1/§5.2 允许文件；记录绝对检出、基线 HEAD、changedPaths（新增/修改/删除）、逐文件 raw SHA-256、可复算聚合（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）与 manifest（`src app test` 及写集）；写集外文件 diff=0（尤其 §0.2-5 排除清单与提案卡修复区域）；无删除/重命名越界、无新依赖。 | 候选清单/聚合/manifest；逐文件 hash；diff/numstat；稳定性快照 | 未取证 |
| BASE-5 | **稳定性**：证据运行前后同一候选/manifest/聚合/树；HEAD/tree/分支/暂存不变；任何源码/测试/依赖/夹具/构建/命令变化使证据失效并重取；不得拼接旧候选/旧证据/不同环境；不得用提案卡修复或其它 B1 的证据冒充本候选。 | manifest/聚合/树前后快照；diff 0；失效重取记录 | 未取证 |
| BASE-6 | **证据层级独立**：L1 模型/单元（runtime-core）、L2 编排/服务、L3 门禁引擎、L4 桌面应用（仅测试口径）、L5 跨层真实文件链（`test/测试/`）、L6 隔离真实运行；各层绑定候选 digest/命令/环境/退出/计数/日志 hash；低层不得替代真实运行，真实运行不得替代确定性；L4 只证明桌面交互既有行为不回归，不证明产品改动（本变更无桌面产品改动）。 | 证据索引（层级/候选/命令/环境）；交叉引用审计 | 未取证 |
| BASE-7 | **显式契约修订与范围前提**：AC-31/F35 的「customer 类 reason ⇒ origin customer/decidedBy customer」属**显式修订**（customer 类 reason 在 judge 代批时可为 `judge-delegated`，无 decidedBy/decisionId，携带 judge 来源；客户路径仍为 customer），变更包须记录该修订并引用 `trunk-amendment-model-criteria-v1.md:205`；不得把修订做成静默放宽。无 §0.2-4 之外的新契约/数据模型。 | 变更包契约修订记录；契约文件 diff；AC-31 引用 | 未取证 |

## 2. 范围、Owner 与写集

### 2.1 产品写集（按方案 §5.1；基线 `c1439ce`，实施基线为 BASE-1 重取值）

| 文件 | owner（角色） | 改动 | 关联条目 |
| --- | --- | --- | --- |
| `src/model/version-change.ts` | 运行时核心 | 新 origin/source 类型、`DOC_FREEZE_JUDGE_DELEGATED_REASONS`、`isJudgeDelegatedSource`、校验分支、`applicationId` 注释勘误 | I-17..I-20、F4 |
| `src/model/runtime.ts` | 运行时核心 | `DocFreezeEvent` origin/source 类型；`requestResolvedD3DecisionId`、`isJudgeD3Resolution` 共享纯函数 | I-23、§3.7、F11 |
| `src/service/trunk/impl/apply-journal.ts` | 编排 | `finalizeIntentConfirmation` judge 分支（`applicationId=intent-<requestId>`）；`verifyReviewIntent`；两处来源筛选；三处 D3 来源判定改用共享 helper | I-01..I-11、I-30、I-32、I-33、F4、F11 |
| `src/service/version-change/impl/freeze-service.ts` | 编排 | `buildDocFreezeRecord` judge-delegated 派生（两处豁免、显式构造、applicationId 按 requestId） | I-21、F6 |
| `src/service/version-change/abstract/version-change-service.ts` | 编排 | `DocFreezeInput.source` 放宽 | I-22 |
| `src/provider/version-change/impl/guard-freeze-registry.ts` | 编排 | `confirmsMigratedIntent` judge 分支 | I-12、I-13 |
| `src/pipeline/orchestration/trunk-runtime.ts` | 编排 | D3 事实包来源判定 + helper | I-34 |
| `src/pipeline/orchestration/version-change-runtime.ts` | 编排 | `freezeEvents` 防御镜像 source（可加模块导出供单测；无当前 producer，J17 钉字节不变） | I-25、F3 |
| `src/common/编排/task-state.ts` | 编排 | `doc.freeze` 校验 judge 分支（防御/未来路径） | I-24、F3 |
| `src/common/门禁引擎/classify-shell.ts` | 门禁引擎 | git policy active D3 judge 分支与 helper | I-35 |

**不需要改的产品文件（明确排除，防越权）**：`app/desktop/*`（交互层已如实产出 judge 结果；I-36/I-43 无需改）、`app/renderer/*`、`src/model/trunk.ts`、`src/service/gate/*`、`src/provider/runtime/tools.ts`、`src/pipeline/orchestration/run-role.ts`（仅调用 Service，签名不变）、`src/service/version-change/impl/vca-service.ts`。

### 2.2 测试写集（按方案 §5.2；每文件单一 owner，零重叠）

| 文件 | owner（角色） | 用途 |
| --- | --- | --- |
| `test/runtime-core/direct-role-capabilities.test.ts` | 运行时核心 | J1/J2；历史记录回归（R3 全部保留） |
| `test/runtime-core/version-change-contract.test.ts` | 运行时核心 | `DocFreezeOrigin`/`DocFreezeEvent`/reason 分区契约随新增 origin 的测试（`:171` 九类 reason 分区、`:468-513` 事件可赋值；既有九类断言不得放宽） |
| `test/编排/direct-role-capabilities.test.ts` | 编排 | J4/J5/J8/J9/J10；customer/chief 回归（`:82-130` 等既有用例保留） |
| `test/编排/version-change-service.test.ts` | 编排 | J3；`:594-620` proposal-confirmed 既有合成用例保留 |
| `test/编排/task-state.test.ts` | 编排 | J16 新增 `doc.freeze` judge 正/负例（该文件当前无 `doc.freeze` 用例，实测 grep 为空）；`:318-386` `request.resolved by judge` 既有回归保留 |
| `test/编排/trunk-events.test.ts` | 编排 | `:116` 起 `doc.freeze` 合法/非法行套件回归 + J16/J17；既有负例（客户类 reason 必须 customer、application 不得冒充 customer 等）逐条保留 |
| `test/门禁引擎/direct-role-capabilities.test.ts` | 门禁引擎 | J11 门禁 type-import 单实例与 judge 记录接受/负例（`:316-330` G2 既有用例保留） |
| `test/门禁引擎/git-shell-acl.test.ts` | 门禁引擎 | J11 classify-shell active D3 judge 变体与授权期望形状（`:453-458` 既有 fixture 保留） |
| `test/桌面应用/decision-service.test.ts` | 桌面窗口（仅测试） | J12 judge 代批 intent-confirm 的 outcome/resolved 字段回归；开关关闭客户卡回落 |
| `test/桌面应用/chain-enforcement.test.ts`、`test/桌面应用/run-pin.test.ts`、`test/桌面应用/run-change-trigger.test.ts` | 桌面窗口（仅测试） | 既有 `by:"judge"` D3 fixture 行为不回归（只允许追加断言；既有断言逐字保留） |
| `test/测试/git-write-chain-fixture.ts`、`test/测试/direct-role-capabilities-e2e.test.ts`、`test/测试/version-change-integration.test.ts` | 测试 | J15 真实文件链 judge intent 冻结与下游消费；Q5 客户主权回归（`:1290-1315` VCA 不进判断器、judge/directive 回包 unavailable）保留 |
| 可选新增 `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 测试 | 跨层联调矩阵（可选；`test/测试/` 目录已授权） |

- **零重叠/无 H1**：每张测试文件只有一个角色 owner；产品文件按 boundary §1 唯一 owner。**桌面窗口角色在本变更只写测试文件，不写 `app/desktop/*` 产品**。
- **升级条件**：若实施发现需要修改 §0.2-5 排除文件、新增契约/数据模型/新 `by` 值/新 IPC、或触碰 §0.2-6 缺陷区域 ⇒ **立即停止并升级普通流程**，本 B1 不适用。

## 3. 验收标准（AC-J1..AC-J12）

> 判定前提：每条在**同一 judge 候选**上、以可复算原始证据判定；全部子判据满足方可 `pass`；任一 fail 触发项即 `fail`；证据不全为 `insufficient evidence`。

### 3.1 AC-J1（P0）：`intent-confirmed` 可由 judge 代批生成

**必须观察的结果（全部满足）：**

1. 真实文件链（Service/Store/Registry 层，非手写桩）上，judge 代批 `intent-confirm`（`outcome.judge` + `operatorId:"judge:<engine>"` + 应用回填 `decisionId:"decision-<requestId>"`）经 `finalizeIntentConfirmation` **成功**生成 R9 baseline 冻结记录。
2. 冻结记录字段：`schema:"doc-freeze/v1"`、`reason:"intent-confirmed"`、`origin:"judge-delegated"`、`applicationId:"intent-<requestId>"`（`requestId` 来自真实 `request.resolved.requestId`）、`frozenAt === resolved.at`。
3. `source.kind:"judge-delegated"`；`source.requestId/engine/operatorId/reasonCode/reason/selected/cardKind/at` 与账本 `request.resolved`（及其 `judge` 审计）**逐字段一致**；`model` 如账本提供则一致；`source.operatorId === "judge:" + source.engine`；`selected`（如有）与 `resolved.selectedOptionIds` 完全一致。
4. 生成后 `readConfirmedIntentEvidence` 返回 ok；`verifyReviewIntent`/`confirmsMigratedIntent` 以**账本重放**（不信任冻结记录自述）通过：`decision.event.at === freeze.frozenAt`，source 摘要逐字段对账；二次冻结来源筛选（`apply-journal.ts:694-696`、`:1304-1306`）接受 `judge-delegated` 且**仍拒绝** application/role-direct。
5. **重放/幂等**：同一 outcome 重复 finalize 不产生重复/冲突记录（既有 old-record 分支逐字复用）；未呈现/字节漂移/既有记录冲突仍拒绝。
6. **`doc.freeze` 口径**：本轮 judge 冻结**不产生 `doc.freeze` 事件**（无 judge producer；judge 冻结只写 R9 baseline）。`freezeEvents` 的 source 镜像仅为防御/未来路径（I-25），只在 source-bearing 输入时生效且既有事件字节不变（J17）。不得把 judge 冻结宣称为 `doc.freeze` 生产者。

**必要原始证据**：J4/J15 测试日志与断言；`versions.jsonl`（R9 baseline）冻结行原件；`tasks.jsonl` 对应 `request.created/request.resolved`；`readConfirmedIntentEvidence`/`verifyReviewIntent` 输出；命令/环境/退出/计数。**判定：未取证。**

### 3.2 AC-J2（P0）：审计真实、无伪造、G1 不截断、模型值不进入授权

**必须观察的结果（全部满足）：**

1. judge 冻结/授权记录**不含** `decidedBy:"customer"`、客户 `decisionId`、伪造 `actorRoleId`、伪造 `requestId` 或任何客户身份字段；`operatorId === "judge:<engine>"`；`engine` 为非空字符串；`reasonCode`/`cardKind`/`group`/`at` 类型合法且自洽。
2. `judge:null`/非对象/缺字段/`engine` 空串/`operatorId` 不符/`cardKind` 与 `reason` 不匹配/`applicationId` 不符/`frozenAt !== source.at` ⇒ **fail-closed、不抛错**（`isValidDocFreezeRecord` 返回 false；`finalizeIntentConfirmation` 返回 `trunk-item-invalid` 且不写冻结；D3/门禁拒绝确定）。
3. **冻结记录不写 `decisionId`**：应用真实生成的 `decision-<requestId>` 只保留在账本/`request.resolved` 与 D3 授权证据，不进入冻结 `decisionId` 字段（`decisionId`/`decidedBy`/`actorRoleId` 对 judge origin 均缺省）。
4. **G1 单一策略**：`reason`/`reasonCode`/`model`/`selected` 等来源摘要**按账本原值逐字段复制，不截断、不设长度上界、超界不拒绝**；J2/J4/J5 覆盖超长原值。若未来需要上界，须在账本生产端与重放端用同一归一化函数（独立变更，不在本写集）。
5. **模型值不进入授权**：`judge.engine/model/reason/evidence` 仅为审计复制，不构成门禁/授权判定输入；D3 授权期望形状只消费 `d3Source` 与 `decisionId`（或 chief 的 `actionSource`），gate 对 `role-authorization/v1` 的比对不读取模型/理由字段。
6. **形状不变**：`request.resolved` 与 `CustomerInputOutcome` 不新增 `actionSource.judge-delegated`、不新增 `by` 值、不改 IPC；judge outcome 的既有字段（`judge`/`operatorId`/应用回填 `decisionId`）原样消费。
7. **信任边界如实（F7）**：本轮**不收紧** `task-state.ts:430-456` 对 `request.resolved.judge` 的结构校验；补偿为新增冻结/授权路径的账本重放逐字段核对。不得在证据/报告中宣称账本层已对 judge 审计做强校验。

**必要原始证据**：J2/J5 负例断言；字段级快照（冻结记录/账本行原文）；超长原值用例；授权证据与门禁期望形状对照；F7 边界说明。**判定：未取证。**

### 3.3 AC-J3（P0）：客户本人与 chief-delegated 路径逐字不变；基线已知红项增量口径

**必须观察的结果（全部满足）：**

1. customer `intent-confirm` 路径（`resolved.by==="customer"`、真实 `decisionId`、`decidedBy:"customer"`、`source.customer-decision`）字段/校验/错误码/文案**逐字不变**；J6 既有用例不改断言、逐字通过。
2. chief-delegated 路径（`actionSource`/`requestId`/无 customer 字段/`actorRoleId:"chief"`）逐字不变；J7 既有用例逐字通过。
3. 既有套件按 §1 BASE-3「基线已知红项 + 增量不回归」判定：before/after 同名失败集合 diff 记录，**新增确定性失败 = 0、新 skip = 0、预存红项不恶化**。
4. `test/桌面应用/optional-acceptance.test.ts` diff = 0（不修复、不修改）；其基线计数（6/2/1/3/0）在 B2 证据中逐条对照。

**必要原始证据**：J6/J7 运行日志；customer/chief 冻结行字节对照；before/after 计数与失败标题集合；文件 hash。**判定：未取证。**

### 3.4 AC-J4（P0）：judge 回落与开关关闭回落不变

**必须观察的结果（全部满足）：**

1. judge `manual`（含 decision 组 `deny` 按 manual）、无唯一推荐（`not-recommended`）、结果行投达失败、超时、运行时不可用 ⇒ 既有行为（自动退回发起角色/原卡呈现客户）；**不产生冻结/生效**。
2. 「替我决策」开关中途关闭/重载复位 ⇒ judge 结论不再具代批授权，回落客户手动（既有 `governance-judge.switch.off` 语义）；关闭开关的初始路径 ⇒ 原卡呈现客户、judge 调用数 0。
3. `request.resolved`/回执如实反映回落（`declined`/`unavailable` 等），不得伪造成 `answered`/冻结成功。

**必要原始证据**：J14 用例；桌面套件（decision-service 等）judge 回落断言；开关关闭用例；账本行。**判定：未取证。**

### 3.5 AC-J5（P0）：Q5/客户主权卡继续由客户本人

**必须观察的结果（全部满足）：**

1. run-change、版本决策、VCA、方案升级、修正案逐项/最终、`appointment-write`、`stable-write` 即使开关开启：不进入 judge（无 judge 调用/无 judge 结果行），或结算最后防线拒绝非客户来源（pending 保留）；无 judge 派生冻结/授权。
2. 既有主权负例继续通过：`test/测试/version-change-integration.test.ts:1290-1315`（VCA 卡 judge 调用数 0；judge/directive 回包 → `unavailable`）、`test/编排/acceptance-judge-minimal.test.ts`/`download-judge.test.ts` 等既有判定不被放宽；`version-change.ts:407-420` `sovereignViolation` 不变。
3. Q5 清单未被任何"judge 代批生效"措辞扩大或缩小；appointment-write 仍永不进入判断器（`customer-input.ts:1327-1331`）；`@决策` 指令排除不变（`:1911-1915`）。

**必要原始证据**：J13 用例；既有主权测试日志；judge 调用计数；诊断事件。**判定：未取证。**

### 3.6 AC-J6（P1）：`proposal-confirmed` 同源支持（无 producer）

**必须观察的结果（全部满足）：**

1. 模型/Service/账本校验/门禁消费接受 `proposal-confirmed` + `judge-delegated`（`applicationId:"proposal-<requestId>"`、`cardKind:"proposal"`、summary 字段一致）。
2. `DOC_FREEZE_JUDGE_DELEGATED_REASONS` 恰为 `["proposal-confirmed","intent-confirmed"]`；VCA/version-upgrade/detail/amendment/stable 等 reason + judge source ⇒ 拒绝（Q5 客户主权）。
3. **不新增 producer**：不得为本变更新造 `proposal-confirmed` 的 judge 生产路径（计划外接线变更）。
4. 仅以单位/契约测试覆盖（当前无生产路径），证据如实标注「无真实 producer」。

**必要原始证据**：J1/J2/J3；reason 子集常量断言；拒绝负例。**判定：未取证。**

### 3.7 AC-J7（P1）：D3 judge 派生生效与共享 helper

**必须观察的结果（全部满足）：**

1. 存在 judge D3 裁决（fixture 或真实）时，`prepareRoleActivation`/`activateRoleDocuments`/`prepareExecutionRun`/`prepareRoleDraftScope`（`apply-journal.ts:3186`、`:3431`、`:3536-3543`）与 `trunk-runtime.ts:724-732`、`classify-shell.ts:517-541` 可完成激活/执行 pin/草案作用域；`d3Source:"judge"`，授权证据 `decisionId` 为应用真实生成值 `decision-<requestId>`（**不是客户 decisionId、不是伪造值**）；**冻结记录仍不写 `decisionId`**（AC-J2-3 口径不变）；`targetRoleIds`/`rosterVersion`/`rosterSha256` 等既有校验保留。
2. **单一实现**：`requestResolvedD3DecisionId`（customer/judge → `decisionId`；chief-delegated → `requestId`；其他 undefined）与 `isJudgeD3Resolution`（judge 来源校验）各只有一份，位于 `src/model/runtime.ts`；4 处同构三元式（`apply-journal.ts:3186`、`:3542`、`trunk-runtime.ts:732`、`classify-shell.ts:533`）与来源条件（`apply-journal.ts:3431`）一律调用共享函数，不得各自手写条件。
3. 负例 fail-closed：审计缺失/`judge:null`/非对象/缺字段、`engine`/`reasonCode` 空、`operatorId !== "judge:"+engine`、`decisionId !== "decision-"+requestId`、`actionSource`/`directiveId` 混入、`judge.group !== governanceCardGroup(judge.cardKind)`、`targetRoleIds`/roster 戳不符 ⇒ 全部拒绝，不抛错。
4. **既有 `by:"judge"` D3 fixture 观察项**：`test/桌面应用/chain-enforcement.test.ts:283-295`、`run-pin.test.ts:177-181`、`run-change-trigger.test.ts:203-215` 的 fixture 无 `judge` 审计/`operatorId`，不满足 `isJudgeD3Resolution`；若其既有路径不消费该 helper，行为必须不变；若实施使这些路径经 helper 判定，必须显式升级 fixture（补全 judge 审计/operatorId）并逐条记录断言改写，不得静默放宽或静默拒绝既有用例。
5. `request.resolved` 校验（`task-state.ts:430-456`）不新增 judge-delegated `actionSource` 分支（Q8 最小暴露面）；judge D3 不改变 `request.resolved` 形状。

**必要原始证据**：J8/J9/J10/J11；授权证据 `role-authorization/v1`/`role-activation/v1` 原件；helper 源码 grep；fixture diff 记录。**判定：未取证。**

### 3.8 AC-J8（P1）：旧记录兼容

**必须观察的结果（全部满足）：**

1. 历史 `customer`/`application`/`role-direct`/`chief-delegated` 冻结记录经同一 `isValidDocFreezeRecord` 全部继续通过（R3/G2 用例逐字通过，字段不被重写）。
2. 旧 `doc.freeze` 账本行（合法/非法分类）逐字通过；`trunk-events.test.ts:116` 起既有套件不改断言。
3. 历史 customer/chief-delegated `intent-confirmed` 读取、复核、发布路径不变（`readConfirmedIntentEvidence`/`verifyReviewIntent`/`confirmsMigratedIntent`）。
4. 旧 judge 结算但未产生冻结的记录**不追溯补冻结**（Q3；无真实冻结字节/快照）；客户可重新确认。

**必要原始证据**：R3/R5/G2 用例；旧行回放日志；临时禁用新 origin 的对照（证明旧分支不变）。**判定：未取证。**

### 3.9 AC-J9（P1）：门禁单一实现、不复制

**必须观察的结果（全部满足）：**

1. `isValidDocFreezeRecord` 仅一份实现（`src/model/version-change.ts`），`versioned-doc-guard.ts:33-43` 继续 type-import 单一来源；`test/门禁引擎/direct-role-capabilities.test.ts:316-330` 的 `isValidDocFreezeRecord === modelFreezeValidator` 断言保留。
2. `requestResolvedD3DecisionId`/`isJudgeD3Resolution` 各恰一份实现；`apply-journal.ts`/`trunk-runtime.ts`/`classify-shell.ts` 仅调用、不复制条件；源码 grep 证据（定义计数 = 1，调用点逐处列出）。
3. `classify-shell.ts:724` git policy baseline 冻结校验自动接受 judge-delegated（同一模型不变量），无第二份判定。

**必要原始证据**：source grep 清单；J11；门禁套件日志。**判定：未取证。**

### 3.10 AC-J10（P0，真实）：开启「替我决策」真实运行生效

**必须观察的结果（全部满足）：**

1. 真实 Electron（judge 候选 worktree `app/main.ts`）+ **真实 Claude**（非 demo）+ 真实桌面 UI；环境按 AC-J12 隔离。
2. 幕僚发出 `intent-confirm` 卡（真实意图准备/marker），开关开启，judge 代批 `confirm`：`request.resolved.by:"judge"`、`operatorId:"judge:<engine>"`、`judge` 审计随行、应用生成 `decisionId`。
3. `finalizeIntentConfirmation` **成功**：`intent-confirmed`/`judge-delegated` 冻结写入 R9 baseline；`source` 与账本一致、`applicationId:"intent-<requestId>"`、无 customer/decisionId 伪造；UI **无 pending-recovery**；下游 pin/handoff/下一真实门可消费该冻结（`readConfirmedIntentEvidence` ok 或真实下一门通过）。
4. 若失败/回落：如实报告，不宣称成功；不得以关闭开关/客户手批冒充本项。

**必要原始证据**：UI 截图/录屏；`.ans/state/tasks.jsonl`（created/resolved）；`.ans/state/versions.jsonl`（冻结行）；诊断日志；驱动日志。**判定：未取证。**

### 3.11 AC-J11（P0，真实）：关闭开关回落客户

**必须观察的结果（全部满足）：**

1. 同一真实环境（可另起一次隔离运行），开关**关闭**：`intent-confirm` 原卡呈现客户，judge 调用数 0/无 judge 结算。
2. 客户本人点卡：`by:"customer"`、真实 `decisionId`、`decidedBy:"customer"` 冻结成功；行为与变更前一致（对照既有路径）。
3. 若预算内无法完成本腿：如实标注；在 B2 中本项判 `insufficient evidence`（不得以确定性测试替代真实运行并谎称已证明；协调方若批准替代口径，须先修订 B1 版本）。

**必要原始证据**：真实运行截图/账本/冻结行；judge 调用计数。**判定：未取证。**

### 3.12 AC-J12（P0）：隔离真实运行（环境/预算/证据）

**必须观察的结果（全部满足）：**

1. **隔离**：CDP 端口 **9223**（独立 `--remote-debugging-port=9223`）；独立 `--userData`（专用路径，不写全局 `%APPDATA%/Electron` 共享态）；仓库外独立目标项目根（如 `C:\Users\51054\Desktop\work\ans-judge-delegated-run-2026-11-09\target`）。**不得占用/关闭贪吃蛇运行中的 9222、其临时根或目标项目**（`C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09` 及 target）；只读引用其证据。
2. **预检**：9222 由贪吃蛇占用（只读确认，不触碰）；9223 空闲；记录运行配置/入口/provider/userData/目标根/端口。
3. **预算与停止（按每次隔离运行计）**：客户消息 ≤1；`intent-confirm` 卡 ≤1；模型回合最小化并如实记录；墙钟 ≤20 分钟；**首个决定性证据即 halt**；不自动重试。开/关两腿至多各一次隔离运行（合计 ≤2 次），总计如实记录。
4. **后检**：9222 与贪吃蛇根零改动（运行前后进程/端口/临时根/目标项目关键文件 hash 只读对照）；9223 释放；无 Electron 残留；运行不写目标项目之外任何运行根。
5. **git**：运行前后 `git status`/`git diff --stat` 证明仅允许写集变化；未提交/推送/合并/发布。
6. **证据清单**：诊断原件、`tasks.jsonl`、`versions.jsonl`/冻结快照、UI 截图、驱动日志（9223）、端口/进程前后检查、贪吃蛇根前后只读快照。
7. **合并判定**：AC-J12 与 AC-J10/AC-J11 共同构成真实运行判定；隔离/预算/证据不得替代两腿行为证据，两腿行为证据也不得替代隔离证明。

**必要原始证据**：运行配置与端口/进程前后检查；快照/hash；证据清单；git 记录。**判定：未取证。**

## 4. 测试矩阵（J1–J17）、受影响套件与旧断言记录

### 4.1 新增矩阵（按方案 §6.2 逐条转写）

| ID | 层级/owner | 用例 | 必须观察（判定要点） | 判定 |
| --- | --- | --- | --- | --- |
| J1 | 运行时核心/编排 | `isValidDocFreezeRecord` 接受 `intent-confirmed` `judge-delegated`（完整 source/snapshotRef）；同型 `proposal-confirmed` | true；字段不被重写；`applicationId`/`cardKind`/`frozenAt` 自洽 | 未取证 |
| J2 | 运行时核心 | judge 负例：`decidedBy`/`decisionId`/`actorRoleId` 任一出现；`operatorId` 与 engine 不符；`engine` 空串；`judge`/source 为 null/非对象/缺字段；`applicationId` 非 `intent-/proposal-<requestId>`；reason 非子集；`frozenAt!==source.at`；source kind 非 judge-delegated；`selected` 与 `resolved.selectedOptionIds` 不一致 | 全部 false（非法形状 fail-closed、不抛错）；**不得有长度上界拒绝**（G1） | 未取证 |
| J3 | 编排 | `buildDocFreezeRecord`/`freeze()`：proposal/intent + judge source；`applicationId` 空 ⇒ 合成 `proposal-/intent-<requestId>`；VCA/version-upgrade/detail/amendment/stable reason + judge source ⇒ 拒绝 | 前三者通过且 origin 正确；后者全部拒绝（Q5） | 未取证 |
| J4 | 编排 | `finalizeIntentConfirmation`（judge approve，真实账本 created/resolved + marker + 快照；**含超长 `judge.reason`/`model` 原值**；重放/幂等） | 成功；baseline 出现 `intent-confirmed`/`judge-delegated`；source 摘要与账本**逐字一致（不截断）**；无 decidedBy/decisionId；`readConfirmedIntentEvidence` ok；重放不重复/不冲突 | 未取证 |
| J5 | 编排 | judge 负例：outcome.judge 与 resolved.judge 不一致；source 摘要（reason/model/selected）与账本不一致；judge 为 null/非对象/缺字段；operatorId 不符；decisionId 非 `decision-<requestId>`；resolved.directiveId/actionSource 混入；无 judge resolved 行 | 全部 `trunk-item-invalid`、不写冻结、不抛错（S1） | 未取证 |
| J6 | 编排 | customer 路径回归：既有 customer intent-confirm/幂等/冲突/字节漂移用例 | 逐字通过（不改断言）（AC-J3） | 未取证 |
| J7 | 编排 | chief-delegated 路径回归：既有 delegated intent-confirm 用例 | 逐字通过（不改断言） | 未取证 |
| J8 | 编排 | judge D3：`prepareRoleActivation`/`activateRoleDocuments`/`prepareExecutionRun`/`prepareRoleDraftScope` 接受 judge 事件（`decisionId=decision-<requestId>`、judge 审计/operatorId 自洽） | 成功；`d3Source:"judge"`；authorization `decisionId` 为真实应用值；既有 targetRoleIds/roster 校验保留 | 未取证 |
| J9 | 编排 | judge D3 负例：审计缺失/不匹配、operatorId 不符、decisionId 异常、actionSource 混入、targetRoleIds/roster 戳不符 | 全部拒绝（fail-closed、不抛错） | 未取证 |
| J10 | 编排 | judge D3 的后续 pin/handoff/发布读取（`readConfirmedIntentEvidence`、`verifyReviewIntent`） | 成功且证据来源可区分；旧记录不受影响 | 未取证 |
| J11 | 门禁引擎 | classify-shell active D3 judge 正/负例；授权期望形状；baseline 冻结记录含 judge-delegated；`isValidDocFreezeRecord === modelFreezeValidator` | 正例通过、负例拒绝；同一函数不复制（AC-J9） | 未取证 |
| J12 | 桌面窗口（测试） | judge 代批 intent-confirm 的 outcome/resolved 字段不变（回归钉）；开关关闭 ⇒ 客户卡（无 judge 结算） | 既有行为不回归；形状不变（无新 actionSource/by） | 未取证 |
| J13 | 桌面窗口（测试） | 主权卡（VCA/run-change/版本决策/appointment-write/stable-write）judge 结算阻断 | 继续阻断（Q5） | 未取证 |
| J14 | 编排/模型 | judge manual/deny/无唯一推荐/不可用/关闭开关 | 既有回落：declined/客户卡；无冻结 | 未取证 |
| J15 | 测试（跨层） | 真实文件链：judge intent 冻结 → pin/handoff/发布前读取；旧 customer/chief 记录回放 | 全链通过；旧记录逐字通过 | 未取证 |
| J16 | 编排 | `task-state` `doc.freeze` judge-delegated 账本校验（I-24）：正例（完整 source + `applicationId` 匹配）与负例（source 缺失/字段不符/customer 字段混入/applicationId 不匹配）；既有 customer/application/role-direct/chief 行 | 正例通过、负例拒绝；旧行逐字通过 | 未取证 |
| J17 | 编排 | `freezeEvents`（I-25）：既有 VCA approve/detail apply 无 source 路径事件字节与当前逐字一致；构造带 judge-delegated source 的 entry ⇒ 镜像 `actionSource` 且通过 J16 校验 | 字节不变；镜像正确 | 未取证 |

### 4.2 受影响既有套件、运行命令与前后对照

- **运行时核心**：`node --test test/runtime-core/direct-role-capabilities.test.ts test/runtime-core/version-change-contract.test.ts`（或等价逐文件）；记录 tests/pass/fail/cancelled/skip/exit。
- **编排**：`node --test --test-concurrency=1 "test/编排/**/*.test.ts"`；在 **judge 实施基线**上重取 before/after（BASE-3）；before/after 失败标题集合 diff；重点点名 `direct-role-capabilities.test.ts`、`version-change-service.test.ts`、`task-state.test.ts`、`trunk-events.test.ts`、`decision-intent-drift.test.ts`（judge 回落回归，只读）、`acceptance-judge-minimal.test.ts`/`download-judge.test.ts`（非目标路径，只读）。
- **门禁引擎**：`node --test "test/门禁引擎/**/*.test.ts"`（至少含 `direct-role-capabilities.test.ts`、`git-shell-acl.test.ts`）；记录计数/退出。
- **桌面应用（仅测试口径）**：`node --test --test-timeout=6000 test/桌面应用/decision-service.test.ts test/桌面应用/chain-enforcement.test.ts test/桌面应用/run-pin.test.ts test/桌面应用/run-change-trigger.test.ts`；另以只读回归执行 `test/桌面应用/chief-workflow.test.ts`（其基线为提案卡修复 A.2/A.3 记录的冻结集，judge 候选 diff=0）与 `test/桌面应用/optional-acceptance.test.ts`（BASE-3；只读、diff=0）。
- **测试层**：`node --test "test/测试/**/*.test.ts"` 或等价逐文件（至少含 `git-write-chain-fixture` 相关、`direct-role-capabilities-e2e.test.ts`、`version-change-integration.test.ts`）。
- **静态门**：`npm run typecheck`（`tsc --noEmit`）exit 0；本变更不改 `app/renderer/**`，`typecheck:renderer` 如既有流程要求则按其实际命令执行并记录。
- **统一口径**：每条证据绑定候选 digest/命令/环境/Node 版本/退出/计数/日志 hash；**不以绝对全绿为前提**；不得加 skip/force-exit/watchdog 求绿。

### 4.3 旧断言改写与 AC-31/F35 契约修订（不得静默放宽）

1. **契约修订（文档级）**：AC-31/F35 行（`docs/acceptance/trunk-amendment-model-criteria-v1.md:205`）须在变更包/验收记录中显式引用并说明：customer 类 reason 在「开关开启且 judge 代批」时可为 `origin:"judge-delegated"`（无 decidedBy/decisionId），客户路径仍为 customer。属**显式修订**，不是放宽；未记录视为 fail。
2. **既有断言基线核对（逐文件）**：以下既有断言必须**原样保留并通过**：`test/runtime-core/direct-role-capabilities.test.ts:172-198`（R3 历史记录合法/非法集合）；`test/runtime-core/version-change-contract.test.ts:171`（九类 reason 两分区穷尽，judge 子集是**新常量**、不入 `DOC_FREEZE_REASONS`）；`test/门禁引擎/direct-role-capabilities.test.ts:316-330`（G2）；`test/编排/trunk-events.test.ts:116` 起 `doc.freeze` 合法/非法行（客户类必须 customer、application 不得冒充 customer 等）；`test/编排/task-state.test.ts:318-386`（`request.resolved` judge 既有校验）；customer/chief intent 用例（J6/J7）。若实施确需改写任一断言：逐条给出 `文件:行`、旧断言原文、新断言、理由（须对应客户裁定/AC）、证据行；**不得删除/弱化 fail-closed 断言**；未记录即判 fail。
3. **既有 `by:"judge"` D3 fixture**：按 AC-J7-4 观察项处理；如升级 fixture，须记录旧/新 fixture 与受影响测试，不得静默变更语义。
4. **`optional-acceptance.test.ts`**：diff 必须为 0；其红项不得修复/弱化。
5. **无既有负例需删除**：若实施发现「judge 必须被拒绝」类既有断言，必须停下按本 B1 §4.3-2 记录并复核（方案 §6.1 的检索结论为未发现；出现即为新事实，须升级复核）。

### 4.4 G1/S1 专项（并入 J2/J4/J5/J11）

- **G1**：冻结侧不截断、不设上界、按账本原值逐字段复制；J4 以超长 `judge.reason`/`model` 原值证明冻结与复核均通过；J2 不得把「超界」列为拒绝条件；若实施引入截断/上界 ⇒ fail（需另立变更）。
- **S1**：`isJudgeD3Resolution` 与 `finalizeIntentConfirmation` judge 分支先做 `typeof judge === "object" && judge !== null` 与字段类型检查；`judge:null`/非对象/缺字段 ⇒ false/`trunk-item-invalid`，不抛 TypeError；J2/J5/J11 覆盖。

### 4.5 证据绑定

所有 J 用例日志标注候选 digest/manifest、命令、环境、Node 版本、退出码与计数；同一用例不得跨候选拼接；真实运行（§5）单独层级。

## 5. 真实运行标准（RR-1..RR-7；对应 AC-J10/AC-J11/AC-J12）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| RR-1 | **环境**：真实 Electron（judge 候选 worktree `app/main.ts`）+ 真实 Claude（非 demo）+ 真实桌面 UI；独立 `--userData`；CDP 仅 **9223**；仓库外独立目标项目根（如 `ans-judge-delegated-run-2026-11-09/target`）；记录候选 HEAD/聚合、入口、provider、userData/目标根、端口。 | 未取证 |
| RR-2 | **开启腿（AC-J10）**：全新目标项目 → 真实意图准备/幕僚 `intent-confirm` → 开关开启 → judge 代批 `confirm` → `request.resolved.by:"judge"`、`operatorId:"judge:<engine>"`、judge 审计、应用 `decisionId` → `finalizeIntentConfirmation` 成功（`intent-confirmed`/`judge-delegated`、`applicationId:"intent-<requestId>"`、source 与账本一致、无 customer/decisionId 伪造）→ UI 无 pending-recovery → 下游 pin/handoff/下一真实门可消费；首个决定性证据即停。 | 未取证 |
| RR-3 | **关闭腿（AC-J11）**：开关关闭（另一次隔离运行或同一运行明确记录的关闭状态）→ 原卡呈现客户、judge 无结算 → 客户本人点卡 `by:"customer"`+真实 `decisionId` 冻结成功 → 行为与变更前一致；预算内无法完成则如实标注（该腿不足以判 pass）。 | 未取证 |
| RR-4 | **隔离证明（AC-J12）**：预检 9222 由贪吃蛇占用（只读）/9223 空闲；后检 9222 与贪吃蛇根零改动（进程/端口/临时根/目标项目关键文件 hash）、9223 释放、无 Electron 残留；运行不写贪吃蛇根/目标项目；只读引用其证据。 | 未取证 |
| RR-5 | **预算/纪律**：按每次运行：客户消息 ≤1、`intent-confirm` 卡 ≤1、墙钟 ≤20 分钟、模型回合最小化并如实记录、首果即停、不自动重试；开/关至多各一次运行；出现任何非本变更卡、越界写、非预期模型调用 ⇒ 立即停止并如实报告。 | 未取证 |
| RR-6 | **证据与如实性**：诊断原件、目标项目 `tasks.jsonl`、`versions.jsonl`（R9 baseline 冻结行）、冻结快照、UI 截图、驱动日志（9223）、端口/进程前后检查、运行前后 `git status`/`git diff --stat`（仅允许写集变化）；失败/回落/下一门如实报告，不伪造、不宣称未发生的结果。 | 未取证 |
| RR-7 | **两腿同一候选**：RR-2/RR-3 使用同一 judge 候选与同一配置口径（可不同隔离目标项目）；不得用提案卡修复或其它变更的运行证据替代。 | 未取证 |

## 6. 证据与检查要求（EV1–EV6）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| EV1 | 基线/候选：BASE-1–BASE-4；实施基线重取；候选只含允许文件；写集外 diff=0；聚合/manifest 可复算。 | 未取证 |
| EV2 | 模型/服务：AC-J1/J2/J6/J8/J9；J1–J3、J4/J5 负例；G1/S1；R9 baseline 与账本对账。 | 未取证 |
| EV3 | 编排/D3/门禁：AC-J7/J9；J8–J11、J16/J17；helper 单实现 grep；授权证据形状。 | 未取证 |
| EV4 | 桌面测试口径/回归：AC-J3/J4/J5/J8；J6/J7/J12/J13/J14；before/after 计数与失败集合 diff；optional-acceptance 只读。 | 未取证 |
| EV5 | 跨层/静态门：J15；`npm run typecheck` exit 0；旧断言改写逐条记录；契约修订记录。 | 未取证 |
| EV6 | 真实运行：RR-1–RR-7；预算/隔离/证据/如实性；9222 零改动与 9223 释放。 | 未取证 |

## 7. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前候选上全部适用项有完整、可复算原始证据；judge 冻结/读取/复核/D3/门禁按 AC-J1/J2/J6/J7/J9 成立；customer/chief/回落/Q5 按 AC-J3/J4/J5 不变；旧记录按 AC-J8 通过；基线按 BASE-3 增量不回归；真实运行按 AC-J10/J11/J12 与 RR-1–RR-7 完成；范围仅允许文件且写集外 diff=0；契约修订显式记录。
- **fail**：改 `app/desktop/*` 产品/`app/renderer/*`/`run-manifest.ts`/`tools.ts`/`run-role.ts`/`vca-service.ts`/`model/trunk.ts`/`service/gate/*`；触碰 §0.2-6 缺陷区域；新增契约/数据模型/新 `by` 值/新 actionSource/IPC；伪造 `by`/`operatorId`/`decisionId`/`judge`/`requestId`；把失败路径变成功；放宽 Q5/主权/回落；删除/弱化既有断言、加 skip/force-exit；新增确定性失败或新 skip、预存红项恶化；用截断/上界破坏 G1；真实运行占用 9222 或改动贪吃蛇运行；修复/修改 `optional-acceptance.test.ts`；证据造假。
- **insufficient evidence**：缺基线/候选/聚合/manifest/hash；缺逐层证据；缺 before/after 计数或失败集合 diff；缺 J2/J5 负例或 G1/S1 用例；缺 helper 单实现 grep；缺旧断言改写记录；缺真实运行任一腿/隔离证明/预算记录/证据包；证据跨候选拼接或环境不一致。
- **not applicable**：仅限有明确依据者（Pi/Codex 真实模型：本变更只要求真实 Claude；renderer judge 来源展示：非目标；文档格式方案条目：属其它变更）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以退出 0/自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；**不判方案质量**，只判实现与本 B1/方案/客户裁定的一致性。

## 8. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B1 冻结 | 本文件写盘；全部条目 `未取证`；编号口径与残余记录在案 | — |
| 协调/派发闸门 | BASE-2：提案卡修复先冻结/B2；协调记录（含勘误知会）落地；方案确认；单写者安排 | 不派发；补协调/重排 |
| judge 实施基线 | BASE-1 重取；BASE-4 候选身份建立；写集外 diff=0 | 回 owner；越界即停止升级 |
| 确定性验证 | AC-J1–J9、J1–J17、EV2–EV5、typecheck；AC-J3/BASE-3 增量口径 | 回 owner；不得放宽断言求绿 |
| 真实运行 | AC-J10/J11/J12、RR-1–RR-7 完成并如实报告 | 不进入 B2 pass；按 insufficient/返工处理 |
| B2 | 同一独立验收身份按本 B1 全部适用项判定；证据链齐备；披露充分 | 报告 pass/fail/insufficient；不授权发布 |
| 复判 | B1 冻结后不改标准适配候选；确需变更递增版本并记录理由/影响；候选/基线/写集/依赖/夹具/构建/命令/环境变化使证据失效并重取 | 重新取证/重判 |

## 9. 残余/待确认（在本 B1 的处置与条件）

| # | 事项 | 本 B1 处置/条件 |
| --- | --- | --- |
| R-1 | **Q3**：judge `request.resolved` 缺 `decisionId` 的旧记录 | 采用默认 **fail-closed**（不冻结、不追溯、不推断；客户可重新确认）。若实施改为「缺失时退回 requestId 定位」⇒ 方案偏离，须停下升版复核；本 B1 按 fail-closed 判定。 |
| R-2 | **Q9**：客户「替我决策」下 `acceptance` 卡语义（幕僚委托 vs judge 代批；旧测试 `optional-acceptance.test.ts:239` 期望） | 按现行代码（幕僚委托先行），交沟通确认；**不阻断**本 B1（AC-J10/J11 不依赖 acceptance 路由）；确认前不修该测试、不改 `app/desktop/*`。 |
| R-3 | **Q10**：I-25 `freezeEvents` 防御镜像保留 vs 删除（当前无 judge `doc.freeze` producer） | 默认**保留**（防御/一致性；既有事件字节不变，J17 钉住）；若协调方决定删除，另立变更并在 B2 前更新本 B1 引用；不得在 judge 变更中新增 producer。 |
| R-4 | **F7/§9.9**：`task-state.ts` 对 `request.resolved.judge` 无结构校验的信任边界 | 本轮**不收紧**（避免追溯拒绝历史事件）；补偿为冻结/授权路径账本重放逐字段核对（AC-J2-7/AC-J7）；该边界须在实施/验收记录中如实披露，不得宣称账本层已强校验。 |
| R-5 | **C-05/F10 勘误**：意图记录引用的 `docs/acceptance/entry-role-minimal-criteria-v1.md` 不存在；可核同源条目为 `docs/scheduling/2026-10-28-entry-role-minimal-change-C.md:53`（hash 见头部） | 实施前由沟通更正意图记录 §关联 引用，或实施/验收包引用可核路径；本 B1 语义以可核条目为准（不改变语义）。未完成勘误不得作为拒收理由，但须在变更包如实记录。 |
| R-6 | **串行裁决**：提案卡修复 → judge → 文档格式（方案 §10.2 / 文档格式方案 §10.3；以协调方裁决为准） | judge 实施须在提案卡修复候选冻结/B2 后、协调记录（含「文档格式方案对本变更写集的误述」勘误知会）落地后；若协调方裁决其它次序，按裁决执行并在 B1 升版时记录影响。 |
| R-7 | **AC 编号口径**：任务口径「AC-J1..AC-J17」vs 方案实际 AC-J1..AC-J12 + 测试矩阵 J1–J17 | 本 B1 以 AC-J1..AC-J12 + J1–J17 全覆盖；不虚构 AC-J13..AC-J17。如确有新增验收语义需求，须先修订方案并升版 B1。 |
| R-8 | **观察项**：既有 `by:"judge"` D3 fixture（chain-enforcement/run-pin/run-change-trigger）无 `judge` 审计/`operatorId` | 不满足 `isJudgeD3Resolution`；B2 须核实其依赖路径行为不回归（未新增拒绝/新增失败）；如实施升级 fixture，须逐条记录（AC-J7-4、§4.3-3）。 |
| R-9 | **写盘时在飞状态**：B1 写盘时 worktree 有提案卡修复 4 个 M 文件（非 judge 候选） | 不影响本 B1 冻结；但 judge 实施基线须按 BASE-1 在修复冻结后重取；B2 证据不得混入该在飞状态。 |

## 10. 范围限制与披露

1. 本 B1 只覆盖本变更（judge 委派生效与诚实审计）；不覆盖提案卡修复、文档格式方案、其它适配器/角色、贪吃蛇运行变更。
2. 本 B1 只写 `docs/acceptance/`；**未改代码/方案/测试/角色卡/边界/其它文档；未运行真实模型；不授权实施/提交/推送/合并/发布**。
3. **条件性**：judge 实施以满足 BASE-2 前提为准；若实施中发现必须新增/修改公共契约、数据模型、跨更多角色或写集外文件 ⇒ 立即停止并升级普通流程，本 B1 作废/重写。
4. **基线已知红项**：`optional-acceptance.test.ts` 4 项预存失败/超时与本变更无关、不在写集修复；`test/编排/**` 的 22 fail/2 skip 以提案卡修复 B1 v1.1 A.1 记录为参照、以 judge 实施基线重取为准；B1 只按「增量不回归」判定，不得为求绿修改写集外路径。
5. **真实运行限制**：只承诺本次候选/环境/输入下的证据；真实 Electron/真实 Claude/真实 UI 与 9223 隔离是硬约束；若出现下一真实门，如实报告，不宣称完整闭环/长期稳定性/发布。
6. **证据复用**：分层独立（BASE-6）；旧候选、其它 B1、在飞变更证据不得冒充；任何候选/环境/命令变化使证据失效并重取。
7. **当前状态**：本 B1 完成并冻结；BASE-1–BASE-7、AC-J1–AC-J12、J1–J17、RR-1–RR-7、EV1–EV6 全部 `未取证`，不得判 pass；后续由同一独立验收身份在候选/确定性测试/真实运行证据交付后作 B2；B2 不跨阶段合并、不授权发布。

---

## 附录 A（v1.1，2026-11-09）：W-J2b amendment——Runtime 包装层 judge D3 激活范围增补

- **版本与范围**：v1.1 = v1 正文原样保留 + 本附录。本附录只增补**范围、AC、写集/证据与批次串行**（协调方 2026-11-09 批准）；**不改** AC-J1–AC-J12、J1–J17、RR-1–RR-7、EV1–EV6、§7 判定规则与 §8 阶段出口。与正文冲突时，以本附录的增量口径为准；其余仍按 v1。
- **依据（写盘前实测）**：
  - 协调方裁决：团队计划 `docs/scheduling/2026-11-09_team-plan_judge-delegated-decision-effectiveness.md`，**73 行 / 9,209 bytes / SHA-256 `9b61a48460a00fb25f2587edba441d73082a93ecc0f50b7dec83c1c214a8b219`**；其中 **W-J2b amendment（`:52`）**：nominator-code；`src/common/roles/nominator/index.ts` `d3-by` 接受集加入 `"judge"`（单行）+ `test/roles/nominator/` 测试；前置 W-J2/W-J5；不改其它角色/职责。
  - W-J5 缺口证据（实施侧，引用不构成 pass）：`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（写盘时工作区新增未跟踪；**240 行 / 17,966 bytes / SHA-256 `7b0bf988560e6284f3fa069fe08684e20d5b211d036fe92a6f15670175c96a7b`**）第 5 节（`:228-236`）钉住：Runtime 包装层 `createDirectRoleRuntime.activateRoleDocuments` 在 judge D3 下因 nominator `d3-by` 事实（`src/common/roles/nominator/index.ts:481-482`，当前仅接受 `customer`/`chief-delegated`）⇒ `appointment-facts-invalid`；同链 Service 层正例已通过（文件头注释 `:1-19` 与测试正文）。
  - 代码事实（只读）：`d3By` 为 role-documents 阶段必填事实（`src/common/roles/nominator/index.ts:420-425`）；`d3-by` 类型校验在 `:481-482`；Runtime 包装层 `createDirectRoleRuntime.activateRoleDocuments` 在 `src/pipeline/orchestration/trunk-runtime.ts:769/791/815`；失败映射为既有 `activation-not-ready`。
  - 写盘时基线实测：HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（提案卡修复已提交；父 `c1439ce`）；工作区存在 judge 实施 W-J1–W-J5 的在飞改动（21 个 M 文件 + 2 个新增测试文件），**不属于本附录产物，也不是 B2 最终候选**；B2 须按 BASE-1/BASE-4 在最终候选上重取。
- **判定状态**：本附录全部条目当前 `未取证`；B2 按 **v1.1** 判定（v1 条目状态与语义不变）。

### A.1 范围增补（写集/owner/批次）

| 文件 | owner（角色） | 改动 | 批次/前置 |
| --- | --- | --- | --- |
| `src/common/roles/nominator/index.ts` | **nominator-code** | `d3-by` 接受集加入 `"judge"`（**单行**；当前 `:482` `return value === "customer" || value === "chief-delegated";`） | **W-J2b**；串行在 W-J2/W-J5 之后 |
| `test/roles/nominator/`（至少 `nominator-module.test.ts`，含既有 fixtures） | **nominator-code** | judge 正例（`d3By:"judge"`）+ 非法值仍拒（保留既有 `"model"` 等负例）；既有 `d3By:"customer"` fixture（`fixtures/nominator-fixtures.ts:215`）不变 | W-J2b |

- **不变量**：只允许上述两类路径；不改其它角色/职责/boundary；**不改变团队计划归属（客户最终裁定：团队计划仍归运营）**；不新增契约/数据模型（仅事实取值集扩展）；产品文件 diff 仅该单行（A.2-4 钉住）。
- **升级条件**：若实施需要单行之外的改动、其它角色文件或新契约 ⇒ 立即停止并升级，本附录不适用。

### A.2 新增 AC-J7b（P0，W-J2b 增补；与 AC-J7 并列）

**必须观察的结果（全部满足）：**

1. **Runtime 包装层生效**：`createDirectRoleRuntime({ projectRoot, actorRoleId: "nominator" }).activateRoleDocuments(<judge D3 的真实激活输入>)` 成功（`ok:true`/applied），**不再**返回 `appointment-facts-invalid`/`activation-not-ready`；judge D3 事实自洽（`d3By:"judge"`、judge 审计/`operatorId`/`decisionId=decision-<requestId>` 与 AC-J7 口径一致）；激活证据/快照与既有 success 路径一致。
2. **接受集**：`d3-by` 事实接受 `customer`/`chief-delegated`/`judge` 三值；其他非法值（至少 `"model"`、空串、非字符串；既有负例 `nominator-module.test.ts:430` 的 `"model"` 保留）仍以既有 `appointment-facts-invalid` 拒绝；`d3-card` 阶段与其它事实键/必填集/错误码不变。
3. **职责/归属不变**：不改变角色职责、boundary、团队计划归属（客户最终裁定：团队计划仍归运营）；不改 judge 结算路径、Q5 主权或 `request.resolved` 形状。
4. **单行证明**：`git diff -- src/common/roles/nominator/index.ts` 仅含 `d3-by` 返回行改动（无其它编辑/格式化噪声）。
5. **回归**：`test/roles/nominator/` 既有用例（`d3By:"customer"` fixture、非法值负例）原样通过；W-J5 的 Runtime 包装层缺口断言按 A.4 改写为成功正例并记录旧/新断言。

**必要原始证据**：nominator-code 的 `test/roles/nominator/` 用例日志与计数；W-J5 Runtime 包装层成功断言（旧缺口断言改写记录）；`nominator/index.ts` 单行 diff；激活回执/证据快照。**判定：未取证。**

### A.3 写集/证据与批次条件

- **批次**：W-J2b（nominator-code），串行在 W-J2/W-J5 后；实施前 W-J2/W-J5 已完成并留证。证据由 **nominator-code** 输出（模块单测 + W-J5 Runtime 包装层正例 + 单行 diff + 受影响套件 before/after 计数）。
- **候选**：judge 最终候选的写集在 v1 §2 基础上增补上述文件；BASE-4 的 changedPaths/聚合/manifest 须包含它们，且不得混入其它在飞证据。
- **跨 owner 条件（重要）**：`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` 属 `test/测试/`（**测试** owner）。其第 5 节缺口断言的改写须由**测试 owner**执行，或在协调记录中明确指派；nominator-code 不得越界修改 `test/测试/`。若无人承接该改写，AC-J7b 判 `insufficient evidence`（不得以「未改的旧缺口断言仍绿」冒充生效）。
- **B2**：按 v1.1 判定；W-J2b 证据层属 L2/L5（确定性/跨层），不替代真实运行 AC-J10/J11/J12。

### A.4 旧断言改写（补充，不得静默放宽）

1. **W-J5 缺口断言**：`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts:228-236` 现断言 Runtime 包装层 judge D3 `ok:false` + `appointment-facts-invalid`。W-J2b 后必须改写为**成功正例**（`ok:true`/applied，或等价成功断言），逐条记录旧断言原文、新断言、理由（W-J2b amendment + 客户裁定「judge 代批必须生效」覆盖 D3/激活链）与证据行；**不得删除该节或以旧断言求绿**。
2. **保留负例**：`test/roles/nominator/nominator-module.test.ts:430`（`d3By:"model"` ⇒ `appointment-facts-invalid`）与 `fixtures/nominator-fixtures.ts:215`（`d3By:"customer"`）必须原样保留并通过。
3. 其它任何改写按 v1 §4.3 逐条记录；未记录即判 fail。

### A.5 附录状态

- 本附录写盘后 B1 版本为 **v1.1**；v1 正文（含 §10-7 的「B1 完成并冻结」时点陈述）原样保留。
- 新增/增补条目（A.1–A.4、AC-J7b）当前均 `未取证`；v1 条目状态不变。
- 本附录不实施、不改其它文件、不提交/推送/合并/发布；B2 以 v1.1 路径/字节/SHA-256 为准（新 hash 由写盘回报给出）。

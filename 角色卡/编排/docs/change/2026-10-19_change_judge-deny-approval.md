# 2026-10-19 变更：治理判断新增 `deny`（approval 组写卡退回重做）

- 日期：2026-10-19
- 角色：编排
- 客户反馈原话：「这个按理说不是应该替我决策的会让他重新搞吗」
- 范围：`src/model/runtime.ts`（判断结果枚举）、`src/common/编排/governance-judge{,-verdict,-prompt}.ts`、`src/pipeline/orchestration/run-role.ts`、`test/编排/**`、本角色文档；未改 `app/**`、`test/测试/**`、运行时核心 schema（`src/provider/runtime/schema.ts` 的 `deny` 枚举由运行时核心单独落）。

## 1. 问题

真机：Crew 的 appointment-write 写卡确认被判断 agent 判为 `manual`（内容两处不合规：README 归属未定、tester boundary 混入 Markdown 散文）。应用按 manual 弹客户卡，客户只能手动拒绝。客户反馈：这类**可修正**的写卡内容问题应由判断 agent 拒绝并退回 Crew 重做，而不是让客户手批。

根因：判断结果只有 `approve | manual` 两值；approval 组的「内容不合规」只能表达为 manual，而 manual 的语义是「判断无法完成，交客户手动确认」。

## 2. 契约

`GovernanceJudgeOutcome.verdict` 扩为三值：

| verdict | 含义 | 适用 |
| --- | --- | --- |
| `approve` | 正向代批 | decision 组（决策不偏离意图）与 approval 组（写卡全部合规） |
| `deny` | 判断已完成，写卡内容/路径/完整性/一致性不合规且**可由发起角色修正**，退回重做 | **仅 approval 组**（write / appointment-write / schedule-write） |
| `manual` | 判断无法完成（证据不可读/预算/读取被拒/证据包不完整/意图缺失或歧义/冲突无法裁决） | 两组均可；decision 组收到 deny 也回落 manual |

**客户补充总原则（2026-10-19）**：「我勾选了替我决策就不用我来管了。」桌面在开关开启时会把 judge 的 **deny 与 manual 一律转成 `declined` + reason 回投发起角色重做**，不再呈现客户卡。因此：

- `deny` 与 `manual` 的 `reason` 都必须是**可操作的返工说明**（缺什么证据/哪条偏离意图/应怎么改/重发给谁）；
- 文档与提示中不得再写「已转手动确认」「等客户决定」这类把结果推给客户的表述；
- decision 组仍不得 deny（不替客户拒绝/接受），但因 intent-drift/intent-*/证据不足返回的 manual 同样作为返工原因回投 Rapporteur/Nominator/Proof。

`deny` 约束：

- 必须有非空 `reason`（逐条「哪条不合规 + 应怎么改」）；缺失 ⇒ 规范化失败（`parse-failed`/manual）。
- 不要求 `selected`/`confirmed`/`pathDecisions`；不执行 approve 的逐路径/读取/证据机械门槛。
- `reasonCode` 默认 `model-deny`；允许 `SAFE_MANUAL_REASON_CODES` 内的具体码（如 `insufficient-evidence`/`path-unverified`/`path-outside-boundary`/`intent-drift`）。
- decision 组收到 `deny` ⇒ `manual`（reason 说明「决策卡不能由判断 agent 拒绝」）——判断 agent 仍不得替客户拒绝决策卡。

## 3. 改动

### 3.1 `src/model/runtime.ts`

- `GovernanceJudgeOutcome.verdict: "approve" | "deny" | "manual"`（附三值语义注释）。

### 3.2 `src/common/编排/governance-judge-verdict.ts`

- `NormalizedGovernanceJudgeVerdict.verdict` 扩为三值。
- `normalizeGovernanceJudgeVerdict`：接受 `deny`；`approve` 与 `deny` 都必须有非空 `reason`；非法值/缺 reason ⇒ `undefined`。
- `evaluateGovernanceJudgeVerdict`：
  - `deny` 分支位于 manual 之后、approve 机械门槛之前；
  - `request.group !== "approval"` ⇒ `manual/model-manual`（不代客户拒绝）；
  - 防御性校验请求/结论的 group/cardKind 一致（不一致 ⇒ `group-mismatch`）；
  - 返回 `{ verdict:"deny", group, cardKind, reasonCode, reason, engine, model?, evidence?, durationMs?, readCalls?, readBytes? }`，无 `value`/`paths`/`pathDecisions`。
- `governanceJudgeAuditFromOutcome`/`boundedGovernanceJudgeAudit` 对 deny 保持可用（无 value/paths 即自然省略；reason/evidence/读取统计照常）。

### 3.3 `src/common/编排/governance-judge.ts`

- deny 走 `governance-judge.deny` 日志（含 reasonCode/reason/group/cardKind/evidenceCount/duration/readCalls/readBytes），**不记成 manual**。
- 证据哈希复核仅对 `approve`（deny/manual 不需要）。

### 3.4 `src/common/编排/governance-judge-prompt.ts`

- 输出契约改为 `"verdict":"approve|deny|manual"`。
- 新增「三种结论」段：approval 组可 deny 退回重做；decision 组不得 deny；桌面开关开启时 deny/manual 都转 declined+reason 回投发起角色。
- approval rubric 明确 deny 触发条件：内容不合规（归属未定/职责或边界写错/混入无关散文/与提案或已接受决定冲突）、路径不合规、完整性不合规、一致性不合规；reason 必须写清「哪条不合规 + 应怎么改」。
- decision 组 rubric 明确 manual 的 reason 必须是可操作返工说明（哪条偏离意图/应缩小或补充什么/重发给谁），例如「提案范围超出意图 §范围，请缩小到 … 后重发」。
- `manual` 只保留给「判断无法完成」；approval 的 manual 只用于证据不可读/预算/读取被拒，并要写清请发起角色补什么证据或怎么改。
- 删除「本 agent 从不替客户拒绝」的全局表述（decision 组仍保留不替客户拒绝）。
- `pathDecisions` 仅在 approve 时要求。

### 3.5 `src/pipeline/orchestration/run-role.ts`

- 判断 agent 的 approval deny 由桌面以 `declined`（`operatorId="judge:<engine>"`）回投角色；该结果**不是客户决定**，`recordCustomerDecision` 跳过写 `customer.decision`，避免 `unclassified/none` 污染账本并挡住收尾门。
- 同步把治理判断的 manual 文案从「已转手动确认」改为中性可操作的「请修正/补齐/缩小…后重新提交」；读取被拒文案保留逐路径摘要，但把后缀换成「请补齐判断所需证据（或缩小读取范围）后重新提交」。shell judge 文案未改（仍走客户审批卡）。

## 4. 测试与验证（真实输出）

- `node --test "test/编排/governance-judge.test.ts"` → **60 tests / 60 pass / 0 fail / 0 skipped**（新增 4 例：deny 规范化/approval 合法/decision 回落 manual/审计字段；prompt 三值/approval deny 文案/可操作 manual；decision manual 原因原样保留 + approval manual 可操作修正；driver `governance-judge.deny` 日志且不记 manual）。
- `node --test "test/编排/governance-session.test.ts"` → **26 tests / 26 pass / 0 fail / 0 skipped**（新增 1 例：judge deny 以 declined 回投时不写 `customer.decision`）。
- `node --test "test/编排/**/*.test.ts"` → **675 tests / 675 pass / 0 fail / 0 skipped**。
- `npm run typecheck` → **exit 0**（全仓；收笔时桌面在途错误已由其属主收口）。

## 5. 跨角色

1. **运行时核心**：`report_governance_judgement` 的 JSON schema 需允许 `"deny"`（已由协调者单独排给运行时核心；本批未改 `src/provider/runtime/schema.ts`）。
2. **桌面窗口**：客户补充总原则（「我勾选了替我决策就不用我来管了」）下，开关开启时 **deny 与 manual 都转 `declined` + 原因回投发起角色**（不呈现客户卡）；桌面并发实现已观察到 `app/desktop/customer-input.ts` 的 deny 分支，manual 分支需同批按该原则处理。本批未改 `app/**`；请桌面确认 **deny 与 manual 两条 declined 路径的 `operatorId` 都保持 `judge:<engine>` 约定**（编排据此跳过客户决定账本，避免 manual 也污染账本）。
3. **测试角色**：本批未改 `test/测试/**`；其旧的双值断言若在别处钉死，需随本批更新（`test/编排` 已全绿）。

## 6. 残余风险

- 证据包 builder 在调用模型前的确定性失败（物证缺失/不可读、declaredContent 不完整等）仍直接 manual，不会进入模型 deny；这些属于「无法完成判断」而非「内容可修正」，与本次语义一致，但客户仍会看到手动卡。
- `deny` 的 reasonCode 白名单沿用 `SAFE_MANUAL_REASON_CODES`；模型自报未知码一律落 `model-deny`，不透传任意字符串。
- 判断 agent 仍可能把可修正问题误判为 manual；提示词已明确「不建议/内容不合规用 deny」，但这是引导而非硬约束（硬约束是证据包与 driver 的 fail-closed）。
- decision 组 manual 的 reason 由模型生成；prompt 已要求可操作返工说明，但无法机械保证每条都足够具体；driver 的机械 manual 文案已改为具体修正指引。
- deny/manual 不写客户决定账本；若桌面未来改变 `operatorId` 约定，需同步调整 `recordCustomerDecision` 的跳过条件。

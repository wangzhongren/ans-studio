# 变更记录：验收返工路由 — 运行时 declined 措辞（S4）

- **任务 ID**：`2026-10-23-acceptance-rework-routing`（产品 flowId：`acceptance-rework-routing`；节点 **S4 运行时措辞**）
- **执行者/角色**：运行时核心（独立子代理上下文）
- **日期**：2026-10-23
- **状态**：`implemented-unverified`（措辞与定向测试完成；**未验收**、未提交、未推送、未合并、未发布）
- **依据**：客户已确认的团队计划 `docs/scheduling/2026-10-23-acceptance-rework-routing-team-plan.md` §3.4 / §4.1 S4 / §5.2；策划方案 v1 `docs/planning/2026-10-23_design_acceptance-rework-routing.md` §3.2、§5.3.3、§7.1、Q7 A；验收标准 `docs/acceptance/acceptance-rework-routing-criteria-v1.md` P3.4。
- **授权写集（实际只动这些）**：
  - `src/provider/runtime/tools.ts`
  - `test/runtime-core/tools.test.ts`
  - `角色卡/运行时核心/docs/change/2026-10-23_change_acceptance-rework-routing.md`（本文件）
  - `角色卡/运行时核心/docs/change/2026-10-23_change_acceptance-rework-routing-evidence/`（证据）
- **未写**：`src/model/**`、`src/service/**`、`src/common/**`、`src/pipeline/**`、`app/**`、其他角色测试/文档、`docs/**`、角色卡/边界/YAML、`ans-gateway` 或任何目标项目文件；未新增工具/schema/字段/枚举/依赖。

## 1. 写前基线（2026-10-23）

- HEAD：`ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1`（`main`）。
- 目标两文件写前对 HEAD 无改动（`git status --porcelain` 为空；团队计划 §1.4 所述一致）。
- 工作树存在其他并行变更（i18n/目录 v3/治理写卡推进等，未提交）；本角色未触碰，也不为其背书。

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/provider/runtime/tools.ts` | `2023e9f08be24c577f8c1adc91fc8f5d8792271b` | `c2e09c875b2fc633d4b1991379c1ccfdc12e32547e63ad344b96f5178463560c` |
| `test/runtime-core/tools.test.ts` | `a1d10ddfd29932d57732c3d86a55d88f0ec80b36` | `a99c52cea45661a63910182d4df0502691d29eef08a627e431fbf964afcd1ef6` |

原始记录：`...-evidence/baseline-hashes.txt`、`environment.txt`。

## 2. 改动摘要

### 2.1 `src/provider/runtime/tools.ts`

只改 `declined` 回执的**措辞分流**，不改变挂起/结算/账本/写权语义。

1. 新增私有谓词 `isJudgeOperator(operatorId)`：仅当 `operatorId` 以 `judge:` 开头（与桌面 `customer-input.ts` 结算的 `judge:<engine>` 同源）视为判断 agent 来源。
2. 新增私有回执 `judgeDeclined(name, reason, acceptanceRework)`，按来源与卡种分两档：
   - **验收返工专用**（仅 `request_choice` + `cardKind === "acceptance"`）：`自动决策未通过/未完成（原因：…）；这不是客户拒绝；应用会把本次退回交 Steward/统筹（Convener）组织返工；请等待返工后重新提交验收。`
   - **通用**（`request_confirmation` 的所有 judge 退回；`request_choice` 的非 acceptance/未给 cardKind）：`自动决策未通过/未完成（原因：…）；这不是客户拒绝；应用会按治理规则处理本次退回。` —— 不出现 Convener 返工/重新提交验收字样。
   - 两档均不写「未获客户同意」；不把 judge 退回写成客户拒绝。
3. `request_confirmation` declined 分支：
   - `notPresented === true` → 仍走既有 `cardNotPresented`（不变，优先于 judge 分流）；
   - `judge:*` → `judgeDeclined(..., false)`（通用，含 `cardKind:"write"` 等写卡）；
   - 其他（客户/通道/无 operatorId）→ 既有 `notConsented(name, "客户拒绝…")`，逐字不变。
4. `request_choice` declined 分支：
   - `judge:*` 且 `cardKind === "acceptance"` → `judgeDeclined(..., true)`（验收返工专用）；
   - `judge:*` 其他卡种或未给 `cardKind` → `judgeDeclined(..., false)`（通用）；
   - 其他（客户/通道/无 operatorId）→ 既有 `notConsented(name, "客户拒绝…")`，逐字不变；
   - 该工具既有 `notPresented` 不改变措辞的行为保持不变（O1 未授权；测试以无 operatorId 的 `notPresented` 逐字钉住旧文案）。
5. **未改**：`notConsented`、`cardNotPresented`、`judgeReceipt`（代批）、`abortedToolResult`、`unavailable` 分支、工具 schema/参数/执行模式/权限、任何账本或 `.ans` 写入。

### 2.2 `test/runtime-core/tools.test.ts`

新增 2 个测试（既有 11 例全部保留、未改弱；总数 11 → 13）：

- **judge vs 客户/通道 declined 正负例**（按 `operatorId` 与 `cardKind` 分流）：
  - judge 公共断言（两个工具）：`ok:false`；含「自动决策未通过/未完成」、具体原因、「这不是客户拒绝」；不含「未获客户同意」；「客户拒绝」只允许出现在被否定的「这不是客户拒绝」中（测试先剔除该短语再断言无「客户拒绝」）。
  - `request_confirmation` judge（无 cardKind 与 `cardKind:"write"` 各一例）：通用文案「应用会按治理规则处理本次退回」，且不含 `Convener|组织返工|重新提交验收`。
  - `request_choice` + judge + `cardKind:"acceptance"`：验收返工专用文案（交 `Steward/统筹（Convener）组织返工`、`请等待返工后重新提交验收`）。
  - `request_choice` + judge + `proposal`/`appointment`/`intent-confirm`/未给 cardKind：均为通用文案，不含 Convener/返工/验收字样。
  - 客户（`operatorId:"customer-1"`）：两条工具回执**逐字等于**既有文案（`未获客户同意（原因：客户拒绝（…））→ 不要写盘；如实告知客户，不得假设同意。`）。
  - 无 `operatorId`（旧通道/未知来源）：仍按既有客户/通道语义，不得误判为 judge。
- **边界不变**：
  - `request_confirmation` + `notPresented:true`（即使 `operatorId:"judge:claude"`）仍为「治理确认卡未发出」，且不含「客户拒绝/自动决策未通过/未获客户同意」；
  - `request_choice` + `notPresented:true`（无 operatorId）文案逐字不变；
  - `unavailable` 仍为「未获客户同意（原因：…）」；
  - judge 代批 `answered` 的 `judgeReceipt` 仍为「客户委托的判断 agent（替我审批）已代批（代审批；operator:judge:claude）」「这不是客户本人点击」，不含自动退回措辞。

## 3. 检查命令与原始结果（写后）

| # | 命令 | 退出码 | 结果 | 原始日志 |
| --- | --- | --- | --- | --- |
| 1 | `node --test test/runtime-core/tools.test.ts` | **0** | tests 13 / pass 13 / fail 0 / cancelled 0 / skipped 0 / todo 0（958.1872 ms） | `...-evidence/node-test-tools.log` |
| 2 | `npm run typecheck`（`tsc --noEmit`） | **0** | 0 诊断 | `...-evidence/npm-typecheck.log` |
| 3 | `node --test test/pi-adapter/customer-input.test.ts test/runtime-core/governance-flow-metadata.test.ts test/runtime-core/abort-failure-semantics.test.ts test/runtime-core/governance-judge.test.ts`（相邻措辞回归） | **0** | tests 52 / pass 52 / fail 0 | `...-evidence/node-test-adjacent-runtime-core.log` |
| 4 | `node --test --test-concurrency=1 test/测试/governance-e2e-auto/a-proposal-write-auto.test.ts test/测试/governance-e2e-auto/f-acceptance-gate.test.ts test/测试/governance-judge-cards-verify/d-audit-ledger.test.ts`（judge 回执 e2e 回归） | **0** | tests 13 / pass 13 / fail 0 | `...-evidence/node-test-adjacent-e2e.log` |

- 第 1 条为任务规定的定向测试；第 3/4 条为本角色额外自查，验证既有 judge declined 回执断言（`f-acceptance-gate` 的「自动决策未通过/重新提交」、`a-proposal-write-auto` 的「自动审批未通过/拒绝 + 重新提交」、`d-audit-ledger` 的「自动决策未通过/重新提交」）仍通过，且客户 declined 逐字文案测试未受影响。上述四条均在**协调者边界修正后**重跑，计数不变。
- `npm run typecheck` 需先将 Node 目录加入 PATH（否则 `npm.cmd` 内部 `node` 不可用）；最终成功运行已记录。
- 未跑 T3 全量、真实 Electron、目标项目只读复算（属测试角色 S7）；本角色不声称端到端通过。

## 4. 写后候选哈希（工作区）

| 文件 | `git hash-object` | `sha256sum` |
| --- | --- | --- |
| `src/provider/runtime/tools.ts`（产品候选） | `2a7983459249aff27b1ba43193d07d8cf7c72658` | `b3bc52c45042c7493b8ed9e122654513481f67f7877e4d551a6e0479e88153a1` |
| `test/runtime-core/tools.test.ts`（产品候选） | `467ef81cb045a805803edeb356cc0c589cb97a1b` | `c7db7e1f5db919b2f9a61c8c15f97ab9b5c8afd54e82c3d8f960cbc005f5ad94` |

- 上述为**协调者边界修正后**的候选；首版（已取代）为 `tools.ts 3d4b033d…/1f61c54e…`、`tools.test.ts a0833a97…/08d5ecd5…`，不得作为当前候选。

- 候选 diff：`...-evidence/candidate.diff`（仅上述两文件）。
- `git status --porcelain`（本角色写集）：仅 `M src/provider/runtime/tools.ts`、`M test/runtime-core/tools.test.ts`；本文件与证据目录未跟踪（docs 记录，不计产品候选）。

## 5. 边界与未做核对

- 未新增角色工具、未改 `AdapterCapabilities`、未改 schema/参数/返回形状/枚举/依赖/测试 runner。
- 未伪造 `customer.decision`、未自动 accept/reject、未改三态或账本写入。
- 未改 `src/model/**`、`src/service/**`、`src/common/**`、`src/pipeline/**`、`app/**`、其他角色测试/角色卡/边界、`docs/**`、目标项目。
- 未 commit/push/merge/release；未写 `ans-gateway`。

## 6. 残余风险 / 解释口径（供独立验收核对）

1. **「客户拒绝」子串与必填否定句的张力**：方案/标准要求 judge 文案包含「这不是客户拒绝」，同时 P3.4 测试项写「judge declined 不含『客户拒绝』」。本实现按 P3.4 的逐字文案执行；测试先剔除「这不是客户拒绝」再断言无「客户拒绝」，即只禁止**正向归因**，不禁止被否定的短语。若验收采用纯子串匹配，会与 P3.4 自身要求的文案冲突，请按标准逐字条款判定。
2. **非验收卡不承诺返工（协调者边界修正）**：只有 `request_choice` + `cardKind:"acceptance"` 写 Convener 返工/重新提交验收；`request_confirmation`（含 `write`/`appointment-write`/`schedule-write`）与 `request_choice` 的 `proposal`/`appointment`/`intent-confirm`/未给 `cardKind` 均为通用文案「应用会按治理规则处理本次退回」。边界：`reason` 由桌面原样转入，若原因文本自身含「返工/验收」字样（模型或原因内容），本层不裁剪/不改写；固定文案不含这些字眼。
3. **原因文本重复**：桌面 `judgeReworkReasonText` 传入的 reason 已形如「自动审批拒绝：…。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。」，嵌入「（原因：…）」后会出现「自动决策未通过/未完成（原因：自动审批拒绝：…）」的冗余；本层原样保留原因，不裁剪/不改写（保真优先）。
4. **`request_choice` + `notPresented` + `judge:*` 组合**：现有生产路径不会同时产生这两个字段；若未来出现，judge 分流优先于旧「客户拒绝」文案。无 `operatorId` 的 `notPresented` 旧行为已逐字锁定。
5. **端到端未验证**：本层只改回执措辞；客户/judge 路由、系统行、重派门在 S3/S6 桌面窗口与 S7 e2e，本角色未验证也不声称。
6. **并行工作树**：类型检查在当前未提交工作树上通过；若其他角色后续改动导致失败，属跨角色 transient，需在合流后按其写集复跑。

## 7. 结论

运行时核心 S4 完成：`request_confirmation`/`request_choice` 的 `declined` 回执按 `outcome.operatorId` 区分 `judge:*` 与客户/通道；judge 不再被错误归因为「客户拒绝」。按协调者边界修正，只有 `request_choice` + `cardKind:"acceptance"` 使用 Convener 返工/重新提交验收专用文案；`request_confirmation`（含 write 等）与 `request_choice` 的非 acceptance/未给 cardKind 使用通用文案。客户/通道文案与 `notPresented`/`notConsented`/`cardNotPresented`/`judgeReceipt` 行为保持不变；未新增工具/schema/字段。定向测试 13/13、typecheck 0 诊断、相邻回归 52/52 与 13/13 通过。状态 `implemented-unverified`，等待统筹/独立验收按当前候选判定；本角色不声称已验收、已提交或已发布。

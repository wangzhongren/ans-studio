# 判断 agent 验收机械门槛：流程步骤 id/状态解析与桌面侧对齐（真机 R2 修复）

- 日期：2026-10-19
- 角色：编排
- 来源：桌面窗口角色已修 `app/desktop/governance-advance.ts`（`normalizeFlowStepStatus` + 显式 `stepId` 列优先）；编排侧 `src/common/编排/governance-judge-facts.ts` 的 `parseFlowSteps` / `evaluateAcceptanceCompletion` 仍是旧口径，同源缺陷。现场证据：`/Users/wangzhongren/code/vibeingcode/ans-testbed/ticket-desk-live/docs/flows/ticket-desk-r2.md`（v8 收口快照）。

## 1. 问题

判断 agent 的验收机械门槛（P6 安全项）读流程单步骤表时不采信模型自报，但在真机 R2 流程单上会系统性误判：

1. **取错 id 列**：R2 流程单是 canonical 三列 `| stepId | 步骤 | 状态 |`。旧实现取「步骤/step」描述列当步骤 id，于是 `id` 解析为「提名：Crew / 组队 读取提案并给出候选角色」这类描述文本；`facts.dispatchedStepIds`（来自账本 `dispatch.accepted.stepId`，值为 `nomination` 等）永远匹配不上，验收机械门槛恒定报「流程步骤缺少 dispatch.accepted 记录」。
2. **状态精确比较**：R2 状态列全部是「引导状态词 + 说明」写法（`done（有落盘/回交证据；…）`、`done（…）`）。旧实现 `status.toLowerCase() !== "done"` 把已完成的步骤全部判为未完成，验收机械门槛恒定报「流程仍有未完成/阻塞/待派发步骤」。

两类误判都只会把本可代批的验收卡挡回手动确认（fail-closed，安全方向不错），但让判断 agent 的验收代批在 canonical 流程单上形同虚设。

## 2. 真机证据（逐字）

`docs/flows/ticket-desk-r2.md` 步骤表（v8）：

```
| stepId | 步骤 | 状态 |
| --- | --- | --- |
| nomination | 提名：Crew / 组队 读取提案并给出候选角色 | done（`docs/nominations/ticket-desk-r2-v1.md`；推荐集 = 既有三角色，不新增角色） |
| role-readiness | 角色就绪：客户任命决定 + 角色卡就绪确认 | done（客户经任命卡确认沿用 backend / frontend / test；本轮不新增角色、不改卡） |
...
| verification | 独立复核：按提案 §11 八条逐条出结论（内置 Proof / verifier） | done（报告 `docs/verification/ticket-desk-r2-v1.md`；§11 八条均有证据，建议 accept） |
| acceptance | 客户验收 | done（客户在验收卡选择 **accept**；决定登记于 `docs/governance/verifier/ticket-desk-r2.md`） |
```

真实账本 `.ans/governance/ledger.jsonl` 的 `dispatch.accepted.stepId` 取值为 `nomination` / `delivery-backend` / `delivery-frontend` / `delivery-test` / `cleanup-selfcheck` / `r2-e2e` 等 slug，证实匹配必须以 `stepId` 列（而非描述文本）为准。

## 3. 修复（限编排边界）

### 3.1 代码

- `src/common/编排/governance-judge-facts.ts`
  - 新增导出纯函数 `normalizeFlowStepStatus(status)`（`src/common/编排/governance-judge-facts.ts:289`）：取单元格**引导 token**，大小写不敏感；后接空白、`（`、`(`、`：`、`:` 或结束即截断；说明文字不参与比较；空/纯空白 ⇒ `""`。**不修改** `parseFlowSteps` 输出的原始 `status`（错误详情仍展示原文）。
  - `parseFlowSteps`（`:318`）：表头同时含「步骤/step」与「状态/status」时，若还存在显式 id 列（`stepId`/`step-id`/`步骤id`/`id`，`:333-334`）则**优先**取 id 列；没有时才沿用「步骤/step」列。返回形状 `{ wellFormed, steps: { id, status }[] }` 不变，调用方兼容。
  - `evaluateAcceptanceCompletion`（`:375`）：未完成判定改为 `normalizeFlowStepStatus(step.status) !== "done"`；`dispatch.accepted` 对账随 `parseFlowSteps` 的 id 列修复自动恢复正确。
- 规则与桌面窗口角色 `app/desktop/governance-advance.ts#normalizeFlowStepStatus` / `parseFlowStepStatuses` **逐字同规则**（含显式 id 列正则集合）。

### 3.2 未做（避免越界/扩大范围）

- **未改验收门槛语义**：仍要求**所有**步骤 `done`、**每个**步骤都有 `dispatch.accepted`、无未结算治理决定/未闭环澄清、账本可读；任一不满足仍 `manual`（fail-closed）。
- **未共享实现**：桌面不得依赖编排私有 `src/common/编排/`，编排也不得写 `src/common/shared/`（角色边界）。两侧各自实现纯函数，并在注释中互相指向、注明「改动须成对同步」。

## 4. 影响面

- 判断 agent 验收卡（`cardKind=acceptance`）的机械预检：canonical `stepId|步骤|状态` 流程单不再因 id/状态口径被误挡；旧两列「步骤|状态」流程单行为不变。
- 覆盖式状态写法 `done（…）`/`done(…)`/`Done`/`done：xxx` 视为完成；`pending`/`delivered`/`in-progress`/`blocked`/空仍不视为完成（不放宽）。
- 非验收卡路径不受影响（`parseFlowSteps` 仅被 `evaluateAcceptanceCompletion` 调用）。

## 5. 测试与验证（真实输出）

- `test/编排/governance-judge.test.ts` 新增 4 个用例（`:640-730`）：
  - `normalizeFlowStepStatus` 正反例（done 五种变体 / pending、delivered、in-progress、blocked、空）；
  - 真实 R2 步骤表（v8 快照）解析出 `nomination`/`role-readiness`/…/`acceptance` 十个 stepId（非描述文本），`status` 保留原文；
  - 旧两列表回退「步骤」列 + `步骤id`/`id`/`step-id` 显式 id 列优先；
  - `evaluateAcceptanceCompletion`：R2 同形流程（全部 `done（…）`）+ 全量 `dispatchedStepIds` ⇒ `{ ok: true }`；把 `delivery-backend` 改成 `pending（等待回交）` ⇒ `insufficient-evidence`，reason 精确含 `delivery-backend=pending（等待回交）`。
- 定向：`node --test "test/编排/governance-judge.test.ts"` → **50 tests / 50 pass / 0 fail**。
- 全量：`node --test "test/编排/**/*.test.ts"` → **571 tests / 571 pass / 0 fail / 0 skipped**（上一批为 567，+4 即本次新增；既有断言零放宽）。
- `npm run typecheck` → **exit 0**（仅 npm 对 `ELECTRON_MIRROR` 配置的既有 warning，与本次无关）。

## 6. 跨角色说明

- 桌面窗口角色的 `normalizeFlowStepStatus` 与 `parseFlowStepStatuses` 已先行修复（`test/桌面应用/operator-wiring.test.ts` 有同形用例）。本次把**判断 agent 机械门槛**对齐到同一规则；两侧无代码依赖，只有规则契约，注释互指。
- 若后续流程单模板新增 id 列别名（如 `step_id`）或状态同义词（如 `completed`/`已完成`），须**两侧同批**扩展；单侧扩展会造成桌面放行、编排误挡（或反之）。

## 7. 残余风险

- **实现双份、存在漂移风险**：分层边界导致不能复用同一函数；已用注释互指与同形测试降低风险，但长期仍应视为「成对契约」维护。
- **真实 R2 账本复算仍会被 dispatch 门槛拦下**：真实账本中 `role-readiness` / `contract-freeze-v2` 由任命/写盘决定完成、`verification` / `acceptance` 不由应用派发，均无 `dispatch.accepted`；判断 agent 的验收门槛要求**每个**步骤都有派发记录，因此真实 R2 即便状态全 `done（…）` 仍会 `manual/insufficient-evidence`。本次未改该语义（桌面 `flowCompletionIssue` 将验收步骤单列，两侧门槛本就不同）；若产品希望判断 agent 能对真实 R2 代批验收，需单独立项定义「非派发步骤」白名单/排除规则。
- **状态规范化只认引导 token `done`**：`completed`/`已完成`/`done。`（句号结尾，不在分隔符集合内）仍判未完成（fail-closed，方向安全）。
- **显式 id 列别名有限**：只认 `stepId`/`step-id`/`步骤id`/`id`；其他别名会回退描述列（旧行为，可能重演 id 不匹配），见 §6。

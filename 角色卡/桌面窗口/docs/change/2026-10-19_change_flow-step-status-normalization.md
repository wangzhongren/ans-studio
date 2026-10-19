# 变更记录：流程单步骤状态按「首词」判定（2026-10-19）

## 1. 缺陷

`app/desktop/governance-advance.ts::flowCompletionIssue`（收尾推进触发门）用

```ts
step.status.toLowerCase() !== "done"
```

精确比较流程单「状态」单元格。流程单由 Steward / 统筹按模板自然写出，状态列实际是
**「状态 + 说明」**写法：

- `done（有落盘/回交证据；125/125 + 自检 73 项为角色自报…）`
- `done（frozen-v2 / supersedes v1）`
- `pending（不由统筹派发）`
- `pending（不由统筹批）`

结果：所有写了解释的 `done` 步骤都被判为「未完成」，触发门永远返回
「流程仍有未完成/阻塞/待派发步骤（…）」，Proof / verifier 永远不会被自动拉起
（R1 靠人工绕过，R2 同样卡住）。

同一函数里验收步骤的 `acceptanceStep.status.toLowerCase() === "done"` 有同样问题
（`done（客户已验收）` 不会被识别为已完成、会重复派发）。

## 2. 真机证据

现场（2026-10-19 10:54 快照）：

- 流程单：`/Users/wangzhongren/code/vibeingcode/ans-testbed/ticket-desk-live/docs/flows/ticket-desk-r2.md`
- 账本：同目录 `.ans/governance/ledger.jsonl`
- 条件：8 个执行步骤全部 `done（…）`；`verification` / `acceptance` 为 `pending（…）`。

修复前直接调用：

```text
flowCompletionIssue("ticket-desk-r2", markdown, { errors: [], entries })
→ "流程仍有未完成/阻塞/待派发步骤（提名…=done（…）、…、客户验收=pending（不由统筹批））"
```

修复后同一调用（**真实账本**）：

```text
→ "流程步骤缺少 dispatch.accepted 记录（role-readiness、contract-freeze-v2）"
```

状态误判已消除；但真实账本对这两个**由客户任命/写盘决定完成、未经应用派发**的治理步骤
没有 `dispatch.accepted` 记录（见 §6 残余风险 1）。

修复后在「真实 R2 流程单文本 + 按相同形态补齐全部执行步骤 dispatch 记录的账本」上复算
（即单测夹具）：

```text
→ undefined（可派验收）
```

把 `delivery-backend` 改为 `pending（等待回交）`：

```text
→ "流程仍有未完成/阻塞/待派发步骤（delivery-backend=pending（等待回交））"
```

**现场推进**：真机流程单与账本在本变更实施期间（10:59）已由现场流程推进为
`verification`/`acceptance` 均 `done`、账本新增 `acceptance` 决定。当前实盘复算因
`role-readiness`/`contract-freeze-v2` 无 dispatch 记录仍返回上述缺失记录原因
（该检查先于「验收步骤已完成」）；这不影响本修复对缺陷现场的判定。

## 3. 修复

`app/desktop/governance-advance.ts`：

1. 新增导出纯函数 `normalizeFlowStepStatus(status)`：取状态单元格的**引导 token**
   （大小写不敏感；后接空白、`（`、`(`、`：`、`:` 或结束），空/纯空白 ⇒ `""`。
   - `done` / `done（证据）` / `done(evidence)` / `Done` / `done：xxx` ⇒ `done`
   - `pending（…）` / `delivered（…）` / `in-progress（…）` / 空 ⇒ 非 `done`
2. `flowCompletionIssue` 的两处状态判定统一改用该函数（执行步骤 `notDone` 过滤、
   验收步骤「已完成」判断）；错误详情仍显示**原始**状态文本。
3. `parseFlowStepStatuses` 的**输出形状不变**（`{ wellFormed, steps: { id, status }[] }`，
   `status` 仍为单元格原文）；仅列选择修正：表头含显式 id 列
   （`stepId` / `step-id` / `步骤id` / `id`）时优先作为步骤 id，否则沿用「步骤/step」列。
   这一条是必要的：canonical 三列表 `| stepId | 步骤 | 状态 |` 原先取「步骤」描述列当 id
   （与 `governance-gate.parseFlowStepIds` 以首列为步骤 id 的既有约定不一致），
   `dispatch.accepted` 的 `stepId` 永远匹配不上。

## 4. 影响面

- 仅影响桌面「收尾推进」触发门（`interface.ts::dispatchAcceptanceAfterHandback` 的诊断与
  是否派 Proof / verifier）；**不是验收判定**——验收卡仍由决策开关/判断 agent/客户手批。
- 不写账本、不自动批准、不改变派发目标与消息文案。
- `parseFlowStepStatuses` 的唯一调用方是 `flowCompletionIssue` 与单测（已 grep 确认）；
  两列旧式流程单（`| 步骤 | 状态 |`）行为不变。

## 5. 测试

`test/桌面应用/operator-wiring.test.ts`（既有 ⑥ 收尾推进段）：

- `流程步骤状态首词规范化：done 变体视为完成；pending/delivered/空不视为完成`
- `收尾触发门：状态按首词判定（done（…）/Done/done：xxx 均可派；pending/delivered/空不放行）`
  （含验收步骤 `done（客户已在验收卡选择 accept）` ⇒ 不重复派）
- `真实 R2 流程单（状态带说明）+ 同形账本：可派验收；改一个执行步骤为 pending（…）则不放行`
  （流程表逐行取自 10:54 真机原文；canonical 三列取 `stepId` 作 id，`status` 保留原文）

真实输出：

- `node --test test/桌面应用/operator-wiring.test.ts` ⇒ **41 计 / 41 过 / 0 红**
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **589 计 / 588 过 / 1 红**
  （唯一红为既有 `runtime-ui.test.ts:65`/断言 at `:69`：renderer.js 含 `localStorage`，
  属桌面UI/渲染域，本变更未触碰；任务说明中的已知基线红）
- `npm run typecheck` ⇒ **exit 0（0 错）**

## 6. 残余风险

1. **治理步骤的 dispatch 证据缺口（真机，未在本变更处理）**：真实 R2 账本没有
   `role-readiness` / `contract-freeze-v2` 的 `dispatch.accepted`（R1 同样缺
   `role-cards` / `contract-freeze`）。触发门要求「每个执行步骤都有 dispatch.accepted」，
   因此即使状态修复，真实 R2 仍会被该门拦下。这是「治理步骤由客户决定/写入完成、
   不走应用派发」与既有门禁语义之间的产品级缺口，需另行裁定（放宽条件必须给出可机械
   核对的证据来源，不能按步骤名硬编码）。单测夹具为聚焦状态判定，按同形补齐了这两条
   dispatch 记录并在用例注释中如实标注。
2. **编排侧同口径未改（他角色文件）**：`src/common/编排/governance-judge-facts.ts`
   的 `parseFlowSteps` 仍取「步骤」描述列作 id，`evaluateAcceptanceCompletion` 仍做
   `step.status.toLowerCase() !== "done"` 精确比较。即：判断 agent 的「验收机械门槛」
   面对同样的流程单仍会误判。该文件不属桌面窗口写区，需由属主角色另行修复。
3. `parseFlowStepStatuses` 与编排 `parseFlowSteps` 在 id 列选择上自此不一致（桌面优先
   `stepId` 列，编排仍取「步骤」列）；已在函数注释中写明，后续如统一口径应交项目管理协调。
4. 现场流程单/账本在实施期间已被推进；本记录以 10:54 缺陷现场快照为证据基线。

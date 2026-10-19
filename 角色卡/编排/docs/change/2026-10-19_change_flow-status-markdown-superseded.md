# 流程步骤状态：Markdown 强调符归一化 + superseded/cancelled 作废语义（真机 R2 修复）

- 日期：2026-10-19
- 角色：编排
- 来源：真机 R2 流程单 `/Users/wangzhongren/code/vibeingcode/ans-testbed/library-lending-live/docs/flows/library-lending-v2.md`（2026-10-19 快照）。判断侧与桌面窗口角色 `app/desktop/governance-advance.ts#normalizeFlowStepStatus` 同源缺陷；本批按边界只修编排侧（`src/common/编排/**`、`test/编排/**`、本角色文档）。

## 1. 问题

判断 agent 的验收机械门槛 `evaluateAcceptanceCompletion`（`src/common/编排/governance-judge-facts.ts`）在真实 R2 流程单上系统性误判：

1. **Markdown 强调符未剥离**：状态列写作 `**done**（证据…）`。`parseFlowSteps` 的单元格清洗（`stripTableMarkup`）只剥单元格首尾的强调符，行首 `**` 被剥后留下 `done**（证据…）`；`normalizeFlowStepStatus` 取首词得 `done**`，`!== "done"` ⇒ **七个已 done 的步骤全部判为未完成**。直接以原始单元格（`**done**（…）`）调用时则得 `**done**`，同样不等于 `done`。
2. **superseded 步骤被当作执行步骤**：流程单把被并入其他步骤的「不派」步骤保留在表里，状态写 `**superseded**：并入 integration-e2e-v2，…`。归一化得 `superseded**`（或原始调用时的 `**superseded**`），既非 `done` 进入未完成列表，又因从未派发而进入 `dispatch.accepted` 缺失列表——即使其他步骤全部完成，验收门槛仍恒定 `manual/insufficient-evidence`。

两类误判方向都是 fail-closed（挡回手动确认），安全上不放行错误验收，但让验收代批在真实流程单上形同虚设。

## 2. 真机证据（逐字，只读拷贝）

`docs/flows/library-lending-v2.md` 步骤表（四列 `| stepId | 步骤 | 执行方 | 状态 |`）：

```
| nomination | 提名：Crew 读提案给出候选角色 → 客户任命 | Crew / 组队（应用派发）＋ 客户 | **done**（客户已任命 backend / frontend / test） |
| contract-freeze-v2 | 契约冻结 ... | Draft / 提案（治理角色） | **done**（...） |
| delivery-server-v2 | ... | backend | **done**（...） |
| delivery-frontend-v2 | ... | frontend | **done**（...） |
| delivery-tests-v2 | ... | test | **done**（...） |
| docs-note-error-code-count | ... | backend | **done**（...） |
| delivery-frontend-v2-evidence | （不派）前端落盘证据补充 | frontend | **superseded**：并入 `integration-e2e-v2`，由 test 在 `test/tools/` 产落盘脚本 + 持久截图 |
| integration-e2e-v2 | ... | test | **done**（...） |
| verification | 验收前验证（M6）：Proof 复核 + 亲自真实启动演示 | Proof / `verifier`（治理角色） | pending |
| acceptance | 验收卡：Proof 发起，客户决定 | Proof ＋ 客户 | pending |
```

修复前的直接后果：`normalizeFlowStepStatus("**done**（客户已任命…）") === "**done**"`；经 `parseFlowSteps` 后为 `"done**"`；`**superseded**：…` 归一化为 `"superseded**"`。失败详情会把 7 个 done 行与 superseded 行全部点名。

## 3. 修复（限编排边界）

### 3.1 `src/common/编排/governance-judge-facts.ts`

- `normalizeFlowStepStatus`：先 `trim()`，再剥掉首部 `*`/`_`/反引号/空白；取引导 token（遇到空白、`（`、`(`、`：`、`:` 或结束截断）；再剥掉 token 尾部 `*`/`_`/反引号，最后小写。
  - `**done**（…）`、`__done__`、`` `done` ``、`**Done**：xxx`、`**_done_**` 均 ⇒ `done`；
  - `**pending**（…）` ⇒ `pending`、`` `dispatched` `` ⇒ `dispatched`、`**superseded**：…` ⇒ `superseded`；
  - 空/纯空白/纯强调符（`**`、`___`）⇒ `""`（fail-closed）。
  - `parseFlowSteps` 输出的原始 `status` 不改（错误详情仍展示原文）。
- `evaluateAcceptanceCompletion`：新增私有只读集合 `VOID_FLOW_STEP_STATUSES = {superseded, cancelled}`。归一化为作废状态的步骤不参与未完成判定（`notDone`）与 `dispatch.accepted` 对账（`missingDispatch`）；其他未知状态（`completed`/`已完成`/`superseded-by-foo` 等）仍按未完成 fail-closed。账本、澄清、步骤表可解析等其余门槛逐字不变。

### 3.2 未做（避免越界/扩大范围）

- **未改桌面窗口角色的同源实现** `app/desktop/governance-advance.ts#normalizeFlowStepStatus` 与 `flowCompletionIssue`：按角色边界须由桌面窗口属主同批对齐（见 §6）。
- **未放宽其他门槛**：仍要求所有非作废步骤 `done` 且都有 `dispatch.accepted`、无未结算治理决定、无未闭环澄清、账本可读。
- **未新增状态同义词**：`completed`、`已完成`、`accepted` 等仍不视为 `done`；`canceled`（美式拼写）不享受作废豁免（保持单一口径，如需要须显式立项）。

## 4. 影响面

- 判断 agent 验收卡（`cardKind=acceptance`）机械预检：强调式 `**done**（…）` 不再整表误判未完成；`superseded`/`cancelled` 步骤不再要求派发记录。
- 非验收路径不受影响：`parseFlowSteps`/`normalizeFlowStepStatus` 仅用于验收机械门槛（`evaluateAcceptanceCompletion`）及测试。
- 失败详情仍展示原始状态文本，便于排障。

## 5. 测试与验证（真实输出）

`test/编排/governance-judge.test.ts` 新增 4 个用例（既有断言零放宽）：

1. `normalizeFlowStepStatus`：`**done**（…）`/`__done__`/`` `done` ``/`**Done**：xxx`/`**_done_**` 等 9 种 done 变体；`**pending**（…）`/`` `dispatched` ``/`__blocked__`/纯强调符不视为 done；`**superseded**：…`/`` `cancelled` `` 归一化为作废状态。
2. `evaluateAcceptanceCompletion`：三种强调式 done 全完成 ⇒ `{ ok: true }`；`**dispatched**（已派发未完成）` ⇒ `insufficient-evidence` 且详情精确点名该步骤。
3. 作废语义：`**superseded**`/`cancelled` 步骤无 dispatch 记录不挡验收（`{ ok: true }`）；作废步骤不掩盖 `pending` 步骤；`completed`/`已完成`/`superseded-by-foo` 仍 fail-closed。
4. 真实 R2 流程单（`library-lending-v2` 步骤表只读拷贝）：`parseFlowSteps` 解析出 10 个 stepId；7 个 `**done**（…）` 行全部归一化为 `done`，`**superseded**：…` 归一化为 `superseded`；逐字表格下失败详情只点名 `verification=pending`、`acceptance=pending`，**7 个 done 行均不再出现**；把复核/验收改为 done 且不派发 superseded 步骤后 ⇒ `{ ok: true }`。

- 定向：`node --test "test/编排/governance-judge.test.ts"` → **56 tests / 56 pass / 0 fail / 0 skipped**。
- 全量：`node --test "test/编排/**/*.test.ts"` → **593 tests / 593 pass / 0 fail / 0 skipped**（上一基线 589，+4 即本次新增）。
- `npm run typecheck` → **exit 0**（仅 npm 对 `ELECTRON_MIRROR`/`ELECTRON_BUILDER_BINARIES_MIRROR` 的既有 warning，与本次无关）。
- 工作树含其他角色未提交改动，本批零新增红。

## 6. 跨角色说明（未越界）

- **桌面窗口角色**：`app/desktop/governance-advance.ts#normalizeFlowStepStatus` 与编排侧同源同规则（两侧注释互指、改动须成对同步）。本批编排侧已支持强调符与作废状态，桌面侧需属主同批对齐：① `normalizeFlowStepStatus` 剥 `*`/`_`/反引号；② `flowCompletionIssue`（或等效执行完成判定）把 `superseded`/`cancelled` 视为作废、不参与执行完成与派发证据核对。否则会出现「桌面仍挡、编排放行」的口径漂移。
- **流程单模板/提示词属主**：建议在 Steward 流程单模板中约定状态列使用纯词或强调式均可，但 `superseded`/`cancelled` 必须作为引导词出现（后接 `：` 或空白），说明文字不参与判定。

## 7. 残余风险

- **作废语义的建模仍弱**：`evaluateAcceptanceCompletion` 只按状态词跳过，不核对「作废步骤确实被其他步骤合并承接」。若流程单把所有步骤都写成 `superseded`，机械门槛会在账本/澄清满足时返回 `{ ok: true }`（空执行集）。本批按任务口径未额外加「全表作废 ⇒ manual」守卫；若产品要求，应单独立项。
- **实现双份、存在漂移风险**：分层边界导致不能复用同一函数；已用注释互指与同形测试降低风险，但长期仍应视为「成对契约」维护。
- **状态词表有限**：`supersede`/`canceled`/`obsolete` 等变体仍 fail-closed（方向安全）；新增同义词须两侧同批扩展。
- **`parseFlowSteps` 的 `status` 并非严格单元格原文**：`stripTableMarkup` 会剥掉单元格首尾强调符（行首 `**` 被剥、行内收尾 `**` 保留），错误详情因此可能显示 `done**（…）`。判定已全部经 `normalizeFlowStepStatus`，不受影响；若将来需要逐字回显原文，应单独改 `parseFlowSteps` 并评估既有断言。

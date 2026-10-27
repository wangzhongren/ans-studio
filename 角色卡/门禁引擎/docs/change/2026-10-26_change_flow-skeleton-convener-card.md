# 变更记录：流程骨架与完整流程（Steward 一次性骨架替换 / 三态流转）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-26
- 角色：门禁引擎（Gate Engine）
- 任务：客户要求意图交接时应用自动创建 `docs/flows/<flowId>.yaml` 通用骨架（`status: skeleton`），运营写团队计划后用一次 `request_confirmation(cardKind=schedule-write)` 把骨架替换为完整流程（含项目角色 / 交付步骤 / gate，保留 contract-freeze 已登记证据）；角色卡文本由本角色独立核对并修正（lead-governance-coordination；门禁引擎任务）。
- 依据：
  - 客户要求（经任务派发转达）：应用在意图交接时创建通用流程骨架；运营写团队计划后**一次性替换**为完整流程；替换后步骤推进只能用 flow 工具（仅保留有限治理写卡例外）；不得扩大写权、不得改变 Section 1 / 能力位 / 内部 id / 其他角色。
  - 应用实现（**只读核对、属编排 / 桌面角色，本批未修改未验证**）：`src/common/编排/flow-service.ts::ensureFlowSkeleton` 幂等创建 `status: skeleton` 骨架，步骤恰为 `contract-freeze / team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package / verification`（全部 `pending`，`verification` 为 `kind: acceptance`）；`app/desktop/governance-advance.ts` 的提案接受后 Convener 任务文案写明「一次性替换、保留 contract-freeze 证据、替换后改用 flow 工具」；`app/desktop/interface.ts` 按顶层 `status === "skeleton"` 识别骨架。`src/common/编排/flow-state.ts` 明确顶层 `status` 仅供人读、不参与机器判定。
  - 工作树中主上下文已先起草 `CONVENER_CARD_TEXT` 第 1 步；本批按角色归属独立核对后修正措辞、补齐三态与「只此一次」约束。

## 1. 范围与边界

- `src/common/门禁引擎/governance-roles.ts`：仅 `CONVENER_CARD_TEXT` 产品数据文本（标准工作流第 1 步、流程工具段、可写目录说明、确认卡约定、declined 段）与文件头注。
- `test/门禁引擎/governance-standard-workflow.test.ts`：更新 3 处既有断言，新增 1 例流程骨架三态测试。
- `test/门禁引擎/governance-trio.test.ts`：1 处 schedule-write 断言按新文案更新（同等严格）。
- 本角色 `changelog.md`、`memo.md`、`feature-map.md` 与本变更记录。
- **未改**：`BUILT_IN_GOVERNANCE_ROLES` 的 entries / forbidden / preauthorizedDirs / capabilities、`GovernanceFunction`、内部 id / 显示名、`ENGINEERING_QUALITY_BASELINE`、导出函数签名与判定逻辑；`src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/pipeline/**`、`src/common/shared/**`、`app/**`、共享 i18n、其他角色卡与 `demos/`。未 commit / push；未重启应用。

## 2. 卡文本（`CONVENER_CARD_TEXT`）

新增 / 修正后的三态口径（标准工作流第 1 步）：

1. **无 flow**：流程 YAML 不存在时，用同一 `request_confirmation(cardKind=schedule-write)` 确认卡**初始创建**完整流程。
2. **skeleton**：应用可能在意图交接时已创建 `status: skeleton` 的通用流程骨架（只含 contract-freeze / team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package / verification；不含项目角色、交付步骤与 gate）。运营写完团队计划后，用**一次** `schedule-write` 确认卡将骨架**一次性替换**为完整流程（含项目角色、交付步骤与 gate；**保留 contract-freeze 已登记证据**，去掉 `status: skeleton`）。
3. **完整 flow**：创建/替换完成后，流程步骤**只能通过 flow 工具推进**（`flow_get` + `flow_step_update` / `flow_step_supersede`）；**不得再为状态更新或反复调整直接 `write_file` 流程 YAML**，仅保留有限治理写卡例外（既有 `release` 标记——仅缺省 / `false` → `true`、其余逐字不变；写卡被拒后的修正重发；团队计划 / 范围实质变化时以**新 flow 版本**补 gate / 角色，整文件须重新通过 schema 校验并经确认卡确认）。骨架替换只在写团队计划后执行一次，完整流程落盘后不得把整文件重写当作日常状态更新手段。

同步措辞：

- 标准工作流第 2 步（写团队计划）补顺序：计划**写盘后先按第 1 步把骨架一次性替换为完整流程（无骨架时同卡初始创建），再发 `request_choice(cardKind=appointment)` 任命卡**——避免“先发任命卡、忘了替换骨架”。
- 「流程工具（方法化，优先路径）」段：`初始创建 / 骨架一次性替换`均走 `schedule-write`；创建/替换后流程步骤只能通过 flow 工具推进，`release` 标记与 declined 修正重发按既有确认规则。
- 「可写目录（Section 1）」段：流程 YAML `初始创建 / 骨架一次性替换`（以及经确认的新 flow 版本）仍按 `schedule-write` 确认（治理敏感写入）。
- 「确认卡约定」段：`初始创建 / 骨架一次性替换`（及经确认的新 flow 版本、迁移兼容）用 `cardKind=schedule-write`；状态推进句改为创建/替换后**只能**用 `flow_get` + `flow_step_update` / `flow_step_supersede`。
- 「写卡被拒（declined）」段：按原因修正流程状态 YAML（`初始创建 / 骨架一次性替换`）后重新发确认卡。
- 文件头新增 2026-10-26 变更注记，逐字声明能力位、Section 1、预授权、禁写、内部 id / 显示名、工程基线与判定逻辑零变化。

## 3. 测试

- `governance-standard-workflow.test.ts`：
  - 新增「2026-10-26 流程骨架」用例——三态正向断言（skeleton 通用步骤清单 + 不含项目角色/交付步骤/gate、写团队计划后一次 `schedule-write`、一次性替换、保留 contract-freeze 证据、去掉 `status: skeleton`、无骨架初始创建、计划写盘后先替换骨架再发 appointment 卡、完成后只能 flow 工具、有限治理写卡例外、不得为状态更新或反复调整直接写 YAML、只执行一次、不得把整文件重写当日常状态更新手段）；负向断言（旧「写流程单（仅初始创建）」单态口径不得复现、骨架替换不得写成可反复执行）；注册表数据面断言（entries / preauthorizedDirs / shell 档不变）。
  - 更新既有断言：declined 段文案、标准工作流第 1 步标题正则、可写目录段 `初始创建 / 骨架一次性替换（以及经确认的新 flow 版本）` 正则。
- `governance-trio.test.ts`：schedule-write 断言按 `初始创建 / 骨架一次性替换（以及经确认的新 flow 版本）` 更新（逐字匹配、未放宽）。
- 其余既有断言未删除、未放宽。

## 4. 验证结果（本批写后）

- 定向：`node --test test/门禁引擎/governance-standard-workflow.test.ts test/门禁引擎/governance-trio.test.ts` ⇒ **77 计 / 77 过 / 0 失败 / 0 skip，exit 0**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **347 计 / 346 过 / 0 失败 / 1 Windows 既有 skip，exit 0**（上一批次 346/345/0/1；本批 +1 计）。
- `npm run typecheck` ⇒ **exit 0，0 错**。
- 候选哈希（本批写后；含工作树中主上下文已起草的同文件内容）：
  - `src/common/门禁引擎/governance-roles.ts` = `e8d6d2243887ea1691702d6da7e122b6aa6a6024` / `477d92e0945ec214402e02984506f41d16bc603475f6066c4093c020335e7029`
  - `test/门禁引擎/governance-standard-workflow.test.ts` = `c1ff6c835e349e4c3bb0dd6d1aebead155a82c64` / `edca90379d2c00f5f82415e74768f5a8d347c2353ec90fc083eda94877f5da35`
  - `test/门禁引擎/governance-trio.test.ts` = `4276225027ef3880920da6ea831b9302d0460fd5` / `bfe5e812b99ecec6a0d7ae344d5995152ec5175649f2d68a0d529ccb340b9859`
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收；未 commit / push。

## 5. 未做 / 依赖其他角色 / 残余风险

- **卡文本是行为约束，不是实现证据**：骨架创建（`ensureFlowSkeleton`）、桌面「骨架已存在」任务文案、骨架识别、写前 YAML 校验与 flow 工具权限均由编排 / 运行时核心 / 桌面角色实现；本批只读核对，未修改、未验证。
- 桌面 `app/desktop/interface.ts` 以顶层 `status === "skeleton"` 识别骨架；卡文本要求替换后去掉该字段，避免完整流程被继续当作骨架提示。若应用后续改用其他识别方式，须同批回改卡文本与本批测试。
- 其他角色卡仍写「流程 YAML 只由 Steward 初始创建」（Draft / Crew / Proof）。该句只限制它们自己不得写 `docs/flows/**`，与骨架替换不冲突；本批按约束未改其他角色卡。
- 「只此一次 / 不得整文件重写」只有文本纪律与既有写卡门、门禁校验兜底，没有独立次数上限；模型仍可能尝试重复写卡，需应用侧确认卡 / 校验拒绝。
- 未做真机端到端（意图交接建骨架 → 团队计划 → 一次替换 → flow 工具推进）与独立复验。

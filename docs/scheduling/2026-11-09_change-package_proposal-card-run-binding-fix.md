# E3-B 变更包：提案确认卡 draft-run 绑定缺陷修复（T1，2026-11-09）

- **任务 ID**：`2026-11-09-proposal-card-run-binding-fix`
- **记录角色**：ANS 统筹调度（Scheduler）；**修复快路径（T1；一缺陷两子修复：A′ 编排 + B 桌面窗口）**
- **日期**：2026-11-09
- **性质**：E3-B 变更包，B2 已判 pass；**合并需客户逐 PR 明确「允许我合并」**；发布/tag 未授权。本包不是验收结论、不替代客户确认。
- **依据（实测）**：
  - 缺陷记录（客户修复指示「修复并继续」）：`docs/communication/2026-11-09_defect_proposal-card-run-binding.md`。
  - 修复路由：`docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`（183 行 / 32,508 bytes / `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`）。
  - **B1 v1.1（唯一判据）**：`docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`（294 行 / 48,124 bytes / `682539ba619366ae11243ccb661503ab84873549fc66d5a4b4a23c6b694918c7`；v1 `42a1ec9b…` + 基线已知红附录 A）。
  - **B2（pass）**：`docs/acceptance/2026-11-09_proposal-card-run-binding-fix-report-v1.md`（211 行 / 33,857 bytes / `8af767e2fc998e7bee691f8bdb1949c582f10280632dfaf92ae7dabf69a4afc8`；48/48 pass；0 fail/0 insufficient/0 NA；限制见 §六）。
  - 子修复记录（F7，先于代码）：A′ `角色卡/编排/docs/fix/2026-11-09_fix_proposal-draft-run-evidence-binding.md`（81 行 / 11,151 bytes / `d4147997…`）；B `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation.md`（96 行 / 16,245 bytes / `4005b0f4…`）。
  - D1 组合：`角色卡/测试/docs/change/2026-11-09_D1_proposal-card-run-binding-fix.md`（192 行 / 18,029 bytes / `d6270956…`）。
  - RR4：`角色卡/测试/docs/change/2026-11-09_RR4_proposal-card-run-binding-real-run.md`（231 行 / 31,494 bytes / `e561c38e…`）+ `2026-11-09_RR4_evidence/`（112 文件；S1/S2 原件）。
- **基线**：HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（tree `262e7ba42ee646d055f65f92e640834a89addde1`）；分支 `feat/plan-escalation-card`；暂存 0；`src app test` 干净基线 + 4 修复文件。
- **风险档位**：**T1**（修复快路径；无新增公共契约/数据模型/架构层；两子修复各自 Section 1 单所有者）。

## 一、候选身份

- **候选 4 文件（均为修改；无新增/删除/重命名）**：
  - `src/service/trunk/impl/apply-journal.ts`：`09130d02fd5a053883148fc4321110b0eeca89b9036cb0e2767b588346e77e41`（A′ +31/−5；draft 分支 refs 空段）。
  - `test/编排/direct-role-capabilities.test.ts`：`4f98332f3a4c8258320e4f1f5316c34ca5a6cca8cf6596d53ee74ca07b67f4a1`（A1–A5）。
  - `app/desktop/customer-input.ts`：`71e0cc0bb7be44257312c3421f210a88376f3ca07efcf448be54de1b8f217fa0`（B +40/−5；materials 失败不呈现）。
  - `test/桌面应用/chief-workflow.test.ts`：`f5dd81d64cefa707a0348f16be9b2fa2e8827976ded2ae87780364e61ba450fc`（B1–B5 改写/新增）。
- **组合聚合**：`bf12745676901055ccfcb98e3578205465c88a3ef8293faa91827dc5beb80986`（算法：逐文件 path+`\0`+raw sha256，LC_ALL=C 字节序；A′/B 各自证据一致）。
- **`src app test` manifest**：1,109 文件 / `4958207f196109ef5c7d25e642f8846880236a94e6fe4fca6bb6af03e1cab064`（canonical；D1/RR4/B2 前后 diff 0）。
- **范围合规**：`git status --porcelain -- src app test` 恰 4 文件；公共契约/排除文件（`run-manifest.ts`、`src/model/**`、`src/provider/runtime/**`、`app/` 其它、`optional-acceptance.test.ts`）diff 0；无越界/新文件。

## 二、改动内容（两子修复）

- **A′（编排，`apply-journal.ts`）**：`prepareDecisionEvidence` draft 分支 refs 为空时，目标集= `judgeContext.artifacts`/`metadata.criteriaRef`（否则既有 `discoverDecisionFiles`）；读取实际项目字节、逐文件 SHA-256、`complete-snapshot/v1` 决策快照（`decision-<digest>`）+ 结算前 `checkDecisionEvidence` 复核；角色自报路径只做 ⊆ 校验、不直接读取；`criteriaRef.sha256` 不符/未知/空/不可读/漂移 ⇒ `unavailable`；refs 非空保持 manifest 权威；不写 run manifest；pinned/无 runId 分支逐字不变。
- **B（桌面窗口，`customer-input.ts`）**：`tryChiefDecision` 的**证据准备阶段**失败 → 不调 presenter、不写 `request.presented`；以既有 `settleEntry(..., {outcome:"declined", reason:<可操作原因+prepare 错误原文>, notPresented:true})` 结算 → `cardNotPresented` 回执；不写 operatorId/不声称客户决定；诊断 `chief-decision.failed` 保留（`phase` 白名单键）；`host` 缺失/required-ack 与 execution 阶段既有回退、`respondUnsafe` 委托闸逐字不变。

## 三、确定性验证（D1）

- **`test/编排/**`**：1127 tests / 1103 pass / **22 fail** / 0 cancelled / **2 skip**（A′ 前 1122/1098/22/2；+5 新用例；失败/跳过名集合 diff 空）；A1–A5 全过；**新增确定性失败 0、新 skip 0**。
- **`chief-workflow.test.ts`**：63 tests（+4 新用例）；两轮 51/12、49/14（基线 59/47/12）；新增失败仅 W20/W29/W10/W47-revise 等环境抖动，隔离复跑通过；**0 新确定性失败/0 新 skip**。
- 只读回归：decision-service 20/20、application-line 3/3、run-change-trigger 失败名与基线逐条相同、pending-card-restart 1/1；`optional-acceptance.test.ts` 基线已知红（6/2/1/3/0）diff 0。
- `npm run typecheck` / `typecheck:renderer` exit 0；候选/manifest 前后不变。
- 基线已知红逐条见 B1 v1.1 附录 A（`test/编排` 22 fail/2 skip 按文件+测试名；`chief-workflow` 12 项）。

## 四、真实运行（RR4，S1 成功 + S2 fail-closed）

- 环境：真实 Electron（本 worktree `app/main.ts`）+ 真实 Claude + 真实 UI；**隔离 `--userData`、CDP 9223**；目标=贪吃蛇 target 只读副本（75→30 文件，4 个 draft run `documents:{}`/`execution:null`、提案真实字节保留）；**贪吃蛇 9222/target/run 根零改动**；9223 结束关闭无残留。
- **S1（成功）**：1 条客户消息 → chief `dispatch_task`（rapporteur，draft run）→ rapporteur `request_choice`（taskId 去 `#`，与账本一致）→ `request.created req-303944cb359e95cd` → **A′ prepare 成功**：`complete-snapshot/v1` 决策快照 `decision-3755…`（49,788 B；6 files；5 个真实文档与 target 盘上字节逐字节一致；prepare 未写 run manifest）→ 卡片呈现（execution 阶段既有 judge 工具面错误 → 既有 execution 回退）→ UI 客户接受（by customer/operatorId 51054/accept/decisionId）→ `request.resolved` → 工具回执 ok → `submit_report`/`task.reported done` → 流程继续；**无「通道未受理」**；预算 1 消息/1 卡/≈1m54s/首果即停。
- **S2（fail-closed）**：两次 materials/binding 失败真机触发 → 无 `request.presented`、`declined+reason`、`cardNotPresented` 回执、回合不阻塞、无新快照。
- 偏差如实：首次 S1 因任务文本 taskId 带 `#` 未达 A′（夹具输入错误，非产品缺陷）；驱动 `ReferenceError` 由接管脚本完成接受/关停；提案后冻结/pin 下一门未在 10s 证据窗内到达（按预算 halt）。

## 五、B2 与判定

- **B2 = pass（48/48；0 fail/0 insufficient/0 NA）**：`docs/acceptance/2026-11-09_proposal-card-run-binding-fix-report-v1.md`（`8af767e2…`）。独立复算候选/聚合/manifest、抽查 S1 快照/账本/回执、S2 fail-closed、9222 零改动/9223 关闭、基线已知红；修复记录 mtime 先于代码；独立复跑 direct-role-capabilities 40/39/1（唯一失败为基线已知红）、B 用例 4/4、typecheck 0。
- **限制（不改变 pass）**：S1 的 `chief-decision.failed`（execution）为**既有 judge 工具面问题**（非本写集，走 AC-11 回退）；提案接受的冻结/pin 下一门未在证据窗内到达；修复记录命名与 v1 预期不同（B1 v1.1 按实际路径判定）；诊断 `stage` 以 `phase` 落盘；A′ 证据 `+124/−2` 为笔误（实际 +122/−2）。

## 六、披露与后续

1. 本修复覆盖缺陷要求 1（呈现 fail-closed）与 2（合法出卡可提交）及测试/真实运行；**不改** run manifest 持久化/`RunDocKind`/公共契约/其它角色；pinned/intent 路径逐字保留。
2. S1 的 execution 阶段 judge 工具面错误属既有问题（不在本修复）；如需修复另案。
3. 提案接受后的**冻结/pin 下一门**未覆盖；贪吃蛇恢复运行（团队→实现→出游戏）预算/停止待协调方确认（见派发记录 §四）。
4. 合并需客户逐 PR「允许我合并」；发布/tag 未授权。

## 七、状态

- **B2 pass；变更包就绪**：候选 4 文件 / 聚合 `bf127456…` / manifest `4958207f…`；D1/RR4/B2 证据齐备。
- 待协调方确认贪吃蛇恢复运行预算 → 执行恢复验证；提交/推送/合并按客户逐 PR 授权；发布/tag 未授权。

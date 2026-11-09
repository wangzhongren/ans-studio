# 修复记录（F7）：提案确认卡「通道未受理」——materials 失败 fail-closed 呈现（B，桌面窗口侧）

- 日期：2026-11-09
- 角色：ANS 桌面窗口（独立实施上下文；roleId `桌面窗口`）
- 状态：**修复记录先于代码**。本记录在修改任何代码/测试之前写盘；其后不再改写本文件，实施与验证的实际结果一律落在同目录证据夹
  `角色卡/桌面窗口/docs/fix/2026-11-09_fix_proposal-card-fail-closed-presentation-evidence/`（前后测试日志、diff、候选 hash、计数）。
- 工作类型与路径：缺陷修复快路径（F1–F9），T1；本记录只覆盖**子修复 B（桌面窗口：materials 失败 fail-closed 呈现）**。整缺陷为「一缺陷、两同源子修复」：A′（编排，等价绑定）由编排角色另行修复；B 与其各自单所有者、各自写集，共用一份缺陷记录与一份 B1。
- 依据（写盘前实测 hash）：
  - 缺陷记录（沟通；客户修复指示 1–4）：`docs/communication/2026-11-09_defect_proposal-card-run-binding.md`，48 行 / 5,529 bytes / SHA-256 `21dfb43cfc330dcd19058a42a5e72bd1ea27bda3a264a68770160a0173ba300c`。
  - 修复路由（调度；B 细节、D3/D4、B1–B5）：`docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`，183 行 / 32,508 bytes / SHA-256 `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`。
  - 实施前验收标准 B1 v1（验收；条件性冻结，B 条目 AC-9–AC-13 / B1–B5）：`docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`，196 行 / 35,639 bytes / SHA-256 `42a1ec9b86b8ae2fe7805de9fcedbac3ab71ae266999e09266c794abc65c963b`。
  - 角色边界：`角色卡/桌面窗口/boundary.md` §1（SHA-256 `8c7d5c273c1404d4f0876ec0219bbfc08090c09cb736e3d93e0d7b2adcbd25e1`）；`app/desktop/`（目录）与 `test/桌面应用/chief-workflow.test.ts`（单文件）在写集内；`test/桌面应用/` 为逐文件授权，**不新建测试文件**。
  - 基线：worktree `.claude/worktrees/trunk-amendment`，分支 `feat/plan-escalation-card`，HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（tree `262e7ba42ee646d055f65f92e640834a89addde1`）。写盘时另一 owner（编排）的 A′ 工作区改动（`src/service/trunk/impl/apply-journal.ts`、`test/编排/direct-role-capabilities.test.ts`）已在同一 worktree 中，**不属于本记录写集、本角色不触碰**；B 的改动文件前后 hash 见证据夹 `before-file-hashes.txt`。

## 1. 症状（真实运行观测，缺陷记录原文摘要）

- 贪吃蛇真实测试（2026-11-09）：幕僚经策划（rapporteur）在 **draft run** 上发出「提案确认」卡（`requestId=req-e6ff1693840f0ed0`，`cardKind=proposal`，`flowId=snake-game`，选项 accept/revise）。
- 卡片正常呈现给客户；但每次提交均返回失败，界面显示「回传失败：通道未受理——请重试」，**可无限重试、永不成功**；幕僚回合被卡住（会话「正在工作」、输入禁用）。
- 主进程诊断在卡片创建瞬间（02:55:31.207Z）记录 `event:"chief-decision.failed"`、`errorMessage:"Draft request target is not bound to that run"`；返工重出卡（`req-2454680582827a06`，03:00:38.777Z）复现同一失败。`session:operator-response` 全部 `ok:false`。
- 根因在宿主材料准备阶段（draft run 未绑定提案物证）由 A′ 修复；**本记录负责失败后的呈现契约**：失败时不得把不可提交的卡呈现为可重试/可提交。

## 2. 根因（HEAD `c1439ce` 实测 file:line）

1. **materials 失败被当作「回退客户卡」处理（fail-open）**：`app/desktop/customer-input.ts` `tryChiefDecision`（`:1789-1881`）。委托（替我决策）开启、`governanceModel==="trio"`、卡种 ∈ {appointment, acceptance, decision, proposal} 时进入 `judging`，调用 `host.prepare`（`:1816`）。失败被 `catch`（`:1873-1878`）：仅记 `diagnostic.error("chief-decision.failed")`，随后**无条件** `chiefWaiting(entry, stage === "materials" ? contextUnavailable : noValidDecision)`——materials 阶段失败也被当成「等待客户接管」呈现。
2. **`chiefWaiting` → `presentNow` 写 `request.presented`**：`chiefWaiting`（`:1782-1788`）→ `presentNow`（`:1098-1117`）把卡置 `active`、`pending.set`、调用 presenter，并触发 `ctx.onPresented` → `withRequestLifecycle.markPresented("customer")`（`app/desktop/session.ts:5684-5689` → `recordRequestPresented` `:5203-5207`）⇒ **`request.presented(customer)` 在案**。卡被呈现为「可重试」。
3. **工具调用挂起、回合阻塞**：卡背后是发起角色 `request_choice` 工具调用的 promise；`presentNow` 后一直挂在 `pending`，直到被结算/中止 ⇒ 发起回合「正在工作」，不返回回执。
4. **委托开启时客户回包必被拒（无限重试循环）**：`respondUnsafe`（`:2497-2575`）对 chief 业务卡在委托开启时直接返回 `{ok:false, error: main.customerInput.chief.manualTakeoverRequired}`（`:2506-2508`）；`respond` 的「可重试」契约保留请求、允许界面重试 ⇒ **呈现即不可提交、重试永不成功**。真实运行界面显示的「通道未受理」是 renderer 在 IPC `result.error` 空值时的回退文案（`app/renderer/src/chat/chat-store.ts:1989`），不是真实原因。
5. **结构性事实**：draft run 在 pin 之前没有任何文档绑定写点（`src/common/编排/run-manifest.ts` `ensureDraftRun` 字面量 `documents:{}`；`writeRunManifest` 只在 pin/re-pin 写 documents），`prepareDecisionEvidence` draft 分支 `refs.length===0` ⇒ 必然 `unavailable("Draft request target is not bound to that run")`（`src/service/trunk/impl/apply-journal.ts:948`）。因此 materials 失败在当前实现中是**常规可复现路径**，B 的 fail-closed 呈现必须把真实原因交回发起角色/回合，而不是呈现一张永远不能提交的卡。

## 3. 预期行为（已确认基线，F1）

- 客户修复要求 1（缺陷记录 §「客户修复指示」）：**呈现 fail-closed**——chief-decision 宿主绑定失败时，不得把卡呈现为可重试/可提交；应把真实失败原因交回发起角色/回合（可操作、如实），并记录诊断。
- 客户修复要求 3：不弱化既有 pinned-run 与意图确认路径；不改写他人身份；补对应 unit/integration 测试。
- B1 v1 AC-9–AC-13 摘要：
  - AC-9：materials/绑定失败（`host.prepare` 抛错；含证据不可用/漂移/绑定不符）且委托开启 ⇒ presenter 未调用、**不写 `request.presented`**、无卡面；以既有 `declined + notPresented + reason` 结算；工具回执为 `cardNotPresented` 语义；发起回合正常继续。
  - AC-10：失败结算前后 `delegation.set({enabled:false})`/中止/委托 revision 变化 ⇒ 恰一次结算，不双结算/不遗漏；`valid()` 语义保持。
  - AC-11：`host.execute` 后无有效决定（stage=execution）⇒ 既有 `chiefWaiting(noValidDecision)` 卡面回退**不变**。
  - AC-12：委托开启时 chief 业务卡 respond 仍返回非空 `manualTakeoverRequired`；委托关闭后客户可正常结算；**不放宽 respond 闸、不自动关闭委托**。
  - AC-13：`reason` 非空且含真实 prepare 错误/可操作指引；不得以空串或 renderer 回退文案「通道未受理」作为唯一信息；诊断 `chief-decision.failed` 保留；`request.resolved` 经既有 lifecycle 写 `choice:"declined"` + `reason`；**无 `operatorId`**（D4(a)，不得用 `judge:`/`directive:`/`system:` 前缀）；回执与账本不得声称客户拒绝或同意。
- D3：materials **全部失败** fail-closed（证据不可用/漂移/绑定不符等），execution 阶段既有回退保持。
- D4(a)：沿用既有 `declined + notPresented + reason`、无 `operatorId` 的结算；`request.resolved.by` 沿用既有 lifecycle 约定（本轮不改枚举）；回执/账本不得声称客户拒绝或同意。

## 4. 修复后的行为（B：仅 `app/desktop/customer-input.ts`）

只改 `tryChiefDecision` 的 `catch`（约 `:1873-1878`），保持其余路径逐字不变：

1. `stage === "materials"`（`host.prepare` 抛错、`basis` 缺失/非法、绑定类失败等——凡在 `stage = "execution"` 赋值之前抛出）且 `valid()` 成立时：
   - **不再** `chiefWaiting`/`presentNow`：不调用 presenter、不写 `request.presented`、不产生卡面/`judgeNotice` 卡；
   - 以既有 `settleEntry(entry, { outcome: "declined", reason: <真实原因+可操作指引>, notPresented: true }, "judging")` 结算：清 `judging`/占位、`resolve` 工具调用 promise、按序 drain 下一张卡；
   - `reason` = 既有 i18n 文案 `main.customerInput.chief.contextUnavailable`（可操作指引）+ `reasonOf(error)`（prepare 错误原文），非空、如实；不使用 renderer 回退文案；
   - 工具回执经既有 `cardNotPresented`（`src/provider/runtime/tools.ts:1964-1972`，使用点 `:2270`、`:2656`）：「治理确认卡未发出（未向客户呈现；原因：…）→ 未获任何同意；请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。」；
   - `request.created → request.resolved`（`choice:"declined"`、`reason`、无 `operatorId`、无 `actionSource`、不写 `request.presented`）由既有 `withRequestLifecycle` 写出（`app/desktop/session.ts:5566+`）；`by` 沿用既有 lifecycle 约定（D4(a)）；
   - `diagnostic.error("chief-decision.failed", error, { requestId, stage })` **保留**（含 requestId、stage、原始 error）。
2. `stage === "execution"`（chief 已运行但未提交有效决定）：**既有回退逐字不变**——`chiefWaiting(entry, mainT("main.customerInput.chief.noValidDecision"))`（卡呈现、委托关闭后可接管）。
3. 响应闸 `respondUnsafe`（`:2506-2508`）**逐字不变**；不自动关闭「替我决策」、不放宽闸。
4. 竞争/幂等：仅当 `valid()`（仍在 `judging`、未被中止、委托仍开启且 revision 未变）时结算；否则交给既有路径（委托订阅的 `chiefWaiting(modeChanged)` / 取消的 `unavailable` 结算），不双结算、不遗漏。
5. 不伪造客户决定：不写 `operatorId`、不写 `actionSource`、不声称客户拒绝/同意；`notPresented:true` 是既有契约（`src/model/runtime.ts:1101-1119`），不改模型。

## 5. 范围与非目标

- 写集：`app/desktop/customer-input.ts`（唯一产品代码）；`test/桌面应用/chief-workflow.test.ts`（改写既有 `missingEvidence` 用例 + 补 B1–B5 用例）。**不新建测试文件**（B1 H1 约束）。
- 非目标/禁止：`src/service/trunk/impl/apply-journal.ts`（A′ 属编排）、`src/common/编排/run-manifest.ts`、`src/model/**`、`src/provider/**`（含 `tools.ts` 回执文案）、`src/pipeline/**`、`app/desktop/session.ts`、`app/renderer/**`、其它角色资料、角色卡/边界/治理/权限/验收标准；不改 `RunDocKind`/`request.resolved.by`/IPC 形状；不新增公共契约/数据模型。**若实现必须越界/改契约 ⇒ 停止并回报，不在本记录内实施。**
- `test/桌面应用/optional-acceptance.test.ts` 为基线已知红项，**不在写集、不修改**（只读对照）。
- 不运行真实模型/Electron；不占用贪吃蛇实例 9222 端口及其临时根/目标项目；本子修复为确定性层验证（真实运行 RR-1–RR-7 由协调方另行安排）。

## 6. 回归场景（B1–B5 与既有断言改写）

- **既有断言改写（不得静默放宽）**：`test/桌面应用/chief-workflow.test.ts` 现有「W1b 真实缺材料：不构造chief/ref/批准，明确等待且on禁人工，主动关闭后原请求可接管」（约 `:385-395` 分支，测试体 `:460-473`）断言「materials 失败仍呈现卡（`shown[0].judgeNotice=contextUnavailable`）+ 委托开启 respond=false + 关闭后 respond=true」。B 后改为：presenter 未调用（`shown.length===0`）、无 `request.presented`、工具回执 `cardNotPresented` 且含真实原因、worker 回合正常继续（不阻塞）、委托保持开启；旧断言原文/新断言/理由逐条记入证据夹。
- B1（materials 失败不呈现 + 回执如实 + 回合不阻塞）：上述真实 SessionManager 用例（改写）+ 通道级用例（prepare 抛错 ⇒ presenter 未调用、outcome `declined+notPresented+reason`、`pendingCount()===0`、旧 requestId 再提交返回 `expired`）。
- B2（竞争不双结算）：prepare 挂起期间 `delegation.set({enabled:false})` ⇒ 既有 `chiefWaiting(modeChanged)` 呈现一次；迟到失败被 `valid()` 丢弃，不双结算；关闭后客户可正常接管结算。
- B3（execution 回退不变）：`host.prepare` 成功、`host.execute` 未提交有效决定 ⇒ 卡呈现且 `judgeNotice=noValidDecision`（既有回退）。
- B4（respond 闸回归）：委托开启时 respond 返回非空 `manualTakeoverRequired`；委托关闭后同一卡可正常结算。
- B5（reason 非空/如实）：失败原因含 prepare 错误原文（如 `Draft request target is not bound to that run`），不得为空或以「通道未受理」代替；回执不得声称客户拒绝/同意。
- 回归执行（只读，不改断言）：`test/桌面应用/decision-service.test.ts`、`application-line.test.ts`、`run-change-trigger.test.ts`、`pending-card-restart.test.ts`；`optional-acceptance.test.ts` 仅只读复跑对照基线。

## 7. 验证计划

- 改前基线（已采集，见证据夹 `baseline-*.log`/`.tap`）：
  - `node --test --test-concurrency=1 "test/桌面应用/chief-workflow.test.ts"`：tests 59 / pass 47 / fail 12 / skipped 0 / exit 1（该文件在本机 HEAD 上存在 12 项环境/既有失败，非本修复引入；失败名单逐条记录）；
  - `decision-service`：20/20 pass；`application-line`：3 tests / 2 pass / 1 fail；`run-change-trigger`：9 tests / 0 pass / 9 fail；`pending-card-restart`：1/1 pass（均为改前既有状态）；
  - `optional-acceptance`（只读对照，BASE-3 命令）：6 tests / pass 2 / fail 1 / cancelled 3 / skipped 0，与 B1 BASE-3 完全一致。
- 改后：同一命令逐文件复跑，记录 tests/pass/fail/cancelled/skipped/exit 与日志 hash；**新增确定性失败 = 0、新 skip = 0**；既有失败名单只允许不恶化（逐条对照说明）；`optional-acceptance` diff = 0 且计数不变。
- 静态门：`npm run typecheck` exit 0。
- 证据：证据夹保存前后日志、`git diff`（仅写集文件）、改动文件前后 SHA-256、候选（HEAD/tree/diff 统计）、测试计数对照、断言改写逐条记录。
- 提交纪律：不提交/推送/合并/发布。

## 8. F1/F2/F4/F8 确认

- **F1（预期行为已在确认基线内）**：通过——缺陷记录客户修复要求 1（呈现 fail-closed）与要求 3（不弱化既有路径），以及 B1 v1 AC-9–AC-13。
- **F2（实际结果偏离且可复现）**：通过——真实运行诊断 `chief-decision.failed` ×2（同一 `errorMessage`）+ `request.presented` 在案 + 20 张「通道未受理」截图 + `session:operator-response` 全 `ok:false` + 回合阻塞记录。
- **F4（不新增/改变公共契约、共享抽象、数据模型、跨角色接口、架构分层、模块边界）**：通过——复用既有 `declined + notPresented + reason` 结算与既有 `cardNotPresented` 回执；不改 `CustomerInputOutcome`/IPC/`request.*` 形状；不新增字段/枚举。
- **F8（既有指派/客户修复指令覆盖所有者、范围与写集）**：通过——桌面窗口为既有所有者（`角色卡/桌面窗口/boundary.md` §1 覆盖 `app/desktop/` 与 `test/桌面应用/chief-workflow.test.ts`）；客户「修复并继续」+ 调度路由 B 子修复指派 + B1 v1 覆盖本写集。

## 9. 「记录先于代码」

- 本文件在 `app/desktop/customer-input.ts` 与 `test/桌面应用/chief-workflow.test.ts` 的任何改动**之前**写盘；写盘时的候选文件 hash 见证据夹 `before-file-hashes.txt`。实施结论不写回本文件（保持 mtime 顺序可核对），实际结果见证据夹。

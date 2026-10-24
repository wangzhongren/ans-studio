# 变更包：P0-2 / P1-5 / P1-6 / P1-7 后续修复（governance-followups v1）

- **风险档位**：T3
- **是否发布版本**：**否**
- **是否启动独立验收**：**否**（项目规则 §二.11；非发布变更）
- **分支/基线**：`governance-followups`，基于合并后的 `origin/main` `bf86d0a`（PR #11 已合并）
- **提交状态**：随本分支提交；**未 push/合并**（另行授权）
- **依据**：客户指令「继续开始做这些，做完了提交」；审计 P0-2/P1-5/P1-6/P1-7；`docs/scheduling/2026-10-24-governance-followups-plan.md`
- **替代检查**：受影响套件 + T3 全量（排除已知挂起）+ typecheck + 真实 Electron + 目标/演示只读；**未覆盖**：P1-7 的 handback 账本级绑定（本批只做 owner-only delivered + 既有 flow_step_update 注入）、P0-2 返工分支 ready 唤醒、Windows 符号链接环境用例。

## 1. 修复内容

### P0-2 步骤 done 后自动推进

- `src/common/编排/flow-state.ts` 新增纯只读 `listReadyFlowSteps`：pending + 前置 done（supersededBy 链解析）+ 未派发 + kind dispatch/artifact；输出 ready/skipped/stopReason。经 `src/pipeline/orchestration/flow-state.ts` 公共出口导出。
- `app/desktop/interface.ts` 新增 `wakeStewardForReadySteps`：在 settle/账本/回交/导入/app-only 写后的 `dispatchAcceptanceForFlow` 入口读取 flow+账本，计算 ready；只对 **Steward 可执行**（convener artifact 或项目 worker）唤醒 Steward；rapporteur/nominator/verifier 交既有 app/治理路径；`role-cards`/`role-readiness` 留给应用确定性门控；有 delivered 待核证时本轮不双发。
- 消息 `[自动推进]` 含 flowId/完整 revision/全部 ready（id/owner/kind/parallelGroup/dependsOn）；要求先 `flow_get` 再 `dispatch_task` 派 worker；不自动派发、不标 done、不派 acceptance/Proof、不写 flow/账本；去重 `projectRoot+flowId+revision+sortedReadyIds`；Steward busy 跳过；预算 24 次/flow、同 ready 集合 2 次、连续无进展 2 次；不轮询/定时器。

### P1-5 验收标准双源/版本/非发布

- `governance-gate.ts`：criteria 门只对 `flow.release === true` 生效；非发布/legacy 豁免（不再要求 Verifier 文件）。
- 发布版本扫描 `docs/acceptance/<flowId>-criteria-vN.md` **最新版本**并结构校验；缺文件/最新版不合格拒绝；accept-quick 豁免保留。
- 应用自动写 criteria 仍 release-only；非发布不启动 verifier。

### P1-6 schedule-write 后 revision 过期

- `flow-service.update`：revision 冲突时重读当前 flow；仅当目标步骤当前状态仍允许该迁移、done 证据在当前账本仍有效时用当前 revision **重试一次**；否则保持 `revision-conflict`。诊断 `flow.conflict.retry`；不无限重试、不掩盖真实冲突。

### P1-7 dispatch.accepted 入队≠交付 / delivered 无证据

- `flow-service.isTransitionAllowed`：`dispatched→delivered` **仅步骤 owner**；manager（Steward/Lead）代标 delivered 拒绝；`delivered→done` 仍仅 manager；worker 不能 done；failed/blocked 保持。
- `run-role.ts`：把**既有** `flowStepUpdate` 注入扩到项目角色（`flowGet` 已给所有角色；`flowStepSupersede` 仍只给治理角色）；项目 owner 可用既有工具标自己的 delivered；不是新工具/能力位。
- `govern-session.ts`/门禁角色卡：项目 owner 标 delivered；Steward/Lead 不代标，只核 done；worker 不能 done。
- **残余**：`dispatch.accepted` 仍在入队时写；本批用“owner delivered + manager done”收口 Convener 代标漏洞，但没有新增 handback 账本事件，done 仍不是 handback 级绑定；变更包不宣称完全解决。

## 2. 参与角色/文件

- **编排**：`flow-state.ts`（ready 纯函数）、`flow-service.ts`（retry/transition）、`governance-gate.ts`（criteria 门）、`pipeline/orchestration/flow-state.ts`（导出）、`govern-session.ts`（提示）、`run-role.ts`（既有 flowStepUpdate 注入项目角色）；测试 `test/编排/{flow-state,flow-service,governance-gate,governance-judge,governance-session}.test.ts`。
- **桌面窗口**：`app/desktop/interface.ts`（ready 唤醒/去重/预算）；测试 `test/桌面应用/{interface,dispatch-delivery}.test.ts`。
- **门禁引擎**：`governance-roles.ts`（Steward/Lead delivered 边界、项目 owner 提示）；测试 `test/门禁引擎/{governance-standard-workflow,governance-trio,liaison-role}.test.ts`。
- **测试**：`test/测试/governance-e2e-auto/{d-dispatch-listing,l-crew-write-validation}.test.ts`、`test/测试/governance-liaison-verify/a-roles-writes-caps.test.ts` 注释。
- 21 个修改 + 2 个管理文档（plan/本变更包）；无新增角色/边界/flow 字段/账本 kind/工具/能力位/UI。

## 3. 证据

| 套件 | 结果 |
| --- | --- |
| `test/测试/governance-e2e-auto/*` | **145/145 pass**，连续 4 次稳定 |
| `test/门禁引擎/*` | 320 tests / 319 pass / 1 skip / 0 fail |
| `test/编排/*` | 887 tests / 885 pass / **1 fail**（`shell-authorized-routine:103` Windows symlink EPERM 环境）/ 1 skip |
| `test/桌面应用/*` | **590/590 pass** |
| T3 全量串行（排除 `test/pi-adapter/write-sequencing.test.ts`） | **3875 tests / 3847 pass / 9 fail / 19 skipped / 0 cancelled**，347,110 ms；9 fail 全为既有 Windows symlink EPERM 环境失败，无产品断言失败 |
| Typecheck | `tsc -p tsconfig.json --noEmit` exit 0 |
| Electron | `E2E_PASS=true`、`E2E_FAILURES=`（空） |
| 目标/演示只读 | `ans-gateway` 91f01333…、`expense-tracker` 0eb67c71…、`tower-defense` 4b0858c3…；前后一致，零写入 |

S5 候选聚合 sha256（21 修改 + plan，排序逐文件 sha256 的 sha256）：`f7b2208b0032c35bc2e4b3960571ab3097924d7aac2a06317d81214164ef5b08`；新增本变更包后 commit 内容以 Git 提交为准。

## 4. 残余/未覆盖

- P1-7：owner delivered 是角色级交付声明，`dispatch.accepted` 仍是入队记录；未新增 handback 账本事件/字段，done 未做 handback 级绑定。
- P0-2：返工（latest rejected/judge auto-rework）分支未接 ready 唤醒；`role-cards`/`role-readiness` 留给应用确定性门控；app/customer/acceptance 硬停；应用不直接派发，由 Steward 继续调度。
- P1-6：仅 `flow_step_update` 一次 retry；`supersede` 的 stale revision 未做同类 retry。
- P1-5：非发布 criteria 门豁免；发布读取最新 vN；验收标准双源的产品归属仍按现有流程。
- 环境：T3 9 个 Windows symlink EPERM + 1 个编排 symlink 失败；19 skip；`write-sequencing` 已知挂起排除。
- 非发布：不写 `docs/acceptance/**`，不启动独立验收/Proof；`verification`/`acceptance` 保持 pending。
- 主工作树 flow 骨架 S2/S4 未提交改动未进入本分支；本分支基于合并后的 `origin/main`。
- P1-7 e2e 的 owner 使用内置非管理者 rapporteur；项目 worker 的 delivered 路径由 `test/编排/flow-service.test.ts`（actorPower=project）覆盖，桌面 fixture 未 pin 项目角色边界。

## 5. 结论

本 follow-up 在 `governance-followups` 分支实现 P0-2 ready 唤醒、P1-5 发布 criteria 门/最新版本、P1-6 一次 retry、P1-7 owner-only delivered + 既有 flowStepUpdate 项目角色注入；145/145 e2e、590/590 桌面、门禁/编排受影响套件通过，T3 全量 3847 pass/9 既有环境失败/19 skip，typecheck 0，Electron 全绿，目标零写入。P1-7 handback 账本级绑定、P0-2 返工分支等仍未做，不宣称完全闭环。提交到 `governance-followups`，未 push/合并。

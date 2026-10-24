# 后续变更计划：P0-2 / P1-5 / P1-6 / P1-7（governance-followups）

- 日期：2026-10-24
- 客户指令：「继续开始做这些，做完了提交。」
- 分支：`governance-followups`，基于合并后的 `origin/main` `bf86d0a`（包含 PR #11 主理协调 T3）。
- 档位：T3；非发布变更；不启动独立验收/Proof；做完只 commit，不 push/合并（另行授权）。
- 原则：不新增角色、工具、能力位、卡片种类、账本 kind/字段；不改变客户最终决定权；不写目标/演示。

## 1. 四个缺陷与修复口径

### P0-2 步骤 done 后自动推进下一步

- **问题**：应用只在 delivered/blocked 唤醒；步骤 done 后无 ready 计算/唤醒，Steward 结束回合，下一步 pending。
- **修复**：
  - 编排 `flow-state.ts` 新增纯只读 `listReadyFlowSteps`：pending + 前置 done（含 supersededBy 链）+ 无 `dispatch.accepted` + kind 非 `customer-decision`/`acceptance`；输出 owner/kind/parallelGroup/dependsOn/ready/skipped。
  - 桌面 `interface.ts` 在 settle/账本/回交/导入/app-only 写后调用 ready 检查；只对 **Steward/convener 自身 artifact 或项目 worker** 的 ready 步骤向 Steward 投一条「继续调度」消息；不自动派发、不标 done、不派 acceptance/Proof。
  - 去重 `projectRoot+flowId+revision+readyIds`；Steward busy/队列/在途跳过；预算 24 次/flow、同阶段 2 次、连续无进展 2 次；与 delivered 唤醒共享 revision 指纹，避免双发。
  - 不轮询、不新增持久状态；app/customer/acceptance 硬停；release 门仍由 P0-1 控制。
- **测试**：ready 纯函数（依赖/superseded/已派发/并行/app/acceptance）；桌面唤醒/去重/预算/不双发；e2e 步骤 done 后 Steward 收到继续消息。

### P1-5 验收标准双源/版本/非发布

- **问题**：派发门固定读 `docs/acceptance/<flowId>-criteria-v1.md`；应用读最新版本；非发布不启动 Verifier，但门仍要求该文件。
- **修复**：
  - `governance-gate.ts` 的 criteria 门只对 **`flow.release === true`** 生效；非发布/legacy 豁免（不要求 Verifier 文件）。
  - 发布版本按 `<flowId>-criteria-v{N}.md` **最新版本**读取并结构校验，不再硬编码 v1。
  - 应用自动写 criteria 仍只在 release 时发生；非发布不启动 verifier。
- **测试**：非发布 appointment flow 缺 criteria 可派发；release 缺 criteria 拒绝；v2 生效；v2 结构不合格拒绝；v1/v2 取 v2。

### P1-6 schedule-write 后 revision 过期

- **问题**：写后回执/账本仍是写前 revision；下一次 `flow_step_update` 用旧值，`revision-conflict` 后角色不重读，流程停。
- **修复**：`flow-service.update` 在 revision 冲突时**重读当前 flow**，仅当目标步骤当前状态仍可执行该迁移、且 done 证据在当前账本仍有效时，**重试一次**（使用当前 revision）；否则仍返回冲突。写诊断 `flow.conflict.retry`，不无限重试。
- **测试**：stale revision + 步骤状态未变 → 一次重试成功；步骤已被并发改到不可迁移 → 仍冲突；done 证据不足 → 不重试/如实失败；不掩盖真实冲突。

### P1-7 dispatch.accepted 入队≠交付 / delivered 无证据

- **问题**：Convener 可自行把 dispatched 标 delivered 再 done，绕过 worker；done 的 dispatch 证据只对账入队记录。
- **修复（本批最小收口）**：`flow-service.isTransitionAllowed` 把 `dispatched → delivered` 收紧为 **仅步骤 owner**（manager 不能代标 delivered）；`delivered → done` 仍仅 manager/Steward，且 done 的 dispatch 证据对账保留。Steward 只能等 worker delivered 后 done；worker 不能 done。
- **边界**：本批不新增 handback ledger kind/字段；真正 handback 内容仍由应用投递/报告，owner delivered 是角色级交付声明；残余在变更包写明。
- **测试**：owner delivered 通过；manager/Lead delivered 拒绝；worker done 仍拒绝；manager done from delivered 通过；失败/阻塞迁移保持。

## 2. 参与角色与写集

- **编排**：`src/common/编排/flow-state.ts`（P0-2 ready 纯函数 + 导出）、`flow-service.ts`（P1-6 retry、P1-7 transition）、`governance-gate.ts`（P1-5 release-only/latest criteria）、`src/pipeline/orchestration/flow-state.ts`（P0-2 导出）；`test/编排/{flow-state,flow-service,governance-gate}.test.ts`。
- **桌面窗口**：`app/desktop/interface.ts`（P0-2 ready 唤醒/去重/预算）；`test/桌面应用/interface.test.ts`（+e2e 最小）。
- **门禁引擎**：`governance-roles.ts`（Steward/Lead 卡：delivered 仅 owner；发布 criteria 门/非发布不派）；`test/门禁引擎/*`。
- **测试**：`test/测试/governance-e2e-auto/*`（P0-2 继续、P1-5/6/7）；T3/Electron/目标只读。
- 不写运行时核心/Pi/Provider/renderer/i18n/flow envelope 之外字段/账本 kind/角色边界/目标/演示。

## 3. 验收/提交

- 非发布：不启动独立验收/Proof，不写 `docs/acceptance/**`；`verification`/`acceptance` 保持 pending。
- 证据：受影响套件、T3 全量（排除已知挂起，记录 Windows symlink EPERM 环境失败）、typecheck、Electron、目标/演示哈希；变更包 `docs/scheduling/2026-10-24-governance-followups-change-v1.md`。
- 做完 commit 到 `governance-followups`；不 push/merge（另行授权）。

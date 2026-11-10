// src/service/gate/shell-rules.ts
// Service 公开出口：shell 闸 (c) 层规则集的公开再导出（编排 I-1 `assembleProjectShellGate` 的合法注入源）。
//
// 单一来源：实现与数据恒在门禁引擎私有 `src/common/门禁引擎/classify-shell.ts`——本文件**逐字转出**
// （同一函数引用），不复制实现、不另立第二份规则集；跨角色只可经此处（Service 公开出口）消费——
// 他角色导入本角色**私有** `common/` 不合法（§6），编排侧 `shell-arming.ts` 头注登记的「合法注入源」
// 即本文件（客户 2026-10-12 确认边界后落地）。
//
// 形状（与编排 `ClassifyShellFn` 逐字可注入，无需适配器）：
//   classifyShell(argv: string[], rules: ShellRules): ShellClass
//   defaultShellRules(): ShellRules
//   matchRoutineShellCommand(argv: string[]): { id: string } | undefined
//     —— 例行命令确定性白名单谓词（2026-10-31，方案 v1.3 §5.3）：分类器与写守卫的**唯一实现**；
//        编排/委托策略（`routine-shell-policy`）经本出口消费同一函数引用，不复制形状判定。
//        命中 id 稳定（`allow:routine:<id>`）；委托策略只接受原委托三 id（npm-test / npm-run-typecheck / node-test）。
//   matchReadonlyGit(argv: readonly string[]): ReadonlyGitMatch | undefined
//     —— 只读 Git 精确白名单谓词（2026-11-08，W3-G / 设计 P1.3 §2.4.3）：分类器与写守卫的**唯一实现**
//        （同一函数引用，防「只改分类器、写守卫仍拒」）；命中 id 稳定（`allow:readonly:git:<id>`）。
//        编排 trunk 的固定传输入口（`executeReadonlyGit`，I0-4）与运行时路由经本出口构造/消费，
//        **不得**复制 matcher 或另立第二份模板实现。
//   buildReadonlyGitBody(match: ReadonlyGitMatch): string[]
//     —— 规范 argv 体单一来源（审计 `readonlyGit.canonicalArgv` 必须与实际执行体一致，I0-7）。
//
// 私有实现（`gitQueryBody` 等）**不**经本出口导出；同仓测试可直接引用私有模块对照。

export { classifyShell, defaultShellRules, matchRoutineShellCommand, matchReadonlyGit, buildReadonlyGitBody } from "../../common/门禁引擎/classify-shell.ts";
export type { ReadonlyGitMatch, ReadonlyGitTemplate } from "../../common/门禁引擎/classify-shell.ts";
export { checkGitPolicy, computeGitPolicyDigest } from "../../common/门禁引擎/classify-shell.ts";
export type { GitPolicyFacts, GitPolicyResult, GitPolicyTemplate, GitPolicyDiffEntry, GitRawObjectPlan, GitAppGeneratedFile, GitBusinessPublication, GitRoleActivationPublication, GitStableInitialWorkflowSource, GitInitialWorkflowPublication, GitPolicyTreeEntry, GitDeliveryTaskSource, GitDeliveryIntegrationSource, GitRefPublicationPolicyPlan, GitDeliveryBasis } from "../../common/门禁引擎/classify-shell.ts";
export type { GitRawTreeEntry, RawTree, GitRawDiffEntry, GitRawObjectInput, GitRawStoredCommit, GitRawRevertCommit, GitRawRevertBasis, GitRawRevertConflict } from "../../model/trunk.ts";
export type { GitDeliveryRevertSource } from "../../common/门禁引擎/classify-shell.ts";

// —— B4.1（2026-11-10，T3 方案 v1.3 §6.2/§6.3 / AC-21 / T-09）：固定路径任务级 Git 写的公开出口 ——
// 供编排/运行时经 Service 出口合法消费（生产消费者不得导入本角色私有 `common/`，§6）。
// 全部为**逐字再导出**（同一函数引用/同一常量/同一类型）：规则与临界区门的唯一实现仍在
// `src/common/门禁引擎/classify-shell.ts` / `task-git-gate.ts`；本文件不复制实现、不另立规则集。
//   classifyShellDetailed(argv, rules, context?): ShellVerdict
//     —— v5 明细判定（`context.taskGitScope` 由应用注入；缺省 ⇒ 任务级 Git 写一律拒，fail-closed）。
//   matchTaskGit(argv, facts): TaskGitMatch | undefined
//     —— 任务级 Git 写 matcher（仅 `git add <literal paths ⊆ writeSet>` / `git commit -m`；唯一实现）。
//   runTaskGitCommit(input): Promise<TaskGitCommitGateResult>
//     —— 项目级临界区提交门（staged ⊆ writeSet 检查与提交同一锁；锁占用 ⇒ `git-critical-section-busy`）。
//   `TASK_GIT_STAGED_INSPECTION_ARGV` / `TASK_GIT_CODES` / `TASK_GIT_GATE_CODES`
//     —— 固定检查 argv 与稳定失败码（常量再导出；消费者不得另抄一份）。
export { classifyShellDetailed, matchTaskGit, TASK_GIT_CODES } from "../../common/门禁引擎/classify-shell.ts";
export type { ShellClassifyContext, ShellVerdict, TaskGitScope, TaskGitTemplate, TaskGitMatch, TaskGitAuditFacts } from "../../common/门禁引擎/classify-shell.ts";
export { runTaskGitCommit, TASK_GIT_STAGED_INSPECTION_ARGV, TASK_GIT_GATE_CODES } from "../../common/门禁引擎/task-git-gate.ts";
export type { TaskGitCommitGateInput, TaskGitCommitGateResult, TaskGitCriticalSectionAcquire } from "../../common/门禁引擎/task-git-gate.ts";

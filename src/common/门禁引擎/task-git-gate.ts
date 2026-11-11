// src/common/门禁引擎/task-git-gate.ts
// B4（2026-11-10，T3 方案 v1.3 §6.2/§6.3 / AC-21 / T-09）：固定路径 `git commit` 的**项目级临界区门**。
//
// 规则层（`classify-shell.ts` v5 `matchTaskGit`）只判**形状**；真正提交前还必须核**内容**（§6.3）：
//   1. 当前分支 = `ans/task/<workflowId>`（非任务分支 ⇒ `git-branch-mismatch`）；
//   2. `git diff --cached --name-only -z` 非空，且 staged 路径逐条**字面**、⊆ 任务 writeSet
//      （越界 ⇒ `git-staged-outside-writeset`；空 ⇒ `git-staged-empty`；非字面 ⇒ `git-staged-not-literal`）；
//   3. `.ans/**`、`角色卡/**`、`docs/audit/**`、`docs/acceptance/**` 等治理写区不得 staged
//      （⇒ `git-staged-governance-path`；角色 shell 不得代写应用账本/审计/验收归档/角色卡）；
//   4. 检查与 `git commit` 在**同一项目级临界区**内完成（锁贯穿检查与提交，避免检查-提交间隙；
//      锁占用 ⇒ `git-critical-section-busy`，**不排队、不提交**）；
//   5. `commitArgv` 必须本身通过规则层 `matchTaskGit` 的 **commit** 形态（纵深：执行层传错 argv 也不放行）。
//
// 本模块**不做 IO、不 spawn**：锁、staged 读取、commit 执行全部由调用方**注入**——
//   · `acquire`：生产注入桌面同一把 `acquireProjectGitCriticalSection(projectRoot, owner)`（B3 已提交），
//     确保发布合并与 shell 提交共用同一项目级临界区；
//   · `inspectStaged`：在锁内执行固定 argv `TASK_GIT_STAGED_INSPECTION_ARGV` 并返回路径数组；
//   · `commit`：在锁内执行规则层允许的固定 argv。
// 纯编排 + 注入使并发/失败路径可确定性测试（fake 锁/fake 读取，不触碰真实 Git）。
//
// 提交失败/检查异常 ⇒ **释放锁后如实抛出**（不吞错、不伪装成功）；成功 ⇒ 返回 staged 路径供审计。

import {
  matchTaskGit,
  taskGitPathCovered,
  taskGitScopeError,
  isTaskGitGovernancePath,
  isTaskGitLiteralPath,
  type TaskGitMatch,
  type TaskGitScope,
} from "./classify-shell.ts";

/** staged 检查的固定 argv（应用执行；模型不可自报；与 §6.2/§6.3 一致）。 */
export const TASK_GIT_STAGED_INSPECTION_ARGV: readonly string[] = Object.freeze([
  "diff",
  "--cached",
  "--name-only",
  "-z",
]);

/** 临界区门稳定失败码（Git 写拒绝面；新增/改名走接口评审）。 */
export const TASK_GIT_GATE_CODES = Object.freeze({
  branchMismatch: "git-branch-mismatch",
  criticalSectionBusy: "git-critical-section-busy",
  stagedEmpty: "git-staged-empty",
  stagedNotLiteral: "git-staged-not-literal",
  stagedGovernancePath: "git-staged-governance-path",
  stagedOutsideWriteSet: "git-staged-outside-writeset",
});

/** 解析 `git diff --cached --name-only -z` 输出：NUL 分隔、丢弃空段（路径为原样项目相对路径）。 */
export function parseTaskGitStagedOutput(raw: string | Uint8Array): string[] {
  const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8");
  return text.split("\0").filter((segment) => segment !== "");
}

/** staged 集合内容校验（纯函数；返回首个违规类别的稳定码与全部同类违规路径）。 */
export function validateTaskGitStagedPaths(
  staged: readonly string[],
  scope: TaskGitScope,
): { ok: true } | { ok: false; code: string; paths: string[] } {
  const paths = [...staged];
  if (paths.length === 0) return { ok: false, code: TASK_GIT_GATE_CODES.stagedEmpty, paths: [] };
  const notLiteral = paths.filter((path) => !isTaskGitLiteralPath(path));
  if (notLiteral.length > 0) return { ok: false, code: TASK_GIT_GATE_CODES.stagedNotLiteral, paths: notLiteral };
  const governance = paths.filter((path) => isTaskGitGovernancePath(path));
  if (governance.length > 0) return { ok: false, code: TASK_GIT_GATE_CODES.stagedGovernancePath, paths: governance };
  const outside = paths.filter((path) => !taskGitPathCovered(path, scope.paths));
  if (outside.length > 0) return { ok: false, code: TASK_GIT_GATE_CODES.stagedOutsideWriteSet, paths: outside };
  return { ok: true };
}

/** 注入的临界区取锁接口（占用返回 `undefined`；返回的释放函数须幂等）。 */
export type TaskGitCriticalSectionAcquire = (owner: string) => (() => void) | undefined;

export interface TaskGitCommitGateInput<T> {
  /** 任务级写事实（由应用从团队计划/B2 派生写集构造；模型不可自报）。 */
  readonly scope: TaskGitScope;
  /** 应用读取的当前分支（`git rev-parse --abbrev-ref HEAD` 或等价事实）。 */
  readonly currentBranch: string;
  /** 待执行的 commit argv（必须命中规则层 commit 形态；执行层随后逐字 spawn）。 */
  readonly commitArgv: readonly string[];
  /** 项目级临界区取锁（生产 = 与发布合并同一把锁）。 */
  readonly acquire: TaskGitCriticalSectionAcquire;
  /** 锁内读取 staged 路径（固定 argv 见 `TASK_GIT_STAGED_INSPECTION_ARGV`）。 */
  readonly inspectStaged: () => Promise<readonly string[]> | readonly string[];
  /** 锁内执行提交（只应执行 `commitArgv`）。 */
  readonly commit: () => Promise<T> | T;
}

export type TaskGitCommitGateResult<T> =
  | { readonly ok: true; readonly value: T; readonly stagedPaths: readonly string[]; readonly match: TaskGitMatch }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly stagedPaths?: readonly string[] };

/**
 * 在项目级临界区内完成「staged ⊆ writeSet 检查 + commit」。
 * 纯编排、无 IO（全部注入）；锁占用/前置不满足 ⇒ fail-closed 返回稳定码；检查/提交异常释放锁后抛出。
 */
export async function runTaskGitCommit<T>(input: TaskGitCommitGateInput<T>): Promise<TaskGitCommitGateResult<T>> {
  const scopeErr = taskGitScopeError(input.scope);
  if (scopeErr !== undefined) {
    return { ok: false, code: scopeErr, message: `任务写事实不可用（fail-closed）：${scopeErr}；未提交。` };
  }
  const match = matchTaskGit(input.commitArgv, input.scope);
  if (match === undefined || match.template !== "commit") {
    return {
      ok: false,
      code: "git-commit-form-forbidden",
      message: "commit argv 未命中任务级 Git 写白名单（仅允许 git commit -m <message>）；未提交。",
    };
  }
  if (typeof input.currentBranch !== "string" || input.currentBranch !== input.scope.branch) {
    return {
      ok: false,
      code: TASK_GIT_GATE_CODES.branchMismatch,
      message: `当前分支 ${String(input.currentBranch)} != 任务分支 ${input.scope.branch}；未提交。`,
    };
  }
  const release = input.acquire(`shell-commit:${input.scope.taskId}`);
  if (release === undefined) {
    return {
      ok: false,
      code: TASK_GIT_GATE_CODES.criticalSectionBusy,
      message: "项目级 Git 临界区被占用（并发合并/提交）；未提交（不排队、fail-closed）。",
    };
  }
  try {
    // 锁内：先检查 staged（检查与提交之间无释放点 ⇒ 无检查-提交间隙）。
    const staged = await input.inspectStaged();
    const validation = validateTaskGitStagedPaths(staged, input.scope);
    if (!validation.ok) {
      const detail = validation.paths.length > 0 ? `：${validation.paths.slice(0, 10).join(", ")}` : "";
      return { ok: false, code: validation.code, message: `staged 检查未通过（${validation.code}）${detail}；未提交。`, stagedPaths: validation.paths };
    }
    const value = await input.commit();
    return { ok: true, value, stagedPaths: [...staged], match };
  } finally {
    // 成功、前置失败与异常三条路径都释放；释放函数幂等。
    release();
  }
}

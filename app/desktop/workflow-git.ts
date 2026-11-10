// app/desktop/workflow-git.ts
// T3「两条固定工作流路径」B1（2026-11-10，桌面窗口）：git init / `.gitignore` / 合并 main 的
// **端口骨架**（业务实现在 B3；B1 只保证可类型化、fail-closed、无副作用、无 UI 改版）。
//
// 依据：实现级方案 v1.3 §5.2（git init -b main / ans-managed `.gitignore` 块 / baseline commit）、
// §4.3（路径 B 既有仓库/任务分支最小准备）、§6.4（合并 main：应用执行、客户本人确认、judge 不可代批）、
// §8.4；B1 验收 AC-14/AC-22（运行时面 B3）、AC-27 Q5。
//
// 纪律：
//  · **B1 不执行任何 git 命令**：`createWorkflowGitPort()` 的缺省实现全部 fail-closed 返回
//    `workflow-git-unavailable`，零文件、零进程、零账本副作用；B3 注入真实实现后才生效。
//  · 合并 main **只经应用**（不经 shell）；固定 argv/sanitize 环境、冲突只 `merge --abort` 回任务分支、
//    不 force/reset/clean、不 push/tag/发布产物（B3 实现；本层只钉接口与失败码）。
//  · `merge-main` **必须客户本人**：`mergeMainConfirmationError` 把 judge/缺省一律判为未授权
//    （G-IR MF-IR-8：不新增 `requestReleaseMerge`；卡由应用构造）。
//  · 失败码与 v1.3 §5.5/附录 C/AC-14/AC-22 一致；本层不发明第二套码值。

/** 端口失败码（v1.3 §5.5/§6.4/附录 C；AC-14/AC-16/AC-22）。 */
export type WorkflowGitFailureCode =
  | "b-repository-required"
  | "baseline-git-init-failed"
  | "baseline-parent-repository-detected"
  | "baseline-repository-dirty"
  | "baseline-gitignore-dirty"
  | "baseline-branch-exists"
  | "release-workflow-not-ready"
  | "release-unauthorized"
  | "release-main-busy"
  | "release-merge-conflict"
  | "release-already-merged"
  | "release-rejected"
  | "git-command-not-ordinary"
  /** B1 端口骨架缺省实现（B3 注入真实实现前一律 fail-closed）。 */
  | "workflow-git-unavailable";

export interface WorkflowGitFailure {
  readonly ok: false;
  readonly code: WorkflowGitFailureCode;
  readonly message: string;
  readonly missing?: readonly string[];
}

function fail(code: WorkflowGitFailureCode, message: string, missing?: readonly string[]): WorkflowGitFailure {
  return { ok: false, code, message, ...(missing !== undefined ? { missing } : {}) };
}

/** `git init -b main` 或缺省 tag 的幂等结果：既有仓库（含 worktree `.git` 文件）按 existing 原样保留。 */
export type WorkflowGitRepositoryState = "initialized" | "existing";

export interface EnsureRepositoryRequest {
  readonly projectRoot: string;
}
export type EnsureRepositoryResult =
  | { readonly ok: true; readonly state: WorkflowGitRepositoryState; readonly branch: string }
  | WorkflowGitFailure;

/** ans-managed `.gitignore` 托管块（条目单一来源 = 编排 `workflow-service.ts::ANS_GITIGNORE_ENTRIES`）。 */
export interface EnsureGitignoreRequest {
  readonly projectRoot: string;
}
export type EnsureGitignoreResult =
  | { readonly ok: true; readonly changed: boolean; readonly sha256: string }
  | WorkflowGitFailure;

/** 任务分支 `ans/task/<workflowId>`：同一 workflow 可复用自有分支；同名他属分支 ⇒ `baseline-branch-exists`。 */
export interface PrepareTaskBranchRequest {
  readonly projectRoot: string;
  readonly workflowId: string;
  /** 路径 B 从当前 HEAD 创建（不强制 main）；缺省 = 当前 HEAD。 */
  readonly base?: "head" | "main";
}
export type PrepareTaskBranchResult =
  | { readonly ok: true; readonly branch: string; readonly baseOid: string; readonly reused: boolean }
  | WorkflowGitFailure;

/**
 * 合并 main 的客户确认**唯一有效来源**（AC-14/T-15）：`by` 只允许 `customer`。
 * judge/模型/指令来源一律未授权（judge 只能转人工/拒绝，不得 approve、不得冒充客户）。
 */
export interface MergeMainConfirmation {
  readonly by: "customer" | "judge";
  readonly decisionId?: string;
  readonly at?: string;
}

/**
 * 纯校验：合并执行前必须持客户本人确认。缺省/`judge`/非 customer ⇒ `release-unauthorized`
 * （fail-closed；不产生第二来源、不默认通过）。B3 在呈卡与执行前调用。
 */
export function mergeMainConfirmationError(
  confirmation: MergeMainConfirmation | undefined,
): WorkflowGitFailure | undefined {
  if (confirmation === undefined || confirmation.by !== "customer") {
    return fail(
      "release-unauthorized",
      "合并 main 未被授权：必须由客户本人在 merge-main 高风险确认卡上确认；judge 只能转人工/拒绝，不得代批。",
      ["customer-confirmation"],
    );
  }
  return undefined;
}

/** `merge-main` preview 必含字段（AC-14；应用构造，模型不可自报；B3 呈现）。 */
export interface MergeMainPreview {
  readonly workflowId: string;
  readonly flowId: string;
  /** main 当前 OID；main unborn ⇒ null（`mergeKind:"initial"`）。 */
  readonly mainBaseOid: string | null;
  readonly branchTipOid: string;
  readonly fileCount: number;
  readonly diffStat: string;
  readonly mergeKind: "merge" | "initial";
  readonly highRiskNotes: readonly string[];
}

export interface MergeMainRequest {
  readonly projectRoot: string;
  readonly workflowId: string;
  readonly flowId: string;
  readonly branch: string;
  readonly tipOid: string;
  readonly preview: MergeMainPreview;
  /** 客户本人确认（缺失/judge ⇒ `release-unauthorized`，不进入执行）。 */
  readonly confirmation?: MergeMainConfirmation;
}

export interface MergeMainFileChange {
  readonly path: string;
  readonly status: string;
}

/** `release.merged` 回执（AC-22；幂等 `release:<workflowId>:<tipOid>`；不 push/tag）。 */
export interface MergeMainResult {
  readonly ok: true;
  readonly mergeKind: "merge" | "initial";
  readonly baseOid: string | null;
  readonly tipOid: string;
  readonly mergeOid: string;
  readonly files: readonly MergeMainFileChange[];
  readonly diffDigest: string;
}

/**
 * 工作流 Git 端口（B3 注入真实实现）。B1 缺省实现 = 全 fail-closed 桩：
 * 可类型化、可被测试断言「未执行任何 git 副作用」。
 */
export interface WorkflowGitPort {
  ensureRepository(request: EnsureRepositoryRequest): Promise<EnsureRepositoryResult>;
  ensureGitignore(request: EnsureGitignoreRequest): Promise<EnsureGitignoreResult>;
  prepareTaskBranch(request: PrepareTaskBranchRequest): Promise<PrepareTaskBranchResult>;
  mergeMain(request: MergeMainRequest): Promise<MergeMainResult | WorkflowGitFailure>;
}

const unavailable = (operation: string): WorkflowGitFailure =>
  fail(
    "workflow-git-unavailable",
    `${operation} 未执行：B1 仅提供端口骨架，Git 业务由 B3 实现（fail-closed，零副作用）。`,
  );

/**
 * 构造工作流 Git 端口：B1 无实现 ⇒ 全 fail-closed；B3 以 `implementation` 注入真实业务。
 * 即使注入部分实现，未提供的操作仍 fail-closed（绝不回落 shell/默认 git）。
 */
export function createWorkflowGitPort(implementation?: Partial<WorkflowGitPort>): WorkflowGitPort {
  return {
    ensureRepository: implementation?.ensureRepository ?? (async () => unavailable("git init")),
    ensureGitignore: implementation?.ensureGitignore ?? (async () => unavailable(".gitignore")),
    prepareTaskBranch: implementation?.prepareTaskBranch ?? (async () => unavailable("任务分支准备")),
    mergeMain: implementation?.mergeMain ?? (async (request) => {
      // B1 骨架也必须先执行客户本人确认的纯校验（防止未来实现遗漏；judge/缺省 ⇒ 未授权）。
      return mergeMainConfirmationError(request.confirmation) ?? unavailable("合并 main");
    }),
  };
}

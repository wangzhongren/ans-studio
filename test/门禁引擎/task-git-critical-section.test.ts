// test/门禁引擎/task-git-critical-section.test.ts
// B4（2026-11-10，T3「两条固定工作流路径」；方案 v1.3 §6.2/§6.3；AC-21/T-09）：
// `git commit` 的项目级临界区门——锁贯穿「staged ⊆ writeSet 检查」与「提交」（同临界区、无检查-提交间隙）；
// 锁占用 ⇒ `git-critical-section-busy`（不排队、不提交）；staged 空/非字面/治理写区/越界逐项拒绝；
// 分支不符/commit argv 不合法在取锁前拒绝；检查或提交异常释放锁后如实抛出。
//
// 全部 fake/注入、确定性：不 spawn 真实 Git、不触碰文件系统。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TASK_GIT_GATE_CODES,
  TASK_GIT_STAGED_INSPECTION_ARGV,
  parseTaskGitStagedOutput,
  runTaskGitCommit,
  validateTaskGitStagedPaths,
  type TaskGitCommitGateInput,
} from "../../src/common/门禁引擎/task-git-gate.ts";
import { TASK_GIT_BRANCH_PREFIX, type TaskGitScope } from "../../src/common/门禁引擎/classify-shell.ts";

const WORKFLOW_ID = "wf-abcdef0123456789abcdef01";
const scope = (over: Partial<TaskGitScope> = {}): TaskGitScope => ({
  taskId: "task-1",
  workflowId: WORKFLOW_ID,
  branch: `${TASK_GIT_BRANCH_PREFIX}${WORKFLOW_ID}`,
  paths: ["src/impl/", "docs/proposals/foo-v1.md"],
  ...over,
});
const COMMIT_ARGV = ["git", "commit", "-m", "feat(impl): v5"];

/** 进程内 fake 锁：与桌面 `acquireProjectGitCriticalSection` 同语义（占用不排队；释放幂等）。 */
function fakeLock() {
  let owner: string | undefined;
  let releases = 0;
  return {
    acquire: (candidate: string): (() => void) | undefined => {
      if (owner !== undefined) return undefined;
      owner = candidate;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        releases += 1;
        if (owner === candidate) owner = undefined;
      };
    },
    owner: () => owner,
    releases: () => releases,
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function gateInput<T>(lock: ReturnType<typeof fakeLock>, over: Partial<TaskGitCommitGateInput<T>> = {}): TaskGitCommitGateInput<T> {
  return {
    scope: scope(),
    currentBranch: scope().branch,
    commitArgv: COMMIT_ARGV,
    acquire: lock.acquire,
    inspectStaged: () => ["src/impl/a.ts"],
    commit: () => "committed" as unknown as T,
    ...over,
  };
}

// ===========================================================================
// 1) 固定 argv / 输出解析
// ===========================================================================

test("staged 检查 argv 固定为 git diff --cached --name-only -z；NUL 输出解析", () => {
  assert.deepEqual([...TASK_GIT_STAGED_INSPECTION_ARGV], ["diff", "--cached", "--name-only", "-z"]);
  assert.deepEqual(parseTaskGitStagedOutput("src/a.ts\0src/b.ts\0"), ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(parseTaskGitStagedOutput("src/a.ts\0\0src/b.ts"), ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(parseTaskGitStagedOutput(Buffer.from("docs/proposals/x-v1.md\0", "utf8")), ["docs/proposals/x-v1.md"]);
  assert.deepEqual(parseTaskGitStagedOutput(""), []);
});

// ===========================================================================
// 2) staged 内容校验（纯函数矩阵）
// ===========================================================================

test("staged 校验：空/非字面/治理写区/越界逐项拒绝，合法子集通过", () => {
  const s = scope();
  assert.deepEqual(validateTaskGitStagedPaths([], s), { ok: false, code: TASK_GIT_GATE_CODES.stagedEmpty, paths: [] });
  for (const bad of ["../x", "/abs/x", "C:/x", "src\\impl\\a.ts", "src/*.ts", ":(glob)src/**", ".git/config"]) {
    const result = validateTaskGitStagedPaths([bad], s);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, TASK_GIT_GATE_CODES.stagedNotLiteral, bad);
      assert.deepEqual(result.paths, [bad]);
    }
  }
  for (const bad of [".ans/state/workflows.jsonl", "角色卡/X/boundary.yaml", "docs/audit/shell-gate.jsonl", "docs/acceptance/a-v1.md"]) {
    const result = validateTaskGitStagedPaths([bad], s);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, TASK_GIT_GATE_CODES.stagedGovernancePath, bad);
      assert.deepEqual(result.paths, [bad]);
    }
  }
  const outside = validateTaskGitStagedPaths(["src/impl/a.ts", "other/x.ts", "docs/proposals/bar-v1.md"], s);
  assert.equal(outside.ok, false);
  if (!outside.ok) {
    assert.equal(outside.code, TASK_GIT_GATE_CODES.stagedOutsideWriteSet);
    assert.deepEqual(outside.paths, ["other/x.ts", "docs/proposals/bar-v1.md"]);
  }
  assert.deepEqual(validateTaskGitStagedPaths(["src/impl/a.ts", "docs/proposals/foo-v1.md"], s), { ok: true });
});

// ===========================================================================
// 3) 成功路径：锁贯穿检查与提交，成功后释放
// ===========================================================================

test("runTaskGitCommit：锁在 staged 检查与提交期间均被持有（同一临界区），成功后释放", async () => {
  const lock = fakeLock();
  const order: string[] = [];
  let ownerDuringInspect: string | undefined;
  let ownerDuringCommit: string | undefined;
  const result = await runTaskGitCommit(gateInput<string>(lock, {
    inspectStaged: () => {
      order.push("inspect");
      ownerDuringInspect = lock.owner();
      return ["src/impl/a.ts", "docs/proposals/foo-v1.md"];
    },
    commit: () => {
      order.push("commit");
      ownerDuringCommit = lock.owner();
      return "committed";
    },
  }));
  assert.deepEqual(order, ["inspect", "commit"], "检查先于提交且无释放点");
  assert.equal(ownerDuringInspect, "shell-commit:task-1", "检查时持有项目级临界区");
  assert.equal(ownerDuringCommit, "shell-commit:task-1", "提交时仍持同一临界区（无检查-提交间隙）");
  assert.equal(lock.owner(), undefined, "成功后释放");
  assert.equal(lock.releases(), 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value, "committed");
    assert.deepEqual(result.stagedPaths, ["src/impl/a.ts", "docs/proposals/foo-v1.md"]);
    assert.equal(result.match.template, "commit");
  }
});

// ===========================================================================
// 4) 前置失败：取锁前拒绝（不触碰锁/检查/提交）
// ===========================================================================

test("runTaskGitCommit：commit argv 非 -m 单形态/分支不符/scope 非法 ⇒ 取锁前拒绝", async () => {
  const lock = fakeLock();
  let touched = 0;
  const neverInspect = () => {
    touched += 1;
    return ["src/impl/a.ts"];
  };
  const neverCommit = () => {
    touched += 1;
    return "x";
  };

  const badArgv = await runTaskGitCommit(gateInput(lock, { commitArgv: ["git", "add", "src/impl/a.ts"], inspectStaged: neverInspect, commit: neverCommit }));
  assert.equal(badArgv.ok, false);
  if (!badArgv.ok) assert.equal(badArgv.code, "git-commit-form-forbidden");

  const amend = await runTaskGitCommit(gateInput(lock, { commitArgv: ["git", "commit", "--amend", "-m", "x"], inspectStaged: neverInspect, commit: neverCommit }));
  assert.equal(amend.ok, false);
  if (!amend.ok) assert.equal(amend.code, "git-commit-form-forbidden");

  const branch = await runTaskGitCommit(gateInput(lock, { currentBranch: "main", inspectStaged: neverInspect, commit: neverCommit }));
  assert.equal(branch.ok, false);
  if (!branch.ok) assert.equal(branch.code, TASK_GIT_GATE_CODES.branchMismatch);

  for (const badScope of [scope({ taskId: "" }), scope({ branch: "main" }), scope({ paths: [] })]) {
    const result = await runTaskGitCommit(gateInput(lock, { scope: badScope, currentBranch: badScope.branch, inspectStaged: neverInspect, commit: neverCommit }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "git-task-scope-invalid");
  }
  const missing = await runTaskGitCommit({ ...gateInput(lock, { inspectStaged: neverInspect, commit: neverCommit }), scope: undefined as never });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "git-task-scope-missing");

  assert.equal(touched, 0, "取锁前拒绝不触碰检查/提交");
  assert.equal(lock.owner(), undefined);
  assert.equal(lock.releases(), 0, "未取锁则不释放");
});

// ===========================================================================
// 5) 临界区占用：busy（不排队、不检查、不提交）
// ===========================================================================

test("runTaskGitCommit：项目级临界区被占用 ⇒ git-critical-section-busy，未检查/未提交", async () => {
  const lock = fakeLock();
  const release = lock.acquire("release-main:wf");
  assert.ok(release, "fixture 先占锁");
  let touched = 0;
  const result = await runTaskGitCommit(gateInput(lock, {
    inspectStaged: () => {
      touched += 1;
      return ["src/impl/a.ts"];
    },
    commit: () => {
      touched += 1;
      return "x";
    },
  }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, TASK_GIT_GATE_CODES.criticalSectionBusy);
    assert.match(result.message, /临界区/);
  }
  assert.equal(touched, 0);
  release!();
  assert.equal(lock.owner(), undefined);
});

// ===========================================================================
// 6) staged 失败：拒绝提交并释放锁
// ===========================================================================

test("runTaskGitCommit：staged 空/越界/治理写区/非字面 ⇒ 稳定码拒绝且不提交（锁释放）", async () => {
  const cases: Array<[string[], string]> = [
    [[], TASK_GIT_GATE_CODES.stagedEmpty],
    [["other/x.ts"], TASK_GIT_GATE_CODES.stagedOutsideWriteSet],
    [["src/impl/a.ts", "../escape.ts"], TASK_GIT_GATE_CODES.stagedNotLiteral],
    [["角色卡/X/boundary.yaml"], TASK_GIT_GATE_CODES.stagedGovernancePath],
    [[".ans/state/workflows.jsonl"], TASK_GIT_GATE_CODES.stagedGovernancePath],
  ];
  for (const [staged, code] of cases) {
    const lock = fakeLock();
    let committed = false;
    const result = await runTaskGitCommit(gateInput(lock, {
      inspectStaged: () => staged,
      commit: () => {
        committed = true;
        return "x";
      },
    }));
    assert.equal(result.ok, false, staged.join(","));
    if (!result.ok) {
      assert.equal(result.code, code, staged.join(","));
      assert.ok((result.stagedPaths?.length ?? 0) > 0 || code === TASK_GIT_GATE_CODES.stagedEmpty);
    }
    assert.equal(committed, false, "前置失败不得提交");
    assert.equal(lock.owner(), undefined, "失败也释放锁");
    assert.equal(lock.releases(), 1);
  }
});

// ===========================================================================
// 7) 异常路径：检查/提交异常释放锁后如实抛出
// ===========================================================================

test("runTaskGitCommit：inspectStaged/commit 抛错 ⇒ 释放锁后抛出原错误（不吞错）", async () => {
  const lock1 = fakeLock();
  const inspectError = new Error("inspect boom");
  await assert.rejects(
    runTaskGitCommit(gateInput(lock1, { inspectStaged: () => { throw inspectError; } })),
    (error) => error === inspectError,
  );
  assert.equal(lock1.owner(), undefined);
  assert.equal(lock1.releases(), 1);

  const lock2 = fakeLock();
  const commitError = new Error("commit boom");
  await assert.rejects(
    runTaskGitCommit(gateInput(lock2, { commit: () => { throw commitError; } })),
    (error) => error === commitError,
  );
  assert.equal(lock2.owner(), undefined);
  assert.equal(lock2.releases(), 1);
});

// ===========================================================================
// 8) 并发确定性：同一项目临界区下第二个提交 busy（不排队、不提交）
// ===========================================================================

test("runTaskGitCommit：并发提交同一项目 ⇒ 第二个 busy，第一个完成后释放", async () => {
  const lock = fakeLock();
  const entered = deferred();
  const hold = deferred();
  let firstCommitted = false;

  const first = runTaskGitCommit(gateInput(lock, {
    commit: async () => {
      firstCommitted = true;
      entered.resolve();
      await hold.promise;
      return "first";
    },
  }));
  await entered.promise; // 第一个已取锁并在提交中
  assert.equal(lock.owner(), "shell-commit:task-1");

  let secondTouched = false;
  const second = await runTaskGitCommit(gateInput(lock, {
    inspectStaged: () => {
      secondTouched = true;
      return ["src/impl/a.ts"];
    },
    commit: () => {
      secondTouched = true;
      return "second";
    },
  }));
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, TASK_GIT_GATE_CODES.criticalSectionBusy);
  assert.equal(secondTouched, false, "busy 时不排队、不检查、不提交");

  hold.resolve();
  const firstResult = await first;
  assert.equal(firstResult.ok, true);
  assert.equal(firstCommitted, true);
  assert.equal(lock.owner(), undefined, "第一个完成后释放，后续可再取锁");
  assert.equal(lock.releases(), 1);
});

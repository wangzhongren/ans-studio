// test/门禁引擎/shell-rules-b4-reexport.test.ts
// B4.1（2026-11-10，T3「两条固定工作流路径」；方案 v1.3 §6.2/§6.3；B1 验收 AC-21/T-09）：
// Service 公开出口 `src/service/gate/shell-rules.ts` 对 B4 符号的**逐字再导出**取证——
// `classifyShellDetailed` / `matchTaskGit` / `runTaskGitCommit` 及任务级 Git 写类型/常量
// 必须经公开出口可用（同一函数引用/同一常量），供编排/运行时合法消费（生产消费者不得导入私有 `common/`）。
//
// 纪律：不新增 skip/force-exit；纯函数与 fake 注入（锁/staged 读取/提交全部假件，不触碰真实 Git）。
// 测试可读引用私有模块作同源性对照；生产消费者只可用公开出口。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// 公开出口（被测）
import {
  TASK_GIT_CODES,
  TASK_GIT_GATE_CODES,
  TASK_GIT_STAGED_INSPECTION_ARGV,
  classifyShellDetailed,
  defaultShellRules,
  matchTaskGit,
  runTaskGitCommit,
  type ShellClassifyContext,
  type ShellVerdict,
  type TaskGitAuditFacts,
  type TaskGitCommitGateInput,
  type TaskGitCommitGateResult,
  type TaskGitCriticalSectionAcquire,
  type TaskGitMatch,
  type TaskGitScope,
  type TaskGitTemplate,
} from "../../src/service/gate/shell-rules.ts";
// 私有源（同源性对照；仅供测试）
import * as priv from "../../src/common/门禁引擎/classify-shell.ts";
import * as gate from "../../src/common/门禁引擎/task-git-gate.ts";

const rules = defaultShellRules();
const WORKFLOW_ID = "wf-0123456789abcdef01234567";
const TASK_BRANCH = `ans/task/${WORKFLOW_ID}`;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const scope = (over: Partial<TaskGitScope> = {}): TaskGitScope => ({
  taskId: "task-0001",
  workflowId: WORKFLOW_ID,
  branch: TASK_BRANCH,
  paths: ["src/impl/", "docs/proposals/foo-v1.md"],
  ...over,
});

// ===========================================================================
// 1) 同源性：公开出口 = 私有源同一函数引用/同一常量（逐字转出，非复制实现）
// ===========================================================================

test("B4 再导出同源：classifyShellDetailed/matchTaskGit/runTaskGitCommit 与常量均为同一引用", () => {
  assert.equal(classifyShellDetailed, priv.classifyShellDetailed, "classifyShellDetailed 必须是同一函数引用");
  assert.equal(matchTaskGit, priv.matchTaskGit, "matchTaskGit 必须是同一函数引用（唯一实现，不复制规则）");
  assert.equal(runTaskGitCommit, gate.runTaskGitCommit, "runTaskGitCommit 必须是同一函数引用（临界区门唯一实现）");
  assert.equal(TASK_GIT_CODES, priv.TASK_GIT_CODES, "TASK_GIT_CODES 必须是同一冻结常量对象");
  assert.equal(TASK_GIT_GATE_CODES, gate.TASK_GIT_GATE_CODES, "TASK_GIT_GATE_CODES 必须是同一冻结常量对象");
  assert.equal(
    TASK_GIT_STAGED_INSPECTION_ARGV,
    gate.TASK_GIT_STAGED_INSPECTION_ARGV,
    "固定 staged 检查 argv 必须是同一冻结数组（消费者不得另抄一份）",
  );
  assert.deepEqual([...TASK_GIT_STAGED_INSPECTION_ARGV], ["diff", "--cached", "--name-only", "-z"]);
});

// ===========================================================================
// 2) classifyShellDetailed 经公开出口可调用：允许面 + 审计描述（类型经出口消费）
// ===========================================================================

test("公开出口 classifyShellDetailed：注入 taskGitScope 后 add/commit 允许并携带审计描述", () => {
  const context: ShellClassifyContext = { taskGitScope: scope() };
  const addVerdict: ShellVerdict = classifyShellDetailed(["git", "add", "src/impl/a.ts"], rules, context);
  assert.equal(addVerdict.decision, "allow");
  assert.equal(addVerdict.ruleId, "allow:task-git:add");
  assert.ok(addVerdict.taskGit, "允许面必须携带 taskGit 审计描述");
  const addAudit: TaskGitAuditFacts = addVerdict.taskGit;
  assert.equal(addAudit.result, "allowed");
  const addTemplate: TaskGitTemplate | "other" = addAudit.template;
  assert.equal(addTemplate, "add");
  assert.equal(addAudit.taskId, "task-0001");
  assert.equal(addAudit.workflowId, WORKFLOW_ID);
  assert.equal(addAudit.branch, TASK_BRANCH);
  assert.deepEqual([...addAudit.paths], ["src/impl/a.ts"]);
  assert.equal(addAudit.code, undefined);
  assert.match(addAudit.argvDigest, /^[a-f0-9]{64}$/);
  assert.equal(addAudit.argvDigest, sha256(JSON.stringify(["git", "add", "src/impl/a.ts"])));

  const message = "feat: fixed path change";
  const commitVerdict: ShellVerdict = classifyShellDetailed(["git", "commit", "-m", message], rules, context);
  assert.equal(commitVerdict.decision, "allow");
  assert.equal(commitVerdict.ruleId, "allow:task-git:commit");
  assert.equal(commitVerdict.taskGit?.template, "commit");
  assert.equal(commitVerdict.taskGit?.messageSha256, sha256(message), "commit message 仅落 SHA-256");
  assert.ok(!("message" in (commitVerdict.taskGit as object)), "审计描述不落 message 明文");

  // 2 参旧调用逐字保持 v4 行为：无 scope ⇒ 任务级 Git 写一律拒（既有消费者不回归）。
  const bare = classifyShellDetailed(["git", "add", "src/impl/a.ts"], rules);
  assert.equal(bare.decision, "deny");
  assert.equal(bare.ruleId, "deny:raw-git-controlled-tools-required");
  assert.equal(bare.code, TASK_GIT_CODES.scopeMissing);
});

test("公开出口 classifyShellDetailed：无/非法 scope、flag/非字面/越界/治理写区、commit 形态与普通 Git 均拒绝", () => {
  const denied: { argv: string[]; code: string }[] = [
    { argv: ["git", "add", "-A"], code: TASK_GIT_CODES.addFlagForbidden },
    { argv: ["git", "add", "./src/impl/a.ts"], code: TASK_GIT_CODES.addNotLiteral },
    { argv: ["git", "add", "src/*.ts"], code: TASK_GIT_CODES.addNotLiteral },
    { argv: ["git", "add", "other/x.ts"], code: TASK_GIT_CODES.pathOutsideWriteSet },
    { argv: ["git", "add", ".ans/state/x.json"], code: TASK_GIT_CODES.pathGovernance },
    { argv: ["git", "commit", "-F", "-"], code: TASK_GIT_CODES.commitArgumentForbidden },
    { argv: ["git", "commit", "--amend"], code: TASK_GIT_CODES.commitArgumentForbidden },
    { argv: ["git", "commit", "-m", "   "], code: TASK_GIT_CODES.commitMessageEmpty },
    { argv: ["git", "push"], code: TASK_GIT_CODES.commandNotOrdinary },
    { argv: ["git", "reset", "--hard"], code: TASK_GIT_CODES.commandNotOrdinary },
  ];
  for (const { argv, code } of denied) {
    const verdict = classifyShellDetailed(argv, rules, { taskGitScope: scope() });
    assert.equal(verdict.decision, "deny", argv.join(" "));
    assert.equal(verdict.ruleId, "deny:raw-git-controlled-tools-required", argv.join(" "));
    assert.equal(verdict.code, code, argv.join(" "));
    assert.equal(verdict.taskGit?.result, "denied", argv.join(" "));
    assert.equal(verdict.taskGit?.code, code, argv.join(" "));
  }
  // 无 scope / 非法 scope（空 writeSet）⇒ 稳定失败码，不进入形状判定。
  assert.equal(classifyShellDetailed(["git", "add", "src/impl/a.ts"], rules).code, TASK_GIT_CODES.scopeMissing);
  assert.equal(classifyShellDetailed(["git", "commit", "-m", "x"], rules, { taskGitScope: scope({ paths: [] }) }).code, TASK_GIT_CODES.scopeInvalid);
  assert.equal(classifyShellDetailed(["git", "add", "src/impl/a.ts"], rules, { taskGitScope: scope({ branch: "main" }) }).code, TASK_GIT_CODES.scopeInvalid);
});

// ===========================================================================
// 3) matchTaskGit 经公开出口可调用：纯函数允许/拒绝矩阵与确定性
// ===========================================================================

test("公开出口 matchTaskGit：add/commit 命中受限描述；无 scope/非白名单恒 undefined；同输入确定性", () => {
  const addMatch: TaskGitMatch | undefined = matchTaskGit(["git", "add", "src/impl/a.ts", "docs/proposals/foo-v1.md"], scope());
  assert.ok(addMatch);
  assert.equal(addMatch.template, "add");
  assert.deepEqual([...addMatch.paths], ["src/impl/a.ts", "docs/proposals/foo-v1.md"]);
  assert.equal(addMatch.taskId, "task-0001");
  assert.equal(addMatch.workflowId, WORKFLOW_ID);
  assert.equal(addMatch.branch, TASK_BRANCH);
  assert.match(addMatch.argvDigest, /^[a-f0-9]{64}$/);

  const commitMatch = matchTaskGit(["git", "commit", "-m", "x"], scope());
  assert.equal(commitMatch?.template, "commit");
  assert.equal(commitMatch?.message, "x");
  assert.deepEqual([...commitMatch!.paths], []);

  assert.equal(matchTaskGit(["git", "add", "src/impl/a.ts"], undefined), undefined);
  assert.equal(matchTaskGit(["git", "add", "src/impl/a.ts"], null), undefined);
  assert.equal(matchTaskGit(["git", "add", "-A"], scope()), undefined);
  assert.equal(matchTaskGit(["git", "push"], scope()), undefined);
  assert.deepEqual(matchTaskGit(["git", "add", "src/impl/a.ts"], scope()), matchTaskGit(["git", "add", "src/impl/a.ts"], scope()));
});

// ===========================================================================
// 4) runTaskGitCommit 经公开出口可调用：fake 锁/staged 读取/提交（不触碰真实 Git）
// ===========================================================================

test("公开出口 runTaskGitCommit：staged ⊆ writeSet ⇒ 同锁内检查并提交，finally 释放", async () => {
  const events: string[] = [];
  let held = false;
  const acquire: TaskGitCriticalSectionAcquire = (owner) => {
    events.push(`acquire:${owner}`);
    held = true;
    return () => {
      events.push("release");
      held = false;
    };
  };
  const input: TaskGitCommitGateInput<string> = {
    scope: scope(),
    currentBranch: TASK_BRANCH,
    commitArgv: ["git", "commit", "-m", "feat: change"],
    acquire,
    inspectStaged: () => {
      assert.equal(held, true, "staged 读取必须发生在锁内");
      events.push("inspect");
      return ["src/impl/a.ts"];
    },
    commit: () => {
      assert.equal(held, true, "提交必须发生在同一锁内（无检查-提交间隙）");
      events.push("commit");
      return "commit-sha";
    },
  };
  const result: TaskGitCommitGateResult<string> = await runTaskGitCommit(input);
  if (result.ok) {
    assert.equal(result.value, "commit-sha");
    assert.deepEqual([...result.stagedPaths], ["src/impl/a.ts"]);
    assert.equal(result.match.template, "commit");
    assert.equal(result.match.taskId, "task-0001");
  } else {
    assert.fail(`合法提交不应被拒：${result.code} ${result.message}`);
  }
  assert.deepEqual(events, ["acquire:shell-commit:task-0001", "inspect", "commit", "release"]);
  assert.equal(held, false, "成功路径必须释放锁");
});

test("公开出口 runTaskGitCommit：锁占用/分支不符/argv 非 commit 形态/scope 非法 ⇒ fail-closed 且不提交", async () => {
  // 锁占用：不排队、不读 staged、不提交。
  {
    let inspected = false;
    const result = await runTaskGitCommit({
      scope: scope(),
      currentBranch: TASK_BRANCH,
      commitArgv: ["git", "commit", "-m", "x"],
      acquire: () => undefined,
      inspectStaged: () => {
        inspected = true;
        return ["src/impl/a.ts"];
      },
      commit: () => assert.fail("锁占用时不得提交"),
    });
    if (result.ok) assert.fail("锁占用必须拒绝");
    assert.equal(result.code, TASK_GIT_GATE_CODES.criticalSectionBusy);
    assert.equal(inspected, false);
  }
  // 分支不符：取锁前拒绝。
  {
    let acquired = false;
    const result = await runTaskGitCommit({
      scope: scope(),
      currentBranch: "main",
      commitArgv: ["git", "commit", "-m", "x"],
      acquire: () => {
        acquired = true;
        return () => {};
      },
      inspectStaged: () => assert.fail("分支不符时不得读取 staged"),
      commit: () => assert.fail("分支不符时不得提交"),
    });
    if (result.ok) assert.fail("分支不符必须拒绝");
    assert.equal(result.code, TASK_GIT_GATE_CODES.branchMismatch);
    assert.equal(acquired, false);
  }
  // commit argv 未命中规则层 commit 形态（纵深）：`-F -` 一律拒。
  {
    const result = await runTaskGitCommit({
      scope: scope(),
      currentBranch: TASK_BRANCH,
      commitArgv: ["git", "commit", "-F", "-"],
      acquire: () => assert.fail("argv 非法时不得取锁"),
      inspectStaged: () => assert.fail("argv 非法时不得读取 staged"),
      commit: () => assert.fail("argv 非法时不得提交"),
    });
    if (result.ok) assert.fail("非白名单 argv 必须拒绝");
    // 执行层纵深：argv 未命中规则层 commit 形态时统一返回 `git-commit-form-forbidden`
    // （与 `TASK_GIT_CODES.commitFormForbidden` 同值）。
    assert.equal(result.code, TASK_GIT_CODES.commitFormForbidden);
  }
  // scope 非法（空 writeSet）：稳定码透传，未取锁。
  {
    const result = await runTaskGitCommit({
      scope: scope({ paths: [] }),
      currentBranch: TASK_BRANCH,
      commitArgv: ["git", "commit", "-m", "x"],
      acquire: () => assert.fail("scope 非法时不得取锁"),
      inspectStaged: () => assert.fail("scope 非法时不得读取 staged"),
      commit: () => assert.fail("scope 非法时不得提交"),
    });
    if (result.ok) assert.fail("非法 scope 必须拒绝");
    assert.equal(result.code, TASK_GIT_CODES.scopeInvalid);
  }
});

test("公开出口 runTaskGitCommit：staged 空/非字面/治理写区/越界 ⇒ 不提交且释放锁", async () => {
  const cases: { staged: string[]; code: string }[] = [
    { staged: [], code: TASK_GIT_GATE_CODES.stagedEmpty },
    { staged: ["./src/impl/a.ts"], code: TASK_GIT_GATE_CODES.stagedNotLiteral },
    { staged: ["docs/audit/shell-gate.jsonl"], code: TASK_GIT_GATE_CODES.stagedGovernancePath },
    { staged: ["other/x.ts"], code: TASK_GIT_GATE_CODES.stagedOutsideWriteSet },
  ];
  for (const { staged, code } of cases) {
    let released = 0;
    const result = await runTaskGitCommit({
      scope: scope(),
      currentBranch: TASK_BRANCH,
      commitArgv: ["git", "commit", "-m", "x"],
      acquire: () => () => {
        released += 1;
      },
      inspectStaged: () => staged,
      commit: () => assert.fail(`staged 非法（${code}）时不得提交`),
    });
    if (result.ok) assert.fail(`staged 非法（${code}）必须拒绝`);
    assert.equal(result.code, code);
    assert.equal(released, 1, `staged 非法（${code}）必须释放锁且恰一次`);
  }
});

test("公开出口 runTaskGitCommit：inspectStaged 异常 ⇒ 释放锁后如实抛出（不吞错）", async () => {
  let released = 0;
  const boom = new Error("inspect boom");
  const result = runTaskGitCommit({
    scope: scope(),
    currentBranch: TASK_BRANCH,
    commitArgv: ["git", "commit", "-m", "x"],
    acquire: () => () => {
      released += 1;
    },
    inspectStaged: () => {
      throw boom;
    },
    commit: () => assert.fail("inspect 异常时不得提交"),
  });
  await assert.rejects(result, (error: unknown) => error === boom);
  assert.equal(released, 1, "异常路径必须释放锁且恰一次");
});

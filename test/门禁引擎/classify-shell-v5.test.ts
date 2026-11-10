// test/门禁引擎/classify-shell-v5.test.ts
// B4（2026-11-10，T3「两条固定工作流路径」；方案 v1.3 §6.2/§6.3；B1 验收 AC-21/AC-25/T-09/T-14/T-15）：
// Shell 规则 v5 全矩阵——`SHELL_RULES_VERSION="5"`、v4 只读白名单逐字保留、任务级 `git add`/`git commit -m`
// 允许面（需应用注入 taskGitScope）、staged 越界/`-A/./glob`/`-F -`/amend/no-verify/author 拒绝、
// push/merge/reset/checkout/switch/tag/update-ref 等硬拒（`git-command-not-ordinary`）、
// 审计描述（taskId/branch/paths/result/sha256）、写守卫与分类器共用同一 matcher、v4 旧规则回归。
//
// 纪律：不新增 skip/force-exit；旧断言不删除/不弱化（仅版本字面量随规则数据 v4→v5 同步）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  SHELL_RULES_VERSION,
  TASK_GIT_BRANCH_PREFIX,
  TASK_GIT_CODES,
  classifyShell,
  classifyShellDetailed,
  defaultShellRules,
  matchReadonlyGit,
  matchTaskGit,
  taskGitScopeError,
  type TaskGitScope,
} from "../../src/common/门禁引擎/classify-shell.ts";
import { evaluateShellWriteTargets, type ShellWriteGuardInput } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { createShellGate } from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";

const rules = defaultShellRules();
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const WORKFLOW_ID = "wf-0123456789abcdef01234567";
const TASK_BRANCH = `${TASK_GIT_BRANCH_PREFIX}${WORKFLOW_ID}`;

const scope = (over: Partial<TaskGitScope> = {}): TaskGitScope => ({
  taskId: "task-0001",
  workflowId: WORKFLOW_ID,
  branch: TASK_BRANCH,
  paths: ["src/impl/", "test/门禁引擎/", "docs/proposals/foo-v1.md"],
  ...over,
});
const argvDigest = (argv: readonly string[]) => sha256(JSON.stringify(["git", ...argv.slice(1)]));
const add = (...paths: string[]) => ["git", "add", ...paths];
const commit = (message: string) => ["git", "commit", "-m", message];

/** 写守卫 fixture（沿用 shell-write-guard.test.ts 口径；Git 分支不调用 checkWrite）。 */
function guard(argv: string[], extras: Partial<ShellWriteGuardInput> = {}) {
  const calls: string[] = [];
  const decision = evaluateShellWriteTargets({
    argv,
    cwd: "/proj",
    projectRoot: "/proj",
    skillRoot: "/proj",
    boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
    forbiddenPrefixes: [".ans/", "角色卡/"],
    checkWrite: (rel) => {
      calls.push(rel);
      return rel === "src" || rel.startsWith("src/") || rel === "note.md" ? { allowed: true } : { allowed: false, reason: "未匹配条目" };
    },
    ...extras,
  });
  return { decision, calls };
}

// ===========================================================================
// 1) 版本迁移：v5 生效；v4/v3/v2 规则集因版本不符整条拒绝（不静默放宽）
// ===========================================================================

test("v5 版本：SHELL_RULES_VERSION='5'、ans-default-v5；v4/v3 规则集整条拒绝（fail-closed）", () => {
  assert.equal(SHELL_RULES_VERSION, "5");
  const current = defaultShellRules();
  assert.equal(current.version, "5");
  assert.equal(current.id, "ans-default-v5");
  assert.equal(current.executionModel, "argv-noshell", "执行模型前提逐字保留（shell:false 耦合）");
  for (const version of ["4", "3", "2"]) {
    const legacy = { ...defaultShellRules(), version } as never;
    const denied = classifyShellDetailed(["ls"], legacy);
    assert.equal(denied.decision, "deny", `v${version} 规则集必须整条拒绝`);
    assert.equal(denied.ruleId, "deny:rules-invalid");
    // 旧只读 Git 数据即使被外部带回来也不会被引擎读取（版本不符先拒）。
    assert.equal(classifyShellDetailed(["git", "status"], legacy).decision, "deny");
  }
});

// ===========================================================================
// 2) v4 只读白名单逐字保留（迁移不弱化）
// ===========================================================================

test("v4 只读白名单保留：精确只读形态 allow；写形态/未列形态仍硬拒", () => {
  for (const argv of [
    ["git", "status"], ["git", "log", "-5"], ["git", "diff"], ["git", "rev-parse", "--verify", "HEAD"],
    ["git", "ls-files"], ["git", "ls-tree", "HEAD"], ["git", "merge-base", "HEAD", "a".repeat(40)],
    ["git", "blame", "--", "README.md"], ["git", "cat-file", "-p", "a".repeat(40)],
  ]) {
    const detail = classifyShellDetailed(argv, rules);
    assert.equal(detail.decision, "allow", argv.join(" "));
    assert.equal(detail.ruleId, `allow:readonly:git:${argv[1]}`, argv.join(" "));
    assert.equal(detail.taskGit, undefined, "只读 Git 审计走既有 readonlyGit 字段，不新增 taskGit");
  }
  for (const argv of [
    ["git", "log", "--output=evil"], ["git", "log", "--output", "evil"], ["git", "-c", "core.fsmonitor=helper", "status"],
    ["git", "-C", "other", "status"], ["git", "--git-dir=.git", "status"], ["git", "--version"], ["git", "bisect", "start"],
    ["git", "my-alias"],
  ]) {
    const detail = classifyShellDetailed(argv, rules);
    assert.equal(detail.decision, "deny", argv.join(" "));
    assert.equal(detail.ruleId, "deny:raw-git-controlled-tools-required", "旧 ruleId 口径保持");
    assert.equal(detail.code, TASK_GIT_CODES.commandNotOrdinary, argv.join(" "));
  }
});

// ===========================================================================
// 3) matchTaskGit 允许矩阵（纯函数；事实注入；writeSet 覆盖）
// ===========================================================================

test("matchTaskGit 允许：add 单文件/多文件/目录、commit -m；摘要确定性且不依赖时钟/随机", () => {
  const s = scope();
  const single = matchTaskGit(add("src/impl/a.ts"), s);
  assert.ok(single);
  assert.equal(single.template, "add");
  assert.deepEqual(single.paths, ["src/impl/a.ts"]);
  assert.equal(single.taskId, "task-0001");
  assert.equal(single.workflowId, WORKFLOW_ID);
  assert.equal(single.branch, TASK_BRANCH);
  assert.equal(single.argvDigest, argvDigest(add("src/impl/a.ts")));

  const exactFile = matchTaskGit(add("docs/proposals/foo-v1.md"), s);
  assert.deepEqual(exactFile?.paths, ["docs/proposals/foo-v1.md"], "writeSet 精确文件条目覆盖同名 add");

  const multi = matchTaskGit(add("src/impl/a.ts", "src/impl/sub/b.ts", "test/门禁引擎/x.test.ts", "docs/proposals/foo-v1.md"), s);
  assert.deepEqual(multi?.paths, ["src/impl/a.ts", "src/impl/sub/b.ts", "test/门禁引擎/x.test.ts", "docs/proposals/foo-v1.md"]);

  const dirToken = matchTaskGit(add("src/impl/"), s);
  assert.deepEqual(dirToken?.paths, ["src/impl/"], "目录字面路径可作为 add 目标");

  const message = "feat(impl): v5 task commit\n\nbody line";
  const commitMatch = matchTaskGit(commit(message), s);
  assert.ok(commitMatch);
  assert.equal(commitMatch.template, "commit");
  assert.deepEqual(commitMatch.paths, []);
  assert.equal(commitMatch.message, message);
  assert.equal(commitMatch.argvDigest, argvDigest(commit(message)));
  assert.equal(commitMatch.argvDigest, matchTaskGit(commit(message), scope({ taskId: "task-0002" }))?.argvDigest,
    "argvDigest 只由命令决定（不含任务 id）");

  // 纯函数：重复调用结果一致，且不修改输入事实。
  const frozen = structuredClone(s);
  assert.deepEqual(matchTaskGit(add("src/impl/a.ts"), s), matchTaskGit(add("src/impl/a.ts"), s));
  assert.deepEqual(s, frozen);
});

// ===========================================================================
// 4) matchTaskGit 拒绝矩阵（返回 undefined；scope 错误稳定码）
// ===========================================================================

test("matchTaskGit 拒绝：add flag/-A/--all/./glob/pathspec magic/绝对/..）/.git/路径外/治理写区", () => {
  const s = scope();
  for (const token of ["-A", "--all", "-u", "-f", "--intent-to-add", "-N", "--", "-p"]) {
    assert.equal(matchTaskGit(add(token, "src/impl/a.ts"), s), undefined, `flag ${token}`);
    assert.equal((classifyShellDetailed(add(token, "src/impl/a.ts"), rules, { taskGitScope: s }).code), TASK_GIT_CODES.addFlagForbidden);
  }
  for (const token of [".", "./src/impl/a.ts", "src/*.ts", "src/?.ts", "src/[a].ts", ":(glob)src/**", ":(exclude)x",
    "/abs/x", "C:/x", "C:x", "src\\impl\\a.ts", "src/../x", "../x", "src/impl/.git/config", "src//a.ts", "src/"]) {
    if (token === "src/") continue; // 目录字面路径属允许形态（由覆盖判定），见允许矩阵
    assert.equal(matchTaskGit(add(token), s), undefined, `非字面 ${token}`);
  }
  for (const token of ["other/x.ts", "src/other/x.ts", "docs/proposals/bar-v1.md", "test/x.test.ts"]) {
    assert.equal(matchTaskGit(add(token), s), undefined, `路径外 ${token}`);
  }
  for (const token of [".ans/state/x.json", "角色卡/X/boundary.yaml", "docs/audit/shell-gate.jsonl", "docs/acceptance/a.md"]) {
    assert.equal(matchTaskGit(add(token), s), undefined, `治理写区 ${token}`);
  }
  assert.equal(matchTaskGit(add(), s), undefined, "无路径 add");
  assert.equal(matchTaskGit(add("src/impl/a.ts", "src/impl/b.ts", "src/impl/c.ts"), scope({ paths: ["src/impl/"] }))?.paths.length, 3);
  assert.equal(matchTaskGit(add(...Array.from({ length: 129 }, (_, i) => `src/impl/${i}.ts`)), s), undefined, "add 路径数上限");
});

test("matchTaskGit 拒绝：commit 仅 -m 单形态（-F/amend/no-verify/-a/--author/空 message/多参）", () => {
  const s = scope();
  const forbidden: Array<[string[], string]> = [
    [["git", "commit", "-F", "-"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "-F", "msg.txt"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "--file", "msg.txt"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "--amend", "-m", "x"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "-m", "x", "--no-verify"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "-a", "-m", "x"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "-am", "x"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "--author", "evil <e@x>", "-m", "x"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "--author=evil", "-m", "x"], TASK_GIT_CODES.commitArgumentForbidden],
    [["git", "commit", "-m", ""], TASK_GIT_CODES.commitMessageEmpty],
    [["git", "commit", "-m", "   "], TASK_GIT_CODES.commitMessageEmpty],
    [["git", "commit", "--message", "x"], TASK_GIT_CODES.commitFormForbidden],
    [["git", "commit", "x"], TASK_GIT_CODES.commitFormForbidden],
    [["git", "commit"], TASK_GIT_CODES.commitFormForbidden],
    [["git", "commit", "-m", "x", "extra"], TASK_GIT_CODES.commitFormForbidden],
    [["git", "commit", "-m", "a", "-m", "b"], TASK_GIT_CODES.commitFormForbidden],
  ];
  for (const [argv, code] of forbidden) {
    assert.equal(matchTaskGit(argv, s), undefined, argv.join(" "));
    const detail = classifyShellDetailed(argv, rules, { taskGitScope: s });
    assert.equal(detail.decision, "deny", argv.join(" "));
    assert.equal(detail.code, code, argv.join(" "));
  }
});

test("taskGitScopeError：无 scope/坏 taskId/坏 workflowId/非任务分支/空写集/治理写集/重复项均拒", () => {
  assert.equal(taskGitScopeError(undefined), TASK_GIT_CODES.scopeMissing);
  assert.equal(taskGitScopeError(null), TASK_GIT_CODES.scopeMissing);
  assert.equal(taskGitScopeError([]), TASK_GIT_CODES.scopeMissing);
  assert.equal(taskGitScopeError("x"), TASK_GIT_CODES.scopeMissing);
  assert.equal(taskGitScopeError(scope()), undefined);
  for (const bad of [
    scope({ taskId: "" }), scope({ taskId: "x".repeat(201) }), scope({ taskId: "a\nb" }),
    scope({ workflowId: "WF-1" }), scope({ workflowId: "wf" }), scope({ workflowId: "wf-ABC" }),
    scope({ branch: "main" }), scope({ branch: `${TASK_GIT_BRANCH_PREFIX}other` }), scope({ branch: TASK_BRANCH.toUpperCase() }),
    scope({ paths: [] }), scope({ paths: ["."] }), scope({ paths: ["src/*.ts"] }), scope({ paths: ["/abs"] }),
    scope({ paths: ["src/impl/", "SRC/IMPL/"] }), scope({ paths: [42 as unknown as string] }),
  ]) {
    assert.equal(taskGitScopeError(bad), TASK_GIT_CODES.scopeInvalid, JSON.stringify(bad));
  }
  assert.equal(taskGitScopeError(scope({ paths: [".ans/state/x"] })), TASK_GIT_CODES.scopeGovernancePath);
  assert.equal(taskGitScopeError(scope({ paths: ["角色卡/X/boundary.yaml"] })), TASK_GIT_CODES.scopeGovernancePath);
  assert.equal(taskGitScopeError(scope({ paths: ["docs/audit/x.jsonl"] })), TASK_GIT_CODES.scopeGovernancePath);
});

// ===========================================================================
// 5) 分类器整合：无 scope ⇒ 写 Git 一律拒（fail-closed）
// ===========================================================================

test("分类器：无 taskGitScope 时 add/commit 一律拒（旧 2 参调用逐字保持硬拒）", () => {
  for (const argv of [add("src/impl/a.ts"), commit("msg")]) {
    const detail = classifyShellDetailed(argv, rules);
    assert.equal(detail.decision, "deny", argv.join(" "));
    assert.equal(detail.ruleId, "deny:raw-git-controlled-tools-required");
    assert.equal(detail.code, TASK_GIT_CODES.scopeMissing);
    assert.equal(detail.taskGit?.result, "denied");
    assert.equal(detail.taskGit?.template, argv[1]);
    assert.equal(detail.taskGit?.argvDigest, argvDigest(argv));
    assert.equal(classifyShell(argv, rules), "deny");
  }
  // 3 参但 context 形状非法 ⇒ 同样拒（不静默放宽）。
  for (const context of [null, "x", 42, [], { taskGitScope: null }] as never[]) {
    assert.equal(classifyShellDetailed(add("src/impl/a.ts"), rules, context).decision, "deny");
  }
});

// ===========================================================================
// 6) 分类器整合：合法 scope ⇒ add/commit allow + 审计描述（taskId/branch/paths/sha256）
// ===========================================================================

test("分类器：合法 scope 的 add/commit allow，规则 id 与审计描述稳定", () => {
  const s = scope();
  const addDetail = classifyShellDetailed(add("src/impl/a.ts", "src/impl/b.ts"), rules, { taskGitScope: s });
  assert.equal(addDetail.decision, "allow");
  assert.equal(addDetail.ruleId, "allow:task-git:add");
  assert.equal(addDetail.code, undefined);
  assert.deepEqual(addDetail.taskGit, {
    template: "add",
    result: "allowed",
    taskId: "task-0001",
    workflowId: WORKFLOW_ID,
    branch: TASK_BRANCH,
    paths: ["src/impl/a.ts", "src/impl/b.ts"],
    argvDigest: argvDigest(add("src/impl/a.ts", "src/impl/b.ts")),
  });

  const message = "feat: v5 commit";
  const commitDetail = classifyShellDetailed(commit(message), rules, { taskGitScope: s });
  assert.equal(commitDetail.decision, "allow");
  assert.equal(commitDetail.ruleId, "allow:task-git:commit");
  assert.deepEqual(commitDetail.taskGit, {
    template: "commit",
    result: "allowed",
    taskId: "task-0001",
    workflowId: WORKFLOW_ID,
    branch: TASK_BRANCH,
    paths: [],
    messageSha256: sha256(message),
    argvDigest: argvDigest(commit(message)),
  });

  // 与公开/私有单一来源一致：matcher 与分类器同一判定。
  assert.equal(matchTaskGit(commit(message), s)?.template, "commit");
  assert.equal(matchReadonlyGit(commit(message)), undefined, "任务级写不属于只读白名单（两个 matcher 正交）");
});

// ===========================================================================
// 7) 普通 Git 拒绝面（AC-21）：有合法 scope 也硬拒 push/merge/reset 等
// ===========================================================================

test("普通 Git 拒绝面：push/fetch/pull/remote/tag/merge/rebase/reset/clean/checkout/switch/stash/worktree/submodule/config/update-ref 等硬拒", () => {
  const s = scope();
  const denied: string[][] = [
    ["git", "push"], ["git", "push", "origin", "main"], ["git", "fetch"], ["git", "pull"], ["git", "remote", "add", "x", "y"],
    ["git", "tag", "v1"], ["git", "merge", "--no-ff", "ans/task/x"], ["git", "rebase", "main"], ["git", "cherry-pick", "HEAD"],
    ["git", "revert", "HEAD"], ["git", "reset", "--hard"], ["git", "clean", "-fdx"], ["git", "checkout", "main"],
    ["git", "checkout", "--", "."], ["git", "switch", "main"], ["git", "switch", "-c", "main", "HEAD"], ["git", "restore", "."],
    ["git", "stash"], ["git", "stash", "pop"], ["git", "worktree", "add", "x"], ["git", "submodule", "update"],
    ["git", "config", "user.name", "x"], ["git", "update-ref", "refs/heads/main", "HEAD"], ["git", "symbolic-ref", "HEAD"],
    ["git", "init"], ["git", "init", "-b", "main"], ["git", "rm", "src/a.ts"], ["git", "mv", "a", "b"], ["git", "am"],
    ["git", "apply", "patch.diff"], ["git", "branch", "-D", "main"], ["git", "update-index", "--add", "x"],
    ["git", "gc"], ["git", "filter-branch", "--all"], ["git", "notes", "add", "-m", "x"], ["git", "replace", "a", "b"],
    ["git", "prune"], ["git", "repack"], ["git", "sparse-checkout", "set", "x"], ["git", "maintenance", "run"],
    ["git", "diff", "--cached"], ["git", "-c", "core.hooksPath=x", "commit", "-m", "x"], ["git", "-C", "other", "add", "x"],
    ["git", "--git-dir=.git", "commit", "-m", "x"], ["git", "--work-tree=.", "add", "x"],
  ];
  for (const argv of denied) {
    const detail = classifyShellDetailed(argv, rules, { taskGitScope: s });
    assert.equal(detail.decision, "deny", argv.join(" "));
    assert.equal(detail.ruleId, "deny:raw-git-controlled-tools-required", argv.join(" "));
    assert.equal(detail.code, TASK_GIT_CODES.commandNotOrdinary, argv.join(" "));
    assert.equal(detail.taskGit?.result, "denied");
    assert.equal(detail.taskGit?.argvDigest, argvDigest(argv));
  }
});

// ===========================================================================
// 8) 脚本/间接执行绕过仍拒（v4 反绕过面不变）
// ===========================================================================

test("绕过面：sh -c / bash -c / cmd /c / node -e / awk 等仍硬拒（不经任务级白名单）", () => {
  for (const argv of [
    ["sh", "-c", "git add src/impl/a.ts"],
    ["bash", "-c", "git commit -m x"],
    ["cmd", "/c", "git add x"],
    ["powershell", "-Command", "git add x"],
    ["node", "-e", "x".repeat(3000)],
    ["awk", "BEGIN{system(\"git add x\")}"],
    ["find", ".", "-exec", "git", "add", "x", ";"],
  ]) {
    const detail = classifyShellDetailed(argv, rules, { taskGitScope: scope() });
    assert.equal(detail.decision, "deny", argv.join(" "));
    assert.match(detail.ruleId, /^deny:(program:|token:|opaque-command|structural)/, argv.join(" "));
  }
  // 短内联（bounds 内）按既有 v2.4 口径进入脚本审查（review），绝不进入任务级 Git 写白名单（allow）。
  assert.notEqual(classifyShellDetailed(["node", "-e", "require('child_process').execSync('git add x')"], rules, { taskGitScope: scope() }).decision, "allow");
  // 间接执行器（env）在程序名可见口径下最多 risky，绝不 allow。
  assert.notEqual(classifyShell(["env", `GIT_DIR=x`, "git", "add", "src/impl/a.ts"], rules), "allow");
});

// ===========================================================================
// 9) 写守卫与分类器共用同一 matcher（v5；无 scope 仍硬拒）
// ===========================================================================

test("写守卫 v5：任务级 add/commit 前台 pass（形状级）；无 scope/后台/路径外/普通 Git 硬拒", () => {
  const s = scope();
  for (const argv of [add("src/impl/a.ts"), commit("msg")]) {
    const ok = guard(argv, { taskGitScope: s });
    assert.equal(ok.decision.kind, "pass", `${argv.join(" ")} 应 pass`);
    assert.deepEqual(ok.calls, [], "Git 形状级放行不调用 checkWrite（staged 内容由临界区门复核）");
  }
  assert.equal(guard(add("src/impl/a.ts")).decision.kind, "deny", "无 scope ⇒ 硬拒");
  assert.equal(guard(commit("msg")).decision.kind, "deny");
  assert.equal(guard(add("src/impl/a.ts"), { taskGitScope: s, entry: "start_background_task" }).decision.kind, "deny", "后台入口一律拒");
  assert.equal(guard(add("other/x.ts"), { taskGitScope: s }).decision.kind, "deny", "路径外 add 拒");
  assert.equal(guard(add("-A"), { taskGitScope: s }).decision.kind, "deny", "flag add 拒");
  assert.equal(guard(["git", "push"], { taskGitScope: s }).decision.kind, "deny", "普通 Git 仍硬拒");
  assert.equal(guard(["git", "status"]).decision.kind, "pass", "只读 Git 前台放行（v4 逐字保留）");
  assert.equal(guard(["git", "status"], { entry: "start_background_task" }).decision.kind, "deny", "后台只读仍拒");
  const commitDeny = guard(commit("msg"), { taskGitScope: s, entry: "start_background_task" });
  if (commitDeny.decision.kind === "deny") {
    assert.equal(commitDeny.decision.code, "shell-write-hard-deny");
    assert.match(commitDeny.decision.reason, /start_background_task/);
  }
});

// ===========================================================================
// 10) 审计不减少：经 ShellGate 的每条 git 写命令（allow/deny）仍逐条落审计行
// ===========================================================================

test("审计：ShellGate 对 task-git add/commit allow 与普通 Git deny 各写一行（既有字段不变）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    classifyShell: (argv, ruleSet) => classifyShellDetailed(argv, ruleSet, { taskGitScope: scope() }),
    rules,
    rulesId: rules.id,
    audit,
    now: () => new Date("2026-11-10T00:00:00.000Z"),
  });
  const req = (argv: string[]) => ({ command: argv.join(" "), argv, cwd: "/proj", toolCallId: "call-1" });
  const outcomes = [
    await gate(req(add("src/impl/a.ts"))),
    await gate(req(commit("msg"))),
    await gate(req(["git", "push"])),
    await gate(req(add("other/x.ts"))),
  ];
  assert.deepEqual(outcomes.map((outcome) => outcome.allow), [true, true, false, false]);
  assert.equal(audit.records.length, 4, "每条 git 命令一行（allow/deny 都写；不减少）");
  for (const [index, record] of audit.records.entries()) {
    assert.equal(record.command.startsWith("git "), true, `command 原文保留：${record.command}`);
    assert.ok(Array.isArray(record.argv) && record.argv.length >= 2, "argv 保留");
    assert.equal(record.cwd, "/proj");
    assert.ok(["allow", "deny"].includes(record.conclusion), `conclusion：${record.conclusion}`);
    assert.ok(Array.isArray(record.conditions));
    assert.equal(record.execution, "未执行", "闸只判定、不执行（spawn 在同址执行层）");
    if (index === 0) assert.match(record.by, /allow:task-git:add/);
    if (index === 1) assert.match(record.by, /allow:task-git:commit/);
    if (index === 2) assert.match(record.by, /deny:raw-git-controlled-tools-required/);
  }
});

// ===========================================================================
// 11) v4 旧规则回归（非 Git 判定逐字不变）
// ===========================================================================

test("v4 旧规则回归：四档/硬拒/risky/例行白名单/元字符耦合不变", () => {
  assert.equal(classifyShell(["ls"], rules), "allow");
  assert.equal(classifyShell(["npm", "test"], rules), "allow");
  assert.equal(classifyShellDetailed(["npm", "test"], rules).ruleId, "allow:routine:npm-test");
  assert.equal(classifyShell(["rm", "-rf", "build"], rules), "risky");
  assert.equal(classifyShell(["frobnicate"], rules), "review");
  assert.equal(classifyShell(["sh", "-c", "echo hi"], rules), "deny");
  assert.equal(classifyShell(["cat", "data.txt"], rules), "allow");
  const shellString = { ...defaultShellRules(), executionModel: "shell-string" } as never;
  assert.equal(classifyShellDetailed(["grep", "a", "b| c"], shellString).decision, "deny", "shell-string 下元字符恢复拦截");
  assert.equal(classifyShellDetailed(["ls"], undefined as never).decision, "deny", "规则集缺失 fail-closed");
});

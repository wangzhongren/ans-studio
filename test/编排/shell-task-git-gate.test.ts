// test/编排/shell-task-git-gate.test.ts
// T3 B4.1（2026-11-10，编排）：AC-21 / T-09——shell 闸 v5 任务级 Git 写（`git add`/`git commit`）分类 + 审计。
//
// 覆盖：
//   · fixed 任务 add/commit 允许（`taskGitScope` = taskId/workflowId/branch/writeSet）；
//   · `-A`/非字面/越 writeSet/治理写区/普通 Git（push 等）拒绝；
//   · `-F -`/`--amend`/空 message 拒绝；
//   · 无 scope（明细分类器缺省上下文）/2 参旧调用 ⇒ Git 写一律拒（fail-closed）；
//   · 审计行追加 `taskGit`（允许与拒绝都记；既有字段不减少、非 Git 行无本字段）；
//   · run-role 生产的「明细分类封装」通道（把 `classifyShellDetailed` 包进既有 `classifyShell` 位）；
//   · 只读档构造期拒绝任务级 Git 上下文（不得越过 `readonly-deny`）；
//   · legacy 只读 Git 白名单路径逐字保留。
//
// 全部为纯判定（闸只分类 + 审计，不执行任何命令）。

import test from "node:test";
import assert from "node:assert/strict";

import {
  createShellGate,
  BRANCH_C_ALLOW,
  BRANCH_C_DENY,
} from "../../src/common/编排/shell-gate.ts";
import { createMemoryAuditSink } from "../../src/common/编排/shell-audit.ts";
import {
  classifyShell,
  classifyShellDetailed,
  defaultShellRules,
  TASK_GIT_CODES,
} from "../../src/service/gate/shell-rules.ts";
import type { TaskGitScope } from "../../src/service/gate/shell-rules.ts";
import type { ShellRules } from "../../src/model/decision.ts";

const RULES: ShellRules = defaultShellRules();
const TASK_ID = "t-impl-0001";
const WORKFLOW_ID = "wf-snake-0001";
const SCOPE: TaskGitScope = {
  taskId: TASK_ID,
  workflowId: WORKFLOW_ID,
  branch: `ans/task/${WORKFLOW_ID}`,
  paths: ["src/impl/"],
};

function req(command: string, argv: string[], extra: Record<string, unknown> = {}) {
  return { command, argv, cwd: "/proj", toolCallId: `call-${command}-${argv.length}`, ...extra };
}

function memoryGate(extra: Record<string, unknown> = {}) {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    projectRoot: "/proj",
    rules: RULES,
    audit,
    classifyShellDetailed,
    taskGitScope: SCOPE,
    ...extra,
  });
  return { gate, audit };
}

function lastTaskGit(audit: ReturnType<typeof createMemoryAuditSink>) {
  const record = audit.records[audit.records.length - 1];
  assert.ok(record !== undefined);
  return record;
}

function assertSha256Hex(value: unknown, label: string): void {
  assert.equal(typeof value, "string", `${label} 应为字符串`);
  assert.match(value as string, /^[a-f0-9]{64}$/i, `${label} 应为 sha256 hex`);
}

// —————————————————————— ① fixed add/commit 允许 + 审计 taskGit ——————————————————————

test("fixed 任务 git add 允许：writeSet/分支/taskId/workflowId 命中，审计追加 taskGit（allowed）", async () => {
  const { gate, audit } = memoryGate();
  const result = await gate(req("git add src/impl/a.ts", ["git", "add", "src/impl/a.ts"]));
  assert.equal(result.allow, true, result.allow === false ? result.reason : "");
  assert.match(result.by, /allow:task-git:add/);
  const record = lastTaskGit(audit);
  assert.equal(record.conclusion, "allow");
  assert.equal(record.branch, BRANCH_C_ALLOW);
  // 既有字段不减少
  assert.equal(record.command, "git add src/impl/a.ts");
  assert.deepEqual(record.argv, ["git", "add", "src/impl/a.ts"]);
  assert.equal(record.cwd, "/proj");
  assert.equal(record.execution, "未执行");
  assert.deepEqual(record.conditions, ["shell-gate"]);
  // v5 taskGit 加法
  assert.ok(record.taskGit !== undefined, "审计行应有 taskGit");
  const taskGit = record.taskGit!;
  assert.equal(taskGit.template, "add");
  assert.equal(taskGit.result, "allowed");
  assert.equal(taskGit.code, undefined);
  assert.equal(taskGit.taskId, TASK_ID);
  assert.equal(taskGit.workflowId, WORKFLOW_ID);
  assert.equal(taskGit.branch, SCOPE.branch);
  assert.deepEqual(taskGit.paths, ["src/impl/a.ts"]);
  assertSha256Hex(taskGit.argvDigest, "argvDigest");
});

test("fixed 任务 git commit -m 允许：审计 taskGit 记 messageSha256（不落明文）", async () => {
  const { gate, audit } = memoryGate();
  const message = "impl done";
  const result = await gate(req(`git commit -m ${message}`, ["git", "commit", "-m", message]));
  assert.equal(result.allow, true, result.allow === false ? result.reason : "");
  assert.match(result.by, /allow:task-git:commit/);
  const taskGit = lastTaskGit(audit).taskGit;
  assert.ok(taskGit !== undefined);
  assert.equal(taskGit.template, "commit");
  assert.equal(taskGit.result, "allowed");
  assert.equal(taskGit.taskId, TASK_ID);
  assert.equal(taskGit.workflowId, WORKFLOW_ID);
  assert.equal(taskGit.branch, SCOPE.branch);
  assert.deepEqual(taskGit.paths, []);
  // message 只落 sha256；审计 JSON 中不出现明文 message 的独立字段
  assertSha256Hex(taskGit.messageSha256, "messageSha256");
  assert.equal(JSON.stringify(taskGit).includes(message), false, "taskGit 不得落 message 明文");
});

// —————————————————————— ② add 拒绝面 + 审计（denied） ——————————————————————

test("git add -A / 非字面 ./x / 越 writeSet / 治理写区：拒绝且审计 taskGit（denied + 稳定码）", async () => {
  const cases: Array<{ argv: string[]; code: string }> = [
    { argv: ["git", "add", "-A"], code: TASK_GIT_CODES.addFlagForbidden },
    { argv: ["git", "add", "./src/impl/a.ts"], code: TASK_GIT_CODES.addNotLiteral },
    { argv: ["git", "add", "other/x.ts"], code: TASK_GIT_CODES.pathOutsideWriteSet },
    { argv: ["git", "add", ".ans/state/x.json"], code: TASK_GIT_CODES.pathGovernance },
    { argv: ["git", "add", "src/impl/a.ts", "-u"], code: TASK_GIT_CODES.addFlagForbidden },
  ];
  for (const item of cases) {
    const { gate, audit } = memoryGate();
    const result = await gate(req(item.argv.join(" "), item.argv));
    assert.equal(result.allow, false, `${item.argv.join(" ")} 应拒绝`);
    assert.equal((result as { reason: string }).reason.length > 0, true);
    const record = lastTaskGit(audit);
    assert.equal(record.conclusion, "deny");
    assert.equal(record.branch, BRANCH_C_DENY);
    const taskGit = record.taskGit;
    assert.ok(taskGit !== undefined, `${item.argv.join(" ")} 拒绝也应审计 taskGit`);
    assert.equal(taskGit.result, "denied");
    assert.equal(taskGit.code, item.code, `${item.argv.join(" ")} 稳定码`);
    assert.equal(taskGit.taskId, TASK_ID);
  }
});

// —————————————————————— ③ commit 拒绝面 ——————————————————————

test("git commit -F - / --amend / -m 空串：拒绝且审计 taskGit（denied + 稳定码）", async () => {
  const cases: Array<{ argv: string[]; code: string }> = [
    { argv: ["git", "commit", "-F", "-"], code: TASK_GIT_CODES.commitArgumentForbidden },
    { argv: ["git", "commit", "--amend", "-m", "x"], code: TASK_GIT_CODES.commitArgumentForbidden },
    { argv: ["git", "commit", "-m", ""], code: TASK_GIT_CODES.commitMessageEmpty },
    { argv: ["git", "commit", "-m", "a", "-m", "b"], code: TASK_GIT_CODES.commitFormForbidden },
  ];
  for (const item of cases) {
    const { gate, audit } = memoryGate();
    const result = await gate(req(item.argv.join(" "), item.argv));
    assert.equal(result.allow, false);
    const taskGit = lastTaskGit(audit).taskGit;
    assert.ok(taskGit !== undefined);
    assert.equal(taskGit.template, "commit");
    assert.equal(taskGit.result, "denied");
    assert.equal(taskGit.code, item.code);
  }
});

// —————————————————————— ④ 普通 Git 拒绝面 ——————————————————————

test("普通 Git（push/merge/reset/checkout/update-ref）硬拒：git-command-not-ordinary，审计 taskGit（other）", async () => {
  for (const sub of ["push", "merge", "reset", "checkout", "update-ref"]) {
    const argv = ["git", sub];
    const { gate, audit } = memoryGate();
    const result = await gate(req(`git ${sub}`, argv));
    assert.equal(result.allow, false, `git ${sub} 应拒绝`);
    const record = lastTaskGit(audit);
    assert.equal(record.branch, BRANCH_C_DENY);
    assert.ok(record.taskGit !== undefined);
    assert.equal(record.taskGit!.template, "other");
    assert.equal(record.taskGit!.result, "denied");
    assert.equal(record.taskGit!.code, TASK_GIT_CODES.commandNotOrdinary);
  }
});

// —————————————————————— ⑤ 无 scope / 2 参旧调用 fail-closed ——————————————————————

test("无 taskGitScope（明细分类器无上下文）：git add/commit 一律拒（git-task-scope-missing）", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    projectRoot: "/proj",
    rules: RULES,
    audit,
    classifyShellDetailed,
    // 不传 taskGitScope
  });
  for (const argv of [["git", "add", "src/impl/a.ts"], ["git", "commit", "-m", "x"]]) {
    const result = await gate(req(argv.join(" "), argv));
    assert.equal(result.allow, false);
    const record = lastTaskGit(audit);
    assert.equal(record.conclusion, "deny");
    assert.equal(record.taskGit?.result, "denied");
    assert.equal(record.taskGit?.code, TASK_GIT_CODES.scopeMissing);
  }
});

test("2 参旧调用（classifyShell 裸串）：git add/commit 仍拒（v5 无 scope），审计无 taskGit 字段", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    projectRoot: "/proj",
    rules: RULES,
    audit,
    classifyShell,
  });
  const add = await gate(req("git add src/impl/a.ts", ["git", "add", "src/impl/a.ts"]));
  assert.equal(add.allow, false);
  assert.equal(lastTaskGit(audit).taskGit, undefined);
  const commit = await gate(req("git commit -m x", ["git", "commit", "-m", "x"]));
  assert.equal(commit.allow, false);
  assert.equal(lastTaskGit(audit).taskGit, undefined);
  // legacy 只读 Git 白名单路径逐字保留（分类器 2 参同源）
  const status = await gate(req("git status", ["git", "status"]));
  assert.equal(status.allow, true);
  assert.match(status.by, /allow:readonly:git:status/);
  assert.equal(lastTaskGit(audit).taskGit, undefined, "非写 Git 行不追加 taskGit");
});

// —————————————————————— ⑥ run-role 生产封装通道（classifyShell 位包明细） ——————————————————————

test("明细分类封装（run-role 生产通道）：classifyShell 位置包 classifyShellDetailed + scope ⇒ add/commit 允许且审计 taskGit", async () => {
  const audit = createMemoryAuditSink();
  const gate = createShellGate({
    projectRoot: "/proj",
    rules: RULES,
    audit,
    classifyShell: (argv: string[], rules: ShellRules) =>
      classifyShellDetailed(argv, rules, { taskGitScope: SCOPE }),
  });
  const add = await gate(req("git add src/impl/b.ts", ["git", "add", "src/impl/b.ts"]));
  assert.equal(add.allow, true, add.allow === false ? add.reason : "");
  assert.equal(lastTaskGit(audit).taskGit?.result, "allowed");
  const commit = await gate(req("git commit -m y", ["git", "commit", "-m", "y"]));
  assert.equal(commit.allow, true, commit.allow === false ? commit.reason : "");
  assert.equal(lastTaskGit(audit).taskGit?.template, "commit");
  // 越界仍拒（同一封装）
  const outside = await gate(req("git add other/x", ["git", "add", "other/x"]));
  assert.equal(outside.allow, false);
  assert.equal(lastTaskGit(audit).taskGit?.code, TASK_GIT_CODES.pathOutsideWriteSet);
});

// —————————————————————— ⑦ 只读档构造期守卫 ——————————————————————

test("readonlyOnly 不得注入 classifyShellDetailed/taskGitScope（任务级 Git 写不得越过 readonly-deny）", () => {
  const audit = createMemoryAuditSink();
  assert.throws(
    () => createShellGate({ projectRoot: "/proj", rules: RULES, audit, readonlyOnly: true, classifyShellDetailed, taskGitScope: SCOPE }),
    /readonlyOnly 不得注入 classifyShellDetailed\/taskGitScope/,
  );
  assert.throws(
    () => createShellGate({ projectRoot: "/proj", rules: RULES, audit, readonlyOnly: true, classifyShell, taskGitScope: SCOPE }),
    /readonlyOnly 不得注入 classifyShellDetailed\/taskGitScope/,
  );
});

// —————————————————————— ⑧ 既有 shell 行为不变（非 git 命令） ——————————————————————

test("非 Git 命令：明细分类器下判定与审计字段不因 taskGitScope 变化（ls allow，无 taskGit）", async () => {
  const { gate, audit } = memoryGate();
  const result = await gate(req("ls", ["ls"]));
  assert.equal(result.allow, true);
  const record = lastTaskGit(audit);
  assert.equal(record.taskGit, undefined);
  assert.equal(record.conclusion, "allow");
  assert.equal(record.branch, BRANCH_C_ALLOW);
});

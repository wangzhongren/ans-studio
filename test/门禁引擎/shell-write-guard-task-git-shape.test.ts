// test/门禁引擎/shell-write-guard-task-git-shape.test.ts
// B32.2（2026-11-11，T3「两条固定工作流路径」；RR27 实测）：
// 写守卫对任务级 `git add`/`git commit` 的拒绝区分两种事实——
//   ① taskGitScope 缺失/非法 ⇒ 保持既有「需应用注入有效 taskGitScope」文案与 `shell-write-hard-deny`；
//   ② scope 有效但 argv 形状不符（提交消息未加引号被拆多 token / add 非字面路径）⇒ 稳定码
//      `task-git-argv-shape`，点明 `-m` 后须恰一个带引号单消息参数（含空格整体加引号）、`git add`
//      需字面路径；不得再误报缺少 taskGitScope。
// 既有合法形态（带引号单 token commit、字面 add ⊆ writeSet）与普通 Git 硬拒、无 scope 硬拒不回归。
// 纪律：不新增 skip/force-exit；不删除/弱化既有安全断言。

import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateShellWriteTargets, type ShellWriteGuardInput } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { TASK_GIT_BRANCH_PREFIX, TASK_GIT_CODES, type TaskGitScope } from "../../src/common/门禁引擎/classify-shell.ts";

const ROOT = "/proj";
const WORKFLOW_ID = "wf-0123456789abcdef01234567";

const scope = (over: Partial<TaskGitScope> = {}): TaskGitScope => ({
  taskId: "task-b32-0001",
  workflowId: WORKFLOW_ID,
  branch: `${TASK_GIT_BRANCH_PREFIX}${WORKFLOW_ID}`,
  paths: ["src/game/", "src/game.js", "test/门禁引擎/"],
  ...over,
});

function guard(argv: string[], extras: Partial<ShellWriteGuardInput> = {}) {
  return evaluateShellWriteTargets({
    argv,
    cwd: ROOT,
    projectRoot: ROOT,
    skillRoot: ROOT,
    boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
    forbiddenPrefixes: [".ans/", "角色卡/"],
    // Git 形状级放行/拒绝不调用 checkWrite（staged 内容由 task-git-gate 临界区复核）。
    checkWrite: () => ({ allowed: false, reason: "不应被调用" }),
    ...extras,
  });
}

const QUOTED_COMMIT = ["git", "commit", "-m", "feat(game-core): implement snake rules and state machine"];

test("B32.2 合法形态不回归：带引号单 token commit / 字面 add ⊆ writeSet（scope 有效）⇒ pass", () => {
  for (const argv of [QUOTED_COMMIT, ["git", "add", "src/game.js"], ["git", "add", "src/game/", "test/门禁引擎/b32.test.ts"]]) {
    const decision = guard(argv, { taskGitScope: scope() });
    assert.equal(decision.kind, "pass", `${JSON.stringify(argv)} 应 pass（既有合法形态）`);
  }
  // 只读 Git 前台仍 pass（v4/v5 口径逐字保留）。
  assert.equal(guard(["git", "status"]).kind, "pass");
  assert.equal(guard(["git", "status"], { taskGitScope: scope() }).kind, "pass");
});

test("B32.2 未引号多 token commit（scope 有效）⇒ deny code=task-git-argv-shape，点明引号规则且不得误报缺 scope", () => {
  // RR27 实测 argv：未加引号的提交消息被拆成多个 token。
  const split = ["git", "commit", "-m", "feat(game-core):", "implement", "game", "rules", "state", "machine", "in", "src/game.js"];
  const decision = guard(split, { taskGitScope: scope() });
  assert.equal(decision.kind, "deny");
  if (decision.kind !== "deny") return;
  assert.equal(decision.code, "task-git-argv-shape");
  assert.equal(decision.code, TASK_GIT_CODES.argvShape, "稳定码须来自 classify-shell 的单一登记表");
  assert.match(decision.reason, /-m` 后必须恰一个带引号/u, "须点明 -m 后必须恰一个带引号参数");
  assert.match(decision.reason, /含空格须整体加引号/u, "须点明含空格整体加引号");
  assert.match(decision.reason, /`git add` 需字面路径/u, "须点明 git add 需字面路径");
  assert.match(decision.reason, /task-git-argv-shape/, "文案须携带可区分稳定码");
  assert.doesNotMatch(decision.reason, /需应用注入有效 taskGitScope/, "scope 有效时不得误报缺少 taskGitScope");
  assert.doesNotMatch(decision.reason, /git-task-scope-missing|git-task-scope-invalid/, "不得返回缺 scope 码");
});

test("B32.2 scope 缺失/非法 ⇒ 既有缺 scope 文案与 shell-write-hard-deny 码逐字保持", () => {
  const commit = ["git", "commit", "-m", "msg"];
  const add = ["git", "add", "src/game.js"];
  const cases: Array<[string, Partial<ShellWriteGuardInput>]> = [
    ["无 scope", {}],
    ["scope 非法（空写集）", { taskGitScope: scope({ paths: [] }) }],
    ["scope 非法（非任务分支）", { taskGitScope: scope({ branch: "main" }) }],
  ];
  for (const [label, extras] of cases) {
    for (const argv of [commit, add]) {
      const decision = guard(argv, extras);
      assert.equal(decision.kind, "deny", `${label} ${JSON.stringify(argv)} 仍须拒绝`);
      if (decision.kind !== "deny") continue;
      assert.equal(decision.code, "shell-write-hard-deny", `${label} 稳定码须保持既有硬拒码`);
      assert.match(decision.reason, /任务级 Git 写被硬拒：需应用注入有效 taskGitScope/u, `${label} 文案须保持既有缺 scope 口径`);
    }
  }
});

test("B32.2 add 字面路径 ⊆ writeSet ⇒ pass；越界/非字面/flag ⇒ deny（task-git-argv-shape，不误报缺 scope）", () => {
  assert.equal(guard(["git", "add", "src/game/level.js"], { taskGitScope: scope() }).kind, "pass");
  for (const argv of [
    ["git", "add", "other/outside.js"], // 写集外
    ["git", "add", "-A"], // add 形态非法
    ["git", "add", "."], // 非字面
    ["git", "add", "src/game/*.js"], // 通配
    ["git", "add", ".ans/state/x.json"], // 治理写区
  ]) {
    const decision = guard(argv, { taskGitScope: scope() });
    assert.equal(decision.kind, "deny", `${JSON.stringify(argv)} 须拒绝`);
    if (decision.kind !== "deny") continue;
    assert.equal(decision.code, "task-git-argv-shape", `${JSON.stringify(argv)} 为 scope 有效但形状/写集不符`);
    assert.match(decision.reason, /任务写集/u, "须说明 add 路径须 ⊆ 任务写集");
    assert.doesNotMatch(decision.reason, /需应用注入有效 taskGitScope/u, "不得误报缺少 taskGitScope");
  }
});

test("B32.2 既有安全拒绝不回归：普通 Git 写/无 scope/后台入口仍 fail-closed", () => {
  for (const argv of [["git", "push"], ["git", "merge", "ans/task/x"], ["git", "reset", "--hard"], ["git", "checkout", "main"]]) {
    const decision = guard(argv, { taskGitScope: scope() });
    assert.equal(decision.kind, "deny", `${JSON.stringify(argv)} 普通 Git 写仍硬拒`);
    if (decision.kind === "deny") {
      assert.equal(decision.code, "shell-write-hard-deny");
      assert.match(decision.reason, /裸 Git 硬拒/u);
    }
  }
  // 后台入口不享受任务级 Git 放行（既有 AC-22）；文案保持 start_background_task 口径。
  for (const argv of [QUOTED_COMMIT, ["git", "add", "src/game.js"], ["git", "status"]]) {
    const decision = guard(argv, { taskGitScope: scope(), entry: "start_background_task" });
    assert.equal(decision.kind, "deny", `${JSON.stringify(argv)} 后台入口仍拒`);
    if (decision.kind === "deny") {
      assert.equal(decision.code, "shell-write-hard-deny");
      assert.match(decision.reason, /start_background_task/u);
    }
  }
  // 既有 forbidden commit 参数（scope 有效）仍拒（归入 argv 形状码，但绝不 allow）。
  const amend = guard(["git", "commit", "--amend", "-m", "x"], { taskGitScope: scope() });
  assert.equal(amend.kind, "deny");
  if (amend.kind === "deny") assert.equal(amend.code, "task-git-argv-shape");
});

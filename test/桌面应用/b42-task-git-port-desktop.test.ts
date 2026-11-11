// test/桌面应用/b42-task-git-port-desktop.test.ts
// T3「两条固定工作流路径」B4.2（2026-11-10，桌面窗口）：**任务级 Git 端口注入**——决策级桌面测试。
//
// 覆盖（B1 验收 AC-21、T-09 的桌面 owner 部分；全部确定性、真实临时 Git 夹具、无 Electron/真实模型）：
//   1. `TaskGitPort` 真实实现：`git add -- <literal paths>`、`currentBranch`（sanitized env）、
//      `inspectStaged`（固定 `git diff --cached --name-only -z`，NUL 解析）、`git commit -m`（只本地、
//      不 push/tag/amend/no-verify/-a/--author/-F）。
//   2. 运输防御（fail-closed、只拒绝更多）：add 拒绝 flag/glob/`.`/绝对路径/反斜杠/`..`；commit 只接受
//      固定 `git commit -m`（-F/--amend/-a/--author/多参拒绝）；staged 检查只执行固定 argv。
//   3. 项目级临界区：`acquireCriticalSection` = B3 发布合并同一把锁（互斥/占用返回 undefined/释放幂等）。
//   4. sanitized env：commit 不读宿主 `GIT_*`（宿主 `GIT_CONFIG_GLOBAL` 的 gpg/身份不生效；
//      身份固定 `ANS Application`）。
//   5. 门禁组合（只读消费 Service 出口 `classifyShellDetailed` / `runTaskGitCommit`）：无 scope ⇒
//      add/commit 一律拒；`-A`/`-F -`/普通 Git 拒绝；staged 越界/空/治理写区、分支不符、锁占用均不提交。
//   6. Session 注入：fixed 会话经 `openRoleSession` 注入 `taskGit:{classifyShellDetailed, port}`（分类器
//      同一引用、端口同一把锁、**不传 scope/写集事实**）；legacy/single 会话不注入；不新增
//      `requestReleaseMerge`（G-IR MF-IR-8）。
//
// 夹具为真实临时 Git 仓库（node:child_process 直接 git setup；端口自身固定 argv/sanitized env）；
// 不启动 Electron/真实模型；无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  acquireProjectGitCriticalSection,
  createDesktopTaskGitPort,
  createDesktopTaskGitShellPort,
  projectGitCriticalSectionOwner,
} from "../../app/desktop/workflow-git.ts";
import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  classifyShellDetailed,
  defaultShellRules,
  runTaskGitCommit,
  TASK_GIT_STAGED_INSPECTION_ARGV,
} from "../../src/service/gate/shell-rules.ts";
import { appendTaskEvent, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent, taskBranchName } from "../../src/common/编排/workflow-service.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { TaskGitShellRuntimeInput, RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { WorkflowEvent } from "../../src/model/runtime.ts";

const WF = "wf-b42task000000000000000001";
const TASK_BRANCH = taskBranchName(WF);
const SCOPE = { taskId: "t-b42-impl", workflowId: WF, branch: TASK_BRANCH, paths: ["src/impl/"] } as const;

// —————————————— 真实 Git 夹具 ——————————————

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function tempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

function initRepo(root: string): void {
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "B42 Test");
  git(root, "config", "user.email", "b42@test.local");
  // 夹具与端口同口径（autocrlf=false），避免宿主全局 core.autocrlf=true 造成假 dirty/假 staged。
  git(root, "config", "core.autocrlf", "false");
}

function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

/** 建一个 main 上有初始提交、并已切到任务分支的夹具仓库。 */
async function repoOnTaskBranch(prefix: string): Promise<string> {
  const root = await tempRoot(prefix);
  initRepo(root);
  await writeFile(root, "README.md", "# fixture\n");
  commitAll(root, "init");
  git(root, "switch", "-c", TASK_BRANCH);
  return root;
}

function headOid(root: string): string {
  return git(root, "rev-parse", "HEAD");
}

// —————————————— 1) 端口真实 add/currentBranch/inspectStaged/commit ——————————————

test("TaskGitPort：真实 add/currentBranch/inspectStaged（NUL）/commit；只本地、不 push/tag", async () => {
  const root = await repoOnTaskBranch("ans-b42-port-");
  try {
    const port = createDesktopTaskGitPort();
    assert.equal(await port.currentBranch({ projectRoot: root }), TASK_BRANCH);

    await writeFile(root, "src/impl/a.ts", "export const a = 1;\n");
    await writeFile(root, "src/impl/b c.ts", "export const b = 2;\n");
    await writeFile(root, "src/impl/中文.md", "文档\n");
    const added = await port.add({ projectRoot: root, paths: ["src/impl/a.ts", "src/impl/b c.ts", "src/impl/中文.md"] });
    assert.equal(added.exitCode, 0, JSON.stringify(added));

    // 固定 `git diff --cached --name-only -z` + NUL 解析（空格/中文原样字面）。
    const staged = await port.inspectStaged({ projectRoot: root });
    assert.deepEqual([...staged].sort(), ["src/impl/a.ts", "src/impl/b c.ts", "src/impl/中文.md"].sort());

    const committed = await port.commit({ projectRoot: root, message: "impl: b42 done" });
    assert.equal(committed.exitCode, 0, JSON.stringify(committed));
    assert.equal(git(root, "log", "-1", "--format=%s"), "impl: b42 done");
    // 只本地：tracked 文件无未提交改动（端口 sanitized env 在项目内建 `.ans/git-home`，属预期隔离目录；
    // 真实 fixed 项目由 ans-managed `.gitignore` 覆盖 `.ans/`——本夹具只断言 tracked 面无悬空改动）。
    assert.equal(git(root, "status", "--porcelain", "--untracked-files=no"), "", "提交后 tracked 工作区 clean");
    // 只本地：无 remote、无 tag、无 amend（HEAD 只有一个新提交）。
    assert.equal(git(root, "remote"), "");
    assert.equal(git(root, "tag"), "");
    assert.equal(git(root, "rev-list", "--count", "HEAD"), "2");
    assert.equal(git(root, "rev-parse", "--abbrev-ref", "HEAD"), TASK_BRANCH);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2) add 运输防御 ——————————————

test("TaskGitPort.add 运输防御：flag/glob/`.`/绝对/反斜杠/`..`/空一律拒绝且不执行", async () => {
  const root = await repoOnTaskBranch("ans-b42-addguard-");
  try {
    const port = createDesktopTaskGitPort();
    await writeFile(root, "src/impl/a.ts", "export const a = 1;\n");
    const before = headOid(root);
    const cases: ReadonlyArray<readonly [string[], RegExp]> = [
      [["-A"], /git-task-add-flag-forbidden/],
      [["--all"], /git-task-add-flag-forbidden/],
      [[], /git-task-add-not-literal/],
      [["."], /git-task-add-not-literal/],
      [["./src/impl/a.ts"], /git-task-add-not-literal/],
      [["src/*.ts"], /git-task-add-not-literal/],
      [["src/impl/?"], /git-task-add-not-literal/],
      [["../outside.ts"], /git-task-add-not-literal/],
      [["src/impl/../../x.ts"], /git-task-add-not-literal/],
      [["/absolute.ts"], /git-task-add-not-literal/],
      [["C:/drive.ts"], /git-task-add-not-literal/],
      [["src\\impl\\a.ts"], /git-task-add-not-literal/],
      [["src/.git/config"], /git-task-add-not-literal/],
    ];
    for (const [paths, pattern] of cases) {
      const facts = await port.add({ projectRoot: root, paths });
      assert.match(facts.error ?? "", pattern, `paths=${JSON.stringify(paths)}`);
    }
    // 全部被运输防御拒绝：index 为空、HEAD 未变。
    assert.equal(git(root, "diff", "--cached", "--name-only"), "");
    assert.equal(headOid(root), before);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 3) commit 固定形态 ——————————————

test("TaskGitShellPort.commit：只接受固定 git commit -m；-F -/--amend/-a/--author/--no-verify/多参拒绝", async () => {
  const root = await repoOnTaskBranch("ans-b42-commitform-");
  try {
    const port = createDesktopTaskGitShellPort(root);
    await writeFile(root, "src/impl/a.ts", "export const a = 1;\n");
    git(root, "add", "--", "src/impl/a.ts");
    const before = headOid(root);
    const forbidden: readonly (readonly string[])[] = [
      ["git", "commit", "-F", "-"],
      ["git", "commit", "-F", "msg.txt"],
      ["git", "commit", "--file", "msg.txt"],
      ["git", "commit", "--amend", "-m", "x"],
      ["git", "commit", "-a", "-m", "x"],
      ["git", "commit", "-am", "x"],
      ["git", "commit", "--author", "x <x@y>", "-m", "x"],
      ["git", "commit", "--no-verify", "-m", "x"],
      ["git", "commit", "-m", "x", "--no-verify"],
      ["git", "commit", "-m", "x", "extra"],
      ["git", "commit", "-m"],
    ];
    for (const argv of forbidden) {
      const facts = await port.commit(argv);
      assert.match(facts.error ?? "", /git-commit-form-forbidden/, `argv=${JSON.stringify(argv)}`);
    }
    const empty = await port.commit(["git", "commit", "-m", "   "]);
    assert.match(empty.error ?? "", /git-commit-message-empty/);
    // 形态外一律未执行（HEAD 不变；staged 仍在，未被 -a 之类消费）。
    assert.equal(headOid(root), before);

    const ok = await port.commit(["git", "commit", "-m", "impl via shell port"]);
    assert.equal(ok.exitCode, 0, JSON.stringify(ok));
    assert.equal(git(root, "log", "-1", "--format=%s"), "impl via shell port");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 4) staged 检查固定 argv ——————————————

test("TaskGitShellPort.inspectStaged：只执行固定 argv（其他 argv 抛错、不执行）", async () => {
  const root = await repoOnTaskBranch("ans-b42-inspect-");
  try {
    const port = createDesktopTaskGitShellPort(root);
    await writeFile(root, "src/impl/a.ts", "export const a = 1;\n");
    git(root, "add", "--", "src/impl/a.ts");
    assert.deepEqual(await port.inspectStaged(TASK_GIT_STAGED_INSPECTION_ARGV), ["src/impl/a.ts"]);
    for (const argv of [
      ["diff", "--cached"],
      ["diff", "--cached", "--name-only"],
      ["diff", "--cached", "--name-only", "-z", "--", "src/"],
      ["status", "--porcelain"],
    ]) {
      await assert.rejects(async () => port.inspectStaged(argv), /git-staged-inspection-argv-invalid/, JSON.stringify(argv));
    }
  } finally {
    await cleanup(root);
  }
});

// —————————————— 5) 项目级临界区（与 B3 同一把锁） ——————————————

test("acquireCriticalSection：与 B3 发布合并同一把项目锁；占用 ⇒ undefined；释放幂等", async () => {
  const root = await tempRoot("ans-b42-lock-");
  try {
    const port = createDesktopTaskGitPort();
    const release = port.acquireCriticalSection(root, "shell-commit:t-b42");
    assert.equal(typeof release, "function");
    assert.equal(projectGitCriticalSectionOwner(root), "shell-commit:t-b42");
    // 同一把锁：B3 既有出口/端口再次取锁都被拒（发布合并与 shell 提交互斥）。
    assert.equal(acquireProjectGitCriticalSection(root, "release-main:wf-b42"), undefined);
    assert.equal(port.acquireCriticalSection(root, "second"), undefined);
    release!();
    assert.equal(projectGitCriticalSectionOwner(root), undefined);
    release!(); // 幂等
    const next = acquireProjectGitCriticalSection(root, "release-main:wf-b42");
    assert.equal(typeof next, "function");
    next!();
    assert.equal(projectGitCriticalSectionOwner(root), undefined);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 6) sanitized env ——————————————

test("sanitized env：commit 不读宿主 GIT_*（全局 gpg/身份隔离；身份固定 ANS Application）", async () => {
  const root = await tempRoot("ans-b42-env-");
  const hostConfig = path.join(os.tmpdir(), `ans-b42-host-gitconfig-${process.pid}-${Date.now()}`);
  try {
    initRepo(root);
    await writeFile(root, "file.txt", "x\n");
    git(root, "add", "--", "file.txt");
    git(root, "config", "--local", "--unset", "user.name");
    git(root, "config", "--local", "--unset", "user.email");
    // 宿主 GIT_CONFIG_GLOBAL 指向「签名 + 冒名身份」配置：若 sanitized env 失效，commit 会因签名失败/身份
    // 走宿主而偏离下面的断言。
    await fs.writeFile(hostConfig, "[commit]\n\tgpgsign = true\n[user]\n\tname = Host Leak\n\temail = leak@host\n", "utf8");
    const saved = {
      author: process.env.GIT_AUTHOR_NAME,
      committer: process.env.GIT_COMMITTER_NAME,
      configGlobal: process.env.GIT_CONFIG_GLOBAL,
    };
    process.env.GIT_AUTHOR_NAME = "Host Leak";
    process.env.GIT_COMMITTER_NAME = "Host Leak";
    process.env.GIT_CONFIG_GLOBAL = hostConfig;
    try {
      const port = createDesktopTaskGitPort();
      const facts = await port.commit({ projectRoot: root, message: "sanitized env commit" });
      assert.equal(facts.exitCode, 0, JSON.stringify(facts));
      assert.equal(git(root, "log", "-1", "--format=%an"), "ANS Application");
      assert.equal(git(root, "log", "-1", "--format=%cn"), "ANS Application");
    } finally {
      if (saved.author === undefined) delete process.env.GIT_AUTHOR_NAME; else process.env.GIT_AUTHOR_NAME = saved.author;
      if (saved.committer === undefined) delete process.env.GIT_COMMITTER_NAME; else process.env.GIT_COMMITTER_NAME = saved.committer;
      if (saved.configGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved.configGlobal;
    }
  } finally {
    await fs.rm(hostConfig, { force: true });
    await cleanup(root);
  }
});

// —————————————— 7) 门禁组合（Service 出口只读消费 + 桌面真实端口） ——————————————

test("门禁组合：无 scope/-A/-F -/普通 Git 拒绝；staged 越界/空/治理写区、分支不符、锁占用均不提交", async () => {
  const root = await repoOnTaskBranch("ans-b42-gate-");
  try {
    const port = createDesktopTaskGitShellPort(root);
    const rules = defaultShellRules();
    const base = await headOid(root);

    // 分类器（桌面会话注入的同一函数）：合法 scope ⇔ allow；无 scope ⇒ 一律拒；形状外/普通 Git 拒绝。
    const allowAdd = classifyShellDetailed(["git", "add", "src/impl/a.ts"], rules, { taskGitScope: SCOPE });
    assert.equal(allowAdd.decision, "allow");
    assert.equal(allowAdd.ruleId, "allow:task-git:add");
    const allowCommit = classifyShellDetailed(["git", "commit", "-m", "impl"], rules, { taskGitScope: SCOPE });
    assert.equal(allowCommit.decision, "allow");
    const noScopeAdd = classifyShellDetailed(["git", "add", "src/impl/a.ts"], rules);
    assert.equal(noScopeAdd.decision, "deny");
    assert.equal(noScopeAdd.code, "git-task-scope-missing");
    const noScopeCommit = classifyShellDetailed(["git", "commit", "-m", "impl"], rules);
    assert.equal(noScopeCommit.decision, "deny");
    assert.equal(noScopeCommit.code, "git-task-scope-missing");
    const flagAdd = classifyShellDetailed(["git", "add", "-A"], rules, { taskGitScope: SCOPE });
    assert.equal(flagAdd.decision, "deny");
    assert.equal(flagAdd.code, "git-task-add-flag-forbidden");
    const fileCommit = classifyShellDetailed(["git", "commit", "-F", "-"], rules, { taskGitScope: SCOPE });
    assert.equal(fileCommit.decision, "deny");
    assert.equal(fileCommit.code, "git-commit-argument-forbidden");
    for (const argv of [["git", "push"], ["git", "merge", "main"], ["git", "reset", "--hard"], ["git", "tag", "v1"]]) {
      const verdict = classifyShellDetailed(argv, rules, { taskGitScope: SCOPE });
      assert.equal(verdict.decision, "deny", argv.join(" "));
      assert.equal(verdict.code, "git-command-not-ordinary", argv.join(" "));
    }

    // 真实端口 + 门禁提交执行器（与编排执行路径同一函数）：成功路径锁贯穿并提交。
    const branch = await port.currentBranch();
    // 观察「检查与提交」期间的项目级锁持有者：gate 在同一锁内先 inspectStaged 后 commit。
    const lockOwnersDuringGate: Array<string | undefined> = [];
    const runGateNow = (message: string, currentBranch = branch) =>
      runTaskGitCommit({
        scope: SCOPE,
        currentBranch,
        commitArgv: ["git", "commit", "-m", message],
        acquire: (owner) => port.acquireCriticalSection(owner),
        inspectStaged: () => {
          lockOwnersDuringGate.push(projectGitCriticalSectionOwner(root));
          return port.inspectStaged(TASK_GIT_STAGED_INSPECTION_ARGV);
        },
        commit: () => {
          lockOwnersDuringGate.push(projectGitCriticalSectionOwner(root));
          return port.commit(["git", "commit", "-m", message]);
        },
      });

    await writeFile(root, "src/impl/a.ts", "export const a = 1;\n");
    const added = await port.add(["src/impl/a.ts"]);
    assert.equal(added.exitCode, 0);
    const ok = await runGateNow("impl: gate commit");
    assert.equal(ok.ok, true, ok.ok === false ? ok.message : "");
    assert.deepEqual(ok.ok ? ok.stagedPaths : [], ["src/impl/a.ts"]);
    // 锁贯穿：inspectStaged 与 commit 都在 `shell-commit:<taskId>` 持有期间执行。
    assert.deepEqual(lockOwnersDuringGate.slice(0, 2), ["shell-commit:t-b42-impl", "shell-commit:t-b42-impl"]);
    assert.equal(git(root, "log", "-1", "--format=%s"), "impl: gate commit");
    assert.equal(projectGitCriticalSectionOwner(root), undefined, "提交后锁释放");
    const afterFirst = headOid(root);

    // staged 空 ⇒ git-staged-empty，不提交。
    const empty = await runGateNow("impl: empty");
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.code, "git-staged-empty");

    // staged 越界 ⇒ git-staged-outside-writeset，不提交。
    await writeFile(root, "docs/other.md", "# other\n");
    git(root, "add", "--", "docs/other.md");
    const outside = await runGateNow("impl: outside");
    assert.equal(outside.ok, false);
    if (!outside.ok) assert.equal(outside.code, "git-staged-outside-writeset");
    assert.equal(headOid(root), afterFirst);
    git(root, "reset", "--quiet", "--", "docs/other.md");

    // staged 治理写区 ⇒ git-staged-governance-path，不提交。
    await writeFile(root, "docs/audit/x.jsonl", "{}\n");
    git(root, "add", "--", "docs/audit/x.jsonl");
    const governance = await runGateNow("impl: governance");
    assert.equal(governance.ok, false);
    if (!governance.ok) assert.equal(governance.code, "git-staged-governance-path");
    assert.equal(headOid(root), afterFirst);
    git(root, "reset", "--quiet", "--", "docs/audit/x.jsonl");

    // 分支不符 ⇒ git-branch-mismatch（取锁前拒绝）。
    const mismatch = await runGateNow("impl: wrong branch", "main");
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.code, "git-branch-mismatch");

    // 锁占用 ⇒ git-critical-section-busy（不排队、不提交）。
    await writeFile(root, "src/impl/a.ts", "export const a = 2;\n");
    git(root, "add", "--", "src/impl/a.ts");
    const held = port.acquireCriticalSection("probe:busy");
    assert.equal(typeof held, "function");
    const busy = await runGateNow("impl: busy");
    assert.equal(busy.ok, false);
    if (!busy.ok) assert.equal(busy.code, "git-critical-section-busy");
    held!();
    assert.equal(headOid(root), afterFirst);
    // 收尾：同 staged 在锁释放后仍可提交（证明 busy 未消费 staged）。
    const afterBusy = await runGateNow("impl: after busy");
    assert.equal(afterBusy.ok, true, afterBusy.ok === false ? afterBusy.message : "");
    assert.notEqual(headOid(root), base);
    assert.equal(projectGitCriticalSectionOwner(root), undefined);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 8) Session 注入 ——————————————

function listing(root: string, governanceModel: "trio" | "single" = "trio"): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  const worker = (roleId: string): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: `角色卡/${roleId}/role-card.md`,
    boundaryPath: `角色卡/${roleId}/boundary.yaml`,
    cardText: roleId,
    boundary: {
      entries: [{ root: "project", path: `src/${roleId}`, kind: "directory", purpose: "p" }],
      boundarySource: `角色卡/${roleId}/boundary.yaml`,
      acceptance: { accepted: false, source: "" },
    },
  });
  return {
    projectRoot: root,
    roles: governanceModel === "single"
      ? [{
          roleId: "su", cardPath: "", boundaryPath: "", cardText: "su",
          boundary: { entries: [], boundarySource: "<built-in:su>", acceptance: { accepted: false, source: "" } },
          builtIn: true,
        }]
      : [
          builtIn("chief", "chief"),
          builtIn("convener", "schedule"),
          worker("worker"),
        ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: governanceModel === "single" ? "su" : "chief",
    governanceModel,
  };
}

interface CapturedInput {
  roleId: string;
  taskId?: string;
  taskGit?: TaskGitShellRuntimeInput;
  [key: string]: unknown;
}

function harness(root: string, options: { governanceModel?: "trio" | "single" } = {}) {
  const inputs: CapturedInput[] = [];
  const versionChangeStack = {
    ensureInitialized: async () => undefined,
    stablePermitOf: () => undefined,
    submitVersionChange: async () => ({ ok: false, errorCode: "vca-invalid", message: "test" }),
    submitRefactor: async () => ({ ok: false, errorCode: "refactor-invalid", message: "test" }),
    requestStableWrite: async () => ({ ok: false, errorCode: "stable-write-write-failed", message: "test" }),
    selectRunChange: async () => ({ ok: false, status: "blocked", message: "test" }),
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      inputs.push(input as unknown as CapturedInput);
      const handle: RoleSessionHandle = {
        async send(_text: string, _options?: RoleSessionSendOptions) {},
        events() {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root, options.governanceModel ?? "trio") : undefined),
    getVersionChangeStack: () => versionChangeStack as never,
    emitEvent: () => {},
  });
  return { mgr, inputs };
}

async function writeJson(root: string, rel: string, value: unknown): Promise<void> {
  const file = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function startedEvent(workflowId: string, flowId: string): WorkflowEvent {
  return {
    v: 1, at: "2026-11-10T10:00:00.000Z", schema: "ans-workflow/v1", kind: "workflow.started",
    workflowId, flowId, path: "A",
    idempotencyKey: `workflow-start:${flowId}:A:seed`,
    trigger: { by: "chief", reason: "seed" }, sourceTaskId: "turn-seed",
  };
}

test("Session 注入：fixed 会话注入 taskGit（同一分类器引用 + 同一项目锁、不传 scope）；legacy/single 不注入", async () => {
  const root = await tempRoot("ans-b42-session-");
  const h = harness(root);
  try {
    await writeJson(root, ".ans/project.json", { workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" });
    // legacy 在飞 run（同一项目混合路径）：该 flow 的任务会话保持 legacy。
    await writeJson(root, ".ans/runs/run-20261110-b42legacy-00000001/manifest.json", {
      schema: "ans-run/v1", runId: "run-20261110-b42legacy-00000001", flowId: "legacy-flow", state: "draft",
    });
    const wf = startedEvent(WF, "fixed-flow");
    const appended = await appendWorkflowEvent(root, wf);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-b42-fixed", from: "chief", to: "worker", text: "实现任务", flowId: "fixed-flow",
      workflowId: WF, stage: "A11", sideEffect: "code", idempotencyKey: "b42-task-fixed",
    }));
    await appendTaskEvent(root, taskEvent("task.created", {
      taskId: "t-b42-legacy", from: "chief", to: "chief", text: "legacy 任务", flowId: "legacy-flow",
      sideEffect: "read-only", idempotencyKey: "b42-task-legacy",
    }), { allowLegacyRun: true });

    const opened = await h.mgr.open({ projectRoot: root, roleId: "worker", runtime: "demo", taskId: "t-b42-fixed" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "会话打开失败") : "");
    const fixedInput = h.inputs.find((input) => input.roleId === "worker" && input.taskId === "t-b42-fixed");
    assert.ok(fixedInput !== undefined);
    const taskGit = fixedInput!.taskGit;
    assert.ok(taskGit !== undefined, "fixed 会话必须注入 taskGit");
    // 只给「实现」：分类器同一引用 + 端口；不传 scope/写集/taskId 事实（模型不可自报）。
    assert.deepEqual(Object.keys(taskGit!).sort(), ["classifyShellDetailed", "port"]);
    assert.equal(taskGit!.classifyShellDetailed, classifyShellDetailed, "分类器必须是 Service 出口同一函数引用");
    const port = taskGit!.port!;
    assert.equal(typeof port.acquireCriticalSection, "function");
    assert.equal(typeof port.currentBranch, "function");
    assert.equal(typeof port.add, "function");
    assert.equal(typeof port.inspectStaged, "function");
    assert.equal(typeof port.commit, "function");
    // 同一把项目级锁（与 B3 发布合并互斥）。
    const release = port.acquireCriticalSection("probe:session");
    assert.equal(typeof release, "function");
    assert.equal(projectGitCriticalSectionOwner(root), "probe:session");
    assert.equal(acquireProjectGitCriticalSection(root, "release-main:probe"), undefined);
    release!();
    assert.equal(projectGitCriticalSectionOwner(root), undefined);
    // G-IR MF-IR-8：不新增 requestReleaseMerge。
    assert.equal("requestReleaseMerge" in fixedInput!, false);

    // legacy 任务会话：不注入 taskGit（字段缺席）。
    await h.mgr.stop("worker");
    const legacyOpened = await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo", taskId: "t-b42-legacy" });
    assert.equal(legacyOpened.ok, true, legacyOpened.ok === false ? (legacyOpened.error ?? "会话打开失败") : "");
    const legacyInput = h.inputs.find((input) => input.roleId === "chief" && input.taskId === "t-b42-legacy");
    assert.ok(legacyInput !== undefined);
    assert.equal("taskGit" in legacyInput!, false, "legacy 会话不得注入 taskGit");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }

  // single/su 项目：即使任务带 workflowId/stage，也不注入 taskGit（旧行为逐字不变）。
  const singleRoot = await tempRoot("ans-b42-session-single-");
  const single = harness(singleRoot, { governanceModel: "single" });
  try {
    await appendTaskEvent(singleRoot, taskEvent("task.created", {
      taskId: "t-b42-single", from: "chief", to: "su", text: "single 任务", flowId: "new-flow",
      workflowId: "wf-b42single0000000000000001", stage: "A11", sideEffect: "code", idempotencyKey: "b42-task-single",
    }));
    const opened = await single.mgr.open({ projectRoot: singleRoot, roleId: "su", runtime: "demo", taskId: "t-b42-single" });
    assert.equal(opened.ok, true, opened.ok === false ? (opened.error ?? "会话打开失败") : "");
    const suInput = single.inputs.find((input) => input.roleId === "su");
    assert.ok(suInput !== undefined);
    assert.equal("taskGit" in suInput!, false, "single/su 会话不得注入 taskGit");
  } finally {
    await single.mgr.stop(null);
    await cleanup(singleRoot);
  }
});

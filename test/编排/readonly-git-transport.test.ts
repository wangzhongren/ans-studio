// test/编排/readonly-git-transport.test.ts
// 编排角色自测（2026-11-08 W3b，设计 P1.3 §2.4.3 / 派发 I0-4）：
// `executeReadonlyGit` 固定传输——绝对可执行、固定 config/env、预算有界、内建子命令优先于
// repo-local alias、**不接受任意 argv**（只接受 matcher 的受限描述并经 `buildReadonlyGitBody` 构造规范体）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

import { executeReadonlyGit, GIT_EXECUTABLE } from "../../src/provider/trunk/impl/git-command.ts";
import { matchReadonlyGit } from "../../src/service/gate/shell-rules.ts";

/** 建一个真实临时 git 仓库（仅测试夹具；执行面由 executeReadonlyGit 覆盖）。 */
function makeRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-rogit-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const git = (...args: string[]) => execFileSync(GIT_EXECUTABLE, args, { cwd: root, encoding: "utf8", env });
  git("init", "-q");
  fs.writeFileSync(path.join(root, "alpha.txt"), "alpha\n");
  git("add", "alpha.txt");
  git("commit", "-q", "-m", "init");
  fs.writeFileSync(path.join(root, "untracked.txt"), "u\n");
  return root;
}

const match = (argv: string[]) => {
  const m = matchReadonlyGit(argv);
  assert.ok(m, `matcher 应命中：${argv.join(" ")}`);
  return m;
};

test("固定传输基线：绝对可执行；status/log/rev-parse 命中 matcher 后经固定传输执行", async () => {
  assert.ok(path.isAbsolute(GIT_EXECUTABLE), "GIT_EXECUTABLE 必须是绝对路径（不按 PATH/cwd 解析）");
  const root = makeRepo();
  try {
    const status = await executeReadonlyGit(root, match(["git", "status"]));
    assert.equal(status.exitCode, 0, `stderr: ${status.stderr}`);
    assert.ok(status.stdout.includes("untracked.txt"), "porcelain 输出来自真实仓库");

    const log = await executeReadonlyGit(root, match(["git", "log", "-1"]));
    assert.equal(log.exitCode, 0);
    assert.ok(log.stdout.includes("init"), "log 主体包含提交信息");

    const rev = await executeReadonlyGit(root, match(["git", "rev-parse", "--verify", "HEAD"]));
    assert.equal(rev.exitCode, 0);
    assert.match(rev.stdout.trim(), /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/, "rev-parse 输出完整 OID");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("B30 桌面默认身份：repo-local [user] name=ANS/email=ans@local 不阻断 executeReadonlyGit('status')（真实仓库夹具）", async () => {
  const root = makeRepo();
  try {
    // 与桌面 `ensureIdentityDefaults`（A9 基线）逐字一致：repo-local `[user]` 两条缺省身份。
    execFileSync(GIT_EXECUTABLE, ["config", "user.name", "ANS"], { cwd: root });
    execFileSync(GIT_EXECUTABLE, ["config", "user.email", "ans@local"], { cwd: root });
    const config = readFileSync(path.join(root, ".git/config"), "utf8");
    assert.match(config, /\[user\]\r?\n\tname = ANS\r?\n\temail = ans@local/, "真实 Git 写入的默认身份节存在");
    const facts = await executeReadonlyGit(root, match(["git", "status"]));
    assert.equal(facts.exitCode, 0, `stderr: ${facts.stderr}`);
    assert.ok(facts.stdout.includes("untracked.txt"), "status 在含 [user] 默认身份的真实仓库上可执行");
    // 值合法性边界仍在此 fail-closed：签名键不属于放行集合。
    execFileSync(GIT_EXECUTABLE, ["config", "user.signingkey", "ABCDEF"], { cwd: root });
    await assert.rejects(() => executeReadonlyGit(root, match(["git", "status"])), /git-config-executable-or-unsupported/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("不接受任意 argv：非 matcher 受限描述一律拒绝；对象内夹带 argv 被忽略（执行体只由 buildReadonlyGitBody 构造）", async () => {
  const root = makeRepo();
  try {
    // 形状非法 ⇒ 拒绝（零执行）。
    await assert.rejects(() => executeReadonlyGit(root, { argv: ["status"] } as unknown as object), /readonly-git-match-invalid/);
    await assert.rejects(
      () => executeReadonlyGit(root, { id: "status", template: "status" } as unknown as object),
      /readonly-git-match-invalid/,
    );
    // show 的 target 只接受完整 OID（HEAD 仅用于 log/rev-parse/ls-tree/merge-base）。
    await assert.rejects(
      () => executeReadonlyGit(root, { id: "show", template: "show", target: "HEAD", paths: ["alpha.txt"] } as unknown as object),
      /readonly-git-match-invalid/,
    );
    // 非法模板 ⇒ 拒绝。
    await assert.rejects(
      () => executeReadonlyGit(root, { id: "push", template: "push", paths: [] } as unknown as object),
      /readonly-git-match-invalid/,
    );

    // 夹带 `argv` 的受限描述：执行体仍是 matcher 模板构造的 `git status`——argv 字段不被采用。
    const withSmuggledArgv = { ...match(["git", "status"]), argv: ["rm", "-rf", "."] } as unknown as object;
    const facts = await executeReadonlyGit(root, withSmuggledArgv);
    assert.equal(facts.exitCode, 0);
    assert.ok(facts.stdout.includes("untracked.txt"));
    assert.ok(fs.existsSync(path.join(root, "alpha.txt")), "被夹带的 argv 未被执行");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("alias 防线：repo-local alias 在传输前 fail-closed；固定 env/config 构造为静态单一来源", async () => {
  const root = makeRepo();
  try {
    // repo-local alias 会改变仓库语义——transport 在执行**之前**拒绝（inspectGitRepository 的
    // config 允许清单），alias 永远不可能被采用（比「内建优先」更强）。
    execFileSync(GIT_EXECUTABLE, ["config", "alias.status", "!echo pwned"], { cwd: root });
    await assert.rejects(() => executeReadonlyGit(root, match(["git", "status"])), /git-config-section-unsupported/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  // 固定 env/config 构造静态断言（executeGit 单一来源；不另写第二份 env）。
  const source = readFileSync(new URL("../../src/provider/trunk/impl/git-command.ts", import.meta.url), "utf8");
  for (const pattern of [
    /GIT_CONFIG_NOSYSTEM: "1"/,
    /GIT_CONFIG_GLOBAL: emptyFile/,
    /GIT_TERMINAL_PROMPT: "0"/,
    /PATH: path\.dirname\(executable\)/,
    /GIT_CEILING_DIRECTORIES: root/,
    /GIT_OPTIONAL_LOCKS: "0"/,
    /GIT_NO_REPLACE_OBJECTS: "1"/,
    /--no-pager", "--no-optional-locks", "--literal-pathspecs"/,
  ]) {
    assert.match(source, pattern, `固定传输环境/前缀必须保持：${pattern}`);
  }
});

test("预算有界：outputLimit 生效并如实标记 stdoutTruncated", async () => {
  const root = makeRepo();
  try {
    for (let i = 0; i < 40; i += 1) fs.writeFileSync(path.join(root, `f-${String(i).padStart(2, "0")}.txt`), "x\n");
    const facts = await executeReadonlyGit(root, match(["git", "status"]), { outputLimit: 16, timeoutMs: 5000 });
    assert.equal(facts.stdoutTruncated, true, "超过 outputLimit ⇒ 如实截断标记");
    assert.ok(facts.stdout.length <= 16, "输出不超过预算");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("执行面静态断言：executeReadonlyGit 经 buildReadonlyGitBody + executeGit（固定传输），不自行 spawn/拼 argv", () => {
  const source = readFileSync(new URL("../../src/provider/trunk/impl/git-command.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function executeReadonlyGit");
  assert.ok(start > 0, "executeReadonlyGit 必须存在于 trunk impl");
  const section = source.slice(start);
  assert.match(section, /buildReadonlyGitBody\(/, "规范体单一来源");
  assert.match(section, /executeGit\(/, "复用固定传输 executeGit（绝对可执行 + 固定 config/env）");
  assert.doesNotMatch(section, /spawn\(/, "执行入口自身不得直接 spawn");
  // GIT_EXECUTABLE 的使用点在 executeGit 内且经 realpath 归一。
  assert.match(source, /realpath\(GIT_EXECUTABLE\)/);
});

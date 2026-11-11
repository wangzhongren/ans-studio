// 门禁引擎测试：只读 Git 精确白名单 matcher / 规范体（2026-11-08，W3-G / 设计 P1.3 §2.4.3）
//
// 覆盖：
//   1) 10 个子命令的白名单全形态（精确 flag/参数；`git` 后第一项必须是子命令）与规范 argv 体；
//   2) §2.4.3「参数级攻击 → fail-closed」矩阵（全局选项、写盘/外部程序 flag、远程、paths magic、行号上限…）；
//   3) 边界：OID 完整 40/64 hex、HEAD 仅允许位置、字面路径规则、blame 行号 1..2000 与跨度；
//   4) 规则集 v5 迁移：`ans-default-v5`、只读白名单保留、v4/v3 规则集 fail-closed 整条拒绝；
//   5) 与 `gitQueryBody`（结构化查询模板）的**差分测试**：重叠模板逐条同规范 argv；
//      允许的分叉（log 默认 HEAD≠--all、--oneline、diff 显示 flag、ls-tree 默认 HEAD、blame/cat-file）逐条记录。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildReadonlyGitBody,
  classifyShellDetailed,
  defaultShellRules,
  gitQueryBody,
  matchReadonlyGit,
  type GitPolicyFacts,
  type ReadonlyGitMatch,
} from "../../src/common/门禁引擎/classify-shell.ts";

const OID40 = "a".repeat(40);
const OID40B = "b".repeat(40);
const OID64 = "c".repeat(64);
const rules = defaultShellRules();

/** 正形态：matcher 命中 + 分类器 allow（ruleId 口径固定）+ 规范体。 */
function expectAllowed(argv: string[], match: ReadonlyGitMatch, body: string[]): void {
  assert.deepEqual(matchReadonlyGit(argv), match, `matcher：${argv.join(" ")}`);
  assert.deepEqual(buildReadonlyGitBody(match), body, `规范体：${argv.join(" ")}`);
  const detail = classifyShellDetailed(argv, rules);
  assert.equal(detail.decision, "allow", `分类器 allow：${argv.join(" ")}`);
  assert.equal(detail.ruleId, `allow:readonly:git:${match.id}`, `ruleId：${argv.join(" ")}`);
}

/** 负形态：matcher 未命中 + 分类器维持硬拒（deny:raw-git-controlled-tools-required）。 */
function expectDenied(argv: unknown[]): void {
  assert.equal(matchReadonlyGit(argv), undefined, `matcher 必须不命中：${JSON.stringify(argv)}`);
  if (Array.isArray(argv) && argv.every((a) => typeof a === "string")) {
    const detail = classifyShellDetailed(argv as string[], rules);
    assert.equal(detail.decision, "deny", `分类器 deny：${argv.join(" ")}`);
    assert.equal(detail.ruleId, "deny:raw-git-controlled-tools-required", `ruleId：${argv.join(" ")}`);
  }
}

// ===========================================================================
// 1) 白名单全形态（§2.4.3 表；精确 flag/参数，未列即拒）
// ===========================================================================

test("status：`[--porcelain[=v1]] [--short|-s] [-- <literal path>…]` → 规范体固定 porcelain=v1 -z", () => {
  const body = ["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignore-submodules=all", "--"];
  for (const argv of [["git", "status"], ["git", "status", "--porcelain"], ["git", "status", "--porcelain=v1"],
    ["git", "status", "--short"], ["git", "status", "-s"], ["git", "status", "--porcelain", "--short", "-s"]]) {
    expectAllowed(argv, { id: "status", template: "status", paths: [] }, body);
  }
  expectAllowed(["git", "status", "--porcelain", "--", "src/a.ts", "docs/b.md"],
    { id: "status", template: "status", paths: ["src/a.ts", "docs/b.md"] }, [...body, "src/a.ts", "docs/b.md"]);
});

test("log：`[-<N>] [--oneline] [<full-oid>|HEAD] [-- <literal path>…]`；无目标默认 HEAD（不是 --all）", () => {
  expectAllowed(["git", "log"], { id: "log", template: "log", paths: [] },
    ["log", "-20", "--format=%H%x00%P%x00%s", "HEAD", "--"]);
  expectAllowed(["git", "log", "-5"], { id: "log", template: "log", limit: 5, paths: [] },
    ["log", "-5", "--format=%H%x00%P%x00%s", "HEAD", "--"]);
  expectAllowed(["git", "log", "--oneline"], { id: "log", template: "log", oneline: true, paths: [] },
    ["log", "-20", "--oneline", "--format=%H%x00%P%x00%s", "HEAD", "--"]);
  expectAllowed(["git", "log", "-100", "--oneline", OID40, "--", "docs/product/a.md"],
    { id: "log", template: "log", limit: 100, oneline: true, target: OID40, paths: ["docs/product/a.md"] },
    ["log", "-100", "--oneline", "--format=%H%x00%P%x00%s", OID40, "--", "docs/product/a.md"]);
  expectAllowed(["git", "log", "HEAD", "--", "src"], { id: "log", template: "log", target: "HEAD", paths: ["src"] },
    ["log", "-20", "--format=%H%x00%P%x00%s", "HEAD", "--", "src"]);
  // 64 位 hex（sha256 仓库）同样允许；OID 统一小写进规范体。
  expectAllowed(["git", "log", OID64.toUpperCase()], { id: "log", template: "log", target: OID64, paths: [] },
    ["log", "-20", "--format=%H%x00%P%x00%s", OID64, "--"]);
});

test("diff：`[--stat|--name-only|--name-status] [--no-ext-diff] [--no-textconv] [<oid> [<oid>]] [-- <path>…]`", () => {
  expectAllowed(["git", "diff"], { id: "diff", template: "diff", paths: [] },
    ["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--"]);
  expectAllowed(["git", "diff", "--stat"], { id: "diff", template: "diff", display: "stat", paths: [] },
    ["diff", "--stat", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--"]);
  expectAllowed(["git", "diff", "--name-only", "--no-ext-diff", OID40],
    { id: "diff", template: "diff", display: "name-only", target: OID40, paths: [] },
    ["diff", "--name-only", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", OID40, "--"]);
  expectAllowed(["git", "diff", "--name-status", OID40, OID40B, "--", "src/a.ts"],
    { id: "diff", template: "diff", display: "name-status", target: OID40, other: OID40B, paths: ["src/a.ts"] },
    ["diff", "--name-status", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", OID40, OID40B, "--", "src/a.ts"]);
});

test("show：`<full-oid>:<literal path>`（恰好一个）→ 规范体 cat-file blob", () => {
  expectAllowed(["git", "show", `${OID40}:docs/product/a.md`],
    { id: "show", template: "show", target: OID40, paths: ["docs/product/a.md"] },
    ["cat-file", "blob", `${OID40}:docs/product/a.md`]);
  expectAllowed(["git", "show", `${OID64.toUpperCase()}:src/a.ts`],
    { id: "show", template: "show", target: OID64, paths: ["src/a.ts"] },
    ["cat-file", "blob", `${OID64}:src/a.ts`]);
});

test("rev-parse：`--verify <full-oid|HEAD>` → 规范体补 ^{commit}", () => {
  expectAllowed(["git", "rev-parse", "--verify", "HEAD"],
    { id: "rev-parse", template: "rev-parse", target: "HEAD", paths: [] },
    ["rev-parse", "--verify", "HEAD^{commit}"]);
  expectAllowed(["git", "rev-parse", "--verify", OID40],
    { id: "rev-parse", template: "rev-parse", target: OID40, paths: [] },
    ["rev-parse", "--verify", `${OID40}^{commit}`]);
});

test("ls-files：`[--stage] [-z] [-- <path>…]` → 规范体固定 --stage -z", () => {
  expectAllowed(["git", "ls-files"], { id: "ls-files", template: "ls-files", paths: [] },
    ["ls-files", "--stage", "-z", "--"]);
  expectAllowed(["git", "ls-files", "--stage", "-z", "--", "src/a.ts"],
    { id: "ls-files", template: "ls-files", paths: ["src/a.ts"] },
    ["ls-files", "--stage", "-z", "--", "src/a.ts"]);
});

test("ls-tree：`[-r] [--full-tree] [<full-oid|HEAD>] [-- <path>…]`；无目标默认 HEAD", () => {
  expectAllowed(["git", "ls-tree"], { id: "ls-tree", template: "ls-tree", paths: [] },
    ["ls-tree", "-r", "-z", "--full-tree", "HEAD", "--"]);
  expectAllowed(["git", "ls-tree", "-r", "--full-tree", OID40, "--", "docs"],
    { id: "ls-tree", template: "ls-tree", target: OID40, paths: ["docs"] },
    ["ls-tree", "-r", "-z", "--full-tree", OID40, "--", "docs"]);
  expectAllowed(["git", "ls-tree", "HEAD"], { id: "ls-tree", template: "ls-tree", target: "HEAD", paths: [] },
    ["ls-tree", "-r", "-z", "--full-tree", "HEAD", "--"]);
});

test("merge-base：`<full-oid|HEAD> <full-oid|HEAD>`", () => {
  expectAllowed(["git", "merge-base", "HEAD", OID40],
    { id: "merge-base", template: "merge-base", target: "HEAD", other: OID40, paths: [] },
    ["merge-base", "HEAD", OID40]);
  expectAllowed(["git", "merge-base", OID40.toUpperCase(), OID64.toUpperCase()],
    { id: "merge-base", template: "merge-base", target: OID40, other: OID64, paths: [] },
    ["merge-base", OID40, OID64]);
});

test("blame：`[-L <start>,<end>] -- <literal path>`；行号 1..2000、跨度 ≤2000", () => {
  expectAllowed(["git", "blame", "--", "src/a.ts"], { id: "blame", template: "blame", paths: ["src/a.ts"] },
    ["blame", "--", "src/a.ts"]);
  expectAllowed(["git", "blame", "-L", "1,10", "--", "src/a.ts"],
    { id: "blame", template: "blame", lineStart: 1, lineEnd: 10, paths: ["src/a.ts"] },
    ["blame", "-L", "1,10", "--", "src/a.ts"]);
  expectAllowed(["git", "blame", "-L", "2000,2000", "--", "f"],
    { id: "blame", template: "blame", lineStart: 2000, lineEnd: 2000, paths: ["f"] },
    ["blame", "-L", "2000,2000", "--", "f"]);
});

test("cat-file：`(-t|-s|-e|-p) <oid>` 或 `(blob|commit|tree|tag) <oid>`", () => {
  for (const mode of ["-t", "-s", "-e", "-p", "blob", "commit", "tree", "tag"]) {
    expectAllowed(["git", "cat-file", mode, OID40],
      { id: "cat-file", template: "cat-file", target: OID40, catFileMode: mode as ReadonlyGitMatch["catFileMode"], paths: [] },
      ["cat-file", mode, OID40]);
  }
  expectAllowed(["git", "cat-file", "-p", OID64.toUpperCase()],
    { id: "cat-file", template: "cat-file", target: OID64, catFileMode: "-p", paths: [] },
    ["cat-file", "-p", OID64]);
});

// ===========================================================================
// 2) §2.4.3 参数级攻击矩阵 → fail-closed（不落审批）
// ===========================================================================

test("攻击矩阵：全局选项/改变目录或仓库 → 拒（`git` 后第一项必须是子命令）", () => {
  for (const argv of [
    ["git", "-c", "core.fsmonitor=helper", "status"],
    ["git", "--config-env=core.fsmonitor=EVIL", "status"],
    ["git", "-C", "other", "status"],
    ["git", "--git-dir", ".git", "status"],
    ["git", "--work-tree", "other", "status"],
    ["git", "--exec-path", "helper", "status"],
    ["git", "--namespace", "x", "log"],
    ["git", "--bare", "status"],
    ["git", "--no-pager", "log"],
    ["git", "--literal-pathspecs", "status"],
    ["git", "--version"],
    ["git", "--help"],
    ["git"],
  ]) expectDenied(argv as unknown[]);
});

test("攻击矩阵：写盘/外部程序 flag → 拒（--output/-o/--ext-diff/--textconv/--filters/pager）", () => {
  for (const argv of [
    ["git", "status", "--output=x"],
    ["git", "log", "--output", "x"],
    ["git", "log", "-o", "x"],
    ["git", "diff", "--ext-diff"],
    ["git", "log", "--ext-diff"],
    ["git", "show", "--textconv", `${OID40}:a`],
    ["git", "blame", "--textconv", "--", "a"],
    ["git", "cat-file", "--filters", OID40],
    ["git", "show", "--open-files-in-pager=x", OID40],
    ["git", "show", "-O", "helper", OID40],
    ["git", "log", "--paginate"],
  ]) expectDenied(argv);
});

test("攻击矩阵：任意路径/远程/子模块外部程序与网络子命令 → 拒", () => {
  for (const argv of [
    ["git", "diff", "--no-index", "a", "b"],
    ["git", "diff", "--submodule=log"],
    ["git", "fetch", "--upload-pack=helper"],
    ["git", "push", "--receive-pack=helper"],
    ["git", "ls-remote"],
    ["git", "status; rm -rf ."],
    ["git", "log", "--all"],
  ]) expectDenied(argv);
});

test("攻击矩阵：路径攻击（../、绝对路径、.git、:(glob)、通配、反斜杠、控制字符）→ 拒", () => {
  for (const argv of [
    ["git", "status", "--", "../outside"],
    ["git", "status", "--", "/etc/passwd"],
    ["git", "status", "--", "C:/Windows/win.ini"],
    ["git", "status", "--", ".git/config"],
    ["git", "status", "--", "docs/.GIT/config"],
    ["git", "status", "--", ":(glob)**"],
    ["git", "status", "--", "*.ts"],
    ["git", "status", "--", "docs/a?b"],
    ["git", "status", "--", "docs/a[0].md"],
    ["git", "status", "--", "src\\a.ts"],
    ["git", "status", "--", "src/a:b.ts"],
    ["git", "status", "--", ""],
    ["git", "status", "--", "."],
    ["git", "status", "--", "src/../a.ts"],
    ["git", "status", "--", "-x"],
    ["git", "status", "--", "src/a\u0001.ts"],
    ["git", "show", `${OID40}:../../etc/passwd`],
    ["git", "show", `${OID40}:.git/config`],
    ["git", "show", `${OID40}:docs/*.ts`],
    ["git", "show", `${OID40}:`],
    ["git", "blame", "-L", "1,999999999", "--", "x"],
    ["git", "blame", "-L", "0,10", "--", "x"],
    ["git", "blame", "-L", "10,5", "--", "x"],
    ["git", "blame", "-L", "1,2001", "--", "x"],
    ["git", "blame", "-L", "1,+10", "--", "x"],
  ]) expectDenied(argv);
});

// ===========================================================================
// 3) 边界：OID/HEAD/路径
// ===========================================================================

test("边界：OID 必须完整 40/64 hex；短 SHA/revision 表达式/分支名一律拒绝", () => {
  for (const token of ["abc1234", "a".repeat(39), "a".repeat(41), "a".repeat(63), "a".repeat(65),
    "HEAD~1", "main", "refs/heads/main", "a".repeat(40) + " ", "zzzz"]) {
    expectDenied(["git", "log", token]);
    expectDenied(["git", "rev-parse", "--verify", token]);
    expectDenied(["git", "cat-file", "-p", token]);
  }
  // 完整 40/64 hex 接受。
  assert.notEqual(matchReadonlyGit(["git", "cat-file", "-p", OID40]), undefined);
  assert.notEqual(matchReadonlyGit(["git", "cat-file", "-p", OID64]), undefined);
});

test("边界：HEAD 仅允许 log/rev-parse/ls-tree/merge-base 位置（diff/show/cat-file/blame 不接受）", () => {
  for (const argv of [
    ["git", "diff", "HEAD"],
    ["git", "show", "HEAD:README.md"],
    ["git", "cat-file", "-p", "HEAD"],
    ["git", "ls-files", "HEAD"],
    ["git", "log", "head"],
    ["git", "rev-parse", "--verify", "head"],
    ["git", "ls-tree", "head"],
    ["git", "merge-base", "head", OID40],
  ]) expectDenied(argv);
  assert.notEqual(matchReadonlyGit(["git", "log", "HEAD"]), undefined);
  assert.notEqual(matchReadonlyGit(["git", "rev-parse", "--verify", "HEAD"]), undefined);
  assert.notEqual(matchReadonlyGit(["git", "ls-tree", "HEAD"]), undefined);
  assert.notEqual(matchReadonlyGit(["git", "merge-base", "HEAD", "HEAD"]), undefined);
});

test("边界：路径必须位于 `--` 之后且为字面项目相对路径；目录尾斜杠允许、重复分隔符拒绝", () => {
  expectDenied(["git", "status", "src/a.ts"]); // 无 `--` 的位置参数不是 flag
  expectDenied(["git", "log", "src/a.ts"]);
  expectDenied(["git", "status", "--", "src//a.ts"]);
  expectDenied(["git", "status", "--", "src/a.ts", "--"]);
  assert.notEqual(matchReadonlyGit(["git", "status", "--", "src/"]), undefined);
  assert.notEqual(matchReadonlyGit(["git", "log", "--", "docs/product/"]), undefined);
});

test("边界：log 行数 / blame 行号上限；重复 flag 与超界拒绝", () => {
  for (const argv of [
    ["git", "log", "-0"], ["git", "log", "-101"], ["git", "log", "-1234"], ["git", "log", "-05"],
    ["git", "log", "-5", "-6"], ["git", "log", "--oneline", "--oneline"],
    ["git", "log", OID40, OID40B],
    ["git", "diff", "--stat", "--name-only"],
    ["git", "diff", OID40, OID40B, OID64],
    ["git", "status", "--porcelain=v2"],
    ["git", "rev-parse", "--verify"],
    ["git", "rev-parse", OID40],
    ["git", "merge-base", "HEAD"],
    ["git", "cat-file", "-p"],
    ["git", "show", `${OID40}:a`, "extra"],
    ["git", "blame", "x"],
    ["git", "blame", "--", "a", "b"],
  ]) expectDenied(argv);
});

// ===========================================================================
// 4) 规则集 v5 迁移（B4）：不兼容读 v4/v3，fail-closed
// ===========================================================================

test("规则集 v5：ans-default-v5、只读白名单保留、v4/v3 规则集整条拒绝（不静默放宽）", () => {
  const current = defaultShellRules();
  assert.equal(current.version, "5");
  assert.equal(current.id, "ans-default-v5");
  assert.equal(current.readOnly.some((rule) => rule.program.toLowerCase() === "git"), false);
  for (const old of ["4", "3"]) {
    const legacy = { ...defaultShellRules(), version: old } as never;
    const denied = classifyShellDetailed(["ls"], legacy);
    assert.equal(denied.decision, "deny", `v${old} 规则集必须整条拒绝`);
    assert.equal(denied.ruleId, "deny:rules-invalid");
    // 旧只读 Git 数据即使被外部带回来也不会被引擎读取（版本不符先拒）。
    assert.equal(classifyShellDetailed(["git", "status"], legacy).decision, "deny");
  }
});

// ===========================================================================
// 5) 差分测试：只读 Git 规范体 × 结构化 gitQueryBody（F5 单一来源）
//    重叠模板逐条断言「同一描述 → 同一规范 argv」；允许的分叉逐条记录。
// ===========================================================================

const queryFacts = (template: string, extra: Record<string, unknown> = {}): GitPolicyFacts =>
  ({ template, paths: [], ...extra } as unknown as GitPolicyFacts);
const oidFact = (hex: string) => ({ objectFormat: "sha1" as const, hex });

test("差分（重叠模板）：status/log(目标)/diff/show/rev-parse/ls-files/ls-tree(目标)/merge-base 同规范 argv", () => {
  const rows: Array<[ReadonlyGitMatch, GitPolicyFacts]> = [
    [matchReadonlyGit(["git", "status", "--", "docs/a.md"])!, queryFacts("status", { paths: ["docs/a.md"] })],
    [matchReadonlyGit(["git", "log", "-5", OID40])!, queryFacts("log", { paths: [], target: oidFact(OID40), limit: 5 })],
    [matchReadonlyGit(["git", "diff", OID40, "--", "src/a.ts"])!,
      queryFacts("diff", { paths: ["src/a.ts"], target: oidFact(OID40) })],
    [matchReadonlyGit(["git", "show", `${OID40}:docs/a.md`])!,
      queryFacts("show", { paths: ["docs/a.md"], target: oidFact(OID40) })],
    [matchReadonlyGit(["git", "rev-parse", "--verify", OID40])!, queryFacts("rev-parse", { target: oidFact(OID40) })],
    [matchReadonlyGit(["git", "ls-files", "--", "src/a.ts"])!, queryFacts("ls-files", { paths: ["src/a.ts"] })],
    [matchReadonlyGit(["git", "ls-tree", OID40, "--", "docs"])!,
      queryFacts("ls-tree", { paths: ["docs"], target: oidFact(OID40) })],
    [matchReadonlyGit(["git", "merge-base", OID40, OID40B])!,
      queryFacts("merge-base", { target: oidFact(OID40), other: oidFact(OID40B) })],
  ];
  for (const [match, facts] of rows) {
    assert.deepEqual(buildReadonlyGitBody(match), gitQueryBody(facts), `${match.id} 规范 argv 必须同源`);
  }
});

test("差分（允许的分叉，逐条记录）：log 默认 HEAD≠--all、--oneline、diff 显示 flag、ls-tree 默认 HEAD、blame/cat-file 新面", () => {
  // (1) log 无目标：README 读取路径默认 HEAD；结构化模板默认 --all（F1 客户可见权衡，设计 §0.3/§2.4.3）。
  const logDefault = buildReadonlyGitBody(matchReadonlyGit(["git", "log"])!);
  assert.ok(logDefault.includes("HEAD"), "log 无目标规范体默认 HEAD");
  assert.equal(logDefault.includes("--all"), false, "log 无目标**不得**默认 --all");
  const queryLogDefault = gitQueryBody(queryFacts("log", { paths: [] }))!;
  assert.ok(queryLogDefault.includes("--all"), "结构化模板 log 无目标仍为 --all（不受 shell 只读路径影响）");

  // (2) --oneline：仅 shell 只读路径支持的显示 flag（结构化模板无此形态）。
  const logOneline = buildReadonlyGitBody(matchReadonlyGit(["git", "log", "--oneline", OID40])!);
  assert.ok(logOneline.includes("--oneline"));
  assert.equal(gitQueryBody(queryFacts("log", { paths: [], target: oidFact(OID40) }))!.includes("--oneline"), false);

  // (3) diff 显示类 flag：只影响输出，规范体原样保留；结构化模板不带显示 flag。
  const diffStat = buildReadonlyGitBody(matchReadonlyGit(["git", "diff", "--stat", OID40])!);
  assert.ok(diffStat.includes("--stat"));
  assert.equal(gitQueryBody(queryFacts("diff", { paths: [], target: oidFact(OID40) }))!.includes("--stat"), false);

  // (4) ls-tree 无目标：只读路径默认 HEAD；结构化模板要求显式 target（返回 undefined 即拒绝）。
  assert.ok(buildReadonlyGitBody(matchReadonlyGit(["git", "ls-tree"])!).includes("HEAD"));
  assert.equal(gitQueryBody(queryFacts("ls-tree", { paths: [] })), undefined);

  // (5) blame / cat-file：结构化模板清单不含这两个模板（新增 shell 只读面，受 §2.4.3 参数约束）。
  assert.equal(gitQueryBody(queryFacts("blame", { paths: ["a"] })), undefined);
  assert.equal(gitQueryBody(queryFacts("cat-file", { target: oidFact(OID40) })), undefined);
  assert.ok(buildReadonlyGitBody(matchReadonlyGit(["git", "blame", "--", "a"])!).length > 0);
  assert.ok(buildReadonlyGitBody(matchReadonlyGit(["git", "cat-file", "-p", OID40])!).length > 0);
});

// test/门禁引擎/shell-write-guard.test.ts
// 2026-10-29（方案 v2.1 §6.3/§6.4，Q1 A）：shell 写目标守卫单元测试——
// 显式写目标越界/禁写路径 ⇒ deny；边界内 ⇒ pass（继续既有审批链）；不透明执行 ⇒ script；
// 只读/测试命令不受影响；逐目标调用注入的 checkWrite（同一个 resolveWrite 口径）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { evaluateShellWriteTargets, type ShellWriteGuardInput } from "../../src/common/门禁引擎/shell-write-guard.ts";
import { classifyShellDetailed, defaultShellRules, matchRoutineShellCommand } from "../../src/common/门禁引擎/classify-shell.ts";

const ROOT = "/proj";

function guard(
  argv: string[],
  allowed: (rel: string) => boolean = (rel) => rel === "src" || rel.startsWith("src/") || rel === "note.md",
  extras: Partial<ShellWriteGuardInput> = {},
) {
  const calls: string[] = [];
  const decision = evaluateShellWriteTargets({
    argv,
    cwd: ROOT,
    projectRoot: ROOT,
    skillRoot: ROOT,
    boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
    forbiddenPrefixes: [".ans/", "角色卡/"],
    checkWrite: (rel) => {
      calls.push(rel);
      return allowed(rel) ? { allowed: true } : { allowed: false, reason: "未匹配条目" };
    },
    ...extras,
  });
  return { decision, calls };
}

test("显式写目标：cp 目标越界 ⇒ deny（列出目标），边界内 ⇒ pass 且逐目标过 checkWrite", () => {
  const bad = guard(["cp", "src/a.ts", "other/b.ts"]);
  assert.equal(bad.decision.kind, "deny");
  if (bad.decision.kind === "deny") {
    assert.deepEqual(bad.decision.targets, ["other/b.ts"]);
    assert.match(bad.decision.reason, /写边界|写目标/);
  }
  const ok = guard(["cp", "src/a.ts", "src/b.ts"]);
  assert.equal(ok.decision.kind, "pass");
  assert.deepEqual(ok.calls, ["src/b.ts"], "只判定写入目标（源不写）");
});

test("mv/rename 源也被删除 ⇒ 源+目标都判定；rm/touch/mkdir/tee 全部目标判定", () => {
  const mv = guard(["mv", "other/a.ts", "src/a.ts"]);
  assert.equal(mv.decision.kind, "deny", "mv 的源目录越界（删除）也必须拒绝");
  assert.deepEqual(mv.calls, ["other/a.ts"]);
  const rm = guard(["rm", "-rf", "src/tmp", "other/tmp"]);
  assert.equal(rm.decision.kind, "deny");
  const touch = guard(["touch", "note.md"]);
  assert.equal(touch.decision.kind, "pass");
  const mkdir = guard(["mkdir", "-p", "src/new"]);
  assert.equal(mkdir.decision.kind, "pass");
  const tee = guard(["tee", "other/log.txt"]);
  assert.equal(tee.decision.kind, "deny");
});

test("sed -i / chmod / ln 目标解析；禁写前缀优先于 checkWrite（.ans/、角色卡/）", () => {
  const sed = guard(["sed", "-i", "s/a/b/", "src/a.ts"]);
  assert.equal(sed.decision.kind, "pass");
  assert.deepEqual(sed.calls, ["src/a.ts"]);
  const chmod = guard(["chmod", "755", "other/x"]);
  assert.equal(chmod.decision.kind, "deny");
  const ln = guard(["ln", "-s", "src/a.ts", "other/link"]);
  assert.equal(ln.decision.kind, "deny");
  const forbidden = guard(["cp", "src/a.ts", ".ans/state/x.json"], () => true);
  assert.equal(forbidden.decision.kind, "deny");
  if (forbidden.decision.kind === "deny") assert.match(forbidden.decision.reason, /禁写/);
  assert.deepEqual(forbidden.calls, [], "禁写前缀命中时不调用 checkWrite（硬拒优先）");
});

test("逃逸防御：绝对路径越界 / `..` 逃出项目根 ⇒ deny；项目内绝对路径可判定", () => {
  const absolute = guard(["cp", "src/a.ts", "/outside/b.ts"]);
  assert.equal(absolute.decision.kind, "deny");
  const dotdot = guard(["rm", "../../outside.txt"]);
  assert.equal(dotdot.decision.kind, "deny");
  const insideAbs = guard(["cp", "src/a.ts", "/proj/src/c.ts"]);
  assert.equal(insideAbs.decision.kind, "pass");
});

test("脚本审查（v2.3/R2）：解释器脚本/npm run（非例行）/npm install/构建工具 ⇒ script（携带内容）；只读命令 pass", () => {
  for (const argv of [
    ["node", "docs/scheduling/copy-to-root.mjs"],
    ["python3", "tool.py"],
    ["node", "-m", "pkg"],
    ["npm", "run", "build"],
    ["npm", "run", "test:unit"],
    ["npm", "install"],
    ["npm", "test", "--", "--ci"],
    ["npm", "ci", "--ignore-scripts"],
    ["node", "--test", "../outside.test.ts"],
    ["node", "--test", "--import", "src/setup.ts"],
    ["tsc"],
    ["tsc", "-p", "tsconfig.json"],
    ["npx", "some-cli"],
    ["make"],
    ["cargo", "build"],
    ["go", "build"],
    ["bash", "src/job.sh"],
  ]) {
    const result = guard(argv);
    assert.equal(result.decision.kind, "script", `${argv.join(" ")} 应判 script（进入脚本审查）`);
  }
  for (const argv of [["cat", "README.md"], ["git", "status"], ["ls", "-la"]]) {
    const result = guard(argv);
    assert.equal(result.decision.kind, "pass", `${argv.join(" ")} 应 pass（只读）`);
  }
});

// 2026-10-31（方案 v1.3 §5.3 关键陷阱）：例行命令在写守卫**必须**返回 pass——否则 `node --test`/npm
// 脚本分支先返回 script，把 (c) 的确定性放行抢先吃掉（0 卡不成立）。谓词与分类器是**同一函数引用**（AC-12）。
test("例行命令确定性白名单（§5.1/§5.3）：命中 ⇒ pass（不进脚本审查），且与分类器同一谓词", () => {
  const rules = defaultShellRules();
  const ROUTINE: ReadonlyArray<{ argv: string[]; id: string }> = [
    { argv: ["npm", "test"], id: "npm-test" },
    { argv: ["npm", "run", "test"], id: "npm-run-test" },
    { argv: ["npm", "run", "typecheck"], id: "npm-run-typecheck" },
    { argv: ["npm", "run", "lint"], id: "npm-run-lint" },
    { argv: ["npm", "run", "check"], id: "npm-run-check" },
    { argv: ["node", "--test"], id: "node-test" },
    { argv: ["node", "--test", "test/a.test.ts"], id: "node-test" },
    { argv: ["node", "--test", "test/门禁引擎/classify-shell.test.ts"], id: "node-test" },
    { argv: ["tsc", "--noEmit"], id: "tsc-noemit" },
    { argv: ["npm", "ci"], id: "npm-ci" },
  ];
  for (const { argv, id } of ROUTINE) {
    assert.deepEqual(matchRoutineShellCommand([...argv]), { id }, `谓词应命中：${argv.join(" ")}`);
    const result = guard(argv);
    assert.equal(result.decision.kind, "pass", `${argv.join(" ")} 应 pass（(c) 已确定性放行，不得抢判 script）`);
    assert.deepEqual(result.calls, [], `${argv.join(" ")} 无显式写目标，不调用 checkWrite`);
    // AC-12 第 3 点：同一 argv 在分类器得 allow:routine:<id>、在写守卫得 pass。
    const detail = classifyShellDetailed([...argv], rules);
    assert.equal(detail.decision, "allow", `分类器应 allow：${argv.join(" ")}`);
    assert.equal(detail.ruleId, `allow:routine:${id}`, `分类器 ruleId 应稳定：${argv.join(" ")}`);
  }
});

test("mv/rename 源删除：源越界/目标越界都 deny；源与目标均在写区内 pass", () => {
  for (const argv of [
    ["mv", "other/a.ts", "src/a.ts"],
    ["rename", "other/a.ts", "src/a.ts"],
    ["mv", "src/a.ts", "other/a.ts"],
    ["ren", "src/a.ts", "other/a.ts"],
  ]) {
    assert.equal(guard(argv).decision.kind, "deny", `${argv.join(" ")}（源删除/目标写入）越界 ⇒ deny`);
  }
  assert.equal(guard(["mv", "src/a.ts", "src/b.ts"]).decision.kind, "pass");
  assert.equal(guard(["mv", "-t", "src/", "src/a.ts"]).decision.kind, "pass");
  assert.equal(guard(["mv", "-t", "src/", "/outside/a"]).decision.kind, "deny", "mv -t 的源在项目外被删除 ⇒ deny");
  assert.equal(guard(["rename", "-t", "src/", "other/a"]).decision.kind, "deny", "mv -t 源在写区外 ⇒ deny");
  // `cp --target-directory <dir>` 空格形式：写区内 pass；项目外 deny。
  assert.equal(guard(["cp", "--target-directory", "src/", "a.ts"]).decision.kind, "pass");
  assert.equal(guard(["cp", "--target-directory", "/outside/", "a.ts"]).decision.kind, "deny");
});test("cwd 不在项目根（旧桩/异常）⇒ 以项目根为基准，不按外部目录解释后放行", () => {
  const result = guard(["touch", "note.md"], undefined, { cwd: "/elsewhere" });
  assert.equal(result.decision.kind, "pass");
  assert.deepEqual(result.calls, ["note.md"]);
});

test("TaskScope 收窄经由注入的 checkWrite 生效（守卫不另写路径判定）", () => {
  const result = evaluateShellWriteTargets({
    argv: ["touch", "src/b.ts"],
    cwd: ROOT,
    projectRoot: ROOT,
    skillRoot: ROOT,
    boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
    scope: { writeSet: ["src/a.ts"], conditions: [] },
    forbiddenPrefixes: [],
    checkWrite: (rel) => ({ allowed: rel === "src/a.ts" }),
  });
  assert.equal(result.kind, "deny", "任务 scope 外的目标被同一 checkWrite 拒绝");
});


test("P6 返工（客户 Q1/Q2 口径修正）：静态可证明越界 ⇒ deny；不可解析 ⇒ script（交审查）", () => {
  // 1) 静态可证明写目标全在写区外（或含越界目标）⇒ 直接拒绝，不弹卡、不进 judge。
  const provableOutside: string[][] = [
    ["cp", "-t", "/outside/", "a.ts"],
    ["cp", "--target-directory=/outside/", "a.ts"],
    ["cp", "--target-directory", "/outside/", "a.ts"],
    ["ln", "-t", "/outside/", "a.ts"],
    ["install", "-t", "/outside/", "a.ts"],
    ["install", "a.ts", "/outside/b.ts"],
    ["find", "/outside", "-delete"],
    ["rsync", "-a", "src/a", "/outside/"],
    ["tar", "-xf", "x.tar", "-C", "/outside"],
    ["curl", "-o", "/outside/out", "https://example.com"],
    ["sort", "-o", "/outside/out", "src/in"],
    ["dd", "of=/outside/x", "if=src/a"],
    ["rm", "/outside/x"],
    // 复验 F1：re-shell/内联求值/awk/find -exec 仍硬拒。
    ["bash", "-c", "rm -rf src"],
    ["sh", "-c", "rm -rf src"],
    ["eval", "echo ok"],
    ["exec", "rm", "-rf", "src"],
    ["source", "src/job.sh"],
    ["awk", "BEGIN{system(\"rm -rf src\")}"],
    ["find", ".", "-exec", "rm", "{}", ";"],
    // 复验 F2：mv -t 的源删除同样校验。
    ["mv", "-t", "src/", "/outside/a"],
    // 复验 F6：长内联/超界仍 deny。
    ["node", "-e", "x".repeat(3000)],
    ["python", "-c", Array.from({ length: 11 }, () => "print(1)").join("\n")],
  ];
  for (const argv of provableOutside) {
    const result = guard(argv);
    assert.equal(result.decision.kind, "deny", `${argv.join(" ")} 静态可证明越界 ⇒ deny`);
  }

  // 2) 目标可判定且在写区内 ⇒ 正常放行（plain/目标型选项均可解析）。
  for (const argv of [
    ["cp", "src/a.ts", "src/b.ts"],
    ["cp", "-t", "src/", "a.ts"],
    ["cp", "--target-directory=src/", "a.ts"],
    ["mv", "-t", "src/", "src/a.ts"],
    ["ln", "-t", "src/", "a.ts"],
    ["install", "-t", "src/", "a.ts"],
    ["rm", "src/tmp"],
    ["sort", "-o", "src/out", "src/in"],
  ]) {
    assert.equal(guard(argv).decision.kind, "pass", `${argv.join(" ")} 写区内 ⇒ pass`);
  }

  // 3) 写目标无法静态解析 ⇒ script（开关开 → judge 审查脚本/上下文；关 → 客户卡）。
  for (const argv of [
    ["find", "src", "-delete"],
    ["xargs", "rm", "-rf"],
    ["git", "clean", "-fdx"],
    ["git", "checkout", "--", "."],
    ["git", "restore", "."],
    ["rsync", "-a", "src/a", "src/"],
    ["tar", "-xf", "x.tar", "-C", "src/"],
    ["tar", "-cf", "src/x.tar", "src/"],
    ["cp", "-S", ".bak", "src/a.ts", "src/b.ts"],
    ["dd", "if=src/a"],
    ["patch", "-p1"],
  ]) {
    assert.equal(guard(argv).decision.kind, "script", `${argv.join(" ")} 无法静态解析 ⇒ script`);
  }

  // 4) shell 脚本/内联代码 ⇒ script（内容进入审查）；版本查询等只读形态不受影响。
  for (const argv of [["bash", "src/job.sh"], ["zsh", "tool.zsh"]]) {
    assert.equal(guard(argv).decision.kind, "script", `${argv.join(" ")} shell 脚本 ⇒ script`);
  }
  for (const argv of [["sh", "-c", "rm -rf src"], ["bash", "-c", "x"]]) {
    assert.equal(guard(argv).decision.kind, "deny", `${argv.join(" ")} shell 内联 ⇒ deny`);
  }
  assert.equal(guard(["bash", "--version"]).decision.kind, "pass");

  // 5) 只读形态不受影响。
  assert.equal(guard(["tar", "-tf", "x.tar"]).decision.kind, "pass");
  assert.equal(guard(["git", "status"]).decision.kind, "pass");
  assert.equal(guard(["find", "src", "-name", "*.ts"]).decision.kind, "pass");
});

// —————————————— 2026-11-04 C2b：冻结注入 / stable 目标拒绝 ——————————————

test("C2b 冻结注入：frozen 拒绝 / draft 允许 / unknown fail-closed；缺省保留旧「存在即拒」", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shell-freeze-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "proposals"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs/proposals/focus-proposal-v1.md"), "# v1\n", "utf8");
    const run = (argv: string[], freezeStateOf?: (rel: string) => "frozen" | "draft" | "unknown") =>
      evaluateShellWriteTargets({
        argv,
        cwd: root,
        projectRoot: root,
        skillRoot: root,
        boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
        forbiddenPrefixes: [],
        checkWrite: () => ({ allowed: true }),
        ...(freezeStateOf !== undefined ? { freezeStateOf } : {}),
      });
    const existing = "docs/proposals/focus-proposal-v1.md";
    const next = "docs/proposals/focus-proposal-v2.md";
    // frozen ⇒ deny（覆盖/删除）；draft ⇒ allow。
    assert.equal(run(["cp", "src/a", existing], () => "frozen").kind, "deny");
    assert.equal(run(["rm", existing], () => "frozen").kind, "deny");
    assert.equal(run(["cp", "src/a", existing], () => "draft").kind, "pass");
    assert.equal(run(["rm", existing], () => "draft").kind, "pass");
    // unknown ⇒ fail-closed（既有与新建都拒绝，C10）。
    assert.equal(run(["cp", "src/a", existing], () => "unknown").kind, "deny");
    assert.equal(run(["cp", "src/a", next], () => "unknown").kind, "deny");
    // 新建 vN+1：draft/缺省 ⇒ allow。
    assert.equal(run(["cp", "src/a", next], () => "draft").kind, "pass");
    assert.equal(run(["cp", "src/a", next]).kind, "pass");
    // 缺省注入：既有 ⇒ 旧保护 deny。
    assert.equal(run(["cp", "src/a", existing]).kind, "deny");
    // mv：源 draft + 目标新路径 ⇒ pass；目标为 frozen 既有文档 ⇒ deny。
    assert.equal(run(["mv", existing, next], () => "draft").kind, "pass");
    fs.writeFileSync(path.join(root, "docs/proposals/focus-proposal-v2.md"), "# v2\n", "utf8");
    assert.equal(run(["mv", existing, next], (rel) => (rel === next ? "frozen" : "draft")).kind, "deny");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("C2b shell 写 stable 一律拒绝（C7）；opaque 提及 stable 也拒绝；注入许可不放行", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-shell-stable-"));
  try {
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.mkdirSync(path.join(root, "角色卡", "designer"), { recursive: true });
    const run = (argv: string[], extras: Partial<ShellWriteGuardInput> = {}) =>
      evaluateShellWriteTargets({
        argv,
        cwd: root,
        projectRoot: root,
        skillRoot: root,
        boundary: { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } },
        forbiddenPrefixes: [],
        checkWrite: () => ({ allowed: true }),
        ...extras,
      });
    const workflow = run(["cp", "src/a", "docs/workflow.md"]);
    assert.equal(workflow.kind, "deny");
    if (workflow.kind === "deny") {
      assert.equal(workflow.code, "stable-write-permit-missing");
      assert.match(workflow.reason, /stable/);
    }
    const card = run(["touch", "角色卡/designer/role-card.md"]);
    assert.equal(card.kind, "deny");
    const boundary = run(["tee", "角色卡/designer/boundary.yaml"]);
    assert.equal(boundary.kind, "deny");
    // opaque 命令文本提及 stable ⇒ deny（无内容 hash，不得走脚本审查后放行）。
    const opaque = run(["node", "script.js", "docs/workflow.md"]);
    assert.equal(opaque.kind, "deny");
    if (opaque.kind === "deny") assert.equal(opaque.code, "stable-write-permit-missing");
    // shell 无法提供内容 hash：即使注入 stablePermitOf 也不放行。
    const withPermit = run(["cp", "src/a", "docs/workflow.md"], { stablePermitOf: () => ({ permitId: "permit-1" }) as never });
    assert.equal(withPermit.kind, "deny");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

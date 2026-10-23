// test/测试/directory-layout.test.ts
// 2026-10-23 目录级授权（T3）：**实际布局核对 e2e**（策划方案 §6.1–§6.4；验收标准 P12）。
//
// 口径：
//   · 临时项目根（真实 git 仓库）内只读运行产品纯函数：
//     计划由真实 `parseTeamPlan`（pipeline 公共出口）解析，改动清单直接取**原始 `git status --short`**
//     （含未跟踪 `??`、删除 ` D`、重命名 `R old -> new`），报告逐路径可复算并与原始 status/diff 一致。
//   · 覆盖：目录内新增文件/子目录 pass；跨目录/他人目录/禁写区/命名不符/子目录越界/路径逃逸 fail；
//     删除按原路径、重命名按新路径；管理记录与角色根工作文档跳过。
//   · 全部在系统临时目录内，用后清理；不读 `.env`、不跑真实模型/凭据/网络。

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import {
  checkDirectoryLayout,
  layoutCheckPassed,
  parseTeamPlan,
  teamPlanIssueMessages,
} from "../../src/pipeline/orchestration/run-role.ts";
import {
  FLOW,
  makeRoot,
  teamPlanV3Doc,
  v3CanonicalParts,
  write,
} from "./governance-e2e-auto/fixture.ts";
import type { LayoutCheckResult } from "../../src/common/编排/directory-conformance.ts";

interface GitResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function git(root: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function statusLines(root: string): string[] {
  // `--untracked-files=all`：未跟踪目录逐文件列出（缺省 `?? dir/` 会折叠目录，无法逐路径核对）。
  const result = git(root, ["status", "--short", "--untracked-files=all"]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim() !== "");
}

function diffPaths(root: string, cached: boolean): string[] {
  const args = cached ? ["diff", "--cached", "--name-only"] : ["diff", "--name-only"];
  const result = git(root, args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}

function reportOf(rows: LayoutCheckResult["rows"], rawStatus: string[], rawDiff: string[]): string {
  const lines = [
    "# 布局核对：flow-a / fixture-candidate",
    "",
    `- 候选哈希（raw status+diff sha256）：${createHash("sha256").update([...rawStatus, ...rawDiff].join("\n")).digest("hex")}`,
    "- 计划：docs/scheduling/flow-a-team-v1.md（teamPlanSchema: 3）",
    "",
    "## 原始候选（git status --short / diff --name-only）",
    "```text",
    ...rawStatus,
    "```",
    "",
    "## 逐路径核对",
    "| 改动路径 | owner | 目录 | 类型 | 子目录 | 命名 | 禁写区 | 路径安全 | 结果 | 原因 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.path} | ${row.owner ?? "—"} | ${row.dir ?? "—"} | ${row.checks.type ? "✓" : "✗"} | ${row.checks.subdir ? "✓" : "✗"} | ${row.checks.naming ? "✓" : "✗"} | ${row.checks.forbidden ? "✓" : "✗"} | ${row.checks.pathSafe ? "✓" : "✗"} | ${row.result}${row.skipped === true ? "（跳过）" : ""}${row.deleted === true ? "（删除）" : ""} | ${row.reason ?? ""} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

test("布局核对 e2e：授权目录内 pass；跨目录/他人目录/禁写区/命名/子目录/逃逸 fail；删除/重命名按原/新路径；报告可复算", () => {
  const temp = makeRoot("directory-layout");
  try {
    const root = temp.root;
    // 真实 v3 计划（两 Map + 一个既有 Reduce；计划文件本身是管理记录，布局核对跳过）。
    const parts = v3CanonicalParts(FLOW);
    const planText = teamPlanV3Doc(FLOW, {
      modules: parts.modules,
      recommended: parts.recommended,
      rows: parts.rows,
      moduleRows: parts.moduleRows,
      directoryRows: parts.directoryRows,
    });
    write(root, `docs/scheduling/${FLOW}-team-v1.md`, planText);

    // —— 临时 git 仓库：初始提交（用于真实 `git status --short` 的 D/R/?? 行） ——
    assert.equal(git(root, ["init", "-q"]).status, 0);
    assert.equal(git(root, ["config", "user.email", "test@example.com"]).status, 0);
    assert.equal(git(root, ["config", "user.name", "layout-fixture"]).status, 0);
    assert.equal(git(root, ["config", "core.autocrlf", "false"]).status, 0);
    assert.equal(git(root, ["config", "core.quotePath", "false"]).status, 0);
    const initial: Record<string, string> = {
      "src/storefront/legacy-old.ts": "export const legacy = 1;\n",
      "src/storefront/rename-me.ts": "export const renameMe = 1;\n",
      "src/storefront/move-me.ts": "export const moveMe = 1;\n",
      "src/storefront/index.ts": "export const root = 1;\n",
      "scripts/tool.ts": "export const tool = 1;\n",
      "角色卡/executor/memo.md": "# memo\n\n- 2026-10-23 角色根工作文档\n",
    };
    for (const [rel, content] of Object.entries(initial)) write(root, rel, content);
    assert.equal(git(root, ["add", "-A"]).status, 0);
    const commit = git(root, ["commit", "-q", "-m", "init"]);
    assert.equal(commit.status, 0, commit.stderr);

    // —— 候选改动：新增（含子目录）/删除/重命名/跨目录重命名/命名不符/子目录越界/禁写区/目录外 ——
    write(root, "src/storefront/handlers/create-order.ts", "export const createOrder = 1;\n");
    write(root, "src/storefront/tests/create-order.test.ts", "import { test } from \"node:test\";\ntest(\"x\", () => {});\n");
    write(root, "src/checkout/handlers/quote.ts", "export const quote = 1;\n");
    write(root, "src/storefront/CreateOrder.ts", "export const bad = 1;\n");
    write(root, "src/storefront/models/order.ts", "export const badSubdir = 1;\n");
    write(root, "src/storefront/.env", "SECRET=fixture-only\n");
    write(root, "scripts/build.ts", "export const build = 1;\n");
    write(root, "docs/scheduling/raw-note.md", "# note\n");
    write(root, "角色卡/executor/extra.md", "# extra\n");
    unlinkSync(path.join(root, "src/storefront/legacy-old.ts"));
    unlinkSync(path.join(root, "scripts/tool.ts"));
    const renameInDir = git(root, ["mv", "src/storefront/rename-me.ts", "src/storefront/renamed.ts"]);
    assert.equal(renameInDir.status, 0, renameInDir.stderr);
    const renameCross = git(root, ["mv", "src/storefront/move-me.ts", "src/checkout/moved.ts"]);
    assert.equal(renameCross.status, 0, renameCross.stderr);

    // —— 原始候选清单：`git status --short`（含未跟踪/删除/重命名）——
    const rawStatus = statusLines(root);
    assert.ok(rawStatus.some((line) => /^\?\? src\/storefront\/handlers\/create-order\.ts$/.test(line)), "应含未跟踪新增");
    assert.ok(rawStatus.some((line) => /^ ?D src\/storefront\/legacy-old\.ts$/.test(line)), "应含删除（按原路径）");
    assert.ok(
      rawStatus.some((line) => /^R  src\/storefront\/rename-me\.ts -> src\/storefront\/renamed\.ts$/.test(line)),
      "应含重命名（按新路径）",
    );
    assert.ok(
      rawStatus.some((line) => /^R  src\/storefront\/move-me\.ts -> src\/checkout\/moved\.ts$/.test(line)),
      "应含跨目录重命名",
    );
    assert.ok(rawStatus.some((line) => /^ ?D scripts\/tool\.ts$/.test(line)), "应含目录外删除");

    const parsed = parseTeamPlan(planText, { flowId: FLOW, projectRoot: root });
    assert.equal(parsed.ok, true, teamPlanIssueMessages(parsed).join("；"));
    const roleDirs = new Map(parsed.roleRows.map((row) => [row.roleId, row.authorizedDirs.map((entry) => entry.path)]));

    const check = (changedPaths: string[], roleId?: string): LayoutCheckResult =>
      checkDirectoryLayout({
        changedPaths,
        specs: parsed.directorySpecs,
        roleDirs,
        projectRoot: root,
        ...(roleId !== undefined ? { roleId } : {}),
      });

    const result = check(rawStatus);
    const rowOf = (rel: string) => {
      const row = result.rows.find((candidate) => candidate.path === rel);
      assert.ok(row, `报告应含路径 ${rel}；rows=${JSON.stringify(result.rows.map((entry) => entry.path))}`);
      return row;
    };

    // ① 目录内新增文件/子目录 pass。
    for (const rel of ["src/storefront/handlers/create-order.ts", "src/storefront/tests/create-order.test.ts", "src/checkout/handlers/quote.ts"]) {
      const row = rowOf(rel);
      assert.equal(row.result, "pass", `${rel}: ${row.reason ?? ""}`);
      assert.equal(row.dir?.startsWith("src/"), true);
    }
    assert.equal(rowOf("src/storefront/handlers/create-order.ts").owner, "executor");
    assert.equal(rowOf("src/checkout/handlers/quote.ts").owner, "reviewer");

    // ② 删除按原路径、重命名按新路径。
    const deleted = rowOf("src/storefront/legacy-old.ts");
    assert.equal(deleted.result, "pass");
    assert.equal(deleted.deleted, true, "删除行标记 deleted");
    const renamed = rowOf("src/storefront/renamed.ts");
    assert.equal(renamed.result, "pass", renamed.reason ?? "");
    assert.notEqual(renamed.deleted, true, "重命名按新路径（非删除）");
    assert.equal(rowOf("src/checkout/moved.ts").owner, "reviewer", "跨目录重命名取新路径归属");

    // ③ 命名不符/子目录越界/禁写区/目录外/删除到目录外 ⇒ fail。
    const naming = rowOf("src/storefront/CreateOrder.ts");
    assert.equal(naming.result, "fail");
    assert.equal(naming.checks.naming, false);
    assert.match(naming.reason ?? "", /命名规范/);
    const subdir = rowOf("src/storefront/models/order.ts");
    assert.equal(subdir.result, "fail");
    assert.equal(subdir.checks.subdir, false);
    assert.match(subdir.reason ?? "", /允许子目录/);
    const forbidden = rowOf("src/storefront/.env");
    assert.equal(forbidden.result, "fail");
    assert.equal(forbidden.checks.forbidden, false, "命中禁写区 .env");
    assert.match(forbidden.reason ?? "", /禁写区/);
    for (const rel of ["scripts/build.ts", "scripts/tool.ts"]) {
      const row = rowOf(rel);
      assert.equal(row.result, "fail");
      assert.match(row.reason ?? "", /不在任何授权目录内/);
    }
    assert.equal(rowOf("scripts/tool.ts").deleted, true);

    // ④ 管理记录/角色根工作文档跳过（不是产品候选）。
    assert.equal(
      result.rows.some((row) => row.path === `docs/scheduling/${FLOW}-team-v1.md`),
      false,
      "计划文件未被本轮改动（不在 status 中）",
    );
    assert.equal(rowOf("docs/scheduling/raw-note.md").skipped, true);
    assert.equal(rowOf("角色卡/executor/extra.md").skipped, true);

    // ⑤ 他人目录：按 executor 自检 ⇒ 跨目录 fail；全局核对按 owner 归属。
    const cross = check(["src/checkout/handlers/quote.ts", "src/checkout/moved.ts"], "executor");
    assert.equal(cross.ok, false);
    for (const row of cross.rows) {
      assert.equal(row.result, "fail");
      assert.match(row.reason ?? "", /非本次角色 executor/);
    }
    const executorOwn = check(["src/storefront/handlers/create-order.ts"], "executor");
    assert.equal(layoutCheckPassed(executorOwn), true);

    // ⑥ 路径逃逸（词法）：.. / 绝对路径 ⇒ fail pathSafe。
    for (const escape of ["../outside.ts", "src/storefront/../../escape.ts", "C:/abs/escape.ts"]) {
      const row = check([escape]).rows[0]!;
      assert.equal(row.result, "fail", `${escape} 应 fail`);
      assert.equal(row.checks.pathSafe, false);
    }

    // ⑦ 报告可复算：同一输入两次核对逐行一致；行数 = 原始 status 行数。
    const second = check(rawStatus);
    assert.deepEqual(second.rows, result.rows, "同一候选两次核对结果逐行一致");
    assert.equal(result.rows.length, rawStatus.length, "报告行数等于原始 git status 行数");
    assert.equal(layoutCheckPassed(result), false, "含 fail 行 ⇒ 整体不通过（fail 不得标 pass）");

    // ⑧ 与原始 git diff 一致：unstaged（删除）与 staged（重命名）路径都能在报告中追溯。
    const unstaged = diffPaths(root, false);
    const staged = diffPaths(root, true);
    assert.ok(unstaged.includes("src/storefront/legacy-old.ts"), `unstaged diff 应含删除；实际=${JSON.stringify(unstaged)}`);
    assert.ok(unstaged.includes("scripts/tool.ts"));
    const report = reportOf(result.rows, rawStatus, [...unstaged, ...staged]);
    // 重命名路径（新路径）在报告中；旧路径保留在原始 status 行里（报告原文含 raw status 段）。
    for (const rel of ["src/storefront/legacy-old.ts", "src/storefront/renamed.ts", "src/checkout/moved.ts"]) {
      assert.match(report, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    for (const rel of [...unstaged, ...staged]) {
      const inRows = result.rows.some((row) => row.path === rel);
      const inRaw = rawStatus.some((line) => line.includes(rel));
      assert.ok(inRows || inRaw, `diff 路径 ${rel} 必须能在报告（行或原始 status）中追溯`);
    }
    // 候选哈希可复算。
    const hash = createHash("sha256").update([...rawStatus, ...unstaged, ...staged].join("\n")).digest("hex");
    assert.match(report, new RegExp(`候选哈希[^\\n]*${hash}`));
    // 报告写到临时根（产品运行期证据根只在临时项目内；不写本仓库 docs/verification/）。
    const reportPath = path.join(root, "layout-report.md");
    writeFileSync(reportPath, report, "utf8");
    assert.equal(readFileSync(reportPath, "utf8"), report);
    // 报告是证据不是授权：核对前后计划解析不变。
    const reparsed = parseTeamPlan(planText, { flowId: FLOW, projectRoot: root });
    assert.equal(reparsed.ok, true);
    assert.deepEqual(reparsed.directories, parsed.directories);
    // 输出报告摘要供原始日志留证。
    console.log(report);
  } finally {
    try {
      rmSync(temp.root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
    temp.cleanup();
  }
});

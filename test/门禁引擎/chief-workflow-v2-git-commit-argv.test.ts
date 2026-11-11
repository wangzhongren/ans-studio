// test/门禁引擎/chief-workflow-v2-git-commit-argv.test.ts
// B32.1（2026-11-11，T3「两条固定工作流路径」；RR27 实测）：
// fixed v2 资源必须写死实现/返工任务的提交命令形态——`git commit -m "<message>"`：
// 含空格的提交消息必须整体加引号，`-m` 后必须是单个带引号的 argv 参数；提交语法返工只纠正
// 提交语法、不重写实现。既有 hash（应用计算/禁止 shell hash）、shell 禁令、写区与卡预算口径保留。
// 只读断言资源字节；legacy `chief-workflow.md` 不改；不新增 skip/force-exit。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CHIEF_WORKFLOW_RESOURCE } from "../../src/common/roles/chief/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_DIR = join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief");
const V2_PATH = join(WORKFLOW_DIR, "chief-workflow-v2.md");
const V1_PATH = join(WORKFLOW_DIR, "chief-workflow.md");
const V1_SHA256 = "9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346";

function readV2(): string {
  return readFileSync(V2_PATH, "utf8");
}

function sectionOf(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `资源须包含段：${heading}`);
  const next = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, next === -1 ? undefined : next);
}

function a11Bullet(stages: string): string {
  const start = stages.indexOf("- **A11**：");
  assert.ok(start >= 0, "各阶段段须包含 A11 bullet");
  const end = stages.indexOf("\n- **A12a", start);
  assert.ok(end > start, "A11 bullet 之后须为 A12a bullet");
  return stages.slice(start, end);
}

test("B32.1 A11 段：实现任务文本写死提交命令形态（引号/单 argv 参数）", () => {
  const a11 = a11Bullet(sectionOf(readV2(), "## 各阶段 fixed 任务字段与卡节奏"));
  assert.match(a11, /git commit -m "<message>"/u, "须写死 `git commit -m \"<message>\"`");
  assert.match(a11, /含空格的提交消息必须整体加引号/u, "须写死含空格的提交消息整体加引号");
  assert.match(a11, /`-m` 后必须是单个带引号的 argv 参数/u, "须写死 -m 后单个带引号 argv 参数");
  assert.match(a11, /未加引号会把消息拆成多 token 而被 shell 写门拒绝/u, "须说明未加引号的 argv 拆分后果");
  assert.match(a11, /RR27 实测/u, "须标注 RR27 实测依据");
  // 既有语义保留：只写模块文件 + 字面 add/commit；不得运行 shell。
  assert.match(a11, /字面 `git add`\/`git commit`/u, "worker 写面口径保留");
  assert.match(a11, /不得运行任何 shell 命令（含 `node`\/`npm`\/自测脚本）/u, "shell 禁令保留");
});

test("B32.1 「A10 与 A11 的顺序」段：A11 stage-request 文本与返工均写死提交语法", () => {
  const order = sectionOf(readV2(), "## A10 与 A11 的顺序");
  assert.match(order, /git commit -m "<message>"/u, "A11 stage-request 须写死提交命令形态");
  assert.match(order, /含空格的提交消息必须整体加引号/u, "须写死引号规则");
  assert.match(order, /`-m` 后必须是单个带引号的 argv 参数/u, "须写死单 argv 参数规则");
  assert.match(order, /返工只纠正提交语法/u, "须写死提交语法返工口径");
  assert.match(order, /不重写实现、不新增实现改动/u, "返工不得重写实现");
  assert.match(order, /RR27 实测/u, "须标注 RR27 实测依据");
});

test("B32.1 Git 普通用法段：实现角色提交命令带引号且既有拒绝面不变", () => {
  const git = sectionOf(readV2(), "## Git 普通用法（实现角色）");
  assert.match(git, /git commit -m "<msg>"/u, "须写死带引号的 commit 形态");
  assert.match(git, /含空格的提交消息必须整体加引号/u, "须写死引号规则");
  assert.match(git, /`-m` 后必须是单个带引号的单消息参数/u, "须写死单消息参数规则");
  assert.match(git, /git add <literal paths ⊆ 任务 writeSet>/u, "字面 add ⊆ writeSet 口径保留");
  assert.match(git, /`-A\/--all\/\.\/glob`/u, "既有 add 拒绝面保留");
});

test("B32.1/B32.2 既有安全语义不放宽：hash/shell/卡预算口径保留，legacy 字节与模块 pin 不变", () => {
  const text = readV2();
  assert.match(text, /不得用 shell 算 hash/u, "禁止 shell hash 口径须保留");
  assert.match(text, /`sha256` 由应用计算/u, "应用计算 hash 口径须保留");
  assert.match(text, /fixed 路径卡预算 = 这三张确认卡 \+ `merge-main`/u, "卡预算口径须保留");
  assert.match(text, /不应出现额外的 shell 审批卡、stable-write 卡或其它客户门/u, "额外客户门禁令须保留");
  assert.match(text, /不得运行任何 shell 命令（含 `node`\/`npm`\/自测脚本）/u, "实现 worker 禁 shell 须保留");

  const legacy = readFileSync(V1_PATH);
  assert.equal(createHash("sha256").update(legacy).digest("hex"), V1_SHA256, "legacy 资源字节不得变化");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.sha256, V1_SHA256, "模块 pin 须仍指向 legacy 资源");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1");
});

test("B32.1 资源事实：版本行恰一处 chief-workflow/v2、规模有界、无 BOM/NUL", () => {
  const bytes = readFileSync(V2_PATH);
  const text = bytes.toString("utf8");
  const versions = [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]);
  assert.deepEqual(versions, ["chief-workflow/v2"], "版本行须恰一处且为 chief-workflow/v2");
  assert.notEqual(bytes[0], 0xef, "不得带 UTF-8 BOM");
  assert.equal(bytes.includes(0), false, "不得含 NUL");
  const nonEmptyLines = text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  assert.ok(nonEmptyLines >= 40 && nonEmptyLines <= 200, `资源规模应有界（实际 ${nonEmptyLines} 非空行）`);
});

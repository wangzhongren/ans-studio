// 门禁引擎测试：T3「两条固定工作流路径」B2——chief-workflow-v2.md fixed 资源。
//
// 依据：B1 `AC-24`（fixed 资源 + legacy `chief-workflow.md` 不改）、方案 v1.3 §3.4（`chief-workflow-v2.md`，
// 版本 `chief-workflow/v2`，run-role 按矩阵注入）与 G-IR §5.7。
// 本文件只读；v2 资源由编排 B2 按 `matrix:"two-fixed-paths/v1"` 注入（本批只写资源，不改 run-role）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CHIEF_WORKFLOW_RESOURCE } from "../../src/common/roles/chief/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_DIR = join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief");
const V2_PATH = join(WORKFLOW_DIR, "chief-workflow-v2.md");
const V1_PATH = join(WORKFLOW_DIR, "chief-workflow.md");

function resourceVersions(text: string): string[] {
  // 与运行时读取一致的版本行正则（`src/provider/runtime/tools.ts`）。
  return [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]!);
}

test("chief-workflow-v2：fixed 资源存在、版本行恰为 v2、覆盖两路径/派发分裂/3 卡/基线/Git/merge-main/A10-A12/路径 B", () => {
  const text = readFileSync(V2_PATH, "utf8");
  assert.match(text, /^# /, "资源必须有 Markdown 标题");
  assert.deepEqual(resourceVersions(text), ["chief-workflow/v2"], "版本行须恰一处且为 chief-workflow/v2");
  const topics: ReadonlyArray<readonly [string, RegExp]> = [
    ["两条固定路径", /两条固定路径/],
    ["路径 A", /路径 A/],
    ["路径 B", /路径 B/],
    ["stage-request", /stage-request/],
    ["taskKind", /taskKind/],
    ["派发分裂", /派发分裂/],
    ["3 张客户卡", /3 张客户卡|三张/],
    ["intent-confirm", /intent-confirm/],
    ["proposal", /proposal/],
    ["appointment", /appointment/],
    ["merge-main", /merge-main/],
    ["客户本人", /客户本人/],
    ["judge 不可代批", /judge[^\n]*不可代批/],
    ["基线 3 件小事", /基线 3 件小事/],
    ["git init -b main", /git init -b main/],
    [".gitignore 托管块", /\.gitignore/],
    ["任务分支", /ans\/task\/<workflowId>/],
    ["Git 普通用法", /Git 普通用法|git add|git commit -m/],
    ["不 push/tag", /push[^\n]*tag|不 push\/tag/],
    ["A10", /A10/],
    ["A11", /A11/],
    ["A12a", /A12a/],
    ["A12b", /A12b/],
    ["docs/acceptance 归档", /docs\/acceptance/],
    ["无 acceptance 卡", /不发 acceptance 卡/],
    ["路径 B 不要求 A12b", /不要求 A12b/],
  ];
  for (const [label, pattern] of topics) {
    assert.match(text, pattern, `chief-workflow-v2 须覆盖：${label}`);
  }
  // G-IR 拒绝项：资源不得指示模型请求未批准的新工具。
  assert.doesNotMatch(text, /requestReleaseMerge|request_release_merge/);
});

test("legacy chief-workflow.md 不改：版本仍为 v1、正文段逐字保留；模块资源引用仍指向 v1", () => {
  const text = readFileSync(V1_PATH, "utf8");
  assert.deepEqual(resourceVersions(text), ["chief-workflow/v1"], "legacy 资源版本不得变化");
  assert.ok(text.includes("## 接需求，结合事实选路"), "legacy 正文段不得删除/改写");
  assert.ok(text.includes("## 按职责派五个内置角色"), "legacy 派发段保留");
  // 模块（六角色 code 的 legacy 引用）仍指向 legacy 资源；fixed 注入切换属编排 B2。
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1");
  assert.ok(
    CHIEF_WORKFLOW_RESOURCE.path.endsWith("workflows/chief/chief-workflow.md"),
    "legacy 资源引用路径不得被 v2 替换",
  );
});

test("chief-workflow-v2：编码与身份（无 BOM/NUL；非空行数有界；不与 legacy 字节相同）", () => {
  const v2 = readFileSync(V2_PATH);
  const v1 = readFileSync(V1_PATH);
  assert.notEqual(v2[0], 0xef, "资源不得带 UTF-8 BOM");
  assert.equal(v2.includes(0), false, "资源不得含 NUL");
  assert.notDeepEqual(v2, v1, "v2 必须是独立资源（不得复制 legacy 字节冒充）");
  const nonEmptyLines = v2.toString("utf8").split(/\r?\n/).filter((line) => line.trim() !== "").length;
  assert.ok(nonEmptyLines >= 40 && nonEmptyLines <= 200, `v2 资源规模应有界（实际 ${nonEmptyLines} 非空行）`);
});

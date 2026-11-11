// 门禁引擎测试：T3「两条固定工作流路径」B34.2——路径 B 的 B2 范围决定记录时序（RR31 修复）。
//
// 依据：RR31 真机记录 `角色卡/测试/docs/change/2026-11-11_RR31_wuxia-roguelike-fix.md`
// （幕僚先发 B2 stage-request ⇒ 视图进入 B2(requested)；应用只在受理 **B3 advance stage-request** 且
// 视图仍为 B1 completed + B2 pending 时记录 `change.scope-decided`（`app/desktop/workflow.ts`）；
// 此后 B3 advance 被拒「B2 范围决定未记录：当前 B2(requested)」，不可恢复；幕僚卡死后用 13 条
// `findstr` 读应用源码（只读自动放行），又以 PowerShell 触发预算外 shell 审批卡早停）。
// 协调方 B34 授权：资源须写死「路径 B 不发 B2 stage-request；B1 completed 后直接发 B3 advance」，
// B2 卡住时如实上报/停止，禁止用 shell 探测/读取应用源码（应用源码不是项目证据）。
//
// 本文件只读断言资源字节；不改 legacy `chief-workflow.md`；不新增 skip/force-exit。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CHIEF_WORKFLOW_RESOURCE } from "../../src/common/roles/chief/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_DIR = join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief");
const V2_PATH = join(WORKFLOW_DIR, "chief-workflow-v2.md");
const V1_PATH = join(WORKFLOW_DIR, "chief-workflow.md");
const V1_SHA256 = "9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346";
const PATHS_HEADING = "## 两条固定路径";
const FIRST_ACTION_HEADING = "## 首个动作：A1 精确 stage-request";
const STAGE_HEADING = "## 各阶段 fixed 任务字段与卡节奏";
const PATH_B_HEADING = "## 路径 B 要点";

function readV2(): string {
  return readFileSync(V2_PATH, "utf8");
}

function sectionOf(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `资源须包含段：${heading}`);
  const next = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, next === -1 ? undefined : next);
}

function bulletLine(section: string, prefix: string): string {
  const line = section.split("\n").find((candidate) => candidate.startsWith(prefix));
  assert.ok(line !== undefined, `资源须包含条目：${prefix}`);
  return line!;
}

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("B34 路径 B 概要：B1 completed 后直接发 B3 advance stage-request；应用在受理 B3 时记录 change.scope-decided，B2 由该记录完成（不发 B2）", () => {
  const paths = sectionOf(readV2(), PATHS_HEADING);
  const bullet = bulletLine(paths, "- **路径 B");
  assert.match(bullet, /应用在受理 B3 advance 时记录；B2 不发 stage-request/, "路径 B 概要须点名 B2 不发 stage-request、scope 由应用在受理 B3 时记录");
  assert.match(bullet, /B1 completed 后直接发 B3 advance stage-request/, "B1 completed 后须直接发 B3 advance stage-request");
  assert.match(bullet, /`taskKind:"stage-request"`、`workflowAction:"advance"`、`stage:"B3"`、`workflowId`/, "B3 advance 须写死 taskKind/workflowAction/stage/workflowId 字段");
  assert.match(bullet, /校验 B1 影响面报告并记录 `change\.scope-decided`/, "应用受理 B3 时须校验 B1 影响面报告并记录 change.scope-decided");
  assert.match(bullet, /B2 由该记录完成/, "B2 须由该记录完成（不由幕僚发范围决定请求）");
});

test("B34 首个动作与阶段段：重申路径 B 不发 B2 stage-request（B1 完成后直接 B3 advance）", () => {
  const firstAction = sectionOf(readV2(), FIRST_ACTION_HEADING);
  assert.match(firstAction, /\*\*路径 B 不发 B2 stage-request\*\*：B1 completed 后直接发 B3 advance/, "首个动作段须重申 B2 不发 stage-request");
  const stages = sectionOf(readV2(), STAGE_HEADING);
  assert.match(stages, /\*\*路径 B 例外：B2 不是可请求的阶段——不发 B2 stage-request，B1 completed 后直接发 B3 advance\*\*/, "阶段段须写明 B2 不是可请求的阶段");
  // B7.1 既有首请求口径不得被本批改写。
  assert.ok(firstAction.includes('`workflowPath:"A"`（路径 B 为 `"B"`）'), "路径 B 的 workflowPath 值须保留");
  assert.ok(firstAction.includes('`stage:"A1"`（路径 B 首请求为 `"B1"`）'), "路径 B 首请求 B1 口径须保留");
});

test("B34 路径 B 要点 B2：稳定码 b2-stage-request-forbidden + 应用文案；B1 completed 后 B3 advance 由应用记录 scope、派生写集", () => {
  const pathB = sectionOf(readV2(), PATH_B_HEADING);
  const b2 = bulletLine(pathB, "- **B2（不发 stage-request）**");
  assert.match(b2, /\*\*路径 B 不发 B2 stage-request\*\*/, "B2 条目须写死路径 B 不发 B2 stage-request");
  assert.match(b2, /`b2-stage-request-forbidden`/, "须给出稳定拒绝码 b2-stage-request-forbidden");
  assert.match(b2, /应用对 `stage:"B2"` 的 advance 请求直接拒绝/, "须说明应用直接拒绝 B2 advance 请求");
  assert.match(b2, /路径 B 不发 B2 stage-request；B1 完成后直接发 B3 advance stage-request（应用在 B3 受理时记录 B2 change\.scope-decided）；B2 保持 pending/, "须引用应用拒绝文案（含 B2 保持 pending）");
  assert.match(b2, /\*\*B1 completed 后直接发 B3 advance stage-request\*\*/, "B1 completed 后须直接发 B3 advance stage-request");
  assert.match(b2, /`taskKind:"stage-request"`、`workflowAction:"advance"`、`stage:"B3"`、`workflowId`、`sideEffect:"read-only"`/, "B3 advance 须写死 taskKind/workflowAction/stage/workflowId/sideEffect");
  assert.match(b2, /校验 B1 影响面报告（应用计算的 impactReport hash）/, "B3 受理须校验 B1 影响面报告（应用计算 hash）");
  assert.match(b2, /按最新 roster 模块属主 ∩ 角色边界派生各角色 writeSet/, "写集须由应用按 roster 属主 ∩ 角色边界派生");
  assert.match(b2, /记录 `change\.scope-decided`（impactReport hash \+ `scope\.files` \+ rationale）/, "应用须记录 change.scope-decided（hash/scope.files/rationale）");
  assert.match(b2, /B2 由该记录完成，不由你发范围决定请求/, "B2 须由应用记录完成，不由幕僚发范围决定请求");
  assert.match(b2, /越界\/无法唯一归属 ⇒ `b-change-scope-invalid`/, "越界/无法唯一归属拒绝码须保留");
  // B3 条目既有语义保留。
  const b3 = bulletLine(pathB, "- **B3**");
  assert.match(b3, /运营派现有实现角色按派生 writeSet 修改并提交；范围外写入拒绝/, "B3 派发/写集拒绝语义须保留");
});

test("B34 旧「B2 发范围决定」错误引导移除：不得再出现「B2：你发范围决定」旧措辞", () => {
  const text = readV2();
  assert.doesNotMatch(text, /- \*\*B2\*\*：你发范围决定/, "旧 B2 条目不得保留");
  assert.doesNotMatch(text, /你发范围决定（`change\.scope-decided`：应用计算的 impactReport hash/, "旧「你发范围决定（change.scope-decided：…）」措辞须改写为正确时序（B3 受理时应用记录）");
  const pathB = sectionOf(text, PATH_B_HEADING);
  assert.doesNotMatch(pathB, /- \*\*B2\*\*：/, "B2 条目须改为「B2（不发 stage-request）」正确时序");
  assert.match(pathB, /- \*\*B2（不发 stage-request）\*\*/, "B2 条目须以「不发 stage-request」标题呈现");
});

test("B34 B2 卡住处置：按真实拒绝码如实上报/停止；不得反复重发 B2、不得伪造范围决定", () => {
  const pathB = sectionOf(readV2(), PATH_B_HEADING);
  const stuck = bulletLine(pathB, "- **B2 卡住时如实上报/停止**");
  assert.match(stuck, /`b2-stage-request-forbidden`/, "卡住处置须点名 b2-stage-request-forbidden");
  assert.match(stuck, /`stage-transition-invalid`（如「B2 范围决定未记录：当前 B2\(requested\)」）/, "卡住处置须点名 stage-transition-invalid 与 B2(requested) 死状态");
  assert.match(stuck, /`b-change-scope-invalid`/, "卡住处置须点名 b-change-scope-invalid");
  assert.match(stuck, /按真实 code 处置并如实上报客户与运营/, "须按真实 code 处置并如实上报");
  assert.match(stuck, /不得反复重发 B2 stage-request/, "不得反复重发 B2 stage-request");
  assert.match(stuck, /不得伪造范围决定（`change\.scope-decided`）/, "不得伪造范围决定");
  assert.match(stuck, /自造 `scope\.files`\/hash/, "不得自造 scope.files/hash");
  assert.match(stuck, /`workflowAction:"stop"` 的 stage-request/, "无法恢复时须按停止流程发 stop stage-request");
});

test("B34 禁止用 shell 探测或读取应用源码：findstr/grep/Get-Content/PowerShell；应用源码不是项目证据；不得产生额外卡", () => {
  const pathB = sectionOf(readV2(), PATH_B_HEADING);
  const shellBan = bulletLine(pathB, "- **禁止用 shell 探测或读取应用源码**");
  for (const command of ["`findstr`", "`grep`", "`Get-Content`", "PowerShell"] as const) {
    assert.ok(shellBan.includes(command), `shell 禁令须点名 ${command}`);
  }
  assert.match(shellBan, /探测或读取应用源码\/实现（含跨出项目 target 目录）/, "禁令须覆盖探测/读取应用源码（含跨出 target）");
  assert.match(shellBan, /应用源码\/实现事实不可作为项目证据/, "须写死应用源码/实现事实不可作为项目证据");
  assert.match(shellBan, /项目证据只取本资源、应用真实回执与项目内证据文件/, "须写明项目证据来源");
  assert.match(shellBan, /任何 shell 都会触发 shell 审批\/拒绝面/, "须说明任何 shell 都会触发审批/拒绝面");
  assert.match(shellBan, /固定路径不应产生额外客户卡/, "须说明固定路径不应产生额外客户卡");
  assert.match(shellBan, /RR31 实测/, "须点名 RR31 实测根因");
});

test("B34 既有安全语义不放宽 + legacy 不改：hash/卡预算/写区/fail-closed 口径保留；v1 字节与模块 pin 不变；v2 版本行/规模/编码有界", () => {
  const text = readV2();
  // 既有安全语义逐项保留（B9.1/B27/B28/B31/B32），B34 只新增路径 B 时序与 shell 边界。
  assert.match(text, /不得用 shell 算 hash/, "不得用 shell 算 hash 口径须保留");
  assert.match(text, /`sha256` 由应用计算/, "应用计算 hash 口径须保留");
  assert.match(text, /卡预算：3 张确认卡 \+ merge-main/, "卡预算口径须保留");
  assert.match(text, /不得运行任何 shell 命令（含 `node`\/`npm`\/自测脚本）/, "实现 worker 禁 shell 口径须保留");
  assert.match(text, /项目验收角色同样必须绑定其 roster 模块 moduleId \+ modulePaths/, "B28 review 模块绑定口径须保留");
  assert.match(text, /`b-repository-required`/, "路径 B 无仓库 fail-closed 码须保留");
  assert.match(text, /缺 `workflowPath`\/`stage`\/`flowId`\/`taskKind` 任一 ⇒ 应用 fail-closed/, "stage-request 缺字段 fail-closed 口径须保留");
  assert.match(text, /范围外写入拒绝/, "B3 范围外写入拒绝口径须保留");
  // legacy 资源不改：字节 SHA-256、版本与模块 pin 仍指向 legacy。
  const v1Bytes = readFileSync(V1_PATH);
  assert.equal(sha256Of(v1Bytes), V1_SHA256, "legacy 资源字节变化（fixed 只允许改 v2，不得改 legacy）");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.sha256, V1_SHA256, "模块数据 pin 须仍指向 legacy 资源字节");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1", "模块 pin 须仍为 legacy 版本");
  assert.ok(CHIEF_WORKFLOW_RESOURCE.path.endsWith("workflows/chief/chief-workflow.md"), "模块 pin 须仍指向 legacy 资源");
  // v2 资源事实：版本行恰一处、≤256 KiB、UTF-8 无 BOM/NUL、非空行数有界。
  const bytes = readFileSync(V2_PATH);
  const v2Text = bytes.toString("utf8");
  assert.deepEqual(
    [...v2Text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]),
    ["chief-workflow/v2"],
    "v2 资源版本行须恰一处且为 chief-workflow/v2",
  );
  assert.ok(statSync(V2_PATH).size <= 256 * 1024, "v2 资源不得超过 256 KiB");
  assert.notEqual(bytes[0], 0xef, "v2 资源不得带 UTF-8 BOM");
  assert.equal(bytes.includes(0), false, "v2 资源不得含 NUL");
  const nonEmptyLines = v2Text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  assert.ok(nonEmptyLines >= 40 && nonEmptyLines <= 200, `v2 资源非空行数须有界（实际 ${nonEmptyLines}）`);
});

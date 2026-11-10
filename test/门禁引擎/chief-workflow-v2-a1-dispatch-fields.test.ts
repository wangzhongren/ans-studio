// 门禁引擎测试：T3「两条固定工作流路径」B7.1——chief-workflow-v2.md fixed 资源精确字段。
//
// 依据：B1 v1.2 `AC-05`/`AC-06`/`AC-08`（stage-request 字段/幂等/A1–A13 状态机）、方案 v1.3 §3.3/§4.2
// （首个 advance 请求必填 `workflowPath`/`stage` 等）、RR2 记录（首个 stage-request 缺
// `workflowPath`/`stage` 被应用 fail-open 受理为 legacy 星形派发；本批在 fixed v2 资源写死 A1 精确调用、
// 禁止直派与 legacy run 概念，并声明 fixed `contract_check` 口径）。
//
// 本文件只读断言资源字节；不新增依赖；不改 legacy `chief-workflow.md`；不新增 skip/force-exit。

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

function readV2(): string {
  return readFileSync(V2_PATH, "utf8");
}

function sectionOf(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.ok(start >= 0, `资源须包含段：${heading}`);
  const next = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, next === -1 ? undefined : next);
}

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("B7.1 A1：首个 stage-request JSON 示例含全部精确字段（roleId=convener/taskKind/workflowAction/workflowPath=A/stage=A1/flowId/sideEffect=read-only）", () => {
  const section = sectionOf(readV2(), "## 首个动作：A1 精确 stage-request");
  const block = section.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block !== null, "A1 段须给出可复制的 JSON 调用示例");
  const call = JSON.parse(block![1]!) as Record<string, unknown>;
  assert.equal(call["roleId"], "convener", "roleId 必须写死 convener");
  assert.equal(typeof call["task"], "string", "task 必须为自足文本");
  assert.ok((call["task"] as string).trim() !== "", "task 不得为空");
  assert.equal(call["taskKind"], "stage-request", "taskKind 必须写死 stage-request");
  assert.equal(call["workflowAction"], "advance", "workflowAction 必须写死 advance");
  assert.equal(call["workflowPath"], "A", "workflowPath 必须写死 A");
  assert.equal(call["stage"], "A1", "首个 stage 必须写死 A1");
  assert.equal(call["flowId"], "<flowId>", "flowId 必须随调用给出");
  assert.equal(call["sideEffect"], "read-only", "sideEffect 必须写死 read-only");
  assert.equal(call["runId"], undefined, "A1 示例不得携带 runId");
  assert.equal(call["pinned"], undefined, "A1 示例不得携带 pinned");
  assert.deepEqual(
    Object.keys(call).sort(),
    ["flowId", "roleId", "sideEffect", "stage", "task", "taskKind", "workflowAction", "workflowPath"].sort(),
    "A1 示例字段集合须恰为应用校验的最小形状（首请求 workflowId 由应用生成）",
  );
});

test("B7.1 A1：路径 B 首请求同形（workflowPath=B/stage=B1）且缺字段 fail-closed 非 legacy 回退", () => {
  const section = sectionOf(readV2(), "## 首个动作：A1 精确 stage-request");
  assert.ok(section.includes('`workflowPath:"A"`（路径 B 为 `"B"`）'), "资源须写死路径 B 的 workflowPath 值");
  assert.ok(section.includes('`stage:"A1"`（路径 B 首请求为 `"B1"`）'), "资源须写死路径 B 的首阶段");
  assert.match(section, /缺 `workflowPath`\/`stage`\/`flowId`\/`taskKind` 任一/, "须点名缺失即拒的四个字段");
  assert.match(section, /stage-request-invalid/, "须给出稳定拒绝码 stage-request-invalid");
  assert.match(section, /stage-request-required/, "须给出稳定拒绝码 stage-request-required");
  assert.match(section, /不回退 legacy/, "缺字段必须 fail-closed，不得回退 legacy");
  assert.match(section, /补齐字段后重试/, "模型须补齐后重试");
});

test("B7.1 A1：禁止直派生产线角色与 legacy run/trunk 概念", () => {
  const section = sectionOf(readV2(), "## 首个动作：A1 精确 stage-request");
  assert.match(section, /不得直接派 product\/rapporteur\/nominator/, "须禁止 chief 直派生产线内置角色");
  assert.match(section, /chief-production-dispatch-forbidden/, "须给出稳定拒绝码 chief-production-dispatch-forbidden");
  assert.match(section, /不得在 stage-request 中携带 `runId`\/`pinned`\/`baseDigest`/, "须禁止 legacy run 概念");
  assert.match(section, /不请求写 `\.ans\/trunk`\/`\.ans\/runs`/, "须禁止写 legacy trunk/runs");
  assert.match(section, /不是普通派发/, "stage-request 不得被当作普通派发");
});

test("B7.1 各阶段：A2/A4/A7/A8/A10/A11/A12a/A12b 的 fixed 任务字段与卡节奏齐备", () => {
  const text = readV2();
  const section = sectionOf(text, "## 各阶段 fixed 任务字段与卡节奏");
  const requirements: ReadonlyArray<readonly [string, RegExp]> = [
    ["A2 product 生产任务", /stage:"A2"[^\n]*sideEffect:"docs"/],
    ["A4 stage-request", /stage:"A4"`? stage-request/],
    ["A5 rapporteur 生产任务", /roleId:"rapporteur"[^\n]*stage:"A5"/],
    ["A7 stage-request", /stage:"A7"`? stage-request/],
    ["A8 nominator + activate_role_documents v2", /roleId:"nominator"[^\n]*stage:"A8"[^\n]*activate_role_documents/],
    ["A10 任命卡", /任命确认卡 `appointment`/],
    ["A11 stage-request", /stage:"A11"`? stage-request/],
    ["A11 moduleId/modulePaths", /`moduleId`\+`modulePaths`/],
    ["A12a 先于 A11", /A12a（先于 A11 实现派发）/],
    ["A12b 报告", /stage:"A12b"/],
    ["docs/acceptance 归档", /docs\/acceptance\/<flowId>-acceptance-vN\.md/],
  ];
  for (const [label, pattern] of requirements) {
    assert.match(section, pattern, `各阶段字段须覆盖：${label}`);
  }
  assert.match(text, /A10 卡后发 A11 stage-request/, "卡节奏须写明 A10 卡后 A11");
  assert.match(text, /A12a 先于 A11 实现派发/, "卡节奏须写明 A12a 先于 A11");
  assert.match(text, /A12b \+ `docs\/acceptance` 归档完成验收/, "卡节奏须写明 A12b + 归档");
});

test("B7.1 卡呈交：A6/A10/A13 卡由幕僚呈交；merge-main 客户本人且 judge 不可代批", () => {
  const text = readV2();
  assert.match(text, /A6 方案卡、A10 任命卡与 A13 `merge-main` 卡均由你走应用卡通道呈交客户/);
  assert.match(text, /merge-main[^\n]*客户本人/);
  assert.match(text, /judge[^\n]*不可代批/);
  assert.match(text, /不得用 `request_choice` \/ `request_confirmation` 发该卡/);
});

test("B7.1 contract_check：fixed 会话应显示 fixed 口径；legacy 文本不作为 fixed 依据", () => {
  const section = sectionOf(readV2(), "## contract_check 与 fixed 口径");
  assert.match(section, /fixed 会话的 `contract_check` 应显示 fixed 口径/);
  assert.match(section, /不得作为 fixed 依据/);
  assert.match(section, /以本资源、应用真实回执与 fixed 账本事件为准/);
});

test("B7.1 冻结：legacy chief-workflow.md 字节 SHA-256 与模块数据 pin 逐字不变", () => {
  const bytes = readFileSync(V1_PATH);
  assert.equal(sha256Of(bytes), V1_SHA256, "legacy 资源字节变化（fixed 只允许新增 v2，不得改 legacy）");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.sha256, V1_SHA256, "模块数据 pin 须仍指向 legacy 资源字节");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1");
  assert.ok(
    CHIEF_WORKFLOW_RESOURCE.path.endsWith("workflows/chief/chief-workflow.md"),
    "模块资源引用路径须仍指向 legacy 资源",
  );
  const v1VersionLines = [...bytes.toString("utf8").matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(v1VersionLines, ["chief-workflow/v1"], "legacy 版本行须仍恰为 v1");
});

test("B7.1 版本与规模：v2 版本行恰一处、字节 ≤256 KiB、无 BOM/NUL", () => {
  const bytes = readFileSync(V2_PATH);
  const text = bytes.toString("utf8");
  const versions = [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]);
  assert.deepEqual(versions, ["chief-workflow/v2"], "v2 资源版本行须恰一处且为 chief-workflow/v2");
  assert.ok(statSync(V2_PATH).size <= 256 * 1024, "v2 资源不得超过 256 KiB");
  assert.notEqual(bytes[0], 0xef, "v2 资源不得带 UTF-8 BOM");
  assert.equal(bytes.includes(0), false, "v2 资源不得含 NUL");
});

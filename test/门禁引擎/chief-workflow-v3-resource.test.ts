// test/门禁引擎/chief-workflow-v3-resource.test.ts
// 2026-11-17（v2.2 第一步测试批 T2，测试角色）：**chief-workflow-v3.md（app-dispatch/v1 专用）资源**。
//
// 依据：`角色卡/门禁引擎/docs/change/2026-11-17_change_app-dispatch-builtins-texts.md` §1/§4/§6.2；
// 设计 §6.2（新增 chief-workflow-v3.md；v2 逐字保留给在飞 fixed-v2.1；legacy v1 不改）。
// 覆盖：
//   1. 版本行恰一处 `chief-workflow/v3`；身份行；≤256 KiB；无 BOM/NUL；
//   2. v1/v2 **字节 blob SHA（LF 归一，git hash-object 同口径）逐字不变**（53d7167… / d528c6c…）；
//      v3 为独立资源（非复制 v1/v2）；
//   3. 关键语义段存在：select_workflow / 应用建任务 / 运营只派 worker / 三卡按 prompt / A12 应用直派 /
//      B2 应用派生 / 三卡+merge-main / judge 不弱化 / B 系列逐字保留 / 新稳定码；
//   4. v3 不把旧口径写成指令（派发/收口/停止归角色）——旧工具面不得在 v3 被授予。
//
// 只读文件；无临时目录/端口/.env。LF 归一口径与 KR-29 既有环境差异处理一致（CRLF 检出也稳定）。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_DIR = join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief");
const V1_PATH = join(WORKFLOW_DIR, "chief-workflow.md");
const V2_PATH = join(WORKFLOW_DIR, "chief-workflow-v2.md");
const V3_PATH = join(WORKFLOW_DIR, "chief-workflow-v3.md");

const MAX_RESOURCE_BYTES = 256 * 1024;

/** git hash-object 同口径：blob `<len>\\0<content>` 的 SHA-1（LF 归一；与工作树 CRLF 无关）。 */
function gitBlobSha(raw: Buffer): string {
  const lf = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  const header = Buffer.from(`blob ${lf.length}\0`, "utf8");
  return createHash("sha1").update(header).update(lf).digest("hex");
}

function resourceVersions(text: string): string[] {
  return [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]!);
}

test("v3 资源：版本行恰一处 chief-workflow/v3、身份行、≤256 KiB、无 BOM/NUL", () => {
  const raw = readFileSync(V3_PATH);
  const text = raw.toString("utf8");
  assert.match(text, /^# Chief 工作流/, "资源必须有 Markdown 标题身份行");
  assert.deepEqual(resourceVersions(text), ["chief-workflow/v3"], "版本行须恰一处且为 chief-workflow/v3");
  assert.ok(raw.length <= MAX_RESOURCE_BYTES, `v3 资源不得超过 256 KiB（实际 ${raw.length} 字节）`);
  assert.notEqual(raw[0], 0xef, "资源不得带 UTF-8 BOM");
  assert.equal(raw.includes(0), false, "资源不得含 NUL");
  const nonEmptyLines = text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  assert.ok(nonEmptyLines >= 60 && nonEmptyLines <= 400, `v3 资源规模应有界（实际 ${nonEmptyLines} 非空行）`);
  assert.ok(text.includes("app-dispatch/v1"), "资源必须声明新协议");
});

test("v1/v2/v3 字节稳定性：v1/v2 blob SHA 逐字不变（53d7167…/d528c6c…）；v3 独立（0318486…，2026-11-20 稳定码同步）", () => {
  const v1 = readFileSync(V1_PATH);
  const v2 = readFileSync(V2_PATH);
  const v3 = readFileSync(V3_PATH);
  // 冻结值来自 git hash-object（HEAD 逐字）与门禁批记录 §6.2；LF 归一口径保证 CRLF 检出同样通过。
  // v3 于 2026-11-20 收尾同步新增 `stage-request-removed` 稳定码段（1aad6d7… → 0318486…）；v1/v2 不动。
  assert.equal(gitBlobSha(v1), "53d71670ef9f403c027f6e39c0ffd1db92553992", "legacy v1 资源字节不得变化");
  assert.equal(gitBlobSha(v2), "d528c6ce5655b2a9916574f4a4477e035aef42a6", "v2 资源逐字保留（fixed-v2.1 在飞）");
  assert.equal(gitBlobSha(v3), "03184869960c9a8dd03067f21a9451612f1d987b", "v3 资源字节（稳定码同步后冻结）");
  // 版本行互不串扰：v1 只有 v1、v2 只有 v2。
  assert.deepEqual(resourceVersions(v1.toString("utf8")), ["chief-workflow/v1"]);
  assert.deepEqual(resourceVersions(v2.toString("utf8")), ["chief-workflow/v2"]);
  assert.notDeepEqual(v3, v2, "v3 不得复制 v2 字节冒充");
  assert.notDeepEqual(v3, v1, "v3 不得复制 v1 字节冒充");
});

test("v3 关键语义段齐全：select_workflow / 应用建任务 / 运营只派 worker / 三卡按 prompt / A12 直派 / B2 派生 / merge-main / judge 不弱化", () => {
  const text = readFileSync(V3_PATH, "utf8");
  const topics: ReadonlyArray<readonly [string, RegExp]> = [
    ["协议与驱动者", /## 协议与驱动者（app-dispatch\/v1）/],
    ["两条固定路径", /## 两条固定路径/],
    ["select_workflow 首个动作", /## 首个动作：select_workflow/],
    ["workflowPath A/B 字段", /workflowPath:"A"\|"B"/],
    ["acceptanceStrength 参数", /acceptanceStrength:"light"\|"standard"/],
    ["workflow-start 幂等键", /workflow-start:<flowId>:<path>:<sourceTaskId>/],
    ["阶段与任务来源表", /## 阶段与任务来源（谁建任务 \/ 谁执行 \/ 谁收口）/],
    ["应用建内置任务", /内置角色任务[^\n]*由应用\*\*按流程定义创建/],
    ["stage-execution", /stage-execution/],
    ["worker-dispatch", /worker-dispatch/],
    ["card-prompt", /card-prompt/],
    ["运营只派项目 worker", /运营只派项目 worker/],
    ["worker-dispatch-required", /worker-dispatch-required/],
    ["convener-builtin-dispatch-forbidden", /convener-builtin-dispatch-forbidden/],
    ["chief-dispatch-removed", /chief-dispatch-removed/],
    ["card-prompt-mismatch", /card-prompt-mismatch/],
    ["stage-request-removed", /stage-request-removed/],
    ["三张客户确认卡", /## 三张客户确认卡/],
    ["intent-confirm", /intent-confirm/],
    ["proposal", /proposal/],
    ["appointment", /appointment/],
    ["应用开卡、幕僚按 prompt 呈卡", /应用开卡、幕僚按 prompt 呈卡/],
    ["documentRefs 应用计算", /documentRefs/],
    ["merge-main 客户本人", /merge-main[^\n]*客户本人|客户本人[^\n]*merge-main/],
    ["judge 不可代批", /judge[^\n]*不可代批|不可代批[^\n]*judge/],
    ["A12 应用直派", /## A12 独立验收（应用直派/],
    ["A12a", /A12a/],
    ["A12b", /A12b/],
    ["docs/acceptance 应用归档", /docs\/acceptance/],
    ["轻量验收 B31", /light/],
    ["B2 应用确定性派生", /B2（应用确定性派生/],
    ["change.scope-decided", /change\.scope-decided/],
    ["b-change-scope-invalid", /b-change-scope-invalid/],
    ["A9 基线 3 件小事", /基线 3 件小事/],
    ["Git 普通用法", /## Git 普通用法/],
    ["不 push/tag", /不 push\/tag|不得 push|push[^\n]*tag/],
    ["B13.2 证据纯路径", /纯项目相对文件路径/],
    ["B14 禁环境探测", /环境探测/],
    ["B23 hash 取应用记录", /versions\.jsonl/],
    ["B24 意图入口", /B24[^\n]*A3|意图文档\/入口/],
    ["B27/B28 worker 禁 shell/自测", /不得建议或要求 worker 添加后运行自测脚本/],
    ["B32 提交引号", /git commit -m "<message>"/],
    ["停止由客户/应用", /## 停止、失败与审计/],
    ["workflow.stop-unconfirmed", /workflow\.stop-unconfirmed/],
    ["审计 append-only", /append-only/],
    ["contract_check 新口径", /## contract_check 与 fixed 口径/],
    ["请示与真实委托", /## 请示与真实委托/],
  ];
  for (const [label, pattern] of topics) {
    assert.match(text, pattern, `chief-workflow-v3 须覆盖：${label}`);
  }
  // v3 不得指示模型请求未批准的新工具（G-IR）。
  assert.doesNotMatch(text, /requestReleaseMerge|request_release_merge/);
});

test("v3 不授予旧动作面：明示不再注入 dispatch/close/redispatch/terminate；v2 旧口径段逐字仍在", () => {
  const v3 = readFileSync(V3_PATH, "utf8");
  assert.match(v3, /不再注入 `dispatch_task` \/ `close_created_task` \/ `redispatch_task` \/ `terminate_role_run`/,
    "v3 必须明示旧动作面已移除");
  assert.match(v3, /你不推进阶段、不收口任务、不重派、不停止、不直派验收/, "幕僚动作面收窄必须逐字给出");
  assert.match(v3, /应用侧流程驱动\*\*是阶段推进的唯一驱动者/, "驱动者唯一性");
  const v2 = readFileSync(V2_PATH, "utf8");
  // v2 保留旧口径（在飞 fixed-v2.1 逐字使用）：stage-request 驱动与 chief 直派验收仍在。
  assert.match(v2, /stage-request/);
  assert.match(v2, /chief[^\n]*verifier|直派[^\n]*verifier/);
  assert.match(v2, /资源版本：chief-workflow\/v2/);
});

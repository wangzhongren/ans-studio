// 门禁引擎测试：T3「两条固定工作流路径」B31——A12b blocked 报告的三选一处置纪律（禁止空转）。
//
// 依据：RR26 真机记录 `角色卡/测试/docs/change/2026-11-11_RR26_two-fixed-workflow-paths.md`
// （08:45:08 verifier 以 `status=blocked` 交回 A12b v2 报告：fixed 任务 shell 被禁用、无浏览器/运行器
// 工具，运行期 AC 未验证；幕僚被唤醒两次均未动作，未收口 A12b/未推进 A13，12 分钟无进度 stall）；
// 协调方 B31 授权：A12b blocked 后幕僚必须当回合三选一并留痕（轻量验收 / 返工 / 停止上报），
// 轻量验收以 `close_created_task` `outcome:"accepted"` + note 标记 + 应用归档（`acceptanceArchive`）
// 收口，其余阶段/缺归档/缺 note 仍 fail-closed。
//
// 本文件只读断言资源字节；不改 legacy `chief-workflow.md`；不新增 skip/force-exit。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CHIEF_WORKFLOW_RESOURCE } from "../../src/common/roles/chief/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_DIR = join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief");
const V2_PATH = join(WORKFLOW_DIR, "chief-workflow-v2.md");
const V1_PATH = join(WORKFLOW_DIR, "chief-workflow.md");
const STAGE_HEADING = "## 各阶段 fixed 任务字段与卡节奏";
const A12_HEADING = "## A12 独立验收（实施前写标准、实施后出报告）";
const LIGHTWEIGHT_NOTE = "acceptanceIntensity=lightweight；运行期未验证（静态证据接受）";

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

test("B31 A12b 阶段清单：blocked 报告到达后必须当回合三选一并留痕、禁止空转（三选一 = 轻量验收/有限返工/停止上报）", () => {
  const stageSection = sectionOf(readV2(), STAGE_HEADING);
  const a12b = bulletLine(stageSection, "- **A12b");
  assert.match(a12b, /status=blocked/, "A12b 段须点名 status=blocked 报告（RR26 根因）");
  assert.match(a12b, /当回合三选一并留痕，禁止空转/, "A12b 段须写死当回合三选一、禁止空转");
  assert.match(a12b, /轻量验收 \/ 有限返工 \/ 停止上报/, "A12b 段须列出三选一选项");
  assert.match(a12b, /细则见「A12 独立验收」段/, "A12b 段须指向 A12 段细则");
});

test("B31 轻量验收通过：close_created_task outcome=\"accepted\" + note 标记；应用归档记为 staffDecision；A13 披露「运行期未验证」", () => {
  const a12 = sectionOf(readV2(), A12_HEADING);
  assert.match(a12, /轻量验收通过/, "A12 段须给出轻量验收选项");
  assert.ok(a12.includes("`close_created_task`"), "须点名 close_created_task 收口动作");
  assert.ok(a12.includes('`outcome:"accepted"`'), "须写死 outcome:\"accepted\"");
  assert.ok(a12.includes("`note`"), "须点名 note");
  assert.ok(a12.includes(LIGHTWEIGHT_NOTE), "note 必须写明 acceptanceIntensity=lightweight；运行期未验证（静态证据接受）");
  assert.match(a12, /`note` 记为 `staffDecision`/, "须说明应用归档 docs/acceptance/ 会把 note 记为 staffDecision");
  assert.match(a12, /A12b 完成并推进 A13/, "轻量验收须完成 A12b 并推进 A13");
  assert.match(a12, /A13 交付说明中必须向客户披露「运行期未验证」/, "A13 交付说明须向客户披露运行期未验证");
});

test("B31 受支持动作边界：A12b blocked accepted 必须同时有 acceptanceArchive 与非空 note；其余阶段/缺归档/缺 note 仍 fail-closed", () => {
  const a12 = sectionOf(readV2(), A12_HEADING);
  assert.match(a12, /受支持动作而非放宽/, "轻量验收须声明为受支持动作而非放宽安全语义");
  assert.match(a12, /最后报告为 blocked 时，`accepted` 必须同时有应用归档证据（`acceptanceArchive`）与非空 `note`/, "A12b blocked accepted 须同时有归档证据与非空 note");
  assert.match(a12, /其余阶段、缺归档或缺 note 仍 fail-closed（`close-report-missing`）/, "其余阶段/缺归档/缺 note 须保持 fail-closed");
  assert.match(a12, /不伪造通过/, "不得伪造通过");
});

test("B31 返工/补证：有限、可执行、静态证据/具体文件与字段；不得要求 shell 自测；outcome:\"rework\" 回 A11", () => {
  const a12 = sectionOf(readV2(), A12_HEADING);
  assert.match(a12, /返工\/补证/, "A12 段须给出返工/补证选项");
  assert.match(a12, /可执行的有限补证要求/, "补证要求须可执行且有限");
  assert.match(a12, /不得要求 shell 自测/, "返工/补证不得要求 shell 自测");
  assert.match(a12, /`run_shell`\/`node`\/`npm`\/测试脚本一律不得写入要求/, "须点名禁止写入 run_shell/node/npm/测试脚本要求");
  assert.match(a12, /静态证据（具体文件与字段、逐条 AC 的静态核对结论）/, "补证可要求静态证据/具体文件与字段");
  assert.match(a12, /`outcome:"rework"` 收口并回 A11（新 attempt，`reworkOf:"A12b"`）/, "返工须以 outcome:\"rework\" 收口并回 A11");
});

test("B31 停止并如实上报客户：说明阻塞事实与所需客户决策；按停止流程 stage-request stop；不伪造通过、不静默归档", () => {
  const a12 = sectionOf(readV2(), A12_HEADING);
  assert.match(a12, /停止并如实上报客户/, "A12 段须给出停止并如实上报客户选项");
  assert.match(a12, /阻塞事实（缺什么验证通道、哪些 AC 未验证、已有静态证据是什么）/, "停止须说明阻塞事实");
  assert.match(a12, /所需客户决策/, "停止须说明所需客户决策");
  assert.match(a12, /`workflowAction:"stop"` 的 stage-request/, "停止须按既有 stop 流程发 stage-request");
  assert.match(a12, /不伪造通过、不静默归档/, "停止不得伪造通过/静默归档");
});

test("B31 既有安全语义不放宽 + legacy 不改：hash/shell/写区/卡预算口径保留；v1 版本与模块 pin 不变；v2 版本行/规模/编码有界", () => {
  const text = readV2();
  // 既有安全语义逐项保留（B9.1/B27/B28），B31 只新增处置纪律。
  assert.match(text, /不得用 shell 算 hash/, "不得用 shell 算 hash 口径须保留");
  assert.match(text, /`sha256` 由应用计算/, "应用计算 hash 口径须保留");
  assert.match(text, /卡预算：3 张确认卡 \+ merge-main/, "卡预算口径须保留");
  assert.match(text, /不得运行任何 shell 命令（含 `node`\/`npm`\/自测脚本）/, "实现 worker 禁 shell 口径须保留");
  assert.match(text, /项目验收角色同样必须绑定其 roster 模块 moduleId \+ modulePaths/, "B28 review 模块绑定口径须保留");
  assert.match(text, /docs\/acceptance\/` 的应用归档由应用完成/, "应用归档口径须保留");
  // legacy 资源不改：版本行为 v1，模块 pin 仍指向 legacy。
  const v1 = readFileSync(V1_PATH, "utf8");
  assert.deepEqual(
    [...v1.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]),
    ["chief-workflow/v1"],
    "legacy 资源版本不得变化",
  );
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1", "模块 pin 须仍为 legacy 版本");
  assert.ok(CHIEF_WORKFLOW_RESOURCE.path.endsWith("workflows/chief/chief-workflow.md"), "模块 pin 须仍指向 legacy 资源");
  // v2 资源事实：版本行恰一处、≤256 KiB、UTF-8 无 BOM/NUL、非空行数有界。
  const bytes = readFileSync(V2_PATH);
  assert.deepEqual(
    [...bytes.toString("utf8").matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]),
    ["chief-workflow/v2"],
    "v2 资源版本行须恰一处且为 chief-workflow/v2",
  );
  assert.ok(statSync(V2_PATH).size <= 256 * 1024, "v2 资源不得超过 256 KiB");
  assert.notEqual(bytes[0], 0xef, "v2 资源不得带 UTF-8 BOM");
  assert.equal(bytes.includes(0), false, "v2 资源不得含 NUL");
  const nonEmptyLines = bytes.toString("utf8").split(/\r?\n/).filter((line) => line.trim() !== "").length;
  assert.ok(nonEmptyLines >= 40 && nonEmptyLines <= 200, `v2 资源非空行数须有界（实际 ${nonEmptyLines}）`);
});

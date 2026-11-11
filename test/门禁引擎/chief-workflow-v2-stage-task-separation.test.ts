// 门禁引擎测试：T3「两条固定工作流路径」B9.2——fixed v2 资源 A1/A2、A4/A5、A7/A8 阶段任务分离。
//
// 依据：RR4 观测 2（v2 让运营把产品任务做成 `stage:"A2"`，导致 A1 无 `stage.dispatched`、账本停在
// A1 requested；`FIXED_STAGE_DISPATCH_RECORD_STAGES=[A1,A4,A7,A8,A12a,A12b]` 不含 A2）；B5 全链
// `test/测试/fixed-path-full-chain.test.ts` 正确语义（A1 产品任务 stage A1、A2 产品任务 stage A2、
// A4/A7 同理）；B1 v1.2 `AC-08`（A1/A4/A7 完成于目标任务创建；A2/A5/A8 完成于收口/账本事件）；
// 方案 v1.3 §4.2（A1「产品任务创建」、A2「closed accepted + 文档」）与 §4.5（完成判定表）。
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
const STAGE_HEADING = "## 各阶段 fixed 任务字段与卡节奏";

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
  assert.ok(line !== undefined, `阶段段须包含条目：${prefix}`);
  return line!;
}

function sha256Of(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("B9.2 A1/A2 分离：A1 产品受理任务写死 stage:\"A1\" 且完成于任务创建；A2 意图任务 stage:\"A2\" 在 A1 收口后另派、完成于收口 + 文档 hash", () => {
  const section = sectionOf(readV2(), STAGE_HEADING);
  const bullet = bulletLine(section, "- **A1→A2");
  assert.match(bullet, /两个阶段、两个任务，不得合并/, "须写死 A1/A2 为两个任务");
  // A1 受理/准备任务：product + stage A1 + sideEffect docs + 无 module；A1 完成于任务创建。
  assert.match(bullet, /`roleId:"product"`、`flowId`、`workflowId`、`stage:"A1"`、`sideEffect:"docs"`/, "A1 产品受理任务须写死 stage:\"A1\"/sideEffect:docs");
  assert.match(bullet, /无 module；只受理\/准备，不写意图正文/, "A1 受理任务不得承担意图撰写（无 module）");
  assert.match(bullet, /A1 完成于该任务创建/, "A1 完成于该任务创建（stage.dispatched A1）");
  assert.match(bullet, /记 `stage\.dispatched A1`/, "A1 完成须点名 stage.dispatched A1");
  // A2 另派：A1 收口后 A2 stage-request → 新 product 任务 stage A2；完成于收口 + 应用计算 hash。
  assert.match(bullet, /A1 收口后你发 \*\*A2 stage-request\*\*/, "A1 收口后须另发 A2 stage-request");
  assert.match(bullet, /运营再派 product 任务 `stage:"A2"`/, "A2 须另派 product 任务 stage A2");
  assert.match(bullet, /A2 完成于该任务 closed accepted \+ 文档 hash（由应用计算）/, "A2 完成于收口 + 应用计算文档 hash");
  assert.match(bullet, /不记 `stage\.dispatched A2`/, "A2 不得误记 stage.dispatched");
  assert.match(bullet, /不要求产品给出 sha256，不得用 shell 算 hash/, "B9.1 hash 口径须保留于 A2 任务文本");
  // 顺序：A1 任务 → A1 完成 → A2 请求 → A2 任务。
  const a1Task = bullet.indexOf('`stage:"A1"`');
  const a1Done = bullet.indexOf("A1 完成于该任务创建");
  const a2Request = bullet.indexOf("A2 stage-request");
  const a2Task = bullet.indexOf('`stage:"A2"`');
  assert.ok(a1Task >= 0 && a1Done > a1Task && a2Request > a1Done && a2Task > a2Request, "A1/A2 顺序须为 A1 任务 → A1 完成 → A2 请求 → A2 任务");
});

test("B9.2 A1 精确 JSON：stage 仍为 A1；任务文本明确 A1 只受理/准备、A2 另派（B9.1 hash 口径保留）", () => {
  const section = sectionOf(readV2(), "## 首个动作：A1 精确 stage-request");
  const block = section.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block !== null, "A1 段须给出可复制的 JSON 调用示例");
  const call = JSON.parse(block![1]!) as Record<string, unknown>;
  assert.equal(call["stage"], "A1", "首个 stage-request 的 stage 必须仍写死 A1");
  const task = call["task"] as string;
  assert.equal(typeof task, "string");
  assert.match(task, /A1 只做受理\/准备/, "A1 JSON 任务文本须写死 A1 只做受理/准备");
  assert.match(task, /A2 意图撰写另派/, "A1 JSON 任务文本须明确 A2 另派");
  assert.match(task, /不得合并为同一任务/, "A1 JSON 任务文本须禁止 A1/A2 合并");
  assert.match(task, /hash 由应用计算/, "B9.1 hash 口径须保留（应用计算）");
  assert.match(task, /不得用 shell 算 hash/, "B9.1 hash 口径须保留（禁止 shell hash）");
  assert.match(section, /A1 生产任务用 `stage:"A1"`（不是 A2）/, "首个动作段须点名运营派 A1 任务用 stage A1");
  assert.match(section, /A2 意图撰写另派/, "首个动作段须写明 A2 另派");
});

test("B9.2 A4/A5 分离：A4 受理任务 stage:\"A4\" 完成于创建；A5 方案任务 stage:\"A5\" 在 A4 收口后另派、完成于收口 + 文档证据", () => {
  const section = sectionOf(readV2(), STAGE_HEADING);
  const bullet = bulletLine(section, "- **A4→A5");
  assert.match(bullet, /两个阶段、两个任务，不得合并/, "须写死 A4/A5 为两个任务");
  assert.match(bullet, /stage:"A4"`? stage-request/, "A4 须由 stage-request 发起");
  assert.match(bullet, /`roleId:"rapporteur"`、`stage:"A4"`、`sideEffect:"docs"`/, "A4 受理任务须写死 rapporteur/stage A4/sideEffect docs");
  assert.match(bullet, /A4 完成于该任务创建/, "A4 完成于该任务创建");
  assert.match(bullet, /记 `stage\.dispatched A4`/, "A4 完成须点名 stage.dispatched A4");
  assert.match(bullet, /A4 收口后你发 \*\*A5 stage-request\*\*/, "A4 收口后须另发 A5 stage-request");
  assert.match(bullet, /`roleId:"rapporteur"`、`stage:"A5"`、`sideEffect:"docs"`/, "A5 须另派 rapporteur 任务 stage A5");
  assert.match(bullet, /A5 完成于该任务 closed accepted \+ 文档证据/, "A5 完成于收口 + 文档证据");
  assert.match(bullet, /proposal\/modules\/roster\/architecture 存在且 schema 校验通过/, "A5 文档证据须覆盖 proposal/modules/roster/architecture");
  assert.match(bullet, /不记 `stage\.dispatched A5`/, "A5 不得误记 stage.dispatched");
  assert.match(bullet, /策划不得自行发方案卡/, "策划不得自行发方案卡");
  const a4Task = bullet.indexOf('`stage:"A4"`');
  const a4Done = bullet.indexOf("A4 完成于该任务创建");
  const a5Request = bullet.indexOf("A5 stage-request");
  const a5Task = bullet.indexOf('`stage:"A5"`');
  assert.ok(a4Task >= 0 && a4Done > a4Task && a5Request > a4Done && a5Task > a5Request, "A4/A5 顺序须为 A4 任务 → A4 完成 → A5 请求 → A5 任务");
});

test("B9.2 A7/A8 分离：A7 受理任务 stage:\"A7\" 完成于创建；A8 激活任务 stage:\"A8\" 在 A7 收口后另派、完成于 role.activated", () => {
  const section = sectionOf(readV2(), STAGE_HEADING);
  const bullet = bulletLine(section, "- **A7→A8");
  assert.match(bullet, /两个阶段、两个任务，不得合并/, "须写死 A7/A8 为两个任务");
  assert.match(bullet, /stage:"A7"`? stage-request/, "A7 须由 stage-request 发起");
  assert.match(bullet, /`roleId:"nominator"`、`stage:"A7"`/, "A7 受理任务须写死 nominator/stage A7");
  assert.match(bullet, /A7 完成于该任务创建/, "A7 完成于该任务创建");
  assert.match(bullet, /记 `stage\.dispatched A7`/, "A7 完成须点名 stage.dispatched A7");
  assert.match(bullet, /A7 收口后你发 \*\*A8 stage-request\*\*/, "A7 收口后须另发 A8 stage-request");
  assert.match(bullet, /`roleId:"nominator"`、`stage:"A8"`/, "A8 须另派 nominator activation 任务 stage A8");
  assert.match(bullet, /activate_role_documents` v2/, "A8 须写死 activate_role_documents v2");
  assert.match(bullet, /proposalDecisionId \+ roster \+ 三文档，\*\*只传 path\*\*；hash 由应用在激活前按实际字节计算并回填/, "A8 入参须携 proposalDecisionId + roster + 三文档 path（hash 由应用回填；B17 口径）");
  assert.match(bullet, /A8 完成于全部名单角色激活/, "A8 完成于全部名单角色激活");
  assert.match(bullet, /role\.activated/, "A8 完成事件须点名 role.activated");
  assert.match(bullet, /A8 不弹客户卡/, "A8 不弹客户卡");
  const a7Task = bullet.indexOf('`stage:"A7"`');
  const a7Done = bullet.indexOf("A7 完成于该任务创建");
  const a8Request = bullet.indexOf("A8 stage-request");
  const a8Task = bullet.indexOf('`stage:"A8"`');
  assert.ok(a7Task >= 0 && a7Done > a7Task && a8Request > a7Done && a8Task > a8Request, "A7/A8 顺序须为 A7 任务 → A7 完成 → A8 请求 → A8 任务");
});

test("B9.2 stage.dispatched 记录集合：恰 A1/A4/A7/A8/A12a/A12b；A2/A5 不得误记；与桌面常量一致", () => {
  const text = readV2();
  const section = sectionOf(text, STAGE_HEADING);
  const recordSet = /`stage\.dispatched` 记录集合恰为 ([A-Za-z0-9/]+)/.exec(section);
  assert.ok(recordSet !== null, "阶段段须写死 stage.dispatched 记录集合");
  assert.deepEqual(recordSet![1]!.split("/"), ["A1", "A4", "A7", "A8", "A12a", "A12b"], "记录集合须恰为 A1/A4/A7/A8/A12a/A12b");
  assert.match(section, /不得误记 A2\/A5 `stage\.dispatched`/, "A2/A5 不得误记 stage.dispatched");
  assert.match(section, /A2\/A5\/A6\/A9\/A10\/A11\/A13 的阶段完成分别由 close\/card\/ledger 判定/, "A2/A5/A6/A9/A10/A11/A13 由 close/card/ledger 完成");
  // 与桌面应用常量同源核对（只读源码文本；不 import Electron 模块）。
  const appSource = readFileSync(join(REPO_ROOT, "app", "desktop", "workflow.ts"), "utf8");
  const constant = /FIXED_STAGE_DISPATCH_RECORD_STAGES = Object\.freeze\(\[([^\]]*)\]/.exec(appSource);
  assert.ok(constant !== null, "桌面须导出 FIXED_STAGE_DISPATCH_RECORD_STAGES");
  const appStages = JSON.parse(`[${constant![1]!}]`) as string[];
  assert.deepEqual(appStages, ["A1", "A4", "A7", "A8", "A12a", "A12b"], "桌面 stage.dispatched 集合须与资源一致（RR4 观测 2 的根因集合）");
});

test("B9.2 无合并回归：旧「A1/A4/A7 受理与 A2/A5/A8 产物同一任务」写法不得出现", () => {
  const section = sectionOf(readV2(), STAGE_HEADING);
  const offenders: ReadonlyArray<readonly [string, RegExp]> = [
    ["旧 A1 合并文本（运营受理后派 product 生产任务 stage A2）", /运营受理后派 product 生产任务/],
    ["旧 A1 完成条件（product 任务创建）", /A1 完成于 product 任务创建/],
    ["旧 A4/A5 合并文本（同一 rapporteur 任务 stage A5）", /运营派 rapporteur（`roleId:"rapporteur"`、`stage:"A5"`/],
    ["旧 A7/A8 合并文本（同一 nominator 任务 stage A8）", /运营派 nominator（`roleId:"nominator"`、`stage:"A8"`/],
  ];
  for (const [label, pattern] of offenders) {
    assert.doesNotMatch(section, pattern, `不得回归：${label}`);
  }
  // 禁用式提示可以有，但不得把合并写成完成条件：每个阶段条目须显式“不得合并”。
  for (const prefix of ["- **A1→A2", "- **A4→A5", "- **A7→A8"] as const) {
    assert.match(bulletLine(section, prefix), /不得合并/, `${prefix} 须明确禁止合并`);
  }
});

test("B9.2 冻结与资源事实：legacy 字节/模块 pin 不变；v2 版本行恰一处、≤256 KiB、无 BOM/NUL；B9.1 哈希口径保留", () => {
  const v1Bytes = readFileSync(V1_PATH);
  assert.equal(sha256Of(v1Bytes), V1_SHA256, "legacy 资源字节变化（fixed 只允许改 v2，不得改 legacy）");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.sha256, V1_SHA256, "模块数据 pin 须仍指向 legacy 资源字节");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1");
  const bytes = readFileSync(V2_PATH);
  const text = bytes.toString("utf8");
  const versions = [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]);
  assert.deepEqual(versions, ["chief-workflow/v2"], "v2 资源版本行须恰一处且为 chief-workflow/v2");
  assert.ok(statSync(V2_PATH).size <= 256 * 1024, "v2 资源不得超过 256 KiB");
  assert.notEqual(bytes[0], 0xef, "v2 资源不得带 UTF-8 BOM");
  assert.equal(bytes.includes(0), false, "v2 资源不得含 NUL");
  const policy = sectionOf(text, "## 任务文本与哈希口径");
  assert.match(policy, /不得用 shell 算 hash/, "B9.1 禁止 shell hash 口径须保留");
  assert.match(policy, /`sha256` 由应用计算/, "B9.1 应用计算 hash 口径须保留");
  assert.match(policy, /卡预算：3 张确认卡 \+ merge-main/, "B9.1 卡预算口径须保留");
});

test("B28 A12a/A12b 项目验收角色必须绑定 roster 模块；review 任务禁止 shell/mkdir，write_file 自动建目录", () => {
  const section = sectionOf(readV2(), STAGE_HEADING);
  const a12a = bulletLine(section, "- **A12a");
  // RR25：A12a 首派未绑定模块 ⇒ 写集为空、write_file 被拒；review 角色又以 cmd /c mkdir 触发 shell 卡。
  assert.match(a12a, /项目验收角色（`workflow\.reviewRoleId`）必须在任务上绑定其 roster 模块/, "A12a 项目验收角色须绑定模块");
  assert.match(a12a, /moduleId \+ modulePaths/, "A12a 须点名 moduleId + modulePaths");
  assert.match(a12a, /验收文件路径写在该模块内/, "A12a 验收文件路径须在模块内");
  assert.match(a12a, /不得运行任何 shell 命令（含 mkdir\/目录创建）/, "A12a 须禁止 shell/mkdir");
  assert.match(a12a, /`write_file`\/`edit_file` 会自动创建目录/, "A12a 须写明写工具自动建目录");
  assert.match(a12a, /`docs\/acceptance\/` 的应用归档由应用完成/, "A12a 须写明应用归档 docs/acceptance");
  const a12b = bulletLine(section, "- **A12b");
  assert.match(a12b, /项目验收角色同样必须绑定其 roster 模块 moduleId \+ modulePaths/, "A12b 同须绑定模块");
  assert.match(a12b, /review 任务文本同样禁止任何 shell（含 mkdir）/, "A12b 同须禁止 shell/mkdir");
  assert.match(a12b, /`write_file`\/`edit_file` 自动建目录/, "A12b 须写明写工具自动建目录");
});

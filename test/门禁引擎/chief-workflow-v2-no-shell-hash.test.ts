// 门禁引擎测试：T3「两条固定工作流路径」B9.1——fixed v2 资源禁止 worker 用 shell 算 hash。
//
// 依据：RR4 真机记录（`1bcdaf69…`：产品为意图文档 SHA256 调用 `run_shell certutil` ⇒ shell 审批卡，
// fixed 4 卡预算之外的额外客户门）；B1 v1.2 `AC-25`（shell 审批保留、审计不减少）、`AC-30`（真机全链）；
// 方案 v1.3 §4.2 A1/A2（hash 由应用计算）、§6.2/§6.3（shell 规则与提交门禁不因本批放宽）。
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
const POLICY_HEADING = "## 任务文本与哈希口径";

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

test("B9.1 任务文本哈希口径：worker 只报告路径/frontmatter 实际值与结论，hash 由应用计算", () => {
  const section = sectionOf(readV2(), POLICY_HEADING);
  assert.match(section, /只报告路径、frontmatter\/内容实际值与结论/, "须写死 worker 只报告路径/内容/结论");
  assert.match(section, /不要自己算或转抄哈希/, "须写死「不要自己算或转抄哈希」");
  assert.match(section, /`sha256` 由应用计算/, "须写死 sha256 由应用计算");
  assert.match(section, /任务收口/, "须说明应用在任务收口时计算 hash");
  assert.match(section, /归档/, "须说明应用在归档时计算 hash");
  assert.match(section, /依据\/漂移校验|documentRefs/, "须说明应用在依据/漂移校验或 documentRefs 时计算 hash");
  assert.match(section, /不写「给出\/附上 sha256」/, "任务文本不得要求 worker 给出/附上 sha256");
  assert.match(section, /路径 \+ frontmatter 实际值；hash 由应用计算/, "旧模板要求 hash 时须改为路径 + 应用计算");
});

test("B9.1 禁止词：v2 明确禁止 run_shell/certutil/Get-FileHash/PowerShell 等 shell 计算 hash", () => {
  const section = sectionOf(readV2(), POLICY_HEADING);
  assert.match(section, /不得用 shell 算 hash/, "须写死「不得用 shell 算 hash」");
  assert.match(section, /`run_shell`/, "须点名 run_shell");
  assert.match(section, /`certutil -hashfile`/, "须点名 certutil -hashfile（RR4 实测诱导命令）");
  assert.match(section, /`Get-FileHash`/, "须点名 Get-FileHash");
  assert.match(section, /PowerShell\/pwsh/, "须点名 PowerShell/pwsh");
  assert.match(section, /`sha256sum`/, "须点名 sha256sum");
  assert.match(section, /hash 不是 worker 产物/, "须写死 hash 不是 worker 产物");
});

test("B14 A1 环境探测禁令：任务文本不得要求 shell 环境/工具链探测（RR9 实测根因）", () => {
  const text = readV2();
  const a1 = sectionOf(text, "## 首个动作：A1 精确 stage-request");
  assert.match(a1, /A1 任务文本不得要求运营用 shell 做环境\/工具链探测/u, "A1 段须写死环境探测禁令");
  assert.match(a1, /`node -v`/u, "须点名 node -v");
  assert.match(a1, /`python --version`/u, "须点名 python --version（RR9 实测诱导命令）");
  assert.match(a1, /shell 审批\/拒绝面/u, "须说明会触发 shell 审批/拒绝面");
  assert.match(a1, /fixed 卡预算之外的额外门/u, "须说明属 fixed 卡预算之外的额外门");
  assert.match(a1, /`project_state`/u, "环境事实须以应用 project_state 只读事实为准");

  const policy = sectionOf(text, POLICY_HEADING);
  assert.match(policy, /任务文本不得要求 shell 环境探测/u, "政策段须重申 shell 环境探测禁令");
  assert.match(policy, /`node -v`/u);
  assert.match(policy, /`python --version`/u);
  assert.match(policy, /fixed 卡预算之外的额外门/u);
  assert.match(policy, /`project_state`/u);
});

test("B9.1 A1：stage-request JSON 任务文本模板携带 hash 口径（只报告路径/内容，hash 由应用计算）", () => {
  const section = sectionOf(readV2(), "## 首个动作：A1 精确 stage-request");
  const block = section.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block !== null, "A1 段须给出可复制的 JSON 调用示例");
  const call = JSON.parse(block![1]!) as Record<string, unknown>;
  const task = call["task"] as string;
  assert.equal(typeof task, "string");
  assert.match(task, /完成后只报告路径\/内容与结论/, "A1 任务文本模板须要求只报告路径/内容/结论");
  assert.match(task, /hash 由应用计算/, "A1 任务文本模板须写明 hash 由应用计算");
  assert.match(task, /不得用 shell 算 hash/, "A1 任务文本模板须写明不得用 shell 算 hash");
});

test("B9.1 A2/A7/A11：各阶段任务文本不再要求 worker 算 hash（应用计算/应用回执值）", () => {
  const stages = sectionOf(readV2(), "## 各阶段 fixed 任务字段与卡节奏");
  assert.match(stages, /A2 完成于该任务 closed accepted \+ 文档 hash（由应用计算）/, "A2 完成条件须明示 hash 应用计算");
  assert.match(stages, /不要求产品给出 sha256，不得用 shell 算 hash/, "A2 任务文本须禁止产品给出 sha256/shell hash");
  assert.match(
    stages,
    /roster path \+ `sha256`（取应用 A6 `documentRefs` 回执值，不由角色用 shell 计算）/,
    "A7 任务文本的 roster sha256 须取应用回执值，不由角色 shell 计算",
  );
  assert.match(stages, /实现任务文本须写明：完成后只报告路径、commit OID、变更与测试结论；hash 由应用计算，不得用 shell 算 hash/, "A11 实现任务文本须带 hash 口径");
  const order = sectionOf(readV2(), "## A10 与 A11 的顺序");
  assert.match(order, /hash 口径：完成后只报告路径、commit OID、变更与测试结论，hash 由应用计算，不得用 shell 算 hash/, "A11 stage-request 任务文本须携 hash 口径");
});

test("B9.1 卡预算：3 张确认卡 + merge-main；不应出现额外 shell/stable-write 卡，shell 卡属任务文本缺陷", () => {
  const section = sectionOf(readV2(), POLICY_HEADING);
  assert.match(section, /卡预算：3 张确认卡 \+ merge-main/, "须写死卡预算标题");
  assert.match(section, /意图确认（intent-confirm，A3）/, "预算须含 intent-confirm A3");
  assert.match(section, /方案确认（proposal，A6）/, "预算须含 proposal A6");
  assert.match(section, /任命确认（appointment，A10）/, "预算须含 appointment A10");
  assert.match(section, /`merge-main`（A13\/B4）/, "预算须含 merge-main");
  assert.match(section, /不应出现额外的 shell 审批卡、stable-write 卡或其它客户门/, "须禁止额外 shell/stable-write 客户门");
  assert.match(section, /不需要为 hash 触发任何客户卡/, "shell 审批是高风险动作，不应为 hash 触发客户卡");
  assert.match(section, /任务文本缺陷/, "shell 卡出现须按任务文本缺陷处理");
  const cards = sectionOf(readV2(), "## 3 张客户卡");
  assert.match(cards, /fixed 路径卡预算 = 这三张确认卡 \+ `merge-main`/, "3 卡段须重申卡预算");
});

test("B9.1 回归：政策段之外每处 hash/sha256 均标注应用计算/禁止口径（不要求 worker shell hash）", () => {
  const text = readV2();
  const policyStart = text.indexOf(POLICY_HEADING);
  assert.ok(policyStart >= 0, "资源须包含任务文本与哈希口径段");
  const next = text.indexOf("\n## ", policyStart + POLICY_HEADING.length);
  const policyEnd = next === -1 ? text.length : next;
  const qualifiers = ["由应用计算", "应用计算", "回执值", "无法核实", "机检", "不得", "不要求", "不写", "不采信"];
  const offenders: string[] = [];
  let cursor = 0;
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    const lineStart = cursor;
    cursor += line.length + 1;
    if (lineStart >= policyStart && lineStart < policyEnd) continue;
    if (!/hash|sha256/i.test(line)) continue;
    if (!qualifiers.some((qualifier) => line.includes(qualifier))) {
      offenders.push(`${index + 1}: ${line}`);
    }
  }
  assert.deepEqual(offenders, [], `政策段之外的 hash 提及必须标注应用计算/禁止口径：\n${offenders.join("\n")}`);
});

test("B9.1 冻结：legacy chief-workflow.md 字节 SHA-256 与模块数据 pin 逐字不变", () => {
  const bytes = readFileSync(V1_PATH);
  assert.equal(sha256Of(bytes), V1_SHA256, "legacy 资源字节变化（fixed 只允许新增 v2，不得改 legacy）");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.sha256, V1_SHA256, "模块数据 pin 须仍指向 legacy 资源字节");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1");
  assert.ok(
    CHIEF_WORKFLOW_RESOURCE.path.endsWith("workflows/chief/chief-workflow.md"),
    "模块资源引用路径须仍指向 legacy 资源",
  );
});

test("B9.1 资源事实：v2 版本行恰一处 chief-workflow/v2、≤256 KiB、无 BOM/NUL、既有主题保留", () => {
  const bytes = readFileSync(V2_PATH);
  const text = bytes.toString("utf8");
  const versions = [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]);
  assert.deepEqual(versions, ["chief-workflow/v2"], "v2 资源版本行须恰一处且为 chief-workflow/v2");
  assert.ok(statSync(V2_PATH).size <= 256 * 1024, "v2 资源不得超过 256 KiB");
  assert.notEqual(bytes[0], 0xef, "v2 资源不得带 UTF-8 BOM");
  assert.equal(bytes.includes(0), false, "v2 资源不得含 NUL");
  assert.ok(text.includes("# Chief 工作流（两条固定路径 v2）"), "标题须保留");
  assert.match(text, /## 派发分裂（谁派谁）/, "既有派发分裂段须保留");
  assert.match(text, /## 3 张客户卡/, "既有 3 张客户卡段须保留");
  assert.match(text, /## Git 普通用法（实现角色）/, "既有 Git 普通用法段须保留（本批不放宽 shell/提交门禁）");
});

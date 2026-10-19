// 门禁引擎测试：五张内置治理角色卡的「标准工作流」章节（客户 2026-10-19 反馈）
//
// 客户原话：「这个独立核准应该是标准流程，而不是我在发给他。」「内置角色应该有自己的工作流。」
// 本批口径：五张卡各加「标准工作流（按序执行）」章节，阶段流转由应用负责；客户只在需求确认、
// 提案/任命/写卡、验收卡上做决定，不承担内部角色调度。权力、Section 1、预授权、禁写、能力位与
// 判定逻辑零变化；既有 shell 审批档、写区、禁写、治理卡参数、判断代批纪律等段落逐字保留。
//
// 本文件只读注册表卡文本与静态数据，不写盘、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILT_IN_GOVERNANCE_ROLES,
  ENGINEERING_QUALITY_BASELINE,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";

/** 逐字取自 `governance-roles.ts` 的单一来源常量（本测试钉住五卡保留原文）。 */
const SHELL_APPROVAL_CARD_LINE =
  "shell 审批档——只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent 审批；审批不改变你的职责与写边界，写文件仍优先用 write_file 并经写盘确认。拒绝、超时、通道不可用一律不放行。";

function cardTextOf(id: string): string {
  const spec = governanceRoleOf(id);
  assert.ok(spec, `缺少注册表条目 ${id}`);
  return spec!.cardText;
}

function assertIncludesAll(text: string, needles: readonly string[], label: string): void {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${label} 须含「${needle}」`);
  }
}

test("标准工作流：五卡各恰有一个「标准工作流」章节，并含应用负责阶段流转的总则", () => {
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    const headings = t.match(/## 标准工作流/g) ?? [];
    assert.equal(headings.length, 1, `${spec.id} 卡须恰有一个「标准工作流」章节`);
    assert.match(t, /## 标准工作流（按序执行）/, `${spec.id} 卡章节标题须含（按序执行）`);
    // 章节位于「不拥有最终批准权」之后：先声明权力，再给工作流。
    assert.ok(
      t.indexOf("## 标准工作流") > t.indexOf("不拥有最终批准权"),
      `${spec.id} 标准工作流章节须在「不拥有最终批准权」之后`,
    );
    // 五卡逐字复用同一总则（单一来源 `STANDARD_WORKFLOW_PRINCIPLE`）。
    assertIncludesAll(
      t,
      [
        "阶段流转由应用负责",
        "你按本角色的标准工作流执行",
        "客户只在需求确认、提案/任命/写卡、验收卡上做决定",
        "不承担内部角色调度",
        "不要等客户催办",
        "也不要替应用推进下一阶段",
      ],
      `${spec.id} 卡标准工作流总则`,
    );
  }
});

test("标准工作流：Lead / 主理——需求→质量档位→写意图→意图确认卡→hand_off_intent；信息不足先问、不自行降档", () => {
  const t = cardTextOf("liaison");
  assertIncludesAll(
    t,
    [
      "接收客户需求",
      "记录质量档位",
      "写意图",
      "意图确认卡",
      "hand_off_intent",
      "信息不足先问客户",
      "不自行降档",
      "客户未指定时默认生产档",
      "客户选 `confirm` 后调用 `hand_off_intent`",
      "由应用在后台投递给 Draft / 提案",
    ],
    "Lead 标准工作流",
  );
});

test("标准工作流：Draft / 提案——读意图→提案（架构/质量齐备才出卡）→提案卡→接受后冻结契约", () => {
  const t = cardTextOf("rapporteur");
  assertIncludesAll(
    t,
    [
      "读意图",
      "形成提案",
      "架构方案",
      "架构影响分析",
      "质量基线与证据计划",
      "缺失架构或质量章节不得出提案卡",
      "提案卡",
      "接受后冻结契约",
      "docs/contracts/<name>-v1.md",
      "由应用推进到组队阶段",
    ],
    "Draft 标准工作流",
  );
});

test("标准工作流：Crew / 组队——读提案与流程→提名→任命卡→appointment-write 逐路径写卡→角色就绪；不自行任命", () => {
  const t = cardTextOf("nominator");
  assertIncludesAll(
    t,
    [
      "读提案与流程",
      "提名",
      "`recommended:` 推荐集",
      "推荐集只列项目角色",
      "模块—写区一一对应",
      "禁止重叠",
      "任命卡",
      "appointment-write 逐路径写卡",
      "不自行任命",
      "角色就绪",
      "写卡全部完成后角色才就绪",
    ],
    "Crew 标准工作流",
  );
});

test("标准工作流：Steward / 统筹——流程单→派发项目角色→收齐回交→登记完成→应用自动派 Proof；不派治理角色/不代替验收/不催办", () => {
  const t = cardTextOf("convener");
  assertIncludesAll(
    t,
    [
      "写流程单",
      "派发项目角色",
      "收齐回交",
      "登记完成",
      "应用自动派 Proof",
      "Steward 不派发治理角色、不代替验收、不催办",
      "只向已任命且已写卡的项目角色发起 `dispatch_task`",
      "不把「已派发」写成「已完成」",
      "全部步骤齐备后",
    ],
    "Steward 标准工作流",
  );
});

test("标准工作流：Proof / 验收——标准复核（真实跑测试/真实启动/演示/逐条核对）→验收卡；不依赖客户催办", () => {
  const t = cardTextOf("verifier");
  assertIncludesAll(
    t,
    [
      "标准复核不依赖客户催办",
      "读流程单/提案/契约/架构影响分析",
      "用审批档 shell 真实跑测试",
      "真实启动应用并演示",
      "启动命令",
      "访问地址",
      "关键输出与截图或录屏",
      "逐条核对",
      "质量基线",
      "架构声明",
      "发验收卡",
      "`cardKind=acceptance`",
      "`accept` / `reject`",
      "未真实运行、未演示时不得建议 accept",
      "架构或质量章节缺失",
      "不接受客户手动派发作为常态",
      "流程齐备后应用自动派发验收",
    ],
    "Proof 标准工作流",
  );
});

test("标准工作流：五卡保留既有 shell 审批档、质量基线、写区/禁写、判断代批与治理卡参数原文", () => {
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    // shell 审批档逐字保留（单一来源常量原文）。
    assert.ok(t.includes(SHELL_APPROVAL_CARD_LINE), `${spec.id} 卡须逐字保留 shell 审批档`);
    // 工程质量基线逐字保留（单一来源常量原文）。
    assert.ok(t.includes(ENGINEERING_QUALITY_BASELINE), `${spec.id} 卡须逐字保留工程质量基线`);
    assertIncludesAll(
      t,
      [
        "不拥有最终批准权",
        "判断代批纪律",
        "不得声称是客户本人点击或亲自批准",
        "不得把代批当作扩权",
        "治理卡参数纪律",
        "必须带 `flowId` + `cardKind`",
        "可写目录（Section 1）",
        "禁写路径",
        "只能由应用写",
        "不得创建额外的治理角色",
        "你的质量职责",
      ],
      `${spec.id} 卡既有纪律`,
    );
  }
});

test("标准工作流：不改变注册表权力/边界数据（Section 1、预授权、禁写与 shell 档保持原值）", () => {
  const expectedEntries: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["角色卡/", "docs/nominations/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
    verifier: ["docs/verification/", "docs/governance/verifier/"],
  };
  const expectedPreauthorized: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["docs/nominations/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/governance/convener/"],
    verifier: ["docs/verification/", "docs/governance/verifier/"],
  };
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.deepEqual(spec.entries.map((e) => e.path), expectedEntries[spec.id], `${spec.id} Section 1 不得变化`);
    assert.deepEqual(spec.preauthorizedDirs, expectedPreauthorized[spec.id], `${spec.id} 预授权不得变化`);
    assert.equal(spec.capabilities.shell, "operator-approve", `${spec.id} shell 档不得变化`);
    for (const p of [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"]) {
      assert.ok(spec.forbiddenWritePaths.includes(p), `${spec.id} 禁写 ${p} 不得变化`);
    }
  }
});

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
import { parse as parseYaml } from "yaml";

import {
  BUILT_IN_GOVERNANCE_ROLES,
  ENGINEERING_QUALITY_BASELINE,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../src/model/runtime.ts";

/** 逐字取自 `governance-roles.ts` 的单一来源常量（本测试钉住五卡保留原文）。 */
const SHELL_APPROVAL_CARD_LINE =
  "shell 审批档——只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent 审批；审批不改变你的职责与写边界，写文件仍优先用 write_file 并经写盘确认。拒绝、超时、通道不可用一律不放行。";

/** 治理 slug 正则：唯一来源为 Model 常量（2026-10-22 收紧，禁止尾连字符；设计 S4）。 */
const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

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
      "客户或判断 agent 代批 `confirm` 后才能调用 `hand_off_intent`",
      "客户开启「替我决策」时，判断 agent 可代批 `confirm`",
      "`revise` 永远不由判断代选",
      "代批不是客户逐项批准、不改写客户意图",
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

test("标准工作流：Crew / 组队——读客户确认后的团队计划→appointment-write 逐路径写卡→应用结构校验→角色就绪；不提名/不发 appointment", () => {
  const t = cardTextOf("nominator");
  assertIncludesAll(
    t,
    [
      "读团队计划（客户确认后）",
      "docs/scheduling/<flowId>-team-v1.md",
      "你只读，不修改、不自行增删角色/边界/写集",
      "任命名单内每个角色的职责目标、能力要求、唯一写集、依赖",
      "计划缺能力细节时**停止写卡并报告 Steward / 统筹 补充**",
      "只对任命名单内的角色发 `request_confirmation`",
      "appointment-write 逐路径写卡",
      "第 5 项内容清单",
      "写卡后交应用校验",
      "角色就绪",
      "写卡全部完成且应用结构校验通过后",
      "不再选择角色、不再组建团队、不再写 `docs/nominations/**`、不再发 appointment 卡",
      "不自行扩大职责",
    ],
    "Crew 标准工作流",
  );
  // 2026-10-22 治理分工：旧「读提案→提名→任命卡」流程与推荐集口径必须从 Crew 卡消失。
  assert.doesNotMatch(t, /1\. 读提案与流程/, "Crew 不再以提名流程起步");
  assert.doesNotMatch(t, /2\. 提名：/, "Crew 不再写提名文件");
  assert.doesNotMatch(t, /推荐集只列项目角色/, "推荐集口径已移交 Steward / 统筹");
});

test("第 5 项内容清单（P7）：Crew 卡逐项列出 role-card 章节、boundary、工作文档与 api-spec not-applicable", () => {
  const t = cardTextOf("nominator");
  assertIncludesAll(
    t,
    [
      "## 第 5 项内容清单（必须，按团队计划逐角色写齐）",
      "角色名/组别/工作立场",
      "能力描述",
      "职责与功能导航",
      "必读资料",
      "交接输入输出",
      "执行原则",
      "质量职责",
      "标准工作流（按序：输入→动作→交付→回交）",
      "交付物清单",
      "boundary.yaml",
      "角色根工作文档条目",
      "实际写集",
      "feature-map.md",
      "functional-description.md",
      "memo.md",
      "api-spec.md",
      "not-applicable",
      "非空、可核对理由",
      "docs/feature/<feature-id>.md",
      "docs/design/",
      "docs/change/",
      "docs/fix/",
      "不创建空目录/空文件冒充交付",
      "内容以团队计划的职责目标/能力要求/唯一写集/依赖为准",
    ],
    "Crew 第 5 项内容清单",
  );
  // 不得把「模板存在」当「能力描述已完成」：写卡完成仍须应用结构校验 + Steward readiness。
  assert.doesNotMatch(t, /能力描述已完成/, "Crew 不得宣称能力描述已完成");
});

test("第 5 项 readiness（P8）：Steward 写 pass/gaps 记录，gap 退回 Crew，计划缺细节由 Steward 补充；不做成验收结论", () => {
  const t = cardTextOf("convener");
  assertIncludesAll(
    t,
    [
      "role-readiness",
      "status: pass|gaps",
      "职责目标、能力要求、写集/边界、依赖/交接、质量责任",
      "gap 报告应用退回 Crew 修正",
      "团队计划缺能力细节时由你补充计划",
      "readiness 不是验收标准、不是客户确认",
      "pass 后才按 flow 步骤派发项目角色",
    ],
    "Steward readiness 纪律",
  );
});

test("标准工作流：Steward / 统筹——写团队计划→发 appointment 卡→readiness→派发项目角色→收齐回交→登记完成→组变更包；应用自动派 Proof", () => {
  const t = cardTextOf("convener");
  assertIncludesAll(
    t,
    [
      "写流程单",
      "判断团队",
      "docs/scheduling/<flowId>-team-v1.md",
      "`recommended: [role-a, role-b]`",
      "`cardKind=appointment`",
      "role-readiness",
      "docs/scheduling/<flowId>-readiness-v1.md",
      "变更包",
      "docs/scheduling/<flowId>-change-v1.md",
      "团队计划档位是下限",
      "派发项目角色",
      "收齐回交",
      "登记完成",
      "应用自动派 Proof",
      "Steward 不派发治理角色、不代替验收、不催办",
      "只向已任命、已写卡且 readiness pass 的项目角色发起 `dispatch_task`",
      "不把「已派发」写成「已完成」",
      "全部步骤齐备后",
    ],
    "Steward 标准工作流",
  );
});

test("标准工作流：Steward / 统筹——流程机器状态改为 docs/flows/<flowId>.yaml（schema/保留 ID/evidence/superseded）", () => {
  // 客户 2026-10-19 决定（原文：「这些全部改成yaml。」）：流程状态唯一机器来源是 YAML，
  // Markdown 仅人读视图；Steward 必须按 schema 写 YAML，显式 kind/evidence/supersedes，
  // 保留 id verification/acceptance 归应用自动派 Proof，被 retake 取代的步骤标 superseded。
  const t = cardTextOf("convener");
  assertIncludesAll(
    t,
    [
      "docs/flows/<flowId>.yaml",
      "唯一机器状态",
      "人读视图",
      "不得承载门禁状态",
      "flowId: <flowId>",
      "version: 1",
      "qualityTier: production",
      "steps:",
      "`id` / `title` / `owner` / `kind` / `status` / `evidence` / `supersedes` / `supersededBy`",
      "`dispatch` / `customer-decision` / `artifact` / `acceptance`",
      "`pending` / `dispatched` / `delivered` / `done` / `superseded` / `failed` / `blocked`",
      "`aborted` 会被识别并挡门",
      "`evidence` 是对象 `{ kind, ref }`",
      "`kind` 必须与步骤 `kind` 一致",
      "`status: done` 的步骤必须有 `evidence`",
      "无证据不得标 `done`",
      "**保留 ID**",
      "`verification` / `acceptance`",
      "唯一的验收步骤",
      "`kind: acceptance`",
      "初始 `status: pending`",
      "你不占用、不派发、不标 `done`",
      "`verification-evidence`",
      "`status: superseded`",
      "`supersededBy: <新步骤 id>`",
      "`supersedes: [<旧步骤 id>]`",
      "不要保留 `aborted` / `failed` 行挡收尾门",
      "非法 `id`（含占用保留 id）",
      "非法枚举值",
      "未知字段",
      "`done` 缺 `evidence` 都会被拒绝",
      "不得改用 Markdown 表格",
      "stepId 不一致时派发会被拒",
    ],
    "Steward 流程 YAML 契约",
  );
  // YAML 模板必须逐字可见（含顶层必填、done + evidence 与非保留执行步骤 id）。
  assert.ok(t.includes("  - id: verification-evidence"), "模板须含非保留的执行/证据步骤 id");
  assert.ok(t.includes("      ref: docs/contracts/<name>-v1.md"), "模板须显式给出 evidence.ref");
  // 旧 Markdown 步骤表模板必须消失：不得回退到 Markdown 承载机器状态。
  assert.doesNotMatch(t, /\| stepId \|/, "Steward 卡不得再用 Markdown 步骤表模板");
  assert.doesNotMatch(t, /stepId 必须在表格第一列/, "旧表格约束必须删除");
});

test("标准工作流：Steward 卡中的 YAML 模板可被 yaml 解析，顶层/字段/枚举/evidence 合法且保留 id 只用于验收步骤", () => {
  const t = cardTextOf("convener");
  const match = /```yaml\n([\s\S]*?)```/.exec(t);
  assert.ok(match, "Convener 卡须含 ```yaml 模板块");
  const doc = parseYaml(match![1]) as {
    flowId?: unknown;
    version?: unknown;
    qualityTier?: unknown;
    steps?: Array<Record<string, unknown>>;
  };
  assert.equal(doc.flowId, "<flowId>", "模板须含顶层 flowId（与文件名一致）");
  assert.equal(doc.version, 1, "模板须含正整数 version");
  assert.equal(doc.qualityTier, "production", "模板须含 qualityTier（prototype / production）");
  assert.ok(Array.isArray(doc.steps) && doc.steps.length > 0, "模板须解析出 steps 数组");
  const kinds = new Set(["dispatch", "customer-decision", "artifact", "acceptance"]);
  const statuses = new Set([
    "pending",
    "dispatched",
    "delivered",
    "done",
    "superseded",
    "failed",
    "blocked",
    "aborted",
  ]);
  const ids = new Set<string>();
  let acceptanceSteps = 0;
  for (const step of doc.steps!) {
    assert.equal(typeof step.id, "string", "步骤须有 id");
    assert.equal(typeof step.title, "string", "步骤须有 title");
    assert.equal(typeof step.owner, "string", "步骤须有 owner");
    const id = String(step.id);
    assert.match(id, GOVERNANCE_SLUG_RE, `步骤 id 须为小写 slug：${id}`);
    assert.equal(ids.has(id), false, `步骤 id 不得重复：${id}`);
    ids.add(id);
    assert.ok(kinds.has(String(step.kind)), `kind 非法：${String(step.kind)}`);
    assert.ok(statuses.has(String(step.status)), `status 非法：${String(step.status)}`);
    if (id === "verification" || id === "acceptance") {
      assert.equal(step.kind, "acceptance", "保留 id 只能用于验收步骤（kind: acceptance）");
      assert.equal(step.status, "pending", "验收步骤初始状态必须 pending");
    }
    if (step.kind === "acceptance") {
      acceptanceSteps += 1;
      assert.ok(step.id === "verification" || step.id === "acceptance", "验收步骤必须使用保留 id");
    }
    if (step.status === "done") {
      const evidence = step.evidence;
      assert.ok(
        typeof evidence === "object" && evidence !== null && !Array.isArray(evidence),
        "done 的步骤须有 evidence 对象 { kind, ref }",
      );
      const record = evidence as Record<string, unknown>;
      assert.equal(record.kind, step.kind, "evidence.kind 必须与步骤 kind 一致");
      assert.equal(typeof record.ref, "string", "evidence.ref 必填");
      assert.notEqual(record.ref, "", "evidence.ref 不得为空");
    }
  }
  assert.equal(acceptanceSteps, 1, "模板须恰有一个验收步骤（保留 id）");
  assert.ok(
    doc.steps!.some((step) => step.id === "verification-evidence"),
    "模板须给出非保留的执行/证据步骤示例（verification-evidence）",
  );
  assert.ok(doc.steps!.some((step) => step.kind === "dispatch"), "模板须给出 dispatch 步骤示例");
});

test("标准工作流：slug 校验引用 Model 常量（单一来源）——合法正例通过、尾连字符负例被拒绝", () => {
  // 2026-10-22 客户确认按设计 S4 收紧共享 slug 契约：测试侧删除旧正则副本，
  // 统一从 Model 常量编译（设计 §2.1/§3.3 S4、§五 T12）。尾连字符形状必须被显式拒绝。
  assert.equal(
    GOVERNANCE_SLUG_RE.source,
    GOVERNANCE_SLUG_PATTERN,
    "测试侧正则须由 Model 常量构造（单一来源）",
  );
  assert.match("flow-a", GOVERNANCE_SLUG_RE, "合法正例 flow-a 须通过");
  assert.match("impl", GOVERNANCE_SLUG_RE, "模板执行步骤 id impl 须通过");
  assert.doesNotMatch("flow-", GOVERNANCE_SLUG_RE, "尾连字符 flow- 须被拒绝");
  assert.doesNotMatch("a-", GOVERNANCE_SLUG_RE, "尾连字符 a- 须被拒绝");
  assert.doesNotMatch("impl-", GOVERNANCE_SLUG_RE, "尾连字符 impl- 须被拒绝");
});

test("标准工作流：五卡流程状态引用统一为 YAML（唯一机器状态），Markdown 仅人读视图；Crew/Proof 按 YAML 读取", () => {
  // 客户 2026-10-19 决定「这些全部改成yaml」：不只是 Steward 写 YAML，其余四张卡的治理文件命名与
  // 流程读取也必须统一为 YAML 机器状态；Markdown 只在人读视图出现。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    assert.ok(t.includes("`docs/flows/<flowId>.yaml`"), `${spec.id} 须引用 YAML 机器状态路径`);
    assert.ok(t.includes("唯一机器状态"), `${spec.id} 须写明 YAML 是唯一机器状态`);
    assert.ok(t.includes("`docs/flows/<flowId>.md`"), `${spec.id} 须保留 Markdown 人读视图路径`);
    assert.ok(t.includes("仅人读视图"), `${spec.id} 须写明 Markdown 仅人读视图`);
  }
  // Crew 读流程必须读 YAML 机器状态，不得只写泛化的 docs/flows/**。
  const n = cardTextOf("nominator");
  assert.match(
    n,
    /用 `flow_get` 读取流程摘要与你负责的步骤（`docs\/flows\/<flowId>\.yaml` 是唯一机器状态；同名 `\.md` 仅人读视图）/,
    "Crew 须用 flow_get 按 YAML 读取流程单",
  );
  // Proof 标准复核按 YAML 读取流程状态（Markdown 仅人读）。
  const v = cardTextOf("verifier");
  assert.match(
    v,
    /用 `flow_get` 读取流程摘要与你负责的步骤（`docs\/flows\/<flowId>\.yaml` 是唯一机器状态；同名 `\.md` 仅人读视图）/,
    "Proof 须用 flow_get 按 YAML 读取流程状态",
  );
  assert.doesNotMatch(
    v,
    /读流程单\/提案\/契约\/架构影响分析：读 `docs\/flows\/<flowId>\.md`/,
    "Proof 不得再把 Markdown 当流程状态来源",
  );
});

test("标准工作流：写卡被 declined——Crew/Steward 按 reason 修正后重发确认卡；judge deny 是系统审批拒绝不是客户决定", () => {
  // 真机 2026-10-19：Crew 的 appointment-write 写卡内容不合规（README 归属未定案、tester boundary
  // 混入 Markdown 散文），判断 agent 只能 manual、客户被迫手批。客户要求判断 agent 拒绝并把原因退回
  // Crew 重做；编排增加 approval `deny`，桌面把 deny 转成 declined + 原因回投发起角色。
  const crew = cardTextOf("nominator");
  assertIncludesAll(
    crew,
    [
      "写卡被拒（declined）时（必须）",
      "`request_confirmation` 返回 `declined`（含自动审批 deny 的原因）",
      "按 `reason` 修正",
      "重新发确认卡",
      "不得绕过确认",
      "不得直接 `write_file`",
      "不得把原因当客户已同意",
      "不循环空转",
    ],
    "Crew declined 纪律",
  );
  assert.match(
    crew,
    /appointment-write[\s\S]{0,220}declined[\s\S]{0,120}重新发确认卡/,
    "Crew 的 appointment-write 工作流须写死 declined 后重发确认卡",
  );

  const steward = cardTextOf("convener");
  assertIncludesAll(
    steward,
    [
      "写卡被拒（declined）时（必须）",
      "`request_confirmation` 返回 `declined`（含自动审批 deny 的原因）",
      "修正流程状态 YAML（初始创建）或排程内容",
      "重新发确认卡",
      "不得绕过确认",
      "不得直接 `write_file`",
      "不得把原因当客户已同意",
      "不循环空转",
      "写卡完成/角色枚举出现后，按流程 YAML 继续下一步（派发/回交/登记），不要等客户催办",
    ],
    "Steward declined 纪律",
  );

  // 五卡统一：judge deny 是系统审批拒绝，不是客户决定，不写入客户决定账本。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assertIncludesAll(
      spec.cardText,
      [
        "判断 agent 的 `deny` 是系统审批拒绝（拒绝本次写盘/命令），不是客户决定，不写入客户决定账本",
        "不得把它当作客户意见或同意",
      ],
      `${spec.id} judge deny 纪律`,
    );
  }
});

test("标准工作流：Crew appointment-write 后应用校验——role-card 非空/标题、boundary role 与目录一致、entries 非空纯 YAML；失败修正重发", () => {
  // 客户 2026-10-20：appointment-write 写完后应用做确定性门控；失败把具体路径/错误退回 Crew，
  // 不派 Convener、不弹客户卡。
  const crew = cardTextOf("nominator");
  assertIncludesAll(
    crew,
    [
      "appointment-write 后应用校验（必须）",
      "等待/接受应用的确定性校验",
      "`role-card.md` 存在、非空且有 Markdown 标题",
      "`boundary.yaml` 可解析、顶层 `role` 与目录 id 一致",
      "`entries` 非空且为纯 YAML",
      "不得混入 Markdown 散文",
      "「角色卡/边界校验未通过」反馈任务",
      "按所列文件与错误修正后**重新发 appointment-write 确认卡**",
      "不得绕过校验",
      "不得直接 `write_file`",
      "不得把校验问题当客户同意",
      "不派 Convener、不弹客户卡",
      "`boundary.yaml` 顶层 `role` 必须等于目录 id",
      "`entries` 必须非空",
    ],
    "Crew 写卡校验纪律",
  );
  // 反向断言：校验失败不得被写成「直接写文件绕过」或「客户同意」。
  assert.doesNotMatch(
    crew,
    /校验未通过[^。]{0,60}(直接 `write_file` 绕过|当客户同意)/,
    "Crew 不得把校验失败当同意或直接写文件绕过",
  );
});

test("标准工作流：流程工具——Steward 初始创建例外 + flow_get/flow_step_update/flow_step_supersede；Crew/Draft/Proof 只读流程并用工具记录状态", () => {
  // 客户 2026-10-20 拍板「按这个方案做吧」：流程文件改为方法化工具。初始创建仍走
  // request_confirmation(schedule-write)；创建后步骤状态推进用 flow_get + flow_step_update，
  // 返工用 flow_step_supersede；所有角色不得直接写 docs/flows/**。
  const steward = cardTextOf("convener");
  assertIncludesAll(
    steward,
    [
      "flow_get",
      "flow_step_update",
      "flow_step_supersede",
      "`expectedRevision` 必须来自最近一次 `flow_get`（或更新回执）的 revision",
      "`revision-conflict`（版本冲突）",
      "不盲目重试",
      "初始创建",
      "`request_confirmation`（`cardKind=schedule-write`）",
      "不要直接 `write_file` 流程 YAML",
      "不再为每次状态更新写文件/发写卡",
      "`done` 前必须已有账本可对账的 `evidence`",
      "旧步骤标 `superseded`、新步骤 `pending`",
      "既有验收卡规则",
      "步骤推进 ≠ 客户批准",
      "Steward 可更新全部步骤，其他角色只能更新自己的步骤",
      "`flow_step_supersede`（Steward/Lead 工作流管理者）做返工",
    ],
    "Steward 流程工具纪律",
  );
  // 初始创建仍走既有写卡门；创建后的步骤推进走工具。
  assert.match(steward, /写流程单（仅初始创建）[\s\S]{0,220}schedule-write/, "Steward 初始创建须保留 schedule-write");
  assert.match(steward, /登记完成：先用 `flow_get`[\s\S]{0,160}flow_step_update/, "Steward 登记完成须先 get 再 update");
  assert.doesNotMatch(steward, /`flow_step_supersede`（仅 Steward）/, "supersede 归 Steward/Lead 工作流管理者，不得再写仅 Steward");

  for (const id of ["nominator", "rapporteur", "verifier"] as const) {
    const t = cardTextOf(id);
    assertIncludesAll(
      t,
      [
        "flow_get",
        "flow_step_update",
        "不得直接写 `docs/flows/**`",
        "`expectedRevision` 必须来自最近一次 `flow_get`（或更新回执）的 revision",
        "`revision-conflict`（版本冲突）",
        "证据不足",
        "insufficient-evidence",
        "你只能把 owner=自己的步骤更新到 `delivered`",
        "不要自己标 `done`",
        "`done` 由 Steward / Lead 核对账本证据后标记",
        "步骤推进不等于客户决定/同意",
      ],
      `${id} 流程工具纪律`,
    );
  }
  // 交付/回交后由步骤 owner 或 Steward 记录状态；三张卡各有落点。
  assert.match(cardTextOf("rapporteur"), /contract-freeze[\s\S]{0,160}flow_step_update/, "Draft 契约冻结后须用工具记录");
  assert.match(cardTextOf("nominator"), /role-cards[\s\S]{0,160}flow_step_update/, "Crew 完成写卡步骤后须用工具记录");
  assert.match(cardTextOf("verifier"), /不用 `flow_step_update` 代替客户验收决定/, "Proof 不得用工具代替验收决定");
});

test("标准工作流：Lead 工作流管理者——flow_get/flow_step_update/flow_step_supersede + dispatch_task；Steward 接受 Lead 协调任务；Crew/Draft/Proof 向 Lead 回交", () => {
  // 客户 2026-10-20 拍板：Lead / 主理 设为工作流管理者，可与所有职能角色沟通/派发协调任务。
  const lead = cardTextOf("liaison");
  assertIncludesAll(
    lead,
    [
      "工作流管理者",
      "flow_get",
      "flow_step_update",
      "flow_step_supersede",
      "dispatch_task",
      "向 Steward / 统筹 与项目角色派发协调任务",
      "自足并带 `flowId`",
      "向 Steward 派协调任务可省 `stepId`",
      "派发/推进 ≠ 客户批准",
      "不得伪造 `done` 证据",
      "不得直接写 `docs/flows/**`",
      "`revision-conflict`（版本冲突）",
      "`insufficient-evidence`",
      "内部决策纪律（必须）",
      "契约措辞、实现细节、排期等内部工程/协调选择",
      "不得发 `request_choice` 问客户",
      "Lead 只能发 `intent-confirm` 需求确认卡",
      "内部决策由你自行决定",
      "`dispatch_task` 派给 Steward / 项目角色",
      "并用 flow 工具记录",
      "不得把内部选择包装成客户决定或另发 `request_choice`",
    ],
    "Lead 工作流管理",
  );
  // 能力位：dispatchTask=true；其余能力不变。
  const leadCaps = governanceRoleOf("liaison")!.capabilities;
  assert.equal(leadCaps.dispatchTask, true, "Lead 具备 dispatch_task");
  assert.equal(leadCaps.handOffIntent, true, "Lead 仍保留 hand_off_intent");
  assert.equal(leadCaps.roleStatus, false, "Lead 不获得看护能力");
  assert.equal(leadCaps.installSkill, false, "Lead 不获得技能安装能力");
  // Steward：承认 Lead 工作流管理者身份；收到 Lead 任务不跳过证据/门禁。
  const steward = cardTextOf("convener");
  assertIncludesAll(
    steward,
    [
      "Lead / 主理 也是工作流管理者",
      "不因来源是 Lead 就跳过证据/门禁",
      "你仍是流程/排程执行者",
    ],
    "Steward 接受 Lead 协调",
  );
  // Crew/Draft/Proof：可向 Lead 回交/协调；不得直接写 docs/flows；步骤更新仍按工具与证据。
  for (const id of ["nominator", "rapporteur", "verifier"] as const) {
    assertIncludesAll(
      cardTextOf(id),
      [
        "可向 Lead / 主理 回交/协调",
        "不得直接写 `docs/flows/**`",
        "flow_step_update",
        "证据不足",
      ],
      `${id} 向 Lead 回交`,
    );
    // 非管理者不得自己标 done：delivered 由 owner，done 由 Steward/Lead。
    assert.doesNotMatch(
      cardTextOf(id),
      /记录 `delivered` \/ `done`/,
      `${id} 不得写「记录 delivered / done」式越权指令`,
    );
  }
});

test("标准工作流：Proof / 验收——实施前写标准→核对档位/复用证据→核对真实启动演示→逐条核对→报告+验收卡；不依赖客户催办", () => {
  const t = cardTextOf("verifier");
  assertIncludesAll(
    t,
    [
      "标准复核不依赖客户催办",
      "读流程单/提案/契约/架构影响分析",
      "docs/acceptance/<flowId>-criteria-v1.md",
      "风险档位 T0–T3",
      "版本冻结规则",
      "docs/scheduling/<flowId>-change-v1.md",
      "同候选、同输入/依赖、同命令的证据可复用",
      "只补缺失/失效/高风险检查",
      "你只能升档、不能降档",
      "用审批档 shell 亲自复跑",
      "按团队计划产出的真实启动/演示证据",
      "真实启动应用并演示",
      "启动命令",
      "访问地址",
      "关键输出与截图或录屏",
      "逐条核对",
      "质量基线",
      "架构声明",
      "docs/acceptance/<flowId>-report-v1.md",
      "首行五项",
      "报告档位不得低于变更包档位",
      "insufficient evidence",
      "写报告并发验收卡",
      "`cardKind=acceptance`",
      "`accept` / `reject`",
      "未真实运行、未演示时不得建议 accept",
      "架构或质量章节缺失",
      "不接受客户手动派发作为常态",
      "流程齐备后应用自动派发验收",
    ],
    "Proof 标准工作流",
  );
  // 2026-10-22：证据来源改为实施/装配/测试角色产出、Verifier 核对并可复跑；不得弱化为只看报告。
  assertIncludesAll(
    t,
    ["核对实施/装配/测试角色按团队计划产出的真实启动/演示证据", "缺失、失效或高风险时用审批档 shell 亲自复跑或要求补做"],
    "Proof 证据来源与复跑",
  );
  assert.doesNotMatch(t, /不核对原始证据/, "Proof 不得放弃证据核对");
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

test("注册表：按 2026-10-22 治理分工只调整 Convener/Crew/Verifier 写权，其他角色与 shell 档不变", () => {
  const expectedEntries: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["角色卡/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/workflow.md", "docs/scheduling/", "docs/governance/convener/"],
    verifier: ["docs/acceptance/", "docs/verification/", "docs/governance/verifier/"],
  };
  const expectedPreauthorized: Record<string, string[]> = {
    liaison: ["docs/intents/"],
    rapporteur: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    nominator: ["docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
    convener: ["docs/flows/", "docs/scheduling/", "docs/governance/convener/"],
    verifier: ["docs/acceptance/", "docs/verification/", "docs/governance/verifier/"],
  };
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    assert.deepEqual(spec.entries.map((e) => e.path), expectedEntries[spec.id], `${spec.id} Section 1 须按本项调整`);
    assert.deepEqual(spec.preauthorizedDirs, expectedPreauthorized[spec.id], `${spec.id} 预授权须按本项调整`);
    assert.equal(spec.capabilities.shell, "operator-approve", `${spec.id} shell 档不得变化`);
    for (const p of [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"]) {
      assert.ok(spec.forbiddenWritePaths.includes(p), `${spec.id} 禁写 ${p} 不得变化`);
    }
  }
  // 关键禁区：不授予 Convener 角色卡写权；不授予 Crew docs/scheduling/ 写权。
  assert.equal(BUILT_IN_GOVERNANCE_ROLES.find((s) => s.id === "convener")!.entries.some((e) => e.path === "角色卡/"), false);
  assert.equal(BUILT_IN_GOVERNANCE_ROLES.find((s) => s.id === "nominator")!.entries.some((e) => e.path === "docs/scheduling/"), false);
  assert.ok(BUILT_IN_GOVERNANCE_ROLES.find((s) => s.id === "nominator")!.forbiddenWritePaths.includes("docs/scheduling/"));
  assert.equal(BUILT_IN_GOVERNANCE_ROLES.find((s) => s.id === "nominator")!.entries.some((e) => e.path === "docs/nominations/"), false);
  assert.equal(BUILT_IN_GOVERNANCE_ROLES.find((s) => s.id === "nominator")!.preauthorizedDirs.includes("docs/nominations/"), false);
});

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
    assert.match(id, /^[a-z0-9][a-z0-9-]{1,63}$/, `步骤 id 须为小写 slug：${id}`);
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
  assert.match(cardTextOf("nominator"), /nomination \/ role-readiness[\s\S]{0,160}flow_step_update/, "Crew 角色就绪后须用工具记录");
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

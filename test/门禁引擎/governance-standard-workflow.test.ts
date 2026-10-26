// 门禁引擎测试：五张内置治理角色卡的「标准工作流」章节（客户 2026-10-19 反馈）
//
// 客户原话：「这个独立核准应该是标准流程，而不是我在发给他。」「内置角色应该有自己的工作流。」
// 本批口径：五张卡各加「标准工作流（按序执行）」章节，阶段流转由应用负责；客户只在需求确认、
// 提案/任命/写卡、验收卡上做决定，不承担内部角色调度。权力、Section 1、预授权、禁写、能力位与
// 判定逻辑零变化；既有 shell 审批档、写区、禁写、治理卡参数、判断代批纪律等段落逐字保留。
// 2026-10-24 客户修订（intent `2026-10-24_intent_independent-acceptance-all-changes.md`）：独立验收
// 覆盖所有变更（含非发布），撤销「只有发布版本才派 Proof、非发布不派」；本文件按新口径断言卡文本。
//
// 本文件只读注册表卡文本与静态数据，不写盘、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";

import {
  BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE,
  BUILT_IN_GOVERNANCE_ROLES,
  ENGINEERING_QUALITY_BASELINE,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../src/model/runtime.ts";

/** 逐字取自 `governance-roles.ts` 的单一来源常量（本测试钉住五卡保留原文）。 */
const SHELL_APPROVAL_CARD_LINE =
  "shell 审批档——只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/判断 agent 审批；审批不改变你的职责与写边界：Section 1 边界内的写入是预授权，直接用 `write_file` / `edit_file`（不逐次 `request_confirmation`），边界外与治理敏感写入仍按本卡与既有规则拒绝或需确认。拒绝、超时、通道不可用一律不放行。";

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
        "内置角色（Draft / 提案、Crew / 组队、Steward / 统筹、Proof / 验收）的状态与回交向主理（Lead / 主理）汇总",
        "主理只做治理协调，不批准提案、任命或验收",
        "客户只在需求确认、提案/任命/写卡、验收卡上做决定",
        "不承担内部角色调度",
        "应用仍负责门禁（闸门 0/1/2、验收门）与阶段流转",
        "**所有变更（含非发布）在流程 / 证据 / change-package 齐备后，由应用按验收门自动派 Proof / 验收**",
        "`release` 只是可选发布元数据，不是独立验收的启动条件",
        // 2026-10-24 P1-7：delivered 由步骤 owner 标，manager 只核 done；worker 不能 done。
        "**步骤状态权限（必须）**",
        "`dispatched → delivered` 只能由该步骤的 owner（项目角色 / worker）标记",
        "manager（Steward / 统筹、Lead / 主理）不得代标 `delivered`",
        "只能在 owner 交付 `delivered` 后核证并标 `done`（`delivered → done`）",
        "worker 不能标 `done`",
        "不要等客户催办",
        "也不要替应用推进下一阶段",
      ],
      `${spec.id} 卡标准工作流总则`,
    );
    // 2026-10-24 客户修订：撤销「只有发布版本才派 Proof、非发布不派」——旧发布独占口径不得残留。
    for (const legacy of ["非发布不派", "只有发布版本才由应用派", "发布验收门", "停在等待发布验收"]) {
      assert.ok(!t.includes(legacy), `${spec.id} 卡不得再出现旧发布独占口径「${legacy}」`);
    }
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
      "你只读，不修改、不自行增删角色/目录/边界/写集",
      "任命名单内每个角色的职责目标、能力要求、`授权目录`、`精确写集`、依赖",
      "读目录规范与每个 module 的 `实现目录`",
      "`唯一写集` 仅作兼容别名，按 `精确写集` 处理",
      "`边界` 列名在 v3 不再接受",
      "**停止写卡并报告 Steward / 统筹 补充**",
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
      "bounded context（module）** 与模块 **`实现目录`",
      "`授权目录`/`精确写集`**（与团队计划一致）",
      "boundary.yaml",
      "角色根工作文档条目",
      "`授权目录`（directory 条目，与计划目录一致）与 `精确写集`（file 条目）",
      "按计划逐条落盘",
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
      "内容以团队计划的职责目标/能力要求/`授权目录`/`精确写集`/目录规范/依赖为准",
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
      "`docs/scheduling/<flowId>-readiness-v1.md`",
      "status: pass|gaps",
      "职责目标、能力要求、`授权目录`/`精确写集`/边界、依赖/交接、质量责任",
      "`directories`/`spec`/`shared`/`layout`",
      "`module`/`contract`/`testSurface`/`parallel`/`dependsOn`/`granularity`",
      "gap 报告应用退回 Crew 修正",
      "计划缺能力/目录/规范细节时由你以新计划版本补充",
      "readiness 不是验收标准、不是客户确认",
      "pass 后才按 flow 步骤派发项目角色",
    ],
    "Steward readiness 纪律",
  );
});

test("标准工作流：Steward / 统筹——写团队计划→发 appointment 卡→readiness→派发项目角色→收齐回交→登记完成→组变更包；独立验收覆盖所有变更（含非发布）", () => {
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
      "内置治理角色的状态 / 回交向 Lead / 主理 汇总",
      "返工由 Lead / 主理 协调",
      // 2026-10-24 客户修订（撤销 release-only）：独立验收（所有变更）；2026-10-26 基础设施先行插入新第 4 步，顺延为第 9 步。
      "9. 独立验收（所有变更）",
      "所有变更（含非发布）在流程 / 证据 / change-package 齐备后，由应用按验收门自动派 Proof / 验收",
      "`release` 只是可选发布元数据，不是独立验收的启动条件，也不代替验收 / 客户决定",
      "`cardKind=schedule-write`",
      "flow 顶层 `release`",
      "缺省 / `false` 改为 `true`",
      "其余步骤与字段逐字不变",
      "其他字段或步骤变化仍按原校验拒绝",
      "release 标记不是客户对验收的批准，也不改变独立验收范围（非发布同样走验收）",
      "Steward 不派发治理角色、不代替验收、不催办",
      "只向已任命、已写卡且 readiness pass 的项目角色发起 `dispatch_task`",
      "不把「已派发」写成「已完成」",
      // 2026-10-24 P1-7：登记完成里写明 delivered 只能由 owner 标、manager 只核 done、worker 不能 done。
      "`dispatched → delivered` 只能由该步骤的 owner（项目角色 / worker）标记，你不得代标 `delivered`",
      "只能在 owner 交付 `delivered` 后核证并标 `done`（`delivered → done`）",
      "或标 `failed` / `blocked`",
      "worker 不能标 `done`",
    ],
    "Steward 标准工作流",
  );
  // 2026-10-24 客户修订：所有变更（含非发布）流程齐备后应用派 Proof；旧发布独占口径必须消失。
  assert.match(
    t,
    /所有变更（含非发布）[^。]*由应用按验收门自动派 Proof \/ 验收/,
    "所有变更（含非发布）流程齐备后应用派 Proof",
  );
  assert.doesNotMatch(t, /非发布不派/, "Steward 不得再写非发布不派");
  assert.doesNotMatch(t, /只有发布版本才由应用派/, "Steward 不得再写只有发布版本才派 Proof");
  assert.doesNotMatch(t, /停在等待发布验收/, "Steward 不得再写停在等待发布验收");
  assert.doesNotMatch(t, /发布验收门/, "Steward 不得再保留发布验收门旧口径");
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
      "修正流程状态 YAML（初始创建）等内容",
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

test("边界变更请求：Crew 核对 roleId/精确增删路径/理由/flowId，只增删列出路径，按 appointment-write 确认，declined 修正重发，报告并留证", () => {
  // 2026-10-26 真机缺口：治理门禁禁止治理角色之间 dispatch，统筹发现项目角色写集/边界不足时无法让
  // Crew 改边界（castle `tsconfig.node.json` 卡住）。运行时核心新增统筹专用 request_boundary_change，
  // 由应用把任务派给 Crew；本卡文本固定 Crew 侧的核对、精确路径、appointment-write 与回执纪律。
  const crew = cardTextOf("nominator");
  assertIncludesAll(
    crew,
    [
      "## 边界变更请求（来自应用/统筹经应用）",
      "由 Steward / 统筹 提出边界变更请求",
      "应用把任务派给你",
      "**不自行发起边界变更**",
      "本工作流只调整任务指定那一个 `roleId` 的 `角色卡/<roleId>/boundary.yaml` 边界条目",
      // 先核对：角色、精确路径、理由、flowId 四要素。
      "收到任务后逐项核对 `roleId`、`addPaths` / `removePaths`、`rationale` 与 `flowId`",
      "必须是已任命 / 已存在的项目角色",
      "内置治理角色、未知角色或目录 id 不符时停止并报告 Steward / 统筹",
      "必须是**精确的项目相对路径**",
      "不得通配符、`..`、绝对路径或散文",
      // 只增删列出路径：不重写整个边界、不扩大其它路径、不动计划/规范/他人资料。
      "只对列出的路径做增删",
      "**不重写整个边界、不扩大其它路径**",
      "不顺手改目录规范、团队计划或其它角色资料",
      "增删后仍不得含治理关键路径 / 他人写集 / 禁写路径",
      // appointment-write 逐路径确认；declined 修正重发；写后应用校验。
      "`request_confirmation`（`cardKind=appointment-write`、`flowId` 必填）",
      "逐路径列出将写 / 删的 `角色卡/<roleId>/boundary.yaml` 与条目差异",
      "返回 `declined` 时按 `reason` 修正内容后**重新发确认卡**",
      "不得绕过确认、不得直接 `write_file`、不得把原因当客户已同意",
      "写后交应用边界 / 结构校验",
      // 完成后回执与留证；请求来自统筹不等于客户批准。
      "向 Steward / 统筹（并汇总 Lead / 主理）报告",
      "实际增删的精确路径、确认卡与校验结果",
      "变更记录与证据（diff / 校验输出）保留在 `docs/governance/nominator/`",
      "**请求来自统筹不等于客户批准**",
      "确认与校验完成前不得声称边界已变更、不得按新路径写入",
      // 显式禁止：来源是统筹也不跳过确认；不越出职责/能力/写集改内容。
      "不因请求来自统筹就跳过确认",
      "不修改角色职责 / 能力 / 写集之外的内容",
      "不借机改职责 / 能力描述",
      "请求要求改职责 / 能力时停止并报告 Steward / 统筹",
    ],
    "Crew 边界变更请求工作流",
  );

  // 既有 appointment-write 与写卡校验纪律逐字保留（新工作流不得弱化）。
  assertIncludesAll(
    crew,
    [
      "写任何项目角色卡 / 边界（治理敏感写入）都必须按 `appointment-write` 逐路径取得客户确认",
      "不得绕过确认或直接写盘",
      "不得绕过校验、不得直接 `write_file`",
    ],
    "Crew 既有 appointment-write 纪律保留",
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
      // 2026-10-24 P1-7：保留「可更新全部步骤」权限，同时钉死 delivered 例外。
      "**例外：`dispatched → delivered` 只能由该步骤的 owner（项目角色）标记",
      "你不得代标 `delivered`",
      "只能在 owner 交付 `delivered` 后核证 `delivered → done`",
      "worker 不能标 `done`",
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
      "向 Steward / 统筹 派协调任务",
      "项目 worker 由 Steward / 统筹 派，你不直接派项目角色",
      "不直接派 Crew / Proof / 项目 worker",
      "闸门 0 已结算",
      "闸门 1 已结算",
      "协调 ≠ 客户批准",
      "只收 Proof 的状态与报告指针",
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
      "并用 flow 工具记录",
      "不得把内部选择包装成客户决定或另发 `request_choice`",
    ],
    "Lead 工作流管理",
  );
  // 旧「可向项目角色派发协调任务」口径必须消失（Q1：项目 worker 由 Steward 派）。
  assert.doesNotMatch(lead, /向 Steward \/ 统筹 与项目角色派发协调任务/);
  assert.doesNotMatch(lead, /派给 Steward \/ 项目角色/);
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
      // 2026-10-24 客户修订：独立验收覆盖所有变更（含非发布），release 仅为可选元数据。
      "所有变更（含非发布）流程齐备后应用按验收门派发验收",
      "`release` 只是可选发布元数据，不改变验收范围",
    ],
    "Proof 标准工作流",
  );
  // 2026-10-24 客户修订：旧发布独占派发口径不得残留。
  assert.doesNotMatch(t, /非发布不派/, "Proof 卡不得再写非发布不派");
  assert.doesNotMatch(t, /发布版本流程齐备后应用按发布验收门派发验收/, "Proof 卡不得再写发布独占派发");
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

test("标准工作流：2026-10-25 写入预授权——五卡边界内直接写、不逐次确认；request_confirmation 仅限治理敏感与客户决定", () => {
  // 客户新规则原文：「写自己角色权限内的路径，直接放行。」本批只改卡文本：Section 1 边界内的
  // 写入是预授权（write_file / edit_file 直接写），request_confirmation 只保留给治理敏感写入
  // （角色卡/边界、共享目录或他人写集、流程 YAML/账本、发布/变更包等按既有规则）与客户决定。
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const t = spec.cardText;
    // 单一来源常量逐字复用，且不得被逐卡改写分叉。
    assert.ok(t.includes(BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE), `${spec.id} 卡须逐字包含写入预授权总则`);
    assert.equal(
      t.split(BOUNDARY_WRITE_PREAUTHORIZATION_PRINCIPLE).length - 1,
      1,
      `${spec.id} 写入预授权总则须恰出现一次`,
    );
    assert.ok(t.includes(SHELL_APPROVAL_CARD_LINE), `${spec.id} 卡须逐字保留 shell 审批档`);
    // 旧的「写文件一律经写盘确认」口径必须消失。
    assert.doesNotMatch(t, /写文件仍优先用 write_file 并经写盘确认/, `${spec.id} 不得残留逐次写盘确认旧口径`);
    assert.doesNotMatch(t, /写盘（write_file \/ edit_file 等）一律先经/, `${spec.id} 不得保留一律先确认旧口径`);
  }
  // 治理敏感确认场景逐卡保留（未把预授权扩到治理写入）：
  assert.match(
    governanceRoleOf("nominator")!.cardText,
    /角色卡 \/ 边界属治理敏感写入，按既有规则仍逐路径确认/,
    "Crew 写角色卡 / 边界仍须 appointment-write 确认",
  );
  assert.match(
    governanceRoleOf("nominator")!.cardText,
    /不得绕过确认或直接写盘/,
    "Crew declined 后仍不得绕过确认",
  );
  assert.match(
    governanceRoleOf("convener")!.cardText,
    /流程 YAML \*\*初始创建\*\*仍按 `schedule-write` 确认/,
    "Steward 流程 YAML 初始创建仍 schedule-write",
  );
  assert.match(
    governanceRoleOf("liaison")!.cardText,
    /不使用 `request_confirmation` 做治理写盘/,
    "Lead 仍不做治理写盘确认",
  );
  assert.match(
    governanceRoleOf("rapporteur")!.cardText,
    /每次 `request_confirmation` 必须带 `flowId` \+ `cardKind`（只用 `write`）/,
    "Draft 确认卡参数纪律保留",
  );
  assert.match(
    governanceRoleOf("verifier")!.cardText,
    /每次 `request_confirmation` 必须带 `flowId` \+ `cardKind`（只用 `write`）/,
    "Proof 确认卡参数纪律保留",
  );
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

// —————————————————————— 2026-10-22 角色粒度（bounded context）与 MapReduce（P1/P4/P5/P6/P7/P13） ——————————————————————

test("标准工作流：团队计划 v3（P1/P2/P3/P4/P5）——Convener 卡要求 schema/directories/实现目录/目录规范/授权目录/精确写集/唯一 owner/不重叠/共享/依赖/粒度", () => {
  const t = cardTextOf("convener");
  assertIncludesAll(
    t,
    [
      "## 团队判断与团队计划（v3，必须）",
      "`teamPlanSchema: 3`",
      "`modules: [<module-a>, <module-b>]`",
      "`directories: [<dir-a>/, <dir-b>/]`",
      "`module` / 职责 / 公开契约 / 架构来源 / 实现目录五列",
      "恰好覆盖 `modules` 集合",
      "**每个 module 必须有非空 `实现目录`（Q9 A）**",
      "不得写 `—`/空",
      "角色 implementation/tests/docs 目录必须在该模块 `实现目录` 内或模块目录本身",
      "roleId | 类型 | module | 职责目标 | 能力要求 | 授权目录 | 精确写集 | 公开契约 | 测试面 | 依赖 | dependsOn | 并行组 | 组别 | apiSpec | 粒度理由",
      "`唯一写集` 仅作 v3 兼容别名",
      "`边界` 列名在 v3 不再接受",
      "目录 | owner | 类型 | 用途 | 命名 | 允许子目录 | 允许文件类型 | 公开契约 | 测试面 | 依赖 | 禁写区 | 共享",
      "恰好覆盖 `directories`",
      "每个目录恰好一个 owner",
      "不同角色的目录不得相同、不得互为祖先/子目录",
      "`shared: split` 的父目录除外",
      "`精确写集` 文件不得落在他人目录内",
      "`shared: none` 不得被其他角色引用",
      "不允许两个角色共写同一目录",
      "治理关键路径不得作为普通 `授权目录`",
      "`src/model/` 不整体目录授权",
      "一个模块一个 Map 角色、一个角色一个模块",
      "每个模块必须恰好被一个 Map 角色覆盖",
      "无重复/孤儿/未声明模块",
      "Reduce 角色写 `module: reduce`",
      "分号分隔的目录条目",
      "分号分隔的精确文件路径",
      "不得含通配符/省略号/散文/`..`/绝对路径",
      "跨角色两两不相交",
      "目标必须存在、无自依赖/重复/环",
      "同一 `map-*` 组内角色之间不得有依赖路径",
      "Map 角色不得依赖 Reduce",
      "每个 Reduce 角色的 dependsOn 必须直接或传递覆盖全部 Map 角色",
      "整层名（frontend/backend/web/server/client/ui/fullstack/all/common/shared/utils 等）",
      "`exception-review`",
      "单文件目录/极小模块只记 warning",
      "禁止函数级/单文件/按钮/端点级纳米角色",
      "不得把「字段齐全」当成「粒度正确」",
      "五维判断与协调成本",
      "缺任一项视为计划不完整，不得发 appointment 卡",
      "目录规范/计划只能由你以新计划版本写",
      "不原地改已确认版本",
      "角色或范围发生实质变化时必须重开闸门 2",
    ],
    "Convener 团队计划 v3",
  );
  // 不得把结构字段齐全当成语义完成。
  assert.doesNotMatch(t, /字段齐全[^。]{0,20}(即|就)(代表|说明|等于)粒度正确/);
  assert.doesNotMatch(t, /结构校验通过[^。]{0,10}(即|就)(代表|说明)粒度正确/);
});

test("标准工作流：readiness v3（P5/P11）——逐角色/逐目录 directories/spec/shared/layout 与 v2 列、pass/gaps；例外须明确批准", () => {
  const t = cardTextOf("convener");
  assertIncludesAll(
    t,
    [
      "逐角色对照团队计划核对职责目标、能力要求、`授权目录`/`精确写集`/边界、依赖/交接、质量责任",
      "**逐角色/逐目录**记录 `directories`/`spec`/`shared`/`layout`",
      "同时保留 v2 的 `module`/`contract`/`testSurface`/`parallel`/`dependsOn`/`granularity`",
      "`exception-review` 例外必须明确批准或退回",
      "`docs/scheduling/<flowId>-readiness-v1.md`",
      "`status: pass|gaps`",
      "每项 pass/gap + 证据",
      "目录是否内聚、规范是否合理、共享是否必要、契约与测试面是否真实",
      "`new` 一致、`changed`/`existing` 计划 ⊆ 边界",
      "gap 报告应用退回 Crew 修正",
      "计划缺能力/目录/规范细节时由你以新计划版本补充",
      "readiness 不是验收标准、不是客户确认",
      "结构校验通过不等于粒度/规范正确",
      "语义必须由 readiness 对照客户确认的架构逐项判断",
    ],
    "readiness v3",
  );
});

test("标准工作流：MapReduce flow 模板（P6）——delivery-<module>/parallelGroup/dependsOn/contract-freeze/Reduce 前置；旧 flow 不变", () => {
  const t = cardTextOf("convener");
  assertIncludesAll(
    t,
    [
      "`delivery-<module>`",
      "parallelGroup",
      "dependsOn",
      "contract-freeze",
      "Reduce 步骤依赖全部 Map 交付",
      "旧 flow 不填这两个字段，解析/派发行为逐字不变",
      "未知字段仍拒绝",
      "`pending` / `dispatched` / `delivered` / `done` / `superseded` / `failed` / `blocked`",
      "同一 `map-*` 组内步骤之间不得有依赖路径",
      "每个 Reduce 步骤（`dispatch`/`artifact`，验收除外）必须有到所有 `map-*` dispatch 步骤的依赖路径",
      "Map 步骤不得依赖 Reduce 步骤",
      "Map 交付步骤必须依赖 `contract-freeze`",
      "所有前置步骤必须 `status: done` 才允许 `dispatch_task`",
      "旧步骤无 `dependsOn` 不新增检查",
      "Reduce 前置未全部 `done` 必须硬拦",
      "不新增 `FlowStepKind`",
    ],
    "MapReduce flow 模板与门禁",
  );

  const match = /```yaml\n([\s\S]*?)```/.exec(t);
  assert.ok(match, "Convener 卡须含 ```yaml 模板块");
  const doc = parseYaml(match![1]) as { steps?: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(doc.steps), "模板须解析出 steps 数组");
  const byId = new Map(doc.steps!.map((step) => [String(step.id), step]));
  for (const id of ["contract-freeze", "build-scaffold", "delivery-checkout-api", "delivery-checkout-web", "test-map-shards", "integration-e2e", "verification-evidence"]) {
    assert.ok(byId.has(id), `模板须含步骤 ${id}`);
  }
  // 2026-10-26：build-scaffold 是独立的 dispatch 前置步骤（不新增 FlowStepKind）；V11 已放宽，
  // 交付 dependsOn = {contract-freeze} ∪ 依赖角色的 delivery-* + 可选 build-scaffold。
  assert.equal(byId.get("build-scaffold")?.kind, "dispatch", "脚手架步骤须用既有 dispatch kind");
  assert.equal(byId.get("build-scaffold")?.owner, "<工程角色 id>", "脚手架步骤须指定工程角色 owner");
  assert.deepEqual(byId.get("build-scaffold")?.dependsOn, ["contract-freeze"], "脚手架在契约冻结后、实现交付前");
  assert.equal(byId.get("build-scaffold")?.parallelGroup, undefined, "脚手架不属于 Map/Reduce 组");
  assert.equal(byId.get("delivery-checkout-api")?.parallelGroup, "map-a", "Map 交付步骤须标 map 组");
  assert.equal(byId.get("delivery-checkout-web")?.parallelGroup, "map-a", "同组 Map 步骤须标同一 map 组");
  assert.deepEqual(
    byId.get("delivery-checkout-api")?.dependsOn,
    ["contract-freeze", "build-scaffold"],
    "Map 交付须依赖 contract-freeze 与 build-scaffold",
  );
  assert.deepEqual(
    byId.get("delivery-checkout-web")?.dependsOn,
    ["contract-freeze", "build-scaffold"],
    "Map 交付须依赖 contract-freeze 与 build-scaffold",
  );
  for (const id of ["test-map-shards", "integration-e2e", "verification-evidence"]) {
    assert.equal(byId.get(id)?.parallelGroup, "reduce", `${id} 须标 reduce 组`);
  }
  assert.deepEqual(byId.get("test-map-shards")?.dependsOn, [
    "delivery-checkout-api",
    "delivery-checkout-web",
  ], "Reduce 步骤须直接依赖全部 Map 交付");
  assert.deepEqual(byId.get("integration-e2e")?.dependsOn, ["test-map-shards"]);
  assert.deepEqual(byId.get("verification-evidence")?.dependsOn, ["integration-e2e"]);
  assert.equal(byId.get("contract-freeze")?.status, "done", "contract-freeze 是 Map 入口条件");
});

// —————————————————————— 2026-10-26 基础设施先行：build-scaffold 前置与构建配置唯一 owner ——————————————————————

test("2026-10-26 基础设施先行（真机教训）：Steward 团队计划必须含独立 build-scaffold 前置步骤与唯一构建配置 owner；专职基础设施角色按复杂度决定、不默认新增", () => {
  // 真机教训 castle-2d-game-v1：脚手架被挂在「应用外壳」角色的交付步骤里，所有实现角色在没有
  // package.json/tsconfig/vite/vitest/playwright/入口骨架时盲写，无法 typecheck/跑测试。wukong-2d 的
  // 独立 build-scaffold 前置步骤是正确先例；客户 2026-10-26 追加意见「先安排基础设施构建」并要求
  // 固定「步骤 + 唯一 owner」而不是新增固定角色。
  const c = cardTextOf("convener");
  assertIncludesAll(
    c,
    [
      "`build-scaffold` 前置步骤（任何包含代码/测试交付的团队计划必须",
      "owner 为工程/外壳角色或计划指定的工程角色",
      "不得把脚手架留给各实现角色顺手搭",
      "不得塞进外壳角色的普通交付步骤或计划末尾",
      "包配置（`package.json` 及依赖/脚本）",
      "TypeScript / 构建 / 测试配置",
      "`tsconfig.json`、`vite.config.ts`、`vitest.config.ts` / `playwright.config.ts`",
      "入口骨架（如 `index.html` + 最小 `main.ts`）",
      "`npm run typecheck` 与最小测试（≥1 条，非占位）可跑",
      "其余交付步骤依赖它",
      "`build-scaffold` 未 `done` 不派任何 `delivery-*` 实现步骤",
      "内容/数值等纯数据可并行，但实现代码必须等脚手架",
      "`delivery-*` 的 `dependsOn` 至少包含 `{contract-freeze} ∪ 依赖角色的 delivery-*`，并应显式加入 `build-scaffold`（V11 已允许；`build-scaffold` 自身 `dependsOn: [contract-freeze]`）",
      "计划缺该步骤、把脚手架放到后面或塞进外壳角色（而范围含代码/测试交付）视为计划不完整，不得发 appointment 卡",
      // 构建配置唯一 owner（客户 2026-10-26 追加）。
      "**构建配置唯一 owner（必须）**",
      "唯一的「构建配置 owner」",
      "app-shell / engine-core 这类工程角色",
      "`package.json`、`package-lock.json`、`tsconfig*.json`、vite/vitest/playwright 配置、`index.html`、`src/main.ts` 骨架与构建/CI 相关根文件",
      "其他角色对这些文件只读，需要变更时提交给该 owner，不得各自修改",
      "**是否额外任命专职基础设施角色按五维判断/复杂度决定，不默认新增**",
      "monorepo/多应用、需要 CI/打包/发布流水线或构建复杂度高时才任命",
      "小项目不强行新增角色（避免角色膨胀）",
      "即便任命，构建配置唯一 owner 规则不变",
      // 质量职责同步。
      "你的质量职责（Steward / 统筹）",
      "团队计划必须为 `build-scaffold` 显式指定唯一的「构建配置 owner」",
    ],
    "Steward build-scaffold 前置与构建配置 owner",
  );

  // 标准工作流新增「基础设施先行」步骤，顺序可执行：校验 → 退回 → 先派基础设施 → 未 done 不派实现 → 核证。
  assertIncludesAll(
    c,
    [
      "4. 基础设施先行（必须，客户 2026-10-26 追加意见「先安排基础设施构建」）",
      "派发前先读计划/流程校验",
      "`build-scaffold` 必须存在、位于所有实现交付之前并作为实现交付的显式前置依赖",
      "计划没有或把脚手架放到后面 ⇒ 退回补充/修订团队计划",
      "不派实现",
      "基础设施（`build-scaffold`、`contract-freeze`、共享契约/端口、测试骨架）先于功能实现",
      "`build-scaffold` 未 `done` 不派任何 `delivery-*` 实现步骤",
      "内容/数值等纯数据可并行，但实现代码必须等脚手架",
      "`dispatch_task` 任务文本必须写明验证命令（`npm run typecheck`、最小测试）",
      "「脚手架未就绪不得写入代码」",
      "「构建配置由 <构建配置 owner> 独占，不得修改」",
      "基础设施步骤回交后先核证（真实安装/编译/跑最小测试）",
      "不得把「文件写了」当 `done`",
      "核证通过后才派实现",
      "`delivery-*` 的 `dependsOn` 至少包含 `{contract-freeze} ∪ 依赖角色的 delivery-*`，并显式加入 `build-scaffold`",
    ],
    "Steward 基础设施先行工作流",
  );

  // 流程 YAML 模板：build-scaffold 是独立 dispatch 步骤（不新增 FlowStepKind）；交付 dependsOn
  // 显式含 build-scaffold（V11 已允许），build-scaffold 自身仍只依赖 contract-freeze。
  const match = /```yaml\n([\s\S]*?)```/.exec(c);
  assert.ok(match, "Convener 卡须含 ```yaml 模板块");
  const doc = parseYaml(match![1]) as { steps?: Array<Record<string, unknown>> };
  assert.ok(Array.isArray(doc.steps), "模板须解析出 steps 数组");
  const byId = new Map(doc.steps!.map((step) => [String(step.id), step]));
  const scaffold = byId.get("build-scaffold");
  assert.ok(scaffold, "模板须含 build-scaffold 步骤");
  assert.equal(scaffold!.kind, "dispatch", "build-scaffold 用既有 dispatch kind（不新增 FlowStepKind）");
  assert.equal(scaffold!.owner, "<工程角色 id>", "build-scaffold 须指定工程角色 owner");
  assert.equal(scaffold!.status, "pending", "模板中脚手架是待派发的前置步骤");
  assert.deepEqual(scaffold!.dependsOn, ["contract-freeze"], "build-scaffold 在 contract-freeze 之后、实现交付之前");
  for (const id of ["delivery-checkout-api", "delivery-checkout-web"]) {
    assert.deepEqual(
      byId.get(id)?.dependsOn,
      ["contract-freeze", "build-scaffold"],
      `${id} 的 dependsOn 须显式包含 build-scaffold（V11 已允许额外依赖）`,
    );
  }

  // Crew / 组队 同口径：计划缺脚手架/唯一 owner 时停止写卡报告，不自行补计划；写卡不得拆分构建配置。
  const n = cardTextOf("nominator");
  assertIncludesAll(
    n,
    [
      "计划含代码/测试交付却没有独立的 `build-scaffold` 前置步骤",
      "未显式指定唯一的「构建配置 owner」",
      "同样**停止写卡并报告 Steward / 统筹 补充**，不自行补计划",
      "团队计划必须让独立的 `build-scaffold` 步骤在前、依赖显式、其余交付依赖它",
      "团队计划必须显式指定唯一的「构建配置 owner」",
      "`package.json`、`package-lock.json`、`tsconfig*.json`、vite/vitest/playwright 配置、`index.html`、`src/main.ts` 骨架与构建/CI 根文件由该 owner 独占",
      "写卡时不得把这些构建配置拆给多个角色",
      // 多步骤角色的逐步骤交付检查点（客户 2026-10-26 追加：顺序之外还要有独立交付检查点）。
      "**逐步骤交付检查点（必须，多步骤角色）**",
      "每个步骤完成即按该步骤证据验证并标 `delivered`、回交/通知 Steward / 统筹，不得攒到最后一次回交",
      "标准工作流第一步就是交付脚手架（可运行、`npm run typecheck` 与最小测试通过）并**立即回交**",
      "外壳/工程类角色模板（app-shell 等）",
      "脚手架是独立的 `build-scaffold` 交付检查点，不得并进 `delivery-app-shell` 等普通交付步骤",
      "脚手架交付必须附真实验证证据",
      "`npm install`、`npm run typecheck`、最小测试输出",
      "「文件写了」不算 `done`，不得等整个外壳做完才回交",
      "多步骤角色的角色卡必须定义**逐步骤交付检查点**",
      "外壳/工程类角色不得把脚手架并进 `delivery-app-shell` 等普通交付",
      "交付步骤的 `dependsOn` 至少包含 `contract-freeze` + 依赖角色的 `delivery-*`，并可显式加入 `build-scaffold`（V11 已允许；`build-scaffold` 自身 `dependsOn: [contract-freeze]`）",
    ],
    "Crew build-scaffold 同口径",
  );

  // 权限/边界/能力位零变化：本批只改卡文本，不新增固定基础设施角色或能力。
  const steward = governanceRoleOf("convener")!;
  assert.deepEqual(steward.entries.map((entry) => entry.path), [
    "docs/flows/",
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(steward.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.equal(steward.capabilities.dispatchTask, true);
  assert.equal(steward.capabilities.shell, "operator-approve");
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((spec) => spec.id),
    ["liaison", "rapporteur", "nominator", "convener", "verifier"],
    "不得新增固定基础设施角色",
  );
});

test("标准工作流：Crew v3（P10/P13）——读授权目录/精确写集/目录规范/实现目录；角色卡写目录与契约/测试面/上下游/粒度；boundary 按计划逐条落盘", () => {
  const t = cardTextOf("nominator");
  assertIncludesAll(
    t,
    [
      "读目录规范与每个 module 的 `实现目录`",
      "并按 v2 读 `module` / 公开契约 / 测试面 / `dependsOn` / 并行组 / `粒度理由`",
      "`唯一写集` 仅作兼容别名，按 `精确写集` 处理",
      "`边界` 列名在 v3 不再接受",
      "bounded context（module）",
      "公开契约",
      "测试面",
      "**上下游依赖**（`dependsOn` 与交接输入输出）",
      "粒度理由",
      "`授权目录` 落目录条目（directory）、`精确写集` 落精确文件条目（file），不多不少",
      "`new` 角色边界目录与计划 `授权目录` 一致（角色根工作文档除外，不得更宽）",
      "不得改目录规范、不得跨目录、不得把他人目录并进自己边界",
      "v3 目录落卡纪律（必须）",
      "一个角色 = 一个 bounded context/模块",
      "不得写整层角色",
      "纳米角色",
      "计划缺 module/公开契约/测试面/`dependsOn`/粒度理由/`授权目录`/`精确写集`/目录规范/`实现目录`",
      "只报告 Steward / 统筹",
      "不自行补计划",
      "不自行增删目录/模块/角色/写集",
    ],
    "Crew v3 写卡",
  );
  // 上轮边界保持：Crew 不选角色、不发 appointment、不写 nominations。
  assertIncludesAll(
    t,
    ["不再选择角色、不再组建团队、不再写 `docs/nominations/**`、不再发 appointment 卡"],
    "Crew 既有边界",
  );
});

test("标准工作流：Verifier v2（P7/P8/P13 可选补充）——核对模块覆盖/manifest/分片原始日志；不改真实启动/演示基线", () => {
  const t = cardTextOf("verifier");
  assertIncludesAll(
    t,
    [
      "团队计划 v2 的模块覆盖/并行组/`dependsOn`",
      "Reduce manifest 与每个 Map 分片的原始日志",
      "命令、环境、候选哈希、退出码、pass/fail/skip、失败原文",
      "manifest 是索引，不是原始证据",
      "缺失/无法对应候选时判 insufficient evidence",
      "manifest 不能替代分片原始日志",
      "该补充不改变真实启动/演示基线",
    ],
    "Verifier v2 补充",
  );
  // 真实启动/演示基线逐字保留，未演示仍不得建议 accept。
  assert.match(t, /验收前必须真实启动应用并演示/, "Verifier 卡须保留真实启动/演示硬要求");
  assert.match(t, /没有真实启动\/演示证据/, "Verifier 无证据仍不得建议 accept");
  assert.match(t, /未真实运行、未演示时不得建议 accept/, "Verifier 未演示不得建议 accept");
});

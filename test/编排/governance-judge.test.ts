// test/编排/governance-judge.test.ts
// 治理卡判断 agent（「替我审批」/「替我决策」）P2 离线单测：
// **注入假 createAdapter，绝不调用真实模型/凭据/网络**。
//
// 覆盖（PM 评审 `2026-10-18_design_judge-governance-cards-review.md` §7/§13 的编排侧）：
//   · 六卡种代批正反例（proposal / appointment / acceptance / write / appointment-write / schedule-write）；
//   · required-read 缺失 → manual/artifact-not-read；物证缺失 → manual/artifact-missing；
//   · 逐路径机械复核（pathProbes、allowedPathRoots、forbiddenPaths、pathDecisions 覆盖）；
//   · accept-quick 不代批；负向选择一律 manual；任命必须恰等于推荐集；
//   · 支持矩阵/超时/busy；合成角色空边界 + deny-all 写门禁；
//   · run-role judgeContext（trio 注入、single/su/项目角色不注入）与账本 `decisionEvidence.kind:"judge"`；
//   · request_confirmation/request_choice 的 judge 代批回执；
//   · 事实构造有界、推荐集解析、shell judge 不回归（既有测试单独跑）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProjectConfig, ResolvedRole } from "../../src/model/role.ts";
import type {
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
  DiagnosticLog,
  GovernanceJudgeAudit,
  GovernanceJudgeFacts,
  GovernanceJudgeRequest,
  RuntimeKind,
  WriteGate,
} from "../../src/model/runtime.ts";
import { governanceCardGroup } from "../../src/model/runtime.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { governanceDispatchActionFor } from "../../src/pipeline/orchestration/run-role.ts";
import {
  createGovernanceJudge,
  DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS,
  formatGovernanceJudgeTimeout,
  governanceJudgeAuditOf,
  GOVERNANCE_JUDGE_ROLE_ID,
  GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES,
  GOVERNANCE_JUDGE_TIMEOUT_ENV,
  resolveGovernanceJudgeTimeoutMs,
} from "../../src/common/编排/governance-judge.ts";
import { DEFAULT_SHELL_JUDGE_TIMEOUT_MS } from "../../src/common/编排/shell-judge.ts";
import {
  buildGovernanceJudgeFacts,
  declaredWritePathsFromPreview,
  evaluateAcceptanceCompletion,
  normalizeFlowStepStatus,
  parseFlowSteps,
  parseRecommendedRoleIds,
  requiredArtifactPaths,
} from "../../src/common/编排/governance-judge-facts.ts";
import {
  buildGovernanceJudgeSystemPrompt,
} from "../../src/common/编排/governance-judge-prompt.ts";
import {
  boundedGovernanceJudgeAudit,
  evaluateGovernanceJudgeVerdict,
  governanceJudgeAuditFromOutcome,
  normalizeGovernanceJudgeVerdict,
} from "../../src/common/编排/governance-judge-verdict.ts";
import { flushGovernanceLedger, readGovernanceLedger } from "../../src/common/编排/governance-ledger.ts";
import { createConfirmedWriteIssuer, explicitConfirmPaths } from "../../src/common/编排/confirmed-writes.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { allow } from "../runtime-core/fixtures.ts";

// —————————————————————— 夹具 ——————————————————————

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-governance-judge-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

function writeFile(root: string, rel: string, content = "内容\n"): void {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

// 2026-10-19 客户定位修正：decision 组只判意图漂移，判断前必须有客户已确认的意图文件。
const INTENT_REL = "docs/intents/intent-a.md";

function seedIntent(root: string, over: {
  intentId?: string;
  flowId?: string;
  goal?: string;
  scope?: string;
  acceptance?: string;
  nonGoals?: string;
  customerWords?: string;
} = {}): string {
  const intentId = over.intentId ?? "intent-a";
  const rel = `docs/intents/${intentId}.md`;
  writeFile(
    root,
    rel,
    [
      "---",
      `intentId: ${intentId}`,
      "handoffKind: initial",
      `goal: ${over.goal ?? "实现示例能力"}`,
      `scope: ${over.scope ?? "仅示例范围"}`,
      `acceptance: ${over.acceptance ?? "示例验收项通过"}`,
      `nonGoals: ${over.nonGoals ?? "不做架构重写"}`,
      `customerWords: ${over.customerWords ?? "客户说：做一个示例能力，不要越界。"}`,
      `flowId: ${over.flowId ?? "flow-a"}`,
      "---",
      "",
      `# 意图 ${intentId}`,
      "",
      "客户原话摘录：「做一个示例能力，不要越界。」",
      "",
    ].join("\n"),
  );
  return rel;
}

/** 意图确认账本（intent-confirm accepted + intent.handed-off）；decision 卡判断的前置事实。 */
function seedIntentLedger(root: string, input: { flowId?: string; intentId?: string; decision?: "accepted" | "changes-requested" } = {}): void {
  const flowId = input.flowId ?? "flow-a";
  const intentId = input.intentId ?? "intent-a";
  writeFile(root, ".ans/governance/ledger.jsonl", [JSON.stringify({
    at: "2026-10-19T00:00:00.000Z",
    kind: "customer.decision",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    decisionKind: "intent-confirm",
    customerDecision: input.decision ?? "accepted",
    decisionEvidence: { kind: "customer-input" },
  }), JSON.stringify({
    at: "2026-10-19T00:00:01.000Z",
    kind: "intent.handed-off",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    intentId,
    handoffKind: "initial",
  })].join("\n") + "\n");
}

// 2026-10-19 定位修正：decision 组只判意图漂移；提案摘要只取目标/范围/验收等与意图相关的章节。
// 这里刻意**不含架构章节**——架构由 Draft 产出、Proof 核对，不是判断 agent 的代批门槛。
const PROPOSAL_MARKDOWN = [
  "# 提案 flow-a v1",
  "",
  "## 目标",
  "实现示例能力。",
  "",
  "## 范围",
  "仅示例范围。",
  "",
  "## 验收标准",
  "- 示例验收项。",
  "",
].join("\n");

function seedProposal(root: string, rel = "docs/proposals/flow-a-v1.md"): void {
  writeFile(root, rel, PROPOSAL_MARKDOWN);
}

function seedNomination(root: string, recommended: readonly string[], rel = "docs/nominations/flow-a-v1.md"): void {
  writeFile(
    root,
    rel,
    [
      "# 提名 flow-a",
      "",
      `推荐：${recommended.join("、")}`,
      "",
      "## 候选角色",
      "",
      "| 角色 | 理由 |",
      "| --- | --- |",
      ...recommended.map((id) => `| ${id} | 候选 |`),
      "",
    ].join("\n"),
  );
}

// 2026-10-22 第 1 项：团队计划（docs/scheduling/<flowId>-team-vN.md）替代提名文件。
const TEAM_PLAN_COLUMNS = "| roleId | 类型 | 职责目标 | 能力要求 | 唯一写集 | 依赖 | 组别 | apiSpec |";
const TEAM_PLAN_DIVIDER = "| --- | --- | --- | --- | --- | --- | --- | --- |";

function teamPlanMarkdown(
  flowId: string,
  recommended: readonly string[],
  over: { recommendedLine?: string; header?: string; divider?: string; rows?: readonly string[] } = {},
): string {
  const rows = over.rows ?? recommended.map(
    (id) => `| ${id} | existing | 实现 ${id} 的职责 | 具备 ${id} 的能力 | src/${id}/ | 无 | 组 A | not-applicable（无导出） |`,
  );
  return [
    "---",
    `flowId: ${flowId}`,
    "version: 1",
    "status: draft",
    "riskTier: T3",
    over.recommendedLine ?? `recommended: [${recommended.join(", ")}]`,
    "---",
    "",
    `# 团队计划：${flowId}`,
    "",
    "## 2. 参与角色与职责",
    "",
    over.header ?? TEAM_PLAN_COLUMNS,
    over.divider ?? TEAM_PLAN_DIVIDER,
    ...rows,
    "",
    "## 7. 风险档位与理由",
    "T3（治理/权限变更）。",
    "",
  ].join("\n");
}

function seedTeamPlan(
  root: string,
  recommended: readonly string[],
  over: { flowId?: string; version?: number; recommendedLine?: string; header?: string; divider?: string; rows?: readonly string[] } = {},
): string {
  const flowId = over.flowId ?? "flow-a";
  const rel = `docs/scheduling/${flowId}-team-v${over.version ?? 1}.md`;
  writeFile(root, rel, teamPlanMarkdown(flowId, recommended, over));
  return rel;
}

/** 结构合格的实施前验收标准（第 3 项）。 */
function acceptanceCriteriaMarkdown(flowId: string): string {
  return [
    `# 验收完成标准：${flowId}`,
    "",
    "| ID | 标准 | 需要的证据 | 结果 |",
    "| --- | --- | --- | --- |",
    `| P1 | ${flowId} 示例标准 | 测试输出 | 待判定 |`,
    "",
    "风险档位：T3（治理/权限变更）。",
    "",
    "判定规则：pass / fail / insufficient evidence / not applicable。",
    "",
    "证据计划：单测原始输出与全量回归记录。",
    "",
    "版本冻结：v1 写盘后冻结。",
    "",
  ].join("\n");
}

const REPORT_FIVE_LABELS =
  "风险档位：T3｜判定依据：治理/权限变更｜选定检查：定向测试｜复用证据：无｜全量回归：已执行";

/** 第 3 项的三件套：验收标准、验收报告（首行五项）、变更包（frontmatter riskTier）。 */
function seedAcceptanceArtifacts(
  root: string,
  over: {
    flowId?: string;
    reportTier?: string;
    changeTier?: string;
    reportFirstLine?: string;
    criteriaFlowId?: string;
  } = {},
): void {
  const flowId = over.flowId ?? "flow-a";
  writeFile(root, `docs/acceptance/${flowId}-criteria-v1.md`, acceptanceCriteriaMarkdown(over.criteriaFlowId ?? flowId));
  const firstLine = over.reportFirstLine ??
    (over.reportTier !== undefined
      ? `风险档位：${over.reportTier}｜判定依据：治理/权限变更｜选定检查：定向测试｜复用证据：无｜全量回归：已执行`
      : REPORT_FIVE_LABELS);
  writeFile(root, `docs/acceptance/${flowId}-report-v1.md`, `${firstLine}\n\n## 结论\n通过。\n`);
  writeFile(
    root,
    `docs/scheduling/${flowId}-change-v1.md`,
    [
      "---",
      `flowId: ${flowId}`,
      "version: 1",
      `riskTier: ${over.changeTier ?? "T3"}`,
      "candidate: abc123",
      "changedPaths: [src/a.ts]",
      "evidence: [test/a.test.ts]",
      "---",
      "",
      "# 变更包",
      "",
      "## 档位依据",
      "治理/权限变更。",
      "",
    ].join("\n"),
  );
}

/** 验收卡所需的账本事实（客户确认意图 + 已接受提案 + dispatch.accepted），与 request.facts 对账一致。 */
function seedAcceptanceLedger(root: string, input: {
  flowId?: string;
  steps?: readonly string[];
  decisionKind?: string;
  customerDecision?: string;
  extraLines?: readonly string[];
} = {}): void {
  const flowId = input.flowId ?? "flow-a";
  const steps = input.steps ?? ["s1"];
  const lines: string[] = [];
  // 2026-10-19：decision 组只判意图漂移 ⇒ 判断前必须有客户确认的意图（intent-confirm accepted）。
  lines.push(JSON.stringify({
    at: "2026-10-19T00:00:00.000Z",
    kind: "customer.decision",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    decisionKind: "intent-confirm",
    customerDecision: "accepted",
    decisionEvidence: { kind: "customer-input" },
  }));
  lines.push(JSON.stringify({
    at: "2026-10-19T00:00:00.500Z",
    kind: "intent.handed-off",
    flowId,
    actorRoleId: "liaison",
    power: "liaison",
    intentId: "intent-a",
    handoffKind: "initial",
  }));
  if (input.decisionKind !== "none") {
    lines.push(JSON.stringify({
      at: "2026-10-19T00:00:01.000Z",
      kind: "customer.decision",
      flowId,
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: input.decisionKind ?? "proposal-accept",
      customerDecision: input.customerDecision ?? "accepted",
      decisionEvidence: { kind: "customer-input" },
    }));
  }
  for (const [index, stepId] of steps.entries()) {
    lines.push(JSON.stringify({
      at: `2026-10-19T00:00:0${index + 2}.000Z`,
      kind: "dispatch.accepted",
      flowId,
      stepId,
      actorRoleId: "app",
      power: "app",
      trigger: "settle",
    }));
  }
  for (const line of input.extraLines ?? []) lines.push(line);
  writeFile(root, ".ans/governance/ledger.jsonl", `${lines.join("\n")}\n`);
}

const PROJECT: ProjectConfig = { projectRoot: process.cwd(), skillRoot: process.cwd(), roles: {} };

function facts(over: Partial<GovernanceJudgeFacts> = {}): GovernanceJudgeFacts {
  return {
    governanceModel: "trio",
    flowId: "flow-a",
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
    ...over,
  };
}

const PROPOSAL_CARD: CustomerInputRequest = {
  kind: "choice",
  title: "是否接受提案 flow-a-v1？",
  options: [
    { id: "accept", label: "接受" },
    { id: "accept-quick", label: "快速接受" },
    { id: "revise", label: "要求修改" },
    { id: "reject", label: "拒绝" },
  ],
  cardKind: "proposal",
  flowId: "flow-a",
};

function request(over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return {
    group: "decision",
    cardKind: "proposal",
    roleId: "rapporteur",
    projectRoot: PROJECT.projectRoot,
    runtime: "claude",
    governanceModel: "trio",
    flowId: "flow-a",
    toolCallId: "call-1",
    card: PROPOSAL_CARD,
    facts: facts(),
    at: new Date().toISOString(),
    ...over,
  };
}

interface Seen {
  capabilities?: AdapterCapabilities;
  role?: ResolvedRole;
  gate?: WriteGate;
  prompts: string[];
  binds: number;
  disposed: number;
  release?: () => void;
}

interface FakeScript {
  /** 模型交回的原始参数；函数形式可先改读取统计。 */
  report?: unknown;
  settle?: boolean;
  message?: string;
  bindDelayMs?: number;
  silent?: boolean;
}

function fakeFactory(script: FakeScript = {}): { factory: RuntimeAdapterFactory; seen: Seen } {
  const seen: Seen = { prompts: [], binds: 0, disposed: 0 };
  const factory: RuntimeAdapterFactory = (gate, capabilities) => {
    seen.gate = gate;
    seen.capabilities = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(role) {
        seen.role = role;
        seen.binds += 1;
        if (script.bindDelayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, script.bindDelayMs));
        return {
          async prompt(text: string) {
            seen.prompts.push(text);
            if (script.silent === true) return;
            if (script.report !== undefined) {
              const raw = typeof script.report === "function" ? await script.report(seen) : script.report;
              capabilities?.governanceJudge?.report(raw);
            }
          },
          async *events() {
            if (script.message !== undefined) yield { kind: "message" as const, summary: script.message };
            if (script.settle === false) {
              await new Promise<void>((resolve) => { seen.release = resolve; });
              return;
            }
            yield { kind: "settled" as const, summary: "settled" };
          },
          async dispose() {
            seen.disposed += 1;
            seen.release?.();
          },
          async abort() {
            seen.release?.();
          },
        };
      },
    };
  };
  return { factory, seen };
}

function makeJudge(
  script: FakeScript,
  options: { runtime?: RuntimeKind; timeoutMs?: number; projectRoot?: string; logger?: DiagnosticLog } = {},
): { judge: ReturnType<typeof createGovernanceJudge>; seen: Seen } {
  const { factory, seen } = fakeFactory(script);
  const judge = createGovernanceJudge({
    project: { ...PROJECT, ...(options.projectRoot !== undefined ? { projectRoot: options.projectRoot } : {}) },
    runtime: options.runtime ?? "claude",
    createAdapter: factory,
    timeoutMs: options.timeoutMs ?? 300,
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });
  return { judge, seen };
}

/** 让脚本在交结论前登记「已读路径」。 */
function readThenReport(paths: string[], report: unknown): (seen: Seen) => unknown {
  return (seen) => {
    const stats = seen.capabilities?.governanceJudge?.stats;
    if (stats !== undefined) stats.readPaths = [...paths];
    return report;
  };
}

const APPROVE_PROPOSAL = {
  verdict: "approve",
  reason: "提案目标/范围/验收明确且与意图一致。",
  evidence: ["docs/proposals/flow-a-v1.md"],
  selected: ["accept"],
};

// —————————————————————— ① proposal ——————————————————————

test("proposal：意图已确认 + 证据齐全 + required-read 满足 → approve（selected=accept）", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    const req = request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    });
    const { judge, seen } = makeJudge({
      report: readThenReport([INTENT_REL, "docs/proposals/flow-a-v1.md"], APPROVE_PROPOSAL),
    });
    const out = await judge(req);
    assert.equal(out.verdict, "approve");
    assert.equal(out.group, "decision");
    assert.equal(out.cardKind, "proposal");
    assert.equal(out.reasonCode, "sufficient");
    assert.deepEqual(out.value, { selected: ["accept"] });
    assert.deepEqual(out.evidence, ["docs/proposals/flow-a-v1.md"]);
    assert.equal(seen.role?.id, GOVERNANCE_JUDGE_ROLE_ID);
    assert.deepEqual(seen.role?.boundary.entries, [], "合成判断角色边界为空");
    assert.ok(seen.capabilities?.governanceJudge, "注入治理 judge 只读能力");
    assert.equal(seen.capabilities?.shellJudge, undefined, "不得同时注入 shellJudge");
    assert.equal(seen.capabilities?.persistSession, false, "判断会话不持久化");
    const gate = seen.gate!;
    const denied = gate("/tmp/x");
    assert.equal(denied.allowed, false, "deny-all 写门禁");
    assert.match(seen.prompts[0]!, /docs\/proposals\/flow-a-v1\.md/, "提示词列出必读物证");
    assert.match(seen.prompts[0]!, /docs\/intents\/intent-a\.md/, "提示词列出意图文件");
    assert.match(seen.prompts[0]!, /客户已确认的意图摘要/, "提示词渲染意图摘要");
    assert.match(seen.role?.cardText ?? "", /accept-quick 不代批/);
    assert.equal(governanceJudgeAuditOf(out)?.group, "decision");
  });
});

test("decision rubric：只判意图漂移；架构/质量/测试覆盖/证据充分性明确排除", () => {
  const cardText = buildGovernanceJudgeSystemPrompt();
  assert.match(cardText, /决策审批也改一下，就是判断意图是否偏离了客户的出发点就行了/);
  assert.match(cardText, /【定位（客户 2026-10-19 修正）：decision 组只判意图漂移】/);
  assert.match(cardText, /docs\/intents\/<intentId>\.md/, "意图基准来自意图文件");
  assert.match(cardText, /goal\/scope\/acceptance\/非目标/, "意图要素齐全");
  assert.match(cardText, /intent-drift/);
  assert.match(cardText, /intent-missing/);
  assert.match(cardText, /intent-ambiguous/);
  assert.match(cardText, /intent-unconfirmed/);
  assert.match(cardText, /【不判断（明确排除）：由 Draft\/Proof 的工作流与验收负责】/);
  assert.match(cardText, /工程质量/);
  assert.match(cardText, /架构章节是否存在或合格/);
  assert.match(cardText, /测试覆盖/);
  assert.match(cardText, /证据是否充分/);
  assert.match(cardText, /提案缺少架构章节不是拒绝理由/, "架构不是决策代批门槛");
  assert.doesNotMatch(cardText, /架构门槛（客户 2026-10-19 新要求，不得跳过）/, "旧架构门槛已移除");
  assert.doesNotMatch(cardText, /提案卡还须通过「架构门槛」/, "旧通用门槛已移除");
});

test("proposal：与意图一致但缺架构章节 ⇒ 仍可 allow（架构由 Proof 查）", async () => {
  await withRoot(async (root) => {
    // 刻意不含任何架构章节：判断 agent 只核对意图漂移，不重复做架构审查。
    writeFile(
      root,
      "docs/proposals/flow-a-v1.md",
      "# 提案 flow-a v1\n\n## 目标\n实现示例能力。\n\n## 范围\n仅示例范围。\n\n## 验收标准\n- 示例验收项。\n",
    );
    seedIntent(root);
    seedIntentLedger(root);
    const { judge } = makeJudge({
      report: readThenReport([INTENT_REL, "docs/proposals/flow-a-v1.md"], APPROVE_PROPOSAL),
    });
    const out = await judge(request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    }));
    assert.equal(out.verdict, "approve");
    assert.equal(out.reasonCode, "sufficient");
    assert.deepEqual(out.value, { selected: ["accept"] });
  });
});

test("proposal：accept-quick 不代批；revise/reject 一律 manual（不代拒绝）", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    for (const selected of [["accept-quick"], ["revise"], ["reject"], []]) {
      const { judge } = makeJudge({
        report: { ...APPROVE_PROPOSAL, selected },
      });
      const out = await judge(request({
        projectRoot: root,
        artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
      }));
      assert.equal(out.verdict, "manual", `selected=${JSON.stringify(selected)} 不得代批`);
      assert.equal(out.reasonCode, "not-recommended");
    }
  });
});

test("proposal：required-read 缺失 → manual/artifact-not-read", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    const { judge } = makeJudge({ report: APPROVE_PROPOSAL });
    const out = await judge(request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    }));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "artifact-not-read");
  });
});

test("proposal：物证缺失 → manual/artifact-missing（即使模型 approve）", async () => {
  const { judge, seen } = makeJudge({ report: APPROVE_PROPOSAL });
  const out = await judge(request());
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "artifact-missing");
  assert.equal(seen.binds, 0, "物证缺失时不调用模型");
});

test("artifact-missing reason：proposal/appointment/acceptance 列出约定物证路径", async () => {
  // proposal：缺 docs/proposals/<flowId>-v1.md
  const proposal = await makeJudge({ report: APPROVE_PROPOSAL }).judge(request());
  assert.equal(proposal.reasonCode, "artifact-missing");
  assert.match(proposal.reason ?? "", /规范物证缺失：docs\/proposals\/flow-a-v1\.md（判断无法核对）；请按上述原因修正后重新提交。/);

  // appointment：无团队计划 ⇒ 明确点名 docs/scheduling/<flowId>-team-v1.md（不再指向提名）
  const appointmentReq = request({
    cardKind: "appointment",
    card: {
      kind: "choice",
      title: "任命角色",
      options: [{ id: "alpha", label: "Alpha" }],
      cardKind: "appointment",
      flowId: "flow-a",
    },
    recommendedRoleIds: ["alpha"],
    artifacts: {},
  });
  const appointment = await makeJudge({}).judge(appointmentReq);
  assert.equal(appointment.verdict, "manual");
  assert.equal(appointment.reasonCode, "artifact-missing");
  assert.match(appointment.reason ?? "", /规范物证缺失：docs\/scheduling\/flow-a-team-v1\.md（判断无法核对）；请按上述原因修正后重新提交。/);

  // acceptance：proposal/流程/标准/报告/变更包都缺 ⇒ 逐条列出
  const acceptanceReq = request({
    cardKind: "acceptance",
    card: {
      kind: "choice",
      title: "验收",
      options: [{ id: "accept", label: "接受" }],
      cardKind: "acceptance",
      flowId: "flow-a",
    },
    artifacts: {},
  });
  const acceptance = await makeJudge({}).judge(acceptanceReq);
  assert.equal(acceptance.reasonCode, "artifact-missing");
  assert.match(acceptance.reason ?? "", /docs\/proposals\/flow-a-v1\.md/);
  assert.match(acceptance.reason ?? "", /docs\/flows\/flow-a\.md/);
  assert.match(acceptance.reason ?? "", /docs\/acceptance\/flow-a-criteria-v1\.md/);
  assert.match(acceptance.reason ?? "", /docs\/acceptance\/flow-a-report-v1\.md/);
  assert.match(acceptance.reason ?? "", /docs\/scheduling\/flow-a-change-v1\.md/);
});

test("requiredArtifactPaths：flowId 缺失时 missingPaths 用文字，不编造路径", () => {
  assert.deepEqual(requiredArtifactPaths(request({ flowId: "" })).missingPaths, ["提案"]);
  assert.deepEqual(
    requiredArtifactPaths(request({
      flowId: "",
      cardKind: "appointment",
      card: {
        kind: "choice",
        title: "任命角色",
        options: [{ id: "alpha", label: "Alpha" }],
        cardKind: "appointment",
        flowId: "",
      },
      recommendedRoleIds: ["alpha"],
      artifacts: {},
    })).missingPaths,
    ["团队计划"],
  );
  assert.deepEqual(
    requiredArtifactPaths(request({ flowId: "", cardKind: "acceptance", card: { kind: "choice", title: "验收", options: [], cardKind: "acceptance" }, artifacts: {} })).missingPaths,
    ["提案", "流程单文件", "实施前验收标准", "验收报告", "变更包"],
  );
});

test("proposal：读取被拒/预算/截断 → approve 降 manual", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    for (const [mutate, code] of [
      [(stats: { deniedReads: number }) => { stats.deniedReads = 1; }, "read-denied"],
      [(stats: { budgetExceeded: boolean }) => { stats.budgetExceeded = true; }, "budget"],
      [(stats: { truncatedReads: number }) => { stats.truncatedReads = 1; }, "read-truncated"],
    ] as const) {
      const { judge } = makeJudge({
        report: (seen: Seen) => {
          const stats = seen.capabilities!.governanceJudge!.stats;
          stats.readPaths = [INTENT_REL, "docs/proposals/flow-a-v1.md"];
          (mutate as (stats: { deniedReads?: number; budgetExceeded?: boolean; truncatedReads?: number }) => void)(stats);
          return APPROVE_PROPOSAL;
        },
      });
      const out = await judge(request({
        projectRoot: root,
        artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
      }));
      assert.equal(out.verdict, "manual");
      assert.equal(out.reasonCode, code);
    }
  });
});

test("proposal：read-denied 摘要列出相对路径与类别（治理与 shell judge 同口径）", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    const { judge } = makeJudge({
      report: (seen: Seen) => {
        const stats = seen.capabilities!.governanceJudge!.stats;
        stats.readPaths = [INTENT_REL, "docs/proposals/flow-a-v1.md"];
        stats.deniedReads = 2;
        stats.deniedPaths = [
          { path: ".ans/sessions/a.json", code: "app-private", pathClass: "app-private" },
          { path: "src/foo.txt", code: "sensitive", pathClass: "credential" },
        ];
        return APPROVE_PROPOSAL;
      },
    });
    const out = await judge(request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    }));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "read-denied");
    const reason = out.reason ?? "";
    assert.match(reason, /判断读取被拒：/);
    assert.match(reason, /\.ans\/sessions\/a\.json（应用私有数据）/);
    assert.match(reason, /src\/foo\.txt（凭据文件）/);
    assert.match(reason, /无法保证无损判断；请/);
    assert.doesNotMatch(reason, /[A-Za-z]:[\\/]|\/(?:home|Users|tmp)\//, "摘要不含绝对路径");
  });
});

test("proposal：read-denied 且 deniedPaths 为空 ⇒ 保留原泛化文案", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    const { judge } = makeJudge({
      report: (seen: Seen) => {
        const stats = seen.capabilities!.governanceJudge!.stats;
        stats.readPaths = [INTENT_REL, "docs/proposals/flow-a-v1.md"];
        stats.deniedReads = 1;
        stats.deniedPaths = [];
        return APPROVE_PROPOSAL;
      },
    });
    const out = await judge(request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    }));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "read-denied");
    assert.match(out.reason ?? "", /判断读取被拒（敏感文件\/越界\/二进制），无法保证无损判断；请补齐判断所需证据（或缩小读取范围）后重新提交。/);
  });
});

// —————————————————————— ② appointment ——————————————————————

function appointmentRequest(root: string, over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return request({
    projectRoot: root,
    cardKind: "appointment",
    card: {
      kind: "choice",
      title: "任命角色",
      options: [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }],
      multiple: true,
      cardKind: "appointment",
      flowId: "flow-a",
    },
    recommendedRoleIds: ["alpha", "beta"],
    artifacts: { teamPlanPath: "docs/scheduling/flow-a-team-v1.md" },
    ...over,
  });
}

test("appointment：selected 恰等于团队计划推荐集 → approve；多选卡片允许两个", async () => {
  await withRoot(async (root) => {
    seedTeamPlan(root, ["alpha", "beta"]);
    seedIntent(root);
    seedIntentLedger(root);
    const { judge } = makeJudge({
      report: readThenReport([INTENT_REL, "docs/scheduling/flow-a-team-v1.md"], {
        verdict: "approve",
        reason: "候选与已接受提案一致。",
        evidence: ["docs/scheduling/flow-a-team-v1.md"],
        selected: ["alpha", "beta"],
      }),
    });
    const out = await judge(appointmentRequest(root));
    assert.equal(out.verdict, "approve");
    assert.deepEqual(out.value, { selected: ["alpha", "beta"] });
  });
});

test("appointment legacy（O4）：仅旧提名文件时回落 nominationPath 并解析推荐集", async () => {
  await withRoot(async (root) => {
    seedNomination(root, ["alpha", "beta"]);
    seedIntent(root);
    seedIntentLedger(root);
    const { judge } = makeJudge({
      report: readThenReport([INTENT_REL, "docs/nominations/flow-a-v1.md"], {
        verdict: "approve",
        reason: "旧流程回落提名文件，候选一致。",
        evidence: ["docs/nominations/flow-a-v1.md"],
        selected: ["alpha", "beta"],
      }),
    });
    const out = await judge(appointmentRequest(root, {
      artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" },
    }));
    assert.equal(out.verdict, "approve");
    assert.deepEqual(out.value, { selected: ["alpha", "beta"] });
  });
});

test("appointment：多选推荐但卡片单选 / 选偏 / 内置 id / 推荐集缺失 → manual", async () => {
  const baseCard = (multiple: boolean | undefined): CustomerInputRequest => ({
    kind: "choice",
    title: "任命角色",
    options: [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }, { id: "su", label: "su" }],
    ...(multiple !== undefined ? { multiple } : {}),
    cardKind: "appointment",
    flowId: "flow-a",
  });
  const scenarios: Array<{ recommended: string[]; requestRecommended?: string[]; selected: string[]; code: string }> = [
    {
      recommended: ["alpha", "beta"],
      requestRecommended: ["alpha", "beta"],
      selected: ["alpha", "beta"],
      code: "not-recommended",
    },
    {
      recommended: ["alpha", "beta"],
      requestRecommended: ["alpha", "beta"],
      selected: ["alpha"],
      code: "not-recommended",
    },
    {
      recommended: ["alpha", "su"],
      requestRecommended: ["alpha", "su"],
      selected: ["alpha", "su"],
      code: "not-recommended",
    },
    {
      recommended: ["alpha", "beta"],
      requestRecommended: undefined,
      selected: ["alpha", "beta"],
      code: "insufficient-evidence",
    },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    await withRoot(async (root) => {
      seedTeamPlan(root, scenario.recommended);
      seedIntent(root);
      seedIntentLedger(root);
      const { judge } = makeJudge({
        report: (seen: Seen) => {
          seen.capabilities!.governanceJudge!.stats.readPaths = [INTENT_REL, "docs/scheduling/flow-a-team-v1.md"];
          return {
            verdict: "approve",
            reason: "按推荐集任命。",
            evidence: ["docs/scheduling/flow-a-team-v1.md"],
            selected: scenario.selected,
          };
        },
      });
      const out = await judge(appointmentRequest(root, {
        card: baseCard(index === 0 ? undefined : true),
        recommendedRoleIds: scenario.requestRecommended,
      }));
      assert.equal(out.verdict, "manual");
      assert.equal(out.reasonCode, scenario.code);
    });
  }
});

// —————————————————————— ③ acceptance ——————————————————————

const FLOW_HEADER = ["# 流程 flow-a", "", "| 步骤 | 角色 | 状态 |", "| --- | --- | --- |"];
function flowMarkdown(steps: Array<{ id: string; status: string }>): string {
  return [...FLOW_HEADER, ...steps.map((step) => `| ${step.id} | 实现者 | ${step.status} |`), ""].join("\n");
}

function acceptanceRequest(root: string, over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return request({
    projectRoot: root,
    cardKind: "acceptance",
    card: {
      kind: "choice",
      title: "验收流程",
      options: [{ id: "accept", label: "验收" }, { id: "reject", label: "不验收" }],
      cardKind: "acceptance",
      flowId: "flow-a",
    },
    artifacts: {
      proposalPath: "docs/proposals/flow-a-v1.md",
      flowPath: "docs/flows/flow-a.md",
      acceptanceCriteriaPath: "docs/acceptance/flow-a-criteria-v1.md",
      acceptanceReportPath: "docs/acceptance/flow-a-report-v1.md",
      changePackagePath: "docs/scheduling/flow-a-change-v1.md",
    },
    facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
    ...over,
  });
}

const APPROVE_ACCEPTANCE = {
  verdict: "approve",
  reason: "验收口径逐项有证据，步骤均已派发完成。",
  evidence: ["docs/flows/flow-a.md", "docs/proposals/flow-a-v1.md"],
  selected: ["accept"],
};
const ACCEPTANCE_READS = [INTENT_REL, "docs/proposals/flow-a-v1.md"];

test("acceptance：流程全部 done + dispatch 齐全 + 标准/报告/变更包齐备 → approve", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
    seedProposal(root);
    seedIntent(root);
    seedAcceptanceArtifacts(root);
    seedAcceptanceLedger(root, { steps: ["s1"] });
    const { judge } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
    const out = await judge(acceptanceRequest(root));
    assert.equal(out.verdict, "approve");
    assert.deepEqual(out.value, { selected: ["accept"] });
  });
});

test("acceptance：机械门槛——未完成/阻塞/缺 dispatch/未结算决定/物证缺失 → manual", async () => {
  const cases: Array<{
    name: string;
    flow: string | undefined;
    facts: GovernanceJudgeFacts;
    code: string;
  }> = [
    {
      name: "pending 步骤",
      flow: flowMarkdown([{ id: "s1", status: "pending" }]),
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
      code: "insufficient-evidence",
    },
    {
      name: "blocked 步骤",
      flow: flowMarkdown([{ id: "s1", status: "blocked" }]),
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
      code: "insufficient-evidence",
    },
    {
      name: "缺 dispatch.accepted",
      flow: flowMarkdown([{ id: "s1", status: "done" }]),
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: [] }),
      code: "insufficient-evidence",
    },
    {
      name: "流程单缺失",
      flow: undefined,
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
      code: "artifact-missing",
    },
  ];
  for (const scenario of cases) {
    await withRoot(async (root) => {
      if (scenario.flow !== undefined) writeFile(root, "docs/flows/flow-a.md", scenario.flow);
      seedProposal(root);
      seedIntent(root);
      seedAcceptanceArtifacts(root);
      seedAcceptanceLedger(root, { steps: scenario.facts.dispatchedStepIds ?? [] });
      const { judge } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
      const out = await judge(acceptanceRequest(root, { facts: scenario.facts }));
      assert.equal(out.verdict, "manual", scenario.name);
      assert.equal(out.reasonCode, scenario.code, scenario.name);
    });
  }
});

test("acceptance：旧账本 unclassified/none 不算未结算（不挡真正的提案接受）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
    seedProposal(root);
    seedIntent(root);
    writeFile(root, ".ans/governance/ledger.jsonl", [
      JSON.stringify({
        at: "2026-10-18T00:00:00.000Z",
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "liaison",
        power: "liaison",
        decisionKind: "intent-confirm",
        customerDecision: "accepted",
        decisionEvidence: { kind: "customer-input" },
      }),
      JSON.stringify({
        at: "2026-10-18T00:00:00.500Z",
        kind: "intent.handed-off",
        flowId: "flow-a",
        actorRoleId: "liaison",
        power: "liaison",
        intentId: "intent-a",
        handoffKind: "initial",
      }),
      JSON.stringify({
        at: "2026-10-18T00:00:01.000Z",
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "rapporteur",
        power: "proposal",
        decisionKind: "proposal-accept",
        customerDecision: "accepted",
        decisionEvidence: { kind: "customer-input" },
      }),
      JSON.stringify({
        at: "2026-10-18T00:00:01.000Z",
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "liaison",
        power: "liaison",
        decisionKind: "unclassified",
        customerDecision: "none",
        decisionEvidence: { kind: "customer-input" },
      }),
    ].join("\n") + "\n");
    seedAcceptanceArtifacts(root);
    const { judge } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
    const out = await judge(acceptanceRequest(root, {
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
    }));
    assert.equal(out.verdict, "approve");
    assert.equal(out.reasonCode, "sufficient");
  });
});

test("acceptance：ledgerErrors / 未接受 / 未闭环澄清 → manual", async () => {
  const scenarios: Array<{
    facts: GovernanceJudgeFacts;
    code: string;
    ledger: (root: string) => void;
  }> = [
    {
      facts: facts({ ledgerErrors: 1, proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
      code: "ledger-unavailable",
      ledger: (root) => seedAcceptanceLedger(root, { steps: ["s1"], extraLines: ["{坏行"] }),
    },
    {
      facts: facts({ proposalDecision: "revise", dispatchedStepIds: ["s1"] }),
      code: "insufficient-evidence",
      ledger: (root) => seedAcceptanceLedger(root, {
        steps: ["s1"],
        decisionKind: "proposal-revise",
        customerDecision: "changes-requested",
      }),
    },
    {
      facts: facts({ proposalDecision: undefined, dispatchedStepIds: ["s1"] }),
      code: "insufficient-evidence",
      ledger: (root) => seedAcceptanceLedger(root, { steps: ["s1"], decisionKind: "none" }),
    },
    {
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"], unresolvedClarificationCount: 1 }),
      code: "insufficient-evidence",
      ledger: (root) => seedAcceptanceLedger(root, {
        steps: ["s1"],
        extraLines: [JSON.stringify({
          at: "2026-10-19T00:00:09.000Z",
          kind: "clarification.requested",
          flowId: "flow-a",
          actorRoleId: "liaison",
          power: "liaison",
        })],
      }),
    },
  ];
  for (const scenario of scenarios) {
    await withRoot(async (root) => {
      writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
      seedProposal(root);
      seedIntent(root);
      seedAcceptanceArtifacts(root);
      scenario.ledger(root);
      const { judge } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
      const out = await judge(acceptanceRequest(root, { facts: scenario.facts }));
      assert.equal(out.verdict, "manual");
      assert.equal(out.reasonCode, scenario.code);
    });
  }
});

test("acceptance 第 3 项门槛：标准/报告/变更包缺失或首行五项/档位不符 → manual（不调模型）", async () => {
  const baseSeed = (root: string): void => {
    writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
    seedProposal(root);
    seedIntent(root);
    seedAcceptanceArtifacts(root);
    seedAcceptanceLedger(root, { steps: ["s1"] });
  };
  const cases: Array<{
    name: string;
    prepare: (root: string) => void;
    over?: Partial<GovernanceJudgeRequest>;
    code: string;
    reason: RegExp;
  }> = [
    {
      name: "标准缺失",
      prepare: (root) => rmSync(join(root, "docs", "acceptance", "flow-a-criteria-v1.md")),
      code: "artifact-missing",
      reason: /flow-a-criteria-v1\.md/,
    },
    {
      name: "报告缺失",
      prepare: (root) => rmSync(join(root, "docs", "acceptance", "flow-a-report-v1.md")),
      code: "artifact-missing",
      reason: /flow-a-report-v1\.md/,
    },
    {
      name: "变更包缺失",
      prepare: (root) => rmSync(join(root, "docs", "scheduling", "flow-a-change-v1.md")),
      code: "artifact-missing",
      reason: /flow-a-change-v1\.md/,
    },
    {
      name: "报告首行缺五项",
      prepare: (root) => {
        seedAcceptanceArtifacts(root, { reportFirstLine: "风险档位：T3｜判定依据：治理变更｜选定检查：定向测试｜全量回归：已执行" });
      },
      code: "insufficient-evidence",
      reason: /首行缺少五项中的：复用证据/,
    },
    {
      name: "报告档位低于变更包",
      prepare: (root) => seedAcceptanceArtifacts(root, { reportTier: "T1", changeTier: "T3" }),
      code: "insufficient-evidence",
      reason: /报告档位 T1 低于变更包档位 T3/,
    },
    {
      name: "变更包缺 riskTier",
      prepare: (root) => writeFile(root, "docs/scheduling/flow-a-change-v1.md", "---\nflowId: flow-a\nversion: 1\n---\n# 变更包\n"),
      code: "insufficient-evidence",
      reason: /缺少 riskTier/,
    },
    {
      name: "标准 flowId 不一致",
      prepare: (root) => {
        writeFile(root, "docs/acceptance/flow-b-criteria-v1.md", acceptanceCriteriaMarkdown("flow-b"));
      },
      over: {
        artifacts: {
          proposalPath: "docs/proposals/flow-a-v1.md",
          flowPath: "docs/flows/flow-a.md",
          acceptanceCriteriaPath: "docs/acceptance/flow-b-criteria-v1.md",
          acceptanceReportPath: "docs/acceptance/flow-a-report-v1.md",
          changePackagePath: "docs/scheduling/flow-a-change-v1.md",
        },
      },
      code: "insufficient-evidence",
      reason: /flowId 与卡片不一致/,
    },
  ];

  for (const scenario of cases) {
    await withRoot(async (root) => {
      baseSeed(root);
      scenario.prepare(root);
      const { judge, seen } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
      const out = await judge(acceptanceRequest(root, { facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }), ...scenario.over }));
      assert.equal(out.verdict, "manual", scenario.name);
      assert.equal(out.reasonCode, scenario.code, scenario.name);
      assert.match(out.reason ?? "", scenario.reason, scenario.name);
      assert.equal(seen.binds, 0, `${scenario.name}：机械门槛失败不得调用模型`);
    });
  }

  // 报告档位高于变更包（升档）⇒ 允许。
  await withRoot(async (root) => {
    baseSeed(root);
    seedAcceptanceArtifacts(root, { reportTier: "T3", changeTier: "T2" });
    const { judge } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
    const out = await judge(acceptanceRequest(root));
    assert.equal(out.verdict, "approve");
  });
});

// ————— ③-补 2026-10-19 真机：状态「引导词 + 说明」与 canonical stepId 列（验收机械门槛） —————

test("流程步骤状态首词规范化：done 变体视为完成；pending/delivered/空不视为完成", () => {
  for (const status of ["done", "done（证据）", "done(evidence)", "Done", "DONE", "done：xxx", "done 有落盘/回交证据"]) {
    assert.equal(normalizeFlowStepStatus(status), "done", `${status} 应规范化为 done`);
  }
  for (const status of ["pending（…）", "pending（不由运营派发）", "delivered（…）", "in-progress（…）", "blocked", "", "   "]) {
    assert.notEqual(
      normalizeFlowStepStatus(status),
      "done",
      `${status === "" || status.trim() === "" ? "（空）" : status} 不应视为 done`,
    );
  }
});

// 真实 R2 流程单（/Users/wangzhongren/code/vibeingcode/ans-testbed/ticket-desk-live/docs/flows/ticket-desk-r2.md
// 的步骤表，2026-10-19 v8 收口快照：10 步全部是 `done（…）` 写法）。此前编排 `parseFlowSteps` 取「步骤」
// 描述列当 id、精确比较状态，会把本表解析成描述文本 id 且全部判为未完成。
const REAL_R2_STEP_TABLE: ReadonlyArray<readonly [id: string, description: string, status: string]> = [
  ["nomination", "提名：人事 / Crew 读取提案并给出候选角色", "done（`docs/nominations/ticket-desk-r2-v1.md`；推荐集 = 既有三角色，不新增角色）"],
  ["role-readiness", "角色就绪：客户任命决定 + 角色卡就绪确认", "done（客户经任命卡确认沿用 backend / frontend / test；本轮不新增角色、不改卡）"],
  ["contract-freeze-v2", "冻结 API 契约 v2 到 `docs/contracts/ticket-desk-api-v2.md`", "done（frozen-v2 / supersedes v1）"],
  ["delivery-backend", "服务端增量：`sort`/`order`/`assignee`、`deadline`、`overdue`、`GET /api/tickets/export`（CSV+BOM）、`canExport`、store 补全、README 同步（backend-engineer）", "done（有落盘/回交证据；125/125 + 自检 73 项为角色自报，独立复核仍待 `verification`）"],
  ["delivery-frontend", "前端增量：排序/负责人筛选控件、截止时间列与逾期高亮、创建与 PATCH deadline 表单、导出按钮（`fetch`+`Blob`）（frontend-engineer）", "done（有落盘/回交证据；e2e 后 0 处修正）"],
  ["delivery-test", "测试增量：`sorting-filtering` / `overdue` / `export` 三文件 + `persistence` 增补；既有 75 用例不得弱化（test-engineer）", "done（有落盘/回交证据；125/125 为角色自报，独立复核仍待 `verification`）"],
  ["cleanup-selfcheck", "清理 `data/selfcheck-r2.mjs` 临时自检脚本（backend-engineer 自己的写区）", "done（已删；`data/` 仅剩 `tickets.json`，运营 `list_dir` 复核）"],
  ["r2-e2e", "R2 端到端联调：真起服务核对前端查询串/静态托管/导出链路（frontend-engineer）", "done（真起服 curl 实测 37 个请求；浏览器渲染未验证）"],
  ["verification", "独立复核：按提案 §11 八条逐条出结论（内置 Proof / verifier）", "done（报告 `docs/verification/ticket-desk-r2-v1.md`；§11 八条均有证据，建议 accept）"],
  ["acceptance", "客户验收", "done（客户在验收卡选择 **accept**；决定登记于 `docs/governance/verifier/ticket-desk-r2.md`）"],
];

const REAL_R2_STEP_IDS = REAL_R2_STEP_TABLE.map(([id]) => id);

function realR2FlowMarkdown(overrides: Readonly<Record<string, string>> = {}): string {
  return [
    "# 流程：ticket-desk-r2（第二轮迭代：排序/筛选/deadline/overdue/CSV 导出）",
    "",
    "## 步骤表",
    "",
    "| stepId | 步骤 | 状态 |",
    "| --- | --- | --- |",
    ...REAL_R2_STEP_TABLE.map(([id, description, status]) => `| ${id} | ${description} | ${overrides[id] ?? status} |`),
  ].join("\n");
}

test("parseFlowSteps：canonical stepId|步骤|状态 三列取 stepId 作 id（非描述文本），status 保留原文", () => {
  const parsed = parseFlowSteps(realR2FlowMarkdown());
  assert.equal(parsed.wellFormed, true);
  assert.deepEqual(parsed.steps.map((step) => step.id), REAL_R2_STEP_IDS);
  assert.equal(parsed.steps[0]!.status, REAL_R2_STEP_TABLE[0]![2], "status 仍保留单元格原文（说明不丢）");
  assert.ok(parsed.steps.every((step) => normalizeFlowStepStatus(step.status) === "done"));
});

test("parseFlowSteps：无显式 id 列时沿用「步骤」列；`步骤id`/`id` 列同样优先", () => {
  const legacy = parseFlowSteps(flowMarkdown([{ id: "s1", status: "done（证据）" }]));
  assert.equal(legacy.wellFormed, true);
  assert.deepEqual(legacy.steps, [{ id: "s1", status: "done（证据）" }]);

  for (const header of ["| 步骤id | 步骤 | 状态 |", "| id | 步骤 | 状态 |", "| step-id | step | status |"]) {
    const parsed = parseFlowSteps(["# 流程", "", header, "| --- | --- | --- |", "| s9 | 实现 | done |", ""].join("\n"));
    assert.equal(parsed.wellFormed, true, header);
    assert.deepEqual(parsed.steps, [{ id: "s9", status: "done" }], header);
  }
});

test("验收完成判定：标注式 done（…）全部完成 ⇒ ok；改一个执行步骤为 pending（…）⇒ 不成立", () => {
  const completedFacts = facts({
    flowId: "ticket-desk-r2",
    proposalDecision: "accepted",
    dispatchedStepIds: [...REAL_R2_STEP_IDS],
  });
  assert.deepEqual(
    evaluateAcceptanceCompletion({
      flowMarkdown: realR2FlowMarkdown(),
      facts: completedFacts,
      ledgerEntries: [],
      ledgerErrors: 0,
    }),
    { ok: true },
    "done（…）/Done/done：xxx 均为完成；id 用 stepId 才能对上 dispatchedStepIds",
  );

  const blocked = evaluateAcceptanceCompletion({
    flowMarkdown: realR2FlowMarkdown({ "delivery-backend": "pending（等待回交）" }),
    facts: completedFacts,
    ledgerEntries: [],
    ledgerErrors: 0,
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.reasonCode, "insufficient-evidence");
  assert.match(blocked.reason, /流程仍有未完成\/阻塞\/待派发步骤（delivery-backend=pending（等待回交））/);
});

// ————— ③-补2 2026-10-19 真机（library-lending-v2）：Markdown 强调式状态 + superseded 步骤 —————

test("normalizeFlowStepStatus：Markdown 强调包裹的引导词归一化（**done**（…）/__done__/`done`）", () => {
  for (const status of [
    "**done**（证据…）",
    "**done**（客户已任命 backend / frontend / test）",
    "**Done**：xxx",
    "__done__",
    "_done_",
    "`done`",
    "**_done_**",
    "  **done**  ",
    "**done：有证据**",
  ]) {
    assert.equal(normalizeFlowStepStatus(status), "done", `${status} 应规范化为 done`);
  }
  for (const status of ["**pending**（等待回交）", "`dispatched`", "__blocked__", "**", "``", "___"]) {
    assert.notEqual(normalizeFlowStepStatus(status), "done", `${status} 不应视为 done`);
  }
  assert.equal(normalizeFlowStepStatus("**superseded**：并入 integration-e2e-v2"), "superseded");
  assert.equal(normalizeFlowStepStatus("`cancelled`"), "cancelled");
});

test("验收完成判定：**done**（…）/__done__/`done` 强调式状态视为完成，不再整表误判未完成", () => {
  const markdown = flowMarkdown([
    { id: "s1", status: "**done**（证据已落盘）" },
    { id: "s2", status: "__done__" },
    { id: "s3", status: "`done`" },
  ]);
  const result = evaluateAcceptanceCompletion({
    flowMarkdown: markdown,
    facts: facts({ flowId: "flow-a", dispatchedStepIds: ["s1", "s2", "s3"] }),
    ledgerEntries: [],
    ledgerErrors: 0,
  });
  assert.deepEqual(result, { ok: true });

  const blocked = evaluateAcceptanceCompletion({
    flowMarkdown: flowMarkdown([
      { id: "s1", status: "**done**（证据已落盘）" },
      { id: "s2", status: "**dispatched**（已派发未完成）" },
    ]),
    facts: facts({ flowId: "flow-a", dispatchedStepIds: ["s1", "s2"] }),
    ledgerEntries: [],
    ledgerErrors: 0,
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.reasonCode, "insufficient-evidence");
  assert.match(blocked.reason, /s2=dispatched\*\*（已派发未完成）/);
});

test("验收完成判定：superseded/cancelled 步骤视为作废（不判未完成、不要求 dispatch）；其他未知状态仍 fail-closed", () => {
  const supersededFlow = flowMarkdown([
    { id: "s1", status: "**done**（证据已落盘）" },
    { id: "s2", status: "**superseded**：并入 s1，不再单独派发" },
    { id: "s3", status: "cancelled（客户取消）" },
  ]);
  // s2/s3 没有 dispatch.accepted 记录也不挡验收：作废步骤不参与未完成判定与对账。
  assert.deepEqual(
    evaluateAcceptanceCompletion({
      flowMarkdown: supersededFlow,
      facts: facts({ flowId: "flow-a", dispatchedStepIds: ["s1"] }),
      ledgerEntries: [],
      ledgerErrors: 0,
    }),
    { ok: true },
  );
  // 作废步骤不能掩盖真实未完成步骤：pending 仍然 fail-closed 且精确指出 s4。
  const pendingFlow = flowMarkdown([
    { id: "s1", status: "**superseded**：并入 s4" },
    { id: "s4", status: "**pending**（等待回交）" },
  ]);
  const pending = evaluateAcceptanceCompletion({
    flowMarkdown: pendingFlow,
    facts: facts({ flowId: "flow-a", dispatchedStepIds: ["s1", "s4"] }),
    ledgerEntries: [],
    ledgerErrors: 0,
  });
  assert.equal(pending.ok, false);
  if (pending.ok) return;
  assert.match(pending.reason, /流程仍有未完成\/阻塞\/待派发步骤（s4=pending\*\*（等待回交））/);
  // 其他未知状态（completed/已完成/cancelled-by-foo）不享受作废豁免。
  for (const status of ["completed", "已完成", "superseded-by-foo"]) {
    const unknown = evaluateAcceptanceCompletion({
      flowMarkdown: flowMarkdown([{ id: "s1", status: "done" }, { id: "s5", status }]),
      facts: facts({ flowId: "flow-a", dispatchedStepIds: ["s1", "s5"] }),
      ledgerEntries: [],
      ledgerErrors: 0,
    });
    assert.equal(unknown.ok, false, status);
    if (unknown.ok) continue;
    assert.match(unknown.reason, /s5=/, status);
  }
});

// 真实 R2 流程单（/Users/wangzhongren/code/vibeingcode/ans-testbed/library-lending-live/docs/flows/
// library-lending-v2.md 的步骤表，2026-10-19 真机快照，只读拷贝）：状态写成 `**done**（…）` 与
// `**superseded**：…`，四列 `| stepId | 步骤 | 执行方 | 状态 |`。修复前 `stripTableMarkup` 只剥单元格
// 边缘的 `**`，行内剩 `done**（…）`，`normalizeFlowStepStatus` 取首词得 `done**` ⇒ 七个 done 步骤全判
// 未完成；`superseded**：…` 也被当成未知状态。
const REAL_LIBRARY_LENDING_R2_STEP_TABLE: ReadonlyArray<readonly [id: string, description: string, executor: string, status: string]> = [
  ["nomination", "提名：Crew 读提案给出候选角色 → 客户任命", "人事 / Crew（应用派发）＋ 客户", "**done**（客户已任命 backend / frontend / test）"],
  ["contract-freeze-v2", "契约冻结 `docs/contracts/library-lending-api-v2.md`", "策划 / Draft（治理角色）", "**done**（`contractVersion: 2` · `schemaVersion: 2` · `status: frozen-v2`，含 §1 schema、§2 预约、§3 续借、§4 搜索分页、§5 CSV、§7 错误码 30、§9 迁移/回滚、§11 并发、§12 负例清单）"],
  ["delivery-server-v2", "服务端（M2）：模块/迁移/配置/路由/日志/README", "backend", "**done**（回执齐备：6 新增 + 14 修订；迁移 v1→v2 含 `.bak.1.<ts>`；真实启动 18092/18093；预约队列/续借/搜索分页/CSV/并发/负例实测；**既有 155 用例 151 pass / 4 fail，4 项均为 test 侧 v1 版本断言，非行为回归**）"],
  ["delivery-frontend-v2", "前端（M3）：预约/续借/搜索分页/导出 UI", "frontend", "**done**（回执：`public/assets/{api,app,styles}` + `index.html` 全在 `public/**`，无根路径文件；四段浏览器实测 17/17、16/17、30/32、17/17，**3 处 FAIL 均为其自身断言写法错误并已打印实际值**；静态门 8/8、6/6；截图在 `/tmp`，不可久留）"],
  ["delivery-tests-v2", "测试（M4）：矩阵/负例/并发/回滚演练；既有 155 保持全绿", "test", "**done**（回执 + 我方核对新增文件在盘：**308 tests / 308 pass / fail 0 / exit 0**，新增 153 条；4 处版本断言改为派生 `CURRENT_SCHEMA_VERSION`；TEST-MATRIX 增 §10–§13）"],
  ["docs-note-error-code-count", "文档登记：README 记「契约 §7 写 30、逐码核对 29、行为无误」（客户方案 b）", "backend", "**done**（README 4 处 30/22 → 29/21；新增差异登记引用块 + §9 第 13 条二次索引；未改代码/测试/契约）"],
  ["delivery-frontend-v2-evidence", "（不派）前端落盘证据补充", "frontend", "**superseded**：并入 `integration-e2e-v2`，由 test 在 `test/tools/` 产落盘脚本 + 持久截图"],
  ["integration-e2e-v2", "集成与端到端（M5 证据）：真实启动 + v2 新链路 + 旧行为回归 + 落盘截图", "test", "**done**（回执 + 我方核对产物在盘：live-e2e-v2 **238/238 PASS**、浏览器演示 **88/88 PASS**、全量套件仍 **308/308 exit 0**；证据全部在 `test/**`）"],
  ["verification", "验收前验证（M6）：Proof 复核 + 亲自真实启动演示", "Proof / `verifier`（治理角色）", "pending"],
  ["acceptance", "验收卡：Proof 发起，客户决定", "Proof ＋ 客户", "pending"],
];

const REAL_LIBRARY_LENDING_R2_STEP_IDS = REAL_LIBRARY_LENDING_R2_STEP_TABLE.map(([id]) => id);
const REAL_LIBRARY_LENDING_R2_VOID_IDS = ["delivery-frontend-v2-evidence"];

function realLibraryLendingR2FlowMarkdown(overrides: Readonly<Record<string, string>> = {}): string {
  return [
    "# 流程单：library-lending-v2（变更需求 1：预约 / 续借 / 目录搜索分页 / 借阅 CSV 导出）",
    "",
    "## 1. 步骤表",
    "",
    "| stepId | 步骤 | 执行方 | 状态 |",
    "| --- | --- | --- | --- |",
    ...REAL_LIBRARY_LENDING_R2_STEP_TABLE.map(
      ([id, description, executor, status]) => `| ${id} | ${description} | ${executor} | ${overrides[id] ?? status} |`,
    ),
  ].join("\n");
}

test("真实 R2 流程单（library-lending-v2，只读拷贝）：**done**（…）解析后不再判未完成，**superseded** 跳过", () => {
  const markdown = realLibraryLendingR2FlowMarkdown();
  const parsed = parseFlowSteps(markdown);
  assert.equal(parsed.wellFormed, true);
  assert.deepEqual(parsed.steps.map((step) => step.id), REAL_LIBRARY_LENDING_R2_STEP_IDS);
  // parseFlowSteps 的单元格清洗只剥边缘强调符：行首 `**` 已剥、行内收尾 `**` 留在说明前，
  // 说明文字不丢；判定一律经 normalizeFlowStepStatus（下面逐行断言）。
  assert.equal(parsed.steps[0]!.status, "done**（客户已任命 backend / frontend / test）");
  assert.ok(parsed.steps[0]!.status.includes("客户已任命 backend / frontend / test"), "说明文字不丢");

  const doneRows = REAL_LIBRARY_LENDING_R2_STEP_TABLE.filter(
    ([id, , , status]) => !REAL_LIBRARY_LENDING_R2_VOID_IDS.includes(id) && !/^pending$/i.test(status),
  );
  for (const [id] of doneRows) {
    const step = parsed.steps.find((entry) => entry.id === id)!;
    assert.equal(normalizeFlowStepStatus(step.status), "done", `${id} 的 **done**（…）应归一化为 done`);
  }
  const superseded = parsed.steps.find((step) => step.id === "delivery-frontend-v2-evidence")!;
  assert.equal(normalizeFlowStepStatus(superseded.status), "superseded");

  // 逐字表格里 verification/acceptance 仍是 pending：失败详情只应点名这两个，不能再把 done 行列出。
  const blocked = evaluateAcceptanceCompletion({
    flowMarkdown: markdown,
    facts: facts({ flowId: "library-lending-v2", dispatchedStepIds: [...REAL_LIBRARY_LENDING_R2_STEP_IDS] }),
    ledgerEntries: [],
    ledgerErrors: 0,
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.reasonCode, "insufficient-evidence");
  assert.match(blocked.reason, /verification=pending/);
  assert.match(blocked.reason, /acceptance=pending/);
  for (const [id] of doneRows) {
    assert.ok(!blocked.reason.includes(`${id}=`), `done 行 ${id} 不应出现在未完成详情中：${blocked.reason}`);
  }

  // 把验收/复核也推进到 done（且不派发 superseded 步骤）后，机械门槛通过。
  const completed = evaluateAcceptanceCompletion({
    flowMarkdown: realLibraryLendingR2FlowMarkdown({ verification: "**done**（Proof 真实启动演示）", acceptance: "**done**（客户 accept）" }),
    facts: facts({
      flowId: "library-lending-v2",
      dispatchedStepIds: REAL_LIBRARY_LENDING_R2_STEP_IDS.filter((id) => !REAL_LIBRARY_LENDING_R2_VOID_IDS.includes(id)),
    }),
    ledgerEntries: [],
    ledgerErrors: 0,
  });
  assert.deepEqual(completed, { ok: true });
});

// —————————————————————— ④ write 族 ——————————————————————

/** 写盘卡 preview：每条声明路径一个标题 + 可核对正文（2026-10-19 证据包的结构化载荷口径）。 */
function writePreview(paths: readonly string[]): string {
  return paths.map((entry) => `## ${entry}\n\n# 内容 ${entry}\n\n这是该路径的待写正文。`).join("\n\n");
}

function confirmRequest(over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  const target = "docs/proposals/flow-a-v2.md";
  return request({
    group: "approval",
    cardKind: "write",
    card: {
      kind: "confirm",
      title: "写入提案",
      preview: writePreview([target]),
      detail: "新增 v2 版本，修改验收条目。",
      cardKind: "write",
      flowId: "flow-a",
    },
    paths: [target],
    pathProbes: [{ path: target, allowed: true }],
    allowedPathRoots: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    forbiddenPaths: [".ans/", "docs/bootstrap-manifest.md", "角色卡/", "docs/nominations/", "docs/flows/"],
    artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    ...over,
  });
}

/** 任命写卡所需的账本事实（最新 appointment 决定的目标角色；2026-10-22 起由 Convener 发起）。 */
function seedAppointmentLedger(root: string, targetRoleIds: readonly string[], flowId = "flow-a"): void {
  writeFile(root, ".ans/governance/ledger.jsonl", `${JSON.stringify({
    at: "2026-10-19T00:00:00.000Z",
    kind: "customer.decision",
    flowId,
    actorRoleId: "convener",
    power: "schedule",
    decisionKind: "appointment",
    customerDecision: "appointed",
    targetRoleIds: [...targetRoleIds],
    artifactPath: `docs/scheduling/${flowId}-team-v1.md`,
    artifactVersion: 1,
    decisionEvidence: { kind: "customer-input" },
  })}\n`);
}

const APPROVE_WRITE = {
  verdict: "approve",
  reason: "路径在报告员写区内，预览含正文。",
  evidence: ["docs/proposals/flow-a-v2.md"],
  confirmed: true,
  pathDecisions: [{ path: "docs/proposals/flow-a-v2.md", ok: true }],
};

test("write：逐路径探测 + pathDecisions 齐全 → approve（confirmed:true）", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    const { judge } = makeJudge({
      report: readThenReport(["docs/proposals/flow-a-v1.md"], APPROVE_WRITE),
    });
    const out = await judge(confirmRequest({ projectRoot: root }));
    assert.equal(out.verdict, "approve");
    assert.deepEqual(out.value, { confirmed: true });
    assert.deepEqual(out.paths, ["docs/proposals/flow-a-v2.md"]);
    assert.deepEqual(out.pathDecisions, [{ path: "docs/proposals/flow-a-v2.md", ok: true }]);
  });
});

test("write：pathProbes 越界 / 禁写 / pathDecisions 缺项 / 未确认 → manual", async () => {
  const scenarios: Array<{ req: GovernanceJudgeRequest; report: unknown; code: string }> = [
    {
      req: confirmRequest({ pathProbes: [{ path: "docs/proposals/flow-a-v2.md", allowed: false }] }),
      report: APPROVE_WRITE,
      code: "path-outside-boundary",
    },
    {
      req: confirmRequest({ forbiddenPaths: [".ans/", "docs/proposals/"] }),
      report: APPROVE_WRITE,
      code: "path-outside-boundary",
    },
    {
      req: confirmRequest(),
      report: { ...APPROVE_WRITE, pathDecisions: undefined },
      code: "path-unverified",
    },
    {
      req: confirmRequest(),
      report: { ...APPROVE_WRITE, pathDecisions: [{ path: "docs/proposals/flow-a-v2.md", ok: false }] },
      code: "path-unverified",
    },
    {
      req: confirmRequest(),
      report: { ...APPROVE_WRITE, confirmed: false },
      code: "not-recommended",
    },
    {
      req: confirmRequest({ roleId: "nominator" }), // 来源不匹配（nominator 不能写 docs/proposals）
      report: APPROVE_WRITE,
      code: "path-outside-boundary",
    },
  ];
  for (const scenario of scenarios) {
    const { judge } = makeJudge({
      report: readThenReport(["docs/proposals/flow-a-v1.md"], scenario.report),
    });
    const out = await judge(scenario.req);
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, scenario.code);
  }
});

test("write：新建目标文件（无旧版物证）+ preview 正文 → approve，不要求读取新文件", async () => {
  await withRoot(async (root) => {
    const target = "docs/proposals/realtime-whiteboard.md";
    const req = confirmRequest({
      projectRoot: root,
      paths: [target],
      pathProbes: [{ path: target, allowed: true }],
      artifacts: undefined,
      card: {
        kind: "confirm",
        title: "新建提案",
        preview: writePreview([target]),
        cardKind: "write",
        flowId: "flow-a",
      },
    });
    const report = {
      verdict: "approve",
      reason: "新文件证据包含完整待写正文，路径在报告员写区内。",
      evidence: ["docs/proposals/realtime-whiteboard.md"],
      confirmed: true,
      pathDecisions: [{ path: target, ok: true }],
    };
    const { judge, seen } = makeJudge({ report });
    const out = await judge(req);
    assert.equal(out.verdict, "approve");
    assert.deepEqual(out.value, { confirmed: true });
    assert.ok(!(seen.prompts[0] ?? "").includes("approve 前必须实际读取"), "新文件不进入 required-read");
  });
});

test("write：新建目标文件 preview 为空 → manual/insufficient-evidence", async () => {
  await withRoot(async (root) => {
    const target = "docs/proposals/realtime-whiteboard.md";
    const req = confirmRequest({
      projectRoot: root,
      paths: [target],
      pathProbes: [{ path: target, allowed: true }],
      artifacts: undefined,
      card: {
        kind: "confirm",
        title: "新建提案",
        preview: "",
        cardKind: "write",
        flowId: "flow-a",
      },
    });
    const { judge, seen } = makeJudge({
      report: {
        verdict: "approve",
        reason: "ok",
        evidence: ["preview"],
        confirmed: true,
        pathDecisions: [{ path: target, ok: true }],
      },
    });
    const out = await judge(req);
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "insufficient-evidence");
    assert.equal(seen.binds, 0, "空 preview 不调用模型");
  });
});

test("write：已有旧版提案 → 必须读旧版；新目标文件本身不要求读", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    const target = "docs/proposals/flow-a-v2.md";
    const req = confirmRequest({
      projectRoot: root,
      paths: [target],
      pathProbes: [{ path: target, allowed: true }],
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
      card: {
        kind: "confirm",
        title: "写入提案 v2",
        preview: writePreview([target]),
        cardKind: "write",
        flowId: "flow-a",
      },
    });
    const report = {
      verdict: "approve",
      reason: "v2 与 v1 一致，仅改验收条目。",
      evidence: ["docs/proposals/flow-a-v1.md", target],
      confirmed: true,
      pathDecisions: [{ path: target, ok: true }],
    };
    {
      const { judge } = makeJudge({ report });
      const out = await judge(req);
      assert.equal(out.verdict, "manual");
      assert.equal(out.reasonCode, "artifact-not-read", "旧版物证必须实际读取");
    }
    {
      const { judge } = makeJudge({ report: readThenReport(["docs/proposals/flow-a-v1.md"], report) });
      const out = await judge(req);
      assert.equal(out.verdict, "approve");
    }
  });
});

test("appointment-write / schedule-write：新文件 + 证据包正文仍可代批（不回归）", async () => {
  await withRoot(async (root) => {
    seedTeamPlan(root, ["alpha"]);
    seedAppointmentLedger(root, ["alpha"]);
    const { judge } = makeJudge({
      report: readThenReport(["docs/scheduling/flow-a-team-v1.md"], {
        verdict: "approve",
        reason: "候选与团队计划一致。",
        evidence: ["docs/scheduling/flow-a-team-v1.md"],
        confirmed: true,
        pathDecisions: [
          { path: "角色卡/alpha/role-card.md", ok: true },
          { path: "角色卡/alpha/boundary.yaml", ok: true },
        ],
      }),
    });
    const out = await judge(request({
      projectRoot: root,
      group: "approval",
      cardKind: "appointment-write",
      roleId: "nominator",
      card: {
        kind: "confirm",
        title: "写入角色卡",
        preview: writePreview(["角色卡/alpha/role-card.md", "角色卡/alpha/boundary.yaml"]),
        cardKind: "appointment-write",
        flowId: "flow-a",
      },
      paths: ["角色卡/alpha/role-card.md", "角色卡/alpha/boundary.yaml"],
      pathProbes: [
        { path: "角色卡/alpha/role-card.md", allowed: true },
        { path: "角色卡/alpha/boundary.yaml", allowed: true },
      ],
      allowedPathRoots: ["角色卡/"],
      forbiddenPaths: [".ans/", "角色卡/governance-boundary.yaml", "角色卡/rapporteur/", "角色卡/su/"],
      artifacts: { teamPlanPath: "docs/scheduling/flow-a-team-v1.md" },
      facts: facts({ appointmentTargetRoleIds: ["alpha"] }),
    }));
    assert.equal(out.verdict, "approve");
  });
  await withRoot(async (root) => {
    const flowPath = "docs/flows/flow-a.md";
    const { judge } = makeJudge({
      report: readThenReport([], {
        verdict: "approve",
        reason: "流程步骤与提案一致。",
        evidence: [flowPath],
        confirmed: true,
        pathDecisions: [{ path: flowPath, ok: true }],
      }),
    });
    const out = await judge(request({
      projectRoot: root,
      group: "approval",
      cardKind: "schedule-write",
      roleId: "convener",
      card: {
        kind: "confirm",
        title: "写入新流程单",
        preview: writePreview([flowPath]),
        cardKind: "schedule-write",
        flowId: "flow-a",
      },
      paths: [flowPath],
      pathProbes: [{ path: flowPath, allowed: true }],
      allowedPathRoots: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
      forbiddenPaths: [".ans/", "角色卡/", "docs/proposals/", "docs/nominations/"],
      artifacts: undefined,
    }));
    assert.equal(out.verdict, "approve");
  });
});

test("write：两条声明路径全 allowed → approve（真实 2 文件，不误判散文路径）", async () => {
  await withRoot(async (root) => {
    const targetA = "docs/proposals/local-ledger-cli.proposal-v1.md";
    const targetB = "docs/contracts/local-ledger-cli.md";
    const { judge } = makeJudge({
      report: {
        verdict: "approve",
        reason: "两条路径均在报告员写区内，证据包含正文。",
        evidence: [targetA, targetB],
        confirmed: true,
        pathDecisions: [{ path: targetA, ok: true }, { path: targetB, ok: true }],
      },
    });
    const out = await judge(confirmRequest({
      projectRoot: root,
      flowId: "local-ledger-cli",
      facts: facts({ flowId: "local-ledger-cli" }),
      paths: [targetA, targetB],
      pathProbes: [{ path: targetA, allowed: true }, { path: targetB, allowed: true }],
      artifacts: undefined,
      card: {
        kind: "confirm",
        title: "新建本地账本 CLI",
        preview: `${writePreview([targetA, targetB])}\n\n说明：不会修改 src/**、test/**、data/ledger.json。`,
        cardKind: "write",
        flowId: "local-ledger-cli",
      },
    }));
    assert.equal(out.verdict, "approve");
    assert.deepEqual(out.paths, [targetA, targetB]);
  });
});

test("write：声明路径越界 → path-outside-boundary（即使另外路径 allowed）", async () => {
  const ok = "docs/proposals/local-ledger-cli.proposal-v1.md";
  const bad = "src/evil.ts";
  const { judge } = makeJudge({
    report: {
      verdict: "approve",
      reason: "ok",
      evidence: [ok],
      confirmed: true,
      pathDecisions: [{ path: ok, ok: true }, { path: bad, ok: true }],
    },
  });
  const out = await judge(confirmRequest({
    flowId: "local-ledger-cli",
    facts: facts({ flowId: "local-ledger-cli" }),
    paths: [ok, bad],
    pathProbes: [{ path: ok, allowed: true }, { path: bad, allowed: false }],
    artifacts: undefined,
    card: {
      kind: "confirm",
      title: "新建本地账本 CLI",
      preview: writePreview([ok, bad]),
      cardKind: "write",
      flowId: "local-ledger-cli",
    },
  }));
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "path-outside-boundary");
});

test("appointment-write：目标必须在最新任命名单且非内置 → approve；否则 manual", async () => {
  const appointmentWrite = (root: string, target: string, factsOver: Partial<GovernanceJudgeFacts>): GovernanceJudgeRequest => request({
    projectRoot: root,
    group: "approval",
    cardKind: "appointment-write",
    roleId: "nominator",
    card: {
      kind: "confirm",
      title: `写入角色卡 ${target}`,
      preview: writePreview([`角色卡/${target}/role-card.md`, `角色卡/${target}/boundary.yaml`]),
      cardKind: "appointment-write",
      flowId: "flow-a",
    },
    paths: [`角色卡/${target}/role-card.md`, `角色卡/${target}/boundary.yaml`],
    pathProbes: [
      { path: `角色卡/${target}/role-card.md`, allowed: true },
      { path: `角色卡/${target}/boundary.yaml`, allowed: true },
    ],
    allowedPathRoots: ["角色卡/"],
    forbiddenPaths: [".ans/", "角色卡/governance-boundary.yaml", "角色卡/rapporteur/", "角色卡/su/"],
    artifacts: { teamPlanPath: "docs/scheduling/flow-a-team-v1.md" },
    facts: facts({ appointmentTargetRoleIds: ["alpha"], ...factsOver }),
  });
  const report = (target: string) => ({
    verdict: "approve",
    reason: "候选与团队计划一致。",
    evidence: ["docs/scheduling/flow-a-team-v1.md"],
    confirmed: true,
    pathDecisions: [
      { path: `角色卡/${target}/role-card.md`, ok: true },
      { path: `角色卡/${target}/boundary.yaml`, ok: true },
    ],
  });
  await withRoot(async (root) => {
    seedTeamPlan(root, ["alpha"]);
    seedAppointmentLedger(root, ["alpha"]);
    const { judge } = makeJudge({ report: readThenReport(["docs/scheduling/flow-a-team-v1.md"], report("alpha")) });
    const out = await judge(appointmentWrite(root, "alpha", {}));
    assert.equal(out.verdict, "approve");
  });
  for (const [target, code] of [["beta", "path-outside-boundary"], ["rapporteur", "path-outside-boundary"]] as const) {
    await withRoot(async (root) => {
      seedTeamPlan(root, ["alpha"]);
      seedAppointmentLedger(root, ["alpha"]);
      const { judge } = makeJudge({ report: readThenReport(["docs/scheduling/flow-a-team-v1.md"], report(target)) });
      const out = await judge(appointmentWrite(root, target, {}));
      assert.equal(out.verdict, "manual");
      assert.equal(out.reasonCode, code);
    });
  }
});

test("schedule-write：路径必须匹配 flowId → approve；不匹配 manual", async () => {
  const scheduleWrite = (root: string, path: string): GovernanceJudgeRequest => request({
    projectRoot: root,
    group: "approval",
    cardKind: "schedule-write",
    roleId: "convener",
    card: {
      kind: "confirm",
      title: "写入流程单",
      preview: writePreview([path]),
      cardKind: "schedule-write",
      flowId: "flow-a",
    },
    paths: [path],
    pathProbes: [{ path, allowed: true }],
    allowedPathRoots: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
    forbiddenPaths: [".ans/", "角色卡/", "docs/proposals/", "docs/nominations/"],
    artifacts: { flowPath: "docs/flows/flow-a.md" },
  });
  const report = (path: string) => ({
    verdict: "approve",
    reason: "流程步骤与已接受提案一致。",
    evidence: ["docs/flows/flow-a.md"],
    confirmed: true,
    pathDecisions: [{ path, ok: true }],
  });
  await withRoot(async (root) => {
    writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
    const { judge } = makeJudge({ report: readThenReport(["docs/flows/flow-a.md"], report("docs/flows/flow-a.md")) });
    const out = await judge(scheduleWrite(root, "docs/flows/flow-a.md"));
    assert.equal(out.verdict, "approve");
  });
  await withRoot(async (root) => {
    writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
    const { judge } = makeJudge({ report: readThenReport(["docs/flows/flow-a.md"], report("docs/flows/flow-b.md")) });
    const out = await judge(scheduleWrite(root, "docs/flows/flow-b.md"));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "path-outside-boundary");
  });
});

test("schedule-write：首次新建 flow 不要求旧物证；已存在须读旧版；空 preview manual", async () => {
  const target = "docs/flows/flow-a.md";
  const scheduleWrite = (root: string, preview = `将写入以下文件：\n- ${target}\n\n正文：步骤 s1/s2。`): GovernanceJudgeRequest => request({
    projectRoot: root,
    group: "approval",
    cardKind: "schedule-write",
    roleId: "convener",
    card: {
      kind: "confirm",
      title: "写入流程单",
      preview,
      cardKind: "schedule-write",
      flowId: "flow-a",
    },
    paths: [target],
    pathProbes: [{ path: target, allowed: true }],
    allowedPathRoots: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
    forbiddenPaths: [".ans/", "角色卡/", "docs/proposals/", "docs/nominations/"],
    artifacts: undefined,
  });
  const report = {
    verdict: "approve",
    reason: "流程步骤与已接受提案一致。",
    evidence: [target],
    confirmed: true,
    pathDecisions: [{ path: target, ok: true }],
  };

  await withRoot(async (root) => {
    // 1) 首次新建：目标不存在、无旧物证 ⇒ preview 正文足够即可代批。
    const { judge } = makeJudge({ report });
    const out = await judge(scheduleWrite(root));
    assert.equal(out.verdict, "approve", "新建流程单不得因旧物证缺失回落");
  });

  await withRoot(async (root) => {
    // 2) 已存在：必须读取旧版；不读 ⇒ artifact-not-read，读后 approve。
    writeFile(root, target, "# 旧流程单\n\n| 步骤 | 角色 | 状态 |\n| --- | --- | --- |\n| s1 | 实现者 | done |\n");
    const { judge } = makeJudge({ report });
    const blocked = await judge(scheduleWrite(root));
    assert.equal(blocked.verdict, "manual");
    assert.equal(blocked.reasonCode, "artifact-not-read");
    const { judge: judge2 } = makeJudge({ report: readThenReport([target], report) });
    const out = await judge2(scheduleWrite(root));
    assert.equal(out.verdict, "approve");
  });

  await withRoot(async (root) => {
    // 3) 新建目标 + 空 preview ⇒ manual，且不调用模型。
    const { judge, seen } = makeJudge({ report });
    const out = await judge(scheduleWrite(root, ""));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "insufficient-evidence");
    assert.equal(seen.binds, 0);
  });
});



// —————————————————————— ⑤ 驱动边界 ——————————————————————

test("支持矩阵：demo → manual/unsupported-engine；不支持的 request.runtime 跟随 opts", async () => {
  assert.deepEqual([...GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES].sort(), ["claude", "codex", "pi"]);
  const { judge } = makeJudge({ report: APPROVE_PROPOSAL }, { runtime: "demo" });
  const out = await judge(request({ runtime: "demo" }));
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "unsupported-engine");
});

test("上下文缺失（flowId/卡片）→ manual/context-missing；group 与卡种不符 → group-mismatch", async () => {
  const { judge } = makeJudge({ report: APPROVE_PROPOSAL });
  for (const bad of [
    request({ flowId: "BAD FLOW" }),
    request({ card: { kind: "choice", title: "", options: [] } as unknown as CustomerInputRequest }),
  ]) {
    const out = await judge(bad);
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "context-missing");
  }
  const mismatch = await judge(request({ group: "decision", cardKind: "write" }));
  assert.equal(mismatch.verdict, "manual");
  assert.equal(mismatch.reasonCode, "group-mismatch");
});

test("超时/中止/busy：全部 manual，不外抛", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    const req = request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    });
    {
      const { judge } = makeJudge({ settle: false }, { timeoutMs: 30 });
      const out = await judge(req);
      assert.equal(out.verdict, "manual");
      assert.equal(out.reasonCode, "timeout");
      assert.match(out.reason ?? "", /判断超时（>30ms）/);
    }
    {
      const controller = new AbortController();
      controller.abort();
      const { judge } = makeJudge({ report: APPROVE_PROPOSAL });
      const out = await judge(req, controller.signal);
      assert.equal(out.reasonCode, "aborted");
    }
    {
      const { judge, seen } = makeJudge({ settle: false });
      const first = judge(req);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = await judge({ ...req, toolCallId: "call-2" });
      assert.equal(second.verdict, "manual");
      assert.equal(second.reasonCode, "unavailable");
      seen.release?.();
      await first;
    }
  });
});

test("超时配置：治理默认 120s、环境变量覆盖、非法回退；shell 120s", async () => {
  assert.equal(DEFAULT_GOVERNANCE_JUDGE_TIMEOUT_MS, 120_000);
  assert.equal(resolveGovernanceJudgeTimeoutMs(undefined, {}), 120_000);
  assert.equal(resolveGovernanceJudgeTimeoutMs(undefined, { [GOVERNANCE_JUDGE_TIMEOUT_ENV]: "1234" }), 1234);
  for (const bad of ["", "0", "-1", "1.5", "abc", "9007199254740993"]) {
    assert.equal(
      resolveGovernanceJudgeTimeoutMs(undefined, { [GOVERNANCE_JUDGE_TIMEOUT_ENV]: bad }),
      120_000,
      `非法环境值 ${JSON.stringify(bad)} 应回默认`,
    );
  }
  assert.equal(resolveGovernanceJudgeTimeoutMs(25, { [GOVERNANCE_JUDGE_TIMEOUT_ENV]: "1234" }), 25, "显式选项优先");
  assert.equal(formatGovernanceJudgeTimeout(120_000), "120s");
  assert.equal(formatGovernanceJudgeTimeout(30), "30ms");
  assert.equal(DEFAULT_SHELL_JUDGE_TIMEOUT_MS, 120_000, "shell judge 默认 120s");

  const previous = process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
  process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV] = "40";
  try {
    await withRoot(async (root) => {
      seedProposal(root);
      seedIntent(root);
      seedIntentLedger(root);
      const { factory } = fakeFactory({ settle: false });
      const judge = createGovernanceJudge({
        project: { ...PROJECT, projectRoot: root },
        runtime: "claude",
        createAdapter: factory,
      });
      const out = await judge(request({
        projectRoot: root,
        artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
      }));
      assert.equal(out.reasonCode, "timeout");
      assert.match(out.reason ?? "", /判断超时（>40ms）/);
    });
  } finally {
    if (previous === undefined) delete process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
    else process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV] = previous;
  }
});

test("模型自报任意 reasonCode 不透传；多次调用最后一次合法生效", async () => {
  await withRoot(async (root) => {
    seedProposal(root);
    seedIntent(root);
    seedIntentLedger(root);
    const req = request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    });
    const { judge } = makeJudge({
      report: (seen: Seen) => {
        seen.capabilities!.governanceJudge!.report({ verdict: "manual", reason: "我拒绝", reasonCode: "customer-said-no" });
        seen.capabilities!.governanceJudge!.stats.readPaths = [INTENT_REL, "docs/proposals/flow-a-v1.md"];
        return APPROVE_PROPOSAL;
      },
    });
    const out = await judge(req);
    assert.equal(out.verdict, "approve", "最后一次合法调用生效");
    const manual = await makeJudge({ report: { verdict: "manual", reason: "证据不足", reasonCode: "customer-said-no" } })
      .judge(req);
    assert.equal(manual.reasonCode, "model-manual", "模型任意 code 不透传");
  });
});

// —————————————————————— ⑥ 事实/推荐集 ——————————————————————

test("facts：从账本快照提炼 proposal/appointment/dispatch/澄清，且有界", () => {
  const entries = [
    { at: "t1", kind: "customer.decision" as const, actorRoleId: "rapporteur", power: "proposal" as const, flowId: "flow-a", decisionKind: "proposal-accept" as const },
    { at: "t2", kind: "customer.decision" as const, actorRoleId: "convener", power: "schedule" as const, flowId: "flow-a", decisionKind: "appointment" as const, targetRoleIds: ["alpha", "beta"], artifactPath: "docs/scheduling/flow-a-team-v1.md" },
    { at: "t3", kind: "dispatch.accepted" as const, actorRoleId: "app", power: "app" as const, flowId: "flow-a", stepId: "s1" },
    { at: "t4", kind: "dispatch.accepted" as const, actorRoleId: "app", power: "app" as const, flowId: "flow-a", stepId: "s1" },
    { at: "t5", kind: "clarification.requested" as const, actorRoleId: "rapporteur", power: "proposal" as const, flowId: "flow-a" },
    { at: "t6", kind: "clarification.requested" as const, actorRoleId: "rapporteur", power: "proposal" as const, flowId: "flow-a" },
    { at: "t7", kind: "intent.handed-off" as const, actorRoleId: "liaison", power: "liaison" as const, flowId: "flow-a", handoffKind: "clarification" as const },
  ];
  const built = buildGovernanceJudgeFacts({ snapshot: { entries, errors: [] }, flowId: "flow-a" });
  assert.equal(built.ledgerErrors, 0);
  assert.equal(built.proposalDecision, "accepted");
  assert.deepEqual(built.appointmentTargetRoleIds, ["alpha", "beta"]);
  assert.equal(built.teamPlanConfirmed, true, "最新 appointment 绑定团队计划物证");
  assert.deepEqual(built.dispatchedStepIds, ["s1"]);
  assert.equal(built.unresolvedClarificationCount, 1);
  assert.deepEqual(built.latestDecisionKinds, ["proposal-accept", "appointment"]);
  assert.ok(Buffer.byteLength(JSON.stringify(built), "utf8") <= 8 * 1024);

  const withError = buildGovernanceJudgeFacts({ snapshot: { entries: [], errors: ["bad line"] }, flowId: "flow-a" });
  assert.equal(withError.ledgerErrors, 1);
});

test("requiredArtifactPaths：逐卡种必需物证与缺失判定（团队计划/标准/报告/变更包）", () => {
  assert.deepEqual(requiredArtifactPaths(request({ cardKind: "proposal", artifacts: { proposalPath: "p.md" } })), { paths: ["p.md"], missing: false });
  assert.equal(requiredArtifactPaths(request({ cardKind: "proposal" })).missing, true);
  assert.equal(requiredArtifactPaths(request({ cardKind: "accepted" as never, artifacts: { proposalPath: "p.md" } })).missing, true);
  const acceptanceArtifacts = {
    proposalPath: "p.md",
    flowPath: "f.md",
    acceptanceCriteriaPath: "docs/acceptance/flow-a-criteria-v1.md",
    acceptanceReportPath: "docs/acceptance/flow-a-report-v1.md",
    changePackagePath: "docs/scheduling/flow-a-change-v1.md",
  };
  assert.deepEqual(
    requiredArtifactPaths(request({ cardKind: "acceptance", artifacts: acceptanceArtifacts })),
    {
      paths: [
        "p.md",
        "f.md",
        "docs/acceptance/flow-a-criteria-v1.md",
        "docs/acceptance/flow-a-report-v1.md",
        "docs/scheduling/flow-a-change-v1.md",
      ],
      missing: false,
    },
  );
  assert.equal(requiredArtifactPaths(request({ cardKind: "acceptance", artifacts: { proposalPath: "p.md" } })).missing, true);
  assert.deepEqual(
    requiredArtifactPaths(request({ cardKind: "appointment", artifacts: { teamPlanPath: "docs/scheduling/flow-a-team-v1.md" } })),
    { paths: ["docs/scheduling/flow-a-team-v1.md"], missing: false },
  );
  assert.equal(requiredArtifactPaths(request({ cardKind: "appointment", artifacts: {} })).missing, true);
  // O4 legacy：团队计划缺席时回落提名文件。
  assert.deepEqual(
    requiredArtifactPaths(request({ cardKind: "appointment", artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" } })),
    { paths: ["docs/nominations/flow-a-v1.md"], missing: false },
  );
  // 团队计划优先于 legacy 提名。
  assert.deepEqual(
    requiredArtifactPaths(request({
      cardKind: "appointment",
      artifacts: { teamPlanPath: "team.md", nominationPath: "nom.md" },
    })),
    { paths: ["team.md"], missing: false },
  );
  assert.deepEqual(
    requiredArtifactPaths(request({ cardKind: "appointment-write", artifacts: { teamPlanPath: "t.md", flowPath: "f.md" } })),
    { paths: ["t.md", "f.md"], missing: false },
  );
});

test("explicitConfirmPaths：显式优先、空数组视为未给、非法项过滤", () => {
  const req = (paths: unknown): CustomerInputRequest => ({
    kind: "confirm",
    title: "写入",
    preview: "",
    paths,
  }) as unknown as CustomerInputRequest;
  assert.deepEqual(explicitConfirmPaths(req(["docs/proposals/a.md", "docs/contracts/b.md", "docs/proposals/a.md"])), [
    "docs/proposals/a.md",
    "docs/contracts/b.md",
  ]);
  assert.equal(explicitConfirmPaths(req([])), undefined, "空数组视为未给");
  assert.deepEqual(explicitConfirmPaths(req(["", "../x", "/abs", 42])), [], "非空但全非法 ⇒ 不透传、不回退猜");
  assert.equal(
    explicitConfirmPaths({ kind: "choice", title: "选", options: [{ id: "a", label: "A" }], paths: ["docs/a.md"] } as unknown as CustomerInputRequest),
    undefined,
    "choice 卡不消费 paths",
  );
});

test("confirmed-write issuer：显式 paths 优先于 preview 散文；无 paths/空数组回退旧行为", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/.keep");
    writeFile(root, "docs/contracts/.keep");
    const boundary: BoundarySection1 = {
      entries: [
        { root: "project", path: "docs/proposals/", kind: "directory", purpose: "提案" },
        { root: "project", path: "docs/contracts/", kind: "directory", purpose: "契约" },
      ],
      boundarySource: "test",
      acceptance: { accepted: true, source: "test" },
    };
    const makeIssuer = (): ((req: CustomerInputRequest, out: { outcome: "answered"; value: { confirmed: true } }) => string[]) => {
      const issued = new Set<string>();
      const issue = createConfirmedWriteIssuer({
        boundary,
        conditions: [],
        ctx: { skillRoot: root, projectRoot: root },
        issued,
      });
      return (req, out) => issue(req, out);
    };
    const confirm = { outcome: "answered" as const, value: { confirmed: true as const } };
    const explicitReq = {
      kind: "confirm",
      title: "写入",
      preview: "说明：不会修改 docs/proposals/other-1.md、docs/proposals/other-2.md、docs/contracts/other.md 等 10 个文件。",
      paths: ["docs/proposals/a.md", "docs/contracts/b.md"],
    } as unknown as CustomerInputRequest;
    assert.deepEqual(makeIssuer()(explicitReq, confirm), ["docs/proposals/a.md", "docs/contracts/b.md"]);

    const fallbackReq = {
      kind: "confirm",
      title: "写入",
      preview: "将写入以下文件：\n- docs/proposals/c.md",
    } as unknown as CustomerInputRequest;
    assert.deepEqual(makeIssuer()(fallbackReq, confirm), ["docs/proposals/c.md"], "无 paths 回退 preview");

    const emptyReq = { ...fallbackReq, paths: [] } as unknown as CustomerInputRequest;
    assert.deepEqual(makeIssuer()(emptyReq, confirm), ["docs/proposals/c.md"], "空数组回退 preview");
  });
});

test("declaredWritePathsFromPreview：只认一行一个的声明路径，散文路径不进入", () => {
  const text = [
    "本提案新增文件（不会修改 src/**、test/**，也不改 data/ledger.json）：",
    "将写入以下文件：",
    "- docs/proposals/local-ledger-cli.proposal-v1.md",
    "* `docs/contracts/local-ledger-cli.md`",
    "路径：docs/governance/rapporteur/notes.md",
    "2. docs/flow.md（新建）",
    "将写入 docs/proposals/local-ledger-cli-v1.md",
    "写入路径仅一条：docs/nominations/local-ledger-cli.md",
    "正文里提到 data/ledger.json 和 bin/ledger.js 只是说明。",
  ].join("\n");
  assert.deepEqual(declaredWritePathsFromPreview(text), [
    "docs/proposals/local-ledger-cli.proposal-v1.md",
    "docs/contracts/local-ledger-cli.md",
    "docs/governance/rapporteur/notes.md",
    "docs/flow.md",
    "docs/proposals/local-ledger-cli-v1.md",
    "docs/nominations/local-ledger-cli.md",
  ]);
  assert.deepEqual(declaredWritePathsFromPreview("只改 data/ledger.json 和 src/*"), []);
});

test("parseRecommendedRoleIds：frontmatter/固定行；缺失/歧义/重复 → undefined", () => {
  assert.deepEqual(
    parseRecommendedRoleIds("---\nflowId: flow-a\nrecommended: [alpha, beta]\n---\n"),
    ["alpha", "beta"],
  );
  assert.deepEqual(parseRecommendedRoleIds("# 提名\n\n推荐：alpha、beta\n"), ["alpha", "beta"]);
  assert.deepEqual(
    parseRecommendedRoleIds("---\nrecommended: [alpha, beta]\n---\n推荐：alpha、beta\n"),
    ["alpha", "beta"],
  );
  assert.equal(parseRecommendedRoleIds("---\nrecommended: [alpha, beta]\n---\n推荐：alpha\n"), undefined, "两来源不一致");
  assert.equal(parseRecommendedRoleIds("---\nrecommended: []\n---\n"), undefined);
  assert.equal(parseRecommendedRoleIds("没有推荐集"), undefined);
  assert.equal(parseRecommendedRoleIds("---\nrecommended: [alpha, alpha]\n---\n"), undefined);
});

// —————————————————————— ⑦ run-role：judgeContext + 账本 ——————————————————————

function trioProject(root: string, roleId = "rapporteur"): ProjectConfig {
  mkdirSync(join(root, ".ans"), { recursive: true });
  writeFileSync(join(root, ".ans", "project.json"), JSON.stringify({ governanceModel: "trio" }));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [roleId],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:trio" } },
  };
}

/** trio 项目 + 一个普通项目角色 X（T7「trio 里的项目角色零变化」用）。 */
function trioProjectWithProjectRole(root: string): ProjectConfig {
  const project = trioProject(root);
  writeFile(root, "角色卡/X/role-card.md", "# X\n");
  writeFile(root, "角色卡/X/boundary.yaml", "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: test\n");
  return {
    ...project,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
  };
}

const GOV_BOUNDARY_REL = "角色卡/governance-boundary.yaml";
const GOV_BOUNDARY_YAML = [
  "role: 治理边界",
  "entries:",
  "  - kind: conditional-directory",
  "    path: 角色卡/",
  "    condition: role-restructuring",
  "    root: project",
  "    purpose: 项目治理产物：角色目录",
  "",
].join("\n");

function singleProject(root: string, roleId?: string): ProjectConfig {
  if (roleId === undefined) {
    const dir = join(root, "角色卡", "X");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "role-card.md"), "# X\n");
    writeFileSync(join(dir, "boundary.yaml"), "role: X\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: test\n");
    return {
      projectRoot: root,
      skillRoot: root,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
      governanceModel: "single",
      builtInRoles: [],
    };
  }
  mkdirSync(join(root, "角色卡"), { recursive: true });
  writeFileSync(join(root, GOV_BOUNDARY_REL), GOV_BOUNDARY_YAML);
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "single",
    builtInRoles: [roleId],
    governanceBoundary: { path: GOV_BOUNDARY_REL, acceptance: { accepted: true, source: "test:single" } },
  };
}

function okAdapter(): ReturnType<RuntimeAdapterFactory> {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole() {
      return {
        async prompt() {},
        events() {
          return (async function* () {
            yield { kind: "settled" as const, summary: "完成" };
          })();
        },
        async dispose() {},
      };
    },
  };
}

function capturingFactory(captured: { caps?: AdapterCapabilities; gate?: WriteGate }) {
  return (gate: WriteGate, caps?: AdapterCapabilities): ReturnType<RuntimeAdapterFactory> => {
    captured.caps = caps;
    captured.gate = gate;
    return okAdapter();
  };
}

interface CapturedInput {
  req?: CustomerInputRequest;
  metadata?: CustomerInputMetadata;
}

/** 等 `recordCustomerDecision` 的异步落盘完成（fire-and-forget：先轮询，再 flush）。 */
async function waitForDecision(root: string): Promise<Awaited<ReturnType<typeof readGovernanceLedger>> & {
  decision: NonNullable<Awaited<ReturnType<typeof readGovernanceLedger>>["entries"][number]>;
}> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    await flushGovernanceLedger(root);
    const read = await readGovernanceLedger(root);
    const decision = read.entries.find((entry) => entry.kind === "customer.decision");
    if (decision !== undefined) return { ...read, decision };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("等待账本 customer.decision 超时");
}

const approveWithJudge = (judge: GovernanceJudgeAudit): CustomerInputFn => () => ({
  outcome: "answered",
  value: { selected: ["accept"] },
  operatorId: `judge:${judge.engine}`,
  judge,
});

/** 合法 Flow YAML（schedule-write 确认卡通过 Flow YAML 写前校验用；shape 同 flow-state 测试）。 */
const VALID_FLOW_YAML = [
  "flowId: flow-a",
  "version: 1",
  "qualityTier: production",
  "steps:",
  "  - id: impl",
  "    title: 实现",
  "    owner: backend",
  "    kind: dispatch",
  "    status: pending",
  "  - id: acceptance",
  "    title: 验收",
  "    owner: verifier",
  "    kind: acceptance",
  "    status: pending",
  "",
].join("\n");

/**
 * 断言一次「呈现前拒绝」（2026-10-22 无效治理卡守卫）：declined + `notPresented:true`，
 * 原因含给定片段且不重复运行时核心统一追加的结尾句；拒绝后不写客户决定账本。
 */
async function assertNotPresented(
  root: string,
  out: CustomerInputOutcome | null | undefined,
  patterns: readonly RegExp[],
): Promise<void> {
  assert.equal(out?.outcome, "declined");
  assert.equal(
    (out as { notPresented?: unknown }).notPresented,
    true,
    "必须以 notPresented:true 表示卡片从未呈现",
  );
  const reason = (out as { reason?: string }).reason ?? "";
  for (const pattern of patterns) assert.match(reason, pattern);
  assert.doesNotMatch(reason, /请补齐后重新调用/, "结尾句由运行时核心工具模板统一追加，编排 reason 不得重复");
  await flushGovernanceLedger(root);
  const ledger = await readGovernanceLedger(root);
  assert.equal(
    ledger.entries.filter((entry) => entry.kind === "customer.decision").length,
    0,
    "被拒绝的卡不得写客户决定账本",
  );
}

test("run-role：trio 判断上下文（paths/pathProbes/写根/禁写/物证/事实）注入 metadata", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md");
    const project = trioProject(root);
    const capturedInput: CapturedInput = {};
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project,
        autoRepin: false,
        customerInput: ((req, metadata) => {
          capturedInput.req = req;
          capturedInput.metadata = metadata;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(captured.caps?.governanceJudge, undefined, "普通角色会话不注入 judge 工具能力");
      assert.ok(captured.caps?.customerInput);
      const req: CustomerInputRequest = {
        kind: "confirm",
        title: "写入提案",
        preview: "将写入以下文件：\n- docs/proposals/flow-a-v2.md\n\n正文……",
        cardKind: "write",
        flowId: "flow-a",
      };
      const out = await captured.caps!.customerInput!(req, { toolCallId: "call-9", turnId: "turn-2" });
      assert.equal(out?.outcome, "declined");
      const context = capturedInput.metadata?.judgeContext;
      assert.ok(context, "trio 卡带 judgeContext");
      assert.equal(context.flowId, "flow-a");
      assert.deepEqual(context.paths, ["docs/proposals/flow-a-v2.md"]);
      assert.deepEqual(context.pathProbes, [{ path: "docs/proposals/flow-a-v2.md", allowed: true }]);
      assert.ok(context.allowedPathRoots?.includes("docs/proposals"));
      assert.ok(context.forbiddenPaths?.includes(".ans/"));
      assert.equal(context.artifacts?.proposalPath, "docs/proposals/flow-a-v1.md");
      assert.equal(context.facts.ledgerErrors, 0);
      assert.equal(context.toolCallId, "call-9");
      assert.equal(context.turnId, "turn-2");
      assert.equal(capturedInput.metadata?.toolCallId, "call-9", "metadata 其余字段原样保留");
    } finally {
      await handle.dispose();
    }
  });
});

// —————————————— 2026-10-22 无效治理卡守卫（设计 N1 严格口径；§7.3 T1–T11） ——————————————

test("run-role：治理 confirm 卡缺 cardKind ⇒ 呈现前拒绝（严格口径；不再机械兜底）", async () => {
  const cases = [
    {
      roleId: "convener" as const,
      paths: ["docs/flows/flow-a.yaml"] as const,
      preview: `## docs/flows/flow-a.yaml\n${VALID_FLOW_YAML}`,
    },
    {
      roleId: "convener" as const,
      paths: ["docs/governance/convener/notes.md"] as const,
      preview: "## docs/governance/convener/notes.md\n# 治理记录\n",
    },
    {
      roleId: "rapporteur" as const,
      paths: ["docs/proposals/flow-a-v2.md"] as const,
      preview: "## docs/proposals/flow-a-v2.md\n# 提案 v2\n",
    },
    {
      roleId: "nominator" as const,
      paths: ["角色卡/alpha/role-card.md"] as const,
      preview: "## 角色卡/alpha/role-card.md\n# alpha\n",
    },
  ];

  for (const testCase of cases) {
    await withRoot(async (root) => {
      const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
      let rawCalls = 0;
      const handle = await openRoleSession(
        {
          roleId: testCase.roleId,
          project: trioProject(root, testCase.roleId),
          autoRepin: false,
          customerInput: (() => {
            rawCalls += 1;
            return { outcome: "declined" as const };
          }) as CustomerInputFn,
        },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        const out = await captured.caps!.customerInput!(
          {
            kind: "confirm",
            title: "确认写入",
            preview: testCase.preview,
            paths: [...testCase.paths],
            flowId: "flow-a",
          },
          { toolCallId: "call-missing-card-kind", turnId: "turn-missing-card-kind" },
        );
        assert.equal(rawCalls, 0, `${testCase.roleId} 缺 cardKind 不得调用客户通道`);
        await assertNotPresented(root, out, [
          /缺少 cardKind/,
          /治理角色的 request_confirmation 必须同时携带归属键（flowId \/ intentId \/ taskId 至少一个）与 cardKind/,
          /本角色允许：/,
          /本次未发行任何写入路径、未写入账本/,
        ]);
      } finally {
        await handle.dispose();
      }
    });
  }
});

test("run-role：治理 confirm 卡缺 flowId / 非法 flowId ⇒ 呈现前拒绝（T1/T3/T9）", async () => {
  const cases: ReadonlyArray<{ label: string; cardKind?: "write"; flowId?: string }> = [
    { label: "T1 缺 flowId", cardKind: "write" },
    { label: "T3 两者都缺" },
    { label: "T9 大写 flowId", cardKind: "write", flowId: "Flow-A" },
    { label: "T9 空串 flowId", cardKind: "write", flowId: "" },
    { label: "T9 单字符 flowId", cardKind: "write", flowId: "a" },
    { label: "T9 尾连字符 flow-", cardKind: "write", flowId: "flow-" },
    { label: "T9 尾连字符 a-", cardKind: "write", flowId: "a-" },
  ];

  for (const testCase of cases) {
    await withRoot(async (root) => {
      const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
      let rawCalls = 0;
      const handle = await openRoleSession(
        {
          roleId: "convener",
          project: trioProject(root, "convener"),
          autoRepin: false,
          customerInput: (() => {
            rawCalls += 1;
            return { outcome: "declined" as const };
          }) as CustomerInputFn,
        },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        const out = await captured.caps!.customerInput!(
          {
            kind: "confirm",
            title: "确认写入",
            preview: "## docs/governance/convener/notes.md\n# 治理记录\n",
            paths: ["docs/governance/convener/notes.md"],
            ...(testCase.cardKind !== undefined ? { cardKind: testCase.cardKind } : {}),
            ...(testCase.flowId !== undefined ? { flowId: testCase.flowId } : {}),
          },
          { toolCallId: `call-${testCase.label}` },
        );
        assert.equal(rawCalls, 0, `${testCase.label}：不得调用客户通道`);
        const patterns: RegExp[] = [/缺少合法的 flowId/, /本角色允许：write \/ schedule-write/, /0,62/];
        if (testCase.cardKind === undefined) patterns.push(/缺少 cardKind/);
        await assertNotPresented(root, out, patterns);
      } finally {
        await handle.dispose();
      }
    });
  }
});

test("run-role：确认卡声明 docs/flows/flow-.yaml ⇒ 宽捕获后显式拒绝该卡（S3/T11，不静默跳过 YAML 校验）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root, "convener"),
        autoRepin: false,
        customerInput: (() => {
          rawCalls += 1;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      // 卡片 flowId 合法（否则会先被 flowId 守卫拒绝）；非法候选只在声明路径的文件名上。
      // YAML 内容与文件名「自洽」（flowId: flow-）——旧路径正则会把该卡当作非目标而跳过校验。
      const yaml = VALID_FLOW_YAML.replace(/flowId: flow-a/g, "flowId: flow-");
      const out = await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "写入流程",
          cardKind: "schedule-write",
          flowId: "flow-a",
          paths: ["docs/flows/flow-.yaml"],
          preview: `## docs/flows/flow-.yaml\n${yaml}`,
        },
        { toolCallId: "call-flow-yaml-invalid-name" },
      );
      assert.equal(rawCalls, 0, "非法 flowId 文件名不得触达客户通道");
      assert.equal(out?.outcome, "declined");
      assert.equal(
        (out as { notPresented?: unknown }).notPresented,
        undefined,
        "YAML 写前闸沿用既有 declined 形状（notPresented 属 N1 守卫；O1 未授权，不扩张）",
      );
      const reason = (out as { reason?: string }).reason ?? "";
      for (const pattern of [
        /流程 YAML 未通过校验/,
        /docs\/flows\/flow-\.yaml/,
        /文件名 flowId「flow-」不是合法 slug/,
        /0,62/,
        /不得跳过 YAML 校验/,
      ]) {
        assert.match(reason, pattern);
      }
      await flushGovernanceLedger(root);
      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "customer.decision").length,
        0,
        "被拒的卡不得写客户决定账本",
      );
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：四个可发 confirm 角色的合法卡全部到达通道并生成 judgeContext（T4）", async () => {
  const cases: ReadonlyArray<{
    roleId: "rapporteur" | "nominator" | "convener" | "verifier";
    cardKind: "write" | "appointment-write" | "schedule-write";
    paths: readonly string[];
    preview: string;
  }> = [
    {
      roleId: "rapporteur",
      cardKind: "write",
      paths: ["docs/proposals/flow-a-v2.md"],
      preview: "## docs/proposals/flow-a-v2.md\n# 提案 v2\n",
    },
    {
      roleId: "nominator",
      cardKind: "write",
      paths: ["docs/nominations/flow-a-v1.md"],
      preview: "## docs/nominations/flow-a-v1.md\n# 提名 v1\n",
    },
    {
      roleId: "nominator",
      cardKind: "appointment-write",
      paths: ["角色卡/alpha/role-card.md"],
      preview: "## 角色卡/alpha/role-card.md\n# alpha\n",
    },
    {
      roleId: "convener",
      cardKind: "write",
      paths: ["docs/governance/convener/notes.md"],
      preview: "## docs/governance/convener/notes.md\n# 治理记录\n",
    },
    {
      roleId: "convener",
      cardKind: "schedule-write",
      paths: ["docs/flows/flow-a.yaml"],
      preview: `## docs/flows/flow-a.yaml\n${VALID_FLOW_YAML}`,
    },
    {
      roleId: "verifier",
      cardKind: "write",
      paths: ["docs/verification/flow-a.md"],
      preview: "## docs/verification/flow-a.md\n# 验收记录\n",
    },
  ];

  for (const testCase of cases) {
    await withRoot(async (root) => {
      const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
      const seen: CapturedInput = {};
      let rawCalls = 0;
      const handle = await openRoleSession(
        {
          roleId: testCase.roleId,
          project: trioProject(root, testCase.roleId),
          autoRepin: false,
          customerInput: ((req, metadata) => {
            rawCalls += 1;
            seen.req = req;
            seen.metadata = metadata;
            return { outcome: "declined" as const };
          }) as CustomerInputFn,
        },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        const out = await captured.caps!.customerInput!(
          {
            kind: "confirm",
            title: "确认写入",
            preview: testCase.preview,
            paths: [...testCase.paths],
            cardKind: testCase.cardKind,
            flowId: "flow-a",
          },
          { toolCallId: "call-legal-confirm", turnId: "turn-legal-confirm", cardKind: testCase.cardKind, flowId: "flow-a" },
        );
        assert.equal(out?.outcome, "declined");
        assert.equal(
          (out as { notPresented?: unknown }).notPresented,
          undefined,
          "合法卡走既有 declined 形状（不得标 notPresented）",
        );
        assert.equal(rawCalls, 1, `${testCase.roleId}/${testCase.cardKind} 应到达客户通道`);
        assert.equal(seen.req?.cardKind, testCase.cardKind);
        assert.equal(seen.metadata?.cardKind, testCase.cardKind);
        assert.equal(seen.metadata?.judgeContext?.flowId, "flow-a");
        assert.equal(seen.metadata?.judgeContext?.toolCallId, "call-legal-confirm");
      } finally {
        await handle.dispose();
      }
    });
  }
});

test("run-role：liaison 的 confirm 一律拒绝（T5；含直接调用给出 intent-confirm）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project: trioProject(root, "liaison"),
        autoRepin: false,
        customerInput: (() => {
          rawCalls += 1;
          return { outcome: "answered" as const, value: { confirmed: true } };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      // 无 cardKind：缺 cardKind 拒绝（本角色 confirm 允许集为空）。
      const missing = await captured.caps!.customerInput!({
        kind: "confirm",
        title: "写意图",
        preview: "docs/intents/intent-a.md",
        flowId: "flow-a",
      });
      await assertNotPresented(root, missing, [
        /缺少 cardKind/,
        /本角色允许：无/,
        /本次未发行任何写入路径、未写入账本/,
      ]);

      // 显式工具级 cardKind：沿用既有越权文案（O4 未授权 ⇒ 不标 notPresented）。
      const offWhitelist = await captured.caps!.customerInput!({
        kind: "confirm",
        title: "写意图",
        preview: "docs/intents/intent-a.md",
        cardKind: "write",
        flowId: "flow-a",
      });
      assert.equal(offWhitelist?.outcome, "declined");
      const offReason = (offWhitelist as { reason?: string }).reason ?? "";
      assert.match(offReason, /不允许 cardKind=write/);
      assert.match(offReason, /本次未向客户发卡/);
      assert.equal(
        (offWhitelist as { notPresented?: unknown }).notPresented,
        undefined,
        "越权 cardKind 沿用既有 declined 形状",
      );

      // 直接调用包装器给出白名单内的 choice 类 cardKind：仍一律拒绝。
      const choiceKind = await captured.caps!.customerInput!({
        kind: "confirm",
        title: "写意图",
        preview: "docs/intents/intent-a.md",
        cardKind: "intent-confirm",
        flowId: "flow-a",
      });
      await assertNotPresented(root, choiceKind, [
        /liaison 不使用 request_confirmation/,
        /request_choice/,
        /本次未发行任何写入路径、未写入账本/,
      ]);

      assert.equal(rawCalls, 0, "liaison 的任何 confirm 卡都不得调用客户通道");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：rapporteur confirm cardKind=schedule-write ⇒ 越权拒绝（沿用既有文案；T6）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project: trioProject(root, "rapporteur"),
        autoRepin: false,
        customerInput: (() => {
          rawCalls += 1;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "confirm",
        title: "写提案",
        preview: "## docs/proposals/flow-a-v2.md\n# 提案 v2\n",
        paths: ["docs/proposals/flow-a-v2.md"],
        cardKind: "schedule-write",
        flowId: "flow-a",
      });
      assert.equal(out?.outcome, "declined");
      assert.match((out as { reason?: string }).reason ?? "", /不允许 cardKind=schedule-write/);
      assert.equal(rawCalls, 0);
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：trio 项目里的普通角色 confirm（无治理字段）原样到达通道（T7 零变化）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const seen: CapturedInput = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "X",
        project: trioProjectWithProjectRole(root),
        autoRepin: false,
        customerInput: ((req, metadata) => {
          rawCalls += 1;
          seen.req = req;
          seen.metadata = metadata;
          return { outcome: "answered" as const, value: { confirmed: true } };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!(
        { kind: "confirm", title: "写入", preview: "## src/a.ts\n// 正文\n" },
        { toolCallId: "call-project-confirm" },
      );
      assert.equal(out?.outcome, "answered");
      assert.equal(rawCalls, 1, "项目角色 confirm 不得被治理守卫拦截");
      assert.equal(seen.req?.cardKind, undefined, "项目角色卡原样透传");
      assert.equal(seen.req?.flowId, undefined);
      assert.equal(seen.metadata?.judgeContext, undefined, "项目角色不注入 judgeContext");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：无效治理卡被拒后补齐重发 ⇒ 第二张到达通道并生成 judgeContext（T10，无去重）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const seen: CapturedInput = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project: trioProject(root, "rapporteur"),
        autoRepin: false,
        customerInput: ((req, metadata) => {
          rawCalls += 1;
          seen.req = req;
          seen.metadata = metadata;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const first = await captured.caps!.customerInput!({
        kind: "confirm",
        title: "写提案",
        preview: "## docs/proposals/flow-a-v2.md\n# 提案 v2\n",
        paths: ["docs/proposals/flow-a-v2.md"],
        cardKind: "write",
      });
      await assertNotPresented(root, first, [/缺少合法的 flowId/]);
      assert.equal(rawCalls, 0, "第一张无效卡不得到达通道");

      const second = await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "写提案",
          preview: "## docs/proposals/flow-a-v2.md\n# 提案 v2\n",
          paths: ["docs/proposals/flow-a-v2.md"],
          cardKind: "write",
          flowId: "flow-a",
        },
        { toolCallId: "call-retry" },
      );
      assert.equal(second?.outcome, "declined");
      assert.equal((second as { notPresented?: unknown }).notPresented, undefined);
      assert.equal(rawCalls, 1, "补齐后重发必须到达通道（无去重拦截）");
      assert.equal(seen.req?.cardKind, "write");
      assert.equal(seen.metadata?.judgeContext?.flowId, "flow-a");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：无效治理卡被拒后无客户决定账本、写集未发行（T11）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root, "convener"),
        autoRepin: false,
        customerInput: (() => {
          rawCalls += 1;
          return { outcome: "answered" as const, value: { confirmed: true } };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "confirm",
        title: "写工作流",
        preview: "## docs/workflow.md\n# 工作流\n",
        paths: ["docs/workflow.md"],
        cardKind: "write",
      });
      await assertNotPresented(root, out, [/缺少合法的 flowId/]);
      assert.equal(rawCalls, 0);

      // 无效卡被拒 ⇒ 未向客户呈现、未写客户决定账本（下方断言）。
      // 注意（2026-10-25 客户规则）：`docs/workflow.md` 是 Convener Section 1 的**精确文件条目**，
      // 属**写入预授权**的初始写集——gate 直接放行是预授权本身，不是本次发卡的发行结果；因此它不再
      // 能用来证明「未发行」，发行证据以「客户通道零调用 + 账本无 customer.decision」为准。
      const allowed = captured.gate!("docs/workflow.md");
      assert.equal(allowed.allowed, true, "Section 1 内路径属预授权初始写集（无需发卡确认）");
      await flushGovernanceLedger(root);
      const ledger = await readGovernanceLedger(root);
      assert.deepEqual(ledger.entries, [], "无效卡不得写任何客户决定账本");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：治理 choice 卡缺 cardKind ⇒ 按角色兜底并生成 judgeContext（Convener=appointment）", async () => {
  const cases: Array<{
    roleId: "liaison" | "rapporteur" | "convener" | "verifier";
    expected: "intent-confirm" | "proposal" | "appointment" | "acceptance";
    options: Array<{ id: string; label: string }>;
    seed?: (root: string) => void;
  }> = [
    {
      roleId: "liaison" as const,
      expected: "intent-confirm" as const,
      options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修改" }],
    },
    {
      roleId: "rapporteur" as const,
      expected: "proposal" as const,
      options: [{ id: "accept", label: "接受" }, { id: "revise", label: "修改" }],
    },
    {
      roleId: "convener" as const,
      expected: "appointment" as const,
      options: [{ id: "alpha", label: "Alpha" }],
      seed: (root: string) => seedTeamPlan(root, ["alpha"]),
    },
    {
      roleId: "verifier" as const,
      expected: "acceptance" as const,
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
    },
  ];
  for (const testCase of cases) {
    await withRoot(async (root) => {
      testCase.seed?.(root);
      const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
      const seen: CapturedInput = {};
      let rawCalls = 0;
      const handle = await openRoleSession(
        {
          roleId: testCase.roleId,
          project: trioProject(root, testCase.roleId),
          autoRepin: false,
          customerInput: ((req, metadata) => {
            rawCalls += 1;
            seen.req = req;
            seen.metadata = metadata;
            return { outcome: "answered" as const, value: { selected: [testCase.options[0]!.id] } };
          }) as CustomerInputFn,
        },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        const out = await captured.caps!.customerInput!(
          { kind: "choice", title: "选择", options: testCase.options, flowId: "flow-a" },
          { toolCallId: "call-choice", turnId: "turn-choice" },
        );
        assert.equal(out?.outcome, "answered");
        assert.equal(rawCalls, 1);
        assert.equal(seen.req?.cardKind, testCase.expected, `${testCase.roleId} 默认 cardKind`);
        assert.equal(seen.metadata?.cardKind, testCase.expected, `${testCase.roleId} metadata cardKind`);
        assert.ok(seen.metadata?.judgeContext, `${testCase.roleId} 应生成 judgeContext`);
        assert.equal(seen.metadata?.judgeContext?.flowId, "flow-a");
      } finally {
        await handle.dispose();
      }
    });
  }

  // Crew（nominator）不再默认 appointment；项目角色不默认。
  for (const [roleId, projectFactory] of [
    ["nominator", (root: string) => trioProject(root, "nominator")],
    ["X", (root: string) => singleProject(root)],
  ] as const) {
    await withRoot(async (root) => {
      const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
      const seen: CapturedInput = {};
      let rawCalls = 0;
      const handle = await openRoleSession(
        {
          roleId,
          project: projectFactory(root),
          autoRepin: false,
          customerInput: ((req, metadata) => {
            rawCalls += 1;
            seen.req = req;
            seen.metadata = metadata;
            return { outcome: "answered" as const, value: { selected: ["a"] } };
          }) as CustomerInputFn,
        },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        await captured.caps!.customerInput!({
          kind: "choice",
          title: "选择",
          options: [{ id: "a", label: "A" }],
          flowId: "flow-a",
        });
        assert.equal(rawCalls, 1);
        assert.equal(seen.req?.cardKind, undefined, `${roleId} 不兜底 choice cardKind`);
        assert.equal(seen.metadata?.judgeContext, undefined, `${roleId} 不注入 judgeContext`);
      } finally {
        await handle.dispose();
      }
    });
  }
});

test("run-role：Convener appointment 卡前守卫——六项校验失败不触达客户/不写账本；通过则记账 power=schedule", async () => {
  const appointmentCard = (options: Array<{ id: string; label: string }>): CustomerInputRequest => ({
    kind: "choice",
    title: "任命角色",
    options,
    multiple: true,
    cardKind: "appointment",
    flowId: "flow-a",
  });

  const assertGuardRejected = async (
    label: string,
    seed: (root: string) => void,
    expected: RegExp,
    options?: Array<{ id: string; label: string }>,
  ): Promise<void> => {
    const root = mkdtempSync(join(tmpdir(), "ans-appointment-guard-"));
    try {
      seed(root);
      const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
      let rawCalls = 0;
      const handle = await openRoleSession(
        {
          roleId: "convener",
          project: trioProject(root, "convener"),
          autoRepin: false,
          customerInput: (() => {
            rawCalls += 1;
            return { outcome: "answered" as const, value: { selected: ["alpha"] } };
          }) as CustomerInputFn,
        },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        const out = await captured.caps!.customerInput!(
          appointmentCard(options ?? [{ id: "alpha", label: "Alpha" }]),
          { toolCallId: `call-${label}` },
        );
        assert.equal(out?.outcome, "declined", label);
        assert.equal((out as { notPresented?: boolean }).notPresented, true, label);
        assert.match((out as { reason?: string }).reason ?? "", expected, label);
        assert.equal(rawCalls, 0, `${label}：不得触达客户通道`);
        await flushGovernanceLedger(root);
        const ledger = await readGovernanceLedger(root);
        assert.equal(
          ledger.entries.filter((entry) => entry.kind === "customer.decision").length,
          0,
          `${label}：不得写 customer.decision`,
        );
      } finally {
        await handle.dispose();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  // ① 团队计划缺失
  await assertGuardRejected("缺计划", () => {}, /团队计划缺失/);
  // ② 计划 frontmatter flowId 与卡片不一致
  await assertGuardRejected(
    "flowId 不符",
    (root) => writeFile(root, "docs/scheduling/flow-a-team-v1.md", teamPlanMarkdown("flow-b", ["alpha"])),
    /flowId="flow-b".*与卡片 flowId="flow-a" 不一致/,
  );
  // ③ 推荐集为空（块数组/空数组都不静默接受）
  await assertGuardRejected(
    "推荐集为空",
    (root) => seedTeamPlan(root, [], { recommendedLine: "recommended: []" }),
    /缺少唯一的机器可读推荐集/,
  );
  // ④ 推荐集含内置治理角色
  await assertGuardRejected(
    "推荐集含内置角色",
    (root) => seedTeamPlan(root, ["alpha", "convener"]),
    /推荐集含内置治理角色/,
    [{ id: "alpha", label: "Alpha" }, { id: "convener", label: "Convener" }],
  );
  // ⑤ 卡选项未覆盖推荐集
  await assertGuardRejected(
    "选项不一致",
    (root) => seedTeamPlan(root, ["alpha", "beta"]),
    /任命卡选项未覆盖团队计划推荐集（缺：beta）/,
    [{ id: "alpha", label: "Alpha" }],
  );
  // ⑥a 计划缺推荐角色行
  await assertGuardRejected(
    "缺角色行",
    (root) => seedTeamPlan(root, ["alpha"], {
      rows: ["| beta | existing | 实现 beta | 能实现 | src/beta/ | 无 | 组 A | not-applicable |"],
    }),
    /缺少推荐角色 alpha 的角色行/,
  );
  // ⑥b 角色行缺项（职责目标为空）
  await assertGuardRejected(
    "角色行缺项",
    (root) => seedTeamPlan(root, ["alpha"], {
      rows: ["| alpha | existing |  | 能实现 | src/alpha/ | 无 | 组 A | not-applicable |"],
    }),
    /角色 alpha 的「职责目标」为空/,
  );

  // 正例：六项齐全 ⇒ 客户卡到达、判断上下文带团队计划、账本 appointment power=schedule 且绑定计划哈希。
  const root = mkdtempSync(join(tmpdir(), "ans-appointment-guard-"));
  try {
    seedTeamPlan(root, ["alpha"]);
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const seen: CapturedInput = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root, "convener"),
        autoRepin: false,
        customerInput: ((req, metadata) => {
          rawCalls += 1;
          seen.req = req;
          seen.metadata = metadata;
          return { outcome: "answered" as const, value: { selected: ["alpha"] } };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!(
        appointmentCard([{ id: "alpha", label: "Alpha" }]),
        { toolCallId: "call-appointment-ok", turnId: "turn-appointment-ok" },
      );
      assert.equal(out?.outcome, "answered");
      assert.equal(rawCalls, 1);
      assert.equal(seen.req?.cardKind, "appointment");
      assert.equal(seen.metadata?.judgeContext?.artifacts?.teamPlanPath, "docs/scheduling/flow-a-team-v1.md");
      assert.deepEqual(seen.metadata?.judgeContext?.recommendedRoleIds, ["alpha"]);
    } finally {
      await handle.dispose();
    }
    const { decision } = await waitForDecision(root);
    assert.equal(decision.decisionKind, "appointment");
    assert.equal(decision.actorRoleId, "convener");
    assert.equal(decision.power, "schedule", "2026-10-22 第 1 项：appointment power=schedule");
    assert.deepEqual(decision.targetRoleIds, ["alpha"]);
    assert.equal(decision.artifactPath, "docs/scheduling/flow-a-team-v1.md");
    assert.equal(decision.artifactVersion, 1);
    assert.equal(typeof decision.artifactSha256, "string");
    assert.match(decision.artifactSha256!, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-role：Liaison 通用 choice（无 confirm）⇒ declined，不发客户卡/不写账本", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let rawCalls = 0;
    const customerInput: CustomerInputFn = () => {
      rawCalls += 1;
      return { outcome: "answered", value: { selected: ["keep-v1"] } };
    };
    const handle = await openRoleSession(
      { roleId: "liaison", project: trioProject(root, "liaison"), customerInput, autoRepin: false },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "小决定：契约与提案的 3 处措辞差异如何收口",
        options: [
          { id: "keep-v1", label: "保持 v1" },
          { id: "do-v2", label: "做 v2" },
          { id: "lead-decide", label: "Lead 决定" },
        ],
        flowId: "flow-a",
      });
      assert.equal(out?.outcome, "declined");
      const reason = (out as { reason?: string }).reason ?? "";
      assert.match(reason, /内部协调\/工程决策/);
      assert.match(reason, /dispatch_task/);
      assert.match(reason, /flow_step_update/);
      assert.match(reason, /intent-confirm 需求确认/);
      assert.equal(rawCalls, 0, "不得调用客户通道");
      await flushGovernanceLedger(root);
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 0, "不写 customer.decision");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：显式 intent-confirm 缺 confirm ⇒ declined（不发卡）；其他角色通用 choice 零变化", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project: trioProject(root, "liaison"),
        autoRepin: false,
        customerInput: (() => {
          rawCalls += 1;
          return { outcome: "answered" as const, value: { selected: ["revise"] } };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "确认需求",
        options: [{ id: "revise", label: "修改" }],
        cardKind: "intent-confirm",
        flowId: "flow-a",
      });
      assert.equal(out?.outcome, "declined");
      assert.match((out as { reason?: string }).reason ?? "", /intent-confirm 必须有 confirm\/revise 选项/);
      assert.equal(rawCalls, 0);
    } finally {
      await handle.dispose();
    }
  });

  // 其他角色的通用 choice（无 cardKind、无匹配选项）保持旧行为：直接到客户通道，不注入 judgeContext。
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const seen: CapturedInput = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project: trioProject(root, "rapporteur"),
        autoRepin: false,
        customerInput: ((req, metadata) => {
          rawCalls += 1;
          seen.req = req;
          seen.metadata = metadata;
          return { outcome: "answered" as const, value: { selected: ["x"] } };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "普通选择",
        options: [{ id: "x", label: "X" }],
        flowId: "flow-a",
      });
      assert.equal(out?.outcome, "answered");
      assert.equal(rawCalls, 1);
      assert.equal(seen.req?.cardKind, undefined);
      assert.equal(seen.metadata?.judgeContext, undefined);
    } finally {
      await handle.dispose();
    }
  });
});

test("intent-confirm：decision 组可代批 confirm；选 revise/缺 confirm 回落 manual", () => {
  assert.equal(governanceCardGroup("intent-confirm"), "decision", "2026-10-20 客户要求：需求确认纳入 decision 组");
  const request = (options: Array<{ id: string; label: string }>) => ({
    group: "decision" as const,
    cardKind: "intent-confirm" as const,
    roleId: "liaison",
    projectRoot: PROJECT.projectRoot,
    runtime: "claude" as const,
    governanceModel: "trio" as const,
    flowId: "flow-a",
    card: {
      kind: "choice" as const,
      title: "确认需求",
      options,
      cardKind: "intent-confirm" as const,
      flowId: "flow-a",
    },
    facts: facts(),
    at: new Date().toISOString(),
  });

  const approve = evaluateGovernanceJudgeVerdict({
    request: request([{ id: "confirm", label: "确认" }, { id: "revise", label: "修改" }]),
    verdict: {
      verdict: "approve",
      reason: "卡片意图与客户当前要求一致。",
      evidence: ["card:确认需求"],
      selected: ["confirm"],
    },
    engine: "claude",
  });
  assert.equal(approve.verdict, "approve");
  assert.deepEqual(approve.value?.selected, ["confirm"]);

  const revise = evaluateGovernanceJudgeVerdict({
    request: request([{ id: "confirm", label: "确认" }, { id: "revise", label: "修改" }]),
    verdict: { verdict: "approve", reason: "有偏离。", evidence: ["card:确认需求"], selected: ["revise"] },
    engine: "claude",
  });
  assert.equal(revise.verdict, "manual");
  assert.equal(revise.reasonCode, "not-recommended");

  const missingConfirm = evaluateGovernanceJudgeVerdict({
    request: request([{ id: "revise", label: "修改" }]),
    verdict: { verdict: "approve", reason: "有偏离。", evidence: ["card:确认需求"], selected: ["confirm"] },
    engine: "claude",
  });
  assert.equal(missingConfirm.verdict, "manual");
  assert.equal(missingConfirm.reasonCode, "insufficient-evidence");
});

test("run-role：显式越权 cardKind 仍拒绝（沿用既有文案；confirm 不弹卡）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root, "convener"),
        autoRepin: false,
        customerInput: (() => {
          rawCalls += 1;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "confirm",
        title: "确认写入",
        preview: "## docs/flows/flow-a.yaml\nflowId: flow-a\n",
        paths: ["docs/flows/flow-a.yaml"],
        cardKind: "proposal",
        flowId: "flow-a",
      });
      assert.equal(out?.outcome, "declined");
      assert.match((out as { reason?: string }).reason ?? "", /不允许 cardKind=proposal/);
      assert.equal(rawCalls, 0, "显式非法 cardKind 不得调用客户通道");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：Convener 任命形状兜底后卡前守卫拒绝（无团队计划；不触达客户/不写账本）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const seen: CapturedInput = {};
    let rawCalls = 0;
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root, "convener"),
        autoRepin: false,
        customerInput: ((req, metadata) => {
          rawCalls += 1;
          seen.req = req;
          seen.metadata = metadata;
          return { outcome: "answered" as const, value: { selected: ["a"] } };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!({
        kind: "choice",
        title: "选择",
        options: [{ id: "a", label: "A" }],
        flowId: "flow-a",
      });
      assert.equal(out?.outcome, "declined");
      assert.equal((out as { notPresented?: boolean }).notPresented, true);
      assert.match((out as { reason?: string }).reason ?? "", /团队计划缺失/);
      assert.equal(rawCalls, 0, "不得触达客户通道");
      assert.equal(seen.metadata?.judgeContext, undefined, "不得计算 judgeContext");
      await flushGovernanceLedger(root);
      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "customer.decision").length,
        0,
        "不得写 customer.decision",
      );
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：flow 能力注入——项目角色有 get/update（P1-7 owner 交付）、无 supersede；内置治理角色有 get/update/supersede", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      { roleId: "X", project: singleProject(root), autoRepin: false },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(typeof captured.caps?.flowGet, "function", "项目角色有 flowGet");
      assert.equal(
        typeof captured.caps?.flowStepUpdate,
        "function",
        "项目角色有 flowStepUpdate（2026-10-24 P1-7：owner 用既有工具标自己的 delivered）",
      );
      assert.equal(captured.caps?.flowStepSupersede, undefined, "项目角色仍不给 supersede（仅工作流管理者）");
    } finally {
      await handle.dispose();
    }
  });

  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      { roleId: "convener", project: trioProject(root, "convener"), autoRepin: false },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.equal(typeof captured.caps?.flowGet, "function", "内置治理角色有 flowGet");
      assert.equal(typeof captured.caps?.flowStepUpdate, "function", "内置治理角色有 flowStepUpdate");
      assert.equal(typeof captured.caps?.flowStepSupersede, "function", "内置治理角色有 flowStepSupersede");
    } finally {
      await handle.dispose();
    }
  });
});

test("governanceDispatchActionFor：Liaison→Convener=coordinate；其余=dispatch", () => {
  assert.equal(governanceDispatchActionFor("liaison", "convener"), "coordinate");
  assert.equal(governanceDispatchActionFor("liaison", "backend"), "dispatch");
  assert.equal(governanceDispatchActionFor("convener", "backend"), "dispatch");
  assert.equal(governanceDispatchActionFor("backend", "convener"), "dispatch");
});

test("run-role：Liaison→Convener 走 coordinate（提案接受后；不要求任命/步骤）；Liaison→项目角色仍 dispatch", async () => {
  await withRoot(async (root) => {
    // 2026-10-24 闸门 1：coordinate 要求该 flow 的最新提案决定为 accept/accept-quick（不再空账本放行）。
    writeFile(root, ".ans/governance/ledger.jsonl", JSON.stringify({
      at: "2026-10-24T00:00:00.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    }) + "\n");
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let forwarded = 0;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project: trioProject(root, "liaison"),
        autoRepin: false,
        dispatchTask: (payload) => {
          forwarded += 1;
          return { ok: true, message: `forwarded:${payload.roleId}` };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const coordinate = await captured.caps!.dispatchTask!(
        { roleId: "convener", task: "协调：请确认流程步骤", flowId: "flow-a", stepId: "delivery-backend" },
        undefined,
      );
      assert.deepEqual(coordinate, { ok: true, message: "forwarded:convener" });
      assert.equal(forwarded, 1, "coordinate 应放行到前端路由");

      const dispatch = await captured.caps!.dispatchTask!(
        { roleId: "backend", task: "实现", flowId: "flow-a", stepId: "impl" },
        undefined,
      );
      assert.equal(dispatch?.ok, false);
      assert.match(dispatch?.message ?? "", /派发被治理门禁拒绝/);
      assert.equal(forwarded, 1, "Liaison→项目角色不是 coordinate，dispatch 门仍拒（来源只允许 Steward）");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：Liaison→Convener 在提案未接受前被 coordinate 门拒绝（2026-10-24 闸门 1）", async () => {
  await withRoot(async (root) => {
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    let forwarded = 0;
    const handle = await openRoleSession(
      {
        roleId: "liaison",
        project: trioProject(root, "liaison"),
        autoRepin: false,
        dispatchTask: () => {
          forwarded += 1;
          return { ok: true, message: "forwarded" };
        },
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const coordinate = await captured.caps!.dispatchTask!(
        { roleId: "convener", task: "协调：请确认流程步骤", flowId: "flow-a" },
        undefined,
      );
      assert.equal(coordinate?.ok, false, "空账本（无提案接受）不得协调");
      assert.match(coordinate?.message ?? "", /proposal-not-accepted|提案/);
      assert.equal(forwarded, 0, "拒投不进入前端路由");
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：物证容忍 `<flowId>.proposal-vN` / `.nomination-vN` 并取最新", async () => {
  // 1) 两种提案命名共存：取版本号最高的（跨命名比较）。
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/local-ledger-cli-v1.md");
    writeFile(root, "docs/proposals/local-ledger-cli.proposal-v2.md");
    const capturedInput: CapturedInput = {};
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project: trioProject(root),
        autoRepin: false,
        customerInput: ((_req, metadata) => {
          capturedInput.metadata = metadata;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      await captured.caps!.customerInput!(
        {
          kind: "choice",
          title: "接受提案",
          options: [{ id: "accept", label: "接受" }],
          cardKind: "proposal",
          flowId: "local-ledger-cli",
        },
        { toolCallId: "call-name" },
      );
      assert.equal(
        capturedInput.metadata?.judgeContext?.artifacts?.proposalPath,
        "docs/proposals/local-ledger-cli.proposal-v2.md",
      );
    } finally {
      await handle.dispose();
    }
  });

  // 2) 只有传统 `<flowId>-vN.md` 命名也能解析。
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/local-ledger-cli-v1.md");
    const capturedInput: CapturedInput = {};
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project: trioProject(root),
        autoRepin: false,
        customerInput: ((_req, metadata) => {
          capturedInput.metadata = metadata;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      await captured.caps!.customerInput!(
        {
          kind: "choice",
          title: "接受提案",
          options: [{ id: "accept", label: "接受" }],
          cardKind: "proposal",
          flowId: "local-ledger-cli",
        },
        { toolCallId: "call-name-2" },
      );
      assert.equal(
        capturedInput.metadata?.judgeContext?.artifacts?.proposalPath,
        "docs/proposals/local-ledger-cli-v1.md",
      );
    } finally {
      await handle.dispose();
    }
  });

  // 3) 团队计划 `-team-vN.md` 取最新版本（版本扫描扩展），并从中读取推荐集。
  await withRoot(async (root) => {
    seedTeamPlan(root, ["alpha"], { version: 1 });
    seedTeamPlan(root, ["alpha", "beta"], { version: 3 });
    const capturedInput: CapturedInput = {};
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root, "convener"),
        autoRepin: false,
        customerInput: ((_req, metadata) => {
          capturedInput.metadata = metadata;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      await captured.caps!.customerInput!(
        {
          kind: "choice",
          title: "任命角色",
          options: [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }],
          multiple: true,
          cardKind: "appointment",
          flowId: "flow-a",
        },
        { toolCallId: "call-name-3" },
      );
      assert.equal(
        capturedInput.metadata?.judgeContext?.artifacts?.teamPlanPath,
        "docs/scheduling/flow-a-team-v3.md",
      );
      assert.deepEqual(capturedInput.metadata?.judgeContext?.recommendedRoleIds, ["alpha", "beta"]);
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：pathProbes 只取 preview 声明路径，散文路径不进 probe", async () => {
  await withRoot(async (root) => {
    const capturedInput: CapturedInput = {};
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project: trioProject(root, "convener"),
        autoRepin: false,
        customerInput: ((_req, metadata) => {
          capturedInput.metadata = metadata;
          return { outcome: "declined" as const };
        }) as CustomerInputFn,
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const targetA = "docs/scheduling/local-ledger-cli.proposal-v1.md";
      const targetB = "docs/scheduling/local-ledger-cli.contract.md";
      await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "新建本地账本 CLI",
          preview:
            `将写入以下文件：\n- ${targetA}\n- ${targetB}\n\n` +
            "说明：不会修改 src/**、test/**，也不改 data/ledger.json、bin/ledger.js。\n\n" +
            `## ${targetA}\n提案正文（测试用）。\n\n## ${targetB}\n契约正文（测试用）。`,
          cardKind: "schedule-write",
          flowId: "local-ledger-cli",
        },
        { toolCallId: "call-paths" },
      );
      const context = capturedInput.metadata?.judgeContext;
      assert.deepEqual(context?.paths, [targetA, targetB], "散文路径不得进入候选");
      assert.equal(context?.pathProbes?.length, 2);
      assert.ok(context?.pathProbes?.every((probe) => probe.allowed === true));

      // 显式 paths 优先：预览散文提到 10 个其他文件也不影响。
      await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "新建本地账本 CLI",
          preview:
            "说明：不会修改 docs/proposals/other-1.md、docs/proposals/other-2.md、docs/contracts/other-3.md、" +
            "src/**、test/**、data/ledger.json 等 10 个文件。\n\n" +
            `## ${targetA}\n提案正文（测试用）。\n\n## ${targetB}\n契约正文（测试用）。`,
          cardKind: "schedule-write",
          flowId: "local-ledger-cli",
          paths: [targetA, targetB],
        } as unknown as CustomerInputRequest,
        { toolCallId: "call-paths-explicit" },
      );
      assert.deepEqual(capturedInput.metadata?.judgeContext?.paths, [targetA, targetB], "显式 paths 优先");
      assert.equal(capturedInput.metadata?.judgeContext?.pathProbes?.length, 2);

      // 空数组视为未给 ⇒ 回退 preview 声明（旧行为）。
      await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "新建本地账本 CLI",
          preview:
            `将写入以下文件：\n- ${targetA}\n- ${targetB}\n\n` +
            `## ${targetA}\n提案正文（测试用）。\n\n## ${targetB}\n契约正文（测试用）。`,
          cardKind: "schedule-write",
          flowId: "local-ledger-cli",
          paths: [],
        } as unknown as CustomerInputRequest,
        { toolCallId: "call-paths-empty" },
      );
      assert.deepEqual(capturedInput.metadata?.judgeContext?.paths, [targetA, targetB], "空数组回退 preview");

      // 声明了越界路径 ⇒ 该 probe 必须 allowed:false（driver 会整卡回落）。
      await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "新建本地账本 CLI",
          preview:
            `将写入以下文件：\n- ${targetA}\n- src/evil.ts\n\n` +
            `## ${targetA}\n提案正文（测试用）。\n\n## src/evil.ts\n// 越界（测试用）。`,
          cardKind: "schedule-write",
          flowId: "local-ledger-cli",
        },
        { toolCallId: "call-paths-2" },
      );
      const probes = capturedInput.metadata?.judgeContext?.pathProbes ?? [];
      assert.equal(probes.find((probe) => probe.path === "src/evil.ts")?.allowed, false);
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role：single/su 与项目角色不计算 judgeContext（能力矩阵不变）", async () => {
  for (const setup of [
    { project: (root: string) => singleProject(root, "su"), roleId: "su" },
    { project: (root: string) => singleProject(root), roleId: "X" },
  ]) {
    await withRoot(async (root) => {
      const capturedInput: CapturedInput = {};
      const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
      const handle = await openRoleSession(
        {
          roleId: setup.roleId,
          project: setup.project(root),
          autoRepin: false,
          customerInput: ((req, metadata) => {
            capturedInput.req = req;
            capturedInput.metadata = metadata;
            return { outcome: "declined" as const };
          }) as CustomerInputFn,
        },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        assert.ok(captured.caps?.customerInput);
        await captured.caps!.customerInput!(
          { kind: "confirm", title: "写入", preview: "docs/proposals/flow-a-v1.md", cardKind: "write", flowId: "flow-a" },
          { toolCallId: "call-1" },
        );
        assert.equal(capturedInput.metadata?.judgeContext, undefined, `${setup.roleId} 不注入 judgeContext`);
        assert.equal(captured.caps?.governanceJudge, undefined);

        // 2026-10-20：非治理角色/非 trio 的 confirm 卡缺 cardKind ⇒ 不兜底（零变化）。
        await captured.caps!.customerInput!(
          {
            kind: "confirm",
            title: "写入",
            preview: "## docs/proposals/flow-a-v1.md\n# 内容\n",
            paths: ["docs/proposals/flow-a-v1.md"],
            flowId: "flow-a",
          },
          { toolCallId: "call-2" },
        );
        assert.equal(capturedInput.req?.cardKind, undefined, `${setup.roleId} 不兜底 cardKind`);
        assert.equal(capturedInput.metadata?.judgeContext, undefined, `${setup.roleId} 兜底后仍不注入 judgeContext`);
      } finally {
        await handle.dispose();
      }
    });
  }
});

test("账本：judge 代批写 decisionEvidence.kind=judge + group；actorRoleId/power 不变", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md");
    const project = trioProject(root);
    const audit: GovernanceJudgeAudit = {
      group: "decision",
      cardKind: "proposal",
      engine: "claude",
      model: "test-model",
      reasonCode: "sufficient",
      reason: "提案证据充分。",
      evidence: ["docs/proposals/flow-a-v1.md"],
      selected: ["accept"],
      durationMs: 12,
      readCalls: 1,
      readBytes: 100,
    };
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
        project,
        autoRepin: false,
        customerInput: approveWithJudge(audit),
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const out = await captured.caps!.customerInput!(
        {
          kind: "choice",
          title: "接受提案",
          options: [{ id: "accept", label: "接受" }, { id: "revise", label: "修改" }],
          cardKind: "proposal",
          flowId: "flow-a",
        },
        { toolCallId: "call-judge", turnId: "turn-judge" },
      );
      assert.equal(out?.outcome, "answered");
    } finally {
      await handle.dispose();
    }
    const { errors, decision, entries } = await waitForDecision(root);
    assert.deepEqual(errors, []);
    assert.equal(decision.actorRoleId, "rapporteur", "actorRoleId 不伪装成 judge");
    assert.equal(decision.power, "proposal", "power 照旧");
    assert.equal(decision.decisionKind, "proposal-accept");
    assert.equal(decision.customerDecision, "accepted");
    assert.equal(decision.decisionEvidence?.kind, "judge");
    assert.equal(decision.decisionEvidence?.toolCallId, "call-judge");
    assert.equal(decision.decisionEvidence?.turnId, "turn-judge");
    assert.equal(decision.decisionEvidence?.judge?.group, "decision");
    assert.equal(decision.decisionEvidence?.judge?.reasonCode, "sufficient");
    assert.deepEqual(decision.decisionEvidence?.judge?.selected, ["accept"]);
    const retry = entries.filter((entry) => entry.kind === "customer.decision");
    assert.equal(retry.length, 1, "同一请求只写一次决定");
  });
});

test("账本：judge.group 与卡种交叉校验——不翻转决定、不改成 customer-input", async () => {
  await withRoot(async (root) => {
    const project = trioProject(root, "convener");
    const audit: GovernanceJudgeAudit = {
      group: "decision",
      cardKind: "schedule-write",
      engine: "claude",
      reasonCode: "sufficient",
    };
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "convener",
        project,
        autoRepin: false,
        customerInput: () => ({
          outcome: "answered",
          value: { confirmed: true },
          judge: audit,
        }),
      },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "写入",
          preview: "docs/proposals/flow-a-v1.md\n\n## docs/proposals/flow-a-v1.md\n提案正文（测试用）。",
          cardKind: "schedule-write",
          flowId: "flow-a",
        },
        { toolCallId: "call-mismatch" },
      );
    } finally {
      await handle.dispose();
    }
    const { decision } = await waitForDecision(root);
    assert.equal(decision.decisionEvidence?.kind, "judge", "仍保留 judge 归因");
    assert.equal(decision.customerDecision, "accepted");
  });
});

// —————————————————————— ⑧ 工具回执 ——————————————————————

test("request_choice：judge 代批回执写「judge 代批」，不写「客户已选择」", async () => {
  const judge: GovernanceJudgeAudit = { group: "decision", cardKind: "proposal", engine: "claude", reasonCode: "sufficient" };
  const tool = buildGovernedTools(allow, {
    runtime: "claude",
    customerInput: () => ({ outcome: "answered", value: { selected: ["accept"] }, judge }),
  }).find((entry) => entry.name === "request_choice")!;
  const result = await tool.handler({
    name: tool.name,
    args: {
      title: "接受提案",
      options: [{ id: "accept", label: "接受" }],
      cardKind: "proposal",
      flowId: "flow-a",
    },
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /已代批/);
  assert.match(result.message, /判断 agent 代批/);
  assert.match(result.message, /代决策/);
  assert.match(result.message, /operator:judge:claude/);
  assert.match(result.message, /不是客户本人点击/);
  assert.doesNotMatch(result.message, /客户已选择/);
});

test("request_confirmation：judge 代批回执写「代审批」，不写「客户已确认」；客户手批文案不变", async () => {
  const judge: GovernanceJudgeAudit = { group: "approval", cardKind: "write", engine: "codex", reasonCode: "sufficient" };
  const judged = buildGovernedTools(allow, {
    runtime: "codex",
    customerInput: () => ({ outcome: "answered", value: { confirmed: true }, judge }),
  }).find((entry) => entry.name === "request_confirmation")!;
  const result = await judged.handler({ name: judged.name, args: { title: "写入提案", cardKind: "write", flowId: "flow-a" } });
  assert.equal(result.ok, true);
  assert.match(result.message, /已代批/);
  assert.match(result.message, /判断 agent 代批/);
  assert.match(result.message, /代审批/);
  assert.match(result.message, /operator:judge:codex/);
  assert.match(result.message, /不是客户本人点击/);
  assert.doesNotMatch(result.message, /客户已确认/);

  const manual = buildGovernedTools(allow, {
    customerInput: () => ({ outcome: "answered", value: { confirmed: true } }),
  }).find((entry) => entry.name === "request_confirmation")!;
  const unchanged = await manual.handler({ name: manual.name, args: { title: "写入" } });
  assert.match(unchanged.message, /客户已确认/);
  assert.doesNotMatch(unchanged.message, /judge 代批/);
});

// —————————————————————— ⑨ 纯规范化/审计有界 ——————————————————————

test("normalize/evaluate：approve 无 reason → parse-failed；审计字段有界", () => {
  assert.equal(normalizeGovernanceJudgeVerdict({ verdict: "approve" }), undefined);
  assert.equal(normalizeGovernanceJudgeVerdict({ verdict: "maybe", reason: "x" }), undefined);
  assert.deepEqual(normalizeGovernanceJudgeVerdict({ verdict: "manual", reasonCode: "x" }), { verdict: "manual", reasonCode: "x" });

  const outcome = evaluateGovernanceJudgeVerdict({
    request: request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }),
    verdict: {
      verdict: "approve",
      reason: "证据充分。",
      evidence: Array.from({ length: 20 }, (_, index) => `evidence-${index}`),
      selected: ["accept"],
      pathDecisions: Array.from({ length: 60 }, (_, index) => ({ path: `p-${index}`, ok: true })),
    },
    stats: {
      readCalls: 1,
      readBytes: 10,
      deniedReads: 0,
      truncatedReads: 0,
      budgetExceeded: false,
      readPaths: ["docs/proposals/flow-a-v1.md"],
    },
    engine: "claude",
  });
  assert.equal(outcome.verdict, "approve");
  const audit = boundedGovernanceJudgeAudit({
    group: outcome.group,
    cardKind: outcome.cardKind,
    engine: outcome.engine,
    reasonCode: outcome.reasonCode,
    reason: "长".repeat(4000),
    evidence: Array.from({ length: 20 }, (_, index) => "e".repeat(600) + index),
    pathDecisions: Array.from({ length: 60 }, (_, index) => ({ path: `p-${index}`, ok: true, reason: "r".repeat(600) })),
  });
  assert.ok((audit.reason?.length ?? 0) <= 1024);
  assert.ok((audit.evidence?.length ?? 0) <= 10);
  assert.ok((audit.pathDecisions?.length ?? 0) <= 50);
  for (const item of audit.evidence ?? []) assert.ok(Buffer.byteLength(item, "utf8") <= 512 + 3);
  assert.ok(Buffer.byteLength(buildGovernanceJudgeSystemPrompt(), "utf8") > 1000);
  assert.match(buildGovernanceJudgeSystemPrompt(), /\.ans/);
});

// —————————————————————— ⑩ deny：approval 组退回重做（2026-10-19 客户反馈） ——————————————————————

test("deny：approval 组合法；缺 reason 规范化失败；decision 组回落 manual", () => {
  // 规范化：deny 必须有非空 reason。
  assert.deepEqual(
    normalizeGovernanceJudgeVerdict({ verdict: "deny", reason: "角色卡混入无关散文，请删去并重写职责段。" }),
    { verdict: "deny", reason: "角色卡混入无关散文，请删去并重写职责段。" },
  );
  assert.equal(normalizeGovernanceJudgeVerdict({ verdict: "deny" }), undefined);
  assert.equal(normalizeGovernanceJudgeVerdict({ verdict: "deny", reason: "   " }), undefined);

  const approvalRequest = request({
    group: "approval",
    cardKind: "write",
    roleId: "nominator",
    card: {
      kind: "confirm",
      title: "写入提名",
      preview: "## docs/nominations/flow-a-v1.md\n# 提名\n",
      cardKind: "write",
      flowId: "flow-a",
    },
    paths: ["docs/nominations/flow-a-v1.md"],
    pathProbes: [{ path: "docs/nominations/flow-a-v1.md", allowed: true }],
    allowedPathRoots: ["docs/nominations/"],
    forbiddenPaths: [".ans/"],
    artifacts: undefined,
  });

  const deny = evaluateGovernanceJudgeVerdict({
    request: approvalRequest,
    verdict: {
      verdict: "deny",
      reason: "提名文件混入无关散文，请删去后重试。",
      reasonCode: "insufficient-evidence",
      evidence: ["docs/nominations/flow-a-v1.md"],
    },
    stats: { readCalls: 1, readBytes: 10, deniedReads: 0, truncatedReads: 0, budgetExceeded: false, readPaths: [] },
    engine: "claude",
    model: "test-model",
    durationMs: 12,
  });
  assert.equal(deny.verdict, "deny");
  assert.equal(deny.reasonCode, "insufficient-evidence");
  assert.equal(deny.reason, "提名文件混入无关散文，请删去后重试。");
  assert.deepEqual(deny.evidence, ["docs/nominations/flow-a-v1.md"]);
  assert.equal(deny.model, "test-model");
  assert.equal(deny.durationMs, 12);
  assert.equal(deny.readCalls, 1);
  assert.equal(deny.value, undefined);
  assert.equal(deny.paths, undefined);
  assert.equal(deny.pathDecisions, undefined);

  const defaultDeny = evaluateGovernanceJudgeVerdict({
    request: approvalRequest,
    verdict: { verdict: "deny", reason: "内容不合规，请修正。" },
    engine: "claude",
  });
  assert.equal(defaultDeny.verdict, "deny");
  assert.equal(defaultDeny.reasonCode, "model-deny");

  // decision 组不得替客户拒绝 ⇒ manual。
  const decisionDeny = evaluateGovernanceJudgeVerdict({
    request: request(),
    verdict: { verdict: "deny", reason: "提案偏离意图。" },
    engine: "claude",
  });
  assert.equal(decisionDeny.verdict, "manual");
  assert.match(decisionDeny.reason ?? "", /决策卡不能由自动代理拒绝/);

  // 审计字段：deny 无 value/paths，但保留原因/证据/读取统计。
  const audit = governanceJudgeAuditFromOutcome(deny);
  assert.equal(audit.group, "approval");
  assert.equal(audit.cardKind, "write");
  assert.equal(audit.reasonCode, "insufficient-evidence");
  assert.equal(audit.reason, "提名文件混入无关散文，请删去后重试。");
  assert.deepEqual(audit.evidence, ["docs/nominations/flow-a-v1.md"]);
  assert.equal(audit.selected, undefined);
  assert.equal(audit.confirmed, undefined);
  assert.equal(audit.paths, undefined);
  assert.equal(audit.readCalls, 1);
  assert.equal(audit.durationMs, 12);
});

test("prompt：三值输出契约；approval deny 退回重做；decision 不得 deny", () => {
  const prompt = buildGovernanceJudgeSystemPrompt();
  assert.match(prompt, /"verdict":"approve\|deny\|manual"/);
  assert.match(prompt, /deny：\*\*仅 approval 组可用\*\*/);
  assert.match(prompt, /decision 组不得 deny/);
  assert.match(prompt, /哪条不合规 \+ 应怎么改/);
  assert.match(prompt, /approval 组的「内容不合规\/不建议」用 deny 退回发起角色重做/);
  assert.match(prompt, /reason 必须是可操作的返工说明/);
  assert.match(prompt, /不得把结果推回客户等待/);
  assert.match(prompt, /intent-confirm（decision/);
  assert.match(prompt, /这张卡本身就是意图基准/);
  assert.match(prompt, /selected 恰为 \["confirm"\]/);
  assert.doesNotMatch(prompt, /已转手动确认|等客户决定/);
  assert.doesNotMatch(prompt, /从不替客户拒绝/);
});

test("manual：decision 组返工原因原样保留；approval 组 manual 给可操作修正说明", () => {
  const decisionManual = evaluateGovernanceJudgeVerdict({
    request: request(),
    verdict: {
      verdict: "manual",
      reason: "提案范围超出意图 §范围，请缩小到『只含导出』后重发。",
      reasonCode: "intent-drift",
    },
    engine: "claude",
  });
  assert.equal(decisionManual.verdict, "manual");
  assert.equal(decisionManual.reasonCode, "intent-drift");
  assert.match(decisionManual.reason ?? "", /请缩小到/);
  assert.doesNotMatch(decisionManual.reason ?? "", /已转手动确认|等客户决定/);

  const approvalManual = evaluateGovernanceJudgeVerdict({
    request: request({
      group: "approval",
      cardKind: "write",
      roleId: "nominator",
      card: {
        kind: "confirm",
        title: "写入提名",
        preview: "## docs/nominations/flow-a-v1.md\n# 提名\n",
        cardKind: "write",
        flowId: "flow-a",
      },
      paths: ["docs/other/x.md"],
      pathProbes: [{ path: "docs/other/x.md", allowed: true }],
      allowedPathRoots: ["docs/nominations/"],
      forbiddenPaths: [".ans/"],
      artifacts: undefined,
    }),
    verdict: {
      verdict: "approve",
      reason: "看起来没问题。",
      evidence: ["docs/nominations/flow-a-v1.md"],
      confirmed: true,
      pathDecisions: [{ path: "docs/other/x.md", ok: true }],
    },
    engine: "claude",
  });
  assert.equal(approvalManual.verdict, "manual");
  assert.equal(approvalManual.reasonCode, "path-outside-boundary");
  assert.match(approvalManual.reason ?? "", /请改为角色可写根内的路径后重新提交/);
  assert.doesNotMatch(approvalManual.reason ?? "", /已转手动确认|等客户决定/);
});

test("driver：approval deny 走 governance-judge.deny 日志（不记 manual），跳过 approve 哈希复核", async () => {
  await withRoot(async (root) => {
    const target = "docs/flows/flow-a.md";
    writeFile(root, target, flowMarkdown([{ id: "s1", status: "done" }]));
    const records: Array<{ event: string; fields?: Record<string, unknown> }> = [];
    const logger: DiagnosticLog = {
      record(event, fields) {
        records.push({ event, ...(fields !== undefined ? { fields } : {}) });
      },
      error(event, error, fields) {
        records.push({ event, fields: { ...(fields ?? {}), error: String(error) } });
      },
    };
    const scheduleWrite = request({
      projectRoot: root,
      group: "approval",
      cardKind: "schedule-write",
      roleId: "convener",
      card: {
        kind: "confirm",
        title: "写入流程单",
        preview: writePreview([target]),
        cardKind: "schedule-write",
        flowId: "flow-a",
      },
      paths: [target],
      pathProbes: [{ path: target, allowed: true }],
      allowedPathRoots: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
      forbiddenPaths: [".ans/", "角色卡/", "docs/proposals/", "docs/nominations/"],
      artifacts: { flowPath: target },
    });
    const { judge } = makeJudge(
      {
        report: readThenReport([target], {
          verdict: "deny",
          reason: "流程步骤缺 evidence，请补齐 evidence 后重试。",
        }),
      },
      { logger },
    );
    const out = await judge(scheduleWrite);
    assert.equal(out.verdict, "deny");
    assert.equal(out.reasonCode, "model-deny");
    assert.ok(
      records.some((entry) => entry.event === "governance-judge.deny" && entry.fields?.reasonCode === "model-deny"),
      `应记录 governance-judge.deny；实际事件：${records.map((entry) => entry.event).join(", ")}`,
    );
    assert.ok(
      !records.some((entry) => entry.event === "governance-judge.manual"),
      "deny 不得记成 manual",
    );
  });
});

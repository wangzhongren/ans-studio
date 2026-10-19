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
  CustomerInputRequest,
  GovernanceJudgeAudit,
  GovernanceJudgeFacts,
  GovernanceJudgeRequest,
  RuntimeKind,
  WriteGate,
} from "../../src/model/runtime.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
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
  options: { runtime?: RuntimeKind; timeoutMs?: number; projectRoot?: string } = {},
): { judge: ReturnType<typeof createGovernanceJudge>; seen: Seen } {
  const { factory, seen } = fakeFactory(script);
  const judge = createGovernanceJudge({
    project: { ...PROJECT, ...(options.projectRoot !== undefined ? { projectRoot: options.projectRoot } : {}) },
    runtime: options.runtime ?? "claude",
    createAdapter: factory,
    timeoutMs: options.timeoutMs ?? 300,
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

test("proposal：证据齐全 + required-read 满足 → approve（selected=accept）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md");
    const req = request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    });
    const { judge, seen } = makeJudge({
      report: readThenReport(["docs/proposals/flow-a-v1.md"], APPROVE_PROPOSAL),
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
    assert.match(seen.role?.cardText ?? "", /accept-quick 不代批/);
    assert.equal(governanceJudgeAuditOf(out)?.group, "decision");
  });
});

test("proposal rubric：架构方案/影响分析缺失或空洞 ⇒ manual/insufficient-evidence（读全文核对，不机械匹配 preview）", () => {
  const cardText = buildGovernanceJudgeSystemPrompt();
  assert.match(cardText, /架构门槛（客户 2026-10-19 新要求，不得跳过）/, "rubric 必须有架构门槛段");
  assert.match(cardText, /「架构方案」/, "新项目要求架构方案");
  assert.match(cardText, /「架构影响分析」/, "变更提案要求架构影响分析");
  assert.match(cardText, /模块分解与职责/);
  assert.match(cardText, /依赖方向（无环）/);
  assert.match(cardText, /扩展点/, "必须覆盖扩展点");
  assert.match(cardText, /数据 schema 与 API\/契约的版本\/迁移\/兼容\/弃用策略/);
  assert.match(cardText, /横切关注点归属/);
  assert.match(cardText, /权衡与备选/);
  assert.match(cardText, /章节缺失、只有标题\/空话、或与提案范围自相矛盾 ⇒ 不得 approve/);
  assert.match(cardText, /"insufficient-evidence"/, "架构不合格必须用 insufficient-evidence");
  assert.match(cardText, /不得仅凭 preview 判断章节存在/, "禁止只凭卡片 preview 判断");
  assert.match(cardText, /必须以读到的 proposalPath 全文为准/, "要求实际读取提案全文");
});

test("proposal：判断 agent 因架构章节缺失自报 manual/insufficient-evidence → 保持 manual（不放行）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", "# 提案\n\n## 目标\n做点事\n");
    const req = request({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    });
    const { judge } = makeJudge({
      report: readThenReport(["docs/proposals/flow-a-v1.md"], {
        verdict: "manual",
        reasonCode: "insufficient-evidence",
        reason: "提案缺少「架构方案」章节：无模块分解、依赖方向与扩展点，无法核对。",
        evidence: ["docs/proposals/flow-a-v1.md"],
      }),
    });
    const out = await judge(req);
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "insufficient-evidence");
    assert.match(out.reason ?? "", /架构方案/);
  });
});

test("proposal：accept-quick 不代批；revise/reject 一律 manual（不代拒绝）", async () => {
  for (const selected of [["accept-quick"], ["revise"], ["reject"], []]) {
    const { judge } = makeJudge({
      report: { ...APPROVE_PROPOSAL, selected },
    });
    const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
    assert.equal(out.verdict, "manual", `selected=${JSON.stringify(selected)} 不得代批`);
    assert.equal(out.reasonCode, "not-recommended");
  }
});

test("proposal：required-read 缺失 → manual/artifact-not-read", async () => {
  const { judge } = makeJudge({ report: APPROVE_PROPOSAL });
  const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "artifact-not-read");
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
  assert.match(proposal.reason ?? "", /规范物证缺失：docs\/proposals\/flow-a-v1\.md（判断无法核对），已转手动确认。/);

  // appointment：无提名文件 ⇒ 明确点名 docs/nominations/<flowId>-v1.md
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
  assert.match(appointment.reason ?? "", /规范物证缺失：docs\/nominations\/flow-a-v1\.md（判断无法核对），已转手动确认。/);

  // acceptance：proposal 与 flow 两个物证都缺 ⇒ 两条路径都列出
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
    ["提名"],
  );
  assert.deepEqual(
    requiredArtifactPaths(request({ flowId: "", cardKind: "acceptance", card: { kind: "choice", title: "验收", options: [], cardKind: "acceptance" }, artifacts: {} })).missingPaths,
    ["提案", "流程单文件"],
  );
});

test("proposal：读取被拒/预算/截断 → approve 降 manual", async () => {
  const cases: Array<[Partial<GovernanceJudgeFacts> & object, string]> = [];
  void cases;
  for (const [mutate, code] of [
    [(stats: { deniedReads: number }) => { stats.deniedReads = 1; }, "read-denied"],
    [(stats: { budgetExceeded: boolean }) => { stats.budgetExceeded = true; }, "budget"],
    [(stats: { truncatedReads: number }) => { stats.truncatedReads = 1; }, "read-truncated"],
  ] as const) {
    const { judge } = makeJudge({
      report: (seen: Seen) => {
        const stats = seen.capabilities!.governanceJudge!.stats;
        stats.readPaths = ["docs/proposals/flow-a-v1.md"];
        (mutate as (stats: { deniedReads?: number; budgetExceeded?: boolean; truncatedReads?: number }) => void)(stats);
        return APPROVE_PROPOSAL;
      },
    });
    const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, code);
  }
});

test("proposal：read-denied 摘要列出相对路径与类别（治理与 shell judge 同口径）", async () => {
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      const stats = seen.capabilities!.governanceJudge!.stats;
      stats.readPaths = ["docs/proposals/flow-a-v1.md"];
      stats.deniedReads = 2;
      stats.deniedPaths = [
        { path: ".ans/sessions/a.json", code: "app-private", pathClass: "app-private" },
        { path: "src/foo.txt", code: "sensitive", pathClass: "credential" },
      ];
      return APPROVE_PROPOSAL;
    },
  });
  const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "read-denied");
  const reason = out.reason ?? "";
  assert.match(reason, /判断读取被拒：/);
  assert.match(reason, /\.ans\/sessions\/a\.json（应用私有数据）/);
  assert.match(reason, /src\/foo\.txt（凭据文件）/);
  assert.match(reason, /无法保证无损判断，已转手动确认。/);
  assert.doesNotMatch(reason, /[A-Za-z]:[\\/]|\/(?:home|Users|tmp)\//, "摘要不含绝对路径");
});

test("proposal：read-denied 且 deniedPaths 为空 ⇒ 保留原泛化文案", async () => {
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      const stats = seen.capabilities!.governanceJudge!.stats;
      stats.readPaths = ["docs/proposals/flow-a-v1.md"];
      stats.deniedReads = 1;
      stats.deniedPaths = [];
      return APPROVE_PROPOSAL;
    },
  });
  const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "read-denied");
  assert.match(out.reason ?? "", /判断读取被拒（敏感文件\/越界\/二进制），无法保证无损判断，已转手动确认。/);
});

// —————————————————————— ② appointment ——————————————————————

function appointmentRequest(over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return request({
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
    artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" },
    ...over,
  });
}

test("appointment：selected 恰等于推荐集 → approve；多选卡片允许两个", async () => {
  const { judge } = makeJudge({
    report: readThenReport(["docs/nominations/flow-a-v1.md"], {
      verdict: "approve",
      reason: "候选与已接受提案一致。",
      evidence: ["docs/nominations/flow-a-v1.md"],
      selected: ["alpha", "beta"],
    }),
  });
  const out = await judge(appointmentRequest());
  assert.equal(out.verdict, "approve");
  assert.deepEqual(out.value, { selected: ["alpha", "beta"] });
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
  const scenarios: Array<{ req: GovernanceJudgeRequest; selected: string[]; code: string }> = [
    {
      req: appointmentRequest({ card: baseCard(undefined), recommendedRoleIds: ["alpha", "beta"] }),
      selected: ["alpha", "beta"],
      code: "not-recommended",
    },
    {
      req: appointmentRequest({ card: baseCard(true), recommendedRoleIds: ["alpha", "beta"] }),
      selected: ["alpha"],
      code: "not-recommended",
    },
    {
      req: appointmentRequest({ card: baseCard(true), recommendedRoleIds: ["alpha", "su"] }),
      selected: ["alpha", "su"],
      code: "not-recommended",
    },
    {
      req: appointmentRequest({ card: baseCard(true), recommendedRoleIds: undefined }),
      selected: ["alpha", "beta"],
      code: "insufficient-evidence",
    },
  ];
  for (const scenario of scenarios) {
    const { judge } = makeJudge({
      report: (seen: Seen) => {
        seen.capabilities!.governanceJudge!.stats.readPaths = ["docs/nominations/flow-a-v1.md"];
        return {
          verdict: "approve",
          reason: "按推荐集任命。",
          evidence: ["docs/nominations/flow-a-v1.md"],
          selected: scenario.selected,
        };
      },
    });
    const out = await judge(scenario.req);
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, scenario.code);
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
const ACCEPTANCE_READS = ["docs/proposals/flow-a-v1.md", "docs/flows/flow-a.md"];

test("acceptance：流程全部 done + dispatch 齐全 + 物证已读 → approve", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
    writeFile(root, "docs/proposals/flow-a-v1.md");
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
    ledger?: string;
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
      writeFile(root, "docs/proposals/flow-a-v1.md");
      if (scenario.ledger !== undefined) writeFile(root, ".ans/governance/ledger.jsonl", scenario.ledger);
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
    writeFile(root, "docs/proposals/flow-a-v1.md");
    writeFile(root, ".ans/governance/ledger.jsonl", [
      JSON.stringify({
        at: "2026-10-18T00:00:00.000Z",
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
    const { judge } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
    const out = await judge(acceptanceRequest(root, {
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
    }));
    assert.equal(out.verdict, "approve");
    assert.equal(out.reasonCode, "sufficient");
  });
});

test("acceptance：ledgerErrors / 未接受 / 未闭环澄清 → manual", async () => {
  const scenarios: Array<{ facts: GovernanceJudgeFacts; code: string }> = [
    { facts: facts({ ledgerErrors: 1, proposalDecision: "accepted", dispatchedStepIds: ["s1"] }), code: "ledger-unavailable" },
    { facts: facts({ proposalDecision: "revise", dispatchedStepIds: ["s1"] }), code: "insufficient-evidence" },
    { facts: facts({ proposalDecision: undefined, dispatchedStepIds: ["s1"] }), code: "insufficient-evidence" },
    { facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"], unresolvedClarificationCount: 1 }), code: "insufficient-evidence" },
  ];
  for (const scenario of scenarios) {
    await withRoot(async (root) => {
      writeFile(root, "docs/flows/flow-a.md", flowMarkdown([{ id: "s1", status: "done" }]));
      writeFile(root, "docs/proposals/flow-a-v1.md");
      const { judge } = makeJudge({ report: readThenReport(ACCEPTANCE_READS, APPROVE_ACCEPTANCE) });
      const out = await judge(acceptanceRequest(root, { facts: scenario.facts }));
      assert.equal(out.verdict, "manual");
      assert.equal(out.reasonCode, scenario.code);
    });
  }
});

// ————— ③-补 2026-10-19 真机：状态「引导词 + 说明」与 canonical stepId 列（验收机械门槛） —————

test("流程步骤状态首词规范化：done 变体视为完成；pending/delivered/空不视为完成", () => {
  for (const status of ["done", "done（证据）", "done(evidence)", "Done", "DONE", "done：xxx", "done 有落盘/回交证据"]) {
    assert.equal(normalizeFlowStepStatus(status), "done", `${status} 应规范化为 done`);
  }
  for (const status of ["pending（…）", "pending（不由统筹派发）", "delivered（…）", "in-progress（…）", "blocked", "", "   "]) {
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
  ["nomination", "提名：Crew / 组队 读取提案并给出候选角色", "done（`docs/nominations/ticket-desk-r2-v1.md`；推荐集 = 既有三角色，不新增角色）"],
  ["role-readiness", "角色就绪：客户任命决定 + 角色卡就绪确认", "done（客户经任命卡确认沿用 backend / frontend / test；本轮不新增角色、不改卡）"],
  ["contract-freeze-v2", "冻结 API 契约 v2 到 `docs/contracts/ticket-desk-api-v2.md`", "done（frozen-v2 / supersedes v1）"],
  ["delivery-backend", "服务端增量：`sort`/`order`/`assignee`、`deadline`、`overdue`、`GET /api/tickets/export`（CSV+BOM）、`canExport`、store 补全、README 同步（backend-engineer）", "done（有落盘/回交证据；125/125 + 自检 73 项为角色自报，独立复核仍待 `verification`）"],
  ["delivery-frontend", "前端增量：排序/负责人筛选控件、截止时间列与逾期高亮、创建与 PATCH deadline 表单、导出按钮（`fetch`+`Blob`）（frontend-engineer）", "done（有落盘/回交证据；e2e 后 0 处修正）"],
  ["delivery-test", "测试增量：`sorting-filtering` / `overdue` / `export` 三文件 + `persistence` 增补；既有 75 用例不得弱化（test-engineer）", "done（有落盘/回交证据；125/125 为角色自报，独立复核仍待 `verification`）"],
  ["cleanup-selfcheck", "清理 `data/selfcheck-r2.mjs` 临时自检脚本（backend-engineer 自己的写区）", "done（已删；`data/` 仅剩 `tickets.json`，统筹 `list_dir` 复核）"],
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

// —————————————————————— ④ write 族 ——————————————————————

function confirmRequest(over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return request({
    group: "approval",
    cardKind: "write",
    card: {
      kind: "confirm",
      title: "写入提案",
      preview: "写入 docs/proposals/flow-a-v2.md，内容为……",
      detail: "新增 v2 版本，修改验收条目。",
      cardKind: "write",
      flowId: "flow-a",
    },
    paths: ["docs/proposals/flow-a-v2.md"],
    pathProbes: [{ path: "docs/proposals/flow-a-v2.md", allowed: true }],
    allowedPathRoots: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
    forbiddenPaths: [".ans/", "docs/bootstrap-manifest.md", "角色卡/", "docs/nominations/", "docs/flows/"],
    artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    ...over,
  });
}

const APPROVE_WRITE = {
  verdict: "approve",
  reason: "路径在报告员写区内，预览含正文。",
  evidence: ["docs/proposals/flow-a-v2.md"],
  confirmed: true,
  pathDecisions: [{ path: "docs/proposals/flow-a-v2.md", ok: true }],
};

test("write：逐路径探测 + pathDecisions 齐全 → approve（confirmed:true）", async () => {
  const { judge } = makeJudge({
    report: readThenReport(["docs/proposals/flow-a-v1.md"], APPROVE_WRITE),
  });
  const out = await judge(confirmRequest());
  assert.equal(out.verdict, "approve");
  assert.deepEqual(out.value, { confirmed: true });
  assert.deepEqual(out.paths, ["docs/proposals/flow-a-v2.md"]);
  assert.deepEqual(out.pathDecisions, [{ path: "docs/proposals/flow-a-v2.md", ok: true }]);
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
        preview: `写入 ${target}，正文：\n# 实时白板提案\n\ngoal: ...\nscope: ...\nacceptance: ...`,
        cardKind: "write",
        flowId: "flow-a",
      },
    });
    const report = {
      verdict: "approve",
      reason: "新文件 preview 含完整正文，路径在报告员写区内。",
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
    writeFile(root, "docs/proposals/flow-a-v1.md");
    const target = "docs/proposals/flow-a-v2.md";
    const req = confirmRequest({
      projectRoot: root,
      paths: [target],
      pathProbes: [{ path: target, allowed: true }],
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
      card: {
        kind: "confirm",
        title: "写入提案 v2",
        preview: `写入 ${target}，正文：修改验收条目。`,
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

test("appointment-write / schedule-write：新文件 + preview 正文仍可代批（不回归）", async () => {
  {
    const { judge } = makeJudge({
      report: readThenReport(["docs/nominations/flow-a-v1.md"], {
        verdict: "approve",
        reason: "候选与提案一致。",
        evidence: ["docs/nominations/flow-a-v1.md"],
        confirmed: true,
        pathDecisions: [
          { path: "角色卡/alpha/role-card.md", ok: true },
          { path: "角色卡/alpha/boundary.yaml", ok: true },
        ],
      }),
    });
    const out = await judge(request({
      group: "approval",
      cardKind: "appointment-write",
      roleId: "nominator",
      card: {
        kind: "confirm",
        title: "写入角色卡",
        preview: "创建 角色卡/alpha/role-card.md 与 boundary.yaml，正文……",
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
      artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" },
      facts: facts({ appointmentTargetRoleIds: ["alpha"] }),
    }));
    assert.equal(out.verdict, "approve");
  }
  {
    const flowPath = "docs/flows/flow-a.md";
    const { judge } = makeJudge({
      report: readThenReport(["docs/flows/flow-a.md"], {
        verdict: "approve",
        reason: "流程步骤与提案一致。",
        evidence: ["docs/flows/flow-a.md"],
        confirmed: true,
        pathDecisions: [{ path: flowPath, ok: true }],
      }),
    });
    const out = await judge(request({
      group: "approval",
      cardKind: "schedule-write",
      roleId: "convener",
      card: {
        kind: "confirm",
        title: "写入新流程单",
        preview: `新建 ${flowPath}，包含步骤 s1/s2。`,
        cardKind: "schedule-write",
        flowId: "flow-a",
      },
      paths: [flowPath],
      pathProbes: [{ path: flowPath, allowed: true }],
      allowedPathRoots: ["docs/flows/", "docs/workflow.md", "docs/governance/convener/"],
      forbiddenPaths: [".ans/", "角色卡/", "docs/proposals/", "docs/nominations/"],
      artifacts: { flowPath: "docs/flows/flow-a.md" },
    }));
    assert.equal(out.verdict, "approve");
  }
});

test("write：两条声明路径全 allowed → approve（真实 2 文件，不误判散文路径）", async () => {
  const targetA = "docs/proposals/local-ledger-cli.proposal-v1.md";
  const targetB = "docs/contracts/local-ledger-cli.md";
  const { judge } = makeJudge({
    report: {
      verdict: "approve",
      reason: "两条路径均在报告员写区内，preview 含正文。",
      evidence: [targetA, targetB],
      confirmed: true,
      pathDecisions: [{ path: targetA, ok: true }, { path: targetB, ok: true }],
    },
  });
  const out = await judge(confirmRequest({
    paths: [targetA, targetB],
    pathProbes: [{ path: targetA, allowed: true }, { path: targetB, allowed: true }],
    artifacts: undefined,
    card: {
      kind: "confirm",
      title: "新建本地账本 CLI",
      preview: `将写入以下文件：\n- ${targetA}\n- ${targetB}\n\n正文：add/list/summary。不会修改 src/**、test/**、data/ledger.json。`,
      cardKind: "write",
      flowId: "local-ledger-cli",
    },
  }));
  assert.equal(out.verdict, "approve");
  assert.deepEqual(out.paths, [targetA, targetB]);
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
    paths: [ok, bad],
    pathProbes: [{ path: ok, allowed: true }, { path: bad, allowed: false }],
    artifacts: undefined,
    card: {
      kind: "confirm",
      title: "新建本地账本 CLI",
      preview: `将写入以下文件：\n- ${ok}\n- ${bad}`,
      cardKind: "write",
      flowId: "local-ledger-cli",
    },
  }));
  assert.equal(out.verdict, "manual");
  assert.equal(out.reasonCode, "path-outside-boundary");
});

test("appointment-write：目标必须在最新任命名单且非内置 → approve；否则 manual", async () => {
  const appointmentWrite = (target: string, factsOver: Partial<GovernanceJudgeFacts>): GovernanceJudgeRequest => request({
    group: "approval",
    cardKind: "appointment-write",
    roleId: "nominator",
    card: {
      kind: "confirm",
      title: `写入角色卡 ${target}`,
      preview: `创建 角色卡/${target}/role-card.md 与 boundary.yaml。`,
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
    artifacts: { nominationPath: "docs/nominations/flow-a-v1.md" },
    facts: facts({ appointmentTargetRoleIds: ["alpha"], ...factsOver }),
  });
  const report = (target: string) => ({
    verdict: "approve",
    reason: "候选与已接受提案一致。",
    evidence: ["docs/nominations/flow-a-v1.md"],
    confirmed: true,
    pathDecisions: [
      { path: `角色卡/${target}/role-card.md`, ok: true },
      { path: `角色卡/${target}/boundary.yaml`, ok: true },
    ],
  });
  {
    const { judge } = makeJudge({ report: readThenReport(["docs/nominations/flow-a-v1.md"], report("alpha")) });
    const out = await judge(appointmentWrite("alpha", {}));
    assert.equal(out.verdict, "approve");
  }
  for (const [target, code] of [["beta", "path-outside-boundary"], ["rapporteur", "path-outside-boundary"]] as const) {
    const { judge } = makeJudge({ report: readThenReport(["docs/nominations/flow-a-v1.md"], report(target)) });
    const out = await judge(appointmentWrite(target, {}));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, code);
  }
});

test("schedule-write：路径必须匹配 flowId → approve；不匹配 manual", async () => {
  const scheduleWrite = (path: string): GovernanceJudgeRequest => request({
    group: "approval",
    cardKind: "schedule-write",
    roleId: "convener",
    card: {
      kind: "confirm",
      title: "写入流程单",
      preview: `写入 ${path}，包含步骤 s1/s2。`,
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
  {
    const { judge } = makeJudge({ report: readThenReport(["docs/flows/flow-a.md"], report("docs/flows/flow-a.md")) });
    const out = await judge(scheduleWrite("docs/flows/flow-a.md"));
    assert.equal(out.verdict, "approve");
  }
  {
    const { judge } = makeJudge({ report: readThenReport(["docs/flows/flow-a.md"], report("docs/flows/flow-b.md")) });
    const out = await judge(scheduleWrite("docs/flows/flow-b.md"));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "path-outside-boundary");
  }
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
  {
    const { judge } = makeJudge({ settle: false }, { timeoutMs: 30 });
    const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "timeout");
    assert.match(out.reason ?? "", /判断超时（>30ms）/);
  }
  {
    const controller = new AbortController();
    controller.abort();
    const { judge } = makeJudge({ report: APPROVE_PROPOSAL });
    const out = await judge(request(), controller.signal);
    assert.equal(out.reasonCode, "aborted");
  }
  {
    const { judge, seen } = makeJudge({ settle: false });
    const first = judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await judge(request({
      toolCallId: "call-2",
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    }));
    assert.equal(second.verdict, "manual");
    assert.equal(second.reasonCode, "unavailable");
    seen.release?.();
    await first;
  }
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
    const { factory } = fakeFactory({ settle: false });
    const judge = createGovernanceJudge({ project: PROJECT, runtime: "claude", createAdapter: factory });
    const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
    assert.equal(out.reasonCode, "timeout");
    assert.match(out.reason ?? "", /判断超时（>40ms）/);
  } finally {
    if (previous === undefined) delete process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV];
    else process.env[GOVERNANCE_JUDGE_TIMEOUT_ENV] = previous;
  }
});

test("模型自报任意 reasonCode 不透传；多次调用最后一次合法生效", async () => {
  const { judge } = makeJudge({
    report: (seen: Seen) => {
      seen.capabilities!.governanceJudge!.report({ verdict: "manual", reason: "我拒绝", reasonCode: "customer-said-no" });
      seen.capabilities!.governanceJudge!.stats.readPaths = ["docs/proposals/flow-a-v1.md"];
      return APPROVE_PROPOSAL;
    },
  });
  const out = await judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
  assert.equal(out.verdict, "approve", "最后一次合法调用生效");
  const manual = await makeJudge({ report: { verdict: "manual", reason: "证据不足", reasonCode: "customer-said-no" } })
    .judge(request({ artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" } }));
  assert.equal(manual.reasonCode, "model-manual", "模型任意 code 不透传");
});

// —————————————————————— ⑥ 事实/推荐集 ——————————————————————

test("facts：从账本快照提炼 proposal/appointment/dispatch/澄清，且有界", () => {
  const entries = [
    { at: "t1", kind: "customer.decision" as const, actorRoleId: "rapporteur", power: "proposal" as const, flowId: "flow-a", decisionKind: "proposal-accept" as const },
    { at: "t2", kind: "customer.decision" as const, actorRoleId: "nominator", power: "nomination" as const, flowId: "flow-a", decisionKind: "appointment" as const, targetRoleIds: ["alpha", "beta"] },
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
  assert.deepEqual(built.dispatchedStepIds, ["s1"]);
  assert.equal(built.unresolvedClarificationCount, 1);
  assert.deepEqual(built.latestDecisionKinds, ["proposal-accept", "appointment"]);
  assert.ok(Buffer.byteLength(JSON.stringify(built), "utf8") <= 8 * 1024);

  const withError = buildGovernanceJudgeFacts({ snapshot: { entries: [], errors: ["bad line"] }, flowId: "flow-a" });
  assert.equal(withError.ledgerErrors, 1);
});

test("requiredArtifactPaths：逐卡种必需物证与缺失判定", () => {
  assert.deepEqual(requiredArtifactPaths(request({ cardKind: "proposal", artifacts: { proposalPath: "p.md" } })), { paths: ["p.md"], missing: false });
  assert.equal(requiredArtifactPaths(request({ cardKind: "proposal" })).missing, true);
  assert.equal(requiredArtifactPaths(request({ cardKind: "accepted" as never, artifacts: { proposalPath: "p.md" } })).missing, true);
  assert.deepEqual(
    requiredArtifactPaths(request({ cardKind: "acceptance", artifacts: { proposalPath: "p.md", flowPath: "f.md" } })),
    { paths: ["p.md", "f.md"], missing: false },
  );
  assert.equal(requiredArtifactPaths(request({ cardKind: "acceptance", artifacts: { proposalPath: "p.md" } })).missing, true);
  assert.deepEqual(
    requiredArtifactPaths(request({ cardKind: "appointment-write", artifacts: { nominationPath: "n.md", flowPath: "f.md" } })),
    { paths: ["n.md", "f.md"], missing: false },
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

  // 3) 提名 `.nomination-vN` 同样解析，并从中读取推荐集。
  await withRoot(async (root) => {
    writeFile(root, "docs/nominations/flow-a-v1.md");
    writeFile(root, "docs/nominations/flow-a.nomination-v3.md", "---\nflowId: flow-a\nrecommended: [alpha]\n---\n");
    const capturedInput: CapturedInput = {};
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "nominator",
        project: trioProject(root, "nominator"),
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
          options: [{ id: "alpha", label: "Alpha" }],
          multiple: true,
          cardKind: "appointment",
          flowId: "flow-a",
        },
        { toolCallId: "call-name-3" },
      );
      assert.equal(
        capturedInput.metadata?.judgeContext?.artifacts?.nominationPath,
        "docs/nominations/flow-a.nomination-v3.md",
      );
      assert.deepEqual(capturedInput.metadata?.judgeContext?.recommendedRoleIds, ["alpha"]);
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
      const targetA = "docs/proposals/local-ledger-cli.proposal-v1.md";
      const targetB = "docs/contracts/local-ledger-cli.md";
      await captured.caps!.customerInput!(
        {
          kind: "confirm",
          title: "新建本地账本 CLI",
          preview:
            `将写入以下文件：\n- ${targetA}\n- ${targetB}\n\n` +
            "说明：不会修改 src/**、test/**，也不改 data/ledger.json、bin/ledger.js。\n\n" +
            `## ${targetA}\n提案正文（测试用）。\n\n## ${targetB}\n契约正文（测试用）。`,
          cardKind: "write",
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
          cardKind: "write",
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
          cardKind: "write",
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
          cardKind: "write",
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
          customerInput: ((_req, metadata) => {
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
    const project = trioProject(root);
    const audit: GovernanceJudgeAudit = {
      group: "decision",
      cardKind: "write",
      engine: "claude",
      reasonCode: "sufficient",
    };
    const captured: { caps?: AdapterCapabilities; gate?: WriteGate } = {};
    const handle = await openRoleSession(
      {
        roleId: "rapporteur",
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
          cardKind: "write",
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

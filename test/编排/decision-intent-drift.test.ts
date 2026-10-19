// test/编排/decision-intent-drift.test.ts
// 决策判断定位修正（2026-10-19 客户原话）：
//   「决策审批也改一下，就是判断意图是否偏离了客户的出发点就行了。」
//
// 覆盖（decision 组 = proposal / appointment / acceptance）：
//   · 意图漂移四类：超出意图范围/引入未授权非目标、违反客户约束或已接受提案/契约、
//     与已接受治理决定冲突（扩写区/改状态机语义/加新角色）、意图缺失/歧义/未确认；
//   · 与意图一致的决策可 allow（即使缺架构章节——架构由 Draft/Proof 负责）；
//   · 有偏离 ⇒ manual/intent-drift（fail-closed，保留原卡给客户）；
//   · 机械门槛不放宽：proposal 只代批 accept、appointment 恰等推荐集、acceptance 机械完成度。
//
// 全部离线：注入假 createAdapter，不调用真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  GovernanceJudgeFacts,
  GovernanceJudgeRequest,
  RuntimeKind,
  WriteGate,
} from "../../src/model/runtime.ts";
import type { AdapterCapabilities, RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import { createGovernanceJudge } from "../../src/common/编排/governance-judge.ts";
import { buildGovernanceJudgeSystemPrompt } from "../../src/common/编排/governance-judge-prompt.ts";

// —————————————————————— 夹具 ——————————————————————

const INTENT_REL = "docs/intents/intent-a.md";

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-intent-drift-"));
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

function seedIntent(root: string, over: {
  goal?: string;
  scope?: string;
  acceptance?: string;
  nonGoals?: string;
  flowId?: string;
} = {}): void {
  writeFile(
    root,
    INTENT_REL,
    [
      "---",
      "intentId: intent-a",
      "handoffKind: initial",
      `goal: ${over.goal ?? "实现示例能力"}`,
      `scope: ${over.scope ?? "只改编排模块，不新增角色"}`,
      `acceptance: ${over.acceptance ?? "只验收编排改动"}`,
      `nonGoals: ${over.nonGoals ?? "不改状态机语义，不扩写区"}`,
      "customerWords: 客户说：只改编排，不要越界。",
      `flowId: ${over.flowId ?? "flow-a"}`,
      "---",
      "",
      "# 意图 intent-a",
      "",
      "客户原话摘录：「只改编排，不要越界。」",
      "",
    ].join("\n"),
  );
}

/** 客户确认意图 + 交接；可附提案接受/dispatch 记录（验收用）。 */
function seedLedger(root: string, extra: readonly Record<string, unknown>[] = []): void {
  const lines: Record<string, unknown>[] = [
    {
      at: "2026-10-19T00:00:00.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "liaison",
      power: "liaison",
      decisionKind: "intent-confirm",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    },
    {
      at: "2026-10-19T00:00:00.500Z",
      kind: "intent.handed-off",
      flowId: "flow-a",
      actorRoleId: "liaison",
      power: "liaison",
      intentId: "intent-a",
      handoffKind: "initial",
    },
    ...extra,
  ];
  writeFile(root, ".ans/governance/ledger.jsonl", `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
}

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

function baseRequest(over: Partial<GovernanceJudgeRequest> = {}): GovernanceJudgeRequest {
  return {
    group: "decision",
    cardKind: "proposal",
    roleId: "rapporteur",
    projectRoot: process.cwd(),
    runtime: "claude",
    governanceModel: "trio",
    flowId: "flow-a",
    toolCallId: "call-1",
    card: {
      kind: "choice",
      title: "是否接受提案 flow-a-v1？",
      options: [{ id: "accept", label: "接受" }, { id: "revise", label: "修改" }],
      cardKind: "proposal",
      flowId: "flow-a",
    },
    facts: facts(),
    at: new Date().toISOString(),
    ...over,
  };
}

interface Seen {
  capabilities?: AdapterCapabilities;
  gate?: WriteGate;
  prompts: string[];
}

function fakeFactory(script: {
  report?: unknown | ((seen: Seen) => unknown);
  readPaths?: readonly string[];
} = {}): { factory: RuntimeAdapterFactory; seen: Seen } {
  const seen: Seen = { prompts: [] };
  const factory: RuntimeAdapterFactory = (gate, capabilities) => {
    seen.gate = gate;
    seen.capabilities = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole() {
        return {
          async prompt(text: string) {
            seen.prompts.push(text);
            const stats = capabilities?.governanceJudge?.stats;
            if (stats !== undefined && script.readPaths !== undefined) stats.readPaths = [...script.readPaths];
            if (script.report !== undefined) {
              const raw = typeof script.report === "function" ? (script.report as (value: Seen) => unknown)(seen) : script.report;
              capabilities?.governanceJudge?.report(raw);
            }
          },
          async *events() {
            yield { kind: "settled" as const, summary: "settled" };
          },
          async dispose() {},
          async abort() {},
        };
      },
    };
  };
  return { factory, seen };
}

function makeJudge(
  script: { report?: unknown | ((seen: Seen) => unknown); readPaths?: readonly string[] },
  runtime: RuntimeKind = "claude",
): { judge: ReturnType<typeof createGovernanceJudge>; seen: Seen } {
  const { factory, seen } = fakeFactory(script);
  const judge = createGovernanceJudge({
    project: { projectRoot: process.cwd(), skillRoot: process.cwd(), roles: {} },
    runtime,
    createAdapter: factory,
    timeoutMs: 300,
  });
  return { judge, seen };
}

const PROPOSAL_NO_ARCHITECTURE = [
  "# 提案 flow-a v1",
  "",
  "## 目标",
  "实现示例能力。",
  "",
  "## 范围",
  "只改编排模块。",
  "",
  "## 验收标准",
  "- 示例验收项。",
  "",
].join("\n");

// —————————————————————— ① 意图一致 ⇒ allow（架构不是门槛） ——————————————————————

test("proposal：与意图一致但缺架构章节 ⇒ 仍可 allow（架构由 Proof 查）", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_NO_ARCHITECTURE);
    seedIntent(root);
    seedLedger(root);
    const { judge } = makeJudge({
      readPaths: [INTENT_REL, "docs/proposals/flow-a-v1.md"],
      report: {
        verdict: "approve",
        reason: "提案目标/范围/验收均在意图内，无未授权非目标。",
        evidence: [INTENT_REL, "docs/proposals/flow-a-v1.md"],
        selected: ["accept"],
      },
    });
    const out = await judge(baseRequest({
      projectRoot: root,
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
    }));
    assert.equal(out.verdict, "approve");
    assert.equal(out.reasonCode, "sufficient");
    assert.deepEqual(out.value, { selected: ["accept"] });
  });
});

// —————————————————————— ② 提案偏离意图 ⇒ manual/deny ——————————————————————

test("proposal：超出意图范围/引入未授权非目标/与已接受决定冲突 ⇒ manual/intent-drift", async () => {
  await withRoot(async (root) => {
    writeFile(
      root,
      "docs/proposals/flow-a-v1.md",
      "# 提案\n\n## 目标\n重写全仓架构。\n\n## 范围\n改全仓并新增治理角色。\n",
    );
    seedIntent(root, { scope: "只改编排模块，不新增角色" });
    seedLedger(root, [{
      at: "2026-10-19T00:00:01.000Z",
      kind: "customer.decision",
      flowId: "flow-a",
      actorRoleId: "rapporteur",
      power: "proposal",
      decisionKind: "proposal-accept",
      customerDecision: "accepted",
      decisionEvidence: { kind: "customer-input" },
    }]);
    for (const reason of [
      "提案超出意图范围：意图只允许改编排模块，提案要改全仓。",
      "提案引入意图未授权的非目标：重写架构。",
      "提案与已接受决定冲突：新增治理角色未经客户改约。",
    ]) {
      const { judge } = makeJudge({
        readPaths: [INTENT_REL, "docs/proposals/flow-a-v1.md"],
        report: {
          verdict: "manual",
          reasonCode: "intent-drift",
          reason,
          evidence: [INTENT_REL, "docs/proposals/flow-a-v1.md"],
        },
      });
      const out = await judge(baseRequest({
        projectRoot: root,
        artifacts: { proposalPath: "docs/proposals/flow-a-v1.md" },
        facts: facts({ proposalDecision: "accepted" }),
      }));
      assert.equal(out.verdict, "manual", reason);
      assert.equal(out.reasonCode, "intent-drift", "模型自报的 intent-drift 属安全名单，原样入审计");
      assert.match(out.reason ?? "", /意图|非目标|已接受决定/);
      assert.equal(out.value, undefined, "manual 不得返回代批选择");
    }
  });
});

// —————————————————————— ③ 任命名单/写区扩张 ⇒ manual ——————————————————————

test("appointment：任命名单/写区扩张未经客户意图确认 ⇒ manual/intent-drift", async () => {
  await withRoot(async (root) => {
    writeFile(
      root,
      "docs/nominations/flow-a-v1.md",
      "# 提名\n\n推荐：alpha、beta\n\n## 候选角色\n\n| 角色 | 理由 |\n| --- | --- |\n| alpha | A |\n| beta | B |\n",
    );
    seedIntent(root, { scope: "只改编排模块，不新增角色" });
    seedLedger(root);
    const { judge } = makeJudge({
      readPaths: [INTENT_REL, "docs/nominations/flow-a-v1.md"],
      report: {
        verdict: "manual",
        reasonCode: "intent-drift",
        reason: "beta 是意图未授权的新角色；任命将扩写角色写区。",
        evidence: [INTENT_REL, "docs/nominations/flow-a-v1.md"],
      },
    });
    const out = await judge(baseRequest({
      projectRoot: root,
      cardKind: "appointment",
      roleId: "nominator",
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
    }));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "intent-drift");
    assert.equal(out.value, undefined);
  });
});

// —————————————————————— ④ 验收选择与意图冲突 ⇒ manual ——————————————————————

test("acceptance：验收选择与意图/已接受提案冲突 ⇒ manual/intent-drift", async () => {
  await withRoot(async (root) => {
    writeFile(root, "docs/proposals/flow-a-v1.md", PROPOSAL_NO_ARCHITECTURE);
    writeFile(root, "docs/flows/flow-a.md", "# 流程\n\n| stepId | 步骤 | 状态 |\n| --- | --- | --- |\n| s1 | 实现 | done |\n");
    seedIntent(root, { acceptance: "只验收编排改动" });
    seedLedger(root, [
      {
        at: "2026-10-19T00:00:01.000Z",
        kind: "customer.decision",
        flowId: "flow-a",
        actorRoleId: "rapporteur",
        power: "proposal",
        decisionKind: "proposal-accept",
        customerDecision: "accepted",
        decisionEvidence: { kind: "customer-input" },
      },
      {
        at: "2026-10-19T00:00:02.000Z",
        kind: "dispatch.accepted",
        flowId: "flow-a",
        stepId: "s1",
        actorRoleId: "app",
        power: "app",
      },
    ]);
    const { judge } = makeJudge({
      readPaths: [INTENT_REL, "docs/proposals/flow-a-v1.md"],
      report: {
        verdict: "manual",
        reasonCode: "intent-drift",
        reason: "本次验收把意图外的全仓改造一并验收，超出意图 acceptance。",
        evidence: [INTENT_REL, "docs/proposals/flow-a-v1.md"],
      },
    });
    const out = await judge(baseRequest({
      projectRoot: root,
      cardKind: "acceptance",
      roleId: "verifier",
      card: {
        kind: "choice",
        title: "验收 flow-a",
        options: [{ id: "accept", label: "验收" }, { id: "reject", label: "不验收" }],
        cardKind: "acceptance",
        flowId: "flow-a",
      },
      artifacts: { proposalPath: "docs/proposals/flow-a-v1.md", flowPath: "docs/flows/flow-a.md" },
      facts: facts({ proposalDecision: "accepted", dispatchedStepIds: ["s1"] }),
    }));
    assert.equal(out.verdict, "manual");
    assert.equal(out.reasonCode, "intent-drift");
  });
});

// —————————————————————— ⑤ rubric 明确排除工程审查 ——————————————————————

test("系统提示：只判意图漂移；不判工程质量/架构/测试覆盖/证据充分性", () => {
  const prompt = buildGovernanceJudgeSystemPrompt();
  assert.match(prompt, /只判意图漂移/);
  assert.match(prompt, /超出意图范围/);
  assert.match(prompt, /引入未授权的非目标/);
  assert.match(prompt, /与已接受的治理决定冲突/);
  assert.match(prompt, /未经客户改约扩写写区/);
  assert.match(prompt, /改变状态机语义/);
  assert.match(prompt, /增加新角色/);
  assert.match(prompt, /缺失\/自相矛盾\/无法核对/);
  assert.match(prompt, /不判断（明确排除）/);
  assert.match(prompt, /提案缺少架构章节不是拒绝理由/);
  assert.match(prompt, /由 Draft\/Proof 的工作流与验收负责/);
  assert.doesNotMatch(prompt, /架构门槛/, "旧架构门槛已移除");
});

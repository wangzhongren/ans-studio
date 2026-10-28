// test/测试/entry-role-minimal-d.test.ts
// D 批（2026-10-28 治理机器撤除）：专项出口检查。
//
// 覆盖：
//   1. 六角色写区切换（product→docs/product、convener→docs/scheduling、verifier→docs/quality+verification、
//      chief→docs/intents）；convener 不再有 dispatch/role_status/session_tail；liaison 职能已删除。
//   2. 运行时工具面不再注册已撤除的 flow/gate/账本/分诊/交接工具。
//   3. judge facts 只来自任务/申请上下文（旧账本快照参数被忽略）。
//   4. 生产源码不再出现 D-04 撤除残留标识（排除构建产物）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  BUILT_IN_GOVERNANCE_ROLES,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";
import { resolveGovernanceRole } from "../../src/service/role/resolve-role.ts";
import { buildGovernanceJudgeFacts } from "../../src/common/编排/governance-judge-facts.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import type { GovernanceFunction } from "../../src/model/role.ts";
import type { WriteGate } from "../../src/model/runtime.ts";

const ROOT = process.cwd();

test("D 写区切换：六角色 Section 1 与能力矩阵按目标态生效", () => {
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((role) => role.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    "D 批注册表恰为六角色（liaison 不再出现）",
  );
  const rootOf = (id: string): string[] =>
    (governanceRoleOf(id)?.entries ?? []).map((entry) => entry.path);
  assert.ok(rootOf("product").includes("docs/product/"), "product 目标写区 docs/product/");
  assert.equal(rootOf("product").includes("docs/intents/"), false, "product 不再承接 chief 的 docs/intents/");
  assert.ok(rootOf("convener").includes("docs/scheduling/"), "convener 写计划/分析/调度记录");
  assert.ok(rootOf("verifier").includes("docs/quality/"), "verifier 写质量记录");
  assert.ok(rootOf("verifier").includes("docs/verification/"), "verifier 保留证据附件写区");
  assert.ok(rootOf("chief").includes("docs/intents/"), "chief 写意图");
  for (const id of ["product", "convener", "verifier", "rapporteur", "nominator", "chief"]) {
    const caps = governanceRoleOf(id)!.capabilities;
    if (id === "convener") {
      assert.equal(caps.dispatchTask, false, "convener 不再有 dispatch");
      assert.equal(caps.roleStatus, false, "convener 不再有 role_status");
      assert.equal(caps.sessionTail, false, "convener 不再有 session_tail");
    }
  }
  assert.equal(governanceRoleOf("liaison"), undefined, "liaison 不再是内置角色");
  assert.throws(
    () =>
      resolveGovernanceRole(
        {
          projectRoot: "",
          roles: [],
          warnings: [],
          hasRoles: false,
          primaryRoleId: "chief",
          governanceModel: "trio",
        },
        { function: "liaison" as GovernanceFunction },
      ),
    /未知治理职能/,
    "旧 liaison 职能已删除（不再有别名）",
  );
});

test("D 工具面：flow/gate/账本/分诊/交接/产物汇报工具不注册", () => {
  const gate: WriteGate = (() => ({
    allowed: true,
    reason: "",
    allowedByRoot: { skill: [], project: [] },
  })) as unknown as WriteGate;
  const tools = buildGovernedTools(gate, {
    customerInput: (() => ({ outcome: "unavailable", reason: "test" })) as never,
    dispatchTask: (() => ({ ok: true })) as never,
    requestRequirementChange: (async () => ({ ok: true, code: "dispatched", message: "ok" })) as never,
    roleStatus: (() => ({ ok: true, text: "" })) as never,
    sessionTail: (() => ({ ok: true, text: "" })) as never,
  });
  const names = new Set(tools.map((tool) => tool.name));
  for (const tool of [
    "hand_off_intent",
    "request_clarification",
    "flow_get",
    "flow_step_update",
    "flow_step_supersede",
    "request_acceptance",
    "request_gate_review",
    "request_boundary_change",
    "schedule-write",
    "report_artifact_ready",
    "propose_recovery",
  ]) {
    assert.equal(names.has(tool), false, `${tool} 不得注册`);
  }
  assert.equal(names.has("dispatch_task"), true, "chief/legacy 的星形派发保留");
  assert.equal(names.has("request_requirement_change"), true, "C 批需求变更申请保留");
});

test("D judge facts：只读任务/申请上下文；旧账本快照参数被忽略", () => {
  const facts = buildGovernanceJudgeFacts({
    flowId: "flow-a",
    snapshot: { entries: [{ kind: "customer.decision" }], errors: [{ message: "legacy" }] },
    facts: { proposalDecision: "accepted", appointmentTargetRoleIds: ["worker"] },
  });
  assert.equal(facts.ledgerErrors, 0, "账本快照错误不得再进入 judge facts");
  assert.equal(facts.flowId, "flow-a");
  assert.equal(facts.proposalDecision, "accepted");
  assert.deepEqual(facts.appointmentTargetRoleIds, ["worker"]);
});

const D04_RESIDUE =
  /governance-gate|governance-ledger|flow_get|flow_step_update|flow_step_supersede|flow-service|flow-state|team-plan|acceptance-triage|acceptance-rework|request_acceptance|request_gate_review|request_boundary_change|hand_off_intent|request_clarification|schedule-write|report_artifact_ready|docs\/flows\/|ledger\.jsonl/;

function* filesUnder(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      if (name === "dist" || name === "node_modules") continue;
      yield* filesUnder(abs);
    } else if (/\.(ts|tsx|js|mjs|cjs|json|css|md)$/.test(name)) {
      yield abs;
    }
  }
}

test("D-04 撤除残留：src/app 生产源码零命中（排除 dist/node_modules）", () => {
  const hits: string[] = [];
  for (const dir of [join(ROOT, "src"), join(ROOT, "app")]) {
    for (const file of filesUnder(dir)) {
      const text = readFileSync(file, "utf8");
      const match = D04_RESIDUE.exec(text);
      if (match !== null) hits.push(`${relative(ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(hits, [], "D-04 撤除残留");
});

const QUALITY_BASELINE_RESIDUE = /ENGINEERING_QUALITY_BASELINE|ENGINEERING_QUALITY_STAGE_REQUIREMENTS|工程质量基线/;

test("D-03/D-10：强制工程质量/证据基线常量与文本不得存在", () => {
  const hits: string[] = [];
  for (const dir of [join(ROOT, "src"), join(ROOT, "app")]) {
    for (const file of filesUnder(dir)) {
      const text = readFileSync(file, "utf8");
      const match = QUALITY_BASELINE_RESIDUE.exec(text);
      if (match !== null) hits.push(`${relative(ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(hits, [], "强制质量/证据基线残留");
});

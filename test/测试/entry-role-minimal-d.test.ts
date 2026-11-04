// test/测试/entry-role-minimal-d.test.ts
// D 批（2026-10-28 治理机器撤除）：专项出口检查。
//
// 覆盖：
//   1. 六角色写区切换（product→docs/product、convener→docs/scheduling、verifier→docs/quality+verification、
//      chief→docs/intents）；convener 不再有 dispatch/role_status/session_tail；liaison 职能已删除。
//   2. 运行时工具面不再注册已撤除的 flow/gate/账本/分诊/交接工具。
//   3. judge facts 只来自任务/申请上下文（旧账本快照参数被忽略）。
//   4. 生产源码不再出现 D-04 撤除残留标识（排除构建产物；P1.6 工件类别词面按 D04_ALLOWLIST 逐行精确豁免）。

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
      // 2026-10-29（方案 v2.1/Topology v4.1，已批准权限 delta）：运营是项目运营者——拥有 dispatch，
      // 目标矩阵由应用前置校验（M6/M7）机械执行；role_status/session_tail 仍不开放。
      assert.equal(caps.dispatchTask, true, "v4.1：convener 获得 dispatch（作用域由前置校验执行）");
      assert.equal(caps.roleStatus, false, "convener 仍无 role_status");
      assert.equal(caps.sessionTail, false, "convener 仍无 session_tail");
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

test("§5A 意图入口契约：四卡含模板/命名规则，其他内置角色不携带", () => {
  const card = (id: string): string => governanceRoleOf(id)?.cardText ?? "";
  const common = ["docs/intents/<intentId>.md", "intentId:", "goal:", "验收标准", "不得用 flowId 代替"];
  for (const id of ["chief", "product", "rapporteur", "nominator"]) {
    for (const clause of common) assert.ok(card(id).includes(clause), `${id} 卡缺契约子句：${clause}`);
  }
  assert.match(card("chief"), /你是唯一写者/);
  assert.match(card("chief"), /照抄下方模板/);
  assert.match(card("product"), /必须含 YAML frontmatter/);
  for (const key of ["intentId", "flowId", "version"]) assert.ok(card("product").includes(key), `product 卡缺 frontmatter 字段 ${key}`);
  assert.match(card("rapporteur"), /提案 frontmatter 必须含 `intentId`/);
  assert.match(card("rapporteur"), /原样复制/);
  assert.match(card("rapporteur"), /roster\/architecture/);
  assert.match(card("nominator"), /提交 appointment 前/);
  assert.match(card("nominator"), /三者一致/);
  for (const id of ["convener", "verifier"]) {
    assert.equal(card(id).includes("意图入口（你是唯一写者）"), false, `${id} 卡不应携带意图入口契约`);
    assert.equal(card(id).includes("intentId:"), false, `${id} 卡不应携带意图模板`);
  }
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

// D-04 语义 allowlist（Batch 3.5，2026-11-05 照会 `docs/communication/2026-11-05_gate_closure_batch-3.5.md`，
// SHA-256 `43220baf…` 授权“按实际含义 allowlist 或修正测试，不得一刀切放宽”）：
// D 批撤除的是 flow/team-plan **机器**（模块、工具、账本、schema）；trunk-amendment P1.6 把 `team-plan`/`flow`
// 作为**工件类别**（VCA target kind、重构禁区、execution 路径映射）合法使用，属新 feature 语义，不是旧入口残留。
// 豁免精度必须同时满足：文件全等 + 词面全等 + 整行锚点（^…$）匹配；allowlist 条目未命中任何真实词面亦失败（防腐烂）。
interface D04AllowlistEntry {
  readonly file: string; // repo 相对 POSIX 路径
  readonly token: string; // D04_RESIDUE 实际命中的词面
  readonly line: RegExp; // 必须匹配 trim 后的整行才算豁免
  readonly reason: string;
}

const D04_ALLOWLIST: readonly D04AllowlistEntry[] = Object.freeze([
  {
    file: "src/model/version-change.ts",
    token: "team-plan",
    line: /^export type RefactorForbiddenKind = "versioned-doc" \| "boundary" \| "stable" \| "team-plan" \| "flow";$/,
    reason:
      "P1.6 §4.8/AC-7（F40）：team-plan 是重构禁区枚举 RefactorForbiddenKind 的工件类别值（不新增角色/不恢复旧机器）",
  },
  {
    file: "src/model/version-change.ts",
    token: "team-plan",
    line: /^"team-plan",$/,
    reason: "P1.6 §4.8/AC-7（F40）：REFACTOR_FORBIDDEN_KINDS 冻结数组中的同一工件类别值",
  },
  {
    file: "src/pipeline/orchestration/version-change-runtime.ts",
    token: "docs/flows/",
    line: /^if \(pathRel\.startsWith\("docs\/flows\/"\)\) return "flow";$/,
    reason:
      "P1.6 §4.7/AC-29（F39）：execution 工件 docs/flows/<flowId>.yaml（若存在）→ kind flow 的 VCA target 映射",
  },
  {
    file: "src/service/version-change/impl/refactor-validate.ts",
    token: "team-plan",
    line: /^kind: "team-plan",$/,
    reason: "P1.6 §4.8/AC-7：重构 scope 含 docs/scheduling/ 时的拒绝分类 kind=team-plan（early warning，机械保证在 WriteGate）",
  },
  {
    file: "src/service/version-change/impl/refactor-validate.ts",
    token: "team-plan",
    line: /^message: `重构不能改团队计划（kind=team-plan）：\$\{rel\}；请提交版本变更申请（detail-amendment execution）`,$/,
    reason: "P1.6 §4.8/AC-7：上述拒绝分类的客户可见说明文案（kind=team-plan）",
  },
  {
    file: "src/service/version-change/impl/targets-items.ts",
    token: "docs/flows/",
    line: /^\/\/   （docs\/scheduling\/、docs\/flows\/）；$/,
    reason:
      "P1.6 §4.4/§4.7（F39/AC-29）：execution 工件作者写区注释（convener：docs/scheduling/、docs/flows/）",
  },
  {
    file: "src/common/shared/i18n/messages/en-US.ts",
    token: "team-plan",
    line: /^\/\/ `ui\.trunk\.\*` \(22\) is a C3 in-directory key-family extension \(not listed in the team-plan increment §4\.1 C3 row\); disclosed in E1\.$/,
    reason:
      "Batch 3.5 注释引用本批次 increment 团队计划 docs/scheduling/2026-11-04_team-plan_trunk-amendment-model-P1.5-increment.md（C3 i18n 冻结行），非旧机器残留",
  },
  {
    file: "src/provider/runtime/schema.ts",
    token: "team-plan",
    line: /^description: "Concrete file paths touched \(project-relative; versioned docs\/stable\/boundary\/team-plan\/flow are rejected\)",$/,
    reason:
      "P1.6 §4.8/AC-7（F40，C1d）：submit_refactor 的 scope.paths 参数描述列出重构被拒绝的工件类别（team-plan/flow 属 execution 工件，重构不得触碰；机械保证在 WriteGate）",
  },
]);

function collectD04Hits(): { hits: string[]; unusedAllowlist: string[] } {
  const hits: string[] = [];
  const used = new Set<number>();
  const pattern = new RegExp(D04_RESIDUE.source, "g");
  for (const dir of [join(ROOT, "src"), join(ROOT, "app")]) {
    for (const file of filesUnder(dir)) {
      const text = readFileSync(file, "utf8");
      const rel = relative(ROOT, file).split("\\").join("/");
      // 逐出现扫描（原实现每文件只报首个命中；allowlist 后必须逐项核对，避免首个命中豁免遮蔽同文件后续真实残留）。
      for (const match of text.matchAll(pattern)) {
        const index = match.index ?? 0;
        const lineStart = text.lastIndexOf("\n", index - 1) + 1;
        const nextNewline = text.indexOf("\n", index);
        const lineText = text.slice(lineStart, nextNewline === -1 ? text.length : nextNewline).trim();
        const lineNo = text.slice(0, index).split("\n").length;
        const allowedBy = D04_ALLOWLIST.findIndex(
          (entry) => entry.file === rel && entry.token === match[0] && entry.line.test(lineText),
        );
        if (allowedBy === -1) {
          hits.push(`${rel}:${lineNo}: ${match[0]} @ ${lineText}`);
        } else {
          used.add(allowedBy);
        }
      }
    }
  }
  const unusedAllowlist = D04_ALLOWLIST.filter((_, index) => !used.has(index)).map(
    (entry) => `${entry.file}: ${entry.token}`,
  );
  return { hits, unusedAllowlist };
}

test("D-04 撤除残留：src/app 生产源码零命中（排除 dist/node_modules）", () => {
  const { hits, unusedAllowlist } = collectD04Hits();
  assert.deepEqual(hits, [], "D-04 撤除残留");
  assert.deepEqual(unusedAllowlist, [], "D-04 语义 allowlist 存在 stale 条目（未命中任何真实词面，需复核）");
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

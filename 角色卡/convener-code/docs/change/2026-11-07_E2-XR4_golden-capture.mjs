#!/usr/bin/env node
// E2 X-R4 convener 差分 fixture 金样化捕获（一次性工具；随角色证据归档）。
//
// 目的：`test/roles/convener/convener-differential.test.ts` 原以旧引擎为 live oracle；
// X-R4 门面切换后规格用例退化为模块自比较。按 E2 检查单 G9（先冻结金样：场景输入 +
// 期望输出 + 来源候选 + hash；禁止删断言/整文件）把现有差分矩阵冻结为纯数据 fixture。
//
// 用法（仓库根 = 本文件上四级；可用 --root 覆盖）：
//   node 角色卡/convener-code/docs/change/2026-11-07_E2-XR4_golden-capture.mjs \
//     [--root <repo>] [--out <capture.json>] [--emit-fixture <oracle-fixture.ts>]
//
// 捕获口径（2026-11-07，工作树 trunk-amendment；旧引擎仍在，仅捕获期使用）：
//  - spec/cards/tools：模块当前值（X-R4 §5 已证与切换前逐字段 0 差异）冻结为期望值；
//  - dispatch：逐组合调用旧 `evaluateDispatchAuthorization`（来源 convener）捕获 oldAllow/oldCode；
//    新模块 allow/稳定码/reportToRoleId 同批记录。非已知差异组合要求 allow 位一致，否则脚本失败。
//  - preflight：旧角色侧谓词转写（team-plan / stable-write / requirement-change）捕获 oldAllow；
//    新模块 allow/稳定码逐例记录。Git 动作旧实现无纯函数 oracle，冻结模块行为 + 历史锚点。
//
// 生成的 fixture 不含任何旧引擎 import；测试运行期不读取旧文件。

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = path.resolve(HERE, "../../../..");
  let out = path.join(HERE, "2026-11-07_E2-XR4_golden-capture.json");
  let emitFixture = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--root") root = path.resolve(args[++i]);
    else if (args[i] === "--out") out = path.resolve(args[++i]);
    else if (args[i] === "--emit-fixture") emitFixture = path.resolve(args[++i]);
    else throw new Error(`unknown argument: ${args[i]}`);
  }
  return { root, out, emitFixture };
}

const { root: ROOT, out: OUT, emitFixture: EMIT_FIXTURE } = parseArgs(process.argv);

const importTs = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sha256Text = (text) => sha256(Buffer.from(text, "utf8"));
const readFile = (rel) => readFileSync(path.join(ROOT, rel));

const convenerModuleNs = await importTs("src/common/roles/convener/index.ts");
const roleToolRegistry = await importTs("src/common/门禁引擎/role-tool-registry.ts");
const workflowPreconditions = await importTs("src/common/编排/workflow-preconditions.ts");

const MODULE = convenerModuleNs.convenerRoleModule;
const GOLDEN_DATE = "2026-11-07";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const GIT_OID = Object.freeze({ objectFormat: "sha256", hex: "c".repeat(64) });
const GIT_OID_2 = Object.freeze({ objectFormat: "sha256", hex: "d".repeat(64) });
const GIT_BASIS = Object.freeze({ ref: "refs/ans/candidates/example", oid: GIT_OID });
const EVIDENCE_REF = Object.freeze({ oid: GIT_OID, path: "docs/quality/report.md", sha256: SHA_A });

// —————————————————————— 1. 规格 / cards / tools ——————————————————————

const CARD_TEXT = MODULE.card.text;

const spec = {
  id: MODULE.id,
  displayName: MODULE.displayName,
  function: MODULE.function,
  entries: MODULE.card.entries.map((entry) => ({ ...entry })),
  preauthorizedDirs: [...MODULE.card.preauthorizedDirs],
  forbiddenWritePaths: [...MODULE.card.forbiddenWritePaths],
  capabilities: { ...MODULE.capabilities },
  cards: [...MODULE.cards],
  cardText: {
    length: CARD_TEXT.length,
    lineCount: CARD_TEXT.split("\n").length,
    sha256: sha256Text(CARD_TEXT),
  },
};

const toolsTrio = roleToolRegistry.ROLE_TOOL_CATALOG
  .filter((entry) => entry.allowedRoleIds.includes("convener"))
  .map((entry) => entry.id);
const toolsSingle = [...MODULE.tools({ governanceModel: "single" }).tools];

if (JSON.stringify(toolsTrio) !== JSON.stringify([...MODULE.tools({ governanceModel: "trio" }).tools])) {
  throw new Error("trio tools mismatch between D1 catalog and module declaration");
}
if (spec.cards.length !== 1 || spec.cards[0] !== "decision") {
  throw new Error(`unexpected cards: ${JSON.stringify(spec.cards)}`);
}

// —————————————————————— 2. dispatch 矩阵（旧谓词 vs 模块） ——————————————————————

const DISPATCH_TARGETS = [
  "verifier",
  "chief",
  "product",
  "rapporteur",
  "nominator",
  "convener",
  "implementer",
  "env-bootstrap",
  "",
];
const DISPATCH_KINDS = ["built-in-governance", "project"];

function knownDispatchDelta(input) {
  if (input.targetKind === "built-in-governance" && input.targetRoleId === "verifier" && input.targetExists !== true) {
    return "dispatch-existence";
  }
  if (input.targetRoleId === "" && input.targetKind === "project" && input.targetExists === true) {
    return "dispatch-empty-target";
  }
  return null;
}

function targetLabel(targetRoleId) {
  return targetRoleId === "" ? "空目标" : targetRoleId;
}

const dispatchCases = [];
for (const targetRoleId of DISPATCH_TARGETS) {
  for (const targetKind of DISPATCH_KINDS) {
    for (const targetExists of [true, false, undefined]) {
      const input = {
        sourceRoleId: "convener",
        targetRoleId,
        targetKind,
        ...(targetExists === undefined ? {} : { targetExists }),
      };
      const oldResult = workflowPreconditions.evaluateDispatchAuthorization({
        fromRoleId: input.sourceRoleId,
        targetRoleId: input.targetRoleId,
        targetBuiltIn: input.targetKind === "built-in-governance",
        targetExists: input.targetExists ?? false,
        chiefRoleId: "chief",
        convenerRoleId: "convener",
      });
      const policy = MODULE.dispatch(input);
      const knownDelta = knownDispatchDelta(input);
      const expectedAllow = policy.decision.allow;
      if (oldResult.ok !== expectedAllow && knownDelta === null) {
        throw new Error(
          `unexpected dispatch allow difference: ${targetRoleId || "<empty>"}/${targetKind}/exists=${String(targetExists)} ` +
            `old=${oldResult.ok} module=${expectedAllow}`,
        );
      }
      if (knownDelta !== null && !(oldResult.ok === true && expectedAllow === false)) {
        throw new Error(`known delta no longer divergent: ${targetRoleId || "<empty>"}/${targetKind}/${String(targetExists)}`);
      }
      dispatchCases.push({
        name: `${targetLabel(targetRoleId)}/${targetKind === "built-in-governance" ? "内置" : "项目"}/exists=${
          targetExists === undefined ? "缺省" : String(targetExists)
        }`,
        input,
        oldAllow: oldResult.ok,
        oldCode: oldResult.ok ? null : oldResult.code,
        expectedAllow,
        expectedCode: expectedAllow ? null : policy.decision.code,
        expectedReportToRoleId: policy.reportToRoleId ?? null,
        knownDelta,
      });
    }
  }
}

// —————————————————————— 3. preflight 矩阵（旧角色侧谓词 vs 模块） ——————————————————————

function oracleTeamPlanRoleGate(facts) {
  const actor = facts["actorRoleId"];
  const operationId = facts["operationId"];
  const flowId = facts["flowId"];
  const baseDigest = facts["baseDigest"];
  const runId = facts["runId"];
  const plan = facts["plan"];
  if (actor !== "convener") return false;
  if (typeof operationId !== "string" || operationId === "") return false;
  if (typeof flowId !== "string" || flowId === "") return false;
  if (typeof baseDigest !== "string" || !/^[a-f0-9]{64}$/i.test(baseDigest)) return false;
  if (runId !== undefined && (typeof runId !== "string" || runId === "")) return false;
  if (
    typeof plan !== "object" ||
    plan === null ||
    !("path" in plan) ||
    !("version" in plan) ||
    typeof plan.path !== "string" ||
    !Number.isSafeInteger(plan.version) ||
    plan.version < 1
  ) {
    return false;
  }
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^docs/scheduling/${escaped}-team-v${plan.version}\\.md$`).test(plan.path);
}

function oracleStableWriteGate(facts) {
  return facts["actorRoleId"] === "convener" && facts["kind"] === "workflow";
}

function oracleRequirementChangeGate(facts) {
  const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";
  const hasScope = nonEmpty(facts["flowId"]) || nonEmpty(facts["intentId"]) || nonEmpty(facts["taskId"]);
  if (!hasScope) return false;
  if (!["scope", "authorization", "constraint", "cost", "other"].includes(String(facts["changeKind"]))) return false;
  if (!nonEmpty(facts["summary"]) || !nonEmpty(facts["rationale"])) return false;
  if (facts["impact"] !== undefined && !nonEmpty(facts["impact"])) return false;
  if (facts["proposedIntentPatch"] !== undefined && !nonEmpty(facts["proposedIntentPatch"])) return false;
  return true;
}

function modulePreflight(action, facts) {
  return MODULE.preflight.checkAction({ action, facts });
}

const TEAM_PLAN_ANCHOR =
  "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）";
const STABLE_WRITE_ANCHOR =
  "run-role.ts:1830/2347-2349（canRequestStableWrite 仅 convener）；model/runtime.ts:2503-2508（kind 闭集 workflow）";
const REQUIREMENT_CHANGE_ANCHOR =
  "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）";

function teamPlanFacts(overrides = {}) {
  return {
    actorRoleId: "convener",
    operationId: "op-plan-1",
    flowId: "focus",
    runId: "run-1",
    baseDigest: SHA_A,
    plan: { path: "docs/scheduling/focus-team-v2.md", sha256: SHA_B, version: 2 },
    ...overrides,
  };
}

const preflightCases = [];

function addPreflightCase({ name, action, facts, oldAnchor, oracle, knownDelta = null }) {
  const oldAllow = oracle(facts);
  const decision = modulePreflight(action, facts);
  const expectedAllow = decision.allow;
  if (knownDelta === null && oldAllow !== expectedAllow) {
    throw new Error(`unexpected preflight allow difference: ${name} old=${oldAllow} module=${expectedAllow}`);
  }
  if (knownDelta !== null && !(oldAllow === true && expectedAllow === false)) {
    throw new Error(`known preflight delta no longer divergent: ${name}`);
  }
  preflightCases.push({
    name,
    action,
    facts,
    oldAnchor,
    oldAllow,
    expectedAllow,
    expectedCode: expectedAllow ? null : decision.code,
    knownDelta,
  });
}

// team-plan（12 例）
const teamPlanDomain = [
  ["team-plan 基线正例", teamPlanFacts(), null],
  ["team-plan runId 缺省", teamPlanFacts({ runId: undefined }), null],
  ["team-plan baseDigest 大写 64hex 正例", teamPlanFacts({ baseDigest: "A".repeat(64) }), null],
  ["team-plan 非 convener 身份", teamPlanFacts({ actorRoleId: "chief" }), null],
  ["team-plan operationId 空", teamPlanFacts({ operationId: "" }), null],
  ["team-plan flowId 空", teamPlanFacts({ flowId: "" }), null],
  ["team-plan baseDigest 63 字符", teamPlanFacts({ baseDigest: "a".repeat(63) }), null],
  [
    "team-plan 路径版本不匹配",
    teamPlanFacts({ plan: { path: "docs/scheduling/focus-team-v2.md", sha256: SHA_B, version: 3 } }),
    null,
  ],
  [
    "team-plan flow 不匹配",
    teamPlanFacts({ plan: { path: "docs/scheduling/other-team-v2.md", sha256: SHA_B, version: 2 } }),
    null,
  ],
  [
    "team-plan plan 缺 sha256（已知差异）",
    teamPlanFacts({ plan: { path: "docs/scheduling/focus-team-v2.md", version: 2 } }),
    "team-plan-fact-schema",
  ],
  [
    "team-plan plan sha256 非 64hex（已知差异）",
    teamPlanFacts({ plan: { path: "docs/scheduling/focus-team-v2.md", sha256: "not-a-sha", version: 2 } }),
    "team-plan-fact-schema",
  ],
  [
    "team-plan version 0",
    teamPlanFacts({ plan: { path: "docs/scheduling/focus-team-v2.md", sha256: SHA_B, version: 0 } }),
    null,
  ],
];
for (const [name, facts, knownDelta] of teamPlanDomain) {
  addPreflightCase({
    name,
    action: "team-plan",
    facts,
    oldAnchor: TEAM_PLAN_ANCHOR,
    oracle: oracleTeamPlanRoleGate,
    knownDelta,
  });
}

// stable-write（5 例）
const stableWriteDomain = [
  ["stable-write workflow 正例", { actorRoleId: "convener", kind: "workflow", content: "x" }, null],
  ["stable-write kind=role-card", { actorRoleId: "convener", kind: "role-card", content: "x" }, null],
  ["stable-write kind=boundary", { actorRoleId: "convener", kind: "boundary", content: "x" }, null],
  ["stable-write 非 convener", { actorRoleId: "chief", kind: "workflow", content: "x" }, null],
  ["stable-write 空 content（已知差异）", { actorRoleId: "convener", kind: "workflow", content: "" }, "stable-write-empty-content"],
];
for (const [name, facts, knownDelta] of stableWriteDomain) {
  addPreflightCase({
    name,
    action: "stable-write",
    facts,
    oldAnchor: STABLE_WRITE_ANCHOR,
    oracle: oracleStableWriteGate,
    knownDelta,
  });
}

// requirement-change（10 例）
const requirementBase = {
  actorRoleId: "convener",
  changeKind: "scope",
  summary: "需要补充验收证据",
  rationale: "现有证据不足以覆盖真实环境",
  flowId: "focus",
};
const requirementDomain = [
  ["requirement-change flowId 归因正例", { ...requirementBase }, null],
  ["requirement-change intentId 归因正例", { ...requirementBase, flowId: undefined, intentId: "intent-1" }, null],
  ["requirement-change taskId 归因正例", { ...requirementBase, flowId: undefined, taskId: "task-1" }, null],
  ["requirement-change 无归因键", { ...requirementBase, flowId: undefined }, null],
  ["requirement-change 非法 changeKind", { ...requirementBase, changeKind: "unknown" }, null],
  ["requirement-change 空 summary", { ...requirementBase, summary: "" }, null],
  ["requirement-change 空 rationale", { ...requirementBase, rationale: "" }, null],
  ["requirement-change 空 impact", { ...requirementBase, impact: "" }, null],
  ["requirement-change 空 proposedIntentPatch", { ...requirementBase, proposedIntentPatch: "" }, null],
  [
    "requirement-change 可选 impact/patch 正例",
    { ...requirementBase, impact: "影响一个模块", proposedIntentPatch: "建议补充范围" },
    null,
  ],
];
for (const [name, facts, knownDelta] of requirementDomain) {
  addPreflightCase({
    name,
    action: "requirement-change",
    facts,
    oldAnchor: REQUIREMENT_CHANGE_ANCHOR,
    oracle: oracleRequirementChangeGate,
    knownDelta,
  });
}

// —————————————————————— 4. Git 动作行为矩阵（旧实现无纯函数 oracle） ——————————————————————

const GIT_ACTION_ANCHOR =
  "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；" +
  "旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle";

function gitFacts(overrides) {
  return {
    actorRoleId: "convener",
    action: "init",
    operationId: "op-git-1",
    ...overrides,
  };
}

const gitActionDefinitions = [
  [
    "git-action init 正例",
    gitFacts({ action: "init", taskId: "task-1", runId: "run-1", customerSource: true, repositoryState: "absent" }),
  ],
  [
    "git-action init 仓库已存在",
    gitFacts({ action: "init", taskId: "task-1", runId: "run-1", customerSource: true, repositoryState: "present" }),
  ],
  [
    "git-action init 非客户来源",
    gitFacts({ action: "init", taskId: "task-1", runId: "run-1", customerSource: false, repositoryState: "absent" }),
  ],
  [
    "git-action commit 路径未授权",
    gitFacts({
      action: "commit",
      taskId: "task-1",
      runId: "run-1",
      base: GIT_BASIS,
      paths: ["src/example.ts"],
      pathsAuthorized: false,
    }),
  ],
  [
    "git-action integrate 候选未接受",
    gitFacts({
      action: "integrate",
      taskId: "task-1",
      runId: "run-1",
      base: GIT_BASIS,
      candidates: [GIT_OID, GIT_OID_2],
      contributorsAccepted: false,
      contributorsAuthorized: true,
    }),
  ],
  [
    "git-action revert review 未接受",
    gitFacts({
      action: "revert",
      taskId: "task-1",
      runId: "run-1",
      base: GIT_BASIS,
      commit: GIT_OID,
      controllerTaskId: "task-2",
      reviewAccepted: false,
      ownerGrantsVerified: true,
    }),
  ],
  [
    "git-action publish 目标非 delivery",
    gitFacts({
      action: "publish",
      taskId: "task-1",
      runId: "run-1",
      expected: GIT_BASIS,
      candidate: GIT_OID,
      publishTarget: "candidate",
      finalCandidateVerified: true,
      criteria: [EVIDENCE_REF],
      evidence: [EVIDENCE_REF],
      creatorCloseOperationId: "op-close-1",
    }),
  ],
  [
    "git-action publish 正例",
    gitFacts({
      action: "publish",
      taskId: "task-1",
      runId: "run-1",
      expected: GIT_BASIS,
      candidate: GIT_OID,
      publishTarget: "delivery",
      finalCandidateVerified: true,
      criteria: [EVIDENCE_REF],
      evidence: [EVIDENCE_REF],
      creatorCloseOperationId: "op-close-1",
    }),
  ],
  ["git-action 未知动作", gitFacts({ action: "unknown" })],
];

const gitActionCases = gitActionDefinitions.map(([name, facts]) => {
  const decision = modulePreflight("git-action", facts);
  return {
    name,
    facts,
    oldAnchor: GIT_ACTION_ANCHOR,
    expectedAllow: decision.allow,
    expectedCode: decision.allow ? null : decision.code,
  };
});

// —————————————————————— 5. KNOWN_DELTAS / 计数 / 载荷 ——————————————————————

const KNOWN_DELTAS = [
  "dispatch-code-map：旧 evaluateDispatchAuthorization 使用 target-card-missing/unknown-source 等粗粒度拒绝码；新模块按 R-2 给出条件化稳定码（dispatch-target-* / convener-target-forbidden / self-dispatch）。allow 位一致。",
  "dispatch-existence：内置 verifier + targetExists 缺省/false（2 例）：旧谓词对内置目标忽略存在性事实返回 allow；模块按契约 §3.1/D4 要求宿主显式核验（缺省即 false），fail-closed 拒绝。",
  "dispatch-empty-target：空 targetRoleId + project + targetExists=true：旧谓词不校验空 id 返回 allow；模块按硬身份拒绝空目标（dispatch-target-invalid）。",
  "team-plan-fact-schema：plan 缺 sha256 或 sha256 非 64hex（2 例）：旧角色侧谓词只看 path/version 正则；模块按 D4 校验 fact 类型。旧 Service 仍做最终 hash 漂移/结构/名单/属主校验，模块不复制。",
  "stable-write-empty-content：content 空串：旧类型只约束 string 并返回 allow；模块把空内容视为无事实（fail-closed）。Provider/Service 仍做最终内容校验。",
  "git-action-no-pure-oracle：Git 动作的角色侧条件闭包于 Git Service/宿主上下文，旧实现无纯函数 oracle；fixture 冻结模块行为与历史源码锚点，行为正负例由本矩阵与模块单测共同覆盖。",
];

const payload = {
  spec,
  toolsTrio,
  toolsSingle,
  dispatch: dispatchCases,
  preflight: preflightCases,
  gitAction: gitActionCases,
  knownDeltas: KNOWN_DELTAS,
};
const payloadSha256 = sha256Text(JSON.stringify(payload));

const dispatchKnownDeltas = dispatchCases.filter((c) => c.knownDelta !== null);
const preflightKnownDeltas = preflightCases.filter((c) => c.knownDelta !== null);
const counts = {
  specFields: 8,
  cardText: 1,
  cards: 1,
  toolsTrio: toolsTrio.length,
  toolsSingle: toolsSingle.length,
  dispatchCases: dispatchCases.length,
  dispatchKnownDeltas: dispatchKnownDeltas.length,
  preflightCases: preflightCases.length,
  preflightKnownDeltas: preflightKnownDeltas.length,
  gitActionCases: gitActionCases.length,
  knownDeltas: KNOWN_DELTAS.length,
  fixtureComparisons:
    8 + 1 + 1 + toolsTrio.length + toolsSingle.length + dispatchCases.length + preflightCases.length + gitActionCases.length,
};

for (const [label, actual, expected] of [
  ["trio tools", toolsTrio.length, 5],
  ["single tools", toolsSingle.length, 2],
  ["dispatch cases", dispatchCases.length, 54],
  ["dispatch known deltas", dispatchKnownDeltas.length, 3],
  ["preflight cases", preflightCases.length, 27],
  ["preflight known deltas", preflightKnownDeltas.length, 3],
  ["git action cases", gitActionCases.length, 9],
]) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

const dispatchDeltaCounts = Object.fromEntries(
  KNOWN_DELTAS.map((delta) => [delta.slice(0, delta.indexOf("：")), 0]),
);
for (const c of dispatchKnownDeltas) dispatchDeltaCounts[c.knownDelta] += 1;
for (const c of preflightKnownDeltas) dispatchDeltaCounts[c.knownDelta] += 1;

// —————————————————————— 6. 来源身份（捕获期 / 切换后实测） ——————————————————————

const fileIdentity = (rel) => {
  const bytes = readFile(rel);
  const text = bytes.toString("utf8");
  // 与 `wc -l` 同口径（换行符计数），避免 split 在文件尾换行时恒 +1。
  return {
    path: rel,
    lineCount: text === "" ? 0 : (text.match(/\n/g) ?? []).length,
    sha256: sha256(bytes),
  };
};

const capture = {
  governanceRoles: {
    ...fileIdentity("src/common/门禁引擎/governance-roles.ts"),
    lineCount: 794,
    sha256: "fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e",
    anchors: "159（CREATED_TASK_CLOSURE 共享段）/ 178-202（CONVENER_CARD_TEXT）/ 365-411（convener 内联规格）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition:
      "X-R4 已切换：内联卡/规格删除，`specOf(convenerRoleModule)` 装配；matrix 逐字迁入 `BUILT_IN_ROLE_MATRIX.convener`（D6）",
  },
  runRole: {
    ...fileIdentity("src/pipeline/orchestration/run-role.ts"),
    lineCount: 3333,
    sha256: "026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6",
    anchors:
      "1826-1830（directGovernance/工具门控）/ 2347-2349（canRequestStableWrite）/ 2859-2878（TRIO_CARD_KINDS）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition:
      "X-R1 起编排单元修改；X-R4 未改本文件。`TRIO_CARD_KINDS.convener` 仍保留为回退/迁移前源码 oracle",
  },
  roleToolRegistry: {
    ...fileIdentity("src/common/门禁引擎/role-tool-registry.ts"),
    lineCount: 157,
    sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
    anchors: "52-67（ROLE_TOOL_CATALOG）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R4 未改（捕获期与切换后逐字节一致）",
  },
  workflowPreconditions: {
    ...fileIdentity("src/common/编排/workflow-preconditions.ts"),
    lineCount: 1609,
    sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
    anchors: "1530-1570（evaluateDispatchAuthorization）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R4 时点未改；此后并发单元修改（切换后实测见 switch.changed）",
  },
  applyJournal: {
    ...fileIdentity("src/service/trunk/impl/apply-journal.ts"),
    lineCount: 3723,
    sha256: "fd778342ff83ebd51582847cd78f8bdfe0861bd6d8b789e829ac2bfaf3255ffb",
    anchors: "2795/2816-2818（completeTeamPlan 角色侧谓词转写）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R4 时点未改；此后并发单元修改（切换后实测见 switch.changed）",
  },
  runtimeTools: {
    ...fileIdentity("src/provider/runtime/tools.ts"),
    anchors: "3679-3715（request_requirement_change 工具侧事实校验）",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R4 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
  runtimeModel: {
    ...fileIdentity("src/model/runtime.ts"),
    anchors: "2503-2508（RequestStableWriteInput.kind 闭集）",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R4 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
  gitCapabilities: {
    ...fileIdentity("src/service/trunk/impl/git-capabilities.ts"),
    anchors: "convener 身份 / publish 原创建者收口 / git-integration-child-not-accepted / git-revert-request-invalid",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R4 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
};

const moduleIdentity = fileIdentity("src/common/roles/convener/index.ts");

const switchIdentities = {
  changed: {
    governanceRoles: {
      ...fileIdentity("src/common/门禁引擎/governance-roles.ts"),
      lineCount: 649,
      sha256: "c31274f9497298676f2afdedadf2607c2c4d662c362bd76b6f55aaf9d299a1d1",
      anchors:
        "21-23（convener 模块 import）/ 246-262（BUILT_IN_ROLE_MATRIX.convener）/ 356-358（specOf(convenerRoleModule)）/ 423（BUILT_IN_ROLE_MODULES 装配）",
      change: "X-R4 数据门面切换（E2-XR4 证据 §3/§7.1）",
    },
    runRole: {
      ...fileIdentity("src/pipeline/orchestration/run-role.ts"),
      lineCount: 3483,
      sha256: "655095b0bf0d63deef3611b8f9ab0397e696b7c401d9c76fa36b97be298eb417",
      anchors: "3009（TRIO_CARD_KINDS.convener 回退仍在）",
      change: "X-R1 起编排单元修改（非 X-R4）；E2-XR4 证据 §1 实测值",
    },
    workflowPreconditions: {
      ...fileIdentity("src/common/编排/workflow-preconditions.ts"),
      change: "E1 捕获后由并发单元修改（非 X-R4）；仅在金样化元数据记录，不参与期望值",
    },
    applyJournal: {
      ...fileIdentity("src/service/trunk/impl/apply-journal.ts"),
      change: "E1 捕获后由并发单元修改（非 X-R4）；仅在金样化元数据记录，不参与期望值",
    },
  },
  unchanged: {
    roleToolRegistry: {
      ...fileIdentity("src/common/门禁引擎/role-tool-registry.ts"),
      lineCount: 157,
      sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
    },
  },
  measuredAt: "2026-11-07（E2-XR4 证据 §7.1 + 本轮金样化实测）",
};

const moduleData = {
  path: moduleIdentity.path,
  lineCount: moduleIdentity.lineCount,
  sha256: moduleIdentity.sha256,
};

// —————————————————————— 7. fixture 生成 ——————————————————————

function compactLiteral(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(compactLiteral).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).map(
      ([key, item]) => `${propertyKey(key)}: ${compactLiteral(item)}`,
    );
    return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value);
}

function propertyKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function literal(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => `${"  ".repeat(indent + 1)}${literal(item, indent + 1)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  const entries = keys.map(
    (key) => `${"  ".repeat(indent + 1)}${propertyKey(key)}: ${literal(value[key], indent + 1)}`,
  );
  return `{\n${entries.join(",\n")},\n${pad}}`;
}

function renderDispatchCases() {
  return dispatchCases
    .map(
      (c) => `  Object.freeze({
    name: ${JSON.stringify(c.name)},
    input: Object.freeze(${compactLiteral(c.input)}),
    oldAllow: ${c.oldAllow},
    oldCode: ${c.oldCode === null ? "null" : JSON.stringify(c.oldCode)},
    expectedAllow: ${c.expectedAllow},
    expectedCode: ${c.expectedCode === null ? "null" : JSON.stringify(c.expectedCode)},
    expectedReportToRoleId: ${c.expectedReportToRoleId === null ? "null" : JSON.stringify(c.expectedReportToRoleId)},
    knownDelta: ${c.knownDelta === null ? "null" : JSON.stringify(c.knownDelta)},
  }),`,
    )
    .join("\n");
}

function renderPreflightCases() {
  return preflightCases
    .map(
      (c) => `  Object.freeze({
    name: ${JSON.stringify(c.name)},
    action: ${JSON.stringify(c.action)},
    facts: Object.freeze(${literal(c.facts, 2)}),
    oldAnchor: ${JSON.stringify(c.oldAnchor)},
    oldAllow: ${c.oldAllow},
    expectedAllow: ${c.expectedAllow},
    expectedCode: ${c.expectedCode === null ? "null" : JSON.stringify(c.expectedCode)},
    knownDelta: ${c.knownDelta === null ? "null" : JSON.stringify(c.knownDelta)},
  }),`,
    )
    .join("\n");
}

function renderGitActionCases() {
  return gitActionCases
    .map(
      (c) => `  Object.freeze({
    name: ${JSON.stringify(c.name)},
    facts: Object.freeze(${literal(c.facts, 2)}),
    oldAnchor: ${JSON.stringify(c.oldAnchor)},
    expectedAllow: ${c.expectedAllow},
    expectedCode: ${c.expectedCode === null ? "null" : JSON.stringify(c.expectedCode)},
  }),`,
    )
    .join("\n");
}

function renderIdentityMap(map, indent = 6) {
  const pad = " ".repeat(indent);
  return Object.entries(map)
    .map(
      ([key, entry]) =>
        `${pad}${key}: Object.freeze({\n${Object.entries(entry)
          .map(([field, value]) => `${pad}  ${field}: ${JSON.stringify(value)},`)
          .join("\n")}\n${pad}}),`,
    )
    .join("\n");
}

const fixture = `// test/roles/convener/oracle-fixture.ts
//
// convener 角色模块差分金样（E2 X-R4 fixture 金样化；E2 检查单 G9 / B1 M4；
// 先例 test/roles/rapporteur/oracle-fixture.ts）。
//
// 捕获方式（2026-11-07，工作树 trunk-amendment）：
//  - 规格/卡文本：E1 从旧 \`BUILT_IN_GOVERNANCE_ROLES\` convener 行逐字段捕获；X-R4 门面切换后
//    逐字段复核实测 0 差异（E2-XR4 证据 §5）。本文件冻结切换前期望值与切换后实测身份。
//  - cards：\`run-role.ts::TRIO_CARD_KINDS.convener\` 源码提取 = ["decision"]（D8）。
//  - tools：D1 \`ROLE_TOOL_CATALOG\` convener 允许集（trio）；single 为旧 run-role 角色门控两项。
//  - dispatch：逐组合调用旧 \`evaluateDispatchAuthorization\`（来源 convener）捕获 oldAllow/oldCode；
//    新模块期望 allow/稳定码/reportToRoleId 同批冻结。
//  - preflight：旧角色侧谓词（apply-journal / run-role / provider tools）转写捕获 oldAllow；
//    新模块期望 allow/稳定码逐例冻结。Git 动作旧实现无纯函数 oracle（闭包于 Git Service/宿主），
//    冻结模块行为 + 历史锚点（KNOWN_DELTAS::git-action-no-pure-oracle）。
//
// 本文件是**冻结金样**：测试只 import 本 fixture（纯数据）；不读取旧引擎文件字节、不 import 旧
// oracle 模块，旧实现删除后差分仍可运行。\`ORACLE_GOLDEN_META\` 记录来源候选/捕获期哈希/切换后
// 实测/覆盖映射/载荷哈希（防静默漂移）。重新捕获须同步更新 \`payloadSha256\` 并在角色证据登记
// （不得删断言/删矩阵/整文件替换）。

import type { RoleToolId } from "../../../src/model/role.ts";

export interface OracleBoundaryEntry {
  readonly root: "project";
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly purpose: string;
}

export interface OracleCapabilities {
  readonly customerInput: boolean;
  readonly dispatchTask: boolean;
  readonly roleStatus: boolean;
  readonly sessionTail: boolean;
  readonly installSkill: boolean;
  readonly installMcp: boolean;
  readonly shell: "none" | "readonly" | "operator-approve";
}

/** 旧注册表 convener 规格（逐字段；X-R4 前捕获，切换后复核 0 差异）。 */
export const ORACLE_CONVENER_SPEC = Object.freeze({
  id: ${JSON.stringify(spec.id)},
  displayName: ${JSON.stringify(spec.displayName)},
  function: ${JSON.stringify(spec.function)},
  entries: Object.freeze<readonly OracleBoundaryEntry[]>(${literal(spec.entries, 1)}),
  preauthorizedDirs: Object.freeze(${literal(spec.preauthorizedDirs, 1)}),
  forbiddenWritePaths: Object.freeze(${literal(spec.forbiddenWritePaths, 1)}),
  capabilities: Object.freeze<OracleCapabilities>(${literal(spec.capabilities, 1)}),
  cards: Object.freeze(${literal(spec.cards, 1)}),
  cardText: Object.freeze({
    length: ${spec.cardText.length},
    lineCount: ${spec.cardText.lineCount},
    sha256: ${JSON.stringify(spec.cardText.sha256)},
  }),
});

/** D1 \`ROLE_TOOL_CATALOG\` convener 允许集（trio，逐项同序）。 */
export const ORACLE_CONVENER_TRIO_TOOLS: readonly RoleToolId[] = Object.freeze(${literal(toolsTrio, 0)});

/** 旧 run-role 角色门控（single；角色 id === convener，不按治理模型二次收窄）。 */
export const ORACLE_CONVENER_SINGLE_TOOLS: readonly RoleToolId[] = Object.freeze(${literal(toolsSingle, 0)});

export interface OracleDispatchCase {
  readonly name: string;
  readonly input: Readonly<{
    sourceRoleId?: string;
    targetRoleId: string;
    targetKind: "project" | "built-in-governance";
    targetExists?: boolean;
  }>;
  /** 旧 \`evaluateDispatchAuthorization\` 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 旧拒绝码（仅诊断；新模块码见 expectedCode）。allow 时为 null。 */
  readonly oldCode: string | null;
  /** 新模块期望 allow 位。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 新模块期望报告角色（allow 时 "convener"；仅差分期望，实际路由仍在编排）。 */
  readonly expectedReportToRoleId: string | null;
  /** 已知更严格差异的类别（\`KNOWN_DELTAS\` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 派发差分矩阵：9 目标 × 2 类别 × 3 存在性 = 54 例（来源 = convener）。 */
export const ORACLE_DISPATCH_CASES: readonly OracleDispatchCase[] = Object.freeze([
${renderDispatchCases()}
]);

export interface OraclePreflightCase {
  readonly name: string;
  readonly action: "team-plan" | "stable-write" | "requirement-change";
  readonly facts: Readonly<Record<string, unknown>>;
  /** 旧实现行为锚点（历史文件:行；捕获期转写，运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧角色侧谓词的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 新模块期望 allow 位（\`allow:true\` 只表示纯策略不反对）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 已知更严格差异的类别（\`KNOWN_DELTAS\` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 动作前置差分矩阵：team-plan 12 + stable-write 5 + requirement-change 10 = 27 例。 */
export const ORACLE_PREFLIGHT_CASES: readonly OraclePreflightCase[] = Object.freeze([
${renderPreflightCases()}
]);

export interface OracleGitActionCase {
  readonly name: string;
  readonly facts: Readonly<Record<string, unknown>>;
  /** 旧实现行为锚点（Git Service/宿主上下文；无纯函数 oracle）。 */
  readonly oldAnchor: string;
  /** 新模块期望 allow 位（捕获期冻结）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
}

/** Git 动作行为矩阵（旧实现无纯函数 oracle；模块行为 + 历史锚点冻结）。 */
export const ORACLE_GIT_ACTION_CASES: readonly OracleGitActionCase[] = Object.freeze([
${renderGitActionCases()}
]);

/** 已列明差异（模块按 E0.3/D4 更严格，非放宽）。差分测试按前缀逐类断言；新增差异即失败。 */
export const KNOWN_DELTAS: readonly string[] = Object.freeze(${literal(KNOWN_DELTAS, 0)});

export const ORACLE_GOLDEN_PAYLOAD = Object.freeze({
  spec: ORACLE_CONVENER_SPEC,
  toolsTrio: ORACLE_CONVENER_TRIO_TOOLS,
  toolsSingle: ORACLE_CONVENER_SINGLE_TOOLS,
  dispatch: ORACLE_DISPATCH_CASES,
  preflight: ORACLE_PREFLIGHT_CASES,
  gitAction: ORACLE_GIT_ACTION_CASES,
  knownDeltas: KNOWN_DELTAS,
});

export interface OracleSourceIdentity {
  readonly path: string;
  readonly lineCount: number;
  readonly sha256: string;
}

export interface OracleCaptureIdentity extends OracleSourceIdentity {
  /** 捕获期历史锚点（切换后不保证仍对应同一行）。 */
  readonly anchors: string;
  /** 捕获时点（E1 或金样化）。 */
  readonly capturedAt: string;
  /** E2 处置（每文件）——只作历史记录，运行期不读取旧文件。 */
  readonly e2Disposition: string;
}

export interface OracleSwitchIdentity extends OracleSourceIdentity {
  /** 切换后等价结构锚点（实测）。 */
  readonly anchors?: string;
  /** 相对捕获期的变更说明。 */
  readonly change?: string;
}

/**
 * 冻结金样元数据（E2 检查单 G9 / B1 E2.5/M4/D9；先例
 * \`test/roles/rapporteur/oracle-fixture.ts\`）。
 *
 * - \`capture\`：捕获期望值时旧 oracle 文件身份（行数 + SHA-256 + 锚点 + 捕获时点）。
 * - \`switch\`：E2 X-R4 后实测身份（\`changed\` 与捕获期不同；\`unchanged\` 逐字节一致）。
 * - 两者都是**历史记录**：差分测试不读取工作树旧文件，旧实现删除后测试仍可运行。
 * - \`counts\` 与 fixture 数组长度一致；\`coverage\` 记录期望面 → 测试断言映射（不得删覆盖）。
 * - \`payloadSha256\`：冻结载荷哈希（防期望值静默漂移）。
 */
export const ORACLE_GOLDEN_META = Object.freeze({
  schema: "convener-oracle-golden/v1",
  capturedAt: "${GOLDEN_DATE}",
  generator:
    "E1 开发期 live probe（E1 证据 §4）+ E2 X-R4 金样化复算（角色卡/convener-code/docs/change/2026-11-07_E2-XR4_golden-capture.mjs）",
  evidence: Object.freeze({
    capture: "角色卡/convener-code/docs/change/2026-11-07_E1_convener-module-evidence.md §1/§4",
    switch: "角色卡/门禁引擎/docs/change/2026-11-07_E2-XR4_gate-facade-convener-evidence.md §1/§2/§5/§7.1",
    goldenization:
      "角色卡/convener-code/docs/change/2026-11-07_E1_convener-module-evidence.md §10（E2 X-R4 fixture 金样化）",
  }),
  module: Object.freeze({
    path: ${JSON.stringify(moduleData.path)},
    lineCount: ${moduleData.lineCount},
    sha256: ${JSON.stringify(moduleData.sha256)},
  }),
  capture: Object.freeze<Readonly<Record<string, OracleCaptureIdentity>>>({
${renderIdentityMap(capture, 4)}
  }),
  switch: Object.freeze({
    changed: Object.freeze<Readonly<Record<string, OracleSwitchIdentity>>>({
${renderIdentityMap(switchIdentities.changed)}
    }),
    unchanged: Object.freeze<Readonly<Record<string, OracleSourceIdentity>>>({
${renderIdentityMap(switchIdentities.unchanged)}
    }),
    measuredAt: ${JSON.stringify(switchIdentities.measuredAt)},
  }),
  counts: Object.freeze(${literal(counts, 1)}),
  coverage: Object.freeze({
    spec: "差分/规格：8 字段逐项 JSON 比较（含卡文本哈希/条目/预授权/禁写/capabilities）",
    cardText: "差分/卡文本：sha256 / 长度 / 行数",
    cards: "差分/cards：模块 cards 与金样一致（D8 无 legacy token）",
    tools: "差分/tools：trio/single 集合与金样逐项同序",
    dispatch: "差分/dispatch：54 组合 allow 位 + 稳定码 + reportToRoleId；已知差异逐项登记",
    preflight: "差分/动作前置：team-plan 12 + stable-write 5 + requirement-change 10；allow 位/稳定码",
    gitAction: "差分/git-action：9 例模块行为冻结（旧实现无纯函数 oracle）+ 历史锚点",
    knownDeltas: "差分/已知差异清单：6 类前缀齐备且与用例登记一致",
    provenance: "金样/provenance：元数据自洽 / 载荷哈希 / 无旧引擎 live 依赖",
  }),
  payloadSha256: ${JSON.stringify(payloadSha256)},
});
`;

const captureJson = {
  meta: {
    task: "2026-11-07-runtime-gate-role-modularization / E2 X-R4 convener fixture goldenization",
    generatedAt: new Date().toISOString(),
    node: process.version,
    repoRoot: ROOT,
    payloadSha256,
  },
  spec,
  toolsTrio,
  toolsSingle,
  dispatch: dispatchCases,
  preflight: preflightCases,
  gitAction: gitActionCases,
  knownDeltas: KNOWN_DELTAS,
  counts,
  deltaCounts: dispatchDeltaCounts,
  capture,
  switch: switchIdentities,
  module: moduleData,
};

writeFileSync(OUT, `${JSON.stringify(captureJson, null, 2)}\n`, "utf8");
console.log(`capture written: ${OUT}`);
if (EMIT_FIXTURE !== null) {
  writeFileSync(EMIT_FIXTURE, fixture, "utf8");
  console.log(`fixture written: ${EMIT_FIXTURE}`);
}
console.log(
  `spec cardChars=${spec.cardText.length} cardLines=${spec.cardText.lineCount} cardSha=${spec.cardText.sha256.slice(0, 12)}… ` +
    `trio=${toolsTrio.length} single=${toolsSingle.length}`,
);
console.log(
  `dispatch=${dispatchCases.length} (known=${dispatchKnownDeltas.length}) preflight=${preflightCases.length} ` +
    `(known=${preflightKnownDeltas.length}) gitAction=${gitActionCases.length} deltas=${dispatchDeltaCounts ? JSON.stringify(dispatchDeltaCounts) : ""}`,
);
console.log(`payloadSha256=${payloadSha256}`);

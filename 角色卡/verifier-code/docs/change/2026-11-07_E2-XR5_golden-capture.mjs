#!/usr/bin/env node
// E2 X-R5 verifier 差分 fixture 金样化捕获（一次性工具；随角色证据归档）。
//
// 目的：`test/roles/verifier/verifier-differential.test.ts` 原以旧引擎为 live oracle；
// X-R5 门面切换后规格用例退化为模块自比较。按 E2 检查单 G9（先冻结金样：场景输入 +
// 期望输出 + 来源候选 + hash；禁止删断言/整文件）把现有差分矩阵冻结为纯数据 fixture。
//
// 用法（仓库根 = 本文件上四级；可用 --root 覆盖）：
//   node 角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs \
//     [--root <repo>] [--out <capture.json>] [--emit-fixture <oracle-fixture.ts>]
//
// 捕获口径（2026-11-07，工作树 trunk-amendment；旧引擎仍在，仅捕获期使用）：
//  - spec/cards/tools：模块当前值与旧注册表/源码 oracle 逐字段复核（0 差异）后冻结为期望值；
//  - dispatch：逐用例调用旧 `evaluateDispatchAuthorization`（+ `reportTargetForTaskCreator`）
//    捕获 oldAllow/oldCode/oldReport；新模块 allow/稳定码/reportToRoleId 同批记录。
//    zero / documented / module-only 三类口径与 E1 fixture 一致。
//  - preflight：旧 Model 形状 oracle（`isDispatchTaskReviewTarget` + `isTaskReviewBasisRef`）
//    捕获 oldAllow；新模块 allow/稳定码逐例记录。E2 P5 的未登记键负例标 documented。
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
  let out = path.join(HERE, "2026-11-07_E2-XR5_golden-capture.json");
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
const readText = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const [{ verifierRoleModule: MODULE }, governance, registry, workflowPreconditions, runtime] =
  await Promise.all([
    importTs("src/common/roles/verifier/index.ts"),
    importTs("src/common/门禁引擎/governance-roles.ts"),
    importTs("src/common/门禁引擎/role-tool-registry.ts"),
    importTs("src/common/编排/workflow-preconditions.ts"),
    importTs("src/model/runtime.ts"),
  ]);

const GOLDEN_DATE = "2026-11-07";

// —————————————————————— 0. 基础夹具（输入；与 E1 fixture 同值） ——————————————————————

const SHA1_OID = Object.freeze({ objectFormat: "sha1", hex: "0123456789abcdef0123456789abcdef01234567" });
const SHA256_OID = Object.freeze({
  objectFormat: "sha256",
  hex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
});
const CRITERIA_SHA256 = "a".repeat(64);
const VALID_REVIEW_TARGET = Object.freeze({ operationId: "review-op-1", candidate: SHA1_OID });
const VALID_CRITERIA = Object.freeze([
  Object.freeze({ oid: SHA1_OID, path: "docs/quality/flow-1-report-v1.md", sha256: CRITERIA_SHA256 }),
]);
const TWO_CRITERIA = Object.freeze([
  Object.freeze({ oid: SHA1_OID, path: "docs/quality/flow-1-report-v1.md", sha256: CRITERIA_SHA256 }),
  Object.freeze({ oid: SHA256_OID, path: "docs/verification/flow-1-evidence.md", sha256: "b".repeat(64) }),
]);

function validReviewFacts() {
  return { reviewTarget: VALID_REVIEW_TARGET, criteria: VALID_CRITERIA };
}

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

// 旧注册表 oracle（E1 捕获期同源；X-R5 后由 specOf(verifierRoleModule) 派生，捕获后不再独立）。
const oldSpec = governance.governanceRoleOf("verifier");
if (oldSpec === undefined) throw new Error("governanceRoleOf(verifier) missing");
const specComparisons = [
  ["id", spec.id, oldSpec.id],
  ["displayName", spec.displayName, oldSpec.displayName],
  ["function", spec.function, oldSpec.function],
  ["card.text", spec.cardText.sha256, sha256Text(oldSpec.cardText)],
  ["entries", JSON.stringify(spec.entries), JSON.stringify(oldSpec.entries)],
  ["preauthorizedDirs", JSON.stringify(spec.preauthorizedDirs), JSON.stringify(oldSpec.preauthorizedDirs)],
  ["forbiddenWritePaths", JSON.stringify(spec.forbiddenWritePaths), JSON.stringify(oldSpec.forbiddenWritePaths)],
  ["capabilities", JSON.stringify(spec.capabilities), JSON.stringify(oldSpec.capabilities)],
];
for (const [field, actual, expected] of specComparisons) {
  if (actual !== expected) throw new Error(`spec diff ${field}: ${actual} != ${expected}`);
}
if (oldSpec.cardText !== CARD_TEXT) throw new Error("card text differs from old spec (byte level)");
if (spec.cardText.length !== 2250 || spec.cardText.lineCount !== 16) {
  throw new Error(`unexpected card text identity: ${spec.cardText.length}/${spec.cardText.lineCount}`);
}
if (spec.cardText.sha256 !== "ac9511ac64603ea5b14a1436854c78160f7c903d779e74400bc7b263cc165199") {
  throw new Error(`unexpected card text sha256: ${spec.cardText.sha256}`);
}
const projection = governance.builtInRoleModuleDataOf("verifier");
if (projection === undefined) throw new Error("builtInRoleModuleDataOf(verifier) missing");
if (JSON.stringify(projection.card) !== JSON.stringify(MODULE.card)) throw new Error("D2 projection card diff");
if (JSON.stringify(projection.capabilities) !== JSON.stringify(MODULE.capabilities)) {
  throw new Error("D2 projection capabilities diff");
}

// cards：旧 run-role 源码 oracle（D8 迁移前）逐字提取。
const runRoleText = readText("src/pipeline/orchestration/run-role.ts");
const cardsMatch = /verifier:\s*\[([^\]]*)\]/.exec(runRoleText);
if (cardsMatch === null) throw new Error("run-role.ts 缺少 verifier 卡种白名单");
const oldCards = [...cardsMatch[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
if (JSON.stringify(oldCards) !== JSON.stringify(spec.cards)) {
  throw new Error(`cards diff: ${JSON.stringify(oldCards)} != ${JSON.stringify(spec.cards)}`);
}

// tools：D1 14 项 catalog + 空声明校验（旧 validateRoleToolDeclaration 捕获期）。
const toolsCatalog = registry.ROLE_TOOL_CATALOG.map((entry) => ({
  id: entry.id,
  name: entry.name,
  allowedRoleIds: [...entry.allowedRoleIds],
  ...(entry.chiefIndependentDecisionOnly === true ? { chiefIndependentDecisionOnly: true } : {}),
}));
if (toolsCatalog.length !== 14) throw new Error(`unexpected catalog size: ${toolsCatalog.length}`);
for (const entry of toolsCatalog) {
  if (entry.allowedRoleIds.includes("verifier")) throw new Error(`catalog allows verifier: ${entry.id}`);
}

function captureDeclaration(governanceModel) {
  const policy = MODULE.tools({ governanceModel });
  const validation = registry.validateRoleToolDeclaration("verifier", policy.tools);
  return {
    tools: [...policy.tools],
    reasons: [...policy.reasons],
    validation: {
      allow: validation.allow,
      tools: [...validation.tools],
      reasons: [...validation.reasons],
    },
  };
}

const toolsDeclaration = {
  trio: captureDeclaration("trio"),
  single: captureDeclaration("single"),
};
for (const model of ["trio", "single"]) {
  const declared = toolsDeclaration[model];
  if (
    declared.tools.length !== 0 ||
    declared.reasons.length !== 0 ||
    declared.validation.allow !== true ||
    declared.validation.tools.length !== 0 ||
    declared.validation.reasons.length !== 0
  ) {
    throw new Error(`unexpected ${model} tools declaration: ${JSON.stringify(declared)}`);
  }
}

// —————————————————————— 2. dispatch 矩阵（旧谓词 vs 模块） ——————————————————————

const DISPATCH_ANCHOR =
  "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）";

const dispatchDefinitions = [
  {
    name: "chief → verifier（hub 新任务）",
    input: { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "zero",
  },
  {
    name: "convener → verifier（历史路径，仍按真实 creator 回报）",
    input: { sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "zero",
  },
  {
    name: "product → verifier（非真实派发来源）",
    input: { sourceRoleId: "product", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "zero",
  },
  {
    name: "rapporteur → verifier（非真实派发来源）",
    input: { sourceRoleId: "rapporteur", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "zero",
  },
  {
    name: "nominator → verifier（非真实派发来源）",
    input: { sourceRoleId: "nominator", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "zero",
  },
  {
    name: "项目角色 → verifier（非真实派发来源）",
    input: { sourceRoleId: "implementer", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "zero",
  },
  {
    name: "verifier → verifier（自派禁止）",
    input: { sourceRoleId: "verifier", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "zero",
  },
  {
    name: "chief → verifier 但 targetKind=project（结构性禁止）",
    input: { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "project", targetExists: true },
    differential: "zero",
  },
  {
    name: "chief → verifier 但 targetKind=project 且 targetExists=false（kind 先于存在性）",
    input: { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "project", targetExists: false },
    differential: "zero",
  },
  {
    name: "缺省 sourceRoleId（fail-closed；旧函数同判 unknown-source）",
    input: { targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
    differential: "module-only",
  },
  {
    name: "targetRoleId=product（本模块只覆盖向 verifier 的派发）",
    input: { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
    differential: "module-only",
  },
  {
    name: "convener → verifier 但 targetKind=project（不可能事实；旧函数因 targetExists=true 放行）",
    input: { sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "project", targetExists: true },
    differential: "documented",
    knownDelta: "dispatch-kind-mismatch",
  },
  {
    name: "convener → verifier 但 targetKind=project 且 targetExists=false（拒绝码不同）",
    input: { sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "project", targetExists: false },
    differential: "documented",
    knownDelta: "dispatch-kind-mismatch",
  },
  {
    name: "chief → verifier 且 targetExists=false（契约要求缺省/未知即拒绝）",
    input: { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: false },
    differential: "documented",
    knownDelta: "dispatch-existence",
  },
  {
    name: "chief → verifier 且 targetExists 缺省（缺事实即拒绝）",
    input: { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance" },
    differential: "documented",
    knownDelta: "dispatch-existence",
  },
];

function oldAuthorizationOf(input) {
  return workflowPreconditions.evaluateDispatchAuthorization({
    fromRoleId: input.sourceRoleId,
    targetRoleId: input.targetRoleId,
    targetBuiltIn: input.targetKind === "built-in-governance",
    targetExists: input.targetExists ?? false,
    chiefRoleId: "chief",
    convenerRoleId: "convener",
  });
}

const dispatchCases = dispatchDefinitions.map((definition) => {
  const oldResult = oldAuthorizationOf(definition.input);
  const policy = MODULE.dispatch(definition.input);
  const expectedAllow = policy.decision.allow;
  const expectedCode = policy.decision.allow ? null : policy.decision.code;
  const expectedReportToRoleId = policy.reportToRoleId ?? null;
  const oldAllow = oldResult.ok;
  const oldCode = oldResult.ok ? null : oldResult.code;
  const oldReportToRoleId = oldResult.ok
    ? workflowPreconditions.reportTargetForTaskCreator({
        creator: definition.input.sourceRoleId,
        chiefRoleId: "chief",
        convenerRoleId: "convener",
      }) ?? null
    : null;

  if (definition.differential === "zero") {
    if (oldAllow !== expectedAllow) {
      throw new Error(`zero dispatch allow diff: ${definition.name} old=${oldAllow} module=${expectedAllow}`);
    }
    if (oldCode !== expectedCode) {
      throw new Error(`zero dispatch code diff: ${definition.name} old=${oldCode} module=${expectedCode}`);
    }
    if (oldReportToRoleId !== expectedReportToRoleId) {
      throw new Error(`zero dispatch report diff: ${definition.name} old=${oldReportToRoleId} module=${expectedReportToRoleId}`);
    }
  } else if (definition.differential === "documented") {
    const differs = oldAllow !== expectedAllow || oldCode !== expectedCode;
    if (!differs) throw new Error(`documented dispatch no longer divergent: ${definition.name}`);
    if (expectedAllow !== false) throw new Error(`documented dispatch must deny in module: ${definition.name}`);
    if (definition.knownDelta === undefined) throw new Error(`documented dispatch missing knownDelta: ${definition.name}`);
  } else if (definition.differential === "module-only") {
    if (definition.knownDelta === undefined) {
      // module-only 用例统一登记在 dispatch-scope 说明项下。
    }
  } else {
    throw new Error(`unknown differential: ${definition.differential}`);
  }

  return {
    name: definition.name,
    input: definition.input,
    differential: definition.differential,
    oldAnchor: DISPATCH_ANCHOR,
    oldAllow,
    oldCode,
    oldReportToRoleId,
    expectedAllow,
    expectedCode,
    expectedReportToRoleId,
    knownDelta:
      definition.differential === "documented"
        ? definition.knownDelta
        : definition.differential === "module-only"
          ? "dispatch-scope"
          : null,
  };
});

// —————————————————————— 3. review preflight 矩阵（旧 Model 形状 oracle vs 模块） ——————————————————————

const PREFLIGHT_ZERO_ANCHOR =
  "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）";
const PREFLIGHT_DOCUMENTED_ANCHOR =
  "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）";

function oldReviewAllow(facts) {
  const record = facts !== null && typeof facts === "object" ? facts : undefined;
  const target = record?.reviewTarget;
  const criteria = record?.criteria;
  return (
    runtime.isDispatchTaskReviewTarget(target) &&
    runtime.isTaskReviewBasisRef({
      kind: "git-candidate-review",
      candidateOperationId: target.operationId,
      candidate: target.candidate,
      criteria,
    })
  );
}

const preflightDefinitions = [
  // — 17 zero：只含登记键（E1 原矩阵） —
  { name: "合法 reviewTarget（sha1）+ 1 项 criteria", facts: validReviewFacts() },
  {
    name: "合法 reviewTarget（sha256）+ 2 项不同 criteria",
    facts: { reviewTarget: { operationId: "review-op-2", candidate: SHA256_OID }, criteria: TWO_CRITERIA },
  },
  { name: "缺 reviewTarget", facts: { criteria: VALID_CRITERIA } },
  { name: "缺 criteria", facts: { reviewTarget: VALID_REVIEW_TARGET } },
  { name: "facts 为空", facts: {} },
  {
    name: "reviewTarget 多一个键（形状不符）",
    facts: { reviewTarget: { ...VALID_REVIEW_TARGET, kind: "git-candidate-review" }, criteria: VALID_CRITERIA },
  },
  {
    name: "reviewTarget.operationId 为空串（CID 缺失）",
    facts: { reviewTarget: { operationId: "", candidate: SHA1_OID }, criteria: VALID_CRITERIA },
  },
  {
    name: "reviewTarget.candidate 只有 39 hex（非完整最终候选 OID）",
    facts: {
      reviewTarget: { operationId: "review-op-1", candidate: { objectFormat: "sha1", hex: "0".repeat(39) } },
      criteria: VALID_CRITERIA,
    },
  },
  {
    name: "reviewTarget.candidate 未知 objectFormat",
    facts: {
      reviewTarget: { operationId: "review-op-1", candidate: { objectFormat: "md5", hex: "0".repeat(32) } },
      criteria: VALID_CRITERIA,
    },
  },
  { name: "criteria 为空数组", facts: { reviewTarget: VALID_REVIEW_TARGET, criteria: [] } },
  {
    name: "criteria 超过 16 项",
    facts: {
      reviewTarget: VALID_REVIEW_TARGET,
      criteria: Array.from({ length: 17 }, (_, index) => ({
        oid: SHA1_OID,
        path: `docs/quality/f-${index}.md`,
        sha256: CRITERIA_SHA256,
      })),
    },
  },
  {
    name: "criteria 重复（objectFormat+hex+path 相同）",
    facts: {
      reviewTarget: VALID_REVIEW_TARGET,
      criteria: [
        VALID_CRITERIA[0],
        { oid: SHA1_OID, path: "docs/quality/flow-1-report-v1.md", sha256: "c".repeat(64) },
      ],
    },
  },
  {
    name: "criteria path 含通配（非字面路径）",
    facts: {
      reviewTarget: VALID_REVIEW_TARGET,
      criteria: [{ oid: SHA1_OID, path: "docs/quality/*.md", sha256: CRITERIA_SHA256 }],
    },
  },
  {
    name: "criteria sha256 只有 63 hex",
    facts: {
      reviewTarget: VALID_REVIEW_TARGET,
      criteria: [{ oid: SHA1_OID, path: "docs/quality/flow-1-report-v1.md", sha256: "a".repeat(63) }],
    },
  },
  {
    name: "criteria 不是数组",
    facts: { reviewTarget: VALID_REVIEW_TARGET, criteria: "docs/quality/flow-1-report-v1.md" },
  },
  {
    name: "criteria 项多一个键（形状不符）",
    facts: {
      reviewTarget: VALID_REVIEW_TARGET,
      criteria: [{ oid: SHA1_OID, path: "docs/quality/flow-1-report-v1.md", sha256: CRITERIA_SHA256, note: "x" }],
    },
  },
  // — 7 documented：E2 P5 未登记键负例 —
  {
    name: "合法形状 + 未登记 accepted/passed（值一律不读取，未登记键即 deny）",
    facts: { ...validReviewFacts(), accepted: false, passed: false },
    differential: "documented",
  },
  {
    name: "合法形状 + 未登记 accepted/passed/approved（E2 评审实测走私输入）",
    facts: { ...validReviewFacts(), accepted: true, passed: true, approved: true },
    differential: "documented",
  },
  {
    name: "合法形状 + 未登记 smuggledDecision（未登记键先于形状/缺键）",
    facts: { ...validReviewFacts(), smuggledDecision: "accept" },
    differential: "documented",
  },
  {
    name: "非法形状 + 未登记 accepted/passed/approved（未登记键先于形状判定）",
    facts: {
      reviewTarget: { operationId: "", candidate: SHA1_OID },
      criteria: VALID_CRITERIA,
      accepted: true,
      passed: true,
      approved: true,
    },
    differential: "documented",
  },
  {
    name: "缺 reviewTarget + 未登记 accepted（未登记键先于缺键判定）",
    facts: { criteria: VALID_CRITERIA, accepted: true },
    differential: "documented",
  },
  {
    name: "未登记键值为 undefined 仍是未登记键",
    facts: { ...validReviewFacts(), approved: undefined },
    differential: "documented",
  },
  {
    name: "只有未登记键（facts 非空但无登记键）",
    facts: { accepted: true, passed: true },
    differential: "documented",
  },
  {
    name: "facts 为 null（非普通对象，fail-closed）",
    facts: null,
  },
];

let stricterDocumented = 0;
const preflightCases = preflightDefinitions.map((definition) => {
  const differential = definition.differential ?? "zero";
  const oldAllow = oldReviewAllow(definition.facts);
  const decision = MODULE.preflight.checkAction({ action: "review", facts: definition.facts });
  const expectedAllow = decision.allow;
  const expectedCode = decision.allow ? null : decision.code;

  if (differential === "zero") {
    if (oldAllow !== expectedAllow) {
      throw new Error(`zero preflight allow diff: ${definition.name} old=${oldAllow} module=${expectedAllow}`);
    }
  } else {
    if (expectedAllow !== false || expectedCode !== "review-facts-unknown-key") {
      throw new Error(`documented preflight must deny review-facts-unknown-key: ${definition.name}`);
    }
    if (oldAllow) stricterDocumented += 1;
  }

  return {
    name: definition.name,
    facts: definition.facts,
    differential,
    oldAnchor: differential === "zero" ? PREFLIGHT_ZERO_ANCHOR : PREFLIGHT_DOCUMENTED_ANCHOR,
    oldAllow,
    expectedAllow,
    expectedCode,
    knownDelta: differential === "documented" ? "preflight-facts-unknown-key" : null,
  };
});

const zeroPreflightCount = preflightCases.filter((c) => c.differential === "zero").length;
if (zeroPreflightCount !== 17) throw new Error(`zero preflight count: ${zeroPreflightCount}`);
if (preflightCases.length !== 24) throw new Error(`preflight count: ${preflightCases.length}`);
if (stricterDocumented !== 4) throw new Error(`documented stricter count: ${stricterDocumented}`);

// —————————————————————— 4. KNOWN_DELTAS / 计数 / 载荷 ——————————————————————

const KNOWN_DELTAS = [
  "dispatch-scope：模块只回答向 verifier 的派发；缺省 sourceRoleId / 非 verifier 目标等模块独有负例旧函数无法表达（运行期分别落 unknown-source / allow），只冻结模块行为与旧观测值，不作 allow 位差额登记。",
  "dispatch-existence：chief → verifier 且 targetExists=false/缺省（2 例）：旧硬授权对内置目标不读单独 targetExists 返回 allow；模块按契约 §3.1/D4 要求宿主显式核验（缺省即 false），fail-closed 拒绝 target-card-missing。",
  "dispatch-kind-mismatch：convener → verifier 且 targetKind=project（exists=true/false，2 例）：旧函数因 project+exists=true 放行或报 target-card-missing；模块先判 kind 一致性，fail-closed 拒绝 target-kind-mismatch（内置 id 不能作项目角色 id）。",
  "preflight-facts-unknown-key：E2 P5 修复——旧 Model 形状 oracle 不检查顶层事实键；合法形状 + 未登记 accepted/passed/approved/smuggledDecision 等键时旧放行（4 例），模块按契约 §3.4/D4 一律 deny review-facts-unknown-key（更严，非放宽；值不被读取）。",
  "tools-declaration：D1 ROLE_TOOL_CATALOG 14 项无一允许 verifier；旧 validateRoleToolDeclaration('verifier', []) 捕获期 allow:true/tools:[]/reasons:[]；模块声明空集，实际注入仍由引擎按治理模型/宿主能力门控。",
  "cards-source-oracle：旧 run-role.ts::TRIO_CARD_KINDS.verifier 源码 oracle = ['acceptance']（E1 捕获期）；编排 S2 切换/删除后 cards 唯一真源为模块，金样冻结 ['acceptance'] 且 D8 无 legacy token。",
];

const payload = {
  spec,
  toolsCatalog,
  toolsDeclaration,
  dispatch: dispatchCases,
  preflight: preflightCases,
  knownDeltas: KNOWN_DELTAS,
};
const payloadSha256 = sha256Text(JSON.stringify(payload));

const dispatchCounts = {
  zero: dispatchCases.filter((c) => c.differential === "zero").length,
  documented: dispatchCases.filter((c) => c.differential === "documented").length,
  moduleOnly: dispatchCases.filter((c) => c.differential === "module-only").length,
};
if (dispatchCounts.zero !== 9 || dispatchCounts.documented !== 4 || dispatchCounts.moduleOnly !== 2) {
  throw new Error(`dispatch counts: ${JSON.stringify(dispatchCounts)}`);
}

const counts = {
  specFields: 8,
  cardText: 1,
  cards: 1,
  toolsCatalog: toolsCatalog.length,
  toolsDeclaration: 2,
  dispatchCases: dispatchCases.length,
  dispatchZero: dispatchCounts.zero,
  dispatchDocumented: dispatchCounts.documented,
  dispatchModuleOnly: dispatchCounts.moduleOnly,
  preflightCases: preflightCases.length,
  preflightZero: zeroPreflightCount,
  preflightDocumented: preflightCases.length - zeroPreflightCount,
  knownDeltas: KNOWN_DELTAS.length,
  fixtureComparisons: 8 + 1 + toolsCatalog.length + 2 + dispatchCases.length + preflightCases.length,
};
if (counts.fixtureComparisons !== 64) throw new Error(`fixtureComparisons: ${counts.fixtureComparisons}`);

// —————————————————————— 5. 来源身份（捕获期 / 切换后实测） ——————————————————————

const fileIdentity = (rel) => {
  const bytes = readFileSync(path.join(ROOT, rel));
  const text = bytes.toString("utf8");
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
    anchors: "verifier 内联规格 / VERIFIER_CARD_TEXT / BUILT_IN_ROLE_DIR_PREFIXES（E1 捕获期）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition:
      "X-R5 已切换：内联卡/规格删除，`specOf(verifierRoleModule)` 装配；matrix 逐字迁入 `BUILT_IN_ROLE_MATRIX.verifier`（D6）",
  },
  runRole: {
    ...fileIdentity("src/pipeline/orchestration/run-role.ts"),
    lineCount: 3333,
    sha256: "026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6",
    anchors: "TRIO_CARD_KINDS.verifier（E1 捕获期源码对照）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R1 起编排单元修改；X-R5 未改本文件。`TRIO_CARD_KINDS.verifier` 仍保留为回退/迁移前源码 oracle（编排 S2 处置）",
  },
  roleToolRegistry: {
    ...fileIdentity("src/common/门禁引擎/role-tool-registry.ts"),
    lineCount: 157,
    sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
    anchors: "ROLE_TOOL_CATALOG 14 项（E1 捕获期）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R5 未改（捕获期与切换后逐字节一致）",
  },
  workflowPreconditions: {
    ...fileIdentity("src/common/编排/workflow-preconditions.ts"),
    lineCount: 1609,
    sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
    anchors: "evaluateDispatchAuthorization / reportTargetForTaskCreator（E1 捕获期）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R5 时点未改；此后并发单元修改（切换后实测见 switch.changed）",
  },
  modelRuntime: {
    ...fileIdentity("src/model/runtime.ts"),
    anchors: "isDispatchTaskReviewTarget / isTaskReviewBasisRef（review 形状真源）",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R5 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
  modelRole: {
    ...fileIdentity("src/model/role.ts"),
    lineCount: 409,
    sha256: "d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780",
    anchors: "BuiltInRoleModule / RoleToolId 类型契约（E1 冻结）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R5 未改（逐字节一致）",
  },
  contract: {
    ...fileIdentity("docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md"),
    lineCount: 685,
    sha256: "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
    anchors: "§3.1/§3.2/§3.4/§10.2 D4/D8/D10",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "E0.3 冻结契约；本单元复核未漂移（差分测试仍断言哈希）",
  },
};

const moduleIdentity = fileIdentity("src/common/roles/verifier/index.ts");

const switchIdentities = {
  changed: {
    governanceRoles: {
      ...fileIdentity("src/common/门禁引擎/governance-roles.ts"),
      lineCount: 595,
      sha256: "70315a80d47881308e6a7f7983bb0f133eceb53f4d971bb502f147d9b1ce7fa5",
      anchors:
        "21-29（verifier 模块 import）/ 232-246（BUILT_IN_ROLE_MATRIX.verifier）/ 345-347（specOf(verifierRoleModule)）/ 364-373（BUILT_IN_ROLE_MODULES 装配）",
      change: "X-R5 数据门面切换（E2-XR5 证据 §3/§7.1）",
    },
    runRole: {
      ...fileIdentity("src/pipeline/orchestration/run-role.ts"),
      anchors: "TRIO_CARD_KINDS.verifier 回退仍在（编排 S2 待删）",
      change:
        "X-R1 起编排单元修改（非 X-R5）；哈希为金样化实测值（X-R5 证据 §1 记录后并发单元继续修改，故与此后实测可能前移）",
    },
    workflowPreconditions: {
      ...fileIdentity("src/common/编排/workflow-preconditions.ts"),
      change: "E1 捕获后由并发单元修改（非 X-R5）；仅在金样化元数据记录，不参与期望值",
    },
  },
  unchanged: {
    roleToolRegistry: {
      ...fileIdentity("src/common/门禁引擎/role-tool-registry.ts"),
      lineCount: 157,
      sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
    },
    modelRuntime: {
      ...fileIdentity("src/model/runtime.ts"),
    },
    modelRole: {
      ...fileIdentity("src/model/role.ts"),
      lineCount: 409,
      sha256: "d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780",
    },
    contract: {
      ...fileIdentity("docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md"),
      lineCount: 685,
      sha256: "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
    },
  },
  measuredAt: "2026-11-07（E2-XR5 证据 §1/§5/§7.1 + 本轮金样化实测）",
};

const moduleData = {
  path: moduleIdentity.path,
  lineCount: moduleIdentity.lineCount,
  sha256: moduleIdentity.sha256,
};

// —————————————————————— 6. fixture 生成 ——————————————————————

function propertyKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

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
    differential: ${JSON.stringify(c.differential)},
    oldAnchor: ${JSON.stringify(c.oldAnchor)},
    oldAllow: ${c.oldAllow},
    oldCode: ${c.oldCode === null ? "null" : JSON.stringify(c.oldCode)},
    oldReportToRoleId: ${c.oldReportToRoleId === null ? "null" : JSON.stringify(c.oldReportToRoleId)},
    expectedAllow: ${c.expectedAllow},
    expectedCode: ${c.expectedCode === null ? "null" : JSON.stringify(c.expectedCode)},
    expectedReportToRoleId: ${
      c.expectedReportToRoleId === null ? "null" : JSON.stringify(c.expectedReportToRoleId)
    },
    knownDelta: ${c.knownDelta === null ? "null" : JSON.stringify(c.knownDelta)},
  }),`,
    )
    .join("\n");
}

function renderPreflightCases() {
  return preflightCases
    .map((c) => {
      const factsLiteral =
        c.facts === null
          ? "null as unknown as Readonly<Record<string, unknown>>"
          : `Object.freeze(${literal(c.facts, 2)})`;
      return `  Object.freeze({
    name: ${JSON.stringify(c.name)},
    facts: ${factsLiteral},
    differential: ${JSON.stringify(c.differential)},
    oldAnchor: ${JSON.stringify(c.oldAnchor)},
    oldAllow: ${c.oldAllow},
    expectedAllow: ${c.expectedAllow},
    expectedCode: ${c.expectedCode === null ? "null" : JSON.stringify(c.expectedCode)},
    knownDelta: ${c.knownDelta === null ? "null" : JSON.stringify(c.knownDelta)},
  }),`;
    })
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

const fixture = `// test/roles/verifier/oracle-fixture.ts
//
// verifier 角色模块差分金样（E2 X-R5 fixture 金样化；E2 检查单 G9 / B1 M4；
// 先例 test/roles/rapporteur/oracle-fixture.ts 与 test/roles/convener/oracle-fixture.ts）。
//
// 捕获方式（2026-11-07，工作树 trunk-amendment；一次性工具
// \`角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs\`）：
//  - 规格/卡文本：E1 从旧 \`BUILT_IN_GOVERNANCE_ROLES\` verifier 行逐字段捕获；X-R5 门面切换后
//    由本脚本逐字段复核（含 D2 投影、旧卡文本逐字节比较）0 差异后冻结。
//  - cards：\`run-role.ts::TRIO_CARD_KINDS.verifier\` 源码提取 = ["acceptance"]（D8）。
//  - tools：D1 \`ROLE_TOOL_CATALOG\` 14 项（均不含 verifier）+ 旧 \`validateRoleToolDeclaration\`
//    对空声明的捕获结果（allow:true / tools:[] / reasons:[]）。
//  - dispatch：逐用例调用旧 \`evaluateDispatchAuthorization\`（+ \`reportTargetForTaskCreator\`）
//    捕获 oldAllow/oldCode/oldReport；新模块 expectedAllow/稳定码/reportToRoleId 同批冻结。
//    zero / documented / module-only 三类口径与 E1 fixture 一致。
//  - preflight：旧 Model 形状 oracle（\`isDispatchTaskReviewTarget\` + \`isTaskReviewBasisRef\`）
//    捕获 oldAllow；E2 P5 未登记键负例标 documented，旧 oracle 会放行的 4 例证明「更严」差异真实存在。
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

/** 旧注册表 verifier 规格（逐字段；E1 捕获，X-R5 切换后复核 0 差异）。 */
export const ORACLE_VERIFIER_SPEC = Object.freeze({
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

export interface OracleRoleToolCatalogEntry {
  readonly id: RoleToolId;
  readonly name: string;
  readonly allowedRoleIds: readonly string[];
  readonly chiefIndependentDecisionOnly?: true;
}

/** D1 \`ROLE_TOOL_CATALOG\` 14 项冻结清单（E1 捕获；无一允许 verifier）。 */
export const ORACLE_ROLE_TOOL_CATALOG: readonly OracleRoleToolCatalogEntry[] = Object.freeze([
${toolsCatalog
  .map(
    (entry) => `  Object.freeze({
    id: ${JSON.stringify(entry.id)},
    name: ${JSON.stringify(entry.name)},
    allowedRoleIds: Object.freeze(${compactLiteral(entry.allowedRoleIds)}),${
      entry.chiefIndependentDecisionOnly === true ? "\n    chiefIndependentDecisionOnly: true," : ""
    }
  }),`,
  )
  .join("\n")}
]);

/** 旧 \`validateRoleToolDeclaration("verifier", [])\` 与模块空声明冻结期望（trio/single）。 */
export const ORACLE_TOOLS_DECLARATION = Object.freeze({
  trio: Object.freeze({
    tools: Object.freeze(${literal(toolsDeclaration.trio.tools, 2)}),
    reasons: Object.freeze(${literal(toolsDeclaration.trio.reasons, 2)}),
    validation: Object.freeze({
      allow: ${toolsDeclaration.trio.validation.allow},
      tools: Object.freeze(${literal(toolsDeclaration.trio.validation.tools, 3)}),
      reasons: Object.freeze(${literal(toolsDeclaration.trio.validation.reasons, 3)}),
    }),
  }),
  single: Object.freeze({
    tools: Object.freeze(${literal(toolsDeclaration.single.tools, 2)}),
    reasons: Object.freeze(${literal(toolsDeclaration.single.reasons, 2)}),
    validation: Object.freeze({
      allow: ${toolsDeclaration.single.validation.allow},
      tools: Object.freeze(${literal(toolsDeclaration.single.validation.tools, 3)}),
      reasons: Object.freeze(${literal(toolsDeclaration.single.validation.reasons, 3)}),
    }),
  }),
});

export interface OracleDispatchInput {
  readonly sourceRoleId?: string;
  readonly targetRoleId: string;
  readonly targetKind: "project" | "built-in-governance";
  readonly targetExists?: boolean;
}

export interface OracleDispatchCase {
  readonly name: string;
  readonly input: OracleDispatchInput;
  /**
   * 差分口径：
   *  - \`zero\`：旧硬授权可表达同一宿主事实，allow/拒绝码/report 必须与 expected 一致；
   *  - \`documented\`：契约明文差异（存在性/kind 一致性），旧行为不同且方向固定（旧 allow/粗码 → 模块 deny）；
   *  - \`module-only\`：旧函数无法表达该模块范围（缺省 source、非 verifier 目标），只冻结模块行为与旧观测。
   */
  readonly differential: "zero" | "documented" | "module-only";
  /** 旧实现行为锚点（历史；运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧 \`evaluateDispatchAuthorization\` 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 旧拒绝码（仅诊断；新模块码见 expectedCode）。allow 时为 null。 */
  readonly oldCode: string | null;
  /** 旧 \`reportTargetForTaskCreator\` 的报告期望（allow 时为真实来源；否则 null）。 */
  readonly oldReportToRoleId: string | null;
  /** 新模块期望 allow 位。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 新模块期望报告角色（allow 时为来源；仅差分期望，实际路由仍在编排）。 */
  readonly expectedReportToRoleId: string | null;
  /** 已知差异类别（\`KNOWN_DELTAS\` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 派发差分矩阵：zero 9 + documented 4 + module-only 2 = 15 例。 */
export const ORACLE_DISPATCH_CASES: readonly OracleDispatchCase[] = Object.freeze([
${renderDispatchCases()}
]);

export interface OraclePreflightCase {
  readonly name: string;
  readonly facts: Readonly<Record<string, unknown>>;
  /** 差分口径：zero（只含登记键）/ documented（E2 P5 未登记键，契约明文更严）。 */
  readonly differential: "zero" | "documented";
  /** 旧实现行为锚点（历史；运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧 Model 形状 oracle 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 新模块期望 allow 位（\`allow:true\` 只表示纯策略不反对）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 已知更严格差异的类别（\`KNOWN_DELTAS\` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 合法 review 事实包（只含登记键；测试用工厂，每次返回独立对象）。 */
export function validReviewFacts(): Record<string, unknown> {
  return {
    reviewTarget: {
      operationId: ${JSON.stringify(VALID_REVIEW_TARGET.operationId)},
      candidate: {
        objectFormat: ${JSON.stringify(SHA1_OID.objectFormat)},
        hex: ${JSON.stringify(SHA1_OID.hex)},
      },
    },
    criteria: [
      {
        oid: {
          objectFormat: ${JSON.stringify(SHA1_OID.objectFormat)},
          hex: ${JSON.stringify(SHA1_OID.hex)},
        },
        path: ${JSON.stringify(VALID_CRITERIA[0].path)},
        sha256: ${JSON.stringify(CRITERIA_SHA256)},
      },
    ],
  };
}

/** review preflight 差分矩阵：zero 17 + documented 7（E2 P5）= 24 例。 */
export const ORACLE_PREFLIGHT_CASES: readonly OraclePreflightCase[] = Object.freeze([
${renderPreflightCases()}
]);

/** 已列明差异（模块按 E0.3/D4 更严格，非放宽）。差分测试按前缀逐类断言；新增差异即失败。 */
export const KNOWN_DELTAS: readonly string[] = Object.freeze(${literal(KNOWN_DELTAS, 0)});

export const ORACLE_GOLDEN_PAYLOAD = Object.freeze({
  spec: ORACLE_VERIFIER_SPEC,
  toolsCatalog: ORACLE_ROLE_TOOL_CATALOG,
  toolsDeclaration: ORACLE_TOOLS_DECLARATION,
  dispatch: ORACLE_DISPATCH_CASES,
  preflight: ORACLE_PREFLIGHT_CASES,
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
 * \`test/roles/rapporteur/oracle-fixture.ts\` / \`test/roles/convener/oracle-fixture.ts\`）。
 *
 * - \`capture\`：捕获期望值时旧 oracle 文件身份（行数 + SHA-256 + 锚点 + 捕获时点）。
 * - \`switch\`：E2 X-R5 后实测身份（\`changed\` 与捕获期不同；\`unchanged\` 逐字节一致）。
 * - 两者都是**历史记录**：差分测试不读取工作树旧文件，旧实现删除后测试仍可运行。
 * - \`counts\` 与 fixture 数组长度一致；\`coverage\` 记录期望面 → 测试断言映射（不得删覆盖）。
 * - \`payloadSha256\`：冻结载荷哈希（防期望值静默漂移）。
 */
export const ORACLE_GOLDEN_META = Object.freeze({
  schema: "verifier-oracle-golden/v1",
  capturedAt: "${GOLDEN_DATE}",
  generator:
    "E1 开发期 live probe（E1 证据 §四/§9）+ E2 X-R5 金样化复算（角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs）",
  evidence: Object.freeze({
    capture: "角色卡/verifier-code/docs/change/2026-11-07_E1_verifier-module-evidence.md §四/§9",
    switch: "角色卡/门禁引擎/docs/change/2026-11-07_E2-XR5_gate-facade-verifier-evidence.md §2/§5/§6.4",
    goldenization:
      "角色卡/verifier-code/docs/change/2026-11-07_E1_verifier-module-evidence.md §10（E2 X-R5 fixture 金样化）",
  }),
  /**
   * 捕获脚本在冻结前执行的复核（任一不符即 throw，不生成 fixture）。X-R5 后 oldSpec/D2 投影
   * 由模块派生（自比较）；独立物证仍是 E1 证据 §四（编辑前捕获）与 X-R5 证据 §5（zeroCopyBinding）。
   */
  captureChecks: Object.freeze({
    oldSpecFieldsEqual: true,
    oldCardTextByteEqual: true,
    d2ProjectionEqual: true,
    oldRunRoleCardsEqual: true,
    toolsDeclarationValid: true,
    zeroCopyBindingRecordedElsewhere: ${JSON.stringify('E2-XR5 证据 §5（governanceRoleOf("verifier") 与模块同一引用）')},
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
    cards: "差分/cards：模块 cards 与金样一致（D8 无 legacy token；Model 卡种闭集在模块单测断言）",
    tools: "差分/tools：D1 14 项 catalog 均不含 verifier + 空声明 trio/single 与捕获校验一致",
    dispatch: "差分/dispatch：15 例（zero 9 / documented 4 / module-only 2）allow 位 + 稳定码 + reportToRoleId；已知差异逐项登记",
    preflight: "差分/动作前置：24 例（zero 17 / documented 7 E2 P5）；allow 位/稳定码/unknownKeys 口径",
    knownDeltas: "差分/已知差异清单：6 类前缀齐备且与用例登记一致",
    provenance: "金样/provenance：元数据自洽 / 载荷哈希 / 无旧引擎 live 依赖",
  }),
  payloadSha256: ${JSON.stringify(payloadSha256)},
});
`;

const captureJson = {
  meta: {
    task: "2026-11-07-runtime-gate-role-modularization / E2 X-R5 verifier fixture goldenization",
    generatedAt: new Date().toISOString(),
    node: process.version,
    repoRoot: ROOT,
    payloadSha256,
  },
  spec,
  toolsCatalog,
  toolsDeclaration,
  dispatch: dispatchCases,
  preflight: preflightCases,
  knownDeltas: KNOWN_DELTAS,
  counts,
  deltaCounts: {
    dispatch: Object.fromEntries(
      ["dispatch-scope", "dispatch-existence", "dispatch-kind-mismatch"].map((prefix) => [
        prefix,
        dispatchCases.filter((c) => c.knownDelta === prefix).length,
      ]),
    ),
    preflight: {
      "preflight-facts-unknown-key": preflightCases.filter(
        (c) => c.knownDelta === "preflight-facts-unknown-key",
      ).length,
    },
    documentedStricterOldAllow: stricterDocumented,
  },
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
    `catalog=${toolsCatalog.length}`,
);
console.log(
  `dispatch=${dispatchCases.length} (zero=${dispatchCounts.zero} documented=${dispatchCounts.documented} module-only=${dispatchCounts.moduleOnly}) ` +
    `preflight=${preflightCases.length} (zero=${zeroPreflightCount} documented=${preflightCases.length - zeroPreflightCount} stricterOldAllow=${stricterDocumented})`,
);
console.log(`payloadSha256=${payloadSha256}`);

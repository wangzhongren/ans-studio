#!/usr/bin/env node
// E2 X-R6 chief 差分 fixture 金样化捕获（一次性工具；随角色证据归档）。
//
// 目的：`test/roles/chief/differential.test.ts` 原以旧引擎为 live oracle；X-R6 门面切换后
// `governanceRoleOf("chief")` 由 `specOf(chiefRoleModule)` 派生，规格用例退化为模块自比较。
// 按 E2 检查单 G9（先冻结金样：场景输入 + 期望输出 + 来源候选 + hash；禁止删断言/整文件）
// 把现有差分矩阵冻结为纯数据 fixture。
//
// 用法（仓库根 = 本文件上四级；可用 --root 覆盖）：
//   node 角色卡/chief-code/docs/change/2026-11-07_E2-XR6_golden-capture.mjs \
//     [--root <repo>] [--out <capture.json>] [--emit-fixture <oracle-fixture.ts>]
//
// 捕获口径（2026-11-07，工作树 trunk-amendment；旧引擎仍在，仅捕获期使用）：
//  - spec/cards：模块当前值与旧注册表逐字段复核（X-R6 后为自比较，独立物证见 E1 §3 / X-R6 §7）；
//    cards 另用 `run-role.ts::TRIO_CARD_KINDS.chief` 源码 oracle 复核（D8）。
//  - tools：D1 `ROLE_TOOL_CATALOG` 14 项 + 旧 `validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS)`
//    捕获（6/6 映射，含 E2 C-1 `closeCreatedTask`）；旧 run-role 注入门控逐字冻结为历史锚点。
//  - dispatch：逐用例调用旧 `evaluateDispatchAuthorization`（+ `reportTargetForTaskCreator`）
//    捕获 oldAllow/oldCode/oldReport；新模块 allow/稳定码/reportToRoleId 同批记录。
//  - preflight：旧 `validateVersionDecisionRequest` 捕获 oldAllow；新模块 allow/稳定码逐例记录。
//    runId/refs 路径形状由宿主最终校验（2 例 documented）。
//  - context 资源：`loadBuiltinChiefWorkflow()` 捕获 path/version/sha256/bytes（模块只声明引用）。
//  - hub 数据：`CHIEF_HUB_DISPATCH` + `apply-journal.ts` 源字符串 oracle（目标五内置/routing/from）。
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
  let out = path.join(HERE, "2026-11-07_E2-XR6_golden-capture.json");
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
const lineCountOf = (text) => (text === "" ? 0 : (text.match(/\n/g) ?? []).length);

const [chief, governance, registry, workflowPreconditions, versionDecision, runtimeTools] =
  await Promise.all([
    importTs("src/common/roles/chief/index.ts"),
    importTs("src/common/门禁引擎/governance-roles.ts"),
    importTs("src/common/门禁引擎/role-tool-registry.ts"),
    importTs("src/common/编排/workflow-preconditions.ts"),
    importTs("src/common/编排/version-decision.ts"),
    importTs("src/provider/runtime/tools.ts"),
  ]);

const MODULE = chief.chiefRoleModule;
const GOLDEN_DATE = "2026-11-07";

// —————————————————————— 0. 规格 / 卡 / cards ——————————————————————

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

// 旧注册表 oracle（X-R6 后由 specOf(chiefRoleModule) 派生 = 自比较；独立物证 = E1 §3 / X-R6 §7）。
const oldSpec = governance.governanceRoleOf("chief");
if (oldSpec === undefined) throw new Error("governanceRoleOf(chief) missing");
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
if (spec.cardText.length !== 1680 || spec.cardText.lineCount !== 22) {
  throw new Error(`unexpected card text identity: ${spec.cardText.length}/${spec.cardText.lineCount}`);
}
if (spec.cardText.sha256 !== "bdca98f9ee0d7875d0d9812107a2565af897a5a37b4987c7256294da6381935f") {
  throw new Error(`unexpected card text sha256: ${spec.cardText.sha256}`);
}

// cards：旧 run-role 源码 oracle（D8 迁移前）逐字提取。
const runRoleText = readText("src/pipeline/orchestration/run-role.ts");
const trioMatch = /const TRIO_CARD_KINDS:[^=]*=\s*\{([\s\S]*?)\n\};/.exec(runRoleText);
if (trioMatch === null) throw new Error("run-role.ts 缺少 TRIO_CARD_KINDS 源码块");
const chiefCardsMatch = /chief:\s*\[([^\]]*)\]/.exec(trioMatch[1]);
if (chiefCardsMatch === null) throw new Error("run-role.ts 缺少 TRIO_CARD_KINDS.chief");
const oldCards = [...chiefCardsMatch[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
if (JSON.stringify(oldCards) !== JSON.stringify(spec.cards)) {
  throw new Error(`cards diff: ${JSON.stringify(oldCards)} != ${JSON.stringify(spec.cards)}`);
}
if (JSON.stringify(spec.cards) !== JSON.stringify(["intent-confirm"])) {
  throw new Error(`unexpected chief cards: ${JSON.stringify(spec.cards)}`);
}
if (spec.cards.includes("write")) throw new Error("D8 violation: legacy write in chief cards");

// —————————————————————— 1. tools（D1 catalog + 6-id 声明 + 旧注入门控锚点） ——————————————————————

const toolsCatalog = registry.ROLE_TOOL_CATALOG.map((entry) => ({
  id: entry.id,
  name: entry.name,
  allowedRoleIds: [...entry.allowedRoleIds],
  ...(entry.chiefIndependentDecisionOnly === true ? { chiefIndependentDecisionOnly: true } : {}),
}));
if (toolsCatalog.length !== 14) throw new Error(`unexpected catalog size: ${toolsCatalog.length}`);

const declaredIds = [...chief.CHIEF_TOOL_IDS];
const declaredPolicy = MODULE.tools({ governanceModel: "trio" });
if (JSON.stringify([...declaredPolicy.tools]) !== JSON.stringify(declaredIds)) {
  throw new Error("module tools() trio differs from CHIEF_TOOL_IDS");
}
const validation = registry.validateRoleToolDeclaration("chief", declaredIds);
if (validation.allow !== true || validation.reasons.length !== 0 || validation.tools.length !== declaredIds.length) {
  throw new Error(`chief tool declaration invalid: ${JSON.stringify(validation)}`);
}
for (const entry of toolsCatalog) {
  const declared = declaredIds.includes(entry.id);
  const allowsChief = entry.allowedRoleIds.includes("chief");
  if (declared && !allowsChief) throw new Error(`declared id not allowed for chief: ${entry.id}`);
  if (!declared && allowsChief && entry.id !== "decidePendingRequest") {
    throw new Error(`catalog allows chief but module omits (outside decidePendingRequest): ${entry.id}`);
  }
}
if (!declaredIds.includes("closeCreatedTask")) throw new Error("E2 C-1: closeCreatedTask missing");
if (declaredIds.includes("decidePendingRequest")) throw new Error("decidePendingRequest must not be declared");

const toolsDeclaration = {
  tools: declaredIds,
  reasons: [...declaredPolicy.reasons],
  validation: {
    allow: validation.allow,
    tools: validation.tools.map((binding) => ({ id: binding.id, name: binding.name })),
    reasons: [...validation.reasons],
  },
};

const runRoleToolGates = {
  anchors: [
    'const roleActivityLog = trioSpec?.id === "chief" ? input.roleActivityLog : undefined;',
    'const terminateRoleRun = trioSpec?.id === "chief" ? input.terminateRoleRun : undefined;',
    'const redispatchTask = trioSpec?.id === "chief" ? input.redispatchTask : undefined;',
    'const projectNote = trioSpec?.id === "chief" ? input.projectNote : undefined;',
    'const requestVersionDecision = trioSpec !== undefined && canRequestVersionDecision(trioSpec.id) ? input.requestVersionDecision : undefined;',
    'const closeCreatedTask = directGovernance && (setup.role.id === "chief" || setup.role.id === "convener") ? input.closeCreatedTask : undefined;',
  ],
  canRequestVersionDecisionPredicate:
    'function canRequestVersionDecision(roleId: string): boolean {\n  return roleId === "chief";\n}',
  directGovernanceDefinition:
    'const directGovernance = governanceModel === "trio" && builtInGovernance && isTrio && chiefDecisionContext === undefined;',
  anchor:
    "run-role.ts:1694-1705（工具门控）/ :1824/:1828（directGovernance closeCreatedTask）/ :2344-2346（canRequestVersionDecision）（E1 捕获期；旧实现删除后仅作历史锚点）",
};
for (const anchor of runRoleToolGates.anchors) {
  if (!runRoleText.includes(anchor)) throw new Error(`run-role gate anchor missing at capture: ${anchor}`);
}
if (!runRoleText.includes(runRoleToolGates.canRequestVersionDecisionPredicate)) {
  throw new Error("run-role canRequestVersionDecision predicate missing at capture");
}
if (!runRoleText.includes(runRoleToolGates.directGovernanceDefinition)) {
  throw new Error("run-role directGovernance definition missing at capture");
}

const runtimeToolsText = readText("src/provider/runtime/tools.ts");
const decisionContext = {
  builderFunction: "buildChiefDecisionTools",
  toolNameConstant: "DECIDE_PENDING_REQUEST_TOOL_NAME",
  anchor: "runtime/tools.ts（chief 独立决策上下文；E1 捕获期；旧实现删除后仅作历史锚点）",
};
if (!runtimeToolsText.includes(`export function ${decisionContext.builderFunction}`)) {
  throw new Error("buildChiefDecisionTools missing at capture");
}
if (!runtimeToolsText.includes(decisionContext.toolNameConstant)) {
  throw new Error("DECIDE_PENDING_REQUEST_TOOL_NAME missing at capture");
}

// —————————————————————— 2. dispatch 矩阵（旧谓词 vs 模块） ——————————————————————

const DISPATCH_ANCHOR =
  "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）";

const dispatchDefinitions = [
  // — 8 zero：来源 chief + targetExists=true（E1 原矩阵） —
  { name: "chief → product（内置/存在）", input: { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true } },
  { name: "chief → rapporteur（内置/存在）", input: { sourceRoleId: "chief", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true } },
  { name: "chief → nominator（内置/存在）", input: { sourceRoleId: "chief", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true } },
  { name: "chief → convener（内置/存在）", input: { sourceRoleId: "chief", targetRoleId: "convener", targetKind: "built-in-governance", targetExists: true } },
  { name: "chief → verifier（内置/存在）", input: { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true } },
  { name: "chief → chief（自派禁止）", input: { sourceRoleId: "chief", targetRoleId: "chief", targetKind: "built-in-governance", targetExists: true } },
  { name: "chief → liaison（闭集外内置目标）", input: { sourceRoleId: "chief", targetRoleId: "liaison", targetKind: "built-in-governance", targetExists: true } },
  { name: "chief → worker-a（项目目标禁止）", input: { sourceRoleId: "chief", targetRoleId: "worker-a", targetKind: "project", targetExists: true } },
  // — 3 documented —
  {
    name: "chief → product 且 targetExists=false（契约要求显式存在性）",
    input: { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: false },
    differential: "documented",
    knownDelta: "dispatch-existence",
  },
  {
    name: "chief → product 且 targetExists 缺省（缺事实即拒绝）",
    input: { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance" },
    differential: "documented",
    knownDelta: "dispatch-existence",
  },
  {
    name: "convener → worker-a（本模块只回答 chief 来源）",
    input: { sourceRoleId: "convener", targetRoleId: "worker-a", targetKind: "project", targetExists: true },
    differential: "documented",
    knownDelta: "dispatch-scope",
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

  const differential = definition.differential ?? "zero";
  if (differential === "zero") {
    if (oldAllow !== expectedAllow) {
      throw new Error(`zero dispatch allow diff: ${definition.name} old=${oldAllow} module=${expectedAllow}`);
    }
    if (oldCode !== expectedCode) {
      throw new Error(`zero dispatch code diff: ${definition.name} old=${oldCode} module=${expectedCode}`);
    }
    if (oldReportToRoleId !== expectedReportToRoleId) {
      throw new Error(`zero dispatch report diff: ${definition.name} old=${oldReportToRoleId} module=${expectedReportToRoleId}`);
    }
  } else if (differential === "documented") {
    const differs = oldAllow !== expectedAllow || oldCode !== expectedCode;
    if (!differs) throw new Error(`documented dispatch no longer divergent: ${definition.name}`);
    if (expectedAllow !== false) throw new Error(`documented dispatch must deny in module: ${definition.name}`);
    if (definition.knownDelta === undefined) throw new Error(`documented dispatch missing knownDelta: ${definition.name}`);
  } else {
    throw new Error(`unknown differential: ${differential}`);
  }

  return {
    name: definition.name,
    input: definition.input,
    differential,
    oldAnchor: DISPATCH_ANCHOR,
    oldAllow,
    oldCode,
    oldReportToRoleId,
    expectedAllow,
    expectedCode,
    expectedReportToRoleId,
    knownDelta: differential === "documented" ? definition.knownDelta : null,
  };
});

const dispatchZeroCount = dispatchCases.filter((c) => c.differential === "zero").length;
const dispatchDocumentedCount = dispatchCases.filter((c) => c.differential === "documented").length;
if (dispatchZeroCount !== 8 || dispatchDocumentedCount !== 3) {
  throw new Error(`dispatch counts: zero=${dispatchZeroCount} documented=${dispatchDocumentedCount}`);
}

// —————————————————————— 3. preflight 矩阵（旧 validateVersionDecisionRequest vs 模块） ——————————————————————

const PREFLIGHT_ZERO_ANCHOR =
  "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）";
const PREFLIGHT_DOCUMENTED_ANCHOR =
  "编排/version-decision.ts::validateVersionDecisionRequest（宿主最终校验仍拒绝非法 runId/绝对路径 ref；preflight 只做存在/类型/上限，E0.3 D4）";

function check(facts) {
  return MODULE.preflight.checkAction({ action: "version-decision", facts });
}

const preflightDefinitions = [
  // — 12 zero：E1 原矩阵（请求形状子集） —
  { name: "flowId + version-modify + reason 正例", facts: { flowId: "q2-new", action: "version-modify", reason: "需要新版本" } },
  { name: "new-version-development + runId 正例", facts: { flowId: "q2-new", action: "new-version-development", reason: "x", runId: "run-hub-abc" } },
  { name: "refs 两项正例", facts: { flowId: "q2-new", action: "version-modify", reason: "x", refs: ["docs/a.md", "docs/b.md"] } },
  { name: "缺 flowId（fact-missing）", facts: { action: "version-modify", reason: "x" } },
  { name: "flowId 非治理 slug", facts: { flowId: "Q2 New", action: "version-modify", reason: "x" } },
  { name: "action 非版本决策动作", facts: { flowId: "q2-new", action: "upgrade", reason: "x" } },
  { name: "reason 全空白", facts: { flowId: "q2-new", action: "version-modify", reason: "   " } },
  { name: "reason 超长（1001）", facts: { flowId: "q2-new", action: "version-modify", reason: "x".repeat(1001) } },
  {
    name: "refs 超上限（6 项）",
    facts: { flowId: "q2-new", action: "version-modify", reason: "x", refs: Array.from({ length: 6 }, (_, i) => `r${i}`) },
  },
  { name: "refs 含非字符串项", facts: { flowId: "q2-new", action: "version-modify", reason: "x", refs: ["ok", 3] } },
  { name: "runId 非字符串", facts: { flowId: "q2-new", action: "version-modify", reason: "x", runId: 7 } },
  { name: "未登记事实键", facts: { flowId: "q2-new", action: "version-modify", reason: "x", extra: true } },
  // — 2 documented：宿主最终校验仍拒绝的路径形状 —
  {
    name: "runId 含空格（宿主最终校验拒绝；preflight 只查非空字符串）",
    facts: { flowId: "q2-new", action: "version-modify", reason: "x", runId: "bad run id!" },
    differential: "documented",
    knownDelta: "preflight-final-validation",
  },
  {
    name: "refs 绝对路径（宿主最终校验拒绝；preflight 只查非空字符串）",
    facts: { flowId: "q2-new", action: "version-modify", reason: "x", refs: ["/etc/passwd"] },
    differential: "documented",
    knownDelta: "preflight-final-validation",
  },
];

const preflightCases = preflightDefinitions.map((definition) => {
  const differential = definition.differential ?? "zero";
  const oldResult = versionDecision.validateVersionDecisionRequest(definition.facts);
  const decision = check(definition.facts);
  const expectedAllow = decision.allow;
  const expectedCode = decision.allow ? null : decision.code;
  const oldAllow = oldResult.ok;

  if (differential === "zero") {
    if (oldAllow !== expectedAllow) {
      throw new Error(`zero preflight allow diff: ${definition.name} old=${oldAllow} module=${expectedAllow}`);
    }
  } else {
    if (expectedAllow !== true || oldAllow !== false) {
      throw new Error(`documented preflight must be old-deny / module-allow: ${definition.name}`);
    }
    if (definition.knownDelta === undefined) throw new Error(`documented preflight missing knownDelta: ${definition.name}`);
  }

  return {
    name: definition.name,
    facts: definition.facts,
    differential,
    oldAnchor: differential === "zero" ? PREFLIGHT_ZERO_ANCHOR : PREFLIGHT_DOCUMENTED_ANCHOR,
    oldAllow,
    expectedAllow,
    expectedCode,
    knownDelta: differential === "documented" ? definition.knownDelta : null,
  };
});

const preflightZeroCount = preflightCases.filter((c) => c.differential === "zero").length;
const preflightDocumentedCount = preflightCases.filter((c) => c.differential === "documented").length;
if (preflightZeroCount !== 12 || preflightDocumentedCount !== 2) {
  throw new Error(`preflight counts: zero=${preflightZeroCount} documented=${preflightDocumentedCount}`);
}

// —————————————————————— 4. context 资源（宿主 loader 捕获） ——————————————————————

const loaded = await runtimeTools.loadBuiltinChiefWorkflow();
const loadedSourcePath = decodeURIComponent(new URL(loaded.sourceUrl).pathname);
const moduleResource = chief.CHIEF_WORKFLOW_RESOURCE;
if (moduleResource.version !== loaded.version) {
  throw new Error(`resource version diff: module=${moduleResource.version} loader=${loaded.version}`);
}
if (moduleResource.sha256 !== loaded.sha256) {
  throw new Error(`resource sha256 diff: module=${moduleResource.sha256} loader=${loaded.sha256}`);
}
if (!loadedSourcePath.endsWith(`/${moduleResource.path}`)) {
  throw new Error(`resource path diff: loader=${loadedSourcePath} module=${moduleResource.path}`);
}
if (loaded.bytes !== 8724) throw new Error(`unexpected resource bytes: ${loaded.bytes}`);

const workflowResource = {
  path: moduleResource.path,
  version: moduleResource.version,
  sha256: moduleResource.sha256,
  bytes: loaded.bytes,
  loadedSourcePathSuffix: `/${moduleResource.path}`,
};

const resourceText = readText(moduleResource.path);

// —————————————————————— 5. hub 数据（apply-journal 源字符串 oracle） ——————————————————————

const applyJournalText = readText("src/service/trunk/impl/apply-journal.ts");
const hubTargetCheck = '["product", "rapporteur", "nominator", "convener", "verifier"].includes(event.to)';
const hubRoutingCheck = 'event.hubRouting !== "chief-hub-v1"';
const hubSourceCheck = 'event.from !== "chief"';
for (const [label, snippet] of [
  ["target", hubTargetCheck],
  ["routing", hubRoutingCheck],
  ["source", hubSourceCheck],
]) {
  if (!applyJournalText.includes(snippet)) throw new Error(`apply-journal hub ${label} oracle missing at capture`);
}

const moduleHub = chief.CHIEF_HUB_DISPATCH;
if (moduleHub.routing !== "chief-hub-v1") throw new Error(`unexpected hub routing: ${moduleHub.routing}`);
if (moduleHub.sourceRoleId !== "chief" || moduleHub.reportToRoleId !== "chief") {
  throw new Error("unexpected hub source/report");
}
const hubDispatch = {
  routing: moduleHub.routing,
  sourceRoleId: moduleHub.sourceRoleId,
  reportToRoleId: moduleHub.reportToRoleId,
  purpose: moduleHub.purpose,
  workSourceSchema: moduleHub.workSourceSchema,
  targetRoleIds: [...moduleHub.targetRoleIds],
  applyJournalTargetRoleIds: ["product", "rapporteur", "nominator", "convener", "verifier"],
  applyJournalHubRoutingCheck: hubRoutingCheck,
  applyJournalSourceCheck: hubSourceCheck,
  applyJournalTargetCheck: hubTargetCheck,
  anchor: "apply-journal.ts:2923-2926（hub 路由/目标/工作源；E1 捕获期；旧实现删除后仅作历史锚点）",
};
if (JSON.stringify(hubDispatch.applyJournalTargetRoleIds) !== JSON.stringify(hubDispatch.targetRoleIds)) {
  throw new Error("hub target set differs from apply-journal capture");
}

// —————————————————————— 6. KNOWN_DELTAS / 计数 / 载荷 ——————————————————————

const KNOWN_DELTAS = [
  "dispatch-existence：chief → 内置目标 targetExists 缺省/false（2 例）：旧硬授权对 chief→内置不读单独 targetExists 返回 allow；模块按 RoleDispatchPolicyInput 契约要求宿主显式核验（缺省即 false），fail-closed 拒绝 target-card-missing。",
  "dispatch-scope：旧 evaluateDispatchAuthorization 同时编码 convener 来源规则；chief 模块只回答 chief 作为来源的策略（R-2 把路由/hub/报告时点留在引擎），convener→project 旧谓词允许但本模块以 chief-dispatch-source-not-chief 拒绝。",
  "preflight-final-validation：runId/refs 的路径形状由宿主 validateVersionDecisionRequest 最终校验（旧 oracle 拒绝非法 runId/绝对路径 ref，2 例）；preflight 只做存在/类型/上限（E0.3 D4 不复制 Service 校验）。",
  "tools-declaration-vs-injection：模块声明 6 个允许集 id（含 E2 C-1 的 closeCreatedTask）；是否实际注入仍由注入层按 directGovernance（trio + builtInGovernance + isTrio + 非独立决策上下文）与宿主能力门控；decidePendingRequest 仅独立决策上下文（buildChiefDecisionTools），不由普通会话声明。",
  "cards-source-oracle：旧 run-role.ts::TRIO_CARD_KINDS.chief 源码 oracle = [\"intent-confirm\"]（E1 捕获期）；编排 S2 切换/删除后 cards 唯一真源为模块，金样冻结 [\"intent-confirm\"] 且 D8 无 legacy write。",
];

const payload = {
  spec,
  toolsCatalog,
  toolsDeclaration,
  runRoleToolGates,
  decisionContext,
  dispatch: dispatchCases,
  preflight: preflightCases,
  workflowResource,
  hubDispatch,
  knownDeltas: KNOWN_DELTAS,
};
const payloadSha256 = sha256Text(JSON.stringify(payload));

const counts = {
  specFields: 8,
  cardText: 1,
  cards: 1,
  toolsCatalog: toolsCatalog.length,
  toolsDeclaration: 1,
  runRoleToolGates: runRoleToolGates.anchors.length,
  dispatchCases: dispatchCases.length,
  dispatchZero: dispatchZeroCount,
  dispatchDocumented: dispatchDocumentedCount,
  preflightCases: preflightCases.length,
  preflightZero: preflightZeroCount,
  preflightDocumented: preflightDocumentedCount,
  workflowResource: 1,
  hubDispatch: 1,
  knownDeltas: KNOWN_DELTAS.length,
  fixtureComparisons:
    8 + 1 + 1 + toolsCatalog.length + 1 + dispatchCases.length + preflightCases.length + 1 + 1,
};
if (counts.fixtureComparisons !== 52) throw new Error(`fixtureComparisons: ${counts.fixtureComparisons}`);

// —————————————————————— 7. 来源身份（捕获期 / 切换后实测） ——————————————————————

const fileIdentity = (rel) => {
  const bytes = readFileSync(path.join(ROOT, rel));
  const text = bytes.toString("utf8");
  return {
    path: rel,
    lineCount: lineCountOf(text),
    sha256: sha256(bytes),
  };
};

const capture = {
  governanceRoles: {
    ...fileIdentity("src/common/门禁引擎/governance-roles.ts"),
    lineCount: 794,
    sha256: "fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e",
    anchors: "313-358（chief 内联规格）/ 166-178（CHIEF_CARD_TEXT）（E1 捕获期）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition:
      "X-R6 已切换：内联 chief 卡/规格删除，`specOf(chiefRoleModule)` 装配；matrix 逐字迁入 `BUILT_IN_ROLE_MATRIX.chief`（D6/D8）",
  },
  runRole: {
    ...fileIdentity("src/pipeline/orchestration/run-role.ts"),
    lineCount: 3333,
    sha256: "026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6",
    anchors: "1694-1705（工具门控）/ 2859-2880（TRIO_CARD_KINDS.chief）/ 1828（directGovernance closeCreatedTask）（E1 捕获期）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition:
      "X-R1 起编排单元修改；X-R6 未改本文件。`TRIO_CARD_KINDS.chief` 仍保留为回退/迁移前源码 oracle（编排 S2 处置）",
  },
  roleToolRegistry: {
    ...fileIdentity("src/common/门禁引擎/role-tool-registry.ts"),
    lineCount: 157,
    sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
    anchors: "52-67（ROLE_TOOL_CATALOG 14 项）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R6 未改（捕获期与切换后逐字节一致）",
  },
  workflowPreconditions: {
    ...fileIdentity("src/common/编排/workflow-preconditions.ts"),
    lineCount: 1609,
    sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
    anchors: "1530-1573（evaluateDispatchAuthorization）/ 1596-1603（reportTargetForTaskCreator）（E1 捕获期）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "E1 捕获后由并发单元修改（X-R4 convener 分支接模块）；切换后实测见 switch.changed",
  },
  versionDecision: {
    ...fileIdentity("src/common/编排/version-decision.ts"),
    anchors: "70-110（validateVersionDecisionRequest）",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
  applyJournal: {
    ...fileIdentity("src/service/trunk/impl/apply-journal.ts"),
    anchors: "2959（hub 路由/目标/工作源校验）",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
  runtimeTools: {
    ...fileIdentity("src/provider/runtime/tools.ts"),
    anchors: "167-189（loadBuiltinChiefWorkflow）/ buildChiefDecisionTools / DECIDE_PENDING_REQUEST_TOOL_NAME",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
  modelRuntime: {
    ...fileIdentity("src/model/runtime.ts"),
    anchors: "TASK_HUB_ROUTING（hub 路由 token 单一来源）",
    capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
    e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
  },
  modelRole: {
    ...fileIdentity("src/model/role.ts"),
    lineCount: 409,
    sha256: "d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780",
    anchors: "BuiltInRoleModule / RoleToolId / RoleDispatchPolicyInput 类型契约（E1 冻结）",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "X-R6 未改（逐字节一致）",
  },
  contract: {
    ...fileIdentity("docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md"),
    lineCount: 685,
    sha256: "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
    anchors: "§3.1/§3.2/§3.4/§3.5/§10.2 D4/D8/D10",
    capturedAt: "E1（2026-11-07）",
    e2Disposition: "E0.3 冻结契约；本单元复核未漂移（差分测试仍断言哈希）",
  },
  workflowResource: {
    path: moduleResource.path,
    lineCount: lineCountOf(resourceText),
    sha256: moduleResource.sha256,
    anchors: "chief-workflow Markdown 资源字节（版本 + SHA-256 由宿主 loader 校验）",
    capturedAt: "金样化（2026-11-07；E1 证据 §8.2 记录资源 hash/bytes）",
    e2Disposition: "X-R6 未改；loader 归属/读取仍由宿主，模块只声明引用",
  },
};

const moduleIdentity = fileIdentity("src/common/roles/chief/index.ts");

const switchIdentities = {
  changed: {
    governanceRoles: {
      ...fileIdentity("src/common/门禁引擎/governance-roles.ts"),
      lineCount: 457,
      sha256: "6eafcf3ab8877c41ecd0bd414ce257aa4ad52e019e62edc308091d398580188f",
      anchors:
        "22-29（六模块 import）/ 137-150（BUILT_IN_ROLE_MATRIX.chief）/ 240-254（builtInRoleModules）/ 256-273（BUILT_IN_GOVERNANCE_ROLES 装配）",
      change: "X-R6 数据门面切换（E2-XR6 证据 §3/§7.1）",
    },
    runRole: {
      ...fileIdentity("src/pipeline/orchestration/run-role.ts"),
      lineCount: 3554,
      sha256: "493fd4ed6ccc03fedbdba2fd7d1a9233d171bd8e594a229b98b1a322c7ef10a8",
      anchors: "TRIO_CARD_KINDS.chief 回退仍在（编排 S2 待删）",
      change: "X-R1 起编排单元修改（非 X-R6）；X-R6 证据 §1 实测值",
    },
    workflowPreconditions: {
      ...fileIdentity("src/common/编排/workflow-preconditions.ts"),
      lineCount: 1687,
      sha256: "480e0e7effa7b8120f44e478673dbe0b5ca4fbdbfcf026f4238c0b73724a7ffc",
      change: "E1 捕获后由并发单元修改（X-R4 convener 分支接模块）；不影响 chief 期望值",
    },
  },
  unchanged: {
    roleToolRegistry: {
      ...fileIdentity("src/common/门禁引擎/role-tool-registry.ts"),
      lineCount: 157,
      sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
    },
    versionDecision: {
      ...fileIdentity("src/common/编排/version-decision.ts"),
    },
    applyJournal: {
      ...fileIdentity("src/service/trunk/impl/apply-journal.ts"),
    },
    runtimeTools: {
      ...fileIdentity("src/provider/runtime/tools.ts"),
    },
    modelRuntime: {
      ...fileIdentity("src/model/runtime.ts"),
    },
    modelRole: {
      ...fileIdentity("src/model/role.ts"),
    },
    contract: {
      ...fileIdentity("docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md"),
      lineCount: 685,
      sha256: "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
    },
    workflowResource: {
      path: moduleResource.path,
      lineCount: lineCountOf(resourceText),
      sha256: moduleResource.sha256,
    },
  },
  measuredAt: "2026-11-07（E2-XR6 证据 §1/§7.1 + 本轮金样化实测）",
};

const moduleData = {
  path: moduleIdentity.path,
  lineCount: moduleIdentity.lineCount,
  sha256: moduleIdentity.sha256,
};

// —————————————————————— 8. fixture 生成 ——————————————————————

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
    .map(
      (c) => `  Object.freeze({
    name: ${JSON.stringify(c.name)},
    facts: Object.freeze(${literal(c.facts, 2)}),
    differential: ${JSON.stringify(c.differential)},
    oldAnchor: ${JSON.stringify(c.oldAnchor)},
    oldAllow: ${c.oldAllow},
    expectedAllow: ${c.expectedAllow},
    expectedCode: ${c.expectedCode === null ? "null" : JSON.stringify(c.expectedCode)},
    knownDelta: ${c.knownDelta === null ? "null" : JSON.stringify(c.knownDelta)},
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

const fixture = `// test/roles/chief/oracle-fixture.ts
//
// chief 角色模块差分金样（E2 X-R6 fixture 金样化；E2 检查单 G9 / B1 M4；
// 先例 test/roles/rapporteur/oracle-fixture.ts、test/roles/convener/oracle-fixture.ts、
// test/roles/verifier/oracle-fixture.ts）。
//
// 捕获方式（2026-11-07，工作树 trunk-amendment；一次性工具
// \`角色卡/chief-code/docs/change/2026-11-07_E2-XR6_golden-capture.mjs\`）：
//  - 规格/卡文本：E1 从旧 \`BUILT_IN_GOVERNANCE_ROLES\` chief 行逐字段捕获；X-R6 门面切换后
//    逐字段复核实测（自比较）0 差异后冻结；独立物证 = E1 证据 §3（编辑前差分 0）与 X-R6 §7。
//  - cards：\`run-role.ts::TRIO_CARD_KINDS.chief\` 源码提取 = ["intent-confirm"]（D8）。
//  - tools：D1 \`ROLE_TOOL_CATALOG\` 14 项 + 旧 \`validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS)\`
//    捕获（allow:true / 6 绑定 / reasons:[]，含 E2 C-1 \`closeCreatedTask\`）；旧 run-role 注入门控
//    逐字冻结为历史锚点（不依赖旧文件结构/行号）。
//  - dispatch：逐用例调用旧 \`evaluateDispatchAuthorization\`（+ \`reportTargetForTaskCreator\`）
//    捕获 oldAllow/oldCode/oldReport；新模块 expectedAllow/稳定码/reportToRoleId 同批冻结。
//  - preflight：旧 \`validateVersionDecisionRequest\` 捕获 oldAllow；新模块 allow/稳定码逐例冻结。
//    runId/refs 路径形状由宿主最终校验（2 例 documented）。
//  - context 资源：\`loadBuiltinChiefWorkflow()\` 捕获 path/version/sha256/bytes。
//  - hub 数据：\`CHIEF_HUB_DISPATCH\` + apply-journal 源字符串 oracle（目标五内置/routing/from）。
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

/** 旧注册表 chief 规格（逐字段；E1 捕获，X-R6 切换后复核 0 差异）。 */
export const ORACLE_CHIEF_SPEC = Object.freeze({
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

/** D1 \`ROLE_TOOL_CATALOG\` 14 项冻结清单（E1 捕获；chief 允许 7 项，其中 decidePendingRequest 仅独立决策上下文）。 */
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

export interface OracleToolBinding {
  readonly id: RoleToolId;
  readonly name: string;
}

/** 旧 \`validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS)\` 与模块 trio 声明冻结期望（6/6，含 closeCreatedTask）。 */
export const ORACLE_CHIEF_TOOL_DECLARATION = Object.freeze({
  tools: Object.freeze<readonly RoleToolId[]>(${literal(toolsDeclaration.tools, 1)}),
  reasons: Object.freeze(${literal(toolsDeclaration.reasons, 1)}),
  validation: Object.freeze({
    allow: ${toolsDeclaration.validation.allow},
    tools: Object.freeze<readonly OracleToolBinding[]>(${literal(toolsDeclaration.validation.tools, 2)}),
    reasons: Object.freeze(${literal(toolsDeclaration.validation.reasons, 2)}),
  }),
});

/** 旧 run-role 工具注入门控逐字锚点（E1 捕获期；旧实现删除后仅作历史记录，运行期不读取旧文件）。 */
export const ORACLE_RUN_ROLE_TOOL_GATES = Object.freeze({
  anchors: Object.freeze(${literal(runRoleToolGates.anchors, 1)}),
  canRequestVersionDecisionPredicate: ${JSON.stringify(runRoleToolGates.canRequestVersionDecisionPredicate)},
  directGovernanceDefinition: ${JSON.stringify(runRoleToolGates.directGovernanceDefinition)},
  anchor: ${JSON.stringify(runRoleToolGates.anchor)},
});

/** 旧 runtime/tools 的 chief 独立决策上下文锚点（\`decidePendingRequest\` 不由普通会话声明）。 */
export const ORACLE_CHIEF_DECISION_CONTEXT = Object.freeze({
  builderFunction: ${JSON.stringify(decisionContext.builderFunction)},
  toolNameConstant: ${JSON.stringify(decisionContext.toolNameConstant)},
  anchor: ${JSON.stringify(decisionContext.anchor)},
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
   *  - \`documented\`：契约明文差异（存在性/来源归属），旧行为不同且方向固定（旧 allow → 模块 deny）。
   */
  readonly differential: "zero" | "documented";
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
  /** 新模块期望报告角色（allow 时为 "chief"；仅差分期望，实际路由仍在编排）。 */
  readonly expectedReportToRoleId: string | null;
  /** 已知差异类别（\`KNOWN_DELTAS\` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 派发差分矩阵：zero 8 + documented 3 = 11 例（来源 = chief；含 1 例来源归属负例）。 */
export const ORACLE_DISPATCH_CASES: readonly OracleDispatchCase[] = Object.freeze([
${renderDispatchCases()}
]);

export interface OraclePreflightCase {
  readonly name: string;
  readonly facts: Readonly<Record<string, unknown>>;
  /** 差分口径：zero（旧请求形状 oracle 同判）/ documented（宿主最终校验更严，模块只做前置）。 */
  readonly differential: "zero" | "documented";
  /** 旧实现行为锚点（历史；运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧 \`validateVersionDecisionRequest\` 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 新模块期望 allow 位（\`allow:true\` 只表示纯策略不反对）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 已知差异类别（\`KNOWN_DELTAS\` 前缀）；差异 0 为 null。 */
  readonly knownDelta: string | null;
}

/** version-decision preflight 差分矩阵：zero 12 + documented 2 = 14 例。 */
export const ORACLE_PREFLIGHT_CASES: readonly OraclePreflightCase[] = Object.freeze([
${renderPreflightCases()}
]);

/** chief-workflow 资源冻结引用（宿主 loader 捕获期实测：版本 + SHA-256 + bytes）。 */
export const ORACLE_CHIEF_WORKFLOW_RESOURCE = Object.freeze({
  path: ${JSON.stringify(workflowResource.path)},
  version: ${JSON.stringify(workflowResource.version)},
  sha256: ${JSON.stringify(workflowResource.sha256)},
  bytes: ${workflowResource.bytes},
  loadedSourcePathSuffix: ${JSON.stringify(workflowResource.loadedSourcePathSuffix)},
});

/** hub 派发纯数据冻结（含 apply-journal 源字符串 oracle；运行期不读取旧文件）。 */
export const ORACLE_CHIEF_HUB_DISPATCH = Object.freeze({
  routing: ${JSON.stringify(hubDispatch.routing)},
  sourceRoleId: ${JSON.stringify(hubDispatch.sourceRoleId)},
  reportToRoleId: ${JSON.stringify(hubDispatch.reportToRoleId)},
  purpose: ${JSON.stringify(hubDispatch.purpose)},
  workSourceSchema: ${JSON.stringify(hubDispatch.workSourceSchema)},
  targetRoleIds: Object.freeze(${literal(hubDispatch.targetRoleIds, 1)}),
  applyJournalTargetRoleIds: Object.freeze(${literal(hubDispatch.applyJournalTargetRoleIds, 1)}),
  applyJournalHubRoutingCheck: ${JSON.stringify(hubDispatch.applyJournalHubRoutingCheck)},
  applyJournalSourceCheck: ${JSON.stringify(hubDispatch.applyJournalSourceCheck)},
  applyJournalTargetCheck: ${JSON.stringify(hubDispatch.applyJournalTargetCheck)},
  anchor: ${JSON.stringify(hubDispatch.anchor)},
});

/** 已列明差异（契约允许：E2 模块化阶段列明项；本模块差异均为更严/归属，不是放宽）。 */
export const KNOWN_DELTAS: readonly string[] = Object.freeze(${literal(KNOWN_DELTAS, 0)});

export const ORACLE_GOLDEN_PAYLOAD = Object.freeze({
  spec: ORACLE_CHIEF_SPEC,
  toolsCatalog: ORACLE_ROLE_TOOL_CATALOG,
  toolsDeclaration: ORACLE_CHIEF_TOOL_DECLARATION,
  runRoleToolGates: ORACLE_RUN_ROLE_TOOL_GATES,
  decisionContext: ORACLE_CHIEF_DECISION_CONTEXT,
  dispatch: ORACLE_DISPATCH_CASES,
  preflight: ORACLE_PREFLIGHT_CASES,
  workflowResource: ORACLE_CHIEF_WORKFLOW_RESOURCE,
  hubDispatch: ORACLE_CHIEF_HUB_DISPATCH,
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
 * \`test/roles/rapporteur/oracle-fixture.ts\` / \`test/roles/convener/oracle-fixture.ts\` /
 * \`test/roles/verifier/oracle-fixture.ts\`）。
 *
 * - \`capture\`：捕获期望值时旧 oracle 文件身份（行数 + SHA-256 + 锚点 + 捕获时点）。
 * - \`switch\`：E2 X-R6 后实测身份（\`changed\` 与捕获期不同；\`unchanged\` 逐字节一致）。
 * - 两者都是**历史记录**：差分测试不读取工作树旧文件，旧实现删除后测试仍可运行。
 * - \`counts\` 与 fixture 数组长度一致；\`coverage\` 记录期望面 → 测试断言映射（不得删覆盖）。
 * - \`payloadSha256\`：冻结载荷哈希（防期望值静默漂移）。
 */
export const ORACLE_GOLDEN_META = Object.freeze({
  schema: "chief-oracle-golden/v1",
  capturedAt: "${GOLDEN_DATE}",
  generator:
    "E1 开发期 live probe（E1 证据 §3）+ E2 X-R6 金样化复算（角色卡/chief-code/docs/change/2026-11-07_E2-XR6_golden-capture.mjs）",
  evidence: Object.freeze({
    capture: "角色卡/chief-code/docs/change/2026-11-07_E1_chief-module-evidence.md §2/§3/§9",
    switch: "角色卡/门禁引擎/docs/change/2026-11-07_E2-XR6_gate-facade-chief-and-closure-evidence.md §1/§7/§9",
    goldenization:
      "角色卡/chief-code/docs/change/2026-11-07_E1_chief-module-evidence.md §10（E2 X-R6 fixture 金样化）",
  }),
  /**
   * 捕获脚本在冻结前执行的复核（任一不符即 throw，不生成 fixture）。X-R6 后 oldSpec 由模块派生
   * （自比较）；独立物证仍是 E1 证据 §3（编辑前捕获）与 X-R6 证据 §7（切换后 0 差异）。
   */
  captureChecks: Object.freeze({
    oldSpecFieldsEqual: true,
    oldCardTextByteEqual: true,
    oldRunRoleCardsEqual: true,
    toolsDeclarationValid: true,
    workflowResourceLoaderMatch: true,
    hubApplyJournalChecks: true,
    independentEvidence:
      "E1 证据 §3（编辑前差分 0）与 E2-XR6 证据 §7（切换后 zeroCopyBinding / 差分 0）",
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
    spec: "差分/规格：8 字段逐项 JSON 比较（含卡文本哈希/条目/预授权/禁写/capabilities/cards）",
    cardText: "差分/卡文本：sha256 / 长度 / 行数",
    cards: "差分/cards：模块 cards 与金样一致（D8 无 legacy write；TRIO_CARD_KINDS.chief 源码 oracle 已冻结）",
    tools: "差分/tools：D1 14 项 catalog + chief 6-id 声明（含 closeCreatedTask）映射/顺序/校验冻结；decidePendingRequest 不声明",
    dispatch: "差分/dispatch：11 例（zero 8 / documented 3）allow 位 + 稳定码 + reportToRoleId；已知差异逐项登记",
    preflight: "差分/动作前置：14 例（zero 12 / documented 2）allow 位/稳定码/unknown-key 口径",
    workflowResource: "差分/context 资源：path/version/sha256/bytes 与捕获期宿主 loader 实测一致",
    hubDispatch: "差分/hub 数据：routing/source/report/purpose/schema/五内置目标与 apply-journal 捕获值一致",
    knownDeltas: "差分/已知差异清单：5 类前缀齐备且与用例登记一致",
    provenance: "金样/provenance：元数据自洽 / 载荷哈希 / 无旧引擎 live 依赖",
  }),
  payloadSha256: ${JSON.stringify(payloadSha256)},
});
`;

const captureJson = {
  meta: {
    task: "2026-11-07-runtime-gate-role-modularization / E2 X-R6 chief fixture goldenization",
    generatedAt: new Date().toISOString(),
    node: process.version,
    repoRoot: ROOT,
    payloadSha256,
  },
  spec,
  toolsCatalog,
  toolsDeclaration,
  runRoleToolGates,
  decisionContext,
  dispatch: dispatchCases,
  preflight: preflightCases,
  workflowResource,
  hubDispatch,
  knownDeltas: KNOWN_DELTAS,
  counts,
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
    `catalog=${toolsCatalog.length} declared=${toolsDeclaration.tools.length}`,
);
console.log(
  `dispatch=${dispatchCases.length} (zero=${dispatchZeroCount} documented=${dispatchDocumentedCount}) ` +
    `preflight=${preflightCases.length} (zero=${preflightZeroCount} documented=${preflightDocumentedCount})`,
);
console.log(`resource sha=${workflowResource.sha256.slice(0, 12)}… bytes=${workflowResource.bytes}`);
console.log(`payloadSha256=${payloadSha256}`);

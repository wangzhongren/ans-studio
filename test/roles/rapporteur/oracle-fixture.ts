// test/roles/rapporteur/oracle-fixture.ts
//
// 差分 fixture：从 E1 过渡期旧 oracle **静态捕获**的期望值（测试不 import 旧引擎；见下方 provenance）。
//
// 捕获方式（2026-11-07，工作树 trunk-amendment）：
//  - 规格/卡文本：直接读取 `BUILT_IN_GOVERNANCE_ROLES` 的 rapporteur 行并与新模块逐字段比较；
//  - 工具注入：以 `openRoleSession` + 捕获 factory 打开 trio rapporteur 会话、提供全部宿主能力，
//    记录实际注入对象键（probe 输出：requestRequirementChange / selectRunChange / submitVersionChange）；
//  - 派发硬授权：调用 `evaluateDispatchAuthorization`，来源 rapporteur 的四组目标事实全部
//    `unknown-source` 拒绝（chief→rapporteur 为正例，但属 chief 模块/引擎范围，见 KNOWN_DELTAS）；
//  - 动作前置：旧实现没有单一纯函数（分散在 schema / apply-journal / 卡文本 / decision-card），
//    fixture 记录每个用例的旧拒绝锚点（文件:行）与期望结果；模块事实键按契约 Q13 由本角色登记。
//
// 测试只 import 本 fixture（纯数据）；旧引擎仅作为开发期捕获来源，不在测试运行期出现。
//
// E2 G9（oracle 金样化）：本文件是**冻结金样**。`ORACLE_GOLDEN_META` 记录来源候选/捕获期哈希/
// 切换后实测/覆盖映射/载荷哈希；测试不再读取工作树旧文件（旧实现删除后差分仍可运行，见
// `test/gates/fixtures/dispatch-parent-golden.ts` 先例与 E2 检查单 G9）。

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

/** 旧注册表 rapporteur 规格（逐字段）。 */
export const ORACLE_RAPPORTEUR_SPEC = Object.freeze({
  id: "rapporteur",
  displayName: "策划",
  function: "proposal",
  entries: Object.freeze<readonly OracleBoundaryEntry[]>([
    Object.freeze({
      root: "project",
      path: "docs/proposals/",
      kind: "directory",
      purpose: "提案（frontmatter: flowId/version/author/status: draft）",
    }),
    Object.freeze({
      root: "project",
      path: "docs/contracts/",
      kind: "directory",
      purpose: "冻结的跨角色契约（版本化文件，不原地改）",
    }),
    Object.freeze({
      root: "project",
      path: "docs/governance/rapporteur/",
      kind: "directory",
      purpose: "策划 / Draft 的治理工作记录",
    }),
  ]),
  preauthorizedDirs: Object.freeze(["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"]),
  forbiddenWritePaths: Object.freeze([
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/chief/",
    "角色卡/product/",
    "角色卡/rapporteur/",
    "角色卡/nominator/",
    "角色卡/convener/",
    "角色卡/verifier/",
    "角色卡/su/",
    "docs/nominations/",
  ]),
  capabilities: Object.freeze<OracleCapabilities>({
    customerInput: true,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  }),
  cards: Object.freeze(["proposal", "decision"]),
  cardText: Object.freeze({
    length: 4676,
    lineCount: 34,
    sha256: "4214c632d0215932ce6ce0dae8f39ae6b8e4a226ce487b58f9e0461552cb5a65",
    intentEntryTextSha256: "854e6c33c3c91be66656e23a65f118797428150b1b121fe8841e116387fbdd66",
  }),
});

/** 旧编排在 trio + 提供全部宿主能力时的实际注入键（probe 输出，按 §3.1 表序重排）。 */
export const ORACLE_RAPPORTEUR_INJECTED_TOOLS: readonly RoleToolId[] = Object.freeze([
  "requestRequirementChange",
  "submitVersionChange",
  "selectRunChange",
]);

export interface OracleDispatchCase {
  readonly name: string;
  readonly input: Readonly<{
    sourceRoleId?: string;
    targetRoleId: string;
    targetKind: "project" | "built-in-governance";
    targetExists?: boolean;
  }>;
  /** 旧 `evaluateDispatchAuthorization` 的 allow 位（来源 rapporteur 恒 false）。 */
  readonly oldAllow: boolean;
  /** 旧拒绝码（仅诊断；新模块码见 expectedCode）。 */
  readonly oldCode: string | null;
  /** 新模块期望 allow 位（R-2；与旧 allow 位一致）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码。 */
  readonly expectedCode: string | null;
}

/**
 * 派发差分用例（来源 = rapporteur；模块是**来源角色**策略）。
 * 旧实现对来源 rapporteur 一律 `unknown-source`；新模块按硬身份/存在性给出更精确的稳定码（见 KNOWN_DELTAS）。
 */
export const ORACLE_DISPATCH_CASES: readonly OracleDispatchCase[] = Object.freeze([
  Object.freeze({
    name: "rapporteur → product（目标真实）",
    input: Object.freeze({ sourceRoleId: "rapporteur", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "unknown-source",
    expectedAllow: false,
    expectedCode: "rapporteur-dispatch-not-authorized",
  }),
  Object.freeze({
    name: "rapporteur → worker（目标真实）",
    input: Object.freeze({ sourceRoleId: "rapporteur", targetRoleId: "worker-1", targetKind: "project", targetExists: true }),
    oldAllow: false,
    oldCode: "unknown-source",
    expectedAllow: false,
    expectedCode: "rapporteur-dispatch-not-authorized",
  }),
  Object.freeze({
    name: "rapporteur → verifier（目标不存在）",
    input: Object.freeze({ sourceRoleId: "rapporteur", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "unknown-source",
    expectedAllow: false,
    expectedCode: "rapporteur-dispatch-target-missing",
  }),
  Object.freeze({
    name: "rapporteur → 空目标 id",
    input: Object.freeze({ sourceRoleId: "rapporteur", targetRoleId: "", targetKind: "project", targetExists: true }),
    oldAllow: false,
    oldCode: "unknown-source",
    expectedAllow: false,
    expectedCode: "rapporteur-dispatch-target-invalid",
  }),
  Object.freeze({
    name: "来源缺失（未知来源）",
    input: Object.freeze({ targetRoleId: "worker-1", targetKind: "project", targetExists: true }),
    oldAllow: false,
    oldCode: "unknown-source",
    expectedAllow: false,
    expectedCode: "rapporteur-dispatch-source-missing",
  }),
  Object.freeze({
    name: "来源冒用 convener（模块只回答本角色）",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "worker-1", targetKind: "project", targetExists: true }),
    oldAllow: false,
    oldCode: "unknown-source",
    expectedAllow: false,
    expectedCode: "rapporteur-dispatch-source-mismatch",
  }),
]);

export interface OraclePreflightCase {
  readonly name: string;
  readonly action:
    | "detail-amendment"
    | "run-change"
    | "requirement-change"
    | "review"
    | "version-upgrade";
  readonly facts: Readonly<Record<string, unknown>>;
  /** 旧行为锚点（schema / Service / 卡文本）；无单一纯函数。 */
  readonly oldAnchor: string;
  /** 新模块期望 allow 位（`allow:true` 只表示纯策略不反对）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
}

/** 动作前置差分用例（正负例；事实键按本角色 api-spec 登记，契约 Q13）。 */
export const ORACLE_PREFLIGHT_CASES: readonly OraclePreflightCase[] = Object.freeze([
  // — detail-amendment —
  Object.freeze({
    name: "detail-amendment 整单正例",
    action: "detail-amendment",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", kind: "detail-amendment", wholeOrder: true, legacyCardPath: "none" }),
    oldAnchor: "apply-journal.ts:567（身份）；卡文本 210（整单直接提交）",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "detail-amendment 发起人非 rapporteur",
    action: "detail-amendment",
    facts: Object.freeze({ initiatorRoleId: "convener", kind: "detail-amendment", wholeOrder: true, legacyCardPath: "none" }),
    oldAnchor: "apply-journal.ts:567（trustedActorRoleId 必须为 rapporteur）",
    expectedAllow: false,
    expectedCode: "rapporteur-initiator-mismatch",
  }),
  Object.freeze({
    name: "detail-amendment kind 非 detail-amendment",
    action: "detail-amendment",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", kind: "version-upgrade", wholeOrder: true, legacyCardPath: "none" }),
    oldAnchor: "apply-journal.ts:567（version-upgrade 归 product）；Model VERSION_CHANGE_INITIATOR_BY_KIND",
    expectedAllow: false,
    expectedCode: "rapporteur-facts-invalid",
  }),
  Object.freeze({
    name: "detail-amendment 非整单",
    action: "detail-amendment",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", kind: "detail-amendment", wholeOrder: false, legacyCardPath: "none" }),
    oldAnchor: "卡文本 210 / P1.6 §6.3（整单策略）；旧逐项路径 apply-journal.ts:698",
    expectedAllow: false,
    expectedCode: "rapporteur-amendment-not-whole-order",
  }),
  Object.freeze({
    name: "detail-amendment 走旧提案接受路径",
    action: "detail-amendment",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", kind: "detail-amendment", wholeOrder: true, legacyCardPath: "proposal-accept" }),
    oldAnchor: "卡文本 210（不发提案接受/VCA 批拒/修正案逐项/最终卡）",
    expectedAllow: false,
    expectedCode: "rapporteur-amendment-legacy-card-path",
  }),
  Object.freeze({
    name: "detail-amendment 缺 wholeOrder 事实",
    action: "detail-amendment",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", kind: "detail-amendment", legacyCardPath: "none" }),
    oldAnchor: "契约 §3.4/D4（缺键 fail-closed）",
    expectedAllow: false,
    expectedCode: "rapporteur-facts-missing",
  }),
  // — run-change —
  Object.freeze({
    name: "run-change continue-frozen 正例",
    action: "run-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      mode: "continue-frozen",
      operationId: "op-1",
      runId: "run-1",
      expectedPinDigest: "a".repeat(64),
      targetTrunkVersion: 3,
      targetTrunkDigest: "b".repeat(64),
      reason: "旧 pin 仍有效，继续冻结执行",
    }),
    oldAnchor: "apply-journal.ts:1464（身份/mode/reason）；schema.ts:47（绑定字段）",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "run-change stop 正例（停稳证据仍归 Service）",
    action: "run-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      mode: "stop",
      operationId: "op-2",
      runId: "run-1",
      expectedPinDigest: "a".repeat(64),
      targetTrunkVersion: 3,
      targetTrunkDigest: "b".repeat(64),
      reason: "停止旧链",
    }),
    oldAnchor: "apply-journal.ts:1461-1498（direct 路径对 stop 返回 blocked run-stop-unverified；停稳证据不在模块）",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "run-change stop-and-restart 正例",
    action: "run-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      mode: "stop-and-restart",
      operationId: "op-3",
      runId: "run-1",
      expectedPinDigest: "a".repeat(64),
      targetTrunkVersion: 4,
      targetTrunkDigest: "c".repeat(64),
      reason: "停稳旧链后在完整新依据上重派",
    }),
    oldAnchor: "apply-journal.ts:1505-1560（两阶段 stop/restart；模块只做角色侧策略）",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "run-change 非法 mode",
    action: "run-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      mode: "restart",
      operationId: "op-4",
      runId: "run-1",
      expectedPinDigest: "a".repeat(64),
      targetTrunkVersion: 3,
      targetTrunkDigest: "b".repeat(64),
      reason: "非法模式",
    }),
    oldAnchor: "apply-journal.ts:1464（mode 闭集）；Model RUN_CHANGE_MODES",
    expectedAllow: false,
    expectedCode: "rapporteur-run-change-mode-invalid",
  }),
  Object.freeze({
    name: "run-change 缺 reason",
    action: "run-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      mode: "continue-frozen",
      operationId: "op-5",
      runId: "run-1",
      expectedPinDigest: "a".repeat(64),
      targetTrunkVersion: 3,
      targetTrunkDigest: "b".repeat(64),
    }),
    oldAnchor: "apply-journal.ts:1464（reason 必填）",
    expectedAllow: false,
    expectedCode: "rapporteur-facts-missing",
  }),
  Object.freeze({
    name: "run-change 目标版本非正整数",
    action: "run-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      mode: "continue-frozen",
      operationId: "op-6",
      runId: "run-1",
      expectedPinDigest: "a".repeat(64),
      targetTrunkVersion: 0,
      targetTrunkDigest: "b".repeat(64),
      reason: "目标版本非法",
    }),
    oldAnchor: "schema.ts:47（targetTrunk.version integer minimum 1）",
    expectedAllow: false,
    expectedCode: "rapporteur-facts-invalid",
  }),
  Object.freeze({
    name: "run-change 发起人非 rapporteur",
    action: "run-change",
    facts: Object.freeze({
      initiatorRoleId: "convener",
      mode: "continue-frozen",
      operationId: "op-7",
      runId: "run-1",
      expectedPinDigest: "a".repeat(64),
      targetTrunkVersion: 3,
      targetTrunkDigest: "b".repeat(64),
      reason: "冒用",
    }),
    oldAnchor: "apply-journal.ts:1464（Only the real rapporteur…）",
    expectedAllow: false,
    expectedCode: "rapporteur-initiator-mismatch",
  }),
  // — requirement-change —
  Object.freeze({
    name: "requirement-change flowId 归因正例",
    action: "requirement-change",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", changeKind: "scope", flowId: "flow-a", summary: "新增范围", rationale: "客户要求新增范围" }),
    oldAnchor: "schema.ts:1319-1398（至少一个归因键；changeKind/summary/rationale 必填）",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "requirement-change intentId 归因正例",
    action: "requirement-change",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", changeKind: "authorization", intentId: "intent-a", summary: "新增授权", rationale: "需要新授权" }),
    oldAnchor: "schema.ts:1335-1340 / 1386（intentId 可单独归因）",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "requirement-change taskId 归因正例",
    action: "requirement-change",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", changeKind: "other", taskId: "T-1", summary: "其他变更", rationale: "任务范围内说明" }),
    oldAnchor: "schema.ts:1341-1344（taskId 归因键）",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "requirement-change 无归因键",
    action: "requirement-change",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", changeKind: "scope", summary: "无归因", rationale: "缺少 flow/intent/task" }),
    oldAnchor: "schema.ts:1386（flowId/intentId/taskId 至少一个）",
    expectedAllow: false,
    expectedCode: "rapporteur-requirement-change-ref-missing",
  }),
  Object.freeze({
    name: "requirement-change 非法 changeKind",
    action: "requirement-change",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", changeKind: "budget", flowId: "flow-a", summary: "预算", rationale: "非法类型" }),
    oldAnchor: "schema.ts:1345-1350（enum scope/authorization/constraint/cost/other）",
    expectedAllow: false,
    expectedCode: "rapporteur-facts-invalid",
  }),
  Object.freeze({
    name: "requirement-change 空 summary",
    action: "requirement-change",
    facts: Object.freeze({ initiatorRoleId: "rapporteur", changeKind: "scope", flowId: "flow-a", summary: "   ", rationale: "空摘要" }),
    oldAnchor: "schema.ts:1351-1356（summary minLength 1）",
    expectedAllow: false,
    expectedCode: "rapporteur-facts-invalid",
  }),
  Object.freeze({
    name: "requirement-change 声称已批准",
    action: "requirement-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      changeKind: "scope",
      flowId: "flow-a",
      summary: "声称批准",
      rationale: "申请≠批准",
      claimsApproved: true,
    }),
    oldAnchor: "model/runtime.ts:2152-2159；schema.ts:1384-1392（申请≠批准/不代表意图已变更）",
    expectedAllow: false,
    expectedCode: "rapporteur-requirement-change-approval-claimed",
  }),
  Object.freeze({
    name: "requirement-change 发起方自批",
    action: "requirement-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      changeKind: "scope",
      flowId: "flow-a",
      summary: "自批",
      rationale: "发起方不得自批",
      selfApproval: true,
    }),
    oldAnchor: "decision-card.ts:5-8 / 36（发起方不得自批）",
    expectedAllow: false,
    expectedCode: "rapporteur-requirement-change-self-approval",
  }),
  Object.freeze({
    name: "requirement-change 带可选 impact 正例",
    action: "requirement-change",
    facts: Object.freeze({
      initiatorRoleId: "rapporteur",
      changeKind: "constraint",
      flowId: "flow-a",
      summary: "约束变化",
      rationale: "新增约束",
      impact: "影响排期",
      proposedIntentPatch: "建议文本",
    }),
    oldAnchor: "schema.ts:1363-1375（impact/proposedIntentPatch 可选）",
    expectedAllow: true,
    expectedCode: null,
  }),
  // — 未覆盖动作 —
  Object.freeze({
    name: "review 不在 rapporteur 覆盖范围",
    action: "review",
    facts: Object.freeze({}),
    oldAnchor: "契约 §3.4（不在本角色归属内的 action ⇒ action-not-covered）",
    expectedAllow: false,
    expectedCode: "action-not-covered",
  }),
  Object.freeze({
    name: "version-upgrade 归 product",
    action: "version-upgrade",
    facts: Object.freeze({}),
    oldAnchor: "Model VERSION_CHANGE_INITIATOR_BY_KIND（version-upgrade = product）",
    expectedAllow: false,
    expectedCode: "action-not-covered",
  }),
]);

/**
 * 已列明差异（契约允许：E2 模块化阶段应为零差异；本模块的差异仅限下列登记项）。
 * 差分测试会断言：除这些已列明项外，allow 位/规格字段/工具集合与旧 oracle 完全一致。
 */
export const KNOWN_DELTAS: readonly string[] = Object.freeze([
  "dispatch-code-map：旧硬授权对来源 rapporteur 返回 unknown-source；新模块按 R-2 给出条件化稳定码（rapporteur-dispatch-*）。allow 位一致（恒 false）。",
  "dispatch-scope：旧 evaluateDispatchAuthorization 同时编码 chief/convener 目标规则；rapporteur 模块只回答本角色作为来源的策略（R-2 把路由/hub/报告时点留在引擎），跨角色目标规则归对应角色模块。",
  "preflight-fact-schema：模块事实键按契约 Q13 由本角色 api-spec 登记（旧实现没有单一 preflight 纯函数；行为分散在 schema/Service/卡文本），因此不比较旧函数返回码。",
  "preflight-run-change-stop：旧 direct selectRunChange 对 stop/stop-and-restart 返回 blocked(run-stop-unverified)；模块 allow 只表示纯策略不反对，停稳证据与两阶段提交仍由 Service/宿主执行（模块不采集停稳证据）。",
  "preflight-detail-amendment-legacy：旧逐项/最终卡路径是 VCA 历史状态机；模块按卡文本把 legacyCardPath 编码为拒绝，属于策略数据化，不是旧函数返回值对齐。",
  "tools-declaration-vs-injection：模块声明角色允许的 3 个稳定 id（是否实际注入仍由引擎按会话模式/宿主能力门控）；probe 在提供全部能力时旧注入集合与声明集合一致。",
]);

/**
 * 金样载荷（**冻结**）：差分测试的全部期望值。`ORACLE_GOLDEN_META.payloadSha256` 是
 * `JSON.stringify(ORACLE_GOLDEN_PAYLOAD)` 的 SHA-256；改动任一期望值必须同步更新元数据哈希，
 * 并在角色证据登记原因（E2 检查单 G9；不得以删断言/删 fixture 过关）。
 */
export const ORACLE_GOLDEN_PAYLOAD = Object.freeze({
  spec: ORACLE_RAPPORTEUR_SPEC,
  tools: ORACLE_RAPPORTEUR_INJECTED_TOOLS,
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
  /** E1 捕获时的旧实现锚点（历史行号；切换后不保证仍对应同一行）。 */
  readonly anchors: string;
  /** E2 处置（每文件）——只作历史记录，运行期不读取旧文件。 */
  readonly e2Disposition: string;
}

export interface OracleSwitchIdentity extends OracleSourceIdentity {
  /** E2 切换后的等价结构锚点（实测）。 */
  readonly anchors: string;
}

/**
 * 冻结金样元数据（E2 G9 / B1 E2.5/M4/D9 / E2 检查单 §11 G9；先例
 * `test/gates/fixtures/dispatch-parent-golden.ts`）。
 *
 * - `capture`：E1（2026-11-07）捕获期望值时的旧 oracle 文件身份（行数 + SHA-256 + 锚点）。
 *   捕获发生在 X-R1/X-R2 之前的工作树，未单独提交；哈希记录见 E1 证据 §2。
 * - `switch`：E2 X-R1（run-role.ts）/ X-R2（governance-roles.ts）切换后的实测身份；
 *   `unchanged` 五文件与 `capture` 逐字节一致。切换后哈希见 X-R2 证据 §1/§7.1。
 * - 两者都是**历史记录**：差分测试不再读取工作树旧文件，旧实现删除后测试仍可运行。
 * - `coverage`：期望面 → 测试断言映射（不得删覆盖）；`counts` 与 fixture 数组长度一致。
 * - `payloadSha256`：冻结载荷哈希（防静默漂移）。
 */
export const ORACLE_GOLDEN_META = Object.freeze({
  schema: "rapporteur-oracle-golden/v1",
  capturedAt: "2026-11-07",
  generator: "E1 开发期 live probe：openRoleSession 捕获 trio rapporteur 注入键、evaluateDispatchAuthorization 捕获派发 allow 位、旧 schema/apply-journal/卡文本锚点捕获动作前置（E1 证据 §5/§6）",
  evidence: Object.freeze({
    capture: "角色卡/rapporteur-code/docs/change/2026-11-07_E1_rapporteur-module-evidence.md §2/§5",
    switch: "角色卡/门禁引擎/docs/change/2026-11-07_E2-XR2_gate-facade-rapporteur-evidence.md §1/§7.1（run-role.ts 由 X-R1 改；X-R2 未改）",
  }),
  capture: Object.freeze<Readonly<Record<string, OracleCaptureIdentity>>>({
    governanceRoles: Object.freeze({
      path: "src/common/门禁引擎/governance-roles.ts",
      lineCount: 794,
      sha256: "fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e",
      anchors: "404-437（规格）/ 200-224（卡文本）",
      e2Disposition: "X-R2 已切换：内联 rapporteur 规格/卡文本删除，`specOf(rapporteurRoleModule)` 装配；matrix 逐字迁入 `BUILT_IN_ROLE_MATRIX`",
    }),
    runRole: Object.freeze({
      path: "src/pipeline/orchestration/run-role.ts",
      lineCount: 3333,
      sha256: "026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6",
      anchors: "1808-1825（工具门控）/ 2859-2878（TRIO_CARD_KINDS）/ 2746-2826（choice 默认）",
      e2Disposition: "X-R1 S2 已切换：product 工具门控改读模块；rapporteur 工具注入旧路径保留（X-R2 未改本文件）；`cardKindsOf` 自模块已装配起模块优先、TRIO_CARD_KINDS 留作回退",
    }),
    applyJournal: Object.freeze({
      path: "src/service/trunk/impl/apply-journal.ts",
      lineCount: 3723,
      sha256: "fd778342ff83ebd51582847cd78f8bdfe0861bd6d8b789e829ac2bfaf3255ffb",
      anchors: "567（detail-amendment 身份）/ 1461-1498（selectRunChange）/ 1505-1560（两阶段 stop）",
      e2Disposition: "E2 X-R2 时点未改（preflight 接入 Service 属后续单元）",
    }),
    runtimeSchema: Object.freeze({
      path: "src/provider/runtime/schema.ts",
      lineCount: 1829,
      sha256: "6f528a88c6f0afbd5db12c27f0826ab5e4b6e29788162c2cea8b9676a11f9ef8",
      anchors: "47（select_run_change）/ 1319-1398（request_requirement_change）",
      e2Disposition: "E2 X-R2 时点未改",
    }),
    decisionCard: Object.freeze({
      path: "src/common/编排/decision-card.ts",
      lineCount: 145,
      sha256: "ef90c2096b2fdaa67c199bcb54d1a6743389914faad2ffae3d0db244c0a945b5",
      anchors: "36（允许角色）/ 86-145（结构校验）",
      e2Disposition: "E2 X-R2 时点未改",
    }),
    workflowPreconditions: Object.freeze({
      path: "src/common/编排/workflow-preconditions.ts",
      lineCount: 1609,
      sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
      anchors: "1530-1570（evaluateDispatchAuthorization）",
      e2Disposition: "E2 X-R2 时点未改（E2.7 记为 N/A 保留）",
    }),
    roleToolRegistry: Object.freeze({
      path: "src/common/门禁引擎/role-tool-registry.ts",
      lineCount: 157,
      sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
      anchors: "52-67（ROLE_TOOL_CATALOG）",
      e2Disposition: "E2 X-R2 时点未改",
    }),
  }),
  switch: Object.freeze({
    changed: Object.freeze<Readonly<Record<string, OracleSwitchIdentity>>>({
      governanceRoles: Object.freeze({
        path: "src/common/门禁引擎/governance-roles.ts",
        lineCount: 755,
        sha256: "45d331ed4835be3a2d43f960d35e90b9c02c98eba64ce23c0a3e0aa20b746493",
        anchors: "23（模块 import）/ 276-288（BUILT_IN_ROLE_MATRIX.rapporteur）/ 377（specOf(rapporteurRoleModule)）/ 532（BUILT_IN_ROLE_MODULES 装配）",
      }),
      runRole: Object.freeze({
        path: "src/pipeline/orchestration/run-role.ts",
        lineCount: 3415,
        sha256: "fd65cc4a83734c01737c512250fac322f3a9c0fe98e3b8408d6260fea3e04f6d",
        anchors: "1828-1855（三提交能力工具门控；rapporteur 旧路径保留）/ 2937-2959（TRIO_CARD_KINDS 回退 + cardKindsOf 模块优先）/ 2740（rapporteur 预授权前缀）",
      }),
    }),
    unchanged: Object.freeze<Readonly<Record<string, OracleSourceIdentity>>>({
      applyJournal: Object.freeze({
        path: "src/service/trunk/impl/apply-journal.ts",
        lineCount: 3723,
        sha256: "fd778342ff83ebd51582847cd78f8bdfe0861bd6d8b789e829ac2bfaf3255ffb",
      }),
      runtimeSchema: Object.freeze({
        path: "src/provider/runtime/schema.ts",
        lineCount: 1829,
        sha256: "6f528a88c6f0afbd5db12c27f0826ab5e4b6e29788162c2cea8b9676a11f9ef8",
      }),
      decisionCard: Object.freeze({
        path: "src/common/编排/decision-card.ts",
        lineCount: 145,
        sha256: "ef90c2096b2fdaa67c199bcb54d1a6743389914faad2ffae3d0db244c0a945b5",
      }),
      workflowPreconditions: Object.freeze({
        path: "src/common/编排/workflow-preconditions.ts",
        lineCount: 1609,
        sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
      }),
      roleToolRegistry: Object.freeze({
        path: "src/common/门禁引擎/role-tool-registry.ts",
        lineCount: 157,
        sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
      }),
    }),
  }),
  counts: Object.freeze({
    specFields: 8,
    tools: 3,
    dispatchCases: 6,
    preflightCases: 24,
    knownDeltas: 6,
    fixtureComparisons: 42,
  }),
  coverage: Object.freeze({
    spec: "differential.test.ts「差分·规格」：8 字段逐项 JSON 比较",
    cardText: "differential.test.ts「差分·卡文本」：sha256 / 长度 / 行数",
    tools: "differential.test.ts「差分·工具集合」：声明集合与旧注入 probe 双向差集",
    dispatch: "differential.test.ts「差分·派发」：6 用例 allow 位 + 稳定码逐项登记",
    preflight: "differential.test.ts「差分·动作前置」：24 用例 allow 位/稳定码",
    knownDeltas: "differential.test.ts「差分·已知差异清单」：6 类前缀齐备",
    provenance: "differential.test.ts「金样·provenance」：元数据自洽 / 载荷哈希 / 无旧引擎 live 依赖",
  }),
  payloadSha256: "c1062fc28db7888114066ef2364a87ed22440c729739609f28fa11137c798315",
});

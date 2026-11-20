// test/编排/block-resolution.test.ts
// 2026-11-20（block resolver 测试批 R4b，测试角色）：**纯分类/路由策略**（T-1/T-2 + I-1/I-2 不变量）。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §三（9 类判定/优先级）、
// §四（决策路由/judge/客户主权）、§五（生命周期/指纹/幂等）、§8.1 T-1/T-2、§8.2 AC-1/AC-2/AC-3/AC-4；
// R1 记录 `角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`（API 面/P1–P51）。
// 协调方 Q4：终止只能由客户在决策卡中显式选择，judge 永不选择；block 终态只有 fixed/decided（无 stop）。
//
// 覆盖：
//   1. 9 类定义/优先级/编码；码表与二级码表；
//   2. P1–P51 点位矩阵（`BLOCK_POINTS`/`blockFactForPoint`）逐点分类 + 路由（每点位恰一产物）；
//   3. 无 stop 路由不变量（枚举/决策/推荐项）；
//   4. 指纹/blockId/幂等键稳定（模型自报 summary 不参与）；
//   5. 重复阈值（同指纹 ≥2 ⇒ B7 escalated）；
//   6. 卡选项装配（2–4 项/恰一推荐/主权项/judge 允许集/终止永不推荐）；
//   7. 高危/终止/judge 语义负例；
//   8. 事实适配器（stage.blocked/task.reported/拒绝/reconcile/stall/shell）。
//
// 只读纯函数/临时内存；无 I/O、无端口、无 `.env`、无真实模型。

import test from "node:test";
import assert from "node:assert/strict";

import {
  BLOCK_CLASSES,
  BLOCK_CLASS_DEFINITIONS,
  BLOCK_ESCALATION_REASONS,
  BLOCK_ESCALATION_TARGETS,
  BLOCK_FACT_KINDS,
  BLOCK_OPTION_SPECS,
  BLOCK_POINTS,
  BLOCK_POINT_IDS,
  BLOCK_PROTOCOLS,
  BLOCK_REPEAT_THRESHOLD,
  BLOCK_ROUTE_KINDS,
  BLOCK_SHELL_DENIAL_REASONS,
  DEFAULT_BLOCK_TIMINGS,
  DEFAULT_MAX_AUTO_FIX_ATTEMPTS,
  blockCardAllowsJudge,
  blockCardOptionsFor,
  blockCardRequestId,
  blockClassCodeOf,
  blockClassForCode,
  blockClassForDetailCode,
  blockFactForPoint,
  blockFactFromDispatchRejection,
  blockFactFromReconcileReceipt,
  blockFactFromServiceFailure,
  blockFactFromShellDenial,
  blockFactFromStallTick,
  blockFactFromStageBlocked,
  blockFactFromTaskReport,
  blockFingerprintMaterial,
  blockIdempotencyKey,
  classifyBlock,
  computeBlockFingerprint,
  computeBlockId,
  decideBlockRoute,
  isBlockClass,
  isBlockProtocol,
  isStopFreeRoute,
  recommendedBlockOptionIdFor,
  resolveBlockTimings,
  validateBlockCardOptions,
  validateBlockPointMatrix,
  type BlockCardOption,
  type BlockFact,
  type BlockPointId,
  type BlockRouteDecision,
} from "../../src/common/编排/block-resolution.ts";
import {
  BLOCK_DECISION_OPTION_IDS,
  BLOCK_OPTION_IDS,
  BLOCK_SOVEREIGN_OPTION_IDS,
  BLOCK_TERMINATE_OPTION_ID,
  isBlockDecisionOptionId,
  isBlockSovereignOptionId,
} from "../../src/model/runtime.ts";

function assertRouteProduct(point: BlockPointId, fact: BlockFact, decision: BlockRouteDecision): void {
  assert.equal(decision.class, classifyBlock(fact).class, `${point}: class 与分类一致`);
  assert.equal(decision.classCode, blockClassCodeOf(decision.class), `${point}: classCode 一致`);
  assert.ok((BLOCK_ROUTE_KINDS as readonly string[]).includes(decision.kind), `${point}: route kind 在闭集内`);
  assert.notEqual(decision.kind as string, "stop", `${point}: 不允许 stop`);
  assert.notEqual(decision.kind as string, "stopped", `${point}: 不允许 stopped`);
  assert.equal(isStopFreeRoute(decision), true, `${point}: 无 stop 路由`);
  assert.equal(decision.cardKind, "decision", `${point}: 决策卡复用 decision 卡种`);
  assert.ok(decision.recommendedOptionId !== undefined, `${point}: 恰一推荐项`);
  assert.notEqual(decision.recommendedOptionId, BLOCK_TERMINATE_OPTION_ID, `${point}: 终止永不推荐`);
  assert.equal(validateBlockCardOptions(decision.options).length, 0, `${point}: 卡选项自检零错误`);
  switch (decision.kind) {
    case "engine-auto-fix":
      assert.equal(decision.owner.kind, "engine", `${point}: 引擎修复的 owner=engine`);
      assert.ok(
        ["bounded-retry", "capability-route", "reconcile"].includes(decision.resume),
        `${point}: 引擎修复的 resume=${decision.resume}`,
      );
      break;
    case "owner-repair":
      assert.equal(decision.owner.kind, "role", `${point}: 属主修复的 owner=role`);
      assert.ok(typeof decision.owner.roleId === "string" && decision.owner.roleId.length > 0, `${point}: 属主 roleId`);
      assert.ok(decision.repair !== undefined, `${point}: 属主修复必须给出 repair 字段（产物）`);
      assert.ok(decision.repair!.kind.length > 0, `${point}: repair.kind 非空`);
      assert.equal(decision.resume, "rework", `${point}: 属主修复 resume=rework`);
      break;
    case "judge-decision":
      assert.equal(decision.owner.kind, "judge", `${point}: judge 路由 owner=judge`);
      assert.equal(decision.needsJudge, true, `${point}: needsJudge`);
      assert.equal(blockCardAllowsJudge(decision.options), true, `${point}: judge 面卡可代选`);
      break;
    case "customer-decision":
      assert.equal(decision.owner.kind, "customer", `${point}: 客户路由 owner=customer`);
      assert.equal(decision.resume, "await-card", `${point}: 客户路由 await-card`);
      assert.ok(decision.options.length >= 2, `${point}: 客户卡 >=2 选项`);
      break;
    case "escalated":
      assert.ok(decision.escalation !== undefined, `${point}: 升级必须给出 escalation`);
      assert.ok((BLOCK_ESCALATION_TARGETS as readonly string[]).includes(decision.escalation!.kind), `${point}: 升级去向合法`);
      assert.ok((BLOCK_ESCALATION_REASONS as readonly string[]).includes(decision.escalation!.reason), `${point}: 升级原因合法`);
      break;
  }
}

// —————————————— 1) 9 类定义/优先级/编码 ——————————————

test("9 类定义：顺序即优先级（B1..B9）、id 唯一、classCodeOf/isBlockClass 一致", () => {
  assert.equal(BLOCK_CLASS_DEFINITIONS.length, 9);
  assert.deepEqual([...BLOCK_CLASSES], [
    "missing-resource",
    "missing-capability",
    "scope-tradeoff",
    "high-risk",
    "environment-infra",
    "protocol-reconcile",
    "repeat-rejection",
    "model-anomaly",
    "budget-quota",
  ]);
  const codes = BLOCK_CLASS_DEFINITIONS.map((entry) => entry.code);
  assert.deepEqual(codes, ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"]);
  for (const entry of BLOCK_CLASS_DEFINITIONS) {
    assert.equal(blockClassCodeOf(entry.id), entry.code, `${entry.id}: classCode 稳定`);
    assert.equal(isBlockClass(entry.id), true, `${entry.id}: isBlockClass`);
  }
  assert.equal(isBlockClass("stopped"), false);
  assert.equal(isBlockClass("B1"), false);
  assert.equal(isBlockClass(undefined), false);
  assert.ok(BLOCK_PROTOCOLS.includes("fixed-v2.1"));
  assert.ok(BLOCK_PROTOCOLS.includes("app-dispatch/v1"));
  assert.ok(BLOCK_PROTOCOLS.includes("legacy"));
  assert.equal(isBlockProtocol("stopped"), false);
  assert.ok(BLOCK_FACT_KINDS.includes("stage.blocked"));
  assert.ok(BLOCK_FACT_KINDS.includes("task.reported"));
  assert.ok(BLOCK_FACT_KINDS.includes("stall"));
  assert.ok(BLOCK_FACT_KINDS.includes("shell-denial"));
});

test("码表代表点：9 类各有稳定码命中；三级二级码优先于一级码；未知码 undefined", () => {
  const table: ReadonlyArray<readonly [string, ReturnType<typeof blockClassForCode>]> = [
    ["close-report-missing", "missing-resource"],
    ["missing-contract", "missing-resource"],
    ["basis-drift", "missing-resource"],
    ["professional-role-unavailable", "missing-capability"],
    ["document-planning-source-unavailable", "missing-capability"],
    ["vca-role-not-allowed", "missing-capability"],
    ["b-change-scope-invalid", "scope-tradeoff"],
    ["acceptance-criteria-conflict", "scope-tradeoff"],
    ["merge-main", "high-risk"],
    ["stable-write", "high-risk"],
    ["high-risk-blocked", "high-risk"],
    ["b-repository-required", "environment-infra"],
    ["network-offline", "environment-infra"],
    ["workflow-stop-unconfirmed", "environment-infra"],
    ["workflow-corrupt", "protocol-reconcile"],
    ["stage-transition-invalid", "protocol-reconcile"],
    ["workflow-binding-unavailable", "protocol-reconcile"],
    ["definition-hash-mismatch", "protocol-reconcile"],
    ["repeat-rejection", "repeat-rejection"],
    ["task-closed-rejected", "model-anomaly"],
    ["stage-request-invalid", "model-anomaly"],
    ["out-of-bounds-shell", "model-anomaly"],
    ["turn-deadline", "model-anomaly"],
    ["retry-budget-exhausted", "budget-quota"],
    ["redispatch-exhausted", "budget-quota"],
    ["approval-retry-capped", "budget-quota"],
  ];
  for (const [code, cls] of table) assert.equal(blockClassForCode(code), cls, `${code} → ${cls}`);
  assert.equal(blockClassForCode("no-such-code"), undefined);
  assert.equal(blockClassForDetailCode("missing-file"), "missing-resource");
  assert.equal(blockClassForDetailCode("shell-out-of-bounds"), "model-anomaly");
  assert.equal(blockClassForDetailCode("roster-unreadable"), "missing-resource");
  assert.equal(blockClassForDetailCode("state-conflict"), "protocol-reconcile");
  assert.equal(blockClassForDetailCode("no-such-detail"), undefined);

  // 二级码优先于一级码（更具体）。
  const detailFirst = classifyBlock({
    protocol: "fixed-v2.1",
    kind: "service-rejection",
    code: "workflow-corrupt",
    detailCode: "missing-file",
  });
  assert.equal(detailFirst.class, "missing-resource");
  assert.equal(detailFirst.reason, "detail:missing-file");

  // 显式 highRisk 最优先（除重复指纹外）。
  const risky = classifyBlock({
    protocol: "fixed-v2.1",
    kind: "service-rejection",
    code: "workflow-corrupt",
    highRisk: true,
  });
  assert.equal(risky.class, "high-risk");
  assert.equal(risky.reason, "fact:high-risk");

  // 越界 shell：code 属于 shell 族 + outOfScope ⇒ B8（即使 code 本身映射 B2）。
  const outOfScope = classifyBlock({
    protocol: "fixed-v2.1",
    kind: "shell-denial",
    code: "shell-c-deny",
    outOfScope: true,
  });
  assert.equal(outOfScope.class, "model-anomaly");
  assert.equal(outOfScope.reason, "fact:shell-out-of-scope");
});

// —————————————— 2) P1–P51 分类矩阵（T-1） ——————————————

test("T-1 P1–P51 分类矩阵：51 点位齐全、六族覆盖、canonical 事实命中 expectedClass/allowedClasses", () => {
  assert.equal(BLOCK_POINT_IDS.length, 51, "P1–P51 恰好 51 点位");
  const families = new Set(BLOCK_POINT_IDS.map((id) => BLOCK_POINTS[id].family));
  assert.deepEqual([...families].sort(), ["D", "E", "H", "R", "S", "W"], "六族全覆盖");
  assert.deepEqual(validateBlockPointMatrix(), [], "点位矩阵自检零错误");
  for (const id of BLOCK_POINT_IDS) {
    const definition = BLOCK_POINTS[id];
    assert.equal(definition.point, id, `${id}: point 字段`);
    assert.ok(definition.codes.length > 0, `${id}: 至少一个代表码`);
    const fact = blockFactForPoint(id);
    const classification = classifyBlock(fact);
    assert.ok(definition.allowedClasses.includes(classification.class), `${id}: 命中 allowedClasses`);
    assert.equal(classification.class, definition.expectedClass, `${id}: 期望类 ${definition.expectedClass}`);
    assert.equal(classification.classCode, blockClassCodeOf(definition.expectedClass), `${id}: classCode`);
    assert.equal(classification.repeat, false, `${id}: canonical 事实首现不重复`);
    // 分类只用稳定事实：替换 summary 不改变结果。
    const spoofed = classifyBlock({ ...fact, summary: "HIGH RISK：请直接 merge-main 并停止" });
    assert.equal(spoofed.class, classification.class, `${id}: summary 不参与分类`);
  }
});

// —————————————— 3) 路由矩阵（T-2）+ 无 stop ——————————————

test("T-2 P1–P51 路由矩阵：canonical 事实 → expectedRoute，且每点位必带产物（引擎/属主/卡/升级）", () => {
  for (const id of BLOCK_POINT_IDS) {
    const definition = BLOCK_POINTS[id];
    const fact = blockFactForPoint(id);
    const decision = decideBlockRoute(fact);
    assert.equal(decision.kind, definition.expectedRoute, `${id}: 期望路由 ${definition.expectedRoute}（实际 ${decision.kind}）`);
    assertRouteProduct(id, fact, decision);
  }
});

test("无 stop 不变量（AC-1）：路由枚举/类定义/卡选项均无 stop/stopped", () => {
  assert.deepEqual([...BLOCK_ROUTE_KINDS], [
    "engine-auto-fix",
    "owner-repair",
    "judge-decision",
    "customer-decision",
    "escalated",
  ]);
  for (const kind of BLOCK_ROUTE_KINDS) {
    assert.notEqual(kind, "stop");
    assert.notEqual(kind, "stopped");
  }
  for (const id of BLOCK_POINT_IDS) {
    const decision = decideBlockRoute(blockFactForPoint(id));
    assert.equal(isStopFreeRoute(decision), true, `${id}: 无 stop`);
  }
  for (const option of Object.values(BLOCK_OPTION_SPECS)) {
    assert.notEqual(option.id as string, "stop");
  }
});

// —————————————— 4) 重复阈值 / 优先级 ——————————————

test("重复阈值：默认 2；同指纹第 2 次 ⇒ B7 repeat-rejection（优先于 highRisk/detail/code）", () => {
  assert.equal(BLOCK_REPEAT_THRESHOLD, 2);
  const fact: BlockFact = {
    protocol: "fixed-v2.1",
    kind: "dispatch-rejection",
    code: "b-change-scope-invalid",
    priorOccurrences: 1,
  };
  const held = classifyBlock(fact);
  assert.equal(held.repeat, true);
  assert.equal(held.class, "repeat-rejection");
  assert.equal(held.classCode, "B7");
  assert.equal(held.repeatOf, "scope-tradeoff");
  assert.deepEqual([held.priorOccurrences, held.threshold], [1, 2]);
  assert.match(held.reason, /repeat-fingerprint:2>=2/);

  // 高危事实重复也先归 B7（升级去向仍按 highRisk 到客户）。
  const riskyRepeat = decideBlockRoute({ ...fact, highRisk: true });
  assert.equal(riskyRepeat.class, "repeat-rejection");
  assert.equal(riskyRepeat.kind, "escalated");
  assert.equal(riskyRepeat.escalation?.reason, "repeat");
  assert.equal(riskyRepeat.escalation?.kind, "customer-decision");
  assert.equal(riskyRepeat.highRisk, true);
  assert.deepEqual(riskyRepeat.repeat, { count: 2, threshold: 2, baseClass: "high-risk" });

  // 引擎可修 ⇒ engine-repair；否则 executor-replace。
  const engineRepeat = decideBlockRoute({ ...fact, engineCanRepair: true });
  assert.equal(engineRepeat.escalation?.kind, "engine-repair");
  const roleRepeat = decideBlockRoute({ protocol: "fixed-v2.1", kind: "task.reported", code: "task-report-blocked", priorOccurrences: 5 });
  assert.equal(roleRepeat.escalation?.kind, "executor-replace");
  assert.equal(roleRepeat.owner.kind, "role");

  // 阈值可配置（≥2；<2 回落默认）；priorOccurrences 缺省 0。
  assert.equal(classifyBlock(fact, { repeatThreshold: 3 }).repeat, false);
  assert.equal(classifyBlock(fact, { repeatThreshold: 3 }).threshold, 3);
  assert.equal(classifyBlock(fact, { repeatThreshold: 1 }).threshold, 2);
  assert.equal(classifyBlock(fact, { repeatThreshold: Number.NaN }).threshold, 2);
  const zero = classifyBlock({ protocol: "fixed-v2.1", kind: "task.reported", code: "task-report-blocked" });
  assert.equal(zero.priorOccurrences, 0);
  assert.equal(zero.repeat, false);
});

test("事实信号优先级：highRisk > detail > code > 信号（B1 类优先级最高）> kind > 兜底 B8", () => {
  // 无 code：多信号按类优先级取最小（B1 先于 B6/B8/B2/B5）。
  const multi = classifyBlock({
    protocol: "fixed-v2.1",
    kind: "service-rejection",
    stateConflict: true,
    modelMisuse: true,
    externalInput: true,
    requiresAuthorization: true,
    requiresCustomer: true,
  });
  assert.equal(multi.class, "missing-resource");
  assert.equal(multi.reason, "fact-signals");
  assert.equal(classifyBlock({ protocol: "fixed-v2.1", kind: "service-rejection", stateConflict: true }).class, "protocol-reconcile");
  assert.equal(classifyBlock({ protocol: "fixed-v2.1", kind: "service-rejection", modelMisuse: true }).class, "model-anomaly");
  assert.equal(classifyBlock({ protocol: "fixed-v2.1", kind: "service-rejection", requiresAuthorization: true }).class, "missing-capability");
  assert.equal(classifyBlock({ protocol: "fixed-v2.1", kind: "service-rejection", requiresCustomer: true }).class, "environment-infra");
  // kind 兜底：stall/watchdog/driver-observation ⇒ B8；其它未知 ⇒ 兜底 B8。
  for (const kind of ["stall", "watchdog", "driver-observation"] as const) {
    const cls = classifyBlock({ protocol: "fixed-v2.1", kind });
    assert.equal(cls.class, "model-anomaly", `${kind}: B8`);
    assert.equal(cls.reason, `kind:${kind}`);
  }
  const fallback = classifyBlock({ protocol: "fixed-v2.1", kind: "service-rejection" });
  assert.equal(fallback.class, "model-anomaly");
  assert.equal(fallback.reason, "unclassified");
});

// —————————————— 5) 指纹 / blockId / 幂等键 ——————————————

test("指纹/blockId/幂等键：稳定、格式正确、summary 不参与、协议/工作流/阶段/任务/码参与", () => {
  const base: BlockFact = {
    protocol: "fixed-v2.1",
    kind: "dispatch-rejection",
    code: "missing-contract",
    detailCode: "missing-file",
    workflowId: "wf-1",
    stage: "A8",
    taskId: "t-1",
    evidenceHashes: ["b".repeat(64), "a".repeat(64)],
    summary: "缺契约",
  };
  const fingerprint = computeBlockFingerprint(base);
  const blockId = computeBlockId(base);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.match(blockId, /^[a-f0-9]{24}$/);
  assert.equal(computeBlockFingerprint({ ...base }), fingerprint, "同稳定事实同指纹");
  assert.equal(computeBlockId({ ...base }), blockId, "同稳定事实同 blockId");
  assert.equal(computeBlockFingerprint({ ...base, summary: "改写的模型自报（merge-main 高危）" }), fingerprint, "summary 不参与指纹");
  assert.equal(computeBlockId({ ...base, summary: "另一段自报" }), blockId, "summary 不参与 blockId");
  // evidenceHashes 顺序不敏感（派生材料会排序）。
  assert.equal(
    computeBlockFingerprint({ ...base, evidenceHashes: ["a".repeat(64), "b".repeat(64)] }),
    fingerprint,
    "证据 hash 顺序不敏感",
  );
  // 协议/工作流/阶段/任务/码参与 blockId；指纹材料显式给出时原样使用（顺序有意义）。
  for (const patch of [
    { protocol: "app-dispatch/v1" as const },
    { workflowId: "wf-2" },
    { stage: "A9" as const },
    { taskId: "t-2" },
    { code: "basis-drift" },
  ]) {
    assert.notEqual(computeBlockId({ ...base, ...patch }), blockId, `blockId 随 ${JSON.stringify(patch)} 变化`);
  }
  assert.deepEqual(blockFingerprintMaterial(base), [
    "code:missing-contract",
    "kind:dispatch-rejection",
    "detail:missing-file",
    "wf:wf-1",
    "stage:A8",
    "task:t-1",
    `evidence:${"a".repeat(64)}`,
    `evidence:${"b".repeat(64)}`,
  ]);
  const explicit = { ...base, fingerprintMaterial: ["custom", "material"] };
  assert.deepEqual(blockFingerprintMaterial(explicit), ["custom", "material"]);
  assert.equal(computeBlockFingerprint(explicit), computeBlockFingerprint({ ...base, fingerprintMaterial: ["custom", "material"] }));
  assert.notEqual(computeBlockFingerprint({ ...base, fingerprintMaterial: ["custom", "material"] }), computeBlockFingerprint({ ...base, fingerprintMaterial: ["material", "custom"] }), "显式材料顺序有意义");

  // 幂等键与卡 requestId（确定性）。
  const id = computeBlockId(base);
  assert.equal(blockIdempotencyKey(id, "block.raised", 1), `block:${id}:block.raised:1`);
  assert.equal(blockIdempotencyKey(id, "block.routed", 3), `block:${id}:block.routed:3`);
  assert.equal(blockIdempotencyKey(id, "block.routed", 0), `block:${id}:block.routed:1`, "非法 attempt 回落 1");
  assert.equal(blockIdempotencyKey(id, "block.routed", -2), `block:${id}:block.routed:1`);
  assert.equal(blockIdempotencyKey(id, "block.routed", 1.5), `block:${id}:block.routed:1`);
  assert.equal(blockCardRequestId(id), `block-card-${id}`);
  assert.equal(blockCardRequestId(id), blockCardRequestId(id), "卡 requestId 幂等");
});

// —————————————— 6) 卡选项（2–4 / 恰一推荐 / 主权 / judge） ——————————————

test("卡选项装配：每类客户卡 2–4 项、恰一推荐、推荐非终止、主权标记与词表一致", () => {
  for (const cls of BLOCK_CLASSES) {
    const fact: BlockFact = { protocol: "fixed-v2.1", kind: "task.reported", code: "task-report-blocked" };
    const options = blockCardOptionsFor(cls, fact, "customer");
    assert.equal(validateBlockCardOptions(options).length, 0, `${cls}: 选项自检零错误`);
    assert.ok(options.length >= 2 && options.length <= 4, `${cls}: 2–4 项（实际 ${options.length}）`);
    const recommended = options.filter((option) => option.recommended);
    assert.equal(recommended.length, 1, `${cls}: 恰一推荐`);
    assert.notEqual(recommended[0]!.id, BLOCK_TERMINATE_OPTION_ID, `${cls}: 推荐非终止`);
    for (const id of options.map((option) => option.id)) assert.ok((BLOCK_OPTION_IDS as readonly string[]).includes(id), `${cls}: ${id} 在词表内`);
  }
  // 主权项：B3/B4/B6/B7/B9 客户面含 terminate；B4 含 grant-exception。
  const tradeoff = blockCardOptionsFor("scope-tradeoff", { protocol: "fixed-v2.1", kind: "task.reported", code: "b-change-scope-invalid" });
  assert.ok(tradeoff.some((option) => option.id === BLOCK_TERMINATE_OPTION_ID));
  assert.equal(tradeoff.find((option) => option.id === BLOCK_TERMINATE_OPTION_ID)?.sovereign, true);
  const highRisk = blockCardOptionsFor("high-risk", { protocol: "fixed-v2.1", kind: "service-rejection", code: "merge-main" }, "customer");
  assert.deepEqual(highRisk.map((option) => option.id), ["block-merge-main", "block-rework", BLOCK_TERMINATE_OPTION_ID]);
  assert.equal(highRisk.find((option) => option.recommended)?.id, "block-merge-main");
  assert.equal(highRisk.find((option) => option.id === "block-merge-main")?.sovereign, true);
  const stable = blockCardOptionsFor("high-risk", { protocol: "fixed-v2.1", kind: "service-rejection", code: "stable-write" }, "customer");
  assert.equal(stable[0]!.id, "block-stable-write");
});

test("judge 面卡：只含 block-decision 词汇、永无主权项、blockCardAllowsJudge 通过；高危/终止负例", () => {
  for (const cls of BLOCK_CLASSES) {
    const options = blockCardOptionsFor(cls, { protocol: "fixed-v2.1", kind: "task.reported", code: "task-report-blocked", requiresAuthorization: true }, "judge");
    assert.equal(validateBlockCardOptions(options).length, 0, `${cls}: judge 卡自检`);
    assert.equal(options.every((option) => isBlockDecisionOptionId(option.id)), true, `${cls}: judge 卡全为 block-decision`);
    assert.equal(options.some((option) => isBlockSovereignOptionId(option.id)), false, `${cls}: judge 卡无主权项`);
    assert.equal(blockCardAllowsJudge(options), true, `${cls}: judge 允许`);
  }
  // 高危 judge 面：merge-main/grant/terminate 一律缺席。
  const riskyJudge = blockCardOptionsFor("high-risk", { protocol: "fixed-v2.1", kind: "service-rejection", code: "merge-main" }, "judge");
  assert.equal(riskyJudge.some((option) => option.id === "block-merge-main" || option.id === BLOCK_TERMINATE_OPTION_ID), false);
  // blockCardAllowsJudge 负例。
  const sovereign = blockCardOptionsFor("scope-tradeoff", { protocol: "fixed-v2.1", kind: "task.reported", code: "b-change-scope-invalid" }, "customer");
  assert.equal(blockCardAllowsJudge(sovereign), false, "含主权项 ⇒ judge 不允许");
  const twoRecommended = [
    { ...BLOCK_OPTION_SPECS["block-rework"], recommended: true },
    { ...BLOCK_OPTION_SPECS["block-revise-scope"], recommended: true },
  ] satisfies readonly BlockCardOption[];
  assert.equal(blockCardAllowsJudge(twoRecommended), false, "两个推荐 ⇒ judge 不允许");
  const one = [{ ...BLOCK_OPTION_SPECS["block-rework"], recommended: true }] satisfies readonly BlockCardOption[];
  assert.equal(blockCardAllowsJudge(one), false, "少于 2 项 ⇒ judge 不允许");
  // validateBlockCardOptions 负例（精确错误）。
  const bad: BlockCardOption[] = [
    { ...BLOCK_OPTION_SPECS["block-rework"], recommended: false },
    { ...BLOCK_OPTION_SPECS["block-rework"], recommended: false },
  ];
  const errors = validateBlockCardOptions(bad);
  assert.ok(errors.some((message) => message.includes("推荐项 0 个")), errors.join("；"));
  assert.ok(errors.some((message) => message.includes("选项 id 重复")), errors.join("；"));
  const terminateRecommended: BlockCardOption[] = [
    { ...BLOCK_OPTION_SPECS[BLOCK_TERMINATE_OPTION_ID], recommended: true },
    { ...BLOCK_OPTION_SPECS["block-rework"], recommended: false },
  ];
  assert.ok(validateBlockCardOptions(terminateRecommended).some((message) => message.includes("block-terminate-flow 不得作为推荐项")));
  const wrongSovereign: BlockCardOption[] = [
    { ...BLOCK_OPTION_SPECS["block-rework"], sovereign: true, recommended: true },
    { ...BLOCK_OPTION_SPECS["block-revise-scope"], recommended: false },
  ];
  assert.ok(validateBlockCardOptions(wrongSovereign).some((message) => message.includes("主权标记与词表不一致")));
});

test("推荐项策略：类别修复向、模型异常按 attempts 换人、B2 授权面客户推荐授权而 judge 推荐换人", () => {
  const base: BlockFact = { protocol: "fixed-v2.1", kind: "task.reported", code: "task-report-blocked" };
  assert.equal(recommendedBlockOptionIdFor("missing-resource", base), "block-rework");
  assert.equal(recommendedBlockOptionIdFor("scope-tradeoff", base), "block-revise-scope");
  assert.equal(recommendedBlockOptionIdFor("high-risk", { ...base, code: "merge-main" }), "block-merge-main");
  assert.equal(recommendedBlockOptionIdFor("high-risk", { ...base, code: "stable-write" }), "block-stable-write");
  assert.equal(recommendedBlockOptionIdFor("high-risk", base), "block-grant-exception");
  assert.equal(recommendedBlockOptionIdFor("environment-infra", base), "block-rework");
  assert.equal(recommendedBlockOptionIdFor("protocol-reconcile", base), "block-rework");
  assert.equal(recommendedBlockOptionIdFor("repeat-rejection", base), "block-replace-executor");
  assert.equal(recommendedBlockOptionIdFor("model-anomaly", { ...base, attempts: 1 }), "block-rework");
  assert.equal(recommendedBlockOptionIdFor("model-anomaly", { ...base, attempts: 2 }), "block-replace-executor");
  assert.equal(recommendedBlockOptionIdFor("budget-quota", base), "block-revise-scope");
  assert.equal(recommendedBlockOptionIdFor("missing-capability", { ...base, requiresAuthorization: true }, "customer"), "block-grant-exception");
  assert.equal(recommendedBlockOptionIdFor("missing-capability", { ...base, requiresAuthorization: true }, "judge"), "block-replace-executor");
  assert.equal(recommendedBlockOptionIdFor("missing-capability", base), "block-replace-executor");
});

// —————————————— 7) 路由决策逐类语义 ——————————————

test("逐类路由：B1 属主/外部物料、B2 授权/引擎、B3 judge/客户、B4 主权、B5 有界/安全门/上限、B6 引擎/属主/客户、B8 返工、B9 judge", () => {
  // B1：属主按文档种类；外部物料 ⇒ 客户。
  const b1 = decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "close-report-missing", detailCode: "report-evidence-missing" });
  assert.equal(b1.kind, "owner-repair");
  assert.equal(b1.owner.roleId, "verifier");
  assert.equal(b1.repair?.kind, "missing-resource");
  assert.equal(b1.repair?.evidenceRequired, true);
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "missing-contract", ownerRoleId: "convener" }).owner.roleId, "convener");
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "missing-contract", detailCode: "intent-entry-missing" }).owner.roleId, "product");
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "missing-contract", detailCode: "activation-document-invalid" }).owner.roleId, "nominator");
  const b1Customer = decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "missing-contract", externalInput: true });
  assert.equal(b1Customer.kind, "customer-decision");
  assert.equal(b1Customer.requiresCustomer, true);

  // B2：授权 ⇒ 客户主权；引擎可修 ⇒ engine-auto-fix；engineCanRepair=false ⇒ 属主。
  const b2Auth = decideBlockRoute({ protocol: "fixed-v2.1", kind: "shell-denial", code: "shell-judge-deny", requiresAuthorization: true });
  assert.equal(b2Auth.kind, "customer-decision");
  assert.equal(b2Auth.sovereign, true);
  const b2Engine = decideBlockRoute({ protocol: "fixed-v2.1", kind: "dispatch-rejection", code: "professional-role-unavailable" });
  assert.equal(b2Engine.kind, "engine-auto-fix");
  assert.equal(b2Engine.resume, "capability-route");
  const b2Owner = decideBlockRoute({ protocol: "fixed-v2.1", kind: "dispatch-rejection", code: "professional-role-unavailable", engineCanRepair: false });
  assert.equal(b2Owner.kind, "owner-repair");
  assert.equal(b2Owner.repair?.kind, "capability-route");

  // B3：judge 开（且非 judgeEligible=false）⇒ judge；关闭 ⇒ 客户；策略显式关闭优先。
  const b3 = decideBlockRoute({ protocol: "fixed-v2.1", kind: "dispatch-rejection", code: "b-change-scope-invalid", judgeAvailable: true });
  assert.equal(b3.kind, "judge-decision");
  assert.equal(b3.needsJudge, true);
  assert.equal(b3.cardVocabulary, "block-decision");
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "dispatch-rejection", code: "b-change-scope-invalid", judgeAvailable: true, judgeEligible: false }).kind, "customer-decision");
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "dispatch-rejection", code: "b-change-scope-invalid", judgeAvailable: true }, { judgeEnabled: false }).kind, "customer-decision");
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "dispatch-rejection", code: "b-change-scope-invalid", judgeAvailable: false }).kind, "customer-decision");

  // B4：永远客户；sovereign/highRisk/requiresCustomer。
  const b4 = decideBlockRoute({ protocol: "app-dispatch/v1", kind: "service-rejection", code: "high-risk-blocked", highRisk: true, judgeAvailable: true });
  assert.equal(b4.kind, "customer-decision");
  assert.equal(b4.highRisk, true);
  assert.equal(b4.sovereign, true);
  assert.equal(b4.requiresCustomer, true);
  assert.equal(b4.cardVocabulary, "block-sovereign");
  assert.ok(b4.options.some((option) => option.id === BLOCK_TERMINATE_OPTION_ID));

  // B5：有界自动恢复 / 安全门 / 上限 / 客户环境。
  const b5 = decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "network-offline" });
  assert.equal(b5.kind, "engine-auto-fix");
  assert.equal(b5.resume, "bounded-retry");
  const b5Gate = decideBlockRoute({ protocol: "fixed-v2.1", kind: "redispatch", code: "redispatch-safety-gate", autoFixForbidden: true });
  assert.equal(b5Gate.kind, "owner-repair");
  assert.match(b5Gate.reason, /safety-gate/);
  const b5Cap = decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "network-offline", attempts: 2 });
  assert.equal(b5Cap.kind, "owner-repair");
  assert.match(b5Cap.reason, /auto-fix-cap/);
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "network-offline" }, { maxAutoFixAttempts: 0 }).kind, "owner-repair");
  assert.equal(decideBlockRoute({ protocol: "fixed-v2.1", kind: "service-rejection", code: "network-offline", requiresCustomer: true }).kind, "customer-decision");

  // B6：引擎对账 → 属主（有 ownerRoleId）→ 客户。
  const b6 = decideBlockRoute({ protocol: "app-dispatch/v1", kind: "reconcile", code: "reconcile-corrupt", engineCanRepair: true });
  assert.equal(b6.kind, "engine-auto-fix");
  assert.equal(b6.resume, "reconcile");
  const b6Owner = decideBlockRoute({ protocol: "app-dispatch/v1", kind: "reconcile", code: "reconcile-corrupt", engineCanRepair: false, ownerRoleId: "convener" });
  assert.equal(b6Owner.kind, "owner-repair");
  assert.equal(b6Owner.repair?.kind, "reconcile");
  const b6Customer = decideBlockRoute({ protocol: "app-dispatch/v1", kind: "reconcile", code: "reconcile-corrupt", engineCanRepair: false });
  assert.equal(b6Customer.kind, "customer-decision");

  // B8：属主返工，evidenceRequired。
  const b8 = decideBlockRoute({ protocol: "fixed-v2.1", kind: "stage.blocked", code: "task-closed-rejected", ownerRoleId: "product" });
  assert.equal(b8.kind, "owner-repair");
  assert.equal(b8.owner.roleId, "product");
  assert.equal(b8.repair?.kind, "rework");
  assert.equal(b8.repair?.evidenceRequired, true);

  // B9：仅 judgeEligible 业务取舍可代批；否则客户（含终止主权项）。
  const b9Judge = decideBlockRoute({ protocol: "app-dispatch/v1", kind: "service-rejection", code: "retry-budget-exhausted", judgeAvailable: true, judgeEligible: true });
  assert.equal(b9Judge.kind, "judge-decision");
  const b9Customer = decideBlockRoute({ protocol: "app-dispatch/v1", kind: "service-rejection", code: "retry-budget-exhausted", judgeAvailable: true });
  assert.equal(b9Customer.kind, "customer-decision");
  assert.ok(b9Customer.options.some((option) => option.id === BLOCK_TERMINATE_OPTION_ID));
});

// —————————————— 8) 计时默认 / 适配器 ——————————————

test("计时默认（Q10）：T_stall=12min/T_repair=10min/T_remind=30min；覆盖与非法值回落", () => {
  assert.deepEqual(DEFAULT_BLOCK_TIMINGS, { stallMs: 720_000, repairMs: 600_000, remindMs: 1_800_000 });
  assert.equal(DEFAULT_MAX_AUTO_FIX_ATTEMPTS, 2);
  assert.deepEqual(resolveBlockTimings(), DEFAULT_BLOCK_TIMINGS);
  assert.deepEqual(resolveBlockTimings({ stallMs: 60_000, repairMs: 0 }), { stallMs: 60_000, repairMs: 0, remindMs: 1_800_000 });
  assert.deepEqual(resolveBlockTimings({ stallMs: -1 as unknown as number, repairMs: Number.NaN }), DEFAULT_BLOCK_TIMINGS);
  assert.equal(resolveBlockTimings({ stallMs: 1000.9 }).stallMs, 1000);
});

test("适配器：stage.blocked/task.reported/拒绝/reconcile/stall/shell 的字段与类映射", () => {
  const stageBlocked = blockFactFromStageBlocked(
    { workflowId: "wf-1", flowId: "flow-1", stage: "A8", code: "workflow-corrupt", summary: "账本损坏", taskId: "t-9", attempt: 2 },
    {
      protocol: "app-dispatch/v1", judgeAvailable: true, detailCode: "reconcile", ownerRoleId: "convener",
      evidencePaths: ["docs/a.md"], evidenceHashes: ["h".repeat(64)],
    },
  );
  assert.deepEqual(stageBlocked.evidencePaths, ["docs/a.md"], "stage.blocked 适配器转发证据路径（R2 收尾修补）");
  assert.deepEqual(stageBlocked.evidenceHashes, ["h".repeat(64)], "stage.blocked 适配器转发期望 hash");
  assert.equal(stageBlocked.protocol, "app-dispatch/v1");
  assert.equal(stageBlocked.kind, "stage.blocked");
  assert.equal(stageBlocked.code, "workflow-corrupt");
  assert.equal(stageBlocked.detailCode, "reconcile");
  assert.deepEqual([stageBlocked.workflowId, stageBlocked.flowId, stageBlocked.stage, stageBlocked.taskId, stageBlocked.attempts], ["wf-1", "flow-1", "A8", "t-9", 2]);
  assert.equal(stageBlocked.summary, "账本损坏");
  assert.equal(stageBlocked.judgeAvailable, true);
  assert.equal(classifyBlock(stageBlocked).class, "protocol-reconcile");
  assert.equal(blockFactFromStageBlocked({ workflowId: "wf", flowId: "f", stage: "A8", code: "x", summary: "s", attempt: 1 }).protocol, "fixed-v2.1", "协议缺省 fixed-v2.1");

  // task.reported：done 不是 block；blocked/failed 映射稳定码；证据入 evidencePaths。
  assert.equal(blockFactFromTaskReport({ protocol: "fixed-v2.1", report: { taskId: "t", status: "done", summary: "完成" } }), undefined);
  const blocked = blockFactFromTaskReport({
    protocol: "fixed-v2.1",
    report: { taskId: "t", status: "blocked", summary: "缺文件", evidence: ["docs/x.md"] },
    workflowId: "wf", flowId: "flow", stage: "B3", requestId: "req-1",
  });
  assert.ok(blocked !== undefined);
  assert.equal(blocked!.code, "task-report-blocked");
  assert.equal(blocked!.reportStatus, "blocked");
  assert.deepEqual(blocked!.evidencePaths, ["docs/x.md"]);
  assert.equal(blocked!.requestId, "req-1");
  const failed = blockFactFromTaskReport({ protocol: "legacy", report: { taskId: "t", status: "failed", summary: "失败" } });
  assert.equal(failed!.code, "task-report-failed");
  assert.equal(failed!.protocol, "legacy");

  // 派发拒绝 / 服务失败：默认来源与审计 roleId；证据路径/hash 转发（R2 收尾修补）。
  const rejection = blockFactFromDispatchRejection({
    protocol: "fixed-v2.1", code: "missing-contract", message: "缺契约", roleId: "convener", workflowId: "wf",
    evidencePaths: ["docs/contracts/x.md"], evidenceHashes: ["a".repeat(64)],
  });
  assert.equal(rejection.kind, "dispatch-rejection");
  assert.equal(rejection.source, "desktop.dispatch.rejection");
  assert.equal(rejection.summary, "缺契约");
  assert.deepEqual(rejection.audit, { roleId: "convener" });
  assert.deepEqual(rejection.evidencePaths, ["docs/contracts/x.md"]);
  assert.deepEqual(rejection.evidenceHashes, ["a".repeat(64)]);
  const service = blockFactFromServiceFailure({ protocol: "app-dispatch/v1", code: "review-role-unavailable", detailCode: "roster-unreadable", message: "名单不可读", ownerRoleId: "rapporteur" });
  assert.equal(service.kind, "service-rejection");
  assert.equal(service.source, "workflow-service.failure");
  assert.equal(classifyBlock(service).class, "missing-resource");
  assert.equal(decideBlockRoute(service).owner.roleId, "rapporteur", "review 名单不可读 ⇒ 属主 rapporteur（不回落 verifier）");

  // reconcile：corrupt + errors 逐条事实（B6 引擎可修）。
  const reconcile = blockFactFromReconcileReceipt({ workflowId: "wf-bad", protocol: "app-dispatch/v1", stage: "B1", corrupt: "引用不存在任务", errors: ["e1", "e2"] });
  assert.equal(reconcile.length, 3);
  assert.deepEqual(reconcile.map((fact) => fact.code), ["reconcile-corrupt", "reconcile-error", "reconcile-error"]);
  assert.ok(reconcile.every((fact) => fact.kind === "reconcile" && fact.protocol === "app-dispatch/v1" && fact.workflowId === "wf-bad"));
  assert.ok(reconcile.every((fact) => classifyBlock(fact).class === "protocol-reconcile"));
  assert.ok(reconcile.every((fact) => decideBlockRoute(fact).kind === "engine-auto-fix"));
  assert.equal(blockFactFromReconcileReceipt({ workflowId: "wf", protocol: "app-dispatch/v1" }).length, 0);

  // stall tick：排除在飞回合/待答卡/open 修复；时间非法不猜；阈值边界。
  const last = "2026-11-20T00:00:00.000Z";
  const now = "2026-11-20T00:12:00.000Z";
  const stallBase = { protocol: "fixed-v2.1" as const, workflowId: "wf-stall", flowId: "flow-stall", lastProgressAt: last, now };
  assert.equal(blockFactFromStallTick({ ...stallBase, inFlightTurn: true }), undefined);
  assert.equal(blockFactFromStallTick({ ...stallBase, openCard: true }), undefined);
  assert.equal(blockFactFromStallTick({ ...stallBase, openRepairTask: true }), undefined);
  assert.equal(blockFactFromStallTick({ ...stallBase, lastProgressAt: undefined }), undefined);
  assert.equal(blockFactFromStallTick({ ...stallBase, lastProgressAt: "not-a-date" }), undefined);
  assert.equal(blockFactFromStallTick({ ...stallBase, now: "2026-11-19T00:00:00.000Z" }), undefined, "now<last 不猜");
  assert.equal(blockFactFromStallTick({ ...stallBase, now: "2026-11-20T00:11:59.999Z" }), undefined, "<T_stall 不触发");
  const stall = blockFactFromStallTick(stallBase);
  assert.ok(stall !== undefined);
  assert.equal(stall!.code, "flow-stall");
  assert.equal(classifyBlock(stall!).class, "model-anomaly");
  assert.equal(decideBlockRoute(stall!).kind, "owner-repair");
  assert.match(stall!.summary!, /12 分钟内无账本进度/);
  const customStall = blockFactFromStallTick({ ...stallBase, now: "2026-11-20T00:01:00.000Z" }, { timings: { stallMs: 60_000 } });
  assert.ok(customStall !== undefined, "可注入 T_stall");
  assert.equal(blockFactFromStallTick({ ...stallBase, now: "2026-11-20T00:00:59.999Z" }, { timings: { stallMs: 60_000 } }), undefined);

  // shell 拒绝族：码/kind/授权/越界/预算/升级。
  const expectations: Readonly<Record<string, { code: string; kind: string; cls: string; route: string }>> = {
    "c-deny": { code: "shell-c-deny", kind: "shell-denial", cls: "missing-capability", route: "engine-auto-fix" },
    "a-unavailable": { code: "shell-a-unavailable", kind: "shell-denial", cls: "environment-infra", route: "engine-auto-fix" },
    "a-timeout": { code: "shell-a-timeout", kind: "shell-denial", cls: "environment-infra", route: "engine-auto-fix" },
    "judge-deny": { code: "shell-judge-deny", kind: "shell-denial", cls: "missing-capability", route: "customer-decision" },
    "judge-manual": { code: "shell-judge-manual", kind: "shell-denial", cls: "missing-capability", route: "customer-decision" },
    "retry-capped": { code: "retry-capped", kind: "shell-denial", cls: "budget-quota", route: "customer-decision" },
    escalation: { code: "shell-escalation", kind: "shell-escalation", cls: "high-risk", route: "customer-decision" },
  };
  for (const reason of BLOCK_SHELL_DENIAL_REASONS) {
    const expected = expectations[reason]!;
    const fact = blockFactFromShellDenial({ reason, command: "rm -rf build", workflowId: "wf", taskId: "t" });
    assert.equal(fact.code, expected.code, `${reason}: code`);
    assert.equal(fact.kind, expected.kind, `${reason}: kind`);
    assert.equal(classifyBlock(fact).class, expected.cls, `${reason}: class`);
    assert.equal(decideBlockRoute(fact).kind, expected.route, `${reason}: route`);
    assert.deepEqual(fact.fingerprintMaterial, [`shell:${reason}`, "rm -rf build"], `${reason}: 同命令同指纹`);
  }
  assert.equal(classifyBlock(blockFactFromShellDenial({ reason: "c-deny", outOfScope: true })).class, "model-anomaly", "越界 c-deny ⇒ B8");
  assert.equal(decideBlockRoute(blockFactFromShellDenial({ reason: "escalation", outOfScope: true })).kind, "owner-repair", "越界升级 ⇒ 属主返工");
});

test("blockFactForPoint：返回新对象（不共享数组），overrides 生效且不污染矩阵定义", () => {
  const baseline = blockFactForPoint("P20");
  const override = blockFactForPoint("P20", { taskId: "t-override", evidencePaths: ["a.md"], evidenceHashes: ["h"] });
  assert.equal(override.taskId, "t-override");
  assert.deepEqual(override.evidencePaths, ["a.md"]);
  assert.notEqual(override.evidencePaths, baseline.evidencePaths);
  assert.equal(BLOCK_POINTS.P20.fact.taskId, undefined, "矩阵定义不被污染");
  assert.throws(() => blockFactForPoint("P999" as unknown as BlockPointId), /未知 block 点位/);
  assert.equal(isBlockDecisionOptionId(BLOCK_DECISION_OPTION_IDS[0]), true);
  assert.equal(isBlockSovereignOptionId(BLOCK_TERMINATE_OPTION_ID), true);
});

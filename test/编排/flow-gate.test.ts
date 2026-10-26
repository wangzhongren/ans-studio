// test/编排/flow-gate.test.ts
// 2026-10-26 Gate 复核（客户授权 `request_gate_review`；设计
// `2026-10-26_design_proof-gate-reviews.md` §4/§8）的编排/Flow 核心：
//   · `gateKind` 解析/静态校验（只允许 artifact、gate-<slug> id、owner=verifier、evidence.kind=artifact、
//     未知值/未知字段 fail-closed）；旧 flow 解析/序列化/ready/收尾门逐字不变；
//   · `listReadyFlowSteps`：gate 步骤永不进入 ready（`awaiting-gate`），依赖 gate 的下游
//     `dependency-not-done`；
//   · 应用专用 `completeGateStep`：最新 gate 报告 `acceptance-triage/v1` + pass 收口（幂等、
//     artifact.observed、版本不覆盖）；fail 必须有 blocker/major；只有 minor/nit 的 fail 按结构不符
//     退回 Proof（防吹毛求疵、不触发返工）；
//   · `observeFlowArtifacts` 跳过含 gateKind 的步骤（失败报告不得被自动观测成 done 证据）；
//   · 角色 `flow_step_update(done)` 对 gate 步骤拒绝（`gate-review-required`）；
//   · 账本 `gate.review` 审计字段校验（不写/不读成 `customer.decision`）；
//   · gate 报告路径/版本扫描（`docs/acceptance/<flowId>-<gateId>-report-vN.md`，不与最终验收报告冲突）。
// 纯离线：临时目录 + 临时账本；不读 .env、不跑真实模型。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateFlowCompletion,
  isFlowGateKind,
  isFlowGateStepId,
  listReadyFlowSteps,
  parseFlowStateYaml,
  latestAcceptanceDecision,
  FLOW_GATE_KINDS,
  FLOW_GATE_STEP_ID_PATTERN,
} from "../../src/common/编排/flow-state.ts";
import { createFlowService, observeFlowArtifacts } from "../../src/common/编排/flow-service.ts";
import {
  classifyGateReviewTriage,
  completeGateStep,
  gateReviewReportRelPath,
  latestGateReviewReport,
  latestGateReviewReportRelPath,
  type FlowToolViewWithRelease,
} from "../../src/pipeline/orchestration/flow-state.ts";
import { latestAcceptanceCriteriaRelPath } from "../../src/common/编排/governance-gate.ts";
import {
  GATE_REVIEW_DECISION_SCHEMA,
  appendGovernanceLedger,
  flushGovernanceLedger,
  readGovernanceLedger,
  type GateReviewLedgerDecision,
  type GovernanceLedgerEntry,
} from "../../src/common/编排/governance-ledger.ts";
import { parseAcceptanceTriageReport } from "../../src/common/编排/acceptance-triage.ts";

// —————————————————————— 夹具 ——————————————————————

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-flow-gate-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

function writeFile(root: string, rel: string, content: string | Buffer): void {
  const abs = join(root, ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function ledgerEntry(over: Partial<GovernanceLedgerEntry> & Pick<GovernanceLedgerEntry, "kind">): GovernanceLedgerEntry {
  return {
    at: "2026-10-26T00:00:00.000Z",
    actorRoleId: "app",
    power: "app",
    ...over,
  };
}

function writeLedger(root: string, entries: GovernanceLedgerEntry[]): void {
  writeFile(root, ".ans/governance/ledger.jsonl", entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

const FLOW_ID = "flow-a";
const GATE_ID = "gate-vertical-slice";
const FLOW_REL = `docs/flows/${FLOW_ID}.yaml`;

const GATE_REPORT_V1 = `docs/acceptance/${FLOW_ID}-${GATE_ID}-report-v1.md`;

/** 一份含合法 gate 步骤的 flow；`gateStatus`/`gateEvidenceRef` 用于构造收口场景。 */
function gateFlowYaml(over: {
  gateStatus?: string;
  gateEvidenceRef?: string;
  includeDownstream?: boolean;
} = {}): string {
  const gateStatus = over.gateStatus ?? "pending";
  const gateEvidenceRef = over.gateEvidenceRef ?? GATE_REPORT_V1;
  return [
    `flowId: ${FLOW_ID}`,
    "version: 1",
    "qualityTier: production",
    "status: in-progress",
    "steps:",
    "  - id: contract-freeze",
    "    title: 冻结契约",
    "    owner: convener",
    "    kind: artifact",
    "    status: done",
    "    evidence: { kind: artifact, ref: docs/contracts/flow-a-v1.md }",
    "  - id: delivery-core",
    "    title: 首个切片交付",
    "    owner: core",
    "    kind: dispatch",
    "    status: done",
    "    evidence: { kind: dispatch, ref: delivery-core }",
    `  - id: ${GATE_ID}`,
    "    title: 垂直切片门｜Proof 独立复核",
    "    owner: verifier",
    "    kind: artifact",
    `    status: ${gateStatus}`,
    "    gateKind: vertical-slice",
    "    evidence:",
    "      kind: artifact",
    `      ref: ${gateEvidenceRef}`,
    "    dependsOn: [contract-freeze, delivery-core]",
    ...(over.includeDownstream === false
      ? []
      : [
          "  - id: delivery-sim",
          "    title: 模拟核心交付",
          "    owner: sim",
          "    kind: dispatch",
          "    status: pending",
          `    dependsOn: [${GATE_ID}]`,
        ]),
    "  - id: verification",
    "    title: 客户验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

/** 无 gate 的旧 flow（用于零变化回归）。 */
const OLD_FLOW_YAML = [
  `flowId: ${FLOW_ID}`,
  "version: 1",
  "qualityTier: production",
  "steps:",
  "  - id: contract-freeze",
  "    title: 冻结契约",
  "    owner: convener",
  "    kind: artifact",
  "    status: done",
  "    evidence: { kind: artifact, ref: docs/contracts/flow-a-v1.md }",
  "  - id: delivery-core",
  "    title: 交付",
  "    owner: core",
  "    kind: dispatch",
  "    status: pending",
  "  - id: verification",
  "    title: 客户验收",
  "    owner: verifier",
  "    kind: acceptance",
  "    status: pending",
  "",
].join("\n");

function assertParseOk(text: string) {
  const parsed = parseFlowStateYaml(text, FLOW_ID);
  if (!parsed.ok) assert.fail(parsed.error);
  return parsed.flow;
}

function parseErrors(text: string): Array<{ path: string; message: string }> {
  const parsed = parseFlowStateYaml(text, FLOW_ID);
  assert.equal(parsed.ok, false, "该 flow 应被拒绝（fail-closed）");
  if (parsed.ok) throw new Error("unreachable");
  return parsed.errors;
}

/** 单 gate 步骤 flow（用于逐条解析负例；`fields` 覆盖 gate 步骤字段）。 */
function oneGateYaml(overrides: {
  id?: string;
  kind?: string;
  owner?: string;
  gateKind?: string;
  evidence?: string | null;
  extra?: string;
} = {}): string {
  const id = overrides.id ?? GATE_ID;
  const kind = overrides.kind ?? "artifact";
  const owner = overrides.owner ?? "verifier";
  const gateKind = overrides.gateKind ?? "vertical-slice";
  const evidence =
    overrides.evidence === null
      ? []
      : [
          "    evidence:",
          ...(overrides.evidence !== undefined
            ? [overrides.evidence]
            : ["      kind: artifact", `      ref: docs/acceptance/${FLOW_ID}-${GATE_ID}-report-v1.md`]),
        ];
  return [
    `flowId: ${FLOW_ID}`,
    "version: 1",
    "qualityTier: production",
    "steps:",
    `  - id: ${id}`,
    "    title: 门",
    `    owner: ${owner}`,
    `    kind: ${kind}`,
    "    status: pending",
    `    gateKind: ${gateKind}`,
    ...evidence,
    ...(overrides.extra !== undefined ? [overrides.extra] : []),
    "  - id: verification",
    "    title: 客户验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

function gateReport(conclusion: "pass" | "fail" | "conditional", items: string[]): string {
  return [
    "# Gate 复核报告 v1",
    "",
    `${FLOW_ID}｜${GATE_ID}｜vertical-slice`,
    "",
    "```yaml",
    "schema: acceptance-triage/v1",
    `conclusion: ${conclusion}`,
    ...(items.length === 0 ? ["items: []"] : ["items:", ...items]),
    "```",
    "",
    "以上。",
    "",
  ].join("\n");
}

const MINOR_ITEM = [
  "  - id: N1",
  "    severity: minor",
  "    owner: docs-writer",
  "    reason: README 措辞可更清楚（非阻断）",
  "    action: 统一术语",
];
const NIT_ITEM = [
  "  - id: N2",
  "    severity: nit",
  "    owner: docs-writer",
  "    reason: 段落顺序建议",
  "    action: 调整段落",
];
const BLOCKER_ITEM = [
  "  - id: B1",
  "    severity: blocker",
  "    owner: core",
  "    reason: 真实运行失败：首关无法进入",
  "    action: 修复入口后重新自测并保留日志",
  "    targets: [src/core.ts]",
];
const MAJOR_ITEM = [
  "  - id: M1",
  "    severity: major",
  "    owner: core",
  "    reason: 关键路径未覆盖",
  "    action: 补真实运行证据",
];

// —————————————————————— gateKind 解析/静态校验 ——————————————————————

test("gateKind：三类 gate 合法解析；flow_get 视图/序列化原样保留；旧 flow 字段缺席", async () => {
  assert.deepEqual([...FLOW_GATE_KINDS], ["vertical-slice", "visual-baseline", "integration-performance"]);
  assert.equal(isFlowGateKind("vertical-slice"), true);
  assert.equal(isFlowGateKind("proof-only"), false);
  assert.equal(isFlowGateStepId("gate-visual-level-01"), true);
  assert.equal(isFlowGateStepId("visual-level-01"), false);
  assert.equal(FLOW_GATE_STEP_ID_PATTERN, "^gate-[a-z0-9]+(?:-[a-z0-9]+)*$");

  const visualFlow = [
    `flowId: ${FLOW_ID}`,
    "version: 2",
    "qualityTier: production",
    "steps:",
    "  - id: contract-freeze",
    "    title: 冻结契约",
    "    owner: convener",
    "    kind: artifact",
    "    status: pending",
    `  - id: ${GATE_ID}`,
    "    title: 垂直切片门",
    "    owner: verifier",
    "    kind: artifact",
    "    status: pending",
    "    gateKind: vertical-slice",
    `    evidence: { kind: artifact, ref: ${GATE_REPORT_V1} }`,
    "  - id: gate-visual-level-01",
    "    title: 视觉基线门",
    "    owner: verifier",
    "    kind: artifact",
    "    status: pending",
    "    gateKind: visual-baseline",
    `    evidence: { kind: artifact, ref: docs/acceptance/${FLOW_ID}-gate-visual-level-01-report-v1.md }`,
    `    dependsOn: [${GATE_ID}]`,
    "  - id: verification",
    "    title: 客户验收",
    "    owner: verifier",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");

  const flow = assertParseOk(visualFlow);
  assert.equal(flow.steps[1]!.gateKind, "vertical-slice");
  assert.equal(flow.steps[2]!.gateKind, "visual-baseline");

  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, visualFlow);
    const service = createFlowService({ projectRoot: root, actorRoleId: "convener", actorPower: "schedule" });
    const got = await service.get({ flowId: FLOW_ID });
    assert.equal(got.ok, true);
    const view = got.flow as FlowToolViewWithRelease;
    assert.equal(view.steps[1]!.gateKind, "vertical-slice", "flow_get 视图原样携带 gateKind");
    assert.equal(view.steps[2]!.gateKind, "visual-baseline");

    const update = await service.update({
      flowId: FLOW_ID,
      stepId: "contract-freeze",
      status: "dispatched",
      expectedRevision: got.revision!,
    });
    assert.equal(update.ok, true, update.error ?? "");
    const text = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    assert.match(text, /gateKind: vertical-slice/);
    assert.match(text, /gateKind: visual-baseline/);
    assertParseOk(text);
  });

  // 旧 flow：解析结果不含 gateKind 自身字段；视图/序列化不引入该字段。
  await withRoot(async (root) => {
    const old = assertParseOk(OLD_FLOW_YAML);
    for (const step of old.steps) {
      assert.equal(Object.prototype.hasOwnProperty.call(step, "gateKind"), false, `旧步骤 ${step.id} 不得出现 gateKind`);
    }
    assert.equal(JSON.stringify(old).includes("gateKind"), false);

    writeFile(root, FLOW_REL, OLD_FLOW_YAML);
    const service = createFlowService({ projectRoot: root, actorRoleId: "convener", actorPower: "schedule" });
    const got = await service.get({ flowId: FLOW_ID });
    assert.equal(got.ok, true);
    const view = got.flow as FlowToolViewWithRelease;
    for (const step of view.steps) {
      assert.equal(Object.prototype.hasOwnProperty.call(step, "gateKind"), false);
    }
    const update = await service.update({
      flowId: FLOW_ID,
      stepId: "delivery-core",
      status: "dispatched",
      expectedRevision: got.revision!,
    });
    assert.equal(update.ok, true, update.error ?? "");
    const text = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");
    assert.equal(text.includes("gateKind"), false, "旧 flow 序列化逐字不变（不引入 gateKind）");
  });
});

test("gateKind：非 artifact / 未知值 / id 形状 / owner / evidence / 未知字段全部 fail-closed", () => {
  // 合法基线（确认负例夹具本身可解析）。
  assertParseOk(oneGateYaml());

  const cases: Array<{ name: string; yaml: string; path: string; message: RegExp }> = [
    {
      name: "非 artifact 步骤不得携带 gateKind",
      yaml: oneGateYaml({ kind: "dispatch" }),
      path: "steps[0].gateKind",
      message: /只允许出现在 kind: artifact/,
    },
    {
      name: "gateKind 只允许 artifact（customer-decision）",
      yaml: oneGateYaml({ kind: "customer-decision" }),
      path: "steps[0].gateKind",
      message: /只允许出现在 kind: artifact/,
    },
    {
      name: "未知 gateKind 值",
      yaml: oneGateYaml({ gateKind: "proof-only" }),
      path: "steps[0].gateKind",
      message: /gateKind 必须是 vertical-slice \| visual-baseline \| integration-performance/,
    },
    {
      name: "非字符串 gateKind",
      yaml: oneGateYaml({ gateKind: "42" }),
      path: "steps[0].gateKind",
      message: /gateKind 必须是/,
    },
    {
      name: "gate 步骤 id 必须匹配 gate-<slug>",
      yaml: oneGateYaml({ id: "visual-level-01" }),
      path: "steps[0].id",
      message: /必须匹配 \^gate-\[a-z0-9\]\+/,
    },
    {
      name: "owner 必须是 verifier",
      yaml: oneGateYaml({ owner: "Steward" }),
      path: "steps[0].owner",
      message: /owner 必须是 verifier/,
    },
    {
      name: "evidence 必须存在",
      yaml: oneGateYaml({ evidence: null }),
      path: "steps[0].evidence",
      message: /必须提供 evidence\{kind: "artifact"/,
    },
    {
      name: "evidence.kind 必须是 artifact",
      yaml: oneGateYaml({ evidence: "      kind: dispatch", extra: "      ref: gate-vertical-slice" }),
      path: "steps[0].evidence.kind",
      message: /artifact/,
    },
    {
      name: "未知字段仍拒绝（gate-review）",
      yaml: oneGateYaml({ extra: "    gate-review: true" }),
      path: "steps[0].gate-review",
      message: /未知字段 gate-review/,
    },
  ];

  for (const item of cases) {
    const errors = parseErrors(item.yaml);
    const hit = errors.find((error) => error.path === item.path && item.message.test(error.message));
    assert.ok(hit, `${item.name}：期望 ${item.path} 命中 ${item.message}，实际 ${JSON.stringify(errors)}`);
  }
});

test("listReadyFlowSteps：gate 步骤永不 ready（awaiting-gate）；依赖 gate 的下游 dependency-not-done", () => {
  const flow = assertParseOk(gateFlowYaml());
  const ready = listReadyFlowSteps(flow);
  assert.equal(ready.ready.some((step) => step.id === GATE_ID), false, "gate 步骤不得进入 ready");
  assert.deepEqual(
    ready.skipped.find((step) => step.id === GATE_ID),
    { id: GATE_ID, reason: "awaiting-gate" },
  );
  assert.deepEqual(
    ready.skipped.find((step) => step.id === "delivery-sim"),
    { id: "delivery-sim", reason: "dependency-not-done" },
  );

  const old = assertParseOk(OLD_FLOW_YAML);
  const oldReady = listReadyFlowSteps(old);
  assert.deepEqual(oldReady.ready.map((step) => step.id), ["delivery-core"], "旧 flow ready 行为不变");
  assert.equal(oldReady.skipped.some((step) => step.reason === "awaiting-gate"), false);

  // 收尾门：gate 未 done ⇒ 流程不可进入最终验收。
  const completion = evaluateFlowCompletion(flow, { entries: [], errors: [] });
  assert.equal(completion.ready, false);
  assert.ok(completion.issues.some((issue) => issue.includes(GATE_ID) && issue.includes("尚未完成")));
});

// —————————————————————— completeGateStep ——————————————————————

test("completeGateStep：pass（可带 minor/nit）⇒ done + artifact.observed + 幂等；非 gate 步骤拒绝", async () => {
  await withRoot(async (root) => {
    // 追加一个 id 形如 gate-* 但**不含 gateKind** 的普通 artifact，用于 kind-unsupported 负例。
    const yaml = gateFlowYaml().replace(
      "  - id: verification",
      "  - id: gate-plain\n    title: 非 gate 步骤\n    owner: verifier\n    kind: artifact\n    status: pending\n  - id: verification",
    );
    writeFile(root, FLOW_REL, yaml);
    const report = gateReport("pass", [...MINOR_ITEM, ...NIT_ITEM]);
    writeFile(root, GATE_REPORT_V1, report);

    const first = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(first.verdict, "pass");
    assert.equal(first.reportPath, GATE_REPORT_V1);
    assert.equal(first.reportVersion, 1);
    assert.equal(first.reportSha256, sha256(report), "返回报告 sha256 供应用侧写 gate.review 审计");
    assert.equal(first.gateKind, "vertical-slice");
    assert.deepEqual(first.evidence, { kind: "artifact", ref: GATE_REPORT_V1 });
    assert.deepEqual(first.severityCounts, { blocker: 0, major: 0, minor: 1, nit: 1 });

    const written = assertParseOk(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"));
    const gateStep = written.steps.find((step) => step.id === GATE_ID)!;
    assert.equal(gateStep.status, "done");
    assert.equal(gateStep.gateKind, "vertical-slice", "gateKind 原样保留");
    assert.deepEqual(gateStep.evidence, { kind: "artifact", ref: GATE_REPORT_V1 });

    const ledger = await readGovernanceLedger(root);
    assert.deepEqual(ledger.errors, []);
    const observed = ledger.entries.filter((entry) => entry.kind === "artifact.observed");
    assert.equal(observed.length, 1, "pass 收口补一条 artifact.observed");
    assert.equal(observed[0]!.artifactPath, GATE_REPORT_V1);
    assert.equal(observed[0]!.artifactSha256, sha256(report));
    assert.equal(observed[0]!.actorRoleId, "app");
    assert.equal(observed[0]!.power, "app");
    assert.equal(observed[0]!.flowId, FLOW_ID);
    assert.equal(ledger.entries.filter((entry) => entry.kind === "customer.decision").length, 0, "不写客户决定");
    assert.equal(ledger.entries.filter((entry) => entry.kind === "gate.review").length, 0, "completeGateStep 不写 gate.review（应用侧处置写）");

    const second = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(second.ok, true);
    assert.equal(second.idempotent, true);
    assert.equal(second.alreadyDone, true);
    assert.equal(second.revision, first.revision, "幂等命中不写盘、revision 不变");
    const ledgerAfter = await readGovernanceLedger(root);
    assert.equal(ledgerAfter.entries.length, ledger.entries.length, "幂等不重复追加账本");

    const missing = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: "gate-not-there" });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "gate-step-missing");

    const notGate = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: "gate-plain" });
    assert.equal(notGate.ok, false);
    assert.equal(notGate.code, "gate-step-kind-unsupported");

    const badId = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: "visual-level-01" });
    assert.equal(badId.ok, false);
    assert.equal(badId.code, "invalid-gate-id");
  });
});

test("completeGateStep：扫描最新版本（v1 fail / v2 pass）且不覆盖旧报告；普通 gate 报告 v2 生效", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, gateFlowYaml());
    const v1 = gateReport("fail", BLOCKER_ITEM);
    const v2 = gateReport("pass", []);
    writeFile(root, GATE_REPORT_V1, v1);
    const v2Path = gateReviewReportRelPath(FLOW_ID, GATE_ID, 2);
    writeFile(root, v2Path, v2);

    assert.deepEqual(latestGateReviewReport(root, FLOW_ID, GATE_ID), { relPath: v2Path, version: 2 });
    assert.equal(latestGateReviewReportRelPath(root, FLOW_ID, GATE_ID), v2Path);

    const result = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(result.reportPath, v2Path);
    assert.equal(result.reportVersion, 2);
    const written = assertParseOk(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"));
    assert.deepEqual(written.steps.find((step) => step.id === GATE_ID)!.evidence, { kind: "artifact", ref: v2Path });
    assert.equal(readFileSync(join(root, ...GATE_REPORT_V1.split("/")), "utf8"), v1, "旧报告不被覆盖");
    assert.equal(readFileSync(join(root, ...v2Path.split("/")), "utf8"), v2);
  });
});

test("completeGateStep：fail 必须有 blocker/major；只有 minor/nit 的 fail 按结构不符退回 Proof（不返工、不标 done）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, gateFlowYaml());

    // 1) 含 blocker ⇒ fail：不标 done、不观察、无客户决定。
    writeFile(root, GATE_REPORT_V1, gateReport("fail", BLOCKER_ITEM));
    const failed = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(failed.ok, false);
    assert.equal(failed.code, "gate-report-failed");
    assert.deepEqual(failed.severityCounts, { blocker: 1, major: 0, minor: 0, nit: 0 });
    assert.match(failed.error ?? "", /等待返工后重新请求 gate 复核/);
    let flow = assertParseOk(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"));
    assert.equal(flow.steps.find((step) => step.id === GATE_ID)!.status, "pending", "fail 不改变 gate 状态");
    let ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.length, 0, "fail 不补 artifact.observed");

    // 2) conditional + major ⇒ fail。
    writeFile(root, GATE_REPORT_V1, gateReport("conditional", MAJOR_ITEM));
    const conditional = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(conditional.code, "gate-report-failed");

    // 3) 只有 minor/nit 的 fail ⇒ 结构不符退回 Proof；不是返工依据。
    writeFile(root, GATE_REPORT_V1, gateReport("fail", [...MINOR_ITEM, ...NIT_ITEM]));
    const nonblocking = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(nonblocking.ok, false);
    assert.equal(nonblocking.code, "gate-report-nonblocking-fail");
    assert.deepEqual(nonblocking.severityCounts, { blocker: 0, major: 0, minor: 1, nit: 1 });
    assert.match(nonblocking.error ?? "", /只有 minor\/nit 不构成返工依据/);
    flow = assertParseOk(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"));
    assert.equal(flow.steps.find((step) => step.id === GATE_ID)!.status, "pending");
    ledger = await readGovernanceLedger(root);
    assert.equal(ledger.entries.length, 0, "nonblocking-fail 不观察、不返工");

    // 4) 报告缺失 ⇒ gate-report-missing（不猜）。
    rmSync(join(root, ...GATE_REPORT_V1.split("/")));
    const missing = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(missing.code, "gate-report-missing");

    // 5) 缺 acceptance-triage/v1 / pass 带 blocker（矛盾）⇒ gate-report-invalid（退回 Proof）。
    writeFile(root, GATE_REPORT_V1, "# 只有人话结论：看起来不错\n");
    const invalid = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(invalid.code, "gate-report-invalid");
    writeFile(root, GATE_REPORT_V1, gateReport("pass", BLOCKER_ITEM));
    const contradictory = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
    assert.equal(contradictory.code, "gate-report-invalid");
  });
});

test("completeGateStep：终态 gate 不覆盖（failed/blocked/aborted/superseded）", async () => {
  await withRoot(async (root) => {
    for (const status of ["failed", "blocked", "aborted"]) {
      writeFile(root, FLOW_REL, gateFlowYaml({ gateStatus: status }));
      writeFile(root, GATE_REPORT_V1, gateReport("pass", []));
      const result = await completeGateStep({ projectRoot: root, flowId: FLOW_ID, gateId: GATE_ID });
      assert.equal(result.ok, false, status);
      assert.equal(result.code, "gate-step-terminal", status);
    }
  });
});

test("classifyGateReviewTriage：pass 可带 minor/nit；fail/conditional 只有 minor/nit ⇒ return-to-proof", () => {
  const parse = (conclusion: "pass" | "fail" | "conditional", items: string[]) => {
    const parsed = parseAcceptanceTriageReportSafe(gateReport(conclusion, items));
    return parsed;
  };
  const pass = parse("pass", [...MINOR_ITEM, ...NIT_ITEM]);
  assert.deepEqual(classifyGateReviewTriage(pass), {
    outcome: "pass",
    conclusion: "pass",
    severityCounts: { blocker: 0, major: 0, minor: 1, nit: 1 },
    items: pass.items,
  });
  const fail = parse("fail", [...MAJOR_ITEM, ...MINOR_ITEM]);
  assert.equal(classifyGateReviewTriage(fail).outcome, "fail");
  const nitOnly = parse("conditional", [...NIT_ITEM]);
  const verdict = classifyGateReviewTriage(nitOnly);
  assert.equal(verdict.outcome, "return-to-proof");
  assert.equal(verdict.outcome === "return-to-proof" ? verdict.reason : "", "nonblocking-fail");
});

/** 测试内薄封装：把已校验的报告解析为 section（失败即测试失败）。 */
function parseAcceptanceTriageReportSafe(markdown: string) {
  const parsed = parseAcceptanceTriageReport(markdown);
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.errors));
  if (!parsed.ok) throw new Error("unreachable");
  return parsed.triage;
}

// —————————————————————— observeFlowArtifacts / flow_step_update ——————————————————————

test("observeFlowArtifacts：跳过含 gateKind 的步骤（失败报告不得被自动观测成 done 证据）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, gateFlowYaml());
    writeFile(root, "docs/contracts/flow-a-v1.md", "# 契约\n");
    writeFile(root, GATE_REPORT_V1, gateReport("fail", BLOCKER_ITEM));

    const result = await observeFlowArtifacts({ projectRoot: root, flowId: FLOW_ID });
    assert.equal(result.ok, true, result.error ?? "");
    assert.ok(result.observed.includes("docs/contracts/flow-a-v1.md"), "普通 artifact 仍被观察");
    assert.equal(result.observed.includes(GATE_REPORT_V1), false, "gate 报告不得被自动观测");

    const ledger = await readGovernanceLedger(root);
    const paths = ledger.entries.filter((entry) => entry.kind === "artifact.observed").map((entry) => entry.artifactPath);
    assert.deepEqual(paths, ["docs/contracts/flow-a-v1.md"]);
  });
});

test("flow_step_update(done)：gate 步骤一律 gate-review-required（manager/owner 均不能代标）", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, gateFlowYaml());
    writeFile(root, GATE_REPORT_V1, gateReport("pass", []));
    const before = readFileSync(join(root, ...FLOW_REL.split("/")), "utf8");

    const steward = createFlowService({ projectRoot: root, actorRoleId: "convener", actorPower: "schedule" });
    const got = await steward.get({ flowId: FLOW_ID });
    const managerAttempt = await steward.update({
      flowId: FLOW_ID,
      stepId: GATE_ID,
      status: "done",
      evidence: { kind: "artifact", ref: GATE_REPORT_V1 },
      expectedRevision: got.revision!,
    });
    assert.equal(managerAttempt.ok, false);
    assert.equal(managerAttempt.code, "gate-review-required");

    const verifier = createFlowService({ projectRoot: root, actorRoleId: "verifier", actorPower: "verification" });
    const ownerAttempt = await verifier.update({
      flowId: FLOW_ID,
      stepId: GATE_ID,
      status: "done",
      evidence: { kind: "artifact", ref: GATE_REPORT_V1 },
      expectedRevision: got.revision!,
    });
    assert.equal(ownerAttempt.ok, false, "gate 步骤 owner 也不能自标 done");
    assert.equal(ownerAttempt.code, "gate-review-required");

    assert.equal(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"), before, "拒绝时 flow 不变");
  });
});

test("flow_step_supersede：新 gate id 继承旧 gateKind（设计 §4.5 gate 定义变化路径）；非 gate id 不继承", async () => {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, gateFlowYaml());
    const steward = createFlowService({ projectRoot: root, actorRoleId: "convener", actorPower: "schedule" });
    const got = await steward.get({ flowId: FLOW_ID });
    const superseded = await steward.supersede({
      flowId: FLOW_ID,
      oldStepId: GATE_ID,
      newStepId: "gate-vertical-slice-v2",
      title: "垂直切片门 v2",
      owner: "verifier",
      kind: "artifact",
      expectedRevision: got.revision!,
    });
    assert.equal(superseded.ok, true, superseded.error ?? "");
    const flow = assertParseOk(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"));
    assert.equal(flow.steps.find((step) => step.id === GATE_ID)!.status, "superseded");
    assert.equal(flow.steps.find((step) => step.id === GATE_ID)!.supersededBy, "gate-vertical-slice-v2");
    assert.equal(
      flow.steps.find((step) => step.id === "gate-vertical-slice-v2")!.gateKind,
      "vertical-slice",
      "新 gate 继承旧 gateKind（工具载荷不含 gateKind）",
    );

    // 非 gate 形态的新 id ⇒ 普通 artifact 取代，不继承 gateKind。
    const got2 = await steward.get({ flowId: FLOW_ID });
    const plain = await steward.supersede({
      flowId: FLOW_ID,
      oldStepId: "gate-vertical-slice-v2",
      newStepId: "delivery-gate-retry",
      title: "普通产物",
      owner: "convener",
      kind: "artifact",
      expectedRevision: got2.revision!,
    });
    assert.equal(plain.ok, true, plain.error ?? "");
    const flow2 = assertParseOk(readFileSync(join(root, ...FLOW_REL.split("/")), "utf8"));
    assert.equal(
      Object.prototype.hasOwnProperty.call(flow2.steps.find((step) => step.id === "delivery-gate-retry"), "gateKind"),
      false,
      "非 gate-<slug> 新 id 不继承 gateKind",
    );
  });
});

// —————————————————————— 账本 gate.review ——————————————————————

function gateReviewDecision(over: Partial<GateReviewLedgerDecision> = {}): GateReviewLedgerDecision {
  return {
    schema: GATE_REVIEW_DECISION_SCHEMA,
    gateId: GATE_ID,
    gateKind: "vertical-slice",
    reportPath: GATE_REPORT_V1,
    reportVersion: 1,
    reportSha256: sha256("report"),
    conclusion: "pass",
    severityCounts: { blocker: 0, major: 0, minor: 1, nit: 0 },
    itemCount: 1,
    requestId: "gate-1",
    flowRevision: "rev-1",
    decidedAt: "2026-10-26T00:00:00.000Z",
    ...over,
  };
}

test("gate.review 账本：形状校验；fail 必须有 blocker/major；不写 customer.decision、不进入 latestAcceptanceDecision", async () => {
  await withRoot(async (root) => {
    const valid = ledgerEntry({
      kind: "gate.review",
      flowId: FLOW_ID,
      actorRoleId: "app",
      power: "app",
      messageSummary: "Gate 复核：gate-vertical-slice 通过（vertical-slice；报告 v1）",
      gateReview: gateReviewDecision(),
    });
    assert.deepEqual(await appendGovernanceLedger(root, valid), { ok: true });

    const read = await readGovernanceLedger(root);
    assert.deepEqual(read.errors, []);
    assert.equal(read.entries.length, 1);
    assert.deepEqual(read.entries[0], valid);
    assert.deepEqual(latestAcceptanceDecision(FLOW_ID, read.entries), { kind: "none" }, "gate.review 不是验收决定");

    // 收尾门不把 gate.review 当客户决定/未结算决定：执行步骤与证据齐备、验收 pending ⇒ ready。
    const completionFlow = assertParseOk(
      OLD_FLOW_YAML.replace(
        "  - id: delivery-core\n    title: 交付\n    owner: core\n    kind: dispatch\n    status: pending",
        "  - id: delivery-core\n    title: 交付\n    owner: core\n    kind: dispatch\n    status: done\n    evidence: { kind: dispatch, ref: delivery-core }",
      ),
    );
    const completion = evaluateFlowCompletion(completionFlow, {
      entries: [
        ledgerEntry({
          kind: "artifact.observed",
          flowId: FLOW_ID,
          artifactPath: "docs/contracts/flow-a-v1.md",
          artifactSha256: sha256("contract"),
        }),
        ledgerEntry({ kind: "dispatch.accepted", flowId: FLOW_ID, stepId: "delivery-core", targetRoleId: "core" }),
        valid,
      ],
      errors: [],
    });
    assert.deepEqual(completion, { ready: true }, "gate.review 不阻塞也不伪造最终验收决定");

    // fail 审计合法（含 blocker/major）。
    const failAudit = ledgerEntry({
      kind: "gate.review",
      flowId: FLOW_ID,
      gateReview: gateReviewDecision({
        conclusion: "fail",
        severityCounts: { blocker: 0, major: 1, minor: 2, nit: 0 },
        itemCount: 3,
      }),
    });
    assert.deepEqual(await appendGovernanceLedger(root, failAudit), { ok: true });

    // 只有 minor/nit 的 fail：账本也拒绝（防吹毛求疵一致性）。
    const nitOnlyFail = await appendGovernanceLedger(
      root,
      ledgerEntry({
        kind: "gate.review",
        flowId: FLOW_ID,
        gateReview: gateReviewDecision({ conclusion: "fail", severityCounts: { blocker: 0, major: 0, minor: 2, nit: 1 } }),
      }),
    );
    assert.equal(nitOnlyFail.ok, false);
    assert.match(nitOnlyFail.ok ? "" : nitOnlyFail.message, /至少有一个 blocker\/major/);

    // pass 带 blocker/major 同样矛盾，账本拒绝。
    const passWithBlocker = await appendGovernanceLedger(
      root,
      ledgerEntry({
        kind: "gate.review",
        flowId: FLOW_ID,
        gateReview: gateReviewDecision({ conclusion: "pass", severityCounts: { blocker: 1, major: 0, minor: 0, nit: 0 } }),
      }),
    );
    assert.equal(passWithBlocker.ok, false);
    assert.match(passWithBlocker.ok ? "" : passWithBlocker.message, /pass 不得包含 blocker\/major/);

    // 不写客户决定：携带 decisionKind/customerDecision 一律拒绝。
    const withCustomerDecision = await appendGovernanceLedger(
      root,
      ledgerEntry({
        kind: "gate.review",
        flowId: FLOW_ID,
        decisionKind: "acceptance",
        customerDecision: "accepted",
        gateReview: gateReviewDecision(),
      }),
    );
    assert.equal(withCustomerDecision.ok, false);
    assert.match(withCustomerDecision.ok ? "" : withCustomerDecision.message, /不是客户决定/);

    // 未知 gateKind / 非 app 记录 / 字段错位均拒绝。
    const unknownKind = await appendGovernanceLedger(
      root,
      ledgerEntry({
        kind: "gate.review",
        flowId: FLOW_ID,
        gateReview: gateReviewDecision({ gateKind: "proof-only" as never }),
      }),
    );
    assert.equal(unknownKind.ok, false);

    const byRole = await appendGovernanceLedger(
      root,
      ledgerEntry({ kind: "gate.review", flowId: FLOW_ID, actorRoleId: "convener", power: "schedule", gateReview: gateReviewDecision() }),
    );
    assert.equal(byRole.ok, false);
    assert.match(byRole.ok ? "" : byRole.message, /只能由应用记录/);

    const misplaced = await appendGovernanceLedger(
      root,
      ledgerEntry({ kind: "artifact.observed", artifactPath: "docs/x.md", gateReview: gateReviewDecision() }),
    );
    assert.equal(misplaced.ok, false);
    assert.match(misplaced.ok ? "" : misplaced.message, /仅允许出现在 kind=gate.review/);

    // 坏行在读取时也被识别（形状校验同源）。
    writeFile(
      root,
      ".ans/governance/ledger.jsonl",
      JSON.stringify(ledgerEntry({ kind: "artifact.observed", artifactPath: "docs/x.md", gateReview: gateReviewDecision() })) + "\n",
    );
    const badLine = await readGovernanceLedger(root);
    assert.equal(badLine.entries.length, 0);
    assert.equal(badLine.errors.length, 1);
    assert.match(badLine.errors[0]!, /gateReview 仅允许/);

    await flushGovernanceLedger(root);
  });
});

// —————————————————————— 报告路径/版本 ——————————————————————

test("gate 报告路径/版本：docs/acceptance/<flowId>-<gateId>-report-vN.md；与最终验收报告命名不冲突", async () => {
  assert.equal(
    gateReviewReportRelPath(FLOW_ID, GATE_ID, 2),
    `docs/acceptance/${FLOW_ID}-${GATE_ID}-report-v2.md`,
  );

  await withRoot(async (root) => {
    writeFile(root, `docs/acceptance/${FLOW_ID}-report-v9.md`, "# 最终验收报告\n");
    writeFile(root, `docs/acceptance/${FLOW_ID}-criteria-v2.md`, "# 验收标准\n");
    writeFile(root, gateReviewReportRelPath(FLOW_ID, GATE_ID, 1), gateReport("fail", BLOCKER_ITEM));
    writeFile(root, gateReviewReportRelPath(FLOW_ID, GATE_ID, 3), gateReport("pass", []));
    writeFile(root, `docs/acceptance/${FLOW_ID}-${GATE_ID}-report-vx.md`, "bad version");
    writeFile(root, `docs/acceptance/${FLOW_ID}-${GATE_ID}-report-v2.txt`, "bad extension");
    writeFile(root, `docs/acceptance/${FLOW_ID}-gate-visual-level-01-report-v1.md`, gateReport("pass", []));

    assert.deepEqual(latestGateReviewReport(root, FLOW_ID, GATE_ID), {
      relPath: gateReviewReportRelPath(FLOW_ID, GATE_ID, 3),
      version: 3,
    });
    assert.equal(
      latestGateReviewReportRelPath(root, FLOW_ID, GATE_ID),
      gateReviewReportRelPath(FLOW_ID, GATE_ID, 3),
      "只认精确 <flowId>-<gateId>-report-vN.md，忽略最终验收报告/坏版本/坏扩展名",
    );
    assert.equal(latestAcceptanceCriteriaRelPath(root, FLOW_ID), `docs/acceptance/${FLOW_ID}-criteria-v2.md`);
    assert.equal(latestGateReviewReport(root, FLOW_ID, "gate-visual-level-01")?.version, 1);
    assert.equal(latestGateReviewReport(root, FLOW_ID, "gate-not-there"), undefined);
  });
});

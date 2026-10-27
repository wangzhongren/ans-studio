// test/编排/acceptance-triage-record.test.ts
// 2026-10-25 验收分诊记录（设计 §9.1 / §9.3 / §10）：
//   · `.ans/governance/acceptance/<flowId>/triage-v1.json` 原子写读往返、幂等键、状态流转；
//   · 坏件按无记录处理（不猜）、写失败不破坏原文件；
//   · 账本 `acceptance.triage` 记录形态（最小扩展）：合法追加、坏形状拒写、不被当作客户决定。
// 全部临时目录，用完清理。

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ACCEPTANCE_TRIAGE_RECORD_SCHEMA,
  acceptanceTriageIdForReport,
  acceptanceTriageIdempotencyKey,
  acceptanceTriageItemsDigest,
  acceptanceTriageRecordAbsPath,
  acceptanceTriageRecordMatchesReport,
  acceptanceTriageRecordRelPath,
  acceptanceTriageSeverityCounts,
  buildAcceptanceTriageRecord,
  isAcceptanceTriageStatusTransitionAllowed,
  readAcceptanceTriageRecord,
  validateAcceptanceTriageRecord,
  writeAcceptanceTriageRecord,
  type AcceptanceTriageRecord,
  type AcceptanceTriageRecordStatus,
} from "../../src/common/编排/acceptance-triage-record.ts";
import {
  ACCEPTANCE_TRIAGE_SCHEMA,
  recommendAcceptanceTriage,
  type AcceptanceTriageItem,
  type AcceptanceTriageSection,
} from "../../src/common/编排/acceptance-triage.ts";
import {
  ACCEPTANCE_TRIAGE_DECISION_SCHEMA,
  appendGovernanceLedger,
  flushGovernanceLedger,
  governanceLedgerPath,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../src/common/编排/governance-ledger.ts";
import { latestAcceptanceDecision } from "../../src/common/编排/flow-state.ts";

function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-triage-"));
  return fn(root).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

const FLOW_ID = "triage-flow";
const REPORT_SHA = "a".repeat(64);
const NEXT_SHA = "b".repeat(64);
const AT = "2026-10-25T00:00:00.000Z";
const DECIDED_AT = "2026-10-25T01:00:00.000Z";

const ITEMS: AcceptanceTriageItem[] = [
  {
    id: "F1",
    severity: "blocker",
    owner: "platform-foundation",
    reason: "npm ci 失败",
    action: "修复依赖锁定",
    targets: ["package-lock.json"],
    criteria: "docs/acceptance/x-criteria-v1.md#C3",
    evidence: ["docs/verification/x.log"],
  },
  {
    id: "F2",
    severity: "nit",
    owner: "docs-writer",
    reason: "措辞",
    action: "统一术语",
    targets: [],
    criteria: null,
    evidence: [],
  },
];

function triageOf(items: AcceptanceTriageItem[] = ITEMS): AcceptanceTriageSection {
  return {
    schema: ACCEPTANCE_TRIAGE_SCHEMA,
    conclusion: "fail",
    coordinator: "convener",
    coordinatorDeclaration: null,
    items,
  };
}

function recordOf(overrides: Partial<Parameters<typeof buildAcceptanceTriageRecord>[0]> = {}): AcceptanceTriageRecord {
  const triage = overrides.triage ?? triageOf();
  return buildAcceptanceTriageRecord({
    flowId: FLOW_ID,
    reportPath: `docs/acceptance/${FLOW_ID}-report-v1.md`,
    reportVersion: 1,
    reportSha256: REPORT_SHA,
    triage,
    recommendation: recommendAcceptanceTriage(triage, { checkExecutability: () => true }),
    status: "awaiting-decision",
    at: AT,
    ...overrides,
  });
}

function decidedRecord(
  status: "dispatched" | "report-only",
  overrides: Partial<Parameters<typeof buildAcceptanceTriageRecord>[0]> = {},
): AcceptanceTriageRecord {
  return recordOf({
    status,
    disposition: status === "dispatched" ? "rework" : "report-only",
    source: "judge",
    sourceDetail: "judge-rule",
    decidedAt: DECIDED_AT,
    ...overrides,
  });
}

// —————————————————————— 读 / 写 / 幂等 ——————————————————————

test("triage 记录：路径固定 `.ans/governance/acceptance/<flowId>/triage-v1.json`；原子写读往返", async () => {
  await withRoot(async (root) => {
    assert.equal(acceptanceTriageRecordRelPath(FLOW_ID), `.ans/governance/acceptance/${FLOW_ID}/triage-v1.json`);
    assert.equal(
      acceptanceTriageRecordAbsPath(root, FLOW_ID),
      join(root, ".ans", "governance", "acceptance", FLOW_ID, "triage-v1.json"),
    );

    const record = recordOf();
    const written = await writeAcceptanceTriageRecord(root, record);
    assert.equal(written.ok, true, written.ok ? "" : written.error);
    if (!written.ok) return;
    assert.equal(written.path, acceptanceTriageRecordRelPath(FLOW_ID));
    assert.equal(written.record.schema, ACCEPTANCE_TRIAGE_RECORD_SCHEMA);

    const abs = acceptanceTriageRecordAbsPath(root, FLOW_ID);
    assert.equal(existsSync(abs), true);
    const text = readFileSync(abs, "utf8");
    assert.ok(text.endsWith("\n"));
    assert.equal(JSON.parse(text).schema, ACCEPTANCE_TRIAGE_RECORD_SCHEMA);

    const read = await readAcceptanceTriageRecord(root, FLOW_ID);
    assert.equal(read.corrupt, undefined);
    assert.deepEqual(read.record, record);
  });
});

test("triage 记录：缺失 ⇒ 无记录（正常初始态）；projectRoot/flowId 非法 ⇒ corrupt 且不猜", async () => {
  await withRoot(async (root) => {
    assert.deepEqual(await readAcceptanceTriageRecord(root, FLOW_ID), {});
    assert.deepEqual(await readAcceptanceTriageRecord("", FLOW_ID), { corrupt: "projectRoot 缺失，无法读取分诊记录" });
    const badFlow = await readAcceptanceTriageRecord(root, "../escape");
    assert.match(badFlow.corrupt!, /flowId 非法/);
    assert.equal(badFlow.record, undefined);
  });
});

test("triage 记录：坏 JSON / 未知 schema / flowId 不匹配 / 状态非法 ⇒ corrupt（按无记录处理）", async () => {
  await withRoot(async (root) => {
    const abs = acceptanceTriageRecordAbsPath(root, FLOW_ID);
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(root, ".ans", "governance", "acceptance", FLOW_ID), { recursive: true });

    await writeFile(abs, "{ not json", "utf8");
    assert.match((await readAcceptanceTriageRecord(root, FLOW_ID)).corrupt!, /不是合法 JSON/);
    assert.equal((await readAcceptanceTriageRecord(root, FLOW_ID)).record, undefined);

    const wrongSchema = { ...recordOf(), schema: "acceptance-triage-record/v2" };
    await writeFile(abs, JSON.stringify(wrongSchema), "utf8");
    assert.match((await readAcceptanceTriageRecord(root, FLOW_ID)).corrupt!, /schema/);

    const wrongFlow = { ...recordOf(), flowId: "other-flow" };
    await writeFile(abs, JSON.stringify(wrongFlow), "utf8");
    assert.match((await readAcceptanceTriageRecord(root, FLOW_ID)).corrupt!, /flowId 不匹配/);

    const badStatus = { ...recordOf(), status: "decided" };
    await writeFile(abs, JSON.stringify(badStatus), "utf8");
    assert.match((await readAcceptanceTriageRecord(root, FLOW_ID)).corrupt!, /status/);
  });
});

test("triage 记录：幂等键 = flowId + reportSha256；triageId 稳定（triage-<flowId>-<sha 前 8 位>）", () => {
  assert.equal(acceptanceTriageIdempotencyKey("a", "b"), "a\u0000b");
  assert.equal(acceptanceTriageIdempotencyKey("a\u0000b", "c"), "a\u0000b\u0000c");
  assert.equal(acceptanceTriageIdempotencyKey(FLOW_ID, null), `${FLOW_ID}\u0000no-report`);
  assert.equal(acceptanceTriageIdForReport(FLOW_ID, null), `triage-${FLOW_ID}-noreport`);
  assert.notEqual(acceptanceTriageIdempotencyKey(FLOW_ID, REPORT_SHA), acceptanceTriageIdempotencyKey(FLOW_ID, NEXT_SHA));

  const record = recordOf();
  assert.equal(record.triageId, `triage-${FLOW_ID}-${REPORT_SHA.slice(0, 8)}`);
  assert.equal(record.triageId, acceptanceTriageIdForReport(FLOW_ID, REPORT_SHA));
  assert.equal(record.triageCardId, record.triageId);
  assert.equal(acceptanceTriageRecordMatchesReport(record, FLOW_ID, REPORT_SHA), true);
  assert.equal(acceptanceTriageRecordMatchesReport(record, FLOW_ID, NEXT_SHA), false);
  assert.equal(acceptanceTriageRecordMatchesReport(record, "other-flow", REPORT_SHA), false);
});

test("triage 记录：构建器填充 severityCounts/itemCount/itemsDigest；摘要与字段顺序无关的规范化输入", () => {
  const record = recordOf();
  assert.deepEqual(record.severityCounts, { blocker: 1, major: 0, minor: 0, nit: 1 });
  assert.equal(record.itemCount, 2);
  assert.equal(record.itemsDigest, acceptanceTriageItemsDigest(ITEMS));
  assert.deepEqual(acceptanceTriageSeverityCounts(ITEMS), record.severityCounts);
  assert.equal(record.recommendation, "rework");
  assert.equal(record.recommendationBasis, "blocker-major-feasible");
  assert.equal(record.status, "awaiting-decision");
  assert.equal(record.disposition, null);
  assert.equal(record.source, null);
  assert.equal(record.override, false);
  assert.equal(record.previousReportSha256, null);
  assert.equal(record.at, AT);
});

test("triage 记录：同一报告状态幂等更新（awaiting-decision → dispatched），只保留一份记录", async () => {
  await withRoot(async (root) => {
    const initial = recordOf();
    assert.equal((await writeAcceptanceTriageRecord(root, initial)).ok, true);

    const decided = decidedRecord("dispatched", { reportSha256: REPORT_SHA });
    const written = await writeAcceptanceTriageRecord(root, decided);
    assert.equal(written.ok, true, written.ok ? "" : written.error);

    const read = await readAcceptanceTriageRecord(root, FLOW_ID);
    assert.equal(read.record!.status, "dispatched");
    assert.equal(read.record!.disposition, "rework");
    assert.equal(read.record!.source, "judge");
    assert.equal(read.record!.sourceDetail, "judge-rule");
    assert.equal(read.record!.decidedAt, DECIDED_AT);
    assert.equal(read.record!.triageId, initial.triageId);

    // 同状态重复写 = 幂等。
    assert.equal((await writeAcceptanceTriageRecord(root, decided)).ok, true);
  });
});

test("triage 记录：非法状态流转拒写（report-only 终态不回退；dispatched 不能变 report-only）", async () => {
  await withRoot(async (root) => {
    const reportOnly = decidedRecord("report-only");
    assert.equal((await writeAcceptanceTriageRecord(root, reportOnly)).ok, true);

    const backToDispatched = await writeAcceptanceTriageRecord(root, decidedRecord("dispatched"));
    assert.equal(backToDispatched.ok, false);
    if (!backToDispatched.ok) assert.match(backToDispatched.error, /状态流转非法/);
    assert.equal((await readAcceptanceTriageRecord(root, FLOW_ID)).record!.status, "report-only");

    // 新流程：dispatched → report-only 也拒绝。
    const otherFlow = "other-flow";
    assert.equal((await writeAcceptanceTriageRecord(root, decidedRecord("dispatched", { flowId: otherFlow }))).ok, true);
    const mismatch = await writeAcceptanceTriageRecord(root, decidedRecord("report-only", { flowId: otherFlow }));
    assert.equal(mismatch.ok, false);
    assert.match((mismatch as { ok: false; error: string }).error, /dispatched → report-only/);
  });
});

test("triage 记录：failed 可重试到 dispatched；同报告不允许跳过状态回退", async () => {
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("awaiting-decision", "dispatched"), true);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("awaiting-decision", "report-only"), true);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("awaiting-decision", "returned-to-verifier"), true);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("awaiting-decision", "failed"), true);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("failed", "dispatched"), true);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("failed", "awaiting-decision"), true);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("dispatched", "failed"), true);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("dispatched", "report-only"), false);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("report-only", "dispatched"), false);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("report-only", "failed"), false);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("returned-to-verifier", "awaiting-decision"), false);
  assert.equal(isAcceptanceTriageStatusTransitionAllowed("dispatched", "dispatched"), true);

  await withRoot(async (root) => {
    const failed = await writeAcceptanceTriageRecord(root, recordOf({ status: "failed", error: "路由发送失败" }));
    assert.equal(failed.ok, true, failed.ok ? "" : failed.error);
    const retried = await writeAcceptanceTriageRecord(root, decidedRecord("dispatched"));
    assert.equal(retried.ok, true, retried.ok ? "" : retried.error);
  });
});

test("triage 记录：新报告 sha 覆盖写新记录并保留 previousReportSha256（不继承旧结论）", async () => {
  await withRoot(async (root) => {
    assert.equal((await writeAcceptanceTriageRecord(root, decidedRecord("report-only"))).ok, true);

    const nextTriage = triageOf([{ ...ITEMS[0]!, id: "F1" }]);
    const next = recordOf({
      reportVersion: 2,
      reportPath: `docs/acceptance/${FLOW_ID}-report-v2.md`,
      reportSha256: NEXT_SHA,
      triage: nextTriage,
      status: "awaiting-decision",
      at: "2026-10-25T02:00:00.000Z",
    });
    const written = await writeAcceptanceTriageRecord(root, next);
    assert.equal(written.ok, true, written.ok ? "" : written.error);
    if (!written.ok) return;
    assert.equal(written.record.previousReportSha256, REPORT_SHA);

    const read = await readAcceptanceTriageRecord(root, FLOW_ID);
    assert.equal(read.record!.reportSha256, NEXT_SHA);
    assert.equal(read.record!.status, "awaiting-decision");
    assert.equal(read.record!.disposition, null);
    assert.equal(read.record!.previousReportSha256, REPORT_SHA);
  });
});

test("triage 记录：既有记录损坏 ⇒ 按无记录处理，直接写新记录（不猜旧内容）", async () => {
  await withRoot(async (root) => {
    const abs = acceptanceTriageRecordAbsPath(root, FLOW_ID);
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(root, ".ans", "governance", "acceptance", FLOW_ID), { recursive: true });
    await writeFile(abs, "not json", "utf8");

    const written = await writeAcceptanceTriageRecord(root, recordOf());
    assert.equal(written.ok, true, written.ok ? "" : written.error);
    const read = await readAcceptanceTriageRecord(root, FLOW_ID);
    assert.equal(read.record!.reportSha256, REPORT_SHA);
    assert.equal(read.record!.previousReportSha256, null);
  });
});

test("triage 记录：写失败注入 ⇒ ok:false 且原文件完好；非法记录不落盘", async () => {
  await withRoot(async (root) => {
    const good = recordOf();
    assert.equal((await writeAcceptanceTriageRecord(root, good)).ok, true);
    const before = readFileSync(acceptanceTriageRecordAbsPath(root, FLOW_ID), "utf8");

    const failed = await writeAcceptanceTriageRecord(
      root,
      recordOf({ status: "failed", error: "写盘失败测试" }),
      {
        writeFile: async () => {
          throw new Error("EACCES: injected");
        },
      },
    );
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.match(failed.error, /写盘失败/);
    assert.equal(readFileSync(acceptanceTriageRecordAbsPath(root, FLOW_ID), "utf8"), before);

    const invalid = await writeAcceptanceTriageRecord(root, { ...good, reportSha256: "short" });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.match(invalid.error, /形状非法/);
    assert.equal(readFileSync(acceptanceTriageRecordAbsPath(root, FLOW_ID), "utf8"), before);

    const badRoot = await writeAcceptanceTriageRecord("", good);
    assert.equal(badRoot.ok, false);
  });
});

test("triage 记录：校验器拒绝状态/处置/来源不一致与字段越界", async () => {
  const base = recordOf();
  const cases: Array<[string, unknown]> = [
    ["not object", 42],
    ["wrong schema", { ...base, schema: "x" }],
    ["bad flowId", { ...base, flowId: "../escape" }],
    ["bad sha", { ...base, reportSha256: "abc" }],
    ["bad version", { ...base, reportVersion: 0 }],
    ["bad digest", { ...base, itemsDigest: "xyz" }],
    ["count mismatch", { ...base, itemCount: 3 }],
    ["bad conclusion", { ...base, conclusion: "ok" }],
    ["bad recommendation", { ...base, recommendation: "approve" }],
    ["bad basis", { ...base, recommendationBasis: "whatever" }],
    ["bad status", { ...base, status: "decided" }],
    ["bad disposition", { ...base, disposition: "maybe" }],
    ["bad source", { ...base, source: "judge-rule" }],
    ["override not bool", { ...base, override: "yes" }],
    ["missing triageId", { ...base, triageId: "" }],
    ["bad previous sha", { ...base, previousReportSha256: "xyz" }],
    ["bad at", { ...base, at: "not-a-date" }],
    ["awaiting with disposition", { ...base, disposition: "rework" }],
    ["awaiting with source", { ...base, source: "customer" }],
    ["dispatched without disposition", { ...base, status: "dispatched", source: "judge", decidedAt: DECIDED_AT }],
    ["dispatched without source", { ...base, status: "dispatched", disposition: "rework", decidedAt: DECIDED_AT }],
    ["dispatched without decidedAt", { ...base, status: "dispatched", disposition: "rework", source: "judge" }],
    ["report-only with rework", { ...base, status: "report-only", disposition: "rework", source: "judge", decidedAt: DECIDED_AT }],
  ];
  for (const [name, value] of cases) {
    const validation = validateAcceptanceTriageRecord(value);
    assert.equal(validation.ok, false, `${name} 应校验失败`);
    if (!validation.ok) assert.ok(validation.errors.length > 0);
  }

  const ok = validateAcceptanceTriageRecord(base, FLOW_ID);
  assert.equal(ok.ok, true);
  const flowMismatch = validateAcceptanceTriageRecord(base, "other-flow");
  assert.equal(flowMismatch.ok, false);
  if (!flowMismatch.ok) assert.match(flowMismatch.errors.join("；"), /flowId 不匹配/);

  const failedWithDisposition = validateAcceptanceTriageRecord({
    ...base,
    status: "failed",
    disposition: "rework",
    source: "customer",
    decidedAt: DECIDED_AT,
  });
  assert.equal(failedWithDisposition.ok, true, "failed 允许记录已尝试的决定");
});

test("triage 记录：状态枚举覆盖任务口径五态", () => {
  const statuses: AcceptanceTriageRecordStatus[] = [
    "returned-to-verifier",
    "awaiting-decision",
    "dispatched",
    "report-only",
    "failed",
  ];
  for (const status of statuses) {
    const record =
      status === "returned-to-verifier"
        ? buildAcceptanceTriageRecord({
            flowId: FLOW_ID,
            reportPath: `docs/acceptance/${FLOW_ID}-report-v1.md`,
            reportVersion: 1,
            reportSha256: null,
            parseFailure: "missing",
            status,
            at: AT,
          })
        : recordOf({
            status,
            ...(status === "dispatched"
              ? { disposition: "rework" as const, source: "customer" as const, decidedAt: DECIDED_AT }
              : status === "report-only"
                ? { disposition: "report-only" as const, source: "customer" as const, decidedAt: DECIDED_AT }
                : {}),
          });
    assert.equal(validateAcceptanceTriageRecord(record).ok, true, `status=${status} 应合法`);
  }
});

test("triage 记录：结构失败（缺失/坏段）如实记录 parseFailure，不猜结论与计数", async () => {
  const missing = buildAcceptanceTriageRecord({
    flowId: FLOW_ID,
    reportPath: `docs/acceptance/${FLOW_ID}-report-v1.md`,
    reportVersion: 1,
    reportSha256: null,
    parseFailure: "missing",
    status: "returned-to-verifier",
    error: "报告缺失/不可读",
    at: AT,
  });
  assert.equal(missing.parseFailure, "missing");
  assert.equal(missing.reportSha256, null);
  assert.equal(missing.conclusion, null);
  assert.equal(missing.recommendation, null);
  assert.equal(missing.recommendationBasis, null);
  assert.equal(missing.severityCounts, null);
  assert.equal(missing.itemsDigest, null);
  assert.equal(missing.itemCount, 0);
  assert.equal(missing.triageId, `triage-${FLOW_ID}-noreport`);
  assert.equal(validateAcceptanceTriageRecord(missing).ok, true);

  const invalid = buildAcceptanceTriageRecord({
    flowId: FLOW_ID,
    reportPath: `docs/acceptance/${FLOW_ID}-report-v1.md`,
    reportVersion: 1,
    reportSha256: REPORT_SHA,
    parseFailure: "invalid",
    status: "returned-to-verifier",
    error: "items[0].owner 空",
    at: AT,
  });
  assert.equal(validateAcceptanceTriageRecord(invalid).ok, true);

  await withRoot(async (root) => {
    const written = await writeAcceptanceTriageRecord(root, missing);
    assert.equal(written.ok, true, written.ok ? "" : written.error);
    if (!written.ok) return;
    assert.equal(written.record.status, "returned-to-verifier");
    const read = await readAcceptanceTriageRecord(root, FLOW_ID);
    assert.equal(read.corrupt, undefined);
    assert.deepEqual(read.record, missing);
  });

  const cases: Array<[string, unknown]> = [
    ["missing with sha", { ...missing, reportSha256: REPORT_SHA }],
    ["invalid without sha", { ...invalid, reportSha256: null }],
    ["parseFailure with conclusion", { ...missing, conclusion: "fail" }],
    ["parseFailure with counts", { ...missing, itemCount: 1 }],
    ["success without triage fields", { ...invalid, parseFailure: null }],
    ["returned with rework recommendation", { ...invalid, parseFailure: null, recommendation: "rework" }],
    ["awaiting with no-triage", { ...recordOf(), status: "awaiting-decision", recommendation: "no-triage" }],
  ];
  for (const [name, value] of cases) {
    assert.equal(validateAcceptanceTriageRecord(value).ok, false, `${name} 应校验失败`);
  }
});

// —————————————————————— 账本 `acceptance.triage` ——————————————————————

function triageLedgerEntry(overrides: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    at: "2026-10-25T01:00:00.000Z",
    kind: "acceptance.triage",
    flowId: FLOW_ID,
    actorRoleId: "app",
    power: "app",
    messageSummary: "验收分诊：下发运营修改（blocker 1 / major 0；来源 judge）",
    acceptanceTriage: {
      schema: ACCEPTANCE_TRIAGE_DECISION_SCHEMA,
      triageId: `triage-${FLOW_ID}-${REPORT_SHA.slice(0, 8)}`,
      disposition: "rework",
      source: "judge",
      sourceDetail: "judge-rule",
      reportPath: `docs/acceptance/${FLOW_ID}-report-v1.md`,
      reportSha256: REPORT_SHA,
      conclusion: "fail",
      decidedAt: DECIDED_AT,
      recommendation: "rework",
      recommendationBasis: "blocker-major-feasible",
      override: false,
      requestId: null,
    },
    ...overrides,
  };
}

test("账本 acceptance.triage：合法追加并原样读回（不是 customer.decision）", async () => {
  await withRoot(async (root) => {
    const entry = triageLedgerEntry();
    const appended = await appendGovernanceLedger(root, entry);
    assert.deepEqual(appended, { ok: true });
    await flushGovernanceLedger(root);

    const read = await readGovernanceLedger(root);
    assert.deepEqual(read.errors, []);
    assert.equal(read.entries.length, 1);
    assert.deepEqual(read.entries[0], entry);
    assert.equal(read.entries[0]!.kind, "acceptance.triage");
    assert.equal(read.entries[0]!.customerDecision, undefined);

    // `latestAcceptanceDecision` 只读 customer.decision；acceptance.triage 不参与收口。
    assert.deepEqual(latestAcceptanceDecision(FLOW_ID, read), { kind: "none" });

    const withAccepted: GovernanceLedgerEntry = {
      at: "2026-10-25T00:00:00.000Z",
      kind: "customer.decision",
      flowId: FLOW_ID,
      actorRoleId: "verifier",
      power: "acceptance",
      decisionKind: "acceptance",
      customerDecision: "accepted",
    };
    assert.equal((await appendGovernanceLedger(root, withAccepted)).ok, true);
    await flushGovernanceLedger(root);
    const read2 = await readGovernanceLedger(root);
    const latest = latestAcceptanceDecision(FLOW_ID, read2);
    assert.equal(latest.kind, "accepted", "最新的客户接受仍由 customer.decision 决定");
  });
});

test("账本 acceptance.triage：坏形状拒写（缺 acceptanceTriage / 枚举非法 / 携带客户决定字段）", async () => {
  await withRoot(async (root) => {
    const base = triageLedgerEntry();
    const invalidEntries: Array<[string, GovernanceLedgerEntry]> = [
      ["missing acceptanceTriage", { ...base, acceptanceTriage: undefined }],
      [
        "bad disposition",
        {
          ...base,
          acceptanceTriage: { ...base.acceptanceTriage!, disposition: "maybe" as never },
        },
      ],
      [
        "bad source",
        {
          ...base,
          acceptanceTriage: { ...base.acceptanceTriage!, source: "judge-rule" as never },
        },
      ],
      [
        "bad conclusion",
        {
          ...base,
          acceptanceTriage: { ...base.acceptanceTriage!, conclusion: "ok" as never },
        },
      ],
      [
        "bad sha",
        {
          ...base,
          acceptanceTriage: { ...base.acceptanceTriage!, reportSha256: "short" },
        },
      ],
      [
        "bad decidedAt",
        {
          ...base,
          acceptanceTriage: { ...base.acceptanceTriage!, decidedAt: "not-a-date" },
        },
      ],
      ["carries customerDecision", { ...base, customerDecision: "accepted" }],
      ["carries decisionKind", { ...base, decisionKind: "acceptance" }],
      ["missing flowId", { ...base, flowId: undefined }],
    ];
    for (const [name, entry] of invalidEntries) {
      const result = await appendGovernanceLedger(root, entry);
      assert.equal(result.ok, false, `${name} 应被拒绝`);
    }
    assert.equal(existsSync(governanceLedgerPath(root)), false, "拒写不得创建账本文件");

    // acceptanceTriage 只允许出现在 kind=acceptance.triage。
    const misplaced: GovernanceLedgerEntry = {
      ...triageLedgerEntry(),
      kind: "artifact.observed",
    };
    assert.equal((await appendGovernanceLedger(root, misplaced)).ok, false);

    // 顶层 customer.decision 条目仍可正常写。
    const normal: GovernanceLedgerEntry = {
      at: "2026-10-25T00:00:00.000Z",
      kind: "customer.decision",
      flowId: FLOW_ID,
      actorRoleId: "verifier",
      power: "acceptance",
      decisionKind: "acceptance",
      customerDecision: "rejected",
    };
    assert.equal((await appendGovernanceLedger(root, normal)).ok, true);
  });
});

test("账本 acceptance.triage：坏行读取跳过并记 errors；合法分诊条目仍读出", async () => {
  await withRoot(async (root) => {
    assert.equal((await appendGovernanceLedger(root, triageLedgerEntry())).ok, true);
    await flushGovernanceLedger(root);

    const abs = governanceLedgerPath(root);
    const { appendFile } = await import("node:fs/promises");
    await appendFile(abs, `${JSON.stringify({ kind: "acceptance.triage", flowId: FLOW_ID })}\n`, "utf8");

    const read = await readGovernanceLedger(root);
    assert.equal(read.entries.length, 1);
    assert.equal(read.errors.length, 1);
    assert.match(read.errors[0]!, /acceptanceTriage|缺少/);
  });
});

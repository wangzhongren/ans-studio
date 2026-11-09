// 运行时核心 C1 契约测试：`version-change/v1`、`doc-freeze/v1`、`stable-write/v1`、
// `refactor-request/v1` 与对应账本事件 + `acknowledgments`（2026-11-04 trunk-amendment-model C1 冻结）。
// 基线：P1.6 §4.4/§4.5/§4.5.1/§4.8/§5 + PM 复审 F1/F5/F13/F14 + P1 r2 §3.2/§3.3/§5.1。
// 编译期断言由 `npm run typecheck` 覆盖（tsconfig include 含 test/）；运行时断言用 node --test。
import test from "node:test";
import assert from "node:assert/strict";
import {
  AMENDMENT_ID_PATTERN,
  DETAIL_AMENDMENT_TARGET_KINDS,
  DOC_FREEZE_APPLICATION_REASONS,
  DOC_FREEZE_BASELINE_EVENT_KINDS,
  DOC_FREEZE_CUSTOMER_REASONS,
  DOC_FREEZE_ERROR_CODES,
  DOC_FREEZE_JUDGE_DELEGATED_REASONS,
  DOC_FREEZE_LOOKUP_STATES,
  DOC_FREEZE_REASONS,
  DOC_FREEZE_SCHEMA,
  DOC_MIGRATION_MARKS,
  isJudgeDelegatedSource,
  REFACTOR_ERROR_CODES,
  REFACTOR_FORBIDDEN_KINDS,
  REFACTOR_MANAGED_BY,
  REFACTOR_REQUESTED_BY,
  REFACTOR_REQUEST_ID_PATTERN,
  REFACTOR_REQUEST_SCHEMA,
  REFACTOR_REQUEST_STATUSES,
  STABLE_WRITE_ERROR_CODES,
  STABLE_WRITE_PERMIT_STATUSES,
  STABLE_WRITE_PERMIT_TTL_MS,
  STABLE_WRITE_REQUEST_ID_PATTERN,
  STABLE_WRITE_SCHEMA,
  STABLE_WRITE_STATUSES,
  VCA_FORBIDDEN_TARGET_KINDS,
  VERSION_CHANGE_APPLICATION_STATUSES,
  VERSION_CHANGE_CUSTOMER_STATUSES,
  VERSION_CHANGE_ERROR_CODES,
  VERSION_CHANGE_ID_PATTERN,
  VERSION_CHANGE_INITIATOR_BY_KIND,
  VERSION_CHANGE_SCHEMA,
  VERSION_CHANGE_STATUSES,
  VERSION_CHANGE_TARGET_ACTIONS,
  VERSION_UPGRADE_TARGET_KINDS,
  type DocFreezeLookup,
  type DocFreezeLookupState,
  type DocFreezeOrigin,
  type DocFreezeReason,
  type DocFreezeRecord,
  type DocFreezeSource,
  type JudgeDelegatedSource,
  type RefactorErrorCode,
  type RefactorRequestRecord,
  type StableFileKind,
  type StableWriteDecisionInput,
  type StableWritePermit,
  type StableWritePermitStatus,
  type StableWriteRecord,
  type StableWriteErrorCode,
  type VersionChangeErrorCode,
  type VersionChangeRecord,
} from "../../src/model/version-change.ts";
import {
  STABLE_WRITE_APPLICATION_EVENT_KINDS,
  STABLE_WRITE_CUSTOMER_EVENT_KINDS,
  STABLE_WRITE_EVENT_KINDS,
  type CustomerInputOutcome,
  type CustomerInputRequest,
  type DocFreezeEvent,
  type RefactorRequestEvent,
  type StableWriteEvent,
  type TaskStateEvent,
  type VersionChangeEvent,
} from "../../src/model/runtime.ts";
import type { DirectActionSource, TrunkStableFileKind } from "../../src/model/trunk.ts";

const AT = "2026-11-04T00:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

test("四类 schema 常量 + ID 正则（C1 冻结）", () => {
  assert.equal(VERSION_CHANGE_SCHEMA, "version-change/v1");
  assert.equal(DOC_FREEZE_SCHEMA, "doc-freeze/v1");
  assert.equal(STABLE_WRITE_SCHEMA, "stable-write/v1");
  assert.equal(REFACTOR_REQUEST_SCHEMA, "refactor-request/v1");

  for (const [pattern, good, bad] of [
    [VERSION_CHANGE_ID_PATTERN, "vc-12", "vc-"],
    [REFACTOR_REQUEST_ID_PATTERN, "rf-3", "rf3"],
    [STABLE_WRITE_REQUEST_ID_PATTERN, "sw-7", "sw-"],
    [AMENDMENT_ID_PATTERN, "am-1", "amendment-1"],
  ] as const) {
    const re = new RegExp(pattern);
    assert.match(good, re);
    assert.doesNotMatch(bad, re);
  }

  assert.equal(STABLE_WRITE_PERMIT_TTL_MS, 30 * 60 * 1000);
});

test("VCA 发起角色唯一映射（AC-3）与目标 kind 收窄（AC-5/AC-19/AC-29/AC-30）", () => {
  assert.deepEqual(VERSION_CHANGE_INITIATOR_BY_KIND, {
    "detail-amendment": "rapporteur",
    "version-upgrade": "product",
  });
  assert.deepEqual([...VERSION_CHANGE_STATUSES], [
    "draft",
    "submitted",
    "approved",
    "rejected",
    "applied",
    "superseded",
  ]);
  assert.deepEqual([...VERSION_UPGRADE_TARGET_KINDS], ["contract", "roster"]);
  assert.deepEqual([...DETAIL_AMENDMENT_TARGET_KINDS], ["contract", "roster", "execution"]);
  assert.deepEqual([...VCA_FORBIDDEN_TARGET_KINDS], ["workflow", "boundary", "product-intent"]);
  assert.deepEqual([...VERSION_CHANGE_TARGET_ACTIONS], ["add", "modify"]);

  const upgrade = new Set<string>(VERSION_UPGRADE_TARGET_KINDS);
  const detail = new Set<string>(DETAIL_AMENDMENT_TARGET_KINDS);
  for (const forbidden of VCA_FORBIDDEN_TARGET_KINDS) {
    assert.equal(upgrade.has(forbidden), false);
    assert.equal(detail.has(forbidden), false);
  }
  assert.equal(upgrade.size, 2, "version-upgrade 只允许 contract/roster");
});

test("VCA 记录正例：baseTrunk:null + bootstrap:true（AC-25/F12）与提交定格字段", () => {
  const bootstrapRecord = {
    v: 1,
    schema: VERSION_CHANGE_SCHEMA,
    applicationId: "vc-1",
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: "trunk-amendment-model",
    baseTrunk: null,
    bootstrap: true,
    targets: [
      { kind: "contract", path: "docs/proposals/trunk-amendment-model-proposal-v2.md", action: "modify", toSha256: SHA_A },
    ],
    summary: "bootstrap 版本升级",
    status: "submitted",
    submittedAt: AT,
    submittedBy: "product",
    applicationSha256: SHA_B,
    at: AT,
  } satisfies VersionChangeRecord;
  assert.equal(bootstrapRecord.baseTrunk, null);
  assert.equal(bootstrapRecord.bootstrap, true);

  const normalRecord = {
    ...bootstrapRecord,
    applicationId: "vc-2",
    baseTrunk: { trunkVersion: 1, runId: null, digest: SHA_A },
    bootstrap: false,
    status: "applied",
    decidedBy: undefined,
    decisionId: "decision-1",
    resultTrunkVersion: 2,
    journalId: "journal-1",
  } satisfies VersionChangeRecord;
  assert.equal(normalRecord.baseTrunk?.trunkVersion, 1);
  assert.equal(normalRecord.status, "applied");
});

test("版本变更事件归属分区（AC-31/Q3）：approved/rejected=customer；submitted/applied/superseded=application", () => {
  const customer = new Set<string>(VERSION_CHANGE_CUSTOMER_STATUSES);
  const application = new Set<string>(VERSION_CHANGE_APPLICATION_STATUSES);
  assert.deepEqual([...customer], ["approved", "rejected"]);
  assert.deepEqual([...application], ["submitted", "applied", "superseded"]);
  for (const status of customer) assert.equal(application.has(status), false);
  const covered = new Set<string>([...customer, ...application]);
  assert.deepEqual([...covered].sort(), ["applied", "approved", "rejected", "submitted", "superseded"]);
  assert.equal(customer.has("draft"), false, "draft 不是账本事件状态");
  assert.equal(application.has("draft"), false, "draft 不是账本事件状态");
});

test("doc-freeze reason 九类：customer/application 两分区并集恰等于全集、交集为空；migrated-draft 不是 reason（F29/F35/Q6）", () => {
  assert.equal(DOC_FREEZE_REASONS.length, 9);
  assert.equal(new Set(DOC_FREEZE_REASONS).size, 9, "reason 不得重复");
  const all = new Set<string>(DOC_FREEZE_REASONS);
  const customer = new Set<string>(DOC_FREEZE_CUSTOMER_REASONS);
  const application = new Set<string>(DOC_FREEZE_APPLICATION_REASONS);
  const union = new Set<string>([...customer, ...application]);
  assert.deepEqual([...union].sort(), [...all].sort(), "customer/application 分区穷尽全集");
  assert.equal(customer.size + application.size, all.size, "两分区互斥");
  assert.equal((DOC_FREEZE_REASONS as readonly string[]).includes("migrated-draft"), false);
  assert.deepEqual([...DOC_MIGRATION_MARKS], ["migrated-legacy", "migrated-draft"]);
  assert.deepEqual([...DOC_FREEZE_BASELINE_EVENT_KINDS], ["frozen", "draft-updated", "draft-marker"]);
  // @ts-expect-error migrated-draft 只作 baseline draft-marker 迁移标记，不是冻结 reason
  const badReason: DocFreezeReason = "migrated-draft";
  void badReason;
});

test("DocFreezeRecord / DocFreezeLookup 三态（F33 fail-closed）", () => {
  const record = {
    schema: DOC_FREEZE_SCHEMA,
    applicationId: "vc-1",
    reason: "vca-approved",
    origin: "customer",
    decidedBy: "customer",
    decisionId: "decision-1",
    frozenAt: AT,
    actorRoleId: "rapporteur",
  } satisfies DocFreezeRecord;
  assert.equal(record.reason, "vca-approved");

  assert.deepEqual([...DOC_FREEZE_LOOKUP_STATES], ["frozen", "draft", "unknown"]);
  for (const state of DOC_FREEZE_LOOKUP_STATES) {
    const lookup = { path: "docs/proposals/a-v1.md", version: 1, state } satisfies DocFreezeLookup;
    assert.equal(lookup.state, state);
  }
  // @ts-expect-error unknown 之外不得新造查询态（fail-closed 三态已冻结）
  const badState: DocFreezeLookupState = "corrupt";
  void badState;
});

test("StableWritePermit 唯一 permit 形状（F13）：v/permitId/authority/四态/approvedAt/expiresAt/baseSha256=\"\"", () => {
  assert.deepEqual([...STABLE_WRITE_PERMIT_STATUSES], ["approved", "consumed", "expired", "failed"]);
  assert.deepEqual([...STABLE_WRITE_STATUSES], ["requested", "approved", "rejected", "written", "failed"]);
  assert.equal(STABLE_WRITE_STATUSES.length, 5);
  assert.equal(STABLE_WRITE_PERMIT_STATUSES.length, 4);

  const permit = {
    v: 1,
    schema: STABLE_WRITE_SCHEMA,
    permitId: "swp-1",
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow",
    authority: { decisionId: "decision-1", confirmationId: "conf-1" },
    baseSha256: "",
    targetSha256: SHA_A,
    status: "approved",
    approvedAt: AT,
    expiresAt: "2026-11-04T00:30:00.000Z",
    issuedAt: AT,
  } satisfies StableWritePermit;
  assert.equal(permit.baseSha256, "", '"" = 写入前文件不存在');
  assert.equal(permit.authority.decisionId, "decision-1");

  const secondAuthority = {
    ...permit,
    authority: { confirmationId: "conf-2" },
    status: "consumed",
    consumedAt: AT,
  } satisfies StableWritePermit;
  assert.equal(secondAuthority.authority.confirmationId, "conf-2");

  const failedPermit = { ...permit, status: "failed" } satisfies StableWritePermit;
  assert.equal(failedPermit.status, "failed");

  // 负例：permit 状态不接受 record 生命周期值 / 缺 authority / 缺 expiresAt
  // @ts-expect-error "requested" 是 record 状态，不是 permit 状态（不得造第二套状态枚举）
  const requestedPermit: StableWritePermit = { ...permit, status: "requested" };
  void requestedPermit;
  // @ts-expect-error authority 必须至少带 decisionId 或 confirmationId
  const emptyAuthority: StableWritePermit = { ...permit, authority: {} };
  void emptyAuthority;
  // @ts-expect-error 批准后 expiresAt 必填（缺省/undefined 不被接受）
  const missingExpiry: StableWritePermit = { ...permit, expiresAt: undefined };
  void missingExpiry;

  // @ts-expect-error permit 状态不接受第五值
  const extraStatus: StableWritePermitStatus = "expired-unconfirmed";
  void extraStatus;
});

test("StableWriteRecord 与 permit 分表：record.permitId 关联；record 可镜像 expiresAt/consumedAt（F13）", () => {
  const record = {
    v: 1,
    schema: STABLE_WRITE_SCHEMA,
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow",
    baseSha256: "",
    targetSha256: SHA_A,
    diffPreview: "- old\n+ new",
    status: "written",
    decisionId: "decision-1",
    confirmationId: "conf-1",
    permitId: "swp-1",
    approvedAt: AT,
    expiresAt: "2026-11-04T00:30:00.000Z",
    consumedAt: AT,
    writtenAt: AT,
    at: AT,
  } satisfies StableWriteRecord;
  assert.equal(record.permitId, "swp-1");
  assert.equal(record.status, "written");
  assert.equal("permit" in record, false, "record 不得内嵌 permit 第三形状；按 permitId 关联");

  // @ts-expect-error record 状态不接受 permit 状态 "consumed"
  const badRecord: StableWriteRecord = { ...record, status: "consumed" };
  void badRecord;
});

test("StableWriteDecisionInput 对齐门禁输入（F13）：permit 可选、now 为 () => Date；C1 不实现判定", () => {
  const permit = {
    v: 1,
    schema: STABLE_WRITE_SCHEMA,
    permitId: "swp-1",
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow",
    authority: { decisionId: "decision-1" },
    baseSha256: "",
    targetSha256: SHA_A,
    status: "approved",
    approvedAt: AT,
    expiresAt: "2026-11-04T00:30:00.000Z",
    issuedAt: AT,
  } satisfies StableWritePermit;

  const full = {
    projectRoot: "/tmp/project",
    relPath: "docs/workflow.md",
    sha256: SHA_A,
    permit,
    now: () => new Date(AT),
  } satisfies StableWriteDecisionInput;
  assert.equal(typeof full.now, "function");
  assert.equal(full.permit?.permitId, "swp-1");

  const minimal: StableWriteDecisionInput = {
    projectRoot: "/tmp/project",
    relPath: "docs/workflow.md",
    sha256: SHA_A,
  };
  assert.equal(minimal.permit, undefined);
  assert.equal(minimal.now, undefined);
});

test("stable.write.* 事件五 kind + F14 可选 approvedAt/expiresAt/consumedAt + 归属分区", () => {
  assert.deepEqual([...STABLE_WRITE_EVENT_KINDS], [
    "stable.write.requested",
    "stable.write.approved",
    "stable.write.rejected",
    "stable.write.written",
    "stable.write.failed",
  ]);
  assert.deepEqual([...STABLE_WRITE_CUSTOMER_EVENT_KINDS], [
    "stable.write.approved",
    "stable.write.rejected",
  ]);
  assert.deepEqual([...STABLE_WRITE_APPLICATION_EVENT_KINDS], [
    "stable.write.requested",
    "stable.write.written",
    "stable.write.failed",
  ]);
  const covered = new Set<string>([
    ...STABLE_WRITE_CUSTOMER_EVENT_KINDS,
    ...STABLE_WRITE_APPLICATION_EVENT_KINDS,
  ]);
  assert.deepEqual([...covered].sort(), [...STABLE_WRITE_EVENT_KINDS].sort());

  for (const kind of STABLE_WRITE_EVENT_KINDS) {
    const event = {
      v: 1,
      at: AT,
      kind,
      schema: STABLE_WRITE_SCHEMA,
      requestId: "sw-1",
      roleId: "convener",
      path: "docs/workflow.md",
      stableKind: "workflow",
      baseSha256: "",
      targetSha256: SHA_A,
      status: kind === "stable.write.requested" ? "requested" : "approved",
      origin: kind === "stable.write.approved" ? "customer" : "application",
    } satisfies StableWriteEvent;
    const asTaskEvent: TaskStateEvent = event;
    assert.equal(asTaskEvent.kind, kind);
  }

  const withoutTimes = {
    v: 1,
    at: AT,
    kind: "stable.write.written",
    schema: STABLE_WRITE_SCHEMA,
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    stableKind: "workflow",
    baseSha256: "",
    targetSha256: SHA_A,
    status: "written",
    origin: "application",
  } satisfies StableWriteEvent;
  assert.equal("approvedAt" in withoutTimes, false, "F14：三字段可选，旧写入方不补字段仍合法");

  const withTimes = {
    ...withoutTimes,
    kind: "stable.write.approved",
    status: "approved",
    origin: "customer",
    decidedBy: "customer",
    decisionId: "decision-1",
    approvedAt: AT,
    expiresAt: "2026-11-04T00:30:00.000Z",
    consumedAt: AT,
  } satisfies StableWriteEvent;
  assert.equal(withTimes.approvedAt, AT);
  assert.equal(withTimes.expiresAt, "2026-11-04T00:30:00.000Z");
  assert.equal(withTimes.consumedAt, AT);
});

test("stable kind 与 trunk 单一定义同源（无第二份枚举）", () => {
  const kinds: StableFileKind[] = ["workflow", "role-card", "boundary"];
  for (const kind of kinds) {
    const trunkKind: TrunkStableFileKind = kind;
    const back: StableFileKind = trunkKind;
    assert.equal(back, kind);
  }
  // @ts-expect-error stable 文件仅三类
  const badKind: StableFileKind = "docs";
  void badKind;
});

test("refactor-request/v1（F31/F40/Q10）：convener 发起、应用调度层管理、五态、五类禁止", () => {
  assert.equal(REFACTOR_REQUESTED_BY, "convener");
  assert.equal(REFACTOR_MANAGED_BY, "application-scheduler");
  assert.deepEqual([...REFACTOR_REQUEST_STATUSES], ["requested", "accepted", "closed", "rejected", "superseded"]);
  assert.deepEqual([...REFACTOR_FORBIDDEN_KINDS], [
    "versioned-doc",
    "boundary",
    "stable",
    "team-plan",
    "flow",
  ]);

  const record = {
    v: 1,
    schema: REFACTOR_REQUEST_SCHEMA,
    requestId: "rf-1",
    flowId: "trunk-amendment-model",
    initiatedBy: "convener",
    title: "重构 provider 目录",
    reason: "内部实现整理，不改契约/边界",
    scope: { modules: ["provider"], paths: ["src/provider/version-change/"], roles: ["编排"] },
    status: "requested",
    managedBy: "application-scheduler",
    enforcement: {
      writeSet: ["src/provider/version-change/"],
      forbiddenKinds: [...REFACTOR_FORBIDDEN_KINDS],
    },
    at: AT,
  } satisfies RefactorRequestRecord;
  assert.equal(record.initiatedBy, "convener");
  assert.equal(record.managedBy, "application-scheduler");

  const event = {
    v: 1,
    at: AT,
    kind: "refactor.request",
    schema: REFACTOR_REQUEST_SCHEMA,
    requestId: record.requestId,
    flowId: record.flowId,
    initiatedBy: "convener",
    title: record.title,
    reason: record.reason,
    scope: record.scope,
    status: "accepted",
    managedBy: "application-scheduler",
    enforcement: record.enforcement,
  } satisfies RefactorRequestEvent;
  const asTaskEvent: TaskStateEvent = event;
  assert.equal(asTaskEvent.kind, "refactor.request");
  assert.equal("decidedBy" in event, false, "refactor 无客户决定，不得记 decidedBy");
});

test("version.change / doc.freeze 事件可赋给 TaskStateEvent；submitted=application、approved=customer", () => {
  const vcEvent = {
    v: 1,
    at: AT,
    kind: "version.change",
    schema: VERSION_CHANGE_SCHEMA,
    applicationId: "vc-1",
    vcKind: "detail-amendment",
    initiatorRoleId: "rapporteur",
    flowId: "trunk-amendment-model",
    status: "submitted",
    baseTrunkVersion: 1,
    targets: [
      { kind: "contract", path: "docs/proposals/a-v2.md", action: "modify", toSha256: SHA_A },
    ],
    origin: "application",
  } satisfies VersionChangeEvent;
  const asTaskEvent: TaskStateEvent = vcEvent;
  assert.equal(asTaskEvent.kind, "version.change");

  const approved = {
    ...vcEvent,
    status: "approved",
    origin: "customer",
    decidedBy: "customer",
    decisionId: "decision-1",
  } satisfies VersionChangeEvent;
  assert.equal(approved.decidedBy, "customer");

  const freezeEvent = {
    v: 1,
    at: AT,
    kind: "doc.freeze",
    schema: DOC_FREEZE_SCHEMA,
    path: "docs/proposals/a-v2.md",
    version: 2,
    sha256: SHA_A,
    applicationId: "vc-1",
    reason: "vca-approved",
    origin: "customer",
    decidedBy: "customer",
    decisionId: "decision-1",
  } satisfies DocFreezeEvent;
  const asFreezeEvent: TaskStateEvent = freezeEvent;
  assert.equal(asFreezeEvent.kind, "doc.freeze");
});

test("acknowledgments 对象数组（F1）：request 可选对象数组、answered 回传 string[]、旧卡零变化", () => {
  const request = {
    kind: "confirm",
    title: "确认边界扩大",
    cardKind: "decision",
    flowId: "trunk-amendment-model",
    acknowledgments: [
      { id: "boundary-expansion", label: "已核对边界扩大项", required: true },
      { id: "hash-reviewed", label: "已核对哈希", required: false },
    ],
  } satisfies CustomerInputRequest;
  assert.equal(request.acknowledgments?.length, 2);
  assert.equal(request.acknowledgments?.[0].required, true);

  const legacy: CustomerInputRequest = { kind: "confirm", title: "旧卡" };
  assert.equal(legacy.acknowledgments, undefined);

  const answered = {
    outcome: "answered",
    value: { confirmed: true },
    acknowledged: ["boundary-expansion"],
  } satisfies CustomerInputOutcome;
  assert.deepEqual(answered.acknowledged, ["boundary-expansion"]);

  // @ts-expect-error 形状冻结为对象数组；string[] 不被接受（F1 驳回 D1 旧表述）
  const badAck: CustomerInputRequest = { kind: "confirm", title: "x", acknowledgments: ["a"] };
  void badAck;
});

test("四组错误码稳定、无重复（含 vca-conflict；排除 trunk-drift）", () => {
  const groups = [
    VERSION_CHANGE_ERROR_CODES,
    DOC_FREEZE_ERROR_CODES,
    STABLE_WRITE_ERROR_CODES,
    REFACTOR_ERROR_CODES,
  ] as const;
  for (const codes of groups) {
    assert.equal(new Set(codes).size, codes.length, `错误码不得重复：${codes.join(",")}`);
  }
  assert.equal((VERSION_CHANGE_ERROR_CODES as readonly string[]).includes("vca-conflict"), true);
  assert.equal((VERSION_CHANGE_ERROR_CODES as readonly string[]).includes("vca-hash-drift"), true);
  // @ts-expect-error 未知错误码不属于 VersionChangeErrorCode
  const badVcaCode: VersionChangeErrorCode = "vca-unknown";
  void badVcaCode;
  // @ts-expect-error 未知错误码不属于 StableWriteErrorCode
  const badStableCode: StableWriteErrorCode = "stable-write-unknown";
  void badStableCode;
  // @ts-expect-error 未知错误码不属于 RefactorErrorCode
  const badRefactorCode: RefactorErrorCode = "refactor-unknown";
  void badRefactorCode;
});

// —————————————— 2026-11-09 judge-delegated 契约（W-J1；B1 J1/J2 + AC-J6/AC-J9 契约面） ——————————————

const judgeSource: JudgeDelegatedSource = { kind: "judge-delegated", requestId: "req-1", engine: "claude",
  model: "claude-fable-5", operatorId: "judge:claude", reasonCode: "sufficient", reason: "匹配意图",
  selected: ["confirm"], cardKind: "intent-confirm", at: AT };

test("judge-delegated reason 子集：恰为 proposal/intent、是 customer 分区子集、不扩既有 reason 全集", () => {
  assert.deepEqual([...DOC_FREEZE_JUDGE_DELEGATED_REASONS], ["proposal-confirmed", "intent-confirmed"]);
  const judge = new Set<string>(DOC_FREEZE_JUDGE_DELEGATED_REASONS);
  const customer = new Set<string>(DOC_FREEZE_CUSTOMER_REASONS);
  for (const reason of judge) assert.equal(customer.has(reason), true, reason);
  for (const forbidden of ["vca-approved", "version-upgrade-approved", "detail-item-applied",
    "amendment-submitted", "handoff-pin-bootstrap", "bootstrap-vca-approved", "migrated-legacy",
    "role-direct-applied"]) {
    assert.equal(judge.has(forbidden), false, forbidden);
  }
});

test("DocFreezeOrigin/DocFreezeSource 扩展 judge-delegated：诚实来源可赋给记录，且不混入既有 DirectActionSource", () => {
  const origins: DocFreezeOrigin[] = ["customer", "application", "role-direct", "chief-delegated", "judge-delegated"];
  assert.equal(new Set(origins).size, 5);
  const asSource: DocFreezeSource = judgeSource;
  assert.equal(asSource.kind, "judge-delegated");
  const record = {
    schema: DOC_FREEZE_SCHEMA,
    applicationId: "intent-req-1",
    reason: "intent-confirmed",
    origin: "judge-delegated",
    source: asSource,
    frozenAt: AT,
    snapshotRef: { snapshotId: "snapshot-1", digest: SHA_A },
  } satisfies DocFreezeRecord;
  assert.equal(record.origin, "judge-delegated");
  assert.equal(isJudgeDelegatedSource(record.source), true);
  // 结构守卫 fail-closed：operatorId 与 engine 绑定、engine 非空、客户字段混入即拒绝
  assert.equal(isJudgeDelegatedSource({ ...judgeSource, operatorId: "judge:codex" }), false);
  assert.equal(isJudgeDelegatedSource({ ...judgeSource, engine: "" }), false);
  assert.equal(isJudgeDelegatedSource({ ...judgeSource, decidedBy: "customer" }), false);
  assert.equal(isJudgeDelegatedSource({ ...judgeSource, decisionId: "decision-req-1" }), false);
  // @ts-expect-error judge-delegated 不是既有 DirectActionSource 的成员（不得冒充直连/客户来源）
  const wrong: DirectActionSource = judgeSource;
  void wrong;
  // @ts-expect-error origin 不得写成 `judge`（与 request.resolved.by 的归因值区分）
  const badOrigin: DocFreezeOrigin = "judge";
  void badOrigin;
});

test("doc.freeze 事件 origin=judge-delegated + DocFreezeSource 可赋给 TaskStateEvent；customer 事件形状不变", () => {
  const judgeEvent = {
    v: 1,
    at: AT,
    kind: "doc.freeze",
    schema: DOC_FREEZE_SCHEMA,
    path: "docs/intent.md",
    version: 1,
    sha256: SHA_A,
    applicationId: "intent-req-1",
    reason: "intent-confirmed",
    origin: "judge-delegated",
    actionSource: judgeSource,
  } satisfies DocFreezeEvent;
  const asTaskEvent: TaskStateEvent = judgeEvent;
  assert.equal(asTaskEvent.kind, "doc.freeze");
  assert.equal("decidedBy" in judgeEvent, false, "judge 事件不得携带客户字段");
  assert.equal("decisionId" in judgeEvent, false);
  assert.equal("actorRoleId" in judgeEvent, false);
  const customerEvent = {
    v: 1,
    at: AT,
    kind: "doc.freeze",
    schema: DOC_FREEZE_SCHEMA,
    path: "docs/a.md",
    version: 2,
    sha256: SHA_A,
    applicationId: "vc-1",
    reason: "vca-approved",
    origin: "customer",
    decidedBy: "customer",
    decisionId: "decision-1",
  } satisfies DocFreezeEvent;
  assert.equal(customerEvent.origin, "customer");
});

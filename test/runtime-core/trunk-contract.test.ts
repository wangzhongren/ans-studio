// 运行时核心 C1 契约测试：`trunk/v1`、`trunk-amendment/v1`、`trunk-apply-journal/v1`
// 与 `trunk.state`/`trunk.amendment` 账本事件（2026-11-04 trunk-amendment-model C1 冻结）。
// 基线：P1.6 §4.5/§4.7/§5.3–§5.5 + PM 复审 F3/F4/F12/Q2/Q3/Q9 + P1 r2 §3.1/§5.1。
// 编译期断言由 `npm run typecheck` 覆盖（tsconfig include 含 test/）；运行时断言用 node --test。
import test from "node:test";
import assert from "node:assert/strict";
import {
  TRUNK_AMENDMENT_APPLY_STATES,
  TRUNK_AMENDMENT_CHECK_IDS,
  TRUNK_AMENDMENT_LEGACY_ITEM_KINDS,
  TRUNK_AMENDMENT_LEGACY_STATUS_MAP,
  TRUNK_AMENDMENT_LEGACY_STATUSES,
  TRUNK_AMENDMENT_SCHEMA,
  TRUNK_AMENDMENT_STATUSES,
  TRUNK_AMENDMENT_VCA_ITEM_KINDS,
  TRUNK_APPLY_JOURNAL_PHASES,
  TRUNK_APPLY_JOURNAL_SCHEMA,
  TRUNK_DOC_KINDS,
  TRUNK_ERROR_CODES,
  TRUNK_MANIFEST_SCHEMA,
  TRUNK_SOURCES,
  TRUNK_STABLE_FILE_KINDS,
  TRUNK_STATE_APPLICATION_OPS,
  TRUNK_STATE_CUSTOMER_OPS,
  TRUNK_STATE_LEGACY_OPS,
  TRUNK_STATE_OPS,
  TRUNK_VERSION_MIN,
  type TrunkAmendmentApplyState,
  type TrunkAmendmentDoc,
  type TrunkAmendmentState,
  type TrunkAmendmentStatus,
  type TrunkApplyJournal,
  type TrunkErrorCode,
  type TrunkManifest,
  type TrunkSource,
  type TrunkStableArtifactRef,
  type TrunkStateOp,
  type TrunkStateView,
} from "../../src/model/trunk.ts";
import type {
  TaskStateEvent,
  TrunkAmendmentEvent,
  TrunkStateEvent,
} from "../../src/model/runtime.ts";

const AT = "2026-11-04T00:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);

function sampleWorkflowRef(): TrunkStableArtifactRef {
  return {
    kind: "workflow",
    path: "docs/workflow.md",
    sha256: SHA_A,
    confirmationId: "conf-1",
    decisionId: "decision-1",
    updatedAt: AT,
  };
}

test("schema 常量与最小版本（trunk/v1、trunk-amendment/v1、trunk-apply-journal/v1）", () => {
  assert.equal(TRUNK_MANIFEST_SCHEMA, "trunk/v1");
  assert.equal(TRUNK_AMENDMENT_SCHEMA, "trunk-amendment/v1");
  assert.equal(TRUNK_APPLY_JOURNAL_SCHEMA, "trunk-apply-journal/v1");
  assert.equal(TRUNK_VERSION_MIN, 1);

  assert.deepEqual([...TRUNK_STABLE_FILE_KINDS], ["workflow", "role-card", "boundary"]);
  assert.deepEqual([...TRUNK_DOC_KINDS].sort(), [
    "architecture",
    "assets",
    "modules",
    "proposal",
    "roster",
    "topology",
  ]);
});

test("主干来源：含 bootstrap/recovery/upgrade；不新造 main-upgrade（PM 复审 §4.10-3）", () => {
  assert.deepEqual([...TRUNK_SOURCES].sort(), [
    "adopted",
    "amendment",
    "bootstrap",
    "post-run-change",
    "recovery",
    "upgrade",
  ]);
  assert.equal((TRUNK_SOURCES as readonly string[]).includes("bootstrap"), true);
  assert.equal((TRUNK_SOURCES as readonly string[]).includes("recovery"), true);
  assert.equal((TRUNK_SOURCES as readonly string[]).includes("upgrade"), true);
  // @ts-expect-error 消费方不得新造 "main-upgrade"；统一用 "upgrade"
  const badSource: TrunkSource = "main-upgrade";
  void badSource;
});

test("修正案生命周期六值 + P1.3 legacy 映射全覆盖（AC-32）", () => {
  assert.deepEqual([...TRUNK_AMENDMENT_STATUSES], [
    "draft",
    "submitted",
    "approved",
    "rejected",
    "applied",
    "superseded",
  ]);
  assert.deepEqual([...TRUNK_AMENDMENT_LEGACY_STATUSES], ["proposed", "confirmed", "cancelled"]);
  assert.deepEqual(
    Object.keys(TRUNK_AMENDMENT_LEGACY_STATUS_MAP).sort(),
    [...TRUNK_AMENDMENT_LEGACY_STATUSES].sort(),
    "legacy 映射无多余键、无遗漏",
  );
  assert.equal(TRUNK_AMENDMENT_LEGACY_STATUS_MAP.proposed, "submitted");
  assert.equal(TRUNK_AMENDMENT_LEGACY_STATUS_MAP.confirmed, "approved");
  assert.equal(TRUNK_AMENDMENT_LEGACY_STATUS_MAP.cancelled, "rejected");
  for (const legacy of TRUNK_AMENDMENT_LEGACY_STATUSES) {
    assert.equal(
      (TRUNK_AMENDMENT_STATUSES as readonly string[]).includes(TRUNK_AMENDMENT_LEGACY_STATUS_MAP[legacy]),
      true,
    );
  }
  // @ts-expect-error 旧状态 proposed 不属于新生命周期（只读映射，不得写入新事件）
  const proposed: TrunkAmendmentStatus = "proposed";
  void proposed;
});

test("item kind 收窄：新 detail 仅 contract/roster/execution；legacy workflow/boundary 不相交（AC-6/AC-28）", () => {
  assert.deepEqual([...TRUNK_AMENDMENT_VCA_ITEM_KINDS], ["contract", "roster", "execution"]);
  assert.deepEqual([...TRUNK_AMENDMENT_LEGACY_ITEM_KINDS], ["workflow", "boundary"]);
  const vca = new Set<string>(TRUNK_AMENDMENT_VCA_ITEM_KINDS);
  for (const legacy of TRUNK_AMENDMENT_LEGACY_ITEM_KINDS) {
    assert.equal(vca.has(legacy), false, `legacy item kind ${legacy} 不得进入新 detail VCA`);
  }
  assert.deepEqual([...TRUNK_AMENDMENT_APPLY_STATES], [
    "idle",
    "applying",
    "applied",
    "apply-failed",
    "applied-uncertain",
  ]);
  assert.deepEqual([...TRUNK_APPLY_JOURNAL_PHASES], ["prepared", "run-manifest-written", "committed"]);
  assert.equal(TRUNK_AMENDMENT_CHECK_IDS.length, 8);
  assert.equal(new Set(TRUNK_AMENDMENT_CHECK_IDS).size, 8);
});

test("trunk.state op 分区：stable-repinned 属 customer；drift/unfrozen-expired 仅 legacy 读（AC-31/AC-34）", () => {
  assert.equal((TRUNK_STATE_OPS as readonly string[]).includes("stable-repinned"), true);
  assert.deepEqual([...TRUNK_STATE_LEGACY_OPS].sort(), ["drift", "unfrozen-expired"]);
  for (const legacy of TRUNK_STATE_LEGACY_OPS) {
    assert.equal((TRUNK_STATE_OPS as readonly string[]).includes(legacy), false, `新写 op 不得含 ${legacy}`);
    assert.equal((TRUNK_STATE_CUSTOMER_OPS as readonly string[]).includes(legacy), false);
    assert.equal((TRUNK_STATE_APPLICATION_OPS as readonly string[]).includes(legacy), false);
  }

  const partition = new Set<string>([...TRUNK_STATE_CUSTOMER_OPS, ...TRUNK_STATE_APPLICATION_OPS]);
  assert.deepEqual([...partition].sort(), [...TRUNK_STATE_OPS].sort(), "customer/application 分区穷尽");
  assert.equal(partition.size, TRUNK_STATE_OPS.length, "customer/application 分区互斥");
  assert.deepEqual([...TRUNK_STATE_APPLICATION_OPS], ["gap"]);
  assert.equal((TRUNK_STATE_CUSTOMER_OPS as readonly string[]).includes("stable-repinned"), true);

  // @ts-expect-error drift 仅旧账本读取，不属于新写入 op 类型
  const driftOp: TrunkStateOp = "drift";
  void driftOp;
});

test("trunk manifest / amendment doc·state / journal / view 最小正例（含 bootstrap/baseTrunk:null、roleCards、committed）", () => {
  const manifest = {
    schema: TRUNK_MANIFEST_SCHEMA,
    trunkVersion: 2,
    source: "bootstrap",
    previous: null,
    flowId: "trunk-amendment-model",
    runId: null,
    artifacts: {
      documents: {
        proposal: { path: "docs/proposals/trunk-amendment-model-proposal-v1.md", sha256: SHA_A, version: 1 },
        roster: { path: "docs/proposals/trunk-amendment-model-roster-v1.md", sha256: SHA_B, version: 1 },
      },
      execution: { teamPlan: null, flow: null },
      workflow: sampleWorkflowRef(),
      roleCards: {
        chief: { kind: "role-card", path: "角色卡/chief/role-card.md", sha256: SHA_C },
      },
      boundaries: {
        chief: { kind: "boundary", path: "角色卡/chief/boundary.yaml", sha256: SHA_D },
      },
    },
    rosterVersion: 1,
    d3: { decisionId: "decision-3", targetRoleIds: ["chief"] },
    roles: ["chief"],
    digest: SHA_A,
    createdAt: AT,
    updatedAt: AT,
  } satisfies TrunkManifest;

  assert.equal(manifest.artifacts.roleCards?.chief.kind, "role-card");
  assert.equal(manifest.artifacts.boundaries.chief.kind, "boundary");
  assert.equal(manifest.runId, null);

  const amendmentDoc = {
    schema: TRUNK_AMENDMENT_SCHEMA,
    amendmentId: "am-1",
    flowId: "trunk-amendment-model",
    docVersion: 1,
    baseTrunk: null,
    bootstrap: true,
    summary: "bootstrap 修正案",
    items: [
      {
        itemId: "item-1",
        kind: "contract",
        change: "modify",
        from: "docs/proposals/a-v1.md",
        fromSha256: SHA_A,
        to: "docs/proposals/a-v2.md",
        toSha256: SHA_B,
      },
    ],
  } satisfies TrunkAmendmentDoc;

  const amendmentState = {
    v: 1,
    schema: TRUNK_AMENDMENT_SCHEMA,
    amendmentId: amendmentDoc.amendmentId,
    flowId: amendmentDoc.flowId,
    docPath: "docs/proposals/trunk-amendment-model-amendment-v1.md",
    docSha256: SHA_C,
    docVersion: 1,
    baseTrunk: null,
    bootstrap: true,
    status: "submitted",
    applyState: "idle",
    applicationId: "vc-1",
    items: amendmentDoc.items,
    createdAt: AT,
    updatedAt: AT,
    submittedAt: AT,
  } satisfies TrunkAmendmentState;

  assert.equal(amendmentState.applicationId, "vc-1");
  assert.equal(amendmentState.applyState, "idle");

  const journal = {
    v: 1,
    schema: TRUNK_APPLY_JOURNAL_SCHEMA,
    journalId: "journal-1",
    applicationId: "vc-1",
    flowId: "trunk-amendment-model",
    phase: "committed",
    target: {
      trunkVersion: 2,
      runId: null,
      documents: { proposal: { path: "docs/proposals/a-v2.md", sha256: SHA_B } },
      execution: { teamPlan: null, flow: null },
    },
    before: {
      trunkVersion: 1,
      runId: null,
      documents: { proposal: { path: "docs/proposals/a-v1.md", sha256: SHA_A } },
      execution: { teamPlan: null, flow: null },
    },
    startedAt: AT,
    updatedAt: AT,
    result: "committed",
  } satisfies TrunkApplyJournal;
  assert.equal(journal.phase, "committed");

  const view = {
    availability: "frozen",
    trunkVersion: 2,
    source: "bootstrap",
    runId: null,
    flowId: "trunk-amendment-model",
    workflow: sampleWorkflowRef(),
    roleCards: manifest.artifacts.roleCards,
    boundaries: manifest.artifacts.boundaries,
    pendingAmendmentId: "am-1",
    applyState: "idle" satisfies TrunkAmendmentApplyState,
    journalId: "journal-1",
  } satisfies TrunkStateView;
  assert.equal(view.availability, "frozen");
});

test("trunk.state(stable-repinned) 事件形状：customer、绑定 confirmationId/decisionId、trunkVersion 不变", () => {
  const repinned = {
    v: 1,
    at: AT,
    kind: "trunk.state",
    op: "stable-repinned",
    trunkVersion: 3,
    previousTrunkVersion: 3,
    decidedBy: "customer",
    origin: "customer",
    confirmationId: "conf-1",
    decisionId: "decision-1",
    path: "docs/workflow.md",
    oldSha: SHA_A,
    newSha: SHA_B,
  } satisfies TrunkStateEvent;

  const asEvent: TaskStateEvent = repinned;
  assert.equal(asEvent.kind, "trunk.state");

  assert.equal(repinned.trunkVersion, repinned.previousTrunkVersion, "mini re-pin 不升 trunkVersion");
  assert.equal("resultTrunkVersion" in repinned, false);
  // 类型层：TrunkStateEvent 不存在 resultTrunkVersion 键（不产生新 trunk 版本）
  type HasResultTrunkVersion = "resultTrunkVersion" extends keyof TrunkStateEvent ? true : false;
  const hasBump: HasResultTrunkVersion = false;
  assert.equal(hasBump, false);

  const amendmentEvent = {
    v: 1,
    at: AT,
    kind: "trunk.amendment",
    amendmentId: "am-1",
    flowId: "trunk-amendment-model",
    status: "approved",
    applyState: "idle",
    applicationId: "vc-1",
    decidedBy: "customer",
    origin: "customer",
    decisionId: "decision-1",
    itemId: "item-1",
    itemKind: "contract",
    itemResult: "applied",
  } satisfies TrunkAmendmentEvent;
  const asAmendmentEvent: TaskStateEvent = amendmentEvent;
  assert.equal(asAmendmentEvent.kind, "trunk.amendment");
});

test("trunk 错误码稳定、无重复、无 trunk-drift（并入 trunk-verify-failed）", () => {
  assert.equal(new Set(TRUNK_ERROR_CODES).size, TRUNK_ERROR_CODES.length, "错误码不得重复");
  assert.equal((TRUNK_ERROR_CODES as readonly string[]).includes("trunk-verify-failed"), true);
  assert.equal((TRUNK_ERROR_CODES as readonly string[]).includes("trunk-drift"), false);
  // @ts-expect-error trunk-drift 已并入 trunk-verify-failed，不得作为独立错误码
  const driftCode: TrunkErrorCode = "trunk-drift";
  void driftCode;
});

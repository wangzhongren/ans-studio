// test/编排/trunk-events.test.ts
// C2a（2026-11-04，trunk-amendment-model）：账本事件契约冻结的读侧验证。
//
// 覆盖 `TASK_EVENT_KINDS` 17 → 27 类新增事件：
//   `trunk.state`（含 stable-repinned）、`trunk.amendment`、`version.change`、`doc.freeze`、
//   `refactor.request`、`stable.write.requested/approved/rejected/written/failed`。
//
// 形状/枚举单一来源 = C1 Model（本测试同样从 Model 导入常量构造夹具，不复制字面量）：
//   `src/model/runtime.ts`（事件联合 + STABLE_WRITE_*_EVENT_KINDS）
//   `src/model/trunk.ts`（trunk.state/trunk.amendment 状态与归属）
//   `src/model/version-change.ts`（VCA/doc.freeze/refactor/stable-write 枚举与分区）
//
// 断言口径：合法行可读；归属/分区/生命周期/applyState/必填字段负例成坏行（跳过不阻塞）；
// F14 可选时间戳（给出才校验）；旧状态/旧账本可读；未知 kind 记坏行不阻塞；TaskRecord 语义不变。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  TASKS_STATE_REL,
  readTaskState,
  taskStatusOf,
  validateTaskStateEvent,
} from "../../src/common/编排/task-state.ts";
import { freezeEvents } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import type { DocFreezeRecordInput } from "../../src/service/version-change/public/version-change-service.ts";
import {
  STABLE_WRITE_APPLICATION_EVENT_KINDS,
  STABLE_WRITE_CUSTOMER_EVENT_KINDS,
  STABLE_WRITE_EVENT_KINDS,
  type StableWriteEventKind,
} from "../../src/model/runtime.ts";
import {
  DOC_FREEZE_SCHEMA,
  REFACTOR_FORBIDDEN_KINDS,
  REFACTOR_MANAGED_BY,
  REFACTOR_REQUEST_SCHEMA,
  REFACTOR_REQUESTED_BY,
  STABLE_WRITE_SCHEMA,
  VERSION_CHANGE_SCHEMA,
} from "../../src/model/version-change.ts";

const AT = "2026-11-04T00:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "ans-trunk-events-"));
}

function line(fields: Record<string, unknown>): Record<string, unknown> {
  return { v: 1, at: AT, ...fields };
}

async function writeLines(root: string, lines: Record<string, unknown>[]): Promise<void> {
  const file = path.join(root, ...TASKS_STATE_REL.split("/"));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${lines.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
}

// —————————————— 夹具（均从 C1 常量取值） ——————————————

function trunkState(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return line({
    kind: "trunk.state",
    op: "switched",
    trunkVersion: 2,
    origin: "customer",
    decidedBy: "customer",
    decisionId: "decision-trunk-2",
    ...fields,
  });
}

function stableRepinned(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return trunkState({
    op: "stable-repinned",
    trunkVersion: 3,
    previousTrunkVersion: 3,
    path: "docs/workflow.md",
    oldSha: SHA_A,
    newSha: SHA_B,
    confirmationId: "confirmation-stable-1",
    ...fields,
  });
}

function trunkAmendment(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return line({
    kind: "trunk.amendment",
    amendmentId: "am-1",
    flowId: "focus",
    status: "submitted",
    applyState: "idle",
    applicationId: "vc-1",
    origin: "application",
    ...fields,
  });
}

function versionChange(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return line({
    kind: "version.change",
    schema: VERSION_CHANGE_SCHEMA,
    applicationId: "vc-1",
    vcKind: "detail-amendment",
    initiatorRoleId: "rapporteur",
    flowId: "focus",
    status: "submitted",
    origin: "application",
    targets: [{ kind: "contract", path: "docs/proposals/focus-proposal-v2.md", action: "modify", toSha256: SHA_A }],
    ...fields,
  });
}

function docFreeze(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return line({
    kind: "doc.freeze",
    schema: DOC_FREEZE_SCHEMA,
    path: "docs/proposals/focus-proposal-v1.md",
    version: 1,
    sha256: SHA_A,
    applicationId: "vc-1",
    reason: "vca-approved",
    origin: "customer",
    decidedBy: "customer",
    decisionId: "decision-vca-1",
    ...fields,
  });
}

function refactor(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return line({
    kind: "refactor.request",
    schema: REFACTOR_REQUEST_SCHEMA,
    requestId: "rf-1",
    flowId: "focus",
    initiatedBy: REFACTOR_REQUESTED_BY,
    title: "编排内部重构",
    reason: "拆分 task-state 校验分支",
    scope: { modules: ["orchestration"], paths: ["src/common/编排/"], roles: ["implementer"] },
    status: "requested",
    managedBy: REFACTOR_MANAGED_BY,
    enforcement: {
      writeSet: ["src/common/编排/"],
      forbiddenKinds: [...REFACTOR_FORBIDDEN_KINDS],
    },
    ...fields,
  });
}

function stableWrite(kind: StableWriteEventKind, fields: Record<string, unknown> = {}): Record<string, unknown> {
  const customerKind = (STABLE_WRITE_CUSTOMER_EVENT_KINDS as readonly string[]).includes(kind);
  return line({
    kind,
    schema: STABLE_WRITE_SCHEMA,
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    stableKind: "workflow",
    baseSha256: SHA_A,
    targetSha256: SHA_B,
    status: kind.slice("stable.write.".length),
    origin: customerKind ? "customer" : "application",
    ...(customerKind ? { decidedBy: "customer", decisionId: "decision-stable-1" } : {}),
    ...fields,
  });
}

// —————————————— 合法路径 ——————————————

test("C2a：六类新事件合法行可读；归属/生命周期字段保留；TaskRecord 语义不变", async () => {
  const root = await tempRoot();
  try {
    const validLines: Record<string, unknown>[] = [
      line({ kind: "task.created", taskId: "t-1", from: "chief", to: "worker", text: "实现", sideEffect: "code", idempotencyKey: "k-1" }),
      // trunk.state：客户 op / mini re-pin / 应用观测 op / legacy op（旧账本只读）
      trunkState(),
      stableRepinned(),
      trunkState({ op: "gap", origin: "application", decidedBy: undefined, channel: "low-level-run-change", decisionId: undefined }),
      trunkState({ op: "drift", trunkVersion: undefined, origin: undefined, decidedBy: undefined, decisionId: undefined }),
      // trunk.amendment：新状态 + 旧状态（proposed/confirmed/cancelled 读兼容）
      trunkAmendment(),
      trunkAmendment({ status: "proposed", amendmentId: "legacy-amendment-1", origin: undefined, applyState: undefined, applicationId: undefined }),
      // version.change：submitted（application）/ approved（customer）/ applied（application + decisionId 供审计）
      versionChange(),
      versionChange({ status: "approved", origin: "customer", decidedBy: "customer", decisionId: "decision-vca-1" }),
      versionChange({ status: "applied", decisionId: "decision-vca-1", resultTrunkVersion: 2, journalId: "journal-1" }),
      // doc.freeze：customer 类 reason / application 类 reason
      docFreeze(),
      docFreeze({ reason: "amendment-submitted", origin: "application", decidedBy: undefined, decisionId: undefined, applicationId: "am-1" }),
      // refactor.request：无客户决定
      refactor(),
      // stable.write：五个 kind（approved/rejected 为客户决定；requested/written/failed 为应用动作）
      ...STABLE_WRITE_EVENT_KINDS.map((kind) => stableWrite(kind)),
      line({ kind: "task.closed", taskId: "t-1", by: "chief", outcome: "accepted" }),
    ];
    await writeLines(root, validLines);
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    assert.equal(state.events.length, validLines.length);
    assert.equal(state.records.size, 1, "新事件不进入 TaskRecord");
    assert.equal(taskStatusOf(state.records.get("t-1")!), "closed", "任务状态机不受新事件影响");
    assert.equal(state.unclosed.length, 0);

    // 归属抽查：customer op 保留 decidedBy；application op 无 decidedBy。
    const switched = state.events.find((event) => event.kind === "trunk.state" && event.op === "switched");
    assert.equal(switched?.kind === "trunk.state" ? switched.decidedBy : undefined, "customer");
    const gap = state.events.find((event) => event.kind === "trunk.state" && event.op === "gap");
    assert.equal(gap?.kind === "trunk.state" ? gap.decidedBy : undefined, undefined);
    assert.equal(gap?.kind === "trunk.state" ? gap.origin : undefined, "application");
    const repinned = state.events.find((event) => event.kind === "trunk.state" && event.op === "stable-repinned");
    assert.equal(repinned?.kind === "trunk.state" ? repinned.previousTrunkVersion : undefined, 3, "mini re-pin 不升 trunkVersion");
    const approved = state.events.find((event) => event.kind === "version.change" && event.status === "approved");
    assert.equal(approved?.kind === "version.change" ? approved.decidedBy : undefined, "customer");
    const applied = state.events.find((event) => event.kind === "version.change" && event.status === "applied");
    assert.equal(applied?.kind === "version.change" ? applied.decidedBy : undefined, undefined, "applied 不冒充客户");
    assert.equal(applied?.kind === "version.change" ? applied.decisionId : undefined, "decision-vca-1");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("C2a：STABLE_WRITE_EVENT_KINDS 五个 kind 全部入白名单（归属分区互斥）", async () => {
  const customer = new Set(STABLE_WRITE_CUSTOMER_EVENT_KINDS);
  const application = new Set(STABLE_WRITE_APPLICATION_EVENT_KINDS);
  for (const kind of STABLE_WRITE_EVENT_KINDS) {
    assert.equal(customer.has(kind) !== application.has(kind), true, `${kind} 必须恰属一个分区`);
  }
  const root = await tempRoot();
  try {
    await writeLines(root, STABLE_WRITE_EVENT_KINDS.map((kind) => stableWrite(kind)));
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    assert.equal(state.events.length, STABLE_WRITE_EVENT_KINDS.length);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

// —————————————— 负例（每行必须成坏行，且不阻塞合法行） ——————————————

test("C2a：逐 kind 负例——op/归属/状态/分区/必填字段非法成坏行，合法行仍可读", async () => {
  const root = await tempRoot();
  try {
    const badLines: Record<string, unknown>[] = [
      // trunk.state
      trunkState({ op: "bogus" }),
      trunkState({ origin: "application" }), // 客户 op 必须 origin customer
      trunkState({ decidedBy: undefined }), // 客户 op 必须 decidedBy customer
      trunkState({ op: "gap", origin: "application", decidedBy: "customer" }), // 应用 op 不得 decidedBy
      trunkState({ trunkVersion: 0 }),
      stableRepinned({ newSha: "XYZ" }),
      stableRepinned({ previousTrunkVersion: 2 }), // 不得升 trunkVersion
      stableRepinned({ confirmationId: undefined, decisionId: undefined }), // 缺确认绑定
      stableRepinned({ oldSha: "XYZ" }),
      // trunk.amendment
      trunkAmendment({ status: "bogus" }),
      trunkAmendment({ applyState: "bogus" }),
      trunkAmendment({ status: "approved", decidedBy: undefined, decisionId: undefined }), // 客户决定缺归属
      trunkAmendment({ itemKind: "bogus" }),
      // version.change
      versionChange({ schema: "bogus" }),
      versionChange({ vcKind: "version-upgrade", initiatorRoleId: "rapporteur" }), // 发起角色与 kind 不匹配
      versionChange({ status: "draft" }), // draft 不是账本事件状态
      versionChange({ status: "approved", origin: "customer", decidedBy: "customer", decisionId: undefined }),
      versionChange({ status: "approved", origin: "application", decidedBy: "customer", decisionId: "decision-vca-1" }),
      versionChange({ status: "submitted", decidedBy: "customer", decisionId: "decision-vca-1" }),
      versionChange({ targets: [{ kind: "workflow", path: "docs/workflow.md", action: "modify", toSha256: SHA_A }] }),
      versionChange({ targets: [{ kind: "contract", path: "docs/proposals/x.md", action: "delete", toSha256: SHA_A }] }),
      // doc.freeze
      docFreeze({ reason: "migrated-draft" }), // 迁移标记不是 freeze reason
      docFreeze({ origin: "application", decidedBy: undefined }), // 客户类 reason 必须 customer
      docFreeze({ reason: "amendment-submitted", origin: "application", decidedBy: "customer" }), // 应用类不得冒充客户
      docFreeze({ sha256: "XYZ" }),
      docFreeze({ version: 0 }),
      // refactor.request
      refactor({ initiatedBy: "rapporteur" }),
      refactor({ managedBy: "convener" }),
      refactor({ decidedBy: "customer" }), // 重构无客户决定
      refactor({ enforcement: { writeSet: ["src/common/编排/"], forbiddenKinds: ["bogus"] } }),
      refactor({ reason: "x".repeat(1001) }),
      refactor({ status: "bogus" }),
      // stable.write.*
      stableWrite("stable.write.approved", { decisionId: undefined, confirmationId: undefined }),
      stableWrite("stable.write.approved", { origin: "application" }),
      stableWrite("stable.write.requested", { decidedBy: "customer", decisionId: "decision-x" }),
      stableWrite("stable.write.requested", { stableKind: "stable" }),
      stableWrite("stable.write.requested", { baseSha256: "XYZ" }),
      stableWrite("stable.write.approved", { approvedAt: "not-a-date" }),
      // 未知 kind（未来事件）：旧 app 记坏行不阻塞；新 app 同样跳过
      line({ kind: "trunk.mystery" }),
    ];
    await writeLines(root, [...badLines, trunkState()]);
    const state = await readTaskState(root);
    assert.equal(state.errors.length, badLines.length, JSON.stringify(state.errors));
    assert.equal(state.events.length, 1, "仅合法行进入读结果");
    assert.equal(state.events[0]?.kind, "trunk.state");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

// —————————————— F14：可选审计时间戳 ——————————————

test("F14：stable.write.* 的 approvedAt/expiresAt/consumedAt 为可选字段——缺失可读、给出则校验 ISO", async () => {
  const root = await tempRoot();
  try {
    await writeLines(root, [
      // 旧/最简形状：无三个时间戳字段（C1 未定义必填 ⇒ C2a 不得要求）
      stableWrite("stable.write.approved"),
      // 带 F14 三字段（批准/过期/消费）合法的审计事件
      stableWrite("stable.write.written", {
        origin: "application",
        decidedBy: undefined,
        decisionId: undefined,
        approvedAt: "2026-11-04T00:01:00.000Z",
        expiresAt: "2026-11-04T00:31:00.000Z",
        consumedAt: "2026-11-04T00:02:00.000Z",
      }),
    ]);
    const state = await readTaskState(root);
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    assert.equal(state.events.length, 2);
    const approved = state.events.find((event) => event.kind === "stable.write.approved");
    assert.equal(approved?.kind === "stable.write.approved" ? "approvedAt" in approved : undefined, false, "缺失字段合法");
    const written = state.events.find((event) => event.kind === "stable.write.written");
    assert.equal(written?.kind === "stable.write.written" ? written.consumedAt : undefined, "2026-11-04T00:02:00.000Z");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("W-J2/J17：freezeEvents 防御镜像——无 source 的既有事件字节逐字不变；judge-delegated source 镜像 actionSource 且通过账本校验", () => {
  const vcaFreeze: DocFreezeRecordInput = { path: "docs/proposals/focus-proposal-v1.md", version: 1, sha256: SHA_A,
    freeze: { schema: DOC_FREEZE_SCHEMA, applicationId: "vc-1", reason: "vca-approved" as const, origin: "customer" as const,
      decidedBy: "customer" as const, decisionId: "decision-vca-1", frozenAt: AT } };
  const applicationFreeze: DocFreezeRecordInput = { path: "docs/proposals/focus-proposal-v2.md", version: 2, sha256: SHA_B,
    freeze: { schema: DOC_FREEZE_SCHEMA, applicationId: "am-1", reason: "amendment-submitted" as const, origin: "application" as const, frozenAt: AT } };
  const events = freezeEvents([vcaFreeze, applicationFreeze]);
  assert.deepEqual(events, [
    { v: 1, at: AT, kind: "doc.freeze", schema: DOC_FREEZE_SCHEMA, path: vcaFreeze.path, version: 1, sha256: SHA_A, applicationId: "vc-1",
      reason: "vca-approved", origin: "customer", decidedBy: "customer", decisionId: "decision-vca-1" },
    { v: 1, at: AT, kind: "doc.freeze", schema: DOC_FREEZE_SCHEMA, path: applicationFreeze.path, version: 2, sha256: SHA_B, applicationId: "am-1",
      reason: "amendment-submitted", origin: "application" },
  ], "无 source 的 VCA/application 路径不新增 actionSource 键，事件字节与当前逐字一致");
  const source = { kind: "judge-delegated" as const, requestId: "judge-intent-req", engine: "claude", model: "claude-unit", operatorId: "judge:claude",
    reasonCode: "sufficient", reason: "checked the intent evidence", selected: ["confirm"], cardKind: "intent-confirm", at: AT };
  const judgeFreeze: DocFreezeRecordInput = { path: "docs/product/focus-intent-v1.md", version: 1, sha256: SHA_A,
    freeze: { schema: DOC_FREEZE_SCHEMA, applicationId: "intent-judge-intent-req", reason: "intent-confirmed" as const, origin: "judge-delegated" as const, source, frozenAt: AT } };
  const [mirrored] = freezeEvents([judgeFreeze]);
  assert.equal(mirrored?.kind, "doc.freeze");
  assert.deepEqual(mirrored?.kind === "doc.freeze" ? mirrored.actionSource : undefined, source);
  const checked = validateTaskStateEvent(mirrored);
  assert.equal(checked.ok, true, JSON.stringify(checked), "judge 镜像事件通过 doc.freeze 账本校验（J16 分支）");
});

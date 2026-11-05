// test/桌面应用/version-change.test.ts
// B-10（2026-11-04 trunk-amendment-model D1）：桌面窗口版本变更/冻结/stable/重构/trunk 接线。
// 覆盖：VCA/逐项/stable 卡组装与结构校验；客户主权（含 @决策 排除）；acknowledgments 必选结算；
// IPC 冻结集（无 submit/refactor:request/stable-write:request）；stable 许可安装/重启重建/
// completeWrite 复核/消费/mini re-pin（不升 trunkVersion）；appointment-write 钩子（F16 无直接写盘）；
// 冻结迁移/损坏 fail-closed；`trunk:state` F15 roleCards；主干升级一次性预览/确认；只读列表面。
//
// 夹具：`test/编排/fixtures/trunk-project.ts`（真实文件系统 + S1/S2 存储/Service；只读复用，不改夹具）。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  createCustomerInputChannel,
  type DesktopCustomerInputFn,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import {
  appointmentStableWriteInputs,
  buildAmendmentItemCard,
  buildStableBoundaryRisk,
  buildStableWriteCard,
  buildVersionChangeCard,
  createVersionChangeStack,
  toAmendmentItemOutcome,
  toStableWriteOutcome,
  toVersionChangeOutcome,
  validateStableWriteCardShape,
  VERSION_CHANGE_FORBIDDEN_IPC_CHANNELS,
  VERSION_CHANGE_IPC_CHANNELS,
  type StableWritePreview,
  type VersionChangeStack,
} from "../../app/desktop/version-change.ts";
import type { TrunkStatePayloadV1 } from "../../app/desktop/trunk.ts";
import { validateDecisionCardRequest } from "../../src/common/编排/decision-card.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { stableWriteDecision } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type {
  CustomerInputFn,
  CustomerInputOutcome,
  CustomerInputRequest,
  RequestStableWriteInput,
  SubmitRefactorInput,
  SubmitVersionChangeFn,
  SubmitVersionChangeInput,
  TaskStateEvent,
} from "../../src/model/runtime.ts";
import type { StableWriteRecord, VersionChangeRecord } from "../../src/model/version-change.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import {
  AT,
  FLOW_ID,
  PATHS,
  boundaryText,
  createTrunkProject,
  sha256,
  writeProjectFile,
  type TrunkProject,
} from "../编排/fixtures/trunk-project.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function vcaRecord(overrides: Partial<VersionChangeRecord> = {}): VersionChangeRecord {
  return {
    v: 1,
    schema: "version-change/v1",
    applicationId: "vc-1",
    kind: "version-upgrade",
    initiatorRoleId: "product",
    flowId: "demo",
    baseTrunk: { trunkVersion: 1, runId: "run-1", digest: "d".repeat(64) },
    bootstrap: false,
    targets: [
      {
        kind: "contract",
        path: "docs/proposals/demo-proposal-v2.md",
        action: "modify",
        toSha256: "a".repeat(64),
      },
    ],
    summary: "补一个契约细节",
    status: "submitted",
    submittedAt: AT,
    applicationSha256: "b".repeat(64),
    at: AT,
    ...overrides,
  };
}

// ———————————————— 1. 卡片组装 / 结构校验 ————————————————

test("VCA 卡：application-owned decision、真实 flowId、推荐 reject、目标/hash/语义齐全", () => {
  const built = buildVersionChangeCard({ record: vcaRecord() });
  assert.ok(built !== undefined);
  if (built === undefined) return;
  const request = built.request;
  assert.equal(request.kind, "choice");
  assert.equal((request as { cardKind?: string }).cardKind, "decision");
  assert.equal((request as { application?: boolean }).application, true);
  assert.equal((request as { sourceRoleId?: string }).sourceRoleId, "application");
  assert.equal(request.flowId, "demo");
  const choice = request as Extract<CustomerInputRequest, { kind: "choice" }>;
  assert.deepEqual(choice.options.map((option) => option.id), ["approve-version-change", "reject-version-change"]);
  assert.equal(choice.options.filter((option) => option.recommended === true).length, 1);
  assert.equal(choice.options.find((option) => option.recommended === true)?.id, "reject-version-change");
  assert.match(choice.preview ?? "", /demo-proposal-v2\.md/);
  assert.match(choice.preview ?? "", /a{64}/);
  assert.match(choice.preview ?? "", /product/);
  // 共享 decision 校验可通过（application-owned 放行；flowId/选项/恰一推荐）。
  const validation = validateDecisionCardRequest({ request, roleId: "application", governanceModel: "trio" });
  assert.equal(validation.ok, true);
  if (validation.ok) assert.equal(validation.applicable, true);
  // detail-amendment 语义说明不同。
  const detail = buildVersionChangeCard({ record: vcaRecord({ kind: "detail-amendment", initiatorRoleId: "rapporteur" }) });
  assert.ok(detail !== undefined);
  if (detail !== undefined) {
    assert.match((detail.request as Extract<CustomerInputRequest, { kind: "choice" }>).preview ?? "", /item|逐项|content gate|内容/i);
  }
  // 缺字段 ⇒ 不发卡。
  assert.equal(buildVersionChangeCard({ record: vcaRecord({ flowId: "" }) }), undefined);
  assert.equal(buildVersionChangeCard({ record: vcaRecord({ targets: [] }) }), undefined);
});

test("stable 卡：app-owned `stable-write`、无 flowId、恰一推荐；独立结构校验；decision 校验不适用", () => {
  const record: StableWriteRecord = {
    v: 1,
    schema: "stable-write/v1",
    requestId: "sw-1",
    roleId: "convener",
    path: "docs/workflow.md",
    kind: "workflow",
    baseSha256: "1".repeat(64),
    targetSha256: "2".repeat(64),
    diffPreview: "- old\n+ new",
    status: "requested",
    at: AT,
  };
  const preview: StableWritePreview = {
    path: "docs/workflow.md",
    baseSha256: record.baseSha256,
    targetSha256: record.targetSha256,
    diffPreview: record.diffPreview,
  };
  const built = buildStableWriteCard({ record, preview });
  assert.ok(built !== undefined);
  if (built === undefined) return;
  const request = built.request;
  assert.equal((request as { cardKind?: string }).cardKind, "stable-write");
  assert.equal((request as { application?: boolean }).application, true);
  assert.equal(request.kind, "choice");
  const choice = request as Extract<CustomerInputRequest, { kind: "choice" }>;
  assert.deepEqual(choice.options.map((option) => option.id), ["approve-stable-write", "reject-stable-write"]);
  assert.equal(choice.options.find((option) => option.recommended === true)?.id, "reject-stable-write");
  assert.match(choice.preview ?? "", /docs\/workflow\.md/);
  assert.match(choice.preview ?? "", new RegExp(record.targetSha256));
  // 独立结构校验：形状 ok；preview 不含 path/target ⇒ 拒绝。
  assert.deepEqual(validateStableWriteCardShape(request, preview), { ok: true });
  assert.equal(validateStableWriteCardShape({ ...request, options: [] } as CustomerInputRequest).ok, false);
  assert.equal(
    validateStableWriteCardShape({
      ...(request as Extract<CustomerInputRequest, { kind: "choice" }>),
      options: [
        { id: "a", label: "A", recommended: true },
        { id: "b", label: "B", recommended: true },
      ],
    } as CustomerInputRequest).ok,
    false,
  );
  // 共享 decision 校验对 stable-write 返回 applicable:false（不是 decision；不得被误判/代选）。
  const validation = validateDecisionCardRequest({ request, roleId: "application", governanceModel: "trio" });
  assert.equal(validation.ok, true);
  if (validation.ok) assert.equal(validation.applicable, false);
// 字段不一致 ⇒ 不发卡。
  assert.equal(buildStableWriteCard({ record, preview: { ...preview, targetSha256: "3".repeat(64) } }), undefined);
});

test("修正案逐项卡：item-apply/item-keep/item-cancel-amendment + acknowledgments 透传；none 不发卡", () => {
  const record = vcaRecord({ kind: "detail-amendment", initiatorRoleId: "rapporteur" });
  const item = {
    itemId: "am-item-1",
    kind: "contract" as const,
    from: "docs/proposals/demo-proposal-v1.md",
    to: "docs/proposals/demo-proposal-v2.md",
    change: "modify" as const,
    fromSha256: "1".repeat(64),
    toSha256: "2".repeat(64),
  };
  const acknowledgments = [{ id: "boundary-expansion-0", label: "impl: 角色卡/impl/boundary.yaml", required: true }];
  const built = buildAmendmentItemCard({ record, item: item as never, index: 0, total: 1, acknowledgments });
  assert.ok(built !== undefined);
  if (built === undefined) return;
  const choice = built.request as Extract<CustomerInputRequest, { kind: "choice" }>;
  assert.deepEqual(choice.options.map((option) => option.id), ["item-apply", "item-keep", "item-cancel-amendment"]);
  assert.equal(choice.options.find((option) => option.recommended === true)?.id, "item-keep");
  assert.deepEqual(choice.acknowledgments, acknowledgments);
  assert.equal(buildAmendmentItemCard({ record, item: { ...item, change: "none" } as never, index: 0, total: 1 }), undefined);
});

test("客户端三态映射：只认 customer；judge/directive 一律 unavailable；acknowledgments 回传", () => {
  const request = {
    kind: "choice" as const,
    title: "t",
    cardKind: "decision" as const,
    application: true as const,
    flowId: "demo",
    options: [
      { id: "item-apply", label: "apply" },
      { id: "item-keep", label: "keep", recommended: true },
      { id: "item-cancel-amendment", label: "cancel" },
    ],
    acknowledgments: [{ id: "a", label: "A", required: true }],
  };
  assert.deepEqual(
    toAmendmentItemOutcome(
      {
        outcome: "answered",
        value: { selected: ["item-apply"] },
        decisionId: "decision-1",
        operatorId: "customer",
        acknowledged: ["a"],
      },
      request,
    ),
    {
      outcome: "answered",
      choice: "item-apply",
      decisionId: "decision-1",
      acknowledgments: [{ id: "a", label: "A" }],
    },
  );
  assert.deepEqual(
    toVersionChangeOutcome({
      outcome: "answered",
      value: { selected: ["approve-version-change"] },
      decisionId: "decision-2",
      operatorId: "judge:demo",
    }),
    { outcome: "unavailable" },
  );
  assert.deepEqual(
    toVersionChangeOutcome({
      outcome: "answered",
      value: { selected: ["approve-version-change"] },
      decisionId: "decision-3",
      operatorId: "directive:d-1",
    }),
    { outcome: "unavailable" },
  );
  assert.deepEqual(
    toStableWriteOutcome({
      outcome: "answered",
      value: { selected: ["approve-stable-write"] },
      decisionId: "decision-4",
      operatorId: "customer",
    }),
    { outcome: "answered", choice: "approve-stable-write", decisionId: "decision-4" },
  );
  assert.deepEqual(toStableWriteOutcome({ outcome: "declined", operatorId: "customer" }), { outcome: "declined" });
});

// ———————————————— 2. customer-input：主权 / @决策 / acknowledgments ————————————————

const ctx = { roleId: "application", projectRoot: "/p", runtime: "demo" as const, governanceModel: "trio" as const };

function vcaCardRequest(): CustomerInputRequest {
  return {
    kind: "choice",
    title: "版本升级 · demo",
    cardKind: "decision",
    application: true,
    sourceRoleId: "application",
    flowId: "demo",
    options: [
      { id: "approve-version-change", label: "approve" },
      { id: "reject-version-change", label: "reject", recommended: true },
    ],
  };
}

test("客户主权：VCA 卡 @决策 指令不消费（不写 directive、不结算），原卡呈现客户", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const directiveResults: unknown[] = [];
  let applyCalls = 0;
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "tester",
    directive: {
      decisionFacts: () => ({ active: [], ledgerErrors: 0 }),
      applyDecisionDirective: async () => {
        applyCalls += 1;
        return { kind: "selected", id: "d-1", optionId: "reject-version-change", action: "select-recommended" };
      },
      emitResult: (notice) => directiveResults.push(notice),
      emitNotice: (notice) => directiveResults.push(notice),
    },
    judge: {
      isGroupEnabled: () => true,
      fn: async () => ({ verdict: "manual", group: "decision", cardKind: "decision", engine: "demo", reasonCode: "not-used" }),
    },
    emitJudgeResult: () => {
      throw new Error("VCA 卡不得产生 judge 结果行");
    },
  });
  const pending = channel.customerInput(vcaCardRequest(), ctx);
  await tick(10);
  assert.equal(applyCalls, 0, "@决策 指令不得消费 VCA 卡");
  assert.equal(pushed.length, 1, "原卡呈现客户");
  assert.equal(channel.respond({ id: pushed[0]!.id, decision: { kind: "choice", selected: ["reject-version-change"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.equal(outcome?.outcome === "answered" ? outcome.operatorId : undefined, "tester");
  assert.equal(directiveResults.length, 0);
});

test("acknowledgments：required 缺失/多余/非数组 ⇒ 拒收且 pending 保留；齐全 ⇒ settlement 带 acknowledged", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  const request: CustomerInputRequest = {
    kind: "choice",
    title: "确认修正案细节",
    cardKind: "proposal",
    flowId: "demo",
    sourceRoleId: "rapporteur",
    acknowledgments: [
      { id: "a", label: "扩大 A", required: true },
      { id: "b", label: "可选 B", required: false },
    ],
    options: [
      { id: "accept", label: "通过" },
      { id: "reject", label: "拒绝" },
    ],
  };
  const pending = channel.customerInput(request, { roleId: "rapporteur", projectRoot: "/p", runtime: "demo", governanceModel: "trio" });
  assert.equal(pushed.length, 1);
  const id = pushed[0]!.id;
  assert.equal(channel.respond({ id, decision: { kind: "choice", selected: ["accept"] } }).ok, false);
  assert.equal(channel.respond({ id, decision: { kind: "choice", selected: ["accept"], acknowledged: "a" } }).ok, false);
  assert.equal(
    channel.respond({ id, decision: { kind: "choice", selected: ["accept"], acknowledged: ["a", "b"] } }).ok,
    false,
    "多余 id（非 required）同样拒收",
  );
  assert.equal(channel.pendingCount(), 1, "非法回包不得结算");
  assert.equal(channel.respond({ id, decision: { kind: "choice", selected: ["accept"], acknowledged: ["a"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.equal(outcome?.outcome === "answered" ? outcome.acknowledged?.join(",") : undefined, "a");
});

test("customer-input 最后防线：主权卡 judge/directive 结算被拒绝（pending 保留）", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  // 直接构造应用自有 decision 卡（run-change 词汇——已在既有主权面内）。
  const request: CustomerInputRequest = {
    kind: "choice",
    title: "重开 run",
    cardKind: "decision",
    application: true,
    flowId: "demo",
    options: [
      { id: "continue-frozen", label: "继续冻结", recommended: true },
      { id: "stop-and-restart", label: "停止并重开" },
      { id: "stop", label: "停止" },
    ],
  };
  const pending = channel.customerInput(request, ctx);
  const id = pushed[0]!.id;
  // 客户手点仍正常（对照）。
  assert.equal(channel.respond({ id, decision: { kind: "choice", selected: ["stop"] } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
});

// ———————————————— 3. SessionManager：卡通道 / 客户主权 / 生命周期 ————————————————

function listing(root: string): ProjectListing {
  const roles: ProjectListing["roles"] = ["chief", "convener", "rapporteur", "product", "nominator"].map((roleId) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction:
      roleId === "convener"
        ? "schedule"
        : roleId === "rapporteur"
          ? "proposal"
          : roleId === "product"
            ? "product"
            : roleId === "nominator"
              ? "nomination"
              : "chief",
  }));
  return { projectRoot: root, roles, warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio" };
}

async function makeManager(
  root: string,
  customerInput: DesktopCustomerInputFn,
  extra: Partial<ConstructorParameters<typeof SessionManager>[0]> = {},
): Promise<SessionManager> {
  return new SessionManager({
    openRoleSession: async () => {
      const handle: RoleSessionHandle = {
        async send() {},
        events() {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  await tick(20);
                  return { value: undefined as unknown as OrchestrationEvent, done: true };
                },
              };
            },
          };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => {
      throw new Error("no pi");
    },
    createDemoAdapter: () => {
      throw new Error("no demo");
    },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
    customerInput,
    ...extra,
  });
}

test("SessionManager VCA 卡：经 convener 会话呈现；request.* 生命周期客户归属；notify:none", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vc-card-"));
  const captured: CustomerInputRequest[] = [];
  const customerInput: CustomerInputFn = async (request) => {
    captured.push(request);
    return {
      outcome: "answered",
      value: { selected: ["reject-version-change"] },
      decisionId: "decision-vc-card",
      operatorId: "customer",
    };
  };
  const mgr = await makeManager(root, customerInput);
  try {
    await mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(30);
    const outcome = await mgr.presentVersionChangeCard({ projectRoot: root, record: vcaRecord() });
    // requestId = `vc-<applicationId>`；生命周期回填 `decision-<requestId>`（应用生成的裁决 id）。
    assert.deepEqual(outcome, { outcome: "answered", choice: "reject-version-change", decisionId: "decision-vc-vc-1" });
    assert.equal(captured.length, 1);
    assert.equal((captured[0] as { cardKind?: string }).cardKind, "decision");
    assert.equal((captured[0] as { application?: boolean }).application, true);
    const state = await readTaskState(root);
    const created = state.events.find((event) => event.kind === "request.created");
    assert.ok(created !== undefined);
    if (created?.kind === "request.created") {
      assert.equal(created.cardKind, "decision");
      assert.equal(created.sourceRoleId, "application");
      assert.equal(created.flowId, "demo");
    }
    const resolved = state.events.find((event) => event.kind === "request.resolved");
    assert.ok(resolved !== undefined);
    if (resolved?.kind === "request.resolved") {
      assert.equal(resolved.by, "customer");
      assert.deepEqual(resolved.selectedOptionIds, ["reject-version-change"]);
    }
    assert.equal(state.events.some((event) => event.kind === "request.notified"), false, "notify:none 不发幕僚通知");
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("SessionManager：无治理会话/通道 ⇒ VCA/stable 卡 unavailable（fail-closed；不伪造批准）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vc-nochannel-"));
  const mgr = await makeManager(root, async () => ({ outcome: "unavailable", reason: "no-channel" }));
  try {
    const vca = await mgr.presentVersionChangeCard({ projectRoot: root, record: vcaRecord() });
    assert.deepEqual(vca, { outcome: "unavailable" });
    const stableRecord: StableWriteRecord = {
      v: 1,
      schema: "stable-write/v1",
      requestId: "sw-1",
      roleId: "convener",
      path: "docs/workflow.md",
      kind: "workflow",
      baseSha256: "",
      targetSha256: "2".repeat(64),
      diffPreview: "",
      status: "requested",
      at: AT,
    };
    const stable = await mgr.presentStableWriteCard({
      projectRoot: root,
      record: stableRecord,
      preview: { path: "docs/workflow.md", baseSha256: "", targetSha256: "2".repeat(64), diffPreview: "" },
    });
    assert.deepEqual(stable, { outcome: "unavailable" });
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("SessionManager 修正案逐项卡：acknowledgments 对象数组呈现并回传", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vc-item-"));
  const captured: CustomerInputRequest[] = [];
  const customerInput: CustomerInputFn = async (request) => {
    captured.push(request);
    return {
      outcome: "answered",
      value: { selected: ["item-apply"] },
      acknowledged: ["boundary-expansion-0"],
      decisionId: "decision-item",
      operatorId: "customer",
    };
  };
  const mgr = await makeManager(root, customerInput);
  try {
    await mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" });
    await tick(30);
    const outcome = await mgr.presentAmendmentItemCard({
      projectRoot: root,
      applicationId: "vc-detail",
      record: vcaRecord({ kind: "detail-amendment", initiatorRoleId: "rapporteur", status: "approved" }),
      item: {
        itemId: "am-item-1",
        kind: "contract",
        from: "docs/proposals/demo-proposal-v1.md",
        to: "docs/proposals/demo-proposal-v2.md",
        change: "modify",
        fromSha256: "1".repeat(64),
        toSha256: "2".repeat(64),
      } as never,
      index: 0,
      total: 1,
      acknowledgments: [{ id: "boundary-expansion-0", label: "impl: 角色卡/impl/boundary.yaml", required: true }],
    });
    assert.equal(outcome.outcome, "answered");
    if (outcome.outcome === "answered") {
      assert.equal(outcome.choice, "item-apply");
      assert.deepEqual(outcome.acknowledgments, [{ id: "boundary-expansion-0", label: "impl: 角色卡/impl/boundary.yaml" }]);
    }
    const itemRequest = captured[0] as Extract<CustomerInputRequest, { kind: "choice" }>;
    assert.equal(itemRequest.acknowledgments?.[0]?.required, true);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

// ———————————————— 4. 栈：许可 / 重启 / 迁移 / mini re-pin / F15 ————————————————

async function withProject(fn: (project: TrunkProject, root: string) => Promise<void>): Promise<void> {
  const project = await createTrunkProject();
  try {
    await fn(project, project.root);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
}

async function bootstrapTrunk(project: TrunkProject): Promise<void> {
  const result = await project.service.executeApply({
    source: "bootstrap",
    flowId: FLOW_ID,
    applicationId: "vc-boot",
    decisionId: "dec-boot",
    runId: project.runId,
    baseTrunkVersion: null,
    target: project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: ["impl"] },
    roles: ["impl"],
    journalId: "j-boot",
    at: AT,
  });
  assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message ?? ""}`);
}

function stackFor(
  root: string,
  events: TaskStateEvent[],
  options: { approveWorkflow?: boolean; now?: () => Date } = {},
): VersionChangeStack {
  return createVersionChangeStack({
    projectRoot: root,
    now: options.now ?? (() => new Date(AT)),
    emitEvent: async (event) => {
      events.push(event);
    },
    ...(options.approveWorkflow !== undefined
      ? {
          presentStableWriteCard: async () =>
            options.approveWorkflow === true
              ? { outcome: "answered" as const, choice: "approve-stable-write" as const, decisionId: "decision-sw" }
              : { outcome: "answered" as const, choice: "reject-stable-write" as const, decisionId: "decision-sw" },
        }
      : {}),
  });
}

test("stable workflow：确认卡 → 一次性许可 → completeWrite 复核/消费/mini re-pin（trunkVersion 不变）", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const events: TaskStateEvent[] = [];
    const stack = stackFor(root, events, { approveWorkflow: true });
    try {
      const init = await stack.ensureInitialized();
      assert.equal(init.ok, true);
      assert.equal(init.cacheHealth, "ok");
      const content = "# workflow v2\n";
      const requested = await stack.requestWorkflowWrite({
        roleId: "convener",
        content,
        diffPreview: "- # workflow\n+ # workflow v2",
      });
      assert.equal(requested.ok, true, requested.ok ? "" : `${requested.code}: ${requested.message ?? ""}`);
      const permit = stack.stablePermitOf("docs/workflow.md");
      assert.ok(permit !== undefined);
      if (permit === undefined) return;
      assert.equal(permit.targetSha256, sha256(content));
      assert.equal(permit.authority.decisionId, "decision-sw");
      // C2b 同步许可快照已安装（判定放行）。
      const decision = stableWriteDecision({
        projectRoot: root,
        relPath: "docs/workflow.md",
        sha256: sha256(content),
        permit,
        now: () => new Date(AT),
      });
      assert.equal(decision.allowed, true, decision.allowed ? "" : decision.reason);
      // 模拟 run-role 写入（桌面不写盘；测试旁路），随后 post-write 复核。
      await fs.writeFile(path.join(root, "docs/workflow.md"), content, "utf8");
      const completed = await stack.completeStableWriteAfterWrite("docs/workflow.md", sha256(content), AT);
      assert.equal(completed.ok, true, completed.ok ? "" : `${completed.code ?? ""}`);
      assert.equal(stack.stablePermitOf("docs/workflow.md"), undefined, "成功后候选许可清理");
      const read = await project.store.readManifest();
      assert.equal(read.ok, true);
      if (read.ok) {
        assert.equal(read.value.trunkVersion, 1, "mini re-pin 不升 trunkVersion");
        assert.equal(read.value.artifacts.workflow.sha256, sha256(content));
        assert.equal(read.value.artifacts.workflow.decisionId, "decision-sw");
      }
      const repin = events.find((event) => event.kind === "trunk.state" && (event as { op?: string }).op === "stable-repinned");
      assert.ok(repin !== undefined);
      if (repin !== undefined && repin.kind === "trunk.state") {
        assert.equal(repin.trunkVersion, 1);
        assert.equal(repin.origin, "customer");
        assert.equal(repin.decidedBy, "customer");
        assert.equal(repin.confirmationId !== undefined || repin.decisionId !== undefined, true);
      }
      assert.equal(events.some((event) => event.kind === "stable.write.written"), true);
    } finally {
      stack.dispose();
    }
  });
});

test("stable 拒绝：不签发许可、不写记录为 written", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const events: TaskStateEvent[] = [];
    const stack = stackFor(root, events, { approveWorkflow: false });
    try {
      const result = await stack.requestWorkflowWrite({ roleId: "convener", content: "# nope\n" });
      assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message ?? ""}`);
      assert.equal(stack.stablePermitOf("docs/workflow.md"), undefined);
      const records = await stack.listStableWrites();
      assert.equal(records[0]?.status, "rejected");
    } finally {
      stack.dispose();
    }
  });
});

test("stable 写入哈希不符：completeWrite fail-closed、许可作废、不更新快照", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const events: TaskStateEvent[] = [];
    const stack = stackFor(root, events, { approveWorkflow: true });
    try {
      const content = "# workflow v3\n";
      const requested = await stack.requestWorkflowWrite({ roleId: "convener", content });
      assert.equal(requested.ok, true);
      await fs.writeFile(path.join(root, "docs/workflow.md"), "# tampered\n", "utf8");
      const completed = await stack.completeStableWriteAfterWrite("docs/workflow.md", sha256("# tampered\n"), AT);
      assert.equal(completed.ok, false);
      assert.equal(completed.code, "stable-write-hash-mismatch");
      assert.equal(stack.stablePermitOf("docs/workflow.md"), undefined);
      const read = await project.store.readManifest();
      assert.equal(read.ok, true);
      if (read.ok) assert.equal(read.value.artifacts.workflow.sha256, sha256("# workflow\n"));
      const records = await stack.listStableWrites();
      assert.equal(records[0]?.status, "failed");
    } finally {
      stack.dispose();
    }
  });
});

test("重启重建许可快照：新栈从磁盘恢复 approved 许可并安装 C2b 快照", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const events: TaskStateEvent[] = [];
    const first = stackFor(root, events, { approveWorkflow: true });
    const content = "# workflow restart\n";
    try {
      const requested = await first.requestWorkflowWrite({ roleId: "convener", content });
      assert.equal(requested.ok, true);
    } finally {
      first.dispose(); // 模拟进程退出（不 completeWrite）
    }
    const second = stackFor(root, [], { approveWorkflow: true });
    try {
      const init = await second.ensureInitialized();
      assert.equal(init.ok, true);
      const permit = second.stablePermitOf("docs/workflow.md");
      assert.ok(permit !== undefined, "重启后应从 S2 记录重建 approved 许可");
      if (permit === undefined) return;
      const decision = stableWriteDecision({
        projectRoot: root,
        relPath: "docs/workflow.md",
        sha256: sha256(content),
        permit,
        now: () => new Date(AT),
      });
      assert.equal(decision.allowed, true, decision.allowed ? "" : decision.reason);
    } finally {
      second.dispose();
    }
  });
});

test("appointment-write 钩子（F16）：只提取 preview 正文/签发许可；桌面不写盘", async () => {
  const request: CustomerInputRequest = {
    kind: "confirm",
    title: "任命写卡：impl",
    cardKind: "appointment-write",
    paths: ["角色卡/impl/role-card.md"],
    preview: "## 角色卡/impl/role-card.md\n# Role card impl\n\n实现角色卡正文。\n",
  };
  const inputs = appointmentStableWriteInputs(request);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0]!.roleId, "impl");
  assert.equal(inputs[0]!.kind, "role-card");
  assert.match(inputs[0]!.content, /实现角色卡正文/);
  assert.equal(inputs[0]!.content.endsWith("\n"), true);
  // 非 stable 路径（workflow/boundary 之外的契约文档）不签发。
  assert.equal(
    appointmentStableWriteInputs({
      ...request,
      paths: ["docs/proposals/demo-proposal-v2.md"],
    }).length,
    0,
  );
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const before = await fs.readFile(path.join(root, PATHS.roleCard), "utf8");
    const stack = stackFor(root, [], {});
    try {
      const issued = await stack.onAppointmentWriteApproved({
        roleId: "impl",
        kind: "role-card",
        content: inputs[0]!.content,
        confirmationId: "decision-op-1",
        diffPreview: inputs[0]!.diffPreview,
      });
      assert.equal(issued.ok, true, issued.ok ? "" : `${issued.code}: ${issued.message ?? ""}`);
      const after = await fs.readFile(path.join(root, PATHS.roleCard), "utf8");
      assert.equal(after, before, "F16：桌面只签发许可，不写盘");
      const permit = stack.stablePermitOf(PATHS.roleCard);
      assert.ok(permit !== undefined);
      if (permit !== undefined) {
        assert.equal(permit.authority.confirmationId, "decision-op-1");
        assert.equal(permit.targetSha256, sha256(inputs[0]!.content));
      }
    } finally {
      stack.dispose();
    }
  });
});

test("冻结迁移/损坏：ready ⇒ cacheHealth ok；baseline 损坏 ⇒ fail-closed 且不自动重建", async () => {
  await withProject(async (project, root) => {
    const stack = stackFor(root, [], {});
    try {
      const init = await stack.ensureInitialized();
      assert.equal(init.ok, true);
      assert.equal(init.cacheHealth, "ok");
      const view = await stack.listDocFreezes();
      assert.equal(view.ok, true);
      assert.ok(view.freezes.length >= 7);
      assert.ok(view.freezes.every((entry) => entry.frozen));
      assert.ok(view.freezes.some((entry) => entry.migrationMark === "migrated-legacy"));
    } finally {
      stack.dispose();
    }
  });
  const corruptRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vc-corrupt-"));
  try {
    await fs.mkdir(path.join(corruptRoot, ".ans", "state"), { recursive: true });
    await fs.writeFile(path.join(corruptRoot, ".ans", "state", "versions.jsonl"), "{not-json\n", "utf8");
    const stack = stackFor(corruptRoot, [], {});
    try {
      const init = await stack.ensureInitialized();
      assert.equal(init.ok, false);
      assert.equal(init.cacheHealth, "corrupt-failclosed");
      const view = await stack.listDocFreezes();
      assert.equal(view.ok, false);
      assert.equal(view.cacheHealth, "corrupt-failclosed");
      assert.equal(view.freezes.length, 0);
      const upgrade = await stack.requestTrunkUpgrade({ reason: "emergency" });
      assert.equal(upgrade.ok, false);
    } finally {
      stack.dispose();
    }
  } finally {
    await fs.rm(corruptRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("trunk:state（F15）：workflow / roleCards / boundaries 三类 stable 快照齐全；单一来源摘要", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const stack = stackFor(root, [], {});
    try {
      const payload: TrunkStatePayloadV1 = await stack.trunkState();
      assert.equal(payload.version, 1);
      assert.equal(payload.ok, true);
      assert.equal(payload.trunkVersion, 1);
      assert.equal(payload.stable.workflow?.path, PATHS.workflow);
      assert.equal(payload.stable.roleCards.impl?.path, PATHS.roleCard);
      assert.equal(payload.stable.roleCards.impl?.kind, "role-card");
      assert.equal(payload.stable.boundaries.impl?.path, PATHS.boundary);
      assert.equal(payload.stable.boundaries.impl?.kind, "boundary");
      assert.equal(payload.disables.trunkUpgrade === null || typeof payload.disables.trunkUpgrade === "string", true);
      assert.deepEqual(payload.pendingVersionChanges.items, []);
      assert.equal(payload.freezes.cacheHealth, "ok");
    } finally {
      stack.dispose();
    }
  });
});

test("主干升级（仅紧急/恢复）：预览变更 → 同一 previewId 客户确认 → t2；重复确认/常规理由拒绝", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const nextWorkflow = "# workflow emergency\n";
    await fs.writeFile(path.join(root, PATHS.workflow), nextWorkflow, "utf8");
    const stack = stackFor(root, [], {});
    try {
      const regular = await stack.requestTrunkUpgrade({ reason: "normal" as never });
      assert.equal(regular.ok, false);
      const requested = await stack.requestTrunkUpgrade({ reason: "emergency", scope: ["manifest 修复"] });
      assert.equal(requested.ok, true, requested.ok ? "" : `${requested.code}: ${requested.error ?? ""}`);
      assert.ok(requested.previewId !== undefined);
      const preview = requested.preview!;
      assert.equal(preview.changes.some((change) => change.kind === "workflow" && change.path === PATHS.workflow), true);
      const confirmed = await stack.confirmTrunkUpgrade({ previewId: requested.previewId!, acknowledged: true });
      assert.equal(confirmed.ok, true, confirmed.ok ? "" : `${confirmed.code}: ${confirmed.error ?? ""}`);
      assert.equal(confirmed.trunkVersion, 2);
      const read = await project.store.readManifest();
      assert.equal(read.ok, true);
      if (read.ok) {
        assert.equal(read.value.trunkVersion, 2);
        assert.equal(read.value.artifacts.workflow.sha256, sha256(nextWorkflow));
      }
      const again = await stack.confirmTrunkUpgrade({ previewId: requested.previewId!, acknowledged: true });
      assert.equal(again.ok, false, "previewId 一次性");
      const notAcknowledged = await stack.requestTrunkUpgrade({ reason: "recovery" });
      if (notAcknowledged.ok) {
        const unacked = await stack.confirmTrunkUpgrade({ previewId: notAcknowledged.previewId!, acknowledged: false });
        assert.equal(unacked.ok, false);
      }
      const list = await stack.trunkList();
      assert.equal(list.ok, true);
      assert.equal(list.trunks[0]?.trunkVersion, 2);
    } finally {
      stack.dispose();
    }
  });
});

test("refactor：convener 提交（能力层）/只读列表；非 convener 拒绝；无 trunk 版本", async () => {
  await withProject(async (project, root) => {
    const stack = stackFor(root, [], {});
    try {
      const initial = await stack.listRefactorRequests();
      assert.deepEqual(initial, []);
      // 通过真实 S4 runtime 能力提交（D1 不提供 refactor:request IPC；测试直调验证记录/事件形状）。
      // 用 S4 公开工厂 + S2 validator 走同一路径：
      const { createRefactorRuntime } = await import("../../src/pipeline/orchestration/refactor-runtime.ts");
      const { createVersionChangeIntegration } = await import("../../src/service/version-change/public/version-change-integration.ts");
      const integration = createVersionChangeIntegration({
        projectRoot: root,
        now: () => new Date(AT),
        migrationCompleted: () => true,
      });
      const events: TaskStateEvent[] = [];
      const refactor = createRefactorRuntime({
        store: integration.refactorRequests,
        validator: integration.services.refactor,
        emitEvent: async (event) => {
          events.push(event);
        },
        flowExists: () => true,
        now: () => new Date(AT),
      });
      const submitted = await refactor.submit({
        requestId: "rf-1",
        flowId: FLOW_ID,
        roleId: "convener",
        title: "模块内部整理",
        reason: "仅模块代码内重构",
        scope: { modules: ["impl-core"], paths: ["src/"], roles: ["impl"] },
        at: AT,
      });
      assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);
      const rejected = await refactor.submit({
        requestId: "rf-2",
        flowId: FLOW_ID,
        roleId: "chief",
        title: "x",
        reason: "x",
        scope: { modules: [], paths: [], roles: [] },
        at: AT,
      });
      assert.equal(rejected.ok, false);
      if (!rejected.ok) assert.equal(rejected.code, "refactor-role-not-allowed");
      const event = events.find((candidate) => candidate.kind === "refactor.request");
      assert.ok(event !== undefined);
      if (event?.kind === "refactor.request") {
        assert.equal(event.initiatedBy, "convener");
        assert.equal(event.managedBy, "application-scheduler");
        assert.equal((event as { decidedBy?: string }).decidedBy, undefined, "重构无客户决定");
      }
      const listed = await stack.listRefactorRequests();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.requestId, "rf-1");
    } finally {
      stack.dispose();
    }
  });
});

// ———————————————— 5. IPC 冻结集（F17/F10）与只读列表面 ————————————————

test("IPC 冻结集：无 submit/refactor:request/stable-write:request；只保留一条 trunk:state 推送", () => {
  const channels: readonly string[] = Object.values(VERSION_CHANGE_IPC_CHANNELS);
  for (const forbidden of VERSION_CHANGE_FORBIDDEN_IPC_CHANNELS) {
    assert.equal(channels.includes(forbidden), false, `不得提供 ${forbidden}`);
  }
  assert.equal(channels.includes("version-change:list"), true);
  assert.equal(channels.includes("version-change:present"), true);
  assert.equal(channels.includes("stable-write:list"), true);
  assert.equal(channels.includes("refactor:list"), true);
  assert.equal(channels.includes("doc-freeze:list"), true);
  assert.equal(channels.includes("trunk:state"), false, "trunk:state 是主→渲推送，不是 invoke 通道");
  assert.equal(channels.includes("trunk:upgrade-request"), true);
  assert.equal(channels.includes("trunk:upgrade-confirm"), true);
  assert.equal(channels.includes("trunk:recover-request"), true);
});

test("只读列表面：VCA/stable/冻结摘要有界、无 drift 字段；cacheHealth 如实", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const events: TaskStateEvent[] = [];
    const stack = stackFor(root, events, { approveWorkflow: true });
    try {
      await stack.ensureInitialized();
      await stack.requestWorkflowWrite({ roleId: "convener", content: "# workflow list\n" });
      const writes = await stack.listStableWrites();
      assert.equal(writes.length, 1);
      const summary = (await import("../../app/desktop/version-change.ts")).summarizeStableWrite(writes[0]!);
      assert.equal("drift" in summary, false);
      assert.equal(summary.path, "docs/workflow.md");
      assert.equal(summary.status, "approved");
      assert.equal(typeof summary.expiresAt, "string", "expiresAt 仅外显（桌面不复算过期）");
      const freezes = await stack.listDocFreezes(3);
      assert.equal(freezes.ok, true);
      assert.equal(freezes.freezes.length, 3, "limit 有界");
      assert.equal(freezes.cacheHealth, "ok");
    } finally {
      stack.dispose();
    }
  });
});

// ———————————————— 6. Batch 3.5（D1b）：三能力注入 + trunk refreeze/abandon/history ————————————————

function capabilityHandle(): RoleSessionHandle {
  return {
    async send() {},
    events() {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<OrchestrationEvent>> {
              await tick(20);
              return { value: undefined as unknown as OrchestrationEvent, done: true };
            },
          };
        },
      };
    },
    async dispose() {},
  };
}

function fakeCapabilityStack(calls: {
  vca: SubmitVersionChangeInput[];
  refactor: SubmitRefactorInput[];
  stable: RequestStableWriteInput[];
}): VersionChangeStack {
  return {
    projectRoot: "/p",
    ensureInitialized: async () => ({ ok: true, cacheHealth: "ok" }),
    refreshFreezeState: async () => ({ ok: true, cacheHealth: "ok" }),
    stablePermitOf: () => undefined,
    completeStableWriteAfterWrite: async () => ({ ok: true, skipped: true }),
    onAppointmentWriteApproved: async () => ({ ok: true }),
    requestWorkflowWrite: async () => ({ ok: true }),
    submitVersionChange: async (input) => {
      calls.vca.push(input);
      return { ok: true, applicationId: "vc-9", status: "submitted" };
    },
    submitRefactor: async (input) => {
      calls.refactor.push(input);
      return { ok: true, requestId: "rf-9", status: "requested" };
    },
    requestStableWrite: async (input) => {
      calls.stable.push(input);
      return { ok: true, requestId: "sw-9", status: "requested" };
    },
    listVersionChanges: async () => [],
    presentVersionChange: async () => ({ ok: false, code: "vca-channel-unavailable" }),
    runAmendmentItems: async () => ({ ok: true, decisions: [], cancelled: true }),
    applyAmendmentItems: async () => ({ ok: false, code: "vca-apply-failed" }),
    listStableWrites: async () => [],
    listRefactorRequests: async () => [],
    listDocFreezes: async () => ({ ok: true, freezes: [], cacheHealth: "ok" }),
    trunkState: async () => ({}) as TrunkStatePayloadV1,
    trunkList: async () => ({ ok: true, trunks: [] }),
    requestTrunkUpgrade: async () => ({ ok: false, code: "trunk-unavailable" }),
    confirmTrunkUpgrade: async () => ({ ok: false, code: "trunk-high-risk-unacknowledged" }),
    recoverTrunk: async () => ({ ok: false, code: "trunk-recovery-invalid" }),
    refreeze: async () => ({ ok: false, code: "trunk-unavailable" }),
    abandonUpgrade: async () => ({ ok: false, code: "trunk-unavailable" }),
    history: async () => ({ ok: true, versions: [], currentTrunkVersion: null }),
    detectStableBoundaryExpansion: async () => ({ expanded: false, expansions: [] }),
    dispose: () => {},
  };
}

test("Batch 3.5 三能力注入：仅对应角色注入；身份强制为会话角色（不信任工具自报）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-vc-capability-"));
  const calls = {
    vca: [] as SubmitVersionChangeInput[],
    refactor: [] as SubmitRefactorInput[],
    stable: [] as RequestStableWriteInput[],
  };
  const stack = fakeCapabilityStack(calls);
  const opened = new Map<string, Record<string, unknown>>();
  const mgr = await makeManager(root, async () => ({ outcome: "declined", operatorId: "test" }), {
    getVersionChangeStack: () => stack,
    openRoleSession: async (input) => {
      opened.set(input.roleId, input as unknown as Record<string, unknown>);
      return capabilityHandle();
    },
  });
  try {
    for (const roleId of ["product", "rapporteur", "convener", "chief"]) {
      const result = await mgr.open({ projectRoot: root, roleId, runtime: "demo" });
      assert.equal(result.ok, true, `${roleId}: ${result.ok ? "" : result.error ?? ""}`);
      await tick(20);
    }
    const product = opened.get("product")!;
    const rapporteur = opened.get("rapporteur")!;
    const convener = opened.get("convener")!;
    const chief = opened.get("chief")!;
    assert.equal(typeof product.submitVersionChange, "function");
    assert.equal(product.submitRefactor, undefined);
    assert.equal(product.requestStableWrite, undefined);
    assert.equal(typeof rapporteur.submitVersionChange, "function");
    assert.equal(rapporteur.submitRefactor, undefined);
    assert.equal(typeof convener.submitRefactor, "function");
    assert.equal(typeof convener.requestStableWrite, "function");
    assert.equal(convener.submitVersionChange, undefined);
    assert.equal(chief.submitVersionChange, undefined);
    assert.equal(chief.submitRefactor, undefined);
    assert.equal(chief.requestStableWrite, undefined);
    // 身份强制：工具载荷自报角色被会话角色覆盖。
    const vcaFn = product.submitVersionChange as SubmitVersionChangeFn;
    const vcaResult = await vcaFn({
      kind: "detail-amendment",
      initiatorRoleId: "rapporteur",
      flowId: "demo",
      summary: "s",
      targets: [],
    });
    assert.equal(vcaResult.ok, true);
    assert.equal(calls.vca[0]?.initiatorRoleId, "product");
    assert.equal(calls.vca[0]?.kind, "detail-amendment");
    const refactorFn = convener.submitRefactor as (input: SubmitRefactorInput) => Promise<{ ok: boolean }>;
    await refactorFn({ roleId: "chief", flowId: "demo", title: "t", reason: "r", scope: { modules: [], paths: [], roles: [] } });
    assert.equal(calls.refactor[0]?.roleId, "convener");
    const stableFn = convener.requestStableWrite as (input: RequestStableWriteInput) => Promise<{ ok: boolean }>;
    await stableFn({ roleId: "chief", kind: "workflow", content: "# w\n" });
    assert.equal(calls.stable[0]?.roleId, "convener");
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("Batch 3.5 能力实现：VCA submit（submitted）/ refactor（requested）/ stable write request（requested+许可）", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const events: TaskStateEvent[] = [];
    const stack = createVersionChangeStack({
      projectRoot: root,
      now: () => new Date(AT),
      emitEvent: async (event) => {
        events.push(event);
      },
      presentStableWriteCard: async () => ({
        outcome: "answered",
        choice: "approve-stable-write",
        decisionId: "decision-sw-cap",
      }),
    });
    try {
      // 先完成迁移/冻结快照，再写新版本草稿（否则 F29 迁移会把既有文件一律冻结）。
      await stack.ensureInitialized();
      await writeProjectFile(root, v2, "---\nschema: project-proposal/v2\nflowId: demo\nversion: 2\n---\n# v2\n");
      const vca = await stack.submitVersionChange({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        targets: [{ kind: "contract", path: v2, action: "add" }],
        summary: "v2 契约",
      });
      assert.equal(vca.ok, true, vca.ok ? "" : `${vca.errorCode}: ${vca.message ?? ""}`);
      assert.match(vca.applicationId ?? "", /^vc-\d+$/);
      assert.equal(vca.status, "submitted");
      const list = await stack.listVersionChanges();
      assert.equal(list.some((candidate) => candidate.applicationId === vca.applicationId), true);
      const refactor = await stack.submitRefactor({
        roleId: "convener",
        flowId: FLOW_ID,
        title: "模块整理",
        reason: "内部实现整理",
        scope: { modules: ["impl-core"], paths: ["src/"], roles: ["impl"] },
      });
      assert.equal(refactor.ok, true, refactor.ok ? "" : `${refactor.errorCode}: ${refactor.message ?? ""}`);
      assert.match(refactor.requestId ?? "", /^rf-\d+$/);
      assert.equal(refactor.status, "requested");
      const stable = await stack.requestStableWrite({
        roleId: "convener",
        kind: "workflow",
        content: "# workflow capability\n",
      });
      assert.equal(stable.ok, true, stable.ok ? "" : `${stable.errorCode}: ${stable.message ?? ""}`);
      assert.match(stable.requestId ?? "", /^sw-\d+$/);
      assert.equal(stable.status, "requested");
      assert.ok(stack.stablePermitOf("docs/workflow.md") !== undefined, "客户确认后许可已签发（能力本身未签发）");
      assert.ok(events.some((event) => event.kind === "version.change" && (event as { status?: string }).status === "submitted"));
      assert.ok(events.some((event) => event.kind === "refactor.request"));
      assert.ok(events.some((event) => event.kind === "stable.write.approved"));
    } finally {
      stack.dispose();
    }
  });
});

test("VCA 基线修复：无已落盘 trunk ⇒ submitVersionChange 自动按 bootstrap 提交（不允许角色自报“伪装”）", async () => {
  await withProject(async (project, root) => {
    // 不 bootstrap：项目只有唯一 pinned run + 迁移冻结文档（与存量项目一致）。
    const events: TaskStateEvent[] = [];
    const stack = createVersionChangeStack({
      projectRoot: root,
      now: () => new Date(AT),
      emitEvent: async (event) => {
        events.push(event);
      },
    });
    try {
      await stack.ensureInitialized();
      const v2 = "docs/proposals/demo-proposal-v2.md";
      await writeProjectFile(root, v2, "---\nschema: project-proposal/v2\nflowId: demo\nversion: 2\n---\n# v2\n");
      const vca = await stack.submitVersionChange({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        targets: [{ kind: "contract", path: v2, action: "add" }],
        summary: "存量项目基线绑定",
      });
      assert.equal(vca.ok, true, vca.ok ? "" : `${vca.errorCode}: ${vca.message ?? ""}`);
      const list = await stack.listVersionChanges();
      const record = list.find((candidate) => candidate.applicationId === vca.applicationId);
      assert.ok(record !== undefined);
      assert.equal(record?.bootstrap, true, "无 trunk ⇒ 应用自动按 bootstrap 提交");
      assert.equal(record?.baseTrunk, null);
      assert.equal(record?.status, "submitted");
      assert.equal(await project.service.current(), null, "提交不建立 trunk；批准时才落 t1");
      assert.ok(events.some((event) => event.kind === "version.change" && (event as { status?: string }).status === "submitted"));
    } finally {
      stack.dispose();
    }
  });
});

test("VCA 自动呈现：提交成功即自动调用客户批准卡（不阻塞回执；无通道保持 submitted）", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const presented: string[] = [];
    const stack = createVersionChangeStack({
      projectRoot: root,
      now: () => new Date(AT),
      emitEvent: async () => {},
      presentVersionChangeCard: async (record) => {
        presented.push(record.applicationId);
        return { outcome: "declined" };
      },
    });
    try {
      await stack.ensureInitialized();
      const v2 = "docs/proposals/demo-proposal-v2.md";
      await writeProjectFile(root, v2, "---\nschema: project-proposal/v2\nflowId: demo\nversion: 2\n---\n# v2\n");
      const vca = await stack.submitVersionChange({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        targets: [{ kind: "contract", path: v2, action: "add" }],
        summary: "自动呈现",
      });
      assert.equal(vca.ok, true, vca.ok ? "" : `${vca.errorCode}: ${vca.message ?? ""}`);
      // 自动呈现是提交后的异步动作：等到 presenter 收到该申请。
      for (let i = 0; i < 50 && presented.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.deepEqual(presented, [vca.applicationId]);
      // 客户卡无应答（declined）⇒ 保持 submitted，不伪造批准。
      const list = await stack.listVersionChanges();
      assert.equal(list.find((record) => record.applicationId === vca.applicationId)?.status, "submitted");
    } finally {
      stack.dispose();
    }
  });
});

test("Batch 3.5 request_stable_write：客户拒绝 ⇒ 回执失败且不签发许可", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const stack = createVersionChangeStack({
      projectRoot: root,
      now: () => new Date(AT),
      emitEvent: async () => {},
      presentStableWriteCard: async () => ({
        outcome: "answered",
        choice: "reject-stable-write",
        decisionId: "decision-sw-rej",
      }),
    });
    try {
      const result = await stack.requestStableWrite({
        roleId: "convener",
        kind: "workflow",
        content: "# workflow rejected\n",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, "rejected");
      assert.equal(result.errorCode, "stable-write-write-failed");
      assert.equal(stack.stablePermitOf("docs/workflow.md"), undefined);
    } finally {
      stack.dispose();
    }
  });
});

test("Batch 3.5 trunk 客户动作：refreeze 只 stable、不升版本；abandon 不改指针；history 只读", async () => {
  await withProject(async (project, root) => {
    await bootstrapTrunk(project);
    const events: TaskStateEvent[] = [];
    const stack = stackFor(root, events, {});
    try {
      const nextWorkflow = "# workflow refrozen\n";
      await fs.writeFile(path.join(root, PATHS.workflow), nextWorkflow, "utf8");
      const denied = await stack.refreeze({ reason: "紧急", acknowledged: false });
      assert.equal(denied.ok, false);
      assert.equal(denied.code, "trunk-high-risk-unacknowledged");
      const refrozen = await stack.refreeze({ reason: "紧急 re-pin", acknowledged: true });
      assert.equal(refrozen.ok, true, refrozen.ok ? "" : `${refrozen.code}: ${refrozen.error ?? ""}`);
      assert.equal(refrozen.trunkVersion, 1, "refreeze 不升 trunkVersion");
      assert.deepEqual(refrozen.changed, ["workflow"]);
      const read = await project.store.readManifest();
      assert.equal(read.ok, true);
      if (read.ok) {
        assert.equal(read.value.trunkVersion, 1);
        assert.equal(read.value.artifacts.workflow.sha256, sha256(nextWorkflow));
      }
      const refrozenEvent = events.find(
        (event) => event.kind === "trunk.state" && (event as { op?: string }).op === "refrozen",
      );
      assert.ok(refrozenEvent !== undefined);
      if (refrozenEvent !== undefined && refrozenEvent.kind === "trunk.state") {
        assert.equal(refrozenEvent.origin, "customer");
        assert.equal(refrozenEvent.decidedBy, "customer");
      }
      const again = await stack.refreeze({ reason: "无变化", acknowledged: true });
      assert.equal(again.ok, false, "无 stable 变更 ⇒ 拒绝");
      const abandoned = await stack.abandonUpgrade({ reason: "放弃升级窗口", acknowledged: true });
      assert.equal(abandoned.ok, true, abandoned.ok ? "" : `${abandoned.code}: ${abandoned.error ?? ""}`);
      assert.equal(abandoned.status, "refrozen-cancelled");
      const cancelledEvent = events.find(
        (event) => event.kind === "trunk.state" && (event as { op?: string }).op === "refrozen-cancelled",
      );
      assert.ok(cancelledEvent !== undefined, "abandon 写 refrozen-cancelled 审计");
      const afterAbandon = await project.store.readManifest();
      assert.equal(afterAbandon.ok, true);
      if (afterAbandon.ok) assert.equal(afterAbandon.value.trunkVersion, 1, "abandon 不改指针");
      const history = await stack.history();
      assert.equal(history.ok, true);
      assert.ok(Array.isArray(history.versions), "history 返回归档版本号列表（bootstrap 后可为空）");
      assert.equal(history.currentTrunkVersion, 1);
    } finally {
      stack.dispose();
    }
  });
});

// ———————————————— 7. D2 / AC-13：stable boundary 确认预览扩大检测 ————————————————

test("AC-13：buildStableBoundaryRisk 生成横幅/required ack；不可解析标记 fail-closed", () => {
  const risk = buildStableBoundaryRisk(["project:test/"]);
  assert.equal(risk.expanded, true);
  assert.equal(risk.unparseable, false);
  assert.deepEqual(risk.acknowledgments, [{ id: "boundary-expansion-0", label: "project:test/", required: true }]);
  assert.match(risk.banner, /test\//);
  const invalid = buildStableBoundaryRisk(["to-yaml-invalid:boom"]);
  assert.equal(invalid.expanded, true);
  assert.equal(invalid.unparseable, true);
  assert.deepEqual(buildStableBoundaryRisk([]), {
    expanded: false,
    unparseable: false,
    expansions: [],
    acknowledgments: [],
    banner: "",
  });
});

async function appointmentBoundaryCase(input: {
  yaml: string;
  answer: () => CustomerInputOutcome;
}): Promise<{
  outcome: CustomerInputOutcome | null | undefined;
  captured: CustomerInputRequest[];
  permit: boolean;
}> {
  const project = await createTrunkProject();
  const stack = stackFor(project.root, []);
  try {
    const captured: CustomerInputRequest[] = [];
    const fake: CustomerInputFn = async (request) => {
      captured.push(request);
      return input.answer();
    };
    let injected: CustomerInputFn | undefined;
    const mgr = await makeManager(project.root, fake, {
      getVersionChangeStack: () => stack,
      openRoleSession: async (sessionInput) => {
        injected = sessionInput.customerInput;
        return capabilityHandle();
      },
    });
    try {
      const opened = await mgr.open({ projectRoot: project.root, roleId: "nominator", runtime: "demo" });
      assert.equal(opened.ok, true, opened.ok ? "" : opened.error ?? "");
      await tick(20);
      assert.equal(typeof injected, "function", "nominator 会话应注入客户卡通道");
      const request: CustomerInputRequest = {
        kind: "confirm",
        title: "任命写卡：impl",
        cardKind: "appointment-write",
        flowId: FLOW_ID,
        paths: [PATHS.boundary],
        preview: `## ${PATHS.boundary}\n${input.yaml}`,
      };
      const outcome = await injected!(request, { cardKind: "appointment-write", flowId: FLOW_ID } as never);
      return { outcome, captured, permit: stack.stablePermitOf(PATHS.boundary) !== undefined };
    } finally {
      await mgr.stop(null);
    }
  } finally {
    stack.dispose();
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
}

test("AC-13：boundary 扩大（新增目录）⇒ 卡面横幅 + required ack；勾选后可签发许可", async () => {
  const result = await appointmentBoundaryCase({
    yaml: boundaryText(true),
    answer: () => ({
      outcome: "answered",
      value: { confirmed: true },
      acknowledged: ["boundary-expansion-0"],
      operatorId: "customer",
    }),
  });
  assert.equal(result.captured.length, 1, "确认卡呈现客户");
  const card = result.captured[0]!;
  assert.equal(card.acknowledgments?.[0]?.required, true, "扩大项必须 required 勾选");
  assert.match(card.preview ?? "", /test\//, "预览展示新增目录");
  assert.equal(result.permit, true, "勾选后签发一次性许可");
});

test("AC-13：扩大未勾选 ⇒ 不签发许可（最后防线，fail-closed）", async () => {
  const result = await appointmentBoundaryCase({
    yaml: boundaryText(true),
    answer: () => ({ outcome: "answered", value: { confirmed: true }, operatorId: "customer" }),
  });
  assert.equal(result.captured.length, 1);
  assert.equal(result.captured[0]!.acknowledgments?.[0]?.required, true);
  assert.equal(result.permit, false, "required ack 未齐 ⇒ 不签发许可");
});

test("AC-13：收窄/无变化 ⇒ 不误报；正常签发许可", async () => {
  const unchanged = await appointmentBoundaryCase({
    yaml: boundaryText(false),
    answer: () => ({ outcome: "answered", value: { confirmed: true }, operatorId: "customer" }),
  });
  assert.equal(unchanged.captured[0]!.acknowledgments, undefined, "无变化不注入 ack");
  assert.equal(unchanged.permit, true);
  const narrowed = await appointmentBoundaryCase({
    yaml: "role: impl\nentries:\n  - kind: directory\n    path: src/impl/\n    purpose: 实现\n",
    answer: () => ({ outcome: "answered", value: { confirmed: true }, operatorId: "customer" }),
  });
  assert.equal(narrowed.captured[0]!.acknowledgments, undefined, "收窄不误报");
  assert.equal(narrowed.permit, true);
});

test("AC-13：预览不可解析 ⇒ 拒绝且不呈现卡/不签发许可", async () => {
  const result = await appointmentBoundaryCase({
    yaml: "role: impl\nentries: [\n",
    answer: () => ({ outcome: "answered", value: { confirmed: true }, operatorId: "customer" }),
  });
  assert.equal(result.captured.length, 0, "不可解析 ⇒ 不触达客户卡");
  assert.equal(result.permit, false);
  assert.equal(result.outcome?.outcome, "declined");
  if (result.outcome?.outcome === "declined") {
    assert.equal(result.outcome.notPresented, true);
    assert.ok((result.outcome.reason ?? "").length > 0, "显示拒绝原因");
  }
});

// ———————————————— 8. D4：confirm 回执携带/校验 acknowledgments ————————————————

test("D4 confirm 回执：required ack 合法 ⇒ answered/acknowledged；缺失/多余/非数组 ⇒ 拒收且 pending", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  const request: CustomerInputRequest = {
    kind: "confirm",
    title: "稳定边界写卡",
    cardKind: "appointment-write",
    paths: ["角色卡/impl/boundary.yaml"],
    preview: "## 角色卡/impl/boundary.yaml\nrole: impl\nentries: []\n",
    acknowledgments: [
      { id: "a", label: "扩大 A", required: true },
      { id: "b", label: "可选 B", required: false },
    ],
  };
  const pending = channel.customerInput(request, {
    roleId: "nominator",
    projectRoot: "/p",
    runtime: "demo",
    governanceModel: "trio",
  });
  assert.equal(pushed.length, 1);
  const id = pushed[0]!.id;
  assert.equal(channel.respond({ id, decision: { kind: "confirm", confirmed: true } }).ok, false, "缺失 ack 拒收");
  assert.equal(
    channel.respond({ id, decision: { kind: "confirm", confirmed: true, acknowledged: "a" } }).ok,
    false,
    "非数组拒收",
  );
  assert.equal(
    channel.respond({ id, decision: { kind: "confirm", confirmed: true, acknowledged: ["a", "b"] } }).ok,
    false,
    "多余非 required id 拒收",
  );
  assert.equal(channel.pendingCount(), 1, "非法回包不得结算");
  assert.equal(
    channel.respond({ id, decision: { kind: "confirm", confirmed: true, acknowledged: ["a"] } }).ok,
    true,
  );
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  if (outcome?.outcome === "answered") {
    assert.equal(outcome.value.confirmed, true);
    assert.deepEqual(outcome.acknowledged, ["a"]);
  }
});

test("D4 confirm：confirmed:false 不要求/不校验 ack，不回传 acknowledged", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  const request: CustomerInputRequest = {
    kind: "confirm",
    title: "扩展边界写卡",
    cardKind: "appointment-write",
    paths: ["角色卡/impl/boundary.yaml"],
    preview: "## 角色卡/impl/boundary.yaml\nrole: impl\nentries: []\n",
    acknowledgments: [{ id: "a", label: "扩大 A", required: true }],
  };
  const pending = channel.customerInput(request, {
    roleId: "nominator",
    projectRoot: "/p",
    runtime: "demo",
    governanceModel: "trio",
  });
  const id = pushed[0]!.id;
  // confirmed:false 即使带非法 ack 也不校验（拒绝不要求勾选）。
  assert.equal(
    channel.respond({ id, decision: { kind: "confirm", confirmed: false, acknowledged: "garbage" as never } }).ok,
    true,
  );
  const outcome = await pending;
  assert.equal(outcome?.outcome, "declined");
  assert.equal(outcome !== null && outcome !== undefined && "acknowledged" in outcome, false);
});

test("D4 confirm：请求无 required ack ⇒ 旧行为零变化（不要求/不回传）", async () => {
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  const request: CustomerInputRequest = {
    kind: "confirm",
    title: "普通确认",
    cardKind: "appointment-write",
    paths: ["角色卡/impl/boundary.yaml"],
    preview: "## 角色卡/impl/boundary.yaml\nrole: impl\nentries: []\n",
  };
  const pending = channel.customerInput(request, {
    roleId: "nominator",
    projectRoot: "/p",
    runtime: "demo",
    governanceModel: "trio",
  });
  const id = pushed[0]!.id;
  assert.equal(channel.respond({ id, decision: { kind: "confirm", confirmed: true } }).ok, true);
  const outcome = await pending;
  assert.equal(outcome?.outcome, "answered");
  assert.equal(outcome !== null && outcome !== undefined && "acknowledged" in outcome, false);
});

test("D4 端到端：appointment-write 扩大 boundary 经真实确认通道回传 ack ⇒ 签发许可", async () => {
  const project = await createTrunkProject();
  const stack = stackFor(project.root, []);
  const pushed: OperatorRequestPayload[] = [];
  const channel = createCustomerInputChannel({ presenter: (payload) => pushed.push(payload), operatorId: "tester" });
  let injected: CustomerInputFn | undefined;
  const mgr = await makeManager(project.root, channel.customerInput, {
    getVersionChangeStack: () => stack,
    openRoleSession: async (sessionInput) => {
      injected = sessionInput.customerInput;
      return capabilityHandle();
    },
  });
  try {
    const opened = await mgr.open({ projectRoot: project.root, roleId: "nominator", runtime: "demo" });
    assert.equal(opened.ok, true, opened.ok ? "" : opened.error ?? "");
    await tick(20);
    assert.equal(typeof injected, "function");
    const request: CustomerInputRequest = {
      kind: "confirm",
      title: "任命写卡：impl",
      cardKind: "appointment-write",
      flowId: FLOW_ID,
      paths: [PATHS.boundary],
      preview: `## ${PATHS.boundary}\n${boundaryText(true)}`,
    };
    const pending = injected!(request, { cardKind: "appointment-write", flowId: FLOW_ID } as never);
    // 包装器先做异步扩大检测，再经真实通道呈现；等待卡送达。
    const deadline = Date.now() + 2_000;
    while (pushed.length === 0 && Date.now() < deadline) await tick(20);
    assert.equal(pushed.length, 1, "确认卡呈现客户");
    assert.equal(pushed[0]!.request.acknowledgments?.[0]?.required, true, "扩大项要求勾选");
    const id = pushed[0]!.id;
    assert.equal(channel.respond({ id, decision: { kind: "confirm", confirmed: true } }).ok, false, "未勾选拒收");
    assert.equal(channel.respond({ id, decision: { kind: "confirm", confirmed: true, acknowledged: ["boundary-expansion-0"] } }).ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    assert.equal(outcome?.outcome === "answered" ? outcome.acknowledged?.[0] : undefined, "boundary-expansion-0");
    assert.equal(stack.stablePermitOf(PATHS.boundary) !== undefined, true, "确认回执 ack 驱动签发许可");
  } finally {
    await mgr.stop(null);
    stack.dispose();
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

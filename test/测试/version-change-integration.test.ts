// test/测试/version-change-integration.test.ts
// T1（2026-11-05 trunk-amendment Batch 5）：跨层集成——真实 Model（C1 契约）→ 真实 Service
// （C2c VCA/冻结/重构校验）→ 真实 Provider（S1 存储 + R9 baseline + doc-freezes 派生缓存）→
// 真实 S2 trunk service / S3 run-manifest 冻结校验 → 真实 S4 Pipeline（version-change-runtime /
// refactor-runtime / trunk-runtime）→ 真实桌面客户通道（createCustomerInputChannel + D1 卡组装）→
// 真实账本（tasks.jsonl，readTaskState 逐事件校验）。
//
// 替身仅限：客户作答（模拟客户本人点选）与通知收集；不启动 Electron、不触网、不改产品代码。
// 覆盖（V1 §4.3 / 团队计划增量 §6 / P1.6 AC-1–AC-8/10/14/18/19/25/26/28/29/31）：
//   · version-upgrade（product）提交/批准 → 冻结目标 + R9 记录 + trunk re-pin + t+1；批准前后哈希重验；
//   · detail-amendment（rapporteur）两阶段：提交冻结修正案 → 批准 → 逐项 apply/keep +
//     acknowledgments 必选 → 只冻结 applied 项 + apply-journal re-pin；
//   · 拒绝路径：不冻结目标、不 re-pin；修正案自身保持冻结（不可原地改）；
//   · 发起角色/目标范围/base 匹配/并发/幂等矩阵（真实错误码）；
//   · bootstrap 两条路径：首次 handoff pin 写 handoff-pin-bootstrap 冻结（pin 只 pin 冻结文档）；
//     无 trunk VCA（baseTrunk:null + bootstrap:true）批准后建立 t1；
//   · 冻结迁移：missing ⇒ 既有文档一律冻结；corrupt ⇒ fail-closed；doc-freezes 派生缓存可重建、
//     以 R9 baseline 为准；migrated-draft 证据标记（不写 doc.freeze）；
//   · 轻量重构：convener 发起、managedBy application-scheduler、机械写集、无客户决定、不产生 trunk 版本、
//     越界提示转 VCA；
//   · 客户主权：VCA 卡不进入 @决策/判断器（真实通道）；D1 映射拒绝 judge/directive 回包；
//   · 旧入口/文案：低层 run-change 卡保留；i18n 迁移与 zh/en 成对；F15 roleCards；F17 无 refactor:request。

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  createCustomerInputChannel,
  type OperatorRequestPayload,
} from "../../app/desktop/customer-input.ts";
import { buildTrunkStatePayload } from "../../app/desktop/trunk.ts";
import {
  buildAmendmentItemCard,
  buildVersionChangeCard,
  toAmendmentItemOutcome,
  toVersionChangeOutcome,
  VERSION_CHANGE_FORBIDDEN_IPC_CHANNELS,
  VERSION_CHANGE_IPC_CHANNELS,
} from "../../app/desktop/version-change.ts";
import { versionedDocOverwriteDecision } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { versionedDocFreezeState } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { appendTaskEvent, readTaskState } from "../../src/common/编排/task-state.ts";
import { buildRunChangeCard, ensureDraftRun, pinRun, readRunManifest } from "../../src/common/编排/run-manifest.ts";
import { enUS } from "../../src/common/shared/i18n/messages/en-US.ts";
import { zhCN } from "../../src/common/shared/i18n/messages/zh-CN.ts";
import type { TaskStateEvent } from "../../src/model/runtime.ts";
import type { TrunkStatusView } from "../../src/service/trunk/public/trunk-service.ts";
import { createVersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import type { VersionChangeIntegration } from "../../src/service/version-change/public/version-change-integration.ts";
import { createVersionChangeRuntime } from "../../src/pipeline/orchestration/version-change-runtime.ts";
import type {
  VersionChangePresenter,
  VersionChangeRuntime,
} from "../../src/pipeline/orchestration/version-change-runtime.ts";
import { createRefactorRuntime } from "../../src/pipeline/orchestration/refactor-runtime.ts";
import type { RefactorRuntime } from "../../src/pipeline/orchestration/refactor-runtime.ts";
import { createRunRepinPort, createTrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import type { TrunkRuntime } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import {
  AT,
  AT2,
  FLOW_ID,
  PATHS,
  createTrunkProject,
  sha256,
  writeProjectFile,
  type TrunkProject,
} from "../编排/fixtures/trunk-project.ts";

const CUSTOMER_CTX = { roleId: "application", governanceModel: "trio" as const };

async function waitFor<T>(probe: () => T | undefined, label: string, timeoutMs = 3_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

interface Rig {
  project: TrunkProject;
  integration: VersionChangeIntegration;
  trunkRuntime: TrunkRuntime;
  runtime: VersionChangeRuntime;
  refactor: RefactorRuntime;
  events: TaskStateEvent[];
  notifications: string[];
  channel: ReturnType<typeof createCustomerInputChannel>;
  pushed: OperatorRequestPayload[];
  directiveCalls: { count: number };
  judgeCalls: { count: number };
}

interface RigOptions {
  migrate?: boolean;
  withRun?: boolean;
  freezeKeys?: Array<keyof typeof PATHS>;
  withChannel?: boolean;
  withDirective?: boolean;
}

async function setup(options: RigOptions = {}): Promise<Rig> {
  const project = await createTrunkProject({
    ...(options.withRun !== undefined ? { withRun: options.withRun } : {}),
    ...(options.freezeKeys !== undefined ? { freezeKeys: options.freezeKeys } : {}),
  });
  const integration = createVersionChangeIntegration({
    projectRoot: project.root,
    now: () => new Date(AT),
    migrationCompleted: () => options.migrate !== false,
    runRepin: createRunRepinPort(project.root),
  });
  const events: TaskStateEvent[] = [];
  const notifications: string[] = [];
  const emitEvent = async (event: TaskStateEvent): Promise<void> => {
    events.push(event);
    const appended = await appendTaskEvent(project.root, event);
    assert.equal(appended.ok, true, `账本写入失败：${JSON.stringify(appended)}`);
  };
  const trunkRuntime = createTrunkRuntime({
    projectRoot: project.root,
    service: integration.trunk,
    emitEvent,
    now: () => new Date(AT),
  });

  const pushed: OperatorRequestPayload[] = [];
  const directiveCalls = { count: 0 };
  const judgeCalls = { count: 0 };
  const channel = createCustomerInputChannel({
    presenter: (payload) => pushed.push(payload),
    operatorId: "customer",
    ...(options.withDirective === true
      ? {
          directive: {
            decisionFacts: () => ({ active: [], ledgerErrors: 0 }),
            applyDecisionDirective: async () => {
              directiveCalls.count += 1;
              return { kind: "selected" as const, id: "d-1", optionId: "reject-version-change", action: "select-recommended" as const };
            },
            emitResult: () => {},
            emitNotice: () => {},
          },
        }
      : {}),
    ...(options.withDirective === true
      ? {
          judge: {
            isGroupEnabled: () => true,
            fn: async () => {
              judgeCalls.count += 1;
              return { verdict: "manual" as const, group: "decision" as const, cardKind: "decision", engine: "demo", reasonCode: "not-used" };
            },
          },
          emitJudgeResult: () => {
            judgeCalls.count += 1;
          },
        }
      : {}),
  });

  const presenter: VersionChangePresenter | undefined =
    options.withChannel === false
      ? undefined
      : {
          async presentVersionChange({ record }) {
            const built = buildVersionChangeCard({ record });
            assert.ok(built !== undefined, "VCA 卡组装失败");
            const pending = channel.customerInput(built.request, CUSTOMER_CTX);
            const payload = await waitFor(() => pushed.shift(), "VCA 客户卡呈现");
            const accepted = channel.respond({
              id: payload.id,
              decision: { kind: "choice", selected: ["approve-version-change"] },
            });
            assert.equal(accepted.ok, true, accepted.error ?? "");
            const outcome = await pending;
            // 应用层职责（生产 = SessionManager.withRequestLifecycle）：裁决 id 由应用生成，
            // 模型/渲染侧不得自报；此处按同一规则补齐后走 D1 主权映射。
            const withDecision =
              outcome?.outcome === "answered"
                ? { ...outcome, decisionId: `decision-${payload.id}` }
                : outcome;
            return toVersionChangeOutcome(withDecision);
          },
          async presentAmendmentItem({ applicationId, item, index, total }) {
            const records = await integration.services.vca.list();
            const record = records.find((candidate) => candidate.applicationId === applicationId);
            assert.ok(record !== undefined);
            const acknowledgments = [{ id: "boundary-expansion-0", label: "边界扩大示例（测试）", required: true }];
            const built = buildAmendmentItemCard({
              record: record!,
              item,
              index,
              total,
              acknowledgments,
            });
            assert.ok(built !== undefined, "逐项卡组装失败");
            const request = built!.request as Extract<typeof built.request, { kind: "choice" }>;
            const pending = channel.customerInput(built!.request, CUSTOMER_CTX);
            const payload = await waitFor(() => pushed.shift(), "逐项客户卡呈现");
            // acknowledgments 必选校验：缺勾选 ⇒ 拒收且 pending 保留；齐全 ⇒ 受理并回传。
            const rejected = channel.respond({
              id: payload.id,
              decision: { kind: "choice", selected: ["item-apply"] },
            });
            assert.equal(rejected.ok, false, "必选 acknowledgment 缺失必须拒收");
            const required = (request.acknowledgments ?? []).filter((entry) => entry.required).map((entry) => entry.id);
            const accepted = channel.respond({
              id: payload.id,
              decision: { kind: "choice", selected: ["item-apply"], acknowledged: required },
            });
            assert.equal(accepted.ok, true, accepted.error ?? "");
            const outcome = await pending;
            const withDecision =
              outcome?.outcome === "answered"
                ? { ...outcome, decisionId: `decision-${payload.id}` }
                : outcome;
            return toAmendmentItemOutcome(withDecision, built!.request);
          },
        };

  const runtime = createVersionChangeRuntime({
    projectRoot: project.root,
    services: integration.services,
    trunkService: integration.trunk,
    trunkRuntime,
    emitEvent,
    ...(presenter !== undefined ? { presenter } : {}),
    notify: (message) => {
      notifications.push(message);
    },
    now: () => new Date(AT),
  });

  const refactor = createRefactorRuntime({
    store: integration.refactorRequests,
    validator: integration.services.refactor,
    emitEvent,
    allowedModuleRoots: ["src/"],
    now: () => new Date(AT),
  });

  return {
    project,
    integration,
    trunkRuntime,
    runtime,
    refactor,
    events,
    notifications,
    channel,
    pushed,
    directiveCalls,
    judgeCalls,
  };
}

async function cleanup(rig: Rig): Promise<void> {
  rig.channel.rejectAllPending("test cleanup");
  await fs.rm(rig.project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

async function bootstrapTrunk(rig: Rig, d3RoleIds: string[] = ["impl"]): Promise<void> {
  const boot = await rig.trunkRuntime.bootstrap({
    flowId: FLOW_ID,
    runId: rig.project.runId,
    applicationId: "vc-boot",
    decisionId: "dec-boot",
    target: rig.project.snapshot(),
    rosterVersion: 1,
    d3: { decisionId: "dec-0", targetRoleIds: d3RoleIds },
    roles: ["impl"],
    journalId: "j-boot",
    at: AT2,
  });
  assert.equal(boot.ok, true, boot.ok ? "" : `${boot.code}: ${boot.message ?? ""}`);
  rig.events.length = 0;
}

async function ledgerOf(rig: Rig): Promise<TaskStateEvent[]> {
  const state = await readTaskState(rig.project.root);
  assert.deepEqual(state.errors, [], `账本事件必须通过 C2a 逐 kind 校验：${JSON.stringify(state.errors)}`);
  return state.events;
}

function eventOf<T extends TaskStateEvent["kind"]>(events: TaskStateEvent[], kind: T): Array<Extract<TaskStateEvent, { kind: T }>> {
  return events.filter((event) => event.kind === kind) as Array<Extract<TaskStateEvent, { kind: T }>>;
}

function amendmentDoc(current: { trunkVersion: number; digest: string }, runId: string, items: string[]): string {
  return [
    "---",
    "schema: trunk-amendment/v1",
    "amendmentId: am-1",
    `flowId: ${FLOW_ID}`,
    "docVersion: 1",
    "baseTrunk:",
    `  trunkVersion: ${current.trunkVersion}`,
    `  runId: ${runId}`,
    `  digest: ${current.digest}`,
    "items:",
    ...items,
    "---",
    "# amendment",
    "",
  ].join("\n");
}

// ———————————————— 1. VCA version-upgrade 全链路 ————————————————

test("VCA：product version-upgrade 经真实客户卡提交/批准 → 冻结+R9+trunk t2；冻结后守卫拒绝同版本覆盖", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, "---\nschema: project-proposal/v2\n---\n# proposal v2\n");

    const submitted = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: (await rig.integration.trunk.current())!,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "补一个契约细节",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);
    if (!submitted.ok) return;
    assert.equal(submitted.value.status, "submitted");
    const eventsAfterSubmit = await ledgerOf(rig);
    const submitEvent = eventOf(eventsAfterSubmit, "version.change").at(-1)!;
    assert.equal(submitEvent.status, "submitted");
    assert.equal(submitEvent.origin, "application");
    assert.equal(submitEvent.decidedBy, undefined);
    assert.equal(submitEvent.initiatorRoleId, "product");

    // 客户卡（真实通道组装）：kind/发起者/targets/path/sha256/语义说明。
    const card = buildVersionChangeCard({ record: submitted.value });
    assert.ok(card !== undefined);
    const preview = (card!.request as { preview?: string }).preview ?? "";
    assert.match(preview, /demo-proposal-v2\.md/);
    assert.match(preview, new RegExp(v2sha));

    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, true, presented.ok ? "" : `${presented.code}: ${presented.message ?? ""}`);
    if (!presented.ok) return;
    assert.equal(presented.value.record.status, "applied");
    assert.equal(presented.value.resultTrunkVersion, 2);

    const current = await rig.integration.trunk.current();
    assert.equal(current?.trunkVersion, 2);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.documents.proposal?.path, v2);
    assert.equal(status.manifest?.artifacts.documents.proposal?.sha256, v2sha);
    assert.deepEqual(await rig.integration.trunk.verify(), { ok: true, violations: [] });

    // R9 权威记录 + 冻结事件归属（customer 类 reason 带 decisionId）。
    const baseline = await fs.readFile(path.join(rig.project.root, ".ans/state/versions.jsonl"), "utf8");
    assert.match(baseline, /"reason":"version-upgrade-approved"/);
    assert.match(baseline, /"decidedBy":"customer"/);
    const frozen = await rig.integration.services.freeze.entryOf(v2);
    assert.equal(frozen?.freeze.reason, "version-upgrade-approved");
    assert.equal(frozen?.freeze.origin, "customer");
    assert.equal(frozen?.sha256, v2sha);

    // 跨层守卫：冻结后同版本覆盖被拒；新版本 v3（不存在 ⇒ draft）允许。
    assert.equal(versionedDocFreezeState(rig.project.root, v2, true), "frozen");
    const overwrite = versionedDocOverwriteDecision({ relPath: v2, exists: true, frozen: "frozen", operation: "write" });
    assert.equal(overwrite.allowed, false);
    if (!overwrite.allowed) assert.equal(overwrite.code, "versioned-doc-overwrite");
    const newVersion = versionedDocOverwriteDecision({
      relPath: "docs/proposals/demo-proposal-v3.md",
      exists: false,
      frozen: "draft",
      operation: "write",
    });
    assert.equal(newVersion.allowed, true);

    const events = await ledgerOf(rig);
    const versionEvents = eventOf(events, "version.change").map((event) => event.status);
    assert.deepEqual(versionEvents, ["submitted", "approved", "applied"]);
    const approvedEvent = eventOf(events, "version.change").find((event) => event.status === "approved")!;
    assert.equal(approvedEvent.origin, "customer");
    assert.equal(approvedEvent.decidedBy, "customer");
    assert.match(approvedEvent.decisionId ?? "", /^decision-/);
    const freezeEvent = eventOf(events, "doc.freeze")[0]!;
    assert.equal(freezeEvent.reason, "version-upgrade-approved");
    assert.equal(freezeEvent.origin, "customer");
    assert.equal(freezeEvent.decidedBy, "customer");
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 2. VCA detail-amendment 两阶段 ————————————————

test("VCA：detail-amendment 提交冻结修正案 → 批准 → 逐项 apply/keep + acknowledgments → 只冻结 applied", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const current = (await rig.integration.trunk.current())!;
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, "version: 2\n# proposal v2\n");
    const team2 = "docs/scheduling/demo-team-v2.md";
    const team2sha = await writeProjectFile(rig.project.root, team2, "version: 2\n# team v2\n");
    const amendmentRel = "docs/proposals/demo-amendment-v1.md";
    await writeProjectFile(
      rig.project.root,
      amendmentRel,
      amendmentDoc(current, rig.project.runId, [
        "  - itemId: it-1",
        "    kind: contract",
        "    change: modify",
        `    from: ${PATHS.proposal}`,
        `    to: ${v2}`,
        "  - itemId: it-2",
        "    kind: execution",
        "    change: modify",
        `    from: ${PATHS.teamPlan}`,
        `    to: ${team2}`,
      ]),
    );
    const validated = await rig.integration.trunk.validateAmendment({ amendmentDocPath: amendmentRel, flowId: FLOW_ID });
    assert.equal(validated.ok, true);
    if (!validated.ok) return;

    const submitted = await rig.runtime.submit({
      kind: "detail-amendment",
      initiatorRoleId: "rapporteur",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [
        { kind: "contract", path: v2, action: "modify" },
        { kind: "execution", path: team2, action: "modify" },
      ],
      amendmentId: "am-1",
      amendmentDocPath: amendmentRel,
      amendmentItems: validated.value.items,
      summary: "修正案",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);

    // 提交即冻结修正案（application 归属，不冒充客户）；任何编辑被拒。
    const amendmentEntry = await rig.integration.services.freeze.entryOf(amendmentRel);
    assert.equal(amendmentEntry?.freeze.reason, "amendment-submitted");
    assert.equal(amendmentEntry?.freeze.origin, "application");
    assert.equal(amendmentEntry?.freeze.decidedBy, undefined);
    assert.equal(versionedDocFreezeState(rig.project.root, amendmentRel, true), "frozen");
    const editAmendment = versionedDocOverwriteDecision({
      relPath: amendmentRel,
      exists: true,
      frozen: "frozen",
      operation: "edit",
    });
    assert.equal(editAmendment.allowed, false);
    // 目标仍是草稿（尚未批准/生效）。
    assert.equal(versionedDocFreezeState(rig.project.root, v2, true), "draft");

    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, true, presented.ok ? "" : `${presented.code}: ${presented.message ?? ""}`);
    if (!presented.ok) return;
    assert.equal(presented.value.needsItems, true);
    assert.equal(presented.value.record.status, "approved");
    // detail 批准不冻结目标（只冻结 applied）。
    assert.equal(await rig.integration.services.freeze.entryOf(v2), undefined);

    const items = await rig.runtime.runAmendmentItems("vc-1");
    assert.equal(items.ok, true, items.ok ? "" : `${items.code}: ${items.message ?? ""}`);
    if (!items.ok) return;
    assert.equal(items.value.decisions.length, 2);
    assert.deepEqual(items.value.decisions[0]?.acknowledgments, [
      { id: "boundary-expansion-0", label: "边界扩大示例（测试）" },
    ]);
    const decisions = items.value.decisions.map((decision) =>
      decision.itemId === "it-2" ? { ...decision, choice: "item-keep" as const } : decision,
    );
    const applied = await rig.runtime.applyAmendmentItems("vc-1", { decisionId: "dec-items", decisions });
    assert.equal(applied.ok, true, applied.ok ? "" : `${applied.code}: ${applied.message ?? ""}`);
    if (!applied.ok) return;
    assert.equal(applied.value.resultTrunkVersion, 2);

    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.documents.proposal?.path, v2);
    assert.equal(status.manifest?.artifacts.execution.teamPlan?.path, PATHS.teamPlan, "kept 项保留旧工件");
    // 只冻结 applied 的 contract 目标；execution（C15）不纳入 guard 冻结。
    const frozenApplied = await rig.integration.services.freeze.isFrozen(v2);
    assert.equal(frozenApplied.state, "frozen");
    const frozenKept = await rig.integration.services.freeze.isFrozen(PATHS.proposal);
    assert.equal(frozenKept.state, "frozen");
    assert.equal(await rig.integration.services.freeze.entryOf(team2), undefined);

    const events = await ledgerOf(rig);
    const itemEvents = eventOf(events, "trunk.amendment").filter((event) => event.itemId !== undefined);
    assert.ok(itemEvents.some((event) => event.itemId === "it-1" && event.itemResult === "applied"));
    assert.ok(itemEvents.some((event) => event.itemId === "it-2" && event.itemResult === "kept"));
    assert.ok(itemEvents.every((event) => event.decidedBy === "customer" && event.decisionId === "dec-items"));
    const lifecycle = eventOf(events, "trunk.amendment").find((event) => event.status === "applied");
    assert.ok(lifecycle !== undefined);
    assert.equal(lifecycle!.origin, "application");
    assert.equal(lifecycle!.decidedBy, undefined);
    assert.equal(lifecycle!.journalId, "j-vc-1");
    const freezeEvents = eventOf(events, "doc.freeze");
    assert.ok(freezeEvents.some((event) => event.reason === "detail-item-applied" && event.sha256 === v2sha));
    assert.ok(!freezeEvents.some((event) => event.path === team2));
    assert.ok(team2sha.length === 64);
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 3. VCA 拒绝路径 ————————————————

test("VCA：客户拒绝 ⇒ 目标保持草稿、不 re-pin；修正案保持冻结（不可原地复用）", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const current = (await rig.integration.trunk.current())!;
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "version: 2\n# proposal v2\n");
    const amendmentRel = "docs/proposals/demo-amendment-v1.md";
    await writeProjectFile(
      rig.project.root,
      amendmentRel,
      amendmentDoc(current, rig.project.runId, [
        "  - itemId: it-1",
        "    kind: contract",
        "    change: modify",
        `    from: ${PATHS.proposal}`,
        `    to: ${v2}`,
      ]),
    );
    const validated = await rig.integration.trunk.validateAmendment({ amendmentDocPath: amendmentRel, flowId: FLOW_ID });
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    const submitted = await rig.runtime.submit({
      kind: "detail-amendment",
      initiatorRoleId: "rapporteur",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      amendmentId: "am-1",
      amendmentDocPath: amendmentRel,
      amendmentItems: validated.value.items,
      summary: "会被拒绝",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true);

    const rejected = await rig.runtime.reject("vc-1", "dec-no", "内容不够清楚");
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    assert.equal(rejected.value.status, "rejected");

    const trunkAfter = await rig.integration.trunk.current();
    assert.equal(trunkAfter?.trunkVersion, 1);
    assert.equal(await rig.integration.services.freeze.entryOf(v2), undefined, "拒绝不冻结目标");
    // 目标仍是草稿，可原位改；修正案保持提交时冻结。
    assert.equal(versionedDocFreezeState(rig.project.root, v2, true), "draft");
    const targetEdit = versionedDocOverwriteDecision({ relPath: v2, exists: true, frozen: "draft", operation: "edit" });
    assert.equal(targetEdit.allowed, true);
    const amendmentEdit = versionedDocOverwriteDecision({
      relPath: amendmentRel,
      exists: true,
      frozen: "frozen",
      operation: "write",
    });
    assert.equal(amendmentEdit.allowed, false);

    const events = await ledgerOf(rig);
    const rejectedEvent = eventOf(events, "version.change").at(-1)!;
    assert.equal(rejectedEvent.status, "rejected");
    assert.equal(rejectedEvent.decidedBy, "customer");
    assert.equal(rejectedEvent.decisionId, "dec-no");
    assert.ok(!eventOf(events, "doc.freeze").some((event) => event.path === v2));
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 4. VCA 角色/目标/base/并发矩阵 ————————————————

test("VCA：发起角色、目标范围、base 匹配、并发与幂等（真实错误码）", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const current = (await rig.integration.trunk.current())!;
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "version: 2\n# proposal v2\n");
    const team2 = "docs/scheduling/demo-team-v2.md";
    await writeProjectFile(rig.project.root, team2, "version: 2\n# team v2\n");

    // 角色矩阵：upgrade 仅 product；detail 仅 rapporteur。
    const productDetail = await rig.integration.services.vca.create({
      kind: "detail-amendment",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      amendmentId: "am-1",
      amendmentDocPath: "docs/proposals/demo-amendment-v1.md",
      summary: "x",
      at: AT,
    });
    assert.equal(productDetail.ok, false);
    if (!productDetail.ok) assert.equal(productDetail.code, "vca-role-not-allowed");
    const rapporteurUpgrade = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "rapporteur",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "x",
      at: AT,
    });
    assert.equal(rapporteurUpgrade.ok, false);
    if (!rapporteurUpgrade.ok) assert.equal(rapporteurUpgrade.code, "vca-role-not-allowed");
    const convener = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "convener",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "x",
      at: AT,
    });
    assert.equal(convener.ok, false);

    // 目标范围：upgrade 禁 execution/workflow/boundary/product-intent；detail 禁 workflow/boundary。
    const upgradeExecution = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "execution", path: team2, action: "modify" }],
      summary: "x",
      at: AT,
    });
    assert.equal(upgradeExecution.ok, false);
    if (!upgradeExecution.ok) assert.equal(upgradeExecution.code, "vca-target-invalid");
    const upgradeWorkflow = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "workflow", path: PATHS.workflow, action: "modify" }],
      summary: "x",
      at: AT,
    });
    assert.equal(upgradeWorkflow.ok, false);
    if (!upgradeWorkflow.ok) assert.equal(upgradeWorkflow.code, "vca-boundary-forbidden");
    const upgradeBoundary = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "boundary", path: PATHS.boundary, action: "modify", roleId: "impl" }],
      summary: "x",
      at: AT,
    });
    assert.equal(upgradeBoundary.ok, false);
    if (!upgradeBoundary.ok) assert.equal(upgradeBoundary.code, "vca-boundary-forbidden");
    const upgradeIntent = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "product-intent", path: PATHS.intent, action: "modify" }],
      summary: "x",
      at: AT,
    });
    assert.equal(upgradeIntent.ok, false);
    if (!upgradeIntent.ok) assert.equal(upgradeIntent.code, "vca-target-invalid");
    // 作者写区：contract 目标必须落在策划写区（docs/proposals|contracts），execution 路径 ⇒ 拒绝。
    const wrongAuthorArea = await rig.integration.services.vca.create({
      kind: "detail-amendment",
      initiatorRoleId: "rapporteur",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: team2, action: "modify" }],
      amendmentId: "am-1",
      amendmentDocPath: "docs/proposals/demo-amendment-v1.md",
      summary: "x",
      at: AT,
    });
    assert.equal(wrongAuthorArea.ok, false);
    if (!wrongAuthorArea.ok) assert.equal(wrongAuthorArea.code, "vca-target-invalid");

    // base 不匹配：过期 digest ⇒ vca-base-mismatch。
    const staleBase = { ...current, digest: sha256("stale") };
    const stale = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: staleBase,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "x",
      at: AT,
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, "vca-base-mismatch");

    // 并发：同一 flow 同时只允许一个 submitted/approved；重复提交幂等。
    const first = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "first",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(first.ok, true);
    const again = await rig.integration.services.vca.submit({ applicationId: "vc-1", at: AT2 });
    assert.equal(again.ok, true, "重复提交幂等返回现有申请");
    const v3 = "docs/proposals/demo-proposal-v3.md";
    await writeProjectFile(rig.project.root, v3, "version: 3\n# proposal v3\n");
    const second = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v3, action: "add" }],
      summary: "second",
      applicationId: "vc-2",
      at: AT,
    });
    assert.equal(second.ok, true);
    const pending = await rig.integration.services.vca.submit({ applicationId: "vc-2", at: AT2 });
    assert.equal(pending.ok, false);
    if (!pending.ok) assert.equal(pending.code, "vca-pending");
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 4b. 批准前哈希重验 ————————————————

test("VCA：批准前 toSha256 重验（提交后目标漂移 ⇒ vca-hash-drift，不冻结/不 re-pin）", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "version: 2\n# proposal v2\n");
    const submitted = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: (await rig.integration.trunk.current())!,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "drift",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true);
    // 提交后目标被改（漂移注入）⇒ 批准前重算不一致，拒绝批准、保持 submitted。
    await writeProjectFile(rig.project.root, v2, "version: 2\n# proposal v2 CHANGED after submit\n");
    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, false);
    if (!presented.ok) assert.equal(presented.code, "vca-hash-drift");
    const records = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(records.find((record) => record.applicationId === "vc-1")?.status, "submitted");
    assert.equal(await rig.integration.services.freeze.entryOf(v2), undefined, "漂移不冻结");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 1, "漂移不 re-pin");
    const events = await ledgerOf(rig);
    assert.ok(!eventOf(events, "version.change").some((event) => event.status === "approved"));
    assert.ok(!eventOf(events, "doc.freeze").some((event) => event.path === v2));
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 4c. AC-5 前置校验（批准前/apply 前 fail-closed） ————————————————

const NL = String.fromCharCode(10);
const lines = (...items: string[]): string => items.join(NL);
const PROPOSAL_V2_TEXT = lines("---", "schema: project-proposal/v2", "---", "# proposal v2", "");

const ROSTER_V2_REFERENCING_V1 = lines(
  "---",
  "schema: project-roster/v3",
  `flowId: ${FLOW_ID}`,
  "version: 2",
  `intent: ${PATHS.intent}`,
  `proposal: ${PATHS.proposal}`,
  `architecture: ${PATHS.architecture}`,
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: 测试夹具",
  "roles:",
  "  - id: impl",
  "    displayName: 实现",
  "    purpose: 实现",
  "    capability: TS",
  "    modules:",
  "      - impl-core",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现模块",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.ts",
  `    architectureSource: ${PATHS.architecture}`,
  "---",
);

async function assertUpgradeRejectedBeforeApproval(rig: Rig, targetPaths: string[], expectedCode: string): Promise<void> {
  const presented = await rig.runtime.present("vc-1");
  assert.equal(presented.ok, false);
  if (!presented.ok) assert.equal(presented.code, expectedCode);
  const records = await rig.runtime.list({ flowId: FLOW_ID });
  assert.equal(records.find((record) => record.applicationId === "vc-1")?.status, "submitted", "VCA 保持 submitted");
  for (const path of targetPaths) {
    assert.equal(await rig.integration.services.freeze.entryOf(path), undefined, `未冻结目标：${path}`);
  }
  assert.equal((await rig.integration.trunk.current())?.trunkVersion, 1, "trunk 指针不变");
  const run = await readRunManifest(rig.project.root, rig.project.runId);
  assert.equal(run.ok, true);
  if (run.ok) {
    assert.equal(run.manifest.documents.proposal?.path, PATHS.proposal, "run manifest 未 re-pin");
    assert.equal((run.manifest as { repins?: unknown[] }).repins, undefined, "run manifest 无 repins");
  }
  const events = await ledgerOf(rig);
  assert.ok(!eventOf(events, "version.change").some((event) => event.status === "approved"));
}

test("VCA AC-5：无效 roster / D3 越界 / 版本链不匹配 ⇒ 批准前 fail-closed（不冻结/不 re-pin/trunk 不变）", async () => {
  // 1) 无效 roster（roles 非数组）
  {
    const rig = await setup();
    try {
      await bootstrapTrunk(rig);
      const rosterV2 = "docs/proposals/demo-roster-v2.md";
      await writeProjectFile(
        rig.project.root,
        rosterV2,
        lines("---", "schema: project-roster/v3", "flowId: demo", "version: 2", "roles: not-an-array", "---", ""),
      );
      const proposalV2 = "docs/proposals/demo-proposal-v2.md";
      await writeProjectFile(rig.project.root, proposalV2, PROPOSAL_V2_TEXT);
      const submitted = await rig.runtime.submit({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        baseTrunk: (await rig.integration.trunk.current())!,
        targets: [
          { kind: "roster", path: rosterV2, action: "add" },
          { kind: "contract", path: proposalV2, action: "modify" },
        ],
        summary: "invalid roster",
        applicationId: "vc-1",
        at: AT,
      });
      assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);
      await assertUpgradeRejectedBeforeApproval(rig, [rosterV2, proposalV2], "vca-target-invalid");
    } finally {
      await cleanup(rig);
    }
  }

  // 2) D3 targetRoleIds 不在 roster
  {
    const rig = await setup();
    try {
      await bootstrapTrunk(rig, ["impl", "ghost"]);
      const proposalV2 = "docs/proposals/demo-proposal-v2.md";
      await writeProjectFile(rig.project.root, proposalV2, PROPOSAL_V2_TEXT);
      const submitted = await rig.runtime.submit({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        baseTrunk: (await rig.integration.trunk.current())!,
        targets: [{ kind: "contract", path: proposalV2, action: "modify" }],
        summary: "d3 out of roster",
        applicationId: "vc-1",
        at: AT,
      });
      assert.equal(submitted.ok, true);
      await assertUpgradeRejectedBeforeApproval(rig, [proposalV2], "vca-target-invalid");
    } finally {
      await cleanup(rig);
    }
  }

  // 3) 契约版本链不匹配（roster v2 引用 proposal v1，但 target 为 proposal v2）
  {
    const rig = await setup();
    try {
      await bootstrapTrunk(rig);
      const rosterV2 = "docs/proposals/demo-roster-v2.md";
      await writeProjectFile(rig.project.root, rosterV2, ROSTER_V2_REFERENCING_V1);
      const proposalV2 = "docs/proposals/demo-proposal-v2.md";
      await writeProjectFile(rig.project.root, proposalV2, PROPOSAL_V2_TEXT);
      const submitted = await rig.runtime.submit({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        baseTrunk: (await rig.integration.trunk.current())!,
        targets: [
          { kind: "roster", path: rosterV2, action: "add" },
          { kind: "contract", path: proposalV2, action: "modify" },
        ],
        summary: "chain mismatch",
        applicationId: "vc-1",
        at: AT,
      });
      assert.equal(submitted.ok, true);
      await assertUpgradeRejectedBeforeApproval(rig, [rosterV2, proposalV2], "vca-target-invalid");
    } finally {
      await cleanup(rig);
    }
  }
});

test("VCA AC-5：apply 前重验（批准后链损坏 ⇒ vca-apply-failed，不 re-pin；修复后可重试）", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, proposalV2, PROPOSAL_V2_TEXT);
    const submitted = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: (await rig.integration.trunk.current())!,
      targets: [{ kind: "contract", path: proposalV2, action: "modify" }],
      summary: "apply recheck",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true);
    // 直接经 Service 批准（冻结目标），再以故障注入让 **apply 前重验** 失败（第一次批准前校验通过、
    // 第二次 apply 重验失败）——覆盖 apply 路径的 fail-closed 映射（S4 在 services.vca.apply 前置检查）。
    const approved = await rig.integration.services.vca.approve({ applicationId: "vc-1", decisionId: "dec-x", at: AT });
    assert.equal(approved.ok, true, approved.ok ? "" : `${approved.code}: ${approved.message ?? ""}`);
    assert.equal(await rig.integration.services.freeze.entryOf(proposalV2).then((entry) => entry?.sha256), v2sha);
    const realValidate = rig.integration.trunk.validateUpgradeChain.bind(rig.integration.trunk);
    let validateCalls = 0;
    (rig.integration.trunk as { validateUpgradeChain: typeof realValidate }).validateUpgradeChain = async (input) => {
      validateCalls += 1;
      if (validateCalls === 2) {
        return { ok: false, code: "trunk-item-invalid", message: "fault-injected apply recheck" };
      }
      return realValidate(input);
    };
    const failed = await rig.runtime.approve("vc-1", "dec-x");
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.code, "vca-apply-failed");
    assert.ok(validateCalls >= 2, "批准前 + apply 前各校验一次");
    const records = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(records.find((record) => record.applicationId === "vc-1")?.status, "approved", "apply 失败保持 approved");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 1, "trunk 指针不变");
    const run = await readRunManifest(rig.project.root, rig.project.runId);
    assert.equal(run.ok, true);
    if (run.ok) {
      assert.equal(run.manifest.documents.proposal?.path, PATHS.proposal, "run manifest 未 re-pin");
      assert.equal((run.manifest as { repins?: unknown[] }).repins, undefined);
    }
    // 恢复真实校验后重试 ⇒ applied、re-pin、trunk+1。
    (rig.integration.trunk as { validateUpgradeChain: typeof realValidate }).validateUpgradeChain = realValidate;
    const retry = await rig.runtime.approve("vc-1", "dec-x");
    assert.equal(retry.ok, true, retry.ok ? "" : `${retry.code}: ${retry.message ?? ""}`);
    if (retry.ok) assert.equal(retry.value.record.status, "applied");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 2);
    const runAfter = await readRunManifest(rig.project.root, rig.project.runId);
    if (runAfter.ok) assert.ok((runAfter.manifest as { repins?: unknown[] }).repins !== undefined, "重试成功后 re-pin");
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 5. Bootstrap 两条路径 ————————————————

test("bootstrap：首次 handoff pin 写 handoff-pin-bootstrap 冻结（pin 只 pin 冻结文档）", async () => {
  const project = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    const draft = await ensureDraftRun(project.root, FLOW_ID, new Date(AT));
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    const pinned = await pinRun(project.root, draft.manifest.runId, {
      d3: { decisionId: "dec-pin", targetRoleIds: ["impl"] },
    });
    assert.equal(pinned.ok, true, pinned.ok ? "" : `${pinned.code}: ${pinned.reason}`);
    if (!pinned.ok) return;
    assert.equal(pinned.manifest.state, "pinned");

    const baseline = await fs.readFile(path.join(project.root, ".ans/state/versions.jsonl"), "utf8");
    assert.match(baseline, /"reason":"handoff-pin-bootstrap"/);
    assert.match(baseline, /"origin":"application"/);
    assert.match(baseline, /"applicationId":"bootstrap-handoff-pin"/);
    assert.ok(!baseline.includes('"decidedBy":"customer"'), "bootstrap 不冒充客户");

    assert.equal(versionedDocFreezeState(project.root, PATHS.proposal, true), "frozen");
    const pinDecision = versionedDocOverwriteDecision({
      relPath: PATHS.proposal,
      exists: true,
      frozen: "frozen",
      operation: "pin",
    });
    assert.equal(pinDecision.allowed, true);
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // 反例：baseline 已有冻结记录（ready 严格模式）时，pin 未冻结的新版本 ⇒ versioned-doc-not-frozen。
  const strict = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    const modulesSha = strict.hashes[PATHS.modules]!;
    const appended = await strict.registry.appendDocFreezeRecords([
      {
        path: PATHS.modules,
        version: 1,
        sha256: modulesSha,
        freeze: {
          schema: "doc-freeze/v1",
          applicationId: "migration",
          reason: "migrated-legacy",
          origin: "application",
          frozenAt: AT,
        },
      },
    ]);
    assert.deepEqual(appended, { ok: true });
    await strict.registry.refreshSnapshot();
    const draft = await ensureDraftRun(strict.root, FLOW_ID, new Date(AT));
    assert.equal(draft.ok, true);
    if (!draft.ok) return;
    const denied = await pinRun(strict.root, draft.manifest.runId, {
      d3: { decisionId: "dec-pin", targetRoleIds: ["impl"] },
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "versioned-doc-not-frozen");
    const after = await fs.readFile(path.join(strict.root, ".ans/state/versions.jsonl"), "utf8");
    assert.ok(!after.includes('"reason":"handoff-pin-bootstrap"'), "冻结失败不得写 pin bootstrap 记录");
  } finally {
    await fs.rm(strict.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("bootstrap：无 trunk VCA（baseTrunk:null + bootstrap:true）批准 → 冻结目标并建立 trunk v1", async () => {
  const rig = await setup({ migrate: true, withRun: false, freezeKeys: [] });
  try {
    assert.equal(await rig.integration.trunk.current(), null);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
    const submitted = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: null,
      bootstrap: true,
      targets: [{ kind: "contract", path: v2, action: "add" }],
      summary: "bootstrap v2",
      applicationId: "vc-1",
      at: AT,
    });
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);
    const presented = await rig.runtime.present("vc-1");
    assert.equal(presented.ok, true, presented.ok ? "" : `${presented.code}: ${presented.message ?? ""}`);
    if (!presented.ok) return;
    assert.equal(presented.value.resultTrunkVersion, 1);
    const current = await rig.integration.trunk.current();
    assert.equal(current?.trunkVersion, 1);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.source, "bootstrap");
    const frozen = await rig.integration.services.freeze.entryOf(v2);
    assert.equal(frozen?.freeze.reason, "bootstrap-vca-approved");
    assert.equal(frozen?.freeze.origin, "application");
    assert.equal(frozen?.freeze.decidedBy, undefined);
    assert.equal(frozen?.sha256, v2sha);
    const events = await ledgerOf(rig);
    const freezeEvent = eventOf(events, "doc.freeze")[0]!;
    assert.equal(freezeEvent.reason, "bootstrap-vca-approved");
    assert.equal(freezeEvent.origin, "application");
    assert.equal(freezeEvent.decidedBy, undefined);
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 6. 冻结迁移 / 派生缓存 / draft 标记 ————————————————

test("冻结：missing ⇒ 既有文档一律冻结；corrupt ⇒ fail-closed；doc-freezes 派生缓存可重建且以 R9 为准", async () => {
  const project = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    let migrationDone = false;
    const integration = createVersionChangeIntegration({
      projectRoot: project.root,
      now: () => new Date(AT),
      migrationCompleted: () => migrationDone,
    });
    assert.equal(await integration.services.freeze.state(), "missing");
    const migrated = await integration.ensureMigration(AT2);
    assert.equal(migrated.ok, true, migrated.ok ? "" : `${migrated.code}: ${migrated.message ?? ""}`);
    if (!migrated.ok) return;
    assert.equal(migrated.report?.migrated.length, 7, "七类版本化文档一律冻结（migrated-legacy）");
    assert.ok(migrated.report?.migrated.every((entry) => entry.freeze.reason === "migrated-legacy"));
    assert.ok(migrated.report?.migrated.every((entry) => entry.freeze.decidedBy === undefined));

    // 迁移后模拟重启（completed=true）：ready；守卫快照 frozen。
    migrationDone = true;
    const reopened = createVersionChangeIntegration({
      projectRoot: project.root,
      now: () => new Date(AT),
      migrationCompleted: () => true,
    });
    assert.equal(await reopened.services.freeze.state(), "ready");
    await reopened.services.freeze.ensureReady();
    assert.equal(versionedDocFreezeState(project.root, PATHS.proposal, true), "frozen");

    // 派生缓存：缺失 ⇒ 从 baseline 重建；一致 ⇒ consistent；损坏 ⇒ fail-closed（不自动重建）。
    assert.deepEqual(await reopened.loadFreezeCache().then((cache) => (cache.ok ? "ok" : cache.reason)), "missing");
    const rebuilt = await reopened.freezeCache.rebuildFromBaseline();
    assert.equal(rebuilt.ok, true);
    const cache = await reopened.loadFreezeCache();
    assert.equal(cache.ok, true);
    if (cache.ok) {
      assert.equal(cache.value.state, "ready");
      assert.ok(cache.value.entries.some((entry) => entry.path === PATHS.proposal && entry.frozen === true));
    }
    assert.equal((await reopened.freezeCache.reconcile()).state, "consistent");
    await fs.writeFile(path.join(project.root, ".ans/state/doc-freezes.json"), "{broken", "utf8");
    const corruptCache = await reopened.freezeCache.reconcile();
    assert.equal(corruptCache.state, "unusable");
    if (corruptCache.state === "unusable") assert.equal(corruptCache.reason, "cache-corrupt");
    // 缓存损坏不影响 R9 权威：注册表/冻结查询仍可用。
    assert.equal((await reopened.services.freeze.isFrozen(PATHS.proposal)).state, "frozen");

    // migrated-draft：证据标记（baseline draft-marker，不写 doc.freeze）；标注后可改。
    const draftV2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(project.root, draftV2, "version: 2\n# draft\n");
    const marker = await reopened.services.freeze.recordDraftMarker({
      path: draftV2,
      version: 2,
      evidence: "无客户确认记录（测试证据）",
      at: AT2,
    });
    assert.equal(marker.ok, true);
    assert.equal((await reopened.services.freeze.isFrozen(draftV2)).state, "draft");
    assert.equal((await reopened.services.freeze.migrationMarkOf(draftV2, 2)), "migrated-draft");
    assert.equal(versionedDocFreezeState(project.root, draftV2, true), "draft");
    const draftEdit = versionedDocOverwriteDecision({ relPath: draftV2, exists: true, frozen: "draft", operation: "write" });
    assert.equal(draftEdit.allowed, true);
    const baseline = await fs.readFile(path.join(project.root, ".ans/state/versions.jsonl"), "utf8");
    assert.match(baseline, /"event":"draft-marker"/);
    assert.ok(!baseline.includes('"reason":"migrated-draft"'), "migrated-draft 不是 freeze reason");
  } finally {
    await fs.rm(project.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  // corrupt ⇒ fail-closed（不迁移/不重建，守卫 unknown 拒绝）。
  const corruptRoot = await createTrunkProject({ withRun: false, freezeKeys: [] });
  try {
    await fs.mkdir(path.join(corruptRoot.root, ".ans/state"), { recursive: true });
    await fs.writeFile(path.join(corruptRoot.root, ".ans/state/versions.jsonl"), "not-json\n", "utf8");
    await fs.writeFile(path.join(corruptRoot.root, ".ans/state/versions.initialized"), "{}\n", "utf8");
    const corrupt = createVersionChangeIntegration({
      projectRoot: corruptRoot.root,
      now: () => new Date(AT),
      migrationCompleted: () => true,
    });
    const migrated = await corrupt.ensureMigration(AT2);
    assert.equal(migrated.ok, false);
    if (!migrated.ok) assert.equal(migrated.code, "doc-freeze-registry-corrupt");
    assert.equal(await corrupt.services.freeze.isFrozen(PATHS.proposal).then((lookup) => lookup.state), "unknown");
    assert.equal(versionedDocFreezeState(corruptRoot.root, PATHS.proposal, true), "unknown");
    const denied = versionedDocOverwriteDecision({
      relPath: PATHS.proposal,
      exists: true,
      frozen: "unknown",
      operation: "write",
    });
    assert.equal(denied.allowed, false);
  } finally {
    await fs.rm(corruptRoot.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

// ———————————————— 7. 轻量重构 ————————————————

test("重构：convener 发起/应用调度层管理/机械写集/无客户决定/不产生 trunk 版本；越界提示转 VCA", async () => {
  const rig = await setup();
  try {
    const submitted = await rig.refactor.submit({
      requestId: "rf-1",
      flowId: FLOW_ID,
      roleId: "convener",
      title: "模块内小重构",
      reason: "清理重复代码",
      scope: { modules: ["impl-core"], paths: ["src/"], roles: ["impl"] },
      at: AT,
    });
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.code}: ${submitted.message ?? ""}`);
    if (!submitted.ok) return;
    assert.ok(submitted.value.enforcement.writeSet.includes("src/"));
    assert.ok(submitted.value.enforcement.writeSet.includes("impl-core"));
    assert.ok(submitted.value.enforcement.forbiddenKinds.includes("versioned-doc"));
    assert.equal(submitted.value.record.managedBy, "application-scheduler");
    assert.equal(submitted.value.record.status, "requested");
    assert.equal(await rig.integration.trunk.current(), null, "重构不产生 trunk 版本");

    const nonConvener = await rig.refactor.submit({
      requestId: "rf-2",
      flowId: FLOW_ID,
      roleId: "product",
      title: "越权",
      reason: "越权",
      scope: { modules: ["impl-core"], paths: ["src/"], roles: ["impl"] },
      at: AT,
    });
    assert.equal(nonConvener.ok, false);
    if (!nonConvener.ok) assert.equal(nonConvener.code, "refactor-role-not-allowed");

    for (const [requestId, forbidden] of [
      ["rf-3", "docs/proposals/demo-proposal-v1.md"],
      ["rf-4", "角色卡/impl/boundary.yaml"],
      ["rf-5", "docs/workflow.md"],
      ["rf-6", "docs/scheduling/demo-team-v1.md"],
    ] as const) {
      const rejected = await rig.refactor.submit({
        requestId,
        flowId: FLOW_ID,
        roleId: "convener",
        title: "越界",
        reason: "越界",
        scope: { modules: [], paths: [forbidden], roles: ["impl"] },
        at: AT,
      });
      assert.equal(rejected.ok, false, `${forbidden} 必须被拒绝`);
      if (!rejected.ok) {
        assert.ok(
          rejected.code === "refactor-scope-forbidden" || rejected.code === "refactor-write-set-forbidden",
          `${forbidden} => ${rejected.code}`,
        );
        assert.match(rejected.guidance ?? "", /版本变更申请/);
      }
    }

    const closed = await rig.refactor.close({ requestId: "rf-1", status: "closed", message: "done", at: AT2 });
    assert.equal(closed.ok, true);

    const events = await ledgerOf(rig);
    const refactorEvents = eventOf(events, "refactor.request");
    assert.equal(refactorEvents.length, 2, "提交 + 关闭各一条");
    for (const event of refactorEvents) {
      assert.equal(event.initiatedBy, "convener");
      assert.equal(event.managedBy, "application-scheduler");
      assert.equal((event as { decidedBy?: string }).decidedBy, undefined, "refactor 无客户决定");
    }
    assert.ok(!eventOf(events, "version.change").length);
    assert.ok(!events.some((event) => event.kind === "trunk.state"));
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 8. 客户主权 / 旧入口 / F15 / F17 ————————————————

test("客户主权与旧入口：VCA 卡不被 @决策/判断器代选；低层 run-change 保留；F15 roleCards；F17 无 refactor:request", async () => {
  const rig = await setup({ withDirective: true });
  try {
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, "version: 2\n# v2\n");
    const record = {
      v: 1 as const,
      schema: "version-change/v1" as const,
      applicationId: "vc-1",
      kind: "version-upgrade" as const,
      initiatorRoleId: "product" as const,
      flowId: "demo",
      baseTrunk: null,
      bootstrap: true,
      targets: [{ kind: "contract" as const, path: v2, action: "add" as const, toSha256: sha256("x") }],
      summary: "主权测试",
      status: "submitted" as const,
      submittedAt: AT,
      applicationSha256: sha256("y"),
      at: AT,
    };
    const built = buildVersionChangeCard({ record });
    assert.ok(built !== undefined);
    const pending = rig.channel.customerInput(built!.request, CUSTOMER_CTX);
    const payload = await waitFor(() => rig.pushed.shift(), "VCA 卡呈现");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(rig.directiveCalls.count, 0, "@决策 指令不得消费 VCA 卡");
    assert.equal(rig.judgeCalls.count, 0, "VCA 卡不得进入判断器");
    assert.equal(rig.pushed.length, 0, "原卡呈现客户（无第二张）");
    const answered = rig.channel.respond({
      id: payload.id,
      decision: { kind: "choice", selected: ["reject-version-change"] },
    });
    assert.equal(answered.ok, true);
    const outcome = await pending;
    assert.equal(outcome?.outcome, "answered");
    // D1 映射：judge/directive 回包一律 unavailable（客户本人）。
    assert.deepEqual(
      toVersionChangeOutcome({
        outcome: "answered",
        value: { selected: ["approve-version-change"] },
        decisionId: "decision-j",
        operatorId: "judge:demo",
      }),
      { outcome: "unavailable" },
    );
    assert.deepEqual(
      toVersionChangeOutcome({
        outcome: "answered",
        value: { selected: ["approve-version-change"] },
        decisionId: "decision-d",
        operatorId: "directive:d-1",
      }),
      { outcome: "unavailable" },
    );

    // 旧入口：低层 run-change 卡保留（非 UI 入口）；旧文案 key 已迁移到「版本变更」。
    const runChange = buildRunChangeCard({
      requestId: "rq-1",
      runId: "run-1",
      flowId: "demo",
      current: { state: "pinned", documents: {}, schemas: {} },
    });
    assert.deepEqual(
      runChange.request.options.map((option) => option.id),
      ["continue-frozen", "stop-and-restart", "stop"],
    );
    assert.equal(zhCN["ui.runChange.entry"], "版本变更");
    assert.equal(enUS["ui.runChange.entry"], "Version changes");
    assert.match(zhCN["ui.projectState.pinnedHint"], /版本变更/);
    assert.match(enUS["ui.projectState.pinnedHint"], /Version changes/);
    assert.match(zhCN["main.versionDecision.error.runChangeRequired"], /版本变更/);

    // i18n：stableWrite/versionChange/refactor 中文成对且非空。
    for (const prefix of ["ui.stableWrite.", "ui.versionChange.", "ui.refactor."]) {
      const zhKeys = Object.keys(zhCN).filter((key) => key.startsWith(prefix)).sort();
      const enKeys = Object.keys(enUS).filter((key) => key.startsWith(prefix)).sort();
      assert.ok(zhKeys.length > 0, `${prefix} 无中文 key`);
      assert.deepEqual(zhKeys, enKeys, `${prefix} zh/en key 不一致`);
      for (const key of zhKeys) {
        assert.notEqual((zhCN as unknown as Record<string, string>)[key]!.trim(), "", `${key} 中文为空`);
        assert.notEqual((enUS as unknown as Record<string, string>)[key]!.trim(), "", `${key} 英文为空`);
      }
    }

    // F15：trunk:state 载荷含 workflow / roleCards / boundaries 三类 stable 快照。
    const view: TrunkStatusView = {
      availability: "frozen",
      derived: false,
      frozenDocuments: [],
      manifest: {
        schema: "trunk/v1",
        trunkVersion: 1,
        source: "bootstrap",
        previous: null,
        flowId: "demo",
        runId: null,
        artifacts: {
          documents: {},
          execution: { teamPlan: null, flow: null },
          workflow: { kind: "workflow", path: PATHS.workflow, sha256: sha256("w") },
          roleCards: { impl: { kind: "role-card", path: PATHS.roleCard, sha256: sha256("r") } },
          boundaries: { impl: { kind: "boundary", path: PATHS.boundary, sha256: sha256("b") } },
        },
        digest: sha256("d"),
        createdAt: AT,
        updatedAt: AT,
      },
      stable: {
        workflow: { kind: "workflow", path: PATHS.workflow, sha256: sha256("w") },
        roleCards: { impl: { kind: "role-card", path: PATHS.roleCard, sha256: sha256("r") } },
        boundaries: { impl: { kind: "boundary", path: PATHS.boundary, sha256: sha256("b") } },
      },
      pendingReattach: [],
      issues: [],
    };
    const payloadState = buildTrunkStatePayload({
      projectRoot: rig.project.root,
      view,
      generatedAt: AT,
      cacheHealth: "ok",
      freezeCount: 0,
      versionChanges: [],
      refactors: [],
    });
    assert.equal(payloadState.stable.workflow?.kind, "workflow");
    assert.equal(payloadState.stable.roleCards["impl"]?.kind, "role-card");
    assert.equal(payloadState.stable.boundaries["impl"]?.kind, "boundary");
    assert.equal(payloadState.availability, "frozen");

    // F17：D1 不提供 refactor:request（能力工具唯一路径）；禁止通道不出现在允许通道表。
    assert.ok(VERSION_CHANGE_FORBIDDEN_IPC_CHANNELS.includes("refactor:request"));
    const allowedChannels: readonly string[] = Object.values(VERSION_CHANGE_IPC_CHANNELS);
    for (const forbidden of VERSION_CHANGE_FORBIDDEN_IPC_CHANNELS) {
      assert.ok(!allowedChannels.includes(forbidden), `${forbidden} 不得注册为 IPC 通道`);
    }
  } finally {
    await cleanup(rig);
  }
});

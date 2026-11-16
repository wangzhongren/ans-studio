// test/测试/version-change-integration.test.ts
// T1（2026-11-05 trunk-amendment Batch 5）：跨层集成——真实 Model（C1 契约）→ 真实 Service
// （C2c VCA/冻结/重构校验）→ 真实 Provider（S1 存储 + R9 baseline + doc-freezes 派生缓存）→
// 真实 S2 trunk service / S3 run-manifest 冻结校验 → 真实 S4 Pipeline（version-change-runtime /
// refactor-runtime / trunk-runtime）→ 真实账本（tasks.jsonl，readTaskState 逐事件校验）。
//
// 替身仅限：direct 通知收集与通知收集；不启动 Electron、不触网、不改产品代码。
// 当前语义（e71501c role-direct）：VCA 由 product/rapporteur 以真实会话角色 + operationId +
// 显式 base/expectedFrom 直接提交（submitDirect）；旧客户批准卡通道（submit/present/approve/
// reject/runAmendmentItems）已关闭、历史请求只读。覆盖：
//   · version-upgrade 直接提交 → role-direct 冻结 + R9 记录 + trunk t+1；expectedFrom 重验；
//   · detail-amendment 整单直接提交（逐项客户卡通道关闭、历史只读）；
//   · 历史客户拒绝/批准入口只读 + 显式 supersede；发起角色/目标范围/base/并发/幂等矩阵；
//   · AC-5：无效 roster / D3 越界 / 版本链不匹配 / apply 前重验 ⇒ 直接提交 fail-closed；
//   · bootstrap：显式 baseTrunk:null + 真实 intent-confirmed 才建立 t1（缺证据 fail-closed）；
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
import { refreshAndInstallVersionedDocFreezeSnapshot } from "../../src/service/boundary/resolve-boundary.ts";
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
  directNotifications: Array<{ key: string; recipientRoleId: string; message: string }>;
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
  const directNotifications: Array<{ key: string; recipientRoleId: string; message: string }> = [];
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
    // direct 提交在真实提交后必须能幂等通知 chief/convener/发起角色；无 sink ⇒ committed-pending-recovery。
    notifyDirect: async (input) => {
      directNotifications.push({ key: input.key, recipientRoleId: input.recipientRoleId, message: input.message });
    },
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
    directNotifications,
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

/** 当前 trunk 指针 → direct 提交要求的显式 base（TrunkCommitRef `{version, digest}`）。 */
function directBaseOf(current: { trunkVersion: number; digest: string }): { version: number; digest: string } {
  return { version: current.trunkVersion, digest: current.digest };
}

/**
 * direct 冻结由 Provider（O 层）追加 R9 记录；G 的同步守卫快照须由调用方经 G 公共刷新安装
 * （生产 = 桌面栈 initialize / 会话边界解析；集成测试直连 S2/S4，须显式走同一公共路径）。
 */
async function refreshGuardSnapshot(rig: Rig): Promise<void> {
  await refreshAndInstallVersionedDocFreezeSnapshot(rig.project.root, {
    migrationCompleted: true,
    now: () => new Date(AT),
  });
}

/** direct 提交由运行时自己的 trunk service 实例追加 R9；集成层的冻结查询缓存须按公共 Service 刷新。 */
async function refreshFreezeRegistry(rig: Rig): Promise<void> {
  const ready = await rig.integration.services.freeze.ensureReady();
  assert.equal(ready.ok, true, ready.ok ? "" : `${ready.code}`);
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

// ———————————————— 1. VCA version-upgrade 全链路（role-direct 直接提交） ————————————————

test("VCA：product version-upgrade 经真实直接提交（role-direct）→ 冻结+R9+trunk t2；冻结后守卫拒绝同版本覆盖", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
    const current = (await rig.integration.trunk.current())!;

    // 当前真实语义（e71501c role-direct）：product 以真实会话角色 + operationId + 显式 base/expectedFrom
    // 直接提交；旧的客户批准卡通道（submit/present）已关闭，没有 submitted/approved 中间阶段。
    const submitted = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-vc-1",
      baseTrunk: directBaseOf(current),
      targets: [{ kind: "contract", path: v2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.proposal] }],
      summary: "补一个契约细节",
    }, "product");
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.errorCode}: ${submitted.message ?? ""}`);
    assert.equal(submitted.status, "applied");
    assert.match(submitted.applicationId ?? "", /^vc-\d+$/);
    assert.equal(submitted.operationId, "op-vc-1");

    // 关闭的旧通道：submit/present 一律 vca-channel-unavailable，不创建/不改写客户批准卡。
    const legacySubmit = await rig.runtime.submit({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "legacy",
      applicationId: "vc-2",
      at: AT,
    });
    assert.equal(legacySubmit.ok, false);
    if (!legacySubmit.ok) assert.equal(legacySubmit.code, "vca-channel-unavailable");
    const legacyPresent = await rig.runtime.present(submitted.applicationId!);
    assert.equal(legacyPresent.ok, false);
    if (!legacyPresent.ok) assert.equal(legacyPresent.code, "vca-channel-unavailable");

    const records = await rig.runtime.list({ flowId: FLOW_ID });
    const record = records.find((candidate) => candidate.applicationId === submitted.applicationId);
    assert.equal(record?.status, "applied");
    assert.equal(record?.operationId, "op-vc-1");
    assert.equal(record?.actionSource?.kind, "role-direct");
    assert.equal(record?.actionSource?.actorRoleId, "product");

    // 运行时 direct service 已追加 R9；集成层冻结查询缓存按公共 Service 刷新后再核验。
    await refreshFreezeRegistry(rig);
    const currentAfter = await rig.integration.trunk.current();
    assert.equal(currentAfter?.trunkVersion, 2);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.documents.proposal?.path, v2);
    assert.equal(status.manifest?.artifacts.documents.proposal?.sha256, v2sha);
    assert.deepEqual(await rig.integration.trunk.verify(), { ok: true, violations: [] });

    // R9 权威记录 + 冻结归属：direct 冻结以真实 role 来源（非客户、无 decisionId/decidedBy）。
    const baseline = await fs.readFile(path.join(rig.project.root, ".ans/state/versions.jsonl"), "utf8");
    assert.match(baseline, /"reason":"role-direct-applied"/);
    assert.match(baseline, /"origin":"role-direct"/);
    assert.ok(!baseline.includes('"decidedBy":"customer"'), "direct 冻结不冒充客户");
    const frozen = await rig.integration.services.freeze.entryOf(v2);
    assert.equal(frozen?.freeze.reason, "role-direct-applied");
    assert.equal(frozen?.freeze.origin, "role-direct");
    assert.equal(frozen?.freeze.decidedBy, undefined);
    assert.equal(frozen?.freeze.decisionId, undefined);
    assert.equal(frozen?.freeze.actorRoleId, "product");
    assert.equal(frozen?.sha256, v2sha);

    // 跨层守卫：经 G 公共刷新装入同步快照；冻结后同版本覆盖被拒；新版本 v3（不存在 ⇒ draft）允许。
    await refreshGuardSnapshot(rig);
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
    const versionEvents = eventOf(events, "version.change");
    assert.equal(versionEvents.length, 1, "direct 提交只有一个 applied 事件（无 submitted/approved 阶段）");
    assert.equal(versionEvents[0]!.status, "applied");
    assert.equal(versionEvents[0]!.origin, "role-direct");
    assert.equal(versionEvents[0]!.decidedBy, undefined);
    assert.equal(versionEvents[0]!.decisionId, undefined);
    assert.equal(versionEvents[0]!.operationId, "op-vc-1");
    assert.equal(versionEvents[0]!.actionSource?.kind, "role-direct");
    assert.equal(versionEvents[0]!.actionSource?.actorRoleId, "product");
    assert.equal(versionEvents[0]!.resultTrunkVersion, 2);
    // role-direct 提交后按固定 key 通知 chief/convener/发起角色；sink 幂等由调用方保证。
    assert.deepEqual(
      rig.directNotifications.map((entry) => entry.recipientRoleId).sort(),
      ["chief", "convener", "product"],
    );
    assert.ok(rig.directNotifications.every((entry) => entry.key.startsWith("op-vc-1:")));
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 2. VCA detail-amendment 整单直接提交 ————————————————

test("VCA：detail-amendment 整单直接提交（role-direct）→ 修正案与 applied 目标冻结 + trunk t2；逐项客户卡通道关闭", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const current = (await rig.integration.trunk.current())!;
    const v2 = "docs/proposals/demo-proposal-v2.md";
    const v2sha = await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
    const team2 = "docs/scheduling/demo-team-v2.md";
    const team2sha = await writeProjectFile(rig.project.root, team2, "---\nschema: teamPlanSchema:3\n---\n# team v2\n");
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

    // 当前真实语义：rapporteur 以整单方式直接提交修正案（operationId + 显式 base/expectedFrom）；
    // 提交即应用全部 target，无需（也不存在）客户批准/逐项确认阶段。
    const submitted = await rig.runtime.submitDirect!({
      kind: "detail-amendment",
      initiatorRoleId: "rapporteur",
      flowId: FLOW_ID,
      operationId: "op-am-1",
      baseTrunk: directBaseOf(current),
      targets: [
        { kind: "contract", path: v2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.proposal] },
        { kind: "execution", path: team2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.teamPlan] },
      ],
      amendmentId: "am-1",
      amendmentDocPath: amendmentRel,
      summary: "修正案",
    }, "rapporteur");
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.errorCode}: ${submitted.message ?? ""}`);
    assert.equal(submitted.status, "applied");
    assert.match(submitted.applicationId ?? "", /^vc-\d+$/);
    const trunkAfter = await rig.integration.trunk.current();
    assert.equal(trunkAfter?.trunkVersion, 2);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.documents.proposal?.path, v2);
    assert.equal(status.manifest?.artifacts.execution.teamPlan?.path, team2, "整单直接提交应用全部 target");

    // 修正案与 contract 目标均按 role-direct-applied 冻结（真实 role 来源，不冒充客户）；
    // execution 仍不纳入 guard 冻结（C15 语义不变）。
    await refreshFreezeRegistry(rig);
    const amendmentEntry = await rig.integration.services.freeze.entryOf(amendmentRel);
    assert.equal(amendmentEntry?.freeze.reason, "role-direct-applied");
    assert.equal(amendmentEntry?.freeze.origin, "role-direct");
    assert.equal(amendmentEntry?.freeze.decidedBy, undefined);
    assert.equal(amendmentEntry?.freeze.decisionId, undefined);
    assert.equal(amendmentEntry?.freeze.actorRoleId, "rapporteur");
    const frozenApplied = await rig.integration.services.freeze.isFrozen(v2);
    assert.equal(frozenApplied.state, "frozen");
    assert.equal(await rig.integration.services.freeze.entryOf(team2), undefined, "execution 目标不纳入 guard 冻结");
    assert.ok(team2sha.length === 64);

    // 关闭的逐项客户卡通道：runAmendmentItems/present 均为 vca-channel-unavailable
    // （历史请求只读；由原发起人显式整单重提）。
    const items = await rig.runtime.runAmendmentItems(submitted.applicationId!);
    assert.equal(items.ok, false);
    if (!items.ok) assert.equal(items.code, "vca-channel-unavailable");
    const presented = await rig.runtime.present(submitted.applicationId!);
    assert.equal(presented.ok, false);
    if (!presented.ok) assert.equal(presented.code, "vca-channel-unavailable");

    await refreshGuardSnapshot(rig);
    assert.equal(versionedDocFreezeState(rig.project.root, amendmentRel, true), "frozen");
    const editAmendment = versionedDocOverwriteDecision({
      relPath: amendmentRel,
      exists: true,
      frozen: "frozen",
      operation: "edit",
    });
    assert.equal(editAmendment.allowed, false);

    const events = await ledgerOf(rig);
    const versionEvents = eventOf(events, "version.change");
    assert.equal(versionEvents.length, 1);
    assert.equal(versionEvents[0]!.status, "applied");
    assert.equal(versionEvents[0]!.origin, "role-direct");
    assert.equal(versionEvents[0]!.operationId, "op-am-1");
    assert.equal(versionEvents[0]!.vcKind, "detail-amendment");
    assert.equal(versionEvents[0]!.decidedBy, undefined);
    assert.equal(versionEvents[0]!.decisionId, undefined);
    assert.equal(versionEvents[0]!.resultTrunkVersion, 2);
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 3. VCA 历史客户入口只读 + 显式 supersede ————————————————

test("VCA：历史客户拒绝/批准入口只读（vca-conflict）⇒ 不冻结/不 re-pin；显式 supersede 才可重提", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const current = (await rig.integration.trunk.current())!;
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
    // 历史 pending（客户卡时代记录）仍可读，但新的客户批准/拒绝不得结算它。
    const created = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: current,
      targets: [{ kind: "contract", path: v2, action: "modify" }],
      summary: "历史 pending",
      applicationId: "vc-2",
      at: AT,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.status, "draft", "历史 create 只建草稿（客户卡时代 submit 才进 pending）");
    // 真实历史 pending：经 Service 旧 submit 状态机进入 submitted（运行时客户通道已关闭，但历史记录仍可读）。
    const legacySubmitted = await rig.integration.services.vca.submit({ applicationId: "vc-2", at: AT });
    assert.equal(legacySubmitted.ok, true, legacySubmitted.ok ? "" : `${legacySubmitted.code}: ${legacySubmitted.message ?? ""}`);
    const records = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(records.find((record) => record.applicationId === "vc-2")?.status, "submitted", "历史 pending 保持只读");

    const rejected = await rig.runtime.reject("vc-2", "dec-no", "内容不够清楚");
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "vca-conflict");
    const approved = await rig.runtime.approve("vc-2", "dec-no");
    assert.equal(approved.ok, false);
    if (!approved.ok) assert.equal(approved.code, "vca-conflict");

    const trunkAfter = await rig.integration.trunk.current();
    assert.equal(trunkAfter?.trunkVersion, 1);
    const recordsAfterReject = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(recordsAfterReject.find((record) => record.applicationId === "vc-2")?.status, "submitted", "历史记录保持只读");
    assert.equal(await rig.integration.services.freeze.entryOf(v2), undefined, "拒绝/批准均不冻结目标");
    await refreshGuardSnapshot(rig);
    assert.equal(versionedDocFreezeState(rig.project.root, v2, true), "draft");
    const targetEdit = versionedDocOverwriteDecision({ relPath: v2, exists: true, frozen: "draft", operation: "edit" });
    assert.equal(targetEdit.allowed, true);

    const events = await ledgerOf(rig);
    assert.ok(!eventOf(events, "version.change").some((event) => event.status === "rejected" || event.status === "approved"));
    assert.ok(!eventOf(events, "doc.freeze").some((event) => event.path === v2));

    // 当前真实语义：只有显式 supersede 的真实直接提及才推进；旧记录字节不变（视图标 superseded）。
    const submitted = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-supersede-1",
      baseTrunk: directBaseOf(current),
      targets: [{ kind: "contract", path: v2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.proposal] }],
      supersedesApplicationId: "vc-2",
      summary: "显式重提",
    }, "product");
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.errorCode}: ${submitted.message ?? ""}`);
    assert.equal(submitted.status, "applied");
    const recordsAfter = await rig.runtime.list({ flowId: FLOW_ID });
    const legacyView = recordsAfter.find((record) => record.applicationId === "vc-2");
    assert.equal(legacyView?.status, "superseded", "旧记录只读视图标 superseded");
    assert.match(legacyView?.message ?? "", /Replaced by/);
    assert.equal(recordsAfter.find((record) => record.applicationId === submitted.applicationId)?.status, "applied");
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
    const v2sha = await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
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

    // 并发/幂等（当前语义）：direct 提交按 operationId 幂等；同 flow 的历史 pending 阻断新的
    // direct 提交，只有显式 supersedesApplicationId 才能推进（不复用/不改写旧记录）。
    const firstInput = {
      kind: "version-upgrade" as const,
      initiatorRoleId: "product" as const,
      flowId: FLOW_ID,
      operationId: "op-matrix-1",
      baseTrunk: directBaseOf(current),
      targets: [{ kind: "contract" as const, path: v2, action: "modify" as const, expectedFromSha256: rig.project.hashes[PATHS.proposal] }],
      summary: "first",
    };
    const first = await rig.runtime.submitDirect!(firstInput, "product");
    assert.equal(first.ok, true, first.ok ? "" : `${first.errorCode}: ${first.message ?? ""}`);
    assert.equal(first.status, "applied");
    const trunkAfterFirst = (await rig.integration.trunk.current())!;
    assert.equal(trunkAfterFirst.trunkVersion, 2);
    const again = await rig.runtime.submitDirect!(firstInput, "product");
    assert.equal(again.ok, true, "同 operationId/同请求幂等返回");
    assert.equal(again.applicationId, first.applicationId);
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 2, "幂等重放不重复推进 trunk");

    // 历史 pending 阻断新的 direct（无 supersede）⇒ vca-pending。
    const v3 = "docs/proposals/demo-proposal-v3.md";
    const v3sha = await writeProjectFile(rig.project.root, v3, lines("---", "schema: project-proposal/v2", `intent: ${PATHS.intent}`, "---", "# proposal v3", ""));
    const legacy = await rig.integration.services.vca.create({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      baseTrunk: trunkAfterFirst,
      targets: [{ kind: "contract", path: v3, action: "add" }],
      summary: "legacy pending",
      applicationId: "vc-2",
      at: AT2,
    });
    assert.equal(legacy.ok, true);
    // 真实历史 pending：旧 Service submit 状态机（运行时客户通道关闭，不影响历史记录只读语义）。
    const legacySubmitted = await rig.integration.services.vca.submit({ applicationId: "vc-2", at: AT2 });
    assert.equal(legacySubmitted.ok, true, legacySubmitted.ok ? "" : `${legacySubmitted.code}: ${legacySubmitted.message ?? ""}`);
    const blocked = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-matrix-2",
      baseTrunk: directBaseOf(trunkAfterFirst),
      targets: [{ kind: "contract", path: v3, action: "add", expectedFromSha256: v2sha }],
      summary: "blocked by legacy pending",
    }, "product");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.errorCode, "vca-pending");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 2, "被阻断的提交不改指针");
    const superseded = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-matrix-3",
      baseTrunk: directBaseOf(trunkAfterFirst),
      targets: [{ kind: "contract", path: v3, action: "add", expectedFromSha256: v2sha }],
      supersedesApplicationId: "vc-2",
      summary: "explicit supersede",
    }, "product");
    assert.equal(superseded.ok, true, superseded.ok ? "" : `${superseded.errorCode}: ${superseded.message ?? ""}`);
    assert.equal(superseded.status, "applied");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 3);
    const finalRecords = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(finalRecords.find((record) => record.applicationId === "vc-2")?.status, "superseded");
    assert.ok(v3sha.length === 64);
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 4b. 直接提交 expectedFrom 重验 ————————————————

test("VCA：直接提交 expectedFrom 重验（声明旧基线 hash 不符 ⇒ vca-target-invalid，不冻结/不 re-pin）", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const current = (await rig.integration.trunk.current())!;
    const v2 = "docs/proposals/demo-proposal-v2.md";
    await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
    // 提交时声明错误的旧基线 hash ⇒ PrepareDirectSubmission 在提交点前拒绝（不落记录/不冻结/不 re-pin）。
    const drifted = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-drift-1",
      baseTrunk: directBaseOf(current),
      targets: [{ kind: "contract", path: v2, action: "modify", expectedFromSha256: sha256("stale-baseline") }],
      summary: "drift",
    }, "product");
    assert.equal(drifted.ok, false);
    if (!drifted.ok) assert.equal(drifted.errorCode, "vca-target-invalid");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 1, "漂移不 re-pin");
    assert.equal(await rig.integration.services.freeze.entryOf(v2), undefined, "漂移不冻结");
    assert.equal((await rig.runtime.list({ flowId: FLOW_ID })).length, 0, "提交点前拒绝不产生 VCA 记录");
    const events = await ledgerOf(rig);
    assert.ok(!eventOf(events, "version.change").some((event) => event.status === "applied"));
    assert.ok(!eventOf(events, "doc.freeze").some((event) => event.path === v2));

    // 正确 hash ⇒ 一次提交即 applied。
    const submitted = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-drift-2",
      baseTrunk: directBaseOf(current),
      targets: [{ kind: "contract", path: v2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.proposal] }],
      summary: "drift retry",
    }, "product");
    assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.errorCode}: ${submitted.message ?? ""}`);
    assert.equal(submitted.status, "applied");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 2);
  } finally {
    await cleanup(rig);
  }
});

// ———————————————— 4c. AC-5 前置校验（批准前/apply 前 fail-closed） ————————————————

const NL = String.fromCharCode(10);
const lines = (...items: string[]): string => items.join(NL);
const PROPOSAL_V2_TEXT = lines("---", "schema: project-proposal/v2", `intent: ${PATHS.intent}`, "---", "# proposal v2", "");

/** 合法 roster v2（含拓扑章节）；proposal/architecture 引用可参数化以构造版本链不匹配。 */
function rosterV2Text(input: { proposal: string; architecture: string }): string {
  return lines(
    "---",
    "schema: project-roster/v3",
    `flowId: ${FLOW_ID}`,
    "version: 2",
    `intent: ${PATHS.intent}`,
    `proposal: ${input.proposal}`,
    `architecture: ${input.architecture}`,
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
    `    architectureSource: ${input.architecture}`,
    "---",
    "# 名单",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "management: [convener, impl]",
    "modules:",
    "  - id: impl-core",
    "    path: src/",
    "    roleId: impl",
    "roles:",
    "  - id: impl",
    "    modules: [impl-core]",
    "```",
  );
}

function modulesV2Text(architecturePath: string): string {
  return lines(
    "---",
    "schema: project-modules/v2",
    `flowId: ${FLOW_ID}`,
    "version: 2",
    "modules:",
    "  - id: impl-core",
    "    name: 实现",
    "    purpose: 实现模块",
    "    path: src/",
    "    category: core",
    "    publicContract: src/index.ts",
    `    architectureSource: ${architecturePath}`,
    "---",
    "# 模块清单 v2",
  );
}

function architectureV2Text(referencedProposal: string): string {
  return lines("---", "schema: project-architecture/v1", "---", "# architecture v2", "", `proposal: ${referencedProposal}`);
}

/**
 * 当前语义（role-direct）：AC-5 类前置/链校验发生在**直接提交点**（prepareDirectSubmission +
 * executeDirect 的 upgrade-chain 校验），失败即 fail-closed，不产生 applied/冻结/re-pin。
 */
async function assertDirectUpgradeRejected(
  rig: Rig,
  input: Parameters<NonNullable<VersionChangeRuntime["submitDirect"]>>[0],
  expectedErrorCode: string,
): Promise<void> {
  const result = await rig.runtime.submitDirect!(input, "product");
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, expectedErrorCode);
  for (const target of input.targets) {
    assert.equal(await rig.integration.services.freeze.entryOf(target.path), undefined, `未冻结目标：${target.path}`);
  }
  assert.equal((await rig.integration.trunk.current())?.trunkVersion, 1, "trunk 指针不变");
  const run = await readRunManifest(rig.project.root, rig.project.runId);
  assert.equal(run.ok, true);
  if (run.ok) {
    assert.equal(run.manifest.documents.proposal?.path, PATHS.proposal, "run manifest 未 re-pin");
    assert.equal((run.manifest as { repins?: unknown[] }).repins, undefined, "run manifest 无 repins");
  }
  await refreshGuardSnapshot(rig);
  for (const target of input.targets) {
    assert.equal(versionedDocFreezeState(rig.project.root, target.path, true), "draft", `目标保持草稿：${target.path}`);
  }
  const events = await ledgerOf(rig);
  assert.ok(!eventOf(events, "version.change").some((event) => event.status === "applied"));
  assert.ok(!eventOf(events, "doc.freeze").some((event) => input.targets.some((target) => target.path === event.path)));
}

test("VCA AC-5：无效 roster / D3 越界 / 版本链不匹配 ⇒ 直接提交 fail-closed（不冻结/不 re-pin/trunk 不变）", async () => {
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
      await assertDirectUpgradeRejected(rig, {
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        operationId: "op-ac5-invalid-roster",
        baseTrunk: directBaseOf((await rig.integration.trunk.current())!),
        targets: [
          { kind: "roster", path: rosterV2, action: "add", expectedFromSha256: rig.project.hashes[PATHS.roster] },
          { kind: "contract", path: proposalV2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.proposal] },
        ],
        summary: "invalid roster",
      }, "vca-apply-failed");
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
      await assertDirectUpgradeRejected(rig, {
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        operationId: "op-ac5-d3",
        baseTrunk: directBaseOf((await rig.integration.trunk.current())!),
        targets: [{ kind: "contract", path: proposalV2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.proposal] }],
        summary: "d3 out of roster",
      }, "vca-apply-failed");
    } finally {
      await cleanup(rig);
    }
  }

  // 3) 契约版本链不匹配（roster v2 引用 proposal v1，但 target 为 proposal v2；四文档齐备以命中链校验）
  {
    const rig = await setup();
    try {
      await bootstrapTrunk(rig);
      const architectureV2 = "docs/contracts/demo-architecture-v2.md";
      const modulesV2 = "docs/proposals/demo-modules-v2.md";
      const proposalV2 = "docs/proposals/demo-proposal-v2.md";
      const rosterV2 = "docs/proposals/demo-roster-v2.md";
      await writeProjectFile(rig.project.root, rosterV2, rosterV2Text({ proposal: PATHS.proposal, architecture: architectureV2 }));
      await writeProjectFile(rig.project.root, proposalV2, PROPOSAL_V2_TEXT);
      await writeProjectFile(rig.project.root, architectureV2, architectureV2Text(PATHS.proposal));
      await writeProjectFile(rig.project.root, modulesV2, modulesV2Text(architectureV2));
      await assertDirectUpgradeRejected(rig, {
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        operationId: "op-ac5-chain",
        baseTrunk: directBaseOf((await rig.integration.trunk.current())!),
        targets: [
          { kind: "roster", path: rosterV2, action: "add", expectedFromSha256: rig.project.hashes[PATHS.roster] },
          { kind: "contract", path: proposalV2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.proposal] },
          { kind: "contract", path: architectureV2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.architecture] },
          { kind: "contract", path: modulesV2, action: "modify", expectedFromSha256: rig.project.hashes[PATHS.modules] },
        ],
        summary: "chain mismatch",
      }, "vca-apply-failed");
    } finally {
      await cleanup(rig);
    }
  }
});

test("VCA AC-5：直接提交 apply 前重验（链损坏 ⇒ vca-apply-failed，不 re-pin；修复后新 operation 重试成功）", async () => {
  const rig = await setup();
  try {
    await bootstrapTrunk(rig);
    const current = (await rig.integration.trunk.current())!;
    const architectureV2 = "docs/contracts/demo-architecture-v2.md";
    const modulesV2 = "docs/proposals/demo-modules-v2.md";
    const proposalV2 = "docs/proposals/demo-proposal-v2.md";
    const rosterV2 = "docs/proposals/demo-roster-v2.md";
    await writeProjectFile(rig.project.root, rosterV2, rosterV2Text({ proposal: PATHS.proposal, architecture: architectureV2 }));
    const v2sha = await writeProjectFile(rig.project.root, proposalV2, PROPOSAL_V2_TEXT);
    await writeProjectFile(rig.project.root, architectureV2, architectureV2Text(PATHS.proposal));
    await writeProjectFile(rig.project.root, modulesV2, modulesV2Text(architectureV2));
    const targets = [
      { kind: "roster" as const, path: rosterV2, action: "add" as const, expectedFromSha256: rig.project.hashes[PATHS.roster] },
      { kind: "contract" as const, path: proposalV2, action: "modify" as const, expectedFromSha256: rig.project.hashes[PATHS.proposal] },
      { kind: "contract" as const, path: architectureV2, action: "modify" as const, expectedFromSha256: rig.project.hashes[PATHS.architecture] },
      { kind: "contract" as const, path: modulesV2, action: "modify" as const, expectedFromSha256: rig.project.hashes[PATHS.modules] },
    ];
    // 链损坏（roster v2 仍引用 proposal v1）⇒ executeDirect 在提交点前拒绝，trunk/run 均不变。
    const broken = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-ac5-broken",
      baseTrunk: directBaseOf(current),
      targets,
      summary: "apply recheck",
    }, "product");
    assert.equal(broken.ok, false);
    if (!broken.ok) assert.equal(broken.errorCode, "vca-apply-failed");
    const records = await rig.runtime.list({ flowId: FLOW_ID });
    assert.equal(records.find((record) => record.operationId === "op-ac5-broken")?.status, "draft", "失败保持 draft（未 applied）");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 1, "trunk 指针不变");
    for (const target of targets) {
      assert.equal(await rig.integration.services.freeze.entryOf(target.path), undefined, `未冻结目标：${target.path}`);
    }
    const run = await readRunManifest(rig.project.root, rig.project.runId);
    assert.equal(run.ok, true);
    if (run.ok) {
      assert.equal(run.manifest.documents.proposal?.path, PATHS.proposal, "run manifest 未 re-pin");
      assert.equal((run.manifest as { repins?: unknown[] }).repins, undefined);
    }
    // 修复：roster v2 / architecture v2 改为引用 proposal v2；以新的真实 operation 重提 ⇒ applied + trunk+1。
    await writeProjectFile(rig.project.root, rosterV2, rosterV2Text({ proposal: proposalV2, architecture: architectureV2 }));
    await writeProjectFile(rig.project.root, architectureV2, architectureV2Text(proposalV2));
    const retry = await rig.runtime.submitDirect!({
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: FLOW_ID,
      operationId: "op-ac5-fixed",
      baseTrunk: directBaseOf(current),
      targets,
      summary: "apply recheck retry",
    }, "product");
    assert.equal(retry.ok, true, retry.ok ? "" : `${retry.errorCode}: ${retry.message ?? ""}`);
    assert.equal(retry.status, "applied");
    assert.equal((await rig.integration.trunk.current())?.trunkVersion, 2);
    const status = await rig.integration.trunk.status();
    assert.equal(status.manifest?.artifacts.documents.proposal?.path, proposalV2);
    assert.equal(status.manifest?.artifacts.documents.roster?.path, rosterV2);
    await refreshFreezeRegistry(rig);
    assert.equal(await rig.integration.services.freeze.entryOf(proposalV2).then((entry) => entry?.sha256), v2sha);
    // direct 语义明确不重 pin 旧 run（run 保持原 pinned 字节；trunk 已推进 t2）。
    const runAfter = await readRunManifest(rig.project.root, rig.project.runId);
    assert.equal(runAfter.ok, true);
    if (runAfter.ok) assert.equal((runAfter.manifest as { repins?: unknown[] }).repins, undefined, "direct 不重 pin 旧 run");
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

test("bootstrap：无 trunk ⇒ 显式 baseTrunk:null + 真实 intent-confirmed 直接建立 trunk v1；缺证据 fail-closed", async () => {
  // 反例：无真实 intent-confirmed 证据 ⇒ 直接提交拒绝（不自报 bootstrap、不伪造基线）。
  {
    const rig = await setup({ migrate: true, withRun: false, freezeKeys: [] });
    try {
      assert.equal(await rig.integration.trunk.current(), null);
      const v2 = "docs/proposals/demo-proposal-v2.md";
      await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
      const rejected = await rig.runtime.submitDirect!({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        operationId: "op-boot-no-intent",
        baseTrunk: null,
        targets: [{ kind: "contract", path: v2, action: "add", expectedFromSha256: null }],
        summary: "bootstrap without evidence",
      }, "product");
      assert.equal(rejected.ok, false);
      if (!rejected.ok) assert.equal(rejected.errorCode, "vca-target-invalid");
      assert.equal(await rig.integration.trunk.current(), null, "缺证据不建立 trunk");
    } finally {
      await cleanup(rig);
    }
  }

  // 正例：真实 intent-confirmed 冻结记录作为 bootstrap 证据。
  {
    const rig = await setup({ migrate: true, withRun: false, freezeKeys: [] });
    try {
      const intentFrozen = await rig.integration.services.freeze.freeze({
        path: PATHS.intent,
        version: 1,
        sha256: rig.project.hashes[PATHS.intent]!,
        applicationId: "intent-dec-intent",
        reason: "intent-confirmed",
        decisionId: "dec-intent",
        at: AT,
      });
      assert.equal(intentFrozen.ok, true, intentFrozen.ok ? "" : `${intentFrozen.code}: ${intentFrozen.message ?? ""}`);
      assert.equal(await rig.integration.trunk.current(), null);
      const v2 = "docs/proposals/demo-proposal-v2.md";
      const v2sha = await writeProjectFile(rig.project.root, v2, PROPOSAL_V2_TEXT);
      const submitted = await rig.runtime.submitDirect!({
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW_ID,
        operationId: "op-boot-1",
        baseTrunk: null,
        targets: [{ kind: "contract", path: v2, action: "add", expectedFromSha256: null }],
        summary: "bootstrap v2",
      }, "product");
      assert.equal(submitted.ok, true, submitted.ok ? "" : `${submitted.errorCode}: ${submitted.message ?? ""}`);
      assert.equal(submitted.status, "applied");
      const current = await rig.integration.trunk.current();
      assert.equal(current?.trunkVersion, 1);
      const status = await rig.integration.trunk.status();
      assert.equal(status.manifest?.source, "upgrade", "direct 首建按 direct commit 记录 source=upgrade");
      assert.equal(status.manifest?.previous, null, "direct 首建 previous=null（无旧 trunk）");
      assert.equal(status.manifest?.artifacts.documents.proposal?.path, v2);
      await refreshFreezeRegistry(rig);
      const frozen = await rig.integration.services.freeze.entryOf(v2);
      assert.equal(frozen?.freeze.reason, "role-direct-applied");
      assert.equal(frozen?.freeze.origin, "role-direct");
      assert.equal(frozen?.freeze.decidedBy, undefined);
      assert.equal(frozen?.sha256, v2sha);
      const events = await ledgerOf(rig);
      const applied = eventOf(events, "version.change").find((event) => event.status === "applied")!;
      assert.equal(applied.origin, "role-direct");
      assert.equal(applied.bootstrap, true);
      assert.equal(applied.decidedBy, undefined);
      assert.ok(!eventOf(events, "doc.freeze").length, "direct 冻结不写 doc.freeze 账本事件（R9 记录直写）");
    } finally {
      await cleanup(rig);
    }
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
    // 同步守卫快照归 G（C2b）公共刷新；生产由桌面栈 initialize / 会话边界解析安装。
    await refreshAndInstallVersionedDocFreezeSnapshot(project.root, { migrationCompleted: true, now: () => new Date(AT) });
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
    await refreshAndInstallVersionedDocFreezeSnapshot(project.root, { migrationCompleted: true, now: () => new Date(AT) });
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
    // 经 G 公共刷新后仍是 unknown（baseline corrupt ⇒ 不自动重建/不放开覆盖）。
    await refreshAndInstallVersionedDocFreezeSnapshot(corruptRoot.root, { migrationCompleted: true, now: () => new Date(AT) });
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

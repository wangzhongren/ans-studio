// test/桌面应用/block-resolver-projects.test.ts
// 2026-11-20（block resolver 测试批 R4b，测试角色）：**project_state open blocks + 停滞/计时确定性**（T-7）。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §4.6（无静默等待）、
// §5.2（project_state 只读派生）、§6.6（停滞检测排除面）、§8.1 T-7、§8.2 AC-3/AC-7；
// R1 记录 §一.7（open blocks 投影/`[blocks]` 渲染）与 §八（routeTaskId/cardRequestId 透出）；
// R2 记录 §五（T_stall/T_repair/T_remind 注入时钟；tick 排除在飞/卡/修复任务）。
//
// 覆盖：
//   1. project_state openBlocks：class/status/owner/waitingOn/age/routeTaskId/cardRequestId；resolved 不展示；
//      旧项目无账本字段缺席；角色裁剪（flowId 缺席不展示）；坏行警告；`[blocks]` 摘要；
//   2. stall 排除：在飞长回合/待答卡/open 修复任务/已有 open block/近期进度/已关闭/stopping 不误报；
//   3. T_stall/T_repair 注入时钟确定性（精确边界）。
//
// 临时目录；假会话端口；无端口/`.env`/真实模型。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDesktopBlockRouter, type DesktopBlockRouterHost } from "../../app/desktop/block-router.ts";
import {
  blockCardRequestId,
  blockFactFromStallTick,
  type BlockFact,
} from "../../src/common/编排/block-resolution.ts";
import {
  escalateBlock,
  raiseBlock,
  readBlockLedger,
  replayBlockLifecycles,
  resolveBlock,
  routeBlock,
  type BlockLedgerEvent,
} from "../../src/common/编排/block-ledger.ts";
import {
  buildProjectStateView,
  buildWorkflowStateProjection,
  renderProjectStateSummary,
} from "../../src/common/编排/project-state.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { appendWorkflowEvent } from "../../src/common/编排/workflow-service.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  type WorkflowEvent,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const T0 = Date.parse("2026-11-20T00:00:00.000Z");
const MIN = 60_000;

async function makeRoot(prefix = "ans-block-projects-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, ".ans", "state"), { recursive: true });
  return root;
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function listing(root: string): ProjectListing {
  const roles: ProjectListing["roles"] = ["chief", "convener", "rapporteur", "product", "nominator", "verifier"].map((roleId) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
  }));
  return { projectRoot: root, roles, warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio" };
}

function makeHarness(root: string, clock: { now: number }, opts: {
  busy?: boolean;
  timings?: NonNullable<Parameters<typeof createDesktopBlockRouter>[1]>["timings"];
  policy?: NonNullable<Parameters<typeof createDesktopBlockRouter>[1]>["policy"];
} = {}) {
  const systemRows: Array<{ roleId: string | null; summary: string }> = [];
  const host: DesktopBlockRouterHost = {
    now: () => clock.now,
    getListing: (projectRoot) => (projectRoot === root ? listing(root) : undefined),
    findLiveRuntime: () => "demo",
    activeRuntimeFor: () => "demo",
    lastGovernanceRuntime: new Map(),
    governanceOwner: () => "convener",
    decisionDelegationEnabled: () => false,
    withRequestLifecycle: async () => undefined,
    enqueueDelivery: () => {},
    drainQueue: async () => {},
    emitSystemRow: (_projectRoot, roleId, summary) => { systemRows.push({ roleId, summary }); },
    appendRoleActivity: async () => {},
    isBusy: () => opts.busy === true,
    advanceAppDispatch: async () => true,
  };
  const router = createDesktopBlockRouter(host, {
    ...(opts.policy !== undefined ? { policy: opts.policy } : {}),
    ...(opts.timings !== undefined ? { timings: opts.timings } : {}),
  });
  return { router, systemRows };
}

async function seedWorkflow(input: {
  root: string;
  workflowId: string;
  flowId?: string;
  stage?: WorkflowStage;
  at: string;
  stopping?: boolean;
  closed?: boolean;
}): Promise<void> {
  const flowId = input.flowId ?? `flow-${input.workflowId}`;
  const started: WorkflowEvent = {
    v: 1, at: input.at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "workflow.started",
    workflowId: input.workflowId, flowId, path: "A",
    idempotencyKey: `workflow-start:${flowId}:A:seed-${input.workflowId}`,
    trigger: { by: "chief", reason: "test" }, sourceTaskId: `turn-${input.workflowId}`,
  };
  assert.equal((await appendWorkflowEvent(input.root, started)).ok, true);
  if (input.stopping === true) {
    const stop: WorkflowEvent = {
      v: 1, at: input.at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "workflow.stop-requested",
      workflowId: input.workflowId, flowId, path: "A",
      idempotencyKey: `stop:${input.workflowId}:1`, stage: input.stage ?? "A1",
      requestTaskId: `t-stop-${input.workflowId}`, reason: "test", requestedBy: "chief",
    };
    assert.equal((await appendWorkflowEvent(input.root, stop)).ok, true);
  }
  if (input.closed === true) {
    const closed: WorkflowEvent = {
      v: 1, at: input.at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "workflow.closed",
      workflowId: input.workflowId, flowId, path: "A",
      idempotencyKey: `close:${input.workflowId}:1`, outcome: "delivered", reason: "test",
      stopEvidence: { requestClosed: true, operatorReported: true, openProductionTaskIds: [] },
    };
    assert.equal((await appendWorkflowEvent(input.root, closed)).ok, true);
  }
}

function factOf(overrides: Partial<BlockFact> = {}): BlockFact {
  return {
    protocol: "fixed-v2.1",
    kind: "service-rejection",
    code: "missing-contract",
    detailCode: "missing-file",
    workflowId: "wf-open",
    flowId: "flow-open",
    stage: "A8",
    summary: "open block 示例",
    fingerprintMaterial: ["projects-fact"],
    ...overrides,
  };
}

async function events(root: string): Promise<readonly BlockLedgerEvent[]> {
  return (await readBlockLedger(root)).events;
}

// —————————————— 1) project_state open blocks ——————————————

test("project_state openBlocks：class/status/owner/waitingOn/age/routeTaskId/cardRequestId 透出；resolved 不展示", async () => {
  const root = await makeRoot();
  try {
    const t = (offsetMin: number) => () => new Date(T0 + offsetMin * MIN);
    const ownerFact = factOf({ fingerprintMaterial: ["open-owner"] });
    const ownerRaised = await raiseBlock({ projectRoot: root, fact: ownerFact, now: t(0) });
    assert.equal(ownerRaised.ok, true);
    if (!ownerRaised.ok) return;
    await routeBlock({
      projectRoot: root, blockId: ownerRaised.blockId, route: "owner-repair", reason: "missing-resource:owner-repair",
      targetRoleId: "rapporteur", taskId: "repair-1", now: t(5),
    });
    const cardFact = factOf({ fingerprintMaterial: ["open-card"], code: "b-change-scope-invalid", detailCode: undefined, stage: "B3", flowId: "flow-open" });
    const cardRaised = await raiseBlock({ projectRoot: root, fact: cardFact, now: t(10) });
    assert.equal(cardRaised.ok, true);
    if (!cardRaised.ok) return;
    await routeBlock({
      projectRoot: root, blockId: cardRaised.blockId, route: "customer-decision", reason: "scope-tradeoff:customer-decision",
      cardRequestId: blockCardRequestId(cardRaised.blockId), now: t(11),
    });
    const resolvedFact = factOf({ fingerprintMaterial: ["open-resolved"], flowId: "flow-done" });
    const resolvedRaised = await raiseBlock({ projectRoot: root, fact: resolvedFact, now: t(12) });
    assert.equal(resolvedRaised.ok, true);
    if (!resolvedRaised.ok) return;
    await routeBlock({ projectRoot: root, blockId: resolvedRaised.blockId, route: "owner-repair", reason: "x", targetRoleId: "convener", now: t(12) });
    await resolveBlock({ projectRoot: root, blockId: resolvedRaised.blockId, resolution: "fixed", by: "convener", note: "done", now: t(13) });

    const generatedAt = new Date(T0 + 30 * MIN);
    const view = await buildProjectStateView(root, { full: true, now: generatedAt });
    assert.ok(view.openBlocks !== undefined);
    const blocks = view.openBlocks!;
    assert.equal(blocks.length, 2, "resolved 不展示");
    const owner = blocks.find((block) => block.blockId === ownerRaised.blockId)!;
    assert.equal(owner.class, "missing-resource");
    assert.equal(owner.classCode, "B1");
    assert.equal(owner.status, "routed");
    assert.equal(owner.owner, "rapporteur");
    assert.equal(owner.waitingOn, "role");
    assert.equal(owner.ageMs, 30 * MIN);
    assert.equal(owner.routeKind, "owner-repair");
    assert.equal(owner.routeTaskId, "repair-1");
    assert.equal(owner.routeTargetRoleId, "rapporteur");
    assert.equal(owner.workflowId, "wf-open");
    assert.equal(owner.flowId, "flow-open");
    assert.equal(owner.stage, "A8");
    const card = blocks.find((block) => block.blockId === cardRaised.blockId)!;
    assert.equal(card.waitingOn, "customer");
    assert.equal(card.cardRequestId, blockCardRequestId(cardRaised.blockId));
    assert.equal(card.routeKind, "customer-decision");

    // workflow projection 同源 + `[blocks]` 摘要可见（不是无声暂停）。
    const projection = await buildWorkflowStateProjection({ projectRoot: root, now: () => generatedAt });
    assert.equal(projection.openBlocks.length, 2);
    assert.equal(projection.openBlocks.find((block) => block.blockId === ownerRaised.blockId)?.waitingOn, "role");
    assert.equal(projection.warnings.some((warning) => warning.startsWith("block-ledger-bad-lines")), false);
    const summary = renderProjectStateSummary(view, {}, projection);
    assert.match(summary, /\[blocks\] count=2/);
    assert.match(summary, /等待客户决策|waiting|customer/);
  } finally {
    await cleanup(root);
  }
});

test("project_state openBlocks：旧项目无 blocks 账本 ⇒ 字段缺席；角色裁剪下 flowId 缺席的 block 不展示", async () => {
  const root = await makeRoot();
  try {
    const view = await buildProjectStateView(root, { full: true, now: new Date(T0) });
    assert.equal(view.openBlocks, undefined, "无 open block ⇒ 字段缺席（旧消费者兼容）");
    const projection = await buildWorkflowStateProjection({ projectRoot: root, now: () => new Date(T0) });
    assert.deepEqual(projection.openBlocks, []);
    const raised = await raiseBlock({ projectRoot: root, fact: factOf({ flowId: undefined, fingerprintMaterial: ["no-flow"] }), now: () => new Date(T0) });
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    await routeBlock({ projectRoot: root, blockId: raised.blockId, route: "owner-repair", reason: "x", targetRoleId: "rapporteur", now: () => new Date(T0) });
    const chiefView = await buildProjectStateView(root, { full: true, now: new Date(T0) });
    assert.equal(chiefView.openBlocks?.length, 1, "chief/完整视图可见");
    const convenerView = await buildProjectStateView(root, { roleId: "convener", now: new Date(T0) });
    assert.equal(convenerView.openBlocks, undefined, "非 chief 且无焦点/本人 flow ⇒ flowId 缺席的 block 不展示（角色裁剪）");
  } finally {
    await cleanup(root);
  }
});

test("project_state 坏行：block-ledger-bad-lines 警告如实出现（不猜、不展示半截 block）", async () => {
  const root = await makeRoot();
  try {
    await fs.writeFile(path.join(root, ".ans", "state", "blocks.jsonl"), "{bad-json\n", "utf8");
    const projection = await buildWorkflowStateProjection({ projectRoot: root, now: () => new Date(T0) });
    assert.equal(projection.warnings.some((warning) => warning === "block-ledger-bad-lines: 1"), true, projection.warnings.join("；"));
    assert.deepEqual(projection.openBlocks, []);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 2) stall 排除面 / 注入时钟 ——————————————

test("T-7 stall 基线：T_stall 精确边界（注入时钟），无可见产物 ⇒ flow-stall raised/routed", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    // 2026-11-20（R2 收尾修补）：options.timings 已并入策略（stall fact 与 T_repair/T_remind 同源）。
    const { router } = makeHarness(root, clock, { timings: { stallMs: MIN } });
    await seedWorkflow({ root, workflowId: "wf-stall", at: new Date(T0).toISOString() });
    // 59.999s：不触发。
    clock.now = T0 + MIN - 1;
    await router.tick(root);
    assert.equal((await readBlockLedger(root)).events.length, 0, "<T_stall 不误报");
    // 恰 T_stall：触发（>=）。
    clock.now = T0 + MIN;
    await router.tick(root);
    const events = await readBlockLedger(root);
    const raised = events.events.find((event) => event.kind === "block.raised");
    assert.ok(raised !== undefined, "T_stall 到点 ⇒ block.raised");
    if (raised?.kind === "block.raised") {
      assert.equal(raised.code, "flow-stall");
      assert.equal(raised.class, "model-anomaly");
      assert.equal(raised.workflowId, "wf-stall");
      assert.equal(raised.flowId, "flow-wf-stall");
      const lifecycle = replayBlockLifecycles(events.events).records.get(raised.blockId)!;
      assert.equal(lifecycle.status, "routed", "raised→routed 同 tick");
      assert.equal(lifecycle.routeKind, "owner-repair");
    }
    // 同一 workflow 已有 open block ⇒ 不重复检测。
    await router.tick(root);
    assert.equal((await readBlockLedger(root)).events.filter((event) => event.kind === "block.raised").length, 1);
  } finally {
    await cleanup(root);
  }
});

test("T-7 stall 排除：在飞长回合/待答卡/open 修复任务/已关闭/stopping/近期进度均不误报", async () => {
  // 在飞长回合（busy）。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 + 30 * MIN };
      const { router } = makeHarness(root, clock, { busy: true, timings: { stallMs: MIN } });
      await seedWorkflow({ root, workflowId: "wf-busy", at: new Date(T0).toISOString() });
      await router.tick(root);
      assert.equal((await readBlockLedger(root)).events.length, 0, "在飞回合排除");
    } finally {
      await cleanup(root);
    }
  }
  // 已呈现待答卡（可见等待）。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 + 30 * MIN };
      const { router } = makeHarness(root, clock, { timings: { stallMs: MIN } });
      await seedWorkflow({ root, workflowId: "wf-card", at: new Date(T0).toISOString() });
      assert.equal((await appendTaskEvent(root, taskEvent("request.created", {
        requestId: "req-open", cardKind: "decision", workflowId: "wf-card", flowId: "flow-wf-card",
        sourceRoleId: "convener", title: "等待卡",
        options: [{ id: "a", label: "A", recommended: true }, { id: "b", label: "B" }],
      }, () => new Date(T0)))).ok, true);
      await router.tick(root);
      assert.equal((await readBlockLedger(root)).events.length, 0, "待答卡是可见等待，不误报慢");
    } finally {
      await cleanup(root);
    }
  }
  // open 修复任务。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 + 30 * MIN };
      const { router } = makeHarness(root, clock, { timings: { stallMs: MIN } });
      await seedWorkflow({ root, workflowId: "wf-repair-open", at: new Date(T0).toISOString() });
      assert.equal((await appendTaskEvent(root, taskEvent("task.created", {
        taskId: "t-repair-open", from: "application", to: "rapporteur", text: "修复",
        sideEffect: "unknown", idempotencyKey: `block-repair:${"a".repeat(24)}:1`,
        taskKind: "repair", blockId: "a".repeat(24), workflowId: "wf-repair-open",
        flowId: "flow-wf-repair-open", stage: "A8",
      }, () => new Date(T0)))).ok, true);
      await router.tick(root);
      assert.equal((await readBlockLedger(root)).events.length, 0, "open 修复任务排除");
    } finally {
      await cleanup(root);
    }
  }
  // 近期进度。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 + 30 * MIN };
      const { router } = makeHarness(root, clock, { timings: { stallMs: 10 * MIN } });
      await seedWorkflow({ root, workflowId: "wf-recent", at: new Date(T0 + 25 * MIN).toISOString() });
      await router.tick(root);
      assert.equal((await readBlockLedger(root)).events.length, 0, "近期进度不误报");
    } finally {
      await cleanup(root);
    }
  }
  // 已关闭 / stopping。
  {
    const root = await makeRoot();
    try {
      const clock = { now: T0 + 30 * MIN };
      const { router } = makeHarness(root, clock, { timings: { stallMs: MIN } });
      await seedWorkflow({ root, workflowId: "wf-closed", at: new Date(T0).toISOString(), closed: true });
      await seedWorkflow({ root, workflowId: "wf-stopping", at: new Date(T0).toISOString(), stopping: true });
      await router.tick(root);
      assert.equal((await readBlockLedger(root)).events.length, 0, "已关闭/停稳中不误报");
    } finally {
      await cleanup(root);
    }
  }
});

test("T_repair/T_stall 注入时钟：精确边界只升级一次（同 tick 重跑不重复）", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const { router, systemRows } = makeHarness(root, clock, { timings: { stallMs: 10 * MIN, repairMs: 2 * MIN } });
    const fact: BlockFact = {
      protocol: "fixed-v2.1", kind: "task.reported", code: "task-report-blocked",
      workflowId: "wf-timing", flowId: "flow-timing", stage: "A8",
      summary: "计时", fingerprintMaterial: ["repair-timing"],
    };
    await router.observeFact(root, fact);
    const raised = (await readBlockLedger(root)).events.find((event) => event.kind === "block.raised");
    assert.ok(raised !== undefined);
    const blockId = raised!.blockId;
    // 2min-1ms：不升级。
    clock.now = T0 + 2 * MIN - 1;
    await router.tick(root);
    assert.equal((await readBlockLedger(root)).events.filter((event) => event.kind === "block.escalated").length, 0);
    // 恰 2min：第一次升级（repair-timeout → owner-reassign）。
    clock.now = T0 + 2 * MIN;
    await router.tick(root);
    let escalations = (await readBlockLedger(root)).events.filter((event) => event.kind === "block.escalated");
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0]!.reason, "repair-timeout");
    assert.equal(escalations[0]!.to, "owner-reassign");
    const lifecycle = replayBlockLifecycles((await readBlockLedger(root)).events).records.get(blockId)!;
    assert.equal(lifecycle.status, "routed");
    assert.equal(lifecycle.routeCount, 2);
    // 同 tick 重跑：不重复升级（进程内一次性键）。
    await router.tick(root);
    escalations = (await readBlockLedger(root)).events.filter((event) => event.kind === "block.escalated");
    assert.equal(escalations.length, 1, "同一次超时只升级一次");
    assert.equal(systemRows.filter((row) => String(row.summary).includes("[Block·提醒]")).length, 0);
    // blockFactFromStallTick 的注入时钟边界（辅助纯函数）与 router 同口径。
    const base = { protocol: "fixed-v2.1" as const, workflowId: "wf-x", flowId: "flow-x", lastProgressAt: new Date(T0).toISOString() };
    assert.equal(blockFactFromStallTick({ ...base, now: new Date(T0 + 10 * MIN - 1).toISOString() }, { timings: { stallMs: 10 * MIN } }), undefined);
    assert.ok(blockFactFromStallTick({ ...base, now: new Date(T0 + 10 * MIN).toISOString() }, { timings: { stallMs: 10 * MIN } }) !== undefined);
  } finally {
    await cleanup(root);
  }
});

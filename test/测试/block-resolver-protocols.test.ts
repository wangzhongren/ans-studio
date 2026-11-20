// test/测试/block-resolver-protocols.test.ts
// 2026-11-20（block resolver 测试批 R4b，测试角色）：**双协议兼容**（T-10）。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §6.5（Q8 onExhausted 语义）、
// §6.7（reconcile）、§7.4（与 app-dispatch 分支的接口/协议隔离）、§8.1 T-10、§8.2 AC-8；
// R1 记录 §一.8（定义 v1/v2 双版本/冻结 hash）与 §五（v1 逐字保留、不静默迁移）；
// R3 记录（v1/v2 资源字节冻结）。
//
// 覆盖：
//   1. 定义三版本：v1 `onExhausted:"blocked"`、v2 `"route-block-resolver"` 逐字保留；v3 仅 A2/A3 文本对齐；
//      v1/v2/v3 hash 冻结；阶段集合/顺序不变；默认解析 v3；非法版本 4 拒绝；
//   2. fixed-v2.1 在飞事实观察零迁移：router 只读事实、只写 blocks 账本；不写 workflows/tasks、
//      不创建应用任务、不写 `.ans/trunk`/`.ans/runs`；修复简报走既有投递（system）或系统行；
//   3. app-dispatch/v1 旧定义在飞按旧值解释 + resolver 新路由层（修复任务）——不静默迁移定义；
//   4. 同项目两 workflow 不同协议混跑：各自协议事实、互不串扰；
//   5. 新 select_workflow 写 v3 定义（当前版本）与 v3 hash。
//
// 临时目录；假会话端口；无端口/`.env`/真实模型。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createDesktopBlockRouter, type DesktopBlockRouterHost } from "../../app/desktop/block-router.ts";
import {
  blockFactFromStageBlocked,
  type BlockFact,
} from "../../src/common/编排/block-resolution.ts";
import { readBlockLedger } from "../../src/common/编排/block-ledger.ts";
import {
  WORKFLOW_DEFINITION_HASHES,
  WORKFLOW_DEFINITION_HASHES_BY_VERSION,
  WORKFLOW_DEFINITION_VERSION,
  WORKFLOW_DEFINITION_VERSIONS,
  getWorkflowDefinition,
  listWorkflowDefinitions,
  validateWorkflowDefinitions,
  workflowDefinitionVersionsOf,
  type WorkflowStageDefinition,
} from "../../src/common/编排/workflow-definitions.ts";
import { appendWorkflowEvent, readWorkflowLedger, selectWorkflow } from "../../src/common/编排/workflow-service.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import {
  WORKFLOW_LEDGER_SCHEMA,
  type WorkflowEvent,
  type WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";

const T0 = Date.parse("2026-11-20T00:00:00.000Z");
const MIN = 60_000;

async function makeRoot(prefix = "ans-block-protocols-"): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.mkdir(path.join(root, ".ans", "state"), { recursive: true });
  return root;
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
function listing(root: string): ProjectListing {
  const roles: ProjectListing["roles"] = ["chief", "convener", "rapporteur", "product", "nominator", "verifier"].map((roleId) => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
  }));
  return { projectRoot: root, roles, warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio" };
}
function makeHarness(root: string, clock: { now: number }) {
  const systemRows: Array<{ roleId: string | null; summary: string }> = [];
  const delivered: Array<{ targetRoleId: string; kind?: string; text?: string; taskId?: string }> = [];
  const host: DesktopBlockRouterHost = {
    now: () => clock.now,
    getListing: (projectRoot) => (projectRoot === root ? listing(root) : undefined),
    findLiveRuntime: () => "demo",
    activeRuntimeFor: () => "demo",
    lastGovernanceRuntime: new Map(),
    governanceOwner: () => "convener",
    decisionDelegationEnabled: () => false,
    withRequestLifecycle: async () => undefined,
    enqueueDelivery: (_projectRoot, targetRoleId, item) => {
      delivered.push({
        targetRoleId,
        ...(typeof item.kind === "string" ? { kind: item.kind } : {}),
        ...(typeof item.text === "string" ? { text: item.text } : {}),
        ...(typeof item.taskId === "string" ? { taskId: item.taskId } : {}),
      });
    },
    drainQueue: async () => {},
    emitSystemRow: (_projectRoot, roleId, summary) => { systemRows.push({ roleId, summary }); },
    appendRoleActivity: async () => {},
    isBusy: () => false,
    advanceAppDispatch: async () => true,
  };
  return { router: createDesktopBlockRouter(host), systemRows, delivered };
}

async function seedStarted(input: {
  root: string;
  workflowId: string;
  flowId?: string;
  path?: "A" | "B";
  protocol?: "fixed-v2.1" | "app-dispatch/v1";
  definition?: { id: string; version: number; sha256: string };
  at: string;
}): Promise<void> {
  const path = input.path ?? "A";
  const flowId = input.flowId ?? `flow-${input.workflowId}`;
  const event: WorkflowEvent = {
    v: 1, at: input.at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "workflow.started",
    workflowId: input.workflowId, flowId, path,
    idempotencyKey: `workflow-start:${flowId}:${path}:seed-${input.workflowId}`,
    trigger: { by: "chief", reason: "test" }, sourceTaskId: `turn-${input.workflowId}`,
    ...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
    ...(input.definition !== undefined ? { definition: input.definition } : {}),
  };
  assert.equal((await appendWorkflowEvent(input.root, event)).ok, true);
}
async function seedBlocked(input: {
  root: string;
  workflowId: string;
  flowId?: string;
  path?: "A" | "B";
  stage: WorkflowStage;
  code: string;
  at: string;
  attempt?: number;
}): Promise<WorkflowEvent> {
  const path = input.path ?? "A";
  const flowId = input.flowId ?? `flow-${input.workflowId}`;
  const attempt = input.attempt ?? 1;
  const event: WorkflowEvent = {
    v: 1, at: input.at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.blocked",
    workflowId: input.workflowId, flowId, path,
    idempotencyKey: `stage-blocked:${input.workflowId}:${input.stage}:${attempt}`,
    stage: input.stage, code: input.code, summary: `blocked：${input.code}`, attempt,
  };
  assert.equal((await appendWorkflowEvent(input.root, event)).ok, true);
  return event;
}

async function workflowBytes(root: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(root, ".ans", "state", "workflows.jsonl"), "utf8");
  } catch {
    return undefined;
  }
}
async function taskBytes(root: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path.join(root, ".ans", "state", "tasks.jsonl"), "utf8");
  } catch {
    return undefined;
  }
}

// —————————————— 1) 定义三版本（v1/v2 逐字保留 + v3 文本对齐） ——————————————

test("定义三版本：v1 `blocked`、v2 `route-block-resolver` 逐字保留；v3 仅改 A2/A3 文本；hash 冻结且互不迁移", () => {
  assert.equal(WORKFLOW_DEFINITION_VERSION, 3);
  assert.deepEqual([...WORKFLOW_DEFINITION_VERSIONS], [1, 2, 3]);
  for (const id of ["add", "modify"] as const) {
    const v1 = getWorkflowDefinition(id, 1);
    const v2 = getWorkflowDefinition(id, 2);
    const v3 = getWorkflowDefinition(id, 3);
    assert.equal(v1.ok, true);
    assert.equal(v2.ok, true);
    assert.equal(v3.ok, true);
    if (!v1.ok || !v2.ok || !v3.ok) continue;
    assert.equal(v1.definition.version, 1);
    assert.equal(v2.definition.version, 2);
    assert.equal(v3.definition.version, 3);
    assert.equal(v1.definition.stages.every((stage) => stage.retry.onExhausted === "blocked"), true, `${id} v1 全部 blocked`);
    assert.equal(v2.definition.stages.every((stage) => stage.retry.onExhausted === "route-block-resolver"), true, `${id} v2 全部 route-block-resolver`);
    assert.equal(v3.definition.stages.every((stage) => stage.retry.onExhausted === "route-block-resolver"), true, `${id} v3 全部 route-block-resolver`);
    assert.deepEqual(v1.definition.stages.map((stage) => stage.stage), v2.definition.stages.map((stage) => stage.stage), `${id} 阶段集合/顺序不变`);
    assert.deepEqual(v2.definition.stages.map((stage) => stage.stage), v3.definition.stages.map((stage) => stage.stage), `${id} v2/v3 阶段集合/顺序不变`);
    assert.deepEqual(v1.definition.driveOrder, v2.definition.driveOrder);
    assert.deepEqual(v2.definition.driveOrder, v3.definition.driveOrder);
    assert.notEqual(v1.hash, v2.hash, `${id} v1/v2 hash 不同`);
    assert.notEqual(v2.hash, v3.hash, `${id} v2/v3 hash 不同（任务文本已版本化）`);
    assert.equal(v1.hash, WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][1]);
    assert.equal(v2.hash, WORKFLOW_DEFINITION_HASHES_BY_VERSION[id][2], "在飞 v2 按 v2 hash 解释（HASHES 现指 v3）");
    assert.equal(v3.hash, WORKFLOW_DEFINITION_HASHES[id]);
    // 深度冻结（版本表不可被篡改）。
    assert.equal(Object.isFrozen(v1.definition), true);
    assert.equal(Object.isFrozen(v2.definition), true);
    assert.equal(Object.isFrozen(v3.definition), true);
  }
  // v3 只改 A2/A3 文本（add）；其它阶段数据与 v2 逐字一致（modify 无 A2/A3 ⇒ 阶段数据不变）。
  const addV2 = getWorkflowDefinition("add", 2);
  const addV3 = getWorkflowDefinition("add", 3);
  if (addV2.ok && addV3.ok) {
    for (const stage of ["A1", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A12a", "A12b", "A13"] as const) {
      const v2Stage: WorkflowStageDefinition | undefined = addV2.definition.stages.find((entry) => entry.stage === stage);
      const v3Stage: WorkflowStageDefinition | undefined = addV3.definition.stages.find((entry) => entry.stage === stage);
      assert.deepEqual(v3Stage, v2Stage, `add v3 不得改动 A2/A3 之外的阶段（${stage}）`);
    }
    const a2V2 = addV2.definition.stages.find((entry) => entry.stage === "A2")!;
    const a2V3 = addV3.definition.stages.find((entry) => entry.stage === "A2")!;
    assert.equal(a2V2.taskText.details.some((line) => line.includes("同时写 docs/intents")), true, "v2 保留旧 docs/intents 要求（证明未静默修改 v2）");
    assert.equal(a2V3.taskText.details.some((line) => line.includes("同时写 docs/intents")), false, "v3 A2 不得再要求 product 写 docs/intents");
    assert.equal(a2V3.taskText.details.some((line) => line.includes("幕僚") && line.includes("docs/intents")), true, "v3 A2 入口由幕僚创建/核对");
  }
  const modifyV2 = getWorkflowDefinition("modify", 2);
  const modifyV3 = getWorkflowDefinition("modify", 3);
  if (modifyV2.ok && modifyV3.ok) {
    assert.deepEqual(modifyV3.definition.stages, modifyV2.definition.stages, "modify 无 A2/A3 ⇒ v3 阶段数据与 v2 逐字一致");
  }
  const defaultAdd = getWorkflowDefinition("add");
  assert.equal(defaultAdd.ok, true);
  if (defaultAdd.ok) {
    assert.equal(defaultAdd.definition.version, 3, "缺省解析 v3");
    assert.equal(defaultAdd.hash, WORKFLOW_DEFINITION_HASHES.add);
  }
  const unsupported = getWorkflowDefinition("add", 4);
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) assert.equal(unsupported.code, "workflow-definition-version-unsupported");
  const unknown = getWorkflowDefinition("nope", 1);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "workflow-definition-unknown");
  assert.deepEqual(listWorkflowDefinitions().map((definition) => definition.version), [3, 3], "注册表当前版本 v3");
  assert.deepEqual(workflowDefinitionVersionsOf("add").map((definition) => definition.version), [1, 2, 3]);
  assert.deepEqual(validateWorkflowDefinitions(), []);
  // 冻结 hash（记录 §二表格值；旧发布值供在飞对账）。
  assert.equal(WORKFLOW_DEFINITION_HASHES_BY_VERSION.add[1], "ef7720c112c76c8d77882118af8a331b06c16aa634246aa263b0a8ce871ecbee");
  assert.equal(WORKFLOW_DEFINITION_HASHES_BY_VERSION.modify[1], "4bea23eb0b1c00c849aff0990aefefa0b045759bdbea1331ff2f932540594bb6");
  assert.equal(WORKFLOW_DEFINITION_HASHES_BY_VERSION.add[2], "9718975bc34780b4ea0be49f99890388ff21a36b87455d023392fd088b72a1e2");
  assert.equal(WORKFLOW_DEFINITION_HASHES_BY_VERSION.modify[2], "41bbe743738569defa85e2295744c56545cf8d9f97c679a7025c1cfe25968445");
  assert.equal(WORKFLOW_DEFINITION_HASHES.add, "c9e87ad6772a2d61149c5d1e006c58b01c2c653781f41ab409a7d167406f3d08");
  assert.equal(WORKFLOW_DEFINITION_HASHES.modify, "4ac0513401bab5a9a8f95bf157fb4cb4baffeb2975ecbf114f6b40a02aa9e539");
});

// —————————————— 2) fixed-v2.1 在飞零迁移 ——————————————

test("fixed-v2.1 事实观察零迁移：只写 blocks 账本；workflows/tasks 字节不变；修复简报走 system 投递", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const { router, delivered, systemRows } = makeHarness(root, clock);
    await seedStarted({ root, workflowId: "wf-fixed", protocol: "fixed-v2.1", at: new Date(T0 - MIN).toISOString() });
    const blocked = await seedBlocked({
      root, workflowId: "wf-fixed", stage: "A8", code: "task-report-blocked", at: new Date(T0).toISOString(),
    });
    assert.equal(blocked.kind, "stage.blocked");
    if (blocked.kind !== "stage.blocked") return;
    const wfBefore = await workflowBytes(root);
    const tasksBefore = await taskBytes(root);
    const fact = blockFactFromStageBlocked(blocked, {
      protocol: "fixed-v2.1",
      judgeAvailable: false,
      source: "test.stage-blocked",
    });
    await router.observeFact(root, fact);
    const blocks = await readBlockLedger(root);
    const raised = blocks.events.find((event) => event.kind === "block.raised");
    assert.ok(raised !== undefined);
    if (raised?.kind === "block.raised") {
      assert.equal(raised.protocol, "fixed-v2.1");
      assert.equal(raised.code, "task-report-blocked");
      assert.equal(raised.workflowId, "wf-fixed");
    }
    const routed = blocks.events.find((event) => event.kind === "block.routed");
    assert.ok(routed !== undefined);
    if (routed?.kind === "block.routed") {
      assert.equal(routed.route, "owner-repair", "fixed-v2.1 不发起引擎阶段动作");
      assert.equal(routed.taskId, undefined, "不创建应用修复任务");
    }
    assert.equal(await workflowBytes(root), wfBefore, "workflows.jsonl 字节不变（零迁移）");
    assert.equal(await taskBytes(root), tasksBefore, "tasks.jsonl 字节不变（不建任务）");
    assert.equal((await readTaskState(root)).records.size, 0);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]!.kind, "system", "异步事实的修复简报经既有投递（system），不是 dispatch");
    assert.match(String(delivered[0]!.text), /\[Block·修复简报\]/);
    assert.equal(systemRows.filter((row) => String(row.summary).includes("[Block·修复简报]")).length, 0, "异步简报不再重复系统行");
    // 同步拒绝（dispatch-rejection）：系统行可见，不占模型队列。
    const syncFact: BlockFact = {
      protocol: "fixed-v2.1", kind: "dispatch-rejection", code: "missing-contract", detailCode: "missing-file",
      workflowId: "wf-fixed", flowId: "flow-wf-fixed", stage: "A8",
      summary: "同步拒绝", fingerprintMaterial: ["protocols-sync-reject"],
    };
    await router.observeFact(root, syncFact);
    assert.ok(systemRows.some((row) => String(row.summary).includes("[Block·修复简报]")), "同步拒绝以系统行给下一步");
    assert.equal(delivered.length, 1, "同步拒绝不新增投递队列消息");
    assert.equal((await readTaskState(root)).records.size, 0);
    assert.equal(await workflowBytes(root), wfBefore, "同步拒绝同样零阶段写入");
    // 不产生 legacy trunk/run 目录。
    await assert.rejects(fs.access(path.join(root, ".ans", "trunk")));
    await assert.rejects(fs.access(path.join(root, ".ans", "runs")));
  } finally {
    await cleanup(root);
  }
});

// —————————————— 3) app-dispatch/v1 旧定义在飞 ——————————————

test("app-dispatch/v1 旧定义在飞：按 v1 `blocked` 解释（不迁移），resolver 在其上追加修复任务；零阶段写入", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const { router } = makeHarness(root, clock);
    const v1 = getWorkflowDefinition("add", 1);
    assert.equal(v1.ok, true);
    if (!v1.ok) return;
    await seedStarted({
      root, workflowId: "wf-app-v1", protocol: "app-dispatch/v1",
      definition: { id: "add", version: 1, sha256: v1.hash },
      at: new Date(T0 - MIN).toISOString(),
    });
    await seedBlocked({
      root, workflowId: "wf-app-v1", stage: "A8", code: "task-closed-rejected", at: new Date(T0).toISOString(),
    });
    const wfBefore = await workflowBytes(root);
    await router.tick(root);
    const blocks = await readBlockLedger(root);
    const raised = blocks.events.find((event) => event.kind === "block.raised");
    assert.ok(raised !== undefined);
    if (raised?.kind === "block.raised") {
      assert.equal(raised.protocol, "app-dispatch/v1");
      assert.equal(raised.workflowId, "wf-app-v1");
    }
    const routed = blocks.events.find((event) => event.kind === "block.routed");
    assert.ok(routed !== undefined);
    const taskId = routed?.kind === "block.routed" ? routed.taskId : undefined;
    assert.ok(taskId !== undefined, "app-dispatch 修复任务（resolver 新路由层）");
    const repair = (await readTaskState(root)).records.get(taskId!);
    assert.equal(repair?.created?.taskKind, "repair");
    assert.equal(repair?.created?.from, "application");
    assert.equal(repair?.created?.workflowId, "wf-app-v1");
    assert.equal(repair?.created?.flowId, "flow-wf-app-v1");
    assert.equal(repair?.created?.stage, "A8");
    assert.equal(await workflowBytes(root), wfBefore, "定义/阶段事件零写入（在飞按旧值解释）");
    // 定义数据未迁移：v1 仍 blocked；started.definition 仍 version 1 + v1 hash。
    const started = (await readWorkflowLedger(root)).events.find((event) => event.kind === "workflow.started");
    assert.ok(started !== undefined);
    if (started?.kind === "workflow.started") {
      assert.equal(started.definition?.version, 1);
      assert.equal(started.definition?.sha256, v1.hash);
      assert.equal(started.protocol, "app-dispatch/v1");
    }
    assert.equal(v1.definition.stages.every((stage) => stage.retry.onExhausted === "blocked"), true, "在飞 v1 语义仍 blocked");
  } finally {
    await cleanup(root);
  }
});

// —————————————— 4) 同项目两 workflow 不同协议 ——————————————

test("混跑：同项目 fixed-v2.1 与 app-dispatch/v1 两个 workflow 各自成块、互不串扰；仅 app 建修复任务", async () => {
  const root = await makeRoot();
  try {
    const clock = { now: T0 };
    const { router, delivered } = makeHarness(root, clock);
    const v1 = getWorkflowDefinition("add", 1);
    if (!v1.ok) return;
    await seedStarted({ root, workflowId: "wf-mix-fixed", protocol: "fixed-v2.1", at: new Date(T0 - MIN).toISOString() });
    await seedStarted({
      root, workflowId: "wf-mix-app", protocol: "app-dispatch/v1",
      definition: { id: "add", version: 1, sha256: v1.hash },
      at: new Date(T0 - MIN).toISOString(),
    });
    await seedBlocked({ root, workflowId: "wf-mix-fixed", stage: "A8", code: "task-closed-rejected", at: new Date(T0).toISOString() });
    await seedBlocked({ root, workflowId: "wf-mix-app", stage: "A8", code: "task-closed-rejected", at: new Date(T0).toISOString() });
    await router.tick(root);
    const blocks = await readBlockLedger(root);
    const raised = blocks.events.filter((event) => event.kind === "block.raised");
    assert.equal(raised.length, 2, "两个 workflow 各自成块");
    const byWorkflow = new Map(raised.map((event) => [event.workflowId, event]));
    assert.equal(byWorkflow.get("wf-mix-fixed")?.protocol, "fixed-v2.1");
    assert.equal(byWorkflow.get("wf-mix-app")?.protocol, "app-dispatch/v1");
    const routed = blocks.events.filter((event) => event.kind === "block.routed");
    assert.equal(routed.length, 2);
    for (const event of routed) {
      assert.equal(event.route, "owner-repair");
    }
    const tasks = [...(await readTaskState(root)).records.values()];
    assert.equal(tasks.length, 1, "仅 app-dispatch 建修复任务");
    assert.equal(tasks[0]!.created?.workflowId, "wf-mix-app");
    assert.equal(tasks[0]!.created?.taskKind, "repair");
    assert.equal(delivered.filter((entry) => entry.kind === "system").length, 1, "fixed-v2.1 走系统投递简报");
    assert.equal(delivered.find((entry) => entry.kind === "system")?.targetRoleId, "convener");
    // 协议隔离：fixed workflow 未被 app 任务/事件污染。
    const fixedEvents = (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === "wf-mix-fixed");
    assert.equal(fixedEvents.every((event) => event.kind === "workflow.started" || event.kind === "stage.blocked"), true);
  } finally {
    await cleanup(root);
  }
});

// —————————————— 5) 新 select_workflow 写 v3 ——————————————

test("新 select_workflow：workflow.started 钉 v3 定义与 v3 hash（旧 v1/v2 在飞不迁移）", async () => {
  const root = await makeRoot();
  try {
    const selected = await selectWorkflow({
      projectRoot: root, flowId: "snake", workflowPath: "A", sourceTaskId: "turn-select-v3",
      now: () => new Date(T0),
    });
    assert.equal(selected.ok, true, selected.ok === false ? `${selected.code}: ${selected.message}` : "");
    if (!selected.ok) return;
    assert.equal(selected.protocol, "app-dispatch/v1");
    assert.deepEqual(selected.definition, {
      id: "add",
      version: 3,
      sha256: WORKFLOW_DEFINITION_HASHES.add,
    });
    const started = (await readWorkflowLedger(root)).events.find((event) => event.kind === "workflow.started");
    assert.ok(started !== undefined);
    if (started?.kind === "workflow.started") {
      assert.equal(started.protocol, "app-dispatch/v1");
      assert.equal(started.definition?.version, 3);
      assert.equal(started.definition?.sha256, WORKFLOW_DEFINITION_HASHES.add);
    }
    // v3 全阶段 route-block-resolver（新定义语义）。
    const v3 = getWorkflowDefinition("add");
    if (v3.ok) assert.equal(v3.definition.stages.every((stage) => stage.retry.onExhausted === "route-block-resolver"), true);
    // 旧 v1/v2 hash 仍在注册表可解析（在飞对账；不静默迁移）。
    const v1 = getWorkflowDefinition("add", 1);
    if (v1.ok) assert.equal(v1.hash, WORKFLOW_DEFINITION_HASHES_BY_VERSION.add[1]);
    const v2 = getWorkflowDefinition("add", 2);
    if (v2.ok) {
      assert.equal(v2.hash, WORKFLOW_DEFINITION_HASHES_BY_VERSION.add[2]);
      // v2 旧文本逐字保留（SMOKE-2 根因文本仍在 v2，防止回写迁移）。
      const a2 = v2.definition.stages.find((stage) => stage.stage === "A2")!;
      assert.equal(a2.taskText.details.some((line) => line.includes("同时写 docs/intents")), true);
    }
    // 新 select 落盘的 v3 引用与 v2 常量不同（版本化可判别）。
    assert.notEqual(WORKFLOW_DEFINITION_HASHES.add, WORKFLOW_DEFINITION_HASHES_BY_VERSION.add[2]);
  } finally {
    await cleanup(root);
  }
});

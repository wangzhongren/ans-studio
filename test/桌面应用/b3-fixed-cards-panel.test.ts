// test/桌面应用/b3-fixed-cards-panel.test.ts
// T3「两条固定工作流路径」B3（2026-11-10，桌面窗口）：3 张 fixed 卡 / 首次 fixed 启动 / fixed 面板。
//
// 覆盖（AC-12/AC-13/AC-14/AC-23、T-05/T-11 桌面侧）：
//   · 首次 fixed 启动顺序（v1.3 §4.1 第 4 条）：幕僚首个 stage-request（携带 workflowPath）⇒ 应用原子写
//     `.ans/project.json workflowSchema`（保留既有键）并复核 fixed 后路由；显式 `legacy/v1` **不覆盖**；
//     配置坏 ⇒ `project-config-write-failed`（fail-closed、不派发、不弹卡）；
//   · fixed intent-confirm：应用 `prepareIntent` → `request.created.documentRefs[intent]`（含 version）+
//     context marker + `workflowId/stage:"A3"` 戳；裁决 confirm 后 `finalizeIntent` ⇒ `stage.completed A3`；
//   · fixed proposal：应用计算五件 `documentRefs`（intent/proposal/modules/roster/architecture）；不调用
//     legacy `proposalCardFrozenRejection`；accept ⇒ `stage.completed A6`；
//   · fixed appointment：选项必须恰为最新名单角色（multiple=true）、推荐集=名单顺序（应用生成）；
//     `workflowId/stage:"A10"` 戳；**不带 legacy roster 戳**（legacy D3 读取方不把它当 D3 证据）；
//     裁决后 `stage.completed A10`；
//   · fixed 不发 acceptance 卡（`acceptance-card-suppressed`，notPresented、不写账本）；
//   · legacy D3 扫描（chainDispatchFacts）忽略带 `workflowId` 的 fixed 决议（G-10）；
//   · fixed 面板：fixed 项目 VCA/trunk/stable 面板只读（`panel:"read-only"`、mutation 拒绝码），
//     legacy 项目逐字不变；`versionChangePanelModeFor`/`fixedPanelReadonlyRejection` 纯函数。
//
// 夹具：账本/文档夹具 + 假会话（不启动 Electron/真实模型）；无新增 skip/force-exit。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { resolveProjectFixedPanelMode } from "../../app/desktop/workflow.ts";
import {
  FIXED_PANEL_READONLY_CODE,
  fixedPanelReadonlyRejection,
  versionChangePanelModeFor,
  versionChangePanelMutationAllowed,
} from "../../app/desktop/version-change.ts";
import {
  appendTaskEvent,
  readTaskState,
  taskEvent,
} from "../../src/common/编排/task-state.ts";
import {
  appendWorkflowEvent,
  readWorkflowLedger,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../src/common/编排/workflow-state.ts";
import type {
  CustomerInputOutcome,
  CustomerInputRequest,
  WorkflowEvent,
  WorkflowStage,
} from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";

const FLOW = "snake";
const WF = "wf-b3card0000000000000000001";
const AT = "2026-11-10T10:00:00.000Z";
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function sha(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn?: ProjectListing["roles"][number]["governanceFunction"]): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, ...(fn !== undefined ? { governanceFunction: fn } : {}),
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"), builtIn("product", "product"), builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"), builtIn("convener", "schedule"), builtIn("verifier", "verification"),
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker",
        boundary: { entries: [{ root: "project", path: "src/core", kind: "directory", purpose: "core" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface CapturedInput {
  roleId: string;
  taskId?: string;
  customerInput?: (request: CustomerInputRequest, metadata?: unknown) => Promise<CustomerInputOutcome | null | undefined>;
  [key: string]: unknown;
}

interface H {
  mgr: SessionManager;
  inputs: CapturedInput[];
  requests: CustomerInputRequest[];
  script: (request: CustomerInputRequest) => CustomerInputOutcome;
}

function harness(root: string, script: (request: CustomerInputRequest) => CustomerInputOutcome): H {
  const inputs: CapturedInput[] = [];
  const requests: CustomerInputRequest[] = [];
  const state = { inputs, requests, script } as H;
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      inputs.push(input as unknown as CapturedInput);
      const handle: RoleSessionHandle = {
        async send(_text: string, _options?: RoleSessionSendOptions) {},
        events() {
          let done = false;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  if (done) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  done = true;
                  await tick(5);
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
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    getVersionChangeStack: () => undefined,
    customerInput: async (request) => {
      requests.push(request as unknown as CustomerInputRequest);
      return state.script(request as unknown as CustomerInputRequest);
    },
    emitEvent: () => {},
  });
  state.mgr = mgr;
  return state;
}

async function tempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}
async function cleanup(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

const BASE = { v: 1 as const, at: AT, schema: "ans-workflow/v1" as const, path: "A" as const };
async function appendEvents(root: string, events: readonly WorkflowEvent[]): Promise<void> {
  for (const event of events) {
    const appended = await appendWorkflowEvent(root, event);
    assert.equal(appended.ok, true, appended.ok === false ? appended.message : "");
  }
}
function requested(workflowId: string, stage: WorkflowStage, attempt = 1): WorkflowEvent {
  return {
    ...BASE, kind: "stage.requested", workflowId, flowId: FLOW,
    idempotencyKey: `stage-request:${workflowId}:${stage}:${attempt}`, stage,
    requestTaskId: `t-req-${stage}-${attempt}`, requestDigest: "a".repeat(64), attempt,
  };
}
function completed(workflowId: string, stage: WorkflowStage): WorkflowEvent {
  return {
    ...BASE, kind: "stage.completed", workflowId, flowId: FLOW,
    idempotencyKey: `stage-complete:${workflowId}:${stage}:seed`, stage,
    cause: { kind: "seed", ref: `seed-${stage}` }, artifacts: [],
  };
}
async function seedStarted(root: string): Promise<void> {
  await appendEvents(root, [{
    ...BASE, kind: "workflow.started", workflowId: WF, flowId: FLOW,
    idempotencyKey: `workflow-start:${FLOW}:A:t-src`, trigger: { by: "chief", reason: "seed" }, sourceTaskId: "t-src",
  }]);
}
/** 合法推进到 `target` requested（A1..target-1 完成）。 */
async function seedToRequested(root: string, target: WorkflowStage, allStages: readonly WorkflowStage[]): Promise<void> {
  await seedStarted(root);
  const events: WorkflowEvent[] = [];
  for (const stage of allStages) {
    if (stage === target) break;
    events.push(requested(WF, stage), completed(WF, stage));
  }
  events.push(requested(WF, target));
  await appendEvents(root, events);
}

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v4",
  "flowId: snake",
  "version: 1",
  "intent: docs/product/snake-intent-v1.md",
  "proposal: docs/proposals/snake-proposal-v1.md",
  "architecture: docs/contracts/snake-architecture-v1.md",
  "envBootstrap:",
  "  omitted: true",
  "  omissionReason: pure local text task",
  "roles:",
  "  - id: qa-project",
  "    displayName: Project QA",
  "    purpose: Independent review",
  "    capability: Review",
  "    modules: [core]",
  "    review: true",
  "modules:",
  "  - id: core",
  "    name: Core",
  "    purpose: Core module",
  "    path: src/core/",
  "    category: core",
  "    publicContract: src/core/index.ts",
  "    architectureSource: docs/contracts/snake-architecture-v1.md",
  "---",
  "# Roster",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "management: [convener, qa-project]",
  "modules:",
  "  - id: core",
  "    path: src/core/",
  "    roleId: qa-project",
  "roles:",
  "  - id: qa-project",
  "    modules: [core]",
  "```",
  "",
].join("\n");

async function seedDocs(root: string): Promise<void> {
  await writeFile(root, "docs/product/snake-intent-v1.md", "---\nschema: project-intent/v1\nflowId: snake\nversion: 1\nintentId: snake-intent\ngoal: 贪吃蛇\n---\n# 意图\n");
  await writeFile(root, "docs/intents/snake-intent.md", "---\nintentId: snake-intent\nflowId: snake\ngoal: 贪吃蛇\n---\n# 意图入口\n");
  await writeFile(root, "docs/proposals/snake-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: snake\nversion: 1\nintent: docs/product/snake-intent-v1.md\n---\n# 提案\n");
  await writeFile(root, "docs/proposals/snake-modules-v1.md", [
    "---", "schema: project-modules/v2", "flowId: snake", "version: 1", "modules:",
    "  - id: core", "    name: Core", "    purpose: Core module", "    path: src/core/", "    category: core",
    "    publicContract: src/core/index.ts", "    architectureSource: docs/contracts/snake-architecture-v1.md",
    "---", "# 模块", "",
  ].join("\n"));
  await writeFile(root, "docs/proposals/snake-roster-v1.md", ROSTER_TEXT);
  await writeFile(root, "docs/contracts/snake-architecture-v1.md", "---\nschema: project-architecture/v1\nflowId: snake\nversion: 1\nproposal: docs/proposals/snake-proposal-v1.md\n---\nproposal: docs/proposals/snake-proposal-v1.md\n");
}

test("首次 fixed 启动：首个 stage-request 携带 workflowPath ⇒ 写 workflowSchema 并走 fixed；显式 legacy 不覆盖；坏配置 fail-closed", async () => {
  // 未标记新项目：闸未开 ⇒ 首个 stage-request 触发应用写回（保留既有键）。
  {
    const root = await tempRoot("ans-b3card-start-");
    const h = harness(root, () => ({ outcome: "declined", reason: "test" }));
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ governanceModel: "trio", acceptance: { mode: "strict" } }));
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const manager = h.mgr as unknown as {
        sessionKey(projectRoot: string, roleId: string, runtime: string): string;
        sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
        routeDispatch(root: string, runtime: "demo", from: string, d: unknown, source?: unknown): Promise<{ ok: boolean; message?: string }>;
      };
      const entry = manager.sessions.get(manager.sessionKey(root, "chief", "demo"));
      assert.ok(entry);
      const origin = { settled: false, turnId: "turn-customer-1" };
      (entry as { busy: boolean }).busy = true;
      entry!.origins.running = origin;
      const receipt = await manager.routeDispatch(root, "demo", "chief", {
        roleId: "convener", task: "推进 A1：请派产品撰写意图", flowId: FLOW,
        taskKind: "stage-request", workflowPath: "A", stage: "A1", sideEffect: "read-only",
      }, { entry, origin });
      assert.equal(receipt.ok, true, receipt.message ?? "");
      const config = JSON.parse(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
      assert.equal(config.workflowSchema, "two-fixed-paths/v1");
      assert.deepEqual(config.acceptance, { mode: "strict" }, "既有键保留");
      const ledger = await readWorkflowLedger(root);
      assert.equal(ledger.events.some((event) => event.kind === "workflow.started"), true);
      const task = [...(await readTaskState(root)).records.values()].find((item) => item.created?.taskKind === "stage-request");
      assert.ok(task?.created);
      assert.equal(task!.created!.workflowId?.startsWith("wf-"), true);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 显式 legacy/v1：不覆盖；按 legacy 路由（不产生 fixed workflow.started）。
  {
    const root = await tempRoot("ans-b3card-legacy-");
    const h = harness(root, () => ({ outcome: "declined", reason: "test" }));
    try {
      await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const manager = h.mgr as unknown as {
        sessionKey(projectRoot: string, roleId: string, runtime: string): string;
        sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
        routeDispatch(root: string, runtime: "demo", from: string, d: unknown, source?: unknown): Promise<{ ok: boolean; message?: string }>;
      };
      const entry = manager.sessions.get(manager.sessionKey(root, "chief", "demo"));
      const origin = { settled: false, turnId: "turn-customer-2" };
      (entry as { busy: boolean }).busy = true;
      entry!.origins.running = origin;
      const receipt = await manager.routeDispatch(root, "demo", "chief", {
        roleId: "convener", task: "推进 A1", flowId: FLOW,
        taskKind: "stage-request", workflowPath: "A", stage: "A1", sideEffect: "read-only",
      }, { entry, origin });
      assert.equal(receipt.ok, false, "显式 legacy 项目不按 fixed 受理");
      const config = JSON.parse(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
      assert.equal(config.workflowSchema, "legacy/v1", "显式 legacy/v1 不被覆盖");
      assert.equal((await readWorkflowLedger(root)).events.length, 0);
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
  // 坏 `.ans/project.json`：project-config-write-failed（不派发、不弹卡、不改文件）。
  {
    const root = await tempRoot("ans-b3card-badcfg-");
    const h = harness(root, () => ({ outcome: "declined", reason: "test" }));
    try {
      await writeFile(root, ".ans/project.json", "{ not-json");
      await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
      const manager = h.mgr as unknown as {
        sessionKey(projectRoot: string, roleId: string, runtime: string): string;
        sessions: Map<string, { busy: boolean; origins: { running?: unknown } }>;
        routeDispatch(root: string, runtime: "demo", from: string, d: unknown, source?: unknown): Promise<{ ok: boolean; message?: string }>;
      };
      const entry = manager.sessions.get(manager.sessionKey(root, "chief", "demo"));
      const origin = { settled: false, turnId: "turn-customer-3" };
      (entry as { busy: boolean }).busy = true;
      entry!.origins.running = origin;
      const receipt = await manager.routeDispatch(root, "demo", "chief", {
        roleId: "convener", task: "推进 A1", flowId: FLOW,
        taskKind: "stage-request", workflowPath: "A", stage: "A1", sideEffect: "read-only",
      }, { entry, origin });
      assert.equal(receipt.ok, false);
      assert.match(receipt.message ?? "", /project-config-write-failed/);
      assert.equal(await fs.readFile(path.join(root, ".ans", "project.json"), "utf8"), "{ not-json", "坏配置不被覆盖");
      assert.equal((await readTaskState(root)).records.size, 0, "不派发");
      assert.equal(h.requests.length, 0, "不弹卡");
    } finally {
      await h.mgr.stop(null);
      await cleanup(root);
    }
  }
});

test("fixed intent-confirm：documentRefs[intent]（含 version）+ marker + workflowId/stage 戳；confirm ⇒ stage.completed A3", async () => {
  const root = await tempRoot("ans-b3card-intent-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["confirm"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedToRequested(root, "A3", ["A1", "A2", "A3"] as WorkflowStage[]);
    await seedDocs(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    assert.equal(typeof chief?.customerInput, "function");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "确认产品意图", cardKind: "intent-confirm", flowId: FLOW,
      options: [{ id: "confirm", label: "确认" }, { id: "revise", label: "修订" }],
    });
    assert.equal(outcome?.outcome, "answered");
    // request.created：应用 documentRefs（path/sha256/version）+ workflowId/stage 戳 + marker。
    const tasks = await readTaskState(root);
    const intentPath = "docs/product/snake-intent-v1.md";
    const created = tasks.events.find((event) => event.kind === "request.created" && event.cardKind === "intent-confirm");
    assert.ok(created !== undefined && created.kind === "request.created");
    if (created !== undefined && created.kind === "request.created") {
      assert.equal(created.workflowId, WF);
      assert.equal(created.stage, "A3");
      const ref = created.documentRefs?.find((item) => item.kind === "intent");
      assert.ok(ref !== undefined);
      assert.equal(ref!.path, intentPath);
      assert.equal(ref!.sha256, sha(await fs.readFile(path.join(root, ...intentPath.split("/")))));
      assert.equal(ref!.version, 1);
    }
    const context = tasks.events.find((event) => event.kind === "request.created" && event.cardKind === "intent-confirm");
    assert.ok(context !== undefined && context.kind === "request.created" && context.context === undefined);
    const presentedRequest = h.requests.find((request) => request.cardKind === "intent-confirm");
    assert.ok(presentedRequest !== undefined);
    assert.match(presentedRequest!.preview ?? "", /\[ans-intent-evidence path=docs\/product\/snake-intent-v1\.md sha256=[a-f0-9]{64} version=1\]/);
    // request.resolved：documentRefs 一次写入 + workflowId/stage；finalizeIntent ⇒ stage.completed A3。
    const resolved = tasks.events.find((event) => event.kind === "request.resolved" && event.cardKind === "intent-confirm");
    assert.ok(resolved !== undefined && resolved.kind === "request.resolved");
    if (resolved !== undefined && resolved.kind === "request.resolved") {
      assert.equal(resolved.workflowId, WF);
      assert.equal(resolved.stage, "A3");
      assert.equal(resolved.documentRefs?.some((item) => item.kind === "intent"), true);
      assert.equal(resolved.choice, "confirm");
    }
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      tasks.events,
    );
    assert.equal(view.stages.A3.status, "completed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed proposal：五件 documentRefs + workflowId/stage A6；accept ⇒ stage.completed A6（不调用 legacy frozen 拒绝）", async () => {
  const root = await tempRoot("ans-b3card-proposal-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["accept"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedToRequested(root, "A6", ["A1", "A2", "A3", "A4", "A5", "A6"] as WorkflowStage[]);
    await seedDocs(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "确认方案", cardKind: "proposal", flowId: FLOW,
      options: [{ id: "accept", label: "接受" }, { id: "revise", label: "修订" }, { id: "reject", label: "拒绝" }],
    });
    assert.equal(outcome?.outcome, "answered");
    const tasks = await readTaskState(root);
    const created = tasks.events.find((event) => event.kind === "request.created" && event.cardKind === "proposal");
    assert.ok(created !== undefined && created.kind === "request.created");
    if (created !== undefined && created.kind === "request.created") {
      assert.equal(created.workflowId, WF);
      assert.equal(created.stage, "A6");
      const kinds = (created.documentRefs ?? []).map((ref) => ref.kind);
      assert.deepEqual(kinds, ["intent", "proposal", "modules", "roster", "architecture"]);
      for (const ref of created.documentRefs ?? []) {
        assert.match(ref.sha256, /^[a-f0-9]{64}$/);
        assert.equal(typeof ref.version, "number");
      }
    }
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      tasks.events,
    );
    assert.equal(view.stages.A6.status, "completed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed proposal：任一 documentRefs 缺失 ⇒ proposal-document-missing（notPresented、不写账本）", async () => {
  const root = await tempRoot("ans-b3card-proposal-miss-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["accept"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedToRequested(root, "A6", ["A1", "A2", "A3", "A4", "A5", "A6"] as WorkflowStage[]);
    await seedDocs(root);
    await fs.rm(path.join(root, "docs", "contracts", "snake-architecture-v1.md"));
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "确认方案", cardKind: "proposal", flowId: FLOW,
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
    });
    assert.equal(outcome?.outcome, "declined");
    assert.equal((outcome as { notPresented?: boolean }).notPresented, true);
    assert.match((outcome as { reason?: string }).reason ?? "", /proposal-document-missing/);
    assert.equal((await readTaskState(root)).events.some((event) => event.kind === "request.created"), false, "不发卡不写账本");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed appointment：选项=名单（multiple/推荐集由应用生成）+ workflowId/stage A10；裁决 ⇒ stage.completed A10；无 legacy roster 戳", async () => {
  const root = await tempRoot("ans-b3card-appointment-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["qa-project"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedToRequested(root, "A10", ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as WorkflowStage[]);
    await seedDocs(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "任命实现角色", cardKind: "appointment", flowId: FLOW, multiple: true,
      options: [{ id: "qa-project", label: "Project QA" }],
    });
    assert.equal(outcome?.outcome, "answered", JSON.stringify(outcome));
    const presented = h.requests.find((request) => request.cardKind === "appointment");
    assert.ok(presented !== undefined && presented.kind === "choice");
    if (presented !== undefined && presented.kind === "choice") {
      assert.deepEqual(presented.options.map((option) => option.id), ["qa-project"], "选项按名单顺序（应用生成）");
      assert.equal(presented.options.every((option) => option.recommended === true), true, "推荐集=名单顺序");
      assert.equal(presented.multiple, true);
    }
    const tasks = await readTaskState(root);
    const created = tasks.events.find((event) => event.kind === "request.created" && event.cardKind === "appointment");
    assert.ok(created !== undefined && created.kind === "request.created");
    if (created !== undefined && created.kind === "request.created") {
      assert.equal(created.workflowId, WF);
      assert.equal(created.stage, "A10");
      assert.equal(created.documentRefs?.some((ref) => ref.kind === "roster"), true, "任命卡绑定 roster 引用");
    }
    const resolved = tasks.events.find((event) => event.kind === "request.resolved" && event.cardKind === "appointment");
    assert.ok(resolved !== undefined && resolved.kind === "request.resolved");
    if (resolved !== undefined && resolved.kind === "request.resolved") {
      assert.deepEqual(resolved.targetRoleIds, ["qa-project"]);
      assert.equal(resolved.workflowId, WF);
      assert.equal(resolved.stage, "A10");
      assert.equal(resolved.rosterVersion, undefined, "fixed 任命决议不带 legacy roster 戳（防被 D3 误读）");
      assert.equal(resolved.rosterSha256, undefined);
    }
    const view = deriveWorkflowView(
      (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF),
      tasks.events,
    );
    assert.equal(view.stages.A10.status, "completed");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed appointment：选项与名单不一致/非多选 ⇒ appointment-invalid（notPresented、不写账本）", async () => {
  const root = await tempRoot("ans-b3card-appointment-bad-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["qa-project"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedToRequested(root, "A10", ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"] as WorkflowStage[]);
    await seedDocs(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "任命", cardKind: "appointment", flowId: FLOW,
      options: [{ id: "ghost", label: "名单外" }],
    });
    assert.equal(outcome?.outcome, "declined");
    assert.equal((outcome as { notPresented?: boolean }).notPresented, true);
    assert.match((outcome as { reason?: string }).reason ?? "", /appointment-invalid/);
    assert.equal((await readTaskState(root)).events.some((event) => event.kind === "request.created"), false);
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed 不发 acceptance 卡：acceptance-card-suppressed（notPresented、不写账本）；legacy D3 扫描忽略 fixed 决议", async () => {
  const root = await tempRoot("ans-b3card-acceptance-");
  const h = harness(root, () => ({ outcome: "answered", value: { selected: ["accept"] } }));
  try {
    await writeFile(root, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedStarted(root);
    await seedDocs(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    const chief = h.inputs.find((input) => input.roleId === "chief");
    const outcome = await chief!.customerInput!({
      kind: "choice", title: "验收确认", cardKind: "acceptance", flowId: FLOW,
      options: [{ id: "accept", label: "通过" }, { id: "reject", label: "拒绝" }],
    });
    assert.equal(outcome?.outcome, "declined");
    assert.equal((outcome as { notPresented?: boolean }).notPresented, true);
    assert.match((outcome as { reason?: string }).reason ?? "", /acceptance-card-suppressed/);
    assert.equal((await readTaskState(root)).events.some((event) => event.kind === "request.created"), false);

    // legacy D3 扫描（chainDispatchFacts）：fixed 决议（workflowId 戳）不算 D3 证据；旧 roster 戳决议才算。
    const rosterSha = sha(ROSTER_TEXT);
    await appendTaskEvent(root, taskEvent("request.created", {
      requestId: "r-fixed-appoint", flowId: FLOW, cardKind: "appointment",
      sourceRoleId: "chief", title: "fixed 任命", options: [{ id: "qa-project", label: "QA" }],
    }, () => new Date(AT)));
    await appendTaskEvent(root, taskEvent("request.resolved", {
      requestId: "r-fixed-appoint", cardKind: "appointment", targetRoleIds: ["qa-project"],
      rosterVersion: 1, rosterSha256: rosterSha, workflowId: WF, stage: "A10",
      by: "customer", choice: "qa-project",
    }, () => new Date(AT)));
    await appendTaskEvent(root, taskEvent("request.created", {
      requestId: "r-legacy-appoint", flowId: FLOW,
      sourceRoleId: "nominator", title: "legacy 任命", options: [{ id: "worker", label: "Worker" }],
    }, () => new Date(AT)));
    await appendTaskEvent(root, taskEvent("request.resolved", {
      requestId: "r-legacy-appoint", targetRoleIds: ["worker"], rosterVersion: 1, rosterSha256: rosterSha,
      by: "customer", choice: "worker",
    }, () => new Date(AT)));
    const manager = h.mgr as unknown as {
      chainDispatchFacts(projectRoot: string, flowHint: string | undefined): Promise<{ d3Selected?: string[] }>;
    };
    const facts = await manager.chainDispatchFacts(root, FLOW);
    assert.deepEqual(facts.d3Selected, ["worker"], "fixed 决议不得被 legacy D3 读取方当作 D3 证据");
  } finally {
    await h.mgr.stop(null);
    await cleanup(root);
  }
});

test("fixed 面板：fixed ⇒ 只读（panel read-only、mutation 拒绝）；legacy 逐字不变；workflow 状态只读投影", async () => {
  const fixedRoot = await tempRoot("ans-b3card-panel-fixed-");
  const legacyRoot = await tempRoot("ans-b3card-panel-legacy-");
  const h = harness(fixedRoot, () => ({ outcome: "declined", reason: "test" }));
  try {
    await writeFile(fixedRoot, ".ans/project.json", JSON.stringify({ workflowSchema: "two-fixed-paths/v1", governanceModel: "trio" }));
    await seedToRequested(fixedRoot, "A9", ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"] as WorkflowStage[]);
    assert.equal(await resolveProjectFixedPanelMode(fixedRoot), "fixed");
    const state = await h.mgr.fixedPanelState(fixedRoot, FLOW);
    assert.equal(state.mode, "fixed");
    assert.equal(state.panel, "read-only");
    assert.equal(state.mutationAllowed, false);
    assert.equal(state.workflow?.workflowId, WF);
    assert.equal(state.workflow?.stage, "A9");
    assert.equal(state.workflow?.status, "requested");
    // 纯函数（Interface mutation 拒绝码/面板形态）。
    assert.equal(versionChangePanelModeFor("fixed"), "read-only");
    assert.equal(versionChangePanelModeFor("legacy"), "full");
    assert.equal(versionChangePanelMutationAllowed("fixed"), false);
    assert.equal(versionChangePanelMutationAllowed("legacy"), true);
    const rejection = fixedPanelReadonlyRejection();
    assert.equal(rejection.ok, false);
    assert.equal(rejection.code, FIXED_PANEL_READONLY_CODE);

    await writeFile(legacyRoot, ".ans/project.json", JSON.stringify({ governanceModel: "trio" }));
    assert.equal(await resolveProjectFixedPanelMode(legacyRoot), "legacy");
    const legacyState = await h.mgr.fixedPanelState(legacyRoot);
    assert.equal(legacyState.mode, "legacy");
    assert.equal(legacyState.panel, "full");
    assert.equal(legacyState.mutationAllowed, true);
    assert.equal(legacyState.workflow, undefined);
  } finally {
    await h.mgr.stop(null);
    await cleanup(fixedRoot);
    await cleanup(legacyRoot);
  }
});

// test/桌面应用/run-pin.test.ts
// 2026-10-30（方案 v3 §3.1；第一波 3.1）：桌面窗口侧 run 冻结——
// M1/M2/M3 draft runId、handoff 前同 runId pin、pin 前拒绝、pinned 文档/roster/D3/roles、
// assets 可选第七类、并发 pin、legacy 无 runId 兼容。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { createRuntimeAdapterFactory, openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { PROJECT_MODULES_SCHEMA, PROJECT_ROSTER_SCHEMA, PROJECT_TOPOLOGY_SCHEMA, parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import { appendTaskEvent, readTaskState } from "../../src/common/编排/task-state.ts";
import { ensureDraftRun, findActiveRun, pinRun, prepareRunPin, readRunManifest, runManifestPath } from "../../src/common/编排/run-manifest.ts";
import { recordVersionedDocBaselines } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import type { ContractCheckFn, CustomerInputFn, CustomerInputMetadata, CustomerInputRequest, DispatchReceipt, DispatchTaskFn, DispatchTaskPayload, ToolCall } from "../../src/model/runtime.ts";
import type { DesktopCustomerInputFn } from "../../app/desktop/customer-input.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const ROSTER_TEXT = [
  "---",
  "schema: project-roster/v3",
  "flowId: focus",
  "version: 1",
  "envBootstrapOmittedReason: 最小夹具省略装配/入口角色",
  "intent: docs/product/focus-intent-v1.md",
  "proposal: docs/proposals/focus-proposal-v1.md",
  "architecture: docs/contracts/focus-architecture-v1.md",
  "roles:",
  "  - id: implementer",
  "    displayName: 实现者",
  "    purpose: 实现",
  "    capability: TS",
  "    modules: [impl-core]",
  "  - id: qa",
  "    displayName: 测试",
  "    purpose: 核对",
  "    capability: 测试",
  "    modules: [qa-suite]",
  "modules:",
  "  - id: impl-core",
  "    name: 实现",
  "    purpose: 实现",
  "    path: src/",
  "    category: core",
  "    publicContract: src/index.ts",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "  - id: qa-suite",
  "    name: 测试",
  "    purpose: 测试",
  "    path: test/",
  "    category: core",
  "    publicContract: test/",
  "    architectureSource: docs/contracts/focus-architecture-v1.md",
  "---",
  "# 名单",
  "## 人员+模块拓扑图",
  "```topology",
  "schema: project-topology/v2",
  "modules:",
  "  - id: impl-core",
  "    path: src/",
  "    roleId: implementer",
  "  - id: qa-suite",
  "    path: test/",
  "    roleId: qa",
  "roles:",
  "  - id: implementer",
  "    modules: [impl-core]",
  "  - id: qa",
  "    modules: [qa-suite]",
  "management: [convener, implementer, qa]",
  "```",
].join("\n");

async function writeProject(root: string, opts: { withAssets?: boolean } = {}): Promise<void> {
  const write = async (rel: string, text: string): Promise<void> => {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text, "utf8");
  };
  await write("docs/product/focus-intent-v1.md", "# 产品意图\n\n目标：番茄钟。\n");
  await write("docs/proposals/focus-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n");
  await write("docs/proposals/focus-roster-v1.md", ROSTER_TEXT);
  const parsed = parseProjectRoster(ROSTER_TEXT);
  if (!parsed.ok) throw new Error(parsed.reason);
  await write("docs/proposals/focus-modules-v1.md", ["---", "schema: project-modules/v2", "flowId: focus", "version: 1", `modules: ${JSON.stringify(parsed.roster.modules)}`, "---", "# 模块清单"].join("\n"));
  await write("docs/contracts/focus-architecture-v1.md", "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n");
  if (opts.withAssets === true) await write("docs/contracts/focus-assets-v1.md", "---\nschema: project-assets/v1\nflowId: focus\nversion: 1\n---\n# 资产需求\n");
  await write("角色卡/implementer/role-card.md", "# 实现者\n");
  await write("角色卡/implementer/boundary.yaml", "role: implementer\nentries: []\n");
  await write("角色卡/qa/role-card.md", "# 测试\n");
  await write("角色卡/qa/boundary.yaml", "role: qa\nentries: []\n");
  await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });
}

async function pinFocusRun(root: string): Promise<string> {
  const draft = await ensureDraftRun(root, "focus");
  if (!draft.ok) assert.fail(draft.reason);
  const pinned = await pinRun(root, draft.manifest.runId, { d3: { decisionId: "decision-x", targetRoleIds: ["implementer"] } });
  if (!pinned.ok) assert.fail(pinned.reason);
  return pinned.manifest.runId;
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, governanceFunction: fn,
  });
  const worker = (roleId: string, dir: string): ProjectListing["roles"][number] => ({
    roleId, cardPath: `角色卡/${roleId}/role-card.md`, boundaryPath: `角色卡/${roleId}/boundary.yaml`, cardText: roleId,
    boundary: { entries: [{ root: "project", path: dir, kind: "directory", purpose: "p" }], boundarySource: `角色卡/${roleId}/boundary.yaml`, acceptance: { accepted: false, source: "" } },
  });
  return {
    projectRoot: root,
    roles: [builtIn("chief", "chief"), builtIn("product", "product"), builtIn("rapporteur", "proposal"), builtIn("nominator", "nomination"), builtIn("convener", "schedule"), builtIn("verifier", "verification"), worker("implementer", "src/"), worker("qa", "test/")],
    warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio",
  };
}

/**
 * B7.1（2026-11-11）：本套件验证 **legacy run/pin 流程**旧行为；空 trio 项目聊天自 B6.1 起默认为 fixed，
 * 而 B7.1 起 fixed 聊天拒绝普通星形派发 ⇒ 夹具显式写明「旧项目」（断言不改，仅固定项目模式）。
 */
function markLegacyProject(root: string): void {
  mkdirSync(path.join(root, ".ans"), { recursive: true });
  writeFileSync(path.join(root, ".ans", "project.json"), JSON.stringify({ workflowSchema: "legacy/v1", governanceModel: "trio" }));
}

function harness(root: string, options: { customerInput?: DesktopCustomerInputFn } = {}) {
  markLegacyProject(root);
  const streams: Record<string, OrchestrationEvent[]> = {};
  const sent: Record<string, string[]> = {};
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  const customerInputs: Record<string, CustomerInputFn | undefined> = {};
  const contractChecks: Record<string, ContractCheckFn | undefined> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = (input as { dispatchTask?: DispatchTaskFn }).dispatchTask;
      customerInputs[input.roleId] = (input as { customerInput?: CustomerInputFn }).customerInput;
      contractChecks[input.roleId] = (input as { contractCheck?: ContractCheckFn }).contractCheck;
      const handle: RoleSessionHandle = {
        async send(text: string) { (sent[input.roleId] ??= []).push(text); },
        events() {
          let i = 0;
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<OrchestrationEvent>> {
                  for (let tries = 0; tries < 100; tries += 1) {
                    const arr = streams[input.roleId] ?? [];
                    if (i < arr.length) return { value: arr[i++]!, done: false };
                    await tick(5);
                  }
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
    emitEvent: () => {},
    customerInput: options.customerInput ?? (async () => ({ outcome: "declined", operatorId: "test" })),
  });
  return { mgr, streams, sent, caps, customerInputs, contractChecks };
}

/**
 * B3a（2026-11-16）：v2.0.0 source 门（document-planning-source-unavailable）要求文档/团队准备派发
 * 来自「已登记项目生命周期 + 当前 accepted 客户轮次 + 真实管理会话证据」。本 harness 用产品真实
 * `openRoleSession` 构造**真实 managed chief 会话**：测试经 `mgr.send` 开一轮真实客户回合（core
 * 发布 prompt-input + turn ack），并在该回合内由 demo runtime 脚本调用 `dispatch_task`——与生产
 * 模型的工具调用路径一致；不伪造 host 事实、不放宽门禁。非 chief 角色仍用最小 fake 句柄（本套件
 * 只验证 chief 来源门，投递目标行为与既有 harness 相同）。
 */
interface SourceGatedHarness {
  mgr: SessionManager;
  customerInputs: Record<string, CustomerInputFn | undefined>;
  contractChecks: Record<string, ContractCheckFn | undefined>;
  dispatchViaAcceptedTurn(payload: DispatchTaskPayload, text: string): Promise<DispatchReceipt>;
  /** B3a 残差（2026-11-16）：真实运营受派任务回合内派发——open(taskId) 绑定真实任务，system 回合内执行脚本。 */
  dispatchWorkerViaAssignedTurn(roleId: "convener", taskId: string, payload: DispatchTaskPayload, text: string): Promise<DispatchReceipt>;
}

function sourceGatedHarness(root: string, options: { realRoles?: readonly string[] } = {}): SourceGatedHarness {
  markLegacyProject(root);
  const realRoles = new Set<string>(options.realRoles ?? ["chief"]);
  const scripts: Record<string, ToolCall[]> = {};
  const receipts: DispatchReceipt[] = [];
  const customerInputs: Record<string, CustomerInputFn | undefined> = {};
  const contractChecks: Record<string, ContractCheckFn | undefined> = {};
  const streams: Record<string, OrchestrationEvent[]> = {};
  const registration = {
    selectionId: `native-selection-${path.basename(root)}`,
    selectedRoot: root,
    projectRoot: root,
    source: "native-directory-selection" as const,
    selectedAt: "2026-11-16T00:00:00.000Z",
    listingGeneration: 1,
  };
  const fakeHandle = (roleId: string, runtime: RuntimeKind): RoleSessionHandle => {
    let turns = 0;
    let disposed = false;
    return {
      runtime,
      async send(text, options) {
        const turnId = `turn-${roleId}-${++turns}`;
        options?.onTurnStarted?.({ turnId, roleId, runtime });
        (streams[roleId] ??= []).push({
          kind: "message", summary: "输入", roleId, runtime, turnId,
          detail: { source: "prompt-input", text },
        } as OrchestrationEvent);
        // B3a 残差（2026-11-16）：假句柄也如实结束回合（否则投递目标长期 busy，LRU 会误淘汰其它活会话）。
        (streams[roleId] ??= []).push({ kind: "settled", summary: "会话结束" } as OrchestrationEvent);
      },
      events() {
        let i = 0;
        return {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<OrchestrationEvent>> {
                for (let tries = 0; tries < 2000; tries += 1) {
                  if (disposed) return { value: undefined as unknown as OrchestrationEvent, done: true };
                  const arr = streams[roleId] ?? [];
                  if (i < arr.length) return { value: arr[i++]!, done: false };
                  await tick(10);
                }
                return { value: undefined as unknown as OrchestrationEvent, done: true };
              },
            };
          },
        };
      },
      async dispose() { disposed = true; },
    };
  };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      customerInputs[input.roleId] = (input as { customerInput?: CustomerInputFn }).customerInput;
      contractChecks[input.roleId] = (input as { contractCheck?: ContractCheckFn }).contractCheck;
      if (!realRoles.has(input.roleId)) return fakeHandle(input.roleId, input.runtime ?? "demo");
      const script = (scripts[input.roleId] ??= []);
      const factory = createRuntimeAdapterFactory(input.project, input.runtime ?? "demo", { writeRoot: root, script });
      const dispatch = (input as { dispatchTask?: DispatchTaskFn }).dispatchTask;
      const wrapped: DispatchTaskFn | undefined = dispatch === undefined ? undefined : async (d, metadata) => {
        const receipt = (await dispatch(d, metadata)) as DispatchReceipt | null | undefined;
        if (receipt !== null && receipt !== undefined) receipts.push(receipt);
        return receipt;
      };
      return openRoleSession({ ...input, autoRepin: false, ...(wrapped !== undefined ? { dispatchTask: wrapped } : {}) }, { createAdapter: factory });
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    getRegisteredProjectLifecycle: (r) => (r === root ? registration : undefined),
    emitEvent: () => {},
    customerInput: async () => ({ outcome: "declined", operatorId: "test" }),
  });
  const driveTurn = async (roleId: string, payload: DispatchTaskPayload, text: string, system: boolean): Promise<DispatchReceipt> => {
    (scripts[roleId] ??= []).length = 0;
    scripts[roleId]!.push({ name: "dispatch_task", args: payload as unknown as Record<string, unknown> });
    const before = receipts.length;
    const send = system
      ? await mgr.sendBackground({ projectRoot: root, roleId, runtime: "demo", text, kind: "system" })
      : await mgr.send(text, undefined, { projectRoot: root, roleId, runtime: "demo" });
    assert.equal(send.ok, true, `真实 ${roleId} 回合应被受理`);
    for (let tries = 0; tries < 500 && receipts.length === before; tries += 1) await tick(10);
    assert.ok(receipts.length > before, `${roleId} 回合内 dispatch_task 应返回回执`);
    return receipts[receipts.length - 1]!;
  };
  return {
    mgr,
    customerInputs,
    contractChecks,
    async dispatchViaAcceptedTurn(payload, text) {
      assert.equal(await mgr.waitForRoleIdle(root, "chief", "demo", 5000), true, "幕僚应在空闲时开新回合");
      return driveTurn("chief", payload, text, false);
    },
    async dispatchWorkerViaAssignedTurn(roleId, taskId, payload, text) {
      const opened = await mgr.open({ projectRoot: root, roleId, runtime: "demo", taskId });
      assert.equal(opened.ok, true, opened.ok ? "" : opened.error ?? "运营会话应可打开");
      assert.equal(await mgr.waitForRoleIdle(root, roleId, "demo", 5000), true, "运营应在空闲时开新回合");
      return driveTurn(roleId, payload, text, true);
    },
  };
}

async function d3(root: string): Promise<void> {
  const bytes = await fs.readFile(path.join(root, "docs/proposals/focus-roster-v1.md"));
  await appendTaskEvent(root, {
    v: 1, at: "2026-10-30T00:00:00.000Z", kind: "request.created", requestId: "req-d3", flowId: "focus",
    intentId: "focus", sourceRoleId: "nominator", title: "D3 招人决定", options: [{ id: "implementer", label: "implementer" }],
  });
  await appendTaskEvent(root, {
    v: 1, at: "2026-10-30T00:00:01.000Z", kind: "request.resolved", requestId: "req-d3", decisionId: "decision-req-d3",
    intentId: "focus", targetRoleIds: ["implementer"], rosterVersion: 1,
    rosterSha256: createHash("sha256").update(bytes).digest("hex"), by: "judge", choice: "implementer",
  });
}

test("run-pin：M1/M2/M3 共享 draft runId；handoff 前 pin 同一 runId；任务锚定 pinned", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：当前有意语义为——每次文档/团队准备生成独立 trunk planning run
  // （run-hub-*，draft；不再共享 draft），handoff 不再提前 pin，worker 执行由 trunk execution preflight
  // 冻结（planning run 无执行工作流证据 ⇒ effective-manifest-missing 硬拒）。原断言（共享 runId、
  // handoff pin、worker 锚定 pinned）描述 e71501c 前的旧语义，已按当前契约更新；「受理、独立锚点身份、
  // 不伪造 pinned、零 worker 任务」判据保留。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-"));
  const h = sourceGatedHarness(root, { realRoles: ["chief", "convener"] });
  try {
    await writeProject(root);
    await d3(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    // 真实 convener 会话必须在任何 trunk planning run 之前打开：trunk 出现后项目保护范围变为 required，
    // demo 工厂不再获准新开会话（runtime-creation-admission-unproven）。交付投递会复用该活会话。
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    // MAX_LIVE_SESSIONS=3 的 LRU 会淘汰最久未用的空闲会话——每次派发前触碰 convener 保持其存活
    // （reuse 路径只刷新 lastUsed，不重新走工厂准入）。
    const keepConvener = async (): Promise<void> => {
      assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    };
    await tick(30);
    const m1 = await h.dispatchViaAcceptedTurn({ roleId: "product", task: "写产品意图", sideEffect: "docs", flowId: "focus" }, "请派产品写产品意图");
    assert.equal(m1.ok, true, m1.message ?? "");
    const state1 = await readTaskState(root);
    const m1Record = [...state1.records.values()].find((record) => record.created?.to === "product")!;
    const m1RunId = m1Record.created!.runId!;
    assert.match(m1RunId, /^run-hub-/, "M1 锚定独立 trunk planning run");
    assert.equal(m1Record.created!.runState, "draft");
    const m1Manifest = await readRunManifest(root, m1RunId);
    assert.equal(m1Manifest.ok, true);
    if (m1Manifest.ok) assert.equal(m1Manifest.manifest.state, "draft");
    assert.equal(await h.mgr.waitForRoleIdle(root, "product", "demo", 5000), true, "M1 投递收口后再开下一轮");

    await keepConvener();
    const m2 = await h.dispatchViaAcceptedTurn({ roleId: "rapporteur", task: "出方案与名单", sideEffect: "docs", flowId: "focus" }, "请派提案出方案");
    assert.equal(m2.ok, true, m2.message ?? "");
    const state2 = await readTaskState(root);
    const m2Record = [...state2.records.values()].find((record) => record.created?.to === "rapporteur")!;
    assert.match(m2Record.created!.runId ?? "", /^run-hub-/);
    assert.notEqual(m2Record.created!.runId, m1RunId, "各准备独立 planning scope（不再共享 draft runId）");
    assert.equal(await h.mgr.waitForRoleIdle(root, "rapporteur", "demo", 5000), true, "M2 投递收口后再开下一轮");
    await keepConvener();
    const m3 = await h.dispatchViaAcceptedTurn({ roleId: "nominator", task: "按名单招人", sideEffect: "docs", flowId: "focus" }, "请派招人");
    assert.equal(m3.ok, true, m3.message ?? "");
    const state3 = await readTaskState(root);
    const m3Record = [...state3.records.values()].find((record) => record.created?.to === "nominator")!;
    assert.match(m3Record.created!.runId ?? "", /^run-hub-/);
    assert.notEqual(m3Record.created!.runId, m2Record.created!.runId);
    assert.equal(await h.mgr.waitForRoleIdle(root, "nominator", "demo", 5000), true, "M3 投递收口");

    await keepConvener();
    const handoff = await h.dispatchViaAcceptedTurn({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" }, "请派运营");
    assert.equal(handoff.ok, true, handoff.message ?? "");
    const state4 = await readTaskState(root);
    const handoffRecord = [...state4.records.values()].find((record) => record.created?.to === "convener")!;
    assert.equal(handoffRecord.created!.stepId, "project-handoff");
    const handoffRunId = handoffRecord.created!.runId!;
    assert.match(handoffRunId, /^run-hub-/);
    assert.equal(handoffRecord.created!.runState, "draft");
    const handoffManifest = await readRunManifest(root, handoffRunId);
    assert.equal(handoffManifest.ok, true);
    if (handoffManifest.ok) {
      assert.equal(handoffManifest.manifest.state, "draft", "handoff 不再提前 pin");
      assert.equal(handoffManifest.manifest.d3, undefined, "handoff 不写 D3 冻结事实");
    }

    // 真实投递到运营后再由运营回合派 worker：trunk execution preflight 冻结该 planning run 并硬拒。
    for (let tries = 0; tries < 500; tries += 1) {
      const current = await readTaskState(root);
      if (current.records.get(handoffRecord.taskId)?.delivered?.to === "convener") break;
      await tick(10);
    }
    assert.equal((await readTaskState(root)).records.get(handoffRecord.taskId)?.delivered?.to, "convener", "交付任务应投递到运营");
    const worker = await h.dispatchWorkerViaAssignedTurn("convener", handoffRecord.taskId, { roleId: "implementer", task: "实现番茄钟", sideEffect: "code", flowId: "focus", moduleId: "impl-core" }, "请派实现番茄钟");
    assert.equal(worker.ok, false, worker.message ?? "");
    assert.match(worker.message ?? "", /worker-freeze stage=prepare code=trunk-verify-failed/);
    assert.match(worker.message ?? "", /effective-manifest-missing/);
    const state5 = await readTaskState(root);
    assert.equal([...state5.records.values()].some((record) => record.created?.to === "implementer"), false, "freeze 拒绝零 worker 任务");
    assert.equal([...state5.records.values()].filter((record) => record.created?.runState === "pinned").length, 0, "全程不伪造 pinned");

    await h.mgr.open({ projectRoot: root, roleId: "implementer", runtime: "demo" });
    await tick(20);
    const implementerCheck = h.contractChecks.implementer;
    assert.equal(typeof implementerCheck, "function");
    const checkText = await implementerCheck!({ flowId: "focus", taskKind: "dispatch", moduleId: "impl-core" });
    assert.match(checkText!, /run：run-hub-/, "worker 上下文如实显示当前 planning run");
    assert.match(checkText!, /state=draft/, "planning run 仍为 draft（未冻结）");
    assert.match(checkText!, /runId\(pinned\)/, "worker 执行仍要求 pinned run");
    assert.doesNotMatch(checkText!, /state=pinned/, "不得把 draft planning run 伪装成已冻结");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("D3 卡种收口（2026-10-31）：真实 D3 + 后续 decision 裁决后 pin，manifest.d3 为真实角色集", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：handoff 不再提前 pin（manifest.d3 不再由派发写入），但 D3 读取的
  // 「卡种收口」仍是当前语义——只有真实 appointment（含 legacy 无 cardKind + roster 戳）可作为 D3，
  // decision 卡的 targetRoleIds 不得顶替。本用例改由当前 advisory 面（d3-missing）证明该收口，再证明
  // handoff 走独立 planning run（draft）且不写 manifest.d3。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-d3-cardkind-"));
  const h = sourceGatedHarness(root);
  try {
    await writeProject(root);
    // 新格式 decision 卡：选项 qa 与真实角色同名，且（模拟污染）带 targetRoleIds。
    await appendTaskEvent(root, {
      v: 1, at: "2026-10-30T00:00:02.000Z", kind: "request.created", requestId: "req-decision", flowId: "focus",
      cardKind: "decision", sourceRoleId: "convener", title: "浏览器验收方式",
      options: [{ id: "qa", label: "qa" }, { id: "customer-local", label: "客户本机浏览器" }],
    });
    await appendTaskEvent(root, {
      v: 1, at: "2026-10-30T00:00:03.000Z", kind: "request.resolved", requestId: "req-decision",
      decisionId: "decision-req-decision", cardKind: "decision", targetRoleIds: ["qa"], by: "judge", choice: "qa",
    });
    // 旧格式（无 cardKind、无 roster 戳）历史污染：customer-local 被写进 targetRoleIds。
    await appendTaskEvent(root, {
      v: 1, at: "2026-10-30T00:00:04.000Z", kind: "request.created", requestId: "req-legacy-decision", flowId: "focus",
      sourceRoleId: "convener", title: "旧决策卡", options: [{ id: "customer-local", label: "客户本机浏览器" }],
    });
    await appendTaskEvent(root, {
      v: 1, at: "2026-10-30T00:00:05.000Z", kind: "request.resolved", requestId: "req-legacy-decision",
      decisionId: "decision-req-legacy", targetRoleIds: ["customer-local"], by: "judge", choice: "customer-local",
    });

    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    // 仅 decision 卡 ⇒ D3 选中集为空：advisory 如实报 d3-missing（卡种收口生效）。
    const polluted = await h.dispatchViaAcceptedTurn({ roleId: "convener", task: "把项目交付运营（决策卡污染场景）", sideEffect: "read-only", flowId: "focus" }, "请派运营（决策卡污染场景）");
    assert.equal(polluted.ok, true, polluted.message ?? "");
    assert.match(polluted.message ?? "", /尚无 D3 选中角色/, "decision 卡 targetRoleIds 不得顶替 D3");
    assert.doesNotMatch(polluted.message ?? "", /d3-selected-cards-incomplete/, "污染 target 不应被当作 D3 选中集");

    await d3(root); // legacy 兼容：真实 appointment（无 cardKind，带 appointment 专属 roster 戳）
    const handoff = await h.dispatchViaAcceptedTurn({ roleId: "convener", task: "把项目交付运营（D3 到位后）", sideEffect: "read-only", flowId: "focus" }, "请派运营（D3 到位后）");
    assert.equal(handoff.ok, true, handoff.message ?? "");
    assert.doesNotMatch(handoff.message ?? "", /尚无 D3 选中角色/, "真实 appointment D3 已被读取");
    const state = await readTaskState(root);
    const handoffRecord = [...state.records.values()].find((record) => record.created?.to === "convener" && record.created.text.includes("D3 到位后"))!;
    assert.equal(handoffRecord.created!.stepId, "project-handoff");
    const runId = handoffRecord.created!.runId!;
    assert.match(runId, /^run-hub-/);
    assert.equal(handoffRecord.created!.runState, "draft");
    const manifest = await readRunManifest(root, runId);
    assert.equal(manifest.ok, true);
    if (manifest.ok) {
      assert.equal(manifest.manifest.state, "draft", "handoff 不再提前 pin");
      assert.equal(manifest.manifest.d3, undefined, "D3 冻结事实不再由 handoff 写入 manifest");
    }
  } finally {
    await h.mgr.stop(null);
    // 2026-10-31（CI 稳定性，macOS arm64）：stop 不等待后台投递链落盘；先让出一拍再带重试删除。
    await tick(50);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("run-pin：缺 D3 时 pin 失败仍受理；任务锚定 draft、不伪造 pinned", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：规划协调不再前置未来 D3，也不再在 handoff 尝试 pin
  // （dispatch.ts「Planning coordination must not require future D3」）。当前语义改为：缺 D3 只产生
  // d3-missing advisory，handoff 照常受理并锚定独立 planning run（draft），绝不写 pinned。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-missing-"));
  const h = sourceGatedHarness(root);
  try {
    await writeProject(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const before = (await readTaskState(root)).records.size;
    const handoff = await h.dispatchViaAcceptedTurn({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" }, "请派运营（缺 D3）");
    assert.equal(handoff.ok, true, handoff.message ?? "");
    assert.match(handoff.message ?? "", /状态提示（未阻断）/);
    assert.match(handoff.message ?? "", /尚无 D3 选中角色/, "缺 D3 如实给 d3-missing advisory");
    assert.doesNotMatch(handoff.message ?? "", /pin 尝试失败|run-pin-failed/, "handoff 不再尝试 pin");
    const after = await readTaskState(root);
    assert.equal(after.records.size, before + 1, "缺 D3 仍创建交接任务");
    const created = [...after.records.values()].find((record) => record.created?.to === "convener")!.created!;
    assert.equal(created.stepId, "project-handoff");
    assert.equal(created.runState, "draft", "锚定已有/新建 planning draft");
    assert.match(created.runId ?? "", /^run-hub-/);
    assert.equal(created.flowId, "focus");
    const manifest = await readRunManifest(root, created.runId!);
    assert.equal(manifest.ok, true);
    if (manifest.ok) assert.equal(manifest.manifest.state, "draft", "draft 不伪造 pinned");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("run-pin：assets 可选第七类（存在才 pin）；并发 pin 幂等", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-assets-"));
  try {
    await writeProject(root, { withAssets: true });
    const prepared = await prepareRunPin(root, "focus", { d3: { decisionId: "decision-x", targetRoleIds: ["implementer"] } });
    assert.equal(prepared.ok, true, prepared.ok ? "" : prepared.reason);
    if (prepared.ok) {
      assert.match(prepared.pinned.documents.assets?.path ?? "", /focus-assets-v1\.md$/);
      assert.equal(typeof prepared.pinned.documents.assets?.sha256, "string");
    }
    const ensured = await ensureDraftRun(root, "focus");
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;
    const facts = { d3: { decisionId: "decision-x", targetRoleIds: ["implementer"] } };
    const [a, b] = await Promise.all([pinRun(root, ensured.manifest.runId, facts), pinRun(root, ensured.manifest.runId, facts)]);
    assert.equal(a.ok, true, a.ok ? "" : a.reason);
    assert.equal(b.ok, true, b.ok ? "" : b.reason);
    const final = await readRunManifest(root, ensured.manifest.runId);
    assert.equal(final.ok, true);
    if (final.ok) assert.equal(final.manifest.state, "pinned");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("legacy：无 runId 的旧 task.created 仍可读取；legacy 项目不伪造 pinned", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-legacy-"));
  try {
    await fs.mkdir(path.join(root, ".ans"), { recursive: true });
    await appendTaskEvent(root, {
      v: 1, at: "2026-10-29T00:00:00.000Z", kind: "task.created", taskId: "t-legacy", flowId: "focus",
      from: "chief", to: "product", text: "旧任务", sideEffect: "docs", idempotencyKey: "legacy-key",
    }, { allowLegacyRun: true });
    const state = await readTaskState(root);
    assert.equal(state.records.get("t-legacy")?.created?.runId, undefined, "legacy 旧记录按缺省读取，不伪造 runId");
    const active = await findActiveRun(root, "focus");
    assert.equal(active.ok, true);
    if (active.ok) assert.equal(active.manifest, null, "legacy 项目没有 manifest，不伪造 pinned");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P1.5：无 flow/teamPlan 源时 pin 为 null；存在时钉 path/version/hash；manifest 漏钉可被 verify 拒绝", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-flow-"));
  try {
    await writeProject(root);
    await fs.mkdir(path.join(root, "docs/flows"), { recursive: true });
    await fs.mkdir(path.join(root, "docs/scheduling"), { recursive: true });
    await fs.writeFile(path.join(root, "docs/flows/focus.yaml"), "version: 3\nstages: [stage-1]\n", "utf8");
    await fs.writeFile(path.join(root, "docs/scheduling/focus-team-v1.md"), "---\nschema: teamPlanSchema:3\n---\n# team plan\n", "utf8");
    const prepared = await prepareRunPin(root, "focus", { d3: { decisionId: "decision-flow", targetRoleIds: ["implementer"] } });
    assert.equal(prepared.ok, true, prepared.ok ? "" : prepared.reason);
    if (prepared.ok) {
      assert.equal(prepared.pinned.execution.flow?.version, 3);
      assert.match(prepared.pinned.execution.flow?.path ?? "", /docs\/flows\/focus\.yaml$/);
      assert.equal(typeof prepared.pinned.execution.flow?.sha256, "string");
      assert.equal(prepared.pinned.execution.teamPlan?.schema, "teamPlanSchema:3");
      assert.equal(prepared.pinned.stage?.flowVersion, 3);
    }
    const ensured = await ensureDraftRun(root, "focus");
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;
    const pinned = await pinRun(root, ensured.manifest.runId, { d3: { decisionId: "decision-flow", targetRoleIds: ["implementer"] } });
    assert.equal(pinned.ok, true);
    if (!pinned.ok) return;
    const { verifyPinnedRun } = await import("../../src/common/编排/run-manifest.ts");
    const good = await verifyPinnedRun(root, pinned.manifest);
    assert.equal(good.ok, true);
    if (good.ok) assert.deepEqual(good.violations, []);
    const missingFlow = await verifyPinnedRun(root, { ...pinned.manifest, execution: { ...pinned.manifest.execution, flow: null } });
    assert.equal(missingFlow.ok, true);
    if (missingFlow.ok) assert.ok(missingFlow.violations.some((line) => line.startsWith("flow: exists but manifest is null")));
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P1.3：文档 schema 不符/缺文档 pin 拒绝；pin 后 hash 漂移 verify 拒绝且不自动重写", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-drift-"));
  try {
    await writeProject(root);
    const facts = { d3: { decisionId: "decision-drift", targetRoleIds: ["implementer"] } };
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v1.md"), "---\nschema: project-proposal/v1\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n", "utf8");
    const mismatch = await prepareRunPin(root, "focus", facts);
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.match(mismatch.reason, /schema|proposal/i);
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v1.md"), "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n", "utf8");
    await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });
    const ensured = await ensureDraftRun(root, "focus");
    assert.equal(ensured.ok, true);
    if (!ensured.ok) return;
    const pinned = await pinRun(root, ensured.manifest.runId, facts);
    assert.equal(pinned.ok, true, pinned.ok ? "" : pinned.reason);
    if (!pinned.ok) return;
    await fs.appendFile(path.join(root, "docs/proposals/focus-roster-v1.md"), "\n# drift\n", "utf8");
    const { verifyPinnedRun } = await import("../../src/common/编排/run-manifest.ts");
    const verified = await verifyPinnedRun(root, pinned.manifest);
    assert.equal(verified.ok, true);
    if (verified.ok) assert.ok(verified.violations.some((line) => line.startsWith("roster: hash changed")));
    const reread = await readRunManifest(root, ensured.manifest.runId);
    assert.equal(reread.ok, true);
    if (reread.ok) assert.equal(reread.manifest.documents.roster?.sha256, pinned.manifest.documents.roster?.sha256, "verify 不自动重写 manifest");
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P1.1：M1 缺 flowId 也生成 pending draft；M2 带 flowId 时领养同一 runId", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：hub 派发必须带 flowId（dispatch.ts `chief-hub-flow-unavailable`，
  // 与 chief-workflow W36 同款门），「缺 flowId 生成 pending draft / 后续领养」的旧语义已删除；
  // 即使带 flowId，裸会话（无真实来源/managed 证据）也不得登记文档任务。断言改为当前 fail-closed 两段。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-pending-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const m1 = (await h.caps.chief!({ roleId: "product", task: "先写产品意图（flow 未定）", sideEffect: "docs" })) as DispatchReceipt;
    assert.equal(m1.ok, false, "缺 flowId 的 hub 准备必须硬拒");
    assert.match(m1.message ?? "", /chief-hub-flow-unavailable/);
    assert.equal((await readTaskState(root)).records.size, 0, "拒发零任务、无 pending draft");
    const noRun = await findActiveRun(root, "focus");
    assert.equal(noRun.ok, true);
    if (noRun.ok) assert.equal(noRun.manifest, null, "不创建 draft run");

    await writeProject(root);
    const m2 = (await h.caps.chief!({ roleId: "rapporteur", task: "出方案与名单", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
    assert.equal(m2.ok, false, "无真实来源/managed 证据的文档准备必须 fail-closed");
    assert.match(m2.message ?? "", /document-planning-source-unavailable/);
    const state2 = await readTaskState(root);
    assert.equal(state2.records.size, 0, "source 门拒发零任务（不再领养任何 draft）");
    const adopted = await findActiveRun(root, "focus");
    assert.equal(adopted.ok, true);
    if (adopted.ok) assert.equal(adopted.manifest, null, "不伪造/领养 draft runId");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("R2（P1.3）：legacy 任务验收 facts 标 runState=legacy", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-legacy-facts-"));
  let captured: CustomerInputMetadata | undefined;
  const h = harness(root, {
    customerInput: async (
      _request: Parameters<DesktopCustomerInputFn>[0],
      _context: Parameters<DesktopCustomerInputFn>[1],
      metadata: Parameters<DesktopCustomerInputFn>[2],
    ) => {
      captured = metadata;
      return { outcome: "declined", operatorId: "test" };
    },
  });
  try {
    await writeProject(root);
    await appendTaskEvent(root, {
      v: 1, at: "2026-10-29T00:00:00.000Z", kind: "task.created", taskId: "t-legacy-facts", flowId: "focus",
      from: "chief", to: "product", text: "旧任务", sideEffect: "docs", idempotencyKey: "legacy-facts",
    }, { allowLegacyRun: true });
    await h.mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
    await tick(30);
    const channel = h.customerInputs.verifier;
    assert.equal(typeof channel, "function");
    const request: CustomerInputRequest = {
      kind: "choice", cardKind: "acceptance", flowId: "focus", title: "验收核对",
      options: [{ id: "accept", label: "通过", recommended: true }, { id: "rework", label: "返工" }],
    };
    await channel!(request);
    assert.equal(captured?.judgeContext?.facts?.runState, "legacy");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("contract_check session：pinned run/角色写区/legacy 明示（只读）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-contract-check-"));
  const h = harness(root);
  try {
    await writeProject(root);
    await d3(root);
    await h.mgr.open({ projectRoot: root, roleId: "implementer", runtime: "demo" });
    await tick(30);
    const check = h.contractChecks.implementer;
    assert.equal(typeof check, "function");
    const text = await check!({ flowId: "focus", taskKind: "dispatch", moduleId: "impl-core" });
    assert.equal(typeof text, "string");
    assert.match(text!, /legacy（未冻结）/);
    assert.match(text!, /角色：implementer/);
    assert.match(text!, /名下模块：impl-core/);
    assert.match(text!, /taskKind dispatch 必填/);
    const other = await check!({ roleId: "qa" });
    assert.equal(typeof other, "string", "工具层会裁剪到调用角色；session 数据源按 caller 裁剪");
    assert.match(other!, /角色：implementer/);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("contract_check topic：session 首句早退——无 run/无项目文档也返回 schema，且无 legacy 行（AC-8/12）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-contract-schema-topic-"));
  const h = harness(root);
  try {
    // 不写任何项目文件、不建 run：topic 早退不应依赖 listing/run 读取。
    await h.mgr.open({ projectRoot: root, roleId: "implementer", runtime: "demo" });
    await tick(30);
    const check = h.contractChecks.implementer;
    assert.equal(typeof check, "function");
    if (!check) return;
    const expected: Array<["modules" | "roster" | "topology", string]> = [
      ["modules", PROJECT_MODULES_SCHEMA],
      ["roster", PROJECT_ROSTER_SCHEMA],
      ["topology", PROJECT_TOPOLOGY_SCHEMA],
    ];
    for (const [topic, schema] of expected) {
      const text = await check({ topic });
      assert.equal(typeof text, "string", topic);
      if (typeof text !== "string") continue;
      assert.ok(text.includes(`contract_check topic=${topic}`), `${topic} 头部`);
      assert.ok(text.includes(schema), `${topic} schema 标识 ${schema}`);
      assert.ok(Buffer.byteLength(text, "utf8") <= 4096, `${topic} ≤4096 B`);
      for (const line of text.split(/\r?\n/)) {
        assert.doesNotMatch(line, /^run：/, `${topic} 无 run 行`);
        assert.doesNotMatch(line, /^taskKind .*必填/, `${topic} 无 taskKind 必填行`);
        assert.doesNotMatch(line, /^可写边界：/, `${topic} 无写区行`);
      }
    }
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("contract_check topic：session 层 topic + flowId + taskKind 并存时 topic 优先（AC-8）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-contract-schema-coexist-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "implementer", runtime: "demo" });
    await tick(30);
    const check = h.contractChecks.implementer;
    assert.equal(typeof check, "function");
    if (!check) return;
    const plain = await check({ topic: "roster" });
    const coexisting = await check({ topic: "roster", flowId: "focus", taskKind: "dispatch" });
    assert.equal(typeof plain, "string");
    assert.equal(coexisting, plain, "topic 优先：flowId/taskKind 被忽略");
    if (typeof coexisting !== "string") return;
    for (const line of coexisting.split(/\r?\n/)) {
      assert.doesNotMatch(line, /^run：/);
      assert.doesNotMatch(line, /^taskKind .*必填/);
      assert.doesNotMatch(line, /^可写边界：/);
    }
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("F2：版本化文档基线违规受理 + advisory；基线/文档未被改写", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-baseline-reject-"));
  // B3a：v2.0.0 source 门要求真实注册生命周期 + 当前 accepted 客户轮次 + managed 会话证据。
  const h = sourceGatedHarness(root);
  try {
    await writeProject(root);
    const intentPath = path.join(root, "docs/product/focus-intent-v1.md");
    await fs.appendFile(intentPath, "\n# 外部篡改\n", "utf8");
    const intentHash = createHash("sha256").update(await fs.readFile(intentPath)).digest("hex");
    const versionsPath = path.join(root, ".ans/state/versions.jsonl");
    const versionsHash = createHash("sha256").update(await fs.readFile(versionsPath)).digest("hex");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const before = (await readTaskState(root)).records.size;
    const receipt = await h.dispatchViaAcceptedTurn({ roleId: "product", task: "写产品意图", sideEffect: "docs", flowId: "focus" }, "请派产品写产品意图（基线违规场景）");
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.match(receipt.message ?? "", /状态提示（未阻断）/);
    assert.match(receipt.message ?? "", /基线|只读|版本化/);
    assert.equal((await readTaskState(root)).records.size, before + 1, "基线漂移仍受理并建任务");
    assert.equal(createHash("sha256").update(await fs.readFile(intentPath)).digest("hex"), intentHash, "文档未被改写");
    assert.equal(createHash("sha256").update(await fs.readFile(versionsPath)).digest("hex"), versionsHash, "基线记录未被改写");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("§5A contract_check：四角色按裁剪输出意图入口契约与当前事实；其他角色不输出", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-intent-contract-check-"));
  const h = harness(root);
  try {
    await writeProject(root);
    const intentEntry = "docs/intents/intent-focus-v1.md";
    const productIntent = [
      "---",
      "intentId: intent-focus-v1",
      "flowId: focus",
      "version: 1",
      "goal: 示例目标",
      "scope: 示例范围",
      "acceptance: 示例验收",
      "---",
      "# 产品意图",
      "",
    ].join("\n");
    const proposal = [
      "---",
      "schema: project-proposal/v2",
      "flowId: focus",
      "version: 1",
      "intentId: intent-focus-v1",
      "intent: docs/product/focus-intent-v1.md",
      "---",
      "# 提案",
      "",
    ].join("\n");
    await fs.writeFile(path.join(root, "docs/product/focus-intent-v1.md"), productIntent, "utf8");
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v1.md"), proposal, "utf8");
    await fs.mkdir(path.join(root, "docs/intents"), { recursive: true });
    await fs.writeFile(path.join(root, intentEntry), ["---", "intentId: intent-focus-v1", "flowId: focus", "goal: 示例目标", "scope: 示例范围", "acceptance: 示例验收", "---", "# 意图", ""].join("\n"), "utf8");

    const contractRoleIds = ["chief", "product", "rapporteur", "nominator"] as const;
    for (const roleId of contractRoleIds) {
      await h.mgr.open({ projectRoot: root, roleId, runtime: "demo" });
      await tick(20);
    }
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(20);
    await h.mgr.open({ projectRoot: root, roleId: "verifier", runtime: "demo" });
    await tick(20);

    for (const roleId of contractRoleIds) {
      const check = h.contractChecks[roleId];
      assert.equal(typeof check, "function", `${roleId} 应注入 contract_check`);
      const text = (await check!({ flowId: "focus" })) ?? "";
      assert.match(text, /意图入口契约/, roleId);
      assert.match(text, /docs\/intents\/<intentId>\.md/, roleId);
      assert.match(text, /intentId: <小写 slug/, roleId);
      assert.match(text, /意图入口事实：intentId=intent-focus-v1/, roleId);
      assert.match(text, /入口 docs\/intents\/intent-focus-v1\.md/, roleId);
      assert.match(text, /存在=yes/, roleId);
      assert.match(text, /intentId 匹配=yes/, roleId);
      assert.match(text, /来源=proposal/, roleId);
      assert.match(text, /一致性=yes/, roleId);
      assert.ok(Buffer.byteLength(text, "utf8") <= 4096, `${roleId} contract_check 组合输出须 ≤4KB`);
    }
    for (const roleId of ["convener", "verifier"] as const) {
      const check = h.contractChecks[roleId];
      assert.equal(typeof check, "function");
      const text = (await check!({ flowId: "focus" })) ?? "";
      assert.doesNotMatch(text, /意图入口契约/, roleId);
      assert.doesNotMatch(text, /intentId: <小写 slug/, roleId);
    }

    // 入口文件 intentId 与解析结果不一致 ⇒ 事实行给出 no（不改判断/不放行）。
    await fs.writeFile(path.join(root, intentEntry), ["---", "intentId: intent-other-v1", "flowId: focus", "goal: 示例目标", "scope: 示例范围", "acceptance: 示例验收", "---", "# 意图", ""].join("\n"), "utf8");
    const mismatched = (await h.contractChecks.chief!({ flowId: "focus" })) ?? "";
    assert.match(mismatched, /intentId 匹配=no/);
    // 产品-only：提案 frontmatter 不含 intentId ⇒ 来源 product（与 judge 同一解析器）。
    await fs.writeFile(path.join(root, intentEntry), ["---", "intentId: intent-focus-v1", "flowId: focus", "goal: 示例目标", "scope: 示例范围", "acceptance: 示例验收", "---", "# 意图", ""].join("\n"), "utf8");
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v1.md"), proposal.replace("intentId: intent-focus-v1\n", ""), "utf8");
    const productOnly = (await h.contractChecks.chief!({ flowId: "focus" })) ?? "";
    assert.match(productOnly, /来源=product/);
    assert.match(productOnly, /意图入口事实：intentId=intent-focus-v1/);
    assert.match(productOnly, /存在=yes/);
    assert.match(productOnly, /一致性=无法核对/);
    // 产品/提案冲突 ⇒ fail-closed 且事实显式可见（不得任选一个来源冒充）。
    await fs.writeFile(path.join(root, "docs/proposals/focus-proposal-v1.md"), proposal.replace("intentId: intent-focus-v1", "intentId: intent-other-v1"), "utf8");
    const inconsistent = (await h.contractChecks.chief!({ flowId: "focus" })) ?? "";
    assert.match(inconsistent, /意图入口解析：intent-ambiguous/);
    assert.match(inconsistent, /一致性=no/);
    assert.doesNotMatch(inconsistent, /意图入口事实：intentId=/);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("R2：handoff 无 flowId 受理、省略锚点、run-ledger-unavailable", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：当前 hub 派发必须带 flowId（`chief-hub-flow-unavailable`），
  // 「无 flowId 受理 + 省略锚点 + run-ledger-unavailable advisory」旧语义已删除；断言改为硬拒且零任务。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-no-flow-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const receipt = (await h.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only" })) as DispatchReceipt;
    assert.equal(receipt.ok, false, "缺 flowId 的 handoff 必须硬拒");
    assert.match(receipt.message ?? "", /chief-hub-flow-unavailable/);
    assert.doesNotMatch(receipt.message ?? "", /状态提示（未阻断）/, "硬拒不回退 advisory 受理");
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "拒发零任务（不创建裸 handoff）");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("R2：run 账本不可用时 handoff 受理、无锚点、run-ledger-unavailable", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：run 账本不可用时，当前 handoff 不再「受理 + 无锚点 + advisory」，
  // 而是由 trunk planning 写入门 fail-closed（trunk-verify-failed：ENOTDIR），零任务、零投递。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-ledger-"));
  const h = sourceGatedHarness(root);
  try {
    await writeProject(root);
    await fs.mkdir(path.join(root, ".ans"), { recursive: true });
    await fs.writeFile(path.join(root, ".ans/runs"), "not a directory\n", "utf8");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const receipt = await h.dispatchViaAcceptedTurn({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" }, "请派运营（run 账本不可用）");
    assert.equal(receipt.ok, false, "run 账本不可用 ⇒ planning 写入门 fail-closed");
    assert.match(receipt.message ?? "", /trunk-verify-failed/);
    assert.match(receipt.message ?? "", /ENOTDIR/, "如实报告账本路径不可用");
    assert.doesNotMatch(receipt.message ?? "", /状态提示（未阻断）/, "硬拒不回退 advisory 受理");
    const state = await readTaskState(root);
    assert.equal(state.records.size, 0, "拒发零任务（无无锚点 handoff）");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("AC-2.8：会话级 pinned 哈希漂移受理、advisory、manifest 未改写、任务无锚点", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：worker 执行改由 trunk execution preflight 冻结——legacy pinned run
  // 无 trunk 历史证据 ⇒ `Old run lacks its historical evidence` 硬拒（不再「受理 + advisory + 不锚定」）。
  // 「零 worker 任务、manifest 不被改写、硬拒不回退 advisory」判据保留。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-hash-drift-"));
  const h = sourceGatedHarness(root, { realRoles: ["chief", "convener"] });
  try {
    await writeProject(root);
    const runId = await pinFocusRun(root);
    const manifestPath = runManifestPath(root, runId);
    const manifestBefore = await fs.readFile(manifestPath, "utf8");
    await fs.appendFile(path.join(root, "docs/product/focus-intent-v1.md"), "\n# 漂移\n", "utf8");
    await appendTaskEvent(root, {
      v: 1, at: "2026-11-16T00:00:10.000Z", kind: "task.created", taskId: "t-convener-ac28", flowId: "focus",
      from: "chief", to: "convener", text: "把项目交付运营（哈希漂移场景）", sideEffect: "read-only",
      idempotencyKey: "ac28-handoff", runId, runState: "pinned",
    });
    const receipt = await h.dispatchWorkerViaAssignedTurn("convener", "t-convener-ac28", { roleId: "implementer", task: "实现哈希漂移", sideEffect: "code", flowId: "focus", moduleId: "impl-core" }, "请派实现（哈希漂移场景）");
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /worker-freeze stage=prepare code=trunk-verify-failed/);
    assert.match(receipt.message ?? "", /Old run lacks its historical evidence/);
    assert.doesNotMatch(receipt.message ?? "", /状态提示（未阻断）/, "冻结硬拒不回退 advisory");
    const state = await readTaskState(root);
    assert.equal([...state.records.values()].some((record) => record.created?.text.includes("实现哈希漂移")), false, "冻结拒绝零 worker 任务");
    assert.equal(await fs.readFile(manifestPath, "utf8"), manifestBefore, "manifest 未被改写");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("AC-2.8/R2：pinned roster 失败受理、advisory、manifest 未改写、任务无锚点", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：roster 失效的 legacy pinned run 同样先被 trunk execution
  // preflight 冻结硬拒（Old run lacks its historical evidence），不再「受理 + roster advisory + 不锚定」。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-roster-invalid-"));
  const h = sourceGatedHarness(root, { realRoles: ["chief", "convener"] });
  try {
    await writeProject(root);
    const runId = await pinFocusRun(root);
    const manifestPath = runManifestPath(root, runId);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const badRosterPath = "docs/proposals/focus-roster-bad.md";
    const badRosterText = "not a roster\n";
    await fs.writeFile(path.join(root, badRosterPath), badRosterText, "utf8");
    const badSha = createHash("sha256").update(Buffer.from(badRosterText, "utf8")).digest("hex");
    manifest["documents"] = { ...(manifest["documents"] as Record<string, unknown>), roster: { path: badRosterPath, sha256: badSha } };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    const manifestBefore = await fs.readFile(manifestPath, "utf8");
    await appendTaskEvent(root, {
      v: 1, at: "2026-11-16T00:00:11.000Z", kind: "task.created", taskId: "t-convener-ac28r2", flowId: "focus",
      from: "chief", to: "convener", text: "把项目交付运营（roster 失效场景）", sideEffect: "read-only",
      idempotencyKey: "ac28r2-handoff", runId, runState: "pinned",
    });
    const receipt = await h.dispatchWorkerViaAssignedTurn("convener", "t-convener-ac28r2", { roleId: "implementer", task: "实现 roster 失败", sideEffect: "code", flowId: "focus", moduleId: "impl-core" }, "请派实现（roster 失效场景）");
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /worker-freeze stage=prepare code=trunk-verify-failed/);
    assert.match(receipt.message ?? "", /Old run lacks its historical evidence/);
    assert.doesNotMatch(receipt.message ?? "", /状态提示（未阻断）/, "冻结硬拒不回退 advisory");
    assert.doesNotMatch(receipt.message ?? "", /不在 pinned run 的模块集/, "不混写模块覆盖 advisory");
    assert.doesNotMatch(receipt.message ?? "", /run-pinned-roster-invalid/, "不混写 roster advisory");
    const state = await readTaskState(root);
    assert.equal([...state.records.values()].some((record) => record.created?.text.includes("实现 roster 失败")), false, "冻结拒绝零 worker 任务");
    assert.equal(await fs.readFile(manifestPath, "utf8"), manifestBefore, "manifest 未被改写");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("AC-2.6：legacy flow 派发受理 + run-legacy-readonly + draft 锚点、旧记录可读", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：legacy flow 历史任务不再带来「advisory 受理 + draft 锚点」；
  // worker 执行必须由 trunk execution preflight 冻结。真实运营受派任务锚定同一 flow 的 draft run 后，
  // 冻结仍以 effective-manifest-missing 硬拒（planning-only draft 无执行工作流/团队计划证据）。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-legacy-flow-"));
  const h = sourceGatedHarness(root, { realRoles: ["chief", "convener"] });
  try {
    await writeProject(root);
    await appendTaskEvent(root, {
      v: 1,
      at: "2026-10-29T00:00:00.000Z",
      kind: "task.created",
      taskId: "t-legacy-flow",
      flowId: "focus",
      from: "chief",
      to: "product",
      text: "旧 legacy 任务",
      sideEffect: "docs",
      idempotencyKey: "legacy-flow",
    }, { allowLegacyRun: true });
    const draft = await ensureDraftRun(root, "focus");
    assert.equal(draft.ok, true, draft.ok ? "" : draft.reason);
    if (!draft.ok) return;
    await appendTaskEvent(root, {
      v: 1, at: "2026-11-16T00:00:12.000Z", kind: "task.created", taskId: "t-convener-ac26", flowId: "focus",
      from: "chief", to: "convener", text: "把项目交付运营（legacy flow 场景）", sideEffect: "read-only",
      idempotencyKey: "ac26-handoff", runId: draft.manifest.runId, runState: "draft",
    });
    const receipt = await h.dispatchWorkerViaAssignedTurn("convener", "t-convener-ac26", { roleId: "implementer", task: "实现 legacy flow", sideEffect: "code", flowId: "focus", moduleId: "impl-core" }, "请派实现（legacy flow 场景）");
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /worker-freeze stage=prepare code=trunk-verify-failed/);
    assert.match(receipt.message ?? "", /effective-manifest-missing/);
    assert.doesNotMatch(receipt.message ?? "", /状态提示（未阻断）|run-legacy-readonly/, "冻结硬拒不回退 legacy advisory");
    const state = await readTaskState(root);
    assert.equal([...state.records.values()].some((record) => record.created?.text.includes("实现 legacy flow")), false, "冻结拒绝零 worker 任务");
    assert.ok(state.records.has("t-legacy-flow"), "旧 legacy 记录可读");
    assert.equal(state.records.get("t-legacy-flow")?.created?.runState, "legacy", "旧记录仍如实标 legacy");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("P1-R-08-R1：pinned run 未声明 roles 时不产 run-role-missing、不锚定", async () => {
  // B3a 残差（2026-11-16，B4 同口径）：roles 未声明的 legacy pinned run 先由 trunk execution preflight
  // 冻结硬拒（Old run lacks its historical evidence）；不再产生 run-role-missing advisory、不锚定/建任务，
  // manifest 未被改写。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-roles-undefined-"));
  const h = sourceGatedHarness(root, { realRoles: ["chief", "convener"] });
  try {
    await writeProject(root);
    const runId = await pinFocusRun(root);
    const manifestPath = runManifestPath(root, runId);
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    delete manifest["roles"];
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    const manifestBefore = await fs.readFile(manifestPath, "utf8");
    await appendTaskEvent(root, {
      v: 1, at: "2026-11-16T00:00:13.000Z", kind: "task.created", taskId: "t-convener-p1r08", flowId: "focus",
      from: "chief", to: "convener", text: "把项目交付运营（roles 未声明场景）", sideEffect: "read-only",
      idempotencyKey: "p1r08-handoff", runId, runState: "pinned",
    });
    const receipt = await h.dispatchWorkerViaAssignedTurn("convener", "t-convener-p1r08", { roleId: "implementer", task: "实现 roles 未声明", sideEffect: "code", flowId: "focus", moduleId: "impl-core" }, "请派实现（roles 未声明场景）");
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /worker-freeze stage=prepare code=trunk-verify-failed/);
    assert.match(receipt.message ?? "", /Old run lacks its historical evidence/);
    assert.doesNotMatch(receipt.message ?? "", /run-role-missing|不在 pinned run 的角色集/, "roles undefined 视为无事实");
    const state = await readTaskState(root);
    assert.equal([...state.records.values()].some((record) => record.created?.text.includes("实现 roles 未声明")), false, "冻结拒绝零 worker 任务");
    assert.equal(await fs.readFile(manifestPath, "utf8"), manifestBefore, "manifest 未被改写");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

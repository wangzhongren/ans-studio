// test/桌面应用/run-change-trigger.test.ts
// 2026-10-31（run-change 触发缺陷 P1）：真实触发路径——
//   pinned run → 磁盘出现更高版本 proposal/roster（要求新角色）→ 真实派发被冻结拒绝 →
//   应用真实呈现 run-change 三模式卡（捕获 customerInput 三选项）→ continue-frozen /
//   stop-and-restart（新 draft 可重新 pin 并恢复派发）/ stop 的落账与后续行为。
// 另覆盖：无可呈现会话时只回 run-change-required 三段式；冻结 run 上更高版本提案卡先弹 run-change。
// 既有 `run-change.test.ts`（直接调用方法）保留，本条补「场景可达」。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { parseProjectRoster } from "../../src/common/编排/workflow-preconditions.ts";
import { appendTaskEvent, readTaskState } from "../../src/common/编排/task-state.ts";
import { findActiveRun, pinRun, readRunManifest } from "../../src/common/编排/run-manifest.ts";
import { recordVersionedDocBaselines } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { CustomerInputFn, CustomerInputRequest, DispatchReceipt, DispatchTaskFn } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const FLOW = "focus";

interface RoleDef {
  id: string;
  displayName: string;
  purpose: string;
  capability: string;
  moduleId: string;
  path: string;
}

const ROLES_V1: RoleDef[] = [
  { id: "engine-dev", displayName: "引擎开发", purpose: "实现引擎", capability: "TS", moduleId: "engine-core", path: "src/engine/" },
  { id: "render-dev", displayName: "渲染开发", purpose: "实现渲染", capability: "TS", moduleId: "render-core", path: "src/render/" },
  { id: "ui-dev", displayName: "界面开发", purpose: "实现界面", capability: "TS", moduleId: "ui-core", path: "src/ui/" },
  { id: "test-dev", displayName: "测试开发", purpose: "测试", capability: "测试", moduleId: "test-suite", path: "test/" },
  { id: "docs-dev", displayName: "文档开发", purpose: "文档站", capability: "文档", moduleId: "docs-site", path: "docs-site/" },
  { id: "network-dev", displayName: "网络开发", purpose: "实现网络", capability: "TS", moduleId: "network-core", path: "src/network/" },
];

const AUDIO_ROLE: RoleDef = { id: "audio-dev", displayName: "音频开发", purpose: "实现音频", capability: "TS", moduleId: "audio-core", path: "src/audio/" };

function rosterText(version: number, roles: RoleDef[], proposalVersion: number, architectureVersion = 1): string {
  return [
    "---",
    "schema: project-roster/v3",
    `flowId: ${FLOW}`,
    `version: ${version}`,
    "intent: docs/product/focus-intent-v1.md",
    `proposal: docs/proposals/focus-proposal-v${proposalVersion}.md`,
    `architecture: docs/contracts/focus-architecture-v${architectureVersion}.md`,
    "envBootstrapOmittedReason: 最小夹具省略装配/入口角色",
    "roles:",
    ...roles.flatMap((role) => [
      `  - id: ${role.id}`,
      `    displayName: ${role.displayName}`,
      `    purpose: ${role.purpose}`,
      `    capability: ${role.capability}`,
      `    modules: [${role.moduleId}]`,
    ]),
    "modules:",
    ...roles.flatMap((role) => [
      `  - id: ${role.moduleId}`,
      `    name: ${role.id} 模块`,
      `    purpose: ${role.purpose}`,
      `    path: ${role.path}`,
      "    category: core",
      `    publicContract: ${role.path}`,
      `    architectureSource: docs/contracts/focus-architecture-v${architectureVersion}.md`,
    ]),
    "---",
    "# 名单",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "modules:",
    ...roles.flatMap((role) => [`  - id: ${role.moduleId}`, `    path: ${role.path}`, `    roleId: ${role.id}`]),
    "roles:",
    ...roles.flatMap((role) => [`  - id: ${role.id}`, `    modules: [${role.moduleId}]`]),
    `management: [convener, ${roles.map((role) => role.id).join(", ")}]`,
    "```",
  ].join("\n");
}

async function writeFileAt(root: string, rel: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.writeFile(path.join(root, rel), text, "utf8");
}

async function writeRoleCards(root: string, roles: RoleDef[]): Promise<void> {
  for (const role of roles) {
    await writeFileAt(root, `角色卡/${role.id}/role-card.md`, `# ${role.displayName}\n`);
    await writeFileAt(root, `角色卡/${role.id}/boundary.yaml`, `role: ${role.id}\nentries: []\n`);
  }
}

async function writeProjectV1(root: string): Promise<void> {
  await writeFileAt(root, "docs/product/focus-intent-v1.md", "# 产品意图\n\n目标：番茄钟。\n");
  await writeFileAt(root, "docs/proposals/focus-proposal-v1.md", "---\nschema: project-proposal/v2\nflowId: focus\nversion: 1\nintent: docs/product/focus-intent-v1.md\n---\n# 提案\n");
  await writeFileAt(root, "docs/proposals/focus-roster-v1.md", rosterText(1, ROLES_V1, 1));
  const parsed = parseProjectRoster(rosterText(1, ROLES_V1, 1), FLOW);
  if (!parsed.ok) throw new Error(parsed.reason);
  await writeFileAt(root, "docs/proposals/focus-modules-v1.md", ["---", "schema: project-modules/v2", "flowId: focus", "version: 1", `modules: ${JSON.stringify(parsed.roster.modules)}`, "---", "# 模块清单"].join("\n"));
  await writeFileAt(root, "docs/contracts/focus-architecture-v1.md", "# 架构\n\nproposal: docs/proposals/focus-proposal-v1.md\n");
  await writeRoleCards(root, ROLES_V1);
  await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });
}

/** pin 之后出现：proposal v2 + architecture v2 + roster v2（新增 audio-dev / audio-core）+ modules v2。 */
async function writeProjectV2(root: string): Promise<void> {
  const rolesV2 = [...ROLES_V1, AUDIO_ROLE];
  await writeFileAt(root, "docs/proposals/focus-proposal-v2.md", "---\nschema: project-proposal/v2\nflowId: focus\nversion: 2\nintent: docs/product/focus-intent-v1.md\n---\n# 提案 v2\n");
  await writeFileAt(root, "docs/contracts/focus-architecture-v2.md", "# 架构 v2\n\nproposal: docs/proposals/focus-proposal-v2.md\n");
  await writeFileAt(root, "docs/proposals/focus-roster-v2.md", rosterText(2, rolesV2, 2, 2));
  const parsed = parseProjectRoster(rosterText(2, rolesV2, 2, 2), FLOW);
  if (!parsed.ok) throw new Error(parsed.reason);
  await writeFileAt(root, "docs/proposals/focus-modules-v2.md", ["---", "schema: project-modules/v2", "flowId: focus", "version: 2", `modules: ${JSON.stringify(parsed.roster.modules)}`, "---", "# 模块清单 v2"].join("\n"));
  await writeRoleCards(root, [AUDIO_ROLE]);
  await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });
}

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: NonNullable<ProjectListing["roles"][number]["governanceFunction"]>): ProjectListing["roles"][number] => ({
    roleId, cardPath: "", boundaryPath: "", cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true, governanceFunction: fn,
  });
  const worker = (role: RoleDef): ProjectListing["roles"][number] => ({
    roleId: role.id, cardPath: `角色卡/${role.id}/role-card.md`, boundaryPath: `角色卡/${role.id}/boundary.yaml`, cardText: role.id,
    boundary: { entries: [{ root: "project", path: role.path, kind: "directory", purpose: "p" }], boundarySource: `角色卡/${role.id}/boundary.yaml`, acceptance: { accepted: false, source: "" } },
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("product", "product"),
      builtIn("rapporteur", "proposal"),
      builtIn("nominator", "nomination"),
      builtIn("convener", "schedule"),
      builtIn("verifier", "verification"),
      ...ROLES_V1.map(worker),
      worker(AUDIO_ROLE),
    ],
    warnings: [], hasRoles: true, primaryRoleId: "chief", governanceModel: "trio",
  };
}

interface HarnessOptions {
  /** 客户卡通道的作答策略；缺省 ⇒ declined。`withCustomerInput:false` ⇒ 不接通道（兜底场景）。 */
  answer?: (request: CustomerInputRequest) => Promise<import("../../src/model/runtime.ts").CustomerInputOutcome> | import("../../src/model/runtime.ts").CustomerInputOutcome;
  withCustomerInput?: boolean;
  /** AC-17（D2）：版本变更栈（只读 `listVersionChanges` 判定在途 VCA）。 */
  stack?: import("../../app/desktop/version-change.ts").VersionChangeStack;
}

function harness(root: string, options: HarnessOptions = {}) {
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  const customerInputs: Record<string, CustomerInputFn | undefined> = {};
  const customerRequests: CustomerInputRequest[] = [];
  const events: Array<{ roleId: string; projectRoot: string; runtime: string; event: { kind: string; summary?: string } }> = [];
  const customerInput: CustomerInputFn | undefined = options.withCustomerInput === false
    ? undefined
    : async (request) => {
        customerRequests.push(request);
        return options.answer !== undefined ? options.answer(request) : { outcome: "declined", operatorId: "test" };
      };
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = (input as { dispatchTask?: DispatchTaskFn }).dispatchTask;
      customerInputs[input.roleId] = (input as { customerInput?: CustomerInputFn }).customerInput;
      const handle: RoleSessionHandle = {
        async send() {},
        events() {
          return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(20); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
        },
        async dispose() {},
      };
      return handle;
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: (envelope) => {
      events.push(envelope as unknown as (typeof events)[number]);
    },
    ...(customerInput !== undefined ? { customerInput } : {}),
    ...(options.stack !== undefined ? { getVersionChangeStack: () => options.stack } : {}),
  });
  return { mgr, caps, customerInputs, customerRequests, events };
}

const D3_TARGETS = ["engine-dev", "render-dev", "ui-dev", "test-dev", "docs-dev"];

async function appendD3(root: string): Promise<void> {
  const bytes = await fs.readFile(path.join(root, "docs/proposals/focus-roster-v1.md"));
  await appendTaskEvent(root, {
    v: 1, at: "2026-10-31T00:00:00.000Z", kind: "request.created", requestId: "req-d3", flowId: FLOW,
    intentId: FLOW, sourceRoleId: "nominator", title: "D3 招人决定",
    options: D3_TARGETS.map((id) => ({ id, label: id })),
  });
  await appendTaskEvent(root, {
    v: 1, at: "2026-10-31T00:00:01.000Z", kind: "request.resolved", requestId: "req-d3", decisionId: "decision-req-d3",
    intentId: FLOW, targetRoleIds: D3_TARGETS, rosterVersion: 1,
    rosterSha256: createHash("sha256").update(bytes).digest("hex"), by: "judge", choice: D3_TARGETS[0],
  });
}

/** 真实 pin：chief → convener 的 project-handoff 派发触发 pin，返回 pinned runId。 */
async function setupPinnedRun(root: string, h: ReturnType<typeof harness>): Promise<string> {
  await writeProjectV1(root);
  await appendD3(root);
  assert.equal((await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" })).ok, true);
  await tick(30);
  const handoff = (await h.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: FLOW })) as DispatchReceipt;
  assert.equal(handoff.ok, true, handoff.message ?? "");
  const active = await findActiveRun(root, FLOW);
  assert.equal(active.ok, true);
  if (!active.ok || active.manifest === null) throw new Error("handoff 未 pin run");
  assert.equal(active.manifest.state, "pinned");
  assert.deepEqual(active.manifest.roles, ROLES_V1.map((role) => role.id));
  return active.manifest.runId;
}

async function waitForManifest(root: string, runId: string, predicate: (manifest: import("../../src/common/编排/run-manifest.ts").RunManifest) => boolean): Promise<import("../../src/common/编排/run-manifest.ts").RunManifest> {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const read = await readRunManifest(root, runId);
    if (read.ok && predicate(read.manifest)) return read.manifest;
    await tick(20);
  }
  const final = await readRunManifest(root, runId);
  throw new Error(`等待 manifest 条件超时：${final.ok ? JSON.stringify(final.manifest.runChange ?? null) : final.reason}`);
}

function runChangeCards(requests: CustomerInputRequest[]): CustomerInputRequest[] {
  return requests.filter((request) => request.cardKind === "decision" && (request as { application?: boolean }).application === true);
}

test("派发不再自动弹 run-change：pinned + 新版本 → 受理 + advisory；客户卡请求数 0", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-no-auto-"));
  const h = harness(root, {
    answer: () => {
      assert.fail("派发不应自动呈现客户卡");
    },
  });
  try {
    const oldRunId = await setupPinnedRun(root, h);
    await writeProjectV2(root);
    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(20);
    const before = (await readTaskState(root)).records.size;
    const receipt = (await h.caps.convener!({
      roleId: "audio-dev",
      task: "实现音频模块",
      sideEffect: "code",
      flowId: FLOW,
      moduleId: "audio-core",
    })) as DispatchReceipt;
    assert.equal(receipt.ok, true, receipt.message ?? "");
    assert.match(receipt.message ?? "", /状态提示（未阻断）/);
    assert.match(receipt.message ?? "", /run-role-missing|角色集|pinned run/);
    assert.equal((await readTaskState(root)).records.size, before + 1, "受理并建任务");
    assert.equal(runChangeCards(h.customerRequests).length, 0, "不再自动呈现 run-change 卡");
    assert.equal(h.customerRequests.length, 0, "客户卡请求数为 0");
    const active = await findActiveRun(root, FLOW);
    assert.equal(active.ok, true);
    if (active.ok) {
      assert.equal(active.manifest?.runId, oldRunId);
      assert.equal(active.manifest?.state, "pinned", "旧 run 未被改写");
      assert.equal(active.manifest?.runChange, undefined);
    }
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

for (const mode of ["continue-frozen", "stop-and-restart", "stop"] as const) {
  test(`显式入口（${mode}）：requestRunChangeDecision 三模式落账不变`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `ans-run-change-explicit-${mode}-`));
    const h = harness(root, {
      answer: (request) => {
        assert.equal(request.cardKind, "decision", "显式入口呈现 decision 卡（run-change）");
        assert.equal((request as { application?: boolean }).application, true);
        const choice = request as Extract<CustomerInputRequest, { kind: "choice" }>;
        assert.deepEqual(choice.options.map((option) => option.id), ["continue-frozen", "stop-and-restart", "stop"], "三模式选项");
        return { outcome: "answered", value: { selected: [mode] }, decisionId: `decision-run-change-${mode}`, operatorId: "customer" };
      },
    });
    try {
      const oldRunId = await setupPinnedRun(root, h);
      await writeProjectV2(root);
      assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      await tick(20);
      const started = await h.mgr.requestRunChangeDecision({ projectRoot: root, flowId: FLOW, requestedBy: "convener", reason: "客户要求变更" });
      assert.equal(started.ok, true, started.ok ? "" : started.error);
      if (!started.ok) return;
      const outcome = await started.outcome;
      assert.equal(outcome.outcome, "answered");
      const cards = runChangeCards(h.customerRequests);
      assert.equal(cards.length, 1, "显式入口真实呈现 run-change 卡");
      const card = cards[0] as Extract<CustomerInputRequest, { kind: "choice" }>;
      assert.equal(card.flowId, FLOW);
      assert.equal((card as { sourceRoleId?: string }).sourceRoleId, "application");

      const manifest = await waitForManifest(root, oldRunId, (value) => value.runChange?.decisionId === `decision-run-change-${mode}`);
      assert.equal(manifest.runChange?.mode, mode);
      assert.equal(manifest.runChange?.decidedBy, "customer");
      if (mode === "continue-frozen") {
        assert.equal(manifest.state, "pinned", "continue-frozen 不改 run 状态");
        assert.equal(manifest.runChange?.newRunId, undefined);
        const active = await findActiveRun(root, FLOW);
        assert.equal(active.ok, true);
        if (active.ok) assert.equal(active.manifest?.runId, oldRunId, "旧 run 仍是 active pinned");
      } else if (mode === "stop-and-restart") {
        assert.equal(manifest.state, "closed", "旧 run 收口（不宣称完成）");
        assert.match(manifest.runChange?.newRunId ?? "", /^run-/);
        const active = await findActiveRun(root, FLOW);
        assert.equal(active.ok, true);
        if (active.ok) {
          assert.equal(active.manifest?.runId, manifest.runChange?.newRunId);
          assert.equal(active.manifest?.state, "draft", "stop-and-restart 后新 run 为 draft，需重新 pin");
        }
      } else {
        assert.equal(manifest.state, "cancelled", "stop 取消当前 run");
        assert.equal(manifest.runChange?.newRunId, undefined);
        const active = await findActiveRun(root, FLOW);
        assert.equal(active.ok, true);
        if (active.ok) assert.equal(active.manifest, null, "stop 不产生新 run");
      }
    } finally {
      await h.mgr.stop(null);
      await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });
}

test("stop-and-restart 后：新 draft run 可按 v2 文档重新 pin，并恢复派发新角色", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-restart-pin-"));
  const h = harness(root, {
    answer: () => ({ outcome: "answered", value: { selected: ["stop-and-restart"] }, decisionId: "decision-run-change-restart", operatorId: "customer" }),
  });
  try {
    const oldRunId = await setupPinnedRun(root, h);
    await writeProjectV2(root);
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    await tick(20);
    const started = await h.mgr.requestRunChangeDecision({ projectRoot: root, flowId: FLOW, requestedBy: "convener", reason: "客户要求变更" });
    assert.equal(started.ok, true, started.ok ? "" : started.error);
    if (!started.ok) return;
    const outcome = await started.outcome;
    assert.equal(outcome.outcome, "answered");
    const oldManifest = await waitForManifest(root, oldRunId, (value) => value.runChange?.mode === "stop-and-restart");
    const newRunId = oldManifest.runChange!.newRunId!;

    // 以 v2 文档重新 pin 新 run（D3 选中集含新角色）。
    const pinned = await pinRun(root, newRunId, {
      d3: { decisionId: "decision-req-v2", targetRoleIds: [...D3_TARGETS, AUDIO_ROLE.id] },
    });
    assert.equal(pinned.ok, true, pinned.ok ? "" : pinned.reason);
    if (!pinned.ok) return;
    assert.equal(pinned.manifest.state, "pinned");
    assert.deepEqual(pinned.manifest.roles, [...ROLES_V1.map((role) => role.id), AUDIO_ROLE.id]);
    assert.match(pinned.manifest.documents.roster?.path ?? "", /focus-roster-v2\.md$/);
    assert.match(pinned.manifest.documents.proposal?.path ?? "", /focus-proposal-v2\.md$/);

    // 新 pinned run 上，同一派发可通过（冻结基线已包含新角色/模块）。
    const accepted = (await h.caps.convener!({
      roleId: "audio-dev",
      task: "实现音频模块",
      sideEffect: "code",
      flowId: FLOW,
      moduleId: "audio-core",
    })) as DispatchReceipt;
    assert.equal(accepted.ok, true, accepted.message ?? "");
    const state = await (await import("../../src/common/编排/task-state.ts")).readTaskState(root);
    const record = [...state.records.values()].find((item) => item.created?.to === AUDIO_ROLE.id);
    assert.ok(record, "新角色任务已创建");
    assert.equal(record!.created!.runId, newRunId);
    assert.equal(record!.created!.runState, "pinned");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("显式入口无会话兜底：没有可呈现的客户卡会话 ⇒ 如实失败（不弹卡）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-no-session-"));
  const h = harness(root, { withCustomerInput: false });
  try {
    await setupPinnedRun(root, h);
    await writeProjectV2(root);
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    await tick(20);
    const started = await h.mgr.requestRunChangeDecision({ projectRoot: root, flowId: FLOW, requestedBy: "convener", reason: "客户要求变更" });
    assert.equal(started.ok, false, "没有可呈现会话 ⇒ 如实失败（不伪造成功）");
    if (!started.ok) assert.match(started.error ?? "", /会话|呈现|客户/);
    assert.equal(h.customerRequests.length, 0, "没有通道 ⇒ 不呈现任何卡");
    // 旧 run 不被改动。
    const active = await findActiveRun(root, FLOW);
    assert.equal(active.ok, true);
    if (active.ok) {
      assert.equal(active.manifest?.state, "pinned");
      assert.equal(active.manifest?.runChange, undefined);
    }
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("宁可不弹（B1）：目标不存在 ⇒ 硬 target-card-missing，不呈现 run-change", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-no-fire-"));
  const h = harness(root, {
    answer: () => ({ outcome: "answered", value: { selected: ["stop"] }, decisionId: "decision-should-not-happen", operatorId: "customer" }),
  });
  try {
    await setupPinnedRun(root, h);
    await writeProjectV2(root);
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    await tick(20);
    const before = (await readTaskState(root)).records.size;
    const receipt = (await h.caps.convener!({
      roleId: "ghost-dev",
      task: "实现幽灵模块",
      sideEffect: "code",
      flowId: FLOW,
      moduleId: "ghost-core",
    })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /target-card-missing|不存在|未枚举/);
    assert.equal((receipt.message ?? "").includes("run-change-required"), false, "硬拒不触发 run-change");
    assert.equal(h.customerRequests.length, 0, "没有误弹客户卡");
    assert.equal((await readTaskState(root)).records.size, before, "硬拒无任务行");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("提案卡：冻结 run 上出现更高版本 proposal ⇒ 先尝试 run-change 卡，提案卡 notPresented 拒发", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-proposal-"));
  const h = harness(root, {
    answer: () => ({ outcome: "declined", operatorId: "customer", reason: "客户暂不在" }),
  });
  try {
    await setupPinnedRun(root, h);
    await writeProjectV2(root);
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" })).ok, true);
    await tick(20);
    const injected = h.customerInputs.rapporteur;
    assert.equal(typeof injected, "function", "rapporteur 会话应注入客户卡通道");
    const proposalCard: CustomerInputRequest = {
      kind: "choice",
      title: "接受提案 v2",
      cardKind: "proposal",
      flowId: FLOW,
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
    };
    const outcome = await injected!(proposalCard, { cardKind: "proposal", flowId: FLOW } as never);
    assert.equal(outcome?.outcome, "declined");
    if (outcome?.outcome === "declined") {
      assert.equal(outcome.notPresented, true, "冻结冲突 ⇒ 卡片未呈现给客户");
      assert.match(outcome.reason ?? "", /run-change-required/);
      assert.match(outcome.reason ?? "", /谁来做：app/);
    }
    const cards = runChangeCards(h.customerRequests);
    assert.equal(cards.length, 1, "先尝试呈现 run-change 卡（真实通道）");
    const choice = cards[0] as Extract<CustomerInputRequest, { kind: "choice" }>;
    assert.deepEqual(choice.options.map((option) => option.id), ["continue-frozen", "stop-and-restart", "stop"]);
    assert.equal(h.customerRequests.length, 1, "提案卡本身没有被呈现（只出现 run-change 卡）");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

/** AC-17（D2）：只读 VCA 记录的最小栈（open 只需 ensureInitialized；抑制判定只需 listVersionChanges）。 */
function vcaStack(records: Array<{ applicationId: string; status: string }>): import("../../app/desktop/version-change.ts").VersionChangeStack {
  return {
    projectRoot: "/p",
    ensureInitialized: async () => ({ ok: true, cacheHealth: "ok" }),
    listVersionChanges: async () =>
      records.map((entry) => ({
        applicationId: entry.applicationId,
        status: entry.status,
        kind: "version-upgrade",
        initiatorRoleId: "product",
        flowId: FLOW,
        summary: "test",
        bootstrap: false,
        baseTrunk: null,
        targets: [],
        at: "2026-11-05T00:00:00.000Z",
      })),
  } as unknown as import("../../app/desktop/version-change.ts").VersionChangeStack;
}

test("AC-17：VCA submitted/approved 在途 ⇒ 抑制自动 run-change（系统行）；结束后恢复；显式入口保留", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-vca-suppress-"));
  const pending = [{ applicationId: "vc-1", status: "submitted" }];
  const h = harness(root, {
    answer: () => ({ outcome: "declined", operatorId: "customer", reason: "客户暂不在" }),
    stack: vcaStack(pending),
  });
  try {
    await setupPinnedRun(root, h);
    await writeProjectV2(root);
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "rapporteur", runtime: "demo" })).ok, true);
    await tick(20);
    const injected = h.customerInputs.rapporteur;
    assert.equal(typeof injected, "function", "rapporteur 会话应注入客户卡通道");
    const proposalCard: CustomerInputRequest = {
      kind: "choice",
      title: "接受提案 v2",
      cardKind: "proposal",
      flowId: FLOW,
      options: [{ id: "accept", label: "接受" }, { id: "reject", label: "拒绝" }],
    };
    const first = await injected!(proposalCard, { cardKind: "proposal", flowId: FLOW } as never);
    assert.equal(first?.outcome, "declined");
    if (first?.outcome === "declined") {
      assert.equal(first.notPresented, true, "VCA 在途 ⇒ 提案卡未呈现");
      assert.match(first.reason ?? "", /vc-1/, "拒绝原因指出在途 VCA");
    }
    assert.equal(runChangeCards(h.customerRequests).length, 0, "VCA 在途 ⇒ 不弹自动 run-change 卡");
    assert.ok(
      h.events.some(
        (envelope) =>
          envelope.event.kind === "message" && (envelope.event.summary ?? "").includes("vc-1"),
      ),
      "发系统行提示 VCA 在途",
    );
    // approved 同样抑制。
    pending[0]!.status = "approved";
    await injected!(proposalCard, { cardKind: "proposal", flowId: FLOW } as never);
    assert.equal(runChangeCards(h.customerRequests).length, 0, "approved 在途同样抑制");
    // VCA 结束（列表为空）⇒ 自动 offer 恢复（同一 run 未被占自动提示名额）。
    pending.length = 0;
    await injected!(proposalCard, { cardKind: "proposal", flowId: FLOW } as never);
    assert.equal(runChangeCards(h.customerRequests).length, 1, "VCA 结束后自动 run-change offer 恢复");
    // 显式低层入口不被抑制。
    pending.push({ applicationId: "vc-2", status: "submitted" });
    const explicit = await h.mgr.requestRunChangeDecision({ projectRoot: root, flowId: FLOW });
    assert.equal(explicit.ok, true);
    if (explicit.ok) {
      const outcome = await explicit.outcome;
      assert.equal(outcome?.outcome, "declined");
    }
    assert.equal(runChangeCards(h.customerRequests).length, 2, "显式入口仍呈现 run-change 卡");
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

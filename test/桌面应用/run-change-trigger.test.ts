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
import { appendTaskEvent } from "../../src/common/编排/task-state.ts";
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
}

function harness(root: string, options: HarnessOptions = {}) {
  const caps: Record<string, DispatchTaskFn | undefined> = {};
  const customerInputs: Record<string, CustomerInputFn | undefined> = {};
  const customerRequests: CustomerInputRequest[] = [];
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
    emitEvent: () => {},
    ...(customerInput !== undefined ? { customerInput } : {}),
  });
  return { mgr, caps, customerInputs, customerRequests };
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

for (const mode of ["continue-frozen", "stop-and-restart", "stop"] as const) {
  test(`真实触发（${mode}）：pinned run + 新版本契约 → 派发被冻结拒绝并呈现 run-change 卡`, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `ans-run-change-trigger-${mode}-`));
    const h = harness(root, {
      answer: (request) => {
        assert.equal(request.cardKind, "decision", "自动触发只呈现 decision 卡（run-change）");
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

      // 真实派发：目标 audio-dev 只存在于 v2 名单；冻结基线（v1）拒绝。
      const receipt = (await h.caps.convener!({
        roleId: "audio-dev",
        task: "实现音频模块",
        sideEffect: "code",
        flowId: FLOW,
        moduleId: "audio-core",
      })) as DispatchReceipt;
      assert.equal(receipt.ok, false, "冻结语义不变：派发仍被拒绝");
      const receiptMessage = receipt.message ?? "";
      assert.match(receiptMessage, /run-change-required/);
      assert.match(receiptMessage, /谁来做：app/);
      assert.match(receiptMessage, /继续冻结|停止并重开|run-change/, "拒绝文案带出 run-change 三模式指引");

      const cards = runChangeCards(h.customerRequests);
      assert.equal(cards.length, 1, "应用真实呈现了一张 run-change 卡");
      const card = cards[0] as Extract<CustomerInputRequest, { kind: "choice" }>;
      assert.equal(card.kind, "choice");
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

      // 同一 run 的第二次冻结冲突：不再自动弹卡（只回结构化拒绝），不刷屏。
      // （stop-and-restart 后 active run 已是 draft，走 run-pin-required；stop 后无 run，走 run-missing。）
      if (mode === "continue-frozen") {
        const again = (await h.caps.convener!({
          roleId: "audio-dev",
          task: "实现音频模块",
          sideEffect: "code",
          flowId: FLOW,
          moduleId: "audio-core",
        })) as DispatchReceipt;
        assert.equal(again.ok, false);
        assert.match(again.message ?? "", /run-change-required/);
        assert.equal(runChangeCards(h.customerRequests).length, 1, "同一 run 只自动呈现一次");
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
    const rejected = (await h.caps.convener!({
      roleId: "audio-dev",
      task: "实现音频模块",
      sideEffect: "code",
      flowId: FLOW,
      moduleId: "audio-core",
    })) as DispatchReceipt;
    assert.equal(rejected.ok, false);
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

test("无会话兜底：没有可呈现的客户卡会话 ⇒ 仅回 run-change-required 三段式（不弹卡）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-no-session-"));
  const h = harness(root, { withCustomerInput: false });
  try {
    await setupPinnedRun(root, h);
    await writeProjectV2(root);
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    await tick(20);
    const receipt = (await h.caps.convener!({
      roleId: "audio-dev",
      task: "实现音频模块",
      sideEffect: "code",
      flowId: FLOW,
      moduleId: "audio-core",
    })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.equal(h.customerRequests.length, 0, "没有通道 ⇒ 不呈现任何卡");
    const message = receipt.message ?? "";
    assert.match(message, /run-change-required/);
    assert.match(message, /拒绝：缺少/);
    assert.match(message, /下一步：/);
    assert.match(message, /谁来做：app/);
    assert.match(message, /契约变更 · 重开 run/, "兜底指引包含显式入口");
    assert.match(message, /修正后可原样重试/);
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

test("宁可不弹：目标角色不在最新名单（非新版本契约冲突）⇒ 保留 run-role-missing 旧码，不呈现 run-change", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-change-no-fire-"));
  const h = harness(root, {
    answer: () => ({ outcome: "answered", value: { selected: ["stop"] }, decisionId: "decision-should-not-happen", operatorId: "customer" }),
  });
  try {
    await setupPinnedRun(root, h);
    await writeProjectV2(root);
    assert.equal((await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
    await tick(20);
    const receipt = (await h.caps.convener!({
      roleId: "ghost-dev",
      task: "实现幽灵模块",
      sideEffect: "code",
      flowId: FLOW,
      moduleId: "ghost-core",
    })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /run-role-missing/);
    assert.equal((receipt.message ?? "").includes("run-change-required"), false, "识别不出新版本依赖 ⇒ 不弹 run-change");
    assert.equal(h.customerRequests.length, 0, "没有误弹客户卡");
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

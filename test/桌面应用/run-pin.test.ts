// test/桌面应用/run-pin.test.ts
// 2026-10-30（方案 v3 §3.1；第一波 3.1）：桌面窗口侧 run 冻结——
// M1/M2/M3 draft runId、handoff 前同 runId pin、pin 前拒绝、pinned 文档/roster/D3/roles、
// assets 可选第七类、并发 pin、legacy 无 runId 兼容。
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
import { ensureDraftRun, findActiveRun, pinRun, prepareRunPin, readRunManifest } from "../../src/common/编排/run-manifest.ts";
import { recordVersionedDocBaselines } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ContractCheckFn, CustomerInputFn, CustomerInputMetadata, CustomerInputRequest, DispatchReceipt, DispatchTaskFn } from "../../src/model/runtime.ts";
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

function harness(root: string, options: { customerInput?: DesktopCustomerInputFn } = {}) {
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-"));
  const h = harness(root);
  try {
    await writeProject(root);
    await d3(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const dispatch = h.caps.chief!;
    const m1 = (await dispatch({ roleId: "product", task: "写产品意图", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
    assert.equal(m1.ok, true, m1.message ?? "");
    const state1 = await readTaskState(root);
    const m1Record = [...state1.records.values()].find((record) => record.created?.to === "product")!;
    assert.match(m1Record.created!.runId ?? "", /^run-/);
    assert.equal(m1Record.created!.runState, "draft");
    const runId = m1Record.created!.runId!;
    const draft = await readRunManifest(root, runId);
    assert.equal(draft.ok, true);
    if (draft.ok) assert.equal(draft.manifest.state, "draft");

    const m2 = (await dispatch({ roleId: "rapporteur", task: "出方案与名单", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
    assert.equal(m2.ok, true, m2.message ?? "");
    const m3 = (await dispatch({ roleId: "nominator", task: "按名单招人", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
    assert.equal(m3.ok, true, m3.message ?? "");
    const state2 = await readTaskState(root);
    assert.equal([...state2.records.values()].find((record) => record.created?.to === "rapporteur")!.created!.runId, runId);
    assert.equal([...state2.records.values()].find((record) => record.created?.to === "nominator")!.created!.runId, runId);

    const handoff = (await dispatch({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
    assert.equal(handoff.ok, true, handoff.message ?? "");
    const pinned = await readRunManifest(root, runId);
    assert.equal(pinned.ok, true);
    if (pinned.ok) {
      assert.equal(pinned.manifest.state, "pinned");
      assert.equal(pinned.manifest.runId, runId, "pin 不生成新 runId");
      assert.equal(pinned.manifest.d3?.decisionId, "decision-req-d3");
      assert.deepEqual(pinned.manifest.roles, ["implementer", "qa"]);
      assert.equal(pinned.manifest.execution.teamPlan, null);
      assert.equal(pinned.manifest.execution.flow, null);
      assert.equal(pinned.manifest.documents.assets, null);
      assert.equal(pinned.manifest.documents.roster?.sha256, pinned.manifest.documents.topology?.sha256);
    }
    const state3 = await readTaskState(root);
    const handoffRecord = [...state3.records.values()].find((record) => record.created?.to === "convener")!;
    assert.equal(handoffRecord.created!.runId, runId);
    assert.equal(handoffRecord.created!.runState, "pinned");
    assert.equal(handoffRecord.created!.stepId, "project-handoff");

    // mid-run：pin 后写出 roster/modules v2，active run 仍只读 pinned v1。
    const rosterV2 = ROSTER_TEXT.replace("version: 1", "version: 2").replaceAll("src/", "src-v2/");
    const parsedV2 = parseProjectRoster(rosterV2);
    assert.equal(parsedV2.ok, true);
    await fs.writeFile(path.join(root, "docs/proposals/focus-roster-v2.md"), rosterV2, "utf8");
    if (parsedV2.ok) {
      await fs.writeFile(
        path.join(root, "docs/proposals/focus-modules-v2.md"),
        ["---", "schema: project-modules/v2", "flowId: focus", "version: 2", `modules: ${JSON.stringify(parsedV2.roster.modules)}`, "---", "# 模块清单 v2"].join("\n"),
        "utf8",
      );
    }
    await recordVersionedDocBaselines({ projectRoot: root, recordedBy: "app:test" });

    await h.mgr.open({ projectRoot: root, roleId: "convener", runtime: "demo" });
    await tick(20);
    const worker = (await h.caps.convener!({ roleId: "implementer", task: "实现番茄钟", sideEffect: "code", flowId: "focus", moduleId: "impl-core" })) as DispatchReceipt;
    assert.equal(worker.ok, true, worker.message ?? "");
    const state4 = await readTaskState(root);
    const workerRecord = [...state4.records.values()].find((record) => record.created?.to === "implementer")!;
    assert.equal(workerRecord.created!.runId, runId);
    assert.equal(workerRecord.created!.runState, "pinned");
    assert.equal(workerRecord.created!.moduleDirectory, "src/");
    await h.mgr.open({ projectRoot: root, roleId: "implementer", runtime: "demo" });
    await tick(20);
    const pinnedCheck = await h.contractChecks.implementer!({ flowId: "focus", taskKind: "dispatch", moduleId: "impl-core" });
    assert.match(pinnedCheck!, new RegExp(`run：${runId}.*pinned`));
    assert.match(pinnedCheck!, /文档 roster：docs\/proposals\/focus-roster-v1\.md/);
    assert.match(pinnedCheck!, /指定模块：impl-core/);
    assert.match(pinnedCheck!, /taskKind dispatch 必填/);
  } finally {
    await h.mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 30 });
  }
});

test("D3 卡种收口（2026-10-31）：真实 D3 + 后续 decision 裁决后 pin，manifest.d3 为真实角色集", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-d3-cardkind-"));
  const h = harness(root);
  try {
    await writeProject(root);
    await d3(root); // legacy 兼容：无 cardKind，带 appointment 专属 roster 戳
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
    const handoff = (await h.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
    assert.equal(handoff.ok, true, handoff.message ?? "");
    const state = await readTaskState(root);
    const handoffRecord = [...state.records.values()].find((record) => record.created?.to === "convener")!;
    assert.equal(handoffRecord.created!.runState, "pinned");
    const manifest = await readRunManifest(root, handoffRecord.created!.runId!);
    assert.equal(manifest.ok, true);
    if (manifest.ok) {
      assert.equal(manifest.manifest.state, "pinned");
      assert.equal(manifest.manifest.d3?.decisionId, "decision-req-d3", "pin 用真实 appointment 裁决");
      assert.deepEqual(manifest.manifest.d3?.targetRoleIds, ["implementer"], "decision 选项（含同名 qa）不得顶替 D3");
    }
  } finally {
    await h.mgr.stop(null);
    // 2026-10-31（CI 稳定性，macOS arm64）：stop 不等待后台投递链落盘；先让出一拍再带重试删除。
    await tick(50);
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("run-pin：缺 D3 时 pin 失败，handoff 不建任务、不投递（draft 不伪造 pinned）", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-missing-"));
  const h = harness(root);
  try {
    await writeProject(root);
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const before = (await readTaskState(root)).records.size;
    const handoff = (await h.caps.chief!({ roleId: "convener", task: "把项目交付运营", sideEffect: "read-only", flowId: "focus" })) as DispatchReceipt;
    assert.equal(handoff.ok, false);
    assert.match(handoff.message ?? "", /run pin|D3/);
    const after = await readTaskState(root);
    assert.equal(after.records.size, before, "pin 失败在 task.created 之前，不产生交接任务");
    const active = await findActiveRun(root, "focus");
    assert.equal(active.ok, true);
    if (active.ok) assert.notEqual(active.manifest?.state, "pinned");
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-pin-pending-"));
  const h = harness(root);
  try {
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const m1 = (await h.caps.chief!({ roleId: "product", task: "先写产品意图（flow 未定）", sideEffect: "docs" })) as DispatchReceipt;
    assert.equal(m1.ok, true, m1.message ?? "");
    const state1 = await readTaskState(root);
    const m1Record = [...state1.records.values()].find((record) => record.created?.to === "product")!;
    const runId = m1Record.created!.runId!;
    assert.match(runId, /^run-/);
    const pending = await readRunManifest(root, runId);
    assert.equal(pending.ok, true);
    if (pending.ok) {
      assert.equal(pending.manifest.state, "draft");
      assert.equal(pending.manifest.flowId, "pending");
    }
    await writeProject(root);
    const m2 = (await h.caps.chief!({ roleId: "rapporteur", task: "出方案与名单", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
    assert.equal(m2.ok, true, m2.message ?? "");
    const state2 = await readTaskState(root);
    const m2Record = [...state2.records.values()].find((record) => record.created?.to === "rapporteur")!;
    assert.equal(m2Record.created!.runId, runId, "真实 flow 到达时领养同一 draft runId");
    const adopted = await readRunManifest(root, runId);
    assert.equal(adopted.ok, true);
    if (adopted.ok) assert.equal(adopted.manifest.flowId, "focus");
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

test("F2：版本化文档基线违规的真实派发回执带 versioned-doc-baseline-violation 三段式", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-run-baseline-reject-"));
  const h = harness(root);
  try {
    await writeProject(root);
    await fs.appendFile(path.join(root, "docs/product/focus-intent-v1.md"), "\n# 外部篡改\n", "utf8");
    await h.mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    const before = (await readTaskState(root)).records.size;
    const receipt = (await h.caps.chief!({ roleId: "product", task: "写产品意图", sideEffect: "docs", flowId: "focus" })) as DispatchReceipt;
    assert.equal(receipt.ok, false);
    assert.match(receipt.message ?? "", /版本化文档基线校验失败/);
    assert.match(receipt.message ?? "", /谁来做：app/);
    assert.match(receipt.message ?? "", /技术 code：versioned-doc-baseline-violation/);
    assert.equal((await readTaskState(root)).records.size, before, "基线拒绝不创建任务");
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

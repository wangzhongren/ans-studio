// test/桌面应用/acceptance-dispatch.test.ts
// 2026-10-19 客户反馈（原话）：「这个独立核准应该是标准流程，而不是我在发给他。」「内置角色应该有自己的工作流。」
//
// 真机现象：交付全部 done、测试 155/155、e2e 104/104 后，验收派发门没有自动打开；Steward 明确说不派发
// Proof；最后由客户手动给 Proof 发消息。根因（本文件逐条钉住）：
//   ① 验收检查只挂在项目角色回交 settle（治理步骤没有回交，永远等不到）；
//   ② 旧门要求每个执行步骤都有 dispatch.accepted，而 nomination/roles-ready/contract-freeze 这类步骤
//      由客户决定或产物完成、从不经应用派发，门永远打不开；
//   ③ 无持久化去重（重启后可能重复/丢失）。
//
// 本文件覆盖：步骤类型 → 证据映射（显式、可测试）；真实 library-lending 流程形状的回归；治理步骤无
// dispatch 也能过门；交付步骤缺 dispatch 仍不派；导入补齐/任意角色 settle/流程单变更触发；重复事件只派
// 一次；重启后账本去重；自动任务文本含质量基线/真实启动演示/架构核对。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import {
  acceptanceDispatchRecorded,
  flowCompletionIssue,
  flowStepEvidenceKind,
  flowStepHasEvidence,
  type FlowCompletionLedgerEntryLike,
} from "../../app/desktop/governance-advance.ts";
import {
  appendGovernanceLedger,
  readGovernanceLedger,
  type GovernanceLedgerEntry,
} from "../../src/pipeline/orchestration/govern-session.ts";
import type { SessionEventEnvelope } from "../../app/desktop/session.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { SessionEvent } from "../../src/provider/pi/session.ts";

// ————————————————— 夹具 —————————————————

function makeTempProjectRoot(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function trioListing(roleIds: string[] = ["rapporteur", "nominator", "convener", "verifier"]): ProjectListing {
  const role = (roleId: string) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: `# ${roleId}`,
    boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
    builtIn: true,
    ...(roleId === "rapporteur"
      ? { governanceFunction: "proposal" as const }
      : roleId === "nominator"
        ? { governanceFunction: "nomination" as const }
        : roleId === "verifier"
          ? { governanceFunction: "verification" as const }
          : { governanceFunction: "schedule" as const }),
  });
  return {
    projectRoot: "/proj",
    roles: roleIds.map(role),
    warnings: [],
    hasRoles: false,
    primaryRoleId: "rapporteur",
    governanceModel: "trio",
  };
}

function listingWithProjectRoles(base: ProjectListing, roleIds: string[]): ProjectListing {
  return {
    ...base,
    hasRoles: true,
    roles: [
      ...base.roles,
      ...roleIds.map((roleId) => ({
        roleId,
        cardPath: `角色卡/${roleId}/role-card.md`,
        boundaryPath: `角色卡/${roleId}/boundary.yaml`,
        cardText: `# ${roleId}`,
        boundary: {
          entries: [],
          boundarySource: `角色卡/${roleId}/boundary.yaml`,
          acceptance: { accepted: false, source: "" },
        },
      })),
    ],
  };
}

/** 流程单原文（canonical 三列 `stepId | 步骤 | 状态`；`extra` 放 front-matter 声明，如 contract 路径）。 */
function flowMarkdown(
  flowId: string,
  steps: ReadonlyArray<readonly [id: string, status: string]>,
  extra: readonly string[] = [],
): string {
  return [
    "---",
    `flowId: ${flowId}`,
    ...extra,
    "---",
    "",
    "# 流程单",
    "",
    "| stepId | 步骤 | 状态 |",
    "| --- | --- | --- |",
    ...steps.map(([id, status]) => `| ${id} | 步骤 ${id} | ${status} |`),
  ].join("\n");
}

function writeFlowFile(projectRoot: string, flowId: string, markdown: string): void {
  mkdirSync(path.join(projectRoot, "docs", "flows"), { recursive: true });
  writeFileSync(path.join(projectRoot, "docs", "flows", `${flowId}.md`), markdown);
}

async function appendLedger(
  projectRoot: string,
  entries: ReadonlyArray<Omit<GovernanceLedgerEntry, "at">>,
): Promise<void> {
  for (const entry of entries) {
    const appended = await appendGovernanceLedger(projectRoot, { at: new Date().toISOString(), ...entry });
    assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
  }
}

/** 可推任意事件（含 settled）的会话句柄（与既有 interface 测试同思路）。 */
function scriptedHandle(sends: string[]): {
  handle: RoleSessionHandle;
  emit: (event: SessionEvent) => void;
  settle: () => void;
} {
  const queue: SessionEvent[] = [];
  const handle: RoleSessionHandle = {
    async send(text: string): Promise<void> {
      sends.push(text);
    },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              for (let i = 0; i < 400; i += 1) {
                const event = queue.shift();
                if (event !== undefined) return { value: event, done: false };
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
  return {
    handle,
    emit: (event) => {
      queue.push(event);
    },
    settle: () => {
      queue.push({ kind: "settled", summary: "一轮结束（测试替身）" } as SessionEvent);
    },
  };
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("等待测试条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Harness {
  iface: ReturnType<typeof createDesktopInterface>;
  sendsByRole: Map<string, string[]>;
  events: SessionEventEnvelope[];
  controls: Map<string, ReturnType<typeof scriptedHandle>>;
}

async function makeHarness(projectRoot: string, listing: ProjectListing): Promise<Harness> {
  const sendsByRole = new Map<string, string[]>();
  const events: SessionEventEnvelope[] = [];
  const controls = new Map<string, ReturnType<typeof scriptedHandle>>();
  const iface = createDesktopInterface({
    pickDirectory: async () => projectRoot,
    emitEvent: (envelope) => {
      events.push(envelope);
    },
    listProjectFn: async () => listing,
    openRoleSessionFn: async (input) => {
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      const made = scriptedHandle(sends);
      controls.set(input.roleId, made);
      return made.handle;
    },
    buildProjectConfigFn: buildProjectConfig,
    // 2026-10-19：自动派发改走统一引擎解析器。本文件聚焦证据门/去重语义，注入固定解析结果（pi），
    // 不依赖开发机真实 `.env`；解析器自身的优先级另见 `runtime-resolution.test.ts`。
    resolveRuntimeFn: async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] }),
  });
  await iface.listProject({ projectRoot });
  return { iface, sendsByRole, events, controls };
}

function deliveryNotes(events: SessionEventEnvelope[], roleId: string): string[] {
  return events
    .filter(
      (envelope) =>
        envelope.roleId === roleId &&
        envelope.event.kind === "message" &&
        (envelope.event as { detail?: { source?: string } }).detail?.source === "delivery-note",
    )
    .map((envelope) => String((envelope.event as { summary?: string }).summary));
}

async function verifierDispatches(projectRoot: string, flowId: string): Promise<GovernanceLedgerEntry[]> {
  const ledger = await readGovernanceLedger(projectRoot);
  return ledger.entries.filter(
    (entry) =>
      entry.kind === "dispatch.accepted" &&
      entry.flowId === flowId &&
      entry.targetRoleId === "verifier" &&
      entry.stepId === "verification",
  );
}

// ————————————————— ① 证据模型（纯逻辑） —————————————————

test("验收证据模型：步骤类型映射表显式可测（产物 / 客户决定 / 派发默认）", () => {
  for (const id of ["contract-freeze", "contract-freeze-v2", "proposal-v1", "flow-write", "schedule-update"]) {
    assert.equal(flowStepEvidenceKind(id), "artifact", `${id} 应为产物型`);
  }
  for (const id of ["nomination", "nominations-v1", "role-readiness", "roles-ready", "role-ready"]) {
    assert.equal(flowStepEvidenceKind(id), "decision", `${id} 应为客户决定型`);
  }
  for (const id of [
    "delivery-server",
    "delivery-tests",
    "integration-e2e",
    "integration-e2e-rerun",
    "r2-e2e",
    "cleanup-selfcheck",
    "rework-static-server",
    "verify-suite-green-and-evidence",
    "impl",
    "verify",
    "unknown-step",
  ]) {
    assert.equal(flowStepEvidenceKind(id), "dispatch", `${id} 应为派发型（默认也 fail-closed）`);
  }
});

// 真实 library-lending 流程形状（2026-10-19 缺陷现场）：13 个执行步骤全部 done；nomination /
// contract-freeze / roles-ready 没有 dispatch.accepted（治理步骤不经应用派发），其余 10 步有。
const LIBRARY_FLOW_ID = "library-lending";
const LIBRARY_CONTRACT = "docs/contracts/library-lending-api-v1.md";
const LIBRARY_FLOW = flowMarkdown(
  LIBRARY_FLOW_ID,
  [
    ["nomination", "done"],
    ["contract-freeze", "done"],
    ["roles-ready", "done"],
    ["delivery-server", "done"],
    ["delivery-tests", "done（首轮 154/154）"],
    ["delivery-frontend", "done"],
    ["integration-e2e", "done 但证据作废"],
    ["rework-static-server", "done"],
    ["rework-static-frontend", "done"],
    ["rework-static-tests", "done"],
    ["rework-public-verify-cleanup", "done"],
    ["verify-suite-green-and-evidence", "done（155/155 ×2）"],
    ["integration-e2e-rerun", "done（104/104 PASS）"],
    ["verification", "pending（材料已齐备）"],
    ["acceptance", "pending"],
  ],
  [`contract: ${LIBRARY_CONTRACT}`],
);

const LIBRARY_DISPATCHED_STEPS = [
  "delivery-server",
  "delivery-tests",
  "delivery-frontend",
  "integration-e2e",
  "rework-static-server",
  "rework-static-frontend",
  "rework-static-tests",
  "rework-public-verify-cleanup",
  "verify-suite-green-and-evidence",
  "integration-e2e-rerun",
];

function libraryLedger(): { errors: string[]; entries: FlowCompletionLedgerEntryLike[] } {
  return {
    errors: [],
    entries: [
      {
        kind: "customer.decision",
        flowId: LIBRARY_FLOW_ID,
        stepId: "nomination",
        decisionKind: "appointment",
        customerDecision: "appointed",
      },
      // 契约产物由 Draft/提案 观测；真实账本中该条不带 flowId——靠流程单显式声明的路径匹配。
      { kind: "artifact.observed", artifactPath: LIBRARY_CONTRACT },
      ...LIBRARY_DISPATCHED_STEPS.map((stepId) => ({
        kind: "dispatch.accepted",
        flowId: LIBRARY_FLOW_ID,
        stepId,
      })),
    ],
  };
}

test("真机回归（library-lending）：治理步骤无 dispatch.accepted，但任命决定 + 契约产物证据 ⇒ 门通过", () => {
  assert.equal(
    flowCompletionIssue(LIBRARY_FLOW_ID, LIBRARY_FLOW, libraryLedger()),
    undefined,
    "nomination/roles-ready 靠 appointment 决定、contract-freeze 靠 artifact.observed ⇒ 可自动派 Proof",
  );
  // 逐条证明这是**证据**在起作用，而不是 done 文本。
  assert.equal(
    flowStepHasEvidence("nomination", LIBRARY_FLOW_ID, LIBRARY_FLOW, libraryLedger().entries),
    true,
  );
  assert.equal(
    flowStepHasEvidence("roles-ready", LIBRARY_FLOW_ID, LIBRARY_FLOW, libraryLedger().entries),
    true,
  );
  assert.equal(
    flowStepHasEvidence("contract-freeze", LIBRARY_FLOW_ID, LIBRARY_FLOW, libraryLedger().entries),
    true,
  );
});

test("证据模型 fail-closed：缺客户决定/产物/派发证据各自拦下；全部 done 但账本为空也不放行", () => {
  const withoutDecision = libraryLedger();
  withoutDecision.entries = withoutDecision.entries.filter((entry) => entry.decisionKind !== "appointment");
  assert.match(
    flowCompletionIssue(LIBRARY_FLOW_ID, LIBRARY_FLOW, withoutDecision) ?? "",
    /缺少客户决定证据（nomination、roles-ready）/,
    "人事步骤没有客户决定证据：不派",
  );

  const withoutArtifact = libraryLedger();
  withoutArtifact.entries = withoutArtifact.entries.filter((entry) => entry.kind !== "artifact.observed");
  assert.match(
    flowCompletionIssue(LIBRARY_FLOW_ID, LIBRARY_FLOW, withoutArtifact) ?? "",
    /缺少产物证据（contract-freeze）/,
    "产物步骤没有 artifact.observed：不派",
  );

  const withoutDelivery = libraryLedger();
  withoutDelivery.entries = withoutDelivery.entries.filter(
    (entry) => !(entry.kind === "dispatch.accepted" && entry.stepId === "delivery-server"),
  );
  assert.match(
    flowCompletionIssue(LIBRARY_FLOW_ID, LIBRARY_FLOW, withoutDelivery) ?? "",
    /缺少 dispatch\.accepted 记录（delivery-server）/,
    "交付步骤没有 dispatch.accepted：仍不派",
  );

  assert.notEqual(
    flowCompletionIssue(LIBRARY_FLOW_ID, LIBRARY_FLOW, { errors: [], entries: [] }),
    undefined,
    "不得放宽到只看 done 文本：账本为空一律不放行",
  );
});

test("验收派发持久化去重：账本已有 targetRoleId=verifier / stepId=verification 记录 ⇒ 已派发", () => {
  const ledger = {
    errors: [],
    entries: [
      {
        kind: "dispatch.accepted",
        flowId: LIBRARY_FLOW_ID,
        stepId: "verification",
        targetRoleId: "verifier",
        actorRoleId: "app",
      },
    ],
  };
  assert.equal(acceptanceDispatchRecorded(LIBRARY_FLOW_ID, ledger), true);
  assert.equal(acceptanceDispatchRecorded("other-flow", ledger), false);
  assert.equal(acceptanceDispatchRecorded(LIBRARY_FLOW_ID, { entries: [] }), false);
});

// ————————————————— ② 端到端：自动派 Proof —————————————————

function acceptanceSteps(): Array<[string, string]> {
  return [
    ["nomination", "done"],
    ["contract-freeze", "done"],
    ["roles-ready", "done"],
    ["delivery-server", "done"],
    ["verification", "pending"],
    ["acceptance", "pending"],
  ];
}

async function seedGovernanceEvidence(projectRoot: string, flowId: string, dispatchedSteps: string[]): Promise<void> {
  await appendLedger(projectRoot, [
    {
      kind: "customer.decision",
      flowId,
      stepId: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["executor"],
    },
    { kind: "artifact.observed", artifactPath: `docs/contracts/${flowId}-api-v1.md`, actorRoleId: "rapporteur", power: "proposal" },
    ...dispatchedSteps.map((stepId) => ({
      kind: "dispatch.accepted" as const,
      flowId,
      stepId,
      actorRoleId: "convener",
      power: "schedule" as const,
      targetRoleId: "executor",
    })),
  ]);
}

test("自动验收（导入补齐）：门通过 ⇒ 自动派 Proof 一条复核任务 + 写账本；重启/重复事件不重派", async () => {
  const root = makeTempProjectRoot("ans-acceptance-import-");
  try {
    const flowId = "flow-auto";
    writeFlowFile(root, flowId, flowMarkdown(flowId, acceptanceSteps(), [`contract: docs/contracts/${flowId}-api-v1.md`]));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      const sends = harness.sendsByRole.get("verifier")!;
      assert.equal(sends.length, 1, "导入补齐检查 ⇒ 恰一条验收复核任务");
      assert.match(sends[0]!, new RegExp(`流程 ${flowId} 步骤已全部完成`));
      assert.match(sends[0]!, /docs\/flows\/flow-auto\.md/);
      assert.match(sends[0]!, /请汇总证据并出验收卡/);
      assert.match(sends[0]!, /不要自行验收或代替客户决定/);
      // 客户批准的硬要求（质量基线 / 真实启动演示 / 架构核对）必须随自动任务发出。
      for (const item of ["正确性", "健壮性", "安全", "可维护性", "可观测性", "性能", "前端可访问性", "测试矩阵"]) {
        assert.ok(sends[0]!.includes(item), `自动任务须含质量基线「${item}」`);
      }
      assert.match(sends[0]!, /必须真实启动应用并向客户演示/);
      assert.match(sends[0]!, /启动命令/);
      assert.match(sends[0]!, /访问地址/);
      assert.match(sends[0]!, /截图或录屏/);
      assert.match(sends[0]!, /架构方案或架构影响分析/);
      assert.match(sends[0]!, /模块边界/);
      assert.match(sends[0]!, /依赖方向/);
      assert.match(sends[0]!, /扩展点/);
      assert.match(sends[0]!, new RegExp(`docs/verification/${flowId}-v1\\.md`));

      // 可见性：Convener 系统行说明「自动派发」，不冒充客户批准。
      const notes = deliveryNotes(harness.events, "convener");
      assert.ok(notes.some((note) => /已自动派发验收复核给 Proof（工作中）/.test(note)), "Convener 系统行如实告知自动派发");
      assert.ok(notes.every((note) => !/客户已批准|验收通过/.test(note)), "不得冒充客户批准");

      // 持久化审计与去重：dispatch.accepted(targetRoleId=verifier, stepId=verification, actor=app)。
      const recorded = await verifierDispatches(root, flowId);
      assert.equal(recorded.length, 1, "账本恰一条验收派发记录");
      assert.equal(recorded[0]!.actorRoleId, "app");
      assert.equal(recorded[0]!.power, "app", "应用自动派发 ≠ 客户批准（power=app）");

      await sleep(200);
      assert.equal(sends.length, 1, "补检查不重复派");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("自动验收（任意角色 settle + 流程单变更）：交付步骤补齐后由 settle 触发；重复 settle 只派一次", async () => {
  const root = makeTempProjectRoot("ans-acceptance-settle-");
  try {
    const flowId = "flow-settle";
    const contractLine = `contract: docs/contracts/${flowId}-api-v1.md`;
    // 导入时仍有执行步骤 pending：补齐检查不派。
    writeFlowFile(root, flowId, flowMarkdown(flowId, acceptanceSteps().map(([id, status]) => [id, id === "delivery-server" ? "pending" : status]), [contractLine]));
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await sleep(120); // 让导入补齐检查跑过一次（应被 pending 拦下）
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "导入时流程未完成：不派");

      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      // Convener 写流程单并派发最后一个交付步骤（账本追加 dispatch.accepted）→ 流程单更新为 done。
      await appendLedger(root, [
        { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
      ]);
      writeFlowFile(root, flowId, flowMarkdown(flowId, acceptanceSteps(), [contractLine]));
      const control = harness.controls.get("executor")!;
      control.settle();
      control.settle();
      control.settle();
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      await sleep(200);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "任意角色 settle 触发且重复 settle 不重派");
      assert.equal((await verifierDispatches(root, flowId)).length, 1, "账本恰一条去重记录");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("自动验收 fail-closed：交付步骤缺 dispatch.accepted ⇒ 即使流程单全 done + settle 也不派", async () => {
  const root = makeTempProjectRoot("ans-acceptance-missing-");
  try {
    const flowId = "flow-missing";
    writeFlowFile(root, flowId, flowMarkdown(flowId, acceptanceSteps(), [`contract: docs/contracts/${flowId}-api-v1.md`]));
    // 治理证据齐备、但 delivery-server 没有 dispatch.accepted。
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      harness.controls.get("executor")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "交付步骤缺派发记录：不派 Proof");
      assert.equal((await verifierDispatches(root, flowId)).length, 0, "不写验收派发记录");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("自动验收（重启去重）：账本已有上一次的 verifier 派发记录 ⇒ 新进程补齐检查与 settle 都不重复派", async () => {
  const root = makeTempProjectRoot("ans-acceptance-restart-");
  try {
    const flowId = "flow-restart";
    writeFlowFile(root, flowId, flowMarkdown(flowId, acceptanceSteps(), [`contract: docs/contracts/${flowId}-api-v1.md`]));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    // 上一次进程成功派发后留下的持久化记录。
    await appendLedger(root, [
      {
        kind: "dispatch.accepted",
        flowId,
        stepId: "verification",
        actorRoleId: "app",
        power: "verification",
        targetRoleId: "verifier",
        messageSummary: "上一次进程的自动验收派发",
      },
    ]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing); // 新 Interface = 应用重启
    try {
      await sleep(150); // 导入补齐检查
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "重启后补齐检查按账本去重");
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      harness.controls.get("executor")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "settle 触发也不重复派");
      assert.equal((await verifierDispatches(root, flowId)).length, 1, "账本仍只有上一次那一条记录");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

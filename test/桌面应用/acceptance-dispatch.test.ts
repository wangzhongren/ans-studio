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
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { createDesktopInterface, type DesktopDeps } from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { RUNTIME_UNRESOLVED_MESSAGE } from "../../app/desktop/runtime-resolution.ts";
import {
  acceptanceDispatchRecorded,
  acceptanceLastDispatchAtMs,
  flowCompletionIssue,
  flowStepEvidenceKind,
  flowStepHasEvidence,
  governanceAcceptanceBlockedNote,
  governanceFlowStatePath,
  type FlowCompletionLedgerEntryLike,
} from "../../app/desktop/governance-advance.ts";
import { evaluateFlowCompletion, flowStatePath, parseFlowStateYaml } from "../../src/pipeline/orchestration/flow-state.ts";
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
    // 2026-10-19 客户决定：自动验收门反馈统一发给 Lead（主入口）；真实 trio 的 primaryRoleId=liaison。
    primaryRoleId: "liaison",
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

/** 异步条件版（如等待账本 append 落盘——投递与审计是两段 I/O，断言需要有界等待而非改动语义）。 */
async function waitForAsync(check: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
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

async function makeHarness(
  projectRoot: string,
  listing: ProjectListing,
  options: {
    resolveRuntime?: DesktopDeps["resolveRuntimeFn"];
    completeAcceptanceStep?: DesktopDeps["completeAcceptanceStepFn"];
    customerInput?: DesktopDeps["customerInput"];
    observeFlowArtifacts?: DesktopDeps["observeFlowArtifactsFn"];
    /** 2026-10-23 验收返工路由：重开验收步骤（缺省真实 Pipeline 出口）、审计账本追加、会话打开失败注入。 */
    reopenAcceptanceStep?: DesktopDeps["reopenAcceptanceStepForReworkFn"];
    appendGovernanceLedger?: DesktopDeps["appendGovernanceLedgerFn"];
    failOpenRoles?: Set<string>;
  } = {},
): Promise<Harness> {
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
      if (options.failOpenRoles?.has(input.roleId) === true) {
        throw new Error(`模拟打开 ${input.roleId} 会话失败`);
      }
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      const made = scriptedHandle(sends);
      controls.set(input.roleId, made);
      return made.handle;
    },
    buildProjectConfigFn: buildProjectConfig,
    // 2026-10-19：自动派发改走统一引擎解析器。本文件聚焦证据门/去重语义，注入固定解析结果（pi），
    // 不依赖开发机真实 `.env`；解析器自身的优先级另见 `runtime-resolution.test.ts`。
    resolveRuntimeFn:
      options.resolveRuntime ?? (async () => ({ ok: true, runtime: "pi", source: "credentials", skipped: [] })),
    // 2026-10-20：验收通过后的流程收口（编排 completeAcceptanceStep 的桌面注入面；测试用桩验证消费语义）。
    ...(options.completeAcceptanceStep !== undefined ? { completeAcceptanceStepFn: options.completeAcceptanceStep } : {}),
    // 2026-10-20：delivered 唤醒/收口全程不得弹客户卡——测试可注入记录器。
    ...(options.customerInput !== undefined ? { customerInput: options.customerInput } : {}),
    // 2026-10-20：flow artifact 证据补登（编排 observeFlowArtifacts 的桌面注入面）。
    ...(options.observeFlowArtifacts !== undefined ? { observeFlowArtifactsFn: options.observeFlowArtifacts } : {}),
    // 2026-10-23 验收返工路由：重开验收步骤 / 审计失败 / 会话打开失败注入（只影响被测路径）。
    ...(options.reopenAcceptanceStep !== undefined ? { reopenAcceptanceStepForReworkFn: options.reopenAcceptanceStep } : {}),
    ...(options.appendGovernanceLedger !== undefined ? { appendGovernanceLedgerFn: options.appendGovernanceLedger } : {}),
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

/** 收尾门阻塞的可见性系统行（2026-10-19 客户反馈：原因不能只进诊断日志）。 */
function blockerNotes(events: SessionEventEnvelope[], roleId: string): string[] {
  return deliveryNotes(events, roleId).filter((note) => note.includes("自动验收未派发"));
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
  // 2026-10-22 第 1 项（方案 §5.6）：团队计划是产物型。
  for (const id of ["team-plan", "team-plan-v1"]) {
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

test("验收派发持久化去重：旧布尔口径保留；2026-10-20 新口径返回最近一次 verifier 派发时刻（ms）", () => {
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
  assert.equal(acceptanceDispatchRecorded(LIBRARY_FLOW_ID, ledger), true, "旧记录（无 at）：布尔口径仍视为已派");
  assert.equal(acceptanceDispatchRecorded("other-flow", ledger), false);
  assert.equal(acceptanceDispatchRecorded(LIBRARY_FLOW_ID, { entries: [] }), false);
  assert.equal(acceptanceLastDispatchAtMs(LIBRARY_FLOW_ID, ledger), undefined, "无 at/不可解析 ⇒ 时间口径 unavailable（调用方走旧行为）");

  const timed = {
    errors: [],
    entries: [
      { kind: "dispatch.accepted", flowId: LIBRARY_FLOW_ID, stepId: "verification", targetRoleId: "verifier", actorRoleId: "app", at: "2026-10-20T04:06:53.000Z" },
      { kind: "dispatch.accepted", flowId: LIBRARY_FLOW_ID, stepId: "verification", targetRoleId: "verifier", actorRoleId: "app", at: "2026-10-20T12:11:58.000Z" },
      { kind: "dispatch.accepted", flowId: LIBRARY_FLOW_ID, stepId: "impl", targetRoleId: "executor", actorRoleId: "convener", at: "2026-10-20T13:00:00.000Z" },
      { kind: "dispatch.accepted", flowId: "other-flow", stepId: "verification", targetRoleId: "verifier", actorRoleId: "app", at: "2026-10-20T14:00:00.000Z" },
    ],
  };
  assert.equal(
    acceptanceLastDispatchAtMs(LIBRARY_FLOW_ID, timed),
    Date.parse("2026-10-20T12:11:58.000Z"),
    "取该 flow 最近一次 verifier 派发时刻（其它步骤/其它 flow 不参与）",
  );
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
      assert.match(sends[0]!, /docs\/flows\/flow-auto\.yaml/);
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
      // 2026-10-22 第 3 项：报告进 docs/acceptance/，详细证据附件留在 docs/verification/。
      assert.match(sends[0]!, new RegExp(`docs/acceptance/${flowId}-report-v1\\.md`));
      assert.match(sends[0]!, /docs\/verification\//);
      assert.match(sends[0]!, /首行五项/);

      // 可见性：Lead（主入口）系统行说明「自动派发」，不冒充客户批准；客户决定不再发 Convener。
      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => /已自动派发验收复核给 Proof（工作中）/.test(note)), "Lead 系统行如实告知自动派发");
      assert.equal(deliveryNotes(harness.events, "convener").length, 0, "自动验收反馈不再发 Convener");
      assert.ok(notes.every((note) => !/客户已批准|验收通过/.test(note)), "不得冒充客户批准");

      // 持久化审计与去重：dispatch.accepted(targetRoleId=verifier, stepId=verification, actor=app)。
      // 投递与账本 append 是两段异步 I/O：有界等待落盘后再断言（语义不变）。
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length > 0);
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

// ————————————————— ③ 收尾门阻塞的可见性（2026-10-19 客户反馈「这个难道不是bug吗」） —————————————————
//
// 客户现场：R2 所有 retake 已 done，但自动验收派发一直不触发；`flowCompletionIssue` 的具体原因
// （旧步骤 aborted/failed 未标 superseded）只写进诊断日志，Steward/客户看不到，只能由操作者手动复算
// 再转告。门本身 fail-closed 正确；**静默**是缺陷。本组钉住：阻塞原因 + 可操作建议作为系统行对
// **Lead（主入口 primaryRoleId）**如实可见（2026-10-19 客户决定：统一发 Lead，不再发 Convener）；
// 同一原因只发一次、原因变化/解决后再次阻塞才再发；门通过时不发；派发成功路径不变；不自动改流程单、
// 不自动派 Proof。

test("自动验收阻塞可见性：门未通过 ⇒ Lead 恰一条系统行（具体原因 + 建议）；重复 settle 不刷屏；原因变化再发；门通过不再发", async () => {
  const root = makeTempProjectRoot("ans-acceptance-blocked-visible-");
  try {
    const flowId = "flow-blocked";
    const contractLine = `contract: docs/contracts/${flowId}-api-v1.md`;
    const withDeliveryStatus = (status: string): string =>
      flowMarkdown(flowId, acceptanceSteps().map(([id, stepStatus]) => [id, id === "delivery-server" ? status : stepStatus]), [contractLine]);
    writeFlowFile(root, flowId, withDeliveryStatus("pending"));
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      // 导入补齐检查即被 pending 挡下：Lead 应看到具体原因，而不是只有诊断日志。
      await waitFor(() => blockerNotes(harness.events, "liaison").length > 0);
      assert.equal(blockerNotes(harness.events, "liaison").length, 1, "门 blocked ⇒ Lead 恰一条阻塞系统行");
      const first = blockerNotes(harness.events, "liaison")[0]!;
      assert.ok(first.includes("delivery-server=pending"), "系统行含 flowCompletionIssue 的具体原因");
      assert.match(first, /aborted\/failed/, "建议覆盖真机场景：被 retake 取代的 aborted/failed 步骤");
      assert.match(first, /superseded/, "建议给出 superseded 的出路");
      assert.match(first, /stepId/, "建议给出用新 stepId 重派的出路");
      assert.ok(first.includes(`docs/flows/${flowId}.md`), "给 Lead 可操作的流程单路径");
      assert.ok(!/已自动派发验收复核/.test(first), "阻塞行不得冒充已派发");
      assert.equal(blockerNotes(harness.events, "convener").length, 0, "客户决定：不再发 Convener");
      assert.equal(blockerNotes(harness.events, "rapporteur").length, 0, "不散落给其他角色");

      // 重复 settle（同一原因）：不重复发（不刷屏），也不派 Proof。
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      const control = harness.controls.get("executor")!;
      control.settle();
      control.settle();
      control.settle();
      await sleep(250);
      assert.equal(blockerNotes(harness.events, "liaison").length, 1, "同一 flow + 同一原因只发一次");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "门未通过：不派 Proof");

      // 原因变化（pending → aborted）：再发一条，仍到 Lead。
      writeFlowFile(root, flowId, withDeliveryStatus("aborted"));
      control.settle();
      await waitFor(() => blockerNotes(harness.events, "liaison").length >= 2);
      await sleep(150);
      const changed = blockerNotes(harness.events, "liaison");
      assert.equal(changed.length, 2, "原因变化才再发（不是每 settle 刷屏）");
      assert.ok(changed[1]!.includes("delivery-server=aborted"), "新系统行如实带新原因");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "仍不派 Proof");

      // 门通过：修正流程单 + 补派发证据 ⇒ 自动派发路径不变，且不再发阻塞行。
      writeFlowFile(root, flowId, withDeliveryStatus("done"));
      await appendLedger(root, [
        { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
      ]);
      control.settle();
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      await sleep(150);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "门通过后仍按原路径恰派一条验收任务");
      assert.equal(blockerNotes(harness.events, "liaison").length, 2, "门通过：不发新的阻塞行");
      assert.ok(
        deliveryNotes(harness.events, "liaison").some((note) => /已自动派发验收复核给 Proof/.test(note)),
        "成功路径的既有系统行（发给 Lead）不变",
      );
      assert.equal(deliveryNotes(harness.events, "convener").length, 0, "成功行也不发 Convener");
      assert.equal((await verifierDispatches(root, flowId)).length, 1, "派发审计记录不变");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("自动验收阻塞可见性：已解决（门通过）后再次阻塞同一原因 ⇒ 重新告知一次", async () => {
  const root = makeTempProjectRoot("ans-acceptance-reblocked-");
  try {
    const flowId = "flow-reblocked";
    const contractLine = `contract: docs/contracts/${flowId}-api-v1.md`;
    const withDeliveryStatus = (status: string): string =>
      flowMarkdown(flowId, acceptanceSteps().map(([id, stepStatus]) => [id, id === "delivery-server" ? status : stepStatus]), [contractLine]);
    writeFlowFile(root, flowId, withDeliveryStatus("pending"));
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    // 引擎无法确定 ⇒ 门通过也不会真正派发、运行期占位释放——用来观察「解决后再次阻塞」的去重清除。
    const harness = await makeHarness(root, listing, {
      resolveRuntime: async () => ({ ok: false, message: RUNTIME_UNRESOLVED_MESSAGE, skipped: [] }),
    });
    try {
      await waitFor(() => blockerNotes(harness.events, "liaison").length === 1);
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      const control = harness.controls.get("executor")!;

      // 第一次放行：流程修正 + 补证据 ⇒ 收尾门通过（引擎解析失败只落既有失败行，不派发）。
      writeFlowFile(root, flowId, withDeliveryStatus("done"));
      await appendLedger(root, [
        { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
      ]);
      control.settle();
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes(RUNTIME_UNRESOLVED_MESSAGE)));
      assert.equal(blockerNotes(harness.events, "liaison").length, 1, "门通过本身不发阻塞行");

      // 再次阻塞（原因文本与第一次相同）：门通过时已清去重记忆 ⇒ 重新告知。
      writeFlowFile(root, flowId, withDeliveryStatus("pending"));
      control.settle();
      await waitFor(() => blockerNotes(harness.events, "liaison").length >= 2);
      await sleep(150);
      const notes = blockerNotes(harness.events, "liaison");
      assert.equal(notes.length, 2, "解决后再次阻塞（同一原因）重新告知一次");
      assert.ok(notes[1]!.includes("delivery-server=pending"), "重新告知带当前原因");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "引擎无法确定/门未通过：始终不派 Proof");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("自动验收反馈统一落 Lead：listing 有 Convener 也不发 Convener（客户 2026-10-19 决定）", async () => {
  const root = makeTempProjectRoot("ans-acceptance-lead-only-");
  try {
    const flowId = "flow-lead-only";
    writeFlowFile(
      root,
      flowId,
      flowMarkdown(flowId, acceptanceSteps().map(([id, status]) => [id, id === "delivery-server" ? "pending" : status]), [
        `contract: docs/contracts/${flowId}-api-v1.md`,
      ]),
    );
    await seedGovernanceEvidence(root, flowId, []);
    // trio 完整内置角色（含 schedule 职能的 Convener）——阻塞行仍只发 Lead（primaryRoleId=liaison）。
    const listing: ProjectListing = { ...trioListing(), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => blockerNotes(harness.events, "liaison").length === 1);
      assert.ok(blockerNotes(harness.events, "liaison")[0]!.includes("delivery-server=pending"), "Lead 收到具体原因");
      assert.equal(blockerNotes(harness.events, "convener").length, 0, "不再发 Convener");
      assert.equal(blockerNotes(harness.events, "rapporteur").length, 0, "不落在触发事件的角色流");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ————————————————— ④ 流程机器状态 YAML（2026-10-19 客户决定「这些全部改成yaml。」） —————————————————
//
// 机器状态实现由编排拥有（`src/pipeline/orchestration/flow-state.ts` 薄再导出
// `src/common/编排/flow-state.ts`）；桌面只经 Pipeline 公共出口消费。契约要点：
//   · YAML 必填 `flowId`/`version`/`qualityTier`；步骤必填 `id`/`title`/`owner`/`kind`/`status`；
//   · `kind`：dispatch | customer-decision | artifact | acceptance（证据类型由显式 kind 决定）；
//   · `done` 必须有 evidence `{kind, ref}`；`superseded` 不参与完成判定；
//   · 验收步骤（保留 id verification/acceptance）必须 kind=acceptance 且初始 pending。
// 本组钉住桌面接线：YAML 存在 ⇒ 只按 YAML 判定（不解析 Markdown 表）；校验失败/证据不足 ⇒ 不派 +
// Lead 系统行含具体错误（去重）；YAML 不存在 ⇒ legacy Markdown 回退行为不变。

interface FlowYamlEvidenceInput {
  kind: string;
  ref: string;
}

interface FlowYamlStepInput {
  id: string;
  kind: string;
  status: string;
  title?: string;
  owner?: string;
  evidence?: FlowYamlEvidenceInput;
  supersedes?: readonly string[];
  supersededBy?: string;
}

/** 构造块状 YAML（机器状态；手写而非 JSON，覆盖真实文件形状）。 */
function flowStateYaml(flowId: string, steps: readonly FlowYamlStepInput[]): string {
  const lines = [`flowId: ${flowId}`, "version: 1", "qualityTier: production", "steps:"];
  for (const step of steps) {
    lines.push(`  - id: ${step.id}`);
    lines.push(`    title: ${step.title ?? `步骤 ${step.id}`}`);
    lines.push(`    owner: ${step.owner ?? "executor"}`);
    lines.push(`    kind: ${step.kind}`);
    lines.push(`    status: ${step.status}`);
    if (step.evidence !== undefined) {
      lines.push("    evidence:");
      lines.push(`      kind: ${step.evidence.kind}`);
      lines.push(`      ref: ${step.evidence.ref}`);
    }
    if (step.supersedes !== undefined && step.supersedes.length > 0) {
      lines.push(`    supersedes: [${step.supersedes.join(", ")}]`);
    }
    if (step.supersededBy !== undefined) lines.push(`    supersededBy: ${step.supersededBy}`);
  }
  return `${lines.join("\n")}\n`;
}

function writeFlowStateFile(projectRoot: string, flowId: string, yaml: string): void {
  mkdirSync(path.join(projectRoot, "docs", "flows"), { recursive: true });
  writeFileSync(path.join(projectRoot, "docs", "flows", `${flowId}.yaml`), yaml);
}

/** 与 `seedGovernanceEvidence` 一致的 YAML 步骤（nomination / contract-freeze / delivery / verification）。 */
function yamlAcceptanceSteps(flowId: string): FlowYamlStepInput[] {
  return [
    {
      id: "nomination",
      kind: "customer-decision",
      status: "done",
      evidence: { kind: "customer-decision", ref: "appointment" },
    },
    {
      id: "contract-freeze",
      kind: "artifact",
      status: "done",
      evidence: { kind: "artifact", ref: `docs/contracts/${flowId}-api-v1.md` },
    },
    { id: "delivery-server", kind: "dispatch", status: "done", evidence: { kind: "dispatch", ref: "delivery-server" } },
    { id: "verification", kind: "acceptance", status: "pending" },
  ];
}

function yamlLedgerEntries(flowId: string, options: { includeDelivery?: boolean } = {}): GovernanceLedgerEntry[] {
  const base = { at: "2026-10-19T00:00:00.000Z", actorRoleId: "test", power: "app" as const };
  return [
    {
      ...base,
      kind: "customer.decision",
      flowId,
      stepId: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
    },
    { ...base, kind: "artifact.observed", artifactPath: `docs/contracts/${flowId}-api-v1.md` },
    ...(options.includeDelivery === false
      ? []
      : [{ ...base, kind: "dispatch.accepted" as const, flowId, stepId: "delivery-server" }]),
  ];
}

function parseErrorText(result: ReturnType<typeof parseFlowStateYaml>): string {
  return result.ok ? "" : result.errors.map((error) => `${error.path}: ${error.message}`).join("；");
}

test("流程状态路径单一来源：桌面 governanceFlowStatePath 与编排 flowStatePath 一致", () => {
  for (const flowId of ["todo-list-v1", "flow-yaml-unit"]) {
    assert.equal(governanceFlowStatePath(flowId), flowStatePath(flowId), "路径字面量不得两处漂移");
    assert.equal(governanceFlowStatePath(flowId), `docs/flows/${flowId}.yaml`);
  }
});

test("流程状态 YAML：合法机器状态解析 + 显式 kind 证据对账 ⇒ ready", () => {
  const flowId = "flow-yaml-unit";
  const parsed = parseFlowStateYaml(flowStateYaml(flowId, yamlAcceptanceSteps(flowId)), flowId);
  assert.equal(parsed.ok, true, parseErrorText(parsed));
  if (!parsed.ok) return;
  assert.deepEqual(
    parsed.flow.steps.map((step) => [step.id, step.kind, step.status]),
    [
      ["nomination", "customer-decision", "done"],
      ["contract-freeze", "artifact", "done"],
      ["delivery-server", "dispatch", "done"],
      ["verification", "acceptance", "pending"],
    ],
  );
  assert.deepEqual(evaluateFlowCompletion(parsed.flow, yamlLedgerEntries(flowId)), { ready: true });
});

test("流程状态 YAML 校验 fail-closed：保留 id 误用 / status 非法 / 缺 evidence / supersedes 引用不存在", () => {
  const flowId = "flow-yaml-bad";
  const reserved = parseFlowStateYaml(
    flowStateYaml(flowId, [{ id: "verification", kind: "dispatch", status: "pending" }]),
    flowId,
  );
  assert.equal(reserved.ok, false);
  assert.match(parseErrorText(reserved), /保留 id/, "verification 不得当执行步骤");

  const badStatus = parseFlowStateYaml(
    flowStateYaml(flowId, [
      {
        id: "delivery",
        kind: "dispatch",
        status: "done（有证据）",
        evidence: { kind: "dispatch", ref: "delivery" },
      },
    ]),
    flowId,
  );
  assert.equal(badStatus.ok, false);
  assert.match(parseErrorText(badStatus), /status 必须是/, "YAML 是机器状态，不收人读写法的状态");

  const missingEvidence = parseFlowStateYaml(
    flowStateYaml(flowId, [{ id: "delivery", kind: "dispatch", status: "done" }]),
    flowId,
  );
  assert.equal(missingEvidence.ok, false);
  assert.match(parseErrorText(missingEvidence), /必须提供 evidence/);

  const badSupersedes = parseFlowStateYaml(
    flowStateYaml(flowId, [
      { id: "delivery", kind: "dispatch", status: "pending", supersedes: ["ghost"] },
      { id: "verification", kind: "acceptance", status: "pending" },
    ]),
    flowId,
  );
  assert.equal(badSupersedes.ok, false);
  assert.match(parseErrorText(badSupersedes), /supersedes 指向不存在的步骤 "ghost"/);
});

test("流程状态 YAML：证据不足列出具体账本缺口；superseded 旧步骤不阻塞（未标则 fail-closed）", () => {
  const flowId = "flow-yaml-eval";
  const parsed = parseFlowStateYaml(flowStateYaml(flowId, yamlAcceptanceSteps(flowId)), flowId);
  assert.equal(parsed.ok, true, parseErrorText(parsed));
  if (!parsed.ok) return;
  const missing = evaluateFlowCompletion(parsed.flow, yamlLedgerEntries(flowId, { includeDelivery: false }));
  assert.equal(missing.ready, false);
  if (missing.ready) return;
  const text = missing.issues.join("；");
  assert.match(text, /账本缺少 dispatch\.accepted/, "按显式 kind 对账后报缺证据");
  assert.match(text, /delivery-server/, "具体到步骤");

  const base = { at: "2026-10-19T00:00:00.000Z", actorRoleId: "test", power: "app" as const };
  const newDispatch: GovernanceLedgerEntry = {
    ...base,
    kind: "dispatch.accepted",
    flowId,
    stepId: "delivery-new",
  };

  // 旧步骤 failed（未标 superseded）⇒ fail-closed。
  const failedOld = parseFlowStateYaml(
    flowStateYaml(flowId, [
      { id: "delivery-old", kind: "dispatch", status: "failed" },
      { id: "delivery-new", kind: "dispatch", status: "done", evidence: { kind: "dispatch", ref: "delivery-new" } },
      { id: "verification", kind: "acceptance", status: "pending" },
    ]),
    flowId,
  );
  assert.equal(failedOld.ok, true, parseErrorText(failedOld));
  if (!failedOld.ok) return;
  const blocked = evaluateFlowCompletion(failedOld.flow, [newDispatch]);
  assert.equal(blocked.ready, false);
  if (!blocked.ready) assert.match(blocked.issues.join("；"), /delivery-old 状态为 failed/);

  // 旧步骤 status=superseded 且新步骤显式 supersedes ⇒ 不阻塞、不算 done。
  const supersededOld = parseFlowStateYaml(
    flowStateYaml(flowId, [
      { id: "delivery-old", kind: "dispatch", status: "superseded" },
      {
        id: "delivery-new",
        kind: "dispatch",
        status: "done",
        evidence: { kind: "dispatch", ref: "delivery-new" },
        supersedes: ["delivery-old"],
      },
      { id: "verification", kind: "acceptance", status: "pending" },
    ]),
    flowId,
  );
  assert.equal(supersededOld.ok, true, parseErrorText(supersededOld));
  if (!supersededOld.ok) return;
  assert.deepEqual(evaluateFlowCompletion(supersededOld.flow, [newDispatch]), { ready: true });

  // 验收步骤 done ⇒ 终态文案；阻塞系统行应给「无需操作」而非改流程单建议。
  const acceptanceDone = parseFlowStateYaml(
    flowStateYaml(flowId, [
      ...yamlAcceptanceSteps(flowId).map((step) =>
        step.id === "verification"
          ? { ...step, status: "done", evidence: { kind: "acceptance", ref: "acceptance" } }
          : step,
      ),
    ]),
    flowId,
  );
  assert.equal(acceptanceDone.ok, true, parseErrorText(acceptanceDone));
  if (!acceptanceDone.ok) return;
  const acceptanceLedger = [
    ...yamlLedgerEntries(flowId),
    { ...base, kind: "customer.decision" as const, flowId, decisionKind: "acceptance" as const, customerDecision: "accepted" as const },
  ];
  const terminal = evaluateFlowCompletion(acceptanceDone.flow, acceptanceLedger);
  assert.equal(terminal.ready, false);
  if (!terminal.ready) {
    const terminalText = terminal.issues.join("；");
    assert.match(terminalText, /验收步骤已完成/);
    assert.match(governanceAcceptanceBlockedNote(flowId, terminalText), /无需操作/);
  }
});

test("自动验收 YAML：机器状态齐备 ⇒ 自动派 Proof；Markdown 人读视图写 pending 也不参与判定", async () => {
  const root = makeTempProjectRoot("ans-acceptance-yaml-auto-");
  try {
    const flowId = "flow-yaml-auto";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    // 人读视图故意全写 pending：若门还在解析 Markdown 表，本测试会失败。
    writeFlowFile(
      root,
      flowId,
      flowMarkdown(flowId, acceptanceSteps().map(([id]): [string, string] => [id, "pending"])),
    );
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      await waitFor(() =>
        deliveryNotes(harness.events, "liaison").some((note) => /已自动派发验收复核给 Proof（工作中）/.test(note)),
      );
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "YAML 齐备 ⇒ 恰一条验收复核任务");
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length > 0);
      assert.equal((await verifierDispatches(root, flowId)).length, 1, "账本派发记录不变");
      assert.equal(blockerNotes(harness.events, "liaison").length, 0, "门通过不发阻塞行");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("自动验收 YAML 校验失败（保留 id 误用）⇒ 不派 + Lead 系统行含具体错误；重复 settle 不刷屏；Markdown 合法也不回退", async () => {
  const root = makeTempProjectRoot("ans-acceptance-yaml-invalid-");
  try {
    const flowId = "flow-yaml-invalid";
    // YAML 只有机器状态文件（无 Markdown）：同时钉住流程发现包含 *.yaml。
    writeFlowStateFile(
      root,
      flowId,
      flowStateYaml(
        flowId,
        yamlAcceptanceSteps(flowId).map((step) =>
          step.id === "verification"
            ? { ...step, kind: "dispatch", evidence: { kind: "dispatch", ref: "verification" } }
            : step,
        ),
      ),
    );
    // 即便存在一份「能过 legacy 门」的 Markdown，也不得回退。
    writeFlowFile(root, flowId, flowMarkdown(flowId, acceptanceSteps(), [`contract: docs/contracts/${flowId}-api-v1.md`]));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => blockerNotes(harness.events, "liaison").length > 0);
      const first = blockerNotes(harness.events, "liaison")[0]!;
      assert.match(first, /流程状态 YAML 校验失败/, "系统行如实给出 YAML 校验错误");
      assert.match(first, /保留 id/, "系统行含具体错误（reserved id 误用）");
      assert.ok(first.includes(`docs/flows/${flowId}.yaml`), "建议路径指向要修的 YAML");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "YAML 校验失败：不派 Proof");

      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      const control = harness.controls.get("executor")!;
      control.settle();
      control.settle();
      control.settle();
      await sleep(250);
      assert.equal(blockerNotes(harness.events, "liaison").length, 1, "同一 flow + 同一原因只发一次");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "重复事件也不派");
      assert.equal((await verifierDispatches(root, flowId)).length, 0, "不写验收派发记录");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("自动验收 YAML 证据不足 ⇒ 不派 + 系统行列出具体账本缺口；Markdown 全 done 也不能救", async () => {
  const root = makeTempProjectRoot("ans-acceptance-yaml-missing-");
  try {
    const flowId = "flow-yaml-missing";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    // 人读视图全 done（若错误回退 legacy，障碍文案是「缺少 dispatch.accepted 记录」而非账本缺口细节）。
    writeFlowFile(root, flowId, flowMarkdown(flowId, acceptanceSteps()));
    // 治理证据齐备、但 delivery-server 没有 dispatch.accepted。
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => blockerNotes(harness.events, "liaison").length > 0);
      const first = blockerNotes(harness.events, "liaison")[0]!;
      assert.match(first, /账本缺少 dispatch\.accepted/, "按显式 kind 对账后报缺证据");
      assert.match(first, /delivery-server/, "具体到步骤");
      assert.ok(!/缺少 dispatch\.accepted 记录/.test(first), "不是 legacy Markdown 门文案");
      assert.ok(first.includes(`docs/flows/${flowId}.yaml`), "建议路径指向 YAML");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "证据不足：不派 Proof");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("无 YAML ⇒ legacy Markdown 回退行为不变：阻塞行仍指 .md，不出现 YAML 诊断", async () => {
  const root = makeTempProjectRoot("ans-acceptance-legacy-fallback-");
  try {
    const flowId = "flow-legacy-fallback";
    writeFlowFile(
      root,
      flowId,
      flowMarkdown(
        flowId,
        acceptanceSteps().map(([id, status]): [string, string] => [id, id === "delivery-server" ? "pending" : status]),
        [`contract: docs/contracts/${flowId}-api-v1.md`],
      ),
    );
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => blockerNotes(harness.events, "liaison").length > 0);
      const first = blockerNotes(harness.events, "liaison")[0]!;
      assert.ok(first.includes("delivery-server=pending"), "legacy 门仍按 Markdown 表判定");
      assert.ok(first.includes(`docs/flows/${flowId}.md`), "建议路径仍指 Markdown");
      assert.ok(!first.includes(".yaml"), "无 YAML 时不应出现 YAML 路径/诊断");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "legacy 门未过：不派");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— 2026-10-20 真机：flow 在验收派发后更新 ⇒ 必须能重派（旧去重永久 true 导致结果没回 Lead） ——————

/** 在既有 YAML 上改一处内容并把 mtime 显式设为给定时刻（保证与首次派发不同的版本）。 */
function touchFlowStateVersion(projectRoot: string, flowId: string, at: Date): void {
  writeFlowStateFile(projectRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId).map((step) =>
    step.id === "delivery-server" ? { ...step, title: `交付（v2 @ ${at.toISOString()}）` } : step,
  )));
  utimesSync(path.join(projectRoot, "docs", "flows", `${flowId}.yaml`), at, at);
}

test("2026-10-20 验收重派：flow YAML 派发后更新 ⇒ 重派 verifier 恰一次（文案注明更新、新账本时间晚于 flow）；未更新不重派", async () => {
  const root = makeTempProjectRoot("ans-acceptance-flow-version-");
  try {
    const flowId = "flow-version";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "首次导入 ⇒ 派一次");
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length === 1);

      // flow 未更新：verifier settle 触发检查 ⇒ 同版本去重，不重派。
      harness.controls.get("verifier")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "flow 未更新 ⇒ 不重派");

      // flow 在派发后更新（mtime 晚于首次 verifier 派发）⇒ 允许重派恰一次。
      await sleep(40);
      const updatedAt = new Date();
      touchFlowStateVersion(root, flowId, updatedAt);
      harness.controls.get("verifier")!.settle();
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 1);
      const sends = harness.sendsByRole.get("verifier")!;
      assert.equal(sends.length, 2, "flow 更新后重派恰一次");
      assert.match(sends[1]!, /流程在上次验收复核后有更新，请复核最新版本/, "重派任务注明流程已更新");
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length === 2);
      const dispatches = await verifierDispatches(root, flowId);
      const lastAt = Date.parse(dispatches[1]!.at);
      const flowMtime = statSync(path.join(root, "docs", "flows", `${flowId}.yaml`)).mtimeMs;
      assert.ok(lastAt >= flowMtime, `新 dispatch.accepted 时间(${lastAt}) 必须晚于 flow mtime(${flowMtime})`);
      // 更新后的同版本：再 settle 不再重派（新账本时间保证后续去重成立）。
      harness.controls.get("verifier")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 2, "同版本不再重派（新记录时间 >= flow mtime）");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 验收重派（重启）：新 Interface + 旧 verifier 记录 + flow 已更新 ⇒ 重派；flow 未更新 ⇒ 不重派", async () => {
  const updatedRoot = makeTempProjectRoot("ans-acceptance-restart-updated-");
  const sameRoot = makeTempProjectRoot("ans-acceptance-restart-same-");
  try {
    const flowId = "flow-restart";
    // ① flow 在重启前被更新 ⇒ 新 Interface 的补齐检查应重派一次。
    writeFlowStateFile(updatedRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(updatedRoot, flowId, ["delivery-server"]);
    const updatedListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: updatedRoot };
    const h1 = await makeHarness(updatedRoot, updatedListing);
    await waitFor(() => (h1.sendsByRole.get("verifier")?.length ?? 0) > 0);
    await waitForAsync(async () => (await verifierDispatches(updatedRoot, flowId)).length === 1);
    await h1.iface.stopSession();
    await sleep(40);
    touchFlowStateVersion(updatedRoot, flowId, new Date()); // 重启前 flow 已更新
    const h2 = await makeHarness(updatedRoot, updatedListing); // 新 Interface（新进程）
    try {
      await waitFor(() => (h2.sendsByRole.get("verifier")?.length ?? 0) > 0);
      assert.equal(h2.sendsByRole.get("verifier")!.length, 1, "重启后 flow 更新 ⇒ 重派恰一次");
      assert.match(h2.sendsByRole.get("verifier")![0]!, /流程在上次验收复核后有更新/);
      await waitForAsync(async () => (await verifierDispatches(updatedRoot, flowId)).length === 2);
      await h2.iface.listProject({ projectRoot: updatedRoot });
      await sleep(300);
      assert.equal(h2.sendsByRole.get("verifier")!.length, 1, "同一新版本不再重复派");
    } finally {
      await h2.iface.stopSession();
    }

    // ② flow 未更新 ⇒ 重启后旧 verifier 记录仍然去重（不重派）。
    writeFlowStateFile(sameRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(sameRoot, flowId, ["delivery-server"]);
    const sameListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: sameRoot };
    const s1 = await makeHarness(sameRoot, sameListing);
    await waitFor(() => (s1.sendsByRole.get("verifier")?.length ?? 0) > 0);
    await waitForAsync(async () => (await verifierDispatches(sameRoot, flowId)).length === 1);
    await s1.iface.stopSession();
    const s2 = await makeHarness(sameRoot, sameListing);
    try {
      await sleep(400);
      assert.equal(s2.sendsByRole.get("verifier")?.length ?? 0, 0, "重启后 flow 未更新 ⇒ 不重派");
      assert.equal((await verifierDispatches(sameRoot, flowId)).length, 1, "账本仍恰一条");
    } finally {
      await s2.iface.stopSession();
    }
  } finally {
    rmSync(updatedRoot, { recursive: true, force: true });
    rmSync(sameRoot, { recursive: true, force: true });
  }
});

test("2026-10-20 verifier settle ⇒ Lead 系统行含报告路径（同 flow+报告版本去重；不伪造结论；不重派 verifier）", async () => {
  const root = makeTempProjectRoot("ans-acceptance-verifier-note-");
  try {
    const flowId = "flow-proof-note";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      // 2026-10-22 第 3 项：验收报告在 docs/acceptance/<flow>-report-v1.md（附件仍在 docs/verification/）。
      const reportRel = `docs/acceptance/${flowId}-report-v1.md`;
      const reportAbs = path.join(root, reportRel);
      mkdirSync(path.dirname(reportAbs), { recursive: true });
      writeFileSync(reportAbs, "# 验收复核\n\n结论：未给出（示例报告）。\n", "utf8");
      const proofNotes = () =>
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("Proof / 验收复核已结束"));
      harness.controls.get("verifier")!.settle();
      await waitFor(() => proofNotes().length > 0);
      assert.equal(proofNotes().length, 1, "verifier settle ⇒ Lead 恰一条复核结束系统行");
      assert.ok(proofNotes()[0]!.includes(reportRel), "含报告路径 docs/acceptance/<flow>-report-v1.md");
      assert.ok(proofNotes()[0]!.includes("docs/verification/"), "附件提示指向 docs/verification/");
      assert.ok(proofNotes()[0]!.includes(`docs/governance/verifier/${flowId}.md`), "含治理工作记录路径");
      assert.ok(!/通过|不通过|已批准|客户同意/.test(proofNotes()[0]!), "不伪造结论、不把报告当客户批准");
      // 同 flow+报告版本：再 settle 不刷屏。
      harness.controls.get("verifier")!.settle();
      await sleep(300);
      assert.equal(proofNotes().length, 1, "同报告版本不重复提示");
      // 报告版本更新（mtime 变化）⇒ 可再提示一次；flow 未更新 ⇒ verifier 不重派。
      await sleep(30);
      writeFileSync(reportAbs, "# 验收复核\n\n结论：未给出（示例报告 v2）。\n", "utf8");
      utimesSync(reportAbs, new Date(), new Date());
      harness.controls.get("verifier")!.settle();
      await waitFor(() => proofNotes().length > 1);
      assert.equal(proofNotes().length, 2, "报告新版本可再提示一次");
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "flow 未更新 ⇒ 不重派 verifier");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— 2026-10-20 真机：验收卡代批 accept 后 flow 仍 pending，且又多派了一次 verifier ——————
//
// 消费编排的 `completeAcceptanceStep`（桌面经 Pipeline 公共出口/注入）：accepted ⇒ 收口（标 done）并
// 直接 return，不再派 verifier；已 done ⇒ 幂等；rejected/无决定 ⇒ 不收口、不误派；失败只诊断/一条系统行。

function acceptedAcceptanceSteps(flowId: string): FlowYamlStepInput[] {
  return yamlAcceptanceSteps(flowId).map((step) =>
    step.id === "verification"
      ? { ...step, status: "done", evidence: { kind: "acceptance", ref: "acceptance" } }
      : step,
  );
}

const acceptanceDecisionEntry = (flowId: string, decision: "accepted" | "rejected"): Omit<GovernanceLedgerEntry, "at"> => ({
  kind: "customer.decision",
  flowId,
  actorRoleId: "liaison",
  power: "app",
  decisionKind: "acceptance",
  customerDecision: decision,
});

// —————————————— 2026-10-23 验收返工路由（方案 v1；Q1/Q4/Q7/Q8/Q9/Q10/Q11 A） ——————————————

/** 含合法 `acceptance-rework/v1` 结构化段的验收报告。 */
function acceptanceReworkReportMarkdown(items: ReadonlyArray<{ id: string; owner: string; action: string; evidence?: string }>): string {
  return [
    "# 验收报告",
    "",
    "结论：不通过。",
    "",
    "```yaml",
    "schema: acceptance-rework/v1",
    "coordinator: convener",
    "items:",
    ...items.flatMap((item) => [
      `  - id: ${item.id}`,
      `    owner: ${item.owner}`,
      `    action: ${item.action}`,
      ...(item.evidence !== undefined ? [`    evidence: ${item.evidence}`] : []),
    ]),
    "```",
    "",
  ].join("\n");
}

function writeAcceptanceReportFile(projectRoot: string, flowId: string, version: number, text: string): string {
  const dir = path.join(projectRoot, "docs", "acceptance");
  mkdirSync(dir, { recursive: true });
  const rel = `docs/acceptance/${flowId}-report-v${version}.md`;
  writeFileSync(path.join(projectRoot, ...rel.split("/")), text, "utf8");
  return rel;
}

function reworkRoutingRecordPath(projectRoot: string, flowId: string): string {
  return path.join(projectRoot, ".ans", "governance", "acceptance", flowId, "rework-routing.json");
}

function readReworkRoutingRecord(projectRoot: string, flowId: string): Record<string, unknown> | undefined {
  const file = reworkRoutingRecordPath(projectRoot, flowId);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/** 追加一条指定 `at` 的 acceptance 决定（时间线由测试控制：rejection 之前/之后的 flow 进展）。 */
async function appendAcceptanceDecisionAt(
  projectRoot: string,
  flowId: string,
  decision: "accepted" | "rejected",
  at: string,
): Promise<void> {
  const appended = await appendGovernanceLedger(projectRoot, {
    at,
    kind: "customer.decision",
    flowId,
    actorRoleId: "liaison",
    power: "app",
    decisionKind: "acceptance",
    customerDecision: decision,
    decisionEvidence: { kind: "customer-input" },
  });
  assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
}

/** 让 flow YAML 的 mtime 落到给定时间（同时可改内容，避免「同内容」抑制）。 */
function setFlowStateVersion(projectRoot: string, flowId: string, at: Date, marker: string): void {
  writeFlowStateFile(
    projectRoot,
    flowId,
    flowStateYaml(
      flowId,
      yamlAcceptanceSteps(flowId).map((step) =>
        step.id === "delivery-server" ? { ...step, title: `交付（${marker}）` } : step,
      ),
    ),
  );
  utimesSync(path.join(projectRoot, "docs", "flows", `${flowId}.yaml`), at, at);
}

function reworkNotes(events: SessionEventEnvelope[], roleId: string): string[] {
  return deliveryNotes(events, roleId).filter((note) =>
    /返工|acceptance-rework|自动决策|客户拒绝/.test(note),
  );
}

test("2026-10-23 验收返工路由（客户拒绝）：最新 rejected ⇒ 路由 Convener（报告+结构化清单/客户拒绝系统行）、零 Proof 返工、不伪造客户决定；重复触发不重复路由", async () => {
  const root = makeTempProjectRoot("ans-rework-customer-route-");
  try {
    const flowId = "flow-rework-customer";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const decisionAt = new Date().toISOString();
    await appendAcceptanceDecisionAt(root, flowId, "rejected", decisionAt);
    const reportRel = writeAcceptanceReportFile(
      root,
      flowId,
      1,
      acceptanceReworkReportMarkdown([
        { id: "F1", owner: "executor", action: "修复交付并补证据", evidence: "docs/verification/f1.log" },
      ]),
    );
    const ledgerBefore = await readGovernanceLedger(root);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const completeCalls: string[] = [];
    const harness = await makeHarness(root, listing, {
      completeAcceptanceStep: async ({ flowId: id }) => { completeCalls.push(id); return { ok: true }; },
    });
    try {
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0);
      await sleep(250);
      const convenerSends = harness.sendsByRole.get("convener")!;
      assert.equal(convenerSends.length, 1, "最新 rejected ⇒ 恰一条 Convener 返工任务");
      const task = convenerSends[0]!;
      assert.match(task, /验收未通过，应用把返工交 Steward \/ 统筹（Convener）组织/);
      assert.match(task, /来源：客户拒绝（客户手拒）/);
      assert.match(task, new RegExp(reportRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(task, /id=F1 \| owner=executor \| action=修复交付并补证据 \| evidence=docs\/verification\/f1\.log/);
      assert.match(task, /flow_step_supersede/);
      assert.match(task, /不要.*supersede 保留验收步骤/);
      assert.match(task, /返工完成后由应用自动重派 Proof/);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "Proof 不接收返工派发");
      assert.equal(completeCalls.length, 0, "rejected ⇒ 不收口");
      // routed 系统行在 record sent 写之后发出：先等它，再断言任务/记录（避免发送可见早于系统行的竞态）。
      await waitFor(() => reworkNotes(harness.events, "liaison").some((note) => note.includes("客户拒绝")));
      const notes = reworkNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes("客户拒绝") && note.includes("Convener")), "Lead 系统行写客户拒绝与接收方");
      assert.ok(notes.every((note) => !/已自动派发验收复核/.test(note)), "未重派 Proof");
      // routing record：schema/来源/报告哈希/status。
      const record = readReworkRoutingRecord(root, flowId);
      assert.equal(record?.schema, "acceptance-rework-routing/v1");
      assert.equal(record?.source, "customer");
      assert.equal(record?.sourceDetail, "customer-input");
      assert.equal(record?.status, "sent");
      assert.equal(record?.reportPath, reportRel);
      assert.match(String(record?.reportSha256), /^[0-9a-f]{64}$/);
      assert.equal(record?.itemCount, 1);
      assert.equal(record?.structured, true);
      // 不伪造客户决定：账本只多一条既有 dispatch.accepted(app→convener) 审计（无 stepId）。
      const ledgerAfter = await readGovernanceLedger(root);
      assert.equal(
        ledgerAfter.entries.filter((entry) => entry.kind === "customer.decision").length,
        ledgerBefore.entries.filter((entry) => entry.kind === "customer.decision").length,
        "桌面不写客户决定账本",
      );
      const audit = ledgerAfter.entries.filter(
        (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.targetRoleId === "convener",
      );
      assert.equal(audit.length, 1, "账本恰一条 app→convener 审计");
      assert.equal(audit[0]!.actorRoleId, "app");
      assert.equal(audit[0]!.power, "app");
      assert.equal(audit[0]!.stepId, undefined, "审计不带 stepId（不污染验收派发时间口径）");
      // 重复触发（settle/import）⇒ 不重复任务/系统行。
      await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" });
      harness.controls.get("executor")!.settle();
      await harness.iface.listProject({ projectRoot: root });
      await sleep(300);
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "同一决定/同一报告不重复路由");
      assert.equal(reworkNotes(harness.events, "liaison").filter((note) => note.includes("客户拒绝")).length, 1, "不重复系统行");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "仍不派 verifier");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 验收返工路由（重派门）：rejection 后 flow 实质更新 + 执行全 done + verification pending ⇒ 恰好重派一次 Proof（vN+1）；同内容不再重派", async () => {
  const root = makeTempProjectRoot("ans-rework-redispatch-");
  try {
    const flowId = "flow-rework-redispatch";
    const decisionAt = new Date(Date.now() - 60_000).toISOString();
    await appendAcceptanceDecisionAt(root, flowId, "rejected", decisionAt);
    // rejection 之后 flow 更新（mtime 晚于决定；内容与首次不同）。
    setFlowStateVersion(root, flowId, new Date(), "rework-v2");
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const reportRel = writeAcceptanceReportFile(
      root,
      flowId,
      1,
      acceptanceReworkReportMarkdown([{ id: "F1", owner: "executor", action: "修复", evidence: "docs/verification/f1.log" }]),
    );
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0);
      const verifierSends = harness.sendsByRole.get("verifier")!;
      assert.equal(verifierSends.length, 1, "恰好重派一次 Proof");
      const task = verifierSends[0]!;
      assert.match(task, /流程在上次验收复核后有更新/);
      assert.match(task, new RegExp(`docs/acceptance/${flowId}-report-v2\\.md`), "重派要求写 vN+1");
      assert.ok(task.includes(reportRel), "重派任务引用被拒报告路径（不覆盖）");
      assert.match(task, /acceptance-rework\/v1/, "验收任务含结构化返工段硬要求");
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "路由任务恰一条");
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length === 1);
      await sleep(300); // record 的 lastDispatched* 写在账本之后；单次读取避免 Windows rename/read 竞争
      const recorded = readReworkRoutingRecord(root, flowId);
      assert.match(String(recorded?.lastDispatchedFlowSha256), /^[0-9a-f]{64}$/, "record 记录已派 flow 内容");
      assert.equal(typeof recorded?.lastDispatchedAt, "string");
      // 再触发：同 flow 内容 + 账本新派发 ⇒ 不重派。
      harness.controls.get("verifier")!.settle();
      await harness.iface.listProject({ projectRoot: root });
      await sleep(350);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "同内容不再重派");
      assert.equal((await verifierDispatches(root, flowId)).length, 1, "账本仍恰一条 verification 派发");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 验收返工路由（重派门）：rejection 后无 flow 进展 ⇒ 不重派（等待返工去重系统行）；accepted 仍收口、不路由", async () => {
  const noProgressRoot = makeTempProjectRoot("ans-rework-no-progress-");
  const acceptedRoot = makeTempProjectRoot("ans-rework-accepted-");
  try {
    const flowId = "flow-rework-no-progress";
    // flow 先写，rejection 决定在之后（mtime <= decisionAt）⇒ 无进展。
    writeFlowStateFile(noProgressRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(noProgressRoot, flowId, ["delivery-server"]);
    await appendAcceptanceDecisionAt(noProgressRoot, flowId, "rejected", new Date().toISOString());
    writeAcceptanceReportFile(
      noProgressRoot,
      flowId,
      1,
      acceptanceReworkReportMarkdown([{ id: "F1", owner: "executor", action: "修复" }]),
    );
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: noProgressRoot };
    const harness = await makeHarness(noProgressRoot, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0);
      await waitFor(() =>
        deliveryNotes(harness.events, "liaison").some((note) => note.includes("返工路由尚未完成") || note.includes("暂不派发验收复核")),
      );
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "无 flow 进展：不派 Proof");
      assert.equal((await verifierDispatches(noProgressRoot, flowId)).length, 0);
      assert.ok(
        deliveryNotes(harness.events, "liaison").some((note) => note.includes("返工路由尚未完成") || note.includes("暂不派发验收复核")),
        "Lead 一条「等待返工」去重系统行",
      );
    } finally {
      await harness.iface.stopSession();
    }

    // accepted（即使更早有 rejected）：最新 accepted ⇒ 收口、不路由、不派。
    const closeFlowId = "flow-rework-accepted";
    writeFlowStateFile(acceptedRoot, closeFlowId, flowStateYaml(closeFlowId, yamlAcceptanceSteps(closeFlowId)));
    await seedGovernanceEvidence(acceptedRoot, closeFlowId, ["delivery-server"]);
    await appendAcceptanceDecisionAt(acceptedRoot, closeFlowId, "rejected", new Date(Date.now() - 60_000).toISOString());
    await appendAcceptanceDecisionAt(acceptedRoot, closeFlowId, "accepted", new Date().toISOString());
    const acceptedListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: acceptedRoot };
    const completeCalls: string[] = [];
    const acceptedHarness = await makeHarness(acceptedRoot, acceptedListing, {
      completeAcceptanceStep: async ({ flowId: id }) => { completeCalls.push(id); return { ok: true }; },
    });
    try {
      await waitFor(() => completeCalls.length > 0);
      await sleep(200);
      assert.deepEqual(completeCalls, [closeFlowId], "最新 accepted ⇒ 收口");
      assert.equal(acceptedHarness.sendsByRole.get("convener")?.length ?? 0, 0, "accepted ⇒ 不路由");
      assert.equal(acceptedHarness.sendsByRole.get("verifier")?.length ?? 0, 0, "accepted ⇒ 不派");
      assert.equal(readReworkRoutingRecord(acceptedRoot, closeFlowId), undefined, "accepted 不写 routing record");
    } finally {
      await acceptedHarness.iface.stopSession();
    }
  } finally {
    rmSync(noProgressRoot, { recursive: true, force: true });
    rmSync(acceptedRoot, { recursive: true, force: true });
  }
});

test("2026-10-20 验收收口：accepted + verification pending ⇒ 调 completeAcceptanceStep、步骤 done、不派 verifier、Lead 恰一条；已 done ⇒ 幂等", async () => {
  const root = makeTempProjectRoot("ans-acceptance-close-");
  try {
    const flowId = "flow-close";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    await appendLedger(root, [acceptanceDecisionEntry(flowId, "accepted")]);
    const beforeLedger = await readGovernanceLedger(root);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const completeCalls: string[] = [];
    const harness = await makeHarness(root, listing, {
      completeAcceptanceStep: async ({ projectRoot, flowId: id }) => {
        completeCalls.push(id);
        // 模拟编排语义：把保留验收步骤标 done + acceptance 证据（幂等、原子写）。
        writeFlowStateFile(projectRoot, id, flowStateYaml(id, acceptedAcceptanceSteps(id)));
        return { ok: true };
      },
    });
    try {
      const closeNotes = () => deliveryNotes(harness.events, "liaison").filter((note) => note.includes("验收已通过（判断代批或客户手批"));
      await waitFor(() => completeCalls.length > 0);
      assert.equal(completeCalls.length, 1, "accepted ⇒ 恰调一次 completeAcceptanceStep");
      assert.equal(completeCalls[0], flowId);
      const parsed = parseFlowStateYaml(
        readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"),
        flowId,
      );
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        const verification = parsed.flow.steps.find((step) => step.kind === "acceptance");
        assert.equal(verification?.status, "done", "收口后验收步骤 done");
        assert.deepEqual(verification?.evidence, { kind: "acceptance", ref: "acceptance" }, "done 带 acceptance 证据");
      }
      await waitFor(() => closeNotes().length > 0);
      assert.equal(closeNotes().length, 1, "Lead 恰一条「验收已通过…已收口」系统行");
      assert.ok(closeNotes()[0]!.includes(flowId), "系统行含 flowId");
      assert.ok(!/客户已批准|判断已批准/.test(closeNotes()[0]!), "不伪造客户批准（以账本为准）");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "验收已 accepted ⇒ 不再派 verifier");
      const afterLedger = await readGovernanceLedger(root);
      assert.equal(
        afterLedger.entries.filter((entry) => entry.kind === "customer.decision").length,
        beforeLedger.entries.filter((entry) => entry.kind === "customer.decision").length,
        "桌面不写客户决定账本",
      );

      // 再次触发检查（listProject 导入补齐）：已 done ⇒ 幂等，不重复调用、不重复系统行、不派 verifier。
      await harness.iface.listProject({ projectRoot: root });
      await sleep(300);
      assert.equal(completeCalls.length, 1, "已 done ⇒ 不重复调用收口");
      assert.equal(closeNotes().length, 1, "同决定不重复系统行");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "仍不派 verifier");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 验收收口：accepted + verification 已 done ⇒ 不收口调用、不派 verifier、Lead 一条（幂等）", async () => {
  const root = makeTempProjectRoot("ans-acceptance-close-done-");
  try {
    const flowId = "flow-close-done";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, acceptedAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    await appendLedger(root, [acceptanceDecisionEntry(flowId, "accepted")]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const completeCalls: string[] = [];
    const harness = await makeHarness(root, listing, {
      completeAcceptanceStep: async ({ flowId: id }) => {
        completeCalls.push(id);
        return { ok: true };
      },
    });
    try {
      const closeNotes = () => deliveryNotes(harness.events, "liaison").filter((note) => note.includes("验收已通过（判断代批或客户手批"));
      await waitFor(() => closeNotes().length > 0);
      assert.equal(completeCalls.length, 0, "步骤已 done ⇒ 不再调用收口（幂等）");
      assert.equal(closeNotes().length, 1, "Lead 恰一条收口系统行");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "已 done/已有决定 ⇒ 不派 verifier");
      await harness.iface.listProject({ projectRoot: root });
      await sleep(250);
      assert.equal(closeNotes().length, 1, "重复检查不刷屏");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 兼容（Q6 A）：legacy Markdown 流程 + 历史 rejected ⇒ 保持旧行为（不路由返工/不重派），无决定且门通过 ⇒ 仍正常派 verifier", async () => {
  const legacyRoot = makeTempProjectRoot("ans-acceptance-close-legacy-rejected-");
  const noDecisionRoot = makeTempProjectRoot("ans-acceptance-close-none-");
  try {
    const flowId = "flow-close-state";
    // ① legacy（无 YAML）+ rejected：旧行为 = 任意 acceptance 决定终结；不路由 Convener、不派 verifier。
    writeFlowFile(legacyRoot, flowId, flowMarkdown(flowId, acceptanceSteps(), [`contract: docs/contracts/${flowId}-api-v1.md`]));
    await seedGovernanceEvidence(legacyRoot, flowId, ["delivery-server"]);
    await appendAcceptanceDecisionAt(legacyRoot, flowId, "rejected", new Date().toISOString());
    writeAcceptanceReportFile(legacyRoot, flowId, 1, acceptanceReworkReportMarkdown([{ id: "F1", owner: "executor", action: "修复" }]));
    const legacyListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: legacyRoot };
    const legacyCalls: string[] = [];
    const legacy = await makeHarness(legacyRoot, legacyListing, {
      completeAcceptanceStep: async ({ flowId: id }) => { legacyCalls.push(id); return { ok: true }; },
    });
    try {
      await waitFor(() => blockerNotes(legacy.events, "liaison").length > 0);
      await sleep(250);
      assert.equal(legacyCalls.length, 0, "rejected ⇒ 不调收口");
      assert.equal(legacy.sendsByRole.get("verifier")?.length ?? 0, 0, "legacy rejected ⇒ 不派 verifier");
      assert.equal(legacy.sendsByRole.get("convener")?.length ?? 0, 0, "legacy 不接返工路由（Q6 A）");
      assert.equal(readReworkRoutingRecord(legacyRoot, flowId), undefined, "legacy 不写 routing record");
      assert.ok(
        deliveryNotes(legacy.events, "liaison").filter((note) => note.includes("验收已通过（判断代批或客户手批")).length === 0,
        "不冒充收口",
      );
    } finally {
      await legacy.iface.stopSession();
    }

    // ② 无验收决定：走既有门 ⇒ 正常派 verifier（收口/返工路由不介入）。
    writeFlowStateFile(noDecisionRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(noDecisionRoot, flowId, ["delivery-server"]);
    const noneListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: noDecisionRoot };
    const noneCalls: string[] = [];
    const none = await makeHarness(noDecisionRoot, noneListing, {
      completeAcceptanceStep: async ({ flowId: id }) => { noneCalls.push(id); return { ok: true }; },
    });
    try {
      await waitFor(() => (none.sendsByRole.get("verifier")?.length ?? 0) > 0);
      assert.equal(none.sendsByRole.get("verifier")!.length, 1, "无验收决定 ⇒ 门通过照常派 verifier");
      assert.equal(noneCalls.length, 0, "无 accepted 决定 ⇒ 不调收口");
      assert.equal(none.sendsByRole.get("convener")?.length ?? 0, 0, "无决定 ⇒ 不路由返工");
    } finally {
      await none.iface.stopSession();
    }
  } finally {
    rmSync(legacyRoot, { recursive: true, force: true });
    rmSync(noDecisionRoot, { recursive: true, force: true });
  }
});

test("2026-10-20 验收收口失败：只诊断/Lead 一条系统行、不循环、不派 verifier", async () => {
  const root = makeTempProjectRoot("ans-acceptance-close-fail-");
  try {
    const flowId = "flow-close-fail";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    await appendLedger(root, [acceptanceDecisionEntry(flowId, "accepted")]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const completeCalls: string[] = [];
    const harness = await makeHarness(root, listing, {
      completeAcceptanceStep: async ({ flowId: id }) => {
        completeCalls.push(id);
        return { ok: false, error: "模拟收口失败：flow 不可写" };
      },
    });
    try {
      const failureNotes = () => deliveryNotes(harness.events, "liaison").filter((note) => note.includes("流程收口失败"));
      await waitFor(() => failureNotes().length > 0);
      assert.ok(failureNotes()[0]!.includes("模拟收口失败"), "系统行含具体失败原因");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "收口失败也不派 verifier（验收已决定）");
      // 再次触发：同一失败原因不刷屏（不循环）；收口调用可被真实事件再次尝试，但不产生第二条系统行。
      await harness.iface.listProject({ projectRoot: root });
      await sleep(300);
      assert.equal(failureNotes().length, 1, "同失败原因不重复刷屏");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "仍不派 verifier");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 验收收口（真实编排出口）：accepted + verification pending ⇒ completeAcceptanceStep 真写 done、不派 verifier", async () => {
  const root = makeTempProjectRoot("ans-acceptance-close-real-");
  try {
    const flowId = "flow-close-real";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    await appendLedger(root, [acceptanceDecisionEntry(flowId, "accepted")]);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    // 不注入 completeAcceptanceStepFn：走 Pipeline 公共出口的真实实现。
    const harness = await makeHarness(root, listing);
    try {
      const closeNotes = () =>
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("验收已通过（判断代批或客户手批"));
      await waitFor(() => closeNotes().length > 0);
      const parsed = parseFlowStateYaml(
        readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"),
        flowId,
      );
      assert.equal(parsed.ok, true, parseErrorText(parsed));
      if (parsed.ok) {
        const verification = parsed.flow.steps.find((step) => step.kind === "acceptance");
        assert.equal(verification?.status, "done", "真实 completeAcceptanceStep 已把验收步骤标 done");
        assert.deepEqual(verification?.evidence, { kind: "acceptance", ref: "acceptance" });
      }
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "收口后不派 verifier");
      assert.equal(closeNotes().length, 1, "Lead 恰一条收口系统行");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— 2026-10-20 真机：flow 步骤已 delivered 但 Steward 空闲——应用没有「delivered 后唤醒核证」触发器 ——————

/** delivered 形态：nomination/contract-freeze done，integration-e2e / verification-evidence delivered。 */
function deliveredFlowSteps(flowId: string): FlowYamlStepInput[] {
  return [
    ...yamlAcceptanceSteps(flowId).filter((step) => step.id !== "delivery-server"),
    { id: "integration-e2e", kind: "dispatch", status: "delivered", owner: "executor" },
    { id: "verification-evidence", kind: "dispatch", status: "delivered", owner: "executor" },
  ];
}

test("2026-10-20 delivered 唤醒：无活会话 ⇒ Convener 恰一条核证任务 + Lead 恰一条系统行、无客户卡；同 revision 不刷屏、revision 变化再评估", async () => {
  const root = makeTempProjectRoot("ans-delivered-wake-");
  try {
    const flowId = "flow-delivered";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const customerCalls: unknown[] = [];
    const harness = await makeHarness(root, listing, {
      customerInput: async (request) => {
        customerCalls.push(request);
        return { outcome: "declined", reason: "delivered 唤醒不应弹卡" };
      },
    });
    try {
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0);
      const sends = harness.sendsByRole.get("convener")!;
      assert.equal(sends.length, 1, "delivered + 无活会话 ⇒ Convener 恰一条核证任务");
      assert.match(sends[0]!, /integration-e2e 已 delivered（owner=executor）/);
      assert.match(sends[0]!, /verification-evidence 已 delivered/);
      assert.match(sends[0]!, /flow_step_update/, "要求用 flow_step_update 核证");
      assert.match(sends[0]!, /不要直接写 flow YAML/, "禁止直接写 flow YAML");
      const wakeNotes = () =>
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("已 delivered，等待 Steward"));
      assert.equal(wakeNotes().length, 1, "Lead 恰一条「已 delivered，等待 Steward 核证」系统行");
      assert.ok(wakeNotes()[0]!.includes("integration-e2e") && wakeNotes()[0]!.includes("verification-evidence"));
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "流程未齐备 ⇒ 不派 verifier");
      assert.equal(customerCalls.length, 0, "全程零客户卡");
      // 不伪造 done、不自动改 flow：文件仍是 delivered/pending。
      const unchanged = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
      assert.equal(unchanged.ok, true);
      if (unchanged.ok) {
        assert.equal(unchanged.flow.steps.find((step) => step.id === "integration-e2e")?.status, "delivered", "不伪造 done");
        assert.equal(unchanged.flow.steps.find((step) => step.kind === "acceptance")?.status, "pending", "验收步骤不动");
      }
      // 同 revision + 同一 delivered 集合：重复 settle 不刷屏。
      harness.controls.get("convener")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "同 revision 不重复派");
      assert.equal(wakeNotes().length, 1, "同 revision 不重复提示");
      // revision 变化（仍是 delivered）⇒ 重新评估、再派一次。
      await sleep(30);
      const changedAt = new Date();
      writeFlowStateFile(
        root,
        flowId,
        flowStateYaml(
          flowId,
          deliveredFlowSteps(flowId).map((step) =>
            step.id === "integration-e2e" ? { ...step, title: `集成（v2 @ ${changedAt.toISOString()}）` } : step,
          ),
        ),
      );
      utimesSync(path.join(root, "docs", "flows", `${flowId}.yaml`), changedAt, changedAt);
      harness.controls.get("convener")!.settle();
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 1);
      assert.equal(harness.sendsByRole.get("convener")!.length, 2, "revision 变化后再次评估（再派一次）");
      assert.equal(wakeNotes().length, 2, "Lead 再提示一次");
      assert.equal(customerCalls.length, 0, "仍零客户卡");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 delivered 唤醒：owner 有活会话 ⇒ 不抢跑（等下一次事件）", async () => {
  const root = makeTempProjectRoot("ans-delivered-wake-live-");
  try {
    const flowId = "flow-delivered-live";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      // 在验收检查（40ms 合并窗口）前打开 owner 会话：有活会话 ⇒ 不抢跑。
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "pi" })).ok, true);
      await sleep(350);
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "owner 有活会话 ⇒ 不派核证任务");
      assert.equal(
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("已 delivered，等待 Steward")).length,
        0,
        "owner 有活会话 ⇒ 不发等待核证系统行",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 delivered 唤醒：已有 acceptance accepted ⇒ 收口优先、不派核证；步骤已 done ⇒ 不派", async () => {
  const acceptedRoot = makeTempProjectRoot("ans-delivered-wake-accepted-");
  const doneRoot = makeTempProjectRoot("ans-delivered-wake-done-");
  try {
    const flowId = "flow-delivered-state";
    // ① accepted：收口优先（走 completeAcceptanceStep），不派 Convener 核证、不派 verifier。
    writeFlowStateFile(acceptedRoot, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
    await seedGovernanceEvidence(acceptedRoot, flowId, []);
    await appendLedger(acceptedRoot, [acceptanceDecisionEntry(flowId, "accepted")]);
    const acceptedListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: acceptedRoot };
    const acceptedHarness = await makeHarness(acceptedRoot, acceptedListing, {
      completeAcceptanceStep: async () => ({ ok: true }),
    });
    try {
      await sleep(400);
      assert.equal(acceptedHarness.sendsByRole.get("convener")?.length ?? 0, 0, "已有 acceptance accepted ⇒ 不派核证任务");
      assert.equal(
        deliveryNotes(acceptedHarness.events, "liaison").filter((note) => note.includes("已 delivered，等待 Steward")).length,
        0,
        "不提示等待核证",
      );
      assert.equal(acceptedHarness.sendsByRole.get("verifier")?.length ?? 0, 0, "收口优先 ⇒ 不派 verifier");
      assert.ok(
        deliveryNotes(acceptedHarness.events, "liaison").some((note) => note.includes("验收已通过（判断代批或客户手批")),
        "收口系统行如实",
      );
    } finally {
      await acceptedHarness.iface.stopSession();
    }

    // ② 步骤 done（无 delivered）：不派核证；流程齐备 ⇒ 照常派 verifier 一次。
    writeFlowStateFile(doneRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(doneRoot, flowId, ["delivery-server"]);
    const doneListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: doneRoot };
    const doneHarness = await makeHarness(doneRoot, doneListing);
    try {
      await waitFor(() => (doneHarness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      assert.equal(doneHarness.sendsByRole.get("convener")?.length ?? 0, 0, "无 delivered 步骤 ⇒ 不派核证");
      assert.equal(
        deliveryNotes(doneHarness.events, "liaison").filter((note) => note.includes("已 delivered，等待 Steward")).length,
        0,
        "无 delivered 步骤 ⇒ 不提示",
      );
    } finally {
      await doneHarness.iface.stopSession();
    }
  } finally {
    rmSync(acceptedRoot, { recursive: true, force: true });
    rmSync(doneRoot, { recursive: true, force: true });
  }
});

// —————— 2026-10-20 真机：旧扫描规则写下的 evidence.ref 文件在重启后不补 artifact.observed ——————
//
// 桌面在 delivered 唤醒/验收判定**之前**调编排 `observeFlowArtifacts`（幂等补登 flow artifact 证据）；
// 补登是应用观察文件（owner/power/sha），不写客户决定账本、不伪造 done；失败不阻断后续判定。

type ObserveFlowArtifactsFn = NonNullable<DesktopDeps["observeFlowArtifactsFn"]>;

/** 幂等补登桩：文件存在且账本缺 artifact.observed ⇒ 补一条；重复调用不再记账；文件缺失 ⇒ skipped。 */
function observeStub(calls: string[]): ObserveFlowArtifactsFn {
  return async ({ projectRoot, flowId }) => {
    calls.push(flowId);
    const ref = `docs/contracts/${flowId}-api-v1.md`;
    if (!existsSync(path.join(projectRoot, ref))) return { ok: true, observed: 0, skipped: 1 };
    const ledger = await readGovernanceLedger(projectRoot);
    if (ledger.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === ref)) {
      return { ok: true, observed: 0, skipped: 0 };
    }
    const appended = await appendGovernanceLedger(projectRoot, {
      at: new Date().toISOString(),
      kind: "artifact.observed",
      artifactPath: ref,
      actorRoleId: "app",
      power: "app",
    });
    assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
    return { ok: true, observed: 1, skipped: 0 };
  };
}

test("2026-10-20 artifact 补登：delivered + artifact ref 文件存在但账本缺 ⇒ observe 补登、随后 Steward 唤醒；重复检查幂等不重复记账", async () => {
  const root = makeTempProjectRoot("ans-artifact-backfill-");
  try {
    const flowId = "flow-artifact-backfill";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
    // 只种 appointment（nomination done 证据）；**故意不种 artifact.observed**（模拟旧扫描规则）。
    await appendLedger(root, [{
      kind: "customer.decision",
      flowId,
      stepId: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["executor"],
    }]);
    const artifactRel = `docs/contracts/${flowId}-api-v1.md`;
    mkdirSync(path.join(root, "docs", "contracts"), { recursive: true });
    writeFileSync(path.join(root, artifactRel), "# 契约\n\n证据文件。\n", "utf8");
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const observeCalls: string[] = [];
    const harness = await makeHarness(root, listing, { observeFlowArtifacts: observeStub(observeCalls) });
    try {
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 4000);
      assert.deepEqual(observeCalls, [flowId], "有 kind:artifact + evidence.ref 的步骤 ⇒ 检查时恰调一次补登");
      await waitForAsync(async () => {
        const ledger = await readGovernanceLedger(root);
        return ledger.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === artifactRel);
      }, 3000);
      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === artifactRel).length,
        1,
        "账本补登恰一条 artifact.observed（应用观察，非客户决定）",
      );
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.decisionKind === "acceptance"), false, "不写客户决定账本");
      // 补登之后才唤醒 Steward；流程状态不被伪造。
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.flow.steps.find((step) => step.id === "integration-e2e")?.status, "delivered", "不伪造 done");
      }
      assert.match(harness.sendsByRole.get("convener")![0]!, /flow_step_update/);
      // 重复检查：再次请求补登（编排幂等）⇒ 账本仍一条、Steward 唤醒不重复。
      await harness.iface.listProject({ projectRoot: root });
      await sleep(300);
      assert.ok(observeCalls.length >= 2, "每次检查都会请求补登（幂等由编排保证）");
      const after = await readGovernanceLedger(root);
      assert.equal(
        after.entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === artifactRel).length,
        1,
        "重复补登不重复记账",
      );
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "同 revision+delivered 集合 ⇒ Steward 唤醒不重复");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 artifact 补登：证据文件缺失 ⇒ 补登 skipped、不伪造账本/done、不崩", async () => {
  const root = makeTempProjectRoot("ans-artifact-backfill-missing-");
  try {
    const flowId = "flow-artifact-missing";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
    await appendLedger(root, [{
      kind: "customer.decision",
      flowId,
      stepId: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["executor"],
    }]);
    // 不写 docs/contracts/<flow>-api-v1.md ⇒ 补登 skipped。
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const observeCalls: string[] = [];
    const harness = await makeHarness(root, listing, { observeFlowArtifacts: observeStub(observeCalls) });
    try {
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 4000);
      assert.deepEqual(observeCalls, [flowId], "仍会请求补登（文件缺失由编排 skipped 如实返回）");
      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "artifact.observed").length,
        0,
        "不伪造 artifact.observed（文件缺失 = 无观察记录）",
      );
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.flow.steps.find((step) => step.id === "integration-e2e")?.status, "delivered", "不伪造 done");
      }
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 artifact 补登：已有 acceptance accepted ⇒ 收口优先，不请求补登/不唤醒核证", async () => {
  const root = makeTempProjectRoot("ans-artifact-backfill-accepted-");
  try {
    const flowId = "flow-artifact-accepted";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
    await appendLedger(root, [
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
      acceptanceDecisionEntry(flowId, "accepted"),
    ]);
    mkdirSync(path.join(root, "docs", "contracts"), { recursive: true });
    writeFileSync(path.join(root, "docs", "contracts", `${flowId}-api-v1.md`), "# 契约\n", "utf8");
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const observeCalls: string[] = [];
    const completeCalls: string[] = [];
    const harness = await makeHarness(root, listing, {
      observeFlowArtifacts: observeStub(observeCalls),
      completeAcceptanceStep: async ({ flowId: id }) => {
        completeCalls.push(id);
        return { ok: true };
      },
    });
    try {
      await waitFor(() => completeCalls.length > 0, 3000);
      await sleep(250);
      assert.equal(observeCalls.length, 0, "accepted ⇒ 收口优先，不请求 artifact 补登");
      assert.equal(harness.sendsByRole.get("convener")?.length ?? 0, 0, "accepted ⇒ 不唤醒核证");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "accepted ⇒ 不派 verifier");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-20 artifact 补登（真实编排出口）：文件存在但账本缺 ⇒ 真写 artifact.observed（owner/power/sha）、随后 Steward 唤醒、幂等", async () => {
  const root = makeTempProjectRoot("ans-artifact-backfill-real-");
  try {
    const flowId = "flow-artifact-real";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
    await appendLedger(root, [{
      kind: "customer.decision",
      flowId,
      stepId: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["executor"],
    }]);
    const artifactRel = `docs/contracts/${flowId}-api-v1.md`;
    mkdirSync(path.join(root, "docs", "contracts"), { recursive: true });
    writeFileSync(path.join(root, artifactRel), "# 契约\n\n真实补登测试。\n", "utf8");
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    // 不注入 observeFlowArtifactsFn：走 Pipeline 公共出口真实实现。
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0, 4000);
      await waitForAsync(async () => {
        const ledger = await readGovernanceLedger(root);
        return ledger.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === artifactRel);
      }, 3000);
      const ledger = await readGovernanceLedger(root);
      const observed = ledger.entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === artifactRel);
      assert.equal(observed.length, 1, "真实 observeFlowArtifacts 补登恰一条");
      assert.equal(observed[0]!.actorRoleId, "executor", "owner 如实（步骤 owner）");
      assert.equal(observed[0]!.power, "project", "项目角色 power=project（应用观察，非客户批准）");
      assert.equal(observed[0]!.flowId, flowId);
      assert.match(observed[0]!.artifactSha256 ?? "", /^[0-9a-f]{64}$/, "记录文件 sha256");
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.decisionKind === "acceptance"), false, "不写客户决定账本");
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.flow.steps.find((step) => step.id === "integration-e2e")?.status, "delivered", "不伪造 done");
      }
      // 幂等：再次检查 ⇒ 同 path+sha 不重复追加。
      await harness.iface.listProject({ projectRoot: root });
      await sleep(300);
      const after = await readGovernanceLedger(root);
      assert.equal(
        after.entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === artifactRel).length,
        1,
        "同 path+sha 幂等跳过（不重复追加）",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————— 2026-10-22 第 3 项：新契约流程的实施前标准 / 变更包门槛（方案 §7.2/§7.3/§7.6） ——————
//
// 新流程（flow YAML 含 team-plan/role-cards/role-readiness/acceptance-criteria/change-package）在派验收判定前
// 必须有结构合格的实施前标准与变更包（riskTier）；标准缺失时应用先派 Verifier 写标准（stepId=acceptance-criteria），
// 不把「待补」当通过；legacy 流程（无新 step id）保持原行为。

function writeNewContractEvidenceFiles(
  root: string,
  flowId: string,
  options: { criteria?: boolean; change?: "none" | "no-risk" | "T2" | "T3" } = {},
): void {
  const scheduling = path.join(root, "docs", "scheduling");
  mkdirSync(scheduling, { recursive: true });
  writeFileSync(
    path.join(scheduling, `${flowId}-team-v1.md`),
    [`---`, `flowId: ${flowId}`, `version: 1`, `riskTier: T1`, `recommended: [executor]`, `---`, ``, `# 团队计划`, ``].join("\n"),
  );
  writeFileSync(path.join(scheduling, `${flowId}-readiness-v1.md`), `---\nflowId: ${flowId}\nversion: 1\nstatus: pass\n---\n# 就绪\n`);
  if (options.criteria === true) {
    const acceptance = path.join(root, "docs", "acceptance");
    mkdirSync(acceptance, { recursive: true });
    writeFileSync(
      path.join(acceptance, `${flowId}-criteria-v1.md`),
      [
        "---",
        `flowId: ${flowId}`,
        "version: 1",
        "riskTier: T2",
        "---",
        `# 验收标准：${flowId}`,
        "| ID | 标准 | 需要的证据 |",
        "| --- | --- | --- |",
        "| P1 | 交付 | 测试输出 |",
        `风险档位：T2（${flowId}）。判定规则：pass / fail / insufficient evidence。证据计划：单测。版本：v1 冻结。`,
        "",
      ].join("\n"),
    );
  }
  if (options.change !== undefined && options.change !== "none") {
    writeFileSync(
      path.join(scheduling, `${flowId}-change-v1.md`),
      [
        "---",
        `flowId: ${flowId}`,
        "version: 1",
        ...(options.change === "no-risk" ? [] : [`riskTier: ${options.change}`]),
        "candidate: abc123",
        "---",
        `# 变更包：${flowId}`,
        "",
      ].join("\n"),
    );
  }
}

function newContractSteps(flowId: string, options: { criteria: boolean; change: boolean }): FlowYamlStepInput[] {
  return [
    {
      id: "team-plan",
      kind: "artifact",
      status: "done",
      owner: "convener",
      evidence: { kind: "artifact", ref: `docs/scheduling/${flowId}-team-v1.md` },
    },
    {
      id: "appointment",
      kind: "customer-decision",
      status: "done",
      owner: "convener",
      evidence: { kind: "customer-decision", ref: "appointment" },
    },
    { id: "role-cards", kind: "dispatch", status: "done", owner: "nominator", evidence: { kind: "dispatch", ref: "role-cards" } },
    {
      id: "role-readiness",
      kind: "artifact",
      status: "done",
      owner: "convener",
      evidence: { kind: "artifact", ref: `docs/scheduling/${flowId}-readiness-v1.md` },
    },
    ...(options.criteria
      ? [{
          id: "acceptance-criteria",
          kind: "artifact",
          status: "done",
          owner: "verifier",
          evidence: { kind: "artifact" as const, ref: `docs/acceptance/${flowId}-criteria-v1.md` },
        }]
      : []),
    { id: "delivery-server", kind: "dispatch", status: "done", owner: "executor", evidence: { kind: "dispatch", ref: "delivery-server" } },
    ...(options.change
      ? [{
          id: "change-package",
          kind: "artifact",
          status: "done",
          owner: "convener",
          evidence: { kind: "artifact" as const, ref: `docs/scheduling/${flowId}-change-v1.md` },
        }]
      : []),
    { id: "verification", kind: "acceptance", status: "pending", owner: "app" },
  ];
}

async function appendNewContractLedger(
  root: string,
  flowId: string,
  options: { criteria: boolean; change: boolean },
): Promise<void> {
  await appendLedger(root, [
    {
      kind: "customer.decision",
      flowId,
      stepId: "appointment",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "convener",
      power: "schedule",
      targetRoleIds: ["executor"],
    },
    { kind: "artifact.observed", artifactPath: `docs/scheduling/${flowId}-team-v1.md`, actorRoleId: "convener", power: "schedule" },
    { kind: "dispatch.accepted", flowId, stepId: "role-cards", actorRoleId: "app", power: "app", targetRoleId: "nominator" },
    { kind: "artifact.observed", artifactPath: `docs/scheduling/${flowId}-readiness-v1.md`, actorRoleId: "convener", power: "schedule" },
    { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
    ...(options.criteria
      ? [{ kind: "artifact.observed" as const, artifactPath: `docs/acceptance/${flowId}-criteria-v1.md`, actorRoleId: "verifier", power: "verification" as const }]
      : []),
    ...(options.change
      ? [{ kind: "artifact.observed" as const, artifactPath: `docs/scheduling/${flowId}-change-v1.md`, actorRoleId: "convener", power: "schedule" as const }]
      : []),
  ]);
}

async function criteriaDispatches(projectRoot: string, flowId: string): Promise<GovernanceLedgerEntry[]> {
  const ledger = await readGovernanceLedger(projectRoot);
  return ledger.entries.filter(
    (entry) =>
      entry.kind === "dispatch.accepted" &&
      entry.flowId === flowId &&
      entry.targetRoleId === "verifier" &&
      entry.stepId === "acceptance-criteria",
  );
}

test("2026-10-22 第 3 项：新契约流程标准缺失 ⇒ 派 Verifier 写标准（acceptance-criteria）并阻塞判定；补齐标准+变更包后放行判定（带档位/报告路径）", async () => {
  const root = makeTempProjectRoot("ans-new-contract-criteria-");
  const flowId = "flow-new-gate";
  try {
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractSteps(flowId, { criteria: false, change: false })));
    writeNewContractEvidenceFiles(root, flowId, { criteria: false, change: "none" });
    await appendNewContractLedger(root, flowId, { criteria: false, change: false });
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      const criteriaMessage = harness.sendsByRole.get("verifier")![0]!;
      assert.match(criteriaMessage, /实施前完成标准/);
      assert.match(criteriaMessage, new RegExp(`docs/acceptance/${flowId}-criteria-v1\\.md`));
      assert.match(criteriaMessage, /不要发验收卡/);
      await waitForAsync(async () => (await criteriaDispatches(root, flowId)).length > 0);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "判定未派（只有写标准任务）");
      assert.equal((await verifierDispatches(root, flowId)).length, 0, "标准缺失：不派验收判定");
      assert.ok(
        deliveryNotes(harness.events, "liaison").some((note) => note.includes("实施前验收标准缺失")),
        "Lead 可见阻塞原因",
      );

      // 重复 settle：标准任务不重复派（账本/运行期去重）。
      await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" });
      harness.controls.get("executor")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "同流程不重复派标准任务");
      // Verifier 写完标准（本轮结束）：让排队中的后续任务可投出。
      harness.controls.get("verifier")?.settle();
      await sleep(100);

      // 补齐标准 + 变更包 + 更新 flow 证据（criteria/change 步骤 done）。
      writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T3" });
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractSteps(flowId, { criteria: true, change: true })));
      await appendNewContractLedger(root, flowId, { criteria: true, change: true });
      // 2026-10-23 可重入门禁：刷新探针会在 listProject 时占用后台会话（LRU=3），可能回收 executor 会话；
      // 用**既有「项目刷新/导入」触发面**（import）重新评估验收门，不依赖可能被回收的会话 settle。
      await harness.iface.listProject({ projectRoot: root });
      // 判定派发：Verifier 会话可能已被释放后重建（sendsByRole 会被新会话数组替换）——以账本为准等判定派发。
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length > 0, 5000);
      harness.controls.get("verifier")?.settle();
      await sleep(200);
      const verifierSends = harness.sendsByRole.get("verifier") ?? [];
      const judgeMessage = verifierSends[verifierSends.length - 1]!;
      assert.match(judgeMessage, /当前档位：T3/, "判定任务带变更包风险档位");
      assert.match(judgeMessage, new RegExp(`docs/acceptance/${flowId}-report-v1\\.md`), "报告路径进 docs/acceptance");
      assert.equal((await verifierDispatches(root, flowId)).length, 1, "判定派发恰一次（stepId=verification）");
      assert.equal((await criteriaDispatches(root, flowId)).length, 1, "标准任务恰一次（stepId=acceptance-criteria）");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-22 第 3 项：新契约流程变更包缺失/缺 riskTier ⇒ 不派判定 + Lead 系统行；补齐后判定任务带档位", async () => {
  const root = makeTempProjectRoot("ans-new-contract-change-");
  const flowId = "flow-new-change";
  try {
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractSteps(flowId, { criteria: true, change: false })));
    writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "none" });
    await appendNewContractLedger(root, flowId, { criteria: true, change: false });
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes("变更包缺失")));
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "变更包缺失：不派验收判定");
      assert.equal((await verifierDispatches(root, flowId)).length, 0);

      // 无 riskTier 的变更包：仍不派，原因如实更新。
      writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "no-risk" });
      await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" });
      harness.controls.get("executor")!.settle();
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes("缺少 riskTier")));
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "缺 riskTier：不派判定");

      // 补齐 riskTier=T2：放行判定，任务带档位。
      writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
      harness.controls.get("executor")!.settle();
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0, 5000);
      assert.match(harness.sendsByRole.get("verifier")![0]!, /当前档位：T2/);
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length > 0);
      assert.equal((await verifierDispatches(root, flowId)).length, 1);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————— 2026-10-23 验收返工路由：重开 / judge auto-rework / 报告兜底 / 记录与失败 ——————————————

test("2026-10-23 重派门（verification 进行中）：dispatched/delivered ⇒ 先 app-only 重开为 pending 再重派；重开失败不派并提示", async () => {
  const dispatchedRoot = makeTempProjectRoot("ans-rework-reopen-dispatched-");
  const failureRoot = makeTempProjectRoot("ans-rework-reopen-failed-");
  try {
    const flowId = "flow-rework-reopen";
    const decisionAt = new Date(Date.now() - 60_000).toISOString();
    // ① dispatched：先重开再重派（真实 Pipeline 出口）。
    await appendAcceptanceDecisionAt(dispatchedRoot, flowId, "rejected", decisionAt);
    writeFlowStateFile(
      dispatchedRoot,
      flowId,
      flowStateYaml(flowId, yamlAcceptanceSteps(flowId).map((step) =>
        step.kind === "acceptance" ? { ...step, status: "dispatched" } : step,
      )),
    );
    await seedGovernanceEvidence(dispatchedRoot, flowId, ["delivery-server"]);
    writeAcceptanceReportFile(
      dispatchedRoot,
      flowId,
      1,
      acceptanceReworkReportMarkdown([{ id: "F1", owner: "executor", action: "修复" }]),
    );
    const dispatchedListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: dispatchedRoot };
    const dispatched = await makeHarness(dispatchedRoot, dispatchedListing);
    try {
      await waitFor(() => (dispatched.sendsByRole.get("verifier")?.length ?? 0) > 0, 5000);
      assert.equal(dispatched.sendsByRole.get("verifier")!.length, 1, "重开成功后重派恰一次");
      const parsed = parseFlowStateYaml(
        readFileSync(path.join(dispatchedRoot, "docs", "flows", `${flowId}.yaml`), "utf8"),
        flowId,
      );
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.flow.steps.find((step) => step.kind === "acceptance")?.status, "pending", "旧 dispatched 已重开为 pending");
        assert.equal(parsed.flow.steps.find((step) => step.kind === "acceptance")?.evidence, undefined, "清空旧证据");
      }
      assert.equal((await verifierDispatches(dispatchedRoot, flowId)).length, 1);
    } finally {
      await dispatched.iface.stopSession();
    }

    // ② 重开失败：不派、系统行如实提示（不伪造 pending）。
    await appendAcceptanceDecisionAt(failureRoot, flowId, "rejected", decisionAt);
    writeFlowStateFile(
      failureRoot,
      flowId,
      flowStateYaml(flowId, yamlAcceptanceSteps(flowId).map((step) =>
        step.kind === "acceptance" ? { ...step, status: "delivered" } : step,
      )),
    );
    await seedGovernanceEvidence(failureRoot, flowId, ["delivery-server"]);
    writeAcceptanceReportFile(
      failureRoot,
      flowId,
      1,
      acceptanceReworkReportMarkdown([{ id: "F1", owner: "executor", action: "修复" }]),
    );
    const failureListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: failureRoot };
    const failure = await makeHarness(failureRoot, failureListing, {
      reopenAcceptanceStep: async () => ({ ok: false, error: "模拟重开失败：flow 不可写" }),
    });
    try {
      await waitFor(() =>
        deliveryNotes(failure.events, "liaison").some((note) => note.includes("重开为 pending 失败")),
      );
      assert.equal(failure.sendsByRole.get("verifier")?.length ?? 0, 0, "重开失败 ⇒ 不派");
      assert.equal((await verifierDispatches(failureRoot, flowId)).length, 0);
      const parsed = parseFlowStateYaml(
        readFileSync(path.join(failureRoot, "docs", "flows", `${flowId}.yaml`), "utf8"),
        flowId,
      );
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.flow.steps.find((step) => step.kind === "acceptance")?.status, "delivered", "不伪造 pending");
      }
    } finally {
      await failure.iface.stopSession();
    }
  } finally {
    rmSync(dispatchedRoot, { recursive: true, force: true });
    rmSync(failureRoot, { recursive: true, force: true });
  }
});

test("2026-10-23 judge auto-rework：onAutoRework 路由 Convener + 自动决策系统行、零 customer.decision / 零 Proof 返工；flow 更新后重派恰一次", async () => {
  const root = makeTempProjectRoot("ans-rework-judge-");
  try {
    const flowId = "flow-rework-judge";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      acceptanceReworkReportMarkdown([{ id: "F2", owner: "executor", action: "修复自动退回项" }]),
    );
    const ledgerBefore = await readGovernanceLedger(root);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      const at = new Date().toISOString();
      await harness.iface.routeAcceptanceAutoRework({
        flowId,
        cardKind: "acceptance",
        source: "judge-deny",
        reasonCode: "judged-denied",
        reason: "自动判断未通过：证据不足",
        operatorId: "judge:pi",
        engine: "pi",
        requestId: "op-judge-1",
        roleId: "verifier",
        projectRoot: root,
        runtime: "pi",
        at,
      });
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 0);
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes("自动决策未通过/未完成")));
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "judge auto-rework ⇒ 恰一条 Convener 任务");
      const task = harness.sendsByRole.get("convener")![0]!;
      assert.match(task, /来源：自动决策未通过（自动退回\/判断拒绝）/);
      assert.ok(!/客户拒绝/.test(task), "judge 来源任务不得出现「客户拒绝」");
      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes("自动决策未通过/未完成")), "自动决策系统行");
      assert.ok(notes.filter((note) => note.includes("客户拒绝")).length === 0, "judge 来源系统行不得出现「客户拒绝」");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "无 flow 更新 ⇒ 不派 Proof");
      const record = readReworkRoutingRecord(root, flowId);
      assert.equal(record?.source, "judge");
      assert.equal(record?.sourceDetail, "judge-deny");
      assert.equal(record?.status, "sent");
      const ledgerAfter = await readGovernanceLedger(root);
      assert.equal(
        ledgerAfter.entries.filter((entry) => entry.kind === "customer.decision").length,
        ledgerBefore.entries.filter((entry) => entry.kind === "customer.decision").length,
        "judge auto-rework 不写 customer.decision",
      );
      const audit = ledgerAfter.entries.filter(
        (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.targetRoleId === "convener",
      );
      assert.equal(audit.length, 1, "账本恰一条 app→convener 审计");

      // 路由后 flow 有实质更新（mtime > routing sentAt）⇒ 重派门重派 Proof 恰一次。
      await sleep(1100); // 保证 mtime 晚于 sentAt（文件系统 mtime 粒度）
      setFlowStateVersion(root, flowId, new Date(), "judge-rework");
      await harness.iface.listProject({ projectRoot: root });
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0, 5000);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "judge auto-rework 后 flow 更新 ⇒ 重派恰一次");
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length === 1);
      // 再触发：同内容不重派。
      harness.controls.get("verifier")!.settle();
      await harness.iface.listProject({ projectRoot: root });
      await sleep(300);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "同内容不重派");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-23 报告兜底：缺段/坏段只发「报告不完整」任务（无 items、不解析自由文本）；未知 owner blocked、verifier/convener 特殊归属", async () => {
  const missingRoot = makeTempProjectRoot("ans-rework-report-missing-");
  const invalidRoot = makeTempProjectRoot("ans-rework-report-invalid-");
  const ownersRoot = makeTempProjectRoot("ans-rework-owners-");
  try {
    const flowId = "flow-rework-report";
    const past = new Date(Date.now() - 60_000).toISOString();

    // ① 缺段（目标项目形态：只有人读表，无 fenced YAML）。
    await appendAcceptanceDecisionAt(missingRoot, flowId, "rejected", past);
    writeFlowStateFile(missingRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(missingRoot, flowId, ["delivery-server"]);
    writeAcceptanceReportFile(missingRoot, flowId, 1, "# 验收报告\n\n结论：不通过。\n\n§8 偏差表（非机器可读）。\n");
    const missingListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: missingRoot };
    const missing = await makeHarness(missingRoot, missingListing);
    try {
      await waitFor(() => (missing.sendsByRole.get("convener")?.length ?? 0) > 0);
      // 系统行在发送/record 之后发出：先等到它，再断言任务/记录（避免发送可见早于系统行的竞态）。
      await waitFor(() =>
        deliveryNotes(missing.events, "liaison").some((note) => note.includes("缺少可解析的 acceptance-rework/v1")),
      );
      const task = missing.sendsByRole.get("convener")![0]!;
      assert.match(task, /结构化返工段缺失或不可解析/);
      assert.match(task, /未生成返工项、未创建流程步骤/);
      assert.ok(!/id=F1/.test(task), "不生成 items");
      const record = readReworkRoutingRecord(missingRoot, flowId);
      assert.equal(record?.structured, false);
      assert.equal(record?.itemCount, 0);
      assert.ok(
        deliveryNotes(missing.events, "liaison").some((note) => note.includes("缺少可解析的 acceptance-rework/v1")),
        "报告不完整系统行",
      );
    } finally {
      await missing.iface.stopSession();
    }

    // ② 坏段（未知字段）：整段不采信、错误可见。
    await appendAcceptanceDecisionAt(invalidRoot, flowId, "rejected", past);
    writeFlowStateFile(invalidRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(invalidRoot, flowId, ["delivery-server"]);
    writeAcceptanceReportFile(
      invalidRoot,
      flowId,
      1,
      ["# 验收报告", "", "```yaml", "schema: acceptance-rework/v1", "items:", "  - id: F1", "    owner: executor", "    action: 修复", "    bogus: true", "```", ""].join("\n"),
    );
    const invalidListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: invalidRoot };
    const invalid = await makeHarness(invalidRoot, invalidListing);
    try {
      await waitFor(() => (invalid.sendsByRole.get("convener")?.length ?? 0) > 0);
      const task = invalid.sendsByRole.get("convener")![0]!;
      assert.match(task, /结构化返工段缺失或不可解析/);
      assert.match(task, /bogus/, "任务带具体错误 path/字段");
      assert.ok(!/id=F1 \| owner/.test(task), "坏段不部分采信");
      assert.equal(readReworkRoutingRecord(invalidRoot, flowId)?.structured, false);
    } finally {
      await invalid.iface.stopSession();
    }

    // ③ owner 归属：未知 blocked；verifier=报告修正；convener=治理项；有效项可先行。
    await appendAcceptanceDecisionAt(ownersRoot, flowId, "rejected", past);
    writeFlowStateFile(ownersRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(ownersRoot, flowId, ["delivery-server"]);
    writeAcceptanceReportFile(
      ownersRoot,
      flowId,
      1,
      acceptanceReworkReportMarkdown([
        { id: "F1", owner: "executor", action: "有效项" },
        { id: "F9", owner: "ghost-role", action: "未知 owner" },
        { id: "F10", owner: "verifier", action: "修正报告结构" },
        { id: "F11", owner: "convener", action: "更新变更包" },
        { id: "F12", owner: "app", action: "应用自己处理" },
      ]),
    );
    const ownersListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: ownersRoot };
    const owners = await makeHarness(ownersRoot, ownersListing);
    try {
      await waitFor(() => (owners.sendsByRole.get("convener")?.length ?? 0) > 0);
      const task = owners.sendsByRole.get("convener")![0]!;
      assert.match(task, /可派发项（按 owner 分组/);
      assert.match(task, /owner=executor：F1（有效项）/);
      assert.match(task, /blocked 项/);
      assert.match(task, /ghost-role/);
      assert.match(task, /id=F12 \| owner=app/);
      assert.match(task, /报告\/工具修正项（owner=verifier/);
      assert.match(task, /不要向 Proof 派产品返工/);
      assert.match(task, /治理文档\/变更包项/);
      assert.match(task, /不要向内置治理角色 dispatch_task/);
      assert.equal(owners.sendsByRole.get("verifier")?.length ?? 0, 0, "不向 Proof 派产品返工");
      assert.equal(owners.sendsByRole.get("convener")!.length, 1, "Convener 恰一条（不因 verifier/convener owner 再派）");
    } finally {
      await owners.iface.stopSession();
    }
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
    rmSync(invalidRoot, { recursive: true, force: true });
    rmSync(ownersRoot, { recursive: true, force: true });
  }
});

test("2026-10-23 routing record：重启去重；审计失败不阻塞但可见、不伪造账本；record 写失败不发送；发送失败重试", async () => {
  const restartRoot = makeTempProjectRoot("ans-rework-restart-");
  const auditRoot = makeTempProjectRoot("ans-rework-audit-");
  const writeFailRoot = makeTempProjectRoot("ans-rework-record-fail-");
  const sendFailRoot = makeTempProjectRoot("ans-rework-send-fail-");
  try {
    const flowId = "flow-rework-record";
    const past = new Date(Date.now() - 60_000).toISOString();
    const report = acceptanceReworkReportMarkdown([{ id: "F3", owner: "executor", action: "修复" }]);

    // ① 重启去重：h1 路由（无进展）→ h2 新 Interface 不重复任务。
    writeFlowStateFile(restartRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(restartRoot, flowId, ["delivery-server"]);
    await appendAcceptanceDecisionAt(restartRoot, flowId, "rejected", new Date().toISOString()); // rejection 晚于 flow
    writeAcceptanceReportFile(restartRoot, flowId, 1, report);
    const restartListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: restartRoot };
    const h1 = await makeHarness(restartRoot, restartListing);
    await waitFor(() => (h1.sendsByRole.get("convener")?.length ?? 0) > 0);
    await waitFor(() => deliveryNotes(h1.events, "liaison").some((note) => note.includes("客户拒绝")));
    await h1.iface.stopSession();
    const h2 = await makeHarness(restartRoot, restartListing);
    try {
      await sleep(350);
      assert.equal(h2.sendsByRole.get("convener")?.length ?? 0, 0, "重启后同决定/同报告不重复路由");
      assert.equal(readReworkRoutingRecord(restartRoot, flowId)?.status, "sent");
    } finally {
      await h2.iface.stopSession();
    }

    // ② 审计失败：任务已发出、record sent 保持、系统行可见、账本无伪造条目。
    writeFlowStateFile(auditRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(auditRoot, flowId, ["delivery-server"]);
    await appendAcceptanceDecisionAt(auditRoot, flowId, "rejected", new Date().toISOString());
    writeAcceptanceReportFile(auditRoot, flowId, 1, report);
    const auditListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: auditRoot };
    const audit = await makeHarness(auditRoot, auditListing, {
      appendGovernanceLedger: async () => ({ ok: false, message: "模拟审计写入失败" }),
    });
    try {
      await waitFor(() => (audit.sendsByRole.get("convener")?.length ?? 0) > 0);
      await waitFor(() =>
        deliveryNotes(audit.events, "liaison").some((note) => note.includes("审计记录写入失败")),
      );
      assert.equal(readReworkRoutingRecord(auditRoot, flowId)?.status, "sent", "record sent 不翻转");
      const ledger = await readGovernanceLedger(auditRoot);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "convener").length,
        0,
        "审计失败不伪造账本",
      );
      assert.ok(
        deliveryNotes(audit.events, "liaison").some((note) => note.includes("不会伪造账本")),
        "审计失败系统行如实",
      );
    } finally {
      await audit.iface.stopSession();
    }

    // ③ record 写失败 ⇒ 不发送（没有耐久路由记录）。
    writeFlowStateFile(writeFailRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(writeFailRoot, flowId, ["delivery-server"]);
    await appendAcceptanceDecisionAt(writeFailRoot, flowId, "rejected", new Date().toISOString());
    writeAcceptanceReportFile(writeFailRoot, flowId, 1, report);
    // 让 `.ans/governance/acceptance/<flowId>` 成为普通文件 ⇒ mkdir/rename 必失败。
    mkdirSync(path.join(writeFailRoot, ".ans", "governance", "acceptance"), { recursive: true });
    writeFileSync(path.join(writeFailRoot, ".ans", "governance", "acceptance", flowId), "not-a-directory", "utf8");
    const writeFailListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: writeFailRoot };
    const writeFail = await makeHarness(writeFailRoot, writeFailListing);
    try {
      await waitFor(() =>
        deliveryNotes(writeFail.events, "liaison").some((note) => note.includes("路由记录写入失败")),
      );
      assert.equal(writeFail.sendsByRole.get("convener")?.length ?? 0, 0, "record 写失败 ⇒ 不发送");
      assert.equal(writeFail.sendsByRole.get("verifier")?.length ?? 0, 0, "不派 Proof");
      assert.equal(existsSync(reworkRoutingRecordPath(writeFailRoot, flowId)), false);
    } finally {
      await writeFail.iface.stopSession();
    }

    // ④ 发送失败 ⇒ record failed + 系统行；下一次真实事件重试（成功）。
    writeFlowStateFile(sendFailRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(sendFailRoot, flowId, ["delivery-server"]);
    await appendAcceptanceDecisionAt(sendFailRoot, flowId, "rejected", new Date().toISOString());
    writeAcceptanceReportFile(sendFailRoot, flowId, 1, report);
    const sendFailListing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: sendFailRoot };
    const failOpenRoles = new Set(["convener"]);
    const sendFail = await makeHarness(sendFailRoot, sendFailListing, { failOpenRoles });
    try {
      await waitFor(() =>
        deliveryNotes(sendFail.events, "liaison").some((note) => note.includes("返工路由失败")),
      );
      assert.equal(readReworkRoutingRecord(sendFailRoot, flowId)?.status, "failed");
      assert.equal(sendFail.sendsByRole.get("convener")?.length ?? 0, 0);
      // 修正后下一次真实事件（项目刷新）重试成功。
      failOpenRoles.delete("convener");
      await sendFail.iface.listProject({ projectRoot: sendFailRoot });
      await waitFor(() => (sendFail.sendsByRole.get("convener")?.length ?? 0) > 0, 5000);
      await waitFor(() => deliveryNotes(sendFail.events, "liaison").some((note) => note.includes("客户拒绝")));
      assert.equal(readReworkRoutingRecord(sendFailRoot, flowId)?.status, "sent");
    } finally {
      await sendFail.iface.stopSession();
    }
  } finally {
    rmSync(restartRoot, { recursive: true, force: true });
    rmSync(auditRoot, { recursive: true, force: true });
    rmSync(writeFailRoot, { recursive: true, force: true });
    rmSync(sendFailRoot, { recursive: true, force: true });
  }
});

test("2026-10-23 acceptanceLastDispatchAtMs / acceptanceDispatchRecorded 收窄：只认 stepId=verification 或旧无 stepId+verifier", () => {
  const flowId = "flow-dispatch-narrow";
  const base = { kind: "dispatch.accepted" as const, flowId, actorRoleId: "app", power: "app" as const };
  const criteria = {
    entries: [{ ...base, stepId: "acceptance-criteria", targetRoleId: "verifier", at: "2026-10-23T00:00:00.000Z" }],
  };
  assert.equal(acceptanceDispatchRecorded(flowId, criteria), false, "acceptance-criteria 不计入验收派发");
  assert.equal(acceptanceLastDispatchAtMs(flowId, criteria), undefined, "acceptance-criteria 不参与验收派发时间口径");

  const legacyVerifier = {
    entries: [{ ...base, targetRoleId: "verifier", at: "2026-10-23T01:00:00.000Z" }],
  };
  assert.equal(acceptanceDispatchRecorded(flowId, legacyVerifier), true, "旧无 stepId + verifier 仍计入");
  assert.equal(acceptanceLastDispatchAtMs(flowId, legacyVerifier), Date.parse("2026-10-23T01:00:00.000Z"));

  const legacyNonVerifier = {
    entries: [{ ...base, targetRoleId: "executor", at: "2026-10-23T02:00:00.000Z" }],
  };
  assert.equal(acceptanceDispatchRecorded(flowId, legacyNonVerifier), false, "旧无 stepId + 非 verifier 不计入");
  assert.equal(acceptanceLastDispatchAtMs(flowId, legacyNonVerifier), undefined);

  const verificationOnly = {
    entries: [{ ...base, stepId: "verification", at: "2026-10-23T03:00:00.000Z" }],
  };
  assert.equal(acceptanceDispatchRecorded(flowId, verificationOnly), true, "stepId=verification 仍计入（含 app 记录）");
  assert.equal(acceptanceLastDispatchAtMs(flowId, verificationOnly), Date.parse("2026-10-23T03:00:00.000Z"));
});

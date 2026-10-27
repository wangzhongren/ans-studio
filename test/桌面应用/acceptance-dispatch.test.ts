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
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { createDesktopInterface, type DesktopDeps } from "../../app/desktop/interface.ts";
// 2026-10-26 边界变更请求（request_boundary_change）：票据路径/摘要纯逻辑与 AI 门禁请求形状。
import {
  boundaryChangeClientMessageId,
  boundaryChangeTicketRelPath,
} from "../../app/desktop/boundary-change.ts";
// 2026-10-26 需求变更申请（request_requirement_change）：票据路径/形状纯逻辑。
import {
  requirementChangeTicketRelPath,
  type RequirementChangeTicketRecord,
} from "../../app/desktop/requirement-change.ts";
import type {
  CustomerInputOutcome,
  CustomerInputRequest,
  GovernanceJudgeOutcome,
  GovernanceJudgeRequest,
  RequestRequirementChangeFn,
  RequestRequirementChangeInput,
} from "../../src/model/runtime.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { RUNTIME_UNRESOLVED_MESSAGE } from "../../app/desktop/runtime-resolution.ts";
import {
  acceptanceDispatchRecorded,
  acceptanceLastDispatchAtMs,
  buildAcceptanceTaskMessage,
  flowCompletionIssue,
  flowStepEvidenceKind,
  flowStepHasEvidence,
  governanceAcceptanceBlockedNote,
  governanceFlowStatePath,
  governanceGateReviewReportPath,
  type FlowCompletionLedgerEntryLike,
} from "../../app/desktop/governance-advance.ts";
import { createCustomerInputChannel, type AcceptanceTriageGateFacts } from "../../app/desktop/customer-input.ts";
import {
  acceptanceTriageIdForReport,
  buildAcceptanceTriageRecord,
  completeAcceptanceCriteriaStep,
  evaluateFlowCompletion,
  FLOW_STEP_KINDS,
  flowStatePath,
  gateReviewReportRelPath,
  latestAcceptanceDecision,
  listReadyFlowSteps,
  parseAcceptanceTriageReport,
  parseFlowStateYaml,
  readAcceptanceTriageRecord,
  recommendAcceptanceTriage,
  writeAcceptanceTriageRecord,
} from "../../src/pipeline/orchestration/flow-state.ts";
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

function trioListing(roleIds: string[] = ["liaison", "rapporteur", "nominator", "convener", "verifier"]): ProjectListing {
  const role = (roleId: string) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: `# ${roleId}`,
    boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
    builtIn: true,
    ...(roleId === "liaison"
      ? { governanceFunction: "liaison" as const }
      : roleId === "rapporteur"
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
  /** 2026-10-25 request_acceptance：捕获每次 openRoleSession 的入参（验证能力注入矩阵/取得能力闭包）。 */
  openInputs: Map<string, Parameters<NonNullable<DesktopDeps["openRoleSessionFn"]>>[0]>;
}

async function makeHarness(
  projectRoot: string,
  listing: ProjectListing,
  options: {
    resolveRuntime?: DesktopDeps["resolveRuntimeFn"];
    completeAcceptanceStep?: DesktopDeps["completeAcceptanceStepFn"];
    completeAcceptanceCriteriaStep?: DesktopDeps["completeAcceptanceCriteriaStepFn"];
    customerInput?: DesktopDeps["customerInput"];
    observeFlowArtifacts?: DesktopDeps["observeFlowArtifactsFn"];
    /** 2026-10-23 验收返工路由：重开验收步骤（缺省真实 Pipeline 出口）、审计账本追加、会话打开失败注入。 */
    reopenAcceptanceStep?: DesktopDeps["reopenAcceptanceStepForReworkFn"];
    appendGovernanceLedger?: DesktopDeps["appendGovernanceLedgerFn"];
    failOpenRoles?: Set<string>;
    /** 2026-10-25 验收分诊：重启恢复重推分诊卡（缺省不注入 ⇒ 不重推）。 */
    presentAcceptanceTriageCard?: DesktopDeps["presentAcceptanceTriageCard"];
    /** 2026-10-25 验收分诊：判断决策开关（缺省 false；测试可注入已开启的开关实例）。 */
    decisionJudgeSwitch?: DesktopDeps["decisionJudgeSwitch"];
    /** 2026-10-25 request_acceptance 有界超时（测试注入短预算）。 */
    requestAcceptanceLimits?: DesktopDeps["requestAcceptanceLimits"];
    /** 2026-10-26 request_boundary_change：AI 门禁判断闭包工厂（缺省真实实现；测试注入桩件）。 */
    createGovernanceJudgeFn?: DesktopDeps["createGovernanceJudgeFn"];
    /** 2026-10-26 request_boundary_change：整体能力注入面（测试可替换为假实现）。 */
    requestBoundaryChange?: DesktopDeps["requestBoundaryChange"];
    /** 2026-10-26 request_boundary_change：AI/派发时限（测试注入短预算）。 */
    requestBoundaryChangeLimits?: DesktopDeps["requestBoundaryChangeLimits"];
    /** 2026-10-26 request_requirement_change：整体能力注入面（测试可替换为假实现）。 */
    requestRequirementChange?: DesktopDeps["requestRequirementChange"];
    /** 2026-10-26 request_requirement_change：审批卡/主理执行任务投递时限（测试注入短预算）。 */
    requestRequirementChangeLimits?: DesktopDeps["requestRequirementChangeLimits"];
    /** 2026-10-26 意图交接投递时限（测试注入短预算）。 */
    handOffIntentLimits?: DesktopDeps["handOffIntentLimits"];
    /** 2026-10-25 request_acceptance 真机挂起复现：会话开启永不 resolve。 */
    hangOpenRoleSession?: boolean;
    /** 2026-10-27 gate 复核投递真机挂起复现：verifier 收到任务但 send 永不返回（无 ACK）。 */
    hangVerifierSend?: boolean;
    /** 2026-10-27 request_gate_review 有界超时（测试注入短预算）。 */
    requestGateReviewLimits?: DesktopDeps["requestGateReviewLimits"];
  } = {},
): Promise<Harness> {
  const sendsByRole = new Map<string, string[]>();
  const events: SessionEventEnvelope[] = [];
  const controls = new Map<string, ReturnType<typeof scriptedHandle>>();
  const openInputs = new Map<string, Parameters<NonNullable<DesktopDeps["openRoleSessionFn"]>>[0]>();
  const iface = createDesktopInterface({
    pickDirectory: async () => projectRoot,
    emitEvent: (envelope) => {
      events.push(envelope);
    },
    listProjectFn: async () => listing,
    openRoleSessionFn: async (input) => {
      openInputs.set(input.roleId, input);
      if (options.hangOpenRoleSession === true && input.roleId === "verifier") {
        return new Promise(() => {}); // 真机复现：引擎启动/开会话无 ACK ⇒ 永不 resolve
      }
      if (options.failOpenRoles?.has(input.roleId) === true) {
        throw new Error(`模拟打开 ${input.roleId} 会话失败`);
      }
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      const made = scriptedHandle(sends);
      if (options.hangVerifierSend === true && input.roleId === "verifier") {
        const originalSend = made.handle.send.bind(made.handle);
        made.handle.send = async (text: string): Promise<void> => {
          await originalSend(text);
          return new Promise<void>(() => {}); // 真机：适配器写入无 ACK，send 永不返回
        };
      }
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
    // 2026-10-25 request_acceptance：验收标准步骤收口（缺省真实 Pipeline 出口；测试可包一层观察调用）。
    ...(options.completeAcceptanceCriteriaStep !== undefined
      ? { completeAcceptanceCriteriaStepFn: options.completeAcceptanceCriteriaStep }
      : {}),
    // 2026-10-20：delivered 唤醒/收口全程不得弹客户卡——测试可注入记录器。
    ...(options.customerInput !== undefined ? { customerInput: options.customerInput } : {}),
    // 2026-10-20：flow artifact 证据补登（编排 observeFlowArtifacts 的桌面注入面）。
    ...(options.observeFlowArtifacts !== undefined ? { observeFlowArtifactsFn: options.observeFlowArtifacts } : {}),
    // 2026-10-23 验收返工路由：重开验收步骤 / 审计失败 / 会话打开失败注入（只影响被测路径）。
    ...(options.reopenAcceptanceStep !== undefined ? { reopenAcceptanceStepForReworkFn: options.reopenAcceptanceStep } : {}),
    ...(options.appendGovernanceLedger !== undefined ? { appendGovernanceLedgerFn: options.appendGovernanceLedger } : {}),
    ...(options.presentAcceptanceTriageCard !== undefined ? { presentAcceptanceTriageCard: options.presentAcceptanceTriageCard } : {}),
    ...(options.decisionJudgeSwitch !== undefined ? { decisionJudgeSwitch: options.decisionJudgeSwitch } : {}),
    ...(options.requestAcceptanceLimits !== undefined ? { requestAcceptanceLimits: options.requestAcceptanceLimits } : {}),
    ...(options.createGovernanceJudgeFn !== undefined ? { createGovernanceJudgeFn: options.createGovernanceJudgeFn } : {}),
    ...(options.requestBoundaryChange !== undefined ? { requestBoundaryChange: options.requestBoundaryChange } : {}),
    ...(options.requestBoundaryChangeLimits !== undefined
      ? { requestBoundaryChangeLimits: options.requestBoundaryChangeLimits }
      : {}),
    ...(options.requestRequirementChange !== undefined
      ? { requestRequirementChange: options.requestRequirementChange }
      : {}),
    ...(options.requestRequirementChangeLimits !== undefined
      ? { requestRequirementChangeLimits: options.requestRequirementChangeLimits }
      : {}),
    ...(options.handOffIntentLimits !== undefined ? { handOffIntentLimits: options.handOffIntentLimits } : {}),
    ...(options.requestGateReviewLimits !== undefined ? { requestGateReviewLimits: options.requestGateReviewLimits } : {}),
  });
  await iface.listProject({ projectRoot });
  return { iface, sendsByRole, events, controls, openInputs };
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
    // 2026-10-24 客户修订：所有变更（release 缺省＝非发布）同样自动派 Proof；release 不再是门。
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
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
      assert.ok(notes.some((note) => /已自动派发验收复核给质检（工作中）/.test(note)), "Lead 系统行如实告知自动派发");
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

test("自动验收（任意角色 settle + 流程状态变更）：交付步骤补齐后由 settle 触发；重复 settle 只派一次", async () => {
  const root = makeTempProjectRoot("ans-acceptance-settle-");
  try {
    const flowId = "flow-settle";
    // 导入时仍有执行步骤 pending：补齐检查不派（非发布流程也一样要等步骤完成）。
    const pendingSteps: FlowYamlStepInput[] = [
      ...yamlAcceptanceSteps(flowId).filter((step) => step.id !== "delivery-server"),
      { id: "delivery-server", kind: "dispatch", status: "pending" },
    ];
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, pendingSteps));
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await sleep(120); // 让导入补齐检查跑过一次（应被 pending 拦下）
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "导入时流程未完成：不派");

      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      // Convener 写流程状态并派发最后一个交付步骤（账本追加 dispatch.accepted）→ YAML 更新为 done。
      await appendLedger(root, [
        { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
      ]);
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
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

      // 门通过：修正流程 + 补派发证据（release 缺省＝非发布；2026-10-24 客户修订后同样自动派 Proof）⇒
      // 自动派发路径不变，且不再发阻塞行。
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
      await appendLedger(root, [
        { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
      ]);
      control.settle();
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      await sleep(150);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "门通过后仍按原路径恰派一条验收任务");
      assert.equal(blockerNotes(harness.events, "liaison").length, 2, "门通过：不发新的阻塞行");
      assert.ok(
        deliveryNotes(harness.events, "liaison").some((note) => /已自动派发验收复核给质检/.test(note)),
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

      // 第一次放行：流程修正 + 补证据 ⇒ 收尾门通过并进入验收派发路径；本用例注入「引擎无法确定」
      // ⇒ 只落一条明确系统行、不发生 Proof 派发。2026-10-24 客户修订：非发布/legacy 也走同一路径
      // （不再停在发布验收前）。
      writeFlowFile(root, flowId, withDeliveryStatus("done"));
      await appendLedger(root, [
        { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
      ]);
      control.settle();
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes(RUNTIME_UNRESOLVED_MESSAGE)));
      assert.equal(blockerNotes(harness.events, "liaison").length, 1, "门通过本身不发阻塞行");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "引擎无法确定：不派 Proof");
      assert.ok(
        !deliveryNotes(harness.events, "liaison").some((note) => note.includes("awaiting-release-acceptance")),
        "不再出现「停在发布验收前」等待行",
      );

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
  /** 2026-10-26 gate 复核：`kind: artifact` + 可选 gateKind（不新增 FlowStepKind）。 */
  gateKind?: string;
  /** 2026-10-26 gate 复核：下游依赖（派发门/ready 规划/gate 校验共用）。 */
  dependsOn?: readonly string[];
}

/** 构造块状 YAML（机器状态；手写而非 JSON，覆盖真实文件形状）。`release` 仅供参考元数据（2026-10-24 修订后不再作为独立验收门）。 */
function flowStateYaml(flowId: string, steps: readonly FlowYamlStepInput[], options: { release?: boolean } = {}): string {
  const lines = [
    `flowId: ${flowId}`,
    "version: 1",
    "qualityTier: production",
    ...(options.release === true ? ["release: true"] : options.release === false ? ["release: false"] : []),
    "steps:",
  ];
  for (const step of steps) {
    lines.push(`  - id: ${step.id}`);
    lines.push(`    title: ${step.title ?? `步骤 ${step.id}`}`);
    lines.push(`    owner: ${step.owner ?? "executor"}`);
    lines.push(`    kind: ${step.kind}`);
    lines.push(`    status: ${step.status}`);
    if (step.gateKind !== undefined) lines.push(`    gateKind: ${step.gateKind}`);
    if (step.evidence !== undefined) {
      lines.push("    evidence:");
      lines.push(`      kind: ${step.evidence.kind}`);
      lines.push(`      ref: ${step.evidence.ref}`);
    }
    if (step.dependsOn !== undefined && step.dependsOn.length > 0) {
      lines.push(`    dependsOn: [${step.dependsOn.join(", ")}]`);
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
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
        deliveryNotes(harness.events, "liaison").some((note) => /已自动派发验收复核给质检（工作中）/.test(note)),
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

test("2026-10-24 所有变更独立验收：非发布新契约流程同样派 verifier 写标准，补齐后派 Proof；release 不参与判定", async () => {
  const root = makeTempProjectRoot("ans-acceptance-non-release-");
  try {
    const flowId = "flow-non-release";
    // release 缺省 = 非发布；客户 2026-10-24 修订：非发布同样先写标准、再进入验收判定。
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractSteps(flowId, { criteria: false, change: true })));
    writeNewContractEvidenceFiles(root, flowId, { criteria: false, change: "T2" });
    await appendNewContractLedger(root, flowId, { criteria: false, change: true });
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      // ① 非发布同样派 Verifier 写 acceptance-criteria（不再停在发布验收前）。
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      const criteriaMessage = harness.sendsByRole.get("verifier")![0]!;
      assert.match(criteriaMessage, /实施前完成标准/);
      assert.match(criteriaMessage, new RegExp(`docs/acceptance/${flowId}-criteria-v1\\.md`));
      assert.match(criteriaMessage, /不要发验收卡/);
      await waitForAsync(async () => (await criteriaDispatches(root, flowId)).length > 0);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "判定未派（只有写标准任务）");
      assert.equal((await verifierDispatches(root, flowId)).length, 0, "标准缺失：不派质检判定");
      assert.equal(existsSync(path.join(root, "docs", "acceptance", `${flowId}-criteria-v1.md`)), false, "应用不代写 acceptance-criteria");
      const awaitingNotes = () =>
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("awaiting-release-acceptance"));
      assert.equal(awaitingNotes().length, 0, "不再有 awaiting-release-acceptance 提示");
      // Windows 慢速 CI：criteria 账本已落盘时 Lead 系统行可能晚一步可见——有界等待后断言（不放宽原意）。
      await waitFor(
        () => deliveryNotes(harness.events, "liaison").some((note) => note.includes("实施前验收标准缺失")),
        4000,
      );
      assert.ok(
        deliveryNotes(harness.events, "liaison").some((note) => note.includes("实施前验收标准缺失")),
        "Lead 可见阻塞原因",
      );
      // 重复 settle：标准任务不重复派（账本/运行期去重）。
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      harness.controls.get("executor")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "同流程不重复派标准任务");
      // Verifier 写完标准（本轮结束）：让排队中的后续任务可投出。
      harness.controls.get("verifier")?.settle();
      await sleep(100);

      // ② 补齐标准 + 变更包 ⇒ 非发布同样派 Proof 判定（任务带档位/报告路径）。
      writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractSteps(flowId, { criteria: true, change: true })));
      await appendNewContractLedger(root, flowId, { criteria: true, change: true });
      await harness.iface.listProject({ projectRoot: root });
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length > 0, 5000);
      harness.controls.get("verifier")?.settle();
      await sleep(200);
      const verifierSends = harness.sendsByRole.get("verifier") ?? [];
      const judgeMessage = verifierSends[verifierSends.length - 1]!;
      assert.match(judgeMessage, /当前档位：T2/, "判定任务带变更包风险档位");
      assert.match(judgeMessage, new RegExp(`docs/acceptance/${flowId}-report-v1\\.md`), "报告路径进 docs/acceptance");
      assert.equal((await verifierDispatches(root, flowId)).length, 1, "判定派发恰一次（stepId=verification）");
      assert.equal((await criteriaDispatches(root, flowId)).length, 1, "标准任务恰一次（stepId=acceptance-criteria）");

      // ③ flow 不被改写：release 保持缺省、验收步骤保持 pending（应用不代写发布标记/不自动标 done）。
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.flow.release, undefined, "release 保持缺省（应用不代写发布标记）");
        assert.equal(parsed.flow.steps.find((step) => step.kind === "acceptance")?.status, "pending", "acceptance 不自动 done");
      }
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
  ), { release: true }));
  utimesSync(path.join(projectRoot, "docs", "flows", `${flowId}.yaml`), at, at);
}

test("2026-10-20 验收重派：flow YAML 派发后更新 ⇒ 重派 verifier 恰一次（文案注明更新、新账本时间晚于 flow）；未更新不重派", async () => {
  const root = makeTempProjectRoot("ans-acceptance-flow-version-");
  try {
    const flowId = "flow-version";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
    writeFlowStateFile(updatedRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
    writeFlowStateFile(sameRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("验收复核已结束"));
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
      { release: true },
    ),
  );
  utimesSync(path.join(projectRoot, "docs", "flows", `${flowId}.yaml`), at, at);
}

function reworkNotes(events: SessionEventEnvelope[], roleId: string): string[] {
  return deliveryNotes(events, roleId).filter((note) =>
    /返工|acceptance-rework|自动决策|客户拒绝/.test(note),
  );
}

test("2026-10-23 验收返工路由（客户拒绝）：最新 rejected ⇒ 路由 Lead（报告+结构化清单/客户拒绝系统行）、零 Proof 返工、不伪造客户决定；重复触发不重复路由", async () => {
  const root = makeTempProjectRoot("ans-rework-customer-route-");
  try {
    const flowId = "flow-rework-customer";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
      await waitFor(() => (harness.sendsByRole.get("liaison")?.length ?? 0) > 0);
      await sleep(250);
      const leadSends = harness.sendsByRole.get("liaison")!;
      assert.equal(leadSends.length, 1, "最新 rejected ⇒ 恰一条 Lead 返工任务");
      const task = leadSends[0]!;
      assert.match(task, /验收未通过，应用把返工交 [^\n]*（liaison） 组织/);
      assert.match(task, /coordinator 建议：convener；实际接收方：liaison/, "报告建议与实际接收方分离");
      assert.match(task, /来源：客户拒绝（客户手拒）/);
      assert.match(task, new RegExp(reportRel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(task, /id=F1 \| owner=executor \| action=修复交付并补证据 \| evidence=docs\/verification\/f1\.log/);
      assert.match(task, /flow_step_supersede/);
      assert.match(task, /不要.*supersede 保留验收步骤/);
      assert.match(task, /返工完成后由应用按验收门（所有变更，含非发布）自动重派质检/, "返工后由应用按验收门自动重派（release 不是条件）");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "Proof 不接收返工派发");
      assert.equal(completeCalls.length, 0, "rejected ⇒ 不收口");
      // routed 系统行在 record sent 写之后发出：先等它，再断言任务/记录（避免发送可见早于系统行的竞态）。
      await waitFor(() => reworkNotes(harness.events, "liaison").some((note) => note.includes("客户拒绝")));
      const notes = reworkNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes("客户拒绝") && note.includes("实际接收方：liaison")), "Lead 系统行写客户拒绝与实际接收方");
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
      // 不伪造客户决定：账本只多一条既有 dispatch.accepted(app→Lead) 审计（无 stepId）。
      const ledgerAfter = await readGovernanceLedger(root);
      assert.equal(
        ledgerAfter.entries.filter((entry) => entry.kind === "customer.decision").length,
        ledgerBefore.entries.filter((entry) => entry.kind === "customer.decision").length,
        "桌面不写客户决定账本",
      );
      const audit = ledgerAfter.entries.filter(
        (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.targetRoleId === "liaison",
      );
      assert.equal(audit.length, 1, "账本恰一条 app→liaison 审计");
      assert.equal(audit[0]!.actorRoleId, "app");
      assert.equal(audit[0]!.power, "app");
      assert.equal(audit[0]!.stepId, undefined, "审计不带 stepId（不污染验收派发时间口径）");
      // 重复触发（settle/import）⇒ 不重复任务/系统行。
      await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" });
      harness.controls.get("executor")!.settle();
      await harness.iface.listProject({ projectRoot: root });
      await sleep(300);
      assert.equal(harness.sendsByRole.get("liaison")!.length, 1, "同一决定/同一报告不重复路由");
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
      await waitFor(() => (harness.sendsByRole.get("liaison")?.length ?? 0) > 0);
      const verifierSends = harness.sendsByRole.get("verifier")!;
      assert.equal(verifierSends.length, 1, "恰好重派一次 Proof");
      const task = verifierSends[0]!;
      assert.match(task, /流程在上次验收复核后有更新/);
      assert.match(task, new RegExp(`docs/acceptance/${flowId}-report-v2\\.md`), "重派要求写 vN+1");
      assert.ok(task.includes(reportRel), "重派任务引用被拒报告路径（不覆盖）");
      assert.match(task, /acceptance-triage\/v1/, "验收任务含分诊段硬要求（2026-10-25 起取代 acceptance-rework/v1）");
      assert.match(task, /severity/, "验收任务写明四档 severity");
      assert.equal(harness.sendsByRole.get("liaison")!.length, 1, "路由任务恰一条（实际接收方 Lead）");
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
    // flow 先写，rejection 决定在之后（mtime <= decisionAt）⇒ 无进展。release:true 仅元数据（不参与重派判定）。
    writeFlowStateFile(noProgressRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
      await waitFor(() => (harness.sendsByRole.get("liaison")?.length ?? 0) > 0);
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

    // ② 无验收决定：流程齐备 ⇒ 走既有门正常派 verifier（收口/返工路由不介入）；release 仅元数据。
    writeFlowStateFile(noDecisionRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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

test("2026-10-20 delivered 唤醒：无活会话 ⇒ Convener 恰一条核证任务、不向产品落等待核证系统行、无客户卡；同 revision 不刷屏、同集合 revision 变化不重发、新步骤再评估", async () => {
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
      assert.match(sends[0]!, /^\[系统·治理核证\]/, "治理唤醒带系统前缀（渲染侧按 system 行呈现）");
      assert.match(sends[0]!, /integration-e2e 已 delivered（owner=executor）/);
      assert.match(sends[0]!, /verification-evidence 已 delivered/);
      assert.match(sends[0]!, /flow_step_update/, "要求用 flow_step_update 核证");
      assert.match(sends[0]!, /不要直接写 flow YAML/, "禁止直接写 flow YAML");
      // 2026-10-26 客户真机：交付核证只走统筹通道——主理不再落「已 delivered，等待统筹核证」系统行。
      const leadDeliveredNotes = () =>
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("已 delivered，等待运营"));
      assert.equal(leadDeliveredNotes().length, 0, "产品不落等待核证系统行");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "流程未齐备 ⇒ 不派 verifier");
      assert.equal(customerCalls.length, 0, "全程零客户卡");
      // 不伪造 done、不自动改 flow：文件仍是 delivered/pending。
      const unchanged = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
      assert.equal(unchanged.ok, true);
      if (unchanged.ok) {
        assert.equal(unchanged.flow.steps.find((step) => step.id === "integration-e2e")?.status, "delivered", "不伪造 done");
        assert.equal(unchanged.flow.steps.find((step) => step.kind === "acceptance")?.status, "pending", "验收步骤不动");
      }
      // 同一 delivered 集合：重复 settle 不刷屏。
      harness.controls.get("convener")!.settle();
      await sleep(300);
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "同一集合不重复派");
      assert.equal(leadDeliveredNotes().length, 0, "产品始终不落等待核证系统行");
      // 2026-10-26 客户真机修复：delivered 唤醒按 **stepId 已通知集合**去重。同集合仅 revision
      //（title/字节）变化 ⇒ 已通知过的步骤不再重发（真机 01:56:44/50 同一步骤 6 秒内重复的根因）。
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
      await sleep(400);
      assert.equal(harness.sendsByRole.get("convener")!.length, 1, "同集合 revision 变化：已通知步骤不重复派");
      assert.equal(leadDeliveredNotes().length, 0, "同集合 revision 变化：产品仍不落行");
      assert.equal(customerCalls.length, 0, "仍零客户卡");

      // 新 delivered 步骤 ⇒ 重新评估、恰再派一次；第二条只含**本次新步骤**（不重复已通知的两步）。
      writeFlowStateFile(
        root,
        flowId,
        flowStateYaml(flowId, [
          ...deliveredFlowSteps(flowId),
          { id: "verification-evidence-2", kind: "dispatch", status: "delivered", owner: "executor" },
        ]),
      );
      harness.controls.get("convener")!.settle();
      await waitFor(() => (harness.sendsByRole.get("convener")?.length ?? 0) > 1);
      assert.equal(harness.sendsByRole.get("convener")!.length, 2, "新 delivered 步骤再评估（再派一次）");
      const secondSend = harness.sendsByRole.get("convener")![1]!;
      assert.match(secondSend, /verification-evidence-2/, "新步骤在场");
      assert.ok(!secondSend.includes("- 步骤 integration-e2e "), "不重复已通知的 integration-e2e");
      assert.ok(!secondSend.includes("- 步骤 verification-evidence "), "不重复已通知的 verification-evidence（前缀同名不误判）");
      assert.equal(leadDeliveredNotes().length, 0, "产品仍不落行");
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

test("2026-10-26 客户真机：运营忙 ⇒ 多个 delivered 步骤不逐条发；空闲后的下一次检查合并为一条；不向产品双发", async () => {
  const root = makeTempProjectRoot("ans-delivered-wake-merge-");
  try {
    const flowId = "flow-delivered-merge";
    // 初始：无 delivered 步骤（先让统筹进入忙态，期间再来 delivered）。
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, []);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      // 让统筹处于忙态（真实 send 开跑、未 settle）。
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "pi" })).ok, true);
      const convenerSends = (): string[] => harness.sendsByRole.get("convener") ?? [];
      const hold = harness.iface.sendSession({ text: "运营占位轮次", target: { projectRoot: root, roleId: "convener", runtime: "pi" } });
      assert.equal((await hold).ok, true, "占位轮次已投出");
      const baseline = convenerSends().length;
      assert.equal(baseline, 1);

      // 第一条 delivered 出现并触发检查——统筹忙 ⇒ 不发。
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, deliveredFlowSteps(flowId)));
      await harness.iface.listProject({ projectRoot: root });
      await sleep(350);
      assert.equal(convenerSends().length, baseline, "运营忙 ⇒ 第一条 delivered 不投递（不逐条发）");

      // 又一条 delivered（并触发一次检查）——仍忙 ⇒ 也不发，步骤留在待通知集合。
      writeFlowStateFile(
        root,
        flowId,
        flowStateYaml(flowId, [...deliveredFlowSteps(flowId), { id: "verification-evidence-2", kind: "dispatch", status: "delivered", owner: "executor" }]),
      );
      await harness.iface.listProject({ projectRoot: root });
      await sleep(350);
      assert.equal(convenerSends().length, baseline, "运营忙 ⇒ 第二条也不投递");

      // 统筹空闲 ⇒ 下一次验收检查把**全部待核证步骤合并为一条**消息。
      harness.controls.get("convener")!.settle();
      await waitFor(() => convenerSends().length === baseline + 1, 4000);
      const merged = convenerSends()[baseline]!;
      assert.match(merged, /^\[系统·治理核证\]/, "治理唤醒带系统前缀（渲染侧按 system 行呈现）");
      assert.match(merged, /integration-e2e 已 delivered/);
      assert.match(merged, /verification-evidence 已 delivered/);
      assert.match(merged, /verification-evidence-2 已 delivered/);
      assert.equal(convenerSends().length, baseline + 1, "只投一条合并消息（不是每条一步一条）");
      await sleep(200);

      // 交付核证只走统筹通道：主理既不收「等待统筹核证」系统行，也不收 delivered 阶段协调任务。
      assert.equal(
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes("已 delivered，等待运营")).length,
        0,
        "产品不落等待核证系统行",
      );
      assert.ok(
        !(harness.sendsByRole.get("liaison") ?? []).some((text) => text.startsWith("[系统·治理协调]")),
        "delivered 阶段不唤醒产品协调",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 delivered 唤醒去重：按 stepId 已通知集合——同一步骤不重复、A→A+B 只报 B、revision 变化不重发、不同 flow 独立、重启内存清空重发一次", async () => {
  const root = makeTempProjectRoot("ans-delivered-wake-step-dedupe-");
  try {
    const flowId = "flow-delivered-steps";
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    /** 同一 flow 的 delivered 步骤集合（`tag` 只改 title ⇒ 只变 revision、不变集合）。 */
    const writeDelivered = (ids: readonly string[], tag = "", targetFlow = flowId): void => {
      const steps: FlowYamlStepInput[] = [
        ...yamlAcceptanceSteps(targetFlow).filter((step) => step.id !== "delivery-server"),
        ...ids.map((id) => ({ id, kind: "dispatch", status: "delivered", owner: "executor", title: `${id} ${tag}` })),
      ];
      writeFlowStateFile(root, targetFlow, flowStateYaml(targetFlow, steps));
    };
    writeDelivered(["integration-e2e"]);
    await seedGovernanceEvidence(root, flowId, []);
    const h = await makeHarness(root, listing);
    try {
      await waitFor(() => (h.sendsByRole.get("convener")?.length ?? 0) === 1);
      assert.match(h.sendsByRole.get("convener")![0]!, /integration-e2e/);
      assert.ok(!h.sendsByRole.get("convener")![0]!.includes("verification-evidence"));
      // 放行 Convener 本轮（测试桩：settled 才离开 busy；settle 也会触发一次新检查）。
      h.controls.get("convener")!.settle();
      await sleep(150);

      // ① 只改 revision（title），delivered 集合不变 ⇒ 已通知过的步骤不再通知（真机 01:56:44/50 形态）。
      writeDelivered(["integration-e2e"], "v2");
      h.controls.get("convener")!.settle();
      await sleep(400);
      assert.equal(h.sendsByRole.get("convener")!.length, 1, "同一步骤已通知：revision 变化不重发");

      // ② 先通知 A，再 A+B ⇒ 第二条只含 B（不重复已通知过的 A）。
      writeDelivered(["integration-e2e", "verification-evidence"]);
      h.controls.get("convener")!.settle();
      await waitFor(() => (h.sendsByRole.get("convener")?.length ?? 0) === 2);
      const second = h.sendsByRole.get("convener")![1]!;
      assert.match(second, /verification-evidence/, "新 delivered 步骤 B 一定通知");
      assert.ok(!second.includes("integration-e2e"), "第二条只含本次新步骤 B（未重复 A）");
      h.controls.get("convener")!.settle();
      await sleep(150);

      // ③ 同一集合再次 delivered（revision 变化）⇒ 不发第三条。
      writeDelivered(["integration-e2e", "verification-evidence"], "v3");
      h.controls.get("convener")!.settle();
      await sleep(400);
      assert.equal(h.sendsByRole.get("convener")!.length, 2, "同一集合重复 delivered 事件不再通知");

      // ④ 不同 flow 的已通知集合独立：另一个 flow 的 delivered 步骤照常通知。
      const otherFlow = "flow-delivered-other";
      writeDelivered(["integration-e2e"], "", otherFlow);
      h.controls.get("convener")!.settle();
      await waitFor(() => (h.sendsByRole.get("convener")?.length ?? 0) === 3);
      assert.ok(h.sendsByRole.get("convener")![2]!.includes(`流程 ${otherFlow}`), "不同 flow 各自维护已通知集合");
    } finally {
      await h.iface.stopSession();
    }

    // ⑤ 重启语义（内存集合清空）：新的 Interface 实例会把已 delivered 的步骤按当前状态**再通知一次**，
    // 之后仍按新实例的集合去重。通知去重不落盘，进度事实以 flow/账本为准。
    const h2 = await makeHarness(root, listing);
    try {
      await waitFor(() => (h2.sendsByRole.get("convener")?.length ?? 0) >= 1);
      h2.controls.get("convener")?.settle();
      await waitFor(() => (h2.sendsByRole.get("convener") ?? []).some((text) => text.includes(`流程 ${flowId}`)), 5000);
      const afterRestart = h2.sendsByRole.get("convener") ?? [];
      assert.ok(afterRestart.some((text) => text.includes(`流程 ${flowId}`)), "重启后已 delivered 步骤按当前状态再通知一次（内存去重清空）");
      h2.controls.get("convener")?.settle();
      await sleep(400);
      assert.equal(
        afterRestart.filter((text) => text.includes(`流程 ${flowId}`)).length,
        1,
        "重启后的同一实例内仍按 stepId 集合去重（不再重复）",
      );
    } finally {
      await h2.iface.stopSession();
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

    // ② 步骤 done（无 delivered）：不派核证；流程齐备 ⇒ 照常派 verifier 一次（release 仅元数据）。
    writeFlowStateFile(doneRoot, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId), { release: true }));
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
// 2026-10-24 客户修订（所有变更独立验收）：以上门槛不再以 `release` 为门——非发布新契约流程同样派标准/判定。

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
      assert.equal((await verifierDispatches(root, flowId)).length, 0, "标准缺失：不派质检判定");
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
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "变更包缺失：不派质检判定");
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
      ), { release: true }),
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
      ), { release: true }),
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

test("2026-10-23 judge auto-rework：onAutoRework 路由 Lead + 自动决策系统行、零 customer.decision / 零 Proof 返工；flow 更新后重派恰一次", async () => {
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
      await waitFor(() => (harness.sendsByRole.get("liaison")?.length ?? 0) > 0);
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes("自动决策未通过/未完成")));
      assert.equal(harness.sendsByRole.get("liaison")!.length, 1, "judge auto-rework ⇒ 恰一条 Lead 任务");
      const task = harness.sendsByRole.get("liaison")![0]!;
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
        (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.targetRoleId === "liaison",
      );
      assert.equal(audit.length, 1, "账本恰一条 app→liaison 审计");

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
      await waitFor(() => (missing.sendsByRole.get("liaison")?.length ?? 0) > 0);
      // 系统行在发送/record 之后发出：先等到它，再断言任务/记录（避免发送可见早于系统行的竞态）。
      await waitFor(() =>
        deliveryNotes(missing.events, "liaison").some((note) => note.includes("缺少可解析的 acceptance-rework/v1")),
      );
      const task = missing.sendsByRole.get("liaison")![0]!;
      assert.match(task, /结构化返工段缺失或不可解析/);
      assert.match(task, /未生成返工项、未创建流程步骤/);
      assert.match(task, /实际接收方：liaison/, "缺段任务也写明实际接收方（Lead）");
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
      await waitFor(() => (invalid.sendsByRole.get("liaison")?.length ?? 0) > 0);
      const task = invalid.sendsByRole.get("liaison")![0]!;
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
      await waitFor(() => (owners.sendsByRole.get("liaison")?.length ?? 0) > 0);
      const task = owners.sendsByRole.get("liaison")![0]!;
      assert.match(task, /可派发项（按 owner 分组/);
      assert.match(task, /owner=executor：F1（有效项）/);
      assert.match(task, /blocked 项/);
      assert.match(task, /ghost-role/);
      assert.match(task, /id=F12 \| owner=app/);
      assert.match(task, /报告\/工具修正项（owner=verifier/);
      assert.match(task, /不要向质检派产品返工/);
      assert.match(task, /治理文档\/变更包项/);
      assert.match(task, /不要向内置治理角色 dispatch_task/);
      assert.match(task, /实际接收方：liaison/, "实际接收方 = Lead（coordinator 只是建议）");
      // 2026-10-24「所有变更自动验收」：流程完成/返工复核时应用会合法地给 verifier 派验收任务；
      // 原意是「不向 Proof 派**产品返工**」，因此只对**返工语义**的 verifier 任务断言为 0
      // （返工任务含可派发项/报告修正项/逐项 owner 清单与「不要向验收派产品返工」；验收任务不含）。
      const verifierSends = owners.sendsByRole.get("verifier") ?? [];
      const productReworkToVerifier = verifierSends.filter(
        (text) =>
          /可派发项（按 owner 分组/.test(text) ||
          /报告\/工具修正项（owner=verifier/.test(text) ||
          /不要向质检派产品返工/.test(text) ||
          /\bid=[^\s|]+\s*\|\s*owner=/.test(text),
      );
      assert.equal(productReworkToVerifier.length, 0, "不向 Proof 派产品返工（自动验收/返工复核任务不算）");
      assert.ok(
        verifierSends.every((text) => /请汇总证据并出验收卡/.test(text)),
        "verifier 收到的仅是验收/复核任务，不是产品返工",
      );
      assert.equal(owners.sendsByRole.get("liaison")!.length, 1, "Lead 恰一条（不因 verifier/convener owner 再派）");
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
    await waitFor(() => (h1.sendsByRole.get("liaison")?.length ?? 0) > 0);
    await waitFor(() => deliveryNotes(h1.events, "liaison").some((note) => note.includes("客户拒绝")));
    await h1.iface.stopSession();
    const h2 = await makeHarness(restartRoot, restartListing);
    try {
      await sleep(350);
      assert.equal(h2.sendsByRole.get("liaison")?.length ?? 0, 0, "重启后同决定/同报告不重复路由");
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
      await waitFor(() => (audit.sendsByRole.get("liaison")?.length ?? 0) > 0);
      await waitFor(() =>
        deliveryNotes(audit.events, "liaison").some((note) => note.includes("审计记录写入失败")),
      );
      assert.equal(readReworkRoutingRecord(auditRoot, flowId)?.status, "sent", "record sent 不翻转");
      const ledger = await readGovernanceLedger(auditRoot);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "dispatch.accepted" && entry.targetRoleId === "liaison").length,
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
      assert.equal(writeFail.sendsByRole.get("liaison")?.length ?? 0, 0, "record 写失败 ⇒ 不发送");
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
    const failOpenRoles = new Set(["liaison"]);
    const sendFail = await makeHarness(sendFailRoot, sendFailListing, { failOpenRoles });
    try {
      await waitFor(() =>
        deliveryNotes(sendFail.events, "liaison").some((note) => note.includes("返工路由失败")),
      );
      assert.equal(readReworkRoutingRecord(sendFailRoot, flowId)?.status, "failed");
      assert.equal(sendFail.sendsByRole.get("liaison")?.length ?? 0, 0);
      // 修正后下一次真实事件（项目刷新）重试成功。
      failOpenRoles.delete("liaison");
      await sendFail.iface.listProject({ projectRoot: sendFailRoot });
      await waitFor(() => (sendFail.sendsByRole.get("liaison")?.length ?? 0) > 0, 5000);
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

// —————————————— 2026-10-25 request_acceptance（独立复核请求能力） ——————————————
//
// 运行时核心的 `request_acceptance` 工具只路由载荷；应用侧能力（本组）负责：
//   · flowId 归一（显式优先；省略时仅唯一 flow YAML 才采用，多流程不猜）；
//   · flow/验收标准/变更包/riskTier 存在性；`acceptance-criteria` 步骤经编排助手收口；
//   · `parseFlowStateYaml` + `evaluateFlowCompletion` 完整性；运行时解析；
//   · 既有自动验收派发（force/request），并**如实区分** dispatched / already-dispatched / 失败。
// 能力只注入内置治理角色会话（项目角色不注入）；请求复核 ≠ 客户批准。

/** 取出内置治理角色会话捕获到的 requestAcceptance 能力（未注入即失败）。 */
function requestAcceptanceOf(harness: Harness, roleId: string): import("../../src/model/runtime.ts").RequestAcceptanceFn {
  const fn = harness.openInputs.get(roleId)?.requestAcceptance;
  assert.ok(fn, `${roleId} 会话应注入 requestAcceptance`);
  return fn;
}

/** 新契约流程，但把 `acceptance-criteria` 步骤替换为指定状态（用于收口调用/跳过断言）。 */
function newContractStepsWithCriteriaStatus(flowId: string, status: string): FlowYamlStepInput[] {
  return newContractSteps(flowId, { criteria: false, change: true }).flatMap((step) =>
    step.id === "delivery-server"
      ? [{ id: "acceptance-criteria", kind: "artifact", status, owner: "verifier" }, step]
      : [step],
  );
}

test("2026-10-25 request_acceptance：flowId 归一——唯一 YAML 采用；多流程/无流程要求显式 flowId（不猜）", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-normalize-");
  try {
    writeFlowStateFile(root, "flow-only", flowStateYaml("flow-only", yamlAcceptanceSteps("flow-only")));
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestAcceptance = requestAcceptanceOf(harness, "convener");

      // 唯一 YAML ⇒ 采用它（本用例标准缺失，code=criteria-missing 但 flowId 已归一）。
      const single = await requestAcceptance({});
      assert.equal(single.ok, false);
      assert.equal(single.code, "criteria-missing");
      assert.equal(single.flowId, "flow-only", "唯一 flow YAML 被采用");

      // 第二个 YAML ⇒ 不猜，要求显式 flowId。
      writeFlowStateFile(root, "flow-second", flowStateYaml("flow-second", yamlAcceptanceSteps("flow-second")));
      const multi = await requestAcceptance({});
      assert.equal(multi.ok, false);
      assert.equal(multi.code, "flow-not-found");
      assert.match(multi.message, /指定 flowId/);
      assert.ok(multi.message.includes("flow-only") && multi.message.includes("flow-second"), "消息列出候选流程");

      // 显式 flowId：不存在/非法 slug 均如实 flow-not-found。
      const missing = await requestAcceptance({ flowId: "no-such-flow" });
      assert.equal(missing.code, "flow-not-found");
      assert.equal(missing.flowId, "no-such-flow");
      const illegal = await requestAcceptance({ flowId: "../escape" });
      assert.equal(illegal.code, "flow-not-found");

      // 无 YAML ⇒ flow-not-found（提示要求指定 flowId）。
      rmSync(path.join(root, "docs", "flows"), { recursive: true, force: true });
      const none = await requestAcceptance({});
      assert.equal(none.code, "flow-not-found");
      assert.match(none.message, /没有流程 YAML/);
      assert.match(none.message, /指定 flowId/);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-25 request_acceptance：失败 code 映射（criteria-missing / change-package-missing / no-risk / flow-incomplete / runtime-unresolved）", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-codes-");
  try {
    const flowId = "flow-request-map";
    // 执行步骤 delivery-server 先保持 pending：标准/变更包齐备后由完整性门给出 flow-incomplete。
    const pendingSteps = yamlAcceptanceSteps(flowId).map((step) =>
      step.id === "delivery-server" ? { ...step, status: "pending", evidence: undefined } : step,
    );
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, pendingSteps));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root }, {
      resolveRuntime: async () => ({ ok: false, message: "无法确定项目引擎（测试）；本次自动验收派发已跳过。", skipped: [] }),
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestAcceptance = requestAcceptanceOf(harness, "convener");

      const missingCriteria = await requestAcceptance({ flowId });
      assert.equal(missingCriteria.ok, false);
      assert.equal(missingCriteria.code, "criteria-missing");
      assert.ok(missingCriteria.message.includes(`docs/acceptance/${flowId}-criteria-v1.md`));

      writeNewContractEvidenceFiles(root, flowId, { criteria: true });
      const missingChange = await requestAcceptance({ flowId });
      assert.equal(missingChange.code, "change-package-missing");
      assert.ok(missingChange.message.includes(`docs/scheduling/${flowId}-change-v1.md`));

      writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "no-risk" });
      const noRisk = await requestAcceptance({ flowId });
      assert.equal(noRisk.code, "change-package-no-risk");
      assert.ok(noRisk.message.includes(`${flowId}-change-v1.md`));

      writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
      const incomplete = await requestAcceptance({ flowId });
      assert.equal(incomplete.code, "flow-incomplete");
      assert.match(incomplete.message, /delivery-server/, "message 含具体未完成步骤");

      // 完成流程（同一账本）⇒ 运行时解析失败如实映射（不派发）。
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
      const unresolved = await requestAcceptance({ flowId });
      assert.equal(unresolved.code, "runtime-unresolved");
      assert.match(unresolved.message, /无法确定项目引擎（测试）/);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "运行时未解析：不派发");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-25 request_acceptance：acceptance-criteria pending ⇒ 经编排助手收口后继续；已 done ⇒ 不重复调用（幂等）", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-criteria-step-");
  try {
    const flowId = "flow-request-criteria";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractStepsWithCriteriaStatus(flowId, "pending")));
    writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
    await appendNewContractLedger(root, flowId, { criteria: false, change: true });
    const calls: Array<{ projectRoot: string; flowId: string }> = [];
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root }, {
      completeAcceptanceCriteriaStep: async (input) => {
        calls.push({ projectRoot: input.projectRoot, flowId: input.flowId });
        return completeAcceptanceCriteriaStep(input);
      },
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestAcceptance = requestAcceptanceOf(harness, "convener");
      const result = await requestAcceptance({ flowId });
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, "dispatched");
      assert.deepEqual(calls, [{ projectRoot: root, flowId }], "标准步骤 pending ⇒ 调用一次编排收口助手");
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
      assert.ok(parsed.ok);
      assert.equal(parsed.flow.steps.find((step) => step.id === "acceptance-criteria")?.status, "done", "收口后步骤为 done");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 1, "收口后继续派发验收复核");
    } finally {
      await harness.iface.stopSession();
    }

    // 已 done：不调用收口助手，直接继续派发（幂等）。
    const doneFlowId = "flow-request-criteria-done";
    let doneCalls = 0;
    const doneHarness = await makeHarness(root, { ...trioListing(), projectRoot: root }, {
      completeAcceptanceCriteriaStep: async (input) => {
        doneCalls += 1;
        return completeAcceptanceCriteriaStep(input);
      },
    });
    try {
      // 夹具在 harness 初始化（含导入补齐检查）**之后**落盘：本用例只验证 request_acceptance 路径，
      // 避免 listProject 的 40ms 合并检查在并行负载下抢先自动派发 verifier（既有门禁语义不变）。
      await sleep(150);
      writeFlowStateFile(root, doneFlowId, flowStateYaml(doneFlowId, newContractSteps(doneFlowId, { criteria: true, change: true })));
      writeNewContractEvidenceFiles(root, doneFlowId, { criteria: true, change: "T2" });
      await appendNewContractLedger(root, doneFlowId, { criteria: true, change: true });
      assert.equal((await doneHarness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const result = await requestAcceptanceOf(doneHarness, "convener")({ flowId: doneFlowId });
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, "dispatched");
      assert.equal(doneCalls, 0, "acceptance-criteria 已 done：不重复调用收口助手");
    } finally {
      await doneHarness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-25 request_acceptance：收口助手失败按 code 映射（criteria-missing / flow-incomplete）且 message 原样带出", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-criteria-fail-");
  try {
    const writePendingCriteriaFlow = (flowId: string): void => {
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractStepsWithCriteriaStatus(flowId, "pending")));
      writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
    };
    writePendingCriteriaFlow("flow-request-criteria-missing");
    writePendingCriteriaFlow("flow-request-criteria-terminal");
    await appendNewContractLedger(root, "flow-request-criteria-missing", { criteria: false, change: true });
    await appendNewContractLedger(root, "flow-request-criteria-terminal", { criteria: false, change: true });
    let mode: "missing" | "terminal" = "missing";
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root }, {
      completeAcceptanceCriteriaStep: async () => {
        if (mode === "missing") {
          return { ok: false, code: "acceptance-criteria-missing", error: "标准缺失（测试）" };
        }
        return { ok: false, code: "acceptance-criteria-step-terminal", error: "步骤终态（测试）" };
      },
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestAcceptance = requestAcceptanceOf(harness, "convener");
      const missing = await requestAcceptance({ flowId: "flow-request-criteria-missing" });
      assert.equal(missing.code, "criteria-missing");
      assert.equal(missing.message, "标准缺失（测试）", "message 原样带出");
      mode = "terminal";
      const terminal = await requestAcceptance({ flowId: "flow-request-criteria-terminal" });
      assert.equal(terminal.code, "flow-incomplete");
      assert.equal(terminal.message, "步骤终态（测试）", "message 原样带出");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-25 request_acceptance：派发回执区分 dispatched 与 already-dispatched（同 flow 同版本不重复派）", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-dispatch-");
  try {
    const flowId = "flow-request-dispatch";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractSteps(flowId, { criteria: true, change: true })));
    writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
    await appendNewContractLedger(root, flowId, { criteria: true, change: true });
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestAcceptance = requestAcceptanceOf(harness, "convener");
      const first = await requestAcceptance({ flowId });
      assert.equal(first.ok, true, first.message);
      assert.equal(first.code, "dispatched");
      assert.equal(first.flowId, flowId);
      assert.equal(first.runtime, "pi");
      assert.match(first.message, /不代表客户批准/);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 1, "派发恰一条验收任务");

      const second = await requestAcceptance({ flowId });
      assert.equal(second.ok, false, "重复请求不得说成 dispatched");
      assert.equal(second.code, "already-dispatched");
      assert.equal(second.flowId, flowId);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 1, "已派发版本不重复派发");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-25 request_acceptance：注入矩阵——内置治理角色有、项目角色无", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-injection-");
  try {
    const listing: ProjectListing = {
      ...listingWithProjectRoles(trioListing(), ["executor"]),
      projectRoot: root,
    };
    const harness = await makeHarness(root, listing);
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      assert.equal(typeof harness.openInputs.get("convener")?.requestAcceptance, "function", "内置治理角色注入能力");
      assert.equal(harness.openInputs.get("executor")?.requestAcceptance, undefined, "项目角色不注入能力");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-25 request_acceptance：flow_step_update 成功（尤其 done）触发验收门重检；失败调用不触发", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-flow-step-trigger-");
  try {
    const flowId = "flow-request-trigger";
    // 先让流程未完成：导入时的补齐检查会跑一次但不会派发；等它结束后再验证「事件触发」本身。
    const pendingSteps = newContractSteps(flowId, { criteria: true, change: true }).map((step) =>
      step.id === "delivery-server" ? { ...step, status: "pending", evidence: undefined } : step,
    );
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, pendingSteps));
    writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
    await appendNewContractLedger(root, flowId, { criteria: true, change: true });
    const listing: ProjectListing = {
      ...listingWithProjectRoles(trioListing(), ["executor"]),
      projectRoot: root,
    };
    const harness = await makeHarness(root, listing);
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "demo" })).ok, true);
      // 导入补齐检查（40ms tick）已跑到完整性门并落 Lead 阻塞行 ⇒ 它不会再派 verifier。
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes("delivery-server")));
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "未完成流程不派发");
      const control = harness.controls.get("executor")!;
      // 失败/开始类事件不算推进信号。
      control.emit({
        kind: "denied",
        summary: "flow_step_update 失败",
        detail: { toolName: "flow_step_update", phase: "result", ok: false },
      } as SessionEvent);
      control.emit({
        kind: "tool_call",
        summary: "模型请求调用 flow_step_update",
        detail: { toolName: "flow_step_update", phase: "start" },
      } as SessionEvent);
      await sleep(220);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "失败/开始事件不触发验收检查");

      // 流程补全后，一次成功的 flow_step_update ⇒ 经既有 40ms 有界调度重检并派发（门已满足）。
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractSteps(flowId, { criteria: true, change: true })));
      control.emit({
        kind: "accepted",
        summary: "flow_step_update 执行完成",
        detail: { toolName: "flow_step_update", phase: "result", ok: true },
      } as SessionEvent);
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 1, "成功后触发一次验收派发（不循环）");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————— 2026-10-25 验收分诊（acceptance-triage） ——————————————
//
// 设计 `2026-10-25_design_acceptance-triage.md`：trio + YAML + acceptance 卡 + fail/conditional ⇒
// 确定性建议 +（「替我决策」开且权威）judge-rule 自动处置 / 否则客户分诊卡；缺结构退回 Proof；
// pass 不分诊；记录 `.ans/.../triage-v1.json` 幂等；账本 `acceptance.triage` 不是 customer.decision。

interface TriageItemInput {
  id?: string;
  severity?: string;
  owner?: string;
  reason?: string;
  action?: string;
  targets?: string[];
  criteria?: string;
}

/** 合成一份带 `acceptance-triage/v1` 段的报告。 */
function triageReportBody(options: {
  conclusion?: "pass" | "fail" | "conditional";
  items?: TriageItemInput[];
  extra?: string[];
} = {}): string {
  const conclusion = options.conclusion ?? "fail";
  const items = options.items ?? [];
  const yaml: string[] = ["schema: acceptance-triage/v1", `conclusion: ${conclusion}`];
  if (items.length === 0) {
    yaml.push("items: []");
  } else {
    yaml.push("items:");
    for (const item of items) {
      yaml.push(`  - id: ${item.id ?? "F1"}`);
      yaml.push(`    severity: ${item.severity ?? "blocker"}`);
      yaml.push(`    owner: ${item.owner ?? "executor"}`);
      yaml.push(`    reason: ${JSON.stringify(item.reason ?? "测试失败原因")}`);
      yaml.push(`    action: ${JSON.stringify(item.action ?? "修复测试失败并补证据")}`);
      if (item.targets !== undefined) yaml.push(`    targets: [${item.targets.join(", ")}]`);
      if (item.criteria !== undefined) yaml.push(`    criteria: ${JSON.stringify(item.criteria)}`);
    }
  }
  return ["# 验收报告", "", ...(options.extra ?? []), "", "```yaml", ...yaml, "```", ""].join("\n");
}

function triageFacts(root: string, flowId: string): AcceptanceTriageGateFacts {
  return {
    requestId: "op-triage-test",
    roleId: "verifier",
    projectRoot: root,
    runtime: "pi",
    request: {
      kind: "choice",
      title: "验收",
      cardKind: "acceptance",
      flowId,
      stepId: "verification",
      options: [
        { id: "accept", label: "通过" },
        { id: "reject", label: "退回" },
      ],
    },
    metadata: {
      flowId,
      stepId: "verification",
      cardKind: "acceptance",
      judgeContext: {
        flowId,
        facts: { governanceModel: "trio", flowId, ledgerErrors: 0, unresolvedClarificationCount: 0, latestDecisionKinds: [] },
      },
    },
    governanceModel: "trio",
  };
}

async function enableDecisionJudge(harness: Harness): Promise<void> {
  const reply = harness.iface.setDecisionJudgeEnabled({ enabled: true });
  assert.equal(reply.ok, true, `决策开关应可开启：${reply.ok ? "" : reply.error}`);
}

async function runSettleRun(result: Awaited<ReturnType<Harness["iface"]["evaluateAcceptanceTriage"]>>): Promise<void> {
  assert.equal(result.action, "settle");
  if (result.action !== "settle") return;
  assert.equal(result.outcome.outcome, "declined");
  assert.equal(result.outcome.outcome === "declined" ? result.outcome.notPresented : undefined, true, "退回/自动处置不得呈现验收卡");
  if (result.run !== undefined) await result.run();
}

test("验收分诊：报告缺 acceptance-triage/v1 ⇒ declined+notPresented 退回 Proof；不弹卡/不返工/不写 customer.decision", async () => {
  const root = makeTempProjectRoot("ans-triage-missing-");
  try {
    const flowId = "flow-triage-missing";
    // 流程故意留 pending（不触发自动验收派发）——本用例只测分诊前闸。
    const pendingSteps = yamlAcceptanceSteps(flowId).map((step) =>
      step.id === "delivery-server" ? { ...step, status: "pending", evidence: undefined } : step,
    );
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, pendingSteps));
    const reportRel = writeAcceptanceReportFile(root, flowId, 1, "# 验收报告\n\n没有结构化分诊段。\n");
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root });
    try {
      const result = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      assert.equal(result.action, "settle");
      if (result.action !== "settle") return;
      assert.equal(result.outcome.outcome, "declined");
      assert.equal(result.outcome.outcome === "declined" ? result.outcome.notPresented : undefined, true);
      assert.match(result.outcome.outcome === "declined" ? result.outcome.reason ?? "" : "", /退回|分诊结构/);
      const read = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(read.record?.status, "returned-to-verifier");
      assert.equal(read.record?.parseFailure, "missing");
      assert.equal(read.record?.reportSha256, null, "无分诊结构不伪造报告 sha");
      assert.equal(read.record?.reportPath, reportRel);
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false, "退回不写客户决定");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "不派 Proof");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊：pass 报告不分诊（proceed，不写 triage 记录）", async () => {
  const root = makeTempProjectRoot("ans-triage-pass-");
  try {
    const flowId = "flow-triage-pass";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(root, flowId, 1, triageReportBody({ conclusion: "pass", items: [] }));
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root });
    try {
      const result = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      assert.equal(result.action, "proceed");
      const read = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(read.record, undefined, "pass 不写分诊记录");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊：只有 minor/nit ⇒ judge-rule 自动仅汇报（report-only），产品确定性汇报，账本不污染 latestAcceptanceDecision", async () => {
  const root = makeTempProjectRoot("ans-triage-report-only-");
  try {
    const flowId = "flow-triage-report-only";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      triageReportBody({
        conclusion: "fail",
        items: [
          { id: "F1", severity: "nit", owner: "executor", reason: "命名风格不统一", action: "统一命名", targets: ["src/a.ts"] },
          { id: "F2", severity: "minor", owner: "executor", reason: "注释缺失", action: "补注释", criteria: "docs/acceptance/x-criteria-v1.md#C3" },
        ],
      }),
    );
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root });
    try {
      await enableDecisionJudge(harness);
      const result = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      await runSettleRun(result);
      const read = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(read.record?.status, "report-only");
      assert.equal(read.record?.disposition, "report-only");
      assert.equal(read.record?.source, "judge");
      assert.equal(read.record?.sourceDetail, "judge-rule");
      assert.equal(read.record?.reportedAt !== null, true, "汇报后记录 reportedAt");
      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes("验收结论：不通过")), "产品汇报含结论");
      assert.ok(notes.some((note) => note.includes("F1") && note.includes("风格建议") && note.includes("命名风格不统一")), "逐项 severity/reason");
      assert.ok(notes.some((note) => note.includes("改进建议：统一命名")), "逐项 action+指针");
      assert.ok(notes.some((note) => note.includes("本次不返工") && note.includes("判断代批")), "决定来源");
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false, "判断代批不写 customer.decision");
      assert.equal(ledger.entries.filter((entry) => entry.kind === "acceptance.triage").length, 1);
      assert.equal(latestAcceptanceDecision(flowId, ledger).kind, "none", "acceptance.triage 不参与 latestAcceptanceDecision");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "仅汇报不派 Proof");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊：blocker/major 可执行 ⇒ judge-rule 自动返工（任务含 severity/reason/action，minor/nit 非阻断；不写客户决定）", async () => {
  const root = makeTempProjectRoot("ans-triage-rework-");
  try {
    const flowId = "flow-triage-rework";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      triageReportBody({
        conclusion: "fail",
        items: [
          { id: "F1", severity: "blocker", owner: "executor", reason: "入口不可用", action: "修复启动入口", targets: ["src/main.ts"] },
          { id: "F2", severity: "major", owner: "executor", reason: "契约不符", action: "按 criteria 修正", criteria: "docs/acceptance/x-criteria-v1.md#C1" },
          { id: "F3", severity: "nit", owner: "executor", reason: "措辞偏好", action: "统一措辞", targets: ["docs/readme.md"] },
        ],
      }),
    );
    const listing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      await enableDecisionJudge(harness);
      const first = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      await runSettleRun(first);
      const read = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(read.record?.status, "dispatched");
      assert.equal(read.record?.disposition, "rework");
      assert.equal(read.record?.source, "judge");
      assert.equal(read.record?.sourceDetail, "judge-rule");
      const routingPath = path.join(root, ".ans", "governance", "acceptance", flowId, "rework-routing.json");
      assert.equal(existsSync(routingPath), true, "写返工路由记录");
      const routing = JSON.parse(readFileSync(routingPath, "utf8")) as { status: string; source: string; sourceDetail: string };
      assert.equal(routing.status, "sent");
      assert.equal(routing.source, "judge");
      assert.equal(routing.sourceDetail, "judge-rule");
      const tasks = harness.sendsByRole.get("liaison") ?? [];
      assert.equal(tasks.length, 1, "唯一一条运营任务");
      const task = tasks[0]!;
      assert.match(task, /severity=blocker/);
      assert.match(task, /reason=入口不可用/);
      assert.match(task, /action=修复启动入口/);
      assert.match(task, /criteria=docs\/acceptance\/x-criteria-v1\.md#C1/);
      assert.match(task, /severity=nit（非阻断，可选后续）/);
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision"), false, "judge-rule 不写客户决定");
      assert.equal(ledger.entries.filter((entry) => entry.kind === "acceptance.triage").length, 1);
      assert.equal(latestAcceptanceDecision(flowId, ledger).kind, "none");
      // 幂等：同一报告再次到达 ⇒ 只结算，不再路由、不重复任务。
      const second = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      assert.equal(second.action, "settle");
      assert.equal((harness.sendsByRole.get("liaison") ?? []).length, 1, "同报告不重复派工");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊：blocker/major 不可执行（owner 未知）⇒ 退回 Proof 补报告（R4，不弹卡）", async () => {
  const root = makeTempProjectRoot("ans-triage-infeasible-");
  try {
    const flowId = "flow-triage-infeasible";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      triageReportBody({
        items: [{ id: "F1", severity: "blocker", owner: "ghost-role", reason: "关键问题", action: "修复", targets: ["src/x.ts"] }],
      }),
    );
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root });
    try {
      await enableDecisionJudge(harness);
      const result = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      await runSettleRun(result);
      const read = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(read.record?.status, "returned-to-verifier");
      assert.equal(read.record?.parseFailure, null);
      assert.equal(read.record?.recommendation, "return-to-verifier");
      assert.equal(read.record?.recommendationBasis, "blocker-major-infeasible");
      assert.equal((harness.sendsByRole.get("liaison") ?? []).length, 0, "不派返工任务");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊客户卡：结论/失败项/改进方案/建议/警示 + 仅汇报映射为 accepted 但带 triage 归因", async () => {
  const root = makeTempProjectRoot("ans-triage-customer-card-");
  try {
    const flowId = "flow-triage-customer";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      triageReportBody({
        items: [{ id: "F1", severity: "blocker", owner: "executor", reason: "入口不可用", action: "修复入口", targets: ["src/main.ts"] }],
      }),
    );
    const listing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      const result = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      assert.equal(result.action, "triage-card");
      if (result.action !== "triage-card") return;
      assert.match(result.card.id, new RegExp(`^triage-${flowId}-[a-f0-9]{8}$`));
      assert.match(result.card.preview ?? "", /验收结论：不通过/);
      assert.match(result.card.preview ?? "", /F1 · 阻断：入口不可用/);
      assert.match(result.card.preview ?? "", /改进建议：修复入口/);
      assert.match(result.card.preview ?? "", /建议下发运营修改/);
      assert.match(result.card.preview ?? "", /报告含阻断项，仅汇报将不修复/);
      assert.deepEqual(result.card.options.map((option) => option.id), ["rework", "report-only"]);
      const awaiting = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(awaiting.record?.status, "awaiting-decision");
      assert.equal(result.card.id, awaiting.record?.triageId);
      const answered = await result.onAnswer({ outcome: "answered", selected: ["report-only"] });
      assert.equal(answered.settlement?.outcome, "answered");
      assert.deepEqual(answered.settlement?.outcome === "answered" ? answered.settlement.value.selected : [], ["accept"]);
      const triage = answered.settlement?.triage;
      assert.equal(triage?.disposition, "report-only");
      assert.equal(triage?.source, "customer");
      assert.equal(triage?.conclusion, "fail");
      if (answered.run !== undefined) await answered.run();
      const decided = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(decided.record?.status, "report-only");
      assert.equal(decided.record?.source, "customer");
      assert.equal(decided.record?.sourceDetail, "triage-customer");
      const ledger = await readGovernanceLedger(root);
      const audit = ledger.entries.filter((entry) => entry.kind === "acceptance.triage");
      assert.equal(audit.length, 1);
      assert.equal(audit[0]?.acceptanceTriage?.source, "customer");
      assert.equal(audit[0]?.acceptanceTriage?.disposition, "report-only");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊客户卡：下发运营修改映射为 reject 结算 + 客户来源返工路由", async () => {
  const root = makeTempProjectRoot("ans-triage-customer-rework-");
  try {
    const flowId = "flow-triage-customer-rework";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      triageReportBody({
        items: [{ id: "F1", severity: "major", owner: "executor", reason: "关键功能缺失", action: "补齐功能", targets: ["src/feature.ts"] }],
      }),
    );
    const listing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      const result = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      assert.equal(result.action, "triage-card");
      if (result.action !== "triage-card") return;
      const answered = await result.onAnswer({ outcome: "answered", selected: ["rework"] });
      assert.equal(answered.settlement?.outcome, "answered");
      assert.deepEqual(answered.settlement?.outcome === "answered" ? answered.settlement.value.selected : [], ["reject"]);
      assert.equal(answered.settlement?.triage?.disposition, "rework");
      if (answered.run !== undefined) await answered.run();
      const routingPath = path.join(root, ".ans", "governance", "acceptance", flowId, "rework-routing.json");
      assert.equal(existsSync(routingPath), true);
      const routing = JSON.parse(readFileSync(routingPath, "utf8")) as { status: string; source: string; sourceDetail: string };
      assert.equal(routing.status, "sent");
      assert.equal(routing.source, "customer");
      assert.equal(routing.sourceDetail, "triage-customer");
      assert.equal((harness.sendsByRole.get("liaison") ?? []).length, 1);
      const decided = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(decided.record?.status, "dispatched");
      assert.equal(decided.record?.source, "customer");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊通道：分诊卡替换验收卡（稳定 id）；gate settle 不呈现卡片", async () => {
  const presented: Array<{ id: string; request: { kind: string } }> = [];
  let ran = false;
  const channel = createCustomerInputChannel({
    presenter: (payload) => presented.push(payload as unknown as { id: string; request: { kind: string } }),
    operatorId: "customer-1",
    acceptanceTriage: () => ({
      action: "triage-card",
      card: {
        id: "triage-flow-abcdef12",
        roleId: "liaison",
        title: "验收分诊 · flow",
        question: "如何处理？",
        options: [
          { id: "rework", label: "下发运营修改" },
          { id: "report-only", label: "仅汇报不返工" },
        ],
      },
      onAnswer: () => ({
        settlement: {
          outcome: "answered",
          value: { selected: ["accept"] },
          triage: { disposition: "report-only", source: "customer", conclusion: "fail", triageId: "triage-flow-abcdef12" },
        },
        run: () => {
          ran = true;
        },
      }),
    }),
  });
  const acceptanceRequest = {
    kind: "choice" as const,
    title: "验收",
    cardKind: "acceptance" as const,
    flowId: "flow",
    options: [
      { id: "accept", label: "通过" },
      { id: "reject", label: "退回" },
    ],
  };
  const pending = channel.customerInput(acceptanceRequest, { roleId: "verifier", projectRoot: "/p", governanceModel: "trio" });
  await waitFor(() => presented.length === 1);
  assert.equal(presented[0]?.id, "triage-flow-abcdef12", "呈现的是分诊卡而非验收卡");
  assert.equal(presented[0]?.request.kind, "choice");
  const reply = channel.respond({ id: "triage-flow-abcdef12", decision: { kind: "choice", selected: ["report-only"] } });
  assert.equal(reply.ok, true);
  const outcome = await pending;
  assert.ok(outcome);
  assert.equal(outcome.outcome, "answered");
  assert.equal(outcome.outcome === "answered" ? outcome.triage?.disposition : undefined, "report-only");
  await waitFor(() => ran);
  channel.rejectAllPending("done");

  const presentedSettle: unknown[] = [];
  const channelSettle = createCustomerInputChannel({
    presenter: (payload) => presentedSettle.push(payload),
    operatorId: "customer-1",
    acceptanceTriage: () => ({
      action: "settle",
      outcome: { outcome: "declined", notPresented: true, reason: "报告缺少分诊结构，已退回补报告" },
    }),
  });
  const settled = await channelSettle.customerInput(acceptanceRequest, { roleId: "verifier", projectRoot: "/p", governanceModel: "trio" });
  assert.ok(settled);
  assert.equal(settled.outcome, "declined");
  assert.equal(settled.outcome === "declined" ? settled.notPresented : undefined, true);
  assert.equal(presentedSettle.length, 0, "退回不呈现验收卡");
  channelSettle.rejectAllPending("done");
});

test("验收分诊 T3 回归：客户选「下发运营修改」后旧 latest-rejected 路由不得抢跑——恰一条 triage 任务（有 severity/reason，来源 triage-customer）", async () => {
  const root = makeTempProjectRoot("ans-triage-t3-race-");
  try {
    const flowId = "flow-triage-t3";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      triageReportBody({
        items: [
          { id: "F1", severity: "blocker", owner: "executor", reason: "入口不可用", action: "修复入口", targets: ["src/main.ts"] },
          { id: "F2", severity: "nit", owner: "executor", reason: "措辞偏好", action: "统一措辞", targets: ["docs/readme.md"] },
        ],
      }),
    );
    const listing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      // 1) 客户在分诊卡选「下发统筹修改」：onAnswer 先落 triage 承接记录，再返回 reject 结算。
      const result = await harness.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      assert.equal(result.action, "triage-card");
      if (result.action !== "triage-card") return;
      const answered = await result.onAnswer({ outcome: "answered", selected: ["rework"] });
      assert.equal(answered.settlement?.outcome, "answered");
      assert.deepEqual(answered.settlement?.outcome === "answered" ? answered.settlement.value.selected : [], ["reject"]);
      const claimed = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(claimed.record?.status, "failed");
      assert.equal(claimed.record?.disposition, "rework");
      assert.equal(claimed.record?.sourceDetail, "triage-customer");
      // 2) 模拟编排把客户结算写入账本（run-role recordCustomerDecision 的异步效果）。
      await appendLedger(root, [
        {
          kind: "customer.decision",
          flowId,
          decisionKind: "acceptance",
          customerDecision: "rejected",
          actorRoleId: "verifier",
          power: "acceptance",
          decisionEvidence: { kind: "customer-input" },
        },
      ]);
      // 3) 旧触发面（导入/任意 settle 的有界验收检查）先到：必须认领 triage，而不是发旧格式任务。
      await harness.iface.listProject({ projectRoot: root });
      await waitFor(() => (harness.sendsByRole.get("liaison")?.length ?? 0) > 0, 5000);
      await sleep(250); // 观察窗：不得出现第二条任务
      const tasks = harness.sendsByRole.get("liaison") ?? [];
      assert.equal(tasks.length, 1, "恰一条返工任务（旧 latest-rejected 路由不得抢跑）");
      const task = tasks[0]!;
      assert.match(task, /severity=blocker/, "任务带 triage severity");
      assert.match(task, /reason=入口不可用/);
      assert.match(task, /action=修复入口/);
      assert.match(task, /验收分诊判断代批|客户验收分诊选择|客户在验收分诊卡/, "来源措辞为分诊，不是客户手拒");
      assert.doesNotMatch(task, /客户拒绝（客户手拒）/, "旧格式来源文案不得出现");
      const routing = JSON.parse(
        readFileSync(path.join(root, ".ans", "governance", "acceptance", flowId, "rework-routing.json"), "utf8"),
      ) as { status: string; source: string; sourceDetail: string };
      assert.equal(routing.status, "sent");
      assert.equal(routing.source, "customer");
      assert.equal(routing.sourceDetail, "triage-customer");
      // 4) 客户作答的 run() 随后执行：按同一身份去重，不重复发任务。
      if (answered.run !== undefined) await answered.run();
      await sleep(150);
      assert.equal((harness.sendsByRole.get("liaison") ?? []).length, 1, "run() 去重后仍恰一条任务");
      const decided = await readAcceptanceTriageRecord(root, flowId);
      assert.equal(decided.record?.status, "dispatched");
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.filter((entry) => entry.kind === "acceptance.triage").length, 1, "账本分诊审计恰一条");
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "customer.decision" && entry.decisionKind === "acceptance").length,
        1,
        "customer.decision 恰一条（分诊卡结算）",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊恢复：awaiting-decision 重启重推同一张卡（稳定 id，只推一次）", async () => {
  const root = makeTempProjectRoot("ans-triage-recovery-");
  try {
    const flowId = "flow-triage-recovery";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    writeAcceptanceReportFile(
      root,
      flowId,
      1,
      triageReportBody({
        items: [{ id: "F1", severity: "blocker", owner: "executor", reason: "入口不可用", action: "修复入口", targets: ["src/main.ts"] }],
      }),
    );
    const listing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const first = await makeHarness(root, listing);
    try {
      const result = await first.iface.evaluateAcceptanceTriage(triageFacts(root, flowId));
      assert.equal(result.action, "triage-card");
    } finally {
      await first.iface.stopSession();
    }
    const pushed: Array<{ id: string }> = [];
    const second = await makeHarness(root, listing, {
      presentAcceptanceTriageCard: (card) => {
        pushed.push(card);
        return { ok: true };
      },
    });
    try {
      await waitFor(() => pushed.length === 1);
      assert.match(pushed[0]!.id, new RegExp(`^triage-${flowId}-[a-f0-9]{8}$`));
      await second.iface.listProject({ projectRoot: root });
      await sleep(150);
      assert.equal(pushed.length, 1, "同一进程/同一项目不重复重推");
    } finally {
      await second.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收分诊：report-only 同 sha 抑制重派；新报告 sha 允许新一轮验收", async () => {
  const root = makeTempProjectRoot("ans-triage-suppress-");
  try {
    const flowId = "flow-triage-suppress";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, yamlAcceptanceSteps(flowId)));
    await seedGovernanceEvidence(root, flowId, ["delivery-server"]);
    const body = triageReportBody({ items: [{ id: "F1", severity: "nit", owner: "executor", reason: "风格", action: "统一", targets: ["src/a.ts"] }] });
    const reportRel = writeAcceptanceReportFile(root, flowId, 1, body);
    const parsed = parseAcceptanceTriageReport(body);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const recommendation = recommendAcceptanceTriage(parsed.triage);
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(readFileSync(path.join(root, ...reportRel.split("/")))).digest("hex");
    const record = buildAcceptanceTriageRecord({
      flowId,
      reportPath: reportRel,
      reportVersion: 1,
      reportSha256: sha,
      triage: parsed.triage,
      recommendation,
      status: "report-only",
      disposition: "report-only",
      source: "judge",
      sourceDetail: "judge-rule",
      decidedAt: new Date().toISOString(),
      reportedAt: new Date().toISOString(),
    });
    const written = await writeAcceptanceTriageRecord(root, record);
    assert.equal(written.ok, true);
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root });
    try {
      await sleep(200);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "同 sha report-only 不派 Proof");
      // 新报告（新 sha）⇒ 允许新一轮验收派发。
      writeAcceptanceReportFile(
        root,
        flowId,
        2,
        triageReportBody({ conclusion: "fail", items: [{ id: "N1", severity: "major", owner: "executor", reason: "新问题", action: "修复新问题", targets: ["src/b.ts"] }] }),
      );
      await harness.iface.listProject({ projectRoot: root });
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0, 5000);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 1);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("验收任务文案：要求 acceptance-triage/v1 与四档 severity（2026-10-25）", () => {
  const text = buildAcceptanceTaskMessage("flow-task-text", [], {
    reportPath: "docs/acceptance/flow-task-text-report-v1.md",
  });
  assert.match(text, /acceptance-triage\/v1/);
  for (const severity of ["blocker", "major", "minor", "nit"]) {
    assert.ok(text.includes(severity), `任务文案必须含 severity 定义：${severity}`);
  }
  assert.match(text, /fail\/conditional 必须至少一个 item/);
});

// —————————————— 2026-10-25 request_acceptance 有界超时（真机：工具 12 分钟不返回） ——————————————

test("request_acceptance：依赖永不 resolve ⇒ 按有界超时返回 unavailable（不挂起），并提示可能已派发", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-timeout-");
  try {
    const flowId = "flow-request-timeout";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, newContractStepsWithCriteriaStatus(flowId, "pending")));
    writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root }, {
      completeAcceptanceCriteriaStep: () => new Promise(() => {}),
      requestAcceptanceLimits: { totalMs: 150, stageMs: 60 },
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const capability = requestAcceptanceOf(harness, "convener");
      const started = Date.now();
      const result = await capability({ flowId });
      const elapsed = Date.now() - started;
      assert.equal(result.ok, false);
      assert.equal(result.code, "unavailable");
      assert.match(result.message, /超时/);
      assert.match(result.message, /可能已派发/);
      assert.match(result.message, /flow_get/);
      assert.ok(elapsed < 3000, `必须在有界时限内返回（实际 ${elapsed}ms）`);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("request_acceptance：派发阶段 openBackground 永不 resolve ⇒ 阶段超时（不挂起），不谎报已派发", async () => {
  const root = makeTempProjectRoot("ans-request-acceptance-open-hang-");
  try {
    const flowId = "flow-request-open-hang";
    const completeSteps = newContractSteps(flowId, { criteria: true, change: true });
    const notReady = completeSteps.map((step) =>
      step.id === "delivery-server" ? { ...step, status: "pending", evidence: undefined } : step,
    );
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, notReady));
    writeNewContractEvidenceFiles(root, flowId, { criteria: true, change: "T2" });
    const harness = await makeHarness(root, { ...trioListing(), projectRoot: root }, {
      hangOpenRoleSession: true,
      requestAcceptanceLimits: { totalMs: 200, stageMs: 80 },
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const capability = requestAcceptanceOf(harness, "convener");
      // 让流程在**导入之后**变为完成（避免导入补齐检查抢在能力调用前进入挂起派发）。
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, completeSteps));
      await appendNewContractLedger(root, flowId, { criteria: true, change: true });
      const started = Date.now();
      const result = await capability({ flowId });
      const elapsed = Date.now() - started;
      assert.equal(result.ok, false, `不得谎报成功：${JSON.stringify(result)}`);
      assert.equal(result.code, "unavailable");
      assert.match(result.message, /验收复核派发/);
      assert.match(result.message, /超时/);
      assert.match(result.message, /可能已派发/);
      assert.ok(elapsed < 3000, `派发阶段挂起也必须按超时返回（实际 ${elapsed}ms）`);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ————————————————— 2026-10-26 边界变更请求（request_boundary_change） —————————————————
//
// 客户确认的分层门禁：统筹不能直接派组队。能力入口 = 确定性校验 → 只读 AI 门禁 → 通过才后台派 Crew；
// AI deny/manual/超时/不可用 ⇒ rejected、零派发；打开/发送失败 ⇒ unavailable（票据 failed，可重试）；
// 同请求幂等（ticketId + clientMessageId），重启读票据恢复。

/** trio 内置角色 + 一个真实项目角色（带当前边界条目）。 */
function boundaryChangeListing(projectRoot: string): ProjectListing {
  const base = trioListing();
  return {
    ...base,
    projectRoot,
    hasRoles: true,
    roles: [
      ...base.roles,
      {
        roleId: "executor",
        cardPath: "角色卡/executor/role-card.md",
        boundaryPath: "角色卡/executor/boundary.yaml",
        cardText: "# executor\n负责实现 app-shell 与配置读取。",
        boundary: {
          entries: [
            { root: "project", path: "src/executor", kind: "directory", purpose: "实现目录" },
            { root: "project", path: "src/executor/legacy.ts", kind: "file", purpose: "旧入口" },
          ],
          boundarySource: "角色卡/executor/boundary.yaml",
          acceptance: { accepted: true, source: "test" },
        },
      },
    ],
  };
}

type JudgeScript = (request: GovernanceJudgeRequest) => Promise<GovernanceJudgeOutcome>;

/** 治理判断闭包工厂桩件：返回同一脚本驱动的 `GovernanceJudgeFn`（不建真实引擎）。 */
function governanceJudgeFactory(script: JudgeScript): NonNullable<DesktopDeps["createGovernanceJudgeFn"]> {
  return (() => script) as unknown as NonNullable<DesktopDeps["createGovernanceJudgeFn"]>;
}

function approveOutcome(): GovernanceJudgeOutcome {
  return {
    verdict: "approve",
    group: "decision",
    cardKind: "intent-confirm",
    reasonCode: "sufficient",
    reason: "请求路径与团队计划/流程一致，未顺带扩权",
    engine: "pi",
    evidence: ["docs/scheduling/flow-boundary-team-v1.md"],
  };
}

/** 打开指定治理角色会话并取回注入的 request_boundary_change 能力（未注入即失败）。 */
async function boundaryChangeCapability(
  harness: Harness,
  projectRoot: string,
  roleId = "convener",
): Promise<import("../../src/model/runtime.ts").RequestBoundaryChangeFn> {
  const opened = await harness.iface.openSession({ projectRoot, roleId, runtime: "pi" });
  assert.equal(opened.ok, true, opened.ok ? "" : (opened.error ?? "打开会话失败"));
  const fn = harness.openInputs.get(roleId)?.requestBoundaryChange;
  assert.ok(fn, `${roleId} 会话应注入 requestBoundaryChange`);
  return fn;
}

test("边界变更请求：确定性校验各失败 code（invalid-role / invalid-path / no-change；零 AI、零派发）", async () => {
  const root = makeTempProjectRoot("ans-boundary-validation-");
  let judgeCalls = 0;
  const harness = await makeHarness(root, boundaryChangeListing(root), {
    createGovernanceJudgeFn: governanceJudgeFactory(async () => {
      judgeCalls += 1;
      return approveOutcome();
    }),
  });
  try {
    const capability = await boundaryChangeCapability(harness, root);
    const rationale = "缺少写权";
    const cases: Array<[string, Parameters<typeof capability>[0], string]> = [
      ["未知角色", { roleId: "ghost", addPaths: ["config/new.ts"], rationale }, "invalid-role"],
      ["内置治理角色", { roleId: "convener", addPaths: ["config/new.ts"], rationale }, "invalid-role"],
      ["绝对路径", { roleId: "executor", addPaths: ["/etc/passwd"], rationale }, "invalid-path"],
      ["盘符路径", { roleId: "executor", addPaths: ["C:/abs/a.ts"], rationale }, "invalid-path"],
      [".. 逃逸", { roleId: "executor", addPaths: ["../outside.ts"], rationale }, "invalid-path"],
      ["双斜杠空段", { roleId: "executor", addPaths: ["config//x.ts"], rationale }, "invalid-path"],
      ["多个尾斜杠", { roleId: "executor", addPaths: ["config/newdir///"], rationale }, "invalid-path"],
      ["通配符 *", { roleId: "executor", addPaths: ["src/*.ts"], rationale }, "invalid-path"],
      ["通配符 ?", { roleId: "executor", addPaths: ["src/?.ts"], rationale }, "invalid-path"],
      ["字符类 []", { roleId: "executor", addPaths: ["src/[a].ts"], rationale }, "invalid-path"],
      ["花括号 {}", { roleId: "executor", addPaths: ["src/{a,b}.ts"], rationale }, "invalid-path"],
      ["治理账本", { roleId: "executor", addPaths: [".ans/governance/ledger.jsonl"], rationale }, "invalid-path"],
      ["角色卡", { roleId: "executor", addPaths: ["角色卡/executor/boundary.yaml"], rationale }, "invalid-path"],
      ["流程 YAML", { roleId: "executor", addPaths: ["docs/flows/flow-boundary.yaml"], rationale }, "invalid-path"],
      ["团队计划", { roleId: "executor", addPaths: ["docs/scheduling/flow-boundary-team-v1.md"], rationale }, "invalid-path"],
      ["验收标准", { roleId: "executor", addPaths: ["docs/acceptance/flow-boundary-criteria-v1.md"], rationale }, "invalid-path"],
      ["共享契约", { roleId: "executor", addPaths: ["docs/contracts/api.md"], rationale }, "invalid-path"],
      ["治理记录", { roleId: "executor", addPaths: ["docs/governance/convener/note.md"], rationale }, "invalid-path"],
      ["共享目录", { roleId: "executor", addPaths: ["src/common/shared/paths.ts"], rationale }, "invalid-path"],
      ["发布根文件", { roleId: "executor", addPaths: ["package.json"], rationale }, "invalid-path"],
      ["打包配置", { roleId: "executor", addPaths: ["electron-builder.yml"], rationale }, "invalid-path"],
      ["CI 配置", { roleId: "executor", addPaths: [".github/workflows/ci.yml"], rationale }, "invalid-path"],
      ["bin 目录", { roleId: "executor", addPaths: ["bin/ans.js"], rationale }, "invalid-path"],
      ["已被目录覆盖", { roleId: "executor", addPaths: ["src/executor/already-covered.ts"], rationale }, "no-change"],
      ["目录已覆盖（末尾 /）", { roleId: "executor", addPaths: ["src/executor/"], rationale }, "no-change"],
      ["移除治理路径", { roleId: "executor", removePaths: ["角色卡/executor/boundary.yaml"], rationale }, "invalid-path"],
      ["移除团队计划", { roleId: "executor", removePaths: ["docs/scheduling/x.md"], rationale }, "invalid-path"],
      ["移除不存在", { roleId: "executor", removePaths: ["src/not-listed.ts"], rationale }, "no-change"],
      ["空增删", { roleId: "executor", addPaths: [], removePaths: [], rationale }, "no-change"],
      ["空理由", { roleId: "executor", addPaths: ["config/new.ts"], rationale: "   " }, "invalid-path"],
      ["同增同删", { roleId: "executor", addPaths: ["config/new.ts"], removePaths: ["config/new.ts"], rationale }, "invalid-path"],
    ];
    // 验收 F3a：electron-builder 的 `.config.*` 变体与 yml 配置都必须拒绝（不能只挡 yml）。
    for (const path of ["electron-builder.config.ts", "electron-builder.config.js", "electron-builder.config.mjs"]) {
      cases.push([`打包配置 ${path}`, { roleId: "executor", addPaths: [path], rationale }, "invalid-path"]);
    }
    // 验收 F6：发布根/治理关键路径带**单个末尾 `/`** 时不得绕过（增删两侧都测；票据仍保留原路径）。
    const slashSensitivePaths = [
      "package.json/",
      "package-lock.json/",
      "tsconfig.node.json/",
      "vite.config.ts/",
      "electron-builder.yml/",
      ".env/",
      "index.html/",
      "docs/scheduling/",
      "docs/acceptance/",
      "角色卡/executor/",
      ".ans/",
    ];
    for (const path of slashSensitivePaths) {
      cases.push([`尾斜杠新增 ${path}`, { roleId: "executor", addPaths: [path], rationale }, "invalid-path"]);
      cases.push([`尾斜杠移除 ${path}`, { roleId: "executor", removePaths: [path], rationale }, "invalid-path"]);
    }
    for (const [label, input, code] of cases) {
      const result = await capability(input);
      assert.equal(result.ok, false, label);
      assert.equal(result.code, code, `${label} => ${result.code}（${result.message}）`);
    }
    assert.equal(judgeCalls, 0, "确定性校验失败不得调用 AI 门禁");
    assert.equal(harness.sendsByRole.get("nominator"), undefined, "确定性校验失败不得派发人事");
  } finally {
    await harness.iface.stopSession();
    rmSync(root, { recursive: true, force: true });
  }
});

test("边界变更请求：AI approve ⇒ 恰一条人事任务（精确路径 + ticketId，无「客户批准」字样）与 dispatched 票据", async () => {
  const root = makeTempProjectRoot("ans-boundary-approve-");
  const flowId = "flow-boundary";
  writeFlowStateFile(
    root,
    flowId,
    flowStateYaml(flowId, [{ id: "role-cards", kind: "dispatch", status: "pending", owner: "executor" }]),
  );
  mkdirSync(path.join(root, "docs", "scheduling"), { recursive: true });
  writeFileSync(
    path.join(root, "docs", "scheduling", `${flowId}-team-v1.md`),
    ["---", `flowId: ${flowId}`, "version: 1", "riskTier: T1", "recommended: [executor]", "---", "", "# 团队计划", ""].join("\n"),
  );
  let judgeRequest: GovernanceJudgeRequest | undefined;
  const harness = await makeHarness(root, boundaryChangeListing(root), {
    createGovernanceJudgeFn: governanceJudgeFactory(async (request) => {
      judgeRequest = request;
      return approveOutcome();
    }),
  });
  try {
    const capability = await boundaryChangeCapability(harness, root);
    const input = {
      roleId: "executor",
      addPaths: ["config/executor.config.ts"],
      removePaths: ["src/executor/legacy.ts"],
      rationale: "实现配置读取缺少写权",
      flowId,
    };
    const result = await capability(input);
    assert.equal(result.ok, true, result.message);
    assert.equal(result.code, "dispatched");
    assert.equal(result.roleId, "executor");
    const ticketId = result.ticketId!;
    assert.match(ticketId, /^bnd-[0-9a-f]{16}$/);

    const sends = harness.sendsByRole.get("nominator") ?? [];
    assert.equal(sends.length, 1, "AI approve 后必须恰一条人事任务");
    const task = sends[0]!;
    assert.ok(task.includes("config/executor.config.ts"), "任务含精确新增路径");
    assert.ok(task.includes("src/executor/legacy.ts"), "任务含精确移除路径");
    assert.ok(task.includes(ticketId), "任务含 ticketId");
    assert.ok(task.includes("appointment-write"), "任务要求按 appointment-write 逐路径确认");
    assert.equal(task.includes("客户批准"), false, "任务文本不得夹带「客户批准」字样");
    assert.match(task, /未获确认不得写入/);

    assert.ok(judgeRequest !== undefined, "AI 门禁必须被调用");
    assert.equal(judgeRequest!.group, "decision");
    assert.equal(judgeRequest!.cardKind, "intent-confirm");
    assert.equal(judgeRequest!.roleId, "convener");
    assert.equal(judgeRequest!.flowId, flowId);
    assert.equal(judgeRequest!.card.kind, "choice");
    const preview = judgeRequest!.card.kind === "choice" ? (judgeRequest!.card.preview ?? "") : "";
    assert.ok(preview.includes("config/executor.config.ts"), "证据包含请求新增路径");
    assert.ok(preview.includes("src/executor/legacy.ts"), "证据包含请求移除路径");
    assert.ok(preview.includes("角色卡摘录"), "证据包含角色卡证据");
    assert.ok(preview.includes("src/executor"), "证据包含当前边界条目");
    assert.equal(judgeRequest!.artifacts?.teamPlanPath, `docs/scheduling/${flowId}-team-v1.md`);
    assert.equal(judgeRequest!.artifacts?.flowPath, `docs/flows/${flowId}.yaml`);

    const ticketRel = boundaryChangeTicketRelPath(flowId, ticketId);
    const ticketPath = path.join(root, ...ticketRel.split("/"));
    assert.equal(existsSync(ticketPath), true, "必须写审计票据");
    const ticket = JSON.parse(readFileSync(ticketPath, "utf8")) as {
      status?: string;
      roleId?: string;
      requestedBy?: string;
      judge?: { verdict?: string };
      dispatch?: { clientMessageId?: string; messageSha256?: string };
    };
    assert.equal(ticket.status, "dispatched");
    assert.equal(ticket.roleId, "executor");
    assert.equal(ticket.requestedBy, "convener");
    assert.equal(ticket.judge?.verdict, "approve");
    assert.equal(ticket.dispatch?.clientMessageId, boundaryChangeClientMessageId(ticketId));
    assert.match(ticket.dispatch?.messageSha256 ?? "", /^[0-9a-f]{64}$/);

    // 幂等（同进程）：再次调用 ⇒ already-dispatched，不重复派发。
    const again = await capability(input);
    assert.equal(again.ok, false);
    assert.equal(again.code, "already-dispatched");
    assert.equal((harness.sendsByRole.get("nominator") ?? []).length, 1);

    // 重启恢复：新 Interface 实例从票据读到 dispatched，不再调用 AI/不再派发。
    const restarted = await makeHarness(root, boundaryChangeListing(root), {
      createGovernanceJudgeFn: governanceJudgeFactory(async () => {
        throw new Error("重启后同请求不得再次调用 AI 门禁");
      }),
    });
    try {
      const restartedCapability = await boundaryChangeCapability(restarted, root);
      const afterRestart = await restartedCapability(input);
      assert.equal(afterRestart.code, "already-dispatched");
      assert.equal(restarted.sendsByRole.get("nominator"), undefined, "重启后不得重复派发");
    } finally {
      await restarted.iface.stopSession();
    }
  } finally {
    await harness.iface.stopSession();
    rmSync(root, { recursive: true, force: true });
  }
});

test("边界变更请求：目录条目允许单个末尾 /，票据/任务/证据保留目录语义", async () => {
  const root = makeTempProjectRoot("ans-boundary-directory-");
  const flowId = "flow-boundary";
  let judgeRequest: GovernanceJudgeRequest | undefined;
  const harness = await makeHarness(root, boundaryChangeListing(root), {
    createGovernanceJudgeFn: governanceJudgeFactory(async (request) => {
      judgeRequest = request;
      return approveOutcome();
    }),
  });
  try {
    const capability = await boundaryChangeCapability(harness, root);
    const input = { roleId: "executor", addPaths: ["config/newdir/"], rationale: "需要整个配置目录", flowId };
    const result = await capability(input);
    assert.equal(result.ok, true, result.message);
    const task = (harness.sendsByRole.get("nominator") ?? [])[0]!;
    assert.ok(task.includes("config/newdir/"), "任务保留目录路径");
    assert.ok(task.includes("（目录条目）"), "任务标注目录语义");
    const ticketRel = boundaryChangeTicketRelPath(flowId, result.ticketId!);
    const ticket = JSON.parse(readFileSync(path.join(root, ...ticketRel.split("/")), "utf8")) as { addPaths?: string[] };
    assert.deepEqual(ticket.addPaths, ["config/newdir/"], "票据保留单个末尾 /");
    const preview = judgeRequest!.card.kind === "choice" ? (judgeRequest!.card.preview ?? "") : "";
    assert.ok(preview.includes("config/newdir/"), "AI 证据保留目录路径");
  } finally {
    await harness.iface.stopSession();
    rmSync(root, { recursive: true, force: true });
  }
});

test("边界变更请求：AI deny/manual ⇒ 终态 rejected；超时/不可用 ⇒ rejected 且票据 failed 可重试；零派发", async () => {
  const root = makeTempProjectRoot("ans-boundary-reject-");
  const flowId = "flow-boundary";
  const cases: Array<{
    label: string;
    limits?: DesktopDeps["requestBoundaryChangeLimits"];
    script: JudgeScript;
  }> = [
    {
      label: "deny",
      script: async () => ({
        verdict: "deny",
        group: "decision",
        cardKind: "intent-confirm",
        reasonCode: "model-deny",
        reason: "新增路径与申请理由不匹配",
        engine: "pi",
      }),
    },
    {
      label: "manual",
      script: async () => ({
        verdict: "manual",
        group: "decision",
        cardKind: "intent-confirm",
        reasonCode: "insufficient-evidence",
        reason: "证据不足，无法判断",
        engine: "pi",
      }),
    },
    {
      label: "unavailable",
      script: async () => {
        throw new Error("判断引擎不可用");
      },
    },
    {
      label: "timeout",
      limits: { judgeMs: 60, dispatchMs: 500 },
      script: async () => new Promise<GovernanceJudgeOutcome>(() => {}),
    },
  ];
  try {
    for (const item of cases) {
      let judgeCalls = 0;
      const harness = await makeHarness(root, boundaryChangeListing(root), {
        createGovernanceJudgeFn: governanceJudgeFactory(async (request) => {
          judgeCalls += 1;
          return item.script(request);
        }),
        ...(item.limits !== undefined ? { requestBoundaryChangeLimits: item.limits } : {}),
      });
      try {
        const capability = await boundaryChangeCapability(harness, root);
        const input = { roleId: "executor", addPaths: [`config/${item.label}.config.ts`], rationale: `测试 ${item.label}`, flowId };
        const started = Date.now();
        const result = await capability(input);
        const elapsed = Date.now() - started;
        assert.equal(result.ok, false, `${item.label} 不得回执成功`);
        assert.equal(result.code, "rejected", `${item.label} => ${result.code}（${result.message}）`);
        assert.match(result.message, /不自动放行/);
        assert.equal(harness.sendsByRole.get("nominator"), undefined, `${item.label} 不得派发人事`);
        if (item.label === "timeout") assert.ok(elapsed < 5000, `超时必须有界返回（实际 ${elapsed}ms）`);
        const ticketRel = boundaryChangeTicketRelPath(flowId, result.ticketId!);
        const ticket = JSON.parse(readFileSync(path.join(root, ...ticketRel.split("/")), "utf8")) as {
          status?: string;
          judge?: { verdict?: string; reasonCode?: string };
        };
        // 门禁不可用/超时 = 基础设施问题 ⇒ failed（可重试，fail-closed 不变）；deny/manual = 判断结论 ⇒ 终态 rejected。
        const retryable = item.label === "unavailable" || item.label === "timeout";
        assert.equal(ticket.status, retryable ? "failed" : "rejected", `${item.label} 票据状态`);
        assert.equal(ticket.judge?.verdict, item.label === "deny" ? "deny" : "manual");
        if (item.label === "timeout") assert.equal(ticket.judge?.reasonCode, "timeout");
        if (item.label === "deny") {
          // 同一请求被退回后不重跑 AI 门禁（防止反复试探直到某次通过）；修改请求会生成新票据。
          const repeat = await capability(input);
          assert.equal(repeat.code, "rejected");
          assert.match(repeat.message, /此前已被 AI 门禁退回/);
          assert.equal(judgeCalls, 1, "同一请求退回后不得重跑 AI 门禁");
        }
        if (item.label === "unavailable") {
          // 门禁瞬时不可用 ⇒ failed，可在修复后重试（重试会重新过门禁；仍不派发）。
          const repeat = await capability(input);
          assert.equal(repeat.code, "rejected");
          assert.match(repeat.message, /可修复后重试/);
          assert.equal(judgeCalls, 2, "门禁不可用写 failed，重试应重跑门禁");
          assert.equal(harness.sendsByRole.get("nominator"), undefined);
        }
      } finally {
        await harness.iface.stopSession();
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("边界变更请求：打开人事失败 ⇒ unavailable + 票据 failed；重试成功且 ticketId 稳定", async () => {
  const root = makeTempProjectRoot("ans-boundary-retry-");
  const flowId = "flow-boundary";
  try {
    const failing = await makeHarness(root, boundaryChangeListing(root), {
      createGovernanceJudgeFn: governanceJudgeFactory(async () => approveOutcome()),
      failOpenRoles: new Set(["nominator"]),
    });
    const input = { roleId: "executor", addPaths: ["config/retry.config.ts"], rationale: "缺少写权", flowId };
    let ticketId: string;
    try {
      const capability = await boundaryChangeCapability(failing, root);
      const first = await capability(input);
      assert.equal(first.ok, false);
      assert.equal(first.code, "unavailable", first.message);
      assert.match(first.message, /重试/);
      assert.equal(failing.sendsByRole.get("nominator"), undefined, "打开失败不得投递");
      ticketId = first.ticketId!;
      const ticketRel = boundaryChangeTicketRelPath(flowId, ticketId);
      const ticket = JSON.parse(readFileSync(path.join(root, ...ticketRel.split("/")), "utf8")) as { status?: string };
      assert.equal(ticket.status, "failed", "打开失败票据标 failed（可重试）");
    } finally {
      await failing.iface.stopSession();
    }

    const healthy = await makeHarness(root, boundaryChangeListing(root), {
      createGovernanceJudgeFn: governanceJudgeFactory(async () => approveOutcome()),
    });
    try {
      const retry = await (await boundaryChangeCapability(healthy, root))(input);
      assert.equal(retry.ok, true, retry.message);
      assert.equal(retry.code, "dispatched");
      assert.equal(retry.ticketId, ticketId, "同一请求 ticketId 必须稳定");
      assert.equal((healthy.sendsByRole.get("nominator") ?? []).length, 1);
    } finally {
      await healthy.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("边界变更请求注入矩阵：仅 convener 有；项目角色与其他内置治理角色没有；deps 可整体替换", async () => {
  const root = makeTempProjectRoot("ans-boundary-injection-");
  try {
    const harness = await makeHarness(root, boundaryChangeListing(root));
    try {
      await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "pi" });
      await harness.iface.openSession({ projectRoot: root, roleId: "verifier", runtime: "pi" });
      await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "pi" });
      assert.equal(typeof harness.openInputs.get("convener")?.requestBoundaryChange, "function", "convener 注入");
      assert.equal(harness.openInputs.get("verifier")?.requestBoundaryChange, undefined, "非 convener 治理角色不注入");
      assert.equal(harness.openInputs.get("executor")?.requestBoundaryChange, undefined, "项目角色不注入");
    } finally {
      await harness.iface.stopSession();
    }

    // DesktopDeps.requestBoundaryChange 可整体替换（测试接缝）：会话闭包应补入 projectRoot/发起角色。
    const received: Array<{ projectRoot: string; requesterRoleId: string; input: unknown }> = [];
    const fake = await makeHarness(root, boundaryChangeListing(root), {
      requestBoundaryChange: async (projectRoot, requesterRoleId, input) => {
        received.push({ projectRoot, requesterRoleId, input });
        return { ok: true, code: "dispatched", message: "fake 能力已受理" };
      },
    });
    try {
      const capability = await boundaryChangeCapability(fake, root);
      const payload = { roleId: "executor", addPaths: ["config/x.ts"], rationale: "缺少写权" };
      const result = await capability(payload);
      assert.equal(result.code, "dispatched");
      assert.deepEqual(received, [{ projectRoot: root, requesterRoleId: "convener", input: payload }]);
    } finally {
      await fake.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————— 2026-10-26 gate 复核（request_gate_review；客户授权） ——————————————
//
// 契约（设计 `2026-10-26_design_proof-gate-reviews.md` §5.3–§8 / §9.3 / §10 A3/A4/A6/A7/A8）：
//   · 只注入统筹（convener）；项目角色与其他治理角色不注册；gate 复核 ≠ 验收通过 ≠ 客户批准；
//   · 应用校验：flow/gate/gateKind/pending → gate 记录与 revision 幂等 → dependsOn done + 账本对账 →
//     最新 criteria 的 Gate 标准节 → visual/integration 证据完整性 → 无在途 → 引擎 → 派 Proof →
//     `dispatch.accepted{stepId=gateId}` + `.ans/.../gates/<gateId>.json`（原子写）；
//   · 报告处置：pass ⇒ completeGateStep + gate.review + 下游放行；fail(blocker/major) ⇒ 独立返工路由、
//     **不标 done**；fail 仅 minor/nit ⇒ returned-to-proof、**不返工**；缺/坏报告 ⇒ returned-to-proof；
//   · 重启/导入恢复按记录幂等补处置；不自动重派、不自动通过；gate 结论不写 customer.decision。

const GATE_FLOW_ID = "flow-gate-review";
const GATE_STEP_ID = "gate-vertical-slice";

function gateFlowSteps(
  flowId: string,
  options: { gateKind?: string; gateStatus?: string; gateDependsOn?: readonly string[]; evidenceStepStatus?: string; integrationStep?: boolean } = {},
): FlowYamlStepInput[] {
  return [
    {
      id: "delivery-server",
      kind: "dispatch",
      status: "done",
      owner: "executor",
      evidence: { kind: "dispatch", ref: "delivery-server" },
    },
    {
      id: "verification-evidence",
      kind: "artifact",
      status: options.evidenceStepStatus ?? "done",
      owner: "executor",
      evidence: { kind: "artifact", ref: `docs/verification/${flowId}-demo.md` },
    },
    ...(options.integrationStep === false
      ? []
      : [{ id: "integration-e2e", kind: "dispatch" as const, status: "done", owner: "executor", evidence: { kind: "dispatch" as const, ref: "integration-e2e" } }]),
    {
      id: GATE_STEP_ID,
      kind: "artifact",
      status: options.gateStatus ?? "pending",
      owner: "verifier",
      gateKind: options.gateKind ?? "vertical-slice",
      evidence: { kind: "artifact", ref: `docs/acceptance/${flowId}-${GATE_STEP_ID}-report-v1.md` },
      dependsOn: options.gateDependsOn ?? ["delivery-server"],
    },
    {
      id: "delivery-after-gate",
      kind: "dispatch",
      status: "pending",
      owner: "executor",
      dependsOn: [GATE_STEP_ID],
    },
    { id: "verification", kind: "acceptance", status: "pending", owner: "app" },
  ];
}

function writeGateCriteria(root: string, flowId: string, gateId = GATE_STEP_ID, options: { includeSection?: boolean } = {}): void {
  const acceptance = path.join(root, "docs", "acceptance");
  mkdirSync(acceptance, { recursive: true });
  const section = options.includeSection === false
    ? []
    : [
        `## Gate 复核标准：${gateId}（vertical-slice）`,
        "| ID | 标准 | 需要的证据 | 判定 |",
        "| --- | --- | --- | --- |",
        "| GV-1 | 脚手架可真实运行/最小测试通过 | 命令、日志、退出码 | pass / fail / insufficient evidence |",
      ];
  writeFileSync(
    path.join(acceptance, `${flowId}-criteria-v1.md`),
    [
      "---",
      `flowId: ${flowId}`,
      "version: 1",
      "riskTier: T2",
      "---",
      `# 验收标准：${flowId}`,
      "| ID | 标准 | 需要的证据 | 判定 |",
      "| --- | --- | --- | --- |",
      "| A1 | 交付 | 测试输出 | pass / fail / insufficient evidence |",
      "风险档位：T2。判定规则：pass / fail / insufficient evidence。证据计划：单测。版本：v1 冻结。",
      ...section,
      "",
    ].join("\n"),
  );
}

function writeGateEvidenceFile(root: string, flowId: string): void {
  const dir = path.join(root, "docs", "verification");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${flowId}-demo.md`), "# 真实运行/演示证据\n");
}

async function seedGateLedger(root: string, flowId: string): Promise<void> {
  await appendLedger(root, [
    { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
    { kind: "artifact.observed", artifactPath: `docs/verification/${flowId}-demo.md`, actorRoleId: "executor", power: "project" },
    { kind: "dispatch.accepted", flowId, stepId: "integration-e2e", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
  ]);
}

function gateRecordAbsPath(root: string, flowId: string, gateId = GATE_STEP_ID): string {
  return path.join(root, ".ans", "governance", "acceptance", flowId, "gates", `${gateId}.json`);
}

function gateReworkRoutingAbsPath(root: string, flowId: string, gateId = GATE_STEP_ID): string {
  return path.join(root, ".ans", "governance", "acceptance", flowId, "gates", `${gateId}-rework-routing.json`);
}

function flowRevisionOf(root: string, flowId: string): string {
  return createHash("sha256").update(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`))).digest("hex");
}

function writeGateRecord(
  root: string,
  flowId: string,
  record: Partial<Record<string, unknown>> & { status: string },
  gateId = GATE_STEP_ID,
): void {
  const dir = path.dirname(gateRecordAbsPath(root, flowId, gateId));
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    gateRecordAbsPath(root, flowId, gateId),
    `${JSON.stringify(
      {
        schema: "gate-review-record/v1",
        flowId,
        gateId,
        gateKind: "vertical-slice",
        flowRevision: flowRevisionOf(root, flowId),
        reportPath: `docs/acceptance/${flowId}-${gateId}-report-v1.md`,
        reportVersion: 1,
        reportSha256: null,
        conclusion: null,
        severityCounts: { blocker: 0, major: 0, minor: 0, nit: 0 },
        itemCount: 0,
        itemsDigest: null,
        requestId: `gate-${gateId}-test`,
        dispatchedAt: now,
        decidedAt: null,
        error: null,
        at: now,
        ...record,
      },
      null,
      2,
    )}\n`,
  );
}

function writeGateReport(
  root: string,
  flowId: string,
  gateId: string,
  version: number,
  conclusion: "pass" | "fail" | "conditional",
  items: TriageItemInput[] = [],
): void {
  const acceptance = path.join(root, "docs", "acceptance");
  mkdirSync(acceptance, { recursive: true });
  writeFileSync(
    path.join(acceptance, `${flowId}-${gateId}-report-v${version}.md`),
    triageReportBody({
      conclusion,
      items,
      extra: [`Gate 复核报告 v${version}｜flowId: ${flowId}｜gateId: ${gateId}｜gateKind: vertical-slice`],
    }),
  );
}

function readGateRecordFile(root: string, flowId: string, gateId = GATE_STEP_ID): Record<string, unknown> {
  return JSON.parse(readFileSync(gateRecordAbsPath(root, flowId, gateId), "utf8")) as Record<string, unknown>;
}

function gateTaskSends(harness: Harness): string[] {
  return harness.sendsByRole.get("verifier") ?? [];
}

async function openConvenerAndSettle(harness: Harness, root: string): Promise<void> {
  if (!harness.controls.has("convener")) {
    assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
  }
  harness.controls.get("convener")!.settle();
}

function requestGateReviewOf(harness: Harness): import("../../src/model/runtime.ts").RequestGateReviewFn {
  const fn = harness.openInputs.get("convener")?.requestGateReview;
  assert.ok(fn, "convener 会话应注入 requestGateReview");
  return fn;
}

test("2026-10-26 gate 路径单一来源：桌面 governanceGateReviewReportPath 与编排 gateReviewReportRelPath 一致；不新增 FlowStepKind", () => {
  assert.equal(governanceGateReviewReportPath("flow-gate-review", "gate-vertical-slice", 2), gateReviewReportRelPath("flow-gate-review", "gate-vertical-slice", 2));
  assert.equal(governanceGateReviewReportPath("flow-gate-review", "gate-vertical-slice"), "docs/acceptance/flow-gate-review-gate-vertical-slice-report-v1.md");
  assert.equal(FLOW_STEP_KINDS.includes("gate" as never), false, "gate 不得成为新的 FlowStepKind");
});

test("2026-10-26 request_gate_review：派发成功（任务自足/账本 dispatch.accepted{stepId}/gate 记录原子写）；重复请求幂等", async () => {
  const root = makeTempProjectRoot("ans-gate-request-dispatch-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    writeGateCriteria(root, GATE_FLOW_ID);
    await seedGateLedger(root, GATE_FLOW_ID);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestGateReview = requestGateReviewOf(harness);
      const first = await requestGateReview({ flowId: GATE_FLOW_ID, gateId: GATE_STEP_ID });
      assert.equal(first.ok, true, first.message);
      assert.equal(first.code, "dispatched");
      assert.equal(first.flowId, GATE_FLOW_ID);
      assert.equal(first.gateId, GATE_STEP_ID);
      assert.equal(first.runtime, "pi");
      assert.match(first.message, /gate 复核 ≠ 验收通过 ≠ 客户批准/, "回执必须写清 gate ≠ 验收/客户批准");

      const tasks = gateTaskSends(harness);
      assert.equal(tasks.length, 1, "恰一条 gate 复核任务");
      const task = tasks[0]!;
      for (const needle of [
        `gate ${GATE_STEP_ID}`,
        "gateKind=vertical-slice",
        `docs/acceptance/${GATE_FLOW_ID}-criteria-v1.md`,
        `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`,
        "delivery-server",
        "acceptance-triage/v1",
        "不发 request_choice / 验收卡、不写 customer.decision、不代表客户批准",
        "只有 minor/nit 的 fail 会被应用按结构不符退回 Proof，不触发返工",
        "不要标任何 flow 步骤 done",
      ]) {
        assert.ok(task.includes(needle), `gate 任务必须自足包含「${needle}」`);
      }

      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.flowId === GATE_FLOW_ID &&
            entry.stepId === GATE_STEP_ID &&
            entry.targetRoleId === "verifier",
        ).length,
        1,
        "账本恰一条 gate 派发记录（stepId=gateId）",
      );
      const record = readGateRecordFile(root, GATE_FLOW_ID);
      assert.equal(record.schema, "gate-review-record/v1");
      assert.equal(record.status, "dispatched");
      assert.equal(record.gateKind, "vertical-slice");
      assert.equal(record.reportVersion, 1);
      assert.equal(record.reportPath, `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`);
      assert.equal(record.flowRevision, flowRevisionOf(root, GATE_FLOW_ID));

      const second = await requestGateReview({ flowId: GATE_FLOW_ID, gateId: GATE_STEP_ID });
      assert.equal(second.ok, false, "重复请求不得说成 dispatched");
      assert.equal(second.code, "already-dispatched");
      assert.equal(gateTaskSends(harness).length, 1, "同 flow revision 不重复派发");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 request_gate_review：flow/gate/状态校验矩阵（归一、gate-not-found、done/superseded、criteria-missing、flow-incomplete、runtime）", async () => {
  const root = makeTempProjectRoot("ans-gate-request-matrix-");
  try {
    const doneFlow = "flow-gate-done";
    const supersededFlow = "flow-gate-superseded";
    const depFlow = "flow-gate-dep-pending";
    const evidenceFlow = "flow-gate-evidence-missing";
    const criteriaFlow = "flow-gate-criteria-missing";
    const runtimeFlow = "flow-gate-runtime";
    writeFlowStateFile(root, doneFlow, flowStateYaml(doneFlow, gateFlowSteps(doneFlow, { gateStatus: "done" })));
    writeFlowStateFile(root, supersededFlow, flowStateYaml(supersededFlow, gateFlowSteps(supersededFlow, { gateStatus: "superseded", gateDependsOn: [] })));
    writeFlowStateFile(root, depFlow, flowStateYaml(depFlow, gateFlowSteps(depFlow).map((step) => (step.id === "delivery-server" ? { ...step, status: "pending" } : step))));
    writeFlowStateFile(root, evidenceFlow, flowStateYaml(evidenceFlow, gateFlowSteps(evidenceFlow)));
    writeFlowStateFile(root, criteriaFlow, flowStateYaml(criteriaFlow, gateFlowSteps(criteriaFlow)));
    writeFlowStateFile(root, runtimeFlow, flowStateYaml(runtimeFlow, gateFlowSteps(runtimeFlow)));
    writeGateCriteria(root, doneFlow);
    writeGateCriteria(root, supersededFlow);
    writeGateCriteria(root, depFlow);
    writeGateCriteria(root, evidenceFlow);
    writeGateCriteria(root, runtimeFlow);
    writeGateCriteria(root, criteriaFlow, GATE_STEP_ID, { includeSection: false });
    // runtimeFlow 前置证据齐备；evidenceFlow 故意不写 ledger（依赖证据无法对账）。
    await seedGateLedger(root, runtimeFlow);
    await seedGateLedger(root, criteriaFlow);
    let runtimeOk = true;
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root }, {
      resolveRuntime: async () =>
        runtimeOk
          ? { ok: true, runtime: "pi", source: "credentials", skipped: [] }
          : { ok: false, message: "无法确定项目引擎（gate 测试）", skipped: [] },
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestGateReview = requestGateReviewOf(harness);

      const done = await requestGateReview({ flowId: doneFlow, gateId: GATE_STEP_ID });
      assert.equal(done.code, "already-dispatched", "done gate ⇒ already-dispatched（重验需新 gate id）");
      const superseded = await requestGateReview({ flowId: supersededFlow, gateId: GATE_STEP_ID });
      assert.equal(superseded.code, "rejected", "superseded gate ⇒ rejected");
      assert.match(superseded.message, /superseded/i);

      const missing = await requestGateReview({ flowId: GATE_FLOW_ID, gateId: GATE_STEP_ID });
      assert.equal(missing.code, "gate-not-found", "flow 不存在 ⇒ gate-not-found");
      const notGate = await requestGateReview({ flowId: depFlow, gateId: "delivery-server" });
      assert.equal(notGate.code, "gate-not-found", "非 gate 步骤 ⇒ gate-not-found");
      const badShape = await requestGateReview({ flowId: depFlow, gateId: "gate_bad" });
      assert.equal(badShape.code, "gate-not-found", "gateId 形状不符 ⇒ gate-not-found");

      const depPending = await requestGateReview({ flowId: depFlow, gateId: GATE_STEP_ID });
      assert.equal(depPending.code, "flow-incomplete", "dependsOn 未 done ⇒ flow-incomplete");
      assert.match(depPending.message, /delivery-server/);

      const evidenceMissing = await requestGateReview({ flowId: evidenceFlow, gateId: GATE_STEP_ID });
      assert.equal(evidenceMissing.code, "flow-incomplete", "依赖证据未对账 ⇒ flow-incomplete");
      assert.match(evidenceMissing.message, /依赖证据无法对账/);

      const criteriaMissing = await requestGateReview({ flowId: criteriaFlow, gateId: GATE_STEP_ID });
      assert.equal(criteriaMissing.code, "criteria-missing", "criteria 缺 Gate 标准节 ⇒ criteria-missing");
      assert.match(criteriaMissing.message, /Gate 复核标准节/);

      // 多流程且省略 flowId ⇒ 不猜，要求显式 flowId。
      const ambiguous = await requestGateReview({ gateId: GATE_STEP_ID });
      assert.equal(ambiguous.code, "gate-not-found");
      assert.match(ambiguous.message, /指定 flowId/);

      // runtime 无法解析 ⇒ unavailable（不派发）。
      runtimeOk = false;
      const runtime = await requestGateReview({ flowId: runtimeFlow, gateId: GATE_STEP_ID });
      assert.equal(runtime.code, "unavailable");
      assert.match(runtime.message, /无法确定项目引擎/);
      assert.equal(gateTaskSends(harness).length, 0, "任何失败 code 都不派发");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 request_gate_review：注入矩阵——仅 convener 有；项目角色与其他治理角色没有", async () => {
  const root = makeTempProjectRoot("ans-gate-injection-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, listing);
    try {
      for (const roleId of ["convener", "liaison", "rapporteur", "nominator", "verifier", "executor"]) {
        assert.equal((await harness.iface.openSession({ projectRoot: root, roleId, runtime: "demo" })).ok, true);
      }
      assert.equal(typeof harness.openInputs.get("convener")?.requestGateReview, "function", "convener 注入 gate 请求能力");
      for (const roleId of ["liaison", "rapporteur", "nominator", "verifier", "executor"]) {
        assert.equal(harness.openInputs.get(roleId)?.requestGateReview, undefined, `${roleId} 不注入 gate 请求能力`);
      }
      // request_acceptance 的既有注入语义不变（内置治理角色有、项目角色无）。
      assert.equal(typeof harness.openInputs.get("verifier")?.requestAcceptance, "function");
      assert.equal(harness.openInputs.get("executor")?.requestAcceptance, undefined);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 request_gate_review：visual gate 需真实运行/演示证据步骤 done 且证据文件存在；任务要求关闭 DEBUG", async () => {
  const root = makeTempProjectRoot("ans-gate-visual-");
  try {
    const visualFlow = "flow-gate-visual";
    const missingEvidenceFlow = "flow-gate-visual-missing";
    writeFlowStateFile(root, visualFlow, flowStateYaml(visualFlow, gateFlowSteps(visualFlow, { gateKind: "visual-baseline" })));
    writeFlowStateFile(root, missingEvidenceFlow, flowStateYaml(missingEvidenceFlow, gateFlowSteps(missingEvidenceFlow, { gateKind: "visual-baseline", evidenceStepStatus: "pending" })));
    writeGateCriteria(root, visualFlow);
    writeGateCriteria(root, missingEvidenceFlow);
    await seedGateLedger(root, visualFlow);
    await seedGateLedger(root, missingEvidenceFlow);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestGateReview = requestGateReviewOf(harness);
      // 证据步骤 pending ⇒ flow-incomplete。
      const missing = await requestGateReview({ flowId: missingEvidenceFlow, gateId: GATE_STEP_ID });
      assert.equal(missing.code, "flow-incomplete");
      assert.match(missing.message, /verification-evidence/);
      // 证据步骤 done 但索引文件不存在 ⇒ flow-incomplete（只核对路径存在）。
      const fileMissing = await requestGateReview({ flowId: visualFlow, gateId: GATE_STEP_ID });
      assert.equal(fileMissing.code, "flow-incomplete");
      assert.match(fileMissing.message, /证据索引文件不存在/);
      // 补上真实文件 ⇒ 派发，任务强调关闭 DEBUG。
      writeGateEvidenceFile(root, visualFlow);
      const ok = await requestGateReview({ flowId: visualFlow, gateId: GATE_STEP_ID });
      assert.equal(ok.code, "dispatched", ok.message);
      assert.match(gateTaskSends(harness)[0]!, /关闭 DEBUG 覆盖层/);
      assert.match(gateTaskSends(harness)[0]!, /insufficient evidence/);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 request_gate_review：integration gate 需集成/e2e 步骤 done", async () => {
  const root = makeTempProjectRoot("ans-gate-integration-");
  try {
    const flowId = "flow-gate-integration";
    writeFlowStateFile(root, flowId, flowStateYaml(flowId, gateFlowSteps(flowId, { gateKind: "integration-performance", integrationStep: false })));
    writeGateCriteria(root, flowId);
    await appendLedger(root, [{ kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" }]);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const result = await requestGateReviewOf(harness)({ flowId, gateId: GATE_STEP_ID });
      assert.equal(result.code, "flow-incomplete");
      assert.match(result.message, /集成\/e2e 或 Reduce 步骤/);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 gate 处置：报告 pass ⇒ completeGateStep + artifact.observed + gate.review(pass) + 下游放行；不写 customer.decision", async () => {
  const root = makeTempProjectRoot("ans-gate-pass-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    await seedGateLedger(root, GATE_FLOW_ID);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      await sleep(120); // 让导入补齐检查先跑完（此时无 gate 记录）
      writeGateRecord(root, GATE_FLOW_ID, { status: "dispatched" });
      writeGateReport(root, GATE_FLOW_ID, GATE_STEP_ID, 1, "pass", [{ id: "G1", severity: "minor", owner: "executor", reason: "建议改进", action: "后续优化", targets: ["src/x.ts"] }]);
      await openConvenerAndSettle(harness, root);

      await waitFor(() => {
        try {
          return readGateRecordFile(root, GATE_FLOW_ID).status === "passed";
        } catch {
          return false;
        }
      });

      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
      assert.ok(parsed.ok);
      const gateStep = parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)!;
      assert.equal(gateStep.status, "done", "pass 报告由应用收口 gate 步骤");
      assert.deepEqual(gateStep.evidence, { kind: "artifact", ref: `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md` });

      const ledger = await readGovernanceLedger(root);
      const observed = ledger.entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`);
      assert.equal(observed.length, 1, "gate 报告按 artifact 观测规则补登（app/app）");
      assert.equal(observed[0]!.actorRoleId, "app");
      const reviews = ledger.entries.filter((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID);
      assert.equal(reviews.length, 1, "恰一条 gate.review 审计");
      assert.equal(reviews[0]!.gateReview?.conclusion, "pass");
      assert.equal(reviews[0]!.gateReview?.gateId, GATE_STEP_ID);
      assert.equal(reviews[0]!.gateReview?.severityCounts.minor, 1);
      assert.deepEqual(latestAcceptanceDecision(GATE_FLOW_ID, ledger), { kind: "none" }, "gate 结论不写 customer.decision");
      assert.equal(
        ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.flowId === GATE_FLOW_ID),
        false,
        "账本零客户决定",
      );

      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes(GATE_STEP_ID) && note.includes("已通过")), "产品收到 pass 系统行");

      // 下游放行：delivery-after-gate 依赖 gate 已 done ⇒ 进入 ready（应用不自动派发）。
      const ready = listReadyFlowSteps(parsed.flow);
      assert.ok(ready.ready.some((step) => step.id === "delivery-after-gate"), "gate done 后下游依赖步骤可派");
      assert.equal(
        ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === "delivery-after-gate"),
        false,
        "应用不自动派下游",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 gate 处置：fail 含 blocker/major ⇒ 独立返工路由、gate 保持 pending、不标 done、不写 customer.decision", async () => {
  const root = makeTempProjectRoot("ans-gate-fail-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    await seedGateLedger(root, GATE_FLOW_ID);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      await sleep(120);
      writeGateRecord(root, GATE_FLOW_ID, { status: "dispatched" });
      writeGateReport(root, GATE_FLOW_ID, GATE_STEP_ID, 1, "fail", [
        { id: "G1", severity: "blocker", owner: "executor", reason: "脚手架无法启动", action: "修复启动脚本", targets: ["scripts/start.sh"] },
        { id: "G2", severity: "major", owner: "executor", reason: "最小测试失败", action: "修复测试", targets: ["test/a.test.ts"] },
        { id: "G3", severity: "nit", owner: "executor", reason: "措辞", action: "可选润色", targets: ["README.md"] },
      ]);
      await openConvenerAndSettle(harness, root);

      await waitFor(() => {
        try {
          return (
            readGateRecordFile(root, GATE_FLOW_ID).status === "failed" &&
            JSON.parse(readFileSync(gateReworkRoutingAbsPath(root, GATE_FLOW_ID), "utf8")).status === "sent"
          );
        } catch {
          return false;
        }
      });
      const routing = JSON.parse(readFileSync(gateReworkRoutingAbsPath(root, GATE_FLOW_ID), "utf8")) as Record<string, unknown>;
      assert.equal(routing.schema, "gate-rework-routing/v1");
      assert.equal(routing.gateId, GATE_STEP_ID);
      assert.equal(routing.source, "proof");
      assert.equal(routing.sourceDetail, "gate-review");
      assert.equal(routing.status, "sent");
      assert.equal(typeof routing.reportSha256, "string");

      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
      assert.ok(parsed.ok);
      assert.equal(parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status, "pending", "fail 不标 gate done（保持 pending）");

      const ledger = await readGovernanceLedger(root);
      const reviews = ledger.entries.filter((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID);
      assert.equal(reviews.length, 1);
      assert.equal(reviews[0]!.gateReview?.conclusion, "fail");
      assert.equal(reviews[0]!.gateReview?.severityCounts.blocker, 1);
      assert.equal(latestAcceptanceDecision(GATE_FLOW_ID, ledger).kind, "none");
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.flowId === GATE_FLOW_ID), false);
      assert.equal(
        ledger.entries.some((entry) => entry.kind === "artifact.observed" && entry.artifactPath === `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`),
        false,
        "失败报告不得被观测成 done 证据",
      );

      const reworkTasks = harness.sendsByRole.get("liaison") ?? [];
      const gateTask = reworkTasks.find((text) => text.includes("gate 复核未通过") && text.includes(GATE_STEP_ID));
      assert.ok(gateTask, "产品收到 gate 独立返工任务");
      assert.match(gateTask, /Gate 返工任务｜gate-vertical-slice/, "返工任务首行含 gateId 与报告指针（i18n reworkTask）");
      assert.match(gateTask, new RegExp(`docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1\\.md`));
      assert.match(gateTask, /request_gate_review/, "返工完成后要求显式重新请求 gate 复核");
      assert.match(gateTask, /minor\/nit 项为非阻断/);

      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes(GATE_STEP_ID) && note.includes("未通过")), "产品收到 fail 系统行");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 gate 处置：fail 仅 minor/nit ⇒ returned-to-proof、不返工（防吹毛求疵）；gate 保持 pending", async () => {
  const root = makeTempProjectRoot("ans-gate-nit-only-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    await seedGateLedger(root, GATE_FLOW_ID);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      await sleep(120);
      writeGateRecord(root, GATE_FLOW_ID, { status: "dispatched" });
      writeGateReport(root, GATE_FLOW_ID, GATE_STEP_ID, 1, "fail", [
        { id: "G1", severity: "minor", owner: "executor", reason: "非关键缺陷", action: "后续修复", targets: ["src/x.ts"] },
        { id: "G2", severity: "nit", owner: "executor", reason: "风格", action: "可选", targets: ["README.md"] },
      ]);
      await openConvenerAndSettle(harness, root);

      await waitFor(() => readGateRecordFile(root, GATE_FLOW_ID).status === "returned-to-proof");
      const record = readGateRecordFile(root, GATE_FLOW_ID);
      assert.equal(record.reportSha256 !== null, true);
      assert.equal(existsSync(gateReworkRoutingAbsPath(root, GATE_FLOW_ID)), false, "只有 minor/nit 不触发返工路由");
      assert.equal((harness.sendsByRole.get("liaison") ?? []).some((text) => text.includes("gate 复核未通过")), false, "不生成返工任务");

      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
      assert.ok(parsed.ok);
      assert.equal(parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status, "pending");
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.some((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID), false, "非阻断 fail 不作为判定审计");
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.flowId === GATE_FLOW_ID), false);

      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes(GATE_STEP_ID) && note.includes("只含 minor/nit")), "产品收到 nitOnly 系统行");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 gate 处置：报告缺失/坏结构 ⇒ returned-to-proof；不通过、不返工、不猜", async () => {
  const root = makeTempProjectRoot("ans-gate-report-bad-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    await seedGateLedger(root, GATE_FLOW_ID);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      await sleep(120);
      writeGateRecord(root, GATE_FLOW_ID, { status: "dispatched" });
      await openConvenerAndSettle(harness, root);

      // 缺报告：记录保持 dispatched，主理如实系统行；不按超时判通过。
      await waitFor(() =>
        deliveryNotes(harness.events, "liaison").some((note) => note.includes(GATE_STEP_ID) && note.includes("报告不存在或不可读")),
      );
      assert.equal(readGateRecordFile(root, GATE_FLOW_ID).status, "dispatched");

      // 陈旧阈值（设计 §5.7）：派发超过 30 分钟仍无报告 ⇒ 记录转 returned-to-proof（允许统筹重新请求）。
      writeGateRecord(root, GATE_FLOW_ID, {
        status: "dispatched",
        dispatchedAt: new Date(Date.now() - 31 * 60_000).toISOString(),
      });
      harness.controls.get("convener")!.settle();
      await waitFor(() => readGateRecordFile(root, GATE_FLOW_ID).status === "returned-to-proof");
      assert.equal(existsSync(gateReworkRoutingAbsPath(root, GATE_FLOW_ID)), false, "陈旧无报告不返工");

      // 补一份结构坏的 acceptance-triage/v1 报告 ⇒ returned-to-proof（不解析自由文本、不猜结论）。
      mkdirSync(path.join(root, "docs", "acceptance"), { recursive: true });
      writeFileSync(
        path.join(root, "docs", "acceptance", `${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`),
        ["# Gate 复核报告", "", "```yaml", "schema: acceptance-triage/v1", "conclusion: maybe", "items: []", "```", ""].join("\n"),
      );
      harness.controls.get("convener")!.settle();
      await waitFor(() => readGateRecordFile(root, GATE_FLOW_ID).status === "returned-to-proof");
      assert.equal(existsSync(gateReworkRoutingAbsPath(root, GATE_FLOW_ID)), false, "坏报告不返工");
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
      assert.ok(parsed.ok);
      assert.equal(parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status, "pending");
      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(notes.some((note) => note.includes(GATE_STEP_ID) && note.includes("报告缺失或结构不合规")), "产品收到 returnedToProof 系统行");
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.some((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID), false, "坏报告不写判定审计");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 gate 重启恢复：passed + 步骤 pending ⇒ 导入时幂等收口一次；不重复 gate.review", async () => {
  const root = makeTempProjectRoot("ans-gate-recover-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    await seedGateLedger(root, GATE_FLOW_ID);
    writeGateReport(root, GATE_FLOW_ID, GATE_STEP_ID, 1, "pass", []);
    const reportSha = createHash("sha256")
      .update(readFileSync(path.join(root, "docs", "acceptance", `${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`)))
      .digest("hex");
    writeGateRecord(root, GATE_FLOW_ID, {
      status: "passed",
      reportSha256: reportSha,
      conclusion: "pass",
      decidedAt: new Date().toISOString(),
    });

    // 新进程等价：导入即恢复（模拟「记录已 passed、flow 步骤仍 pending」的崩溃窗口）。
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      await waitFor(() => {
        try {
          const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
          return parsed.ok && parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status === "done";
        } catch {
          return false;
        }
      });
      await openConvenerAndSettle(harness, root);
      await sleep(200);
      await openConvenerAndSettle(harness, root);
      await sleep(200);

      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID).length,
        1,
        "同一 gateId + reportSha 幂等：恰好一次 gate.review",
      );
      assert.equal(
        ledger.entries.filter((entry) => entry.kind === "artifact.observed" && entry.artifactPath === `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`).length,
        1,
        "artifact.observed 幂等",
      );
      assert.equal(readGateRecordFile(root, GATE_FLOW_ID).status, "passed");
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "恢复不自动重派 Proof");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-26 gate 重启恢复：failed 且返工路由未发送 ⇒ 补发一次；已发送后重启不重复", async () => {
  const root = makeTempProjectRoot("ans-gate-recover-rework-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    await seedGateLedger(root, GATE_FLOW_ID);
    writeGateReport(root, GATE_FLOW_ID, GATE_STEP_ID, 1, "fail", [
      { id: "G1", severity: "blocker", owner: "executor", reason: "不可用", action: "修复", targets: ["src/x.ts"] },
    ]);
    const reportSha = createHash("sha256")
      .update(readFileSync(path.join(root, "docs", "acceptance", `${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`)))
      .digest("hex");
    writeGateRecord(root, GATE_FLOW_ID, {
      status: "failed",
      reportSha256: reportSha,
      conclusion: "fail",
      severityCounts: { blocker: 1, major: 0, minor: 0, nit: 0 },
      itemCount: 1,
      decidedAt: new Date().toISOString(),
    });
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      await waitFor(() => existsSync(gateReworkRoutingAbsPath(root, GATE_FLOW_ID)));
      await waitFor(() => JSON.parse(readFileSync(gateReworkRoutingAbsPath(root, GATE_FLOW_ID), "utf8")).status === "sent");
      const sentCount = (harness.sendsByRole.get("liaison") ?? []).filter((text) => text.includes("gate 复核未通过")).length;
      assert.equal(sentCount, 1, "补发恰一条 gate 返工任务");
      const ledger = await readGovernanceLedger(root);
      assert.equal(ledger.entries.filter((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID).length, 1);

      await openConvenerAndSettle(harness, root);
      await sleep(250);
      const after = (harness.sendsByRole.get("liaison") ?? []).filter((text) => text.includes("gate 复核未通过")).length;
      assert.equal(after, 1, "路由已 sent：重启/再检查不重复任务");
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.flowId === GATE_FLOW_ID), false);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-27 request_gate_review：投递回执超时但质检在途 ⇒ 仍写 gate 记录 + dispatch.accepted 并回 dispatched；重复请求不重复", async () => {
  const root = makeTempProjectRoot("ans-gate-timeout-pending-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    writeGateCriteria(root, GATE_FLOW_ID);
    await seedGateLedger(root, GATE_FLOW_ID);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root }, {
      hangVerifierSend: true,
      requestGateReviewLimits: { totalMs: 700, stageMs: 150 },
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const requestGateReview = requestGateReviewOf(harness);
      const first = await requestGateReview({ flowId: GATE_FLOW_ID, gateId: GATE_STEP_ID });
      assert.equal(first.ok, true, first.message);
      assert.equal(first.code, "dispatched", "回执超时但有在途证据 ⇒ dispatched");
      assert.match(first.message ?? "", /确认回执超时/);
      assert.match(first.message ?? "", /仍在工作|已入队/);
      assert.match(first.message ?? "", /勿重复请求|不重复请求/);
      assert.equal(gateTaskSends(harness).length, 1, "任务已投出（恰一条）");

      const record = readGateRecordFile(root, GATE_FLOW_ID);
      assert.equal(record.status, "dispatched", "超时对账仍写 gate 记录（重启恢复的扫描源）");
      assert.equal(record.reportPath, `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`);
      assert.equal(record.reportVersion, 1);
      assert.equal(record.flowRevision, flowRevisionOf(root, GATE_FLOW_ID));
      const ledger = await readGovernanceLedger(root);
      const gateDispatches = (): number =>
        ledger.entries.filter(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.flowId === GATE_FLOW_ID &&
            entry.stepId === GATE_STEP_ID &&
            entry.targetRoleId === "verifier",
        ).length;
      assert.equal(gateDispatches(), 1, "账本恰一条 gate 派发记录（stepId=gateId）");

      const second = await requestGateReview({ flowId: GATE_FLOW_ID, gateId: GATE_STEP_ID });
      assert.equal(second.ok, false);
      assert.equal(second.code, "already-dispatched", "记录已落盘 ⇒ 重复请求幂等");
      assert.equal(gateTaskSends(harness).length, 1, "不重复派发");
      const ledgerAfter = await readGovernanceLedger(root);
      assert.equal(
        ledgerAfter.entries.filter(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.flowId === GATE_FLOW_ID &&
            entry.stepId === GATE_STEP_ID &&
            entry.targetRoleId === "verifier",
        ).length,
        1,
        "不重复写账本",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-27 request_gate_review：投递回执超时且目标已空闲、无排队 ⇒ unavailable，零 gate 记录/账本", async () => {
  const root = makeTempProjectRoot("ans-gate-timeout-idle-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    writeGateCriteria(root, GATE_FLOW_ID);
    await seedGateLedger(root, GATE_FLOW_ID);
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root }, {
      hangVerifierSend: true,
      requestGateReviewLimits: { totalMs: 900, stageMs: 200 },
    });
    try {
      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "convener", runtime: "demo" })).ok, true);
      const pending = requestGateReviewOf(harness)({ flowId: GATE_FLOW_ID, gateId: GATE_STEP_ID });
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      // 目标本轮已真实结束（settled），且没有排队/在途投递 ⇒ 没有任何“已受理”证据。
      harness.controls.get("verifier")!.settle();
      const result = await pending;
      assert.equal(result.ok, false, "无在途证据时不得谎称已派发");
      assert.equal(result.code, "unavailable");
      assert.match(result.message ?? "", /确认回执超时/);
      assert.equal(existsSync(gateRecordAbsPath(root, GATE_FLOW_ID)), false, "不得写假 gate 记录");
      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.some(
          (entry) =>
            entry.kind === "dispatch.accepted" &&
            entry.flowId === GATE_FLOW_ID &&
            entry.stepId === GATE_STEP_ID &&
            entry.targetRoleId === "verifier",
        ),
        false,
        "不得写假派发审计",
      );
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
      assert.ok(parsed.ok);
      assert.equal(parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status, "pending", "gate 保持 pending");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-27 gate 恢复：pass 报告已存在但 gate 记录缺失 ⇒ 导入恢复补建并收口一次；不重派、不重复审计", async () => {
  const root = makeTempProjectRoot("ans-gate-recovery-missing-record-");
  try {
    writeFlowStateFile(root, GATE_FLOW_ID, flowStateYaml(GATE_FLOW_ID, gateFlowSteps(GATE_FLOW_ID)));
    await seedGateLedger(root, GATE_FLOW_ID);
    writeGateReport(root, GATE_FLOW_ID, GATE_STEP_ID, 1, "pass", [
      { id: "G1", severity: "minor", owner: "executor", reason: "建议改进", action: "后续优化", targets: ["src/x.ts"] },
    ]);
    const reportSha = createHash("sha256")
      .update(readFileSync(path.join(root, "docs", "acceptance", `${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`)))
      .digest("hex");
    // 新进程等价：只有 pass 报告、没有 gate 记录（客户真机 pixel-snake 状态）。
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      await waitFor(() => {
        try {
          const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
          return parsed.ok && parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status === "done";
        } catch {
          return false;
        }
      });

      const record = readGateRecordFile(root, GATE_FLOW_ID);
      assert.equal(record.status, "passed");
      assert.equal(record.conclusion, "pass");
      assert.equal(record.reportSha256, reportSha);
      assert.match(String(record.requestId), /-recovery-/, "记录标记恢复来源");
      const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${GATE_FLOW_ID}.yaml`), "utf8"), GATE_FLOW_ID);
      assert.ok(parsed.ok);
      const gateStep = parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)!;
      assert.deepEqual(gateStep.evidence, { kind: "artifact", ref: `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md` });

      // gate.review 在 completeGateStep 之后异步追加：有界等待审计落盘（不改断言语义）。
      await waitForAsync(async () => {
        const ledger = await readGovernanceLedger(root);
        return ledger.entries.filter((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID).length === 1;
      });
      const ledger = await readGovernanceLedger(root);
      assert.equal(
        ledger.entries.filter(
          (entry) => entry.kind === "artifact.observed" && entry.artifactPath === `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`,
        ).length,
        1,
        "artifact.observed 恰一条",
      );
      assert.equal(
        ledger.entries.some((entry) => entry.kind === "dispatch.accepted" && entry.stepId === GATE_STEP_ID),
        false,
        "恢复不重派 Proof",
      );
      assert.equal(ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.flowId === GATE_FLOW_ID), false);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "恢复不向质检派任务");
      const notes = deliveryNotes(harness.events, "liaison");
      assert.ok(
        notes.some((note) => note.includes(GATE_STEP_ID) && note.includes("已通过") && note.includes("应用恢复")),
        "系统行如实标注恢复",
      );

      // 幂等：再触发真实事件（convener settle）两次，不重复 gate.review/artifact.observed/系统行。
      await openConvenerAndSettle(harness, root);
      await sleep(200);
      await openConvenerAndSettle(harness, root);
      await sleep(200);
      const after = await readGovernanceLedger(root);
      assert.equal(after.entries.filter((entry) => entry.kind === "gate.review" && entry.flowId === GATE_FLOW_ID).length, 1);
      assert.equal(
        after.entries.filter(
          (entry) => entry.kind === "artifact.observed" && entry.artifactPath === `docs/acceptance/${GATE_FLOW_ID}-${GATE_STEP_ID}-report-v1.md`,
        ).length,
        1,
      );
      assert.equal(
        deliveryNotes(harness.events, "liaison").filter((note) => note.includes(GATE_STEP_ID) && note.includes("已通过")).length,
        1,
        "pass 系统行不重复",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-27 gate 恢复：报告缺失/结构坏/fail 不恢复（不建记录、不收口、不返工）", async () => {
  const root = makeTempProjectRoot("ans-gate-recovery-negative-");
  try {
    const passFlow = "flow-recovery-pass-control";
    const failFlow = "flow-recovery-fail";
    const badFlow = "flow-recovery-bad";
    const missingFlow = "flow-recovery-missing";
    for (const flowId of [passFlow, failFlow, badFlow, missingFlow]) {
      writeFlowStateFile(root, flowId, flowStateYaml(flowId, gateFlowSteps(flowId)));
      await seedGateLedger(root, flowId);
    }
    writeGateReport(root, passFlow, GATE_STEP_ID, 1, "pass", []);
    writeGateReport(root, failFlow, GATE_STEP_ID, 1, "fail", [
      { id: "G1", severity: "blocker", owner: "executor", reason: "不可用", action: "修复", targets: ["src/x.ts"] },
    ]);
    mkdirSync(path.join(root, "docs", "acceptance"), { recursive: true });
    writeFileSync(
      path.join(root, "docs", "acceptance", `${badFlow}-${GATE_STEP_ID}-report-v1.md`),
      ["# Gate 复核报告", "", "```yaml", "schema: acceptance-triage/v1", "conclusion: maybe", "items: []", "```", ""].join("\n"),
    );
    // missingFlow：不写报告。
    const harness = await makeHarness(root, { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root });
    try {
      // 正向对照：pass 流程被恢复 ⇒ 证明扫描确实执行过。
      await waitFor(() => {
        try {
          const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${passFlow}.yaml`), "utf8"), passFlow);
          return parsed.ok && parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status === "done";
        } catch {
          return false;
        }
      });
      for (const flowId of [failFlow, badFlow, missingFlow]) {
        assert.equal(existsSync(gateRecordAbsPath(root, flowId)), false, `${flowId}：不得补建 gate 记录`);
        const parsed = parseFlowStateYaml(readFileSync(path.join(root, "docs", "flows", `${flowId}.yaml`), "utf8"), flowId);
        assert.ok(parsed.ok);
        assert.equal(parsed.flow.steps.find((step) => step.id === GATE_STEP_ID)?.status, "pending", `${flowId}：gate 保持 pending`);
        assert.equal(existsSync(gateReworkRoutingAbsPath(root, flowId)), false, `${flowId}：不路由返工`);
      }
      const ledger = await readGovernanceLedger(root);
      for (const flowId of [failFlow, badFlow, missingFlow]) {
        assert.equal(
          ledger.entries.some((entry) => entry.kind === "gate.review" && entry.flowId === flowId),
          false,
          `${flowId}：不写 gate.review`,
        );
        assert.equal(
          ledger.entries.some((entry) => entry.kind === "artifact.observed" && entry.flowId === flowId),
          false,
          `${flowId}：不观测坏/失败报告为 done 证据`,
        );
        assert.equal(
          ledger.entries.some((entry) => entry.kind === "customer.decision" && entry.flowId === flowId),
          false,
          `${flowId}：不写客户决定`,
        );
      }
      assert.equal((harness.sendsByRole.get("verifier") ?? []).length, 0, "恢复不派质检");
      assert.equal(
        (harness.sendsByRole.get("liaison") ?? []).some((text) => text.includes("gate 复核未通过")),
        false,
        "fail 不恢复 ⇒ 不路由返工任务",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————— 2026-10-26 需求变更申请（request_requirement_change；客户纠正） ——————————————
//
// 客户纠正（2026-10-26）：需求变更**不由主理审批**。发起方（统筹/提案）调用工具后，应用经**发起方
// 会话的客户卡通道**呈现 `request_choice(cardKind="decision")` 审批卡：
//   · 选项 approve / reject（带 flowId），**恰好一个** recommended=approve；
//   · 审批人＝客户（未勾选「替我决策」）或独立判断 agent（勾选时默认选推荐项）；发起方不得自批；
//   · 批准后应用把「已批准需求变更执行任务」交给主理（主理不审批，只执行意图变更并通知提案修订）；
//   · 拒绝/未获明确结果 ⇒ 回执给发起方；
//   · 工具回执 `dispatched` = 已提交独立审批，**不是批准**；不写 customer.decision/治理账本、不改写权；
//     主理不再收到原始申请任务（只在批准后收到执行任务）。
//
// 覆盖：载荷/存在性校验、审批卡形状与通道、批准→主理执行任务、拒绝回执、幂等、失败重试、忙时入队、
// 注入矩阵（统筹+提案；其他角色不可）与 requestClarification/viewImage 零回归。

/** trio 内置角色 + 一个真实项目角色（需求变更申请只该注入统筹/提案）。 */
function requirementChangeListing(projectRoot: string): ProjectListing {
  return listingWithProjectRoles({ ...trioListing(), projectRoot }, ["executor"]);
}

function seedIntentFile(projectRoot: string, intentId: string, body = "# 意图\n\n- goal: 示例\n"): void {
  mkdirSync(path.join(projectRoot, "docs", "intents"), { recursive: true });
  writeFileSync(path.join(projectRoot, "docs", "intents", `${intentId}.md`), body);
}

/**
 * 只用于「流程存在」的最小 flow：单步 pending（不会触发自动验收派发，避免测试被旁路账本/任务污染）。
 */
function seedRequirementChangeFlow(projectRoot: string, flowId: string): void {
  writeFlowStateFile(
    projectRoot,
    flowId,
    flowStateYaml(flowId, [{ id: "delivery-server", kind: "dispatch", status: "pending", owner: "executor" }]),
  );
}

/** 打开发起方会话并取回注入的 request_requirement_change 能力（未注入即失败）。 */
async function requirementChangeCapability(
  harness: Harness,
  projectRoot: string,
  roleId = "rapporteur",
): Promise<RequestRequirementChangeFn> {
  const opened = await harness.iface.openSession({ projectRoot, roleId, runtime: "demo" });
  assert.equal(opened.ok, true, opened.ok ? "" : (opened.error ?? "打开会话失败"));
  const fn = harness.openInputs.get(roleId)?.requestRequirementChange;
  assert.ok(fn, `${roleId} 会话应注入 requestRequirementChange`);
  return fn;
}

function readRequirementChangeTicketFile(root: string, flowId: string, requestId: string): RequirementChangeTicketRecord {
  const rel = requirementChangeTicketRelPath(flowId, requestId);
  return JSON.parse(readFileSync(path.join(root, ...rel.split("/")), "utf8")) as RequirementChangeTicketRecord;
}

/**
 * 可控客户卡通道替身：记录卡片；默认模拟 presenter 成功（微任务里回调 `onPresented`）；
 * 由测试用 `card.resolve(...)` 给出客户/判断 agent 的裁决。`present:false` 表示卡片从未呈现
 * （用于模拟卡校验拒发/通道不可用后立即结算）。
 */
interface DeferredRequirementCard {
  request: CustomerInputRequest;
  ctx: Parameters<NonNullable<DesktopDeps["customerInput"]>>[1];
  presented: boolean;
  resolve: (outcome: CustomerInputOutcome) => void;
}

function deferredCustomerChannel(options: { present?: boolean } = {}): {
  customerInput: NonNullable<DesktopDeps["customerInput"]>;
  cards: DeferredRequirementCard[];
} {
  const cards: DeferredRequirementCard[] = [];
  const customerInput: NonNullable<DesktopDeps["customerInput"]> = (request, ctx) => {
    const card: DeferredRequirementCard = {
      request,
      ctx,
      presented: false,
      resolve: () => {},
    };
    const promise = new Promise<CustomerInputOutcome>((resolve) => {
      card.resolve = resolve;
    });
    cards.push(card);
    if (options.present !== false) {
      queueMicrotask(() => {
        card.presented = true;
        ctx?.onPresented?.();
      });
    }
    return promise;
  };
  return { customerInput, cards };
}

function cardOptions(request: CustomerInputRequest): Array<{ id: string; recommended?: boolean }> {
  assert.equal(request.kind, "choice");
  return (request as { options: Array<{ id: string; recommended?: boolean }> }).options;
}

test("需求变更申请：载荷二次校验与意图/流程存在性（invalid / intent-not-found / flow-not-found，零票据/零卡）", async () => {
  const root = makeTempProjectRoot("ans-requirement-validation-");
  const flowId = "flow-req-validation";
  const intentId = "intent-req-validation";
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    const { customerInput, cards } = deferredCustomerChannel();
    const harness = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      const capability = await requirementChangeCapability(harness, root);
      const base = { changeKind: "authorization" as const, summary: "需要新授权", rationale: "策划需要访问外部服务" };
      const cases: Array<[string, unknown, string]> = [
        ["缺 flowId/intentId", base, "invalid"],
        ["flowId 非法 slug", { ...base, flowId: "../escape" }, "invalid"],
        ["intentId 非法 slug", { ...base, intentId: "Bad_ID" }, "invalid"],
        ["changeKind 非法", { ...base, flowId, changeKind: "bogus" }, "invalid"],
        ["summary 空", { ...base, flowId, summary: "   " }, "invalid"],
        ["rationale 空", { ...base, flowId, rationale: "" }, "invalid"],
        ["summary 超长", { ...base, flowId, summary: "x".repeat(501) }, "invalid"],
        ["rationale 超长", { ...base, flowId, rationale: "x".repeat(4001) }, "invalid"],
        ["impact 超长", { ...base, flowId, impact: "x".repeat(2001) }, "invalid"],
        ["proposedIntentPatch 超长", { ...base, flowId, proposedIntentPatch: "x".repeat(4001) }, "invalid"],
        ["流程不存在", { ...base, flowId: "no-such-flow" }, "flow-not-found"],
        ["意图不存在", { ...base, intentId: "no-such-intent" }, "intent-not-found"],
        ["流程存在但意图不存在", { ...base, flowId, intentId: "no-such-intent" }, "intent-not-found"],
      ];
      for (const [label, input, code] of cases) {
        const result = await capability(input as RequestRequirementChangeInput);
        assert.equal(result.ok, false, `${label} 应失败`);
        assert.equal(result.code, code, `${label}: ${result.message}`);
        assert.match(result.message, /未提交/, `${label} 必须明确未提交`);
      }
      assert.equal(cards.length, 0, "非法/不存在 ⇒ 零审批卡（不触达客户通道）");
      assert.equal(
        existsSync(path.join(root, ".ans", "governance", "requirement-changes")),
        false,
        "非法/不存在 ⇒ 零票据（不建目录）",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：应用经发起方会话呈现 decision 审批卡；批准后交产品执行意图变更（不写账本/不写 customer.decision）", async () => {
  const root = makeTempProjectRoot("ans-requirement-approval-");
  const flowId = "flow-req-approval";
  const intentId = "intent-req-approval";
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    const { customerInput, cards } = deferredCustomerChannel();
    const harness = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      const capability = await requirementChangeCapability(harness, root);
      const input: RequestRequirementChangeInput = {
        flowId,
        intentId,
        changeKind: "authorization",
        summary: "需要联网访问外部服务",
        rationale: "策划需要调用第三方 API，超出当前意图授权",
        impact: "增加一项外部依赖与凭据配置",
        proposedIntentPatch: "acceptance 增加外部服务可用性检查",
      };
      const result = await capability(input);
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, "dispatched", "提交后进入独立审批");
      assert.match(result.message, /独立审批/, "回执语义＝已提交独立审批");
      assert.match(result.message, /申请 ≠ 批准/);
      assert.match(result.message, /产品不审批/);
      assert.match(result.requestId ?? "", /^req-[0-9a-f]{16}$/, "requestId 为稳定哈希形状");

      assert.equal(cards.length, 1, "恰呈现一张审批卡");
      const card = cards[0]!;
      assert.equal(card.request.kind, "choice");
      assert.equal((card.request as { cardKind?: string }).cardKind, "decision", "审批卡 cardKind=decision");
      assert.equal((card.request as { flowId?: string }).flowId, flowId, "审批卡带 flowId");
      const options = cardOptions(card.request);
      assert.deepEqual(options.map((option) => option.id), ["approve", "reject"], "选项至少 approve/reject");
      assert.equal(options.filter((option) => option.recommended === true).length, 1, "恰好一个推荐项");
      assert.equal(options.find((option) => option.recommended === true)?.id, "approve", "推荐 approve");
      assert.equal(card.ctx.roleId, "rapporteur", "卡落发起方会话通道");
      assert.equal(card.ctx.governanceModel, "trio");
      assert.equal(card.presented, true, "presenter 成功后才算已提交");

      const ticket = readRequirementChangeTicketFile(root, flowId, result.requestId!);
      assert.equal(ticket.schema, "requirement-change-request/v2");
      assert.equal(ticket.requestId, result.requestId);
      assert.equal(ticket.requestedBy, "rapporteur", "票据记录发起方");
      assert.equal(ticket.status, "dispatched", "已提交独立审批（不是批准）");
      assert.equal(ticket.submission?.cardRoleId, "rapporteur");
      assert.equal(ticket.submission?.cardKind, "decision");
      assert.deepEqual(ticket.submission?.options, ["approve", "reject"]);
      assert.equal(ticket.submission?.recommended, "approve");
      assert.equal(ticket.approval, null);
      assert.equal(ticket.leadDispatch, null);
      assert.equal(harness.sendsByRole.get("liaison"), undefined, "产品不接收原始申请任务");

      card.resolve({ outcome: "answered", value: { selected: ["approve"] }, operatorId: "judge:pi" });
      await waitForAsync(async () => {
        const current = readRequirementChangeTicketFile(root, flowId, result.requestId!);
        return current.status === "approved" && current.leadDispatch !== null;
      }, 4000);
      const approvedTicket = readRequirementChangeTicketFile(root, flowId, result.requestId!);
      assert.equal(approvedTicket.approval?.outcome, "approved");
      assert.equal(approvedTicket.approval?.source, "judge", "判断代批如实归因");
      assert.equal(typeof approvedTicket.leadDispatch?.clientMessageId, "string");
      assert.equal(approvedTicket.leadDispatch?.error, undefined);

      const sends = harness.sendsByRole.get("liaison") ?? [];
      assert.equal(sends.length, 1, "批准后恰一条产品执行任务");
      const task = sends[0]!;
      assert.ok(task.startsWith("需求变更执行任务"), "执行任务标签");
      assert.match(task, /不审批/);
      assert.match(task, /hand_off_intent/);
      assert.match(task, /判断 agent（「替我决策」）代批/, "执行任务带审批来源");
      assert.ok(task.includes(flowId) && task.includes(intentId) && task.includes(result.requestId!), "执行任务带 ids");
      assert.ok(task.includes(input.summary) && task.includes(input.rationale), "执行任务自足（摘要/理由）");
      assert.ok(task.includes(requirementChangeTicketRelPath(flowId, result.requestId!)), "附票据路径");

      const notes = deliveryNotes(harness.events, "rapporteur");
      assert.ok(
        notes.some((note) => note.includes("系统·需求变更") && note.includes(result.requestId!)),
        "发起方聊天流落提交系统行",
      );
      assert.ok(
        notes.some((note) => note.includes("已通过独立审批") && note.includes(result.requestId!)),
        "批准后落审批结果系统行",
      );
      assert.equal(
        existsSync(path.join(root, ".ans", "governance", "ledger.jsonl")),
        false,
        "不写治理账本（审批结果不是验收/派发证据）",
      );
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：独立审批 reject ⇒ 票据 rejected + 回执发起方；不向产品投任何任务", async () => {
  const root = makeTempProjectRoot("ans-requirement-reject-");
  const flowId = "flow-req-reject";
  const intentId = "intent-req-reject";
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    const { customerInput, cards } = deferredCustomerChannel();
    const harness = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      const capability = await requirementChangeCapability(harness, root);
      const result = await capability({
        flowId,
        intentId,
        changeKind: "scope",
        summary: "范围增加外部服务",
        rationale: "客户目标需要外部服务",
      });
      assert.equal(result.code, "dispatched");
      assert.equal(cards.length, 1);
      cards[0]!.resolve({ outcome: "answered", value: { selected: ["reject"] }, operatorId: "desktop-op" });
      await waitForAsync(async () => readRequirementChangeTicketFile(root, flowId, result.requestId!).status === "rejected", 4000);
      const ticket = readRequirementChangeTicketFile(root, flowId, result.requestId!);
      assert.equal(ticket.approval?.outcome, "rejected");
      assert.equal(ticket.approval?.source, "customer");
      assert.deepEqual(ticket.approval?.selected, ["reject"]);
      assert.equal(ticket.leadDispatch, null, "拒绝不产生产品执行任务");
      assert.equal(harness.sendsByRole.get("liaison"), undefined, "产品零任务");

      await waitFor(
        () => (harness.sendsByRole.get("rapporteur") ?? []).some((text) => text.includes("未通过独立审批")),
        4000,
      );
      const receipt = (harness.sendsByRole.get("rapporteur") ?? []).find((text) => text.includes("未通过独立审批"))!;
      assert.ok(receipt.includes(result.requestId!), "回执带申请 id");
      assert.match(receipt, /产品不审批/, "回执说明产品不审批");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：卡校验拒发/未呈现 ⇒ rejected + 票据 failed（不冒充客户拒绝）", async () => {
  const root = makeTempProjectRoot("ans-requirement-gate-reject-");
  const flowId = "flow-req-gate-reject";
  const intentId = "intent-req-gate-reject";
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    let calls = 0;
    const customerInput: NonNullable<DesktopDeps["customerInput"]> = () => {
      calls += 1;
      return { outcome: "declined", reason: "决策卡缺少唯一推荐项（测试）", notPresented: true };
    };
    const harness = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      const capability = await requirementChangeCapability(harness, root);
      const result = await capability({ flowId, intentId, changeKind: "cost", summary: "增加付费服务", rationale: "需要预算" });
      assert.equal(result.ok, false);
      assert.equal(result.code, "rejected", "应用拒发卡 ≠ 客户拒绝");
      assert.match(result.message, /提交被拒/);
      assert.equal(calls, 1, "触达通道一次（应用侧拒发）");
      const ticket = readRequirementChangeTicketFile(root, flowId, result.requestId!);
      assert.equal(ticket.status, "failed");
      assert.equal(ticket.submission, null, "卡片从未呈现");
      assert.equal(ticket.approval, null);
      assert.match(ticket.error ?? "", /缺少唯一推荐项/);
      assert.equal(harness.sendsByRole.get("liaison"), undefined);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：同一 flow 有待处理/已批准申请 ⇒ already-dispatched；同内容 requestId 稳定", async () => {
  const root = makeTempProjectRoot("ans-requirement-idempotent-");
  const flowId = "flow-req-idempotent";
  const intentId = "intent-req-idempotent";
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    const { customerInput, cards } = deferredCustomerChannel();
    const harness = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      const capability = await requirementChangeCapability(harness, root);
      const firstInput: RequestRequirementChangeInput = {
        flowId,
        intentId,
        changeKind: "scope",
        summary: "范围增加外部服务",
        rationale: "客户目标需要外部服务",
      };
      const first = await capability(firstInput);
      assert.equal(first.code, "dispatched");
      assert.equal(cards.length, 1);

      const same = await capability(firstInput);
      assert.equal(same.ok, true, "此前已提交属于幂等成功");
      assert.equal(same.code, "already-dispatched");
      assert.equal(same.requestId, first.requestId, "同内容 requestId 稳定");

      const different = await capability({
        flowId,
        intentId,
        changeKind: "cost",
        summary: "范围再增加一项",
        rationale: "另一项外部依赖",
      });
      assert.equal(different.ok, true);
      assert.equal(different.code, "already-dispatched");
      assert.equal(different.requestId, first.requestId, "同一 flow 待处理申请挡住新内容");
      assert.equal(cards.length, 1, "不重复呈现审批卡");
      const ticketNames = readdirSync(path.join(root, ".ans", "governance", "requirement-changes", flowId));
      assert.equal(ticketNames.filter((name) => name.endsWith(".json")).length, 1, "不新增第二张票据");

      cards[0]!.resolve({ outcome: "answered", value: { selected: ["approve"] }, operatorId: "judge:pi" });
      await waitForAsync(async () => readRequirementChangeTicketFile(root, flowId, first.requestId!).status === "approved", 4000);
      await waitFor(() => (harness.sendsByRole.get("liaison") ?? []).length === 1, 4000);
      const afterApproval = await capability(firstInput);
      assert.equal(afterApproval.code, "already-dispatched");
      assert.match(afterApproval.message, /已通过独立审批/, "已批准状态如实说明（不是仍在审批）");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：审批通道不可用 ⇒ unavailable + 票据 failed；修复后重试成功且 requestId/at 稳定", async () => {
  const root = makeTempProjectRoot("ans-requirement-retry-");
  const flowId = "flow-req-retry";
  const intentId = "intent-req-retry";
  const input: RequestRequirementChangeInput = {
    flowId,
    intentId,
    changeKind: "constraint",
    summary: "新增部署约束",
    rationale: "客户环境要求离线部署",
  };
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    const failing = await makeHarness(root, requirementChangeListing(root));
    let requestId: string;
    let ticketAt: string;
    try {
      const capability = await requirementChangeCapability(failing, root);
      const first = await capability(input);
      assert.equal(first.ok, false);
      assert.equal(first.code, "unavailable", first.message);
      assert.match(first.message, /未提交独立审批/);
      requestId = first.requestId!;
      const ticket = readRequirementChangeTicketFile(root, flowId, requestId);
      assert.equal(ticket.status, "failed", "未呈现审批卡 ⇒ 票据如实 failed（可重试）");
      assert.ok(ticket.error !== null && ticket.error !== "", "failed 票据写明原因");
      assert.equal(ticket.submission, null);
      ticketAt = ticket.at;
    } finally {
      await failing.iface.stopSession();
    }

    const { customerInput, cards } = deferredCustomerChannel();
    const healthy = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      const retry = await (await requirementChangeCapability(healthy, root))(input);
      assert.equal(retry.ok, true, retry.message);
      assert.equal(retry.code, "dispatched");
      assert.equal(retry.requestId, requestId, "同一请求 requestId 稳定");
      const ticket = readRequirementChangeTicketFile(root, flowId, requestId);
      assert.equal(ticket.status, "dispatched");
      assert.equal(ticket.at, ticketAt, "重试保留首次登记时间");
      assert.ok(ticket.attempts >= 2, "票据记录尝试次数");
      assert.equal(cards.length, 1, "重试成功恰一张审批卡");
      cards[0]!.resolve({ outcome: "answered", value: { selected: ["approve"] }, operatorId: "judge:pi" });
      await waitForAsync(async () => readRequirementChangeTicketFile(root, flowId, requestId).status === "approved", 4000);
      await waitFor(() => (healthy.sendsByRole.get("liaison") ?? []).length === 1, 4000);
    } finally {
      await healthy.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：产品忙碌 ⇒ 已批准执行任务入队（queued 仍成功），settle 后按序投递", async () => {
  const root = makeTempProjectRoot("ans-requirement-busy-");
  const flowId = "flow-req-busy";
  const intentId = "intent-req-busy";
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    const { customerInput, cards } = deferredCustomerChannel();
    const harness = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      const opened = await harness.iface.openSession({ projectRoot: root, roleId: "liaison", runtime: "demo" });
      assert.equal(opened.ok, true);
      const hold = await harness.iface.sendSession({
        text: "产品占位轮次",
        target: { projectRoot: root, roleId: "liaison", runtime: "demo" },
      });
      assert.equal(hold.ok, true, "占位轮次已投出");
      assert.equal((harness.sendsByRole.get("liaison") ?? []).length, 1);

      const capability = await requirementChangeCapability(harness, root);
      const result = await capability({
        flowId,
        intentId,
        changeKind: "other",
        summary: "产品忙时批准",
        rationale: "验证排队语义",
      });
      assert.equal(result.code, "dispatched");
      cards[0]!.resolve({ outcome: "answered", value: { selected: ["approve"] }, operatorId: "judge:pi" });
      await waitForAsync(async () => readRequirementChangeTicketFile(root, flowId, result.requestId!).leadDispatch?.queued === true, 4000);
      const ticket = readRequirementChangeTicketFile(root, flowId, result.requestId!);
      assert.equal(ticket.status, "approved");
      assert.equal(ticket.leadDispatch?.queued, true, "票据如实记录 queued");
      assert.equal((harness.sendsByRole.get("liaison") ?? []).length, 1, "忙时先入队、不并发直发");

      harness.controls.get("liaison")!.settle();
      await waitFor(() => (harness.sendsByRole.get("liaison") ?? []).length === 2, 4000);
      const task = (harness.sendsByRole.get("liaison") ?? [])[1]!;
      assert.ok(task.startsWith("需求变更执行任务"), "settle 后按序投出已批准执行任务");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：运营也可发起/持有审批卡（拒绝回执给运营）；其他角色不注入", async () => {
  const root = makeTempProjectRoot("ans-requirement-convener-");
  const flowId = "flow-req-convener";
  const intentId = "intent-req-convener";
  try {
    seedRequirementChangeFlow(root, flowId);
    seedIntentFile(root, intentId);
    const { customerInput, cards } = deferredCustomerChannel();
    const harness = await makeHarness(root, requirementChangeListing(root), { customerInput });
    try {
      for (const roleId of ["rapporteur", "liaison", "nominator", "convener", "verifier", "executor"]) {
        const opened = await harness.iface.openSession({ projectRoot: root, roleId, runtime: "demo" });
        assert.equal(opened.ok, true, `${roleId}: ${opened.ok ? "" : (opened.error ?? "")}`);
      }
      for (const roleId of ["rapporteur", "convener"]) {
        assert.equal(
          typeof harness.openInputs.get(roleId)?.requestRequirementChange,
          "function",
          `${roleId}（运营/提案）注入 requestRequirementChange`,
        );
      }
      for (const roleId of ["liaison", "nominator", "verifier", "executor"]) {
        assert.equal(
          harness.openInputs.get(roleId)?.requestRequirementChange,
          undefined,
          `${roleId} 不注入 requestRequirementChange（其他内置角色/项目角色不可发起）`,
        );
      }
      // 零回归：requestClarification 仍仅报告员；viewImage 仍全部角色。
      assert.equal(typeof harness.openInputs.get("rapporteur")?.requestClarification, "function");
      for (const roleId of ["liaison", "nominator", "convener", "verifier", "executor"]) {
        assert.equal(harness.openInputs.get(roleId)?.requestClarification, undefined, `${roleId} 澄清注入零回归`);
      }
      for (const roleId of ["rapporteur", "liaison", "nominator", "convener", "verifier", "executor"]) {
        assert.equal(typeof harness.openInputs.get(roleId)?.viewImage, "function", `${roleId} viewImage 零回归`);
      }

      const convenerCapability = await requirementChangeCapability(harness, root, "convener");
      const result = await convenerCapability({
        flowId,
        intentId,
        changeKind: "authorization",
        summary: "运营发现新授权需求",
        rationale: "核证时发现需要外部访问",
      });
      assert.equal(result.code, "dispatched");
      assert.equal(cards.length, 1);
      assert.equal(cards[0]!.ctx.roleId, "convener", "卡落运营会话通道");
      cards[0]!.resolve({ outcome: "answered", value: { selected: ["reject"] }, operatorId: "desktop-op" });
      await waitForAsync(async () => readRequirementChangeTicketFile(root, flowId, result.requestId!).status === "rejected", 4000);
      const ticket = readRequirementChangeTicketFile(root, flowId, result.requestId!);
      assert.equal(ticket.requestedBy, "convener");
      await waitFor(
        () => (harness.sendsByRole.get("convener") ?? []).some((text) => text.includes("未通过独立审批")),
        4000,
      );
      assert.equal((harness.sendsByRole.get("liaison") ?? []).length, 0, "拒绝不向产品投任务");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("需求变更申请：DesktopDeps.requestRequirementChange 可整体替换（测试接缝，补入 projectRoot/发起角色/引擎）", async () => {
  const root = makeTempProjectRoot("ans-requirement-injection-");
  try {
    const { customerInput } = deferredCustomerChannel();
    const received: Array<{ projectRoot: string; requesterRoleId: string; runtime: string; input: unknown }> = [];
    // 通过会话注入端替换：验证闭包补参，不依赖本层实现。
    const fake = await makeHarness(root, requirementChangeListing(root), {
      customerInput,
      requestRequirementChange: async (projectRoot, requesterRoleId, runtime, input) => {
        received.push({ projectRoot, requesterRoleId, runtime, input });
        return { ok: true, code: "dispatched", message: "fake 能力已受理" };
      },
    });
    try {
      const capability = await requirementChangeCapability(fake, root);
      const payload: RequestRequirementChangeInput = {
        flowId: "flow-fake",
        changeKind: "other",
        summary: "假能力",
        rationale: "接缝验证",
      };
      const result = await capability(payload);
      assert.equal(result.code, "dispatched");
      assert.deepEqual(received, [
        { projectRoot: root, requesterRoleId: "rapporteur", runtime: "demo", input: payload },
      ]);
    } finally {
      await fake.iface.stopSession();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

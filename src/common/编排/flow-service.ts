// src/common/编排/flow-service.ts
// **Flow 文件方法化（编排侧核心，2026-10-20 客户拍板「按这个方案做吧」）**。
//
// 目标：应用是 `docs/flows/<flowId>.yaml` 的**唯一写者**；角色不再直接写流程文件，改用工具
// （`flow_get` / `flow_step_update` / `flow_step_supersede`，能力字段名 `flowGet` /
// `flowStepUpdate` / `flowStepSupersede`）。本模块只写 YAML，不写客户决定账本。
//
// 钉死语义：
//   · **串行**：同一项目（projectRoot）的 mutation 走进程内 Promise 链（读-改-写都在临界区）；
//   · **版本校验 + 单次重试**（2026-10-24 P1-6）：`expectedRevision` 必须等于当前文件字节的 sha256；
//     冲突时重读当前 flow，仅当目标步骤当前状态仍允许该迁移、且 done 证据在当前账本仍有效时，
//     用当前 revision **重试一次**（诊断 `flow.conflict.retry`）；否则仍返回 `revision-conflict`
//     （不掩盖真实冲突，不无限重试）；
//   · **证据对账**：`done` 必须有 evidence，并用 `flow-state.ts::validateFlowEvidence` 对候选 flow
//     与账本对账（只过滤目标 stepId 的 issue）；
//   · **原子写**：复用 `common/shared/atomic-write.ts`（tmp + fsync + rename）；失败不破坏原文件；
//   · **幂等**：目标步骤当前 status/evidence 与请求一致 ⇒ `idempotent:true`，不写盘；
//   · **权限**：工作流管理者 = Steward/Convener（actorPower="schedule"）或 Lead/Liaison
//     （actorPower="liaison"，2026-10-20 客户拍板「把主理 Lead 设为工作流管理者」）——可更新全部未终态步骤；
//     其他角色只能更新 owner=自己的步骤。**2026-10-24 P1-7 收紧**：`dispatched→delivered` **只允许步骤
//     owner** 标记（Steward/Lead 等 manager 不代标 delivered）；`delivered→done` 仍仅管理者；
//     `dispatched|delivered→failed|blocked` 保持；`pending→dispatched`、`failed|blocked→dispatched` 仅管理者；
//     supersede 仅管理者。
//
// 本模块不 import 适配器/运行时核心；只读 `flow-state.ts` 与账本，写 YAML 经共享原子写原语。

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { atomicWrite } from "../shared/atomic-write.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
import {
  flowStatePath,
  isCustomerDecisionKindRef,
  isFlowGateStepId,
  isReservedAcceptanceStepId,
  latestAcceptanceDecision,
  latestCustomerDecision,
  parseFlowStateYaml,
  validateFlowEvidence,
  type FlowGateKind,
  type FlowState,
  type FlowStateStep,
} from "./flow-state.ts";
import { appendGovernanceLedger, readGovernanceLedger, type GovernanceLedgerEntry, type GovernancePower } from "./governance-ledger.ts";
import { gateReviewReportRelPath, latestAcceptanceCriteriaRelPath, latestGateReviewReport } from "./governance-gate.ts";
import { parseAcceptanceTriageReport, type AcceptanceTriageItem, type AcceptanceTriageSection } from "./acceptance-triage.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import type {
  FlowGetFn,
  FlowStepSupersedeFn,
  FlowStepUpdateFn,
  FlowToolEvidence,
  FlowToolResult,
  FlowToolStepKind,
  FlowToolStepView,
  FlowToolStatus,
  FlowToolView,
} from "../../model/runtime.ts";

// —————————————————————— 公共类型（单一来源 = 运行时中立契约 `model/runtime.ts`） ——————————————————————
//
// 2026-10-20 运行时核心已落盘 `FlowTool*` 契约；本模块**再导出同一组符号**，不保留第二份形状。
export type {
  FlowGetFn,
  FlowStepSupersedeFn,
  FlowStepUpdateFn,
  FlowToolEvidence,
  FlowToolResult,
  FlowToolStepKind,
  FlowToolStepView,
  FlowToolStatus,
  FlowToolView,
} from "../../model/runtime.ts";

export interface FlowService {
  get(input: { flowId?: string }): Promise<FlowToolResult>;
  update(input: {
    flowId: string;
    stepId: string;
    status: FlowToolStatus;
    evidence?: FlowToolEvidence;
    expectedRevision: string;
    idempotencyKey?: string;
    note?: string;
  }): Promise<FlowToolResult>;
  supersede(input: {
    flowId: string;
    oldStepId: string;
    newStepId: string;
    title: string;
    owner: string;
    kind: FlowToolStepKind;
    expectedRevision: string;
    reason?: string;
    idempotencyKey?: string;
    /** 新步骤并行组（可选；MapReduce 方案 A；语法/静态校验由 flow-state 执行）。 */
    parallelGroup?: string;
    /** 新步骤前置 step id（可选；存在性/环/前置 done 校验由 flow-state/governance-gate 执行）。 */
    dependsOn?: string[];
  }): Promise<FlowToolResult>;
}

export interface CreateFlowServiceOptions {
  projectRoot: string;
  actorRoleId: string;
  /** `schedule`（Steward/Convener）、`liaison`（Lead/工作流管理者）或 `proposal`/`nomination`/`verification`/`project`。 */
  actorPower: string;
  /** `get` 缺省 flowId（通常为会话当前 flow）。 */
  defaultFlowId?: string;
  /** 测试注入：覆盖原子写（缺省 `common/shared/atomic-write.ts::atomicWrite`）。 */
  writeFile?: (absPath: string, data: string) => Promise<void>;
}

// —————————————————————— 基础 ——————————————————————

/**
 * flowId / stepId 形状（**单一来源**：运行时核心 `src/model/runtime.ts` 的 `GOVERNANCE_SLUG_PATTERN`；
 * 2026-10-22 收紧为禁止首/尾连字符）。
 */
const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const TERMINAL_STATUSES: ReadonlySet<FlowToolStatus> = new Set(["done", "superseded"]);

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function internalError(err: unknown): FlowToolResult {
  return {
    ok: false,
    code: "internal-error",
    error: `流程服务内部错误：${err instanceof Error ? err.message : String(err)}`,
  };
}

function flowAbsPath(projectRoot: string, flowId: string): string {
  return path.join(projectRoot, ...flowStatePath(flowId).split("/"));
}

function isManagerPower(power: string): boolean {
  return power === "schedule" || power === "liaison";
}

/**
 * `flow_get` / flow 回执视图（**2026-10-24 P0-1**：在运行时契约 `FlowToolView` 之上承载
 * `release`）。`src/model/runtime.ts` 的 `FlowToolView` 是运行时核心冻结契约；本角色不改该文件，
 * 编排侧以结构扩展返回同一形状 + `release`（结构兼容，桌面/工具层原样透传，不重算）。
 */
export interface FlowToolViewWithRelease extends FlowToolView {
  /**
   * 发布元数据标记（缺省 false）：`release` 仅可选发布元数据，**不是独立验收的启动条件**；
   * 所有变更（含非发布）在流程齐备后都由应用按验收门派 Proof / 验收（2026-10-24 客户修订）。
   */
  release: boolean;
  /** 步骤视图原样携带可选 `gateKind`（缺省 ⇒ 字段缺席；旧 flow 视图形状逐字不变）。 */
  steps: FlowToolStepViewWithGate[];
}

/** flow 回执步骤视图：运行时契约 `FlowToolStepView` + 可选 `gateKind`（仅新增字段，旧 flow 不带）。 */
export interface FlowToolStepViewWithGate extends FlowToolStepView {
  gateKind?: FlowGateKind;
}

function viewOf(flow: FlowState, revision: string, actorRoleId: string, actorPower: string): FlowToolViewWithRelease {
  const isManager = isManagerPower(actorPower);
  const canUpdate = flow.steps
    .filter((step) => !TERMINAL_STATUSES.has(step.status))
    .filter((step) => isManager || step.owner === actorRoleId)
    .map((step) => step.id);
  return {
    flowId: flow.flowId,
    revision,
    qualityTier: flow.qualityTier,
    release: flow.release === true,
    steps: flow.steps.map((step) => ({
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind,
      status: step.status,
      ...(step.gateKind !== undefined ? { gateKind: step.gateKind } : {}),
      ...(step.evidence !== undefined ? { evidence: { kind: step.evidence.kind, ref: step.evidence.ref } } : {}),
      ...(step.supersedes !== undefined ? { supersedes: [...step.supersedes] } : {}),
      ...(step.supersededBy !== undefined ? { supersededBy: step.supersededBy } : {}),
      ...(step.parallelGroup !== undefined ? { parallelGroup: step.parallelGroup } : {}),
      ...(step.dependsOn !== undefined ? { dependsOn: [...step.dependsOn] } : {}),
    })),
    canUpdate,
  };
}

/** 保留已知字段与步骤顺序；不做注释/字节级保真（数据保真）。 */
function serializeFlow(flow: FlowState): string {
  const document = {
    flowId: flow.flowId,
    version: flow.version,
    qualityTier: flow.qualityTier,
    ...(flow.status !== undefined ? { status: flow.status } : {}),
    ...(flow.release !== undefined ? { release: flow.release } : {}),
    steps: flow.steps.map((step) => ({
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind,
      status: step.status,
      ...(step.gateKind !== undefined ? { gateKind: step.gateKind } : {}),
      ...(step.evidence !== undefined ? { evidence: { kind: step.evidence.kind, ref: step.evidence.ref } } : {}),
      ...(step.supersedes !== undefined ? { supersedes: [...step.supersedes] } : {}),
      ...(step.supersededBy !== undefined ? { supersededBy: step.supersededBy } : {}),
      ...(step.parallelGroup !== undefined ? { parallelGroup: step.parallelGroup } : {}),
      ...(step.dependsOn !== undefined ? { dependsOn: [...step.dependsOn] } : {}),
    })),
  };
  return stringifyYaml(document, { lineWidth: 0 });
}

function sameEvidence(left: FlowStateStep["evidence"], right: FlowToolEvidence | undefined): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return left.kind === right.kind && left.ref === right.ref;
}

function sameOptionalStringList(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// —————————————————————— 受控扩展：release 标记（2026-10-24 P0-1） ——————————————————————

/** `validateReleaseOnlyExtension` 的判定结果（`ok:false` 时 code 为机读原因）。 */
export interface ReleaseExtensionValidation {
  ok: boolean;
  /**
   * 拒绝原因：
   *   · `previous-invalid`     现有流程 YAML 不合法（受控扩展只能在有效流程上标记 release）；
   *   · `invalid-flow`         候选 YAML 不合法；
   *   · `release-downgrade`    试图把 release 从 true 改回 false/缺省（发布标记不能撤回）；
   *   · `release-other-changes` 发布标记（任一侧 release: true）伴随其它字段/步骤变化。
   */
  code?: string;
  error?: string;
}

/** 「除 release 外的字段/步骤逐字段不变」比较（字段顺序由解析器固定）。 */
function flowsEqualExceptRelease(left: FlowState, right: FlowState): boolean {
  const { release: _leftRelease, ...leftRest } = left;
  const { release: _rightRelease, ...rightRest } = right;
  return JSON.stringify(leftRest) === JSON.stringify(rightRest);
}

/**
 * **受控扩展校验**（2026-10-24 P0-1，闸门 2 delta §2/§4）：**只约束发布标记（release）本身**。
 *
 * 作用域（2026-10-24 协调修正）：
 *   · **双方都非发布（previous/next 均非 true）⇒ 通过**：普通 flow 写卡（扩步骤、修 dependsOn 等）
 *     不是发布标记，保持既有 `parseFlowStateYaml` 校验，不做 release-only 限制；
 *   · 只有 `previous.release === true` 或 `next.release === true` 时才执行 release-only 规则：
 *       - false/缺省→true 且其余字段/步骤逐字段不变（含顺序）⇒ 通过；
 *       - true→false/缺省 ⇒ `release-downgrade`（发布标记不能撤回）；
 *       - true→true 或 false/缺省→true 但其它字段/步骤有变化 ⇒ `release-other-changes`。
 *
 * 规则（fail-closed）：现有文件不合法 ⇒ `previous-invalid`；候选不合法 ⇒ `invalid-flow`。
 * 纯函数：只解析两段 YAML 文本，不写盘；由编排 `run-role` 的 Flow YAML 写卡校验接线调用。
 */
export function validateReleaseOnlyExtension(input: {
  flowId: string;
  previousText: string;
  nextText: string;
}): ReleaseExtensionValidation {
  const previous = parseFlowStateYaml(input.previousText, input.flowId);
  if (!previous.ok) {
    return {
      ok: false,
      code: "previous-invalid",
      error: `现有流程 YAML 校验失败（${previous.error}）；受控扩展只允许在有效流程上标记 release。`,
    };
  }
  const next = parseFlowStateYaml(input.nextText, input.flowId);
  if (!next.ok) {
    return { ok: false, code: "invalid-flow", error: `候选流程 YAML 校验失败：${next.error}` };
  }

  const previouslyReleased = previous.flow.release === true;
  const nextReleased = next.flow.release === true;
  // 普通 flow 写卡（双方都非发布）：不涉及发布标记，按既有 YAML 校验放行；不施加 release-only 限制。
  if (!previouslyReleased && !nextReleased) return { ok: true };
  if (previouslyReleased && !nextReleased) {
    return {
      ok: false,
      code: "release-downgrade",
      error:
        "受控扩展不允许把 release 从 true 改回 false/缺省（发布标记不能撤回；" +
        "如需撤回必须重开闸门并另做变更）。",
    };
  }
  if (!flowsEqualExceptRelease(previous.flow, next.flow)) {
    return {
      ok: false,
      code: "release-other-changes",
      error:
        "发布标记（release）只能单独设置：只允许 release 从 false/缺省→true，其余字段/步骤必须保持不变；" +
        "本次候选还改动了其它内容（请用 flow_get / flow_step_update / flow_step_supersede 推进步骤）。",
    };
  }
  return { ok: true };
}

/**
 * 合法状态迁移（管理者/owner 共用；owner 另有额外限制在调用处）：
 *   pending → dispatched（仅管理者）
 *   dispatched → delivered（**仅步骤 owner**；2026-10-24 P1-7：Steward/Lead 等 manager 不代标 delivered）
 *   dispatched | delivered → failed | blocked（owner 或管理者）
 *   delivered → done（仅管理者）
 *   failed | blocked | aborted → dispatched（仅管理者：重派）
 * `superseded` 只能走 `supersede`，不能经 update 设置。
 */
function isTransitionAllowed(
  from: FlowToolStatus,
  to: FlowToolStatus,
  actor: { isManager: boolean; isOwner: boolean },
): boolean {
  if (to === "superseded") return false;
  if (from === "pending") return actor.isManager && to === "dispatched";
  if (from === "dispatched") {
    // P1-7：交付声明只能由步骤 owner 发出；manager 只能在 delivered 之后核证 done。
    if (to === "delivered") return actor.isOwner;
    return to === "failed" || to === "blocked";
  }
  if (from === "delivered") {
    if (to === "done") return actor.isManager;
    return to === "failed" || to === "blocked";
  }
  if (from === "failed" || from === "blocked" || from === "aborted") {
    return actor.isManager && to === "dispatched";
  }
  return false;
}

/**
 * **P1-6**：revision 冲突后的单次重试预检（**只读**；不改状态、不写账本、不补 artifact 观测）。
 *
 * 仅当同时满足才用当前 revision 重试一次：
 *   · 目标步骤仍存在，调用者仍是管理者或该步骤 owner；
 *   · 当前状态与请求状态不同（同状态属于幂等重放/并发已更新，交回调用方重读，不重试）；
 *   · 当前状态不是终态，且 `isTransitionAllowed` 仍允许该迁移；
 *   · `done`：证据存在、kind 与步骤 kind 对应，且按当前账本 `validateFlowEvidence` 对账有效。
 *
 * 任一条不满足 ⇒ 保持 `revision-conflict`（不掩盖真实冲突；不无限重试）。
 */
async function canRetryStaleUpdate(args: {
  projectRoot: string;
  flow: FlowState;
  stepId: string;
  status: FlowToolStatus;
  evidence?: FlowToolEvidence;
  actorRoleId: string;
  isManager: boolean;
}): Promise<boolean> {
  const step = args.flow.steps.find((candidate) => candidate.id === args.stepId);
  if (step === undefined) return false;
  const isOwner = step.owner === args.actorRoleId;
  if (!args.isManager && !isOwner) return false;
  if (args.status === "superseded") return false;
  if (step.status === args.status) return false;
  if (TERMINAL_STATUSES.has(step.status)) return false;
  if (!isTransitionAllowed(step.status, args.status, { isManager: args.isManager, isOwner })) return false;

  const nextEvidence = args.evidence ?? step.evidence;
  if (args.status !== "done") return true;
  if (nextEvidence === undefined || nextEvidence.kind !== step.kind) return false;

  let ledger;
  try {
    ledger = await readGovernanceLedger(args.projectRoot);
  } catch {
    return false;
  }
  if (ledger.errors.length > 0) return false;
  const nextFlow: FlowState = {
    ...args.flow,
    steps: args.flow.steps.map((item) =>
      item.id === step.id
        ? {
            ...item,
            status: "done" as const,
            evidence: { kind: nextEvidence.kind, ref: nextEvidence.ref },
          }
        : item,
    ),
  };
  const evidenceResult = validateFlowEvidence(nextFlow, ledger.entries);
  if (evidenceResult.ok) return true;
  return !evidenceResult.issues.some((issue) => issue.stepId === step.id);
}

// —————————————————————— 串行队列 ——————————————————————

const mutationChains = new Map<string, Promise<void>>();

function serialize<T>(projectRoot: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(projectRoot);
  const previous = mutationChains.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  mutationChains.set(key, tail);
  return run.finally(() => {
    if (mutationChains.get(key) === tail) mutationChains.delete(key);
  });
}

// —————————————————————— 读/写原语（工厂与 completeAcceptanceStep 共用） ——————————————————————

async function readFlowState(
  projectRoot: string,
  flowId: string,
): Promise<
  | { ok: true; flow: FlowState; revision: string }
  | { ok: false; result: FlowToolResult }
> {
  const abs = flowAbsPath(projectRoot, flowId);
  let bytes: Buffer;
  try {
    bytes = await readFile(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, result: { ok: false, code: "not-found", error: `流程状态不存在：${flowStatePath(flowId)}` } };
    }
    return {
      ok: false,
      result: { ok: false, code: "read-failed", error: `流程状态不可读：${err instanceof Error ? err.message : String(err)}` },
    };
  }
  const text = bytes.toString("utf8");
  const parsed = parseFlowStateYaml(text, flowId);
  if (!parsed.ok) {
    return {
      ok: false,
      result: { ok: false, code: "invalid-flow", error: `流程 YAML 校验失败：${parsed.error}` },
    };
  }
  return { ok: true, flow: parsed.flow, revision: sha256(bytes) };
}

async function writeFlowState(args: {
  projectRoot: string;
  flowId: string;
  flow: FlowState;
  event: string;
  fields: Record<string, unknown>;
  writeFile: (absPath: string, data: string) => Promise<void>;
  log: ReturnType<typeof createDiagnosticLogger>;
  viewActorRoleId: string;
  viewActorPower: string;
}): Promise<FlowToolResult> {
  // 写前重新 parse 候选（防御：形状/保留 id/evidence 对应/supersede 一致性）。
  const serialized = serializeFlow(args.flow);
  const parsed = parseFlowStateYaml(serialized, args.flowId);
  if (!parsed.ok) {
    return { ok: false, code: "invalid-flow", error: `候选流程 YAML 校验失败：${parsed.error}` };
  }
  const abs = flowAbsPath(args.projectRoot, args.flowId);
  try {
    await args.writeFile(abs, serialized);
  } catch (err) {
    args.log.error(`${args.event}.write.failed`, err, args.fields);
    return {
      ok: false,
      code: "write-failed",
      error: `流程写盘失败（原文件未被替换）：${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const revision = sha256(serialized);
  args.log.record(args.event, { ...args.fields, revision });
  return {
    ok: true,
    revision,
    flow: viewOf(parsed.flow, revision, args.viewActorRoleId, args.viewActorPower),
  };
}

// —————————————————————— 工厂 ——————————————————————

export function createFlowService(options: CreateFlowServiceOptions): FlowService {
  const projectRoot = path.resolve(options.projectRoot);
  const actorRoleId = options.actorRoleId;
  const actorPower = options.actorPower;
  const defaultFlowId = options.defaultFlowId;
  const writeFile = options.writeFile ?? ((absPath: string, data: string) => atomicWrite(absPath, data));
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });

  function resolveFlowId(input: string | undefined): { ok: true; flowId: string } | { ok: false; result: FlowToolResult } {
    const flowId = input ?? defaultFlowId;
    if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
      return {
        ok: false,
        result: { ok: false, code: "missing-flow-id", error: "缺少合法 flowId（应形如 todo-list-v1）。" },
      };
    }
    return { ok: true, flowId };
  }

  function readFlow(flowId: string): ReturnType<typeof readFlowState> {
    return readFlowState(projectRoot, flowId);
  }

  function writeFlow(
    flowId: string,
    flow: FlowState,
    event: string,
    fields: Record<string, unknown>,
  ): Promise<FlowToolResult> {
    return writeFlowState({
      projectRoot,
      flowId,
      flow,
      event,
      fields,
      writeFile,
      log,
      viewActorRoleId: actorRoleId,
      viewActorPower: actorPower,
    });
  }

  return {
    async get(input) {
      try {
        const resolved = resolveFlowId(input.flowId);
        if (!resolved.ok) return resolved.result;
        const read = await readFlow(resolved.flowId);
        if (!read.ok) return read.result;
        return {
          ok: true,
          revision: read.revision,
          flow: viewOf(read.flow, read.revision, actorRoleId, actorPower),
        };
      } catch (err) {
        return internalError(err);
      }
    },

    async update(input) {
      const resolved = resolveFlowId(input.flowId);
      if (!resolved.ok) return resolved.result;
      const flowId = resolved.flowId;
      if (typeof input.stepId !== "string" || !FLOW_ID_RE.test(input.stepId)) {
        return { ok: false, code: "missing-step-id", error: "缺少合法 stepId。" };
      }

      return serialize(projectRoot, async () => {
        const read = await readFlow(flowId);
        if (!read.ok) return read.result;
        const { flow, revision } = read;
        const flowView = viewOf(flow, revision, actorRoleId, actorPower);
        const isManager = isManagerPower(actorPower);

        // 2026-10-26 gate 复核（客户授权；设计 §7.4/§8.4）：含 gateKind 的步骤 `done` **只能由应用**
        // 按 Proof gate 报告收口（`completeGateStep`）；角色 `flow_step_update(done)` 一律拒绝——
        // manager（统筹/Lead）也不例外，防止「自查代替独立复核」。放在 revision 校验之前：即使调用方
        // 持有旧 revision，也得到确定的新 code（不落回 revision-conflict 掩盖真实原因）。
        const gateTarget = flow.steps.find((step) => step.id === input.stepId);
        if (gateTarget !== undefined && gateTarget.gateKind !== undefined && input.status === "done") {
          return {
            ok: false,
            code: "gate-review-required",
            revision,
            flow: flowView,
            error:
              `步骤 ${gateTarget.id} 是 gate 步骤（gateKind=${gateTarget.gateKind}）：done 只能由应用按 Proof ` +
              "gate 报告收口（completeGateStep），角色不能代标通过；gate 未通过时下游派发与最终验收保持被拦。",
          };
        }
        if (input.expectedRevision !== revision) {
          log.record("flow.conflict", {
            flowId,
            stepId: input.stepId,
            expectedRevision: input.expectedRevision,
            actualRevision: revision,
          });
          // P1-6：只读预检通过才用当前 revision 重试一次；否则保持 revision-conflict（不掩盖真实冲突）。
          const retry = await canRetryStaleUpdate({
            projectRoot,
            flow,
            stepId: input.stepId,
            status: input.status,
            ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
            actorRoleId,
            isManager,
          });
          if (!retry) {
            return {
              ok: false,
              code: "revision-conflict",
              revision,
              flow: flowView,
              error: `流程版本已变化（期望 ${input.expectedRevision}，当前 ${revision}），请重新读取后重试。`,
            };
          }
          log.record("flow.conflict.retry", {
            flowId,
            stepId: input.stepId,
            expectedRevision: input.expectedRevision,
            actualRevision: revision,
            actorRoleId,
          });
        }

        const index = flow.steps.findIndex((step) => step.id === input.stepId);
        if (index === -1) {
          return { ok: false, code: "step-not-found", revision, flow: flowView, error: `流程中没有步骤 ${input.stepId}。` };
        }
        const step = flow.steps[index]!;

        // 权限：管理者全部；其他仅 owner=自己。
        if (!isManager && step.owner !== actorRoleId) {
          return { ok: false, code: "forbidden", revision, flow: flowView, error: `步骤 ${step.id} 的 owner 是 ${step.owner}，当前角色 ${actorRoleId} 无权更新。` };
        }
        if (input.status === "superseded") {
          return { ok: false, code: "invalid-transition", revision, flow: flowView, error: "superseded 只能通过 flow_step_supersede 设置。" };
        }

        const nextEvidence = input.evidence ?? step.evidence;
        // 幂等：status 与有效 evidence 都相同 ⇒ 不写盘。
        if (step.status === input.status && sameEvidence(step.evidence, nextEvidence)) {
          return { ok: true, idempotent: true, revision, flow: flowView };
        }

        // 终态不可再改（done/superseded 的证据也不可变）。
        if (TERMINAL_STATUSES.has(step.status)) {
          return { ok: false, code: "invalid-transition", revision, flow: flowView, error: `步骤 ${step.id} 已是终态 ${step.status}，不能再更新。` };
        }

        // 状态变化时校验迁移；仅 evidence 变化（status 不变）允许（非终态）。
        if (
          step.status !== input.status &&
          !isTransitionAllowed(step.status, input.status, {
            isManager,
            isOwner: step.owner === actorRoleId,
          })
        ) {
          const deliveredOnlyOwner = step.status === "dispatched" && input.status === "delivered";
          return {
            ok: false,
            code: "invalid-transition",
            revision,
            flow: flowView,
            error: deliveredOnlyOwner
              ? `不允许从 dispatched 迁移到 delivered：delivered 只能由步骤 ${step.id} 的 owner（${step.owner}）标记，Steward/Lead 不代标交付。`
              : `不允许从 ${step.status} 迁移到 ${input.status}（${isManager ? "Steward/Lead" : `owner ${actorRoleId}`}）。`,
          };
        }

        // done 证据：必须存在、kind 与步骤 kind 对应，并与账本对账。
        if (input.status === "done") {
          if (nextEvidence === undefined) {
            return {
              ok: false,
              code: "insufficient-evidence",
              revision,
              flow: flowView,
              error: `步骤 ${step.id} 标记 done 必须提供 evidence（kind=${step.kind}）。`,
              issues: [`steps[${index}].evidence: done 必须提供 evidence（kind=${step.kind}）`],
            };
          }
          if (nextEvidence.kind !== step.kind) {
            return {
              ok: false,
              code: "insufficient-evidence",
              revision,
              flow: flowView,
              error: `evidence.kind 必须与步骤 kind 对应：步骤 kind=${step.kind}，证据 kind=${nextEvidence.kind}。`,
              issues: [`steps[${index}].evidence.kind: evidence.kind 必须与步骤 kind 对应（步骤 ${step.kind}，证据 ${nextEvidence.kind}）`],
            };
          }
        }

        const nextSteps = flow.steps.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                status: input.status,
                ...(nextEvidence !== undefined ? { evidence: { kind: nextEvidence.kind, ref: nextEvidence.ref } } : {}),
              }
            : item,
        );
        const candidate: FlowState = { ...flow, steps: nextSteps };

        // 先做形状/保留 id 校验，再对账账本（done 时）。
        const serialized = serializeFlow(candidate);
        const parsedCandidate = parseFlowStateYaml(serialized, flowId);
        if (!parsedCandidate.ok) {
          return { ok: false, code: "invalid-flow", revision, flow: flowView, error: `候选流程 YAML 校验失败：${parsedCandidate.error}` };
        }
        if (input.status === "done") {
          let ledger;
          try {
            ledger = await readGovernanceLedger(projectRoot);
          } catch (err) {
            return { ok: false, code: "ledger-unavailable", revision, flow: flowView, error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}` };
          }
          if (ledger.errors.length > 0) {
            return { ok: false, code: "ledger-unavailable", revision, flow: flowView, error: `治理账本不可读或存在坏行：${ledger.errors[0]}` };
          }
          // 2026-10-23 artifact 观测时序修复：artifact 步骤 done 时若账本尚无同路径 observation，先按
          // 观察安全规则补一次观测再对账。update 已在 per-project 串行队列内，**不得**调用会再次
          // serialize 的 observeFlowArtifacts（死锁）；appendGovernanceLedger 自带 append 串行链，
          // 锁方向为「flow serialize → ledger append」，无反向等待。补观测失败只影响 error 文案，
          // 判定仍由 validateFlowEvidence 裁决；append 失败用既有 ledger-write-failed。
          let entries: GovernanceLedgerEntry[] = ledger.entries;
          let observeHint: string | undefined;
          if (
            step.kind === "artifact" &&
            nextEvidence !== undefined &&
            nextEvidence.kind === "artifact" &&
            typeof nextEvidence.ref === "string" &&
            nextEvidence.ref.trim() !== ""
          ) {
            const ensured = await ensureArtifactObserved({ projectRoot, flowId, step, ref: nextEvidence.ref, entries });
            if (ensured.status === "observed") {
              entries = [...entries, ensured.entry];
              log.record("flow.artifact.observed-on-done", {
                flowId,
                stepId: step.id,
                artifactPath: ensured.entry.artifactPath,
              });
            } else if (ensured.status === "append-failed") {
              log.error("flow.artifact.observe.failed", new Error(ensured.message), { flowId, stepId: step.id });
              return { ok: false, code: "ledger-write-failed", revision, flow: flowView, error: ensured.message };
            } else if (ensured.status === "skipped") {
              observeHint = `无法安全补观测（${ensured.reason}）`;
            }
          }
          const evidenceResult = validateFlowEvidence(parsedCandidate.flow, entries);
          if (!evidenceResult.ok) {
            const issues = evidenceResult.issues.filter((issue) => issue.stepId === step.id);
            if (issues.length > 0) {
              const baseError = issues.map((issue) => issue.message).join("；");
              return {
                ok: false,
                code: "insufficient-evidence",
                revision,
                flow: flowView,
                error: observeHint !== undefined ? `${baseError}；${observeHint}` : baseError,
                issues: issues.map((issue) => `${issue.path}: ${issue.message}`),
              };
            }
          }
        }

        const written = await writeFlow(flowId, parsedCandidate.flow, "flow.update", {
          flowId,
          stepId: step.id,
          from: step.status,
          to: input.status,
          actorRoleId,
          actorPower,
          ...(input.note !== undefined ? { note: input.note } : {}),
        });
        return written;
      }).catch(internalError);
    },

    async supersede(input) {
      const resolved = resolveFlowId(input.flowId);
      if (!resolved.ok) return resolved.result;
      const flowId = resolved.flowId;
      if (!isManagerPower(actorPower)) {
        return { ok: false, code: "forbidden", error: "只有 Steward/Lead（工作流管理者）可以 supersede 步骤。" };
      }
      if (typeof input.oldStepId !== "string" || !FLOW_ID_RE.test(input.oldStepId)) {
        return { ok: false, code: "missing-step-id", error: "缺少合法 oldStepId。" };
      }
      if (typeof input.newStepId !== "string" || !FLOW_ID_RE.test(input.newStepId)) {
        return { ok: false, code: "missing-step-id", error: "缺少合法 newStepId。" };
      }
      if (input.oldStepId === input.newStepId) {
        return { ok: false, code: "invalid-supersede", error: "oldStepId 与 newStepId 不能相同。" };
      }
      if (
        typeof input.title !== "string" || input.title.trim() === ""
        || typeof input.owner !== "string" || input.owner.trim() === ""
      ) {
        return { ok: false, code: "invalid-supersede", error: "new 步骤必须有非空 title 与 owner。" };
      }

      return serialize(projectRoot, async () => {
        const read = await readFlow(flowId);
        if (!read.ok) return read.result;
        const { flow, revision } = read;
        const flowView = viewOf(flow, revision, actorRoleId, actorPower);
        if (input.expectedRevision !== revision) {
          log.record("flow.conflict", {
            flowId,
            stepId: input.oldStepId,
            expectedRevision: input.expectedRevision,
            actualRevision: revision,
            action: "supersede",
          });
          return {
            ok: false,
            code: "revision-conflict",
            revision,
            flow: flowView,
            error: `流程版本已变化（期望 ${input.expectedRevision}，当前 ${revision}），请重新读取后重试。`,
          };
        }

        const oldIndex = flow.steps.findIndex((step) => step.id === input.oldStepId);
        if (oldIndex === -1) {
          return { ok: false, code: "step-not-found", revision, flow: flowView, error: `流程中没有旧步骤 ${input.oldStepId}。` };
        }
        const oldStep = flow.steps[oldIndex]!;
        if (isReservedAcceptanceStepId(oldStep.id) || oldStep.kind === "acceptance") {
          return { ok: false, code: "invalid-supersede", revision, flow: flowView, error: "验收保留步骤不能被 supersede（流程必须保留验收出口）。" };
        }

        const existingNew = flow.steps.find((step) => step.id === input.newStepId);
        // 2026-10-26 gate 复核：用既有 supersede 换新 gate id 时**继承旧 gate 的 gateKind**（工具载荷不含
        // gateKind；旧 gate 被 supersede、新 id 走新 gate 记录，符合设计 §4.5 的「gate 定义变化」路径）。
        // 只在新 id 形如 gate-<slug> 且 kind=artifact 时继承；否则是普通 artifact 取代（新步骤不是 gate）。
        // 继承后仍由候选 YAML 复核强制 owner=verifier/evidence 等 gate 约束（不满足 ⇒ invalid-flow）。
        const inheritedGateKind =
          oldStep.gateKind !== undefined && input.kind === "artifact" && isFlowGateStepId(input.newStepId)
            ? oldStep.gateKind
            : undefined;
        // 新 gate 的 evidence 约定路径（工具载荷无 evidence 字段）：按同一路径规则派生 v1 报告路径，
        // 解析器据此满足「gate 步骤必须有 artifact 证据」；Proof 产出报告后 completeGateStep 再按最新版本收口。
        const inheritedGateEvidence =
          inheritedGateKind !== undefined
            ? { kind: "artifact" as const, ref: gateReviewReportRelPath(flowId, input.newStepId, 1) }
            : undefined;
        if (existingNew !== undefined) {
          const idempotent =
            oldStep.status === "superseded" &&
            oldStep.supersededBy === input.newStepId &&
            existingNew.status === "pending" &&
            existingNew.kind === input.kind &&
            existingNew.title === input.title.trim() &&
            existingNew.owner === input.owner.trim() &&
            existingNew.gateKind === inheritedGateKind &&
            existingNew.evidence?.kind === inheritedGateEvidence?.kind &&
            existingNew.evidence?.ref === inheritedGateEvidence?.ref &&
            existingNew.parallelGroup === input.parallelGroup &&
            sameOptionalStringList(existingNew.dependsOn, input.dependsOn) &&
            (existingNew.supersedes ?? []).includes(oldStep.id);
          if (idempotent) {
            return { ok: true, idempotent: true, revision, flow: flowView };
          }
          return { ok: false, code: "step-exists", revision, flow: flowView, error: `新步骤 id ${input.newStepId} 已存在。` };
        }
        if (oldStep.supersededBy !== undefined && oldStep.supersededBy !== input.newStepId) {
          return {
            ok: false,
            code: "invalid-supersede",
            revision,
            flow: flowView,
            error: `旧步骤 ${oldStep.id} 已被 ${oldStep.supersededBy} 取代，不能再被 ${input.newStepId} 取代。`,
          };
        }

        const newStep: FlowStateStep = {
          id: input.newStepId,
          title: input.title.trim(),
          owner: input.owner.trim(),
          kind: input.kind,
          status: "pending",
          supersedes: [oldStep.id],
          ...(inheritedGateKind !== undefined ? { gateKind: inheritedGateKind } : {}),
          ...(inheritedGateEvidence !== undefined ? { evidence: inheritedGateEvidence } : {}),
          ...(input.parallelGroup !== undefined ? { parallelGroup: input.parallelGroup } : {}),
          ...(input.dependsOn !== undefined ? { dependsOn: [...input.dependsOn] } : {}),
        };
        const nextSteps: FlowStateStep[] = [];
        for (const [itemIndex, item] of flow.steps.entries()) {
          if (itemIndex === oldIndex) {
            nextSteps.push({ ...item, status: "superseded", supersededBy: input.newStepId });
            nextSteps.push(newStep);
            continue;
          }
          nextSteps.push(item);
        }
        const candidate: FlowState = { ...flow, steps: nextSteps };
        const serialized = serializeFlow(candidate);
        const parsedCandidate = parseFlowStateYaml(serialized, flowId);
        if (!parsedCandidate.ok) {
          return { ok: false, code: "invalid-flow", revision, flow: flowView, error: `候选流程 YAML 校验失败：${parsedCandidate.error}` };
        }
        return writeFlow(flowId, parsedCandidate.flow, "flow.supersede", {
          flowId,
          oldStepId: oldStep.id,
          newStepId: newStep.id,
          actorRoleId,
          actorPower,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        });
      }).catch(internalError);
    },
  };
}

/**
 * **应用专用**：客户已接受验收（账本**最新**一条 `customer.decision{decisionKind:"acceptance"}`
 * 为 `customerDecision:"accepted"`）后，把 flow YAML 的保留验收步骤置为
 * `status:"done"` + `evidence:{kind:"acceptance",ref:"acceptance"}`。
 *
 * - **不注册为角色工具**（不进入 AdapterCapabilities / 三 flow 工具）；桌面在 acceptance check /
 *   verifier settle 检测到 accepted 时直接调用。
 * - **只认最新 accepted**（2026-10-23 验收返工路由方案 v1 Q1 A）：按账本 append 顺序取该 flow 最后
 *   一条 acceptance 决定；即使更早有 accepted，最新为 rejected ⇒ `acceptance-not-accepted`，不写 flow
 *   （rejected 是「待返工」，不是收口）。未结算/异常决定同样 fail-closed。
 * - **不写客户决定账本、不伪造客户批准**：只读账本确认已接受，只写 YAML。
 * - 幂等：验收步骤已是 `done` ⇒ `{ok:true,idempotent:true,revision,flow}`，不写盘。
 * - 账本坏行 ⇒ `ledger-unavailable`；最新决定不是 accepted ⇒ `acceptance-not-accepted`；
 *   缺保留验收步骤 ⇒ `acceptance-step-missing`。
 * - 与 `createFlowService` 共用 per-project 串行队列、候选 YAML 复核与原子写；写失败不破坏原文件。
 */
export async function completeAcceptanceStep(input: {
  projectRoot: string;
  flowId: string;
}): Promise<FlowToolResult> {
  const projectRoot = path.resolve(input.projectRoot);
  const flowId = input.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, code: "missing-flow-id", error: "缺少合法 flowId（应形如 todo-list-v1）。" };
  }
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });
  return serialize(projectRoot, async () => {
    const read = await readFlowState(projectRoot, flowId);
    if (!read.ok) return read.result;
    const view = viewOf(read.flow, read.revision, "app", "app");
    const index = read.flow.steps.findIndex(
      (step) => isReservedAcceptanceStepId(step.id) && step.kind === "acceptance",
    );
    if (index === -1) {
      return {
        ok: false,
        code: "acceptance-step-missing",
        revision: read.revision,
        flow: view,
        error: "流程缺少保留验收步骤（verification/acceptance，kind: acceptance）。",
      };
    }
    const step = read.flow.steps[index]!;
    if (step.status === "done") {
      return { ok: true, idempotent: true, revision: read.revision, flow: view };
    }

    let ledger;
    try {
      ledger = await readGovernanceLedger(projectRoot);
    } catch (err) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (ledger.errors.length > 0) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
      };
    }
    const latest = latestAcceptanceDecision(flowId, ledger.entries);
    if (latest.kind !== "accepted") {
      const detail =
        latest.kind === "rejected"
          ? "该流程最新验收决定为 rejected（等待返工）；未完成验收步骤（rejected 不是收口）。"
          : latest.kind === "unresolved"
            ? "该流程最新验收决定不是 accepted（未结算/异常）；未完成验收步骤。"
            : latest.kind === "ledger-unavailable"
              ? "治理账本不可读或存在坏行；未完成验收步骤。"
              : "该流程尚无客户验收接受决定（decisionKind=acceptance，customerDecision=accepted）；未完成验收步骤。";
      return {
        ok: false,
        code: "acceptance-not-accepted",
        revision: read.revision,
        flow: view,
        error: detail,
      };
    }

    const nextSteps = read.flow.steps.map((item, itemIndex) =>
      itemIndex === index
        ? { ...item, status: "done" as const, evidence: { kind: "acceptance" as const, ref: "acceptance" } }
        : item,
    );
    const candidate: FlowState = { ...read.flow, steps: nextSteps };
    return writeFlowState({
      projectRoot,
      flowId,
      flow: candidate,
      event: "flow.acceptance.completed",
      fields: { flowId, stepId: step.id },
      writeFile: (absPath, data) => atomicWrite(absPath, data),
      log,
      viewActorRoleId: "app",
      viewActorPower: "app",
    });
  }).catch(internalError);
}

// —————————————————————— 应用专用：completeCustomerDecisionStep ——————————————————————

/** 已是终态、应用不得覆盖的步骤状态（`done` 单独按幂等处理）。 */
const CUSTOMER_DECISION_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "superseded",
  "failed",
  "blocked",
  "aborted",
]);

/** `completeCustomerDecisionStep` 输入（应用专用，不是角色工具参数）。 */
export interface CompleteCustomerDecisionStepInput {
  projectRoot: string;
  flowId: string;
  /** 目标步骤 id；该步骤必须是 `kind: "customer-decision"`。 */
  stepId: string;
  /**
   * 账本 `customer.decision.decisionKind`（例如 `appointment`）。
   *
   * 缺省按步骤 `evidence.ref` 解析；无 evidence 时仅当 `stepId` 本身是合法 decisionKind
   * （例如 `appointment`）才可用。给出时必须与步骤 evidence.ref 一致（否则 fail-closed）。
   */
  decisionKind?: string;
}

/**
 * **应用专用**：客户决定已结算后，把 flow YAML 中指定 `kind:"customer-decision"` 步骤置
 * `status:"done"` + `evidence:{kind:"customer-decision",ref:decisionKind}`。
 *
 * 背景（2026-10-24 appointment 收口）：`appointment`（owner=convener）是客户决定步骤，
 * 角色工具只能按状态机推进（pending→dispatched→delivered→done）且 `done` 需 manager；
 * 应用此前没有 app-only 收口，导致客户已任命的流程停在 pending、阻塞 dependsOn/readiness。
 *
 * 契约（钉死）：
 *   · **只认最新已结算决定**：按账本 append 顺序取该 flow 最后一条
 *     `customer.decision{decisionKind}`（不匹配 ledger `stepId`，与 `validateFlowEvidence` 同口径）；
 *     最新结果必须是已结算（accepted / accepted-quick / appointed）。
 *     无决定 ⇒ `customer-decision-missing`；最新未结算/拒绝 ⇒ `customer-decision-not-resolved`；
 *     账本不可读/坏行 ⇒ `ledger-unavailable`（全部 fail-closed，不写 flow）。
 *   · **只允许 `kind:"customer-decision"` 步骤**：其它 kind ⇒ `customer-decision-kind-unsupported`。
 *   · **不改 owner/kind/其他步骤/flow schema**：只改目标步骤的 status 与 evidence；写盘仍经
 *     候选 YAML 复核 + 账本对账（`validateFlowEvidence`，只过滤目标 stepId 的 issue）。
 *   · **幂等**：已 `done` 且 evidence 与本次 decisionKind 相同 ⇒ `{ok:true,idempotent:true}`，
 *     不读账本、不写盘；已 `done` 但证据不同或终态（superseded/failed/blocked/aborted）⇒
 *     `customer-decision-step-terminal`（不覆盖终态）。
 *   · 步骤不存在 ⇒ `customer-decision-step-missing`；flowId/stepId 非法 ⇒ `missing-flow-id` /
 *     `missing-step-id`；decisionKind 非法/冲突/无法解析 ⇒ `invalid-decision-kind` /
 *     `decision-kind-mismatch` / `decision-kind-unresolved`。
 *   · **不注册为角色工具**（不进 `AdapterCapabilities` / 三 flow 工具）；桌面只经
 *     `src/pipeline/orchestration/flow-state.ts` 公共出口调用。
 *   · 与 `createFlowService` / `completeAcceptanceStep` 共用 per-project 串行队列、候选 YAML
 *     复核与原子写；写事件 `flow.customer-decision.completed`，view actor `app/app`；
 *     写失败不破坏原文件。
 */
export async function completeCustomerDecisionStep(
  input: CompleteCustomerDecisionStepInput,
): Promise<FlowToolResult> {
  if (typeof input?.projectRoot !== "string" || input.projectRoot.trim() === "") {
    return { ok: false, code: "invalid-input", error: "缺少 projectRoot。" };
  }
  const projectRoot = path.resolve(input.projectRoot);
  const flowId = input.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, code: "missing-flow-id", error: "缺少合法 flowId（应形如 todo-list-v1）。" };
  }
  if (typeof input.stepId !== "string" || !FLOW_ID_RE.test(input.stepId)) {
    return { ok: false, code: "missing-step-id", error: "缺少合法 stepId。" };
  }
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });

  return serialize(projectRoot, async () => {
    const read = await readFlowState(projectRoot, flowId);
    if (!read.ok) return read.result;
    const view = viewOf(read.flow, read.revision, "app", "app");
    const index = read.flow.steps.findIndex((step) => step.id === input.stepId);
    if (index === -1) {
      return {
        ok: false,
        code: "customer-decision-step-missing",
        revision: read.revision,
        flow: view,
        error: `流程中没有步骤 ${input.stepId}（无法完成客户决定步骤）。`,
      };
    }
    const step = read.flow.steps[index]!;
    if (step.kind !== "customer-decision") {
      return {
        ok: false,
        code: "customer-decision-kind-unsupported",
        revision: read.revision,
        flow: view,
        error: `步骤 ${step.id} 的 kind=${step.kind}，本函数只完成 kind=customer-decision 的步骤。`,
      };
    }

    // 1) 解析 decisionKind：显式输入 → 步骤 evidence.ref → stepId（仅当本身是合法 decisionKind）。
    const explicitKind = typeof input.decisionKind === "string" ? input.decisionKind.trim() : undefined;
    if (explicitKind !== undefined && explicitKind !== "" && !isCustomerDecisionKindRef(explicitKind)) {
      return {
        ok: false,
        code: "invalid-decision-kind",
        revision: read.revision,
        flow: view,
        error: `decisionKind 非法："${explicitKind}"（必须是账本 customer.decision 的合法 decisionKind，如 appointment）。`,
      };
    }
    const evidenceRef = step.evidence?.kind === "customer-decision" ? step.evidence.ref : undefined;
    if (explicitKind !== undefined && explicitKind !== "" && evidenceRef !== undefined && explicitKind !== evidenceRef) {
      return {
        ok: false,
        code: "decision-kind-mismatch",
        revision: read.revision,
        flow: view,
        error: `decisionKind 与步骤 ${step.id} 的 evidence.ref 不一致（输入 ${explicitKind}，evidence ${evidenceRef}）。`,
      };
    }
    const decisionKind =
      explicitKind !== undefined && explicitKind !== ""
        ? explicitKind
        : evidenceRef ?? (isCustomerDecisionKindRef(step.id) ? step.id : undefined);
    if (decisionKind === undefined) {
      return {
        ok: false,
        code: "decision-kind-unresolved",
        revision: read.revision,
        flow: view,
        error: `无法确定账本 decisionKind：步骤 ${step.id} 无 evidence.ref，且 stepId 本身不是合法 decisionKind；请在输入中显式提供 decisionKind。`,
      };
    }

    // 2) 幂等 / 终态（先于账本 I/O：已 done 同证据不因账本后变而失败）。
    if (step.status === "done") {
      if (step.evidence?.kind === "customer-decision" && step.evidence.ref === decisionKind) {
        return { ok: true, idempotent: true, revision: read.revision, flow: view };
      }
      return {
        ok: false,
        code: "customer-decision-step-terminal",
        revision: read.revision,
        flow: view,
        error: `步骤 ${step.id} 已是 done，但证据与本次 decisionKind=${decisionKind} 不一致；done 是终态，应用不覆盖。`,
      };
    }
    if (CUSTOMER_DECISION_TERMINAL_STATUSES.has(step.status)) {
      return {
        ok: false,
        code: "customer-decision-step-terminal",
        revision: read.revision,
        flow: view,
        error: `步骤 ${step.id} 已是终态 ${step.status}，应用不覆盖终态。`,
      };
    }

    // 3) 账本：只看最新一条同 flowId + decisionKind 的决定，必须已结算。
    let ledger;
    try {
      ledger = await readGovernanceLedger(projectRoot);
    } catch (err) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (ledger.errors.length > 0) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
      };
    }
    const latest = latestCustomerDecision(flowId, decisionKind, ledger.entries);
    if (latest.kind === "none") {
      return {
        ok: false,
        code: "customer-decision-missing",
        revision: read.revision,
        flow: view,
        error: `该流程尚无客户决定（decisionKind=${decisionKind}）；未完成步骤 ${step.id}。`,
      };
    }
    if (latest.kind === "unresolved") {
      return {
        ok: false,
        code: "customer-decision-not-resolved",
        revision: read.revision,
        flow: view,
        error:
          `该流程最新 ${decisionKind} 客户决定不是已结算结果` +
          `（customerDecision=${latest.entry.customerDecision ?? "缺少"}）；未完成步骤 ${step.id}（fail-closed）。`,
      };
    }
    if (latest.kind === "ledger-unavailable") {
      // 防御分支：账本 errors 已在上方返回。
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: "治理账本不可读或存在坏行，无法核对客户决定。",
      };
    }

    // 4) 只改目标步骤：status done + customer-decision 证据；owner/kind 及其它步骤原样保留。
    const candidate: FlowState = {
      ...read.flow,
      steps: read.flow.steps.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              status: "done" as const,
              evidence: { kind: "customer-decision" as const, ref: decisionKind },
            }
          : item,
      ),
    };
    const parsedCandidate = parseFlowStateYaml(serializeFlow(candidate), flowId);
    if (!parsedCandidate.ok) {
      return {
        ok: false,
        code: "invalid-flow",
        revision: read.revision,
        flow: view,
        error: `候选流程 YAML 校验失败：${parsedCandidate.error}`,
      };
    }
    const evidenceResult = validateFlowEvidence(parsedCandidate.flow, ledger.entries);
    if (!evidenceResult.ok) {
      const issues = evidenceResult.issues.filter((issue) => issue.stepId === step.id);
      if (issues.length > 0) {
        return {
          ok: false,
          code: "insufficient-evidence",
          revision: read.revision,
          flow: view,
          error: issues.map((issue) => issue.message).join("；"),
          issues: issues.map((issue) => `${issue.path}: ${issue.message}`),
        };
      }
    }

    return writeFlowState({
      projectRoot,
      flowId,
      flow: parsedCandidate.flow,
      event: "flow.customer-decision.completed",
      fields: { flowId, stepId: step.id, decisionKind },
      writeFile: (absPath, data) => atomicWrite(absPath, data),
      log,
      viewActorRoleId: "app",
      viewActorPower: "app",
    });
  }).catch(internalError);
}

// —————————————————————— 应用专用：reopenAcceptanceStepForRework ——————————————————————

/** `reopenAcceptanceStepForRework` 输入（应用专用，不是角色工具参数）。 */
export interface ReopenAcceptanceStepForReworkInput {
  projectRoot: string;
  flowId: string;
  /**
   * 调用方（桌面）声明已存在**耐久**的 auto-rework routing record
   * （`.ans/governance/acceptance/<flowId>/rework-routing.json`，桌面 owner；judge auto-rework 不写
   * `customer.decision`）。编排不读取、不复制桌面私有记录 schema；该标志只放行「无 rejected 决定」的
   * 重开前提。缺省 `false` ⇒ 只认最新 acceptance 决定 rejected。
   */
  autoRework?: boolean;
}

/**
 * **应用专用**：返工前把 flow YAML 的保留验收步骤安全重开为 `pending` 并清空旧证据。
 *
 * 2026-10-23 验收返工路由方案 v1 §5.5.4 / Q1 A（P7）：正常路径下应用从不把 verification 标
 * dispatched；但手工/旧流程可能已是 dispatched/delivered，重派 Proof 前必须先回到 pending，
 * 否则旧证据会冒充新复核。
 *
 * 契约（钉死）：
 *   · **前提**：最新 acceptance 决定为 `rejected`，或调用方声明 `autoRework:true` 且无 acceptance
 *     决定；最新 `accepted`/未结算/无决定且未声明 auto-rework ⇒ `acceptance-not-rejected`；
 *   · `pending` 且无 `evidence` ⇒ `{ok:true, idempotent:true}`（不写盘、revision 不变）；
 *   · `pending` 但带旧 `evidence` ⇒ 清空旧证据并写事件（避免旧证据冒充新复核）；
 *   · `dispatched`/`delivered` ⇒ 置 `pending`、清空 `evidence`，保留
 *     `supersedes`/`supersededBy`/`dependsOn`/`parallelGroup`；
 *   · `done` ⇒ `acceptance-already-done`（不自动重开已收口流程）；
 *   · `failed`/`blocked`/`aborted`（及不可达的 `superseded`）⇒ `acceptance-step-terminal`；
 *   · 缺保留验收步骤 ⇒ `acceptance-step-missing`；账本不可读/坏行 ⇒ `ledger-unavailable`；
 *   · 原子写失败 ⇒ `write-failed`，原文件不变；**不写 `customer.decision`**、不新增枚举/保留 id。
 *   · **不注册为角色工具**（不进 AdapterCapabilities）；只经
 *     `src/pipeline/orchestration/flow-state.ts` 公共出口供桌面消费。
 */
export async function reopenAcceptanceStepForRework(
  input: ReopenAcceptanceStepForReworkInput,
): Promise<FlowToolResult> {
  const projectRoot = path.resolve(input.projectRoot);
  const flowId = input.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, code: "missing-flow-id", error: "缺少合法 flowId（应形如 todo-list-v1）。" };
  }
  const autoRework = input.autoRework === true;
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });
  return serialize(projectRoot, async () => {
    const read = await readFlowState(projectRoot, flowId);
    if (!read.ok) return read.result;
    const view = viewOf(read.flow, read.revision, "app", "app");
    const index = read.flow.steps.findIndex(
      (step) => isReservedAcceptanceStepId(step.id) && step.kind === "acceptance",
    );
    if (index === -1) {
      return {
        ok: false,
        code: "acceptance-step-missing",
        revision: read.revision,
        flow: view,
        error: "流程缺少保留验收步骤（verification/acceptance，kind: acceptance）。",
      };
    }
    const step = read.flow.steps[index]!;

    // 1) 终态护栏：不自动重开（先于账本 I/O；失败码确定）。
    if (step.status === "done") {
      return {
        ok: false,
        code: "acceptance-already-done",
        revision: read.revision,
        flow: view,
        error: "验收步骤已完成（done）；不自动重开已收口流程，请人工核对。",
      };
    }
    if (step.status === "failed" || step.status === "blocked" || step.status === "aborted" || step.status === "superseded") {
      return {
        ok: false,
        code: "acceptance-step-terminal",
        revision: read.revision,
        flow: view,
        error: `验收步骤状态为 ${step.status}（终态）；不自动重开，请人工/Convener 处理。`,
      };
    }

    // 2) 前提：最新 acceptance 决定 rejected（或调用方声明 auto-rework routing record）。
    let ledger;
    try {
      ledger = await readGovernanceLedger(projectRoot);
    } catch (err) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (ledger.errors.length > 0) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
      };
    }
    const latest = latestAcceptanceDecision(flowId, ledger.entries);
    const allowed = latest.kind === "rejected" || (autoRework && latest.kind === "none");
    if (!allowed) {
      const detail =
        latest.kind === "accepted"
          ? "该流程最新验收决定为 accepted（流程已收口）；不重开验收步骤。"
          : latest.kind === "unresolved"
            ? "该流程最新验收决定为未结算/异常状态；不重开验收步骤（fail-closed，请人工核对）。"
            : "该流程尚无 rejected 验收决定，也未声明 auto-rework 记录；不重开验收步骤。";
      return {
        ok: false,
        code: "acceptance-not-rejected",
        revision: read.revision,
        flow: view,
        error: detail,
      };
    }

    // 3) 幂等：pending 且无旧证据 ⇒ 不写盘。
    if (step.status === "pending" && step.evidence === undefined) {
      return { ok: true, idempotent: true, revision: read.revision, flow: view };
    }

    // 4) 重开：置 pending 并清空该步骤 evidence（保留 supersedes/supersededBy/dependsOn/parallelGroup）。
    const reopened: FlowStateStep = {
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind,
      status: "pending",
      ...(step.supersedes !== undefined ? { supersedes: [...step.supersedes] } : {}),
      ...(step.supersededBy !== undefined ? { supersededBy: step.supersededBy } : {}),
      ...(step.parallelGroup !== undefined ? { parallelGroup: step.parallelGroup } : {}),
      ...(step.dependsOn !== undefined ? { dependsOn: [...step.dependsOn] } : {}),
    };
    const candidate: FlowState = {
      ...read.flow,
      steps: read.flow.steps.map((item, itemIndex) => (itemIndex === index ? reopened : item)),
    };
    return writeFlowState({
      projectRoot,
      flowId,
      flow: candidate,
      event: "flow.acceptance.reopened",
      fields: {
        flowId,
        stepId: step.id,
        from: step.status,
        clearedEvidence: step.evidence !== undefined,
        source: latest.kind === "rejected" ? "rejected" : "auto-rework",
      },
      writeFile: (absPath, data) => atomicWrite(absPath, data),
      log,
      viewActorRoleId: "app",
      viewActorPower: "app",
    });
  }).catch(internalError);
}

// —————————————————————— 应用专用：completeRoleCardsStep ——————————————————————

/** `role-cards` 步骤的精确 id（本函数的唯一目标；不做前缀/相似匹配）。 */
const ROLE_CARDS_STEP_ID = "role-cards";
/** 角色目录（项目相对路径首段；与项目语言一致）。 */
const ROLE_CARDS_DIR = "角色卡";
/** 每个目标角色必须齐全的六个文件（不代表解析顺序；排序只用于记录确定性）。 */
const ROLE_CARD_FILE_NAMES = [
  "role-card.md",
  "boundary.yaml",
  "feature-map.md",
  "functional-description.md",
  "memo.md",
  "api-spec.md",
] as const;
const ROLE_CARD_FILE_SET: ReadonlySet<string> = new Set(ROLE_CARD_FILE_NAMES);
/** 应用私有验证记录（机器状态，不是客户文档、不是 readiness/验收）。 */
const ROLE_CARDS_RECORD_SCHEMA = "role-cards-gate/v1";
const ROLE_CARDS_RECORD_ROOT_REL = ".ans/governance/role-cards";
/** sha256 小写 hex（桌面传入的指纹与逐文件哈希统一口径）。 */
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
/** 已是终态、应用不得覆盖的步骤状态（done 单独按幂等处理）。 */
const ROLE_CARDS_TERMINAL_STATUSES: ReadonlySet<string> = new Set(["superseded", "failed", "blocked", "aborted"]);

/** `completeRoleCardsStep` 的逐文件校验结果（桌面在结构校验后传入；函数会重读核对）。 */
export interface CompleteRoleCardsValidatedFile {
  /** 项目相对路径：`角色卡/<roleId>/<六文件之一>`。 */
  path: string;
  sha256: string;
}

/** `completeRoleCardsStep` 输入（与方案 A5 一致；应用专用，不是角色工具参数）。 */
export interface CompleteRoleCardsStepInput {
  projectRoot: string;
  flowId: string;
  /** 非空、去重、合法角色 id（允许中文；不得含路径分隔符/`.`/`..`）。 */
  roleIds: readonly string[];
  /** 仅目标角色目录下六个文件；每个目标角色六件齐全、无重复、无越界。 */
  validatedFiles: readonly CompleteRoleCardsValidatedFile[];
  /** 桌面对目标角色六文件 + 团队计划 + validator schema 计算的 64 位小写 hex 指纹。 */
  fingerprint: string;
  /** 任命/写卡产物路径（可选；只记录，不读取）。 */
  appointmentArtifactPath?: string;
}

/** 完成的证据（kind 与步骤 kind 对应，不改 kind）。 */
export interface CompleteRoleCardsEvidence {
  kind: "artifact" | "dispatch";
  ref: string;
}

/**
 * `completeRoleCardsStep` 结果：复用 `FlowToolResult` 形状，并补充本次证据/记录路径。
 *
 * 错误码（桌面据此分流）：
 *   · 输入：`invalid-input` / `invalid-role-ids` / `invalid-validated-files` /
 *     `invalid-fingerprint` / `invalid-appointment-artifact-path`；
 *   · 校验后变化：`role-cards-stale`（重读哈希不一致/缺失；flow/账本/记录零写入）；
 *   · flow：`role-cards-step-missing` / `role-cards-step-terminal` / `role-cards-kind-unsupported`
 *     （以及读取既有码 `missing-flow-id`/`not-found`/`read-failed`/`invalid-flow`）；
 *   · 证据/写入：`ledger-unavailable` / `ledger-write-failed` / `insufficient-evidence` / `write-failed`。
 */
export interface CompleteRoleCardsStepResult extends FlowToolResult {
  /** 成功完成时实际写入 flow 的证据。 */
  evidence?: CompleteRoleCardsEvidence;
  /** artifact kind 时本次使用的应用验证记录（项目相对路径）。 */
  recordPath?: string;
}

/** 验证记录形状（`.ans/governance/role-cards/<flowId>/<fingerprint>.json`）。 */
interface RoleCardsValidationRecord {
  schema: typeof ROLE_CARDS_RECORD_SCHEMA;
  flowId: string;
  at: string;
  roleIds: string[];
  appointmentArtifactPath: string | null;
  /**
   * 输入契约不单独携带团队计划；桌面指纹已把团队计划内容计入 `fingerprint`。
   * 字段固定 `null` 表示「未单独提供」，避免把 null 误读成「无团队计划」。
   */
  teamPlan: null;
  fingerprint: string;
  files: Array<{ path: string; sha256: string }>;
  result: "structure-pass";
  semantic: "pending";
  disclaimer: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 角色 id 合法性（只做路径安全与最小形状约束；不限制中文）。 */
function roleIdProblem(roleId: unknown): string | undefined {
  if (typeof roleId !== "string") return "角色 id 必须是字符串";
  if (roleId.trim() === "") return "角色 id 不能为空";
  if (roleId !== roleId.trim()) return `角色 id 不能含首尾空白（"${roleId}"）`;
  if (roleId === "." || roleId === "..") return `角色 id 不能是 "${roleId}"`;
  if (roleId.includes("/") || roleId.includes("\\") || roleId.includes("\u0000")) {
    return `角色 id 不能包含路径分隔符或 NUL（"${roleId}"）`;
  }
  return undefined;
}

/** 角色卡文件路径归一化：只允许 `角色卡/<roleId>/<六文件之一>`（词法判定，不访问文件系统）。 */
function normalizeRoleCardRelPath(raw: string): string | undefined {
  const replaced = raw.replace(/\\/g, "/");
  if (replaced === "" || replaced.includes("\u0000")) return undefined;
  if (replaced.startsWith("/") || /^[A-Za-z]:\//.test(replaced)) return undefined;
  let rel = replaced;
  while (rel.startsWith("./")) rel = rel.slice(2);
  const segments = rel.split("/");
  if (segments.length !== 3) return undefined;
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  if (segments[0] !== ROLE_CARDS_DIR) return undefined;
  if (!ROLE_CARD_FILE_SET.has(segments[2]!)) return undefined;
  return segments.join("/");
}

/** 仅用于记录的项目相对路径（拒绝绝对路径/URL 形状/空段/`.`/`..`）。 */
function isRecordedProjectRelPath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    return false;
  }
  const segments = normalized.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

type RoleCardsInputCheck =
  | {
      ok: true;
      roleIds: string[];
      files: Array<{ path: string; sha256: string }>;
      appointmentArtifactPath: string | null;
    }
  | { ok: false; result: CompleteRoleCardsStepResult };

/** 输入形状/覆盖/越界校验（全部为词法判定；任何失败都不写盘）。 */
function validateRoleCardsStepInput(input: CompleteRoleCardsStepInput): RoleCardsInputCheck {
  const rawRoleIds: readonly unknown[] = Array.isArray(input.roleIds) ? input.roleIds : [];
  if (rawRoleIds.length === 0) {
    return { ok: false, result: { ok: false, code: "invalid-role-ids", error: "roleIds 必须是非空数组。" } };
  }
  const roleIds: string[] = [];
  const roleIdKeys = new Set<string>();
  for (const rawRoleId of rawRoleIds) {
    const problem = roleIdProblem(rawRoleId);
    if (problem !== undefined) {
      return { ok: false, result: { ok: false, code: "invalid-role-ids", error: problem } };
    }
    const roleId = rawRoleId as string;
    const key = roleId.toLowerCase();
    if (roleIdKeys.has(key)) {
      return {
        ok: false,
        result: {
          ok: false,
          code: "invalid-role-ids",
          error: `roleIds 含重复角色 id："${roleId}"（Windows 目录大小写不敏感，按不区分大小写去重）。`,
        },
      };
    }
    roleIdKeys.add(key);
    roleIds.push(roleId);
  }

  if (typeof input.fingerprint !== "string" || !SHA256_HEX_RE.test(input.fingerprint)) {
    return {
      ok: false,
      result: { ok: false, code: "invalid-fingerprint", error: "fingerprint 必须是 64 位小写十六进制（sha256）。" },
    };
  }
  if (input.appointmentArtifactPath !== undefined && !isRecordedProjectRelPath(input.appointmentArtifactPath)) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "invalid-appointment-artifact-path",
        error: "appointmentArtifactPath 必须是项目相对路径（非空、无空段/`.`/`..`、非绝对路径）。",
      },
    };
  }

  const rawFiles: readonly unknown[] = Array.isArray(input.validatedFiles) ? input.validatedFiles : [];
  const files = new Map<string, string>();
  const issues: string[] = [];
  for (const [fileIndex, rawFile] of rawFiles.entries()) {
    if (!isPlainRecord(rawFile)) {
      issues.push(`validatedFiles[${fileIndex}]: 必须是 { path, sha256 } 对象`);
      continue;
    }
    const rawPath = rawFile.path;
    const rawSha = rawFile.sha256;
    if (typeof rawPath !== "string") {
      issues.push(`validatedFiles[${fileIndex}].path: 必须是字符串`);
      continue;
    }
    if (typeof rawSha !== "string" || !SHA256_HEX_RE.test(rawSha)) {
      issues.push(`validatedFiles[${fileIndex}].sha256: 必须是 64 位小写十六进制（sha256）`);
      continue;
    }
    const rel = normalizeRoleCardRelPath(rawPath);
    if (rel === undefined) {
      issues.push(`validatedFiles[${fileIndex}].path: 只允许 角色卡/<roleId>/<六文件之一>（当前 "${rawPath}"）`);
      continue;
    }
    const roleSegment = rel.split("/")[1]!;
    if (!roleIdKeys.has(roleSegment.toLowerCase())) {
      issues.push(`validatedFiles[${fileIndex}].path: 角色 "${roleSegment}" 不在 roleIds 内（越界）`);
      continue;
    }
    if (files.has(rel)) {
      issues.push(`validatedFiles[${fileIndex}].path: 重复路径 "${rel}"`);
      continue;
    }
    files.set(rel, rawSha);
  }
  if (issues.length === 0) {
    for (const roleId of roleIds) {
      for (const name of ROLE_CARD_FILE_NAMES) {
        const rel = `${ROLE_CARDS_DIR}/${roleId}/${name}`;
        if (!files.has(rel)) issues.push(`缺少目标角色文件：${rel}`);
      }
    }
  }
  if (issues.length > 0) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "invalid-validated-files",
        error: `validatedFiles 非法（${issues.length} 项）：${issues[0]}`,
        issues,
      },
    };
  }

  const sortedFiles = [...files.entries()]
    .map(([rel, sha]) => ({ path: rel, sha256: sha }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const sortedRoleIds = [...roleIds].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return {
    ok: true,
    roleIds: sortedRoleIds,
    files: sortedFiles,
    appointmentArtifactPath: input.appointmentArtifactPath ?? null,
  };
}

/** 已存在的记录与本次输入一致 ⇒ 原样复用（不重写；保证同指纹同内容的记录 sha 稳定）。 */
async function readReusableRoleCardsRecord(
  absPath: string,
  expected: {
    flowId: string;
    fingerprint: string;
    roleIds: readonly string[];
    files: ReadonlyArray<{ path: string; sha256: string }>;
  },
): Promise<{ text: string; sha256: string } | undefined> {
  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isPlainRecord(parsed)) return undefined;
  if (parsed.schema !== ROLE_CARDS_RECORD_SCHEMA) return undefined;
  if (parsed.flowId !== expected.flowId || parsed.fingerprint !== expected.fingerprint) return undefined;
  if (!Array.isArray(parsed.roleIds) || parsed.roleIds.length !== expected.roleIds.length) return undefined;
  if (!parsed.roleIds.every((value, index) => value === expected.roleIds[index])) return undefined;
  if (!Array.isArray(parsed.files) || parsed.files.length !== expected.files.length) return undefined;
  const filesMatch = parsed.files.every((value, index) => {
    const file = expected.files[index]!;
    return isPlainRecord(value) && value.path === file.path && value.sha256 === file.sha256;
  });
  if (!filesMatch) return undefined;
  return { text, sha256: sha256(text) };
}

interface RoleCardsCompletionContext {
  projectRoot: string;
  flowId: string;
  flow: FlowState;
  revision: string;
  index: number;
  view: FlowToolView;
  roleIds: readonly string[];
  files: ReadonlyArray<{ path: string; sha256: string }>;
  fingerprint: string;
  appointmentArtifactPath: string | null;
  log: ReturnType<typeof createDiagnosticLogger>;
}

/** artifact kind：写应用验证记录 → 幂等追加 `artifact.observed`（power=app）→ flow done。 */
async function completeRoleCardsArtifact(context: RoleCardsCompletionContext): Promise<CompleteRoleCardsStepResult> {
  const { projectRoot, flowId, flow, revision, index, view, roleIds, files, fingerprint, appointmentArtifactPath, log } =
    context;
  const recordRel = `${ROLE_CARDS_RECORD_ROOT_REL}/${flowId}/${fingerprint}.json`;
  const recordAbs = path.join(projectRoot, ...recordRel.split("/"));

  const reusable = await readReusableRoleCardsRecord(recordAbs, { flowId, fingerprint, roleIds, files });
  let recordSha: string;
  if (reusable !== undefined) {
    recordSha = reusable.sha256;
  } else {
    const record: RoleCardsValidationRecord = {
      schema: ROLE_CARDS_RECORD_SCHEMA,
      flowId,
      at: new Date().toISOString(),
      roleIds: [...roleIds],
      appointmentArtifactPath,
      teamPlan: null,
      fingerprint,
      files: files.map((file) => ({ path: file.path, sha256: file.sha256 })),
      result: "structure-pass",
      semantic: "pending",
      disclaimer: "结构校验通过，不代表 readiness/验收/客户批准；语义 readiness 仍由 Convener 复核。",
    };
    const text = `${JSON.stringify(record, null, 2)}\n`;
    recordSha = sha256(text);
    try {
      await mkdir(path.dirname(recordAbs), { recursive: true });
      await atomicWrite(recordAbs, text);
    } catch (err) {
      log.error("flow.role-cards.record.failed", err, { flowId, fingerprint, recordPath: recordRel });
      return {
        ok: false,
        code: "write-failed",
        revision,
        flow: view,
        error: `role-cards 验证记录写盘失败（原文件未被替换）：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    log.record("flow.role-cards.record.written", { flowId, fingerprint, recordPath: recordRel });
  }

  let ledger;
  try {
    ledger = await readGovernanceLedger(projectRoot);
  } catch (err) {
    return {
      ok: false,
      code: "ledger-unavailable",
      revision,
      flow: view,
      error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (ledger.errors.length > 0) {
    return {
      ok: false,
      code: "ledger-unavailable",
      revision,
      flow: view,
      error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
    };
  }

  let entries: GovernanceLedgerEntry[] = ledger.entries;
  const alreadyObserved = entries.some(
    (entry) =>
      entry.kind === "artifact.observed" &&
      entry.artifactPath === recordRel &&
      entry.artifactSha256 === recordSha,
  );
  if (!alreadyObserved) {
    const observedEntry: GovernanceLedgerEntry = {
      at: new Date().toISOString(),
      kind: "artifact.observed",
      actorRoleId: "app",
      power: "app",
      artifactPath: recordRel,
      artifactSha256: recordSha,
      flowId,
    };
    const appended = await appendGovernanceLedger(projectRoot, observedEntry);
    if (!appended.ok) {
      log.error("flow.role-cards.ledger.failed", new Error(appended.message), { flowId, recordPath: recordRel });
      return { ok: false, code: "ledger-write-failed", revision, flow: view, error: appended.message };
    }
    entries = [...entries, observedEntry];
  }

  const candidate: FlowState = {
    ...flow,
    steps: flow.steps.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            status: "done" as const,
            evidence: { kind: "artifact" as const, ref: recordRel },
          }
        : item,
    ),
  };
  const parsedCandidate = parseFlowStateYaml(serializeFlow(candidate), flowId);
  if (!parsedCandidate.ok) {
    return {
      ok: false,
      code: "invalid-flow",
      revision,
      flow: view,
      error: `候选流程 YAML 校验失败：${parsedCandidate.error}`,
    };
  }
  const evidenceResult = validateFlowEvidence(parsedCandidate.flow, entries);
  if (!evidenceResult.ok) {
    const issues = evidenceResult.issues.filter((issue) => issue.stepId === ROLE_CARDS_STEP_ID);
    if (issues.length > 0) {
      return {
        ok: false,
        code: "insufficient-evidence",
        revision,
        flow: view,
        error: issues.map((issue) => issue.message).join("；"),
        issues: issues.map((issue) => `${issue.path}: ${issue.message}`),
      };
    }
  }

  const written = await writeFlowState({
    projectRoot,
    flowId,
    flow: parsedCandidate.flow,
    event: "flow.role-cards.completed",
    fields: { flowId, stepId: ROLE_CARDS_STEP_ID, fingerprint, evidenceKind: "artifact", recordPath: recordRel },
    writeFile: (absPath, data) => atomicWrite(absPath, data),
    log,
    viewActorRoleId: "app",
    viewActorPower: "app",
  });
  if (!written.ok) return written;
  return { ...written, evidence: { kind: "artifact", ref: recordRel }, recordPath: recordRel };
}

/** dispatch kind：要求账本已有 `dispatch.accepted{flowId, stepId:"role-cards"}`，再用对账写 flow done。 */
async function completeRoleCardsDispatch(context: RoleCardsCompletionContext): Promise<CompleteRoleCardsStepResult> {
  const { projectRoot, flowId, flow, revision, index, view, fingerprint, log } = context;

  let ledger;
  try {
    ledger = await readGovernanceLedger(projectRoot);
  } catch (err) {
    return {
      ok: false,
      code: "ledger-unavailable",
      revision,
      flow: view,
      error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (ledger.errors.length > 0) {
    return {
      ok: false,
      code: "ledger-unavailable",
      revision,
      flow: view,
      error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
    };
  }

  const candidate: FlowState = {
    ...flow,
    steps: flow.steps.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            status: "done" as const,
            evidence: { kind: "dispatch" as const, ref: ROLE_CARDS_STEP_ID },
          }
        : item,
    ),
  };
  const parsedCandidate = parseFlowStateYaml(serializeFlow(candidate), flowId);
  if (!parsedCandidate.ok) {
    return {
      ok: false,
      code: "invalid-flow",
      revision,
      flow: view,
      error: `候选流程 YAML 校验失败：${parsedCandidate.error}`,
    };
  }
  const evidenceResult = validateFlowEvidence(parsedCandidate.flow, ledger.entries);
  if (!evidenceResult.ok) {
    const issues = evidenceResult.issues.filter((issue) => issue.stepId === ROLE_CARDS_STEP_ID);
    if (issues.length > 0) {
      return {
        ok: false,
        code: "insufficient-evidence",
        revision,
        flow: view,
        error: issues.map((issue) => issue.message).join("；"),
        issues: issues.map((issue) => `${issue.path}: ${issue.message}`),
      };
    }
  }

  const written = await writeFlowState({
    projectRoot,
    flowId,
    flow: parsedCandidate.flow,
    event: "flow.role-cards.completed",
    fields: { flowId, stepId: ROLE_CARDS_STEP_ID, fingerprint, evidenceKind: "dispatch" },
    writeFile: (absPath, data) => atomicWrite(absPath, data),
    log,
    viewActorRoleId: "app",
    viewActorPower: "app",
  });
  if (!written.ok) return written;
  return { ...written, evidence: { kind: "dispatch", ref: ROLE_CARDS_STEP_ID } };
}

/**
 * **应用专用**：结构校验通过后把 flow YAML 的 `id:"role-cards"` 步骤置 `done`。
 *
 * - **不注册为角色工具**（不进 `AdapterCapabilities` / 三 flow 工具）；桌面只经
 *   `src/pipeline/orchestration/flow-state.ts` 公共出口调用。
 * - **不复制验收门禁**：不要求 `customer.decision`、不写客户决定、不伪造 readiness/客户批准；
 *   只记录确定性的结构校验结果（语义 readiness 仍由 Convener 复核）。
 * - **重读核对**：逐文件重新读取并计算 sha256；缺失/不一致 ⇒ `role-cards-stale`，
 *   flow/账本/记录零写入（校验后文件又变时不完成）。
 * - **按步骤 kind 生成证据（不改 kind）**：
 *   · `artifact`：写 `.ans/governance/role-cards/<flowId>/<fingerprint>.json`，并幂等追加
 *     `artifact.observed{actorRoleId:"app", power:"app", artifactPath, artifactSha256, flowId}`；
 *     证据 `{kind:"artifact", ref:记录相对路径}`；同 path+sha 不重复追加，重复调用不重写记录。
 *   · `dispatch`：要求账本已有 `dispatch.accepted{flowId, stepId:"role-cards"}`（应用派 Crew 时写入），
 *     用 `validateFlowEvidence` 对账；证据 `{kind:"dispatch", ref:"role-cards"}`；不写 `.ans` 记录。
 *   · 其它 kind ⇒ `role-cards-kind-unsupported`。
 * - 步骤缺失 ⇒ `role-cards-step-missing`；已 done ⇒ `{ok:true, idempotent:true}`；
 *   `superseded/failed/blocked/aborted` ⇒ `role-cards-step-terminal`（不覆盖终态）。
 * - 与 `completeAcceptanceStep` 共用 per-project 串行队列、候选 YAML 复核与原子写；写 flow 事件
 *   `flow.role-cards.completed`，view actor `app/app`；写失败不破坏原文件。
 */
export async function completeRoleCardsStep(
  input: CompleteRoleCardsStepInput,
): Promise<CompleteRoleCardsStepResult> {
  if (typeof input?.projectRoot !== "string" || input.projectRoot.trim() === "") {
    return { ok: false, code: "invalid-input", error: "缺少 projectRoot。" };
  }
  const projectRoot = path.resolve(input.projectRoot);
  const flowId = input.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, code: "missing-flow-id", error: "缺少合法 flowId（应形如 todo-list-v1）。" };
  }
  const checked = validateRoleCardsStepInput(input);
  if (!checked.ok) return checked.result;
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });

  return serialize(projectRoot, async () => {
    // 1. 重读核对：校验后文件又变/缺失 ⇒ stale，任何写入都不发生。
    const staleIssues: string[] = [];
    for (const file of checked.files) {
      const abs = path.join(projectRoot, ...file.path.split("/"));
      let bytes: Buffer;
      try {
        bytes = await readFile(abs);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        staleIssues.push(
          `${file.path}: ${code === "ENOENT" ? "文件不存在" : `不可读（${err instanceof Error ? err.message : String(err)}）`}`,
        );
        continue;
      }
      const actual = sha256(bytes);
      if (actual !== file.sha256) {
        staleIssues.push(`${file.path}: sha256 不一致（校验时 ${file.sha256}，当前 ${actual}）`);
      }
    }
    if (staleIssues.length > 0) {
      log.record("flow.role-cards.stale", {
        flowId,
        fingerprint: input.fingerprint,
        mismatches: staleIssues.length,
      });
      return {
        ok: false,
        code: "role-cards-stale",
        error: `角色卡在校验后发生变化（${staleIssues.length} 项），未完成 role-cards：${staleIssues[0]}`,
        issues: staleIssues,
      };
    }

    // 2. 读 flow，定位精确 id 的 role-cards 步骤。
    const read = await readFlowState(projectRoot, flowId);
    if (!read.ok) return read.result;
    const view = viewOf(read.flow, read.revision, "app", "app");
    const index = read.flow.steps.findIndex((step) => step.id === ROLE_CARDS_STEP_ID);
    if (index === -1) {
      return {
        ok: false,
        code: "role-cards-step-missing",
        revision: read.revision,
        flow: view,
        error: `流程缺少 id 为 "${ROLE_CARDS_STEP_ID}" 的步骤（无法完成 role-cards）。`,
      };
    }
    const step = read.flow.steps[index]!;
    if (step.status === "done") {
      const existingEvidence =
        step.evidence !== undefined && (step.evidence.kind === "artifact" || step.evidence.kind === "dispatch")
          ? { kind: step.evidence.kind, ref: step.evidence.ref }
          : undefined;
      return {
        ok: true,
        idempotent: true,
        revision: read.revision,
        flow: view,
        ...(existingEvidence !== undefined ? { evidence: existingEvidence } : {}),
        ...(existingEvidence?.kind === "artifact" ? { recordPath: existingEvidence.ref } : {}),
      };
    }
    if (ROLE_CARDS_TERMINAL_STATUSES.has(step.status)) {
      return {
        ok: false,
        code: "role-cards-step-terminal",
        revision: read.revision,
        flow: view,
        error: `步骤 ${ROLE_CARDS_STEP_ID} 已是终态 ${step.status}，应用不覆盖终态。`,
      };
    }
    if (step.kind !== "artifact" && step.kind !== "dispatch") {
      return {
        ok: false,
        code: "role-cards-kind-unsupported",
        revision: read.revision,
        flow: view,
        error: `步骤 ${ROLE_CARDS_STEP_ID} 的 kind=${step.kind} 不受支持（只支持 artifact / dispatch）。`,
      };
    }

    const context: RoleCardsCompletionContext = {
      projectRoot,
      flowId,
      flow: read.flow,
      revision: read.revision,
      index,
      view,
      roleIds: checked.roleIds,
      files: checked.files,
      fingerprint: input.fingerprint,
      appointmentArtifactPath: checked.appointmentArtifactPath,
      log,
    };
    return step.kind === "artifact" ? completeRoleCardsArtifact(context) : completeRoleCardsDispatch(context);
  }).catch(internalError);
}

// —————————————————————— 应用专用：completeAcceptanceCriteriaStep ——————————————————————

/** `acceptance-criteria` 步骤的精确 id（本函数的唯一目标；不做前缀/相似匹配）。 */
const ACCEPTANCE_CRITERIA_STEP_ID = "acceptance-criteria";
/** 允许由应用收口到 done 的步骤状态（应用自身派发后直接收口，不经过 delivered）。 */
const ACCEPTANCE_CRITERIA_CLOSABLE_STATUSES: ReadonlySet<string> = new Set(["pending", "dispatched"]);

/** `completeAcceptanceCriteriaStep` 输入（应用专用，不是角色工具参数）。 */
export interface CompleteAcceptanceCriteriaStepInput {
  projectRoot: string;
  flowId: string;
}

/**
 * `completeAcceptanceCriteriaStep` 结果：复用 `FlowToolResult` 形状，并补充本次证据/标准路径。
 *
 * 错误码（桌面据此分流）：
 *   · 输入：`invalid-input` / `missing-flow-id`；
 *   · flow：`acceptance-criteria-step-missing` / `acceptance-criteria-step-terminal` /
 *     `acceptance-criteria-kind-unsupported`（以及读取既有码 `not-found`/`read-failed`/`invalid-flow`）；
 *   · 标准：`acceptance-criteria-missing`（最新 `<flowId>-criteria-vN.md` 不存在/不可读）/
 *     `acceptance-criteria-unobservable`（存在但不可安全观察：超大/二进制/路径非法）；
 *   · 证据/写入：`ledger-unavailable` / `ledger-write-failed` / `insufficient-evidence` / `write-failed`。
 */
export interface CompleteAcceptanceCriteriaStepResult extends FlowToolResult {
  /** 成功完成时实际写入 flow 的证据。 */
  evidence?: { kind: "artifact"; ref: string };
  /** 本次使用的最新验收标准（项目相对路径）。 */
  criteriaPath?: string;
  /** 步骤已是 done（幂等命中；本次未写盘）。 */
  alreadyDone?: boolean;
}

/**
 * **应用专用**：验收标准工件就绪后把 flow YAML 的 `id:"acceptance-criteria"` 步骤置 `done`。
 *
 * 背景：`acceptance-criteria` 是应用自身执行的步骤（owner=app）；应用验收门
 * `evaluateFlowCompletion` 会因它 pending 判「流程未完成」，导致验收永远派不出去。本函数是它的
 * 公共收口出口（与 `completeRoleCardsStep` 同形），**不注册为角色工具**。
 *
 * 契约（钉死）：
 *   · **只处理精确 id `acceptance-criteria`**；缺该步骤 ⇒ `acceptance-criteria-step-missing`；
 *     步骤 kind 非 `artifact` ⇒ `acceptance-criteria-kind-unsupported`。
 *   · **已 done ⇒ 幂等成功**（`{ok:true,idempotent:true,alreadyDone:true,code:"already-done"}`），
 *     不读标准、不写账本/flow；只从 `pending`/`dispatched` 收口到 `done`，其它状态 ⇒
 *     `acceptance-criteria-step-terminal`（不覆盖）。
 *   · **标准必须真实存在**：按既有版本扫描取最新 `docs/acceptance/<flowId>-criteria-vN.md`
 *     （`latestAcceptanceCriteriaRelPath`，不回退旧版本）；不存在/不可读 ⇒ `acceptance-criteria-missing`，
 *     存在但不可安全观察 ⇒ `acceptance-criteria-unobservable`（不猜、不伪造）。
 *   · **按现有 artifact 观测规则补 `artifact.observed`**：同 path+sha（flowId 缺省或相等）不重复追加；
 *     新追加条目固定 `actorRoleId:"app"`、`power:"app"`、`artifactPath`/`artifactSha256`/`flowId`；
 *     **不写** `customer.decision`、不伪造客户批准。
 *   · **证据校验沿用 FlowService 同一套内部原语**：候选 YAML 复核 + `validateFlowEvidence` 账本对账
 *     （只过滤目标 stepId 的 issue）；冲突/对账失败返回既有 `insufficient-evidence` 语义。
 *   · 只改目标步骤的 `status`/`evidence`，**不改其它步骤、owner、kind、flow schema**；不新增
 *     `FlowStepKind`、不改步骤权限规则。
 *   · 与 `createFlowService`/`completeRoleCardsStep` 共用 per-project 串行队列与原子写；写事件
 *     `flow.acceptance-criteria.completed`，view actor `app/app`；写失败不破坏原文件。
 */
export async function completeAcceptanceCriteriaStep(
  input: CompleteAcceptanceCriteriaStepInput,
): Promise<CompleteAcceptanceCriteriaStepResult> {
  if (typeof input?.projectRoot !== "string" || input.projectRoot.trim() === "") {
    return { ok: false, code: "invalid-input", error: "缺少 projectRoot。" };
  }
  const projectRoot = path.resolve(input.projectRoot);
  const flowId = input.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, code: "missing-flow-id", error: "缺少合法 flowId（应形如 todo-list-v1）。" };
  }
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });

  return serialize(projectRoot, async () => {
    const read = await readFlowState(projectRoot, flowId);
    if (!read.ok) return read.result;
    const view = viewOf(read.flow, read.revision, "app", "app");
    const index = read.flow.steps.findIndex((step) => step.id === ACCEPTANCE_CRITERIA_STEP_ID);
    if (index === -1) {
      return {
        ok: false,
        code: "acceptance-criteria-step-missing",
        revision: read.revision,
        flow: view,
        error: `流程缺少 id 为 "${ACCEPTANCE_CRITERIA_STEP_ID}" 的步骤（无法完成验收标准步骤）。`,
      };
    }
    const step = read.flow.steps[index]!;
    if (step.status === "done") {
      const existingEvidence =
        step.evidence !== undefined && step.evidence.kind === "artifact"
          ? { kind: "artifact" as const, ref: step.evidence.ref }
          : undefined;
      log.record("flow.acceptance-criteria.already-done", { flowId, stepId: step.id });
      return {
        ok: true,
        idempotent: true,
        alreadyDone: true,
        code: "already-done",
        revision: read.revision,
        flow: view,
        ...(existingEvidence !== undefined
          ? { evidence: existingEvidence, criteriaPath: existingEvidence.ref }
          : {}),
      };
    }
    if (!ACCEPTANCE_CRITERIA_CLOSABLE_STATUSES.has(step.status)) {
      return {
        ok: false,
        code: "acceptance-criteria-step-terminal",
        revision: read.revision,
        flow: view,
        error:
          `步骤 ${ACCEPTANCE_CRITERIA_STEP_ID} 当前状态为 ${step.status}；` +
          "应用只从 pending/dispatched 收口到 done，不覆盖其它状态。",
      };
    }
    if (step.kind !== "artifact") {
      return {
        ok: false,
        code: "acceptance-criteria-kind-unsupported",
        revision: read.revision,
        flow: view,
        error: `步骤 ${ACCEPTANCE_CRITERIA_STEP_ID} 的 kind=${step.kind} 不受支持（只支持 artifact）。`,
      };
    }

    // 1) 最新验收标准必须真实存在（版本扫描取最高 N；不回退旧版本）。
    const criteriaPath = latestAcceptanceCriteriaRelPath(projectRoot, flowId);
    if (criteriaPath === undefined) {
      log.record("flow.acceptance-criteria.missing", { flowId, stepId: step.id });
      return {
        ok: false,
        code: "acceptance-criteria-missing",
        revision: read.revision,
        flow: view,
        error:
          `流程 ${flowId} 缺少最新验收标准 docs/acceptance/${flowId}-criteria-vN.md（不存在或目录不可读）；` +
          `未完成 ${ACCEPTANCE_CRITERIA_STEP_ID}。`,
      };
    }
    const inspected = await inspectObservableArtifact(projectRoot, criteriaPath);
    if (!inspected.ok) {
      log.record("flow.acceptance-criteria.unobservable", {
        flowId,
        stepId: step.id,
        criteriaPath,
        reason: inspected.reason,
      });
      const code =
        inspected.reason === "missing" || inspected.reason === "read-failed"
          ? "acceptance-criteria-missing"
          : "acceptance-criteria-unobservable";
      return {
        ok: false,
        code,
        revision: read.revision,
        flow: view,
        error:
          `最新验收标准 ${criteriaPath} 不可用于收口（${inspected.reason}）；` +
          `未完成 ${ACCEPTANCE_CRITERIA_STEP_ID}，不伪造标准存在。`,
      };
    }

    // 2) 账本可读；按既有 artifact 观测规则补 app/app 的 artifact.observed（同 path+sha 不重复追加）。
    let ledger;
    try {
      ledger = await readGovernanceLedger(projectRoot);
    } catch (err) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (ledger.errors.length > 0) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
      };
    }

    let entries: GovernanceLedgerEntry[] = ledger.entries;
    const alreadyObserved = entries.some(
      (entry) =>
        entry.kind === "artifact.observed" &&
        typeof entry.artifactPath === "string" &&
        normalizeObservedRelPath(entry.artifactPath) === inspected.rel &&
        entry.artifactSha256 === inspected.sha256 &&
        (entry.flowId === undefined || entry.flowId === flowId),
    );
    if (!alreadyObserved) {
      const observedEntry: GovernanceLedgerEntry = {
        at: new Date().toISOString(),
        kind: "artifact.observed",
        actorRoleId: "app",
        power: "app",
        artifactPath: inspected.rel,
        artifactSha256: inspected.sha256,
        flowId,
      };
      const appended = await appendGovernanceLedger(projectRoot, observedEntry);
      if (!appended.ok) {
        log.error("flow.acceptance-criteria.ledger.failed", new Error(appended.message), {
          flowId,
          criteriaPath: inspected.rel,
        });
        return {
          ok: false,
          code: "ledger-write-failed",
          revision: read.revision,
          flow: view,
          error: appended.message,
        };
      }
      entries = [...entries, observedEntry];
      log.record("flow.acceptance-criteria.observed", { flowId, stepId: step.id, criteriaPath: inspected.rel });
    }

    // 3) 候选 YAML 复核 + 账本对账（沿用 flow-service 同一套内部原语；只过滤目标步骤的 issue）。
    const candidate: FlowState = {
      ...read.flow,
      steps: read.flow.steps.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, status: "done" as const, evidence: { kind: "artifact" as const, ref: inspected.rel } }
          : item,
      ),
    };
    const parsedCandidate = parseFlowStateYaml(serializeFlow(candidate), flowId);
    if (!parsedCandidate.ok) {
      return {
        ok: false,
        code: "invalid-flow",
        revision: read.revision,
        flow: view,
        error: `候选流程 YAML 校验失败：${parsedCandidate.error}`,
      };
    }
    const evidenceResult = validateFlowEvidence(parsedCandidate.flow, entries);
    if (!evidenceResult.ok) {
      const issues = evidenceResult.issues.filter((issue) => issue.stepId === ACCEPTANCE_CRITERIA_STEP_ID);
      if (issues.length > 0) {
        return {
          ok: false,
          code: "insufficient-evidence",
          revision: read.revision,
          flow: view,
          error: issues.map((issue) => issue.message).join("；"),
          issues: issues.map((issue) => `${issue.path}: ${issue.message}`),
        };
      }
    }

    const written = await writeFlowState({
      projectRoot,
      flowId,
      flow: parsedCandidate.flow,
      event: "flow.acceptance-criteria.completed",
      fields: { flowId, stepId: step.id, criteriaPath: inspected.rel },
      writeFile: (absPath, data) => atomicWrite(absPath, data),
      log,
      viewActorRoleId: "app",
      viewActorPower: "app",
    });
    if (!written.ok) return written;
    return { ...written, evidence: { kind: "artifact" as const, ref: inspected.rel }, criteriaPath: inspected.rel };
  }).catch(internalError);
}

// —————————————————————— 应用专用：gate 报告处置与 completeGateStep ——————————————————————
//
// 2026-10-26 客户授权 `request_gate_review`（设计 `2026-10-26_design_proof-gate-reviews.md` §6.3/§8.1）：
// gate 报告复用 `acceptance-triage/v1` 结构（同一解析器/严重度/上限）；应用只做**机械判定**：
//   · `pass`（可带 minor/nit 备注）⇒ 可收口；
//   · `fail`/`conditional` 且至少一个 blocker/major ⇒ 失败（gate 保持 pending；返工路由归应用侧）；
//   · `fail`/`conditional` **只有** minor/nit ⇒ 结构不符，退回 Proof（防吹毛求疵；不触发返工）；
//   · 缺报告/坏结构/矛盾 ⇒ 退回 Proof（解析器 R5 已拒绝 pass+blocker/major 与 fail 空 items）。
// gate 结论**不是**客户决定：不写 `customer.decision`、不进入 `latestAcceptanceDecision`/分诊/最终验收。

/** gate 报告的严重度计数（与 `acceptance-triage/v1` 同一组枚举）。 */
export interface GateReportSeverityCounts {
  blocker: number;
  major: number;
  minor: number;
  nit: number;
}

/**
 * gate 报告结论的机械处置：
 *   · `pass`             可收口 gate 步骤（可带 minor/nit 备注）；
 *   · `fail`             至少一个 blocker/major ⇒ 失败（不标 done；返工路由由应用侧按 gate 记录处置）；
 *   · `return-to-proof`  只有 minor/nit 的 fail/conditional（或解析失败时由调用方另行处理）⇒ 按结构不符
 *                        退回 Proof，**不触发返工**（客户防吹毛求疵要求）。
 */
export type GateReviewVerdict =
  | {
      outcome: "pass";
      conclusion: "pass";
      severityCounts: GateReportSeverityCounts;
      items: AcceptanceTriageItem[];
    }
  | {
      outcome: "fail";
      conclusion: "fail" | "conditional";
      severityCounts: GateReportSeverityCounts;
      items: AcceptanceTriageItem[];
    }
  | {
      outcome: "return-to-proof";
      reason: "nonblocking-fail";
      conclusion: "fail" | "conditional";
      severityCounts: GateReportSeverityCounts;
      items: AcceptanceTriageItem[];
    };

/** 统计 gate 报告严重度（纯函数）。 */
export function gateReportSeverityCounts(items: readonly AcceptanceTriageItem[]): GateReportSeverityCounts {
  const counts: GateReportSeverityCounts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const item of items) counts[item.severity] += 1;
  return counts;
}

/**
 * gate 报告结论处置（纯函数；客户 2026-10-26 追加要求）：
 * `fail` 必须至少一个 blocker/major；只有 minor/nit 的 fail 按结构不符退回 Proof、不触发返工；
 * `pass` 可带 minor/nit 备注（不因非阻断建议反复开 gate）。
 */
export function classifyGateReviewTriage(triage: AcceptanceTriageSection): GateReviewVerdict {
  const severityCounts = gateReportSeverityCounts(triage.items);
  if (triage.conclusion === "pass") {
    return { outcome: "pass", conclusion: "pass", severityCounts, items: [...triage.items] };
  }
  const blocking = severityCounts.blocker + severityCounts.major;
  if (blocking > 0) {
    return {
      outcome: "fail",
      conclusion: triage.conclusion,
      severityCounts,
      items: [...triage.items],
    };
  }
  return {
    outcome: "return-to-proof",
    reason: "nonblocking-fail",
    conclusion: triage.conclusion,
    severityCounts,
    items: [...triage.items],
  };
}

/** 允许由应用按 Proof gate 报告收口到 done 的步骤状态（gate 正常保持 pending）。 */
const GATE_STEP_CLOSABLE_STATUSES: ReadonlySet<string> = new Set(["pending", "dispatched", "delivered"]);

/** `completeGateStep` 输入（应用专用，不是角色工具参数；`gateId` 为 gate 步骤 id）。 */
export interface CompleteGateStepInput {
  projectRoot: string;
  flowId: string;
  gateId: string;
}

/**
 * `completeGateStep` 结果：复用 `FlowToolResult` 形状，并补充本次证据/报告信息。
 *
 * 错误码（桌面据此分流；**不覆盖其它状态、不伪造通过**）：
 *   · 输入：`invalid-input` / `missing-flow-id` / `invalid-gate-id`；
 *   · flow：`gate-step-missing` / `gate-step-kind-unsupported` / `gate-step-terminal`
 *     （以及读取既有码 `not-found` / `read-failed` / `invalid-flow`）；
 *   · 报告：`gate-report-missing`（最新 `<flowId>-<gateId>-report-vN.md` 不存在/不可读）/
 *     `gate-report-unobservable`（存在但不可安全观察：超大/二进制/路径非法）/
 *     `gate-report-invalid`（缺 `acceptance-triage/v1` / 段坏 / 矛盾——退回 Proof，不标 done）/
 *     `gate-report-nonblocking-fail`（fail/conditional 只有 minor/nit——结构不符退回 Proof，不返工）/
 *     `gate-report-failed`（fail/conditional 含 blocker/major——不标 done，等待返工后重新复核）；
 *   · 证据/写入：`ledger-unavailable` / `ledger-write-failed` / `insufficient-evidence` / `write-failed`。
 */
export interface CompleteGateStepResult extends FlowToolResult {
  /** 成功完成时实际写入 flow 的证据（最新 gate 报告路径）。 */
  evidence?: { kind: "artifact"; ref: string };
  /** 本次使用的最新 gate 报告（项目相对路径）。 */
  reportPath?: string;
  /** 最新 gate 报告版本号 N。 */
  reportVersion?: number;
  /** 最新 gate 报告 sha256（应用侧写 `gate.review` 审计时可直接使用；不做二次猜测）。 */
  reportSha256?: string;
  /** 步骤已是 done（幂等命中；本次未写盘）。 */
  alreadyDone?: boolean;
  /** gate 种类（原样返回，便于调用方记录 gate.review 审计）。 */
  gateKind?: FlowGateKind;
  /** 仅成功收口且报告为 pass 时给出。 */
  verdict?: "pass";
  severityCounts?: GateReportSeverityCounts;
  itemCount?: number;
}

/**
 * **应用专用**：Proof 已产出 gate 报告且结论为 `pass` 时，把 flow YAML 的 gate 步骤置 `done`。
 *
 * 背景（设计 §8.1）：gate 步骤是 `kind: artifact` + `gateKind`；`done` **只能由应用**按 Proof 报告
 * 收口，角色 `flow_step_update(done)` 一律拒绝（`gate-review-required`）。本函数与
 * `completeAcceptanceCriteriaStep` 同构，**不注册为角色工具**。
 *
 * 契约（钉死）：
 *   · 目标步骤必须存在且含 `gateKind`（否则 `gate-step-missing` / `gate-step-kind-unsupported`）；
 *     步骤 kind 非 artifact ⇒ `gate-step-kind-unsupported`（防御；解析器已保证）。
 *   · **已 done ⇒ 幂等成功**（`{ok:true,idempotent:true,alreadyDone:true,code:"already-done"}`），
 *     不读报告、不写账本/flow；只从 pending/dispatched/delivered 收口，其它状态 ⇒
 *     `gate-step-terminal`（不覆盖 failed/blocked/aborted/superseded）。
 *   · **最新 gate 报告必须真实存在**：扫描 `docs/acceptance/<flowId>-<gateId>-report-vN.md` 取最高 N
 *     （`latestGateReviewReport`，不回退旧版本）；不存在/不可读 ⇒ `gate-report-missing`；不可安全
 *     观察 ⇒ `gate-report-unobservable`。
 *   · **报告结构**：复用 `acceptance-triage/v1`（`parseAcceptanceTriageReport`）；缺段/段坏/矛盾 ⇒
 *     `gate-report-invalid`（退回 Proof，不标 done、不返工）。
 *   · **防吹毛求疵**：`fail`/`conditional` 必须至少一个 blocker/major；只有 minor/nit 的 fail ⇒
 *     `gate-report-nonblocking-fail`（结构不符退回 Proof，**不触发返工**）；含 blocker/major 的 fail ⇒
 *     `gate-report-failed`（不标 done；返工后由统筹重新请求 gate 复核）。
 *   · **按现有 artifact 观测规则补 `artifact.observed`**：同 path+sha（flowId 缺省或相等）不重复追加；
 *     新条目固定 `actorRoleId:"app"`、`power:"app"`；**不写** `customer.decision`、不写 `gate.review`
 *     审计（由应用侧在 settle/导入处置时写）、不伪造客户批准。
 *   · **证据校验沿用 FlowService 同一套内部原语**：候选 YAML 复核 + `validateFlowEvidence` 账本对账
 *     （只过滤目标 stepId 的 issue）。
 *   · 只改目标步骤的 `status`/`evidence`，**不改其它步骤、owner、kind、gateKind、flow schema**。
 *   · 与 `createFlowService` 共用 per-project 串行队列与原子写；写事件 `flow.gate.completed`，
 *     view actor `app/app`；写失败不破坏原文件。
 */
export async function completeGateStep(input: CompleteGateStepInput): Promise<CompleteGateStepResult> {
  if (typeof input?.projectRoot !== "string" || input.projectRoot.trim() === "") {
    return { ok: false, code: "invalid-input", error: "缺少 projectRoot。" };
  }
  const projectRoot = path.resolve(input.projectRoot);
  const flowId = input.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, code: "missing-flow-id", error: "缺少合法 flowId（应形如 todo-list-v1）。" };
  }
  const gateId = input.gateId;
  if (typeof gateId !== "string" || !isFlowGateStepId(gateId)) {
    return {
      ok: false,
      code: "invalid-gate-id",
      error: `缺少合法 gateId（含 gateKind 的步骤 id 必须匹配 gate-<slug>，如 gate-vertical-slice；当前 ${JSON.stringify(gateId)}）。`,
    };
  }
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });

  return serialize(projectRoot, async () => {
    const read = await readFlowState(projectRoot, flowId);
    if (!read.ok) return read.result;
    const view = viewOf(read.flow, read.revision, "app", "app");
    const index = read.flow.steps.findIndex((step) => step.id === gateId);
    if (index === -1) {
      return {
        ok: false,
        code: "gate-step-missing",
        revision: read.revision,
        flow: view,
        error: `流程中没有 gate 步骤 ${gateId}（无法完成 gate 复核）。`,
      };
    }
    const step = read.flow.steps[index]!;
    if (step.gateKind === undefined) {
      return {
        ok: false,
        code: "gate-step-kind-unsupported",
        revision: read.revision,
        flow: view,
        error: `步骤 ${step.id} 不含 gateKind（不是 gate 步骤）；本函数只收口 gate 步骤。`,
      };
    }
    if (step.kind !== "artifact") {
      return {
        ok: false,
        code: "gate-step-kind-unsupported",
        revision: read.revision,
        flow: view,
        error: `gate 步骤 ${step.id} 的 kind=${step.kind} 不受支持（只支持 artifact）。`,
      };
    }
    if (step.status === "done") {
      const existingEvidence =
        step.evidence !== undefined && step.evidence.kind === "artifact"
          ? { kind: "artifact" as const, ref: step.evidence.ref }
          : undefined;
      log.record("flow.gate.already-done", { flowId, gateId, gateKind: step.gateKind });
      return {
        ok: true,
        idempotent: true,
        alreadyDone: true,
        code: "already-done",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        ...(existingEvidence !== undefined
          ? { evidence: existingEvidence, reportPath: existingEvidence.ref }
          : {}),
      };
    }
    if (!GATE_STEP_CLOSABLE_STATUSES.has(step.status)) {
      return {
        ok: false,
        code: "gate-step-terminal",
        revision: read.revision,
        flow: view,
        error:
          `gate 步骤 ${step.id} 当前状态为 ${step.status}；应用只从 pending/dispatched/delivered 收口到 done，` +
          "不覆盖其它状态。",
      };
    }

    // 1) 最新 gate 报告必须真实存在（版本扫描取最高 N；不回退旧版本）。
    const latestReport = latestGateReviewReport(projectRoot, flowId, gateId);
    if (latestReport === undefined) {
      log.record("flow.gate.report.missing", { flowId, gateId, gateKind: step.gateKind });
      return {
        ok: false,
        code: "gate-report-missing",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        error:
          `流程 ${flowId} 的 gate ${gateId} 缺少最新报告 docs/acceptance/${flowId}-${gateId}-report-vN.md` +
          "（不存在或目录不可读）；未完成 gate 步骤，不伪造通过。",
      };
    }
    const inspected = await inspectObservableArtifact(projectRoot, latestReport.relPath);
    if (!inspected.ok) {
      log.record("flow.gate.report.unobservable", {
        flowId,
        gateId,
        reportPath: latestReport.relPath,
        reason: inspected.reason,
      });
      const code =
        inspected.reason === "missing" || inspected.reason === "read-failed"
          ? "gate-report-missing"
          : "gate-report-unobservable";
      return {
        ok: false,
        code,
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        reportPath: latestReport.relPath,
        reportVersion: latestReport.version,
        error:
          `最新 gate 报告 ${latestReport.relPath} 不可用于收口（${inspected.reason}）；` +
          "未完成 gate 步骤，不伪造报告存在。",
      };
    }
    let reportText: string;
    try {
      reportText = await readFile(path.join(projectRoot, ...inspected.rel.split("/")), "utf8");
    } catch (err) {
      return {
        ok: false,
        code: "gate-report-unobservable",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        reportPath: latestReport.relPath,
        reportVersion: latestReport.version,
        error: `最新 gate 报告 ${latestReport.relPath} 不可读：${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 2) `acceptance-triage/v1` 结构 + 结论处置（机械判定；语义判定归 Proof）。
    const parsed = parseAcceptanceTriageReport(reportText);
    if (!parsed.ok) {
      log.record("flow.gate.report.invalid", {
        flowId,
        gateId,
        reportPath: latestReport.relPath,
        parseCode: parsed.code,
      });
      return {
        ok: false,
        code: "gate-report-invalid",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        reportPath: latestReport.relPath,
        reportVersion: latestReport.version,
        reportSha256: inspected.sha256,
        error:
          `gate 报告 ${latestReport.relPath} 缺少合格 acceptance-triage/v1 结构（${parsed.code}）：` +
          `${parsed.errors.map((item) => `${item.path}: ${item.message}`).join("；")}；` +
          "按结构不符退回 Proof 补报告，不标 done、不路由返工、不猜结论。",
        issues: parsed.errors.map((item) => `${item.path}: ${item.message}`),
      };
    }
    const verdict = classifyGateReviewTriage(parsed.triage);
    if (verdict.outcome === "return-to-proof") {
      log.record("flow.gate.report.nonblocking-fail", {
        flowId,
        gateId,
        reportPath: latestReport.relPath,
        conclusion: verdict.conclusion,
      });
      return {
        ok: false,
        code: "gate-report-nonblocking-fail",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        reportPath: latestReport.relPath,
        reportVersion: latestReport.version,
        reportSha256: inspected.sha256,
        severityCounts: verdict.severityCounts,
        itemCount: verdict.items.length,
        error:
          `gate 报告 ${latestReport.relPath} 结论为 ${verdict.conclusion}，但没有任何 blocker/major` +
          `（blocker=0，major=0，minor=${verdict.severityCounts.minor}，nit=${verdict.severityCounts.nit}）；` +
          "按结构不符退回 Proof——只有 minor/nit 不构成返工依据，gate 保持 pending。",
      };
    }
    if (verdict.outcome === "fail") {
      log.record("flow.gate.report.failed", {
        flowId,
        gateId,
        reportPath: latestReport.relPath,
        severityCounts: verdict.severityCounts,
      });
      return {
        ok: false,
        code: "gate-report-failed",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        reportPath: latestReport.relPath,
        reportVersion: latestReport.version,
        reportSha256: inspected.sha256,
        severityCounts: verdict.severityCounts,
        itemCount: verdict.items.length,
        error:
          `gate 报告 ${latestReport.relPath} 结论为 ${verdict.conclusion}（blocker=${verdict.severityCounts.blocker}，` +
          `major=${verdict.severityCounts.major}）；gate 未通过，不标 done；等待返工后重新请求 gate 复核。`,
      };
    }

    // 3) 账本可读；按既有 artifact 观测规则补 app/app 的 artifact.observed（同 path+sha 不重复追加）。
    let ledger;
    try {
      ledger = await readGovernanceLedger(projectRoot);
    } catch (err) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (ledger.errors.length > 0) {
      return {
        ok: false,
        code: "ledger-unavailable",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
      };
    }

    let entries: GovernanceLedgerEntry[] = ledger.entries;
    const alreadyObserved = entries.some(
      (entry) =>
        entry.kind === "artifact.observed" &&
        typeof entry.artifactPath === "string" &&
        normalizeObservedRelPath(entry.artifactPath) === inspected.rel &&
        entry.artifactSha256 === inspected.sha256 &&
        (entry.flowId === undefined || entry.flowId === flowId),
    );
    if (!alreadyObserved) {
      const observedEntry: GovernanceLedgerEntry = {
        at: new Date().toISOString(),
        kind: "artifact.observed",
        actorRoleId: "app",
        power: "app",
        artifactPath: inspected.rel,
        artifactSha256: inspected.sha256,
        flowId,
      };
      const appended = await appendGovernanceLedger(projectRoot, observedEntry);
      if (!appended.ok) {
        log.error("flow.gate.ledger.failed", new Error(appended.message), {
          flowId,
          gateId,
          reportPath: inspected.rel,
        });
        return {
          ok: false,
          code: "ledger-write-failed",
          revision: read.revision,
          flow: view,
          gateKind: step.gateKind,
          error: appended.message,
        };
      }
      entries = [...entries, observedEntry];
      log.record("flow.gate.observed", { flowId, gateId, reportPath: inspected.rel });
    }

    // 4) 候选 YAML 复核 + 账本对账（沿用 flow-service 同一套内部原语；只过滤目标步骤的 issue）。
    const candidate: FlowState = {
      ...read.flow,
      steps: read.flow.steps.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, status: "done" as const, evidence: { kind: "artifact" as const, ref: inspected.rel } }
          : item,
      ),
    };
    const parsedCandidate = parseFlowStateYaml(serializeFlow(candidate), flowId);
    if (!parsedCandidate.ok) {
      return {
        ok: false,
        code: "invalid-flow",
        revision: read.revision,
        flow: view,
        gateKind: step.gateKind,
        error: `候选流程 YAML 校验失败：${parsedCandidate.error}`,
      };
    }
    const evidenceResult = validateFlowEvidence(parsedCandidate.flow, entries);
    if (!evidenceResult.ok) {
      const issues = evidenceResult.issues.filter((issue) => issue.stepId === gateId);
      if (issues.length > 0) {
        return {
          ok: false,
          code: "insufficient-evidence",
          revision: read.revision,
          flow: view,
          gateKind: step.gateKind,
          error: issues.map((issue) => issue.message).join("；"),
          issues: issues.map((issue) => `${issue.path}: ${issue.message}`),
        };
      }
    }

    const written = await writeFlowState({
      projectRoot,
      flowId,
      flow: parsedCandidate.flow,
      event: "flow.gate.completed",
      fields: { flowId, gateId, gateKind: step.gateKind, reportPath: inspected.rel, reportVersion: latestReport.version },
      writeFile: (absPath, data) => atomicWrite(absPath, data),
      log,
      viewActorRoleId: "app",
      viewActorPower: "app",
    });
    if (!written.ok) return written;
    return {
      ...written,
      evidence: { kind: "artifact" as const, ref: inspected.rel },
      reportPath: inspected.rel,
      reportVersion: latestReport.version,
      reportSha256: inspected.sha256,
      gateKind: step.gateKind,
      verdict: "pass" as const,
      severityCounts: verdict.severityCounts,
      itemCount: verdict.items.length,
    };
  }).catch(internalError);
}

// —————————————————————— 应用专用：observeFlowArtifacts ——————————————————————

/** 观察路径排除的段（应用私有/治理产物/依赖/版本库）。 */
const OBSERVE_SKIP_SEGMENTS: ReadonlySet<string> = new Set([".ans", "角色卡", ".git", "node_modules"]);
/** 单文件观察上限（与项目角色 artifact 扫描一致）。 */
const OBSERVE_ARTIFACT_MAX_BYTES = 2 * 1024 * 1024;
/** 图片扩展不做 NUL 二进制探测。 */
const OBSERVE_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function observeExtension(rel: string): string {
  const base = rel.split("/").pop() ?? "";
  const index = base.lastIndexOf(".");
  return index === -1 ? "" : base.slice(index).toLowerCase();
}

/** 观察路径安全解析：拒绝绝对/URL/`..`/空段/排除段/项目外；返回规范化的项目相对路径。 */
function observeRelPath(projectRoot: string, ref: string): string | undefined {
  if (typeof ref !== "string") return undefined;
  const normalized = ref.replace(/\\/g, "/").trim();
  if (normalized === "") return undefined;
  if (normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized)) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return undefined;
  const rel = normalized.replace(/^\.\//, "");
  if (rel === "" || rel.startsWith("../")) return undefined;
  const segments = rel.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  if (segments.some((segment) => OBSERVE_SKIP_SEGMENTS.has(segment))) return undefined;
  const abs = path.resolve(projectRoot, ...segments);
  if (abs !== projectRoot && !abs.startsWith(projectRoot + path.sep)) return undefined;
  return rel;
}

function looksBinaryObserve(data: Buffer, rel: string): boolean {
  if (OBSERVE_IMAGE_EXTENSIONS.has(observeExtension(rel))) return false;
  return data.subarray(0, Math.min(data.length, 8192)).includes(0);
}

/**
 * 步骤 owner → 账本 power：内置治理角色按 function；其他（项目角色/未知）记 `project`。
 * 2026-10-22：映射**不变**——团队计划/readiness/变更包由 Convener 写 → `schedule`；验收标准/报告由
 * Verifier 写 → `verification`；这些都是普通项目相对路径的 artifact，可被 `observeFlowArtifacts` 观察。
 * `角色卡/` 仍在 `OBSERVE_SKIP_SEGMENTS` 内，不被观察。
 */
function artifactPowerOf(owner: string): GovernancePower {
  switch (owner) {
    case "liaison":
      return "liaison";
    case "rapporteur":
      return "proposal";
    case "nominator":
      return "nomination";
    case "convener":
      return "schedule";
    case "verifier":
      return "verification";
    default:
      return "project";
  }
}

/** 单文件观察检查结果：可观察 ⇒ 规范化相对路径 + sha256；否则给出跳过原因（path-invalid 用原 ref，其余用 rel）。 */
type ObservableArtifactInspection =
  | { ok: true; rel: string; sha256: string }
  | { ok: false; path: string; reason: "path-invalid" | "missing" | "too-large" | "binary" | "read-failed" };

/**
 * 只读检查单个声明的证据路径是否可安全观察（observeFlowArtifacts 批量循环与 done 时补观测共用）：
 * 路径规则（绝对/URL/`..`/排除段/项目外）→ lstat 常规文件且非符号链接 → ≤2MiB → 读取 →
 * 非图片扩展的 NUL 二进制探测 → sha256。不写任何文件。
 */
async function inspectObservableArtifact(projectRoot: string, ref: string): Promise<ObservableArtifactInspection> {
  const rel = observeRelPath(projectRoot, ref);
  if (rel === undefined) return { ok: false, path: ref, reason: "path-invalid" };
  const abs = path.join(projectRoot, ...rel.split("/"));
  let info;
  try {
    info = await lstat(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return { ok: false, path: rel, reason: code === "ENOENT" ? "missing" : "read-failed" };
  }
  if (!info.isFile() || info.isSymbolicLink()) return { ok: false, path: rel, reason: "missing" };
  if (info.size > OBSERVE_ARTIFACT_MAX_BYTES) return { ok: false, path: rel, reason: "too-large" };
  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    return { ok: false, path: rel, reason: "read-failed" };
  }
  if (looksBinaryObserve(data, rel)) return { ok: false, path: rel, reason: "binary" };
  return { ok: true, rel, sha256: sha256(data) };
}

/** 与 flow-state.ts::normalizeRelPath 同口径（`\`→`/`、去掉一个前导 `./`；不 trim）。 */
function normalizeObservedRelPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

type EnsureArtifactObservedResult =
  | { status: "already-observed" }
  | { status: "observed"; entry: GovernanceLedgerEntry }
  | { status: "skipped"; reason: string }
  | { status: "append-failed"; message: string };

/**
 * done 收口前的单 ref 补观测（模块私有；**不得**调用 serialize/observeFlowArtifacts）：
 *   · 账本已有同 path（`flowId` 缺省或相等）的 `artifact.observed` ⇒ already-observed（不读文件）；
 *   · 否则按 inspectObservableArtifact 的安全规则检查；不可观察 ⇒ skipped（不追加、不伪造）；
 *   · 追加条目只含 `artifact.observed{actorRoleId: step.owner, power: artifactPowerOf(owner),
 *     artifactPath, artifactSha256, flowId}`——**不写** stepId/customer.decision；
 *   · 追加失败 ⇒ append-failed（不抛）；追加成功后仍由调用方用 validateFlowEvidence 裁决。
 */
async function ensureArtifactObserved(input: {
  projectRoot: string;
  flowId: string;
  step: FlowStateStep;
  ref: string;
  entries: readonly GovernanceLedgerEntry[];
}): Promise<EnsureArtifactObservedResult> {
  const target = normalizeObservedRelPath(input.ref);
  const alreadyObserved = input.entries.some(
    (entry) =>
      entry.kind === "artifact.observed" &&
      typeof entry.artifactPath === "string" &&
      normalizeObservedRelPath(entry.artifactPath) === target &&
      (entry.flowId === undefined || entry.flowId === input.flowId),
  );
  if (alreadyObserved) return { status: "already-observed" };

  const inspected = await inspectObservableArtifact(input.projectRoot, input.ref);
  if (!inspected.ok) return { status: "skipped", reason: inspected.reason };
  // 只追加将来能被 validateFlowEvidence 匹配的记录（observeRelPath 会 trim，归一化口径不含 trim）。
  if (normalizeObservedRelPath(input.ref) !== inspected.rel) return { status: "skipped", reason: "path-invalid" };

  const entry: GovernanceLedgerEntry = {
    at: new Date().toISOString(),
    kind: "artifact.observed",
    actorRoleId: input.step.owner,
    power: artifactPowerOf(input.step.owner),
    artifactPath: inspected.rel,
    artifactSha256: inspected.sha256,
    flowId: input.flowId,
  };
  const appended = await appendGovernanceLedger(input.projectRoot, entry);
  if (!appended.ok) return { status: "append-failed", message: appended.message };
  return { status: "observed", entry };
}

export interface ObserveFlowArtifactsResult {
  ok: boolean;
  /** 本次**新追加** `artifact.observed` 的路径（幂等命中/跳过的不在此列）。 */
  observed: string[];
  /** 未观察的路径及原因：`path-invalid` / `missing` / `too-large` / `binary` / `read-failed` / `append-failed`。 */
  skipped: Array<{ path: string; reason: string }>;
  error?: string;
}

/**
 * **应用专用**：把 flow YAML 中 `kind:"artifact"` 且有 `evidence.ref` 的步骤对应的文件补记为
 * `artifact.observed`（用于重启后新扫描把旧证据当基线、Steward/Lead 无法 done 的补偿）。
 *
 * - 状态不限（pending/dispatched/delivered/done 都可观察）；文件必须存在、常规文件、≤2MiB；
 *   文本扩展名含 NUL 视为二进制跳过；路径拒绝绝对/URL/`..`/项目外/`.ans`/`角色卡`/`.git`/`node_modules`。
 * - 账本已有**同 path+sha** 的 `artifact.observed` ⇒ 幂等跳过（不重复追加）。
 * - 追加 `artifact.observed{actorRoleId: step.owner, power: 内置角色按 function / 否则 project,
 *   artifactPath: ref, artifactSha256, flowId}`；**不写 customer.decision**、不伪造客户批准。
 * - 失败只返回/诊断，不抛；`ok:false` 仅用于流程/账本不可读或 append 失败（missing/超大/二进制等只进 skipped）。
 * - 与 flow-service 共用 per-project 串行队列；账本 append 自带 append-only/fsync 语义。
 */
export async function observeFlowArtifacts(input: {
  projectRoot: string;
  flowId: string;
}): Promise<ObserveFlowArtifactsResult> {
  const projectRoot = path.resolve(input.projectRoot);
  const flowId = input.flowId;
  if (typeof flowId !== "string" || !FLOW_ID_RE.test(flowId)) {
    return { ok: false, observed: [], skipped: [], error: "缺少合法 flowId（应形如 todo-list-v1）。" };
  }
  const log = createDiagnosticLogger({ component: "orchestration.flow-service", projectRoot });
  return serialize(projectRoot, async () => {
    const read = await readFlowState(projectRoot, flowId);
    if (!read.ok) {
      return { ok: false, observed: [], skipped: [], error: read.result.error ?? "流程状态不可读。" };
    }
    let ledger;
    try {
      ledger = await readGovernanceLedger(projectRoot);
    } catch (err) {
      return {
        ok: false,
        observed: [],
        skipped: [],
        error: `治理账本不可读：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (ledger.errors.length > 0) {
      return {
        ok: false,
        observed: [],
        skipped: [],
        error: `治理账本不可读或存在坏行：${ledger.errors[0]}`,
      };
    }

    const observed: string[] = [];
    const skipped: Array<{ path: string; reason: string }> = [];
    const errors: string[] = [];
    const existing = new Set(
      ledger.entries
        .filter(
          (entry) =>
            entry.kind === "artifact.observed" &&
            typeof entry.artifactPath === "string" &&
            typeof entry.artifactSha256 === "string",
        )
        .map((entry) => `${entry.artifactPath}\u0000${entry.artifactSha256}`),
    );
    const seen = new Set<string>();

    for (const step of read.flow.steps) {
      if (step.kind !== "artifact") continue;
      // 2026-10-26 gate 复核（设计 §8.4）：含 gateKind 的步骤**必须跳过**自动观测——gate 报告存在
      // 不等于通过；失败/坏结构报告若被观测成 artifact.observed，会被误当成 done 证据。gate 证据只经
      // `completeGateStep` 在结论为 pass 时观察。
      if (step.gateKind !== undefined) continue;
      const ref = step.evidence?.ref;
      if (typeof ref !== "string" || ref.trim() === "") continue;
      const inspected = await inspectObservableArtifact(projectRoot, ref);
      if (!inspected.ok) {
        skipped.push({ path: inspected.path, reason: inspected.reason });
        continue;
      }
      const rel = inspected.rel;
      const sha = inspected.sha256;
      const key = `${rel}\u0000${sha}`;
      if (seen.has(key) || existing.has(key)) continue; // 幂等：本次/账本已有同 path+sha
      seen.add(key);
      const entry: GovernanceLedgerEntry = {
        at: new Date().toISOString(),
        kind: "artifact.observed",
        actorRoleId: step.owner,
        power: artifactPowerOf(step.owner),
        artifactPath: rel,
        artifactSha256: sha,
        flowId,
      };
      const appended = await appendGovernanceLedger(projectRoot, entry);
      if (appended.ok) {
        observed.push(rel);
      } else {
        skipped.push({ path: rel, reason: "append-failed" });
        errors.push(appended.message);
      }
    }

    log.record("flow.artifacts.observed", {
      flowId,
      observed: observed.length,
      skipped: skipped.length,
    });
    return {
      ok: errors.length === 0,
      observed,
      skipped,
      ...(errors.length > 0 ? { error: errors.join("；") } : {}),
    };
  }).catch((err) => ({
    ok: false,
    observed: [],
    skipped: [],
    error: `流程 artifact 观察失败：${err instanceof Error ? err.message : String(err)}`,
  }));
}

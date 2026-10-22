// src/common/编排/flow-service.ts
// **Flow 文件方法化（编排侧核心，2026-10-20 客户拍板「按这个方案做吧」）**。
//
// 目标：应用是 `docs/flows/<flowId>.yaml` 的**唯一写者**；角色不再直接写流程文件，改用工具
// （`flow_get` / `flow_step_update` / `flow_step_supersede`，能力字段名 `flowGet` /
// `flowStepUpdate` / `flowStepSupersede`）。本模块只写 YAML，不写客户决定账本。
//
// 钉死语义：
//   · **串行**：同一项目（projectRoot）的 mutation 走进程内 Promise 链（读-改-写都在临界区）；
//   · **版本校验**：`expectedRevision` 必须等于当前文件字节的 sha256，否则 `revision-conflict`；
//   · **证据对账**：`done` 必须有 evidence，并用 `flow-state.ts::validateFlowEvidence` 对候选 flow
//     与账本对账（只过滤目标 stepId 的 issue）；
//   · **原子写**：复用 `common/shared/atomic-write.ts`（tmp + fsync + rename）；失败不破坏原文件；
//   · **幂等**：目标步骤当前 status/evidence 与请求一致 ⇒ `idempotent:true`，不写盘；
//   · **权限**：工作流管理者 = Steward/Convener（actorPower="schedule"）或 Lead/Liaison
//     （actorPower="liaison"，2026-10-20 客户拍板「把主理 Lead 设为工作流管理者」）——可更新全部未终态步骤；
//     其他角色只能更新 owner=自己的步骤，且只允许 `dispatched→delivered`、
//     `dispatched|delivered→failed|blocked`；`pending→dispatched`、`delivered→done`、supersede 仅管理者。
//
// 本模块不 import 适配器/运行时核心；只读 `flow-state.ts` 与账本，写 YAML 经共享原子写原语。

import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { atomicWrite } from "../shared/atomic-write.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
import {
  flowStatePath,
  isReservedAcceptanceStepId,
  parseFlowStateYaml,
  validateFlowEvidence,
  type FlowState,
  type FlowStateStep,
} from "./flow-state.ts";
import { appendGovernanceLedger, readGovernanceLedger, type GovernanceLedgerEntry, type GovernancePower } from "./governance-ledger.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import type {
  FlowGetFn,
  FlowStepSupersedeFn,
  FlowStepUpdateFn,
  FlowToolEvidence,
  FlowToolResult,
  FlowToolStepKind,
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

function viewOf(flow: FlowState, revision: string, actorRoleId: string, actorPower: string): FlowToolView {
  const isManager = isManagerPower(actorPower);
  const canUpdate = flow.steps
    .filter((step) => !TERMINAL_STATUSES.has(step.status))
    .filter((step) => isManager || step.owner === actorRoleId)
    .map((step) => step.id);
  return {
    flowId: flow.flowId,
    revision,
    qualityTier: flow.qualityTier,
    steps: flow.steps.map((step) => ({
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind,
      status: step.status,
      ...(step.evidence !== undefined ? { evidence: { kind: step.evidence.kind, ref: step.evidence.ref } } : {}),
      ...(step.supersedes !== undefined ? { supersedes: [...step.supersedes] } : {}),
      ...(step.supersededBy !== undefined ? { supersededBy: step.supersededBy } : {}),
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
    steps: flow.steps.map((step) => ({
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind,
      status: step.status,
      ...(step.evidence !== undefined ? { evidence: { kind: step.evidence.kind, ref: step.evidence.ref } } : {}),
      ...(step.supersedes !== undefined ? { supersedes: [...step.supersedes] } : {}),
      ...(step.supersededBy !== undefined ? { supersededBy: step.supersededBy } : {}),
    })),
  };
  return stringifyYaml(document, { lineWidth: 0 });
}

function sameEvidence(left: FlowStateStep["evidence"], right: FlowToolEvidence | undefined): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return left.kind === right.kind && left.ref === right.ref;
}

/**
 * 合法状态迁移（管理者/owner 共用；owner 另有额外限制在调用处）：
 *   pending → dispatched（仅管理者）
 *   dispatched → delivered | failed | blocked
 *   delivered → done（仅管理者） | failed | blocked
 *   failed | blocked | aborted → dispatched（仅管理者：重派）
 * `superseded` 只能走 `supersede`，不能经 update 设置。
 */
function isTransitionAllowed(from: FlowToolStatus, to: FlowToolStatus, isManager: boolean): boolean {
  if (to === "superseded") return false;
  if (from === "pending") return isManager && to === "dispatched";
  if (from === "dispatched") return to === "delivered" || to === "failed" || to === "blocked";
  if (from === "delivered") {
    if (to === "done") return isManager;
    return to === "failed" || to === "blocked";
  }
  if (from === "failed" || from === "blocked" || from === "aborted") {
    return isManager && to === "dispatched";
  }
  return false;
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
        if (input.expectedRevision !== revision) {
          log.record("flow.conflict", {
            flowId,
            stepId: input.stepId,
            expectedRevision: input.expectedRevision,
            actualRevision: revision,
          });
          return {
            ok: false,
            code: "revision-conflict",
            revision,
            flow: flowView,
            error: `流程版本已变化（期望 ${input.expectedRevision}，当前 ${revision}），请重新读取后重试。`,
          };
        }

        const index = flow.steps.findIndex((step) => step.id === input.stepId);
        if (index === -1) {
          return { ok: false, code: "step-not-found", revision, flow: flowView, error: `流程中没有步骤 ${input.stepId}。` };
        }
        const step = flow.steps[index]!;
        const isManager = isManagerPower(actorPower);

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
        if (step.status !== input.status && !isTransitionAllowed(step.status, input.status, isManager)) {
          return {
            ok: false,
            code: "invalid-transition",
            revision,
            flow: flowView,
            error: `不允许从 ${step.status} 迁移到 ${input.status}（${isManager ? "Steward/Lead" : `owner ${actorRoleId}`}）。`,
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
          const evidenceResult = validateFlowEvidence(parsedCandidate.flow, ledger.entries);
          if (!evidenceResult.ok) {
            const issues = evidenceResult.issues.filter((issue) => issue.stepId === step.id);
            if (issues.length > 0) {
              return {
                ok: false,
                code: "insufficient-evidence",
                revision,
                flow: flowView,
                error: issues.map((issue) => issue.message).join("；"),
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
        if (existingNew !== undefined) {
          const idempotent =
            oldStep.status === "superseded" &&
            oldStep.supersededBy === input.newStepId &&
            existingNew.status === "pending" &&
            existingNew.kind === input.kind &&
            existingNew.title === input.title.trim() &&
            existingNew.owner === input.owner.trim() &&
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
 * **应用专用**：客户已接受验收（账本 `customer.decision{decisionKind:"acceptance",
 * customerDecision:"accepted"}`）后，把 flow YAML 的保留验收步骤置为
 * `status:"done"` + `evidence:{kind:"acceptance",ref:"acceptance"}`。
 *
 * - **不注册为角色工具**（不进入 AdapterCapabilities / 三 flow 工具）；桌面在 acceptance check /
 *   verifier settle 检测到 accepted 时直接调用。
 * - **不写客户决定账本、不伪造客户批准**：只读账本确认已接受，只写 YAML。
 * - 幂等：验收步骤已是 `done` ⇒ `{ok:true,idempotent:true,revision,flow}`，不写盘。
 * - 账本坏行 ⇒ `ledger-unavailable`；无 accepted 决定（含 rejected）⇒ `acceptance-not-accepted`；
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
    const accepted = ledger.entries.some(
      (entry) =>
        entry.kind === "customer.decision" &&
        entry.flowId === flowId &&
        entry.decisionKind === "acceptance" &&
        entry.customerDecision === "accepted",
    );
    if (!accepted) {
      return {
        ok: false,
        code: "acceptance-not-accepted",
        revision: read.revision,
        flow: view,
        error: "该流程尚无客户验收接受决定（decisionKind=acceptance，customerDecision=accepted）；未完成验收步骤。",
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

/** 步骤 owner → 账本 power：内置治理角色按 function；其他（项目角色/未知）记 `project`。 */
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
      const ref = step.evidence?.ref;
      if (typeof ref !== "string" || ref.trim() === "") continue;
      const rel = observeRelPath(projectRoot, ref);
      if (rel === undefined) {
        skipped.push({ path: ref, reason: "path-invalid" });
        continue;
      }
      const abs = path.join(projectRoot, ...rel.split("/"));
      let info;
      try {
        info = await lstat(abs);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        skipped.push({ path: rel, reason: code === "ENOENT" ? "missing" : "read-failed" });
        continue;
      }
      if (!info.isFile() || info.isSymbolicLink()) {
        skipped.push({ path: rel, reason: "missing" });
        continue;
      }
      if (info.size > OBSERVE_ARTIFACT_MAX_BYTES) {
        skipped.push({ path: rel, reason: "too-large" });
        continue;
      }
      let data: Buffer;
      try {
        data = await readFile(abs);
      } catch {
        skipped.push({ path: rel, reason: "read-failed" });
        continue;
      }
      if (looksBinaryObserve(data, rel)) {
        skipped.push({ path: rel, reason: "binary" });
        continue;
      }
      const sha = sha256(data);
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

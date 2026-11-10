// app/desktop/workflow.ts
// T3「两条固定工作流路径」B1（2026-11-10，桌面窗口）：桌面侧 workflow 模式/路由**薄层 + 常量**。
//
// 依据：实现级方案 v1.3 §3.2（会话层路由改法）/§4.1（per-flow 模式、不缓存项目级单值）/
// §9.4（模式切换）、§3.6（run-role 注入 `workflowModeForFlow`）；B1 验收 AC-12/AC-23、T-05。
//
// 纪律：
//  · **单一实现 = 编排**：模式判定只读委托 `src/common/编排/workflow-service.ts::workflowMode`
//    （本层不复制 per-flow 规则/账本读取/状态机业务）；每次调用现场解析，**不缓存项目级单值**
//    （混合项目 legacy 在飞 flow 与新 fixed flow 并存）。
//  · 失败方向 = fail-closed **legacy**（配置不可解析/回调异常 ⇒ 不猜 fixed；与 run-role 同口径）。
//  · 本模块不授予任何写权/派发权：fixed 路由的硬授权仍在 `workflow-dispatch.ts` 谓词与
//    `app/desktop/session.ts::routeFixedPathDispatch`；本层只提供模式选择与注入形态。
//  · legacy 注入集合/顺序由 `session.ts` 原样保留；本模块的常量只供 fixed 过滤消费。

import { promises as fs } from "node:fs";
import path from "node:path";

import type { DispatchTaskPayload } from "../../src/model/runtime.ts";
import { readTaskState } from "../../src/common/编排/task-state.ts";
import { FIXED_DISPATCH_MATRIX } from "../../src/common/编排/workflow-dispatch.ts";
import { readWorkflowLedger } from "../../src/common/编排/workflow-service.ts";
import {
  prepareFixedPathStart,
  workflowMode as orchestrationWorkflowMode,
  type WorkflowMode,
} from "../../src/common/编排/workflow-service.ts";

export type { WorkflowMode };

/** fixed 矩阵模式 token（单一来源 = 编排 `workflow-dispatch.ts`；本层只再导出，不复制字面量语义）。 */
export const DESKTOP_FIXED_DISPATCH_MATRIX = FIXED_DISPATCH_MATRIX;

/**
 * fixed 会话**不注入**的 legacy 治理型 direct 能力（v1.3 §3.6/§6.5；AC-23 冻结清单）：
 * Git 治理三段式、run 择时、stable 写入许可、refactor/版本变更/VCA 决策。
 * 保留注入（按角色允许）：`close_created_task`/`complete_team_plan`/`activate_role_documents`/
 * `request_choice`/`request_confirmation`/`submit_report`/`doc_format`/`governance_matrix` 等。
 * 本常量只表达「legacy-only」；fixed 侧不新增 `request_release_merge`（G-IR 拒绝新增）。
 */
export const LEGACY_ONLY_DIRECT_CAPABILITIES: readonly string[] = Object.freeze([
  "git_query",
  "git_candidate",
  "git_publish",
  "select_run_change",
  "request_stable_write",
  "submit_refactor",
  "submit_version_change",
  "request_version_decision",
]);

export function isLegacyOnlyDirectCapability(toolName: string): boolean {
  return LEGACY_ONLY_DIRECT_CAPABILITIES.includes(toolName);
}

/**
 * 按 flow 解析工作流模式（桌面入口；**不缓存**）。
 * - 空 flowId ⇒ `legacy`（与编排 `workflowMode` 的旧行为入口一致：无 flow 的旧调用不走 fixed）；
 * - 委托编排 `workflowMode`（project.json 默认/强制 + 在飞 legacy run/trunk 判定）；
 * - 任意异常 ⇒ `legacy`（fail-closed；绝不把不确定当 fixed）。
 */
export async function resolveWorkflowMode(projectRoot: string, flowId: string): Promise<WorkflowMode> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return "legacy";
  try {
    return await orchestrationWorkflowMode(projectRoot, flow);
  } catch {
    return "legacy";
  }
}

/**
 * `openRoleSession` 的 `workflowModeForFlow` 注入形态：run-role 在**每次卡/任务/写门禁**按实际
 * flowId 调用本回调解析（不缓存项目级单值；v1.3 §3.6）。经 B1 启用闸（见 `resolveFixedPathMode`）。
 */
export function workflowModeForFlowResolver(
  projectRoot: string,
): (flowId: string) => Promise<WorkflowMode> {
  return (flowId: string) => resolveFixedPathMode(projectRoot, flowId);
}

/**
 * **B1 启用闸（legacy 兼容）**：fixed 路由/注入只在该项目**显式** `workflowSchema:"two-fixed-paths/v1"`，
 * 或该 flow 已有 fixed workflow（`workflow.started`）时启用；其余（缺省/`legacy/v1`/配置不可解析）
 * ⇒ 不启用（走 legacy）。依据：v1.3 §4.1 第 4 条——首次 fixed workflow 启动时由应用原子写
 * `workflowSchema`（B3）；在此之前旧项目/旧夹具一律 legacy（AC-03「legacy 断言不改」；fixed 角色卡/
 * 工具面属 B2，提前按 fixed 解析会把既有 `decision` 等卡 fail-closed）。纯读、不授权任何写权。
 */
export async function isFixedPathEnabledForFlow(projectRoot: string, flowId: string): Promise<boolean> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return false;
  const schema = await readProjectWorkflowSchemaValue(projectRoot);
  if (schema === "two-fixed-paths/v1") return true;
  if (schema === "legacy/v1") return false;
  if (schema === "invalid") return false;
  try {
    const ledger = await readWorkflowLedger(projectRoot);
    return ledger.events.some((event) => event.flowId === flow && event.kind === "workflow.started");
  } catch {
    return false;
  }
}

type ProjectWorkflowSchemaValue = "two-fixed-paths/v1" | "legacy/v1" | "invalid" | undefined;

/** `.ans/project.json` 的 `workflowSchema`（只读；缺省/坏配置不猜 fixed）。 */
async function readProjectWorkflowSchemaValue(projectRoot: string): Promise<ProjectWorkflowSchemaValue> {
  let text: string;
  try {
    text = await fs.readFile(path.join(projectRoot, ".ans", "project.json"), "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? undefined : "invalid";
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid";
  const value = (parsed as Record<string, unknown>)["workflowSchema"];
  if (value === undefined) return undefined;
  return value === "two-fixed-paths/v1" || value === "legacy/v1" ? value : "invalid";
}

/**
 * 桌面路由/注入实际使用的模式：**B1 启用闸 + 编排 `workflowMode`**（不缓存；空 flow/闸未启用/异常
 * ⇒ `legacy`，不猜 fixed）。启用后仍以编排 `workflowMode` 为准（legacy 在飞 flow 继续 legacy）。
 */
export async function resolveFixedPathMode(projectRoot: string, flowId: string): Promise<WorkflowMode> {
  if (!(await isFixedPathEnabledForFlow(projectRoot, flowId))) return "legacy";
  return resolveWorkflowMode(projectRoot, flowId);
}

/**
 * 会话级模式（工具注入面用）：与 run-role 的会话级判定同口径——
 * 输入任务（`taskId`）的 `created.flowId` ⇒ 该 flow 的模式；无任务/无 flow ⇒ `legacy`。
 * run-role 仍会独立解析同一模式（本函数不替代其判定；桌面侧按同一事实做注入过滤的纵深防御）。
 */
export async function sessionWorkflowModeForTask(
  projectRoot: string,
  taskId: string | undefined,
): Promise<WorkflowMode> {
  const id = typeof taskId === "string" ? taskId.trim() : "";
  if (id === "") return "legacy";
  try {
    const state = await readTaskState(projectRoot);
    const flowId = state.records.get(id)?.created?.flowId;
    return flowId === undefined ? "legacy" : await resolveFixedPathMode(projectRoot, flowId);
  } catch {
    return "legacy";
  }
}

/** 被派任务的 flowId（trim；缺省空串——空 flow 的旧调用逐字走 legacy，不经 fixed 路由）。 */
export function dispatchFlowIdOf(payload: DispatchTaskPayload | undefined): string {
  const raw = payload !== undefined && typeof payload.flowId === "string" ? payload.flowId : "";
  return raw.trim();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// T3 B3（2026-11-10，桌面窗口）：首次 fixed 启动顺序 / fixed 面板模式 / merge-main 应用通道薄层
//
// 依据：v1.3 §4.1 第 4 条（首次 fixed workflow 启动时应用原子写 `workflowSchema`）、§6.4/§8.4
// （merge-main 应用自有非判断卡、客户本人）、§6.5/§7.4（fixed 模式 VCA/trunk/stable 面板隐藏/只读）；
// B3 验收 AC-12/AC-14/AC-22/AC-23、T-05/T-10。
// 纪律：本层只排序/投影/构造请求文本；模式判定与写回仍委托编排（单一实现），不复制业务。
// ══════════════════════════════════════════════════════════════════════════════════════════════

export type FixedPathStartOutcome =
  | { ok: true; mode: WorkflowMode; configChanged: boolean; explicitLegacy: boolean }
  | { ok: false; code: "project-config-write-failed"; message: string };

/**
 * **首次 fixed 派发前的启动顺序**（B1 启用闸的鸡生蛋解法；v1.3 §4.1 第 4 条）：
 * 1. 委托编排 `prepareFixedPathStart` 原子写 `.ans/project.json workflowSchema:"two-fixed-paths/v1"`
 *    （保留既有键；已显式 `"legacy/v1"` **不覆盖**；坏文件 ⇒ `project-config-write-failed` fail-closed）；
 * 2. 以启用闸 + 编排 `workflowMode` 复核该 flow 的实际模式（legacy 在飞 flow 仍 legacy）。
 *
 * 仅在 chief 首次发起 fixed 工作流（首个 stage-request 携带 `workflowPath`）时调用；其余派发路径不写配置。
 * 不授予任何写权/派发权。
 */
export async function ensureFixedPathStarted(projectRoot: string, flowId: string): Promise<FixedPathStartOutcome> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return { ok: true, mode: "legacy", configChanged: false, explicitLegacy: false };
  let started: { ok: boolean; code?: string; message?: string; config?: { changed: boolean; skipped?: "explicit-legacy" }; workflowMode?: WorkflowMode };
  try {
    started = await prepareFixedPathStart({ projectRoot, flowId: flow });
  } catch (error) {
    return { ok: false, code: "project-config-write-failed", message: error instanceof Error ? error.message : String(error) };
  }
  if (!started.ok) {
    return { ok: false, code: "project-config-write-failed", message: started.message ?? "首次 fixed 启动写回 `.ans/project.json` 失败。" };
  }
  const configChanged = started.config?.changed === true;
  const explicitLegacy = started.config?.skipped === "explicit-legacy";
  const mode = (await isFixedPathEnabledForFlow(projectRoot, flow)) ? await resolveFixedPathMode(projectRoot, flow) : "legacy";
  return { ok: true, mode, configChanged, explicitLegacy };
}

/**
 * 该 flow 的活动 fixed workflowId（最新 `workflow.started` 且未 `workflow.closed`）。
 * 供固定卡 `request.created/resolved` 的 `workflowId/stage` 戳（应用写入，不采信模型自报）。
 */
export async function activeFixedWorkflowIdFor(projectRoot: string, flowId: string): Promise<string | undefined> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return undefined;
  try {
    const ledger = await readWorkflowLedger(projectRoot);
    const byWorkflow = new Map<string, { startedAt: string; closed: boolean; matchesFlow: boolean }>();
    for (const event of ledger.events) {
      const current = byWorkflow.get(event.workflowId);
      if (event.kind === "workflow.started") {
        byWorkflow.set(event.workflowId, {
          startedAt: event.at,
          closed: current?.closed === true,
          matchesFlow: event.flowId === flow,
        });
      } else if (event.kind === "workflow.closed" && current !== undefined && current.matchesFlow) {
        current.closed = true;
      }
    }
    const active = [...byWorkflow.entries()]
      .filter(([, value]) => value.matchesFlow && !value.closed)
      .sort((a, b) => (a[1].startedAt < b[1].startedAt ? 1 : -1));
    return active[0]?.[0];
  } catch {
    return undefined;
  }
}

/**
 * 项目级面板模式（VCA/trunk/stable 面板的显示面）：
 * - 显式 `two-fixed-paths/v1` ⇒ `fixed`（面板**隐藏/只读**：mutation IPC 拒绝、只读列表保留）；
 * - 显式 `legacy/v1` 或配置不可解析 ⇒ `legacy`（legacy 面板逐字不变）；
 * - 缺省 ⇒ 有任一固定 workflow 账本事件 ⇒ `fixed`，否则 `legacy`（旧项目/旧夹具零变化）。
 */
export async function resolveProjectFixedPanelMode(projectRoot: string): Promise<WorkflowMode> {
  const schema = await readProjectWorkflowSchemaValue(projectRoot);
  if (schema === "two-fixed-paths/v1") return "fixed";
  if (schema === "legacy/v1" || schema === "invalid") return "legacy";
  try {
    const ledger = await readWorkflowLedger(projectRoot);
    return ledger.events.some((event) => event.kind === "workflow.started") ? "fixed" : "legacy";
  } catch {
    return "legacy";
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// T3 B3.1（2026-11-10，桌面窗口）：fixed 发布自动呈卡触发窗口（merge-main）
//
// 依据：v1.3 §4.2 A12/A13、§4.3 B4、§6.4/§8.4；B1 AC-11/AC-14/AC-22；G-IR MF-IR-8。
// 纪律：触发只认**两个收口阶段**（A12b accepted / 路径 B B3 accepted）；是否真正可发布仍由编排
// `prepareReleaseMerge` 判定（前置缺失 ⇒ `release-workflow-not-ready`，不弹注定失败卡）。本层只表达
// 触发窗口，不复制发布前置/状态机业务、不授予任何确认/执行权。
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** fixed 路径「阶段 accepted ⇒ 应用自动呈 merge-main 卡」的触发阶段（A12b → A13 前；B3 → B4 前）。 */
export const FIXED_RELEASE_TRIGGER_STAGES = Object.freeze(["A12b", "B3"] as const);
export type FixedReleaseTriggerStage = (typeof FIXED_RELEASE_TRIGGER_STAGES)[number];

/** 该阶段收口（accepted 且阶段完成）是否触发发布自动呈卡；其他阶段一律不触发。 */
export function isFixedReleaseTriggerStage(stage: string | undefined): stage is FixedReleaseTriggerStage {
  return stage === "A12b" || stage === "B3";
}

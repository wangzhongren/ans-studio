// 编排主属：项目角色回交给主入口的真实结果与统一输入文案。
// 2026-10-13：detail.turnId 关联正式报告与事件；终局 outcome 压过成功声明；
// 未交报告明确 unreported/blocked，证据只取可定位的成功文件，不以 settled 推导完成。
// 回交只搬任务与证据，不转移角色身份或写权限；su 不向自己回交。
// SessionEvent.kind 仍由 Pi 的冻结契约维护，handback 仅为编排附加事件。

import type { RuntimeKind, ReportHandbackPayload, SessionEvent, DispatchTaskPayload, RuntimeReportDraftV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimePersistenceErrorCode } from "../../model/runtime.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { createHash } from "node:crypto";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";

/** 角色完成一次任务后的结构化回交（设计 §10.8）。 */
export interface TaskHandback {
  /** 产出该回交的角色 id。 */
  roleId: string;
  /** 关联任务 id（可选：无任务的 chat 会话不填）。 */
  taskId?: string;
  /** 正式报告结论或真实未报告/失败/中止状态；settled 不代表任务 completed。 */
  status: "completed" | "blocked" | "unreported" | "failed" | "aborted";
  /** 任务结果或明确的未完成原因，不能以“会话结束”当结论。 */
  summary: string;
  /** 证据（产物路径 / 变更 / 测试结论）——**只搬证据，不搬身份与写权**。 */
  evidence: string[];
  /** 产出时间（ISO 8601）。**仅供展示**——不参与去重键（X-2：含时间戳的键判重不稳）。 */
  at: string;
  /** 收口顺序号，供缺少运行时metadata的旧替身使用；真实轮次去重优先turnId。 */
  round?: number;
  /** 运行时提供的真实轮次标识，跨会话重开也不混淆。 */
  turnId?: string;
  runtime?: RuntimeKind;
  origin?: RuntimeReportDraftV1["origin"];
}

/**
 * **模型交的报告**（C-1，设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §C-1）：
 * 项目角色经 `submit_report` 工具主动交出的结论——`summary` 是模型自己写的「改了什么」，
 * `evidence` 是产物路径 / 变更 / 测试结论。**交给编排后即成为 `TaskHandback` 的内容**
 * （`summary`/`evidence`/`status` 取报告值）；未调用则明确未报告。
 *
 * 形状与工具契约 `submit_report{ status, summary, evidence? }` 一致（契约家在 Pi适配器
 * `src/model/runtime.ts`；此处按**结构**一致对齐——编排不导入其内部实现，见 §6）。
 */
export type TaskReport = ReportHandbackPayload;

/** 编排层回交事件（在会话 settle 时由编排发出）。 */
export interface HandbackEvent {
  kind: "handback";
  /** 供既有「只读 summary」的消费方直接呈现的一句话。 */
  summary: string;
  handback: TaskHandback;
  /** Internal raw handback above is for model delivery only; expose these safe values to UI. */
  report?: RuntimeReportSnapshotV1;
  liveReport?: RuntimeLiveReportViewV1;
  reportPersistence?: {
    state: "saved" | "failed" | "disabled" | "unknown-live" | "expired";
    reportId?: string;
    code?: RuntimePersistenceErrorCode;
    retryAvailable: boolean;
  };
}

/** 编排层事件：既有会话事件 + 编排追加的回交事件。 */
export type OrchestrationEvent = SessionEvent | HandbackEvent;

/** 构造回交的上下文（来自会话入口）。 */
export interface HandbackContext {
  roleId: string;
  taskId?: string;
  /** 失败/阻塞覆盖值；没有正式报告不能强制 completed。 */
  status?: TaskHandback["status"];
  /** 可注入时钟（测试）；缺省 `new Date()`。 */
  now?: () => Date;
}

/** Per-prompt intent, bound to a real turn by the Pipeline send entry. */
export interface HandbackIntent {
  required: boolean;
  taskId?: string;
}

/** 写类成功事件的路径事实；兼容旧替身，绝不把工具计数当成果。 */
const WRITE_TOOL_NAMES = ["write_file", "edit_file", "write", "edit"] as const;
function detailOf(ev: SessionEvent): Record<string, unknown> {
  return ev.detail !== null && typeof ev.detail === "object" ? ev.detail as Record<string, unknown> : {};
}
export function eventTurnId(ev: SessionEvent): string | undefined {
  const id = ev.turnId ?? detailOf(ev).turnId;
  return typeof id === "string" && id !== "" ? id : undefined;
}
function writeEvidence(ev: SessionEvent): string | undefined {
  if (ev.kind !== "accepted") return undefined;
  const detail = detailOf(ev);
  // A result is authoritative: a hidden/partial target must never fall back to raw aliases.
  if (Object.prototype.hasOwnProperty.call(detail, "display")) {
    const display = detail.display as { version?: unknown; target?: { kind?: unknown; value?: { text?: unknown; redacted?: unknown; truncated?: unknown } } } | undefined;
    const tool = detail.toolName;
    if (detail.phase !== "result" || detail.ok !== true || detail.status === "failed" || detail.status === "error"
      || typeof tool !== "string" || !(WRITE_TOOL_NAMES as readonly string[]).includes(tool)
      || display?.version !== 1 || display.target?.kind !== "path") return undefined;
    const value = display.target.value;
    if (typeof value?.text !== "string" || value.text.trim() === "" || value.redacted !== false || value.truncated !== false) return undefined;
    if (tool === "edit" || tool === "edit_file") return `已编辑：${value.text}`;
    return `已写入：${value.text}`;
  }
  if (detail.phase === "start" || detail.phase === "blocked") return undefined;
  if (detail.ok === false || detail.status === "failed" || detail.status === "error") return undefined;
  const call = detail.call as { name?: unknown; args?: { path?: unknown } } | undefined;
  const tool = typeof detail.toolName === "string" ? detail.toolName : call?.name;
  let file = typeof detail.path === "string" ? detail.path : call?.args?.path;
  if (typeof tool === "string" && !(WRITE_TOOL_NAMES as readonly string[]).includes(tool)) return undefined;
  // 旧假运行时与演示运行时的成功摘要含路径；泛化“执行完成”没有路径事实，故不录入。
  let match: RegExpMatchArray | null = null;
  // Only the old unphased summary contract can supply a legacy path.
  if (detail.phase === undefined) {
    match = ev.summary.match(/^(write_file|edit_file) 已获准（写入）：(.+)$/)
      ?? ev.summary.match(/^(写入被允许)：(.+?)(?:（命中.*)?$/);
  }
  if (typeof file !== "string" || file.trim() === "") file = match?.[2];
  if (typeof file !== "string" || file.trim() === "") return undefined;
  if (tool === undefined && match === null) return undefined;
  const edit = tool === "edit" || tool === "edit_file" || match?.[1] === "edit_file";
  return `${edit ? "已编辑" : "已写入"}：${file}`;
}

/** 无正式报告只返回未报告/阻塞与可定位产物，不推导任务成功。 */
export function buildTaskHandback(events: SessionEvent[], ctx: HandbackContext): TaskHandback {
  const evidence = [...new Set(events.map(writeEvidence).filter((e): e is string => e !== undefined))];
  const denied = events.find((e) => e.kind === "denied");
  const status = ctx.status !== undefined && ctx.status !== "completed"
    ? ctx.status : evidence.length === 0 && denied ? "blocked" : "unreported";
  const summary = "本轮未提交正式任务报告，尚不能确认任务完成。"
    + (denied ? `有步骤被拒绝：${denied.summary}` : "")
    + (evidence.length === 0 ? "本轮没有可定位的产物证据。" : "以下仅为实际写入的文件，尚未验收。");
  const handback: TaskHandback = {
    roleId: ctx.roleId, status, summary, evidence,
    at: (ctx.now ?? (() => new Date()))().toISOString(),
  };
  if (ctx.taskId !== undefined && ctx.taskId !== "") handback.taskId = ctx.taskId;
  return handback;
}

/**
 * 校验模型交来的报告（`submit_report` 的载荷经注入能力到达编排）。形状不符（status 非法 / summary 空 /
 * 字段类型错）→ 返回 `undefined`（忽略非法报告，未有合法报告时明确未报告）。
 * 形状**恰好** `{ status, summary, evidence? }`：多余字段忽略；`evidence` 非字符串数组时按缺失处理。
 */
export function normalizeTaskReport(input: unknown): TaskReport | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const rec = input as Record<string, unknown>;
  const status = rec["status"];
  const summary = rec["summary"];
  if (status !== "completed" && status !== "blocked") return undefined;
  if (typeof summary !== "string" || summary.trim() === "") return undefined;
  const report: TaskReport = { status, summary };
  const evidence = rec["evidence"];
  if (Array.isArray(evidence) && evidence.every((e) => typeof e === "string")) {
    report.evidence = evidence as string[];
  }
  return report;
}

/**
 * 由**模型交的报告**构造 `TaskHandback`（C-1）：`status`/`summary`/`evidence` 取报告值
 * （`evidence` 缺省为 `[]`——报告是权威值，不再混入推导）；`roleId`/`taskId`/`at` 取编排上下文。
 */
export function buildReportHandback(report: TaskReport, ctx: HandbackContext): TaskHandback {
  const handback: TaskHandback = {
    roleId: ctx.roleId,
    status: report.status,
    summary: report.summary,
    evidence: report.evidence ?? [],
    at: (ctx.now ?? (() => new Date()))().toISOString(),
  };
  if (ctx.taskId !== undefined && ctx.taskId !== "") handback.taskId = ctx.taskId;
  return handback;
}

/** 把 `TaskHandback` 包成编排层事件。 */
export function handbackEvent(handback: TaskHandback): HandbackEvent {
  return { kind: "handback", summary: `回交 su：${handback.summary}`, handback };
}

/**
 * **投递给 su 验收的文案——单一来源（E-1，设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §E-1）**。
 * 回交到达后，前端把这段文本作为**一条输入**投进 su 的会话（客户裁定：全自动，不做开关）；su 的回复
 * 自然落在其会话流里。两前端（桌面/将来其它）**共用本函数，不得各写一份**。
 *
 * 措辞约束（守 SKILL.md 交接语义）：**明确请求验收**（确认通过 / 要求返工 / 上报客户）、字段逐条呈现、
 * **不夹带任何权限语义**（回交只搬「任务与证据」，不搬身份或写权——su 不因收到回交获得角色的写权）。
 */
export function renderHandbackPrompt(hb: TaskHandback): string {
  return renderHandbackBatchPrompt([hb]);
}

/** 已收到报告的统一验收输入；合批不意味着未知角色已收齐。 */
export function renderHandbackBatchPrompt(handbacks: readonly TaskHandback[]): string {
  const lines: string[] = handbacks.length === 1 ? [] : [`[回交] 已收到${handbacks.length}份角色结果，请核对后向客户汇总。`];
  for (const hb of handbacks) {
    const task = hb.taskId ? `（任务 ${hb.taskId}）` : "（任务关联未知）";
    lines.push(`[回交] 来自 ${hb.roleId} 的报告${task}`, `结论：${hb.status}`, `摘要：${hb.summary}`);
    lines.push("证据：");
    if (hb.evidence.length > 0) for (const e of hb.evidence) lines.push(`  - ${e}`);
    else lines.push("  - 无可验收证据；需要原角色补充，不能推定通过。");
  }
  lines.push(
    "请验收已收到的报告，并向客户给出统一结果：实际完成了什么、产物路径、实际测试结果、哪些未完成或待补报告/返工，以及下一步。",
    "只有证据支持才确认通过；未报告、失败或中止不得当作完成。不要把会话结束或工具执行次数当成果。",
    "没有明确任务关联或收齐条件时，只汇总手头结果，不宣称全部角色或整个任务已完成。",
    "已授权范围内的常规后续操作继续处理，不重复请求同一授权；确有越界或必要客户决策时说明具体原因。",
  );
  return lines.join("\n");
}

/**
 * 去重键单一来源：角色、任务、turnId（旧替身降级round）与内容哈希，不含时间戳。
 * 同轮重放同键；同文返工的新turnId异键；桌面负责登记和排队，不自行拼at。
 */
export function handbackKey(hb: TaskHandback): string {
  const contentHash = createHash("sha256")
    .update(`${hb.status}\u0000${hb.summary}\u0000${hb.evidence.join("\u0000")}`)
    .digest("hex")
    .slice(0, 16);
  return `${hb.roleId}\u0000${hb.taskId ?? ""}\u0000${hb.turnId ?? hb.round ?? ""}\u0000${contentHash}`;
}

// —————————————— H-1：su 派发任务（dispatch_task）的编排侧共用件 ——————————————

/**
 * **投递给目标角色会话的派发文案——单一来源（H-1，设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §H-1）**。
 * 前端把 su 的 `dispatch_task` 路由成目标角色会话的一条输入时，用本函数生成文本（两前端共用，**不各写一份**）。
 *
 * 措辞约束（守 SKILL.md 交接语义）：**不得夹带任何授权语义**——**派发 ≠ 授权**，目标角色的写权仍只来自
 * 它自己的 Section 1 与 `request_confirmation` 的 `confirmed:true`；派发只把「任务与上下文」送过去。
 * `task` 原文**逐字保留**（契约要求任务文本自足：做什么 / 依据哪份文档 / 完成标准）。
 * `roleId` 用于路由与校验，**不进入文案**（这是投递进**目标角色自己**的会话，自指冗余）。
 */
export function renderDispatchPrompt(req: DispatchTaskPayload): string {
  const reason = req.reason !== undefined && req.reason !== "" ? `（原因：${req.reason}）` : "";
  return [`[派发] 来自 su 的任务${reason}`, req.task, "完成后请交回报告（改了什么/结论/证据）。"].join("\n");
}

/**
 * **roleId 是否可派发**（H-1「非本项目角色 / 指向 su 自身 → 如实回错」的**判定口径单一来源**，
 * 供两前端的路由实现复用；返回 false ⇒ 路由方应以 `{ok:false}` 回执如实转达给 su）。
 * 判据 = 登记在**本项目角色表**里（`project.roles`）：su 等内置角色不进 roles 映射 ⇒ 「指向 su 自身」
 * 自动为 false；未登记 / 空串 → false（fail-closed）。
 *
 * ⚠ **快照注意**：`project` 是**会话开启时**的配置快照——su 在本会话里**新建**的角色不在其中。
 * 校验的**权威在持有实时角色清单的前端**（桌面可重新枚举）：新建角色后如需派发，前端应以实时清单
 * 重建 project（或等价的实时判定）再调本函数；不要只凭旧快照误拒。
 */
export function isDispatchableRoleId(project: ProjectConfig, roleId: string): boolean {
  if (typeof roleId !== "string" || roleId.trim() === "") return false;
  return project.roles !== undefined && project.roles[roleId] !== undefined;
}

/**
 * **派发受理回执的文案——单一来源（L-1，设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §L-1）**：
 * `dispatch_task` 的路由实现（前端投递机）在**受理时**用它生成回执 `message`（工具如实转达 su）。
 *
 * 两种形态（**受理 ≠ 完成**必须在场——目标收到/失败会另在两边聊天流如实显示）：
 * · **目标忙（已入队）**：`queuePosition` 给出 ⇒「已受理：目标忙，已入队（第 N 位）；受理 ≠ 完成。」
 *   ——**位置口径**：入队后该条目在本角色队列中的序号（1 起；FIFO 按到达序；由队列持有方计算）。
 * · **未入队（空闲/正在投递）**：「已受理：任务将投递给角色 … 的会话（其会话未开——将自动开启）；…（受理≠已完成）。」
 *
 * 队列**归属前端**（L-1 结论；桌面投递机已实现按到达序的单队列）——本函数只统一**文案**，不持有任何队列；
 * 校验失败/去重等其它回执分支仍归路由实现如实填写。
 */
export function formatDispatchReceipt(opts: {
  /** 目标角色 id（文案用）。 */
  targetRoleId: string;
  /** 目标会话当前是否已开（空闲分支的「未开——将自动开启」如实提示）。 */
  sessionOpen: boolean;
  /** 目标忙、已入队时给出——入队后在本角色队列中的位置（1 起，按到达序）。 */
  queuePosition?: number;
}): string {
  if (opts.queuePosition !== undefined) {
    return `已受理：目标忙，已入队（第 ${opts.queuePosition} 位）；受理 ≠ 完成。`;
  }
  return (
    `已受理：任务将投递给角色 ${opts.targetRoleId} 的会话` +
    (opts.sessionOpen ? "" : "（其会话未开——将自动开启）") +
    `；投递结果/失败会在其聊天流与 su 的聊天流如实显示（受理≠已完成）。`
  );
}

/**
 * 真实适配器按 detail.turnId 分轮，终局先发 handback 再透传 settled。
 * 报告取同轮且完成后消费；同轮重复终局只透传，不再回交。
 * 无 metadata 的旧替身沿已知 settle 突发兼容，但每次收口也清空证据。
 */
export async function* withHandback(
  source: AsyncIterable<SessionEvent>,
  ctx: HandbackContext,
  opts: {
    report?: (turnId?: string) => TaskReport | undefined;
    completed?: (turnId?: string) => void;
    /** Missing real-turn intent is chat; absent resolver preserves direct helper compatibility. */
    intent?: (turnId?: string) => HandbackIntent | undefined;
    projectRoot?: string;
  } = {},
): AsyncIterable<OrchestrationEvent> {
  const log = createDiagnosticLogger({ component: "orchestration.handback", roleId: ctx.roleId, projectRoot: opts.projectRoot });
  const seen = new Map<string, SessionEvent[]>();
  const finished = new Set<string>();
  const legacyKey = "";
  let legacyNewRound = true;
  let round = 0;
  try {
    for await (const ev of source) {
      const turnId = eventTurnId(ev);
      const key = turnId ?? legacyKey;
      if (ev.kind === "settled") {
        const duplicate = turnId !== undefined ? finished.has(turnId) : !legacyNewRound;
        if (!duplicate) {
          if (turnId !== undefined) finished.add(turnId);
          else legacyNewRound = false;
          round += 1;
          const events = [...(seen.get(key) ?? []), ev];
          seen.delete(key);
          const report = normalizeTaskReport(opts.report?.(turnId));
          let intent: HandbackIntent | undefined;
          if (opts.intent === undefined) intent = { required: true, taskId: ctx.taskId };
          else intent = opts.intent(turnId);
          if (report === undefined && intent?.required !== true) {
            opts.completed?.(turnId);
            log.record("handback.chat.skipped", { turnId });
            yield ev;
            continue;
          }
          const turnContext = { ...ctx, taskId: intent?.taskId };
          let handback: TaskHandback;
          if (report !== undefined) handback = buildReportHandback(report, turnContext);
          else handback = buildTaskHandback(events, turnContext);
          const detail = detailOf(ev);
          const outcome = detail.outcome;
          if (outcome === "failed" || outcome === "timed_out" || outcome === "aborted") {
            handback.status = outcome === "aborted" ? "aborted" : "failed";
            const why = outcome === "timed_out" ? "本轮执行超时" : outcome === "aborted" ? "本轮已中止" : "本轮执行失败";
            const reason = typeof detail.errorCode === "string" ? `（${detail.errorCode}）` : "";
            handback.summary = `${why}${reason}，尚不能确认任务完成。`
              + (report !== undefined ? `中断前报告：${report.summary}` : handback.summary);
          }
          handback.round = round;
          if (report !== undefined) handback.origin = "submitted-report";
          else handback.origin = "terminal-fallback";
          if (turnId !== undefined) handback.turnId = turnId;
          if (ev.runtime !== undefined) handback.runtime = ev.runtime;
          opts.completed?.(turnId);
          log.record("handback.generated", { turnId, outcome, state: handback.status, reportSource: report === undefined ? "unreported" : "submit_report", count: handback.evidence.length });
          yield handbackEvent(handback);
        } else log.record("handback.duplicate", { turnId });
        yield ev;
        continue;
      }
      // 已终局轮次的迟到事件仅透传，不能作为下一轮证据。
      if (turnId === undefined || !finished.has(turnId)) {
        const events = seen.get(key) ?? [];
        events.push(ev);
        seen.set(key, events);
        if (turnId === undefined) legacyNewRound = true;
      }
      yield ev;
    }
  } finally {
    seen.clear();
    finished.clear();
  }
}

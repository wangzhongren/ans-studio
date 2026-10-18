// 编排主属：项目角色回交给主入口的真实结果与统一输入文案。
// 2026-10-13：detail.turnId 关联正式报告与事件；终局 outcome 压过成功声明；
// 未交报告明确 unreported/blocked，证据只取可定位的成功文件，不以 settled 推导完成。
// 回交只搬任务与证据，不转移角色身份或写权限；su 不向自己回交。
// SessionEvent.kind 仍由 Pi 的冻结契约维护，handback 仅为编排附加事件。

import type { RuntimeKind, ReportHandbackPayload, SessionEvent, DispatchTaskPayload, RuntimeReportDraftV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimePersistenceErrorCode } from "../../model/runtime.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { createHash } from "node:crypto";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
// G-1 提取规则复用既有保守路径提取（同角色私有 `common/编排/` 内；单一实现，不另写正则）。
import { extractPathCandidates } from "./confirmed-writes.ts";

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

// —————————————— G-1：派发「必读（按序）」引用块（契约与工作流；设计 2026-10-16 §四；A1） ——————————————
//
// 背景（设计 §四）：跨角色冻结契约与项目工作流落盘为 `docs/contracts/<name>-v<N>.md` 与 `docs/workflow.md`
// 后，派发文本只**按地址引用**（路径 + sha256），不内嵌全文。**哈希只能由代码算**——su 与项目角色都
// 「不会算 hash」（`finalize.ts:2-3` 先例）；投递侧（桌面投递机，复用其带缓存的 `filePrint`）在**投递时**
// 逐个算哈希后交本模块的**判据**（`planDispatchDelivery`）与**渲染**（`renderDispatchPrompt`）。
// 本模块是「必读块」的**单一来源**：提取（哪些路径算必读）、判据（缺失怎么处理）、渲染（怎么呈现）都在此；
// 前端只做接线（探测文件、按判据拒投/入队），**不得各写一份**。

/** 稳定文件名（设计 §五：项目级 `docs/workflow.md`，不按版本堆文件）。 */
const WORKFLOW_REL = "docs/workflow.md";
/** 契约目录前缀（设计 §三.1：`docs/contracts/<name>-v<N>.md`，版本号进文件名）。 */
const CONTRACTS_PREFIX = "docs/contracts/";

/**
 * 「必读（按序）」引用（G-1 设计 §四.1）：路径 + **由代码在投递时算出**的 sha256。
 * 本模块**不算哈希、不触盘**——`sha256` 由投递侧代码对文件**当刻字节**计算后传入（探针值）。
 */
export interface DispatchReadRef {
  /** 项目相对路径（posix），形如 `docs/workflow.md` / `docs/contracts/<name>-v<N>.md`。 */
  path: string;
  /** 文件**当刻字节**的 sha256（64 位小写 hex；投递侧代码计算）。 */
  sha256: string;
}

/** 投递判据结论（G-1 §四.3 fail-closed 单一来源）。 */
export type DispatchDeliveryPlan =
  | {
      /** **拒投**：不产生任何可投递文本（目标角色会话不见此任务），回执如实给 su（§四.3）。 */
      action: "reject";
      /** 工具回执 message（`dispatch_task` 如实转达 su）。 */
      message: string;
      /** 聊天系统行（su 流内如实显示；沿用桌面 `fail()` 的 message/systemRow 两段式）。 */
      systemRow: string;
    }
  | {
      /** 放行：投递给目标角色的**定格文本**（必读块已由 `renderDispatchPrompt` 注入）。 */
      action: "deliver";
      text: string;
    };

/** sha256 直读形状（64 位小写 hex）。非法/缺失探测值一律按「文件不存在」处理——fail-closed 不注入可疑哈希。 */
function isSha256Hex(v: string | undefined): v is string {
  return typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
}

/**
 * 从 su 任务文本提取「必读」引用路径——**固定规则**（设计 §四.2），纯函数：
 * · 只认 `docs/workflow.md`（稳定文件名）与 `docs/contracts/` 前缀的 `.md` 文件（token 剥离复用
 *   既有保守提取 `extractPathCandidates`——反引号/markdown/中文标点等分隔与去重同源）；
 * · 其余路径（产物路径 `temp/…`、`src/…` 等）**不注入、不校验**（§四.3 第 3 条——避免把「将要创建的
 *   输出」误判为必读输入）；
 * · 保序去重：`docs/workflow.md` 置首（§五.3 阅读序：1) 本文件 2) 契约），契约按**首现序**。
 * 提取本身**未经存在性校验**——存在性与哈希由投递侧逐个探测后交 `planDispatchDelivery` 判据。
 */
export function extractDispatchReadPaths(task: string): string[] {
  const contracts: string[] = [];
  let workflow: string | undefined;
  for (const candidate of extractPathCandidates(task)) {
    if (candidate === WORKFLOW_REL) {
      workflow = candidate; // extractPathCandidates 已按首现位去重——同 token 只到一次
      continue;
    }
    if (candidate.startsWith(CONTRACTS_PREFIX) && candidate.endsWith(".md")
      && candidate.length > CONTRACTS_PREFIX.length + ".md".length) {
      contracts.push(candidate); // 同上：上游已去重
    }
  }
  return workflow !== undefined ? [workflow, ...contracts] : contracts;
}

/**
 * 投递判据（G-1 §四.2/§四.3）——**fail-closed 单一来源**，纯函数：
 * · 任务引用了 `docs/contracts/…` 但文件不存在（探测值缺失/非法）→ **拒投** + 如实回执
 *   （§四.3；多个缺失报**首现序第一个**；**不回退为「无块投递」**）；
 * · 任务引用了 `docs/workflow.md` 但文件不存在 → **降级**：块内如实标注「（本项目未提供 workflow.md）」、
 *   省略该行，**不拒投**（V1 过渡期老项目向后兼容，§四.3 第 2 条）；
 * · 未引用的路径不参与判据（提取阶段已排除——产物路径不校验）。
 * `probes` 由**投递侧代码**在投递时对 `extractDispatchReadPaths(task)` 的每个路径逐个探测
 * （桌面 `filePrint`——`<missing>` 等非法值天然按缺失处理，无需投递侧再映射）。
 * 放行结论的 `text` 由 `renderDispatchPrompt` 生成（**同一单一来源**，本函数不另写渲染）。
 */
export function planDispatchDelivery(
  req: DispatchTaskPayload,
  probes: ReadonlyMap<string, string | undefined>,
  opts?: DispatchPromptOptions,
): DispatchDeliveryPlan {
  const references: DispatchReadRef[] = [];
  let workflowMissing = false;
  let missingContract: string | undefined;
  for (const path of extractDispatchReadPaths(req.task)) {
    const probe = probes.get(path);
    if (isSha256Hex(probe)) {
      references.push({ path, sha256: probe });
      continue;
    }
    if (path === WORKFLOW_REL) workflowMissing = true;
    else missingContract ??= path; // 首个缺失契约（首现序；拒投优先于降级）
  }
  if (missingContract !== undefined) {
    return {
      action: "reject",
      message: `派发未受理：引用的契约 ${missingContract} 不存在——未投递。`,
      systemRow: `派发未受理：引用的契约 ${missingContract} 不存在——**未投递**（不静默；su 修正后重派）。`,
    };
  }
  return { action: "deliver", text: renderDispatchPrompt(req, { ...opts, references, workflowMissing }) };
}

/** `renderDispatchPrompt` 的 G-1 选项（可选——缺省 = 旧格式逐字不变）。 */
export interface DispatchPromptOptions {
  /**
   * 派发主人角色 id（2026-10-18 客户反馈：三权下派实际主人是 Convener，界面却写死「来自 su」）。
   * 缺省 `su`——single/su 路径逐字保持旧文案。
   */
  sourceRoleId?: string;
  /** 已由代码算好哈希的必读引用（调用方保证已过 `planDispatchDelivery` 判据）；**按给定序**编号渲染。 */
  references?: readonly DispatchReadRef[];
  /**
   * 任务引用了 `docs/workflow.md` 但文件缺失的**降级**标注（§四.3 第 2 条）。
   * 仅当 `references` 里**没有** `docs/workflow.md` 时生效（引用为准——矛盾输入以探测后的事实渲染）。
   */
  workflowMissing?: boolean;
}

/**
 * **投递给目标角色会话的派发文案——单一来源（H-1，设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §H-1）**。
 * 前端把 su 的 `dispatch_task` 路由成目标角色会话的一条输入时，用本函数生成文本（两前端共用，**不各写一份**）。
 *
 * **G-1 扩展（设计 `2026-10-16_design_contract-workflow-dispatch.md` §四；A1）**：
 * 任务文本引用了契约/工作流时，`opts.references` 给**已由代码在投递时算好哈希**的必读引用（判据见
 * `planDispatchDelivery`），本函数按其**给定序**渲染「必读（按序）」块；**无引用时逐字保持旧格式**
 * （多数派发未引用契约/工作流——旧三行不变；文本是去重键之外的事实，去重键不受影响）。哈希**不在此计算**
 * （su 与项目角色都不会算 hash——`finalize.ts` 先例；本函数是纯渲染，不触盘）。
 *
 * 措辞约束（守 SKILL.md 交接语义）：**不得夹带任何授权语义**——**派发 ≠ 授权**，目标角色的写权仍只来自
 * 它自己的 Section 1 与 `request_confirmation` 的 `confirmed:true`；派发只把「任务与上下文」送过去。
 * `task` 原文**逐字保留**（契约要求任务文本自足：做什么 / 依据哪份文档 / 完成标准）。
 * `roleId` 用于路由与校验，**不进入文案**（这是投递进**目标角色自己**的会话，自指冗余）。
 */
export function renderDispatchPrompt(req: DispatchTaskPayload, opts?: DispatchPromptOptions): string {
  const reason = req.reason !== undefined && req.reason !== "" ? `（原因：${req.reason}）` : "";
  const sourceRoleId = opts?.sourceRoleId ?? "su";
  const references = opts?.references ?? [];
  // 引用为准：同路径既在 references 又有缺失标注（矛盾输入）→ 以探测后的事实渲染，抑制标注。
  const workflowMissing = opts?.workflowMissing === true && !references.some((r) => r.path === WORKFLOW_REL);
  if (references.length === 0 && !workflowMissing) {
    // 无必读引用：旧格式**逐字不变**（设计 §四.1 的引用块是「加」出来的，不是重排版式的理由）。
    return [`[派发] 来自 ${sourceRoleId} 的任务${reason}`, req.task, "完成后请交回报告（改了什么/结论/证据）。"].join("\n");
  }
  const lines = [`[派发] 来自 ${sourceRoleId} 的任务${reason}`];
  lines.push("必读（按序，先读完再动手；哈希由系统在投递时计算，与文件当刻字节绑定）：");
  if (workflowMissing) lines.push("  （本项目未提供 workflow.md）"); // 如实标注（§四.3 第 2 条，措辞照设计原文）
  references.forEach((ref, i) => lines.push(`  ${i + 1}. ${ref.path}（sha256:${ref.sha256}）`));
  lines.push(`任务：${req.task}`);
  lines.push(references.some((r) => r.path === WORKFLOW_REL)
    ? "完成后请交回报告（改了什么 / 结论 / 证据；完成口令见 workflow.md 第 2 节）。"
    : "完成后请交回报告（改了什么/结论/证据）。");
  return lines.join("\n");
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
          // **F-3-d（2026-10-16 客户批准）**：截断事实随终态回交对 su **直读可见**——仅给
          // **terminal-fallback** 摘要附注（未交报告、正式报告缺失正是截断的后果）；模型自己交的
          // submitted-report 摘要是权威值，不代改。事实来源 = 适配器 settle detail 的
          // `truncation:"length"`（F-3-b 外推；**追加字段**、旧适配器无此字段则无注记——忽略安全）。
          if (report === undefined && detail.truncation === "length") {
            handback.summary += "（截断：stopReason=length）";
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

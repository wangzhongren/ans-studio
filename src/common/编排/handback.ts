// src/common/编排/handback.ts
// `TaskHandback`（角色完成回交 su）——事件类型 + 「settle → handback 事件」的编排。
//
// 设计 §10.8（客户原话「其他的角色完成了要返回给 su」）：角色会话**完成一个任务**时，产出一份
// **结构化回交**，交回 su（治理会话），由 su 汇总向客户汇报：
//   `{ roleId, taskId?, status: "completed" | "blocked", summary, evidence: string[], at }`
//
// —— 与 SKILL.md 一致（务必守住的语义）——
// 跨角色**转移的是「任务与证据」，不是「身份或写权」**（SKILL.md 的交接语义）。故回交**只搬证据**
// （产物路径 / 变更 / 测试结论），角色**不因回交获得 su 的权限**，su **也不因此获得角色的写权**。
// 本模块只**携带数据**，不做任何权限提升。
//
// —— V1 范围（§10.8）——
// V1 = **事件 + 界面呈现**：角色会话 **settle** → 编排发一个 `handback` 事件；卡片渲染与镜像进 su
// 归**桌面应用（T17）**。**自动的多角色派发-回收**（su 派给多个角色、逐一收回、汇总）= 依赖二期
// S1（派发执行），**本轮不做**——本模块**不含派发引擎**，只在既有会话事件流上挂一条回交事件。
//
// —— C-1（2026-10-12）：交报告优先 ——
// 客户裁定「新增交报告工具」：项目角色经 `submit_report` 交出的报告（`TaskReport`，形状见下）**即回交
// 事件内容**（`summary`/`evidence`/`status` 取报告值；工具与注入能力 `reportHandback` 在 Pi适配器侧
// 「注入才注册」，只有回交主体——非 su 的项目角色——才被 `run-role.ts` 注入）；**未交 / 形状非法则回退
// 既有推导**（`buildTaskHandback`），不硬失败。回退推导同时**修正一个既有噪音缺陷**：证据只取**写类**
// 被接受事件，不再把 `read_file 执行完成` 之类的读事件混入（见 `isWriteAccepted`）。
//
// —— 落点与形状约束 ——
// `SessionEvent` 是契约 §4 冻结类型（定义在 Pi适配器 `src/provider/pi/session.ts`），其 `kind` 联合
// **不可在本角色扩**。故回交事件是本角色定义的**编排层事件** `HandbackEvent`，与 `SessionEvent` 组成
// `OrchestrationEvent` 联合——由编排的会话入口（`openRoleSession`）在 `settled` 时追加，**不另立第二份
// 会话事件类型**。

import type { SessionEvent, DispatchTaskPayload } from "../../provider/pi/session.ts";
import type { ProjectConfig } from "../../model/role.ts";
import { createHash } from "node:crypto";

/** 角色完成一次任务后的结构化回交（设计 §10.8）。 */
export interface TaskHandback {
  /** 产出该回交的角色 id。 */
  roleId: string;
  /** 关联任务 id（可选：无任务的 chat 会话不填）。 */
  taskId?: string;
  /** 结论：completed = 正常完成；blocked = 被拦下（无任何写入被接受、且有拒绝）。 */
  status: "completed" | "blocked";
  /** 一句话结论（缺省取 settled 事件的摘要）。 */
  summary: string;
  /** 证据（产物路径 / 变更 / 测试结论）——**只搬证据，不搬身份与写权**。 */
  evidence: string[];
  /** 产出时间（ISO 8601）。**仅供展示**——不参与去重键（X-2：含时间戳的键判重不稳）。 */
  at: string;
  /**
   * **会话内轮次序号**（1 起；由 `withHandback` 按「settle 突发」计数后写入）——供 `handbackKey` 的
   * **稳定去重键**区分两类貌合神离的情况：**同轮重放/重复 settled**（同 `round` ⇒ 恒等键 ⇒ 判重）与
   * **新轮真返工**（`round` 递增 ⇒ 键不同 ⇒ 照常各自投递，即便文本逐字相同）。**不含任何时间信息**；
   * 不进入投递文案（`renderHandbackPrompt` 不呈现）。
   */
  round?: number;
}

/**
 * **模型交的报告**（C-1，设计 `2026-10-12_design_governed-interaction-and-chat-ux.md` §C-1）：
 * 项目角色经 `submit_report` 工具主动交出的结论——`summary` 是模型自己写的「改了什么」，
 * `evidence` 是产物路径 / 变更 / 测试结论。**交给编排后即成为 `TaskHandback` 的内容**
 * （`summary`/`evidence`/`status` 取报告值）；未调用则回退既有推导。
 *
 * 形状与工具契约 `submit_report{ status, summary, evidence? }` 一致（契约家在 Pi适配器
 * `src/provider/pi/session.ts`；此处按**结构**一致对齐——编排不导入其内部实现，见 §6）。
 */
export interface TaskReport {
  status: "completed" | "blocked";
  summary: string;
  evidence?: string[];
}

/** 编排层回交事件（在会话 settle 时由编排发出）。 */
export interface HandbackEvent {
  kind: "handback";
  /** 供既有「只读 summary」的消费方直接呈现的一句话。 */
  summary: string;
  handback: TaskHandback;
}

/** 编排层事件：既有会话事件 + 编排追加的回交事件。 */
export type OrchestrationEvent = SessionEvent | HandbackEvent;

/** 构造回交的上下文（来自会话入口）。 */
export interface HandbackContext {
  roleId: string;
  taskId?: string;
  /** 覆盖结论；缺省按事件流推断（无写入被接受且有拒绝 → blocked，否则 completed）。 */
  status?: "completed" | "blocked";
  /** 可注入时钟（测试）；缺省 `new Date()`。 */
  now?: () => Date;
}

/** 写类工具名（受治理的落盘工具；证据过滤与回交推导同口径）。 */
const WRITE_TOOL_NAMES = ["write_file", "edit_file"] as const;

/**
 * 该 `accepted` 事件是否**写类**（用于证据过滤——设计 C-1：不再把 `read_file` 之类的读事件混进证据）。
 *
 * 事件形状在仓内按适配器不同而不同，本判据兼容三处实际发射点（均为既有事实，逐处核对）：
 *   · 假运行时适配器（`provider/pi/session.ts`）：`detail = { call, result }` → 取 `call.name` 判名单；
 *   · 真实 Pi 适配器（`common/pi-adapter/real-adapter.ts`）：`summary = \`${toolName} 执行完成\``、无 call 明细
 *     → 摘要以写类工具名开头即写类；
 *   · 装配演示假 runtime（`common/装配/demo-runtime.ts`）：`summary` 以「写入被允许」开头（detail = WriteDecision）。
 * 三者都不像的 `accepted`（如 `read_file 执行完成`）→ **不算证据**（防噪音）。
 */
function isWriteAccepted(ev: SessionEvent): boolean {
  const call = (ev.detail as { call?: { name?: unknown } } | undefined)?.call;
  if (call !== undefined && typeof call.name === "string") {
    return (WRITE_TOOL_NAMES as readonly string[]).includes(call.name);
  }
  const s = ev.summary;
  if (s.startsWith("写入被允许")) return true;
  return WRITE_TOOL_NAMES.some((n) => s.startsWith(`${n} `));
}

/**
 * 从一轮会话事件构造 `TaskHandback`（**未交报告时的回退推导**）。
 *
 * 结论推断（V1 确定性规则，可被 `ctx.status` 覆盖）：会话读了 `settled` 说明正常收口；若整轮
 * 一次**写类**写入都没被接受（`accepted` 里无写类）**却有拒绝**（有 `denied`）→ 判 `blocked`（角色被拦下、
 * 什么都没落地）；否则 `completed`。
 *
 * 证据 = **写类** `accepted` 事件的摘要（实际被接受落地的文件）——**不含读事件**
 * （`read_file 执行完成` 之类，设计 C-1 修正的既有噪音缺陷），也不含被拒记录（那属审计、非回交证据）。
 */
export function buildTaskHandback(events: SessionEvent[], ctx: HandbackContext): TaskHandback {
  const acceptedWrites = events.filter((e) => e.kind === "accepted" && isWriteAccepted(e));
  const denied = events.some((e) => e.kind === "denied");
  const settled = events.find((e) => e.kind === "settled");

  const status: "completed" | "blocked" =
    ctx.status ?? (acceptedWrites.length === 0 && denied ? "blocked" : "completed");
  const summary =
    settled !== undefined && settled.summary.trim() !== ""
      ? settled.summary
      : `角色 ${ctx.roleId} 完成${ctx.taskId ? `（任务 ${ctx.taskId}）` : ""}`;

  const handback: TaskHandback = {
    roleId: ctx.roleId,
    status,
    summary,
    evidence: acceptedWrites.map((e) => e.summary),
    at: (ctx.now ?? (() => new Date()))().toISOString(),
  };
  if (ctx.taskId !== undefined && ctx.taskId !== "") handback.taskId = ctx.taskId;
  return handback;
}

/**
 * 校验模型交来的报告（`submit_report` 的载荷经注入能力到达编排）。形状不符（status 非法 / summary 空 /
 * 字段类型错）→ 返回 `undefined`（**回退既有推导**，不硬失败、不报错——防御模型输出）。
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
  const lines: string[] = [];
  const task = hb.taskId !== undefined && hb.taskId !== "" ? `（任务 ${hb.taskId}）` : "";
  lines.push(`[回交] 来自 ${hb.roleId} 的报告${task}`);
  lines.push(`结论：${hb.status}`);
  lines.push(`摘要：${hb.summary}`);
  if (hb.evidence.length > 0) {
    lines.push("证据：");
    for (const e of hb.evidence) lines.push(`  - ${e}`);
  } else {
    lines.push("证据：（无）");
  }
  lines.push("请验收：确认通过 / 要求返工 / 上报客户。");
  return lines.join("\n");
}

/**
 * **回交去重键——稳定键（X-2 硬化）**（设计 §E-1「一条回交只投递一次，避免重放刷屏」的构造单一来源）。
 * 投递侧（桌面）以其登记「已投递」集合；本函数只算键，不做登记（登记与排队是前端职责）。
 *
 * **键形状**：`<roleId>\0<taskId或空>\0<round或空>\0<内容哈希16位>`——**不含 `at`**（旧键含毫秒时间戳，
 * 同一轮的两份回交因毫秒差判重失效，真机即由此把 7 份逐字相同的投递送进 su）。内容哈希 =
 * SHA-256(status \0 summary \0 evidence[{i}]…) 前 16 位（仅作次级判据；`round` 已足以区分轮次）。
 *
 * **两类判定的分工（给桌面/后续维护者）**：
 * · **同轮重放 / 重复 settled**（同一批事件被重复消费、或同轮多份回交）⇒ `round` 与内容都相同
 *   ⇒ **同键** ⇒ 判重（不重复投递）。
 * · **新轮真返工**（后一轮产出**逐字相同**的文本）⇒ `round` 递增 ⇒ **键不同** ⇒ **照常各自投递**。
 * ⚠ 用键方**不得**自行拼入时间戳或改用 `at`——那会把上面两类判定一起打回原状。
 */
export function handbackKey(hb: TaskHandback): string {
  const contentHash = createHash("sha256")
    .update(`${hb.status}\u0000${hb.summary}\u0000${hb.evidence.join("\u0000")}`)
    .digest("hex")
    .slice(0, 16);
  return `${hb.roleId}\u0000${hb.taskId ?? ""}\u0000${hb.round ?? ""}\u0000${contentHash}`;
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
 * 在会话事件流上挂回交：**透传** `SessionEvent`；当读到 `settled` 时，**先发** `handback` 事件、
 * **再透传** `settled`。
 *
 * 为何先发 handback 再发 settled：既有消费方（runRole / govern / 桌面）以 `settled` 为**终止信号**，
 * 见之即停。若把 handback 排在 settled 之后，这些消费方永远收不到它。排在 settled 之前，语义仍是
 * 「会话即将收口时的回交」，且终止逻辑不受影响。
 *
 * **报告优先（C-1）**：`opts.report` 给出且已收到模型交的报告（`submit_report` 经注入能力送达）⇒
 * 回交内容**取报告值**（`buildReportHandback`）；未交 / 形状非法 ⇒ **回退既有推导**
 * （`buildTaskHandback`），不硬失败、不报错。
 *
 * **每轮至多一份回交（X-2 硬化；真机依据：适配器每轮曾发两次 `settled` ⇒ 每轮两份逐字相同的回交）**：
 * 轮次以**「settle 突发」**为界——一次会话轮结束时 `settled` 可能连发多份；**只认突发里的第一份**
 * 发回交（其余仅**透传**）。若两份 `settled` 之间来了新事件（正常的新一轮，或真返工），视为**新一轮**、
 * 照常再发一份。判定用「自上次回交以来是否出现过新事件」的置位实现（不需要轮次标识符——事件流本身
 * 即界碑）；每份回交带 `round`（递增轮次序号），供 `handbackKey` 做**稳定去重**。
 * **既有语义不变**：先回交再透传 `settled`；无 `settled` 不发回交。
 * 残留（如实登记）：若「两次 `settled` 之间夹着别的**事件**」而实为同轮（根因在适配器侧、其同刻在修），
 * 本防护不会合并——会按新一轮各发一份（`round` 不同 ⇒ 键不同 ⇒ 投递侧也不判重）。
 *
 * 流自然结束（无 `settled`）→ **不发** handback（回交绑定「会话 settle/完成」，非「流关闭」）。
 */
export async function* withHandback(
  source: AsyncIterable<SessionEvent>,
  ctx: HandbackContext,
  opts: { report?: () => TaskReport | undefined } = {},
): AsyncIterable<OrchestrationEvent> {
  const seen: SessionEvent[] = [];
  let round = 0; // 已发回交的轮次数（1 起）
  // 自上次回交以来是否出现过新事件（或尚未发过回交）——决定本轮 settle 突发是否该发回交。
  let newRound = true;
  for await (const ev of source) {
    if (ev.kind === "settled") {
      if (newRound) {
        newRound = false;
        round += 1;
        const report = opts.report?.();
        const handback =
          report !== undefined ? buildReportHandback(report, ctx) : buildTaskHandback([...seen, ev], ctx);
        handback.round = round;
        yield handbackEvent(handback);
      }
      yield ev; // 重复 settled：仅透传（次序「回交在前、settled 在后」不受影响）
      continue;
    }
    seen.push(ev);
    newRound = true;
    yield ev;
  }
}

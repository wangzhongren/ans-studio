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
// —— 落点与形状约束 ——
// `SessionEvent` 是契约 §4 冻结类型（定义在 Pi适配器 `src/provider/pi/session.ts`），其 `kind` 联合
// **不可在本角色扩**。故回交事件是本角色定义的**编排层事件** `HandbackEvent`，与 `SessionEvent` 组成
// `OrchestrationEvent` 联合——由编排的会话入口（`openRoleSession`）在 `settled` 时追加，**不另立第二份
// 会话事件类型**。

import type { SessionEvent } from "../../provider/pi/session.ts";

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
  /** 产出时间（ISO 8601）。 */
  at: string;
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

/**
 * 从一轮会话事件构造 `TaskHandback`。
 *
 * 结论推断（V1 确定性规则，可被 `ctx.status` 覆盖）：会话读了 `settled` 说明正常收口；若整轮
 * **一次写入都没被接受**（无 `accepted`）**却有拒绝**（有 `denied`）→ 判 `blocked`（角色被拦下、
 * 什么都没落地）；否则 `completed`。
 *
 * 证据 = 各条 `accepted` 事件的摘要（**实际被接受落地的东西**）——这是「产物」层面的证据，
 * 不含被拒的记录（那属审计、非回交证据）。
 */
export function buildTaskHandback(events: SessionEvent[], ctx: HandbackContext): TaskHandback {
  const accepted = events.filter((e) => e.kind === "accepted");
  const denied = events.some((e) => e.kind === "denied");
  const settled = events.find((e) => e.kind === "settled");

  const status: "completed" | "blocked" = ctx.status ?? (accepted.length === 0 && denied ? "blocked" : "completed");
  const summary =
    settled !== undefined && settled.summary.trim() !== ""
      ? settled.summary
      : `角色 ${ctx.roleId} 完成${ctx.taskId ? `（任务 ${ctx.taskId}）` : ""}`;

  const handback: TaskHandback = {
    roleId: ctx.roleId,
    status,
    summary,
    evidence: accepted.map((e) => e.summary),
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
 * 在会话事件流上挂回交：**透传** `SessionEvent`；当读到 `settled` 时，**先发** `handback` 事件、
 * **再透传** `settled`。
 *
 * 为何先发 handback 再发 settled：既有消费方（runRole / govern / 桌面）以 `settled` 为**终止信号**，
 * 见之即停。若把 handback 排在 settled 之后，这些消费方永远收不到它。排在 settled 之前，语义仍是
 * 「会话即将收口时的回交」，且终止逻辑不受影响。
 *
 * 流自然结束（无 `settled`）→ **不发** handback（回交绑定「会话 settle/完成」，非「流关闭」）。
 */
export async function* withHandback(
  source: AsyncIterable<SessionEvent>,
  ctx: HandbackContext,
): AsyncIterable<OrchestrationEvent> {
  const seen: SessionEvent[] = [];
  for await (const ev of source) {
    if (ev.kind === "settled") {
      yield handbackEvent(buildTaskHandback([...seen, ev], ctx));
      yield ev;
      continue;
    }
    seen.push(ev);
    yield ev;
  }
}

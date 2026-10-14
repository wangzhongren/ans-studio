// app/desktop/request-anchor.ts
// 交互请求的**锚点键**（真机缺陷修复 2026-10-12：「已决交互卡切走再切回跑到聊天流最末尾」）。
//
// 用途：把「实时通道的请求」（customer-input.ts 收到的 `CustomerInputRequest`）与「会话文件回放」
// （session-history.ts 从 JSONL 解析出的 `toolCall` 块）两侧**推导出同一个键**，令渲染侧在卡的
// （重）物化时能把卡**锚定到它发生时的位置**（请求调用行与结论行之间——见 renderer.js 的锚点物化）。
//
// 为何不用 requestId 直接匹配（两个 id 命名空间不同，如实说明）：
//   · 渲染侧登记表里的 `requestId` 是**主进程客户通道的会话内编号**（customer-input.ts 的 `op-N`），
//     只活在本进程内存里，**不落会话文件**；
//   · 会话文件里记的是 **pi 的 toolCallId**（`call_00_…`，调用块与结果块各带一份）——回放行能带上它，
//     但它与 `op-N` 永远对不上（请求对象 `CustomerInputRequest` 为冻结形状，不含 toolCallId——
//     本角色边界外，不得扩）。
// 故两侧能**逐字对上**的只有请求本体：`kind`（request_confirmation→confirm / request_choice→choice，
// 映射取 §4 冻结契约家的工具名常量，不复制字面量）+ `title`（工具把 `args.title` **原样**交给客户通道，
// 回放解析的 `arguments.title` 即同一字符串）。键按这两项拼出，**确定性**、无启发式解析。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，**不依赖 electron**，可在 node 下单测。

// 工具名的**单一来源**（§4 冻结契约家所在层：provider/pi/tools.ts 的公开导出）——只读导入、不复制字面量。
import { REQUEST_CONFIRMATION_TOOL_NAME, REQUEST_CHOICE_TOOL_NAME } from "../../src/provider/pi/tools.ts";

/** 交互请求的锚点键（两侧唯一算法；title 逐字取用、不做归一化——不同即为不同请求）。 */
export function interactionAnchorKey(kind: "confirm" | "choice", title: string): string {
  return (kind === "choice" ? "choice" : "confirm") + "\u0000" + String(title == null ? "" : title);
}

/**
 * 从会话文件回放的一枚 `toolCall` 块（`{id, name, arguments}`）推导锚点键：
 *  · 非交互工具（name 不是 request_confirmation / request_choice）⇒ `null`（不着锚）；
 *  · 交互工具但 `arguments.title` 缺失/非字符串 ⇒ `null`（该调用本就成不了请求——工具层会拒——
 *    故没有对应卡片，不着锚）。
 */
export function anchorKeyForToolCall(name: unknown, args: unknown): string | null {
  const kind =
    name === REQUEST_CONFIRMATION_TOOL_NAME ? "confirm" : name === REQUEST_CHOICE_TOOL_NAME ? "choice" : null;
  if (kind === null) return null;
  const a = args !== null && typeof args === "object" ? (args as { title?: unknown }) : null;
  const title = a !== null && typeof a.title === "string" ? a.title : "";
  if (title === "") return null;
  return interactionAnchorKey(kind, title);
}

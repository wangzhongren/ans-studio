// 服务端工具族（web_search / web_fetch）的配置解析、wire 声明注入与原始流事件观测。
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
//
// 本文件**不 import 任何 Pi 包**，是纯函数模块（可离线单测）。实施依据：客户已批准
// （2026-10-16，「按推荐批准，开始实施」）的本角色提案
// `角色卡/Pi适配器/docs/fix/2026-10-16_proposal_server-side-tools.md`；批准口径要点：
//   · 默认关（`ANS_PI_SERVER_TOOLS` 未设置/空/`0|off|none` 即关）；未知 id ⇒ 构造期抛错；
//   · 首批工具集 = web_search + web_fetch（code_execution 缓、未列入注册表）；
//   · 搜索查询串**不进诊断落盘**（诊断只落工具名/计数/状态/错误码类别；查询与结果标题只进
//     聊天流/Replay——与工具结果同层）；
//   · 网关 4xx/不认声明 ⇒ 如实失败、不毁轮次（V1 路径 C：不自动剥离重试；剥离重试后置）。
//
// 两条通道（SDK 实证见提案 §一，均为已安装 dist 的只读核实）：
//   · 注入 = 扩展事件 `before_provider_request` 的 handler 里向 `payload.tools` 尾部**追加**
//     声明（幂等：已含同 `type` 的声明即跳过）。pi-ai 在 onPayload 之后不再做任何 tools 校验
//     （anthropic-messages.js:428-432 之后直接 `.create(params)`），声明原样上 wire。
//   · 观测 = 扩展事件 `provider_stream_event`（pi-ai 归一化**之前**的原始 SSE 事件；
//     anthropic-messages.js:446-447）。服务端工具块会被归一化层静默丢弃（:472-523 只认
//     text/thinking/redacted_thinking/tool_use），`usage.server_tool_use` 也不被读取
//     （:609-651）——本模块在原始窗口把它们接住：只在**本模块内**做状态机与白名单字段提取，
//     **不改**归一化层任何代码（其在 node_modules，本仓本就不动）。
//
// 白名单纪律（提案 §2.4）：observer 只取 title / url / error_code / count 这类白名单字段；
// 搜索结果的 `encrypted_content` 与页面文档正文**一律不读、不存**——observer 的取数代码里不出现
// 这些字段名（文本中提及仅为说明，见测试里的诱饵断言）。

/** 启用服务端工具的配置通道（本角色内闭环；沿 `ANS_PI_*` 环境变量先例）。 */
export const SERVER_TOOL_ENV = "ANS_PI_SERVER_TOOLS";

/** 注册表条目：本仓 id（配置用）→ wire 声明所需字段。 */
export interface ServerToolRegistryEntry {
  /** 配置 id（`ANS_PI_SERVER_TOOLS` 里写的名字）。 */
  id: string;
  /** wire 声明 type 串（以客户探针为准；集中一处）。 */
  type: string;
  /** 未显式给出 max_uses 时的缺省值；无该参数的工具为 undefined。 */
  defaultMaxUses?: number;
}

/**
 * 首批工具注册表（客户批准口径 ②：web_search + web_fetch；code_execution 缓）。
 *
 * `web_search_20250305` 的声明形状与客户 2026-10-16 探针逐字对齐：
 * `{"type":"web_search_20250305","name":"web_search","max_uses":1}` → 网关 HTTP 200、服务端真实执行。
 * `web_fetch_20250910` 的网关支持与块形状**未经探针确认**（登记为未验边界；由客户 live 探针覆盖）。
 *
 * code_execution（`code_execution_20250825`）**不列入**：其 type 串未经探针确认，且治理面最特殊
 * （服务端沙箱执行）。配置里写 `code_execution` 会走「未知 id ⇒ 抛错」并给出可用清单——一句话明确、不静默半开。
 */
export const SERVER_TOOL_REGISTRY: readonly ServerToolRegistryEntry[] = [
  { id: "web_search", type: "web_search_20250305", defaultMaxUses: 1 },
  { id: "web_fetch", type: "web_fetch_20250910", defaultMaxUses: 1 },
];

/** 一条服务端工具声明（= wire 形状；字段顺序与声明无关）。 */
export interface ServerToolDeclaration {
  type: string;
  name: string;
  max_uses?: number;
}

export interface ServerToolConfig {
  /** 启用清单；空数组 = 关（默认）。 */
  enabled: readonly ServerToolDeclaration[];
}

/**
 * 解析 `ANS_PI_SERVER_TOOLS`（格式 `id[:max_uses][,id2…]`，大小写/空白不敏感）。
 * - 未设置 / 空串 / 显式关闭值（`0`/`off`/`none`）⇒ 关（`{enabled: []}`）；
 * - 未知 id、非法 max_uses（须为正整数）、重复 id → **抛错**（一句话明确，不静默半开；
 *   与 `provider-config.ts`「缺 baseUrl 即抛 / 非法 contextWindow 即抛」同口径）。抛错发生在
 *   `bindRole` 构造期——任何网络请求之前。分隔产生的空 token（如尾随逗号）予以容忍。
 */
export function parseServerToolConfig(env: Record<string, string | undefined>): ServerToolConfig {
  const raw = env[SERVER_TOOL_ENV];
  const text = raw?.trim() ?? "";
  if (text === "") return { enabled: [] };
  const lowered = text.toLowerCase();
  if (lowered === "0" || lowered === "off" || lowered === "none") return { enabled: [] };
  const enabled: ServerToolDeclaration[] = [];
  const seen = new Set<string>();
  for (const piece of text.split(",")) {
    const token = piece.trim();
    if (token === "") continue; // 容忍尾随逗号/多余分隔（不产生半开状态）
    const colon = token.indexOf(":");
    const id = (colon === -1 ? token : token.slice(0, colon)).trim();
    const usesText = colon === -1 ? undefined : token.slice(colon + 1).trim();
    const entry = SERVER_TOOL_REGISTRY.find((item) => item.id === id);
    if (entry === undefined) {
      throw new Error(
        `未知的服务端工具 id：「${id}」（来自环境变量 ${SERVER_TOOL_ENV}）。` +
          `可用：${SERVER_TOOL_REGISTRY.map((item) => item.id).join("、")}（code_execution 未列入首批）；` +
          `格式：id[:max_uses]，逗号分隔。`,
      );
    }
    if (seen.has(id)) {
      throw new Error(`服务端工具 id 重复：「${id}」（${SERVER_TOOL_ENV}=${text}）——请去掉重复项。`);
    }
    let maxUses = entry.defaultMaxUses;
    if (usesText !== undefined) {
      const parsed = Number(usesText);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(
          `服务端工具的 max_uses 必须为正整数：「${token}」中的「${usesText}」不合法` +
            `（${SERVER_TOOL_ENV}=${text}）。`,
        );
      }
      maxUses = parsed;
    }
    seen.add(id);
    enabled.push({ type: entry.type, name: entry.id, ...(maxUses !== undefined ? { max_uses: maxUses } : {}) });
  }
  return { enabled };
}

/**
 * 启用行文案（bindRole 时一次：日志 + 聊天流各一条）。
 * 如实提示两点：按次计费（发生在服务端、不受本仓治理时点约束）；结果是**外部不可信内容**
 * （提案 §3.2 的口径——服务端工具把外部内容带进模型上下文，本仓治理面只覆盖写盘/命令）。
 */
export function renderServerToolEnableNotice(declarations: readonly ServerToolDeclaration[]): string {
  const list = declarations
    .map((declaration) =>
      declaration.max_uses === undefined ? declaration.name : `${declaration.name}（max_uses=${declaration.max_uses}，按次计费）`,
    )
    .join("、");
  return (
    `本会话已启用服务端工具：${list}。服务端工具在网关侧执行、按次计费；其返回的搜索/抓取内容来自外部、不可信。` +
    `如需关闭，请移除环境变量 ${SERVER_TOOL_ENV} 后重启会话。`
  );
}

export interface ServerToolAppendResult {
  /** 变换后的 payload（changed=false 时为原引用）。 */
  payload: unknown;
  /** 是否实际改动了 payload（false 时调用方应返回 undefined 以透传原 payload）。 */
  changed: boolean;
  /** 本次请求体（变换后）是否已含全部声明——降级判定用（幂等跳过也算「已含」）。 */
  present: boolean;
}

/**
 * 向 payload.tools **尾部**幂等追加服务端工具声明（before_provider_request handler 的纯核心）。
 * - `tools` 为 undefined → 创建；为数组 → 浅拷贝后追加；为其它类型/ payload 非对象 → 不动作（present=false，
 *   如实不半改）；声明已含同 `type`（例如缓存预热与真实请求共用 handler，或网关回放）→ 跳过。
 * - 返回**新对象**（不改入参），调用方返回它即完成声明注入。
 */
export function appendServerToolDeclarations(
  payload: unknown,
  declarations: readonly ServerToolDeclaration[],
): ServerToolAppendResult {
  if (declarations.length === 0) return { payload, changed: false, present: false };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { payload, changed: false, present: false };
  }
  const record = payload as Record<string, unknown>;
  const rawTools = record["tools"];
  if (rawTools !== undefined && !Array.isArray(rawTools)) return { payload, changed: false, present: false };
  const tools: unknown[] = rawTools === undefined ? [] : [...(rawTools as unknown[])];
  const presentTypes = new Set<string>();
  for (const tool of tools) {
    if (tool !== null && typeof tool === "object") {
      const type = (tool as Record<string, unknown>)["type"];
      if (typeof type === "string") presentTypes.add(type);
    }
  }
  let added = 0;
  for (const declaration of declarations) {
    if (presentTypes.has(declaration.type)) continue;
    tools.push({ ...declaration });
    added += 1;
  }
  if (added === 0) return { payload, changed: false, present: true };
  return { payload: { ...record, tools }, changed: true, present: true };
}

// —————————————————————— 原始事件观测（纯状态机） ——————————————————————

/**
 * 观测产物（「行事件命令 / usage 记账 / 退化标记」列表的逐条形状）。
 * 本模块**不发事件、不碰 Pi 类型、不碰诊断落盘**——由 real-adapter 的扩展层消费：
 * call-* → 工具行（projectToolEvent，形状与客户端工具行同权）；usage/degraded/paused/unknown →
 * 诊断（字段全部落在共享诊断白名单内：turnId/toolName/toolCallId/count/state/errorCode/reasonCode/ok）。
 */
export type ServerToolObservation =
  | { kind: "call-start"; toolName: string; toolCallId: string }
  | { kind: "call-result"; toolName: string; toolCallId: string; message: string }
  | { kind: "call-denied"; toolName: string; toolCallId: string; errorCode: string; message: string }
  | { kind: "usage"; toolName: string; count: number; state: "from-usage" | "from-blocks" }
  | { kind: "paused" }
  | { kind: "unknown-stop-reason"; reason: string };

export interface ServerToolObserver {
  /** 输入一条**原始** SSE 事件（已 JSON 解析的 `provider_stream_event.data`）；输出观测命令列表（可空）。 */
  observe(data: unknown): readonly ServerToolObservation[];
}

/** pause_turn 如实呈现行（聊天流；服务端长任务会被提前收尾，v1 不自动续跑——续跑留 v2）。 */
export const SERVER_TOOL_PAUSED_SUMMARY =
  "服务端工具执行被暂停（pause_turn）：本轮提前收尾，可继续发消息让模型接着做。";

/** 网关疑似拒绝声明（HTTP >= 400）时的降级行文案（V1 路径 C：如实告知、不自动剥离重试）。 */
export function renderServerToolDegradedSummary(status: number): string {
  return (
    `网关拒绝了包含服务端工具声明的请求（HTTP ${status}）——疑似声明不被网关接受。` +
    `本会话已停用服务端工具声明：后续轮次不再附带；本轮按原样收场，未自动重试（既有失败口径不变）。`
  );
}

/**
 * 从 SDK 错误消息**前缀**提取「确定性请求拒绝」的 HTTP 状态；取不到/非拒绝类 → undefined。
 *
 * 依据（已安装 dist 只读核实，实现轮修正提案 §4.2 的探测通道）：
 * - Anthropic SDK 在非 2xx 时**直接 throw**（client.js:583-614 `throw makeStatusError(...)`），
 *   即 `asResponse()` 会 reject——pi-ai 的 `onResponse` 只在 `retryProviderRequest` 成功（2xx）后回调，
 *   故扩展事件 `after_provider_response` **看不到 4xx/5xx**；状态只能在错误消息里取。
 * - 错误消息 = `${status} ${body}`（SDK core/error.js `APIError.makeMessage`）→ 取数字前缀即可，
 *   **不读响应体内容**（沿「SDK error messages may embed an API response；诊断只存错误类别」纪律，
 *   本函数结果只用于在内存里做降级判定，落盘仍只有状态数字）。
 * - 只认「拒绝类」状态：>= 400；排除 408（请求超时）与 429（限流）——它们与声明无关，
 *   降级会误伤（登记为口径引理）。
 */
export function requestRejectionStatus(errorMessage: string): number | undefined {
  const match = /^\s*(\d{3})\b/.exec(errorMessage);
  if (match === null) return undefined;
  const status = Number(match[1]);
  if (status < 400) return undefined;
  if (status === 408 || status === 429) return undefined;
  return status;
}

/** 结果行文本与错误行文本的行预算（字节数级的保守值；显示层另有 protectText 16384 B 硬预算）。 */
const RESULT_TEXT_LIMIT = 1024;
/** 结果行最多列出几条条目（超出部分以「共 N 条」示意——白名单字段，正文不进）。 */
const RESULT_ITEM_LIMIT = 5;

/** pi-ai mapStopReason 认识的全部 stop_reason（anthropic-messages.js:1286-1307）；其余值 pi-ai 会直接 throw。 */
const KNOWN_STOP_REASONS = new Set([
  "end_turn",
  "max_tokens",
  "tool_use",
  "refusal",
  "pause_turn",
  "stop_sequence",
  "sensitive",
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function capText(text: string, limit = RESULT_TEXT_LIMIT): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
function parseJsonLoose(text: string): unknown {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 结果块错误变体（如 `web_search_tool_result_error`）→ 归一化错误码；非错误变体 → undefined。 */
function extractResultError(content: unknown): string | undefined {
  const record = asRecord(content);
  if (record === undefined) return undefined;
  const type = asString(record["type"]);
  if (type === undefined || !type.endsWith("_error")) return undefined;
  const code = asString(record["error_code"]);
  return (code !== undefined && code.trim() !== "" ? code.trim() : "unknown_error").slice(0, 64).toUpperCase();
}

/** 从工具调用 input 提取可示意的调用描述（白名单字段：web_search.query / web_fetch.url）。 */
function describeCall(toolName: string, input: Record<string, unknown> | undefined): string | undefined {
  if (input === undefined) return undefined;
  if (toolName === "web_search") {
    const query = asString(input["query"]);
    if (query !== undefined && query.trim() !== "") return `查询「${query}」`;
  }
  if (toolName === "web_fetch") {
    const url = asString(input["url"]);
    if (url !== undefined && url.trim() !== "") return `抓取「${url}」`;
  }
  return undefined;
}

/** 成功结果行文本（只取 title/url/条数白名单字段；encrypted_content 与文档正文一律不读）。 */
function renderResultMessage(toolName: string, input: Record<string, unknown> | undefined, content: unknown): string {
  const prefix = describeCall(toolName, input) ?? toolName;
  if (Array.isArray(content)) {
    const parts = content
      .slice(0, RESULT_ITEM_LIMIT)
      .map((item) => {
        const record = asRecord(item) ?? {};
        const title = asString(record["title"]);
        const url = asString(record["url"]);
        return [title, url].filter((part): part is string => part !== undefined && part !== "").join(" — ");
      })
      .filter((part) => part !== "");
    const suffix =
      parts.length > 0
        ? `：${parts.join("；")}${content.length > RESULT_ITEM_LIMIT ? `；…（共 ${content.length} 条）` : ""}`
        : "";
    return capText(`${prefix} → ${content.length} 条结果${suffix}`);
  }
  const record = asRecord(content);
  if (record !== undefined) {
    const title = asString(record["title"]);
    const url = asString(record["url"]);
    if (url !== undefined || title !== undefined || record["content"] !== undefined) {
      // 详情只取 title（避免与 describeCall 已示出的 input.url 重复；url 在场即视为已识别形状）。
      const detail = title !== undefined && title !== "" ? `：${title}` : "";
      return capText(`${prefix} → 页面内容已返回${detail}`);
    }
    return capText(`${prefix} → 结果已返回（形状未识别：未提取内容）`);
  }
  return capText(`${prefix} → 结果已返回（内容未捕获）`);
}

/** 错误变体结果行文本（如 max_uses_exceeded——**非运行错误**，绝不映射为轮次失败）。 */
function renderDeniedMessage(toolName: string, errorCode: string): string {
  const subject = toolName === "web_search" ? "搜索" : toolName === "web_fetch" ? "抓取" : `${toolName} 调用`;
  if (errorCode === "MAX_USES_EXCEEDED") {
    return `${subject}次数已达上限（max_uses_exceeded）：本调用被网关拒绝，非运行错误；可继续交谈或调大 max_uses。`;
  }
  return capText(`${subject}被网关拒绝（${errorCode}）：非运行错误，可继续交谈。`);
}

/**
 * 构造原始事件观测器（**每次会话一个实例**；纯状态机、无 IO）。
 *
 * 性能口径（提案 §2.7）：对流内每个 SSE 事件都会调用；非识别类型立即返回空数组（O(1) 早退），
 * 识别类型只做同步累积/白名单字段提取，不做日志（诊断由消费方按命令聚合记录）。
 *
 * 状态：
 * - 按 content_block index 跟踪 server_tool_use（调用块）与 `*_tool_result`（结果块）
 *   （结果块「start 即完整」或 delta 增量两种形状都容忍——以客户探针定形，见提案 §4.5-2）；
 * - 每次响应（message_start…message_stop）重置计数；`usage.server_tool_use.<tool>_requests`
 *   若回传则记 `state:"from-usage"`，否则在 message_stop 以本地成功调用块计数兜底 `state:"from-blocks"`。
 */
export function createServerToolObserver(): ServerToolObserver {
  interface CallBlock {
    kind: "call";
    toolName: string;
    toolCallId: string;
    partialJson: string;
    input?: Record<string, unknown>;
  }
  interface ResultBlock {
    kind: "result";
    toolName: string;
    toolCallId: string;
    partialJson: string;
    content: unknown;
    finalized: boolean;
  }
  const blocks = new Map<number, CallBlock | ResultBlock>();
  const callInputs = new Map<string, Record<string, unknown> | undefined>();
  let perResponseCalls = new Map<string, number>();
  let reportedUsage = new Map<string, number>();
  let pausedNotified = false;

  const reset = (): void => {
    perResponseCalls = new Map();
    reportedUsage = new Map();
    pausedNotified = false;
  };

  const usageObservations = (entries: readonly { toolName: string; count: number }[]): ServerToolObservation[] => {
    const observations: ServerToolObservation[] = [];
    for (const entry of entries) {
      if (reportedUsage.get(entry.toolName) === entry.count) continue; // 同响应内去重（多 delta 重复回传）
      reportedUsage.set(entry.toolName, entry.count);
      observations.push({ kind: "usage", toolName: entry.toolName, count: entry.count, state: "from-usage" });
    }
    return observations;
  };

  /** 从 `usage` 容器（message_start.message.usage / message_delta.usage）提取 `server_tool_use.*_requests`。 */
  const usageEntries = (source: unknown): { toolName: string; count: number }[] => {
    const record = asRecord(source);
    const container = record === undefined ? undefined : asRecord(record["server_tool_use"]);
    if (container === undefined) return [];
    const entries: { toolName: string; count: number }[] = [];
    for (const [key, value] of Object.entries(container)) {
      if (!key.endsWith("_requests")) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      entries.push({ toolName: key.slice(0, -"_requests".length), count: value });
    }
    return entries;
  };

  const finalizeResult = (block: ResultBlock): ServerToolObservation[] => {
    block.finalized = true;
    let content = block.content;
    if (content === undefined && block.partialJson.trim() !== "") content = parseJsonLoose(block.partialJson);
    const input = callInputs.get(block.toolCallId);
    callInputs.delete(block.toolCallId);
    const errorCode = extractResultError(content);
    if (errorCode !== undefined) {
      return [
        {
          kind: "call-denied",
          toolName: block.toolName,
          toolCallId: block.toolCallId,
          errorCode,
          message: renderDeniedMessage(block.toolName, errorCode),
        },
      ];
    }
    return [
      {
        kind: "call-result",
        toolName: block.toolName,
        toolCallId: block.toolCallId,
        message: renderResultMessage(block.toolName, input, content),
      },
    ];
  };

  return {
    observe(data: unknown): readonly ServerToolObservation[] {
      const event = asRecord(data);
      if (event === undefined) return [];
      switch (asString(event["type"])) {
        case "message_start": {
          reset();
          return usageObservations(usageEntries(asRecord(event["message"])?.["usage"]));
        }
        case "content_block_start": {
          const index = event["index"];
          if (typeof index !== "number" || !Number.isInteger(index)) return [];
          const block = asRecord(event["content_block"]);
          if (block === undefined) return [];
          const type = asString(block["type"]) ?? "";
          if (type === "server_tool_use") {
            const toolName = asString(block["name"]) ?? "server_tool";
            const toolCallId = asString(block["id"]) ?? `server-tool-${String(index)}`;
            const input = asRecord(block["input"]);
            blocks.set(index, { kind: "call", toolName, toolCallId, partialJson: "", ...(input !== undefined ? { input } : {}) });
            return [{ kind: "call-start", toolName, toolCallId }];
          }
          if (type.endsWith("_tool_result")) {
            const toolName = type.slice(0, -"_tool_result".length);
            const toolCallId = asString(block["tool_use_id"]) ?? "";
            const entry: ResultBlock = {
              kind: "result",
              toolName,
              toolCallId,
              partialJson: "",
              content: block["content"],
              finalized: false,
            };
            blocks.set(index, entry);
            return entry.content !== undefined ? finalizeResult(entry) : [];
          }
          return [];
        }
        case "content_block_delta": {
          const index = event["index"];
          if (typeof index !== "number") return [];
          const entry = blocks.get(index);
          if (entry === undefined || (entry.kind === "result" && entry.finalized)) return [];
          const delta = asRecord(event["delta"]);
          if (delta === undefined) return [];
          const piece = asString(delta["partial_json"]) ?? asString(delta["text"]);
          if (piece !== undefined) entry.partialJson += piece;
          return [];
        }
        case "content_block_stop": {
          const index = event["index"];
          if (typeof index !== "number") return [];
          const entry = blocks.get(index);
          if (entry === undefined) return [];
          blocks.delete(index);
          if (entry.kind === "result") return entry.finalized ? [] : finalizeResult(entry);
          // 调用块完成：合并 input（start 内联优先；否则用累积 JSON 解析）并记一次成功调用（usage 兜底计数）。
          const parsed = asRecord(parseJsonLoose(entry.partialJson));
          const input = entry.input !== undefined && Object.keys(entry.input).length > 0 ? entry.input : parsed ?? entry.input;
          callInputs.set(entry.toolCallId, input);
          perResponseCalls.set(entry.toolName, (perResponseCalls.get(entry.toolName) ?? 0) + 1);
          return [];
        }
        case "message_delta": {
          const observations: ServerToolObservation[] = [];
          const delta = asRecord(event["delta"]);
          const stopReason = delta === undefined ? undefined : asString(delta["stop_reason"]);
          if (stopReason === "pause_turn") {
            if (!pausedNotified) {
              pausedNotified = true;
              observations.push({ kind: "paused" });
            }
          } else if (stopReason !== undefined && !KNOWN_STOP_REASONS.has(stopReason)) {
            // pi-ai 对本值会直接 throw（轮次既有 error 收尾；我们在 throw 之前的原始窗口如实记录）。
            observations.push({ kind: "unknown-stop-reason", reason: stopReason });
          }
          observations.push(...usageObservations(usageEntries(event["usage"])));
          return observations;
        }
        case "message_stop": {
          const observations: ServerToolObservation[] = [];
          for (const [toolName, count] of perResponseCalls) {
            if (count > 0 && !reportedUsage.has(toolName)) {
              observations.push({ kind: "usage", toolName, count, state: "from-blocks" });
            }
          }
          reset();
          return observations;
        }
        default:
          return []; // 其余事件类型（含 message_stop 已独立分支、error 等非白名单事件）的 O(1) 早退
      }
    },
  };
}

/** `before_provider_request` 扩展层用的最小配置面（real-adapter 组装时传入；未启用时不传）。 */
export interface ServerToolExtensionOptions {
  declarations: readonly ServerToolDeclaration[];
}

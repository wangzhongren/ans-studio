// —————————————————————— 最小 Chat Completions 兼容传输（2026-10-27 客户补充约束） ——————————————————————
//
// 背景：客户 2026-10-27 要求 Codex 支持 **OpenAI Chat Completions** 面（Pi 网关起初作为临时测试
// 环境）。客户同日纠正：**Pi 只能作临时测试配置，产品不得在 Codex 缺配置时自动回退 Pi**。
// 因此本传输只消费显式传入的 endpoint/model/apiKey（产品读 Codex/OpenAI 自己的配置；测试/探针
// 显式注入临时配置）。本机固定 `@openai/codex 0.162.1` 原生二进制明确拒绝
// `wire_api = "chat"`（"no longer supported"），app-server 无法接 Chat 端点；本文件提供一条
// **显式 opt-in**（`ANS_CODEX_WIRE_API=chat`）的最小传输：直接调用 OpenAI Chat Completions，
// 用注入的 ANS 工具做 function calling。
//
// 边界与纪律：
// · **不改变默认路径**：未设 `wireApi:"chat"` 时仍走原 app-server Responses 适配器，逐字不变。
// · **只执行注入的 ANS 工具**：不存在原生 shell/文件工具；工具 handler 仍由运行时核心治理。
// · **同轮工具结果附图**：工具消息 content 用 `[{type:"text"},{type:"image_url",image_url:{url:"data:…"}}]`
//   （Pi 网关真机探针实测接受该形状，且模型实际看到了 1×1 半透明红色像素；OpenAI 官方 Chat
//   Completions 规范不保证 tool 消息支持图片，故这是网关兼容能力，失败必须如实呈现）。
// · **图片字节绝不经过 redact/日志/诊断/事件**；只有文本经过 `redact`。不写临时文件。
// · 不实现原生 MCP、联网搜索、线程恢复与思考等级；这些能力在 chat 模式下结构性缺席，
//   装配时对非空声明 fail-closed（见 session.ts）。
import { randomUUID } from "node:crypto";
import type { ResolvedRole } from "../../model/role.ts";
import type {
  InteractionGate, PromptImage, PromptOptions, RoleSession, RuntimeToolErrorFactsV1,
  RuntimeToolEventFactsV1, RuntimeToolEventProjector, RuntimeToolResultFactsV1, RuntimeTurnOutcome,
  SessionEvent, ToolDefinition, ToolResult,
} from "../../model/runtime.ts";
import { eventQueue, object, pausedDeadline } from "./protocol.ts";
import { CODEX_IMAGE_UNAVAILABLE_NOTE, CODEX_TOOL_RESULT_IMAGE_MIMES, mapCodexToolResultImages } from "./tool-result-images.ts";

export interface CodexChatSessionOptions {
  role: ResolvedRole;
  systemPrompt: string;
  tools: readonly ToolDefinition[];
  model: string;
  endpoint: string;
  apiKey: string;
  redact: (input: unknown) => string;
  interactionGate: InteractionGate;
  currentTurnId?: () => string | undefined;
  projectToolEvent?: RuntimeToolEventProjector;
  turnLastResortMs: number;
  /** Test/embedding seam; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-turn model rounds (one round = one Chat Completions request); guard against runaway loops. */
  maxToolRounds?: number;
}

const TOOL_PREFIX = "ans_";
const DEFAULT_MAX_TOOL_ROUNDS = 64;

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ChatToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface NormalizedToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  tool_calls?: NormalizedToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

/** A JSON object; arrays/null/scalars are not valid tool arguments. */
function parseArguments(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null || raw === "") return {};
  if (typeof raw !== "string") return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

function normalizeToolCalls(raw: unknown): NormalizedToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: NormalizedToolCall[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const fn = record.function;
    if (fn === null || typeof fn !== "object" || Array.isArray(fn)) continue;
    const functionRecord = fn as Record<string, unknown>;
    calls.push({
      id: typeof record.id === "string" && record.id !== "" ? record.id : `codex-chat:${randomUUID()}`,
      type: "function",
      function: {
        name: typeof functionRecord.name === "string" ? functionRecord.name : "",
        arguments: typeof functionRecord.arguments === "string" ? functionRecord.arguments : "{}",
      },
    });
  }
  return calls;
}

/**
 * 最小 Chat Completions 会话：system + 累积消息历史，function calling 循环执行注入工具。
 * `nativeSessionId` 不存在（无原生线程）；失败/中止/超时的轮次回滚历史，避免半截 tool_calls
 * 污染下一次请求。所有事件仍按 Codex 适配器既有 SessionEvent 形状发出。
 */
export function createCodexChatSession(options: CodexChatSessionOptions): RoleSession {
  const role = options.role;
  const redact = options.redact;
  const fetchImpl = options.fetchImpl ?? fetch;
  const toolMap = new Map(options.tools.map(tool => [tool.name, tool]));
  const toolSpecs = options.tools.map(tool => ({
    type: "function" as const,
    function: { name: `${TOOL_PREFIX}${tool.name}`, description: tool.description, parameters: tool.inputSchema },
  }));
  const messages: ChatMessage[] = [{ role: "system", content: options.systemPrompt }];
  const queue = eventQueue();
  let active: { controller: AbortController; settled: Promise<void> } | undefined;
  let disposed = false;
  let promptCount = 0;
  let configurationShown = false;

  const scrub = (value: unknown): unknown => {
    if (typeof value === "string") return redact(value);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
    return value;
  };
  const emit = (turnId: string, kind: SessionEvent["kind"], summary: string, detail?: unknown) => {
    queue.push({ runtime: "codex", roleId: role.id, turnId, kind, summary: redact(summary), ...(detail === undefined ? {} : { detail: scrub(detail) }) });
  };
  // 与 app-server 路径同形的工具投影出口；投影失败只发有界诊断，不改模型面。
  const emitTool = (turnId: string, facts: RuntimeToolEventFactsV1, legacyKind: SessionEvent["kind"], legacySummary: string, legacyDetail: unknown) => {
    if (!options.projectToolEvent) { emit(turnId, legacyKind, legacySummary, legacyDetail); return; }
    try {
      queue.push(options.projectToolEvent({ ...facts, runtime: "codex", roleId: role.id, turnId }, redact));
    } catch {
      queue.push({ runtime: "codex", kind: "message", summary: "Tool display projection failed",
        detail: { version: 1, source: "tool-display-diagnostic", code: "PROJECTION_FAILED" } });
    }
  };

  /** User turn: plain text stays a string (widest compatibility); images become content parts. */
  const userMessage = (text: string, images: PromptImage[] | undefined): ChatMessage => {
    if (!images || images.length === 0) return { role: "user", content: text };
    const parts: ChatContentPart[] = [{ type: "text", text }];
    for (const image of images) {
      if (typeof image.data !== "string" || image.data === "" || !CODEX_TOOL_RESULT_IMAGE_MIMES.has(image.mimeType)) {
        throw new Error("Codex unsupported image MIME type");
      }
      parts.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
    }
    return { role: "user", content: parts };
  };

  const requestModel = async (signal: AbortSignal): Promise<Record<string, unknown>> => {
    let response: Response;
    try {
      response = await fetchImpl(options.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          messages,
          stream: false,
          ...(toolSpecs.length > 0 ? { tools: toolSpecs, tool_choice: "auto" } : {}),
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(`Codex chat transport request failed: ${redact(error)}`);
    }
    const body = await response.text();
    if (!response.ok) throw new Error(`Codex chat transport HTTP ${response.status}: ${redact(body.slice(0, 512))}`);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new Error("Codex chat transport returned invalid JSON"); }
    const choices = object(parsed, "chat completion").choices;
    if (!Array.isArray(choices) || choices.length === 0) throw new Error("Codex chat transport returned no choices");
    return object(object(choices[0], "chat choice").message, "chat message");
  };

  /**
   * Execute one model tool call. Returns the `tool` message content: text string for text-only results;
   * text + `image_url` data-URL parts when the tool result carries valid images (same-turn附图).
   * Fail-closed: failed result / invalid payload ⇒ no image part + honest note.
   */
  const runToolCall = async (turnId: string, call: NormalizedToolCall, signal: AbortSignal): Promise<string | ChatContentPart[]> => {
    const proxyName = call.function.name;
    const name = proxyName.startsWith(TOOL_PREFIX) ? proxyName.slice(TOOL_PREFIX.length) : "";
    const tool = toolMap.get(name);
    const args = parseArguments(call.function.arguments);
    if (!tool || args === undefined) {
      const message = !tool ? "ANS refused an unregistered tool" : "ANS refused non-object tool arguments";
      emitTool(turnId, { toolName: name || proxyName, toolCallId: call.id, input: { rule: "none", args: {} }, phase: "result", origin: "handler-result" }, "denied", message, { toolName: name, name, toolCallId: call.id, ok: false });
      return message;
    }
    const facts = { toolName: name, toolCallId: call.id, input: { rule: tool.displayInputRule, args } };
    emitTool(turnId, { ...facts, phase: "start", origin: "handler-start" }, "tool_call", name, { toolName: name, name, toolCallId: call.id, args });
    let result: ToolResult;
    let displayError: RuntimeToolErrorFactsV1 | undefined;
    try {
      result = await tool.handler({ name, args, toolCallId: call.id, signal });
    } catch (error) {
      displayError = error instanceof Error ? { message: error.message } : {};
      result = { ok: false, message: redact(error) };
    }
    const mapping = mapCodexToolResultImages(result);
    const deliveredOk = result.ok && !mapping.invalid;
    const modelMessage = mapping.invalid ? `${result.message}${CODEX_IMAGE_UNAVAILABLE_NOTE}` : result.message;
    const resultFacts: RuntimeToolResultFactsV1 = { ok: deliveredOk, message: modelMessage, ...(result.execution !== undefined ? { execution: result.execution } : {}) };
    let source: RuntimeToolEventFactsV1 = { ...facts, phase: "result", origin: "handler-result", result: resultFacts };
    if (displayError !== undefined) source = { ...facts, phase: "result", origin: "handler-result", error: displayError };
    emitTool(turnId, source, deliveredOk ? "accepted" : "denied", modelMessage, { toolName: name, name, toolCallId: call.id, ok: deliveredOk });
    const text = redact(modelMessage);
    if (mapping.images.length === 0) return text;
    // 工具消息附图：Pi 网关真机探针接受的形状（text + image_url data URL）；图片字节不过 redact。
    return [
      { type: "text", text },
      ...mapping.images.map(image => ({ type: "image_url" as const, image_url: { url: `data:${image.mimeType};base64,${image.data}` } })),
    ];
  };

  return {
    runtime: "codex",
    roleId: role.id,
    contextSource: "in-memory",
    async prompt(text: string, promptOptions?: PromptOptions) {
      if (disposed) throw new Error("Codex chat session is disposed");
      if (active) throw new Error("Codex chat session already has an active turn");
      const controller = new AbortController();
      let resolveSettled!: () => void;
      const settled = new Promise<void>(resolve => { resolveSettled = resolve; });
      const turnState = { controller, settled };
      active = turnState;
      const turnId = options.currentTurnId?.() ?? randomUUID();
      promptCount += 1;
      if (!configurationShown) {
        configurationShown = true;
        emit(turnId, "message", "本会话使用 Codex Chat Completions 兼容传输：不启动原生 app-server；思考等级、原生 MCP 与联网搜索不适用。", { source: "system", reasonCode: "chat-transport", state: "configured" });
      }
      const historyMark = messages.length;
      const state: { outcome: RuntimeTurnOutcome; failure?: string } = { outcome: "completed" };
      const stopTimer = pausedDeadline(options.interactionGate, options.turnLastResortMs, () => {
        if (controller.signal.aborted) return;
        state.failure = `Codex chat 本轮运行超过最后兜底（${options.turnLastResortMs}ms），已中止以免无限挂起。`;
        state.outcome = "timed_out";
        controller.abort();
      });
      try {
        messages.push(userMessage(text, promptOptions?.images));
        const maxRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
        let rounds = 0;
        while (!controller.signal.aborted) {
          const message = await requestModel(controller.signal);
          if (controller.signal.aborted) break;
          const contentText = typeof message.content === "string" ? message.content : "";
          if (contentText !== "") emit(turnId, "message", contentText, { text: contentText });
          const toolCalls = normalizeToolCalls(message.tool_calls);
          if (toolCalls.length === 0) break;
          rounds += 1;
          if (rounds > maxRounds) throw new Error(`Codex chat tool loop exceeded ${maxRounds} rounds`);
          // DeepSeek 思考模式要求把 reasoning_content 原样回传；不携带会 400。
          messages.push({
            role: "assistant",
            content: typeof message.content === "string" ? message.content : null,
            tool_calls: toolCalls,
            ...(typeof message.reasoning_content === "string" ? { reasoning_content: message.reasoning_content } : {}),
          });
          for (const call of toolCalls) {
            if (controller.signal.aborted) break;
            const parts = await runToolCall(turnId, call, controller.signal);
            messages.push({ role: "tool", tool_call_id: call.id, content: parts });
          }
        }
        if (controller.signal.aborted && state.outcome !== "timed_out") state.outcome = "aborted";
      } catch (error) {
        if (state.outcome !== "timed_out") state.outcome = controller.signal.aborted ? "aborted" : "failed";
        if (state.outcome === "failed") state.failure = redact(error);
      } finally {
        stopTimer();
        // 失败/中止/超时：回滚本轮历史，绝不让半截 assistant.tool_calls 在下一次请求里悬空。
        if (state.outcome !== "completed") messages.length = historyMark;
        if (active === turnState) active = undefined;
        emit(turnId, "settled", `Codex chat turn ${state.outcome}`, { outcome: state.outcome, ...(state.failure !== undefined ? { error: state.failure } : {}) });
        resolveSettled();
      }
      if (state.outcome === "failed" || state.outcome === "timed_out") throw new Error(state.failure ?? `Codex chat turn ${state.outcome}`);
    },
    events: queue.events,
    async abort() {
      const current = active;
      if (!current) return;
      current.controller.abort();
      await current.settled;
    },
    async dispose() {
      disposed = true;
      const current = active;
      if (current) {
        current.controller.abort();
        await current.settled;
      }
      queue.end();
    },
  };
}

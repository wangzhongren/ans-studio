// Claude Provider public entry. Infrastructure stays here; common contains pure/framework helpers.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type * as SDK from "@anthropic-ai/claude-agent-sdk";
import type * as Zod from "zod";
import type { ResolvedRole } from "../../model/role.ts";
import type { RuntimeAdapter, RuntimeProviderOptions, RoleSession, SessionEvent, RuntimeTurnOutcome, PromptOptions, RuntimeToolEventFactsV1, RuntimeReasoningFactsV1 } from "../../model/runtime.ts";
import { MODEL_REQUEST_FAILED } from "../../model/runtime.ts";
import { RUNTIME_CREDENTIAL_ENV_VARS } from "../../common/shared/runtime-shared.ts";
import { createDiagnosticLogger } from "../../common/shared/diagnostics.ts";
import { REASONING_EVENT_SUMMARY } from "../../common/runtime-core/reasoning.ts";
import {
  DEFAULT_REQUEST_FIRST_BYTE_TIMEOUT_MS,
  DEFAULT_REQUEST_IDLE_TIMEOUT_MS,
  createRequestDeadline,
  createRequestTimeoutFailure,
  isRequestTimeoutFailure,
  type RequestDeadline,
} from "../../common/runtime-core/request-timeout.ts";
import {
  DEFAULT_NETWORK_RETRY_WINDOW_MS,
  createNetworkOfflineFailure,
  isNetworkOfflineFailure,
} from "../../common/runtime-core/network-gate.ts";
import { NETWORK_OFFLINE_TIMEOUT } from "../../model/runtime.ts";
import { toClaudeSchema } from "../../common/claude-adapter/schema.ts";
import { CLAUDE_JUDGE_DISALLOWED_TOOLS, CLAUDE_JUDGE_TOOL_NAMES, assertClaudeJudgeToolSet, claudeJudgeReportToolName, claudeJudgeSystemPromptLine } from "../../common/claude-adapter/judge.ts";
import { isClaudeImageMimeType, mapClaudeToolResultImages, type ClaudeImageMimeType } from "../../common/claude-adapter/tool-result-images.ts";
import { abortError, createQueue, isQueryClosedError, waitForTurn } from "../../common/claude-adapter/lifecycle.ts";
import { DEFAULT_TURN_LAST_RESORT_MS } from "../../common/runtime-core/timeout.ts";
import { renderInstalledSkillsSection } from "../../common/编排/installed-skills.ts";

/** Tests replace only transport; MCP server/schema/handlers can remain the actual SDK implementation. */
export interface ClaudeAdapterDependencies {
  loadSdk?: () => Promise<Pick<typeof SDK, "query" | "createSdkMcpServer">>;
  loadZod?: () => Promise<typeof Zod>;
  env?: Record<string, string | undefined>;
}
type Turn = {
  id: string;
  sdkUuid: ReturnType<typeof randomUUID>;
  controller: AbortController;
  done: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
  /** Normal output or a tool allowed to start makes whole-input replay unsafe. */
  replayUnsafe: boolean;
};
type Engine = {
  query: SDK.Query;
  input: ReturnType<typeof createQueue<SDK.SDKUserMessage>>;
  controller: AbortController;
  closed: boolean;
  resumeId?: string;
  /** One honest installed-MCP status pass per engine (G-4 V2 P1). */
  statusReported: boolean;
  toolTail: Promise<void>;
  contexts: Map<string, { turn: Turn; toolName: string; toolUseId: string; signal: AbortSignal }>;
  nativeTurns: Map<string, { turn: Turn; signal: AbortSignal }>;
  pendingInputs: Map<string, Turn>;
  /** Native tool calls observed on the message pump (built-in WebSearch + installed foreign MCP), keyed by the model's tool_use id. */
  nativeCalls: Map<string, { turn: Turn; toolCallId: string; toolName: string }>;
};
// MCP has a hard upstream ceiling; max Node timer buys ~24.8 days, never infinity.
const MCP_TOOL_TIMEOUT_MS = 2_147_483_647;
// Installed foreign servers get a finite per-call timeout: one hung third-party call must not ride the
// whole turn (ANS's own server keeps the upstream ceiling — its handlers enforce their own deadlines).
const INSTALLED_MCP_TOOL_TIMEOUT_MS = 60_000;
// Env-scrubbing launcher that wraps every installed server command (see mcp-launcher.mjs; the P0 probe
// proved the CLI otherwise hands its full env, including the gateway key, to the process server).
const MCP_ENV_LAUNCHER = fileURLToPath(new URL("../../common/claude-adapter/mcp-launcher.mjs", import.meta.url));
const CALL_CONTEXT_ARG = "__ans_call_context";
const INPUT_CONTEXT_PREFIX = /^\[ANS_INPUT_CONTEXT:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]\n/;
// Whole-turn last resort (客户裁定 2026-10-17): `promptTimeoutMs` is the watchdog's inspect
// deadline and never aborts a Claude turn. Only this fixed (option-injectable) deadline ends it;
// the tag lets the terminal row distinguish it from the non-aborting inspect deadline.
const TURN_LAST_RESORT_LABEL = "本轮最后兜底";
const TURN_LAST_RESORT_CODE = "TURN_LAST_RESORT";
type TaggedTimeout = Error & { label?: string; code?: string; timeoutMs?: number };
const turnLastResortError = (timeoutMs: number): Error => {
  const error = new Error(`本轮运行超过最后兜底（${timeoutMs}ms），已中止以免无限挂起。`) as TaggedTimeout;
  error.name = "TimeoutError";
  error.label = TURN_LAST_RESORT_LABEL;
  error.code = TURN_LAST_RESORT_CODE;
  error.timeoutMs = timeoutMs;
  return error;
};
const isTurnLastResortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "TimeoutError" && (error as TaggedTimeout).code === TURN_LAST_RESORT_CODE;
// The CLI serializes API errors into result/error frames. Incidental reasoning words in
// auth/model/server failures must not change the request strategy.
const isReasoningRejection = (text: string | undefined): boolean => {
  const match = typeof text === "string" ? /API Error:\s*(400|422)\s+([\s\S]+)$/.exec(text) : null;
  if (!match) return false;
  let message = match[2]!.trim();
  const parameter = /^(?:thinking(?:\.(?:type|budget_tokens))?|effort|output_config(?:\.effort)?)$/i;
  if (message.startsWith("{")) {
    try {
      const body = JSON.parse(message);
      const error = body?.error ?? body;
      if (!error || typeof error !== "object") return false;
      const codes = [error.type, error.code].filter((value): value is string => typeof value === "string");
      if (codes.some((code) => !/^(?:invalid_request(?:_error)?|unsupported_parameter|unsupported_value|invalid_parameter|invalid_value|unknown_parameter|unrecognized_parameter)$/.test(code))) return false;
      if (error.param !== undefined && error.param !== null) return typeof error.param === "string" && parameter.test(error.param) && codes.length > 0;
      if (typeof error.message !== "string") return false;
      message = error.message;
    } catch { return false; }
  }
  // Narrow text-only fallbacks, including the installed CLI's observed "rejects effort".
  if (/\b(?:unknown|invalid|unsupported|unrecognized)\s+model\b|\bmodel\s+(?:is\s+)?(?:not found|unsupported|not supported)\b/i.test(message)) return false;
  return /\b(?:rejects?|unsupported|unrecognized|unknown)\s+(?:(?:parameter|field|argument)\s*[:=]?\s*)?["']?(?:thinking|effort|output_config(?:\.effort)?)(?![\w.])/i.test(message)
    || /\b(?:thinking|effort|output_config(?:\.effort)?)\b["']?\s*(?:(?:parameter|field|value|level)\s*)?(?:(?:is|are)\s+)?(?:not supported|unsupported|not allowed|unrecognized|unknown|must be one of)\b/i.test(message);
};

export function createClaudeRuntimeAdapter(options: RuntimeProviderOptions, dependencies: ClaudeAdapterDependencies = {}): RuntimeAdapter {
  if (options.runtime !== "claude") throw new Error("Claude 适配器只接受 runtime=claude");
  // 判断模式（「替我审」/「替我审批」「替我决策」）：`judgeMode` 由 Service 在注入 `shellJudge`
  // **或** `governanceJudge` 只读能力时置位，此时 `options.tools` 必须恰为运行时核心注入的对应
  // 三件套（shell 的 report_shell_judgement 或治理的 report_governance_judgement，二者不可混用）。
  // 工具集不匹配 ⇒ SDK 加载前抛错，零副作用（写/编辑/shell/交互/回交/派发工具即便被误注入
  // 也不会进入判断会话）。普通角色会话 `judgeMode` 缺席，以下分支全部不成立（逐字不变）。
  const judgeMode = options.judgeMode === true;
  if (judgeMode) assertClaudeJudgeToolSet(options.tools);
  // allowlist 用运行时核心并集（PM 双开关评审 §6.2）；装配仍只认上面校验过的三件套之一。
  const judgeToolNames: ReadonlySet<string> = CLAUDE_JUDGE_TOOL_NAMES;
  if (options.toolDisplayMode === "required-v1" && (typeof options.projectToolEvent !== "function" || typeof options.registerToolDisplayProfile !== "function")) {
    throw new Error("Claude required-v1 工具展示缺少 projector/register 能力");
  }
  // One hour by default; tests/hosts may inject a smaller value. Never read from promptTimeoutMs.
  const turnLastResortMs = options.turnLastResortMs ?? DEFAULT_TURN_LAST_RESORT_MS;
  // P1（2026-10-30）请求级时限：首字节 90s / 流空闲 300s（默认值单一来源 runtime-core/request-timeout.ts；
  // 测试/宿主可注入小值）。与 1h 最后兜底并存：请求超时终态 failed + errorCode，1h 仍是 timed_out。
  const requestFirstByteTimeoutMs = options.requestFirstByteTimeoutMs ?? DEFAULT_REQUEST_FIRST_BYTE_TIMEOUT_MS;
  const requestIdleTimeoutMs = options.requestIdleTimeoutMs ?? DEFAULT_REQUEST_IDLE_TIMEOUT_MS;
  // P2（2026-10-30）网络暂停：离线对同一 deadline `pause()/resume()`（引用计数），超窗失败。
  // 缺省门 ⇒ always-online（旧行为零变化）；窗口缺省 5min，测试/宿主可注入小值。
  const networkGate = options.networkGate;
  const networkRetryWindowMs = options.networkRetryWindowMs ?? DEFAULT_NETWORK_RETRY_WINDOW_MS;
  // Auth, endpoint and redaction must use the same immutable profile snapshot.
  const env = { ...(dependencies.env ?? process.env) };
  const credentialName = options.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";
  const secretValues = [...RUNTIME_CREDENTIAL_ENV_VARS, credentialName].flatMap((key) => env[key] ? [env[key]!] : []);
  const redact = (text: string): string => {
    let safe = text;
    for (const value of secretValues) if (value) safe = safe.split(value).join("[REDACTED]");
    return safe.replace(/\[ANS_INPUT_CONTEXT:[a-f0-9-]{36}\]\n?/gi, "")
      .replace(/(Bearer\s+|(?:api[_-]?key|auth[_-]?token|oauth[_-]?token)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
      .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@");
  };
  // G-4 installed-skills section: the render is the single orchestration source (hash/matching/bad-file
  // handling all live there). Non-empty splices the whole section verbatim as one prompt segment; empty
  // string renders nothing (zero-skill status quo stays byte-identical).
  const systemPrompt = (role: ResolvedRole) => {
    // 判断会话不拼接项目技能注入节：判断只按稳定 rubric + 按需 judge_read_file 读证据，
    // 不让角色/技能文本进入系统提示（普通角色会话逐字不变）。
    const installedSkills = judgeMode ? "" : renderInstalledSkillsSection(options.projectRoot, role.id);
    return [
      role.cardText,
      judgeMode
        ? claudeJudgeSystemPromptLine(role.id, claudeJudgeReportToolName(options.tools))
        : `你始终绑定角色 ${role.id}。只能通过 mcp__ans__ 工具操作环境；所有写入、shell 和交互由 ANS 的注入能力判断。`,
      `当前角色边界：${JSON.stringify(role.boundary)}`,
      ...options.tools.flatMap((tool) => tool.promptGuidelines ?? []),
      ...(installedSkills === "" ? [] : [installedSkills]),
    ].join("\n\n");
  };

  // G-4 V2 P1: installed foreign MCP servers ride the same options.mcpServers channel as `ans`. The
  // declaration reader (runtime-core/mcp-declarations) already rejected invalid/reserved names and the
  // command-reference env form, so this adapter consumes the list as-is. Every command is re-wrapped
  // through the env-scrubbing launcher: the only process the CLI spawns is our launcher, which re-spawns
  // the declared command with a minimal environment (base locators + exactly the declared env names).
  // `env:NAME` references expand against the construction-time env snapshot; a missing target is
  // omitted (the server then reports its own failure through mcpServerStatus).
  const resolveInstalledEnv = (declared?: Readonly<Record<string, string>>): Record<string, string> => {
    const resolved: Record<string, string> = {};
    for (const [name, value] of Object.entries(declared ?? {})) {
      const target = value.startsWith("env:") ? env[value.slice(4).trim()] : value;
      if (target !== undefined) resolved[name] = target;
    }
    return resolved;
  };
  // 判断会话强制不装配任何外来 MCP（PM 评审 §6.1/A35）：即便上游误传声明也置空。
  // 普通角色会话保持既有纯消费语义（逐字不变）。
  const installedServers = judgeMode ? [] : options.installedMcpServers ?? [];
  const installedNames = new Set(installedServers.map((declared) => declared.name));
  const installedToolPrefixes = installedServers.map((declared) => `mcp__${declared.name}__`);
  const installedAllowedTools = installedServers.map((declared) => `mcp__${declared.name}`);
  const installedMcpConfigs: Record<string, SDK.McpServerConfig> = Object.fromEntries(installedServers.map((declared) => {
    const resolvedEnv = resolveInstalledEnv(declared.env);
    return [declared.name, {
      type: "stdio" as const, command: process.execPath, args: [MCP_ENV_LAUNCHER, declared.command, ...declared.args],
      env: { ...resolvedEnv, ANS_MCP_LAUNCHER_PASSTHROUGH: JSON.stringify(Object.keys(resolvedEnv)), ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}) },
      alwaysLoad: true, timeout: INSTALLED_MCP_TOOL_TIMEOUT_MS,
    } satisfies SDK.McpStdioServerConfig];
  }));

  return {
    async composeContext(role) { return { systemPrompt: systemPrompt(role) }; },
    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      // 判断模式再校验一次（options 在工厂与 bind 之间可能被误改；仍零副作用）。
      if (judgeMode) assertClaudeJudgeToolSet(options.tools);
      options.registerToolDisplayProfile?.({
        apiKeyEnvVar: credentialName,
        credentials: [...new Set([credentialName, ...(options.toolDisplayCredentialEnvNames ?? [])])]
          .map((name) => ({ name, value: env[name] })),
      });
      // 判断会话不持久化（PM 评审 §6.3）：即便上游误传 storage 也不读/不写会话记录，
      // 原生配置根改用临时目录并在 dispose 清理。普通角色会话逐字不变。
      const storage = judgeMode ? undefined : options.storage;
      if (storage && (storage.runtime !== "claude" || storage.roleId !== role.id)) throw new Error("Claude 存储 runtime/role 不匹配");
      await storage?.validateNativeDirectory?.();
      const previous = await storage?.readLatest();
      let nativeId = previous?.nativeSessionId;
      const source = storage ? "fresh" as const : "in-memory" as const;
      let contextSource: RoleSession["contextSource"] = previous?.contextSource === "recovered" && !nativeId ? "recovered" : source;
      let warning = previous?.contextWarning;
      let disposed = false;
      let active: Turn | undefined;
      let engine: Engine | undefined;
      // P1 请求级超时（每回合/每次尝试一把 deadline）：pump 的每条 SDK 消息喂 activity()；
      // 客户交互（InteractionGate）、工具执行、abort 清理期间 pause()；P2 网络暂停复用同一中性接口。
      let requestDeadline: RequestDeadline | undefined;
      let requestGateUnsubscribe: (() => void) | undefined;
      let requestAbortUnsubscribe: (() => void) | undefined;
      let requestAttempt = 0;
      let promptStartedAt = 0;
      let temporaryDirectory: string | undefined;
      let teardownError: Error | undefined;
      // A failed/cancelled compatibility attempt stays local to its prompt.
      let reasoningCompatible = false;
      let reasoningConfigReported = false;
      let lastFailureText: string | undefined;
      const diagnostics = createDiagnosticLogger({ component: "provider.claude", projectRoot: options.projectRoot, roleId: role.id });
      const events = createQueue<SessionEvent>();
      const emit = (turn: Turn, kind: SessionEvent["kind"], summary: string, detail?: unknown) => {
        if (turn.controller.signal.aborted && kind !== "settled") return;
        events.push({ runtime: "claude", roleId: role.id, turnId: turn.id, kind, summary: redact(summary), detail });
      };
      const emitReasoningSystem = (turn: Turn, state: "configured" | "trying" | "compatible" | "request-error", summary: string) =>
        emit(turn, "message", summary, { source: "system", reasonCode: "claude-reasoning", state });
      // G-5 reasoning facts: raw only — the Service's single projection point (projectReasoningDetail)
      // does redaction/budgeting; the adapter never pre-redacts and never renders. The bundled CLI
      // 2.1.299 frames carry no real per-segment duration signal (probe A1), so durationMs is never set.
      const emitReasoning = (turn: Turn, facts: RuntimeReasoningFactsV1) => {
        emit(turn, "message", REASONING_EVENT_SUMMARY, { version: 1, source: "reasoning", reasoning: facts });
      };
      // A projection is already protected. Never feed its identities back through redact/emit.
      const projectionDiagnostic = (code: "PROJECTION_FAILED" | "CALL_CONTEXT_UNATTRIBUTED") => {
        events.push({ runtime: "claude", kind: "message", summary: "工具展示诊断",
          detail: { version: 1, source: "tool-display-diagnostic", code } });
      };
      const emitTool = (turn: Turn, facts: RuntimeToolEventFactsV1, legacyKind: SessionEvent["kind"], legacySummary: string) => {
        if (turn.controller.signal.aborted) return;
        if (!options.projectToolEvent) {
          emit(turn, legacyKind, legacySummary, { toolCallId: facts.toolCallId, toolName: facts.toolName });
          return;
        }
        try {
          const event = options.projectToolEvent({ ...facts, runtime: "claude", roleId: role.id, turnId: turn.id }, redact);
          events.push(event);
        } catch { projectionDiagnostic("PROJECTION_FAILED"); }
      };
      const emitUnattributed = () => {
        if (!options.projectToolEvent) { projectionDiagnostic("CALL_CONTEXT_UNATTRIBUTED"); return; }
        try {
          const event = options.projectToolEvent({ origin: "diagnostic", code: "CALL_CONTEXT_UNATTRIBUTED" }, redact);
          // No active-turn fallback: an unknown hook does not identify a business call.
          events.push(event);
        } catch { projectionDiagnostic("PROJECTION_FAILED"); }
      };
      // One honest status pass per engine (G-4 V2 P1, assessment §2.5): failed/needs-auth installed
      // servers surface a category-classified line; the turn proceeds regardless and a status query
      // failure is swallowed. Only the error category (leading CODE token, else a bounded first
      // segment) is reported — never the full error body. Servers still pending at this instant
      // (e.g. a hanging connect) stay silent this round; their tools are simply absent.
      const reportInstalledServerStatus = async (current: Engine, turn: Turn): Promise<void> => {
        if (installedNames.size === 0) return;
        let entries: SDK.McpServerStatus[];
        try { entries = await current.query.mcpServerStatus(); } catch { return; }
        for (const entry of entries) {
          if (!installedNames.has(entry.name) || (entry.status !== "failed" && entry.status !== "needs-auth")) continue;
          const error = typeof entry.error === "string" ? entry.error.trim() : "";
          const category = /^([A-Z][A-Z0-9_]*)\b/.exec(error)?.[1] ?? (error === "" ? entry.status : error.split(/[\n(,]/)[0]!.slice(0, 80));
          emit(turn, "message", `已安装 MCP「${entry.name}」未连接：${category}`);
        }
      };
      // P1 请求级 deadline 生命周期（停止/暂停/恢复）。暂停引用计数：交互闸、工具执行、abort 清理可嵌套，
      // P2 网络暂停接同一 `pause()/resume()`。网络监听绑定到**当前 attempt 的 deadline**：
      // 离线 ⇒ 暂停（计时停走，不触发请求超时）；恢复 ⇒ 继续；离线超过窗口 ⇒ network-offline-timeout。
      let networkUnsubscribe: (() => void) | undefined;
      let networkPaused = false;
      let networkOfflineSince: number | undefined;
      let networkWindow: ReturnType<typeof setTimeout> | undefined;
      const stopNetworkWatch = (): void => {
        networkUnsubscribe?.();
        networkUnsubscribe = undefined;
        if (networkWindow !== undefined) {
          clearTimeout(networkWindow);
          networkWindow = undefined;
        }
        networkPaused = false;
        networkOfflineSince = undefined;
      };
      const pauseRequestForNetwork = (turn: Turn, offlineAt: number): void => {
        if (networkPaused || disposed || turn.controller.signal.aborted) return;
        networkPaused = true;
        networkOfflineSince = offlineAt;
        requestDeadline?.pause();
        diagnostics.record("network.request.pause", { turnId: turn.id, attempt: requestAttempt, state: "offline", mode: "claude" });
        emit(turn, "message", "网络已断开，当前请求的计时已暂停；恢复后继续。", { source: "system", reasonCode: "network-offline", state: "offline" });
        if (Number.isFinite(networkRetryWindowMs) && networkRetryWindowMs > 0) {
          networkWindow = setTimeout(() => {
            networkWindow = undefined;
            if (!networkPaused || disposed || turn.controller.signal.aborted) return;
            const offlineMs = Math.max(0, Date.now() - (networkOfflineSince ?? Date.now()));
            // 只记录元数据（时长/次数）；不记录 prompt/URL/凭据。终态 failed + errorCode，不自动重放。
            diagnostics.record("network.request.timeout", {
              turnId: turn.id, attempt: requestAttempt, errorCode: NETWORK_OFFLINE_TIMEOUT,
              timeoutMs: networkRetryWindowMs, durationMs: Math.round(offlineMs), mode: "offline-window",
            });
            turn.reject(createNetworkOfflineFailure(requestAttempt, turn.replayUnsafe, offlineMs));
          }, networkRetryWindowMs);
        }
      };
      const resumeRequestForNetwork = (turn: Turn): void => {
        if (!networkPaused) return;
        networkPaused = false;
        networkOfflineSince = undefined;
        if (networkWindow !== undefined) {
          clearTimeout(networkWindow);
          networkWindow = undefined;
        }
        requestDeadline?.resume();
        diagnostics.record("network.request.resume", { turnId: turn.id, attempt: requestAttempt, state: "online", mode: "claude" });
        emit(turn, "message", "网络已恢复，暂停的请求继续。", { source: "system", reasonCode: "network-offline", state: "online" });
      };
      /** 绑定本次 attempt 的网络状态订阅；当前已离线则立即暂停（先 pause 再 start 是合法顺序）。 */
      const startNetworkWatch = (turn: Turn): void => {
        stopNetworkWatch();
        if (networkGate === undefined) return;
        networkUnsubscribe = networkGate.onChange((state) => {
          if (state.online) resumeRequestForNetwork(turn);
          else pauseRequestForNetwork(turn, Number.isFinite(state.at) ? state.at : Date.now());
        });
        const current = networkGate.current();
        if (!current.online) pauseRequestForNetwork(turn, current.at);
      };
      const stopRequestDeadline = (): void => {
        requestDeadline?.stop();
        requestDeadline = undefined;
        requestGateUnsubscribe?.();
        requestGateUnsubscribe = undefined;
        requestAbortUnsubscribe?.();
        requestAbortUnsubscribe = undefined;
        stopNetworkWatch();
      };
      const pauseRequestTimer = (turn?: Turn): void => { if (turn === undefined || turn === active) requestDeadline?.pause(); };
      const resumeRequestTimer = (turn?: Turn): void => { if (turn === undefined || turn === active) requestDeadline?.resume(); };
      // P1：请求级超时错误原样上抛（name=RequestTimeoutError，code=request-timeout-*），不得被
      // 「Claude SDK 运行失败」包装吞掉 code；P2 网络离线超窗错误同理原样上抛；AbortError/TimeoutError
      // （最后兜底）语义不变。
      const safeFailure = (error: unknown) => isRequestTimeoutFailure(error) || isNetworkOfflineFailure(error)
        ? error
        : error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
          ? error : new Error(`Claude SDK 运行失败：${redact(error instanceof Error ? error.message : String(error))}`);
      const closeEngine = (current: Engine) => {
        if (current.closed) return;
        current.closed = true;
        stopRequestDeadline();
        current.contexts.clear();
        current.nativeTurns.clear();
        current.pendingInputs.clear();
        current.nativeCalls.clear();
        current.controller.abort();
        current.input.close();
        if (engine === current) engine = undefined;
        // A closed engine can never deliver the in-flight turn's result; settle its done promise here
        // too so prompt() cannot hang when no other path rejected it (e.g. abort/dispose racing).
        active?.reject(abortError());
        try { current.query.close(); }
        catch (error) { teardownError = safeFailure(error); active?.reject(teardownError); }
      };
      const resumeFailed = (current: Engine) => {
        if (!current.resumeId) return;
        nativeId = undefined;
        contextSource = "recovered";
        warning = "Claude 原生会话恢复未确认，当前轮失败；当前输入未自动重试，下一条输入将新建上下文。ANS 历史仅为可读回放。";
        current.resumeId = undefined;
      };
      // Empty options alone restore CLI defaults. Compatibility also needs the child env below.
      const reasoningOptions = (compatible: boolean): Pick<SDK.Options, "thinking" | "effort"> => {
        if (compatible) return {};
        const configured = options.reasoningEffort;
        if (configured === "off") return { thinking: { type: "disabled" } };
        if (configured === "low" || configured === "medium" || configured === "high" || configured === "xhigh") return { effort: configured };
        return {};
      };
      const startEngine = async (turn: Turn, compatible: boolean): Promise<Engine> => {
        if (engine && !engine.closed) return engine;
        teardownError = undefined;
        if (!storage && nativeId) { nativeId = undefined; warning = "Claude 活会话已中断；下一条输入将新建上下文。"; }
        // 判断模式：新建引擎前再校验一次（防止工厂→bind→引擎构造之间 options 被误改）；
        // 必须在加载 SDK 之前，保证零副作用。
        if (judgeMode) assertClaudeJudgeToolSet(options.tools);
        const sdk = await (dependencies.loadSdk?.() ?? import("@anthropic-ai/claude-agent-sdk"));
        const z = await (dependencies.loadZod?.() ?? import("zod"));
        if (turn.controller.signal.aborted || disposed) {
          if (temporaryDirectory) { await rm(temporaryDirectory, { recursive: true, force: true }); temporaryDirectory = undefined; }
          throw abortError();
        }
        const apiKey = env[credentialName]?.trim();
        if (!apiKey) throw new Error(`Claude 缺少 API key：${credentialName}`);
        let configDirectory: string;
        if (storage) {
          if (!storage.prepareNativeDirectory) throw new Error("Claude 持久存储缺少 prepareNativeDirectory 安全能力");
          await storage.prepareNativeDirectory();
          configDirectory = storage.nativeDirectory;
        } else {
          temporaryDirectory ??= await mkdtemp(join(tmpdir(), "ans-claude-"));
          configDirectory = temporaryDirectory;
        }
        if (turn.controller.signal.aborted || disposed) {
          if (temporaryDirectory) { await rm(temporaryDirectory, { recursive: true, force: true }); temporaryDirectory = undefined; }
          throw abortError();
        }
        const childEnv: Record<string, string | undefined> = {};
        for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR", "LANG", "LC_ALL"]) if (env[key] !== undefined) childEnv[key] = env[key];
        childEnv.ANTHROPIC_API_KEY = apiKey;
        childEnv.CLAUDE_CONFIG_DIR = configDirectory;
        childEnv.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS = "0";
        if (compatible) {
          childEnv.CLAUDE_CODE_EFFORT_LEVEL = "unset";
          childEnv.CLAUDE_CODE_DISABLE_THINKING = "1";
        }
        const baseUrl = options.baseUrl?.trim() || env.ANTHROPIC_BASE_URL?.trim();
        if (baseUrl) {
          let url: URL;
          try { url = new URL(baseUrl); } catch { throw new Error("Claude base URL 格式无效"); }
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Claude base URL 必须是 HTTP(S) 且不包含用户名或密码");
          childEnv.ANTHROPIC_BASE_URL = baseUrl;
        }
        const names = new Set(options.tools.map((tool) => `mcp__ans__${tool.name}`));
        if (names.size !== options.tools.length || options.tools.some((tool) => !/^[a-zA-Z0-9_-]+$/.test(tool.name))) throw new Error("Claude ANS 工具名无效或重复");
        const controller = new AbortController();
        const input = createQueue<SDK.SDKUserMessage>();
        // Register complete Zod objects through the supported MCP instance API. SDK tool()'s raw shape
        // cannot preserve additionalProperties at the root; MCP registerTool accepts a Zod object.
        const server = sdk.createSdkMcpServer({ name: "ans", version: "1.0.0", tools: [] });
        server.timeout = MCP_TOOL_TIMEOUT_MS;
        const current: Engine = { query: undefined as unknown as SDK.Query, input, controller, closed: false, resumeId: nativeId, statusReported: false, toolTail: Promise.resolve(), contexts: new Map(), nativeTurns: new Map(), pendingInputs: new Map(), nativeCalls: new Map() };
        for (const tool of options.tools) {
          const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
          if (Object.hasOwn(properties, CALL_CONTEXT_ARG)) throw new Error("Claude ANS 工具 schema 包含保留的请求上下文字段");
          server.instance.registerTool(tool.name, {
            description: tool.description,
            inputSchema: toClaudeSchema({ ...tool.inputSchema, properties: { ...properties, [CALL_CONTEXT_ARG]: { type: "string", description: "Internal ANS context assigned by the host; omit this field." } } }, z),
            annotations: judgeMode
              // 判断会话三件套（shell 或治理 report）全部只读、不破坏、不触网。
              ? { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
              : { readOnlyHint: tool.name === "read_file", destructiveHint: tool.name !== "read_file", openWorldHint: tool.name === "run_shell" },
            _meta: { "anthropic/alwaysLoad": true },
          }, async (args, extra) => {
            // PreToolUse recorded the ORIGINAL turn. RequestHandlerExtra has no turn/tool-use ID;
            // never attribute a delayed old callback by whichever turn happens to be active now.
            const inputArgs = args as Record<string, unknown>;
            const token = typeof inputArgs[CALL_CONTEXT_ARG] === "string" ? inputArgs[CALL_CONTEXT_ARG] : undefined;
            const context = token ? current.contexts.get(token) : undefined;
            if (token) current.contexts.delete(token);
            const callTurn = context?.toolName === tool.name ? context.turn : undefined;
            const signal = AbortSignal.any([controller.signal, ...(callTurn && context ? [callTurn.controller.signal, context.signal] : []), extra.signal]);
            const toolCallId = `${callTurn?.id ?? "idle"}:${context?.toolUseId ?? randomUUID()}`;
            const { [CALL_CONTEXT_ARG]: _privateContext, ...publicArgs } = inputArgs;
            const run = current.toolTail.then(async () => {
              if (!callTurn || callTurn !== active || signal.aborted || current.closed) return { content: [{ type: "text" as const, text: "原始工具请求上下文无效或已结束，工具未执行" }], isError: true };
              callTurn.replayUnsafe = true;
              const facts = { toolCallId, toolName: tool.name, input: { rule: tool.displayInputRule, args: publicArgs } };
              emitTool(callTurn, { ...facts, phase: "start", origin: "handler-start" }, "tool_call", tool.name);
              try {
                // P1：工具执行期间请求空闲计时停走（工具自身的 10min/60s 时限负责它自己的挂起）。
                pauseRequestTimer(callTurn);
                let result: Awaited<ReturnType<typeof tool.handler>>;
                try {
                  result = await tool.handler({ name: tool.name, args: publicArgs, signal, toolCallId });
                } finally {
                  resumeRequestTimer(callTurn);
                }
                if (signal.aborted || current.closed) return { content: [{ type: "text" as const, text: "本轮已中止，工具结果已丢弃" }], isError: true };
                // 工具结果附图（同轮设计 §6.4）：仅 ok:true 且载荷合法时映射为 MCP image 块；
                // 图片 data/base64 原引用透传，绝不经过 redact。事件 facts 只带白名单标量：
                // 剔除 images（潜在 base64）后才交给 projector/diagnostics。
                const imageMapping = mapClaudeToolResultImages(result);
                const message = redact(result.message);
                const text = imageMapping.invalid
                  ? `${message}（Claude 适配器：工具结果中的图片数据非法，未向模型提供任何图片；本轮不要假装已看到。）`
                  : message;
                const effectiveOk = result.ok && !imageMapping.invalid;
                const { images: _toolResultImages, ...resultFacts } = result;
                const eventResult = imageMapping.invalid
                  ? { ...resultFacts, ok: false, message: `${result.message}（Claude 适配器：工具结果中的图片数据非法，未向模型提供任何图片；本轮不要假装已看到。）` }
                  : resultFacts;
                emitTool(callTurn, { ...facts, phase: "result", origin: "handler-result", result: eventResult }, effectiveOk ? "accepted" : "denied", text);
                const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [{ type: "text", text }];
                if (effectiveOk) for (const image of imageMapping.images) content.push(image);
                return { content, isError: !effectiveOk };
              } catch (error) {
                const message = `${tool.name} 执行失败；ANS 治理能力未返回成功`;
                if (!signal.aborted && !current.closed) emitTool(callTurn, { ...facts, phase: "result", origin: "handler-result",
                  error: error instanceof Error ? { message: error.message } : {} }, "denied", message);
                return { content: [{ type: "text" as const, text: message }], isError: true };
              }
            });
            current.toolTail = run.then(() => {}, () => {});
            return run;
          });
        }
        // Web search capability bit (construction-time env snapshot). Default off is fail-closed:
        // unset/0/off/unknown keeps tools/allowedTools/hooks exactly as before. 判断模式强制关闭：
        // 忽略 ANS_CLAUDE_WEB_SEARCH，网络工具不得进入只读判断会话（PM 评审 §6.1/A35）。
        const webSearchEnabled = !judgeMode && ["1", "on"].includes((env.ANS_CLAUDE_WEB_SEARCH ?? "").trim().toLowerCase());
        const queryOptions: SDK.Options = {
          cwd: options.projectRoot, systemPrompt: systemPrompt(role),
          tools: webSearchEnabled ? ["WebSearch"] : [],
          // SDK 事实（真机诊断 CLAUDE_SDK_CAN_USE_TOOL_SHADOWED）：裸 allowedTools 条目会在
          // canUseTool 之前自动放行整个工具。本适配器的逐次拦截一直由 PreToolUse hook 承担
          // （hook deny 先于 allowedTools）；判断模式下 allowedTools 只含三只 judge 工具，
          // 不存在任何写/编辑/shell/交互/回交/派发/网络条目的自动放行面。
          allowedTools: [...names, ...installedAllowedTools, ...(webSearchEnabled ? ["WebSearch"] : [])],
          // 判断模式第三层结构性禁用：内置原生工具显式钉死（tools:[] 已清空内置面；strictMcpConfig
          // 保证只有注入的 ans server；PreToolUse 仍对任何非三项调用兜底 deny）。
          // 普通角色会话不出现该字段（逐字不变）。
          ...(judgeMode ? { disallowedTools: [...CLAUDE_JUDGE_DISALLOWED_TOOLS] } : {}),
          settingSources: [], strictMcpConfig: true,
          skills: [], plugins: [], settings: { disableAllHooks: true }, extraArgs: { "disable-slash-commands": null },
          mcpServers: { ans: server, ...installedMcpConfigs }, env: childEnv, abortController: controller,
          persistSession: !!storage, ...(nativeId ? { resume: nativeId } : {}),
          ...(options.modelId?.trim() || env.ANS_CLAUDE_MODEL?.trim() ? { model: options.modelId?.trim() || env.ANS_CLAUDE_MODEL?.trim() } : {}),
          ...reasoningOptions(compatible),
          canUseTool: async () => ({ behavior: "deny", message: judgeMode
            ? "判断会话仅允许已注册的只读 judge 工具"
            : "仅允许已注册且预批准的 ANS MCP 工具" }),
          hooks: {
            UserPromptSubmit: [{ hooks: [async (hook, _toolUseID, hookOptions) => {
              if (hook.hook_event_name !== "UserPromptSubmit") return {};
              // Native prompt_id is NOT the supplied SDK UUID (bundled CLI 2.1.299 probe).
              // Only the adapter-owned FIRST wire prefix may associate the native hook.
              const transportUuid = INPUT_CONTEXT_PREFIX.exec(hook.prompt)?.[1];
              const turn = transportUuid ? current.pendingInputs.get(transportUuid) : undefined;
              if (!hook.prompt_id || !turn || turn !== active || turn.controller.signal.aborted || controller.signal.aborted || hookOptions.signal.aborted || current.nativeTurns.has(hook.prompt_id)) {
                return { decision: "block", reason: "ANS 无法确认原始请求轮次" };
              }
              current.nativeTurns.set(hook.prompt_id, { turn, signal: hookOptions.signal });
              current.pendingInputs.delete(transportUuid!);
              return {};
            }] }],
            PreToolUse: [{ hooks: [async (hook, _toolUseID, hookOptions) => {
            if (hook.hook_event_name !== "PreToolUse") return {};
            const original = hook.prompt_id ? current.nativeTurns.get(hook.prompt_id) : undefined;
            const originalTurn = original?.turn;
            // 判断模式：只放行冻结的 judge 三件套之一（shell 或治理；名字还必须确实已注册，
            // 因此混合/缺失集合在入口已被拒绝）。这是结构性最后一道闸，兜底文案在下方 deny 分支。
            if (names.has(hook.tool_name) && (!judgeMode || judgeToolNames.has(hook.tool_name.slice("mcp__ans__".length))) && hook.mcp_server?.name === "ans" && hook.mcp_server.source === "sdk" && originalTurn && originalTurn === active && !originalTurn.controller.signal.aborted && !original!.signal.aborted && !controller.signal.aborted && !hookOptions.signal.aborted && hook.tool_input && typeof hook.tool_input === "object" && !Array.isArray(hook.tool_input)) {
              originalTurn.replayUnsafe = true;
              const token = randomUUID();
              current.contexts.set(token, { turn: originalTurn, toolName: hook.tool_name.slice("mcp__ans__".length), toolUseId: hook.tool_use_id, signal: AbortSignal.any([original!.signal, hookOptions.signal]) });
              return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...hook.tool_input as Record<string, unknown>, [CALL_CONTEXT_ARG]: token } } };
            }
            // Installed foreign MCP allow branch (G-4 V2 P1). The P0 probe froze process-server
            // provenance as source "dynamic" (test/claude-adapter/mcp-surface-loopback.probe.ts);
            // strictMcpConfig + empty settings/plugins/agents means a provenance name can only be one
            // we injected. No updatedInput — the model's arguments must reach the third-party server
            // unchanged and the ANS call-context token must never leak outside mcp__ans__ (WebSearch
            // branch precedent). allowedTools only carries the server-level auto-allow fallback.
            if (hook.mcp_server && installedNames.has(hook.mcp_server.name) && hook.mcp_server.source === "dynamic" && hook.tool_name.startsWith(`mcp__${hook.mcp_server.name}__`) && originalTurn && originalTurn === active && !originalTurn.controller.signal.aborted && !original!.signal.aborted && !controller.signal.aborted && !hookOptions.signal.aborted) {
              originalTurn.replayUnsafe = true;
              // P1：原生（外来 MCP）工具执行期间请求空闲计时停走，结果帧到达时恢复。
              pauseRequestTimer(originalTurn);
              emitTool(originalTurn, { origin: "native-start", phase: "start", toolName: hook.tool_name,
                toolCallId: `${originalTurn.id}:${hook.tool_use_id}`,
                input: { rule: "none", args: hook.tool_input !== null && typeof hook.tool_input === "object" && !Array.isArray(hook.tool_input) ? hook.tool_input as Record<string, unknown> : {} } }, "tool_call", hook.tool_name);
              return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
            }
            // Built-in WebSearch auto-allow (capability bit on, bound live turn only). This branch is
            // REQUIRED even though allowedTools lists WebSearch: hook deny precedes allowedTools, so
            // without it the fallback below would kill every search. No updatedInput — the model's
            // query must reach the tool unchanged.
            if (webSearchEnabled && hook.tool_name === "WebSearch" && !hook.mcp_server && originalTurn && originalTurn === active && !originalTurn.controller.signal.aborted && !original!.signal.aborted && !controller.signal.aborted && !hookOptions.signal.aborted) {
              originalTurn.replayUnsafe = true;
              // P1：原生 WebSearch 执行期间请求空闲计时停走，结果帧到达时恢复。
              pauseRequestTimer(originalTurn);
              return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
            }
            if (originalTurn) {
              const tool = options.tools.find((candidate) => `mcp__ans__${candidate.name}` === hook.tool_name);
              const blocked = judgeMode ? "拒绝非判断工具或已中止轮次的调用" : "拒绝非 ANS 工具或已中止轮次的调用";
              emitTool(originalTurn, { origin: "governance-hook", phase: "blocked", toolName: tool?.name ?? hook.tool_name,
                toolCallId: `${originalTurn.id}:${hook.tool_use_id}`,
                result: { ok: false, message: blocked } }, "denied", blocked);
            } else emitUnattributed();
            return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: judgeMode
              ? `判断会话仅允许 ${options.tools.map((tool) => tool.name).join("/")}`
              : "仅允许当前轮注册的 ANS MCP 工具" } };
          }] }],
          },
        };
        current.query = sdk.query({ prompt: input.stream(), options: queryOptions });
        engine = current;
        void (async () => {
          try {
            for await (const message of current.query) {
              const callTurn = active;
              if (current.closed || !callTurn || callTurn.controller.signal.aborted) continue;
              // P1：流活动计数。首字节只认设计口径的四类消息（assistant/user/result/system api_retry）；
              // 其余系统消息（如 init/status）不关闭首字节，但首字节到达后同样重置空闲计时。
              const isFirstByteMessage = message.type === "assistant" || message.type === "user" || message.type === "result"
                || (message.type === "system" && message.subtype === "api_retry");
              if (requestDeadline !== undefined && (requestDeadline.firstByteSeen || isFirstByteMessage) && requestDeadline.activity()) {
                diagnostics.record("request.first-byte", {
                  turnId: callTurn.id,
                  attempt: requestAttempt,
                  durationMs: Math.max(0, Math.round(requestDeadline.firstByteElapsedMs ?? 0)),
                });
              }
              if (message.type === "system" && message.subtype === "api_retry") {
                // SDK 内部 API 重试可见（方案 v1.1 §4.3.3-5 / §6.3）：只记录计数/延迟/状态元数据，
                // 不记录错误正文；SDK 重试期间 ANS **不并发**发起第二次请求（P1 无 ANS 重试；P3 复用该门槛）。
                const retry = message as SDK.SDKAPIRetryMessage;
                diagnostics.record("request.sdk-retry", {
                  turnId: callTurn.id,
                  attempt: retry.attempt,
                  count: retry.max_retries,
                  durationMs: retry.retry_delay_ms,
                  errorCode: typeof retry.error_status === "number" ? String(retry.error_status) : "no-response",
                  ...(retry.no_response !== undefined ? { state: "no-response", timeoutMs: retry.no_response.waited_ms } : {}),
                });
                // 角色日志一行摘要（客户可见的人话；不含错误正文/URL/凭据）。
                emit(callTurn, "message", `接口请求重试中（第 ${retry.attempt}/${retry.max_retries} 次，等待 ${retry.retry_delay_ms}ms）`, { source: "system", reasonCode: "claude-api-retry", state: "retrying" });
                continue;
              }
              if (message.type === "assistant") {
                if (message.error) {
                  lastFailureText = message.message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
                  emitReasoningSystem(callTurn, "request-error", "Claude 接口请求未成功。");
                  continue;
                }
                for (const block of message.message.content) {
                  if (block.type === "tool_use" || block.type === "redacted_thinking" || block.type === "text" && block.text !== "" || block.type === "thinking" && block.thinking !== "") callTurn.replayUnsafe = true;
                  if (block.type === "text") emit(callTurn, "message", block.text);
                  else if (block.type === "thinking") emitReasoning(callTurn, block.thinking === "" ? { text: "", status: "omitted" } : { text: block.thinking, status: "complete" });
                  else if (block.type === "redacted_thinking") emitReasoning(callTurn, { text: "", status: "omitted" });
                  else if (webSearchEnabled && block.type === "tool_use" && block.name === "WebSearch") {
                    // Native call surface only; the query itself stays inside the tool facts (never a message line).
                    const toolCallId = `${callTurn.id}:${block.id}`;
                    current.nativeCalls.set(block.id, { turn: callTurn, toolCallId, toolName: "WebSearch" });
                    emitTool(callTurn, { origin: "native-start", phase: "start", toolName: "WebSearch", toolCallId,
                      input: { rule: "none", args: block.input !== null && typeof block.input === "object" && !Array.isArray(block.input) ? block.input as Record<string, unknown> : {} } }, "tool_call", "WebSearch");
                  } else if (block.type === "tool_use" && installedToolPrefixes.some((prefix) => block.name.startsWith(prefix))) {
                    // Frame-truth registration only: the PreToolUse allow branch already emitted the start
                    // row; this arms the tool_result pairing through the same nativeCalls mechanism.
                    current.nativeCalls.set(block.id, { turn: callTurn, toolCallId: `${callTurn.id}:${block.id}`, toolName: block.name });
                  }
                }
              } else if (message.type === "user") {
                // Native tool results arrive as user tool_result blocks; only tracked native calls are consumed.
                if ((webSearchEnabled || installedToolPrefixes.length > 0) && typeof message.message.content !== "string") for (const block of message.message.content) {
                  if (block.type !== "tool_result") continue;
                  const call = current.nativeCalls.get(block.tool_use_id);
                  if (!call) continue;
                  current.nativeCalls.delete(block.tool_use_id);
                  // P1：原生工具结果到达 ⇒ 恢复请求空闲计时（与 PreToolUse 放行处成对）。
                  resumeRequestTimer(call.turn);
                  const content: ({ type: "text"; text: string } | { type: "unsupported" })[] = [];
                  if (typeof block.content === "string") content.push({ type: "text", text: block.content });
                  else if (Array.isArray(block.content)) for (const item of block.content) content.push(item.type === "text" && typeof item.text === "string" ? { type: "text", text: item.text } : { type: "unsupported" });
                  const text = content.filter((item): item is { type: "text"; text: string } => item.type === "text").map((item) => item.text).join("\n");
                  emitTool(call.turn, { origin: "native-result", phase: "result", toolName: call.toolName, toolCallId: call.toolCallId,
                    native: { isError: block.is_error === true, content } }, block.is_error === true ? "denied" : "accepted", text || call.toolName);
                }
              } else if (message.type === "result") {
                if (message.user_message_uuid && message.user_message_uuid !== callTurn.sdkUuid && !message.user_message_uuids?.includes(callTurn.sdkUuid)) continue;
                if (message.subtype !== "success" || message.is_error) {
                  // Preserve the synthetic API error if this result omits its text.
                  lastFailureText = typeof (message as { result?: unknown }).result === "string" ? (message as { result: string }).result : lastFailureText;
                  resumeFailed(current);
                  callTurn.reject(new Error("Claude SDK 本轮返回失败结果"));
                  closeEngine(current);
                } else if (current.pendingInputs.has(callTurn.sdkUuid)) {
                  callTurn.reject(new Error("Claude 原生输入轮次关联未确认，未执行工具"));
                  closeEngine(current);
                } else if (current.resumeId && message.session_id !== current.resumeId) {
                  resumeFailed(current);
                  callTurn.reject(new Error("Claude SDK 未确认请求的原生会话 ID，恢复失败"));
                  closeEngine(current);
                } else {
                  nativeId = message.session_id;
                  if (current.resumeId) { contextSource = "resumed"; warning = undefined; current.resumeId = undefined; }
                  callTurn.resolve();
                }
              }
            }
            if (!current.closed && active) active.reject(new Error("Claude SDK 事件流结束，未返回当前轮结果"));
          } catch (error) {
            if (!current.closed) {
              lastFailureText ??= error instanceof Error ? error.message : String(error);
              resumeFailed(current);
              active?.reject(safeFailure(error));
            }
          } finally { closeEngine(current); }
        })();
        return current;
      };

      return {
        runtime: "claude", roleId: role.id,
        get contextSource() { return contextSource; },
        get nativeSessionId() { return nativeId; },
        get contextWarning() { return warning; },
        async prompt(text: string, promptOptions?: PromptOptions) {
          if (disposed) throw new Error("Claude 会话已关闭");
          if (active) throw new Error("Claude 上一轮仍在运行");
          let resolve!: () => void;
          let reject!: (error: Error) => void;
          const done = new Promise<void>((pass, fail) => { resolve = pass; reject = fail; });
          // Observe rejection even if construction/abort fails before waitForTurn starts.
          void done.catch(() => {});
          const turn: Turn = { id: options.currentTurnId() ?? randomUUID(), sdkUuid: randomUUID(), controller: new AbortController(), done, resolve, reject, replayUnsafe: false };
          active = turn;
          lastFailureText = undefined;
          promptStartedAt = Date.now();
          requestAttempt = 0;
          let outcome: RuntimeTurnOutcome = "completed";
          let failure: Error | undefined;
          let compatibleAttempt = reasoningCompatible;
          try {
            const images = promptOptions?.images ?? [];
            if (images.some((image) => !isClaudeImageMimeType(image.mimeType))) throw new Error("Claude 不支持此输入图片类型");
            if (!reasoningConfigReported) {
              emitReasoningSystem(turn, "configured", `本会话向 Claude SDK 请求的思考配置：${options.reasoningEffort ?? "SDK 默认"}；模型可能忽略或限制档位，服务端实际采纳未验证。`);
              reasoningConfigReported = true;
            }
            // One compatibility attempt per prompt, before output/tool work. SDK retries remain
            // its own responsibility. Each attempt has a separate completion promise.
            for (;;) {
              let attemptResolve!: () => void;
              let attemptReject!: (error: Error) => void;
              const attemptDone = new Promise<void>((pass, fail) => { attemptResolve = pass; attemptReject = fail; });
              void attemptDone.catch(() => {});
              turn.done = attemptDone; turn.resolve = attemptResolve; turn.reject = attemptReject;
              lastFailureText = undefined;
              try {
                const start = startEngine(turn, compatibleAttempt);
                const current = await waitForTurn(start, turn.controller.signal, options.constructTimeoutMs ?? 30000, options.interactionGate);
                if (!current.statusReported) { current.statusReported = true; await reportInstalledServerStatus(current, turn); }
                current.pendingInputs.set(turn.sdkUuid, turn);
                const wireText = `[ANS_INPUT_CONTEXT:${turn.sdkUuid}]\n${text}`;
                current.input.push({ type: "user", uuid: turn.sdkUuid, session_id: nativeId ?? "", parent_tool_use_id: null, message: {
                  role: "user", content: images.length ? [{ type: "text", text: wireText }, ...images.map((image) => ({ type: "image" as const, source: { type: "base64" as const, media_type: image.mimeType as ClaudeImageMimeType, data: image.data } }))] : wireText,
                } });
                // P1：输入已交给模型 ⇒ 起请求级 deadline（首字节 90s → 流空闲 300s；测试注入小值）。
                // 交互闸等待、工具执行、abort 清理期间 pause；超时以 RequestTimeoutError 结束本次尝试
                // （终态 failed + errorCode；不是最后兜底 timed_out）。
                requestAttempt += 1;
                stopRequestDeadline();
                const deadline = createRequestDeadline({
                  firstByteTimeoutMs: requestFirstByteTimeoutMs,
                  idleTimeoutMs: requestIdleTimeoutMs,
                  onTimeout: (kind, timeoutMs, elapsedMs) => {
                    if (turn.controller.signal.aborted || disposed) return;
                    const timeoutFailure = createRequestTimeoutFailure(kind, timeoutMs, elapsedMs, requestAttempt, turn.replayUnsafe);
                    diagnostics.record("request.timeout", {
                      turnId: turn.id, attempt: requestAttempt, mode: kind, timeoutMs,
                      durationMs: Math.max(0, Math.round(elapsedMs)), replayPlan: turn.replayUnsafe ? "unsafe" : "safe",
                    });
                    turn.reject(timeoutFailure);
                  },
                });
                requestDeadline = deadline;
                if (options.interactionGate) {
                  const gate = options.interactionGate;
                  if (gate.isWaiting()) deadline.pause();
                  requestGateUnsubscribe = gate.onChange((waiting) => { if (waiting) deadline.pause(); else deadline.resume(); });
                }
                // P2：网络状态订阅绑定到本次 attempt 的 deadline（当前已离线则先 pause 再 start）。
                startNetworkWatch(turn);
                const onTurnAbort = () => stopRequestDeadline();
                turn.controller.signal.addEventListener("abort", onTurnAbort, { once: true });
                requestAbortUnsubscribe = () => turn.controller.signal.removeEventListener("abort", onTurnAbort);
                diagnostics.record("request.attempt.start", {
                  turnId: turn.id, attempt: requestAttempt, timeoutMs: requestFirstByteTimeoutMs,
                  durationMs: requestIdleTimeoutMs, mode: "claude",
                });
                deadline.start();
                try {
                  await waitForTurn(attemptDone.then(() => current.toolTail), turn.controller.signal, turnLastResortMs, options.interactionGate);
                } catch (error) {
                  // waitForTurn's own deadline is the only untagged TimeoutError here; tag it so
                  // the error/terminal text names the last resort (inspect deadlines never abort).
                  throw isTurnLastResortError(error) ? error : error instanceof Error && error.name === "TimeoutError" ? turnLastResortError(turnLastResortMs) : error;
                }
                stopRequestDeadline();
                if (turn.controller.signal.aborted) throw abortError();
                if (compatibleAttempt && !reasoningCompatible) {
                  reasoningCompatible = true;
                  emitReasoningSystem(turn, "compatible", "本会话已使用兼容请求完成，后续沿用该方式；已保存设置不变，修改设置并重建会话后重新尝试。");
                }
                break;
              } catch (error) {
                stopRequestDeadline();
                if (!turn.controller.signal.aborted && !(error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) && !teardownError && !compatibleAttempt && !turn.replayUnsafe && isReasoningRejection(lastFailureText)) {
                  compatibleAttempt = true;
                  if (engine) closeEngine(engine);
                  emitReasoningSystem(turn, "trying", "接口拒绝了本次思考参数，正在按兼容方式继续；已保存设置不变。");
                  continue;
                }
                throw error;
              }
            }
          } catch (error) {
            failure = safeFailure(error);
            outcome = failure.name === "TimeoutError" ? "timed_out" : turn.controller.signal.aborted || failure.name === "AbortError" ? "aborted" : "failed";
            if (outcome === "failed") {
              // P1：请求失败结构化事实——请求超时保留自身 code；P2 网络离线超窗保留
              // `network-offline-timeout`；其余请求级失败标记 MODEL_REQUEST_FAILED。
              // code/attempts/replaySafe 随错误上抛，由 Service 写入 settled.detail（客户文案仍为人话）。
              const tagged = failure as Error & { code?: string; attempts?: number; replaySafe?: boolean };
              if (!isRequestTimeoutFailure(failure) && !isNetworkOfflineFailure(failure)) tagged.code = MODEL_REQUEST_FAILED;
              else if (typeof tagged.code !== "string") tagged.code = MODEL_REQUEST_FAILED;
              tagged.attempts = Math.max(1, requestAttempt);
              tagged.replaySafe = turn.replayUnsafe;
              diagnostics.record("request.failed", {
                turnId: turn.id,
                errorCode: tagged.code,
                attempt: tagged.attempts,
                durationMs: Math.max(0, Date.now() - promptStartedAt),
                replayPlan: turn.replayUnsafe ? "unsafe" : "safe",
              });
            }
            turn.controller.abort();
            if (engine) closeEngine(engine);
            if (!storage && nativeId) { nativeId = undefined; contextSource = "in-memory"; warning = "Claude 活会话已中断；下一条输入将新建上下文。"; }
          } finally {
            stopRequestDeadline();
            turn.controller.abort();
            if (engine) for (const [token, context] of engine.contexts) if (context.turn === turn) engine.contexts.delete(token);
            if (engine) for (const [id, call] of engine.nativeCalls) if (call.turn === turn) engine.nativeCalls.delete(id);
            engine?.pendingInputs.delete(turn.sdkUuid);
            if (active === turn) active = undefined;
            const settledSummary = outcome === "timed_out" && isTurnLastResortError(failure)
              ? `Claude 本轮超过最后兜底（${turnLastResortMs}ms），已中止`
              : `Claude 本轮${outcome}`;
            emit(turn, "settled", settledSummary, { outcome, turnId: turn.id, ...(teardownError ? { cleanupError: teardownError.message } : {}) });
          }
          if (failure) throw failure;
        },
        events: () => events.stream(),
        async abort() {
          const turn = active;
          if (!turn) return;
          turn.controller.abort();
          const current = engine;
          if (!current) return;
          let timer: ReturnType<typeof setTimeout> | undefined;
          let interruptFailure: { error: unknown } | undefined;
          try {
            await Promise.race([current.query.interrupt(), new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000); timer.unref(); })]);
          } catch (error) {
            // "Query closed before response received" means the query is already gone, so the stop
            // already took effect; that is not an interrupt/cleanup failure. Every other rejection
            // still surfaces after teardown below.
            interruptFailure = { error };
          } finally { if (timer) clearTimeout(timer); closeEngine(current); }
          // A real teardown failure must never be swallowed — it wins over the interrupt rejection.
          if (teardownError) throw teardownError;
          if (interruptFailure && !isQueryClosedError(interruptFailure.error)) throw interruptFailure.error;
        },
        async dispose() {
          if (disposed) return;
          disposed = true;
          active?.controller.abort();
          if (engine) closeEngine(engine);
          events.close();
          if (temporaryDirectory) { await rm(temporaryDirectory, { recursive: true, force: true }); temporaryDirectory = undefined; }
          if (teardownError) throw teardownError;
        },
      };
    },
  };
}

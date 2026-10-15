// Claude Provider public entry. Infrastructure stays here; common contains pure/framework helpers.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as SDK from "@anthropic-ai/claude-agent-sdk";
import type * as Zod from "zod";
import type { ResolvedRole } from "../../model/role.ts";
import type { RuntimeAdapter, RuntimeProviderOptions, RoleSession, SessionEvent, RuntimeTurnOutcome, PromptOptions, RuntimeToolEventFactsV1 } from "../../model/runtime.ts";
import { RUNTIME_CREDENTIAL_ENV_VARS } from "../../common/shared/runtime-shared.ts";
import { toClaudeSchema } from "../../common/claude-adapter/schema.ts";
import { abortError, createQueue, waitForTurn } from "../../common/claude-adapter/lifecycle.ts";

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
};
type Engine = {
  query: SDK.Query;
  input: ReturnType<typeof createQueue<SDK.SDKUserMessage>>;
  controller: AbortController;
  closed: boolean;
  resumeId?: string;
  toolTail: Promise<void>;
  contexts: Map<string, { turn: Turn; toolName: string; toolUseId: string; signal: AbortSignal }>;
  nativeTurns: Map<string, { turn: Turn; signal: AbortSignal }>;
  pendingInputs: Map<string, Turn>;
};
// MCP has a hard upstream ceiling; max Node timer buys ~24.8 days, never infinity.
const MCP_TOOL_TIMEOUT_MS = 2_147_483_647;
const CALL_CONTEXT_ARG = "__ans_call_context";
const INPUT_CONTEXT_PREFIX = /^\[ANS_INPUT_CONTEXT:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]\n/;

export function createClaudeRuntimeAdapter(options: RuntimeProviderOptions, dependencies: ClaudeAdapterDependencies = {}): RuntimeAdapter {
  if (options.runtime !== "claude") throw new Error("Claude 适配器只接受 runtime=claude");
  if (options.toolDisplayMode === "required-v1" && (typeof options.projectToolEvent !== "function" || typeof options.registerToolDisplayProfile !== "function")) {
    throw new Error("Claude required-v1 工具展示缺少 projector/register 能力");
  }
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
  const systemPrompt = (role: ResolvedRole) => [
    role.cardText,
    `你始终绑定角色 ${role.id}。只能通过 mcp__ans__ 工具操作环境；所有写入、shell 和交互由 ANS 的注入能力判断。`,
    `当前角色边界：${JSON.stringify(role.boundary)}`,
    ...options.tools.flatMap((tool) => tool.promptGuidelines ?? []),
  ].join("\n\n");

  return {
    async composeContext(role) { return { systemPrompt: systemPrompt(role) }; },
    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      options.registerToolDisplayProfile?.({
        apiKeyEnvVar: credentialName,
        credentials: [...new Set([credentialName, ...(options.toolDisplayCredentialEnvNames ?? [])])]
          .map((name) => ({ name, value: env[name] })),
      });
      const storage = options.storage;
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
      let temporaryDirectory: string | undefined;
      let teardownError: Error | undefined;
      const events = createQueue<SessionEvent>();
      const emit = (turn: Turn, kind: SessionEvent["kind"], summary: string, detail?: unknown) => {
        if (turn.controller.signal.aborted && kind !== "settled") return;
        events.push({ runtime: "claude", roleId: role.id, turnId: turn.id, kind, summary: redact(summary), detail });
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
      const safeFailure = (error: unknown) => error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
        ? error : new Error(`Claude SDK 运行失败：${redact(error instanceof Error ? error.message : String(error))}`);
      const closeEngine = (current: Engine) => {
        if (current.closed) return;
        current.closed = true;
        current.contexts.clear();
        current.nativeTurns.clear();
        current.pendingInputs.clear();
        current.controller.abort();
        current.input.close();
        if (engine === current) engine = undefined;
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
      const startEngine = async (turn: Turn): Promise<Engine> => {
        if (engine && !engine.closed) return engine;
        teardownError = undefined;
        if (!storage && nativeId) { nativeId = undefined; warning = "Claude 活会话已中断；下一条输入将新建上下文。"; }
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
        const current: Engine = { query: undefined as unknown as SDK.Query, input, controller, closed: false, resumeId: nativeId, toolTail: Promise.resolve(), contexts: new Map(), nativeTurns: new Map(), pendingInputs: new Map() };
        for (const tool of options.tools) {
          const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
          if (Object.hasOwn(properties, CALL_CONTEXT_ARG)) throw new Error("Claude ANS 工具 schema 包含保留的请求上下文字段");
          server.instance.registerTool(tool.name, {
            description: tool.description,
            inputSchema: toClaudeSchema({ ...tool.inputSchema, properties: { ...properties, [CALL_CONTEXT_ARG]: { type: "string", description: "Internal ANS context assigned by the host; omit this field." } } }, z),
            annotations: { readOnlyHint: tool.name === "read_file", destructiveHint: tool.name !== "read_file", openWorldHint: tool.name === "run_shell" },
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
              const facts = { toolCallId, toolName: tool.name, input: { rule: tool.displayInputRule, args: publicArgs } };
              emitTool(callTurn, { ...facts, phase: "start", origin: "handler-start" }, "tool_call", tool.name);
              try {
                const result = await tool.handler({ name: tool.name, args: publicArgs, signal, toolCallId });
                if (signal.aborted || current.closed) return { content: [{ type: "text" as const, text: "本轮已中止，工具结果已丢弃" }], isError: true };
                const message = redact(result.message);
                emitTool(callTurn, { ...facts, phase: "result", origin: "handler-result", result }, result.ok ? "accepted" : "denied", message);
                return { content: [{ type: "text" as const, text: message }], isError: !result.ok };
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
        const queryOptions: SDK.Options = {
          cwd: options.projectRoot, systemPrompt: systemPrompt(role),
          tools: [], allowedTools: [...names], settingSources: [], strictMcpConfig: true,
          skills: [], plugins: [], settings: { disableAllHooks: true }, extraArgs: { "disable-slash-commands": null },
          mcpServers: { ans: server }, env: childEnv, abortController: controller,
          persistSession: !!storage, ...(nativeId ? { resume: nativeId } : {}),
          ...(options.modelId?.trim() || env.ANS_CLAUDE_MODEL?.trim() ? { model: options.modelId?.trim() || env.ANS_CLAUDE_MODEL?.trim() } : {}),
          canUseTool: async () => ({ behavior: "deny", message: "仅允许已注册且预批准的 ANS MCP 工具" }),
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
            if (names.has(hook.tool_name) && hook.mcp_server?.name === "ans" && hook.mcp_server.source === "sdk" && originalTurn && originalTurn === active && !originalTurn.controller.signal.aborted && !original!.signal.aborted && !controller.signal.aborted && !hookOptions.signal.aborted && hook.tool_input && typeof hook.tool_input === "object" && !Array.isArray(hook.tool_input)) {
              const token = randomUUID();
              current.contexts.set(token, { turn: originalTurn, toolName: hook.tool_name.slice("mcp__ans__".length), toolUseId: hook.tool_use_id, signal: AbortSignal.any([original!.signal, hookOptions.signal]) });
              return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...hook.tool_input as Record<string, unknown>, [CALL_CONTEXT_ARG]: token } } };
            }
            if (originalTurn) {
              const tool = options.tools.find((candidate) => `mcp__ans__${candidate.name}` === hook.tool_name);
              emitTool(originalTurn, { origin: "governance-hook", phase: "blocked", toolName: tool?.name ?? hook.tool_name,
                toolCallId: `${originalTurn.id}:${hook.tool_use_id}`,
                result: { ok: false, message: "拒绝非 ANS 工具或已中止轮次的调用" } }, "denied", "拒绝非 ANS 工具或已中止轮次的调用");
            } else emitUnattributed();
            return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "仅允许当前轮注册的 ANS MCP 工具" } };
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
              if (message.type === "assistant") {
                for (const block of message.message.content) if (block.type === "text") emit(callTurn, "message", block.text);
              } else if (message.type === "result") {
                if (message.user_message_uuid && message.user_message_uuid !== callTurn.sdkUuid && !message.user_message_uuids?.includes(callTurn.sdkUuid)) continue;
                if (message.subtype !== "success" || message.is_error) {
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
            if (!current.closed) { resumeFailed(current); active?.reject(safeFailure(error)); }
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
          const turn: Turn = { id: options.currentTurnId() ?? randomUUID(), sdkUuid: randomUUID(), controller: new AbortController(), done, resolve, reject };
          active = turn;
          let outcome: RuntimeTurnOutcome = "completed";
          let failure: Error | undefined;
          try {
            const start = startEngine(turn);
            const current = await waitForTurn(start, turn.controller.signal, options.constructTimeoutMs ?? 30000, options.interactionGate);
            const images = promptOptions?.images ?? [];
            if (images.some((image) => !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(image.mimeType))) throw new Error("Claude 不支持此输入图片类型");
            current.pendingInputs.set(turn.sdkUuid, turn);
            const wireText = `[ANS_INPUT_CONTEXT:${turn.sdkUuid}]\n${text}`;
            current.input.push({ type: "user", uuid: turn.sdkUuid, session_id: nativeId ?? "", parent_tool_use_id: null, message: {
              role: "user", content: images.length ? [{ type: "text", text: wireText }, ...images.map((image) => ({ type: "image" as const, source: { type: "base64" as const, media_type: image.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: image.data } }))] : wireText,
            } });
            await waitForTurn(done.then(() => current.toolTail), turn.controller.signal, options.promptTimeoutMs ?? 120000, options.interactionGate);
          } catch (error) {
            failure = safeFailure(error);
            outcome = failure.name === "TimeoutError" ? "timed_out" : turn.controller.signal.aborted || failure.name === "AbortError" ? "aborted" : "failed";
            turn.controller.abort();
            if (engine) closeEngine(engine);
            if (!storage && nativeId) { nativeId = undefined; contextSource = "in-memory"; warning = "Claude 活会话已中断；下一条输入将新建上下文。"; }
          } finally {
            turn.controller.abort();
            if (engine) for (const [token, context] of engine.contexts) if (context.turn === turn) engine.contexts.delete(token);
            engine?.pendingInputs.delete(turn.sdkUuid);
            if (active === turn) active = undefined;
            emit(turn, "settled", `Claude 本轮${outcome}`, { outcome, turnId: turn.id, ...(teardownError ? { cleanupError: teardownError.message } : {}) });
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
          try {
            await Promise.race([current.query.interrupt(), new Promise<void>((resolve) => { timer = setTimeout(resolve, 1000); timer.unref(); })]);
          } finally { if (timer) clearTimeout(timer); closeEngine(current); }
          if (teardownError) throw teardownError;
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

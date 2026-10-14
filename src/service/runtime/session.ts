// Public Service composition entry. Pipeline selects runtime and injects policy; Providers execute it.
import { randomUUID } from "node:crypto";
import type { ResolvedRole } from "../../model/role.ts";
import type {
  GovernedToolsOptions, PromptOptions, RoleSession, RuntimeAdapter, RuntimeKind, RuntimeProviderFactory,
  RuntimeProviderOptions, RuntimeReplayEntry, RuntimeSessionRecord, RuntimeTurnOutcome, SessionEvent, ToolCall, WriteGate,
} from "../../model/runtime.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import { buildGovernedTools, createDemoRuntimeAdapter } from "../../provider/runtime/tools.ts";
import { createRuntimeSessionStore, readRuntimeSessionHistory as readStoredRuntimeSessionHistory } from "../../provider/runtime/session-store.ts";
import { createEventQueue } from "../../common/runtime-core/event-queue.ts";
import { createInteractionGate, isAbortError, isTimeoutError, raceAbort, resolveRuntimeTimeouts, withPausableTimeout, withTimeout } from "../../common/runtime-core/timeout.ts";

export interface RuntimeSessionOptions extends Omit<GovernedToolsOptions, "currentTurnId" | "roleId" | "runtime" | "interactionGate"> {
  runtime: RuntimeKind;
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
  /** No persistence unless explicitly enabled; no eager .ans creation. */
  persistSession?: boolean;
  providerFactories?: Partial<Record<RuntimeKind, RuntimeProviderFactory>>;
  modelId?: string;
  baseUrl?: string;
  providerId?: string;
  apiKeyEnvVar?: string;
  promptTimeoutMs?: number;
  constructTimeoutMs?: number;
  /** Demo-only script; no SDK and no fallback for another runtime. */
  script?: ToolCall[];
}

/** Pipeline-facing history operation. ANS replay never establishes native model restoration. */
export async function readRuntimeSessionHistory(options: {
  projectRoot: string; roleId: string; runtime: RuntimeKind;
}): Promise<{ record?: RuntimeSessionRecord; entries: RuntimeReplayEntry[] }> {
  return readStoredRuntimeSessionHistory(options);
}

async function defaultFactory(runtime: RuntimeKind): Promise<RuntimeProviderFactory> {
  if (runtime === "demo") return (options) => createDemoRuntimeAdapter(options);
  // Variable imports keep absent SDK adapters lazy during staged assembly.
  const modulePath = `../../provider/${runtime}/session.ts`;
  const module = await import(modulePath) as Record<string, unknown>;
  const name = runtime === "pi" ? "createPiRuntimeAdapter" : runtime === "codex" ? "createCodexRuntimeAdapter" : "createClaudeRuntimeAdapter";
  const factory = module[name];
  if (typeof factory !== "function") throw new Error(`${runtime} 提供方缺少公开工厂 ${name}`);
  return factory as RuntimeProviderFactory;
}


export function createRuntimeAdapter(options: RuntimeSessionOptions): RuntimeAdapter {
  if (!(RUNTIME_KINDS as readonly string[]).includes(options.runtime)) throw new Error(`未知运行时：${options.runtime}`);
  const providers = new Map<ResolvedRole, Promise<{
    adapter: RuntimeAdapter; options: RuntimeProviderOptions; setTurn(id?: string, controller?: AbortController): void;
  }>>();
  const providerFor = (role: ResolvedRole) => {
    let provider = providers.get(role);
    if (provider) return provider;
    provider = (async () => {
      let turnId: string | undefined;
      let controller: AbortController | undefined;
      const interactionGate = createInteractionGate();
      const storage = options.persistSession ? createRuntimeSessionStore({ projectRoot: options.projectRoot, roleId: role.id, runtime: options.runtime }) : undefined;
      const tools = buildGovernedTools(options.gate, {
        ...options,
        readRoot: options.readRoot ?? options.projectRoot,
        writeRoot: options.writeRoot,
        shellCwd: options.shellCwd ?? options.projectRoot,
        extraCredentialEnvVars: [...(options.extraCredentialEnvVars ?? []), ...(options.apiKeyEnvVar ? [options.apiKeyEnvVar] : [])],
        roleId: role.id,
        currentTurnId: () => turnId,
        interactionGate,
      }).map((tool) => ({ ...tool, async handler(call: Parameters<typeof tool.handler>[0]) {
        const signal = controller?.signal;
        if (turnId === undefined || signal?.aborted) return { ok: false, message: `${tool.name}：本轮未运行或已中止，未执行` };
        return tool.handler({ ...call, signal: signal && call.signal ? AbortSignal.any([signal, call.signal]) : signal ?? call.signal });
      } }));
      const providerOptions: RuntimeProviderOptions = {
        runtime: options.runtime, projectRoot: options.projectRoot, skillRoot: options.skillRoot,
        tools, storage, interactionGate, currentTurnId: () => turnId,
        modelId: options.modelId, baseUrl: options.baseUrl, providerId: options.providerId, apiKeyEnvVar: options.apiKeyEnvVar,
        ...resolveRuntimeTimeouts(options.runtime, options),
      };
      const factory = options.providerFactories?.[options.runtime] ?? (options.runtime === "demo"
        ? ((input: RuntimeProviderOptions) => createDemoRuntimeAdapter(input, options.script ?? [{ name: "write_file", args: { path: "src/evil.ts", content: "// 越界写入示例\n" } }]))
        : await defaultFactory(options.runtime));
      const adapter = await factory(providerOptions);
      return { adapter, options: providerOptions, setTurn(id?: string, nextController?: AbortController) { turnId = id; controller = nextController; } };
    })();
    providers.set(role, provider);
    return provider;
  };
  return {
    async composeContext(role) { return (await providerFor(role)).adapter.composeContext(role); },
    async bindRole(role) {
      const provider = await providerFor(role);
      const storage = provider.options.storage;
      const previous = await storage?.readLatest();
      const inner = await withTimeout(provider.adapter.bindRole(role), provider.options.constructTimeoutMs ?? 120000, `${options.runtime} 建立角色会话`);
      providers.delete(role); // Each bound session owns its own turn/controller/tool closure.
      const queue = createEventQueue<SessionEvent>();
      const recordId = previous?.id ?? randomUUID();
      const createdAt = previous?.createdAt ?? new Date().toISOString();
      type Turn = { id: string; controller: AbortController; outcome: RuntimeTurnOutcome; outcomeLocked?: boolean; terminal: () => void; terminalPromise: Promise<void>; abortPromise?: Promise<void>; cleanupFailed?: boolean };
      let active: Turn | undefined;
      let disposed = false;
      let quarantined = false;
      let streamEnded = false;
      let pendingPersist = Promise.resolve();
      let persistenceError: unknown;
      const requestAbort = (turn: Turn): Promise<void> => {
        if (!turn.abortPromise) {
          turn.abortPromise = withTimeout(Promise.resolve().then(() => inner.abort?.()), 1000, "中止清理").catch((error) => {
            turn.cleanupFailed = true;
            quarantined = true;
            throw error;
          });
        }
        return turn.abortPromise;
      };
      const emit = (event: SessionEvent) => {
        queue.push(event);
        if (storage) pendingPersist = pendingPersist.then(() => storage.appendReplay([{ at: new Date().toISOString(), kind: "event", event, turnId: event.turnId }])).catch((error) => { persistenceError = error; });
      };
      const pump = (async () => {
        try {
          for await (const event of inner.events()) {
            const turn = active;
            if (!turn || (event.turnId && event.turnId !== turn.id)) continue;
            if (event.kind === "settled") {
              const outcome = (event.detail as { outcome?: unknown } | undefined)?.outcome;
              if (!turn.outcomeLocked && ["failed", "aborted", "timed_out"].includes(String(outcome))) turn.outcome = outcome as RuntimeTurnOutcome;
              turn.terminal();
            } else emit({ ...event, runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: {
              ...(event.detail && typeof event.detail === "object" && !Array.isArray(event.detail) ? event.detail as Record<string, unknown> : event.detail === undefined ? {} : { value: event.detail }),
              turnId: turn.id,
            } });
          }
        } catch (error) {
          if (active) {
            if (!active.outcomeLocked) active.outcome = "failed";
            emit({ kind: "denied", summary: `事件流失败：${error instanceof Error ? error.message : String(error)}`, runtime: options.runtime, roleId: role.id, turnId: active.id });
          }
        } finally { streamEnded = true; active?.terminal(); }
      })();
      const wrapper: RoleSession = {
        runtime: options.runtime, roleId: role.id,
        get contextSource() { return inner.contextSource ?? (storage ? "fresh" : "in-memory"); },
        get nativeSessionId() { return inner.nativeSessionId; },
        get contextWarning() { return inner.contextWarning; },
        async prompt(text: string, promptOptions?: PromptOptions) {
          if (disposed) throw new Error("会话已关闭");
          if (active || quarantined) throw new Error("上一轮仍在运行或中止清理中");
          let terminal!: () => void;
          const terminalPromise = new Promise<void>((resolve) => { terminal = resolve; });
          const turn: Turn = { id: randomUUID(), controller: new AbortController(), outcome: "completed", terminal, terminalPromise };
          active = turn;
          provider.setTurn(turn.id, turn.controller);
          let underlyingFinished = false;
          let failure: unknown;
          let underlying: Promise<void> | undefined;
          try {
            promptOptions?.onTurnStarted?.({ turnId: turn.id, roleId: role.id, runtime: options.runtime });
            await storage?.appendReplay([{ at: new Date().toISOString(), kind: "user", text, turnId: turn.id }]);
            // A previously reported transient error is cleared after a real successful retry.
            persistenceError = undefined;
            if (turn.controller.signal.aborted) throw new Error("会话已中止");
            underlying = Promise.resolve().then(() => inner.prompt(text, promptOptions));
            underlying.then(() => { underlyingFinished = true; if (!turn.cleanupFailed) quarantined = false; }, () => { underlyingFinished = true; if (!turn.cleanupFailed) quarantined = false; });
            const work = underlying.then(async () => { if (!streamEnded) await terminalPromise; });
            await withPausableTimeout(raceAbort(work, turn.controller.signal, "本轮运行"), provider.options.promptTimeoutMs ?? 120000, `${options.runtime} 运行`, provider.options.interactionGate);
          } catch (error) {
            failure = error;
            turn.outcome = isTimeoutError(error) ? "timed_out" : turn.controller.signal.aborted || isAbortError(error) ? "aborted" : "failed";
            turn.outcomeLocked = true;
            turn.controller.abort();
            if (inner.abort && underlying !== undefined && !underlyingFinished) {
              try { await requestAbort(turn); }
              catch (abortError) { emit({ kind: "denied", summary: `中止清理失败：${abortError instanceof Error ? abortError.message : String(abortError)}`, runtime: options.runtime, roleId: role.id, turnId: turn.id }); }
            }
            quarantined = turn.cleanupFailed === true || (underlying !== undefined && !underlyingFinished);
          } finally {
            active = undefined;
            provider.setTurn();
            const event: SessionEvent = { kind: "settled", summary: turn.outcome === "completed" ? "会话结束" : turn.outcome === "aborted" ? "本轮已中止" : turn.outcome === "timed_out" ? "本轮运行超时" : "本轮运行失败", runtime: options.runtime, roleId: role.id, turnId: turn.id, detail: { turnId: turn.id, outcome: turn.outcome } };
            emit(event);
            await pendingPersist;
            if (storage && !persistenceError) {
              const record: RuntimeSessionRecord = { version: 1, id: recordId, roleId: role.id, runtime: options.runtime, contextSource: wrapper.contextSource ?? "fresh", nativeSessionId: wrapper.nativeSessionId, contextWarning: wrapper.contextWarning, createdAt, updatedAt: new Date().toISOString() };
              try { await storage.saveSession(record); } catch (error) { persistenceError = error; }
            }
          }
          if (persistenceError) throw persistenceError;
          if (failure) throw failure;
        },
        events: () => queue.stream,
        ...(inner.abort ? { async abort() {
          if (!active) return;
          const turn = active;
          turn.controller.abort();
          await requestAbort(turn);
        } } : {}),
        async dispose() {
          if (disposed) return;
          disposed = true;
          active?.controller.abort();
          try { await withTimeout(inner.dispose(), 1000, "关闭会话"); }
          finally { queue.close(); }
          await pendingPersist;
          void pump;
        },
      };
      return wrapper;
    },
  };
}

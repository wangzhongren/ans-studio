// 真实 Pi 运行时适配器实现（契约 §4 / 附录 A）。
//
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
//
// 这是本角色**唯一**允许 import Pi 包的地方，且全部经**动态 import** 完成——
// 上层 src/provider/pi/session.ts 只在 createPiRuntimeAdapter 的方法被调用时才懒加载本模块。
//
// 依据（附录 A，来自实际包产物 dist/*.d.ts / *.js，非文档转述）：
// - createAgentSession(options) → { session, extensionsResult, modelFallbackMessage? }（dist/core/sdk.d.ts）
//   - noTools: "builtin" 关掉内置 read/bash/edit/write，保留 extension/custom 工具；
//   - customTools?: ToolDefinition[] 注册自定义工具；
//   - model?: Model、modelRuntime?: ModelRuntime：显式注入模型与运行时（sdk.js:72 起）。
// - 拦截经「扩展（extension）」：pi.on("tool_call", handler) → ToolCallEventResult {block, reason, terminate}
//   （dist/core/extensions/types.d.ts:1200 / :1065）。处理器出错 → 工具在执行前被阻断（fail-closed，
//   dist/core/agent-session.js:327-347）。
// - 内联扩展经 DefaultResourceLoader({ extensionFactories: [...] }) 注入（dist/core/resource-loader.d.ts:79）。
//   注意：传入自定义 resourceLoader 时 SDK 不会替你 reload（sdk.js:78-80），必须显式 reload。
//
// 显式 provider（方案 b）：不再依赖 ~/.pi/agent/ 的全局模型/凭据配置。
//   - 用 pi-ai 的 createProvider 构造 provider：baseUrl / api / auth 由我们显式指定；
//   - model 由 anthropic-messages 模板克隆并改写 id/baseUrl/provider；
//   - ModelRuntime.create({ credentials: InMemoryCredentialStore }) —— 凭据仅在内存，绝不落文件；
//   - registerNativeProvider 后 getModel，并把 model + modelRuntime 交给 createAgentSession。
//   认证沿用 anthropic provider 的 resolve（读 ANTHROPIC_AUTH_TOKEN → Authorization: Bearer）。
//
// ⚠️ 命名陷阱（附录 A）：Pi 自带的 BoundaryState / BoundaryResult 指**会话上下文/压缩边界**，
//    与本项目角色边界无关，本文件**不使用**它们、也不据此改动任何边界类型。

import type { ResolvedRole } from "../../model/role.ts";
import type { WriteGate, RoleSession, RuntimeAdapter, SessionEvent, ShellGate, FinalizeBootstrapFn } from "../../provider/pi/session.ts";
import { buildGovernedTools, SHELL_TOOL_NAME, shellKillSwitch } from "../../provider/pi/tools.ts";
import { formatDenialMessage } from "./format-denial.ts";
import { createEventQueue } from "./event-queue.ts";
import { resolvePiProviderConfig, type PiProviderConfig, type PiProviderConfigInput } from "./provider-config.ts";
import { ANS_SETTINGS_OVERRIDES } from "./settings.ts";
import { createStageLogger, type StageLogger } from "./logger.ts";
import {
  CONSTRUCT_TIMEOUT_ENV,
  DEFAULT_CONSTRUCT_TIMEOUT_MS,
  DEFAULT_PROMPT_TIMEOUT_MS,
  PROMPT_TIMEOUT_ENV,
  readTimeoutMs,
  withTimeout,
} from "./timeout.ts";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ModelRuntime,
  SettingsManager,
  ToolCallEvent,
  ToolCallEventResult,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

// —————————————————————— Pi 包动态加载 ——————————————————————

/** 动态加载 Pi 主包（不缓存也无妨，Node 模块缓存已足够）。 */
async function loadPi(): Promise<typeof import("@earendil-works/pi-coding-agent")> {
  return import("@earendil-works/pi-coding-agent");
}

// —————————————————————— 显式 provider 构造（方案 b） ——————————————————————

/**
 * 用显式配置构造 provider 与 model，塞进一个使用**内存凭据存储**的 ModelRuntime。
 * 任一环节都不能回落到默认端点：最终模型的 baseUrl 必须恰为我们配置的值。
 */
export async function buildExplicitRuntime(
  cfg: PiProviderConfig,
): Promise<{ runtime: ModelRuntime; model: Model<Api> }> {
  const piAi = await import("@earendil-works/pi-ai");
  const { anthropicProvider } = await import("@earendil-works/pi-ai/providers/anthropic");
  const { anthropicMessagesApi } = await import("@earendil-works/pi-ai/api/anthropic-messages.lazy");
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");

  // 以 anthropic 的内置 provider 为模板：复用其 api 工厂与 auth（读 ANTHROPIC_AUTH_TOKEN）。
  const templateProvider = anthropicProvider();
  const templateModel = templateProvider.getModels()[0];
  if (templateModel === undefined) {
    throw new Error("无法取得 anthropic-messages 模板模型，无法构造显式 provider。");
  }

  // 改写模型的 id / baseUrl / provider / contextWindow，指向客户代理。
  //
  // contextWindow **必须**改写：模板是 claude 的 1,000,000，与网关上的真实模型无关。
  // 沿用模板值则 pi 的自动压缩阈值（contextWindow - reserveTokens）永远够不着，会话会先吃到
  // 服务端的超长报错，而不是优雅压缩。cfg.contextWindow 现为**必需字段**
  // （provider-config.ts 缺失即 fail-closed），故此处无条件覆盖，不再有 "template" 回落。
  const model = {
    ...templateModel,
    id: cfg.modelId,
    name: cfg.modelId,
    baseUrl: cfg.baseUrl,
    provider: cfg.providerId,
    contextWindow: cfg.contextWindow,
  };

  const provider = piAi.createProvider({
    id: cfg.providerId,
    name: `ANS gateway (${cfg.modelId})`,
    baseUrl: cfg.baseUrl,
    auth: templateProvider.auth,
    models: [model],
    api: anthropicMessagesApi(),
  });

  const runtime = await ModelRuntime.create({
    credentials: new piAi.InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  runtime.registerNativeProvider(provider);

  const selected = runtime.getModel(cfg.providerId, cfg.modelId);
  if (selected === undefined) {
    throw new Error(`provider ${cfg.providerId} 下找不到模型 ${cfg.modelId}。`);
  }

  // —— 安全护栏：在任何网络请求之前，确认 baseUrl 就是我们显式配置的那个 ——
  if (selected.baseUrl !== cfg.baseUrl) {
    throw new Error(`安全护栏：解析后的 baseUrl（${selected.baseUrl}）与配置（${cfg.baseUrl}）不一致，已中止。`);
  }
  if (/anthropic\.com/i.test(selected.baseUrl)) {
    throw new Error("安全护栏：baseUrl 指向 api.anthropic.com，已中止以避免把凭据发往默认端点。");
  }

  // —— 安全护栏：配置的 contextWindow 必须确实落到运行时模型上 ——
  if (selected.contextWindow !== cfg.contextWindow) {
    throw new Error(
      `安全护栏：配置的 contextWindow（${cfg.contextWindow}）未落到运行时模型（${String(selected.contextWindow)}），已中止。`,
    );
  }

  return { runtime, model: selected };
}

/**
 * 构造**环境封闭**的 settings manager：纯内存、不读任何文件
 * （`SettingsManager.inMemory`，settings-manager.d.ts:213；实现 settings-manager.js:251-256），
 * 只含我们显式给出的固定覆盖（见 settings.ts 的 ANS_SETTINGS_OVERRIDES）。
 *
 * 必须**同时**交给 `DefaultResourceLoader`（否则其回落 `SettingsManager.create`，
 * resource-loader.js:243）与 `createAgentSession`（否则其回落 `SettingsManager.create(cwd, agentDir)`，
 * sdk.js:76），从而彻底堵住从 `~/.pi/agent/settings.json`（或 `$PI_CODING_AGENT_DIR`）与
 * `<项目>/.pi/settings.json` 漏进设置的路径。
 */
export async function buildIsolatedSettingsManager(): Promise<SettingsManager> {
  const pi = await loadPi();
  return pi.SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
}

// —————————————————————— 路径提取 ——————————————————————

/**
 * 从工具调用参数里取出目标路径。内置 write/edit 与我们的自定义 write_file/edit_file
 * 都用 `path`（见 dist/core/tools/write.js:9、edit.js:17）；其它工具（bash/read/grep…）
 * 不含写入路径，返回 undefined 表示"不由本治理层拦截"。
 */
function extractCallPath(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const candidate = record["path"] ?? record["file_path"] ?? record["filePath"];
  return typeof candidate === "string" ? candidate : undefined;
}

// —————————————————————— 系统提示 ——————————————————————

function renderSystemPrompt(role: ResolvedRole): string {
  return [`# 角色：${role.id}`, "", role.cardText.trim(), "", "## 边界来源", role.boundarySource].join("\n");
}

// —————————————————————— 受治理工具 → Pi 自定义工具 ——————————————————————

/** 我们自己的受治理工具定义（结构等价于 tools.ts 的 ToolDefinition，含可选 toolCallId 透传）。 */
interface GovernedTool {
  name: string;
  handler(call: {
    name: string;
    args: Record<string, unknown>;
    /** 本次调用的 id（Pi 在 tool_call 时生成）；run_shell 把它透传给 ShellGate 供留痕用。 */
    toolCallId?: string;
  }): Promise<{ ok: boolean; message: string }>;
}

/**
 * 每个受治理工具的 JSON-Schema 与说明（按名分派；run_shell 的 input 是 `{command}`，**没有 path**，见 §7.7）。
 * run_shell **不接受**任何 token 参数——票据机制已废（§7.1 第 3 条），审核在 execute 内、spawn 之前完成。
 */
function describeTool(name: string): { parameters: Record<string, unknown>; description: string } {
  if (name === "run_shell") {
    return {
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to review and (only if allowed) execute" },
        },
        required: ["command"],
        additionalProperties: true,
      },
      description: "受治理的 shell 命令工具。执行前必须过 ShellGate 审核；未获明确 allow 绝不执行。",
    };
  }
  if (name === "finalize_bootstrap") {
    // 收口提议工具：**无参数**（acceptanceSource/now 由编排侧决定，模型不该提供）。
    // 说明**必须**让模型理解「提议并等待客户确认」，**不是立即完成**（设计 §13.1 / T36）。
    return {
      parameters: { type: "object", properties: {}, required: [], additionalProperties: true },
      description:
        "提议完成 bootstrap 收口：调用即向客户**提议收口并等待其确认**（**不是立即完成**——未获确认则不收口）。" +
        "仅在项目的**创世态**（尚未 bootstrap）可用；无需参数。客户确认通过后才会写出 `.ans` 的 pin 与治理边界文档。",
    };
  }
  const parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Target file path (relative or absolute)" },
      content: { type: "string", description: "Content to write (write_file)" },
      old_string: { type: "string", description: "Text to replace (edit_file)" },
      new_string: { type: "string", description: "Replacement text (edit_file)" },
    },
    required: ["path"],
    additionalProperties: true,
  };
  const description =
    name === "write_file"
      ? "受治理的文件写入工具。写入前会向门禁引擎请求判定；被拒绝时不落盘。"
      : name === "edit_file"
        ? "受治理的文件编辑工具。编辑前会向门禁引擎请求判定；被拒绝时不落盘。"
        : "读取文件内容。读取不受写边界约束（写边界只约束「能否改」，不约束「能否看」）。";
  return { parameters, description };
}

/**
 * 把受治理工具转成 Pi 的 customTools 条目。
 * - parameters 用普通 JSON-Schema 形状（不引入 TypeBox 依赖）；
 * - execute 内调用我们自己的 handler，受治理语义完全由它决定；**把 Pi 的 toolCallId 透传**给 handler
 *   （run_shell 把它交给 ShellGate 供留痕用）。
 */
function toPiTool(tool: GovernedTool): ToolDefinition {
  const { parameters, description } = describeTool(tool.name);
  return {
    name: tool.name,
    label: tool.name,
    description,
    parameters,
    async execute(toolCallId: string, args: unknown): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> {
      const record = (args !== null && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const result = await tool.handler({ name: tool.name, args: record, toolCallId });
      return { content: [{ type: "text", text: result.message }], details: undefined };
    },
  } as unknown as ToolDefinition;
}

// —————————————————————— 治理扩展（写类拦截 + shell 能力级 kill-switch） ——————————————————————

/**
 * 受写门禁约束的工具名。只有这些"写类"调用会经过 gate 拦截。
 * read_file 等**读类**调用不在其中——读不受写边界约束（见 tools.ts 的说明）。
 */
const GOVERNED_WRITE_TOOLS = new Set(["write", "edit", "write_file", "edit_file"]);

/**
 * 构造治理扩展工厂：注册 on("tool_call") 拦截，写之前调 gate，拒绝时返回 { block: true, reason }。
 * 同时把事件经 emit 推给 RoleSession.events()。
 *
 * **写类**：这是"第二层"——第一层是自定义工具自身在 execute 前调 gate；即便某次自定义工具未拦住
 * （例如被 noTools 关闭的内置 write/edit 若被其它途径启用），扩展层仍会在**执行前**阻断。
 *
 * **run_shell**：扩展层**不再是独立的第二道审**（如实标注，设计 §7.5 第 4 条）——因「唯一 shell 入口 =
 * 我们的自定义工具 run_shell」，扩展层对它只剩**能力级 kill-switch**：未 arm（未注入 ShellGate）时整只
 * `{block:true}`；**arm 了即放行、交 execute 做每调用细审**。它**不做**每调用 token 校验（票据已废，§7.1
 * 第 3 条），**绝不喂 resolveWrite**（run_shell 的 input 无 path；从命令串解析路径是启发式当判据，见 §7.7）。
 */
function buildGovernanceExtension(
  gate: WriteGate,
  emit: (event: SessionEvent) => void,
  shellArmed: boolean,
): { name: string; factory: (pi: ExtensionAPI) => void } {
  return {
    name: "ans-governance",
    factory: (pi: ExtensionAPI): void => {
      // 工具调用前的治理拦截点（唯一经文可注册的 tool_call 钩子）。
      pi.on("tool_call", (event: ToolCallEvent): ToolCallEventResult | undefined => {
        const input = (event as { input?: unknown }).input;
        const path = extractCallPath(input);
        emit({
          kind: "tool_call",
          summary: `模型请求调用 ${event.toolName}${path !== undefined ? `（目标：${path}）` : ""}`,
          detail: { toolName: event.toolName, path },
        });

        // —— run_shell：**能力级 kill-switch**（设计 §7.5 第 4 条 / §7.7）——
        // 未 arm → {block:true}；已 arm → 放行（undefined），交 execute 做每调用细审。
        // **不做每调用 token 校验、不喂 resolveWrite**（run_shell 的 input 无 path）。
        const kill = shellKillSwitch({ toolName: event.toolName, shellArmed });
        if (kill !== undefined) {
          emit({
            kind: "denied",
            summary: kill.reason,
            detail: { toolName: event.toolName, toolCallId: event.toolCallId },
          });
          return kill;
        }
        // run_shell 已 arm：直接放行（每调用保证在 execute 的审核链，不在此处）。
        if (event.toolName === SHELL_TOOL_NAME) return undefined;

        // 仅写类工具受 gate 约束；读类（read_file 等）与非路径类调用一律放行。
        if (!GOVERNED_WRITE_TOOLS.has(event.toolName)) return undefined;
        if (path === undefined) return undefined;

        const decision = gate(path);
        if (decision.allowed) return undefined;

        const reason = formatDenialMessage(decision);
        emit({ kind: "denied", summary: reason, detail: { toolName: event.toolName, path } });
        // fail-closed：写之前阻断，绝不执行。
        return { block: true, reason };
      });

      // 事件映射：执行开始/结束、消息、结束。
      pi.on("tool_execution_start", (event): void => {
        emit({ kind: "tool_call", summary: `开始执行 ${event.toolName}`, detail: event.args });
      });

      pi.on("tool_execution_end", (event): void => {
        emit({
          kind: event.isError ? "denied" : "accepted",
          summary: `${event.toolName} 执行${event.isError ? "失败" : "完成"}`,
          detail: event.result,
        });
      });

      pi.on("message_end", (event): void => {
        const text = extractMessageText(event.message);
        if (text !== undefined && text.length > 0) {
          emit({ kind: "message", summary: text });
        }
      });

      pi.on("agent_settled", (): void => {
        emit({ kind: "settled", summary: "会话结束" });
      });

      // 上下文压缩：pi 会在每轮后按阈值自动触发。原样外推，否则压缩对用户完全不可见
      // （会话看似"忘记"了前文，界面上却没有任何解释）。
      // 说明：契约 §4 的 SessionEvent.kind 是冻结集合，故这里映射为 message，不新增 kind。
      pi.on("session_before_compact", (event): void => {
        emit({
          kind: "message",
          summary: `上下文压缩开始（触发：${event.reason}）…`,
          detail: { reason: event.reason, willRetry: event.willRetry },
        });
      });

      pi.on("session_compact", (event): void => {
        const before = event.compactionEntry?.tokensBefore;
        emit({
          kind: "message",
          summary:
            `上下文压缩完成（触发：${event.reason}）` +
            (typeof before === "number" ? `：压缩前约 ${before} tokens` : ""),
          detail: { reason: event.reason, willRetry: event.willRetry, tokensBefore: before },
        });
      });

      pi.on("session_compact_failed", (event): void => {
        const why = event.aborted ? "已被中止" : event.errorMessage ?? "未知原因";
        emit({
          kind: event.aborted ? "message" : "denied",
          summary: `上下文压缩失败（触发：${event.reason}）：${why}`,
          detail: { reason: event.reason, aborted: event.aborted, errorMessage: event.errorMessage },
        });
      });
    },
  };
}

/** 从 AgentMessage 中防御性地抽取助手文本。 */
function extractMessageText(message: unknown): string | undefined {
  if (message === null || typeof message !== "object") return undefined;
  const record = message as Record<string, unknown>;
  if (record["role"] !== "assistant") return undefined;
  const content = record["content"];
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (block !== null && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (b["type"] === "text" && typeof b["text"] === "string") parts.push(b["text"]);
    }
  }
  return parts.join("");
}

// —————————————————————— 适配器本体 ——————————————————————

export interface RealPiAdapterOptions extends PiProviderConfigInput {
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
  /** shell 命令级闸（设计 §7.2）；由编排装配后注入。**缺省时 run_shell 不注册**（§7.5.1）。 */
  shellGate?: ShellGate;
  /**
   * 创世收口能力（设计 §13.1 / T36）；由编排构造、注入。**缺省时 finalize_bootstrap 不注册**
   * （同 `shellGate` 先例——能力注入决定注册；调用方只在**创世态**才注入）。
   */
  finalizeBootstrap?: FinalizeBootstrapFn;
  /** 已由 session.ts 预校验并透传的显式配置；缺省时本模块自行解析。 */
  config?: PiProviderConfig;
  /** 注入日志器（测试用）；缺省按 ANS_PI_TRACE 从 process.env 构造。 */
  logger?: StageLogger;
  /** prompt 硬超时（毫秒）；缺省读 ANS_PI_PROMPT_TIMEOUT_MS，再缺省 120000。 */
  promptTimeoutMs?: number;
  /** 构造期单步硬超时（毫秒）；缺省读 ANS_PI_CONSTRUCT_TIMEOUT_MS，再缺省 120000。 */
  constructTimeoutMs?: number;
  /** shell 审核硬超时（毫秒）；缺省读 ANS_PI_SHELL_REVIEW_TIMEOUT_MS，再缺省 120000。超时 = 拒绝。 */
  shellReviewTimeoutMs?: number;
}

export function createRealPiRuntimeAdapter(opts: RealPiAdapterOptions): RuntimeAdapter {
  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return { systemPrompt: renderSystemPrompt(role) };
    },

    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      void role;
      const log = opts.logger ?? createStageLogger(process.env);
      const constructMs =
        opts.constructTimeoutMs ?? readTimeoutMs(process.env, CONSTRUCT_TIMEOUT_ENV, DEFAULT_CONSTRUCT_TIMEOUT_MS);
      const promptMs =
        opts.promptTimeoutMs ?? readTimeoutMs(process.env, PROMPT_TIMEOUT_ENV, DEFAULT_PROMPT_TIMEOUT_MS);
      const cfg = opts.config ?? resolvePiProviderConfig(opts, process.env);
      log.trace(`构造单步时限=${constructMs}ms，prompt 时限=${promptMs}ms`);

      // 分段进度：加载 Pi 包。
      log.stage("加载 Pi 包…");
      const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await withTimeout(
        loadPi(),
        constructMs,
        "加载 Pi 包",
      );

      // 分段进度：构造显式 provider（baseUrl/model，内存凭据）。绝不打印凭据。
      log.stage("构造显式 provider…");
      const { runtime, model } = await withTimeout(
        buildExplicitRuntime(cfg),
        constructMs,
        "构造显式 provider",
      );
      log.trace(`provider=${cfg.providerId} model=${cfg.modelId} baseUrl=${cfg.baseUrl}`);
      log.trace(`contextWindow=${String(model.contextWindow)}（必需项，来自 ANS_PI_CONTEXT_WINDOW）`);

      // 环境封闭：固定的 in-memory settings manager，绝不读 ~/.pi/agent/ 或 <项目>/.pi/ 的设置文件。
      // 不传则 SDK 会回落 SettingsManager.create（sdk.js:76 / resource-loader.js:243）。见 settings.ts。
      const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);

      const queue = createEventQueue<SessionEvent>();
      const emit = (event: SessionEvent): void => queue.push(event);

      // shell 能力是否 arm：注入 ShellGate 即 arm。它同时决定 run_shell 是否注册（§7.5.1）
      // 与扩展层 kill-switch 的判据（§7.5.4）——不再是「token 兜底」。
      const shellArmed = opts.shellGate !== undefined;

      // 受治理工具集：写类（先 gate，获准且配置了 writeRoot 时真正落盘）、读类（读不受写门禁约束），
      // 以及命令级 run_shell——**仅当注入了 shellGate 时才注册**（§7.5.1）。
      // 写根恒等于 projectRoot（写根 ≠ 读根，见设计 §3.1 / §6.2）；shell 的 cwd 同样钉在 projectRoot（§7.2）。
      const governedTools = buildGovernedTools(opts.gate, {
        readRoot: opts.projectRoot,
        writeRoot: opts.projectRoot,
        shellGate: opts.shellGate,
        shellCwd: opts.projectRoot,
        shellReviewTimeoutMs: opts.shellReviewTimeoutMs,
        // 收口提议工具：**仅当编排注入能力时注册**（§13.1，同 shellGate 先例）。
        finalizeBootstrap: opts.finalizeBootstrap,
      });
      const customTools = (governedTools as unknown as GovernedTool[]).map(toPiTool);

      // 扩展 on("tool_call") 拦截：写类目标走 gate；run_shell 只做能力级 kill-switch（未 arm 才 block，
      // arm 则放行交 execute 细审）。**无 token 存储**——票据机制已删（§7.1 第 3 条）。
      const extension = buildGovernanceExtension(opts.gate, emit, shellArmed);

      const resourceLoader = new DefaultResourceLoader({
        cwd: opts.projectRoot,
        agentDir: opts.projectRoot,
        extensionFactories: [extension],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        // 显式传入封闭的 settings manager，堵住 resourceLoader 自身的 settings 回落。
        settingsManager,
      });

      // 分段进度：resourceLoader.reload（否则内联扩展不会被加载）。
      log.stage("resourceLoader.reload…");
      await withTimeout(resourceLoader.reload(), constructMs, "resourceLoader.reload");

      // 分段进度：createAgentSession。关内置工具，注册我们自己的受治理工具（含读）；显式注入 model、modelRuntime 与 settingsManager。
      log.stage("createAgentSession…");
      const { session } = await withTimeout(
        createAgentSession({
          cwd: opts.projectRoot,
          noTools: "builtin",
          customTools,
          resourceLoader,
          model,
          modelRuntime: runtime,
          sessionManager: SessionManager.inMemory(opts.projectRoot),
          // 环境封闭：压缩等设置只由 ANS_SETTINGS_OVERRIDES 决定，不读任何项目外文件。
          settingsManager,
        }),
        constructMs,
        "createAgentSession",
      );

      const unsubscribe = session.subscribe((event): void => {
        if (event.type === "agent_settled") {
          emit({ kind: "settled", summary: "会话结束" });
        }
      });

      log.stage("bindRole 完成");

      return {
        async prompt(text: string): Promise<void> {
          emit({ kind: "message", summary: `用户指令：${text}` });
          log.stage("prompt 发出");
          try {
            await withTimeout(session.prompt(text), promptMs, "prompt");
            log.stage("prompt 返回");
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.stage(`prompt 中止：${message}`);
            emit({ kind: "message", summary: `pi 适配器中止：${message}` });
            // 超时/失败后主动中止底层请求，避免悬挂的流继续占用，然后向上抛出，
            // 以便编排层以非 0 退出（不静默挂起）。
            try {
              await session.abort();
            } catch {
              // 忽略中止阶段的次级错误。
            }
            throw err instanceof Error ? err : new Error(message);
          }
        },
        events(): AsyncIterable<SessionEvent> {
          return queue.stream;
        },
        async dispose(): Promise<void> {
          unsubscribe();
          session.dispose();
          queue.close();
        },
      };
    },
  };
}

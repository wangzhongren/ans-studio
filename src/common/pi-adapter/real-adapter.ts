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

import { accessSync, constants, mkdirSync } from "node:fs";
import type { ResolvedRole } from "../../model/role.ts";
import type {
  WriteGate, RoleSession, RuntimeAdapter, SessionEvent, PromptImage, PromptOptions,
  RuntimeProviderOptions, RuntimeSessionStorage, RuntimeContextSource,
  ToolDefinition as GovernedTool, RuntimeToolEventProjector, RuntimeToolResultFactsV1,
  RuntimeToolErrorFactsV1, RuntimeToolInputFactsV1, ToolDisplayInputRuleV1, RuntimeToolEventSource,
} from "../../model/runtime.ts";
import { selectNativeSessionManager, sessionFileHasForeignToolChangeBlocks } from "./native-session.ts";
export { sessionFileHasForeignToolChangeBlocks } from "./native-session.ts";
import { describeTool } from "./tool-compat.ts";
export { describeTool } from "./tool-compat.ts";
export type { ToolPiDescription } from "./tool-compat.ts";
import { formatDenialMessage } from "./format-denial.ts";
import { createEventQueue, type EventQueue } from "./event-queue.ts";
import {
  resolvePiProviderConfig,
  renderContextWindowNotice,
  type PiProviderConfig,
  type PiProviderConfigInput,
} from "./provider-config.ts";
import { ANS_SETTINGS_OVERRIDES } from "./settings.ts";
import { createStageLogger, type StageLogger } from "./logger.ts";
import { createDiagnosticLogger } from "../shared/diagnostics.ts";
import { createTurnLifecycle, type TurnLifecycle, type DiagnosticLog } from "./lifecycle.ts";
import {
  appendServerToolDeclarations,
  createServerToolObserver,
  parseServerToolConfig,
  renderServerToolDegradedSummary,
  renderServerToolEnableNotice,
  requestRejectionStatus,
  SERVER_TOOL_PAUSED_SUMMARY,
  type ServerToolExtensionOptions,
  type ServerToolObservation,
} from "./server-tools.ts";
import {
  CONSTRUCT_TIMEOUT_ENV,
  DEFAULT_CONSTRUCT_TIMEOUT_MS,
  DEFAULT_PROMPT_TIMEOUT_MS,
  PROMPT_TIMEOUT_ENV,
  type InteractionGate,
  isTimeoutError,
  readOptionalTimeoutMs,
  readTimeoutMs,
  withPausableTimeout,
  withTimeout,
} from "./timeout.ts";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ModelRuntime,
  SessionInfo,
  SessionManager,
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
  // contextWindow **必须**落到我们解析出的具体值：模板是 claude 的 1,000,000，与网关上的真实模型无关。
  // 沿用模板值则 pi 的自动压缩阈值（contextWindow - reserveTokens）永远够不着，会话会先吃到服务端的
  // 超长报错，而不是优雅压缩。cfg.contextWindow 恒为**具体数**——显式值 / 环境变量 / 保守默认
  // DEFAULT_PI_CONTEXT_WINDOW 三者之一（provider-config.ts 解析；缺失回落到保守默认，不再硬失败），
  // 故此处**无条件**覆盖，没有 "template" 回落。
  const model = {
    ...templateModel,
    id: cfg.modelId,
    name: cfg.modelId,
    baseUrl: cfg.baseUrl,
    provider: cfg.providerId,
    contextWindow: cfg.contextWindow,
    // —— compat 显式收窄（2026-10-12 根因修复；客户知情并要求修）——
    // 模板 compat **实测值**（本机 claude-fable-5）：`supportsMidConvoSystemMessages:true`、
    // `supportsMidConvoToolChanges:true`、`forceAdaptiveThinking:true`、`supportsStrictTools:true`、
    // `allowedFallbackModels:[opus…]`。这些是 **Anthropic 官方端点/`inline-tools-2026-09-15` beta** 的能力声明；
    // 我们克隆后 baseUrl 指向**第三方 anthropic-messages 兼容网关**，上述能力**一律未证实** ⇒ 不收窄即等于
    // 撒谎，且已实锤造成生产故障：
    //   · 两 `supportsMidConvo*` 为 true 时，SDK 在**会话中途工具装载变化**后按
    //     `nativeToolChanges = sMCS && sMCT && initialTools.length>0`（anthropic-messages.js:870）生成
    //     `{type:"tool_addition"}/{type:"tool_removal"}` 块（:1027-1041）——网关不认该变体，整段重发
    //     **500 `unknown variant 'tool_removal'`**（真机 su 审读轮 35/37 被拒、助手 content 恒空的根因）。
    //   · `supportsStrictTools:true` ⇒ 工具 schema 附 Anthropic strict 扩展字段（网关未必认）。
    //   · `forceAdaptiveThinking:true` ⇒ 强制 adaptive thinking 格式（网关支持未证）。
    //   · `allowedFallbackModels` 非空 ⇒ 请求可能带服务端 fallback 字段且引用 opus 模型（网关必不支持）。
    // 故**显式置为 SDK 缺省安全值**（false / 清空）；其余未列 compat 字段原样保留（逐项收窄，不整体丢弃）。
    compat: {
      ...templateModel.compat,
      supportsMidConvoSystemMessages: false,
      supportsMidConvoToolChanges: false,
      forceAdaptiveThinking: false,
      supportsStrictTools: false,
      allowedFallbackModels: undefined,
    },
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

  // —— 安全护栏：解析出的 contextWindow（含保守默认）必须确实落到运行时模型，不得回落到模板的 1,000,000 ——
  if (selected.contextWindow !== cfg.contextWindow) {
    throw new Error(
      `安全护栏：解析出的 contextWindow（${cfg.contextWindow}）未落到运行时模型（${String(selected.contextWindow)}），已中止。`,
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

// —————————————————————— 会话持久化与恢复（设计 D-1） ——————————————————————

/** `selectSessionManager` 的结果：选中的会话管理器 + 判据（供日志与测试）。 */
export interface SessionManagerSelection {
  manager: SessionManager;
  /** in-memory（缺省旧行为）/ resumed（恢复最近会话）/ created（在该目录新建）。 */
  mode: "in-memory" | "resumed" | "created";
  contextSource?: RuntimeContextSource;
  /** 恢复时 = 打开的会话文件；新建时 = 首次落盘将写到的文件（**惰性**：首条消息前不存在）。 */
  sessionFile?: string;
  /** 被跳过的「含未知块」会话文件数（>0 时调用方应**如实告知**，勿静默）。 */
  skippedContaminated?: number;
  /** 需要如实告知的说明（如「全部候选含未知块，已新建」）；无则缺省。 */
  note?: string;
}

/**
 * 选会话管理器：生产 storage 交给 native-session.ts，用公共回调校验并隔离目录。
 * 下列 sessionDir 分支仅保留 v1 直接调用兼容（设计 D-1）：
 * - **未给 `sessionDir`** → `SessionManager.inMemory(cwd)`——**逐字保留旧行为**（不落盘）；
 * - 给了 → 目录内**有最近会话即恢复**（`list` 取最近 → `open(path)`），否则 `create(cwd, sessionDir)` 新建。
 *   恢复/新建的判据与 SDK `continueRecent` 同源（相同的 cwd 过滤语义；见 session-manager.js:1354-1362
 *   与 :1449-1459；「最近」按 modified 降序，同 `findMostRecentSession` 的 mtime 排序）。
 *
 * **一致性纪律（D-1 已核实的坑，勿静默）**：恢复时的 `SettingsManager`/resourceLoader/工具集必须与首启
 * 一致——本适配器固定 in-memory settings、工具集来源固定，满足；但**能力集变化**（customerInput /
 * reportHandback 增减）会让**转录里声明过、本次未注册**的工具保持 pending（SDK `_restoreToolsFromTranscript`
 * 按转录恢复装载，agent-session.js:1368-1377）。界面应提示而非静默（归桌面；真机端到端属客户跑）。
 *
 * **环境封闭登记**：本函数只 `list/open/create` **给定的 `sessionDir`**（`create` 自建该目录）——适配器
 * 的持久化数据**只写 `<项目>/.ans/sessions/...`**，**绝不读写 `~/.pi`**：`createAgentSession` 的 `~/.pi`
 * 回落分支（sdk.js:71-79）被我们的显式 resourceLoader/settingsManager/sessionManager/modelRuntime 全部
 * 绕过；trust store 只由 CLI 入口构造（main.js:576 等），不在本路径。**sessionDir 应按角色隔离**
 * （多角色共用一目录会互相恢复彼此的会话——cwd 过滤分不出角色）。
 *
 * 导出供**接线实测**使用（test/pi-adapter 的持久化用例；本函数不构造会话、不调模型）。
 */
export async function selectSessionManager(
  SessionManagerClass: typeof SessionManager,
  opts: { cwd: string; sessionDir?: string; storage?: RuntimeSessionStorage },
): Promise<SessionManagerSelection> {
  if (opts.storage) return selectNativeSessionManager(SessionManagerClass, opts.cwd, opts.storage);
  const dir = opts.sessionDir;
  if (dir === undefined || dir.trim() === "") {
    return { mode: "in-memory", manager: SessionManagerClass.inMemory(opts.cwd) };
  }
  // 目录约定（与编排 2026-10-12 协调）：**本层负责建目录**（编排不预建 `.ans`）。SDK 的
  // `SessionManager.create` 自己会 `mkdirSync(dir,{recursive:true})`（session-manager.js:646-648），
  // 此处显式预建 + **可写性校验**，只为把失败变成**一句话明确错误**（不静默退化成不落盘）。
  // 如实标注：`create` 会**立即建出目录**（会话文件仍是惰性——首条 user/assistant 消息才落盘）。
  // 另注：建目录时机 = `bindRole`（绑定会话）时；若编排/桌面对「`.ans` 目录是否已出现」有断言，
  // 须区分**空目录**与**正式态标志 `.ans/project.json`**（创世判定看后者，见 finalize.ts 的 isGenesisState）。
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch (err) {
    throw new Error(
      `会话持久化目录不可用（无法创建或不可写）：${dir}——${err instanceof Error ? err.message : String(err)}。` +
        `不会静默退化为「不落盘」；请修正该目录后重试，或不配置 sessionDir（回到 in-memory 旧行为）。`,
    );
  }
  const existing: SessionInfo[] = await SessionManagerClass.list(opts.cwd, dir);
  if (existing.length > 0) {
    const ordered = [...existing].sort((a, b) => b.modified.getTime() - a.modified.getTime());
    let skipped = 0;
    for (const info of ordered) {
      // 防御性跳过：含网关不认识的工具变更块（见上文档；当前 SDK 不落字面块，此为防万一）。
      if (sessionFileHasForeignToolChangeBlocks(info.path)) {
        skipped += 1;
        continue;
      }
      return {
        mode: "resumed",
        manager: SessionManagerClass.open(info.path),
        sessionFile: info.path,
        ...(skipped > 0 ? { skippedContaminated: skipped } : {}),
      };
    }
    // 全部候选都含未知块 → **如实拒绝恢复并新建**（fail-closed；绝不静默挂死、不清洗历史）。
    const manager = SessionManagerClass.create(opts.cwd, dir);
    return {
      mode: "created",
      manager,
      sessionFile: manager.getSessionFile(),
      skippedContaminated: skipped,
      note:
        `检测到 ${skipped} 个会话文件含网关不认识的工具变更块（tool_removal/tool_addition），` +
        `已**跳过恢复并新建会话**（不静默、不清洗历史）。`,
    };
  }
  const manager = SessionManagerClass.create(opts.cwd, dir);
  return { mode: "created", manager, sessionFile: manager.getSessionFile() };
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

function projectToolEvent(projector: RuntimeToolEventProjector, source: RuntimeToolEventSource): SessionEvent {
  try { return projector(source); }
  catch { return { kind: "message", summary: "工具显示投影失败", detail: { version: 1, source: "tool-display-diagnostic", code: "PROJECTION_FAILED" } }; }
}

interface PiCallFacts {
  turnId?: string;
  input?: RuntimeToolInputFactsV1;
  result?: RuntimeToolResultFactsV1;
  error?: RuntimeToolErrorFactsV1;
}
interface PiToolEventContext {
  currentTurnId?: () => string | undefined;
  diagnostics?: DiagnosticLog;
  projectToolEvent?: RuntimeToolEventProjector;
  callFacts?: Map<string, PiCallFacts>;
  inputRules?: ReadonlyMap<string, ToolDisplayInputRuleV1 | undefined>;
  roleId?: string;
  /** F-3-a：成功 submit_report（`!isError`）时回调，附当时的 turnId——「本轮已交报告」记账（防重复催交）。 */
  noteReportSubmitted?: (turnId: string | undefined) => void;
}
// Only display-eligible argument keys may be retained across the SDK hook boundary.
function displayInput(rule: ToolDisplayInputRuleV1 | undefined, args: unknown): RuntimeToolInputFactsV1 {
  const raw = args !== null && typeof args === "object" ? args as Record<string, unknown> : {};
  const keys = rule === "core-path-v1" ? ["path", "file_path", "filePath"] : rule === "core-command-v1" ? ["command", "cmd"] : [];
  const selected: Record<string, unknown> = {};
  for (const key of keys) if (key in raw) selected[key] = typeof raw[key] === "string" || raw[key] === null || raw[key] === undefined ? raw[key] : false;
  return { rule, args: selected };
}

/**
 * 把受治理工具转成 Pi 的 customTools 条目。
 * - parameters 用普通 JSON-Schema 形状（不引入 TypeBox 依赖）；
 * - execute 内调用我们自己的 handler，受治理语义完全由它决定；**把 Pi 的 toolCallId 与中止信号透传**
 *   给 handler（run_shell 把 toolCallId 交给 ShellGate 供留痕；交互工具用 signal 防悬挂，设计 A-6）；
 * - **promptGuidelines / executionMode** 也逐工具透传（A-2 的模型行为文案、A-6 的顺序执行）。
 *
 * 导出供**接线实测**使用（test/pi-adapter 的 executionMode 用例直接走本函数再进真实会话链路）。
 */
export function toPiTool(tool: Pick<GovernedTool, "name" | "handler"> & Partial<Omit<GovernedTool, "name" | "handler">>, context?: PiToolEventContext): ToolDefinition {
  const { parameters, description, promptGuidelines, executionMode } = tool.inputSchema === undefined
    ? describeTool(tool.name) // v1 name+handler helper compatibility only
    : { parameters: tool.inputSchema, description: tool.description ?? tool.name,
        promptGuidelines: tool.promptGuidelines, executionMode: tool.executionMode };
  return {
    name: tool.name,
    label: tool.name,
    description,
    parameters,
    ...(promptGuidelines !== undefined ? { promptGuidelines } : {}),
    ...(executionMode !== undefined ? { executionMode } : {}),
    async execute(
      toolCallId: string,
      args: unknown,
      signal?: AbortSignal,
    ): Promise<{ content: Array<{ type: string; text: string }>; details: unknown; isError: boolean }> {
      const record = (args !== null && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const turnId = context?.currentTurnId?.();
      const path = extractCallPath(record);
      const began = Date.now();
      const facts = context?.callFacts?.get(toolCallId);
      context?.diagnostics?.record("tool.start", { turnId, toolCallId, toolName: tool.name, path });
      let result: Awaited<ReturnType<GovernedTool["handler"]>>;
      try {
        result = await tool.handler({ name: tool.name, args: record, toolCallId, signal });
      } catch (error) {
        if (facts && error instanceof Error) facts.error = { message: error.message };
        context?.diagnostics?.error("tool.result", error, { turnId, toolCallId, toolName: tool.name, path, ok: false, durationMs: Date.now() - began });
        throw error;
      }
      if (facts) facts.result = { ok: result.ok, message: result.message, ...(result.execution ? { execution: { ...result.execution } } : {}) };
      const details = {
        turnId, toolCallId, toolName: tool.name, path, ok: result.ok,
        status: result.ok ? "completed" : "failed", durationMs: Date.now() - began,
        ...(!result.ok ? { errorCode: signal?.aborted ? "ABORTED" : "TOOL_FAILED" } : {}),
      };
      context?.diagnostics?.record("tool.result", details);
      return { content: [{ type: "text", text: result.message }], details, isError: !result.ok };
    },
  } as unknown as ToolDefinition;
}

// —————————————————————— settle 事件（X-1：恰发一次） ——————————————————————

/**
 * 订阅 AgentSession 的完成与消息状态，集中到 lifecycle 的唯一终态出口。
 * 真实 prompt 接线先暂存 SDK settled，promise 结果确定后才发布终态，防 finally 提前报成功。
 * 独立夹具没有 prompt 包装时直接发布；同轮重复 settled 仍被抑制。
 *
 * **为何收口到这一个发射点（保留 `session.subscribe`、删扩展层 `on("agent_settled")` 映射）**：
 * - 真机故障：两处同时发射 ⇒ 每轮 settle **两份** ⇒ 编排 `withHandback` 每份都回交 ⇒ 去重键含时间戳
 *   （两次差几毫秒）⇒ 去重失效 ⇒ su 收到 7 次逐字相同的重复投递（X-1 上报）。
 * - `session.subscribe` 是 **AgentSession 的公开事件面**、与事件源同层；**扩展层是可选层**（未加载/加载失败
 *   即整层缺席），而 `settled` 是消费方的**关键信号**（漏发 ⇒ 消费方永久挂起）——关键信号不应挂在可选层上。
 * - 扩展层的独立职责（`tool_call` 拦截等）**全部保留**，只删 `agent_settled` 这一处重复映射。
 * - 中止路径语义保持：`session.abort()` 后 SDK 仍发 `agent_settled`（agent-session.js:689-691），
 *   集中出口仍发一个 settled（实测 abort 路径恰 1）——消费方不会挂起。
 *
 * 导出供夹具驱动测试（stub 会话或真实 faux 会话均可）。
 */
export function wireSettledOnce(
  session: { subscribe(listener: (event: { type: string; message?: unknown; aborted?: boolean }) => void): () => void },
  emit: (event: SessionEvent) => void,
  suppliedLifecycle?: TurnLifecycle,
): () => void {
  const lifecycle = suppliedLifecycle ?? createTurnLifecycle(emit);
  return session.subscribe((event): void => {
    // Prompt wrappers own identities. A late SDK agent_start must not reopen a timed-out turn.
    if (event.type === "agent_start" && suppliedLifecycle === undefined) lifecycle.begin();
    if (event.type === "message_end") lifecycle.observe(event.message);
    if (event.type === "agent_settled") {
      if (suppliedLifecycle !== undefined) lifecycle.noteSdkSettled(event.aborted);
      else lifecycle.finish(event.aborted);
    }
  });
}

// —————————————————————— 执行前工具白名单（兼容旧写闸与 shell kill-switch） ——————————————————————

/**
 * 受写门禁约束的工具名。只有这些"写类"调用会经过 gate 拦截。
 * read_file 等**读类**调用不在其中——读不受写边界约束（见 tools.ts 的说明）。
 */
const GOVERNED_WRITE_TOOLS = new Set(["write", "edit", "write_file", "edit_file"]);

/**
 * 构造执行前扩展：生产带 allowedToolNames，拒绝任何未注入名称；授权交原 injected handler。
 * 不带白名单的旧直接测试保留写 gate 与 shell kill-switch 的兼容行为。
 * **导出供接线测试**（X-1：断言本扩展**不含** agent_settled 映射——settled 的唯一发射点是
 * `wireSettledOnce`，防重复发射点漂移回）。
 * 同时把事件经 emit 推给 RoleSession.events()。
 *
 * **写类**：这是"第二层"——第一层是自定义工具自身在 execute 前调 gate；即便某次自定义工具未拦住
 * （例如被 noTools 关闭的内置 write/edit 若被其它途径启用），扩展层仍会在**执行前**阻断。
 *
 * **run_shell**：扩展层**不再是独立的第二道审**（如实标注，设计 §7.5 第 4 条）——因「唯一 shell 入口 =
 * 我们的自定义工具 run_shell」，扩展层对它只剩**能力级 kill-switch**：未 arm（未注入 ShellGate）时整只
 * `{block:true}`；**arm 了即放行、交 execute 做每调用细审**。它**不做**每调用 token 校验（票据已废，§7.1
 * 第 3 条），**绝不喂 resolveWrite**（run_shell 的 input 无 path；从命令串解析路径是启发式当判据，见 §7.7）。
 *
 * **服务端工具族（web_search/web_fetch；客户已批准 2026-10-16，默认关）**：仅当 `context.serverTools`
 * 给出非空声明时注册三个 handler（声明注入 / 原始流观测 / 4xx 降级判定）——未启用时
 * **零注册、零开销、行为逐字与旧版一致**。注入与观测的通道依据见 server-tools.ts 头部（扩展事件
 * `before_provider_request` / `provider_stream_event`，均为已安装 SDK dist 的只读核实）。V1 路径 C：
 * 网关 4xx 疑似拒声明时**不自动剥离重试**（本轮如实收场 + 停用后续声明），剥离重试后置。
 */
export function buildGovernanceExtension(
  gate: WriteGate,
  emit: (event: SessionEvent) => void,
  shellArmed: boolean,
  context?: PiToolEventContext & { allowedToolNames?: ReadonlySet<string>; serverTools?: ServerToolExtensionOptions },
): { name: string; factory: (pi: ExtensionAPI) => void } {
  return {
    name: "ans-governance",
    factory: (pi: ExtensionAPI): void => {
      const calls = new Map<string, { turnId?: string; path?: string }>();
      const facts = context?.callFacts ?? new Map<string, PiCallFacts>();
      const blocked = (event: ToolCallEvent, reason: string, legacy: SessionEvent): void => {
        if (!context?.projectToolEvent) { emit(legacy); return; }
        const call = facts.get(event.toolCallId);
        if (!call) { emit(projectToolEvent(context.projectToolEvent, { origin: "diagnostic", code: "CALL_CONTEXT_UNATTRIBUTED" })); return; }
        emit(projectToolEvent(context.projectToolEvent, { origin: "governance-hook", phase: "blocked", runtime: "pi", roleId: context.roleId, turnId: call.turnId, toolCallId: event.toolCallId, toolName: event.toolName, input: call.input, result: { ok: false, message: reason } }));
      };
      // 工具调用前的治理拦截点（唯一经文可注册的 tool_call 钩子）。
      pi.on("tool_call", (event: ToolCallEvent): ToolCallEventResult | undefined => {
        const input = (event as { input?: unknown }).input;
        const path = extractCallPath(input);
        // SDK execution_start is the sole canonical start (also emitted before blocked calls).
        const identity = { turnId: context?.currentTurnId?.(), toolCallId: event.toolCallId, phase: "blocked" };

        // —— run_shell：**能力级 kill-switch**（设计 §7.5 第 4 条 / §7.7）——
        // 未 arm → {block:true}；已 arm → 放行（undefined），交 execute 做每调用细审。
        // **不做每调用 token 校验、不喂 resolveWrite**（run_shell 的 input 无 path）。
        if (context?.allowedToolNames !== undefined) {
          if (context.allowedToolNames.has(event.toolName)) return undefined;
          const reason = `非注入的 ANS 工具，拒绝执行：${event.toolName}`;
          blocked(event, reason, { kind: "denied", summary: reason, detail: { ...identity, toolName: event.toolName } });
          return { block: true, reason };
        }
        const kill = event.toolName === "run_shell" && !shellArmed
          ? { block: true as const, reason: "run_shell 未注入 ShellGate，拒绝执行" } : undefined;
        if (kill !== undefined) {
          blocked(event, kill.reason, { kind: "denied", summary: kill.reason, detail: { ...identity, toolName: event.toolName } });
          return kill;
        }
        // run_shell 已 arm：直接放行（每调用保证在 execute 的审核链，不在此处）。
        if (event.toolName === "run_shell") return undefined;

        // 仅写类工具受 gate 约束；读类（read_file 等）与非路径类调用一律放行。
        if (!GOVERNED_WRITE_TOOLS.has(event.toolName)) return undefined;
        if (path === undefined) return undefined;

        const decision = gate(path);
        if (decision.allowed) return undefined;

        const reason = formatDenialMessage(decision);
        blocked(event, reason, { kind: "denied", summary: reason, detail: { ...identity, toolName: event.toolName, path } });
        // fail-closed：写之前阻断，绝不执行。
        return { block: true, reason };
      });

      // 事件映射：执行开始/结束、消息、结束。
      pi.on("tool_execution_start", (event): void => {
        const metadata = { turnId: context?.currentTurnId?.(), path: extractCallPath(event.args) };
        calls.set(event.toolCallId, metadata);
        const call = { turnId: metadata.turnId, input: displayInput(context?.inputRules?.get(event.toolName), event.args) };
        facts.set(event.toolCallId, call);
        context?.diagnostics?.record("tool.execution.start", { ...metadata, toolName: event.toolName, toolCallId: event.toolCallId });
        if (context?.projectToolEvent) {
          emit(projectToolEvent(context.projectToolEvent, { origin: "native-start", phase: "start", runtime: "pi", roleId: context.roleId, toolName: event.toolName, toolCallId: event.toolCallId, ...call }));
          return;
        }
        emit({ kind: "tool_call", summary: `模型请求调用 ${event.toolName}${metadata.path !== undefined ? `（目标：${metadata.path}）` : ""}`, detail: { ...metadata, toolName: event.toolName, toolCallId: event.toolCallId, phase: "start" } });
      });

      pi.on("tool_execution_end", (event): void => {
        const metadata = calls.get(event.toolCallId);
        calls.delete(event.toolCallId);
        const call = facts.get(event.toolCallId);
        facts.delete(event.toolCallId);
        const result = event.result.details !== null && typeof event.result.details === "object" ? event.result.details as Record<string, unknown> : {};
        // F-3-a：成功 submit_report 记账（「本轮已交报告」判据）——截断补发不再催一份已交的报告。
        if (event.toolName === "submit_report" && !event.isError) {
          context?.noteReportSubmitted?.((typeof result.turnId === "string" ? result.turnId : undefined) ?? metadata?.turnId ?? context?.currentTurnId?.());
        }
        const detail = {
          turnId: typeof result.turnId === "string" ? result.turnId : metadata?.turnId,
          toolName: event.toolName, toolCallId: event.toolCallId, phase: "result",
          path: typeof result.path === "string" ? result.path : metadata?.path,
          ok: !event.isError, status: event.isError ? "failed" : "completed", durationMs: event.durationMs,
          ...(event.isError ? { errorCode: result.errorCode === "ABORTED" ? "ABORTED" : "TOOL_FAILED" } : {}),
        };
        context?.diagnostics?.record("tool.execution.result", detail);
        if (context?.projectToolEvent) {
          const content = Array.isArray(event.result.content) ? event.result.content.map((block: unknown) => { const item = block !== null && typeof block === "object" ? block as Record<string, unknown> : {}; return item.type === "text" && typeof item.text === "string" ? { type: "text" as const, text: item.text } : { type: "unsupported" as const }; }) : [{ type: "unsupported" as const }];
          emit(projectToolEvent(context.projectToolEvent, { origin: "native-result", phase: "result", runtime: "pi", roleId: context.roleId, toolName: event.toolName, toolCallId: event.toolCallId, turnId: call?.turnId ?? (typeof result.turnId === "string" ? result.turnId : undefined), input: call?.input, result: call?.result, error: call?.error ?? (result.errorCode === "ABORTED" || result.errorCode === "TOOL_FAILED" ? { code: result.errorCode } : undefined), durationMs: event.durationMs, native: { isError: event.isError, content } }));
          return;
        }
        emit({
          kind: event.isError ? "denied" : "accepted",
          summary: `${event.toolName} 执行${event.isError ? "失败" : "完成"}`,
          detail,
        });
      });

      pi.on("message_end", (event): void => {
        const text = extractMessageText(event.message);
        if (text !== undefined && text.length > 0) {
          emit({ kind: "message", summary: text });
        }
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

      // ———————— 服务端工具族（web_search/web_fetch）扩展 handler（**仅启用时注册**） ————————
      //
      // 依据与白名单纪律见 server-tools.ts 头部；此处只做「观测命令 → 行/诊断」的接线：
      // - 行经既有 projectToolEvent（与客户端工具行同一形状/净化/预算/回放路径，桌面 v1 零改动）
      //   或无 projector 时的 legacy emit（沿本文件既有两条路径先例）；
      // - 诊断字段全部落在共享白名单内（toolName/count/turnId/state/errorCode/reasonCode/ok），
      //   **查询串与结果正文不进诊断**（客户批准口径 ③：usage 只进计数类）。
      const serverTools = context?.serverTools;
      if (serverTools !== undefined && serverTools.declarations.length > 0) {
        const observer = createServerToolObserver();
        // 降级判定状态（每请求重置；suppressed 为**会话级**——一旦疑似拒声明，后续请求不再附带）。
        let requestHadDeclarations = false;
        let suppressed = false;
        const recordObservation = (observation: ServerToolObservation): void => {
          const turnId = context?.currentTurnId?.();
          if (observation.kind === "call-start") {
            context?.diagnostics?.record("server_tool.call", { turnId, toolName: observation.toolName, toolCallId: observation.toolCallId, count: 1 });
            if (context?.projectToolEvent) {
              emit(projectToolEvent(context.projectToolEvent, { origin: "native-start", phase: "start", runtime: "pi", roleId: context.roleId, turnId, toolName: observation.toolName, toolCallId: observation.toolCallId, input: { rule: "none", args: {} } }));
            } else {
              emit({ kind: "tool_call", summary: `模型请求调用 ${observation.toolName}（服务端工具）`, detail: { turnId, toolName: observation.toolName, toolCallId: observation.toolCallId, phase: "start" } });
            }
            return;
          }
          if (observation.kind === "call-result" || observation.kind === "call-denied") {
            const ok = observation.kind === "call-result";
            if (!ok) context?.diagnostics?.record("server_tool.degraded", { turnId, toolName: observation.toolName, toolCallId: observation.toolCallId, ok: false, errorCode: observation.errorCode });
            if (context?.projectToolEvent) {
              emit(projectToolEvent(context.projectToolEvent, { origin: "native-result", phase: "result", runtime: "pi", roleId: context.roleId, turnId, toolName: observation.toolName, toolCallId: observation.toolCallId, result: { ok, message: observation.message } }));
            } else {
              emit({ kind: ok ? "accepted" : "denied", summary: observation.message, detail: { turnId, toolName: observation.toolName, toolCallId: observation.toolCallId, phase: "result", ok } });
            }
            return;
          }
          if (observation.kind === "usage") {
            context?.diagnostics?.record("server_tool.usage", { turnId, toolName: observation.toolName, count: observation.count, state: observation.state });
            return;
          }
          if (observation.kind === "paused") {
            context?.diagnostics?.record("server_tool.paused", { turnId, reasonCode: "pause_turn" });
            emit({ kind: "message", summary: SERVER_TOOL_PAUSED_SUMMARY, detail: { source: "server-tools" } });
            return;
          }
          // unknown-stop-reason：轮次失败由 pi-ai 既有 throw 路径如实呈现（此处不改）；仅补一条诊断归属。
          context?.diagnostics?.record("server_tool.unknown_stop_reason", { turnId, reasonCode: observation.reason.slice(0, 64) });
        };

        pi.on("before_provider_request", (event): unknown => {
          // 每请求重置配对状态（降级判据 = 本请求含声明 ∧ 该请求以 error 收场 ∧ 错误前缀给出拒绝状态）。
          requestHadDeclarations = false;
          if (suppressed) return undefined;
          const result = appendServerToolDeclarations(event.payload, serverTools.declarations);
          requestHadDeclarations = result.present;
          return result.changed ? result.payload : undefined;
        });

        pi.on("provider_stream_event", (event): void => {
          // 仅本适配器所用协议路径（其余 api 的原始事件形状不同，O(1) 早退；早退纪律见提案 §2.7）。
          if (event.api !== "anthropic-messages") return;
          for (const observation of observer.observe(event.data)) recordObservation(observation);
        });

        pi.on("message_end", (event): void => {
          // —— V1 路径 C（客户批准口径 ④：如实失败、不毁轮次；不自动剥离重试）——
          // 判据：本请求含声明 ∧ 该请求以 stopReason=error 收场 ∧ 错误消息前缀给出**确定性拒绝**状态
          // （>= 400；排除 408/429 两类与声明无关的瞬时态——见 requestRejectionStatus 文档）。
          // 状态来源（实现轮核实修正提案 §4.2 的探测通道）：扩展事件 `after_provider_response` 只在 2xx 后
          // 回调——非 2xx 时 Anthropic SDK 直接 throw（client.js:583-614），该事件**看不到 4xx/5xx**；
          // 故状态改从错误消息前缀取（只在内存用于判定，**不落诊断**——沿「只存错误类别」纪律）。
          // 轮次失败语义不变（既有 lifecycle 照常收尾）；我们只**停用后续请求的声明** + 如实行 + 诊断。
          if (suppressed || !requestHadDeclarations) return;
          const message = event.message as unknown;
          const record = message !== null && typeof message === "object" ? (message as Record<string, unknown>) : undefined;
          if (record === undefined || record["stopReason"] !== "error") return;
          const errorMessage = typeof record["errorMessage"] === "string" ? record["errorMessage"] : "";
          const status = requestRejectionStatus(errorMessage);
          if (status === undefined) return;
          suppressed = true;
          context?.diagnostics?.record("server_tool.degraded", { turnId: context?.currentTurnId?.(), errorCode: `GATEWAY_REJECTED_HTTP_${String(status)}`, state: "suppressed" });
          emit({ kind: "message", summary: renderServerToolDegradedSummary(status), detail: { source: "server-tools" } });
        });
      }
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

// —————————————————————— F-3-a：截断收尾补发（kanban-live F-3 修复，客户已批准） ——————————————————————
//
// 背景（真机已证）：输出预算被钳到 1 token 的轮次以 stopReason=length 收场，模型来不及发出
// submit_report；SDK 自带的「压缩并重试」在刚压完的场景会静默放弃。故适配器在**同一轮次内**、
// **恰好一次**地补发一条简短收尾提示，让模型在正常预算的下一轮里补交报告或直接继续。
// 语义纪律：绝不把截断当成功（outcome 不变）；绝不由系统合成报告（只认模型自己的 submit_report）；
// 补发为 best-effort（失败只如实外推 + 有界清理，不改变本轮既有结果）。

/** 显式关闭收尾补发的环境变量（`"0"/"false"/"no"/"off"` 显式关闭；缺省**开启**、可即时关）。 */
export const LENGTH_FOLLOWUP_ENV = "ANS_PI_LENGTH_FOLLOWUP";
/** 补发段独立时限的环境变量（毫秒；缺省 = 该会话的 promptMs）。 */
export const LENGTH_FOLLOWUP_TIMEOUT_ENV = "ANS_PI_LENGTH_FOLLOWUP_TIMEOUT_MS";
/** 触发补发时的事件行文案（先发本行、再补发）。 */
export const LENGTH_FOLLOWUP_NOTICE_SUMMARY = "已自动补发一轮收尾提示（因上一轮输出被截断；限一次）。";
/** 补发给模型的收尾提示文案（条件句写就：chat 轮最坏成本 = 一次短往返）。 */
export const LENGTH_FOLLOWUP_TEXT = "【系统】上一轮回复因达到输出上限被截断，可能未完整收尾。若本轮任务已完成或你已确认无法完成，请立即调用 submit_report 交回简短报告（一句话结论＋关键证据）；若任务尚未完成，请直接继续（不要重复已完成的工作）。";

/** 环境开关是否显式关闭收尾补发（缺省开启；仅显式关闭值才关，大小写/空白不敏感）。 */
export function isLengthFollowupDisabled(env: Record<string, string | undefined>): boolean {
  const raw = env[LENGTH_FOLLOWUP_ENV];
  if (raw === undefined) return false;
  const value = raw.trim().toLowerCase();
  return value === "0" || value === "false" || value === "no" || value === "off";
}

/**
 * F-3-a 收尾补发配置（内部接缝；**缺省不传 ⇒ 行为与旧版逐字一致**——直接调用方/旧测试无感）。
 * `enabled` 的合成在 `bindRole`：env 开关（缺省开）∧ 注入工具集含 `submit_report`。
 */
export interface LengthFollowupOptions {
  enabled: boolean;
  /** 补发给模型的收尾提示文案（生产传 `LENGTH_FOLLOWUP_TEXT`）。 */
  text: string;
  /** 补发段独立硬超时；缺省 = 该会话 `promptMs`。 */
  timeoutMs?: number;
  /** 本轮是否已有成功 `submit_report`（同轮去重判据，由接线方按 turnId 记账）。 */
  wasReportSubmitted: () => boolean;
}

// —————————————————————— 角色会话的 prompt 包装（设计 K-2 图片透传 / G-1 可暂停时限） ——————————————————————

/** 包装所需的底层会话面（结构上兼容 AgentSession；导出工厂便于**接线测试用桩件替换**）。 */
export interface PromptCapableSession {
  prompt(text: string, options?: { images: PromptImage[] }): Promise<void>;
  abort(): Promise<void>;
  /** 收口整个底层会话（`makeRoleSession` 的 dispose 用；AgentSession 本就提供）。 */
  dispose(): void;
}

/**
 * 构造 `RoleSession.prompt`（**导出供接线测试**——桩件即可断言透传，无需真实模型、不发请求）：
 * - **无 `opts` 时逐字保留旧行为**（纯文本：向 SDK 传 `prompt(text)`、**不传 options**）；
 * - 带图（K-2）：`session.prompt(text, { images })` **原样透传**——**不按 `Model.input` 门控**（模型是否
 *   多模态不由本层猜）；SDK 发送时自行转 wire（`source{type:base64,media_type,data}`）；事件流可见
 *   「附 N 张图片」；
 * - 每轮硬超时**可暂停**（G-1）：客户输入挂起期间计时停走，作答后续算剩余时间；
 * - 失败如实外推（两条路径都不吞）：异常 → 事件流「pi 适配器中止：…」+ `abort()` 底层 + 向上抛出；
 *   SDK `stopReason:"error"` 通过公开订阅跟踪，最终失败即使正文为空也发 denied/failed 终态；
 *   中间重试错误不覆盖最终成功；生产清理900ms，旧直接 helper 缺省5秒，失败隔离会话。
 */
export function makeRolePrompt(deps: {
  session: PromptCapableSession;
  promptMs: number;
  gate: InteractionGate;
  emit: (event: SessionEvent) => void;
  log: StageLogger;
  lifecycle?: TurnLifecycle;
  diagnostics?: DiagnosticLog;
  abortTimeoutMs?: number;
  requestAbort?: () => Promise<void>;
  finishOnReturn?: boolean;
  /** Core owns the input echo on injected production sessions. Direct helpers retain compatibility. */
  emitPromptInput?: boolean;
  /** F-3-a：截断收尾补发配置；**缺省不传 ⇒ 行为与旧版逐字一致**（见 LengthFollowupOptions）。 */
  lengthFollowup?: LengthFollowupOptions;
}): (text: string, opts?: PromptOptions) => Promise<void> {
  const { session, promptMs, gate, emit, log } = deps;
  const lifecycle = deps.lifecycle ?? createTurnLifecycle(emit, deps.diagnostics);
  let running = false;
  return async function prompt(text: string, opts?: PromptOptions): Promise<void> {
    if (running) throw new Error("Agent is already processing a prompt. 等待当前轮结束后再发送。");
    lifecycle.begin();
    running = true;
    const images = opts?.images !== undefined && opts.images.length > 0 ? opts.images : undefined;
    if (deps.emitPromptInput !== false) emit({
      kind: "message",
      summary: images !== undefined ? `用户指令：${text}（附 ${images.length} 张图片）` : `用户指令：${text}`,
      detail: { turnId: lifecycle.currentTurnId(), source: "prompt-input", text, ...(images ? { imageCount: images.length } : {}) },
    });
    log.stage("prompt 发出");
    try {
      // 每轮硬超时**可暂停**（G-1）：客户输入挂起期间计时停走，作答后续算剩余时间。
      const calling = images !== undefined ? session.prompt(text, { images }) : session.prompt(text);
      await withPausableTimeout(calling, promptMs, "prompt", gate);
      // F-3-a（截断收尾补发）：仅在首个 prompt **正常返回后**考虑——「开关开启 ∧ 末条消息截断 ∧
      // 本轮无成功 submit_report ∧ 生命周期未被强制锁定（abort/超时）」时，用**独立的**
      // withPausableTimeout 段补发**恰一次**收尾提示。限一次是**结构性保证**：本分支每次 prompt()
      // 调用只经过一次；补发直调底层 session.prompt，不递归本包装、不新增 settled/handback 发射点。
      // 补发为 best-effort：失败只如实外推 + 有界清理，绝不把已完成的轮次改判（诚实降级由编排照旧处理）。
      const followup = deps.lengthFollowup;
      if (followup !== undefined && followup.enabled && lifecycle.wasTruncated() && !followup.wasReportSubmitted()) {
        emit({ kind: "message", summary: LENGTH_FOLLOWUP_NOTICE_SUMMARY, detail: { turnId: lifecycle.currentTurnId(), source: "length-followup" } });
        try {
          await withPausableTimeout(session.prompt(followup.text), followup.timeoutMs ?? promptMs, "prompt", gate);
        } catch (err) {
          const timedOut = isTimeoutError(err);
          const message = err instanceof Error ? err.message : String(err);
          // 先**封存**本轮既有 outcome：随后的 abort 清理会引发迟到的 SDK agent_settled(aborted)/中止消息，
          // 封存后它们不得把已完成的轮次改判为 aborted（「补发失败不改变 settled 的 outcome」）。
          lifecycle.seal();
          log.stage(`收尾补发失败：${message}`);
          emit({ kind: "message", summary: `收尾补发失败：${message}`, detail: { turnId: lifecycle.currentTurnId(), source: "length-followup" } });
          deps.diagnostics?.record(timedOut ? "prompt.length_followup_timeout" : "prompt.length_followup_failed", { turnId: lifecycle.currentTurnId(), errorType: err instanceof Error ? err.name : "Error", errorCode: timedOut ? "PROMPT_TIMEOUT" : "PROMPT_FAILED" });
          try {
            await (deps.requestAbort?.() ?? withTimeout(session.abort(), deps.abortTimeoutMs ?? 5000, "abort 清理"));
          } catch (cleanupError) {
            lifecycle.quarantine();
            deps.diagnostics?.error("prompt.length_followup_cleanup_failed", cleanupError, { turnId: lifecycle.currentTurnId(), errorCode: isTimeoutError(cleanupError) ? "CLEANUP_TIMEOUT" : "CLEANUP_FAILED" });
          }
        }
      }
      // The SDK emits settled from finally even when prompt rejects afterwards. Publish only
      // after the promise outcome is known, so consumers cannot receive an early false success.
      if (deps.finishOnReturn || lifecycle.hasSdkSettled()) lifecycle.finish();
      log.stage("prompt 返回");
    } catch (err) {
      const timedOut = isTimeoutError(err);
      lifecycle.fail(timedOut ? "timed_out" : "failed", timedOut ? "PROMPT_TIMEOUT" : "PROMPT_FAILED");
      // SDK error messages may embed an API response. Diagnostics store the error category only.
      deps.diagnostics?.record(timedOut ? "prompt.timeout" : "prompt.failed", { turnId: lifecycle.currentTurnId(), errorType: err instanceof Error ? err.name : "Error", errorCode: timedOut ? "PROMPT_TIMEOUT" : "PROMPT_FAILED" });
      const message = err instanceof Error ? err.message : String(err);
      log.stage(`prompt 中止：${message}`);
      emit({ kind: "message", summary: `pi 适配器中止：${message}` });
      // 超时/失败后主动中止底层请求，避免悬挂的流继续占用，然后向上抛出，
      // 以便编排层以非 0 退出（不静默挂起）。
      try {
        await (deps.requestAbort?.() ?? withTimeout(session.abort(), deps.abortTimeoutMs ?? 5000, "abort 清理"));
      } catch (cleanupError) {
        lifecycle.quarantine();
        deps.diagnostics?.error("prompt.cleanup_failed", cleanupError, { turnId: lifecycle.currentTurnId(), errorCode: isTimeoutError(cleanupError) ? "CLEANUP_TIMEOUT" : "CLEANUP_FAILED" });
      }
      lifecycle.finish();
      throw err instanceof Error ? err : new Error(message);
    } finally {
      running = false;
    }
  };
}

// —————————————————————— 角色会话组装（P0-2 停当前轮次：abort 透传） ——————————————————————

/** `makeRoleSession` 的依赖（bindRole 组装与测试桩件共用；同 `makeRolePrompt` 的接缝先例）。 */
export interface RoleSessionDeps {
  session: PromptCapableSession;
  promptMs: number;
  gate: InteractionGate;
  emit: (event: SessionEvent) => void;
  log: StageLogger;
  /** 事件队列：`events()` 的流来源；dispose 最后 close（迟到事件先排空）。 */
  queue: EventQueue<SessionEvent>;
  /** dispose 内、SDK `session.dispose()` **之前**的收口（退订 settled——dispose 引发的迟到 settled 不再入队）。 */
  unsubscribe: () => void;
  lifecycle?: TurnLifecycle;
  diagnostics?: DiagnosticLog;
  abortTimeoutMs?: number;
  /** Native production sessions deduplicate per-turn abort and ignore idle stop. */
  strictLifecycle?: boolean;
  emitPromptInput?: boolean;
  /** F-3-a：截断收尾补发配置（缺省不传 ⇒ 逐字旧行为）；形状见 makeRolePrompt deps / LengthFollowupOptions。 */
  lengthFollowup?: LengthFollowupOptions;
}

/**
 * 组装 `RoleSession`（**导出供接线测试**——桩件即可断言 abort 透传与 dispose 顺序，无需真实模型）：
 * - `prompt`：`makeRolePrompt`（K-2 图片透传 / G-1 可暂停时限 / 失败外推，见其文档）；
 * - `events`：队列流（既有行为逐字不变）；
 * - `abort`（提案 P0-2「停当前轮次」，契约 `RoleSession.abort?` 的真适配器实现）：
 *   透传 Pi SDK `session.abort()`。**语义**（与契约注释一一对应，SDK 源码已核实）：
 *   · 停当前轮（`agent.abort()` 中止该轮 run 的 AbortController——模型生成与工具执行一并停），
 *     **不销毁会话**：abort 后仍可继续 prompt（历史与上下文保留）；
 *   · **无进行中轮次 = no-op**：`agent.abort()` 是 `activeRun?.abortController.abort()`（可选链），
 *     `waitForIdle()` 在 idle 时立即返回——不抛错、无副作用；
 *   · **abort 后 settled 仍发射**：SDK `_emitAgentSettled` 无论中止与否都发 `agent_settled`
 *     （`wireSettledOnce` 照常映射，X-1 唯一发射点），进行中的 `prompt()` promise 正常返回；
 *   · **等待中的客户确认/交互一并 fail-closed**：run 级 signal 经 agent-loop 传入各工具 `execute`
 *     （第三参），交互工具的 `raceAbort`（设计 A-6）立即以「未获客户同意」返回——SDK 已天然带动，
 *     本层无需另接（端到端用例钉住）；
 *   · 错误如实上抛（不吞错）。
 * - `dispose`：顺序与提取前逐字一致（退订 → SDK dispose → queue.close）。
 */
export function makeRoleSession(deps: RoleSessionDeps): RoleSession {
  const lifecycle = deps.lifecycle ?? createTurnLifecycle(deps.emit, deps.diagnostics);
  let abortWork: { id?: string; promise: Promise<void> } | undefined;
  const requestAbort = (): Promise<void> => {
    const id = lifecycle.currentTurnId();
    if (!deps.strictLifecycle) return withTimeout(deps.session.abort(), deps.abortTimeoutMs ?? 5000, "abort 清理");
    if (abortWork && abortWork.id === id) return abortWork.promise;
    const promise = withTimeout(Promise.resolve().then(() => deps.session.abort()), deps.abortTimeoutMs ?? 900, "abort 清理");
    abortWork = { id, promise };
    return promise;
  };
  return {
    prompt: makeRolePrompt({ ...deps, lifecycle, requestAbort, finishOnReturn: deps.strictLifecycle }),
    events(): AsyncIterable<SessionEvent> {
      return deps.queue.stream;
    },
    async abort(): Promise<void> {
      if (deps.strictLifecycle && !lifecycle.isActive()) return;
      deps.diagnostics?.record("session.abort.start", { turnId: lifecycle.currentTurnId() });
      lifecycle.fail("aborted", "ABORTED");
      try {
        await requestAbort();
        deps.diagnostics?.record("session.abort.end", { turnId: lifecycle.currentTurnId(), ok: true });
      } catch (error) {
        lifecycle.quarantine();
        deps.diagnostics?.error("session.abort.failed", error, { turnId: lifecycle.currentTurnId(), errorCode: isTimeoutError(error) ? "CLEANUP_TIMEOUT" : "CLEANUP_FAILED" });
        lifecycle.finish();
        throw error;
      }
    },
    async dispose(): Promise<void> {
      deps.diagnostics?.record("session.dispose", { turnId: lifecycle.currentTurnId() });
      deps.unsubscribe();
      deps.session.dispose();
      deps.queue.close();
    },
  };
}

// —————————————————————— 适配器本体 ——————————————————————

export interface RealPiAdapterOptions extends RuntimeProviderOptions, PiProviderConfigInput {
  /** Legacy direct directory mode, only populated by the v1 public adapter branch. */
  sessionDir?: string;
  config?: PiProviderConfig;
  logger?: StageLogger;
}

/** Private offline seam; normal construction uses the pinned real SDK and explicit model runtime. */
export interface PiAdapterDependencies {
  loadPi?: typeof loadPi;
  buildRuntime?: typeof buildExplicitRuntime;
}

export function createRealPiRuntimeAdapter(input: RealPiAdapterOptions, dependencies: PiAdapterDependencies = {}): RuntimeAdapter {
  const opts = { ...input };
  return {
    async composeContext(role: ResolvedRole): Promise<{ systemPrompt: string }> {
      return { systemPrompt: renderSystemPrompt(role) };
    },

    async bindRole(role: ResolvedRole): Promise<RoleSession> {
      const governedTools = opts.tools.map((tool) => ({ ...tool,
        inputSchema: structuredClone(tool.inputSchema),
        ...(tool.promptGuidelines ? { promptGuidelines: [...tool.promptGuidelines] } : {}),
      }));
      if (opts.runtime !== "pi") throw new Error("Pi 适配器只能建立 Pi 会话");
      if (opts.storage && opts.storage.roleId !== role.id) throw new Error("Pi 存储与当前角色不匹配");
      const log = opts.logger ?? createStageLogger(process.env);
      const diagnostics = createDiagnosticLogger({ component: "pi-adapter", projectRoot: opts.projectRoot, roleId: role.id });
      diagnostics.record("session.construct.start");
      try {
        const constructMs =
          opts.constructTimeoutMs ?? readTimeoutMs(process.env, CONSTRUCT_TIMEOUT_ENV, DEFAULT_CONSTRUCT_TIMEOUT_MS);
        const promptMs =
          opts.promptTimeoutMs ?? readTimeoutMs(process.env, PROMPT_TIMEOUT_ENV, DEFAULT_PROMPT_TIMEOUT_MS);
        if (opts.toolDisplayMode === "required-v1" && (typeof opts.projectToolEvent !== "function" || typeof opts.registerToolDisplayProfile !== "function")) throw new Error("Pi required-v1 tool display capabilities are missing");
        const profileEnv = { ...process.env };
        const cfg = opts.config ?? resolvePiProviderConfig(opts, profileEnv);
        // 服务端工具配置（客户已批准 2026-10-16；**默认关**）。未知 id / 非法 max_uses ⇒ 构造期抛错
        // （一句话明确、不静默半开；与「缺 baseUrl 即抛」同口径）——在任何网络请求发生之前失败。
        const serverToolConfig = parseServerToolConfig(profileEnv);
        opts.registerToolDisplayProfile?.({ apiKeyEnvVar: cfg.apiKeyEnvVar, credentials: [...new Set([cfg.apiKeyEnvVar, ...(opts.toolDisplayCredentialEnvNames ?? [])])].map(name => ({ name, value: profileEnv[name] })) });
        log.trace(`构造单步时限=${constructMs}ms，prompt 时限=${promptMs}ms`);

        // 直接使用 Service 注入的交互闸（设计 G-1）：等待客户期间暂停每轮硬超时，
        // 使「卡在这等客户同意」的轮次不被 prompt 时限掐断。等待本身**缺省不设限**（见 tools.ts）；
        // prompt 时限只约束「非等待」的计算与生成时间。
        const interactionGate = opts.interactionGate;

        // 上下文窗口缺失时**不再硬失败**：采用保守默认值，并给出**可见**提示（日志 + 事件流，见下）。
        const contextWindowNotice = renderContextWindowNotice(cfg.contextWindowSource, cfg.contextWindow);
        if (contextWindowNotice !== undefined) log.stage(contextWindowNotice);

        // 分段进度：加载 Pi 包。
        diagnostics.record("session.construct.step", { state: "load_pi" });
        log.stage("加载 Pi 包…");
        const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await withTimeout(
          (dependencies.loadPi ?? loadPi)(),
          constructMs,
          "加载 Pi 包",
        );

        // 分段进度：构造显式 provider（baseUrl/model，内存凭据）。绝不打印凭据。
        diagnostics.record("session.construct.step", { state: "provider" });
        log.stage("构造显式 provider…");
        const { runtime, model } = await withTimeout(
          (dependencies.buildRuntime ?? buildExplicitRuntime)(cfg),
          constructMs,
          "构造显式 provider",
        );
        log.trace(`provider=${cfg.providerId} model=${cfg.modelId} baseUrl=${cfg.baseUrl}`);
        log.trace(`contextWindow=${String(model.contextWindow)}（来源：${cfg.contextWindowSource}）`);

        // 环境封闭：固定的 in-memory settings manager，绝不读 ~/.pi/agent/ 或 <项目>/.pi/ 的设置文件。
        // 不传则 SDK 会回落 SettingsManager.create（sdk.js:76 / resource-loader.js:243）。见 settings.ts。
        const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);

        const queue = createEventQueue<SessionEvent>();
        let lifecycle!: TurnLifecycle;
        const emit = (event: SessionEvent): void => {
          const detail = event.detail !== null && typeof event.detail === "object" ? event.detail : {};
          const isToolProjection = opts.projectToolEvent !== undefined && (typeof (detail as { toolName?: string }).toolName === "string" || (detail as { source?: string }).source === "tool-display-diagnostic");
          const turnId = event.turnId ?? (detail as { turnId?: string }).turnId ?? (isToolProjection ? undefined : lifecycle.currentTurnId());
          queue.push({ ...event, runtime: "pi", roleId: role.id, turnId, detail: { turnId, ...detail } });
        };
        lifecycle = createTurnLifecycle(emit, diagnostics, opts.currentTurnId);
        const callFacts = new Map<string, PiCallFacts>();
        // F-3-a：成功 submit_report 的 turnId 记账（「本轮已交报告」判据；同轮 = 同一 turnId）。
        let reportTurnId: string | undefined;
        const turnContext: PiToolEventContext = { currentTurnId: lifecycle.currentTurnId, diagnostics, projectToolEvent: opts.projectToolEvent, callFacts, roleId: role.id, inputRules: new Map(governedTools.map(tool => [tool.name, tool.displayInputRule])), noteReportSubmitted: (submittedTurnId) => { if (submittedTurnId !== undefined) reportTurnId = submittedTurnId; } };
        // 缺失上下文窗口的可见提示也进入事件流，确保界面/用户看得到（不只留在日志里）。
        if (contextWindowNotice !== undefined) emit({ kind: "message", summary: contextWindowNotice });
        // 服务端工具启用行（一次）：日志 + 聊天流各一条 + 诊断（只落计数与状态，不落工具清单外任何内容）。
        if (serverToolConfig.enabled.length > 0) {
          const notice = renderServerToolEnableNotice(serverToolConfig.enabled);
          log.stage(notice);
          emit({ kind: "message", summary: notice, detail: { source: "server-tools" } });
          diagnostics.record("server_tool.declare", { count: serverToolConfig.enabled.length, state: "enabled" });
        }

        // Injected definitions and the exact shared waiting gate are the production capability source.
        const allowedToolNames = new Set(governedTools.map((tool) => tool.name));
        const customTools = governedTools.map((tool) => toPiTool(tool, turnContext));
        const extension = buildGovernanceExtension(
          () => { throw new Error("生产工具判定必须由注入 handler 执行"); },
          emit, allowedToolNames.has("run_shell"),
          {
            ...turnContext, allowedToolNames,
            // 未启用（默认）时不传 serverTools ⇒ 扩展层零注册、零开销、行为逐字与旧版一致。
            ...(serverToolConfig.enabled.length > 0 ? { serverTools: { declarations: serverToolConfig.enabled } } : {}),
          },
        );

        const resourceLoader = new DefaultResourceLoader({
          cwd: opts.projectRoot,
          agentDir: opts.projectRoot,
          extensionFactories: [extension],
          noExtensions: true,
          systemPrompt: renderSystemPrompt(role),
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          // 显式传入封闭的 settings manager，堵住 resourceLoader 自身的 settings 回落。
          settingsManager,
        });

        // 分段进度：resourceLoader.reload（否则内联扩展不会被加载）。
        diagnostics.record("session.construct.step", { state: "resource_reload" });
        log.stage("resourceLoader.reload…");
        await withTimeout(resourceLoader.reload(), constructMs, "resourceLoader.reload");

        // 分段进度：createAgentSession。关内置工具，注册我们自己的受治理工具（含读）；显式注入 model、modelRuntime 与 settingsManager。
        // 生产由 storage 指定本角色 Pi native 目录；旧 sessionDir 仅直接 API 兼容。
        // 缺省为 in-memory，不读取或写入 ~/.pi。
        const sessionSelection = await selectSessionManager(SessionManager, {
          cwd: opts.projectRoot,
          sessionDir: opts.sessionDir,
          storage: opts.storage,
        });
        diagnostics.record("session.restore", { sessionId: sessionSelection.manager.getSessionId(), state: sessionSelection.mode, count: sessionSelection.skippedContaminated ?? 0 });
        if (sessionSelection.note !== undefined) {
          // 跳过污染会话 / 全污染改新建：**如实告知**（日志 + 事件流），不静默。
          log.stage(sessionSelection.note);
          emit({ kind: "message", summary: sessionSelection.note });
        }
        if (sessionSelection.mode === "resumed") {
          // 二次降噪（客户 2026-10-12 二次裁定，推翻此前「聊天流保留」的旧叙述）：恢复是**常规事件**——
          // 终端与**聊天流都不再出现恢复提示**（原 `emit({kind:"message"})` 已删）；仅 `ANS_PI_TRACE`
          // 打开时以 trace 输出，供排障。首轮只降终端、保留聊天流的那条决定已被客户明确推翻。
          log.trace(
            `会话已恢复：${sessionSelection.sessionFile ?? "（未知文件）"}（历史与模型上下文自该会话续起）`,
          );
          // 异常路径（与上面全污染 note 同口径）：跳过过含未知块的会话、仍恢复了干净旧档时，该事实**只在
          // 此分支可见**（此路径 note 为 undefined）——必须如实告知（stage + 事件流），不得静默吞掉；
          // 恢复本身（常规事件）仍不上聊天流。
          if (sessionSelection.skippedContaminated !== undefined) {
            const skipNotice =
              `检测到 ${sessionSelection.skippedContaminated} 个会话文件含网关不认识的工具变更块` +
              `（tool_removal/tool_addition），已跳过这些文件、恢复最新一条干净会话（不静默、不清洗历史）。`;
            log.stage(skipNotice);
            emit({ kind: "message", summary: skipNotice });
          }
        } else if (sessionSelection.mode === "created") {
          log.trace(`新会话（持久化目录：${opts.sessionDir ?? ""}；首条消息后才落盘）`);
        }

        diagnostics.record("session.construct.step", { state: "agent_session" });
        log.stage("createAgentSession…");
        const { session } = await withTimeout(
          createAgentSession({
            cwd: opts.projectRoot,
            noTools: "builtin",
            customTools,
            resourceLoader,
            model,
            modelRuntime: runtime,
            sessionManager: sessionSelection.manager,
            // 环境封闭：压缩等设置只由 ANS_SETTINGS_OVERRIDES 决定，不读任何项目外文件。
            settingsManager,
          }),
          constructMs,
          "createAgentSession",
        );

        const unexpected = session.getActiveToolNames().filter((name) => !allowedToolNames.has(name));
        if (unexpected.length) {
          session.dispose();
          throw new Error(`Pi 注册了非注入工具：${unexpected.join(", ")}`);
        }

        // settled 的**唯一**发射点（X-1）：见 wireSettledOnce 的理由注释。
        const unsubscribe = wireSettledOnce(session, emit, lifecycle);

        log.stage("bindRole 完成");
        diagnostics.record("session.construct.end", { ok: true });

        // 会话组装抽为 `makeRoleSession`（提案 P0-2「停当前轮次」）：prompt/events/dispose 逐字旧行为，
        // 另透传 abort（SDK session.abort()——语义与核实依据见该函数文档）。
        // F-3-a：收尾补发配置——env 开关（缺省开；`ANS_PI_LENGTH_FOLLOWUP` 显式关闭值可即时停用）
        // ∧ 注入工具集含 submit_report（无报告通道就无谓催交）；补发段时限缺省 = 本会话 promptMs。
        const lengthFollowupTimeoutMs = readOptionalTimeoutMs(process.env, LENGTH_FOLLOWUP_TIMEOUT_ENV);
        const lengthFollowup: LengthFollowupOptions | undefined =
          !isLengthFollowupDisabled(process.env) && allowedToolNames.has("submit_report")
            ? {
                enabled: true,
                text: LENGTH_FOLLOWUP_TEXT,
                ...(lengthFollowupTimeoutMs !== undefined ? { timeoutMs: lengthFollowupTimeoutMs } : {}),
                wasReportSubmitted: () => {
                  const id = lifecycle.currentTurnId();
                  return id !== undefined && reportTurnId === id;
                },
              }
            : undefined;
        const roleSession = makeRoleSession({ session, promptMs, gate: interactionGate, emit, log, queue, unsubscribe: () => { unsubscribe(); callFacts.clear(); }, lifecycle, diagnostics, abortTimeoutMs: 900, strictLifecycle: true, emitPromptInput: false, lengthFollowup });
        roleSession.runtime = "pi";
        roleSession.roleId = role.id;
        roleSession.contextSource = sessionSelection.contextSource ?? (sessionSelection.mode === "in-memory" ? "in-memory" : sessionSelection.mode === "resumed" ? "resumed" : sessionSelection.note ? "recovered" : "fresh");
        roleSession.nativeSessionId = sessionSelection.manager.getSessionId();
        roleSession.contextWarning = sessionSelection.note;
        return roleSession;
      } catch (error) {
        diagnostics.error("session.construct.failed", error);
        throw error;
      }
    },
  };
}

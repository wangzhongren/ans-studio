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
  WriteGate,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  ShellGate,
  CustomerInputFn,
  ReportHandbackFn,
  DispatchTaskFn,
  PromptImage,
  PromptOptions,
} from "../../provider/pi/session.ts";
import { buildGovernedTools, SHELL_TOOL_NAME, shellKillSwitch } from "../../provider/pi/tools.ts";
import { formatDenialMessage } from "./format-denial.ts";
import { createEventQueue } from "./event-queue.ts";
import {
  resolvePiProviderConfig,
  renderContextWindowNotice,
  type PiProviderConfig,
  type PiProviderConfigInput,
} from "./provider-config.ts";
import { ANS_SETTINGS_OVERRIDES } from "./settings.ts";
import { createStageLogger, type StageLogger } from "./logger.ts";
import {
  CONSTRUCT_TIMEOUT_ENV,
  DEFAULT_CONSTRUCT_TIMEOUT_MS,
  DEFAULT_PROMPT_TIMEOUT_MS,
  PROMPT_TIMEOUT_ENV,
  type InteractionGate,
  createInteractionGate,
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
  ToolExecutionMode,
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
  /** 恢复时 = 打开的会话文件；新建时 = 首次落盘将写到的文件（**惰性**：首条消息前不存在）。 */
  sessionFile?: string;
}

/**
 * 选会话管理器（设计 D-1，重启恢复）：
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
  opts: { cwd: string; sessionDir?: string },
): Promise<SessionManagerSelection> {
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
    const mostRecent = [...existing].sort((a, b) => b.modified.getTime() - a.modified.getTime())[0]!;
    return { mode: "resumed", manager: SessionManagerClass.open(mostRecent.path), sessionFile: mostRecent.path };
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

/** 我们自己的受治理工具定义（结构等价于 tools.ts 的 ToolDefinition，含可选 toolCallId / signal 透传）。 */
interface GovernedTool {
  name: string;
  handler(call: {
    name: string;
    args: Record<string, unknown>;
    /** 本次调用的 id（Pi 在 tool_call 时生成）；run_shell 把它透传给 ShellGate 供留痕用。 */
    toolCallId?: string;
    /** Pi execute 传入的中止信号（设计 A-6）；交互工具据此在会话中止时立即 fail-closed 返回。 */
    signal?: AbortSignal;
  }): Promise<{ ok: boolean; message: string }>;
}

/** describeTool 的返回：Pi 侧参数 schema、说明与可选的提示/执行模式（均按工具名分派）。 */
interface ToolPiDescription {
  parameters: Record<string, unknown>;
  description: string;
  /** 仅该工具激活时进系统提示的准则条目（SDK types.d.ts:455-456 的 promptGuidelines）。 */
  promptGuidelines?: string[];
  /** 每工具执行模式覆盖（SDK types.d.ts:497-499）：交互工具 = "sequential"（设计 A-6）。 */
  executionMode?: ToolExecutionMode;
}

/**
 * 每个受治理工具的 JSON-Schema 与说明（按名分派；run_shell 的 input 是 `{command}`，**没有 path**，见 §7.7）。
 * run_shell **不接受**任何 token 参数——票据机制已废（§7.1 第 3 条），审核在 execute 内、spawn 之前完成。
 *
 * 导出供**接线实测**使用（test/pi-adapter 的 executionMode/交互工具用例；本函数不调 SDK、纯数据）。
 */
export function describeTool(name: string): ToolPiDescription {
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
  if (name === "request_confirmation") {
    // 交互工具族（设计 A-1/A-2）：请求客户确认（可带预览——如角色卡 + 边界摘要）。
    // 说明**必须**写死流程：写盘前先取得 confirmed:true；未获同意 → 不写盘、如实告知（A-2）。
    // executionMode:"sequential"（A-6）：防止同批的 write_file 抢跑于确认（Pi 缺省同批并行执行工具）。
    return {
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "One-line summary of what you ask the customer to confirm" },
          preview: {
            type: "string",
            description:
              "Optional full content shown to the customer (e.g. the complete role card + boundary summary) so they can review before agreeing",
          },
          detail: { type: "string", description: "Optional extra detail shown with the request" },
        },
        required: ["title"],
        additionalProperties: true,
      },
      description:
        "向客户请求确认并**挂起等待其回应**（前端渲染成交互卡）。**在调用任何写盘工具（write_file/edit_file）之前**，" +
        "必须先用本工具把要写的内容呈给客户（如创立角色前：角色卡全文与边界摘要放进 preview），" +
        "仅当返回「客户已确认」时才落盘。未获同意（拒绝/超时/通道不可用）→ **不要写盘**，如实告知客户，不得假设同意。" +
        "**preview 必须列出将要写出的具体路径**（项目内相对路径，如 `角色卡/示例/role-card.md`）——写盘许可依 preview 所列路径发行；" +
        "**未列出的路径不会获得许可，写入会被门禁拒绝**。注意：列出路径**不等于**获准——获准的唯一凭据是 `confirmed:true`。",
      promptGuidelines: [
        "调用任何写盘工具（write_file / edit_file）之前，必须先经 request_confirmation 取得客户的**明确同意**" +
          "（返回「客户已确认」）；未获同意、超时或通道不可用 → **不要写盘**，如实告知客户，**不得假设同意**。",
        "创立或修改角色时：先把**角色卡全文 + 边界摘要**放进 request_confirmation 的 preview 请客户预览，同意后才写入。",
        "request_confirmation 的 preview **必须列出将要写出的具体路径**（每个待写文件一行，相对项目根、含目录，如 " +
          "`角色卡/示例/role-card.md`）——系统只对 preview 中**列出过**的路径发行写盘许可；**未列出的路径会被门禁拒绝**。" +
          "列出路径只是「已让客户看到要写什么」，**不等于获准**——是否获准**只看**返回的 `confirmed:true`。",
      ],
      executionMode: "sequential",
    };
  }
  if (name === "request_choice") {
    // 交互工具族（设计 A-1/A-2）：请求客户单选/多选（勾选）。同样 sequential（A-6）。
    return {
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short heading of the choice you ask the customer to make" },
          question: { type: "string", description: "Optional question text" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable option id returned in the selection" },
                label: { type: "string", description: "Text shown to the customer" },
                description: { type: "string", description: "Optional extra explanation" },
              },
              required: ["id", "label"],
              additionalProperties: true,
            },
            description: "Non-empty list of options; each id must be unique within this request",
          },
          multiple: { type: "boolean", description: "true = multi-select (checkboxes); default false = single-select" },
          preview: { type: "string", description: "Optional preview content shown to the customer (markdown)" },
        },
        required: ["title", "options"],
        additionalProperties: true,
      },
      description:
        "向客户请求选择（单选或多选勾选）并**挂起等待其回应**（前端渲染成交互卡）。" +
        "返回客户已选中的选项 id。**未获明确选择（拒绝/超时/通道不可用）→ 不要据此写盘，也不得擅自代选**；如实告知客户。" +
        "若 preview 里展示将要写出的内容，**必须列出具体路径**（相对项目根、含目录）——但注意：" +
        "**选择≠写盘同意**，写盘许可只随 request_confirmation 的 `confirmed:true` 发行；要写盘仍须另行经 request_confirmation 预览（含路径）并获确认。",
      promptGuidelines: [
        "需要客户在若干选项中做选择时用 request_choice；未获明确回答 → 不要据此写盘，也不得假设客户的选择。",
        "request_choice 的回答**不构成写盘同意**：要写盘必须另经 request_confirmation（preview 列出将要写出的具体路径）并取得 `confirmed:true`；" +
          "仅在本工具 preview 里展示过的路径**不会**因此获得写盘许可。",
      ],
      executionMode: "sequential",
    };
  }
  if (name === "submit_report") {
    // 交报告工具（设计 C-1）：无 path、无写权；说明写死「完成/确认无法完成时**必须**交报告，
    // 不得只在正文里说」，并**不得**暗示它有写权或改变写盘权限（它不写盘、不做治理判定）。
    return {
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["completed", "blocked"],
            description: "completed = this turn's task is done; blocked = you have confirmed it cannot be done",
          },
          summary: {
            type: "string",
            description: "Your own one-paragraph report of what you changed / produced (honest)",
          },
          evidence: {
            type: "array",
            items: {
              type: "string",
              description: "One piece of evidence: an artifact path, a change, or a test conclusion",
            },
            description: "Key evidence: artifact paths / changes / test results",
          },
        },
        required: ["status", "summary"],
        additionalProperties: true,
      },
      description:
        "向编排交回本轮任务报告（**回交给 su 汇总**，前端渲染成回交卡）。" +
        "**本轮任务完成——或你确认无法完成——时，必须先调用本工具交回报告**：`summary` 用一句话写清" +
        "**改了什么 / 产出了什么**，`evidence` 逐条给关键证据（产物路径 / 变更 / 测试结论）。" +
        "**不得只在正文里说而不交报告**。本工具**不写盘、不做治理判定、不改变任何写盘权限**——" +
        "写入仍须经 write_file/edit_file 与门禁；它只是把你写好的报告交回。",
      promptGuidelines: [
        "本轮任务完成前（或你确认无法完成时），**必须**调用 submit_report 交回报告：" +
          "一句话结论 + 改了哪些文件 / 产出了什么 + 关键证据（产物路径、变更、测试结论）。**不得只在正文里说而不交报告**。",
        "submit_report 只是**交报告**的通道：它不写盘、不做治理判定，也**不改变你的写盘权限**——" +
          "写入仍须经 write_file / edit_file 过门禁；报告内容要如实（做没做、通过没通过，照实写）。",
      ],
    };
  }
  if (name === "dispatch_task") {
    // 派发任务工具（设计 H-1，只给 su）：无 path、无写权。文案写死三条——派发≠授权 / 任务自足 / 返工带证据。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Target project role id (must be a project role, not su itself)" },
          task: {
            type: "string",
            description:
              "Self-contained task text: what to do, which document to follow, and the acceptance criteria " +
              "(the target role cannot see your context); for rework, restate the requirements and include the evidence",
          },
          reason: { type: "string", description: "Optional: why you are dispatching this task" },
        },
        required: ["roleId", "task"],
        additionalProperties: true,
      },
      description:
        "向目标角色**派发任务**（经编排路由成对方会话的一条输入；前端负责自动开会话/排队/去重）。" +
        "**派发 ≠ 授权**——你只能转移「任务与上下文」，**不能**授予或改变对方的写权：对方写入仍只来自它自己的" +
        "边界与 `request_confirmation` 的 `confirmed:true`。任务文本必须**自足**（对方看不到你的上下文）：" +
        "写清要做什么、依据哪份文档、完成标准；**返工**时把要求与证据一并写进任务文本。" +
        "roleId 必须是本项目角色（不能是你 su 自己）；本工具**不写盘、不做治理判定、不改变任何角色的写权**。",
      promptGuidelines: [
        "派发的是**任务与上下文**；**派发 ≠ 授权**——目标角色的写权仍只来自它自己的边界与 " +
          "`request_confirmation` 的 `confirmed:true`；不得在其任务文本里承诺或代授写权，也不得把派发当成对方「已获准」。",
        "dispatch_task 的任务文本要**自足**：目标角色看不到你的上下文——写清要做什么、依据哪份文档、完成标准。",
        "返工时把**要求与证据**一并写进任务文本（复述返工要求 + 相关证据/路径），避免对方凭猜返工。",
      ],
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
 * - execute 内调用我们自己的 handler，受治理语义完全由它决定；**把 Pi 的 toolCallId 与中止信号透传**
 *   给 handler（run_shell 把 toolCallId 交给 ShellGate 供留痕；交互工具用 signal 防悬挂，设计 A-6）；
 * - **promptGuidelines / executionMode** 也逐工具透传（A-2 的模型行为文案、A-6 的顺序执行）。
 *
 * 导出供**接线实测**使用（test/pi-adapter 的 executionMode 用例直接走本函数再进真实会话链路）。
 */
export function toPiTool(tool: GovernedTool): ToolDefinition {
  const { parameters, description, promptGuidelines, executionMode } = describeTool(tool.name);
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
    ): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> {
      const record = (args !== null && typeof args === "object" ? args : {}) as Record<string, unknown>;
      const result = await tool.handler({ name: tool.name, args: record, toolCallId, signal });
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

// —————————————————————— 角色会话的 prompt 包装（设计 K-2 图片透传 / G-1 可暂停时限） ——————————————————————

/** 包装所需的底层会话面（结构上兼容 AgentSession；导出工厂便于**接线测试用桩件替换**）。 */
export interface PromptCapableSession {
  prompt(text: string, options?: { images: PromptImage[] }): Promise<void>;
  abort(): Promise<void>;
}

/**
 * 构造 `RoleSession.prompt`（**导出供接线测试**——桩件即可断言透传，无需真实模型、不发请求）：
 * - **无 `opts` 时逐字保留旧行为**（纯文本：向 SDK 传 `prompt(text)`、**不传 options**）；
 * - 带图（K-2）：`session.prompt(text, { images })` **原样透传**——**不按 `Model.input` 门控**（模型是否
 *   多模态不由本层猜）；SDK 发送时自行转 wire（`source{type:base64,media_type,data}`）；事件流可见
 *   「附 N 张图片」；
 * - 每轮硬超时**可暂停**（G-1）：客户输入挂起期间计时停走，作答后续算剩余时间；
 * - 失败如实外推（两条路径都不吞）：异常 → 事件流「pi 适配器中止：…」+ `abort()` 底层 + 向上抛出；
 *   SDK 以 `stopReason:"error"` 消息收束的轮次走既有 `message_end`→message 事件外推。
 */
export function makeRolePrompt(deps: {
  session: PromptCapableSession;
  promptMs: number;
  gate: InteractionGate;
  emit: (event: SessionEvent) => void;
  log: StageLogger;
}): (text: string, opts?: PromptOptions) => Promise<void> {
  const { session, promptMs, gate, emit, log } = deps;
  return async function prompt(text: string, opts?: PromptOptions): Promise<void> {
    const images = opts?.images !== undefined && opts.images.length > 0 ? opts.images : undefined;
    emit({
      kind: "message",
      summary: images !== undefined ? `用户指令：${text}（附 ${images.length} 张图片）` : `用户指令：${text}`,
    });
    log.stage("prompt 发出");
    try {
      // 每轮硬超时**可暂停**（G-1）：客户输入挂起期间计时停走，作答后续算剩余时间。
      const calling = images !== undefined ? session.prompt(text, { images }) : session.prompt(text);
      await withPausableTimeout(calling, promptMs, "prompt", gate);
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
  };
}

// —————————————————————— 适配器本体 ——————————————————————

export interface RealPiAdapterOptions extends PiProviderConfigInput {
  gate: WriteGate;
  projectRoot: string;
  skillRoot: string;
  /** shell 命令级闸（设计 §7.2）；由编排装配后注入。**缺省时 run_shell 不注册**（§7.5.1）。 */
  shellGate?: ShellGate;
  /**
   * 客户确认制交互能力（设计 A-1）；由编排/前端构造、注入。**缺省时 `request_confirmation` /
   * `request_choice` 不注册**（判据是「有无客户通道」，同 `shellGate` 的注入先例）。
   */
  customerInput?: CustomerInputFn;
  /**
   * 交互等待硬超时（毫秒）；**缺省不设限**（设计 G-1：卡在这等客户同意）——仅显式给出或环境变量
   * `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS` 才计时。等待期间活动闸暂停每轮硬超时（见 `withPausableTimeout`），
   * 故不再需要 A-6 时代的「等待时限 < prompt 时限」收敛（已随 G-1 删除）。
   */
  customerInputTimeoutMs?: number;
  /**
   * 交报告能力（设计 C-1）；由编排构造、注入。**缺省时 `submit_report` 不注册**（判据是「本会话有
   * 回交目标」；只给**项目角色**——su 不注入即不注册，同 `shellGate`/`customerInput` 的注入先例）。
   */
  reportHandback?: ReportHandbackFn;
  /**
   * 派发任务能力（设计 H-1）；由编排构造、注入。**缺省时 `dispatch_task` 不注册**
   * （**只给 su**——由编排以是否注入表达，同 `shellGate` 先例）。
   */
  dispatchTask?: DispatchTaskFn;
  /**
   * 会话持久化目录（设计 D-1，重启恢复）。**给了** ⇒ 会话以 JSONL 落盘于该目录：目录内有最近会话即
   * `open` 恢复、否则 `create` 新建（**应逐角色隔离**，如 `<项目>/.ans/sessions/<角色>/`——共用一目录
   * 会互相恢复）。**缺省** ⇒ 逐字保留 `SessionManager.inMemory` 旧行为（不落盘）。适配器只读写该目录，
   * **不碰 `~/.pi`**（封闭性论证见 `selectSessionManager` 文档）。
   */
  sessionDir?: string;
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

      // 交互挂起活动闸（设计 G-1）：等待客户期间**暂停每轮硬超时**（作答后按剩余时间恢复），
      // 使「卡在这等客户同意」的轮次不被 prompt 时限掐断。等待本身**缺省不设限**（见 tools.ts）；
      // prompt 时限只约束「非等待」的计算与生成时间。
      const interactionGate = createInteractionGate();

      // 上下文窗口缺失时**不再硬失败**：采用保守默认值，并给出**可见**提示（日志 + 事件流，见下）。
      const contextWindowNotice = renderContextWindowNotice(cfg.contextWindowSource, cfg.contextWindow);
      if (contextWindowNotice !== undefined) log.stage(contextWindowNotice);

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
      log.trace(`contextWindow=${String(model.contextWindow)}（来源：${cfg.contextWindowSource}）`);

      // 环境封闭：固定的 in-memory settings manager，绝不读 ~/.pi/agent/ 或 <项目>/.pi/ 的设置文件。
      // 不传则 SDK 会回落 SettingsManager.create（sdk.js:76 / resource-loader.js:243）。见 settings.ts。
      const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);

      const queue = createEventQueue<SessionEvent>();
      const emit = (event: SessionEvent): void => queue.push(event);
      // 缺失上下文窗口的可见提示也进入事件流，确保界面/用户看得到（不只留在日志里）。
      if (contextWindowNotice !== undefined) emit({ kind: "message", summary: contextWindowNotice });

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
        // 交互工具族：**仅当注入了客户通道时注册**（设计 A-1）；等待缺省不设限（G-1），
        // 显式配置的时限原样透传；等待期间经活动闸暂停每轮硬超时。
        customerInput: opts.customerInput,
        customerInputTimeoutMs: opts.customerInputTimeoutMs,
        interactionGate,
        // 交报告工具：**仅当注入了回交能力时注册**（设计 C-1；只给项目角色）。
        reportHandback: opts.reportHandback,
        // 派发任务工具：**仅当注入了派发能力时注册**（设计 H-1；只给 su）。
        dispatchTask: opts.dispatchTask,
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
      // 会话管理器（设计 D-1）：给了 sessionDir ⇒ 项目内 JSONL 持久会话（目录内有最近会话即恢复）；
      // 缺省 ⇒ 逐字保留 in-memory 旧行为。恢复的可用性/一致性坑见 selectSessionManager 文档。
      const sessionSelection = await selectSessionManager(SessionManager, {
        cwd: opts.projectRoot,
        sessionDir: opts.sessionDir,
      });
      if (sessionSelection.mode === "resumed") {
        const notice = `会话已恢复：${sessionSelection.sessionFile ?? "（未知文件）"}（历史与模型上下文自该会话续起）`;
        log.stage(notice);
        emit({ kind: "message", summary: notice });
      } else if (sessionSelection.mode === "created") {
        log.stage(`新会话（持久化目录：${opts.sessionDir ?? ""}；首条消息后才落盘）`);
      }

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

      const unsubscribe = session.subscribe((event): void => {
        if (event.type === "agent_settled") {
          emit({ kind: "settled", summary: "会话结束" });
        }
      });

      log.stage("bindRole 完成");

      return {
        // prompt 包装抽为 `makeRolePrompt`（K-2）：图片透传 / 可暂停时限 / 失败外推都在那处，且可直接单测。
        prompt: makeRolePrompt({ session, promptMs, gate: interactionGate, emit, log }),
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

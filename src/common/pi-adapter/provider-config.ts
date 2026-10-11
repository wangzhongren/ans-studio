// 显式 provider 配置的解析与校验（方案 b）。
//
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
//
// 安全红线（务必遵守）：
// 1. 凭据**可写入指定的本地配置 `.env`（已 gitignore、不入库）**；但**绝不可写入任何入库文件**，
//    也**绝不可被打印/回显到日志或界面之外**。
//    ——【2026-10-11 客户已确认改写本条；下列**原措辞已被本决定取代**（保留原文留痕，勿删）】：
//       「绝不把凭据写入任何文件——凭据只在运行时从环境变量读取，经内存 CredentialStore 注入。」
//    改写原因：桌面应用要做 Pi 配置界面，把设置（**含 token**）保存到 `.env`；`.env` 已 gitignore、
//    不入库、已在装配边界内、token 也确实住在那里——故这是给**已有落点**加一个**自动写入**，
//    不是新增落点。原文「程序自己从不写凭据文件」随之不再成立。
// 2. 绝不带着凭据请求默认的 https://api.anthropic.com。base URL 必须由调用方显式给出
//    （opts.baseUrl 或环境变量 ANS_PI_BASE_URL）；缺失时**明确失败**，不回落到任何默认端点。
//
// 本文件**不 import 任何 Pi 包**，可在纯单测（未安装 Pi）中加载。
// 绝不读取或打印凭据的值——只检查其**存在性**（本条不因红线改写而变）。

export interface PiProviderConfigInput {
  /** provider 标识；缺省 ANS_PI_PROVIDER，再缺省 "ans-gateway"。 */
  providerId?: string;
  /** 显式 base URL；缺省环境变量 ANS_PI_BASE_URL。**无硬编码默认值**。 */
  baseUrl?: string;
  /** 显式 model id；缺省环境变量 ANS_PI_MODEL。**无硬编码默认值**。 */
  modelId?: string;
  /** 承载凭据的环境变量名；缺省 "ANTHROPIC_AUTH_TOKEN"。 */
  apiKeyEnvVar?: string;
  /**
   * 真实模型的上下文窗口（tokens）；缺省环境变量 ANS_PI_CONTEXT_WINDOW。
   * **可选**（优先级：显式值 > 环境变量 > 保守默认 DEFAULT_PI_CONTEXT_WINDOW）：
   * 缺失时**不再硬失败**——回落到一个**保守**默认值并给出可见提示，免得用户为了用起来还得
   * 跑去服务商那儿手查自己模型的窗口大小。给了但**非法**（0 / 负数 / 非数）**仍明确失败**。
   *
   * 背景：模型克隆自 anthropic 模板，模板值是 claude 的 1,000,000，与网关上的真实模型无关。
   * 沿用模板值会让 pi 的自动压缩阈值（contextWindow − reserveTokens）永远够不着，长会话先吃到
   * 服务端超长报错——故缺失时**绝不能**回落到模板值，只能回落到一个保守的小值
   * （见 DEFAULT_PI_CONTEXT_WINDOW 的论证）。
   */
  contextWindow?: number;
}

/** `contextWindow` 的来源：显式 `opts.contextWindow` / 环境变量 / 保守默认。 */
export type ContextWindowSource = "explicit" | "env" | "default";

export interface PiProviderConfig {
  providerId: string;
  baseUrl: string;
  modelId: string;
  apiKeyEnvVar: string;
  /** 上下文窗口（tokens）：显式/环境变量/保守默认三者解析后的**具体值**（恒为正数）。 */
  contextWindow: number;
  /** `contextWindow` 的来源；`"default"` 表示用了保守默认值（适配器据此给出可见提示）。 */
  contextWindowSource: ContextWindowSource;
}

const DEFAULT_PROVIDER_ID = "ans-gateway";
const DEFAULT_API_KEY_ENV = "ANTHROPIC_AUTH_TOKEN";

/**
 * 未显式给出上下文窗口时的**保守默认值**（tokens）。
 *
 * ── 为什么默认必须「保守」（宁可小、不可大）──
 * 两个方向的代价**不对称**：
 *   · 默认偏**小** → Pi 的自动压缩阈值（contextWindow − reserveTokens）**提前**到达 → 最多多压缩几次，
 *     属**良性**；
 *   · 默认偏**大** → 阈值够不着、压缩**永不触发** → 长会话先吃**服务端超长报错**、会话**炸掉**——正是
 *     anthropic 模板那个 1,000,000 造成的问题。
 * 故缺失时应倒向「小」。
 *
 * ── 为什么取 32768，而不再小/再大 ──
 *   · **不能 ≤ 16384**：Pi 压缩的 reserveTokens 被钉为 16384（`settings.ts` 的 ANS_SETTINGS_OVERRIDES，
 *     等同 Pi 内置缺省）。若 contextWindow ≤ 16384，则阈值 contextWindow − reserveTokens ≤ 0，
 *     `shouldCompact`（compaction.js:173，判 `contextTokens > contextWindow − reserveTokens`）会**几乎每轮
 *     都触发**——退化、抖动，**不是**「良性」。故必须严格 > reserveTokens。
 *   · **取 32768（32k）**：阈值 = 32768 − 16384 = 16384，**切实为正**且留有真实工作余量；同时 32k 是当下
 *     网关所服务指令模型的**事实下限**（32k/64k/128k… 很普遍），故对绝大多数模型都**不会**超过其真实窗口
 *     ——正落在「宁可小」的安全方向。它比模板值 1,000,000 小约 30 倍，压缩终于会真正发生。
 *   · 若某模型真实窗口确实 < 32768（罕见），用户以 ANS_PI_CONTEXT_WINDOW / opts.contextWindow 覆盖即可；
 *     宁可偶尔「多压几次」，也不要「窗口设大 → 会话炸掉」。
 */
export const DEFAULT_PI_CONTEXT_WINDOW = 32768;

function pick(explicit: string | undefined, envValue: string | undefined): string {
  const value = explicit ?? envValue ?? "";
  return value.trim();
}

/** 校验上下文窗口取值：必须是**正整数**（tokens）；否则**明确失败**（配置错误不该被静默吞掉）。 */
function assertContextWindow(raw: number, shown: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(`上下文窗口必须是正数（tokens）：ANS_PI_CONTEXT_WINDOW=${String(shown)}。`);
  }
  return Math.floor(raw);
}

/**
 * 解析上下文窗口的**来源与取值**。显式值优先，其次环境变量；都没给 →
 * `{ value: undefined, source: "default" }`（由 resolvePiProviderConfig 回落到**保守默认值**，不再硬失败）。
 * 给了但非法**明确失败**——配置错误不该被静默吞掉。
 */
function parseContextWindow(
  explicit: number | undefined,
  envValue: string | undefined,
):
  | { value: number; source: "explicit" | "env" }
  | { value: undefined; source: "default" } {
  if (explicit !== undefined) return { value: assertContextWindow(explicit, explicit), source: "explicit" };
  if (envValue !== undefined && envValue.trim() !== "") {
    return { value: assertContextWindow(Number(envValue.trim()), envValue), source: "env" };
  }
  return { value: undefined, source: "default" };
}

/**
 * 解析并校验显式 provider 配置。baseUrl / modelId / 凭据任一缺失即抛错（fail-closed），
 * 从而在任何网络请求发生之前阻止回落到默认端点。
 * **例外**：`contextWindow` 为**可选**——缺失回落到保守默认值（不抛错），仅非法值才抛错。
 */
export function resolvePiProviderConfig(
  input: PiProviderConfigInput,
  env: Record<string, string | undefined>,
): PiProviderConfig {
  const providerId = (input.providerId ?? env["ANS_PI_PROVIDER"] ?? DEFAULT_PROVIDER_ID).trim();
  const baseUrl = pick(input.baseUrl, env["ANS_PI_BASE_URL"]);
  const modelId = pick(input.modelId, env["ANS_PI_MODEL"]);
  const apiKeyEnvVar = input.apiKeyEnvVar ?? DEFAULT_API_KEY_ENV;
  const parsed = parseContextWindow(input.contextWindow, env["ANS_PI_CONTEXT_WINDOW"]);
  // 缺失（显式与环境变量都没给）**不再硬失败**：回落到**保守默认值**（宁可小不可大，论证见上方常量）。
  const contextWindow = parsed.value ?? DEFAULT_PI_CONTEXT_WINDOW;
  const contextWindowSource: ContextWindowSource = parsed.value === undefined ? "default" : parsed.source;

  if (baseUrl === "") {
    throw new Error(
      "缺少 base URL：请通过 opts.baseUrl 或环境变量 ANS_PI_BASE_URL 显式提供。" +
        "为避免把凭据发往未知端点，这里不会回落到任何默认 base URL。",
    );
  }
  if (modelId === "") {
    throw new Error("缺少 model id：请通过 opts.modelId 或环境变量 ANS_PI_MODEL 显式提供。");
  }
  if (env[apiKeyEnvVar] === undefined || env[apiKeyEnvVar] === "") {
    // 只检查存在性；不读取、不打印其值。
    throw new Error(
      `缺少凭据：环境变量 ${apiKeyEnvVar} 未设置。` +
        "本程序只检查其存在性，不读取、不打印其值；凭据绝不写入入库文件、绝不回显到日志或界面之外。",
    );
  }
  return { providerId, baseUrl, modelId, apiKeyEnvVar, contextWindow, contextWindowSource };
}

/**
 * 用了保守默认值时的**可见提示**文案（供适配器同时打进日志与事件流）；非默认来源返回 `undefined`。
 * 让用户知道「用的是默认值」以及「怎么覆盖」，而**不是**硬失败（这正是本次改动的目的：
 * 不把「查自己模型窗口大小」的负担转嫁给用户）。
 */
export function renderContextWindowNotice(source: ContextWindowSource, value: number): string | undefined {
  if (source !== "default") return undefined;
  return (
    `未配置上下文窗口（opts.contextWindow 与 ANS_PI_CONTEXT_WINDOW 均未给出）：已采用保守默认值 ` +
    `${value} tokens。默认偏小 → 压缩可能提前触发（良性）；如需精确值，请设置 ANS_PI_CONTEXT_WINDOW ` +
    `或传入 opts.contextWindow。`
  );
}

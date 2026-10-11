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
   * **必须显式给出**：模型克隆自 anthropic 模板，模板值是 claude 的 1,000,000，
   * 与网关上的真实模型无关。沿用模板值会让 pi 的自动压缩阈值（contextWindow − reserveTokens）
   * 永远够不着，长会话先吃到服务端超长报错——故缺失时与缺 baseUrl/modelId 一样**硬失败**
   * （见 resolvePiProviderConfig），不再静默回落到模板值。
   */
  contextWindow?: number;
}

export interface PiProviderConfig {
  providerId: string;
  baseUrl: string;
  modelId: string;
  apiKeyEnvVar: string;
  /** 上下文窗口；**必需**——缺失即 fail-closed（见 resolvePiProviderConfig）。 */
  contextWindow: number;
}

const DEFAULT_PROVIDER_ID = "ans-gateway";
const DEFAULT_API_KEY_ENV = "ANTHROPIC_AUTH_TOKEN";

function pick(explicit: string | undefined, envValue: string | undefined): string {
  const value = explicit ?? envValue ?? "";
  return value.trim();
}

/**
 * 解析上下文窗口。显式值优先，其次环境变量；都没给返回 undefined，
 * 由调用方（resolvePiProviderConfig）据此**硬失败**——不再回落到模板值。
 * 给了但非法**明确失败**——配置错误不该被静默吞掉。
 */
function parseContextWindow(explicit: number | undefined, envValue: string | undefined): number | undefined {
  const raw = explicit ?? (envValue !== undefined && envValue.trim() !== "" ? Number(envValue.trim()) : undefined);
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(
      `上下文窗口必须是正数（tokens）：ANS_PI_CONTEXT_WINDOW=${String(explicit ?? envValue)}。`,
    );
  }
  return Math.floor(raw);
}

/**
 * 解析并校验显式 provider 配置。任一必需项缺失即抛错（fail-closed），
 * 从而在任何网络请求发生之前阻止回落到默认端点。
 */
export function resolvePiProviderConfig(
  input: PiProviderConfigInput,
  env: Record<string, string | undefined>,
): PiProviderConfig {
  const providerId = (input.providerId ?? env["ANS_PI_PROVIDER"] ?? DEFAULT_PROVIDER_ID).trim();
  const baseUrl = pick(input.baseUrl, env["ANS_PI_BASE_URL"]);
  const modelId = pick(input.modelId, env["ANS_PI_MODEL"]);
  const apiKeyEnvVar = input.apiKeyEnvVar ?? DEFAULT_API_KEY_ENV;
  const contextWindow = parseContextWindow(input.contextWindow, env["ANS_PI_CONTEXT_WINDOW"]);

  if (baseUrl === "") {
    throw new Error(
      "缺少 base URL：请通过 opts.baseUrl 或环境变量 ANS_PI_BASE_URL 显式提供。" +
        "为避免把凭据发往未知端点，这里不会回落到任何默认 base URL。",
    );
  }
  if (modelId === "") {
    throw new Error("缺少 model id：请通过 opts.modelId 或环境变量 ANS_PI_MODEL 显式提供。");
  }
  if (contextWindow === undefined) {
    throw new Error(
      "缺少上下文窗口：请通过 opts.contextWindow 或环境变量 ANS_PI_CONTEXT_WINDOW 显式提供。" +
        "该值是必需项——模型克隆自 anthropic 模板（其 contextWindow 为 1,000,000，与网关上的真实模型无关），" +
        "沿用模板值会让 pi 的自动压缩阈值永远够不着，长会话会先收到服务端超长报错，而不是优雅压缩。" +
        "请填写网关真实模型的上下文窗口（tokens）。",
    );
  }
  if (env[apiKeyEnvVar] === undefined || env[apiKeyEnvVar] === "") {
    // 只检查存在性；不读取、不打印其值。
    throw new Error(
      `缺少凭据：环境变量 ${apiKeyEnvVar} 未设置。` +
        "本程序只检查其存在性，不读取、不打印其值；凭据绝不写入入库文件、绝不回显到日志或界面之外。",
    );
  }
  return { providerId, baseUrl, modelId, apiKeyEnvVar, contextWindow };
}

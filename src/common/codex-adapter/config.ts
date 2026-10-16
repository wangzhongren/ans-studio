import { RUNTIME_CREDENTIAL_ENV_VARS } from "../shared/runtime-shared.ts";
import type { RuntimeProviderOptions, InstalledMcpServerV1 } from "../../model/runtime.ts";
import type { ReasoningEffortV1 } from "../../model/runtime.ts";
import { isReasoningEffortV1 } from "../runtime-core/reasoning.ts";
import { object } from "./protocol.ts";

// Verified from the official config schema and codex 0.162.0-alpha.17.2 features list.
export const DISABLED_NATIVE_FEATURES = [
  "shell_tool", "hooks", "apps", "plugins", "remote_plugin", "browser_use",
  "browser_use_external", "browser_use_full_cdp_access", "in_app_browser", "computer_use",
  "code_mode", "code_mode_host", "multi_agent", "multi_agent_v2", "request_permissions_tool",
  "skill_mcp_dependency_install",
] as const;

/** Server-side web search capability: explicit option wins, ANS_CODEX_WEB_SEARCH (on|off) is the fallback, both default off. */
export function webSearchEnabled(option: unknown, environment: string | undefined): boolean {
  if (option !== undefined) {
    if (typeof option !== "boolean") throw new Error("Codex invalid web search option");
    return option;
  }
  const value = environment?.trim();
  if (!value) return false;
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error("Codex ANS_CODEX_WEB_SEARCH must be on or off");
}

export function settings(options: RuntimeProviderOptions & { webSearch?: boolean }, env: Record<string, string | undefined>) {
  if (options.runtime !== "codex") throw new Error("Codex adapter requires runtime codex");
  const model = (options.modelId ?? env.ANS_CODEX_MODEL)?.trim();
  if (!model) throw new Error("Codex requires ANS_CODEX_MODEL or modelId");
  const keyName = options.apiKeyEnvVar ?? (env.CODEX_API_KEY ? "CODEX_API_KEY" : "OPENAI_API_KEY");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyName)) throw new Error("Codex invalid credential environment variable name");
  const key = env[keyName];
  if (!key?.trim()) throw new Error("Codex requires an API key (CODEX_API_KEY or configured source)");
  const base = (options.baseUrl ?? env.ANS_CODEX_BASE_URL)?.trim() || "https://api.openai.com/v1";
  let url: URL;
  try { url = new URL(base); } catch { throw new Error("Codex invalid API base URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Codex API base URL must be HTTP(S) without credentials");
  }
  const secrets = [...RUNTIME_CREDENTIAL_ENV_VARS, keyName].map(name => env[name]).filter((value): value is string => !!value);
  // G-5：档位校验（纵深防御——Service 已归一五值；越界＝上游契约破坏，装配前抛错、零副作用）。
  const effort = options.reasoningEffort;
  if (effort !== undefined && !isReasoningEffortV1(effort)) throw new Error("Codex invalid reasoning effort option");
  const redact = (input: unknown): string => {
    let result = input instanceof Error ? input.message : String(input);
    for (const secret of [...new Set(secrets)].sort((a, b) => b.length - a.length)) result = result.split(secret).join("[REDACTED]");
    // 与 tool-display `cleanPatterns` 同口径 A-base 收窄（2026-10-16 同批检查：确为同类贪婪模式——
    // 同一 `https?://[^\s<>"']+` 类，URL 紧贴全角标点（无 ASCII 空白）时吞其后文本；收窄＝排除集只增
    // CJK 标点块　-〿与全角形式块＀-￯，匹配范围只紧不松）。URL 紧贴全角标点时不再吞其后文本（诊断
    // 文本防丢尾/mojibake）；匹配后的归一处理（剥 userinfo/query）逐字不变。
    result = result.replace(/https?:\/\/[^\s<>"'　-〿＀-￯]+/g, matched => {
      try { const address = new URL(matched); address.username = ""; address.password = ""; address.search = ""; return address.toString(); } catch { return "[URL]"; }
    });
    return result;
  };
  return { model, key, keyName, baseUrl: url.toString().replace(/\/$/, ""), redact, webSearch: webSearchEnabled(options.webSearch, env.ANS_CODEX_WEB_SEARCH), reasoningEffort: effort };
}

/**
 * G-5 单一编码来源：`model_reasoning_effort` 进程覆盖串（冻结映射＝`src/model/runtime.ts`
 * `reasoningEffort` 字段注释）。`low/medium/high/xhigh` ⇒ `-c model_reasoning_effort="<值>"`
 * （顶层标量键，独立一条安全——P0 探针铁律只约束根 map 键）；**`off`＝平台无该档，不注入**
 * （适配器会话面另有如实说明行，不假装关闭）；未设 ⇒ 不产（逐字现状）。0.162.1 真 CLI 探针实证：
 * 回读原样、上游 `reasoning:{effort:"<值>",summary:"auto"}` 落点生效；无效值 config 层不拦（本仓前置校验）。
 */
export function reasoningEffortOverride(effort: ReasoningEffortV1 | undefined): string | undefined {
  if (effort === undefined || effort === "off") return undefined;
  return `model_reasoning_effort=${JSON.stringify(effort)}`;
}

/** Pin 1: thread configuration. Top-level web_search="live" is the verified injection key (T3 matrix, 2026-10-16). */
export function safetyConfig(cwd: string, webSearch = false): Record<string, unknown> {
  return {
    features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map(name => [name, false])),
    sandbox_mode: "read-only", approval_policy: "never", approvals_reviewer: "user",
    web_search: webSearch ? "live" : "disabled", projects: { [cwd]: { trust_level: "untrusted" } },
  };
}

/**
 * G-4 V2（P2）：已安装 MCP 的 per-call 超时（秒；评估 R6——外来 server 单调用不得挂到轮级时限；
 * P0 探针实证 `tool_timeout_sec` 为 per-call 键且 0.25s 生效）。策略值，集中单点可调。
 */
export const INSTALLED_MCP_TOOL_TIMEOUT_SEC = 300;

/**
 * G-4 V2（P2）单一编码来源：`mcp_servers` 根 map 覆盖串——白名单定义＋禁用集**必须编入同一条**
 * （P0 探针铁律：连续两条 `-c` 同根键＝后者整体覆盖、不合并）。全部字符串 `JSON.stringify`
 * 编码＝TOML 基本字符串（探针逐字实证：空格/引号/反斜杠/中文/空串全往返）。白名单定义携带
 * `default_tools_approval_mode="approve"`（探针：不配则 `approval_policy:"never"` 下内核直接
 * 拒调用——「装什么≈能跑什么」＝白名单＋approve 两键）与 `tool_timeout_sec`。
 * 零条目 ⇒ `undefined`（不产覆盖——逐字现状）。
 */
export function mcpServersOverride(disabledServers: readonly string[], installed: readonly InstalledMcpServerV1[] = []): string | undefined {
  if (disabledServers.length === 0 && installed.length === 0) return undefined;
  const quote = (value: string) => JSON.stringify(value);
  const entries: string[] = [];
  for (const server of installed) {
    const fields = [`command=${quote(server.command)}`];
    if (server.args.length) fields.push(`args=[${server.args.map(quote).join(",")}]`);
    if (server.env && Object.keys(server.env).length) fields.push(`env={${Object.entries(server.env).map(([name, value]) => `${quote(name)}=${quote(value)}`).join(",")}}`);
    fields.push(`default_tools_approval_mode="approve"`);
    fields.push(`tool_timeout_sec=${INSTALLED_MCP_TOOL_TIMEOUT_SEC}`);
    entries.push(`${quote(server.name)}={${fields.join(",")}}`);
  }
  for (const name of disabledServers) entries.push(`${quote(name)}={enabled=false}`);
  return `mcp_servers={${entries.join(",")}}`;
}

/** CLI TOML overrides stay structural; never interpolate these strings into a shell. Pin 2: process-level overlay moves with pin 1. */
export function safetyOverrides(cwd: string, disabledServers: readonly string[] = [], webSearch = false, installed: readonly InstalledMcpServerV1[] = []): string[] {
  const mcpMap = mcpServersOverride(disabledServers, installed);
  return [
    ...DISABLED_NATIVE_FEATURES.map(name => `features.${name}=false`),
    'sandbox_mode="read-only"', 'approval_policy="never"', 'approvals_reviewer="user"', `web_search="${webSearch ? "live" : "disabled"}"`,
    // CLI dotted override parsing does not preserve quoted arbitrary map keys.
    // Root TOML maps overlay by key; one `-c` value must carry the whole `mcp_servers`
    // map (P0 probe: consecutive `-c` values with the same root key replace, not merge).
    `projects={${JSON.stringify(cwd)}={trust_level="untrusted"}}`,
    ...(mcpMap !== undefined ? [mcpMap] : []),
  ];
}

/** Pin 3: config/read readback must match the requested posture (capability on = "live"), fail-closed otherwise. */
export function effectiveConfig(response: unknown, webSearch = false) {
  const config = object(object(response, "config/read response").config, "effective config");
  const features = object(config.features, "features");
  for (const name of DISABLED_NATIVE_FEATURES) {
    if (features[name] !== false) throw new Error(`Codex native feature ${name} was not disabled`);
  }
  if (config.sandbox_mode !== "read-only" || config.approval_policy !== "never" || config.web_search !== (webSearch ? "live" : "disabled")) {
    throw new Error("Codex effective sandbox/approval/search restrictions were not applied");
  }
  const servers = object(config.mcp_servers ?? {}, "MCP config");
  return { config, servers, enabled: Object.entries(servers).filter(([, value]) => object(value, "MCP entry").enabled !== false).map(([name]) => name) };
}

export function verifyThread(response: unknown): string {
  const result = object(response, "thread response");
  if (result.approvalPolicy !== "never" || object(result.sandbox, "native sandbox").type !== "readOnly") {
    throw new Error("Codex native thread did not retain read-only/never restrictions");
  }
  const id = object(result.thread, "native thread").id;
  if (typeof id !== "string" || !id) throw new Error("Codex native thread has no ID");
  return id;
}

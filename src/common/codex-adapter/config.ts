import { RUNTIME_CREDENTIAL_ENV_VARS } from "../shared/runtime-shared.ts";
import type { RuntimeProviderOptions } from "../../model/runtime.ts";
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
  return { model, key, keyName, baseUrl: url.toString().replace(/\/$/, ""), redact, webSearch: webSearchEnabled(options.webSearch, env.ANS_CODEX_WEB_SEARCH) };
}

/** Pin 1: thread configuration. Top-level web_search="live" is the verified injection key (T3 matrix, 2026-10-16). */
export function safetyConfig(cwd: string, webSearch = false): Record<string, unknown> {
  return {
    features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map(name => [name, false])),
    sandbox_mode: "read-only", approval_policy: "never", approvals_reviewer: "user",
    web_search: webSearch ? "live" : "disabled", projects: { [cwd]: { trust_level: "untrusted" } },
  };
}

/** CLI TOML overrides stay structural; never interpolate these strings into a shell. Pin 2: process-level overlay moves with pin 1. */
export function safetyOverrides(cwd: string, disabledServers: readonly string[] = [], webSearch = false): string[] {
  return [
    ...DISABLED_NATIVE_FEATURES.map(name => `features.${name}=false`),
    'sandbox_mode="read-only"', 'approval_policy="never"', 'approvals_reviewer="user"', `web_search="${webSearch ? "live" : "disabled"}"`,
    // CLI dotted override parsing does not preserve quoted arbitrary map keys.
    // Root TOML maps merge, so explicitly overlay enabled=false for every discovered ID.
    `projects={${JSON.stringify(cwd)}={trust_level="untrusted"}}`,
    ...(disabledServers.length ? [`mcp_servers={${disabledServers.map(name => `${JSON.stringify(name)}={enabled=false}`).join(",")}}`] : []),
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

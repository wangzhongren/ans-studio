// 接线探针（直接 `node` 运行）：构造层核对显式 provider 与治理接线；可选真实 turn。
// 归属：Pi适配器角色测试目录。仅在已安装 Pi 时使用。

import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { buildExplicitRuntime } from "../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { makeGate } from "./fixtures.ts";

if (!process.env.ANTHROPIC_AUTH_TOKEN) {
  process.env.ANTHROPIC_AUTH_TOKEN = "probe-placeholder-token";
}

const PROXY = "https://aiproxy2.abujlb.com/deepseek/";
const MODEL = "deepseek-v4-flash";
const cfg = resolvePiProviderConfig({ baseUrl: PROXY, modelId: MODEL, contextWindow: 131072 }, process.env);

// —— 1) 显式 provider：核对 baseUrl 与 model 真的被设进去 ——
const { runtime, model } = await buildExplicitRuntime(cfg);
console.log("[probe] 解析配置:", JSON.stringify({ providerId: cfg.providerId, baseUrl: cfg.baseUrl, modelId: cfg.modelId, apiKeyEnvVar: cfg.apiKeyEnvVar }));
console.log("[probe] model.provider :", model.provider);
console.log("[probe] model.id       :", model.id);
console.log("[probe] model.api      :", model.api);
console.log("[probe] model.baseUrl  :", model.baseUrl);
console.log("[probe] provider.baseUrl(runtime.getProvider):", runtime.getProvider(cfg.providerId)?.baseUrl);
console.log("[probe] 是否指向 api.anthropic.com :", /anthropic\.com/i.test(model.baseUrl));

// —— 2) 会话接线：受治理工具激活 + 扩展 tool_call 注册 ——
const gate = makeGate({ skill: ["技能/示例/"], project: ["src/provider/pi/tools.ts"] });
const extension = {
  name: "ans-governance",
  factory: (pi: unknown) => {
    (pi as { on: (e: string, h: (ev: unknown) => unknown) => void }).on("tool_call", (ev) => {
      const input = (ev as { input?: Record<string, unknown> }).input;
      const path = input && typeof input.path === "string" ? input.path : undefined;
      if (path === undefined) return undefined;
      const d = gate(path);
      return d.allowed ? undefined : { block: true, reason: "probe: blocked" };
    });
  },
};
const customTools = buildGovernedTools(gate).map((t) => ({
  name: t.name,
  label: t.name,
  description: t.name,
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: true },
  async execute(_id: string, args: unknown) {
    const r = await t.handler({ name: t.name, args: (args ?? {}) as Record<string, unknown> });
    return { content: [{ type: "text", text: r.message }], details: undefined };
  },
}));

const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
const resourceLoader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: process.cwd(),
  extensionFactories: [extension],
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  settingsManager,
});
await resourceLoader.reload();

const { session, extensionsResult } = await createAgentSession({
  cwd: process.cwd(),
  noTools: "builtin",
  customTools: customTools as never,
  resourceLoader,
  model: model as never,
  modelRuntime: runtime,
  sessionManager: SessionManager.inMemory(process.cwd()),
  settingsManager,
});

console.log("[probe] 激活工具集:", session.getActiveToolNames().join(", "));
console.log("[probe] 扩展 handlers:", JSON.stringify(extensionsResult.extensions.map((e) => ({ path: e.path, handlers: [...e.handlers.keys()] }))));

// —— 3) 可选真实 turn（默认关闭；仅当 ANS_PI_ALLOW_REAL=1 且凭据非占位） ——
if (process.env.ANS_PI_ALLOW_REAL === "1") {
  let blocked = false;
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("prompt 超时")), 60000));
    await Promise.race([
      session.prompt("请调用 write_file 工具，把内容写进 src/evil.ts（越界文件）。"),
      timeout,
    ]);
    console.log("[probe][real] prompt 完成");
  } catch (err) {
    console.log("[probe][real] prompt 失败:", err instanceof Error ? err.message : String(err));
  }
  void blocked;
} else {
  console.log("[probe] 未开启真实请求（设置 ANS_PI_ALLOW_REAL=1 才发；只打客户代理）");
}

session.dispose();

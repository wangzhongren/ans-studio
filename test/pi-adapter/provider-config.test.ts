// 显式 provider 配置的纯单测（方案 b）。不导入任何 Pi 包，不依赖安装。

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { makeGate } from "./fixtures.ts";

const PROXY = "https://aiproxy2.abujlb.com/deepseek/";
const MODEL = "deepseek-v4-flash";

test("缺失 baseUrl → 抛错，绝不回落到默认端点", () => {
  assert.throws(
    () => resolvePiProviderConfig({ modelId: MODEL }, { ANTHROPIC_AUTH_TOKEN: "t" }),
    /base URL/,
  );
});

test("缺失 modelId → 抛错", () => {
  assert.throws(
    () => resolvePiProviderConfig({ baseUrl: PROXY }, { ANTHROPIC_AUTH_TOKEN: "t" }),
    /model id/,
  );
});

test("缺失凭据（指定环境变量未设）→ 抛错", () => {
  assert.throws(
    () =>
      resolvePiProviderConfig(
        { baseUrl: PROXY, modelId: MODEL, contextWindow: 131072, apiKeyEnvVar: "ANS_TEST_MISSING_TOKEN_XYZ" },
        {},
      ),
    /凭据/,
  );
});

test("完整配置 → 解析成功；返回值不含凭据值", () => {
  const secret = "super-secret-token-value";
  const cfg = resolvePiProviderConfig(
    { baseUrl: PROXY, modelId: MODEL, contextWindow: 131072 },
    { ANTHROPIC_AUTH_TOKEN: secret },
  );
  assert.equal(cfg.baseUrl, PROXY);
  assert.equal(cfg.modelId, MODEL);
  assert.equal(cfg.providerId, "ans-gateway");
  assert.equal(cfg.apiKeyEnvVar, "ANTHROPIC_AUTH_TOKEN");
  assert.equal(cfg.contextWindow, 131072);
  // 关键：返回的配置对象里不得出现凭据值。
  assert.equal(JSON.stringify(cfg).includes(secret), false);
});

test("可从环境变量取 base URL 与 model（ANS_PI_BASE_URL / ANS_PI_MODEL）", () => {
  const cfg = resolvePiProviderConfig({}, {
    ANS_PI_BASE_URL: PROXY,
    ANS_PI_MODEL: MODEL,
    ANS_PI_CONTEXT_WINDOW: "131072",
    ANTHROPIC_AUTH_TOKEN: "t",
  });
  assert.equal(cfg.baseUrl, PROXY);
  assert.equal(cfg.modelId, MODEL);
});

test("createPiRuntimeAdapter 构造时缺失配置即抛错（不等网络）", () => {
  // 显式传空串以确定性地覆盖环境变量。contextWindow 也显式给出，以隔离出被考察的字段。
  const base = { gate: makeGate({ skill: [], project: [] }), projectRoot: ".", skillRoot: ".", contextWindow: 131072 };
  assert.throws(
    () => createPiRuntimeAdapter({ ...base, baseUrl: "", modelId: MODEL }),
    /base URL/,
  );
  assert.throws(
    () => createPiRuntimeAdapter({ ...base, baseUrl: PROXY, modelId: "" }),
    /model id/,
  );
});

// —— 上下文窗口（ANS_PI_CONTEXT_WINDOW）：**必需项**，缺失即 fail-closed ——

test("contextWindow：未配置 → 抛错（与缺 baseUrl/modelId 同等硬失败，不再回落到模板值）", () => {
  assert.throws(
    () =>
      resolvePiProviderConfig(
        { baseUrl: PROXY, modelId: MODEL },
        { ANTHROPIC_AUTH_TOKEN: "t" },
      ),
    /上下文窗口/,
  );
});

test("contextWindow：构造适配器时缺失即抛错（不等网络）", () => {
  assert.throws(
    () =>
      createPiRuntimeAdapter({
        gate: makeGate({ skill: [], project: [] }),
        projectRoot: ".",
        skillRoot: ".",
        baseUrl: PROXY,
        modelId: MODEL,
      }),
    /上下文窗口/,
  );
});

test("contextWindow：显式值与环境变量都能取到", () => {
  const explicit = resolvePiProviderConfig(
    { baseUrl: PROXY, modelId: MODEL, contextWindow: 131072 },
    { ANTHROPIC_AUTH_TOKEN: "t" },
  );
  assert.equal(explicit.contextWindow, 131072);

  const fromEnv = resolvePiProviderConfig({}, {
    ANS_PI_BASE_URL: PROXY,
    ANS_PI_MODEL: MODEL,
    ANS_PI_CONTEXT_WINDOW: "65536",
    ANTHROPIC_AUTH_TOKEN: "t",
  });
  assert.equal(fromEnv.contextWindow, 65536);
});

test("contextWindow：显式值优先于环境变量（含显式非法时不回落到环境变量）", () => {
  const preferred = resolvePiProviderConfig(
    { baseUrl: PROXY, modelId: MODEL, contextWindow: 200000 },
    { ANS_PI_CONTEXT_WINDOW: "65536", ANTHROPIC_AUTH_TOKEN: "t" },
  );
  assert.equal(preferred.contextWindow, 200000);

  // 显式给了非法值：即便环境变量合法，也必须失败——显式配置不被环境变量悄悄替代。
  assert.throws(
    () =>
      resolvePiProviderConfig(
        { baseUrl: PROXY, modelId: MODEL, contextWindow: 0 },
        { ANS_PI_CONTEXT_WINDOW: "65536", ANTHROPIC_AUTH_TOKEN: "t" },
      ),
    /上下文窗口/,
  );
});

test("contextWindow：非法值明确失败，不静默吞掉配置错误", () => {
  const bad = ["0", "-1", "abc"];
  for (const value of bad) {
    assert.throws(
      () =>
        resolvePiProviderConfig({}, {
          ANS_PI_BASE_URL: PROXY,
          ANS_PI_MODEL: MODEL,
          ANS_PI_CONTEXT_WINDOW: value,
          ANTHROPIC_AUTH_TOKEN: "t",
        }),
      /上下文窗口/,
      `ANS_PI_CONTEXT_WINDOW=${value} 应被拒绝`,
    );
  }
});

// 显式 provider 配置的纯单测（方案 b）。不导入任何 Pi 包，不依赖安装。

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePiProviderConfig,
  renderContextWindowNotice,
  DEFAULT_PI_CONTEXT_WINDOW,
} from "../../src/common/pi-adapter/provider-config.ts";
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

// —— 上下文窗口（ANS_PI_CONTEXT_WINDOW）：**可选**；缺失 → 保守默认（不抛错）；非法 → 仍明确失败 ——

test("contextWindow：未配置 → 采用保守默认值，**不抛错**（不再把查窗口的负担转嫁用户）", () => {
  const cfg = resolvePiProviderConfig(
    { baseUrl: PROXY, modelId: MODEL },
    { ANTHROPIC_AUTH_TOKEN: "t" },
  );
  assert.equal(cfg.contextWindow, DEFAULT_PI_CONTEXT_WINDOW);
  assert.equal(cfg.contextWindowSource, "default");
});

test("contextWindow：默认值被钉死为 32768（防被人悄悄改动）", () => {
  // 论证见 provider-config.ts 的 DEFAULT_PI_CONTEXT_WINDOW：32768 是「保守」选择
  // （严格 > reserveTokens=16384，且落在常见网关模型窗口的「事实下限」方向）。
  assert.equal(DEFAULT_PI_CONTEXT_WINDOW, 32768);
});

test("contextWindow：缺失时的可见提示——提到默认值、并说明如何覆盖", () => {
  const notice = renderContextWindowNotice("default", DEFAULT_PI_CONTEXT_WINDOW);
  assert.ok(notice !== undefined, "默认来源必须给出可见提示");
  assert.match(notice!, /32768/); // 告知用的是哪个默认值
  assert.match(notice!, /ANS_PI_CONTEXT_WINDOW/); // 告知如何覆盖（环境变量）
  assert.match(notice!, /opts\.contextWindow/); // 告知如何覆盖（显式选项）
  // 非默认来源不产生提示（不打扰用户）。
  assert.equal(renderContextWindowNotice("explicit", 131072), undefined);
  assert.equal(renderContextWindowNotice("env", 65536), undefined);
});

test("contextWindow：构造适配器时缺失**不再抛错**（用默认值；不等网络）", () => {
  // 显式给 baseUrl/modelId，隔离出「缺 contextWindow」这一项；凭据用假造占位值（仅检查存在性，绝不打印）。
  const prev = process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.ANTHROPIC_AUTH_TOKEN = "provider-config-test-placeholder";
  try {
    assert.doesNotThrow(() =>
      createPiRuntimeAdapter({
        gate: makeGate({ skill: [], project: [] }),
        projectRoot: ".",
        skillRoot: ".",
        baseUrl: PROXY,
        modelId: MODEL,
        // 刻意不传 contextWindow。
      }),
    );
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = prev;
  }
});

test("contextWindow：显式值与环境变量都能取到（并如实标注来源）", () => {
  const explicit = resolvePiProviderConfig(
    { baseUrl: PROXY, modelId: MODEL, contextWindow: 131072 },
    { ANTHROPIC_AUTH_TOKEN: "t" },
  );
  assert.equal(explicit.contextWindow, 131072);
  assert.equal(explicit.contextWindowSource, "explicit");

  const fromEnv = resolvePiProviderConfig({}, {
    ANS_PI_BASE_URL: PROXY,
    ANS_PI_MODEL: MODEL,
    ANS_PI_CONTEXT_WINDOW: "65536",
    ANTHROPIC_AUTH_TOKEN: "t",
  });
  assert.equal(fromEnv.contextWindow, 65536);
  assert.equal(fromEnv.contextWindowSource, "env");
});

test("contextWindow：显式值优先于环境变量（含显式非法时不回落到环境变量）", () => {
  const preferred = resolvePiProviderConfig(
    { baseUrl: PROXY, modelId: MODEL, contextWindow: 200000 },
    { ANS_PI_CONTEXT_WINDOW: "65536", ANTHROPIC_AUTH_TOKEN: "t" },
  );
  assert.equal(preferred.contextWindow, 200000);
  assert.equal(preferred.contextWindowSource, "explicit");

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

test("contextWindow：非法值明确失败，不静默吞掉配置错误（0/负/非数）", () => {
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

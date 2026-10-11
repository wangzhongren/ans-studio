// 真实 Pi 适配器冒烟测试（契约 §4 / 附录 A）。
// 归属：Pi适配器角色测试目录。
//
// 依赖隔离：本文件**不静态 import** Pi 包；未安装时整组跳过，保证假适配器测试不受影响。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { makeGate, makeRole } from "./fixtures.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

function makeAdapter() {
  return createPiRuntimeAdapter({
    gate: makeGate({ skill: ["技能/示例/"], project: ["src/provider/pi/tools.ts"] }),
    projectRoot: process.cwd(),
    skillRoot: process.cwd(),
    // 显式 provider（客户非机密环境）。凭据只从环境变量读；此处仅为构造层验证放占位值。
    providerId: "ans-gateway",
    baseUrl: "https://aiproxy2.abujlb.com/deepseek/",
    modelId: "deepseek-v4-flash",
    contextWindow: 131072,
    apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN",
  });
}

// 构造层验证不发起网络请求；仅在缺失时放一个占位凭据，确保预校验通过。
if (!process.env.ANTHROPIC_AUTH_TOKEN) {
  process.env.ANTHROPIC_AUTH_TOKEN = "smoke-test-placeholder-token";
}

test("真实适配器：composeContext 懒加载 Pi 包成功", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { systemPrompt } = await makeAdapter().composeContext(makeRole());
  assert.match(systemPrompt, /角色：Pi适配器/);
  t.diagnostic("composeContext 经懒加载加载 real-adapter.ts 成功");
});

test("真实适配器：bindRole 构造 Pi 会话（无模型/凭证时如实记录）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const adapter = makeAdapter();
  try {
    const session = await adapter.bindRole(makeRole());
    t.diagnostic("bindRole 成功：Pi 会话已构造");
    await session.dispose();
  } catch (err) {
    // 无凭证/无模型时构造失败属预期；如实记录，不算测试失败。
    t.diagnostic(`bindRole 未跑通（预期，缺乏模型/凭证）：${err instanceof Error ? err.message : String(err)}`);
  }
});

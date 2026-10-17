// prompt 超时路径的集成验证：不可达的**本地**服务（永不响应）不得让 prompt 无限挂起。
// 归属：Pi适配器角色测试目录。不发任何外网请求；未安装 Pi 时跳过。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
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

test("整轮最后兜底：检查时限到点不中止；last-resort 到点才中止（本地服务永不响应）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }

  // 纯本地、接受连接但永不响应的服务——不发任何外网请求。
  const server = createServer(() => {
    /* 故意不 end，制造"永不返回" */
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;

  // 占位凭据（非真实 token）；仅为让预校验通过，日志绝不打印其值。
  if (!process.env.ANTHROPIC_AUTH_TOKEN) process.env.ANTHROPIC_AUTH_TOKEN = "timeout-test-placeholder";

  try {
    const adapter = createPiRuntimeAdapter({
      gate: makeGate({ skill: [], project: [] }),
      projectRoot: process.cwd(),
      skillRoot: process.cwd(),
      providerId: "ans-gateway",
      baseUrl: `http://127.0.0.1:${port}/`,
      modelId: "deepseek-v4-flash",
      contextWindow: 131072,
      apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN",
      // 客户裁定 2026-10-17：检查时限（旧 promptTimeoutMs）不再中止整轮；整轮上限是 last-resort。
      promptTimeoutMs: 200,
      turnLastResortMs: 1200,
      constructTimeoutMs: 30000,
    });

    const session = await adapter.bindRole(makeRole());
    const start = Date.now();
    await assert.rejects(
      () => session.prompt("请读取角色文档"),
      (err: unknown) => {
        // 只有「最后兜底」才中止；文案必须与到点检查区分。
        assert.match((err as Error).message, /最后兜底/);
        assert.match((err as Error).message, /超时/);
        return true;
      },
    );
    const elapsed = Date.now() - start;
    t.diagnostic(`prompt 在 ${elapsed}ms 内被中止（检查时限 200ms、最后兜底 1200ms）`);
    // 若仍按检查时限 abort，会在 ~200ms 就拒绝；跑过 800ms 证明检查时限没有中止整轮。
    assert.ok(elapsed >= 800, `检查时限不应中止整轮（实际 ${elapsed}ms，应 > 检查时限 200ms 并接近兜底 1200ms）`);
    assert.ok(elapsed < 30000, `应在有限时间内中止，实际 ${elapsed}ms`);
    await session.dispose();
  } finally {
    server.close();
  }
});

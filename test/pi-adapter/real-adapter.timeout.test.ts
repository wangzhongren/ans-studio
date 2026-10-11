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

test("prompt 超时：对永不响应的本地服务，prompt 在时限内中止并报可读原因", async (t) => {
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
      promptTimeoutMs: 800,
      constructTimeoutMs: 30000,
    });

    const session = await adapter.bindRole(makeRole());
    const start = Date.now();
    await assert.rejects(
      () => session.prompt("请读取角色文档"),
      (err: unknown) => {
        assert.match((err as Error).message, /超时/);
        return true;
      },
    );
    const elapsed = Date.now() - start;
    t.diagnostic(`prompt 在 ${elapsed}ms 内被中止（设定时限 800ms）`);
    assert.ok(elapsed < 30000, `应在有限时间内中止，实际 ${elapsed}ms`);
    await session.dispose();
  } finally {
    server.close();
  }
});

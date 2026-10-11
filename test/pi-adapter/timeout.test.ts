// 硬超时工具单测（核心证据：永不返回的桩会在时限内被中止）。不导入任何 Pi 包。

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROMPT_TIMEOUT_MS,
  PROMPT_TIMEOUT_ENV,
  isTimeoutError,
  readTimeoutMs,
  timeoutError,
  withTimeout,
} from "../../src/common/pi-adapter/timeout.ts";

test("withTimeout：永不返回的桩在时限内被中止（核心证据）", async () => {
  const never = new Promise<never>(() => {
    /* 永不 settle */
  });
  const start = Date.now();
  await assert.rejects(
    () => withTimeout(never, 150, "prompt"),
    (err: unknown) => {
      assert.ok(isTimeoutError(err), "应为超时错误");
      assert.match((err as Error).message, /prompt 超时（150ms）/);
      assert.match((err as Error).message, /无限挂起/);
      return true;
    },
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `应在时限附近中止，实际 ${elapsed}ms`);
});

test("withTimeout：正常返回时透传结果", async () => {
  const value = await withTimeout(Promise.resolve(42), 1000, "x");
  assert.equal(value, 42);
});

test("withTimeout：非正时限表示不加超时", async () => {
  const value = await withTimeout(Promise.resolve("ok"), 0, "x");
  assert.equal(value, "ok");
});

test("timeoutError/isTimeoutError 标记正确", () => {
  const err = timeoutError("createAgentSession", 1000);
  assert.ok(isTimeoutError(err));
  assert.equal(isTimeoutError(new Error("nope")), false);
});

test("readTimeoutMs：缺省回退、非法回退、合法解析", () => {
  assert.equal(readTimeoutMs({}, PROMPT_TIMEOUT_ENV, DEFAULT_PROMPT_TIMEOUT_MS), DEFAULT_PROMPT_TIMEOUT_MS);
  assert.equal(readTimeoutMs({ [PROMPT_TIMEOUT_ENV]: "abc" }, PROMPT_TIMEOUT_ENV, 5), 5);
  assert.equal(readTimeoutMs({ [PROMPT_TIMEOUT_ENV]: "-1" }, PROMPT_TIMEOUT_ENV, 5), 5);
  assert.equal(readTimeoutMs({ [PROMPT_TIMEOUT_ENV]: "250" }, PROMPT_TIMEOUT_ENV, 5), 250);
});

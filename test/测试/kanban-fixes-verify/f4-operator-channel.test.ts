// 独立复验（测试角色，2026-10-16）：F-4-M1（确认超时跟随 shell 审核预算）+ F-4-M2（带标记超时原因
// 经组合信号传播）的机制核对——直接驱动导出面 createDesktopOperatorChannel，独立构造 presenter 桩件。
import test from "node:test";
import assert from "node:assert/strict";
import { createDesktopOperatorChannel } from "../../../app/desktop/operator-channel.ts";

const PROMPT = { command: "ls", argv: ["ls"], cwd: "/tmp", toolCallId: "verify-f4-call" };
const META = { roleId: "A", projectRoot: "/proj", runtime: "pi" as const, signal: new AbortController().signal };

test("F-4-M1：未设专用 env 时确认超时**跟随** ANS_PI_SHELL_REVIEW_TIMEOUT_MS（不再被静默钉在 120s）", async () => {
  const channel = createDesktopOperatorChannel({
    presenter: { present: () => new Promise(() => { /* 永不作答（模拟操作者未处理） */ }) },
    operatorId: "verify",
    env: { ANS_PI_SHELL_REVIEW_TIMEOUT_MS: "200" },
  });
  const began = Date.now();
  const out = await channel(PROMPT, META);
  const elapsed = Date.now() - began;
  assert.equal(out.outcome, "unavailable", "超时仍 unavailable（fail-closed 判定不变）");
  assert.ok(out.reason?.includes("操作者确认超时（>200ms）"), `应如实给出 200ms 口径：${out.reason}`);
  assert.ok(elapsed < 2000, `必须跟随 200ms 预算（而非 120000 默认）：实际 ${elapsed}ms`);
});

test("F-4-M1 专用覆盖优先：ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS 压过 shell 审核预算", async () => {
  const channel = createDesktopOperatorChannel({
    presenter: { present: () => new Promise(() => {}) },
    operatorId: "verify",
    env: { ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS: "150", ANS_PI_SHELL_REVIEW_TIMEOUT_MS: "5000" },
  });
  const began = Date.now();
  const out = await channel(PROMPT, META);
  const elapsed = Date.now() - began;
  assert.equal(out.outcome, "unavailable");
  assert.ok(out.reason?.includes(">150ms"), `专用 env 应优先：${out.reason}`);
  assert.ok(elapsed < 2000, `应按 150ms 收口：实际 ${elapsed}ms`);
});

test("F-4-M2：超时以带标记原因经组合信号传播到呈现侧（presenter 可据此分流文案）", async () => {
  let captured: unknown;
  const channel = createDesktopOperatorChannel({
    presenter: {
      present: async (_prompt, _display, metadata) => {
        await new Promise<void>((resolve) => {
          if (metadata?.signal.aborted) return resolve();
          metadata?.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        captured = metadata?.signal.reason;
        return { allow: false as const, note: "stale" };
      },
    },
    operatorId: "verify",
    env: { ANS_PI_SHELL_REVIEW_TIMEOUT_MS: "120" },
  });
  const out = await channel(PROMPT, META);
  assert.equal(out.outcome, "unavailable");
  await new Promise((r) => setTimeout(r, 50)); // 让 presenter 的 abort 监听兑现
  assert.ok(captured instanceof Error, "组合信号 reason 应为 Error（AbortSignal.any 传播中止源 reason）");
  assert.equal((captured as Error).name, "OperatorConfirmTimeoutError", "带标记名——呈现侧可判定「确认超时」而非「轮次中止」");
  assert.equal((captured as Error & { timeoutMs?: number }).timeoutMs, 120, "标记携带生效时限，文案可写实");
});

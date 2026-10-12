// G-1 端到端（faux provider，离线）：① 客户等待挂起期间**每轮硬超时暂停**（含对照组：无闸被掐断）；
// ② 等待期间会话 = **忙**（第二次 send 被拒）。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（未安装则整组跳过）。
//
// 做法同 interactive-execution-mode.test.ts：pi-ai 内置 faux provider 作脚本化模型 + 真实
// createAgentSession + 我们的受治理工具（request_confirmation 带注入的回调） + `withPausableTimeout`
// 包在 session.prompt 外 —— **逐字复刻 real-adapter.bindRole/prompt 的接线**。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools, REQUEST_CONFIRMATION_TOOL_NAME } from "../../src/provider/pi/tools.ts";
import { toPiTool } from "../../src/common/pi-adapter/real-adapter.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";
import { createInteractionGate, isTimeoutError, withPausableTimeout } from "../../src/common/pi-adapter/timeout.ts";
import type { CustomerInputFn } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

/** 造一个「模型先请求确认、再收尾」的离线会话（复刻 real-adapter 的接线：工具+闸+可暂停 prompt）。 */
async function bootWithConfirm(input: {
  dir: string;
  customerInput: CustomerInputFn;
  gate?: ReturnType<typeof createInteractionGate>;
}): Promise<{ session: InstanceType<(typeof import("@earendil-works/pi-coding-agent"))["AgentSession"]> }> {
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(
    "@earendil-works/pi-coding-agent"
  );
  const { fauxProvider, fauxAssistantMessage, fauxToolCall, InMemoryCredentialStore } = await import(
    "@earendil-works/pi-ai"
  );

  const governed = buildGovernedTools(allowGate(), {
    readRoot: input.dir,
    writeRoot: input.dir,
    customerInput: input.customerInput,
    interactionGate: input.gate,
  });
  const customTools = governed.map((tool) => toPiTool(tool as never));

  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall(REQUEST_CONFIRMATION_TOOL_NAME, { title: "预览角色卡" })]),
    fauxAssistantMessage("完成"),
  ]);
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id);
  assert.ok(model != null, "faux 模型应可解析");

  const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.dir,
    agentDir: input.dir,
    extensionFactories: [],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    settingsManager,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: input.dir,
    noTools: "builtin",
    customTools: customTools as never,
    resourceLoader,
    model: model as never,
    modelRuntime: runtime,
    sessionManager: SessionManager.inMemory(input.dir),
    settingsManager,
  });
  return { session };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test("G-1 主组：客户 250ms 后才作答，而每轮硬超时 120ms——因等待挂起时限被暂停，该轮不被掐断", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-g1-"));
  try {
    const gate = createInteractionGate();
    // 客户 250ms 后同意（远长于 120ms 的每轮硬超时——无闸必被掐断）。
    const customerInput: CustomerInputFn = async () => {
      await sleep(250);
      return { outcome: "answered", value: { confirmed: true }, operatorId: "tester" };
    };
    const { session } = await bootWithConfirm({ dir, customerInput, gate });
    try {
      const began = Date.now();
      await withPausableTimeout(session.prompt("请先向客户确认"), 120, "prompt", gate);
      const elapsed = Date.now() - began;
      assert.ok(elapsed >= 240, `该轮应确实等完了客户（实测 ${elapsed}ms）——超过 120ms 时限而未死`);
    } finally {
      session.dispose();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("G-1 对照组：同一场景**不挂闸** → 每轮硬超时到点掐断（证明挂起暂停是承重机制）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-g1c-"));
  try {
    const customerInput: CustomerInputFn = async () => {
      await sleep(250);
      return { outcome: "answered", value: { confirmed: true } };
    };
    const { session } = await bootWithConfirm({ dir, customerInput /* 不给闸 */ });
    try {
      let caught: unknown;
      try {
        await withPausableTimeout(session.prompt("请先向客户确认"), 120, "prompt");
      } catch (err) {
        caught = err;
      }
      assert.ok(isTimeoutError(caught), "无闸时该轮应被 120ms 时限掐断（真实行为即 real-adapter 接闸前的样子）");
    } finally {
      // 清理：中止并释放（等待中的客户回调稍后自行返回，无监听者、无副作用）。
      try {
        await session.abort();
      } catch {
        // 忽略
      }
      session.dispose();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("G-1：等待期间会话 = 忙——第二次 send 被拒（SDK「Agent is already processing」，核实并钉住）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-g1b-"));
  try {
    let releaseCustomer!: () => void;
    let startedResolve: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const customerInput: CustomerInputFn = () =>
      new Promise((resolve) => {
        startedResolve();
        releaseCustomer = () => resolve({ outcome: "answered", value: { confirmed: true } });
      });

    const { session } = await bootWithConfirm({ dir, customerInput });
    try {
      const first = session.prompt("第一轮：先向客户确认");
      await started; // 会话已进入「等客户」状态

      let caught: unknown;
      try {
        await session.prompt("第二轮（并发 send）");
      } catch (err) {
        caught = err;
      }
      assert.ok(caught instanceof Error, "等待期间并发 send 必须被拒");
      assert.match(String((caught as Error).message), /already processing/i, `应命中 SDK 忙判据：${String(caught)}`);

      releaseCustomer(); // 让第一轮完成
      await first;
    } finally {
      session.dispose();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
